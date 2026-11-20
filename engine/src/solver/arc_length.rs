/// Arc-length (Riks) and displacement control solvers for tracing
/// nonlinear equilibrium paths including limit points and snap-through.
///
/// Crisfield spherical arc-length:
///   ||Δu||² + Δλ² × ||f_ref||² = Δs²
///
/// Reference: Crisfield, "Non-linear Finite Element Analysis of Solids
///            and Structures" Vol. 1, Ch. 9

use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::{self, InclinedFrame, InclinedTransformData2D};
use super::corotational::{add_spring_contributions, assemble_corotational_public, assemble_corotational_triplets_2d};
use super::constraints::{FreeConstraintSystem, MasterMotion};
use super::linear::SPARSE_THRESHOLD;
use super::sparse_tangent::{
    cached_symbolic, tangent_free_sparse, tangent_free_sparse_triplets, SparseSymbolicCache,
};
use super::time_integration::MAX_DENSE_FALLBACK_DOFS;
use super::path_following::{solve_by_arc_length, solve_by_displacement_control, vec_norm, ArcLengthControl, DisplacementControl, PathProblem};

/// Arc-length analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthInput {
    pub solver: SolverInput,
    /// Maximum number of arc-length steps
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// Maximum N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    /// Initial arc-length increment
    #[serde(default = "default_initial_ds")]
    pub initial_ds: f64,
    /// Minimum arc-length
    #[serde(default = "default_min_ds")]
    pub min_ds: f64,
    /// Maximum arc-length
    #[serde(default = "default_max_ds")]
    pub max_ds: f64,
    /// Target N-R iterations per step (for adaptive Δs)
    #[serde(default = "default_target_iter")]
    pub target_iter: usize,
}

fn default_max_steps() -> usize { 100 }
fn default_max_iter() -> usize { 30 }
fn default_tol() -> f64 { 1e-6 }
fn default_initial_ds() -> f64 { 0.1 }
fn default_min_ds() -> f64 { 1e-6 }
fn default_max_ds() -> f64 { 1.0 }
fn default_target_iter() -> usize { 5 }

/// Displacement control input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlInput {
    pub solver: SolverInput,
    /// Control node ID
    pub control_node: usize,
    /// Control DOF (0=ux, 1=uy, 2=rz)
    pub control_dof: usize,
    /// Target displacement at the control DOF
    pub target_displacement: f64,
    /// Number of displacement increments
    #[serde(default = "default_n_disp_steps")]
    pub n_steps: usize,
    /// Max N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
}

fn default_n_disp_steps() -> usize { 20 }

/// Per-step snapshot on the equilibrium path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquilibriumStep {
    pub step: usize,
    pub load_factor: f64,
    pub control_displacement: f64,
    pub converged: bool,
    pub iterations: usize,
    /// The converged nodal displacements (Rust callers only; not serialized).
    #[serde(skip)]
    pub displacements: Vec<Displacement>,
}

/// Arc-length analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
}

/// Displacement control result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
}

/// Solve using Crisfield spherical arc-length method.
pub fn solve_arc_length(input: &ArcLengthInput) -> Result<ArcLengthResult, String> {
    solve_arc_length_from(input, None)
}

/// Arc-length analysis that continues from `start` instead of the undeformed
/// state. The start model's loads stay applied and its supports stay where the
/// start state left them; the loads and prescribed support displacements of
/// `input` are the pattern the load factor scales, so equilibrium is
/// f_int(u) = f_start + λ·f_ref with each restrained DOF at u_start + λ·u_prescribed.
/// Prescribed rotations alone (no loads) are a valid pattern.
pub fn solve_arc_length_from(input: &ArcLengthInput, start: Option<&super::corotational::CorotationalStart2D>) -> Result<ArcLengthResult, String> {
    let mut r = solve_arc_length_contained(input, start)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Corotational));
    Ok(r)
}

fn set_supports(u: &mut [f64], nf: usize, u_r_start: &[f64], du_support: &[f64], lambda: f64) {
    for (r, (&u0, &du)) in u_r_start.iter().zip(du_support).enumerate() {
        u[nf + r] = u0 + lambda * du;
    }
}

struct ArcLength2D<'a> {
    solver: &'a SolverInput,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    art: &'a [(usize, f64)],
    its: &'a [InclinedTransformData2D],
    metric: &'a super::convergence::EquilibriumMetric,
    sparse: bool,
    ns: usize,
    moves_supports: bool,
    psi2: f64,
    f_ref: &'a Vec<f64>,
    f_ref_full: &'a Vec<f64>,
    f_start: &'a Vec<f64>,
    f_start_full: &'a Vec<f64>,
    u_r_start: &'a Vec<f64>,
    du_support: &'a Vec<f64>,
    support_direction: &'a Vec<f64>,
    start_internal: &'a Vec<f64>,
    u_full: Vec<f64>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    asm_t: Option<TangentAssembly>,
    residual: Vec<f64>,
    steps: Vec<EquilibriumStep>,
}

impl ArcLength2D<'_> {
    /// dR/dλ: the reference load less the tangent's response to the support
    /// motion, g = f_ref − K_fr·Δu_r.
    fn reference(&self, asm_t: &TangentAssembly) -> Vec<f64> {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        let support_direction = self.support_direction;
        let mut g = self.f_ref.clone();
        if self.moves_supports {
            if self.sparse {
                for ((&i, &j), &v) in asm_t.trip_rows.iter().zip(&asm_t.trip_cols).zip(&asm_t.trip_vals) {
                    if i < nf { g[i] -= v * support_direction[j]; }
                    if i != j && j < nf { g[j] -= v * support_direction[i]; }
                }
            } else {
                for (i, gi) in g.iter_mut().enumerate() {
                    *gi -= (0..n).map(|j| asm_t.k_t[i * n + j] * support_direction[j]).sum::<f64>();
                }
            }
        }
        g
    }

    fn reduce(&self, v: &Vec<f64>) -> Vec<f64> {
        if let Some(ref cs) = *self.cs { cs.reduce_vector(v) } else { v.clone() }
    }
}

