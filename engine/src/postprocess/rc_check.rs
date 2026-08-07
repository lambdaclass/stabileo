//! Reinforced concrete member design checks per ACI 318-19 (USD).
//!
//! Given analysis results and section properties, computes unity ratios
//! for flexure, shear, and combined loading.

use serde::{Deserialize, Serialize};

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
}

// ==================== ACI 318-19 Design Checks ====================

const PHI_V: f64 = 0.75; // Shear

/// Run ACI 318-19 RC design checks on all members.
pub fn check_rc_members(input: &RCCheckInput) -> Vec<RCCheckResult> {
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

        let result = check_single_rc_member(member, forces);
        results.push(result);
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_rc_member(m: &RCMemberData, f: &RCDesignForces) -> RCCheckResult {
    let es = m.es.unwrap_or(200e9);

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
        match m.section_type {
            RCSectionType::Rectangular => flexural_capacity_rectangular(m, es),
            RCSectionType::TBeam => flexural_capacity_tbeam(m, es),
        }
    };

    // Shear capacity
    let phi_vn = shear_capacity(m);

    // Demand ratios
    let mu_abs = f.mu.abs();
    let vu_abs = f.vu.unwrap_or(0.0).abs();

    let flexure_ratio = if phi_mn > 0.0 { mu_abs / phi_mn } else { 0.0 };
    let shear_ratio = if phi_vn > 0.0 {
        vu_abs / phi_vn
    } else {
        0.0
    };

    let tension_controlled = epsilon_t >= 0.005;

    // Governing
    let checks = [
        (flexure_ratio, "Flexure ACI 318"),
        (shear_ratio, "Shear ACI 318"),
    ];

    let (unity_ratio, governing_check) = checks
        .iter()
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap())
        .map(|(r, name)| (*r, name.to_string()))
        .unwrap_or((0.0, "None".to_string()));

    RCCheckResult {
        element_id: m.element_id,
        unity_ratio,
        governing_check,
        flexure_ratio,
        shear_ratio,
        phi_mn,
        phi_vn,
        a,
        c,
        epsilon_t,
        phi_flexure: phi_flex,
        tension_controlled,
    }
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
/// Returns (phi*Mn, a, c, epsilon_t, phi).
fn axial_flexure_capacity(m: &RCMemberData, es: f64, pu: f64) -> (f64, f64, f64, f64, f64) {
    let beta1 = compute_beta1(m.fc);
    let as_comp = m.as_compression.unwrap_or(0.0);
    let d_prime = m.d_prime.unwrap_or(0.0);

    // Section forces at a trial neutral axis depth, moments taken about
    // mid-depth so that P and M share one origin.
    let evaluate = |c: f64| -> (f64, f64, f64, f64) {
        let a = (beta1 * c).min(m.h);
        let cc = 0.85 * m.fc * a * m.b;

        let strain_at = |depth: f64| if c > 0.0 { 0.003 * (c - depth) / c } else { 0.0 };

        // Compression steel: net of the concrete it displaces.
        let fs_comp = (strain_at(d_prime) * es).clamp(-m.fy, m.fy);
        let cs = as_comp * (fs_comp - 0.85 * m.fc);

        // Tension steel: positive strain_at means compression, so flip.
        let epsilon_t = -strain_at(m.d);
        let fs_tens = (epsilon_t * es).clamp(-m.fy, m.fy);
        let t = m.as_tension * fs_tens;

        let pn = cc + cs - t;
        let mn = cc * (m.h / 2.0 - a / 2.0)
            + cs * (m.h / 2.0 - d_prime)
            + t * (m.d - m.h / 2.0);
        let phi = compute_phi(epsilon_t, m.fy, es);
        (phi * pn, phi * mn, epsilon_t, phi)
    };

    // phi*Pn is monotonic in c over the practical range, so bisect. The upper
    // bound is generous enough to cover pure compression on a deep section.
    let mut lo = 1e-6_f64;
    let mut hi = 10.0 * m.h.max(m.d);
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
    (phi_mn.max(0.0), a, c, epsilon_t, phi)
}

