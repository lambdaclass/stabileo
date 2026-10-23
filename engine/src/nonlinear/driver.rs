//! The solution driver: R(u, λ) = λ·F − f_int(u) = 0 by Newton–Raphson.

use super::model::Model2D;
use crate::linalg::lu::{lu_apply, lu_factor};

/// How the load is applied.
#[derive(Debug, Clone)]
pub enum Strategy {
    /// λ from 0 to `target` in `increments` equal steps.
    LoadControl { target: f64, increments: usize },
    /// The displacement at `dof` from its current value to `target` in
    /// `increments` equal steps, λ found at each step (Batoz–Dhatt). Passes
    /// limit points in load (snap-through), not in displacement (snap-back).
    DisplacementControl { dof: usize, target: f64, increments: usize },
}

#[derive(Debug, Clone)]
pub struct NewtonOptions {
    /// Newton iterations per step before the step counts as failed.
    pub max_iterations: usize,
    /// ‖R_free‖ ≤ tolerance · max(|λ|·‖F‖, ‖f_int‖). The norm adds forces
    /// and moments unscaled (as the existing solvers do, docs/solver/nonlinear.md §1.2).
    pub tolerance: f64,
    /// Halvings of a failed step before the analysis stops.
    pub max_cuts: usize,
}

impl Default for NewtonOptions {
    fn default() -> Self {
        NewtonOptions { max_iterations: 30, tolerance: 1e-9, max_cuts: 10 }
    }
}

/// One converged step.
#[derive(Debug, Clone)]
pub struct StepRecord {
    pub lambda: f64,
    pub u: Vec<f64>,
    pub iterations: usize,
    /// Sign of det(K_T) on the free DOFs at the converged state: it changes
    /// where an odd number of tangent eigenvalues crossed zero (a limit or
    /// bifurcation point). An LDLᵀ inertia count would give the number itself.
    pub tangent_det_sign: i8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    /// Newton did not converge, even after `max_cuts` halvings.
    NoConvergence,
    /// The tangent could not be factorized (a mechanism, or a limit point
    /// under load control).
    SingularTangent,
    /// An element could not be evaluated (zero length, a material failure).
    ElementFailure,
    /// Under load control the path reached a limit or bifurcation point,
    /// which load control cannot pass (displacement control can a limit
    /// point). Detected when an iterate's tangent changes sign, or when the
    /// converged step lands far from the tangent's prediction: without these
    /// checks Newton may land on a distant stable branch and report a
    /// dynamic jump as a static path.
    LimitPoint,
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

/// Band of ‖Δu‖ / ‖tangent predictor‖ a load-controlled step must land in.
const JUMP_RATIO: f64 = 4.0;

/// Load control stops once the current stiffness parameter (Bergan: the
/// stiffness in the direction of the load over its initial value) falls
/// below this, or turns negative: the committed state is at a limit point.
const MIN_STIFFNESS_PARAMETER: f64 = 1e-3;

struct Failure {
    reason: StopReason,
    message: String,
}

enum Control {
    Load(f64),
    Displacement { free_index: usize, delta: f64 },
}

struct Converged {
    u: Vec<f64>,
    lambda: f64,
    iterations: usize,
    f_int: Vec<f64>,
    det_sign: i8,
    /// Fᵀ·K⁻¹·F on the free DOFs at the converged state: the flexibility in
    /// the direction of the load.
    load_flexibility: f64,
}

/// A factorization of the free block of the tangent.
struct Factor {
    a: Vec<f64>,
    piv: Vec<usize>,
    n: usize,
}

impl Factor {
    fn new(k: &[f64], free: &[usize], n_all: usize) -> Result<Self, Failure> {
        let n = free.len();
        let mut a = vec![0.0; n * n];
        for (i, &fi) in free.iter().enumerate() {
            for (j, &fj) in free.iter().enumerate() {
                a[i * n + j] = k[fi * n_all + fj];
            }
        }
        let piv = lu_factor(&mut a, n).ok_or(Failure {
            reason: StopReason::SingularTangent,
            message: "the tangent stiffness is singular".into(),
        })?;
        Ok(Factor { a, piv, n })
    }

