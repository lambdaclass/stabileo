//! Arc-length continuation (Crisfield's spherical constraint) over a [`PathProblem`]: the load
//! factor is an unknown, so the path is followed past limit points, where load control stops.

pub(crate) fn vec_norm(v: &[f64]) -> f64 {
    v.iter().fold(0.0f64, |norm, v| norm.hypot(*v))
}

pub(crate) fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// An equilibrium path r(u, λ) = 0. `measure` and `responses` answer for the last
/// `linearize_at`, and `reference_response` and `responses` may each be asked once for it.
pub(crate) trait PathProblem {
    fn unknowns(&self) -> usize;
    /// The weight of the load factor in the arc-length constraint ‖Δu‖² + Δλ²·scale = Δs².
    fn load_scale(&self) -> f64;
    /// Residual and tangent at the current state under `load_factor`.
    fn linearize_at(&mut self, load_factor: f64);
    /// What the analysis compares with its tolerance.
    fn measure(&mut self, load_factor: f64) -> f64;
    /// K⁻¹·(∂r/∂λ): the tangent to the path, per unit load factor.
    fn reference_response(&mut self) -> Result<Vec<f64>, String>;
    /// K⁻¹·r and K⁻¹·(∂r/∂λ), from one factorization.
    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String>;
    fn advance(&mut self, step: &[f64]);
    /// The current state converged under `load_factor` as step number `step`.
    fn record(&mut self, step: usize, load_factor: f64, iterations: usize);
}

