/// Preconditioners for the preconditioned conjugate gradient solver (`pcg.rs`).
///
/// All operate on the lower-triangle CSC representation of a symmetric SPD
/// matrix (`CscMatrix`).
///
/// - `IdentityPreconditioner`: no preconditioning (M = I) — baseline for
///   benchmarks and diagnostics.
/// - `JacobiPreconditioner`: diagonal scaling (M = diag(A)) — cheapest option;
///   useful when the matrix is nearly diagonally dominant.
/// - `SsorPreconditioner`: symmetric SOR sweep — cheap per iteration, stronger
///   than Jacobi on mesh-like matrices; ω = 1 gives symmetric Gauss-Seidel.
/// - `Ic0Preconditioner`: incomplete Cholesky with zero fill-in on the pattern
///   of A — strongest of the set and exact for tridiagonal matrices; costs one
///   sparse factorization up front. Preferred default for structural stiffness
///   matrices when it succeeds (returns `None` on non-SPD pivots).
/// - `ShiftedIcPreconditioner`: IC(0) with Ajiz-Jennings pivot restoration —
///   when a pivot degrades (≤ threshold), it is replaced by the original
///   diagonal of that DOF (plus an optional global shift α·max_diag) instead
///   of failing. Infallible by construction; reports how many pivots were
///   restored. With `shift_rel = 0` and no degraded pivots it is bitwise
///   identical to `Ic0Preconditioner`.
/// - `MicPreconditioner`: modified IC(0) — dropped fill outside the pattern is
///   compensated into the diagonal (Gustafsson-style row compensation).
///   Stronger than IC(0) on mesh-like SPD matrices; can fail (`Option`) on
///   non-SPD pivots like the strict variant.
use super::sparse::CscMatrix;

/// Preconditioner operator: approximates the inverse of the system matrix.
pub trait Preconditioner {
    /// Compute z ≈ M⁻¹ r where M is the preconditioning matrix.
    fn apply(&self, r: &[f64], z: &mut [f64]);
    /// Short identifier used in diagnostics and solver metadata.
    fn name(&self) -> &'static str;
}

/// M = I: passes the residual through unchanged.
pub struct IdentityPreconditioner;

impl Preconditioner for IdentityPreconditioner {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        z.copy_from_slice(r);
    }
    fn name(&self) -> &'static str {
        "identity"
    }
}

/// M = diag(A): z_i = r_i / a_ii.
pub struct JacobiPreconditioner {
    inv_diag: Vec<f64>,
}

impl JacobiPreconditioner {
    /// Extract the diagonal of `a`. Returns `None` if any diagonal entry is
    /// missing, non-finite, zero, or below 1e-30 · max|a_jj| (singular or
    /// nearly singular diagonal).
    pub fn new(a: &CscMatrix) -> Option<Self> {
        let n = a.n;
        let mut diag = vec![0.0; n];
        let mut found = vec![false; n];
        for j in 0..n {
            for k in a.col_ptr[j]..a.col_ptr[j + 1] {
                if a.row_idx[k] == j {
                    diag[j] = a.values[k];
                    found[j] = true;
                    break;
                }
            }
        }
        let max_abs = diag.iter().fold(0.0f64, |m, &d| m.max(d.abs()));
        let threshold = 1e-30 * max_abs;
        for j in 0..n {
            if !found[j] || !diag[j].is_finite() || diag[j] == 0.0 || diag[j].abs() < threshold {
                return None;
            }
        }
        let inv_diag: Vec<f64> = diag.iter().map(|&d| 1.0 / d).collect();
        Some(Self { inv_diag })
    }
}

impl Preconditioner for JacobiPreconditioner {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        for ((z_i, &r_i), &d) in z.iter_mut().zip(r.iter()).zip(self.inv_diag.iter()) {
            *z_i = r_i * d;
        }
    }
    fn name(&self) -> &'static str {
        "jacobi"
    }
}

/// M = (D + ωL) D⁻¹ (D + ωL)ᵀ, applied without the usual 1/(ω(2−ω)) scaling
/// constant (a positive scalar multiple of M does not change the
/// preconditioned iteration).
pub struct SsorPreconditioner<'a> {
    a: &'a CscMatrix,
    diag: Vec<f64>,
    omega: f64,
}