impl PathProblem for ArcLength2D<'_> {
    fn unknowns(&self) -> usize {
        self.dof_num.n_free
    }

    fn load_scale(&self) -> f64 {
        self.psi2
    }

    fn linearize_at(&mut self, lambda: f64) {
        set_supports(&mut self.u_full, self.dof_num.n_free, self.u_r_start, self.du_support, lambda);
        self.asm_t = Some(assemble_tangent(self.solver, self.dof_num, &self.u_full, self.art, self.sparse, self.its));
    }

    fn measure(&mut self, lambda: f64) -> f64 {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        let (f_start, f_ref, f_start_full, f_ref_full) = (self.f_start, self.f_ref, self.f_start_full, self.f_ref_full);
        let Some(asm_t) = self.asm_t.as_ref() else { return f64::INFINITY };
        let f_int_new = &asm_t.f_int;

        let mut residual = vec![0.0; nf];
        for i in 0..nf {
            residual[i] = f_start[i] + lambda * f_ref[i] - f_int_new[i];
        }

        let applied: Vec<f64> = (0..n).map(|i| f_start_full[i] + lambda * f_ref_full[i]).collect();
        let measure = self.metric.continuation_residual(&residual,&applied,&self.u_full[nf..],f_start_full,self.start_internal,self.cs.as_ref());
        self.residual = residual;
        measure
    }

    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else { return Err("Arc-length analysis: no tangent assembled".into()) };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_hat_s = solve_with_tangent(&tangent, &self.reduce(&self.reference(&asm_t)), ns)?;
        Ok(if let Some(ref cs) = *self.cs { cs.expand_solution(&du_hat_s, MasterMotion::Prescribed(self.du_support)) } else { du_hat_s })
    }

    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else { return Err("Arc-length analysis: no tangent assembled".into()) };
        let residual = std::mem::take(&mut self.residual);
        let residual_s = if let Some(ref cs) = *self.cs { cs.reduce_vector(&residual) } else { residual.clone() };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_r_s = solve_with_tangent(&tangent, &residual_s, ns)?;
        let du_t_s = solve_with_tangent(&tangent, &self.reduce(&self.reference(&asm_t)), ns)?;
        let du_r = if let Some(ref cs) = *self.cs { cs.expand_solution(&du_r_s, MasterMotion::Homogeneous) } else { du_r_s };
        let du_t = if let Some(ref cs) = *self.cs { cs.expand_solution(&du_t_s, MasterMotion::Prescribed(self.du_support)) } else { du_t_s };
        Ok((du_r, du_t))
    }

    fn advance(&mut self, step: &[f64]) {
        for i in 0..self.dof_num.n_free {
            self.u_full[i] += step[i];
        }
    }

    fn unknown(&self, index: usize) -> f64 {
        self.u_full[index]
    }

    fn record(&mut self, step: usize, lambda: f64, iterations: usize, converged: bool) {
        let (n, nf) = (self.dof_num.n_total, self.dof_num.n_free);
        set_supports(&mut self.u_full, nf, self.u_r_start, self.du_support, lambda);
        self.steps.push(EquilibriumStep {
            step,
            load_factor: lambda,
            control_displacement: self.u_full.get(0).copied().unwrap_or(0.0),
            converged,
            iterations,
            displacements: super::linear::build_displacements_2d(self.dof_num, &assembly::to_global(&self.u_full, n, self.its)),
        });
    }
}

fn solve_arc_length_contained(input: &ArcLengthInput, start: Option<&super::corotational::CorotationalStart2D>) -> Result<ArcLengthResult, String> {
    // Assembly resolves ids by direct map indexing: an element naming a
    // node that does not exist panicked there, which in WASM ends the
    // module rather than the call.
    super::linear::validate_input_2d(&input.solver)?;
    // Temperature is treated as fixed global forces (see `solve_corotational_2d`).
    super::feature_gates::refuse_2d(&input.solver, "Arc-length analysis", &[
        super::feature_gates::Feature::ThermalLoads,
    ])?;
    crate::element::connector::refuse_for_corotational_2d(&input.solver, "Arc-length analysis")?;
    super::corotational::refuse_inclined_motion_2d(&input.solver, start.is_some())?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // At or above SPARSE_THRESHOLD independent DOFs the tangent is assembled
    // as lower-triangle triplets feeding the CSC sparse solve — no O(n²)
    // dense tangent is ever built; below the threshold, dense n×n as before.
    let sparse = ns >= SPARSE_THRESHOLD;

    // Sparse symbolic factorization cache (ns >= SPARSE_THRESHOLD only): the
    // tangent's sparsity pattern is constant within a solve call, so the
    // symbolic phase is computed once and only the numeric phase repeats
    // per iteration.
    // Reference load vector
    // f_ref, the tangent and `u_full` are in the inclined-roller frames the
    // restraints are numbered in (`assemble_tangent` rotates); results are
    // rotated back to global axes.
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let its = asm.inclined_transforms_2d;
    let f_ref_full = asm.f;
    let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
    let (u_full, f_start) = match start {
        Some(start) => super::corotational::start_state_2d(&input.solver, start, &dof_num)?,
        None => (vec![0.0; n], vec![0.0; n]),
    };
    let f_start_full = f_start;
    let f_start: Vec<f64> = f_start_full[..nf].to_vec();
    let u_r_start: Vec<f64> = u_full[nf..].to_vec();
    let du_support = super::linear::prescribed_displacements_2d(&input.solver, &dof_num);
    let moves_supports = du_support.iter().any(|&v| v != 0.0);
    let mut support_direction = vec![0.0; n];
    support_direction[nf..].copy_from_slice(&du_support);
    if let Some(ref cs) = cs { cs.impose_motion(&mut support_direction); }
    let support_extent: Vec<_> = u_r_start.iter().zip(&du_support)
        .map(|(a,b)|a.abs()+b.abs()).collect();
    let metric = super::convergence::EquilibriumMetric::for_2d_with_state(
        &input.solver, &dof_num, cs.as_ref(), Some(&support_extent), &[],
    )?;
    let start_internal = if start.is_some() {
        super::corotational::continuation_internal_2d(&input.solver, &dof_num, &u_full, &its, &art)
    } else {
        vec![0.0; n]
    };
    let f_ref_norm = metric.free_norm(&f_ref, cs.as_ref());
    if f_ref_norm == 0.0 && !moves_supports {
        return Err("Zero reference load".into());
    }
    // The load-factor term of the arc-length constraint, in force² when there
    // is a reference load and in displacement² when only supports move.
    let psi2 = if f_ref_norm > 0.0 { vec_norm(&f_ref).powi(2) } else { vec_norm(&du_support).powi(2) };
    let mut problem = ArcLength2D {
        solver: &input.solver,
        dof_num: &dof_num,
        cs: &cs,
        art: &art,
        its: &its,
        metric: &metric,
        sparse,
        ns,
        moves_supports,
        psi2,
        f_ref: &f_ref,
        f_ref_full: &f_ref_full,
        f_start: &f_start,
        f_start_full: &f_start_full,
        u_r_start: &u_r_start,
        du_support: &du_support,
        support_direction: &support_direction,
        start_internal: &start_internal,
        u_full,
        sparse_sym_cache: None,
        asm_t: None,
        residual: Vec::new(),
        steps: Vec::new(),
    };
    let outcome = solve_by_arc_length(&mut problem, &ArcLengthControl {
        max_steps: input.max_steps,
        max_iter: input.max_iter,
        tolerance: input.tolerance,
        initial_ds: input.initial_ds,
        min_ds: input.min_ds,
        max_ds: input.max_ds,
        target_iter: input.target_iter,
    })?;
    let ArcLength2D { mut u_full, steps, .. } = problem;
    let (lambda, overall_converged, total_iters) = (outcome.load_factor, outcome.converged, outcome.iterations);

    // Build final results using corotational forces (not linear)
    set_supports(&mut u_full, nf, &u_r_start, &du_support, lambda);
    let mut at_state = super::corotational::scaled_loads_2d(&input.solver, lambda);
    if let Some(start) = start {
        at_state.loads.extend(start.input.loads.clone());
    }
    let results = super::corotational::build_final_results(&at_state, &dof_num, &u_full, &cs, &its)?;

    Ok(ArcLengthResult {
        results,
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

/// Solve using displacement control method.
pub fn solve_displacement_control(input: &DisplacementControlInput) -> Result<DisplacementControlResult, String> {
    let mut r = solve_displacement_control_contained(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Corotational));
    Ok(r)
}

struct DisplacementControl2D<'a> {
    solver: &'a SolverInput,
    dof_num: &'a DofNumbering,
    cs: &'a Option<FreeConstraintSystem>,
    art: &'a [(usize, f64)],
    its: &'a [InclinedTransformData2D],
    metric: &'a super::convergence::EquilibriumMetric,
    sparse: bool,
    ns: usize,
    ctrl: usize,
    f_ref: &'a Vec<f64>,
    f_ref_full: &'a Vec<f64>,
    f_ref_s: &'a Vec<f64>,
    u_full: Vec<f64>,
    sparse_sym_cache: Option<SparseSymbolicCache>,
    asm_t: Option<TangentAssembly>,
    residual: Vec<f64>,
    steps: Vec<EquilibriumStep>,
}

impl PathProblem for DisplacementControl2D<'_> {
    fn unknowns(&self) -> usize {
        self.dof_num.n_free
    }

    fn load_scale(&self) -> f64 {
        vec_norm(self.f_ref).powi(2)
    }

    fn linearize_at(&mut self, _: f64) {
        self.asm_t = Some(assemble_tangent(self.solver, self.dof_num, &self.u_full, self.art, self.sparse, self.its));
    }

    fn measure(&mut self, lambda: f64) -> f64 {
        let nf = self.dof_num.n_free;
        let (f_ref, f_ref_full) = (self.f_ref, self.f_ref_full);
        let Some(asm_t) = self.asm_t.as_ref() else { return f64::INFINITY };
        let f_int = &asm_t.f_int;

        let mut residual = vec![0.0; nf];
        for i in 0..nf {
            residual[i] = lambda * f_ref[i] - f_int[i];
        }

        let applied: Vec<f64> = f_ref_full.iter().map(|f| lambda * f).collect();
        let rel_error = self.metric.relative_residual(&residual, &applied, None, self.cs.as_ref());
        self.residual = residual;
        rel_error
    }

    fn reference_response(&mut self) -> Result<Vec<f64>, String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else { return Err("Displacement-control analysis: no tangent assembled".into()) };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_t_s = solve_with_tangent(&tangent, self.f_ref_s, ns)?;
        Ok(if let Some(ref cs) = *self.cs { cs.expand_solution(&du_t_s, MasterMotion::Homogeneous) } else { du_t_s })
    }

    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
        let (n, nf, ns) = (self.dof_num.n_total, self.dof_num.n_free, self.ns);
        let Some(asm_t) = self.asm_t.take() else { return Err("Displacement-control analysis: no tangent assembled".into()) };
        let residual = std::mem::take(&mut self.residual);
        let residual_s = if let Some(ref cs) = *self.cs {
            cs.reduce_vector(&residual)
        } else {
            residual
        };
        let tangent = factor_assembled(&asm_t, n, nf, ns, self.cs, &mut self.sparse_sym_cache)?;
        let du_r_s = solve_with_tangent(&tangent, &residual_s, ns)?;
        let du_t_s = solve_with_tangent(&tangent, self.f_ref_s, ns)?;
        let du_r = if let Some(ref cs) = *self.cs { cs.expand_solution(&du_r_s, MasterMotion::Homogeneous) } else { du_r_s };
        let du_t = if let Some(ref cs) = *self.cs { cs.expand_solution(&du_t_s, MasterMotion::Homogeneous) } else { du_t_s };
        Ok((du_r, du_t))
    }

    fn advance(&mut self, step: &[f64]) {
        for i in 0..self.dof_num.n_free {
            self.u_full[i] += step[i];
        }
    }

    fn unknown(&self, index: usize) -> f64 {
        self.u_full[index]
    }

    fn record(&mut self, step: usize, lambda: f64, iterations: usize, converged: bool) {
        let n = self.dof_num.n_total;
        self.steps.push(EquilibriumStep {
            step,
            load_factor: lambda,
            control_displacement: self.u_full[self.ctrl],
            converged,
            iterations,
            displacements: super::linear::build_displacements_2d(self.dof_num, &assembly::to_global(&self.u_full, n, self.its)),
        });
    }
}

