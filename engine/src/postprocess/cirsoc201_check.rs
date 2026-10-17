//! Reinforced concrete design checks per CIRSOC 201-05.
//!
//! Argentine concrete design code based on ACI 318 with local modifications.
//! Uses load and resistance factor design (LRFD/USD).
//! Covers flexure (Whitney stress block), shear, and combined loading.

use serde::{Deserialize, Serialize};

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
    /// Overall pass
    pub pass: bool,
}

// ==================== Implementation ====================

/// Compute beta1 per CIRSOC 201 (same as ACI 318).
fn compute_beta1(fc: f64) -> f64 {
    let fc_mpa = fc / 1e6;
    if fc_mpa <= 28.0 {
        0.85
    } else if fc_mpa >= 56.0 {
        0.65
    } else {
        0.85 - 0.05 * (fc_mpa - 28.0) / 7.0
    }
}

/// Compute phi factor based on net tensile strain (CIRSOC 201-2005 9.3.2,
/// 10.3.3, 10.3.4): compression-controlled at εt ≤ fy/Es, tension-controlled
/// at εt ≥ 0.005, linear between.
///
/// The compression-controlled limit is fy/Es (10.3.3); the 0.002 used before
/// is the value 10.3.3 *permits* for fy = 420 MPa only, and was applied to
/// every grade.
fn compute_phi(epsilon_t: f64, fy: f64, es: f64) -> f64 {
    let epsilon_ty = if es > 0.0 { fy / es } else { 0.002 };
    if epsilon_t >= 0.005 {
        0.90 // Tension-controlled
    } else if epsilon_t <= epsilon_ty {
        0.65 // Compression-controlled
    } else {
        0.65 + 0.25 * (epsilon_t - epsilon_ty) / (0.005 - epsilon_ty)
    }
}


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
    let es = m.es.unwrap_or(200e9);
    let lambda = m.lambda.unwrap_or(1.0);
    let mu = f.mu.unwrap_or(0.0).abs();
    let vu = f.vu.unwrap_or(0.0).abs();

    // ==================== Flexure ====================

    let beta1 = compute_beta1(m.fc);

    // Whitney stress block: C = 0.85 * f'c * a * b, T = As * fy
    // a = As * fy / (0.85 * f'c * b)
    let a = m.as_tension * m.fy / (0.85 * m.fc * m.b);

    // Include compression steel if present: neutral axis by strain
    // compatibility, shared with the ACI check (same 22.2 / 10.2 hypotheses).
    let (a_final, mn) = if let (Some(as_c), Some(d_p)) = (m.as_compression, m.d_prime) {
        let (a_new, _c, fsc) = crate::postprocess::rc_check::doubly_reinforced_equilibrium(
            m.fc, m.fy, es, m.b, m.as_tension, as_c, d_p, beta1,
        );
        let mn_c = 0.85 * m.fc * a_new * m.b * (m.d - a_new / 2.0);
        let mn_s = as_c * fsc * (m.d - d_p);
        (a_new, mn_c + mn_s)
    } else {
        let mn_val = m.as_tension * m.fy * (m.d - a / 2.0);
        (a, mn_val)
    };

    // Net tensile strain for phi
    let c_final = a_final / beta1;
    let epsilon_t = 0.003 * (m.d - c_final) / c_final;
    let phi = compute_phi(epsilon_t, m.fy, es);

    let phi_mn = phi * mn;
    let flexure_ratio = if phi_mn > 0.0 { mu / phi_mn } else { 0.0 };

    // ==================== Shear (CIRSOC 201 Cap. 11) ====================

    // CIRSOC 201-2005 11.3.1.1: Vc = (1/6)·λ·√f'c·bw·d (MPa, mm → N).
    // It was 0.17, the ACI 318M rounding of the same term — 2 % above the
    // CIRSOC text, as INTI's worked example 3.I (Vc = 85.8 kN) shows.
    let fc_mpa = m.fc / 1e6;
    let bw_mm = m.b * 1000.0;
    let d_mm = m.d * 1000.0;
    let vc = lambda * fc_mpa.sqrt() * bw_mm * d_mm / 6.0;

    // Vs from stirrups
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => av * m.fy * m.d / s,
        _ => 0.0,
    };

    // CIRSOC 201-2005 11.5.7.9: Vs <= (2/3)·√f'c·bw·d
    let vs_max = 2.0 * fc_mpa.sqrt() * bw_mm * d_mm / 3.0;
    let vs = vs.min(vs_max);

    let phi_v = 0.75;
    let phi_vn = phi_v * (vc + vs);
    let shear_ratio = if phi_vn > 0.0 { vu / phi_vn } else { 0.0 };

    let pass = flexure_ratio <= 1.0 && shear_ratio <= 1.0;

    Cirsoc201CheckResult {
        element_id: m.element_id,
        phi_mn,
        flexure_ratio,
        phi_vn,
        shear_ratio,
        vc,
        vs,
        a: a_final,
        phi,
        pass,
    }
}
