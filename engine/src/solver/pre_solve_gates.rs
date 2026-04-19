//! Pre-solve model quality gates.
//!
//! These checks run before assembly/solve and emit [`StructuredDiagnostic`]s
//! for common modelling mistakes: isolated nodes, near-duplicate nodes,
//! shell distortion, suspicious local axes, and instability risks.

use std::collections::HashSet;

use crate::element::quad::{quad_quality_metrics, quad_check_jacobian};
use crate::element::plate::plate_element_quality;
use crate::types::{SolverInput, SolverInput3D, DiagnosticCode, Severity, StructuredDiagnostic};

// ---------------------------------------------------------------------------
// Gate 1: Isolated nodes (2D)
// ---------------------------------------------------------------------------

/// Warn about nodes that are not referenced by any element.
pub fn check_isolated_nodes_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
    let mut referenced: HashSet<usize> = HashSet::new();
    for el in input.elements.values() {
        referenced.insert(el.node_i);
        referenced.insert(el.node_j);
    }
    for conn in input.connectors.values() {
        referenced.insert(conn.node_i);
        referenced.insert(conn.node_j);
    }

    let mut diags = Vec::new();
    for node in input.nodes.values() {
        if !referenced.contains(&node.id) {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::DisconnectedNode,
                    Severity::Warning,
                    format!("Node {} is isolated (not connected to any element)", node.id),
                )
                .with_nodes(vec![node.id])
                .with_phase("pre_solve"),
            );
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 2: Isolated nodes (3D)
// ---------------------------------------------------------------------------

/// Warn about nodes that are not referenced by any element (3D).
pub fn check_isolated_nodes_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut referenced: HashSet<usize> = HashSet::new();

    // Frame / truss elements
    for el in input.elements.values() {
        referenced.insert(el.node_i);
        referenced.insert(el.node_j);
    }
    // Connectors
    for conn in input.connectors.values() {
        referenced.insert(conn.node_i);
        referenced.insert(conn.node_j);
    }
    // Plates (3-node)
    for pl in input.plates.values() {
        for &nid in &pl.nodes {
            referenced.insert(nid);
        }
    }
    // Quads (4-node)
    for q in input.quads.values() {
        for &nid in &q.nodes {
            referenced.insert(nid);
        }
    }
    // Quad9s (9-node)
    for q9 in input.quad9s.values() {
        for &nid in &q9.nodes {
            referenced.insert(nid);
        }
    }
    // Solid shells (8-node)
    for ss in input.solid_shells.values() {
        for &nid in &ss.nodes {
            referenced.insert(nid);
        }
    }
    // Curved shells (4-node)
    for cs in input.curved_shells.values() {
        for &nid in &cs.nodes {
            referenced.insert(nid);
        }
    }

    let mut diags = Vec::new();
    for node in input.nodes.values() {
        if !referenced.contains(&node.id) {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::DisconnectedNode,
                    Severity::Warning,
                    format!("Node {} is isolated (not connected to any element)", node.id),
                )
                .with_nodes(vec![node.id])
                .with_phase("pre_solve"),
            );
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 3: Near-duplicate nodes (2D)
// ---------------------------------------------------------------------------

/// Warn when two nodes are closer than 1e-6 * L_char.
pub fn check_near_duplicate_nodes_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
    let nodes: Vec<_> = input.nodes.values().collect();
    let n = nodes.len();
    if n >= 10_000 {
        return vec![]; // skip O(n^2) for large models
    }

    // Characteristic length = max element length (min 1e-3)
    let l_char = input
        .elements
        .values()
        .filter_map(|el| {
            let ni = input.nodes.values().find(|n| n.id == el.node_i)?;
            let nj = input.nodes.values().find(|n| n.id == el.node_j)?;
            let dx = nj.x - ni.x;
            let dy = nj.z - ni.z;
            Some((dx * dx + dy * dy).sqrt())
        })
        .fold(0.0f64, f64::max)
        .max(1e-3);

    let tol = 1e-6 * l_char;

    let mut diags = Vec::new();
    for i in 0..n {
        for j in (i + 1)..n {
            let dx = nodes[j].x - nodes[i].x;
            let dy = nodes[j].z - nodes[i].z;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist < tol {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NearDuplicateNodes,
                        Severity::Warning,
                        format!(
                            "Nodes {} and {} are near-duplicates (distance {:.2e}, tolerance {:.2e})",
                            nodes[i].id, nodes[j].id, dist, tol
                        ),
                    )
                    .with_nodes(vec![nodes[i].id, nodes[j].id])
                    .with_value(dist, tol)
                    .with_phase("pre_solve"),
                );
            }
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 4: Near-duplicate nodes (3D)
// ---------------------------------------------------------------------------

