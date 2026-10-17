use super::cholesky::{cholesky_decompose, lower_triangular_inverse};
use super::dense::mat_mul;

/// Result of eigenvalue decomposition
pub struct EigenResult {
    pub values: Vec<f64>,   // Eigenvalues in ascending order
    pub vectors: Vec<f64>,  // n×n column eigenvectors (row-major storage)
}

/// Jacobi cyclic eigenvalue solver for symmetric matrices.
/// Returns eigenvalues in ascending order with corresponding eigenvectors.
pub fn jacobi_eigen(a: &[f64], n: usize, max_iter: usize) -> EigenResult {
    let mut work = a.to_vec();
    let mut v = vec![0.0; n * n];

    // Initialize V = I
    for i in 0..n {
        v[i * n + i] = 1.0;
    }

    for iter in 0..max_iter {
        // Compute off-diagonal norm
        let mut off_norm = 0.0;
        for i in 0..n {
            for j in (i + 1)..n {
                off_norm += work[i * n + j] * work[i * n + j];
            }
        }
        off_norm = (2.0 * off_norm).sqrt();

        if off_norm < 1e-24 {
            break;
        }

        // Threshold for first 4 sweeps
        let threshold = if iter < 4 {
            0.2 * off_norm / (n * n) as f64
        } else {
            0.0
        };

        for p in 0..n {
            for q in (p + 1)..n {
                let apq = work[p * n + q];
                // Skip if below threshold or below absolute tolerance
                if apq.abs() < threshold || apq.abs() < 1e-30 {
                    continue;
                }

                let app = work[p * n + p];
                let aqq = work[q * n + q];
                let tau = (aqq - app) / (2.0 * apq);

                let t = if tau.abs() > 1e15 {
                    1.0 / (2.0 * tau)
                } else {
                    let sign = if tau >= 0.0 { 1.0 } else { -1.0 };
                    sign / (tau.abs() + (1.0 + tau * tau).sqrt())
                };

                let c = 1.0 / (1.0 + t * t).sqrt();
                let s = t * c;
                let tau2 = s / (1.0 + c);

                // Update diagonal
                work[p * n + p] -= t * apq;
                work[q * n + q] += t * apq;
                work[p * n + q] = 0.0;
                work[q * n + p] = 0.0;

                // Update off-diagonal elements
                for r in 0..n {
                    if r == p || r == q {
                        continue;
                    }
                    let arp = work[r * n + p];
                    let arq = work[r * n + q];
                    work[r * n + p] = arp - s * (arq + tau2 * arp);
                    work[p * n + r] = work[r * n + p];
                    work[r * n + q] = arq + s * (arp - tau2 * arq);
                    work[q * n + r] = work[r * n + q];
                }

                // Update eigenvectors
                for r in 0..n {
                    let vrp = v[r * n + p];
                    let vrq = v[r * n + q];
                    v[r * n + p] = vrp - s * (vrq + tau2 * vrp);
                    v[r * n + q] = vrq + s * (vrp - tau2 * vrq);
                }
            }
        }
    }

    // Extract eigenvalues
    let mut eigen_pairs: Vec<(f64, usize)> = (0..n).map(|i| (work[i * n + i], i)).collect();
    eigen_pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let values: Vec<f64> = eigen_pairs.iter().map(|(val, _)| *val).collect();
    let mut vectors = vec![0.0; n * n];
    for (new_col, (_, old_col)) in eigen_pairs.iter().enumerate() {
        for row in 0..n {
            vectors[row * n + new_col] = v[row * n + old_col];
        }
    }

    EigenResult { values, vectors }
}

/// Solve generalized eigenvalue problem: A*x = λ*B*x
/// where B is symmetric positive definite.
/// Transform to standard problem via Cholesky: B = L*L^T
/// C = L^{-1} * A * L^{-T}, solve C*y = λ*y, then x = L^{-T}*y
///
/// B only semi-definite (a mass matrix with massless DOFs: the rotations of
/// lumped-mass members, a node of trusses only) but A definite (a stiffness):
/// solved as the inverse problem B*x = μ*A*x, λ = 1/μ; the massless
/// directions are the μ = 0 ones and come last as λ = ∞. Ascending order and
/// xᵀBx = 1 for the finite ones, as on the definite path.
pub fn solve_generalized_eigen(
    a: &[f64],
    b: &[f64],
    n: usize,
    max_iter: usize,
) -> Option<EigenResult> {
    generalized_eigen_cholesky(a, b, n, max_iter).or_else(|| solve_generalized_eigen_inverse(a, b, n, max_iter))
}

/// A*x = λ*B*x through the Cholesky factor of B; None when B is not definite.
fn generalized_eigen_cholesky(a: &[f64], b: &[f64], n: usize, max_iter: usize) -> Option<EigenResult> {
    // Cholesky of B
    let mut b_work = b.to_vec();
    if !cholesky_decompose(&mut b_work, n) {
        return None;
    }

    // L^{-1}
    let l_inv = lower_triangular_inverse(&b_work, n);

    // L^{-T}
    let mut l_inv_t = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            l_inv_t[i * n + j] = l_inv[j * n + i];
        }
    }

    // C = L^{-1} * A * L^{-T}
    let temp = mat_mul(&l_inv, a, n);
    let c = mat_mul(&temp, &l_inv_t, n);

    // Check for NaN in C (debug)
    if c.iter().any(|x| x.is_nan()) {
        return None;
    }

    // Solve standard eigenvalue problem
    let mut result = jacobi_eigen(&c, n, max_iter);

    // Transform eigenvectors back: x = L^{-T} * y
    let mut transformed = vec![0.0; n * n];
    for col in 0..n {
        for i in 0..n {
            let mut sum = 0.0;
            for k in 0..n {
                sum += l_inv_t[i * n + k] * result.vectors[k * n + col];
            }
            transformed[i * n + col] = sum;
        }
    }
    result.vectors = transformed;

    Some(result)
}

