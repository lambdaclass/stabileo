/// Sparse Cholesky factorization (left-looking, supernodal-free).
///
/// Two-phase: symbolic (AMD + elimination tree + column counts) then numeric.
/// Symbolic phase can be reused when sparsity pattern is unchanged (P-Delta).

use super::sparse::CscMatrix;
use super::amd::{amd_order, inverse_perm};
use super::rcm::rcm_order;
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::rc::Rc;

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
/// Holds a shared reference to the (possibly reused) symbolic factorization
/// instead of an O(nnz_L) deep copy per numeric factorization.
#[derive(Debug, Clone)]
pub struct NumericCholesky {
    pub symbolic: Rc<SymbolicCholesky>,
    pub l_values: Vec<f64>,
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

    // Etree-based symbolic factorization.
    //
    // The nonzero rows of L[:,j] are the rows of A[:,j] below the diagonal
    // plus the rows below j of every CHILD of j in the elimination tree
    // (fill propagates child → parent, so merging children captures it all).
    // The previous version was left-looking without the tree: each column
    // merged the full row lists of every earlier column k with L[j,k] != 0,
    // which is O(nnz(L)²) worst case, and then built the tree from the
    // result and never used it. Computing the tree first makes each entry
    // of L propagate only along its etree path.

    // Elimination tree of the permuted matrix, computed from A's pattern
    // (Liu's algorithm with path compression; the etree of A is the etree of
    // L). `pa` stores the lower triangle by column; the walk needs it by row
    // (row i, adjacent j < i), so build the pattern transpose first. Rows
    // come out sorted: entries are appended in increasing column order.
    // Scoped: the transpose and the ancestor array are dead the moment the tree
    // is built, and everything after this is the allocation-heavy part. Holding
    // ~nnz(A)/2 usizes across it costs about 1 MB on a 256×256 grid for nothing.
    let parent = {
        let mut row_ptr = vec![0usize; n + 1];
        for j in 0..n {
            for p in pa.col_ptr[j]..pa.col_ptr[j + 1] {
                if pa.row_idx[p] > j {
                    row_ptr[pa.row_idx[p] + 1] += 1;
                }
            }
        }
        for i in 0..n {
            row_ptr[i + 1] += row_ptr[i];
        }
        let mut row_cols = vec![0usize; row_ptr[n]];
        {
            let mut next = row_ptr.clone();
            for j in 0..n {
                for p in pa.col_ptr[j]..pa.col_ptr[j + 1] {
                    let i = pa.row_idx[p];
                    if i > j {
                        row_cols[next[i]] = j;
                        next[i] += 1;
                    }
                }
            }
        }

        let mut parent = vec![-1isize; n];
        let mut ancestor = vec![-1isize; n];
        for i in 0..n {
            for p in row_ptr[i]..row_ptr[i + 1] {
                let mut r = row_cols[p];
                while ancestor[r] != -1 && ancestor[r] != i as isize {
                    let t = ancestor[r] as usize;
                    ancestor[r] = i as isize;
                    r = t;
                }
                if ancestor[r] == -1 {
                    parent[r] = i as isize;
                    ancestor[r] = i as isize;
                }
            }
        }
        parent
    };

    // Children of each node, as a flat counting-sorted list — the same shape as
    // the pattern transpose above, for the same reason. A `Vec<Vec<usize>>` here
    // costs n heap allocations plus n Vec headers (1.6 MB at n = 65,536) and
    // scatters the children of one node across the heap, which is a poor trade
    // for a structure read exactly once, in order.
    let mut child_ptr = vec![0usize; n + 2];
    for j in 0..n {
        if parent[j] >= 0 {
            child_ptr[parent[j] as usize + 1] += 1;
        }
    }
    for j in 0..n {
        child_ptr[j + 1] += child_ptr[j];
    }
    let mut child_idx = vec![0usize; child_ptr[n]];
    {
        let mut next = child_ptr.clone();
        for j in 0..n {
            if parent[j] >= 0 {
                let p = parent[j] as usize;
                child_idx[next[p]] = j;
                next[p] += 1;
            }
        }
    }

