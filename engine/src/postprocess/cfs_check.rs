//! Cold-formed steel member design checks per AISI S100 (LRFD).
//!
//! Covers effective width for local buckling, flexural strength
//! with lateral-torsional buckling, axial compression with distortional
//! and local/global interaction, and combined loading.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// Cold-formed steel member properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfsMemberData {
    pub element_id: usize,
    /// Yield stress (Pa)
    pub fy: f64,
    /// Elastic modulus (Pa)
    pub e: f64,
    /// Gross cross-section area (m²)
    pub ag: f64,
    /// Effective area at stress Fy (m²) for local buckling
    pub ae: f64,
    /// Gross moment of inertia about strong axis (m⁴)
    pub ix: f64,
    /// Effective section modulus at Fy (m³) — strong axis
    pub se_x: f64,
    /// Full unreduced section modulus — strong axis (m³)
    pub sf_x: f64,
    /// Gross moment of inertia about weak axis (m⁴)
    pub iy: f64,
    /// Effective section modulus at Fy (m³) — weak axis
    pub se_y: f64,
    /// Radius of gyration about strong axis (m)
    pub rx: f64,
    /// Radius of gyration about weak axis (m)
    pub ry: f64,
    /// Torsional constant J (m⁴)
    pub j: f64,
    /// Warping constant Cw (m⁶)
    pub cw: f64,
    /// Unbraced length for flexure (m)
    pub lb: f64,
    /// Unbraced length for compression (m)
    pub lc: f64,
    /// Effective length factor K (default 1.0)
    #[serde(default)]
    pub k: Option<f64>,
    /// Cb moment gradient factor (default 1.0)
    #[serde(default)]
    pub cb: Option<f64>,
    /// Distortional buckling stress for compression Fd (Pa) — if known
    #[serde(default)]
    pub fcrd: Option<f64>,
    /// Distortional buckling stress for flexure Fd (Pa) — if known
    #[serde(default)]
    pub fcrd_flex: Option<f64>,
    /// Shear area (m²) — web area for shear check
    #[serde(default)]
    pub aw: Option<f64>,
    /// Web depth h (m)
    #[serde(default)]
    pub h: Option<f64>,
    /// Thickness t (m)
    #[serde(default)]
    pub t: Option<f64>,
}

/// Applied design forces on a CFS member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfsDesignForces {
    pub element_id: usize,
    /// Factored axial force (N, + tension, - compression)
    #[serde(default)]
    pub axial: Option<f64>,
    /// Factored moment about strong axis (N-m)
    #[serde(default)]
    pub mx: Option<f64>,
    /// Factored moment about weak axis (N-m)
    #[serde(default)]
    pub my: Option<f64>,
    /// Factored shear (N)
    #[serde(default)]
    pub shear: Option<f64>,
}

/// Input for CFS member check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfsCheckInput {
    pub members: Vec<CfsMemberData>,
    pub forces: Vec<CfsDesignForces>,
}

/// Result of CFS member check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfsCheckResult {
    pub element_id: usize,
    /// Compression ratio Pu / (phi_c * Pn)
    pub compression_ratio: f64,
    /// Tension ratio Tu / (phi_t * Tn)
    pub tension_ratio: f64,
    /// Flexure ratio Mu / (phi_b * Mn) — strong axis
    pub flexure_ratio_x: f64,
    /// Flexure ratio Mu / (phi_b * Mn) — weak axis
    pub flexure_ratio_y: f64,
    /// Shear ratio Vu / (phi_v * Vn)
    pub shear_ratio: f64,
    /// Combined interaction ratio
    pub interaction_ratio: f64,
    /// Nominal axial strength Pn (N)
    pub pn: f64,
    /// Nominal flexural strength Mn_x (N-m)
    pub mn_x: f64,
    /// Nominal flexural strength Mn_y (N-m)
    pub mn_y: f64,
    /// Global buckling stress Fe (Pa)
    pub fe: f64,
    /// Overall pass
    pub pass: bool,
}

// ==================== Constants ====================

const PHI_C: f64 = 0.85; // Compression
const PHI_T: f64 = 0.90; // Tension (yielding)
const PHI_B: f64 = 0.90; // Flexure
const PHI_V: f64 = 0.95; // Shear

// ==================== Implementation ====================

