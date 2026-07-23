use crate::types::*;
use crate::linalg::*;
use crate::element;
use super::dof::DofNumbering;
use super::assembly::*;

#[cfg(not(target_arch = "wasm32"))]
#[inline]
fn now_micros() -> u64 {
    use std::time::Instant;
    static START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_micros() as u64
}

#[inline]
fn micros_to_ms(us: u64) -> f64 {
    us as f64 / 1000.0
}

#[cfg(target_arch = "wasm32")]
#[inline]
fn now_micros() -> u64 {
    0
}

/// Maps 12-DOF element indices to 14-DOF positions, skipping warping DOFs 6 and 13.
const DOF_MAP_12_TO_14: [usize; 12] = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];


/// Free DOFs threshold: use sparse solver when n_free >= this.
const SPARSE_THRESHOLD: usize = 64;

/// Solve a 2D linear static analysis.
pub fn solve_2d(input: &SolverInput) -> Result<AnalysisResults, String> {
    // Auto-delegate to constrained solver when constraints are present
    if !input.constraints.is_empty() {
        let ci = super::constraints::ConstrainedInput {
            solver: input.clone(),
            constraints: input.constraints.clone(),
        };
        return super::constraints::solve_constrained_2d(&ci);
    }

    let prepared = prepare_static_2d(input)?;
    prepared.solve_loads(&input.loads)
}

// ==================== Prepared static analysis (factor reuse across load sets) ====================

/// Factorization of K_ff, computed once from the (load-independent) stiffness
/// matrix and reused across right-hand sides.
enum FactorizedKff {
    /// Dense in-place Cholesky factor L (lower triangle) of K_ff.
    DenseCholesky(Vec<f64>),
    /// Dense in-place LU factors of K_ff with row permutation.
    DenseLu { lu: Vec<f64>, piv: Vec<usize> },
    /// Sparse Cholesky factorization of K_ff.
    SparseCholesky(NumericCholesky),
}

/// 2D static analysis prepared for multiple right-hand sides: DOF numbering,
/// assembled stiffness (inclined transforms applied), K_ff factorization, and
/// the prescribed-displacement coupling terms — everything that depends only on
/// the structure, not on the loads. Build once with `prepare_static_2d`, then
/// solve any number of load sets with `solve_loads`.
pub struct PreparedStatic2D<'a> {
    input: &'a SolverInput,
    dof_num: DofNumbering,
    n: usize,
    nf: usize,
    nr: usize,
    u_r: Vec<f64>,
    pre_solve_diags: Vec<StructuredDiagnostic>,
    artificial_dofs: Vec<usize>,
    inclined_transforms_2d: Vec<InclinedTransformData2D>,
    path: PreparedPath2D,
}

enum PreparedPath2D {
    /// All DOFs restrained: no system to solve; reactions = K·u_r − F.
    FullyRestrained {
        /// K · u_full (u_full = u_r); zero vector when u_r ≈ 0.
        ku_full: Vec<f64>,
    },
    Solve(Box<PreparedSolve2D>),
}

/// Factorized form of the free-free stiffness block plus everything the
/// per-load-set solve reuses (boxed to keep `PreparedPath2D` small).
struct PreparedSolve2D {
    /// Dense nf×nf K_ff (residual checks).
    k_ff: Vec<f64>,
    /// nr×nf reaction coupling block.
    k_rf: Vec<f64>,
    /// nf — K_fr · u_r (prescribed-displacement coupling).
    k_fr_ur: Vec<f64>,
    /// nr — K_rr · u_r.
    k_rr_ur: Vec<f64>,
    factor: FactorizedKff,
    used_sparse: bool,
    cholesky_failed: bool,
    cond_report: super::conditioning::ConditioningReport,
}

/// Prepare a 2D structure for one or more static solves: numbering, assembly,
/// and factorization of the free-free stiffness block happen exactly once here.
/// This is exactly the load-independent part of `solve_2d`.
pub fn prepare_static_2d(input: &SolverInput) -> Result<PreparedStatic2D<'_>, String> {
    let dof_num = DofNumbering::build_2d(input);
    let pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_2d(input);

    // ── Input validation (before assembly) ──
    validate_input_2d(input)?;

    let stiff = assemble_stiffness_2d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build prescribed displacement vector u_r for restrained DOFs
    let nr = n - nf;
    let mut u_r = vec![0.0; nr];
    for sup in input.supports.values() {
        if sup.support_type == "spring" { continue; } // spring DOFs are free

        if sup.support_type == "inclinedRoller" {
            // For inclined rollers, prescribed displacements (dx, dz) are given
            // in global coords. We need to rotate them to the local frame
            // (where local_dof=1 is the restrained normal direction).
            if let Some(theta) = sup.angle {
                let c = theta.cos();
                let s = theta.sin();
                let glob_dx = sup.dx.unwrap_or(0.0);
                let glob_dz = sup.dz.unwrap_or(0.0);
                // The restrained direction is (sin θ, cos θ).
                // In the rotated frame, local_dof=1 should be this direction:
                // u_local[1] = sin θ * ux + cos θ * uz
                // u_local[0] = -cos θ * ux + sin θ * uz (free tangent)
                //
                // Prescribed displacement in the restrained direction:
                let u_normal = glob_dx * s + glob_dz * c;
                if u_normal.abs() > 1e-15 {
                    // local_dof=1 is restrained
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                        if d >= nf {
                            u_r[d - nf] = u_normal;
                        }
                    }
                }
            } else {
                // No angle: treat as rollerX (restrain uz)
                if let Some(v) = sup.dz {
                    if v.abs() > 1e-15 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                            if d >= nf {
                                u_r[d - nf] = v;
                            }
                        }
                    }
                }
            }
            // Rotational prescribed displacement
            if let Some(v) = sup.dry {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                        if d >= nf {
                            u_r[d - nf] = v;
                        }
                    }
                }
            }
        } else {
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
    }

    // Fully restrained: all DOFs are restrained, no solve needed.
    if nf == 0 {
        let u_full = u_r.clone();
        // K · u_full via dense matvec (needed for reactions: R = K·u_r − F)
        let ku_full = if u_r.iter().any(|v| v.abs() > 1e-15) {
            let mut ku = vec![0.0; n];
            for i in 0..n {
                for j in 0..n {
                    ku[i] += stiff.k[i * n + j] * u_full[j];
                }
            }
            ku
        } else {
            vec![0.0; n]
        };

        return Ok(PreparedStatic2D {
            input,
            dof_num,
            n,
            nf,
            nr,
            u_r,
            pre_solve_diags,
            artificial_dofs: stiff.artificial_dofs,
            inclined_transforms_2d: stiff.inclined_transforms_2d,
            path: PreparedPath2D::FullyRestrained { ku_full },
        });
    }

    // Extract Kff and reaction coupling blocks; precompute the
    // prescribed-displacement coupling terms (all load-independent)
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&stiff.k, n, &free_idx, &free_idx);
    let k_fr = extract_submatrix(&stiff.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let k_rf = extract_submatrix(&stiff.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&stiff.k, n, &rest_idx, &rest_idx);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);

    // Dense conditioning check
    let cond_report = super::conditioning::check_conditioning(&k_ff, nf);

    // Factor K_ff once. The Cholesky/LU success decisions depend only on K,
    // so the path chosen here is the one each per-case solve would take.
    let (factor, used_sparse, cholesky_failed) = if nf >= SPARSE_THRESHOLD {
        // Sparse path
        let k_ff_sparse = CscMatrix::from_dense_symmetric(&k_ff, nf);
        let sym = symbolic_cholesky(&k_ff_sparse);
        match numeric_cholesky(&sym, &k_ff_sparse) {
            Some(num) => (FactorizedKff::SparseCholesky(num), true, false),
            None => {
                let mut k_work = k_ff.clone();
                let piv = lu_factor(&mut k_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?;
                (FactorizedKff::DenseLu { lu: k_work, piv }, false, true)
            }
        }
    } else {
        let mut k_work = k_ff.clone();
        if cholesky_decompose(&mut k_work, nf) {
            (FactorizedKff::DenseCholesky(k_work), false, false)
        } else {
            let mut k_work = k_ff.clone();
            let piv = lu_factor(&mut k_work, nf)
                .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?;
            (FactorizedKff::DenseLu { lu: k_work, piv }, false, true)
        }
    };

    Ok(PreparedStatic2D {
        input,
        dof_num,
        n,
        nf,
        nr,
        u_r,
        pre_solve_diags,
        artificial_dofs: stiff.artificial_dofs,
        inclined_transforms_2d: stiff.inclined_transforms_2d,
        path: PreparedPath2D::Solve(Box::new(PreparedSolve2D {
            k_ff, k_rf, k_fr_ur, k_rr_ur, factor, used_sparse, cholesky_failed, cond_report,
        })),
    })
}

impl PreparedStatic2D<'_> {
    /// Solve the prepared 2D structure for one load set. Rebuilds only the
    /// load vector (prescribed-displacement coupling included), reuses the
    /// stored factorization, then runs the same postprocessing as `solve_2d`.
    pub fn solve_loads(&self, loads: &[SolverLoad]) -> Result<AnalysisResults, String> {
        // Per-case load validation (the structure was validated in prepare)
        validate_loads_2d(self.input, loads)?;

        let input = self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);
        let f = assemble_load_vector_2d(input, loads, dof_num, &self.inclined_transforms_2d);

        match &self.path {
            PreparedPath2D::FullyRestrained { ku_full } => {
                let mut u_full = self.u_r.clone(); // nf==0, restrained DOFs start at index 0

                // Reactions = K · u_r − F  (all DOFs are restrained, so K_rr = K, F_r = F)
                let f_r: Vec<f64> = f.clone();
                let mut reactions_vec = vec![0.0; nr];
                for i in 0..nr {
                    reactions_vec[i] = ku_full[i] - f_r[i];
                }

                // Reverse inclined transforms on displacements
                for it in &self.inclined_transforms_2d {
                    reverse_inclined_transform_2d(&mut u_full, &it.dofs, &it.r);
                }

                let displacements = build_displacements_2d(dof_num, &u_full);
                let mut reactions = build_reactions_2d_inclined(
                    input, dof_num, &reactions_vec, &f_r, nf, &u_full, &self.inclined_transforms_2d,
                );
                reactions.sort_by_key(|r| r.node_id);
                let mut element_forces = compute_internal_forces_2d_with_loads(input, loads, dof_num, &u_full);
                element_forces.sort_by_key(|ef| ef.element_id);

                let equilibrium = compute_equilibrium_summary_2d(&f, &reactions_vec, dof_num, 0.0, &self.inclined_transforms_2d);

                let mut structured = Vec::new();
                structured.extend(self.pre_solve_diags.iter().cloned());
                structured.push(StructuredDiagnostic::global(
                    DiagnosticCode::ResidualOk,
                    Severity::Info,
                    format!("Fully restrained model (0 free DOFs, {} restrained)", nr),
                ).with_phase("solve"));

                let mut results = AnalysisResults {
                    displacements,
                    reactions,
                    element_forces,
                    constraint_forces: vec![],
                    diagnostics: vec![],
                    solver_diagnostics: vec![],
                    structured_diagnostics: structured,
                    equilibrium: Some(equilibrium),
                    result_summary: None,
                    solver_run_meta: Some(SolverRunMeta::new("fully_restrained", nf, input.elements.len(), input.nodes.len())),
                };
                results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_2d(&results));
                Ok(results)
            }

            PreparedPath2D::Solve(p) => {
                let PreparedSolve2D {
                    k_ff, k_rf, k_fr_ur, k_rr_ur, factor, used_sparse, cholesky_failed, cond_report,
                } = &**p;
                // F_f_modified = F_f − K_fr · u_r
                let mut f_f: Vec<f64> = f[..nf].to_vec();
                for i in 0..nf {
                    f_f[i] -= k_fr_ur[i];
                }

                // Solve Kff · u_f = Ff_modified with the precomputed factorization
                let u_f = match factor {
                    FactorizedKff::SparseCholesky(num) => sparse_cholesky_solve(num, &f_f),
                    FactorizedKff::DenseCholesky(l) => {
                        let y = forward_solve(l, &f_f, nf);
                        back_solve(l, &y, nf)
                    }
                    FactorizedKff::DenseLu { lu, piv } => {
                        lu_apply(lu, piv, &f_f, nf)
                            .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
                    }
                };

                // Build full displacement vector
                let mut u_full = vec![0.0; n];
                for i in 0..nf {
                    u_full[i] = u_f[i];
                }
                for i in 0..nr {
                    u_full[nf + i] = self.u_r[i];
                }

                // Check artificial DOFs for mechanism (absurd rotations)
                if !self.artificial_dofs.is_empty() {
                    for &idx in &self.artificial_dofs {
                        if idx < nf && u_f[idx].abs() > 100.0 {
                            return Err(
                                "Local mechanism detected: a node with all elements hinged has \
                                 excessive rotation, indicating local instability.".to_string()
                            );
                        }
                    }
                }

                // NaN/Inf guard: numerical blow-up means singular matrix
                let has_nan_inf = u_f.iter().any(|v| v.is_nan() || v.is_infinite());
                if has_nan_inf {
                    return Err("Singular stiffness matrix — structure is a mechanism".to_string());
                }

                // Compute reactions: R = K_rf · u_f + K_rr · u_r − F_r
                let f_r: Vec<f64> = f[nf..].to_vec();
                let k_rf_uf = mat_vec_rect(k_rf, &u_f, nr, nf);
                let mut reactions_vec = vec![0.0; nr];
                for i in 0..nr {
                    reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
                }

                // Reverse inclined transforms on displacements before building results
                for it in &self.inclined_transforms_2d {
                    reverse_inclined_transform_2d(&mut u_full, &it.dofs, &it.r);
                }

                // Build results
                let displacements = build_displacements_2d(dof_num, &u_full);
                let mut reactions = build_reactions_2d_inclined(
                    input, dof_num, &reactions_vec, &f_r, nf, &u_full, &self.inclined_transforms_2d,
                );
                reactions.sort_by_key(|r| r.node_id);
                let mut element_forces = compute_internal_forces_2d_with_loads(input, loads, dof_num, &u_full);
                element_forces.sort_by_key(|ef| ef.element_id);

                // Compute residual: ||K_ff · u_f − f_f|| / ||f_f||
                let rel_residual = {
                    let mut res2 = 0.0f64;
                    let mut f2 = 0.0f64;
                    for i in 0..nf {
                        let mut ku_i = 0.0;
                        for j in 0..nf {
                            ku_i += k_ff[i * nf + j] * u_f[j];
                        }
                        let r = ku_i - f_f[i];
                        res2 += r * r;
                        f2 += f_f[i] * f_f[i];
                    }
                    res2.sqrt() / f2.sqrt().max(1e-30)
                };

                let equilibrium = compute_equilibrium_summary_2d(&f, &reactions_vec, dof_num, rel_residual, &self.inclined_transforms_2d);

                // Build structured diagnostics — same contract as before
                let mut structured = Vec::new();
                structured.extend(self.pre_solve_diags.iter().cloned());

                // Solver path
                structured.push(StructuredDiagnostic::global(
                    if *used_sparse { DiagnosticCode::SparseCholesky } else { DiagnosticCode::DenseLu },
                    Severity::Info,
                    format!("{} solver ({} free DOFs)", if *used_sparse { "Sparse Cholesky" } else { "Dense" }, nf),
                ).with_phase("solve"));

                // LU fallback warning
                if *cholesky_failed {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::CholeskyFailedLuFallback,
                        Severity::Warning,
                        "Cholesky factorization failed — LU fallback succeeded but model may be unstable (not positive-definite)".to_string(),
                    ).with_phase("solve"));
                }

                // Displacement sanity check — translational DOFs only (rotations are in radians, not length units)
                let max_disp = dof_num.map.iter()
                    .filter(|&(&(_node, local_dof), &global)| local_dof < 2 && global < nf)
                    .map(|(&_, &global)| u_f[global].abs())
                    .fold(0.0f64, f64::max);
                let char_length = {
                    let mut min_x = f64::MAX;
                    let mut max_x = f64::MIN;
                    let mut min_z = f64::MAX;
                    let mut max_z = f64::MIN;
                    for node in input.nodes.values() {
                        min_x = min_x.min(node.x);
                        max_x = max_x.max(node.x);
                        min_z = min_z.min(node.z);
                        max_z = max_z.max(node.z);
                    }
                    let span = ((max_x - min_x).powi(2) + (max_z - min_z).powi(2)).sqrt();
                    span.max(1.0)
                };
                if max_disp > 1000.0 * char_length {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::ExcessiveDisplacement,
                        Severity::Warning,
                        format!(
                            "Maximum displacement {:.2e} exceeds 1000× characteristic length {:.2e} — likely mechanism or instability",
                            max_disp, char_length
                        ),
                    ).with_value(max_disp, 1000.0 * char_length).with_phase("solve"));
                }

                // Conditioning
                let cond = cond_report.diagonal_ratio;
                if cond > 1e12 {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::ExtremelyHighDiagonalRatio,
                        Severity::Warning,
                        format!("Extremely high diagonal ratio {:.2e}", cond),
                    ).with_value(cond, 1e12).with_phase("conditioning"));
                } else if cond > 1e8 {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::HighDiagonalRatio,
                        Severity::Warning,
                        format!("High diagonal ratio {:.2e}", cond),
                    ).with_value(cond, 1e8).with_phase("conditioning"));
                }

                if !cond_report.near_zero_dofs.is_empty() {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::NearZeroDiagonal,
                        Severity::Warning,
                        format!("{} near-zero diagonal entries", cond_report.near_zero_dofs.len()),
                    ).with_dofs(cond_report.near_zero_dofs.clone()).with_phase("conditioning"));
                }

                // Residual
                structured.push(if rel_residual < 1e-6 {
                    StructuredDiagnostic::global(
                        DiagnosticCode::ResidualOk,
                        Severity::Info,
                        format!("Residual {:.2e} ({} free DOFs)", rel_residual, nf),
                    ).with_value(rel_residual, 1e-6).with_phase("solve")
                } else {
                    StructuredDiagnostic::global(
                        DiagnosticCode::ResidualHigh,
                        Severity::Warning,
                        format!("Residual {:.2e} exceeds tolerance ({} free DOFs)", rel_residual, nf),
                    ).with_value(rel_residual, 1e-6).with_phase("solve")
                });

                let solver_path_2d = if *used_sparse { "sparse_cholesky" } else { "dense_lu" };
                let mut results = AnalysisResults {
                    displacements,
                    reactions,
                    element_forces,
                    constraint_forces: vec![],
                    diagnostics: vec![],
                    solver_diagnostics: vec![],
                    structured_diagnostics: structured,
                    equilibrium: Some(equilibrium),
                    result_summary: None,
                    solver_run_meta: Some(SolverRunMeta::new(
                        solver_path_2d,
                        nf,
                        input.elements.len(),
                        input.nodes.len(),
                    )),
                };
                results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_2d(&results));
                Ok(results)
            }
        }
    }
}

