//! Pre-solve model quality gates.
//!
//! These checks run before assembly/solve and emit [`StructuredDiagnostic`]s
//! for common modelling mistakes: disconnected nodes, near-duplicate nodes,
//! and instability risks.

use std::collections::HashSet;

use crate::types::{SolverInput, SolverInput3D, DiagnosticCode, Severity, StructuredDiagnostic};

// ---------------------------------------------------------------------------
// Gate 1: Disconnected nodes (2D)
// ---------------------------------------------------------------------------

/// Warn about nodes that are not referenced by any element.
pub fn check_disconnected_nodes_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
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
                    format!("Node {} is not connected to any element", node.id),
                )
                .with_nodes(vec![node.id])
                .with_phase("pre_solve"),
            );
        }
    }
    diags
}

// ---------------------------------------------------------------------------
// Gate 2: Disconnected nodes (3D)
// ---------------------------------------------------------------------------

/// Warn about nodes that are not referenced by any element (3D).
pub fn check_disconnected_nodes_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
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
                    format!("Node {} is not connected to any element", node.id),
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
// Combined runners
// ---------------------------------------------------------------------------

/// Run all 2D pre-solve quality gates.
pub fn run_pre_solve_gates_2d(input: &SolverInput) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();
    diags.extend(check_disconnected_nodes_2d(input));
    diags.extend(check_near_duplicate_nodes_2d(input));
    diags.extend(check_instability_risk_2d(input));
    diags
}

/// Run all 3D pre-solve quality gates.
pub fn run_pre_solve_gates_3d(input: &SolverInput3D) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();
    diags.extend(check_disconnected_nodes_3d(input));
    diags.extend(check_near_duplicate_nodes_3d(input));
    // instability_risk_3d is more complex (6 DOF per node) — defer to later
    diags
}
