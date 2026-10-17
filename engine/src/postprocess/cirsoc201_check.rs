//! Reinforced concrete beam-section checks per CIRSOC 201, editions 2005 and 2025.
//!
//! This is the checker the app's provided-reinforcement verifier defers to: flexure of a
//! rectangular section with the bars it actually has, shear with the stirrups it actually has,
//! and the requirements that decide whether those numbers may be used at all (the ductility
//! floor on εt, the minimum shear reinforcement, the section limit on Vs).
//!
//! Clauses, CIRSOC 201-2025 first and 2005 in brackets:
//!
//! * Flexure: strain compatibility (22.2; [10.2]) with a rectangular stress block
//!   0,85·f'c over a = β1·c (22.2.2.4; [10.2.7]). Neither steel is assumed to yield: each bar
//!   takes fs = Es·εs ≤ fy. A compression bar inside the block is net of the concrete it
//!   displaces.
//! * φ from εt, Tabla 21.2.2: tension-controlled at εt ≥ εty + 0,003, compression-controlled at
//!   εt ≤ εty, linear between, with εty = fy/Es (21.2.2.1). [9.3.2 with 10.3.3–10.3.4:
//!   tension-controlled at 0,005.]
//! * Ductility: a beam with Pu < 0,10·f'c·Ag must be tension-controlled, 9.3.3.1.
//!   [10.3.5: εt ≥ 0,004.]
//! * Shear: Tabla 22.5.5.1 — row (a) when Av ≥ Av,min, row (c) with the size factor λs
//!   (22.5.5.1.3) when it is not; Nu/(6·Ag) ≤ 0,05·f'c (22.5.5.1.2); 0 ≤ Vc ≤ 0,42·√f'c·bw·d
//!   (22.5.5.1.1). [11.3.1.1, 11.3.1.2 and 11.3.1.3: Vc = (1 + Nu/(14·Ag))·√f'c/6·bw·d in
//!   compression, (1 + 0,3·Nu/Ag)·√f'c/6·bw·d ≥ 0 in tension.]
//! * √f'c ≤ 8,3 MPa in every shear term (22.5.3.1; [11.1.2]); fy and fyt ≤ 420 MPa in Vs
//!   (22.5.3.3; [11.5.2]). Av,min uses the stirrup's fyt as given.
//! * Vs ≤ 0,66·√f'c·bw·d (22.5.1.2) [2/3·√f'c·bw·d, 11.5.7.9].
//! * Av,min = max(0,062·√f'c, 0,35)·bw·s/fyt (9.6.3.4) [max(√f'c/16, 0,33)·bw·s/fyt, 11.5.6.3],
//!   required where Vu > φ·0,085·λ·√f'c·bw·d (9.6.3.1) [Vu > 0,5·φ·Vc, 11.5.6.1]. The only
//!   exemption taken is the shallow member, h ≤ 250 mm (Tabla 9.6.3.1; [11.5.6.1(b)]); the
//!   others need data this checker does not receive, so it asks for the minimum.
//!
//! Every formula is generic over `Real` (`certify::real`): the f64 instantiation is the
//! checker, the interval one is the certified check (`certify::design`), so both evaluate the
//! same clauses. A compression bar is net of the concrete it displaces whenever it is in
//! compression (c > d'), which keeps the force residual monotone in c (one neutral axis, which
//! the certificate needs); a bar on the compression side that is in tension (c < d') is not
//! credited. Both choices can only lower Mn.
//!
//! Units: Pa, N, N·m, m, m². Axial force is POSITIVE IN COMPRESSION, the sign Tabla 22.5.5.1
//! (nota 1) uses; the field is named for it.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real, Tri};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

// ==================== Types ====================

/// The edition of CIRSOC 201 the check follows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum Cirsoc201Edition {
    #[serde(rename = "2005")]
    E2005,
    /// The edition in force, and the default.
    #[serde(rename = "2025")]
    #[default]
    E2025,
}

