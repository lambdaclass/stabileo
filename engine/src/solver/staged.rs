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
use super::assembly::{AssemblyResult, assemble_2d, assemble_3d};
use super::linear::{
    build_displacements_2d,
    build_displacements_3d,
    build_reactions_2d_inclined,
    compute_internal_forces_2d,
    compute_plate_stresses,
};
use super::prestress::prestress_fef_2d;
use super::constraints::FreeConstraintSystem;

#[cfg(test)]
#[path = "staged_tests.rs"]
mod tests;
use super::sparse_tangent::{
    SparseSymbolicCache, cached_symbolic,
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
    if input.stages.is_empty() {
        return Err("No construction stages defined".into());
    }

    let has_inclined = crate::ordered::values(&input.supports).any(|s| {
        s.support_type == "inclinedRoller"
    });
    if has_inclined {
        return Err("Inclined supports are not yet supported in staged construction analysis \
                    (reactions would be reported in the rotated support frame)".to_string());
    }

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
    let mut recovery_history = StageRecoveryHistory::default();
    let mut prev_u_r = vec![0.0; n - dof_num.n_free];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new();
    let mut cumulative_loads: Vec<SolverLoad> = Vec::new();
    let mut stage_results: Vec<StageResult> = Vec::new();
    let mut cumulative_diagnostics = Vec::new();

    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

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
                &stage_solver_input, &dof_num, stage,
            ))
        };
        let asm_trips = if use_sparse {
            Some(assemble_staged_2d_triplets(
                &stage_solver_input, &dof_num, stage,
            ))
        } else {
            None
        };

        let recovery = recovery_history.advance(
            StageStiffnessFingerprint::from_assembly(
                stage_stiffness_contributors_2d(&stage_solver_input),
                n, asm_dense.as_ref(),
                asm_trips.as_ref().map(|a| (a.rows.as_slice(), a.cols.as_slice(), a.vals.as_slice())),
            ),
            &cumulative_u,
            stage_results.last().is_some_and(|r| r.results.element_forces.iter().any(|f| [f.n_start, f.n_end, f.v_start, f.v_end, f.m_start, f.m_end].iter().any(|v| *v != 0.0))),
            asm_dense.as_ref().map_or_else(|| &asm_trips.as_ref().unwrap().f, |a| &a.f),
        );
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
        let mut k_full_csc: Option<CscMatrix> = None;
        let mut k_ff_dense: Option<Vec<f64>> = None;
        let f_f: Vec<f64>;
        if let Some(ref t) = asm_trips {
            let k_full = CscMatrix::from_triplets(n, &t.rows, &t.cols, &t.vals);
            let mut ff = t.f[..nf].to_vec();
            let k_fr_ur = k_full.sparse_cross_block_matvec(&du_r, nf);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
            f_f = ff;
            k_full_csc = Some(k_full);
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
            f_f = ff;
            k_ff_dense = Some(k_ff);
        }

        let k_physical = if let Some(ref t) = asm_trips {
            t.k_ff.clone()
        } else {
            CscMatrix::from_dense_symmetric_exact(&k_ff_dense.unwrap(), nf)
        };
        let cumulative_solver_input = SolverInput {
            solver_options: None, masses: Default::default(),
            loads: cumulative_loads.clone(),
            ..stage_solver_input.clone()
        };
        let cumulative_stage_loads = stage_loads_2d(&cumulative_solver_input, stage);
        let inclined_transforms = if let Some(ref t) = asm_trips {
            &t.inclined_transforms_2d
        } else {
            &asm_dense.as_ref().unwrap().inclined_transforms_2d
        };
        let applied = super::assembly::assemble_load_vector_2d(
            &cumulative_solver_input, &cumulative_stage_loads, &dof_num, inclined_transforms,
        );
        let mut conditioning = None;
        let u_s_inc = solve_stage_free(
            &k_physical, &dof_num, cs.as_ref(), true, &connected_nodes_2d(&stage_solver_input),
            &super::stability::coupling_2d(&stage_solver_input, &dof_num),
            &super::stability::ReleasedRotations::default(), &f_f,
            &asm_trips.as_ref().map_or_else(|| &asm_dense.as_ref().unwrap().f, |t| &t.f)[..nf],
            &applied[..nf], use_sparse,
            &mut sparse_sym_cache, &mut conditioning,
        )?;

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

        let reactions_vec = PhysicalStageResidual::assemble(|| if let Some(ref k_full) = k_full_csc {
            asm_trips.as_ref().unwrap().cumulative_reactions(
                k_full, &cumulative_solver_input, stage, &dof_num, &cumulative_u,
            )
        } else {
            let cumulative_asm = assemble_staged_2d(
                &cumulative_solver_input, &dof_num, stage,
            );
            compute_stage_reactions_vec(&cumulative_asm, n, nf, nr, &cumulative_u, &u_r)
        });

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
                recovery,
                inclined_transforms,
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

