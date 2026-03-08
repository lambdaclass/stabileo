//! Masonry design checks per TMS 402/ACI 530 (strength design).
//!
//! Covers reinforced masonry walls and columns: axial compression
//! with slenderness effects, flexural capacity, shear capacity,
//! and combined axial-flexure interaction.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// Masonry member data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasonryMemberData {
    pub element_id: usize,
    /// Specified masonry compressive strength f'm (Pa)
    pub fm: f64,
    /// Steel yield strength fy (Pa)
    pub fy: f64,
    /// Elastic modulus of masonry Em (Pa) — if None, 900*f'm per TMS 402
    #[serde(default)]
    pub em: Option<f64>,
    /// Effective width b (m) — for wall: per unit length or actual width
    pub b: f64,
    /// Total depth/thickness t (m)
    pub t: f64,
    /// Effective depth d (m) — from extreme compression to centroid of tension steel
    pub d: f64,
    /// Tension reinforcement area As (m²)
    pub as_tension: f64,
    /// Clear height of wall/column h (m)
    pub h: f64,
    /// Effective height factor (default 1.0)
    #[serde(default)]
    pub k: Option<f64>,
    /// Net cross-sectional area An (m²) — if None, b*t
    #[serde(default)]
    pub an: Option<f64>,
    /// Shear reinforcement area Av per spacing (m²)
    #[serde(default)]
    pub av: Option<f64>,
    /// Shear reinforcement spacing s (m)
    #[serde(default)]
    pub s_stirrup: Option<f64>,
}

/// Applied forces on masonry member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasonryDesignForces {
    pub element_id: usize,
    /// Factored axial compression Pu (N, compression positive)
    #[serde(default)]
    pub pu: Option<f64>,
    /// Factored moment Mu (N-m)
    #[serde(default)]
    pub mu: Option<f64>,
    /// Factored shear Vu (N)
    #[serde(default)]
    pub vu: Option<f64>,
}

/// Input for masonry check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasonryCheckInput {
    pub members: Vec<MasonryMemberData>,
    pub forces: Vec<MasonryDesignForces>,
}

/// Result of masonry check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasonryCheckResult {
    pub element_id: usize,
    /// Axial ratio Pu / (phi * Pa)
    pub axial_ratio: f64,
    /// Flexure ratio Mu / (phi * Mn)
    pub flexure_ratio: f64,
    /// Shear ratio Vu / (phi * Vn)
    pub shear_ratio: f64,
    /// Axial-flexure interaction ratio
    pub interaction_ratio: f64,
    /// Nominal axial capacity Pn (N)
    pub pn: f64,
    /// Nominal flexural capacity Mn (N-m)
    pub mn: f64,
    /// Nominal shear capacity Vn (N)
    pub vn: f64,
    /// Slenderness h/t
    pub slenderness: f64,
    /// Overall pass
    pub pass: bool,
}

// ==================== Constants ====================

const PHI_AXIAL: f64 = 0.90;
const PHI_FLEXURE: f64 = 0.90;
const PHI_SHEAR: f64 = 0.80;

// ==================== Implementation ====================

/// Check all masonry members.
pub fn check_masonry_members(input: &MasonryCheckInput) -> Vec<MasonryCheckResult> {
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
        results.push(check_single_masonry(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_masonry(m: &MasonryMemberData, f: &MasonryDesignForces) -> MasonryCheckResult {
    let em = m.em.unwrap_or(900.0 * m.fm);
    let k = m.k.unwrap_or(1.0);
    let an = m.an.unwrap_or(m.b * m.t);
    let pu = f.pu.unwrap_or(0.0);
    let mu = f.mu.unwrap_or(0.0).abs();
    let vu = f.vu.unwrap_or(0.0).abs();

    let h_eff = k * m.h;
    let slenderness = h_eff / m.t;

    // ==================== Axial Compression (TMS 402 Sec 9.3.5) ====================

    // Slenderness reduction factor
    let pn = if slenderness <= 99.0 {
        // Pn = 0.80 * [0.80 * f'm * (An - As) + fy * As] * [1 - (h/(140r))²]
        // Simplified: r ≈ t/sqrt(12)
        let r = m.t / (12.0_f64).sqrt();
        let hr = h_eff / (140.0 * r);
        let slenderness_factor = (1.0 - hr * hr).max(0.0);
        0.80 * (0.80 * m.fm * (an - m.as_tension) + m.fy * m.as_tension) * slenderness_factor
    } else {
        // Very slender: Euler buckling governs
        // Pn = 0.80 * [0.80 * f'm * (An - As) + fy * As] * (70r/h)²
        let r = m.t / (12.0_f64).sqrt();
        let factor = (70.0 * r / h_eff).powi(2);
        0.80 * (0.80 * m.fm * (an - m.as_tension) + m.fy * m.as_tension) * factor
    };

    let axial_ratio = if pn > 0.0 {
        pu / (PHI_AXIAL * pn)
    } else {
        0.0
    };

    // ==================== Flexure (TMS 402 Sec 9.3.4) ====================

    // Similar to ACI 318 Whitney block with a = As*fy/(0.80*f'm*b)
    let a = m.as_tension * m.fy / (0.80 * m.fm * m.b);
    let mn = m.as_tension * m.fy * (m.d - a / 2.0);

    let flexure_ratio = if mn > 0.0 {
        mu / (PHI_FLEXURE * mn)
    } else {
        0.0
    };

    // ==================== Shear (TMS 402 Sec 9.3.6) ====================

    // Vm = masonry shear contribution
    let _em = em; // used for documentation/consistency
    let fm_mpa = m.fm / 1e6;
    let an_mm2 = an * 1e6; // m² to mm²
    let vm = 0.083 * (4.0 - 1.75 * (mu / (vu * m.d)).min(1.0).max(0.0)) * fm_mpa.sqrt() * an_mm2;
    // Add effect of axial compression
    let vm = vm + 0.25 * pu; // simplified

    // Vs = steel shear contribution
    let vs = match (m.av, m.s_stirrup) {
        (Some(av), Some(s)) if s > 0.0 => 0.50 * av * m.fy * m.d / s,
        _ => 0.0,
    };

    let vn = vm + vs;

    let shear_ratio = if vn > 0.0 {
        vu / (PHI_SHEAR * vn)
    } else {
        0.0
    };

    // ==================== Interaction ====================
    // Simplified linear interaction: Pu/(phi*Pn) + Mu/(phi*Mn) <= 1.0
    let interaction_ratio = axial_ratio + flexure_ratio;

    let pass = axial_ratio <= 1.0
        && flexure_ratio <= 1.0
        && shear_ratio <= 1.0
        && interaction_ratio <= 1.0;

    MasonryCheckResult {
        element_id: m.element_id,
        axial_ratio,
        flexure_ratio,
        shear_ratio,
        interaction_ratio,
        pn,
        mn,
        vn,
        slenderness,
        pass,
    }
}
