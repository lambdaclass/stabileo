//! The solution driver: R(u, λ) = λ·F − f_int(u) = 0 by Newton–Raphson.

use super::linear_solver::{Bordered, Factor, FactorMethod, TangentSystem};
use super::model::{DofKind, NonlinearModel};
use crate::linalg::jacobi::jacobi_eigen;

/// How the load is applied.
#[derive(Debug, Clone)]
pub enum Strategy {
    /// λ from 0 to `target` in `increments` equal steps.
    LoadControl { target: f64, increments: usize },
    /// The displacement at `dof` (a translation) from 0 to `target` in
    /// `increments` equal steps, λ found at each step (Batoz–Dhatt). Passes
    /// limit points in load (snap-through), not in displacement (snap-back).
    DisplacementControl { dof: usize, target: f64, increments: usize },
    /// Arc-length (Crisfield's cylindrical constraint on the translations)
    /// until λ reaches `target`, in at most `max_steps` steps; the first arc
    /// is the one a load step of `target / increments` would take. Follows
    /// snap-through and snap-back.
    ArcLength { target: f64, increments: usize, max_steps: usize },
    /// The robust default: load control, and arc-length from the last
    /// converged state if load control meets a limit or bifurcation point
    /// (or stops converging there), until λ reaches `target`. Arc-length
    /// switches branch at a bifurcation (see `NewtonOptions::branch_switching`).
    Auto { target: f64, increments: usize, max_steps: usize },
}

/// How a load-controlled Newton step computes its corrections.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Iteration {
    /// Full Newton–Raphson: the tangent factored at every iteration.
    Full,
    /// Modified Newton: the tangent refactored every `refactor_every`
    /// iterations (the step's first always). Cheaper per iteration on large
    /// models, linear convergence.
    Modified { refactor_every: usize },
    /// BFGS (Matthies & Strang 1979), in limited-memory form: the step's
    /// first factorization, corrected by the last `pairs` secant pairs.
    Bfgs { pairs: usize },
}

#[derive(Debug, Clone)]
pub struct NewtonOptions {
    /// Newton iterations per step before the step counts as failed.
    pub max_iterations: usize,
    /// The force criterion, separately on forces and on moments:
    /// ‖R_forces‖ ≤ tolerance·S_F and ‖R_moments‖ ≤ tolerance·S_M, each scale
    /// the largest of the applied load, the internal force and the reactions
    /// of that kind seen so far in the analysis; or the rounding floor.
    pub tolerance: f64,
    /// The displacement criterion, also required: the next correction is at
    /// most this fraction of the step's increment, separately on translations
    /// and on rotations.
    pub displacement_tolerance: f64,
    /// Halvings of a failed step before the analysis stops.
    pub max_cuts: usize,
    /// When a load-controlled step fails with plain Newton, retry it with
    /// Crisfield's line search before cutting it.
    pub line_search: bool,
    /// The first rung for load-controlled steps; a step that fails with
    /// `Modified` or `Bfgs` is retried with `Full` before anything else.
    pub iteration: Iteration,
    /// The energy criterion, also required when set: the work of the next
    /// correction |δu·R| is at most this fraction of the step's first, a
    /// measure with consistent units by construction.
    pub energy_tolerance: Option<f64>,
    /// Cut a step back as soon as its residual grows in two consecutive
    /// iterations, instead of spending the remaining iterations on it.
    pub divergence_check: bool,
    /// Newton iterations the whole analysis may spend, failed attempts
    /// included; the analysis stops with `IterationBudget` past it.
    pub max_total_iterations: Option<usize>,
    /// Start a load step from the previous one extrapolated (Δu·Δλ/Δλ_prev)
    /// instead of the committed state; a failure retries it without.
    pub extrapolate: bool,
    /// The length that turns moments into forces (M / L) where one kind has
    /// no scale of its own (a model that carries no moment), and in the norms
    /// that mix them. Default: the model's characteristic length (its
    /// bounding-box diagonal).
    pub rotation_length: Option<f64>,
    /// ψ of the spherical arc-length constraint ‖Δu‖² + ψ²·Δλ²·‖F‖² = Δs²
    /// (length per force); 0 is the cylindrical one.
    pub arc_psi: f64,
    /// At a bifurcation met by arc-length, continue on a secondary branch
    /// along a critical mode instead of the unstable primary path.
    pub branch_switching: bool,
    /// Which bifurcation mode to follow, in `CriticalPoint::modes` order
    /// (0: the most unstable).
    pub branch_mode: usize,
    /// Follow the mode's negative direction (modes are signed with their
    /// largest translation positive). At an asymmetric bifurcation the two
    /// directions lead to different branches.
    pub branch_reverse: bool,
}

impl Default for NewtonOptions {
    fn default() -> Self {
        NewtonOptions {
            max_iterations: 30,
            tolerance: 1e-9,
            displacement_tolerance: 1e-6,
            max_cuts: 10,
            line_search: true,
            iteration: Iteration::Full,
            energy_tolerance: Some(1e-12),
            divergence_check: true,
            max_total_iterations: None,
            extrapolate: true,
            rotation_length: None,
            arc_psi: 0.0,
            branch_switching: true,
            branch_mode: 0,
            branch_reverse: false,
        }
    }
}

/// Which strategy produced a step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    LoadControl,
    DisplacementControl,
    ArcLength,
}

/// One converged step.
#[derive(Debug, Clone)]
pub struct StepRecord {
    pub lambda: f64,
    pub u: Vec<f64>,
    pub iterations: usize,
    pub phase: Phase,
    /// Negative eigenvalues of the tangent at the converged state, when the
    /// factorization counts them (LDLᵀ): 0 on a stable path; it changes at a
    /// limit or bifurcation point.
    pub negative_eigenvalues: Option<usize>,
    /// Sign of det(K_T) at the converged state.
    pub tangent_det_sign: i8,
    pub method: FactorMethod,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    /// Newton did not converge, even after `max_cuts` halvings.
    NoConvergence,
    /// The tangent could not be factorized.
    SingularTangent,
    /// An element could not be evaluated (zero length, a material failure).
    ElementFailure,
    /// The path reached a point the strategy cannot pass: a limit or
    /// bifurcation point under load control, a snap-back under displacement
    /// control. Detected when the tangent's inertia
    /// (or determinant sign) changes during a step, when a converged step
    /// lands far from the tangent's prediction (Newton jumped to a distant
    /// branch), or when the stiffness in the direction of the load vanishes.
    LimitPoint,
    /// Arc-length ran `max_steps` steps without reaching the target.
    StepLimit,
    /// The analysis spent `max_total_iterations` Newton iterations.
    IterationBudget,
}

/// What a change of stability on the path is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CriticalKind {
    /// The critical modes have a component along the load: the load peaks
    /// (or, under arc-length, the path turns).
    LimitPoint,
    /// Critical modes orthogonal to the load: secondary branches cross the path.
    Bifurcation,
}

