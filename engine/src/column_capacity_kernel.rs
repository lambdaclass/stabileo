//! Batched rectangular-column capacity for station verification: the design moment at the
//! design axial force, through the CIRSOC 201 section engine (`postprocess::cirsoc201_section`),
//! so the station verifier, the legacy designer's gate and the calculator read one
//! implementation. Decimal presentation rounding stays in TS.
use wasm_bindgen::prelude::*;

use crate::postprocess::cirsoc201_check::Cirsoc201Edition;
use crate::postprocess::cirsoc201_section::{Confinement, Section, SectionCode};

fn solve_batch(constants: &[f64], bars: &[f64], loads: &[f64]) -> Result<Vec<f64>, &'static str> {
    if !(constants.len() == 8 || constants.len() == 9)
        || bars.len() % 2 != 0
        || constants.iter().chain(bars).chain(loads).any(|v| !v.is_finite())
    {
        return Err("Invalid column capacity buffers");
    }
    let (depth, width, fc_kpa, fy_kpa, fy, beta, axial_cap, alpha) =
        (constants[0], constants[1], constants[2], constants[3], constants[4], constants[5], constants[6], constants[7]);
    if depth <= 0. || width <= 0. || fc_kpa <= 0. || fy_kpa <= 0. || fy <= 0. || beta <= 0. || alpha <= 0.
        || bars.chunks_exact(2).any(|b| b[1] < 0.)
    {
        return Err("Invalid column capacity section");
    }
    // The ninth constant names the edition (2005 | 2025); absent, 2025.
    let edition = match constants.get(8) {
        None => Cirsoc201Edition::E2025,
        Some(&e) => crate::rc_section_kernel::edition_of(e)?,
    };
    // One implementation: the CIRSOC 201 section engine, on the rectangle with the bars at their
    // depths from the compressed face (x is irrelevant to bending about this axis).
    let (hx, hy) = (width / 2.0, depth / 2.0);
    let rings = vec![vec![[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]];
    let section_bars = bars.chunks_exact(2).map(|b| [0.0, hy - b[0], b[1]]).collect();
    let code = SectionCode {
        fc: fc_kpa * 1e3,
        fy: fy_kpa * 1e3,
        es: 200e9,
        edition,
        confinement: Confinement::Ties,
        deduct_displaced_concrete: true,
    };
    let section = Section::new(rings, section_bars, code)?;
    // The caller's cap (kN) is the engine's own for ties; the smaller one binds.
    let cap = (axial_cap * 1e3).min(section.axial_cap());
    // φ·Pnt,max = 0,90·fy·Ast (22.4.3.1), kN.
    let tension_cap = -0.9 * fy_kpa * bars.chunks_exact(2).map(|b| b[1]).sum::<f64>();
    // The moments this checks arrive as magnitudes, so the section must carry either sign: the
    // weaker one governs. Six bars put the extra one on one face only, and 30×30 6Ø20 at 100 kN
    // carries 101.6 kN·m with that face in tension but 78.6 with it in compression. A layout
    // symmetric about the bending axis is the same both ways: one solve, as before.
    // (Bar by bar, as a multiset: three bars at the bottom and two at the top are not symmetric.)
    let sorted = |mirror: bool| {
        let mut v: Vec<(i64, f64)> = bars
            .chunks_exact(2)
            .map(|b| (((if mirror { depth - b[0] } else { b[0] }) * 1e9).round() as i64, b[1]))
            .collect();
        v.sort_by(|p, q| p.0.cmp(&q.0).then(p.1.total_cmp(&q.1)));
        v
    };
    let symmetric = sorted(false)
        .iter()
        .zip(sorted(true))
        .all(|(p, q)| p.0 == q.0 && (p.1 - q.1).abs() < 1e-12);
    let directions: &[f64] = if symmetric { &[1.0] } else { &[1.0, -1.0] };
    let mut out = Vec::with_capacity(loads.len() * 4);
    for &load in loads {
        // At or above the cap the plateau's widest point, where φ·Pn first reaches it.
        let target = (load * 1e3).min(cap * (1.0 - 1e-12));
        // (φMn, c, direction) of the weaker sign; a sign that cannot carry the load at all governs.
        let mut governing: Option<(f64, f64, f64)> = None;
        for &dir in directions {
            let (mn, c) = match section.at_axial(0.0, dir, target) {
                Some(p) => (p.s.phi_mnx.abs() / 1e3, p.c),
                None => (0.0, f64::NAN),
            };
            if governing.is_none_or(|(g, _, _)| mn < g) {
                governing = Some((mn, c, dir));
            }
        }
        let (mn, c, dir) = governing.expect("at least one direction");
        out.extend_from_slice(&[mn, tension_cap, c, dir]);
    }
    Ok(out)
}

