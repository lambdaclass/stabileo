/// Sparse Cholesky factorization (supernodal: left-looking between supernodes,
/// dense right-looking within each supernode panel).
///
/// Two-phase: symbolic (AMD + elimination tree + column counts + supernode
/// partition) then numeric. Symbolic phase can be reused when sparsity
/// pattern is unchanged (P-Delta).

use super::sparse::CscMatrix;
use super::amd::{amd_order, inverse_perm};
use super::rcm::rcm_order;
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
    /// Fundamental supernode partition: snode_start[t] is the first column of
    /// supernode t; its column range is snode_start[t]..snode_start[t+1]
    /// (or n for the last). Within supernode t, column s+d has row structure
    /// l_row_idx[l_col_ptr[s]+d .. l_col_ptr[s]+rows], so the supernode's
    /// values form a dense trapezoidal block inside the CSC storage.
    pub snode_start: Vec<usize>,
    /// snode_upd[t]: prior supernodes whose columns update supernode t
    /// (their row structure contains at least one column of t).
    pub snode_upd: Vec<Vec<usize>>,
    /// Structure of the permuted matrix P·A·Pᵀ (lower-triangle CSC) and the
    /// source map pa_src[p] = index into the original `a.values` of the entry
    /// at permuted position p. Lets numeric_cholesky permute values with a
    /// single O(nnz) gather instead of re-tripletizing and re-sorting on every
    /// factorization.
    ///
    /// This is a deliberate memory-for-time trade: `pa_row_idx` and `pa_src`
    /// add 2·nnz(A) usizes to every cached symbolic factorization — about
    /// 6.4 MB at nnz(A) = 400k — and P-Delta holds one across every load step.
    /// It buys back a full O(nnz log nnz) sort and a triplet rebuild per
    /// numeric factorization, which those same iterative paths pay repeatedly.
    /// On wasm32, where memory growth is user-visible, that is the axis to
    /// watch if the trade is ever revisited.
    pub pa_col_ptr: Vec<usize>,
    pub pa_row_idx: Vec<usize>,
    pub pa_src: Vec<usize>,
    /// Structural fingerprint of the matrix `pa_src` was built from: the
    /// contract that symbolic reuse must not break, in a form the numeric
    /// phase can check in O(nnz) against an O(nnz·flops) factorization.
    pub pa_fingerprint: u64,
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
    let perm = match ordering {
        CholOrdering::Amd => amd_order(a.n, &a.col_ptr, &a.row_idx),
        CholOrdering::Rcm => rcm_order(a.n, &a.col_ptr, &a.row_idx),
    };
    symbolic_cholesky_with_perm(a, &perm)
}