/// A critical point met by arc-length: located (the crossing step cut to
/// 1/256 of the one that found it), then classified from its critical modes.
#[derive(Debug, Clone)]
pub struct CriticalPoint {
    pub lambda: f64,
    pub kind: CriticalKind,
    /// How many eigenvalues crossed zero together: 2 for a doubly symmetric
    /// pair of modes. At a bifurcation coinciding with a limit point, the
    /// number of bifurcation modes (one fewer).
    pub multiplicity: usize,
    /// ‖Φᵀ·F‖ / ‖F‖ for the orthonormal critical subspace Φ: about zero at a
    /// bifurcation, of order one at a limit point.
    pub load_alignment: f64,
    /// The modes (all DOFs, rotations included), most unstable first: at a
    /// bifurcation the ones orthogonal to the load. Each is normalized on its
    /// translations, its largest translation positive.
    pub modes: Vec<Vec<f64>>,
    /// Their Rayleigh quotients φᵀ·K·φ / φᵀ·φ (negative just past the point).
    pub ritz_values: Vec<f64>,
    /// Whether the analysis left along one of the modes.
    pub switched: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Termination {
    Completed,
    Stopped { reason: StopReason, message: String },
}

/// The result. `u`, `lambda` and `reactions` are always the last converged
/// state (the initial one if no step converged), never an unconverged
/// iterate.
#[derive(Debug, Clone)]
pub struct Outcome {
    pub termination: Termination,
    pub lambda: f64,
    pub u: Vec<f64>,
    /// f_int − λ·F at the restrained DOFs, zero elsewhere.
    pub reactions: Vec<f64>,
    pub steps: Vec<StepRecord>,
    pub total_iterations: usize,
    /// Tangent factorizations performed (LDLᵀ, LU and bordered).
    pub factorizations: usize,
    /// Newton iterations performed, failed attempts included
    /// (`total_iterations` counts the converged steps' only).
    pub newton_iterations: usize,
    /// λ at each bifurcation where arc-length switched branch.
    pub branch_switches: Vec<f64>,
    /// Every critical point arc-length crossed, in order.
    pub critical_points: Vec<CriticalPoint>,
}

impl Outcome {
    pub fn completed(&self) -> bool {
        self.termination == Termination::Completed
    }
}

struct Failure {
    reason: StopReason,
    message: String,
}

fn fail(reason: StopReason, message: impl Into<String>) -> Failure {
    Failure { reason, message: message.into() }
}

/// Band of ‖Δu‖ / ‖tangent predictor‖ a load-controlled step must land in.
const JUMP_RATIO: f64 = 4.0;

/// Load control stops once the current stiffness parameter (Bergan: the
/// stiffness in the direction of the load over its initial value) falls
/// below this: the committed state is at a limit point.
const MIN_STIFFNESS_PARAMETER: f64 = 1e-3;

/// A step that keeps failing and growing back stops the analysis once it
/// is this fraction of its nominal size: progress would be imperceptible.
const MIN_STEP_FRACTION: f64 = 1e-8;

/// The critical subspace of a bifurcation is orthogonal to the load:
/// ‖Φᵀ·F‖ below this fraction of ‖F‖ (once the point is located). Above it,
/// the point is a limit point.
const BIFURCATION_ORTHOGONALITY: f64 = 1e-2;

/// A crossing of stability is located to this fraction of the arc that
/// found it before it is classified.
const LOCATE_DIVISIONS: f64 = 256.0;

/// An arc never grows past this multiple of the first one, or this fraction
/// of the model's characteristic length if that is larger: on a nearly
/// linear branch every step converges at once and would double it forever,
/// and a first arc taken from a stiff pre-critical path (a column's axial
/// shortening) can be far below the scale of what follows.
const MAX_ARC_GROWTH: f64 = 32.0;
const MAX_ARC_FRACTION: f64 = 0.1;

/// The least arc of the step that leaves a bifurcation, as a fraction of the
/// model's characteristic length.
const BRANCH_STEP: f64 = 1e-3;

/// Step control by iteration count: two steps in a row that converge in at
/// most `EASY_ITERATIONS` grow the next one by `GROWTH`; a step that needs
/// more than `HARD_ITERATIONS` shrinks it by `SHRINK`; a failed one is cut by
/// `CUT`. Steps never cross the strategy's nominal points (λ or the control
/// displacement at each of its increments), so those are always results.
const EASY_ITERATIONS: usize = 4;
const HARD_ITERATIONS: usize = 8;
const GROWTH: f64 = 1.5;
const SHRINK: f64 = 0.75;
const CUT: f64 = 0.25;
const MIN_SHRUNK: f64 = 16.0;

/// Arc-length aims each step at this many iterations, scaling the arc by
/// √(target / iterations) within [½, 2].
const ARC_TARGET_ITERATIONS: f64 = 5.0;

/// Modified Gram–Schmidt; `None` if a vector collapses.
fn orthonormalize(v: &mut [Vec<f64>]) -> Option<()> {
    for k in 0..v.len() {
        for j in 0..k {
            let (head, tail) = v.split_at_mut(k);
            let c = dot(&head[j], &tail[0]);
            for (x, y) in tail[0].iter_mut().zip(&head[j]) {
                *x -= c * y;
            }
        }
        let nk = norm(&v[k]);
        if !nk.is_finite() || nk <= 1e-300 {
            return None;
        }
        v[k].iter_mut().for_each(|x| *x /= nk);
    }
    Some(())
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn norm(v: &[f64]) -> f64 {
    dot(v, v).sqrt()
}

/// A state the driver evaluated: internal force (all DOFs), residual on the
/// free DOFs, and whether it meets the convergence test.
struct Eval {
    f_int: Vec<f64>,
    r: Vec<f64>,
    /// The force criterion holds (or the residual is at the rounding floor).
    ok: bool,
    /// The residual is at the rounding floor: no criterion can ask for more.
    at_floor: bool,
    /// ‖R‖ with moments as M / L: the measure the divergence check follows.
    norm: f64,
}

/// What a converged step hands back.
struct Converged {
    lambda: f64,
    iterations: usize,
    f_int: Vec<f64>,
    negative: Option<usize>,
    det_sign: i8,
    method: FactorMethod,
    /// Fᵀ·K⁻¹·F at the converged state.
    flexibility: f64,
    /// The step's increment on the free DOFs.
    du: Vec<f64>,
}

struct Ctx<'a, M: NonlinearModel> {
    model: &'a mut M,
    sys: TangentSystem,
    f_free: Vec<f64>,
    /// 1 on free translational DOFs, 0 on rotations: the arc-length metric.
    weight: Vec<f64>,
    /// Force-norm weights on the free DOFs: 1 on translations, 1/L on
    /// rotations (the norm the rounding floor and the divergence check use).
    fscale_free: Vec<f64>,
    /// The model's characteristic length.
    length: f64,
    /// Whether each DOF (all of them) is a rotation.
    rotation: Vec<bool>,
    /// The largest force and moment norms seen: the force criterion's scales.
    seen_force: f64,
    seen_moment: f64,
    /// Newton iterations spent, failed attempts included.
    iterations_used: usize,
    opts: NewtonOptions,
}

fn scaled_norm(v: &[f64], scale: &[f64]) -> f64 {
    v.iter().zip(scale).map(|(x, s)| (x * s) * (x * s)).sum::<f64>().sqrt()
}

impl<M: NonlinearModel> Ctx<'_, M> {
    fn move_by(&mut self, du: &[f64], scale: f64) {
        let mut v = vec![0.0; self.model.n_dofs()];
        for (&d, &x) in self.sys.free.iter().zip(du) {
            v[d] = scale * x;
        }
        self.model.increment(&v);
    }

    fn wdot(&self, a: &[f64], b: &[f64]) -> f64 {
        a.iter().zip(b).zip(&self.weight).map(|((x, y), w)| w * x * y).sum()
    }

