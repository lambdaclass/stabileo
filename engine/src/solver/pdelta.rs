use crate::types::*;
use crate::linalg::*;
use std::rc::Rc;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::{build_displacements_2d, compute_internal_forces_2d,
    build_displacements_3d, compute_internal_forces_3d,
    compute_plate_stresses, compute_quad_stresses,
    build_reactions_2d_inclined, build_reactions_3d_inclined};
use super::constraints::FreeConstraintSystem;

/// The linear pass's structured diagnostics that describe the model, not the
/// linear solution: pre-solve gates, constraints, conditioning of K.
///
/// Everything from the "solve" and "factorization" phases is about the
/// solution the linear pass produced — `ResidualOk`, the factorization path
/// taken, `ExcessiveDisplacement` — and none of it was checked against the
/// second-order state. Carried over, a P-Delta result with sway amplified by
/// 1.8 announced "equilibrium residual OK" and a dense LU it never ran.
fn model_structured_diagnostics(linear: &[StructuredDiagnostic]) -> Vec<StructuredDiagnostic> {
    linear
        .iter()
        .filter(|d| matches!(d.phase.as_deref(), Some("pre_solve" | "constraints" | "conditioning")))
        .cloned()
        .collect()
}

/// The legacy counterpart: only the conditioning entries describe the model;
/// "solver_path" and "fallback" name the linear pass's factorization.
fn model_solver_diagnostics(linear: &[SolverDiagnostic]) -> Vec<SolverDiagnostic> {
    linear.iter().filter(|d| d.category == "conditioning").cloned().collect()
}

/// Free DOFs threshold for sparse path in P-Delta iterations.
const SPARSE_THRESHOLD: usize = 64;

/// The symbolic factorization of the last matrix, with the pattern it was
/// computed for.
///
/// The CSC matrix is built from the dense one by dropping zeros, so its
/// pattern follows the values: a member carrying no axial force in the first
/// iteration adds no geometric terms, and the same member compressed in the
/// next adds entries the first pattern did not have. Reusing that first
/// symbolic factorization regardless tripped an assertion inside the numeric
/// one — an "unreachable" panic for any 3D model whose axial forces moved
/// between iterations. It is reused now only while the pattern is the same.
struct SymbolicCache {
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    sym: Rc<SymbolicCholesky>,
}

fn symbolic_for(cache: &mut Option<SymbolicCache>, k: &CscMatrix) -> Rc<SymbolicCholesky> {
    if let Some(c) = cache.as_ref() {
        if c.col_ptr == k.col_ptr && c.row_idx == k.row_idx {
            return c.sym.clone();
        }
    }
    let sym = Rc::new(symbolic_cholesky(k));
    *cache = Some(SymbolicCache { col_ptr: k.col_ptr.clone(), row_idx: k.row_idx.clone(), sym: sym.clone() });
    sym
}

/// Right-hand side of the free equations with the restrained DOFs at their
/// prescribed values: F_f − K_fr · u_r, with K the current (K + K_G).
///
/// The iterations used F_f alone and left every restrained DOF at zero, so a
/// support settlement did not exist for the second-order solution: a model
/// loaded only by one came back all zeros and "not converged", and one with
/// loads as well came back without it. The linear pass had it; its
/// displacements carry the prescribed values, which is where u_r comes from.
fn rhs_with_prescribed(k: &[f64], n: usize, nf: usize, f_f: &[f64], u: &[f64]) -> Vec<f64> {
    let mut rhs = f_f.to_vec();
    for j in nf..n {
        let uj = u[j];
        if uj == 0.0 { continue; }
        for (i, r) in rhs.iter_mut().enumerate() {
            *r -= k[i * n + j] * uj;
        }
    }
    rhs
}

