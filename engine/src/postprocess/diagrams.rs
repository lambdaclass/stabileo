use crate::types::*;
use super::diagram_extrema::{distributed_actions, Curve, Cut, PointAction, Response};
use serde::{Deserialize, Serialize};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramPoint {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementDiagram {
    pub element_id: usize,
    pub points: Vec<DiagramPoint>,
    pub max_value: f64,
    pub min_value: f64,
    pub max_abs_t: f64,
    pub max_abs_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramResults {
    pub moment: Vec<ElementDiagram>,
    pub shear: Vec<ElementDiagram>,
    pub axial: Vec<ElementDiagram>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeformedPoint {
    pub x: f64,
    pub y: f64,
}

const NUM_POINTS: usize = 21;

fn planar_curve<'a>(
    ef: &'a ElementForces, kind: &str, sorted_pl: &'a [PointLoadInfo],
) -> Curve<impl Iterator<Item = DistributedLoadInfo> + Clone + 'a, impl Iterator<Item = PointAction> + Clone + 'a> {
    let (start, slope, response, loads, qi, qj, kind) = match kind {
        "moment" => (ef.m_start, -ef.v_start, Response::Moment(-1.0), ef.distributed_loads.as_slice(), ef.q_i, ef.q_j, 0),
        "shear" => (ef.v_start, 0.0, Response::Force(1.0), ef.distributed_loads.as_slice(), ef.q_i, ef.q_j, 1),
        "axial" => (ef.n_start, 0.0, Response::Force(-1.0), ef.distributed_loads_x.as_slice(), 0.0, 0.0, 2),
        _ => (0.0, 0.0, Response::Force(1.0), &[][..], 0.0, 0.0, 3),
    };
    Curve {
        length: ef.length, start, change: 0.0, slope, response,
        distributed: distributed_actions(ef.length, loads, qi, qj),
        points: sorted_pl.iter().filter_map(move |p| {
            let (jump, slope) = match kind {
                0 => (p.my.into_iter().sum(), -p.p),
                1 => (p.p, 0.0),
                2 => (p.px?, 0.0),
                _ => return None,
            };
            (jump != 0.0 || slope != 0.0).then_some(PointAction { a: p.a, jump, slope })
        }),
    }
}

pub fn diagram_positions_2d(ef: &ElementForces, kind: &str) -> Vec<f64> {
    if let Err(error) = validate_diagram_loads_2d(ef) { panic!("{error}"); }
    let mut positions: Vec<_> = planar_curve(ef, kind, &sorted_point_loads(ef)).diagram_cuts(NUM_POINTS).unwrap_or_else(|error| panic!("{error}"))
        .into_iter().map(|cut| cut.t).collect();
    positions.dedup();
    positions
}

pub(crate) fn diagram_critical_cuts_2d(ef: &ElementForces, kind: &str, sorted_pl: &[PointLoadInfo]) -> Result<Vec<Cut>, String> {
    validate_diagram_loads_2d(ef)?;
    planar_curve(ef, kind, sorted_pl).critical_cuts().map_err(|e| format!("Element {} {kind}: {e}", ef.element_id))
}

/// Return the element's point loads sorted by position `a` (stable, ascending).
/// Pair with `compute_diagram_value_at_sorted` to sort once per element-force
/// record instead of on every station evaluation.
pub fn sorted_point_loads(ef: &ElementForces) -> Vec<PointLoadInfo> {
    let mut pl = ef.point_loads.clone();
    // `total_cmp` rather than `partial_cmp().unwrap()`: a NaN position from a
    // diverged solve would panic, and in WASM a panic aborts the module.
    pl.sort_by(|a, b| a.a.total_cmp(&b.a));
    pl
}

/// The 2D diagram kinds `compute_diagram_value_at` evaluates.
pub const DIAGRAM_KINDS_2D: [&str; 3] = ["moment", "shear", "axial"];

/// Refuse an unknown diagram kind (the evaluator returns 0 for one).
pub fn check_diagram_kind_2d(kind: &str) -> Result<(), String> {
    if DIAGRAM_KINDS_2D.contains(&kind) {
        Ok(())
    } else {
        Err(format!("unknown diagram kind '{kind}'; accepted: {}", DIAGRAM_KINDS_2D.join(", ")))
    }
}

/// Compute the value of a diagram (M, V, or N) at a given normalized position t.
pub fn compute_diagram_value_at(
    kind: &str,
    t: f64,
    ef: &ElementForces,
) -> f64 {
    compute_diagram_value_at_sorted(kind, t, ef, &sorted_point_loads(ef))
}

/// Compute the value of a diagram (M, V, or N) at a given normalized position t,
/// taking point loads pre-sorted by `a` (see `sorted_point_loads`). Identical
/// to `compute_diagram_value_at` but avoids re-cloning/re-sorting per call.
pub fn compute_diagram_value_at_sorted(
    kind: &str,
    t: f64,
    ef: &ElementForces,
    sorted_pl: &[PointLoadInfo],
) -> f64 {
    evaluate_diagram_cut_2d(kind, Cut::left(t), ef, sorted_pl)
}

pub(crate) fn evaluate_diagram_cut_2d(kind: &str, cut: Cut, ef: &ElementForces, sorted_pl: &[PointLoadInfo]) -> f64 {
    if let Err(error) = validate_diagram_loads_2d(ef) { panic!("{error}"); }
    planar_curve(ef, kind, sorted_pl).value(cut)
}

// ==================== 2D Diagrams ====================

fn compute_single_diagram(
    kind: &str,
    ef: &ElementForces,
    geom: (f64, f64, f64, f64),
    sorted_pl: &[PointLoadInfo],
) -> Result<ElementDiagram, String> {
    let (node_ix, node_iy, node_jx, node_jy) = geom;

    validate_diagram_loads_2d(ef)?;
    let curve = planar_curve(ef, kind, sorted_pl);
    let positions = curve.diagram_cuts(NUM_POINTS).map_err(|e| format!("Element {} {kind}: {e}", ef.element_id))?;
    let mut points = Vec::with_capacity(positions.len());
    let mut max_val = f64::NEG_INFINITY;
    let mut min_val = f64::INFINITY;
    let mut max_abs_t = 0.0;
    let mut max_abs_value: f64 = 0.0;

    for cut in positions {
        let t = cut.t;
        let value = curve.value(cut);
        if !value.is_finite() {
            return Err(format!("Element {} {kind}: non-finite diagram at t={t}", ef.element_id));
        }
        let x = node_ix + t * (node_jx - node_ix);
        let y = node_iy + t * (node_jy - node_iy);

        points.push(DiagramPoint { t, x, y, value });

        if value > max_val { max_val = value; }
        if value < min_val { min_val = value; }
        if value.abs() > max_abs_value.abs() {
            max_abs_t = t;
            max_abs_value = value;
        }
    }

    Ok(ElementDiagram {
        element_id: ef.element_id,
        points,
        max_value: max_val,
        min_value: min_val,
        max_abs_t,
        max_abs_value,
    })
}

/// Compute all 2D diagrams (M, V, N) for all elements.
pub fn compute_diagrams_2d(
    input: &SolverInput,
    results: &AnalysisResults,
) -> DiagramResults {
    try_compute_diagrams_2d(input, results).unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn try_compute_diagrams_2d(input: &SolverInput, results: &AnalysisResults) -> Result<DiagramResults, String> {
    let mut moment = Vec::new();
    let mut shear = Vec::new();
    let mut axial = Vec::new();

    // O(1) lookups once — the per-element .values().find() scans made this
    // O(E·(E+N)) per call on big models.
    let elem_by_id: std::collections::HashMap<usize, &crate::types::SolverElement> =
        crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &crate::types::SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

    for ef in &results.element_forces {
        let (node_ix, node_iy, node_jx, node_jy) = if let Some(elem) = elem_by_id.get(&ef.element_id) {
            match (node_by_id.get(&elem.node_i), node_by_id.get(&elem.node_j)) {
                (Some(ni), Some(nj)) => (ni.x, ni.z, nj.x, nj.z),
                _ => (0.0, 0.0, ef.length, 0.0),
            }
        } else {
            (0.0, 0.0, ef.length, 0.0)
        };

        let sorted_pl = sorted_point_loads(ef);
        let geom = (node_ix, node_iy, node_jx, node_jy);
        for (kind, out) in [
            ("moment", &mut moment),
            ("shear", &mut shear),
            ("axial", &mut axial),
        ] {
            out.push(compute_single_diagram(kind, ef, geom, &sorted_pl)?);
        }
    }

    Ok(DiagramResults { moment, shear, axial })
}

// ==================== Deformed Shape ====================

enum MemberLoad {
    Force { a: f64, p: f64 },
    Couple { a: f64, c: f64 },
    Distributed { qi: f64, qj: f64, a: f64, b: f64 },
}

/// Transverse deflection of a loaded 2D member, exact for Euler–Bernoulli
/// (`flex_s = 0`) and Timoshenko (`flex_s = 1/(G·As)`) beams.
///
/// With m = EI·ψ' (sagging), s = m', s' = q and v' = ψ − s/(G·As), integrating
/// from node i gives, for loads with moment m_q and shear s_q of their own
/// (zero at x = 0):
///   m(x) = m0 + s0·x + m_q(x)
///   ψ(x) = θ_i + (m0·x + s0·x²/2 + ∫₀ˣ m_q)/EI
///   v(x) = v_i + θ_i·x + (m0·x²/2 + s0·x³/6 + ∫₀ˣ(x − t)·m_q)/EI − (s0·x + m_q(x))/(G·As)
/// A free curvature κ, such as a thermal gradient's, makes the member's moment m − EI·κ, so
/// it only moves the released-end conditions to m = EI·κ.
/// The unknowns (θ_i, m0, s0) follow from the end conditions: θ_i is the node
/// rotation or, at a hinge, m(0) = 0; v(L) = v_j; ψ(L) = θ_j or, at a hinge,
/// m(L) = 0. Without shear flexibility the homogeneous part is the cubic
/// Hermite interpolation; with it, the exact Timoshenko one.
struct MemberDeflection {
    ei: f64,
    flex_s: f64,
    v_i: f64,
    theta_i: f64,
    m0: f64,
    s0: f64,
    loads: Vec<MemberLoad>,
}

impl MemberDeflection {
    /// (m_q(x), ∫₀ˣ m_q, ∫₀ˣ (x − t) m_q(t) dt, ∫₀ˣ s_q, s_q(x)) of the member loads: couples
    /// change m_q but carry no shear.
    #[inline(always)]
    fn load_terms(&self, x: f64) -> [f64; 5] {
        let mut out = [0.0; 5];
        let add = |out: &mut [f64; 5], p: f64, d: f64| {
            if d > 0.0 {
                out[0] += p * d;
                out[1] += p * d * d / 2.0;
                out[2] += p * d * d * d / 6.0;
                out[3] += p * d;
                out[4] += p;
            }
        };
        for load in &self.loads {
            match *load {
                MemberLoad::Force { a, p } => add(&mut out, p, x - a),
                MemberLoad::Couple { a, c } => {
                    let d = x - a;
                    if d > 0.0 {
                        out[0] -= c;
                        out[1] -= c * d;
                        out[2] -= c * d * d / 2.0;
                    }
                }
                MemberLoad::Distributed { qi, qj, a, b } => {
                    let hi = b.min(x);
                    if hi <= a {
                        continue;
                    }
                    let g = (0.6f64).sqrt();
                    let (half, mid) = (0.5 * (hi - a), 0.5 * (hi + a));
                    for (t, w) in [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)] {
                        let tt = mid + half * t;
                        let q = qi + (qj - qi) * (tt - a) / (b - a);
                        add(&mut out, q * w * half, x - tt);
                    }
                }
            }
        }
        out
    }

    fn new(
        l: f64, ei: f64, flex_s: f64,
        v_i: f64, r_i: f64, v_j: f64, r_j: f64,
        hinge_start: bool, hinge_end: bool,
        points: Vec<(f64, f64)>, dist: Vec<(f64, f64, f64, f64)>, couples: Vec<(f64, f64)>,
    ) -> Self {
        Self::curved(l, ei, flex_s, v_i, r_i, v_j, r_j, hinge_start, hinge_end, points, dist, couples, 0.0)
    }

    #[allow(clippy::too_many_arguments)]
    fn curved(
        l: f64, ei: f64, flex_s: f64,
        v_i: f64, r_i: f64, v_j: f64, r_j: f64,
        hinge_start: bool, hinge_end: bool,
        points: Vec<(f64, f64)>, dist: Vec<(f64, f64, f64, f64)>, couples: Vec<(f64, f64)>,
        kappa: f64,
    ) -> Self {
        for &(_, _, a, b) in &dist {
            if let Err(error) = crate::element::validate_member_load_interval("Member recovery", l, a, b) { panic!("{error}"); }
        }
        let loads = points.into_iter().map(|(a, p)| MemberLoad::Force { a, p })
            .chain(dist.into_iter().map(|(qi, qj, a, b)| MemberLoad::Distributed { qi, qj, a, b }))
            .chain(couples.into_iter().map(|(a, c)| MemberLoad::Couple { a, c }))
            .collect();
        let mut d = MemberDeflection { ei, flex_s, v_i, theta_i: 0.0, m0: 0.0, s0: 0.0, loads };
        let [mql, mq1, mq2, sql, _] = d.load_terms(l);
        let free = ei * kappa;
        // Unknowns x = [θ_i, m0, s0].
        let r1 = if hinge_start { ([0.0, 1.0, 0.0], free) } else { ([1.0, 0.0, 0.0], r_i) };
        let r2 = (
            [l, l * l / (2.0 * ei), l * l * l / (6.0 * ei) - flex_s * l],
            v_j - v_i - mq2 / ei + flex_s * sql,
        );
        let end_couples: f64 = d.loads.iter().filter_map(|load| match *load {
            MemberLoad::Couple { a, c } if a >= l => Some(c),
            MemberLoad::Couple { .. } | MemberLoad::Force { .. } | MemberLoad::Distributed { .. } => None,
        }).sum();
        let r3 = if hinge_end {
            ([0.0, 1.0, l], free + end_couples - mql)
        } else {
            ([1.0, l / ei, l * l / (2.0 * ei)], r_j - mq1 / ei)
        };
        let a = [r1.0, r2.0, r3.0];
        let rhs = [r1.1, r2.1, r3.1];
        let det = |m: &[[f64; 3]; 3]| {
            m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
        };
        let den = det(&a);
        if den.abs() > 0.0 && den.is_finite() {
            let mut x = [0.0; 3];
            for c in 0..3 {
                let mut m = a;
                for r in 0..3 {
                    m[r][c] = rhs[r];
                }
                x[c] = det(&m) / den;
            }
            d.theta_i = x[0];
            d.m0 = x[1];
            d.s0 = x[2];
        }
        d
    }

    fn v(&self, x: f64) -> f64 {
        let [_, _, mq2, sq, _] = self.load_terms(x);
        self.v_i
            + self.theta_i * x
            + (self.m0 * x * x / 2.0 + self.s0 * x * x * x / 6.0 + mq2) / self.ei
            - self.flex_s * (self.s0 * x + sq)
    }

    fn rotation(&self, x: f64) -> f64 {
        let [_, mq1, ..] = self.load_terms(x);
        self.theta_i + (self.m0 * x + self.s0 * x * x / 2.0 + mq1) / self.ei
    }

    fn moment(&self, x: f64) -> f64 {
        self.m0 + self.s0 * x + self.load_terms(x)[0]
    }

    fn shear(&self, x: f64) -> f64 {
        self.s0 + self.load_terms(x)[4]
    }
}

/// The section rotation along one bending plane of a loaded member, from the same exact
/// Euler–Bernoulli / Timoshenko deflection as [`compute_deformed_shape`], couples included: end values in the
/// member's local axes, `points` (a, p) and `dist` (q_i, q_j, a, b) as `ElementForces` carries
/// them, `couples` (a, m) its counter-clockwise couples, and `kappa` the free curvature of a
/// thermal gradient, which carries no moment and so is not in the member's forces.
pub(crate) struct SpanRotation {
    member: MemberDeflection,
    breaks: Vec<f64>,
}

impl SpanRotation {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new(
        l: f64, ei: f64, flex_s: f64,
        v_i: f64, r_i: f64, v_j: f64, r_j: f64,
        hinge_start: bool, hinge_end: bool,
        points: Vec<(f64, f64)>, dist: Vec<(f64, f64, f64, f64)>, couples: Vec<(f64, f64)>,
        kappa: f64,
    ) -> Self {
        let breaks = points.iter().map(|p| p.0).chain(couples.iter().map(|c| c.0)).chain(dist.iter().flat_map(|d| [d.2, d.3])).filter(|&a| a > 0.0 && a < l).collect();
        SpanRotation { member: MemberDeflection::curved(l, ei, flex_s, v_i, r_i, v_j, r_j, hinge_start, hinge_end, points, dist, couples, kappa), breaks }
    }

    pub(crate) fn at(&self, x: f64) -> f64 {
        self.member.rotation(x)
    }

    /// EI times the derivative of [`Self::at`]: the rotation is extreme only where it changes sign.
    pub(crate) fn moment(&self, x: f64) -> f64 {
        self.member.moment(x)
    }

    /// The shear, from the end shear and the loads rather than from differences of the moment,
    /// which a large free curvature would swamp.
    pub(crate) fn shear(&self, x: f64) -> f64 {
        self.member.shear(x)
    }

    #[cfg(test)]
    pub(crate) fn deflection(&self, x: f64) -> f64 {
        self.member.v(x)
    }

    pub(crate) fn ei(&self) -> f64 {
        self.member.ei
    }

    /// 1/(G·As): the axis turns from the section by −V/(G·As).
    pub(crate) fn shear_flexibility(&self) -> f64 {
        self.member.flex_s
    }

    pub(crate) fn breaks(&self) -> &[f64] {
        &self.breaks
    }
}

/// The member deflection of `compute_deformed_shape` without member loads, for
/// unit end values: row k holds `[c0, c1, c2, c3]` with `v(x) = c0 + c1·x + c2·x² +
/// c3·x³` when the k-th of (v_i, θ_i, v_j, θ_j) is 1 and the others 0. The
/// deflection is affine in the end values (the unknowns solve a 3×3 system whose
/// matrix does not depend on them) with exactly these coefficients; the load
/// terms do not depend on the end values. `certify::deflection` bounds it.
pub(crate) fn deflection_shape_cubics(
    l: f64, ei: f64, flex_s: f64, hinge_start: bool, hinge_end: bool,
) -> [[f64; 4]; 4] {
    let mut out = [[0.0; 4]; 4];
    for (k, row) in out.iter_mut().enumerate() {
        let mut e = [0.0; 4];
        e[k] = 1.0;
        let d = MemberDeflection::new(l, ei, flex_s, e[0], e[1], e[2], e[3], hinge_start, hinge_end, Vec::new(), Vec::new(), Vec::new());
        *row = [d.v_i, d.theta_i - flex_s * d.s0, d.m0 / (2.0 * d.ei), d.s0 / (6.0 * d.ei)];
    }
    out
}

#[derive(Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RecoverySpace {
    #[default]
    Planar,
    Spatial,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberRecoveryInput {
    #[serde(default)]
    pub space: RecoverySpace,
    pub length: f64,
    pub ei: Option<f64>,
    pub gas: Option<f64>,
    pub v_i: f64,
    pub r_i: f64,
    pub v_j: f64,
    pub r_j: f64,
    #[serde(default)]
    pub hinge_start: bool,
    #[serde(default)]
    pub hinge_end: bool,
    #[serde(default)]
    pub points: Vec<PointLoadInfo>,
    #[serde(default)]
    pub dist: Vec<DistributedLoadInfo>,
    pub positions: Vec<f64>,
}

#[derive(Serialize)]
pub struct MemberSample {
    pub v: f64,
    pub rotation: f64,
}

pub fn recover_member(input: &MemberRecoveryInput) -> Result<Vec<MemberSample>, String> {
    for d in &input.dist {
        crate::element::validate_member_load_interval("Member recovery", input.length, d.a, d.b)?;
    }
    let minimum_ei = match input.space {
        RecoverySpace::Planar => 1e-6,
        RecoverySpace::Spatial => 0.0,
    };
    let ei = input.ei.filter(|ei| ei.is_finite() && *ei > minimum_ei);
    let has_ei = ei.is_some();
    let loaded = input.points.iter().any(|p| p.p != 0.0 || p.my.is_some_and(|c| c != 0.0))
        || input.dist.iter().any(|d| d.q_i != 0.0 || d.q_j != 0.0);
    if loaded && !has_ei {
        return Err(format!("Member recovery requires finite EI greater than {minimum_ei} for nonzero span loads."));
    }
    let flex_s = match input.gas {
        Some(k) if has_ei && k > 0.0 && k.is_finite() => 1.0 / k,
        _ => 0.0,
    };
    let mut points = Vec::new();
    let mut couples = Vec::new();
    let mut dist = Vec::new();
    if has_ei {
        for &PointLoadInfo { a, p, px: _, my } in &input.points {
            points.push((a, p));
            if let Some(c) = my { couples.push((a, c)); }
        }
        for &DistributedLoadInfo { q_i, q_j, a, b } in &input.dist {
            dist.push((q_i, q_j, a, b));
        }
    }
    let member = MemberDeflection::new(input.length, ei.unwrap_or(1.0), flex_s,
        input.v_i, input.r_i, input.v_j, input.r_j, input.hinge_start, input.hinge_end, points, dist, couples);
    Ok(input.positions.iter().map(|t| {
        let x = t.clamp(0.0, 1.0) * input.length;
        MemberSample { v: member.v(x), rotation: member.rotation(x) }
    }).collect())
}

/// Compute deformed shape for a 2D element: the exact deflection of the
/// loaded member (Euler–Bernoulli, or Timoshenko when `gas` = G·As is given
/// together with `ei`), see [`MemberDeflection`].
pub fn compute_deformed_shape(
    node_ix: f64, node_iy: f64,
    node_jx: f64, node_jy: f64,
    u_ix: f64, u_iy: f64, r_iz: f64,
    u_jx: f64, u_jy: f64, r_jz: f64,
    scale: f64,
    length: f64,
    hinge_start: bool,
    hinge_end: bool,
    ei: Option<f64>,
    gas: Option<f64>,
    load_qi: Option<f64>,
    load_qj: Option<f64>,
    load_points: &[PointLoadInfo],
    dist_loads: &[(f64, f64, f64, f64)],
) -> Result<Vec<DeformedPoint>, String> {
    let positions: Vec<_> = (0..21).map(|i| i as f64 / 20.0).collect();
    let displacements = compute_member_displacements_2d(
        node_ix, node_iy, node_jx, node_jy, u_ix, u_iy, r_iz, u_jx, u_jy, r_jz,
        length, hinge_start, hinge_end, ei, gas, load_qi, load_qj, load_points, dist_loads, &positions,
    )?;
    Ok(positions.iter().zip(displacements).map(|(&t, d)| DeformedPoint {
        x: node_ix + t * (node_jx - node_ix) + d.ux * scale,
        y: node_iy + t * (node_jy - node_iy) + d.uz * scale,
    }).collect())
}

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct MemberDisplacement2D {
    pub ux: f64,
    pub uz: f64,
    pub ry: f64,
}

#[allow(clippy::too_many_arguments)]
pub fn compute_member_displacements_2d(
    node_ix: f64, node_iy: f64, node_jx: f64, node_jy: f64,
    u_ix: f64, u_iy: f64, r_iz: f64, u_jx: f64, u_jy: f64, r_jz: f64,
    length: f64, hinge_start: bool, hinge_end: bool,
    ei: Option<f64>, gas: Option<f64>, load_qi: Option<f64>, load_qj: Option<f64>,
    load_points: &[PointLoadInfo], dist_loads: &[(f64, f64, f64, f64)], positions: &[f64],
) -> Result<Vec<MemberDisplacement2D>, String> {
    let cos = (node_jx - node_ix) / length;
    let sin = (node_jy - node_iy) / length;
    let v_i = -u_ix * sin + u_iy * cos;
    let v_j = -u_jx * sin + u_jy * cos;
    let u_i = u_ix * cos + u_iy * sin;
    let u_j = u_jx * cos + u_jy * sin;
    let mut all_dist = dist_loads.to_vec();
    if all_dist.is_empty() {
        let q0 = load_qi.unwrap_or(0.0);
        let q1 = load_qj.unwrap_or(0.0);
        if q0 != 0.0 || q1 != 0.0 {
            all_dist.push((q0, q1, 0.0, length));
        }
    }
    let samples = recover_member(&MemberRecoveryInput {
        space: RecoverySpace::Planar,
        length, ei, gas, v_i, r_i: r_iz, v_j, r_j: r_jz, hinge_start, hinge_end,
        points: load_points.to_vec(),
        dist: all_dist.into_iter().map(|(q_i, q_j, a, b)| DistributedLoadInfo { q_i, q_j, a, b }).collect(),
        positions: positions.to_vec(),
    })?;
    Ok(positions.iter().zip(samples).map(|(&t, sample)| {
        let xi = t.clamp(0.0, 1.0);
        let u = u_i + xi * (u_j - u_i);
        MemberDisplacement2D { ux: u * cos - sample.v * sin, uz: u * sin + sample.v * cos, ry: sample.rotation }
    }).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diagram_issue_models(length: f64, planar: serde_json::Value, spatial: serde_json::Value) -> (SolverInput, SolverInput3D) {
        let input = serde_json::json!({
            "nodes": {"1":{"id":1,"x":0,"z":0}, "2":{"id":2,"x":length,"z":0}},
            "materials": {"1":{"id":1,"e":200000,"nu":0.3}},
            "sections": {"1":{"id":1,"a":0.01,"iy":0.0001,"iz":0.0001,"j":0.0001}},
            "elements": {"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "supports": {"1":{"id":1,"nodeId":1,"type":"fixed","rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
            "loads": [planar]
        });
        let planar = serde_json::from_value(input.clone()).unwrap();
        let mut input = input;
        input["loads"][0] = spatial;
        input["nodes"]["1"]["y"] = 0.into();
        input["nodes"]["2"]["y"] = 0.into();
        (planar, serde_json::from_value(input).unwrap())
    }

    #[test]
    fn issue_2250_diagram_extrema_partial_load() {
        use crate::postprocess::{combinations, diagrams_3d};
        let (plane, space) = diagram_issue_models(
            100.0,
            serde_json::json!({"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qI":1,"qJ":-1}}),
            serde_json::json!({"type":"distributed","data":{"elementId":1,"a":1,"b":2,"qYI":0,"qYJ":0,"qZI":1,"qZJ":-1}}),
        );
        let expected = (2.0 - 1.0) / 4.0;
        let pn = crate::solver::pdelta::solve_pdelta_2d(&plane, 20, 1e-10).unwrap();
        let sn = crate::solver::pdelta::solve_pdelta_3d(&space, 20, 1e-10).unwrap();
        assert!(pn.converged && sn.converged);
        let plane_results = [crate::solver::linear::solve_2d(&plane).unwrap(), pn.results];
        let space_results = [crate::solver::linear::solve_3d(&space).unwrap(), sn.results];
        let mut measured = Vec::new();
        for (rp, rs) in plane_results.iter().zip(&space_results) {
            measured.extend([
                compute_diagrams_2d(&plane, rp).shear[0].max_abs_value,
                diagrams_3d::compute_diagrams_3d(rs).shear_z[0].max_abs_value,
                combinations::compute_envelope(std::slice::from_ref(rp)).unwrap().shear.global_max,
                combinations::compute_envelope_3d(std::slice::from_ref(rs)).unwrap().shear_z.global_max,
            ]);
        }
        assert!(measured.iter().all(|v| (v.abs() - expected).abs() < 1e-12), "expected {expected}, got {measured:?}");
    }

    #[test]
    fn issue_2226_diagram_extrema_concentrated_jump() {
        use crate::postprocess::diagrams_3d::evaluate_diagram_3d_at;
        let mut measured = Vec::new();
        for a in [1.5, 3.0 - 5e-11] {
            let (plane, space) = diagram_issue_models(
                3.0,
                serde_json::json!({"type":"pointOnElement","data":{"elementId":1,"a":a,"p":1,"my":2}}),
                serde_json::json!({"type":"pointOnElement","data":{"elementId":1,"a":a,"py":0,"pz":1}}),
            );
            let plane_nonlinear = crate::solver::pdelta::solve_pdelta_2d(&plane, 20, 1e-10).unwrap();
            let space_nonlinear = crate::solver::pdelta::solve_pdelta_3d(&space, 20, 1e-10).unwrap();
            assert!(plane_nonlinear.converged && space_nonlinear.converged);
            let plane_results = [crate::solver::linear::solve_2d(&plane).unwrap(), plane_nonlinear.results];
            let space_results = [crate::solver::linear::solve_3d(&space).unwrap(), space_nonlinear.results];
            let before = (a - 5e-11) / 3.0;
            let at = a / 3.0;
            let after = (a + 5e-11) / 3.0;
            for (plane_result, space_result) in plane_results.iter().zip(&space_results) {
                let rp = &plane_result.element_forces[0];
                let rs = &space_result.element_forces[0];
                for t in [before, at] {
                    assert!((compute_diagram_value_at("shear", t, rp) + 1.0).abs() < 1e-12);
                    assert!((evaluate_diagram_3d_at(rs, "shearZ", t) + 1.0).abs() < 1e-12);
                }
                measured.extend([
                    compute_diagram_value_at("shear", after, rp),
                    compute_diagram_value_at("moment", after, rp),
                    evaluate_diagram_3d_at(rs, "shearZ", after),
                ]);
            }
        }
        assert!(measured.iter().all(|v| v.abs() < 1e-12), "expected zero after the load, got {measured:?}");
    }

    fn shape(
        ends: [f64; 4], hinges: (bool, bool), ei: f64, gas: Option<f64>,
        pts: &[(f64, f64)], dist: &[(f64, f64, f64, f64)], l: f64,
    ) -> Vec<f64> {
        let [v_i, r_i, v_j, r_j] = ends;
        compute_deformed_shape(
            0.0, 0.0, l, 0.0, 0.0, v_i, r_i, 0.0, v_j, r_j, 1.0, l, hinges.0, hinges.1,
            Some(ei), gas, None, None, &pts.iter().map(|&(a, p)| PointLoadInfo { a, p, px: None, my: None }).collect::<Vec<_>>(), dist,
        )
        .unwrap()
        .iter()
        .map(|p| p.y)
        .collect()
    }

    /// Timoshenko cantilever, point load at a: the closed form
    /// v = P x²(3a − x)/(6EI) + P x/(G·As) for x ≤ a, and
    /// v = P a²(3x − a)/(6EI) + P a/(G·As) beyond.
    #[test]
    fn deformed_shape_timoshenko_cantilever_point_load() {
        let (l, a, p, ei, gas) = (2.0, 0.5, -10.0, 8.0e4, 6.0e5);
        let v = |x: f64| {
            if x <= a { p * x * x * (3.0 * a - x) / (6.0 * ei) + p * x / gas } else { p * a * a * (3.0 * x - a) / (6.0 * ei) + p * a / gas }
        };
        let tip = [0.0, 0.0, v(l), p * a * a / (2.0 * ei)];
        for hinge_end in [false, true] {
            // With a released end the tip rotation is ignored (m(L) = 0 holds anyway).
            let mut ends = tip;
            if hinge_end { ends[3] = 123.0; }
            let ys = shape(ends, (false, hinge_end), ei, Some(gas), &[(a, p)], &[], l);
            for (k, y) in ys.iter().enumerate() {
                let x = l * k as f64 / 20.0;
                assert!((y - v(x)).abs() < 1e-12, "x={x}: {y} vs {}", v(x));
            }
        }
        // The Euler–Bernoulli shape misses the shear deflection.
        let eb = shape(tip, (false, false), ei, None, &[(a, p)], &[], l);
        assert!((eb[5] - v(0.5)).abs() > 1e-6);
    }

    /// Timoshenko fixed-fixed and simply supported beams under a uniform load,
    /// expressed as a partial trapezoid split in two:
    /// v(L/2) = qL⁴/384EI + qL²/8GAs (fixed), 5qL⁴/384EI + qL²/8GAs (pinned).
    #[test]
    fn deformed_shape_timoshenko_udl() {
        let (l, q, ei, gas) = (4.0, -3.0, 2.0e3, 5.0e3);
        let dist = [(q, q, 0.0, 1.5), (q, q, 1.5, l)];
        let fixed = shape([0.0; 4], (false, false), ei, Some(gas), &[], &dist, l);
        let want = q * l.powi(4) / (384.0 * ei) + q * l * l / (8.0 * gas);
        assert!((fixed[10] - want).abs() < 1e-12 * want.abs().max(1.0), "{} vs {want}", fixed[10]);
        let pinned = shape([0.0, 7.0, 0.0, -7.0], (true, true), ei, Some(gas), &[], &dist, l);
        let want = 5.0 * q * l.powi(4) / (384.0 * ei) + q * l * l / (8.0 * gas);
        assert!((pinned[10] - want).abs() < 1e-12 * want.abs().max(1.0), "{} vs {want}", pinned[10]);
    }

    fn scaled_beam_2d(s: f64) -> ElementForces {
        let input: crate::types::SolverInput = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":4,"z":0}},
            "materials": {"1": {"id":1,"e":200000.0 * s,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iz":0.0001}},
            "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":2,"type":"pinned"}},
            "loads": [{"type":"distributed","data":{"elementId":1,"qI":-10.0 * s,"qJ":-4.0 * s}}]
        })).unwrap();
        let mut ef = crate::solver::linear::solve_2d(&input).unwrap().element_forces.remove(0);
        ef.distributed_loads.clear();
        (ef.q_i, ef.q_j) = (-10.0 * s, -4.0 * s);
        ef
    }

    #[test]
    fn a_member_without_a_load_list_keeps_its_load_at_any_scale_1614() {
        let reference = scaled_beam_2d(1.0);
        let r_gaps = crate::certify::stations::diagram_gaps_2d(&reference);
        for s in [1e-6, 1e-12] {
            let scaled = scaled_beam_2d(s);
            for k in 0..=20 {
                let t = k as f64 / 20.0;
                for kind in ["moment", "shear"] {
                    let (want, got) = (compute_diagram_value_at(kind, t, &reference), compute_diagram_value_at(kind, t, &scaled) / s);
                    assert!((got - want).abs() < 1e-9 * (1.0 + want.abs()), "{s:e} {kind} t {t}: {got} vs {want}");
                }
            }
            let gaps = crate::certify::stations::diagram_gaps_2d(&scaled);
            assert!((gaps.moment / s - r_gaps.moment).abs() <= 1e-9 * (1.0 + r_gaps.moment.abs()), "{s:e}: {gaps:?} vs {r_gaps:?}");
        }
    }

    fn scaled_beam_3d(s: f64) -> crate::types::ElementForces3D {
        let input: crate::types::SolverInput3D = serde_json::from_value(serde_json::json!({
            "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":4,"y":0,"z":0}},
            "materials": {"1": {"id":1,"e":200000.0 * s,"nu":0.3}},
            "sections": {"1": {"id":1,"a":0.01,"iy":0.0001,"iz":0.0002,"j":0.0001}},
            "elements": {"1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "supports": {"1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}, "2": {"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
            "loads": [{"type":"distributed","data":{"elementId":1,"qYI":-10.0 * s,"qYJ":-4.0 * s,"qZI":3.0 * s,"qZJ":7.0 * s}}]
        })).unwrap();
        crate::solver::linear::solve_3d(&input).unwrap().element_forces.remove(0)
    }

    #[test]
    fn a_3d_member_diagram_keeps_its_load_at_any_scale_1614() {
        let reference = scaled_beam_3d(1.0);
        for s in [1e-12, 1e-200] {
            let scaled = scaled_beam_3d(s);
            for k in 0..=20 {
                let t = k as f64 / 20.0;
                for kind in ["momentZ", "momentY", "shearY", "shearZ"] {
                    let want = crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(&reference, kind, t);
                    let got = crate::postprocess::diagrams_3d::evaluate_diagram_3d_at(&scaled, kind, t) / s;
                    assert!((got - want).abs() < 1e-9 * (1.0 + want.abs()), "{s:e} {kind} t {t}: {got} vs {want}");
                }
            }
        }
    }
    #[test]
    fn issue_2222_member_deflection_refuses_start_overhang() {
        assert!(std::panic::catch_unwind(|| MemberDeflection::new(3.0, 1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, vec![], vec![(-2.0, -2.0, -1.0, 1.0)], vec![])).is_err());
    }

    #[test]
    fn issue_2222_member_deflection_refuses_end_overhang() {
        assert!(std::panic::catch_unwind(|| MemberDeflection::curved(3.0, 1000.0, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, vec![], vec![(-2.0, -2.0, 2.0, 4.0)], vec![], 0.0)).is_err());
    }

}

