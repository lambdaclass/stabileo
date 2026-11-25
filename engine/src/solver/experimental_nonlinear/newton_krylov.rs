use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};
use super::KrylovWork;

const INITIAL_FORCING: f64 = 0.1;
// Keep the former fixed inner tolerance as a floor. The outer convergence test is unchanged.
const MIN_FORCING: f64 = 1e-3;
const MAX_FORCING: f64 = 0.5;
const MAX_INNER: usize = 50;

#[derive(Default)]
pub(crate) struct TangentWorkspace {
    pub expanded: Vec<f64>,
    pub product: Vec<f64>,
}

#[derive(Default)]
struct Workspace {
    r: Vec<f64>,
    z: Vec<f64>,
    x: Vec<f64>,
    p: Vec<f64>,
    ap: Vec<f64>,
    tangent: TangentWorkspace,
    preconditioner: Vec<f64>,
}

/// Inexact Newton: the Newton equation of every iteration is solved by conjugate gradients on
/// the current tangent, preconditioned by the tangent the increment factorized first. The
/// tangent is applied, never factorized again, so an increment costs one factorization and
/// converges at close to Newton's rate.
///
/// The exact solve takes over for an iteration when there is no factor to precondition with,
/// when a correction is forced, and when conjugate gradients break down, which is what an
/// indefinite tangent does to them.
pub(crate) struct NewtonKrylov;

#[derive(Clone, Copy)]
struct ResidualHistory {
    nonlinear: f64,
    linear: f64,
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

fn forcing(previous: Option<ResidualHistory>, current: f64) -> f64 {
    let Some(previous) = previous else {
        return INITIAL_FORCING;
    };
    if !(previous.nonlinear.is_finite()
        && previous.nonlinear > 0.0
        && previous.linear.is_finite()
        && previous.linear >= 0.0
        && current.is_finite()
        && current >= 0.0)
    {
        return INITIAL_FORCING;
    }
    let eta = (current - previous.linear).abs() / previous.nonlinear;
    if eta.is_finite() {
        eta.clamp(MIN_FORCING, MAX_FORCING)
    } else {
        INITIAL_FORCING
    }
}

impl Iteration for NewtonKrylov {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut previous = None;
        let mut workspace = Workspace::default();
        while budget.has_remaining() {
            let at = budget.linearize(problem)?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            let (step, next) = if at.forced {
                problem.record_krylov(&KrylovWork {
                    forced_steps: 1,
                    ..Default::default()
                });
                (problem.correction(true)?, None)
            } else {
                problem.residual_into(&mut workspace.r);
                let nonlinear = norm(&workspace.r);
                let mut work = KrylovWork::default();
                let result = inexact_workspace(
                    problem,
                    forcing(previous, nonlinear),
                    &mut workspace,
                    &mut work,
                );
                problem.record_krylov(&work);
                match result {
                    Inexact::Step {
                        step,
                        linear_residual,
                    } => (
                        step,
                        Some(ResidualHistory {
                            nonlinear,
                            linear: linear_residual,
                        }),
                    ),
                    // Direct corrections do not report a measured linear residual.
                    Inexact::NoFactor => (problem.correction(true)?, None),
                    Inexact::BrokeDown => (problem.correction(false)?, None),
                }
            };
            problem.advance(&step);
            previous = next;
        }
        Ok(false)
    }
}

pub(super) enum Inexact {
    Step {
        step: Vec<f64>,
        linear_residual: f64,
    },
    NoFactor,
    BrokeDown,
}

/// Preconditioned conjugate gradients on K·x = r from x = 0, until the residual of that
/// equation is `forcing` of r.
#[cfg(test)]
pub(super) fn inexact<P: IncrementalProblem + ?Sized>(problem: &P, forcing: f64) -> Inexact {
    let mut workspace = Workspace::default();
    problem.residual_into(&mut workspace.r);
    inexact_workspace(problem, forcing, &mut workspace, &mut KrylovWork::default())
}

