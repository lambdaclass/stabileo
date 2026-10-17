//! Steel member design checks per AISC 360 (LRFD).
//!
//! Given analysis results and member properties, computes unity ratios
//! for axial, flexural, and combined loading interaction equations.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real, Tri};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

// ==================== Types ====================

/// Steel design parameters for a member.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteelMemberData {
    pub element_id: usize,
    /// Yield stress (Pa or consistent units)
    pub fy: f64,
    /// Tensile strength Fu (Pa). Required for the D2-2 rupture check; without
    /// it only gross-section yielding is evaluated.
    #[serde(default)]
    pub fu: Option<f64>,
    /// Gross area (m² or consistent)
    pub ag: f64,
    /// Net area for tension (default = Ag)
    #[serde(default)]
    pub an: Option<f64>,
    /// Effective net area factor U (default 1.0)
    #[serde(default)]
    pub u_factor: Option<f64>,
    /// Web area Aw = d·tw (m²). Required for the G2 shear check.
    #[serde(default)]
    pub aw: Option<f64>,
    /// Web shear strength coefficient Cv1 (default 1.0, AISC G2.1)
    #[serde(default)]
    pub cv1: Option<f64>,
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
    /// Flange width-to-thickness ratio bf/(2·tf) (AISC Table B4.1b, case 10
    /// for major-axis and case 13 for minor-axis bending). When given, flange
    /// local buckling is checked: F3 about the major axis, F6.2 about the
    /// minor. Absent, the flanges are taken as compact (F2, F6.1), which is
    /// unconservative for the rolled shapes footnoted [f] in Manual Table 1-1.
    #[serde(default)]
    pub flange_slenderness: Option<f64>,
    /// The plate elements of the section in axial compression, for the
    /// slender-element reduction of AISC 360-22 E7. Absent: the compression
    /// check is refused — whether an element is slender cannot be known, and
    /// E3 alone (Ae = Ag) overstates a slender section. An empty list states
    /// that the section has no element to reduce (a solid bar).
    #[serde(default)]
    pub compression_elements: Option<Vec<AiscElement>>,
    /// Where the transverse load acts, for lateral-torsional buckling.
    /// Absent: the top flange (destabilising), see [`AiscLoadPosition`].
    #[serde(default)]
    pub load_position: Option<AiscLoadPosition>,
}

/// One kind of plate element of a section in compression, AISC 360-22
/// Table B4.1a, with its width b and thickness t as B4.1 defines them, and
/// how many the section has.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiscElement {
    pub kind: AiscElementKind,
    /// Width b (for a round HSS, the outside diameter D).
    pub b: f64,
    /// Thickness t.
    pub t: f64,
    /// Number of such elements (default 1): 4 flange outstands of an I,
    /// 2 walls of each width of a rectangular HSS.
    #[serde(default)]
    pub count: Option<f64>,
    /// kc of a welded I flange, 4/√(h/tw) within [0.35, 0.76] (Table B4.1a
    /// note [a]). Absent: 0.35, the lower bound (the lowest λr).
    #[serde(default)]
    pub kc: Option<f64>,
}

/// Table B4.1a cases, and the Table E7.1 row each belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiscElementKind {
    /// Case 1: flange of a rolled I, plate projecting from a rolled shape. λr = 0.56√(E/Fy).
    RolledFlange,
    /// Case 2: flange of a built-up I. λr = 0.64√(kc·E/Fy).
    WeldedFlange,
    /// Case 3: leg of a single angle, angle legs with separators. λr = 0.45√(E/Fy).
    Angle,
    /// Case 4: stem of a tee. λr = 0.75√(E/Fy).
    TeeStem,
    /// Case 5: web of a doubly symmetric I or channel. λr = 1.49√(E/Fy). E7.1(a).
    Web,
    /// Case 6: wall of a rectangular HSS (b = outside width − 3t). λr = 1.40√(E/Fy). E7.1(b).
    HssWall,
    /// Case 8: other stiffened elements (built-up box walls, flange cover plates). λr = 1.49√(E/Fy). E7.1(a).
    Stiffened,
    /// Case 9: round HSS, b = D. λr = 0.11·E/Fy; E7.2.
    RoundHss,
}

