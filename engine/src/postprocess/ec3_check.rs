//! Steel member design checks per Eurocode 3 (EN 1993-1-1).
//!
//! Covers cross-section classification, flexural capacity,
//! compression with column buckling curves (a/b/c/d),
//! and combined loading interaction (EC3 6.3.3).

use serde::{Deserialize, Serialize};

// ==================== Types ====================

/// EC3 cross-section class (1-4).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SectionClass {
    Class1,
    Class2,
    Class3,
    Class4,
}

/// EC3 column buckling curve.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BucklingCurve {
    A,
    B,
    C,
    D,
}

impl BucklingCurve {
    /// Imperfection factor alpha per EC3 Table 6.1.
    fn alpha(self) -> f64 {
        match self {
            BucklingCurve::A => 0.21,
            BucklingCurve::B => 0.34,
            BucklingCurve::C => 0.49,
            BucklingCurve::D => 0.76,
        }
    }
}

fn default_buckling_curve() -> BucklingCurve {
    BucklingCurve::B
}

/// EC3 steel member data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec3MemberData {
    pub element_id: usize,
    /// Yield strength fy (Pa)
    pub fy: f64,
    /// Elastic modulus E (Pa, default 210 GPa)
    #[serde(default)]
    pub e: Option<f64>,
    /// Gross area A (m²)
    pub a: f64,
    /// Plastic section modulus Wpl,y — strong axis (m³)
    pub wpl_y: f64,
    /// Elastic section modulus Wel,y — strong axis (m³)
    pub wel_y: f64,
    /// Plastic section modulus Wpl,z — weak axis (m³)
    pub wpl_z: f64,
    /// Elastic section modulus Wel,z — weak axis (m³)
    pub wel_z: f64,
    /// Moment of inertia Iy — strong axis (m⁴)
    pub iy: f64,
    /// Moment of inertia Iz — weak axis (m⁴)
    pub iz: f64,
    /// Torsion constant It (m⁴)
    pub it: f64,
    /// Warping constant Iw (m⁶)
    pub iw: f64,
    /// Buckling length Lcr,y — strong axis (m)
    pub lcr_y: f64,
    /// Buckling length Lcr,z — weak axis (m)
    pub lcr_z: f64,
    /// Unbraced length for LTB (m)
    pub lb: f64,
    /// Section class
    #[serde(default = "default_class1")]
    pub section_class: SectionClass,
    /// Buckling curve for y-axis
    #[serde(default = "default_buckling_curve")]
    pub buckling_curve_y: BucklingCurve,
    /// Buckling curve for z-axis
    #[serde(default = "default_buckling_curve")]
    pub buckling_curve_z: BucklingCurve,
    /// Buckling curve for LTB
    #[serde(default = "default_buckling_curve")]
    pub buckling_curve_lt: BucklingCurve,
    /// gamma_M0 (default 1.0)
    #[serde(default)]
    pub gamma_m0: Option<f64>,
    /// gamma_M1 (default 1.0)
    #[serde(default)]
    pub gamma_m1: Option<f64>,
    /// C1 moment diagram factor for LTB (default 1.0)
    #[serde(default)]
    pub c1: Option<f64>,
    /// Shear area Av (m²)
    #[serde(default)]
    pub av: Option<f64>,
}

fn default_class1() -> SectionClass {
    SectionClass::Class1
}

/// Applied design forces on EC3 member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec3DesignForces {
    pub element_id: usize,
    /// Axial force NEd (N, + tension, - compression)
    #[serde(default)]
    pub n_ed: Option<f64>,
    /// Moment about strong axis My,Ed (N-m)
    #[serde(default)]
    pub my_ed: Option<f64>,
    /// Moment about weak axis Mz,Ed (N-m)
    #[serde(default)]
    pub mz_ed: Option<f64>,
    /// Shear force VEd (N)
    #[serde(default)]
    pub v_ed: Option<f64>,
}

/// Input for EC3 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec3CheckInput {
    pub members: Vec<Ec3MemberData>,
    pub forces: Vec<Ec3DesignForces>,
}

/// Result of EC3 check.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec3CheckResult {
    pub element_id: usize,
    /// Compression ratio NEd / Nb,Rd
    pub compression_ratio: f64,
    /// Tension ratio NEd / Npl,Rd
    pub tension_ratio: f64,
    /// Flexure ratio My,Ed / Mb,Rd (strong axis with LTB)
    pub flexure_ratio_y: f64,
    /// Flexure ratio Mz,Ed / Mpl,z,Rd (weak axis)
    pub flexure_ratio_z: f64,
    /// Shear ratio VEd / Vpl,Rd
    pub shear_ratio: f64,
    /// Combined interaction ratio (EC3 6.3.3)
    pub interaction_ratio: f64,
    /// Column buckling reduction chi_y
    pub chi_y: f64,
    /// Column buckling reduction chi_z
    pub chi_z: f64,
    /// LTB reduction chi_LT
    pub chi_lt: f64,
    /// Compression buckling resistance Nb,Rd (N)
    pub nb_rd: f64,
    /// LTB moment resistance Mb,Rd (N-m)
    pub mb_rd: f64,
    /// Overall pass
    pub pass: bool,
}

// ==================== Implementation ====================

/// Compute EC3 column buckling reduction factor chi.
fn compute_chi(lambda_bar: f64, alpha: f64) -> f64 {
    if lambda_bar <= 0.2 {
        return 1.0;
    }
    let phi = 0.5 * (1.0 + alpha * (lambda_bar - 0.2) + lambda_bar * lambda_bar);
    let chi = 1.0 / (phi + (phi * phi - lambda_bar * lambda_bar).sqrt());
    chi.min(1.0)
}

