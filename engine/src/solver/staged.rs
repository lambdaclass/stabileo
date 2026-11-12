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
    compute_internal_forces_2d,
    compute_plate_stresses,
};
use super::prestress::prestress_fef_2d;
use super::constraints::FreeConstraintSystem;

#[cfg(test)]
#[path = "staged_tests.rs"]
mod tests;
use super::sparse_tangent::{
    SparseSymbolicCache, tangent_free_sparse_triplets, solve_tangent_sparse_diagnosed,
};

/// Model parts a staged payload can carry that the staged input has no field
/// for: serde drops unknown fields, so these used to vanish from the analysis
/// without a word (a staged model with connectors was solved without them).
fn refuse_unrepresented(json: &str, keys: &[(&str, &str)]) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("Parse error: {}", e))?;
    for (key, what) in keys {
        let present = match v.get(key) {
            Some(serde_json::Value::Object(m)) => !m.is_empty(),
            Some(serde_json::Value::Array(a)) => !a.is_empty(),
            _ => false,
        };
        if present {
            return Err(format!(
                "Staged construction analysis does not support {what}; it would solve the model without them. \
                 Remove them or use an analysis that supports them."
            ));
        }
    }
    Ok(())
}

/// Parse a 2D staged payload, refusing the model parts it cannot represent.
pub fn parse_staged_2d(json: &str) -> Result<StagedInput, String> {
    refuse_unrepresented(json, &[("connectors", "connector elements")])?;
    serde_json::from_str(json).map_err(|e| format!("Parse error: {}", e))
}

/// Parse a 3D staged payload, refusing the model parts it cannot represent.
pub fn parse_staged_3d(json: &str) -> Result<StagedInput3D, String> {
    refuse_unrepresented(json, &[
        ("connectors", "connector elements"),
        ("solidShells", "solid shell elements"),
        ("curvedShells", "curved shell elements"),
        ("curvedBeams", "curved beams"),
    ])?;
    serde_json::from_str(json).map_err(|e| format!("Parse error: {}", e))
}

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
    let mut r = solve_staged_2d_contained(input)?;
    let mut diagnostics = crate::known_issues::for_2d(&staged_to_full_solver_input(input), crate::known_issues::Analysis::Linear);
    for stage in &mut r.stages {
        crate::known_issues::attach(&mut stage.results.structured_diagnostics, diagnostics.clone());
        diagnostics = stage.results.structured_diagnostics.clone();
    }
    crate::known_issues::attach(&mut r.final_results.structured_diagnostics, diagnostics);
    crate::known_issues::refuse(&r.final_results.structured_diagnostics)?;
    Ok(r)
}

