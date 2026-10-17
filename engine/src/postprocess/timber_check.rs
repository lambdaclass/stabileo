//! Timber member design checks per NDS (National Design Specification for Wood).
//!
//! Given analysis results and member properties, computes unity ratios
//! for bending, compression, tension, shear, and combined loading.

use serde::{Deserialize, Serialize};

use crate::certify::real::{branch, Real};
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

/// Ceiling on a reported interaction ratio.
///
/// The NDS 3.9.2 amplification diverges as fc approaches FcE1, so the raw value
/// is unbounded. Anything past this is reported as this number: the member
/// fails, and the exact magnitude carries no engineering meaning — it is an
/// artefact of how close the denominator got to zero.
const MAX_REPORTED_RATIO: f64 = 99.0;

// ==================== NDS Design Checks ====================


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

/// Run NDS timber design checks on all members.
pub fn check_timber_members(input: &TimberCheckInput) -> Vec<TimberCheckResult> {
    let mut results = Vec::new();

    let by_id = index_forces(&input.forces, |f| f.element_id);

    for member in &input.members {
        let forces = by_id.get(&member.element_id).copied();

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

/// NDS adjusted design values and section properties for one member.
pub(crate) struct TimberCapacities<T> {
    pub fb_prime: T,
    pub ft_prime: T,
    pub fc_prime: T,
    pub fv_prime: T,
    pub cp: T,
    pub cl: T,
    pub area: T,
    pub s: T,
}

/// Adjusted design values. Generic over `Real` so the certified check
/// (`certify::design`) evaluates the same formulas in interval arithmetic.
pub(crate) fn timber_capacities<T: Real>(m: &TimberMemberData) -> TimberCapacities<T> {
    let cd = T::exact(m.cd.unwrap_or(1.0));
    let cm = T::exact(m.cm.unwrap_or(1.0));
    let ct = T::exact(m.ct.unwrap_or(1.0));
    let ci = T::exact(m.ci.unwrap_or(1.0));
    let (b, d) = (T::exact(m.b), T::exact(m.d));

    // Section properties
    let area = b * d;
    let s = (b * d * d).dv(T::exact(6.0)); // Section modulus

    // Adjusted design values
    let cp = column_stability_factor(m, cd, cm, ct, ci);
    let cl = beam_stability_factor(m, cd, cm, ct, ci);

    // Fb' = Fb * CD * CM * Ct * CL * CF * Cfu * Ci * Cr
    let cf_b = T::exact(m.cf_bending.unwrap_or(1.0));
    let cfu = T::exact(m.cfu.unwrap_or(1.0));
    let cr = T::exact(m.cr.unwrap_or(1.0));
    let fb_prime = T::exact(m.fb) * cd * cm * ct * cl * cf_b * cfu * ci * cr;

    // Ft' = Ft * CD * CM * Ct * CF * Ci
    let cf_t = T::exact(m.cf_tension.unwrap_or(1.0));
    let ft_prime = T::exact(m.ft) * cd * cm * ct * cf_t * ci;

    // Fc' = Fc * CD * CM * Ct * CP * CF * Ci
    let cf_c = T::exact(m.cf_compression.unwrap_or(1.0));
    let fc_prime = T::exact(m.fc) * cd * cm * ct * cp * cf_c * ci;

    // Fv' = Fv * CD * CM * Ct * Ci
    let fv_prime = T::exact(m.fv) * cd * cm * ct * ci;

    TimberCapacities { fb_prime, ft_prime, fc_prime, fv_prime, cp, cl, area, s }
}

/// NDS 3.9 combined loading for axial force `n` (tension positive), given the
/// bending and tension ratios. Generic over `Real`.
pub(crate) fn timber_interaction<T: Real>(
    m: &TimberMemberData,
    caps: &TimberCapacities<T>,
    n: T,
    bending_ratio: T,
    tension_ratio: T,
) -> T {
    let zero = T::exact(0.0);
    let one = T::exact(1.0);
    let cap = T::exact(MAX_REPORTED_RATIO);
    let compression = || {
        // NDS 3.9.2: Combined bending and axial compression
        // (fc/Fc')² + fb / (Fb' * (1 - fc/FcE)) <= 1.0
        let fc_actual = (-n).dv(caps.area);
        let e_min = emin_prime::<T>(m, T::exact(m.cm.unwrap_or(1.0)), T::exact(m.ct.unwrap_or(1.0)), T::exact(m.ci.unwrap_or(1.0)));
        let kce = T::lit(0.822); // NDS Table 3.3.3
        // NDS 3.9.2 amplifies by FcE1 — buckling *in the plane of bending*.
        // `m` is strong-axis bending (S = b·d²/6), so this is le1/d1 = le/d,
        // not the governing le/min(b,d) used for CP.
        let le_d = T::exact(m.le).dv(T::exact(m.d));
        let fce = (kce * e_min).dv(le_d * le_d);
        let fc_ratio = branch(zero.lt(caps.fc_prime), || fc_actual.dv(caps.fc_prime), || zero);
        // NDS 3.9.2 is only defined while fc < FcE1. Past that the member has
        // buckled, and dropping the amplification made the check *weakest*
        // exactly where it should diverge.
        //
        // The ratio is saturated rather than left to run away: an amplification
        // approaching zero sends it to infinity, and "utilisation: 300000" is
        // not a number anyone can act on — it breaks every bar and table that
        // renders it, and it does not distinguish "just past" from "far past",
        // since the divergence swamps the difference either way. Below the cap
        // the value is exact; at the cap it means "fails", not a magnitude.
        //
        // The amplified term is saturated at the cap too, as
        // fb/max(amp, fb/cap) = min(fb/amp, cap) for amp > 0 and = cap for
        // amp <= 0 (where it was +inf): the same total after the final min,
        // since (fc/Fc')² >= 0, and finite, so it has an interval enclosure.
        //
        // With no bending there is nothing to amplify, so the member stays
        // governed by the (fc/Fc')² term — which is already >= 1 here.
        let amplification = branch(zero.lt(fce), || one - fc_actual.dv(fce), || one);
        let amplified_bending = branch(
            bending_ratio.le(zero),
            || zero,
            || bending_ratio.dv(amplification.max(bending_ratio.dv(cap))),
        );
        (fc_ratio.sq() + amplified_bending).min(cap)
    };
    branch(
        n.lt(zero),
        compression,
        || {
            branch(
                zero.lt(n),
                // NDS 3.9.1: Combined bending and axial tension: ft/Ft' + fb/Fb' <= 1.0
                || tension_ratio + bending_ratio,
                || bending_ratio,
            )
        },
    )
}

pub(crate) const TIMBER_CHECK_NAMES: [&str; 5] =
    ["Bending NDS 3.3", "Compression NDS 3.6", "Tension NDS 3.8", "Shear NDS 3.4", "Interaction NDS 3.9"];

fn check_single_timber_member(
    m: &TimberMemberData,
    f: &TimberDesignForces,
) -> TimberCheckResult {
    let caps = timber_capacities::<f64>(m);
    let TimberCapacities { fb_prime, ft_prime, fc_prime, fv_prime, cp, cl, area, s } = caps;

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
    let bending_ratio = ledger.ratio(TIMBER_CHECK_NAMES[0], fb_actual, fb_prime);

    // Compression and tension ratios
    let (compression_ratio, tension_ratio) = if n < 0.0 {
        let fc_actual = (-n) / area;
        (ledger.ratio(TIMBER_CHECK_NAMES[1], fc_actual, fc_prime), 0.0)
    } else if n > 0.0 {
        let ft_actual = n / area;
        (0.0, ledger.ratio(TIMBER_CHECK_NAMES[2], ft_actual, ft_prime))
    } else {
        (0.0, 0.0)
    };

    // Shear ratio
    let shear_ratio = ledger.ratio_if_loaded(TIMBER_CHECK_NAMES[3], fv_actual, fv_prime);

    // NDS 3.9: Combined loading interaction
    let interaction_ratio = timber_interaction(m, &caps, n, bending_ratio, tension_ratio);

    // Governing
    let checks = [
        (bending_ratio, TIMBER_CHECK_NAMES[0]),
        (compression_ratio, TIMBER_CHECK_NAMES[1]),
        (tension_ratio, TIMBER_CHECK_NAMES[2]),
        (shear_ratio, TIMBER_CHECK_NAMES[3]),
        (interaction_ratio, TIMBER_CHECK_NAMES[4]),
    ];

    let interaction_ratio = ledger.require_finite(TIMBER_CHECK_NAMES[4], interaction_ratio);

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

/// Adjusted modulus of elasticity for stability, Emin' = Emin·CM·Ct·Ci.
///
/// When Emin is not supplied it is derived from E per NDS Appendix F:
///   Emin = E·(1 - 1.645·COV_E)·1.03/1.66
/// with COV_E = 0.25 for visually graded sawn lumber (matching the c = 0.8 used
/// in CP below), giving Emin = 0.3653·E. Published values agree: Douglas
/// Fir-Larch No. 2 has E = 1.6e6 psi and Emin = 0.58e6 psi, a ratio of 0.36.
///
/// A previous 0.58·E default looks like the bare (1 - 1.645·0.25) = 0.589 term
/// with the 1.03/1.66 adjustment dropped; it overstates Emin by 59 %, and with
/// it FcE, FbE, CP and CL.
fn emin_prime<T: Real>(m: &TimberMemberData, cm: T, ct: T, ci: T) -> T {
    const COV_E_SAWN: f64 = 0.25;
    let e_min = match m.e_min {
        Some(e) => T::exact(e),
        None => (T::exact(m.e) * (T::exact(1.0) - T::lit(1.645) * T::lit(COV_E_SAWN)) * T::lit(1.03)).dv(T::lit(1.66)),
    };
    e_min * cm * ct * ci
}

/// NDS 3.7.1.4: the slenderness ratio governing column buckling is the *larger*
/// of le1/d1 and le2/d2. With `le` applied about both axes that is
/// le/min(b, d) — for the usual b < d section the weak axis controls, and
/// checking only le/d overstates FcE and so overstates CP.
fn governing_slenderness<T: Real>(m: &TimberMemberData) -> T {
    let zero = T::exact(0.0);
    let about_d = if m.d > 0.0 { T::exact(m.le).dv(T::exact(m.d)) } else { zero };
    let about_b = if m.b > 0.0 { T::exact(m.le).dv(T::exact(m.b)) } else { zero };
    about_d.max(about_b)
}

/// `(1 + r)/(2c) − sqrt(((1 + r)/(2c))² − r/c)`, clamped to [0, 1]: the CP
/// (NDS Eq 3.7-1) and CL (Eq 3.3-6) form.
fn stability_curve<T: Real>(ratio: T, c: T) -> T {
    let zero = T::exact(0.0);
    let term = (T::exact(1.0) + ratio).dv(T::exact(2.0) * c);
    let v = term - (term.sq() - ratio.dv(c)).max(zero).sqrt();
    v.max(zero).min(T::exact(1.0))
}

/// NDS 3.7.1: Column stability factor CP.
fn column_stability_factor<T: Real>(m: &TimberMemberData, cd: T, cm: T, ct: T, ci: T) -> T {
    let zero = T::exact(0.0);
    let one = T::exact(1.0);
    let cf_c = T::exact(m.cf_compression.unwrap_or(1.0));
    let kce = T::lit(0.822); // NDS Table 3.3.3

    // Fc* = Fc * CD * CM * Ct * CF * Ci (all factors except CP)
    let fc_star = T::exact(m.fc) * cd * cm * ct * cf_c * ci;
    // FcE = KcE * Emin' / (le/d)²
    let le_d = governing_slenderness::<T>(m);
    branch(
        fc_star.le(zero),
        || one,
        || {
            branch(le_d.le(zero), || one, || {
                let fce = (kce * emin_prime(m, cm, ct, ci)).dv(le_d * le_d);
                // CP using NDS Eq 3.7-1, c = 0.8 for sawn lumber (0.9 for glulam)
                stability_curve(fce.dv(fc_star), T::lit(0.8))
            })
        },
    )
}

/// NDS Table 3.3.3: effective span length le from the unbraced length lu.
///
/// The table is indexed by loading condition; this uses the single-span,
/// uniformly distributed load row, which is the common case and the one the
/// caller's `lu` implies:
///   lu/d < 7          ->  le = 2.06·lu
///   7 <= lu/d <= 14.3 ->  le = 1.63·lu + 3d
///   lu/d > 14.3       ->  le = 1.84·lu
fn effective_bending_span<T: Real>(lu: f64, d: f64) -> T {
    let (lu, dd) = (T::exact(lu), T::exact(d));
    if d <= 0.0 {
        return T::lit(2.06) * lu;
    }
    let lu_d = lu.dv(dd);
    branch(
        lu_d.lt(T::exact(7.0)),
        || T::lit(2.06) * lu,
        || branch(lu_d.le(T::lit(14.3)), || T::lit(1.63) * lu + T::exact(3.0) * dd, || T::lit(1.84) * lu),
    )
}

/// NDS 3.3.3: Beam stability factor CL.
fn beam_stability_factor<T: Real>(m: &TimberMemberData, cd: T, cm: T, ct: T, ci: T) -> T {
    let zero = T::exact(0.0);
    let one = T::exact(1.0);
    let lu = m.lu.unwrap_or(m.le);
    let cf_b = T::exact(m.cf_bending.unwrap_or(1.0));
    let cr = T::exact(m.cr.unwrap_or(1.0));
    let cfu = T::exact(m.cfu.unwrap_or(1.0));

    if m.d <= m.b {
        // No lateral instability for d <= b (section is not deep)
        return one;
    }

    // Fb* = Fb * CD * CM * Ct * CF * Cfu * Ci * Cr (all except CL)
    let fb_star = T::exact(m.fb) * cd * cm * ct * cf_b * cfu * ci * cr;

    // Effective span length le for bending (NDS Table 3.3.3). le is always
    // longer than lu — between 1.63x and 2.06x for a single span — so taking
    // le = lu understated RB and overstated both FbE and CL.
    let le_bend = effective_bending_span::<T>(lu, m.d);

    // RB = sqrt(le * d / b²)  — NDS 3.3.3.5
    let rb_sq = (le_bend * T::exact(m.d)).dv(T::exact(m.b).sq());
    branch(fb_star.le(zero), || one, || {
        branch(rb_sq.le(zero), || one, || {
            // FbE = 1.20 * Emin' / RB²
            let fbe = (T::lit(1.20) * emin_prime(m, cm, ct, ci)).dv(rb_sq);
            // CL using NDS Eq 3.3-6 (same form as CP): (1+r)/1.9 − sqrt(((1+r)/1.9)² − r/0.95)
            stability_curve(fbe.dv(fb_star), T::lit(0.95))
        })
    })
}

