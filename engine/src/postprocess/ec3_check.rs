//! Steel member design checks per Eurocode 3 (EN 1993-1-1).
//!
//! Covers cross-section classification, flexural capacity,
//! compression with column buckling curves (a/b/c/d),
//! and member interaction of compression and bending (EC3 6.3.3, eqs.
//! (6.61)/(6.62) with the interaction factors of Annex B — "Method 2").

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

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
    pub(crate) fn alpha(self) -> f64 {
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
    /// Effective area Aeff (m²) for Class 4 sections; falls back to A
    #[serde(default)]
    pub a_eff: Option<f64>,
    /// Plastic section modulus Wpl,y — strong axis (m³)
    pub wpl_y: f64,
    /// Elastic section modulus Wel,y — strong axis (m³)
    pub wel_y: f64,
    /// Effective section modulus Weff,y (m³) for Class 4; falls back to Wel,y
    #[serde(default)]
    pub weff_y: Option<f64>,
    /// Plastic section modulus Wpl,z — weak axis (m³)
    pub wpl_z: f64,
    /// Elastic section modulus Wel,z — weak axis (m³)
    pub wel_z: f64,
    /// Effective section modulus Weff,z (m³) for Class 4; falls back to Wel,z
    #[serde(default)]
    pub weff_z: Option<f64>,
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
    /// Inputs of the 6.3.3 member interaction (Annex B). Absent: the
    /// conservative defaults documented on [`Ec3InteractionData`].
    #[serde(default)]
    pub interaction: Option<Ec3InteractionData>,
}

/// Inputs of the EN 1993-1-1 6.3.3 interaction, Annex B ("Method 2").
///
/// stabileo uses Annex B, not Annex A, for every member: it needs only the
/// equivalent uniform moment factors of Table B.3, which the caller can read
/// off the moment diagram, where Annex A also needs Ncr,T and the elastic
/// critical moment for uniform bending.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ec3InteractionData {
    /// Cmy, Table B.3, for the segment between y-y braced points. Absent:
    /// 1.0, the largest value Table B.3 gives (uniform moment, ψ = 1), so a
    /// missing diagram can only overstate the interaction.
    #[serde(default)]
    pub cmy: Option<f64>,
    /// Cmz, Table B.3, between z-z braced points. Absent: 1.0 (see `cmy`).
    #[serde(default)]
    pub cmz: Option<f64>,
    /// CmLT, Table B.3, between torsionally braced points. Absent: 1.0.
    #[serde(default)]
    pub cm_lt: Option<f64>,
    /// Closed (hollow) section: not susceptible to torsional deformations
    /// (Table B.1), and kzz takes the RHS expression. Absent/false: an open
    /// I- or H-section, Table B.2 whenever the member has an LTB length.
    #[serde(default)]
    pub hollow: Option<bool>,
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
    /// Combined interaction ratio: max of eqs. (6.61) and (6.62) in
    /// compression (6.3.3, Annex B factors); the linear sum of 6.2.1(7)
    /// otherwise.
    pub interaction_ratio: f64,
    /// Eq. (6.61) (0 when the member is not in compression).
    #[serde(default)]
    pub interaction_ratio_y: f64,
    /// Eq. (6.62) (0 when the member is not in compression).
    #[serde(default)]
    pub interaction_ratio_z: f64,
    /// Annex B interaction factors used in (6.61)/(6.62); 0 when the member
    /// is not in compression.
    #[serde(default)]
    pub k_yy: f64,
    #[serde(default)]
    pub k_yz: f64,
    #[serde(default)]
    pub k_zy: f64,
    #[serde(default)]
    pub k_zz: f64,
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
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== Implementation ====================

/// Section properties that depend on the cross-section class (EN 1993-1-1 6.2).
///
/// Class 1 and 2 can develop the plastic moment, so the resistance uses Wpl.
/// Class 3 is limited to first yield at the extreme fibre: Wel. Class 4 buckles
/// locally before yield and uses effective properties. Applying Wpl to every
/// section — which is what ignoring `section_class` amounts to — overstates a
/// Class 3 resistance by 10-15 % on a typical rolled I-section.
struct ClassProperties {
    /// Area for cross-section and buckling resistance
    area: f64,
    /// Section modulus about the strong axis
    w_y: f64,
    /// Section modulus about the weak axis
    w_z: f64,
}