    /// Assembles at the trial configuration.
    ///
    /// Converged when ‖R‖ ≤ tol·max(|λ|·‖F‖, ‖f_int‖), or when ‖R‖ is down to
    /// what rounding allows: f_int is a sum of terms of order ‖K‖·‖u‖, so it
    /// is not known better than about ε·‖K‖·‖u‖. A stiff axial term next to a
    /// flexible bending one (EA·L²/EI of 10⁸ and more) puts that floor above
    /// a relative tolerance, and Newton would iterate on noise.
    fn evaluate(&mut self, lambda: f64) -> Result<Eval, Failure> {
        let mut f_int = vec![0.0; self.model.n_dofs()];
        self.sys.clear();
        let sys = &mut self.sys;
        self.model
            .assemble(&mut f_int, &mut |e, _, ke| sys.add(e, ke))
            .map_err(|m| fail(StopReason::ElementFailure, m))?;
        if f_int.iter().any(|x| !x.is_finite()) || !self.sys.is_finite() {
            return Err(fail(StopReason::ElementFailure, "non-finite internal force or tangent"));
        }
        let r: Vec<f64> = self.sys.free.iter().zip(&self.f_free).map(|(&d, &f)| lambda * f - f_int[d]).collect();
        // Forces and moments each against their own scale: the largest
        // applied load, internal force or reaction of that kind seen so far.
        let (mut r_f, mut r_m, mut a_f, mut a_m) = (0.0, 0.0, 0.0, 0.0);
        for ((&d, &ri), &fi) in self.sys.free.iter().zip(&r).zip(&self.f_free) {
            let applied = lambda * fi;
            if self.rotation[d] {
                r_m += ri * ri;
                a_m += applied * applied;
            } else {
                r_f += ri * ri;
                a_f += applied * applied;
            }
        }
        let (mut i_f, mut i_m) = (0.0, 0.0);
        for (d, &fi) in f_int.iter().enumerate() {
            if self.rotation[d] { i_m += fi * fi } else { i_f += fi * fi }
        }
        self.seen_force = self.seen_force.max(a_f.sqrt()).max(i_f.sqrt());
        self.seen_moment = self.seen_moment.max(a_m.sqrt()).max(i_m.sqrt());
        let s_f = if self.seen_force > 0.0 { self.seen_force } else { self.seen_moment / self.length };
        let s_m = if self.seen_moment > 0.0 { self.seen_moment } else { self.seen_force * self.length };
        let force_ok = r_f.sqrt() <= self.opts.tolerance * s_f && r_m.sqrt() <= self.opts.tolerance * s_m;
        let u_norm = self.model.displacements().iter().fold(0.0f64, |a, x| a.max(x.abs()));
        let k_floor = 16.0 * f64::EPSILON * self.sys.norm_inf() * u_norm * (self.sys.free.len() as f64).sqrt();
        let rn = scaled_norm(&r, &self.fscale_free);
        let floor = if rn > 0.0 { k_floor * rn / norm(&r) } else { k_floor };
        let at_floor = rn <= floor;
        Ok(Eval { f_int, r, ok: force_ok || at_floor, at_floor, norm: rn })
    }

    fn factor(&self) -> Result<Factor, Failure> {
        self.sys.factor().map_err(|m| fail(StopReason::SingularTangent, m))
    }

    /// Counts one Newton iteration against the analysis' budget.
    fn spend_iteration(&mut self) -> Result<(), Failure> {
        if let Some(budget) = self.opts.max_total_iterations {
            if self.iterations_used >= budget {
                return Err(fail(StopReason::IterationBudget, format!("the analysis spent its {budget} Newton iterations")));
            }
        }
        self.iterations_used += 1;
        Ok(())
    }

    /// The displacement criterion: the next correction `du` is at most
    /// `displacement_tolerance` of the step so far (`step`), translations and
    /// rotations each on their own; or below what the displacements can
    /// resolve (64·ε of their size, or of the model's): a step cut very short
    /// has corrections at the round-off of the total displacement, not of the
    /// step.
    fn correction_small(&self, du: &[f64], step: &[f64]) -> bool {
        let u = self.model.displacements();
        let (mut dt, mut dr, mut st, mut sr, mut ut, mut ur) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        for (((d, s), w), &g) in du.iter().zip(step).zip(&self.weight).zip(&self.sys.free) {
            if *w > 0.0 {
                dt += d * d;
                st += s * s;
                ut += u[g] * u[g];
            } else {
                dr += d * d;
                sr += s * s;
                ur += u[g] * u[g];
            }
        }
        let tol = self.opts.displacement_tolerance;
        let resolution = 64.0 * f64::EPSILON;
        let bound_t = (tol * st.sqrt()).max(resolution * ut.sqrt().max(self.length));
        let bound_r = (tol * sr.sqrt()).max(resolution * ur.sqrt().max(1.0));
        dt.sqrt() <= bound_t && dr.sqrt() <= bound_r
    }

    /// The energy criterion on the next correction, against the step's first
    /// (`None` on the first iteration: nothing to compare with yet).
    fn energy_small(&self, du: &[f64], ev: &Eval, first: Option<f64>) -> bool {
        match (self.opts.energy_tolerance, first) {
            (None, _) => true,
            _ if ev.at_floor => true,
            (Some(_), None) => true,
            (Some(te), Some(e0)) => dot(du, &ev.r).abs() <= te * e0,
        }
    }

    /// The step is diverging: its residual grew in two consecutive
    /// iterations and is now above where the step started. (Growth alone is
    /// not enough: near convergence, and when fibers or layers change state,
    /// the residual wobbles at a level far below its start.)
    fn diverging(&self, norms: &[f64]) -> bool {
        self.opts.divergence_check && norms.len() >= 3 && {
            let k = norms.len();
            norms[k - 1] > norms[k - 2] && norms[k - 2] > norms[k - 3] && norms[k - 1] > norms[0]
        }
    }

    fn solve(&self, f: &Factor, b: &[f64]) -> Result<Vec<f64>, Failure> {
        self.sys.solve(f, b).map_err(|m| fail(StopReason::SingularTangent, m))
    }

    /// A solve with a factorization of an earlier tangent (modified Newton,
    /// BFGS): no refinement against the current matrix, which it is not.
    fn solve_raw(&self, f: &Factor, b: &[f64]) -> Result<Vec<f64>, Failure> {
        self.sys.solve_raw(f, b).map_err(|m| fail(StopReason::SingularTangent, m))
    }

    /// The limited-memory BFGS direction H·r: two-loop recursion over the
    /// secant pairs (s, y, 1/yᵀs), with H₀ the factored tangent.
    fn bfgs_direction(&self, f: &Factor, pairs: &[(Vec<f64>, Vec<f64>, f64)], r: &[f64]) -> Result<Vec<f64>, Failure> {
        let mut q = r.to_vec();
        let mut alphas = vec![0.0; pairs.len()];
        for (k, (s, y, rho)) in pairs.iter().enumerate().rev() {
            alphas[k] = rho * dot(s, &q);
            for (qi, yi) in q.iter_mut().zip(y) {
                *qi -= alphas[k] * yi;
            }
        }
        let mut z = self.solve_raw(f, &q)?;
        for (k, (s, y, rho)) in pairs.iter().enumerate() {
            let beta = rho * dot(y, &z);
            for (zi, si) in z.iter_mut().zip(s) {
                *zi += (alphas[k] - beta) * si;
            }
        }
        Ok(z)
    }

    /// Whether a load-controlled step's tangent left the committed state's
    /// stability: another inertia (or determinant sign), or a symmetric
    /// tangent too close to singular for LDLᵀ (the step is at a critical
    /// point, where the inertia is about to change).
    fn stability_changed(f: &Factor, negative_c: Option<usize>, sign_c: i8) -> bool {
        if f.near_singular() && negative_c.is_some() {
            return true;
        }
        match (f.negative_eigenvalues(), negative_c) {
            (Some(a), Some(b)) => a != b,
            _ => f.det_sign() != sign_c,
        }
    }

