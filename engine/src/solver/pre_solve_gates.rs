//! Pre-solve model quality gates.
//!
//! These checks run before assembly/solve and emit [`StructuredDiagnostic`]s
//! for common modelling mistakes: isolated nodes, near-duplicate nodes,
//! shell distortion, suspicious local axes, and instability risks.

use std::collections::{HashMap, HashSet};

use crate::element::quad::{quad_quality_metrics, quad_check_jacobian};
use crate::element::quad9::{quad9_quality_metrics, quad9_check_jacobian};
use crate::element::solid_shell::{solid_shell_quality_metrics, solid_shell_check_jacobian};
use crate::element::curved_shell::{compute_element_directors, curved_shell_check_jacobian};
use crate::element::plate::plate_element_quality;
use crate::types::{
    SolverInput, SolverInput3D, SolverNode, SolverNode3D, DiagnosticCode, Severity,
    StructuredDiagnostic,
};

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

    // Characteristic length = max element length (min 1e-3).
    // The `n >= 10_000` guard above protects the O(n²) loop below, but this
    // fold ran before it was reached and scanned `nodes.values()` twice per
    // element — the more expensive half, and unguarded. Indexed once instead.
    let node_by_id: HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let l_char = input
        .elements
        .values()
        .filter_map(|el| {
            let ni = node_by_id.get(&el.node_i).copied()?;
            let nj = node_by_id.get(&el.node_j).copied()?;
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

    // Characteristic length = max element length (min 1e-3). Indexed once,
    // for the same reason as the 2D gate above.
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let l_char = input
        .elements
        .values()
        .filter_map(|el| {
            let ni = node_by_id.get(&el.node_i).copied()?;
            let nj = node_by_id.get(&el.node_j).copied()?;
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
            // guidedZ is a 2D alias of guidedY (dof::is_dof_restrained_2d): ux+ry fixed
            "fixed" | "guidedX" | "guidedY" | "guidedZ" => {
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

/// What a Jacobian sign pattern, sampled over an element's Gauss points,
/// actually says about the element.
///
/// These cases are not interchangeable, and the gates used to report all of
/// them as one `Error` — "element is inverted".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JacobianShape {
    /// No area or volume left at any sampling point: nothing to integrate.
    Collapsed,
    /// Some area/volume remains, but a sampled mapping cannot be inverted.
    Singular,
    /// The sign changes between sampling points, so the map doubles back on
    /// itself and the element covers part of its own domain twice.
    Folded,
    /// Every determinant is negative, with healthy magnitude: the node
    /// ordering simply runs the other way round.
    Reversed,
    Fine,
}

/// Classify the sampled determinants of one element.
///
/// `Reversed` is deliberately not an error. Every element family screened
/// here integrates with `det.abs()` — quad, quad9, curved shell and solid
/// shell alike — so an element ordered backwards produces exactly the same
/// stiffness as the same element ordered forwards. Calling it invalid
/// condemned eight shell benchmarks (hemispheres, a spherical cap) that
/// validate against published reference values while carrying this very
/// pattern. It is still worth reporting, because local axes — and with them
/// the sign of the stresses that get reported — follow the ordering.
fn classify_jacobian(min_det: f64, max_det: f64) -> JacobianShape {
    // 1e-30 is the threshold the element formulations themselves use to give
    // up on a sampling point (`det.abs() < 1e-30` in quad.rs, curved_shell.rs).
    //
    // Written as `!(scale > …)` so a non-finite reading lands here too. An
    // element with no usable plane — four quad nodes on one line along Z —
    // has NaN determinants, and the samplers' `f64::min`/`max` skip NaN and
    // hand back (INF, −INF): that read as `Reversed`, a Warning, and the NaN
    // went on into the stiffness matrix.
    let scale = min_det.abs().max(max_det.abs());
    if !(min_det.is_finite() && max_det.is_finite()) || !(scale > 1e-30) {
        JacobianShape::Collapsed
    } else if min_det < 0.0 && max_det > 0.0 {
        JacobianShape::Folded
    } else if min_det.abs() <= 1e-30 || max_det.abs() <= 1e-30 {
        // A zero at one Gauss point is not healthy reversed ordering, nor
        // merely a poor ratio. The element cannot invert that local mapping.
        JacobianShape::Singular
    } else if max_det <= 0.0 {
        JacobianShape::Reversed
    } else {
        JacobianShape::Fine
    }
}

/// Pre-solve shell geometry screening (3D only).
///
/// Checks both quad (MITC4) and triangular plate (DKT) elements for:
/// - A collapsed, singular or folded element → `NegativeJacobian` Error
/// - Reversed node ordering (all Jacobians negative) → `NegativeJacobian` Warning
/// - Poor Jacobian ratio (near-zero det relative to typical) → `PoorJacobianRatio` Warning
/// - High aspect ratio (max_edge / min_edge > threshold) → `HighAspectRatio` Warning
/// - Small minimum angle (< threshold degrees) → `SmallMinAngle` Warning
/// - High warping (quads only) → `HighWarping` Warning
pub fn check_shell_distortion_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    // Indexed once and shared by every family below. Each corner used to be
    // resolved by scanning `nodes.values()`, so the gate cost
    // O(shell corners × nodes): measured at 190 ms on a 10k-node shell mesh,
    // against 0.8 ms for the isolated-node gate on the same model.
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    // ── Quad (MITC4) elements ──
    for q in input.quads.values() {
        let coords: Option<[[f64; 3]; 4]> = (|| {
            let mut c = [[0.0; 3]; 4];
            for (i, &nid) in q.nodes.iter().enumerate() {
                let node = node_by_id.get(&nid).copied()?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            let qm = quad_quality_metrics(&coords);
            let (min_det, max_det, _) = quad_check_jacobian(&coords);

            match classify_jacobian(min_det, max_det) {
                JacobianShape::Collapsed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("Quad {} has no area — element is collapsed", q.id),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.jacobian_ratio, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Singular => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("Quad {} has a singular Jacobian at an integration point", q.id),
                    )
                    .with_elements(vec![q.id])
                    .with_value(min_det.abs().min(max_det.abs()), 1e-30)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Folded => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!(
                            "Quad {} folds over itself — the Jacobian changes sign inside the element",
                            q.id
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Reversed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Warning,
                        format!(
                            "Quad {} has reversed node ordering (every Jacobian is negative) — \
                             the stiffness is unaffected, but local axes and reported stress \
                             signs follow the ordering",
                            q.id
                        ),
                    )
                    .with_elements(vec![q.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Fine => {
                    if qm.jacobian_ratio < JACOBIAN_RATIO_THRESHOLD {
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
                }
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
                let node = node_by_id.get(&nid).copied()?;
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

    // ── Quad9 (MITC9) elements ──
    for q9 in input.quad9s.values() {
        let coords: Option<[[f64; 3]; 9]> = (|| {
            let mut c = [[0.0; 3]; 9];
            for (i, &nid) in q9.nodes.iter().enumerate() {
                let node = node_by_id.get(&nid).copied()?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            let qm = quad9_quality_metrics(&coords);
            let (min_det, max_det, _) = quad9_check_jacobian(&coords);

            match classify_jacobian(min_det, max_det) {
                JacobianShape::Collapsed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("Quad9 {} has no area — element is collapsed", q9.id),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(qm.jacobian_ratio, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Singular => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("Quad9 {} has a singular Jacobian at an integration point", q9.id),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(min_det.abs().min(max_det.abs()), 1e-30)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Folded => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!(
                            "Quad9 {} folds over itself — the Jacobian changes sign inside the element",
                            q9.id
                        ),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Reversed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Warning,
                        format!(
                            "Quad9 {} has reversed node ordering (every Jacobian is negative) — \
                             the stiffness is unaffected, but local axes and reported stress \
                             signs follow the ordering",
                            q9.id
                        ),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Fine => {
                    if qm.jacobian_ratio < JACOBIAN_RATIO_THRESHOLD {
                        diags.push(
                            StructuredDiagnostic::global(
                                DiagnosticCode::PoorJacobianRatio,
                                Severity::Warning,
                                format!(
                                    "Quad9 {} has poor Jacobian ratio {:.3} (threshold {:.1})",
                                    q9.id, qm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD
                                ),
                            )
                            .with_elements(vec![q9.id])
                            .with_value(qm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD)
                            .with_phase("pre_solve"),
                        );
                    }
                }
            }

            if qm.aspect_ratio > ASPECT_RATIO_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighAspectRatio,
                        Severity::Warning,
                        format!(
                            "Quad9 {} has high aspect ratio {:.1} (threshold {:.0})",
                            q9.id, qm.aspect_ratio, ASPECT_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(qm.aspect_ratio, ASPECT_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            // Minimum interior angle across the 4 corner nodes
            let corner_coords = [coords[0], coords[1], coords[2], coords[3]];
            let min_angle = quad_min_interior_angle(&corner_coords);
            if min_angle < MIN_ANGLE_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SmallMinAngle,
                        Severity::Warning,
                        format!(
                            "Quad9 {} has small minimum angle {:.1}° (threshold {:.0}°)",
                            q9.id, min_angle, MIN_ANGLE_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(min_angle, MIN_ANGLE_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            if qm.warping > WARPING_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighWarping,
                        Severity::Warning,
                        format!(
                            "Quad9 {} has high warping {:.3} (threshold {:.1})",
                            q9.id, qm.warping, WARPING_THRESHOLD
                        ),
                    )
                    .with_elements(vec![q9.id])
                    .with_value(qm.warping, WARPING_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }
        }
    }

    // ── Solid shell (SHB8-ANS) elements ──
    for ss in input.solid_shells.values() {
        let coords: Option<[[f64; 3]; 8]> = (|| {
            let mut c = [[0.0; 3]; 8];
            for (i, &nid) in ss.nodes.iter().enumerate() {
                let node = node_by_id.get(&nid).copied()?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            let hm = solid_shell_quality_metrics(&coords);
            let (min_det, max_det, _) = solid_shell_check_jacobian(&coords);

            match classify_jacobian(min_det, max_det) {
                JacobianShape::Collapsed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("SolidShell {} has no volume — element is collapsed", ss.id),
                    )
                    .with_elements(vec![ss.id])
                    .with_value(hm.jacobian_ratio, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Singular => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!("SolidShell {} has a singular Jacobian at an integration point", ss.id),
                    )
                    .with_elements(vec![ss.id])
                    .with_value(min_det.abs().min(max_det.abs()), 1e-30)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Folded => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        format!(
                            "SolidShell {} folds over itself — the Jacobian changes sign inside the element",
                            ss.id
                        ),
                    )
                    .with_elements(vec![ss.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Reversed => diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Warning,
                        format!(
                            "SolidShell {} has reversed node ordering (every Jacobian is negative) \
                             — the stiffness is unaffected, but local axes and reported stress \
                             signs follow the ordering",
                            ss.id
                        ),
                    )
                    .with_elements(vec![ss.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                ),
                JacobianShape::Fine => {
                    if hm.jacobian_ratio < JACOBIAN_RATIO_THRESHOLD {
                        diags.push(
                            StructuredDiagnostic::global(
                                DiagnosticCode::PoorJacobianRatio,
                                Severity::Warning,
                                format!(
                                    "SolidShell {} has poor Jacobian ratio {:.3} (threshold {:.1})",
                                    ss.id, hm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD
                                ),
                            )
                            .with_elements(vec![ss.id])
                            .with_value(hm.jacobian_ratio, JACOBIAN_RATIO_THRESHOLD)
                            .with_phase("pre_solve"),
                        );
                    }
                }
            }

            if hm.aspect_ratio > ASPECT_RATIO_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighAspectRatio,
                        Severity::Warning,
                        format!(
                            "SolidShell {} has high aspect ratio {:.1} (threshold {:.0})",
                            ss.id, hm.aspect_ratio, ASPECT_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![ss.id])
                    .with_value(hm.aspect_ratio, ASPECT_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }
        }
    }

    // ── Curved shell elements ──
    for cs in input.curved_shells.values() {
        let coords: Option<[[f64; 3]; 4]> = (|| {
            let mut c = [[0.0; 3]; 4];
            for (i, &nid) in cs.nodes.iter().enumerate() {
                let node = node_by_id.get(&nid).copied()?;
                c[i] = [node.x, node.y, node.z];
            }
            Some(c)
        })();

        if let Some(coords) = coords {
            // Use provided directors or auto-compute from geometry
            let dirs = cs.normals.unwrap_or_else(|| compute_element_directors(&coords));
            let (min_det, max_det, _) =
                curved_shell_check_jacobian(&coords, &dirs, cs.thickness);
            let shape = classify_jacobian(min_det, max_det);

            if matches!(shape, JacobianShape::Collapsed | JacobianShape::Singular | JacobianShape::Folded) {
                let message = if shape == JacobianShape::Collapsed {
                    format!("CurvedShell {} has no area — element is collapsed", cs.id)
                } else if shape == JacobianShape::Singular {
                    format!("CurvedShell {} has a singular Jacobian at an integration point", cs.id)
                } else {
                    format!(
                        "CurvedShell {} folds over itself — the Jacobian changes sign inside \
                         the element",
                        cs.id
                    )
                };
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::NegativeJacobian,
                        Severity::Error,
                        message,
                    )
                    .with_elements(vec![cs.id])
                    .with_value(min_det, 0.0)
                    .with_phase("pre_solve"),
                );
            } else {
                if shape == JacobianShape::Reversed {
                    diags.push(
                        StructuredDiagnostic::global(
                            DiagnosticCode::NegativeJacobian,
                            Severity::Warning,
                            format!(
                                "CurvedShell {} has reversed node ordering (every Jacobian is \
                                 negative) — the stiffness is unaffected, but local axes and \
                                 reported stress signs follow the ordering",
                                cs.id
                            ),
                        )
                        .with_elements(vec![cs.id])
                        .with_value(min_det, 0.0)
                        .with_phase("pre_solve"),
                    );
                }
                let jac_ratio = if max_det.abs() > 1e-15 {
                    min_det / max_det
                } else {
                    0.0
                };
                if jac_ratio < JACOBIAN_RATIO_THRESHOLD {
                    diags.push(
                        StructuredDiagnostic::global(
                            DiagnosticCode::PoorJacobianRatio,
                            Severity::Warning,
                            format!(
                                "CurvedShell {} has poor Jacobian ratio {:.3} (threshold {:.1})",
                                cs.id, jac_ratio, JACOBIAN_RATIO_THRESHOLD
                            ),
                        )
                        .with_elements(vec![cs.id])
                        .with_value(jac_ratio, JACOBIAN_RATIO_THRESHOLD)
                        .with_phase("pre_solve"),
                    );
                }
            }

            // Aspect ratio and angle checks on the 4-node footprint
            // (same geometry as MITC4 quad for the midsurface)
            let edges = [
                edge_len(&coords[0], &coords[1]),
                edge_len(&coords[1], &coords[2]),
                edge_len(&coords[2], &coords[3]),
                edge_len(&coords[3], &coords[0]),
            ];
            let max_edge = edges.iter().cloned().fold(0.0_f64, f64::max);
            let min_edge = edges.iter().cloned().fold(f64::INFINITY, f64::min);
            let aspect_ratio = if min_edge > 1e-15 { max_edge / min_edge } else { f64::INFINITY };

            if aspect_ratio > ASPECT_RATIO_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::HighAspectRatio,
                        Severity::Warning,
                        format!(
                            "CurvedShell {} has high aspect ratio {:.1} (threshold {:.0})",
                            cs.id, aspect_ratio, ASPECT_RATIO_THRESHOLD
                        ),
                    )
                    .with_elements(vec![cs.id])
                    .with_value(aspect_ratio, ASPECT_RATIO_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }

            let min_angle = quad_min_interior_angle(&coords);
            if min_angle < MIN_ANGLE_THRESHOLD {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::SmallMinAngle,
                        Severity::Warning,
                        format!(
                            "CurvedShell {} has small minimum angle {:.1}° (threshold {:.0}°)",
                            cs.id, min_angle, MIN_ANGLE_THRESHOLD
                        ),
                    )
                    .with_elements(vec![cs.id])
                    .with_value(min_angle, MIN_ANGLE_THRESHOLD)
                    .with_phase("pre_solve"),
                );
            }
        }
    }

    diags
}

/// Euclidean distance between two 3D points.
fn edge_len(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let dz = b[2] - a[2];
    (dx * dx + dy * dy + dz * dz).sqrt()
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

    // Indexed once. Resolving each end by scanning `nodes.values()` made this
    // gate cost O(elements × nodes): on a 10k-node frame it was the single
    // most expensive thing in the solve.
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    for el in input.elements.values() {
        let (Some(ni), Some(nj)) = (
            node_by_id.get(&el.node_i).copied(),
            node_by_id.get(&el.node_j).copied(),
        ) else {
            continue;
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

/// Refuse a model with an element that cannot be integrated over.
///
/// Only `NegativeJacobian` errors qualify — collapsed, singular and folded shells
/// (see [`JacobianShape`]). The gates raise `Error` for other things too: a
/// frame's orientation vector that is zero or nearly parallel to its axis is
/// an `Error` to the reader, but `compute_local_axes_3d` falls back to a
/// default reference and the solve is sound. Refusing on every `Error` turned
/// models that solve into "Invalid model". A broken element does not solve;
/// left to run, it came back as "Singular stiffness matrix — structure is a
/// mechanism", blaming the structure for one element the gate had named.
///
/// Every static path that assembles shells calls this — the constrained one
/// included, which does not go through `prepare_static_3d`.
pub fn refuse_broken_elements(diags: &[StructuredDiagnostic]) -> Result<(), String> {
    match diags
        .iter()
        .find(|d| d.severity == Severity::Error && d.code == DiagnosticCode::NegativeJacobian)
    {
        Some(d) => Err(format!("Invalid model: {}", d.message)),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The readings of a Jacobian sign pattern, pinned by number so the
    /// distinction cannot quietly collapse back into "negative = invalid".
    #[test]
    fn jacobian_shapes_are_told_apart() {
        // Nothing left to integrate over.
        assert_eq!(classify_jacobian(0.0, 0.0), JacobianShape::Collapsed);
        assert_eq!(classify_jacobian(-1e-40, 1e-40), JacobianShape::Collapsed);
        // No finite reading at all: NaN determinants, or the (INF, −INF) a
        // sampler returns when `min`/`max` skipped every one of them.
        assert_eq!(classify_jacobian(f64::NAN, f64::NAN), JacobianShape::Collapsed);
        assert_eq!(classify_jacobian(f64::INFINITY, f64::NEG_INFINITY), JacobianShape::Collapsed);

        // One singular sample is enough, in either ordering. A large maximum
        // must not hide it, and signed zero must not turn it into Reversed.
        for (min, max) in [(0.0, 4.8), (-4.8, 0.0), (-4.8, -0.0), (1e-30, 1.0), (-1.0, -1e-30)] {
            assert_eq!(classify_jacobian(min, max), JacobianShape::Singular);
        }

        // The sign changes inside the element: it doubles back on itself.
        assert_eq!(classify_jacobian(-1.0, 1.0), JacobianShape::Folded);
        assert_eq!(classify_jacobian(-0.5, 2.0), JacobianShape::Folded);

        // Consistently negative and healthy: the ordering runs backwards, and
        // the integration uses |det|, so the stiffness is the same.
        assert_eq!(classify_jacobian(-2.0, -1.0), JacobianShape::Reversed);
        assert_eq!(classify_jacobian(-1.0, -1.0), JacobianShape::Reversed);

        // Ordinary elements.
        assert_eq!(classify_jacobian(1.0, 2.0), JacobianShape::Fine);
        assert_eq!(classify_jacobian(0.125, 0.125), JacobianShape::Fine);
        // Do not turn ordinary scale or a poor but invertible ratio into an
        // error: the cutoff is the formulation's inversion limit, not 0.1.
        assert_eq!(classify_jacobian(1e-20, 2e-20), JacobianShape::Fine);
        assert_eq!(classify_jacobian(1e-20, 1.0), JacobianShape::Fine);
        assert_eq!(classify_jacobian(-2e-20, -1e-20), JacobianShape::Reversed);
    }
}
