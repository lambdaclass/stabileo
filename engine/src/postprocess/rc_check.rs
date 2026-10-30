//! Reinforced concrete member design checks per ACI 318-19 (USD).
//!
//! Given analysis results and section properties, computes unity ratios
//! for flexure, shear, and combined loading.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};
use crate::postprocess::rc_flexure::{RcFlexure, RcFlexureSection};

// ==================== Types ====================

/// RC section geometry type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RCSectionType {
    Rectangular,
    TBeam,
}

/// Reinforced concrete member design data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RCMemberData {
    pub element_id: usize,
    /// Concrete compressive strength f'c (Pa)
    pub fc: f64,
    /// Steel yield strength fy (Pa)
    pub fy: f64,
    /// Modulus of elasticity of steel Es (Pa, default 200 GPa)
    #[serde(default)]
    pub es: Option<f64>,
    /// Section width b (m)
    pub b: f64,
    /// Total section depth h (m)
    pub h: f64,
    /// Effective depth d (m)
    pub d: f64,
    /// Compression steel depth d' (m)
    #[serde(default)]
    pub d_prime: Option<f64>,
    /// Tension reinforcement area As (m²)
    pub as_tension: f64,
    /// Compression reinforcement area As' (m²)
    #[serde(default)]
    pub as_compression: Option<f64>,
    /// Section type
    #[serde(default = "default_section_type")]
    pub section_type: RCSectionType,
    /// Flange width bf for T-beam (m)
    #[serde(default)]
    pub bf: Option<f64>,
    /// Flange thickness hf for T-beam (m)
    #[serde(default)]
    pub hf: Option<f64>,
    /// Stirrup area Av per spacing (m²)
    #[serde(default)]
    pub av: Option<f64>,
    /// Stirrup spacing s (m)
    #[serde(default)]
    pub s_stirrup: Option<f64>,
    /// Lightweight concrete factor lambda (default 1.0)
    #[serde(default)]
    pub lambda: Option<f64>,
}

fn default_section_type() -> RCSectionType {
    RCSectionType::Rectangular
}

impl Default for RCSectionType {
    fn default() -> Self {
        RCSectionType::Rectangular
    }
}

/// Design forces for an RC element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RCDesignForces {
    pub element_id: usize,
    /// Factored bending moment Mu (N-m, positive = sagging)
    pub mu: f64,
    /// Factored shear force Vu (N)
    #[serde(default)]
    pub vu: Option<f64>,
    /// Factored axial force Nu (N, positive = tension)
    #[serde(default)]
    pub nu: Option<f64>,
}

/// Input for RC design check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RCCheckInput {
    pub members: Vec<RCMemberData>,
    pub forces: Vec<RCDesignForces>,
}

/// Result of RC design check for one member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RCCheckResult {
    pub element_id: usize,
    /// Overall unity ratio (max of all checks)
    pub unity_ratio: f64,
    /// Governing check name
    pub governing_check: String,
    /// Flexure unity ratio (Mu / phi*Mn)
    pub flexure_ratio: f64,
    /// Shear unity ratio (Vu / phi*Vn)
    pub shear_ratio: f64,
    /// Axial unity ratio: Pu / phi*Pn,max in compression (ACI 318-19
    /// 22.4.2.1, tied), |Pu| / phi*Pnt in tension (22.4.3.1).
    #[serde(default)]
    pub axial_ratio: f64,
    /// Available flexural strength phi*Mn (N-m)
    pub phi_mn: f64,
    /// Available shear strength phi*Vn (N)
    pub phi_vn: f64,
    /// Neutral axis depth a (m) — Whitney stress block depth
    pub a: f64,
    /// Neutral axis depth c (m)
    pub c: f64,
    /// Net tensile strain in extreme tension steel
    pub epsilon_t: f64,
    /// Strength reduction factor phi used for flexure
    pub phi_flexure: f64,
    /// Whether the section is tension-controlled
    pub tension_controlled: bool,
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== ACI 318-19 Design Checks ====================

const PHI_V: f64 = 0.75; // Shear

pub(crate) const RC_FLEXURE: &str = "Flexure ACI 318";
pub(crate) const RC_SHEAR: &str = "Shear ACI 318";
pub(crate) const RC_AXIAL: &str = "Axial ACI 318";

/// Index the force records by id so each member is a hash lookup rather than a
/// scan of the whole list. The pairing was O(members x forces): fine at 100
/// members, quadratic at 10,000 — and this runs on every edit.
fn index_forces<T>(forces: &[T], id_of: impl Fn(&T) -> usize) -> std::collections::HashMap<usize, &T> {
    let mut map = std::collections::HashMap::with_capacity(forces.len());
    for f in forces {
        map.entry(id_of(f)).or_insert(f);
    }
    map
}