/// Warn when two 3D nodes are closer than 1e-6 * L_char.
pub fn check_near_duplicate_nodes_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let nodes: Vec<_> = input.nodes.values().collect();
    let n = nodes.len();
    if n >= 10_000 {
        return vec![]; // skip O(n^2) for large models
    }

    // Characteristic length = max element length (min 1e-3)
    let l_char = input
        .elements
        .values()
        .filter_map(|el| {
            let ni = input.nodes.values().find(|n| n.id == el.node_i)?;
            let nj = input.nodes.values().find(|n| n.id == el.node_j)?;
            let dx = nj.x - ni.x;
            let dy = nj.y - ni.y;
            let dz = nj.z - ni.z;
            Some((dx * dx + dy * dy + dz * dz).sqrt())
        })
        .fold(0.0f64, f64::max)
        .max(1e-3);

    let tol = 1e-6 * l_char;

    let mut diags = Vec::new();
    for i in 0..n {
        for j in (i + 1)..n {
            let dx = nodes[j].x - nodes[i].x;
            let dy = nodes[j].y - nodes[i].y;
            let dz = nodes[j].z - nodes[i].z;
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            if dist < tol {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NearDuplicateNodes,
                        Severity::Warning,
                        format!(
                            "Nodes {} and {} are near-duplicates (distance {:.2e}, tolerance {:.2e})",
                            nodes[i].id, nodes[j].id, dist, tol
                        ),
                    )
                    .with_nodes(vec![nodes[i].id, nodes[j].id])
                    .with_value(dist, tol)
                    .with_phase("pre_solve"),
                );
            }
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 5: Instability risk (2D)
// ---------------------------------------------------------------------------

/// Warn if a node has ONLY truss connections and no rotational support.
pub fn check_instability_risk_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
    // Collect rotational-restrained node IDs
    let mut rot_restrained: HashSet<usize> = HashSet::new();
    for sup in input.supports.values() {
        match sup.support_type.as_str() {
            "fixed" | "guidedX" | "guidedY" => {
                rot_restrained.insert(sup.node_id);
            }
            _ => {
                // kz spring also provides rotational stiffness
                if sup.kz.unwrap_or(0.0) > 0.0 {
                    rot_restrained.insert(sup.node_id);
                }
            }
        }
    }

    // For each node, track whether it has any non-truss connection
    let mut has_non_truss: HashSet<usize> = HashSet::new();
    let mut connected_nodes: HashSet<usize> = HashSet::new();

    for el in input.elements.values() {
        connected_nodes.insert(el.node_i);
        connected_nodes.insert(el.node_j);

        if el.elem_type != "truss" {
            // Frame element — but hinged ends don't provide rotational stiffness
            if !el.hinge_start {
                has_non_truss.insert(el.node_i);
            }
            if !el.hinge_end {
                has_non_truss.insert(el.node_j);
            }
        }
    }

    let mut diags = Vec::new();
    for &nid in &connected_nodes {
        if !has_non_truss.contains(&nid) && !rot_restrained.contains(&nid) {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::InstabilityRisk,
                    Severity::Warning,
                    format!(
                        "Node {} has only truss connections and no rotational restraint — instability risk",
                        nid
                    ),
                )
                .with_nodes(vec![nid])
                .with_phase("pre_solve"),
            );
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 6: Shell mesh quality (3D only)
// ---------------------------------------------------------------------------