fn solve_displacement_control_contained(input: &DisplacementControlInput) -> Result<DisplacementControlResult, String> {
    // As above: validated before assembly indexes by id.
    super::linear::validate_input_2d(&input.solver)?;
    super::feature_gates::refuse_2d(&input.solver, "Displacement-control analysis", &[
        super::feature_gates::Feature::PrescribedDisplacements,
        super::feature_gates::Feature::InclinedSupports, super::feature_gates::Feature::ThermalLoads,
    ])?;
    crate::element::connector::refuse_for_corotational_2d(&input.solver, "Displacement-control analysis")?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs_dc = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let metric = super::convergence::EquilibriumMetric::for_2d(&input.solver, &dof_num, cs_dc.as_ref())?;
    let ns_dc = cs_dc.as_ref().map_or(nf, |c| c.n_free_indep);

    // At or above SPARSE_THRESHOLD independent DOFs the tangent is assembled
    // as lower-triangle triplets feeding the CSC sparse solve — no O(n²)
    // dense tangent is ever built; below the threshold, dense n×n as before.
    let sparse = ns_dc >= SPARSE_THRESHOLD;

    // Sparse symbolic factorization cache (ns >= SPARSE_THRESHOLD only): the
    // tangent's sparsity pattern is constant within a solve call, so the
    // symbolic phase is computed once and only the numeric phase repeats
    // per iteration.
    // Find global DOF index for control point
    let control_global = dof_num.map.get(&(input.control_node, input.control_dof))
        .ok_or("Control node/DOF not found in free DOFs")?;
    if *control_global >= nf {
        return Err("Control DOF is restrained".into());
    }
    let ctrl = *control_global;

    // Degenerate inputs, rejected before any work. These all reach here through
    // the public WASM entry point, which deserializes the whole struct from
    // caller JSON, so `n_steps` and `target_displacement` are whatever was sent.
    // Without these the function returns `converged: true` for an analysis that
    // never ran: `n_steps = 0` makes `delta_d` infinite and skips the step loop
    // entirely, leaving the initial zero state to be reported as the answer.
    if input.n_steps == 0 {
        return Err("Number of displacement steps must be at least 1".into());
    }
    if input.max_iter == 0 {
        return Err("Max iterations must be at least 1".into());
    }
    if !input.target_displacement.is_finite() || input.target_displacement == 0.0 {
        return Err("Target displacement must be finite and non-zero".into());
    }
    if !input.tolerance.is_finite() || input.tolerance <= 0.0 {
        return Err("Convergence tolerance must be finite and positive".into());
    }

    // Reference load
    // f_ref, the tangent and `u_full` are in the inclined-roller frames the
    // restraints are numbered in (`assemble_tangent` rotates); results are
    // rotated back to global axes.
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let its = asm.inclined_transforms_2d;
    let f_ref_full = asm.f;
    let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
    let f_ref_s_dc = if let Some(ref cs) = cs_dc {
        cs.reduce_vector(&f_ref)
    } else {
        f_ref.clone()
    };
    // Loop-invariant: f_ref is built once and never mutated.
    let f_ref_norm = metric.free_norm(&f_ref, cs_dc.as_ref());
    // Same guard `solve_arc_length` applies. Without a reference load the
    // tangent correction du_t is zero, so d_lambda is pinned at zero and the
    // control DOF is never driven anywhere — the solver would burn
    // n_steps * max_iter corotational assemblies to report a failure whose
    // cause was in the input all along.
    if f_ref_norm == 0.0 {
        return Err("Zero reference load".into());
    }

    let mut problem = DisplacementControl2D {
        solver: &input.solver,
        dof_num: &dof_num,
        cs: &cs_dc,
        art: &art,
        its: &its,
        metric: &metric,
        sparse,
        ns: ns_dc,
        ctrl,
        f_ref: &f_ref,
        f_ref_full: &f_ref_full,
        f_ref_s: &f_ref_s_dc,
        u_full: vec![0.0; n],
        sparse_sym_cache: None,
        asm_t: None,
        residual: Vec::new(),
        steps: Vec::new(),
    };
    let outcome = solve_by_displacement_control(&mut problem, &DisplacementControl {
        control: ctrl,
        target: input.target_displacement,
        n_steps: input.n_steps,
        max_iter: input.max_iter,
        tolerance: input.tolerance,
    })?;
    let DisplacementControl2D { u_full, steps, .. } = problem;
    let (lambda, overall_converged, total_iters) = (outcome.load_factor, outcome.converged, outcome.iterations);

    let at_state = super::corotational::scaled_loads_2d(&input.solver, lambda);
    let results = super::corotational::build_final_results(&at_state, &dof_num, &u_full, &cs_dc, &its)?;

    Ok(DisplacementControlResult {
        results,
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

// ==================== Helpers ====================


/// Tangent stiffness factored once, reusable for multiple right-hand sides.
/// The dense decompositions (Cholesky with LU fallback) match what the
/// previous per-RHS solve did, so one factor for two RHS gives identical
/// results to factoring twice. Above `SPARSE_THRESHOLD` independent DOFs the
/// tangent is factored with sparse Cholesky instead (symbolic phase cached
/// per solve call in `SparseSymbolicCache`).
enum FactoredTangent {
    /// Cholesky factor L (lower triangle stored in n*n array)
    Cholesky { l: Vec<f64> },
    /// LU decomposition with partial pivoting
    Lu { a: Vec<f64>, piv: Vec<usize> },
    /// Sparse Cholesky numeric factor (ns >= SPARSE_THRESHOLD)
    Sparse { num: NumericCholesky },
}

/// Factor K_T once for repeated solves over multiple right-hand sides.
///
/// `k_ff` is the dense free block; constraint reduction happens inside:
/// sparse (`reduce_matrix_sparse`) at or above `SPARSE_THRESHOLD` independent
/// DOFs, dense (`reduce_matrix`) below it, keeping the dense path
/// byte-identical to before.
fn factor_tangent(
    k_ff: &[f64],
    nf: usize,
    ns: usize,
    cs: &Option<FreeConstraintSystem>,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    if ns >= SPARSE_THRESHOLD {
        let k_s_csc = tangent_free_sparse(k_ff, nf, cs);
        return factor_tangent_sparse(&k_s_csc, ns, cache);
    }

    let k_s = if let Some(ref cs) = cs { cs.reduce_matrix(k_ff) } else { k_ff.to_vec() };
    let mut l = k_s.clone();
    if cholesky_decompose(&mut l, ns) {
        return Ok(FactoredTangent::Cholesky { l });
    }
    factor_tangent_lu(k_s, ns)
}

/// Sparse factorization of an already constraint-reduced CSC tangent:
/// symbolic factorization is cached across iterations (the pattern is
/// constant within a solve call); if the numeric phase reports a non-SPD
/// tangent, falls back to dense LU, size-capped by `MAX_DENSE_FALLBACK_DOFS` —
/// mirrors `sparse_tangent::solve_tangent_sparse` /
/// `time_integration::factor_effective_stiffness`.
fn factor_tangent_sparse(
    k_s_csc: &CscMatrix,
    ns: usize,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    let sym = cached_symbolic(cache, k_s_csc);
    if let Some(num) = numeric_cholesky(sym, k_s_csc) {
        return Ok(FactoredTangent::Sparse { num });
    }
    // Sparse Cholesky reports a non-SPD tangent: dense LU fallback,
    // size-capped like corotational/time_integration.
    if ns > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Tangent stiffness is not SPD (sparse Cholesky) and the dense LU fallback would need a {ns}×{ns} dense matrix ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * ns * ns / 1_000_000
        ));
    }
    factor_tangent_lu(k_s_csc.to_dense_symmetric(), ns)
}

