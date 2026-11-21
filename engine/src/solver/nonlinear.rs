//! The incremental-iterative driver the nonlinear analyses share. An analysis describes itself as
//! an [`IncrementalProblem`]; how its increments are converged is an [`Iteration`], of which
//! [`Newton`] is the first.

pub(crate) struct Linearization {
    /// What the analysis compares with its tolerance.
    pub measure: f64,
    /// A correction is owed whatever the measure says (a support step not yet applied).
    pub forced: bool,
}

pub(crate) trait IncrementalProblem {
    /// Set the loads and prescribed motion of the increment that ends at `load_factor`.
    fn begin_increment(&mut self, load_factor: f64);
    /// Residual and tangent at the current state.
    fn linearize(&mut self) -> Result<Linearization, String>;
    /// Apply the correction of the last linearization. With `lag_tangent` the problem may answer
    /// with the tangent it factorized first in this increment.
    fn correct(&mut self, lag_tangent: bool) -> Result<(), String>;
    /// The current state converged: it is the one to return to.
    fn commit(&mut self);
    /// Return to the last committed state.
    fn rollback(&mut self);
}

pub(crate) trait Iteration {
    /// Bring the increment the problem has begun to `tolerance`, adding the linearizations made
    /// to `spent`. `Ok(false)` when `max_iter` of them were not enough.
    fn converge<P: IncrementalProblem + ?Sized>(&self, problem: &mut P, tolerance: f64, max_iter: usize, spent: &mut usize) -> Result<bool, String>;
}

/// Newton-Raphson; modified Newton when the tangent is lagged.
pub(crate) struct Newton {
    pub lag_tangent: bool,
}

impl Iteration for Newton {
    fn converge<P: IncrementalProblem + ?Sized>(&self, problem: &mut P, tolerance: f64, max_iter: usize, spent: &mut usize) -> Result<bool, String> {
        for _ in 0..max_iter {
            *spent += 1;
            let at = problem.linearize()?;
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            problem.correct(self.lag_tangent)?;
        }
        Ok(false)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Outcome {
    pub iterations: usize,
    pub converged: bool,
    /// Load factor of the last increment that converged; zero when none did.
    pub load_factor: f64,
}

/// Apply the load in `n_increments` equal steps. An increment that does not converge ends the
/// solve with the problem rolled back to the last one that did.
pub(crate) fn solve_by_load_increments<P: IncrementalProblem + ?Sized, I: Iteration>(
    problem: &mut P,
    iteration: &I,
    n_increments: usize,
    tolerance: f64,
    max_iter: usize,
) -> Result<Outcome, String> {
    let mut outcome = Outcome { iterations: 0, converged: true, load_factor: 0.0 };
    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;
        problem.begin_increment(load_factor);
        if !iteration.converge(problem, tolerance, max_iter, &mut outcome.iterations)? {
            outcome.converged = false;
            problem.rollback();
            break;
        }
        problem.commit();
        outcome.load_factor = load_factor;
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One unknown: u + stiffening·u³ = load_factor·load.
    struct Spring {
        load: f64,
        stiffening: f64,
        u: f64,
        committed: f64,
        target: f64,
        residual: f64,
        tangent: f64,
        lagged: Option<f64>,
        owed: bool,
        fail_at: Option<usize>,
        linearizations: usize,
        tangents: usize,
        trace: Vec<f64>,
    }

    impl Spring {
        fn new(load: f64, stiffening: f64) -> Self {
            Spring { load, stiffening, u: 0.0, committed: 0.0, target: 0.0, residual: 0.0, tangent: 0.0, lagged: None, owed: false, fail_at: None, linearizations: 0, tangents: 0, trace: Vec::new() }
        }

        fn exact(&self, load_factor: f64) -> f64 {
            let (mut lo, mut hi) = (0.0, load_factor * self.load);
            for _ in 0..200 {
                let mid = 0.5 * (lo + hi);
                if mid + self.stiffening * mid * mid * mid < load_factor * self.load { lo = mid } else { hi = mid }
            }
            0.5 * (lo + hi)
        }
    }

    impl IncrementalProblem for Spring {
        fn begin_increment(&mut self, load_factor: f64) {
            self.target = load_factor * self.load;
            self.lagged = None;
        }
        fn linearize(&mut self) -> Result<Linearization, String> {
            self.linearizations += 1;
            if self.fail_at == Some(self.linearizations) {
                return Err("the tangent is singular".into());
            }
            self.residual = self.target - (self.u + self.stiffening * self.u.powi(3));
            self.tangent = 1.0 + 3.0 * self.stiffening * self.u * self.u;
            self.trace.push(self.residual.abs());
            Ok(Linearization { measure: self.residual.abs(), forced: std::mem::take(&mut self.owed) })
        }
        fn correct(&mut self, lag_tangent: bool) -> Result<(), String> {
            let tangent = match self.lagged {
                Some(kept) if lag_tangent => kept,
                _ => {
                    self.tangents += 1;
                    self.lagged = Some(self.tangent);
                    self.tangent
                }
            };
            self.u += self.residual / tangent;
            Ok(())
        }
        fn commit(&mut self) {
            self.committed = self.u;
        }
        fn rollback(&mut self) {
            self.u = self.committed;
        }
    }

    #[test]
    fn newton_reaches_the_solution_and_counts_its_linearizations() {
        for n_increments in [1, 4, 10] {
            let mut spring = Spring::new(30.0, 2.0);
            let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, n_increments, 1e-10, 50).unwrap();
            assert!(outcome.converged);
            assert_eq!(outcome.load_factor, 1.0);
            assert_eq!(outcome.iterations, spring.linearizations);
            assert_eq!(spring.tangents, spring.linearizations - n_increments);
            assert!((spring.u - spring.exact(1.0)).abs() <= 1e-10);
            assert_eq!(spring.u, spring.committed);
        }
    }

    #[test]
    fn newton_converges_quadratically_near_the_solution() {
        let mut spring = Spring::new(30.0, 2.0);
        solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 1, 1e-12, 50).unwrap();
        let tail: Vec<f64> = spring.trace.iter().copied().filter(|r| *r < 1e-1 && *r > 1e-13).collect();
        assert!(tail.len() >= 2, "{:?}", spring.trace);
        for pair in tail.windows(2) {
            assert!(pair[1] <= 10.0 * pair[0] * pair[0], "{:?}", spring.trace);
        }
    }

