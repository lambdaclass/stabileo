use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};

pub(crate) const MAX_BROYDEN_MEMORY: usize = 50;
const LONGEST_STEP: f64 = 1e3;

/// Broyden's method on the corrections of modified Newton, in Kelley's limited-memory form
/// ("Iterative Methods for Linear and Nonlinear Equations", algorithm brsol): the tangent of
/// the increment's first iteration is the initial Jacobian, and each step taken corrects it by
/// a rank-one secant update, kept as the steps themselves. After `memory` updates it starts
/// again from the lagged tangent.
pub(crate) struct Broyden {
    pub memory: usize,
}

impl Iteration for Broyden {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut steps: Vec<Vec<f64>> = Vec::new();
        while budget.has_remaining() {
            let at = budget.linearize(problem)?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            let correction = problem.correction(true)?;
            if at.forced {
                problem.advance(&correction);
                steps.clear();
                continue;
            }
            if steps.len() > self.memory {
                steps.clear();
            }
            let step = match updated(&correction, &steps) {
                Some(step) => step,
                None => {
                    steps.clear();
                    correction
                }
            };
            let state = problem.state();
            let next: Vec<f64> = state.iter().zip(&step).map(|(x, s)| x + s).collect();
            problem.set_state(&next);
            steps.push(step);
        }
        Ok(false)
    }
}

/// The step Broyden's updated Jacobian gives for `correction`, the step of the lagged tangent.
/// `None` when the last secant denominator vanishes, or the step is non-finite or more than
/// `LONGEST_STEP` times the correction.
pub(super) fn updated(correction: &[f64], steps: &[Vec<f64>]) -> Option<Vec<f64>> {
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let Some((last, earlier)) = steps.split_last() else {
        return Some(correction.to_vec());
    };
    let mut z = correction.to_vec();
    for (taken, followed) in earlier.iter().zip(&steps[1..]) {
        let weight = dot(taken, &z) / dot(taken, taken);
        z.iter_mut()
            .zip(followed)
            .for_each(|(value, s)| *value += weight * s);
    }
    let denominator = 1.0 - dot(last, &z) / dot(last, last);
    let step: Vec<f64> = z.iter().map(|value| value / denominator).collect();
    let longest = |v: &[f64]| v.iter().fold(0.0f64, |m, x| m.max(x.abs()));
    if step.iter().any(|v| !v.is_finite()) || longest(&step) > LONGEST_STEP * longest(correction) {
        return None;
    }
    Some(step)
}
