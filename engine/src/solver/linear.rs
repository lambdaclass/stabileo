use crate::solver::support::{support_dofs_2d, support_dofs_3d};
use crate::types::units::{ElasticInput2D, ElasticProperties2D};
use std::borrow::Cow;
use crate::types::*;
use crate::linalg::*;
use crate::element;
use std::rc::Rc;
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
pub const SPARSE_THRESHOLD: usize = 64;

/// Free-DOF count at which explicitly requested Auto mode tries PCG after
/// checking stability with unshifted Cholesky. Missing options remain direct.
///
// Reevaluated 2026-09-22 twice. First (Phase 3, `diagnose_shifted_ic_sweep`
// and `diagnose_pcg_attempt_overhead` in engine/tests/sparse_shell_gates.rs):
// no preconditioner in the chain converged on MITC4 shells and Auto paid
// +12.4% (20×20) / +9.4% (30×30) before falling back to direct. Second
// (preconditioning investigation, `diagnose_pcg_stall_curve` /
// `diagnose_pcg_plateau_length` / `diagnose_precond_sweep`): the Jacobi/SSOR
// "stall" on shells was the fixed 50-iteration stagnation safeguard aborting
// legitimate slow convergence — the CG plateau grows like ~3.2·√nf (426
// iterations at 50×50). With the window scaled to max(50, 8·√n), PCG-Jacobi
// converges. Those historical speedups excluded the load-independent stability
// check now required before accepting PCG. They are not current end-to-end
// performance claims. Retain 1_000 as the opt-in dispatch boundary; a new
// crossover requires measuring the stability check as well as iteration.
const ITERATIVE_THRESHOLD: usize = 1_000;

/// Linear solver method selected via `SolverOptions`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SolverMethod {
    Auto,
    Direct,
    Pcg,
}

/// Preconditioner selected via `SolverOptions`. `Auto` starts the
/// degradation chain at shifted IC (Ajiz-Jennings pivot restoration), which
/// subsumes strict IC(0) when no pivot degrades; explicit `"ic0"` keeps the
/// strict variant that fails on non-SPD patterns.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PreconditionerChoice {
    Auto,
    Ic0,
    ShiftedIc,
    Mic,
    Ssor,
    Jacobi,
    NoPrecond,
}

impl PreconditionerChoice {
    fn as_str(&self) -> &'static str {
        match self {
            PreconditionerChoice::Auto => "auto",
            PreconditionerChoice::Ic0 => "ic0",
            PreconditionerChoice::ShiftedIc => "ics",
            PreconditionerChoice::Mic => "mic",
            PreconditionerChoice::Ssor => "ssor",
            PreconditionerChoice::Jacobi => "jacobi",
            PreconditionerChoice::NoPrecond => "none",
        }
    }
}

/// Global diagonal shift (relative to max_diag(K_ff)) applied by the shifted-IC
/// preconditioner in the auto chain.
///
// Measured 2026-09-22 with `diagnose_shifted_ic_sweep`
// (engine/tests/sparse_shell_gates.rs, #[ignore]) on simply-supported MITC4
// plates 10×10 to 50×50: the global shift does not change PCG iteration
// counts appreciably once drilling pivots are restored per-DOF, so the
// default is 0 — with shift 0 and no degraded pivots the factor is bitwise
// identical to strict IC(0), preserving the Phase 1 behavior on frames
// (where IC(0) never fails).
const ICS_SHIFT_REL: f64 = 0.0;

/// Solver options with defaults applied.
struct ResolvedSolverOptions {
    method: SolverMethod,
    precond: PreconditionerChoice,
    tol: f64,
    max_iter: usize,
}

/// Parse `SolverOptions` from the input, applying defaults and pushing a
/// warning diagnostic for each unrecognized or invalid value.
fn resolve_solver_options(
    input_opts: &Option<SolverOptions>,
    nf: usize,
    diags: &mut Vec<SolverDiagnostic>,
) -> ResolvedSolverOptions {
    let mut resolved = ResolvedSolverOptions {
        method: if input_opts.is_some() { SolverMethod::Auto } else { SolverMethod::Direct },
        precond: PreconditionerChoice::Auto,
        tol: 1e-8,
        max_iter: 1000usize.max(nf / 4),
    };
    let Some(opts) = input_opts else { return resolved };

    if let Some(m) = &opts.method {
        match m.as_str() {
            "auto" => {}
            "direct" => resolved.method = SolverMethod::Direct,
            "pcg" => resolved.method = SolverMethod::Pcg,
            other => diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("Unknown solver method '{}', falling back to 'auto'", other),
                severity: "warning".into(),
            }),
        }
    }
    if let Some(p) = &opts.preconditioner {
        match p.as_str() {
            "ic0" => resolved.precond = PreconditionerChoice::Ic0,
            "ics" => resolved.precond = PreconditionerChoice::ShiftedIc,
            "mic" => resolved.precond = PreconditionerChoice::Mic,
            "ssor" => resolved.precond = PreconditionerChoice::Ssor,
            "jacobi" => resolved.precond = PreconditionerChoice::Jacobi,
            "none" => resolved.precond = PreconditionerChoice::NoPrecond,
            other => diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("Unknown preconditioner '{}', falling back to 'ics'", other),
                severity: "warning".into(),
            }),
        }
    }
    if let Some(t) = opts.tolerance {
        if t.is_finite() && t > 0.0 {
            resolved.tol = t;
        } else {
            diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("Invalid PCG tolerance {}, falling back to 1e-8", t),
                severity: "warning".into(),
            });
        }
    }
    if let Some(mi) = opts.max_iterations {
        if mi > 0 {
            resolved.max_iter = mi;
        } else {
            diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: "Invalid PCG max_iterations 0, falling back to default".into(),
                severity: "warning".into(),
            });
        }
    }
    resolved
}

/// Validate `solverOptions` on every solve path (dense, sparse, PCG), pushing
/// a structured warning per unrecognized or invalid value. Runs at prepare
/// time so the warning is emitted even when the model takes the dense path,
/// where `resolve_solver_options` is never called. The sparse paths still get
/// the legacy-channel warning from `resolve_solver_options` — the codebase
/// dual-reports solver-path events in both channels.
fn validate_solver_options(input_opts: &Option<SolverOptions>, diags: &mut Vec<StructuredDiagnostic>) {
    let Some(opts) = input_opts else { return };
    let mut warn = |message: String| {
        diags.push(
            StructuredDiagnostic::global(DiagnosticCode::UnknownSolverOption, Severity::Warning, message)
                .with_phase("pre_solve"),
        );
    };
    if let Some(m) = &opts.method {
        if !matches!(m.as_str(), "auto" | "direct" | "pcg") {
            warn(format!("Unknown solver method '{}', falling back to 'auto'", m));
        }
    }
    if let Some(p) = &opts.preconditioner {
        if !matches!(p.as_str(), "ics" | "ic0" | "mic" | "ssor" | "jacobi" | "none") {
            warn(format!("Unknown preconditioner '{}', falling back to 'ics'", p));
        }
    }
    if let Some(t) = opts.tolerance {
        if !(t.is_finite() && t > 0.0) {
            warn(format!("Invalid PCG tolerance {}, falling back to 1e-8", t));
        }
    }
    if let Some(mi) = opts.max_iterations {
        if mi == 0 {
            warn("Invalid PCG max_iterations 0, falling back to default".into());
        }
    }
}

/// Outcome of a verified PCG solve.
struct PcgOutcome {    u: Vec<f64>,
    iterations: usize,
    /// True relative residual ‖K u − f‖/‖f‖ recomputed after the solve.
    true_rel_residual: f64,
    /// Preconditioner actually used: "ics" | "ic0" | "mic" | "ssor" | "jacobi" | "none".
    preconditioner: &'static str,
}

/// Build the preconditioner for a PCG run. Explicit choices degrade
/// (shifted/strict IC, MIC) → Jacobi → SSOR with warnings; `Auto` runs the
/// same chain starting at shifted IC with info-level notes. Jacobi degrades
/// before SSOR because on measured MITC4 shells it converges in fewer
/// iterations AND costs less per iteration (no triangular sweeps), while
/// SSOR remains as the final net before the direct fallback. Returns None
/// when no usable preconditioner exists — the caller must fall back to the
/// direct solver chain.
fn build_pcg_preconditioner<'a>(
    k_ff: &'a CscMatrix,
    choice: PreconditionerChoice,
    diags: &mut Vec<SolverDiagnostic>,
) -> Option<Box<dyn Preconditioner + 'a>> {
    match choice {
        PreconditionerChoice::ShiftedIc => {
            // Infallible by construction; report restored pivots.
            let p = ShiftedIcPreconditioner::new(k_ff, ICS_SHIFT_REL);
            if p.perturbations() > 0 {
                diags.push(SolverDiagnostic {
                    category: "solver_path".into(),
                    message: format!(
                        "Shifted-IC restored {} degraded pivots to the original DOF diagonal",
                        p.perturbations()
                    ),
                    severity: "info".into(),
                });
            }
            Some(Box::new(p) as _)
        }
        PreconditionerChoice::Ic0 => {
            Ic0Preconditioner::new(k_ff).map(|p| Box::new(p) as _)
        }
        PreconditionerChoice::Mic => {
            MicPreconditioner::new(k_ff).map(|p| Box::new(p) as _)
        }
        PreconditionerChoice::Ssor => {
            SsorPreconditioner::new(k_ff, 1.0).map(|p| Box::new(p) as _)
        }
        PreconditionerChoice::Jacobi => {
            JacobiPreconditioner::new(k_ff).map(|p| Box::new(p) as _)
        }
        PreconditionerChoice::NoPrecond => Some(Box::new(IdentityPreconditioner)),
        PreconditionerChoice::Auto => unreachable!("chain never contains Auto"),
    }
}

/// Attempt a PCG solve of K_ff u = f_f, walking the preconditioner chain
/// (Auto: shifted IC → Jacobi → SSOR). Shifted IC is infallible to *build*,
/// so the chain degrades on verified convergence, not just on construction:
/// each candidate runs PCG and is accepted only when PCG reports convergence
/// AND the true relative residual ‖K_ff u − f_f‖/‖f_f‖ ≤ 1e-6 (recomputed,
/// never trusted blindly). On total failure a warning is pushed and None is
/// returned — the caller falls back to the direct solver chain. Failed
/// attempts are bounded by the PCG size-scaled stagnation safeguard.
/// The caller must first verify unshifted K_ff with sparse Cholesky: convergence
/// for one RHS cannot detect a mechanism that that load does not excite.
fn try_pcg_solve(
    k_ff: &CscMatrix,
    f_f: &[f64],
    opts: &ResolvedSolverOptions,
    diags: &mut Vec<SolverDiagnostic>,
) -> Option<PcgOutcome> {
    let severity = if opts.precond == PreconditionerChoice::Auto { "info" } else { "warning" };
    let chain: &[PreconditionerChoice] = match opts.precond {
        PreconditionerChoice::Auto | PreconditionerChoice::ShiftedIc => &[
            PreconditionerChoice::ShiftedIc,
            PreconditionerChoice::Jacobi,
            PreconditionerChoice::Ssor,
        ],
        PreconditionerChoice::Ic0 => &[
            PreconditionerChoice::Ic0,
            PreconditionerChoice::Jacobi,
            PreconditionerChoice::Ssor,
        ],
        PreconditionerChoice::Mic => &[
            PreconditionerChoice::Mic,
            PreconditionerChoice::Jacobi,
            PreconditionerChoice::Ssor,
        ],
        PreconditionerChoice::Ssor => &[PreconditionerChoice::Ssor, PreconditionerChoice::Jacobi],
        PreconditionerChoice::Jacobi => &[PreconditionerChoice::Jacobi],
        PreconditionerChoice::NoPrecond => &[PreconditionerChoice::NoPrecond],
    };

    let mut built_any = false;
    let mut last_failure = String::new();
    for (idx, &c) in chain.iter().enumerate() {
        let pre = match build_pcg_preconditioner(k_ff, c, diags) {
            Some(p) => p,
            None => {
                if idx + 1 < chain.len() {
                    diags.push(SolverDiagnostic {
                        category: "solver_path".into(),
                        message: format!(
                            "Preconditioner '{}' failed to build (non-SPD pivot or zero diagonal), degrading",
                            c.as_str()
                        ),
                        severity: severity.into(),
                    });
                }
                continue;
            }
        };
        built_any = true;
        if idx > 0 {
            diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("Preconditioner degraded to '{}'", pre.name()),
                severity: severity.into(),
            });
        }

        let res = pcg_solve(k_ff, f_f, pre.as_ref(), opts.tol, opts.max_iter);

        // Recompute the true relative residual — never trust the iteration's
        // internal estimate.
        let ku = k_ff.sym_mat_vec(&res.x);
        let mut row_scale: Vec<f64> = f_f.iter().map(|v| v.abs()).collect();
        for j in 0..k_ff.n {
            for p in k_ff.col_ptr[j]..k_ff.col_ptr[j + 1] {
                let (i, value) = (k_ff.row_idx[p], k_ff.values[p]);
                row_scale[i] += (value * res.x[j]).abs();
                if i != j { row_scale[j] += (value * res.x[i]).abs(); }
            }
        }
        let row_resolved = (0..k_ff.n).all(|i| (ku[i] - f_f[i]).abs() <= 1e-6 * row_scale[i]);
        let mut res2 = 0.0f64;
        let mut f2 = 0.0f64;
        for i in 0..k_ff.n {
            let r = ku[i] - f_f[i];
            res2 += r * r;
            f2 += f_f[i] * f_f[i];
        }
        let rel = res2.sqrt() / f2.sqrt().max(1e-30);

        if res.converged && rel <= 1e-6 && row_resolved {
            let precond_name: &'static str = match pre.name() {
                "identity" => "none",
                other => other,
            };
            return Some(PcgOutcome {
                u: res.x,
                iterations: res.iterations,
                true_rel_residual: rel,
                preconditioner: precond_name,
            });
        }

        last_failure = format!(
            "PCG with '{}' preconditioner did not converge (converged={}, true rel residual {:.2e}, row residuals resolved={} after {} iterations)",
            pre.name(), res.converged, rel, row_resolved, res.iterations
        );
        if idx + 1 < chain.len() {
            diags.push(SolverDiagnostic {
                category: "solver_path".into(),
                message: format!("{}, trying next preconditioner", last_failure),
                severity: severity.into(),
            });
        }
    }

    if !built_any {
        diags.push(SolverDiagnostic {
            category: "fallback".into(),
            message: "No usable PCG preconditioner, falling back to direct solver".into(),
            severity: "warning".into(),
        });
    } else {
        diags.push(SolverDiagnostic {
            category: "fallback".into(),
            message: format!("{}, falling back to direct solver", last_failure),
            severity: "warning".into(),
        });
    }
    None
}

/// Solver path label for a successful PCG run.
fn pcg_solver_path(preconditioner: &str) -> &'static str {
    match preconditioner {
        "ic0" => "pcg_ic0",
        "ics" => "pcg_ics",
        "mic" => "pcg_mic",
        "ssor" => "pcg_ssor",
        "jacobi" => "pcg_jacobi",
        _ => "pcg_none",
    }
}

/// Solve a 2D linear static analysis.
/// Linear static 2D solve, with the known-issue warnings that apply to the model attached.
pub fn solve_2d(input: &SolverInput) -> Result<AnalysisResults, String> {
    let mut r = solve_2d_inner(input)?;
    crate::known_issues::attach(&mut r.structured_diagnostics, crate::known_issues::for_2d(input, crate::known_issues::Analysis::Linear));
    Ok(r)
}

/// Typed direct API. Frame properties stay typed from serde to stiffness/recovery.
pub fn solve_2d_typed(input: &ElasticInput2D) -> Result<AnalysisResults, String> {
    let legacy = input.legacy_view();
    if !legacy.constraints.is_empty() {
        return solve_2d(&legacy);
    }
    let properties = ElasticProperties2D::from_typed(input);
    let prepared = prepare_static_2d_impl(&legacy, false, properties)?;
    let mut result = prepared.solve_loads(&legacy.loads)?;
    crate::known_issues::attach(&mut result.structured_diagnostics, crate::known_issues::for_2d(&legacy, crate::known_issues::Analysis::Linear));
    Ok(result)
}

fn solve_2d_inner(input: &SolverInput) -> Result<AnalysisResults, String> {
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
    /// Sparse Cholesky factorization of K_ff.
    SparseCholesky(NumericCholesky),
}

/// 2D static analysis prepared for multiple right-hand sides: DOF numbering,
/// assembled stiffness (inclined transforms applied), K_ff factorization, and
/// the prescribed-displacement coupling terms — everything that depends only on
/// the structure, not on the loads. Build once with `prepare_static_2d`, then
/// solve any number of load sets with `solve_loads`.
pub struct PreparedStatic2D<'a> {
    rotation_demand: crate::known_issues::RotationDemand2D,
    known_model: Vec<StructuredDiagnostic>,
    properties: ElasticProperties2D,
    input: Cow<'a, SolverInput>,
    dof_num: DofNumbering,
    n: usize,
    nf: usize,
    nr: usize,
    u_r: Vec<f64>,
    pre_solve_diags: Vec<StructuredDiagnostic>,
    stability: super::stability::Stability,
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
    /// Sparse Cholesky of the triplet-assembled K_ff (nf >= SPARSE_THRESHOLD).
    Sparse(Box<PreparedSparse2D>),
    /// Iterative PCG on the triplet-assembled K_ff (nf >= SPARSE_THRESHOLD,
    /// explicit "pcg" or Auto above ITERATIVE_THRESHOLD); the direct chain
    /// supplies a cached stability check and fallback.
    Pcg(Box<PreparedPcg2D>),
}

struct PreparedSolve2D {
    k_ff: Vec<f64>,
    k_rf: Vec<f64>,
    k_fr_ur: Vec<f64>,
    k_rr_ur: Vec<f64>,
    factor: FactorizedKff,
    used_sparse: bool,
}

struct PreparedSparse2D {
    k_ff: CscMatrix,
    k_full: CscMatrix,
    num: NumericCholesky,
    kfr_ur: Vec<f64>,
}

struct PreparedPcg2D {
    k_ff: CscMatrix,
    k_full: CscMatrix,
    kfr_ur: Vec<f64>,
    opts: ResolvedSolverOptions,
    solver_diags_base: Vec<SolverDiagnostic>,
    direct: std::cell::OnceCell<Option<NumericCholesky>>,
}




/// Prepare a 2D structure for one or more static solves: numbering, assembly,
/// and factorization of the free-free stiffness block happen exactly once here.
/// This is exactly the load-independent part of `solve_2d`.
pub fn prepare_static_2d(input: &SolverInput) -> Result<PreparedStatic2D<'_>, String> {
    prepare_static_2d_impl(input, false, ElasticProperties2D::from_legacy(input))
}

/// Legacy dense-assembly behavior for nf ≥ 64 (dense K_ff + CSC conversion +
/// sparse Cholesky), kept as a parity reference for the triplet sparse
/// assembly path. Not part of the public API contract.
#[doc(hidden)]
pub fn prepare_static_2d_dense_reference(input: &SolverInput) -> Result<PreparedStatic2D<'_>, String> {
    prepare_static_2d_impl(input, true, ElasticProperties2D::from_legacy(input))
}

