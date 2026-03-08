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

/// Compute phi factor based on net tensile strain (CIRSOC 201 9.3).
fn compute_phi(epsilon_t: f64) -> f64 {
    let epsilon_ty = 0.002; // fy/Es for 420 MPa steel
    if epsilon_t >= 0.005 {
        0.90 // Tension-controlled
    } else if epsilon_t <= epsilon_ty {
        0.65 // Compression-controlled
    } else {
        0.65 + 0.25 * (epsilon_t - epsilon_ty) / (0.005 - epsilon_ty)
    }
}

/// Check all CIRSOC 201 members.
pub fn check_cirsoc201_members(input: &Cirsoc201CheckInput) -> Vec<Cirsoc201CheckResult> {
    let mut results = Vec::new();

    for member in &input.members {
        let forces = input
            .forces
            .iter()
            .find(|f| f.element_id == member.element_id);
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
    let c = a / beta1;

    // Include compression steel if present
    let (a_final, mn) = if let (Some(as_c), Some(d_p)) = (m.as_compression, m.d_prime) {
        let epsilon_cu = 0.003;
        let epsilon_sc = epsilon_cu * (c - d_p) / c;
        let fsc = (epsilon_sc * es).min(m.fy);
        let fsc = fsc.max(-m.fy); // Clamp

        // Recompute a with compression steel
        let a_new = (m.as_tension * m.fy - as_c * fsc) / (0.85 * m.fc * m.b);
        let _c_new = a_new / beta1;

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
    let phi = compute_phi(epsilon_t);

    let phi_mn = phi * mn;
    let flexure_ratio = if phi_mn > 0.0 { mu / phi_mn } else { 0.0 };

    // ==================== Shear (CIRSOC 201 Cap. 11) ====================

    // CIRSOC 201 uses the same empirical formula as ACI 318M
    // Vc = 0.17 * lambda * sqrt(f'c_MPa) * bw_mm * d_mm (in Newtons)
    let fc_mpa = m.fc / 1e6;
    let bw_mm = m.b * 1000.0;
    let d_mm = m.d * 1000.0;
    let vc = 0.17 * lambda * fc_mpa.sqrt() * bw_mm * d_mm;

    // Vs from stirrups
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => av * m.fy * m.d / s,
        _ => 0.0,
    };

    // Maximum Vs per CIRSOC 201 (same as ACI)
    let vs_max = 0.66 * fc_mpa.sqrt() * bw_mm * d_mm;
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
