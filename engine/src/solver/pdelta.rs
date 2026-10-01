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

/// Full tangent in the assembly frame. Keeping restrained rows sparse preserves
/// settlements and reactions without allocating a dense n_total × n_total matrix.
enum Tangent3D {
    Dense(Vec<f64>),
    Sparse(CscMatrix),
}

impl Tangent3D {
    fn free_block(&self, n: usize, nf: usize) -> Self {
        match self {
            Self::Dense(k) => {
                let free: Vec<usize> = (0..nf).collect();
                Self::Dense(extract_submatrix(k, n, &free, &free))
            }
            Self::Sparse(k) => {
                let mut col_ptr = vec![0];
                let mut row_idx = Vec::new();
                let mut values = Vec::new();
                for j in 0..nf {
                    for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                        if k.row_idx[p] < nf { row_idx.push(k.row_idx[p]); values.push(k.values[p]); }
                    }
                    col_ptr.push(values.len());
                }
                Self::Sparse(CscMatrix { n: nf, col_ptr, row_idx, values })
            }
        }
    }

    fn rhs(&self, n: usize, nf: usize, f: &[f64], u: &[f64]) -> Vec<f64> {
        match self {
            Self::Dense(k) => rhs_with_prescribed(k, n, nf, &f[..nf], u),
            Self::Sparse(k) => {
                let mut rhs = f[..nf].to_vec();
                // Only lower entries K_rf are stored: their transpose contributes K_fr*u_r.
                for (j, r) in rhs.iter_mut().enumerate() {
                    for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                        let i = k.row_idx[p];
                        if i >= nf { *r -= k.values[p] * u[i]; }
                    }
                }
                rhs
            }
        }
    }

    fn residual(&self, n: usize, nf: usize, f: &[f64], u: &[f64]) -> Vec<f64> {
        match self {
            Self::Dense(k) => restrained_residual(k, f, u, n, nf),
            Self::Sparse(k) => k.sym_mat_vec(u)[nf..].iter().zip(&f[nf..]).map(|(ku, f)| ku - f).collect(),
        }
    }

    fn solve(self, rhs: &[f64], nf: usize, cs: &Option<FreeConstraintSystem>, cache: &mut Option<SparseSymbolicCache>) -> Option<(Vec<f64>, bool)> {
        let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
        let f = cs.as_ref().map_or_else(|| rhs.to_vec(), |c| c.reduce_vector(rhs));
        let (u, indefinite) = match self {
            Self::Dense(k) => {
                let k = cs.as_ref().map_or_else(|| k.clone(), |c| c.reduce_matrix(&k));
                solve_spd_or_lu(k, &f, ns, cache)?
            }
            Self::Sparse(k) => {
                let k = cs.as_ref().map_or_else(|| k.clone(), |c| c.reduce_matrix_sparse(&k));
                if let Some(factor) = numeric_cholesky(cached_symbolic(cache, &k), &k) {
                    (sparse_cholesky_solve(&factor, &f), false)
                } else {
                    // Never turn a large, unstable sparse system back into a dense allocation.
                    if ns > super::time_integration::MAX_DENSE_FALLBACK_DOFS { return None; }
                    let mut dense = k.to_dense_symmetric();
                    let mut f = f;
                    (lu_solve(&mut dense, &mut f, ns)?, true)
                }
            }
        };
        Some((cs.as_ref().map_or_else(|| u.clone(), |c| c.expand_solution(&u)), indefinite))
    }

    fn constraint_forces(&self, cs: &FreeConstraintSystem, u: &[f64], rhs: &[f64]) -> Vec<(usize, f64)> {
        match self {
            Self::Dense(k) => cs.compute_constraint_forces(k, u, rhs),
            Self::Sparse(k) => cs.compute_constraint_forces_sparse(k, u, rhs),
        }
    }
}

enum PDeltaSystem3D {
    Dense(AssemblyResult),
    Sparse(SparseAssemblyResult3D),
}

impl PDeltaSystem3D {
    fn data(&self) -> (&[f64], &[InclinedTransformData]) {
        match self {
            Self::Dense(a) => (&a.f, &a.inclined_transforms),
            Self::Sparse(a) => (&a.f, &a.inclined_transforms),
        }
    }