/// Prescribed displacements of the restrained DOFs (`u_r`, length
/// `n_total − n_free`), in the inclined-support frames the restrained DOFs
/// are numbered in.
pub(crate) fn prescribed_displacements_2d(input: &SolverInput, dof_num: &DofNumbering) -> Vec<f64> {
    let nf = dof_num.n_free;
    let mut u_r = vec![0.0; dof_num.n_total - nf];
    for sup in crate::ordered::values(&input.supports) {
        if sup.support_type == "spring" { continue; } // spring DOFs are free

        if sup.support_type == "inclinedRoller" {
            // For inclined rollers, prescribed displacements (dx, dz) are given
            // in global coords. We need to rotate them to the local frame
            // (where local_dof=1 is the restrained normal direction).
            if let Some(theta) = sup.angle {
                let [s, c] = super::assembly::inclined_rotation_matrix_2d(theta)[1];
                let glob_dx = sup.dx.unwrap_or(0.0);
                let glob_dz = sup.dz.unwrap_or(0.0);
                // The restrained direction is (sin θ, cos θ).
                // In the rotated frame, local_dof=1 should be this direction:
                // u_local[1] = sin θ * ux + cos θ * uz
                // u_local[0] = -cos θ * ux + sin θ * uz (free tangent)
                //
                // Prescribed displacement in the restrained direction:
                let u_normal = super::assembly::compensated_dot(&[s,c], &[glob_dx,glob_dz]);
                if u_normal != 0.0 {
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
                    if v != 0.0 {
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
                if v != 0.0 {
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
                    if v != 0.0 {
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
    u_r
}

fn prepare_static_2d_impl(input: &SolverInput, force_dense: bool, properties: ElasticProperties2D) -> Result<PreparedStatic2D<'_>, String> {
    validate_input_2d(input)?;
    // The prepared (factor-once) path assembles no constraints. Every caller
    // routes constrained models elsewhere today; refusing here keeps a new
    // caller from silently solving the model without them (the dense
    // reference did: found by the metamorphic relabel check).
    if !input.constraints.is_empty() {
        return Err("prepared static solve does not support constraints: solve the model with solve_2d (constrained solver)".into());
    }
    let dof_num = DofNumbering::build_2d(input);
    let mut pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_2d(input);
    validate_solver_options(&input.solver_options, &mut pre_solve_diags);

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build prescribed displacement vector u_r for restrained DOFs
    let nr = n - nf;
    let u_r = prescribed_displacements_2d(input, &dof_num);

    // Fully restrained: all DOFs are restrained, no solve needed.
    if nf == 0 {
        let stiff = assemble_stiffness_2d_typed(input, &dof_num, &properties);
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
            rotation_demand: crate::known_issues::RotationDemand2D::new(input),
            known_model: crate::known_issues::for_2d_loads(input, &[], crate::known_issues::Analysis::Linear),
            properties,
            input: Cow::Borrowed(input),
            dof_num,
            n,
            nf,
            nr,
            u_r,
            pre_solve_diags,
            stability: super::stability::Stability::stable(),
            inclined_transforms_2d: stiff.inclined_transforms_2d,
            path: PreparedPath2D::FullyRestrained { ku_full },
        });
    }

    // ── Triplet sparse path: large models (nf >= 64) ──
    if !force_dense && nf >= SPARSE_THRESHOLD {
        let stiff = super::assembly::without_artificial_stiffness(|| super::sparse_assembly::assemble_stiffness_sparse_2d_typed(input, &dof_num, &properties));
        let (k_ff, stability) = super::stability::prepare_free_stiffness(&stiff.k_ff, &dof_num, true, None, &super::stability::coupling_2d(input, &dof_num), &super::stability::ReleasedRotations::default())?;

        let mut pcg_diags_base: Vec<SolverDiagnostic> = Vec::new();
        let solver_opts = resolve_solver_options(&input.solver_options, nf, &mut pcg_diags_base);
        let use_pcg = solver_opts.method == SolverMethod::Pcg
            || (solver_opts.method == SolverMethod::Auto && nf >= ITERATIVE_THRESHOLD);
        let has_prescribed = u_r.iter().any(|v| v.abs() > 1e-15);
        let kfr_ur = if has_prescribed {
            stiff.k_full.sparse_cross_block_matvec(&u_r, nf)
        } else {
            vec![0.0; nf]
        };
        if use_pcg {
            return Ok(PreparedStatic2D {
                rotation_demand: crate::known_issues::RotationDemand2D::new(input),
                known_model: crate::known_issues::for_2d_loads(input, &[], crate::known_issues::Analysis::Linear),
                properties,
                input: Cow::Borrowed(input),
                dof_num,
                n,
                nf,
                nr,
                u_r,
                pre_solve_diags,
                stability,
                inclined_transforms_2d: stiff.inclined_transforms_2d,
                path: PreparedPath2D::Pcg(Box::new(PreparedPcg2D {
                    k_ff,
                    k_full: stiff.k_full,
                    kfr_ur,
                    opts: solver_opts,
                    solver_diags_base: pcg_diags_base,
                    direct: std::cell::OnceCell::new(),
                })),
            });
        }

        let sym = std::rc::Rc::new(symbolic_cholesky(&k_ff));
        let num = numeric_cholesky(&sym, &k_ff).ok_or_else(not_positive_definite)?;
        return Ok(PreparedStatic2D {
            rotation_demand: crate::known_issues::RotationDemand2D::new(input),
            known_model: crate::known_issues::for_2d_loads(input, &[], crate::known_issues::Analysis::Linear),
            properties,
            input: Cow::Borrowed(input),
            dof_num,
            n,
            nf,
            nr,
            u_r,
            pre_solve_diags,
            stability,
            inclined_transforms_2d: stiff.inclined_transforms_2d,
            path: PreparedPath2D::Sparse(Box::new(PreparedSparse2D {
                k_ff,
                k_full: stiff.k_full,
                num,
                kfr_ur,
            })),
        });
    }

    let stiff = super::assembly::without_artificial_stiffness(|| assemble_stiffness_2d_typed(input, &dof_num, &properties));

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let mut k_ff = extract_submatrix(&stiff.k, n, &free_idx, &free_idx);
    let k_fr = extract_submatrix(&stiff.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    let k_rf = extract_submatrix(&stiff.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&stiff.k, n, &rest_idx, &rest_idx);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);

    let (pinned, stability) = super::stability::prepare_free_stiffness(&CscMatrix::from_dense_symmetric_exact(&k_ff, nf), &dof_num, true, None, &super::stability::coupling_2d(input, &dof_num), &super::stability::ReleasedRotations::default())?;
    k_ff = pinned.to_dense_symmetric();

    let (factor, used_sparse) = if nf >= SPARSE_THRESHOLD {
        let k_ff_sparse = CscMatrix::from_dense_symmetric(&k_ff, nf);
        let sym = Rc::new(symbolic_cholesky(&k_ff_sparse));
        (FactorizedKff::SparseCholesky(numeric_cholesky(&sym, &k_ff_sparse).ok_or_else(not_positive_definite)?), true)
    } else {
        let mut k_work = k_ff.clone();
        if !cholesky_decompose(&mut k_work, nf) { return Err(not_positive_definite()); }
        (FactorizedKff::DenseCholesky(k_work), false)
    };

    Ok(PreparedStatic2D {
        rotation_demand: crate::known_issues::RotationDemand2D::new(input),
        known_model: crate::known_issues::for_2d_loads(input, &[], crate::known_issues::Analysis::Linear),
        properties,
        input: Cow::Borrowed(input),
        dof_num,
        n,
        nf,
        nr,
        u_r,
        pre_solve_diags,
        stability,
        inclined_transforms_2d: stiff.inclined_transforms_2d,
        path: PreparedPath2D::Solve(Box::new(PreparedSolve2D {
            k_ff, k_rf, k_fr_ur, k_rr_ur, factor, used_sparse,
        })),
    })
}

#[cfg(test)]
pub(crate) fn free_tags(dof_num: &DofNumbering, two_d: bool) -> Vec<super::stability::DofTag> {
    let mut tags = super::stability::tags(dof_num, two_d);
    tags.truncate(dof_num.n_free);
    tags
}

pub(crate) fn not_positive_definite() -> String {
    "the structure cannot be solved reliably: \
     stiffness factorization accuracy is unresolved after the stability check; no result is returned".to_string()
}

impl PreparedStatic2D<'_> {
    /// Own the model for a session that outlives the constructor's input buffer.
    pub fn into_owned(self) -> PreparedStatic2D<'static> {
        PreparedStatic2D {
            rotation_demand: self.rotation_demand,
            known_model: self.known_model,
            properties: self.properties,
            input: Cow::Owned(self.input.into_owned()),
            dof_num: self.dof_num,
            n: self.n,
            nf: self.nf,
            nr: self.nr,
            u_r: self.u_r,
            pre_solve_diags: self.pre_solve_diags,
            stability: self.stability,
            inclined_transforms_2d: self.inclined_transforms_2d,
            path: self.path,
        }
    }

    /// Solve the prepared 2D structure for one load set. Rebuilds only the
    /// load vector (prescribed-displacement coupling included), reuses the
    /// stored factorization, then runs the same postprocessing as `solve_2d`.
    pub fn solve_loads(&self, loads: &[SolverLoad]) -> Result<AnalysisResults, String> {
        let mut r = self.solve_loads_by_path(loads)?;
        if self.rotation_demand.demanded(loads) {
            crate::known_issues::attach(&mut r.structured_diagnostics, vec![crate::known_issues::diagnostic("CERT-MECHANISM")]);
        }
        crate::known_issues::attach(&mut r.structured_diagnostics, self.known_model.clone());
        crate::known_issues::attach(&mut r.structured_diagnostics, crate::known_issues::loads_2d(loads));
        let (beyond, chords, spans) = crate::known_issues::small_displacement_2d(&self.input, loads, &r);
        crate::known_issues::attach(&mut r.structured_diagnostics, beyond.into_iter().collect());
        let summary = r.result_summary.get_or_insert_with(Default::default);
        summary.member_chords = Some(chords);
        summary.member_spans = Some(spans);
        let (second, ratio) = crate::known_issues::second_order_2d(&self.input, loads, &r);
        crate::known_issues::attach(&mut r.structured_diagnostics, second);
        r.result_summary.get_or_insert_with(Default::default).second_order_ratio = Some(ratio);
        crate::known_issues::refuse(&r.structured_diagnostics)?;
        let residual = self.check_returned_displacements(loads, &r).map_err(|error| {
            if r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ExcessiveDisplacement) {
                format!("{error}; excessive displacement indicates a likely mechanism or instability")
            } else { error }
        })?;
        r.structured_diagnostics.push(residual);
        super::conditioning_accuracy::member_balance_2d(&self.input, loads, &self.dof_num, &self.stability, &r, None)?;
        super::self_checks::static_2d(&mut r, &[])?;
        Ok(r)
    }

    pub(super) fn check_returned_displacements(&self, loads: &[SolverLoad], r: &AnalysisResults) -> Result<StructuredDiagnostic, String> {
        let nf = self.dof_num.n_free;
        let mut u = vec![0.0; self.dof_num.n_total];
        for d in &r.displacements {
            for (local, value) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
                if let Some(&index) = self.dof_num.map.get(&(d.node_id, local)) { u[index] = value; }
            }
        }
        for it in &self.inclined_transforms_2d { it.rotate(&mut u); }
        let mut f = assemble_load_vector_2d(&self.input, loads, &self.dof_num, &self.inclined_transforms_2d);
        f.truncate(nf);
        let ku = match &self.path {
            PreparedPath2D::FullyRestrained { .. } => Vec::new(),
            PreparedPath2D::Solve(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.k_fr_ur) { *f -= coupling; }
                mat_vec_rect(&p.k_ff, &u[..nf], nf, nf)
            },
            PreparedPath2D::Sparse(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.kfr_ur) { *f -= coupling; }
                p.k_ff.sym_mat_vec(&u[..nf])
            },
            PreparedPath2D::Pcg(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.kfr_ur) { *f -= coupling; }
                p.k_ff.sym_mat_vec(&u[..nf])
            },
        };
        let diagonal = match &self.path {
            PreparedPath2D::FullyRestrained { .. } => vec![],
            PreparedPath2D::Solve(p) => (0..nf).map(|i| p.k_ff[i*nf+i]).collect(),
            PreparedPath2D::Sparse(p) => p.k_ff.diagonal(),
            PreparedPath2D::Pcg(p) => p.k_ff.diagonal(),
        };
        let residual: Vec<_> = ku.iter().zip(&f).map(|(k,f)| k-f).collect();
        super::self_checks::residual_energy(&residual, &f, &diagonal)
    }

    fn solve_loads_by_path(&self, loads: &[SolverLoad]) -> Result<AnalysisResults, String> {
        // Per-case load validation (the structure was validated in prepare)
        validate_loads_2d(&self.input, loads)?;

        let input = &*self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);
        let f = assemble_load_vector_2d(input, loads, dof_num, &self.inclined_transforms_2d);
        let load_rounding = if self.stability.free_rotations().next().is_some() {
            super::load_work::assembly_rounding_2d(input,loads,dof_num,&self.inclined_transforms_2d)
        } else { Vec::new() };
        if let Some(node) = self.stability.load_on_free_rotation_with_rounding(&f[..nf], &load_rounding) {
            return Err(moment_lost_2d(node, "no member, support or spring stiffens that rotation"));
        }

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
                let mut element_forces = compute_internal_forces_2d_typed(input, loads, dof_num, &u_full, &self.properties);
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
                    k_ff, k_rf, k_fr_ur, k_rr_ur, factor, used_sparse,
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
                };

                let u_f = conditional_dense_refinement(&self.stability, k_ff, &f_f, u_f, |rhs| match factor {
                    FactorizedKff::SparseCholesky(num) => sparse_cholesky_solve(num, rhs),
                    FactorizedKff::DenseCholesky(l) => back_solve(l, &forward_solve(l, rhs, nf), nf),
                })?;

                // Build full displacement vector
                let mut u_full = vec![0.0; n];
                for i in 0..nf {
                    u_full[i] = u_f[i];
                }
                for i in 0..nr {
                    u_full[nf + i] = self.u_r[i];
                }

                // NaN/Inf guard: numerical blow-up means singular matrix
                let has_nan_inf = u_f.iter().any(|v| v.is_nan() || v.is_infinite());
                if has_nan_inf {
                    return Err("Singular stiffness matrix — structure is a mechanism".to_string());
                }
                self.stability.check_pins_with_rounding(&u_f, &f[..nf], &k_fr_ur, &load_rounding)?;

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
                let mut element_forces = compute_internal_forces_2d_typed(input, loads, dof_num, &u_full, &self.properties);
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
                    for node in crate::ordered::values(&input.nodes) {
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

            PreparedPath2D::Sparse(p) => {
                // F_f modified for prescribed displacements: F_f −= K_fr · u_r (precomputed)
                let mut f_f: Vec<f64> = f[..nf].to_vec();
                for (a, b) in f_f.iter_mut().zip(p.kfr_ur.iter()) {
                    *a -= b;
                }

                // Triangular solve with the precomputed sparse Cholesky factor
                let u = sparse_cholesky_solve(&p.num, &f_f);
                let u = conditional_sparse_refinement(&self.stability, &p.k_ff, &f_f, u, |rhs| sparse_cholesky_solve(&p.num, rhs))?;


                // Verify solution quality via residual check
                let ku = p.k_ff.sym_mat_vec(&u);
                let mut res2 = 0.0f64;
                let mut f2 = 0.0f64;
                for i in 0..nf {
                    let r = ku[i] - f_f[i];
                    res2 += r * r;
                    f2 += f_f[i] * f_f[i];
                }
                let rel_residual = res2.sqrt() / f2.sqrt().max(1e-30);

                // Legacy 2D semantics: report a large residual as a structured
                // warning but KEEP the sparse solution. A hard dense-LU fallback
                // costs O(n³) — measured 216 s at nf=2997 vs 0.12 s sparse —
                // for conditioning this model class routinely produces (the 3D
                // path keeps its hard fallback, unchanged). The residual is
                // reported below via ResidualOk/ResidualHigh.
                let u_f = u;

                // NaN/Inf guard: numerical blow-up means singular matrix
                let has_nan_inf = u_f.iter().any(|v| v.is_nan() || v.is_infinite());
                if has_nan_inf {
                    return Err("Singular stiffness matrix — structure is a mechanism".to_string());
                }
                self.stability.check_pins_with_rounding(&u_f, &f[..nf], &p.kfr_ur, &load_rounding)?;

                // Build full displacement vector
                let mut u_full = vec![0.0; n];
                u_full[..nf].copy_from_slice(&u_f[..nf]);
                u_full[nf..(nr + nf)].copy_from_slice(&self.u_r[..nr]);

                // Reactions via full-K sym_mat_vec: R[i] = (K·u)[i] − F[i] for restrained DOFs
                let ku = p.k_full.sym_mat_vec(&u_full);
                let f_r: Vec<f64> = f[nf..].to_vec();
                let mut reactions_vec = vec![0.0; nr];
                for i in 0..nr {
                    reactions_vec[i] = ku[nf + i] - f_r[i];
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
                let mut element_forces = compute_internal_forces_2d_typed(input, loads, dof_num, &u_full, &self.properties);
                element_forces.sort_by_key(|ef| ef.element_id);

                let equilibrium = compute_equilibrium_summary_2d(&f, &reactions_vec, dof_num, rel_residual, &self.inclined_transforms_2d);

                // Build structured diagnostics — same contract as the dense path
                let mut structured = Vec::new();
                structured.extend(self.pre_solve_diags.iter().cloned());

                // Solver path
                structured.push(StructuredDiagnostic::global(
                    DiagnosticCode::SparseCholesky,
                    Severity::Info,
                    format!("Sparse Cholesky solver ({} free DOFs)", nf),
                ).with_phase("solve"));

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
                    for node in crate::ordered::values(&input.nodes) {
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

                let solver_path_2d = "sparse_cholesky";
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

            PreparedPath2D::Pcg(p) => {
                // F_f modified for prescribed displacements: F_f −= K_fr · u_r (precomputed)
                let mut f_f: Vec<f64> = f[..nf].to_vec();
                for (a, b) in f_f.iter_mut().zip(p.kfr_ur.iter()) {
                    *a -= b;
                }

                let mut solver_diags = p.solver_diags_base.clone();

                // A compatible (or zero) RHS can converge on a singular K.
                // Check the ORIGINAL matrix independently of the loads, once
                // per prepared structure, and reuse this factor for fallback.
                let direct = p.direct.get_or_init(|| {
                    let sym = Rc::new(symbolic_cholesky(&p.k_ff));
                    numeric_cholesky(&sym, &p.k_ff)
                }).as_ref().ok_or_else(not_positive_definite)?;
                let pcg = try_pcg_solve(&p.k_ff, &f_f, &p.opts, &mut solver_diags);

                let (u_f, pcg_meta): (Vec<f64>, Option<(usize, &'static str)>) = match pcg {
                    Some(outcome) => {
                        solver_diags.push(SolverDiagnostic {
                            category: "solver_path".into(),
                            message: format!(
                                "PCG solver ({} preconditioner, {} iterations, {} free DOFs)",
                                outcome.preconditioner, outcome.iterations, nf
                            ),
                            severity: "info".into(),
                        });
                        (outcome.u, Some((outcome.iterations, outcome.preconditioner)))
                    }
                    None => {
                        solver_diags.push(SolverDiagnostic {
                            category: "solver_path".into(),
                            message: format!("Sparse Cholesky solver ({} free DOFs)", nf),
                            severity: "info".into(),
                        });
                        (sparse_cholesky_solve(direct, &f_f), None)
                    }
                };

                let u_f = conditional_sparse_refinement(&self.stability, &p.k_ff, &f_f, u_f, |rhs| sparse_cholesky_solve(direct, rhs))?;

                let has_nan_inf = u_f.iter().any(|v| v.is_nan() || v.is_infinite());
                if has_nan_inf {
                    return Err("Singular stiffness matrix — structure is a mechanism".to_string());
                }
                self.stability.check_pins_with_rounding(&u_f, &f[..nf], &p.kfr_ur, &load_rounding)?;

                // Build full displacement vector
                let mut u_full = vec![0.0; n];
                u_full[..nf].copy_from_slice(&u_f[..nf]);
                u_full[nf..(nr + nf)].copy_from_slice(&self.u_r[..nr]);

                // Reactions via full-K sym_mat_vec: R[i] = (K·u)[i] − F[i] for restrained DOFs
                let ku = p.k_full.sym_mat_vec(&u_full);
                let f_r: Vec<f64> = f[nf..].to_vec();
                let mut reactions_vec = vec![0.0; nr];
                for i in 0..nr {
                    reactions_vec[i] = ku[nf + i] - f_r[i];
                }

                // Residual against the ORIGINAL K_ff (describes the returned
                // solution, whichever solver produced it). Legacy 2D semantics:
                // a large residual is a structured warning, not a hard fallback.
                let ku_f = p.k_ff.sym_mat_vec(&u_f);
                let mut res2 = 0.0f64;
                let mut f2 = 0.0f64;
                for i in 0..nf {
                    let r = ku_f[i] - f_f[i];
                    res2 += r * r;
                    f2 += f_f[i] * f_f[i];
                }
                let rel_residual = res2.sqrt() / f2.sqrt().max(1e-30);

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
                let mut element_forces = compute_internal_forces_2d_typed(input, loads, dof_num, &u_full, &self.properties);
                element_forces.sort_by_key(|ef| ef.element_id);

                let equilibrium = compute_equilibrium_summary_2d(&f, &reactions_vec, dof_num, rel_residual, &self.inclined_transforms_2d);

                // Build structured diagnostics — same contract as the other paths
                let mut structured = Vec::new();
                structured.extend(self.pre_solve_diags.iter().cloned());

                // Solver path
                if let Some((iters, pname)) = pcg_meta {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::PcgSolve,
                        Severity::Info,
                        format!("PCG solver ({} preconditioner, {} iterations, {} free DOFs)", pname, iters, nf),
                    ).with_phase("solve"));
                } else {
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::PcgFallbackDirect,
                        Severity::Warning,
                        format!("PCG failed verification, fell back to direct solver ({} free DOFs)", nf),
                    ).with_phase("solve"));
                    structured.push(StructuredDiagnostic::global(
                        DiagnosticCode::SparseCholesky,
                        Severity::Info,
                        format!("Sparse Cholesky solver ({} free DOFs)", nf),
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
                    for node in crate::ordered::values(&input.nodes) {
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

                let solver_path_2d = if let Some((_, pname)) = pcg_meta {
                    pcg_solver_path(pname)
                } else {
                    "pcg_fallback_sparse_cholesky"
                };
                let mut results = AnalysisResults {
                    displacements,
                    reactions,
                    element_forces,
                    constraint_forces: vec![],
                    diagnostics: vec![],
                    solver_diagnostics: solver_diags,
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

pub(super) fn conditional_refinement(
    stability: &super::stability::Stability, diagonal: &[f64], mut u: Vec<f64>,
    solve: impl Fn(&[f64]) -> Vec<f64>, residual: impl Fn(&[f64]) -> Vec<f64>,
) -> Result<Vec<f64>, String> {
    if !stability.needs_accuracy_check() { return Ok(u); }
    let correction = solve(&residual(&u));
    let norm = |values: &[f64]| values.iter().zip(diagonal).map(|(v, d)| v.abs() * d.abs().sqrt()).fold(0.0f64, f64::max);
    let (error, scale) = (norm(&correction), norm(&u));
    let estimate = if error == 0.0 && scale == 0.0 { 0.0 } else { error / scale };
    if u.iter().chain(&correction).any(|v| !v.is_finite()) || !estimate.is_finite() || estimate > super::stability::CONDITIONAL_ACCURACY {
        return Err(stability.conditioning_refusal());
    }
    for (v, delta) in u.iter_mut().zip(correction) { *v += delta; }
    if u.iter().any(|v| !v.is_finite()) { return Err(stability.conditioning_refusal()); }
    Ok(u)
}

pub(super) fn conditional_dense_refinement(
    stability: &super::stability::Stability, k: &[f64], f: &[f64], u: Vec<f64>,
    solve: impl Fn(&[f64]) -> Vec<f64>,
) -> Result<Vec<f64>, String> {
    let n = f.len();
    if !stability.needs_accuracy_check() { return Ok(u); }
    conditional_refinement(stability, &(0..n).map(|i| k[i*n+i]).collect::<Vec<_>>(), u, solve,
        |u| super::equilibrium::dense_residual(k, f, u))
}

pub(super) fn conditional_sparse_refinement(
    stability: &super::stability::Stability, k: &CscMatrix, f: &[f64], u: Vec<f64>,
    solve: impl Fn(&[f64]) -> Vec<f64>,
) -> Result<Vec<f64>, String> {
    if !stability.needs_accuracy_check() { return Ok(u); }
    conditional_refinement(stability, &k.diagonal(), u, solve, |u| compensated_sparse_residual(k, f, u))
}

fn compensated_sparse_residual(k: &CscMatrix, f: &[f64], u: &[f64]) -> Vec<f64> {
    super::equilibrium::sparse_residual(k, f, u)
}

fn refined_static_solve(
    f: &[f64],
    solve: impl Fn(&[f64]) -> Vec<f64>,
    residual: impl Fn(&[f64]) -> Vec<f64>,
) -> Result<Vec<f64>, String> {
    let (u, resolved) = super::equilibrium::refine_solution(
        solve(f),
        |u| Ok(solve(&residual(u))),
        |u, correction| {
            let error = correction.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
            let scale = u.iter().map(|v| v.abs()).fold(1.0f64, f64::max);
            Ok(error <= 8.0 * f64::EPSILON * scale)
        },
    )?;
    if resolved {
        return Ok(u);
    }
    Err("the structure is a mechanism or so close to one that its displacement accuracy cannot be resolved: compensated residual refinement of the static solve did not converge; add supports or members, or reduce extreme stiffness contrasts".into())
}

pub(super) fn refined_sparse_solve(k: &CscMatrix, factor: &NumericCholesky, f: &[f64]) -> Result<Vec<f64>, String> {
    refined_static_solve(f, |rhs| sparse_cholesky_solve(factor, rhs), |u| compensated_sparse_residual(k, f, u))
}

/// Reject a solved displacement vector that is not finite.
///
/// A factorization can report success and still produce Inf/NaN:
/// `cholesky_decompose` rejects only a pivot `<= 1e-15` and never inspects the solved
/// values, so a pivot that squeaks past the floor can still overflow the substitutions.
/// The 2D paths have checked this since `ffbea0686`; this is the same rule for 3D.
///
/// It has to be caught here rather than downstream: the JS wrapper guards solver INPUT,
/// not output.
pub(crate) fn assert_finite_3d(u: &[f64]) -> Result<(), String> {
    if u.iter().any(|v| v.is_nan() || v.is_infinite()) {
        return Err("Singular stiffness matrix — structure is a mechanism".to_string());
    }
    Ok(())
}

/// Solve a 3D linear static analysis.
/// Linear static 3D solve, with the known-issue warnings that apply to the model attached.
pub fn solve_3d(input: &SolverInput3D) -> Result<AnalysisResults3D, String> {
    let mut r = solve_3d_inner(input)?;
    crate::known_issues::attach(&mut r.structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Linear));
    Ok(r)
}

pub(crate) fn buckling_preload_3d(input: &SolverInput3D) -> Result<AnalysisResults3D, String> {
    let analysis = crate::known_issues::Analysis::Buckling;
    crate::known_issues::refuse_distorted(&crate::known_issues::for_3d(input, analysis))?;
    if input.constraints.is_empty() {
        let prepared = prepare_static_3d_for_analysis(input, analysis)?;
        return prepared.solve_loads(&prepared.input.loads);
    }
    let ci = super::constraints::ConstrainedInput3D { solver: input.clone(), constraints: input.constraints.clone() };
    let mut result = super::constraints::solve_constrained_3d_inner(&ci, analysis)?;
    crate::known_issues::MembraneBendingGuard::for_analysis(input, analysis).check(&input.loads, &result)?;
    crate::known_issues::attach(&mut result.structured_diagnostics, crate::known_issues::for_3d(input, analysis));
    Ok(result)
}

fn solve_3d_inner(input: &SolverInput3D) -> Result<AnalysisResults3D, String> {
    if input.constraints.is_empty() {
        let prepared = prepare_static_3d(input)?;
        return prepared.solve_loads(&prepared.input.loads);
    }
    validate_input_3d(input)?;
    let input = expand_curved_beams_3d(input);
    let ci = super::constraints::ConstrainedInput3D {
        constraints: input.constraints.clone(),
        solver: input,
    };
    super::constraints::solve_constrained_3d(&ci)
}

/// 3D static analysis prepared for multiple right-hand sides: curved-beam
/// expansion, DOF numbering, assembled stiffness, K_ff factorization, and the
/// prescribed-displacement coupling terms — everything that depends only on
/// the structure, not on the loads. Build once with `prepare_static_3d`, then
/// solve any number of load sets with `solve_loads`.
pub struct PreparedStatic3D {
    membrane_guard: crate::known_issues::MembraneBendingGuard,
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
    stability: super::stability::Stability,
    path: PreparedPath3D,
}

enum PreparedPath3D {
    FullyRestrained(FullyRestrained3D),
    Dense(DensePrepared3D),
    Sparse(SparsePrepared3D),
    /// Iterative PCG on the triplet-assembled K_ff (explicit "pcg" or Auto
    /// above ITERATIVE_THRESHOLD); the direct chain is factored lazily if PCG
    /// fails verified convergence.
    Pcg(PcgPrepared3D),
}

struct FullyRestrained3D {
    /// K · u_full (u_full = u_r); zero vector when u_r ≈ 0.
    ku_full: Vec<f64>,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
}

struct DensePrepared3D {
    k_ff: Vec<f64>,
    conditioning_warnings: Vec<SolverDiagnostic>,
    k_rf: Vec<f64>,
    k_fr_ur: Vec<f64>,
    k_rr_ur: Vec<f64>,
    factor: Vec<f64>,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
}

struct SparsePrepared3D {
    k_ff: CscMatrix,
    k_full: CscMatrix,
    num: NumericCholesky,
    /// nf — K_fr · u_r from the sparse full-K (zeros when no prescribed DOFs).
    kfr_ur: Vec<f64>,
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
    /// Lazily-factored dense LU of the (unshifted) K_ff, built only if a case's
    /// sparse solve fails the residual check and shared across load cases.
    /// `None` (inside) = K_ff is singular. The OLD fallback re-assembled the
    /// full dense K and re-factored it PER CASE.
    dense_lu: std::cell::OnceCell<Option<(Vec<f64>, Vec<usize>)>>,
}

/// Iterative PCG form of the triplet-assembled K_ff. The preconditioner chain
/// is built per solve; the direct chain (sparse Cholesky, then dense LU on bad
/// residual) is factored lazily and shared across load cases.
struct PcgPrepared3D {
    k_ff: CscMatrix,
    k_full: CscMatrix,
    opts: ResolvedSolverOptions,
    /// nf — K_fr · u_r from the sparse full-K (zeros when no prescribed DOFs).
    kfr_ur: Vec<f64>,
    nnz_kff: usize,
    diagnostics: Vec<AssemblyDiagnostic>,
    inclined_transforms: Vec<InclinedTransformData>,
    /// Conditioning (+ option-parsing) messages, emitted before per-case ones.
    solver_diags_base: Vec<SolverDiagnostic>,
    assembly_us: u64,
    conditioning_us: u64,
    /// Lazily-factored direct fallback (shared across load cases).
    direct: std::cell::OnceCell<PcgDirectFallback3D>,
}

struct PcgDirectFallback3D {
    /// None when K_ff is not positive definite: the solve is refused.
    num: Option<NumericCholesky>,
    nnz_l: usize,
    symbolic_us: u64,
    numeric_us: u64,
    /// Lazily-factored dense LU of the (unshifted) K_ff, built only if a case's
    /// sparse solve fails the residual check. `None` (inside) = K_ff singular.
    dense_lu: std::cell::OnceCell<Option<(Vec<f64>, Vec<usize>)>>,
}

/// Prepare a 3D structure for one or more static solves: curved-beam expansion,
/// numbering, assembly, and factorization of the free-free stiffness block
/// happen exactly once here. This is exactly the load-independent part of `solve_3d`.
/// Prescribed displacements of the restrained DOFs (`u_r`, length
/// `n_total − n_free`), in the inclined-support frames the restrained DOFs
/// are numbered in.
pub(crate) fn prescribed_displacements_3d(input: &SolverInput3D, dof_num: &DofNumbering) -> Vec<f64> {
    let nf = dof_num.n_free;
    let mut u_r = vec![0.0; dof_num.n_total - nf];
    for sup in crate::ordered::values(&input.supports) {
        // Inclined supports: prescribed translations are given in GLOBAL
        // coords, but the restrained inclined DOF (local_dof 0) lives in the
        // rotated frame where it is the normal direction. Project the global
        // prescribed translation onto the normal — mirroring the 2D
        // inclinedRoller handling in prepare_static_2d.
        if sup.is_inclined.unwrap_or(false) {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let n_len = (nx * nx + ny * ny + nz * nz).sqrt();
                if n_len > 1e-12 {
                    let u_normal = super::assembly::compensated_dot(&[nx/n_len,ny/n_len,nz/n_len], &[sup.dx.unwrap_or(0.0),sup.dy.unwrap_or(0.0),sup.dz.unwrap_or(0.0)]);
                    if u_normal != 0.0 {
                        if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                            if d >= nf {
                                u_r[d - nf] = u_normal;
                            }
                        }
                    }
                    // Rotational prescribed values use the standard flags.
                    for (i, pd) in [sup.drx, sup.dry, sup.drz].iter().enumerate() {
                        if let Some(val) = pd {
                            if *val != 0.0 {
                                if let Some(&d) = dof_num.map.get(&(sup.node_id, 3 + i)) {
                                    if d >= nf {
                                        u_r[d - nf] = *val;
                                    }
                                }
                            }
                        }
                    }
                    continue;
                }
            }
        }
        let prescribed = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
        for (i, pd) in prescribed.iter().enumerate() {
            if let Some(val) = pd {
                if *val != 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                        if d >= nf {
                            u_r[d - nf] = *val;
                        }
                    }
                }
            }
        }
    }
    u_r
}

pub fn prepare_static_3d(input: &SolverInput3D) -> Result<PreparedStatic3D, String> {
    prepare_static_3d_for_analysis(input, crate::known_issues::Analysis::Linear)
}

fn prepare_static_3d_for_analysis(input: &SolverInput3D, analysis: crate::known_issues::Analysis) -> Result<PreparedStatic3D, String> {
    validate_input_3d_for_analysis(input, analysis)?;
    // The prepared (factor-once) path assembles no constraints. Every caller
    // routes constrained models elsewhere today; refusing here keeps a new
    // caller from silently solving the model without them (the dense
    // reference did: found by the metamorphic relabel check).
    if !input.constraints.is_empty() {
        return Err("prepared static solve does not support constraints: solve the model with solve_3d (constrained solver)".into());
    }
    // Known issues of the model as given (an arch is only visible before its expansion); they
    // go with the pre-solve diagnostics into every result of this preparation.
    crate::known_issues::refuse(&crate::known_issues::for_3d(input, analysis))?;
    let known_model: Vec<_> = crate::known_issues::for_3d(input, analysis).into_iter().filter(|d| d.code == DiagnosticCode::KnownIssue).collect();
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
    let mut pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_3d(&input);
    pre_solve_diags.extend(known_model);
    validate_solver_options(&input.solver_options, &mut pre_solve_diags);

    // ── Input validation (before assembly) ──
    validate_input_3d_for_analysis(&input, analysis)?;

    // An element that cannot be integrated over — collapsed, or folded onto
    // itself — is refused by name, before it fails downstream as "Singular
    // stiffness matrix — structure is a mechanism". Only those: see
    // `refuse_broken_elements` for why not every gate `Error`.
    super::pre_solve_gates::refuse_broken_elements(&pre_solve_diags)?;

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    // Build prescribed displacement vector u_r for restrained DOFs
    let u_r = prescribed_displacements_3d(&input, &dof_num);

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
            membrane_guard: crate::known_issues::MembraneBendingGuard::for_analysis(&input, analysis),
            input,
            dof_num,
            n,
            nf,
            nr,
            n_elements,
            n_nodes,
            u_r,
            pre_solve_diags,
            stability: super::stability::Stability::stable(),
            path: PreparedPath3D::FullyRestrained(FullyRestrained3D {
                ku_full,
                diagnostics: stiff.diagnostics,
                inclined_transforms: stiff.inclined_transforms,
            }),
        });
    }

    if n >= SPARSE_THRESHOLD {
        let t0 = now_micros();
        let mut stiff = super::assembly::without_artificial_stiffness(|| super::sparse_assembly::assemble_stiffness_sparse_3d_parallel(&input, &dof_num, true));
        let assembly_us = now_micros().saturating_sub(t0);

        let mut solver_diags_base: Vec<SolverDiagnostic> = Vec::new();

        let t0 = now_micros();
        let (k_ff, stability) = super::stability::prepare_free_stiffness(&stiff.k_ff, &dof_num, false, None, &super::stability::coupling_3d(&input, &dof_num), &super::stability::released_rotations_3d(&input, &dof_num))?;
        stiff.k_ff = k_ff;
        let conditioning = super::conditioning::check_sparse_conditioning(&stiff.k_ff);
        pre_solve_diags.extend(conditioning.structured_diagnostics());
        solver_diags_base.extend(conditioning.legacy_diagnostics());
        let conditioning_us = now_micros().saturating_sub(t0);

        let solver_opts = resolve_solver_options(&input.solver_options, nf, &mut solver_diags_base);
        let use_pcg = solver_opts.method == SolverMethod::Pcg
            || (solver_opts.method == SolverMethod::Auto && nf >= ITERATIVE_THRESHOLD);
        let has_prescribed = u_r.iter().any(|v| v.abs() > 1e-15);
        let kfr_ur = if has_prescribed {
            stiff.k_full.as_ref().unwrap().sparse_cross_block_matvec(&u_r, nf)
        } else {
            vec![0.0; nf]
        };
        let nnz_kff = stiff.k_ff.col_ptr[nf];
        if use_pcg {
            return Ok(PreparedStatic3D {
                membrane_guard: crate::known_issues::MembraneBendingGuard::for_analysis(&input, analysis),
                input,
                dof_num,
                n,
                nf,
                nr,
                n_elements,
                n_nodes,
                u_r,
                pre_solve_diags,
                stability,
                path: PreparedPath3D::Pcg(PcgPrepared3D {
                    k_ff: stiff.k_ff,
                    k_full: stiff.k_full.unwrap(),
                    opts: solver_opts,
                    kfr_ur,
                    nnz_kff,
                    diagnostics: stiff.diagnostics,
                    inclined_transforms: stiff.inclined_transforms,
                    solver_diags_base,
                    assembly_us,
                    conditioning_us,
                    direct: std::cell::OnceCell::new(),
                }),
            });
        }

        let t0 = now_micros();
        let sym = Rc::new(symbolic_cholesky(&stiff.k_ff));
        let symbolic_us = now_micros().saturating_sub(t0);
        let nnz_l = sym.l_nnz;

        let t0 = now_micros();
        let num = numeric_cholesky(&sym, &stiff.k_ff).ok_or_else(not_positive_definite)?;
        let numeric_us = now_micros().saturating_sub(t0);

        Ok(PreparedStatic3D {
            membrane_guard: crate::known_issues::MembraneBendingGuard::for_analysis(&input, analysis),
            input,
            dof_num,
            n,
            nf,
            nr,
            n_elements,
            n_nodes,
            u_r,
            pre_solve_diags,
            stability,
            path: PreparedPath3D::Sparse(SparsePrepared3D {
                k_ff: stiff.k_ff,
                k_full: stiff.k_full.unwrap(),
                num,
                kfr_ur,
                nnz_kff,
                nnz_l,
                diagnostics: stiff.diagnostics,
                inclined_transforms: stiff.inclined_transforms,
                solver_diags_base,
                assembly_us,
                conditioning_us,
                symbolic_us,
                numeric_us,
                dense_lu: std::cell::OnceCell::new(),
            }),
        })
    } else {
        let stiff = super::assembly::without_artificial_stiffness(|| assemble_stiffness_3d(&input, &dof_num));

        let free_idx: Vec<usize> = (0..nf).collect();
        let rest_idx: Vec<usize> = (nf..n).collect();
        let mut k_ff = extract_submatrix(&stiff.k, n, &free_idx, &free_idx);
        let (pinned, stability) = super::stability::prepare_free_stiffness(&CscMatrix::from_dense_symmetric_exact(&k_ff, nf), &dof_num, false, None, &super::stability::coupling_3d(&input, &dof_num), &super::stability::released_rotations_3d(&input, &dof_num))?;
        k_ff = pinned.to_dense_symmetric();
        let conditioning = super::conditioning::check_conditioning(&k_ff, nf);
        pre_solve_diags.extend(conditioning.structured_diagnostics());

        let k_fr = extract_submatrix(&stiff.k, n, &free_idx, &rest_idx);
        let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
        let k_rf = extract_submatrix(&stiff.k, n, &rest_idx, &free_idx);
        let k_rr = extract_submatrix(&stiff.k, n, &rest_idx, &rest_idx);
        let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);

        let mut factor = k_ff.clone();
        if !cholesky_decompose(&mut factor, nf) { return Err(not_positive_definite()); }

        Ok(PreparedStatic3D {
            membrane_guard: crate::known_issues::MembraneBendingGuard::for_analysis(&input, analysis),
            input,
            dof_num,
            n,
            nf,
            nr,
            n_elements,
            n_nodes,
            u_r,
            pre_solve_diags,
            stability,
            path: PreparedPath3D::Dense(DensePrepared3D {
                conditioning_warnings: conditioning.legacy_diagnostics(),
                k_ff,
                k_rf,
                k_fr_ur,
                k_rr_ur,
                factor,
                diagnostics: stiff.diagnostics,
                inclined_transforms: stiff.inclined_transforms,
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
        self.refuse_loads_on_free_rotations(loads)?;
        let mut r = self.solve_loads_by_path(loads)?;
        // Known issues of this load set (the model's are in the pre-solve diagnostics).
        crate::known_issues::attach(&mut r.structured_diagnostics, crate::known_issues::loads_3d(loads));
        let (beyond, chords, spans) = crate::known_issues::small_displacement_3d(&self.input, loads, &r);
        crate::known_issues::attach(&mut r.structured_diagnostics, beyond.into_iter().collect());
        let summary = r.result_summary.get_or_insert_with(Default::default);
        summary.member_chords = Some(chords);
        summary.member_spans = Some(spans);
        let (second, ratio) = crate::known_issues::second_order_3d(&self.input, loads, &r);
        crate::known_issues::attach(&mut r.structured_diagnostics, second);
        r.result_summary.get_or_insert_with(Default::default).second_order_ratio = Some(ratio);
        crate::known_issues::refuse(&r.structured_diagnostics)?;
        self.membrane_guard.check(loads, &r)?;
        let residual = self.check_returned_displacements(loads, &r).map_err(|error| {
            if r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::ExcessiveDisplacement) {
                format!("{error}; excessive displacement indicates a likely mechanism or instability")
            } else { error }
        })?;
        r.structured_diagnostics.push(residual);
        super::conditioning_accuracy::member_balance_3d(&self.input, loads, &self.dof_num, &self.stability, &r, None)?;
        super::self_checks::static_3d(&mut r, &[])?;
        Ok(r)
    }

    pub(super) fn check_returned_displacements(&self, loads: &[SolverLoad3D], r: &AnalysisResults3D) -> Result<StructuredDiagnostic, String> {
        let nf = self.dof_num.n_free;
        let mut u = self.dof_num.displacement_vector_3d(&r.displacements);
        let its = self.inclined_transforms();
        for it in its { it.rotate(&mut u); }
        let mut f = super::sparse_assembly::assemble_load_vector_sparse_3d(&self.input, loads, &self.dof_num, its);
        f.truncate(nf);
        let ku = match &self.path {
            PreparedPath3D::FullyRestrained(_) => Vec::new(),
            PreparedPath3D::Dense(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.k_fr_ur) { *f -= coupling; }
                mat_vec_rect(&p.k_ff, &u[..nf], nf, nf)
            },
            PreparedPath3D::Sparse(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.kfr_ur) { *f -= coupling; }
                p.k_ff.sym_mat_vec(&u[..nf])
            },
            PreparedPath3D::Pcg(p) => {
                for (f, coupling) in f.iter_mut().zip(&p.kfr_ur) { *f -= coupling; }
                p.k_ff.sym_mat_vec(&u[..nf])
            },
        };
        let diagonal = match &self.path {
            PreparedPath3D::FullyRestrained(_) => vec![],
            PreparedPath3D::Dense(p) => (0..nf).map(|i| p.k_ff[i*nf+i]).collect(),
            PreparedPath3D::Sparse(p) => p.k_ff.diagonal(),
            PreparedPath3D::Pcg(p) => p.k_ff.diagonal(),
        };
        let residual: Vec<_> = ku.iter().zip(&f).map(|(k,f)| k-f).collect();
        super::self_checks::residual_energy(&residual, &f, &diagonal)
    }

    fn solve_loads_by_path(&self, loads: &[SolverLoad3D]) -> Result<AnalysisResults3D, String> {
        match &self.path {
            PreparedPath3D::FullyRestrained(p) => self.solve_loads_fully_restrained(loads, p),
            PreparedPath3D::Dense(p) => self.solve_loads_dense(loads, p),
            PreparedPath3D::Sparse(p) => self.solve_loads_sparse(loads, p),
            PreparedPath3D::Pcg(p) => self.solve_loads_pcg(loads, p),
        }
    }

    fn inclined_transforms(&self) -> &[InclinedTransformData] {
        match &self.path {
            PreparedPath3D::FullyRestrained(p) => &p.inclined_transforms,
            PreparedPath3D::Dense(p) => &p.inclined_transforms,
            PreparedPath3D::Sparse(p) => &p.inclined_transforms,
            PreparedPath3D::Pcg(p) => &p.inclined_transforms,
        }
    }

    fn refuse_loads_on_free_rotations(&self, loads: &[SolverLoad3D]) -> Result<(), String> {
        if self.stability.free_rotations().next().is_none() { return Ok(()); }
        let f = super::sparse_assembly::assemble_load_vector_sparse_3d(&self.input, loads, &self.dof_num, self.inclined_transforms());
        let rounding = super::load_work::assembly_rounding_3d(&self.input,loads,&self.dof_num,self.inclined_transforms());
        refuse_loaded_free_rotation_3d(&self.stability, &self.dof_num, &f[..self.nf], &rounding)
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
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full, Some(loads));
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full, Some(loads));

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
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full, Some(loads)),
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
        let load_rounding = if self.stability.free_rotations().next().is_some() { super::load_work::assembly_rounding_3d(input,loads,dof_num,&p.inclined_transforms) } else { Vec::new() };

        // F_f_modified = F_f − K_fr · u_r
        let mut f_f: Vec<f64> = f[..nf].to_vec();
        for i in 0..nf { f_f[i] -= p.k_fr_ur[i]; }

        let u_f = back_solve(&p.factor, &forward_solve(&p.factor, &f_f, nf), nf);
        let u_f = conditional_dense_refinement(&self.stability, &p.k_ff, &f_f, u_f,
            |rhs| back_solve(&p.factor, &forward_solve(&p.factor, rhs, nf), nf))?;

        // NaN/Inf guard: numerical blow-up means singular matrix.
        // Matches the 2D paths. A factorization can report success and still yield
        // non-finite values — `cholesky_decompose` only rejects a pivot <= 1e-15, it never
        // inspects the solved values — and nothing downstream re-checks: the JS wrapper
        // guards solver INPUT, and `postprocess::combinations` has no finiteness handling,
        // so a NaN here would silently poison a combination or an envelope.
        assert_finite_3d(&u_f)?;
        self.stability.check_pins_with_rounding(&u_f, &f[..nf], &p.k_fr_ur, &load_rounding)?;

        let mut solver_diags = p.conditioning_warnings.clone();
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

        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full, Some(loads));
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full, Some(loads));

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

        // Displacement sanity check — translational DOFs only
        let max_disp = dof_num.map.iter()
            .filter(|&(&(_node, local_dof), &global)| local_dof < 3 && global < nf)
            .map(|(&_, &global)| u_f[global].abs())
            .fold(0.0f64, f64::max);
        let char_length = {
            let (mut mn_x, mut mx_x) = (f64::MAX, f64::MIN);
            let (mut mn_y, mut mx_y) = (f64::MAX, f64::MIN);
            let (mut mn_z, mut mx_z) = (f64::MAX, f64::MIN);
            for node in crate::ordered::values(&input.nodes) {
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
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full, Some(loads)),
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

    /// Dense LU fallback (per case): triangular solve against the dense LU of K_ff,
    /// factored ONCE from the already-assembled sparse CSC (unshifted) and cached in
    /// the prepared struct. The OLD version re-assembled the full dense K and
    /// re-factored it per load case. `f_f` is the case's free load vector, already
    /// corrected for prescribed displacements (same input the sparse solve used).
    fn dense_lu_fallback_3d(&self, p: &SparsePrepared3D, f_f: &[f64]) -> Result<Vec<f64>, String> {
        let nf = self.nf;
        let lu = p.dense_lu.get_or_init(|| {
            let mut k_ff_d = p.k_ff.to_dense_symmetric();
            lu_factor(&mut k_ff_d, nf).map(|piv| (k_ff_d, piv))
        });
        match lu {
            Some((a, piv)) => lu_apply(a, piv, f_f, nf)
                .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string()),
            None => Err("Singular stiffness matrix — structure is a mechanism".to_string()),
        }
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
        let load_rounding = if self.stability.free_rotations().next().is_some() { super::load_work::assembly_rounding_3d(input,loads,dof_num,&p.inclined_transforms) } else { Vec::new() };

        let mut solver_diags = p.solver_diags_base.clone();
        let mut dense_fb_us: u64 = 0;

        // F_f modified for prescribed displacements: F_f −= K_fr · u_r (precomputed)
        let mut f_f: Vec<f64> = f[..nf].to_vec();
        for i in 0..nf { f_f[i] -= p.kfr_ur[i]; }

        // Triangular solve with the precomputed sparse Cholesky factor
        let t0 = now_micros();
        let u = refined_sparse_solve(&p.k_ff, &p.num, &f_f)?;

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
            let u_fb = self.dense_lu_fallback_3d(p, &f_f)?;
            dense_fb_us = now_micros().saturating_sub(t0);
            (u_fb, s_us, r_us)
        };

        // NaN/Inf guard — see `solve_loads_dense`. Placed after the branch so it covers
        // both the sparse Cholesky result and the dense LU fallback.
        let u_f = conditional_sparse_refinement(&self.stability, &p.k_ff, &f_f, u_f, |rhs| sparse_cholesky_solve(&p.num, rhs))?;
        assert_finite_3d(&u_f)?;
        self.stability.check_pins_with_rounding(&u_f, &f[..nf], &p.kfr_ur, &load_rounding)?;

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
        let rel_residual = if used_residual_fallback || self.stability.needs_accuracy_check() {
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
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full, Some(loads));
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full, Some(loads));
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
            pivot_perturbations: 0,
            max_perturbation: 0.0,
            pcg_iterations: None,
            pcg_final_residual: None,
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

        // Displacement sanity check — translational DOFs only
        let max_disp = dof_num.map.iter()
            .filter(|&(&(_node, local_dof), &global)| local_dof < 3 && global < nf)
            .map(|(&_, &global)| u_f[global].abs())
            .fold(0.0f64, f64::max);
        let char_length = {
            let (mut mn_x, mut mx_x) = (f64::MAX, f64::MIN);
            let (mut mn_y, mut mx_y) = (f64::MAX, f64::MIN);
            let (mut mn_z, mut mx_z) = (f64::MAX, f64::MIN);
            for node in crate::ordered::values(&input.nodes) {
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
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full, Some(loads)),
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

    fn pcg_direct_fallback_3d(p: &PcgPrepared3D) -> PcgDirectFallback3D {
        let t0 = now_micros();
        let sym = Rc::new(symbolic_cholesky(&p.k_ff));
        let symbolic_us = now_micros().saturating_sub(t0);
        let nnz_l = sym.l_nnz;

        let t0 = now_micros();
        let num = numeric_cholesky(&sym, &p.k_ff);
        let numeric_us = now_micros().saturating_sub(t0);

        PcgDirectFallback3D {
            num,
            nnz_l,
            symbolic_us,
            numeric_us,
            dense_lu: std::cell::OnceCell::new(),
        }
    }

    fn solve_loads_pcg(
        &self,
        loads: &[SolverLoad3D],
        p: &PcgPrepared3D,
    ) -> Result<AnalysisResults3D, String> {
        // Cache the load-independent check/fallback outside the per-case
        // timer. Its symbolic/numeric timings are accounted for below, just
        // as on the direct prepared path (without counting them twice).
        let direct = p.direct.get_or_init(|| Self::pcg_direct_fallback_3d(p));
        let num = direct.num.as_ref().ok_or_else(not_positive_definite)?;
        let t_total = now_micros();
        let input = &self.input;
        let dof_num = &self.dof_num;
        let (n, nf, nr) = (self.n, self.nf, self.nr);

        // Rebuild only the load vector for this case
        let f = super::sparse_assembly::assemble_load_vector_sparse_3d(input, loads, dof_num, &p.inclined_transforms);
        let load_rounding = if self.stability.free_rotations().next().is_some() { super::load_work::assembly_rounding_3d(input,loads,dof_num,&p.inclined_transforms) } else { Vec::new() };

        let mut solver_diags = p.solver_diags_base.clone();
        let mut dense_fb_us: u64 = 0;

        // F_f modified for prescribed displacements: F_f −= K_fr · u_r (precomputed)
        let mut f_f: Vec<f64> = f[..nf].to_vec();
        for i in 0..nf { f_f[i] -= p.kfr_ur[i]; }

        // Iterative solve with verified convergence; the preconditioner chain
        // degrades on the TRUE relative residual (≤ 1e-6).
        let t0 = now_micros();
        let pcg = try_pcg_solve(&p.k_ff, &f_f, &p.opts, &mut solver_diags);
        let pcg_us = now_micros().saturating_sub(t0);

        let mut used_residual_fallback = false;
        let direct_symbolic_us = direct.symbolic_us;
        let direct_numeric_us = direct.numeric_us;
        let direct_nnz_l = direct.nnz_l;

        // Solve Kff · u_f = f_f
        let (u_f, solve_us, residual_us, rel_residual, pcg_meta): (Vec<f64>, u64, u64, f64, Option<(usize, f64, &'static str)>) =
            if let Some(outcome) = pcg {
                solver_diags.push(SolverDiagnostic {
                    category: "solver_path".into(),
                    message: format!(
                        "PCG solver ({} preconditioner, {} iterations, {} free DOFs)",
                        outcome.preconditioner, outcome.iterations, nf
                    ),
                    severity: "info".into(),
                });
                (
                    outcome.u,
                    pcg_us,
                    0,
                    outcome.true_rel_residual,
                    Some((outcome.iterations, outcome.true_rel_residual, outcome.preconditioner)),
                )
            } else {
                // PCG failed stability or residual verification — reuse the
                // cached direct chain, retaining its warnings and errors.

                // Dense LU last resort (shared by both failure modes).
                let dense_lu = |direct: &PcgDirectFallback3D, f_f: &[f64]| -> Result<Vec<f64>, String> {
                    let lu = direct.dense_lu.get_or_init(|| {
                        let mut k_ff_d = p.k_ff.to_dense_symmetric();
                        lu_factor(&mut k_ff_d, nf).map(|piv| (k_ff_d, piv))
                    });
                    match lu {
                        Some((a, piv)) => lu_apply(a, piv, f_f, nf)
                            .ok_or_else(|| "Singular stiffness matrix — structure is a mechanism".to_string()),
                        None => Err("Singular stiffness matrix — structure is a mechanism".to_string()),
                    }
                };

                {
                    {
                        let t0 = now_micros();
                        let u = refined_sparse_solve(&p.k_ff, num, &f_f)?;
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

                        if rel_residual < 1e-6 {
                            solver_diags.push(SolverDiagnostic {
                                category: "solver_path".into(),
                                message: format!("Sparse Cholesky solver ({} free DOFs)", nf),
                                severity: "info".into(),
                            });
                            (u, s_us, r_us, rel_residual, None)
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
                            let u_fb = dense_lu(direct, &f_f)?;
                            dense_fb_us = now_micros().saturating_sub(t0);
                            (u_fb, s_us, r_us, f64::NAN, None)
                        }
                    }
                }
            };
        // NaN/Inf guard — see `solve_loads_dense`. Covers the PCG result and
        // both direct fallbacks.
        let u_f = conditional_sparse_refinement(&self.stability, &p.k_ff, &f_f, u_f, |rhs| sparse_cholesky_solve(num, rhs))?;
        assert_finite_3d(&u_f)?;
        self.stability.check_pins_with_rounding(&u_f, &f[..nf], &p.kfr_ur, &load_rounding)?;

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

        // If we fell back to dense LU (bad residual), recompute the residual
        // from the actual returned solution — the branch-local rel_residual
        // (NaN) described the rejected sparse attempt, not the final answer.
        let rel_residual = if used_residual_fallback || self.stability.needs_accuracy_check() {
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
        let plate_stresses = compute_plate_stresses(input, dof_num, &u_full, Some(loads));
        let quad_stresses = compute_quad_stresses(input, dof_num, &u_full, Some(loads));
        let stress_recovery_us = now_micros().saturating_sub(t0);

        let total_us = (p.assembly_us + p.conditioning_us + direct_symbolic_us + direct_numeric_us)
            + now_micros().saturating_sub(t_total);

        let timings = SolveTimings {
            assembly_ms: micros_to_ms(p.assembly_us),
            conditioning_ms: micros_to_ms(p.conditioning_us),
            symbolic_ms: micros_to_ms(direct_symbolic_us),
            numeric_ms: micros_to_ms(direct_numeric_us),
            solve_ms: micros_to_ms(solve_us),
            residual_ms: micros_to_ms(residual_us),
            dense_fallback_ms: micros_to_ms(dense_fb_us),
            reactions_ms: micros_to_ms(reactions_us),
            stress_recovery_ms: micros_to_ms(stress_recovery_us),
            total_ms: micros_to_ms(total_us),
            n_free: nf,
            nnz_kff: p.nnz_kff,
            nnz_l: direct_nnz_l,
            pivot_perturbations: 0,
            max_perturbation: 0.0,
            pcg_iterations: pcg_meta.map(|m| m.0),
            pcg_final_residual: pcg_meta.map(|m| m.1),
        };

        // Build structured diagnostics (enum-based, machine-matchable)
        let mut structured = Vec::new();
        structured.extend(self.pre_solve_diags.iter().cloned());

        // Solver path — report the actual solver that produced the returned result
        if let Some((iters, _, pname)) = pcg_meta {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::PcgSolve,
                Severity::Info,
                format!("PCG solver ({} preconditioner, {} iterations, {} free DOFs)", pname, iters, nf),
            ).with_phase("solve"));
        } else {
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::PcgFallbackDirect,
                Severity::Warning,
                format!("PCG failed verification, fell back to direct solver ({} free DOFs)", nf),
            ).with_phase("solve"));
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
                    format!("Sparse Cholesky solver ({} free DOFs, nnz(L)={})", nf, direct_nnz_l),
                ).with_phase("solve"));
            }
        }

        // Sparse fill ratio diagnostic (meaningful only when the factorization ran)
        if pcg_meta.is_none() && !used_residual_fallback {
            let fill_ratio = direct_nnz_l as f64 / p.nnz_kff.max(1) as f64;
            structured.push(StructuredDiagnostic::global(
                DiagnosticCode::SparseFillRatio,
                if fill_ratio > 20.0 { Severity::Warning } else { Severity::Info },
                format!("Sparse fill ratio: {:.1}x (nnz(K_ff)={}, nnz(L)={})", fill_ratio, p.nnz_kff, direct_nnz_l),
            ).with_value(fill_ratio, 20.0).with_phase("factorization"));
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
            for node in crate::ordered::values(&input.nodes) {
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
        let solver_label = if pcg_meta.is_some() {
            "PCG"
        } else if used_residual_fallback {
            "Dense LU fallback"
        } else {
            "Sparse Cholesky"
        };
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
            quad_nodal_stresses: compute_quad_nodal_stresses(input, dof_num, &u_full, Some(loads)),
            constraint_forces: vec![],
            diagnostics: p.diagnostics.clone(),
            solver_diagnostics: solver_diags,
            structured_diagnostics: structured,
            equilibrium: Some(equilibrium),
            timings: Some(timings),
            result_summary: None,
            solver_run_meta: Some(SolverRunMeta::new(
                if let Some((_, _, pname)) = pcg_meta {
                    pcg_solver_path(pname)
                } else if used_residual_fallback {
                    "sparse_fallback_dense_lu"
                } else {
                    "pcg_fallback_sparse_cholesky"
                },
                nf, self.n_elements, self.n_nodes,
            )),
        };
        results.result_summary = Some(crate::postprocess::result_summary::compute_result_summary_3d(&results));
        Ok(results)
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
    let mut reactions: Vec<Reaction> = Vec::new();
    // Several supports may target one node: its restrained-DOF reactions are
    // reported once, and the node gets a single entry (spring forces of all
    // its supports summed, as assembly adds all their stiffnesses).
    let mut reported = std::collections::HashSet::new();
    for sup in sorted_supports_2d(input) {
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

            let kx = support_dofs_2d(sup)[0].spring.unwrap_or(0.0);
            let ky = support_dofs_2d(sup)[1].spring.unwrap_or(0.0);
            let kz = support_dofs_2d(sup)[2].spring.unwrap_or(0.0);

            if let Some(angle) = sup.angle.map(super::support::prepare_support_angle) {
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
            // assemble_stiffness_2d adds a rigid support's own springs to K on
            // free and restrained DOFs alike, so the restrained partition
            // holds only the rigid part and each spring's −k·u is added here;
            // build_reactions_2d_inclined adds them for rotated rollers.
            let springs = [support_dofs_2d(sup)[0].spring, support_dofs_2d(sup)[1].spring, support_dofs_2d(sup)[2].spring];
            let rotated = sup.support_type == "inclinedRoller";
            let mut vals = [0.0f64; 3];
            for (i, val) in vals.iter_mut().enumerate().take(dof_num.dofs_per_node.min(3)) {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                    if d >= nf && reported.insert(d) {
                        *val = reactions_vec[d - nf];
                    }
                    let k = springs[i].unwrap_or(0.0);
                    if !rotated && k > 0.0 {
                        *val -= k * u_full[d];
                    }
                }
            }
            rx = vals[0];
            rz = vals[1];
            my = vals[2];
        }

        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == sup.node_id) {
            r.rx += rx;
            r.rz += rz;
            r.my += my;
        } else {
            reactions.push(Reaction {
                node_id: sup.node_id,
                rx, rz, my,
            });
        }
    }
    reactions
}

