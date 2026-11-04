/// Pre-processing utility that subdivides a circular arc (defined by 3 points)
/// into N straight frame elements, analogous to SAP2000's auto-mesh for curved frames.

use crate::types::CurvedBeamInput;

/// Most straight segments one curved beam may be split into. The count comes
/// from the model file, and the expansion allocates nodes and elements for each
/// segment, so an unbounded count lets one number exhaust memory.
pub const MAX_CURVED_BEAM_SEGMENTS: usize = 1_000;

/// Most segments all curved beams of one model may add together.
pub const MAX_CURVED_BEAM_SEGMENTS_TOTAL: usize = 200_000;

/// Check that `beams` can be expanded: each segment count within
/// `MAX_CURVED_BEAM_SEGMENTS`, their sum within `MAX_CURVED_BEAM_SEGMENTS_TOTAL`,
/// and the node and element ids the expansion assigns after `max_node_id` and
/// `max_elem_id` representable (they would otherwise wrap around and collide
/// with existing ids).
pub fn check_curved_beam_sizes(
    beams: &[CurvedBeamInput],
    max_node_id: usize,
    max_elem_id: usize,
) -> Result<(), String> {
    let mut total = 0usize;
    for (i, cb) in beams.iter().enumerate() {
        if cb.num_segments > MAX_CURVED_BEAM_SEGMENTS {
            return Err(format!(
                "Curved beam {}: numSegments {} exceeds the maximum of {}",
                i, cb.num_segments, MAX_CURVED_BEAM_SEGMENTS
            ));
        }
        total += cb.num_segments.max(1);
    }
    if total > MAX_CURVED_BEAM_SEGMENTS_TOTAL {
        return Err(format!(
            "Curved beams: {} segments in total exceed the maximum of {}",
            total, MAX_CURVED_BEAM_SEGMENTS_TOTAL
        ));
    }
    let room = total + 1;
    if max_node_id.checked_add(room).is_none() || max_elem_id.checked_add(room).is_none() {
        return Err("Curved beams: node or element ids too large to expand".to_string());
    }
    Ok(())
}

/// Result of expanding a single curved beam into straight segments.
pub struct CurvedBeamExpansion {
    /// Intermediate nodes created along the arc: (id, x, y, z).
    pub new_nodes: Vec<(usize, f64, f64, f64)>,
    /// Straight frame elements: (id, node_i, node_j, mat_id, sec_id, hinge_start, hinge_end).
    pub new_elements: Vec<(usize, usize, usize, usize, usize, bool, bool)>,
    /// How every segment orients its section (None for the straight fallback,
    /// whose segments are one straight member and keep the default axes).
    pub section_frame: Option<ArcSectionFrame>,
}

/// The section orientation of an arc, the same on every segment relative to the curve.
///
/// A curved member is one bar bent in its plane: its section does not roll
/// along it. So every segment takes local y = a·n + b·(n × ex), with n the
/// unit normal of the arc's plane and ex the segment's axis (in the plane): the
/// angle between local y and the plane normal is the same on every segment.
///
/// (a, b) are chosen so that the segment at the middle of the arc gets the
/// axes the default rule gives a straight member along the arc's tangent there
/// (local z = global up projected off the axis). A plan curve therefore keeps
/// local z vertical on every segment, as before, and an arch keeps local y
/// normal to its plane on every segment — including the near-vertical ones at
/// its springings, which the default rule (it switches to a global-X reference
/// within 2.56° of vertical) used to turn by 90° outside the X–Z plane,
/// swapping Iy and Iz on them (#418, SP-15). Rotating the whole model about the
/// vertical turns these axes with it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ArcSectionFrame {
    /// Unit normal of the arc's plane.
    pub normal: [f64; 3],
    /// Component of local y along `normal`.
    pub a: f64,
    /// Component of local y along `normal × ex`.
    pub b: f64,
}

impl ArcSectionFrame {
    /// The local-y reference of a segment from `p_i` to `p_j` (on the arc's plane, up to
    /// round-off): a unit vector perpendicular to the segment.
    pub fn local_y(&self, p_i: [f64; 3], p_j: [f64; 3]) -> [f64; 3] {
        let n = self.normal;
        let d = sub(p_j, p_i);
        // Off-plane drift (round-off, a snapped node) removed, so local y stays ⊥ ex.
        let ex = sub(d, scale(n, dot(d, n)));
        let l = norm(ex);
        if l < 1e-300 {
            return n;
        }
        let m = cross(n, scale(ex, 1.0 / l));
        let y = [self.a * n[0] + self.b * m[0], self.a * n[1] + self.b * m[1], self.a * n[2] + self.b * m[2]];
        // Exactly perpendicular to the actual segment, should it leave the plane by round-off.
        let dh = scale(d, 1.0 / norm(d));
        let y = sub(y, scale(dh, dot(y, dh)));
        scale(y, 1.0 / norm(y))
    }

    /// The frame for an arc of plane normal `n` whose tangent at its middle is `t_mid` (units).
    fn new(n: [f64; 3], t_mid: [f64; 3]) -> Self {
        if t_mid[2].abs() > 0.999 {
            // The default rule's own near-vertical branch depends on the plan
            // orientation; a plane holding a vertical tangent is vertical, and an
            // arch in a vertical plane has local y along the plane normal.
            return ArcSectionFrame { normal: n, a: 1.0, b: 0.0 };
        }
        let e0 = crate::element::transform::default_ey_ref(&t_mid);
        let m = cross(n, t_mid);
        let (a, b) = (dot(e0, n), dot(e0, m));
        let l = (a * a + b * b).sqrt();
        ArcSectionFrame { normal: n, a: a / l, b: b / l }
    }
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

    // Tangent at the middle of the sweep, in the direction of travel.
    let theta_mid = 0.5 * (angle_end - angle_start);
    let dir = if angle_end >= angle_start { 1.0 } else { -1.0 };
    let t_mid = [
        dir * (-theta_mid.sin() * u_axis[0] + theta_mid.cos() * v_axis[0]),
        dir * (-theta_mid.sin() * u_axis[1] + theta_mid.cos() * v_axis[1]),
        dir * (-theta_mid.sin() * u_axis[2] + theta_mid.cos() * v_axis[2]),
    ];

    CurvedBeamExpansion {
        new_nodes,
        new_elements,
        section_frame: Some(ArcSectionFrame::new(n_hat, t_mid)),
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
        section_frame: None,
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