/// Where the transverse load acts on a doubly symmetric I.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiscLoadPosition {
    /// At the shear centre (or end moments only): Cb as given.
    ShearCentre,
    /// On the top flange: Cb·1.4^(2y/h) with y = −h/2, i.e. Cb/1.4
    /// (Helwig, Frank & Yura 1997; SSRC Guide, Ziemian 2010, §5.2.3).
    TopFlange,
    /// On the bottom flange: Cb as given. The same expression would raise
    /// Cb by 1.4; the stabilising effect is ignored, the conservative side.
    BottomFlange,
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
    /// Shear capacity check (Vr / phi*Vn), 0.0 when Aw was not supplied
    pub shear_ratio: f64,
    /// Combined interaction ratio (AISC H1-1)
    pub interaction_ratio: f64,
    /// Available shear strength (phi*Vn), 0.0 when Aw was not supplied
    pub phi_vn: f64,
    /// Available axial compression strength (phi*Pn)
    pub phi_pn_compression: f64,
    /// Available axial tension strength (phi*Pn)
    pub phi_pn_tension: f64,
    /// Available flexural strength about Y (phi*Mn)
    pub phi_mn_y: f64,
    /// Available flexural strength about Z (phi*Mn)
    pub phi_mn_z: f64,
    /// Effective area Ae of E7 (= Ag when no element is slender); absent
    /// when the compression check was not evaluated.
    #[serde(default)]
    pub ae: Option<f64>,
    /// Checks whose capacity could not be evaluated. Non-empty means the
    /// reported ratios do not cover the member.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== AISC 360 Design Checks ====================

pub(crate) const PHI_C: f64 = 0.90; // Compression
pub(crate) const PHI_T: f64 = 0.90; // Tension (yielding)
pub(crate) const PHI_TR: f64 = 0.75; // Tension (rupture on the net section)
pub(crate) const PHI_B: f64 = 0.90; // Flexure
/// AISC G1 general case. The phi_v = 1.00 of G2.1(a) needs h/tw <= 2.24*sqrt(E/Fy),
/// which cannot be verified from the properties supplied here, so the lower
/// value is used.
pub(crate) const PHI_V: f64 = 0.90;


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

/// Run AISC 360 steel design checks on all members.
pub fn check_steel_members(input: &SteelCheckInput) -> Vec<SteelCheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();

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
    let phi_pn_tension: f64 = tension_capacity(member);

    // Available compression strength (AISC E3)
    let phi_pn_compression: f64 = compression_capacity(member);

    // Available flexural strength (AISC F2 - compact doubly-symmetric I)
    let phi_mn_y: f64 = flexural_capacity_y(member);
    let phi_mn_z: f64 = flexural_capacity_z(member);

    // Demand ratios
    let n = forces.n;
    let my = forces.my.abs();
    let mz = forces.mz.unwrap_or(0.0).abs();

    let mut ledger = CheckLedger::new();

    let tension_ratio =
        ledger.ratio_if_loaded("Tension D2", n.max(0.0), phi_pn_tension);
    if n < 0.0 && member.compression_elements.is_none() {
        ledger.flag("Compression E7: compressionElements not given (Table B4.1a)");
    }
    let compression_ratio =
        ledger.ratio_if_loaded("Compression E3/E7", (-n).max(0.0), phi_pn_compression);
    let flexure_y_ratio = ledger.ratio_if_loaded("Flexure-Y F2", my, phi_mn_y);
    let flexure_z_ratio = ledger.ratio_if_loaded("Flexure-Z F6", mz, phi_mn_z);

    // A NaN demand never reaches a ratio above, so flag it explicitly.
    if !n.is_finite() {
        ledger.flag("Axial demand");
    }

    // AISC G2 shear
    let phi_vn: f64 = shear_capacity(member);
    let vy = forces.vy.unwrap_or(0.0).abs();
    let shear_ratio = if phi_vn > 0.0 { vy / phi_vn } else { 0.0 };

    // AISC H1 interaction (using appropriate axial capacity)
    let axial_ratio = if n < 0.0 { compression_ratio } else { tension_ratio };
    let interaction_ratio = ledger.require_finite(
        "Interaction H1",
        interaction_h1(axial_ratio, flexure_y_ratio, flexure_z_ratio),
    );

    // Governing
    let checks = [
        (tension_ratio, "Tension D2"),
        (compression_ratio, "Compression E3/E7"),
        (flexure_y_ratio, "Flexure-Y F2"),
        (flexure_z_ratio, "Flexure-Z F6"),
        (shear_ratio, "Shear G2"),
        (interaction_ratio, "Interaction H1"),
    ];

    let (unity_ratio, governing) = ledger.governing(&checks);
    let governing_check = if ledger.all_evaluated() {
        governing.to_string()
    } else {
        format!("{governing} (incomplete)")
    };

    SteelCheckResult {
        element_id: eid,
        unity_ratio,
        governing_check,
        tension_ratio,
        compression_ratio,
        flexure_y_ratio,
        flexure_z_ratio,
        shear_ratio,
        interaction_ratio,
        phi_vn,
        phi_pn_compression,
        phi_pn_tension,
        phi_mn_y,
        phi_mn_z,
        ae: Some(compression_ae::<f64>(member)).filter(|x| x.is_finite()),
        unevaluated: ledger.into_unevaluated(),
    }
}

