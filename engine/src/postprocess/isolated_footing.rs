//! CIRSOC 201-2025 isolated spread footing: bearing under service loads with biaxial
//! eccentricity, and one-way shear, punching and column-face flexure under factored loads.
//!
//! This is the check the app runs (`web/src/lib/engine/detailing/foundation-check.ts` is a thin
//! adapter over it). It differs from `foundation_check::check_spread_footings`, which is the
//! older ACI-style screening check (Meyerhof effective area, one axial force for every check,
//! no flexure, no column offset), in four ways:
//!
//! * **Service and factored loads are separate.** Bearing (13.3.1) is checked with the service
//!   axial force and moments, the strength checks with the governing factored ones.
//! * **Eccentricity.** The pressure is linear over the base, with the resultant offset from the
//!   footing CENTROID by the applied moment (`M/N`, enveloped over both signs) plus the plan
//!   offset of the column from the centroid (`−e`). When the resultant leaves the kern the base
//!   lifts and the linear distribution no longer holds: the check refuses (UNSUPPORTED) rather
//!   than report a linear peak that under-states the real one.
//! * **Both directions and both faces.** One-way shear at d from each column face (22.5) in
//!   both plan directions, flexure at each column face (13.2.7.1), each under both moment
//!   orientations; the worst governs.
//! * **Punching** (22.6) on the critical perimeter for the column's position (interior, edge,
//!   corner; αs 40/30/20), with λs (22.5.5.1.3), √f'c ≤ 8,3 MPa (22.6.3.1), the soil pressure
//!   inside the perimeter deducted, and the unbalanced moment the connection transfers formed by
//!   equilibrium of the enclosed block. Moment transfer by eccentric shear (8.4.4.2) is not
//!   implemented: a significant unbalanced moment, or one that cannot be formed (a truncated
//!   perimeter), makes punching UNSUPPORTED.
//!
//! Units: lengths m, forces kN, moments kN·m, pressures kPa, f'c MPa.
//!
//! The formulas are written once, generic over [`Real`], so that the certified version
//! (`certify::design::certify_isolated_footings`) evaluates the same arithmetic in outward-rounded
//! interval arithmetic.

use serde::{Deserialize, Serialize};

use crate::certify::real::Real;

// ==================== Types ====================

/// Where the column stands on the footing, for the punching perimeter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColumnPosition {
    #[default]
    Interior,
    Edge,
    Corner,
}

/// The kind of footing. Only `Isolated` is checked; every other kind is refused by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FootingKind {
    #[default]
    Isolated,
    Combined,
    Strip,
    Mat,
    PileCap,
}

/// One isolated footing with its service and factored actions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedFootingData {
    pub footing_id: usize,
    #[serde(default)]
    pub kind: FootingKind,
    /// Plan dimensions (m).
    pub b: f64,
    pub l: f64,
    /// Overall thickness (m).
    pub thickness: f64,
    /// Effective depth (m).
    pub d: f64,
    /// Column sides along B and along L (m).
    pub column_b: f64,
    pub column_h: f64,
    /// f'c (MPa).
    pub fc: f64,
    /// Allowable (service) bearing pressure (kPa).
    pub allowable_bearing: f64,
    /// Service and factored axial force from the column (kN, compression positive).
    pub service_axial: f64,
    pub factored_axial: f64,
    /// Service moments about the two plan axes (kN·m).
    #[serde(default)]
    pub service_moment_b: f64,
    #[serde(default)]
    pub service_moment_l: f64,
    /// Factored moments about the two plan axes (kN·m), from the governing strength combination.
    #[serde(default)]
    pub factored_moment_b: f64,
    #[serde(default)]
    pub factored_moment_l: f64,
    /// Plan offset of the footing CENTROID from the supported node, along B and L (m).
    #[serde(default)]
    pub eccentricity_b: f64,
    #[serde(default)]
    pub eccentricity_l: f64,
    #[serde(default)]
    pub position: ColumnPosition,
    /// Tension steel ratio of the mat for one-way shear (Tabla 22.5.5.1 (c)); absent: 0,0018,
    /// the least a footing may carry, so the strength taken is the least the code allows.
    #[serde(default)]
    pub rho_w: Option<f64>,
    /// Significance threshold of the unbalanced moment, as a fraction of Vu·d (default 0,02).
    #[serde(default)]
    pub moment_tolerance: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedFootingInput {
    pub footings: Vec<IsolatedFootingData>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FootingStatus {
    Ok,
    Fail,
    Unsupported,
}

/// Why a check, or the footing, could not be verified. The app renders the text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FootingRefusal {
    /// Not an isolated footing.
    KindNotImplemented,
    /// Plan area or service axial force not positive.
    BearingInvalidInput,
    /// Under service loads the resultant leaves the kern.
    BearingUplift,
    /// Under the factored loads the resultant leaves the kern: no strength check is emitted.
    FactoredUplift,
    /// Edge or corner column: the unbalanced moment cannot be formed by the implemented free body.
    PunchingMomentNotFormed,
    /// A significant unbalanced moment: 8.4.4.2 is not implemented.
    PunchingMomentTransfer,
}