/// Compute symbolic Cholesky factorization with a caller-provided permutation
/// (perm[new] = old). Used to compare orderings and to reuse externally
/// computed fill-reducing permutations.
pub fn symbolic_cholesky_with_perm(a: &CscMatrix, perm: &[usize]) -> SymbolicCholesky {
    let n = a.n;
    // Restored: `permute_symmetric`, which this replaces, asserted this at the
    // top before doing any work. Without it a wrong-length permutation fails
    // further down as a bare index-out-of-bounds that names nothing — and this
    // is a pub entry point documented as taking externally computed orderings.
    assert_eq!(perm.len(), n, "permutation length must equal the matrix order");
    let iperm = inverse_perm(perm);

    // A must have no duplicate (row, col). `from_triplets` guarantees it, but
    // CscMatrix has public fields, so a hand-built matrix can carry duplicates —
    // and unlike the `from_triplets` path this replaces, the map cannot SUM
    // them: two entries landing on one slot would both survive as separate
    // positions and the panel scatter, which assigns rather than accumulates,
    // would keep whichever the sort happened to place last. Checked once here,
    // in the symbolic phase, rather than per factorization.
    for j in 0..n {
        let col = &a.row_idx[a.col_ptr[j]..a.col_ptr[j + 1]];
        assert!(
            col.windows(2).all(|w| w[0] < w[1]),
            "column {j} of A must be strictly increasing and duplicate-free",
        );
    }

    // Permuted structure P·A·Pᵀ (lower triangle) plus the source map
    // pa_src[p] = index of that entry in the original `a`. The numeric phase
    // then permutes values with an O(nnz) gather instead of re-sorting
    // triplets per factorization.
    //
    // Bucketed by column with a counting sort, not a comparison sort: nothing
    // downstream needs the rows ordered WITHIN a pa column. The column build
    // re-sorts `l_row_idx[tail_start..]` itself, `row_cols[i]` comes out
    // ascending because the outer loop is over j regardless, and the panel
    // scatter reaches its slot through `map_pos`. So an O(nnz log nnz) sort
    // over a 24-byte triplet buffer — ~9.6 MB of transient allocation at
    // nnz = 400k, on a wasm32 heap — bought ordering no consumer reads.
    let nnz = a.col_ptr[n];
    let mut pa_col_ptr = vec![0usize; n + 1];
    for j in 0..n {
        let nj = iperm[j];
        for k in a.col_ptr[j]..a.col_ptr[j + 1] {
            let ni = iperm[a.row_idx[k]];
            let c = if ni >= nj { nj } else { ni };
            pa_col_ptr[c + 1] += 1;
        }
    }
    for c in 0..n {
        pa_col_ptr[c + 1] += pa_col_ptr[c];
    }
    let mut pa_row_idx = vec![0usize; nnz];
    let mut pa_src = vec![0usize; nnz];
    {
        let mut cursor = pa_col_ptr.clone();
        for j in 0..n {
            let nj = iperm[j];
            for k in a.col_ptr[j]..a.col_ptr[j + 1] {
                let ni = iperm[a.row_idx[k]];
                let (r, c) = if ni >= nj { (ni, nj) } else { (nj, ni) };
                pa_row_idx[cursor[c]] = r;
                pa_src[cursor[c]] = k;
                cursor[c] += 1;
            }
        }
    }

    // Structural fingerprint of the matrix this map was built from. See
    // `numeric_cholesky` for why nnz alone is not enough to police reuse.
    let pa_fingerprint = structural_fingerprint(a);

    // Elimination tree of the permuted matrix, computed directly from the
    // graph of A (Liu's algorithm with path compression, O(nnz·α(n))).
    // parent[j] = smallest row index > j in L[:,j]; NONE = root.
    // The CSC stores the lower triangle, so row_cols[i] = columns j < i with
    // A[i,j] != 0 gives row-wise access to the lower triangle.
    const NONE: usize = usize::MAX;
    let mut row_cols: Vec<Vec<usize>> = vec![Vec::new(); n];
    for j in 0..n {
        for k in pa_col_ptr[j]..pa_col_ptr[j + 1] {
            let i = pa_row_idx[k];
            if i > j {
                row_cols[i].push(j);
            }
        }
    }
    let mut parent_isize = vec![NONE; n];
    let mut ancestor = vec![NONE; n];
    for i in 0..n {
        for &j in &row_cols[i] {
            let mut r = j;
            while ancestor[r] != NONE && ancestor[r] != i {
                let t = ancestor[r];
                ancestor[r] = i;
                r = t;
            }
            if ancestor[r] == NONE {
                ancestor[r] = i;
                parent_isize[r] = i;
            }
        }
    }

    // Children of each node in increasing order.
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); n];
    for j in 0..n {
        if parent_isize[j] != NONE {
            children[parent_isize[j]].push(j);
        }
    }

    // Column patterns via the elimination tree:
    //   struct(L[:,j]) = {j} ∪ struct(A[:,j] below diag) ∪ (∪_{c child of j} struct(L[:,c]) \ {c})
    // Every column of L is scanned exactly once (by its parent), so the whole
    // pattern costs O(nnz(A) + nnz(L)) plus a per-column sort — instead of the
    // previous O(nnz(L)²) merge over every column contributing to a row.
    //
    // All rows contributed to column j are >= j: A rows are filtered with
    // i > j, and every row r > c in a child pattern satisfies r >= parent[c] = j
    // (parent[c] is by definition the smallest such row). So the diagonal can
    // be emitted first and only the tail needs sorting.
    let mut l_col_ptr = vec![0usize; n + 1];
    let mut l_row_idx: Vec<usize> = Vec::new();
    let mut mark = vec![NONE; n];

    for j in 0..n {
        l_col_ptr[j] = l_row_idx.len();
        mark[j] = j;
        l_row_idx.push(j); // diagonal first
        let tail_start = l_row_idx.len();

        for k in pa_col_ptr[j]..pa_col_ptr[j + 1] {
            let i = pa_row_idx[k];
            if i > j && mark[i] != j {
                mark[i] = j;
                l_row_idx.push(i);
            }
        }
        for &c in &children[j] {
            for k in l_col_ptr[c]..l_col_ptr[c + 1] {
                let r = l_row_idx[k];
                if r > c && mark[r] != j {
                    mark[r] = j;
                    l_row_idx.push(r);
                }
            }
        }
        l_row_idx[tail_start..].sort_unstable();
    }
    l_col_ptr[n] = l_row_idx.len();
    let l_nnz = l_row_idx.len();

    // Convert to the historical parent representation (-1 for roots).
    let parent: Vec<isize> = parent_isize
        .iter()
        .map(|&p| if p == NONE { -1 } else { p as isize })
        .collect();

    // Fundamental supernodes: consecutive columns j, j+1 merge when j+1 is
    // j's etree parent and their column counts differ by exactly one, which
    // for Cholesky means their row structures coincide below the block.
    let mut snode_start: Vec<usize> = Vec::new();
    {
        let mut j = 0;
        while j < n {
            snode_start.push(j);
            let mut cnt = l_col_ptr[j + 1] - l_col_ptr[j];
            while j + 1 < n
                && parent_isize[j] == j + 1
                && l_col_ptr[j + 2] - l_col_ptr[j + 1] == cnt - 1
            {
                j += 1;
                cnt -= 1;
            }
            j += 1;
        }
    }
    let snode_end = |t: usize| -> usize {
        if t + 1 < snode_start.len() { snode_start[t + 1] } else { n }
    };

    // Supernode index of each column.
    let mut snode_of = vec![0usize; n];
    for t in 0..snode_start.len() {
        for j in snode_start[t]..snode_end(t) {
            snode_of[j] = t;
        }
    }

    // For each supernode t, the prior supernodes that update it: those with
    // at least one column k whose L structure contains a column of t.
    // Built from row -> columns lists over L's structure (below diagonal),
    // then collapsed to supernode granularity with a per-t stamp.
    let mut row_to_cols: Vec<Vec<usize>> = vec![Vec::new(); n];
    for k in 0..n {
        for p in l_col_ptr[k]..l_col_ptr[k + 1] {
            let i = l_row_idx[p];
            if i > k {
                row_to_cols[i].push(k);
            }
        }
    }
    let mut seen = vec![NONE; snode_start.len()];
    let mut snode_upd: Vec<Vec<usize>> = vec![Vec::new(); snode_start.len()];
    for t in 0..snode_start.len() {
        for j in snode_start[t]..snode_end(t) {
            for &k in &row_to_cols[j] {
                let tk = snode_of[k];
                if tk != t && seen[tk] != t {
                    seen[tk] = t;
                    snode_upd[t].push(tk);
                }
            }
        }
    }

    SymbolicCholesky {
        n,
        perm: perm.to_vec(),
        iperm,
        l_col_ptr,
        l_row_idx,
        parent,
        l_nnz,
        snode_start,
        snode_upd,
        pa_col_ptr,
        pa_row_idx,
        pa_src,
        pa_fingerprint,
    }
}