/// AISC D2: available tensile strength — the lower of yielding on the gross
/// section (D2-1) and rupture on the effective net section (D2-2).
///
/// Rupture is skipped when Fu is not supplied, since there is no basis for it.
/// Where a member is bolted, rupture routinely governs: the smaller phi (0.75
/// vs 0.90) and the hole deduction together typically cost 20 %.
///
/// Generic over `Real` so the certified check (`certify::design`) evaluates
/// the very same formula in interval arithmetic.
pub(crate) fn tension_capacity<T: Real>(m: &SteelMemberData) -> T {
    let yielding = T::lit(PHI_T) * T::exact(m.fy) * T::exact(m.ag);

    match m.fu {
        Some(fu) if fu > 0.0 => {
            // D3: Ae = An·U
            let an = m.an.unwrap_or(m.ag);
            let u = m.u_factor.unwrap_or(1.0);
            let rupture = T::lit(PHI_TR) * T::exact(fu) * T::exact(an) * T::exact(u);
            yielding.min(rupture)
        }
        _ => yielding,
    }
}

/// AISC G2-1: Vn = 0.6·Fy·Aw·Cv1.
///
/// Returns 0.0 when the web area is unknown — there is no shear check to
/// report rather than a capacity to invent.
pub(crate) fn shear_capacity<T: Real>(m: &SteelMemberData) -> T {
    match m.aw {
        Some(aw) if aw > 0.0 => {
            let cv1 = m.cv1.unwrap_or(1.0);
            T::lit(PHI_V) * T::lit(0.6) * T::exact(m.fy) * T::exact(aw) * T::exact(cv1)
        }
        _ => T::exact(0.0),
    }
}

/// E3 critical stress Fcr (flexural buckling, about the weaker axis).
fn compression_fcr<T: Real>(m: &SteelMemberData) -> T {
    let ky = m.ky.unwrap_or(1.0);
    let kz = m.kz.unwrap_or(1.0);
    let zero = T::exact(0.0);

    // Slenderness ratio about each axis
    let kl_r_y = if m.ry > 0.0 { (T::exact(ky) * T::exact(m.lby)).dv(T::exact(m.ry)) } else { zero };
    let kl_r_z = if m.rz > 0.0 { (T::exact(kz) * T::exact(m.lbz)).dv(T::exact(m.rz)) } else { zero };
    let kl_r = kl_r_y.max(kl_r_z);
    let (fy, e) = (T::exact(m.fy), T::exact(m.e));

    branch(
        kl_r.le(zero),
        || fy,
        || {
            // Euler buckling stress
            let fe = (T::pi() * T::pi() * e).dv(kl_r.sq());
            // Critical stress (AISC E3-2, E3-3)
            branch(
                (kl_r * fy.dv(e).sqrt()).le(T::lit(4.71)),
                // Inelastic buckling: Fcr = (0.658^(Fy/Fe)) * Fy
                || T::lit(0.658).powf(fy.dv(fe)) * fy,
                // Elastic buckling: Fcr = 0.877 * Fe
                || T::lit(0.877) * fe,
            )
        },
    )
}

