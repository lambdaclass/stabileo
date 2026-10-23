//! The solution driver: R(u, λ) = λ·F − f_int(u) = 0 by Newton–Raphson.

use super::linear_solver::{Bordered, Factor, FactorMethod, TangentSystem};
use super::model::{DofKind, NonlinearModel};

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
    /// ‖R_free‖ ≤ tolerance · max(|λ|·‖F‖, ‖f_int‖), or the rounding floor.
    pub tolerance: f64,
    /// Halvings of a failed step before the analysis stops.
    pub max_cuts: usize,
    /// When a load-controlled step fails with plain Newton, retry it with
    /// Crisfield's line search before cutting it.
    pub line_search: bool,
    /// The first rung for load-controlled steps; a step that fails with
    /// `Modified` or `Bfgs` is retried with `Full` before anything else.
    pub iteration: Iteration,
    /// Also converged when the work of the correction, |δu·R|, falls to this
    /// fraction of the step's first: a criterion with consistent units.
    pub energy_tolerance: Option<f64>,
    /// The length that turns moments into forces (M / L) in the force norms,
    /// so that kN and kN·m do not add. Default: the model's characteristic
    /// length (its bounding-box diagonal).
    pub rotation_length: Option<f64>,
    /// ψ of the spherical arc-length constraint ‖Δu‖² + ψ²·Δλ²·‖F‖² = Δs²
    /// (length per force); 0 is the cylindrical one.
    pub arc_psi: f64,
    /// At a bifurcation met by arc-length (the count of negative eigenvalues
    /// rises while the load still has stiffness), continue on the secondary
    /// branch along the critical mode instead of the unstable primary one.
    pub branch_switching: bool,
}

