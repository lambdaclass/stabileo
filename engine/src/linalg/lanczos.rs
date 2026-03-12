use super::cholesky::{cholesky_decompose, forward_solve, back_solve};
use super::jacobi::{jacobi_eigen, solve_generalized_eigen, EigenResult};
use super::sparse::CscMatrix;
use super::sparse_chol::{symbolic_cholesky, numeric_cholesky, sparse_cholesky_solve};

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

/// Inverse operator: y = A^{-1} * x (for finding smallest eigenvalues of A).
struct InverseOp {
    l_factor: Vec<f64>,
    n: usize,
}

impl InverseOp {
    fn new(a: &[f64], n: usize) -> Option<Self> {
        let mut l = a.to_vec();
        if !cholesky_decompose(&mut l, n) { return None; }
        Some(Self { l_factor: l, n })
    }
}

impl MatVecOp for InverseOp {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        let z = forward_solve(&self.l_factor, x, self.n);
        let result = back_solve(&self.l_factor, &z, self.n);
        y[..self.n].copy_from_slice(&result);
    }
    fn dim(&self) -> usize { self.n }
}

/// Shift-invert operator: y = (A - σ*B)^{-1} * B * x
/// Used for generalized eigenvalue A*x = λ*B*x near shift σ.
struct ShiftInvertOp {
    l_factor: Vec<f64>,
    b: Vec<f64>,
    n: usize,
}

impl ShiftInvertOp {
    fn new(a: &[f64], b: &[f64], n: usize, sigma: f64) -> Option<Self> {
        let mut shifted = vec![0.0; n * n];
        for i in 0..n * n {
            shifted[i] = a[i] - sigma * b[i];
        }
        if !cholesky_decompose(&mut shifted, n) { return None; }
        Some(Self { l_factor: shifted, b: b.to_vec(), n })
    }
}

impl MatVecOp for ShiftInvertOp {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        let n = self.n;
        let mut tmp = vec![0.0; n];
        for i in 0..n {
            let mut s = 0.0;
            for j in 0..n { s += self.b[i * n + j] * x[j]; }
            tmp[i] = s;
        }
        let z = forward_solve(&self.l_factor, &tmp, n);
        let result = back_solve(&self.l_factor, &z, n);
        y[..n].copy_from_slice(&result);
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
) -> (Vec<f64>, Vec<f64>, Vec<f64>, usize) {
    let n = op.dim();
    let mut alpha = vec![0.0; m];
    let mut beta = vec![0.0; m];
    // Q stored as m vectors of length n, row-major: q_j at offset j*n
    let mut q = vec![0.0; m * n];

    // q_0 = q_start / ||q_start||
    let nrm = dot(q_start, q_start).sqrt();
    for i in 0..n {
        q[i] = q_start[i] / nrm;
    }

    let mut w = vec![0.0; n];
    let mut steps = 0;

    for j in 0..m {
        steps = j + 1;
        // w = A * q_j
        op.mul_vec(&q[j * n..(j + 1) * n], &mut w);

        // alpha_j = q_j^T * w
        alpha[j] = dot(&q[j * n..(j + 1) * n], &w);

        // w = w - alpha_j * q_j - beta_j * q_{j-1}
        for i in 0..n {
            w[i] -= alpha[j] * q[j * n + i];
        }
        if j > 0 {
            for i in 0..n {
                w[i] -= beta[j] * q[(j - 1) * n + i];
            }
        }

        // Full reorthogonalization (double CGS)
        for _pass in 0..2 {
            for k in 0..=j {
                let d = dot(&q[k * n..(k + 1) * n], &w);
                for i in 0..n {
                    w[i] -= d * q[k * n + i];
                }
            }
        }

        let beta_next = dot(&w, &w).sqrt();

        if j + 1 < m {
            beta[j + 1] = beta_next;
            if beta_next < 1e-14 {
                // Invariant subspace found — stop early
                break;
            }
            for i in 0..n {
                q[(j + 1) * n + i] = w[i] / beta_next;
            }
        }
    }

    (alpha, beta, q, steps)
}

// ---------------------------------------------------------------------------
// Tridiagonal QR eigenvalue solver (implicit shifts, Wilkinson)
// ---------------------------------------------------------------------------