    /// The critical point at the committed state, where `m` eigenvalues
    /// have just crossed zero.
    ///
    /// The critical subspace: block inverse iteration (m + 1 vectors, shift 0)
    /// on the tangent's factorization, then Rayleigh–Ritz on the symmetric
    /// part; the m Ritz vectors nearest zero. Its alignment with the load
    /// classifies the point. A subspace with a component along the load and
    /// m ≥ 2 is a bifurcation at a limit point: its part orthogonal to the
    /// load (m − 1 modes) is the bifurcation's. Returns the point (modes over
    /// all DOFs) and the modes over the free DOFs, in the same order.
    fn critical_point(&mut self, lambda: f64, m: usize) -> Result<(CriticalPoint, Vec<Vec<f64>>), Failure> {
        self.evaluate(lambda)?;
        let fac = self.factor()?;
        let n = self.sys.free.len();
        let p = (m + 1).min(n);
        let lost = || fail(StopReason::SingularTangent, "inverse iteration lost the critical subspace");
        let mut v: Vec<Vec<f64>> = (0..p)
            .map(|c| (0..n).map(|i| (((i as u64 + 1) * (2_654_435_761 + 97 * c as u64)) % 1000) as f64 / 1000.0 - 0.5).collect())
            .collect();
        orthonormalize(&mut v).ok_or_else(lost)?;
        for _ in 0..50 {
            for col in v.iter_mut() {
                *col = self.solve_raw(&fac, col)?;
            }
            orthonormalize(&mut v).ok_or_else(lost)?;
        }
        let kv: Vec<Vec<f64>> = v.iter().map(|x| self.sys.mat_vec(x)).collect();
        let mut a = vec![0.0; p * p];
        for r in 0..p {
            for c in 0..p {
                a[r * p + c] = 0.5 * (dot(&v[r], &kv[c]) + dot(&v[c], &kv[r]));
            }
        }
        let eig = jacobi_eigen(&a, p, 200);
        let mut ritz: Vec<(f64, Vec<f64>)> = (0..p)
            .map(|c| {
                let mut x = vec![0.0; n];
                for (r, vr) in v.iter().enumerate() {
                    let y = eig.vectors[r * p + c];
                    for (xi, vi) in x.iter_mut().zip(vr) {
                        *xi += y * vi;
                    }
                }
                (eig.values[c], x)
            })
            .collect();
        ritz.sort_by(|a, b| a.0.abs().total_cmp(&b.0.abs()));
        ritz.truncate(m);

        let f_norm = norm(&self.f_free).max(f64::MIN_POSITIVE);
        let along: Vec<f64> = ritz.iter().map(|(_, x)| dot(x, &self.f_free) / f_norm).collect();
        let alignment = along.iter().map(|c| c * c).sum::<f64>().sqrt();
        let (kind, mut modes): (CriticalKind, Vec<Vec<f64>>) = if alignment <= BIFURCATION_ORTHOGONALITY {
            (CriticalKind::Bifurcation, ritz.iter().map(|(_, x)| x.clone()).collect())
        } else if m >= 2 {
            // u: the unit vector of the subspace nearest the load; its
            // complement in the subspace is the bifurcation's.
            let mut u = vec![0.0; n];
            for ((_, x), c) in ritz.iter().zip(&along) {
                for (ui, xi) in u.iter_mut().zip(x) {
                    *ui += c / alignment * xi;
                }
            }
            let mut rest: Vec<Vec<f64>> = ritz
                .iter()
                .map(|(_, x)| {
                    let k = dot(x, &u);
                    x.iter().zip(&u).map(|(xi, ui)| xi - k * ui).collect()
                })
                .collect();
            rest.sort_by(|a, b| norm(b).total_cmp(&norm(a)));
            rest.truncate(m - 1);
            orthonormalize(&mut rest).ok_or_else(lost)?;
            (CriticalKind::Bifurcation, rest)
        } else {
            (CriticalKind::LimitPoint, ritz.iter().map(|(_, x)| x.clone()).collect())
        };
        // Most unstable first, each signed and scaled on its translations.
        let quotient = |x: &Vec<f64>| dot(x, &self.sys.mat_vec(x)) / dot(x, x);
        let mut keyed: Vec<(f64, Vec<f64>)> = modes.drain(..).map(|x| (quotient(&x), x)).collect();
        keyed.sort_by(|a, b| a.0.total_cmp(&b.0));
        let quotients: Vec<f64> = keyed.iter().map(|(q, _)| *q).collect();
        let mut modes: Vec<Vec<f64>> = keyed.into_iter().map(|(_, x)| x).collect();
        for x in modes.iter_mut() {
            let t = self.wdot(x, x).sqrt();
            let scale = if t > 0.0 { t } else { norm(x) };
            let lead = (0..n)
                .filter(|&i| t == 0.0 || self.weight[i] > 0.0)
                .max_by(|&a, &b| x[a].abs().total_cmp(&x[b].abs()))
                .unwrap_or(0);
            let sign = if x[lead] < 0.0 { -1.0 } else { 1.0 };
            x.iter_mut().for_each(|v| *v *= sign / scale);
        }
        let full = modes.iter().map(|x| self.sys.scatter(x, self.model.n_dofs())).collect();
        let multiplicity = modes.len();
        Ok((
            CriticalPoint { lambda, kind, multiplicity, load_alignment: alignment, modes: full, ritz_values: quotients, switched: false },
            modes,
        ))
    }

    /// A converged state, described by the factorization of its tangent;
    /// `None` when that tangent is singular (a mechanism, which only the
    /// bordered system of displacement control solves).
    fn converged(&self, lambda: f64, iterations: usize, ev: Eval, fac: Option<&Factor>, du: Vec<f64>) -> Result<Converged, Failure> {
        let Some(fac) = fac else {
            return Ok(Converged {
                lambda,
                iterations,
                f_int: ev.f_int,
                negative: None,
                det_sign: 0,
                method: FactorMethod::Lu,
                flexibility: f64::INFINITY,
                du,
            });
        };
        let flexibility = dot(&self.f_free, &self.solve(fac, &self.f_free)?);
        // A tangent LU had to factor because it is slightly nonsymmetric (the
        // 3D co-rotational one, whose asymmetry vanishes at equilibrium under
        // conservative loads): its stability from the symmetric part.
        let negative = fac.negative_eigenvalues().or_else(|| self.sys.near_symmetric_inertia(1e-6));
        Ok(Converged {
            lambda,
            iterations,
            f_int: ev.f_int,
            negative,
            det_sign: fac.det_sign(),
            method: fac.method(),
            flexibility,
            du,
        })
    }

    /// Crisfield's line search along `du` from the current state (whose
    /// residual is `r0`): accept the full step when |du·R(α)| ≤ 0.8·|du·R(0)|,
    /// otherwise interpolate α on du·R (up to five trials) and keep the best.
    /// Leaves the model at the returned α, with its evaluation.
    fn line_search(&mut self, du: &[f64], r0: &[f64], lambda: f64) -> Result<(f64, Eval), Failure> {
        let s0 = dot(du, r0);
        let mut alpha = 1.0;
        self.move_by(du, 1.0);
        let mut ev = self.evaluate(lambda);
        if s0 <= 0.0 {
            return ev.map(|e| (alpha, e));
        }
        let mut best: Option<(f64, f64)> = None; // (|s|, α)
        let (mut a_prev, mut s_prev) = (0.0, s0);
        for _ in 0..5 {
            let s = match &ev {
                Ok(e) if e.ok => return ev.map(|e| (alpha, e)),
                Ok(e) => dot(du, &e.r),
                Err(_) => f64::INFINITY,
            };
            if s.is_finite() && s.abs() <= 0.8 * s0 {
                return ev.map(|e| (alpha, e));
            }
            if s.is_finite() && best.is_none_or(|(b, _)| s.abs() < b) {
                best = Some((s.abs(), alpha));
            }
            let next = if s.is_finite() && s != s_prev {
                (alpha - s * (alpha - a_prev) / (s - s_prev)).clamp(0.1 * alpha, 1.5)
            } else {
                0.5 * alpha
            };
            a_prev = alpha;
            if s.is_finite() {
                s_prev = s;
            }
            self.move_by(du, next - alpha);
            alpha = next;
            ev = self.evaluate(lambda);
        }
        if let Ok(e) = &ev {
            let s = dot(du, &e.r).abs();
            if best.is_none_or(|(b, _)| s <= b) {
                return ev.map(|e| (alpha, e));
            }
        }
        // Back to the best trial (the full step if none evaluated).
        let back = best.map_or(1.0, |(_, a)| a);
        self.move_by(du, back - alpha);
        Ok((back, self.evaluate(lambda)?))
    }

