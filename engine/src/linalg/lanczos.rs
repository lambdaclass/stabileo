use super::cholesky::{cholesky_decompose, forward_solve, back_solve};
use super::jacobi::{jacobi_eigen, solve_generalized_eigen, EigenResult};
use super::sparse::CscMatrix;
use super::sparse_chol::{symbolic_cholesky, numeric_cholesky, sparse_cholesky_solve};
use std::rc::Rc;

/// Parameters for Lanczos iteration.
pub struct LanczosParams {
    pub max_iter: usize,
    pub tol: f64,
    /// Subspace dimension (m > k, typically 2k+1 or min(n, max(2k+1, 20)))
    pub subspace_dim: Option<usize>,
}

impl Default for LanczosParams {
    fn default() -> Self {
        Self { max_iter: 300, tol: 1e-10, subspace_dim: None }
    }
}

// ---------------------------------------------------------------------------
// Trait for matrix-vector operations
// ---------------------------------------------------------------------------

pub trait MatVecOp {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]);
    fn dim(&self) -> usize;

    /// `y = B·x`, where B defines the inner product this operator is self-adjoint in.
    ///
    /// The symmetric three-term Lanczos recurrence is only valid for an operator that
    /// is self-adjoint in the inner product it is run with. A shift-invert operator
    /// `C = (A − σB)⁻¹B` is NOT self-adjoint in the Euclidean product — running it with
    /// `dot` produces a tridiagonal matrix that does not represent C, and the vectors
    /// that come back are not eigenvectors. It IS self-adjoint in the B-inner product
    /// `⟨x,y⟩_B = xᵀBy`, so the recurrence uses this instead.
    ///
    /// The default is the identity, which makes `⟨·,·⟩_B` the Euclidean product and is
    /// exactly right for the ordinary symmetric operators (`DenseSymMatVec`,
    /// `InverseOp`). Only the generalized operators override it.
    fn b_mul(&self, x: &[f64], y: &mut [f64]) {
        y[..x.len()].copy_from_slice(x);
    }
}

/// Dense symmetric matrix-vector: y = A*x (row-major flat storage).
pub struct DenseSymMatVec<'a> {
    pub data: &'a [f64],
    pub n: usize,
}

impl<'a> MatVecOp for DenseSymMatVec<'a> {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        let n = self.n;
        for i in 0..n {
            let mut s = 0.0;
            let row = i * n;
            for j in 0..n {
                s += self.data[row + j] * x[j];
            }
            y[i] = s;
        }
    }
    fn dim(&self) -> usize { self.n }
}

// ---------------------------------------------------------------------------
// Core Lanczos tridiagonalization with full reorthogonalization
// ---------------------------------------------------------------------------

/// Run m steps of Lanczos producing tridiagonal (alpha, beta) and Q matrix.
/// Q is stored row-major: Q[j * n + i] = q_j[i], so column j of Q is basis vector j.
/// Returns (alpha, beta, q_storage, actual_steps).
/// beta has length m (beta[0] is unused/zero, beta[j] is the off-diagonal between j-1 and j).
fn lanczos_tridiag(
    op: &dyn MatVecOp,
    q_start: &[f64],
    m: usize,
    locked: &[(Vec<f64>, Vec<f64>)],
) -> (Vec<f64>, Vec<f64>, Vec<f64>, usize, f64) {
    let n = op.dim();
    let mut alpha = vec![0.0; m];
    let mut beta = vec![0.0; m];
    // Q stored as m vectors of length n, row-major: q_j at offset j*n
    let mut q = vec![0.0; m * n];
    // B·q_j alongside q_j. Every inner product below is ⟨x,y⟩_B = xᵀBy; caching Bq
    // turns each of them back into a plain `dot` and costs one B-multiply per step
    // rather than one per inner product. For the default identity B this is a copy,
    // so the ordinary symmetric paths keep their previous arithmetic exactly.
    let mut bq = vec![0.0; m * n];
    let mut scratch = vec![0.0; n];

    let mut start = q_start.to_vec();
    project_locked(&mut start, locked);
    let q_start = &start;
    // q_0 = q_start / ‖q_start‖_B
    op.b_mul(q_start, &mut scratch);
    let nrm = dot(q_start, &scratch).sqrt();
    if !nrm.is_finite() || nrm <= 0.0 { return (alpha,beta,q,0,f64::INFINITY); }
    for i in 0..n {
        q[i] = q_start[i] / nrm;
    }
    op.b_mul(&q[0..n], &mut scratch);
    bq[0..n].copy_from_slice(&scratch);

    let mut w = vec![0.0; n];
    let mut steps = 0;
    let mut trailing_beta = 0.0f64;

    for j in 0..m {
        steps = j + 1;
        // w = A * q_j
        op.mul_vec(&q[j * n..(j + 1) * n], &mut w);

        project_locked(&mut w, locked);

        // alpha_j = ⟨q_j, w⟩_B = (B q_j)ᵀ w
        alpha[j] = dot(&bq[j * n..(j + 1) * n], &w);

        // w = w - alpha_j * q_j - beta_j * q_{j-1}
        for i in 0..n {
            w[i] -= alpha[j] * q[j * n + i];
        }
        if j > 0 {
            for i in 0..n {
                w[i] -= beta[j] * q[(j - 1) * n + i];
            }
        }

        // Full reorthogonalization (double CGS), B-orthogonally
        for _pass in 0..2 {
            for k in 0..=j {
                let d = dot(&bq[k * n..(k + 1) * n], &w);
                for i in 0..n {
                    w[i] -= d * q[k * n + i];
                }
            }
        }

        op.b_mul(&w, &mut scratch);
        let beta_next = dot(&w, &scratch).max(0.0).sqrt();
        // Kept even on the LAST step, where there is no q_{j+1} to store it against.
        // This is the number the Ritz residual estimate β·|s_m| is built from; dropping
        // it (as the `j + 1 < m` guard below necessarily does) is what left the caller
        // with nothing to judge convergence by.
        trailing_beta = beta_next;

        if j + 1 < m {
            beta[j + 1] = beta_next;
            if beta_next <= 32.0 * f64::EPSILON * alpha[j].abs() {
                // Invariant subspace found — stop early
                break;
            }
            for i in 0..n {
                q[(j + 1) * n + i] = w[i] / beta_next;
            }
            op.b_mul(&q[(j + 1) * n..(j + 2) * n], &mut scratch);
            bq[(j + 1) * n..(j + 2) * n].copy_from_slice(&scratch);
        }
    }

    (alpha, beta, q, steps, trailing_beta)
}

// ---------------------------------------------------------------------------
// Tridiagonal QR eigenvalue solver (implicit shifts, Wilkinson)
// ---------------------------------------------------------------------------

