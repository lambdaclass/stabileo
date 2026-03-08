//! Steel member design checks per AISC 360 (LRFD).
//!
//! Given analysis results and member properties, computes unity ratios
//! for axial, flexural, and combined loading interaction equations.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// Steel design parameters for a member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelMemberData {
    pub element_id: usize,
    /// Yield stress (Pa or consistent units)
    pub fy: f64,
    /// Gross area (m² or consistent)
    pub ag: f64,
    /// Net area for tension (default = Ag)
    #[serde(default)]
    pub an: Option<f64>,
    /// Effective net area factor U (default 1.0)
    #[serde(default)]
    pub u_factor: Option<f64>,
    /// Unbraced length for compression about Y-axis
    pub lby: f64,
    /// Unbraced length for compression about Z-axis
    pub lbz: f64,
    /// Effective length factor K for Y-axis (default 1.0)
    #[serde(default)]
    pub ky: Option<f64>,
    /// Effective length factor K for Z-axis (default 1.0)
    #[serde(default)]
    pub kz: Option<f64>,
    /// Moment of inertia about Y-axis
    pub iy: f64,
    /// Moment of inertia about Z-axis
    pub iz: f64,
    /// Radius of gyration about Y-axis
    pub ry: f64,
    /// Radius of gyration about Z-axis
    pub rz: f64,
    /// Plastic section modulus about Y-axis
    pub zy: f64,
    /// Plastic section modulus about Z-axis
    pub zz: f64,
    /// Elastic section modulus about Y-axis
    pub sy: f64,
    /// Elastic section modulus about Z-axis
    pub sz: f64,
    /// Torsion constant J
    pub j: f64,
    /// Warping constant Cw (set 0.0 for HSS)
    #[serde(default)]
    pub cw: Option<f64>,
    /// Lateral-torsional buckling unbraced length Lb
    #[serde(default)]
    pub lb: Option<f64>,
    /// Cb moment gradient factor (default 1.0)
    #[serde(default)]
    pub cb: Option<f64>,
    /// Modulus of elasticity
    pub e: f64,
    /// Shear modulus (default E / 2.6)
    #[serde(default)]
    pub g: Option<f64>,
    /// Depth of section (for LTB calculation)
    #[serde(default)]
    pub depth: Option<f64>,
}

/// Input for steel design check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelCheckInput {
    pub members: Vec<SteelMemberData>,
    /// Element forces: (element_id, axial_start, shear_y_start, moment_z_start, axial_end, shear_y_end, moment_z_end)
    pub forces: Vec<ElementDesignForces>,
}

/// Design forces for an element.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDesignForces {
    pub element_id: usize,
    /// Axial force (positive = tension, negative = compression)
    pub n: f64,
    /// Bending moment about Y-axis (major axis)
    pub my: f64,
    /// Bending moment about Z-axis (minor axis)
    #[serde(default)]
    pub mz: Option<f64>,
    /// Shear force
    #[serde(default)]
    pub vy: Option<f64>,
}

/// Result of steel design check for one member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelCheckResult {
    pub element_id: usize,
    /// Overall unity ratio (max of all checks)
    pub unity_ratio: f64,
    /// Governing check name
    pub governing_check: String,
    /// Tension capacity check (Pr / phi*Pn_tension)
    pub tension_ratio: f64,
    /// Compression capacity check (Pr / phi*Pn_compression)
    pub compression_ratio: f64,
    /// Flexural capacity check about Y-axis (Mr / phi*Mn_y)
    pub flexure_y_ratio: f64,
    /// Flexural capacity check about Z-axis (Mr / phi*Mn_z)
    pub flexure_z_ratio: f64,
    /// Combined interaction ratio (AISC H1-1)
    pub interaction_ratio: f64,
    /// Available axial compression strength (phi*Pn)
    pub phi_pn_compression: f64,
    /// Available axial tension strength (phi*Pn)
    pub phi_pn_tension: f64,
    /// Available flexural strength about Y (phi*Mn)
    pub phi_mn_y: f64,
    /// Available flexural strength about Z (phi*Mn)
    pub phi_mn_z: f64,
}

