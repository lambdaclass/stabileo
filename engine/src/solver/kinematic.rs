use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::constraints::FreeConstraintSystem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== Result Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KinematicResult {
    pub degree: i32,
    pub classification: String,
    pub mechanism_modes: usize,
    pub mechanism_nodes: Vec<usize>,
    pub unconstrained_dofs: Vec<UnconstrainedDof>,
    pub diagnosis: String,
    pub is_solvable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnconstrainedDof {
    pub node_id: usize,
    pub dof: String,
}

// ==================== 2D Kinematic Analysis ====================

/// Count support restraints for 2D.
fn count_support_restraints_2d(sup: &SolverSupport) -> (i32, bool) {
    let mut r = 0i32;
    let mut has_rot = false;

    match sup.support_type.as_str() {
        "fixed" => { r = 3; has_rot = true; }
        "pinned" => { r = 2; }
        "rollerX" | "rollerY" | "inclinedRoller" => { r = 1; }
        "guidedX" | "guidedY" => { r = 2; has_rot = true; }
        "spring" => {
            if sup.kx.unwrap_or(0.0) > 0.0 { r += 1; }
            if sup.ky.unwrap_or(0.0) > 0.0 { r += 1; }
            if sup.kz.unwrap_or(0.0) > 0.0 { r += 1; has_rot = true; }
        }
        _ => {}
    }

    (r, has_rot)
}

/// Compute the static degree of indeterminacy for a 2D structure.
/// Frame: GH = 3*m_frame + m_truss + r - 3*n - c
/// Pure truss: GH = m + r - 2*n
fn compute_static_degree_2d(input: &SolverInput) -> (i32, HashMap<usize, i32>) {
    let has_frames = input.elements.values().any(|e| e.elem_type == "frame");

    // Count support restraints
    let mut r = 0i32;
    let mut rot_restrained_nodes = std::collections::HashSet::new();
    for sup in input.supports.values() {
        let (sr, has_rot) = count_support_restraints_2d(sup);
        r += sr;
        if has_rot {
            rot_restrained_nodes.insert(sup.node_id);
        }
    }

    if !has_frames {
        let m = input.elements.len() as i32;
        let n = input.nodes.len() as i32;
        return (m + r - 2 * n, HashMap::new());
    }

    let mut m_frame = 0i32;
    let mut m_truss = 0i32;
    for elem in input.elements.values() {
        if elem.elem_type == "frame" { m_frame += 1; }
        else { m_truss += 1; }
    }

    // Count hinges and frame elements per node
    let mut node_hinges: HashMap<usize, i32> = HashMap::new();
    let mut node_frame_elems: HashMap<usize, i32> = HashMap::new();
    for elem in input.elements.values() {
        if elem.elem_type != "frame" { continue; }
        *node_frame_elems.entry(elem.node_i).or_insert(0) += 1;
        *node_frame_elems.entry(elem.node_j).or_insert(0) += 1;
        if elem.hinge_start {
            *node_hinges.entry(elem.node_i).or_insert(0) += 1;
        }
        if elem.hinge_end {
            *node_hinges.entry(elem.node_j).or_insert(0) += 1;
        }
    }

    // Compute internal conditions c per node
    let mut c = 0i32;
    let mut node_conditions: HashMap<usize, i32> = HashMap::new();
    for (&node_id, &j) in &node_hinges {
        let k = *node_frame_elems.get(&node_id).unwrap_or(&0);
        let ci = if k <= 1 {
            0 // free end
        } else if rot_restrained_nodes.contains(&node_id) {
            j // each hinge is independent
        } else {
            j.min(k - 1)
        };
        if ci > 0 {
            node_conditions.insert(node_id, ci);
        }
        c += ci;
    }

    let n = input.nodes.len() as i32;
    let degree = 3 * m_frame + m_truss + r - 3 * n - c;
    (degree, node_conditions)
}

/// Full 2D kinematic analysis.
pub fn analyze_kinematics_2d(input: &SolverInput) -> KinematicResult {
    let (degree, _node_conditions) = compute_static_degree_2d(input);

    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;

    if nf == 0 {
        return KinematicResult {
            degree,
            classification: if degree > 0 { "hyperstatic" } else if degree == 0 { "isostatic" } else { "hypostatic" }.into(),
            mechanism_modes: 0,
            mechanism_nodes: Vec::new(),
            unconstrained_dofs: Vec::new(),
            diagnosis: "Todos los GDL están restringidos.".into(),
            is_solvable: true,
        };
    }

    // Assemble K (no artificial stiffness in Rust assembly)
    let asm = assemble_2d(input, &dof_num);
    let n = dof_num.n_total;

    // Extract Kff
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);

    // Topology-agnostic orphan-ROTATION-DOF detection on K_ff (pre-constraint-reduction):
    // a free *rotation* DOF (local_dof=2 in 2D) whose row AND column in K_ff are
    // identically zero has no rotational stiffness from anywhere — physically the
    // rotation is undetermined, not a mechanism. Restricted to rotation DOFs so a
    // genuinely floating node (translation DOFs orphan) still flags as mechanism.
    let orphan_phys_dofs: Vec<usize> = {
        let mut idx_to_local: HashMap<usize, usize> = HashMap::new();
        for (&(_, ld), &idx) in &dof_num.map {
            if idx < nf {
                idx_to_local.insert(idx, ld);
            }
        }
        let max_abs = k_ff.iter().fold(0.0f64, |m, &v| m.max(v.abs()));
        let orphan_tol = (1e-10f64).max(max_abs * 1e-10);
        let mut orphans = Vec::new();
        for i in 0..nf {
            // Only suppress rotation DOFs (local_dof = 2 in 2D)
            if idx_to_local.get(&i).copied() != Some(2) {
                continue;
            }
            let mut all_zero = true;
            for j in 0..nf {
                if k_ff[i * nf + j].abs() > orphan_tol
                    || k_ff[j * nf + i].abs() > orphan_tol
                {
                    all_zero = false;
                    break;
                }
            }
            if all_zero {
                orphans.push(i);
            }
        }
        orphans
    };

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let k_s = if let Some(ref cs) = cs {
        cs.reduce_matrix(&k_ff)
    } else {
        k_ff
    };

    // LU rank analysis (on reduced system if constraints present)
    let tol = {
        let mut max_diag = 0.0f64;
        for i in 0..ns {
            max_diag = max_diag.max(k_s[i * ns + i].abs());
        }
        (1e-10f64).max(max_diag * 1e-10)
    };
    let (_rank, zero_pivot_dofs_reduced) = lu_rank(&k_s, ns, tol);

    // Map zero-pivot DOFs back to physical free DOFs
    let zero_pivot_dofs = if let Some(ref cs) = cs {
        map_reduced_dofs_to_physical(&zero_pivot_dofs_reduced, cs)
    } else {
        zero_pivot_dofs_reduced
    };

    // Filter expected zero-stiffness DOFs at valid pin joints
    let mut expected_zero = std::collections::HashSet::new();
    if dof_num.dofs_per_node >= 3 {
        let mut node_hinge_count: HashMap<usize, usize> = HashMap::new();
        let mut node_frame_count: HashMap<usize, usize> = HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type == "frame" {
                *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
                *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
                if elem.hinge_start {
                    *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
                }
                if elem.hinge_end {
                    *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
                }
            }
        }

        let mut rot_restrained = std::collections::HashSet::new();
        for sup in input.supports.values() {
            match sup.support_type.as_str() {
                "fixed" | "guidedX" | "guidedY" => { rot_restrained.insert(sup.node_id); }
                _ => {
                    if sup.kz.unwrap_or(0.0) > 0.0 {
                        rot_restrained.insert(sup.node_id);
                    }
                }
            }
        }

        // All-hinged frame nodes
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                // Rotation DOF (local_dof=2) at this node is expected to be zero
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < nf {
                        expected_zero.insert(idx);
                    }
                }
            }
        }
    }

    for &i in &orphan_phys_dofs {
        expected_zero.insert(i);
    }

    // True mechanism DOFs
    let true_mechanism_dofs: Vec<usize> = zero_pivot_dofs
        .iter()
        .filter(|&&d| !expected_zero.contains(&d))
        .copied()
        .collect();
    let mechanism_modes = true_mechanism_dofs.len();

    // Map pivots to nodes
    let dof_labels = ["ux", "uy", "rz"];
    let mut reverse_map: HashMap<usize, (usize, usize)> = HashMap::new();
    for (&(node_id, local_dof), &idx) in &dof_num.map {
        if idx < nf {
            reverse_map.insert(idx, (node_id, local_dof));
        }
    }

    let mut node_set = std::collections::HashSet::new();
    let mut unconstrained_dofs = Vec::new();
    for &dof_idx in &true_mechanism_dofs {
        if let Some(&(node_id, local_dof)) = reverse_map.get(&dof_idx) {
            node_set.insert(node_id);
            unconstrained_dofs.push(UnconstrainedDof {
                node_id,
                dof: dof_labels.get(local_dof).unwrap_or(&"ux").to_string(),
            });
        }
    }
    let mut mechanism_nodes: Vec<usize> = node_set.into_iter().collect();
    mechanism_nodes.sort();

    let is_solvable = mechanism_modes == 0;
    let classification = if degree > 0 && is_solvable {
        "hyperstatic"
    } else if degree == 0 && is_solvable {
        "isostatic"
    } else {
        "hypostatic"
    }.to_string();

    let diagnosis = build_diagnosis_2d(degree, mechanism_modes, &mechanism_nodes, &unconstrained_dofs);

    KinematicResult {
        degree,
        classification,
        mechanism_modes,
        mechanism_nodes,
        unconstrained_dofs,
        diagnosis,
        is_solvable,
    }
}