fn solve_stage_free(
    k: &CscMatrix,
    dof: &DofNumbering,
    constraints: Option<&FreeConstraintSystem>,
    two_d: bool,
    connected: &HashSet<usize>,
    coupling: &[(usize, usize)],
    releases: &super::stability::ReleasedRotations,
    f: &[f64],
    incremental_applied: &[f64],
    cumulative_applied: &[f64],
    sparse: bool,
    cache: &mut Option<SparseSymbolicCache>,
    conditioning: &mut Option<StructuredDiagnostic>,
) -> Result<Vec<f64>, String> {
    let mut f = constraints.map_or_else(|| f.to_vec(), |c| c.reduce_vector(f));
    let incremental_applied = constraints.map_or_else(|| incremental_applied.to_vec(), |c| c.reduce_vector(incremental_applied));
    let cumulative_applied = constraints.map_or_else(|| cumulative_applied.to_vec(), |c| c.reduce_vector(cumulative_applied));
    let reduced = constraints.map_or_else(|| k.clone(), |c| c.reduce_matrix_sparse(k));
    let stiff = stiffness_columns(&reduced);
    let inactive = inactive_dofs(&stiff, dof, two_d, constraints, connected, &cumulative_applied);
    for &j in &inactive { f[j] = 0.0; }
    let (reduced, stability) = super::stability::analyze_free_stiffness_excluding(k, dof, two_d, constraints, coupling, releases, &inactive);
    if let Some(refusal) = stability.refusal() { return Err(refusal); }
    if let Some(node) = stability.load_on_free_rotation(&cumulative_applied) {
        return Err(format!("Nodal moment at node {node} is not supported: a free rotation would carry load"));
    }
    let projected_releases = constraints.map(|c| releases.project(&c.c_ff));
    let releases = projected_releases.as_ref().unwrap_or(releases);
    for direction in stability.free_rotations() {
        if !releases.permits(direction.node, &direction.dofs, &direction.direction) && direction.dofs.iter().any(|&i| stiff[i]) {
            if !annihilates_rotation(&reduced, direction) { continue; }
        }
        let along = direction.dofs.iter().zip(&direction.direction).map(|(&i, &v)| incremental_applied[i] * v).sum::<f64>();
        let norm = direction.direction.iter().map(|v| v * v).sum::<f64>();
        for (&i, &v) in direction.dofs.iter().zip(&direction.direction) {
            f[i] -= along / norm * v;
        }
    }
    let pinned = stability.pin_sparse(&reduced);
    let (mut rows, mut cols, mut vals) = full_triplets(&pinned);
    let active_scale = pinned.diagonal().into_iter().fold(0.0f64, f64::max);
    let inactive_scale = if active_scale > 0.0 { active_scale } else { 1.0 };
    for &d in &inactive { rows.push(d); cols.push(d); vals.push(inactive_scale); }
    let pinned = CscMatrix::from_triplets(pinned.n, &rows, &cols, &vals);
    let u = if sparse {
        let factor = numeric_cholesky(cached_symbolic(cache, &pinned), &pinned).ok_or_else(super::linear::not_positive_definite)?;
        *conditioning = crate::known_issues::sparse_factor_conditioning(&pinned, Some(&factor));
        let u = if two_d { sparse_cholesky_solve(&factor, &f) } else { super::linear::refined_sparse_solve(&pinned, &factor, &f)? };
        super::linear::conditional_sparse_refinement(&stability, &pinned, &f, u, |rhs| sparse_cholesky_solve(&factor, rhs))?
    } else {
        let dense = pinned.to_dense_symmetric();
        let mut factor = dense.clone();
        if !cholesky_decompose(&mut factor, pinned.n) { return Err(super::linear::not_positive_definite()); }
        *conditioning = crate::known_issues::dense_factor_conditioning(&dense, pinned.n, Some(&factor));
        let u = back_solve(&factor, &forward_solve(&factor, &f, pinned.n), pinned.n);
        super::linear::conditional_dense_refinement(&stability, &dense, &f, u, |rhs| back_solve(&factor, &forward_solve(&factor, rhs, pinned.n), pinned.n))?
    };
    if u.iter().any(|v| !v.is_finite()) { return Err(super::linear::not_positive_definite()); }
    stability.check_pins(&u, &f, &[])?;
    Ok(u)
}