fn class_properties(m: &Ec3MemberData) -> ClassProperties {
    match m.section_class {
        SectionClass::Class1 | SectionClass::Class2 => ClassProperties {
            area: m.a,
            w_y: m.wpl_y,
            w_z: m.wpl_z,
        },
        SectionClass::Class3 => ClassProperties {
            area: m.a,
            w_y: m.wel_y,
            w_z: m.wel_z,
        },
        SectionClass::Class4 => ClassProperties {
            // Effective properties where supplied. Without them the elastic
            // values are the closest available upper bound — they overstate a
            // Class 4 resistance, so Aeff/Weff should be provided.
            area: m.a_eff.unwrap_or(m.a),
            w_y: m.weff_y.unwrap_or(m.wel_y),
            w_z: m.weff_z.unwrap_or(m.wel_z),
        },
    }
}

/// Compute EC3 column buckling reduction factor chi.
///
/// Generic over `Real` so the certified check (`certify::design`) evaluates the
/// same formula in interval arithmetic.
pub(crate) fn compute_chi<T: Real>(lambda_bar: T, alpha: T) -> T {
    branch(
        lambda_bar.le(T::lit(0.2)),
        || T::exact(1.0),
        || {
            let phi = T::lit(0.5) * (T::exact(1.0) + alpha * (lambda_bar - T::lit(0.2)) + lambda_bar * lambda_bar);
            let chi = T::exact(1.0).dv(phi + (phi.sq() - lambda_bar.sq()).sqrt());
            // `chi.min(1.0)` returns 1.0 for a NaN chi, because Rust's f64::min ignores
            // NaN — so a NaN slenderness silently meant "no buckling reduction", the
            // most unconservative outcome available. Propagate the NaN instead and let
            // the caller flag the check.
            chi.min_keep_nan(T::exact(1.0))
        },
    )
}

/// Capacities of an EC3 member (independent of the design forces).
pub(crate) struct Ec3Capacities<T> {
    pub npl_rd: T,
    pub nb_rd: T,
    /// χy·NRk/γM1 and χz·NRk/γM1, the denominators of (6.61) and (6.62).
    pub nb_y_rd: T,
    pub nb_z_rd: T,
    /// Non-dimensional slendernesses λ̄y, λ̄z (6.3.1.2).
    pub lambda_y: T,
    pub lambda_z: T,
    /// Mz,Rk/γM1, the minor-axis denominator of (6.61)/(6.62).
    pub mz_rd_m1: T,
    pub mb_rd: T,
    pub mc_z_rd: T,
    pub vpl_rd: T,
    pub chi_y: T,
    pub chi_z: T,
    pub chi_lt: T,
}

