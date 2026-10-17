//! Cold-formed steel member design checks per AISI S100 (LRFD).
//!
//! Covers effective width for local buckling, flexural strength
//! with lateral-torsional buckling, axial compression with distortional
//! and local/global interaction, and combined loading.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
use crate::postprocess::check_ledger::{CheckLedger, Unevaluated};

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
    /// Overall pass (false when any check could not be evaluated)
    pub pass: bool,
    /// Checks whose capacity could not be evaluated.
    #[serde(default)]
    pub unevaluated: Unevaluated,
}

// ==================== Constants ====================

pub(crate) const PHI_C: f64 = 0.85; // Compression
pub(crate) const PHI_T: f64 = 0.90; // Tension (yielding)
pub(crate) const PHI_B: f64 = 0.90; // Flexure
pub(crate) const PHI_V: f64 = 0.95; // Shear

// ==================== Implementation ====================


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

/// Check all CFS members.
pub fn check_cfs_members(input: &CfsCheckInput) -> Vec<CfsCheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();
        let forces = match forces {
            Some(f) => f,
            None => continue,
        };
        results.push(check_single_cfs_member(member, forces));
    }

    results.sort_by_key(|r| r.element_id);
    results
}

/// AISI S100 nominal strengths for one member.
pub(crate) struct CfsCapacities<T> {
    /// Compression Pn (global E2 with local Ae, distortional E4).
    pub pn: T,
    /// Tension Tn = Ag·Fy (D2).
    pub tn: T,
    /// Strong-axis flexure Mn (LTB F2, distortional F4).
    pub mn_x: T,
    /// Weak-axis flexure Mn = Se,y·Fy.
    pub mn_y: T,
    /// Web shear Vn (G2.1), None when h and t are not given.
    pub vn: Option<T>,
    /// Weak-axis flexural buckling stress Fe.
    pub fe: T,
}

/// Nominal strengths. Generic over `Real` so the certified check
/// (`certify::design`) evaluates the same formulas in interval arithmetic.
pub(crate) fn cfs_capacities<T: Real>(m: &CfsMemberData) -> CfsCapacities<T> {
    let k = T::exact(m.k.unwrap_or(1.0));
    let cb = T::exact(m.cb.unwrap_or(1.0));
    let (fy, e) = (T::exact(m.fy), T::exact(m.e));
    let one = T::exact(1.0);
    let pi2 = T::pi().sq();

    // ==================== Compression (AISI S100 Ch. E) ====================

    // Global buckling: flexural buckling about weak axis (controls for most CFS;
    // flexural-torsional buckling of singly symmetric sections is not checked)
    let kl_ry = (k * T::exact(m.lc)).dv(T::exact(m.ry));
    let fe = (pi2 * e).dv(kl_ry.sq());

    // Inelastic/elastic buckling per AISI S100 E2
    let lambda_c = fy.dv(fe).sqrt();
    let fn_global = branch(
        lambda_c.le(T::lit(1.5)),
        // Inelastic: Fn = (0.658^(lambda²)) * Fy
        || T::lit(0.658).powf(lambda_c.sq()) * fy,
        // Elastic: Fn = (0.877 / lambda²) * Fy
        || T::lit(0.877).dv(lambda_c.sq()) * fy,
    );

    // Local-global interaction: Pn = Ae * Fn
    let pn_local = T::exact(m.ae) * fn_global;

    // Distortional buckling: Pn = Ag * Fd (if given)
    let ag = T::exact(m.ag);
    let pn = match m.fcrd {
        Some(fcrd) => {
            let fcrd = T::exact(fcrd);
            let lambda_d = fy.dv(fcrd).sqrt();
            let pd = branch(lambda_d.le(T::lit(0.561)), || ag * fy, || {
                let ratio = fcrd.dv(fy).powf(T::lit(0.6));
                ag * fy * (one - T::lit(0.25) * ratio) * ratio
            });
            pn_local.min(pd)
        }
        None => pn_local,
    };

    // ==================== Tension (AISI S100 Ch. D) ====================

    let tn = ag * fy; // Yielding on gross section

    // ==================== Flexure (AISI S100 Ch. F) ====================

    // Lateral-torsional buckling, F2.1.1 (doubly symmetric form):
    //   Me = Cb·(π/Lb)·sqrt(E·Iy·G·J)·sqrt(1 + π²·E·Cw/(G·J·Lb²)).
    // This read (1 + sqrt(X)) for sqrt(1 + X), which is always larger: Me and
    // so Mn were overstated (12% on the ratio of a 3 m C 150×60×20×2).
    let g = e.dv(T::exact(2.0) * T::lit(1.3)); // G ≈ E/2.6 for steel
    let (lb, iy, j, cw) = (T::exact(m.lb), T::exact(m.iy), T::exact(m.j), T::exact(m.cw));
    let x = (pi2 * e * cw).dv(g * j * lb * lb);
    let me = (cb * T::pi() * (e * iy * g * j).sqrt()).dv(lb) * (one + x).sqrt();

    let sf_x = T::exact(m.sf_x);
    let my_yield = sf_x * fy;
    let fc_ltb = if m.sf_x > 0.0 { me.dv(sf_x) } else { T::exact(0.0) };

    let fn_ltb = branch(
        (T::lit(2.78) * fy).le(fc_ltb),
        || fy, // Full yield
        || {
            branch(
                (T::lit(0.56) * fy).le(fc_ltb),
                // Inelastic LTB
                || (T::exact(10.0).dv(T::exact(9.0))) * fy * (one - (T::exact(10.0) * fy).dv(T::exact(36.0) * fc_ltb)),
                || fc_ltb,
            )
        },
    );

    let mn_ltb = T::exact(m.se_x) * fn_ltb;

    // Distortional buckling for flexure
    let mn_x = match m.fcrd_flex {
        Some(fd) => {
            let mcrd = sf_x * T::exact(fd);
            let lambda_d = my_yield.dv(mcrd).sqrt();
            let md = branch(lambda_d.le(T::lit(0.673)), || my_yield, || {
                let ratio = mcrd.dv(my_yield).powf(T::lit(0.5));
                my_yield * (one - T::lit(0.22) * ratio) * ratio
            });
            mn_ltb.min(md)
        }
        None => mn_ltb,
    };

    // Weak axis flexure (local buckling controls)
    let mn_y = T::exact(m.se_y) * fy;

    // ==================== Shear (AISI S100 G2.1) ====================
    // Vn = Aw·Fv, Aw = h·t:
    //   h/t <= sqrt(E·kv/Fy):                 Fv = 0.60·Fy
    //   sqrt(E·kv/Fy) < h/t <= 1.51·sqrt(...): Fv = 0.60·sqrt(E·kv·Fy)/(h/t)
    //   h/t > 1.51·sqrt(E·kv/Fy):             Fv = π²·E·kv/(12·(1 − μ²)·(h/t)²)
    // The yield branch ran to the elastic limit 1.51·sqrt(E·kv/Fy) (51% high
    // there), the inelastic one to a misprinted 1.227·(E·kv/Fy)^(3/4) (2.4×
    // the elastic value at h/t = 200), and the elastic Vn lacked a factor t.
    let vn = match (m.h, m.t) {
        (Some(h), Some(t)) => {
            let (h, t) = (T::exact(h), T::exact(t));
            let ek = e * T::lit(5.34); // unstiffened web
            let ht = h.dv(t);
            let lim = ek.dv(fy).sqrt();
            let fv = branch(ht.le(lim), || T::lit(0.60) * fy, || {
                branch(
                    ht.le(T::lit(1.51) * lim),
                    || (T::lit(0.60) * (ek * fy).sqrt()).dv(ht),
                    || (pi2 * ek).dv(T::exact(12.0) * (one - T::lit(0.3).sq()) * ht.sq()),
                )
            });
            Some(h * t * fv)
        }
        _ => None,
    };

    CfsCapacities { pn, tn, mn_x, mn_y, vn, fe }
}