/// ACI 318-19 Sec 22.2: Flexural capacity of rectangular section.
/// Returns (phi*Mn, a, c, epsilon_t, phi).
fn flexural_capacity_rectangular(m: &RCMemberData, es: f64) -> (f64, f64, f64, f64, f64) {
    let beta1 = compute_beta1(m.fc);

    // Singly reinforced first
    // Whitney stress block: C = 0.85 * f'c * a * b,  T = As * fy
    // Equilibrium: a = As * fy / (0.85 * f'c * b)
    let as_comp = m.as_compression.unwrap_or(0.0);
    let d_prime = m.d_prime.unwrap_or(0.0);

    if as_comp > 0.0 && d_prime > 0.0 {
        // Doubly reinforced section
        doubly_reinforced_capacity(m, es, beta1, as_comp, d_prime)
    } else {
        // Singly reinforced
        singly_reinforced_capacity(m, es, beta1)
    }
}

fn singly_reinforced_capacity(
    m: &RCMemberData,
    es: f64,
    beta1: f64,
) -> (f64, f64, f64, f64, f64) {
    let a = m.as_tension * m.fy / (0.85 * m.fc * m.b);
    let c = a / beta1;

    // Net tensile strain (ACI 318-19 Table 21.2.2)
    let epsilon_t = if c > 0.0 {
        0.003 * (m.d - c) / c
    } else {
        f64::INFINITY
    };

    let phi = compute_phi(epsilon_t, m.fy, es);

    // Mn = As * fy * (d - a/2)
    let mn = m.as_tension * m.fy * (m.d - a / 2.0);
    (phi * mn, a, c, epsilon_t, phi)
}

fn doubly_reinforced_capacity(
    m: &RCMemberData,
    es: f64,
    beta1: f64,
    as_comp: f64,
    d_prime: f64,
) -> (f64, f64, f64, f64, f64) {
    // Assume compression steel yields (verify after)
    // T = As*fy, C_concrete = 0.85*fc*a*b, C_steel = As'*fy
    // As*fy = 0.85*fc*a*b + As'*fy
    // a = (As - As') * fy / (0.85 * fc * b)
    let a = (m.as_tension - as_comp) * m.fy / (0.85 * m.fc * m.b);
    let c = a / beta1;

    // Check if compression steel yields
    let epsilon_s_prime = if c > 0.0 {
        0.003 * (c - d_prime) / c
    } else {
        0.0
    };
    let fy_prime = if epsilon_s_prime * es >= m.fy {
        m.fy
    } else {
        epsilon_s_prime * es
    };

    // Recalculate if compression steel doesn't yield
    let a = if (fy_prime - m.fy).abs() > 1.0 {
        // Use actual stress in compression steel
        (m.as_tension * m.fy - as_comp * fy_prime) / (0.85 * m.fc * m.b)
    } else {
        a
    };
    let c = a / beta1;

    let epsilon_t = if c > 0.0 {
        0.003 * (m.d - c) / c
    } else {
        f64::INFINITY
    };

    let phi = compute_phi(epsilon_t, m.fy, es);

    // Mn = 0.85*fc*a*b*(d - a/2) + As'*fs'*(d - d')
    let mn =
        0.85 * m.fc * a * m.b * (m.d - a / 2.0) + as_comp * fy_prime * (m.d - d_prime);
    (phi * mn, a, c, epsilon_t, phi)
}

