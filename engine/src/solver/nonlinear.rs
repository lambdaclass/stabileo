//! The incremental-iterative driver the nonlinear analyses share. An analysis describes itself as
//! an [`IncrementalProblem`]; how its increments are converged is an [`Iteration`]: [`Newton`],
//! [`NewtonLineSearch`] or [`Anderson`].

pub(crate) struct Linearization {
    /// What the analysis compares with its tolerance.
    pub measure: f64,
    /// A correction is owed whatever the measure says (a support step not yet applied), and it
    /// has to be taken whole.
    pub forced: bool,
}

/// `correction` answers for the last `linearize` and may be asked once for it: linearize again
/// after the state changes.
pub(crate) trait IncrementalProblem {
    /// Set the loads and prescribed motion of the increment that ends at `load_factor`.
    fn begin_increment(&mut self, load_factor: f64);
    /// Residual and tangent at the current state.
    fn linearize(&mut self) -> Result<Linearization, String>;
    /// The correction of the last linearization, over the unknowns `state` returns. With
    /// `lag_tangent` the problem may answer with the tangent it factorized first in this increment.
    fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String>;
    /// Add `step` to the state, with whatever a forced correction owes.
    fn advance(&mut self, step: &[f64]);
    fn state(&self) -> Vec<f64>;
    /// Work of the last linearization's residual on `step`: positive while moving along `step`
    /// still lowers the potential energy.
    fn work(&self, step: &[f64]) -> f64;
    /// Not for a forced correction: what it owes is only applied by `advance`.
    fn set_state(&mut self, state: &[f64]);
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
            let step = problem.correction(self.lag_tangent)?;
            problem.advance(&step);
        }
        Ok(false)
    }
}

const ENOUGH: f64 = 0.8;
const MAX_TRIALS: usize = 6;

/// Newton-Raphson with the line search of structural mechanics (Crisfield, vol. 1, 9.2): the
/// step is scaled toward the point where the residual does no work on it, and taken once that
/// work is under `ENOUGH` of what it was. A step that still lowers the energy is taken whole, so
/// where Newton converges undisturbed this is Newton. Every trial is a linearization and counts
/// as one.
///
/// The measure is not the merit: a full step of a slender frame raises the residual norm a
/// thousandfold on the way to the solution, and backtracking on it crawls.
pub(crate) struct NewtonLineSearch;

