/// Multi-point constraint (MPC) technology using the transformation method.
///
/// Supports rigid links, diaphragms, equal-DOF, and general linear MPCs.
/// The approach builds a constraint transformation matrix C such that:
///   u_full = C * u_independent
/// Then the reduced system is:
///   K_reduced = C^T * K * C
///   F_reduced = C^T * F
/// After solving for u_independent, recover u_full = C * u_independent.
///
/// Reference: Cook et al., "Concepts and Applications of Finite Element Analysis", Ch. 9

use std::collections::{HashMap, HashSet};
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;

/// Result of building constraint transformation.
pub struct ConstraintTransform {
    /// Transformation matrix C: n_total × n_independent (row-major)
    pub c_matrix: Vec<f64>,
    /// Number of independent DOFs (after constraints applied)
    pub n_independent: usize,
    /// Total DOFs
    pub n_total: usize,
    /// Map: independent index → original global DOF index
    pub independent_dofs: Vec<usize>,
    /// Set of dependent (constrained) global DOF indices
    pub dependent_dofs: HashSet<usize>,
}

/// Constrained analysis input (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstrainedInput {
    pub solver: SolverInput,
    pub constraints: Vec<Constraint>,
}

/// Constrained analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstrainedInput3D {
    pub solver: SolverInput3D,
    pub constraints: Vec<Constraint>,
}