/// Run ACI 318-19 RC design checks on all members.
pub fn check_rc_members(input: &RCCheckInput) -> Vec<RCCheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();

        let forces = match forces {
            Some(f) => f,
            None => continue,
        };

        let result = check_single_rc_member(member, forces);
        results.push(result);
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_rc_member(m: &RCMemberData, f: &RCDesignForces) -> RCCheckResult {
    let es = m.es.unwrap_or(200e9);
    let mut ledger = CheckLedger::new();

    // Flexural capacity. With an axial force present the moment capacity is the
    // point on the P-M interaction diagram at that axial load, not the
    // pure-flexure value: `nu` was accepted and dropped, so every column was
    // checked as if it were a beam.
    let nu = f.nu.unwrap_or(0.0);
    let (phi_mn, a, c, epsilon_t, phi_flex) = if nu != 0.0
        && matches!(m.section_type, RCSectionType::Rectangular)
    {
        axial_flexure_capacity(m, es, -nu)
    } else {
        let (phi_mn, f, phi) = flexural_capacity::<f64>(m);
        (phi_mn, f.a, f.c, f.epsilon_t, phi)
    };

    // Shear capacity (ACI 318-19 Table 22.5.5.1 includes axial force Nu = -nu, compression positive)
    let pu = -nu; // compression positive
    let phi_vn: f64 = shear_capacity(m, pu);
    let (phi_pn_max, phi_pnt): (f64, f64) = axial_capacity(m);

    // Demand ratios
    let mu_abs = f.mu.abs();
    let vu_abs = f.vu.unwrap_or(0.0).abs();

    let flexure_ratio = ledger.ratio(RC_FLEXURE, mu_abs, phi_mn);
    if nu != 0.0 && matches!(m.section_type, RCSectionType::TBeam) {
        // No P-M interaction for T-sections: the axial force was silently
        // ignored, which is unconservative above the balance point. The pure
        // flexure ratio is still reported, but the check is not complete.
        ledger.flag(RC_FLEXURE);
    }
    let shear_ratio = ledger.ratio_if_loaded(RC_SHEAR, vu_abs, phi_vn);
    // The axial capacity itself was never checked: an axial load beyond the
    // interaction diagram was clamped to its end point and still reported a
    // moment capacity (a column carrying more than phi*Pn,max could pass).
    let axial_ratio = if pu >= 0.0 {
        ledger.ratio_if_loaded(RC_AXIAL, pu, phi_pn_max)
    } else {
        ledger.ratio_if_loaded(RC_AXIAL, -pu, phi_pnt)
    };

    // ACI 318-19 Table 21.2.2 defines both phi and the tension-controlled
    // classification by the same limit, eps_ty + 0.003. A fixed 0.005 (the
    // 318-14 Grade 60 value) disagrees with `compute_phi` for any other grade:
    // at fy = 550 MPa the limit is 0.00575, so eps_t = 0.0052 would be flagged
    // tension-controlled while phi was still 0.85.
    let epsilon_ty = if es > 0.0 { m.fy / es } else { 0.0 };
    let tension_controlled = epsilon_t >= epsilon_ty + 0.003;

    // Governing
    let checks = [
        (flexure_ratio, RC_FLEXURE),
        (shear_ratio, RC_SHEAR),
        (axial_ratio, RC_AXIAL),
    ];

    let (unity_ratio, governing) = ledger.governing(&checks);
    let governing_check = if ledger.all_evaluated() {
        governing.to_string()
    } else {
        format!("{governing} (incomplete)")
    };

    RCCheckResult {
        element_id: m.element_id,
        unity_ratio,
        governing_check,
        flexure_ratio,
        shear_ratio,
        axial_ratio,
        phi_mn,
        phi_vn,
        a,
        c,
        epsilon_t,
        phi_flexure: phi_flex,
        tension_controlled,
        unevaluated: ledger.into_unevaluated(),
    }
}

/// Gross area Ag of a rectangular or T-section (m²).
pub(crate) fn gross_area<T: Real>(m: &RCMemberData) -> T {
    match m.section_type {
        RCSectionType::Rectangular => T::exact(m.b) * T::exact(m.h),
        RCSectionType::TBeam => {
            let (bf, hf) = tbeam_flange(m);
            T::exact(m.b) * T::exact(m.h) + (T::exact(bf) - T::exact(m.b)) * T::exact(hf)
        }
    }
}

