/// Preconditioned conjugate gradient solver for symmetric SPD systems.
///
/// Operates on `CscMatrix` (lower-triangle CSC) via `sym_mat_vec`, so memory
/// is O(nnz + n). Deterministic and single-threaded (WASM-compatible).
use super::preconditioner::Preconditioner;
use super::sparse::CscMatrix;

/// Result of a PCG solve.
#[derive(Debug, Clone)]
pub struct PcgResult {
    /// Approximate solution vector.
    pub x: Vec<f64>,
    /// Number of iterations performed.
    pub iterations: usize,
    /// Final ‖r‖₂/‖b‖₂.
    pub final_rel_residual: f64,
    /// True iff the tolerance was met before max_iter or a safeguard triggered.
    pub converged: bool,
}

/// Solve A x = b with preconditioned conjugate gradients
/// (Golub & Van Loan, Algorithm 11.3.1), starting from x₀ = 0.
///
/// Stops when ‖r‖₂/‖b‖₂ ≤ `tol`. A zero right-hand side returns x = 0
/// immediately. Safeguards cut the iteration with `converged: false` when
/// rᵀz ≤ 0 or non-finite (preconditioner not SPD) or when pᵀAp ≤ 0 or
/// non-finite (A not SPD).
///
/// Stagnation safeguard: CG minimizes the A-norm of the error, so the
/// 2-norm of the residual is NOT monotone — on ill-conditioned systems
/// (MITC4 shells, κ ~ 1e6-1e8) it plateaus or even grows for hundreds of
/// iterations before collapsing (measured 2026-09-22 with
/// `diagnose_pcg_stall_curve` / `diagnose_pcg_plateau_length` in
/// engine/tests/sparse_shell_gates.rs: Jacobi on 20×20 climbs to
/// ‖r‖/‖b‖ ≈ 11 around iter 100, then converges at iter 235). The plateau
/// length grows like √n (measured ≈ 3.2·√n over nf = 684…29964), so a fixed
/// iteration window aborts legitimate convergence on exactly the large
/// models where PCG should win. The stall limit therefore scales with the
/// system size: abort only after `max(50, 8·√n)` consecutive iterations
/// without improving the best residual by a factor of 0.99 — ~2.5× above
/// every measured plateau, bounding a genuinely stuck run to O(√n) wasted
/// matvecs.
pub fn pcg_solve(
    a: &CscMatrix,
    b: &[f64],
    pre: &dyn Preconditioner,
    tol: f64,
    max_iter: usize,
) -> PcgResult {
    let n = a.n;
    assert_eq!(b.len(), n, "rhs length must match matrix dimension");

    let bnorm: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
    if bnorm == 0.0 {
        return PcgResult {
            x: vec![0.0; n],
            iterations: 0,
            final_rel_residual: 0.0,
            converged: true,
        };
    }

    let mut x = vec![0.0; n];
    let mut r = b.to_vec();
    let mut z = vec![0.0; n];
    let mut p = vec![0.0; n];

    pre.apply(&r, &mut z);
    let mut rz: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
    if !rz.is_finite() || rz <= 0.0 {
        return PcgResult {
            x,
            iterations: 0,
            final_rel_residual: 1.0,
            converged: false,
        };
    }
    p.copy_from_slice(&z);

    // Size-scaled stall window: CG residual plateaus on ill-conditioned
    // systems grow like √n (see the doc comment above for measurements), so
    // a fixed limit aborts legitimate slow convergence on large models.
    let stall_limit = 50usize.max(8 * (n as f64).sqrt().ceil() as usize);
    const STALL_FACTOR: f64 = 0.99;
    let mut best_rel = 1.0f64; // ||r₀||/‖b‖ = 1
    let mut stall = 0usize;

    let mut iterations = 0;
    let mut final_rel = 1.0;
    let mut converged = false;

    for iter in 0..max_iter {
        let ap = a.sym_mat_vec(&p);
        let pap: f64 = p.iter().zip(ap.iter()).map(|(pi, api)| pi * api).sum();
        if !pap.is_finite() || pap <= 0.0 {
            break;
        }
        let alpha = rz / pap;
        for ((x_i, r_i), (p_i, ap_i)) in x
            .iter_mut()
            .zip(r.iter_mut())
            .zip(p.iter().zip(ap.iter()))
        {
            *x_i += alpha * p_i;
            *r_i -= alpha * ap_i;
        }
        iterations = iter + 1;

        let rnorm: f64 = r.iter().map(|v| v * v).sum::<f64>().sqrt();
        let rel = rnorm / bnorm;
        final_rel = rel;
        if rel <= tol {
            converged = true;
            break;
        }
        if rel < STALL_FACTOR * best_rel {
            best_rel = rel;
            stall = 0;
        } else {
            stall += 1;
            if stall >= stall_limit {
                break;
            }
        }

        pre.apply(&r, &mut z);
        let rz_new: f64 = r.iter().zip(z.iter()).map(|(ri, zi)| ri * zi).sum();
        if !rz_new.is_finite() || rz_new <= 0.0 {
            break;
        }
        let beta = rz_new / rz;
        rz = rz_new;
        for (p_i, z_i) in p.iter_mut().zip(z.iter()) {
            *p_i = z_i + beta * *p_i;
        }
    }

    PcgResult {
        x,
        iterations,
        final_rel_residual: final_rel,
        converged,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::cholesky::cholesky_solve;
    use crate::linalg::preconditioner::{
        Ic0Preconditioner, IdentityPreconditioner, JacobiPreconditioner, SsorPreconditioner,
    };

    /// 1D Poisson tridiagonal (2 on diagonal, -1 off), SPD.
    fn poisson_1d(n: usize) -> CscMatrix {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(2.0);
            if i + 1 < n {
                rows.push(i + 1);
                cols.push(i);
                vals.push(-1.0);
            }
        }
        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }

    /// 5-point Laplacian on an nx × ny grid (4 on diagonal, -1 off), SPD.
    fn laplacian_2d(nx: usize, ny: usize) -> CscMatrix {
        let n = nx * ny;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for iy in 0..ny {
            for ix in 0..nx {
                let id = iy * nx + ix;
                rows.push(id);
                cols.push(id);
                vals.push(4.0);
                if ix + 1 < nx {
                    rows.push(id + 1);
                    cols.push(id);
                    vals.push(-1.0);
                }
                if iy + 1 < ny {
                    rows.push(id + nx);
                    cols.push(id);
                    vals.push(-1.0);
                }
            }
        }
        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }

    /// Deterministic well-conditioned dense SPD: A = BᵀB + nI.
    fn random_spd_dense(n: usize) -> Vec<f64> {
        let mut b = vec![0.0; n * n];
        let mut seed: u64 = 13;
        for v in b.iter_mut() {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            *v = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
        }
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                let mut s = 0.0;
                for k in 0..n {
                    s += b[k * n + i] * b[k * n + j];
                }
                a[i * n + j] = s;
            }
            a[i * n + i] += n as f64;
        }
        a
    }

    /// Solve with `pre` and assert convergence plus a small true residual.
    fn check_solve(a: &CscMatrix, pre: &dyn Preconditioner, tol: f64) -> PcgResult {
        let n = a.n;
        let b: Vec<f64> = (0..n).map(|i| ((i * 13 + 7) % 11) as f64 + 0.5).collect();
        let res = pcg_solve(a, &b, pre, tol, (10 * n).max(100));
        assert!(
            res.converged,
            "{} did not converge (rel={}, iters={})",
            pre.name(),
            res.final_rel_residual,
            res.iterations
        );
        let ax = a.sym_mat_vec(&res.x);
        let rnorm: f64 = ax
            .iter()
            .zip(b.iter())
            .map(|(x, y)| (x - y).powi(2))
            .sum::<f64>()
            .sqrt();
        let bnorm: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
        assert!(
            rnorm / bnorm <= 1e-8,
            "{}: true rel residual {}",
            pre.name(),
            rnorm / bnorm
        );
        res
    }

    #[test]
    fn test_pcg_poisson_all_preconditioners() {
        let a = poisson_1d(50);
        check_solve(&a, &IdentityPreconditioner, 1e-10);
        check_solve(&a, &JacobiPreconditioner::new(&a).unwrap(), 1e-10);
        check_solve(&a, &SsorPreconditioner::new(&a, 1.0).unwrap(), 1e-10);
        check_solve(&a, &Ic0Preconditioner::new(&a).unwrap(), 1e-10);
    }

    #[test]
    fn test_pcg_laplacian_2d_all_preconditioners() {
        let a = laplacian_2d(8, 8); // n = 64
        check_solve(&a, &IdentityPreconditioner, 1e-10);
        check_solve(&a, &JacobiPreconditioner::new(&a).unwrap(), 1e-10);
        check_solve(&a, &SsorPreconditioner::new(&a, 1.0).unwrap(), 1e-10);
        check_solve(&a, &Ic0Preconditioner::new(&a).unwrap(), 1e-10);
    }

    #[test]
    fn test_pcg_unpreconditioned_converges_within_n() {
        // Well-conditioned SPD (κ ≈ 1.3): unpreconditioned CG converges in
        // far fewer than n iterations.
        let n = 30;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        let b: Vec<f64> = (0..n).map(|i| (i + 1) as f64).collect();
        let res = pcg_solve(&a, &b, &IdentityPreconditioner, 1e-10, n);
        assert!(res.converged, "did not converge within {} iterations", n);
        assert!(res.iterations <= n);
    }

    #[test]
    fn test_pcg_zero_rhs() {
        let a = poisson_1d(10);
        let b = vec![0.0; 10];
        let res = pcg_solve(&a, &b, &IdentityPreconditioner, 1e-10, 100);
        assert!(res.converged);
        assert_eq!(res.iterations, 0);
        assert_eq!(res.final_rel_residual, 0.0);
        assert!(res.x.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn test_pcg_max_iter_no_convergence() {
        let a = poisson_1d(50);
        let b: Vec<f64> = (0..50).map(|i| (i + 1) as f64).collect();
        let res = pcg_solve(&a, &b, &IdentityPreconditioner, 1e-12, 1);
        assert!(!res.converged);
        assert_eq!(res.iterations, 1);
    }

    #[test]
    fn test_pcg_breakdown_non_spd_preconditioner() {
        struct BadPre;
        impl Preconditioner for BadPre {
            fn apply(&self, r: &[f64], z: &mut [f64]) {
                for (z_i, r_i) in z.iter_mut().zip(r.iter()) {
                    *z_i = -*r_i;
                }
            }
            fn name(&self) -> &'static str {
                "bad"
            }
        }
        let a = poisson_1d(10);
        let b = vec![1.0; 10];
        let res = pcg_solve(&a, &b, &BadPre, 1e-10, 100);
        assert!(!res.converged);
        assert_eq!(res.iterations, 0);
    }

    #[test]
    fn test_pcg_deterministic_bitwise() {
        let a = laplacian_2d(8, 8);
        let n = a.n;
        let b: Vec<f64> = (0..n).map(|i| ((i * 31 + 17) % 23) as f64).collect();
        let pre = Ic0Preconditioner::new(&a).unwrap();
        let r1 = pcg_solve(&a, &b, &pre, 1e-12, 1000);
        let r2 = pcg_solve(&a, &b, &pre, 1e-12, 1000);
        assert_eq!(r1.x, r2.x);
        assert_eq!(r1.iterations, r2.iterations);
        assert_eq!(r1.final_rel_residual.to_bits(), r2.final_rel_residual.to_bits());
    }

    #[test]
    fn test_pcg_vs_dense_cholesky() {
        let a = laplacian_2d(6, 6); // n = 36
        let n = a.n;
        let b: Vec<f64> = (0..n).map(|i| ((i * 7 + 1) % 13) as f64 + 0.25).collect();
        let pre = Ic0Preconditioner::new(&a).unwrap();
        let res = pcg_solve(&a, &b, &pre, 1e-12, 10 * n);
        assert!(res.converged);
        let mut dense = a.to_dense_symmetric();
        let x_ref = cholesky_solve(&mut dense, &b, n).unwrap();
        let diff: f64 = res
            .x
            .iter()
            .zip(x_ref.iter())
            .map(|(x, y)| (x - y).powi(2))
            .sum::<f64>()
            .sqrt();
        let xnorm: f64 = x_ref.iter().map(|v| v * v).sum::<f64>().sqrt();
        assert!(diff / xnorm < 1e-8, "rel diff vs cholesky: {}", diff / xnorm);
    }
}
