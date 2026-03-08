//! Reinforced concrete design checks per Eurocode 2 (EN 1992-1-1).
//!
//! Covers flexural capacity using parabolic-rectangular stress block,
//! shear capacity with variable strut inclination method, and
//! combined checks. Uses characteristic/design material strengths.

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// EC2 concrete class (e.g., C25/30, C30/37).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2MemberData {
    pub element_id: usize,
    /// Characteristic cylinder strength fck (Pa)
    pub fck: f64,
    /// Characteristic yield strength of reinforcement fyk (Pa)
    pub fyk: f64,
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
    /// Modulus of elasticity of steel Es (Pa, default 200 GPa)
    #[serde(default)]
    pub es: Option<f64>,
    /// Partial safety factor for concrete gamma_c (default 1.5)
    #[serde(default)]
    pub gamma_c: Option<f64>,
    /// Partial safety factor for steel gamma_s (default 1.15)
    #[serde(default)]
    pub gamma_s: Option<f64>,
    /// Alpha_cc factor (default 1.0 per UK NA, 0.85 per some NAs)
    #[serde(default)]
    pub alpha_cc: Option<f64>,
    /// Stirrup area Asw per spacing (m²)
    #[serde(default)]
    pub asw: Option<f64>,
    /// Stirrup spacing s (m)
    #[serde(default)]
    pub s_stirrup: Option<f64>,
    /// Strut angle theta for shear (radians, default computed)
    #[serde(default)]
    pub theta_shear: Option<f64>,
    /// Minimum web width bw (m) — for T-beams, default = b
    #[serde(default)]
    pub bw: Option<f64>,
    /// Inner lever arm z (m) — if None, approximated as 0.9*d
    #[serde(default)]
    pub z: Option<f64>,
}

/// Applied design forces.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2DesignForces {
    pub element_id: usize,
    /// Design bending moment MEd (N-m)
    #[serde(default)]
    pub m_ed: Option<f64>,
    /// Design shear force VEd (N)
    #[serde(default)]
    pub v_ed: Option<f64>,
    /// Design axial force NEd (N, + tension, - compression)
    #[serde(default)]
    pub n_ed: Option<f64>,
}

/// Input for EC2 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2CheckInput {
    pub members: Vec<Ec2MemberData>,
    pub forces: Vec<Ec2DesignForces>,
}

/// Result of EC2 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec2CheckResult {
    pub element_id: usize,
    /// Flexural capacity MRd (N-m)
    pub m_rd: f64,
    /// Flexure ratio MEd / MRd
    pub flexure_ratio: f64,
    /// Shear capacity VRd (N) — minimum of VRd,c and VRd,max
    pub v_rd: f64,
    /// Shear ratio VEd / VRd
    pub shear_ratio: f64,
    /// Concrete-only shear capacity VRd,c (N)
    pub v_rdc: f64,
    /// Shear reinforcement capacity VRd,s (N)
    pub v_rds: f64,
    /// Max strut capacity VRd,max (N)
    pub v_rd_max: f64,
    /// Neutral axis depth x (m)
    pub x_na: f64,
    /// Lever arm z (m)
    pub z: f64,
    /// Overall pass
    pub pass: bool,
}

// ==================== Implementation ====================