impl<'a> SsorPreconditioner<'a> {
    /// Build from the lower triangle of `a`. `omega` must lie in (0, 2);
    /// out-of-range or non-finite values fall back to 1.0 (symmetric
    /// Gauss-Seidel preconditioner). Returns `None` if any diagonal entry is
    /// missing or not positive (SSOR requires a positive diagonal).
    pub fn new(a: &'a CscMatrix, omega: f64) -> Option<Self> {
        let omega = if omega.is_finite() && omega > 0.0 && omega < 2.0 {
            omega
        } else {
            1.0
        };
        let n = a.n;
        let mut diag = vec![f64::NAN; n];
        for (j, d) in diag.iter_mut().enumerate() {
            for k in a.col_ptr[j]..a.col_ptr[j + 1] {
                if a.row_idx[k] == j {
                    *d = a.values[k];
                    break;
                }
            }
        }
        if diag.iter().any(|&d| !d.is_finite() || d <= 0.0) {
            return None;
        }
        Some(Self { a, diag, omega })
    }
}

impl Preconditioner for SsorPreconditioner<'_> {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        let n = self.a.n;
        z.copy_from_slice(r);

        // Forward sweep: (D + ωL) y = r, column scatter over the lower triangle.
        for j in 0..n {
            z[j] /= self.diag[j];
            for k in self.a.col_ptr[j]..self.a.col_ptr[j + 1] {
                let i = self.a.row_idx[k];
                if i > j {
                    z[i] -= self.omega * self.a.values[k] * z[j];
                }
            }
        }

        // Diagonal scaling: w = D y.
        for (z_j, &d) in z.iter_mut().zip(self.diag.iter()) {
            *z_j *= d;
        }

        // Backward sweep: (D + ωL)ᵀ z = w, gather; z[i] for i > j is final.
        for j in (0..n).rev() {
            let mut s = z[j];
            for k in self.a.col_ptr[j]..self.a.col_ptr[j + 1] {
                let i = self.a.row_idx[k];
                if i > j {
                    s -= self.omega * self.a.values[k] * z[i];
                }
            }
            z[j] = s / self.diag[j];
        }
    }
    fn name(&self) -> &'static str {
        "ssor"
    }
}

/// Incomplete Cholesky factorization with zero fill-in: A ≈ LLᵀ where L has
/// the sparsity pattern of the lower triangle of A (diagonal included).
/// Column-oriented, no permutation. `new` returns `None` if any pivot is
/// non-positive or non-finite (matrix not positive definite on its pattern).
pub struct Ic0Preconditioner {
    n: usize,
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    l_values: Vec<f64>,
}

/// Shared IC(0) factor layout: lower-triangle pattern of A with the diagonal
/// guaranteed first in each column.
struct IcPattern {
    n: usize,
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    /// Values initialized from A, diagonal pre-shifted by `shift_rel·max_diag`.
    l_values: Vec<f64>,
    /// nz_cols_for_row[i] = [(k, position of entry (i,k))] for k < i.
    nz_cols_for_row: Vec<Vec<(usize, usize)>>,
    /// Effective diagonal used to seed each column (A diagonal + shift).
    orig_diag: Vec<f64>,
    max_diag: f64,
}

