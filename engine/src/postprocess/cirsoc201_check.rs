//! Reinforced concrete design checks per CIRSOC 201-05.
//!
//! Argentine concrete design code based on ACI 318 with local modifications.
//! Uses load and resistance factor design (LRFD/USD).
//! Covers flexure (Whitney stress block, strain compatibility) and shear.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};
use crate::postprocess::rc_flexure::RcFlexureSection;

// ==================== Types ====================

/// CIRSOC 201 member data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201MemberData {
    pub element_id: usize,
    /// Specified concrete compressive strength f'c (Pa)
    pub fc: f64,
    /// Steel yield strength fy (Pa)
    pub fy: f64,
    /// Modulus of elasticity of steel Es (Pa, default 200 GPa)
    #[serde(default)]
    pub es: Option<f64>,
    /// Section width b (m)
    pub b: f64,
    /// Total depth h (m)
    pub h: f64,
    /// Effective depth d (m)
    pub d: f64,
    /// Tension reinforcement area As (m²)
    pub as_tension: f64,
    /// Compression reinforcement area As' (m²)
    #[serde(default)]
    pub as_compression: Option<f64>,
    /// Compression steel depth d' (m)
    #[serde(default)]
    pub d_prime: Option<f64>,
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

/// Applied design forces.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201DesignForces {
    pub element_id: usize,
    /// Factored bending moment Mu (N-m)
    #[serde(default)]
    pub mu: Option<f64>,
    /// Factored shear Vu (N)
    #[serde(default)]
    pub vu: Option<f64>,
}

/// Input for CIRSOC 201 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201CheckInput {
    pub members: Vec<Cirsoc201MemberData>,
    pub forces: Vec<Cirsoc201DesignForces>,
}

/// Result of CIRSOC 201 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cirsoc201CheckResult {
    pub element_id: usize,
    /// Nominal flexural capacity phi*Mn (N-m)
    pub phi_mn: f64,
    /// Flexure ratio Mu / (phi*Mn)
    pub flexure_ratio: f64,
    /// Nominal shear capacity phi*Vn (N)
    pub phi_vn: f64,
    /// Shear ratio Vu / (phi*Vn)
    pub shear_ratio: f64,
    /// Concrete shear contribution Vc (N)
    pub vc: f64,
    /// Steel shear contribution Vs (N)
    pub vs: f64,
    /// Neutral axis depth a (m) — Whitney stress block
    pub a: f64,
    /// Phi factor used
    pub phi: f64,
    /// Overall pass (false when any check could not be evaluated)
    pub pass: bool,
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== Implementation ====================

/// beta1 per CIRSOC 201 10.2.7.3 (same as ACI 318).
pub(crate) fn compute_beta1<T: Real>(fc: f64) -> T {
    let fc_mpa = T::exact(fc).dv(T::exact(1e6));
    let (lo, hi) = (T::exact(28.0), T::exact(56.0));
    branch(
        fc_mpa.le(lo),
        || T::lit(0.85),
        || branch(hi.le(fc_mpa), || T::lit(0.65), || T::lit(0.85) - T::lit(0.05) * (fc_mpa - lo).dv(T::exact(7.0))),
    )
}

/// Compression-controlled strain limit (CIRSOC 201 10.3.3): εy = fy/Es, which
/// may be taken as 0.002 for fy = 420 MPa (and, conservatively, below).
///
/// The fixed 0.002 used for every grade overstated phi in the transition
/// zone for ADN 500 (εy = 0.0025): at εt = 0.0025 phi came out 0.69, not 0.65.
fn epsilon_ty<T: Real>(fy: f64, es: f64) -> T {
    branch(T::exact(fy).le(T::exact(420e6)), || T::lit(0.002), || T::exact(fy).dv(T::exact(es)))
}

/// Phi for flexure from the net tensile strain (CIRSOC 201 9.3.2).
pub(crate) fn compute_phi<T: Real>(epsilon_t: T, fy: f64, es: f64) -> T {
    let ety = epsilon_ty::<T>(fy, es);
    let etc = T::lit(0.005);
    branch(
        etc.le(epsilon_t),
        || T::lit(0.90), // tension-controlled
        || {
            branch(
                epsilon_t.le(ety),
                || T::lit(0.65), // compression-controlled
                || T::lit(0.65) + T::lit(0.25) * (epsilon_t - ety).dv(etc - ety),
            )
        },
    )
}

/// CIRSOC 201 flexural strength (10.2, strain compatibility).
pub(crate) struct Cirsoc201Flexure<T> {
    pub phi_mn: T,
    pub a: T,
    pub phi: T,
}

/// CIRSOC 201 shear strength (Cap. 11).
pub(crate) struct Cirsoc201Shear<T> {
    pub phi_vn: T,
    pub vc: T,
    pub vs: T,
}