    #[test]
    fn a_lagged_tangent_reaches_the_same_solution_with_one_tangent_per_increment() {
        let mut full = Spring::new(2.0, 0.1);
        let mut lagged = Spring::new(2.0, 0.1);
        let plain = solve_by_load_increments(&mut full, &Newton { lag_tangent: false }, 6, 1e-10, 400).unwrap();
        let modified = solve_by_load_increments(&mut lagged, &Newton { lag_tangent: true }, 6, 1e-10, 400).unwrap();
        assert!(plain.converged && modified.converged);
        assert_eq!(lagged.tangents, 6);
        assert!(modified.iterations > plain.iterations);
        assert!((lagged.u - full.u).abs() <= 1e-9);
    }

    #[test]
    fn an_increment_that_does_not_converge_leaves_the_last_one_that_did() {
        let mut spring = Spring::new(30.0, 2.0);
        let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 1, 1e-10, 2).unwrap();
        assert_eq!(outcome, Outcome { iterations: 2, converged: false, load_factor: 0.0 });
        assert_eq!(spring.u, 0.0);

        let mut reference = Spring::new(2.0, 0.1);
        let whole = solve_by_load_increments(&mut reference, &Newton { lag_tangent: true }, 4, 1e-10, 400).unwrap();
        assert!(whole.converged);
        let per_increment = {
            let mut one = Spring::new(2.0, 0.1);
            let mut spent = 0;
            one.begin_increment(0.25);
            assert!(Newton { lag_tangent: true }.converge(&mut one, 1e-10, 400, &mut spent).unwrap());
            spent
        };
        let mut spring = Spring::new(2.0, 0.1);
        let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: true }, 4, 1e-10, per_increment).unwrap();
        assert!(!outcome.converged);
        assert!(outcome.load_factor >= 0.25 && outcome.load_factor < 1.0);
        assert!((spring.u - spring.exact(outcome.load_factor)).abs() <= 1e-9);
        assert_eq!(spring.u, spring.committed);
    }

    #[test]
    fn a_forced_correction_is_made_even_at_a_converged_state() {
        let mut spring = Spring::new(0.0, 2.0);
        spring.owed = true;
        let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 1, 1e-10, 50).unwrap();
        assert_eq!(outcome, Outcome { iterations: 2, converged: true, load_factor: 1.0 });
        assert_eq!(spring.tangents, 1);
    }

    #[test]
    fn an_error_of_the_problem_ends_the_solve() {
        let mut spring = Spring::new(30.0, 2.0);
        spring.fail_at = Some(3);
        let error = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 2, 1e-10, 50).unwrap_err();
        assert_eq!(error, "the tangent is singular");
        assert_eq!(spring.linearizations, 3);
    }

    #[test]
    fn no_increments_do_nothing() {
        let mut spring = Spring::new(30.0, 2.0);
        let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 0, 1e-10, 50).unwrap();
        assert_eq!(outcome, Outcome { iterations: 0, converged: true, load_factor: 0.0 });
        assert_eq!(spring.linearizations, 0);
    }
}