/// ACI 318-19 22.4.2 / 22.4.3: (phi*Pn,max, phi*Pnt) for a tied section,
/// phi*Pn,max = 0.80·0.65·[0.85·f'c·(Ag − Ast) + fy·Ast], phi*Pnt = 0.90·fy·Ast.
pub(crate) fn axial_capacity<T: Real>(m: &RCMemberData) -> (T, T) {
    let ast = T::exact(m.as_tension) + T::exact(m.as_compression.unwrap_or(0.0));
    let ag = gross_area::<T>(m);
    let fy = T::exact(m.fy);
    let po = T::lit(0.85) * T::exact(m.fc) * (ag - ast) + fy * ast;
    (T::lit(0.80) * T::lit(0.65) * po, T::lit(0.90) * fy * ast)
}

fn tbeam_flange(m: &RCMemberData) -> (f64, f64) {
    (m.bf.unwrap_or(m.b), m.hf.unwrap_or(m.h * 0.15))
}

/// Section for the pure-flexure strength: rectangular (with compression steel
/// when both As' > 0 and d' > 0) or T (flange bf × hf, compression steel not
/// counted).
pub(crate) fn flexure_section(m: &RCMemberData) -> RcFlexureSection {
    let es = m.es.unwrap_or(200e9);
    let (bf, hf, as_c, d_prime) = match m.section_type {
        RCSectionType::Rectangular => {
            let as_comp = m.as_compression.unwrap_or(0.0);
            let d_prime = m.d_prime.unwrap_or(0.0);
            if as_comp > 0.0 && d_prime > 0.0 {
                (m.b, 0.0, as_comp, d_prime)
            } else {
                (m.b, 0.0, 0.0, 0.0)
            }
        }
        RCSectionType::TBeam => {
            let (bf, hf) = tbeam_flange(m);
            (bf, hf, 0.0, 0.0)
        }
    };
    RcFlexureSection { fc: m.fc, fy: m.fy, es, bw: m.b, bf, hf, d: m.d, as_t: m.as_tension, as_c, d_prime }
}

/// ACI 318-19 22.2: pure-flexure strength by strain compatibility (see
/// `rc_flexure`). Returns (phi*Mn, section state, phi).
///
/// The closed forms this replaces assumed the tension steel yields (Mn
/// overstated when eps_t < eps_y, ~6% for an over-reinforced beam) and, for a
/// doubly reinforced section, made one non-iterated pass at the compression
/// steel stress. Generic over `Real` for the certified check.
pub(crate) fn flexural_capacity<T: Real>(m: &RCMemberData) -> (T, RcFlexure<T>, T) {
    let es = m.es.unwrap_or(200e9);
    let f = flexure_section(m).strength(compute_beta1::<T>(m.fc), compute_beta1::<f64>(m.fc));
    let phi = compute_phi(f.epsilon_t, m.fy, es);
    (phi * f.mn, f, phi)
}

/// Section forces at a trial neutral axis depth `c` on the P-M interaction
/// diagram, moments about mid-depth so P and M share one origin:
/// (phi*Pn, phi*Mn, eps_t, phi), compression positive. Generic over `Real`.
pub(crate) fn interaction_point<T: Real>(m: &RCMemberData, es: f64, c: T) -> (T, T, T, T) {
    let beta1 = compute_beta1::<T>(m.fc);
    let as_comp = T::exact(m.as_compression.unwrap_or(0.0));
    let d_prime = T::exact(m.d_prime.unwrap_or(0.0));
    let (h, b, d, fc, fy, es) =
        (T::exact(m.h), T::exact(m.b), T::exact(m.d), T::exact(m.fc), T::exact(m.fy), T::exact(es));
    let two = T::exact(2.0);
    let a = (beta1 * c).min(h);
    let cc = T::lit(0.85) * fc * a * b;

    let strain_at = |depth: T| T::lit(0.003) * (c - depth).dv(c);
    let zero = T::exact(0.0);
    let k_fc = T::lit(0.85) * fc;

    // Compression steel: net of the concrete it displaces only when in compression (c >= d').
    let eps_comp = strain_at(d_prime);
    let fs_comp = (eps_comp * es).max(-fy).min(fy);
    let cs = as_comp * branch(zero.le(eps_comp), || fs_comp - k_fc, || fs_comp);

    // Tension steel: positive strain_at means compression, so flip; net of displaced concrete when c > d.
    let epsilon_t = -strain_at(d);
    let fs_tens = (epsilon_t * es).max(-fy).min(fy);
    let t = T::exact(m.as_tension) * branch(zero.le(epsilon_t), || fs_tens, || (fs_tens + k_fc).min(zero));

    let pn = cc + cs - t;
    let mn = cc * (h.dv(two) - a.dv(two)) + cs * (h.dv(two) - d_prime) + t * (d - h.dv(two));
    let phi = compute_phi(epsilon_t, m.fy, m.es.unwrap_or(200e9));
    (phi * pn, phi * mn, epsilon_t, phi)
}

