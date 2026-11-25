use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};

const INITIAL_FORCING: f64 = 0.1;
const MAX_FORCING: f64 = 0.5;
const MAX_INNER: usize = 50;

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
    let eta = (current - previous.linear).abs() / previous.nonlinear;
    if eta.is_finite() {
        eta.min(MAX_FORCING)
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
        while budget.has_remaining() {
            let at = budget.linearize(problem)?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            let nonlinear = norm(&problem.residual());
            let (step, next) = if at.forced {
                (problem.correction(true)?, None)
            } else {
                match inexact(problem, forcing(previous, nonlinear)) {
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
                    Inexact::NoFactor => (
                        problem.correction(true)?,
                        Some(ResidualHistory {
                            nonlinear,
                            linear: 0.0,
                        }),
                    ),
                    Inexact::BrokeDown => (
                        problem.correction(false)?,
                        Some(ResidualHistory {
                            nonlinear,
                            linear: 0.0,
                        }),
                    ),
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
pub(super) fn inexact<P: IncrementalProblem + ?Sized>(problem: &P, forcing: f64) -> Inexact {
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let mut r = problem.residual();
    let Some(mut z) = problem.lagged_solve(&r) else {
        return Inexact::NoFactor;
    };
    let target = forcing * dot(&r, &r).sqrt();
    let mut rz = dot(&r, &z);
    if !(rz.is_finite() && rz > 0.0) {
        return Inexact::BrokeDown;
    }
    let mut x = vec![0.0; r.len()];
    let mut p = z.clone();
    for _ in 0..MAX_INNER {
        let ap = problem.tangent_times(&p);
        let pap = dot(&p, &ap);
        if !(pap.is_finite() && pap > 0.0) {
            return Inexact::BrokeDown;
        }
        let alpha = rz / pap;
        for ((xi, ri), (pi, api)) in x.iter_mut().zip(r.iter_mut()).zip(p.iter().zip(&ap)) {
            *xi += alpha * pi;
            *ri -= alpha * api;
        }
        let remaining = dot(&r, &r).sqrt();
        if !remaining.is_finite() {
            return Inexact::BrokeDown;
        }
        if remaining <= target {
            return Inexact::Step {
                step: problem.expand(&x),
                linear_residual: remaining,
            };
        }
        z = match problem.lagged_solve(&r) {
            Some(z) => z,
            None => return Inexact::BrokeDown,
        };
        let next = dot(&r, &z);
        if !(next.is_finite() && next > 0.0) {
            return Inexact::BrokeDown;
        }
        let beta = next / rz;
        rz = next;
        for (pi, zi) in p.iter_mut().zip(&z) {
            *pi = zi + beta * *pi;
        }
    }
    Inexact::BrokeDown
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!((forcing(Some(exact), 0.001) - 0.0001).abs() < 1e-12);
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
    }
}