/// Solve a 3D linear static analysis.
pub fn solve_3d(input: &SolverInput3D) -> Result<AnalysisResults3D, String> {
    // Auto-delegate to constrained solver when constraints are present
    if !input.constraints.is_empty() {
        let ci = super::constraints::ConstrainedInput3D {
            solver: input.clone(),
            constraints: input.constraints.clone(),
        };
        return super::constraints::solve_constrained_3d(&ci);
    }

    let prepared = prepare_static_3d(input)?;
    prepared.solve_loads(&input.loads)
}

/// 3D static analysis prepared for multiple right-hand sides: curved-beam
/// expansion, DOF numbering, assembled stiffness, K_ff factorization, and the
/// prescribed-displacement coupling terms — everything that depends only on
/// the structure, not on the loads. Build once with `prepare_static_3d`, then
/// solve any number of load sets with `solve_loads`.
pub struct PreparedStatic3D {
    /// Curved-beam-expanded input (loads field unused by `solve_loads`).
    input: SolverInput3D,
    dof_num: DofNumbering,
    n: usize,
    nf: usize,
    nr: usize,
    n_elements: usize,
    n_nodes: usize,
    u_r: Vec<f64>,
    pre_solve_diags: Vec<StructuredDiagnostic>,
    path: PreparedPath3D,
}

enum PreparedPath3D {
    FullyRestrained(FullyRestrained3D),
    Dense(DensePrepared3D),
    Sparse(SparsePrepared3D),
    /// Sparse Cholesky failed even with regularization: dense LU of K_ff.
    SparseDenseLu(SparseDenseLuPrepared3D),
}

struct FullyRestrained3D {
    /// K · u_full (u_full = u_r); zero vector when u_r ≈ 0.
    ku_full: Vec<f64>,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
}

struct DensePrepared3D {
    k_ff: Vec<f64>,
    k_rf: Vec<f64>,
    k_fr_ur: Vec<f64>,
    k_rr_ur: Vec<f64>,
    factor: FactorizedKff,
    cholesky_failed: bool,
    cond_report: super::conditioning::ConditioningReport,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
    /// Conditioning warnings (emitted before the per-case solver-path message).
    solver_diags_base: Vec<SolverDiagnostic>,
}

struct SparsePrepared3D {
    k_ff: CscMatrix,
    k_full: CscMatrix,
    num: NumericCholesky,
    /// True when K_ff needed a diagonal shift to factor (drilling stabilization).
    regularized: bool,
    max_perturbation: f64,
    /// nf — K_fr · u_r from the sparse full-K (zeros when no prescribed DOFs).
    kfr_ur: Vec<f64>,
    cond: f64,
    nnz_kff: usize,
    nnz_l: usize,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
    /// Conditioning (+ regularization) messages, emitted before per-case ones.
    solver_diags_base: Vec<SolverDiagnostic>,
    assembly_us: u64,
    conditioning_us: u64,
    symbolic_us: u64,
    numeric_us: u64,
}

struct SparseDenseLuPrepared3D {
    k_full: CscMatrix,
    lu: Vec<f64>,
    piv: Vec<usize>,
    /// nf — K_fr · u_r from the dense assembly (LU right-hand-side coupling).
    k_fr_ur: Vec<f64>,
    cond: f64,
    nnz_kff: usize,
    nnz_l: usize,
    diagnostics: Vec<AssemblyDiagnostic>,
    /// Sparse-path transforms (reactions/postprocessing).
    inclined_transforms: Vec<InclinedTransformData>,
    /// Dense-path transforms (dense load-vector rebuild for the LU RHS).
    dense_inclined_transforms: Vec<InclinedTransformData>,
    solver_diags_base: Vec<SolverDiagnostic>,
    assembly_us: u64,
    conditioning_us: u64,
    symbolic_us: u64,
    numeric_us: u64,
    dense_fb_us: u64,
}

