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
                    problem.set_state(&origin);
                    if !budget.has_remaining() {
                        return Ok(false);
                    }
                    damping = damping.max(SMALLEST_RETRY) * BACK;
                    if !damping.is_finite() {
                        return Err(IterationError::Problem(
                            "Pseudo-transient retry damping exceeds the finite range".into(),
                        ));
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
    fn an_overflowing_retry_restores_the_trial_without_asking_for_an_infinite_damping() {
        // A rejected trial, independent of matrix scaling, isolates the retry controller.
        struct RejectedTrial { state: f64, requested: Vec<f64> }
        impl IncrementalProblem for RejectedTrial {
            fn begin_increment(&mut self, _: f64) { unreachable!() }
            fn linearize(&mut self) -> Result<super::super::incremental::Linearization, String> {
                Ok(super::super::incremental::Linearization { measure: 1.0, forced: false })
            }
            fn correction(&mut self, _: bool) -> Result<Vec<f64>, String> { unreachable!() }
            fn damped_correction(&mut self, damping: f64) -> Result<Vec<f64>, String> {
                assert!(damping.is_finite());
                self.requested.push(damping);
                Ok(vec![1.0])
            }
            fn advance(&mut self, step: &[f64]) { self.state += step[0]; }
            fn state(&self) -> Vec<f64> { vec![self.state] }
            fn work(&self, _: &[f64]) -> f64 { if self.state == 0.0 { 1.0 } else { -2.0 } }
            fn set_state(&mut self, state: &[f64]) { self.state = state[0]; }
            fn residual(&self) -> Vec<f64> { unreachable!() }
            fn tangent_times(&self, _: &[f64]) -> Vec<f64> { unreachable!() }
            fn lagged_solve(&self, _: &[f64]) -> Option<Vec<f64>> { unreachable!() }
            fn expand(&self, _: &[f64]) -> Vec<f64> { unreachable!() }
            fn commit(&mut self) -> Result<(), String> { unreachable!() }
            fn rollback(&mut self) { unreachable!() }
        }
        for limit in [2, 10] {
            let mut problem = RejectedTrial { state: 0.0, requested: Vec::new() };
            let mut spent = 0;
            let outcome = PseudoTransient { damping: f64::MAX }.converge(&mut problem, 1e-8, limit, &mut spent);
            if limit == 2 {
                assert_eq!(outcome, Ok(false));
            } else {
                assert_eq!(outcome, Err(IterationError::Problem(
                    "Pseudo-transient retry damping exceeds the finite range".into(),
                )));
            }
            assert_eq!(problem.state, 0.0);
            assert_eq!(problem.requested, vec![f64::MAX]);
            assert_eq!(spent, 2);
        }
    }

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