/// The per-axis actions about the footing centroid.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AxisActionsOut {
    /// Column centre from the centroid (m): `−eccentricity`.
    pub column_offset: f64,
    /// `|M|/N` (m).
    pub moment_eccentricity: f64,
    /// Resultant offsets from the centroid under `+M` and `−M` (m).
    pub resultant_offsets: [f64; 2],
    /// The offset of larger magnitude (m).
    pub worst_resultant_offset: f64,
    /// B/6 or L/6 (m).
    pub kern_limit: f64,
    pub outside_kern: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BearingOut {
    pub status: FootingStatus,
    pub q_max: f64,
    pub q_min: f64,
    pub b: AxisActionsOut,
    pub l: AxisActionsOut,
    pub uplift: bool,
    pub utilization: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refusal: Option<FootingRefusal>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Low,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Direction {
    B,
    L,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OneWayShearOut {
    pub status: FootingStatus,
    /// Factored shear at the governing critical section (kN).
    pub vu: f64,
    /// φVc (kN); infinite when no critical section falls inside the base.
    pub phi_vc: f64,
    pub utilization: f64,
    /// The direction whose strips govern.
    pub direction: Direction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub governing_side: Option<Side>,
    pub cantilever: f64,
    pub q_section: f64,
    pub q_edge: f64,
    /// The governing direction's moment eccentricity and column offset (m), for the memo.
    pub moment_eccentricity: f64,
    pub column_offset: f64,
    pub lambda_s: f64,
    pub rho_w: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MomentTransferStatus {
    None,
    Negligible,
    UnsupportedMomentTransferNotEvaluated,
    UnsupportedMomentNotFormed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AxisUnbalancedOut {
    pub msc: f64,
    pub applied: f64,
    /// Signed by the governing orientation.
    pub relief: f64,
    pub orientation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PunchingOut {
    pub status: FootingStatus,
    /// Shear stress on the critical perimeter (MPa).
    pub vu: f64,
    /// φvc (MPa).
    pub phi_vc: f64,
    pub utilization: f64,
    /// Transferred force less the soil load inside the perimeter (kN).
    pub demand_vu: f64,
    pub transferred: f64,
    pub load_inside: f64,
    pub bo: f64,
    pub beta: f64,
    pub d: f64,
    pub enclosed_area: f64,
    pub vc: f64,
    pub vc_a: f64,
    pub vc_b: f64,
    pub vc_c: f64,
    /// "a", "b" or "c".
    pub governed_by: String,
    pub lambda_s: f64,
    pub alpha_s: f64,
    pub msc_x: f64,
    pub msc_y: f64,
    pub msc: f64,
    pub threshold: f64,
    pub significant: bool,
    pub moment_transfer: MomentTransferStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unbalanced_b: Option<AxisUnbalancedOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unbalanced_l: Option<AxisUnbalancedOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refusal: Option<FootingRefusal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlexureOut {
    /// Factored moment at the governing column face (kN·m).
    pub mu: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<Side>,
    pub cantilever: f64,
    pub q_face: f64,
    pub q_edge: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IsolatedFootingResult {
    pub footing_id: usize,
    pub status: FootingStatus,
    pub bearing: BearingOut,
    /// Factored actions about the centroid (for the memo and the uplift refusal).
    pub factored_b: AxisActionsOut,
    pub factored_l: AxisActionsOut,
    pub factored_uplift: bool,
    /// Factored mean pressure N/A (kPa).
    pub q_factored: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub one_way_shear: Option<OneWayShearOut>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub punching: Option<PunchingOut>,
    /// Column-face flexure with the cantilevers along B (the moment that spans B) and along L.
    pub flexure_b: FlexureOut,
    pub flexure_l: FlexureOut,
    /// The soil pressure deducted inside the critical perimeter (kPa).
    pub punching_load_inside_perimeter: f64,
    pub worst_utilization: f64,
    pub refusals: Vec<FootingRefusal>,
}

// ==================== Formulas (generic) ====================

/// φ for shear and punching (21.2).
pub const PHI_SHEAR: f64 = 0.75;
/// ρw taken for one-way shear when the mat is not yet designed (7.6.1.1, 13.3).
pub const RHO_W_MIN: f64 = 0.0018;

/// λs = √(2/(1 + 0,004·d[mm])) ≤ 1 (22.5.5.1.3).
pub fn size_effect<T: Real>(d: T) -> T {
    let one = T::lit(1.0);
    (T::lit(2.0).dv(one + T::lit(0.004) * (d * T::lit(1000.0)))).sqrt().min(one)
}

/// √f'c ≤ 8,3 MPa (22.5.3.1, 22.6.3.1).
pub fn sqrt_fc_capped<T: Real>(fc: T) -> T {
    fc.sqrt().min(T::lit(8.3))
}

/// The resultant offsets from the centroid along one axis, under `+M` and `−M`:
/// `−e ± |M|/max(N, 1e-12)`. Returns `(column_offset, moment_eccentricity, [+, −])`.
pub fn axis_offsets<T: Real>(axial: T, moment: T, eccentricity: T) -> (T, T, [T; 2]) {
    let column_offset = -eccentricity;
    let m_ecc = moment.abs().dv(axial.max(T::lit(1e-12)));
    (column_offset, m_ecc, [column_offset + m_ecc, column_offset - m_ecc])
}

/// The largest offset magnitude of the two orientations.
pub fn worst_magnitude<T: Real>(offsets: [T; 2]) -> T {
    offsets[0].abs().max(offsets[1].abs())
}

/// `6·|worst|/S`, the kern fraction along one axis.
pub fn kern_fraction<T: Real>(worst_abs: T, s: T) -> T {
    T::lit(6.0) * worst_abs.dv(s)
}

/// Linear pressure along one axis at `u` from the centroid: `q0·(1 + 12·uR·u/S²)`.
pub fn axis_pressure<T: Real>(q0: T, s: T, u_r: T, u: T) -> T {
    q0 * (T::lit(1.0) + T::lit(12.0) * u_r * u.dv(s.sq()))
}

/// Linear pressure over the plan at `(u, v)` from the centroid.
pub fn plan_pressure<T: Real>(q0: T, b: T, l: T, u_r: T, v_r: T, u: T, v: T) -> T {
    q0 * (T::lit(1.0) + T::lit(12.0) * u_r * u.dv(b.sq()) + T::lit(12.0) * v_r * v.dv(l.sq()))
}

/// The edge coordinate and the coordinate `a` inside it, for one side of the base.
fn side_coords<T: Real>(b: T, a: T, side: Side) -> (T, T) {
    let half = b * T::lit(0.5);
    match side {
        Side::Low => (-half, -half + a),
        Side::High => (half, half - a),
    }
}

/// One-way shear demand of the strip beyond a critical section at `a` from the edge:
/// `(q_section + q_edge)/2 · a · L` (the exact integral of the linear pressure).
pub fn one_way_demand<T: Real>(q0: T, b: T, l: T, u_r: T, a: T, side: Side) -> (T, T, T) {
    let (edge, sec) = side_coords(b, a, side);
    let q_sec = axis_pressure(q0, b, u_r, sec);
    let q_edge = axis_pressure(q0, b, u_r, edge);
    ((q_sec + q_edge) * T::lit(0.5) * a * l, q_sec, q_edge)
}

/// φVc of the full width `l`, Tabla 22.5.5.1 (c): 0,75·0,66·λs·ρw^⅓·√f'c·bw·d (kN).
pub fn one_way_capacity<T: Real>(fc: T, l: T, d: T, rho_w: T) -> T {
    T::lit(PHI_SHEAR) * T::lit(0.66) * size_effect(d) * rho_w.powf(T::lit(1.0 / 3.0)) * sqrt_fc_capped(fc) * l * d * T::lit(1000.0)
}

/// Column-face moment of the cantilever `c` from one face: `L·c²·(2·q_face + q_edge)/6`.
pub fn face_moment<T: Real>(q0: T, b: T, l: T, u_r: T, c: T, side: Side) -> (T, T, T) {
    let (edge, face) = side_coords(b, c, side);
    let q_face = axis_pressure(q0, b, u_r, face);
    let q_edge = axis_pressure(q0, b, u_r, edge);
    (l * c.sq() * (T::lit(2.0) * q_face + q_edge).dv(T::lit(6.0)), q_face, q_edge)
}

/// αs (22.6.5.3).
pub fn alpha_s(position: ColumnPosition) -> f64 {
    match position {
        ColumnPosition::Interior => 40.0,
        ColumnPosition::Edge => 30.0,
        ColumnPosition::Corner => 20.0,
    }
}

/// The critical perimeter at d/2 (22.6.4.1): `(bo, enclosed area)`; β from the column sides.
pub fn critical_section<T: Real>(column_b: T, column_h: T, d: T, position: ColumnPosition) -> (T, T) {
    let bx = column_b + d;
    let hy = column_h + d;
    let half_d = d * T::lit(0.5);
    match position {
        ColumnPosition::Interior => (T::lit(2.0) * (bx + hy), bx * hy),
        ColumnPosition::Edge => (T::lit(2.0) * bx + hy, (bx - half_d) * hy),
        ColumnPosition::Corner => (bx + hy, (bx - half_d) * (hy - half_d)),
    }
}

/// The three expressions of Tabla 22.6.5.2 (MPa), λ = 1.
pub fn punching_vc<T: Real>(fc: T, d: T, bo: T, beta: T, position: ColumnPosition) -> [T; 3] {
    let base = size_effect(d) * sqrt_fc_capped(fc);
    [
        T::lit(0.33) * base,
        T::lit(0.17) * (T::lit(1.0) + T::lit(2.0).dv(beta)) * base,
        T::lit(0.083) * (T::lit(2.0) + T::exact(alpha_s(position)) * d.dv(bo)) * base,
    ]
}

/// The moment the soil pressure inside the enclosed region carries about its centre, along one
/// axis: `q0·uR·span³·width/S²`.
pub fn enclosed_relief<T: Real>(q0: T, s: T, u_r: T, span: T, width: T) -> T {
    q0 * u_r * span.sq() * span * width.dv(s.sq())
}

// ==================== The check (f64) ====================

fn axis_out(s: f64, axial: f64, moment: f64, eccentricity: f64) -> AxisActionsOut {
    let (column_offset, moment_eccentricity, offsets) = axis_offsets(axial, moment, eccentricity);
    let worst = if offsets[0].abs() >= offsets[1].abs() { offsets[0] } else { offsets[1] };
    AxisActionsOut {
        column_offset,
        moment_eccentricity,
        resultant_offsets: offsets,
        worst_resultant_offset: worst,
        kern_limit: s / 6.0,
        outside_kern: worst.abs() > s / 6.0,
    }
}

/// Pressure extremes and full contact for the actions on both axes.
fn extremes(q0: f64, b: f64, l: f64, ab: &AxisActionsOut, al: &AxisActionsOut) -> (f64, f64, bool) {
    let kb = if b > 0.0 { kern_fraction(ab.worst_resultant_offset.abs(), b) } else { 0.0 };
    let kl = if l > 0.0 { kern_fraction(al.worst_resultant_offset.abs(), l) } else { 0.0 };
    let full = if q0 > 0.0 { 1.0 - kb - kl >= -1e-12 } else { false };
    (q0 * (1.0 + kb + kl), q0 * (1.0 - kb - kl), full)
}

struct Dir {
    b: f64,
    l: f64,
    column_b: f64,
    moment: f64,
    eccentricity: f64,
}

/// One-way shear with the strips along `dir.b`.
fn one_way_along(f: &IsolatedFootingData, dir: &Dir, q0: f64, direction: Direction) -> OneWayShearOut {
    let act = axis_out(dir.b, f.factored_axial, dir.moment, dir.eccentricity);
    let u_col = act.column_offset;
    let a_low = dir.b / 2.0 + u_col - dir.column_b / 2.0 - f.d;
    let a_high = dir.b / 2.0 - u_col - dir.column_b / 2.0 - f.d;
    let rho_w = f.rho_w.unwrap_or(RHO_W_MIN).max(0.0);
    let lambda_s = size_effect(f.d);
    let mut out = OneWayShearOut {
        status: FootingStatus::Ok,
        vu: 0.0,
        phi_vc: f64::INFINITY,
        utilization: 0.0,
        direction,
        governing_side: None,
        cantilever: 0.0,
        q_section: 0.0,
        q_edge: 0.0,
        moment_eccentricity: act.moment_eccentricity,
        column_offset: u_col,
        lambda_s,
        rho_w,
    };
    let mut best: Option<(f64, f64, f64, f64, Side)> = None;
    for u_r in act.resultant_offsets {
        for side in [Side::Low, Side::High] {
            let a = if side == Side::Low { a_low } else { a_high };
            if !(a > 0.0) {
                continue;
            }
            let (vu, q_sec, q_edge) = one_way_demand(q0, dir.b, dir.l, u_r, a, side);
            if best.map_or(true, |b| vu > b.0) {
                best = Some((vu, a, q_sec, q_edge, side));
            }
        }
    }
    if let Some((vu, a, q_sec, q_edge, side)) = best {
        let phi_vc = one_way_capacity(f.fc, dir.l, f.d, rho_w);
        out.vu = vu;
        out.phi_vc = phi_vc;
        out.utilization = if phi_vc > 0.0 { vu / phi_vc } else { f64::INFINITY };
        out.status = if vu <= phi_vc { FootingStatus::Ok } else { FootingStatus::Fail };
        out.governing_side = Some(side);
        out.cantilever = a;
        out.q_section = q_sec;
        out.q_edge = q_edge;
    }
    out
}

fn flexure_along(f: &IsolatedFootingData, dir: &Dir, q0: f64) -> FlexureOut {
    let act = axis_out(dir.b, f.factored_axial, dir.moment, dir.eccentricity);
    let u_col = act.column_offset;
    let c_low = dir.b / 2.0 + u_col - dir.column_b / 2.0;
    let c_high = dir.b / 2.0 - u_col - dir.column_b / 2.0;
    let mut out = FlexureOut { mu: 0.0, side: None, cantilever: 0.0, q_face: 0.0, q_edge: 0.0 };
    for u_r in act.resultant_offsets {
        for side in [Side::Low, Side::High] {
            let c = if side == Side::Low { c_low } else { c_high };
            if !(c > 0.0) {
                continue;
            }
            let (m, q_face, q_edge) = face_moment(q0, dir.b, dir.l, u_r, c, side);
            if out.side.is_none() || m > out.mu {
                out = FlexureOut { mu: m, side: Some(side), cantilever: c, q_face, q_edge };
            }
        }
    }
    out
}

fn unbalanced_axis(q0: f64, axial: f64, s: f64, moment: f64, eccentricity: f64, span: f64, width: f64) -> AxisUnbalancedOut {
    let (column_offset, m_ecc, _) = axis_offsets(axial, moment, eccentricity);
    let applied = moment.abs();
    let mut best: Option<AxisUnbalancedOut> = None;
    for o in [1.0, -1.0] {
        let u_r = column_offset + o * m_ecc;
        let relief = if s > 0.0 { enclosed_relief(q0, s, u_r, span, width) } else { 0.0 };
        let msc = (o * applied - relief).abs();
        if best.as_ref().map_or(true, |b| msc > b.msc) {
            best = Some(AxisUnbalancedOut { msc, applied, relief: o * relief, orientation: o });
        }
    }
    best.expect("two orientations")
}

fn zero_axis() -> AxisActionsOut {
    AxisActionsOut {
        column_offset: 0.0,
        moment_eccentricity: 0.0,
        resultant_offsets: [0.0, 0.0],
        worst_resultant_offset: 0.0,
        kern_limit: 0.0,
        outside_kern: false,
    }
}

/// Check one isolated footing.
pub fn check_isolated_footing(f: &IsolatedFootingData) -> IsolatedFootingResult {
    let empty_flex = FlexureOut { mu: 0.0, side: None, cantilever: 0.0, q_face: 0.0, q_edge: 0.0 };
    if f.kind != FootingKind::Isolated {
        return IsolatedFootingResult {
            footing_id: f.footing_id,
            status: FootingStatus::Unsupported,
            bearing: BearingOut {
                status: FootingStatus::Unsupported,
                q_max: 0.0,
                q_min: 0.0,
                b: zero_axis(),
                l: zero_axis(),
                uplift: false,
                utilization: 0.0,
                refusal: None,
            },
            factored_b: zero_axis(),
            factored_l: zero_axis(),
            factored_uplift: false,
            q_factored: 0.0,
            one_way_shear: None,
            punching: None,
            flexure_b: empty_flex.clone(),
            flexure_l: empty_flex,
            punching_load_inside_perimeter: 0.0,
            worst_utilization: 0.0,
            refusals: vec![FootingRefusal::KindNotImplemented],
        };
    }
    let mut refusals = Vec::new();
    let area = f.b * f.l;

    // ── Bearing, service level (13.3.1) ──
    let sb = axis_out(f.b, f.service_axial, f.service_moment_b, f.eccentricity_b);
    let sl = axis_out(f.l, f.service_axial, f.service_moment_l, f.eccentricity_l);
    let bearing = if !(area > 0.0) || !(f.service_axial > 0.0) {
        refusals.push(FootingRefusal::BearingInvalidInput);
        BearingOut {
            status: FootingStatus::Unsupported,
            q_max: 0.0,
            q_min: 0.0,
            b: zero_axis(),
            l: zero_axis(),
            uplift: false,
            utilization: 0.0,
            refusal: Some(FootingRefusal::BearingInvalidInput),
        }
    } else {
        let q0 = f.service_axial / area;
        let (q_max, q_min, full) = extremes(q0, f.b, f.l, &sb, &sl);
        let utilization = q_max / f.allowable_bearing;
        if !full {
            refusals.push(FootingRefusal::BearingUplift);
            BearingOut {
                status: FootingStatus::Unsupported,
                q_max,
                q_min,
                b: sb,
                l: sl,
                uplift: true,
                utilization,
                refusal: Some(FootingRefusal::BearingUplift),
            }
        } else {
            BearingOut {
                status: if q_max <= f.allowable_bearing { FootingStatus::Ok } else { FootingStatus::Fail },
                q_max,
                q_min,
                b: sb,
                l: sl,
                uplift: false,
                utilization,
                refusal: None,
            }
        }
    };

    // ── One factored pressure field for every strength check ──
    let q_factored = if area > 0.0 { f.factored_axial / area } else { 0.0 };
    let fb = axis_out(f.b, f.factored_axial, f.factored_moment_b, f.eccentricity_b);
    let fl = axis_out(f.l, f.factored_axial, f.factored_moment_l, f.eccentricity_l);
    let (_, _, factored_full) = extremes(q_factored, f.b, f.l, &fb, &fl);
    let factored_uplift = !factored_full;
    if factored_uplift {
        refusals.push(FootingRefusal::FactoredUplift);
    }

    let dir_b = Dir { b: f.b, l: f.l, column_b: f.column_b, moment: f.factored_moment_b, eccentricity: f.eccentricity_b };
    let dir_l = Dir { b: f.l, l: f.b, column_b: f.column_h, moment: f.factored_moment_l, eccentricity: f.eccentricity_l };

    // ── One-way shear (22.5), both directions ──
    let one_way_shear = if factored_uplift {
        None
    } else {
        let along_b = one_way_along(f, &dir_b, q_factored, Direction::B);
        let along_l = one_way_along(f, &dir_l, q_factored, Direction::L);
        Some(if along_l.utilization > along_b.utilization { along_l } else { along_b })
    };

    // ── The soil pressure inside the critical perimeter ──
    let (u_col, v_col) = (fb.column_offset, fl.column_offset);
    let mut inside = q_factored;
    if u_col != 0.0 || v_col != 0.0 {
        let mut least = f64::INFINITY;
        for u_r in fb.resultant_offsets {
            for v_r in fl.resultant_offsets {
                least = least.min(plan_pressure(q_factored, f.b, f.l, u_r, v_r, u_col, v_col));
            }
        }
        inside = least.max(0.0);
    }

    // ── Punching (22.6) ──
    let punching = if factored_uplift {
        None
    } else {
        let (bo, enclosed) = critical_section(f.column_b, f.column_h, f.d, f.position);
        let long = f.column_b.max(f.column_h);
        let short = f.column_b.min(f.column_h);
        let beta = if short > 0.0 { long / short } else { 1.0 };
        let transferred = f.factored_axial.abs();
        let load_inside = inside * enclosed;
        let demand_vu = (transferred - load_inside).max(0.0);
        let [a, b, c] = punching_vc(f.fc, f.d, bo, beta, f.position);
        let vc = a.min(b).min(c);
        let governed_by = if vc == a { "a" } else if vc == b { "b" } else { "c" };
        let phi_vc = PHI_SHEAR * vc;
        let vu = demand_vu / (bo * f.d) / 1000.0;
        let utilization = if phi_vc > 0.0 { vu / phi_vc } else { f64::INFINITY };
        let tol = f.moment_tolerance.unwrap_or(0.02);
        let threshold = tol * (demand_vu * f.d).max(1e-9);
        let (unbalanced_b, unbalanced_l) = if f.position == ColumnPosition::Interior {
            (
                Some(unbalanced_axis(q_factored, f.factored_axial, f.b, f.factored_moment_b, f.eccentricity_b, f.column_b + f.d, f.column_h + f.d)),
                Some(unbalanced_axis(q_factored, f.factored_axial, f.l, f.factored_moment_l, f.eccentricity_l, f.column_h + f.d, f.column_b + f.d)),
            )
        } else {
            (None, None)
        };
        // Axis mapping: the B-axis quantity is the engine's Y, the L-axis one its X.
        let msc_y = unbalanced_b.as_ref().map_or(0.0, |u| u.msc);
        let msc_x = unbalanced_l.as_ref().map_or(0.0, |u| u.msc);
        let msc = (msc_x * msc_x + msc_y * msc_y).sqrt();
        let significant = msc > threshold;
        let (status, moment_transfer, refusal) = if f.position != ColumnPosition::Interior {
            (FootingStatus::Unsupported, MomentTransferStatus::UnsupportedMomentNotFormed, Some(FootingRefusal::PunchingMomentNotFormed))
        } else if significant {
            (FootingStatus::Unsupported, MomentTransferStatus::UnsupportedMomentTransferNotEvaluated, Some(FootingRefusal::PunchingMomentTransfer))
        } else {
            (
                if utilization <= 1.0 { FootingStatus::Ok } else { FootingStatus::Fail },
                if msc > 0.0 { MomentTransferStatus::Negligible } else { MomentTransferStatus::None },
                None,
            )
        };
        if let Some(r) = refusal {
            refusals.push(r);
        }
        Some(PunchingOut {
            status,
            vu,
            phi_vc,
            utilization,
            demand_vu,
            transferred,
            load_inside,
            bo,
            beta,
            d: f.d,
            enclosed_area: enclosed,
            vc,
            vc_a: a,
            vc_b: b,
            vc_c: c,
            governed_by: governed_by.into(),
            lambda_s: size_effect(f.d),
            alpha_s: alpha_s(f.position),
            msc_x,
            msc_y,
            msc,
            threshold,
            significant,
            moment_transfer,
            unbalanced_b,
            unbalanced_l,
            refusal,
        })
    };

    // ── Column-face flexure (13.2.7.1) ──
    let (flexure_b, flexure_l) = if factored_uplift {
        (empty_flex.clone(), empty_flex)
    } else {
        (flexure_along(f, &dir_b, q_factored), flexure_along(f, &dir_l, q_factored))
    };

    let worst_utilization = [Some(bearing.utilization), one_way_shear.as_ref().map(|o| o.utilization), punching.as_ref().map(|p| p.utilization)]
        .into_iter()
        .flatten()
        .filter(|u| u.is_finite() && *u > 0.0)
        .fold(0.0, f64::max);
    let any_fail = bearing.status == FootingStatus::Fail
        || one_way_shear.as_ref().is_some_and(|o| o.status == FootingStatus::Fail)
        || punching.as_ref().is_some_and(|p| p.status == FootingStatus::Fail);
    let status = if !refusals.is_empty() {
        FootingStatus::Unsupported
    } else if any_fail {
        FootingStatus::Fail
    } else {
        FootingStatus::Ok
    };

    IsolatedFootingResult {
        footing_id: f.footing_id,
        status,
        bearing,
        factored_b: fb,
        factored_l: fl,
        factored_uplift,
        q_factored,
        one_way_shear,
        punching,
        flexure_b,
        flexure_l,
        punching_load_inside_perimeter: inside,
        worst_utilization,
        refusals,
    }
}

/// Check every footing of the input, in input order.
pub fn check_isolated_footings(input: &IsolatedFootingInput) -> Vec<IsolatedFootingResult> {
    input.footings.iter().map(check_isolated_footing).collect()
}

// ==================== Certified utilizations (generic) ====================

/// The enclosures of the three utilizations `[bearing, one-way shear, punching]` of a footing,
/// evaluated with the same formulas as `check_isolated_footing` in `T`.
///
/// `Err` when the footing cannot be certified to pass on structural grounds: not isolated, an
/// input that makes the check refuse, contact or moment-transfer conditions not decided on the
/// box. A refused check is never certified.
pub fn footing_ratio_enclosures<T: Real>(f: &IsolatedFootingData) -> Result<[T; 3], String> {
    use crate::certify::real::Tri;
    if f.kind != FootingKind::Isolated {
        return Err("not an isolated footing".into());
    }
    if f.position != ColumnPosition::Interior {
        return Err("edge or corner column: the unbalanced moment is not formed".into());
    }
    let finite = [f.b, f.l, f.d, f.column_b, f.column_h, f.fc, f.allowable_bearing, f.service_axial, f.factored_axial];
    if finite.iter().any(|x| !x.is_finite() || *x <= 0.0) {
        return Err("dimensions, strengths and axial forces must be positive".into());
    }
    let x = T::exact;
    let (b, l, d) = (x(f.b), x(f.l), x(f.d));
    let area = b * l;
    let one = T::lit(1.0);
    let zero = T::exact(0.0);
    let decided = |t: Tri, what: &str| -> Result<(), String> {
        if t == Tri::True { Ok(()) } else { Err(format!("{what} not certified")) }
    };

    // Bearing.
    let ns = x(f.service_axial);
    let q0s = ns.dv(area);
    let (_, _, ob) = axis_offsets(ns, x(f.service_moment_b), x(f.eccentricity_b));
    let (_, _, ol) = axis_offsets(ns, x(f.service_moment_l), x(f.eccentricity_l));
    let kb = kern_fraction(worst_magnitude(ob), b);
    let kl = kern_fraction(worst_magnitude(ol), l);
    decided(T::lit(-1e-12).le(one - kb - kl), "full contact under service loads")?;
    let bearing = (q0s * (one + kb + kl)).dv(x(f.allowable_bearing));

    // Factored field.
    let nu = x(f.factored_axial);
    let q0 = nu.dv(area);
    let (ucol, _, fob) = axis_offsets(nu, x(f.factored_moment_b), x(f.eccentricity_b));
    let (vcol, _, fol) = axis_offsets(nu, x(f.factored_moment_l), x(f.eccentricity_l));
    let fkb = kern_fraction(worst_magnitude(fob), b);
    let fkl = kern_fraction(worst_magnitude(fol), l);
    decided(T::lit(-1e-12).le(one - fkb - fkl), "full contact under factored loads")?;

    // One-way shear: every side whose cantilever is decidedly positive; an undecided one refuses.
    let rho_w = x(f.rho_w.unwrap_or(RHO_W_MIN).max(0.0));
    let mut one_way = zero;
    for (sb, sl, colb, offsets, ucol_dir) in [(b, l, x(f.column_b), fob, ucol), (l, b, x(f.column_h), fol, vcol)] {
        let half = sb * T::lit(0.5);
        let a_low = half + ucol_dir - colb * T::lit(0.5) - d;
        let a_high = half - ucol_dir - colb * T::lit(0.5) - d;
        let cap = one_way_capacity(x(f.fc), sl, d, rho_w);
        for (a, side) in [(a_low, Side::Low), (a_high, Side::High)] {
            match zero.lt(a) {
                Tri::False => continue,
                Tri::Unknown => return Err("one-way critical section position not decided".into()),
                Tri::True => {}
            }
            for u_r in offsets {
                let (vu, _, _) = one_way_demand(q0, sb, sl, u_r, a, side);
                one_way = one_way.max(vu.dv(cap));
            }
        }
    }

    // Punching.
    let (cb, ch) = (x(f.column_b), x(f.column_h));
    let (bo, enclosed) = critical_section(cb, ch, d, f.position);
    let beta = cb.max(ch).dv(cb.min(ch));
    let inside = if f.eccentricity_b != 0.0 || f.eccentricity_l != 0.0 {
        let mut least: Option<T> = None;
        for u_r in fob {
            for v_r in fol {
                let q = plan_pressure(q0, b, l, u_r, v_r, ucol, vcol);
                least = Some(match least { Some(m) => m.min(q), None => q });
            }
        }
        least.expect("four pairs").max(zero)
    } else {
        q0
    };
    let demand = (nu.abs() - inside * enclosed).max(zero);
    let [va, vb, vc3] = punching_vc(x(f.fc), d, bo, beta, f.position);
    let phi_vc = T::lit(PHI_SHEAR) * va.min(vb).min(vc3);
    let vu = demand.dv(bo * d).dv(T::lit(1000.0));
    let punching = vu.dv(phi_vc);
    let axis = |s: T, moment: f64, ecc: f64, span: T, width: T| -> T {
        let (col, m_ecc, _) = axis_offsets(nu, x(moment), x(ecc));
        let applied = x(moment).abs();
        let mut msc = zero;
        for o in [one, -one] {
            let relief = enclosed_relief(q0, s, col + o * m_ecc, span, width);
            msc = msc.max((o * applied - relief).abs());
        }
        msc
    };
    let msc_y = axis(b, f.factored_moment_b, f.eccentricity_b, cb + d, ch + d);
    let msc_x = axis(l, f.factored_moment_l, f.eccentricity_l, ch + d, cb + d);
    let msc = (msc_x.sq() + msc_y.sq()).max(zero).sqrt();
    let tol = x(f.moment_tolerance.unwrap_or(0.02));
    let threshold = tol * (demand * d).max(T::lit(1e-9));
    decided(msc.le(threshold), "an unbalanced moment below the significance threshold (8.4.4.2)")?;

    Ok([bearing, one_way, punching])
}