/// Dense LU factorization with partial pivoting — identical factorization
/// phase to `lu_solve`. Shared by the below-threshold path and the sparse
/// non-SPD fallback.
fn factor_tangent_lu(k_s: Vec<f64>, ns: usize) -> Result<FactoredTangent, String> {
    let mut a = k_s;
    let mut piv: Vec<usize> = (0..ns).collect();

    for k in 0..ns {
        let mut max_val = a[piv[k] * ns + k].abs();
        let mut max_row = k;
        for i in (k + 1)..ns {
            let val = a[piv[i] * ns + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        if max_val < 1e-14 {
            return Err("Singular tangent stiffness".to_string());
        }

        piv.swap(k, max_row);

        let pivot = a[piv[k] * ns + k];
        for i in (k + 1)..ns {
            let factor = a[piv[i] * ns + k] / pivot;
            a[piv[i] * ns + k] = factor;
            for j in (k + 1)..ns {
                let val = a[piv[k] * ns + j];
                a[piv[i] * ns + j] -= factor * val;
            }
        }
    }

    Ok(FactoredTangent::Lu { a, piv })
}

/// Solve with a pre-factored tangent. The dense substitution steps are
/// identical to `cholesky_solve` / `lu_solve`, so dense results match a
/// fresh per-RHS solve bit for bit.
fn solve_with_tangent(factored: &FactoredTangent, rhs: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    match factored {
        FactoredTangent::Cholesky { l } => {
            let y = forward_solve(l, rhs, nf);
            Ok(back_solve(l, &y, nf))
        }
        FactoredTangent::Lu { a, piv } => {
            // Forward substitution (Ly = Pb)
            let mut y = vec![0.0; nf];
            for i in 0..nf {
                y[i] = rhs[piv[i]];
                for j in 0..i {
                    y[i] -= a[piv[i] * nf + j] * y[j];
                }
            }
            // Back substitution (Ux = y)
            let mut x = vec![0.0; nf];
            for i in (0..nf).rev() {
                x[i] = y[i];
                for j in (i + 1)..nf {
                    x[i] -= a[piv[i] * nf + j] * x[j];
                }
                x[i] /= a[piv[i] * nf + i];
            }
            // Same NaN/Inf guard as `lu_solve`
            if x.iter().any(|v| v.is_nan() || v.is_infinite()) {
                return Err("Singular tangent stiffness".to_string());
            }
            Ok(x)
        }
        FactoredTangent::Sparse { num } => Ok(sparse_cholesky_solve(num, rhs)),
    }
}

// Sparse symbolic factorization cache and tangent conversion helpers now
// live in `super::sparse_tangent` (shared with corotational and contact).

/// Co-rotational tangent + internal forces for one Newton iteration: dense n×n
/// tangent below `SPARSE_THRESHOLD`, lower-triangle (gi >= gj) COO triplets at
/// or above it — the sparse path never materializes the O(n²) dense tangent.
/// `f_int` is accumulated over ALL n DOFs identically in both paths.
struct TangentAssembly {
    f_int: Vec<f64>,
    /// Dense n×n tangent (dense path only; empty on the sparse path)
    k_t: Vec<f64>,
    /// Lower-triangle triplets (sparse path only)
    trip_rows: Vec<usize>,
    trip_cols: Vec<usize>,
    trip_vals: Vec<f64>,
}

/// `u_frame` and the returned tangent and `f_int` are in the inclined-roller
/// frames `its`; the elements see the displacement in global axes.
fn assemble_tangent(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_frame: &[f64],
    art: &[(usize, f64)],
    sparse: bool,
    its: &[InclinedTransformData2D],
) -> TangentAssembly {
    let n = dof_num.n_total;
    let u_global = assembly::to_global(u_frame, n, its);
    let u_full = &u_global[..];
    let mut f_int = vec![0.0; n];
    let mut k_t: Vec<f64> = Vec::new();
    let mut trip_rows: Vec<usize> = Vec::new();
    let mut trip_cols: Vec<usize> = Vec::new();
    let mut trip_vals: Vec<f64> = Vec::new();

    if sparse {
        assemble_corotational_triplets_2d(
            input, dof_num, u_full, &mut f_int,
            &mut trip_rows, &mut trip_cols, &mut trip_vals,
        );
        // Springs, connectors and artificial stiffness, shared with the
        // co-rotational solver (off-diagonal entries included).
        add_spring_contributions(input, dof_num, u_full, &mut f_int, art, &mut |gi, gj, v| {
            if gi >= gj {
                trip_rows.push(gi);
                trip_cols.push(gj);
                trip_vals.push(v);
            }
        });
    } else {
        k_t = vec![0.0; n * n];
        assemble_corotational_public(input, dof_num, u_full, &mut f_int, &mut k_t);
        add_spring_contributions(input, dof_num, u_full, &mut f_int, art, &mut |gi, gj, v| {
            k_t[gi * n + gj] += v;
        });
    }

    for it in its {
        if sparse {
            it.rotate_triplets(&mut trip_rows, &mut trip_cols, &mut trip_vals);
        } else {
            it.rotate_dense(&mut k_t, n);
        }
        it.rotate(&mut f_int);
    }

    TangentAssembly { f_int, k_t, trip_rows, trip_cols, trip_vals }
}

/// Factor the assembled tangent once for repeated solves over multiple
/// right-hand sides. Sparse path: free×free triplets -> constraint-reduced CSC
/// -> cached-symbolic sparse Cholesky. Dense path: extract the free block and
/// factor exactly as before.
fn factor_assembled(
    asm: &TangentAssembly,
    n: usize,
    nf: usize,
    ns: usize,
    cs: &Option<FreeConstraintSystem>,
    cache: &mut Option<SparseSymbolicCache>,
) -> Result<FactoredTangent, String> {
    if ns >= SPARSE_THRESHOLD {
        let k_s_csc = tangent_free_sparse_triplets(
            &asm.trip_rows, &asm.trip_cols, &asm.trip_vals, nf, cs,
        );
        return factor_tangent_sparse(&k_s_csc, ns, cache);
    }
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k_t, n, &free_idx, &free_idx);
    factor_tangent(&k_ff, nf, ns, cs, cache)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_cantilever() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dz: None, dry: None, angle: None,
        });

        SolverInput {
            solver_options: None, masses: Default::default(),
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fz: -10.0, my: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_displacement_control_basic() {
        let solver = make_cantilever();
        let input = DisplacementControlInput {
            solver,
            control_node: 1,
            control_dof: 1, // uy
            target_displacement: -0.01,
            n_steps: 5,
            max_iter: 30,
            tolerance: 1e-6,
        };
        let result = solve_displacement_control(&input).unwrap();
        assert!(result.converged, "Should converge");
        assert!(result.steps.len() > 0);

        // Control DOF should reach target
        let d1 = result.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
        assert!(
            (d1.uz - (-0.01)).abs() < 1e-4,
            "Control DOF: got {} expected -0.01", d1.uz
        );
    }

    #[test]
    fn test_arc_length_basic() {
        let solver = make_cantilever();
        let input = ArcLengthInput {
            solver,
            max_steps: 20,
            max_iter: 30,
            tolerance: 1e-6,
            initial_ds: 0.5,
            min_ds: 1e-6,
            max_ds: 2.0,
            target_iter: 5,
        };
        let result = solve_arc_length(&input).unwrap();
        assert!(result.steps.len() > 0, "Should have at least one step");

        // For a linear cantilever, arc-length should trace the path
        // Load factor should be positive after the first step
        if let Some(last) = result.steps.last() {
            assert!(last.load_factor > 0.0, "Load factor should be positive");
        }
    }

    #[test]
    fn test_arc_length_abort_returns_last_converged_state() {
        // Force the abort path: max_iter = 1 cannot converge a genuinely
        // nonlinear large-load step, and ds halves below min_ds quickly.
        // The final results must reflect the last converged state (here:
        // no converged step -> zero displacements, zero load factor), not
        // the failed step's unconverged iterate.
        let solver = make_cantilever();
        let input = ArcLengthInput {
            solver,
            max_steps: 10,
            max_iter: 1,
            tolerance: 1e-6,
            initial_ds: 0.5,
            min_ds: 0.1,
            max_ds: 2.0,
            target_iter: 5,
        };
        let result = solve_arc_length(&input).unwrap();
        assert!(!result.converged, "Should report non-convergence");
        assert!(result.steps.is_empty(), "No step should have converged");
        assert!(
            result.final_load_factor == 0.0,
            "Load factor should be restored to 0.0, got {}",
            result.final_load_factor
        );
        for d in &result.results.displacements {
            assert!(
                d.ux.abs() < 1e-15 && d.uz.abs() < 1e-15 && d.ry.abs() < 1e-15,
                "Displacements should be the last converged (zero) state, got ux={} uz={} ry={} at node {}",
                d.ux, d.uz, d.ry, d.node_id
            );
        }
    }
}

