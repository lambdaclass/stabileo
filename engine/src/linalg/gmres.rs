//! Restarted GMRES for general square systems: unsymmetric or indefinite ones, which
//! `pcg_solve` cannot take. Deterministic and single-threaded.
use super::preconditioner::Preconditioner;

#[derive(Debug, Clone)]
pub struct GmresResult {
    pub x: Vec<f64>,
    /// Applications of the operator inside the Krylov cycles.
    pub iterations: usize,
    /// Krylov cycles started.
    pub cycles: usize,
    /// ‖b − A·x‖₂/‖b‖₂ recomputed from `x`, never the recurrence's estimate.
    pub final_rel_residual: f64,
    pub converged: bool,
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Scaled by the largest entry: the plain sum of squares takes [1e-200] for zero and [1e200]
/// for infinite.
fn norm(a: &[f64]) -> f64 {
    if a.iter().any(|v| v.is_nan()) {
        return f64::NAN;
    }
    let largest = a.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    if largest == 0.0 || largest.is_infinite() {
        return largest;
    }
    largest * a.iter().map(|v| (v / largest) * (v / largest)).sum::<f64>().sqrt()
}

fn finite(a: &[f64]) -> bool {
    a.iter().all(|v| v.is_finite())
}

/// Solve A·x = b by GMRES(`restart`) from x₀ = 0, right-preconditioned: the Krylov space is that
/// of A·M⁻¹, so the residual it minimizes is the residual of the original system.
///
/// `apply(v, out)` writes A·v into `out`. `converged` is true only when the residual recomputed
/// from `x` is within `tol`; a zero right-hand side returns x = 0. The solve stops unconverged
/// when `max_iter` operator applications are spent, when a cycle fails to reduce the true
/// residual (restarted GMRES can stagnate for ever, and does on a singular inconsistent system),
/// or when the operator or the preconditioner returns a non-finite number. `x` is then the last
/// iterate that reduced the residual, and is always finite. Panics when `restart` is zero.
pub fn gmres_solve(
    apply: &dyn Fn(&[f64], &mut [f64]),
    b: &[f64],
    pre: &dyn Preconditioner,
    restart: usize,
    tol: f64,
    max_iter: usize,
) -> GmresResult {
    let n = b.len();
    assert!(restart > 0, "restart length must be positive");
    let bnorm = norm(b);
    let mut x = vec![0.0; n];
    if bnorm == 0.0 {
        return GmresResult { x, iterations: 0, cycles: 0, final_rel_residual: 0.0, converged: true };
    }
    let unconverged = |x: Vec<f64>, iterations, cycles, rel| GmresResult { x, iterations, cycles, final_rel_residual: rel, converged: false };
    if !bnorm.is_finite() {
        return unconverged(x, 0, 0, f64::INFINITY);
    }

    let mut r = b.to_vec();
    let mut rel = 1.0;
    let mut beta = bnorm;
    let (mut iterations, mut cycles) = (0, 0);
    let mut z = vec![0.0; n];
    let mut w = vec![0.0; n];
    loop {
        if rel <= tol {
            return GmresResult { x, iterations, cycles, final_rel_residual: rel, converged: true };
        }
        if iterations >= max_iter {
            return unconverged(x, iterations, cycles, rel);
        }
        cycles += 1;
        let mut basis: Vec<Vec<f64>> = vec![r.iter().map(|v| v / beta).collect()];
        let mut upper: Vec<Vec<f64>> = Vec::new();
        let mut rotations: Vec<(f64, f64)> = Vec::new();
        let mut g = vec![beta];
        while upper.len() < restart && iterations < max_iter {
            let j = upper.len();
            pre.apply(&basis[j], &mut z);
            if !finite(&z) {
                return unconverged(x, iterations, cycles, rel);
            }
            apply(&z, &mut w);
            iterations += 1;
            let mut h = Vec::with_capacity(j + 2);
            for v in &basis {
                let c = dot(&w, v);
                w.iter_mut().zip(v).for_each(|(a, b)| *a -= c * b);
                h.push(c);
            }
            let next = norm(&w);
            if !next.is_finite() {
                return unconverged(x, iterations, cycles, rel);
            }
            for (i, &(c, s)) in rotations.iter().enumerate() {
                let (a, b) = (h[i], h[i + 1]);
                h[i] = c * a + s * b;
                h[i + 1] = c * b - s * a;
            }
            let pivot = h[j].hypot(next);
            if pivot == 0.0 {
                break;
            }
            let (c, s) = (h[j] / pivot, next / pivot);
            h[j] = pivot;
            rotations.push((c, s));
            upper.push(h);
            let last = g[j];
            g[j] = c * last;
            g.push(-s * last);
            if next == 0.0 || g[j + 1].abs() <= tol * bnorm {
                break;
            }
            basis.push(w.iter().map(|v| v / next).collect());
        }

        let k = upper.len();
        let mut y = vec![0.0; k];
        for i in (0..k).rev() {
            let known: f64 = (i + 1..k).map(|c| upper[c][i] * y[c]).sum();
            y[i] = (g[i] - known) / upper[i][i];
        }
        let mut combination = vec![0.0; n];
        for (coefficient, v) in y.iter().zip(&basis) {
            combination.iter_mut().zip(v).for_each(|(a, b)| *a += coefficient * b);
        }
        pre.apply(&combination, &mut z);
        let candidate: Vec<f64> = x.iter().zip(&z).map(|(a, b)| a + b).collect();
        if !finite(&candidate) {
            return unconverged(x, iterations, cycles, rel);
        }
        apply(&candidate, &mut w);
        let residual: Vec<f64> = b.iter().zip(&w).map(|(bi, wi)| bi - wi).collect();
        let remaining = norm(&residual);
        let reduced = remaining / bnorm;
        if !reduced.is_finite() || reduced >= rel {
            return unconverged(x, iterations, cycles, rel);
        }
        x = candidate;
        r = residual;
        rel = reduced;
        beta = remaining;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::preconditioner::IdentityPreconditioner;
    use crate::linalg::{lu_solve, pcg_solve, CscMatrix};

    struct Diagonal(Vec<f64>);

    impl Preconditioner for Diagonal {
        fn apply(&self, r: &[f64], z: &mut [f64]) {
            for ((zi, ri), d) in z.iter_mut().zip(r).zip(&self.0) {
                *zi = ri / d;
            }
        }
        fn name(&self) -> &'static str {
            "diagonal"
        }
    }

    fn dense(a: &[f64], n: usize) -> impl Fn(&[f64], &mut [f64]) + '_ {
        move |v, out| {
            for i in 0..n {
                out[i] = (0..n).map(|j| a[i * n + j] * v[j]).sum();
            }
        }
    }