    fn tangent(&self, input: &SolverInput3D, dofs: &DofNumbering, u: &[f64]) -> Tangent3D {
        match self {
            Self::Dense(a) => Tangent3D::Dense(k_with_geometric_3d(input, dofs, a, u)),
            Self::Sparse(a) => {
                let mut rows = Vec::new();
                let mut cols = Vec::new();
                let mut vals = Vec::new();
                let global = to_global_3d(u, &a.inclined_transforms);
                super::geometric_stiffness::emit_geometric_stiffness_3d(input, dofs, &global, &mut |i, j, v| {
                    if i >= j && v != 0.0 { rows.push(i); cols.push(j); vals.push(v); }
                });
                for it in &a.inclined_transforms {
                    apply_inclined_transform_triplets_k(&mut rows, &mut cols, &mut vals, &it.dofs, &it.r);
                }
                let k = a.k_full.as_ref().expect("P-Delta assembles full sparse K for reactions");
                for j in 0..k.n {
                    for p in k.col_ptr[j]..k.col_ptr[j + 1] {
                        rows.push(k.row_idx[p]); cols.push(j); vals.push(k.values[p]);
                    }
                }
                let mut k = CscMatrix::from_triplets(dofs.n_total, &rows, &cols, &vals);
                k.drop_below_threshold(1e-30);
                Tangent3D::Sparse(k)
            }
        }
    }
}

/// Solve 3D P-Delta with sparse assembly for large models, including constrained models
/// whose reduced system is small. The storage decision follows the full assembly size.
pub fn solve_pdelta_3d(input: &SolverInput3D, max_iter: usize, tolerance: f64) -> Result<PDeltaResult3D, String> {
    let input = &super::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    if dof_num.n_free == 0 { return Err("No free DOFs".into()); }
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    solve_pdelta_3d_on(input, &dof_num, cs, dof_num.n_total >= SPARSE_THRESHOLD, max_iter, tolerance)
}