/// constants: [depth, width, fc_kPa, fy_kPa, fy_MPa, beta1, phiPn, alpha1, (edition)].
/// bars: [depth_from_compression_face, area_m2] per bar; loads: signed kN,
/// compression positive. Returns [phiMn, phiPtMax, unrounded_c, face] per load, the
/// weaker of the two moment signs: face +1 when the face the depths are measured from is
/// the compressed one, −1 when the opposite face is (c is then measured from that face).
#[wasm_bindgen]
pub fn solve_column_capacity_batch(
    constants: &[f64],
    bars: &[f64],
    loads: &[f64],
) -> Result<Vec<f64>, JsValue> {
    solve_batch(constants, bars, loads).map_err(|e| JsValue::from_str(e))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> ([f64; 8], Vec<f64>) {
        let area = 8. * 2.01e-4;
        (
            [
                0.3,
                0.3,
                25000.,
                420000.,
                420.,
                0.85,
                0.65 * 0.80 * (0.85 * 25000. * (0.09 - area) + 420000. * area),
                0.85,
            ],
            (0..8)
                .flat_map(|i| [if i < 4 { 0.045 } else { 0.255 }, 2.01e-4])
                .collect(),
        )
    }
    #[test]
    fn batches_preserve_signed_loads_and_order() {
        let (c, b) = fixture();
        let loads = [1200., -400., 0., 400., 1200.];
        let batch = solve_batch(&c, &b, &loads).unwrap();
        for (i, &load) in loads.iter().enumerate() {
            assert_eq!(
                &batch[i * 4..i * 4 + 4],
                solve_batch(&c, &b, &[load]).unwrap()
            );
            assert_eq!(
                batch[i * 4 + 1],
                -0.9 * 420000. * b.chunks_exact(2).map(|b| b[1]).sum::<f64>()
            );
        }
        assert_ne!(batch[4], batch[12]);
        assert!(batch[2] > batch[14]);
        assert!(solve_batch(&c, &b, &[]).unwrap().is_empty());
    }
    /// The single solve the kernel made before it read both signs: +y compressed.
    fn one_sign(c: &[f64; 8], bars: &[f64], load: f64) -> [f64; 3] {
        let (hx, hy) = (c[1] / 2.0, c[0] / 2.0);
        let rings = vec![vec![[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]];
        let code = SectionCode { fc: c[2] * 1e3, fy: c[3] * 1e3, es: 200e9, edition: Cirsoc201Edition::E2025,
            confinement: Confinement::Ties, deduct_displaced_concrete: true };
        let section = Section::new(rings, bars.chunks_exact(2).map(|b| [0.0, hy - b[0], b[1]]).collect(), code).unwrap();
        let cap = (c[6] * 1e3).min(section.axial_cap());
        let tension_cap = -0.9 * c[3] * bars.chunks_exact(2).map(|b| b[1]).sum::<f64>();
        match section.at_axial(0.0, 1.0, (load * 1e3).min(cap * (1.0 - 1e-12))) {
            Some(p) => [p.s.phi_mnx.abs() / 1e3, tension_cap, p.c],
            None => [0.0, tension_cap, f64::NAN],
        }
    }
    /// 30×30, f'c 25, fy 420, six Ø20 as the designer lays them out: three at the bottom, two
    /// at the top and one at mid-depth.
    fn six_bars(flipped: bool) -> ([f64; 8], Vec<f64>) {
        let (c, _) = fixture();
        let area = 3.14e-4;
        let depths = [0.045, 0.045, 0.255, 0.255, 0.255, 0.15];
        let bars = depths.iter().flat_map(|&d| [if flipped { 0.3 - d } else { d }, area]).collect();
        let mut c = c;
        c[6] = 0.65 * 0.80 * (0.85 * 25000. * (0.09 - 6. * area) + 420000. * 6. * area);
        (c, bars)
    }
    #[test]
    fn either_moment_sign_the_weaker_governs() {
        let (c, bars) = six_bars(false);
        let out = solve_batch(&c, &bars, &[100.]).unwrap();
        // With the top compressed the three bottom bars are in tension: the stronger sign.
        let top = one_sign(&c, &bars, 100.)[0];
        let (cf, flipped) = six_bars(true);
        let bottom = one_sign(&cf, &flipped, 100.)[0];
        assert!(top > 1.25 * bottom, "{top} vs {bottom}");
        assert!((out[0] - bottom).abs() < 1e-6 * bottom, "{} vs {bottom}", out[0]);
        assert_eq!(out[3], -1.0);
        let back = solve_batch(&cf, &flipped, &[100.]).unwrap();
        assert!((back[0] - out[0]).abs() < 1e-6 * out[0]);
        assert_eq!(back[3], 1.0);
        // Across the diagram, never more than either sign carries.
        for load in [-1500., -400., 0., 100., 600., 1200., 2000.] {
            let both = solve_batch(&c, &bars, &[load]).unwrap();
            let weaker = one_sign(&c, &bars, load)[0].min(one_sign(&cf, &flipped, load)[0]);
            assert!((both[0] - weaker).abs() <= 1e-6 * weaker.max(1.0), "{load}: {} vs {weaker}", both[0]);
        }
    }
    #[test]
    fn symmetric_layouts_are_solved_once_exactly_as_before() {
        let (c, b) = fixture();
        for load in [-1200., -400., 0., 0.01, 400., 1200., 2500., 1e6] {
            let out = solve_batch(&c, &b, &[load]).unwrap();
            let before = one_sign(&c, &b, load);
            assert_eq!(out[0].to_bits(), before[0].to_bits(), "{load}");
            assert_eq!(out[1].to_bits(), before[1].to_bits());
            assert!(out[2].to_bits() == before[2].to_bits() || (out[2].is_nan() && before[2].is_nan()));
            assert_eq!(out[3], 1.0);
        }
    }
    #[test]
    fn rejects_malformed_and_nonfinite_buffers() {
        let (c, b) = fixture();
        assert!(solve_batch(&c[..7], &b, &[0.]).is_err());
        assert!(solve_batch(&c, &b[..3], &[0.]).is_err());
        for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(solve_batch(&c, &b, &[value]).is_err());
            let mut invalid = c;
            invalid[0] = value;
            assert!(solve_batch(&invalid, &b, &[0.]).is_err());
            let mut invalid = b.clone();
            invalid[0] = value;
            assert!(solve_batch(&c, &invalid, &[0.]).is_err());
        }
        let mut invalid = c;
        invalid[0] = 0.;
        assert!(solve_batch(&invalid, &b, &[0.]).is_err());
    }
}