/// EN 1993-1-1 resistances 6.2.3, 6.3.1, 6.3.2, 6.2.5, 6.2.6.
pub(crate) fn ec3_capacities<T: Real>(m: &Ec3MemberData) -> Ec3Capacities<T> {
    let e = T::exact(m.e.unwrap_or(210e9));
    let gamma_m0 = T::exact(m.gamma_m0.unwrap_or(1.0));
    let gamma_m1 = T::exact(m.gamma_m1.unwrap_or(1.0));
    let c1 = T::exact(m.c1.unwrap_or(1.0));
    let g = e.dv(T::exact(2.0) * T::lit(1.3)); // Shear modulus G ≈ E/2.6
    let fy = T::exact(m.fy);
    let pi2 = T::pi().sq();

    // Class-dependent section properties (EN 1993-1-1 6.2.5, 6.2.9)
    let props = class_properties(m);
    let area = T::exact(props.area);
    let w_y = T::exact(props.w_y);
    let w_z = T::exact(props.w_z);

    // Cross-section resistances
    let npl_rd = (area * fy).dv(gamma_m0);

    // Column buckling (EC3 6.3.1): slenderness about y and z
    let (lcr_y, lcr_z) = (T::exact(m.lcr_y), T::exact(m.lcr_z));
    let ncr_y = (pi2 * e * T::exact(m.iy)).dv(lcr_y * lcr_y);
    let lambda_y = (area * fy).dv(ncr_y).sqrt();
    let chi_y = compute_chi(lambda_y, T::lit(m.buckling_curve_y.alpha()));
    let ncr_z = (pi2 * e * T::exact(m.iz)).dv(lcr_z * lcr_z);
    let lambda_z = (area * fy).dv(ncr_z).sqrt();
    let chi_z = compute_chi(lambda_z, T::lit(m.buckling_curve_z.alpha()));
    let chi_min = chi_y.min(chi_z);
    let nb_rd = (chi_min * area * fy).dv(gamma_m1);
    let nb_y_rd = (chi_y * area * fy).dv(gamma_m1);
    let nb_z_rd = (chi_z * area * fy).dv(gamma_m1);

    // Lateral-torsional buckling (EC3 6.3.2): elastic critical moment Mcr
    // (simplified for doubly-symmetric I-sections)
    // Lb = 0 is a continuously restrained member: there is no LTB and χLT = 1
    // (6.3.2.2(4) with λLT = 0). Evaluating Mcr there divides by Lb² = 0 and
    // the 0·∞ that follows made the strong-axis check NaN, i.e. unevaluated,
    // for exactly the member whose resistance is simplest.
    let chi_lt = if m.lb <= 0.0 {
        T::exact(1.0)
    } else {
        let (lb, iz) = (T::exact(m.lb), T::exact(m.iz));
        let mcr = (c1 * pi2 * e * iz).dv(lb * lb)
            * (T::exact(m.iw).dv(iz) + (lb * lb * g * T::exact(m.it)).dv(pi2 * e * iz)).sqrt();
        let lambda_lt = (w_y * fy).dv(mcr).sqrt();
        compute_chi(lambda_lt, T::lit(m.buckling_curve_lt.alpha()))
    };
    let mb_rd = (chi_lt * w_y * fy).dv(gamma_m1);

    // Weak axis flexure (no LTB)
    let mc_z_rd = (w_z * fy).dv(gamma_m0);
    let mz_rd_m1 = (w_z * fy).dv(gamma_m1);

    // Shear (EC3 6.2.6)
    let av = match m.av {
        Some(av) => T::exact(av),
        None => T::exact(m.a) * T::exact(0.5), // Approximate if not given
    };
    let vpl_rd = (av * fy.dv(T::exact(3.0).sqrt())).dv(gamma_m0);

    Ec3Capacities {
        npl_rd,
        nb_rd,
        nb_y_rd,
        nb_z_rd,
        lambda_y,
        lambda_z,
        mz_rd_m1,
        mb_rd,
        mc_z_rd,
        vpl_rd,
        chi_y,
        chi_z,
        chi_lt,
    }
}

/// The scalars Annex B's interaction factors depend on.
#[derive(Debug, Clone, Copy)]
pub struct AnnexBInput<T> {
    /// Class 1 or 2 (plastic) — the left column of Tables B.1/B.2; else Class 3/4.
    pub plastic: bool,
    /// Susceptible to torsional deformations: Table B.2 (else Table B.1).
    pub torsional: bool,
    /// Rectangular hollow section: kzz takes the RHS expression of Table B.1.
    pub hollow: bool,
    pub lambda_y: T,
    pub lambda_z: T,
    /// ny = NEd/(χy·NRk/γM1), nz = NEd/(χz·NRk/γM1)
    pub n_y: T,
    pub n_z: T,
    pub cmy: T,
    pub cmz: T,
    pub cm_lt: T,
}