#[cfg(test)]
mod shared_driver_equivalence {
    use super::*;
    use crate::solver::path_following::dot_product;
    use std::collections::HashMap;

    fn before_the_shared_driver(input: &ArcLengthInput, start: Option<&crate::solver::corotational::CorotationalStart2D>) -> Result<ArcLengthResult, String> {
        crate::solver::linear::validate_input_2d(&input.solver)?;
        crate::solver::feature_gates::refuse_2d(&input.solver, "Arc-length analysis", &[
            crate::solver::feature_gates::Feature::ThermalLoads,
        ])?;
        crate::element::connector::refuse_for_corotational_2d(&input.solver, "Arc-length analysis")?;
        crate::solver::corotational::refuse_inclined_motion_2d(&input.solver, start.is_some())?;

        let dof_num = DofNumbering::build_2d(&input.solver);
        if dof_num.n_free == 0 {
            return Err("No free DOFs".into());
        }

        let n = dof_num.n_total;
        let nf = dof_num.n_free;

        let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
        let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

        let sparse = ns >= SPARSE_THRESHOLD;

        let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

        let asm = assembly::assemble_2d(&input.solver, &dof_num);
        let art = assembly::artificial_stiffness_entries(&asm);
        let its = asm.inclined_transforms_2d;
        let f_ref_full = asm.f;
        let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
        let (mut u_full, f_start) = match start {
            Some(start) => crate::solver::corotational::start_state_2d(&input.solver, start, &dof_num)?,
            None => (vec![0.0; n], vec![0.0; n]),
        };
        let f_start_full = f_start;
        let f_start: Vec<f64> = f_start_full[..nf].to_vec();
        let u_r_start: Vec<f64> = u_full[nf..].to_vec();
        let du_support = crate::solver::linear::prescribed_displacements_2d(&input.solver, &dof_num);
        let moves_supports = du_support.iter().any(|&v| v != 0.0);
        let mut support_direction = vec![0.0; n];
        support_direction[nf..].copy_from_slice(&du_support);
        if let Some(ref cs) = cs { cs.impose_motion(&mut support_direction); }
        let support_extent: Vec<_> = u_r_start.iter().zip(&du_support)
            .map(|(a,b)|a.abs()+b.abs()).collect();
        let metric = crate::solver::convergence::EquilibriumMetric::for_2d_with_state(
            &input.solver, &dof_num, cs.as_ref(), Some(&support_extent), &[],
        )?;
        let start_internal = if start.is_some() {
            crate::solver::corotational::continuation_internal_2d(&input.solver, &dof_num, &u_full, &its, &art)
        } else {
            vec![0.0; n]
        };
        let f_ref_norm = metric.free_norm(&f_ref, cs.as_ref());
        if f_ref_norm == 0.0 && !moves_supports {
            return Err("Zero reference load".into());
        }
        let psi2 = if f_ref_norm > 0.0 { vec_norm(&f_ref).powi(2) } else { vec_norm(&du_support).powi(2) };
        let set_supports = |u: &mut [f64], lambda: f64| {
            for (r, (&u0, &du)) in u_r_start.iter().zip(&du_support).enumerate() {
                u[nf + r] = u0 + lambda * du;
            }
        };
        let reference = |asm_t: &TangentAssembly| -> Vec<f64> {
            let mut g = f_ref.clone();
            if moves_supports {
                if sparse {
                    for ((&i, &j), &v) in asm_t.trip_rows.iter().zip(&asm_t.trip_cols).zip(&asm_t.trip_vals) {
                        if i < nf { g[i] -= v * support_direction[j]; }
                        if i != j && j < nf { g[j] -= v * support_direction[i]; }
                    }
                } else {
                    for (i, gi) in g.iter_mut().enumerate() {
                        *gi -= (0..n).map(|j| asm_t.k_t[i * n + j] * support_direction[j]).sum::<f64>();
                    }
                }
            }
            g
        };
        let reduce = |v: &Vec<f64>| if let Some(ref cs) = cs { cs.reduce_vector(v) } else { v.clone() };

        let mut lambda = 0.0_f64;
        let mut ds = input.initial_ds;
        let mut steps = Vec::new();
        let mut total_iters = 0;
        let mut overall_converged = true;

        let mut prev_delta_u = vec![0.0; nf];
        let mut prev_delta_lambda = 1.0_f64;

        let mut step = 0;
        while step < input.max_steps {
            set_supports(&mut u_full, lambda);
            let asm_t = assemble_tangent(&input.solver, &dof_num, &u_full, &art, sparse, &its);

            let du_hat_s = {
                let tangent = factor_assembled(&asm_t, n, nf, ns, &cs, &mut sparse_sym_cache)?;
                solve_with_tangent(&tangent, &reduce(&reference(&asm_t)), ns)?
            };
            let du_hat = if let Some(ref cs) = cs { cs.expand_solution(&du_hat_s, MasterMotion::Prescribed(&du_support)) } else { du_hat_s };

            let du_hat_norm = vec_norm(&du_hat);
            let denom = du_hat_norm * du_hat_norm + psi2;
            let mut delta_lambda = ds / denom.sqrt();

            let dot = dot_product(&prev_delta_u, &du_hat) + prev_delta_lambda * delta_lambda * psi2;
            if dot < 0.0 {
                delta_lambda = -delta_lambda;
            }

            let mut delta_u: Vec<f64> = du_hat.iter().map(|&v| delta_lambda * v).collect();

            for i in 0..nf {
                u_full[i] += delta_u[i];
            }
            lambda += delta_lambda;

            let mut step_converged = false;
            let mut step_iters = 0;

            for _iter in 0..input.max_iter {
                step_iters += 1;
                total_iters += 1;

                set_supports(&mut u_full, lambda);
                let asm_t = assemble_tangent(&input.solver, &dof_num, &u_full, &art, sparse, &its);
                let f_int_new = &asm_t.f_int;

                let mut residual = vec![0.0; nf];
                for i in 0..nf {
                    residual[i] = f_start[i] + lambda * f_ref[i] - f_int_new[i];
                }

                let applied: Vec<f64> = (0..n).map(|i| f_start_full[i] + lambda * f_ref_full[i]).collect();
                if metric.continuation_residual(&residual,&applied,&u_full[nf..],&f_start_full,&start_internal,cs.as_ref()) < input.tolerance {
                    step_converged = true;
                    break;
                }

                let residual_s = if let Some(ref cs) = cs { cs.reduce_vector(&residual) } else { residual.clone() };
                let tangent = factor_assembled(&asm_t, n, nf, ns, &cs, &mut sparse_sym_cache)?;
                let du_r_s = solve_with_tangent(&tangent, &residual_s, ns)?;
                let du_t_s = solve_with_tangent(&tangent, &reduce(&reference(&asm_t)), ns)?;
                let du_r = if let Some(ref cs) = cs { cs.expand_solution(&du_r_s, MasterMotion::Homogeneous) } else { du_r_s };
                let du_t = if let Some(ref cs) = cs { cs.expand_solution(&du_t_s, MasterMotion::Prescribed(&du_support)) } else { du_t_s };

                let a_coeff = dot_product(&du_t, &du_t) + psi2;
                let b_coeff = 2.0 * (dot_product(&delta_u, &du_t) + dot_product(&du_r, &du_t)
                    + delta_lambda * psi2);
                let c_coeff = dot_product(&delta_u, &delta_u) + 2.0 * dot_product(&delta_u, &du_r)
                    + dot_product(&du_r, &du_r)
                    + delta_lambda * delta_lambda * psi2
                    - ds * ds;

                let discriminant = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
                let d_lambda = if discriminant >= 0.0 {
                    let sqrt_d = discriminant.sqrt();
                    let root1 = (-b_coeff + sqrt_d) / (2.0 * a_coeff);
                    let root2 = (-b_coeff - sqrt_d) / (2.0 * a_coeff);

                    let du1: Vec<f64> = (0..nf).map(|i| du_r[i] + root1 * du_t[i]).collect();
                    let du2: Vec<f64> = (0..nf).map(|i| du_r[i] + root2 * du_t[i]).collect();
                    let work1 = dot_product(&delta_u, &du1);
                    let work2 = dot_product(&delta_u, &du2);

                    if work1 >= work2 { root1 } else { root2 }
                } else {
                    -b_coeff / (2.0 * a_coeff)
                };

                for i in 0..nf {
                    let du_i = du_r[i] + d_lambda * du_t[i];
                    u_full[i] += du_i;
                    delta_u[i] += du_i;
                }
                lambda += d_lambda;
                delta_lambda += d_lambda;
            }

            if !step_converged {
                for i in 0..nf {
                    u_full[i] -= delta_u[i];
                }
                lambda -= delta_lambda;

                ds *= 0.5;
                if ds < input.min_ds {
                    overall_converged = false;
                    break;
                }
                continue;
            }

            step += 1;
            set_supports(&mut u_full, lambda);
            steps.push(EquilibriumStep {
                step,
                load_factor: lambda,
                control_displacement: u_full.get(0).copied().unwrap_or(0.0),
                converged: true,
                iterations: step_iters,
                displacements: crate::solver::linear::build_displacements_2d(&dof_num, &assembly::to_global(&u_full, n, &its)),
            });

            prev_delta_u = delta_u;
            prev_delta_lambda = delta_lambda;

            if step_iters <= input.target_iter / 2 {
                ds = (ds * 2.0).min(input.max_ds);
            } else if step_iters > input.target_iter * 2 {
                ds = (ds * 0.5).max(input.min_ds);
            }
        }

        set_supports(&mut u_full, lambda);
        let mut at_state = crate::solver::corotational::scaled_loads_2d(&input.solver, lambda);
        if let Some(start) = start {
            at_state.loads.extend(start.input.loads.clone());
        }
        let results = crate::solver::corotational::build_final_results(&at_state, &dof_num, &u_full, &cs, &its)?;

        Ok(ArcLengthResult {
            results,
            steps,
            final_load_factor: lambda,
            converged: overall_converged,
            total_iterations: total_iters,
        })
    }