/// Prepare a 3D structure for one or more static solves: curved-beam expansion,
/// numbering, assembly, and factorization of the free-free stiffness block
/// happen exactly once here. This is exactly the load-independent part of `solve_3d`.
pub fn prepare_static_3d(input: &SolverInput3D) -> Result<PreparedStatic3D, String> {
    // Expand curved beams into frame elements before solving
    let input = expand_curved_beams_3d(input);
    let n_nodes = input.nodes.len();
    let n_elements = input.elements.len()
        + input.plates.len()
        + input.quads.len()
        + input.quad9s.len()
        + input.solid_shells.len()
        + input.curved_shells.len();
    let dof_num = DofNumbering::build_3d(&input);
    let pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_3d(&input);

    // ── Input validation (before assembly) ──
    validate_input_3d(&input)?;

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Build prescribed displacement vector u_r for restrained DOFs
    let mut u_r = vec![0.0; nr];
    for sup in input.supports.values() {
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

    // Fully restrained: all DOFs are restrained, no solve needed.
    if nf == 0 {
        let stiff = assemble_stiffness_3d(&input, &dof_num);
        let u_full = u_r.clone();

        // K · u_full via dense matvec (needed for reactions: R = K·u_r − F)
        let ku_full = if u_r.iter().any(|v| v.abs() > 1e-15) {
            let mut ku = vec![0.0; n];
            for i in 0..n {
                for j in 0..n {
                    ku[i] += stiff.k[i * n + j] * u_full[j];
                }
            }
            ku
        } else {
            vec![0.0; n]
        };

        return Ok(PreparedStatic3D {
            input,
            dof_num,
            n,
            nf,
            nr,
            n_elements,
            n_nodes,
            u_r,
            pre_solve_diags,
            path: PreparedPath3D::FullyRestrained(FullyRestrained3D {
                ku_full,
                diagnostics: stiff.diagnostics,
                inclined_transforms: stiff.inclined_transforms,
            }),
        });
    }

    if nf >= SPARSE_THRESHOLD {
        // ── Sparse path: O(nnz) assembly, no dense n×n matrix ──
        let t0 = now_micros();
        let stiff = super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(&input, &dof_num, true);
        let assembly_us = now_micros().saturating_sub(t0);

        let mut solver_diags_base: Vec<SolverDiagnostic> = Vec::new();

        // Sparse diagonal conditioning check
        let t0 = now_micros();
        let cond = sparse_diagonal_conditioning(&stiff.k_ff);
        if cond > 1e12 {
            solver_diags_base.push(SolverDiagnostic {
                category: "conditioning".into(),
                message: format!("Extremely high diagonal ratio {:.2e} — matrix is likely ill-conditioned", cond),
                severity: "warning".into(),
            });
        } else if cond > 1e8 {
            solver_diags_base.push(SolverDiagnostic {
                category: "conditioning".into(),
                message: format!("High diagonal ratio {:.2e} — potential conditioning issues", cond),
                severity: "warning".into(),
            });
        }
        let conditioning_us = now_micros().saturating_sub(t0);

        // Symbolic + numeric factorization of K_ff (split phases, K-only)
        let t0 = now_micros();
        let sym = symbolic_cholesky(&stiff.k_ff);
        let symbolic_us = now_micros().saturating_sub(t0);
        let nnz_kff = stiff.k_ff.col_ptr[nf]; // total nnz in lower triangle
        let nnz_l = sym.l_nnz;

        // Try strict Cholesky first; if it fails (shell drilling DOFs),
        // regularize K_ff with a diagonal shift and retry.
        let t0 = now_micros();
        let num_result = numeric_cholesky(&sym, &stiff.k_ff);
        let numeric_us = now_micros().saturating_sub(t0);

        let num = if let Some(n) = num_result {
            Some((n, false, 0.0))
        } else {
            // Regularize: clone K_ff and add a diagonal shift to make it SPD.
            // Try increasing shifts until Cholesky succeeds.
            let max_d = stiff.max_diag_k;
            let mut factored = None;
            let mut shift = 0.0;
            for &alpha in &[1e-6, 1e-4, 1e-2, 1e-1, 1.0, 10.0] {
                shift = alpha * max_d;
                let mut k_reg = stiff.k_ff.clone();
                for j in 0..nf {
                    for p in k_reg.col_ptr[j]..k_reg.col_ptr[j + 1] {
                        if k_reg.row_idx[p] == j {
                            k_reg.values[p] += shift;
                            break;
                        }
                    }
                }
                if let Some(n) = numeric_cholesky(&sym, &k_reg) {
                    factored = Some(n);
                    break;
                }
            }
            factored.map(|n| (n, true, shift))
        };

        let has_prescribed = u_r.iter().any(|v| v.abs() > 1e-15);

        match num {
            Some((num, regularized, max_perturbation)) => {
                if regularized {
                    solver_diags_base.push(SolverDiagnostic {
                        category: "solver_path".into(),
                        message: format!(
                            "Regularized K_ff with diagonal shift {:.2e} (drilling DOF stabilization)",
                            max_perturbation
                        ),
                        severity: "info".into(),
                    });
                }
                // Prescribed-displacement coupling F_f −= K_fr · u_r (K-only)
                let kfr_ur = if has_prescribed {
                    stiff.k_full.as_ref().unwrap().sparse_cross_block_matvec(&u_r, nf)
                } else {
                    vec![0.0; nf]
                };
                Ok(PreparedStatic3D {
                    input,
                    dof_num,
                    n,
                    nf,
                    nr,
                    n_elements,
                    n_nodes,
                    u_r,
                    pre_solve_diags,
                    path: PreparedPath3D::Sparse(SparsePrepared3D {
                        k_ff: stiff.k_ff,
                        k_full: stiff.k_full.unwrap(),
                        num,
                        regularized,
                        max_perturbation,
                        kfr_ur,
                        cond,
                        nnz_kff,
                        nnz_l,
                        diagnostics: stiff.diagnostics,
                        inclined_transforms: stiff.inclined_transforms,
                        solver_diags_base,
                        assembly_us,
                        conditioning_us,
                        symbolic_us,
                        numeric_us,
                    }),
                })
            }
            None => {
                // All shifts failed — fall back to dense LU (factorized once
                // here; the factorization depends only on K, not the loads).
                solver_diags_base.push(SolverDiagnostic {
                    category: "fallback".into(),
                    message: "Sparse Cholesky failed even with regularization, fell back to dense LU".into(),
                    severity: "warning".into(),
                });
                let t0 = now_micros();
                let stiff_d = assemble_stiffness_3d(&input, &dof_num);
                let free_idx: Vec<usize> = (0..nf).collect();
                let rest_idx: Vec<usize> = (nf..n).collect();
                let k_fr_d = extract_submatrix(&stiff_d.k, n, &free_idx, &rest_idx);
                let k_fr_ur = mat_vec_rect(&k_fr_d, &u_r, nf, nr);
                let mut k_ff_d = extract_submatrix(&stiff_d.k, n, &free_idx, &free_idx);
                let piv = lu_factor(&mut k_ff_d, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?;
                let dense_fb_us = now_micros().saturating_sub(t0);
                Ok(PreparedStatic3D {
                    input,
                    dof_num,
                    n,
                    nf,
                    nr,
                    n_elements,
                    n_nodes,
                    u_r,
                    pre_solve_diags,
                    path: PreparedPath3D::SparseDenseLu(SparseDenseLuPrepared3D {
                        k_full: stiff.k_full.unwrap(),
                        lu: k_ff_d,
                        piv,
                        k_fr_ur,
                        cond,
                        nnz_kff,
                        nnz_l,
                        diagnostics: stiff.diagnostics,
                        inclined_transforms: stiff.inclined_transforms,
                        dense_inclined_transforms: stiff_d.inclined_transforms,
                        solver_diags_base,
                        assembly_us,
                        conditioning_us,
                        symbolic_us,
                        numeric_us,
                        dense_fb_us,
                    }),
                })
            }
        }
    } else {
        // ── Dense path: small models (nf < 64) ──
        let stiff = assemble_stiffness_3d(&input, &dof_num);

        let free_idx: Vec<usize> = (0..nf).collect();
        let rest_idx: Vec<usize> = (nf..n).collect();
        let k_ff = extract_submatrix(&stiff.k, n, &free_idx, &free_idx);

        // Dense conditioning check
        let cond_report = super::conditioning::check_conditioning(&k_ff, nf);
        let mut solver_diags_base: Vec<SolverDiagnostic> = Vec::new();
        for w in &cond_report.warnings {
            solver_diags_base.push(SolverDiagnostic {
                category: "conditioning".into(),
                message: w.clone(),
                severity: "warning".into(),
            });
        }

        // Prescribed-displacement coupling and reaction blocks (K-only)
        let k_fr = extract_submatrix(&stiff.k, n, &free_idx, &rest_idx);
        let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
        let k_rf = extract_submatrix(&stiff.k, n, &rest_idx, &free_idx);
        let k_rr = extract_submatrix(&stiff.k, n, &rest_idx, &rest_idx);
        let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);

        // Factor K_ff once (Cholesky, LU on failure — K-only decision)
        let (factor, cholesky_failed) = {
            let mut k_work = k_ff.clone();
            if cholesky_decompose(&mut k_work, nf) {
                (FactorizedKff::DenseCholesky(k_work), false)
            } else {
                let mut k_work = k_ff.clone();
                let piv = lu_factor(&mut k_work, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?;
                (FactorizedKff::DenseLu { lu: k_work, piv }, true)
            }
        };

        Ok(PreparedStatic3D {
            input,
            dof_num,
            n,
            nf,
            nr,
            n_elements,
            n_nodes,
            u_r,
            pre_solve_diags,
            path: PreparedPath3D::Dense(DensePrepared3D {
                k_ff,
                k_rf,
                k_fr_ur,
                k_rr_ur,
                factor,
                cholesky_failed,
                cond_report,
                diagnostics: stiff.diagnostics,
                inclined_transforms: stiff.inclined_transforms,
                solver_diags_base,
            }),
        })
    }
}

impl PreparedStatic3D {
    /// Solve the prepared 3D structure for one load set. Rebuilds only the
    /// load vector (prescribed-displacement coupling included), reuses the
    /// stored factorization, then runs the same postprocessing as `solve_3d`.
    pub fn solve_loads(&self, loads: &[SolverLoad3D]) -> Result<AnalysisResults3D, String> {
        // Per-case load validation (the structure was validated in prepare)
        validate_loads_3d(&self.input, loads)?;
        match &self.path {
            PreparedPath3D::FullyRestrained(p) => self.solve_loads_fully_restrained(loads, p),
            PreparedPath3D::Dense(p) => self.solve_loads_dense(loads, p),
            PreparedPath3D::Sparse(p) => self.solve_loads_sparse(loads, p),
            PreparedPath3D::SparseDenseLu(p) => self.solve_loads_sparse_dense_lu(loads, p),
        }
    }

    fn solve_loads_fully_restrained(
        &self,
        loads: &[SolverLoad3D],
        p: &FullyRestrained3D,
    ) -> Result<AnalysisResults3D, String> {
        let input = &self.input;
        let dof_num = &self.dof_num;
        let nf = self.nf;
        let nr = self.nr;
        let f = assemble_load_vector_3d_dense(input, loads, dof_num, &p.inclined_transforms);
        let u_full = self.u_r.clone();

        // Reactions = K · u_r − F  (all DOFs restrained)
        let f_r: Vec<f64> = f.clone();
        let mut reactions_vec = vec![0.0; nr];
        for i in 0..nr {
            reactions_vec[i] = p.ku_full[i] - f_r[i];
        }

        let displacements = build_displacements_3d(dof_num, &u_full);
        let mut reactions = build_reactions_3d_inclined(
            input, dof_num, &reactions_vec, &f_r, nf, &u_full, &p.inclined_transforms,
        );
        reactions.sort_by_key(|r| r.node_id);
        let mut element_forces = compute_internal_forces_3d_with_loads(input, loads, dof_num, &u_full);
        element_forces.sort_by_key(|ef| ef.element_id);
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full);
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full);

        let equilibrium = compute_equilibrium_summary_3d(&f, &reactions_vec, dof_num, 0.0, &p.inclined_transforms);

        let mut structured = Vec::new();
        structured.extend(self.pre_solve_diags.iter().cloned());
        structured.push(StructuredDiagnostic::global(
            DiagnosticCode::ResidualOk,
            Severity::Info,
            format!("Fully restrained model (0 free DOFs, {} restrained)", nr),
        ).with_phase("solve"));

        let mut results = AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses,
            quad_stresses,
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full),
            constraint_forces: vec![],
            diagnostics: p.diagnostics.clone(),
            solver_diagnostics: vec![],
            structured_diagnostics: structured,
            equilibrium: Some(equilibrium),
            timings: None,
            result_summary: None,
            solver_run_meta: Some(SolverRunMeta::new(
                "fully_restrained", nf, self.n_elements, self.n_nodes,
            )),
        };
        results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_3d(&results));
        Ok(results)
    }

    fn solve_loads_dense(
        &self,
        loads: &[SolverLoad3D],
        p: &DensePrepared3D,
    ) -> Result<AnalysisResults3D, String> {
        let input = &self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);

        let f = assemble_load_vector_3d_dense(input, loads, dof_num, &p.inclined_transforms);

        // F_f_modified = F_f − K_fr · u_r
        let mut f_f: Vec<f64> = f[..nf].to_vec();
        for i in 0..nf { f_f[i] -= p.k_fr_ur[i]; }

        let u_f = match &p.factor {
            FactorizedKff::DenseCholesky(l) => {
                let y = forward_solve(l, &f_f, nf);
                back_solve(l, &y, nf)
            }
            FactorizedKff::DenseLu { lu, piv } => {
                lu_apply(lu, piv, &f_f, nf)
                    .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?
            }
            FactorizedKff::SparseCholesky(_) => unreachable!("dense path holds dense factors"),
        };

        let mut solver_diags = p.solver_diags_base.clone();
        solver_diags.push(SolverDiagnostic {
            category: "solver_path".into(),
            message: format!("Dense solver ({} free DOFs)", nf),
            severity: "info".into(),
        });

        // Compute residual: ||K_ff · u_f − f_f|| / ||f_f||
        let rel_residual = {
            let mut res2 = 0.0f64;
            let mut f2 = 0.0f64;
            for i in 0..nf {
                let mut ku_i = 0.0;
                for j in 0..nf {
                    ku_i += p.k_ff[i * nf + j] * u_f[j];
                }
                let r = ku_i - f_f[i];
                res2 += r * r;
                f2 += f_f[i] * f_f[i];
            }
            res2.sqrt() / f2.sqrt().max(1e-30)
        };

        let mut u_full = vec![0.0; n];
        for i in 0..nf { u_full[i] = u_f[i]; }
        for i in 0..nr { u_full[nf + i] = self.u_r[i]; }

        // Compute reactions: R = K_rf · u_f + K_rr · u_r − F_r
        let f_r: Vec<f64> = f[nf..].to_vec();
        let k_rf_uf = mat_vec_rect(&p.k_rf, &u_f, nr, nf);
        let mut reactions_vec = vec![0.0; nr];
        for i in 0..nr {
            reactions_vec[i] = k_rf_uf[i] + p.k_rr_ur[i] - f_r[i];
        }

        // Reverse inclined support rotations on displacements
        for it in &p.inclined_transforms {
            reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
        }

        let displacements = build_displacements_3d(dof_num, &u_full);
        let mut reactions = build_reactions_3d_inclined(
            input, dof_num, &reactions_vec, &f_r, nf, &u_full, &p.inclined_transforms,
        );
        reactions.sort_by_key(|r| r.node_id);
        let mut element_forces = compute_internal_forces_3d_with_loads(input, loads, dof_num, &u_full);
        element_forces.sort_by_key(|ef| ef.element_id);

        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full);
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full);

        let equilibrium = compute_equilibrium_summary_3d(&f, &reactions_vec, dof_num, rel_residual, &p.inclined_transforms);

        // Build structured diagnostics for dense path — same contract as sparse path
        let mut structured = Vec::new();
        structured.extend(self.pre_solve_diags.iter().cloned());

        // Solver path
        structured.push(StructuredDiagnostic::global(
            DiagnosticCode::DenseLu,
            Severity::Info,
            format!("Dense solver ({} free DOFs)", nf),
        ).with_phase("solve"));

        // LU fallback warning
        if p.cholesky_failed {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::CholeskyFailedLuFallback,
                Severity::Warning,
                "Cholesky factorization failed — LU fallback succeeded but model may be unstable (not positive-definite)".to_string(),
            ).with_phase("solve"));
        }

        // Displacement sanity check — translational DOFs only
        let max_disp = dof_num.map.iter()
            .filter(|&(&(_node, local_dof), &global)| local_dof < 3 && global < nf)
            .map(|(&_, &global)| u_f[global].abs())
            .fold(0.0f64, f64::max);
        let char_length = {
            let (mut mn_x, mut mx_x) = (f64::MAX, f64::MIN);
            let (mut mn_y, mut mx_y) = (f64::MAX, f64::MIN);
            let (mut mn_z, mut mx_z) = (f64::MAX, f64::MIN);
            for node in input.nodes.values() {
                mn_x = mn_x.min(node.x); mx_x = mx_x.max(node.x);
                mn_y = mn_y.min(node.y); mx_y = mx_y.max(node.y);
                mn_z = mn_z.min(node.z); mx_z = mx_z.max(node.z);
            }
            ((mx_x - mn_x).powi(2) + (mx_y - mn_y).powi(2) + (mx_z - mn_z).powi(2)).sqrt().max(1.0)
        };
        if max_disp > 1000.0 * char_length {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExcessiveDisplacement,
                Severity::Warning,
                format!(
                    "Maximum displacement {:.2e} exceeds 1000× characteristic length {:.2e} — likely mechanism or instability",
                    max_disp, char_length
                ),
            ).with_value(max_disp, 1000.0 * char_length).with_phase("solve"));
        }

        // Conditioning
        let cond = p.cond_report.diagonal_ratio;
        if cond > 1e12 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExtremelyHighDiagonalRatio,
                Severity::Warning,
                format!("Extremely high diagonal ratio {:.2e}", cond),
            ).with_value(cond, 1e12).with_phase("conditioning"));
        } else if cond > 1e8 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::HighDiagonalRatio,
                Severity::Warning,
                format!("High diagonal ratio {:.2e}", cond),
            ).with_value(cond, 1e8).with_phase("conditioning"));
        }

        if !p.cond_report.near_zero_dofs.is_empty() {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::NearZeroDiagonal,
                Severity::Warning,
                format!("{} near-zero diagonal entries", p.cond_report.near_zero_dofs.len()),
            ).with_dofs(p.cond_report.near_zero_dofs.clone()).with_phase("conditioning"));
        }

        // Residual
        structured.push(if rel_residual < 1e-6 {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualOk,
                Severity::Info,
                format!("Dense solver residual {:.2e} ({} free DOFs)", rel_residual, nf),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        } else {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualHigh,
                Severity::Warning,
                format!("Dense solver residual {:.2e} exceeds tolerance ({} free DOFs)", rel_residual, nf),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        });

        let mut results = AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses,
            quad_stresses,
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full),
            constraint_forces: vec![],
            diagnostics: p.diagnostics.clone(),
            solver_diagnostics: solver_diags,
            structured_diagnostics: structured,
            equilibrium: Some(equilibrium),
            timings: None,
            result_summary: None,
            solver_run_meta: Some(SolverRunMeta::new(
                "dense_lu", nf, self.n_elements, self.n_nodes,
            )),
        };
        results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_3d(&results));
        Ok(results)
    }

    /// Dense LU fallback (per case): dense K_ff factor + dense load vector.
    /// Used when the sparse Cholesky solve gives a bad residual.
    fn dense_lu_fallback_3d(&self, loads: &[SolverLoad3D]) -> Result<Vec<f64>, String> {
        let input = &self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);
        let stiff_d = assemble_stiffness_3d(input, dof_num);
        let f_d = assemble_load_vector_3d_dense(input, loads, dof_num, &stiff_d.inclined_transforms);
        let free_idx: Vec<usize> = (0..nf).collect();
        let rest_idx: Vec<usize> = (nf..n).collect();
        let k_fr = extract_submatrix(&stiff_d.k, n, &free_idx, &rest_idx);
        let kfr_ur_d = mat_vec_rect(&k_fr, &self.u_r, nf, nr);
        let mut f_work: Vec<f64> = f_d[..nf].to_vec();
        for i in 0..nf { f_work[i] -= kfr_ur_d[i]; }
        let mut k_ff_d = extract_submatrix(&stiff_d.k, n, &free_idx, &free_idx);
        lu_solve(&mut k_ff_d, &mut f_work, nf)
            .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())
    }

    fn solve_loads_sparse(
        &self,
        loads: &[SolverLoad3D],
        p: &SparsePrepared3D,
    ) -> Result<AnalysisResults3D, String> {
        let t_total = now_micros();
        let input = &self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);

        // Rebuild only the load vector for this case
        let f = super::sparse_assembly::assemble_load_vector_sparse_3d(input, loads, dof_num, &p.inclined_transforms);

        let mut solver_diags = p.solver_diags_base.clone();
        let mut dense_fb_us: u64 = 0;

        // F_f modified for prescribed displacements: F_f −= K_fr · u_r (precomputed)
        let mut f_f: Vec<f64> = f[..nf].to_vec();
        for i in 0..nf { f_f[i] -= p.kfr_ur[i]; }

        // Triangular solve with the precomputed sparse Cholesky factor
        let t0 = now_micros();
        let mut u = sparse_cholesky_solve(&p.num, &f_f);

        // Iterative refinement against the ORIGINAL K_ff to correct for
        // the regularization shift. Up to 5 steps of residual correction.
        if p.regularized {
            for _ in 0..5 {
                let ku = p.k_ff.sym_mat_vec(&u);
                let mut residual: Vec<f64> = vec![0.0; nf];
                let mut res2 = 0.0f64;
                let mut f2 = 0.0f64;
                for i in 0..nf {
                    residual[i] = f_f[i] - ku[i];
                    res2 += residual[i] * residual[i];
                    f2 += f_f[i] * f_f[i];
                }
                if res2.sqrt() / f2.sqrt().max(1e-30) < 1e-10 {
                    break;
                }
                let du = sparse_cholesky_solve(&p.num, &residual);
                for i in 0..nf {
                    u[i] += du[i];
                }
            }
        }
        let s_us = now_micros().saturating_sub(t0);

        // Verify final solution quality via residual check.
        let t0 = now_micros();
        let ku = p.k_ff.sym_mat_vec(&u);
        let mut res_norm2 = 0.0f64;
        let mut f_norm2 = 0.0f64;
        for i in 0..nf {
            res_norm2 += (ku[i] - f_f[i]).powi(2);
            f_norm2 += f_f[i].powi(2);
        }
        let rel_residual = res_norm2.sqrt() / f_norm2.sqrt().max(1e-30);
        let r_us = now_micros().saturating_sub(t0);

        let mut used_residual_fallback = false;
        let (u_f, solve_us, residual_us) = if rel_residual < 1e-6 {
            solver_diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("Sparse Cholesky solver ({} free DOFs)", nf),
                severity: "info".into(),
            });
            (u, s_us, r_us)
        } else {
            solver_diags.push(SolverDiagnostic {
                category: "fallback".into(),
                message: format!(
                    "Sparse Cholesky residual too large ({:.2e}), fell back to dense LU",
                    rel_residual
                ),
                severity: "warning".into(),
            });
            used_residual_fallback = true;
            let t0 = now_micros();
            let u_fb = self.dense_lu_fallback_3d(loads)?;
            dense_fb_us = now_micros().saturating_sub(t0);
            (u_fb, s_us, r_us)
        };

        // Build full displacement vector
        let mut u_full = vec![0.0; n];
        u_full[..nf].copy_from_slice(&u_f);
        for i in 0..nr { u_full[nf + i] = self.u_r[i]; }

        // Reactions via full-K sym_mat_vec: R[i] = (K·u)[i] − F[i] for restrained DOFs
        let t0 = now_micros();
        let ku = p.k_full.sym_mat_vec(&u_full);
        let mut reactions_vec = vec![0.0; nr];
        let f_r: Vec<f64> = f[nf..].to_vec();
        for i in 0..nr {
            reactions_vec[i] = ku[nf + i] - f_r[i];
        }

        // If we fell back to dense LU due to bad sparse residual, recompute the
        // residual from the actual returned solution (ku is from u_full which uses
        // the dense solution). The old rel_residual describes the rejected sparse
        // attempt, not the final answer.
        let rel_residual = if used_residual_fallback {
            let mut res2 = 0.0f64;
            let mut f2 = 0.0f64;
            for i in 0..nf {
                let r = ku[i] - f[i];
                res2 += r * r;
                f2 += f[i] * f[i];
            }
            res2.sqrt() / f2.sqrt().max(1e-30)
        } else {
            rel_residual
        };

        // Reverse inclined support rotations on displacements
        for it in &p.inclined_transforms {
            reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
        }

        let displacements = build_displacements_3d(dof_num, &u_full);
        let mut reactions = build_reactions_3d_inclined(
            input, dof_num, &reactions_vec, &f_r, nf, &u_full, &p.inclined_transforms,
        );
        reactions.sort_by_key(|r| r.node_id);
        let mut element_forces = compute_internal_forces_3d_with_loads(input, loads, dof_num, &u_full);
        element_forces.sort_by_key(|ef| ef.element_id);
        let reactions_us = now_micros().saturating_sub(t0);

        let t0 = now_micros();
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full);
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full);
        let stress_recovery_us = now_micros().saturating_sub(t0);

        let total_us = (p.assembly_us + p.conditioning_us + p.symbolic_us + p.numeric_us)
            + now_micros().saturating_sub(t_total);

        let timings = SolveTimings {
            assembly_ms: micros_to_ms(p.assembly_us),
            conditioning_ms: micros_to_ms(p.conditioning_us),
            symbolic_ms: micros_to_ms(p.symbolic_us),
            numeric_ms: micros_to_ms(p.numeric_us),
            solve_ms: micros_to_ms(solve_us),
            residual_ms: micros_to_ms(residual_us),
            dense_fallback_ms: micros_to_ms(dense_fb_us),
            reactions_ms: micros_to_ms(reactions_us),
            stress_recovery_ms: micros_to_ms(stress_recovery_us),
            total_ms: micros_to_ms(total_us),
            n_free: nf,
            nnz_kff: p.nnz_kff,
            nnz_l: p.nnz_l,
            pivot_perturbations: if p.regularized { nf } else { 0 },
            max_perturbation: p.max_perturbation,
        };

        // Build structured diagnostics (enum-based, machine-matchable)
        let mut structured = Vec::new();
        structured.extend(self.pre_solve_diags.iter().cloned());

        // Solver path — report the actual solver that produced the returned result
        if used_residual_fallback {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::SparseFallbackDenseLu,
                Severity::Warning,
                format!("Sparse Cholesky residual too large, fell back to dense LU ({} free DOFs)", nf),
            ).with_phase("solve"));
        } else {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::SparseCholesky,
                Severity::Info,
                format!("Sparse Cholesky solver ({} free DOFs, nnz(L)={})", nf, p.nnz_l),
            ).with_phase("solve"));
        }

        // Sparse fill ratio diagnostic
        let fill_ratio = p.nnz_l as f64 / p.nnz_kff.max(1) as f64;
        structured.push(StructuredDiagnostic::global(
            DiagnosticCode::SparseFillRatio,
            if fill_ratio > 20.0 { Severity::Warning } else { Severity::Info },
            format!("Sparse fill ratio: {:.1}x (nnz(K_ff)={}, nnz(L)={})", fill_ratio, p.nnz_kff, p.nnz_l),
        ).with_value(fill_ratio, 20.0).with_phase("factorization"));

        // Conditioning diagnostics
        if p.cond > 1e12 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExtremelyHighDiagonalRatio,
                Severity::Warning,
                format!("Extremely high diagonal ratio {:.2e} — matrix is likely ill-conditioned", p.cond),
            ).with_value(p.cond, 1e12).with_phase("conditioning"));
        } else if p.cond > 1e8 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::HighDiagonalRatio,
                Severity::Warning,
                format!("High diagonal ratio {:.2e} — potential conditioning issues", p.cond),
            ).with_value(p.cond, 1e8).with_phase("conditioning"));
        }

        // Solver path diagnostic
        if p.regularized {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::DiagonalRegularization,
                Severity::Info,
                format!("Regularized K_ff with diagonal shift {:.2e}", p.max_perturbation),
            ).with_value(p.max_perturbation, 0.0).with_phase("factorization"));
        }

        // Displacement sanity check — translational DOFs only
        let max_disp = dof_num.map.iter()
            .filter(|&(&(_node, local_dof), &global)| local_dof < 3 && global < nf)
            .map(|(&_, &global)| u_f[global].abs())
            .fold(0.0f64, f64::max);
        let char_length = {
            let (mut mn_x, mut mx_x) = (f64::MAX, f64::MIN);
            let (mut mn_y, mut mx_y) = (f64::MAX, f64::MIN);
            let (mut mn_z, mut mx_z) = (f64::MAX, f64::MIN);
            for node in input.nodes.values() {
                mn_x = mn_x.min(node.x); mx_x = mx_x.max(node.x);
                mn_y = mn_y.min(node.y); mx_y = mx_y.max(node.y);
                mn_z = mn_z.min(node.z); mx_z = mx_z.max(node.z);
            }
            ((mx_x - mn_x).powi(2) + (mx_y - mn_y).powi(2) + (mx_z - mn_z).powi(2)).sqrt().max(1.0)
        };
        if max_disp > 1000.0 * char_length {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExcessiveDisplacement,
                Severity::Warning,
                format!(
                    "Maximum displacement {:.2e} exceeds 1000× characteristic length {:.2e} — likely mechanism or instability",
                    max_disp, char_length
                ),
            ).with_value(max_disp, 1000.0 * char_length).with_phase("solve"));
        }

        // Residual diagnostic — describes the returned solution, not any rejected attempt
        let solver_label = if used_residual_fallback { "Dense LU fallback" } else { "Sparse Cholesky" };
        structured.push(if rel_residual < 1e-6 {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualOk,
                Severity::Info,
                format!("{} ({} free DOFs, residual {:.2e})", solver_label, nf, rel_residual),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        } else {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualHigh,
                Severity::Warning,
                format!("{} residual {:.2e} exceeds tolerance", solver_label, rel_residual),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        });

        // Compute equilibrium summary from assembled force vector (includes all load types)
        let equilibrium = compute_equilibrium_summary_3d(&f, &reactions_vec, dof_num, rel_residual, &p.inclined_transforms);

        let mut results = AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses,
            quad_stresses,
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full),
            constraint_forces: vec![],
            diagnostics: p.diagnostics.clone(),
            solver_diagnostics: solver_diags,
            structured_diagnostics: structured,
            equilibrium: Some(equilibrium),
            timings: Some(timings),
            result_summary: None,
            solver_run_meta: Some(SolverRunMeta::new(
                if used_residual_fallback { "sparse_fallback_dense_lu" } else { "sparse_cholesky" },
                nf, self.n_elements, self.n_nodes,
            )),
        };
        results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_3d(&results));
        Ok(results)
    }

    fn solve_loads_sparse_dense_lu(
        &self,
        loads: &[SolverLoad3D],
        p: &SparseDenseLuPrepared3D,
    ) -> Result<AnalysisResults3D, String> {
        let t_total = now_micros();
        let input = &self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);

        // Dense f for the LU right-hand side (matches the old dense fallback),
        // sparse f for reactions/equilibrium/residual (matches the old asm.f usage)
        let f_d = assemble_load_vector_3d_dense(input, loads, dof_num, &p.dense_inclined_transforms);
        let f = super::sparse_assembly::assemble_load_vector_sparse_3d(input, loads, dof_num, &p.inclined_transforms);

        let mut f_work: Vec<f64> = f_d[..nf].to_vec();
        for i in 0..nf { f_work[i] -= p.k_fr_ur[i]; }
        let t0 = now_micros();
        let u_fb = lu_apply(&p.lu, &p.piv, &f_work, nf)
            .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string())?;
        let dense_fb_us = p.dense_fb_us + now_micros().saturating_sub(t0);

        let total_us = (p.assembly_us + p.conditioning_us + p.symbolic_us + p.numeric_us)
            + now_micros().saturating_sub(t_total);
        let timings = SolveTimings {
            assembly_ms: micros_to_ms(p.assembly_us),
            conditioning_ms: micros_to_ms(p.conditioning_us),
            symbolic_ms: micros_to_ms(p.symbolic_us),
            numeric_ms: micros_to_ms(p.numeric_us),
            solve_ms: 0.0,
            residual_ms: 0.0,
            dense_fallback_ms: micros_to_ms(dense_fb_us),
            reactions_ms: 0.0,
            stress_recovery_ms: 0.0,
            total_ms: micros_to_ms(total_us),
            n_free: nf, nnz_kff: p.nnz_kff, nnz_l: p.nnz_l,
            pivot_perturbations: 0, max_perturbation: 0.0,
        };

        // Build full solution
        let mut u_full = vec![0.0; n];
        u_full[..nf].copy_from_slice(&u_fb);
        for i in 0..nr { u_full[nf + i] = self.u_r[i]; }
        let ku_full = p.k_full.sym_mat_vec(&u_full);
        let mut reactions_vec = vec![0.0; nr];
        let f_r: Vec<f64> = f[nf..].to_vec();
        for i in 0..nr { reactions_vec[i] = ku_full[nf + i] - f_r[i]; }
        for it in &p.inclined_transforms {
            reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
        }
        let displacements = build_displacements_3d(dof_num, &u_full);
        let mut reactions = build_reactions_3d_inclined(
            input, dof_num, &reactions_vec, &f_r, nf, &u_full, &p.inclined_transforms,
        );
        reactions.sort_by_key(|r| r.node_id);
        let mut element_forces = compute_internal_forces_3d_with_loads(input, loads, dof_num, &u_full);
        element_forces.sort_by_key(|ef| ef.element_id);
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full);
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full);

        // Compute actual residual: ||K·u − F||_free / ||F||_free
        let rel_residual = {
            let mut res2 = 0.0f64;
            let mut f2 = 0.0f64;
            for i in 0..nf {
                let r = ku_full[i] - f[i];
                res2 += r * r;
                f2 += f[i] * f[i];
            }
            res2.sqrt() / f2.sqrt().max(1e-30)
        };

        let equilibrium = compute_equilibrium_summary_3d(&f, &reactions_vec, dof_num, rel_residual, &p.inclined_transforms);

        // Build structured diagnostics for fallback path
        let mut structured = Vec::new();
        structured.extend(self.pre_solve_diags.iter().cloned());
        structured.push(StructuredDiagnostic::global(
            DiagnosticCode::SparseFallbackDenseLu,
            Severity::Warning,
            format!("Sparse Cholesky failed, fell back to dense LU ({} free DOFs)", nf),
        ).with_phase("solve"));

        // LU fallback stability warning
        structured.push(StructuredDiagnostic::global(
            DiagnosticCode::CholeskyFailedLuFallback,
            Severity::Warning,
            "Cholesky factorization failed — LU fallback succeeded but model may be unstable (not positive-definite)".to_string(),
        ).with_phase("solve"));

        // Displacement sanity check — translational DOFs only
        let max_disp = dof_num.map.iter()
            .filter(|&(&(_node, local_dof), &global)| local_dof < 3 && global < nf)
            .map(|(&_, &global)| u_fb[global].abs())
            .fold(0.0f64, f64::max);
        let char_length = {
            let (mut mn_x, mut mx_x) = (f64::MAX, f64::MIN);
            let (mut mn_y, mut mx_y) = (f64::MAX, f64::MIN);
            let (mut mn_z, mut mx_z) = (f64::MAX, f64::MIN);
            for node in input.nodes.values() {
                mn_x = mn_x.min(node.x); mx_x = mx_x.max(node.x);
                mn_y = mn_y.min(node.y); mx_y = mx_y.max(node.y);
                mn_z = mn_z.min(node.z); mx_z = mx_z.max(node.z);
            }
            ((mx_x - mn_x).powi(2) + (mx_y - mn_y).powi(2) + (mx_z - mn_z).powi(2)).sqrt().max(1.0)
        };
        if max_disp > 1000.0 * char_length {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExcessiveDisplacement,
                Severity::Warning,
                format!(
                    "Maximum displacement {:.2e} exceeds 1000× characteristic length {:.2e} — likely mechanism or instability",
                    max_disp, char_length
                ),
            ).with_value(max_disp, 1000.0 * char_length).with_phase("solve"));
        }

        if p.cond > 1e12 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::ExtremelyHighDiagonalRatio,
                Severity::Warning,
                format!("Extremely high diagonal ratio {:.2e}", p.cond),
            ).with_value(p.cond, 1e12).with_phase("conditioning"));
        } else if p.cond > 1e8 {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::HighDiagonalRatio,
                Severity::Warning,
                format!("High diagonal ratio {:.2e}", p.cond),
            ).with_value(p.cond, 1e8).with_phase("conditioning"));
        }

        // Residual diagnostic with actual computed value
        structured.push(if rel_residual < 1e-6 {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualOk,
                Severity::Info,
                format!("Dense LU fallback ({} free DOFs, residual {:.2e})", nf, rel_residual),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        } else {
            StructuredDiagnostic::global(
                DiagnosticCode::ResidualHigh,
                Severity::Warning,
                format!("Dense LU fallback residual {:.2e} exceeds tolerance", rel_residual),
            ).with_value(rel_residual, 1e-6).with_phase("solve")
        });

        let solver_diags = p.solver_diags_base.clone();

        let mut results = AnalysisResults3D {
            displacements, reactions, element_forces, plate_stresses, quad_stresses,
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full),
            constraint_forces: vec![], diagnostics: p.diagnostics.clone(),
            solver_diagnostics: solver_diags, structured_diagnostics: structured, equilibrium: Some(equilibrium), timings: Some(timings), result_summary: None,
            solver_run_meta: Some(SolverRunMeta::new(
                "sparse_fallback_dense_lu", nf, self.n_elements, self.n_nodes,
            )),
        };
        results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_3d(&results));
        Ok(results)
    }
}

