//! Sizing against the CIRSOC 201 beam check: the least steel the checker passes.
//!
//! The legacy designer (`web/.../cirsoc201.ts` `checkFlexure`) and the slab designer used to size
//! with their own closed forms (ρ from the quadratic with φ = 0,90, a doubly-reinforced branch
//! anchored at εt = 4 ‰ with the compression steel assumed to yield) and then check with a
//! different set of formulas. Here the requirement is found by searching the checker itself
//! (`cirsoc201_check::nominal_flexure_axial`, φ from Tabla 21.2.2, the ductility floor of
//! 9.3.3.1 [10.3.5]), so a sized section passes the check by construction, and the result is
//! confirmed by running the check once more on the answer.
//!
//! Singly reinforced first: the least tension steel (scanned, then bisected: φ·Mn is not monotone
//! in As in the transition zone) that gives φ·Mn ≥ Mu while εt stays at or above the ductility limit (when the clause applies: Mu > 0 and Pu < 0,10·f'c·Ag). If the most steel the
//! limit allows is not enough, compression steel As' at d' is added: for each As' the tension
//! steel is the most the limit allows, and As' is the least that reaches Mu.

use crate::postprocess::cirsoc201_check::{
    ductility_strain, gross_area, nominal_flexure_axial, phi_flexure, Cirsoc201MemberData,
};

/// How the requirement was met.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlexureDesignKind {
    Singly = 0,
    Doubly = 1,
    /// No steel within the search bounds satisfies the check: the section is too small.
    Impossible = 2,
}

#[derive(Debug, Clone, Copy)]
pub struct FlexureDesign {
    pub kind: FlexureDesignKind,
    /// Required tension and compression steel (m²).
    pub as_t: f64,
    pub as_c: f64,
    /// State of the checked section at the requirement.
    pub phi_mn: f64,
    pub phi: f64,
    pub c: f64,
    pub a: f64,
    pub epsilon_t: f64,
    /// Least εt the ductility clause asks for (0 when it does not apply).
    pub epsilon_t_min: f64,
}

/// (φ·Mn, εt, φ, c, a) of `m` with tension steel `as_t` and compression steel `as_c`, under
/// `nu` (N, compression +). None where the section has no flexural strength (no equilibrium).
fn strength(m: &Cirsoc201MemberData, as_t: f64, as_c: f64, nu: f64) -> Option<(f64, f64, f64, f64, f64)> {
    let mut t = m.clone();
    t.as_tension = as_t;
    t.as_compression = if as_c > 0.0 { Some(as_c) } else { None };
    let es = t.es.unwrap_or(200e9);
    let f = nominal_flexure_axial(&t, nu)?;
    let phi = phi_flexure(t.edition, f.epsilon_t, t.fy, es);
    let pm = phi * f.mn;
    if pm.is_finite() { Some((pm, f.epsilon_t, phi, f.c, f.a)) } else { None }
}

/// Bisection for the least x in [lo, hi] with `ok(x)`, given `ok(hi)` and monotone `ok`.
fn least(lo: f64, hi: f64, ok: impl Fn(f64) -> bool) -> f64 {
    let (mut lo, mut hi) = (lo, hi);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if mid <= lo || mid >= hi || (hi - lo) <= 1e-12 * hi {
            break;
        }
        if ok(mid) { hi = mid } else { lo = mid }
    }
    hi
}

/// Bisection for the greatest x in [lo, hi] with `ok(x)`, given `ok(lo)` and monotone `ok`.
fn greatest(lo: f64, hi: f64, ok: impl Fn(f64) -> bool) -> f64 {
    let (mut lo, mut hi) = (lo, hi);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if mid <= lo || mid >= hi || (hi - lo) <= 1e-12 * hi {
            break;
        }
        if ok(mid) { lo = mid } else { hi = mid }
    }
    lo
}

