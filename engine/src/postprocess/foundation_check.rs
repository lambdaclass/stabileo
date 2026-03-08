//! Foundation design checks for spread footings.
//!
//! Covers bearing capacity (Terzaghi/Meyerhof), overturning stability,
//! sliding resistance, and one-way/two-way shear (punching) per ACI 318.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// Spread footing geometry and soil data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadFootingData {
    pub footing_id: usize,
    /// Footing length in plan (m)
    pub length: f64,
    /// Footing width in plan (m)
    pub width: f64,
    /// Footing thickness (m)
    pub thickness: f64,
    /// Depth of footing base below ground (m)
    pub depth: f64,
    /// Allowable soil bearing capacity (Pa)
    pub q_allowable: f64,
    /// Soil unit weight (N/m³)
    pub gamma_soil: f64,
    /// Concrete compressive strength f'c (Pa)
    pub fc: f64,
    /// Column dimension parallel to length (m)
    pub col_length: f64,
    /// Column dimension parallel to width (m)
    pub col_width: f64,
    /// Effective depth d (m) — if None, computed as thickness - 0.075
    #[serde(default)]
    pub d: Option<f64>,
    /// Coefficient of friction soil-concrete (default 0.5)
    #[serde(default)]
    pub mu_sliding: Option<f64>,
}

/// Applied loads on a spread footing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadFootingForces {
    pub footing_id: usize,
    /// Vertical load (N, compression positive)
    pub p: f64,
    /// Moment about length axis (N-m)
    #[serde(default)]
    pub mx: Option<f64>,
    /// Moment about width axis (N-m)
    #[serde(default)]
    pub my: Option<f64>,
    /// Horizontal force (N)
    #[serde(default)]
    pub h: Option<f64>,
}

/// Input for spread footing check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadFootingInput {
    pub footings: Vec<SpreadFootingData>,
    pub forces: Vec<SpreadFootingForces>,
}

/// Result of spread footing check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpreadFootingResult {
    pub footing_id: usize,
    /// Maximum bearing pressure (Pa)
    pub max_bearing_pressure: f64,
    /// Bearing capacity ratio (q_max / q_allowable)
    pub bearing_ratio: f64,
    /// Overturning safety factor about length axis
    pub overturning_sf_x: f64,
    /// Overturning safety factor about width axis
    pub overturning_sf_y: f64,
    /// Sliding safety factor
    pub sliding_sf: f64,
    /// One-way shear ratio (Vu / phi*Vc)
    pub oneway_shear_ratio: f64,
    /// Two-way (punching) shear ratio (Vu / phi*Vc)
    pub punching_shear_ratio: f64,
    /// Eccentricity in length direction (m)
    pub eccentricity_x: f64,
    /// Eccentricity in width direction (m)
    pub eccentricity_y: f64,
    /// Overall pass (all ratios acceptable)
    pub pass: bool,
}

// ==================== Implementation ====================

const PHI_SHEAR: f64 = 0.75;

/// Check all spread footings.
pub fn check_spread_footings(input: &SpreadFootingInput) -> Vec<SpreadFootingResult> {
    let mut results = Vec::new();

    for footing in &input.footings {
        let forces = input
            .forces
            .iter()
            .find(|f| f.footing_id == footing.footing_id);
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_footing(footing, forces));
    }

    results.sort_by_key(|r| r.footing_id);
    results
}