/// Compute diagonal conditioning ratio for a sparse CSC matrix.
/// Returns max(diag) / min(nonzero diag), or 0 if degenerate.
fn sparse_diagonal_conditioning(k: &CscMatrix) -> f64 {
    let n = k.n;
    let mut max_diag = 0.0f64;
    let mut min_nonzero_diag = f64::MAX;

    for j in 0..n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            if k.row_idx[p] == j {
                let d = k.values[p].abs();
                if d > max_diag { max_diag = d; }
                if d > 1e-30 && d < min_nonzero_diag { min_nonzero_diag = d; }
                break;
            }
        }
    }

    if min_nonzero_diag < f64::MAX && min_nonzero_diag > 0.0 {
        max_diag / min_nonzero_diag
    } else {
        0.0
    }
}

pub(crate) fn build_displacements_2d(dof_num: &DofNumbering, u: &[f64]) -> Vec<Displacement> {
    dof_num.node_order.iter().map(|&node_id| {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u[d]).unwrap_or(0.0);
        let uz = dof_num.global_dof(node_id, 1).map(|d| u[d]).unwrap_or(0.0);
        let ry = if dof_num.dofs_per_node >= 3 {
            dof_num.global_dof(node_id, 2).map(|d| u[d]).unwrap_or(0.0)
        } else {
            0.0
        };
        Displacement { node_id, ux, uz, ry }
    }).collect()
}