pub(crate) struct ArcLengthControl {
    pub max_steps: usize,
    pub max_iter: usize,
    pub tolerance: f64,
    pub initial_ds: f64,
    pub min_ds: f64,
    pub max_ds: f64,
    /// A step converging in half as many iterations doubles the next arc length; one taking
    /// more than twice as many halves it.
    pub target_iter: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct PathOutcome {
    pub load_factor: f64,
    /// False when a step did not converge at the smallest arc length.
    pub converged: bool,
    pub iterations: usize,
    pub steps: usize,
}

/// Follow the path for `max_steps` converged steps. A step that does not converge is undone
/// and retried at half the arc length; below `min_ds` the solve ends, at the last converged
/// state.
pub(crate) fn solve_by_arc_length<P: PathProblem + ?Sized>(problem: &mut P, control: &ArcLengthControl) -> Result<PathOutcome, String> {
    let nf = problem.unknowns();
    let psi2 = problem.load_scale();
    let mut lambda = 0.0_f64;
    let mut ds = control.initial_ds;
    let mut total_iters = 0;
    let mut overall_converged = true;

    let mut prev_delta_u = vec![0.0; nf];
    let mut prev_delta_lambda = 1.0_f64;

    let mut step = 0;
    while step < control.max_steps {
        problem.linearize_at(lambda);
        let du_hat = problem.reference_response()?;

        let du_hat_norm = vec_norm(&du_hat);
        let denom = du_hat_norm * du_hat_norm + psi2;
        let mut delta_lambda = ds / denom.sqrt();

        let dot = dot_product(&prev_delta_u, &du_hat) + prev_delta_lambda * delta_lambda * psi2;
        if dot < 0.0 {
            delta_lambda = -delta_lambda;
        }

        let mut delta_u: Vec<f64> = du_hat.iter().map(|&v| delta_lambda * v).collect();
        problem.advance(&delta_u);
        lambda += delta_lambda;

        let mut step_converged = false;
        let mut step_iters = 0;

        for _iter in 0..control.max_iter {
            step_iters += 1;
            total_iters += 1;

            problem.linearize_at(lambda);
            if problem.measure(lambda) < control.tolerance {
                step_converged = true;
                break;
            }

            let (du_r, du_t) = problem.responses()?;

            let a_coeff = dot_product(&du_t, &du_t) + psi2;
            let b_coeff = 2.0 * (dot_product(&delta_u, &du_t) + dot_product(&du_r, &du_t)
                + delta_lambda * psi2);
            let c_coeff = dot_product(&delta_u, &delta_u) + 2.0 * dot_product(&delta_u, &du_r)
                + dot_product(&du_r, &du_r)
                + delta_lambda * delta_lambda * psi2
                - ds * ds;

            let discriminant = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
            let d_lambda = if discriminant >= 0.0 {
                let sqrt_d = discriminant.sqrt();
                let root1 = (-b_coeff + sqrt_d) / (2.0 * a_coeff);
                let root2 = (-b_coeff - sqrt_d) / (2.0 * a_coeff);

                let du1: Vec<f64> = (0..nf).map(|i| du_r[i] + root1 * du_t[i]).collect();
                let du2: Vec<f64> = (0..nf).map(|i| du_r[i] + root2 * du_t[i]).collect();
                let work1 = dot_product(&delta_u, &du1);
                let work2 = dot_product(&delta_u, &du2);

                if work1 >= work2 { root1 } else { root2 }
            } else {
                -b_coeff / (2.0 * a_coeff)
            };

            let du: Vec<f64> = (0..nf).map(|i| du_r[i] + d_lambda * du_t[i]).collect();
            problem.advance(&du);
            for i in 0..nf {
                delta_u[i] += du[i];
            }
            lambda += d_lambda;
            delta_lambda += d_lambda;
        }

        if !step_converged {
            let back: Vec<f64> = delta_u.iter().map(|d| -d).collect();
            problem.advance(&back);
            lambda -= delta_lambda;

            ds *= 0.5;
            if ds < control.min_ds {
                overall_converged = false;
                break;
            }
            continue;
        }

        step += 1;
        problem.record(step, lambda, step_iters);

        prev_delta_u = delta_u;
        prev_delta_lambda = delta_lambda;

        if step_iters <= control.target_iter / 2 {
            ds = (ds * 2.0).min(control.max_ds);
        } else if step_iters > control.target_iter * 2 {
            ds = (ds * 0.5).max(control.min_ds);
        }
    }

    Ok(PathOutcome { load_factor: lambda, converged: overall_converged, iterations: total_iters, steps: step })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One unknown: force(u) = λ, with a force that rises, falls and rises again.
    struct Snap {
        u: f64,
        residual: f64,
        stiffness: f64,
        path: Vec<(f64, f64)>,
        fail_at: Option<usize>,
        solves: usize,
    }

    fn force(u: f64) -> f64 {
        u * u * u - 3.0 * u * u + 2.5 * u
    }

    const FIRST_LIMIT: f64 = 0.591_751_709_536_136_9;
    const SECOND_LIMIT: f64 = 1.408_248_290_463_863;

    impl Snap {
        fn new() -> Self {
            Snap { u: 0.0, residual: 0.0, stiffness: 0.0, path: Vec::new(), fail_at: None, solves: 0 }
        }
    }

    impl PathProblem for Snap {
        fn unknowns(&self) -> usize {
            1
        }
        fn load_scale(&self) -> f64 {
            1.0
        }
        fn linearize_at(&mut self, load_factor: f64) {
            self.residual = load_factor - force(self.u);
            self.stiffness = 3.0 * self.u * self.u - 6.0 * self.u + 2.5;
        }
        fn measure(&mut self, _: f64) -> f64 {
            self.residual.abs()
        }
        fn reference_response(&mut self) -> Result<Vec<f64>, String> {
            self.solves += 1;
            if self.fail_at == Some(self.solves) {
                return Err("the tangent cannot be factorized".into());
            }
            Ok(vec![1.0 / self.stiffness])
        }
        fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
            self.solves += 1;
            if self.fail_at == Some(self.solves) {
                return Err("the tangent cannot be factorized".into());
            }
            Ok((vec![self.residual / self.stiffness], vec![1.0 / self.stiffness]))
        }
        fn advance(&mut self, step: &[f64]) {
            self.u += step[0];
        }
        fn record(&mut self, step: usize, load_factor: f64, _: usize) {
            assert_eq!(step, self.path.len() + 1);
            self.path.push((self.u, load_factor));
        }
    }

    fn control(max_steps: usize) -> ArcLengthControl {
        ArcLengthControl { max_steps, max_iter: 30, tolerance: 1e-10, initial_ds: 0.05, min_ds: 1e-8, max_ds: 0.2, target_iter: 5 }
    }

    #[test]
    fn the_path_is_followed_past_both_limit_points() {
        let mut snap = Snap::new();
        let outcome = solve_by_arc_length(&mut snap, &control(60)).unwrap();
        assert!(outcome.converged);
        assert_eq!(outcome.steps, 60);
        assert_eq!(snap.path.len(), 60);
        for &(u, load_factor) in &snap.path {
            assert!((load_factor - force(u)).abs() <= 1e-10, "({u}, {load_factor})");
        }
        assert!(snap.path.windows(2).all(|pair| pair[1].0 > pair[0].0), "the displacement goes back");
        let (last_u, last_load) = *snap.path.last().unwrap();
        assert!(last_u > 2.0 && last_load > force(FIRST_LIMIT), "ends at ({last_u}, {last_load})");
        assert_eq!(outcome.load_factor, last_load);
        let on_the_descent = snap.path.iter().filter(|(u, _)| *u > FIRST_LIMIT && *u < SECOND_LIMIT).count();
        assert!(on_the_descent >= 3, "{on_the_descent} steps between the limit points");
        let highest_before = snap.path.iter().filter(|(u, _)| *u < 1.0).map(|p| p.1).fold(f64::MIN, f64::max);
        assert!(highest_before <= force(FIRST_LIMIT) + 1e-10 && highest_before >= 0.9 * force(FIRST_LIMIT));
    }