/// Supports in id order, so reactions are built deterministically.
fn sorted_supports_2d(input: &SolverInput) -> Vec<&SolverSupport> {
    let mut sups: Vec<&SolverSupport> = crate::ordered::values(&input.supports).collect();
    sups.sort_by_key(|s| s.id);
    sups
}

pub(crate) fn build_reactions_2d_inclined(
    input: &SolverInput,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    f_r: &[f64],
    nf: usize,
    u_full: &[f64],
    inclined_transforms: &[InclinedTransformData2D],
) -> Vec<Reaction> {
    let mut reactions = build_reactions_2d(input, dof_num, reactions_vec, f_r, nf, u_full);

    // Back-transform inclined support reactions from rotated to global frame.
    // `build_reactions_2d` leaves the rotated slots of an inclined roller as
    // (0, R_n): the tangent is free and its spring force is skipped there.
    // A spring on the roller (kx, ky) is assembled in GLOBAL axes before the
    // rotation, so its force −k·u is added here in global axes (it used to be
    // dropped, and the reactions did not balance the loads).
    for it in inclined_transforms {
        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == it.node_id) {
            let rotated = [r.rx, r.rz];
            // r_global = R^T * r_rotated
            r.rx = it.r[0][0] * rotated[0] + it.r[1][0] * rotated[1];
            r.rz = it.r[0][1] * rotated[0] + it.r[1][1] * rotated[1];
            for sup in crate::ordered::values(&input.supports).filter(|s| s.node_id == it.node_id && s.support_type == "inclinedRoller") {
                let (ux, uz) = (u_full[it.dofs[0]], u_full[it.dofs[1]]);
                r.rx -= support_dofs_2d(sup)[0].spring.unwrap_or(0.0).max(0.0) * ux;
                r.rz -= support_dofs_2d(sup)[1].spring.unwrap_or(0.0).max(0.0) * uz;
            }
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
    let mut reactions: Vec<Reaction3D> = Vec::new();
    // As in build_reactions_2d: restrained-DOF reactions once per node, one
    // entry per node.
    let mut reported = std::collections::HashSet::new();
    let mut sups: Vec<&SolverSupport3D> = crate::ordered::values(&input.supports).collect();
    sups.sort_by_key(|s| s.node_id);
    for sup in sups {
        let mut vals = [0.0f64; 6];

        let spring_stiffs = [support_dofs_3d(sup)[0].spring, support_dofs_3d(sup)[1].spring, support_dofs_3d(sup)[2].spring, support_dofs_3d(sup)[3].spring, support_dofs_3d(sup)[4].spring, support_dofs_3d(sup)[5].spring];
        for i in 0..6.min(dof_num.dofs_per_node) {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                if d >= nf {
                    // Restrained DOF: reaction from solve
                    if reported.insert(d) {
                        vals[i] = reactions_vec[d - nf];
                    }
                } else {
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
                    reported.insert(d).then(|| reactions_vec[d - nf])
                } else {
                    let kw = support_dofs_3d(sup)[6].spring.unwrap_or(0.0);
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

        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == sup.node_id) {
            for (x, v) in [&mut r.fx, &mut r.fy, &mut r.fz, &mut r.mx, &mut r.my, &mut r.mz].into_iter().zip(vals) {
                *x += v;
            }
            if let Some(b) = bimoment {
                r.bimoment = Some(r.bimoment.unwrap_or(0.0) + b);
            }
        } else {
            reactions.push(Reaction3D {
                node_id: sup.node_id,
                fx: vals[0], fy: vals[1], fz: vals[2],
                mx: vals[3], my: vals[4], mz: vals[5],
                bimoment,
            });
        }
    }
    reactions
}

/// Build 3D reactions with inclined support back-transformation.
pub(crate) fn build_reactions_3d_inclined(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    reactions_vec: &[f64],
    f_r: &[f64],
    nf: usize,
    u_full: &[f64],
    inclined_transforms: &[InclinedTransformData],
) -> Vec<Reaction3D> {
    let mut reactions = build_reactions_3d(input, dof_num, reactions_vec, f_r, nf, u_full);

    // Back-transform inclined support reactions from rotated to global frame.
    // Only the normal slot (0) is restrained: its reaction R_n is in the
    // rotated frame. The tangential slots are free; `build_reactions_3d` put
    // −k·u of the GLOBAL springs ky, kz there (u is already global) and
    // dropped kx (slot 0 is restrained). The springs are assembled in global
    // axes before the rotation, so the reaction is Rᵀ[R_n, 0, 0] − k·u with
    // k·u in global components. Rotating the spring forces together with
    // R_n broke global equilibrium.
    for it in inclined_transforms {
        if let Some(r) = reactions.iter_mut().find(|r| r.node_id == it.node_id) {
            let rn = r.fx;
            let mut f = [it.r[0][0] * rn, it.r[0][1] * rn, it.r[0][2] * rn];
            if let Some(sup) = crate::ordered::values(&input.supports).find(|s| s.node_id == it.node_id && s.is_inclined.unwrap_or(false)) {
                let k = [support_dofs_3d(sup)[0].spring, support_dofs_3d(sup)[1].spring, support_dofs_3d(sup)[2].spring].map(|v| v.unwrap_or(0.0).max(0.0));
                for c in 0..3 {
                    f[c] -= k[c] * u_full[it.dofs[c]];
                }
            }
            r.fx = f[0];
            r.fy = f[1];
            r.fz = f[2];
        }
    }

    reactions
}

// ── Input validation helpers ──

/// Refuse unknown enum-like strings shared by every analysis (they used to
/// fall back silently): solver options (method, preconditioner, and invalid
/// PCG tolerance / iteration cap) and diaphragm planes. `planes` are the
/// planes accepted in this dimension.
fn reject_unknown_options(opts: &Option<SolverOptions>, constraints: &[Constraint], planes: &[&str], is_3d: bool) -> Result<(), String> {
    let quoted = |v: &[&str]| v.iter().map(|x| format!("\"{x}\"")).collect::<Vec<_>>().join(", ");
    if let Some(o) = opts {
        const METHODS: [&str; 3] = ["auto", "direct", "pcg"];
        const PRECONDITIONERS: [&str; 6] = ["ics", "ic0", "mic", "ssor", "jacobi", "none"];
        if let Some(m) = o.method.as_deref().filter(|m| !METHODS.contains(m)) {
            return Err(format!("solverOptions.method: unknown value '{m}'; expected one of {}", quoted(&METHODS)));
        }
        if let Some(p) = o.preconditioner.as_deref().filter(|p| !PRECONDITIONERS.contains(p)) {
            return Err(format!(
                "solverOptions.preconditioner: unknown value '{p}'; expected one of {}",
                quoted(&PRECONDITIONERS)
            ));
        }
        if let Some(t) = o.tolerance.filter(|t| !(t.is_finite() && *t > 0.0)) {
            return Err(format!("solverOptions.tolerance: {t} must be finite and > 0"));
        }
        if o.max_iterations == Some(0) {
            return Err("solverOptions.maxIterations: must be > 0".into());
        }
    }
    for c in constraints {
        if let Constraint::Diaphragm(d) = c {
            if !planes.contains(&d.plane.as_str()) {
                return Err(if is_3d {
                    format!(
                        "Diaphragm (master node {}): unknown plane '{}'; expected {}",
                        d.master_node,
                        d.plane,
                        quoted(planes)
                    )
                } else {
                    format!(
                        "Diaphragm (master node {}): plane '{}' is not the plane of a 2D model; expected {}",
                        d.master_node,
                        d.plane,
                        quoted(planes)
                    )
                });
            }
        }
    }
    Ok(())
}

/// Several supports on one node. Plain rigid restraints merge: a DOF is
/// restrained if any of them restrains it (DofNumbering ORs them in 2D and 3D,
/// and the node gets one reaction entry). Anything else is ambiguous (which
/// spring, which settlement, which inclined direction?) and the solver used to
/// read it differently per path: 2D kept only the highest-id support, so a
/// `fixed` support followed by a `spring` left the node on the spring alone; 3D
/// took springs and the inclined flag from one support picked in hash order.
/// Such a model is rejected with an error naming the node. The web app keeps
/// one support per node.
///
/// `sups` are (node id, support key in the input map, plain rigid restraint?).
fn reject_ambiguous_shared_supports<'a>(sups: impl Iterator<Item = (usize, &'a str, bool)>) -> Result<(), String> {
    let mut by_node: std::collections::BTreeMap<usize, Vec<(&str, bool)>> = std::collections::BTreeMap::new();
    for (node, key, plain) in sups {
        by_node.entry(node).or_default().push((key, plain));
    }
    for (node, mut sups) in by_node {
        if sups.len() < 2 || sups.iter().all(|&(_, plain)| plain) {
            continue;
        }
        sups.sort();
        let keys: Vec<&str> = sups.iter().map(|&(k, _)| k).collect();
        return Err(format!(
            "Node {node} has several supports ({}) and not all are plain rigid restraints \
             (springs, prescribed displacements or inclined directions); merge them into a single support",
            keys.join(", ")
        ));
    }
    Ok(())
}

