pub(crate) fn vec_norm(v: &[f64]) -> f64 {
    v.iter().fold(0.0f64, |norm, v| norm.hypot(*v))
}

pub(crate) fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

pub(crate) trait PathProblem {
    fn unknowns(&self) -> usize;
    fn load_scale(&self) -> f64;
    fn linearize_at(&mut self, load_factor: f64);
    fn measure(&mut self, load_factor: f64) -> f64;
    fn reference_response(&mut self) -> Result<Vec<f64>, String>;
    fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String>;
    fn advance(&mut self, step: &[f64]);
    fn unknown(&self, index: usize) -> f64;
    fn record(&mut self, step: usize, load_factor: f64, iterations: usize, converged: bool);
}

pub(crate) struct ArcLengthControl {
    pub max_steps: usize,
    pub max_iter: usize,
    pub tolerance: f64,
    pub initial_ds: f64,
    pub min_ds: f64,
    pub max_ds: f64,
    pub target_iter: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct PathOutcome {
    pub load_factor: f64,
    pub converged: bool,
    pub iterations: usize,
    pub steps: usize,
}

pub(crate) fn solve_by_arc_length<P: PathProblem + ?Sized>(
    problem: &mut P,
    control: &ArcLengthControl,
) -> Result<PathOutcome, String> {
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
            let b_coeff = 2.0
                * (dot_product(&delta_u, &du_t) + dot_product(&du_r, &du_t) + delta_lambda * psi2);
            let c_coeff = dot_product(&delta_u, &delta_u)
                + 2.0 * dot_product(&delta_u, &du_r)
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

                if work1 >= work2 {
                    root1
                } else {
                    root2
                }
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
        problem.record(step, lambda, step_iters, true);

        prev_delta_u = delta_u;
        prev_delta_lambda = delta_lambda;

        if step_iters <= control.target_iter / 2 {
            ds = (ds * 2.0).min(control.max_ds);
        } else if step_iters > control.target_iter * 2 {
            ds = (ds * 0.5).max(control.min_ds);
        }
    }

    Ok(PathOutcome {
        load_factor: lambda,
        converged: overall_converged,
        iterations: total_iters,
        steps: step,
    })
}

pub(crate) struct DisplacementControl {
    pub control: usize,
    pub target: f64,
    pub n_steps: usize,
    pub max_iter: usize,
    pub tolerance: f64,
}