fn annihilates_rotation(k: &CscMatrix, direction: &super::stability::FreeDirection) -> bool {
    use num_rational::BigRational;
    use num_traits::Zero;
    let mut vector = HashMap::new();
    for (&i, &v) in direction.dofs.iter().zip(&direction.direction) {
        let Some(value) = BigRational::from_float(v) else { return false; };
        if !value.is_zero() { vector.insert(i, value); }
    }
    let mut product: HashMap<usize, BigRational> = HashMap::new();
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let i = k.row_idx[p];
            if !vector.contains_key(&i) && !vector.contains_key(&j) { continue; }
            let Some(value) = BigRational::from_float(k.values[p]) else { return false; };
            if let Some(v) = vector.get(&j) { *product.entry(i).or_default() += &value * v; }
            if i != j {
                if let Some(v) = vector.get(&i) { *product.entry(j).or_default() += value * v; }
            }
        }
    }
    product.values().all(Zero::is_zero)
}

fn stiffness_columns(k: &CscMatrix) -> Vec<bool> {
    let mut stiff = vec![false; k.n];
    for j in 0..k.n { for p in k.col_ptr[j]..k.col_ptr[j + 1] {
        if k.values[p] != 0.0 { stiff[j] = true; stiff[k.row_idx[p]] = true; }
    } }
    stiff
}

fn inactive_dofs(
    stiff: &[bool], dof: &DofNumbering, two_d: bool, constraints: Option<&FreeConstraintSystem>,
    connected: &HashSet<usize>, applied: &[f64],
) -> Vec<usize> {
    let tags = super::stability::tags(dof, two_d);
    (0..stiff.len()).filter(|&j| {
        let active = if let Some(c) = constraints {
            (c.c_ff.col_ptr[j]..c.c_ff.col_ptr[j + 1]).any(|p| c.c_ff.csc_vals[p] != 0.0 && connected.contains(&tags[c.c_ff.row_idx[p]].node))
        } else { connected.contains(&tags[j].node) };
        !stiff[j] && !active && applied[j] == 0.0
    }).collect()
}

fn connected_nodes_2d(input: &SolverInput) -> HashSet<usize> {
    let mut connected = HashSet::new();
    for e in crate::ordered::values(&input.elements) {
        connected.extend([e.node_i, e.node_j]);
    }
    connected
}

fn connected_nodes_3d(input: &SolverInput3D) -> HashSet<usize> {
    let mut connected = HashSet::new();
    for e in crate::ordered::values(&input.elements) {
        connected.extend([e.node_i, e.node_j]);
    }
    for p in crate::ordered::values(&input.plates) {
        connected.extend(p.nodes);
    }
    for q in crate::ordered::values(&input.quads) {
        connected.extend(q.nodes);
    }
    connected
}