/// Effective area Ae, AISC 360-22 E7. NaN when the elements are not given
/// or one is outside what E7 covers (a round HSS with D/t > 0.45·E/Fy).
///
/// E7.1, elements other than round HSS (E7-2, E7-3, E7-5):
///   λ ≤ λr·√(Fy/Fcr): be = b
///   otherwise:        be = b·(1 − c1·√(Fel/Fcr))·√(Fel/Fcr),
///                     Fel = (c2·λr/λ)²·Fy,
/// with (c1, c2) from Table E7.1: (0.18, 1.31) stiffened except HSS walls,
/// (0.20, 1.38) rectangular HSS walls, (0.22, 1.49) all others. Ae = Ag −
/// Σ(b − be)·t.
/// E7.2, round HSS: D/t ≤ 0.11·E/Fy: Ae = Ag; up to 0.45·E/Fy:
///   Ae = [0.038·E/(Fy·D/t) + 2/3]·Ag (E7-7).
pub(crate) fn compression_ae<T: Real>(m: &SteelMemberData) -> T {
    let Some(elements) = &m.compression_elements else {
        return T::exact(f64::NAN);
    };
    let (fy, e) = (T::exact(m.fy), T::exact(m.e));
    let fcr = compression_fcr::<T>(m);
    let ag = T::exact(m.ag);
    let r = (m.e / m.fy).sqrt();
    let mut ae = ag;
    for el in elements {
        let count = el.count.unwrap_or(1.0);
        if !(el.b > 0.0 && el.t > 0.0 && count.is_finite() && count >= 0.0) {
            return T::exact(f64::NAN);
        }
        let lambda = el.b / el.t;
        if el.kind == AiscElementKind::RoundHss {
            if lambda <= 0.11 * m.e / m.fy {
                continue;
            }
            if lambda > 0.45 * m.e / m.fy {
                return T::exact(f64::NAN);
            }
            // E7-7 reduces the whole section: Ae = factor·Ag.
            let factor = T::lit(0.038) * e.dv(fy * T::exact(lambda)) + T::exact(2.0).dv(T::exact(3.0));
            ae = ae.min(factor * ag);
            continue;
        }
        let (lambda_r, c1, c2) = match el.kind {
            AiscElementKind::RolledFlange => (0.56 * r, 0.22, 1.49),
            AiscElementKind::WeldedFlange => {
                let kc = el.kc.unwrap_or(0.35);
                if !(0.35..=0.76).contains(&kc) {
                    return T::exact(f64::NAN);
                }
                (0.64 * (kc * m.e / m.fy).sqrt(), 0.22, 1.49)
            }
            AiscElementKind::Angle => (0.45 * r, 0.22, 1.49),
            AiscElementKind::TeeStem => (0.75 * r, 0.22, 1.49),
            AiscElementKind::Web => (1.49 * r, 0.18, 1.31),
            AiscElementKind::HssWall => (1.40 * r, 0.20, 1.38),
            AiscElementKind::Stiffened => (1.49 * r, 0.18, 1.31),
            AiscElementKind::RoundHss => unreachable!(),
        };
        let (b, t) = (T::exact(el.b), T::exact(el.t));
        let fel = (T::exact(c2 * lambda_r / lambda)).sq() * fy;
        let lost = branch(
            T::exact(lambda).le(T::exact(lambda_r) * fy.dv(fcr).sqrt()),
            || T::exact(0.0),
            || {
                let s = fel.dv(fcr).sqrt();
                let be = b * (T::exact(1.0) - T::exact(c1) * s) * s;
                (b - be) * t
            },
        );
        ae = ae - T::exact(count) * lost;
    }
    ae
}

/// AISC E3/E7: compression capacity φc·Fcr·Ae (Ae = Ag when no element is
/// slender). NaN — refused — without `compression_elements`.
pub(crate) fn compression_capacity<T: Real>(m: &SteelMemberData) -> T {
    T::lit(PHI_C) * compression_fcr::<T>(m) * compression_ae::<T>(m)
}