pub(crate) const CFS_CHECK_NAMES: [&str; 6] =
    ["Compression E", "Tension D", "Flexure-x F", "Flexure-y F", "Shear G", "Interaction H"];

fn check_single_cfs_member(m: &CfsMemberData, f: &CfsDesignForces) -> CfsCheckResult {
    let axial = f.axial.unwrap_or(0.0);
    let mx = f.mx.unwrap_or(0.0);
    let my = f.my.unwrap_or(0.0);
    let shear = f.shear.unwrap_or(0.0);
    let n = CFS_CHECK_NAMES;

    let CfsCapacities { pn, tn, mn_x, mn_y, vn, fe } = cfs_capacities::<f64>(m);

    // A capacity that is zero, negative or not finite was read as ratio 0 and
    // the member passed (ry = 0 gave Pn = 0 and passed any compression).
    let mut ledger = CheckLedger::new();
    let compression_ratio = ledger.ratio_if_loaded(n[0], (-axial).max(0.0), PHI_C * pn);
    let tension_ratio = ledger.ratio_if_loaded(n[1], axial.max(0.0), PHI_T * tn);
    let flexure_ratio_x = ledger.ratio_if_loaded(n[2], mx.abs(), PHI_B * mn_x);
    let flexure_ratio_y = ledger.ratio_if_loaded(n[3], my.abs(), PHI_B * mn_y);
    let shear_ratio = match vn {
        Some(vn) => ledger.ratio_if_loaded(n[4], shear.abs(), PHI_V * vn),
        None => {
            // Without h and t the web shear strength is unknown: a shear
            // demand was reported as ratio 0.
            if shear != 0.0 {
                ledger.flag(n[4]);
            }
            0.0
        }
    };

    // ==================== Combined Loading (AISI S100 Ch. H) ====================
    // H1.2 / H2: P/Pa + Mx/Max + My/May <= 1 (linear, with the required
    // strengths from a second-order analysis). The AISC H1-1a/b split used
    // here (8/9 on the moments above P/Pa = 0.15, P/(2Pa) below) is not in
    // AISI and understated the interaction.
    let interaction_ratio = compression_ratio + tension_ratio + flexure_ratio_x + flexure_ratio_y;

    let pass = ledger.all_evaluated()
        && compression_ratio <= 1.0
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
        unevaluated: ledger.into_unevaluated(),
    }
}