/// Build the IC(0) pattern and initial values from the lower triangle of `a`,
/// adding `shift_rel · max_diag(A)` to every diagonal entry.
fn build_ic_pattern(a: &CscMatrix, shift_rel: f64) -> IcPattern {
    let n = a.n;

    // Extract the original diagonal and its max for shift/restore scales.
    // A non-positive or non-finite max (degenerate input) falls back to 1.0
    // purely as a scale reference so the restore path stays finite.
    let mut a_diag = vec![0.0; n];
    let mut max_diag = 0.0f64;
    for (j, d) in a_diag.iter_mut().enumerate() {
        for k in a.col_ptr[j]..a.col_ptr[j + 1] {
            if a.row_idx[k] == j {
                *d = a.values[k];
                max_diag = max_diag.max(a.values[k]);
                break;
            }
        }
    }
    if !max_diag.is_finite() || max_diag <= 0.0 {
        max_diag = 1.0;
    }
    let shift = if shift_rel.is_finite() && shift_rel > 0.0 {
        shift_rel * max_diag
    } else {
        0.0
    };
    let orig_diag: Vec<f64> = a_diag.iter().map(|&d| d + shift).collect();

    // Pattern: lower triangle of A with the diagonal guaranteed present
    // (first entry of each column). l_values starts as a copy of A.
    let mut col_ptr = vec![0usize; n + 1];
    let mut row_idx = Vec::with_capacity(a.nnz() + n);
    let mut l_values = Vec::with_capacity(a.nnz() + n);
    for j in 0..n {
        col_ptr[j] = row_idx.len();
        row_idx.push(j);
        l_values.push(orig_diag[j]);
        for k in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[k];
            if i != j {
                row_idx.push(i);
                l_values.push(a.values[k]);
            }
        }
        col_ptr[j + 1] = row_idx.len();
    }

    let mut nz_cols_for_row: Vec<Vec<(usize, usize)>> = vec![Vec::new(); n];
    for k in 0..n {
        for p in (col_ptr[k] + 1)..col_ptr[k + 1] {
            nz_cols_for_row[row_idx[p]].push((k, p));
        }
    }

    IcPattern { n, col_ptr, row_idx, l_values, nz_cols_for_row, orig_diag, max_diag }
}

/// Triangular solves with the IC factor: z = (LLᵀ)⁻¹ r.
/// Forward scatter over columns, backward gather in reverse.
fn ic_factor_apply(n: usize, col_ptr: &[usize], row_idx: &[usize], l_values: &[f64], r: &[f64], z: &mut [f64]) {
    z.copy_from_slice(r);

    // Forward solve: L y = r, column scatter.
    for j in 0..n {
        let cs = col_ptr[j];
        let ce = col_ptr[j + 1];
        z[j] /= l_values[cs];
        for p in (cs + 1)..ce {
            z[row_idx[p]] -= l_values[p] * z[j];
        }
    }

    // Backward solve: Lᵀ z = y, gather; z[i] for i > j is final.
    for j in (0..n).rev() {
        let cs = col_ptr[j];
        let ce = col_ptr[j + 1];
        let mut s = z[j];
        for p in (cs + 1)..ce {
            s -= l_values[p] * z[row_idx[p]];
        }
        z[j] = s / l_values[cs];
    }
}

impl Ic0Preconditioner {
    /// Factorize `a` over its own lower-triangle pattern. The diagonal is
    /// added to the pattern if absent. Returns `None` on non-SPD pivots.
    pub fn new(a: &CscMatrix) -> Option<Self> {
        let pat = build_ic_pattern(a, 0.0);
        let n = pat.n;
        let IcPattern { col_ptr, row_idx, mut l_values, nz_cols_for_row, .. } = pat;

        // Left-looking numeric factorization restricted to the pattern.
        // pos_of[row] = slot of `row` inside the current column, or MAX.
        let mut pos_of = vec![usize::MAX; n];
        for j in 0..n {
            let (cs, ce) = (col_ptr[j], col_ptr[j + 1]);
            for p in cs..ce {
                pos_of[row_idx[p]] = p;
            }
            for &(k, pos_jk) in &nz_cols_for_row[j] {
                let ljk = l_values[pos_jk];
                if ljk == 0.0 {
                    continue;
                }
                for p in col_ptr[k]..col_ptr[k + 1] {
                    let slot = pos_of[row_idx[p]];
                    if slot != usize::MAX {
                        l_values[slot] -= ljk * l_values[p];
                    }
                }
            }
            let diag = l_values[cs];
            for p in cs..ce {
                pos_of[row_idx[p]] = usize::MAX;
            }
            if !diag.is_finite() || diag <= 0.0 {
                return None;
            }
            let ljj = diag.sqrt();
            l_values[cs] = ljj;
            for v in &mut l_values[(cs + 1)..ce] {
                *v /= ljj;
            }
        }

        Some(Self { n, col_ptr, row_idx, l_values })
    }
}