/// The 2D support types DofNumbering and assembly understand ("free" restrains
/// nothing, on purpose).
const SUPPORT_TYPES_2D: [&str; 11] = [
    "fixed", "pinned", "rollerX", "rollerY", "rollerZ", "guidedX", "guidedY", "guidedZ", "inclinedRoller", "spring", "free",
];

fn zero_or_none(v: Option<f64>) -> bool {
    v.is_none_or(|x| x == 0.0)
}

/// A 2D support that only restrains DOFs rigidly (no spring, settlement or angle).
fn plain_rigid_2d(s: &SolverSupport) -> bool {
    matches!(
        s.support_type.as_str(),
        "fixed" | "pinned" | "rollerX" | "rollerY" | "rollerZ" | "guidedX" | "guidedY" | "guidedZ"
    ) && [support_dofs_2d(s)[0].spring, support_dofs_2d(s)[1].spring, support_dofs_2d(s)[2].spring, s.dx, s.dz, s.dry, s.angle].into_iter().all(zero_or_none)
}

/// A 3D support that only restrains DOFs rigidly (no spring, settlement or
/// inclined direction).
fn plain_rigid_3d(s: &SolverSupport3D) -> bool {
    !s.is_inclined.unwrap_or(false)
        && [s.normal_x, s.normal_y, s.normal_z].iter().all(Option::is_none)
        && [support_dofs_3d(s)[0].spring, support_dofs_3d(s)[1].spring, support_dofs_3d(s)[2].spring, support_dofs_3d(s)[3].spring, support_dofs_3d(s)[4].spring, support_dofs_3d(s)[5].spring, support_dofs_3d(s)[6].spring, s.dx, s.dy, s.dz, s.drx, s.dry, s.drz]
            .into_iter()
            .all(zero_or_none)
}