    /// The checks a converged load step must pass, and its record.
    #[allow(clippy::too_many_arguments)]
    fn finish_load(
        &self,
        lambda: f64,
        iterations: usize,
        cur: Eval,
        step: Vec<f64>,
        predictor: f64,
        current: Option<Factor>,
        negative_c: Option<usize>,
        sign_c: i8,
    ) -> Result<Converged, Failure> {
        // A step that lands far from where the committed tangent sends it has
        // left that branch: Newton jumped over a limit point onto a distant
        // stable one, which neither end's tangent shows. On a continuous path
        // the ratio tends to 1 as the step is cut, so a cut cures a false
        // alarm; a jump stays one at any step size.
        let ratio = if predictor > 0.0 { norm(&step) / predictor } else { 1.0 };
        if !(JUMP_RATIO.recip()..=JUMP_RATIO).contains(&ratio) {
            return Err(fail(
                StopReason::LimitPoint,
                format!("the step to λ = {lambda} left the branch the tangent predicts (‖Δu‖ / ‖predictor‖ = {ratio:.3}): a limit point, which load control cannot pass"),
            ));
        }
        let fac = match current {
            Some(f) => f,
            None => {
                let f = self.factor()?;
                if Self::stability_changed(&f, negative_c, sign_c) {
                    return Err(fail(
                        StopReason::LimitPoint,
                        format!("the tangent's stability changed near λ = {lambda}: a limit or bifurcation point, which load control cannot pass"),
                    ));
                }
                f
            }
        };
        self.converged(lambda, iterations, cur, Some(&fac), step)
    }