/// Implicit symmetric QR algorithm for tridiagonal eigenvalues.
///
/// Diagonal d[0..m] and off-diagonal e[0..m-1] (e[i] = T[i,i+1]).
/// Eigenvalues are returned in d, sorted ascending.
/// If z is Some, accumulates Givens rotations into z (m×m row-major, starts as identity).
///
/// Reference: Golub & Van Loan, Algorithm 8.3.3 (implicit symmetric QR step with Wilkinson shift).
fn tridiag_qr_impl(d: &mut [f64], e: &mut [f64], m: usize, mut z: Option<&mut [f64]>) {
    let max_iter = 30 * m;
    let mut iter = 0;

    // l_end tracks the bottom of the current unreduced block
    let mut l_end = m;
    while l_end > 1 && iter < max_iter {
        // Find the largest l_end such that e[l_end-2] is negligible
        let mut found_zero = false;
        for i in (0..l_end - 1).rev() {
            let tst = d[i].abs() + d[i + 1].abs();
            if e[i].abs() <= 1e-14 * tst.max(1e-30) {
                e[i] = 0.0;
                if i == l_end - 2 {
                    // Bottom element deflated
                    l_end -= 1;
                    found_zero = true;
                    break;
                }
            }
        }
        if found_zero { continue; }
        if l_end <= 1 { break; }

        // Find the start of the unreduced block [l_start..l_end)
        let mut l_start = l_end - 2;
        while l_start > 0 {
            let tst = d[l_start - 1].abs() + d[l_start].abs();
            if e[l_start - 1].abs() <= 1e-14 * tst.max(1e-30) {
                e[l_start - 1] = 0.0;
                break;
            }
            l_start -= 1;
        }

        iter += 1;

        // Wilkinson shift: eigenvalue of trailing 2×2 closer to d[l_end-1]
        let n1 = l_end - 1;
        let n2 = l_end - 2;
        let dd = (d[n2] - d[n1]) * 0.5;
        let ee = e[n2] * e[n2];
        let mut mu = d[n1];
        if dd.abs() > 1e-30 || ee > 1e-30 {
            let r = (dd * dd + ee).sqrt();
            mu -= ee / (dd + if dd >= 0.0 { r } else { -r });
        }

        // Implicit QR step: chase the bulge from l_start to l_end-2
        let mut x = d[l_start] - mu;
        let mut y = e[l_start];

        for k in l_start..l_end - 1 {
            // Compute Givens rotation to zero y
            let (c, s) = if y.abs() > 1e-300 {
                let r = (x * x + y * y).sqrt();
                (x / r, -y / r)
            } else {
                (1.0, 0.0)
            };

            // Apply rotation to tridiagonal entries
            if k > l_start {
                e[k - 1] = (x * x + y * y).sqrt();
            }

            let d_k = d[k];
            let d_k1 = d[k + 1];
            let e_k = e[k];

            let w1 = c * d_k - s * e_k;
            let w2 = c * e_k - s * d_k1;
            d[k] = c * w1 - s * w2;
            let w3 = s * d_k + c * e_k;
            let w4 = s * e_k + c * d_k1;
            d[k + 1] = s * w3 + c * w4;
            e[k] = c * w3 - s * w4;

            // Accumulate rotation into eigenvector matrix
            if let Some(zz) = z.as_deref_mut() {
                for i in 0..m {
                    let z_ik  = zz[i * m + k];
                    let z_ik1 = zz[i * m + k + 1];
                    zz[i * m + k]     =  c * z_ik - s * z_ik1;
                    zz[i * m + k + 1] =  s * z_ik + c * z_ik1;
                }
            }

            // Set up for next rotation
            if k + 2 < l_end {
                x = e[k];
                y = -s * e[k + 1];
                e[k + 1] *= c;
            }
        }
    }

    // Sort eigenvalues ascending (selection sort, O(m²) but m is small)
    for i in 0..m {
        let mut min_idx = i;
        for j in i + 1..m {
            if d[j] < d[min_idx] { min_idx = j; }
        }
        if min_idx != i {
            d.swap(i, min_idx);
            if let Some(zz) = z.as_deref_mut() {
                // Swap columns i and min_idx
                for row in 0..m {
                    let a = row * m + i;
                    let b = row * m + min_idx;
                    zz.swap(a, b);
                }
            }
        }
    }
}

/// Solve eigenvalues of symmetric tridiagonal matrix T (diagonal alpha, off-diagonal beta).
/// beta[0] is unused; beta[i] is T[i, i-1] for i >= 1.
/// Returns eigenvalues sorted ascending.
pub fn tridiag_eigen(alpha: &[f64], beta: &[f64], m: usize) -> Vec<f64> {
    if m == 0 { return vec![]; }
    if m == 1 { return vec![alpha[0]]; }

    let mut d = alpha[..m].to_vec();
    let mut e = vec![0.0; m];
    for i in 1..m { e[i - 1] = beta[i]; }

    tridiag_qr_impl(&mut d, &mut e, m, None);
    d
}

/// Solve eigenvalues AND eigenvectors of symmetric tridiagonal matrix.
/// Returns (eigenvalues sorted ascending, eigenvectors as m×m row-major).
fn tridiag_eigen_vecs(alpha: &[f64], beta: &[f64], m: usize) -> (Vec<f64>, Vec<f64>) {
    if m == 0 { return (vec![], vec![]); }
    if m == 1 { return (vec![alpha[0]], vec![1.0]); }

    let mut d = alpha[..m].to_vec();
    let mut e = vec![0.0; m];
    for i in 1..m { e[i - 1] = beta[i]; }

    // Initialize Z = I
    let mut z = vec![0.0; m * m];
    for i in 0..m { z[i * m + i] = 1.0; }

    tridiag_qr_impl(&mut d, &mut e, m, Some(&mut z));
    (d, z)
}

// ---------------------------------------------------------------------------
// Implicitly Restarted Lanczos Method (IRLM)
// ---------------------------------------------------------------------------

/// Twice project against the locked, metric-normalized eigendirections.
fn project_locked(w: &mut [f64], locked: &[(Vec<f64>, Vec<f64>)]) {
    for _ in 0..2 {
        for (v, bv) in locked {
            let c = dot(w, bv);
            for (x, y) in w.iter_mut().zip(v) { *x -= c * y; }
        }
    }
}

#[cfg(test)]
fn lanczos_irlm(op: &dyn MatVecOp, k: usize, largest: bool, params: &LanczosParams) -> Option<EigenResult> {
    lanczos_deflated(op, k, largest, params, &[], 12345)
}

/// Converge Ritz pairs in the complement of the locked eigendirections.
/// Completeness is checked separately by the Sturm count.
fn lanczos_deflated(
    op: &dyn MatVecOp,
    k: usize,
    largest: bool,
    params: &LanczosParams,
    locked: &[(Vec<f64>, Vec<f64>)],
    mut seed: u64,
) -> Option<EigenResult> {
    let n = op.dim();
    if n == 0 || k == 0 { return None; }
    let k = k.min(n);

    let m = params.subspace_dim
        .unwrap_or_else(|| (4 * k).max(40).min(n));
    let mut m = m.min(n.saturating_sub(locked.len()));
    if m == 0 { return None; }

    let mut q0 = vec![0.0; n];

    for v in q0.iter_mut() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *v = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
    }
    let mut range_start = vec![0.0; n];
    op.mul_vec(&q0, &mut range_start);
    q0 = range_start;
    let nrm = dot(&q0, &q0).sqrt();
    for v in q0.iter_mut() { *v /= nrm; }

    for _restart in 0..params.max_iter {
        let (alpha, beta, q_mat, steps, trailing_beta) = lanczos_tridiag(op, &q0, m, locked);
        let actual_m = steps.min(m);
        if actual_m == 0 { return None; }

        // Early breakdown may be a proper invariant subspace. The caller
        // checks completeness independently rather than rejecting it here.

        // Solve tridiagonal eigenproblem (sorted ascending)
        let (t_vals, t_vecs) = tridiag_eigen_vecs(&alpha[..actual_m], &beta[..actual_m], actual_m);

        // Select which k eigenvalues to extract
        let start = if largest { actual_m.saturating_sub(k) } else { 0 };
        let nk = k.min(actual_m);

        // Compute Ritz vectors for selected eigenvalues
        let mut ritz_vecs = vec![0.0; n * nk];
        for (out_col, t_col) in (start..start + nk).enumerate() {
            for j in 0..actual_m {
                let coeff = t_vecs[j * actual_m + t_col];
                for i in 0..n {
                    ritz_vecs[i * nk + out_col] += coeff * q_mat[j * n + i];
                }
            }
        }

        let selected_vals: Vec<f64> = t_vals[start..start + nk].to_vec();

        // Check convergence. The trailing beta is the one the residual estimate needs:
        // it was previously hardcoded to 0.0 for a full m-step run — the normal case —
        // which made every residual identically zero and every run "converged"
        // regardless of `tol`.
        let beta_m = trailing_beta;
        let mut all_converged = true;
        for (out_col, t_col) in (start..start + nk).enumerate() {
            let residual = (beta_m * t_vecs[(actual_m - 1) * actual_m + t_col]).abs();
            let theta = selected_vals[out_col].abs().max(1e-30);
            if !residual.is_finite() || residual > params.tol * theta {
                all_converged = false;
                break;
            }
        }

        if all_converged {
            return Some(EigenResult { values: selected_vals, vectors: ritz_vecs });
        }

        // Not converged: GROW the subspace rather than reseeding from the best Ritz
        // vector. Reseeding from a single vector stalls on a repeated eigenvalue — it
        // keeps re-entering the same one-dimensional slice of the eigenspace — and was
        // measured running thousands of restarts on a clustered spectrum without ever
        // converging. Growing m converges the same cases in one or two passes: the
        // Krylov space simply has to be large enough to separate the cluster.
        if m >= n - locked.len() { break; }
        m = (m * 2).min(n - locked.len());
    }

    None
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compute k smallest eigenvalues/vectors of symmetric SPD matrix A.
/// Uses inverse-Lanczos (A^{-1} has largest eigenvalues where A has smallest).
/// Uses Jacobi for small matrices (n <= 200); otherwise verifies completeness with inertia.
pub fn lanczos_eigen(
    a: &[f64],
    n: usize,
    k: usize,
    params: Option<LanczosParams>,
) -> Option<EigenResult> {
    let k = k.min(n);
    let p = params.unwrap_or_default();

    // For small problems, use Jacobi directly
    if n <= 200 {
        let full = jacobi_eigen(a, n, 200);
        let nk = k.min(n);
        let values = full.values[..nk].to_vec();
        let mut vectors = vec![0.0; n * nk];
        for col in 0..nk {
            for row in 0..n {
                vectors[row * nk + col] = full.vectors[row * n + col];
            }
        }
        return Some(EigenResult { values, vectors });
    }

    let ids: Vec<_> = (0..n).collect();
    let identity = CscMatrix::from_triplets(n, &ids, &ids, &vec![1.0;n]);
    let matrix = CscMatrix::from_dense_symmetric(a,n);
    let op = SparseShiftInvertOp::new(&matrix,&identity)?;
    sturm_complete_with_params(&op,&matrix,&identity,k,&p)

}

