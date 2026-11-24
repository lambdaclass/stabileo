use super::incremental::{IncrementalProblem, Iteration, IterationBudget, IterationError};

pub(crate) struct Anderson {
    pub depth: usize,
    pub lag_tangent: bool,
}

impl Iteration for Anderson {
    fn iterate<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        budget: &mut IterationBudget<'_>,
    ) -> Result<bool, IterationError> {
        let mut previous: Option<(Vec<f64>, Vec<f64>)> = None;
        let mut history: Vec<(Vec<f64>, Vec<f64>)> = Vec::new();
        while budget.has_remaining() {
            let at = budget.linearize(problem)?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            let correction = problem.correction(self.lag_tangent)?;
            if at.forced {
                problem.advance(&correction);
                previous = None;
                history.clear();
                continue;
            }
            let state = problem.state();
            if let Some((last_state, last_correction)) = previous.take() {
                if history.len() == self.depth && !history.is_empty() {
                    history.remove(0);
                }
                if self.depth > 0 {
                    history.push((
                        state.iter().zip(&last_state).map(|(a, b)| a - b).collect(),
                        correction
                            .iter()
                            .zip(&last_correction)
                            .map(|(a, b)| a - b)
                            .collect(),
                    ));
                }
            }
            let next = match mixed(&state, &correction, &history) {
                Some(next) => next,
                None => {
                    history.clear();
                    state.iter().zip(&correction).map(|(x, f)| x + f).collect()
                }
            };
            problem.set_state(&next);
            previous = Some((state, correction));
        }
        Ok(false)
    }
}

const LONGEST_MIX: f64 = 1e3;
pub(crate) const MAX_ANDERSON_DEPTH: usize = 50;

pub(super) fn mixed(
    state: &[f64],
    correction: &[f64],
    history: &[(Vec<f64>, Vec<f64>)],
) -> Option<Vec<f64>> {
    let differences: Vec<&[f64]> = history.iter().map(|(_, df)| df.as_slice()).collect();
    let weights = least_squares(&differences, correction)?;
    let mut step = correction.to_vec();
    for (weight, (dx, df)) in weights.iter().zip(history) {
        for ((value, a), b) in step.iter_mut().zip(dx).zip(df) {
            *value -= weight * (a + b);
        }
    }
    let longest = |v: &[f64]| v.iter().fold(0.0f64, |m, x| m.max(x.abs()));
    if step.iter().any(|v| !v.is_finite()) || longest(&step) > LONGEST_MIX * longest(correction) {
        return None;
    }
    Some(state.iter().zip(&step).map(|(x, d)| x + d).collect())
}

pub(super) fn least_squares(columns: &[&[f64]], target: &[f64]) -> Option<Vec<f64>> {
    let m = columns.len();
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let mut a: Vec<Vec<f64>> = (0..m)
        .map(|i| (0..m).map(|j| dot(columns[i], columns[j])).collect())
        .collect();
    let mut b: Vec<f64> = (0..m).map(|i| dot(columns[i], target)).collect();
    let scale = (0..m).fold(0.0f64, |largest, i| largest.max(a[i][i]));
    for k in 0..m {
        let pivot = (k..m).fold(k, |best, i| {
            if a[i][k].abs() > a[best][k].abs() {
                i
            } else {
                best
            }
        });
        if !a[pivot][k].is_finite() || a[pivot][k].abs() <= 1e-12 * scale {
            return None;
        }
        a.swap(k, pivot);
        b.swap(k, pivot);
        for i in k + 1..m {
            let factor = a[i][k] / a[k][k];
            for j in k..m {
                a[i][j] -= factor * a[k][j];
            }
            b[i] -= factor * b[k];
        }
    }
    let mut weights = vec![0.0; m];
    for k in (0..m).rev() {
        let known: f64 = (k + 1..m).map(|j| a[k][j] * weights[j]).sum();
        weights[k] = (b[k] - known) / a[k][k];
    }
    Some(weights)
}