/// Search range for the neutral axis on the interaction diagram.
pub(crate) fn interaction_c_range(m: &RCMemberData) -> (f64, f64) {
    (1e-6, 10.0 * m.h.max(m.d))
}

/// ACI 318-19 Sec 22.4: moment capacity of a rectangular section at a given
/// factored axial load, by strain compatibility.
///
/// Solves for the neutral axis depth `c` at which phi·Pn(c) equals the applied
/// `pu` (compression positive), then reports phi·Mn at that same `c` — the
/// point on the P-M interaction diagram the member actually sits on. Below the
/// balance point compression raises the moment capacity; above it, compression
/// lowers it, and that is the case a flexure-only check gets dangerously wrong.
///
/// Bisection keeps phi·Pn(lo) < pu <= phi·Pn(hi), so by continuity it lands on
/// a crossing even where phi·Pn is not monotonic. When `pu` lies outside
/// [phi·Pn(lo), phi·Pn(hi)] there is no such point: phi·Mn is reported as 0
/// (so the flexure check is flagged unevaluated) instead of the end point's
/// moment, which let an axially overloaded column report a moment capacity.
///
/// Returns (phi*Mn, a, c, epsilon_t, phi).
fn axial_flexure_capacity(m: &RCMemberData, es: f64, pu: f64) -> (f64, f64, f64, f64, f64) {
    let beta1: f64 = compute_beta1(m.fc);
    let evaluate = |c: f64| interaction_point::<f64>(m, es, c);

    let (mut lo, mut hi) = interaction_c_range(m);
    let in_range = evaluate(lo).0 < pu && pu <= evaluate(hi).0;
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if evaluate(mid).0 < pu {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let c = 0.5 * (lo + hi);

    let (_, phi_mn, epsilon_t, phi) = evaluate(c);
    let a = (beta1 * c).min(m.h);
    let phi_mn = if in_range { phi_mn.max(0.0) } else { 0.0 };
    (phi_mn, a, c, epsilon_t, phi)
}

/// ACI 318M-19 Sec 22.5.5.1: Shear capacity.
/// Formula uses f'c in MPa and dimensions in mm (empirical, not dimensionally homogeneous).
///
/// 318-19 replaced the single 0.17·lambda·sqrt(f'c) expression of 318-14 with a
/// table keyed on whether at least minimum shear reinforcement is present. Where
/// it is not, the size-effect factor lambda_s applies — and since it only bites
/// for d > 250 mm, leaving it out was unconservative for essentially every beam.
/// Generic over `Real` for the certified check.
pub(crate) fn shear_capacity<T: Real>(m: &RCMemberData, axial_compression: T) -> T {
    let lambda = T::exact(m.lambda.unwrap_or(1.0));
    let mpa = T::exact(1e6);
    let fc_mpa = T::exact(m.fc).dv(mpa);
    let bw_mm = T::exact(m.b) * T::exact(1000.0);
    let d_mm = T::exact(m.d) * T::exact(1000.0);
    // ACI 318-19 22.5.3.1: sqrt(f'c) <= 8.3 MPa across shear provisions.
    let sqrt_fc = fc_mpa.sqrt().min(T::lit(8.3));
    let zero = T::exact(0.0);

    // ACI 318-19 Table 20.2.2.4(a) & 22.5.3.3: fyt used in Vs shall not exceed 420 MPa.
    let fyt_vs = T::exact(m.fy.min(420e6));
    // Vs = Av * fyt * d / s  (all in base SI: m², Pa, m, m → N)
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => (T::exact(av) * fyt_vs * T::exact(m.d)).dv(T::exact(s)),
        _ => zero,
    };

    // ACI 318-19 9.6.3.4: Av,min = max(0.062·sqrt(f'c)·bw·s/fyt, 0.35·bw·s/fyt)
    let vc_base_with_min = || T::lit(0.17) * lambda * sqrt_fc;
    let vc_base_without_min = || {
        // 22.5.5.1(c): Vc = [0.66·lambda_s·lambda·rho_w^(1/3)·sqrt(f'c) + Nu/(6·Ag)]·bw·d
        // 22.5.5.1.3: lambda_s = sqrt(2/(1 + d/250)) <= 1.0, d in mm.
        let one = T::exact(1.0);
        let lambda_s = (T::exact(2.0).dv(one + d_mm.dv(T::exact(250.0)))).sqrt().min(one);
        let rho_w = if m.b > 0.0 && m.d > 0.0 {
            T::exact(m.as_tension).dv(T::exact(m.b) * T::exact(m.d))
        } else {
            zero
        };
        T::lit(0.66) * lambda_s * lambda * cbrt(rho_w) * sqrt_fc
    };
    let vc_base = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 && m.fy > 0.0 => {
            let s_mm = T::exact(s) * T::exact(1000.0);
            let fy_mpa = T::exact(m.fy).dv(mpa);
            let av_min_mm2 = (T::lit(0.062) * sqrt_fc * bw_mm * s_mm)
                .dv(fy_mpa)
                .max((T::lit(0.35) * bw_mm * s_mm).dv(fy_mpa));
            let av_mm2 = T::exact(av) * T::exact(1e6);
            branch(av_min_mm2.le(av_mm2), vc_base_with_min, vc_base_without_min)
        }
        _ => vc_base_without_min(),
    };

    // ACI 318-19 Table 22.5.5.1, 22.5.5.1.1 & 22.5.5.1.2:
    // Nu/(6·Ag) in MPa (compression positive), capped at 0.05·f'c, with 0 <= Vc <= 0.42·lambda·sqrt(f'c)·bw·d.
    let ag = gross_area::<T>(m);
    let axial_mpa = if m.b > 0.0 && m.h > 0.0 {
        axial_compression.dv(ag * mpa).dv(T::exact(6.0)).min(T::lit(0.05) * fc_mpa)
    } else {
        zero
    };
    let vc_mpa = (vc_base + axial_mpa).max(zero).min(T::lit(0.42) * lambda * sqrt_fc);
    let vc = (vc_mpa * bw_mm * d_mm).max(zero);

    // Maximum Vs limit: 0.66 * sqrt(f'c_MPa) * bw_mm * d_mm (N)
    let vs_max = T::lit(0.66) * sqrt_fc * bw_mm * d_mm;
    let vs = vs.min(vs_max);

    T::lit(PHI_V) * (vc + vs)
}