/// Check all EC3 members.
pub fn check_ec3_members(input: &Ec3CheckInput) -> Vec<Ec3CheckResult> {
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
        results.push(check_single_ec3_member(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

fn check_single_ec3_member(m: &Ec3MemberData, f: &Ec3DesignForces) -> Ec3CheckResult {
    let e = m.e.unwrap_or(210e9);
    let gamma_m0 = m.gamma_m0.unwrap_or(1.0);
    let gamma_m1 = m.gamma_m1.unwrap_or(1.0);
    let c1 = m.c1.unwrap_or(1.0);
    let g = e / (2.0 * 1.3); // Shear modulus G ≈ E/2.6

    let n_ed = f.n_ed.unwrap_or(0.0);
    let my_ed = f.my_ed.unwrap_or(0.0);
    let mz_ed = f.mz_ed.unwrap_or(0.0);
    let v_ed = f.v_ed.unwrap_or(0.0);

    // ==================== Cross-section resistance ====================

    // Plastic resistances
    let npl_rd = m.a * m.fy / gamma_m0;
    let _mpl_y_rd = m.wpl_y * m.fy / gamma_m0;
    let _mpl_z_rd = m.wpl_z * m.fy / gamma_m0;

    // ==================== Column buckling (EC3 6.3.1) ====================

    // Slenderness about y-axis
    let ncr_y = std::f64::consts::PI.powi(2) * e * m.iy / (m.lcr_y * m.lcr_y);
    let lambda_y = (m.a * m.fy / ncr_y).sqrt();
    let chi_y = compute_chi(lambda_y, m.buckling_curve_y.alpha());

    // Slenderness about z-axis
    let ncr_z = std::f64::consts::PI.powi(2) * e * m.iz / (m.lcr_z * m.lcr_z);
    let lambda_z = (m.a * m.fy / ncr_z).sqrt();
    let chi_z = compute_chi(lambda_z, m.buckling_curve_z.alpha());

    let chi_min = chi_y.min(chi_z);
    let nb_rd = chi_min * m.a * m.fy / gamma_m1;

    let compression_ratio = if n_ed < 0.0 && nb_rd > 0.0 {
        n_ed.abs() / nb_rd
    } else {
        0.0
    };

    let tension_ratio = if n_ed > 0.0 && npl_rd > 0.0 {
        n_ed / npl_rd
    } else {
        0.0
    };

    // ==================== Lateral-torsional buckling (EC3 6.3.2) ====================

    // Elastic critical moment Mcr (simplified for doubly-symmetric I-sections)
    let mcr = c1
        * std::f64::consts::PI.powi(2)
        * e
        * m.iz
        / (m.lb * m.lb)
        * ((m.iw / m.iz) + (m.lb * m.lb * g * m.it)
            / (std::f64::consts::PI.powi(2) * e * m.iz))
            .sqrt();

    let lambda_lt = (m.wpl_y * m.fy / mcr).sqrt();
    let chi_lt = compute_chi(lambda_lt, m.buckling_curve_lt.alpha());

    let mb_rd = chi_lt * m.wpl_y * m.fy / gamma_m1;

    let flexure_ratio_y = if my_ed.abs() > 0.0 && mb_rd > 0.0 {
        my_ed.abs() / mb_rd
    } else {
        0.0
    };

    // Weak axis flexure (no LTB)
    let mc_z_rd = m.wpl_z * m.fy / gamma_m0;
    let flexure_ratio_z = if mz_ed.abs() > 0.0 && mc_z_rd > 0.0 {
        mz_ed.abs() / mc_z_rd
    } else {
        0.0
    };

    // ==================== Shear (EC3 6.2.6) ====================

    let av = m.av.unwrap_or(m.a * 0.5); // Approximate if not given
    let vpl_rd = av * (m.fy / 3.0_f64.sqrt()) / gamma_m0;
    let shear_ratio = if v_ed.abs() > 0.0 && vpl_rd > 0.0 {
        v_ed.abs() / vpl_rd
    } else {
        0.0
    };

    // ==================== Interaction (EC3 6.3.3, Method 2) ====================

    // Simplified: NEd/(chi*N_Rd) + My,Ed/(chi_LT*My_Rd) + Mz,Ed/Mz_Rd <= 1.0
    let interaction_ratio = if n_ed < 0.0 {
        // Compression + biaxial bending
        let n_ratio = if nb_rd > 0.0 {
            n_ed.abs() / nb_rd
        } else {
            0.0
        };
        let my_ratio = if mb_rd > 0.0 {
            my_ed.abs() / mb_rd
        } else {
            0.0
        };
        let mz_ratio = if mc_z_rd > 0.0 {
            mz_ed.abs() / mc_z_rd
        } else {
            0.0
        };
        n_ratio + my_ratio + mz_ratio
    } else if n_ed > 0.0 {
        // Tension + bending
        tension_ratio + flexure_ratio_y + flexure_ratio_z
    } else {
        flexure_ratio_y + flexure_ratio_z
    };

    let pass = compression_ratio <= 1.0
        && tension_ratio <= 1.0
        && flexure_ratio_y <= 1.0
        && flexure_ratio_z <= 1.0
        && shear_ratio <= 1.0
        && interaction_ratio <= 1.0;

    Ec3CheckResult {
        element_id: m.element_id,
        compression_ratio,
        tension_ratio,
        flexure_ratio_y,
        flexure_ratio_z,
        shear_ratio,
        interaction_ratio,
        chi_y,
        chi_z,
        chi_lt,
        nb_rd,
        mb_rd,
        pass,
    }
}
