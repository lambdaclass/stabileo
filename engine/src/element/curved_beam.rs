/// Pre-processing utility that subdivides a circular arc (defined by 3 points)
/// into N straight frame elements, analogous to SAP2000's auto-mesh for curved frames.
use crate::types::CurvedBeamInput;

/// Result of expanding a single curved beam into straight segments.
pub struct CurvedBeamExpansion {
    /// Intermediate nodes created along the arc: (id, x, y, z).
    pub new_nodes: Vec<(usize, f64, f64, f64)>,
    /// Straight frame elements: (id, node_i, node_j, mat_id, sec_id, hinge_start, hinge_end).
    pub new_elements: Vec<(usize, usize, usize, usize, usize, bool, bool)>,
}

/// Expand a curved beam definition into straight frame segments.
///
/// # Arguments
/// * `input` – the curved beam parameters (node ids, material, section, hinges, segment count)
/// * `p_start` – (x, y, z) coordinates of node_start
/// * `p_mid`   – (x, y, z) coordinates of node_mid (a point on the arc, not necessarily the midpoint)
/// * `p_end`   – (x, y, z) coordinates of node_end
/// * `next_node_id` – first available node id for newly created intermediate nodes
/// * `next_elem_id` – first available element id for newly created elements
pub fn expand_curved_beam(
    input: &CurvedBeamInput,
    p_start: [f64; 3],
    p_mid: [f64; 3],
    p_end: [f64; 3],
    next_node_id: usize,
    next_elem_id: usize,
) -> CurvedBeamExpansion {
    let n = input.num_segments.max(1);

    // ---------- fit circle through 3 points in 3D ----------

    // Vectors from start to mid and start to end.
    let ab = sub(p_mid, p_start);
    let ac = sub(p_end, p_start);

    // Normal to the plane defined by the three points.
    let normal = cross(ab, ac);
    let normal_len = norm(normal);

    // Degenerate (collinear) points – fall back to a straight line.
    if normal_len < 1e-14 {
        return expand_straight(input, p_start, p_end, n, next_node_id, next_elem_id);
    }

    let n_hat = scale(normal, 1.0 / normal_len);

    // Midpoints of segments start-mid and start-end.
    let m_ab = midpoint(p_start, p_mid);
    let m_ac = midpoint(p_start, p_end);

    // Perpendicular bisector directions (lie in the plane).
    let d_ab = cross(ab, n_hat);
    let d_ac = cross(ac, n_hat);

    // Find center: m_ab + s * d_ab == m_ac + t * d_ac
    // Solve for s using the component with the largest magnitude to avoid division by near-zero.
    let rhs = sub(m_ac, m_ab);
    let center = intersect_lines(m_ab, d_ab, m_ac, d_ac, rhs);

    let radius = dist(center, p_start);

    // ---------- local 2D coordinate system in the arc plane ----------

    // u-axis: center -> start (unit)
    let u_axis = scale(sub(p_start, center), 1.0 / radius);
    // v-axis: n_hat x u_axis (right-hand rule within the plane)
    let v_axis = cross(n_hat, u_axis);

    let angle_start = 0.0_f64; // by construction
    let angle_end = angle_of(sub(p_end, center), u_axis, v_axis);
    let angle_mid = angle_of(sub(p_mid, center), u_axis, v_axis);

    // Ensure the arc passes through p_mid. If angle_mid is not between
    // angle_start (0) and angle_end when traversing in the chosen direction,
    // we go the long way around.
    let angle_end = fix_arc_direction(angle_mid, angle_end);

    // ---------- generate points along the arc ----------

    let mut new_nodes: Vec<(usize, f64, f64, f64)> = Vec::with_capacity(n.saturating_sub(1));
    let mut arc_node_ids: Vec<usize> = Vec::with_capacity(n + 1);

    arc_node_ids.push(input.node_start);

    for i in 1..n {
        let t = i as f64 / n as f64;
        let theta = angle_start + t * (angle_end - angle_start);
        let cos_t = theta.cos();
        let sin_t = theta.sin();

        let x = center[0] + radius * (cos_t * u_axis[0] + sin_t * v_axis[0]);
        let y = center[1] + radius * (cos_t * u_axis[1] + sin_t * v_axis[1]);
        let z = center[2] + radius * (cos_t * u_axis[2] + sin_t * v_axis[2]);

        let nid = next_node_id + (i - 1);
        new_nodes.push((nid, x, y, z));
        arc_node_ids.push(nid);
    }

    arc_node_ids.push(input.node_end);

    // ---------- create frame elements ----------

    let mut new_elements: Vec<(usize, usize, usize, usize, usize, bool, bool)> =
        Vec::with_capacity(n);

    for i in 0..n {
        let eid = next_elem_id + i;
        let ni = arc_node_ids[i];
        let nj = arc_node_ids[i + 1];
        let hs = if i == 0 { input.hinge_start } else { false };
        let he = if i == n - 1 { input.hinge_end } else { false };
        new_elements.push((eid, ni, nj, input.material_id, input.section_id, hs, he));
    }

    CurvedBeamExpansion {
        new_nodes,
        new_elements,
    }
}