impl Preconditioner for Ic0Preconditioner {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        ic_factor_apply(self.n, &self.col_ptr, &self.row_idx, &self.l_values, r, z);
    }
    fn name(&self) -> &'static str {
        "ic0"
    }
}

/// Shifted incomplete Cholesky (IC(0) with Ajiz-Jennings pivot restoration).
///
/// Same zero-fill pattern as [`Ic0Preconditioner`], but a pivot that degrades
/// to ≤ 1e-8·max_diag during factorization is replaced by the original
/// (shifted) diagonal of that DOF (Ajiz-Jennings pivot restoration) instead
/// of aborting. This targets thin-shell MITC4 matrices whose artificial
/// drilling pivots sit ~4 orders below the membrane scale and break strict
/// IC(0). An optional global shift `shift_rel · max_diag` is added to the
/// diagonal up front.
///
/// Infallible by construction; `perturbations()` reports how many pivots were
/// restored. When no pivot degrades and `shift_rel = 0`, the factor is bitwise
/// identical to `Ic0Preconditioner`. The caller must still verify the solve
/// against the true residual — a restored pivot makes M ≠ A by a wider margin.
pub struct ShiftedIcPreconditioner {
    n: usize,
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    l_values: Vec<f64>,
    perturbations: usize,
}

impl ShiftedIcPreconditioner {
    /// Factorize `a` over its own lower-triangle pattern, restoring degraded
    /// pivots. `shift_rel` is a global diagonal shift relative to max_diag(A);
    /// non-finite or negative values are treated as 0.
    pub fn new(a: &CscMatrix, shift_rel: f64) -> Self {
        let pat = build_ic_pattern(a, shift_rel);
        let n = pat.n;
        let max_diag = pat.max_diag;
        let IcPattern { col_ptr, row_idx, mut l_values, nz_cols_for_row, orig_diag, .. } = pat;

        // Pivot restoration threshold relative to the matrix scale.
        let soft_threshold = 1e-8 * max_diag;

        let mut perturbations = 0usize;
        let mut pos_of = vec![usize::MAX; n];
        for j in 0..n {
            let (cs, ce) = (col_ptr[j], col_ptr[j + 1]);
            for p in cs..ce {
                pos_of[row_idx[p]] = p;
            }
            for &(k, pos_jk) in &nz_cols_for_row[j] {
                let ljk = l_values[pos_jk];
                if ljk == 0.0 {
                    continue;
                }
                for p in col_ptr[k]..col_ptr[k + 1] {
                    let slot = pos_of[row_idx[p]];
                    if slot != usize::MAX {
                        l_values[slot] -= ljk * l_values[p];
                    }
                }
            }
            let diag = l_values[cs];
            for p in cs..ce {
                pos_of[row_idx[p]] = usize::MAX;
            }
            let diag = if !diag.is_finite() || diag <= soft_threshold {
                // Restore the original (shifted) diagonal of this DOF: keeps
                // the natural scale (drilling DOFs get alpha_drill scale, not
                // max_diag scale) and avoids cascading pivot inflation.
                let target = if orig_diag[j] > soft_threshold {
                    orig_diag[j]
                } else {
                    1e-6 * max_diag
                };
                perturbations += 1;
                target.max(1e-12 * max_diag)
            } else {
                diag
            };
            let ljj = diag.sqrt();
            l_values[cs] = ljj;
            for v in &mut l_values[(cs + 1)..ce] {
                *v /= ljj;
            }
        }

        Self { n, col_ptr, row_idx, l_values, perturbations }
    }

    /// Number of pivots restored to the original diagonal during factorization.
    pub fn perturbations(&self) -> usize {
        self.perturbations
    }
}

impl Preconditioner for ShiftedIcPreconditioner {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        ic_factor_apply(self.n, &self.col_ptr, &self.row_idx, &self.l_values, r, z);
    }
    fn name(&self) -> &'static str {
        "ics"
    }
}

