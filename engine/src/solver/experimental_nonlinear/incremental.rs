use super::{
    adaptive::solve_by_adaptive_increments,
    anderson::{Anderson, MAX_ANDERSON_DEPTH},
    line_search::NewtonLineSearch,
};

pub(crate) struct Linearization {
    pub measure: f64,
    pub forced: bool,
}

pub(crate) trait IncrementalProblem {
    fn begin_increment(&mut self, load_factor: f64);
    fn linearize(&mut self) -> Result<Linearization, String>;
    fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String>;
    fn advance(&mut self, step: &[f64]);
    fn state(&self) -> Vec<f64>;
    fn work(&self, step: &[f64]) -> f64;
    fn set_state(&mut self, state: &[f64]);
    fn commit(&mut self) -> Result<(), String>;
    fn rollback(&mut self);
}

pub(crate) trait Iteration {
    fn converge<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        max_iter: usize,
        spent: &mut usize,
    ) -> Result<bool, String>;
}

pub(crate) struct Newton {
    pub lag_tangent: bool,
}

impl Iteration for Newton {
    fn converge<P: IncrementalProblem + ?Sized>(
        &self,
        problem: &mut P,
        tolerance: f64,
        max_iter: usize,
        spent: &mut usize,
    ) -> Result<bool, String> {
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

pub(crate) fn validate(method: IterationMethod) -> Result<(), String> {
    match method {
        IterationMethod::Anderson { depth } if depth == 0 || depth > MAX_ANDERSON_DEPTH => Err(
            format!("Anderson acceleration needs a depth from 1 to {MAX_ANDERSON_DEPTH}"),
        ),
        _ => Ok(()),
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(target_arch = "wasm32", derive(serde::Deserialize))]
#[cfg_attr(target_arch = "wasm32", serde(rename_all = "camelCase"))]
pub enum IterationMethod {
    Newton,
    ModifiedNewton,
    NewtonLineSearch,
    Anderson { depth: usize },
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(target_arch = "wasm32", derive(serde::Deserialize))]
#[cfg_attr(target_arch = "wasm32", serde(rename_all = "camelCase"))]
pub enum LoadStepping {
    Equal,
    Adaptive,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Outcome {
    pub iterations: usize,
    pub converged: bool,
    pub load_factor: f64,
    pub increments: usize,
}

pub(crate) fn solve_by_load_increments<P: IncrementalProblem + ?Sized, I: Iteration>(
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
    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;
        problem.begin_increment(load_factor);
        if !iteration.converge(problem, tolerance, max_iter, &mut outcome.iterations)? {
            outcome.converged = false;
            problem.rollback();
            break;
        }
        problem.commit()?;
        outcome.load_factor = load_factor;
        outcome.increments += 1;
    }
    Ok(outcome)
}

#[cfg(test)]
pub(crate) fn solve_by_load_increments_with<P: IncrementalProblem + ?Sized>(
    problem: &mut P,
    method: IterationMethod,
    n_increments: usize,
    tolerance: f64,
    max_iter: usize,
) -> Result<Outcome, String> {
    solve_stepped(
        problem,
        method,
        LoadStepping::Equal,
        n_increments,
        tolerance,
        max_iter,
    )
}

pub(crate) fn solve_stepped<P: IncrementalProblem + ?Sized>(
    problem: &mut P,
    method: IterationMethod,
    stepping: LoadStepping,
    n_increments: usize,
    tolerance: f64,
    max_iter: usize,
) -> Result<Outcome, String> {
    fn run<P: IncrementalProblem + ?Sized, I: Iteration>(
        problem: &mut P,
        iteration: &I,
        stepping: LoadStepping,
        n_increments: usize,
        tolerance: f64,
        max_iter: usize,
    ) -> Result<Outcome, String> {
        match stepping {
            LoadStepping::Equal => {
                solve_by_load_increments(problem, iteration, n_increments, tolerance, max_iter)
            }
            LoadStepping::Adaptive => {
                solve_by_adaptive_increments(problem, iteration, n_increments, tolerance, max_iter)
            }
        }
    }
    match method {
        IterationMethod::Newton => run(
            problem,
            &Newton { lag_tangent: false },
            stepping,
            n_increments,
            tolerance,
            max_iter,
        ),
        IterationMethod::ModifiedNewton => run(
            problem,
            &Newton { lag_tangent: true },
            stepping,
            n_increments,
            tolerance,
            max_iter,
        ),
        IterationMethod::NewtonLineSearch => run(
            problem,
            &NewtonLineSearch,
            stepping,
            n_increments,
            tolerance,
            max_iter,
        ),
        IterationMethod::Anderson { depth } => run(
            problem,
            &Anderson {
                depth,
                lag_tangent: true,
            },
            stepping,
            n_increments,
            tolerance,
            max_iter,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::super::anderson::{least_squares, mixed};
    use super::*;

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
        refuse_commit: bool,
        fail_at: Option<usize>,
        linearizations: usize,
        tangents: usize,
        trace: Vec<f64>,
        corrected_from: Vec<f64>,
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

    fn yielding(u: f64) -> (f64, f64) {
        (u.atan(), (1.0 / (1.0 + u * u)).max(1e-3))
    }

    impl Chain {
        fn new(law: fn(f64) -> (f64, f64), coupling: f64, load: &[f64]) -> Self {
            let n = load.len();
            Chain {
                law,
                coupling,
                load: load.to_vec(),
                u: vec![0.0; n],
                committed: vec![0.0; n],
                target: vec![0.0; n],
                residual: vec![0.0; n],
                tangent: Vec::new(),
                lagged: None,
                owed: false,
                refuse_commit: false,
                fail_at: None,
                linearizations: 0,
                tangents: 0,
                trace: Vec::new(),
                corrected_from: Vec::new(),
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
            (0..n)
                .map(|i| {
                    let neighbours = if i > 0 { self.u[i - 1] } else { 0.0 }
                        + if i + 1 < n { self.u[i + 1] } else { 0.0 };
                    let force =
                        (self.law)(self.u[i]).0 + self.coupling * (2.0 * self.u[i] - neighbours);
                    (load_factor * self.load[i] - force).abs()
                })
                .fold(0.0, f64::max)
        }
    }

    fn solve_dense(a: &[Vec<f64>], b: &[f64]) -> Result<Vec<f64>, String> {
        let columns: Vec<Vec<f64>> = (0..b.len())
            .map(|j| a.iter().map(|row| row[j]).collect())
            .collect();
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
                let neighbours = if i > 0 { self.u[i - 1] } else { 0.0 }
                    + if i + 1 < n { self.u[i + 1] } else { 0.0 };
                self.residual[i] =
                    self.target[i] - force - self.coupling * (2.0 * self.u[i] - neighbours);
                self.tangent[i][i] = stiffness + 2.0 * self.coupling;
                if i > 0 {
                    self.tangent[i][i - 1] = -self.coupling;
                }
                if i + 1 < n {
                    self.tangent[i][i + 1] = -self.coupling;
                }
            }
            let measure = self.residual.iter().map(|r| r * r).sum::<f64>().sqrt();
            self.trace.push(measure);
            Ok(Linearization {
                measure,
                forced: std::mem::take(&mut self.owed),
            })
        }
        fn correction(&mut self, lag_tangent: bool) -> Result<Vec<f64>, String> {
            self.corrected_from.push(self.u[0]);
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
        fn commit(&mut self) -> Result<(), String> {
            self.committed = self.u.clone();
            if self.refuse_commit {
                return Err("the state left its branch".into());
            }
            Ok(())
        }
        fn rollback(&mut self) {
            self.u = self.committed.clone();
        }
    }

    #[test]
    fn newton_reaches_the_solution_and_counts_its_linearizations() {
        for n_increments in [1, 4, 10] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments(
                &mut spring,
                &Newton { lag_tangent: false },
                n_increments,
                1e-10,
                50,
            )
            .unwrap();
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
        solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 1, 1e-12, 50)
            .unwrap();
        let tail: Vec<f64> = spring
            .trace
            .iter()
            .copied()
            .filter(|r| *r < 1e-1 && *r > 1e-13)
            .collect();
        assert!(tail.len() >= 2, "{:?}", spring.trace);
        for pair in tail.windows(2) {
            assert!(pair[1] <= 10.0 * pair[0] * pair[0], "{:?}", spring.trace);
        }
    }

    #[test]
    fn a_lagged_tangent_reaches_the_same_solution_with_one_tangent_per_increment() {
        let mut full = Chain::spring(mild, 2.0);
        let mut lagged = Chain::spring(mild, 2.0);
        let plain =
            solve_by_load_increments(&mut full, &Newton { lag_tangent: false }, 6, 1e-10, 400)
                .unwrap();
        let modified =
            solve_by_load_increments(&mut lagged, &Newton { lag_tangent: true }, 6, 1e-10, 400)
                .unwrap();
        assert!(plain.converged && modified.converged);
        assert_eq!(lagged.tangents, 6);
        assert!(modified.iterations > plain.iterations);
        assert!((lagged.u[0] - full.u[0]).abs() <= 1e-9);
    }

    #[test]
    fn an_increment_that_does_not_converge_leaves_the_last_one_that_did() {
        for method in [
            IterationMethod::Newton,
            IterationMethod::NewtonLineSearch,
            IterationMethod::Anderson { depth: 2 },
        ] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments_with(&mut spring, method, 1, 1e-10, 2).unwrap();
            assert_eq!(
                (outcome.converged, outcome.load_factor),
                (false, 0.0),
                "{method:?}"
            );
            assert_eq!(spring.u, vec![0.0], "{method:?}");
        }

        let per_increment = {
            let mut one = Chain::spring(mild, 2.0);
            let mut spent = 0;
            one.begin_increment(0.25);
            assert!(Newton { lag_tangent: true }
                .converge(&mut one, 1e-10, 400, &mut spent)
                .unwrap());
            spent
        };
        let mut spring = Chain::spring(mild, 2.0);
        let outcome = solve_by_load_increments(
            &mut spring,
            &Newton { lag_tangent: true },
            4,
            1e-10,
            per_increment,
        )
        .unwrap();
        assert!(!outcome.converged);
        assert!(outcome.load_factor >= 0.25 && outcome.load_factor < 1.0);
        assert!(spring.unbalance(outcome.load_factor) <= 1e-9);
        assert_eq!(spring.u, spring.committed);
    }

    #[test]
    fn a_forced_correction_is_made_whole_even_at_a_converged_state() {
        for method in [
            IterationMethod::Newton,
            IterationMethod::ModifiedNewton,
            IterationMethod::NewtonLineSearch,
            IterationMethod::Anderson { depth: 3 },
        ] {
            let mut spring = Chain::spring(stiffening, 0.0);
            spring.owed = true;
            let outcome = solve_by_load_increments_with(&mut spring, method, 1, 1e-10, 50).unwrap();
            assert_eq!(
                outcome,
                Outcome {
                    iterations: 2,
                    converged: true,
                    load_factor: 1.0,
                    increments: 1
                },
                "{method:?}"
            );
            assert_eq!(spring.tangents, 1, "{method:?}");
        }
    }

    #[test]
    fn an_error_of_the_problem_ends_the_solve() {
        for (method, fail_at) in [
            (IterationMethod::Newton, 3),
            (IterationMethod::NewtonLineSearch, 1),
            (IterationMethod::NewtonLineSearch, 2),
            (IterationMethod::NewtonLineSearch, 3),
            (IterationMethod::Anderson { depth: 2 }, 3),
        ] {
            let mut spring = Chain::spring(stiffening, 30.0);
            spring.fail_at = Some(fail_at);
            let error =
                solve_by_load_increments_with(&mut spring, method, 2, 1e-10, 50).unwrap_err();
            assert_eq!(error, "the tangent is singular", "{method:?}");
            assert_eq!(spring.linearizations, fail_at, "{method:?}");
        }
    }

    #[test]
    fn an_error_on_commit_ends_the_solve() {
        let mut spring = Chain::spring(mild, 2.0);
        spring.refuse_commit = true;
        let error =
            solve_by_load_increments(&mut spring, &Newton { lag_tangent: false }, 3, 1e-10, 50)
                .unwrap_err();
        assert_eq!(error, "the state left its branch");
        assert!(spring.unbalance(1.0 / 3.0) <= 1e-10);
    }

    #[test]
    fn adaptive_steps_reach_the_full_load_where_equal_ones_give_up() {
        for method in [IterationMethod::Newton, IterationMethod::NewtonLineSearch] {
            let mut equal = Chain::spring(stiffening, 30.0);
            let given_up =
                solve_stepped(&mut equal, method, LoadStepping::Equal, 2, 1e-10, 6).unwrap();
            assert!(!given_up.converged, "{method:?}");
            let mut adaptive = Chain::spring(stiffening, 30.0);
            let outcome =
                solve_stepped(&mut adaptive, method, LoadStepping::Adaptive, 2, 1e-10, 6).unwrap();
            assert!(outcome.converged, "{method:?}");
            assert_eq!(outcome.load_factor, 1.0);
            assert!(outcome.increments > 2);
            assert!(adaptive.unbalance(1.0) <= 1e-10);
            assert_eq!(adaptive.u, adaptive.committed);
            assert_eq!(outcome.iterations, adaptive.linearizations);
        }
    }

    #[test]
    fn adaptive_steps_grow_while_convergence_is_easy() {
        let mut equal = Chain::spring(mild, 0.02);
        let mut adaptive = Chain::spring(mild, 0.02);
        let plain = solve_stepped(
            &mut equal,
            IterationMethod::Newton,
            LoadStepping::Equal,
            16,
            1e-6,
            20,
        )
        .unwrap();
        let outcome = solve_stepped(
            &mut adaptive,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
            16,
            1e-6,
            20,
        )
        .unwrap();
        assert!(plain.converged && outcome.converged);
        assert_eq!(plain.increments, 16);
        assert!(
            outcome.increments < 16 && outcome.increments >= 4,
            "{}",
            outcome.increments
        );
        assert_eq!(outcome.load_factor, 1.0);
        assert!((adaptive.u[0] - equal.u[0]).abs() <= 1e-6);
    }

    #[test]
    fn adaptive_steps_stop_at_the_load_the_structure_cannot_pass() {
        let capacity = std::f64::consts::FRAC_PI_2 / 2.0;
        let mut spring = Chain::spring(yielding, 2.0);
        let outcome = solve_stepped(
            &mut spring,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
            4,
            1e-9,
            60,
        )
        .unwrap();
        assert!(!outcome.converged);
        assert!(
            outcome.load_factor < capacity && outcome.load_factor > 0.6 * capacity,
            "{}",
            outcome.load_factor
        );
        assert!(spring.unbalance(outcome.load_factor) <= 1e-9);
        assert_eq!(spring.u, spring.committed);

        let mut stuck = Chain::spring(stiffening, 30.0);
        let outcome = solve_stepped(
            &mut stuck,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
            4,
            1e-10,
            1,
        )
        .unwrap();
        assert_eq!(
            (outcome.converged, outcome.load_factor, outcome.increments),
            (false, 0.0, 0)
        );
        assert_eq!(stuck.u, vec![0.0]);
    }

    #[test]
    fn adaptive_steps_end_exactly_at_the_full_load() {
        for n_increments in [1, 3, 6, 7, 10, 13, 49] {
            let mut spring = Chain::spring(mild, 2.0);
            let outcome = solve_stepped(
                &mut spring,
                IterationMethod::Newton,
                LoadStepping::Adaptive,
                n_increments,
                1e-10,
                50,
            )
            .unwrap();
            assert!(outcome.converged, "{n_increments}");
            assert_eq!(outcome.load_factor, 1.0, "{n_increments}");
            assert!(spring.unbalance(1.0) <= 1e-10, "{n_increments}");
        }
    }

    #[test]
    fn adaptive_steps_pass_on_errors_and_do_nothing_without_increments() {
        let mut spring = Chain::spring(mild, 2.0);
        spring.fail_at = Some(2);
        let recovered = solve_stepped(
            &mut spring,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
            2,
            1e-10,
            9,
        )
        .unwrap();
        assert!(recovered.converged && recovered.load_factor == 1.0);
        assert!(spring.unbalance(1.0) <= 1e-10);

        let mut broken = Chain::spring(softening, 0.0).starting_at(&[1e9]);
        assert_eq!(
            solve_stepped(
                &mut broken,
                IterationMethod::Newton,
                LoadStepping::Adaptive,
                2,
                1e-10,
                9
            )
            .unwrap_err(),
            "the tangent is singular"
        );
        assert_eq!(broken.u, vec![1e9]);
        let mut refused = Chain::spring(mild, 2.0);
        refused.refuse_commit = true;
        assert_eq!(
            solve_stepped(
                &mut refused,
                IterationMethod::Newton,
                LoadStepping::Adaptive,
                2,
                1e-10,
                50
            )
            .unwrap_err(),
            "the state left its branch"
        );
        let mut idle = Chain::spring(mild, 2.0);
        let outcome = solve_stepped(
            &mut idle,
            IterationMethod::Newton,
            LoadStepping::Adaptive,
            0,
            1e-10,
            50,
        )
        .unwrap();
        assert_eq!(
            outcome,
            Outcome {
                iterations: 0,
                converged: true,
                load_factor: 0.0,
                increments: 0
            }
        );
    }

    #[test]
    fn no_increments_or_no_iterations_do_nothing() {
        for method in [
            IterationMethod::Newton,
            IterationMethod::NewtonLineSearch,
            IterationMethod::Anderson { depth: 2 },
        ] {
            let mut spring = Chain::spring(stiffening, 30.0);
            let outcome = solve_by_load_increments_with(&mut spring, method, 0, 1e-10, 50).unwrap();
            assert_eq!(
                outcome,
                Outcome {
                    iterations: 0,
                    converged: true,
                    load_factor: 0.0,
                    increments: 0
                }
            );
            let outcome = solve_by_load_increments_with(&mut spring, method, 3, 1e-10, 0).unwrap();
            assert_eq!(
                outcome,
                Outcome {
                    iterations: 0,
                    converged: false,
                    load_factor: 0.0,
                    increments: 0
                }
            );
            assert_eq!(spring.linearizations, 0);
        }
    }

    #[test]
    fn the_line_search_converges_where_the_full_newton_step_runs_away() {
        let from = [3.0];
        let mut plain = Chain::spring(softening, 0.0).starting_at(&from);
        let ran_away =
            solve_by_load_increments(&mut plain, &Newton { lag_tangent: false }, 1, 1e-10, 30);
        assert!(!ran_away.is_ok_and(|outcome| outcome.converged));
        assert!(plain.trace.last().unwrap() > &1.5);

        let mut searched = Chain::spring(softening, 0.0).starting_at(&from);
        let outcome =
            solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 1e-10, 60).unwrap();
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
        let newton =
            solve_by_load_increments(&mut plain, &Newton { lag_tangent: false }, 3, 1e-11, 50)
                .unwrap();
        let outcome =
            solve_by_load_increments(&mut searched, &NewtonLineSearch, 3, 1e-11, 50).unwrap();
        assert!(newton.converged && outcome.converged);
        assert_eq!(plain.u, searched.u);
        assert_eq!(newton.iterations, outcome.iterations);
        assert_eq!(plain.tangents, searched.tangents);
    }

    #[test]
    fn the_line_search_stays_within_its_budget_of_linearizations() {
        for budget in 1..12 {
            let mut searched = Chain::spring(softening, 0.0).starting_at(&[3.0]);
            let outcome =
                solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 1e-14, budget)
                    .unwrap();
            assert!(
                searched.linearizations <= budget,
                "{budget}: {}",
                searched.linearizations
            );
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
            let plain = solve_by_load_increments(
                &mut modified,
                &Newton { lag_tangent: true },
                n_increments,
                1e-10,
                2000,
            )
            .unwrap();
            assert!(plain.converged);
            let mut newton = Chain::new(mild, 0.7, &load);
            solve_by_load_increments(
                &mut newton,
                &Newton { lag_tangent: false },
                n_increments,
                1e-12,
                200,
            )
            .unwrap();
            for depth in [1, 3, 5] {
                let mut accelerated = Chain::new(mild, 0.7, &load);
                let outcome = solve_by_load_increments(
                    &mut accelerated,
                    &Anderson {
                        depth,
                        lag_tangent: true,
                    },
                    n_increments,
                    1e-10,
                    2000,
                )
                .unwrap();
                assert!(outcome.converged, "depth {depth}");
                assert_eq!(accelerated.tangents, n_increments);
                assert!(accelerated.unbalance(1.0) <= 1e-9);
                for (got, want) in accelerated.u.iter().zip(&newton.u) {
                    assert!((got - want).abs() <= 1e-8, "depth {depth}: {got} vs {want}");
                }
                assert!(
                    outcome.iterations < plain.iterations,
                    "depth {depth}: {} against {}",
                    outcome.iterations,
                    plain.iterations
                );
            }
        }
    }

    #[test]
    fn anderson_of_depth_zero_is_the_plain_iteration() {
        let load = [4.0, -1.0, 2.5];
        let mut modified = Chain::new(mild, 0.7, &load);
        let mut flat = Chain::new(mild, 0.7, &load);
        let plain =
            solve_by_load_increments(&mut modified, &Newton { lag_tangent: true }, 2, 1e-10, 500)
                .unwrap();
        let outcome = solve_by_load_increments(
            &mut flat,
            &Anderson {
                depth: 0,
                lag_tangent: true,
            },
            2,
            1e-10,
            500,
        )
        .unwrap();
        assert!(plain.converged);
        assert_eq!(plain, outcome);
        assert_eq!(modified.u, flat.u);
    }

    #[test]
    fn anderson_with_one_unknown_is_the_secant_method() {
        let mut spring = Chain::spring(mild, 4.0);
        let outcome = solve_by_load_increments(
            &mut spring,
            &Anderson {
                depth: 1,
                lag_tangent: true,
            },
            1,
            1e-12,
            200,
        )
        .unwrap();
        assert!(outcome.converged);
        let tail: Vec<f64> = spring
            .trace
            .iter()
            .copied()
            .filter(|r| *r < 1e-2 && *r > 1e-13)
            .collect();
        assert!(
            tail.len() >= 2 && tail.windows(2).all(|pair| pair[1] <= 0.1 * pair[0]),
            "{:?}",
            spring.trace
        );
        let mut modified = Chain::spring(mild, 4.0);
        let plain =
            solve_by_load_increments(&mut modified, &Newton { lag_tangent: true }, 1, 1e-12, 2000)
                .unwrap();
        assert!(
            !plain.converged,
            "modified Newton oscillates on this spring: {}",
            plain.iterations
        );
        assert!(outcome.iterations <= 12, "{}", outcome.iterations);
    }

    #[test]
    fn a_mix_far_longer_than_the_correction_is_not_taken() {
        let (state, correction) = ([1.0, 2.0], [0.1, -0.2]);
        let sound = vec![(vec![0.3, 0.1], vec![-0.05, 0.02])];
        let taken = mixed(&state, &correction, &sound).expect("a mix of ordinary length");
        assert!(taken.iter().all(|v| v.is_finite()));
        assert_eq!(mixed(&state, &correction, &[]), Some(vec![1.1, 1.8]));

        let thrown = vec![(vec![5e6, -1e7], vec![1e-4, -2e-4])];
        assert_eq!(mixed(&state, &correction, &thrown), None);
        let dependent = vec![
            (vec![0.3, 0.1], vec![1.0, 2.0]),
            (vec![0.1, 0.3], vec![1.0, 2.0]),
        ];
        assert_eq!(mixed(&state, &correction, &dependent), None);
        let poisoned = vec![(vec![f64::INFINITY, 0.1], vec![-0.05, 0.02])];
        assert_eq!(mixed(&state, &correction, &poisoned), None);
    }

    #[test]
    fn a_depth_the_driver_cannot_run_is_refused() {
        for depth in [0, MAX_ANDERSON_DEPTH + 1, usize::MAX] {
            assert_eq!(
                validate(IterationMethod::Anderson { depth }).unwrap_err(),
                "Anderson acceleration needs a depth from 1 to 50"
            );
        }
        for method in [
            IterationMethod::Anderson { depth: 1 },
            IterationMethod::Anderson {
                depth: MAX_ANDERSON_DEPTH,
            },
            IterationMethod::Newton,
            IterationMethod::ModifiedNewton,
            IterationMethod::NewtonLineSearch,
        ] {
            assert_eq!(validate(method), Ok(()));
        }
    }

    #[test]
    fn a_trial_within_tolerance_ends_the_increment_whatever_its_work() {
        let mut searched = Chain::spring(softening, 0.0).starting_at(&[0.5]);
        let outcome =
            solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 0.2, 2).unwrap();
        assert_eq!(
            outcome,
            Outcome {
                iterations: 2,
                converged: true,
                load_factor: 1.0,
                increments: 1
            }
        );
        assert!(searched.unbalance(1.0) < 0.2);
    }

