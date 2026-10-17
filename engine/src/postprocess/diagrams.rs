use crate::types::*;
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

// ==================== Sampling ====================

fn build_sampling_positions(
    length: f64,
    point_loads: &[PointLoadInfo],
) -> Vec<f64> {
    let mut positions = std::collections::BTreeSet::new();

    // Regular grid
    for i in 0..NUM_POINTS {
        let t = i as f64 / (NUM_POINTS - 1) as f64;
        // Use integer-keyed representation to avoid f64 in BTreeSet
        positions.insert((t * 1e12) as i64);
    }

    // Around point loads
    let eps = 1e-6;
    for pl in point_loads {
        let t_pl = pl.a / length;
        if t_pl > eps {
            positions.insert(((t_pl - eps) * 1e12) as i64);
        }
        positions.insert((t_pl * 1e12) as i64);
        if t_pl < 1.0 - eps {
            positions.insert(((t_pl + eps) * 1e12) as i64);
        }
    }

    positions.into_iter().map(|k| k as f64 / 1e12).collect()
}

/// The stations (t ∈ [0, 1]) at which `compute_diagrams_2d` samples diagram
/// `kind` of one member: a regular grid of 21, plus each point load's position
/// and its ±1e-6 neighbours (the axial diagram only when it has axial point
/// loads). The certified gaps between stations (`certify::stations`) use this.
pub fn diagram_positions_2d(ef: &ElementForces, kind: &str) -> Vec<f64> {
    let has_axial_pl = ef.point_loads.iter().any(|pl| pl.px.is_some_and(|px| px.abs() > 1e-15));
    if kind == "axial" && !has_axial_pl {
        (0..NUM_POINTS).map(|i| i as f64 / (NUM_POINTS - 1) as f64).collect()
    } else {
        build_sampling_positions(ef.length, &ef.point_loads)
    }
}

// ==================== Diagram Value At ====================

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
    let xi = t * ef.length;

    let v_start = ef.v_start;
    let m_start = ef.m_start;

    // Both non-first branches of the original expression were `Vec::new()`, so
    // the whole thing collapsed to "iterate the slice" — but it allocated a Vec
    // of references on *every* station evaluation, which in the envelope path is
    // elements x 21 stations x load cases x diagram kinds allocations.
    let d_loads = &ef.distributed_loads;
    let use_legacy_q = ef.distributed_loads.is_empty() && (ef.q_i.abs() > 1e-10 || ef.q_j.abs() > 1e-10);

    match kind {
        "moment" => {
            let mut value = m_start - v_start * xi;

            // Distributed load contributions
            if use_legacy_q {
                let dq = ef.q_j - ef.q_i;
                value -= ef.q_i * xi * xi / 2.0 + dq * xi * xi * xi / (6.0 * ef.length);
            }
            for dl in d_loads {
                if xi > dl.a + 1e-10 {
                    let x_end = xi.min(dl.b);
                    let s = x_end - dl.a;
                    let span = dl.b - dl.a;
                    if span < 1e-12 || s < 1e-12 { continue; }
                    let dq = (dl.q_j - dl.q_i) / span;
                    let d = xi - dl.a;
                    value -= dl.q_i * (d * s - s * s / 2.0)
                           + dq * (d * s * s / 2.0 - s * s * s / 3.0);
                }
            }

            // Point loads
            for pl in sorted_pl {
                if pl.a < xi - 1e-10 {
                    value -= pl.p * (xi - pl.a);
                    // With m(x) = m_start − v_start·x and P entering as
                    // −P·(x − a), equilibrium of the piece left of x puts a
                    // counter-clockwise couple in with a PLUS: past a couple
                    // on a cantilever the moment must fall back to zero.
                    if let Some(mz) = pl.my {
                        value += mz;
                    }
                }
            }
            value
        }
        "shear" => {
            let mut value = v_start;

            if use_legacy_q {
                let dq = ef.q_j - ef.q_i;
                value += ef.q_i * xi + dq * xi * xi / (2.0 * ef.length);
            }
            for dl in d_loads {
                if xi > dl.a + 1e-10 {
                    let x_end = xi.min(dl.b);
                    let s = x_end - dl.a;
                    let span = dl.b - dl.a;
                    if span < 1e-12 || s < 1e-12 { continue; }
                    let dq = (dl.q_j - dl.q_i) / span;
                    value += dl.q_i * s + dq * s * s / 2.0;
                }
            }

            for pl in sorted_pl {
                if pl.a < xi - 1e-10 {
                    value += pl.p;
                }
            }
            value
        }
        "axial" => {
            // Axial force is piecewise constant with jumps at concentrated axial
            // loads. `n_start` already is the internal force at node I; each load
            // px at a<x changes the constant level by -px. Do NOT interpolate
            // n_start -> n_end here: n_end already accounts for all px via
            // equilibrium, so interpolating would double-count the jumps.
            let mut value = ef.n_start;
            for pl in sorted_pl {
                if let Some(px) = pl.px {
                    if pl.a < xi - 1e-10 {
                        value -= px;
                    }
                }
            }
            value
        }
        _ => 0.0,
    }
}