/// Cube root of a non-negative value (`x^(1/3)`, 0 at 0, as `f64::cbrt`).
fn cbrt<T: Real>(x: T) -> T {
    let zero = T::exact(0.0);
    branch(zero.lt(x), || x.powf(T::exact(1.0).dv(T::exact(3.0))), || zero)
}

/// ACI 318-19 Table 22.2.2.4.3: beta1 factor.
pub(crate) fn compute_beta1<T: Real>(fc: f64) -> T {
    let fc_mpa = T::exact(fc).dv(T::exact(1e6));
    let (lo, hi) = (T::exact(28.0), T::exact(56.0));
    branch(
        fc_mpa.le(lo),
        || T::lit(0.85),
        || branch(fc_mpa.le(hi), || T::lit(0.85) - T::lit(0.05) * (fc_mpa - lo).dv(T::exact(7.0)), || T::lit(0.65)),
    )
}

/// ACI 318-19 Table 21.2.2: Strength reduction factor phi.
pub(crate) fn compute_phi<T: Real>(epsilon_t: T, fy: f64, es: f64) -> T {
    let epsilon_y = T::exact(fy).dv(T::exact(es));
    let limit = T::lit(0.003);
    branch(
        (epsilon_y + limit).le(epsilon_t),
        || T::lit(0.90), // Tension-controlled
        || {
            branch(
                epsilon_t.le(epsilon_y),
                || T::lit(0.65), // Compression-controlled
                || T::lit(0.65) + T::lit(0.25) * (epsilon_t - epsilon_y).dv(limit), // Transition zone
            )
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beta1_values() {
        assert!((compute_beta1::<f64>(20e6) - 0.85).abs() < 1e-10);
        assert!((compute_beta1::<f64>(28e6) - 0.85).abs() < 1e-10);
        assert!((compute_beta1::<f64>(35e6) - 0.80).abs() < 1e-2);
        assert!((compute_beta1::<f64>(56e6) - 0.65).abs() < 1e-10);
        assert!((compute_beta1::<f64>(70e6) - 0.65).abs() < 1e-10);
    }

    #[test]
    fn test_phi_values() {
        // Tension controlled: epsilon_t >= fy/Es + 0.003 = 0.0021 + 0.003 = 0.0051
        assert!((compute_phi(0.006, 420e6, 200e9) - 0.90).abs() < 1e-6);
        // Compression controlled: epsilon_t <= fy/Es = 0.0021
        assert!((compute_phi(0.002, 420e6, 200e9) - 0.65).abs() < 1e-6);
    }
}