    fn frame(n: usize, rise: f64, far_support: Option<&str>) -> SolverInput {
        let (mut nodes, mut elements, mut supports) = (HashMap::new(), HashMap::new(), HashMap::new());
        for i in 0..=n {
            let t = i as f64 / n as f64;
            nodes.insert((i + 1).to_string(), SolverNode { id: i + 1, x: 6.0 * t, z: rise * 4.0 * t * (1.0 - t) });
        }
        for i in 0..n {
            elements.insert((i + 1).to_string(), SolverElement {
                id: i + 1, elem_type: "frame".into(), node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
            });
        }
        let support = |id: usize, node_id: usize, kind: &str| SolverSupport {
            id, node_id, support_type: kind.into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
        };
        supports.insert("1".into(), support(1, 1, if far_support.is_some() { "pinned" } else { "fixed" }));
        if let Some(kind) = far_support {
            supports.insert("2".into(), support(2, n + 1, kind));
        }
        let loaded = if far_support.is_some() { n / 2 + 1 } else { n + 1 };
        SolverInput {
            solver_options: None, masses: Default::default(), nodes,
            materials: HashMap::from([("1".to_string(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 })]),
            sections: HashMap::from([("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None })]),
            elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: loaded, fx: 0.0, fz: -30.0, my: 0.0 })],
            constraints: vec![], connectors: HashMap::new(),
        }
    }

