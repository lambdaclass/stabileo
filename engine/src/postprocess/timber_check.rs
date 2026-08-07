//! Timber member design checks per NDS (National Design Specification for Wood).
//!
//! Given analysis results and member properties, computes unity ratios
//! for bending, compression, tension, shear, and combined loading.

use serde::{Deserialize, Serialize};

use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

// ==================== Types ====================

/// Timber member design data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimberMemberData {
    pub element_id: usize,
    /// Reference design values (already adjusted for species/grade)
    /// Bending stress Fb (Pa)
    pub fb: f64,
    /// Tension parallel to grain Ft (Pa)
    pub ft: f64,
    /// Compression parallel to grain Fc (Pa)
    pub fc: f64,
    /// Shear stress Fv (Pa)
    pub fv: f64,
    /// Modulus of elasticity E (Pa)
    pub e: f64,
    /// Modulus of elasticity for stability Emin (Pa)
    #[serde(default)]
    pub e_min: Option<f64>,
    /// Cross-section width b (m)
    pub b: f64,
    /// Cross-section depth d (m)
    pub d: f64,
    /// Unbraced length for compression Le (m)
    pub le: f64,
    /// Effective unbraced length for bending Lu (m)
    #[serde(default)]
    pub lu: Option<f64>,
    /// Load duration factor CD (default 1.0)
    #[serde(default)]
    pub cd: Option<f64>,
    /// Wet service factor CM (default 1.0)
    #[serde(default)]
    pub cm: Option<f64>,
    /// Temperature factor Ct (default 1.0)
    #[serde(default)]
    pub ct: Option<f64>,
    /// Size factor CF for bending (default 1.0)
    #[serde(default)]
    pub cf_bending: Option<f64>,
    /// Size factor CF for tension (default 1.0)
    #[serde(default)]
    pub cf_tension: Option<f64>,
    /// Size factor CF for compression (default 1.0)
    #[serde(default)]
    pub cf_compression: Option<f64>,
    /// Flat use factor Cfu (default 1.0)
    #[serde(default)]
    pub cfu: Option<f64>,
    /// Incising factor Ci (default 1.0)
    #[serde(default)]
    pub ci: Option<f64>,
    /// Repetitive member factor Cr (default 1.0, applies to bending)
    #[serde(default)]
    pub cr: Option<f64>,
}

/// Design forces for a timber element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimberDesignForces {
    pub element_id: usize,
    /// Bending moment M (N-m)
    pub m: f64,
    /// Axial force N (N, positive = tension, negative = compression)
    #[serde(default)]
    pub n: Option<f64>,
    /// Shear force V (N)
    #[serde(default)]
    pub v: Option<f64>,
}

/// Input for timber design check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimberCheckInput {
    pub members: Vec<TimberMemberData>,
    pub forces: Vec<TimberDesignForces>,
}

/// Result of timber design check for one member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimberCheckResult {
    pub element_id: usize,
    /// Overall unity ratio
    pub unity_ratio: f64,
    /// Governing check name
    pub governing_check: String,
    /// Bending unity ratio (fb_actual / Fb')
    pub bending_ratio: f64,
    /// Compression unity ratio (fc_actual / Fc')
    pub compression_ratio: f64,
    /// Tension unity ratio (ft_actual / Ft')
    pub tension_ratio: f64,
    /// Shear unity ratio (fv_actual / Fv')
    pub shear_ratio: f64,
    /// Combined bending+axial interaction ratio (NDS 3.9)
    pub interaction_ratio: f64,
    /// Adjusted bending design value Fb' (Pa)
    pub fb_prime: f64,
    /// Adjusted compression design value Fc' (Pa)
    pub fc_prime: f64,
    /// Adjusted tension design value Ft' (Pa)
    pub ft_prime: f64,
    /// Adjusted shear design value Fv' (Pa)
    pub fv_prime: f64,
    /// Column stability factor CP
    pub cp: f64,
    /// Beam stability factor CL
    pub cl: f64,
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== NDS Design Checks ====================