/// Interaction factors (kyy, kyz, kzy, kzz), EN 1993-1-1 Annex B,
/// Table B.1 (members not susceptible to torsional deformations) and
/// Table B.2 (members susceptible to torsional deformations).
///
/// Table B.1, Class 1/2:
///   kyy = Cmy·(1 + (λ̄y − 0.2)·ny) ≤ Cmy·(1 + 0.8·ny)
///   kzz = Cmz·(1 + (2λ̄z − 0.6)·nz) ≤ Cmz·(1 + 1.4·nz)    (I-sections)
///   kzz = Cmz·(1 + (λ̄z − 0.2)·nz) ≤ Cmz·(1 + 0.8·nz)     (RHS)
///   kyz = 0.6·kzz,  kzy = 0.6·kyy
/// Table B.1, Class 3/4:
///   kyy = Cmy·(1 + 0.6·λ̄y·ny) ≤ Cmy·(1 + 0.6·ny)
///   kzz = Cmz·(1 + 0.6·λ̄z·nz) ≤ Cmz·(1 + 0.6·nz)
///   kyz = kzz,  kzy = 0.8·kyy
/// Table B.2 (kyy, kyz, kzz as Table B.1), kzy:
///   Class 1/2: [1 − 0.1·λ̄z·nz/(CmLT − 0.25)] ≥ [1 − 0.1·nz/(CmLT − 0.25)],
///              and for λ̄z < 0.4: kzy = 0.6 + λ̄z ≤ 1 − 0.1·λ̄z·nz/(CmLT − 0.25)
///   Class 3/4: [1 − 0.05·λ̄z·nz/(CmLT − 0.25)] ≥ [1 − 0.05·nz/(CmLT − 0.25)]
pub fn annex_b_factors<T: Real>(i: &AnnexBInput<T>) -> [T; 4] {
    let one = T::exact(1.0);
    let (ly, lz, ny, nz) = (i.lambda_y, i.lambda_z, i.n_y, i.n_z);
    let (kyy, kzz) = if i.plastic {
        let kyy = (i.cmy * (one + (ly - T::lit(0.2)) * ny)).min(i.cmy * (one + T::lit(0.8) * ny));
        let kzz = if i.hollow {
            (i.cmz * (one + (lz - T::lit(0.2)) * nz)).min(i.cmz * (one + T::lit(0.8) * nz))
        } else {
            (i.cmz * (one + (T::exact(2.0) * lz - T::lit(0.6)) * nz)).min(i.cmz * (one + T::lit(1.4) * nz))
        };
        (kyy, kzz)
    } else {
        let kyy = (i.cmy * (one + T::lit(0.6) * ly * ny)).min(i.cmy * (one + T::lit(0.6) * ny));
        let kzz = (i.cmz * (one + T::lit(0.6) * lz * nz)).min(i.cmz * (one + T::lit(0.6) * nz));
        (kyy, kzz)
    };
    let kyz = if i.plastic { T::lit(0.6) * kzz } else { kzz };
    let kzy = if !i.torsional {
        if i.plastic { T::lit(0.6) * kyy } else { T::lit(0.8) * kyy }
    } else {
        let d = i.cm_lt - T::lit(0.25);
        if i.plastic {
            let upper = one - (T::lit(0.1) * lz * nz).dv(d);
            branch(
                lz.lt(T::lit(0.4)),
                || (T::lit(0.6) + lz).min(upper),
                || upper.max(one - (T::lit(0.1) * nz).dv(d)),
            )
        } else {
            (one - (T::lit(0.05) * lz * nz).dv(d)).max(one - (T::lit(0.05) * nz).dv(d))
        }
    };
    [kyy, kyz, kzy, kzz]
}

/// Eqs. (6.61), (6.62) and the factors, for a member in compression
/// (`n` = |NEd| > 0). ΔMy = ΔMz = 0: Class 1–3, and Class 4 of the doubly
/// symmetric I-sections this check models (eN = 0).
pub(crate) fn ec3_interaction<T: Real>(
    m: &Ec3MemberData,
    caps: &Ec3Capacities<T>,
    n: T,
    my: T,
    mz: T,
) -> ([T; 2], [T; 4]) {
    let id = m.interaction.clone().unwrap_or_default();
    let plastic = matches!(m.section_class, SectionClass::Class1 | SectionClass::Class2);
    let hollow = id.hollow.unwrap_or(false);
    // 6.3.3(1)/(4): an open section with an unbraced LTB length is
    // susceptible to torsional deformations (Table B.2); Lb = 0 (χLT = 1)
    // is torsionally restrained and a hollow section is not susceptible.
    let torsional = !hollow && m.lb > 0.0;
    let k = annex_b_factors(&AnnexBInput {
        plastic,
        torsional,
        hollow,
        lambda_y: caps.lambda_y,
        lambda_z: caps.lambda_z,
        n_y: n.dv(caps.nb_y_rd),
        n_z: n.dv(caps.nb_z_rd),
        cmy: T::exact(id.cmy.unwrap_or(1.0)),
        cmz: T::exact(id.cmz.unwrap_or(1.0)),
        cm_lt: T::exact(id.cm_lt.unwrap_or(1.0)),
    });
    let [kyy, kyz, kzy, kzz] = k;
    let zero = T::exact(0.0);
    // A moment term is only formed where there is a moment, so a zero
    // capacity with zero demand stays 0 instead of 0/0.
    let my_term = branch(zero.lt(my), || my.dv(caps.mb_rd), || zero);
    let mz_term = branch(zero.lt(mz), || mz.dv(caps.mz_rd_m1), || zero);
    let eq_661 = n.dv(caps.nb_y_rd) + kyy * my_term + kyz * mz_term;
    let eq_662 = n.dv(caps.nb_z_rd) + kzy * my_term + kzz * mz_term;
    ([eq_661, eq_662], k)
}

