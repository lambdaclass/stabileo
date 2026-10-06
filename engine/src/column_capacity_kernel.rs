//! Batched rectangular-column strain compatibility for station verification.
//! Matches the existing TS arithmetic, axial sign, phi law and stopping rule.
//! Code coefficients/section data arrive from the caller; decimal presentation
//! rounding stays in TS so JS `toFixed` semantics remain unchanged.
use wasm_bindgen::prelude::*;

fn solve_batch(constants: &[f64], bars: &[f64], loads: &[f64]) -> Result<Vec<f64>, &'static str> {
    if constants.len() != 8
        || bars.len() % 2 != 0
        || constants
            .iter()
            .chain(bars)
            .chain(loads)
            .any(|v| !v.is_finite())
    {
        return Err("Invalid column capacity buffers");
    }
    let [depth, width, fc, fy_kpa, fy, beta, axial_cap, alpha]: [f64; 8] =
        constants.try_into().unwrap();
    if depth <= 0.
        || width <= 0.
        || fc <= 0.
        || fy_kpa <= 0.
        || fy <= 0.
        || beta <= 0.
        || alpha <= 0.
        || bars.chunks_exact(2).any(|b| b[1] < 0.)
    {
        return Err("Invalid column capacity section");
    }
    let eps_y = fy / 200000.;
    let eps_tc = eps_y + 0.003;
    let phi = |eps: f64| {
        if eps >= eps_tc {
            0.9
        } else if eps >= eps_y {
            0.65 + 0.25 * (eps - eps_y) / (eps_tc - eps_y)
        } else {
            0.65
        }
    };
    let section_forces = |c: f64| {
        let a = (beta * c).min(depth);
        let cc = alpha * fc * a * width;
        let (mut ns, mut ms, mut eps_min) = (0., 0., 0.0_f64);
        for bar in bars.chunks_exact(2) {
            let eps = if c > 0.001 {
                0.003 * (c - bar[0]) / c
            } else {
                0.
            };
            let sign = if eps > 0. {
                1.
            } else if eps < 0. {
                -1.
            } else {
                eps
            };
            let fs = sign * (200000000. * eps.abs()).min(fy_kpa);
            let fs_net = if bar[0] <= a { fs - alpha * fc } else { fs };
            let force = bar[1] * fs_net;
            ns += force;
            ms += force * (depth / 2. - bar[0]);
            if eps < eps_min {
                eps_min = eps;
            }
        }
        let mc = cc * (depth / 2. - a / 2.);
        (cc + ns, mc + ms, eps_min.abs())
    };
    let tension_cap = -0.9 * fy_kpa * bars.chunks_exact(2).map(|b| b[1]).sum::<f64>();
    let mut out = Vec::with_capacity(loads.len() * 3);
    for &load in loads {
        let (mut lo, mut hi) = (0.001, depth * 5.);
        let target = load.min(axial_cap);
        for _ in 0..60 {
            let mid = (lo + hi) / 2.;
            let (n, _, eps) = section_forces(mid);
            if phi(eps) * n < target {
                lo = mid;
            } else {
                hi = mid;
            }
            if (hi - lo).abs() < 1e-5 {
                break;
            }
        }
        let c = (lo + hi) / 2.;
        let (_, m, eps) = section_forces(c);
        out.extend_from_slice(&[phi(eps) * m.abs(), tension_cap, c]);
    }
    Ok(out)
}

/// constants: [depth, width, fc_kPa, fy_kPa, fy_MPa, beta1, phiPn, alpha1].
/// bars: [depth_from_compression_face, area_m2] per bar; loads: signed kN,
/// compression positive. Returns [phiMn, phiPtMax, unrounded_c] per load.
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
                &batch[i * 3..i * 3 + 3],
                solve_batch(&c, &b, &[load]).unwrap()
            );
            assert_eq!(
                batch[i * 3 + 1],
                -0.9 * 420000. * b.chunks_exact(2).map(|b| b[1]).sum::<f64>()
            );
        }
        assert_ne!(batch[3], batch[9]);
        assert!(batch[2] > batch[11]);
        assert!(solve_batch(&c, &b, &[]).unwrap().is_empty());
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