    /// One load-controlled step from the committed state.
    #[allow(clippy::too_many_arguments)]
    fn load_step(
        &mut self,
        lambda_c: f64,
        d_lambda: f64,
        negative_c: Option<usize>,
        sign_c: i8,
        line_search: bool,
        iteration: Iteration,
        extrapolated: Option<&[f64]>,
    ) -> Result<Converged, Failure> {
        let lambda = lambda_c + d_lambda;
        let mut step = vec![0.0; self.sys.free.len()];
        let mut predictor = 0.0;
        if let Some(p) = extrapolated {
            self.move_by(p, 1.0);
            step.copy_from_slice(p);
            predictor = norm(p);
        }
        let mut iterations = 0;
        let mut cur = self.evaluate(lambda)?;
        let mut norms = vec![cur.norm];
        let mut factor: Option<Factor> = None;
        let mut since_refactor = 0;
        let mut pairs: Vec<(Vec<f64>, Vec<f64>, f64)> = Vec::new();
        let mut energy0: Option<f64> = None;
        loop {
            self.spend_iteration()?;
            let refactor = match iteration {
                Iteration::Full => true,
                Iteration::Modified { refactor_every } => factor.is_none() || since_refactor >= refactor_every.max(1),
                Iteration::Bfgs { .. } => factor.is_none(),
            };
            if refactor {
                let f = self.factor()?;
                if Self::stability_changed(&f, negative_c, sign_c) {
                    return Err(fail(
                        StopReason::LimitPoint,
                        format!("the tangent's stability changed near λ = {lambda}: a limit or bifurcation point, which load control cannot pass"),
                    ));
                }
                factor = Some(f);
                since_refactor = 0;
            }
            // The factorization is of the current tangent only under full Newton.
            let current_is_factored = refactor && since_refactor == 0;
            let f = factor.as_ref().expect("factored on the first iteration");
            let du = match iteration {
                Iteration::Full => self.solve(f, &cur.r)?,
                Iteration::Modified { .. } => self.solve_raw(f, &cur.r)?,
                Iteration::Bfgs { .. } => self.bfgs_direction(f, &pairs, &cur.r)?,
            };
            // Converged when the force criterion holds and the correction
            // Newton would add next is negligible, in size and in work.
            if cur.ok && self.correction_small(&du, &step) && self.energy_small(&du, &cur, energy0) {
                let current = if current_is_factored { factor.take() } else { None };
                return self.finish_load(lambda, iterations, cur, step, predictor, current, negative_c, sign_c);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("no convergence in {iterations} iterations at λ = {lambda}")));
            }
            if self.diverging(&norms) {
                return Err(fail(StopReason::NoConvergence, format!("the residual grew in two consecutive iterations at λ = {lambda}")));
            }
            if energy0.is_none() {
                energy0 = Some(dot(&du, &cur.r).abs());
            }
            if predictor == 0.0 {
                predictor = norm(&du);
            }
            let (alpha, next) = if line_search {
                self.line_search(&du, &cur.r, lambda)?
            } else {
                self.move_by(&du, 1.0);
                (1.0, self.evaluate(lambda)?)
            };
            if let Iteration::Bfgs { pairs: m } = iteration {
                let s: Vec<f64> = du.iter().map(|d| alpha * d).collect();
                let y: Vec<f64> = cur.r.iter().zip(&next.r).map(|(a, b)| a - b).collect();
                let sy = dot(&s, &y);
                if sy > 1e-14 * norm(&s) * norm(&y) {
                    pairs.push((s, y, 1.0 / sy));
                    if pairs.len() > m.max(1) {
                        pairs.remove(0);
                    }
                }
            }
            for (s, d) in step.iter_mut().zip(&du) {
                *s += alpha * d;
            }
            cur = next;
            norms.push(cur.norm);
            iterations += 1;
            since_refactor += 1;
        }
    }

    /// (δu, δλ) for displacement control: the control DOF moves by `dd`.
    /// From K's factorization when there is one (u_R + δλ·u_F with
    /// δu_c = dd), from the bordered system when K is singular.
    fn displacement_correction(&self, fac: Option<&Factor>, bordered: &Bordered, c: usize, r: &[f64], dd: f64) -> Result<(Vec<f64>, f64), Failure> {
        if let Some(fac) = fac {
            let ur = self.solve(fac, r)?;
            let uf = self.solve(fac, &self.f_free)?;
            if uf[c] != 0.0 {
                let dl = (dd - ur[c]) / uf[c];
                return Ok((ur.iter().zip(&uf).map(|(a, b)| a + dl * b).collect(), dl));
            }
        }
        self.sys.solve_bordered(bordered, r, dd).map_err(|m| fail(StopReason::SingularTangent, m))
    }

    /// One displacement-controlled step: the control DOF moves by `delta`.
    fn displacement_step(&mut self, bordered: &Bordered, lambda_c: f64, c: usize, delta: f64) -> Result<Converged, Failure> {
        let ev = self.evaluate(lambda_c)?;
        let fac = self.sys.factor().ok();
        let (du, dl) = self.displacement_correction(fac.as_ref(), bordered, c, &ev.r, delta)?;
        self.move_by(&du, 1.0);
        let predictor = norm(&du);
        let mut step = du;
        let mut lambda = lambda_c + dl;
        let mut iterations = 1;
        let mut norms = Vec::new();
        let mut energy0: Option<f64> = None;
        loop {
            self.spend_iteration()?;
            let ev = self.evaluate(lambda)?;
            norms.push(ev.norm);
            let fac = self.sys.factor().ok();
            let (du, dl) = self.displacement_correction(fac.as_ref(), bordered, c, &ev.r, 0.0)?;
            if ev.ok && self.correction_small(&du, &step) && self.energy_small(&du, &ev, energy0) {
                // As under load control: a converged step far from the
                // tangent's prediction jumped to another branch, here past a
                // snap-back (a limit point in the control displacement).
                let ratio = if predictor > 0.0 { norm(&step) / predictor } else { 1.0 };
                if !(JUMP_RATIO.recip()..=JUMP_RATIO).contains(&ratio) {
                    return Err(fail(
                        StopReason::LimitPoint,
                        format!("the step to λ = {lambda} left the branch the tangent predicts (‖Δu‖ / ‖predictor‖ = {ratio:.3}): a snap-back, which displacement control cannot pass"),
                    ));
                }
                return self.converged(lambda, iterations, ev, fac.as_ref(), step);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("no convergence in {iterations} iterations at λ = {lambda}")));
            }
            if self.diverging(&norms) {
                return Err(fail(StopReason::NoConvergence, format!("the residual grew in two consecutive iterations at λ = {lambda}")));
            }
            if energy0.is_none() {
                energy0 = Some(dot(&du, &ev.r).abs());
            }
            self.move_by(&du, 1.0);
            for (s, d) in step.iter_mut().zip(&du) {
                *s += d;
            }
            lambda += dl;
            iterations += 1;
        }
    }

    /// One arc-length step of length `ds` from the committed state, oriented
    /// along the previous step's increment `prev` (or toward `sign`); or, to
    /// switch branch, starting along `predictor` at constant load.
    fn arc_step(&mut self, lambda_c: f64, ds: f64, prev: Option<&[f64]>, sign: f64, predictor: Option<&[f64]>) -> Result<Converged, Failure> {
        self.evaluate(lambda_c)?;
        let uf = self.solve(&self.factor()?, &self.f_free)?;
        // ψ²·‖F‖² on the translations: the spherical constraint's load term.
        let f2 = self.opts.arc_psi * self.opts.arc_psi * self.wdot(&self.f_free, &self.f_free);
        let (mut step, mut dls) = match predictor {
            Some(phi) => {
                let pn = self.wdot(phi, phi).sqrt();
                if pn == 0.0 {
                    return Err(fail(StopReason::SingularTangent, "the branch direction moves no translation"));
                }
                (phi.iter().map(|p| ds * p / pn).collect::<Vec<f64>>(), 0.0)
            }
            None => {
                let denom = (self.wdot(&uf, &uf) + f2).sqrt();
                if denom == 0.0 {
                    return Err(fail(StopReason::SingularTangent, "the load moves no translation"));
                }
                let dir = match prev {
                    Some(p) => {
                        let d = self.wdot(p, &uf);
                        if d == 0.0 { sign } else { d.signum() }
                    }
                    None => sign,
                };
                let d_lambda = dir * ds / denom;
                (uf.iter().map(|u| d_lambda * u).collect(), d_lambda)
            }
        };
        self.move_by(&step, 1.0);
        let mut lambda = lambda_c + dls;
        let mut iterations = 1;
        let mut norms = Vec::new();
        let mut energy0: Option<f64> = None;
        loop {
            self.spend_iteration()?;
            let ev = self.evaluate(lambda)?;
            norms.push(ev.norm);
            let fac = self.factor()?;
            let ur = self.solve(&fac, &ev.r)?;
            let uf = self.solve(&fac, &self.f_free)?;
            // ‖Δu + u_R + δλ·u_F‖² + ψ²·(Δλ + δλ)²·‖F‖² = ds² over the translations.
            let w: Vec<f64> = step.iter().zip(&ur).map(|(s, r)| s + r).collect();
            let a = self.wdot(&uf, &uf) + f2;
            let b = 2.0 * (self.wdot(&w, &uf) + f2 * dls);
            let c = self.wdot(&w, &w) + f2 * dls * dls - ds * ds;
            let disc = b * b - 4.0 * a * c;
            if a == 0.0 || disc < 0.0 {
                if ev.ok && self.correction_small(&ur, &step) {
                    return self.converged(lambda, iterations, ev, Some(&fac), step);
                }
                return Err(fail(StopReason::NoConvergence, format!("arc-length: the constraint has no real root at λ = {lambda}")));
            }
            let sq = disc.sqrt();
            // Of the two roots, the one whose increment turns least from the step so far.
            let along = |dl: f64| -> f64 {
                let cand: Vec<f64> = w.iter().zip(&uf).map(|(x, f)| x + dl * f).collect();
                self.wdot(&cand, &step) + f2 * (dls + dl) * dls
            };
            let (r1, r2) = ((-b + sq) / (2.0 * a), (-b - sq) / (2.0 * a));
            let dl = if along(r1) >= along(r2) { r1 } else { r2 };
            let du: Vec<f64> = ur.iter().zip(&uf).map(|(r, f)| r + dl * f).collect();
            if ev.ok && self.correction_small(&du, &step) && self.energy_small(&du, &ev, energy0) {
                return self.converged(lambda, iterations, ev, Some(&fac), step);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("arc-length: no convergence in {iterations} iterations at λ = {lambda}")));
            }
            if self.diverging(&norms) {
                return Err(fail(StopReason::NoConvergence, format!("arc-length: the residual grew in two consecutive iterations at λ = {lambda}")));
            }
            if energy0.is_none() {
                energy0 = Some(dot(&du, &ev.r).abs());
            }
            self.move_by(&du, 1.0);
            for (s, d) in step.iter_mut().zip(&du) {
                *s += d;
            }
            lambda += dl;
            dls += dl;
            iterations += 1;
        }
    }
}

/// The analysis state the strategy loops share.
struct Run {
    lambda: f64,
    f_int: Vec<f64>,
    negative: Option<usize>,
    det_sign: i8,
    flexibility0: f64,
    stiffness_parameter: f64,
    steps: Vec<StepRecord>,
    total_iterations: usize,
    last_du: Option<Vec<f64>>,
    /// The last step's increment and Δλ, when it was a load step: what the
    /// next one extrapolates.
    last_load: Option<(Vec<f64>, f64)>,
    branch_switches: Vec<f64>,
    critical_points: Vec<CriticalPoint>,
}

impl Run {
    fn accept<M: NonlinearModel>(&mut self, ctx: &mut Ctx<'_, M>, conv: Converged, phase: Phase) {
        ctx.model.commit();
        self.total_iterations += conv.iterations;
        self.last_load = (phase == Phase::LoadControl).then(|| (conv.du.clone(), conv.lambda - self.lambda));
        self.lambda = conv.lambda;
        self.f_int = conv.f_int;
        self.negative = conv.negative;
        self.det_sign = conv.det_sign;
        // Bergan's current stiffness parameter: (Fᵀ·K₀⁻¹·F) / (Fᵀ·K⁻¹·F).
        self.stiffness_parameter = if conv.flexibility != 0.0 { self.flexibility0 / conv.flexibility } else { f64::INFINITY };
        self.steps.push(StepRecord {
            lambda: conv.lambda,
            u: ctx.model.displacements(),
            iterations: conv.iterations,
            phase,
            negative_eigenvalues: conv.negative,
            tangent_det_sign: conv.det_sign,
            method: conv.method,
        });
        self.last_du = Some(conv.du);
    }
}