/// The iteration works in the assembly's frame, in which every inclined
/// support has its translations rotated so that the restrained direction is a
/// DOF of its own. Element quantities — the axial force K_G is built from,
/// internal forces, reported displacements — are in global axes. These two
/// convert between the frames; without inclined supports they are identities.
///
/// The iteration used to mix them: global displacements went into the rotated
/// slots, and a global K_G was added to the rotated K. A portal on an inclined
/// roller did not converge at all, and once restrained DOFs kept their values
/// the restrained slot would have held a global displacement as the normal one.
fn to_global_2d(u: &[f64], its: &[InclinedTransformData2D]) -> Vec<f64> {
    let mut g = u.to_vec();
    for it in its { reverse_inclined_transform_2d(&mut g, &it.dofs, &it.r); }
    g
}

fn to_global_3d(u: &[f64], its: &[InclinedTransformData]) -> Vec<f64> {
    let mut g = u.to_vec();
    for it in its { reverse_inclined_transform(&mut g, &it.dofs, &it.r); }
    g
}

/// K + K_G in the assembly's frame, with K_G formed from `u` (solver frame).
fn k_with_geometric_2d(input: &SolverInput, dof_num: &DofNumbering, asm: &AssemblyResult, u: &[f64]) -> Vec<f64> {
    let its = &asm.inclined_transforms_2d;
    let mut k = asm.k.clone();
    if its.is_empty() {
        super::geometric_stiffness::add_geometric_stiffness_2d(input, dof_num, u, &mut k);
        return k;
    }
    let n = dof_num.n_total;
    let mut kg = vec![0.0; n * n];
    super::geometric_stiffness::add_geometric_stiffness_2d(input, dof_num, &to_global_2d(u, its), &mut kg);
    let mut unused = vec![0.0; n];
    for it in its { apply_inclined_transform_2d(&mut kg, &mut unused, n, &it.dofs, &it.r); }
    for (a, b) in k.iter_mut().zip(&kg) { *a += b; }
    k
}

fn k_with_geometric_3d(input: &SolverInput3D, dof_num: &DofNumbering, asm: &AssemblyResult, u: &[f64]) -> Vec<f64> {
    let its = &asm.inclined_transforms;
    let mut k = asm.k.clone();
    if its.is_empty() {
        super::geometric_stiffness::add_geometric_stiffness_3d(input, dof_num, u, &mut k);
        return k;
    }
    let n = dof_num.n_total;
    let mut kg = vec![0.0; n * n];
    super::geometric_stiffness::add_geometric_stiffness_3d(input, dof_num, &to_global_3d(u, its), &mut kg);
    let mut unused = vec![0.0; n];
    for it in its { apply_inclined_transform(&mut kg, &mut unused, n, &it.dofs, &it.r); }
    for (a, b) in k.iter_mut().zip(&kg) { *a += b; }
    k
}

/// Restrained rows of (K + K_G)·u − F: the reactions of the system that was
/// solved, in the assembly's frame.
///
/// They were K·u − F. K_G's restrained rows are not zero — a column base
/// carries the P·Δ/h shear — so with K alone ΣR missed it and did not balance
/// the applied loads once the frame swayed.
fn restrained_residual(k: &[f64], f: &[f64], u: &[f64], n: usize, nf: usize) -> Vec<f64> {
    (nf..n).map(|d| k[d * n..(d + 1) * n].iter().zip(u).map(|(a, b)| a * b).sum::<f64>() - f[d]).collect()
}