fn solve_staged_2d_contained(input: &StagedInput) -> Result<StagedAnalysisResults, String> {
    if input.stages.is_empty() {
        return Err("No construction stages defined".into());
    }

    // Staged construction's custom assembly (assemble_stage_2d, below) hardcodes
    // inclined_transforms_2d: vec![] — it never rotates K/F for inclined
    // supports. This means the solve would silently treat an inclined roller
    // as a flat roller (wrong boundary condition and wrong stiffness), not
    // just mis-report results. Reject explicitly until that assembly carries
    // transforms.
    let has_inclined = crate::ordered::values(&input.supports).any(|s| {
        s.support_type == "inclinedRoller"
    });
    if has_inclined {
        return Err("Inclined supports are not yet supported in staged construction analysis \
                    (reactions would be reported in the rotated support frame)".to_string());
    }

    // Build DOF numbering from the full structure (all nodes, all elements)
    let full_solver_input = staged_to_full_solver_input(input);
    super::linear::validate_input_2d(&full_solver_input)?;
    let dof_num = DofNumbering::build_2d(&full_solver_input);

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Build constraint system once (shared across all stages)
    let cs = FreeConstraintSystem::build_2d(&full_solver_input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut prev_u_r = vec![0.0; n - dof_num.n_free];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new();
    let mut cumulative_loads: Vec<SolverLoad> = Vec::new();
    let mut stage_results = Vec::new();
    let mut cumulative_diagnostics = Vec::new();

    // Sparse symbolic Cholesky cache, reused across stages where the active
    // set keeps the same sparsity pattern (the fingerprinted cache rebuilds
    // it when a stage changes the pattern). Used only when ns >= SPARSE_THRESHOLD.
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    // Dispatch dense vs sparse assembly once per solve call (same threshold
    // as the solve dispatch). Below it the per-stage assembly is the dense
    // n×n `assemble_staged_2d`, byte-identical to the legacy behavior; at or
    // above it the stage is assembled as lower-triangle triplets and no
    // dense n×n matrix is ever built.
    let use_sparse = ns >= super::linear::SPARSE_THRESHOLD;

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

        // Assemble stiffness for active elements: dense n×n below
        // SPARSE_THRESHOLD, lower-triangle triplets over ALL DOFs at/above it.
        let asm_dense = if use_sparse {
            None
        } else {
            Some(assemble_staged_2d(
                &stage_solver_input, &dof_num, input, &active_elements, stage,
            ))
        };
        let asm_trips = if use_sparse {
            Some(assemble_staged_2d_triplets(
                &stage_solver_input, &dof_num, input, &active_elements, stage,
            ))
        } else {
            None
        };

        // Build prescribed displacement vector
        let mut u_r = vec![0.0; nr];
        for sup in crate::ordered::values(&stage_solver_input.supports) {
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

        // Only the change of the prescribed displacements since the last
        // stage drives this stage's increment: the full u_r re-applied every
        // stage counted a settlement once per stage (found by the metamorphic
        // linear-agreement check: two load stages gave twice the settlement).
        let du_r: Vec<f64> = u_r.iter().zip(&prev_u_r).map(|(a, b)| a - b).collect();
        // Extract Kff, Ff and apply F_f_modified = F_f - K_fr * du_r.
        let mut k_ff_dense: Option<Vec<f64>> = None;
        let f_f: Vec<f64>;
        let max_diag: f64;
        if let Some(ref t) = asm_trips {
            let k_full = CscMatrix::from_triplets(n, &t.rows, &t.cols, &t.vals);
            let mut ff = t.f[..nf].to_vec();
            let k_fr_ur = k_full.sparse_cross_block_matvec(&du_r, nf);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
            max_diag = t.diag[..nf].iter().fold(0.0f64, |m, v| m.max(v.abs()));
            f_f = ff;
        } else {
            let asm = asm_dense.as_ref().unwrap();
            let free_idx: Vec<usize> = (0..nf).collect();
            let rest_idx: Vec<usize> = (nf..n).collect();
            let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
            let mut ff = extract_subvec(&asm.f, &free_idx);

            // F_f_modified = F_f - K_fr * u_r
            let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
            let k_fr_ur = mat_vec_rect(&k_fr, &du_r, nf, nr);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
            max_diag = (0..nf).map(|i| k_ff[i * nf + i].abs()).fold(0.0, f64::max);
            f_f = ff;
            k_ff_dense = Some(k_ff);
        }

        let residual_at = |cum: &SolverInput, u: &[f64]| {
            PhysicalStageResidual::assemble(|| {
                if use_sparse {
                    let asm = assemble_staged_2d_triplets(cum, &dof_num, input, &active_elements, stage);
                    let k = CscMatrix::from_triplets(n, &asm.rows, &asm.cols, &asm.vals);
                    compute_stage_reactions_sparse(&k, &asm.f, nf, nr, u)
                } else {
                    let asm = assemble_staged_2d(cum, &dof_num, input, &active_elements, stage);
                    compute_stage_reactions_vec(&asm, n, nf, nr, u, &u[nf..])
                }
            })
        };

        // Check if K_ff has any non-zero diagonal (structure might be a mechanism at this stage)
        if nf == 0 {
            cumulative_u.copy_from_slice(&u_r);
            prev_u_r.clone_from(&u_r);
        }
        if max_diag < 1e-30 {
            // No stiffness at this stage — skip
            let cumulative_solver_input = SolverInput {
                solver_options: None, masses: Default::default(),
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
                    &residual_at(&cumulative_solver_input, &cumulative_u),
                    cs.as_ref(),
                )?,
            });
            continue;
        }

        // Solve for incremental displacements in (possibly reduced) space
        let mut conditioning = None;
        let u_s_inc = if use_sparse {
            // Sparse path: CSC free block filtered straight from the stage
            // triplets (constraint reduction in sparse form) + sparse
            // Cholesky with cached symbolic.
            let t = asm_trips.as_ref().unwrap();
            let f_s = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&t.rows, &t.cols, &t.vals, nf, &cs);
            solve_tangent_sparse_diagnosed(&k_csc, &f_s, &mut sparse_sym_cache, &mut conditioning)?
        } else {
            let k_ff = k_ff_dense.unwrap();
            // Reduce with constraint system if present
            let (k_s, f_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };
            let mut k_work = k_s.clone();
            let solved = cholesky_solve(&mut k_work, &f_s, ns);
            conditioning = crate::known_issues::dense_factor_conditioning(&k_s, ns, solved.as_ref().map(|_| k_work.as_slice()));
            match solved {
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
        prev_u_r = u_r.clone();

        // Build cumulative input for correct FEF subtraction in internal force recovery.
        let cumulative_solver_input = SolverInput {
            solver_options: None, masses: Default::default(),
            loads: cumulative_loads.clone(),
            ..stage_solver_input.clone()
        };

        let reactions_vec = residual_at(&cumulative_solver_input, &cumulative_u);

        // Build results for this stage
        stage_results.push(StageResult {
            stage_name: stage.name.clone(),
            stage_index: stage_idx,
            results: build_results_from_u(
                &cumulative_u,
                &dof_num,
                &cumulative_solver_input,
                &reactions_vec,
                cs.as_ref(),
            )?,
        });
        crate::known_issues::attach(&mut stage_results.last_mut().unwrap().results.structured_diagnostics, conditioning.into_iter().collect());
        crate::known_issues::attach(&mut cumulative_diagnostics, stage_results.last().unwrap().results.structured_diagnostics.clone());
        crate::known_issues::attach(&mut stage_results.last_mut().unwrap().results.structured_diagnostics, cumulative_diagnostics.clone());
    }

    let final_results = stage_results.last()
        .ok_or("Staged analysis produced no stage results")?
        .results.clone();

    Ok(StagedAnalysisResults {
        stages: stage_results,
        final_results,
    })
}