/// The least reinforcement for `mu` (N·m, magnitude) under `nu` (N, compression +).
///
/// `m` gives the section and materials; its steel areas are ignored. `allow_compression_steel`
/// is false for a slab strip. The search spans tension steel up to 10 % of Ag and compression
/// steel up to 8 % of Ag; beyond that the answer is "too small a section".
pub fn design_flexure(m: &Cirsoc201MemberData, mu: f64, nu: f64, allow_compression_steel: bool) -> FlexureDesign {
    let mu = mu.abs();
    let es = m.es.unwrap_or(200e9);
    let ag = m.ag.unwrap_or_else(|| gross_area(m));
    let applies = mu > 0.0 && nu < 0.10 * m.fc * ag;
    let eps_min = if applies { ductility_strain(m.edition, m.fy, es) } else { 0.0 };
    let impossible = FlexureDesign {
        kind: FlexureDesignKind::Impossible, as_t: f64::NAN, as_c: f64::NAN, phi_mn: f64::NAN, phi: f64::NAN,
        c: f64::NAN, a: f64::NAN, epsilon_t: f64::NAN, epsilon_t_min: eps_min,
    };
    if !(mu.is_finite() && nu.is_finite() && ag > 0.0) {
        return impossible;
    }
    let as_hi = 0.10 * ag;
    let as_c_hi = 0.08 * ag;
    let tiny = 1e-9 * ag;

    let ductile = |as_t: f64, as_c: f64| match strength(m, as_t, as_c, nu) {
        Some((_, eps, ..)) => eps >= eps_min,
        None => false,
    };
    let strong = |as_t: f64, as_c: f64| match strength(m, as_t, as_c, nu) {
        Some((pm, ..)) => pm >= mu,
        None => false,
    };
    let passes = |as_t: f64, as_c: f64| strong(as_t, as_c) && ductile(as_t, as_c);

    // The most tension steel the ductility limit allows with As'. A member in tension may not
    // reach equilibrium with little steel; the bracket starts at the least that does.
    let equilibrium_from = |as_c: f64| {
        if strength(m, tiny, as_c, nu).is_some() {
            Some(tiny)
        } else if strength(m, as_hi, as_c, nu).is_some() {
            Some(least(tiny, as_hi, |x| strength(m, x, as_c, nu).is_some()))
        } else {
            None
        }
    };
    let ductile_max = |as_c: f64| -> Option<f64> {
        let lo = equilibrium_from(as_c)?;
        if !ductile(lo, as_c) {
            return None;
        }
        Some(if ductile(as_hi, as_c) { as_hi } else { greatest(lo, as_hi, |x| ductile(x, as_c)) })
    };

    let finish = |kind: FlexureDesignKind, as_t: f64, as_c: f64| {
        // Confirmed by the check itself; the bisection keeps the passing side, so this holds.
        match strength(m, as_t, as_c, nu) {
            Some((pm, eps, phi, c, a)) if pm >= mu && eps >= eps_min => FlexureDesign {
                kind, as_t, as_c, phi_mn: pm, phi, c, a, epsilon_t: eps, epsilon_t_min: eps_min,
            },
            _ => impossible,
        }
    };

    // ── Singly reinforced ──
    // φ·Mn is NOT monotone in As over the ductile range: in the transition zone φ falls as the
    // steel grows (with 2005's εt,min = 0,004 and fy = 500 MPa φ·Mn peaks near εt = 0,005 and
    // then drops). So the range is scanned for the first steel that passes, and the boundary
    // bisected inside that first passing interval.
    if let Some(top) = ductile_max(0.0) {
        let lo = equilibrium_from(0.0).unwrap_or(tiny);
        if mu == 0.0 || passes(lo, 0.0) {
            return finish(FlexureDesignKind::Singly, lo, 0.0);
        }
        const SCAN: usize = 256;
        let mut prev = lo;
        for k in 1..=SCAN {
            let x = lo + (top - lo) * k as f64 / SCAN as f64;
            if passes(x, 0.0) {
                let as_t = least(prev, x, |y| passes(y, 0.0));
                return finish(FlexureDesignKind::Singly, as_t, 0.0);
            }
            prev = x;
        }
    }
    if !allow_compression_steel || !(m.d_prime.unwrap_or(0.0) > 0.0 && m.d_prime.unwrap_or(0.0) < m.d) {
        return impossible;
    }

    // ── Doubly reinforced ──
    let reaches = |as_c: f64| ductile_max(as_c).is_some_and(|t| strong(t, as_c));
    if !reaches(as_c_hi) {
        return impossible;
    }
    // The textbook pair: the concrete held at the ductility limit (the tension steel the most
    // the limit allows) and the least compression steel that reaches Mu. Not reducing the
    // tension steel afterwards keeps the requirement continuous and rising across the switch
    // from singly to doubly reinforced (a smaller As with more As' also passes, but then the
    // tension steel would fall as the moment rises).
    let as_c = least(tiny, as_c_hi, reaches);
    let as_t = match ductile_max(as_c) {
        Some(t) => t,
        None => return impossible,
    };
    finish(FlexureDesignKind::Doubly, as_t, as_c)
}

/// Values per answer of [`design_batch`].
pub const DESIGN_INPUTS: usize = 15;
pub const DESIGN_OUTPUTS: usize = 9;