    // Column structures, built straight into the flat array.
    //
    // Children are finished before their parent and never revisited after it,
    // so a parent can read its children's rows out of `l_row_idx` itself. The
    // previous version kept a second `Vec<Vec<usize>>` of the same total size
    // alive until the very end, which doubled the peak of the structure phase —
    // on a wasm32 build, where memory growth is user-visible, that is the whole
    // budget twice over for no benefit.
    //
    // The merge is k-way and allocation-free. It used to be pairwise, one fresh
    // `Vec` per child, with no short-circuit for a child that contributes
    // nothing: node j cost Θ(children(j) · |L[:,j]|) whether or not the children
    // had anything to add. On a "broom" — many degree-1 leaves hanging off one
    // hub — AMD eliminates the leaves first, so the hub ends up with thousands
    // of children whose suffixes are ALL empty, and the merge work grew as
    // Θ(n^1.5) while nnz(L) stayed linear: 518 ms at n = 160,401, entirely
    // spent copying a column onto itself. That is the same class of blowup this
    // rewrite exists to remove, so it does not get to come back in the fix.
    let mut l_col_ptr = vec![0usize; n + 1];
    // nnz(L) is not known until the loop finishes, but starting from zero costs
    // ~log2(nnz(L)) reallocations, each copying everything written so far. The
    // permuted pattern is the right order of magnitude to start from.
    let mut l_row_idx: Vec<usize> = Vec::with_capacity(pa.row_idx.len() * 2);
    // Reused across columns: one allocation for the whole factorization.
    let mut scratch: Vec<usize> = Vec::new();
    let mut heap: BinaryHeap<Reverse<(usize, usize)>> = BinaryHeap::new();

