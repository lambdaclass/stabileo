use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::{build_displacements_2d, compute_internal_forces_2d,
    build_displacements_3d, compute_internal_forces_3d,
    compute_plate_stresses, compute_quad_stresses,
    build_reactions_2d_inclined, build_reactions_3d_inclined};
use super::constraints::FreeConstraintSystem;
use super::sparse_tangent::{SparseSymbolicCache, cached_symbolic};

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

/// Right-hand side of the free equations with the restrained DOFs at their
/// prescribed values: F_f − K_fr · u_r, with K the current (K + K_G).
///
/// The iterations used F_f alone and left every restrained DOF at zero, so a
/// support settlement did not exist for the second-order solution: a model
/// loaded only by one came back all zeros and "not converged", and one with
/// loads as well came back without it. The linear pass had it; its
/// displacements carry the prescribed values, which is where u_r comes from.
fn rhs_with_prescribed(k: &[f64], n: usize, nf: usize, f_f: &[f64], u: &[f64]) -> Vec<f64> {
    let u_r = &u[nf..n];
    let mut rhs = f_f.to_vec();
    if u_r.iter().all(|&v| v == 0.0) {
        return rhs;
    }
    // Row i of K_fr is the contiguous slice k[i·n + nf .. (i+1)·n] (K is
    // row-major), so no n_f × n_r block is copied out on every iteration.
    for (i, r) in rhs.iter_mut().enumerate() {
        *r -= k[i * n + nf..(i + 1) * n].iter().zip(u_r).map(|(a, b)| a * b).sum::<f64>();
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

/// The converged (or last) state of the P-Δ iteration.
struct Iteration {
    /// Full displacement vector in the assembly's frame.
    u: Vec<f64>,
    iterations: usize,
    converged: bool,
    /// Whether the last solve needed LU because Cholesky failed on K + K_G.
    indefinite: bool,
}

/// Solve the free (optionally constraint-reduced) system: sparse or dense
/// Cholesky, then LU. The flag says whether Cholesky failed — K + K_G is then
/// not positive definite. `None` when LU cannot solve it either.
fn solve_spd_or_lu(
    k_solve: Vec<f64>,
    f_solve: &[f64],
    ns: usize,
    symbolic: &mut Option<SparseSymbolicCache>,
) -> Option<(Vec<f64>, bool)> {
    if ns >= SPARSE_THRESHOLD {
        let k_csc = CscMatrix::from_dense_symmetric(&k_solve, ns);
        if let Some(factor) = numeric_cholesky(cached_symbolic(symbolic, &k_csc), &k_csc) {
            return Some((sparse_cholesky_solve(&factor, f_solve), false));
        }
    } else {
        let mut k_work = k_solve.clone();
        if let Some(u) = cholesky_solve(&mut k_work, f_solve, ns) {
            return Some((u, false));
        }
    }
    let mut k_work = k_solve;
    let mut f_work = f_solve.to_vec();
    lu_solve(&mut k_work, &mut f_work, ns).map(|u| (u, true))
}

/// The P-Δ iteration, shared by 2D and 3D: (K + K_G(u))·u = F with the
/// restrained DOFs held at their values in `u0`. `k_total` forms K + K_G in
/// the assembly's frame from the current displacements. `Err` carries the
/// iteration count when K + K_G could not be solved at all.
#[allow(clippy::too_many_arguments)]
fn iterate(
    u0: Vec<f64>,
    n: usize,
    nf: usize,
    f_f: &[f64],
    cs: &Option<FreeConstraintSystem>,
    max_iter: usize,
    tolerance: f64,
    k_total: impl Fn(&[f64]) -> Vec<f64>,
) -> Result<Iteration, usize> {
    let free_idx: Vec<usize> = (0..nf).collect();
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let mut symbolic: Option<SparseSymbolicCache> = None;
    let mut state = Iteration { u: u0, iterations: 0, converged: false, indefinite: false };

    for iter in 0..max_iter {
        state.iterations = iter + 1;
        let k = k_total(&state.u);

        let k_ff = extract_submatrix(&k, n, &free_idx, &free_idx);
        let f_eff = rhs_with_prescribed(&k, n, nf, f_f, &state.u);
        let (k_solve, f_solve) = match cs {
            Some(cs) => (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_eff)),
            None => (k_ff, f_eff),
        };
        let (u_indep, indefinite) = solve_spd_or_lu(k_solve, &f_solve, ns, &mut symbolic)
            .ok_or(state.iterations)?;
        state.indefinite = indefinite;
        let u_f = match cs {
            Some(cs) => cs.expand_solution(&u_indep),
            None => u_indep,
        };

        // The restrained DOFs keep their prescribed values.
        let (mut diff_norm, mut u_norm) = (0.0f64, 0.0f64);
        for (new, old) in u_f[..nf].iter().zip(&state.u[..nf]) {
            diff_norm += (new - old).powi(2);
            u_norm += new.powi(2);
        }
        state.u[..nf].copy_from_slice(&u_f[..nf]);

        let (diff_norm, u_norm) = (diff_norm.sqrt(), u_norm.sqrt());
        if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
            state.converged = true;
            break;
        }
    }
    Ok(state)
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

    let Iteration { u: u_current, iterations, converged, indefinite } = match iterate(
        u_prev.clone(), n, nf, &f_f, &cs, max_iter, tolerance,
        |u| k_with_geometric_2d(input, &dof_num, &asm, u),
    ) {
        Ok(state) => state,
        Err(iterations) => {
            return Ok(PDeltaResult {
                results: linear_results.clone(),
                iterations,
                converged: false,
                is_stable: false,
                b2_factor: f64::INFINITY,
                linear_results,
            });
        }
    };

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

    let mut u_prev = vec![0.0; n];
    for d in &linear_results.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (i, &val) in vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) { u_prev[idx] = val; }
        }
    }
    for it in &asm.inclined_transforms { rotate_inclined_f_3d(&mut u_prev, &it.dofs, &it.r); }

    let Iteration { u: u_current, iterations, converged, indefinite } = match iterate(
        u_prev.clone(), n, nf, &f_f, &cs, max_iter, tolerance,
        |u| k_with_geometric_3d(input, &dof_num, &asm, u),
    ) {
        Ok(state) => state,
        Err(iterations) => {
            return Ok(PDeltaResult3D {
                results: linear_results.clone(),
                iterations,
                converged: false,
                is_stable: false,
                b2_factor: f64::INFINITY,
                linear_results,
            });
        }
    };

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