/// Check all CFS members.
pub fn check_cfs_members(input: &CfsCheckInput) -> Vec<CfsCheckResult> {
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
        results.push(check_single_cfs_member(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_cfs_member(m: &CfsMemberData, f: &CfsDesignForces) -> CfsCheckResult {
    let k = m.k.unwrap_or(1.0);
    let cb = m.cb.unwrap_or(1.0);
    let axial = f.axial.unwrap_or(0.0);
    let mx = f.mx.unwrap_or(0.0);
    let my = f.my.unwrap_or(0.0);
    let shear = f.shear.unwrap_or(0.0);

    // ==================== Compression (AISI S100 Ch. E) ====================

    // Global buckling: flexural buckling about weak axis (controls for most CFS)
    let kl_ry = k * m.lc / m.ry;
    let fe = std::f64::consts::PI.powi(2) * m.e / (kl_ry * kl_ry);

    // Inelastic/elastic buckling per AISI S100 E2
    let lambda_c = (m.fy / fe).sqrt();
    let fn_global = if lambda_c <= 1.5 {
        // Inelastic: Fn = (0.658^(lambda²)) * Fy
        0.658_f64.powf(lambda_c * lambda_c) * m.fy
    } else {
        // Elastic: Fn = (0.877 / lambda²) * Fy
        (0.877 / (lambda_c * lambda_c)) * m.fy
    };

    // Local-global interaction: Pn = Ae * Fn
    let pn_local = m.ae * fn_global;

    // Distortional buckling: Pn = Ag * Fd (if given)
    let pn_dist = m.fcrd.map(|fcrd| {
        let lambda_d = (m.fy / fcrd).sqrt();
        if lambda_d <= 0.561 {
            m.ag * m.fy
        } else {
            let ratio = (fcrd / m.fy).powf(0.6);
            m.ag * m.fy * (1.0 - 0.25 * ratio) * ratio
        }
    });

    let pn = match pn_dist {
        Some(pd) => pn_local.min(pd),
        None => pn_local,
    };

    let compression_ratio = if axial < 0.0 && pn > 0.0 {
        axial.abs() / (PHI_C * pn)
    } else {
        0.0
    };

    // ==================== Tension (AISI S100 Ch. D) ====================

    let tn = m.ag * m.fy; // Yielding on gross section
    let tension_ratio = if axial > 0.0 && tn > 0.0 {
        axial / (PHI_T * tn)
    } else {
        0.0
    };

    // ==================== Flexure (AISI S100 Ch. F) ====================

    // Lateral-torsional buckling
    let g = m.e / (2.0 * 1.3); // G ≈ E/2.6 for steel
    let me = cb
        * std::f64::consts::PI
        * (m.e * m.iy * g * m.j).sqrt()
        / m.lb
        * (1.0 + (std::f64::consts::PI.powi(2) * m.e * m.cw / (g * m.j * m.lb * m.lb)).sqrt());

    let my_yield = m.sf_x * m.fy;
    let fc_ltb = if m.sf_x > 0.0 {
        me / m.sf_x
    } else {
        0.0
    };

    let fn_ltb = if fc_ltb >= 2.78 * m.fy {
        m.fy // Full yield
    } else if fc_ltb >= 0.56 * m.fy {
        // Inelastic LTB
        10.0 / 9.0 * m.fy * (1.0 - 10.0 * m.fy / (36.0 * fc_ltb))
    } else {
        fc_ltb
    };

    let mn_ltb = m.se_x * fn_ltb;

    // Distortional buckling for flexure
    let mn_dist = m.fcrd_flex.map(|fd| {
        let lambda_d = (my_yield / (m.sf_x * fd)).sqrt();
        if lambda_d <= 0.673 {
            my_yield
        } else {
            let ratio = (m.sf_x * fd / my_yield).powf(0.5);
            my_yield * (1.0 - 0.22 * ratio) * ratio
        }
    });

    let mn_x = match mn_dist {
        Some(md) => mn_ltb.min(md),
        None => mn_ltb,
    };

    let flexure_ratio_x = if mx.abs() > 0.0 && mn_x > 0.0 {
        mx.abs() / (PHI_B * mn_x)
    } else {
        0.0
    };

    // Weak axis flexure (local buckling controls)
    let mn_y = m.se_y * m.fy;
    let flexure_ratio_y = if my.abs() > 0.0 && mn_y > 0.0 {
        my.abs() / (PHI_B * mn_y)
    } else {
        0.0
    };

    // ==================== Shear (AISI S100 Ch. G) ====================
    let shear_ratio = if let (Some(h), Some(t)) = (m.h, m.t) {
        let kv = 5.34; // unstiffened web
        let ek = m.e * kv;
        let ht = h / t;

        let vn = if ht <= 1.51 * (ek / m.fy).sqrt() {
            // Yielding
            0.60 * m.fy * h * t
        } else if ht <= 1.227 * (ek / m.fy).sqrt() * (ek / m.fy).sqrt().sqrt() {
            // Inelastic
            0.60 * t * (ek * m.fy).sqrt() * h / ht
        } else {
            // Elastic
            std::f64::consts::PI.powi(2) * ek * t / (12.0 * (1.0 - 0.3 * 0.3) * ht)
        };

        if shear.abs() > 0.0 && vn > 0.0 {
            shear.abs() / (PHI_V * vn)
        } else {
            0.0
        }
    } else {
        0.0
    };

    // ==================== Combined Loading (AISI S100 Ch. H) ====================
    let interaction_ratio = if axial < 0.0 {
        // Compression + bending: H1-1
        let pu_ratio = compression_ratio;
        if pu_ratio > 0.15 {
            pu_ratio + 8.0 / 9.0 * (flexure_ratio_x + flexure_ratio_y)
        } else {
            pu_ratio / 2.0 + flexure_ratio_x + flexure_ratio_y
        }
    } else if axial > 0.0 {
        // Tension + bending
        tension_ratio + flexure_ratio_x + flexure_ratio_y
    } else {
        flexure_ratio_x + flexure_ratio_y
    };

    let pass = compression_ratio <= 1.0
        && tension_ratio <= 1.0
        && flexure_ratio_x <= 1.0
        && flexure_ratio_y <= 1.0
        && shear_ratio <= 1.0
        && interaction_ratio <= 1.0;

    CfsCheckResult {
        element_id: m.element_id,
        compression_ratio,
        tension_ratio,
        flexure_ratio_x,
        flexure_ratio_y,
        shear_ratio,
        interaction_ratio,
        pn,
        mn_x,
        mn_y,
        fe,
        pass,
    }
}