/// Convert StagedInput to a full SolverInput (all elements active) for DOF numbering.
fn staged_to_full_solver_input(input: &StagedInput) -> SolverInput {
    SolverInput {
        solver_options: None, masses: Default::default(),
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
        solver_options: None, masses: Default::default(),
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
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&full_input.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = crate::ordered::values(&full_input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&full_input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = crate::ordered::values(&full_input.sections).map(|s| (s.id, s)).collect();

    // Assemble active element stiffness matrices
    for elem in crate::ordered::values(&stage_input.elements) {
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
            // The stage's loads on the bar, as the linear assembly takes them. They used to be
            // dropped: a bar's member loads (an axial span load among them) never reached it.
            let load_refs: Vec<&SolverLoad> = stage_input.loads.iter().collect();
            super::assembly::assemble_truss_loads_2d(&load_refs, elem.id, l, cos, sin, e, sec.a, &truss_dofs, &mut f_global);
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
            let load_refs: Vec<&SolverLoad> = stage_input.loads.iter().collect();
            assemble_element_loads_2d(
                &load_refs, elem, &t, l, e, mat.nu, sec, &elem_dofs, &mut f_global,
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

    // Add spring stiffness (shared with the linear assembler: angle, and
    // rotational springs on any support type).
    for (i, j, k) in super::assembly::support_spring_entries_2d(stage_input, dof_num) {
        k_global[i * n + j] += k;
    }

    let mut max_diag = 0.0f64;
    for i in 0..n {
        max_diag = max_diag.max(k_global[i * n + i].abs());
    }

    // Add artificial stiffness for disconnected nodes and fully-hinged nodes.
    // In staged analysis, some nodes may not be connected to any active element.
    let mut artificial_dofs = Vec::new();
    let artificial_k = super::assembly::artificial_stiffness(max_diag);

    // Collect nodes connected to active elements
    let mut connected_nodes = HashSet::new();
    for elem in crate::ordered::values(&stage_input.elements) {
        connected_nodes.insert(elem.node_i);
        connected_nodes.insert(elem.node_j);
    }

    // Add artificial stiffness for ALL DOFs of disconnected nodes
    for node in crate::ordered::values(&full_input.nodes) {
        if !connected_nodes.contains(&node.id) {
            for local_dof in 0..dof_num.dofs_per_node {
                if let Some(d) = artificial_dof(dof_num, node.id, local_dof) {
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

        for elem in crate::ordered::values(&stage_input.elements) {
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
                if let Some(d) = artificial_dof(dof_num, node_id, 2) {
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

/// Result of the triplet staged 2D assembly: lower-triangle stiffness
/// triplets over ALL DOFs (the caller builds the full-K CSC for K_fr·u_r and
/// reactions, and the free×free CSC for the solve), plus the dense force
/// vector and the final assembled diagonal (for the no-stiffness check).
struct StagedTriplets2D {
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    f: Vec<f64>,
    diag: Vec<f64>,
}

/// Sparse counterpart of `assemble_staged_2d` for the ns >= SPARSE_THRESHOLD
/// path: identical assembly logic (active elements only, stage loads,
/// prestress FEFs, springs, artificial stiffness) but scatters K into
/// lower-triangle triplets instead of a dense n×n matrix. `diag` tracks the
/// running diagonal so the max-diag and zero-diag checks match the dense
/// reads of `k_global[d*n+d]` exactly.
fn assemble_staged_2d_triplets(
    stage_input: &SolverInput,
    dof_num: &DofNumbering,
    full_input: &StagedInput,
    active_elements: &HashSet<usize>,
    stage: &ConstructionStage,
) -> StagedTriplets2D {
    let n = dof_num.n_total;
    let mut rows = Vec::new();
    let mut cols = Vec::new();
    let mut vals = Vec::new();
    let mut f_global = vec![0.0; n];
    let mut diag = vec![0.0; n];

    // Build lookup maps to avoid O(n) linear scans per element
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&full_input.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> = crate::ordered::values(&full_input.elements).map(|e| (e.id, e)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&full_input.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = crate::ordered::values(&full_input.sections).map(|s| (s.id, s)).collect();

    // Assemble active element stiffness matrices
    for elem in crate::ordered::values(&stage_input.elements) {
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
                    let gi = truss_dofs[i];
                    let gj = truss_dofs[j];
                    if gi >= gj {
                        rows.push(gi);
                        cols.push(gj);
                        vals.push(k_elem[i * ndof + j]);
                    }
                }
                diag[truss_dofs[i]] += k_elem[i * ndof + i];
            }
            let load_refs: Vec<&SolverLoad> = stage_input.loads.iter().collect();
            super::assembly::assemble_truss_loads_2d(&load_refs, elem.id, l, cos, sin, e, sec.a, &truss_dofs, &mut f_global);
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
                    let gi = elem_dofs[i];
                    let gj = elem_dofs[j];
                    if gi >= gj {
                        rows.push(gi);
                        cols.push(gj);
                        vals.push(k_glob[i * ndof + j]);
                    }
                }
                diag[elem_dofs[i]] += k_glob[i * ndof + i];
            }

            // Assemble element loads (FEF) for this stage's loads
            let load_refs: Vec<&SolverLoad> = stage_input.loads.iter().collect();
            assemble_element_loads_2d(
                &load_refs, elem, &t, l, e, mat.nu, sec, &elem_dofs, &mut f_global,
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

    // Add spring stiffness (shared with the linear assembler), lower triangle.
    for (i, j, k) in super::assembly::support_spring_entries_2d(stage_input, dof_num) {
        if i >= j {
            rows.push(i);
            cols.push(j);
            vals.push(k);
        }
        if i == j {
            diag[i] += k;
        }
    }

    let mut max_diag = 0.0f64;
    for &v in &diag {
        max_diag = max_diag.max(v.abs());
    }

    // Add artificial stiffness for disconnected nodes and fully-hinged nodes.
    // In staged analysis, some nodes may not be connected to any active element.
    let artificial_k = super::assembly::artificial_stiffness(max_diag);

    // Collect nodes connected to active elements
    let mut connected_nodes = HashSet::new();
    for elem in crate::ordered::values(&stage_input.elements) {
        connected_nodes.insert(elem.node_i);
        connected_nodes.insert(elem.node_j);
    }

    // Add artificial stiffness for ALL DOFs of disconnected nodes
    for node in crate::ordered::values(&full_input.nodes) {
        if !connected_nodes.contains(&node.id) {
            for local_dof in 0..dof_num.dofs_per_node {
                if let Some(d) = artificial_dof(dof_num, node.id, local_dof) {
                    if diag[d].abs() < 1e-30 {
                        rows.push(d);
                        cols.push(d);
                        vals.push(artificial_k);
                        diag[d] += artificial_k;
                    }
                }
            }
        }
    }

    // Add artificial rotational stiffness at fully-hinged nodes
    if dof_num.dofs_per_node >= 3 {
        let mut node_hinge_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();

        for elem in crate::ordered::values(&stage_input.elements) {
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
                if let Some(d) = artificial_dof(dof_num, node_id, 2) {
                    rows.push(d);
                    cols.push(d);
                    vals.push(artificial_k);
                    diag[d] += artificial_k;
                }
            }
        }
    }

    StagedTriplets2D { rows, cols, vals, f: f_global, diag }
}

fn artificial_dof(dofs: &DofNumbering, node: usize, local: usize) -> Option<usize> {
    dofs.global_dof(node, local).filter(|&d| d < dofs.n_free)
}

pub(super) struct PhysicalStageResidual(Vec<f64>);

impl PhysicalStageResidual {
    pub(super) fn as_slice(&self) -> &[f64] { &self.0 }
    fn assemble(recover: impl FnOnce() -> Vec<f64>) -> Self {
        Self(super::assembly::physical_stiffness(recover))
    }
}

fn state_is_directly_prescribed(u: &[f64], n_free: usize, prescribed: &[f64]) -> bool {
    n_free == 0 && u == prescribed
}

/// Build AnalysisResults from cumulative displacements.
fn build_results_from_u(
    u: &[f64],
    dof_num: &DofNumbering,
    input: &SolverInput,
    reactions_vec: &PhysicalStageResidual,
    cs: Option<&FreeConstraintSystem>,
) -> Result<AnalysisResults, String> {
    let displacements = build_displacements_2d(dof_num, u);
    let mut element_forces = compute_internal_forces_2d(input, dof_num, u);
    element_forces.sort_by_key(|ef| ef.element_id);
    let recovered = super::reaction_recovery::RecoveredForces::from_stage(reactions_vec, dof_num, cs);
    let reactions = recovered.reactions_2d(input, dof_num, u, &[])?;

    let prescribed = super::linear::prescribed_displacements_2d(input, dof_num);
    let determined = state_is_directly_prescribed(u, dof_num.n_free, &prescribed);
    let structured_diagnostics = if !determined && input.elements.is_empty() && super::assembly::support_spring_entries_2d(input, dof_num).is_empty() {
        vec![super::reaction_recovery::unavailable("stageResults", "This stage has no active physical stiffness. Its displacements and forces are unavailable as an equilibrium solution; artificial stiffness may carry the state.")]
    } else { vec![] };

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces: recovered.constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics,
        equilibrium: None,
        result_summary: None, solver_run_meta: None,
    })
}

fn compute_stage_reactions_vec(
    asm: &AssemblyResult,
    n: usize,
    _nf: usize,
    _nr: usize,
    u_full: &[f64],
    _u_r: &[f64],
) -> Vec<f64> {
    mat_vec(&asm.k, u_full, n).iter().zip(&asm.f).map(|(ku, f)| ku - f).collect()
}

/// Sparse counterpart of `compute_stage_reactions_vec`: with the full-K CSC,
/// (K·u)[r] − F_r is exactly K_rf·u_f + K_rr·u_r − F_r (u_full already holds
/// the prescribed displacements at the restrained DOFs).
fn compute_stage_reactions_sparse(
    k_full: &CscMatrix,
    f: &[f64],
    _nf: usize,
    _nr: usize,
    u_full: &[f64],
) -> Vec<f64> {
    k_full.sym_mat_vec(u_full).iter().zip(f).map(|(ku, f)| ku - f).collect()
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
    let mut r = solve_staged_3d_contained(input)?;
    let mut diagnostics = crate::known_issues::for_3d(&staged_containment_input_3d(input), crate::known_issues::Analysis::Linear);
    for stage in &mut r.stages {
        crate::known_issues::attach(&mut stage.results.structured_diagnostics, diagnostics.clone());
        diagnostics = stage.results.structured_diagnostics.clone();
    }
    crate::known_issues::attach(&mut r.final_results.structured_diagnostics, diagnostics);
    crate::known_issues::refuse(&r.final_results.structured_diagnostics)?;
    Ok(r)
}

fn solve_staged_3d_contained(input: &StagedInput3D) -> Result<StagedAnalysisResults3D, String> {
    if input.stages.is_empty() {
        return Err("No construction stages defined".into());
    }

    // Unlike the 2D path, solve_staged_3d's per-stage assembly does reuse
    // assemble_3d (which correctly rotates K/F for inclined supports).
    // However, build_results_from_u_3d computes reactions and element
    // forces by summing per-element local-frame forces (via each element's
    // OWN axis transform), which requires TRUE global nodal displacements —
    // cumulative_u keeps inclined-support DOFs in the rotated (normal,
    // tangent, tangent) basis assemble_3d's solve produces, so those
    // per-element computations would be wrong for any element touching an
    // inclined-support node. Reject explicitly rather than reporting
    // silently-wrong element forces/reactions.
    let has_inclined = crate::ordered::values(&input.supports).any(|s| {
        s.is_inclined == Some(true)
    });
    if has_inclined {
        return Err("Inclined supports are not yet supported in staged construction analysis \
                    (reactions would be reported in the rotated support frame)".to_string());
    }

    /*
     * A nine-node shell cannot be staged, and says so instead of vanishing.
     *
     * `ConstructionStage3D` has `plates_added` and `quads_added` but no list
     * for quad9s, because nothing in the application builds one and so no
     * stage could name it. That leaves the field in exactly the state this
     * change exists to abolish: accepted by serde, activated by nothing,
     * dropped in silence — which is how the plates and quads beside it were
     * lost for as long as they were.
     *
     * Refusing is the choice the inclined-support guard above already makes,
     * for the same reason: no answer beats a plausible wrong one. When a stage
     * list arrives for them, this goes and the filter joins the two below.
     */
    if !input.quad9s.is_empty() {
        return Err("Nine-node shell elements are not yet supported in staged construction \
                    analysis (no stage can activate them, so they would be silently \
                    omitted from every stage)".to_string());
    }

    // Build DOF numbering from the full structure (all nodes, all elements)
    let full_input = staged_to_full_solver_input_3d(input);
    super::linear::validate_input_3d(&full_input)?;
    let dof_num = DofNumbering::build_3d(&full_input);

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Build constraint system once (shared across all stages)
    let cs = FreeConstraintSystem::build_3d(&full_input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut prev_u_r = vec![0.0; n - dof_num.n_free];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new(); // node_ids
    // Shells track their own active sets: their ids are their own, and a plate
    // may share a number with an element.
    let mut active_plates: HashSet<usize> = HashSet::new();
    let mut active_quads: HashSet<usize> = HashSet::new();
    let mut stage_results = Vec::new();
    let mut cumulative_diagnostics = Vec::new();

    // Sparse symbolic Cholesky cache, reused across stages where the active
    // set keeps the same sparsity pattern (the fingerprinted cache rebuilds
    // it when a stage changes the pattern). Used only when ns >= SPARSE_THRESHOLD.
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    // Dispatch dense vs sparse assembly once per solve call (same threshold
    // as the solve dispatch). Below it the per-stage assembly is the dense
    // n×n `assemble_3d` + `add_artificial_stiffness_3d`, byte-identical to
    // the legacy behavior; at or above it the stage is assembled as
    // lower-triangle triplets and no dense n×n matrix is ever built.
    let use_sparse = ns >= super::linear::SPARSE_THRESHOLD;

    let mut cumulative_loads: Vec<SolverLoad3D> = Vec::new();
    for (stage_idx, stage) in input.stages.iter().enumerate() {
        cumulative_loads.extend(stage.load_indices.iter().filter_map(|&idx| input.loads.get(idx).cloned()));
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
        for &pid in &stage.plates_added {
            active_plates.insert(pid);
        }
        for &pid in &stage.plates_removed {
            active_plates.remove(&pid);
        }
        for &qid in &stage.quads_added {
            active_quads.insert(qid);
        }
        for &qid in &stage.quads_removed {
            active_quads.remove(&qid);
        }

        // Build a SolverInput3D for this stage with only active elements/supports/loads
        let stage_input = build_stage_solver_input_3d(
            input, &active_elements, &active_supports, &active_plates, &active_quads, stage,
        );

        // Assemble stiffness: dense n×n (`assemble_3d` + staged artificial
        // stiffness) below SPARSE_THRESHOLD; shared sparse 3D assembler +
        // stage load vector + the same artificial stiffness as diagonal
        // triplets at/above it.
        let asm_dense = if use_sparse {
            None
        } else {
            let mut asm = assemble_3d(&stage_input, &dof_num);
            // Add artificial stiffness for disconnected nodes
            add_artificial_stiffness_3d(&mut asm, &stage_input, &full_input, &dof_num);
            Some(asm)
        };
        let asm_trips = if use_sparse {
            Some(assemble_staged_3d_triplets(&stage_input, &full_input, &dof_num))
        } else {
            None
        };

        // Build prescribed displacement vector
        let mut u_r = vec![0.0; nr];
        for sup in crate::ordered::values(&stage_input.supports) {
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

        // Only the change of the prescribed displacements since the last
        // stage drives this stage's increment: the full u_r re-applied every
        // stage counted a settlement once per stage (found by the metamorphic
        // linear-agreement check: two load stages gave twice the settlement).
        let du_r: Vec<f64> = u_r.iter().zip(&prev_u_r).map(|(a, b)| a - b).collect();
        // Extract Kff, Ff and apply F_f_modified = F_f - K_fr * du_r.
        // Sparse path: the full-K CSC (from the stage triplets) provides the
        // K_fr·u_r cross-block matvec; the free×free CSC for the solve is
        // filtered from the same triplets further below.
        let mut k_ff_dense: Option<Vec<f64>> = None;
        let f_f: Vec<f64>;
        let max_diag: f64;
        if let Some(ref t) = asm_trips {
            let k_full = CscMatrix::from_triplets(n, &t.rows, &t.cols, &t.vals);
            let mut ff = t.f[..nf].to_vec();
            let k_fr_ur = k_full.sparse_cross_block_matvec(&du_r, nf);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
            max_diag = t.diag[..nf].iter().fold(0.0f64, |m, v| m.max(v.abs()));
            f_f = ff;
        } else {
            let asm = asm_dense.as_ref().unwrap();
            let free_idx: Vec<usize> = (0..nf).collect();
            let rest_idx: Vec<usize> = (nf..n).collect();
            let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
            let mut ff = extract_subvec(&asm.f, &free_idx);

            // F_f_modified = F_f - K_fr * u_r
            let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
            let k_fr_ur = mat_vec_rect(&k_fr, &du_r, nf, nr);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
            max_diag = (0..nf).map(|i| k_ff[i * nf + i].abs()).fold(0.0, f64::max);
            f_f = ff;
            k_ff_dense = Some(k_ff);
        }

        let residual_at = |cum: &SolverInput3D, u: &[f64]| {
            PhysicalStageResidual::assemble(|| {
                if use_sparse {
                    let asm = assemble_staged_3d_triplets(cum, &full_input, &dof_num);
                    let k = CscMatrix::from_triplets(n, &asm.rows, &asm.cols, &asm.vals);
                    compute_stage_reactions_sparse(&k, &asm.f, nf, nr, u)
                } else {
                    let asm = assemble_3d(cum, &dof_num);
                    compute_stage_reactions_vec(&asm, n, nf, nr, u, &u[nf..])
                }
            })
        };

        // Check if K_ff has any non-zero diagonal
        if nf == 0 {
            cumulative_u.copy_from_slice(&u_r);
            prev_u_r.clone_from(&u_r);
        }
        if max_diag < 1e-30 {
            let cum_input = SolverInput3D { loads: cumulative_loads.clone(), ..stage_input.clone() };
            let results = build_results_from_u_3d(&cumulative_u, &dof_num, &cum_input, &residual_at(&cum_input, &cumulative_u), cs.as_ref())?;
            crate::known_issues::membrane_bending_3d(&cum_input, &cum_input.loads, &results)?;
            stage_results.push(StageResult3D {
                stage_name: stage.name.clone(),
                stage_index: stage_idx,
                results,
            });
            continue;
        }

        // Solve for incremental displacements in (possibly reduced) space
        let mut conditioning = None;
        let u_s_inc = if use_sparse {
            // Sparse path: CSC free block filtered straight from the stage
            // triplets (constraint reduction in sparse form) + sparse
            // Cholesky with cached symbolic.
            let t = asm_trips.as_ref().unwrap();
            let f_s = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&t.rows, &t.cols, &t.vals, nf, &cs);
            solve_tangent_sparse_diagnosed(&k_csc, &f_s, &mut sparse_sym_cache, &mut conditioning)?
        } else {
            let k_ff = k_ff_dense.unwrap();
            // Reduce with constraint system if present
            let (k_s, f_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };
            let mut k_work = k_s.clone();
            let solved = cholesky_solve(&mut k_work, &f_s, ns);
            conditioning = crate::known_issues::dense_factor_conditioning(&k_s, ns, solved.as_ref().map(|_| k_work.as_slice()));
            match solved {
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
        prev_u_r = u_r.clone();

        // Reactions (K·u − F_cumulative)_r with this stage's stiffness.
        let cum_input = SolverInput3D { loads: cumulative_loads.clone(), ..stage_input.clone() };
        let reactions_vec = residual_at(&cum_input, &cumulative_u);

        // Build results for this stage
        let results = build_results_from_u_3d(&cumulative_u, &dof_num, &cum_input, &reactions_vec, cs.as_ref())?;
        crate::known_issues::membrane_bending_3d(&cum_input, &cum_input.loads, &results)?;
        stage_results.push(StageResult3D {
            stage_name: stage.name.clone(),
            stage_index: stage_idx,
            results,
        });
        crate::known_issues::attach(&mut stage_results.last_mut().unwrap().results.structured_diagnostics, conditioning.into_iter().collect());
        crate::known_issues::attach(&mut cumulative_diagnostics, stage_results.last().unwrap().results.structured_diagnostics.clone());
        crate::known_issues::attach(&mut stage_results.last_mut().unwrap().results.structured_diagnostics, cumulative_diagnostics.clone());
    }

    let final_results = stage_results.last()
        .ok_or("Staged analysis produced no stage results")?
        .results.clone();

    Ok(StagedAnalysisResults3D {
        stages: stage_results,
        final_results,
    })
}

/// Convert StagedInput3D to a full SolverInput3D (all elements active) for DOF numbering.
fn staged_to_full_solver_input_3d(input: &StagedInput3D) -> SolverInput3D {
    SolverInput3D {
        solver_options: None, masses: Default::default(),
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements: input.elements.clone(),
        supports: input.supports.clone(),
        loads: input.loads.clone(),
        constraints: input.constraints.clone(),
        left_hand: input.left_hand,
        /*
         * EVERY shell, active or not, because this input decides the DOF LAYOUT
         * and the shells are what widen it.
         *
         * Not the node set: `DofNumbering::build_3d` takes its node ids from
         * `input.nodes` unconditionally, so a node that only a later-stage slab
         * touches already has a number either way. What the shells decide is
         * `dofs_per_node`:
         *
         *     let has_plate = !plates.is_empty() || !quads.is_empty() || …;
         *     let dofs_per_node = if has_warping { 7 }
         *                         else if has_frame || has_plate { 6 }
         *                         else { 3 };
         *
         * With frames present that is already 6 and nothing moves. With NONE —
         * a model staged out of slabs and walls alone — passing empty maps here
         * numbered three DOFs per node, which cannot carry plate bending at
         * all. So the stage that finally adds a slab would have had nowhere to
         * assemble its rotations.
         */
        plates: input.plates.clone(),
        quads: input.quads.clone(),
        quad9s: input.quad9s.clone(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// The full model reduced to what some stage activates: a member, shell, support or load that no
/// stage adds never reaches a result, so it must not decide what the staged analysis refuses.
fn staged_containment_input_3d(input: &StagedInput3D) -> SolverInput3D {
    let ever = |pick: fn(&ConstructionStage3D) -> &Vec<usize>| -> HashSet<usize> {
        input.stages.iter().flat_map(|s| pick(s).iter().copied()).collect()
    };
    let (elements, supports, plates, quads) = (ever(|s| &s.elements_added), ever(|s| &s.supports_added), ever(|s| &s.plates_added), ever(|s| &s.quads_added));
    let loads = ever(|s| &s.load_indices);
    let mut full = staged_to_full_solver_input_3d(input);
    full.elements.retain(|_, e| elements.contains(&e.id));
    full.supports.retain(|_, s| supports.contains(&s.node_id));
    full.plates.retain(|_, p| plates.contains(&p.id));
    full.quads.retain(|_, q| quads.contains(&q.id));
    full.loads = crate::ordered::members(&loads).filter_map(|i| input.loads.get(*i).cloned()).collect();
    full
}

/// Build a SolverInput3D with only active elements, supports, and stage loads.
fn build_stage_solver_input_3d(
    input: &StagedInput3D,
    active_elements: &HashSet<usize>,
    active_supports: &HashSet<usize>,
    active_plates: &HashSet<usize>,
    active_quads: &HashSet<usize>,
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

    // Only the shells this stage has reached, by the same rule the members
    // follow. A slab cast in stage 3 must not stiffen stages 1 and 2 — that is
    // the whole point of a staged analysis, and including them always would be
    // a different wrong answer from dropping them always.
    let plates: HashMap<String, SolverPlateElement> = input.plates.iter()
        .filter(|(_, p)| active_plates.contains(&p.id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let quads: HashMap<String, SolverQuadElement> = input.quads.iter()
        .filter(|(_, q)| active_quads.contains(&q.id))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();

    SolverInput3D {
        solver_options: None, masses: Default::default(),
        nodes: input.nodes.clone(),
        materials: input.materials.clone(),
        sections: input.sections.clone(),
        elements,
        supports,
        loads,
        constraints: input.constraints.clone(),
        left_hand: input.left_hand,
        plates,
        quads,
        // quad9s carry no per-stage list yet, and `solve_staged_3d` refuses an
        // input that has any — so this is empty because there are none, not
        // because they were quietly left out.
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
    let artificial_k = super::assembly::artificial_stiffness(max_diag);

    // Collect nodes connected to active elements
    let mut connected_nodes = HashSet::new();
    for elem in crate::ordered::values(&stage_input.elements) {
        connected_nodes.insert(elem.node_i);
        connected_nodes.insert(elem.node_j);
    }

    // Add artificial stiffness for ALL DOFs of disconnected nodes
    for node in crate::ordered::values(&full_input.nodes) {
        if !connected_nodes.contains(&node.id) {
            for local_dof in 0..dof_num.dofs_per_node {
                if let Some(d) = artificial_dof(dof_num, node.id, local_dof) {
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

        for elem in crate::ordered::values(&stage_input.elements) {
            if elem.elem_type == "frame" {
                *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
                *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
                if elem.release_my_start || elem.release_mz_start {
                    *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
                }
                if elem.release_my_end || elem.release_mz_end {
                    *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
                }
            }
        }

        for (&node_id, &frame_count) in &node_frame_count {
            let hinge_count = node_hinge_count.get(&node_id).copied().unwrap_or(0);
            if hinge_count == frame_count && frame_count > 0 {
                // All frame connections are hinged — add artificial rotational stiffness
                for rot_dof in 3..6 {
                    if let Some(d) = artificial_dof(dof_num, node_id, rot_dof) {
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

/// Sparse counterpart of the staged 3D assembly (`assemble_3d` +
/// `add_artificial_stiffness_3d`) for the ns >= SPARSE_THRESHOLD path:
/// stiffness from the shared sparse 3D assembler, force vector from the
/// matching sparse load assembler, and the staged artificial-stiffness
/// additions (disconnected nodes, fully-hinged rotations) applied as extra
/// diagonal triplets on the full-K triplet list.
struct StagedTriplets3D {
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    f: Vec<f64>,
    /// Final assembled diagonal (artificial stiffness included), length n —
    /// used for the no-stiffness stage check, matching the dense reads of
    /// `asm.k[d*n+d]`.
    diag: Vec<f64>,
}

fn assemble_staged_3d_triplets(
    stage_input: &SolverInput3D,
    full_input: &SolverInput3D,
    dof_num: &DofNumbering,
) -> StagedTriplets3D {
    let n = dof_num.n_total;

    let stiff = super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(
        stage_input, dof_num, true,
    );
    let k_full = stiff.k_full.unwrap(); // build_k_full = true
    let f_global = super::sparse_assembly::assemble_load_vector_sparse_3d(
        stage_input, &stage_input.loads, dof_num, &stiff.inclined_transforms,
    );

    // Unpack the full-K CSC back to triplets so the staged artificial
    // stiffness (add_artificial_stiffness_3d's logic) can be appended.
    let mut rows = Vec::with_capacity(k_full.nnz());
    let mut cols = Vec::with_capacity(k_full.nnz());
    let mut vals = Vec::with_capacity(k_full.nnz());
    for j in 0..n {
        for p in k_full.col_ptr[j]..k_full.col_ptr[j + 1] {
            rows.push(k_full.row_idx[p]);
            cols.push(j);
            vals.push(k_full.values[p]);
        }
    }
    let mut diag = k_full.diagonal();

    let mut max_diag = 0.0f64;
    for &v in &diag {
        max_diag = max_diag.max(v.abs());
    }
    let artificial_k = super::assembly::artificial_stiffness(max_diag);

    // Collect nodes connected to active elements
    let mut connected_nodes = HashSet::new();
    for elem in crate::ordered::values(&stage_input.elements) {
        connected_nodes.insert(elem.node_i);
        connected_nodes.insert(elem.node_j);
    }

    // Add artificial stiffness for ALL DOFs of disconnected nodes
    for node in crate::ordered::values(&full_input.nodes) {
        if !connected_nodes.contains(&node.id) {
            for local_dof in 0..dof_num.dofs_per_node {
                if let Some(d) = artificial_dof(dof_num, node.id, local_dof) {
                    if diag[d].abs() < 1e-30 {
                        rows.push(d);
                        cols.push(d);
                        vals.push(artificial_k);
                        diag[d] += artificial_k;
                    }
                }
            }
        }
    }

    // Add artificial rotational stiffness at fully-hinged nodes
    if dof_num.dofs_per_node >= 6 {
        let mut node_hinge_count: HashMap<usize, usize> = HashMap::new();
        let mut node_frame_count: HashMap<usize, usize> = HashMap::new();

        for elem in crate::ordered::values(&stage_input.elements) {
            if elem.elem_type == "frame" {
                *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
                *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
                if elem.release_my_start || elem.release_mz_start {
                    *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
                }
                if elem.release_my_end || elem.release_mz_end {
                    *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
                }
            }
        }

        for (&node_id, &frame_count) in &node_frame_count {
            let hinge_count = node_hinge_count.get(&node_id).copied().unwrap_or(0);
            if hinge_count == frame_count && frame_count > 0 {
                // All frame connections are hinged — add artificial rotational stiffness
                for rot_dof in 3..6 {
                    if let Some(d) = artificial_dof(dof_num, node_id, rot_dof) {
                        if diag[d].abs() < artificial_k * 0.5 {
                            rows.push(d);
                            cols.push(d);
                            vals.push(artificial_k);
                            diag[d] += artificial_k;
                        }
                    }
                }
            }
        }
    }

    StagedTriplets3D { rows, cols, vals, f: f_global, diag }
}

/// Results of a 3D stage from the cumulative displacements, by the linear
/// solver's own recovery: member forces from `compute_internal_forces_3d_with_loads`
/// with the cumulative member loads (fixed-end forces included, the engine's
/// end-force sign convention), reactions as (K·u − F)_r of the stage's
/// stiffness and the cumulative loads, shell stresses by the linear routines.
///
/// This used to be a hand-rolled recovery: f = K_e·u_e reported raw, so N at
/// the start and every end value had the opposite sign to every other
/// analysis, member loads were left out of the end forces, reactions were
/// summed from those forces (missing loads applied at supports, springs and
/// fixed-end forces), and quad stresses were never reported (found by the
/// metamorphic energy and member-reversal checks).
fn build_results_from_u_3d(
    u: &[f64],
    dof_num: &DofNumbering,
    cum_input: &SolverInput3D,
    reactions_vec: &PhysicalStageResidual,
    cs: Option<&FreeConstraintSystem>,
) -> Result<AnalysisResults3D, String> {
    let displacements = build_displacements_3d(dof_num, u);
    let mut element_forces = super::linear::compute_internal_forces_3d_with_loads(cum_input, &cum_input.loads, dof_num, u);
    element_forces.sort_by_key(|ef| ef.element_id);
    let recovered = super::reaction_recovery::RecoveredForces::from_stage(reactions_vec, dof_num, cs);
    let reactions = recovered.reactions_3d(cum_input, dof_num, u, &[])?;
    let plate_stresses = compute_plate_stresses(cum_input, dof_num, u, Some(&cum_input.loads));
    let quad_stresses = super::linear::compute_quad_stresses(cum_input, dof_num, u, Some(&cum_input.loads));
    let quad_nodal_stresses = super::linear::compute_quad_nodal_stresses(cum_input, dof_num, u, Some(&cum_input.loads));

    let prescribed = super::linear::prescribed_displacements_3d(cum_input, dof_num);
    let determined = state_is_directly_prescribed(u, dof_num.n_free, &prescribed);
    let structured_diagnostics = if !determined && cum_input.elements.is_empty() && super::assembly::support_spring_entries_3d(cum_input, dof_num).is_empty() && cum_input.plates.is_empty() && cum_input.quads.is_empty() && cum_input.quad9s.is_empty() {
        vec![super::reaction_recovery::unavailable("stageResults", "This stage has no active physical stiffness. Its displacements and forces are unavailable as an equilibrium solution; artificial stiffness may carry the state.")]
    } else { vec![] };

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses,
        quad_stresses,
        quad_nodal_stresses,
        constraint_forces: recovered.constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics,
        equilibrium: None,
        timings: None,
        result_summary: None, solver_run_meta: None,
    })
}