fn solve_pdelta_3d_on(input: &SolverInput3D, dof_num: &DofNumbering, cs: Option<FreeConstraintSystem>, sparse: bool, max_iter: usize, tolerance: f64) -> Result<PDeltaResult3D, String> {
    let linear_results = super::linear::solve_3d(input)?;
    let (n, nf) = (dof_num.n_total, dof_num.n_free);
    let system = if sparse { PDeltaSystem3D::Sparse(assemble_sparse_3d(input, dof_num, true)) }
        else { PDeltaSystem3D::Dense(assemble_3d(input, dof_num)) };
    let (f, its) = system.data();
    let mut u_prev = vec![0.0; n];
    for d in &linear_results.displacements {
        for (i, value) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) { u_prev[idx] = *value; }
        }
    }
    for it in its { rotate_inclined_f_3d(&mut u_prev, &it.dofs, &it.r); }
    let mut state = Iteration { u: u_prev.clone(), iterations: 0, converged: false, indefinite: false };
    let mut symbolic = None;
    for iter in 0..max_iter {
        state.iterations = iter + 1;
        let tangent = system.tangent(input, dof_num, &state.u);
        let rhs = tangent.rhs(n, nf, f, &state.u);
        let Some((u, indefinite)) = tangent.free_block(n, nf).solve(&rhs, nf, &cs, &mut symbolic) else {
            return Ok(PDeltaResult3D { results: linear_results.clone(), linear_results, iterations: state.iterations,
                converged: false, is_stable: false, b2_factor: f64::INFINITY });
        };
        state.indefinite = indefinite;
        let diff = u[..nf].iter().zip(&state.u[..nf]).map(|(a,b)| (a-b).powi(2)).sum::<f64>().sqrt();
        let norm = u[..nf].iter().map(|x| x*x).sum::<f64>().sqrt();
        state.u[..nf].copy_from_slice(&u[..nf]);
        if (norm == 0.0 && diff == 0.0) || (norm > 1e-20 && diff / norm < tolerance) { state.converged = true; break; }
    }
    let u_global = to_global_3d(&state.u, its);
    let b2 = stability_b2(state.indefinite, b2_factor(dof_num, 3, &to_global_3d(&u_prev, its), &u_global));
    let tangent = system.tangent(input, dof_num, &state.u);
    let residual = tangent.residual(n, nf, f, &state.u);
    let mut reactions = build_reactions_3d_inclined(input, dof_num, &residual, &f[nf..], nf, &u_global, its);
    reactions.sort_by_key(|r| r.node_id);
    let constraint_forces = cs.as_ref().map_or_else(Vec::new, |cs| {
        let raw = tangent.free_block(n, nf).constraint_forces(cs, &state.u[..nf], &tangent.rhs(n, nf, f, &state.u));
        super::constraints::map_dof_forces_to_constraint_forces(&raw, dof_num)
    });
    Ok(PDeltaResult3D {
        results: AnalysisResults3D {
            displacements: build_displacements_3d(dof_num, &u_global), reactions,
            element_forces: compute_internal_forces_3d(input, dof_num, &u_global),
            plate_stresses: compute_plate_stresses(input, dof_num, &u_global, None),
            quad_stresses: compute_quad_stresses(input, dof_num, &u_global, None), quad_nodal_stresses: vec![], constraint_forces,
            diagnostics: linear_results.diagnostics.clone(),
            solver_diagnostics: model_solver_diagnostics(&linear_results.solver_diagnostics),
            structured_diagnostics: model_structured_diagnostics(&linear_results.structured_diagnostics),
            equilibrium: None, timings: None, result_summary: None, solver_run_meta: None,
        },
        iterations: state.iterations, converged: state.converged,
        is_stable: state.converged && b2 < 100.0, b2_factor: b2, linear_results,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// A building of `bays`×`bays` bays and `storeys` storeys, fixed at the base, with gravity on
    /// every floor node and a push along x. With `diaphragms`, each floor is one.
    fn building(bays: usize, storeys: usize, diaphragms: bool) -> SolverInput3D {
        let (span, h) = (6.0, 3.5);
        let id = |i: usize, j: usize, k: usize| 1 + k * (bays + 1) * (bays + 1) + j * (bays + 1) + i;
        let mut nodes = HashMap::new();
        for k in 0..=storeys { for j in 0..=bays { for i in 0..=bays {
            let n = id(i, j, k);
            nodes.insert(n.to_string(), SolverNode3D { id: n, x: span * i as f64, y: span * j as f64, z: h * k as f64 });
        }}}
        let mut elements = HashMap::new();
        let mut member = |a: usize, b: usize, section_id: usize| {
            let e = elements.len() + 1;
            elements.insert(e.to_string(), SolverElement3D {
                id: e, elem_type: "frame".into(), node_i: a, node_j: b, material_id: 1, section_id,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
        };
        for k in 0..storeys { for j in 0..=bays { for i in 0..=bays { member(id(i, j, k), id(i, j, k + 1), 1); }}}
        for k in 1..=storeys { for j in 0..=bays { for i in 0..=bays {
            if i < bays { member(id(i, j, k), id(i + 1, j, k), 2); }
            if j < bays { member(id(i, j, k), id(i, j + 1, k), 2); }
        }}}
        let mut supports = HashMap::new();
        for j in 0..=bays { for i in 0..=bays {
            let n = id(i, j, 0);
            supports.insert(n.to_string(), SolverSupport3D {
                node_id: n, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
                kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
        }}
        let mut loads = Vec::new();
        for k in 1..=storeys { for j in 0..=bays { for i in 0..=bays {
            let fx = if i == 0 { 15.0 } else { 0.0 };
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: id(i, j, k), fx, fy: 0.0, fz: -400.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
        }}}
        let constraints = if diaphragms {
            (1..=storeys).map(|k| Constraint::Diaphragm(DiaphragmConstraint {
                master_node: id(0, 0, k),
                slave_nodes: (0..=bays).flat_map(|j| (0..=bays).map(move |i| (i, j))).filter(|&(i, j)| (i, j) != (0, 0)).map(|(i, j)| id(i, j, k)).collect(),
                plane: "XY".into(),
            })).collect()
        } else { vec![] };
        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.012, iy: 1.5e-4, iz: 1.5e-4, j: 2.0e-6, cw: None, as_y: None, as_z: None });
        sections.insert("2".into(), SolverSection3D { id: 2, name: None, a: 0.008, iy: 2.5e-4, iz: 1.0e-5, j: 1.0e-6, cw: None, as_y: None, as_z: None });
        SolverInput3D {
            solver_options: None,
            nodes, materials, sections, elements, supports, loads, constraints, left_hand: None,
            plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
        }
    }

    fn both(input: &SolverInput3D) -> (PDeltaResult3D, PDeltaResult3D) {
        let dof_num = DofNumbering::build_3d(input);
        let cs = || FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
        (
            solve_pdelta_3d_on(input, &dof_num, cs(), false, 30, 1e-8).unwrap(),
            solve_pdelta_3d_on(input, &dof_num, cs(), true, 30, 1e-8).unwrap(),
        )
    }

    fn assert_same(d: &PDeltaResult3D, s: &PDeltaResult3D) {
        assert!(d.converged && s.converged);
        assert_eq!(d.iterations, s.iterations);
        assert!((d.b2_factor - s.b2_factor).abs() < 1e-9 * d.b2_factor, "B2 {} and {}", d.b2_factor, s.b2_factor);
        let scale = d.results.displacements.iter().map(|x| x.ux.abs().max(x.uz.abs())).fold(0.0, f64::max);
        for (a, b) in d.results.displacements.iter().zip(&s.results.displacements) {
            assert_eq!(a.node_id, b.node_id);
            for (p, q) in [(a.ux, b.ux), (a.uy, b.uy), (a.uz, b.uz), (a.rx, b.rx), (a.ry, b.ry), (a.rz, b.rz)] {
                assert!((p - q).abs() < 1e-9 * scale, "node {}: {p} and {q}", a.node_id);
            }
        }
        let by = |r: &PDeltaResult3D| r.results.reactions.iter().map(|x| (x.node_id, [x.fx, x.fy, x.fz, x.mx, x.my, x.mz])).collect::<HashMap<_, _>>();
        let (rd, rs) = (by(d), by(s));
        let rmax = rd.values().flat_map(|v| v.iter()).fold(0.0f64, |m, v| m.max(v.abs()));
        for (n, a) in &rd {
            for (p, q) in a.iter().zip(&rs[n]) {
                assert!((p - q).abs() < 1e-8 * rmax, "reaction at {n}: {p} and {q}");
            }
        }
    }

    #[test]
    fn sparse_dispatch_with_fewer_than_64_free_dofs_keeps_parity() {
        let input = building(2, 1, false);
        let dofs = DofNumbering::build_3d(&input);
        assert!(dofs.n_free < SPARSE_THRESHOLD && dofs.n_total >= SPARSE_THRESHOLD);
        let (dense, _) = both(&input);
        let dispatched = solve_pdelta_3d(&input, 30, 1e-8).unwrap();
        assert_same(&dense, &dispatched);
    }

    #[test]
    fn zero_load_is_a_stable_equilibrium() {
        let mut input = building(2, 1, false);
        input.loads.clear();
        let (dense, sparse) = both(&input);
        for r in [dense, sparse] {
            assert!(r.converged && r.is_stable);
            assert!(r.results.displacements.iter().all(|d| d.ux == 0.0 && d.uy == 0.0 && d.uz == 0.0));
        }
    }

    #[test]
    fn sparse_pdelta_matches_the_dense_one() {
        let input = building(2, 3, false);
        let (d, s) = both(&input);
        assert!(d.b2_factor > 1.02, "the push must be amplified, B2 = {}", d.b2_factor);
        assert_same(&d, &s);
    }

    #[test]
    fn sparse_pdelta_keeps_settlements_and_inclined_support_reactions() {
        let mut input = building(2, 3, true);
        // One settled base, and another sliding on an inclined plane. Loads also create
        // geometric stiffness, so merely reproducing the linear solve cannot pass parity.
        input.supports.get_mut("1").unwrap().dz = Some(-0.002);
        let roller = input.supports.get_mut("3").unwrap();
        roller.is_inclined = Some(true);
        roller.normal_x = Some(0.5);
        roller.normal_y = Some(0.0);
        roller.normal_z = Some(3.0f64.sqrt() / 2.0);
        roller.ry = false;
        roller.rz = false;
        roller.dx = Some(0.001);
        let (d, s) = both(&input);
        assert_same(&d, &s);
        assert!((s.results.displacements.iter().find(|d| d.node_id == 1).unwrap().uz + 0.002).abs() < 1e-12);
        let fx: f64 = input.loads.iter().filter_map(|l| match l { SolverLoad3D::Nodal(l) => Some(l.fx), _ => None }).sum();
        let rx: f64 = s.results.reactions.iter().map(|r| r.fx).sum();
        assert!((rx + fx).abs() < 1e-7 * fx, "reactions balance second-order forces: {rx} vs {fx}");
        let cd = &d.results.constraint_forces;
        let cs = &s.results.constraint_forces;
        let scale = cd.iter().map(|x| x.force.abs()).fold(1.0, f64::max);
        for f in cd {
            let other = cs.iter().find(|c| c.node_id == f.node_id && c.dof == f.dof).map_or(0.0, |c| c.force);
            assert!((f.force - other).abs() < 1e-8 * scale);
        }
    }

    #[test]
    fn sparse_pdelta_matches_released_member_forces() {
        let mut input = building(2, 3, false);
        for e in input.elements.values_mut().filter(|e| e.section_id == 2) {
            e.release_my_start = true;
            e.release_mz_end = true;
        }
        let (d, s) = both(&input);
        assert_same(&d, &s);
        for a in &d.results.element_forces {
            let b = s.results.element_forces.iter().find(|b| b.element_id == a.element_id).unwrap();
            let pairs = [(a.n_start,b.n_start),(a.n_end,b.n_end), (a.my_start,b.my_start), (a.my_end,b.my_end),
                (a.mz_start,b.mz_start),(a.mz_end,b.mz_end),(a.vy_start,b.vy_start),(a.vz_start,b.vz_start)];
            for (x,y) in pairs { assert!((x-y).abs() < 1e-7 * x.abs().max(1.0), "member {}: {x} vs {y}", a.element_id); }
        }
    }

    #[test]
    fn sparse_pdelta_matches_the_dense_one_with_diaphragms() {
        let input = building(2, 3, true);
        let (d, s) = both(&input);
        assert_same(&d, &s);
        // Both drop residuals under 1e-15 in absolute terms, so a force that is zero in exact
        // arithmetic may appear on one side only: compared by node and DOF, a missing one is zero.
        let by = |r: &PDeltaResult3D| r.results.constraint_forces.iter().map(|c| ((c.node_id, c.dof.clone()), c.force)).collect::<HashMap<_, _>>();
        let (cd, cs) = (by(&d), by(&s));
        let fmax = cd.values().fold(0.0f64, |m, v| m.max(v.abs()));
        assert!(fmax > 1.0, "the diaphragms must carry force, largest {fmax}");
        for key in cd.keys().chain(cs.keys()) {
            let (p, q) = (cd.get(key).copied().unwrap_or(0.0), cs.get(key).copied().unwrap_or(0.0));
            assert!((p - q).abs() < 1e-8 * fmax, "constraint force at {key:?}: {p} and {q}");
        }
    }

    /// 7×7 bays and 18 storeys: 1152 free nodes and 6912 DOFs, the size of the building that ran
    /// the WASM heap out. Its dense K is 380 MB per copy, and `solve_pdelta_3d` used to hold three
    /// of them per iteration.
    #[test]
    fn a_large_building_solves_without_a_dense_matrix() {
        let input = building(7, 18, false);
        let r = solve_pdelta_3d(&input, 20, 1e-6).expect("solves");
        assert!(r.converged && r.is_stable, "iterations {}, B2 {}", r.iterations, r.b2_factor);
        // Gravity: every column line carries its share of the floors above.
        let fz: f64 = r.results.reactions.iter().map(|x| x.fz).sum();
        let applied = 400.0 * 64.0 * 18.0;
        assert!((fz - applied).abs() < 1e-6 * applied, "vertical reactions {fz}, applied {applied}");
    }

    /// A 4 m cantilever of 4 elements under `p` down and a small push, fixed at its foot.
    fn cantilever(p: f64) -> SolverInput3D {
        let mut input = building(1, 1, false);
        input.nodes = (0..=4).map(|k| ((k + 1).to_string(), SolverNode3D { id: k + 1, x: 0.0, y: 0.0, z: k as f64 })).collect();
        input.elements = (1..=4).map(|k| {
            let mut e = input.elements.values().next().unwrap().clone();
            e.id = k; e.node_i = k; e.node_j = k + 1; e.section_id = 1;
            (k.to_string(), e)
        }).collect();
        let fixed = input.supports.values().next().unwrap().clone();
        input.supports = HashMap::from([("1".into(), SolverSupport3D { node_id: 1, ..fixed })]);
        input.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.5, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
        input
    }

    #[test]
    fn past_the_critical_load_the_answer_is_not_stable() {
        // π²·EI/(4·L²) with EI = 200 000 × 1000 × 1.5e-4: 1850 kN.
        let critical = std::f64::consts::PI.powi(2) * 200_000.0 * 1000.0 * 1.5e-4 / (4.0 * 16.0);
        for (p, stable) in [(0.5 * critical, true), (1.5 * critical, false)] {
            let input = cantilever(p);
            let dof_num = DofNumbering::build_3d(&input);
            for sparse in [false, true] {
                let r = solve_pdelta_3d_on(&input, &dof_num, None, sparse, 30, 1e-8).unwrap();
                assert_eq!(r.is_stable, stable, "P = {p:.0} kN (critical {critical:.0}), sparse {sparse}: B2 {}", r.b2_factor);
                // The exact head drift at half the critical load is 1.98 times the linear one.
                if stable { assert!(r.converged && (r.b2_factor - 1.98).abs() < 0.06, "B2 {}", r.b2_factor); }
            }
        }
    }

}