/// Many sizing questions in one call.
///
/// In, per question: `[edition, fc, fy, Es, b, h, d, d', bf, hf, Ag, Mu, Nu, allow As' (0/1), λ]`
/// (Pa, m, m², N·m, N; 0 for an absent Es, d', flange, Ag; λ unused by flexure, kept for layout).
/// Out: `[kind (0 singly, 1 doubly, 2 impossible), As, As', φMn, φ, c, a, εt, εt,min]`.
pub fn design_batch(data: &[f64]) -> Result<Vec<f64>, &'static str> {
    if data.len() % DESIGN_INPUTS != 0 {
        return Err("cirsoc201_design_beam: input length is not a multiple of 15");
    }
    let mut out = Vec::with_capacity(data.len() / DESIGN_INPUTS * DESIGN_OUTPUTS);
    for row in data.chunks_exact(DESIGN_INPUTS) {
        if row.iter().any(|v| !v.is_finite()) {
            return Err("cirsoc201_design_beam: non-finite input");
        }
        let edition = crate::rc_section_kernel::edition_of(row[0])?;
        let opt = |v: f64| if v > 0.0 { Some(v) } else { None };
        let m = Cirsoc201MemberData {
            element_id: 0,
            fc: row[1],
            fy: row[2],
            es: opt(row[3]),
            b: row[4],
            h: row[5],
            d: row[6],
            as_tension: 0.0,
            as_compression: None,
            d_prime: opt(row[7]),
            av: None,
            s_stirrup: None,
            fyt: None,
            ag: opt(row[10]),
            lambda: None,
            bf: opt(row[8]),
            hf: opt(row[9]),
            edition,
        };
        let d = design_flexure(&m, row[11], row[12], row[13] != 0.0);
        out.extend_from_slice(&[d.kind as u8 as f64, d.as_t, d.as_c, d.phi_mn, d.phi, d.c, d.a, d.epsilon_t, d.epsilon_t_min]);
    }
    Ok(out)
}