// ==================== helpers ====================

/// Fallback when the three points are collinear: linearly interpolate.
fn expand_straight(
    input: &CurvedBeamInput,
    p_start: [f64; 3],
    p_end: [f64; 3],
    n: usize,
    next_node_id: usize,
    next_elem_id: usize,
) -> CurvedBeamExpansion {
    let mut new_nodes = Vec::with_capacity(n.saturating_sub(1));
    let mut arc_node_ids = Vec::with_capacity(n + 1);

    arc_node_ids.push(input.node_start);

    for i in 1..n {
        let t = i as f64 / n as f64;
        let x = p_start[0] + t * (p_end[0] - p_start[0]);
        let y = p_start[1] + t * (p_end[1] - p_start[1]);
        let z = p_start[2] + t * (p_end[2] - p_start[2]);
        let nid = next_node_id + (i - 1);
        new_nodes.push((nid, x, y, z));
        arc_node_ids.push(nid);
    }

    arc_node_ids.push(input.node_end);

    let mut new_elements = Vec::with_capacity(n);
    for i in 0..n {
        let eid = next_elem_id + i;
        let ni = arc_node_ids[i];
        let nj = arc_node_ids[i + 1];
        let hs = if i == 0 { input.hinge_start } else { false };
        let he = if i == n - 1 { input.hinge_end } else { false };
        new_elements.push((eid, ni, nj, input.material_id, input.section_id, hs, he));
    }

    CurvedBeamExpansion {
        new_nodes,
        new_elements,
    }
}

#[inline]
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn norm(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}

#[inline]
fn scale(a: [f64; 3], s: f64) -> [f64; 3] {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline]
fn midpoint(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        0.5 * (a[0] + b[0]),
        0.5 * (a[1] + b[1]),
        0.5 * (a[2] + b[2]),
    ]
}

#[inline]
fn dist(a: [f64; 3], b: [f64; 3]) -> f64 {
    norm(sub(a, b))
}

/// Signed angle of vector `v` in the local (u, v) coordinate system, in radians.
fn angle_of(v: [f64; 3], u_axis: [f64; 3], v_axis: [f64; 3]) -> f64 {
    let cu = dot(v, u_axis);
    let cv = dot(v, v_axis);
    cv.atan2(cu)
}

/// Ensure `angle_end` is on the same side of 0 as `angle_mid` so the arc
/// passes through the mid-point. Both angles are relative to angle_start = 0.
fn fix_arc_direction(angle_mid: f64, angle_end: f64) -> f64 {
    use std::f64::consts::TAU;

    // Normalise both into (-PI, PI] – atan2 already does this, but be safe.
    let mid = ((angle_mid % TAU) + TAU) % TAU; // [0, TAU)
    let end = ((angle_end % TAU) + TAU) % TAU;

    // If mid is between 0 and end (both going the same way), we are fine.
    if mid > 0.0 && end > 0.0 && mid < end {
        return end;
    }
    if mid < 0.0 && end < 0.0 && mid > end {
        return end;
    }

    // Otherwise go the other way around.
    if end > 0.0 {
        end - TAU
    } else {
        end + TAU
    }
}

/// Find the intersection of two lines in 3D that are coplanar:
///   P = origin_a + s * dir_a
///   P = origin_b + t * dir_b
/// Returns the intersection point.
fn intersect_lines(
    origin_a: [f64; 3],
    dir_a: [f64; 3],
    _origin_b: [f64; 3],
    dir_b: [f64; 3],
    rhs: [f64; 3], // origin_b - origin_a
) -> [f64; 3] {
    // Solve  s * dir_a - t * dir_b = rhs  using the two equations with
    // the largest coefficients to avoid numerical issues.
    // This is a 2-unknown system; pick the two rows that give the best pivot.
    let a11 = dir_a[0];
    let a12 = -dir_b[0];
    let b1 = rhs[0];
    let a21 = dir_a[1];
    let a22 = -dir_b[1];
    let b2 = rhs[1];
    let a31 = dir_a[2];
    let a32 = -dir_b[2];
    let b3 = rhs[2];

    // Try all three pairs and pick the one with the largest determinant.
    let det_01 = a11 * a22 - a12 * a21;
    let det_02 = a11 * a32 - a12 * a31;
    let det_12 = a21 * a32 - a22 * a31;

    let (det, s) = if det_01.abs() >= det_02.abs() && det_01.abs() >= det_12.abs() {
        (det_01, (b1 * a22 - a12 * b2) / det_01)
    } else if det_02.abs() >= det_12.abs() {
        (det_02, (b1 * a32 - a12 * b3) / det_02)
    } else {
        (det_12, (b2 * a32 - a22 * b3) / det_12)
    };

    // Guard against degenerate case (should not happen if normal_len > 0).
    if det.abs() < 1e-30 {
        return midpoint(origin_a, [
            origin_a[0] + rhs[0],
            origin_a[1] + rhs[1],
            origin_a[2] + rhs[2],
        ]);
    }

    [
        origin_a[0] + s * dir_a[0],
        origin_a[1] + s * dir_a[1],
        origin_a[2] + s * dir_a[2],
    ]
}