/// Check all EC2 members.
pub fn check_ec2_members(input: &Ec2CheckInput) -> Vec<Ec2CheckResult> {
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
        results.push(check_single_ec2_member(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_ec2_member(m: &Ec2MemberData, f: &Ec2DesignForces) -> Ec2CheckResult {
    let gamma_c = m.gamma_c.unwrap_or(1.5);
    let gamma_s = m.gamma_s.unwrap_or(1.15);
    let alpha_cc = m.alpha_cc.unwrap_or(1.0);
    let es = m.es.unwrap_or(200e9);
    let bw = m.bw.unwrap_or(m.b);

    // Design material strengths
    let fcd = alpha_cc * m.fck / gamma_c;
    let fyd = m.fyk / gamma_s;

    let m_ed = f.m_ed.unwrap_or(0.0).abs();
    let v_ed = f.v_ed.unwrap_or(0.0).abs();

    // ==================== Flexure (EC2 Sec 6.1) ====================

    // Using simplified rectangular stress block (EC2 3.1.7)
    // lambda = 0.8 for fck <= 50 MPa, eta = 1.0
    let fck_mpa = m.fck / 1e6;
    let lambda = if fck_mpa <= 50.0 {
        0.8
    } else {
        0.8 - (fck_mpa - 50.0) / 400.0
    };
    let eta = if fck_mpa <= 50.0 {
        1.0
    } else {
        1.0 - (fck_mpa - 50.0) / 200.0
    };

    // Singly reinforced: force equilibrium
    // C = eta * fcd * lambda * x * b
    // T = As * fyd
    // C = T => x = As * fyd / (eta * fcd * lambda * b)
    let x_na = m.as_tension * fyd / (eta * fcd * lambda * m.b);

    // Check compression steel contribution
    let (m_rd, z) = if let (Some(as_c), Some(d_p)) = (m.as_compression, m.d_prime) {
        // Doubly reinforced
        // Check if compression steel yields
        let epsilon_cu = 0.0035; // EC2 3.1.7
        let epsilon_sc = epsilon_cu * (1.0 - d_p / x_na);
        let fsc = if epsilon_sc * es >= fyd {
            fyd
        } else {
            epsilon_sc * es
        };

        // Recompute x with compression steel
        let x = (m.as_tension * fyd - as_c * fsc) / (eta * fcd * lambda * m.b);
        let z_val = m.d - lambda * x / 2.0;
        let m_c = eta * fcd * lambda * x * m.b * z_val;
        let m_s = as_c * fsc * (m.d - d_p);
        (m_c + m_s, z_val)
    } else {
        // Singly reinforced
        let z_val = m.d - lambda * x_na / 2.0;
        let m_rd_val = m.as_tension * fyd * z_val;
        (m_rd_val, z_val)
    };

    let flexure_ratio = if m_rd > 0.0 { m_ed / m_rd } else { 0.0 };

    // ==================== Shear (EC2 Sec 6.2) ====================

    // VRd,c — concrete shear resistance without shear reinforcement (EC2 6.2.2)
    let d_mm = m.d * 1000.0;
    let bw_mm = bw * 1000.0;
    let k_shear = (1.0 + (200.0 / d_mm).sqrt()).min(2.0);
    let rho_l = (m.as_tension / (bw * m.d)).min(0.02);
    let c_rdc = 0.18 / gamma_c;
    let v_rdc = c_rdc * k_shear * (100.0 * rho_l * fck_mpa).powf(1.0 / 3.0) * bw_mm * d_mm;

    // Minimum VRd,c
    let v_min = 0.035 * k_shear.powf(1.5) * fck_mpa.sqrt() * bw_mm * d_mm;
    let v_rdc = v_rdc.max(v_min);

    // VRd,s — shear reinforcement capacity (EC2 6.2.3)
    let z_shear = m.z.unwrap_or(0.9 * m.d);
    let theta = m.theta_shear.unwrap_or(std::f64::consts::FRAC_PI_4 / 2.0 + std::f64::consts::FRAC_PI_4 / 2.0);
    // Default theta = 21.8 degrees (cot = 2.5, minimum angle)
    let theta = if m.theta_shear.is_none() {
        (1.0_f64 / 2.5_f64).atan() // 21.8 deg
    } else {
        theta
    };
    let cot_theta = 1.0 / theta.tan();

    let v_rds = match (m.asw, m.s_stirrup) {
        (Some(asw), Some(s)) if s > 0.0 => asw * z_shear * fyd * cot_theta / s,
        _ => 0.0,
    };

    // VRd,max — maximum strut capacity
    let nu1 = 0.6 * (1.0 - fck_mpa / 250.0);
    let v_rd_max = alpha_cc * nu1 * fcd * bw * z_shear * cot_theta
        / (1.0 + cot_theta * cot_theta);

    // Design shear capacity
    let v_rd = if v_rds > 0.0 {
        v_rds.min(v_rd_max)
    } else {
        v_rdc
    };

    let shear_ratio = if v_rd > 0.0 { v_ed / v_rd } else { 0.0 };

    let pass = flexure_ratio <= 1.0 && shear_ratio <= 1.0;

    Ec2CheckResult {
        element_id: m.element_id,
        m_rd,
        flexure_ratio,
        v_rd,
        shear_ratio,
        v_rdc,
        v_rds,
        v_rd_max,
        x_na,
        z,
        pass,
    }
}
