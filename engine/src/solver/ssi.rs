/// Soil-Structure Interaction (SSI) solver with nonlinear p-y/t-z/q-z curves.
///
/// Extends Winkler foundation analysis with iterative secant stiffness updates.
/// Springs along pile elements are updated based on displacement-dependent
/// soil reaction curves.
///
/// Iteration scheme:
/// 1. Assemble structure stiffness K
/// 2. Add secant soil spring stiffnesses along pile elements
/// 3. Solve K*u = F
/// 4. Evaluate soil curves at computed displacements
/// 5. Update secant stiffnesses
/// 6. Repeat until convergence

use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{self, InclinedFrame};
use super::linear;
use super::soil_curves::{SoilCurve, evaluate_soil_curve};
use super::constraints::FreeConstraintSystem;
use super::sparse_tangent::{SparseSymbolicCache, tangent_free_sparse_triplets, solve_tangent_sparse};

/// The soil springs at their current secants as stiffness triplets in the
/// frames K was assembled in (each unordered pair once). A spring acts along a
/// global axis, so at an inclined support it is R·k·Rᵀ over the support's
/// translations, coupling them, not k on the rotated slot of the same index.
fn spring_triplets<T: InclinedFrame>(
    springs: &[SoilSpring], spring_k: &[f64], dof_num: &DofNumbering, its: &[T],
) -> (Vec<usize>, Vec<usize>, Vec<f64>) {
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for (si, spring) in springs.iter().enumerate() {
        let dir = spring.direction.min(dof_num.dofs_per_node - 1);
        if let Some(&d) = dof_num.map.get(&(spring.node_id, dir)) {
            rows.push(d);
            cols.push(d);
            vals.push(spring_k[si]);
        }
    }
    for it in its {
        it.rotate_triplets(&mut rows, &mut cols, &mut vals);
    }
    (rows, cols, vals)
}

/// Soil spring attached to a node along a pile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilSpring {
    /// Node ID where the spring is attached
    pub node_id: usize,
    /// Direction: 0=X, 1=Z (2D) or 0=X, 1=Y, 2=Z (3D)
    pub direction: usize,
    /// Soil curve type
    pub curve: SoilCurve,
    /// Tributary length for this spring (m): the curve's reaction per metre
    /// of pile (p-y, t-z, custom) times this is the spring force. Not used by
    /// a q-z tip spring, whose curve already returns a force.
    pub tributary_length: f64,
}

impl SoilSpring {
    /// What the curve's reaction is multiplied by: the tributary length for
    /// curves per unit length of pile (p-y, t-z, custom), 1 for the q-z tip
    /// spring, whose reaction is already a force.
    pub fn length_factor(&self) -> f64 {
        if self.curve.is_point_spring() { 1.0 } else { self.tributary_length }
    }
}

/// Refuse a spring whose curve is invalid or misses a parameter its reference
/// needs, or whose tributary length is not a non-negative number.
fn validate_springs(springs: &[SoilSpring]) -> Result<(), String> {
    for (i, s) in springs.iter().enumerate() {
        s.curve.validate().map_err(|e| format!("Soil spring {i} (node {}): {e}", s.node_id))?;
        if !s.curve.is_point_spring() && !(s.tributary_length.is_finite() && s.tributary_length >= 0.0) {
            return Err(format!("Soil spring {i} (node {}): tributary length {} must be non-negative and finite", s.node_id, s.tributary_length));
        }
    }
    Ok(())
}

/// Refuse a spring on a node the model does not have, or along a direction that
/// is not a translation (2D: 0 = X, 1 = Z; 3D: 0, 1, 2): its displacement would
/// be read as zero, or a soil force put on a rotation.
fn check_spring_dofs(springs: &[SoilSpring], dof_num: &DofNumbering, n_trans: usize) -> Result<(), String> {
    for (i, s) in springs.iter().enumerate() {
        if s.direction >= n_trans {
            return Err(format!("Soil spring {i} (node {}): direction {} is not a translation (0 to {})", s.node_id, s.direction, n_trans - 1));
        }
        if !dof_num.map.contains_key(&(s.node_id, s.direction)) {
            return Err(format!("Soil spring {i}: node {} is not in the model", s.node_id));
        }
    }
    Ok(())
}

