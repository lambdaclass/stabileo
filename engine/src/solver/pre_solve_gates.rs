//! Pre-solve model quality gates.
//!
//! These checks run before assembly/solve and emit [`StructuredDiagnostic`]s
//! for common modelling mistakes: isolated nodes, near-duplicate nodes,
//! shell distortion, suspicious local axes, and instability risks.

use std::collections::HashSet;

use crate::element::quad::{quad_quality_metrics, quad_check_jacobian};
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
            let dy = nj.y - ni.y;
            Some((dx * dx + dy * dy).sqrt())
        })
        .fold(0.0f64, f64::max)
        .max(1e-3);

    let tol = 1e-6 * l_char;

    let mut diags = Vec::new();
    for i in 0..n {
        for j in (i + 1)..n {
            let dx = nodes[j].x - nodes[i].x;
            let dy = nodes[j].y - nodes[i].y;
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
// Gate 6: Shell distortion (3D only)
// ---------------------------------------------------------------------------

/// Pre-solve shell geometry screening (3D only).
/// Checks quad elements for poor aspect ratio, negative Jacobian, excessive warping.
pub fn check_shell_distortion_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    for q in input.quads.values() {
        // Look up node coordinates
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

            if has_negative {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::ShellDistortion,
                        Severity::Error,
                        format!("Quad {} has negative Jacobian — element is inverted", q.id),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.jacobian_ratio, 0.0)
                    .with_phase("pre_solve"),
                );
            } else if qm.jacobian_ratio < 0.1 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::ShellDistortion,
                        Severity::Warning,
                        format!("Quad {} has poor Jacobian ratio {:.3} (threshold 0.1)", q.id, qm.jacobian_ratio),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.jacobian_ratio, 0.1)
                    .with_phase("pre_solve"),
                );
            }

            if qm.aspect_ratio > 10.0 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::ShellDistortion,
                        Severity::Warning,
                        format!("Quad {} has high aspect ratio {:.1} (threshold 10)", q.id, qm.aspect_ratio),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.aspect_ratio, 10.0)
                    .with_phase("pre_solve"),
                );
            }

            if qm.warping > 0.1 {
                diags.push(
                    StructuredDiagnostic::global(
                        DiagnosticCode::ShellDistortion,
                        Severity::Warning,
                        format!("Quad {} has high warping {:.3} (threshold 0.1)", q.id, qm.warping),
                    )
                    .with_elements(vec![q.id])
                    .with_value(qm.warping, 0.1)
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
/// Flags elements where the specified orientation vector is nearly parallel
/// to the element axis (which makes the local y/z axes ill-defined).
pub fn check_suspicious_local_axes_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    for el in input.elements.values() {
        // Only check elements that specify a custom orientation
        let (yx, yy, yz) = match (el.local_yx, el.local_yy, el.local_yz) {
            (Some(x), Some(y), Some(z)) => (x, y, z),
            _ => continue, // No custom axis — skip
        };

        // Get element axis direction
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
        if len < 1e-15 { continue; }

        // Normalize element axis
        let ex = [dx / len, dy / len, dz / len];

        // Normalize orientation vector
        let olen = (yx * yx + yy * yy + yz * yz).sqrt();
        if olen < 1e-15 {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::SuspiciousLocalAxis,
                    Severity::Warning,
                    format!("Element {} has zero-length local axis orientation vector", el.id),
                )
                .with_elements(vec![el.id])
                .with_phase("pre_solve"),
            );
            continue;
        }
        let ov = [yx / olen, yy / olen, yz / olen];

        // Check parallelism: |dot(ex, ov)| close to 1.0 means nearly parallel
        let dot = ex[0] * ov[0] + ex[1] * ov[1] + ex[2] * ov[2];
        if dot.abs() > 0.999 {
            diags.push(
                StructuredDiagnostic::global(
                    DiagnosticCode::SuspiciousLocalAxis,
                    Severity::Warning,
                    format!(
                        "Element {} orientation vector is nearly parallel to element axis (|cos|={:.4}) — local y/z axes are ill-defined",
                        el.id, dot.abs()
                    ),
                )
                .with_elements(vec![el.id])
                .with_value(dot.abs(), 0.999)
                .with_phase("pre_solve"),
            );
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
