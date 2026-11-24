use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};

const ENOUGH: f64 = 0.8;
const BACK: f64 = 4.0;
const FASTEST: f64 = 0.1;
const SMALLEST_RETRY: f64 = 1e-3;
const NEWTON: f64 = 1e-10;

/// Pseudo-transient continuation: every step solves the tangent plus `damping` times its own
/// diagonal, the implicit Euler step of a fictitious damped motion whose time step is the
/// inverse of the damping.
///
/// The time step follows the work the residual does on the step, as the line search does: a
/// step past the point of no work is undone and retried with `BACK` times the damping; one
/// that is taken divides the damping by how much of the work it used up, so the steps become
/// Newton's as the solution nears. The residual norm is not the control: it rises a
/// thousandfold on a good step of a slender frame.
pub(crate) struct PseudoTransient {
    /// The damping of an increment's first step, as a share of the tangent's diagonal.
    pub damping: f64,
}

impl Iteration for PseudoTransient {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut damping = self.damping;
        let mut at = budget.linearize(problem)?;
        loop {
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            if !budget.has_remaining() {
                return Ok(false);
            }
            if at.forced {
                let step = problem.correction(false)?;
                problem.advance(&step);
                at = budget.linearize(problem)?;
                continue;
            }
            let origin = problem.state();
            let step = problem.damped_correction(if damping < NEWTON { 0.0 } else { damping })?;
            let start_work = problem.work(&step);
            problem.advance(&step);
            let found = budget.linearize(problem)?;
            if found.measure < tolerance && !found.forced {
                return Ok(true);
            }
            let work = problem.work(&step);
            match after(damping, start_work, work, found.measure) {
                Some(next) => {
                    damping = next;
                    at = found;
                }
                None => {
                    damping = damping.max(SMALLEST_RETRY) * BACK;
                    problem.set_state(&origin);
                    if !budget.has_remaining() {
                        return Ok(false);
                    }
                    at = budget.linearize(problem)?;
                }
            }
        }
    }
}

/// The damping after a step whose residual did `start_work` on it before and `work` after;
/// `None` when the step went past the point of no work, or left the state non-finite, and has
/// to be undone. A step along which the residual did no positive work to begin with is taken.
pub(super) fn after(damping: f64, start_work: f64, work: f64, measure: f64) -> Option<f64> {
    if !(work.is_finite() && measure.is_finite()) {
        return None;
    }
    if !(start_work.is_finite() && start_work > 0.0) {
        return Some(damping);
    }
    if work < -ENOUGH * start_work {
        return None;
    }
    Some(damping * (work.abs() / start_work).clamp(FASTEST, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_step_that_used_up_its_work_lowers_the_damping_by_what_was_left() {
        assert_eq!(after(1.0, 2.0, 1.0, 5.0), Some(0.5));
        assert_eq!(after(1.0, 2.0, -1.0, 5.0), Some(0.5));
        assert_eq!(after(1.0, 2.0, 2.0, 5.0), Some(1.0));
        assert_eq!(after(1.0, 2.0, 3.0, 5.0), Some(1.0));
        assert_eq!(after(1.0, 2.0, 0.0, 5.0), Some(FASTEST));
        assert_eq!(after(1.0, 2.0, 1e-9, 5.0), Some(FASTEST));
    }

    #[test]
    fn a_step_past_the_point_of_no_work_or_into_a_non_finite_state_is_undone() {
        assert_eq!(after(1.0, 2.0, -1.6, 5.0), Some(0.8));
        assert_eq!(after(1.0, 2.0, -1.7, 5.0), None);
        assert_eq!(after(1.0, 2.0, f64::NAN, 5.0), None);
        assert_eq!(after(1.0, 2.0, f64::INFINITY, 5.0), None);
        assert_eq!(after(1.0, 2.0, 1.0, f64::NAN), None);
        assert_eq!(after(1.0, 2.0, 1.0, f64::INFINITY), None);
    }

    #[test]
    fn a_step_the_residual_did_no_work_on_is_taken_at_the_same_damping() {
        for start_work in [0.0, -3.0, f64::NAN, f64::INFINITY] {
            assert_eq!(after(0.25, start_work, -100.0, 5.0), Some(0.25));
        }
    }
}