    #[test]
    fn every_step_is_within_its_arc_length_of_the_one_before() {
        let mut snap = Snap::new();
        let limits = control(40);
        solve_by_arc_length(&mut snap, &limits).unwrap();
        let mut before = (0.0, 0.0);
        for &point in &snap.path {
            let length = (point.0 - before.0).hypot(point.1 - before.1);
            assert!(length <= limits.max_ds * (1.0 + 1e-9) && length >= limits.min_ds, "{length}");
            before = point;
        }
    }

    #[test]
    fn the_arc_length_grows_while_steps_converge_easily_and_never_past_its_limit() {
        let mut snap = Snap::new();
        let limits = ArcLengthControl { tolerance: 1e-3, initial_ds: 1e-3, ..control(12) };
        solve_by_arc_length(&mut snap, &limits).unwrap();
        let lengths: Vec<f64> = std::iter::once((0.0, 0.0)).chain(snap.path.iter().copied()).collect::<Vec<_>>()
            .windows(2).map(|pair| (pair[1].0 - pair[0].0).hypot(pair[1].1 - pair[0].1)).collect();
        assert!(lengths[3] > 4.0 * lengths[0], "{lengths:?}");
        assert!(lengths.iter().all(|length| *length <= limits.max_ds * (1.0 + 1e-9)), "{lengths:?}");
    }

    #[test]
    fn a_step_that_does_not_converge_is_retried_shorter_from_the_last_converged_state() {
        let mut snap = Snap::new();
        let tight = ArcLengthControl { max_iter: 2, initial_ds: 0.2, ..control(10) };
        let outcome = solve_by_arc_length(&mut snap, &tight).unwrap();
        assert!(outcome.converged);
        assert_eq!(outcome.steps, 10);
        for &(u, load_factor) in &snap.path {
            assert!((load_factor - force(u)).abs() <= 1e-10);
        }
        let first = snap.path[0];
        assert!(first.0.hypot(first.1) < 0.2 * 0.75, "the first step was not shortened: {first:?}");
    }

    #[test]
    fn a_step_that_never_converges_ends_the_solve_at_the_last_converged_state() {
        let mut snap = Snap::new();
        let hopeless = ArcLengthControl { max_iter: 1, min_ds: 1e-3, ..control(10) };
        let outcome = solve_by_arc_length(&mut snap, &hopeless).unwrap();
        assert_eq!(outcome, PathOutcome { load_factor: 0.0, converged: false, iterations: outcome.iterations, steps: 0 });
        assert!(snap.path.is_empty());
        assert!(snap.u.abs() <= 1e-15);
        assert!(outcome.iterations >= 5);

        let mut snap = Snap::new();
        let fading = ArcLengthControl { tolerance: 1e-10, max_iter: 4, ..control(3) };
        let reached = solve_by_arc_length(&mut snap, &fading).unwrap();
        let mut again = Snap::new();
        let cut = ArcLengthControl { max_iter: 1, min_ds: 0.04, ..control(3) };
        let stopped = solve_by_arc_length(&mut again, &cut).unwrap();
        assert!(reached.converged && !stopped.converged);
    }

    #[test]
    fn an_error_of_the_problem_ends_the_solve() {
        for fail_at in [1, 2, 5] {
            let mut snap = Snap::new();
            snap.fail_at = Some(fail_at);
            assert_eq!(solve_by_arc_length(&mut snap, &control(20)).unwrap_err(), "the tangent cannot be factorized");
            assert_eq!(snap.solves, fail_at);
        }
    }

    #[test]
    fn no_steps_do_nothing() {
        let mut snap = Snap::new();
        let outcome = solve_by_arc_length(&mut snap, &control(0)).unwrap();
        assert_eq!(outcome, PathOutcome { load_factor: 0.0, converged: true, iterations: 0, steps: 0 });
        assert_eq!(snap.solves, 0);
    }

    #[test]
    fn the_norm_and_the_dot_product_are_the_ones_the_solver_has_always_used() {
        assert_eq!(vec_norm(&[3.0, 4.0]), 5.0);
        assert_eq!(vec_norm(&[]), 0.0);
        assert_eq!(vec_norm(&[1e200, 1e200]), 1e200 * 2f64.sqrt());
        assert_eq!(dot_product(&[1.0, 2.0, 3.0], &[4.0, -5.0, 6.0]), 12.0);
    }
}