pub(crate) fn build_displacements_3d(dof_num: &DofNumbering, u: &[f64]) -> Vec<Displacement3D> {
    dof_num.node_order.iter().map(|&node_id| {
        let vals: Vec<f64> = (0..6).map(|i| {
            dof_num.global_dof(node_id, i).map(|d| u[d]).unwrap_or(0.0)
        }).collect();
        let warping = if dof_num.dofs_per_node >= 7 {
            dof_num.global_dof(node_id, 6).map(|d| u[d])
        } else {
            None
        };
        Displacement3D {
            node_id,
            ux: vals[0], uy: vals[1], uz: vals[2],
            rx: vals[3], ry: vals[4], rz: vals[5],
            warping,
        }
    }).collect()
}

pub(crate) fn build_reactions_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    _f_r: &[f64],
    nf: usize,
    u_full: &[f64],
) -> Vec<Reaction> {
    let mut reactions = Vec::new();
    for sup in input.supports.values() {
        let mut rx = 0.0;
        let mut rz = 0.0;
        let mut my = 0.0;

        if sup.support_type == "spring" {
            // Spring reaction: R = -k * u
            let ux = dof_num.global_dof(sup.node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let uz = dof_num.global_dof(sup.node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let ry_disp = if dof_num.dofs_per_node >= 3 {
                dof_num.global_dof(sup.node_id, 2).map(|d| u_full[d]).unwrap_or(0.0)
            } else { 0.0 };

            let kx = sup.kx.unwrap_or(0.0);
            let ky = sup.ky.unwrap_or(0.0);
            let kz = sup.kz.unwrap_or(0.0);

            if let Some(angle) = sup.angle {
                if angle.abs() > 1e-15 && (kx > 0.0 || ky > 0.0) {
                    let s = angle.sin();
                    let c = angle.cos();
                    let k_xx = kx * c * c + ky * s * s;
                    let k_yy = kx * s * s + ky * c * c;
                    let k_xy = (kx - ky) * s * c;
                    rx = -(k_xx * ux + k_xy * uz);
                    rz = -(k_xy * ux + k_yy * uz);
                } else {
                    rx = -kx * ux;
                    rz = -ky * uz;
                }
            } else {
                rx = -kx * ux;
                rz = -ky * uz;
            }
            my = -kz * ry_disp;
        } else {
            // Rigid support: reaction from restrained partition
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                if d >= nf {
                    let idx = d - nf;
                    rx = reactions_vec[idx];
                }
            }
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                if d >= nf {
                    let idx = d - nf;
                    rz = reactions_vec[idx];
                }
            }
            if dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    if d >= nf {
                        let idx = d - nf;
                        my = reactions_vec[idx];
                    }
                }
            }
        }

        reactions.push(Reaction {
            node_id: sup.node_id,
            rx, rz, my,
        });
    }
    reactions
}

fn build_reactions_2d_inclined(
    input: &SolverInput,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    f_r: &[f64],
    nf: usize,
    u_full: &[f64],
    inclined_transforms: &[InclinedTransformData2D],
) -> Vec<Reaction> {
    let mut reactions = build_reactions_2d(input, dof_num, reactions_vec, f_r, nf, u_full);

    // Back-transform inclined support reactions from rotated to global frame
    for it in inclined_transforms {
        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == it.node_id) {
            let rotated = [r.rx, r.rz];
            // r_global = R^T * r_rotated
            r.rx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1];
            r.rz = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1];
        }
    }

    reactions
}

pub(crate) fn build_reactions_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    _f_r: &[f64],
    nf: usize,
    u_full: &[f64],
) -> Vec<Reaction3D> {
    let mut reactions = Vec::new();
    for sup in input.supports.values() {
        let mut vals = [0.0f64; 6];

        // Handle each DOF individually: restrained DOFs from reactions_vec,
        // spring DOFs (free with stiffness) from R = -k * u
        let spring_stiffs = [sup.kx, sup.ky, sup.kz, sup.krx, sup.kry, sup.krz];
        let restrained_flags = [sup.rx, sup.ry, sup.rz, sup.rrx, sup.rry, sup.rrz];
        for i in 0..6.min(dof_num.dofs_per_node) {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                if d >= nf {
                    // Restrained DOF: reaction from solve
                    vals[i] = reactions_vec[d - nf];
                } else if !restrained_flags[i] {
                    // Free DOF: check for spring stiffness
                    let k = spring_stiffs[i].unwrap_or(0.0);
                    if k > 0.0 {
                        vals[i] = -k * u_full[d];
                    }
                }
            }
        }

        // Bimoment reaction at warping DOF 6
        let bimoment = if dof_num.dofs_per_node >= 7 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 6)) {
                if d >= nf {
                    Some(reactions_vec[d - nf])
                } else {
                    let kw = sup.kw.unwrap_or(0.0);
                    if kw > 0.0 {
                        Some(-kw * u_full[d])
                    } else {
                        None
                    }
                }
            } else {
                None
            }
        } else {
            None
        };

        reactions.push(Reaction3D {
            node_id: sup.node_id,
            fx: vals[0], fy: vals[1], fz: vals[2],
            mx: vals[3], my: vals[4], mz: vals[5],
            bimoment,
        });
    }
    reactions
}

/// Build 3D reactions with inclined support back-transformation.
fn build_reactions_3d_inclined(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    f_r: &[f64],
    nf: usize,
    u_full: &[f64],
    inclined_transforms: &[InclinedTransformData],
) -> Vec<Reaction3D> {
    let mut reactions = build_reactions_3d(input, dof_num, reactions_vec, f_r, nf, u_full);

    // Back-transform inclined support reactions from rotated to global frame
    for it in inclined_transforms {
        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == it.node_id) {
            let rotated = [r.fx, r.fy, r.fz];
            // r_global = R^T * r_rotated
            r.fx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1] + it.r[2][0] * rotated[2];
            r.fy = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1] + it.r[2][1] * rotated[2];
            r.fz = it.r[0][2] * rotated[0] + it.r[1][2] * rotated[1] + it.r[2][2] * rotated[2];
        }
    }

    reactions
}

// ── Input validation helpers ──

pub(crate) fn validate_input_2d(input: &SolverInput) -> Result<(), String> {
    let node_ids: std::collections::HashSet<usize> =
        input.nodes.values().map(|n| n.id).collect();
    let mat_ids: std::collections::HashSet<usize> =
        input.materials.values().map(|m| m.id).collect();
    let sec_ids: std::collections::HashSet<usize> =
        input.sections.values().map(|s| s.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        input.elements.values().map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    // 0. Duplicate ID detection
    if node_ids.len() != input.nodes.len() {
        return Err("Duplicate node IDs detected".to_string());
    }
    if elem_ids.len() != input.elements.len() {
        return Err("Duplicate element IDs detected".to_string());
    }
    if mat_ids.len() != input.materials.len() {
        return Err("Duplicate material IDs detected".to_string());
    }
    if sec_ids.len() != input.sections.len() {
        return Err("Duplicate section IDs detected".to_string());
    }

    // 1. Referential integrity — element → node, material, section
    for elem in input.elements.values() {
        if !node_ids.contains(&elem.node_i) {
            return Err(format!("Element {}: node_i {} does not exist", elem.id, elem.node_i));
        }
        if !node_ids.contains(&elem.node_j) {
            return Err(format!("Element {}: node_j {} does not exist", elem.id, elem.node_j));
        }
        if !mat_ids.contains(&elem.material_id) {
            return Err(format!("Element {}: material {} does not exist", elem.id, elem.material_id));
        }
        if !sec_ids.contains(&elem.section_id) {
            return Err(format!("Element {}: section {} does not exist", elem.id, elem.section_id));
        }
        if elem.elem_type != "frame" && elem.elem_type != "truss" && elem.elem_type != "cable" {
            return Err(format!("Element {}: unknown type '{}'", elem.id, elem.elem_type));
        }
    }

    // 2. Referential integrity — support → node
    for sup in input.supports.values() {
        if !node_ids.contains(&sup.node_id) {
            return Err(format!("Support {}: node {} does not exist", sup.id, sup.node_id));
        }
    }

    // 3. Referential integrity — load → node/element, and point-load positions
    validate_loads_2d(input, &input.loads)?;

    // 4. Material properties
    for mat in input.materials.values() {
        if mat.e <= 0.0 {
            return Err(format!("Material {}: E must be > 0 (got {})", mat.id, mat.e));
        }
        if mat.nu <= -1.0 || mat.nu >= 0.5 {
            return Err(format!("Material {}: Poisson ratio must be in (-1, 0.5) (got {})", mat.id, mat.nu));
        }
    }

    // 5. Zero-length elements
    for elem in input.elements.values() {
        let ni = &node_map[&elem.node_i];
        let nj = &node_map[&elem.node_j];
        let dx = nj.x - ni.x;
        let dz = nj.z - ni.z;
        let l = (dx * dx + dz * dz).sqrt();
        if l < 1e-10 {
            return Err(format!("Element {} has zero length", elem.id));
        }
    }

    // 6. Section area <= 0
    for sec in input.sections.values() {
        if sec.a <= 0.0 {
            return Err(format!("Section {}: area A must be > 0", sec.id));
        }
    }

    // 7. Section inertia <= 0 (only for sections used by bending elements)
    let bending_section_ids: std::collections::HashSet<usize> = input.elements.values()
        .filter(|e| e.elem_type == "frame" && !(e.hinge_start && e.hinge_end))
        .map(|e| e.section_id)
        .collect();
    for sec in input.sections.values() {
        if bending_section_ids.contains(&sec.id) && sec.iz <= 0.0 {
            return Err(format!("Section {}: inertia must be > 0", sec.id));
        }
    }

    Ok(())
}

/// Validate load references for 2D (load → node/element integrity and
/// point-load positions). Split from `validate_input_2d` so multi-case solves
/// can validate each case's loads independently of the structure.
pub(crate) fn validate_loads_2d(input: &SolverInput, loads: &[SolverLoad]) -> Result<(), String> {
    let node_ids: std::collections::HashSet<usize> =
        input.nodes.values().map(|n| n.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        input.elements.values().map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    // Referential integrity — load → node/element
    for load in loads {
        match load {
            SolverLoad::Nodal(l) => {
                if !node_ids.contains(&l.node_id) {
                    return Err(format!("Nodal load: node {} does not exist", l.node_id));
                }
            }
            SolverLoad::Distributed(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Distributed load: element {} does not exist", l.element_id));
                }
            }
            SolverLoad::PointOnElement(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Point load: element {} does not exist", l.element_id));
                }
            }
            SolverLoad::Thermal(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Thermal load: element {} does not exist", l.element_id));
                }
            }
        }
    }

    // Point load position validation
    for load in loads {
        if let SolverLoad::PointOnElement(pl) = load {
            if let Some(elem) = input.elements.values().find(|e| e.id == pl.element_id) {
                let ni = &node_map[&elem.node_i];
                let nj = &node_map[&elem.node_j];
                let dx = nj.x - ni.x;
                let dz = nj.z - ni.z;
                let l = (dx * dx + dz * dz).sqrt();
                if pl.a < -1e-10 || pl.a > l + 1e-10 {
                    return Err(format!(
                        "Element {}: point load position a={:.4} out of range [0, L={:.4}]",
                        elem.id, pl.a, l
                    ));
                }
            }
        }
    }

    Ok(())
}