/// A prescribed value that is not zero (an absent or zero field imposes nothing).
fn imposed(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.abs() > 1e-15)
}

fn unimposed_settlement(what: &str, name: &str, v: f64, why: &str) -> String {
    format!(
        "{what}: the prescribed {name} = {v} would not be applied, because {why}. \
         Restrain that direction to impose it, or remove the prescribed value."
    )
}

/// AC-10, 2D: refuse a prescribed displacement on a DOF the support leaves free.
fn reject_unimposed_settlements_2d(input: &SolverInput) -> Result<(), String> {
    let dpn = DofNumbering::dofs_per_node_2d(input);
    let mut sups: Vec<&SolverSupport> = crate::ordered::values(&input.supports).collect();
    sups.sort_by_key(|s| (s.node_id, s.id));
    for sup in sups {
        let what = format!("Support {} (node {}, {})", sup.id, sup.node_id, sup.support_type);
        if sup.support_type == "spring" {
            for (name, v) in [("dx", sup.dx), ("dz", sup.dz), ("dry", sup.dry)] {
                if let Some(v) = imposed(v) {
                    return Err(unimposed_settlement(&what, name, v,
                        "a spring support restrains nothing rigidly (its stiffness is added to the structure) and a settlement of the spring's base is not modelled"));
                }
            }
            continue;
        }
        if sup.support_type == "inclinedRoller" {
            // (dx, dz) is the ground's movement in global axes; the roller transmits its normal
            // part only (`prescribed_displacements_2d` projects it), the rest is the roller
            // sliding. The rotation is free.
            if let Some(v) = imposed(sup.dry) {
                return Err(unimposed_settlement(&what, "dry", v, "an inclined roller leaves the rotation free"));
            }
            continue;
        }
        for (dof, name, v) in [(0usize, "dx", sup.dx), (1, "dz", sup.dz), (2, "dry", sup.dry)] {
            let Some(v) = imposed(v) else { continue };
            if dof >= dpn {
                return Err(unimposed_settlement(&what, name, v, "a model of truss members only has no rotation DOFs"));
            }
            if !super::dof::is_dof_restrained_2d(sup, dof) {
                return Err(unimposed_settlement(&what, name, v, "this support type leaves that DOF free"));
            }
        }
    }
    Ok(())
}

fn reject_unimposed_settlements_3d(input: &SolverInput3D) -> Result<(), String> {
    // Curved beams are expanded into frame members after validation in several entry points
    // (Winkler, co-rotational, …): counted here as the frames they become, or a curved-beam-only
    // model would look like a truss model with no rotation DOFs.
    let dpn = DofNumbering::dofs_per_node_3d(input).max(if input.curved_beams.is_empty() { 0 } else { 6 });
    let mut sups: Vec<(&String, &SolverSupport3D)> = input.supports.iter().collect();
    sups.sort_by_key(|(k, s)| (s.node_id, (*k).clone()));
    for (key, sup) in sups {
        let what = format!("Support {key} (node {})", sup.node_id);
        let d = [sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz];
        let names = ["dx", "dy", "dz", "drx", "dry", "drz"];
        let support_dofs = super::support::support_dofs_3d(sup);
        let flags = support_dofs.map(|d| d.restrained);
        let inclined = sup.is_inclined.unwrap_or(false);
        if inclined {
            if let (Some(nx), Some(ny), Some(nz)) = (sup.normal_x, sup.normal_y, sup.normal_z) {
                let len = (nx * nx + ny * ny + nz * nz).sqrt();
                if len > 1e-12 {
                    // (dx, dy, dz) is the ground's movement in global axes; the support transmits
                    // its normal part (`prescribed_displacements_3d` projects it), the rest is the
                    // support sliding in its plane. Rotations follow the flags.
                    for i in 3..6 {
                        let Some(v) = imposed(d[i]) else { continue };
                        if !flags[i] || i >= dpn {
                            return Err(unimposed_settlement(&what, names[i], v, "that rotation is not restrained"));
                        }
                    }
                    continue;
                }
            }
        }
        for i in 0..6 {
            let Some(v) = imposed(d[i]) else { continue };
            if i >= dpn {
                return Err(unimposed_settlement(&what, names[i], v, "a model of truss or cable members only has no rotation DOFs"));
            }
            if !flags[i] {
                let reason = if support_dofs[i].spring.is_some_and(|k| k > 0.0) {
                    "that direction is elastic (a spring cannot impose a prescribed displacement)"
                } else {
                    "that direction is not restrained (its flag is not set)"
                };
                return Err(unimposed_settlement(&what, names[i], v, reason));
            }
        }
    }
    Ok(())
}

pub(crate) fn validate_input_2d(input: &SolverInput) -> Result<(), String> {
    validate_input_2d_for_analysis(input, crate::known_issues::Analysis::Linear)
}

pub(crate) fn validate_input_2d_for_analysis(input: &SolverInput, analysis: crate::known_issues::Analysis) -> Result<(), String> {
    if analysis != crate::known_issues::Analysis::Cable {
        super::validity::require_cable_analysis(crate::ordered::values(&input.elements).filter(|e| e.elem_type == "cable").map(|e| e.id))?;
    }
    // 0. Non-finite input rejection (NaN/Inf). Note: JSON cannot carry NaN, so
    // this primarily protects native/Rust API callers and internally-built inputs.
    for n in crate::ordered::values(&input.nodes) {
        if !n.x.is_finite() || !n.z.is_finite() {
            return Err(format!("Node {}: coordinates must be finite", n.id));
        }
    }
    for m in crate::ordered::values(&input.materials) {
        if !m.e.is_finite() || !m.nu.is_finite() {
            return Err(format!("Material {}: E and nu must be finite", m.id));
        }
    }
    for s in crate::ordered::values(&input.sections) {
        if !s.a.is_finite() || !s.iz.is_finite() || s.as_y.is_some_and(|v| !v.is_finite()) {
            return Err(format!("Section {}: properties must be finite", s.id));
        }
        // A shear area enters as φ = 12EI/(G·As·L²): 0 gave φ = ∞ (NaN stiffness) and a
        // negative area a negative φ, silently. Omit it for Euler–Bernoulli.
        if s.as_y.is_some_and(|v| v <= 0.0) {
            return Err(format!("Section {}: shear area asY must be positive (omit it for no shear deformation)", s.id));
        }
    }
    for sup in crate::ordered::values(&input.supports) {
        for v in [support_dofs_2d(sup)[0].spring, support_dofs_2d(sup)[1].spring, support_dofs_2d(sup)[2].spring, sup.dx, sup.dz, sup.dry].into_iter().flatten() {
            if !v.is_finite() {
                return Err(format!("Support {}: numeric fields must be finite", sup.id));
            }
        }
    }
    // An unknown type restrained nothing, silently (a typo like "fixd" left the
    // node free).
    for sup in crate::ordered::values(&input.supports) {
        if !SUPPORT_TYPES_2D.contains(&sup.support_type.as_str()) {
            return Err(format!(
                "Support {}: unknown type '{}' (expected one of {})",
                sup.id,
                sup.support_type,
                SUPPORT_TYPES_2D.join(", ")
            ));
        }
    }
    reject_ambiguous_shared_supports(input.supports.iter().map(|(k, s)| (s.node_id, k.as_str(), plain_rigid_2d(s))))?;
    super::support::validate_supports_2d(input)?;
    reject_unimposed_settlements_2d(input)?;
    // In 2D the model plane is the only diaphragm plane: the model lies in
    // X–Z, and "XY" is its historical name. Both map to the 2D DOFs (ux, uz,
    // ry) since #397 (constraints::diaphragm_dofs); "YZ" names DOFs that do
    // not exist in 2D.
    reject_unknown_options(&input.solver_options, &input.constraints, &["XY", "XZ"], false)?;
    for load in &input.loads {
        let finite = match load {
            SolverLoad::Nodal(l) => l.fx.is_finite() && l.fz.is_finite() && l.my.is_finite(),
            SolverLoad::Distributed(l) => l.q_i.is_finite() && l.q_j.is_finite()
                && l.a.is_none_or(|v| v.is_finite()) && l.b.is_none_or(|v| v.is_finite()),
            SolverLoad::PointOnElement(l) => l.a.is_finite() && l.p.is_finite()
                && l.px.is_none_or(|v| v.is_finite()) && l.my.is_none_or(|v| v.is_finite()),
            SolverLoad::Thermal(l) => l.dt_uniform.is_finite() && l.dt_gradient.is_finite(),
            SolverLoad::AxialDistributed(l) => l.q_i.is_finite() && l.q_j.is_finite()
                && l.a.is_none_or(|v| v.is_finite()) && l.b.is_none_or(|v| v.is_finite()),
        };
        if !finite {
            return Err("Load contains non-finite (NaN/Inf) values".to_string());
        }
        if let SolverLoad::Thermal(l) = load {
            crate::types::check_frame_thermal_inputs(l.element_id, l.alpha, &[("depth", l.depth)])?;
        }
    }

    let node_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let mat_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.materials).map(|m| m.id).collect();
    let sec_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.sections).map(|s| s.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.elements).map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

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
    for elem in crate::ordered::values(&input.elements) {
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
            return Err(format!(
                "Element {}: unknown type '{}' (expected one of \"frame\", \"truss\", \"cable\")",
                elem.id, elem.elem_type
            ));
        }
    }

    // 2. Referential integrity — support → node
    for sup in crate::ordered::values(&input.supports) {
        if !node_ids.contains(&sup.node_id) {
            return Err(format!("Support {}: node {} does not exist", sup.id, sup.node_id));
        }
    }

    // 3. Referential integrity — load → node/element, and point-load positions
    validate_loads_2d(input, &input.loads)?;

    // 4. Material properties
    for mat in crate::ordered::values(&input.materials) {
        if mat.e <= 0.0 {
            return Err(format!("Material {}: E must be > 0 (got {})", mat.id, mat.e));
        }
        if mat.nu <= -1.0 || mat.nu >= 0.5 {
            return Err(format!("Material {}: Poisson ratio must be in (-1, 0.5) (got {})", mat.id, mat.nu));
        }
    }

    // 5. Zero-length elements
    for elem in crate::ordered::values(&input.elements) {
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
    for sec in crate::ordered::values(&input.sections) {
        if sec.a <= 0.0 {
            return Err(format!("Section {}: area A must be > 0", sec.id));
        }
    }

    // 7. Section inertia <= 0 where the analysis reads it.
    let bending_section_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.elements)
        .filter(|e| analysis == crate::known_issues::Analysis::Buckling || (e.elem_type == "frame" && !(e.hinge_start && e.hinge_end)))
        .map(|e| e.section_id)
        .collect();
    for sec in crate::ordered::values(&input.sections) {
        if bending_section_ids.contains(&sec.id) && sec.iz <= 0.0 {
            return Err(format!("Section {}: inertia must be > 0", sec.id));
        }
    }

    // 8. Connectors: end nodes, finite stiffness, and the DOFs they need.
    let node_xz: std::collections::HashMap<usize, &SolverNode> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    crate::element::connector::validate_connectors(
        &input.connectors,
        |id| node_xz.get(&id).map(|n| [n.x, n.z, 0.0]),
        DofNumbering::dofs_per_node_2d(input) >= 3,
    )?;
    super::assembly::refuse_connector_arm_mechanism_2d(input)?;

    Ok(())
}