/// B₂: the second-order amplification of the displacements that matter.
///
/// This was the largest ratio u_PΔ / u_lin over every free DOF with a linear
/// value above 1e-12, so one DOF that barely moves in the linear solution —
/// a rotation, or a translation of 1e-11 m — set it to anything: 247 for a
/// building whose first buckling factor is 2 (for which B₂ ≈ 2).
///
/// It is taken now over the translations the second-order analysis actually
/// changes: those whose increment u_PΔ − u_lin is at least 5 % of the largest
/// increment, and among them those whose linear value is at least 5 % of the
/// largest such value. Selecting by the increment, not by the linear value,
/// matters: in a column near its critical load the axial shortening is two
/// orders larger than the lateral deflection, but it is not amplified, and
/// the lateral deflection — amplified 1/(1 − P/Pcr) — is what B₂ describes.
fn b2_factor(dof_num: &DofNumbering, n_trans: usize, u_lin: &[f64], u_pd: &[f64]) -> f64 {
    let nf = dof_num.n_free;
    let trans: Vec<usize> = dof_num
        .map
        .iter()
        .filter(|((_, local), &idx)| *local < n_trans && idx < nf)
        .map(|(_, &idx)| idx)
        .collect();
    let inc = |i: usize| (u_pd[i] - u_lin[i]).abs();
    let d_max = trans.iter().fold(0.0f64, |m, &i| m.max(inc(i)));
    if d_max <= 1e-15 {
        return 1.0;
    }
    let changed: Vec<usize> = trans.iter().copied().filter(|&i| inc(i) >= 0.05 * d_max).collect();
    let l_max = changed.iter().fold(0.0f64, |m, &i| m.max(u_lin[i].abs()));
    if l_max <= 1e-15 {
        return 1.0;
    }
    changed
        .iter()
        .filter(|&&i| u_lin[i].abs() >= 0.05 * l_max)
        .fold(0.0f64, |m, &i| m.max((u_pd[i] / u_lin[i]).abs()))
}

/// B₂ as reported: infinite once K + K_G is no longer positive definite.
///
/// Past a critical load Cholesky fails, LU still solves the indefinite system,
/// and the iteration converges to a reversed sway — u ≈ u_lin/(1 − P/Pcr),
/// −2·u_lin at 1.5·Pcr. B₂ takes magnitudes, so that read as an amplification
/// of 2 and the result as stable. The structure is past buckling; this says
/// so the way the solve-failure path already does.
fn stability_b2(indefinite: bool, b2: f64) -> f64 {
    if indefinite { f64::INFINITY } else { b2 }
}

/// P-Delta analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PDeltaResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub is_stable: bool,
    pub b2_factor: f64,
    pub linear_results: AnalysisResults,
}