// ==================== 3D Kinematic Analysis ====================

/// Count support restraints for 3D.
fn count_support_restraints_3d(sup: &SolverSupport3D) -> (i32, bool) {
    let mut r = 0i32;
    let mut has_rot = false;

    if sup.rx { r += 1; }
    if sup.ry { r += 1; }
    if sup.rz { r += 1; }
    if sup.rrx { r += 1; has_rot = true; }
    if sup.rry { r += 1; has_rot = true; }
    if sup.rrz { r += 1; has_rot = true; }

    // Springs
    if sup.kx.unwrap_or(0.0) > 0.0 { r += 1; }
    if sup.ky.unwrap_or(0.0) > 0.0 { r += 1; }
    if sup.kz.unwrap_or(0.0) > 0.0 { r += 1; }
    if sup.krx.unwrap_or(0.0) > 0.0 { r += 1; has_rot = true; }
    if sup.kry.unwrap_or(0.0) > 0.0 { r += 1; has_rot = true; }
    if sup.krz.unwrap_or(0.0) > 0.0 { r += 1; has_rot = true; }

    // Inclined support
    if sup.is_inclined.unwrap_or(false) {
        if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
            let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
            if n_len > 1e-12 { r += 1; }
        }
    }

    (r, has_rot)
}

/// Compute static degree for 3D.
fn compute_static_degree_3d(input: &SolverInput3D) -> (i32, HashMap<usize, i32>) {
    let has_frames = input.elements.values().any(|e| e.elem_type == "frame");

    let mut r = 0i32;
    let mut rot_restrained_nodes = std::collections::HashSet::new();
    for sup in input.supports.values() {
        let (sr, has_rot) = count_support_restraints_3d(sup);
        r += sr;
        if has_rot {
            rot_restrained_nodes.insert(sup.node_id);
        }
    }

    if !has_frames {
        let m = input.elements.len() as i32;
        let n = input.nodes.len() as i32;
        return (m + r - 3 * n, HashMap::new());
    }

    let mut m_frame = 0i32;
    let mut m_truss = 0i32;
    for elem in input.elements.values() {
        if elem.elem_type == "frame" { m_frame += 1; }
        else { m_truss += 1; }
    }

    let mut node_hinges: HashMap<usize, i32> = HashMap::new();
    let mut node_frame_elems: HashMap<usize, i32> = HashMap::new();
    for elem in input.elements.values() {
        if elem.elem_type != "frame" { continue; }
        *node_frame_elems.entry(elem.node_i).or_insert(0) += 1;
        *node_frame_elems.entry(elem.node_j).or_insert(0) += 1;
        // SAFE refactor: legacy bool semantics — count one hinge per end if any
        // bending rotation released. Per-axis refinement is the next step.
        if elem.release_my_start || elem.release_mz_start {
            *node_hinges.entry(elem.node_i).or_insert(0) += 1;
        }
        if elem.release_my_end || elem.release_mz_end {
            *node_hinges.entry(elem.node_j).or_insert(0) += 1;
        }
    }

    // In 3D, each hinge releases 3 rotation DOFs
    let mut c = 0i32;
    let mut node_conditions: HashMap<usize, i32> = HashMap::new();
    for (&node_id, &j) in &node_hinges {
        let k = *node_frame_elems.get(&node_id).unwrap_or(&0);
        let ci = if k <= 1 {
            0
        } else if rot_restrained_nodes.contains(&node_id) {
            3 * j
        } else {
            3 * j.min(k - 1)
        };
        if ci > 0 {
            node_conditions.insert(node_id, ci);
        }
        c += ci;
    }

    let n = input.nodes.len() as i32;
    let degree = 6 * m_frame + 3 * m_truss + r - 6 * n - c;
    (degree, node_conditions)
}