/// Validate load references for 2D (load → node/element integrity and
/// point-load positions). Split from `validate_input_2d` so multi-case solves
/// can validate each case's loads independently of the structure.
pub(crate) fn validate_loads_2d(input: &SolverInput, loads: &[SolverLoad]) -> Result<(), String> {
    // A load set solved on a prepared model (load cases, WASM load sessions) skips the model
    // validation, so the thermal properties are checked here too (#407).
    for load in loads {
        if let SolverLoad::Thermal(l) = load {
            crate::types::check_frame_thermal_inputs(l.element_id, l.alpha, &[("depth", l.depth)])?;
        }
    }
    let node_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.elements).map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

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
            SolverLoad::AxialDistributed(l) => {
                if !elem_ids.contains(&l.element_id) {
                    return Err(format!("Axial distributed load: element {} does not exist", l.element_id));
                }
            }
        }
    }

    // Point load position validation
    for load in loads {
        if let SolverLoad::PointOnElement(pl) = load {
            if let Some(elem) = crate::ordered::values(&input.elements).find(|e| e.id == pl.element_id) {
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

    refuse_moments_without_rotation_2d(input, loads)?;

    Ok(())
}

/// The 2D counterpart of `refuse_moments_without_rotation_3d`. A nodal moment
/// on a node that nothing gives rotational stiffness — every frame hinged
/// there, only trusses, or a model without rotation DOFs — would be lost: the
/// rotation is an orphan DOF held by the assembler's artificial spring
/// (1e-10 of the largest diagonal), which took the whole moment, and the
/// reactions never saw it. The solver only stopped when the resulting rotation
/// exceeded 100 rad, so a moment below about 1e-8 of the stiffest diagonal
/// (3 kN·m on a 10 m² bar) vanished without a warning.
pub(crate) fn refuse_moments_without_rotation_2d(input: &SolverInput, loads: &[SolverLoad]) -> Result<(), String> {
    let moments = super::load_work::nonzero_nodal_moments(loads.iter().filter_map(|load| match load {
        SolverLoad::Nodal(n) => Some((n.node_id, [n.my])),
        _ => None,
    }));
    if moments.is_empty() {
        return Ok(());
    }
    if DofNumbering::dofs_per_node_2d(input) < 3 {
        return Err(moment_lost_2d(
            moments[0].0,
            "the model has no rotational degrees of freedom (trusses carry translations only)",
        ));
    }
    let mut carried: std::collections::HashSet<usize> = std::collections::HashSet::new();
    for e in crate::ordered::values(&input.elements) {
        if e.elem_type != "frame" {
            continue;
        }
        if !e.hinge_start { carried.insert(e.node_i); }
        if !e.hinge_end { carried.insert(e.node_j); }
    }
    carried.extend(super::assembly::connector_rotation_nodes_2d(input));
    for c in &input.constraints {
        match c {
            // Only a constraint that involves the rotation (DOF 2) carries it: one
            // tying translations alone left the slave's moment on the artificial
            // spring, and the constrained path returned a rotation of ~1e5 rad
            // (found by the metamorphic energy check, docs/verification/METAMORPHIC.md).
            Constraint::RigidLink(r) => {
                carried.insert(r.master_node);
                if r.dofs.contains(&2) { carried.insert(r.slave_node); }
            }
            Constraint::Diaphragm(d) => { carried.insert(d.master_node); carried.extend(&d.slave_nodes); }
            Constraint::LinearMPC(m) => carried.extend(m.terms.iter().filter(|t| t.dof == 2).map(|t| t.node_id)),
            Constraint::EqualDOF(e) => {
                if e.dofs.contains(&2) { carried.extend([e.master_node, e.slave_node]); }
            }
            Constraint::EccentricConnection(e) => {
                carried.insert(e.master_node);
                if !e.releases.get(2).copied().unwrap_or(false) { carried.insert(e.slave_node); }
            }
        }
    }
    for s in crate::ordered::values(&input.supports) {
        let rigid = crate::solver::support::support_dofs_2d(s)[2].restrained;
        let spring = support_dofs_2d(s)[2].spring.is_some_and(|k| k > 0.0);
        if rigid || spring {
            carried.insert(s.node_id);
        }
    }
    for (node, _) in moments {
        if !carried.contains(&node) {
            return Err(moment_lost_2d(
                node,
                "no unhinged frame end, rotational support, rotational connector or constraint gives that node rotational stiffness (every frame is hinged there, or only trusses reach it)",
            ));
        }
    }
    Ok(())
}

fn moment_lost_2d(node: usize, why: &str) -> String {
    format!(
        "Nodal moment at node {node} is not supported: {why}, so the moment would not reach the structure. \
         Apply it as a force couple, or connect the node to an unhinged frame end"
    )
}

pub(crate) fn validate_input_3d(input: &SolverInput3D) -> Result<(), String> {
    validate_input_3d_for_analysis(input, crate::known_issues::Analysis::Linear)
}

pub(crate) fn validate_input_3d_for_analysis(input: &SolverInput3D, analysis: crate::known_issues::Analysis) -> Result<(), String> {
    if analysis != crate::known_issues::Analysis::Cable {
        super::validity::require_cable_analysis(crate::ordered::values(&input.elements).filter(|e| e.elem_type == "cable").map(|e| e.id))?;
    }
    // Left-handed member axes are refused. `compute_local_axes_3d` reverses ey,
    // which makes the triad (ex, ey, ez) improper, but the element kernels assume
    // the right-hand kinematics θz = v', θy = −w': the v–θz and w–θy coupling
    // terms of Tᵀ·k·T then carry the wrong sign, so the stiffness changes with
    // the labelling of an axis (a skew cantilever's tip twist flipped sign and
    // its deflection moved 2%). No product path sends `leftHand: true` (the web
    // applies a user's left-handed convention to load entry only). See
    // docs/solver/frames.md, FR-1; test `left_handed_axes_are_refused`.
    if input.left_hand == Some(true) {
        return Err("leftHand: true is not supported: left-handed member axes would change the element stiffness. \
                    Use right-handed axes (leftHand false or omitted) and flip the sign of local-y loads and results instead."
            .to_string());
    }
    // 0. Non-finite input rejection (NaN/Inf) — core structural fields.
    for n in crate::ordered::values(&input.nodes) {
        if !n.x.is_finite() || !n.y.is_finite() || !n.z.is_finite() {
            return Err(format!("Node {}: coordinates must be finite", n.id));
        }
    }
    for m in crate::ordered::values(&input.materials) {
        if !m.e.is_finite() || !m.nu.is_finite() {
            return Err(format!("Material {}: E and nu must be finite", m.id));
        }
    }
    for s in crate::ordered::values(&input.sections) {
        let opts_finite = [s.cw, s.as_y, s.as_z, s.shear_center_y, s.shear_center_z].into_iter().flatten().all(|v| v.is_finite());
        if !s.a.is_finite() || !s.iy.is_finite() || !s.iz.is_finite() || !s.j.is_finite() || !opts_finite {
            return Err(format!("Section {}: properties must be finite", s.id));
        }
        // φ = 12EI/(G·As·L²): a zero shear area gave φ = ∞ (NaN stiffness), a negative one a
        // negative φ, silently. Omit it for Euler–Bernoulli.
        if [s.as_y, s.as_z].into_iter().flatten().any(|v| v <= 0.0) {
            return Err(format!("Section {}: shear areas asY/asZ must be positive (omit them for no shear deformation)", s.id));
        }
    }
    for sup in crate::ordered::values(&input.supports) {
        let vals = [support_dofs_3d(sup)[0].spring, support_dofs_3d(sup)[1].spring, support_dofs_3d(sup)[2].spring, support_dofs_3d(sup)[3].spring, support_dofs_3d(sup)[4].spring, support_dofs_3d(sup)[5].spring,
                    sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz,
                    support_dofs_3d(sup)[6].spring, sup.normal_x, sup.normal_y, sup.normal_z];
        if vals.into_iter().flatten().any(|v| !v.is_finite()) {
            return Err(format!("Support on node {}: numeric fields must be finite", sup.node_id));
        }
    }
    reject_ambiguous_shared_supports(input.supports.iter().map(|(k, s)| (s.node_id, k.as_str(), plain_rigid_3d(s))))?;
    reject_unknown_options(&input.solver_options, &input.constraints, &["XY", "XZ", "YZ"], true)?;
    // An inclined support needs its direction: without a non-zero normal it
    // used to solve silently as an ordinary support with its flags.
    for s in crate::ordered::values(&input.supports) {
        if s.is_inclined.unwrap_or(false) {
            let n = [s.normal_x, s.normal_y, s.normal_z];
            let len2: f64 = n.iter().map(|c| c.unwrap_or(0.0).powi(2)).sum();
            if n.iter().any(Option::is_none) || len2.sqrt() <= 1e-12 {
                return Err(format!("Support on node {}: an inclined support needs a non-zero normal (normalX, normalY, normalZ)", s.node_id));
            }
        }
    }
    super::support::validate_supports_3d(input)?;
    reject_unimposed_settlements_3d(input)?;
    for load in &input.loads {
        let finite = match load {
            SolverLoad3D::Nodal(l) => l.fx.is_finite() && l.fy.is_finite() && l.fz.is_finite()
                && l.mx.is_finite() && l.my.is_finite() && l.mz.is_finite()
                && l.bw.is_none_or(|v| v.is_finite()),
            SolverLoad3D::Distributed(l) => l.q_xi.is_finite() && l.q_xj.is_finite() && l.q_yi.is_finite() && l.q_yj.is_finite()
                && l.q_zi.is_finite() && l.q_zj.is_finite()
                && l.a.is_none_or(|v| v.is_finite()) && l.b.is_none_or(|v| v.is_finite()),
            SolverLoad3D::PointOnElement(l) => l.a.is_finite() && l.px.is_finite() && l.py.is_finite() && l.pz.is_finite(),
            SolverLoad3D::Thermal(l) => l.dt_uniform.is_finite()
                && l.dt_gradient_y.is_finite() && l.dt_gradient_z.is_finite(),
            // Shell/plate load variants keep their existing referential checks;
            // finite-checking their fields is deliberately out of scope here.
            _ => true,
        };
        if !finite {
            return Err("Load contains non-finite (NaN/Inf) values".to_string());
        }
        if let SolverLoad3D::Thermal(l) = load {
            crate::types::check_frame_thermal_inputs(l.element_id, l.alpha, &[("depthY", l.depth_y), ("depthZ", l.depth_z)])?;
        }
    }
    for e in crate::ordered::values(&input.elements) {
        if [e.local_yx, e.local_yy, e.local_yz, e.roll_angle].into_iter().flatten().any(|v| !v.is_finite()) {
            return Err(format!("Element {}: local axis fields must be finite", e.id));
        }
    }

    let node_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let mat_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.materials).map(|m| m.id).collect();
    let sec_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.sections).map(|s| s.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.elements).map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

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
    for elem in crate::ordered::values(&input.elements) {
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
            return Err(format!(
                "Element {}: unknown type '{}' (expected one of \"frame\", \"truss\", \"cable\")",
                elem.id, elem.elem_type
            ));
        }
    }

    // 1b. Referential integrity — curved beam → node, material, section.
    // Curved beams are expanded into frames before most paths validate, and
    // `expand_curved_beams_3d` leaves one it cannot resolve in place rather
    // than panic — so this is where such a beam is refused, on the input as
    // given or on the expanded one alike.
    for (i, cb) in input.curved_beams.iter().enumerate() {
        for (role, nid) in [("start", cb.node_start), ("mid", cb.node_mid), ("end", cb.node_end)] {
            if !node_ids.contains(&nid) {
                return Err(format!("Curved beam {}: {} node {} does not exist", i, role, nid));
            }
        }
        if !mat_ids.contains(&cb.material_id) {
            return Err(format!("Curved beam {}: material {} does not exist", i, cb.material_id));
        }
        if !sec_ids.contains(&cb.section_id) {
            return Err(format!("Curved beam {}: section {} does not exist", i, cb.section_id));
        }
    }

    // 1c. Curved-beam sizes: segment counts bounded, new ids representable.
    crate::element::check_curved_beam_sizes(
        &input.curved_beams,
        crate::ordered::values(&input.nodes).map(|n| n.id).max().unwrap_or(0),
        crate::ordered::values(&input.elements).map(|e| e.id).max().unwrap_or(0),
    )?;

    // 2. Referential integrity — support → node
    for sup in crate::ordered::values(&input.supports) {
        if !node_ids.contains(&sup.node_id) {
            return Err(format!("Support on node {}: node does not exist", sup.node_id));
        }
    }

    // 3. Referential integrity — load → node/element, and point-load positions
    validate_loads_3d(input, &input.loads)?;

    // 3b. Referential integrity — shell elements (plate/quad/quad9/solid-shell/curved-shell)
    // → node, material. Node-list lengths are fixed-size arrays ([usize; N]) so those are
    // guaranteed by the type system; only existence of the referenced ids needs checking.
    // Assembly and mass indexing dereference these ids directly (e.g. node_by_id[&plate.nodes[0]]),
    // so a dangling reference here would otherwise panic deep inside modal/TH/harmonic 3D.
    // Thickness is a physical property, not an activation flag. In particular,
    // t=0 makes MITC4's EAS matrix singular and its stiffness vanish; a frame
    // surrounding the shell can still factorize and hide that invalid input.
    for (kind, id, thickness) in crate::ordered::values(&input.plates).map(|p| ("Plate", p.id, p.thickness))
        .chain(crate::ordered::values(&input.quads).map(|q| ("Quad", q.id, q.thickness)))
        .chain(crate::ordered::values(&input.quad9s).map(|q| ("Quad9", q.id, q.thickness)))
        .chain(crate::ordered::values(&input.curved_shells).map(|c| ("Curved shell", c.id, c.thickness)))
    {
        if !thickness.is_finite() || thickness <= 0.0 {
            return Err(format!("{} {}: thickness must be finite and > 0 (got {})", kind, id, thickness));
        }
    }
    for p in crate::ordered::values(&input.plates) {
        for &nid in &p.nodes {
            if !node_ids.contains(&nid) {
                return Err(format!("Plate {}: node {} does not exist", p.id, nid));
            }
        }
        if !mat_ids.contains(&p.material_id) {
            return Err(format!("Plate {}: material {} does not exist", p.id, p.material_id));
        }
    }
    for q in crate::ordered::values(&input.quads) {
        for &nid in &q.nodes {
            if !node_ids.contains(&nid) {
                return Err(format!("Quad {}: node {} does not exist", q.id, nid));
            }
        }
        if !mat_ids.contains(&q.material_id) {
            return Err(format!("Quad {}: material {} does not exist", q.id, q.material_id));
        }
    }
    for q9 in crate::ordered::values(&input.quad9s) {
        for &nid in &q9.nodes {
            if !node_ids.contains(&nid) {
                return Err(format!("Quad9 {}: node {} does not exist", q9.id, nid));
            }
        }
        if !mat_ids.contains(&q9.material_id) {
            return Err(format!("Quad9 {}: material {} does not exist", q9.id, q9.material_id));
        }
    }
    for ss in crate::ordered::values(&input.solid_shells) {
        for &nid in &ss.nodes {
            if !node_ids.contains(&nid) {
                return Err(format!("Solid shell {}: node {} does not exist", ss.id, nid));
            }
        }
        if !mat_ids.contains(&ss.material_id) {
            return Err(format!("Solid shell {}: material {} does not exist", ss.id, ss.material_id));
        }
    }
    for cs in crate::ordered::values(&input.curved_shells) {
        for &nid in &cs.nodes {
            if !node_ids.contains(&nid) {
                return Err(format!("Curved shell {}: node {} does not exist", cs.id, nid));
            }
        }
        if !mat_ids.contains(&cs.material_id) {
            return Err(format!("Curved shell {}: material {} does not exist", cs.id, cs.material_id));
        }
    }

    // 4. Material properties
    for mat in crate::ordered::values(&input.materials) {
        if mat.e <= 0.0 {
            return Err(format!("Material {}: E must be > 0 (got {})", mat.id, mat.e));
        }
        if mat.nu <= -1.0 || mat.nu >= 0.5 {
            return Err(format!("Material {}: Poisson ratio must be in (-1, 0.5) (got {})", mat.id, mat.nu));
        }
    }

    // 5. Zero-length elements
    for elem in crate::ordered::values(&input.elements) {
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
    for sec in crate::ordered::values(&input.sections) {
        if sec.a <= 0.0 {
            return Err(format!("Section {}: area A must be > 0", sec.id));
        }
    }

    // 7. Section inertia <= 0 where the analysis reads it. A frame with all
    // bending+torsion released at both ends is axial-only outside buckling.
    let bending_section_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.elements)
        .filter(|e| {
            if analysis == crate::known_issues::Analysis::Buckling { return true; }
            if e.elem_type != "frame" { return false; }
            let all_released = e.release_my_start && e.release_my_end
                && e.release_mz_start && e.release_mz_end
                && e.release_t_start && e.release_t_end;
            !all_released
        })
        .map(|e| e.section_id)
        .collect();
    for sec in crate::ordered::values(&input.sections) {
        if bending_section_ids.contains(&sec.id) && (sec.iy <= 0.0 || sec.iz <= 0.0) {
            return Err(format!("Section {}: inertia must be > 0", sec.id));
        }
    }

    // 7b. Torsion constant J <= 0 on a member that carries torsion. Checked
    // here, by name, before assembly: the artificial stiffness the assembler
    // puts on DOFs no element is meant to stiffen (the rotations of a node
    // only solid shells or trusses reach, a fully released joint) would
    // otherwise hold the twist of a member whose own J is missing, and the
    // model would solve with a meaningless rotation instead of being refused.
    let torsion_section_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.elements)
        .filter(|e| e.elem_type == "frame" && !e.release_t_start && !e.release_t_end)
        .map(|e| e.section_id)
        .collect();
    for sec in crate::ordered::values(&input.sections) {
        if torsion_section_ids.contains(&sec.id) && sec.j <= 0.0 {
            return Err(format!(
                "Section {}: torsion constant J must be > 0 (got {}) for a member that is not released in torsion",
                sec.id, sec.j
            ));
        }
        if sec.cw.is_some_and(|cw| cw < 0.0) {
            return Err(format!("Section {}: warping constant Cw must be >= 0", sec.id));
        }
    }

    // 8. Connectors: end nodes, finite stiffness, and the DOFs they need.
    let node_xyz: std::collections::HashMap<usize, &SolverNode3D> = crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    crate::element::connector::validate_connectors(
        &input.connectors,
        |id| node_xyz.get(&id).map(|n| [n.x, n.y, n.z]),
        DofNumbering::dofs_per_node_3d(input) >= 6,
    )?;

    super::pre_solve_gates::refuse_broken_elements(&super::pre_solve_gates::check_shell_distortion_3d(input))?;
    crate::known_issues::refuse(&crate::known_issues::for_3d(input, analysis))?;
    super::assembly::refuse_connector_arm_mechanism_3d(input)?;

    Ok(())
}