/// Solve 2D P-Delta (second-order) analysis.
/// Iteratively solves (K + K_G) * u = F where K_G depends on axial forces.
pub fn solve_pdelta_2d(
    input: &SolverInput,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult, String> {
    let dof_num = DofNumbering::build_2d(input);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    // First: linear analysis
    let linear_results = super::linear::solve_2d(input)?;

    let asm = assemble_2d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let f_f = extract_subvec(&asm.f, &free_idx);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let mut u_prev = vec![0.0; n];
    // Initialize with linear displacements, reported in global axes and
    // rotated into the assembly's frame: at an inclined support the restrained
    // slot then holds the normal displacement the linear pass imposed.
    for d in &linear_results.displacements {
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 0)) { u_prev[idx] = d.ux; }
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 1)) { u_prev[idx] = d.uz; }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 2)) { u_prev[idx] = d.ry; }
        }
    }
    for it in &asm.inclined_transforms_2d { rotate_inclined_f_2d(&mut u_prev, &it.dofs, &it.r); }

    let mut converged = false;
    let mut iterations = 0;
    let mut u_current = u_prev.clone();
    let use_sparse = ns >= SPARSE_THRESHOLD;
    let mut symbolic: Option<SymbolicCache> = None;
    // Whether the last solve needed LU because Cholesky failed on K + K_G.
    let mut indefinite = false;

    for iter in 0..max_iter {
        iterations = iter + 1;
        indefinite = false;

        // Compute geometric stiffness from current axial forces
        let k_total = k_with_geometric_2d(input, &dof_num, &asm, &u_current);

        // Extract Kff (with K_G) and optionally apply constraint transform
        let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);
        let k_solve = if let Some(ref cs) = cs {
            cs.reduce_matrix(&k_ff)
        } else {
            k_ff
        };
        let f_eff = rhs_with_prescribed(&k_total, n, nf, &f_f, &u_current);
        let f_solve = if let Some(ref cs) = cs { cs.reduce_vector(&f_eff) } else { f_eff };

        let u_indep = if use_sparse {
            let k_csc = CscMatrix::from_dense_symmetric(&k_solve, ns);
            let sym = symbolic_for(&mut symbolic, &k_csc);
            match numeric_cholesky(&sym, &k_csc) {
                Some(factor) => sparse_cholesky_solve(&factor, &f_solve),
                None => {
                    indefinite = true;
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        } else {
            let mut k_work = k_solve.clone();
            match cholesky_solve(&mut k_work, &f_solve, ns) {
                Some(u) => u,
                None => {
                    indefinite = true;
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        // The restrained DOFs keep their prescribed values.
        let mut u_new = u_current.clone();
        u_new[..nf].copy_from_slice(&u_f[..nf]);

        // Check convergence
        let mut diff_norm = 0.0;
        let mut u_norm = 0.0;
        for i in 0..nf {
            diff_norm += (u_new[i] - u_current[i]).powi(2);
            u_norm += u_new[i].powi(2);
        }
        diff_norm = diff_norm.sqrt();
        u_norm = u_norm.sqrt();

        u_current = u_new;

        if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
            converged = true;
            break;
        }
    }

    let its = &asm.inclined_transforms_2d;
    let u_global = to_global_2d(&u_current, its);
    let max_ratio = stability_b2(indefinite, b2_factor(&dof_num, 2, &to_global_2d(&u_prev, its), &u_global));

    // Build final results from converged displacements
    let displacements = build_displacements_2d(&dof_num, &u_global);
    let element_forces = compute_internal_forces_2d(input, &dof_num, &u_global);

    // Reactions and constraint forces of the system that was solved.
    let k_final = k_with_geometric_2d(input, &dof_num, &asm, &u_current);
    let reactions_vec = restrained_residual(&k_final, &asm.f, &u_current, n, nf);
    let mut reactions = build_reactions_2d_inclined(input, &dof_num, &reactions_vec, &asm.f[nf..], nf, &u_global, its);
    reactions.sort_by_key(|r| r.node_id);

    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&k_final, n, &free_idx, &free_idx);
        let f_eff = rhs_with_prescribed(&k_final, n, nf, &f_f, &u_current);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_current[..nf], &f_eff);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(PDeltaResult {
        results: AnalysisResults {
            displacements,
            reactions,
            element_forces,
            constraint_forces,
            // The model's diagnostics belong to the model, not to the path that
            // analysed it: the linear pass above already ran the pre-solve gates
            // and the conditioning checks on this same structure. Left empty,
            // a P-Delta run was silent about problems the same model reports
            // when solved linearly — the store hands `results` straight to the
            // diagnostics panel, so the warnings simply vanished. Only the
            // model's, though: see `model_structured_diagnostics`.
            diagnostics: linear_results.diagnostics.clone(),
            solver_diagnostics: model_solver_diagnostics(&linear_results.solver_diagnostics),
            structured_diagnostics: model_structured_diagnostics(&linear_results.structured_diagnostics),
            // Still not computed for the second-order state: the residual would
            // have to be formed against (K + K_G) and the P-Delta reactions.
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations,
        converged,
        is_stable: converged && max_ratio < 100.0,
        b2_factor: max_ratio,
        linear_results,
    })
}

/// P-Delta analysis result for 3D structures.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PDeltaResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub is_stable: bool,
    pub b2_factor: f64,
    pub linear_results: AnalysisResults3D,
}