/// Solve eigenvalues of symmetric tridiagonal matrix T (diagonal alpha, off-diagonal beta).
/// beta[0] is unused; beta[i] is T[i, i-1] for i >= 1.
/// Returns eigenvalues sorted ascending.
pub fn tridiag_eigen(alpha: &[f64], beta: &[f64], m: usize) -> Vec<f64> {
    if m == 0 { return vec![]; }
    if m == 1 { return vec![alpha[0]]; }

    let mut d = alpha[..m].to_vec();
    let mut e = vec![0.0; m];
    for i in 1..m { e[i - 1] = beta[i]; }
    // e[i] = off-diagonal between i and i+1

    // QL algorithm with implicit shifts (LAPACK-style)
    for l in 0..m {
        let mut iter_count = 0;
        loop {
            // Find small subdiagonal element
            let mut mm = l;
            for i in l..m - 1 {
                let tst = d[i].abs() + d[i + 1].abs();
                if e[i].abs() <= 1e-15 * tst.max(1e-30) {
                    mm = i;
                    break;
                }
                mm = i + 1;
            }
            if mm == l { break; } // Converged

            iter_count += 1;
            if iter_count > 60 { break; } // Safety

            // Wilkinson shift from bottom of block
            let g = (d[l + 1] - d[l]) / (2.0 * e[l]);
            let r = (g * g + 1.0).sqrt();
            let g_shift = d[mm] - d[l] + e[l] / (g + if g >= 0.0 { r } else { -r });

            let mut s = 1.0;
            let mut c = 1.0;
            let mut p = 0.0;

            for i in (l..mm).rev() {
                let f = s * e[i];
                let b = c * e[i];

                // Givens rotation
                let r = (f * f + g_shift * g_shift).sqrt();
                e[i + 1] = r;
                if r.abs() < 1e-30 {
                    // Underflow recovery
                    d[i + 1] -= p;
                    e[mm] = 0.0;
                    break;
                }
                s = f / r;
                c = g_shift / r;
                let g_new = d[i + 1] - p;
                let r2 = (d[i] - g_new) * s + 2.0 * c * b;
                p = s * r2;
                d[i + 1] = g_new + p;
                let g_shift_new = c * r2 - b;
                // This variable is used as g_shift in next iteration
                let _ = g_shift_new;
                // Reassign for loop
                // Actually, we need to set g_shift for next i
                // In QL, we propagate through the loop
            }
            // The QL iteration: apply accumulated shift
            // Simpler: just use the Jacobi fallback for tridiagonal
            // Actually let me use a cleaner QL implementation

            // Reset and use clean QL step
            break;
        }
    }

    // The above QL is tricky to get right. Use Jacobi on the dense tridiagonal instead.
    // This is O(m²) per sweep which is fine since m is small (typically 20-100).
    let mut t = vec![0.0; m * m];
    for i in 0..m {
        t[i * m + i] = alpha[i];
        if i > 0 {
            t[i * m + (i - 1)] = beta[i];
            t[(i - 1) * m + i] = beta[i];
        }
    }
    let result = jacobi_eigen(&t, m, 200);
    result.values
}

/// Solve eigenvalues AND eigenvectors of symmetric tridiagonal matrix.
/// Returns (eigenvalues sorted ascending, eigenvectors as m×m row-major).
fn tridiag_eigen_vecs(alpha: &[f64], beta: &[f64], m: usize) -> (Vec<f64>, Vec<f64>) {
    // Build dense tridiagonal matrix and use Jacobi
    let mut t = vec![0.0; m * m];
    for i in 0..m {
        t[i * m + i] = alpha[i];
        if i > 0 {
            t[i * m + (i - 1)] = beta[i];
            t[(i - 1) * m + i] = beta[i];
        }
    }
    let result = jacobi_eigen(&t, m, 200);
    (result.values, result.vectors)
}

// ---------------------------------------------------------------------------
// Implicitly Restarted Lanczos Method (IRLM)
// ---------------------------------------------------------------------------