/// `solve_generalized_eigen` for a semi-definite B and a definite A (see there).
fn solve_generalized_eigen_inverse(a: &[f64], b: &[f64], n: usize, max_iter: usize) -> Option<EigenResult> {
    let inv = generalized_eigen_cholesky(b, a, n, max_iter)?;
    let top = inv.values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let mut pairs: Vec<(f64, usize)> = inv
        .values
        .iter()
        .enumerate()
        .map(|(i, &mu)| (if mu > 1e-12 * top { 1.0 / mu } else { f64::INFINITY }, i))
        .collect();
    pairs.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap_or(std::cmp::Ordering::Equal));
    let mut vectors = vec![0.0; n * n];
    for (new_col, &(lambda, old_col)) in pairs.iter().enumerate() {
        // xᵀAx = 1 on the inverse problem, so xᵀBx = μ: rescale to xᵀBx = 1.
        let scale = if lambda.is_finite() { lambda.sqrt() } else { 1.0 };
        for row in 0..n {
            vectors[row * n + new_col] = inv.vectors[row * n + old_col] * scale;
        }
    }
    Some(EigenResult { values: pairs.iter().map(|p| p.0).collect(), vectors })
}

/// `K x = λ M x` for a positive definite `K` and a positive *semi*definite
/// mass `M`, smallest eigenvalues first, with the massless (infinite)
/// eigenvalues dropped, so fewer than `n` values may come back. `None` when
/// neither `M` nor `K` is positive definite. (#294's entry point; the same
/// inverse-problem method as `solve_generalized_eigen` and the Lanczos dense
/// fallback `dense_generalized_eigen_semidefinite`.)
pub fn solve_generalized_eigen_mass(k: &[f64], m: &[f64], n: usize, max_iter: usize) -> Option<EigenResult> {
    let r = solve_generalized_eigen(k, m, n, max_iter)?;
    let kept: Vec<usize> = (0..r.values.len()).filter(|&j| r.values[j].is_finite()).collect();
    let mut vectors = vec![0.0; n * n];
    for (col, &j) in kept.iter().enumerate() {
        for row in 0..n {
            vectors[row * n + col] = r.vectors[row * n + j];
        }
    }
    Some(EigenResult { values: kept.iter().map(|&j| r.values[j]).collect(), vectors })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jacobi_2x2() {
        let a = vec![2.0, 1.0, 1.0, 3.0];
        let result = jacobi_eigen(&a, 2, 100);
        // Eigenvalues of [[2,1],[1,3]] are (5±√5)/2 ≈ 1.382, 3.618
        let expected_min = (5.0 - 5.0_f64.sqrt()) / 2.0;
        let expected_max = (5.0 + 5.0_f64.sqrt()) / 2.0;
        assert!((result.values[0] - expected_min).abs() < 1e-10);
        assert!((result.values[1] - expected_max).abs() < 1e-10);
    }

    #[test]
    fn test_jacobi_diagonal() {
        let a = vec![3.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 2.0];
        let result = jacobi_eigen(&a, 3, 100);
        assert!((result.values[0] - 1.0).abs() < 1e-10);
        assert!((result.values[1] - 2.0).abs() < 1e-10);
        assert!((result.values[2] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn generalized_eigen_with_massless_dof() {
        // K = [[2,-1],[-1,2]], M = diag(1, 0): the second DOF has no mass.
        // Condensing it: k* = 2 - 1/2 = 1.5, λ = 1.5 (one finite mode).
        let k = vec![2.0, -1.0, -1.0, 2.0];
        let m = vec![1.0, 0.0, 0.0, 0.0];
        assert!(generalized_eigen_cholesky(&k, &m, 2, 100).is_none());
        let r = solve_generalized_eigen_mass(&k, &m, 2, 100).unwrap();
        assert_eq!(r.values.len(), 1);
        assert!((r.values[0] - 1.5).abs() < 1e-12, "{:?}", r.values);
        // x = (1, 1/2) scaled to xᵀ M x = 1, K x = λ M x.
        let (x0, x1) = (r.vectors[0], r.vectors[2]);
        assert!((x0 * x0 - 1.0).abs() < 1e-12 && (x1 - 0.5 * x0).abs() < 1e-12);
    }

    #[test]
    fn test_generalized_eigen() {
        // A = [[6,2],[2,3]], B = [[2,0],[0,1]]
        // Generalized: 6x1+2x2 = λ(2x1), 2x1+3x2 = λ(x2)
        let a = vec![6.0, 2.0, 2.0, 3.0];
        let b = vec![2.0, 0.0, 0.0, 1.0];
        let result = solve_generalized_eigen(&a, &b, 2, 100).unwrap();
        // λ₁ ≈ 2.0, λ₂ ≈ 5.0
        assert!(result.values[0] > 1.5 && result.values[0] < 3.0);
        assert!(result.values[1] > 3.0 && result.values[1] < 6.0);
    }
}