    fn asked(solver: SolverInput, max_steps: usize, max_iter: usize, initial_ds: f64) -> ArcLengthInput {
        ArcLengthInput { solver, max_steps, max_iter, tolerance: 1e-8, initial_ds, min_ds: 1e-5, max_ds: 2.0 * initial_ds, target_iter: 5 }
    }

    fn same(input: &ArcLengthInput, start: Option<&crate::solver::corotational::CorotationalStart2D>) -> Option<ArcLengthResult> {
        let before = before_the_shared_driver(input, start);
        let now = solve_arc_length_contained(input, start);
        match (before, now) {
            (Ok(before), Ok(now)) => {
                assert_eq!(format!("{before:?}"), format!("{now:?}"));
                Some(now)
            }
            (Err(before), Err(now)) => {
                assert_eq!(before, now);
                None
            }
            (before, now) => panic!("{:?} against {:?}", before.map(|r| r.converged), now.map(|r| r.converged)),
        }
    }

    #[test]
    fn the_shared_driver_gives_the_paths_the_loop_gave_bit_for_bit() {
        let (mut followed, mut cut_short, mut sparse, mut steps) = (0, 0, 0, 0);
        for n in [2, 6, 14, 30] {
            for (rise, far_support) in [(0.0, None), (0.3, None), (0.15, Some("pinned")), (0.6, Some("pinned"))] {
                let solver = frame(n, rise, far_support);
                if DofNumbering::build_2d(&solver).n_free >= SPARSE_THRESHOLD { sparse += 1; }
                for (max_steps, max_iter, initial_ds) in [(12, 30, 0.05), (30, 30, 0.2), (8, 2, 0.5), (6, 1, 0.05), (0, 30, 0.1)] {
                    let Some(result) = same(&asked(solver.clone(), max_steps, max_iter, initial_ds), None) else { continue };
                    steps += result.steps.len();
                    if result.converged { followed += 1 } else { cut_short += 1 }
                }
            }
        }
        assert!(followed >= 30 && cut_short >= 4 && sparse >= 3 && steps >= 300, "{followed} followed, {cut_short} cut short, {sparse} sparse, {steps} steps");
    }