/// Aspect ratio threshold for warning.
const ASPECT_RATIO_THRESHOLD: f64 = 20.0;
/// Minimum interior angle threshold (degrees) for warning.
const MIN_ANGLE_THRESHOLD: f64 = 10.0;
/// Jacobian ratio threshold for poor quality warning.
const JACOBIAN_RATIO_THRESHOLD: f64 = 0.1;
/// Warping threshold for warning.
const WARPING_THRESHOLD: f64 = 0.1;

/// Compute the minimum interior angle (in degrees) across all 4 corners of a quad.
fn quad_min_interior_angle(coords: &[[f64; 3]; 4]) -> f64 {
    let mut min_angle = f64::INFINITY;
    for i in 0..4 {
        let prev = (i + 3) % 4;
        let next = (i + 1) % 4;
        let v1 = [
            coords[prev][0] - coords[i][0],
            coords[prev][1] - coords[i][1],
            coords[prev][2] - coords[i][2],
        ];
        let v2 = [
            coords[next][0] - coords[i][0],
            coords[next][1] - coords[i][1],
            coords[next][2] - coords[i][2],
        ];
        let l1 = (v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]).sqrt();
        let l2 = (v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]).sqrt();
        if l1 > 1e-15 && l2 > 1e-15 {
            let cos_a = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (l1 * l2);
            let angle = cos_a.clamp(-1.0, 1.0).acos().to_degrees();
            min_angle = min_angle.min(angle);
        }
    }
    min_angle
}