/// A cheap structural digest of a CSC pattern: order, column pointers and row
/// indices. Values are deliberately NOT included — reuse across changed values
/// is the whole point of the symbolic phase; reuse across a changed PATTERN is
/// what has to be caught.
///
/// FxHash-style multiply-xor rather than DefaultHasher: this runs once per
/// numeric factorization, and SipHash over nnz indices is real work next to a
/// gather. Collisions here mean a missed diagnostic on an already-broken
/// caller, never a wrong answer on a correct one, so 64 bits of a fast mixer is
/// the right trade.
fn structural_fingerprint(a: &CscMatrix) -> u64 {
    const K: u64 = 0x517c_c1b7_2722_0a95;
    let mut h: u64 = a.n as u64;
    let mut mix = |v: usize| {
        h = (h.rotate_left(5) ^ v as u64).wrapping_mul(K);
    };
    for &p in &a.col_ptr {
        mix(p);
    }
    for &i in &a.row_idx {
        mix(i);
    }
    h
}

/// Compute numeric Cholesky factorization given symbolic structure.
/// Returns None if matrix is not SPD (strict mode — no perturbation).
///
/// There is deliberately no perturbed/regularized variant: a factorization
/// that silently "succeeds" on an indefinite K_ff turns a genuine mechanism
/// into a garbage solution. Callers that need drilling-DOF stabilization
/// apply an explicit diagonal shift to K_ff and verify by iterative
/// refinement against the original matrix (see `solver::linear`).
///
/// Supernodal: each supernode's values form a dense trapezoidal block inside
/// the CSC storage (column s+d of the supernode starting at s occupies
/// l_col_ptr[s+d]..l_col_ptr[s+d+1] with row structure
/// l_row_idx[l_col_ptr[s]+d .. l_col_ptr[s]+rows]), so updates between
/// supernodes run as dense loops over a cache-resident panel instead of
/// per-column sparse axpys with indirect indexing.
pub fn numeric_cholesky(sym: &Rc<SymbolicCholesky>, a: &CscMatrix) -> Option<NumericCholesky> {
    let n = sym.n;

    // Permuted values come from the map precomputed in the symbolic phase: an
    // O(nnz) gather, no triplet rebuild, no sort.
    //
    // That turns a SOFT contract into a HARD one, and the guard has to match.
    // The `permute_symmetric(&sym.perm)` this replaces recomputed the permuted
    // matrix from whatever was passed in, so reuse tolerated a drifting
    // pattern; `pa_src` holds positions into the values array of the matrix the
    // symbolic was built from, and reading them against a different pattern
    // gathers neighbouring entries into every slot past the first divergence.
    // Cholesky then succeeds and returns displacements for a matrix nobody
    // assembled.
    //
    // This is reachable, not hypothetical. Both P-Delta loops cache one
    // symbolic (`pdelta.rs:88`, `:331`) and rebuild `k_csc` every iteration
    // through `CscMatrix::from_dense_symmetric`, whose `|v| > 1e-30` filter
    // makes the pattern VALUE-dependent — and the geometric stiffness changes
    // every iteration by design. On the unconstrained path the pattern is
    // pinned by K's element topology, since K_G occupies the same DOF pairs;
    // with constraints, `reduce_matrix` can produce entries that cancel, and
    // where they cancel moves as K_G moves.
    //
    // So: `assert!`, not `debug_assert!` — the release wasm32 build is the one
    // that ships, and `permute_symmetric` ran its own `assert_eq!` there on
    // every factorization, so debug-only would be a downgrade of a live check.
    // And the fingerprint, not nnz: one entry dropping below the threshold
    // while another rises above it leaves nnz identical.
    assert_eq!(a.n, n, "numeric_cholesky: matrix order does not match the symbolic");
    assert_eq!(a.col_ptr.len(), n + 1, "numeric_cholesky: malformed column pointers");
    assert_eq!(
        structural_fingerprint(a),
        sym.pa_fingerprint,
        "numeric_cholesky: sparsity pattern differs from the one the symbolic \
         factorization was built for ({} nonzeros now, {} then) — symbolic reuse \
         requires an unchanged pattern, not merely an unchanged shape",
        a.col_ptr[n],
        sym.pa_src.len(),
    );

    let pa_col_ptr = &sym.pa_col_ptr;
    let pa_row_idx = &sym.pa_row_idx;

    let mut l_values = vec![0.0f64; sym.l_nnz];

    // Strict threshold: use absolute threshold like dense Cholesky.
    // A previous 1e-12 * max_diag relative threshold was too aggressive for
    // shell matrices where drilling DOF pivots are naturally 4+ orders
    // smaller than membrane pivots.
    let strict_threshold = 1e-15;

    let ns = sym.snode_start.len();
    let snode_end = |t: usize| -> usize {
        if t + 1 < ns { sym.snode_start[t + 1] } else { n }
    };

    // Panel capacity: max over supernodes of rows × width.
    let mut max_panel = 0usize;
    for t in 0..ns {
        let s = sym.snode_start[t];
        let rows = sym.l_col_ptr[s + 1] - sym.l_col_ptr[s];
        max_panel = max_panel.max(rows * snode_end(t).saturating_sub(s));
    }
    // Dense supernode panel, column-major: panel[d * rows + p] holds the
    // value for column s+d at the row l_row_idx[l_col_ptr[s]+p].
    let mut panel = vec![0.0f64; max_panel.max(1)];
    // Generation-stamped row -> panel position map (valid when gen matches).
    let mut map_pos = vec![0usize; n.max(1)];
    let mut map_gen = vec![0usize; n.max(1)];
    let mut gen = 0usize;
    // Row correspondence for the current (K, J) update pair:
    // positions in K's row list and matching positions in J's panel.
    let mut pair_k: Vec<usize> = Vec::new();
    let mut pair_j: Vec<usize> = Vec::new();

    for t in 0..ns {
        let s = sym.snode_start[t];
        let e = snode_end(t);
        let width = e - s;
        let jb = sym.l_col_ptr[s];
        let rows = sym.l_col_ptr[s + 1] - jb;

        gen += 1;
        for p in 0..rows {
            let r = sym.l_row_idx[jb + p];
            map_pos[r] = p;
            map_gen[r] = gen;
        }

        // Zero the panel and scatter A's columns s..e into it.
        for v in panel[..width * rows].iter_mut() {
            *v = 0.0;
        }
        for d in 0..width {
            let j = s + d;
            for p in pa_col_ptr[j]..pa_col_ptr[j + 1] {
                let i = pa_row_idx[p];
                // struct(A[:,j]) ⊆ struct(L[:,j]) ⊆ panel rows
                debug_assert_eq!(map_gen[i], gen);
                // Gathered straight from the source. Staging these into an
                // nnz-sized `pa_values` first meant one heap allocation and a
                // full write-then-read pass over nnz per factorization — the
                // per-call work this map exists to remove.
                panel[d * rows + map_pos[i]] = a.values[sym.pa_src[p]];
            }
        }

        // Gather updates from prior supernodes.
        for &tk in &sym.snode_upd[t] {
            let ks = sym.snode_start[tk];
            let kw = snode_end(tk) - ks;
            let kb = sym.l_col_ptr[ks];
            let krows = sym.l_col_ptr[ks + 1] - kb;
            let k_row = &sym.l_row_idx[kb..kb + krows];

            // Positions of J's columns [s, e) inside K's (sorted) row list.
            let p_lo = k_row.partition_point(|&r| r < s);
            let p_hi = k_row.partition_point(|&r| r < e);
            debug_assert!(p_lo < p_hi, "updater supernode must touch J's columns");
            debug_assert!(p_lo >= kw, "J's columns lie below K's diagonal block");

            // Rows of K at or below s that belong to J's panel. This must
            // include J's own diagonal-block rows (positions p_lo..p_hi):
            // the update for panel column j covers every row i >= j in K's
            // structure — including i = j (the L[j,k]^2 diagonal term) and
            // i in (j, e) — not just the rows below the block.
            pair_k.clear();
            pair_j.clear();
            for q in p_lo..krows {
                let r = k_row[q];
                if map_gen[r] == gen {
                    pair_k.push(q);
                    pair_j.push(map_pos[r]);
                }
            }

            // Column ks+d of K starts at l_col_ptr[ks+d]; entry (row position
            // q, column d) of the dense trapezoid lives at l_col_ptr[ks+d]+q-d.
            for d in 0..kw {
                let col_base = sym.l_col_ptr[ks + d] - d;
                // Only pairs with q >= pj contribute to panel column j;
                // both are ascending, so the start index only moves forward.
                let mut idx0 = 0;
                for pj in p_lo..p_hi {
                    let jcol = k_row[pj] - s; // column within the panel
                    while idx0 < pair_k.len() && pair_k[idx0] < pj {
                        idx0 += 1;
                    }
                    let u = l_values[col_base + pj];
                    if u == 0.0 {
                        continue;
                    }
                    for idx in idx0..pair_k.len() {
                        panel[jcol * rows + pair_j[idx]] -= l_values[col_base + pair_k[idx]] * u;
                    }
                }
            }
        }

        // Dense partial Cholesky of the panel: factor the leading width×width
        // block, then scale the subdiagonal block (right-looking, in cache).
        for d in 0..width {
            let diag = panel[d * rows + d];
            // `!(diag > t)` (not `diag <= t`) so a NaN pivot — where every
            // comparison is false — is also rejected instead of producing a
            // NaN-filled factor reported as success.
            if !(diag > strict_threshold) {
                return None;
            }
            let l = diag.sqrt();
            panel[d * rows + d] = l;
            for p in (d + 1)..rows {
                panel[d * rows + p] /= l;
            }
            for d2 in (d + 1)..width {
                let f = panel[d * rows + d2]; // L[s+d2, s+d]
                if f == 0.0 {
                    continue;
                }
                for p in d2..rows {
                    panel[d2 * rows + p] -= f * panel[d * rows + p];
                }
            }
        }

        // Scatter back into CSC storage: column s+d keeps panel rows d..rows.
        for d in 0..width {
            let j = s + d;
            let dst = sym.l_col_ptr[j];
            for q in 0..(rows - d) {
                l_values[dst + q] = panel[d * rows + d + q];
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
    fn test_nan_diagonal_is_rejected() {
        // A NaN pivot fails every `diag <= threshold` comparison, so the guard
        // must be written as `!(diag > threshold)` to catch it.
        let a = make_spd(&[
            f64::NAN, 2.0, 1.0,
            2.0, 5.0, 3.0,
            1.0, 3.0, 6.0,
        ], 3);
        assert!(sparse_cholesky_solve_full(&a, &[1.0, 2.0, 3.0]).is_none());
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


    /// Reusing a symbolic factorization across a CHANGED PATTERN must fail loudly.
    ///
    /// This is the contract the permutation map turned from soft into hard. The
    /// `permute_symmetric` it replaced rebuilt the permuted matrix from whatever
    /// was passed in; `pa_src` holds positions into the values array of the
    /// matrix the symbolic was built from, so reading it against a different
    /// pattern gathers neighbouring entries and returns a factorization of a
    /// matrix nobody assembled.
    ///
    /// It is reachable: both P-Delta loops cache one symbolic and rebuild the
    /// CSC every iteration through `from_dense_symmetric`, whose `|v| > 1e-30`
    /// filter makes the pattern depend on the values.
    ///
    /// Two shapes, because the cheap guard only catches one of them.
    #[test]
    #[should_panic(expected = "sparsity pattern differs")]
    fn numeric_cholesky_rejects_a_shorter_pattern() {
        // 3x3 tridiagonal, then the same matrix with the (2,1) coupling gone.
        let a = CscMatrix::from_triplets(
            3,
            &[0, 1, 1, 2, 2],
            &[0, 0, 1, 1, 2],
            &[10.0, 1.0, 8.0, 2.0, 6.0],
        );
        let thinner = CscMatrix::from_triplets(
            3,
            &[0, 1, 1, 2],
            &[0, 0, 1, 2],
            &[10.0, 1.0, 8.0, 6.0],
        );
        let sym = Rc::new(symbolic_cholesky(&a));
        let _ = numeric_cholesky(&sym, &thinner);
    }

    /// The same nonzero COUNT with a different pattern is the case a length
    /// check cannot see, and the one P-Delta can actually produce: one entry
    /// drops below the threshold while another rises above it.
    #[test]
    #[should_panic(expected = "sparsity pattern differs")]
    fn numeric_cholesky_rejects_an_equal_length_but_shifted_pattern() {
        // Both have five entries; the off-diagonal moved from (2,1) to (2,0).
        let a = CscMatrix::from_triplets(
            3,
            &[0, 1, 1, 2, 2],
            &[0, 0, 1, 1, 2],
            &[10.0, 1.0, 8.0, 2.0, 6.0],
        );
        let shifted = CscMatrix::from_triplets(
            3,
            &[0, 1, 2, 1, 2],
            &[0, 0, 0, 1, 2],
            &[10.0, 1.0, 2.0, 8.0, 6.0],
        );
        assert_eq!(a.nnz(), shifted.nnz(), "the point of this case is equal nnz");
        let sym = Rc::new(symbolic_cholesky(&a));
        let _ = numeric_cholesky(&sym, &shifted);
    }

    /// And the legitimate use keeps working: same pattern, different values.
    /// This is what P-Delta and the regularization retry actually do, and it is
    /// the case the guard must NOT reject.
    #[test]
    fn numeric_cholesky_accepts_new_values_on_the_same_pattern() {
        let pattern_rows = [0usize, 1, 1, 2, 2];
        let pattern_cols = [0usize, 0, 1, 1, 2];
        let a1 = CscMatrix::from_triplets(3, &pattern_rows, &pattern_cols,
            &[10.0, 1.0, 8.0, 2.0, 6.0]);
        let a2 = CscMatrix::from_triplets(3, &pattern_rows, &pattern_cols,
            &[20.0, 3.0, 15.0, 4.0, 12.0]);

        let sym = Rc::new(symbolic_cholesky(&a1));
        let b = vec![1.0, 2.0, 3.0];
        for a in [&a1, &a2] {
            let num = numeric_cholesky(&sym, a).expect("SPD matrix should factor");
            let x = sparse_cholesky_solve(&num, &b);
            let ax = a.sym_mat_vec(&x);
            for i in 0..3 {
                assert!((ax[i] - b[i]).abs() < 1e-10, "A*x != b at row {i}");
            }
        }
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

    /// Reference implementation of the symbolic factorization: direct
    /// left-looking merge of every column k with L[j,k] != 0 (O(nnz(L)²)).
    /// Kept only to pin the elimination-tree construction in
    /// `symbolic_cholesky_with_perm` to the exact same pattern and tree.
    fn symbolic_reference(a: &CscMatrix, perm: &[usize]) -> (Vec<usize>, Vec<usize>, Vec<isize>) {
        let n = a.n;
        let pa = a.permute_symmetric(perm);

        let mut l_row_idx_build: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut row_to_cols: Vec<Vec<usize>> = vec![Vec::new(); n];

        for j in 0..n {
            let mut col_set = vec![j];
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
        let mut l_col_ptr = vec![0usize; n + 1];
        let mut l_row_idx = Vec::new();
        for j in 0..n {
            l_col_ptr[j] = l_row_idx.len();
            for &row in &l_row_idx_build[j] {
                if row > j && parent[j] == -1 {
                    parent[j] = row as isize;
                }
                l_row_idx.push(row);
            }
        }
        l_col_ptr[n] = l_row_idx.len();
        (l_col_ptr, l_row_idx, parent)
    }

    fn assert_matches_reference(a: &CscMatrix, perm: &[usize], ctx: &str) {
        let sym = symbolic_cholesky_with_perm(a, perm);
        let (ref_ptr, ref_idx, ref_parent) = symbolic_reference(a, perm);
        assert_eq!(sym.l_col_ptr, ref_ptr, "{ctx}: l_col_ptr differs");
        assert_eq!(sym.l_row_idx, ref_idx, "{ctx}: l_row_idx differs");
        assert_eq!(sym.parent, ref_parent, "{ctx}: etree differs");
        assert_eq!(sym.l_nnz, ref_idx.len(), "{ctx}: l_nnz differs");
    }

    #[test]
    fn test_symbolic_etree_matches_reference() {
        // Identity permutation on assorted structures: dense-ish, banded,
        // arrowhead, and a graph with disconnected components.
        let dense = make_spd(&[
            4.0, 2.0, 1.0,
            2.0, 5.0, 3.0,
            1.0, 3.0, 6.0,
        ], 3);
        assert_matches_reference(&dense, &[0, 1, 2], "dense 3x3 identity");

        // Arrowhead: row/col 0 connected to all — maximal fill ordering.
        let n = 6;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            rows.push(i); cols.push(i); vals.push(10.0);
            if i > 0 {
                rows.push(i); cols.push(0); vals.push(1.0);
            }
        }
        let arrow = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        assert_matches_reference(&arrow, &[0, 1, 2, 3, 4, 5], "arrowhead identity");
        assert_matches_reference(&arrow, &[5, 4, 3, 2, 1, 0], "arrowhead reversed");

        // Disconnected: two independent tridiagonal chains.
        let n = 8;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            rows.push(i); cols.push(i); vals.push(4.0);
            let next = if i < 3 { Some(i + 1) } else if i == 4 || i == 5 || i == 6 { Some(i + 1) } else { None };
            if let Some(j) = next {
                if !(i == 3) {
                    rows.push(j); cols.push(i); vals.push(-1.0);
                }
            }
        }
        let disc = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        assert_matches_reference(&disc, &[0, 1, 2, 3, 4, 5, 6, 7], "disconnected chains");
    }

    #[test]
    fn test_symbolic_etree_matches_reference_on_fixtures() {
        // Real assembled stiffness matrices, with both orderings the solver
        // can pick. This is the equivalence the elimination-tree rewrite
        // must preserve bit-for-bit.
        use crate::solver::{assembly, dof::DofNumbering};
        use crate::types::SolverInput3D;

        let fixtures: [(&str, &str); 4] = [
            ("nave-industrial", include_str!("../../tests/fixtures/ex-3d-nave-industrial-input.json")),
            ("tower", include_str!("../../tests/fixtures/ex-3d-tower-input.json")),
            ("space-truss", include_str!("../../tests/fixtures/ex-3d-space-truss-input.json")),
            ("building-case1", include_str!("../../tests/fixtures/ex-3d-building-case1-input.json")),
        ];
        for (name, json) in fixtures {
            let input: SolverInput3D = serde_json::from_str(json).expect("parse fixture");
            let dof_num = DofNumbering::build_3d(&input);
            let asm = assembly::assemble_sparse_3d(&input, &dof_num, false);
            let k = &asm.k_ff;
            if k.n == 0 {
                continue;
            }
            let amd = amd_order(k.n, &k.col_ptr, &k.row_idx);
            assert_matches_reference(k, &amd, &format!("{name} amd"));
            let rcm = rcm_order(k.n, &k.col_ptr, &k.row_idx);
            assert_matches_reference(k, &rcm, &format!("{name} rcm"));
        }
    }

    /// Simplicial (column-by-column) numeric factorization: the algorithm the
    /// supernodal `numeric_cholesky` replaced. Kept only as a differential
    /// reference for the tests below.
    fn numeric_simplicial_reference(sym: &Rc<SymbolicCholesky>, a: &CscMatrix) -> Option<Vec<f64>> {
        let n = sym.n;
        let pa = a.permute_symmetric(&sym.perm);
        let mut l_values = vec![0.0f64; sym.l_nnz];
        let mut x = vec![0.0f64; n];
        let strict_threshold = 1e-15;

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
            for k in pa.col_ptr[j]..pa.col_ptr[j + 1] {
                x[pa.row_idx[k]] = pa.values[k];
            }
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
            if !(diag > strict_threshold) {
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
        Some(l_values)
    }

    /// Compare supernodal numeric against the simplicial reference.
    /// Not bit-for-bit (update order differs within panels), so use a
    /// tolerance scaled by the largest |L| entry.
    fn assert_numeric_matches_reference(a: &CscMatrix, ordering: CholOrdering, ctx: &str) {
        let sym = Rc::new(symbolic_cholesky_with(a, ordering));
        let num = numeric_cholesky(&sym, a).unwrap_or_else(|| panic!("{ctx}: supernodal failed"));
        let reference =
            numeric_simplicial_reference(&sym, a).unwrap_or_else(|| panic!("{ctx}: simplicial failed"));
        assert_eq!(num.l_values.len(), reference.len(), "{ctx}: length");
        let scale = reference.iter().fold(0.0f64, |m, &v| m.max(v.abs()));
        for (idx, (&got, &want)) in num.l_values.iter().zip(&reference).enumerate() {
            let tol = 1e-9 * scale.max(1.0);
            assert!(
                (got - want).abs() <= tol,
                "{ctx}: l_values[{idx}] = {got:.6e}, reference {want:.6e} (scale {scale:.3e})"
            );
        }
    }

    #[test]
    fn test_numeric_supernodal_matches_simplicial() {
        // Dense-ish SPD (forces multi-column supernodes after ordering).
        let n = 12;
        let mut dense = vec![0.0; n * n];
        let seed: Vec<f64> = (0..n * n).map(|i| ((i * 7 + 3) % 17) as f64 / 17.0 - 0.5).collect();
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
        let a = make_spd(&dense, n);
        assert_numeric_matches_reference(&a, CholOrdering::Amd, "dense-ish 12 amd");
        assert_numeric_matches_reference(&a, CholOrdering::Rcm, "dense-ish 12 rcm");

        // Banded chain (supernodes of size 1 — the trivial case must work too).
        let n = 30;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
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
        assert_numeric_matches_reference(&a, CholOrdering::Amd, "chain amd");

        // Arrowhead (one big dense root supernode under identity ordering).
        let n = 10;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(10.0);
            if i > 0 {
                rows.push(i);
                cols.push(0);
                vals.push(1.0);
            }
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        assert_numeric_matches_reference(&a, CholOrdering::Amd, "arrowhead amd");
        assert_numeric_matches_reference(&a, CholOrdering::Rcm, "arrowhead rcm");
    }

    #[test]
    fn test_numeric_supernodal_matches_simplicial_on_fixtures() {
        use crate::solver::{assembly, dof::DofNumbering};
        use crate::types::SolverInput3D;

        let fixtures: [(&str, &str); 4] = [
            ("nave-industrial", include_str!("../../tests/fixtures/ex-3d-nave-industrial-input.json")),
            ("tower", include_str!("../../tests/fixtures/ex-3d-tower-input.json")),
            ("space-truss", include_str!("../../tests/fixtures/ex-3d-space-truss-input.json")),
            ("building-case1", include_str!("../../tests/fixtures/ex-3d-building-case1-input.json")),
        ];
        for (name, json) in fixtures {
            let input: SolverInput3D = serde_json::from_str(json).expect("parse fixture");
            let dof_num = DofNumbering::build_3d(&input);
            let asm = assembly::assemble_sparse_3d(&input, &dof_num, false);
            let k = &asm.k_ff;
            if k.n == 0 {
                continue;
            }
            assert_numeric_matches_reference(k, CholOrdering::Amd, &format!("{name} amd"));
            assert_numeric_matches_reference(k, CholOrdering::Rcm, &format!("{name} rcm"));
        }
    }
}
