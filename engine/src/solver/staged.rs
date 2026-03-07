//! Staged (construction sequence) analysis solver.
//!
//! Each construction stage activates/deactivates elements and supports,
//! applies stage-specific loads and prestress, then solves for incremental
//! displacements. Results are cumulative across stages.

use std::collections::HashSet;
use crate::types::*;
use crate::element::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{AssemblyResult, assemble_element_loads_2d};
use super::prestress::prestress_fef_2d;

/// Solve a 2D staged construction analysis.
///
/// For each stage in order:
/// 1. Determine which elements and supports are active
/// 2. Assemble stiffness matrix for active elements only
/// 3. Build load vector from stage loads + prestress
/// 4. Solve for incremental displacements
/// 5. Accumulate displacements
/// 6. Compute element forces using cumulative displacements
pub fn solve_staged_2d(input: &StagedInput) -> Result<StagedAnalysisResults, String> {
    if input.stages.is_empty() {
        return Err("No construction stages defined".into());
    }

    // Build DOF numbering from the full structure (all nodes, all elements)
    let full_solver_input = staged_to_full_solver_input(input);
    let dof_num = DofNumbering::build_2d(&full_solver_input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new();
    let mut stage_results = Vec::new();

    for (stage_idx, stage) in input.stages.iter().enumerate() {
        // Update active sets
        for &eid in &stage.elements_added {
            active_elements.insert(eid);
        }
        for &eid in &stage.elements_removed {
            active_elements.remove(&eid);
        }
        for &sid in &stage.supports_added {
            active_supports.insert(sid);
        }
        for &sid in &stage.supports_removed {
            active_supports.remove(&sid);
        }

        // Build a SolverInput for this stage with only active elements/supports/loads
        let stage_solver_input = build_stage_solver_input(
            input, &active_elements, &active_supports, stage,
        );

        // Assemble stiffness for active elements
        let asm = assemble_staged_2d(
            &stage_solver_input, &dof_num, &input, &active_elements, stage,
        );

        // Build prescribed displacement vector
        let mut u_r = vec![0.0; nr];
        for sup in stage_solver_input.supports.values() {
            if sup.support_type == "spring" { continue; }
            let prescribed: [(usize, Option<f64>); 3] = [
                (0, sup.dx), (1, sup.dy), (2, sup.drz),
            ];
            for &(local_dof, val) in &prescribed {
                if let Some(v) = val {
                    if v.abs() > 1e-15 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                            if d >= nf {
                                u_r[d - nf] = v;
                            }
                        }
                    }
                }
            }
        }

        // Extract Kff, Ff
        let free_idx: Vec<usize> = (0..nf).collect();
        let rest_idx: Vec<usize> = (nf..n).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let mut f_f = extract_subvec(&asm.f, &free_idx);

        // F_f_modified = F_f - K_fr * u_r
        let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
        let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
        for i in 0..nf {
            f_f[i] -= k_fr_ur[i];
        }

        // Check if K_ff has any non-zero diagonal (structure might be a mechanism at this stage)
        let max_diag: f64 = (0..nf).map(|i| k_ff[i * nf + i].abs()).fold(0.0, f64::max);
        if max_diag < 1e-30 {
            // No stiffness at this stage — skip (e.g., stage only adds loads to non-existent elements)
            stage_results.push(StageResult {
                stage_name: stage.name.clone(),
                stage_index: stage_idx,
                results: build_results_from_u(&cumulative_u, &dof_num, &input, &active_elements),
            });
            continue;
        }

        // Solve for incremental displacements
        let u_f_inc = {
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f.clone();
                    lu_solve(&mut k_work, &mut f_work, nf)
                        .ok_or_else(|| format!(
                            "Singular stiffness at stage '{}' — structure is a mechanism",
                            stage.name
                        ))?
                }
            }
        };

        // Accumulate displacements
        for i in 0..nf {
            cumulative_u[i] += u_f_inc[i];
        }
        for i in 0..nr {
            cumulative_u[nf + i] = u_r[i]; // prescribed displacements override
        }

        // Build results for this stage
        stage_results.push(StageResult {
            stage_name: stage.name.clone(),
            stage_index: stage_idx,
            results: build_results_from_u(&cumulative_u, &dof_num, &input, &active_elements),
        });
    }

    let final_results = stage_results.last()
        .map(|sr| sr.results.clone())
        .unwrap_or_else(|| AnalysisResults {
            displacements: vec![],
            reactions: vec![],
            element_forces: vec![],
        });

    Ok(StagedAnalysisResults {
        stages: stage_results,
        final_results,
    })
}

/// Convert StagedInput to a full SolverInput (all elements active) for DOF numbering.
fn staged_to_full_solver_input(input: &StagedInput) -> SolverInput {
    SolverInput {
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements: input.elements.clone(),
        supports: input.supports.clone(),
        loads: input.loads.clone(),
    }
}