/// Pre-solve shell geometry screening (3D only).
///
/// Checks both quad (MITC4) and triangular plate (DKT) elements for:
/// - Negative Jacobian determinant (inverted element) → `NegativeJacobian` Error
/// - Poor Jacobian ratio (near-zero det relative to typical) → `PoorJacobianRatio` Warning
/// - High aspect ratio (max_edge / min_edge > threshold) → `HighAspectRatio` Warning
/// - Small minimum angle (< threshold degrees) → `SmallMinAngle` Warning
/// - High warping (quads only) → `HighWarping` Warning
pub fn check_shell_distortion_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    // ── Quad (MITC4) elements ──
    for q in input.quads.values() {
        let coords: Option<[[f64; 3]; 4]> = (|| {
            let mut c = [[0.0; 3]; 4];
            for (i, &nid) in q.nodes.iter().enumerate() {
                let node = input.nodes.values().find(|n| n.id == nid)?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            let qm = quad_quality_metrics(&coords);
            let (_, _, has_negative) = quad_check_jacobian(&coords);

            // Negative Jacobian → Error (inverted element, solve will produce garbage)
            if has_negative {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("Quad {} has negative Jacobian — element is inverted", q.id),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.jacobian_ratio, 0.0)
                    .with_phase("pre_solve"),
                );
            } else if qm.jacobian_ratio < JACOBIAN_RATIO_THRESHOLD {
                // Poor Jacobian ratio → Warning
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::PoorJacobianRatio,
                        Severity::Warning,
                        format!(
                            "Quad {} has poor Jacobian ratio {:.3} (threshold {:.1})",
                            q.id, qm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            // High aspect ratio → Warning
            if qm.aspect_ratio > ASPECT_RATIO_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighAspectRatio,
                        Severity::Warning,
                        format!(
                            "Quad {} has high aspect ratio {:.1} (threshold {:.0})",
                            q.id, qm.aspect_ratio, ASPECT_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.aspect_ratio, ASPECT_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            // Small minimum angle → Warning
            // Compute the actual minimum interior angle at quad corners.
            // A quad with a nearly-0° or nearly-180° corner is badly distorted.
            // We flag when any corner angle falls below the threshold.
            let min_angle = quad_min_interior_angle(&coords);
            if min_angle < MIN_ANGLE_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SmallMinAngle,
                        Severity::Warning,
                        format!(
                            "Quad {} has small minimum angle {:.1}° (threshold {:.0}°)",
                            q.id, min_angle, MIN_ANGLE_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(min_angle, MIN_ANGLE_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            // High warping → Warning
            if qm.warping > WARPING_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighWarping,
                        Severity::Warning,
                        format!(
                            "Quad {} has high warping {:.3} (threshold {:.1})",
                            q.id, qm.warping, WARPING_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.warping, WARPING_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }
        }
    }

    // ── Triangular plate (DKT) elements ──
    for pl in input.plates.values() {
        let coords: Option<[[f64; 3]; 3]> = (|| {
            let mut c = [[0.0; 3]; 3];
            for (i, &nid) in pl.nodes.iter().enumerate() {
                let node = input.nodes.values().find(|n| n.id == nid)?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            let (aspect_ratio, _skew_angle, min_angle) = plate_element_quality(&coords);

            // For triangles, check if the element is degenerate (near-zero area).
            // Area = 0.5 * |cross(edge01, edge02)|
            let e01 = [
                coords[1][0] - coords[0][0],
                coords[1][1] - coords[0][1],
                coords[1][2] - coords[0][2],
            ];
            let e02 = [
                coords[2][0] - coords[0][0],
                coords[2][1] - coords[0][1],
                coords[2][2] - coords[0][2],
            ];
            let cx = e01[1] * e02[2] - e01[2] * e02[1];
            let cy = e01[2] * e02[0] - e01[0] * e02[2];
            let cz = e01[0] * e02[1] - e01[1] * e02[0];
            let twice_area = (cx * cx + cy * cy + cz * cz).sqrt();

            // Characteristic length = max edge length
            let edge_lengths = [
                (e01[0] * e01[0] + e01[1] * e01[1] + e01[2] * e01[2]).sqrt(),
                ((coords[2][0] - coords[1][0]).powi(2)
                    + (coords[2][1] - coords[1][1]).powi(2)
                    + (coords[2][2] - coords[1][2]).powi(2))
                .sqrt(),
                (e02[0] * e02[0] + e02[1] * e02[1] + e02[2] * e02[2]).sqrt(),
            ];
            let max_edge = edge_lengths.iter().cloned().fold(0.0_f64, f64::max);

            // Degenerate triangle: area ~ 0 relative to edge length squared
            // This is the triangle equivalent of a negative Jacobian
            if max_edge > 1e-15 && twice_area < 1e-10 * max_edge * max_edge {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!(
                            "Plate {} has degenerate geometry (near-zero area) — element is collapsed",
                            pl.id
                        ),
                    )
                    .with_elements(vec![pl.id])
                    .with_value(twice_area * 0.5, 0.0)
                    .with_phase("pre_solve"),
                );
            }

            // High aspect ratio → Warning
            if aspect_ratio > ASPECT_RATIO_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighAspectRatio,
                        Severity::Warning,
                        format!(
                            "Plate {} has high aspect ratio {:.1} (threshold {:.0})",
                            pl.id, aspect_ratio, ASPECT_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![pl.id])
                    .with_value(aspect_ratio, ASPECT_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            // Small minimum angle → Warning
            if min_angle < MIN_ANGLE_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SmallMinAngle,
                        Severity::Warning,
                        format!(
                            "Plate {} has small minimum angle {:.1}° (threshold {:.0}°)",
                            pl.id, min_angle, MIN_ANGLE_THRESHOLD
                        ),
                    )
                    .with_elements(vec![pl.id])
                    .with_value(min_angle, MIN_ANGLE_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }
        }
    }

    diags
}

// ---------------------------------------------------------------------------
// Gate 7: Suspicious local axes (3D only)
// ---------------------------------------------------------------------------

/// Check for suspicious local-axis definitions on 3D frame elements.
///
/// Two classes of degeneracy are detected:
///
/// 1. **Custom orientation**: the user-specified orientation vector is nearly
///    parallel to the element axis (dot product > 0.999, i.e. < 2.6 degrees).
///    Severity: **Error** — the cross product degenerates, producing garbage.
///
/// 2. **Default orientation on near-vertical elements**: when no custom
///    orientation is provided, the solver uses global Y `[0,1,0]` as the
///    reference.  For nearly-vertical elements the code silently switches to
///    global Z, but the transition zone is narrow.  Elements whose axis is
///    within ~5.7 degrees of global Y (`|ex·Y| > 0.995`) get a **Warning** so
///    the user knows the default rule is operating near its switching threshold.
pub fn check_suspicious_local_axes_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    for el in input.elements.values() {
        let ni = match input.nodes.values().find(|n| n.id == el.node_i) {
            Some(n) => n,
            None => continue,
        };
        let nj = match input.nodes.values().find(|n| n.id == el.node_j) {
            Some(n) => n,
            None => continue,
        };

        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let dz = nj.z - ni.z;
        let len = (dx * dx + dy * dy + dz * dz).sqrt();

        if len < 1e-15 {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::SuspiciousLocalAxis,
                    Severity::Error,
                    format!(
                        "Element {} has zero length (nodes {} and {} coincide) — local axes undefined",
                        el.id, el.node_i, el.node_j,
                    ),
                )
                .with_elements(vec![el.id])
                .with_nodes(vec![el.node_i, el.node_j])
                .with_phase("pre_solve"),
            );
            continue;
        }

        let ex = [dx / len, dy / len, dz / len];

        let has_custom = matches!(
            (el.local_yx, el.local_yy, el.local_yz),
            (Some(_), Some(_), Some(_))
        );

        if has_custom {
            let (yx, yy, yz) = (
                el.local_yx.unwrap(),
                el.local_yy.unwrap(),
                el.local_yz.unwrap(),
            );
            let olen = (yx * yx + yy * yy + yz * yz).sqrt();
            if olen < 1e-15 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SuspiciousLocalAxis,
                        Severity::Error,
                        format!("Element {} has zero-length local axis orientation vector", el.id),
                    )
                    .with_elements(vec![el.id])
                    .with_phase("pre_solve"),
                );
                continue;
            }
            let ov = [yx / olen, yy / olen, yz / olen];

            let dot = (ex[0] * ov[0] + ex[1] * ov[1] + ex[2] * ov[2]).abs();
            if dot > 0.999 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SuspiciousLocalAxis,
                        Severity::Error,
                        format!(
                            "Element {} orientation vector is nearly parallel to element axis \
                             (|cos|={:.6}) — local y/z axes are ill-defined",
                            el.id, dot,
                        ),
                    )
                    .with_elements(vec![el.id])
                    .with_value(dot, 0.999)
                    .with_phase("pre_solve"),
                );
            }
        } else {
            let dot_y = ex[1].abs();
            if dot_y > 0.995 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SuspiciousLocalAxis,
                        Severity::Warning,
                        format!(
                            "Element {} is nearly vertical (|cos|={:.6}) and uses default \
                             orientation — local y/z axes are near the switching threshold; \
                             consider specifying an explicit orientation vector",
                            el.id, dot_y,
                        ),
                    )
                    .with_elements(vec![el.id])
                    .with_value(dot_y, 0.995)
                    .with_phase("pre_solve"),
                );
            }
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Combined runners
// ---------------------------------------------------------------------------

/// Run all 2D pre-solve quality gates.
pub fn run_pre_solve_gates_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();
    diags.extend(check_isolated_nodes_2d(input));
    diags.extend(check_near_duplicate_nodes_2d(input));
    diags.extend(check_instability_risk_2d(input));
    diags
}

/// Run all 3D pre-solve quality gates.
pub fn run_pre_solve_gates_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();
    diags.extend(check_isolated_nodes_3d(input));
    diags.extend(check_near_duplicate_nodes_3d(input));
    diags.extend(check_shell_distortion_3d(input));
    diags.extend(check_suspicious_local_axes_3d(input));
    diags
}
