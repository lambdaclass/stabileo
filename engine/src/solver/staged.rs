//! Staged (construction sequence) analysis solver.
//!
//! Each construction stage activates/deactivates elements and supports,
//! applies stage-specific loads and prestress, then solves for incremental
//! displacements. Results are cumulative across stages.

use std::collections::{HashMap, HashSet};
use crate::types::*;
use crate::element::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{AssemblyResult, assemble_element_loads_2d, assemble_3d};
use super::linear::{
    build_displacements_2d,
    build_displacements_3d,
    build_reactions_2d,
    compute_internal_forces_2d,
    compute_plate_stresses,
};
use super::prestress::prestress_fef_2d;
use super::constraints::FreeConstraintSystem;
use crate::element::cable::cable_self_weight;

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

    // Build constraint system once (shared across all stages)
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new();
    let mut cumulative_loads: Vec<SolverLoad> = Vec::new();
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

        // Accumulate loads across stages for correct FEF in internal force recovery
        cumulative_loads.extend(
            stage.load_indices.iter().filter_map(|&idx| input.loads.get(idx).cloned())
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
                (0, sup.dx), (1, sup.dz), (2, sup.dry),
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
            // No stiffness at this stage — skip
            let cumulative_solver_input = SolverInput {
                loads: cumulative_loads.clone(),
                ..stage_solver_input.clone()
            };
            stage_results.push(StageResult {
                stage_name: stage.name.clone(),
                stage_index: stage_idx,
                results: build_results_from_u(
                    &cumulative_u,
                    &dof_num,
                    &cumulative_solver_input,
                    &vec![0.0; nr],
                    nf,
                ),
            });
            continue;
        }

        // Reduce with constraint system if present
        let (k_s, f_s) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };

        // Solve for incremental displacements in (possibly reduced) space
        let u_s_inc = {
            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s.clone();
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or_else(|| format!(
                            "Singular stiffness at stage '{}' — structure is a mechanism",
                            stage.name
                        ))?
                }
            }
        };

        // Expand back to full free DOFs
        let u_f_inc = if let Some(ref cs) = cs {
            cs.expand_solution(&u_s_inc)
        } else {
            u_s_inc
        };

        // Accumulate displacements
        for i in 0..nf {
            cumulative_u[i] += u_f_inc[i];
        }
        for i in 0..nr {
            cumulative_u[nf + i] = u_r[i]; // prescribed displacements override
        }

        // Cable iteration: if stage has cable elements, iterate with Ernst modulus
        let has_cables = stage_solver_input.elements.values()
            .any(|e| e.elem_type == "cable");
        if has_cables {
            iterate_cables_staged_2d(
                &stage_solver_input, &dof_num, input, &active_elements, stage,
                &mut cumulative_u, &u_r, nf, nr, n,
            );
        }

        // Build cumulative input for correct FEF subtraction in internal force recovery.
        let cumulative_solver_input = SolverInput {
            loads: cumulative_loads.clone(),
            ..stage_solver_input.clone()
        };

        // Reassemble with cumulative loads for correct reaction F_r.
        let cumulative_asm = assemble_staged_2d(
            &cumulative_solver_input, &dof_num, &input, &active_elements, stage,
        );

        // Build results for this stage
        stage_results.push(StageResult {
            stage_name: stage.name.clone(),
            stage_index: stage_idx,
            results: build_results_from_u(
                &cumulative_u,
                &dof_num,
                &cumulative_solver_input,
                &compute_stage_reactions_vec(&cumulative_asm, n, nf, nr, &cumulative_u, &u_r),
                nf,
            ),
        });
    }

    let final_results = stage_results.last()
        .map(|sr| sr.results.clone())
        .unwrap_or_else(|| AnalysisResults {
            displacements: vec![],
            reactions: vec![],
            element_forces: vec![],
            constraint_forces: vec![],
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: vec![],
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
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
        constraints: input.constraints.clone(),
        connectors: HashMap::new(),
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
        constraints: input.constraints.clone(),
        connectors: HashMap::new(),
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

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode> = full_input.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = full_input.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = full_input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = full_input.sections.values().map(|s| (s.id, s)).collect();

    // Assemble active element stiffness matrices
    for elem in stage_input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
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
                f_global[d] += nl.fz;
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(nl.node_id, 2)) {
                    f_global[d] += nl.my;
                }
            }
        }
    }

    // Assemble prestress equivalent loads
    for ps in &stage.prestress_loads {
        if !active_elements.contains(&ps.element_id) { continue; }

        // Find the element
        if let Some(&elem) = elem_by_id.get(&ps.element_id) {
            let node_i = node_by_id[&elem.node_i];
            let node_j = node_by_id[&elem.node_j];

            let dx = node_j.x - node_i.x;
            let dy = node_j.z - node_i.z;
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
        inclined_transforms_2d: vec![],
        diagnostics: vec![],
    }
}