pub(crate) fn validate_input_3d(input: &SolverInput3D) -> Result<(), String> {
    let node_ids: std::collections::HashSet<usize> =
        input.nodes.values().map(|n| n.id).collect();
    let mat_ids: std::collections::HashSet<usize> =
        input.materials.values().map(|m| m.id).collect();
    let sec_ids: std::collections::HashSet<usize> =
        input.sections.values().map(|s| s.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        input.elements.values().map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    // 0. Duplicate ID detection
    if node_ids.len() != input.nodes.len() {
        return Err("Duplicate node IDs detected".to_string());
    }
    if elem_ids.len() != input.elements.len() {
        return Err("Duplicate element IDs detected".to_string());
    }
    if mat_ids.len() != input.materials.len() {
        return Err("Duplicate material IDs detected".to_string());
    }
    if sec_ids.len() != input.sections.len() {
        return Err("Duplicate section IDs detected".to_string());
    }

    // 1. Referential integrity — element → node, material, section
    for elem in input.elements.values() {
        if !node_ids.contains(&elem.node_i) {
            return Err(format!("Element {}: node_i {} does not exist", elem.id, elem.node_i));
        }
        if !node_ids.contains(&elem.node_j) {
            return Err(format!("Element {}: node_j {} does not exist", elem.id, elem.node_j));
        }
        if !mat_ids.contains(&elem.material_id) {
            return Err(format!("Element {}: material {} does not exist", elem.id, elem.material_id));
        }
        if !sec_ids.contains(&elem.section_id) {
            return Err(format!("Element {}: section {} does not exist", elem.id, elem.section_id));
        }
        if elem.elem_type != "frame" && elem.elem_type != "truss" && elem.elem_type != "cable" {
            return Err(format!("Element {}: unknown type '{}'", elem.id, elem.elem_type));
        }
    }

    // 2. Referential integrity — support → node
    for sup in input.supports.values() {
        if !node_ids.contains(&sup.node_id) {
            return Err(format!("Support on node {}: node does not exist", sup.node_id));
        }
    }

    // 3. Referential integrity — load → node/element, and point-load positions
    validate_loads_3d(input, &input.loads)?;

    // 4. Material properties
    for mat in input.materials.values() {
        if mat.e <= 0.0 {
            return Err(format!("Material {}: E must be > 0 (got {})", mat.id, mat.e));
        }
        if mat.nu <= -1.0 || mat.nu >= 0.5 {
            return Err(format!("Material {}: Poisson ratio must be in (-1, 0.5) (got {})", mat.id, mat.nu));
        }
    }

    // 5. Zero-length elements
    for elem in input.elements.values() {
        let ni = &node_map[&elem.node_i];
        let nj = &node_map[&elem.node_j];
        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let dz = nj.z - ni.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        if l < 1e-10 {
            return Err(format!("Element {} has zero length", elem.id));
        }
    }

    // 6. Section area <= 0
    for sec in input.sections.values() {
        if sec.a <= 0.0 {
            return Err(format!("Section {}: area A must be > 0", sec.id));
        }
    }

    // 7. Section inertia <= 0 (only for sections used by bending elements)
    // A frame with all bending+torsion released at both ends is axial-only.
    let bending_section_ids: std::collections::HashSet<usize> = input.elements.values()
        .filter(|e| {
            if e.elem_type != "frame" { return false; }
            let all_released = e.release_my_start && e.release_my_end
                && e.release_mz_start && e.release_mz_end
                && e.release_t_start && e.release_t_end;
            !all_released
        })
        .map(|e| e.section_id)
        .collect();
    for sec in input.sections.values() {
        if bending_section_ids.contains(&sec.id) && (sec.iy <= 0.0 || sec.iz <= 0.0) {
            return Err(format!("Section {}: inertia must be > 0", sec.id));
        }
    }

    Ok(())
}

/// Validate load references for 3D (load → node/element integrity and
/// point-load positions). Split from `validate_input_3d` so multi-case solves
/// can validate each case's loads independently of the structure.
pub(crate) fn validate_loads_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Result<(), String> {
    let node_ids: std::collections::HashSet<usize> =
        input.nodes.values().map(|n| n.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        input.elements.values().map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();

    // Referential integrity — load → node/element (check nodal and element-based loads)
    for load in loads {
        match load {
            SolverLoad3D::Nodal(l) => {
                if !node_ids.contains(&l.node_id) {
                    return Err(format!("Nodal load: node {} does not exist", l.node_id));
                }
            }
            SolverLoad3D::Distributed(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Distributed load: element {} does not exist", l.element_id));
                }
            }
            SolverLoad3D::PointOnElement(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Point load: element {} does not exist", l.element_id));
                }
            }
            SolverLoad3D::Thermal(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Thermal load: element {} does not exist", l.element_id));
                }
            }
            SolverLoad3D::Bimoment(l) => {
                if !node_ids.contains(&l.node_id) {
                    return Err(format!("Bimoment load: node {} does not exist", l.node_id));
                }
            }
            // Shell/plate/quad loads — validated below with their respective element maps
            _ => {}
        }
    }

    // Shell/plate/quad load referential integrity
    let plate_ids: std::collections::HashSet<usize> = input.plates.values().map(|p| p.id).collect();
    let quad_ids: std::collections::HashSet<usize> = input.quads.values().map(|q| q.id).collect();
    let quad9_ids: std::collections::HashSet<usize> = input.quad9s.values().map(|q| q.id).collect();
    let solid_shell_ids: std::collections::HashSet<usize> = input.solid_shells.values().map(|s| s.id).collect();
    let curved_shell_ids: std::collections::HashSet<usize> = input.curved_shells.values().map(|c| c.id).collect();
    for load in loads {
        let (kind, eid) = match load {
            SolverLoad3D::Pressure(l) => ("Plate pressure", l.element_id),
            SolverLoad3D::PlateThermal(l) => ("Plate thermal", l.element_id),
            SolverLoad3D::QuadPressure(l) => ("Quad pressure", l.element_id),
            SolverLoad3D::QuadThermal(l) => ("Quad thermal", l.element_id),
            SolverLoad3D::QuadEdge(l) => ("Quad edge", l.element_id),
            SolverLoad3D::QuadSelfWeight(l) => ("Quad self-weight", l.element_id),
            SolverLoad3D::Quad9Pressure(l) => ("Quad9 pressure", l.element_id),
            SolverLoad3D::Quad9Thermal(l) => ("Quad9 thermal", l.element_id),
            SolverLoad3D::Quad9Edge(l) => ("Quad9 edge", l.element_id),
            SolverLoad3D::Quad9SelfWeight(l) => ("Quad9 self-weight", l.element_id),
            SolverLoad3D::SolidShellPressure(l) => ("Solid shell pressure", l.element_id),
            SolverLoad3D::SolidShellSelfWeight(l) => ("Solid shell self-weight", l.element_id),
            SolverLoad3D::CurvedShellPressure(l) => ("Curved shell pressure", l.element_id),
            SolverLoad3D::CurvedShellThermal(l) => ("Curved shell thermal", l.element_id),
            SolverLoad3D::CurvedShellEdge(l) => ("Curved shell edge", l.element_id),
            _ => continue,
        };
        let found = plate_ids.contains(&eid)
            || quad_ids.contains(&eid)
            || quad9_ids.contains(&eid)
            || solid_shell_ids.contains(&eid)
            || curved_shell_ids.contains(&eid);
        if !found {
            return Err(format!("{} load: element {} does not exist", kind, eid));
        }
    }

    // Point load position validation
    for load in loads {
        if let SolverLoad3D::PointOnElement(pl) = load {
            if let Some(elem) = input.elements.values().find(|e| e.id == pl.element_id) {
                let ni = &node_map[&elem.node_i];
                let nj = &node_map[&elem.node_j];
                let dx = nj.x - ni.x;
                let dy = nj.y - ni.y;
                let dz = nj.z - ni.z;
                let l = (dx * dx + dy * dy + dz * dz).sqrt();
                if pl.a < -1e-10 || pl.a > l + 1e-10 {
                    return Err(format!(
                        "Element {}: point load position a={:.4} out of range [0, L={:.4}]",
                        elem.id, pl.a, l
                    ));
                }
            }
        }
    }

    Ok(())
}

pub(crate) fn compute_internal_forces_2d(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces> {
    compute_internal_forces_2d_with_loads(input, &input.loads, dof_num, u)
}

/// `compute_internal_forces_2d` with the load set given explicitly, so
/// multi-case solves can reuse one structure with per-case loads.
pub(crate) fn compute_internal_forces_2d_with_loads(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces> {
    let mut forces = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss: compute axial force from deformation
            let ui = [
                dof_num.global_dof(elem.node_i, 0).map(|d| u[d]).unwrap_or(0.0),
                dof_num.global_dof(elem.node_i, 1).map(|d| u[d]).unwrap_or(0.0),
            ];
            let uj = [
                dof_num.global_dof(elem.node_j, 0).map(|d| u[d]).unwrap_or(0.0),
                dof_num.global_dof(elem.node_j, 1).map(|d| u[d]).unwrap_or(0.0),
            ];
            let delta = (uj[0] - ui[0]) * cos + (uj[1] - ui[1]) * sin;
            let mut n_axial = e * sec.a / l * delta;

            // Subtract thermal FEF for truss: f = K*u - FEF (matches 3D truss path)
            for load in loads {
                if let SolverLoad::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6;
                        n_axial -= e * sec.a * alpha * tl.dt_uniform;
                    }
                }
            }

            forces.push(ElementForces {
                element_id: elem.id,
                n_start: n_axial,
                n_end: n_axial,
                v_start: 0.0,
                v_end: 0.0,
                m_start: 0.0,
                m_end: 0.0,
                length: l,
                q_i: 0.0,
                q_j: 0.0,
                point_loads: Vec::new(),
                distributed_loads: Vec::new(),
                hinge_start: false,
                hinge_end: false,
            });
        } else {
            // Frame: transform displacements to local, compute k*u - FEF
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();

            let t = crate::element::frame_transform_2d(cos, sin);
            let u_local = transform_displacement(&u_global, &t, 6);

            let phi = if let Some(as_y) = sec.as_y {
                let g = e / (2.0 * (1.0 + mat.nu));
                12.0 * e * sec.iz / (g * as_y * l * l)
            } else {
                0.0
            };
            let k_local = crate::element::frame_local_stiffness_2d(
                e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi,
            );

            // f_local = K_local * u_local
            let mut f_local = vec![0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_local[i] += k_local[i * 6 + j] * u_local[j];
                }
            }

            // Subtract fixed-end forces from element loads (f = K*u - FEF)
            let (mut total_qi, mut total_qj) = (0.0, 0.0);
            let mut point_loads_info = Vec::new();
            let mut dist_loads_info = Vec::new();

            for load in loads {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a = dl.a.unwrap_or(0.0);
                        let b = dl.b.unwrap_or(l);
                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                        let mut fef = if is_full {
                            crate::element::fef_distributed_2d(dl.q_i, dl.q_j, l)
                        } else {
                            crate::element::fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l)
                        };

                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);

                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }

                        if is_full {
                            total_qi += dl.q_i;
                            total_qj += dl.q_j;
                        }
                        dist_loads_info.push(DistributedLoadInfo {
                            q_i: dl.q_i,
                            q_j: dl.q_j,
                            a,
                            b,
                        });
                    }
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        let px = pl.px.unwrap_or(0.0);
                        let mz = pl.my.unwrap_or(0.0);
                        let mut fef = crate::element::fef_point_load_2d(pl.p, px, mz, pl.a, l);
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
                        point_loads_info.push(PointLoadInfo {
                            a: pl.a,
                            p: pl.p,
                            px: pl.px,
                            my: pl.my,
                        });
                    }
                    SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                        let alpha = 12e-6;
                        let h = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                        let mut fef = crate::element::fef_thermal_2d(
                            e, sec.a, sec.iz, l,
                            tl.dt_uniform, tl.dt_gradient, alpha, h,
                        );
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, 0.0);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
                    }
                    _ => {}
                }
            }

            // Sign convention: internal forces from member perspective
            forces.push(ElementForces {
                element_id: elem.id,
                n_start: -f_local[0],
                n_end: f_local[3],
                v_start: f_local[1],
                v_end: -f_local[4],
                m_start: f_local[2],
                m_end: -f_local[5],
                length: l,
                q_i: total_qi,
                q_j: total_qj,
                point_loads: point_loads_info,
                distributed_loads: dist_loads_info,
                hinge_start: elem.hinge_start,
                hinge_end: elem.hinge_end,
            });
        }
    }

    forces
}

pub(crate) fn compute_internal_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces3D> {
    compute_internal_forces_3d_with_loads(input, &input.loads, dof_num, u)
}

