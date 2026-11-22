use crate::solver::adaptive_stepping::{AdaptiveStepper, StepAction};

use super::incremental::{IncrementalProblem, Iteration, Outcome};

const FULL_LOAD_SLACK: f64 = 1e-12;

pub(crate) fn solve_by_adaptive_increments<P: IncrementalProblem + ?Sized, I: Iteration>(
    problem: &mut P,
    iteration: &I,
    n_increments: usize,
    tolerance: f64,
    max_iter: usize,
) -> Result<Outcome, String> {
    let mut outcome = Outcome {
        iterations: 0,
        converged: true,
        load_factor: 0.0,
        increments: 0,
    };
    if n_increments == 0 {
        return Ok(outcome);
    }
    let mut stepper = AdaptiveStepper::from_n_increments(n_increments);
    while let Some(target) = stepper.next_increment() {
        let load_factor = if target >= 1.0 - FULL_LOAD_SLACK {
            1.0
        } else {
            target
        };
        problem.begin_increment(load_factor);
        let before = outcome.iterations;
        let attempt = iteration.converge(problem, tolerance, max_iter, &mut outcome.iterations);
        let converged = attempt == Ok(true);
        if converged {
            problem.commit()?;
            outcome.load_factor = load_factor;
            outcome.increments += 1;
        } else {
            problem.rollback();
        }
        if stepper.report_convergence(converged, outcome.iterations - before) == StepAction::Abort {
            attempt?;
            outcome.converged = false;
            break;
        }
    }
    outcome.converged = outcome.converged && outcome.load_factor == 1.0;
    Ok(outcome)
}