pub(crate) fn solve_by_displacement_control<P: PathProblem + ?Sized>(
    problem: &mut P,
    control: &DisplacementControl,
) -> Result<PathOutcome, String> {
    let nf = problem.unknowns();
    let ctrl = control.control;
    let mut lambda = 0.0_f64;
    let mut total_iters = 0;
    let mut overall_converged = true;
    let mut taken = 0;

    let delta_d = control.target / control.n_steps as f64;
    let disp_scale = delta_d.abs();

    for step in 0..control.n_steps {
        let target_disp = (step + 1) as f64 * delta_d;

        let mut step_converged = false;
        let mut step_iters = 0;

        for _iter in 0..control.max_iter {
            step_iters += 1;
            total_iters += 1;

            problem.linearize_at(lambda);
            let disp_error = target_disp - problem.unknown(ctrl);
            let rel_error = problem.measure(lambda);
            let disp_ok = disp_error.abs() <= control.tolerance * disp_scale;
            if rel_error < control.tolerance && disp_ok {
                step_converged = true;
                break;
            }

            let (du_r, du_t) = problem.responses()?;

            let step = (disp_error - du_r[ctrl]) / du_t[ctrl];
            let d_lambda = Some(step)
                .filter(|step| du_t[ctrl] != 0.0 && step.is_finite())
                .map_or(0.0, |step| step);

            let du: Vec<f64> = (0..nf).map(|i| du_r[i] + d_lambda * du_t[i]).collect();
            problem.advance(&du);
            lambda += d_lambda;
        }

        taken = step + 1;
        problem.record(taken, lambda, step_iters, step_converged);

        if !step_converged {
            overall_converged = false;
            break;
        }
    }

    Ok(PathOutcome {
        load_factor: lambda,
        converged: overall_converged,
        iterations: total_iters,
        steps: taken,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Probe {
        displacement: f64,
        load: f64,
        force: fn(f64) -> f64,
        tangent: fn(f64) -> f64,
        trials: Vec<(f64, f64)>,
        accepted: Vec<(f64, f64)>,
        checkpoints: Vec<(f64, f64)>,
        failed_correction: Option<f64>,
        scale: f64,
    }

    impl Probe {
        fn new(force: fn(f64) -> f64, tangent: fn(f64) -> f64) -> Self {
            Self {
                displacement: 0.0,
                load: 0.0,
                force,
                tangent,
                trials: Vec::new(),
                accepted: Vec::new(),
                checkpoints: Vec::new(),
                failed_correction: None,
                scale: 1.0,
            }
        }
    }

    impl PathProblem for Probe {
        fn unknowns(&self) -> usize {
            1
        }

        fn load_scale(&self) -> f64 {
            1.0
        }

        fn linearize_at(&mut self, load: f64) {
            self.load = load;
        }

        fn measure(&mut self, load: f64) -> f64 {
            self.trials.push((self.displacement, load));
            if self.failed_correction.is_some() && !self.accepted.is_empty() {
                return 1.0;
            }
            (load - self.scale * (self.force)(self.displacement / self.scale)).abs()
        }

        fn reference_response(&mut self) -> Result<Vec<f64>, String> {
            self.checkpoints.push((self.displacement, self.load));
            Ok(vec![1.0 / (self.tangent)(self.displacement / self.scale)])
        }

        fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
            let u = self.displacement / self.scale;
            let reference = 1.0 / (self.tangent)(u);
            let correction = self
                .failed_correction
                .unwrap_or((self.load - self.scale * (self.force)(u)) * reference);
            Ok((vec![correction], vec![reference]))
        }

        fn advance(&mut self, step: &[f64]) {
            self.displacement += step[0];
        }

        fn unknown(&self, _: usize) -> f64 {
            self.displacement
        }

        fn record(&mut self, _: usize, load: f64, _: usize, converged: bool) {
            assert!(converged);
            self.accepted.push((self.displacement, load));
        }
    }

    #[test]
    #[ignore = "known wrong result: #2484"]
    fn issue_2484_predictor_direction_does_not_depend_on_radius() {
        for scale in [1.0, 0.5, 0.25, 0.125] {
            let mut probe = Probe::new(
                |u| u + 3.0 * u * u - 3.0 * u * u * u,
                |u| 1.0 + 6.0 * u - 9.0 * u * u,
            );
            probe.scale = scale;
            let ds = std::f64::consts::SQRT_2 * scale;
            let mut limits = control(2);
            limits.initial_ds = ds;
            limits.min_ds = ds;
            limits.max_ds = ds;
            let _ = solve_by_arc_length(&mut probe, &limits).unwrap();
            assert_eq!(probe.accepted[0], (scale, scale));
            let (u, load) = probe.trials[1];
            assert!(u < scale && load > scale, "radius {ds}: ({u}, {load})");
        }
    }

    #[test]
    #[ignore = "known wrong result: #2484"]
    fn issue_2484_corrector_ranks_roots_using_the_load_component() {
        let mut probe = Probe::new(
            |u| u + 2.25 * u * u - 2.5 * u * u * u,
            |u| 1.0 + 4.5 * u - 7.5 * u * u,
        );
        let mut limits = control(1);
        limits.initial_ds = std::f64::consts::SQRT_2;
        let _ = solve_by_arc_length(&mut probe, &limits).unwrap();
        assert_eq!(probe.trials[0], (1.0, 1.0));
        let (u, load) = probe.trials[1];
        assert!(u < 1.0 && load > 1.0, "({u}, {load})");
        assert!((u.hypot(load) - limits.initial_ds).abs() <= limits.tolerance);
    }

    #[test]
    #[ignore = "known wrong result: #2484"]
    fn issue_2484_quartic_spring_only_records_equilibrium_on_the_sphere() {
        let ds = std::f64::consts::SQRT_2;
        for min_ds in [ds, ds / 2.0, ds / 4.0, ds / 8.0] {
            let mut spring = Probe::new(
                |u| u + 9.0 * u * u - 2.0 * u.powi(3) - 3.0 * u.powi(4),
                |u| 1.0 + 18.0 * u - 6.0 * u * u - 12.0 * u.powi(3),
            );
            let mut limits = control(1);
            limits.initial_ds = ds;
            limits.min_ds = min_ds;
            limits.max_ds = ds;
            let outcome = solve_by_arc_length(&mut spring, &limits).unwrap();
            if min_ds == ds {
                assert!(!outcome.converged, "{:?}", spring.accepted);
                assert!(spring.accepted.is_empty());
            } else if outcome.converged {
                let (u, load) = spring.accepted[0];
                let requested = ds / 2f64.powi(spring.checkpoints.len() as i32 - 1);
                assert!((u.hypot(load) - requested).abs() <= limits.tolerance);
                assert!((load - (spring.force)(u)).abs() <= limits.tolerance);
            }
            if min_ds == ds / 8.0 {
                assert!(outcome.converged);
            }
        }
    }

    #[test]
    #[ignore = "known wrong result: #2484"]
    fn issue_2484_failed_trial_restores_the_last_accepted_point_exactly() {
        let ds = std::f64::consts::SQRT_2;
        for min_ds in [ds, ds / 2.0] {
            let mut probe = Probe::new(|u| u, |_| 1.0);
            probe.failed_correction = Some(1e20);
            let mut limits = control(2);
            limits.initial_ds = ds;
            limits.min_ds = min_ds;
            limits.max_ds = ds;
            limits.max_iter = 2;
            let outcome = solve_by_arc_length(&mut probe, &limits).unwrap();
            assert!(!outcome.converged);
            assert_eq!(probe.accepted, [(1.0, 1.0)]);
            assert_eq!((probe.displacement, outcome.load_factor), probe.accepted[0]);
            assert_eq!(&probe.checkpoints[1..], vec![(1.0, 1.0); if min_ds == ds { 1 } else { 2 }]);
        }
    }

    struct Snap {
        u: f64,
        residual: f64,
        stiffness: f64,
        path: Vec<(f64, f64)>,
        unconverged: usize,
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
            Snap {
                u: 0.0,
                residual: 0.0,
                stiffness: 0.0,
                path: Vec::new(),
                unconverged: 0,
                fail_at: None,
                solves: 0,
            }
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
            Ok((
                vec![self.residual / self.stiffness],
                vec![1.0 / self.stiffness],
            ))
        }
        fn advance(&mut self, step: &[f64]) {
            self.u += step[0];
        }
        fn unknown(&self, index: usize) -> f64 {
            assert_eq!(index, 0);
            self.u
        }
        fn record(&mut self, step: usize, load_factor: f64, _: usize, converged: bool) {
            assert_eq!(step, self.path.len() + 1);
            self.path.push((self.u, load_factor));
            if !converged {
                self.unconverged += 1;
            }
        }
    }

    fn control(max_steps: usize) -> ArcLengthControl {
        ArcLengthControl {
            max_steps,
            max_iter: 30,
            tolerance: 1e-10,
            initial_ds: 0.05,
            min_ds: 1e-8,
            max_ds: 0.2,
            target_iter: 5,
        }
    }

    #[test]
    fn the_path_is_followed_past_both_limit_points() {
        let mut snap = Snap::new();
        let outcome = solve_by_arc_length(&mut snap, &control(60)).unwrap();
        assert!(outcome.converged);
        assert_eq!(outcome.steps, 60);
        assert_eq!(snap.path.len(), 60);
        for &(u, load_factor) in &snap.path {
            assert!(
                (load_factor - force(u)).abs() <= 1e-10,
                "({u}, {load_factor})"
            );
        }
        assert!(
            snap.path.windows(2).all(|pair| pair[1].0 > pair[0].0),
            "the displacement goes back"
        );
        let (last_u, last_load) = *snap.path.last().unwrap();
        assert!(
            last_u > 2.0 && last_load > force(FIRST_LIMIT),
            "ends at ({last_u}, {last_load})"
        );
        assert_eq!(outcome.load_factor, last_load);
        let on_the_descent = snap
            .path
            .iter()
            .filter(|(u, _)| *u > FIRST_LIMIT && *u < SECOND_LIMIT)
            .count();
        assert!(
            on_the_descent >= 3,
            "{on_the_descent} steps between the limit points"
        );
        let highest_before = snap
            .path
            .iter()
            .filter(|(u, _)| *u < 1.0)
            .map(|p| p.1)
            .fold(f64::MIN, f64::max);
        assert!(
            highest_before <= force(FIRST_LIMIT) + 1e-10
                && highest_before >= 0.9 * force(FIRST_LIMIT)
        );
    }

    #[test]
    fn every_step_is_within_its_arc_length_of_the_one_before() {
        let mut snap = Snap::new();
        let limits = control(40);
        solve_by_arc_length(&mut snap, &limits).unwrap();
        let mut before = (0.0, 0.0);
        for &point in &snap.path {
            let length = (point.0 - before.0).hypot(point.1 - before.1);
            assert!(
                length <= limits.max_ds * (1.0 + 1e-9) && length >= limits.min_ds,
                "{length}"
            );
            before = point;
        }
    }

    #[test]
    fn the_arc_length_grows_while_steps_converge_easily_and_never_past_its_limit() {
        let mut snap = Snap::new();
        let limits = ArcLengthControl {
            tolerance: 1e-3,
            initial_ds: 1e-3,
            ..control(12)
        };
        solve_by_arc_length(&mut snap, &limits).unwrap();
        let lengths: Vec<f64> = std::iter::once((0.0, 0.0))
            .chain(snap.path.iter().copied())
            .collect::<Vec<_>>()
            .windows(2)
            .map(|pair| (pair[1].0 - pair[0].0).hypot(pair[1].1 - pair[0].1))
            .collect();
        assert!(lengths[3] > 4.0 * lengths[0], "{lengths:?}");
        assert!(
            lengths
                .iter()
                .all(|length| *length <= limits.max_ds * (1.0 + 1e-9)),
            "{lengths:?}"
        );
    }

    #[test]
    fn a_step_that_does_not_converge_is_retried_shorter_from_the_last_converged_state() {
        let mut snap = Snap::new();
        let tight = ArcLengthControl {
            max_iter: 2,
            initial_ds: 0.2,
            ..control(10)
        };
        let outcome = solve_by_arc_length(&mut snap, &tight).unwrap();
        assert!(outcome.converged);
        assert_eq!(outcome.steps, 10);
        for &(u, load_factor) in &snap.path {
            assert!((load_factor - force(u)).abs() <= 1e-10);
        }
        let first = snap.path[0];
        assert!(
            first.0.hypot(first.1) < 0.2 * 0.75,
            "the first step was not shortened: {first:?}"
        );
    }

    #[test]
    fn a_step_that_never_converges_ends_the_solve_at_the_last_converged_state() {
        let mut snap = Snap::new();
        let hopeless = ArcLengthControl {
            max_iter: 1,
            min_ds: 1e-3,
            ..control(10)
        };
        let outcome = solve_by_arc_length(&mut snap, &hopeless).unwrap();
        assert_eq!(
            outcome,
            PathOutcome {
                load_factor: 0.0,
                converged: false,
                iterations: outcome.iterations,
                steps: 0
            }
        );
        assert!(snap.path.is_empty());
        assert!(snap.u.abs() <= 1e-15);
        assert!(outcome.iterations >= 5);

        let mut snap = Snap::new();
        let fading = ArcLengthControl {
            tolerance: 1e-10,
            max_iter: 4,
            ..control(3)
        };
        let reached = solve_by_arc_length(&mut snap, &fading).unwrap();
        let mut again = Snap::new();
        let cut = ArcLengthControl {
            max_iter: 1,
            min_ds: 0.04,
            ..control(3)
        };
        let stopped = solve_by_arc_length(&mut again, &cut).unwrap();
        assert!(reached.converged && !stopped.converged);
    }

    #[test]
    fn an_error_of_the_problem_ends_the_solve() {
        for fail_at in [1, 2, 5] {
            let mut snap = Snap::new();
            snap.fail_at = Some(fail_at);
            assert_eq!(
                solve_by_arc_length(&mut snap, &control(20)).unwrap_err(),
                "the tangent cannot be factorized"
            );
            assert_eq!(snap.solves, fail_at);
        }
    }

    #[test]
    fn no_steps_do_nothing() {
        let mut snap = Snap::new();
        let outcome = solve_by_arc_length(&mut snap, &control(0)).unwrap();
        assert_eq!(
            outcome,
            PathOutcome {
                load_factor: 0.0,
                converged: true,
                iterations: 0,
                steps: 0
            }
        );
        assert_eq!(snap.solves, 0);
    }

    fn driven(target: f64, n_steps: usize, max_iter: usize) -> DisplacementControl {
        DisplacementControl {
            control: 0,
            target,
            n_steps,
            max_iter,
            tolerance: 1e-10,
        }
    }

    #[test]
    fn a_driven_displacement_follows_the_path_down_and_up_again() {
        let mut snap = Snap::new();
        let outcome = solve_by_displacement_control(&mut snap, &driven(2.5, 50, 30)).unwrap();
        assert!(outcome.converged);
        assert_eq!(
            (outcome.steps, snap.path.len(), snap.unconverged),
            (50, 50, 0)
        );
        for (k, &(u, load_factor)) in snap.path.iter().enumerate() {
            assert!((u - 0.05 * (k + 1) as f64).abs() <= 1e-11, "step {k}: {u}");
            assert!(
                (load_factor - force(u)).abs() <= 1e-9,
                "({u}, {load_factor})"
            );
        }
        let falling = snap
            .path
            .windows(2)
            .filter(|pair| pair[1].1 < pair[0].1)
            .count();
        assert!(falling >= 10, "{falling} steps with a falling load");
        assert_eq!(outcome.load_factor, snap.path.last().unwrap().1);
    }

    #[test]
    fn a_displacement_can_be_driven_the_other_way() {
        let mut snap = Snap::new();
        let outcome = solve_by_displacement_control(&mut snap, &driven(-0.5, 10, 30)).unwrap();
        assert!(outcome.converged);
        let (u, load_factor) = *snap.path.last().unwrap();
        assert!((u + 0.5).abs() <= 1e-11 && (load_factor - force(-0.5)).abs() <= 1e-9);
    }

    #[test]
    fn a_step_that_does_not_converge_is_recorded_and_ends_the_solve() {
        let mut snap = Snap::new();
        let outcome = solve_by_displacement_control(&mut snap, &driven(2.5, 5, 2)).unwrap();
        assert!(!outcome.converged);
        assert_eq!(snap.unconverged, 1);
        assert_eq!(outcome.steps, snap.path.len());
        assert!(outcome.steps < 5);
        assert_eq!(outcome.iterations, 2 * outcome.steps);
    }

    #[test]
    fn a_response_that_does_not_move_the_driven_unknown_leaves_the_load_factor() {
        struct Stuck(Snap);
        impl PathProblem for Stuck {
            fn unknowns(&self) -> usize {
                1
            }
            fn load_scale(&self) -> f64 {
                1.0
            }
            fn linearize_at(&mut self, load_factor: f64) {
                self.0.linearize_at(load_factor)
            }
            fn measure(&mut self, load_factor: f64) -> f64 {
                self.0.measure(load_factor)
            }
            fn reference_response(&mut self) -> Result<Vec<f64>, String> {
                Ok(vec![0.0])
            }
            fn responses(&mut self) -> Result<(Vec<f64>, Vec<f64>), String> {
                Ok((vec![0.0], vec![0.0]))
            }
            fn advance(&mut self, step: &[f64]) {
                self.0.advance(step)
            }
            fn unknown(&self, index: usize) -> f64 {
                self.0.unknown(index)
            }
            fn record(
                &mut self,
                step: usize,
                load_factor: f64,
                iterations: usize,
                converged: bool,
            ) {
                self.0.record(step, load_factor, iterations, converged)
            }
        }
        let mut stuck = Stuck(Snap::new());
        let outcome = solve_by_displacement_control(&mut stuck, &driven(1.0, 3, 4)).unwrap();
        assert_eq!(
            outcome,
            PathOutcome {
                load_factor: 0.0,
                converged: false,
                iterations: 4,
                steps: 1
            }
        );
        assert_eq!(stuck.0.u, 0.0);
    }

    #[test]
    fn displacement_control_passes_on_errors() {
        let mut snap = Snap::new();
        snap.fail_at = Some(3);
        assert_eq!(
            solve_by_displacement_control(&mut snap, &driven(2.5, 50, 30)).unwrap_err(),
            "the tangent cannot be factorized"
        );
        assert_eq!(snap.solves, 3);
    }

    #[test]
    fn the_norm_and_the_dot_product_are_the_ones_the_solver_has_always_used() {
        assert_eq!(vec_norm(&[3.0, 4.0]), 5.0);
        assert_eq!(vec_norm(&[]), 0.0);
        assert_eq!(vec_norm(&[1e200, 1e200]), 1e200 * 2f64.sqrt());
        assert_eq!(dot_product(&[1.0, 2.0, 3.0], &[4.0, -5.0, 6.0]), 12.0);
    }
}