/// Build a SolverInput with only active elements, supports, and stage loads.
fn build_stage_solver_input(
    input: &StagedInput,
    active_elements: &HashSet<usize>,
    active_supports: &HashSet<usize>,
    stage: &ConstructionStage,
) -> SolverInput {
    let elements: std::collections::HashMap<String, SolverElement> = input.elements.iter()
        .filter(|(_, e)| active_elements.contains(&e.id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let supports: std::collections::HashMap<String, SolverSupport> = input.supports.iter()
        .filter(|(_, s)| active_supports.contains(&s.id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let loads: Vec<SolverLoad> = stage.load_indices.iter()
        .filter_map(|&idx| input.loads.get(idx).cloned())
        .collect();

    SolverInput {
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements,
        supports,
        loads,
    }
}

/// Assemble stiffness and load vectors for a construction stage.
///
/// This is similar to `assemble_2d` but:
/// - Only assembles elements that are in the active set
/// - Adds prestress equivalent loads from the stage definition
fn assemble_staged_2d(
    stage_input: &SolverInput,
    dof_num: &DofNumbering,
    full_input: &StagedInput,
    active_elements: &HashSet<usize>,
    stage: &ConstructionStage,
) -> AssemblyResult {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let mut f_global = vec![0.0; n];

    // Assemble active element stiffness matrices
    for elem in stage_input.elements.values() {
        let node_i = full_input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = full_input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = full_input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = full_input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let ndof = 4;
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += k_elem[i * ndof + j];
                }
            }
        } else {
            let phi = if let Some(as_y) = sec.as_y {
                let g = e / (2.0 * (1.0 + mat.nu));
                12.0 * e * sec.iz / (g * as_y * l * l)
            } else {
                0.0
            };
            let k_local = frame_local_stiffness_2d(
                e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
            );
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);

            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                }
            }

            // Assemble element loads (FEF) for this stage's loads
            assemble_element_loads_2d(
                stage_input, elem, &k_local, &t, l, e, sec, node_i, &elem_dofs, &mut f_global,
            );
        }
    }

    // Assemble nodal loads
    for load in &stage_input.loads {
        if let SolverLoad::Nodal(nl) = load {
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 0)) {
                f_global[d] += nl.fx;
            }
            if let Some(&d) = dof_num.map.get(&(nl.node_id, 1)) {
                f_global[d] += nl.fy;
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) {
                    f_global[d] += nl.mz;
                }
            }
        }
    }

    // Assemble prestress equivalent loads
    for ps in &stage.prestress_loads {
        if !active_elements.contains(&ps.element_id) { continue; }

        // Find the element
        if let Some(elem) = full_input.elements.values().find(|e| e.id == ps.element_id) {
            let node_i = full_input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
            let node_j = full_input.nodes.values().find(|n| n.id == elem.node_j).unwrap();

            let dx = node_j.x - node_i.x;
            let dy = node_j.y - node_i.y;
            let l = (dx * dx + dy * dy).sqrt();
            let cos = dx / l;
            let sin_a = dy / l;

            // Get local FEF from prestress
            let fef_local = prestress_fef_2d(ps, l);

            // Transform to global coordinates
            let t = frame_transform_2d(cos, sin_a);
            let mut fef_global = [0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    fef_global[i] += t[j * 6 + i] * fef_local[j]; // T^T * f_local
                }
            }

            // Scatter into global force vector
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            for i in 0..6 {
                f_global[elem_dofs[i]] += fef_global[i];
            }
        }
    }

    // Add spring stiffness
    for sup in stage_input.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_global[d * n + d] += kx;
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_global[d * n + d] += ky;
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    k_global[d * n + d] += kz;
                }
            }
        }
    }

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    // Add artificial stiffness for disconnected nodes and fully-hinged nodes.
    // In staged analysis, some nodes may not be connected to any active element.
    let mut artificial_dofs = Vec::new();
    let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };

    // Collect nodes connected to active elements
    let mut connected_nodes = HashSet::new();
    for elem in stage_input.elements.values() {
        connected_nodes.insert(elem.node_i);
        connected_nodes.insert(elem.node_j);
    }

    // Add artificial stiffness for ALL DOFs of disconnected nodes
    for node in full_input.nodes.values() {
        if !connected_nodes.contains(&node.id) {
            for local_dof in 0..dof_num.dofs_per_node {
                if let Some(&d) = dof_num.map.get(&(node.id, local_dof)) {
                    if k_global[d * n + d].abs() < 1e-30 {
                        k_global[d * n + d] += artificial_k;
                        artificial_dofs.push(d);
                    }
                }
            }
        }
    }

    // Add artificial rotational stiffness at fully-hinged nodes
    if dof_num.dofs_per_node >= 3 {
        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();

        for elem in stage_input.elements.values() {
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

        for (&node_id, &frame_count) in &node_frame_count {
            let hinge_count = node_hinge_count.get(&node_id).copied().unwrap_or(0);
            if hinge_count == frame_count && frame_count > 0 {
                if let Some(&d) = dof_num.map.get(&(node_id, 2)) {
                    k_global[d * n + d] += artificial_k;
                    artificial_dofs.push(d);
                }
            }
        }
    }

    AssemblyResult {
        k: k_global,
        f: f_global,
        max_diag_k: max_diag,
        artificial_dofs,
        inclined_transforms: vec![],
    }
}