// ==================== AISC 360 Design Checks ====================

const PHI_C: f64 = 0.90; // Compression
const PHI_T: f64 = 0.90; // Tension (yielding)
const PHI_B: f64 = 0.90; // Flexure

/// Run AISC 360 steel design checks on all members.
pub fn check_steel_members(input: &SteelCheckInput) -> Vec<SteelCheckResult> {
    let mut results = Vec::new();

    for member in &input.members {
        let forces = input.forces.iter()
            .find(|f| f.element_id == member.element_id);

        let forces = match forces {
            Some(f) => f,
            None => continue,
        };

        let result = check_single_member(member, forces);
        results.push(result);
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_member(member: &SteelMemberData, forces: &ElementDesignForces) -> SteelCheckResult {
    let eid = member.element_id;

    // Available tension strength (AISC D2)
    let phi_pn_tension = tension_capacity(member);

    // Available compression strength (AISC E3)
    let phi_pn_compression = compression_capacity(member);

    // Available flexural strength (AISC F2 - compact doubly-symmetric I)
    let phi_mn_y = flexural_capacity_y(member);
    let phi_mn_z = flexural_capacity_z(member);

    // Demand ratios
    let n = forces.n;
    let my = forces.my.abs();
    let mz = forces.mz.unwrap_or(0.0).abs();

    let tension_ratio = if n > 0.0 && phi_pn_tension > 0.0 {
        n / phi_pn_tension
    } else {
        0.0
    };

    let compression_ratio = if n < 0.0 && phi_pn_compression > 0.0 {
        (-n) / phi_pn_compression
    } else {
        0.0
    };

    let flexure_y_ratio = if phi_mn_y > 0.0 { my / phi_mn_y } else { 0.0 };
    let flexure_z_ratio = if phi_mn_z > 0.0 { mz / phi_mn_z } else { 0.0 };

    // AISC H1 interaction (using appropriate axial capacity)
    let axial_ratio = if n < 0.0 {
        if phi_pn_compression > 0.0 { (-n) / phi_pn_compression } else { 0.0 }
    } else {
        if phi_pn_tension > 0.0 { n / phi_pn_tension } else { 0.0 }
    };

    let interaction_ratio = interaction_h1(axial_ratio, flexure_y_ratio, flexure_z_ratio);

    // Governing
    let checks = [
        (tension_ratio, "Tension D2"),
        (compression_ratio, "Compression E3"),
        (flexure_y_ratio, "Flexure-Y F2"),
        (flexure_z_ratio, "Flexure-Z F6"),
        (interaction_ratio, "Interaction H1"),
    ];

    let (unity_ratio, governing_check) = checks.iter()
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap())
        .map(|(r, name)| (*r, name.to_string()))
        .unwrap_or((0.0, "None".to_string()));

    SteelCheckResult {
        element_id: eid,
        unity_ratio,
        governing_check,
        tension_ratio,
        compression_ratio,
        flexure_y_ratio,
        flexure_z_ratio,
        interaction_ratio,
        phi_pn_compression,
        phi_pn_tension,
        phi_mn_y,
        phi_mn_z,
    }
}

/// AISC D2: Tension yielding on gross section.
fn tension_capacity(m: &SteelMemberData) -> f64 {
    PHI_T * m.fy * m.ag
}

/// AISC E3: Flexural buckling compression capacity.
fn compression_capacity(m: &SteelMemberData) -> f64 {
    let ky = m.ky.unwrap_or(1.0);
    let kz = m.kz.unwrap_or(1.0);

    // Slenderness ratio about each axis
    let kl_r_y = if m.ry > 0.0 { ky * m.lby / m.ry } else { 0.0 };
    let kl_r_z = if m.rz > 0.0 { kz * m.lbz / m.rz } else { 0.0 };
    let kl_r = kl_r_y.max(kl_r_z);

    if kl_r <= 0.0 { return PHI_C * m.fy * m.ag; }

    // Euler buckling stress
    let fe = std::f64::consts::PI * std::f64::consts::PI * m.e / (kl_r * kl_r);

    // Critical stress (AISC E3-2, E3-3)
    let fcr = if kl_r * (m.fy / m.e).sqrt() <= 4.71 {
        // Inelastic buckling: Fcr = (0.658^(Fy/Fe)) * Fy
        0.658_f64.powf(m.fy / fe) * m.fy
    } else {
        // Elastic buckling: Fcr = 0.877 * Fe
        0.877 * fe
    };

    PHI_C * fcr * m.ag
}

/// AISC F2: Lateral-torsional buckling for doubly-symmetric I-shapes (major axis).
fn flexural_capacity_y(m: &SteelMemberData) -> f64 {
    let mp = m.fy * m.zy;
    let lb = m.lb.unwrap_or(m.lby);
    let cb = m.cb.unwrap_or(1.0);
    let _g = m.g.unwrap_or(m.e / 2.6);
    let cw = m.cw.unwrap_or(0.0);

    if lb <= 0.0 || m.iy <= 0.0 {
        return PHI_B * mp;
    }

    // Lp and Lr (AISC F2-5, F2-6)
    let lp = 1.76 * m.rz * (m.e / m.fy).sqrt();

    // AISC F2-7: rts² = √(Iy_weak * Cw) / Sx_strong
    let c = 1.0; // For doubly-symmetric I-shapes
    let ho = m.depth.unwrap_or(0.3); // distance between flange centroids (approx depth)
    let rts = if m.sy > 1e-20 && cw > 0.0 {
        let rts_sq = (m.iz * cw).sqrt() / m.sy;
        rts_sq.sqrt()
    } else {
        // Fallback: rts ≈ bf / (2 * sqrt(3)) ≈ rz for I-shapes
        m.rz
    };

    let lr = if rts > 0.0 && m.j > 0.0 {
        // AISC F2-6: Lr = 1.95 * rts * (E/(0.7*Fy)) * sqrt(Jc/(Sx*ho) + sqrt(...))
        let jc_sh = m.j * c / (m.sy * ho);
        let ratio_sq = (0.7 * m.fy / m.e).powi(2);
        1.95 * rts * (m.e / (0.7 * m.fy))
            * (jc_sh + (jc_sh * jc_sh + 6.76 * ratio_sq).sqrt()).sqrt()
    } else {
        10.0 * lp // fallback
    };

    let mn = if lb <= lp {
        mp
    } else if lb <= lr {
        // Inelastic LTB (AISC F2-2)
        let mn_ltb = cb * (mp - (mp - 0.7 * m.fy * m.sy) * (lb - lp) / (lr - lp));
        mn_ltb.min(mp)
    } else {
        // Elastic LTB (AISC F2-3, F2-4)
        let pi2 = std::f64::consts::PI * std::f64::consts::PI;
        let lb_rts = lb / rts;
        let fcr = cb * pi2 * m.e / lb_rts.powi(2)
            * (1.0 + 0.078 * m.j * c / (m.sy * ho) * lb_rts.powi(2)).sqrt();
        (fcr * m.sy).min(mp)
    };

    PHI_B * mn
}

/// AISC F6: Flexural capacity about minor axis (no LTB).
fn flexural_capacity_z(m: &SteelMemberData) -> f64 {
    let mp_z = m.fy * m.zz;
    let my_z = m.fy * m.sz;
    let mn = mp_z.min(1.6 * my_z); // AISC F6-1
    PHI_B * mn
}

/// AISC H1-1: Combined axial and bending interaction.
fn interaction_h1(pr_pc: f64, mry_mcy: f64, mrz_mcz: f64) -> f64 {
    if pr_pc >= 0.2 {
        // H1-1a: Pr/Pc + (8/9)(Mry/Mcy + Mrz/Mcz) <= 1.0
        pr_pc + (8.0 / 9.0) * (mry_mcy + mrz_mcz)
    } else {
        // H1-1b: Pr/(2*Pc) + (Mry/Mcy + Mrz/Mcz) <= 1.0
        pr_pc / 2.0 + mry_mcy + mrz_mcz
    }
}