    /// Sign of the determinant: the product of U's diagonal, times the
    /// permutation's parity.
    fn det_sign(&self) -> i8 {
        let mut sign = 1i8;
        for k in 0..self.n {
            if self.a[self.piv[k] * self.n + k] < 0.0 {
                sign = -sign;
            }
        }
        let mut seen = vec![false; self.n];
        for start in 0..self.n {
            let mut len = 0;
            let mut i = start;
            while !seen[i] {
                seen[i] = true;
                i = self.piv[i];
                len += 1;
            }
            if len > 0 && len % 2 == 0 {
                sign = -sign;
            }
        }
        sign
    }

    fn solve(&self, b: &[f64]) -> Result<Vec<f64>, Failure> {
        let x = lu_apply(&self.a, &self.piv, b, self.n).ok_or(Failure {
            reason: StopReason::SingularTangent,
            message: "the tangent stiffness is singular".into(),
        })?;
        if x.iter().any(|v| !v.is_finite()) {
            return Err(Failure { reason: StopReason::SingularTangent, message: "non-finite solution of the tangent system".into() });
        }
        Ok(x)
    }
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

fn assemble(model: &mut Model2D, u: &[f64]) -> Result<(Vec<f64>, Vec<f64>), Failure> {
    model.assemble(u).map_err(|message| Failure { reason: StopReason::ElementFailure, message })
}

/// Residual on the free DOFs and whether it meets the tolerance.
///
/// Converged when ‖R‖ ≤ tol·max(|λ|·‖F‖, ‖f_int‖), or when ‖R‖ is down to
/// what rounding allows: f_int is a sum of terms of order ‖K‖·‖u‖, so it is
/// not known better than about ε·‖K‖·‖u‖. A stiff axial term next to a
/// flexible bending one (EA·L²/EI of 10⁸ and more) puts that floor above a
/// relative tolerance, and Newton would iterate on noise.
fn residual(f_int: &[f64], f_ref: &[f64], lambda: f64, free: &[usize], tol: f64, k: &[f64], u: &[f64]) -> (Vec<f64>, bool) {
    let n_all = f_int.len();
    let r: Vec<f64> = free.iter().map(|&d| lambda * f_ref[d] - f_int[d]).collect();
    let scale = (lambda.abs() * norm(f_ref)).max(norm(f_int));
    let k_norm = free.iter().map(|&i| free.iter().map(|&j| k[i * n_all + j].abs()).sum::<f64>()).fold(0.0, f64::max);
    let u_norm = u.iter().fold(0.0f64, |a, x| a.max(x.abs()));
    let floor = 16.0 * f64::EPSILON * k_norm * u_norm * (free.len() as f64).sqrt();
    let rn = norm(&r);
    let ok = rn <= tol * scale || rn <= floor;
    (r, ok)
}

fn attempt(
    model: &mut Model2D,
    u_c: &[f64],
    lambda_c: f64,
    det_sign_c: i8,
    control: &Control,
    free: &[usize],
    opts: &NewtonOptions,
) -> Result<Converged, Failure> {
    let n_all = model.n_dofs();
    let f_ref = model.reference_load().to_vec();
    let f_free: Vec<f64> = free.iter().map(|&d| f_ref[d]).collect();
    let mut u = u_c.to_vec();
    let mut lambda = lambda_c;
    let mut iterations = 0;

    match *control {
        Control::Load(d_lambda) => {
            lambda += d_lambda;
            let mut predictor = 0.0;
            loop {
                let (f_int, k) = assemble(model, &u)?;
                let (r, ok) = residual(&f_int, &f_ref, lambda, free, opts.tolerance, &k, &u);
                let fac = Factor::new(&k, free, n_all)?;
                let det_sign = fac.det_sign();
                if det_sign != det_sign_c {
                    return Err(Failure {
                        reason: StopReason::LimitPoint,
                        message: format!("the tangent changed sign near λ = {lambda}: a limit or bifurcation point, which load control cannot pass"),
                    });
                }
                if ok {
                    // A step that lands far from where the committed tangent
                    // sends it has left that branch: Newton jumped over a
                    // limit point onto a distant stable one, which neither
                    // end's tangent shows. On a continuous path the ratio
                    // tends to 1 as the step is cut, so a cut cures a false
                    // alarm; a jump stays one at any step size.
                    let step: Vec<f64> = free.iter().map(|&d| u[d] - u_c[d]).collect();
                    let ratio = if predictor > 0.0 { norm(&step) / predictor } else { 1.0 };
                    if !(JUMP_RATIO.recip()..=JUMP_RATIO).contains(&ratio) {
                        return Err(Failure {
                            reason: StopReason::LimitPoint,
                            message: format!("the step to λ = {lambda} left the branch the tangent predicts (‖Δu‖ / ‖predictor‖ = {ratio:.3}): a limit point, which load control cannot pass"),
                        });
                    }
                    let load_flexibility = dot(&f_free, &fac.solve(&f_free)?);
                    return Ok(Converged { u, lambda, iterations, f_int, det_sign, load_flexibility });
                }
                if iterations == opts.max_iterations {
                    return Err(Failure {
                        reason: StopReason::NoConvergence,
                        message: format!("no convergence in {iterations} iterations at λ = {lambda}"),
                    });
                }
                let du = fac.solve(&r)?;
                if iterations == 0 {
                    predictor = norm(&du);
                }
                for (i, &d) in free.iter().enumerate() {
                    u[d] += du[i];
                }
                iterations += 1;
            }
        }
        Control::Displacement { free_index: c, delta } => {
            // Predictor on the committed tangent: the control DOF moves by `delta`.
            let (_, k) = assemble(model, &u)?;
            let uf = Factor::new(&k, free, n_all)?.solve(&f_free)?;
            if uf[c] == 0.0 {
                return Err(Failure { reason: StopReason::SingularTangent, message: "the load does not move the control DOF".into() });
            }
            let d_lambda = delta / uf[c];
            for (i, &d) in free.iter().enumerate() {
                u[d] += d_lambda * uf[i];
            }
            lambda += d_lambda;
            iterations += 1;
            loop {
                let (f_int, k) = assemble(model, &u)?;
                let (r, ok) = residual(&f_int, &f_ref, lambda, free, opts.tolerance, &k, &u);
                let fac = Factor::new(&k, free, n_all)?;
                if ok {
                    let det_sign = fac.det_sign();
                    let load_flexibility = dot(&f_free, &fac.solve(&f_free)?);
                    return Ok(Converged { u, lambda, iterations, f_int, det_sign, load_flexibility });
                }
                if iterations == opts.max_iterations {
                    return Err(Failure {
                        reason: StopReason::NoConvergence,
                        message: format!("no convergence in {iterations} iterations at λ = {lambda}"),
                    });
                }
                // Corrector at fixed control displacement.
                let ur = fac.solve(&r)?;
                let uf = fac.solve(&f_free)?;
                if uf[c] == 0.0 {
                    return Err(Failure { reason: StopReason::SingularTangent, message: "the load does not move the control DOF".into() });
                }
                let d_lambda = -ur[c] / uf[c];
                for (i, &d) in free.iter().enumerate() {
                    u[d] += ur[i] + d_lambda * uf[i];
                }
                lambda += d_lambda;
                iterations += 1;
            }
        }
    }
}

/// Runs `strategy` on `model` from its current (initial) state.
///
/// `Err` only for an invalid request (no increments, a control DOF that is
/// restrained or out of range, nothing free). Everything that happens during
/// the analysis is in the [`Outcome`].
pub fn solve(model: &mut Model2D, strategy: &Strategy, opts: &NewtonOptions) -> Result<Outcome, String> {
    let n = model.n_dofs();
    let free: Vec<usize> = (0..n).filter(|&d| !model.is_fixed(d)).collect();
    if free.is_empty() {
        return Err("no free DOFs".into());
    }
    let (start, target, increments, control_dof) = match *strategy {
        Strategy::LoadControl { target, increments } => (0.0, target, increments, None),
        Strategy::DisplacementControl { dof, target, increments } => {
            let c = free.iter().position(|&d| d == dof).ok_or("the control DOF is restrained or out of range")?;
            (0.0, target, increments, Some(c))
        }
    };
    if increments == 0 || !target.is_finite() || opts.max_iterations == 0 || opts.tolerance.is_nan() || opts.tolerance <= 0.0 {
        return Err("increments, target, max_iterations and tolerance must be positive and finite".into());
    }

    let mut u = vec![0.0; n];
    let mut lambda = 0.0;
    let mut progress = start;
    let (mut f_int, k0) = assemble(model, &u).map_err(|f| f.message)?;
    model.commit();
    let fac0 = Factor::new(&k0, &free, n).map_err(|f| f.message)?;
    let mut det_sign = fac0.det_sign();
    let f_free: Vec<f64> = free.iter().map(|&d| model.reference_load()[d]).collect();
    let flexibility0 = dot(&f_free, &fac0.solve(&f_free).map_err(|f| f.message)?);
    let mut stiffness_parameter = 1.0;

    let full = (target - start) / increments as f64;
    let mut step = full;
    let mut cuts = 0;
    let mut steps = Vec::new();
    let mut total_iterations = 0;
    let mut termination = Termination::Completed;

    while (target - progress).abs() > 1e-12 * target.abs().max(full.abs()) {
        if control_dof.is_none() && stiffness_parameter < MIN_STIFFNESS_PARAMETER {
            termination = Termination::Stopped {
                reason: StopReason::LimitPoint,
                message: format!(
                    "at λ = {lambda} the stiffness in the direction of the load is {stiffness_parameter:.2e} of its initial value: a limit point, which load control cannot pass"
                ),
            };
            break;
        }
        let remaining = target - progress;
        let this = if step.abs() > remaining.abs() { remaining } else { step };
        let control = match control_dof {
            None => Control::Load(this),
            Some(c) => Control::Displacement { free_index: c, delta: this },
        };
        match attempt(model, &u, lambda, det_sign, &control, &free, opts) {
            Ok(conv) => {
                model.commit();
                total_iterations += conv.iterations;
                u = conv.u;
                lambda = conv.lambda;
                f_int = conv.f_int;
                det_sign = conv.det_sign;
                // Bergan's current stiffness parameter: (Fᵀ·K₀⁻¹·F) / (Fᵀ·K⁻¹·F).
                stiffness_parameter = if conv.load_flexibility != 0.0 { flexibility0 / conv.load_flexibility } else { f64::INFINITY };
                progress += this;
                steps.push(StepRecord { lambda, u: u.clone(), iterations: conv.iterations, tangent_det_sign: det_sign });
                cuts = 0;
                // Grow back toward the nominal step after a cut.
                if step.abs() < full.abs() {
                    step = (2.0 * step).clamp(-full.abs(), full.abs());
                }
            }
            Err(fail) => {
                model.revert();
                if cuts >= opts.max_cuts {
                    termination = Termination::Stopped { reason: fail.reason, message: fail.message };
                    break;
                }
                cuts += 1;
                step /= 2.0;
            }
        }
    }

    // The trial state of every element must be the committed one the
    // outcome reports.
    model.revert();
    let f_ref = model.reference_load();
    let reactions = (0..n).map(|d| if model.is_fixed(d) { f_int[d] - lambda * f_ref[d] } else { 0.0 }).collect();
    Ok(Outcome { termination, lambda, u, reactions, steps, total_iterations })
}