/// One rectangular section with the reinforcement it has.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201MemberData {
    pub element_id: usize,
    /// Specified concrete compressive strength f'c (Pa)
    pub fc: f64,
    /// Longitudinal steel yield strength fy (Pa)
    pub fy: f64,
    /// Modulus of elasticity of steel Es (Pa, default 200 GPa)
    #[serde(default)]
    pub es: Option<f64>,
    /// Web width bw (m)
    pub b: f64,
    /// Total depth h (m)
    pub h: f64,
    /// Effective depth d, to the centroid of the tension steel (m)
    pub d: f64,
    /// Tension reinforcement area As (m²)
    pub as_tension: f64,
    /// Compression reinforcement area As' (m²)
    #[serde(default)]
    pub as_compression: Option<f64>,
    /// Compression steel depth d' (m)
    #[serde(default)]
    pub d_prime: Option<f64>,
    /// Shear reinforcement area Av within spacing s, all legs (m²)
    #[serde(default)]
    pub av: Option<f64>,
    /// Stirrup spacing s (m)
    #[serde(default)]
    pub s_stirrup: Option<f64>,
    /// Stirrup yield strength fyt (Pa, default fy)
    #[serde(default)]
    pub fyt: Option<f64>,
    /// Gross area for the axial terms (m², default b·h)
    #[serde(default)]
    pub ag: Option<f64>,
    /// Lightweight concrete factor λ (default 1.0)
    #[serde(default)]
    pub lambda: Option<f64>,
    #[serde(default)]
    pub edition: Cirsoc201Edition,
}

