/// Sparse Cholesky factorization (left-looking, supernodal-free).
///
/// Two-phase: symbolic (AMD + elimination tree + column counts) then numeric.
/// Symbolic phase can be reused when sparsity pattern is unchanged (P-Delta).
use super::sparse::CscMatrix;
use super::amd::{amd_order, inverse_perm};
use super::rcm::rcm_order;

/// Symbolic factorization result — reusable for same sparsity pattern.
#[derive(Debug, Clone)]
pub struct SymbolicCholesky {
    pub n: usize,
    pub perm: Vec<usize>,      // perm[new] = old
    pub iperm: Vec<usize>,     // iperm[old] = new
    pub l_col_ptr: Vec<usize>, // column pointers for L
    pub l_row_idx: Vec<usize>, // row indices for L (structure only)
    pub parent: Vec<isize>,    // elimination tree: parent[j] = parent of j, or -1 for root
    pub l_nnz: usize,
}

/// Numeric factorization result.
#[derive(Debug, Clone)]
pub struct NumericCholesky {
    pub symbolic: SymbolicCholesky,
    pub l_values: Vec<f64>,
    pub pivot_perturbations: usize,   // how many pivots were perturbed
    pub max_perturbation: f64,        // largest perturbation applied
}

/// Ordering strategy for symbolic Cholesky factorization.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CholOrdering {
    /// Approximate Minimum Degree — good for general sparse.
    Amd,
    /// Reverse Cuthill-McKee — good for structured 2D/3D meshes.
    Rcm,
}

/// Compute symbolic Cholesky factorization (AMD ordering + structure of L).
pub fn symbolic_cholesky(a: &CscMatrix) -> SymbolicCholesky {
    symbolic_cholesky_with(a, CholOrdering::Amd)
}

/// Compute symbolic Cholesky factorization with explicit ordering choice.
pub fn symbolic_cholesky_with(a: &CscMatrix, ordering: CholOrdering) -> SymbolicCholesky {
    let n = a.n;

    let perm = match ordering {
        CholOrdering::Amd => amd_order(n, &a.col_ptr, &a.row_idx),
        CholOrdering::Rcm => rcm_order(n, &a.col_ptr, &a.row_idx),
    };
    let iperm = inverse_perm(&perm);

    // Apply permutation
    let pa = a.permute_symmetric(&perm);

    // Direct left-looking symbolic factorization.
    // For each column j, the nonzero rows of L[:,j] are determined by:
    //   1. rows from A[:,j] with row > j (original entries)
    //   2. rows from L[:,k] for each k < j where L[j,k] != 0 (fill-in from updates)
    // This is O(nnz(L)²) worst case but guaranteed correct.

    let mut l_col_ptr = vec![0usize; n + 1];
    let mut l_row_idx_build: Vec<Vec<usize>> = vec![Vec::new(); n];

    // For efficient lookup: row_to_cols[i] = list of columns k < i where L[i,k] != 0
    let mut row_to_cols: Vec<Vec<usize>> = vec![Vec::new(); n];

    for j in 0..n {
        // Start with rows from A[:,j]
        let mut col_set = Vec::new();
        col_set.push(j); // diagonal

        for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
            let i = pa.row_idx[k];
            if i > j {
                col_set.push(i);
            }
        }

        // Merge rows from previous columns k where L[j,k] != 0
        for &k in &row_to_cols[j] {
            // Add all rows > j from column k
            for &row in &l_row_idx_build[k] {
                if row > j {
                    col_set.push(row);
                }
            }
        }

        col_set.sort_unstable();
        col_set.dedup();
        l_row_idx_build[j] = col_set;

        // Register this column in row_to_cols for future columns
        for &row in &l_row_idx_build[j] {
            if row > j {
                row_to_cols[row].push(j);
            }
        }
    }

    // Build elimination tree from the computed structure (parent[j] = min row > j in L[:,j])
    let mut parent = vec![-1isize; n];
    for j in 0..n {
        for &row in &l_row_idx_build[j] {
            if row > j {
                parent[j] = row as isize;
                break; // first row > j (sorted)
            }
        }
    }

    // Build compressed l_row_idx and l_col_ptr
    let mut l_row_idx = Vec::new();
    for j in 0..n {
        l_col_ptr[j] = l_row_idx.len();
        l_row_idx.extend_from_slice(&l_row_idx_build[j]);
    }
    l_col_ptr[n] = l_row_idx.len();
    let l_nnz = l_row_idx.len();

    SymbolicCholesky {
        n,
        perm,
        iperm,
        l_col_ptr,
        l_row_idx,
        parent,
        l_nnz,
    }
}