/// Build AnalysisResults from cumulative displacements.
fn build_results_from_u(
    u: &[f64],
    dof_num: &DofNumbering,
    input: &StagedInput,
    active_elements: &HashSet<usize>,
) -> AnalysisResults {
    // Displacements
    let mut displacements = Vec::new();
    for node in input.nodes.values() {
        let ux = dof_num.map.get(&(node.id, 0)).map(|&d| u[d]).unwrap_or(0.0);
        let uy = dof_num.map.get(&(node.id, 1)).map(|&d| u[d]).unwrap_or(0.0);
        let rz = if dof_num.dofs_per_node >= 3 {
            dof_num.map.get(&(node.id, 2)).map(|&d| u[d]).unwrap_or(0.0)
        } else {
            0.0
        };
        displacements.push(Displacement {
            node_id: node.id,
            ux, uy, rz,
        });
    }
    displacements.sort_by_key(|d| d.node_id);

    // Element forces (for active elements)
    let mut element_forces = Vec::new();
    for elem in input.elements.values() {
        if !active_elements.contains(&elem.id) { continue; }
        if elem.elem_type == "truss" { continue; } // TODO: truss forces

        let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
        let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();
        let mat = input.materials.values().find(|m| m.id == elem.material_id).unwrap();
        let sec = input.sections.values().find(|s| s.id == elem.section_id).unwrap();

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        let phi = if let Some(as_y) = sec.as_y {
            let g = e / (2.0 * (1.0 + mat.nu));
            12.0 * e * sec.iz / (g * as_y * l * l)
        } else {
            0.0
        };

        let k_local = frame_local_stiffness_2d(
            e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
        );
        let t = frame_transform_2d(cos, sin);

        // Get element global displacements
        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let mut u_global = [0.0; 6];
        for i in 0..6 {
            u_global[i] = u[elem_dofs[i]];
        }

        // Transform to local: u_local = T * u_global
        let mut u_local = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                u_local[i] += t[i * 6 + j] * u_global[j];
            }
        }

        // Element forces: f_local = K_local * u_local
        let mut f_local = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                f_local[i] += k_local[i * 6 + j] * u_local[j];
            }
        }

        element_forces.push(ElementForces {
            element_id: elem.id,
            n_start: f_local[0],
            n_end: f_local[3],
            v_start: f_local[1],
            v_end: f_local[4],
            m_start: f_local[2],
            m_end: f_local[5],
            length: l,
            q_i: 0.0,
            q_j: 0.0,
            point_loads: vec![],
            distributed_loads: vec![],
            hinge_start: elem.hinge_start,
            hinge_end: elem.hinge_end,
        });
    }
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute reactions from element forces (equilibrium at supported nodes).
    let mut node_forces = std::collections::HashMap::<usize, [f64; 3]>::new();

    for ef in &element_forces {
        if let Some(elem) = input.elements.values().find(|e| e.id == ef.element_id) {
            let node_i = input.nodes.values().find(|n| n.id == elem.node_i).unwrap();
            let node_j = input.nodes.values().find(|n| n.id == elem.node_j).unwrap();

            let dx = node_j.x - node_i.x;
            let dy = node_j.y - node_i.y;
            let l = (dx * dx + dy * dy).sqrt();
            let cos = dx / l;
            let sin = dy / l;

            // Transform local forces to global
            let f_local = [ef.n_start, ef.v_start, ef.m_start, ef.n_end, ef.v_end, ef.m_end];
            let t = frame_transform_2d(cos, sin);
            let mut f_global = [0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_global[i] += t[j * 6 + i] * f_local[j];
                }
            }

            let entry_i = node_forces.entry(elem.node_i).or_insert([0.0; 3]);
            entry_i[0] += f_global[0];
            entry_i[1] += f_global[1];
            entry_i[2] += f_global[2];

            let entry_j = node_forces.entry(elem.node_j).or_insert([0.0; 3]);
            entry_j[0] += f_global[3];
            entry_j[1] += f_global[4];
            entry_j[2] += f_global[5];
        }
    }

    // Reactions = internal forces at supported nodes
    let mut reactions = Vec::new();
    for sup in input.supports.values() {
        if sup.support_type == "spring" { continue; }
        if let Some(nf) = node_forces.get(&sup.node_id) {
            reactions.push(Reaction {
                node_id: sup.node_id,
                rx: nf[0],
                ry: nf[1],
                mz: nf[2],
            });
        } else {
            reactions.push(Reaction {
                node_id: sup.node_id,
                rx: 0.0,
                ry: 0.0,
                mz: 0.0,
            });
        }
    }
    reactions.sort_by_key(|r| r.node_id);

    AnalysisResults {
        displacements,
        reactions,
        element_forces,
    }
}