fn inexact_workspace<P: IncrementalProblem + ?Sized>(
    problem: &P,
    forcing: f64,
    workspace: &mut Workspace,
    work: &mut KrylovWork,
) -> Inexact {
    work.attempts = work.attempts.saturating_add(1);
    let Workspace {
        r,
        z,
        x,
        p,
        ap,
        tangent,
        preconditioner,
    } = workspace;
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    work.preconditioner_solves = work.preconditioner_solves.saturating_add(1);
    if !problem.lagged_solve_into(r, z, preconditioner) {
        work.no_factor = work.no_factor.saturating_add(1);
        return Inexact::NoFactor;
    }
    let target = forcing * dot(&r, &r).sqrt();
    if !(target.is_finite() && target > 0.0) {
        work.invalid_target = work.invalid_target.saturating_add(1);
        return Inexact::BrokeDown;
    }
    let mut rz = dot(&r, &z);
    if !(rz.is_finite() && rz > 0.0) {
        work.invalid_preconditioned_residual =
            work.invalid_preconditioned_residual.saturating_add(1);
        return Inexact::BrokeDown;
    }
    x.resize(r.len(), 0.0);
    x.fill(0.0);
    p.clone_from(z);
    for _ in 0..MAX_INNER {
        work.iterations = work.iterations.saturating_add(1);
        work.tangent_products = work.tangent_products.saturating_add(1);
        problem.tangent_times_into(p, ap, tangent);
        let pap = dot(&p, &ap);
        if !(pap.is_finite() && pap > 0.0) {
            work.invalid_curvature = work.invalid_curvature.saturating_add(1);
            return Inexact::BrokeDown;
        }
        let alpha = rz / pap;
        for ((xi, ri), (pi, api)) in x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(ap.iter())) {
            *xi += alpha * pi;
            *ri -= alpha * api;
        }
        let remaining = dot(&r, &r).sqrt();
        if !remaining.is_finite() {
            work.nonfinite_residual = work.nonfinite_residual.saturating_add(1);
            return Inexact::BrokeDown;
        }
        if remaining <= target {
            work.accepted_steps = work.accepted_steps.saturating_add(1);
            return Inexact::Step {
                step: problem.expand(&x),
                linear_residual: remaining,
            };
        }
        work.preconditioner_solves = work.preconditioner_solves.saturating_add(1);
        if !problem.lagged_solve_into(r, z, preconditioner) {
            work.lost_preconditioner = work.lost_preconditioner.saturating_add(1);
            return Inexact::BrokeDown;
        }
        let next = dot(&r, &z);
        if !(next.is_finite() && next > 0.0) {
            work.invalid_preconditioned_residual =
                work.invalid_preconditioned_residual.saturating_add(1);
            return Inexact::BrokeDown;
        }
        let beta = next / rz;
        rz = next;
        for (pi, zi) in p.iter_mut().zip(z.iter()) {
            *pi = zi + beta * *pi;
        }
    }
    work.iteration_limit = work.iteration_limit.saturating_add(1);
    Inexact::BrokeDown
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Diagonal {
        diagonal: Vec<f64>,
        rhs: Vec<f64>,
        preconditioner_sign: f64,
        available: usize,
        solves: std::cell::Cell<usize>,
    }

    impl Diagonal {
        fn new(diagonal: Vec<f64>) -> Self {
            Self {
                rhs: vec![1.0; diagonal.len()],
                diagonal,
                preconditioner_sign: 1.0,
                available: usize::MAX,
                solves: Default::default(),
            }
        }
    }

    impl IncrementalProblem for Diagonal {
        fn residual(&self) -> Vec<f64> {
            self.rhs.clone()
        }
        fn tangent_times(&self, v: &[f64]) -> Vec<f64> {
            v.iter().zip(&self.diagonal).map(|(v, d)| v * d).collect()
        }
        fn lagged_solve(&self, rhs: &[f64]) -> Option<Vec<f64>> {
            let calls = self.solves.get();
            self.solves.set(calls + 1);
            (calls < self.available)
                .then(|| rhs.iter().map(|v| v * self.preconditioner_sign).collect())
        }
        fn expand(&self, v: &[f64]) -> Vec<f64> {
            v.to_vec()
        }
        fn begin_increment(&mut self, _: f64) {
            unreachable!()
        }
        fn linearize(&mut self) -> Result<super::super::incremental::Linearization, String> {
            unreachable!()
        }
        fn correction(&mut self, _: bool) -> Result<Vec<f64>, String> {
            unreachable!()
        }
        fn advance(&mut self, _: &[f64]) {
            unreachable!()
        }
        fn state(&self) -> Vec<f64> {
            unreachable!()
        }
        fn work(&self, _: &[f64]) -> f64 {
            unreachable!()
        }
        fn set_state(&mut self, _: &[f64]) {
            unreachable!()
        }
        fn commit(&mut self) -> Result<(), String> {
            unreachable!()
        }
        fn rollback(&mut self) {
            unreachable!()
        }
    }

    fn measured(problem: &Diagonal, eta: f64) -> (Inexact, KrylovWork) {
        let mut workspace = Workspace {
            r: problem.residual(),
            ..Default::default()
        };
        let mut work = KrylovWork::default();
        let result = inexact_workspace(problem, eta, &mut workspace, &mut work);
        assert_eq!(work.preconditioner_solves as usize, problem.solves.get());
        assert_eq!(work.iterations, work.tangent_products);
        (result, work)
    }

    #[test]
    fn work_counts_distinguish_each_guard_and_the_iteration_limit() {
        let mut missing = Diagonal::new(vec![1.0]);
        missing.available = 0;
        let (result, work) = measured(&missing, 1e-3);
        assert!(matches!(result, Inexact::NoFactor));
        assert_eq!(work.no_factor, 1);
        for eta in [0.0, -1.0, f64::INFINITY, f64::NAN] {
            let (result, work) = measured(&Diagonal::new(vec![1.0]), eta);
            assert!(matches!(result, Inexact::BrokeDown));
            assert_eq!((work.invalid_target, work.iterations), (1, 0));
        }
        let mut bad = Diagonal::new(vec![1.0]);
        bad.preconditioner_sign = -1.0;
        let (_, work) = measured(&bad, 1e-3);
        assert_eq!(work.invalid_preconditioned_residual, 1);
        for value in [-1.0, f64::NAN, f64::INFINITY] {
            let (_, work) = measured(&Diagonal::new(vec![value]), 1e-3);
            assert_eq!(work.invalid_curvature, 1);
        }
        let (_, work) = measured(&Diagonal::new(vec![1e-320]), 1e-3);
        assert_eq!(work.nonfinite_residual, 1);
        let mut lost = Diagonal::new(vec![1.0, 2.0]);
        lost.available = 1;
        let (_, work) = measured(&lost, 1e-3);
        assert_eq!(work.lost_preconditioner, 1);
        let many = Diagonal::new((1..=100).map(|i| (i * i) as f64).collect());
        let (result, work) = measured(&many, 1e-16);
        assert!(matches!(result, Inexact::BrokeDown));
        assert_eq!(
            (work.iteration_limit, work.iterations),
            (1, MAX_INNER as u64)
        );
        let (result, work) = measured(&Diagonal::new(vec![1.0, 2.0, 4.0]), 1e-10);
        let Inexact::Step { step, .. } = result else {
            panic!("SPD solve failed")
        };
        for (got, want) in step.iter().zip([1.0, 0.5, 0.25]) {
            assert!((got - want).abs() < 1e-12);
        }
        assert_eq!(
            (work.attempts, work.accepted_steps, work.iterations),
            (1, 1, 3)
        );
    }

    #[test]
    fn choice_one_uses_the_nonlinear_and_linear_residuals() {
        assert_eq!(forcing(None, 100.0), INITIAL_FORCING);
        let previous = ResidualHistory {
            nonlinear: 10.0,
            linear: 0.5,
        };
        assert!((forcing(Some(previous), 2.0) - 0.15).abs() < 1e-12);
        let exact = ResidualHistory {
            nonlinear: 10.0,
            linear: 0.0,
        };
        assert!((forcing(Some(exact), 0.1) - 0.01).abs() < 1e-12);
        assert_eq!(forcing(Some(exact), 0.001), MIN_FORCING);
    }

    #[test]
    fn choice_one_is_capped_and_refuses_nonfinite_history() {
        let previous = ResidualHistory {
            nonlinear: 1.0,
            linear: 0.0,
        };
        assert_eq!(forcing(Some(previous), 100.0), MAX_FORCING);
        for current in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(forcing(Some(previous), current), INITIAL_FORCING);
        }
        let zero = ResidualHistory {
            nonlinear: 0.0,
            linear: 0.0,
        };
        assert_eq!(forcing(Some(zero), 0.0), INITIAL_FORCING);
        for nonlinear in [f64::NAN, f64::INFINITY, -1.0] {
            assert_eq!(
                forcing(
                    Some(ResidualHistory {
                        nonlinear,
                        linear: 0.0
                    }),
                    1.0
                ),
                INITIAL_FORCING
            );
        }
        for linear in [f64::NAN, f64::INFINITY, -1.0] {
            assert_eq!(
                forcing(
                    Some(ResidualHistory {
                        nonlinear: 1.0,
                        linear
                    }),
                    1.0
                ),
                INITIAL_FORCING
            );
        }
    }

    #[test]
    fn agreement_with_the_linear_model_does_not_request_an_exact_inner_solve() {
        let previous = ResidualHistory {
            nonlinear: 1.0,
            linear: 0.1,
        };
        for current in [0.1, 0.1 + f64::EPSILON, 0.1 - f64::EPSILON] {
            assert_eq!(forcing(Some(previous), current), 1e-3);
        }
        let previous = ResidualHistory {
            nonlinear: 1.0,
            linear: 0.0,
        };
        assert_eq!(forcing(Some(previous), f64::MIN_POSITIVE), 1e-3);
    }
}