/// Modified incomplete Cholesky: MIC(0) with diagonal compensation
/// (Gustafsson). Fill dropped during the zero-fill update — entries of the
/// updating column whose row lies beyond the current column's pattern — is
/// summed and subtracted from the pivot, which clusters the preconditioned
/// spectrum on mesh-like matrices. Same pattern and apply as IC(0).
/// `new` returns `None` on non-SPD pivots, like the strict variant.
pub struct MicPreconditioner {
    n: usize,
    col_ptr: Vec<usize>,
    row_idx: Vec<usize>,
    l_values: Vec<f64>,
}

impl MicPreconditioner {
    /// Factorize `a` over its own lower-triangle pattern with diagonal
    /// compensation of dropped fill. Returns `None` on non-SPD pivots.
    pub fn new(a: &CscMatrix) -> Option<Self> {
        let pat = build_ic_pattern(a, 0.0);
        let n = pat.n;
        let IcPattern { col_ptr, row_idx, mut l_values, nz_cols_for_row, .. } = pat;

        let mut pos_of = vec![usize::MAX; n];
        for j in 0..n {
            let (cs, ce) = (col_ptr[j], col_ptr[j + 1]);
            for p in cs..ce {
                pos_of[row_idx[p]] = p;
            }
            let mut dropped = 0.0;
            for &(k, pos_jk) in &nz_cols_for_row[j] {
                let ljk = l_values[pos_jk];
                if ljk == 0.0 {
                    continue;
                }
                for p in col_ptr[k]..col_ptr[k + 1] {
                    let slot = pos_of[row_idx[p]];
                    if slot != usize::MAX {
                        l_values[slot] -= ljk * l_values[p];
                    } else if row_idx[p] > j {
                        // True dropped fill (rows < j are already finalized and
                        // are not part of this update): compensate the diagonal.
                        dropped += ljk * l_values[p];
                    }
                }
            }
            l_values[cs] -= dropped;
            let diag = l_values[cs];
            for p in cs..ce {
                pos_of[row_idx[p]] = usize::MAX;
            }
            if !diag.is_finite() || diag <= 0.0 {
                return None;
            }
            let ljj = diag.sqrt();
            l_values[cs] = ljj;
            for v in &mut l_values[(cs + 1)..ce] {
                *v /= ljj;
            }
        }

        Some(Self { n, col_ptr, row_idx, l_values })
    }
}