/// Dense `A·x = λ·B·x` for a stiffness `A` and a mass `B` that may be only
/// semidefinite: every eigenpair of finite λ, ascending, B-normalized
/// (`xᵀBx = 1`), with the vectors n×n row-major (columns past `values.len()`
/// are zero).
///
/// `solve_generalized_eigen` factors B, which fails as soon as a DOF carries
/// no mass: the rotation of a node reached only by trusses, or one where every
/// frame is hinged (hinged frames get a lumped mass with no rotary inertia).
/// Such a DOF has an infinite eigenvalue. This is the problem the sparse
/// shift-invert path already solves, by factoring A instead of B: here too,
/// when B is not positive definite, solve `B·x = μ·A·x` (Cholesky of A) and
/// take λ = 1/μ for the μ that are not zero to working precision. The finite
/// eigenpairs are those of the massless DOFs condensed out statically
/// (`K_mm − K_ms·K_ss⁻¹·K_sm` against `M_mm`), exactly, with the massless
/// components of each vector included, `x_s = −K_ss⁻¹·K_sm·x_m`; nothing is
/// added to the model (an artificial mass would invent modes at a frequency
/// set by its arbitrary size).
pub(crate) fn dense_generalized_eigen_semidefinite(a: &[f64], b: &[f64], n: usize) -> Option<EigenResult> {
    let massive: Vec<_> = (0..n).filter(|&i| (0..n).any(|j| b[i*n+j] != 0.0)).collect();
    let massless: Vec<_> = (0..n).filter(|i| !massive.contains(i)).collect();
    if !massless.is_empty() {
        let nm = massive.len(); let ns = massless.len();
        if nm == 0 { return None; }
        let mut l = vec![0.0;ns*ns];
        for (i,&ri) in massless.iter().enumerate() { for (j,&rj) in massless.iter().enumerate() { l[i*ns+j] = a[ri*n+rj]; } }
        if !cholesky_decompose(&mut l,ns) { return None; }
        let mut recovery = vec![0.0;ns*nm];
        for (j,&rj) in massive.iter().enumerate() {
            let rhs: Vec<_> = massless.iter().map(|&ri| -a[ri*n+rj]).collect();
            let x = back_solve(&l,&forward_solve(&l,&rhs,ns),ns);
            for i in 0..ns { recovery[i*nm+j] = x[i]; }
        }
        let mut ac = vec![0.0;nm*nm]; let mut bc = vec![0.0;nm*nm];
        for (i,&ri) in massive.iter().enumerate() { for (j,&rj) in massive.iter().enumerate() {
            ac[i*nm+j] = a[ri*n+rj] + massless.iter().enumerate().map(|(s,&rs)| a[ri*n+rs]*recovery[s*nm+j]).sum::<f64>();
            bc[i*nm+j] = b[ri*n+rj];
        }}
        let r = solve_generalized_eigen(&ac,&bc,nm,200)?;
        let mut vectors = vec![0.0;n*n];
        for col in 0..nm {
            for (i,&ri) in massive.iter().enumerate() { vectors[ri*n+col] = r.vectors[i*nm+col]; }
            for (i,&ri) in massless.iter().enumerate() { vectors[ri*n+col] = (0..nm).map(|j| recovery[i*nm+j]*r.vectors[j*nm+col]).sum(); }
        }
        return Some(EigenResult { values: r.values, vectors });
    }
    if let Some(r) = solve_generalized_eigen(a, b, n, 200) { return Some(r); }
    let recip = solve_generalized_eigen(b, a, n, 200)?;
    let mu_max = recip.values.iter().cloned().fold(0.0f64, f64::max);
    if !(mu_max > 0.0) {
        return None;
    }
    // μ = 1/λ, ascending; keep the nonzero ones from the top (lowest λ first).
    let mut kept: Vec<(f64, usize)> = recip.values.iter().enumerate()
        .filter(|&(_, &mu)| mu > mu_max * 1e-12)
        .map(|(j, &mu)| (1.0 / mu, j))
        .collect();
    kept.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap());
    let mut vectors = vec![0.0; n * n];
    for (col, &(lam, j)) in kept.iter().enumerate() {
        // xᵀAx = 1, so xᵀBx = μ: rescale to xᵀBx = 1.
        let s = lam.sqrt();
        for row in 0..n {
            vectors[row * n + col] = recip.vectors[row * n + j] * s;
        }
    }
    Some(EigenResult { values: kept.iter().map(|p| p.0).collect(), vectors })
}

/// Compute k smallest eigenvalues of generalized problem A*x = λ*B*x.
/// Finds the lowest modes with zero-shift inversion and a Sturm completeness check.
/// The shift argument is retained for compatibility; K must be positive definite.
pub fn lanczos_generalized_eigen(
    a: &[f64],
    b: &[f64],
    n: usize,
    k: usize,
    sigma: f64,
) -> Option<EigenResult> {
    let k = k.min(n);

    // For small problems, use dense path directly
    if n <= 80 || (n <= 200 && k >= n / 2) {
        let full = dense_generalized_eigen_semidefinite(a, b, n)?;
        let nk = k.min(full.values.len());
        let values = full.values[..nk].to_vec();
        let mut vectors = vec![0.0; n * nk];
        for col in 0..nk {
            for row in 0..n {
                vectors[row * nk + col] = full.vectors[row * n + col];
            }
        }
        return Some(EigenResult { values, vectors });
    }

    lanczos_generalized_eigen_sparse(&CscMatrix::from_dense_symmetric(a,n), &CscMatrix::from_dense_symmetric(b,n), k, sigma)

}

// ---------------------------------------------------------------------------
// Sparse operators for CscMatrix
// ---------------------------------------------------------------------------

/// Sparse symmetric matrix-vector: y = A*x using lower-triangle CSC.
pub struct SparseSymMatVec<'a> {
    pub csc: &'a CscMatrix,
}

impl<'a> MatVecOp for SparseSymMatVec<'a> {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        let result = self.csc.sym_mat_vec(x);
        y[..self.csc.n].copy_from_slice(&result);
    }
    fn dim(&self) -> usize { self.csc.n }
}