/// Factored forces acting together on the section.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201DesignForces {
    pub element_id: usize,
    /// Factored moment Mu (N·m); its magnitude is checked against the bars given as tension steel
    #[serde(default)]
    pub mu: Option<f64>,
    /// Factored shear Vu (N)
    #[serde(default)]
    pub vu: Option<f64>,
    /// Factored axial force acting with Vu (N), POSITIVE IN COMPRESSION, negative in tension
    #[serde(default)]
    pub axial_compression: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201CheckInput {
    pub members: Vec<Cirsoc201MemberData>,
    pub forces: Vec<Cirsoc201DesignForces>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201CheckResult {
    pub element_id: usize,
    pub edition: Cirsoc201Edition,
    /// Design flexural strength φ·Mn (N·m)
    pub phi_mn: f64,
    /// Mu / (φ·Mn)
    pub flexure_ratio: f64,
    /// Depth of the stress block a (m) and of the neutral axis c (m)
    pub a: f64,
    pub c: f64,
    /// Net tensile strain in the tension steel
    pub epsilon_t: f64,
    /// φ for flexure
    pub phi: f64,
    /// Stress in the tension and compression steel at nominal strength (Pa)
    pub fs_tension: f64,
    pub fs_compression: f64,
    /// Least εt the ductility clause allows (0 when it does not apply)
    pub epsilon_t_min: f64,
    /// εt,min / εt: above 1 the beam is not ductile enough (0 when it does not apply)
    pub ductility_ratio: f64,
    /// Design shear strength φ·(Vc + Vs) (N)
    pub phi_vn: f64,
    /// Vu / (φ·Vn)
    pub shear_ratio: f64,
    /// Concrete and steel contributions (N); `vs` already limited to the section maximum
    pub vc: f64,
    pub vs: f64,
    /// Av,min for the spacing given (m²), and whether Av falls below it
    pub av_min: f64,
    pub av_below_min: bool,
    /// Whether the clause requires Av,min at this Vu and it is missing
    pub min_shear_reinforcement_missing: bool,
    /// Whether Vs was limited by the section maximum
    pub vs_capped: bool,
    pub phi_v: f64,
    pub unity_ratio: f64,
    pub governing_check: String,
    pub pass: bool,
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== Clause helpers ====================

const EPSILON_CU: f64 = 0.003;
const PHI_V: f64 = 0.75;
const SQRT_FC_MAX_MPA: f64 = 8.3;
const FYT_MAX_PA: f64 = 420e6;

/// Ledger names of the four checks (also the certified check names).
pub(crate) const CIRSOC201_FLEXURE: &str = "Flexure";
pub(crate) const CIRSOC201_DUCTILITY: &str = "Ductility";
pub(crate) const CIRSOC201_SHEAR: &str = "Shear";
pub(crate) const CIRSOC201_MIN_SHEAR: &str = "Minimum shear reinforcement";

fn not(t: Tri) -> Tri {
    match t {
        Tri::True => Tri::False,
        Tri::False => Tri::True,
        Tri::Unknown => Tri::Unknown,
    }
}

fn decided(t: Tri) -> bool {
    // f64 comparisons are always decided.
    t == Tri::True
}

/// β1, 22.2.2.4.3 [10.2.7.3]: 0,85 to 28 MPa, minus 0,05 per 7 MPa, not below 0,65.
pub(crate) fn beta1_r<T: Real>(fc: f64) -> T {
    let fc_mpa = T::exact(fc).dv(T::exact(1e6));
    branch(
        fc_mpa.le(T::exact(28.0)),
        || T::lit(0.85),
        || (T::lit(0.85) - T::lit(0.05) * (fc_mpa - T::exact(28.0)).dv(T::exact(7.0))).max(T::lit(0.65)),
    )
}

pub fn beta1(fc: f64) -> f64 {
    beta1_r::<f64>(fc)
}

/// εty = fy/Es (21.2.2.1 [10.3.3]). The 0,002 that 10.3.3 permits for fy = 420 MPa is not
/// used: fy/Es = 0,0021 there, the stricter limit.
fn epsilon_ty<T: Real>(fy: f64, es: f64) -> T {
    T::exact(fy).dv(T::exact(es))
}

pub(crate) fn tension_controlled_strain_r<T: Real>(edition: Cirsoc201Edition, fy: f64, es: f64) -> T {
    match edition {
        Cirsoc201Edition::E2025 => epsilon_ty::<T>(fy, es) + T::lit(0.003),
        Cirsoc201Edition::E2005 => T::lit(0.005),
    }
}

/// The εt at and above which a section is tension-controlled.
pub fn tension_controlled_strain(edition: Cirsoc201Edition, fy: f64, es: f64) -> f64 {
    tension_controlled_strain_r::<f64>(edition, fy, es)
}

pub(crate) fn phi_flexure_r<T: Real>(edition: Cirsoc201Edition, epsilon_t: T, fy: f64, es: f64) -> T {
    let ety = epsilon_ty::<T>(fy, es);
    let etc = tension_controlled_strain_r::<T>(edition, fy, es);
    branch(
        etc.le(epsilon_t),
        || T::lit(0.90),
        || branch(epsilon_t.le(ety), || T::lit(0.65), || T::lit(0.65) + T::lit(0.25) * (epsilon_t - ety).dv(etc - ety)),
    )
}

/// φ for moment and axial force from εt (tied sections), Tabla 21.2.2 (d), (b), (f)
/// [9.3.2.1, 9.3.2.2(b) with 10.3.3–10.3.4].
pub fn phi_flexure(edition: Cirsoc201Edition, epsilon_t: f64, fy: f64, es: f64) -> f64 {
    phi_flexure_r::<f64>(edition, epsilon_t, fy, es)
}

pub(crate) fn ductility_strain_r<T: Real>(edition: Cirsoc201Edition, fy: f64, es: f64) -> T {
    match edition {
        Cirsoc201Edition::E2025 => tension_controlled_strain_r::<T>(edition, fy, es),
        Cirsoc201Edition::E2005 => T::lit(0.004),
    }
}

/// The least εt a flexural member may have, 9.3.3.1 [10.3.5].
pub fn ductility_strain(edition: Cirsoc201Edition, fy: f64, es: f64) -> f64 {
    ductility_strain_r::<f64>(edition, fy, es)
}

// ==================== Flexure ====================

/// Section state at nominal flexural strength.
#[derive(Debug, Clone, Copy)]
pub struct FlexureStateR<T> {
    pub mn: T,
    pub a: T,
    pub c: T,
    pub epsilon_t: T,
    pub fs_tension: T,
    pub fs_compression: T,
}

pub type FlexureState = FlexureStateR<f64>;

/// The data under which the flexural formulas apply (and the residual is monotone).
pub(crate) fn flexure_inputs_valid(m: &Cirsoc201MemberData) -> bool {
    let es = m.es.unwrap_or(200e9);
    let as_c = m.as_compression.unwrap_or(0.0).max(0.0);
    let d_p = m.d_prime.unwrap_or(0.0);
    [m.fc, m.fy, es, m.b, m.h, m.d, m.as_tension].iter().all(|v| v.is_finite() && *v > 0.0)
        && as_c.is_finite()
        && d_p.is_finite()
        && m.d <= m.h
}

/// (residual C − T, moment about the tension steel, a, εt, fs, fs') at neutral axis depth c.
///
/// The residual is continuous and non-decreasing in c: the block min(β1·c, h) grows, the
/// compression bar's net force As'·max(0, fs' − 0,85·f'c) grows, the tension steel strain
/// falls. It is −As·fy as c → 0, so the root is unique where it is strictly increasing.
fn flexure_at<T: Real>(m: &Cirsoc201MemberData, b1: T, c: T) -> (T, T, T, T, T, T) {
    let es = T::exact(m.es.unwrap_or(200e9));
    let fy = T::exact(m.fy);
    let as_c = m.as_compression.unwrap_or(0.0).max(0.0);
    let d_p = m.d_prime.unwrap_or(0.0);
    let doubly = as_c > 0.0 && d_p > 0.0 && d_p < m.d;
    let ecu = T::lit(EPSILON_CU);
    let fs = |eps: T| (es * eps).max(-fy).min(fy);
    let k = T::lit(0.85) * T::exact(m.fc);
    let (h, d, b) = (T::exact(m.h), T::exact(m.d), T::exact(m.b));
    let a = (b1 * c).min(h);
    let cc = k * a * b;
    let (cs, fsc) = if doubly {
        let fsc = fs(ecu * (T::exact(1.0) - T::exact(d_p).dv(c)));
        (T::exact(as_c) * (fsc - k).max(T::exact(0.0)), fsc.max(T::exact(0.0)))
    } else {
        (T::exact(0.0), T::exact(0.0))
    };
    let eps_t = ecu * (d.dv(c) - T::exact(1.0));
    let fst = fs(eps_t);
    let t = T::exact(m.as_tension) * fst;
    let mn = cc * (d - a.dv(T::exact(2.0))) + cs * (d - T::exact(d_p));
    (cc + cs - t, mn, a, eps_t, fst, fsc)
}

/// Nominal flexural strength by strain compatibility, generic over `Real`. None when the
/// inputs describe no section (no tension steel, a non-positive dimension or strength) or the
/// neutral axis cannot be found (enclosed, for intervals).
pub(crate) fn nominal_flexure_r<T: Real>(m: &Cirsoc201MemberData) -> Option<FlexureStateR<T>> {
    if !flexure_inputs_valid(m) {
        return None;
    }
    let b1_f = beta1(m.fc);
    let b1 = beta1_r::<T>(m.fc);
    let c = T::increasing_root(
        |c| flexure_at::<f64>(m, b1_f, c).0,
        |c| flexure_at::<T>(m, b1, c).0,
        1e-9,
        m.h / b1_f + m.d,
    );
    // A root that is not bracketed (f64) or not certified (interval) is NaN, and so is
    // everything computed from it: the callers refuse non-finite results.
    let (_, mn, a, epsilon_t, fs_tension, fs_compression) = flexure_at::<T>(m, b1, c);
    Some(FlexureStateR { mn, a, c, epsilon_t, fs_tension, fs_compression })
}

/// Nominal flexural strength by strain compatibility. None when the inputs describe no
/// section (no tension steel, a non-positive dimension or strength).
pub fn nominal_flexure(m: &Cirsoc201MemberData) -> Option<FlexureState> {
    let f = nominal_flexure_r::<f64>(m)?;
    if f.c.is_finite() && f.mn.is_finite() { Some(f) } else { None }
}

// ==================== Shear ====================

/// Shear strength of the section with the stirrups it has.
#[derive(Debug, Clone, Copy)]
pub struct ShearStateR<T> {
    pub vc: T,
    pub vs: T,
    pub av_min: T,
    pub av_below_min: Tri,
    pub vs_capped: Tri,
}

#[derive(Debug, Clone, Copy)]
pub struct ShearState {
    pub vc: f64,
    pub vs: f64,
    pub av_min: f64,
    pub av_below_min: bool,
    pub vs_capped: bool,
}

pub(crate) fn shear_inputs_valid(m: &Cirsoc201MemberData) -> bool {
    let lambda = m.lambda.unwrap_or(1.0);
    let ag = m.ag.unwrap_or(m.b * m.h);
    [m.fc, m.fy, m.b, m.h, m.d, ag, lambda, m.fyt.unwrap_or(m.fy)].iter().all(|v| v.is_finite() && *v > 0.0)
        && m.as_tension.is_finite()
        && m.as_tension >= 0.0
}

/// Shear strength, generic over `Real`; `axial_compression` (N, compression positive).
pub(crate) fn shear_strength_r<T: Real>(m: &Cirsoc201MemberData, axial_compression: T) -> Option<ShearStateR<T>> {
    if !shear_inputs_valid(m) {
        return None;
    }
    let lambda = T::exact(m.lambda.unwrap_or(1.0));
    let ag = T::exact(m.ag.unwrap_or(m.b * m.h));
    let mpa = T::exact(1e6);
    let fc_mpa = T::exact(m.fc).dv(mpa);
    let sqrt_fc = fc_mpa.sqrt().min(T::lit(SQRT_FC_MAX_MPA));
    let bw_mm = T::exact(m.b) * T::exact(1000.0);
    let d_mm = T::exact(m.d) * T::exact(1000.0);
    // 22.5.3.3 limits the fyt used for Vs. Av,min (9.6.3.4) reads the stirrup's own fyt: a
    // capped fyt there raises Av,min, which can move a member into row (c) of Tabla 22.5.5.1,
    // and row (c) exceeds row (a) when ρw is large, so "conservative" would not be.
    let fyt_actual = m.fyt.unwrap_or(m.fy);
    let fyt = T::exact(fyt_actual.min(FYT_MAX_PA));
    let (av, s) = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if av > 0.0 && s > 0.0 && av.is_finite() && s.is_finite() => (av, s),
        _ => (0.0, 0.0),
    };
    let fyt_mpa = T::exact(fyt_actual).dv(mpa);
    let s_mm = T::exact(s) * T::exact(1000.0);
    let av_min = if s > 0.0 {
        let coef = match m.edition {
            Cirsoc201Edition::E2025 => (T::lit(0.062) * sqrt_fc).max(T::lit(0.35)),
            Cirsoc201Edition::E2005 => sqrt_fc.dv(T::exact(16.0)).max(T::lit(0.33)),
        };
        (coef * bw_mm * s_mm).dv(fyt_mpa).dv(mpa)
    } else {
        T::exact(0.0)
    };
    let av_below_min = if s == 0.0 { Tri::True } else { T::exact(av).lt(av_min) };

    // Nu/Ag in MPa, compression positive.
    let nu_ag = axial_compression.dv(ag * mpa);
    let vc_mpa = match m.edition {
        Cirsoc201Edition::E2025 => {
            let axial = nu_ag.dv(T::exact(6.0)).min(T::lit(0.05) * fc_mpa);
            let base = branch(
                av_below_min,
                || {
                    let lambda_s = (T::exact(2.0).dv(T::exact(1.0) + T::lit(0.004) * d_mm)).sqrt().min(T::exact(1.0));
                    let rho_w = T::exact(m.as_tension).dv(T::exact(m.b) * T::exact(m.d));
                    T::lit(0.66) * lambda_s * lambda * rho_w.powf(T::lit(1.0 / 3.0)) * sqrt_fc
                },
                || T::lit(0.17) * lambda * sqrt_fc,
            );
            (base + axial).max(T::exact(0.0)).min(T::lit(0.42) * lambda * sqrt_fc)
        }
        Cirsoc201Edition::E2005 => {
            let factor = branch(
                T::exact(0.0).le(axial_compression),
                || T::exact(1.0) + nu_ag.dv(T::exact(14.0)),
                || T::exact(1.0) + T::lit(0.3) * nu_ag,
            );
            (factor * lambda * sqrt_fc.dv(T::exact(6.0))).max(T::exact(0.0))
        }
    };
    // ≥ 0 by construction; the max keeps an interval's outward rounding from straddling 0.
    let vc = (vc_mpa * bw_mm * d_mm).max(T::exact(0.0));

    let vs_raw = if s > 0.0 { (T::exact(av) * fyt * T::exact(m.d)).dv(T::exact(s)) } else { T::exact(0.0) };
    let vs_max = match m.edition {
        Cirsoc201Edition::E2025 => T::lit(0.66) * sqrt_fc * bw_mm * d_mm,
        Cirsoc201Edition::E2005 => T::exact(2.0).dv(T::exact(3.0)) * sqrt_fc * bw_mm * d_mm,
    };
    let vs_capped = vs_max.lt(vs_raw);
    Some(ShearStateR { vc, vs: vs_raw.min(vs_max), av_min, av_below_min, vs_capped })
}

pub fn shear_strength(m: &Cirsoc201MemberData, axial_compression: f64) -> Option<ShearState> {
    if !axial_compression.is_finite() {
        return None;
    }
    let s = shear_strength_r::<f64>(m, axial_compression)?;
    Some(ShearState { vc: s.vc, vs: s.vs, av_min: s.av_min, av_below_min: decided(s.av_below_min), vs_capped: decided(s.vs_capped) })
}

/// The Vu above which the clause requires Av,min (9.6.3.1 [11.5.6.1]).
pub(crate) fn min_shear_threshold<T: Real>(m: &Cirsoc201MemberData, vc: T) -> T {
    let lambda = T::exact(m.lambda.unwrap_or(1.0));
    let sqrt_fc = T::exact(m.fc).dv(T::exact(1e6)).sqrt().min(T::lit(SQRT_FC_MAX_MPA));
    match m.edition {
        Cirsoc201Edition::E2025 => {
            T::lit(PHI_V) * T::lit(0.085) * lambda * sqrt_fc * (T::exact(m.b) * T::exact(1000.0)) * (T::exact(m.d) * T::exact(1000.0))
        }
        Cirsoc201Edition::E2005 => T::lit(0.5) * T::lit(PHI_V) * vc,
    }
    .max(T::exact(0.0))
}

/// Whether the minimum shear reinforcement is required at `vu` and missing.
pub(crate) fn min_shear_missing<T: Real>(m: &Cirsoc201MemberData, s: &ShearStateR<T>, vu: T) -> Tri {
    let shallow = m.h <= 0.25;
    if shallow {
        return Tri::False;
    }
    min_shear_threshold(m, s.vc).lt(vu).and(s.av_below_min)
}

/// Whether the ductility clause applies: a moment and little compression (9.3.3.1).
pub(crate) fn ductility_applies<T: Real>(m: &Cirsoc201MemberData, mu: T, nu: T) -> Tri {
    let ag = T::exact(m.ag.unwrap_or(m.b * m.h));
    T::exact(0.0).lt(mu).and(nu.lt(T::lit(0.10) * T::exact(m.fc) * ag))
}

// ==================== Numeric batch boundary ====================

/// Inputs per section in [`beam_batch`].
pub const BATCH_INPUTS: usize = 15;
/// Outputs per section in [`beam_batch`].
pub const BATCH_OUTPUTS: usize = 16;

/// The flexure and shear strength of many sections in one call, for the app's verifier, which
/// asks thousands of times per design run and cannot afford JSON per question.
///
/// Per section, inputs (SI: Pa, m, m², N):
/// `[edition (2005 | 2025), fc, fy, es, b, h, d, As, As', d', Av, s, fyt, Ag, Nu]`,
/// with Nu positive in compression, and 0 for an absent As', d', Av or s.
///
/// Per section, outputs:
/// `[φMn, a, c, εt, φ, fs, fs', εt,min, Vc, Vs, Av,min, Av < Av,min, Vs capped, φVn,
///   flexure valid, shear valid]`, the flags as 1/0. A section the clause cannot evaluate
/// returns 0 in its valid flag and NaN in its strengths, never a number to read as a pass.
pub fn beam_batch(data: &[f64]) -> Result<Vec<f64>, &'static str> {
    if data.len() % BATCH_INPUTS != 0 {
        return Err("cirsoc201_beam_batch: input length is not a multiple of 15");
    }
    let mut out = Vec::with_capacity(data.len() / BATCH_INPUTS * BATCH_OUTPUTS);
    for row in data.chunks_exact(BATCH_INPUTS) {
        let edition = match row[0] {
            e if e == 2005.0 => Cirsoc201Edition::E2005,
            e if e == 2025.0 => Cirsoc201Edition::E2025,
            _ => return Err("cirsoc201_beam_batch: edition must be 2005 or 2025"),
        };
        let opt = |v: f64| if v > 0.0 { Some(v) } else { None };
        let m = Cirsoc201MemberData {
            element_id: 0,
            fc: row[1],
            fy: row[2],
            es: opt(row[3]),
            b: row[4],
            h: row[5],
            d: row[6],
            as_tension: row[7],
            as_compression: opt(row[8]),
            d_prime: opt(row[9]),
            av: opt(row[10]),
            s_stirrup: opt(row[11]),
            fyt: opt(row[12]),
            ag: opt(row[13]),
            lambda: None,
            edition,
        };
        let nu = row[14];
        let es = m.es.unwrap_or(200e9);
        let nan = f64::NAN;
        match nominal_flexure(&m) {
            Some(f) => {
                let phi = phi_flexure(edition, f.epsilon_t, m.fy, es);
                out.extend_from_slice(&[phi * f.mn, f.a, f.c, f.epsilon_t, phi, f.fs_tension, f.fs_compression,
                    ductility_strain(edition, m.fy, es)]);
            }
            None => out.extend_from_slice(&[nan, nan, nan, nan, nan, nan, nan, ductility_strain(edition, m.fy, es)]),
        }
        let flexure_valid = out[out.len() - 8].is_finite();
        match shear_strength(&m, nu) {
            Some(v) => out.extend_from_slice(&[v.vc, v.vs, v.av_min, v.av_below_min as u8 as f64,
                v.vs_capped as u8 as f64, PHI_V * (v.vc + v.vs), flexure_valid as u8 as f64, 1.0]),
            None => out.extend_from_slice(&[nan, nan, nan, 1.0, 0.0, nan, flexure_valid as u8 as f64, 0.0]),
        }
    }
    Ok(out)
}