/// Compute numeric Cholesky factorization given symbolic structure.
/// Returns None if matrix is not SPD (strict mode — no perturbation).
pub fn numeric_cholesky(sym: &SymbolicCholesky, a: &CscMatrix) -> Option<NumericCholesky> {
    numeric_cholesky_inner(sym, a, false)
}

/// Compute numeric Cholesky factorization with pivot perturbation.
/// Perturbs small/negative pivots (from shell drilling DOFs) instead of failing.
/// Always returns Some — caller must verify solution quality via residual check.
pub fn numeric_cholesky_perturbed(sym: &SymbolicCholesky, a: &CscMatrix) -> NumericCholesky {
    numeric_cholesky_inner(sym, a, true).unwrap()
}

fn numeric_cholesky_inner(sym: &SymbolicCholesky, a: &CscMatrix, perturb: bool) -> Option<NumericCholesky> {
    let n = sym.n;

    // Apply permutation to get numeric values
    let pa = a.permute_symmetric(&sym.perm);

    let mut l_values = vec![0.0f64; sym.l_nnz];

    // Dense column accumulator
    let mut x = vec![0.0f64; n];

    // Compute max diagonal of the ORIGINAL (permuted) matrix for stable thresholds.
    let mut max_diag = 0.0f64;
    for j in 0..n {
        for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
            if pa.row_idx[k] == j {
                if pa.values[k] > max_diag {
                    max_diag = pa.values[k];
                }
                break;
            }
        }
    }

    // Pivot perturbation tracking
    let mut n_perturbations = 0usize;
    let mut max_perturbation_val = 0.0f64;

    // Strict mode threshold: use absolute threshold like dense Cholesky.
    // Previous 1e-12 * max_diag was too aggressive for shell matrices where
    // drilling DOF pivots are naturally 4+ orders smaller than membrane pivots.
    let strict_threshold = 1e-15;
    // Perturbed mode threshold
    let soft_threshold = 1e-8 * max_diag;

    // Precompute nonzero-column lists: for each row j, which columns k < j have L[j,k] != 0.
    let mut nz_cols_for_row: Vec<Vec<(usize, usize)>> = vec![Vec::new(); n];
    for k in 0..n {
        for p in sym.l_col_ptr[k]..sym.l_col_ptr[k + 1] {
            let i = sym.l_row_idx[p];
            if i > k {
                nz_cols_for_row[i].push((k, p));
            }
        }
    }

    for j in 0..n {
        let l_start = sym.l_col_ptr[j];
        let l_end = sym.l_col_ptr[j + 1];
        for k in l_start..l_end {
            x[sym.l_row_idx[k]] = 0.0;
        }

        // Scatter A[:,j] into accumulator and record original diagonal
        let mut original_diag = 0.0f64;
        for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
            x[pa.row_idx[k]] = pa.values[k];
            if pa.row_idx[k] == j {
                original_diag = pa.values[k];
            }
        }

        // Left-looking updates
        for &(k, pos_jk) in &nz_cols_for_row[j] {
            let ljk = l_values[pos_jk];
            if ljk.abs() < 1e-30 {
                continue;
            }
            let lk_end = sym.l_col_ptr[k + 1];
            for p in pos_jk..lk_end {
                let i = sym.l_row_idx[p];
                x[i] -= l_values[p] * ljk;
            }
        }

        let diag = x[j];

        if perturb {
            // Perturbed mode: replace small/negative pivots with a fraction of the
            // original diagonal. This preserves natural DOF scale and avoids cascading
            // failures from inflated pivots. Caller must verify via residual check.
            if diag <= soft_threshold {
                // Use the full original diagonal: this acts as if the left-looking
                // updates didn't reduce this pivot, preserving the natural DOF scale.
                let target = if original_diag > soft_threshold {
                    original_diag
                } else {
                    1e-6 * max_diag
                };
                let target = target.max(1e-12 * max_diag);
                let perturbation = if diag.is_finite() { (target - diag).abs() } else { f64::MAX };
                x[j] = target;
                n_perturbations += 1;
                max_perturbation_val = max_perturbation_val.max(perturbation);
            }
        } else {
            // Strict mode: fail on non-SPD
            if diag <= strict_threshold {
                return None;
            }
        }

        let ljj = x[j].sqrt();

        for k in l_start..l_end {
            let i = sym.l_row_idx[k];
            if i == j {
                l_values[k] = ljj;
            } else {
                l_values[k] = x[i] / ljj;
            }
        }
    }

    Some(NumericCholesky {
        symbolic: sym.clone(),
        l_values,
        pivot_perturbations: n_perturbations,
        max_perturbation: max_perturbation_val,
    })
}