impl Iteration for NewtonLineSearch {
    fn converge<P: IncrementalProblem + ?Sized>(&self, problem: &mut P, tolerance: f64, max_iter: usize, spent: &mut usize) -> Result<bool, String> {
        let budget = *spent + max_iter;
        if max_iter == 0 {
            return Ok(false);
        }
        *spent += 1;
        let mut at = problem.linearize()?;
        loop {
            if at.measure < tolerance && !at.forced {
                return Ok(true);
            }
            if *spent >= budget {
                return Ok(false);
            }
            let step = problem.correction(false)?;
            let start_work = problem.work(&step);
            if at.forced {
                problem.advance(&step);
                *spent += 1;
                at = problem.linearize()?;
                continue;
            }
            let origin = problem.state();
            let mut trial = |problem: &mut P, alpha: f64, spent: &mut usize| -> Result<(Linearization, f64), String> {
                let state: Vec<f64> = origin.iter().zip(&step).map(|(x, d)| x + alpha * d).collect();
                problem.set_state(&state);
                *spent += 1;
                let found = problem.linearize()?;
                let work = problem.work(&step);
                Ok((found, work))
            };
            let (mut found, mut work) = trial(problem, 1.0, spent)?;
            if start_work.is_finite() && start_work > 0.0 {
                let (mut low, mut low_work, mut high, mut high_work) = (0.0, start_work, 1.0, work);
                for _ in 1..MAX_TRIALS {
                    let overshot = !high_work.is_finite() || high_work < -ENOUGH * start_work;
                    if !overshot || *spent >= budget {
                        break;
                    }
                    let beyond = if high_work.is_finite() { high_work } else { -start_work };
                    let secant = low + (high - low) * low_work / (low_work - beyond);
                    let alpha = secant.clamp(low + 0.1 * (high - low), high - 0.1 * (high - low));
                    (found, work) = trial(problem, alpha, spent)?;
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
                if !(work.is_finite() && found.measure.is_finite()) {
                    (found, _) = trial(problem, if low > 0.0 { low } else { 0.1 * high }, spent)?;
                }
            }
            at = found;
        }
    }
}

/// Anderson acceleration of the corrections (Walker and Ni's form, mixing 1): the next state is
/// the one that would cancel a least-squares combination of the last `depth` corrections. With
/// a lagged tangent it recovers much of Newton's speed from one factorization per increment.
/// Depth 0 is the plain iteration.
pub(crate) struct Anderson {
    pub depth: usize,
    pub lag_tangent: bool,
}

impl Iteration for Anderson {
    fn converge<P: IncrementalProblem + ?Sized>(&self, problem: &mut P, tolerance: f64, max_iter: usize, spent: &mut usize) -> Result<bool, String> {
        let mut previous: Option<(Vec<f64>, Vec<f64>)> = None;
        let mut history: Vec<(Vec<f64>, Vec<f64>)> = Vec::new();
        for _ in 0..max_iter {
            *spent += 1;
            let at = problem.linearize()?;
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
                        correction.iter().zip(&last_correction).map(|(a, b)| a - b).collect(),
                    ));
                }
            }
            let mut next: Vec<f64> = state.iter().zip(&correction).map(|(x, f)| x + f).collect();
            let differences: Vec<&[f64]> = history.iter().map(|(_, df)| df.as_slice()).collect();
            match least_squares(&differences, &correction) {
                Some(weights) => {
                    for (weight, (dx, df)) in weights.iter().zip(&history) {
                        for ((value, a), b) in next.iter_mut().zip(dx).zip(df) {
                            *value -= weight * (a + b);
                        }
                    }
                    if next.iter().any(|v| !v.is_finite()) {
                        next = state.iter().zip(&correction).map(|(x, f)| x + f).collect();
                        history.clear();
                    }
                }
                None => history.clear(),
            }
            problem.set_state(&next);
            previous = Some((state, correction));
        }
        Ok(false)
    }
}

