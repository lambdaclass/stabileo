use super::incremental::{IncrementalProblem, Iteration, IterationError, Outcome};

const FULL_LOAD_SLACK: f64 = 1e-12;
/// An increment that converges within this many linearizations doubles the next; one that takes
/// more than twice as many halves it.
const EASY: usize = 8;
const SMALLEST: f64 = 0.01;
const LARGEST: f64 = 4.0;

/// The size of the load increments, from how the last one went. Sizes are fractions of the
/// full load, between `SMALLEST` and `LARGEST` times the first.
pub(super) struct Steps {
    reached: f64,
    size: f64,
    smallest: f64,
    largest: f64,
}

impl Steps {
    pub(super) fn from_n_increments(n_increments: usize) -> Self {
        let first = 1.0 / n_increments as f64;
        Steps {
            reached: 0.0,
            size: first,
            smallest: SMALLEST * first,
            largest: LARGEST * first,
        }
    }

    /// The load factor the next increment ends at; `None` at the full load.
    pub(super) fn next(&self) -> Option<f64> {
        if self.reached >= 1.0 {
            return None;
        }
        let target = self.reached + self.size;
        Some(if target >= 1.0 - FULL_LOAD_SLACK { 1.0 } else { target })
    }

    /// The increment to `target` converged in `linearizations`.
    pub(super) fn converged(&mut self, target: f64, linearizations: usize) {
        self.reached = target;
        if linearizations <= EASY {
            self.size = (2.0 * self.size).min(self.largest);
        } else if linearizations > 2 * EASY {
            self.size = (0.5 * self.size).max(self.smallest);
        }
    }

    /// The increment did not converge: `false` when no smaller one is allowed.
    pub(super) fn failed(&mut self) -> bool {
        self.size *= 0.5;
        self.size >= self.smallest
    }
}

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
    let mut steps = Steps::from_n_increments(n_increments);
    while let Some(load_factor) = steps.next() {
        problem.begin_increment(load_factor);
        let before = outcome.iterations;
        let attempt = iteration.converge(problem, tolerance, max_iter, &mut outcome.iterations);
        if matches!(attempt, Err(IterationError::CountOverflow)) {
            problem.rollback();
            return Err(IterationError::CountOverflow.into());
        }
        if attempt == Ok(true) {
            problem.commit()?;
            outcome.load_factor = load_factor;
            outcome.increments += 1;
            steps.converged(load_factor, outcome.iterations - before);
            continue;
        }
        problem.rollback();
        if !steps.failed() {
            attempt?;
            outcome.converged = false;
            break;
        }
    }
    outcome.converged = outcome.converged && outcome.load_factor == 1.0;
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn taken(n_increments: usize, linearizations: &dyn Fn(usize) -> Option<usize>) -> Vec<f64> {
        let mut steps = Steps::from_n_increments(n_increments);
        let (mut targets, mut attempt) = (Vec::new(), 0);
        while let Some(target) = steps.next() {
            attempt += 1;
            match linearizations(attempt) {
                Some(spent) => {
                    targets.push(target);
                    steps.converged(target, spent);
                }
                None => {
                    if !steps.failed() {
                        break;
                    }
                }
            }
            assert!(attempt < 10_000);
        }
        targets
    }

    #[test]
    fn increments_that_converge_easily_double_up_to_four_times_the_first() {
        let targets = taken(16, &|_| Some(EASY));
        let sizes: Vec<f64> = std::iter::once(0.0).chain(targets.iter().copied()).collect::<Vec<_>>()
            .windows(2).map(|pair| pair[1] - pair[0]).collect();
        assert_eq!(sizes[..3], [1.0 / 16.0, 2.0 / 16.0, 4.0 / 16.0]);
        assert!(sizes.iter().all(|size| *size <= 4.0 / 16.0 + 1e-15));
        assert_eq!(*targets.last().unwrap(), 1.0);
        assert!(targets.len() < 8, "{targets:?}");
    }

    #[test]
    fn an_ordinary_increment_keeps_the_size_and_a_hard_one_halves_it() {
        let ordinary = taken(4, &|_| Some(EASY + 1));
        assert_eq!(ordinary, vec![0.25, 0.5, 0.75, 1.0]);
        let still_ordinary = taken(4, &|_| Some(2 * EASY));
        assert_eq!(still_ordinary, vec![0.25, 0.5, 0.75, 1.0]);
        let hard = taken(4, &|_| Some(2 * EASY + 1));
        assert_eq!(hard[..3], [0.25, 0.375, 0.4375]);
        assert_eq!(*hard.last().unwrap(), 1.0);
        let before_the_last = &hard[..hard.len() - 1];
        let smallest = before_the_last.windows(2).map(|pair| pair[1] - pair[0]).fold(f64::MAX, f64::min);
        assert!(smallest >= SMALLEST * 0.25 * (1.0 - 1e-9), "{smallest}");
    }

    #[test]
    fn an_increment_that_fails_is_retried_at_half_from_where_the_last_one_ended() {
        let targets = taken(4, &|attempt| (attempt != 2).then_some(EASY + 1));
        assert_eq!(targets[..3], [0.25, 0.375, 0.5]);
        assert_eq!(*targets.last().unwrap(), 1.0);
    }

    #[test]
    fn increments_that_always_fail_stop_at_a_hundredth_of_the_first() {
        let mut steps = Steps::from_n_increments(4);
        let mut halvings = 0;
        while steps.failed() {
            halvings += 1;
            assert!(steps.next().unwrap() >= SMALLEST * 0.25);
        }
        assert_eq!(halvings, 6);
        assert!(taken(4, &|_| None).is_empty());
    }

    #[test]
    fn the_last_increment_ends_exactly_at_the_full_load() {
        for n_increments in [1, 3, 6, 7, 10, 13, 49] {
            for spent in [1, EASY + 1, 2 * EASY + 1] {
                let targets = taken(n_increments, &|_| Some(spent));
                assert_eq!(*targets.last().unwrap(), 1.0, "{n_increments} increments, {spent} linearizations");
                assert!(targets.windows(2).all(|pair| pair[1] > pair[0]));
            }
        }
    }
}