/// Sparse shift-invert operator: y = K⁻¹ B x (for σ=0).
/// Factorizes K once with sparse Cholesky; each Lanczos iteration does
/// a sparse O(nnz) B·x matvec (`CscMatrix::sym_mat_vec`) then a sparse
/// triangular solve. B is typically the mass matrix M (modal) or -Kg
/// (buckling) — both element-sparse.
pub struct SparseShiftInvertOp<'a> {
    factor: super::sparse_chol::NumericCholesky,
    b_csc: &'a CscMatrix,
    /// The matrix defining the inner product the Lanczos recurrence runs in.
    ///
    /// `lanczos_tridiag` builds a B-orthogonal basis, which needs its inner
    /// product to come from a POSITIVE DEFINITE matrix — otherwise
    /// `⟨q, Bq⟩` can be negative and the recurrence has no meaning.
    ///
    /// For the modal problem K⁻¹M that matrix can be M, which is positive
    /// (semi-)definite. For BUCKLING it cannot: the operator is K⁻¹(−Kg) and
    /// −Kg is indefinite for any model carrying both tension and compression,
    /// which is nearly all of them. Using it produced NaN from
    /// `dot(q, Bq).sqrt()` at the seed, and mid-iteration a negative B-norm was
    /// clamped to zero by `.max(0.0)` and read as an invariant subspace —
    /// truncating the basis and returning eigenvalues from a set of vectors
    /// that are not B-orthogonal, with no fallback.
    ///
    /// K works for both: it is SPD by construction, and A = K⁻¹B is self-adjoint
    /// in ⟨·,·⟩_K because ⟨Ax, y⟩_K = xᵀBy = ⟨x, Ay⟩_K. The Ritz values are
    /// unchanged — θ = μ either way — only the basis is built in a metric that
    /// exists.
    inner: &'a CscMatrix,
}

impl<'a> SparseShiftInvertOp<'a> {
    /// Build from sparse K_ff (SPD) and sparse B_ff (symmetric, lower-triangle
    /// CSC), running the recurrence in the B inner product.
    ///
    /// Only valid when B is positive (semi-)definite — the modal case, where
    /// B is the mass matrix. For an indefinite B use `new_k_inner_product`.
    pub fn new(k_csc: &'a CscMatrix, b_csc: &'a CscMatrix) -> Option<Self> {
        assert_eq!(k_csc.n, b_csc.n, "K and B must have the same dimension");
        let sym = Rc::new(symbolic_cholesky(k_csc));
        let factor = numeric_cholesky(&sym, k_csc)?;
        Some(Self { factor, b_csc, inner: b_csc })
    }

    /// Same operator, with the recurrence running in the K inner product.
    ///
    /// This is the form buckling needs: K is SPD, so the metric is well defined
    /// whatever the sign content of B.
    pub fn new_k_inner_product(k_csc: &'a CscMatrix, b_csc: &'a CscMatrix) -> Option<Self> {
        assert_eq!(k_csc.n, b_csc.n, "K and B must have the same dimension");
        let sym = Rc::new(symbolic_cholesky(k_csc));
        let factor = numeric_cholesky(&sym, k_csc)?;
        Some(Self { factor, b_csc, inner: k_csc })
    }
}

impl<'a> MatVecOp for SparseShiftInvertOp<'a> {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        // tmp = B * x (sparse, O(nnz))
        let tmp = self.b_csc.sym_mat_vec(x);
        // y = K⁻¹ tmp (sparse Cholesky solve)
        let result = sparse_cholesky_solve(&self.factor, &tmp);
        y[..self.b_csc.n].copy_from_slice(&result);
    }
    fn dim(&self) -> usize { self.b_csc.n }
    fn b_mul(&self, x: &[f64], y: &mut [f64]) {
        let r = self.inner.sym_mat_vec(x);
        y[..self.inner.n].copy_from_slice(&r);
    }
}

/// Compute k smallest eigenvalues of generalized problem A*x = λ*B*x
/// where A and B are sparse (CscMatrix, symmetric lower triangle).
/// Uses sparse shift-invert Lanczos with σ=0 (K⁻¹ M x).
/// Uses dense Jacobi for small matrices (up to 200 when requesting half the
/// spectrum or when K is not invertible). Large sparse failures return None,
/// with no dimension cap and no dense fallback.
pub fn lanczos_generalized_eigen_sparse(
    k_ff: &CscMatrix,
    m_ff: &CscMatrix,
    k: usize,
    sigma: f64,
) -> Option<EigenResult> {
    let n = k_ff.n;
    assert_eq!(m_ff.n, n, "K and M must have the same dimension");
    let k = k.min(n);

    if n <= 80 || (n <= 200 && k >= n / 2) {
        return lanczos_generalized_eigen(&k_ff.to_dense_symmetric(), &m_ff.to_dense_symmetric(), n, k, sigma);
    }
    // K is SPD: zero-shift inversion always targets the lowest finite modes.
    if let Some(op) = SparseShiftInvertOp::new(k_ff, m_ff) {
        return sturm_complete(&op, k_ff, m_ff, k);
    }
    // Small non-SPD stiffness problems include the mechanism-detection path.
    // Jacobi can resolve their zero/negative modes; inverse iteration cannot.
    if n <= 200 {
        let full = dense_generalized_eigen_semidefinite(&k_ff.to_dense_symmetric(), &m_ff.to_dense_symmetric(), n)?;
        let nk = k.min(full.values.len());
        let mut vectors = vec![0.0;n*nk];
        for row in 0..n { for col in 0..nk { vectors[row*nk+col] = full.vectors[row*n+col]; } }
        return Some(EigenResult { values: full.values[..nk].to_vec(), vectors });
    }
    None
}

/// Lock converged independent directions and use Sylvester inertia to certify
/// that no eigenvalue below the requested boundary was skipped. Complete the
/// boundary cluster internally even when only part of it was requested.
fn sturm_complete(op: &dyn MatVecOp, a: &CscMatrix, b: &CscMatrix, k: usize) -> Option<EigenResult> {
    sturm_complete_with_params(op,a,b,k,&LanczosParams::default())
}

// Retry a rejected LDLᵀ factorization at a larger spectral margin. Return
// the actual cutoff with the count so the caller compares the same interval.
fn sturm_count_above(a: &CscMatrix, b: &CscMatrix, boundary: f64) -> Option<(usize, f64)> {
    let n = a.n;
    for margin in [1e-7, 3e-7, 1e-6] {
        let sigma = boundary * (1.0+margin);
        let mut rows = Vec::with_capacity(a.values.len()+b.values.len());
        let mut cols = Vec::with_capacity(rows.capacity());
        let mut vals = Vec::with_capacity(rows.capacity());
        for (matrix, scale) in [(a,1.0),(b,-sigma)] {
            for j in 0..n { for p in matrix.col_ptr[j]..matrix.col_ptr[j+1] {
                rows.push(matrix.row_idx[p]); cols.push(j); vals.push(scale*matrix.values[p]);
            }}
        }
        let shifted = CscMatrix::from_triplets(n,&rows,&cols,&vals);
        let sym = symbolic_cholesky(&shifted);
        if let Some(count) = super::sparse_chol::sparse_negative_inertia(&sym,&shifted) {
            return Some((count, sigma));
        }
    }
    None
}

fn positive_spectrum_upper_bound(b: &CscMatrix) -> usize {
    let mut active = vec![false; b.n];
    for j in 0..b.n { for p in b.col_ptr[j]..b.col_ptr[j+1] {
        if b.values[p] != 0.0 { active[j] = true; active[b.row_idx[p]] = true; }
    }}
    let mut indices = vec![0; b.n];
    let mut rank_bound = 0;
    for i in 0..b.n {
        if active[i] { indices[i] = rank_bound; rank_bound += 1; }
    }
    if rank_bound == 0 { return 0; }
    let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
    for j in 0..b.n { for p in b.col_ptr[j]..b.col_ptr[j+1] {
        if b.values[p] != 0.0 {
            rows.push(indices[b.row_idx[p]]); cols.push(indices[j]); vals.push(-b.values[p]);
        }
    }}
    let negative_b = CscMatrix::from_triplets(rank_bound, &rows, &cols, &vals);
    super::sparse_chol::sparse_negative_inertia(&symbolic_cholesky(&negative_b), &negative_b)
        .unwrap_or(rank_bound)
}