/// The weights minimizing ‖target − Σ wᵢ·columnᵢ‖, by the normal equations with pivoting.
/// `None` when the columns are dependent to rounding, which is the sign to drop them.
fn least_squares(columns: &[&[f64]], target: &[f64]) -> Option<Vec<f64>> {
    let m = columns.len();
    let dot = |a: &[f64], b: &[f64]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>();
    let mut a: Vec<Vec<f64>> = (0..m).map(|i| (0..m).map(|j| dot(columns[i], columns[j])).collect()).collect();
    let mut b: Vec<f64> = (0..m).map(|i| dot(columns[i], target)).collect();
    let scale = (0..m).fold(0.0f64, |largest, i| largest.max(a[i][i]));
    for k in 0..m {
        let pivot = (k..m).fold(k, |best, i| if a[i][k].abs() > a[best][k].abs() { i } else { best });
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

/// How the increments of a nonlinear analysis are converged.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum IterationMethod {
    /// Newton-Raphson with a new tangent every iteration.
    Newton,
    /// The tangent of each increment's first iteration, kept for the increment.
    ModifiedNewton,
    /// Newton-Raphson with a backtracking line search.
    NewtonLineSearch,
    /// Modified Newton accelerated by Anderson mixing over the last `depth` corrections.
    Anderson { depth: usize },
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

pub(crate) fn solve_by_load_increments_with<P: IncrementalProblem + ?Sized>(
    problem: &mut P,
    method: IterationMethod,
    n_increments: usize,
    tolerance: f64,
    max_iter: usize,
) -> Result<Outcome, String> {
    match method {
        IterationMethod::Newton => solve_by_load_increments(problem, &Newton { lag_tangent: false }, n_increments, tolerance, max_iter),
        IterationMethod::ModifiedNewton => solve_by_load_increments(problem, &Newton { lag_tangent: true }, n_increments, tolerance, max_iter),
        IterationMethod::NewtonLineSearch => solve_by_load_increments(problem, &NewtonLineSearch, n_increments, tolerance, max_iter),
        IterationMethod::Anderson { depth } => solve_by_load_increments(problem, &Anderson { depth, lag_tangent: true }, n_increments, tolerance, max_iter),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unknowns coupled in a chain: forceᵢ(u) = law(uᵢ) + coupling·(2uᵢ − uᵢ₋₁ − uᵢ₊₁) = load_factor·loadᵢ.
    struct Chain {
        law: fn(f64) -> (f64, f64),
        coupling: f64,
        load: Vec<f64>,
        u: Vec<f64>,
        committed: Vec<f64>,
        target: Vec<f64>,
        residual: Vec<f64>,
        tangent: Vec<Vec<f64>>,
        lagged: Option<Vec<Vec<f64>>>,
        owed: bool,
        fail_at: Option<usize>,
        linearizations: usize,
        tangents: usize,
        trace: Vec<f64>,
    }

    fn stiffening(u: f64) -> (f64, f64) {
        (u + 2.0 * u * u * u, 1.0 + 6.0 * u * u)
    }

    fn mild(u: f64) -> (f64, f64) {
        (u + 0.1 * u * u * u, 1.0 + 0.3 * u * u)
    }

    fn softening(u: f64) -> (f64, f64) {
        (u.atan(), 1.0 / (1.0 + u * u))
    }

    impl Chain {
        fn new(law: fn(f64) -> (f64, f64), coupling: f64, load: &[f64]) -> Self {
            let n = load.len();
            Chain {
                law, coupling, load: load.to_vec(), u: vec![0.0; n], committed: vec![0.0; n], target: vec![0.0; n],
                residual: vec![0.0; n], tangent: Vec::new(), lagged: None, owed: false, fail_at: None,
                linearizations: 0, tangents: 0, trace: Vec::new(),
            }
        }

        fn spring(law: fn(f64) -> (f64, f64), load: f64) -> Self {
            Chain::new(law, 0.0, &[load])
        }

        fn starting_at(mut self, u: &[f64]) -> Self {
            self.u = u.to_vec();
            self.committed = u.to_vec();
            self
        }

        fn unbalance(&self, load_factor: f64) -> f64 {
            let n = self.u.len();
            (0..n).map(|i| {
                let neighbours = if i > 0 { self.u[i - 1] } else { 0.0 } + if i + 1 < n { self.u[i + 1] } else { 0.0 };
                let force = (self.law)(self.u[i]).0 + self.coupling * (2.0 * self.u[i] - neighbours);
                (load_factor * self.load[i] - force).abs()
            }).fold(0.0, f64::max)
        }
    }

    fn solve_dense(a: &[Vec<f64>], b: &[f64]) -> Result<Vec<f64>, String> {
        let columns: Vec<Vec<f64>> = (0..b.len()).map(|j| a.iter().map(|row| row[j]).collect()).collect();
        let refs: Vec<&[f64]> = columns.iter().map(|c| c.as_slice()).collect();
        least_squares(&refs, b).ok_or_else(|| "the tangent is singular".to_string())
    }

    impl IncrementalProblem for Chain {
        fn begin_increment(&mut self, load_factor: f64) {
            self.target = self.load.iter().map(|p| load_factor * p).collect();
            self.lagged = None;
        }
        fn linearize(&mut self) -> Result<Linearization, String> {
            self.linearizations += 1;
            if self.fail_at == Some(self.linearizations) {
                return Err("the tangent is singular".into());
            }
            let n = self.u.len();
            self.tangent = vec![vec![0.0; n]; n];
            for i in 0..n {
                let (force, stiffness) = (self.law)(self.u[i]);
                let neighbours = if i > 0 { self.u[i - 1] } else { 0.0 } + if i + 1 < n { self.u[i + 1] } else { 0.0 };
                self.residual[i] = self.target[i] - force - self.coupling * (2.0 * self.u[i] - neighbours);
                self.tangent[i][i] = stiffness + 2.0 * self.coupling;
                if i > 0 { self.tangent[i][i - 1] = -self.coupling; }
                if i + 1 < n { self.tangent[i][i + 1] = -self.coupling; }
            }
            let measure = self.residual.iter().map(|r| r * r).sum::<f64>().sqrt();
            self.trace.push(measure);
            Ok(Linearization { measure, forced: std::mem::take(&mut self.owed) })
        }
        fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String> {
            let tangent = match &self.lagged {
                Some(kept) if lag_tangent => kept.clone(),
                _ => {
                    self.tangents += 1;
                    self.lagged = Some(self.tangent.clone());
                    self.tangent.clone()
                }
            };
            solve_dense(&tangent, &self.residual)
        }
        fn advance(&mut self, step: &[f64]) {
            self.u.iter_mut().zip(step).for_each(|(u, s)| *u += s);
        }
        fn state(&self) -> Vec<f64> {
            self.u.clone()
        }
        fn work(&self, step: &[f64]) -> f64 {
            self.residual.iter().zip(step).map(|(r, d)| r * d).sum()
        }
        fn set_state(&mut self, state: &[f64]) {
            self.u.copy_from_slice(state);
        }
        fn commit(&mut self) {
            self.committed = self.u.clone();
        }
        fn rollback(&mut self) {
            self.u = self.committed.clone();
        }
    }

    #[test]
    fn newton_reaches_the_solution_and_counts_its_linearizations() {
        for n_increments in [1, 4, 10] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, n_increments, 1e-10, 50).unwrap();
            assert!(outcome.converged);
            assert_eq!(outcome.load_factor, 1.0);
            assert_eq!(outcome.iterations, spring.linearizations);
            assert_eq!(spring.tangents, spring.linearizations - n_increments);
            assert!(spring.unbalance(1.0) <= 1e-10);
            assert_eq!(spring.u, spring.committed);
        }
    }

    #[test]
    fn newton_converges_quadratically_near_the_solution() {
        let mut spring = Chain::spring(stiffening, 30.0);
        solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 1, 1e-12, 50).unwrap();
        let tail: Vec<f64> = spring.trace.iter().copied().filter(|r| *r < 1e-1 && *r > 1e-13).collect();
        assert!(tail.len() >= 2, "{:?}", spring.trace);
        for pair in tail.windows(2) {
            assert!(pair[1] <= 10.0 * pair[0] * pair[0], "{:?}", spring.trace);
        }
    }

    #[test]
    fn a_lagged_tangent_reaches_the_same_solution_with_one_tangent_per_increment() {
        let mut full = Chain::spring(mild, 2.0);
        let mut lagged = Chain::spring(mild, 2.0);
        let plain = solve_by_load_increments(&mut full, &Newton { lag_tangent: false }, 6, 1e-10, 400).unwrap();
        let modified = solve_by_load_increments(&mut lagged, &Newton { lag_tangent: true }, 6, 1e-10, 400).unwrap();
        assert!(plain.converged && modified.converged);
        assert_eq!(lagged.tangents, 6);
        assert!(modified.iterations > plain.iterations);
        assert!((lagged.u[0] - full.u[0]).abs() <= 1e-9);
    }

    #[test]
    fn an_increment_that_does_not_converge_leaves_the_last_one_that_did() {
        for method in [IterationMethod::Newton, IterationMethod::NewtonLineSearch, IterationMethod::Anderson { depth: 2 }] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments_with(&mut spring, method, 1, 1e-10, 2).unwrap();
            assert_eq!((outcome.converged, outcome.load_factor), (false, 0.0), "{method:?}");
            assert_eq!(spring.u, vec![0.0], "{method:?}");
        }

        let per_increment = {
            let mut one = Chain::spring(mild, 2.0);
            let mut spent = 0;
            one.begin_increment(0.25);
            assert!(Newton { lag_tangent: true }.converge(&mut one, 1e-10, 400, &mut spent).unwrap());
            spent
        };
        let mut spring = Chain::spring(mild, 2.0);
        let outcome = solve_by_load_increments(&mut spring, &Newton { lag_tangent: true }, 4, 1e-10, per_increment).unwrap();
        assert!(!outcome.converged);
        assert!(outcome.load_factor >= 0.25 && outcome.load_factor < 1.0);
        assert!(spring.unbalance(outcome.load_factor) <= 1e-9);
        assert_eq!(spring.u, spring.committed);
    }

    #[test]
    fn a_forced_correction_is_made_whole_even_at_a_converged_state() {
        for method in [IterationMethod::Newton, IterationMethod::ModifiedNewton, IterationMethod::NewtonLineSearch, IterationMethod::Anderson { depth: 3 }] {
            let mut spring = Chain::spring(stiffening, 0.0);
            spring.owed = true;
            let outcome = solve_by_load_increments_with(&mut spring, method, 1, 1e-10, 50).unwrap();
            assert_eq!(outcome, Outcome { iterations: 2, converged: true, load_factor: 1.0 }, "{method:?}");
            assert_eq!(spring.tangents, 1, "{method:?}");
        }
    }

    #[test]
    fn an_error_of_the_problem_ends_the_solve() {
        for (method, fail_at) in [(IterationMethod::Newton, 3), (IterationMethod::NewtonLineSearch, 1), (IterationMethod::NewtonLineSearch, 2), (IterationMethod::NewtonLineSearch, 3), (IterationMethod::Anderson { depth: 2 }, 3)] {
            let mut spring = Chain::spring(stiffening, 30.0);
            spring.fail_at = Some(fail_at);
            let error = solve_by_load_increments_with(&mut spring, method, 2, 1e-10, 50).unwrap_err();
            assert_eq!(error, "the tangent is singular", "{method:?}");
            assert_eq!(spring.linearizations, fail_at, "{method:?}");
        }
    }

    #[test]
    fn no_increments_or_no_iterations_do_nothing() {
        for method in [IterationMethod::Newton, IterationMethod::NewtonLineSearch, IterationMethod::Anderson { depth: 2 }] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments_with(&mut spring, method, 0, 1e-10, 50).unwrap();
            assert_eq!(outcome, Outcome { iterations: 0, converged: true, load_factor: 0.0 });
            let outcome = solve_by_load_increments_with(&mut spring, method, 3, 1e-10, 0).unwrap();
            assert_eq!(outcome, Outcome { iterations: 0, converged: false, load_factor: 0.0 });
            assert_eq!(spring.linearizations, 0);
        }
    }

    #[test]
    fn the_line_search_converges_where_the_full_newton_step_runs_away() {
        let from = [3.0];
        let mut plain = Chain::spring(softening, 0.0).starting_at(&from);
        let ran_away = solve_by_load_increments(&mut plain, &Newton { lag_tangent: false }, 1, 1e-10, 30);
        assert!(!ran_away.is_ok_and(|outcome| outcome.converged));
        assert!(plain.trace.last().unwrap() > &1.5);

        let mut searched = Chain::spring(softening, 0.0).starting_at(&from);
        let outcome = solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 1e-10, 60).unwrap();
        assert!(outcome.converged);
        assert!(searched.u[0].abs() <= 1e-9);
        assert_eq!(outcome.iterations, searched.linearizations);
        let accepted: Vec<f64> = searched.trace.clone();
        assert!(accepted.last().unwrap() < accepted.first().unwrap());
    }

    #[test]
    fn the_line_search_takes_the_full_step_where_newton_already_converges() {
        let load = [4.0, -1.0, 2.5, 0.5];
        let mut plain = Chain::new(mild, 0.7, &load);
        let mut searched = Chain::new(mild, 0.7, &load);
        let newton = solve_by_load_increments(&mut plain, &Newton { lag_tangent: false }, 3, 1e-11, 50).unwrap();
        let outcome = solve_by_load_increments(&mut searched, &NewtonLineSearch, 3, 1e-11, 50).unwrap();
        assert!(newton.converged && outcome.converged);
        assert_eq!(plain.u, searched.u);
        assert_eq!(newton.iterations, outcome.iterations);
        assert_eq!(plain.tangents, searched.tangents);
    }

    #[test]
    fn the_line_search_stays_within_its_budget_of_linearizations() {
        for budget in 1..12 {
            let mut searched = Chain::spring(softening, 0.0).starting_at(&[3.0]);
            let outcome = solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 1e-14, budget).unwrap();
            assert!(searched.linearizations <= budget + 1, "{budget}: {}", searched.linearizations);
            assert_eq!(outcome.iterations, searched.linearizations);
            if !outcome.converged {
                assert_eq!(searched.u, vec![3.0]);
            }
        }
    }

    #[test]
    fn anderson_needs_one_tangent_per_increment_and_fewer_iterations_than_modified_newton() {
        let load = [4.0, -1.0, 2.5, 0.5, 3.0];
        for n_increments in [1, 3] {
            let mut modified = Chain::new(mild, 0.7, &load);
            let plain = solve_by_load_increments(&mut modified, &Newton { lag_tangent: true }, n_increments, 1e-10, 2000).unwrap();
            assert!(plain.converged);
            let mut newton = Chain::new(mild, 0.7, &load);
            solve_by_load_increments(&mut newton, &Newton { lag_tangent: false }, n_increments, 1e-12, 200).unwrap();
            for depth in [1, 3, 5] {
                let mut accelerated = Chain::new(mild, 0.7, &load);
                let outcome = solve_by_load_increments(&mut accelerated, &Anderson { depth, lag_tangent: true }, n_increments, 1e-10, 2000).unwrap();
                assert!(outcome.converged, "depth {depth}");
                assert_eq!(accelerated.tangents, n_increments);
                assert!(accelerated.unbalance(1.0) <= 1e-9);
                for (got, want) in accelerated.u.iter().zip(&newton.u) {
                    assert!((got - want).abs() <= 1e-8, "depth {depth}: {got} vs {want}");
                }
                assert!(outcome.iterations < plain.iterations, "depth {depth}: {} against {}", outcome.iterations, plain.iterations);
            }
        }
    }

    #[test]
    fn anderson_of_depth_zero_is_the_plain_iteration() {
        let load = [4.0, -1.0, 2.5];
        let mut modified = Chain::new(mild, 0.7, &load);
        let mut flat = Chain::new(mild, 0.7, &load);
        let plain = solve_by_load_increments(&mut modified, &Newton { lag_tangent: true }, 2, 1e-10, 500).unwrap();
        let outcome = solve_by_load_increments(&mut flat, &Anderson { depth: 0, lag_tangent: true }, 2, 1e-10, 500).unwrap();
        assert!(plain.converged);
        assert_eq!(plain, outcome);
        assert_eq!(modified.u, flat.u);
    }

    #[test]
    fn anderson_with_one_unknown_is_the_secant_method() {
        let mut spring = Chain::spring(mild, 4.0);
        let outcome = solve_by_load_increments(&mut spring, &Anderson { depth: 1, lag_tangent: true }, 1, 1e-12, 200).unwrap();
        assert!(outcome.converged);
        let tail: Vec<f64> = spring.trace.iter().copied().filter(|r| *r < 1e-2 && *r > 1e-13).collect();
        assert!(tail.len() >= 2 && tail.windows(2).all(|pair| pair[1] <= 0.1 * pair[0]), "{:?}", spring.trace);
        let mut modified = Chain::spring(mild, 4.0);
        let plain = solve_by_load_increments(&mut modified, &Newton { lag_tangent: true }, 1, 1e-12, 2000).unwrap();
        assert!(!plain.converged, "modified Newton oscillates on this spring: {}", plain.iterations);
        assert!(outcome.iterations <= 12, "{}", outcome.iterations);
    }

    #[test]
    fn least_squares_solves_and_refuses_dependent_columns() {
        let (a, b, c) = ([1.0, 0.0, 2.0], [0.0, 1.0, 1.0], [1.0, 1.0, 0.0]);
        let target: Vec<f64> = (0..3).map(|i| 2.0 * a[i] - 3.0 * b[i] + 0.5 * c[i]).collect();
        let weights = least_squares(&[&a, &b, &c], &target).unwrap();
        for (got, want) in weights.iter().zip([2.0, -3.0, 0.5]) {
            assert!((got - want).abs() <= 1e-12);
        }
        let projected = least_squares(&[&a, &b], &[1.0, 1.0, 1.0]).unwrap();
        let rest: Vec<f64> = (0..3).map(|i| 1.0 - projected[0] * a[i] - projected[1] * b[i]).collect();
        assert!(rest.iter().zip(&a).map(|(x, y)| x * y).sum::<f64>().abs() <= 1e-12);
        assert!(rest.iter().zip(&b).map(|(x, y)| x * y).sum::<f64>().abs() <= 1e-12);
        assert_eq!(least_squares(&[&a, &a], &target), None);
        assert_eq!(least_squares(&[&[0.0, 0.0, 0.0]], &target), None);
        assert_eq!(least_squares(&[&[f64::NAN, 0.0, 0.0]], &target), None);
        assert_eq!(least_squares(&[], &target), Some(vec![]));
    }
}