/// Build AnalysisResults from cumulative displacements.
fn build_results_from_u(
    u: &[f64],
    dof_num: &DofNumbering,
    input: &SolverInput,
    reactions_vec: &[f64],
    nf: usize,
) -> AnalysisResults {
    let displacements = build_displacements_2d(dof_num, u);
    let mut element_forces = compute_internal_forces_2d(input, dof_num, u);
    element_forces.sort_by_key(|ef| ef.element_id);
    let mut reactions = build_reactions_2d(input, dof_num, reactions_vec, &[], nf, u);
    reactions.sort_by_key(|r| r.node_id);

    AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces: vec![],
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        result_summary: None, solver_run_meta: None,
    }
}

fn compute_stage_reactions_vec(
    asm: &AssemblyResult,
    n: usize,
    nf: usize,
    nr: usize,
    u_full: &[f64],
    u_r: &[f64],
) -> Vec<f64> {
    if nr == 0 {
        return Vec::new();
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_full[..nf], nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, u_r, nr, nr);

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }
    reactions_vec
}

/// Iterate cable elements in staged 2D using Ernst equivalent modulus.
/// Modifies cumulative_u in place. Follows the pattern from cable.rs.
fn iterate_cables_staged_2d(
    stage_input: &SolverInput,
    dof_num: &DofNumbering,
    full_input: &StagedInput,
    active_elements: &HashSet<usize>,
    stage: &ConstructionStage,
    cumulative_u: &mut [f64],
    u_r: &[f64],
    nf: usize,
    nr: usize,
    n: usize,
) {
    const MAX_CABLE_ITER: usize = 30;
    const CABLE_TOL: f64 = 1e-4;

    // Precompute cable geometry
    struct CableInfo {
        elem_id: usize,
        node_i: usize,
        node_j: usize,
        l0: f64,
        cos_a: f64,
        sin_a: f64,
        ea: f64,
        w: f64,
        dx: f64,
    }

    let mut cables = Vec::new();
    let mut cable_tensions: HashMap<usize, f64> = HashMap::new();

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode> = full_input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = full_input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = full_input.sections.values().map(|s| (s.id, s)).collect();

    for elem in stage_input.elements.values() {
        if elem.elem_type != "cable" { continue; }

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l0 = (dx * dx + dy * dy).sqrt();
        let e = mat.e * 1000.0;

        // Estimate self-weight (assume steel density if not specified)
        let density = 7.85 / 1000.0; // t/m³
        let w = cable_self_weight(density, sec.a);

        cables.push(CableInfo {
            elem_id: elem.id,
            node_i: elem.node_i,
            node_j: elem.node_j,
            l0, cos_a: dx / l0, sin_a: dy / l0,
            ea: e * sec.a, w, dx,
        });

        // Initial tension from current displacement state
        let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| cumulative_u[d]).unwrap_or(0.0);
        let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| cumulative_u[d]).unwrap_or(0.0);
        let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| cumulative_u[d]).unwrap_or(0.0);
        let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| cumulative_u[d]).unwrap_or(0.0);

        let dx_def = dx + u_xj - u_xi;
        let dy_def = dy + u_yj - u_yi;
        let l_def = (dx_def * dx_def + dy_def * dy_def).sqrt();
        let strain = (l_def - l0) / l0;
        let tension = if strain > 0.0 { e * sec.a * strain } else { 0.0 };
        cable_tensions.insert(elem.id, tension);
    }

    if cables.is_empty() { return; }

    for iter in 0..MAX_CABLE_ITER {
        // Re-assemble with modified cable stiffnesses
        let mut asm = assemble_staged_2d(
            stage_input, dof_num, full_input, active_elements, stage,
        );

        // Modify cable stiffness entries with Ernst factor
        for ci in &cables {
            let tension = cable_tensions[&ci.elem_id];
            let l_h = ci.dx.abs().max(1e-10);

            let e_eq_factor = if tension > 1e-10 && ci.w > 1e-15 {
                let wl = ci.w * l_h;
                1.0 / (1.0 + wl * wl * ci.ea / (12.0 * tension.powi(3)))
            } else if tension <= 0.0 && iter > 0 {
                0.0 // Slack cable: zero stiffness (tension-only)
            } else {
                1.0
            };

            if (e_eq_factor - 1.0).abs() > 1e-15 {
                let ea_l = ci.ea / ci.l0;
                let diff = (e_eq_factor - 1.0) * ea_l;
                let c2 = ci.cos_a * ci.cos_a;
                let s2 = ci.sin_a * ci.sin_a;
                let cs = ci.cos_a * ci.sin_a;

                let cable_dofs = [
                    dof_num.global_dof(ci.node_i, 0).unwrap(),
                    dof_num.global_dof(ci.node_i, 1).unwrap(),
                    dof_num.global_dof(ci.node_j, 0).unwrap(),
                    dof_num.global_dof(ci.node_j, 1).unwrap(),
                ];

                let dk = [
                    [diff * c2,  diff * cs, -diff * c2, -diff * cs],
                    [diff * cs,  diff * s2, -diff * cs, -diff * s2],
                    [-diff * c2, -diff * cs,  diff * c2,  diff * cs],
                    [-diff * cs, -diff * s2,  diff * cs,  diff * s2],
                ];

                for i in 0..4 {
                    for j in 0..4 {
                        asm.k[cable_dofs[i] * n + cable_dofs[j]] += dk[i][j];
                    }
                }
            }
        }

        // Solve
        let free_idx: Vec<usize> = (0..nf).collect();
        let rest_idx: Vec<usize> = (nf..n).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let mut f_f = extract_subvec(&asm.f, &free_idx);

        let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
        let k_fr_ur = mat_vec_rect(&k_fr, u_r, nf, nr);
        for i in 0..nf {
            f_f[i] -= k_fr_ur[i];
        }

        let u_f = {
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f;
                    match lu_solve(&mut k_work, &mut f_work, nf) {
                        Some(u) => u,
                        None => break, // Can't solve, keep current state
                    }
                }
            }
        };

        // Update cumulative_u with new solution
        for i in 0..nf {
            cumulative_u[i] = u_f[i];
        }

        // Update cable tensions
        let mut max_change = 0.0_f64;
        for ci in &cables {
            let u_xi = dof_num.global_dof(ci.node_i, 0).map(|d| cumulative_u[d]).unwrap_or(0.0);
            let u_yi = dof_num.global_dof(ci.node_i, 1).map(|d| cumulative_u[d]).unwrap_or(0.0);
            let u_xj = dof_num.global_dof(ci.node_j, 0).map(|d| cumulative_u[d]).unwrap_or(0.0);
            let u_yj = dof_num.global_dof(ci.node_j, 1).map(|d| cumulative_u[d]).unwrap_or(0.0);

            let dx_def = ci.dx + u_xj - u_xi;
            let dy_def = (ci.sin_a * ci.l0) + u_yj - u_yi;
            let l_def = (dx_def * dx_def + dy_def * dy_def).sqrt();
            let strain = (l_def - ci.l0) / ci.l0;
            let tension = if strain > 0.0 { ci.ea * strain } else { 0.0 };

            let old_tension = cable_tensions[&ci.elem_id];
            let change = (tension - old_tension).abs();
            let ref_val = old_tension.abs().max(tension.abs()).max(1.0);
            max_change = max_change.max(change / ref_val);
            cable_tensions.insert(ci.elem_id, tension);
        }

        if max_change < CABLE_TOL {
            break;
        }
    }
}