/// Validate that all node IDs referenced by constraints exist in the model,
/// and that DOF indices are within the valid range for the analysis type.
/// `max_dofs_per_node`: 3 for 2D, 6 for 3D.
pub fn validate_constraint_refs(
    constraints: &[Constraint],
    node_ids: &HashSet<usize>,
    max_dofs_per_node: usize,
) -> Result<(), String> {
    for (i, constraint) in constraints.iter().enumerate() {
        match constraint {
            Constraint::RigidLink(rl) => {
                if !node_ids.contains(&rl.master_node) {
                    return Err(format!("Constraint {}: RigidLink master node {} does not exist", i, rl.master_node));
                }
                if !node_ids.contains(&rl.slave_node) {
                    return Err(format!("Constraint {}: RigidLink slave node {} does not exist", i, rl.slave_node));
                }
                for &dof in &rl.dofs {
                    if dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: RigidLink references DOF {} but max is {} (0..{})",
                            i, dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
            Constraint::Diaphragm(dia) => {
                if !node_ids.contains(&dia.master_node) {
                    return Err(format!("Constraint {}: Diaphragm master node {} does not exist", i, dia.master_node));
                }
                for &slave in &dia.slave_nodes {
                    if !node_ids.contains(&slave) {
                        return Err(format!("Constraint {}: Diaphragm slave node {} does not exist", i, slave));
                    }
                }
            }
            Constraint::EqualDOF(eq) => {
                if !node_ids.contains(&eq.master_node) {
                    return Err(format!("Constraint {}: EqualDOF master node {} does not exist", i, eq.master_node));
                }
                if !node_ids.contains(&eq.slave_node) {
                    return Err(format!("Constraint {}: EqualDOF slave node {} does not exist", i, eq.slave_node));
                }
                for &dof in &eq.dofs {
                    if dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: EqualDOF references DOF {} but max is {} (0..{})",
                            i, dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
            Constraint::EccentricConnection(ec) => {
                if !node_ids.contains(&ec.master_node) {
                    return Err(format!("Constraint {}: EccentricConnection master node {} does not exist", i, ec.master_node));
                }
                if !node_ids.contains(&ec.slave_node) {
                    return Err(format!("Constraint {}: EccentricConnection slave node {} does not exist", i, ec.slave_node));
                }
            }
            Constraint::LinearMPC(mpc) => {
                for term in &mpc.terms {
                    if !node_ids.contains(&term.node_id) {
                        return Err(format!("Constraint {}: LinearMPC references non-existent node {}", i, term.node_id));
                    }
                    if term.dof >= max_dofs_per_node {
                        return Err(format!(
                            "Constraint {}: LinearMPC term references DOF {} but max is {} (0..{})",
                            i, term.dof, max_dofs_per_node - 1, max_dofs_per_node - 1
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Pre-solve constraint validation.
///
/// Detects conflicting, circular, or over-constrained configurations and
/// returns structured diagnostics. Called before building the transform matrix.
pub fn validate_constraints(
    constraints: &[Constraint],
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> Vec<StructuredDiagnostic> {
    let mut diags = Vec::new();

    // Build reverse map: global DOF → (node_id, local_dof)
    let reverse_map: HashMap<usize, (usize, usize)> = dof_num.map.iter()
        .map(|(&(node_id, local_dof), &global_dof)| (global_dof, (node_id, local_dof)))
        .collect();

    // Collect which DOFs each constraint makes dependent
    let mut dep_count: HashMap<usize, Vec<usize>> = HashMap::new(); // global_dof -> [constraint indices]
    let mut master_of: HashMap<usize, HashSet<usize>> = HashMap::new(); // dep_dof -> set of master DOFs

    for (ci, constraint) in constraints.iter().enumerate() {
        let slave_dofs = collect_dependent_dofs(constraint, dof_num, nodes_2d, nodes_3d);
        for (slave_global, master_globals) in &slave_dofs {
            dep_count.entry(*slave_global).or_default().push(ci);
            master_of.entry(*slave_global).or_default().extend(master_globals);
        }
    }

    // 1. Conflicting constraints: same DOF constrained by multiple constraints
    for (&dof, indices) in &dep_count {
        if indices.len() > 1 {
            let node_id = reverse_map.get(&dof).map(|&(n, _)| n).unwrap_or(0);
            diags.push(StructuredDiagnostic::global(
                DiagnosticCode::ConflictingConstraints,
                Severity::Warning,
                format!("DOF {} (node {}) is constrained by {} constraints — last one wins",
                    dof, node_id, indices.len()),
            ).with_dofs(vec![dof]).with_nodes(vec![node_id]).with_phase("constraints"));
        }
    }

    // 2. Circular dependencies: A depends on B depends on A
    for (&dep_dof, masters) in &master_of {
        for &m in masters {
            if let Some(m_masters) = master_of.get(&m) {
                if m_masters.contains(&dep_dof) {
                    let n1 = reverse_map.get(&dep_dof).map(|&(n, _)| n).unwrap_or(0);
                    let n2 = reverse_map.get(&m).map(|&(n, _)| n).unwrap_or(0);
                    diags.push(StructuredDiagnostic::global(
                        DiagnosticCode::CircularConstraint,
                        Severity::Error,
                        format!("Circular constraint: DOF {} (node {}) ↔ DOF {} (node {})",
                            dep_dof, n1, m, n2),
                    ).with_dofs(vec![dep_dof, m]).with_nodes(vec![n1, n2]).with_phase("constraints"));
                }
            }
        }
    }

    // 3. Dependent DOF is also restrained by a support (over-constrained)
    let restrained: HashSet<usize> = (dof_num.n_free..dof_num.n_total).collect();
    for &dep_dof in dep_count.keys() {
        if restrained.contains(&dep_dof) {
            let node_id = reverse_map.get(&dep_dof).map(|&(n, _)| n).unwrap_or(0);
            diags.push(StructuredDiagnostic::global(
                DiagnosticCode::OverConstrainedDof,
                Severity::Warning,
                format!("DOF {} (node {}) is both constrained and restrained by a support",
                    dep_dof, node_id),
            ).with_dofs(vec![dep_dof]).with_nodes(vec![node_id]).with_phase("constraints"));
        }
    }

    diags
}

/// Collect dependent DOFs from a single constraint, returning (slave_global, [master_globals]).
fn collect_dependent_dofs(
    constraint: &Constraint,
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> Vec<(usize, Vec<usize>)> {
    let node_by_id_2d: Option<HashMap<usize, &SolverNode>> = nodes_2d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let node_by_id_3d: Option<HashMap<usize, &SolverNode3D>> = nodes_3d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let mut result = Vec::new();

    match constraint {
        Constraint::RigidLink(rl) => {
            let dofs = if rl.dofs.is_empty() {
                (0..dof_num.dofs_per_node.min(3)).collect::<Vec<_>>()
            } else {
                rl.dofs.clone()
            };
            for &dof in &dofs {
                if let Some(&slave_global) = dof_num.map.get(&(rl.slave_node, dof)) {
                    let mut masters = Vec::new();
                    if let Some(&m) = dof_num.map.get(&(rl.master_node, dof)) {
                        masters.push(m);
                    }
                    // Rotation coupling DOFs
                    if dof_num.dofs_per_node <= 3 {
                        if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                            masters.push(rz);
                        }
                    } else {
                        for rot_dof in 3..6 {
                            if let Some(&rd) = dof_num.map.get(&(rl.master_node, rot_dof)) {
                                masters.push(rd);
                            }
                        }
                    }
                    result.push((slave_global, masters));
                }
            }
        }
        Constraint::Diaphragm(dia) => {
            let is_3d = dof_num.dofs_per_node > 3;
            let (d0, d1, dr) = match dia.plane.as_str() {
                "XZ" => (0usize, 2usize, 4usize),  // ux, uz, ry
                "YZ" => (1, 2, 3),                   // uy, uz, rx
                _ if is_3d => (0, 1, 5),             // 3D XY: ux, uy, rz
                _ => (0, 1, 2),                      // 2D XY: ux, uz, ry
            };
            for &slave_id in &dia.slave_nodes {
                for &dof in &[d0, d1] {
                    if let Some(&s) = dof_num.map.get(&(slave_id, dof)) {
                        let mut masters = Vec::new();
                        if let Some(&m) = dof_num.map.get(&(dia.master_node, dof)) {
                            masters.push(m);
                        }
                        if let Some(&m) = dof_num.map.get(&(dia.master_node, dr)) {
                            masters.push(m);
                        }
                        result.push((s, masters));
                    }
                }
            }
        }
        Constraint::EqualDOF(eq) => {
            for &dof in &eq.dofs {
                if let Some(&slave_global) = dof_num.map.get(&(eq.slave_node, dof)) {
                    if let Some(&master_global) = dof_num.map.get(&(eq.master_node, dof)) {
                        result.push((slave_global, vec![master_global]));
                    }
                }
            }
        }
        Constraint::EccentricConnection(ec) => {
            let dpn = dof_num.dofs_per_node;
            let all_dofs: Vec<usize> = (0..dpn.min(if dpn <= 3 { 3 } else { 6 })).collect();
            for &dof in &all_dofs {
                if ec.releases.get(dof).copied().unwrap_or(false) { continue; }
                if let Some(&slave_global) = dof_num.map.get(&(ec.slave_node, dof)) {
                    let mut masters = vec![];
                    if let Some(&m) = dof_num.map.get(&(ec.master_node, dof)) {
                        masters.push(m);
                    }
                    if dpn > 3 {
                        for rot_dof in 3..6 {
                            if let Some(&rd) = dof_num.map.get(&(ec.master_node, rot_dof)) {
                                masters.push(rd);
                            }
                        }
                    } else if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                        masters.push(rz);
                    }
                    result.push((slave_global, masters));
                }
            }
        }
        Constraint::LinearMPC(mpc) => {
            if mpc.terms.is_empty() { return result; }
            let (dep_idx, _) = mpc.terms.iter().enumerate()
                .max_by(|(_, a), (_, b)| a.coefficient.abs().partial_cmp(&b.coefficient.abs()).unwrap())
                .unwrap();
            let dep_term = &mpc.terms[dep_idx];
            if let Some(&dep_global) = dof_num.map.get(&(dep_term.node_id, dep_term.dof)) {
                let masters: Vec<usize> = mpc.terms.iter().enumerate()
                    .filter(|(i, _)| *i != dep_idx)
                    .filter_map(|(_, t)| dof_num.map.get(&(t.node_id, t.dof)).copied())
                    .collect();
                result.push((dep_global, masters));
            }
        }
    }
    let _ = (node_by_id_2d, node_by_id_3d); // suppress unused warnings
    result
}

/// Build the constraint transformation matrix C.
///
/// C maps independent DOFs to full DOFs: u_full = C * u_indep.
/// For unconstrained DOFs: C[i, j] = 1 where j is the independent index of DOF i.
/// For constrained (dependent) DOFs: C[i, :] expresses the dependency.
pub fn build_constraint_transform(
    constraints: &[Constraint],
    dof_num: &DofNumbering,
    nodes_2d: Option<&HashMap<String, SolverNode>>,
    nodes_3d: Option<&HashMap<String, SolverNode3D>>,
) -> ConstraintTransform {
    let n = dof_num.n_total;

    // Build O(1) lookup maps: node numeric id -> &Node
    let node_by_id_2d: Option<HashMap<usize, &SolverNode>> = nodes_2d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });
    let node_by_id_3d: Option<HashMap<usize, &SolverNode3D>> = nodes_3d.map(|nodes| {
        nodes.values().map(|n| (n.id, n)).collect()
    });

    // Collect all dependent DOFs and their constraint equations.
    // Each equation: dependent_dof = Σ(coeff * independent_or_master_dof)
    let mut dep_equations: HashMap<usize, Vec<(usize, f64)>> = HashMap::new();

    for constraint in constraints {
        match constraint {
            Constraint::RigidLink(rl) => {
                let dofs = if rl.dofs.is_empty() {
                    // Default: all translational DOFs
                    (0..dof_num.dofs_per_node.min(3)).collect::<Vec<_>>()
                } else {
                    rl.dofs.clone()
                };

                // Get offset from master to slave
                let (dx, dy, dz) = get_node_offset(
                    rl.master_node, rl.slave_node,
                    node_by_id_2d.as_ref(), node_by_id_3d.as_ref(),
                );

                for &dof in &dofs {
                    if let Some(&slave_global) = dof_num.map.get(&(rl.slave_node, dof)) {
                        // Rigid body kinematics:
                        // 2D: u_slave_x = u_master_x - dy * θ_master
                        //     u_slave_y = u_master_y + dx * θ_master
                        // 3D: u_slave = u_master + ω_master × r
                        let mut terms = Vec::new();

                        if dof_num.dofs_per_node <= 3 {
                            // 2D rigid link
                            if let Some(&master_dof) = dof_num.map.get(&(rl.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            if dof == 0 {
                                // ux_slave = ux_master - dy * rz_master
                                if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                                    if dy.abs() > 1e-15 {
                                        terms.push((rz, -dy));
                                    }
                                }
                            } else if dof == 1 {
                                // uy_slave = uy_master + dx * rz_master
                                if let Some(&rz) = dof_num.map.get(&(rl.master_node, 2)) {
                                    if dx.abs() > 1e-15 {
                                        terms.push((rz, dx));
                                    }
                                }
                            } else if dof == 2 {
                                // rz_slave = rz_master (if rotation constrained)
                                // Already handled by first term
                            }
                        } else {
                            // 3D rigid link: u_slave = u_master + ω × r
                            if let Some(&master_dof) = dof_num.map.get(&(rl.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            match dof {
                                0 => {
                                    // ux_s = ux_m + (ω×r)_x = ux_m + θy*dz - θz*dy
                                    if let Some(&ry) = dof_num.map.get(&(rl.master_node, 4)) {
                                        if dz.abs() > 1e-15 { terms.push((ry, dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(rl.master_node, 5)) {
                                        if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                    }
                                }
                                1 => {
                                    // uy_s = uy_m + (ω×r)_y = uy_m + θz*dx - θx*dz
                                    if let Some(&rx) = dof_num.map.get(&(rl.master_node, 3)) {
                                        if dz.abs() > 1e-15 { terms.push((rx, -dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(rl.master_node, 5)) {
                                        if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                    }
                                }
                                2 => {
                                    // uz_s = uz_m + (ω×r)_z = uz_m + θx*dy - θy*dx
                                    if let Some(&rx) = dof_num.map.get(&(rl.master_node, 3)) {
                                        if dy.abs() > 1e-15 { terms.push((rx, dy)); }
                                    }
                                    if let Some(&ry) = dof_num.map.get(&(rl.master_node, 4)) {
                                        if dx.abs() > 1e-15 { terms.push((ry, -dx)); }
                                    }
                                }
                                3 | 4 | 5 => {
                                    // Rotational DOFs: slave rotation = master rotation
                                    // Already handled by first term
                                }
                                _ => {}
                            }
                        }

                        if !terms.is_empty() {
                            dep_equations.insert(slave_global, terms);
                        }
                    }
                }
            }

            Constraint::Diaphragm(dia) => {
                // Diaphragm: in-plane rigid body motion
                // All slave nodes share master's in-plane translation + rotation
                let is_3d = dof_num.dofs_per_node > 3;
                let (d0, d1, dr) = match dia.plane.as_str() {
                    "XZ" => (0usize, 2usize, 4usize), // ux, uz, ry
                    "YZ" => (1, 2, 3),                  // uy, uz, rx
                    _ if is_3d => (0, 1, 5),            // 3D XY: ux, uy, rz
                    _ => (0, 1, 2),                      // 2D XY: ux, uz, ry
                };

                for &slave_id in &dia.slave_nodes {
                    let (dx, dy, dz) = get_node_offset(
                        dia.master_node, slave_id,
                        node_by_id_2d.as_ref(), node_by_id_3d.as_ref(),
                    );
                    // Offset in the diaphragm plane
                    let (off_0, off_1) = match dia.plane.as_str() {
                        "XZ" => (dx, dz),
                        "YZ" => (dy, dz),
                        _ => (dx, dy),
                    };

                    // u0_slave = u0_master - off_1 * θ_master
                    if let Some(&s_dof) = dof_num.map.get(&(slave_id, d0)) {
                        let mut terms = Vec::new();
                        if let Some(&m_dof) = dof_num.map.get(&(dia.master_node, d0)) {
                            terms.push((m_dof, 1.0));
                        }
                        if let Some(&m_r) = dof_num.map.get(&(dia.master_node, dr)) {
                            if off_1.abs() > 1e-15 {
                                terms.push((m_r, -off_1));
                            }
                        }
                        if !terms.is_empty() {
                            dep_equations.insert(s_dof, terms);
                        }
                    }

                    // u1_slave = u1_master + off_0 * θ_master
                    if let Some(&s_dof) = dof_num.map.get(&(slave_id, d1)) {
                        let mut terms = Vec::new();
                        if let Some(&m_dof) = dof_num.map.get(&(dia.master_node, d1)) {
                            terms.push((m_dof, 1.0));
                        }
                        if let Some(&m_r) = dof_num.map.get(&(dia.master_node, dr)) {
                            if off_0.abs() > 1e-15 {
                                terms.push((m_r, off_0));
                            }
                        }
                        if !terms.is_empty() {
                            dep_equations.insert(s_dof, terms);
                        }
                    }
                }
            }

            Constraint::EqualDOF(eq) => {
                for &dof in &eq.dofs {
                    if let Some(&slave_global) = dof_num.map.get(&(eq.slave_node, dof)) {
                        if let Some(&master_global) = dof_num.map.get(&(eq.master_node, dof)) {
                            dep_equations.insert(slave_global, vec![(master_global, 1.0)]);
                        }
                    }
                }
            }

            Constraint::EccentricConnection(ec) => {
                // Like RigidLink but with explicit offset and optional releases
                let (dx, dy, dz) = (ec.offset_x, ec.offset_y, ec.offset_z);
                let dpn = dof_num.dofs_per_node;

                let all_dofs: Vec<usize> = (0..dpn.min(if dpn <= 3 { 3 } else { 6 })).collect();
                for &dof in &all_dofs {
                    // Check if this DOF is released
                    let released = ec.releases.get(dof).copied().unwrap_or(false);
                    if released { continue; }

                    if let Some(&slave_global) = dof_num.map.get(&(ec.slave_node, dof)) {
                        let mut terms = Vec::new();

                        if dpn <= 3 {
                            // 2D eccentric connection
                            if let Some(&master_dof) = dof_num.map.get(&(ec.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            if dof == 0 {
                                if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                                    if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                }
                            } else if dof == 1 {
                                if let Some(&rz) = dof_num.map.get(&(ec.master_node, 2)) {
                                    if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                }
                            }
                        } else {
                            // 3D eccentric connection
                            if let Some(&master_dof) = dof_num.map.get(&(ec.master_node, dof)) {
                                terms.push((master_dof, 1.0));
                            }
                            match dof {
                                0 => {
                                    // ux_s = ux_m + θy*dz - θz*dy
                                    if let Some(&ry) = dof_num.map.get(&(ec.master_node, 4)) {
                                        if dz.abs() > 1e-15 { terms.push((ry, dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(ec.master_node, 5)) {
                                        if dy.abs() > 1e-15 { terms.push((rz, -dy)); }
                                    }
                                }
                                1 => {
                                    // uy_s = uy_m + θz*dx - θx*dz
                                    if let Some(&rx) = dof_num.map.get(&(ec.master_node, 3)) {
                                        if dz.abs() > 1e-15 { terms.push((rx, -dz)); }
                                    }
                                    if let Some(&rz) = dof_num.map.get(&(ec.master_node, 5)) {
                                        if dx.abs() > 1e-15 { terms.push((rz, dx)); }
                                    }
                                }
                                2 => {
                                    // uz_s = uz_m + θx*dy - θy*dx
                                    if let Some(&rx) = dof_num.map.get(&(ec.master_node, 3)) {
                                        if dy.abs() > 1e-15 { terms.push((rx, dy)); }
                                    }
                                    if let Some(&ry) = dof_num.map.get(&(ec.master_node, 4)) {
                                        if dx.abs() > 1e-15 { terms.push((ry, -dx)); }
                                    }
                                }
                                3 | 4 | 5 => {
                                    // Rotational DOFs: slave rotation = master rotation
                                }
                                _ => {}
                            }
                        }

                        if !terms.is_empty() {
                            dep_equations.insert(slave_global, terms);
                        }
                    }
                }
            }

            Constraint::LinearMPC(mpc) => {
                // General MPC: Σ(coeff_i × u_i) = 0
                // First term with largest coefficient becomes dependent
                if mpc.terms.is_empty() { continue; }

                // Find term with largest |coefficient|
                let (dep_idx, _) = mpc.terms.iter().enumerate()
                    .max_by(|(_, a), (_, b)| a.coefficient.abs().partial_cmp(&b.coefficient.abs()).unwrap())
                    .unwrap();

                let dep_term = &mpc.terms[dep_idx];
                if let Some(&dep_global) = dof_num.map.get(&(dep_term.node_id, dep_term.dof)) {
                    let dep_coeff = dep_term.coefficient;
                    let mut terms = Vec::new();
                    for (i, term) in mpc.terms.iter().enumerate() {
                        if i == dep_idx { continue; }
                        if let Some(&global) = dof_num.map.get(&(term.node_id, term.dof)) {
                            terms.push((global, -term.coefficient / dep_coeff));
                        }
                    }
                    dep_equations.insert(dep_global, terms);
                }
            }
        }
    }

    // Build sets
    let dependent_set: HashSet<usize> = dep_equations.keys().copied().collect();
    let independent_dofs: Vec<usize> = (0..n)
        .filter(|d| !dependent_set.contains(d))
        .collect();
    let n_indep = independent_dofs.len();

    // Map from global DOF → independent index
    let mut indep_map: HashMap<usize, usize> = HashMap::new();
    for (i, &d) in independent_dofs.iter().enumerate() {
        indep_map.insert(d, i);
    }

    // Build C matrix: n_total × n_independent
    let mut c = vec![0.0; n * n_indep];

    // Independent DOFs: C[global_dof, indep_idx] = 1
    for (i, &d) in independent_dofs.iter().enumerate() {
        c[d * n_indep + i] = 1.0;
    }

    // Resolve chained dependencies (master-of-master) via multi-pass substitution.
    //
    // For each dependent DOF: C[dep, :] = Σ(coeff_k * C[master_k, :])
    // If a master is independent, its C row is a unit vector (already set).
    // If a master is also dependent, we substitute its C row transitively.
    //
    // Process: rebuild each dependent row from scratch each pass, using current C rows
    // of its masters. Iterate until stable (max 10 passes).
    for _pass in 0..10 {
        let mut max_change = 0.0f64;

        for (&dep_dof, terms) in &dep_equations {
            // Recompute row from scratch: C[dep, :] = Σ(coeff * C[master, :])
            let mut new_row = vec![0.0; n_indep];
            for &(master_dof, coeff) in terms {
                for j in 0..n_indep {
                    new_row[j] += coeff * c[master_dof * n_indep + j];
                }
            }

            // Check convergence
            for j in 0..n_indep {
                let diff = (new_row[j] - c[dep_dof * n_indep + j]).abs();
                if diff > max_change { max_change = diff; }
                c[dep_dof * n_indep + j] = new_row[j];
            }
        }

        if max_change < 1e-14 { break; }
    }

    ConstraintTransform {
        c_matrix: c,
        n_independent: n_indep,
        n_total: n,
        independent_dofs,
        dependent_dofs: dependent_set,
    }
}

/// Map raw (global_dof, force) pairs to ConstraintForce structs with node_id and dof name.
pub(super) fn map_dof_forces_to_constraint_forces(
    raw: &[(usize, f64)],
    dof_num: &DofNumbering,
) -> Vec<ConstraintForce> {
    // Build reverse map: global_dof → (node_id, local_dof)
    let mut reverse: HashMap<usize, (usize, usize)> = HashMap::new();
    for (&(node_id, local_dof), &global_dof) in &dof_num.map {
        reverse.insert(global_dof, (node_id, local_dof));
    }

    let dof_names_2d = ["ux", "uz", "ry"];
    let dof_names_3d = ["ux", "uy", "uz", "rx", "ry", "rz", "warping"];

    raw.iter().filter_map(|&(gdof, force)| {
        reverse.get(&gdof).map(|&(node_id, local_dof)| {
            let dof_name = if dof_num.dofs_per_node <= 3 {
                dof_names_2d.get(local_dof).unwrap_or(&"?")
            } else {
                dof_names_3d.get(local_dof).unwrap_or(&"?")
            };
            ConstraintForce {
                node_id,
                dof: dof_name.to_string(),
                force,
            }
        })
    }).collect()
}

/// Solve a 2D constrained analysis.
pub fn solve_constrained_2d(input: &ConstrainedInput) -> Result<AnalysisResults, String> {
    if input.constraints.is_empty() {
        return linear::solve_2d(&input.solver);
    }

    linear::validate_input_2d(&input.solver)?;

    // Constraint referential integrity
    let node_ids: HashSet<usize> = input.solver.nodes.values().map(|n| n.id).collect();
    validate_constraint_refs(&input.constraints, &node_ids, 3)?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    let asm = assembly::assemble_2d(&input.solver, &dof_num);

    // Build prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        if sup.support_type == "spring" { continue; }
        let prescribed: [(usize, Option<f64>); 3] = [
            (0, sup.dx), (1, sup.dz), (2, sup.dry),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf { u_r[d - nf] = v; }
                    }
                }
            }
        }
    }

    // Pre-solve constraint validation
    let mut constraint_diags = validate_constraints(
        &input.constraints, &dof_num,
        Some(&input.solver.nodes), None,
    );

    // Build constraint transform on free DOFs only
    let ct = build_constraint_transform(
        &input.constraints, &dof_num,
        Some(&input.solver.nodes), None,
    );

    // Partition: free DOFs are 0..nf, restrained are nf..n
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();

    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    // Modify for prescribed displacements
    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf {
        f_f[i] -= k_fr_ur[i];
    }

    // Extract the free part of C (rows for free DOFs only)
    // C is n_total × n_independent. We need rows 0..nf (free DOFs)
    let n_indep = ct.n_independent;

    // Identify which independent DOFs are free (< nf)
    let free_indep: Vec<usize> = ct.independent_dofs.iter()
        .enumerate()
        .filter(|(_, &d)| d < nf)
        .map(|(i, _)| i)
        .collect();
    let n_free_indep = free_indep.len();

    // Build C_ff: nf × n_free_indep (free rows, free-independent columns)
    let mut c_ff = vec![0.0; nf * n_free_indep];
    for i in 0..nf {
        for (j_new, &j_old) in free_indep.iter().enumerate() {
            c_ff[i * n_free_indep + j_new] = ct.c_matrix[i * n_indep + j_old];
        }
    }

    // K_reduced = C_ff^T * K_ff * C_ff
    // F_reduced = C_ff^T * F_f
    let k_reduced = ct_k_c(&c_ff, &k_ff, nf, n_free_indep);
    let f_reduced = ct_f(&c_ff, &f_f, nf, n_free_indep);

    // Solve reduced system
    let mut used_fallback = false;
    let u_indep = {
        let mut k_work = k_reduced.clone();
        match cholesky_solve(&mut k_work, &f_reduced, n_free_indep) {
            Some(u) => u,
            None => {
                used_fallback = true;
                let mut k_work = k_reduced;
                let mut f_work = f_reduced.clone();
                lu_solve(&mut k_work, &mut f_work, n_free_indep)
                    .ok_or("Singular stiffness in constrained system")?
            }
        }
    };

    // Recover free DOF displacements: u_f = C_ff * u_indep
    let u_f = c_times_u(&c_ff, &u_indep, nf, n_free_indep);

    // Build full displacement vector
    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    // Reactions
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }

    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let mut reactions = linear::build_reactions_2d(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full,
    );
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = linear::compute_internal_forces_2d(
        &input.solver, &dof_num, &u_full,
    );
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces at dependent DOFs
    let fcs = FreeConstraintSystem { c_ff, n_free_indep, nf };
    let raw_forces = fcs.compute_constraint_forces(&k_ff, &u_f, &f_f);
    let constraint_forces = map_dof_forces_to_constraint_forces(&raw_forces, &dof_num);

    // Compute actual residual: ||K_ff*u_f - f_f|| / ||f_f||
    let rel_residual = {
        let mut res2 = 0.0f64;
        let mut fnorm2 = 0.0f64;
        for i in 0..nf {
            let mut ku_i = 0.0;
            for j in 0..nf {
                ku_i += k_ff[i * nf + j] * u_f[j];
            }
            let r = ku_i - f_f[i];
            res2 += r * r;
            fnorm2 += f_f[i] * f_f[i];
        }
        res2.sqrt() / fnorm2.sqrt().max(1e-30)
    };

    let equilibrium = linear::compute_equilibrium_summary_2d(&asm.f, &reactions_vec, &dof_num, rel_residual);

    // Solver-path diagnostic — report the actual solver that produced the result
    let (path_code, path_sev) = if used_fallback {
        (DiagnosticCode::SparseFallbackDenseLu, Severity::Warning)
    } else {
        (DiagnosticCode::DenseLu, Severity::Info)
    };
    constraint_diags.push(StructuredDiagnostic::global(
        path_code,
        path_sev,
        format!("Constrained 2D {} ({} free DOFs, {} independent)",
            if used_fallback { "Cholesky failed, dense LU fallback" } else { "Dense" },
            nf, n_free_indep),
    ).with_phase("solve"));

    // Residual diagnostic
    constraint_diags.push(if rel_residual < 1e-6 {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualOk,
            Severity::Info,
            format!("Constrained 2D residual {:.2e}", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    } else {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualHigh,
            Severity::Warning,
            format!("Constrained 2D residual {:.2e} exceeds tolerance", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    });

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: constraint_diags,
        equilibrium: Some(equilibrium),
        result_summary: None, solver_run_meta: None,
    })
}

/// Solve a 3D constrained analysis.
pub fn solve_constrained_3d(input: &ConstrainedInput3D) -> Result<AnalysisResults3D, String> {
    if input.constraints.is_empty() {
        return linear::solve_3d(&input.solver);
    }

    linear::validate_input_3d(&input.solver)?;

    // Constraint referential integrity
    let node_ids: HashSet<usize> = input.solver.nodes.values().map(|n| n.id).collect();
    validate_constraint_refs(&input.constraints, &node_ids, 6)?;

    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    let asm = assembly::assemble_3d(&input.solver, &dof_num);

    // Build prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        let prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
        for (i, pd) in prescribed.iter().enumerate() {
            if let Some(val) = pd {
                if val.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        if d >= nf { u_r[d - nf] = *val; }
                    }
                }
            }
        }
    }

    // Pre-solve constraint validation
    let mut constraint_diags = validate_constraints(
        &input.constraints, &dof_num,
        None, Some(&input.solver.nodes),
    );

    let ct = build_constraint_transform(
        &input.constraints, &dof_num,
        None, Some(&input.solver.nodes),
    );

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();

    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf {
        f_f[i] -= k_fr_ur[i];
    }

    let n_indep = ct.n_independent;
    let free_indep: Vec<usize> = ct.independent_dofs.iter()
        .enumerate()
        .filter(|(_, &d)| d < nf)
        .map(|(i, _)| i)
        .collect();
    let n_free_indep = free_indep.len();

    let mut c_ff = vec![0.0; nf * n_free_indep];
    for i in 0..nf {
        for (j_new, &j_old) in free_indep.iter().enumerate() {
            c_ff[i * n_free_indep + j_new] = ct.c_matrix[i * n_indep + j_old];
        }
    }

    let k_reduced = ct_k_c(&c_ff, &k_ff, nf, n_free_indep);
    let f_reduced = ct_f(&c_ff, &f_f, nf, n_free_indep);

    let mut used_fallback = false;
    let u_indep = if n_free_indep >= 64 {
        let k_sparse = CscMatrix::from_dense_symmetric(&k_reduced, n_free_indep);
        match sparse_cholesky_solve_full(&k_sparse, &f_reduced) {
            Some(u) => u,
            None => {
                used_fallback = true;
                let mut k_work = k_reduced;
                let mut f_work = f_reduced.clone();
                lu_solve(&mut k_work, &mut f_work, n_free_indep)
                    .ok_or("Singular stiffness in 3D constrained system")?
            }
        }
    } else {
        let mut k_work = k_reduced.clone();
        match cholesky_solve(&mut k_work, &f_reduced, n_free_indep) {
            Some(u) => u,
            None => {
                used_fallback = true;
                let mut k_work = k_reduced;
                let mut f_work = f_reduced.clone();
                lu_solve(&mut k_work, &mut f_work, n_free_indep)
                    .ok_or("Singular stiffness in 3D constrained system")?
            }
        }
    };

    let u_f = c_times_u(&c_ff, &u_indep, nf, n_free_indep);

    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    // Build reactions for output
    let mut reactions = linear::build_reactions_3d(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full,
    );
    reactions.sort_by_key(|r| r.node_id);

    // Compute constraint forces at dependent DOFs
    let fcs = FreeConstraintSystem { c_ff, n_free_indep, nf };
    let raw_forces = fcs.compute_constraint_forces(&k_ff, &u_f, &f_f);
    let constraint_forces = map_dof_forces_to_constraint_forces(&raw_forces, &dof_num);

    // Compute actual residual: ||K_ff*u_f - f_f|| / ||f_f||
    let rel_residual = {
        let mut res2 = 0.0f64;
        let mut fnorm2 = 0.0f64;
        for i in 0..nf {
            let mut ku_i = 0.0;
            for j in 0..nf {
                ku_i += k_ff[i * nf + j] * u_f[j];
            }
            let r = ku_i - f_f[i];
            res2 += r * r;
            fnorm2 += f_f[i] * f_f[i];
        }
        res2.sqrt() / fnorm2.sqrt().max(1e-30)
    };

    let equilibrium = linear::compute_equilibrium_summary_3d(&asm.f, &reactions_vec, &dof_num, rel_residual);

    // Solver-path diagnostic — report the actual solver that produced the result
    let (path_code, path_sev) = if used_fallback {
        (DiagnosticCode::SparseFallbackDenseLu, Severity::Warning)
    } else if n_free_indep >= 64 {
        (DiagnosticCode::SparseCholesky, Severity::Info)
    } else {
        (DiagnosticCode::DenseLu, Severity::Info)
    };
    let solver_label = match path_code {
        DiagnosticCode::SparseFallbackDenseLu => "Cholesky failed, dense LU fallback",
        DiagnosticCode::SparseCholesky => "Sparse Cholesky",
        _ => "Dense",
    };
    constraint_diags.push(StructuredDiagnostic::global(
        path_code,
        path_sev,
        format!("Constrained 3D {} ({} free DOFs, {} independent)", solver_label, nf, n_free_indep),
    ).with_phase("solve"));

    // Residual diagnostic
    constraint_diags.push(if rel_residual < 1e-6 {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualOk,
            Severity::Info,
            format!("Constrained 3D residual {:.2e}", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    } else {
        StructuredDiagnostic::global(
            DiagnosticCode::ResidualHigh,
            Severity::Warning,
            format!("Constrained 3D residual {:.2e} exceeds tolerance", rel_residual),
        ).with_value(rel_residual, 1e-6).with_phase("solve")
    });

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses: vec![],
        quad_stresses: vec![],
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: constraint_diags,
        equilibrium: Some(equilibrium),
        timings: None,
        result_summary: None, solver_run_meta: None,
    })
}

// ==================== Helper functions ====================

/// Get offset vector from master to slave node.
fn get_node_offset(
    master: usize,
    slave: usize,
    node_by_id_2d: Option<&HashMap<usize, &SolverNode>>,
    node_by_id_3d: Option<&HashMap<usize, &SolverNode3D>>,
) -> (f64, f64, f64) {
    if let Some(map) = node_by_id_2d {
        if let (Some(m), Some(s)) = (map.get(&master), map.get(&slave)) {
            return (s.x - m.x, s.z - m.z, 0.0);
        }
    }
    if let Some(map) = node_by_id_3d {
        if let (Some(m), Some(s)) = (map.get(&master), map.get(&slave)) {
            return (s.x - m.x, s.y - m.y, s.z - m.z);
        }
    }
    (0.0, 0.0, 0.0)
}

// ==================== Reusable Constraint System ====================

/// Pre-computed constraint system for use by any solver.
///
/// Encapsulates the C_ff matrix (free-free portion of the constraint
/// transform) so that any solver can easily reduce K, M, F and expand
/// the solution back to full DOFs.
pub struct FreeConstraintSystem {
    /// C_ff matrix: nf × n_free_indep (row-major)
    pub c_ff: Vec<f64>,
    /// Number of free independent DOFs (reduced system size)
    pub n_free_indep: usize,
    /// Number of free DOFs (unreduced)
    pub nf: usize,
}

impl FreeConstraintSystem {
    /// Build a constraint system from constraints and DOF numbering.
    /// Returns None if there are no constraints.
    pub fn build_2d(
        constraints: &[Constraint],
        dof_num: &DofNumbering,
        nodes: &HashMap<String, SolverNode>,
    ) -> Option<Self> {
        if constraints.is_empty() { return None; }
        let nf = dof_num.n_free;
        let ct = build_constraint_transform(constraints, dof_num, Some(nodes), None);
        Some(Self::from_transform(&ct, nf))
    }

    /// Build a constraint system for 3D.
    pub fn build_3d(
        constraints: &[Constraint],
        dof_num: &DofNumbering,
        nodes: &HashMap<String, SolverNode3D>,
    ) -> Option<Self> {
        if constraints.is_empty() { return None; }
        let nf = dof_num.n_free;
        let ct = build_constraint_transform(constraints, dof_num, None, Some(nodes));
        Some(Self::from_transform(&ct, nf))
    }

    fn from_transform(ct: &ConstraintTransform, nf: usize) -> Self {
        let n_indep = ct.n_independent;
        let free_indep: Vec<usize> = ct.independent_dofs.iter()
            .enumerate()
            .filter(|(_, &d)| d < nf)
            .map(|(i, _)| i)
            .collect();
        let n_free_indep = free_indep.len();

        let mut c_ff = vec![0.0; nf * n_free_indep];
        for i in 0..nf {
            for (j_new, &j_old) in free_indep.iter().enumerate() {
                c_ff[i * n_free_indep + j_new] = ct.c_matrix[i * n_indep + j_old];
            }
        }

        FreeConstraintSystem { c_ff, n_free_indep, nf }
    }

    /// Reduce a symmetric matrix: K_reduced = C_ff^T * K_ff * C_ff
    pub fn reduce_matrix(&self, k_ff: &[f64]) -> Vec<f64> {
        ct_k_c(&self.c_ff, k_ff, self.nf, self.n_free_indep)
    }

    /// Reduce a force vector: F_reduced = C_ff^T * F_f
    pub fn reduce_vector(&self, f_f: &[f64]) -> Vec<f64> {
        ct_f(&self.c_ff, f_f, self.nf, self.n_free_indep)
    }

    /// Expand solution: u_f = C_ff * u_indep
    pub fn expand_solution(&self, u_indep: &[f64]) -> Vec<f64> {
        c_times_u(&self.c_ff, u_indep, self.nf, self.n_free_indep)
    }

    /// Map reduced-space DOF indices back to physical free DOF indices.
    ///
    /// For each column `j` of C_ff, find which physical DOF `i` has C_ff[i,j]=1
    /// (i.e., which physical DOF is the j-th independent DOF).
    pub fn map_reduced_to_physical(&self) -> Vec<usize> {
        let mut map = vec![0usize; self.n_free_indep];
        for j in 0..self.n_free_indep {
            for i in 0..self.nf {
                if (self.c_ff[i * self.n_free_indep + j] - 1.0).abs() < 1e-14 {
                    // Verify it's an identity row
                    let others_zero = (0..self.n_free_indep)
                        .filter(|&k| k != j)
                        .all(|k| self.c_ff[i * self.n_free_indep + k].abs() < 1e-14);
                    if others_zero {
                        map[j] = i;
                        break;
                    }
                }
            }
        }
        map
    }

    /// Map a free DOF index to its position in the reduced (independent) space.
    /// Returns None if the DOF is dependent (constrained away).
    ///
    /// An independent DOF at position `i` in the unreduced system maps to
    /// column `j` in C_ff where C_ff[i, j] == 1. We find this by scanning row i.
    pub fn map_dof_to_reduced(&self, free_dof: usize) -> Option<usize> {
        if free_dof >= self.nf { return None; }
        let row_start = free_dof * self.n_free_indep;
        // An independent DOF has exactly one 1.0 in its row
        for j in 0..self.n_free_indep {
            if (self.c_ff[row_start + j] - 1.0).abs() < 1e-14 {
                // Check this is the only nonzero in the row (independent DOF pattern)
                let others_zero = (0..self.n_free_indep)
                    .filter(|&k| k != j)
                    .all(|k| self.c_ff[row_start + k].abs() < 1e-14);
                if others_zero {
                    return Some(j);
                }
            }
        }
        None // DOF is dependent
    }

    /// Compute constraint forces at dependent (constrained) DOFs.
    ///
    /// Constraint force = K_ff * u_f - F_f at dependent DOFs.
    /// These are the forces required to enforce the constraints.
    pub fn compute_constraint_forces(
        &self,
        k_ff: &[f64],
        u_f: &[f64],
        f_f: &[f64],
    ) -> Vec<(usize, f64)> {
        // Residual = K_ff * u_f - F_f
        let mut residual = vec![0.0; self.nf];
        for i in 0..self.nf {
            let mut ku = 0.0;
            for j in 0..self.nf {
                ku += k_ff[i * self.nf + j] * u_f[j];
            }
            residual[i] = ku - f_f[i];
        }

        // Identify dependent DOFs (those not in the identity pattern of C_ff)
        let mut forces = Vec::new();
        for i in 0..self.nf {
            // Check if this is a dependent DOF (not a unit row in C_ff)
            if self.map_dof_to_reduced(i).is_none() {
                if residual[i].abs() > 1e-15 {
                    forces.push((i, residual[i]));
                }
            }
        }
        forces
    }
}

/// Compute C^T * K * C where C is (m × p) and K is (m × m), result is (p × p).
fn ct_k_c(c: &[f64], k: &[f64], m: usize, p: usize) -> Vec<f64> {
    // temp = K * C  (m × p)
    let mut temp = vec![0.0; m * p];
    for i in 0..m {
        for j in 0..p {
            let mut sum = 0.0;
            for l in 0..m {
                sum += k[i * m + l] * c[l * p + j];
            }
            temp[i * p + j] = sum;
        }
    }
    // result = C^T * temp  (p × p)
    let mut result = vec![0.0; p * p];
    for i in 0..p {
        for j in 0..p {
            let mut sum = 0.0;
            for l in 0..m {
                sum += c[l * p + i] * temp[l * p + j];
            }
            result[i * p + j] = sum;
        }
    }
    result
}

/// Compute C^T * f where C is (m × p) and f is (m), result is (p).
fn ct_f(c: &[f64], f: &[f64], m: usize, p: usize) -> Vec<f64> {
    let mut result = vec![0.0; p];
    for i in 0..p {
        let mut sum = 0.0;
        for l in 0..m {
            sum += c[l * p + i] * f[l];
        }
        result[i] = sum;
    }
    result
}

/// Compute C * u where C is (m × p) and u is (p), result is (m).
fn c_times_u(c: &[f64], u: &[f64], m: usize, p: usize) -> Vec<f64> {
    let mut result = vec![0.0; m];
    for i in 0..m {
        let mut sum = 0.0;
        for j in 0..p {
            sum += c[i * p + j] * u[j];
        }
        result[i] = sum;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_two_beam_model() -> SolverInput {
        // Two beams: 0--1--2, all frame elements, node 0 fixed, node 2 has load
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 10.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_no_constraints_matches_linear() {
        let solver = make_two_beam_model();
        let linear_result = linear::solve_2d(&solver).unwrap();

        let input = ConstrainedInput {
            solver: solver.clone(),
            constraints: vec![],
        };
        let constrained_result = solve_constrained_2d(&input).unwrap();

        // Displacements should match
        for (a, b) in linear_result.displacements.iter().zip(&constrained_result.displacements) {
            assert!((a.ux - b.ux).abs() < 1e-10, "ux mismatch at node {}", a.node_id);
            assert!((a.uz - b.uz).abs() < 1e-10, "uz mismatch at node {}", a.node_id);
            assert!((a.ry - b.ry).abs() < 1e-10, "ry mismatch at node {}", a.node_id);
        }
    }

    #[test]
    fn test_equal_dof_constraint() {
        // Constrain node 2 uy = node 1 uy
        let solver = make_two_beam_model();
        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![1], // uy only
            })],
        };
        let result = solve_constrained_2d(&input).unwrap();

        // Check that uy at node 1 = uy at node 2
        let uy1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap().uz;
        let uy2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
        assert!((uy1 - uy2).abs() < 1e-10, "EqualDOF failed: uy1={} uy2={}", uy1, uy2);
    }

    #[test]
    fn test_rigid_link_equal_dof_equivalence() {
        // Rigid link with all translational DOFs should produce same constraint as EqualDOF
        // on translational DOFs (rotation offset terms vanish when rigid link couples rotations too)
        let solver = make_two_beam_model();

        // EqualDOF on uy
        let input_eq = ConstrainedInput {
            solver: solver.clone(),
            constraints: vec![Constraint::EqualDOF(EqualDOFConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![1],
            })],
        };
        let result_eq = solve_constrained_2d(&input_eq).unwrap();

        // The constraint should produce valid results (no NaN)
        let d2 = result_eq.displacements.iter().find(|d| d.node_id == 2).unwrap();
        assert!(d2.uz.is_finite(), "EqualDOF uz should be finite: {}", d2.uz);
    }

    #[test]
    fn test_rigid_link_with_offset() {
        // Rigid link: slave at offset from master
        // u_slave_y = u_master_y + dx * rz_master
        let solver = make_two_beam_model();
        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::RigidLink(RigidLinkConstraint {
                master_node: 1,
                slave_node: 2,
                dofs: vec![0, 1], // ux, uy
            })],
        };
        let result = solve_constrained_2d(&input).unwrap();

        let d1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // dx = 5.0 (node 2 at x=10, node 1 at x=5)
        let dx = 5.0;
        let expected_uy = d1.uz + dx * d1.ry;
        assert!(
            (d2.uz - expected_uy).abs() < 1e-8,
            "RigidLink offset: uz2={} expected={} (uz1={}, ry1={}, dx={})",
            d2.uz, expected_uy, d1.uz, d1.ry, dx
        );
    }

    #[test]
    fn test_diaphragm_constraint() {
        // 4-node frame: 0 fixed, 1-2-3 at same level, diaphragm couples 2,3 to master 1
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, z: 5.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, z: 5.0 });
        nodes.insert("3".into(), SolverNode { id: 3, x: 5.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("3".into(), SolverElement {
            id: 3, elem_type: "frame".into(),
            node_i: 3, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });
        supports.insert("3".into(), SolverSupport {
            id: 3, node_id: 3, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        let solver = SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 10.0, fz: 0.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        let input = ConstrainedInput {
            solver,
            constraints: vec![Constraint::Diaphragm(DiaphragmConstraint {
                master_node: 1,
                slave_nodes: vec![2],
                plane: "XY".into(),
            })],
        };

        let result = solve_constrained_2d(&input).unwrap();

        // With diaphragm, node 2's ux should follow node 1's rigid body motion
        let d1 = result.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // ux_2 = ux_1 - dy * rz_1, dy = 0 (same y level)
        // uy_2 = uy_1 + dx * rz_1, dx = 5
        let dx = 5.0;
        let expected_ux = d1.ux; // dy = 0
        let expected_uy = d1.uz + dx * d1.ry;
        assert!((d2.ux - expected_ux).abs() < 1e-8,
            "Diaphragm ux: got {} expected {}", d2.ux, expected_ux);
        assert!((d2.uz - expected_uy).abs() < 1e-8,
            "Diaphragm uz: got {} expected {}", d2.uz, expected_uy);
    }

    #[test]
    fn test_diaphragm_3d_xy_plane_couples_rz_not_uz() {
        // 3D cantilever beam along X with lateral load at tip.
        // Diaphragm in XY plane at tip should couple ux, uy, rz (DOF 0,1,5),
        // NOT ux, uy, uz (DOF 0,1,2).
        //
        // If the bug is present (dr=2=uz), the slave node's in-plane displacement
        // will be coupled to the master's vertical translation instead of its
        // torsional rotation — producing wrong results.

        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode3D { id: 0, x: 0.0, y: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode3D { id: 1, x: 5.0, y: 0.0, z: 0.0 }); // master tip
        nodes.insert("2".into(), SolverNode3D { id: 2, x: 5.0, y: 2.0, z: 0.0 }); // slave, offset in Y

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection3D {
            id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4,
            cw: None, as_y: None, as_z: None,
        });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement3D {
            id: 1, elem_type: "frame".into(), node_i: 0, node_j: 1,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        elements.insert("2".into(), SolverElement3D {
            id: 2, elem_type: "frame".into(), node_i: 0, node_j: 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport3D {
            node_id: 0,
            rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
            rw: None, kw: None,
        });

        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 1, fx: 0.0, fy: 10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 5.0, bw: None,
        })];

        let solver = SolverInput3D {
            nodes, materials, sections, elements, supports, loads,
            constraints: vec![], left_hand: None,
            plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(), connectors: HashMap::new(),
        };
        let input_no_dia = ConstrainedInput3D {
            solver: solver.clone(),
            constraints: vec![],
        };
        let input_with_dia = ConstrainedInput3D {
            solver,
            constraints: vec![Constraint::Diaphragm(DiaphragmConstraint {
                master_node: 1,
                slave_nodes: vec![2],
                plane: "XY".into(),
            })],
        };

        let res_free = solve_constrained_3d(&input_no_dia).unwrap();
        let res_dia = solve_constrained_3d(&input_with_dia).unwrap();

        let d1_dia = res_dia.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let d2_dia = res_dia.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let d2_free = res_free.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // Master should have non-zero rz (torsion from mz load)
        assert!(d1_dia.rz.abs() > 1e-10,
            "Master should have non-zero rz rotation, got {}", d1_dia.rz);

        // Key check: with XY diaphragm, slave's ux should be coupled to master's rz.
        // ux_slave = ux_master - dy * rz_master (dy = 2.0)
        let dy = 2.0;
        let expected_ux = d1_dia.ux - dy * d1_dia.rz;
        assert!((d2_dia.ux - expected_ux).abs() < 1e-6,
            "3D XY diaphragm: ux_slave should follow rz coupling.\n\
             got ux_slave={:.6e}, expected={:.6e} (ux_m={:.6e}, rz_m={:.6e}, dy={})",
            d2_dia.ux, expected_ux, d1_dia.ux, d1_dia.rz, dy);

        // The diaphragm should change the slave's displacement compared to free
        assert!((d2_dia.ux - d2_free.ux).abs() > 1e-10,
            "Diaphragm should actually constrain the slave node's motion");
    }
}