/// `compute_internal_forces_3d` with the load set given explicitly, so
/// multi-case solves can reuse one structure with per-case loads.
pub(crate) fn compute_internal_forces_3d_with_loads(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces3D> {
    let mut forces = Vec::new();
    let left_hand = input.left_hand.unwrap_or(false);

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_map[&elem.node_i];
        let node_j = node_map[&elem.node_j];
        let mat = mat_map[&elem.material_id];
        let sec = sec_map[&elem.section_id];

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
            let mut n_axial = e * sec.a / l * delta;

            // Subtract thermal FEF for truss: f = K*u - FEF
            // Local thermal FEF at node I (axial) = -EAαΔT, at node J = +EAαΔT
            // f_local_axial = EA/L * delta - (-EAαΔT) = EA/L * delta + EAαΔT
            // n = -f_local_axial (sign convention) → n = -(EA/L * delta + EAαΔT)
            // Equivalently: subtract EAαΔT from n_axial before the sign convention is applied
            for load in loads {
                if let SolverLoad3D::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        let alpha = 12e-6;
                        n_axial -= e * sec.a * alpha * tl.dt_uniform;
                    }
                }
            }

            forces.push(ElementForces3D {
                element_id: elem.id, length: l,
                n_start: n_axial, n_end: n_axial,
                vy_start: 0.0, vy_end: 0.0,
                vz_start: 0.0, vz_end: 0.0,
                mx_start: 0.0, mx_end: 0.0,
                my_start: 0.0, my_end: 0.0,
                mz_start: 0.0, mz_end: 0.0,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
                q_yi: 0.0, q_yj: 0.0,
                distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
                q_zi: 0.0, q_zj: 0.0,
                distributed_loads_z: Vec::new(), point_loads_z: Vec::new(), bimoment_start: None, bimoment_end: None });
            continue;
        }

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);

        let (ex, ey, ez) = element::compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle,
            left_hand,
        );

        // Compute Timoshenko shear parameters for each bending plane
        let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
            let l2 = l * l;
            let py = sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0);
            let pz = sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0);
            (py, pz)
        } else {
            (0.0, 0.0)
        };

        // Determine element size and compute f_local
        let (f_local, ndof_elem) = if has_cw && dof_num.dofs_per_node >= 7 {
            // Warping element: 14×14
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
            let t = element::frame_transform_3d_warping(&ex, &ey, &ez);
            let u_local = transform_displacement(&u_global, &t, 14);
            let k_local = element::frame_local_stiffness_3d_warping(
                e, sec.a, sec.iy, sec.iz, sec.j, sec.cw.unwrap(), l, g,
                element::Hinge3D::from_elem(elem), phi_y, phi_z,
            );
            let mut fl = vec![0.0; 14];
            for i in 0..14 {
                for j in 0..14 {
                    fl[i] += k_local[i * 14 + j] * u_local[j];
                }
            }
            (fl, 14)
        } else if dof_num.dofs_per_node >= 7 {
            // Non-warping element in warping model: extract 12 DOFs via map
            let u12: Vec<f64> = DOF_MAP_12_TO_14.iter().map(|&idx| {
                let d = elem_dofs[idx];
                u[d]
            }).collect();
            let t = element::frame_transform_3d(&ex, &ey, &ez);
            let u_local = transform_displacement(&u12, &t, 12);
            let k_local = element::frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                element::Hinge3D::from_elem(elem), phi_y, phi_z,
            );
            let mut fl = vec![0.0; 12];
            for i in 0..12 {
                for j in 0..12 {
                    fl[i] += k_local[i * 12 + j] * u_local[j];
                }
            }
            (fl, 12)
        } else {
            // Standard 12-DOF
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();
            let t = element::frame_transform_3d(&ex, &ey, &ez);
            let u_local = transform_displacement(&u_global, &t, 12);
            let k_local = element::frame_local_stiffness_3d(
                e, sec.a, sec.iy, sec.iz, sec.j, l, g,
                element::Hinge3D::from_elem(elem), phi_y, phi_z,
            );
            let mut fl = vec![0.0; 12];
            for i in 0..12 {
                for j in 0..12 {
                    fl[i] += k_local[i * 12 + j] * u_local[j];
                }
            }
            (fl, 12)
        };

        let mut f_local = f_local;

        // Map indices for force extraction (warping uses different layout)
        // 14-DOF: [u1,v1,w1,θx1,θy1,θz1,φ'1, u2,v2,w2,θx2,θy2,θz2,φ'2]
        // 12-DOF: [u1,v1,w1,θx1,θy1,θz1, u2,v2,w2,θx2,θy2,θz2]
        let (i_n, i_vy, i_vz, i_mx, i_my, i_mz) = if ndof_elem == 14 {
            (0, 1, 2, 3, 4, 5)
        } else {
            (0, 1, 2, 3, 4, 5)
        };
        let (j_n, j_vy, j_vz, j_mx, j_my, j_mz) = if ndof_elem == 14 {
            (7, 8, 9, 10, 11, 12)
        } else {
            (6, 7, 8, 9, 10, 11)
        };

        // Subtract FEF from element loads (f = K*u - FEF)
        let (mut q_yi_total, mut q_yj_total) = (0.0, 0.0);
        let (mut q_zi_total, mut q_zj_total) = (0.0, 0.0);
        let mut dist_loads_y = Vec::new();
        let mut dist_loads_z = Vec::new();
        let mut pt_loads_y = Vec::new();
        let mut pt_loads_z = Vec::new();

        for load in loads {
            match load {
                SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                    let a_param = dl.a.unwrap_or(0.0);
                    let b_param = dl.b.unwrap_or(l);
                    let is_full_fef = (a_param.abs() < 1e-12) && ((b_param - l).abs() < 1e-12);
                    let mut fef12 = if is_full_fef {
                        element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l)
                    } else {
                        element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a_param, b_param, l)
                    };
                    element::adjust_fef_for_hinges_3d(&mut fef12, l, element::Hinge3D::from_elem(elem), phi_y, phi_z);
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 {
                            f_local[i] -= fef14[i];
                        }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }
                    let a = dl.a.unwrap_or(0.0);
                    let b = dl.b.unwrap_or(l);
                    let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);
                    if is_full {
                        q_yi_total += dl.q_yi;
                        q_yj_total += dl.q_yj;
                        q_zi_total += dl.q_zi;
                        q_zj_total += dl.q_zj;
                    }
                    dist_loads_y.push(DistributedLoadInfo { q_i: dl.q_yi, q_j: dl.q_yj, a, b });
                    dist_loads_z.push(DistributedLoadInfo { q_i: dl.q_zi, q_j: dl.q_zj, a, b });
                }
                SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                    let fef_y = element::fef_point_load_2d(pl.py, 0.0, 0.0, pl.a, l);
                    let fef_z = element::fef_point_load_2d(pl.pz, 0.0, 0.0, pl.a, l);
                    let mut fef12 = [0.0; 12];
                    fef12[1] = fef_y[1]; fef12[5] = fef_y[2];
                    fef12[7] = fef_y[4]; fef12[11] = fef_y[5];
                    fef12[2] = fef_z[1]; fef12[4] = -fef_z[2];
                    fef12[8] = fef_z[4]; fef12[10] = -fef_z[5];
                    element::adjust_fef_for_hinges_3d(&mut fef12, l, element::Hinge3D::from_elem(elem), phi_y, phi_z);
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 { f_local[i] -= fef14[i]; }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }

                    pt_loads_y.push(PointLoadInfo3D { a: pl.a, p: pl.py });
                    pt_loads_z.push(PointLoadInfo3D { a: pl.a, p: pl.pz });
                }
                SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                    let alpha = 12e-6;
                    let hy = if sec.a > 1e-15 { (12.0 * sec.iz / sec.a).sqrt() } else { 0.1 };
                    let hz = if sec.a > 1e-15 { (12.0 * sec.iy / sec.a).sqrt() } else { 0.1 };
                    let mut fef12 = element::fef_thermal_3d(
                        e, sec.a, sec.iy, sec.iz, l,
                        tl.dt_uniform, tl.dt_gradient_y, tl.dt_gradient_z,
                        alpha, hy, hz,
                    );
                    element::adjust_fef_for_hinges_3d(&mut fef12, l, element::Hinge3D::from_elem(elem), phi_y, phi_z);
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 {
                            f_local[i] -= fef14[i];
                        }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }
                }
                _ => {}
            }
        }

        let bimoment_start = if ndof_elem == 14 { Some(-f_local[6]) } else { None };
        let bimoment_end = if ndof_elem == 14 { Some(f_local[13]) } else { None };

        forces.push(ElementForces3D {
            element_id: elem.id,
            length: l,
            n_start: -f_local[i_n],
            n_end: f_local[j_n],
            vy_start: f_local[i_vy],
            vy_end: -f_local[j_vy],
            vz_start: f_local[i_vz],
            vz_end: -f_local[j_vz],
            mx_start: f_local[i_mx],
            mx_end: -f_local[j_mx],
            my_start: f_local[i_my],
            my_end: -f_local[j_my],
            mz_start: f_local[i_mz],
            mz_end: -f_local[j_mz],
            release_my_start: elem.release_my_start,
            release_my_end: elem.release_my_end,
            release_mz_start: elem.release_mz_start,
            release_mz_end: elem.release_mz_end,
            release_t_start: elem.release_t_start,
            release_t_end: elem.release_t_end,
            q_yi: q_yi_total,
            q_yj: q_yj_total,
            distributed_loads_y: dist_loads_y,
            point_loads_y: pt_loads_y,
            q_zi: q_zi_total,
            q_zj: q_zj_total,
            distributed_loads_z: dist_loads_z,
            point_loads_z: pt_loads_z,
            bimoment_start,
            bimoment_end,
        });
    }

    forces
}

/// Expand curved beams into frame elements before solving.
/// Clones input, adds intermediate nodes and frame elements.
fn expand_curved_beams_3d(input: &SolverInput3D) -> SolverInput3D {
    if input.curved_beams.is_empty() {
        return input.clone();
    }

    let mut result = input.clone();

    // Find next available node and element IDs
    let mut next_node_id = result.nodes.values().map(|n| n.id).max().unwrap_or(0) + 1;
    let mut next_elem_id = result.elements.values().map(|e| e.id).max().unwrap_or(0) + 1;

    let cb_node_map: std::collections::HashMap<usize, SolverNode3D> =
        result.nodes.values().map(|n| (n.id, n.clone())).collect();

    for cb in &input.curved_beams {
        let n_start = cb_node_map[&cb.node_start].clone();
        let n_mid = cb_node_map[&cb.node_mid].clone();
        let n_end = cb_node_map[&cb.node_end].clone();

        let expansion = crate::element::expand_curved_beam(
            cb,
            [n_start.x, n_start.y, n_start.z],
            [n_mid.x, n_mid.y, n_mid.z],
            [n_end.x, n_end.y, n_end.z],
            next_node_id,
            next_elem_id,
        );

        // Snap the mid-arc node into the element chain: find the intermediate node
        // closest to node_mid and replace its ID with node_mid's ID. This ensures
        // loads/supports on node_mid work correctly after expansion.
        let mid_id = cb.node_mid;
        let mid_pos = [n_mid.x, n_mid.y, n_mid.z];
        let mut snap_from: Option<usize> = None;
        let mut snap_dist = f64::MAX;
        // Only snap if mid-node is not already a start/end node
        if mid_id != cb.node_start && mid_id != cb.node_end {
            for &(nid, x, y, z) in &expansion.new_nodes {
                let d = ((x - mid_pos[0]).powi(2) + (y - mid_pos[1]).powi(2) + (z - mid_pos[2]).powi(2)).sqrt();
                if d < snap_dist {
                    snap_dist = d;
                    snap_from = Some(nid);
                }
            }
        }

        // Add intermediate nodes (replacing the snapped node's ID with mid_id)
        for &(nid, x, y, z) in &expansion.new_nodes {
            let actual_id = if snap_from == Some(nid) { mid_id } else { nid };
            if actual_id != mid_id {
                // Don't re-insert mid_id since it's already in the map
                result.nodes.insert(actual_id.to_string(), SolverNode3D { id: actual_id, x, y, z });
            }
            if nid >= next_node_id {
                next_node_id = nid + 1;
            }
        }

        // Add frame elements (remapping snapped node ID)
        for &(eid, ni, nj, mat_id, sec_id, hs, he) in &expansion.new_elements {
            let actual_ni = if snap_from == Some(ni) { mid_id } else { ni };
            let actual_nj = if snap_from == Some(nj) { mid_id } else { nj };
            result.elements.insert(eid.to_string(), SolverElement3D {
                id: eid,
                elem_type: "frame".to_string(),
                node_i: actual_ni,
                node_j: actual_nj,
                material_id: mat_id,
                section_id: sec_id,
                release_my_start: hs,
                release_my_end: he,
                release_mz_start: hs,
                release_mz_end: he,
                release_t_start: false,
                release_t_end: false,
                local_yx: None,
                local_yy: None,
                local_yz: None,
                roll_angle: None,
            });
            if eid >= next_elem_id {
                next_elem_id = eid + 1;
            }
        }
    }

    result
}