    #[test]
    fn a_step_that_leaves_the_state_non_finite_ends_the_increment_unconverged() {
        fn blowing(u: f64) -> (f64, f64) {
            if u.abs() > 2.0 {
                (f64::NAN, 1.0)
            } else {
                (-u, -1.0)
            }
        }
        let mut searched = Chain::spring(blowing, 5.0).starting_at(&[1.0]);
        let outcome =
            solve_by_load_increments(&mut searched, &NewtonLineSearch, 1, 1e-10, 30).unwrap();
        assert!(!outcome.converged);
        assert!(searched.linearizations < 30, "{}", searched.linearizations);
        assert_eq!(searched.u, vec![1.0]);
    }

    #[test]
    fn a_search_that_runs_out_of_trials_goes_on_from_a_point_that_lowered_the_energy() {
        fn wall_at(wall: f64) -> fn(f64) -> (f64, f64) {
            match (wall * 100.0).round() as usize {
                12 => |u| {
                    if u >= 0.12 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                17 => |u| {
                    if u >= 0.17 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                23 => |u| {
                    if u >= 0.23 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                26 => |u| {
                    if u >= 0.26 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                29 => |u| {
                    if u >= 0.29 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                33 => |u| {
                    if u >= 0.33 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                37 => |u| {
                    if u >= 0.37 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
                _ => |u| {
                    if u >= 0.41 {
                        (u + 100.0, 1.0)
                    } else {
                        (u, 1.0)
                    }
                },
            }
        }
        let mut past_the_wall = 0;
        for wall in [0.12, 0.17, 0.23, 0.26, 0.29, 0.33, 0.37, 0.41] {
            let mut searched = Chain::spring(wall_at(wall), 2.0);
            searched.begin_increment(1.0);
            let mut spent = 0;
            NewtonLineSearch
                .converge(&mut searched, 1e-12, 9, &mut spent)
                .unwrap();
            assert!(spent <= 9);
            past_the_wall += searched
                .corrected_from
                .iter()
                .filter(|u| **u >= wall)
                .count();
        }
        assert_eq!(past_the_wall, 0);
    }

    #[test]
    fn least_squares_solves_and_refuses_dependent_columns() {
        let (a, b, c) = ([1.0, 0.0, 2.0], [0.0, 1.0, 1.0], [1.0, 1.0, 0.0]);
        let target: Vec<f64> = (0..3)
            .map(|i| 2.0 * a[i] - 3.0 * b[i] + 0.5 * c[i])
            .collect();
        let weights = least_squares(&[&a, &b, &c], &target).unwrap();
        for (got, want) in weights.iter().zip([2.0, -3.0, 0.5]) {
            assert!((got - want).abs() <= 1e-12);
        }
        let projected = least_squares(&[&a, &b], &[1.0, 1.0, 1.0]).unwrap();
        let rest: Vec<f64> = (0..3)
            .map(|i| 1.0 - projected[0] * a[i] - projected[1] * b[i])
            .collect();
        assert!(rest.iter().zip(&a).map(|(x, y)| x * y).sum::<f64>().abs() <= 1e-12);
        assert!(rest.iter().zip(&b).map(|(x, y)| x * y).sum::<f64>().abs() <= 1e-12);
        assert_eq!(least_squares(&[&a, &a], &target), None);
        assert_eq!(least_squares(&[&[0.0, 0.0, 0.0]], &target), None);
        assert_eq!(least_squares(&[&[f64::NAN, 0.0, 0.0]], &target), None);
        assert_eq!(least_squares(&[], &target), Some(vec![]));
    }

    #[test]
    #[ignore = "known wrong result: #2401"]
    fn line_search_budget_applies_to_each_load_increment() {
        let mut single = Chain::spring(mild, 4.0);
        let first =
            solve_by_load_increments(&mut single, &NewtonLineSearch, 1, 1e-11, usize::MAX).unwrap();
        assert!(first.converged);
        assert_eq!(first.iterations, single.linearizations);

        let mut half = Chain::spring(mild, 2.0);
        let half =
            solve_by_load_increments(&mut half, &NewtonLineSearch, 1, 1e-11, usize::MAX).unwrap();
        let boundary = usize::MAX - half.iterations;
        let solve = |max_iter| {
            let mut spring = Chain::spring(mild, 4.0);
            let outcome =
                solve_by_load_increments(&mut spring, &NewtonLineSearch, 2, 1e-11, max_iter)
                    .unwrap();
            assert!(outcome.converged, "{outcome:?} at budget {max_iter}");
            assert_eq!(outcome.load_factor, 1.0);
            assert_eq!(outcome.iterations, spring.linearizations);
            assert!(spring.unbalance(1.0) <= 1e-11);
            (outcome, spring.u)
        };
        let at_boundary = solve(boundary);
        assert_eq!(solve(boundary + 1), at_boundary);
        assert_eq!(solve(usize::MAX), at_boundary);
    }

    #[test]
    #[ignore = "known wrong result: #2401"]
    fn line_search_budget_refuses_an_unrepresentable_iteration_total() {
        let mut spring = Chain::spring(mild, 4.0);
        let mut spent = usize::MAX - 1;
        assert_eq!(
            NewtonLineSearch.converge(&mut spring, 1e-11, 0, &mut spent),
            Ok(false)
        );
        assert_eq!(spent, usize::MAX - 1);
        assert_eq!(
            NewtonLineSearch.converge(&mut spring, 1e-11, 1, &mut spent),
            Ok(true)
        );
        assert_eq!(spent, usize::MAX);
        assert_eq!(
            NewtonLineSearch.converge(&mut spring, 1e-11, 0, &mut spent),
            Ok(false)
        );
        assert_eq!(
            NewtonLineSearch
                .converge(&mut spring, 1e-11, 1, &mut spent)
                .as_ref()
                .err()
                .map(String::as_str),
            Some("Nonlinear iteration count exceeds the supported range"),
        );
        assert_eq!(spring.linearizations, 1);
    }
}