// ==================== Driver ====================

fn index_forces<T>(forces: &[T], id_of: impl Fn(&T) -> usize) -> std::collections::HashMap<usize, &T> {
    let mut map = std::collections::HashMap::with_capacity(forces.len());
    for f in forces {
        map.entry(id_of(f)).or_insert(f);
    }
    map
}

/// Check all members that have a force record.
pub fn check_cirsoc201_members(input: &Cirsoc201CheckInput) -> Vec<Cirsoc201CheckResult> {
    let by_id = index_forces(&input.forces, |f| f.element_id);
    let mut results: Vec<_> = input
        .members
        .iter()
        .filter_map(|m| by_id.get(&m.element_id).map(|f| check_single_cirsoc201(m, f)))
        .collect();
    results.sort_by_key(|r| r.element_id);
    results
}

pub fn check_single_cirsoc201(m: &Cirsoc201MemberData, f: &Cirsoc201DesignForces) -> Cirsoc201CheckResult {
    let es = m.es.unwrap_or(200e9);
    let mu = f.mu.unwrap_or(0.0).abs();
    let vu = f.vu.unwrap_or(0.0).abs();
    let nu = f.axial_compression.unwrap_or(0.0);
    let mut ledger = CheckLedger::new();

    // ── Flexure ──
    let flex = nominal_flexure(m);
    let (phi, phi_mn) = match flex {
        Some(s) => {
            let phi = phi_flexure(m.edition, s.epsilon_t, m.fy, es);
            (phi, phi * s.mn)
        }
        None => (0.0, 0.0),
    };
    // A section without flexural capacity is not evaluated even when no moment reaches it
    // (an As = 0 beam used to pass).
    let flexure_ratio = ledger.ratio(CIRSOC201_FLEXURE, mu, phi_mn);

    // Ductility of a flexural member: only where it carries a moment and little compression.
    let applies = decided(ductility_applies::<f64>(m, mu, nu));
    let (epsilon_t_min, ductility_ratio) = match (applies, flex) {
        (true, Some(s)) => {
            let lim = ductility_strain(m.edition, m.fy, es);
            (lim, if s.epsilon_t > 0.0 { lim / s.epsilon_t } else { f64::INFINITY })
        }
        (true, None) => {
            ledger.flag(CIRSOC201_DUCTILITY);
            (ductility_strain(m.edition, m.fy, es), 0.0)
        }
        (false, _) => (0.0, 0.0),
    };

    // ── Shear ──
    let shear_r = if nu.is_finite() { shear_strength_r::<f64>(m, nu) } else { None };
    let (vc, vs, av_min, av_below_min, vs_capped) = match &shear_r {
        Some(s) => (s.vc, s.vs, s.av_min, decided(s.av_below_min), decided(s.vs_capped)),
        None => (0.0, 0.0, 0.0, true, false),
    };
    let phi_vn = PHI_V * (vc + vs);
    let shear_ratio = ledger.ratio_if_loaded(CIRSOC201_SHEAR, vu, phi_vn);

    // Where the clause asks for the minimum shear reinforcement.
    let min_shear_reinforcement_missing = shear_r.as_ref().is_some_and(|s| decided(min_shear_missing::<f64>(m, s, vu)));
    if shear_r.is_none() && vu > 0.0 {
        ledger.flag(CIRSOC201_SHEAR);
    }

    let checks = [
        (flexure_ratio, CIRSOC201_FLEXURE),
        (ductility_ratio, CIRSOC201_DUCTILITY),
        (shear_ratio, CIRSOC201_SHEAR),
        (if min_shear_reinforcement_missing { f64::INFINITY } else { 0.0 }, CIRSOC201_MIN_SHEAR),
    ];
    let (mut unity_ratio, mut governing) = ledger.governing(&checks);
    if min_shear_reinforcement_missing || ductility_ratio.is_infinite() {
        unity_ratio = f64::INFINITY;
        governing = if min_shear_reinforcement_missing { CIRSOC201_MIN_SHEAR } else { CIRSOC201_DUCTILITY };
    }
    let pass = ledger.all_evaluated()
        && checks.iter().all(|(r, _)| *r <= 1.0)
        && !min_shear_reinforcement_missing;
    let governing_check = if ledger.all_evaluated() {
        governing.to_string()
    } else {
        format!("{governing} (incomplete)")
    };

    let s = flex.unwrap_or(FlexureState { mn: 0.0, a: 0.0, c: 0.0, epsilon_t: 0.0, fs_tension: 0.0, fs_compression: 0.0 });
    Cirsoc201CheckResult {
        element_id: m.element_id,
        edition: m.edition,
        phi_mn,
        flexure_ratio,
        a: s.a,
        c: s.c,
        epsilon_t: s.epsilon_t,
        phi,
        fs_tension: s.fs_tension,
        fs_compression: s.fs_compression,
        epsilon_t_min,
        ductility_ratio,
        phi_vn,
        shear_ratio,
        vc,
        vs,
        av_min,
        av_below_min,
        min_shear_reinforcement_missing,
        vs_capped,
        phi_v: PHI_V,
        unity_ratio,
        governing_check,
        pass,
        unevaluated: ledger.into_unevaluated(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_matches_the_json_checker() {
        let row = [2025.0, 25e6, 420e6, 0.0, 0.3, 0.5, 0.45, 1.257e-3, 4.0e-4, 0.05, 1.57e-4, 0.15, 0.0, 0.0, 2.0e5];
        let out = beam_batch(&row).unwrap();
        assert_eq!(out.len(), BATCH_OUTPUTS);
        let m = Cirsoc201MemberData {
            element_id: 1, fc: 25e6, fy: 420e6, es: None, b: 0.3, h: 0.5, d: 0.45, as_tension: 1.257e-3,
            as_compression: Some(4.0e-4), d_prime: Some(0.05), av: Some(1.57e-4), s_stirrup: Some(0.15),
            fyt: None, ag: None, lambda: None, edition: Cirsoc201Edition::E2025,
        };
        let r = check_single_cirsoc201(&m, &Cirsoc201DesignForces {
            element_id: 1, mu: Some(1.0), vu: Some(1.0), axial_compression: Some(2.0e5) });
        assert_eq!(out[0], r.phi_mn);
        assert_eq!(out[13], r.phi_vn);
        assert_eq!(out[14], 1.0);
        assert_eq!(out[15], 1.0);
    }

    #[test]
    fn batch_refuses_rather_than_guesses() {
        assert!(beam_batch(&[0.0; 14]).is_err());
        let mut row = [2025.0, 25e6, 420e6, 0.0, 0.3, 0.5, 0.45, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        let out = beam_batch(&row).unwrap();
        assert_eq!(out[14], 0.0, "no tension steel: flexure not valid");
        assert!(out[0].is_nan());
        row[0] = 2019.0;
        assert!(beam_batch(&row).is_err());
    }

    #[test]
    fn beta1_follows_the_clause() {
        assert_eq!(beta1(20e6), 0.85);
        assert_eq!(beta1(28e6), 0.85);
        assert!((beta1(35e6) - 0.80).abs() < 1e-12);
        assert_eq!(beta1(70e6), 0.65);
    }

    #[test]
    fn phi_ramp_ends_at_ety_plus_3_permil_in_2025() {
        let (fy, es) = (500e6, 200e9);
        // 2025: εty = 0,0025, tension-controlled from 0,0055.
        assert!((phi_flexure(Cirsoc201Edition::E2025, 0.0055, fy, es) - 0.90).abs() < 1e-12);
        let at5 = phi_flexure(Cirsoc201Edition::E2025, 0.005, fy, es);
        assert!((at5 - (0.65 + 0.25 * 0.0025 / 0.003)).abs() < 1e-12, "{at5}");
        // 2005: tension-controlled from 0,005 for any fy.
        assert!((phi_flexure(Cirsoc201Edition::E2005, 0.005, fy, es) - 0.90).abs() < 1e-12);
        assert_eq!(phi_flexure(Cirsoc201Edition::E2025, 0.002, fy, es), 0.65);
    }
}