// ==================== 3D Staged Construction Analysis ====================

/// Solve a 3D staged construction analysis.
///
/// For each stage in order:
/// 1. Determine which elements and supports are active
/// 2. Assemble 3D stiffness matrix for active elements (frames, plates, cables)
/// 3. Build load vector from stage loads
/// 4. Solve for incremental displacements
/// 5. Accumulate displacements
/// 6. Compute element forces using cumulative displacements
pub fn solve_staged_3d(input: &StagedInput3D) -> Result<StagedAnalysisResults3D, String> {
    if input.stages.is_empty() {
        return Err("No construction stages defined".into());
    }

    // Build DOF numbering from the full structure (all nodes, all elements)
    let full_input = staged_to_full_solver_input_3d(input);
    let dof_num = DofNumbering::build_3d(&full_input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Build constraint system once (shared across all stages)
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new(); // node_ids
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

        // Build a SolverInput3D for this stage with only active elements/supports/loads
        let stage_input = build_stage_solver_input_3d(
            input, &active_elements, &active_supports, stage,
        );

        // Assemble stiffness using existing 3D assembler
        let mut asm = assemble_3d(&stage_input, &dof_num);

        // Add artificial stiffness for disconnected nodes
        add_artificial_stiffness_3d(&mut asm, &stage_input, &full_input, &dof_num);

        // Build prescribed displacement vector
        let mut u_r = vec![0.0; nr];
        for sup in stage_input.supports.values() {
            let prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
            for (i, pd) in prescribed.iter().enumerate() {
                if let Some(val) = pd {
                    if val.abs() > 1e-15 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                            if d >= nf {
                                u_r[d - nf] = *val;
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

        // Check if K_ff has any non-zero diagonal
        let max_diag: f64 = (0..nf).map(|i| k_ff[i * nf + i].abs()).fold(0.0, f64::max);
        if max_diag < 1e-30 {
            stage_results.push(StageResult3D {
                stage_name: stage.name.clone(),
                stage_index: stage_idx,
                results: build_results_from_u_3d(
                    &cumulative_u, &dof_num, input, &stage_input, &active_elements,
                ),
            });
            continue;
        }

        // Reduce with constraint system if present
        let (k_s, f_s) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };

        // Solve for incremental displacements in (possibly reduced) space
        let u_s_inc = {
            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s.clone();
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or_else(|| format!(
                            "Singular stiffness at stage '{}' — structure is a mechanism",
                            stage.name
                        ))?
                }
            }
        };

        // Expand back to full free DOFs
        let u_f_inc = if let Some(ref cs) = cs {
            cs.expand_solution(&u_s_inc)
        } else {
            u_s_inc
        };

        // Accumulate displacements
        for i in 0..nf {
            cumulative_u[i] += u_f_inc[i];
        }
        for i in 0..nr {
            cumulative_u[nf + i] = u_r[i];
        }

        // Build results for this stage
        stage_results.push(StageResult3D {
            stage_name: stage.name.clone(),
            stage_index: stage_idx,
            results: build_results_from_u_3d(
                &cumulative_u, &dof_num, input, &stage_input, &active_elements,
            ),
        });
    }

    let final_results = stage_results.last()
        .map(|sr| sr.results.clone())
        .unwrap_or_else(|| AnalysisResults3D {
            displacements: vec![],
            reactions: vec![],
            element_forces: vec![],
            plate_stresses: vec![],
            quad_stresses: vec![],
            quad_nodal_stresses: vec![],
            constraint_forces: vec![],
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: vec![],
            equilibrium: None,
            timings: None,
            result_summary: None, solver_run_meta: None,
        });

    Ok(StagedAnalysisResults3D {
        stages: stage_results,
        final_results,
    })
}

/// Convert StagedInput3D to a full SolverInput3D (all elements active) for DOF numbering.
fn staged_to_full_solver_input_3d(input: &StagedInput3D) -> SolverInput3D {
    SolverInput3D {
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements: input.elements.clone(),
        supports: input.supports.clone(),
        loads: input.loads.clone(),
        constraints: input.constraints.clone(),
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Build a SolverInput3D with only active elements, supports, and stage loads.
fn build_stage_solver_input_3d(
    input: &StagedInput3D,
    active_elements: &HashSet<usize>,
    active_supports: &HashSet<usize>,
    stage: &ConstructionStage3D,
) -> SolverInput3D {
    let elements: HashMap<String, SolverElement3D> = input.elements.iter()
        .filter(|(_, e)| active_elements.contains(&e.id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let supports: HashMap<String, SolverSupport3D> = input.supports.iter()
        .filter(|(_, s)| active_supports.contains(&s.node_id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    let loads: Vec<SolverLoad3D> = stage.load_indices.iter()
        .filter_map(|&idx| input.loads.get(idx).cloned())
        .collect();

    SolverInput3D {
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements,
        supports,
        loads,
        constraints: input.constraints.clone(),
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// Add artificial stiffness for DOFs of nodes not connected to any active element.
fn add_artificial_stiffness_3d(
    asm: &mut AssemblyResult,
    stage_input: &SolverInput3D,
    full_input: &SolverInput3D,
    dof_num: &DofNumbering,
) {
    let n = dof_num.n_total;

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(asm.k[i * n + i].abs());
    }
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
                    if asm.k[d * n + d].abs() < 1e-30 {
                        asm.k[d * n + d] += artificial_k;
                        asm.artificial_dofs.push(d);
                    }
                }
            }
        }
    }

    // Add artificial rotational stiffness at fully-hinged nodes
    if dof_num.dofs_per_node >= 6 {
        let mut node_hinge_count: HashMap<usize, usize> = HashMap::new();
        let mut node_frame_count: HashMap<usize, usize> = HashMap::new();

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
                // All frame connections are hinged — add artificial rotational stiffness
                for rot_dof in 3..6 {
                    if let Some(&d) = dof_num.map.get(&(node_id, rot_dof)) {
                        if asm.k[d * n + d].abs() < artificial_k * 0.5 {
                            asm.k[d * n + d] += artificial_k;
                            asm.artificial_dofs.push(d);
                        }
                    }
                }
            }
        }
    }
}

/// Build AnalysisResults3D from cumulative displacements.
fn build_results_from_u_3d(
    u: &[f64],
    dof_num: &DofNumbering,
    full_input: &StagedInput3D,
    stage_input: &SolverInput3D,
    active_elements: &HashSet<usize>,
) -> AnalysisResults3D {
    // Displacements
    let displacements = build_displacements_3d(dof_num, u);

    // Element forces (for active frame/truss elements)
    let left_hand = stage_input.left_hand.unwrap_or(false);
    let mut element_forces = Vec::new();

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode3D> = full_input.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> = full_input.elements.values().map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = full_input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = full_input.sections.values().map(|s| (s.id, s)).collect();

    for elem in full_input.elements.values() {
        if !active_elements.contains(&elem.id) { continue; }

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ui: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_i, i).map(|d| u[d]).unwrap_or(0.0)
            }).collect();
            let uj: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_j, i).map(|d| u[d]).unwrap_or(0.0)
            }).collect();
            let delta: f64 = (0..3).map(|i| (uj[i] - ui[i]) * dir[i]).sum();
            let n_axial = e * sec.a / l * delta;

            element_forces.push(ElementForces3D {
                element_id: elem.id, length: l,
                n_start: n_axial, n_end: n_axial,
                vy_start: 0.0, vy_end: 0.0,
                vz_start: 0.0, vz_end: 0.0,
                mx_start: 0.0, mx_end: 0.0,
                my_start: 0.0, my_end: 0.0,
                mz_start: 0.0, mz_end: 0.0,
                hinge_start: false, hinge_end: false,
                q_yi: 0.0, q_yj: 0.0,
                distributed_loads_y: vec![], point_loads_y: vec![],
                q_zi: 0.0, q_zj: 0.0,
                distributed_loads_z: vec![], point_loads_z: vec![],
                bimoment_start: None, bimoment_end: None,
            });
            continue;
        }

        let (ex, ey, ez) = compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle,
            left_hand,
        );

        let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
            let l2 = l * l;
            let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
            let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
            (py, pz)
        } else {
            (0.0, 0.0)
        };

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        // Compute f_local = K_local * u_local
        let k_local = frame_local_stiffness_3d(
            e, sec.a, sec.iy, sec.iz, sec.j, l, g,
            elem.hinge_start, elem.hinge_end, phi_y, phi_z,
        );
        let t = frame_transform_3d(&ex, &ey, &ez);

        // Get element global displacements and transform to local
        let ndof = 12;
        let u_global: Vec<f64> = if dof_num.dofs_per_node >= 7 {
            // Map from 14-DOF space to 12-DOF
            const DOF_MAP: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
            DOF_MAP.iter().map(|&idx| u[elem_dofs[idx]]).collect()
        } else {
            elem_dofs.iter().map(|&d| u[d]).collect()
        };
        let u_local = transform_displacement(&u_global, &t, ndof);

        let mut f_local = vec![0.0; ndof];
        for i in 0..ndof {
            for j in 0..ndof {
                f_local[i] += k_local[i * ndof + j] * u_local[j];
            }
        }

        element_forces.push(ElementForces3D {
            element_id: elem.id,
            length: l,
            n_start: f_local[0],
            n_end: f_local[6],
            vy_start: f_local[1],
            vy_end: f_local[7],
            vz_start: f_local[2],
            vz_end: f_local[8],
            mx_start: f_local[3],
            mx_end: f_local[9],
            my_start: f_local[4],
            my_end: f_local[10],
            mz_start: f_local[5],
            mz_end: f_local[11],
            hinge_start: elem.hinge_start,
            hinge_end: elem.hinge_end,
            q_yi: 0.0, q_yj: 0.0,
            distributed_loads_y: vec![],
            point_loads_y: vec![],
            q_zi: 0.0, q_zj: 0.0,
            distributed_loads_z: vec![],
            point_loads_z: vec![],
            bimoment_start: None,
            bimoment_end: None,
        });
    }
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute reactions from equilibrium at supported nodes
    let mut node_forces = HashMap::<usize, [f64; 6]>::new();
    for ef in &element_forces {
        if let Some(&elem) = elem_by_id.get(&ef.element_id) {
            let node_i = node_by_id[&elem.node_i];
            let node_j = node_by_id[&elem.node_j];

            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle,
                left_hand,
            );
            let t = frame_transform_3d(&ex, &ey, &ez);

            let f_local = [
                ef.n_start, ef.vy_start, ef.vz_start,
                ef.mx_start, ef.my_start, ef.mz_start,
                ef.n_end, ef.vy_end, ef.vz_end,
                ef.mx_end, ef.my_end, ef.mz_end,
            ];

            // Transform local forces to global: f_global = T^T * f_local
            let mut f_global = [0.0; 12];
            for i in 0..12 {
                for j in 0..12 {
                    f_global[i] += t[j * 12 + i] * f_local[j];
                }
            }

            let entry_i = node_forces.entry(elem.node_i).or_insert([0.0; 6]);
            for k in 0..6 { entry_i[k] += f_global[k]; }

            let entry_j = node_forces.entry(elem.node_j).or_insert([0.0; 6]);
            for k in 0..6 { entry_j[k] += f_global[k + 6]; }
        }
    }

    let mut reactions = Vec::new();
    for sup in full_input.supports.values() {
        if let Some(nf) = node_forces.get(&sup.node_id) {
            reactions.push(Reaction3D {
                node_id: sup.node_id,
                fx: nf[0], fy: nf[1], fz: nf[2],
                mx: nf[3], my: nf[4], mz: nf[5],
                bimoment: None,
            });
        } else {
            reactions.push(Reaction3D {
                node_id: sup.node_id,
                fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: 0.0,
                bimoment: None,
            });
        }
    }
    reactions.sort_by_key(|r| r.node_id);

    // Plate stresses (delegated to existing function)
    let plate_stresses = compute_plate_stresses(stage_input, dof_num, u);

    AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses,
        quad_stresses: vec![],
        quad_nodal_stresses: vec![],
        constraint_forces: vec![],
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        timings: None,
        result_summary: None, solver_run_meta: None,
    }
}