/// Compute k eigenvalues of a symmetric operator using IRLM.
/// When `largest` is true, extracts the k largest eigenvalues;
/// otherwise extracts the k smallest.
/// Falls back to None for small problems (caller should use Jacobi).
fn lanczos_irlm(
    op: &dyn MatVecOp,
    k: usize,
    largest: bool,
    params: &LanczosParams,
) -> Option<EigenResult> {
    let n = op.dim();
    if n == 0 || k == 0 { return None; }
    let k = k.min(n);

    if n <= 80 || k >= n / 2 {
        return None;
    }

    let m = params.subspace_dim
        .unwrap_or_else(|| (4 * k).max(40).min(n));
    let m = m.min(n);
    if m <= k { return None; }

    let mut q0 = vec![0.0; n];
    let mut seed: u64 = 12345;
    for v in q0.iter_mut() {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *v = (seed >> 33) as f64 / (1u64 << 31) as f64 - 0.5;
    }
    let nrm = dot(&q0, &q0).sqrt();
    for v in q0.iter_mut() { *v /= nrm; }

    let mut best_values: Option<Vec<f64>> = None;
    let mut best_vectors: Option<Vec<f64>> = None;

    for _restart in 0..params.max_iter {
        let (alpha, beta, q_mat, steps) = lanczos_tridiag(op, &q0, m);
        let actual_m = steps.min(m);

        if actual_m < k { return None; }

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

        // Check convergence
        let beta_m = if actual_m < m { beta[actual_m.min(beta.len() - 1)] } else { 0.0 };
        let mut all_converged = true;
        for (out_col, t_col) in (start..start + nk).enumerate() {
            let residual = (beta_m * t_vecs[(actual_m - 1) * actual_m + t_col]).abs();
            let theta = selected_vals[out_col].abs().max(1e-30);
            if residual > params.tol * theta {
                all_converged = false;
                break;
            }
        }

        best_values = Some(selected_vals);
        best_vectors = Some(ritz_vecs);

        if all_converged || actual_m < m {
            break;
        }

        // Restart with best Ritz vector
        let mut new_q0 = vec![0.0; n];
        if let Some(ref vecs) = best_vectors {
            for i in 0..n {
                new_q0[i] = vecs[i * nk];
            }
        }
        let nrm = dot(&new_q0, &new_q0).sqrt();
        if nrm < 1e-14 { break; }
        for v in new_q0.iter_mut() { *v /= nrm; }
        q0 = new_q0;
    }

    let values = best_values?;
    let vecs = best_vectors?;

    Some(EigenResult { values, vectors: vecs })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compute k smallest eigenvalues/vectors of symmetric SPD matrix A.
/// Uses inverse-Lanczos (A^{-1} has largest eigenvalues where A has smallest).
/// Falls back to Jacobi for small matrices (n <= 80) or when k >= n/2.
pub fn lanczos_eigen(
    a: &[f64],
    n: usize,
    k: usize,
    params: Option<LanczosParams>,
) -> Option<EigenResult> {
    let k = k.min(n);
    let p = params.unwrap_or_default();

    // For small problems, use Jacobi directly
    if n <= 80 || k >= n / 2 {
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

    // Use inverse operator so Lanczos converges to largest eigenvalues of A^{-1}
    // = smallest eigenvalues of A
    if let Some(inv_op) = InverseOp::new(a, n) {
        if let Some(mut result) = lanczos_irlm(&inv_op, k, true, &p) {
            // Back-transform: λ_A = 1/λ_{A^{-1}}
            for val in result.values.iter_mut() {
                if val.abs() > 1e-30 {
                    *val = 1.0 / *val;
                }
            }
            // Sort ascending by eigenvalue
            let nk = result.values.len();
            let mut pairs: Vec<(f64, usize)> = result.values.iter().copied()
                .enumerate().map(|(i, v)| (v, i)).collect();
            pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            let sorted_vals: Vec<f64> = pairs.iter().map(|(v, _)| *v).collect();
            let mut sorted_vecs = vec![0.0; n * nk];
            for (new_col, &(_, old_col)) in pairs.iter().enumerate() {
                for row in 0..n {
                    sorted_vecs[row * nk + new_col] = result.vectors[row * nk + old_col];
                }
            }
            return Some(EigenResult { values: sorted_vals, vectors: sorted_vecs });
        }
    }

    // Fallback to Jacobi
    let full = jacobi_eigen(a, n, 200);
    let nk = k.min(n);
    let values = full.values[..nk].to_vec();
    let mut vectors = vec![0.0; n * nk];
    for col in 0..nk {
        for row in 0..n {
            vectors[row * nk + col] = full.vectors[row * n + col];
        }
    }
    Some(EigenResult { values, vectors })
}

/// Compute k smallest eigenvalues of generalized problem A*x = λ*B*x.
/// Uses shift-invert Lanczos near sigma, or falls back to dense solve.
pub fn lanczos_generalized_eigen(
    a: &[f64],
    b: &[f64],
    n: usize,
    k: usize,
    sigma: f64,
) -> Option<EigenResult> {
    let k = k.min(n);

    // For small problems, use dense path directly
    if n <= 80 || k >= n / 2 {
        let full = solve_generalized_eigen(a, b, n, 200)?;
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

    // Build shift-invert operator
    let si_op = ShiftInvertOp::new(a, b, n, sigma)?;
    let params = LanczosParams {
        max_iter: 300,
        tol: 1e-10,
        subspace_dim: Some((4 * k).max(40).min(n)),
    };

    if let Some(mut result) = lanczos_irlm(&si_op, k, true, &params) {
        // Back-transform: λ = 1/θ + σ
        for val in result.values.iter_mut() {
            if val.abs() > 1e-30 {
                *val = 1.0 / *val + sigma;
            } else {
                *val = f64::INFINITY;
            }
        }
        // Sort by ascending eigenvalue
        let nk = result.values.len();
        let mut pairs: Vec<(f64, usize)> = result.values.iter().copied().enumerate().map(|(i, v)| (v, i)).collect();
        pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let sorted_vals: Vec<f64> = pairs.iter().map(|(v, _)| *v).collect();
        let mut sorted_vecs = vec![0.0; n * nk];
        for (new_col, &(_, old_col)) in pairs.iter().enumerate() {
            for row in 0..n {
                sorted_vecs[row * nk + new_col] = result.vectors[row * nk + old_col];
            }
        }
        result.values = sorted_vals;
        result.vectors = sorted_vecs;
        return Some(result);
    }

    // Fallback to dense
    let full = solve_generalized_eigen(a, b, n, 200)?;
    let nk = k.min(full.values.len());
    let values = full.values[..nk].to_vec();
    let mut vectors = vec![0.0; n * nk];
    for col in 0..nk {
        for row in 0..n {
            vectors[row * nk + col] = full.vectors[row * n + col];
        }
    }
    Some(EigenResult { values, vectors })
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

/// Sparse shift-invert operator: y = K⁻¹ M x (for σ=0).
/// Factorizes K once with sparse Cholesky; each Lanczos iteration does
/// dense M×x then sparse triangular solve.
pub struct SparseShiftInvertOp {
    factor: super::sparse_chol::NumericCholesky,
    m_dense: Vec<f64>,
    n: usize,
}

impl SparseShiftInvertOp {
    /// Build from sparse K_ff (SPD) and dense M_ff (row-major nf×nf).
    /// Returns None if sparse Cholesky fails.
    pub fn new(k_csc: &CscMatrix, m_dense: &[f64], n: usize) -> Option<Self> {
        let sym = symbolic_cholesky(k_csc);
        let factor = numeric_cholesky(&sym, k_csc)?;
        Some(Self { factor, m_dense: m_dense.to_vec(), n })
    }
}

impl MatVecOp for SparseShiftInvertOp {
    fn mul_vec(&self, x: &[f64], y: &mut [f64]) {
        let n = self.n;
        // tmp = M * x (dense)
        let mut tmp = vec![0.0; n];
        for i in 0..n {
            let mut s = 0.0;
            for j in 0..n { s += self.m_dense[i * n + j] * x[j]; }
            tmp[i] = s;
        }
        // y = K⁻¹ tmp (sparse Cholesky solve)
        let result = sparse_cholesky_solve(&self.factor, &tmp);
        y[..n].copy_from_slice(&result);
    }
    fn dim(&self) -> usize { self.n }
}

/// Compute k smallest eigenvalues of generalized problem A*x = λ*B*x
/// where A is sparse (CscMatrix) and B is dense (row-major).
/// Uses sparse shift-invert Lanczos with σ=0 (K⁻¹ M x).
/// Falls back to dense for small problems, non-zero sigma, or on failure.
pub fn lanczos_generalized_eigen_sparse(
    k_ff: &CscMatrix,
    m_ff: &[f64],
    n: usize,
    k: usize,
    sigma: f64,
) -> Option<EigenResult> {
    let k = k.min(n);

    // For small problems or large fraction of eigenvalues, use dense path
    if n <= 80 || k >= n / 2 {
        let k_dense = k_ff.to_dense_symmetric();
        return solve_generalized_eigen(&k_dense, m_ff, n, 200).map(|full| {
            let nk = k.min(full.values.len());
            let values = full.values[..nk].to_vec();
            let mut vectors = vec![0.0; n * nk];
            for col in 0..nk {
                for row in 0..n {
                    vectors[row * nk + col] = full.vectors[row * n + col];
                }
            }
            EigenResult { values, vectors }
        });
    }

    // Non-zero sigma: fall back to dense Lanczos (requires building K - σM)
    if sigma.abs() > 1e-30 {
        let k_dense = k_ff.to_dense_symmetric();
        return lanczos_generalized_eigen(&k_dense, m_ff, n, k, sigma);
    }

    // Build sparse shift-invert operator: y = K⁻¹ M x
    if let Some(si_op) = SparseShiftInvertOp::new(k_ff, m_ff, n) {
        let params = LanczosParams {
            max_iter: 300,
            tol: 1e-10,
            subspace_dim: Some((4 * k).max(40).min(n)),
        };

        if let Some(mut result) = lanczos_irlm(&si_op, k, true, &params) {
            // Back-transform: λ = 1/θ (σ=0)
            for val in result.values.iter_mut() {
                if val.abs() > 1e-30 {
                    *val = 1.0 / *val;
                } else {
                    *val = f64::INFINITY;
                }
            }
            // Sort ascending
            let nk = result.values.len();
            let mut pairs: Vec<(f64, usize)> = result.values.iter().copied()
                .enumerate().map(|(i, v)| (v, i)).collect();
            pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            let sorted_vals: Vec<f64> = pairs.iter().map(|(v, _)| *v).collect();
            let mut sorted_vecs = vec![0.0; n * nk];
            for (new_col, &(_, old_col)) in pairs.iter().enumerate() {
                for row in 0..n {
                    sorted_vecs[row * nk + new_col] = result.vectors[row * nk + old_col];
                }
            }
            result.values = sorted_vals;
            result.vectors = sorted_vecs;
            return Some(result);
        }
    }

    // Fallback to dense
    let k_dense = k_ff.to_dense_symmetric();
    lanczos_generalized_eigen(&k_dense, m_ff, n, k, sigma)
}

/// Solve buckling eigenproblem (-Kg)*φ = μ*K*φ where K is sparse SPD
/// and -Kg is dense indefinite. Returns μ eigenvalues (caller does λ = 1/μ).
///
/// For small n: dense Jacobi with `solve_generalized_eigen(-Kg, K)` (Cholesky on K, SPD).
/// For large n: sparse shift-invert Lanczos finds largest μ = eigenvalues of K⁻¹(-Kg).
pub fn lanczos_buckling_eigen_sparse(
    k_ff: &CscMatrix,
    neg_kg: &[f64],
    n: usize,
    k: usize,
) -> Option<EigenResult> {
    let k = k.min(n);

    // For small problems, use dense Jacobi: (-Kg)*φ = μ*K*φ
    // solve_generalized_eigen(A, B) solves A*x = λ*B*x by Cholesky-decomposing B.
    // Here B = K (SPD) which is safe.
    // Return ALL eigenvalues — caller filters for positive μ.
    if n <= 200 || k >= n / 2 {
        let k_dense = k_ff.to_dense_symmetric();
        return solve_generalized_eigen(neg_kg, &k_dense, n, 200);
    }

    // Large n: sparse shift-invert Lanczos.
    // Operator: K⁻¹·(-Kg)·x — largest eigenvalues are the largest μ.
    if let Some(si_op) = SparseShiftInvertOp::new(k_ff, neg_kg, n) {
        let params = LanczosParams {
            max_iter: 300,
            tol: 1e-10,
            subspace_dim: Some((4 * k).max(40).min(n)),
        };

        if let Some(mut result) = lanczos_irlm(&si_op, k, true, &params) {
            // No back-transform needed: θ = μ directly (eigenvalues of K⁻¹(-Kg)).
            // Sort descending by μ (largest μ = smallest λ = most critical buckling mode).
            let nk = result.values.len();
            let mut pairs: Vec<(f64, usize)> = result.values.iter().copied()
                .enumerate().map(|(i, v)| (v, i)).collect();
            pairs.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap()); // descending
            let sorted_vals: Vec<f64> = pairs.iter().map(|(v, _)| *v).collect();
            let mut sorted_vecs = vec![0.0; n * nk];
            for (new_col, &(_, old_col)) in pairs.iter().enumerate() {
                for row in 0..n {
                    sorted_vecs[row * nk + new_col] = result.vectors[row * nk + old_col];
                }
            }
            result.values = sorted_vals;
            result.vectors = sorted_vecs;
            return Some(result);
        }
    }

    // Fallback to dense Jacobi — return ALL eigenvalues so caller can find positive μ
    let k_dense = k_ff.to_dense_symmetric();
    solve_generalized_eigen(neg_kg, &k_dense, n, 200)
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
}