fn check_single_footing(
    ftg: &SpreadFootingData,
    forces: &SpreadFootingForces,
) -> SpreadFootingResult {
    let l = ftg.length;
    let b = ftg.width;
    let area = l * b;
    let d = ftg.d.unwrap_or(ftg.thickness - 0.075);
    let mu = ftg.mu_sliding.unwrap_or(0.5);

    let p = forces.p;
    let mx = forces.mx.unwrap_or(0.0);
    let my = forces.my.unwrap_or(0.0);
    let h = forces.h.unwrap_or(0.0);

    // Eccentricities
    let ex = if p.abs() > 0.0 { my / p } else { 0.0 };
    let ey = if p.abs() > 0.0 { mx / p } else { 0.0 };

    // Bearing pressure (Meyerhof effective area for eccentric loads)
    // q = P / A' where A' = L' * B'
    // L' = L - 2*ey, B' = B - 2*ex
    let l_eff = (l - 2.0 * ey.abs()).max(0.0);
    let b_eff = (b - 2.0 * ex.abs()).max(0.0);
    let a_eff = l_eff * b_eff;

    let max_bearing = if a_eff > 0.0 { p / a_eff } else { f64::INFINITY };
    let bearing_ratio = max_bearing / ftg.q_allowable;

    // Overturning stability
    // Resisting moment = P * L/2 (or B/2)
    // Overturning moment = Mx or My + H * depth
    let mr_x = p * l / 2.0;
    let mo_x = mx.abs() + h.abs() * ftg.depth;
    let overturning_sf_x = if mo_x > 0.0 { mr_x / mo_x } else { f64::INFINITY };

    let mr_y = p * b / 2.0;
    let mo_y = my.abs() + h.abs() * ftg.depth;
    let overturning_sf_y = if mo_y > 0.0 { mr_y / mo_y } else { f64::INFINITY };

    // Sliding resistance
    // Fr = mu * P (friction) + passive pressure (ignored for simplicity)
    let fr = mu * p;
    let sliding_sf = if h.abs() > 0.0 {
        fr / h.abs()
    } else {
        f64::INFINITY
    };

    // One-way shear (beam shear) — critical section at d from column face
    // Vu = q * B * (L/2 - col_L/2 - d)
    let oneway_dist = l / 2.0 - ftg.col_length / 2.0 - d;
    let vu_oneway = if oneway_dist > 0.0 && area > 0.0 {
        (p / area) * b * oneway_dist
    } else {
        0.0
    };

    // phi*Vc = phi * 0.17 * sqrt(f'c_MPa) * bw_mm * d_mm (ACI 318 metric)
    let fc_mpa = ftg.fc / 1e6;
    let bw_mm = b * 1000.0;
    let d_mm = d * 1000.0;
    let phi_vc_oneway = PHI_SHEAR * 0.17 * fc_mpa.sqrt() * bw_mm * d_mm;
    let oneway_shear_ratio = if phi_vc_oneway > 0.0 {
        vu_oneway / phi_vc_oneway
    } else {
        0.0
    };

    // Two-way (punching) shear — critical section at d/2 from column face
    let b0 = 2.0 * ((ftg.col_length + d) + (ftg.col_width + d)); // perimeter (m)
    let b0_mm = b0 * 1000.0;
    let vu_punch = if area > 0.0 {
        let a_punch = (ftg.col_length + d) * (ftg.col_width + d);
        p - (p / area) * a_punch
    } else {
        0.0
    };

    // ACI 318-19 Sec 22.6.5.2: Vc = min of three expressions
    let beta_col = ftg.col_length.max(ftg.col_width)
        / ftg.col_length.min(ftg.col_width).max(1e-6);
    let alpha_s = 40.0; // interior column

    let vc1 = 0.33 * fc_mpa.sqrt() * b0_mm * d_mm;
    let vc2 = (0.17 + 0.33 / beta_col) * fc_mpa.sqrt() * b0_mm * d_mm;
    let vc3 = (0.083 * (alpha_s * d_mm / b0_mm + 2.0)) * fc_mpa.sqrt() * b0_mm * d_mm;
    let vc_punch = vc1.min(vc2).min(vc3);
    let phi_vc_punch = PHI_SHEAR * vc_punch;

    let punching_shear_ratio = if phi_vc_punch > 0.0 {
        vu_punch / phi_vc_punch
    } else {
        0.0
    };

    let pass = bearing_ratio <= 1.0
        && overturning_sf_x >= 1.5
        && overturning_sf_y >= 1.5
        && sliding_sf >= 1.5
        && oneway_shear_ratio <= 1.0
        && punching_shear_ratio <= 1.0;

    SpreadFootingResult {
        footing_id: ftg.footing_id,
        max_bearing_pressure: max_bearing,
        bearing_ratio,
        overturning_sf_x,
        overturning_sf_y,
        sliding_sf,
        oneway_shear_ratio,
        punching_shear_ratio,
        eccentricity_x: ex,
        eccentricity_y: ey,
        pass,
    }
}