// ==================== 2D Diagrams ====================

fn compute_single_diagram(
    kind: &str,
    ef: &ElementForces,
    geom: (f64, f64, f64, f64),
    positions: &[f64],
    sorted_pl: &[PointLoadInfo],
) -> ElementDiagram {
    let (node_ix, node_iy, node_jx, node_jy) = geom;

    let mut points = Vec::with_capacity(positions.len());
    let mut max_val = f64::NEG_INFINITY;
    let mut min_val = f64::INFINITY;
    let mut max_abs_t = 0.0;
    let mut max_abs_value: f64 = 0.0;

    for &t in positions {
        let value = compute_diagram_value_at_sorted(kind, t, ef, sorted_pl);
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

    ElementDiagram {
        element_id: ef.element_id,
        points,
        max_value: max_val,
        min_value: min_val,
        max_abs_t,
        max_abs_value,
    }
}

/// Compute all 2D diagrams (M, V, N) for all elements.
pub fn compute_diagrams_2d(
    input: &SolverInput,
    results: &AnalysisResults,
) -> DiagramResults {
    let mut moment = Vec::new();
    let mut shear = Vec::new();
    let mut axial = Vec::new();

    // O(1) lookups once — the per-element .values().find() scans made this
    // O(E·(E+N)) per call on big models.
    let elem_by_id: std::collections::HashMap<usize, &crate::types::SolverElement> =
        input.elements.values().map(|e| (e.id, e)).collect();
    let node_by_id: std::collections::HashMap<usize, &crate::types::SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();

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
            let positions = &diagram_positions_2d(ef, kind);
            out.push(compute_single_diagram(kind, ef, geom, positions, &sorted_pl));
        }
    }

    DiagramResults { moment, shear, axial }
}

// ==================== Deformed Shape ====================

/// Transverse deflection of a loaded 2D member, exact for Euler–Bernoulli
/// (`flex_s = 0`) and Timoshenko (`flex_s = 1/(G·As)`) beams.
///
/// With m = EI·ψ' (sagging), s = m', s' = q and v' = ψ − s/(G·As), integrating
/// from node i gives, for loads with moment m_q and shear s_q of their own
/// (zero at x = 0):
///   m(x) = m0 + s0·x + m_q(x)
///   ψ(x) = θ_i + (m0·x + s0·x²/2 + ∫₀ˣ m_q)/EI
///   v(x) = v_i + θ_i·x + (m0·x²/2 + s0·x³/6 + ∫₀ˣ(x − t)·m_q)/EI − (s0·x + m_q(x))/(G·As)
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
    points: Vec<(f64, f64)>,
    dist: Vec<(f64, f64, f64, f64)>,
}