#[cfg(test)]
mod interior_couples_2143 {
    use super::*;

    fn expected(x: f64, a: f64, c: f64) -> (f64, f64) {
        let l = 5.0;
        let ei = 20_000.0;
        let b = l - a;
        let m = c * b * (l - 3.0 * a) / (l * l);
        let v = 6.0 * c * a * b / (l * l * l);
        let d = (x - a).max(0.0);
        ((m * x * x / 2.0 + v * x * x * x / 6.0 - c * d * d / 2.0) / ei,
         (m * x + v * x * x / 2.0 - c * d) / ei)
    }

    #[test]
    fn public_shape_keeps_interior_couples() {
        for a in [0.000005, 1.0, 2.0, 2.5, 4.0, 4.999995] {
            for c in [-6.0, 6.0] {
                let input = serde_json::json!({
                    "nodeIx": 0.0, "nodeIy": 0.0, "nodeJx": 5.0, "nodeJy": 0.0,
                    "uIx": 0.0, "uIy": 0.0, "rIz": 0.0, "uJx": 0.0, "uJy": 0.0, "rJz": 0.0,
                    "scale": 1.0, "length": 5.0, "hingeStart": false, "hingeEnd": false,
                    "ei": 20_000.0, "loadCouples": [[a, c]]
                });
                let raw = crate::compute_deformed_shape(&input.to_string()).unwrap();
                let points: serde_json::Value = serde_json::from_str(&raw).unwrap();
                for i in 0..21 {
                    let x = i as f64 / 4.0;
                    let actual = points[i]["y"].as_f64().unwrap();
                    assert!((actual - expected(x, a, c).0).abs() < 2e-13, "a={a}, c={c}, x={x}: {actual} vs {:?}", expected(x, a, c));
                }
            }
        }
    }