/// SSI analysis input (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput {
    pub solver: SolverInput,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

/// SSI analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput3D {
    pub solver: SolverInput3D,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

fn default_max_iter() -> usize { 50 }
fn default_tolerance() -> f64 { 1e-4 }

/// SSI analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// SSI analysis result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// Per-spring result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringResult {
    pub node_id: usize,
    pub direction: usize,
    pub displacement: f64,
    pub reaction: f64,
    pub secant_stiffness: f64,
}

/// Solve a 2D SSI problem with nonlinear soil springs.
pub fn solve_ssi_2d(input: &SSIInput) -> Result<SSIResult, String> {
    let mut r = solve_ssi_2d_inner(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Ssi));
    Ok(r)
}

fn solve_ssi_2d_inner(input: &SSIInput) -> Result<SSIResult, String> {
    super::linear::validate_input_2d(&input.solver)?;
    validate_springs(&input.soil_springs)?;
    // The secant solve does not impose prescribed displacements. Inclined
    // supports are solved in their frames (fix/inclined-supports).
    super::feature_gates::refuse_2d(&input.solver, "Soil-structure interaction analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    check_spring_dofs(&input.soil_springs, &dof_num, 2)?;
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Constraint system (built once before iteration)
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (without soil springs). Below the sparse threshold: the
    // legacy dense n×n path, unchanged. At or above it: CSC assembly (k_ff
    // for the per-iteration solves) — no dense n×n matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_2d(&input.solver, &dof_num))
    };
    let sparse_stiff = if use_sparse {
        Some(super::sparse_assembly::assemble_stiffness_sparse_2d(&input.solver, &dof_num))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_stiff {
        assembly::assemble_load_vector_2d(
            &input.solver, &input.solver.loads, &dof_num, &s.inclined_transforms_2d,
        )
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };

    // K and F are in the inclined-support frames (the same by either
    // assembler); the springs are rotated into them and the solution back.
    let its: &[assembly::InclinedTransformData2D] = if let Some(ref s) = sparse_stiff {
        &s.inclined_transforms_2d
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms_2d
    };

    // Base free×free triplets, cached once (sparse path only): each iteration
    // concatenates them with the soil-spring diagonal triplets and rebuilds
    // the corrected CSC, so spring stiffnesses never accumulate into the base.
    let mut base_tr: Vec<usize> = Vec::new();
    let mut base_tc: Vec<usize> = Vec::new();
    let mut base_tv: Vec<f64> = Vec::new();
    if let Some(ref s) = sparse_stiff {
        let k = &s.k_ff;
        base_tr.reserve(k.nnz());
        base_tc.reserve(k.nnz());
        base_tv.reserve(k.nnz());
        for j in 0..nf {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                base_tr.push(k.row_idx[p]);
                base_tc.push(j);
                base_tv.push(k.values[p]);
            }
        }
    }

    // Initialize secant stiffnesses (use initial tangent from curves)
    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 0.0)?;
            Ok(k0 * s.length_factor())
        })
        .collect::<Result<_, String>>()?;

    let mut u_full = vec![0.0; n];
    let mut u_frame = vec![0.0; nf];
    let mut converged = false;
    let mut total_iters = 0;

    // Sparse symbolic Cholesky reused across iterations (spring stiffnesses
    // change values, not the pattern; the fingerprinted cache rebuilds the
    // symbolic if an entry ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        let u_indep = if use_sparse {
            // Sparse path: rebuild the corrected CSC from the cached base
            // triplets plus the soil-spring diagonal triplets — no dense
            // matrix. Springs on restrained DOFs are dropped (they never
            // entered k_ff in the dense path either).
            let mut rows = base_tr.clone();
            let mut cols = base_tc.clone();
            let mut vals = base_tv.clone();
            let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
            for t in 0..sr.len() {
                if sr[t] < nf && sc[t] < nf {
                    rows.push(sr[t]);
                    cols.push(sc[t]);
                    vals.push(sv[t]);
                }
            }
            let f_f: Vec<f64> = f_global[..nf].to_vec();
            let f_s = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&rows, &cols, &vals, nf, &cs);
            solve_tangent_sparse(&k_csc, &f_s, &mut sparse_sym_cache)?
        } else {
            // Assemble: base K + soil springs
            let mut k_global = dense_asm.as_ref().unwrap().k.clone();

            let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
            for t in 0..sr.len() {
                k_global[sr[t] * n + sc[t]] += sv[t];
                if sr[t] != sc[t] {
                    k_global[sc[t] * n + sr[t]] += sv[t];
                }
            }

            // Solve
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
            let f_f: Vec<f64> = f_global[..nf].to_vec();

            let (k_s, f_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };

            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s;
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or("Singular stiffness in SSI iteration")?
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        // In global axes from here on (soil curves, results); `u_f` stays in
        // K's frames for the constraint forces.
        u_full = assembly::to_global(&u_f, n, its);
        u_frame = u_f;

        // Update soil spring stiffnesses
        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp)?;
            let new_k = k_secant * spring.length_factor();

            let old_k = spring_k[si];
            let change = (new_k - old_k).abs();
            let ref_val = old_k.abs().max(new_k.abs()).max(1.0);
            max_change = max_change.max(change / ref_val);

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build final results
    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp)?;
            Ok(SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.length_factor(),
                secant_stiffness: spring_k[si],
            })
        })
        .collect::<Result<_, String>>()?;

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = if let Some(ref s) = sparse_stiff {
            fcs.compute_constraint_forces_sparse(&s.k_ff, &u_frame, &f_global[..nf])
        } else {
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &free_idx, &free_idx);
            fcs.compute_constraint_forces(&k_ff, &u_frame, &f_global[..nf])
        };
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(SSIResult {
        results: AnalysisResults {
            displacements,
            reactions: vec![],
            element_forces,
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: vec![],
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        spring_results,
    })
}