impl Preconditioner for MicPreconditioner {
    fn apply(&self, r: &[f64], z: &mut [f64]) {
        ic_factor_apply(self.n, &self.col_ptr, &self.row_idx, &self.l_values, r, z);
    }
    fn name(&self) -> &'static str {
        "mic"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    /// Deterministic dense SPD: A = BᵀB + nI with pseudo-random B.
    fn random_spd_dense(n: usize) -> Vec<f64> {
        let mut b = vec![0.0; n * n];
        let mut seed: u64 = 7;
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

    /// Dense M = (D + ωL) D⁻¹ (D + ωL)ᵀ built from dense A (row-major).
    fn ssor_matrix_dense(a: &[f64], n: usize, omega: f64) -> Vec<f64> {
        let mut f = vec![0.0; n * n];
        let mut d = vec![0.0; n];
        for i in 0..n {
            d[i] = a[i * n + i];
            f[i * n + i] = a[i * n + i];
            for j in 0..i {
                f[i * n + j] = omega * a[i * n + j];
            }
        }
        let mut m = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                let mut s = 0.0;
                for k in 0..n {
                    s += f[i * n + k] * f[j * n + k] / d[k];
                }
                m[i * n + j] = s;
            }
        }
        m
    }

    /// Dense lower-triangular L from an IC-family factor (row-major).
    fn ic_dense_l(n: usize, col_ptr: &[usize], row_idx: &[usize], l_values: &[f64]) -> Vec<f64> {
        let mut l = vec![0.0; n * n];
        for j in 0..n {
            for p in col_ptr[j]..col_ptr[j + 1] {
                l[row_idx[p] * n + j] = l_values[p];
            }
        }
        l
    }

    /// Check that apply() solves M z ≈ r with M = LLᵀ from the factor.
    fn check_llt_reconstruction(n: usize, l: &[f64], pre: &dyn Preconditioner) {
        let r: Vec<f64> = (0..n).map(|i| (i as f64 + 1.0).cos()).collect();
        let mut z = vec![0.0; n];
        pre.apply(&r, &mut z);
        for i in 0..n {
            let mut s = 0.0;
            for j in 0..n {
                let mut m_ij = 0.0;
                for k in 0..n {
                    m_ij += l[i * n + k] * l[j * n + k];
                }
                s += m_ij * z[j];
            }
            assert!((s - r[i]).abs() < 1e-9, "row {}: {} vs {}", i, s, r[i]);
        }
    }

    #[test]
    fn test_identity() {
        let pre = IdentityPreconditioner;
        let r = vec![1.0, -2.0, 3.0];
        let mut z = vec![0.0; 3];
        pre.apply(&r, &mut z);
        assert_eq!(r, z);
    }

    #[test]
    fn test_jacobi_apply() {
        let a = poisson_1d(4);
        let pre = JacobiPreconditioner::new(&a).unwrap();
        let r = vec![2.0, 4.0, 6.0, 8.0];
        let mut z = vec![0.0; 4];
        pre.apply(&r, &mut z);
        for i in 0..4 {
            assert!((z[i] - r[i] / 2.0).abs() < 1e-15, "z[{}]={}", i, z[i]);
        }
    }

    #[test]
    fn test_jacobi_zero_diagonal_returns_none() {
        let a = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[1.0, 1.0, 0.0]);
        assert!(JacobiPreconditioner::new(&a).is_none());
    }

    #[test]
    fn test_ssor_reconstruction() {
        let n = 8;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        for &omega in &[0.5, 1.0, 1.5] {
            let pre = SsorPreconditioner::new(&a, omega).unwrap();
            let m = ssor_matrix_dense(&dense, n, omega);
            let r: Vec<f64> = (0..n).map(|i| (i as f64 * 1.7 + 0.3).sin()).collect();
            let mut z = vec![0.0; n];
            pre.apply(&r, &mut z);
            // M z ≈ r
            for i in 0..n {
                let mut s = 0.0;
                for j in 0..n {
                    s += m[i * n + j] * z[j];
                }
                assert!((s - r[i]).abs() < 1e-9, "omega={} row {}: {} vs {}", omega, i, s, r[i]);
            }
        }
    }

    #[test]
    fn test_ssor_omega_fallback() {
        let a = poisson_1d(3);
        let p1 = SsorPreconditioner::new(&a, 2.5).unwrap();
        let p2 = SsorPreconditioner::new(&a, f64::NAN).unwrap();
        assert_eq!(p1.omega, 1.0);
        assert_eq!(p2.omega, 1.0);
    }

    #[test]
    fn test_ssor_nonpositive_diagonal_returns_none() {
        let a = CscMatrix::from_triplets(2, &[0, 1], &[0, 1], &[1.0, -1.0]);
        assert!(SsorPreconditioner::new(&a, 1.0).is_none());
    }

    #[test]
    fn test_ic0_reconstruction() {
        let n = 8;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        let pre = Ic0Preconditioner::new(&a).unwrap();
        let l = ic_dense_l(pre.n, &pre.col_ptr, &pre.row_idx, &pre.l_values);
        check_llt_reconstruction(n, &l, &pre);
    }

    #[test]
    fn test_ic0_exact_on_tridiagonal() {
        // Tridiagonal has no room for fill-in, so IC(0) = exact Cholesky and
        // M⁻¹A must be the identity.
        let n = 10;
        let a = poisson_1d(n);
        let pre = Ic0Preconditioner::new(&a).unwrap();
        for j in 0..n {
            let mut e = vec![0.0; n];
            e[j] = 1.0;
            let col = a.sym_mat_vec(&e);
            let mut z = vec![0.0; n];
            pre.apply(&col, &mut z);
            for i in 0..n {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((z[i] - expected).abs() < 1e-12, "col {} row {}: {}", j, i, z[i]);
            }
        }
    }

    #[test]
    fn test_ic0_not_spd_returns_none() {
        let a = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[1.0, 0.5, -1.0]);
        assert!(Ic0Preconditioner::new(&a).is_none());
    }

    #[test]
    fn test_shifted_ic_bitwise_matches_ic0_when_spd() {
        // No degraded pivots and zero shift: the factor must be bitwise
        // identical to strict IC(0) (Shifted-IC subsumes IC(0)).
        let n = 8;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        let ic0 = Ic0Preconditioner::new(&a).unwrap();
        let ics = ShiftedIcPreconditioner::new(&a, 0.0);
        assert_eq!(ics.perturbations(), 0);
        assert_eq!(ic0.col_ptr, ics.col_ptr);
        assert_eq!(ic0.row_idx, ics.row_idx);
        assert_eq!(ic0.l_values, ics.l_values);
    }

    #[test]
    fn test_shifted_ic_reconstruction() {
        let n = 8;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        let pre = ShiftedIcPreconditioner::new(&a, 1e-4);
        let l = ic_dense_l(pre.n, &pre.col_ptr, &pre.row_idx, &pre.l_values);
        check_llt_reconstruction(n, &l, &pre);
    }

    #[test]
    fn test_shifted_ic_restores_degraded_pivot() {
        // [[1, 0.5], [0.5, -1]] breaks strict IC(0) on the second pivot;
        // Shifted-IC restores it with the original diagonal of the DOF and
        // reports exactly one perturbation.
        let a = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[1.0, 0.5, -1.0]);
        assert!(Ic0Preconditioner::new(&a).is_none());
        let pre = ShiftedIcPreconditioner::new(&a, 0.0);
        assert_eq!(pre.perturbations(), 1);
        // The restored pivot is positive: apply() stays finite.
        let r = vec![1.0, 2.0];
        let mut z = vec![0.0; 2];
        pre.apply(&r, &mut z);
        assert!(z.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn test_shifted_ic_exact_on_tridiagonal() {
        // No room for fill-in and no degraded pivots: exact Cholesky, M⁻¹A = I.
        let n = 10;
        let a = poisson_1d(n);
        let pre = ShiftedIcPreconditioner::new(&a, 0.0);
        assert_eq!(pre.perturbations(), 0);
        for j in 0..n {
            let mut e = vec![0.0; n];
            e[j] = 1.0;
            let col = a.sym_mat_vec(&e);
            let mut z = vec![0.0; n];
            pre.apply(&col, &mut z);
            for (i, &zi) in z.iter().enumerate() {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((zi - expected).abs() < 1e-12, "col {} row {}: {}", j, i, zi);
            }
        }
    }

    #[test]
    fn test_mic_reconstruction() {
        let n = 8;
        let dense = random_spd_dense(n);
        let a = CscMatrix::from_dense_symmetric(&dense, n);
        let pre = MicPreconditioner::new(&a).unwrap();
        let l = ic_dense_l(pre.n, &pre.col_ptr, &pre.row_idx, &pre.l_values);
        check_llt_reconstruction(n, &l, &pre);
    }

    #[test]
    fn test_mic_exact_on_tridiagonal() {
        // Tridiagonal has no dropped fill, so MIC(0) = exact Cholesky.
        let n = 10;
        let a = poisson_1d(n);
        let pre = MicPreconditioner::new(&a).unwrap();
        for j in 0..n {
            let mut e = vec![0.0; n];
            e[j] = 1.0;
            let col = a.sym_mat_vec(&e);
            let mut z = vec![0.0; n];
            pre.apply(&col, &mut z);
            for (i, &zi) in z.iter().enumerate() {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((zi - expected).abs() < 1e-12, "col {} row {}: {}", j, i, zi);
            }
        }
    }

    #[test]
    fn test_mic_not_spd_returns_none() {
        let a = CscMatrix::from_triplets(2, &[0, 1, 1], &[0, 0, 1], &[1.0, 0.5, -1.0]);
        assert!(MicPreconditioner::new(&a).is_none());
    }
}