/// Validate load references for 3D (load → node/element integrity and
/// point-load positions). Split from `validate_input_3d` so multi-case solves
/// can validate each case's loads independently of the structure.
pub(crate) fn validate_loads_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Result<(), String> {
    // As `validate_loads_2d`: prepared solves check the thermal properties here (#407).
    for load in loads {
        if let SolverLoad3D::Thermal(l) = load {
            crate::types::check_frame_thermal_inputs(l.element_id, l.alpha, &[("depthY", l.depth_y), ("depthZ", l.depth_z)])?;
        }
    }
    let node_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.nodes).map(|n| n.id).collect();
    let elem_ids: std::collections::HashSet<usize> =
        crate::ordered::values(&input.elements).map(|e| e.id).collect();
    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();

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
    let plate_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.plates).map(|p| p.id).collect();
    let quad_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.quads).map(|q| q.id).collect();
    let quad9_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.quad9s).map(|q| q.id).collect();
    let solid_shell_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.solid_shells).map(|s| s.id).collect();
    let curved_shell_ids: std::collections::HashSet<usize> = crate::ordered::values(&input.curved_shells).map(|c| c.id).collect();
    // Each shell load is applied by its own family's assembly, so it must name an element of
    // that family: ids are per family, and a load whose id belonged to another family was
    // accepted and then dropped (a temperature on a curved shell sent as `quadThermal`
    // analysed the shell unheated).
    for load in loads {
        let (kind, eid, ids) = match load {
            SolverLoad3D::Pressure(l) => ("Plate pressure", l.element_id, &plate_ids),
            SolverLoad3D::PlateThermal(l) => ("Plate thermal", l.element_id, &plate_ids),
            SolverLoad3D::QuadPressure(l) => ("Quad pressure", l.element_id, &quad_ids),
            SolverLoad3D::QuadThermal(l) => ("Quad thermal", l.element_id, &quad_ids),
            SolverLoad3D::QuadEdge(l) => ("Quad edge", l.element_id, &quad_ids),
            SolverLoad3D::QuadSelfWeight(l) => ("Quad self-weight", l.element_id, &quad_ids),
            SolverLoad3D::Quad9Pressure(l) => ("Quad9 pressure", l.element_id, &quad9_ids),
            SolverLoad3D::Quad9Thermal(l) => ("Quad9 thermal", l.element_id, &quad9_ids),
            SolverLoad3D::Quad9Edge(l) => ("Quad9 edge", l.element_id, &quad9_ids),
            SolverLoad3D::Quad9SelfWeight(l) => ("Quad9 self-weight", l.element_id, &quad9_ids),
            SolverLoad3D::SolidShellPressure(l) => ("Solid shell pressure", l.element_id, &solid_shell_ids),
            SolverLoad3D::SolidShellSelfWeight(l) => ("Solid shell self-weight", l.element_id, &solid_shell_ids),
            SolverLoad3D::CurvedShellPressure(l) => ("Curved shell pressure", l.element_id, &curved_shell_ids),
            SolverLoad3D::CurvedShellThermal(l) => ("Curved shell thermal", l.element_id, &curved_shell_ids),
            SolverLoad3D::CurvedShellEdge(l) => ("Curved shell edge", l.element_id, &curved_shell_ids),
            SolverLoad3D::CurvedShellSelfWeight(l) => ("Curved shell self-weight", l.element_id, &curved_shell_ids),
            _ => continue,
        };
        if !ids.contains(&eid) {
            return Err(format!("{} load: element {} does not exist", kind, eid));
        }
    }

    // Point load position validation
    for load in loads {
        if let SolverLoad3D::PointOnElement(pl) = load {
            if let Some(elem) = crate::ordered::values(&input.elements).find(|e| e.id == pl.element_id) {
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

    refuse_moments_without_rotation_3d(input, loads)?;

    Ok(())
}

/// A nodal moment on a node no element, support or constraint gives rotational
/// stiffness would be lost: a model of solid shells and trusses only has no
/// rotation DOFs at all (the moment was dropped from the load vector), and in
/// a model with frames or shells the rotation of a node only solid shells or
/// trusses reach is an orphan DOF held by artificial stiffness (the moment
/// produced a meaningless rotation and never reached the structure). Refused,
/// by node, instead of answering for a model without the load.
pub(crate) fn refuse_moments_without_rotation_3d(input: &SolverInput3D, loads: &[SolverLoad3D]) -> Result<(), String> {
    let moments = super::load_work::nonzero_nodal_moments(loads.iter().filter_map(|load| match load {
        SolverLoad3D::Nodal(n) => Some((n.node_id, [n.mx, n.my, n.mz])),
        _ => None,
    }));
    if moments.is_empty() {
        return Ok(());
    }
    if DofNumbering::dofs_per_node_3d(input) < 6 {
        return Err(moment_lost_3d(
            moments[0].0,
            "the model has no rotational degrees of freedom (solid shells, trusses and cables carry translations only)",
        ));
    }
    // Per node and global rotation component: whether anything stiffens it.
    let mut carried: std::collections::HashMap<usize, [bool; 3]> = std::collections::HashMap::new();
    let mut nodes: Vec<usize> = Vec::new();
    for e in crate::ordered::values(&input.elements) {
        if e.elem_type == "truss" || e.elem_type == "cable" {
            continue;
        }
        if !(e.release_my_start && e.release_mz_start && e.release_t_start) { nodes.push(e.node_i); }
        if !(e.release_my_end && e.release_mz_end && e.release_t_end) { nodes.push(e.node_j); }
    }
    nodes.extend(crate::ordered::values(&input.plates).flat_map(|p| p.nodes));
    nodes.extend(crate::ordered::values(&input.quads).flat_map(|q| q.nodes));
    nodes.extend(crate::ordered::values(&input.quad9s).flat_map(|q| q.nodes));
    nodes.extend(crate::ordered::values(&input.curved_shells).flat_map(|c| c.nodes));
    nodes.extend(crate::ordered::values(&input.connectors).flat_map(|c| [c.node_i, c.node_j]));
    for c in &input.constraints {
        match c {
            Constraint::RigidLink(r) => nodes.extend([r.master_node, r.slave_node]),
            Constraint::Diaphragm(d) => { nodes.push(d.master_node); nodes.extend(&d.slave_nodes); }
            Constraint::LinearMPC(m) => nodes.extend(m.terms.iter().map(|t| t.node_id)),
            Constraint::EqualDOF(e) => nodes.extend([e.master_node, e.slave_node]),
            Constraint::EccentricConnection(e) => nodes.extend([e.master_node, e.slave_node]),
        }
    }
    for n in nodes {
        carried.insert(n, [true; 3]);
    }
    for s in crate::ordered::values(&input.supports) {
        let c = carried.entry(s.node_id).or_insert([false; 3]);
        let k = [support_dofs_3d(s)[3].spring, support_dofs_3d(s)[4].spring, support_dofs_3d(s)[5].spring];
        for (i, r) in [s.rrx, s.rry, s.rrz].into_iter().enumerate() {
            c[i] |= r || k[i].unwrap_or(0.0) > 0.0;
        }
    }
    for (node, nonzero) in moments {
        let c = carried.get(&node).copied().unwrap_or([false; 3]);
        if nonzero.into_iter().zip(c).any(|(nonzero, ok)| nonzero && !ok) {
            return Err(moment_lost_3d(
                node,
                "no frame, shell, rotational support or constraint gives that node rotational stiffness (solid shells, trusses and cables carry translations only)",
            ));
        }
    }
    Ok(())
}

/// Backstop for `refuse_moments_without_rotation_3d`, on the assembled DOFs:
/// a nodal moment or bimoment on a DOF only artificial stiffness holds (a
/// rotation every member releases, say) would be lost. `orphan` is the
/// assembler's `artificial_dofs`.
pub(crate) fn refuse_loads_on_orphan_dofs_3d(
    dof_num: &DofNumbering,
    orphan: &std::collections::HashSet<usize>,
    loads: &[SolverLoad3D],
) -> Result<(), String> {
    refuse_loads_on_orphan_dofs_with_certificate_3d(dof_num,orphan,loads,None)
}

pub(crate) fn refuse_material_loads_on_orphan_dofs_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    orphan: &std::collections::HashSet<usize>,
) -> Result<(), String> {
    let certificate=checked_initial_released_loads_3d(input)?;
    refuse_loads_on_orphan_dofs_with_certificate_3d(dof_num,orphan,&input.loads,Some(&certificate))
}

fn refuse_loads_on_orphan_dofs_with_certificate_3d(
    dof_num: &DofNumbering,
    orphan: &std::collections::HashSet<usize>,
    loads: &[SolverLoad3D],
    certificate: Option<&ReleasedLoadCertificate3D>,
) -> Result<(), String> {
    if orphan.is_empty() {
        return Ok(());
    }
    use NodalLoadComponent3D::*;
    let check = |node, component: NodalLoadComponent3D, nonzero: bool| {
        if !nonzero || certificate.is_some_and(|c| c.permits(node, component)) {
            return Ok(());
        }
        if let Some(d) = dof_num.global_dof(node, component as usize) {
            if orphan.contains(&d) {
                if matches!(component, Fx | Fy | Fz) {
                    return Err(format!("Nodal force at node {node} is not supported: nothing in the model gives that translation stiffness, so the force would not reach the structure"));
                }
                return Err(moment_lost_3d(
                    node,
                    "nothing in the model gives that rotation (or warping) of the node stiffness — every member is released there, or only solid shells and trusses reach it",
                ));
            }
        }
        Ok(())
    };
    for (node, nonzero) in super::load_work::nonzero_nodal_moments(loads.iter().filter_map(|load| match load {
        SolverLoad3D::Nodal(n) => Some((n.node_id, [n.mx, n.my, n.mz])),
        _ => None,
    })) {
        for (component, nonzero) in [Mx, My, Mz].into_iter().zip(nonzero) {
            check(node, component, nonzero)?;
        }
    }
    for load in loads {
        match load {
            SolverLoad3D::Nodal(l) => {
                for (component, value) in [(Fx,l.fx),(Fy,l.fy),(Fz,l.fz),(Bw,l.bw.unwrap_or(0.0))] {
                    check(l.node_id, component, value != 0.0)?;
                }
            }
            SolverLoad3D::Bimoment(l) => check(l.node_id, Bw, l.bimoment != 0.0)?,
            _ => {}
        }
    }
    Ok(())
}

fn refuse_loaded_free_rotation_3d(stability: &super::stability::Stability, dof: &DofNumbering, f: &[f64], rounding: &[f64]) -> Result<(), String> {
    let Some(node) = stability.load_on_free_rotation_with_rounding(f,rounding) else { return Ok(()); };
    let directions: Vec<_> = stability.free_rotations().filter(|d| d.node == node).map(|d| {
        d.dofs.iter().zip(&d.direction).map(|(&index, value)| {
            let local = dof.entries_by_dof().into_iter().find(|(_, i)| *i == index).unwrap().0.1;
            format!("{}={value:.6e}", ["ux", "uy", "uz", "rx", "ry", "rz", "warping"][local])
        }).collect::<Vec<_>>().join(", ")
    }).collect();
    Err(moment_lost_3d(node, &format!("a loaded released rotation or unstiffened rotational/warping direction is present; free directions [{}] have no resolvable stiffness", directions.join("; "))))
}

fn moment_lost_3d(node: usize, why: &str) -> String {
    format!(
        "Nodal moment at node {node} is not supported: {why}, so the moment would not reach the structure. \
         Apply it as a force couple, or connect the node to a frame or shell"
    )
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
pub fn compute_internal_forces_2d_with_loads(
    input: &SolverInput,
    loads: &[SolverLoad],
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces> {
    let properties = ElasticProperties2D::from_legacy(input);
    compute_internal_forces_2d_typed(input, loads, dof_num, u, &properties)
}

fn compute_internal_forces_2d_typed(
    input: &SolverInput, loads: &[SolverLoad], dof_num: &DofNumbering, u: &[f64],
    properties: &ElasticProperties2D,
) -> Vec<ElementForces> {
    let mut forces = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Index loads per element once — the per-element `for load in loads` rescans
    // below made this O(E·L) per call, O(modes·E·L) in spectral solves.
    let empty_loads: Vec<&SolverLoad> = Vec::new();
    let mut loads_by_elem: std::collections::HashMap<usize, Vec<&SolverLoad>> =
        std::collections::HashMap::new();
    for load in loads {
        let eid = match load {
            SolverLoad::Distributed(l) => l.element_id,
            SolverLoad::PointOnElement(l) => l.element_id,
            SolverLoad::Thermal(l) => l.element_id,
            SolverLoad::AxialDistributed(l) => l.element_id,
            SolverLoad::Nodal(_) => continue,
        };
        loads_by_elem.entry(eid).or_default().push(load);
    }

    for elem in crate::ordered::values(&input.elements) {
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
            let (mut n_start, mut n_end) = (0.0, 0.0);
            let mut axial_loads_info = Vec::new();
            let mut truss_point_loads = Vec::new();
            for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
                match load {
                    SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                        n_axial -= e * sec.a * tl.alpha() * tl.dt_uniform;
                    }
                    // An axial point load, and an axial span load: their consistent end loads
                    // (f = K*u - FEF) make N vary along the bar, n_start = EAδ/L + f_i and
                    // n_end = EAδ/L - f_j. The transverse part reaches the nodes by the lever
                    // rule and leaves N alone.
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        let px = pl.px.unwrap_or(0.0);
                        if px != 0.0 {
                            n_start += px * (1.0 - pl.a / l);
                            n_end -= px * pl.a / l;
                            truss_point_loads.push(PointLoadInfo { a: pl.a, p: 0.0, px: Some(px), my: None });
                        }
                    }
                    SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                        let (a, b) = (al.a.unwrap_or(0.0), al.b.unwrap_or(l));
                        let [f_i, f_j] = crate::element::axial_distributed_fef(al.q_i, al.q_j, a, b, l);
                        n_start += f_i;
                        n_end -= f_j;
                        axial_loads_info.push(DistributedLoadInfo { q_i: al.q_i, q_j: al.q_j, a, b });
                    }
                    _ => {}
                }
            }

            forces.push(ElementForces {
                element_id: elem.id,
                n_start: n_axial + n_start,
                n_end: n_axial + n_end,
                v_start: 0.0,
                v_end: 0.0,
                m_start: 0.0,
                m_end: 0.0,
                length: l,
                q_i: 0.0,
                q_j: 0.0,
                point_loads: truss_point_loads,
                distributed_loads: Vec::new(), distributed_loads_x: axial_loads_info,
                hinge_start: false,
                hinge_end: false,
            });
        } else {
            // Frame: transform displacements to local, compute k*u - FEF
            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();

            let t = crate::element::frame_transform_2d(cos, sin);
            let u_local = transform_displacement(&u_global, &t, 6);

            let material = properties.materials[&elem.material_id];
            let section = properties.sections[&elem.section_id];
            let phi = section.shear_parameter(material.e.to_internal(), material.nu, crate::types::units::Length::from_m(l));
            let k_local = crate::element::frame_local_stiffness_2d_typed(
                material.e.to_internal(), section.a, section.iz, crate::types::units::Length::from_m(l),
                elem.hinge_start, elem.hinge_end, phi,
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
            let mut axial_loads_info = Vec::new();

            for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a = dl.a.unwrap_or(0.0);
                        let b = dl.b.unwrap_or(l);
                        let is_full = (a.abs() < 1e-12) && ((b - l).abs() < 1e-12);

                        let mut fef = if is_full {
                            crate::element::fef_distributed_2d(dl.q_i, dl.q_j, l, phi)
                        } else {
                            crate::element::fef_partial_distributed_2d(dl.q_i, dl.q_j, a, b, l, phi)
                        };

                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);

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
                        let mut fef = crate::element::fef_point_load_2d(pl.p, px, mz, pl.a, l, phi);
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);
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
                        let alpha = tl.alpha();
                        let h = tl.depth(sec.a, sec.iz);
                        let mut fef = crate::element::fef_thermal_2d(
                            e, sec.a, sec.iz, l,
                            tl.dt_uniform, tl.dt_gradient, alpha, h,
                        );
                        crate::element::adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end, phi);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
                    }
                    SolverLoad::AxialDistributed(al) if al.element_id == elem.id => {
                        let (a, b) = (al.a.unwrap_or(0.0), al.b.unwrap_or(l));
                        let fef = crate::element::fef_axial_distributed_2d(al.q_i, al.q_j, a, b, l);
                        for i in 0..6 {
                            f_local[i] -= fef[i];
                        }
                        axial_loads_info.push(DistributedLoadInfo { q_i: al.q_i, q_j: al.q_j, a, b });
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
                distributed_loads_x: axial_loads_info,
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
pub fn compute_internal_forces_3d_with_loads(
    input: &SolverInput3D,
    loads: &[SolverLoad3D],
    dof_num: &DofNumbering,
    u: &[f64],
) -> Vec<ElementForces3D> {
    let mut forces = Vec::new();
    let left_hand = input.left_hand.unwrap_or(false);

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();
    let sec_map: std::collections::HashMap<usize, &SolverSection3D> =
        crate::ordered::values(&input.sections).map(|s| (s.id, s)).collect();

    // Index loads per element once — the per-element `for load in loads` rescans
    // below made this O(E·L) per call, O(modes·E·L) in spectral solves.
    let empty_loads: Vec<&SolverLoad3D> = Vec::new();
    let mut loads_by_elem: std::collections::HashMap<usize, Vec<&SolverLoad3D>> =
        std::collections::HashMap::new();
    for load in loads {
        let eid = match load {
            SolverLoad3D::Distributed(l) => l.element_id,
            SolverLoad3D::PointOnElement(l) => l.element_id,
            SolverLoad3D::Thermal(l) => l.element_id,
            _ => continue, // nodal / shell-surface loads don't apply to frame/truss elements
        };
        loads_by_elem.entry(eid).or_default().push(load);
    }

    for elem in crate::ordered::values(&input.elements) {
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

        let kinematics = element::MemberKinematics3D::from_elem(elem, sec);
        if kinematics == element::MemberKinematics3D::Axial {
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
            for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
                if let SolverLoad3D::Thermal(tl) = load {
                    if tl.element_id == elem.id {
                        n_axial -= e * sec.a * tl.alpha() * tl.dt_uniform;
                    }
                }
            }

            let mut axial_fef = [0.0, 0.0];
            let mut axial_loads = Vec::new();
            let mut axial_points = Vec::new();
            for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
                if let SolverLoad3D::Distributed(dl) = load {
                    let a = dl.a.unwrap_or(0.0); let b = dl.b.unwrap_or(l);
                    let f = element::axial_distributed_fef(dl.q_xi, dl.q_xj, a, b, l);
                    axial_fef[0] += f[0]; axial_fef[1] += f[1];
                    if dl.q_xi != 0.0 || dl.q_xj != 0.0 {
                        axial_loads.push(DistributedLoadInfo { q_i: dl.q_xi, q_j: dl.q_xj, a, b });
                    }
                }
            }
            for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
                if let SolverLoad3D::PointOnElement(pl) = load {
                    let f = element::fef_point_load_2d(0.0, pl.px, 0.0, pl.a, l, 0.0);
                    axial_fef[0] += f[0];
                    axial_fef[1] += f[3];
                    if pl.px != 0.0 { axial_points.push(PointLoadInfo3D { a: pl.a, p: pl.px }); }
                }
            }
            forces.push(ElementForces3D {
                element_id: elem.id, length: l,
                n_start: n_axial + axial_fef[0], n_end: n_axial - axial_fef[1],
                vy_start: 0.0, vy_end: 0.0,
                vz_start: 0.0, vz_end: 0.0,
                mx_start: 0.0, mx_end: 0.0,
                my_start: 0.0, my_end: 0.0,
                mz_start: 0.0, mz_end: 0.0,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false, release_t_start: false, release_t_end: false,
                q_yi: 0.0, q_yj: 0.0,
                distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
                q_zi: 0.0, q_zj: 0.0,
                distributed_loads_x: axial_loads,
                distributed_loads_z: Vec::new(), point_loads_x: axial_points, point_loads_z: Vec::new(), bimoment_start: None, bimoment_end: None });
            continue;
        }

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        let (ex, ey, ez) = element::compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle,
            left_hand,
        );

        // Compute Timoshenko shear parameters for each bending plane
        let (phi_y, phi_z) = crate::element::timoshenko_phi_3d(sec, e, g, l);

        // Determine element size and compute f_local
        let (f_local, ndof_elem) = if kinematics.uses_warping_formulation() && dof_num.dofs_per_node >= 7 {
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
        let mut dist_loads_x = Vec::new();
        let mut pt_loads_x = Vec::new();
        let mut pt_loads_y = Vec::new();
        let mut pt_loads_z = Vec::new();

        for load in loads_by_elem.get(&elem.id).unwrap_or(&empty_loads) {
            match load {
                SolverLoad3D::Distributed(dl) if dl.element_id == elem.id => {
                    let a_param = dl.a.unwrap_or(0.0);
                    let b_param = dl.b.unwrap_or(l);
                    let is_full_fef = (a_param.abs() < 1e-12) && ((b_param - l).abs() < 1e-12);
                    let mut fef12 = if is_full_fef {
                        element::fef_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, l, phi_y, phi_z)
                    } else {
                        element::fef_partial_distributed_3d(dl.q_yi, dl.q_yj, dl.q_zi, dl.q_zj, a_param, b_param, l, phi_y, phi_z)
                    };
                    let axial = element::axial_distributed_fef(dl.q_xi, dl.q_xj, a_param, b_param, l);
                    fef12[0] = axial[0];
                    fef12[6] = axial[1];
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
                    if dl.q_xi != 0.0 || dl.q_xj != 0.0 {
                        dist_loads_x.push(DistributedLoadInfo { q_i: dl.q_xi, q_j: dl.q_xj, a, b });
                    }
                }
                SolverLoad3D::PointOnElement(pl) if pl.element_id == elem.id => {
                    let mut fef12 = element::fef_point_load_with_axial_3d(pl.px, pl.py, pl.pz, pl.a, l, phi_y, phi_z);
                    element::adjust_fef_for_hinges_3d(&mut fef12, l, element::Hinge3D::from_elem(elem), phi_y, phi_z);
                    if ndof_elem == 14 {
                        let fef14 = element::expand_fef_12_to_14(&fef12);
                        for i in 0..14 { f_local[i] -= fef14[i]; }
                    } else {
                        for i in 0..12 {
                            f_local[i] -= fef12[i];
                        }
                    }

                    if pl.px != 0.0 { pt_loads_x.push(PointLoadInfo3D { a: pl.a, p: pl.px }); }
                    pt_loads_y.push(PointLoadInfo3D { a: pl.a, p: pl.py });
                    pt_loads_z.push(PointLoadInfo3D { a: pl.a, p: pl.pz });
                }
                SolverLoad3D::Thermal(tl) if tl.element_id == elem.id => {
                    let alpha = tl.alpha();
                    let hy = tl.depth_y(sec.a, sec.iz);
                    let hz = tl.depth_z(sec.a, sec.iy);
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
            distributed_loads_x: dist_loads_x,
            distributed_loads_z: dist_loads_z,
            point_loads_x: pt_loads_x,
            point_loads_z: pt_loads_z,
            bimoment_start,
            bimoment_end,
        });
    }

    forces
}

/// Expand curved beams into frame elements before solving.
/// Clones input, adds intermediate nodes and frame elements.
/// Idempotent: the expanded model clears the curved-beam list, so a second call
/// is a no-op clone instead of a double expansion.
pub fn expand_curved_beams_3d(input: &SolverInput3D) -> SolverInput3D {
    if input.curved_beams.is_empty() {
        return input.clone();
    }

    let mut result = input.clone();

    // Find next available node and element IDs
    let max_node_id = crate::ordered::values(&result.nodes).map(|n| n.id).max().unwrap_or(0);
    let max_elem_id = crate::ordered::values(&result.elements).map(|e| e.id).max().unwrap_or(0);

    // Segment counts come from the model file. Beams that are too large to
    // expand (or whose new ids would overflow) are all left in place, unexpanded,
    // for `validate_input_3d` to refuse with the same check.
    if crate::element::check_curved_beam_sizes(&input.curved_beams, max_node_id, max_elem_id).is_err() {
        return result;
    }
    let mut next_node_id = max_node_id + 1;
    let mut next_elem_id = max_elem_id + 1;

    let cb_node_map: std::collections::HashMap<usize, SolverNode3D> =
        crate::ordered::values(&result.nodes).map(|n| (n.id, n.clone())).collect();

    // A beam naming a node that does not exist is left as it is, not expanded.
    // This runs before validation on most paths, and indexing the map panicked
    // on it — in WASM, the end of the module. Left in `curved_beams`, it is
    // what `validate_input_3d` then refuses by name.
    let mut unresolved = Vec::new();

    for cb in &input.curved_beams {
        let (Some(n_start), Some(n_mid), Some(n_end)) = (
            cb_node_map.get(&cb.node_start).cloned(),
            cb_node_map.get(&cb.node_mid).cloned(),
            cb_node_map.get(&cb.node_end).cloned(),
        ) else {
            unresolved.push(cb.clone());
            continue;
        };

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

        // Add frame elements (remapping snapped node ID). Every segment takes its
        // section orientation from the arc, not from the default rule (#418, SP-15).
        let xyz_of = |id: usize| result.nodes.get(&id.to_string()).map(|n| [n.x, n.y, n.z]);
        let mut segment_local_y = Vec::with_capacity(expansion.new_elements.len());
        for &(_, ni, nj, ..) in &expansion.new_elements {
            let actual_ni = if snap_from == Some(ni) { mid_id } else { ni };
            let actual_nj = if snap_from == Some(nj) { mid_id } else { nj };
            segment_local_y.push(match (expansion.section_frame, xyz_of(actual_ni), xyz_of(actual_nj)) {
                (Some(f), Some(pi), Some(pj)) => Some(f.local_y(pi, pj)),
                _ => None,
            });
        }
        for (&(eid, ni, nj, mat_id, sec_id, hs, he), ly) in expansion.new_elements.iter().zip(segment_local_y) {
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
                local_yx: ly.map(|v| v[0]),
                local_yy: ly.map(|v| v[1]),
                local_yz: ly.map(|v| v[2]),
                roll_angle: None,
            });
            if eid >= next_elem_id {
                next_elem_id = eid + 1;
            }
        }
    }

    // Idempotent: the expanded model no longer carries curved-beam definitions,
    // so a second call (e.g. prepare_static_3d after solve_3d already expanded)
    // is a no-op clone instead of a double expansion. Only the unresolved ones
    // stay, for validation to refuse.
    result.curved_beams = unresolved;
    result
}

/// Compute plate stresses for all plate elements.
pub(crate) fn compute_plate_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    loads: Option<&[SolverLoad3D]>,
) -> Vec<PlateStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();

    // Index thermal loads by element id so stress recovery can subtract the
    // thermal strain from the total strain (σ = C·ε_mech, not C·ε_total).
    let loads_ref = loads.unwrap_or(&input.loads);
    let mut thermal_by_elem: std::collections::HashMap<usize, (f64, f64, f64)> =
        std::collections::HashMap::new();
    for load in loads_ref {
        if let SolverLoad3D::PlateThermal(tl) = load {
            // Summed as free strains, (1, Σα·ΔTu, Σα·ΔTg): the load vector sums every
            // thermal load on an element, and an insert kept only the last (SH-11).
            let alpha = tl.alpha.unwrap_or(1.2e-5);
            let e = thermal_by_elem.entry(tl.element_id).or_insert((1.0, 0.0, 0.0));
            e.1 += alpha * tl.dt_uniform;
            e.2 += alpha * tl.dt_gradient;
        }
    }

    for plate in crate::ordered::values(&input.plates) {
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
        let (alpha, dt_uniform, dt_gradient) = thermal_by_elem.get(&plate.id).copied().unwrap_or((0.0, 0.0, 0.0));
        let s = crate::element::plate_stress_recovery(&coords, e, nu, plate.thickness, &u_local, alpha, dt_uniform, dt_gradient);

        // Also recover nodal stresses for stress smoothing
        // Thermal strain subtracted at the nodes as at the centroid (SH-10).
        let nodal = crate::element::plate_stress_at_nodes_thermal(&coords, e, nu, plate.thickness, &u_local, alpha, dt_uniform, dt_gradient);
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
            // A DKT triangle is a Kirchhoff plate: no shear strain to read Q from, and the
            // gradient of its linear moments is too coarse element by element to report.
            qx: None,
            qy: None,
        });
    }

    stresses
}