/// Solve a 3D SSI problem with nonlinear soil springs.
pub fn solve_ssi_3d(input: &SSIInput3D) -> Result<SSIResult3D, String> {
    let mut r = solve_ssi_3d_inner(input)?;
    crate::known_issues::membrane_bending_3d(&input.solver, &input.solver.loads, &r.results)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Ssi));
    Ok(r)
}

fn solve_ssi_3d_inner(input: &SSIInput3D) -> Result<SSIResult3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    validate_springs(&input.soil_springs)?;
    super::feature_gates::refuse_3d(&input.solver, "Soil-structure interaction analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;

    // Expand curved beams before DOF numbering and assembly.
    let expanded_solver = super::linear::expand_curved_beams_3d(&input.solver);
    let dof_num = DofNumbering::build_3d(&expanded_solver);
    check_spring_dofs(&input.soil_springs, &dof_num, 3)?;
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Constraint system (built once before iteration). Use the expanded model:
    // expansion adds new nodes/elements but preserves the original IDs that
    // constraints reference.
    let cs = FreeConstraintSystem::build_3d(&expanded_solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Dispatch dense vs sparse once per solve call (not per iteration).
    let use_sparse = ns >= linear::SPARSE_THRESHOLD;

    // Base assembly (without soil springs). Below the sparse threshold: the
    // legacy dense n×n path, unchanged. At or above it: CSC assembly (k_ff
    // for the per-iteration solves; no k_full needed — SSI reports no
    // reactions) — no dense n×n matrix is ever built.
    let dense_asm = if use_sparse {
        None
    } else {
        Some(assembly::assemble_3d(&expanded_solver, &dof_num))
    };
    let sparse_asm = if use_sparse {
        Some(assembly::assemble_sparse_3d(&expanded_solver, &dof_num, false))
    } else {
        None
    };
    let f_global = if let Some(ref s) = sparse_asm {
        s.f.clone()
    } else {
        dense_asm.as_ref().unwrap().f.clone()
    };

    // In the inclined-support frames, as in 2D.
    let its: &[assembly::InclinedTransformData] = if let Some(ref s) = sparse_asm {
        &s.inclined_transforms
    } else {
        &dense_asm.as_ref().unwrap().inclined_transforms
    };

    // Base free×free triplets, cached once (sparse path only): each iteration
    // concatenates them with the soil-spring diagonal triplets and rebuilds
    // the corrected CSC, so spring stiffnesses never accumulate into the base.
    let mut base_tr: Vec<usize> = Vec::new();
    let mut base_tc: Vec<usize> = Vec::new();
    let mut base_tv: Vec<f64> = Vec::new();
    if let Some(ref s) = sparse_asm {
        let k = &s.k_ff;
        base_tr.reserve(k.nnz());
        base_tc.reserve(k.nnz());
        base_tv.reserve(k.nnz());
        for j in 0..nf {
            for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                base_tr.push(k.row_idx[p]);
                base_tc.push(j);
                base_tv.push(k.values[p]);
            }
        }
    }

    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 0.0)?;
            Ok(k0 * s.length_factor())
        })
        .collect::<Result<_, String>>()?;

    let mut u_full = vec![0.0; n];
    let mut u_frame = vec![0.0; nf];
    let mut converged = false;
    let mut total_iters = 0;

    // Sparse symbolic Cholesky reused across iterations (spring stiffnesses
    // change values, not the pattern; the fingerprinted cache rebuilds the
    // symbolic if an entry ever crosses exactly zero).
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        let u_indep = if use_sparse {
            // Sparse path: rebuild the corrected CSC from the cached base
            // triplets plus the soil-spring diagonal triplets — no dense
            // matrix. Springs on restrained DOFs are dropped (they never
            // entered k_ff in the dense path either).
            let mut rows = base_tr.clone();
            let mut cols = base_tc.clone();
            let mut vals = base_tv.clone();
            let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
            for t in 0..sr.len() {
                if sr[t] < nf && sc[t] < nf {
                    rows.push(sr[t]);
                    cols.push(sc[t]);
                    vals.push(sv[t]);
                }
            }
            let f_f: Vec<f64> = f_global[..nf].to_vec();
            let f_s = if let Some(ref cs) = cs { cs.reduce_vector(&f_f) } else { f_f };
            let k_csc = tangent_free_sparse_triplets(&rows, &cols, &vals, nf, &cs);
            solve_tangent_sparse(&k_csc, &f_s, &mut sparse_sym_cache)?
        } else {
            let mut k_global = dense_asm.as_ref().unwrap().k.clone();

            let (sr, sc, sv) = spring_triplets(&input.soil_springs, &spring_k, &dof_num, its);
            for t in 0..sr.len() {
                k_global[sr[t] * n + sc[t]] += sv[t];
                if sr[t] != sc[t] {
                    k_global[sc[t] * n + sr[t]] += sv[t];
                }
            }

            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
            let f_f: Vec<f64> = f_global[..nf].to_vec();

            let (k_s, f_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
            } else {
                (k_ff, f_f)
            };

            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s;
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or("Singular stiffness in 3D SSI iteration")?
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        // In global axes from here on (soil curves, results); `u_f` stays in
        // K's frames for the constraint forces.
        u_full = assembly::to_global(&u_f, n, its);
        u_frame = u_f;

        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp)?;
            let new_k = k_secant * spring.length_factor();

            let old_k = spring_k[si];
            let change = (new_k - old_k).abs();
            let ref_val = old_k.abs().max(new_k.abs()).max(1.0);
            max_change = max_change.max(change / ref_val);

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&expanded_solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp)?;
            Ok(SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.length_factor(),
                secant_stiffness: spring_k[si],
            })
        })
        .collect::<Result<_, String>>()?;

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let raw = if let Some(ref s) = sparse_asm {
            fcs.compute_constraint_forces_sparse(&s.k_ff, &u_frame, &f_global[..nf])
        } else {
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&dense_asm.as_ref().unwrap().k, n, &free_idx, &free_idx);
            fcs.compute_constraint_forces(&k_ff, &u_frame, &f_global[..nf])
        };
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(SSIResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions: vec![],
            element_forces,
            plate_stresses: linear::compute_plate_stresses(&expanded_solver, &dof_num, &u_full, None),
            quad_stresses: linear::compute_quad_stresses(&expanded_solver, &dof_num, &u_full, None),
            quad_nodal_stresses: vec![],
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: vec![],
            equilibrium: None,
            timings: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        spring_results,
    })
}