    #[test]
    fn moving_supports_a_start_state_and_refusals_go_through_the_shared_driver_unchanged() {
        for n in [6, 30] {
            let mut settling = frame(n, 0.3, Some("pinned"));
            settling.supports.get_mut("2").unwrap().dz = Some(-0.05);
            assert!(same(&asked(settling.clone(), 10, 30, 0.05), None).is_some());
            settling.loads.clear();
            assert!(same(&asked(settling, 10, 30, 0.05), None).is_some());

            let first = frame(n, 0.3, Some("pinned"));
            let reached = crate::solver::corotational::solve_corotational_2d(&first, 60, 1e-8, 8, false).unwrap();
            let start = crate::solver::corotational::CorotationalStart2D { input: &first, displacements: &reached.results.displacements };
            let mut next = frame(n, 0.3, Some("pinned"));
            next.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 2.0, fz: -10.0, my: 0.0 })];
            assert!(same(&asked(next, 10, 30, 0.05), Some(&start)).is_some());
        }
        let mut unloaded = frame(6, 0.3, None);
        unloaded.loads.clear();
        assert!(same(&asked(unloaded, 10, 30, 0.05), None).is_none());
        let mut held = frame(1, 0.0, Some("fixed"));
        held.supports.get_mut("1").unwrap().support_type = "fixed".into();
        assert!(same(&asked(held, 10, 30, 0.05), None).is_none());
    }

    fn displacement_control_before_the_shared_driver(input: &DisplacementControlInput) -> Result<DisplacementControlResult, String> {
        crate::solver::linear::validate_input_2d(&input.solver)?;
        crate::solver::feature_gates::refuse_2d(&input.solver, "Displacement-control analysis", &[
            crate::solver::feature_gates::Feature::PrescribedDisplacements,
            crate::solver::feature_gates::Feature::InclinedSupports, crate::solver::feature_gates::Feature::ThermalLoads,
        ])?;
        crate::element::connector::refuse_for_corotational_2d(&input.solver, "Displacement-control analysis")?;

        let dof_num = DofNumbering::build_2d(&input.solver);
        if dof_num.n_free == 0 {
            return Err("No free DOFs".into());
        }

        let n = dof_num.n_total;
        let nf = dof_num.n_free;

        let cs_dc = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
        let metric = crate::solver::convergence::EquilibriumMetric::for_2d(&input.solver, &dof_num, cs_dc.as_ref())?;
        let ns_dc = cs_dc.as_ref().map_or(nf, |c| c.n_free_indep);

        let sparse = ns_dc >= SPARSE_THRESHOLD;

        let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

        let control_global = dof_num.map.get(&(input.control_node, input.control_dof))
            .ok_or("Control node/DOF not found in free DOFs")?;
        if *control_global >= nf {
            return Err("Control DOF is restrained".into());
        }
        let ctrl = *control_global;

        if input.n_steps == 0 {
            return Err("Number of displacement steps must be at least 1".into());
        }
        if input.max_iter == 0 {
            return Err("Max iterations must be at least 1".into());
        }
        if !input.target_displacement.is_finite() || input.target_displacement == 0.0 {
            return Err("Target displacement must be finite and non-zero".into());
        }
        if !input.tolerance.is_finite() || input.tolerance <= 0.0 {
            return Err("Convergence tolerance must be finite and positive".into());
        }

        let asm = assembly::assemble_2d(&input.solver, &dof_num);
        let art = assembly::artificial_stiffness_entries(&asm);
        let its = asm.inclined_transforms_2d;
        let f_ref_full = asm.f;
        let f_ref: Vec<f64> = f_ref_full[..nf].to_vec();
        let f_ref_s_dc = if let Some(ref cs) = cs_dc {
            cs.reduce_vector(&f_ref)
        } else {
            f_ref.clone()
        };
        let f_ref_norm = metric.free_norm(&f_ref, cs_dc.as_ref());
        if f_ref_norm == 0.0 {
            return Err("Zero reference load".into());
        }

        let mut u_full = vec![0.0; n];
        let mut lambda = 0.0_f64;
        let mut steps = Vec::new();
        let mut total_iters = 0;
        let mut overall_converged = true;

        let delta_d = input.target_displacement / input.n_steps as f64;
        let disp_scale = delta_d.abs();

        for step in 0..input.n_steps {
            let target_disp = (step + 1) as f64 * delta_d;

            let mut step_converged = false;
            let mut step_iters = 0;

            for _iter in 0..input.max_iter {
                step_iters += 1;
                total_iters += 1;

                let asm_t = assemble_tangent(&input.solver, &dof_num, &u_full, &art, sparse, &its);
                let f_int = &asm_t.f_int;

                let mut residual = vec![0.0; nf];
                for i in 0..nf {
                    residual[i] = lambda * f_ref[i] - f_int[i];
                }

                let disp_error = target_disp - u_full[ctrl];

                let applied: Vec<f64> = f_ref_full.iter().map(|f| lambda * f).collect();
                let rel_error = metric.relative_residual(&residual, &applied, None, cs_dc.as_ref());
                let residual_s = if let Some(ref cs) = cs_dc {
                    cs.reduce_vector(&residual)
                } else {
                    residual
                };
                let disp_ok = disp_error.abs() <= input.tolerance * disp_scale;
                if rel_error < input.tolerance && disp_ok {
                    step_converged = true;
                    break;
                }

                let tangent = factor_assembled(&asm_t, n, nf, ns_dc, &cs_dc, &mut sparse_sym_cache)?;
                let du_r_s = solve_with_tangent(&tangent, &residual_s, ns_dc)?;
                let du_t_s = solve_with_tangent(&tangent, &f_ref_s_dc, ns_dc)?;
                let du_r = if let Some(ref cs) = cs_dc { cs.expand_solution(&du_r_s, MasterMotion::Homogeneous) } else { du_r_s };
                let du_t = if let Some(ref cs) = cs_dc { cs.expand_solution(&du_t_s, MasterMotion::Homogeneous) } else { du_t_s };

                let step = (disp_error - du_r[ctrl]) / du_t[ctrl];
                let d_lambda = if du_t[ctrl] != 0.0 && step.is_finite() {
                    step
                } else {
                    0.0
                };

                for i in 0..nf {
                    u_full[i] += du_r[i] + d_lambda * du_t[i];
                }
                lambda += d_lambda;
            }

            steps.push(EquilibriumStep {
                step: step + 1,
                load_factor: lambda,
                control_displacement: u_full[ctrl],
                converged: step_converged,
                iterations: step_iters,
                displacements: crate::solver::linear::build_displacements_2d(&dof_num, &assembly::to_global(&u_full, n, &its)),
            });

            if !step_converged {
                overall_converged = false;
                break;
            }
        }

        let at_state = crate::solver::corotational::scaled_loads_2d(&input.solver, lambda);
        let results = crate::solver::corotational::build_final_results(&at_state, &dof_num, &u_full, &cs_dc, &its)?;

        Ok(DisplacementControlResult {
            results,
            steps,
            final_load_factor: lambda,
            converged: overall_converged,
            total_iterations: total_iters,
        })
    }
    fn driven(solver: SolverInput, control_node: usize, control_dof: usize, target_displacement: f64, n_steps: usize, max_iter: usize) -> DisplacementControlInput {
        DisplacementControlInput { solver, control_node, control_dof, target_displacement, n_steps, max_iter, tolerance: 1e-8 }
    }

    fn same_driven(input: &DisplacementControlInput) -> Option<DisplacementControlResult> {
        let before = displacement_control_before_the_shared_driver(input);
        let now = solve_displacement_control_contained(input);
        match (before, now) {
            (Ok(before), Ok(now)) => {
                assert_eq!(format!("{before:?}"), format!("{now:?}"));
                Some(now)
            }
            (Err(before), Err(now)) => {
                assert_eq!(before, now);
                None
            }
            (before, now) => panic!("{:?} against {:?}", before.map(|r| r.converged), now.map(|r| r.converged)),
        }
    }

    #[test]
    fn the_shared_driver_gives_the_driven_paths_the_loop_gave_bit_for_bit() {
        let (mut reached, mut stopped, mut sparse, mut steps) = (0, 0, 0, 0);
        for n in [2, 6, 14, 30] {
            for (rise, far_support) in [(0.0, None), (0.3, None), (0.15, Some("pinned")), (0.6, Some("pinned"))] {
                let solver = frame(n, rise, far_support);
                if DofNumbering::build_2d(&solver).n_free >= SPARSE_THRESHOLD { sparse += 1; }
                let node = if far_support.is_some() { n / 2 + 1 } else { n + 1 };
                for (dof, target, n_steps, max_iter) in [(1, -0.05, 10, 30), (1, -0.4, 8, 30), (1, 0.02, 5, 30), (2, 0.1, 6, 30), (1, -0.4, 4, 2), (1, -0.05, 3, 1)] {
                    let Some(result) = same_driven(&driven(solver.clone(), node, dof, target, n_steps, max_iter)) else { continue };
                    steps += result.steps.len();
                    if result.converged { reached += 1 } else { stopped += 1 }
                }
            }
        }
        assert!(reached >= 25 && stopped >= 10 && sparse >= 3 && steps >= 200, "{reached} reached, {stopped} stopped, {sparse} sparse, {steps} steps");
    }

    #[test]
    fn refused_displacement_control_is_refused_with_the_same_words() {
        let solver = frame(6, 0.3, None);
        for input in [
            driven(solver.clone(), 7, 1, -0.05, 0, 30),
            driven(solver.clone(), 7, 1, -0.05, 10, 0),
            driven(solver.clone(), 7, 1, 0.0, 10, 30),
            driven(solver.clone(), 7, 1, f64::NAN, 10, 30),
            driven(solver.clone(), 1, 1, -0.05, 10, 30),
            driven(solver.clone(), 99, 1, -0.05, 10, 30),
            driven(solver.clone(), 7, 9, -0.05, 10, 30),
        ] {
            assert!(same_driven(&input).is_none());
        }
        let mut unloaded = frame(6, 0.3, None);
        unloaded.loads.clear();
        assert!(same_driven(&driven(unloaded, 7, 1, -0.05, 10, 30)).is_none());
        let mut tolerance = driven(solver, 7, 1, -0.05, 10, 30);
        tolerance.tolerance = 0.0;
        assert!(same_driven(&tolerance).is_none());
    }
}