impl MemberDeflection {
    /// (m_q(x), ∫₀ˣ m_q, ∫₀ˣ (x − t) m_q(t) dt) of the member loads.
    fn load_terms(&self, x: f64) -> [f64; 3] {
        let mut out = [0.0; 3];
        let mut add = |p: f64, d: f64| {
            if d > 0.0 {
                out[0] += p * d;
                out[1] += p * d * d / 2.0;
                out[2] += p * d * d * d / 6.0;
            }
        };
        for &(a, p) in &self.points {
            add(p, x - a);
        }
        // A linear load against (x − t)^k, k ≤ 3: degree ≤ 4 in t on
        // [a, min(b, x)], so 3-point Gauss is exact.
        let g = (0.6f64).sqrt();
        for &(qi, qj, a, b) in &self.dist {
            let hi = b.min(x);
            if hi <= a || b - a < 1e-12 {
                continue;
            }
            let (half, mid) = (0.5 * (hi - a), 0.5 * (hi + a));
            for (t, w) in [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)] {
                let tt = mid + half * t;
                let q = qi + (qj - qi) * (tt - a) / (b - a);
                add(q * w * half, x - tt);
            }
        }
        out
    }

    fn new(
        l: f64, ei: f64, flex_s: f64,
        v_i: f64, r_i: f64, v_j: f64, r_j: f64,
        hinge_start: bool, hinge_end: bool,
        points: Vec<(f64, f64)>, dist: Vec<(f64, f64, f64, f64)>,
    ) -> Self {
        let mut d = MemberDeflection { ei, flex_s, v_i, theta_i: 0.0, m0: 0.0, s0: 0.0, points, dist };
        let [mql, mq1, mq2] = d.load_terms(l);
        // Unknowns x = [θ_i, m0, s0].
        let r1 = if hinge_start { ([0.0, 1.0, 0.0], 0.0) } else { ([1.0, 0.0, 0.0], r_i) };
        let r2 = (
            [l, l * l / (2.0 * ei), l * l * l / (6.0 * ei) - flex_s * l],
            v_j - v_i - mq2 / ei + flex_s * mql,
        );
        let r3 = if hinge_end {
            ([0.0, 1.0, l], -mql)
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
        let [mq, _, mq2] = self.load_terms(x);
        self.v_i
            + self.theta_i * x
            + (self.m0 * x * x / 2.0 + self.s0 * x * x * x / 6.0 + mq2) / self.ei
            - self.flex_s * (self.s0 * x + mq)
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
        let d = MemberDeflection::new(l, ei, flex_s, e[0], e[1], e[2], e[3], hinge_start, hinge_end, Vec::new(), Vec::new());
        *row = [d.v_i, d.theta_i - flex_s * d.s0, d.m0 / (2.0 * d.ei), d.s0 / (6.0 * d.ei)];
    }
    out
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
    load_points: &[(f64, f64)], // (a, p)
    dist_loads: &[(f64, f64, f64, f64)], // (qi, qj, a, b)
) -> Vec<DeformedPoint> {
    let l = length;
    let cos = (node_jx - node_ix) / l;
    let sin = (node_jy - node_iy) / l;

    // Transform to local
    let v_i = -u_ix * sin + u_iy * cos;
    let v_j = -u_jx * sin + u_jy * cos;
    let u_i = u_ix * cos + u_iy * sin;
    let u_j = u_jx * cos + u_jy * sin;

    // Build distributed loads list
    let mut all_dist: Vec<(f64, f64, f64, f64)> = Vec::new();
    if !dist_loads.is_empty() {
        all_dist.extend_from_slice(dist_loads);
    } else {
        let q0 = load_qi.unwrap_or(0.0);
        let q1 = load_qj.unwrap_or(0.0);
        if q0.abs() > 1e-10 || q1.abs() > 1e-10 {
            all_dist.push((q0, q1, 0.0, l));
        }
    }

    // Without EI the loads cannot be turned into curvature: the shape is the
    // (load-free) Hermite interpolation of the end displacements.
    let ei_val = ei.unwrap_or(0.0);
    let has_ei = ei_val > 1e-6;
    let flex_s = match gas {
        Some(k) if has_ei && k > 0.0 && k.is_finite() => 1.0 / k,
        _ => 0.0,
    };
    let member = if has_ei {
        MemberDeflection::new(
            l, ei_val, flex_s, v_i, r_iz, v_j, r_jz, hinge_start, hinge_end,
            load_points.to_vec(), all_dist,
        )
    } else {
        MemberDeflection::new(
            l, 1.0, 0.0, v_i, r_iz, v_j, r_jz, hinge_start, hinge_end, Vec::new(), Vec::new(),
        )
    };

    let n_pts = 21;
    let mut points = Vec::with_capacity(n_pts);

    for i in 0..n_pts {
        let xi = i as f64 / (n_pts - 1) as f64;
        let v_local = member.v(xi * l);

        // Axial (linear)
        let u_local = u_i + xi * (u_j - u_i);

        // Transform back to global
        let base_x = node_ix + xi * (node_jx - node_ix);
        let base_y = node_iy + xi * (node_jy - node_iy);

        let dx = u_local * cos - v_local * sin;
        let dy = u_local * sin + v_local * cos;

        points.push(DeformedPoint {
            x: base_x + dx * scale,
            y: base_y + dy * scale,
        });
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shape(
        ends: [f64; 4], hinges: (bool, bool), ei: f64, gas: Option<f64>,
        pts: &[(f64, f64)], dist: &[(f64, f64, f64, f64)], l: f64,
    ) -> Vec<f64> {
        let [v_i, r_i, v_j, r_j] = ends;
        compute_deformed_shape(
            0.0, 0.0, l, 0.0, 0.0, v_i, r_i, 0.0, v_j, r_j, 1.0, l, hinges.0, hinges.1,
            Some(ei), gas, None, None, pts, dist,
        )
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
}