    for j in 0..n {
        // Set BEFORE the merge, not after: a child c reads
        // `l_row_idx[l_col_ptr[c]..l_col_ptr[c + 1]]`, and for the child c = j-1
        // that end pointer is `l_col_ptr[j]` — this iteration's own start. Writing
        // it at the end of the body left that one child reading a stale bound.
        l_col_ptr[j] = l_row_idx.len();

        scratch.clear();
        scratch.push(j); // diagonal, and strictly below every row that follows
        {
            // `sources` borrows `l_row_idx`; the borrow ends with this block, so
            // the column can be appended to the same vector immediately after.
            let mut sources: Vec<&[usize]> = Vec::new();

            // Rows of A[:,j] below the diagonal. `pa` comes from `from_triplets`,
            // which sorts by (col, row) and sums duplicates, so every slice fed
            // to the merge is strictly increasing. That is now a PRECONDITION of
            // the merge rather than something it re-establishes with a sort, so
            // it is asserted: if `permute_symmetric` ever stops sorting, the
            // `partition_point` calls silently return an arbitrary split and L
            // comes out structurally wrong, with nothing downstream to catch it.
            let a_col = &pa.row_idx[pa.col_ptr[j]..pa.col_ptr[j + 1]];
            debug_assert!(
                a_col.windows(2).all(|w| w[0] < w[1]),
                "permuted column {j} must be strictly increasing",
            );
            let a_below = &a_col[a_col.partition_point(|&i| i <= j)..];
            if !a_below.is_empty() {
                sources.push(a_below);
            }

            // Each child's rows below j. Dropping the empty ones is what keeps a
            // node with many contributionless children cheap.
            for ci in child_ptr[j]..child_ptr[j + 1] {
                let c = child_idx[ci];
                let child = &l_row_idx[l_col_ptr[c]..l_col_ptr[c + 1]];
                debug_assert!(
                    child.windows(2).all(|w| w[0] < w[1]),
                    "child column {c} must be strictly increasing",
                );
                let suffix = &child[child.partition_point(|&i| i <= j)..];
                if !suffix.is_empty() {
                    sources.push(suffix);
                }
            }

            merge_runs_into(&mut scratch, &sources, &mut heap);
        }

        l_row_idx.extend_from_slice(&scratch);
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

/// Append the union of several STRICTLY INCREASING runs to `out`, in order.
///
/// Preconditions, all debug-asserted at the call site: every run is strictly
/// increasing, and every value in every run is greater than `out`'s current last
/// element. The contract is the union of strictly-increasing runs, not "a merge
/// that removes duplicates" — the earlier helper claimed the latter and only
/// delivered the former, dropping values repeated across two inputs but copying
/// straight through a value repeated inside one. Nothing relied on the
/// difference, but a future caller reading the doc would have, and the result
/// would be duplicate row indices that `numeric_cholesky` consumes in silence.
///
/// `heap` is borrowed rather than allocated so the whole factorization pays for
/// one; it is only touched for three runs or more.
fn merge_runs_into(
    out: &mut Vec<usize>,
    sources: &[&[usize]],
    heap: &mut BinaryHeap<Reverse<(usize, usize)>>,
) {
    match sources.len() {
        // A single already-ordered run is a copy, and no run at all is nothing.
        // Both are the common case and neither should touch the heap.
        0 => {}
        1 => out.extend_from_slice(sources[0]),
        2 => {
            let (a, b) = (sources[0], sources[1]);
            let (mut i, mut j) = (0, 0);
            while i < a.len() && j < b.len() {
                match a[i].cmp(&b[j]) {
                    std::cmp::Ordering::Less => {
                        out.push(a[i]);
                        i += 1;
                    }
                    std::cmp::Ordering::Greater => {
                        out.push(b[j]);
                        j += 1;
                    }
                    std::cmp::Ordering::Equal => {
                        out.push(a[i]);
                        i += 1;
                        j += 1;
                    }
                }
            }
            out.extend_from_slice(&a[i..]);
            out.extend_from_slice(&b[j..]);
        }
        _ => {
            // k-way, so a node with many contributing children costs
            // O(total · log k) rather than the Θ(k · |column|) a pairwise fold
            // would spend re-copying the accumulated column once per child.
            heap.clear();
            let mut cursor = vec![0usize; sources.len()];
            for (k, s) in sources.iter().enumerate() {
                heap.push(Reverse((s[0], k)));
            }
            while let Some(Reverse((v, k))) = heap.pop() {
                if *out.last().expect("out always carries the diagonal") != v {
                    out.push(v);
                }
                cursor[k] += 1;
                if cursor[k] < sources[k].len() {
                    heap.push(Reverse((sources[k][cursor[k]], k)));
                }
            }
        }
    }
}

/// Compute numeric Cholesky factorization given symbolic structure.
/// Returns None if matrix is not SPD (strict mode — no perturbation).
///
/// There is deliberately no perturbed/regularized variant: a factorization
/// that silently "succeeds" on an indefinite K_ff turns a genuine mechanism
/// into a garbage solution. Callers that need drilling-DOF stabilization
/// apply an explicit diagonal shift to K_ff and verify by iterative
/// refinement against the original matrix (see `solver::linear`).
pub fn numeric_cholesky(sym: &Rc<SymbolicCholesky>, a: &CscMatrix) -> Option<NumericCholesky> {
    let n = sym.n;

    // Apply permutation to get numeric values
    let pa = a.permute_symmetric(&sym.perm);

    let mut l_values = vec![0.0f64; sym.l_nnz];

    // Dense column accumulator
    let mut x = vec![0.0f64; n];

    // Strict threshold: use absolute threshold like dense Cholesky.
    // A previous 1e-12 * max_diag relative threshold was too aggressive for
    // shell matrices where drilling DOF pivots are naturally 4+ orders
    // smaller than membrane pivots.
    let strict_threshold = 1e-15;

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

        // Scatter A[:,j] into accumulator
        for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
            x[pa.row_idx[k]] = pa.values[k];
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

        // Strict mode: fail on non-SPD
        if diag <= strict_threshold {
            return None;
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
        symbolic: Rc::clone(sym),
        l_values,
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
    let sym = Rc::new(symbolic_cholesky(a));
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

        let sym = Rc::new(symbolic_cholesky(&a1));
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
        let sym = Rc::new(symbolic_cholesky(&a));
        let num = numeric_cholesky(&sym, &a).unwrap();
        let cond = sparse_condition_estimate(&num);
        assert!((cond - 1.0).abs() < 1e-10); // L = diag(2,2), ratio = 1
    }

    /// The pre-etree symbolic factorization (direct left-looking, merging the
    /// row lists of every earlier column k with L[j,k] != 0). Kept as the
    /// reference oracle for the etree-based implementation: both must produce
    /// the exact same L structure and the same elimination tree.
    fn reference_symbolic_structure(pa: &CscMatrix) -> (Vec<usize>, Vec<usize>, Vec<isize>) {
        let n = pa.n;
        let mut l_col_ptr = vec![0usize; n + 1];
        let mut l_row_idx_build: Vec<Vec<usize>> = vec![Vec::new(); n];
        // row_to_cols[i] = list of columns k < i where L[i,k] != 0
        let mut row_to_cols: Vec<Vec<usize>> = vec![Vec::new(); n];

        for j in 0..n {
            let mut col_set = Vec::new();
            col_set.push(j);
            for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
                let i = pa.row_idx[k];
                if i > j {
                    col_set.push(i);
                }
            }
            for &k in &row_to_cols[j] {
                for &row in &l_row_idx_build[k] {
                    if row > j {
                        col_set.push(row);
                    }
                }
            }
            col_set.sort_unstable();
            col_set.dedup();
            l_row_idx_build[j] = col_set;
            for &row in &l_row_idx_build[j] {
                if row > j {
                    row_to_cols[row].push(j);
                }
            }
        }

        let mut parent = vec![-1isize; n];
        for j in 0..n {
            for &row in &l_row_idx_build[j] {
                if row > j {
                    parent[j] = row as isize;
                    break;
                }
            }
        }

        let mut l_row_idx = Vec::new();
        for j in 0..n {
            l_col_ptr[j] = l_row_idx.len();
            l_row_idx.extend_from_slice(&l_row_idx_build[j]);
        }
        l_col_ptr[n] = l_row_idx.len();
        (l_col_ptr, l_row_idx, parent)
    }

    #[test]
    fn test_etree_symbolic_matches_reference() {
        use rand::rngs::StdRng;
        use rand::{Rng, SeedableRng};

        let mut rng = StdRng::seed_from_u64(0x5eed);
        // Three shapes, because two were not enough.
        //
        // Grids and uniform-random patterns both produce elimination trees where
        // almost every node has one child, so the many-children merge — the one
        // that has to combine several child columns at once — went completely
        // unexercised. That is how a Θ(n^1.5) merge shipped green: the suite
        // could not distinguish it from a linear one. The `broom` shape is built
        // to hit it: a hub joined to everything, with a crowd of degree-1 leaves
        // that a minimum-degree ordering eliminates first, leaving the hub with
        // as many children as there are leaves.
        //
        // `n` stays small here because this test is about STRUCTURE, asserted
        // bit-exactly against the reference. The cost property is now structural
        // rather than policed by a test: `merge_runs_into` reads each source
        // exactly once, so a column costs Θ(Σ|sources|) no matter how the
        // children are distributed.
        for trial in 0..300 {
            let n = rng.gen_range(1..41);
            let density = rng.gen_range(0.05..0.5);
            let shape = trial % 3;
            let grid = shape == 0;

            let mut rows = vec![];
            let mut cols = vec![];
            let mut vals = vec![];
            for i in 0..n {
                rows.push(i);
                cols.push(i);
                vals.push(4.0 * n as f64 + 1.0); // diagonal dominance → SPD
            }
            if shape == 2 {
                // Broom: node 0 is the hub, the last `clique` nodes form a dense
                // block that also hangs off it, and everything between is a leaf
                // attached to the hub alone.
                let clique = (n / 6).max(2).min(n);
                let first_clique = n - clique;
                for i in 1..n {
                    rows.push(i);
                    cols.push(0);
                    vals.push(-1.0);
                }
                for a in first_clique..n {
                    for b in (a + 1)..n {
                        rows.push(b);
                        cols.push(a);
                        vals.push(-1.0);
                    }
                }
            } else if grid {
                // n ≈ side² grid with 5-point stencil
                let side = (n as f64).sqrt().ceil() as usize;
                for r in 0..side {
                    for c in 0..side {
                        let i = r * side + c;
                        if i >= n { continue; }
                        for (dr, dc) in [(1usize, 0usize), (0, 1)] {
                            let r2 = r + dr;
                            let c2 = c + dc;
                            let k = r2 * side + c2;
                            if r2 < side && c2 < side && k < n {
                                rows.push(k.max(i));
                                cols.push(k.min(i));
                                vals.push(-1.0);
                            }
                        }
                    }
                }
            } else {
                for j in 0..n {
                    for i in (j + 1)..n {
                        if rng.gen_range(0.0..1.0) < density {
                            rows.push(i);
                            cols.push(j);
                            vals.push(rng.gen_range(-0.5..0.5));
                        }
                    }
                }
            }
            let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);

            for ordering in [CholOrdering::Amd, CholOrdering::Rcm] {
                let sym = symbolic_cholesky_with(&a, ordering);
                let pa = a.permute_symmetric(&sym.perm);
                let (ref_ptr, ref_idx, ref_parent) = reference_symbolic_structure(&pa);

                assert_eq!(sym.l_col_ptr, ref_ptr, "l_col_ptr mismatch, trial {trial} n={n} shape={shape} {ordering:?}");
                assert_eq!(sym.l_row_idx, ref_idx, "l_row_idx mismatch, trial {trial} n={n} shape={shape} {ordering:?}");
                assert_eq!(sym.parent, ref_parent, "parent mismatch, trial {trial} n={n} shape={shape} {ordering:?}");
                assert_eq!(sym.l_nnz, ref_idx.len());

                // And the structure must actually factor + solve.
                let num = numeric_cholesky(&Rc::new(sym), &a).expect("SPD matrix should factor");
                let b: Vec<f64> = (0..n).map(|i| (i + 1) as f64).collect();
                let x = sparse_cholesky_solve(&num, &b);
                let ax = a.sym_mat_vec(&x);
                for i in 0..n {
                    assert!((ax[i] - b[i]).abs() < 1e-6 * (n as f64), "solve residual, trial {trial} row {i}");
                }
            }
        }
    }
}