/// Solve 3D P-Delta (second-order) analysis.
pub fn solve_pdelta_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult3D, String> {
    // Expand curved beams BEFORE DOF numbering and assembly: solve_3d already
    // expands internally, but the P-Delta iterations assemble K and add
    // geometric stiffness on the same input, so both must see the expanded model.
    let input = &super::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let linear_results = super::linear::solve_3d(input)?;

    let asm = assemble_3d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let f_f = extract_subvec(&asm.f, &free_idx);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let mut u_prev = vec![0.0; n];
    for d in &linear_results.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (i, &val) in vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) { u_prev[idx] = val; }
        }
    }
    for it in &asm.inclined_transforms { rotate_inclined_f_3d(&mut u_prev, &it.dofs, &it.r); }

    let mut converged = false;
    let mut iterations = 0;
    let mut u_current = u_prev.clone();
    let use_sparse = ns >= SPARSE_THRESHOLD;
    let mut symbolic: Option<SymbolicCache> = None;
    // Whether the last solve needed LU because Cholesky failed on K + K_G.
    let mut indefinite = false;

    for iter in 0..max_iter {
        iterations = iter + 1;
        indefinite = false;

        let k_total = k_with_geometric_3d(input, &dof_num, &asm, &u_current);

        let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);
        let k_solve = if let Some(ref cs) = cs {
            cs.reduce_matrix(&k_ff)
        } else {
            k_ff
        };
        let f_eff = rhs_with_prescribed(&k_total, n, nf, &f_f, &u_current);
        let f_solve = if let Some(ref cs) = cs { cs.reduce_vector(&f_eff) } else { f_eff };

        let u_indep = if use_sparse {
            let k_csc = CscMatrix::from_dense_symmetric(&k_solve, ns);
            let sym = symbolic_for(&mut symbolic, &k_csc);
            match numeric_cholesky(&sym, &k_csc) {
                Some(factor) => sparse_cholesky_solve(&factor, &f_solve),
                None => {
                    indefinite = true;
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult3D {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        } else {
            let mut k_work = k_solve.clone();
            match cholesky_solve(&mut k_work, &f_solve, ns) {
                Some(u) => u,
                None => {
                    indefinite = true;
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult3D {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        let mut u_new = u_current.clone();
        u_new[..nf].copy_from_slice(&u_f[..nf]);

        let mut diff_norm = 0.0;
        let mut u_norm = 0.0;
        for i in 0..nf {
            diff_norm += (u_new[i] - u_current[i]).powi(2);
            u_norm += u_new[i].powi(2);
        }
        diff_norm = diff_norm.sqrt();
        u_norm = u_norm.sqrt();

        u_current = u_new;

        if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
            converged = true;
            break;
        }
    }

    let its = &asm.inclined_transforms;
    let u_global = to_global_3d(&u_current, its);
    let max_ratio = stability_b2(indefinite, b2_factor(&dof_num, 3, &to_global_3d(&u_prev, its), &u_global));

    let displacements = build_displacements_3d(&dof_num, &u_global);
    let element_forces = compute_internal_forces_3d(input, &dof_num, &u_global);

    // Reactions and constraint forces of the system that was solved.
    let k_final = k_with_geometric_3d(input, &dof_num, &asm, &u_current);
    let reactions_vec = restrained_residual(&k_final, &asm.f, &u_current, n, nf);
    let mut reactions = build_reactions_3d_inclined(input, &dof_num, &reactions_vec, &asm.f[nf..], nf, &u_global, its);
    reactions.sort_by_key(|r| r.node_id);

    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&k_final, n, &free_idx, &free_idx);
        let f_eff = rhs_with_prescribed(&k_final, n, nf, &f_f, &u_current);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_current[..nf], &f_eff);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(PDeltaResult3D {
        results: AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: compute_plate_stresses(input, &dof_num, &u_global, None), quad_stresses: compute_quad_stresses(input, &dof_num, &u_global, None), quad_nodal_stresses: vec![], constraint_forces,
            // Carried from the linear pass, as in the 2D entry point: they
            // describe the model, not the solution path.
            diagnostics: linear_results.diagnostics.clone(),
            solver_diagnostics: model_solver_diagnostics(&linear_results.solver_diagnostics),
            structured_diagnostics: model_structured_diagnostics(&linear_results.structured_diagnostics),
            equilibrium: None, timings: None, result_summary: None, solver_run_meta: None },
        iterations,
        converged,
        is_stable: converged && max_ratio < 100.0,
        b2_factor: max_ratio,
        linear_results,
    })
}