/// AISC F2: Lateral-torsional buckling for doubly-symmetric I-shapes (major axis).
pub(crate) fn flexural_capacity_y<T: Real>(m: &SteelMemberData) -> T {
    let (fy, e) = (T::exact(m.fy), T::exact(m.e));
    let mp = fy * T::exact(m.zy);
    let lb = T::exact(m.lb.unwrap_or(m.lby));
    // Load height: a top-flange load lowers the elastic critical moment,
    // Cb·1.4^(2y/h) with y = −h/2 (see [`AiscLoadPosition`]). The default is
    // the top flange: the checker does not know where the load acts.
    let cb = match m.load_position.unwrap_or(AiscLoadPosition::TopFlange) {
        AiscLoadPosition::TopFlange => T::exact(m.cb.unwrap_or(1.0)).dv(T::lit(1.4)),
        AiscLoadPosition::ShearCentre | AiscLoadPosition::BottomFlange => T::exact(m.cb.unwrap_or(1.0)),
    };
    let cw = m.cw.unwrap_or(0.0);
    let zero = T::exact(0.0);

    // F3.2: compression flange local buckling. It does not depend on Lb, so
    // it caps the continuously braced member too.
    let mn_flb = flange_local_buckling_major(m, mp);

    if m.lb.unwrap_or(m.lby) <= 0.0 || m.iy <= 0.0 {
        return T::lit(PHI_B) * mp.min(mn_flb);
    }

    // Lp and Lr (AISC F2-5, F2-6)
    let lp = T::lit(1.76) * T::exact(m.rz) * e.dv(fy).sqrt();

    // AISC F2-7: rts² = √(Iy_weak * Cw) / Sx_strong
    let c = T::exact(1.0); // For doubly-symmetric I-shapes

    // `ho` is the distance between flange centroids. For a doubly-symmetric
    // I-shape Cw = Iz·ho²/4, so when Cw is supplied ho follows from the section
    // properties already given — no guess needed, and it lands within ~0.3 % of
    // d - tf for rolled shapes. Falling back to a literal 0.3 m (the previous
    // default) applied one section's depth to every section.
    let ho: Option<T> = if cw > 0.0 && m.iz > 0.0 {
        Some(T::exact(2.0) * T::exact(cw).dv(T::exact(m.iz)).sqrt())
    } else {
        m.depth.map(T::exact)
    };

    let rts = if m.sy > 1e-20 && cw > 0.0 {
        let rts_sq = (T::exact(m.iz) * T::exact(cw)).sqrt().dv(T::exact(m.sy));
        rts_sq.sqrt()
    } else {
        // Fallback: rts ≈ bf / (2 * sqrt(3)) ≈ rz for I-shapes
        T::exact(m.rz)
    };

    // St-Venant torsion term Jc/(Sx·ho), shared by F2-4 and F2-6. Without a
    // usable ho there is no basis for it; dropping it to zero reduces Fcr to
    // the pure-warping lower bound, which is the conservative reading.
    let jc_sh = match ho {
        Some(ho) if m.sy > 1e-20 => branch(
            zero.lt(ho),
            || (T::exact(m.j) * c).dv(T::exact(m.sy) * ho),
            || zero,
        ),
        _ => zero,
    };

    let lr = branch(
        zero.lt(rts).and(Tri::of_bool(m.j > 0.0)).and(zero.lt(jc_sh)),
        || {
            // AISC F2-6: Lr = 1.95 * rts * (E/(0.7*Fy)) * sqrt(Jc/(Sx*ho) + sqrt(...))
            let ratio_sq = (T::lit(0.7) * fy).dv(e).sq();
            T::lit(1.95) * rts * e.dv(T::lit(0.7) * fy)
                * (jc_sh + (jc_sh * jc_sh + T::lit(6.76) * ratio_sq).sqrt()).sqrt()
        },
        // No basis for Lr: treat everything past Lp as elastic LTB rather than
        // inventing a long inelastic plateau (the previous 10·Lp fallback ran
        // the other way).
        || lp,
    );

    let mn = branch(
        lb.le(lp),
        || mp,
        || {
            branch(
                lb.le(lr),
                || {
                    // Inelastic LTB (AISC F2-2)
                    let mn_ltb =
                        cb * (mp - ((mp - T::lit(0.7) * fy * T::exact(m.sy)) * (lb - lp)).dv(lr - lp));
                    mn_ltb.min(mp)
                },
                || {
                    // Elastic LTB (AISC F2-3, F2-4)
                    let pi2 = T::pi() * T::pi();
                    let lb_rts = lb.dv(rts);
                    let fcr = (cb * pi2 * e).dv(lb_rts.sq())
                        * (T::exact(1.0) + T::lit(0.078) * jc_sh * lb_rts.sq()).sqrt();
                    (fcr * T::exact(m.sy)).min(mp)
                },
            )
        },
    );

    T::lit(PHI_B) * mn.min(mn_flb)
}