fn stage_loads_2d(input: &SolverInput, stage: &ConstructionStage) -> Vec<SolverLoad> {
    let mut loads = input.loads.clone();
    let nodes: HashMap<_, _> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let elements: HashMap<_, _> = crate::ordered::values(&input.elements).map(|e| (e.id, e)).collect();
    for ps in &stage.prestress_loads {
        let Some(elem) = elements.get(&ps.element_id) else { continue; };
        let ni = nodes[&elem.node_i];
        let nj = nodes[&elem.node_j];
        let dx = nj.x - ni.x;
        let dz = nj.z - ni.z;
        let l = (dx * dx + dz * dz).sqrt();
        let t = frame_transform_2d(dx / l, dz / l);
        let local = prestress_fef_2d(ps, l);
        let mut global = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                global[i] += t[j * 6 + i] * local[j];
            }
        }
        for (node_id, offset) in [(elem.node_i, 0), (elem.node_j, 3)] {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id, fx: global[offset], fz: global[offset + 1], my: global[offset + 2],
            }));
        }
    }
    loads
}

fn assemble_staged_2d(
    stage_input: &SolverInput,
    dof_num: &DofNumbering,
    stage: &ConstructionStage,
) -> AssemblyResult {
    let loaded_input = SolverInput { loads: stage_loads_2d(stage_input, stage), ..stage_input.clone() };
    super::assembly::without_artificial_stiffness(|| assemble_2d(&loaded_input, dof_num))
}

struct StagedTriplets2D {
    inclined_transforms_2d: Vec<super::assembly::InclinedTransformData2D>,
    k_ff: CscMatrix,
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    f: Vec<f64>,
}

impl StagedTriplets2D {
    fn cumulative_reactions(
        &self,
        k_full: &CscMatrix,
        input: &SolverInput,
        stage: &ConstructionStage,
        dof: &DofNumbering,
        u: &[f64],
    ) -> Vec<f64> {
        let loads = stage_loads_2d(input, stage);
        let f = super::assembly::assemble_load_vector_2d(input, &loads, dof, &self.inclined_transforms_2d);
        compute_stage_reactions_sparse(k_full, &f, dof.n_free, dof.n_total - dof.n_free, u)
    }
}

fn full_triplets(k: &CscMatrix) -> (Vec<usize>, Vec<usize>, Vec<f64>) {
    let mut rows = Vec::with_capacity(k.nnz());
    let mut cols = Vec::with_capacity(k.nnz());
    let mut vals = Vec::with_capacity(k.nnz());
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            rows.push(k.row_idx[p]);
            cols.push(j);
            vals.push(k.values[p]);
        }
    }
    (rows, cols, vals)
}

fn assemble_staged_2d_triplets(
    stage_input: &SolverInput,
    dof_num: &DofNumbering,
    stage: &ConstructionStage,
) -> StagedTriplets2D {
    let stiff = super::assembly::without_artificial_stiffness(|| super::sparse_assembly::assemble_stiffness_sparse_2d(stage_input, dof_num));
    let loads = stage_loads_2d(stage_input, stage);
    let f = super::assembly::assemble_load_vector_2d(stage_input, &loads, dof_num, &stiff.inclined_transforms_2d);
    let (rows, cols, vals) = full_triplets(&stiff.k_full);
    StagedTriplets2D { inclined_transforms_2d: stiff.inclined_transforms_2d, k_ff: stiff.k_ff, rows, cols, vals, f }
}

pub(super) struct PhysicalStageResidual(Vec<f64>);