/// Solve L*L^T * x = b using sparse Cholesky factor, with permutation.
pub fn sparse_cholesky_solve(factor: &NumericCholesky, b: &[f64]) -> Vec<f64> {
    let n = factor.symbolic.n;
    let sym = &factor.symbolic;

    // Apply permutation to b: b_perm[new] = b[old]
    let mut bp = vec![0.0; n];
    for new in 0..n {
        bp[new] = b[sym.perm[new]];
    }

    // Forward solve: L * y = bp
    let mut y = bp;
    for j in 0..n {
        let start = sym.l_col_ptr[j];
        let end = sym.l_col_ptr[j + 1];

        // L[j,j] is at position start (first entry in column j)
        let ljj = factor.l_values[start];
        y[j] /= ljj;

        for k in (start + 1)..end {
            let i = sym.l_row_idx[k];
            y[i] -= factor.l_values[k] * y[j];
        }
    }

    // Backward solve: L^T * x = y
    let mut x = y;
    for j in (0..n).rev() {
        let start = sym.l_col_ptr[j];
        let end = sym.l_col_ptr[j + 1];

        for k in (start + 1)..end {
            let i = sym.l_row_idx[k];
            x[j] -= factor.l_values[k] * x[i];
        }

        let ljj = factor.l_values[start];
        x[j] /= ljj;
    }

    // Apply inverse permutation: result[old] = x[new]
    let mut result = vec![0.0; n];
    for new in 0..n {
        result[sym.perm[new]] = x[new];
    }
    result
}

/// Convenience: full sparse solve A*x = b. Returns None if not SPD.
pub fn sparse_cholesky_solve_full(a: &CscMatrix, b: &[f64]) -> Option<Vec<f64>> {
    let sym = symbolic_cholesky(a);
    let num = numeric_cholesky(&sym, a)?;
    Some(sparse_cholesky_solve(&num, b))
}