    fn residual(a: &[f64], n: usize, x: &[f64], b: &[f64]) -> f64 {
        let mut ax = vec![0.0; n];
        dense(a, n)(x, &mut ax);
        let r: Vec<f64> = b.iter().zip(&ax).map(|(bi, ai)| bi - ai).collect();
        norm(&r) / norm(b)
    }

    fn convection_diffusion(n: usize, wind: f64) -> Vec<f64> {
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = 2.0;
            if i > 0 { a[i * n + i - 1] = -1.0 - wind; }
            if i + 1 < n { a[i * n + i + 1] = -1.0 + wind; }
        }
        a
    }

    fn ramp(n: usize) -> Vec<f64> {
        (0..n).map(|i| 1.0 + (i % 7) as f64 - 0.25 * (i % 3) as f64).collect()
    }

    fn direct(a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
        let (mut a, mut b) = (a.to_vec(), b.to_vec());
        lu_solve(&mut a, &mut b, n).expect("a regular matrix")
    }

    #[test]
    fn solves_an_unsymmetric_system_to_the_direct_solution() {
        for (n, wind) in [(12, 0.3), (40, 0.6), (75, 0.9)] {
            let a = convection_diffusion(n, wind);
            let b = ramp(n);
            let exact = direct(&a, &b, n);
            let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, n, 1e-12, 10 * n);
            assert!(result.converged, "n {n}: {}", result.final_rel_residual);
            assert!(result.iterations <= n);
            assert_eq!(result.cycles, 1);
            assert_eq!(result.final_rel_residual, residual(&a, n, &result.x, &b));
            assert!(result.final_rel_residual <= 1e-12);
            let scale = exact.iter().fold(0.0f64, |m, v| m.max(v.abs()));
            for (got, want) in result.x.iter().zip(&exact) {
                assert!((got - want).abs() <= 1e-9 * scale, "n {n}: {got} vs {want}");
            }
        }
    }

    #[test]
    fn restarting_reaches_the_same_solution_in_more_cycles() {
        let n = 60;
        let a = convection_diffusion(n, 0.4);
        let b = ramp(n);
        let exact = direct(&a, &b, n);
        let full = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, n, 1e-10, 100 * n);
        let restarted = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 8, 1e-10, 100 * n);
        assert!(full.converged && restarted.converged);
        assert!(restarted.cycles > 1 && restarted.iterations > full.iterations);
        assert!(restarted.iterations <= restarted.cycles * 8);
        let scale = exact.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for (got, want) in restarted.x.iter().zip(&exact) {
            assert!((got - want).abs() <= 1e-7 * scale, "{got} vs {want}");
        }
    }

    #[test]
    fn takes_as_many_steps_as_the_matrix_has_distinct_eigenvalues() {
        let n = 30;
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = [2.0, -3.0, 7.0][i % 3];
        }
        let b = ramp(n);
        let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, n, 1e-12, n);
        assert!(result.converged);
        assert_eq!(result.iterations, 3);
        for i in 0..n {
            assert!((result.x[i] - b[i] / a[i * n + i]).abs() <= 1e-12 * b[i].abs());
        }
    }

    #[test]
    fn solves_a_symmetric_indefinite_system_conjugate_gradients_gives_up_on() {
        let n = 24;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(if i % 2 == 0 { 3.0 } else { -2.0 });
            if i + 1 < n {
                rows.push(i + 1);
                cols.push(i);
                vals.push(0.5);
            }
        }
        let matrix = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b = ramp(n);
        assert!(!pcg_solve(&matrix, &b, &IdentityPreconditioner, 1e-10, 10 * n).converged);
        let apply = |v: &[f64], out: &mut [f64]| out.copy_from_slice(&matrix.sym_mat_vec(v));
        let result = gmres_solve(&apply, &b, &IdentityPreconditioner, n, 1e-10, 10 * n);
        assert!(result.converged, "{}", result.final_rel_residual);
        let back = matrix.sym_mat_vec(&result.x);
        for (got, want) in back.iter().zip(&b) {
            assert!((got - want).abs() <= 1e-8 * norm(&b));
        }
    }

    #[test]
    fn agrees_with_conjugate_gradients_on_a_positive_definite_system() {
        let n = 50;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(4.0 + (i % 5) as f64);
            if i + 1 < n {
                rows.push(i + 1);
                cols.push(i);
                vals.push(-1.0);
            }
        }
        let matrix = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b = ramp(n);
        let cg = pcg_solve(&matrix, &b, &IdentityPreconditioner, 1e-12, 10 * n);
        let apply = |v: &[f64], out: &mut [f64]| out.copy_from_slice(&matrix.sym_mat_vec(v));
        let result = gmres_solve(&apply, &b, &IdentityPreconditioner, n, 1e-12, 10 * n);
        assert!(cg.converged && result.converged);
        let scale = cg.x.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for (got, want) in result.x.iter().zip(&cg.x) {
            assert!((got - want).abs() <= 1e-10 * scale, "{got} vs {want}");
        }
    }

    #[test]
    fn a_right_preconditioner_cuts_the_steps_and_keeps_the_true_residual() {
        let n = 80;
        let mut a = convection_diffusion(n, 0.5);
        let scales: Vec<f64> = (0..n).map(|i| 10f64.powi((i % 9) as i32 - 4)).collect();
        for i in 0..n {
            for j in 0..n {
                a[i * n + j] *= scales[j];
            }
        }
        let diagonal: Vec<f64> = (0..n).map(|i| a[i * n + i]).collect();
        let b = ramp(n);
        let plain = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 20, 1e-10, 4000);
        let preconditioned = gmres_solve(&dense(&a, n), &b, &Diagonal(diagonal), 20, 1e-10, 4000);
        assert!(preconditioned.converged, "{}", preconditioned.final_rel_residual);
        assert!(!plain.converged || preconditioned.iterations < plain.iterations);
        assert_eq!(preconditioned.final_rel_residual, residual(&a, n, &preconditioned.x, &b));
        assert!(preconditioned.final_rel_residual <= 1e-10);
    }

    #[test]
    fn a_zero_right_hand_side_is_solved_by_zero() {
        let a = convection_diffusion(5, 0.2);
        let result = gmres_solve(&dense(&a, 5), &[0.0; 5], &IdentityPreconditioner, 5, 1e-10, 50);
        assert!(result.converged);
        assert_eq!((result.iterations, result.cycles), (0, 0));
        assert_eq!(result.x, vec![0.0; 5]);
    }

    #[test]
    fn a_singular_inconsistent_system_stops_unconverged() {
        let n = 6;
        let mut a = vec![0.0; n * n];
        for i in 0..n - 1 {
            a[i * n + i] = 1.0 + i as f64;
        }
        let mut b = ramp(n);
        b[n - 1] = 5.0;
        for restart in [2, n, 3 * n] {
            let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, restart, 1e-10, 1000);
            assert!(!result.converged);
            assert!(result.iterations < 1000);
            assert!(result.x.iter().all(|v| v.is_finite()));
            assert_eq!(result.final_rel_residual, residual(&a, n, &result.x, &b));
            assert!(result.final_rel_residual >= 5.0 / norm(&b) * (1.0 - 1e-12));
        }
    }

    #[test]
    fn the_step_limit_is_kept() {
        let n = 60;
        let a = convection_diffusion(n, 0.4);
        let b = ramp(n);
        for limit in [0, 1, 7, 13] {
            let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 5, 1e-14, limit);
            assert!(!result.converged);
            assert_eq!(result.iterations, limit);
            assert_eq!(result.final_rel_residual, residual(&a, n, &result.x, &b));
        }
    }

    #[test]
    fn a_non_finite_operator_or_right_hand_side_stops_unconverged() {
        let n = 8;
        let b = ramp(n);
        for bad in [f64::NAN, f64::INFINITY] {
            let apply = |v: &[f64], out: &mut [f64]| {
                out.copy_from_slice(v);
                out[3] = bad;
            };
            let result = gmres_solve(&apply, &b, &IdentityPreconditioner, n, 1e-10, 100);
            assert!(!result.converged);
            let mut poisoned = b.clone();
            poisoned[2] = bad;
            let a = convection_diffusion(n, 0.2);
            assert!(!gmres_solve(&dense(&a, n), &poisoned, &IdentityPreconditioner, n, 1e-10, 100).converged);
        }
    }

    #[test]
    fn the_norm_survives_entries_whose_squares_do_not() {
        assert!((norm(&[3e-200, 4e-200]) / 5e-200 - 1.0).abs() <= 1e-15);
        assert!((norm(&[3e200, -4e200]) / 5e200 - 1.0).abs() <= 1e-15);
        assert_eq!(norm(&[0.0, 0.0]), 0.0);
        assert_eq!(norm(&[]), 0.0);
        assert_eq!(norm(&[1.0, f64::INFINITY]), f64::INFINITY);
        assert!(norm(&[f64::NAN]).is_nan());
        assert!(norm(&[1.0, f64::NAN, f64::INFINITY]).is_nan());
        assert!((norm(&[1.0, 2.0, 2.0]) - 3.0).abs() <= 1e-15);
    }

    #[test]
    fn a_tiny_right_hand_side_is_not_taken_for_zero() {
        let identity = |v: &[f64], out: &mut [f64]| out.copy_from_slice(v);
        let result = gmres_solve(&identity, &[1e-200], &IdentityPreconditioner, 1, 1e-10, 10);
        assert!(result.converged);
        assert_eq!(result.x, vec![1e-200]);
        assert_eq!((result.iterations, result.final_rel_residual), (1, 0.0));

        let n = 12;
        let a = convection_diffusion(n, 0.3);
        let unit = direct(&a, &ramp(n), n);
        for factor in [1e-170, 1e-250, 1e200] {
            let b: Vec<f64> = ramp(n).iter().map(|v| v * factor).collect();
            let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, n, 1e-12, 10 * n);
            assert!(result.converged, "{factor}: {}", result.final_rel_residual);
            assert!(result.iterations > 1);
            for (got, want) in result.x.iter().zip(&unit) {
                assert!((got / factor - want).abs() <= 1e-9 * want.abs().max(1.0), "{factor}: {got} vs {want}");
            }
        }
    }

    #[test]
    fn a_tiny_operator_leaves_residuals_that_are_not_taken_for_zero() {
        let n = 12;
        let unit = convection_diffusion(n, 0.3);
        let exact = direct(&unit, &ramp(n), n);
        for factor in [1e-170, 1e170] {
            let a: Vec<f64> = unit.iter().map(|v| v * factor).collect();
            let b = ramp(n);
            let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, n, 1e-12, 10 * n);
            assert!(result.converged, "{factor}: {}", result.final_rel_residual);
            assert!(result.iterations > 1);
            for (got, want) in result.x.iter().zip(&exact) {
                assert!((got * factor - want).abs() <= 1e-9 * want.abs().max(1.0), "{factor}: {got} vs {want}");
            }
        }
    }

    struct Poisoned {
        component: usize,
        from_call: usize,
        calls: std::cell::Cell<usize>,
    }

    impl Preconditioner for Poisoned {
        fn apply(&self, r: &[f64], z: &mut [f64]) {
            z.copy_from_slice(r);
            self.calls.set(self.calls.get() + 1);
            if self.calls.get() >= self.from_call {
                z[self.component] = f64::NAN;
            }
        }
        fn name(&self) -> &'static str {
            "poisoned"
        }
    }

    #[test]
    fn a_non_finite_preconditioner_in_a_component_the_operator_ignores_is_not_a_solution() {
        let apply = |v: &[f64], out: &mut [f64]| {
            out[0] = v[0] + 0.5 * v[1];
            out[1] = 3.0 * v[1];
            out[2] = 0.0;
        };
        let b = [1.0, 2.0, 0.0];
        let sound = gmres_solve(&apply, &b, &IdentityPreconditioner, 3, 1e-12, 30);
        assert!(sound.converged && finite(&sound.x));
        for from_call in [1, 2, 3] {
            let pre = Poisoned { component: 2, from_call, calls: std::cell::Cell::new(0) };
            let result = gmres_solve(&apply, &b, &pre, 3, 1e-12, 30);
            assert!(!result.converged, "poisoned from call {from_call}");
            assert!(finite(&result.x), "poisoned from call {from_call}: {:?}", result.x);
            let mut ax = [0.0; 3];
            apply(&result.x, &mut ax);
            let r: Vec<f64> = b.iter().zip(&ax).map(|(bi, ai)| bi - ai).collect();
            assert_eq!(result.final_rel_residual, norm(&r) / norm(&b));
        }
    }

    #[test]
    fn a_cycle_that_does_not_help_leaves_the_last_good_iterate() {
        let n = 6;
        let mut a = vec![0.0; n * n];
        for i in 0..n - 1 {
            a[i * n + i] = 1.0 + i as f64;
        }
        let mut b = ramp(n);
        b[n - 1] = 5.0;
        let result = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 2, 1e-10, 1000);
        assert!(!result.converged);
        assert_eq!(result.final_rel_residual, residual(&a, n, &result.x, &b));
        let further = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 2, 1e-10, result.iterations + 2);
        assert_eq!(further.x, result.x);
    }

    #[test]
    #[should_panic(expected = "restart length must be positive")]
    fn a_zero_restart_length_panics() {
        gmres_solve(&|v: &[f64], out: &mut [f64]| out.copy_from_slice(v), &[1.0], &IdentityPreconditioner, 0, 1e-10, 10);
    }

    #[test]
    fn two_runs_agree_to_the_last_bit() {
        let n = 45;
        let a = convection_diffusion(n, 0.7);
        let b = ramp(n);
        let first = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 10, 1e-11, 5000);
        let second = gmres_solve(&dense(&a, n), &b, &IdentityPreconditioner, 10, 1e-11, 5000);
        assert!(first.converged);
        assert_eq!(first.iterations, second.iterations);
        assert_eq!(first.x.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), second.x.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
    }
}