impl PhysicalStageResidual {
    pub(super) fn as_slice(&self) -> &[f64] { &self.0 }
    fn assemble(recover: impl FnOnce() -> Vec<f64>) -> Self {
        Self(super::assembly::physical_stiffness(recover))
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum StageForceRecovery {
    CumulativeElastic,
    UnavailableHistory,
}

#[derive(PartialEq, Eq, Hash)]
enum StageStiffnessEntry {
    Member(usize),
    Plate(usize),
    Quad(usize),
    Support(String),
    Restraint(usize, usize),
    Coefficient(usize, usize, u64),
}

fn stage_support_contributors<const N: usize>(
    supports: impl Iterator<Item = (String, usize, [super::support::SupportDof; N])>,
) -> Vec<StageStiffnessEntry> {
    let mut entries = Vec::new();
    for (key, node, dofs) in supports {
        if !dofs.iter().any(|d| d.restrained || d.spring.is_some_and(|k| k > 0.0)) { continue; }
        entries.push(StageStiffnessEntry::Support(key));
        entries.extend(dofs.into_iter().enumerate().filter_map(|(i, d)| {
            d.restrained.then_some(StageStiffnessEntry::Restraint(node, i))
        }));
    }
    entries
}

fn stage_stiffness_contributors_2d(input: &SolverInput) -> Vec<StageStiffnessEntry> {
    let mut entries = stage_support_contributors(crate::ordered::entries(&input.supports).map(|(key, s)| {
        (key.clone(), s.node_id, super::support::support_dofs_2d(s))
    }));
    entries.extend(crate::ordered::values(&input.elements).map(|e| StageStiffnessEntry::Member(e.id)));
    entries
}

fn stage_stiffness_contributors_3d(input: &SolverInput3D) -> Vec<StageStiffnessEntry> {
    let mut entries = stage_support_contributors(crate::ordered::entries(&input.supports).map(|(key, s)| {
        (key.clone(), s.node_id, super::support::support_dofs_3d(s))
    }));
    entries.extend(crate::ordered::values(&input.elements).map(|e| StageStiffnessEntry::Member(e.id)));
    entries.extend(crate::ordered::values(&input.plates).map(|e| StageStiffnessEntry::Plate(e.id)));
    entries.extend(crate::ordered::values(&input.quads).map(|e| StageStiffnessEntry::Quad(e.id)));
    entries
}

#[derive(Default, PartialEq, Eq)]
struct StageStiffnessFingerprint(HashSet<StageStiffnessEntry>);

impl StageStiffnessFingerprint {
    fn from_assembly(
        contributors: Vec<StageStiffnessEntry>,
        n: usize,
        dense: Option<&AssemblyResult>,
        triplets: Option<(&[usize], &[usize], &[f64])>,
    ) -> Self {
        let mut entries: HashSet<_> = contributors.into_iter().collect();
        if let Some(a) = dense {
            assert!(triplets.is_none());
            for j in 0..n {
                for i in j..n {
                    let k = a.k[i * n + j];
                    if k != 0.0 {
                        entries.insert(StageStiffnessEntry::Coefficient(i, j, k.to_bits()));
                    }
                }
            }
        } else {
            let (rows, cols, vals) = triplets.expect("stage stiffness assembly");
            let k = CscMatrix::from_triplets(n, rows, cols, vals);
            for j in 0..n {
                for at in k.col_ptr[j]..k.col_ptr[j + 1] {
                    if k.values[at] != 0.0 {
                        entries.insert(StageStiffnessEntry::Coefficient(k.row_idx[at], j, k.values[at].to_bits()));
                    }
                }
            }
        }
        Self(entries)
    }
}

#[derive(Default)]
struct StageRecoveryHistory {
    stiffness: StageStiffnessFingerprint,
    loaded: bool,
    unavailable: bool,
}

impl StageRecoveryHistory {
    fn advance(
        &mut self,
        stiffness: StageStiffnessFingerprint,
        previous_u: &[f64],
        previous_forces: bool,
        stage_load: &[f64],
    ) -> StageForceRecovery {
        self.unavailable |= stiffness != self.stiffness && (self.loaded || previous_forces || previous_u.iter().any(|v| *v != 0.0));
        self.loaded |= stage_load.iter().any(|v| *v != 0.0);
        self.stiffness = stiffness;
        if self.unavailable { StageForceRecovery::UnavailableHistory } else { StageForceRecovery::CumulativeElastic }
    }
}

impl StageForceRecovery {
    fn diagnostics(self, phases: &[&str]) -> Vec<StructuredDiagnostic> {
        if self == Self::CumulativeElastic { return vec![]; }
        phases.iter().map(|phase| super::reaction_recovery::unavailable(
            phase,
            "Stage equilibrium results are unavailable: the active stiffness changed after earlier loading or displacement. Recovery does not track member or support-spring deformation since activation or redistribute forces released by removal. Reactions and member forces are withheld; retained cumulative displacements are incremental history only, not a certified equilibrium solution. Later stages remain unavailable.",
        )).collect()
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
    recovery: StageForceRecovery,
    inclined_transforms: &[super::assembly::InclinedTransformData2D],
) -> Result<AnalysisResults, String> {
    let mut global_u = u.to_vec();
    for it in inclined_transforms {
        super::assembly::reverse_inclined_transform_2d(&mut global_u, &it.dofs, &it.r);
    }
    let u = global_u.as_slice();
    let displacements = build_displacements_2d(dof_num, u);
    let mut element_forces = compute_internal_forces_2d(input, dof_num, u);
    element_forces.sort_by_key(|ef| ef.element_id);
    let recovered = super::reaction_recovery::RecoveredForces::from_stage(reactions_vec, dof_num, cs);
    let reactions_vec = recovered.checked_restrained_2d(input, dof_num)?;
    let nf = dof_num.n_free;
    let mut reactions = build_reactions_2d_inclined(input, dof_num, reactions_vec, &[], nf, u, inclined_transforms);
    reactions.sort_by_key(|r| r.node_id);

    let prescribed = super::linear::prescribed_displacements_2d(input, dof_num);
    let determined = state_is_directly_prescribed(u, dof_num.n_free, &prescribed);
    let structured_diagnostics = if !determined && input.elements.is_empty() && super::assembly::support_spring_entries_2d(input, dof_num).is_empty() {
        vec![super::reaction_recovery::unavailable("stageResults", "This stage has no active physical stiffness. Its displacements and forces are unavailable as an equilibrium solution; artificial stiffness may carry the state.")]
    } else { vec![] };

    let mut results = AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces: recovered.constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics,
        equilibrium: None,
        result_summary: None, solver_run_meta: None,
    };
    if recovery == StageForceRecovery::UnavailableHistory {
        results.reactions.clear();
        results.element_forces.clear();
        results.constraint_forces.clear();
        results.structured_diagnostics.extend(recovery.diagnostics(&["stageResults", "reactions", "elementForces", "constraintForces"]));
    }
    Ok(results)
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

    // Track cumulative state
    let mut cumulative_u = vec![0.0; n];
    let mut recovery_history = StageRecoveryHistory::default();
    let mut prev_u_r = vec![0.0; n - dof_num.n_free];
    let mut active_elements: HashSet<usize> = HashSet::new();
    let mut active_supports: HashSet<usize> = HashSet::new(); // node_ids
    // Shells track their own active sets: their ids are their own, and a plate
    // may share a number with an element.
    let mut active_plates: HashSet<usize> = HashSet::new();
    let mut active_quads: HashSet<usize> = HashSet::new();
    let mut stage_results: Vec<StageResult3D> = Vec::new();
    let mut cumulative_diagnostics = Vec::new();

    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    let use_sparse = n >= super::linear::SPARSE_THRESHOLD;

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

        let asm_dense = if use_sparse {
            None
        } else {
            let asm = super::assembly::without_artificial_stiffness(|| assemble_3d(&stage_input, &dof_num));
            Some(asm)
        };
        let asm_trips = if use_sparse {
            Some(assemble_staged_3d_triplets(&stage_input, &dof_num))
        } else {
            None
        };

        let recovery = recovery_history.advance(
            StageStiffnessFingerprint::from_assembly(
                stage_stiffness_contributors_3d(&stage_input),
                n, asm_dense.as_ref(),
                asm_trips.as_ref().map(|a| (a.rows.as_slice(), a.cols.as_slice(), a.vals.as_slice())),
            ),
            &cumulative_u,
            stage_results.last().is_some_and(|r| r.results.element_forces.iter().any(|f| [f.n_start, f.n_end, f.vy_start, f.vy_end, f.vz_start, f.vz_end, f.mx_start, f.mx_end, f.my_start, f.my_end, f.mz_start, f.mz_end].iter().any(|v| *v != 0.0))),
            asm_dense.as_ref().map_or_else(|| &asm_trips.as_ref().unwrap().f, |a| &a.f),
        );
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
        if let Some(ref t) = asm_trips {
            let k_full = CscMatrix::from_triplets(n, &t.rows, &t.cols, &t.vals);
            let mut ff = t.f[..nf].to_vec();
            let k_fr_ur = k_full.sparse_cross_block_matvec(&du_r, nf);
            for i in 0..nf {
                ff[i] -= k_fr_ur[i];
            }
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
            f_f = ff;
            k_ff_dense = Some(k_ff);
        }

        let k_physical = if let Some(ref t) = asm_trips {
            t.k_ff.clone()
        } else {
            CscMatrix::from_dense_symmetric_exact(&k_ff_dense.unwrap(), nf)
        };
        let cum_input = SolverInput3D { loads: cumulative_loads.clone(), ..stage_input.clone() };
        let applied = super::sparse_assembly::assemble_load_vector_sparse_3d(
            &cum_input, &cum_input.loads, &dof_num, &[],
        );
        let mut conditioning = None;
        let u_s_inc = solve_stage_free(
            &k_physical, &dof_num, cs.as_ref(), false, &connected_nodes_3d(&stage_input),
            &super::stability::coupling_3d(&stage_input, &dof_num),
            &super::stability::released_rotations_3d(&stage_input, &dof_num), &f_f,
            &asm_trips.as_ref().map_or_else(|| &asm_dense.as_ref().unwrap().f, |t| &t.f)[..nf],
            &applied[..nf], use_sparse,
            &mut sparse_sym_cache, &mut conditioning,
        )?;

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
        let reactions_vec = PhysicalStageResidual::assemble(|| if let Some(ref t) = asm_trips {
            let k_full = CscMatrix::from_triplets(n, &t.rows, &t.cols, &t.vals);
            let f_cum = super::sparse_assembly::assemble_load_vector_sparse_3d(&cum_input, &cum_input.loads, &dof_num, &[]);
            compute_stage_reactions_sparse(&k_full, &f_cum, nf, nr, &cumulative_u)
        } else {
            let asm = asm_dense.as_ref().unwrap();
            let f_cum = assemble_3d(&cum_input, &dof_num).f;
            mat_vec(&asm.k, &cumulative_u, n).iter().zip(&f_cum).map(|(ku, f)| ku - f).collect()
        });

        // Build results for this stage
        let results = build_results_from_u_3d(&cumulative_u, &dof_num, &cum_input, &reactions_vec, cs.as_ref(), recovery)?;
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

struct StagedTriplets3D {
    k_ff: CscMatrix,
    rows: Vec<usize>,
    cols: Vec<usize>,
    vals: Vec<f64>,
    f: Vec<f64>,
}

fn assemble_staged_3d_triplets(
    stage_input: &SolverInput3D,
    dof_num: &DofNumbering,
) -> StagedTriplets3D {
    let stiff = super::assembly::without_artificial_stiffness(|| super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(stage_input, dof_num, true));
    let k_full = stiff.k_full.unwrap(); // build_k_full = true
    let f_global = super::sparse_assembly::assemble_load_vector_sparse_3d(
        stage_input, &stage_input.loads, dof_num, &stiff.inclined_transforms,
    );

    let (rows, cols, vals) = full_triplets(&k_full);

    StagedTriplets3D { k_ff: stiff.k_ff, rows, cols, vals, f: f_global }
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
    recovery: StageForceRecovery,
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

    let mut results = AnalysisResults3D {
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
    };
    if recovery == StageForceRecovery::UnavailableHistory {
        results.reactions.clear();
        results.element_forces.clear();
        results.constraint_forces.clear();
        results.plate_stresses.clear();
        results.quad_stresses.clear();
        results.quad_nodal_stresses.clear();
        results.structured_diagnostics.extend(recovery.diagnostics(&["stageResults", "reactions", "elementForces", "constraintForces", "plateStresses", "quadStresses", "quadNodalStresses"]));
    }
    Ok(results)
}

#[cfg(test)]
#[path = "staged_prestress_tests.rs"]
mod prestress_tests;
