use super::incremental::{
    IncrementalProblem, Iteration, IterationBudget, IterationError, Linearization,
};

const ENOUGH: f64 = 0.8;
const MAX_TRIALS: usize = 6;

pub(crate) struct NewtonLineSearch;

impl Iteration for NewtonLineSearch {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut at = budget.linearize(problem)?;
        loop {
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            if !budget.has_remaining() {
                return Ok(false);
            }
            let step = problem.correction(false)?;
            let start_work = problem.work(&step);
            if at.forced {
                problem.advance(&step);
                at = budget.linearize(problem)?;
                continue;
            }
            let origin = problem.state();
            let trial = |problem: &mut P,
                         alpha: f64,
                         budget: &mut IterationBudget<'_>|
             -> Result<(Linearization, f64), IterationError> {
                let state: Vec<f64> = origin
                    .iter()
                    .zip(&step)
                    .map(|(x, d)| x + alpha * d)
                    .collect();
                problem.set_state(&state);
                let found = budget.linearize(problem)?;
                let work = problem.work(&step);
                Ok((found, work))
            };
            let (mut found, mut work) = trial(problem, 1.0, budget)?;
            if found.measure < tolerance && !found.forced {
                return Ok(true);
            }
            let searching = start_work.is_finite() && start_work > 0.0;
            if searching {
                let (mut low, mut low_work, mut high, mut high_work) = (0.0, start_work, 1.0, work);
                for _ in 1..MAX_TRIALS {
                    let overshot = !high_work.is_finite() || high_work < -ENOUGH * start_work;
                    if !overshot || !budget.has_remaining() {
                        break;
                    }
                    let beyond = if high_work.is_finite() {
                        high_work
                    } else {
                        -start_work
                    };
                    let secant = low + (high - low) * low_work / (low_work - beyond);
                    let alpha = secant.clamp(low + 0.1 * (high - low), high - 0.1 * (high - low));
                    (found, work) = trial(problem, alpha, budget)?;
                    if found.measure < tolerance && !found.forced {
                        return Ok(true);
                    }
                    if work.is_finite() && work.abs() <= ENOUGH * start_work {
                        break;
                    }
                    if work.is_finite() && work > 0.0 {
                        low = alpha;
                        low_work = work;
                    } else {
                        high = alpha;
                        high_work = work;
                    }
                }
                let lost = !(work.is_finite() && found.measure.is_finite());
                let past = lost || work < -ENOUGH * start_work;
                if past && (low > 0.0 || lost) && budget.has_remaining() {
                    (found, work) =
                        trial(problem, if low > 0.0 { low } else { 0.1 * high }, budget)?;
                    if found.measure < tolerance && !found.forced {
                        return Ok(true);
                    }
                }
            }
            if !found.measure.is_finite() || (searching && !work.is_finite()) {
                problem.set_state(&origin);
                return Ok(false);
            }
            at = found;
        }
    }
}