/// Full 3D kinematic analysis.
pub fn analyze_kinematics_3d(input: &SolverInput3D) -> KinematicResult {
    let (degree, _) = compute_static_degree_3d(input);

    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;

    if nf == 0 {
        return KinematicResult {
            degree,
            classification: if degree > 0 { "hyperstatic" } else if degree == 0 { "isostatic" } else { "hypostatic" }.into(),
            mechanism_modes: 0,
            mechanism_nodes: Vec::new(),
            unconstrained_dofs: Vec::new(),
            diagnosis: "Todos los GDL están restringidos.".into(),
            is_solvable: true,
        };
    }

    let asm = assemble_3d(input, &dof_num);
    let n = dof_num.n_total;

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);

    // Topology-agnostic orphan-ROTATION-DOF detection (see 2D analyzer rationale).
    // Restricted to rotation DOFs (local_dof in 3..=5 for 3D) so genuinely
    // floating nodes still flag as mechanisms.
    let orphan_phys_dofs: Vec<usize> = {
        let mut idx_to_local: HashMap<usize, usize> = HashMap::new();
        for (&(_, ld), &idx) in &dof_num.map {
            if idx < nf {
                idx_to_local.insert(idx, ld);
            }
        }
        let max_abs = k_ff.iter().fold(0.0f64, |m, &v| m.max(v.abs()));
        let orphan_tol = (1e-10f64).max(max_abs * 1e-10);
        let mut orphans = Vec::new();
        for i in 0..nf {
            match idx_to_local.get(&i).copied() {
                Some(3) | Some(4) | Some(5) => {}
                _ => continue,
            }
            let mut all_zero = true;
            for j in 0..nf {
                if k_ff[i * nf + j].abs() > orphan_tol
                    || k_ff[j * nf + i].abs() > orphan_tol
                {
                    all_zero = false;
                    break;
                }
            }
            if all_zero {
                orphans.push(i);
            }
        }
        orphans
    };

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let k_s = if let Some(ref cs) = cs {
        cs.reduce_matrix(&k_ff)
    } else {
        k_ff
    };

    let tol = {
        let mut max_diag = 0.0f64;
        for i in 0..ns {
            max_diag = max_diag.max(k_s[i * ns + i].abs());
        }
        (1e-10f64).max(max_diag * 1e-10)
    };
    let (_rank, zero_pivot_dofs_reduced) = lu_rank(&k_s, ns, tol);

    // Map zero-pivot DOFs back to physical free DOFs
    let zero_pivot_dofs = if let Some(ref cs) = cs {
        map_reduced_dofs_to_physical(&zero_pivot_dofs_reduced, cs)
    } else {
        zero_pivot_dofs_reduced
    };

    // Filter expected zero-stiffness DOFs
    let mut expected_zero = std::collections::HashSet::new();
    if dof_num.dofs_per_node >= 6 {
        let mut node_hinge_count: HashMap<usize, usize> = HashMap::new();
        let mut node_frame_count: HashMap<usize, usize> = HashMap::new();
        let mut node_truss_count: HashMap<usize, usize> = HashMap::new();
        for elem in input.elements.values() {
            if elem.elem_type == "frame" {
                *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
                *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
                // SAFE refactor: legacy bool semantics — count one hinge per end
                // if any bending rotation released. Per-axis count is the next step.
                if elem.release_my_start || elem.release_mz_start {
                    *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
                }
                if elem.release_my_end || elem.release_mz_end {
                    *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
                }
            } else {
                *node_truss_count.entry(elem.node_i).or_insert(0) += 1;
                *node_truss_count.entry(elem.node_j).or_insert(0) += 1;
            }
        }

        let mut rot_restrained = std::collections::HashSet::new();
        for sup in input.supports.values() {
            if sup.rrx { rot_restrained.insert(sup.node_id); }
            if sup.rry { rot_restrained.insert(sup.node_id); }
            if sup.rrz { rot_restrained.insert(sup.node_id); }
            if sup.krx.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
            if sup.kry.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
            if sup.krz.unwrap_or(0.0) > 0.0 { rot_restrained.insert(sup.node_id); }
        }

        // All-hinged frame nodes
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                for rd in 3..=5 {
                    if let Some(&idx) = dof_num.map.get(&(node_id, rd)) {
                        if idx < nf {
                            expected_zero.insert(idx);
                        }
                    }
                }
            }
        }

        // Truss-only nodes in mixed systems
        for &node_id in &dof_num.node_order {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            let trusses = *node_truss_count.get(&node_id).unwrap_or(&0);
            if frames == 0 && trusses > 0 && !rot_restrained.contains(&node_id) {
                for rd in 3..=5 {
                    if let Some(&idx) = dof_num.map.get(&(node_id, rd)) {
                        if idx < nf {
                            expected_zero.insert(idx);
                        }
                    }
                }
            }
        }
    }

    for &i in &orphan_phys_dofs {
        expected_zero.insert(i);
    }

    let true_mechanism_dofs: Vec<usize> = zero_pivot_dofs
        .iter()
        .filter(|&&d| !expected_zero.contains(&d))
        .copied()
        .collect();
    let mechanism_modes = true_mechanism_dofs.len();

    let dof_labels_6 = ["ux", "uy", "uz", "rx", "ry", "rz"];
    let dof_labels_3 = ["ux", "uy", "uz"];
    let labels = if dof_num.dofs_per_node == 6 { &dof_labels_6[..] } else { &dof_labels_3[..] };

    let mut reverse_map: HashMap<usize, (usize, usize)> = HashMap::new();
    for (&(node_id, local_dof), &idx) in &dof_num.map {
        if idx < nf {
            reverse_map.insert(idx, (node_id, local_dof));
        }
    }

    let mut node_set = std::collections::HashSet::new();
    let mut unconstrained_dofs = Vec::new();
    for &dof_idx in &true_mechanism_dofs {
        if let Some(&(node_id, local_dof)) = reverse_map.get(&dof_idx) {
            node_set.insert(node_id);
            unconstrained_dofs.push(UnconstrainedDof {
                node_id,
                dof: labels.get(local_dof).unwrap_or(&"ux").to_string(),
            });
        }
    }
    let mut mechanism_nodes: Vec<usize> = node_set.into_iter().collect();
    mechanism_nodes.sort();

    let is_solvable = mechanism_modes == 0;
    let classification = if degree > 0 && is_solvable {
        "hyperstatic"
    } else if degree == 0 && is_solvable {
        "isostatic"
    } else {
        "hypostatic"
    }.to_string();

    let diagnosis = build_diagnosis_2d(degree, mechanism_modes, &mechanism_nodes, &unconstrained_dofs);

    KinematicResult {
        degree,
        classification,
        mechanism_modes,
        mechanism_nodes,
        unconstrained_dofs,
        diagnosis,
        is_solvable,
    }
}