/// Slab provisions, per metre of width.
///
/// In: `[edition, fy, h]` (Pa, m). Out: `[As,min / m (m²/m), s,max primary one-way,
/// s,max two-way, s,max shrinkage-and-temperature / distribution]` (m).
///
/// 2025: As,min = 0,0018·Ag for every fy (7.6.1.1, 8.6.1.1, 24.4.3.2); spacing ≤ min(3h, 300 mm)
/// for one-way flexural steel (7.7.2.3), ≤ min(2h, 300 mm) at the critical sections of a two-way
/// slab (8.7.2.2), ≤ min(5h, 450 mm) for shrinkage and temperature steel (24.4.3.3).
///
/// 2005 (its text is not in this repository): 0,0020 below fy = 420 MPa and 0,0018 from 420 MPa
/// up (7.12.2.1 without the reduction above 420 MPa, which is the conservative reading), and the
/// spacings the app used before: min(2,5h, 250 mm) one-way, min(2h, 250 mm) two-way,
/// min(3h, 250 mm) distribution — each within the corresponding 2025 limit.
pub fn slab_provisions(data: &[f64]) -> Result<Vec<f64>, &'static str> {
    if data.len() != 3 || data.iter().any(|v| !v.is_finite()) {
        return Err("cirsoc201_slab_provisions: expected [edition, fy, h]");
    }
    let edition = crate::rc_section_kernel::edition_of(data[0])?;
    let (fy, h) = (data[1], data[2]);
    if !(fy > 0.0 && h > 0.0) {
        return Err("cirsoc201_slab_provisions: fy and h must be positive");
    }
    use crate::postprocess::cirsoc201_check::Cirsoc201Edition::*;
    Ok(match edition {
        E2025 => vec![0.0018 * h, (3.0 * h).min(0.30), (2.0 * h).min(0.30), (5.0 * h).min(0.45)],
        E2005 => {
            let rho = if fy < 420e6 { 0.0020 } else { 0.0018 };
            vec![rho * h, (2.5 * h).min(0.25), (2.0 * h).min(0.25), (3.0 * h).min(0.25)]
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::postprocess::cirsoc201_check::{check_single_cirsoc201, Cirsoc201DesignForces, Cirsoc201Edition};

    fn beam(edition: Cirsoc201Edition) -> Cirsoc201MemberData {
        Cirsoc201MemberData {
            element_id: 1, fc: 25e6, fy: 420e6, es: None, b: 0.25, h: 0.50, d: 0.45, as_tension: 0.0,
            as_compression: None, d_prime: Some(0.05), av: None, s_stirrup: None, fyt: None, ag: None,
            lambda: None, bf: None, hf: None, edition,
        }
    }

    fn passes(m: &Cirsoc201MemberData, d: &FlexureDesign, mu: f64, nu: f64) -> bool {
        let mut t = m.clone();
        t.as_tension = d.as_t;
        t.as_compression = if d.as_c > 0.0 { Some(d.as_c) } else { None };
        let r = check_single_cirsoc201(&t, &Cirsoc201DesignForces { element_id: 1, mu: Some(mu), vu: None, axial_compression: Some(nu) });
        r.flexure_ratio <= 1.0 && r.ductility_ratio <= 1.0 && r.unevaluated.is_empty()
    }

    #[test]
    fn singly_requirement_is_the_least_steel_the_check_passes() {
        for e in [Cirsoc201Edition::E2005, Cirsoc201Edition::E2025] {
            let m = beam(e);
            for mu in [20e3, 80e3, 150e3] {
                let d = design_flexure(&m, mu, 0.0, true);
                assert_eq!(d.kind, FlexureDesignKind::Singly, "{mu}");
                assert!(passes(&m, &d, mu, 0.0));
                // 0,1 % less steel no longer passes.
                let less = FlexureDesign { as_t: d.as_t * 0.999, ..d };
                assert!(!passes(&m, &less, mu, 0.0), "{mu}: not minimal");
            }
        }
    }

    #[test]
    fn large_moment_needs_compression_steel_and_stays_ductile() {
        let m = beam(Cirsoc201Edition::E2025);
        let mu = 330e3;
        let d = design_flexure(&m, mu, 0.0, true);
        assert_eq!(d.kind, FlexureDesignKind::Doubly);
        assert!(d.as_c > 0.0);
        assert!(passes(&m, &d, mu, 0.0));
        assert!(d.epsilon_t >= d.epsilon_t_min);
        assert_eq!(design_flexure(&m, mu, 0.0, false).kind, FlexureDesignKind::Impossible);
    }

    #[test]
    fn requirement_never_falls_as_the_moment_rises() {
        for e in [Cirsoc201Edition::E2005, Cirsoc201Edition::E2025] {
            let m = beam(e);
            let (mut prev_t, mut prev_c) = (0.0, 0.0);
            let mut mu = 10e3;
            while mu < 600e3 {
                let d = design_flexure(&m, mu, 0.0, true);
                if d.kind == FlexureDesignKind::Impossible {
                    break;
                }
                assert!(passes(&m, &d, mu, 0.0), "{mu}");
                assert!(d.as_t >= prev_t * (1.0 - 1e-9), "{mu}: As {} < {prev_t}", d.as_t);
                assert!(d.as_c >= prev_c * (1.0 - 1e-6) - 1e-12, "{mu}: As' {} < {prev_c}", d.as_c);
                prev_t = d.as_t;
                prev_c = d.as_c;
                mu += 5e3;
            }
        }
    }

    #[test]
    fn tension_on_the_member_needs_more_steel() {
        let m = beam(Cirsoc201Edition::E2025);
        let plain = design_flexure(&m, 100e3, 0.0, true);
        let tie = design_flexure(&m, 100e3, -200e3, true);
        assert!(tie.as_t > plain.as_t + 200e3 / 420e6 * 0.5, "{} vs {}", tie.as_t, plain.as_t);
        assert!(passes(&m, &tie, 100e3, -200e3));
    }

    #[test]
    fn transition_zone_hump_is_found_singly() {
        // 2005, fy = 500: φ·Mn peaks near εt = 0,005 and falls toward εt,min = 0,004; a moment
        // under the peak needs no compression steel even though the steel AT the limit fails it.
        let mut m = beam(Cirsoc201Edition::E2005);
        m.fc = 20e6;
        m.fy = 500e6;
        m.b = 0.5;
        m.h = 0.4966;
        m.d = 0.451;
        let d = design_flexure(&m, 413.85e3, 0.0, true);
        assert_eq!(d.kind, FlexureDesignKind::Singly);
        assert!(passes(&m, &d, 413.85e3, 0.0));
        let less = FlexureDesign { as_t: d.as_t * 0.999, ..d };
        assert!(!passes(&m, &less, 413.85e3, 0.0));
    }

    #[test]
    fn hopeless_sections_are_refused() {
        let m = beam(Cirsoc201Edition::E2025);
        assert_eq!(design_flexure(&m, 1e8, 0.0, true).kind, FlexureDesignKind::Impossible);
    }

    #[test]
    fn slab_provisions_follow_the_clauses() {
        let p = slab_provisions(&[2025.0, 420e6, 0.12]).unwrap();
        assert!((p[0] - 0.0018 * 0.12).abs() < 1e-15);
        assert!((p[1] - 0.30).abs() < 1e-15 && (p[2] - 0.24).abs() < 1e-15 && (p[3] - 0.45).abs() < 1e-15);
        let q = slab_provisions(&[2005.0, 220e6, 0.10]).unwrap();
        assert!((q[0] - 0.0020 * 0.10).abs() < 1e-15);
        assert!(slab_provisions(&[2019.0, 420e6, 0.1]).is_err());
    }
}