/// The next step: `step` at most, never past the next nominal point
/// (`start` + k·`full`) nor `target`.
fn next_step(start: f64, full: f64, progress: f64, target: f64, step: f64) -> f64 {
    let k = ((progress - start) / full + 1e-9).floor() + 1.0;
    let mut milestone = start + k * full;
    if (milestone - progress).abs() < 1e-12 * full.abs() {
        milestone += full;
    }
    if (milestone - target) * full.signum() > 0.0 {
        milestone = target;
    }
    let room = milestone - progress;
    if step.abs() > room.abs() { room } else { step.abs() * full.signum() }
}

/// Step control by the iteration count of the step that just converged:
/// returns the next step size (by magnitude, at most `full`) and whether this
/// one was easy. A converged step never shrinks the next below
/// `full / MIN_SHRUNK` (only a failure cuts further): steps shrinking
/// geometrically on success would add up to less than the distance left, and
/// the analysis would never get there.
fn grow(step: f64, full: f64, iterations: usize, last_easy: bool) -> (f64, bool) {
    let easy = iterations <= EASY_ITERATIONS;
    let next = if easy && last_easy {
        step * GROWTH
    } else if iterations > HARD_ITERATIONS {
        (step * SHRINK).max(step.min(full.abs() / MIN_SHRUNK))
    } else {
        step
    };
    (next.abs().min(full.abs()), easy)
}

/// Load control from the current state toward `target`.
fn run_load<M: NonlinearModel>(ctx: &mut Ctx<'_, M>, run: &mut Run, target: f64, increments: usize) -> Termination {
    let start = run.lambda;
    let full = (target - start) / increments as f64;
    let mut step = full.abs();
    let mut cuts = 0;
    let mut last_easy = false;
    while (target - run.lambda).abs() > 1e-12 * target.abs().max(full.abs()) {
        if run.stiffness_parameter < MIN_STIFFNESS_PARAMETER {
            return Termination::Stopped {
                reason: StopReason::LimitPoint,
                message: format!(
                    "at λ = {} the stiffness in the direction of the load is {:.2e} of its initial value: a limit point, which load control cannot pass",
                    run.lambda, run.stiffness_parameter
                ),
            };
        }
        let this = next_step(start, full, run.lambda, target, step);
        // The escalation ladder, cheapest first: the previous step
        // extrapolated, with the configured iteration; from the committed
        // state; full Newton; full Newton with line search; then a cut. An
        // extrapolated attempt falls through on any failure (its guess may
        // have crossed something the committed state would not); the others
        // only on a failure to converge.
        let extrapolated: Option<Vec<f64>> = match (&run.last_load, ctx.opts.extrapolate) {
            (Some((du, dl)), true) if *dl != 0.0 => Some(du.iter().map(|x| x * this / dl).collect()),
            _ => None,
        };
        let first = ctx.opts.iteration;
        let mut rungs: Vec<(bool, Iteration, bool)> = Vec::new();
        if extrapolated.is_some() {
            rungs.push((true, first, false));
        }
        rungs.push((false, first, false));
        if first != Iteration::Full {
            rungs.push((false, Iteration::Full, false));
        }
        if ctx.opts.line_search {
            rungs.push((false, Iteration::Full, true));
        }
        let mut result = Err(fail(StopReason::NoConvergence, "no attempt"));
        for (k, &(extrapolate, iteration, line_search)) in rungs.iter().enumerate() {
            if k > 0 {
                let fall_through = match &result {
                    Err(f) if f.reason == StopReason::IterationBudget => false,
                    Err(f) => rungs[k - 1].0 || f.reason == StopReason::NoConvergence,
                    Ok(_) => false,
                };
                if !fall_through {
                    break;
                }
                ctx.model.revert();
            }
            let p = if extrapolate { extrapolated.as_deref() } else { None };
            result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, line_search, iteration, p);
        }
        match result {
            Ok(conv) => {
                let iterations = conv.iterations;
                run.accept(ctx, conv, Phase::LoadControl);
                cuts = 0;
                (step, last_easy) = grow(step, full, iterations, last_easy);
            }
            Err(f) => {
                ctx.model.revert();
                if f.reason == StopReason::IterationBudget || cuts >= ctx.opts.max_cuts || step < MIN_STEP_FRACTION * full.abs() {
                    return Termination::Stopped { reason: f.reason, message: f.message };
                }
                cuts += 1;
                step *= CUT;
                last_easy = false;
            }
        }
    }
    Termination::Completed
}

fn run_displacement<M: NonlinearModel>(ctx: &mut Ctx<'_, M>, run: &mut Run, c: usize, target: f64, increments: usize) -> Termination {
    let bordered = ctx.sys.bordered(c, &ctx.f_free);
    let full = target / increments as f64;
    let mut step = full.abs();
    let mut progress = 0.0;
    let mut cuts = 0;
    let mut last_easy = false;
    while (target - progress).abs() > 1e-12 * target.abs().max(full.abs()) {
        let this = next_step(0.0, full, progress, target, step);
        match ctx.displacement_step(&bordered, run.lambda, c, this) {
            Ok(conv) => {
                let iterations = conv.iterations;
                run.accept(ctx, conv, Phase::DisplacementControl);
                progress += this;
                cuts = 0;
                (step, last_easy) = grow(step, full, iterations, last_easy);
            }
            Err(f) => {
                ctx.model.revert();
                if f.reason == StopReason::IterationBudget || cuts >= ctx.opts.max_cuts || step < MIN_STEP_FRACTION * full.abs() {
                    return Termination::Stopped { reason: f.reason, message: f.message };
                }
                cuts += 1;
                step *= CUT;
                last_easy = false;
            }
        }
    }
    Termination::Completed
}