/// ACI 318-19: Flexural capacity of T-beam.
fn flexural_capacity_tbeam(m: &RCMemberData, es: f64) -> (f64, f64, f64, f64, f64) {
    let beta1 = compute_beta1(m.fc);
    let bf = m.bf.unwrap_or(m.b);
    let hf = m.hf.unwrap_or(m.h * 0.15);

    // Check if neutral axis is in flange
    let a_flange = m.as_tension * m.fy / (0.85 * m.fc * bf);

    if a_flange <= hf {
        // NA in flange — treat as rectangular with width bf
        let a = a_flange;
        let c = a / beta1;
        let epsilon_t = if c > 0.0 {
            0.003 * (m.d - c) / c
        } else {
            f64::INFINITY
        };
        let phi = compute_phi(epsilon_t, m.fy, es);
        let mn = m.as_tension * m.fy * (m.d - a / 2.0);
        (phi * mn, a, c, epsilon_t, phi)
    } else {
        // NA in web — T-beam behavior
        // Flange contribution: Cf = 0.85 * fc * (bf - bw) * hf
        let cf = 0.85 * m.fc * (bf - m.b) * hf;
        // Remaining tension force for web: Tw = As*fy - Cf
        let tw = m.as_tension * m.fy - cf;
        // Web stress block: aw = Tw / (0.85 * fc * bw)
        let aw = tw / (0.85 * m.fc * m.b);
        let c = aw / beta1;

        let epsilon_t = if c > 0.0 {
            0.003 * (m.d - c) / c
        } else {
            f64::INFINITY
        };
        let phi = compute_phi(epsilon_t, m.fy, es);

        // Mn = Cf*(d - hf/2) + 0.85*fc*aw*bw*(d - aw/2)
        let mn = cf * (m.d - hf / 2.0) + 0.85 * m.fc * aw * m.b * (m.d - aw / 2.0);
        (phi * mn, aw, c, epsilon_t, phi)
    }
}

/// ACI 318M-19 Sec 22.5: Shear capacity.
/// Formula uses f'c in MPa and dimensions in mm (empirical, not dimensionally homogeneous).
fn shear_capacity(m: &RCMemberData) -> f64 {
    let lambda = m.lambda.unwrap_or(1.0);
    let fc_mpa = m.fc / 1e6;
    let bw_mm = m.b * 1000.0;
    let d_mm = m.d * 1000.0;

    // Vc = 0.17 * lambda * sqrt(f'c_MPa) * bw_mm * d_mm  (N)
    let vc = 0.17 * lambda * fc_mpa.sqrt() * bw_mm * d_mm;

    // Vs = Av * fy * d / s  (all in base SI: m², Pa, m, m → N)
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => av * m.fy * m.d / s,
        _ => 0.0,
    };

    // Maximum Vs limit: 0.66 * sqrt(f'c_MPa) * bw_mm * d_mm (N)
    let vs_max = 0.66 * fc_mpa.sqrt() * bw_mm * d_mm;
    let vs = vs.min(vs_max);

    PHI_V * (vc + vs)
}

/// ACI 318-19 Table 22.2.2.4.3: beta1 factor.
fn compute_beta1(fc: f64) -> f64 {
    let fc_mpa = fc / 1e6;
    if fc_mpa <= 28.0 {
        0.85
    } else if fc_mpa <= 56.0 {
        0.85 - 0.05 * (fc_mpa - 28.0) / 7.0
    } else {
        0.65
    }
}

/// ACI 318-19 Table 21.2.2: Strength reduction factor phi.
fn compute_phi(epsilon_t: f64, fy: f64, es: f64) -> f64 {
    let epsilon_y = fy / es;
    if epsilon_t >= epsilon_y + 0.003 {
        // Tension-controlled
        0.90
    } else if epsilon_t <= epsilon_y {
        // Compression-controlled
        0.65
    } else {
        // Transition zone
        0.65 + 0.25 * (epsilon_t - epsilon_y) / 0.003
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beta1_values() {
        assert!((compute_beta1(20e6) - 0.85).abs() < 1e-10);
        assert!((compute_beta1(28e6) - 0.85).abs() < 1e-10);
        assert!((compute_beta1(35e6) - 0.80).abs() < 1e-2);
        assert!((compute_beta1(56e6) - 0.65).abs() < 1e-10);
        assert!((compute_beta1(70e6) - 0.65).abs() < 1e-10);
    }

    #[test]
    fn test_phi_values() {
        // Tension controlled: epsilon_t >= fy/Es + 0.003 = 0.0021 + 0.003 = 0.0051
        assert!((compute_phi(0.006, 420e6, 200e9) - 0.90).abs() < 1e-6);
        // Compression controlled: epsilon_t <= fy/Es = 0.0021
        assert!((compute_phi(0.002, 420e6, 200e9) - 0.65).abs() < 1e-6);
    }
}