/// Compact (λpf) and noncompact (λrf) flange limits common to F3 and F6:
/// 0.38·√(E/Fy) and 1.0·√(E/Fy), Table B4.1b cases 10 and 13.
fn flange_limits(m: &SteelMemberData) -> (f64, f64) {
    let r = (m.e / m.fy).sqrt();
    (0.38 * r, 1.0 * r)
}

/// AISC F3.2, flange local buckling about the major axis. Returns Mp when no
/// slenderness is given or the flange is compact.
///
/// Slender flanges (F3-2) need kc = 4/√(h/tw), and h/tw is not an input: the
/// lower bound kc = 0.35 of the clause is used, which can only understate Mn.
fn flange_local_buckling_major<T: Real>(m: &SteelMemberData, mp: T) -> T {
    let lambda = match m.flange_slenderness {
        Some(l) if l > 0.0 => l,
        _ => return mp,
    };
    let (lpf, lrf) = flange_limits(m);
    let (fy, e, sx) = (T::exact(m.fy), T::exact(m.e), T::exact(m.sy));
    if lambda <= lpf {
        mp
    } else if lambda <= lrf {
        // F3-1
        mp - ((mp - T::lit(0.7) * fy * sx) * T::exact(lambda - lpf)).dv(T::exact(lrf - lpf))
    } else {
        // F3-2 with kc = 0.35
        (T::lit(0.9) * e * T::lit(0.35) * sx).dv(T::exact(lambda * lambda))
    }
}

/// AISC F6: Flexural capacity about minor axis (no LTB; F6.2 flange local
/// buckling when `flange_slenderness` is given).
pub(crate) fn flexural_capacity_z<T: Real>(m: &SteelMemberData) -> T {
    let (fy, sy) = (T::exact(m.fy), T::exact(m.sz));
    let mp_z = fy * T::exact(m.zz);
    let mp = mp_z.min(T::lit(1.6) * fy * sy); // AISC F6-1
    // F6.2, flange local buckling, when the flange slenderness is known.
    let mn = match m.flange_slenderness {
        Some(lambda) if lambda > 0.0 => {
            let (lpf, lrf) = flange_limits(m);
            if lambda <= lpf {
                mp
            } else if lambda <= lrf {
                // F6-2
                mp - ((mp - T::lit(0.7) * fy * sy) * T::exact(lambda - lpf)).dv(T::exact(lrf - lpf))
            } else {
                // F6-3, F6-4: Fcr = 0.69·E/λ²
                (T::lit(0.69) * T::exact(m.e)).dv(T::exact(lambda * lambda)) * sy
            }
        }
        _ => mp,
    };
    T::lit(PHI_B) * mn
}

/// AISC H1-1: Combined axial and bending interaction.
pub(crate) fn interaction_h1<T: Real>(pr_pc: T, mry_mcy: T, mrz_mcz: T) -> T {
    branch(
        T::lit(0.2).le(pr_pc),
        // H1-1a: Pr/Pc + (8/9)(Mry/Mcy + Mrz/Mcz) <= 1.0
        || pr_pc + T::lit(8.0).dv(T::lit(9.0)) * (mry_mcy + mrz_mcz),
        // H1-1b: Pr/(2*Pc) + (Mry/Mcy + Mrz/Mcz) <= 1.0
        || pr_pc.dv(T::exact(2.0)) + mry_mcy + mrz_mcz,
    )
}