/// Table B.3 bounds the equivalent uniform moment factors: Cm ∈ [0.4, 1].
/// A value outside is not one Table B.3 can give, and CmLT ≤ 0.25 would
/// divide by zero or flip the sign of Table B.2's kzy.
pub(crate) fn ec3_cm_inputs_valid(m: &Ec3MemberData) -> bool {
    let id = m.interaction.clone().unwrap_or_default();
    [id.cmy, id.cmz, id.cm_lt].iter().all(|c| match c {
        Some(c) => c.is_finite() && (0.4..=1.0).contains(c),
        None => true,
    })
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

/// Check all EC3 members.
pub fn check_ec3_members(input: &Ec3CheckInput) -> Vec<Ec3CheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();
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
    let caps: Ec3Capacities<f64> = ec3_capacities(m);

    let n_ed = f.n_ed.unwrap_or(0.0);
    let my_ed = f.my_ed.unwrap_or(0.0);
    let mz_ed = f.mz_ed.unwrap_or(0.0);
    let v_ed = f.v_ed.unwrap_or(0.0);

    let Ec3Capacities { npl_rd, nb_rd, mb_rd, mc_z_rd, vpl_rd, chi_y, chi_z, chi_lt, .. } = caps;

    let mut ledger = CheckLedger::new();
    ledger.require_finite("Column buckling chi_y", chi_y);
    ledger.require_finite("Column buckling chi_z", chi_z);

    let compression_ratio =
        ledger.ratio_if_loaded("Compression 6.3.1", (-n_ed).max(0.0), nb_rd);
    let tension_ratio = ledger.ratio_if_loaded("Tension 6.2.3", n_ed.max(0.0), npl_rd);

    ledger.require_finite("LTB chi_LT", chi_lt);
    let flexure_ratio_y = ledger.ratio_if_loaded("Flexure-y 6.3.2", my_ed.abs(), mb_rd);

    // Weak axis flexure (no LTB)
    let flexure_ratio_z = ledger.ratio_if_loaded("Flexure-z 6.2.5", mz_ed.abs(), mc_z_rd);

    // ==================== Shear (EC3 6.2.6) ====================

    let shear_ratio = ledger.ratio_if_loaded("Shear 6.2.6", v_ed.abs(), vpl_rd);

    // ==================== Interaction (EC3 6.3.3, Annex B) ====================

    let mut eqs = [0.0_f64; 2];
    let mut k = [0.0_f64; 4];
    let interaction_ratio = if n_ed < 0.0 {
        // 6.3.3(4), eqs. (6.61) and (6.62) with the Annex B factors. This was
        // NEd/Nb,Rd + My/Mb,Rd + Mz/Mc,z,Rd — every k taken as 1 — which is
        // unconservative wherever Annex B gives k > 1: kyy reaches
        // Cmy·(1 + 0.8·ny), kzz Cmz·(1 + 1.4·nz).
        if ec3_cm_inputs_valid(m) {
            let (e, kk) = ec3_interaction(m, &caps, n_ed.abs(), my_ed.abs(), mz_ed.abs());
            eqs = e;
            k = kk;
            e[0].max(e[1])
        } else {
            f64::NAN // refused below: a Cm outside Table B.3's [0.4, 1]
        }
    } else if n_ed > 0.0 {
        // Tension + bending: the conservative linear sum of 6.2.1(7).
        tension_ratio + flexure_ratio_y + flexure_ratio_z
    } else {
        flexure_ratio_y + flexure_ratio_z
    };

    let interaction_ratio = ledger.require_finite("Interaction 6.3.3", interaction_ratio);

    let pass = ledger.all_evaluated()
        && compression_ratio <= 1.0
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
        interaction_ratio_y: eqs[0],
        interaction_ratio_z: eqs[1],
        k_yy: k[0],
        k_yz: k[1],
        k_zy: k[2],
        k_zz: k[3],
        chi_y,
        chi_z,
        chi_lt,
        nb_rd,
        mb_rd,
        pass,
        unevaluated: ledger.into_unevaluated(),
    }
}
