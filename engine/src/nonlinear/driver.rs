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
    /// converged state if load control meets a limit point or stops
    /// converging, until λ reaches `target`.
    Auto { target: f64, increments: usize, max_steps: usize },
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
}

impl Default for NewtonOptions {
    fn default() -> Self {
        NewtonOptions { max_iterations: 30, tolerance: 1e-9, max_cuts: 10, line_search: true }
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
    opts: NewtonOptions,
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
        let scale = (lambda.abs() * norm(&self.f_free)).max(norm(&f_int));
        let u_norm = self.model.displacements().iter().fold(0.0f64, |a, x| a.max(x.abs()));
        let floor = 16.0 * f64::EPSILON * self.sys.norm_inf() * u_norm * (self.sys.free.len() as f64).sqrt();
        let rn = norm(&r);
        let ok = rn <= self.opts.tolerance * scale || rn <= floor;
        Ok(Eval { f_int, r, ok })
    }

    fn factor(&self) -> Result<Factor, Failure> {
        self.sys.factor().map_err(|m| fail(StopReason::SingularTangent, m))
    }

    fn solve(&self, f: &Factor, b: &[f64]) -> Result<Vec<f64>, Failure> {
        self.sys.solve(f, b).map_err(|m| fail(StopReason::SingularTangent, m))
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

    /// One load-controlled step from the committed state.
    fn load_step(&mut self, lambda_c: f64, d_lambda: f64, negative_c: Option<usize>, sign_c: i8, line_search: bool) -> Result<Converged, Failure> {
        let lambda = lambda_c + d_lambda;
        let mut step = vec![0.0; self.sys.free.len()];
        let mut predictor = 0.0;
        let mut iterations = 0;
        let mut cur = self.evaluate(lambda)?;
        loop {
            let fac = self.factor()?;
            let changed = match (fac.negative_eigenvalues(), negative_c) {
                (Some(a), Some(b)) => a != b,
                _ => fac.det_sign() != sign_c,
            };
            if changed {
                return Err(fail(
                    StopReason::LimitPoint,
                    format!("the tangent's stability changed near λ = {lambda}: a limit or bifurcation point, which load control cannot pass"),
                ));
            }
            if cur.ok {
                // A step that lands far from where the committed tangent sends
                // it has left that branch: Newton jumped over a limit point onto
                // a distant stable one, which neither end's tangent shows. On a
                // continuous path the ratio tends to 1 as the step is cut, so a
                // cut cures a false alarm; a jump stays one at any step size.
                let ratio = if predictor > 0.0 { norm(&step) / predictor } else { 1.0 };
                if !(JUMP_RATIO.recip()..=JUMP_RATIO).contains(&ratio) {
                    return Err(fail(
                        StopReason::LimitPoint,
                        format!("the step to λ = {lambda} left the branch the tangent predicts (‖Δu‖ / ‖predictor‖ = {ratio:.3}): a limit point, which load control cannot pass"),
                    ));
                }
                return self.converged(lambda, iterations, cur, Some(&fac), step);
            }
            if iterations == self.opts.max_iterations {
                return Err(fail(StopReason::NoConvergence, format!("no convergence in {iterations} iterations at λ = {lambda}")));
            }
            let du = self.solve(&fac, &cur.r)?;
            if iterations == 0 {
                predictor = norm(&du);
            }
            let (alpha, next) = if line_search {
                self.line_search(&du, &cur.r, lambda)?
            } else {
                self.move_by(&du, 1.0);
                (1.0, self.evaluate(lambda)?)
            };
            for (s, d) in step.iter_mut().zip(&du) {
                *s += alpha * d;
            }
            cur = next;
            iterations += 1;
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
    /// along the previous step's increment `prev` (or toward `sign`).
    fn arc_step(&mut self, lambda_c: f64, ds: f64, prev: Option<&[f64]>, sign: f64) -> Result<Converged, Failure> {
        self.evaluate(lambda_c)?;
        let uf = self.solve(&self.factor()?, &self.f_free)?;
        let uf_norm = self.wdot(&uf, &uf).sqrt();
        if uf_norm == 0.0 {
            return Err(fail(StopReason::SingularTangent, "the load moves no translation"));
        }
        let dir = match prev {
            Some(p) => {
                let d = self.wdot(p, &uf);
                if d == 0.0 { sign } else { d.signum() }
            }
            None => sign,
        };
        let d_lambda = dir * ds / uf_norm;
        self.move_by(&uf, d_lambda);
        let mut step: Vec<f64> = uf.iter().map(|u| d_lambda * u).collect();
        let mut lambda = lambda_c + d_lambda;
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
            // ‖Δu + u_R + δλ·u_F‖² = ds² over the translations.
            let w: Vec<f64> = step.iter().zip(&ur).map(|(s, r)| s + r).collect();
            let a = self.wdot(&uf, &uf);
            let b = 2.0 * self.wdot(&w, &uf);
            let c = self.wdot(&w, &w) - ds * ds;
            let disc = b * b - 4.0 * a * c;
            if a == 0.0 || disc < 0.0 {
                return Err(fail(StopReason::NoConvergence, format!("arc-length: the constraint has no real root at λ = {lambda}")));
            }
            let sq = disc.sqrt();
            // Of the two roots, the one whose increment turns least from the step so far.
            let along = |dl: f64| -> f64 {
                let cand: Vec<f64> = w.iter().zip(&uf).map(|(x, f)| x + dl * f).collect();
                self.wdot(&cand, &step)
            };
            let (r1, r2) = ((-b + sq) / (2.0 * a), (-b - sq) / (2.0 * a));
            let dl = if along(r1) >= along(r2) { r1 } else { r2 };
            let du: Vec<f64> = ur.iter().zip(&uf).map(|(r, f)| r + dl * f).collect();
            self.move_by(&du, 1.0);
            for (s, d) in step.iter_mut().zip(&du) {
                *s += d;
            }
            lambda += dl;
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
        // The escalation ladder: plain Newton; on a failure to converge, the
        // same step with line search; then a cut.
        let mut result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, false);
        if ctx.opts.line_search && matches!(&result, Err(f) if f.reason == StopReason::NoConvergence) {
            ctx.model.revert();
            result = ctx.load_step(run.lambda, this, run.negative, run.det_sign, true);
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
    let sign = if target >= run.lambda { 1.0 } else { -1.0 };
    let mut cuts = 0;
    let mut taken = 0;
    while taken < max_steps {
        let prev = run.last_du.clone();
        match ctx.arc_step(run.lambda, ds, prev.as_deref(), sign) {
            Ok(conv) => {
                let iterations = conv.iterations.max(1) as f64;
                run.accept(ctx, conv, Phase::ArcLength);
                taken += 1;
                cuts = 0;
                ds *= (ARC_TARGET_ITERATIONS / iterations).sqrt().clamp(0.5, 2.0);
                if (run.lambda - target) * sign >= 0.0 {
                    if run.lambda != target {
                        match ctx.load_step(run.lambda, target - run.lambda, run.negative, run.det_sign, false) {
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
    let mut ctx = Ctx { model, sys, f_free, weight, opts: opts.clone() };

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
    };
    let first_arc = (target / increments as f64).abs() * ctx.wdot(&uf0, &uf0).sqrt();

    let termination = match *strategy {
        Strategy::LoadControl { target, increments } => run_load(&mut ctx, &mut run, target, increments),
        Strategy::DisplacementControl { target, increments, .. } => {
            run_displacement(&mut ctx, &mut run, control.unwrap_or(0), target, increments)
        }
        Strategy::ArcLength { target, max_steps, .. } => run_arc(&mut ctx, &mut run, target, first_arc, max_steps),
        Strategy::Auto { target, increments, max_steps } => match run_load(&mut ctx, &mut run, target, increments) {
            Termination::Stopped { reason: StopReason::LimitPoint | StopReason::NoConvergence, .. } => {
                // Arc-length from the last converged state, with the arc of the
                // last load step (or of the first, if none converged).
                let ds = run.last_du.as_ref().map_or(first_arc, |du| ctx.wdot(du, du).sqrt());
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
    Ok(Outcome { termination, lambda: run.lambda, u, reactions, steps: run.steps, total_iterations: run.total_iterations })
}