/// Run NDS timber design checks on all members.
pub fn check_timber_members(input: &TimberCheckInput) -> Vec<TimberCheckResult> {
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

        let result = check_single_timber_member(member, forces);
        results.push(result);
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_timber_member(
    m: &TimberMemberData,
    f: &TimberDesignForces,
) -> TimberCheckResult {
    let cd = m.cd.unwrap_or(1.0);
    let cm = m.cm.unwrap_or(1.0);
    let ct = m.ct.unwrap_or(1.0);
    let ci = m.ci.unwrap_or(1.0);

    // Section properties
    let area = m.b * m.d;
    let s = m.b * m.d * m.d / 6.0; // Section modulus

    // Adjusted design values
    let cp = column_stability_factor(m, cd, cm, ct, ci);
    let cl = beam_stability_factor(m, cd, cm, ct, ci);

    // Fb' = Fb * CD * CM * Ct * CL * CF * Cfu * Ci * Cr
    let cf_b = m.cf_bending.unwrap_or(1.0);
    let cfu = m.cfu.unwrap_or(1.0);
    let cr = m.cr.unwrap_or(1.0);
    let fb_prime = m.fb * cd * cm * ct * cl * cf_b * cfu * ci * cr;

    // Ft' = Ft * CD * CM * Ct * CF * Ci
    let cf_t = m.cf_tension.unwrap_or(1.0);
    let ft_prime = m.ft * cd * cm * ct * cf_t * ci;

    // Fc' = Fc * CD * CM * Ct * CP * CF * Ci
    let cf_c = m.cf_compression.unwrap_or(1.0);
    let fc_prime = m.fc * cd * cm * ct * cp * cf_c * ci;

    // Fv' = Fv * CD * CM * Ct * Ci
    let fv_prime = m.fv * cd * cm * ct * ci;

    // Actual stresses
    let m_abs = f.m.abs();
    let n = f.n.unwrap_or(0.0);
    let v_abs = f.v.unwrap_or(0.0).abs();

    let fb_actual = if s > 0.0 { m_abs / s } else { 0.0 };
    let fv_actual = if area > 0.0 {
        // NDS 3.4.2: fv = 3V/(2bd) for rectangular sections
        1.5 * v_abs / area
    } else {
        0.0
    };

    let mut ledger = CheckLedger::new();

    // Bending ratio
    let bending_ratio = ledger.ratio("Bending NDS 3.3", fb_actual, fb_prime);

    // Compression and tension ratios
    let (compression_ratio, tension_ratio) = if n < 0.0 {
        let fc_actual = (-n) / area;
        (ledger.ratio("Compression NDS 3.6", fc_actual, fc_prime), 0.0)
    } else if n > 0.0 {
        let ft_actual = n / area;
        (0.0, ledger.ratio("Tension NDS 3.8", ft_actual, ft_prime))
    } else {
        (0.0, 0.0)
    };

    // Shear ratio
    let shear_ratio = ledger.ratio_if_loaded("Shear NDS 3.4", fv_actual, fv_prime);

    // NDS 3.9: Combined loading interaction
    let interaction_ratio = if n < 0.0 {
        // NDS 3.9.2: Combined bending and axial compression
        // (fc/Fc')² + fb / (Fb' * (1 - fc/FcE)) <= 1.0
        let fc_actual = (-n) / area;
        let e_min = m.e_min.unwrap_or(m.e * 0.58);
        let kce = 0.822; // NDS Table 3.3.3
        let le_d = m.le / m.d;
        let fce = kce * e_min * cm * ct * ci / (le_d * le_d);
        let fc_ratio = if fc_prime > 0.0 {
            fc_actual / fc_prime
        } else {
            0.0
        };
        let amplification = if fce > 0.0 {
            1.0 - fc_actual / fce
        } else {
            1.0
        };
        let amplified_bending = if amplification > 0.0 {
            bending_ratio / amplification
        } else {
            bending_ratio
        };
        fc_ratio * fc_ratio + amplified_bending
    } else if n > 0.0 {
        // NDS 3.9.1: Combined bending and axial tension
        // ft/Ft' + fb/Fb' <= 1.0
        tension_ratio + bending_ratio
    } else {
        bending_ratio
    };

    // Governing
    let checks = [
        (bending_ratio, "Bending NDS 3.3"),
        (compression_ratio, "Compression NDS 3.6"),
        (tension_ratio, "Tension NDS 3.8"),
        (shear_ratio, "Shear NDS 3.4"),
        (interaction_ratio, "Interaction NDS 3.9"),
    ];

    let interaction_ratio = ledger.require_finite("Interaction NDS 3.9", interaction_ratio);

    let (unity_ratio, governing) = ledger.governing(&checks);
    let governing_check = if ledger.all_evaluated() {
        governing.to_string()
    } else {
        format!("{governing} (incomplete)")
    };

    TimberCheckResult {
        element_id: m.element_id,
        unity_ratio,
        governing_check,
        bending_ratio,
        compression_ratio,
        tension_ratio,
        shear_ratio,
        interaction_ratio,
        fb_prime,
        fc_prime,
        ft_prime,
        fv_prime,
        cp,
        cl,
        unevaluated: ledger.into_unevaluated(),
    }
}

/// NDS 3.7.1: Column stability factor CP.
fn column_stability_factor(
    m: &TimberMemberData,
    cd: f64,
    cm: f64,
    ct: f64,
    ci: f64,
) -> f64 {
    let e_min = m.e_min.unwrap_or(m.e * 0.58);
    let cf_c = m.cf_compression.unwrap_or(1.0);
    let kce = 0.822; // NDS Table 3.3.3

    // Fc* = Fc * CD * CM * Ct * CF * Ci (all factors except CP)
    let fc_star = m.fc * cd * cm * ct * cf_c * ci;
    if fc_star <= 0.0 {
        return 1.0;
    }

    // FcE = KcE * Emin' / (le/d)²
    let le_d = m.le / m.d;
    if le_d <= 0.0 {
        return 1.0;
    }

    let e_min_prime = e_min * cm * ct * ci;
    let fce = kce * e_min_prime / (le_d * le_d);

    // CP using NDS Eq 3.7-1
    let ratio = fce / fc_star;
    let c = 0.8; // For sawn lumber (0.9 for glulam)

    // CP = (1+ratio)/(2c) - sqrt(((1+ratio)/(2c))² - ratio/c)
    let term = (1.0 + ratio) / (2.0 * c);
    let cp = term - (term * term - ratio / c).max(0.0).sqrt();

    cp.max(0.0).min(1.0)
}

/// NDS 3.3.3: Beam stability factor CL.
fn beam_stability_factor(
    m: &TimberMemberData,
    cd: f64,
    cm: f64,
    ct: f64,
    ci: f64,
) -> f64 {
    let lu = m.lu.unwrap_or(m.le);
    let e_min = m.e_min.unwrap_or(m.e * 0.58);
    let cf_b = m.cf_bending.unwrap_or(1.0);
    let cr = m.cr.unwrap_or(1.0);
    let cfu = m.cfu.unwrap_or(1.0);

    if m.d <= m.b {
        // No lateral instability for d <= b (section is not deep)
        return 1.0;
    }

    // Fb* = Fb * CD * CM * Ct * CF * Cfu * Ci * Cr (all except CL)
    let fb_star = m.fb * cd * cm * ct * cf_b * cfu * ci * cr;
    if fb_star <= 0.0 {
        return 1.0;
    }

    // Effective length Le for bending
    let le_bend = lu; // simplified — use Lu directly

    // RB = sqrt(le * d / b²)  — NDS 3.3.3.5
    let rb_sq = le_bend * m.d / (m.b * m.b);
    if rb_sq <= 0.0 {
        return 1.0;
    }

    // FbE = 1.20 * Emin' / RB²
    let e_min_prime = e_min * cm * ct * ci;
    let fbe = 1.20 * e_min_prime / rb_sq;

    // CL using NDS Eq 3.3-6 (same form as CP)
    let ratio = fbe / fb_star;
    let term = (1.0 + ratio) / 1.9;
    let cl = term - (term * term - ratio / 0.95).max(0.0).sqrt();

    cl.max(0.0).min(1.0)
}