    #[test]
    fn section_rotation_and_deflection_already_include_couples() {
        for a in [0.0, 0.000005, 2.0, 2.5, 4.999995, 5.0] {
            for c in [-6.0, 6.0] {
                let plane = SpanRotation::new(5.0, 20_000.0, 0.0, 0.0, 0.0, 0.0, 0.0, false, false, vec![], vec![], vec![(a, c)], 0.0);
                for i in 0..21 {
                    let x = i as f64 / 4.0;
                    let (v, r) = expected(x, a, c);
                    assert!((plane.at(x) - r).abs() < 2e-13);
                    assert!((plane.deflection(x) - v).abs() < 2e-13);
                }
            }
        }
    }
    #[test]
    fn split_nodal_couples_recover_both_3d_planes_linear_and_pdelta() {
        for (plane, my, mz) in [(0, 0.0, 6.0), (1, -6.0, 0.0)] {
            for a in [0.05, 1.0, 2.0, 4.0, 4.95] {
                let mut model: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/reaction-recovery-3d.json")).unwrap();
                model["nodes"]["1"]["x"] = 5.0.into();
                model["nodes"]["2"] = serde_json::json!({"id": 2, "x": a, "y": 0.0, "z": 0.0});
                model["supports"]["1"] = serde_json::json!({"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
                model["elements"]["1"]["nodeJ"] = 2.into();
                model["elements"]["2"] = serde_json::json!({"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 1, "materialId": 1, "sectionId": 1});
                model["loads"] = serde_json::json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": my, "mz": mz}}]);
                let model: SolverInput3D = serde_json::from_value(model).unwrap();
                let linear = crate::solver::linear::solve_3d(&model).unwrap();
                let nonlinear = crate::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-10).unwrap();
                assert!(nonlinear.converged);
                for r in [linear, nonlinear.results] {
                    let d = |id| r.displacements.iter().find(|d| d.node_id == id).unwrap();
                    for (i, j, x0, length) in [(0, 2, 0.0, a), (2, 1, a, 5.0 - a)] {
                        let end = |id| { let d = d(id); if plane == 0 { (d.uy, d.rz) } else { (d.uz, -d.ry) } };
                        let ((vi, ri), (vj, rj)) = (end(i), end(j));
                        let span = SpanRotation::new(length, 20_000.0, 0.0, vi, ri, vj, rj, false, false, vec![], vec![], vec![], 0.0);
                        for k in 0..21 {
                            let x = length * k as f64 / 20.0;
                            let (v, rotation) = expected(x0 + x, a, 6.0);
                            assert!((span.deflection(x) - v).abs() < 2e-13);
                            assert!((span.at(x) - rotation).abs() < 2e-13);
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn no_couple_shapes_are_identical_to_parent_build() {
        let baseline: serde_json::Value = serde_json::from_str(include_str!("../../../docs/results-changes/2143-no-couple-shapes.json")).unwrap();
        for case in baseline["cases"].as_array().unwrap() {
            let actual: serde_json::Value = serde_json::from_str(&crate::compute_deformed_shape(&case["input"].to_string()).unwrap()).unwrap();
            assert_eq!(actual, case["expected"]);
        }
    }

    #[test]
    fn linear_and_pdelta_2d_results_keep_the_member_couple_in_recovery() {
        let mut model: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/reaction-recovery-2d.json")).unwrap();
        model["nodes"]["1"]["x"] = 5.0.into();
        model["nodes"]["2"] = serde_json::json!({"id": 2, "x": 0.0, "z": 1.0});
        model["elements"]["2"] = serde_json::json!({"id": 2, "type": "frame", "nodeI": 0, "nodeJ": 2, "materialId": 1, "sectionId": 1});
        model["supports"]["1"] = serde_json::json!({"id": 1, "nodeId": 1, "type": "fixed"});
        model["loads"] = serde_json::json!([{"type": "pointOnElement", "data": {"elementId": 1, "a": 2.0, "p": 0.0, "my": 6.0}}]);
        let model: SolverInput = serde_json::from_value(model).unwrap();
        let linear = crate::solver::linear::solve_2d(&model).unwrap();
        let nonlinear = crate::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-10).unwrap();
        assert!(nonlinear.converged);
        for result in [linear, nonlinear.results] {
            let ef = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();
            assert_eq!(ef.point_loads[0].my, Some(6.0));
            let recovered = recover_member(&MemberRecoveryInput {
                space: RecoverySpace::Planar,
                length: 5.0, ei: Some(20_000.0), gas: None, v_i: 0.0, r_i: 0.0, v_j: 0.0, r_j: 0.0,
                hinge_start: false, hinge_end: false, points: ef.point_loads.clone(), dist: ef.distributed_loads.clone(),
                positions: (0..21).map(|k| k as f64 / 20.0).collect(),
            }).unwrap();
            for (k, sample) in recovered.iter().enumerate() {
                let (v, r) = expected(k as f64 / 4.0, 2.0, 6.0);
                assert!((sample.v - v).abs() < 2e-13);
                assert!((sample.rotation - r).abs() < 2e-13);
            }
        }
    }

    #[test]
    fn loaded_recovery_refuses_missing_or_below_limit_stiffness() {
        for ei in [None, Some(0.0), Some(1e-6 * (1.0 - 1e-6)), Some(1e-6), Some(1e-6 * (1.0 + 1e-6))] {
            let mut input = MemberRecoveryInput {
                space: RecoverySpace::Planar,
                length: 5.0, ei, gas: None, v_i: 0.0, r_i: 0.0, v_j: 0.0, r_j: 0.0,
                hinge_start: false, hinge_end: false,
                points: vec![PointLoadInfo { a: 2.0, p: 0.0, px: None, my: Some(6e-10) }], dist: vec![], positions: vec![0.2],
            };
            assert_eq!(recover_member(&input).is_ok(), ei.is_some_and(|e| e > 1e-6));
            input.points.clear();
            assert_eq!(recover_member(&input).unwrap()[0].v, 0.0);
        }
    }

    #[test]
    fn spatial_recovery_keeps_positive_ei_below_planar_cutoff_2143() {
        for ei in [1e-12, 5e-7, 1e-6, 1.000001e-6] {
            let input: MemberRecoveryInput = serde_json::from_value(serde_json::json!({
                "length": 5.0, "ei": ei, "space": "spatial", "vI": 0.0, "rI": 0.0, "vJ": 0.0, "rJ": 0.0,
                "hingeStart": false, "hingeEnd": false, "points": [],
                "dist": [{"qI": -ei * 1e-4, "qJ": -ei * 1e-4, "a": 0.0, "b": 5.0}], "positions": [0.5]
            })).unwrap();
            let result = recover_member(&input).unwrap();
            let expected = -1e-4 * 5.0_f64.powi(4) / 384.0;
            assert!((result[0].v - expected).abs() <= 1e-12 * expected.abs());
        }
    }

}

#[cfg(test)]
mod recovery_round4_2143 {
    use super::*;

    #[test]
    fn spatial_loaded_recovery_accepts_positive_stiffness_in_both_solvers_and_planes() {
        for ei in [5e-7, 1e-6, 1.000001e-6] {
            for plane in [0, 1] {
                let mut model: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/reaction-recovery-3d.json")).unwrap();
                model["nodes"]["1"]["x"] = 5.0.into();
                model["sections"]["1"]["iy"] = (ei / 200_000_000.0).into();
                model["sections"]["1"]["iz"] = (ei / 200_000_000.0).into();
                let q = -ei * 1e-4;
                model["loads"] = serde_json::json!([{"type": "distributed", "data": {
                    "elementId": 1, "qYI": if plane == 0 { q } else { 0.0 }, "qYJ": if plane == 0 { q } else { 0.0 },
                    "qZI": if plane == 1 { q } else { 0.0 }, "qZJ": if plane == 1 { q } else { 0.0 }
                }}]);
                let model: SolverInput3D = serde_json::from_value(model).unwrap();
                let linear = crate::solver::linear::solve_3d(&model).unwrap();
                let nonlinear = crate::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-10).unwrap();
                assert!(nonlinear.converged);
                for r in [linear, nonlinear.results] {
                    let tip = r.displacements.iter().find(|d| d.node_id == 1).unwrap();
                    let ef = &r.element_forces[0];
                    let (v, rotation, dist) = if plane == 0 { (tip.uy, tip.rz, &ef.distributed_loads_y) }
                        else { (tip.uz, -tip.ry, &ef.distributed_loads_z) };
                    let input: MemberRecoveryInput = serde_json::from_value(serde_json::json!({
                        "space": "spatial", "length": 5.0, "ei": ei, "vI": 0.0, "rI": 0.0, "vJ": v, "rJ": rotation,
                        "dist": dist, "positions": [0.25, 0.5, 0.75]
                    })).unwrap();
                    for (k, d) in recover_member(&input).unwrap().iter().enumerate() {
                        let x = 5.0 * (k + 1) as f64 / 4.0;
                        let expected = q * x * x * (150.0 - 20.0 * x + x * x) / (24.0 * ei);
                        assert!((d.v - expected).abs() <= 1e-12 * expected.abs());
                    }
                }
            }
        }
    }

    #[test]
    fn planar_raw_curve_and_shape_share_shear_recovery_in_both_solvers() {
        for gas in [None, Some(20_000.0)] {
            let mut model: serde_json::Value = serde_json::from_str(include_str!("../../tests/fixtures/reaction-recovery-2d.json")).unwrap();
            model["nodes"]["1"]["x"] = 5.0.into();
            if let Some(gas) = gas { model["sections"]["1"]["asY"] = (gas * 2.6 / 200_000_000.0).into(); }
            model["loads"] = serde_json::json!([{"type": "nodal", "data": {"nodeId": 1, "fx": 0.0, "fz": 1.0, "my": 0.0}}]);
            let model: SolverInput = serde_json::from_value(model).unwrap();
            let linear = crate::solver::linear::solve_2d(&model).unwrap();
            let nonlinear = crate::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-10).unwrap();
            assert!(nonlinear.converged);
            for r in [linear, nonlinear.results] {
                let tip = r.displacements.iter().find(|d| d.node_id == 1).unwrap();
                let positions: Vec<_> = (0..21).map(|k| k as f64 / 20.0).collect();
                for offset in [0.0, 4.0, 1e6] {
                    let mut input = serde_json::json!({
                        "nodeIx": 0.0, "nodeIy": offset, "nodeJx": 5.0, "nodeJy": offset,
                        "uIx": 0.0, "uIy": 0.0, "rIz": 0.0, "uJx": tip.ux, "uJy": tip.uz, "rJz": tip.ry,
                        "length": 5.0, "ei": 20_000.0, "gas": gas, "scale": 1.0, "hingeStart": false, "hingeEnd": false,
                        "positions": positions, "displacementsOnly": true
                    });
                    let raw: Vec<serde_json::Value> = serde_json::from_str(&crate::compute_deformed_shape(&input.to_string()).unwrap()).unwrap();
                    input["displacementsOnly"] = false.into();
                    let drawn: Vec<DeformedPoint> = serde_json::from_str(&crate::compute_deformed_shape(&input.to_string()).unwrap()).unwrap();
                    for (k, (d, p)) in raw.iter().zip(drawn).enumerate() {
                        let x = 5.0 * positions[k];
                        let v = x * x * (15.0 - x) / 120_000.0 + gas.map_or(0.0, |g| x / g);
                        let rotation = x * (10.0 - x) / 40_000.0;
                        let actual = d["uz"].as_f64().unwrap();
                        assert!((actual - v).abs() <= 1e-12 * v.abs());
                        assert!((d["ry"].as_f64().unwrap() - rotation).abs() <= 1e-12 * rotation.abs());
                        assert_eq!(p.y, offset + actual);
                    }
                }
            }
        }
    }
    #[test]
    fn spatial_recovery_refuses_missing_nonpositive_and_nonfinite_loaded_stiffness() {
        for ei in [None, Some(0.0), Some(-1e-12), Some(f64::NAN), Some(f64::INFINITY), Some(f64::NEG_INFINITY)] {
            let mut input: MemberRecoveryInput = serde_json::from_value(serde_json::json!({
                "space": "spatial", "length": 5.0, "vI": 0.0, "rI": 0.0, "vJ": 0.0, "rJ": 0.0,
                "points": [{"a": 2.0, "p": 1.0}], "positions": [0.5]
            })).unwrap();
            input.ei = ei;
            assert!(recover_member(&input).is_err());
            input.points.clear();
            let unloaded = recover_member(&input).unwrap();
            assert_eq!(unloaded[0].v, 0.0);
            assert_eq!(unloaded[0].rotation, 0.0);
        }
    }

    #[test]
    fn scalar_span_loads_are_preserved_on_both_sides_of_the_legacy_filter() {
        for q in [-1.000001e-10, -1e-10, -9.99999e-11, 0.0] {
            let input = serde_json::json!({
                "nodeIx": 0.0, "nodeIy": 0.0, "nodeJx": 5.0, "nodeJy": 0.0,
                "uIx": 0.0, "uIy": 0.0, "rIz": 0.0, "uJx": 0.0, "uJy": 0.0, "rJz": 0.0,
                "scale": 1.0, "length": 5.0, "hingeStart": false, "hingeEnd": false,
                "ei": 20_000.0, "loadQi": q, "loadQj": q
            });
            let raw: Vec<DeformedPoint> = serde_json::from_str(&crate::compute_deformed_shape(&input.to_string()).unwrap()).unwrap();
            let expected = q * 5.0_f64.powi(4) / (384.0 * 20_000.0);
            assert!((raw[10].y - expected).abs() <= 1e-12 * expected.abs().max(1e-12));
        }
    }

}


pub fn validate_diagram_loads_2d(ef: &ElementForces) -> Result<(), String> {
    for d in ef.distributed_loads.iter().chain(&ef.distributed_loads_x) {
        crate::element::validate_member_load_interval(format_args!("Element {}", ef.element_id), ef.length, d.a, d.b)?;
    }
    Ok(())
}

pub fn validate_diagram_input_2d(ef: &ElementForces) -> Result<(), String> {
    crate::boundary::require_finite(ef)?;
    validate_diagram_loads_2d(ef)
}