pub(crate) fn compute_quad_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    loads: Option<&[SolverLoad3D]>,
) -> Vec<QuadStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();

    // Index thermal loads by element id so stress recovery can subtract the
    // thermal strain from the total strain (σ = C·ε_mech, not C·ε_total).
    // Callers that solve a per-case load set (multi-case, staged) pass those
    // loads explicitly; the default is the model's own load list.
    let loads_ref = loads.unwrap_or(&input.loads);
    let mut thermal_by_elem: std::collections::HashMap<(bool, usize), (f64, f64, f64)> =
        std::collections::HashMap::new();
    let mut curved_thermal: std::collections::HashMap<usize, (f64, f64, f64)> =
        std::collections::HashMap::new();
    for load in loads_ref {
        match load {
            // Summed as free strains, (1, Σα·ΔTu, Σα·ΔTg): an insert kept only the last
            // thermal load on an element while the load vector sums them all (SH-11).
            // Keyed by (is_quad9, id): quad and quad9 ids are family-local, so a quad
            // and a quad9 with the same id must not share (and double) their loads.
            SolverLoad3D::QuadThermal(tl) | SolverLoad3D::Quad9Thermal(tl) => {
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let key = (matches!(load, SolverLoad3D::Quad9Thermal(_)), tl.element_id);
                let e = thermal_by_elem.entry(key).or_insert((1.0, 0.0, 0.0));
                e.1 += alpha * tl.dt_uniform;
                e.2 += alpha * tl.dt_gradient;
            }
            // Curved shells (their own id space), summed the same way (SH-6, #410).
            SolverLoad3D::CurvedShellThermal(tl) => {
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let e = curved_thermal.entry(tl.element_id).or_insert((1.0, 0.0, 0.0));
                e.1 += alpha * tl.dt_uniform;
                e.2 += alpha * tl.dt_gradient;
            }
            _ => {}
        }
    }

    for quad in crate::ordered::values(&input.quads) {
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

        let (alpha, dt_uniform, dt_gradient) = thermal_by_elem.get(&(false, quad.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let s = crate::element::quad::quad_stresses(&coords, &u_local, e, nu, quad.thickness, alpha, dt_uniform, dt_gradient);

        // Nodal stresses at 4 Gauss-extrapolated points
        let nodal_vm = crate::element::quad::quad_nodal_von_mises(&coords, &u_local, e, nu, quad.thickness, alpha, dt_uniform);
        let q = crate::element::quad::quad_transverse_shear(&coords, &u_local, e, nu, quad.thickness);

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
            qx: Some(q[0]),
            qy: Some(q[1]),
        });
    }

    // Quad9 (MITC9) stress recovery
    for q9 in crate::ordered::values(&input.quad9s) {
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
        let (alpha, dt_uniform, dt_gradient) = thermal_by_elem.get(&(true, q9.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let s = crate::element::quad9::quad9_stresses(&coords, &u_local_vec, e, nu, q9.thickness, alpha, dt_uniform, dt_gradient);
        let nodal_vm = crate::element::quad9::quad9_nodal_von_mises(&coords, &u_local_vec, e, nu, q9.thickness, alpha, dt_uniform);
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
            qx: None,
            qy: None,
        });
    }

    // Solid-shell stress recovery
    for ss in crate::ordered::values(&input.solid_shells) {
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
            qx: None,
            qy: None,
        });
    }

    // Curved shell stress recovery (degenerated continuum — global displacements used directly)
    for cs in crate::ordered::values(&input.curved_shells) {
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
        let (alpha, dt_uniform, dt_gradient) = curved_thermal.get(&cs.id).copied().unwrap_or((0.0, 0.0, 0.0));
        let s = crate::element::curved_shell::curved_shell_stresses(&coords, &dirs, &u_arr, e, nu, cs.thickness, alpha, dt_uniform, dt_gradient);
        let nodal_vm = crate::element::curved_shell::curved_shell_nodal_von_mises(&coords, &dirs, &u_arr, e, nu, cs.thickness, alpha, dt_uniform);
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
            qx: None,
            qy: None,
        });
    }

    stresses
}

pub(crate) fn compute_quad_nodal_stresses(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    loads: Option<&[SolverLoad3D]>,
) -> Vec<QuadNodalStress> {
    let mut stresses = Vec::new();

    let node_map: std::collections::HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input.nodes).map(|n| (n.id, n)).collect();
    let mat_map: std::collections::HashMap<usize, &SolverMaterial> =
        crate::ordered::values(&input.materials).map(|m| (m.id, m)).collect();

    // Index thermal loads by element id so stress recovery can subtract the
    // thermal strain from the total strain (σ = C·ε_mech, not C·ε_total).
    let loads_ref = loads.unwrap_or(&input.loads);
    let mut thermal_by_elem: std::collections::HashMap<(bool, usize), (f64, f64, f64)> =
        std::collections::HashMap::new();
    for load in loads_ref {
        match load {
            // Summed as free strains, (1, Σα·ΔTu, Σα·ΔTg): an insert kept only the last
            // thermal load on an element while the load vector sums them all (SH-11).
            // Keyed by (is_quad9, id): quad and quad9 ids are family-local, so a quad
            // and a quad9 with the same id must not share (and double) their loads.
            SolverLoad3D::QuadThermal(tl) | SolverLoad3D::Quad9Thermal(tl) => {
                let alpha = tl.alpha.unwrap_or(1.2e-5);
                let key = (matches!(load, SolverLoad3D::Quad9Thermal(_)), tl.element_id);
                let e = thermal_by_elem.entry(key).or_insert((1.0, 0.0, 0.0));
                e.1 += alpha * tl.dt_uniform;
                e.2 += alpha * tl.dt_gradient;
            }
            _ => {}
        }
    }

    for quad in crate::ordered::values(&input.quads) {
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

        let (alpha, dt_uniform, dt_gradient) = thermal_by_elem.get(&(false, quad.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let nodal = crate::element::quad::quad_stress_at_nodes(&coords, &u_local, e, nu, quad.thickness, alpha, dt_uniform, dt_gradient);
        for mut ns in nodal {
            ns.node_index = quad.nodes[ns.node_index];
            stresses.push(ns);
        }
    }

    // Quad9 (MITC9) nodal stress recovery
    for q9 in crate::ordered::values(&input.quad9s) {
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
        let (alpha, dt_uniform, dt_gradient) = thermal_by_elem.get(&(true, q9.id)).copied().unwrap_or((0.0, 0.0, 0.0));
        let nodal = crate::element::quad9::quad9_stress_at_nodes(&coords, &u_local_vec, e, nu, q9.thickness, alpha, dt_uniform, dt_gradient);
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
    let inclined: Vec<_> = inclined_transforms.iter().flat_map(|it| it.dofs).collect();
    equilibrium_summary(
        assembled_f,
        reactions_vec,
        dof_num,
        rel_residual,
        inclined_transforms,
        &inclined,
        3,
        6,
    )
}

pub(super) fn compute_equilibrium_summary_2d(
    assembled_f: &[f64],
    reactions_vec: &[f64],
    dof_num: &DofNumbering,
    rel_residual: f64,
    inclined_transforms: &[InclinedTransformData2D],
) -> EquilibriumSummary {
    let inclined: Vec<_> = inclined_transforms.iter().flat_map(|it| it.dofs).collect();
    equilibrium_summary(
        assembled_f,
        reactions_vec,
        dof_num,
        rel_residual,
        inclined_transforms,
        &inclined,
        2,
        3,
    )
}

fn equilibrium_summary<T: super::assembly::InclinedFrame>(
    assembled_f: &[f64],
    reactions_vec: &[f64],
    dof_num: &DofNumbering,
    rel_residual: f64,
    its: &[T],
    inclined: &[usize],
    translations: usize,
    directions: usize,
) -> EquilibriumSummary {
    let mut f = assembled_f.to_vec();
    f.resize(dof_num.n_total, 0.0);
    let mut reactions = vec![0.0; dof_num.n_total];
    for (r, value) in reactions.iter_mut().skip(dof_num.n_free).zip(reactions_vec) {
        *r = *value;
    }
    for it in its {
        it.reverse(&mut f);
        it.reverse(&mut reactions);
    }
    let mut applied = vec![0.0; directions];
    let mut rxn = vec![0.0; directions];
    let mut applied_force_components = Vec::new();
    let inclined_set: std::collections::HashSet<_> = inclined.iter().copied().collect();
    for ((_, local), i) in dof_num.entries_by_dof() {
        if local < directions {
            applied[local] += f[i];
            rxn[local] += reactions[i];
        }
        if local < translations && !inclined_set.contains(&i) {
            applied_force_components.push(f[i]);
        }
    }
    applied_force_components.extend(inclined.iter().map(|i| f[*i]));
    let max_imbalance = (0..translations)
        .map(|i| (applied[i] + rxn[i]).abs())
        .fold(0.0f64, f64::max);
    let max_force = applied[..translations]
        .iter()
        .chain(&rxn[..translations])
        .map(|v| v.abs())
        .fold(0.0f64, f64::max);
    EquilibriumSummary {
        applied_force_components,
        relative_residual: rel_residual,
        residual_ok: rel_residual < 1e-6,
        applied_force_sum: applied,
        reaction_force_sum: rxn,
        max_imbalance,
        equilibrium_ok: max_imbalance < 1e-6 * max_force.max(1.0),
    }
}

#[cfg(test)]
mod conditioning_1753_audit {
    #[test]
    fn issue_1753_unconfirmed_factorization_failure_reports_accuracy() {
        let error = super::not_positive_definite();
        assert!(error.contains("factorization") && error.contains("accuracy"), "{error}");
        assert!(!error.contains("negative") && !error.contains("unstable"), "{error}");
    }

    #[test]
    fn issue_1465_loaded_release_names_the_node_and_rotation() {
        let input: crate::types::SolverInput3D = serde_json::from_str(include_str!("../../tests/fixtures/buckling-1465-loaded-release.json")).unwrap();
        let linear = super::solve_3d(&input).unwrap_err();
        let session = crate::load_session::LoadSession3D::from_input(input.clone()).and_then(|session| session.solve_loads(&input.loads)).unwrap_err();
        assert_eq!(session, linear);
        for error in [linear, crate::solver::buckling::solve_buckling_3d(&input, 1).unwrap_err()] {
            assert!(error.contains("node 2") && error.contains("loaded released rotation") && error.contains("rx=") && error.contains("ry=") && error.contains("rz="), "{error}");
        }
    }
}

#[cfg(test)]
mod conditional_accuracy_tests {
    use super::*;

    #[test]
    fn conditional_correction_checks_both_sides_of_the_accuracy_limit() {
        let mut stability = super::super::stability::Stability::stable();
        stability.kappa = 1e8;
        stability.anisotropy = 1e5;
        for factor in [1.0 - 1e-4, 1.0 + 1e-4] {
            let rhs = [1.0 + super::super::stability::CONDITIONAL_ACCURACY * factor];
            let dense = conditional_dense_refinement(&stability, &[1.0], &rhs, vec![1.0], |r| r.to_vec());
            assert_eq!(dense.is_ok(), factor < 1.0);
            if let Ok(u) = dense { assert_eq!(u, rhs); }
            let sparse = conditional_sparse_refinement(&stability, &CscMatrix::from_dense_symmetric(&[1.0], 1), &rhs, vec![1.0], |r| r.to_vec());
            assert_eq!(sparse.is_ok(), factor < 1.0);
        }
        assert_eq!(conditional_dense_refinement(&stability, &[1.0], &[0.0], vec![0.0], |r| r.to_vec()).unwrap(), [0.0]);
        assert!(conditional_dense_refinement(&stability, &[1.0], &[f64::NAN], vec![1.0], |r| r.to_vec()).is_err());
    }
}

#[cfg(test)]
mod r3_summary_tests {
    use super::*;
    use crate::solver::assembly::{InclinedTransformData, InclinedTransformData2D};

    #[test]
    fn inclined_summary_preserves_other_node_loads() {
        let s: SolverInput = serde_json::from_str(include_str!("../../tests/fixtures/random-41-input.json")).unwrap();
        let dofs = DofNumbering::build_2d(&s);
        let ds = [0,1].map(|d| dofs.global_dof(2,d).unwrap());
        let it = InclinedTransformData2D { node_id:2,dofs:ds,r:[[0.0,-1.0],[1.0,0.0]] };
        for force in [0.0,1e20] {
            let mut f=vec![0.0;dofs.n_total];
            f[dofs.global_dof(1,0).unwrap()]=1000.0;
            f[ds[0]]=force;
            let r=compute_equilibrium_summary_2d(&f,&vec![0.0;dofs.n_total-dofs.n_free],&dofs,0.0,std::slice::from_ref(&it));
            assert_eq!(r.applied_force_sum[0],1000.0);
        }
        for plane in crate::metamorphic::planes::Plane::ALL {
            let s=crate::metamorphic::planes::embed_2d(&s,plane).unwrap();
            let dofs=DofNumbering::build_3d(&s);
            let ds=[0,1,2].map(|d|dofs.global_dof(2,d).unwrap());
            let it=InclinedTransformData {node_id:2,dofs:ds,r:[[0.0,1.0,0.0],[1.0,0.0,0.0],[0.0,0.0,-1.0]]};
            for force in [0.0,1e20] {
                let mut f=vec![0.0;dofs.n_total]; f[dofs.global_dof(1,0).unwrap()]=1000.0;f[ds[0]]=force;
                let r=compute_equilibrium_summary_3d(&f,&vec![0.0;dofs.n_total-dofs.n_free],&dofs,0.0,std::slice::from_ref(&it));
                assert_eq!(r.applied_force_sum[0],1000.0);
            }
        }
    }
}

#[derive(Clone, Copy)]
#[repr(usize)]
enum NodalLoadComponent3D {
    Fx = 0,
    Fy = 1,
    Fz = 2,
    Mx = 3,
    My = 4,
    Mz = 5,
    Bw = 6,
}

#[derive(Default)]
struct ReleasedLoadCertificate3D {
    nodes: std::collections::BTreeSet<usize>,
}

impl ReleasedLoadCertificate3D {
    fn permits(&self, node: usize, component: NodalLoadComponent3D) -> bool {
        matches!(
            component,
            NodalLoadComponent3D::Mx | NodalLoadComponent3D::My | NodalLoadComponent3D::Mz
        ) && self.nodes.contains(&node)
    }
}

pub(crate) fn refuse_initial_free_rotation_loads_3d(input: &SolverInput3D) -> Result<(),String> {
    checked_initial_released_loads_3d(input).map(|_|())
}

fn checked_initial_released_loads_3d(input: &SolverInput3D) -> Result<ReleasedLoadCertificate3D,String> {
    if !input.loads.iter().any(|load| matches!(load,SolverLoad3D::Nodal(n) if n.mx != 0.0 || n.my != 0.0 || n.mz != 0.0)) { return Ok(ReleasedLoadCertificate3D::default()); }
    if !super::stability::has_member_releases_3d(input) { return Ok(ReleasedLoadCertificate3D::default()); }
    let input = &expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let assembled = super::assembly::without_artificial_stiffness(|| super::assembly::assemble_stiffness_sparse_3d(input,&dof,false));
    let constraints = super::constraints::FreeConstraintSystem::build_3d(input,&dof)?;
    let releases = super::stability::released_rotations_3d(input,&dof);
    let (_,mut stability) = super::stability::analyze_free_stiffness(&assembled.k_ff,&dof,false,constraints.as_ref(),&super::stability::coupling_3d(input,&dof),&releases);
    let projected_releases = constraints.as_ref().map(|c| releases.project(&c.c_ff));
    let releases = projected_releases.as_ref().unwrap_or(&releases);
    let mut certificate=ReleasedLoadCertificate3D::default();
    if stability.is_stable() {
        for direction in stability.free_rotations() {
            if stability.free_rotations().filter(|d|d.node==direction.node).all(|d| d.kind==super::stability::DofKind::Rotation && releases.permits(d.node,&d.dofs,&d.direction)) {
                certificate.nodes.insert(direction.node);
            }
        }
    }
    stability.free.retain(|d| releases.permits(d.node,&d.dofs,&d.direction));
    let loads = super::assembly::assemble_load_vector_3d_dense(input,&input.loads,&dof,&assembled.inclined_transforms);
    let rounding = super::load_work::assembly_rounding_3d(input,&input.loads,&dof,&assembled.inclined_transforms);
    let rounding = constraints.as_ref().map_or_else(|| rounding.clone(),|c| c.reduce_load_rounding(&loads,&rounding));
    let loads = match constraints.as_ref() {Some(c)=>c.reduce_vector(&loads[..dof.n_free]),None=>loads};
    match stability.load_on_free_rotation_with_rounding(&loads,&rounding) {
        Some(node)=>Err(moment_lost_3d(node,"a free rotation would carry load")),
        None=>Ok(certificate),
    }
}

#[cfg(test)]
mod released_orphan_2074_tests {
    use super::*;
    use serde_json::json;

    fn model() -> SolverInput3D {
        let mut v: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/nightly-2026-11-13.json"))
                .unwrap();
        let v = &mut v["2023"];
        v["nodes"] =
            json!({"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":3.0,"y":0.0,"z":0.0}});
        let mut e = v["elements"]["1"].clone();
        e["nodeI"] = json!(1);
        e["nodeJ"] = json!(2);
        e["releaseMzStart"] = json!(true);
        v["elements"] = json!({"1":e});
        v["supports"] = json!({"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false},"2":{"nodeId":2,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}});
        v["loads"] = json!([{"type":"nodal","data":{"nodeId":1,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":1.0,"mz":0.0}}]);
        serde_json::from_value(v.clone()).unwrap()
    }

    #[test]
    fn orphan_backstops_sum_moments_exactly_by_node_and_axis() {
        let s = model();
        let dof = DofNumbering::build_3d(&s);
        for axis in 0..3 {
            let orphan = [dof.global_dof(1, axis + 3).unwrap()].into_iter().collect();
            let loads = |terms: &[f64]| terms.iter().map(|&value| {
                let mut n = SolverNodalLoad3D { node_id: 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None };
                match axis { 0 => n.mx = value, 1 => n.my = value, _ => n.mz = value };
                SolverLoad3D::Nodal(n)
            }).collect::<Vec<_>>();
            for terms in [vec![1.0,-1.0],vec![1e20,1.0,-1e20,-1.0]] {
                refuse_loads_on_orphan_dofs_3d(&dof,&orphan,&loads(&terms)).unwrap();
            }
            for residual in [-1.0,-f64::from_bits(1),f64::from_bits(1),1.0] {
                assert!(refuse_loads_on_orphan_dofs_3d(&dof,&orphan,&loads(&[1.0,-1.0,residual])).is_err());
            }
            for invalid in [f64::NAN,f64::INFINITY,f64::NEG_INFINITY] {
                assert!(refuse_loads_on_orphan_dofs_3d(&dof,&orphan,&loads(&[invalid,-invalid])).is_err());
            }
            let mut different_nodes = loads(&[1.0,-1.0]);
            let SolverLoad3D::Nodal(n) = &mut different_nodes[1] else { unreachable!() };
            n.node_id = 2;
            assert!(refuse_loads_on_orphan_dofs_3d(&dof,&orphan,&different_nodes).is_err());
        }
    }

    fn check_translations(material: bool) {
        for local in 0..3 {
            for force in [-1.0, -f64::from_bits(1), f64::from_bits(1), 1.0] {
                let mut s = model();
                let SolverLoad3D::Nodal(n) = &mut s.loads[0] else {
                    unreachable!()
                };
                match local {
                    0 => n.fx = force,
                    1 => n.fy = force,
                    _ => n.fz = force,
                }
                let dof = DofNumbering::build_3d(&s);
                let certificate = checked_initial_released_loads_3d(&s).unwrap();
                assert!(certificate.nodes.contains(&1));
                let orphan = [dof.global_dof(1, local).unwrap()].into_iter().collect();
                let r = if material {
                    refuse_material_loads_on_orphan_dofs_3d(&s, &dof, &orphan)
                } else {
                    refuse_loads_on_orphan_dofs_3d(&dof, &orphan, &s.loads)
                };
                let error = r.expect_err(&format!("local={local}, force={force}, material={material}"));
                assert!(error.contains("Nodal force at node 1 is not supported"), "{error}");
            }
        }
    }

    #[test]
    fn material_certificate_never_admits_orphan_translations() {
        check_translations(true);
    }

    #[test]
    fn uncertified_backstop_never_admits_orphan_translations() {
        check_translations(false);
    }

    #[test]
    fn zero_orphan_forces_and_retained_moments_keep_their_answer() {
        let mut s = model();
        let dof = DofNumbering::build_3d(&s);
        let orphan = (0..3)
            .map(|local| dof.global_dof(1, local).unwrap())
            .collect();
        for zero in [0.0, -0.0] {
            let SolverLoad3D::Nodal(n) = &mut s.loads[0] else {
                unreachable!()
            };
            n.fx = zero;
            n.fy = zero;
            n.fz = zero;
            refuse_material_loads_on_orphan_dofs_3d(&s, &dof, &orphan).unwrap();
            refuse_loads_on_orphan_dofs_3d(&dof, &orphan, &s.loads).unwrap();
            let r = solve_3d(&s).unwrap();
            assert_eq!(r.element_forces.len(), 1);
            assert!(r.element_forces[0].my_start != 0.0);
        }
    }
}