impl Default for NewtonOptions {
    fn default() -> Self {
        NewtonOptions {
            max_iterations: 30,
            tolerance: 1e-9,
            max_cuts: 10,
            line_search: true,
            iteration: Iteration::Full,
            energy_tolerance: None,
            rotation_length: None,
            arc_psi: 0.0,
            branch_switching: true,
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
    /// λ at each bifurcation where arc-length switched branch.
    pub branch_switches: Vec<f64>,
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

/// The critical mode of a bifurcation is orthogonal to the load: |Fᵀφ| below
/// this fraction of ‖F‖·‖φ‖. Above it, the point is a limit point.
const BIFURCATION_ORTHOGONALITY: f64 = 1e-3;

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

/// Arc-length aims each step at this many iterations, scaling the arc by
/// √(target / iterations) within [½, 2].
const ARC_TARGET_ITERATIONS: f64 = 5.0;

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
    ok: bool,
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
    /// Force-norm weights: 1 on translations, 1/L on rotations (free DOFs,
    /// then all DOFs).
    fscale_free: Vec<f64>,
    fscale_all: Vec<f64>,
    /// The model's characteristic length.
    length: f64,
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
        // Moments enter as M / L: forces and moments in one consistent norm.
        let scale = (lambda.abs() * scaled_norm(&self.f_free, &self.fscale_free)).max(scaled_norm(&f_int, &self.fscale_all));
        let u_norm = self.model.displacements().iter().fold(0.0f64, |a, x| a.max(x.abs()));
        let k_floor = 16.0 * f64::EPSILON * self.sys.norm_inf() * u_norm * (self.sys.free.len() as f64).sqrt();
        let rn = scaled_norm(&r, &self.fscale_free);
        let floor = if rn > 0.0 { k_floor * rn / norm(&r) } else { k_floor };
        let ok = rn <= self.opts.tolerance * scale || rn <= floor;
        Ok(Eval { f_int, r, ok })
    }

    fn factor(&self) -> Result<Factor, Failure> {
        self.sys.factor().map_err(|m| fail(StopReason::SingularTangent, m))
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

    /// The critical mode at the committed state: the eigenvector of the
    /// tangent's eigenvalue nearest zero, by inverse iteration on its
    /// factorization from a fixed start vector. Normalized on the
    /// translations, its largest translation positive.
    fn critical_mode(&mut self, lambda: f64) -> Result<Vec<f64>, Failure> {
        self.evaluate(lambda)?;
        let fac = self.factor()?;
        let n = self.sys.free.len();
        let mut x: Vec<f64> = (0..n).map(|i| ((i as u64 * 2_654_435_761) % 1000) as f64 / 1000.0 - 0.5).collect();
        for _ in 0..40 {
            x = self.solve_raw(&fac, &x)?;
            let nx = norm(&x);
            if nx == 0.0 || !nx.is_finite() {
                return Err(fail(StopReason::SingularTangent, "inverse iteration lost the critical mode"));
            }
            x.iter_mut().for_each(|v| *v /= nx);
        }
        let nt = self.wdot(&x, &x).sqrt();
        if nt == 0.0 {
            return Err(fail(StopReason::SingularTangent, "the critical mode moves no translation"));
        }
        let lead = (0..n).filter(|&i| self.weight[i] > 0.0).max_by(|&a, &b| x[a].abs().total_cmp(&x[b].abs())).unwrap_or(0);
        let sign = if x[lead] < 0.0 { -1.0 } else { 1.0 };
        Ok(x.iter().map(|v| sign * v / nt).collect())
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
        Ok(Converged {
            lambda,
            iterations,
            f_int: ev.f_int,
            negative: fac.negative_eigenvalues(),
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
    fn load_step(
        &mut self,
        lambda_c: f64,
        d_lambda: f64,
        negative_c: Option<usize>,
        sign_c: i8,
        line_search: bool,
        iteration: Iteration,
    ) -> Result<Converged, Failure> {
        let lambda = lambda_c + d_lambda;
        let mut step = vec![0.0; self.sys.free.len()];
        let mut predictor = 0.0;
        let mut iterations = 0;
        let mut cur = self.evaluate(lambda)?;
        let mut factor: Option<Factor> = None;
        let mut since_refactor = 0;
        let mut pairs: Vec<(Vec<f64>, Vec<f64>, f64)> = Vec::new();
        let mut energy0 = 0.0;
        loop {
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
            if cur.ok {
                let current = if current_is_factored { factor.take() } else { None };
                return self.finish_load(lambda, iterations, cur, step, predictor, current, negative_c, sign_c);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("no convergence in {iterations} iterations at λ = {lambda}")));
            }
            let f = factor.as_ref().expect("factored on the first iteration");
            let du = match iteration {
                Iteration::Full => self.solve(f, &cur.r)?,
                Iteration::Modified { .. } => self.solve_raw(f, &cur.r)?,
                Iteration::Bfgs { .. } => self.bfgs_direction(f, &pairs, &cur.r)?,
            };
            if let Some(te) = self.opts.energy_tolerance {
                let e = dot(&du, &cur.r).abs();
                if iterations == 0 {
                    energy0 = e;
                } else if e <= te * energy0 {
                    let current = if current_is_factored { factor.take() } else { None };
                    return self.finish_load(lambda, iterations, cur, step, predictor, current, negative_c, sign_c);
                }
            }
            if iterations == 0 {
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
            iterations += 1;
            since_refactor += 1;
        }
    }

    /// (δu, δλ) for displacement control: the control DOF moves by `dd`.
    /// From K when it factors (u_R + δλ·u_F with δu_c = dd), from the
    /// bordered system when K is singular.
    fn displacement_correction(&self, bordered: &Bordered, c: usize, r: &[f64], dd: f64) -> Result<(Vec<f64>, f64), Failure> {
        if let Ok(fac) = self.sys.factor() {
            let ur = self.solve(&fac, r)?;
            let uf = self.solve(&fac, &self.f_free)?;
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
        let (du, dl) = self.displacement_correction(bordered, c, &ev.r, delta)?;
        self.move_by(&du, 1.0);
        let predictor = norm(&du);
        let mut step = du;
        let mut lambda = lambda_c + dl;
        let mut iterations = 1;
        loop {
            let ev = self.evaluate(lambda)?;
            if ev.ok {
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
                let fac = self.sys.factor().ok();
                return self.converged(lambda, iterations, ev, fac.as_ref(), step);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("no convergence in {iterations} iterations at λ = {lambda}")));
            }
            let (du, dl) = self.displacement_correction(bordered, c, &ev.r, 0.0)?;
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
        loop {
            let ev = self.evaluate(lambda)?;
            let fac = self.factor()?;
            if ev.ok {
                return self.converged(lambda, iterations, ev, Some(&fac), step);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("arc-length: no convergence in {iterations} iterations at λ = {lambda}")));
            }
            let ur = self.solve(&fac, &ev.r)?;
            let uf = self.solve(&fac, &self.f_free)?;
            // ‖Δu + u_R + δλ·u_F‖² + ψ²·(Δλ + δλ)²·‖F‖² = ds² over the translations.
            let w: Vec<f64> = step.iter().zip(&ur).map(|(s, r)| s + r).collect();
            let a = self.wdot(&uf, &uf) + f2;
            let b = 2.0 * (self.wdot(&w, &uf) + f2 * dls);
            let c = self.wdot(&w, &w) + f2 * dls * dls - ds * ds;
            let disc = b * b - 4.0 * a * c;
            if a == 0.0 || disc < 0.0 {
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
    branch_switches: Vec<f64>,
}

impl Run {
    fn accept<M: NonlinearModel>(&mut self, ctx: &mut Ctx<'_, M>, conv: Converged, phase: Phase) {
        ctx.model.commit();
        self.total_iterations += conv.iterations;
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

/// Load control from the current state toward `target`.
fn run_load<M: NonlinearModel>(ctx: &mut Ctx<'_, M>, run: &mut Run, target: f64, increments: usize) -> Termination {
    let full = (target - run.lambda) / increments as f64;
    let mut step = full;
    let mut cuts = 0;
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
        let remaining = target - run.lambda;
        let this = if step.abs() > remaining.abs() { remaining } else { step };
        // The escalation ladder: the configured iteration (full Newton by
        // default); on a failure to converge, full Newton; then full Newton
        // with line search; then a cut.
        let first = ctx.opts.iteration;
        let mut result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, false, first);
        let no_convergence = |r: &Result<Converged, Failure>| matches!(r, Err(f) if f.reason == StopReason::NoConvergence);
        if first != Iteration::Full && no_convergence(&result) {
            ctx.model.revert();
            result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, false, Iteration::Full);
        }
        if ctx.opts.line_search && no_convergence(&result) {
            ctx.model.revert();
            result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, true, Iteration::Full);
        }
        match result {
            Ok(conv) => {
                run.accept(ctx, conv, Phase::LoadControl);
                cuts = 0;
                if step.abs() < full.abs() {
                    step = (2.0 * step).clamp(-full.abs(), full.abs());
                }
            }
            Err(f) => {
                ctx.model.revert();
                if cuts >= ctx.opts.max_cuts || step.abs() < MIN_STEP_FRACTION * full.abs() {
                    return Termination::Stopped { reason: f.reason, message: f.message };
                }
                cuts += 1;
                step /= 2.0;
            }
        }
    }
    Termination::Completed
}

fn run_displacement<M: NonlinearModel>(ctx: &mut Ctx<'_, M>, run: &mut Run, c: usize, target: f64, increments: usize) -> Termination {
    let bordered = ctx.sys.bordered(c, &ctx.f_free);
    let full = target / increments as f64;
    let mut step = full;
    let mut progress = 0.0;
    let mut cuts = 0;
    while (target - progress).abs() > 1e-12 * target.abs().max(full.abs()) {
        let remaining = target - progress;
        let this = if step.abs() > remaining.abs() { remaining } else { step };
        match ctx.displacement_step(&bordered, run.lambda, c, this) {
            Ok(conv) => {
                run.accept(ctx, conv, Phase::DisplacementControl);
                progress += this;
                cuts = 0;
                if step.abs() < full.abs() {
                    step = (2.0 * step).clamp(-full.abs(), full.abs());
                }
            }
            Err(f) => {
                ctx.model.revert();
                if cuts >= ctx.opts.max_cuts || step.abs() < MIN_STEP_FRACTION * full.abs() {
                    return Termination::Stopped { reason: f.reason, message: f.message };
                }
                cuts += 1;
                step /= 2.0;
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
                // One more negative eigenvalue: a limit point or a bifurcation.
                // The critical mode tells them apart: at a limit point it has a
                // component along the load, at a (symmetric) bifurcation it is
                // orthogonal to it. The stiffness in the load direction cannot:
                // a soft support in series keeps it positive past a limit point.
                let crossing = matches!((negative_before, conv.negative), (Some(a), Some(b)) if b > a);
                let mut bifurcation: Option<Vec<f64>> = None;
                if ctx.opts.branch_switching && along.is_none() && crossing {
                    if let Ok(phi) = ctx.critical_mode(conv.lambda) {
                        let along_load = dot(&ctx.f_free, &phi).abs() / (norm(&ctx.f_free) * norm(&phi)).max(f64::MIN_POSITIVE);
                        if along_load < BIFURCATION_ORTHOGONALITY {
                            bifurcation = Some(phi);
                        }
                    }
                }
                if bifurcation.is_some() {
                    // Locate it first: back off and halve the arc until the
                    // crossing step is a 64th of the one that found it.
                    let within = *locate_within.get_or_insert(ds / 64.0);
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
                if let Some(phi) = bifurcation {
                    // At a bifurcation the next step leaves along the mode, at
                    // constant load, by an arc the model can see.
                    run.branch_switches.push(run.lambda);
                    switch_along = Some(phi);
                    locate_within = None;
                    ds = ds.max(BRANCH_STEP * ctx.length);
                    continue;
                }
                ds = (ds * (ARC_TARGET_ITERATIONS / iterations).sqrt().clamp(0.5, 2.0)).min(max_ds);
                if (run.lambda - target) * sign >= 0.0 {
                    if run.lambda != target {
                        match ctx.load_step(run.lambda, target - run.lambda, run.negative, run.det_sign, false, Iteration::Full) {
                            Ok(c) => run.accept(ctx, c, Phase::LoadControl),
                            Err(_) => ctx.model.revert(),
                        }
                    }
                    return Termination::Completed;
                }
            }
            Err(f) => {
                ctx.model.revert();
                if cuts >= ctx.opts.max_cuts || ds < MIN_STEP_FRACTION * ds0 {
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
    if increments == 0 || !target.is_finite() || opts.max_iterations == 0 || opts.tolerance.is_nan() || opts.tolerance <= 0.0 {
        return Err("increments, target, max_iterations and tolerance must be positive and finite".into());
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
    let mut ctx = Ctx { model, sys, f_free, weight, fscale_free, fscale_all, length, opts: opts.clone() };

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
        branch_switches: Vec::new(),
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
        branch_switches: run.branch_switches,
    })
}