// ==================== Helpers ====================

/// Map reduced-space zero-pivot DOF indices back to physical free DOF indices.
fn map_reduced_dofs_to_physical(reduced_dofs: &[usize], cs: &FreeConstraintSystem) -> Vec<usize> {
    let rmap = cs.map_reduced_to_physical();
    reduced_dofs.iter()
        .filter_map(|&rd| rmap.get(rd).copied())
        .collect()
}

// ==================== Diagnosis Builder ====================

fn build_diagnosis_2d(
    degree: i32,
    mechanism_modes: usize,
    mechanism_nodes: &[usize],
    unconstrained_dofs: &[UnconstrainedDof],
) -> String {
    if mechanism_modes == 0 {
        if degree > 0 {
            return format!("Estructura hiperestática de grado {}.", degree);
        }
        if degree == 0 {
            return "Estructura isostática.".to_string();
        }
        return format!("Estructura con grado {} pero numéricamente estable.", degree);
    }

    let dof_names: HashMap<&str, &str> = [
        ("ux", "desplazamiento en X"),
        ("uy", "desplazamiento en Y"),
        ("uz", "desplazamiento en Z"),
        ("rz", "rotación en Z"),
        ("rx", "rotación en X (torsión)"),
        ("ry", "rotación en Y"),
    ].into_iter().collect();

    let node_list: String = mechanism_nodes.iter()
        .take(8)
        .map(|n| n.to_string())
        .collect::<Vec<_>>()
        .join(", ");

    let dof_list: String = unconstrained_dofs.iter()
        .take(8)
        .map(|d| {
            let dof_str = d.dof.as_str();
            let name = dof_names.get(dof_str).unwrap_or(&dof_str);
            format!("nodo {} ({})", d.node_id, name)
        })
        .collect::<Vec<_>>()
        .join("; ");

    if mechanism_nodes.len() <= 3 {
        format!(
            "Mecanismo en nodo{} {} ({} modo{} de mecanismo). GDL sin restringir: {}. Revisá las articulaciones y apoyos en esa zona.",
            if mechanism_nodes.len() > 1 { "s" } else { "" },
            node_list,
            mechanism_modes,
            if mechanism_modes > 1 { "s" } else { "" },
            dof_list,
        )
    } else {
        format!(
            "Estructura hipostática (grado {}, {} modo{} de mecanismo). {} nodos participan: {}{}. GDL sin restringir: {}{}.",
            degree,
            mechanism_modes,
            if mechanism_modes > 1 { "s" } else { "" },
            mechanism_nodes.len(),
            node_list,
            if mechanism_nodes.len() > 8 { "..." } else { "" },
            dof_list,
            if unconstrained_dofs.len() > 8 { "..." } else { "" },
        )
    }
}