/// Estimate condition number from diagonal of L: max(diag)² / min(diag)².
pub fn sparse_condition_estimate(factor: &NumericCholesky) -> f64 {
    let sym = &factor.symbolic;
    let n = sym.n;
    let mut min_diag = f64::MAX;
    let mut max_diag = 0.0f64;

    for j in 0..n {
        let d = factor.l_values[sym.l_col_ptr[j]].abs();
        min_diag = min_diag.min(d);
        max_diag = max_diag.max(d);
    }

    if min_diag < 1e-30 {
        return f64::INFINITY;
    }
    (max_diag / min_diag) * (max_diag / min_diag)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_spd(dense: &[f64], n: usize) -> CscMatrix {
        CscMatrix::from_dense_symmetric(dense, n)
    }

    #[test]
    fn test_2x2() {
        let a = make_spd(&[4.0, 2.0, 2.0, 5.0], 2);
        let b = vec![8.0, 12.0];
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-10, "x[0]={}", x[0]);
        assert!((x[1] - 2.0).abs() < 1e-10, "x[1]={}", x[1]);
    }

    #[test]
    fn test_3x3() {
        let a = make_spd(&[
            4.0, 2.0, 1.0,
            2.0, 5.0, 3.0,
            1.0, 3.0, 6.0,
        ], 3);
        let b = vec![11.0, 21.0, 25.0];
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-10, "x[0]={}", x[0]);
        assert!((x[1] - 2.0).abs() < 1e-10, "x[1]={}", x[1]);
        assert!((x[2] - 3.0).abs() < 1e-10, "x[2]={}", x[2]);
    }

    #[test]
    fn test_10x10_random_spd() {
        // Build a 10×10 SPD matrix: A = B*B^T + 10*I
        let n = 10;
        let mut dense = vec![0.0; n * n];
        // Use a deterministic "random" matrix
        let seed: Vec<f64> = (0..n*n).map(|i| ((i * 7 + 3) % 17) as f64 / 17.0 - 0.5).collect();
        // A = seed^T * seed + 10*I
        for i in 0..n {
            for j in 0..n {
                let mut sum = 0.0;
                for k in 0..n {
                    sum += seed[k * n + i] * seed[k * n + j];
                }
                dense[i * n + j] = sum;
            }
            dense[i * n + i] += 10.0;
        }

        let a_sparse = make_spd(&dense, n);
        let b: Vec<f64> = (0..n).map(|i| (i + 1) as f64).collect();
        let x_sparse = sparse_cholesky_solve_full(&a_sparse, &b).unwrap();

        // Verify: A*x ≈ b
        for i in 0..n {
            let mut ax_i = 0.0;
            for j in 0..n {
                ax_i += dense[i * n + j] * x_sparse[j];
            }
            assert!((ax_i - b[i]).abs() < 1e-8, "row {}: A*x={}, b={}", i, ax_i, b[i]);
        }
    }

    #[test]
    fn test_tridiagonal_50() {
        let n = 50;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(4.0);
            if i + 1 < n {
                rows.push(i + 1);
                cols.push(i);
                vals.push(-1.0);
            }
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b: Vec<f64> = (0..n).map(|i| (i + 1) as f64).collect();
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();

        // Verify A*x ≈ b
        let ax = a.sym_mat_vec(&x);
        for i in 0..n {
            assert!((ax[i] - b[i]).abs() < 1e-8, "row {}: {}", i, (ax[i] - b[i]).abs());
        }
    }

    #[test]
    fn test_not_spd_returns_none() {
        // [[1, 2], [2, 1]] is not positive definite
        let a = make_spd(&[1.0, 2.0, 2.0, 1.0], 2);
        let b = vec![1.0, 1.0];
        assert!(sparse_cholesky_solve_full(&a, &b).is_none());
    }

    #[test]
    fn test_symbolic_reuse() {
        // Two matrices with same sparsity, different values
        let a1 = CscMatrix::from_triplets(3,
            &[0, 1, 1, 2, 2],
            &[0, 0, 1, 1, 2],
            &[10.0, 1.0, 8.0, 2.0, 6.0],
        );
        let a2 = CscMatrix::from_triplets(3,
            &[0, 1, 1, 2, 2],
            &[0, 0, 1, 1, 2],
            &[20.0, 3.0, 15.0, 4.0, 12.0],
        );
        let b = vec![1.0, 2.0, 3.0];

        let sym = symbolic_cholesky(&a1);
        let num1 = numeric_cholesky(&sym, &a1).unwrap();
        let x1 = sparse_cholesky_solve(&num1, &b);

        let num2 = numeric_cholesky(&sym, &a2).unwrap();
        let x2 = sparse_cholesky_solve(&num2, &b);

        // Verify both
        let ax1 = a1.sym_mat_vec(&x1);
        let ax2 = a2.sym_mat_vec(&x2);
        for i in 0..3 {
            assert!((ax1[i] - b[i]).abs() < 1e-10);
            assert!((ax2[i] - b[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_condition_estimate() {
        // Well-conditioned 2×2
        let a = make_spd(&[4.0, 0.0, 0.0, 4.0], 2);
        let sym = symbolic_cholesky(&a);
        let num = numeric_cholesky(&sym, &a).unwrap();
        let cond = sparse_condition_estimate(&num);
        assert!((cond - 1.0).abs() < 1e-10); // L = diag(2,2), ratio = 1
    }
}