/// Compute plate stresses for all plate elements.
pub(crate) fn compute_plate_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<PlateStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();

    for plate in input.plates.values() {
        let mat = mat_map[&plate.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = node_map[&plate.nodes[0]];
        let n1 = node_map[&plate.nodes[1]];
        let n2 = node_map[&plate.nodes[2]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
        ];

        // Get global displacements for plate nodes
        let plate_dofs = dof_num.plate_element_dofs(&plate.nodes);
        let u_global: Vec<f64> = plate_dofs.iter().map(|&d| u[d]).collect();

        // Transform to local
        let t_plate = crate::element::plate_transform_3d(&coords);
        let u_local = crate::linalg::transform_displacement(&u_global, &t_plate, 18);

        // Recover stresses at centroid
        let s = crate::element::plate_stress_recovery(&coords, e, nu, plate.thickness, &u_local);

        // Also recover nodal stresses for stress smoothing
        let nodal = crate::element::plate_stress_at_nodes(&coords, e, nu, plate.thickness, &u_local);
        let nodal_vm: Vec<f64> = nodal.iter().map(|ns| ns.von_mises).collect();

        stresses.push(PlateStress {
            element_id: plate.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            sigma_1: s.sigma_1,
            sigma_2: s.sigma_2,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    stresses
}

pub(crate) fn compute_quad_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<QuadStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();

    for quad in input.quads.values() {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let u_global: Vec<f64> = quad_dofs.iter().map(|&d| u[d]).collect();

        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let u_local_vec = crate::linalg::transform_displacement(&u_global, &t_quad, 24);
        let mut u_local = [0.0; 24];
        u_local.copy_from_slice(&u_local_vec);

        let s = crate::element::quad::quad_stresses(&coords, &u_local, e, nu, quad.thickness);

        // Nodal stresses at 4 Gauss-extrapolated points
        let nodal_vm = crate::element::quad::quad_nodal_von_mises(&coords, &u_local, e, nu, quad.thickness);

        stresses.push(QuadStress {
            element_id: quad.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    // Quad9 (MITC9) stress recovery
    for q9 in input.quad9s.values() {
        let mat = mat_map[&q9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let mut coords = [[0.0; 3]; 9];
        for (i, &nid) in q9.nodes.iter().enumerate() {
            let n = node_map[&nid];
            coords[i] = [n.x, n.y, n.z];
        }
        let q9_dofs = dof_num.quad9_element_dofs(&q9.nodes);
        let u_global: Vec<f64> = q9_dofs.iter().map(|&d| u[d]).collect();
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let u_local_vec = crate::linalg::transform_displacement(&u_global, &t_q9, 54);
        let s = crate::element::quad9::quad9_stresses(&coords, &u_local_vec, e, nu, q9.thickness);
        let nodal_vm = crate::element::quad9::quad9_nodal_von_mises(&coords, &u_local_vec, e, nu, q9.thickness);
        stresses.push(QuadStress {
            element_id: q9.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    // Solid-shell stress recovery
    for ss in input.solid_shells.values() {
        let mat = mat_map[&ss.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let mut coords = [[0.0; 3]; 8];
        for (i, &nid) in ss.nodes.iter().enumerate() {
            let n = node_map[&nid];
            coords[i] = [n.x, n.y, n.z];
        }
        let ss_dofs = dof_num.solid_shell_element_dofs(&ss.nodes);
        let u_elem: Vec<f64> = ss_dofs.iter().map(|&d| u[d]).collect();
        let s = crate::element::solid_shell::solid_shell_stresses(&coords, &u_elem, e, nu);
        let nodal_vm = crate::element::solid_shell::solid_shell_nodal_von_mises(&coords, &u_elem, e, nu);
        stresses.push(QuadStress {
            element_id: ss.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    // Curved shell stress recovery (degenerated continuum — global displacements used directly)
    for cs in input.curved_shells.values() {
        let mat = mat_map[&cs.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let mut coords = [[0.0; 3]; 4];
        for (i, &nid) in cs.nodes.iter().enumerate() {
            let n = node_map[&nid];
            coords[i] = [n.x, n.y, n.z];
        }
        let dirs = cs.normals.unwrap_or_else(|| crate::element::curved_shell::compute_element_directors(&coords));
        let cs_dofs = dof_num.quad_element_dofs(&cs.nodes);
        let u_elem: Vec<f64> = cs_dofs.iter().map(|&d| u[d]).collect();
        let mut u_arr = [0.0; 24];
        u_arr.copy_from_slice(&u_elem);
        let s = crate::element::curved_shell::curved_shell_stresses(&coords, &dirs, &u_arr, e, nu, cs.thickness);
        let nodal_vm = crate::element::curved_shell::curved_shell_nodal_von_mises(&coords, &dirs, &u_arr, e, nu, cs.thickness);
        stresses.push(QuadStress {
            element_id: cs.id,
            sigma_xx: s.sigma_xx,
            sigma_yy: s.sigma_yy,
            tau_xy: s.tau_xy,
            mx: s.mx,
            my: s.my,
            mxy: s.mxy,
            von_mises: s.von_mises,
            nodal_von_mises: nodal_vm,
        });
    }

    stresses
}

pub(crate) fn compute_quad_nodal_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<QuadNodalStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();

    for quad in input.quads.values() {
        let mat = mat_map[&quad.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;

        let n0 = node_map[&quad.nodes[0]];
        let n1 = node_map[&quad.nodes[1]];
        let n2 = node_map[&quad.nodes[2]];
        let n3 = node_map[&quad.nodes[3]];
        let coords = [
            [n0.x, n0.y, n0.z],
            [n1.x, n1.y, n1.z],
            [n2.x, n2.y, n2.z],
            [n3.x, n3.y, n3.z],
        ];

        let quad_dofs = dof_num.quad_element_dofs(&quad.nodes);
        let u_global: Vec<f64> = quad_dofs.iter().map(|&d| u[d]).collect();

        let t_quad = crate::element::quad::quad_transform_3d(&coords);
        let u_local_vec = crate::linalg::transform_displacement(&u_global, &t_quad, 24);
        let mut u_local = [0.0; 24];
        u_local.copy_from_slice(&u_local_vec);

        let nodal = crate::element::quad::quad_stress_at_nodes(&coords, &u_local, e, nu, quad.thickness);
        for mut ns in nodal {
            ns.node_index = quad.nodes[ns.node_index];
            stresses.push(ns);
        }
    }

    // Quad9 (MITC9) nodal stress recovery
    for q9 in input.quad9s.values() {
        let mat = mat_map[&q9.material_id];
        let e = mat.e * 1000.0;
        let nu = mat.nu;
        let mut coords = [[0.0; 3]; 9];
        for (i, &nid) in q9.nodes.iter().enumerate() {
            let n = node_map[&nid];
            coords[i] = [n.x, n.y, n.z];
        }
        let q9_dofs = dof_num.quad9_element_dofs(&q9.nodes);
        let u_global: Vec<f64> = q9_dofs.iter().map(|&d| u[d]).collect();
        let t_q9 = crate::element::quad9::quad9_transform_3d(&coords);
        let u_local_vec = crate::linalg::transform_displacement(&u_global, &t_q9, 54);
        let nodal = crate::element::quad9::quad9_stress_at_nodes(&coords, &u_local_vec, e, nu, q9.thickness);
        for mut ns in nodal {
            ns.node_index = q9.nodes[ns.node_index];
            stresses.push(ns);
        }
    }

    stresses
}

// ==================== Equilibrium Summary ====================

/// Compute equilibrium summary for 3D from the assembled force vector.
///
/// Uses `assembled_f` and `reactions_vec` (the raw restrained-DOF reaction vector)
/// with the DOF map to compute per-direction sums. This avoids double-counting
/// from duplicate support entries.
///
/// When inclined supports are present, the reactions in `reactions_vec` are in the
/// rotated local frame. The `inclined_transforms` are used to back-transform each
/// inclined node's reaction contributions to global axes before summing.
pub(super) fn compute_equilibrium_summary_3d(
    assembled_f: &[f64],
    reactions_vec: &[f64],
    dof_num: &DofNumbering,
    rel_residual: f64,
    inclined_transforms: &[InclinedTransformData],
) -> EquilibriumSummary {
    let nf = dof_num.n_free;

    // Sum applied forces and reactions by physical direction using DOF map.
    // For inclined supports, we first accumulate per-node reaction vectors in
    // the rotated frame, then back-transform to global before adding to the sum.
    let mut applied = [0.0f64; 6];
    let mut rxn = [0.0f64; 6];

    // Collect per-node rotated reaction vectors for inclined support nodes
    let mut inclined_node_rxn: std::collections::HashMap<usize, [f64; 3]> =
        std::collections::HashMap::new();
    for it in inclined_transforms {
        inclined_node_rxn.insert(it.node_id, [0.0; 3]);
    }

    for (&(node_id, local_dof), &global_idx) in &dof_num.map {
        if local_dof >= 6 { continue; }
        if global_idx < nf {
            // Free DOF: only applied force
            if global_idx < assembled_f.len() {
                applied[local_dof] += assembled_f[global_idx];
            }
        } else {
            // Restrained DOF: applied force + reaction
            if global_idx < assembled_f.len() {
                applied[local_dof] += assembled_f[global_idx];
            }
            let ridx = global_idx - nf;
            if ridx < reactions_vec.len() {
                if local_dof < 3 {
                    if let Some(node_rxn) = inclined_node_rxn.get_mut(&node_id) {
                        // Accumulate in rotated frame; will back-transform later
                        node_rxn[local_dof] += reactions_vec[ridx];
                    } else {
                        rxn[local_dof] += reactions_vec[ridx];
                    }
                } else {
                    rxn[local_dof] += reactions_vec[ridx];
                }
            }
        }
    }

    // Back-transform inclined support reactions from rotated to global: r_global = R^T * r_rotated
    for it in inclined_transforms {
        if let Some(rotated) = inclined_node_rxn.get(&it.node_id) {
            let gx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1] + it.r[2][0] * rotated[2];
            let gy = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1] + it.r[2][1] * rotated[2];
            let gz = it.r[0][2] * rotated[0] + it.r[1][2] * rotated[1] + it.r[2][2] * rotated[2];
            rxn[0] += gx;
            rxn[1] += gy;
            rxn[2] += gz;
        }
    }

    // Also back-transform the applied force sums for inclined support DOFs
    // (assembled_f is in the rotated frame for inclined support DOFs too)
    let mut inclined_node_app: std::collections::HashMap<usize, [f64; 3]> =
        std::collections::HashMap::new();
    for it in inclined_transforms {
        inclined_node_app.insert(it.node_id, [0.0; 3]);
    }
    // Subtract what we already added (in rotated frame) and re-accumulate
    for (&(node_id, local_dof), &global_idx) in &dof_num.map {
        if local_dof >= 3 { continue; }
        if inclined_node_app.contains_key(&node_id) && global_idx < assembled_f.len() {
            applied[local_dof] -= assembled_f[global_idx];
            inclined_node_app.get_mut(&node_id).unwrap()[local_dof] += assembled_f[global_idx];
        }
    }
    for it in inclined_transforms {
        if let Some(rotated) = inclined_node_app.get(&it.node_id) {
            let gx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1] + it.r[2][0] * rotated[2];
            let gy = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1] + it.r[2][1] * rotated[2];
            let gz = it.r[0][2] * rotated[0] + it.r[1][2] * rotated[1] + it.r[2][2] * rotated[2];
            applied[0] += gx;
            applied[1] += gy;
            applied[2] += gz;
        }
    }

    // Translational equilibrium (fx, fy, fz): applied + reactions ≈ 0
    let force_imbalance: Vec<f64> = (0..3).map(|i| applied[i] + rxn[i]).collect();
    let max_imbalance = force_imbalance.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let max_force = applied[..3].iter().chain(&rxn[..3]).map(|v| v.abs()).fold(0.0f64, f64::max);
    let equilibrium_ok = max_imbalance < 1e-6 * max_force.max(1.0);

    EquilibriumSummary {
        relative_residual: rel_residual,
        residual_ok: rel_residual < 1e-6,
        applied_force_sum: applied.to_vec(),
        reaction_force_sum: rxn.to_vec(),
        max_imbalance,
        equilibrium_ok,
    }
}

/// Compute equilibrium summary for 2D from the assembled force vector.
///
/// When inclined supports are present, the reactions in `reactions_vec` are in the
/// rotated local frame. The `inclined_transforms` are used to back-transform each
/// inclined node's reaction contributions to global axes before summing.
pub(super) fn compute_equilibrium_summary_2d(
    assembled_f: &[f64],
    reactions_vec: &[f64],
    dof_num: &DofNumbering,
    rel_residual: f64,
    inclined_transforms: &[InclinedTransformData2D],
) -> EquilibriumSummary {
    let nf = dof_num.n_free;
    let ndirs = dof_num.dofs_per_node.min(3);

    // Sum applied forces and reactions by physical direction using DOF map.
    // For inclined supports, translational reactions are accumulated per-node
    // in the rotated frame, then back-transformed to global.
    let mut applied = [0.0f64; 3];
    let mut rxn = [0.0f64; 3];

    // Collect per-node rotated reaction vectors for inclined support nodes
    let mut inclined_node_rxn: std::collections::HashMap<usize, [f64; 2]> =
        std::collections::HashMap::new();
    for it in inclined_transforms {
        inclined_node_rxn.insert(it.node_id, [0.0; 2]);
    }

    for (&(node_id, local_dof), &global_idx) in &dof_num.map {
        if local_dof >= ndirs { continue; }
        if global_idx < nf {
            if global_idx < assembled_f.len() {
                applied[local_dof] += assembled_f[global_idx];
            }
        } else {
            if global_idx < assembled_f.len() {
                applied[local_dof] += assembled_f[global_idx];
            }
            let ridx = global_idx - nf;
            if ridx < reactions_vec.len() {
                if local_dof < 2 {
                    if let Some(node_rxn) = inclined_node_rxn.get_mut(&node_id) {
                        node_rxn[local_dof] += reactions_vec[ridx];
                    } else {
                        rxn[local_dof] += reactions_vec[ridx];
                    }
                } else {
                    rxn[local_dof] += reactions_vec[ridx];
                }
            }
        }
    }

    // Back-transform inclined support reactions: r_global = R^T * r_rotated
    for it in inclined_transforms {
        if let Some(rotated) = inclined_node_rxn.get(&it.node_id) {
            let gx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1];
            let gz = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1];
            rxn[0] += gx;
            rxn[1] += gz;
        }
    }

    // Also back-transform the applied force sums for inclined support DOFs
    let mut inclined_node_app: std::collections::HashMap<usize, [f64; 2]> =
        std::collections::HashMap::new();
    for it in inclined_transforms {
        inclined_node_app.insert(it.node_id, [0.0; 2]);
    }
    for (&(node_id, local_dof), &global_idx) in &dof_num.map {
        if local_dof >= 2 { continue; }
        if inclined_node_app.contains_key(&node_id) && global_idx < assembled_f.len() {
            applied[local_dof] -= assembled_f[global_idx];
            inclined_node_app.get_mut(&node_id).unwrap()[local_dof] += assembled_f[global_idx];
        }
    }
    for it in inclined_transforms {
        if let Some(rotated) = inclined_node_app.get(&it.node_id) {
            let gx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1];
            let gz = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1];
            applied[0] += gx;
            applied[1] += gz;
        }
    }

    // Translational equilibrium (fx, fy)
    let force_imbalance: Vec<f64> = (0..2).map(|i| applied[i] + rxn[i]).collect();
    let max_imbalance = force_imbalance.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let max_force = applied[..2].iter().chain(&rxn[..2]).map(|v| v.abs()).fold(0.0f64, f64::max);
    let equilibrium_ok = max_imbalance < 1e-6 * max_force.max(1.0);

    EquilibriumSummary {
        relative_residual: rel_residual,
        residual_ok: rel_residual < 1e-6,
        applied_force_sum: applied.to_vec(),
        reaction_force_sum: rxn.to_vec(),
        max_imbalance,
        equilibrium_ok,
    }
}