fn sturm_complete_with_params(op: &dyn MatVecOp, a: &CscMatrix, b: &CscMatrix, k: usize, params: &LanczosParams) -> Option<EigenResult> {
    let n = a.n;
    if k == 0 { return Some(EigenResult { values: vec![], vectors: vec![] }); }
    // Infinity norms for a scale-independent backward-error check, including
    // near-zero modes whose Kφ is dominated by cancellation.
    let matrix_norm = |matrix: &CscMatrix| {
        let mut sums = vec![0.0; n];
        for j in 0..n { for p in matrix.col_ptr[j]..matrix.col_ptr[j+1] {
            let i = matrix.row_idx[p];
            sums[i] += matrix.values[p].abs();
            if i != j { sums[j] += matrix.values[p].abs(); }
        }}
        sums.into_iter().fold(0.0f64, f64::max)
    };
    let a_norm = matrix_norm(a);
    let b_norm = matrix_norm(b);
    let k = k.min(positive_spectrum_upper_bound(b));
    if k == 0 { return Some(EigenResult { values: vec![], vectors: vec![] }); }
    let mut locked = Vec::new();
    let mut values = Vec::new();
    let mut seed = 12345u64;
    for _ in 0..params.max_iter {
        let r = lanczos_deflated(op, k.min(n-locked.len()), true, params, &locked, seed)?;
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        let nk = r.values.len();
        for col in (0..nk).rev() {
            let mu = r.values[col];
            if !mu.is_finite() || mu <= 0.0 { continue; }
            let mut v: Vec<_> = (0..n).map(|i| r.vectors[i*nk+col]).collect();
            project_locked(&mut v, &locked);
            let mut bv = vec![0.0;n]; op.b_mul(&v,&mut bv);
            let norm = dot(&v,&bv).sqrt();
            if !norm.is_finite() || norm < 1e-8 { continue; }
            for x in &mut v { *x /= norm; }
            for x in &mut bv { *x /= norm; }
            // Validate the original operator after projection, not just its Ritz estimate.
            let mut av = vec![0.0;n]; op.mul_vec(&v,&mut av);
            for i in 0..n { av[i] -= mu*v[i]; }
            let mut bav = vec![0.0;n]; op.b_mul(&av,&mut bav);
            let residual2 = dot(&av,&bav);
            if !residual2.is_finite() || residual2.max(0.0).sqrt() > 1e-8*mu.abs() { continue; }
            // Also check the original pencil: a semidefinite mass norm alone
            // cannot detect an erroneous displacement in a massless direction.
            let kv = a.sym_mat_vec(&v);
            let mv = b.sym_mat_vec(&v);
            let mut residual = 0.0f64;
            let v_norm = v.iter().fold(0.0f64, |m,x| m.max(x.abs()));
            let scale = (mu.abs()*a_norm+b_norm)*v_norm;
            for i in 0..n {
                let left = mu * kv[i];
                if !left.is_finite() || !mv[i].is_finite() { return None; }
                residual = residual.max((left-mv[i]).abs());
            }
            if !scale.is_finite() || residual > 1e-10 * scale { continue; }
            locked.push((v,bv)); values.push(1.0/mu);
        }
        if values.len() < k { continue; }
        let mut order: Vec<_> = (0..values.len()).collect();
        order.sort_by(|&i,&j| values[i].total_cmp(&values[j]));
        let boundary = values[order[k-1]];
        let certified = if let Some((count, sigma)) = sturm_count_above(a, b, boundary) {
            let found = values.iter().filter(|&&v| v < sigma).count();
            if count < found { return None; }
            count == found
        } else { false };
        if certified {
            let mut vectors = vec![0.0;n*k];
            for (col,&index) in order[..k].iter().enumerate() {
                for row in 0..n { vectors[row*k+col] = locked[index].0[row]; }
            }
            return Some(EigenResult { values: order[..k].iter().map(|&i| values[i]).collect(), vectors });
        }
        if locked.len() == n { return None; }
    }
    None
}