/// Arc-length from the current state until λ passes `target`; then one
/// load-controlled step back onto it exactly, when that converges.
fn run_arc<M: NonlinearModel>(ctx: &mut Ctx<'_, M>, run: &mut Run, target: f64, mut ds: f64, max_steps: usize) -> Termination {
    let ds0 = ds;
    let max_ds = (MAX_ARC_GROWTH * ds0).max(MAX_ARC_FRACTION * ctx.length);
    let sign = if target >= run.lambda { 1.0 } else { -1.0 };
    let mut cuts = 0;
    let mut taken = 0;
    let mut switch_along: Option<Vec<f64>> = None;
    // While a bifurcation is being located: the arc it must be pinned within.
    let mut locate_within: Option<f64> = None;
    let mut negative_before = run.negative;
    while taken < max_steps {
        let prev = run.last_du.clone();
        let along = switch_along.take();
        match ctx.arc_step(run.lambda, ds, prev.as_deref(), sign, along.as_deref()) {
            Ok(conv) => {
                // More negative eigenvalues: a critical point was crossed.
                // Locate it first, backing off and halving the arc until the
                // crossing step is a 256th of the one that found it.
                let crossed = match (negative_before, conv.negative) {
                    (Some(a), Some(b)) if b > a => b - a,
                    _ => 0,
                };
                if ctx.opts.branch_switching && along.is_none() && crossed > 0 {
                    let within = *locate_within.get_or_insert(ds / LOCATE_DIVISIONS);
                    if ds > within {
                        ctx.model.revert();
                        ds /= 2.0;
                        continue;
                    }
                }
                let iterations = conv.iterations.max(1) as f64;
                run.accept(ctx, conv, Phase::ArcLength);
                taken += 1;
                cuts = 0;
                negative_before = run.negative;
                if ctx.opts.branch_switching && along.is_none() && crossed > 0 {
                    locate_within = None;
                    // Classified from its critical modes: at a limit point
                    // they have a component along the load, at a bifurcation
                    // they are orthogonal to it. (The stiffness in the load
                    // direction cannot tell: a soft support in series keeps it
                    // positive past a limit point.)
                    if let Ok((mut point, free_modes)) = ctx.critical_point(run.lambda, crossed) {
                        if point.kind == CriticalKind::Bifurcation && !free_modes.is_empty() {
                            let k = ctx.opts.branch_mode.min(free_modes.len() - 1);
                            let sign = if ctx.opts.branch_reverse { -1.0 } else { 1.0 };
                            switch_along = Some(free_modes[k].iter().map(|x| sign * x).collect());
                            point.switched = true;
                            run.branch_switches.push(run.lambda);
                            // Off the primary path by an arc the model can see,
                            // at constant load.
                            ds = ds.max(BRANCH_STEP * ctx.length);
                        }
                        run.critical_points.push(point);
                        if switch_along.is_some() {
                            continue;
                        }
                    }
                }
                ds = (ds * (ARC_TARGET_ITERATIONS / iterations).sqrt().clamp(0.5, 2.0)).min(max_ds);
                if (run.lambda - target) * sign >= 0.0 {
                    if run.lambda != target {
                        match ctx.load_step(run.lambda, target - run.lambda, run.negative, run.det_sign, false, Iteration::Full, None) {
                            Ok(c) => run.accept(ctx, c, Phase::LoadControl),
                            Err(_) => ctx.model.revert(),
                        }
                    }
                    return Termination::Completed;
                }
            }
            Err(f) => {
                ctx.model.revert();
                if f.reason == StopReason::IterationBudget || cuts >= ctx.opts.max_cuts || ds < MIN_STEP_FRACTION * ds0 {
                    return Termination::Stopped { reason: f.reason, message: f.message };
                }
                cuts += 1;
                ds /= 2.0;
                switch_along = along;
            }
        }
    }
    Termination::Stopped {
        reason: StopReason::StepLimit,
        message: format!("arc-length took {max_steps} steps and reached λ = {}, short of {target}", run.lambda),
    }
}

/// Runs `strategy` on `model` from its current (initial) state.
///
/// `Err` only for an invalid request (no increments, a control DOF that is
/// restrained, out of range or a rotation, nothing free). Everything that
/// happens during the analysis is in the [`Outcome`].
pub fn solve<M: NonlinearModel>(model: &mut M, strategy: &Strategy, opts: &NewtonOptions) -> Result<Outcome, String> {
    let n = model.n_dofs();
    let sys = TangentSystem::new(model);
    if sys.free.is_empty() {
        return Err("no free DOFs".into());
    }
    let (target, increments) = match *strategy {
        Strategy::LoadControl { target, increments }
        | Strategy::DisplacementControl { target, increments, .. }
        | Strategy::ArcLength { target, increments, .. }
        | Strategy::Auto { target, increments, .. } => (target, increments),
    };
    if increments == 0
        || !target.is_finite()
        || opts.max_iterations == 0
        || opts.tolerance.is_nan()
        || opts.tolerance <= 0.0
        || opts.displacement_tolerance.is_nan()
        || opts.displacement_tolerance <= 0.0
    {
        return Err("increments, target, max_iterations and the tolerances must be positive and finite".into());
    }
    let control = match *strategy {
        Strategy::DisplacementControl { dof, .. } => {
            if dof >= n || model.dof_kind(dof) != DofKind::Translation {
                return Err("the control DOF must be a translation".into());
            }
            Some(sys.free.iter().position(|&d| d == dof).ok_or("the control DOF is restrained")?)
        }
        _ => None,
    };
    let f_free: Vec<f64> = sys.free.iter().map(|&d| model.reference_load()[d]).collect();
    let weight: Vec<f64> = sys.free.iter().map(|&d| if model.dof_kind(d) == DofKind::Translation { 1.0 } else { 0.0 }).collect();
    let length = opts.rotation_length.unwrap_or_else(|| model.characteristic_length()).max(f64::MIN_POSITIVE);
    let fscale_all: Vec<f64> = (0..n).map(|d| if model.dof_kind(d) == DofKind::Translation { 1.0 } else { 1.0 / length }).collect();
    let fscale_free: Vec<f64> = sys.free.iter().map(|&d| fscale_all[d]).collect();
    let rotation: Vec<bool> = (0..n).map(|d| model.dof_kind(d) == DofKind::Rotation).collect();
    let mut ctx = Ctx {
        model,
        sys,
        f_free,
        weight,
        fscale_free,
        length,
        rotation,
        seen_force: 0.0,
        seen_moment: 0.0,
        iterations_used: 0,
        opts: opts.clone(),
    };

    let ev = ctx.evaluate(0.0).map_err(|f| f.message)?;
    ctx.model.commit();
    let fac0 = ctx.factor().map_err(|f| f.message)?;
    let uf0 = ctx.solve(&fac0, &ctx.f_free).map_err(|f| f.message)?;
    let mut run = Run {
        lambda: 0.0,
        f_int: ev.f_int,
        negative: fac0.negative_eigenvalues(),
        det_sign: fac0.det_sign(),
        flexibility0: dot(&ctx.f_free, &uf0),
        stiffness_parameter: 1.0,
        steps: Vec::new(),
        total_iterations: 0,
        last_du: None,
        last_load: None,
        branch_switches: Vec::new(),
        critical_points: Vec::new(),
    };
    let first_arc = (target / increments as f64).abs() * ctx.wdot(&uf0, &uf0).sqrt();

    let termination = match *strategy {
        Strategy::LoadControl { target, increments } => run_load(&mut ctx, &mut run, target, increments),
        Strategy::DisplacementControl { target, increments, .. } => {
            run_displacement(&mut ctx, &mut run, control.unwrap_or(0), target, increments)
        }
        Strategy::ArcLength { target, max_steps, .. } => run_arc(&mut ctx, &mut run, target, first_arc, max_steps),
        Strategy::Auto { target, increments, max_steps } => match run_load(&mut ctx, &mut run, target, increments) {
            // Load control meets a critical point as a change of stability, as
            // a step that stops converging, or (cut close enough to it) as a
            // singular tangent.
            Termination::Stopped { reason: StopReason::LimitPoint | StopReason::NoConvergence | StopReason::SingularTangent, .. } => {
                // Arc-length from the last converged state, with the arc of the
                // last load step (or of the first, if none converged).
                // The arc of a nominal load step at least: the last converged
                // step may be a cut one, many times shorter.
                let ds = run.last_du.as_ref().map_or(first_arc, |du| ctx.wdot(du, du).sqrt()).max(first_arc);
                run_arc(&mut ctx, &mut run, target, ds, max_steps)
            }
            other => other,
        },
    };

    // The trial state of every element must be the committed one the
    // outcome reports.
    ctx.model.revert();
    let u = ctx.model.displacements();
    let f_ref = ctx.model.reference_load();
    let reactions = (0..n).map(|d| if ctx.model.is_fixed(d) { run.f_int[d] - run.lambda * f_ref[d] } else { 0.0 }).collect();
    Ok(Outcome {
        termination,
        lambda: run.lambda,
        u,
        reactions,
        steps: run.steps,
        total_iterations: run.total_iterations,
        factorizations: ctx.sys.factorizations(),
        newton_iterations: ctx.iterations_used,
        branch_switches: run.branch_switches,
        critical_points: run.critical_points,
    })
}