pub(crate) fn flexure_section(m: &Cirsoc201MemberData) -> RcFlexureSection {
    let (as_c, d_prime) = match (m.as_compression, m.d_prime) {
        (Some(a), Some(d)) => (a, d),
        _ => (0.0, 0.0),
    };
    RcFlexureSection {
        fc: m.fc,
        fy: m.fy,
        es: m.es.unwrap_or(200e9),
        bw: m.b,
        bf: m.b,
        hf: 0.0,
        d: m.d,
        as_t: m.as_tension,
        as_c,
        d_prime,
    }
}

/// Flexural strength. Generic over `Real` so the certified check evaluates the
/// same formulas in interval arithmetic.
pub(crate) fn cirsoc201_flexure<T: Real>(m: &Cirsoc201MemberData) -> Cirsoc201Flexure<T> {
    let es = m.es.unwrap_or(200e9);
    let sec = flexure_section(m);
    let f = sec.strength(compute_beta1::<T>(m.fc), compute_beta1::<f64>(m.fc));
    let phi = compute_phi(f.epsilon_t, m.fy, es);
    Cirsoc201Flexure { phi_mn: phi * f.mn, a: f.a, phi }
}

/// Shear strength (CIRSOC 201 11.3.1.1, 11.5.7.2, 11.5.7.9).
pub(crate) fn cirsoc201_shear<T: Real>(m: &Cirsoc201MemberData) -> Cirsoc201Shear<T> {
    let lambda = T::exact(m.lambda.unwrap_or(1.0));
    // Empirical formula with f'c in MPa and bw, d in mm (result in N).
    let fc_mpa = T::exact(m.fc).dv(T::exact(1e6));
    let bw_mm = T::exact(m.b) * T::exact(1000.0);
    let d_mm = T::exact(m.d) * T::exact(1000.0);
    let sqrt_fc = fc_mpa.sqrt();
    // 11.1.2: sqrt(f'c) <= 25/3 MPa in Vc. Uncapped, Vc was overstated for
    // f'c > 69 MPa. (11.1.2.1 relaxes this with minimum web reinforcement;
    // the cap is applied regardless, conservatively.)
    let sqrt_fc_vc = sqrt_fc.min(T::exact(25.0).dv(T::exact(3.0)));
    let vc = T::lit(0.17) * lambda * sqrt_fc_vc * bw_mm * d_mm;

    // Vs from stirrups
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => (T::exact(av) * T::exact(m.fy) * T::exact(m.d)).dv(T::exact(s)),
        _ => T::exact(0.0),
    };
    // Vs <= (2/3)·sqrt(f'c)·bw·d (11.5.7.9, written 0.66 as in ACI 318M)
    let vs_max = T::lit(0.66) * sqrt_fc * bw_mm * d_mm;
    let vs = vs.min(vs_max);

    let phi_vn = T::lit(0.75) * (vc + vs);
    Cirsoc201Shear { phi_vn, vc, vs }
}

pub(crate) const CIRSOC201_FLEXURE: &str = "Flexure CIRSOC 201";
pub(crate) const CIRSOC201_SHEAR: &str = "Shear CIRSOC 201";

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

/// Check all CIRSOC 201 members.
pub fn check_cirsoc201_members(input: &Cirsoc201CheckInput) -> Vec<Cirsoc201CheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_cirsoc201(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_cirsoc201(
    m: &Cirsoc201MemberData,
    f: &Cirsoc201DesignForces,
) -> Cirsoc201CheckResult {
    let mu = f.mu.unwrap_or(0.0).abs();
    let vu = f.vu.unwrap_or(0.0).abs();

    let Cirsoc201Flexure { phi_mn, a, phi } = cirsoc201_flexure::<f64>(m);
    let Cirsoc201Shear { phi_vn, vc, vs } = cirsoc201_shear::<f64>(m);

    // A capacity that is zero, negative or not finite was read as ratio 0 and
    // the member passed (e.g. As = 0 passed any moment). The ledger records it
    // and the member no longer passes.
    let mut ledger = CheckLedger::new();
    let flexure_ratio = ledger.ratio(CIRSOC201_FLEXURE, mu, phi_mn);
    let shear_ratio = ledger.ratio_if_loaded(CIRSOC201_SHEAR, vu, phi_vn);

    let pass = ledger.all_evaluated() && flexure_ratio <= 1.0 && shear_ratio <= 1.0;

    Cirsoc201CheckResult {
        element_id: m.element_id,
        phi_mn,
        flexure_ratio,
        phi_vn,
        shear_ratio,
        vc,
        vs,
        a,
        phi,
        pass,
        unevaluated: ledger.into_unevaluated(),
    }
}