/// Solve buckling eigenproblem (-Kg)*φ = μ*K*φ where K is sparse SPD
/// and -Kg is sparse indefinite (both CSC, symmetric lower triangle).
/// Returns μ eigenvalues (caller does λ = 1/μ).
///
/// For small n: dense Jacobi with `solve_generalized_eigen(-Kg, K)` (Cholesky on K, SPD).
/// For large n: sparse shift-invert Lanczos finds largest μ = eigenvalues of K⁻¹(-Kg).
pub fn lanczos_buckling_eigen_sparse(
    k_ff: &CscMatrix,
    neg_kg: &CscMatrix,
    k: usize,
) -> Option<EigenResult> {
    let n = k_ff.n;
    assert_eq!(neg_kg.n, n, "K and Kg must have the same dimension");
    let k = k.min(n);

    // For small problems, use dense Jacobi: (-Kg)*φ = μ*K*φ
    // solve_generalized_eigen(A, B) solves A*x = λ*B*x by Cholesky-decomposing B.
    // Here B = K (SPD) which is safe.
    // Return ALL eigenvalues — caller filters for positive μ.
    if n <= 200 {
        let k_dense = k_ff.to_dense_symmetric();
        let neg_kg_dense = neg_kg.to_dense_symmetric();
        return solve_generalized_eigen(&neg_kg_dense, &k_dense, n, 200);
    }

    let op = SparseShiftInvertOp::new_k_inner_product(k_ff,neg_kg)?;
    let mut result = sturm_complete(&op,k_ff,neg_kg,k)?;
    for value in &mut result.values { *value = 1.0 / *value; }
    Some(result)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Buckling must stay on the SPARSE path when -Kg is indefinite.
    ///
    /// `(-Kg)φ = μKφ` has an indefinite right-hand matrix for any model carrying
    /// tension and compression at once — nearly all of them. The Lanczos
    /// recurrence builds a basis orthogonal in some inner product, and that
    /// product must come from a positive definite matrix. So it runs in K, which
    /// is SPD by construction, not in -Kg.
    ///
    /// The symptom is not a wrong answer: `lanczos_buckling_eigen_sparse` falls
    /// back to dense Jacobi when the iteration bails, so the eigenvalues come
    /// back correct either way and a numbers-only test cannot see the defect.
    /// What it loses is the entire point of the sparse path — that fallback
    /// calls `to_dense_symmetric()` on both K and -Kg, which is exactly the
    /// n×n densification the sparse buckling work exists to remove. The
    /// optimization silently did not apply to the models that need it.
    ///
    /// So this test asserts on the ITERATION, not on the numbers: run the two
    /// operators directly, past the fallback, and check that the -Kg metric
    /// bails and the K metric does not.
    #[test]
    fn buckling_lanczos_stays_sparse_when_kg_is_indefinite() {
        let n = 300;
        let k = 4;

        // K: SPD tridiagonal.
        let (mut kr, mut kc, mut kv) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            kr.push(i);
            kc.push(i);
            kv.push(4.0);
            if i + 1 < n {
                kr.push(i + 1);
                kc.push(i);
                kv.push(-1.0);
            }
        }
        let k_ff = CscMatrix::from_triplets(n, &kr, &kc, &kv);

        // -Kg: mostly tension, a few compressed DOFs. Predominantly negative so
        // the deterministic Lanczos seed lands with a NEGATIVE -Kg-norm, which
        // is what turns `dot(q, Bq).sqrt()` into NaN.
        let (mut gr, mut gc, mut gv) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            gr.push(i);
            gc.push(i);
            gv.push(if i % 7 == 0 { 1.0 } else { -1.0 });
        }
        let neg_kg = CscMatrix::from_triplets(n, &gr, &gc, &gv);
        assert!(
            gv.iter().any(|&v| v < 0.0) && gv.iter().any(|&v| v > 0.0),
            "the fixture must be indefinite for this test to mean anything",
        );

        let params = LanczosParams {
            max_iter: 300,
            tol: 1e-10,
            subspace_dim: Some((4 * k).max(40).min(n)),
        };

        // The -Kg metric cannot carry the recurrence: it bails, and the caller
        // silently densifies.
        let with_kg_metric = SparseShiftInvertOp::new(&k_ff, &neg_kg)
            .and_then(|op| lanczos_irlm(&op, k, true, &params));
        assert!(
            with_kg_metric.is_none(),
            "running the recurrence in an indefinite -Kg should not produce a result; \
             if this ever starts succeeding, check that it is not returning \
             eigenvalues from a non-B-orthogonal basis",
        );

        // The K metric does carry it.
        let sparse = SparseShiftInvertOp::new_k_inner_product(&k_ff, &neg_kg)
            .and_then(|op| lanczos_irlm(&op, k, true, &params))
            .expect("the K inner product must carry the iteration through");

        // And it agrees with the dense reference on the governing mode.
        let dense = solve_generalized_eigen(
            &neg_kg.to_dense_symmetric(),
            &k_ff.to_dense_symmetric(),
            n,
            200,
        )
        .expect("dense reference should solve");

        let top = |vals: &[f64]| -> f64 {
            vals.iter()
                .copied()
                .filter(|v| v.is_finite() && *v > 1e-12)
                .fold(f64::MIN, f64::max)
        };
        // And the public entry point must actually take that path. The dense
        // fallback returns ALL n eigenvalues so the caller can hunt for positive
        // mu; the sparse path returns at most k. That difference is what makes
        // the fallback observable from outside without instrumenting it.
        let via_entry_point = lanczos_buckling_eigen_sparse(&k_ff, &neg_kg, k)
            .expect("entry point must produce a result");
        assert!(
            via_entry_point.values.len() <= k,
            "lanczos_buckling_eigen_sparse returned {} eigenvalues for k = {k}: that is \
             the dense fallback, so the sparse path silently did not apply",
            via_entry_point.values.len(),
        );

        let (mu_sparse, mu_dense) = (top(&sparse.values), top(&dense.values));
        assert!(mu_sparse.is_finite(), "sparse path produced no finite positive eigenvalue");
        let rel = (mu_sparse - mu_dense).abs() / mu_dense.abs().max(1e-30);
        assert!(
            rel < 1e-6,
            "governing mu disagrees with the dense reference: sparse {mu_sparse} \
             vs dense {mu_dense} (rel {rel:e})",
        );
    }

    /// Pre-sparse-mass shift-invert operator holding B as a dense matrix.
    /// Kept as a parity reference: same sparse Cholesky factorization of K,
    /// but B·x is a dense O(n²) matvec (the old `SparseShiftInvertOp`).
    struct DenseBShiftInvertOp {
        factor: crate::linalg::sparse_chol::NumericCholesky,
        b_dense: Vec<f64>,
        n: usize,
    }

    impl DenseBShiftInvertOp {
        fn new(k_csc: &CscMatrix, b_dense: &[f64], n: usize) -> Option<Self> {
            let sym = std::rc::Rc::new(symbolic_cholesky(k_csc));
            let factor = numeric_cholesky(&sym, k_csc)?;
            Some(Self { factor, b_dense: b_dense.to_vec(), n })
        }
    }

    impl MatVecOp for DenseBShiftInvertOp {
        fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
            let n = self.n;
            let mut tmp = vec![0.0; n];
            for i in 0..n {
                let mut s = 0.0;
                for j in 0..n { s += self.b_dense[i * n + j] * x[j]; }
                tmp[i] = s;
            }
            let result = sparse_cholesky_solve(&self.factor, &tmp);
            y[..n].copy_from_slice(&result);
        }
        fn dim(&self) -> usize { self.n }
        /// Must mirror `SparseShiftInvertOp::b_mul` or this stops being a parity
        /// test: the recurrence would run in a different inner product on each
        /// side and the two would disagree for that reason rather than for the
        /// B·x representation the test is actually comparing.
        fn b_mul(&self, x: &[f64], y: &mut [f64]) {
            let n = self.n;
            for i in 0..n {
                let mut s = 0.0;
                for j in 0..n { s += self.b_dense[i * n + j] * x[j]; }
                y[i] = s;
            }
        }
    }

    #[test]
    fn test_sparse_shift_invert_op_csc_vs_dense_parity() {
        // Same K factorization, same Lanczos seed — only the B·x
        // representation differs (CSC sym_mat_vec vs dense matvec).
        // Eigenvalues must agree to ~1e-12 (summation-order rounding only).
        let n = 120;
        // K: 1-2-1 tridiagonal SPD (structural-like), as CSC triplets.
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i); cols.push(i); vals.push(2.0);
            if i > 0 {
                rows.push(i); cols.push(i - 1); vals.push(-1.0);
            }
        }
        let k_csc = CscMatrix::from_triplets(n, &rows, &cols, &vals);

        // B: sparse SPD "mass-like" matrix (diagonally dominant tridiagonal
        // with varying entries), built both as CSC and dense.
        let mut brows = Vec::new();
        let mut bcols = Vec::new();
        let mut bvals = Vec::new();
        for i in 0..n {
            let d = 4.0 + 0.01 * i as f64;
            brows.push(i); bcols.push(i); bvals.push(d);
            if i > 0 {
                let o = 0.5 + 0.001 * i as f64;
                brows.push(i); bcols.push(i - 1); bvals.push(o);
            }
        }
        let b_csc = CscMatrix::from_triplets(n, &brows, &bcols, &bvals);
        let b_dense = b_csc.to_dense_symmetric();

        let params = LanczosParams { max_iter: 300, tol: 1e-12, subspace_dim: Some(40) };
        let k_modes = 6;

        let sparse_op = SparseShiftInvertOp::new(&k_csc, &b_csc).unwrap();
        let dense_op = DenseBShiftInvertOp::new(&k_csc, &b_dense, n).unwrap();

        let sparse_res = lanczos_irlm(&sparse_op, k_modes, true, &params).unwrap();
        let dense_res = lanczos_irlm(&dense_op, k_modes, true, &params).unwrap();

        assert_eq!(sparse_res.values.len(), dense_res.values.len());
        for i in 0..sparse_res.values.len() {
            let a = sparse_res.values[i];
            let b = dense_res.values[i];
            let rel = (a - b).abs() / b.abs().max(1e-30);
            assert!(rel < 1e-12,
                "eigenvalue {}: sparse-op={:.15e}, dense-op={:.15e}, rel={:.2e}", i, a, b, rel);
        }
    }

    #[test]
    fn test_tridiag_eigen_diagonal() {
        let alpha = vec![3.0, 1.0, 2.0];
        let beta = vec![0.0, 0.0, 0.0];
        let vals = tridiag_eigen(&alpha, &beta, 3);
        assert!((vals[0] - 1.0).abs() < 1e-10);
        assert!((vals[1] - 2.0).abs() < 1e-10);
        assert!((vals[2] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_tridiag_eigen_2x2() {
        // T = [[2, 1], [1, 3]]
        let alpha = vec![2.0, 3.0];
        let beta = vec![0.0, 1.0];
        let vals = tridiag_eigen(&alpha, &beta, 2);
        let expected_min = (5.0 - 5.0_f64.sqrt()) / 2.0;
        let expected_max = (5.0 + 5.0_f64.sqrt()) / 2.0;
        assert!((vals[0] - expected_min).abs() < 1e-10, "got {}", vals[0]);
        assert!((vals[1] - expected_max).abs() < 1e-10, "got {}", vals[1]);
    }

    #[test]
    fn test_tridiag_eigen_5x5() {
        // 1-2-1 tridiagonal (n=5): eigenvalues = 2 - 2*cos(k*π/6) for k=1..5
        let n = 5;
        let alpha = vec![2.0; n];
        let mut beta = vec![0.0; n];
        for i in 1..n { beta[i] = 1.0; }
        let vals = tridiag_eigen(&alpha, &beta, n);
        for k in 1..=n {
            let expected = 2.0 - 2.0 * (k as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
            assert!((vals[k - 1] - expected).abs() < 1e-8,
                "k={}: expected {}, got {}", k, expected, vals[k - 1]);
        }
    }

    #[test]
    fn test_lanczos_eigen_diagonal_3x3() {
        let a = vec![3.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 2.0];
        let result = lanczos_eigen(&a, 3, 2, None).unwrap();
        assert!((result.values[0] - 1.0).abs() < 1e-8);
        assert!((result.values[1] - 2.0).abs() < 1e-8);
    }

    #[test]
    fn test_lanczos_eigen_2x2() {
        let a = vec![2.0, 1.0, 1.0, 3.0];
        let result = lanczos_eigen(&a, 2, 2, None).unwrap();
        let expected_min = (5.0 - 5.0_f64.sqrt()) / 2.0;
        let expected_max = (5.0 + 5.0_f64.sqrt()) / 2.0;
        assert!((result.values[0] - expected_min).abs() < 1e-8);
        assert!((result.values[1] - expected_max).abs() < 1e-8);
    }

    #[test]
    fn test_lanczos_generalized_2x2() {
        let a = vec![6.0, 2.0, 2.0, 3.0];
        let b = vec![2.0, 0.0, 0.0, 1.0];
        let result = lanczos_generalized_eigen(&a, &b, 2, 2, 0.0).unwrap();
        assert!(result.values[0] > 1.5 && result.values[0] < 3.0,
            "λ₁ = {}", result.values[0]);
        assert!(result.values[1] > 3.0 && result.values[1] < 6.0,
            "λ₂ = {}", result.values[1]);
    }

    #[test]
    fn test_lanczos_vs_jacobi_10x10() {
        // Random SPD 10×10 matrix
        let n = 10;
        let mut a = vec![0.0; n * n];
        let mut seed: u64 = 42;
        for i in 0..n {
            for j in i..n {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                let val = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
                a[i * n + j] = val;
                a[j * n + i] = val;
            }
            a[i * n + i] += n as f64; // Make diagonally dominant → SPD
        }

        let jacobi_result = jacobi_eigen(&a, n, 200);
        let lanczos_result = lanczos_eigen(&a, n, 5, None).unwrap();

        for i in 0..5 {
            assert!((lanczos_result.values[i] - jacobi_result.values[i]).abs() < 1e-6,
                "eigenvalue {}: lanczos={}, jacobi={}", i, lanczos_result.values[i], jacobi_result.values[i]);
        }
    }

    #[test]
    fn test_lanczos_eigenvector_orthogonality() {
        let n = 10;
        let mut a = vec![0.0; n * n];
        let mut seed: u64 = 99;
        for i in 0..n {
            for j in i..n {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                let val = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
                a[i * n + j] = val;
                a[j * n + i] = val;
            }
            a[i * n + i] += n as f64;
        }

        let result = lanczos_eigen(&a, n, 5, None).unwrap();
        let k = result.values.len();

        // Check Q^T * Q ≈ I
        for i in 0..k {
            for j in 0..k {
                let mut dot_val = 0.0;
                for r in 0..n {
                    dot_val += result.vectors[r * k + i] * result.vectors[r * k + j];
                }
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((dot_val - expected).abs() < 1e-6,
                    "Q^T*Q[{},{}] = {}, expected {}", i, j, dot_val, expected);
            }
        }
    }

    #[test]
    fn test_lanczos_single_eigenvalue() {
        let a = vec![4.0, 1.0, 1.0, 3.0];
        let result = lanczos_eigen(&a, 2, 1, None).unwrap();
        assert_eq!(result.values.len(), 1);
        let expected = (7.0 - 5.0_f64.sqrt()) / 2.0;
        assert!((result.values[0] - expected).abs() < 1e-8);
    }

    #[test]
    fn test_lanczos_generalized_parity() {
        // Same test as jacobi's test_generalized_eigen
        let a = vec![6.0, 2.0, 2.0, 3.0];
        let b = vec![2.0, 0.0, 0.0, 1.0];
        let jacobi = solve_generalized_eigen(&a, &b, 2, 100).unwrap();
        let lanczos = lanczos_generalized_eigen(&a, &b, 2, 2, 0.0).unwrap();
        for i in 0..2 {
            assert!((lanczos.values[i] - jacobi.values[i]).abs() < 1e-6,
                "gen eigenvalue {}: lanczos={}, jacobi={}", i, lanczos.values[i], jacobi.values[i]);
        }
    }

    #[test]
    fn test_lanczos_generalized_indefinite_shift_falls_back_to_dense() {
        // n > 80 so the shift-invert path is taken. With σ = 1.0 the shifted
        // matrix A − σB is indefinite (λ_min(A) ≈ 9.7e-4 ≪ σ), so dense
        // Cholesky of A − σB fails. The function must fall back to the dense
        // generalized solve (documented behavior) instead of returning None.
        let n = 100;
        let mut a = vec![0.0; n * n];
        let mut b = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = 2.0;
            b[i * n + i] = 1.0;
            if i > 0 {
                a[i * n + (i - 1)] = -1.0;
                a[(i - 1) * n + i] = -1.0;
            }
        }
        let k = 3;
        let result = lanczos_generalized_eigen(&a, &b, n, k, 1.0)
            .expect("indefinite shift must fall back to dense solve, not None");
        assert_eq!(result.values.len(), k);
        // λ_j of the 1-2-1 tridiagonal (B = I): 2 − 2cos(jπ/(n+1))
        for j in 0..k {
            let expected = 2.0 - 2.0 * ((j + 1) as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
            let rel_err = (result.values[j] - expected).abs() / expected;
            assert!(rel_err < 1e-6,
                "eigenvalue {}: got {:.10}, expected {:.10}", j, result.values[j], expected);
        }
    }

    #[test]
    fn test_lanczos_100x100_tridiag() {
        // 100×100 tridiagonal: eigenvalues known analytically
        let n = 100;
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = 2.0;
            if i > 0 {
                a[i * n + (i - 1)] = -1.0;
                a[(i - 1) * n + i] = -1.0;
            }
        }
        let k = 5;
        let result = lanczos_eigen(&a, n, k, None).unwrap();
        for j in 0..k {
            let expected = 2.0 - 2.0 * ((j + 1) as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
            assert!((result.values[j] - expected).abs() < 1e-6,
                "eigenvalue {}: got {}, expected {}", j, result.values[j], expected);
        }
    }

    #[test]
    fn test_lanczos_200x200_tridiag() {
        // 200×200 1-2-1 tridiagonal — well-separated eigenvalues like structural problems
        let n = 200;
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = 2.0;
            if i > 0 {
                a[i * n + (i - 1)] = -1.0;
                a[(i - 1) * n + i] = -1.0;
            }
        }
        let k = 10;
        let result = lanczos_eigen(&a, n, k, None).unwrap();
        for j in 0..k {
            let expected = 2.0 - 2.0 * ((j + 1) as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
            let rel_err = (result.values[j] - expected).abs() / expected;
            assert!(rel_err < 1e-6,
                "eigenvalue {}: got {:.8}, expected {:.8}, rel_err={:.2e}",
                j, result.values[j], expected, rel_err);
        }
    }

    #[test]
    fn test_lanczos_500x500_tridiag() {
        // 500×500 tridiagonal — exercises sparse path meaningfully
        let n = 500;
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            a[i * n + i] = 2.0;
            if i > 0 {
                a[i * n + (i - 1)] = -1.0;
                a[(i - 1) * n + i] = -1.0;
            }
        }
        let k = 5;
        let result = lanczos_eigen(&a, n, k, None).unwrap();
        for j in 0..k {
            let expected = 2.0 - 2.0 * ((j + 1) as f64 * std::f64::consts::PI / (n as f64 + 1.0)).cos();
            let rel_err = (result.values[j] - expected).abs() / expected;
            assert!(rel_err < 1e-6,
                "eigenvalue {}: got {:.10}, expected {:.10}, rel_err={:.2e}",
                j, result.values[j], expected, rel_err);
        }
    }

    #[test]
    fn test_tridiag_qr_vs_jacobi_10x10() {
        // Random SPD tridiagonal: QR eigenvalues must match Jacobi
        let m = 10;
        let mut alpha = vec![0.0; m];
        let mut beta = vec![0.0; m];
        let mut seed: u64 = 77;
        for i in 0..m {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            alpha[i] = (seed >> 33) as f64 / (1u64 << 31) as f64 + m as f64;
            if i > 0 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                beta[i] = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
            }
        }

        let qr_vals = tridiag_eigen(&alpha, &beta, m);

        // Jacobi reference
        let mut t = vec![0.0; m * m];
        for i in 0..m {
            t[i * m + i] = alpha[i];
            if i > 0 {
                t[i * m + (i - 1)] = beta[i];
                t[(i - 1) * m + i] = beta[i];
            }
        }
        let jac = jacobi_eigen(&t, m, 200);

        for i in 0..m {
            assert!((qr_vals[i] - jac.values[i]).abs() < 1e-10,
                "eigenvalue {}: qr={}, jacobi={}", i, qr_vals[i], jac.values[i]);
        }
    }

    #[test]
    fn test_tridiag_qr_eigenvec_orthogonality_20x20() {
        // 20×20 1-2-1 tridiagonal: check V^T V = I
        let m = 20;
        let alpha = vec![2.0; m];
        let mut beta = vec![0.0; m];
        for i in 1..m { beta[i] = 1.0; }

        let (vals, vecs) = tridiag_eigen_vecs(&alpha, &beta, m);
        assert_eq!(vals.len(), m);

        // V^T * V should be identity
        for i in 0..m {
            for j in 0..m {
                let mut dot_val = 0.0;
                for r in 0..m {
                    dot_val += vecs[r * m + i] * vecs[r * m + j];
                }
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((dot_val - expected).abs() < 1e-10,
                    "V^T*V[{},{}] = {}, expected {}", i, j, dot_val, expected);
            }
        }
    }

    #[test]
    fn test_tridiag_qr_reconstruction_15x15() {
        // Verify V * diag(λ) * V^T reconstructs the original tridiagonal
        let m = 15;
        let mut alpha = vec![0.0; m];
        let mut beta = vec![0.0; m];
        let mut seed: u64 = 123;
        for i in 0..m {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            alpha[i] = (seed >> 33) as f64 / (1u64 << 31) as f64 + 5.0;
            if i > 0 {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                beta[i] = (seed >> 33) as f64 / (1u64 << 31) as f64;
            }
        }

        let (vals, vecs) = tridiag_eigen_vecs(&alpha, &beta, m);

        // Reconstruct: T_recon = V * diag(λ) * V^T
        for i in 0..m {
            for j in 0..m {
                let mut sum = 0.0;
                for k in 0..m {
                    sum += vecs[i * m + k] * vals[k] * vecs[j * m + k];
                }
                let expected = if i == j {
                    alpha[i]
                } else if j == i + 1 || i == j + 1 {
                    beta[i.max(j)]
                } else {
                    0.0
                };
                assert!((sum - expected).abs() < 1e-8,
                    "T_recon[{},{}] = {}, expected {}", i, j, sum, expected);
            }
        }
    }
}

pub fn eigen_failure_message(n: usize) -> String {
    format!("Eigenvalue decomposition failed: could not establish convergence and Sturm completeness for {n} free DOFs (factorization failure or iteration limit). Check supports and releases for mechanisms, stiffness/mass conditioning, or request fewer modes; no incomplete modes were returned.")
}

#[cfg(test)]
mod completeness_tests {
    use super::*;
    #[test]
    fn exhausted_finite_modal_spectrum_is_certified() {
        let n = 201;
        let ids: Vec<_> = (0..n).collect();
        let k = CscMatrix::from_triplets(n, &ids, &ids, &vec![1.0; n]);
        for count in [0, 1, 3] {
            let mass_ids: Vec<_> = (0..count).collect();
            let m = CscMatrix::from_triplets(n, &mass_ids, &mass_ids, &vec![1.0; count]);
            let r = lanczos_generalized_eigen_sparse(&k, &m, 6, 0.0).unwrap();
            assert_eq!(r.values.len(), count);
            for col in 0..count {
                assert!((r.values[col] - 1.0).abs() < 1e-10);
                let v: Vec<_> = (0..n).map(|i| r.vectors[i*count+col]).collect();
                let mv = m.sym_mat_vec(&v);
                for i in 0..n { assert!((v[i] - r.values[col]*mv[i]).abs() < 1e-10); }
                for other in 0..count {
                    let gram: f64 = (0..n).map(|i| r.vectors[i*count+other]*mv[i]).sum();
                    assert!((gram - if col == other { 1.0 } else { 0.0 }).abs() < 1e-10);
                }
            }
        }
    }

    #[test]
    fn exhausted_positive_buckling_spectrum_is_certified() {
        let n = 201;
        let ids: Vec<_> = (0..n).collect();
        let k = CscMatrix::from_triplets(n, &ids, &ids, &vec![1.0; n]);
        for count in [0, 1, 3] {
            let diagonal: Vec<_> = (0..n).map(|i| if i < count { 2.0 } else { -1.0 }).collect();
            let b = CscMatrix::from_triplets(n, &ids, &ids, &diagonal);
            let r = lanczos_buckling_eigen_sparse(&k, &b, 6).unwrap();
            assert_eq!(r.values.len(), count);
            for col in 0..count {
                assert!((r.values[col] - 2.0).abs() < 1e-10);
                for i in 0..n {
                    assert!(((diagonal[i]-r.values[col])*r.vectors[i*count+col]).abs() < 1e-10);
                }
            }
        }
    }

    #[test]
    fn exact_and_near_singular_sturm_shifts_are_perturbed_and_recounted() {
        let first_shift = 1.0 + 1e-7;
        let m = CscMatrix::from_triplets(2, &[0, 1], &[0, 1], &[1.0, 1.0]);
        for delta in [0.0, f64::EPSILON] {
            let a = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1],
                &[2.0 + first_shift, 1.0, 0.5 + first_shift + delta]);
            let shifted = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1],
                &[a.values[0] - first_shift, 1.0, a.values[2] - first_shift]);
            assert_eq!(super::super::sparse_chol::sparse_negative_inertia(
                &symbolic_cholesky(&shifted), &shifted), None);
            let (count, cutoff) = sturm_count_above(&a, &m, 1.0).unwrap();
            assert!(cutoff > first_shift);
            assert_eq!(count, 1);
        }
    }

    #[test]
    fn incomplete_cluster_refuses_at_restart_limit() {
        let n = 120;
        let ids: Vec<_> = (0..n).collect();
        let k = CscMatrix::from_triplets(n,&ids,&ids,&(0..n).map(|i| (i/3+1) as f64).collect::<Vec<_>>());
        let m = CscMatrix::from_triplets(n,&ids,&ids,&vec![1.0;n]);
        let op = SparseShiftInvertOp::new(&k,&m).unwrap();
        let params = LanczosParams { max_iter: 1, subspace_dim: Some(n), ..Default::default() };
        assert!(sturm_complete_with_params(&op,&k,&m,2,&params).is_none());
        let r = sturm_complete(&op,&k,&m,2).unwrap();
        assert!(r.values.iter().all(|v| (v-1.0).abs() < 1e-10));
        assert!(eigen_failure_message(n).contains("no incomplete modes"));
    }
    #[test]
    fn massless_condensation_keeps_high_modes_and_recovers_coordinates() {
        let a = [1e-10,0.,0.,0., 0.,1e4,0.,0., 0.,0.,1e4,0., 0.,0.,0.,2.];
        let b = [1.,0.,0.,0., 0.,1.,0.,0., 0.,0.,1.,0., 0.,0.,0.,0.];
        let r = dense_generalized_eigen_semidefinite(&a,&b,4).unwrap();
        assert_eq!(r.values,vec![1e-10,1e4,1e4]);
        let a = [2.,-1.,0., -1.,2.,-1., 0.,-1.,3.];
        let b = [1.,0.,0., 0.,0.,0., 0.,0.,2.];
        let r = dense_generalized_eigen_semidefinite(&a,&b,3).unwrap();
        assert_eq!(r.values.len(),2);
        for col in 0..2 {
            let v: Vec<_> = (0..3).map(|i| r.vectors[i*3+col]).collect();
            assert!((v[0]*v[0]+2.*v[2]*v[2]-1.).abs() < 1e-12);
            for i in 0..3 {
                let residual: f64 = (0..3).map(|j| (a[i*3+j]-r.values[col]*b[i*3+j])*v[j]).sum();
                assert!(residual.abs() < 1e-12);
            }
        }
    }
}
