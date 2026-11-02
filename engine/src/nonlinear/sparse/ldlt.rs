//! LDLᵀ without pivoting on an AMD ordering: supernodal for the sizes that
//! matter, simplicial for tiny systems.
//!
//! **Simplicial** (Davis's LDL, up-looking): row k of L is a sparse
//! triangular solve with the already-factored rows, whose pattern is the
//! set of etree paths from the nonzeros of column k of the permuted upper
//! triangle.
//!
//! **Supernodal** (left-looking): consecutive columns with nested structure
//! (fundamental supernodes; the AMD ordering is postordered so that they are
//! contiguous) share one dense trapezoidal panel. Each panel gathers its
//! entries of A, subtracts the update L_t·D_t·L_tᵀ of every earlier panel t
//! that reaches it, and is factored densely (LDLᵀ of the diagonal block,
//! then the rows below). The flops are the same; the work is done on dense
//! blocks instead of one scattered entry at a time, which is what makes 3D
//! models fast. Same pivots in the same order, same refusal rule, same
//! inertia.
//!
//! Both read only the entries with a permuted row index ≤ k in column k:
//! the upper triangle of P·A·Pᵀ.

use super::pattern::{SparseMatrix, SparsePattern};
use super::supervariables::{compressed_amd, supervariables};
use crate::linalg::amd::amd_order;
use std::rc::Rc;

const NONE: usize = usize::MAX;

/// Below this order the simplicial factorization is used: no panel to
/// amortize.
const SUPERNODAL_MIN_N: usize = 32;

/// The supernode partition and the panels' structure.
#[derive(Debug, Clone)]
struct Supernodes {
    /// First column of each supernode; `start[ns] = n`.
    start: Vec<usize>,
    /// Row structure of each panel: its own columns, then the rows below,
    /// ascending. `rows[rows_ptr[s]..rows_ptr[s + 1]]`.
    rows_ptr: Vec<usize>,
    rows: Vec<usize>,
    /// Offset of each panel (column-major, rows × width) in the values.
    val_ptr: Vec<usize>,
    /// The earlier supernodes that update each one, ascending.
    upd_ptr: Vec<usize>,
    upd: Vec<usize>,
    /// The entries of A by column of the permuted lower triangle: row and
    /// index into the matrix's values.
    a_ptr: Vec<usize>,
    a_row: Vec<usize>,
    a_src: Vec<usize>,
}

/// The structure of L for every matrix on one pattern and ordering.
#[derive(Debug, Clone)]
pub struct LdltSymbolic {
    pub n: usize,
    /// `perm[new] = old`.
    pub perm: Vec<usize>,
    /// `iperm[old] = new`.
    pub iperm: Vec<usize>,
    /// Elimination tree: `parent[j]`, or `usize::MAX` for a root.
    pub parent: Vec<usize>,
    /// Column pointers of L (strictly lower part; the unit diagonal is implicit).
    pub lp: Vec<usize>,
    /// The pattern it was computed for, so a matrix on another one is refused.
    pattern: Rc<SparsePattern>,
    supernodes: Supernodes,
}

impl LdltSymbolic {
    pub fn l_nnz(&self) -> usize {
        self.lp[self.n]
    }

    /// Number of supernodes (panels); n / this is their mean width.
    #[doc(hidden)]
    pub fn supernode_count(&self) -> usize {
        self.supernodes.start.len() - 1
    }
}

fn check_perm(n: usize, perm: &[usize]) -> Vec<usize> {
    assert_eq!(perm.len(), n, "the permutation must have one entry per row");
    let mut iperm = vec![NONE; n];
    for (new, &old) in perm.iter().enumerate() {
        assert!(old < n && iperm[old] == NONE, "not a permutation");
        iperm[old] = new;
    }
    iperm
}

/// The elimination tree of P·A·Pᵀ (Liu's algorithm, with path compression).
fn etree(p: &SparsePattern, perm: &[usize], iperm: &[usize]) -> Vec<usize> {
    let n = p.n;
    let mut parent = vec![NONE; n];
    let mut ancestor = vec![NONE; n];
    for (k, &kk) in perm.iter().enumerate() {
        for q in p.col_ptr[kk]..p.col_ptr[kk + 1] {
            let mut i = iperm[p.row_idx[q]];
            while i != NONE && i < k {
                let next = ancestor[i];
                ancestor[i] = k;
                if next == NONE {
                    parent[i] = k;
                    break;
                }
                i = next;
            }
        }
    }
    parent
}

/// A postorder of the forest: children before their parent, subtrees
/// contiguous, children taken in ascending order.
fn postorder(parent: &[usize]) -> Vec<usize> {
    let n = parent.len();
    let mut head = vec![NONE; n];
    let mut next = vec![NONE; n];
    // Insert children in descending order so the lists come out ascending.
    for j in (0..n).rev() {
        if parent[j] != NONE {
            next[j] = head[parent[j]];
            head[parent[j]] = j;
        }
    }
    let mut post = Vec::with_capacity(n);
    let mut stack = Vec::new();
    for root in (0..n).filter(|&j| parent[j] == NONE) {
        stack.push(root);
        while let Some(&j) = stack.last() {
            let child = head[j];
            if child == NONE {
                stack.pop();
                post.push(j);
            } else {
                head[j] = next[child];
                stack.push(child);
            }
        }
    }
    post
}

fn plain_amd(p: &SparsePattern) -> Vec<usize> {
    let (cp, ri) = p.lower();
    amd_order(p.n, &cp, &ri)
}

/// Postorders the elimination tree of `order`: same fill, and supernodes
/// contiguous.
fn postordered(p: &SparsePattern, order: &[usize]) -> Vec<usize> {
    let iperm = check_perm(p.n, order);
    let parent = etree(p, order, &iperm);
    postorder(&parent).iter().map(|&k| order[k]).collect()
}

/// Symbolic factorization on a fill-reducing ordering of the pattern.
///
/// Variables with identical structure (a node's DOFs) are found first and
/// ordered as one: AMD on the quotient graph, one vertex per group, each
/// group's members consecutive. On the FE block matrices of the tests this
/// gives the same fill and the same supernodes as AMD on the full graph
/// (whose mass elimination already keeps a node's DOFs together), and the
/// ordering costs 5–13× less: AMD runs on a graph 3 or 6 times smaller. A
/// pattern with nothing to compress takes plain AMD. The result is
/// postordered.
pub fn ldlt_symbolic(p: &SparsePattern) -> LdltSymbolic {
    let sv = supervariables(p);
    let order = if sv.members.len() == p.n { plain_amd(p) } else { compressed_amd(p, &sv) };
    ldlt_symbolic_with_perm(p, &postordered(p, &order))
}

/// The symbolic factorization on plain AMD (postordered), without
/// supervariable compression: for comparisons.
#[doc(hidden)]
pub fn ldlt_symbolic_plain(p: &SparsePattern) -> LdltSymbolic {
    ldlt_symbolic_with_perm(p, &postordered(p, &plain_amd(p)))
}

/// The elimination tree and the column counts of L (strictly lower) for an
/// ordering.
fn column_counts(p: &SparsePattern, perm: &[usize], iperm: &[usize]) -> (Vec<usize>, Vec<usize>) {
    let n = p.n;
    let mut parent = vec![NONE; n];
    let mut flag = vec![NONE; n];
    let mut lnz = vec![0usize; n];
    for k in 0..n {
        flag[k] = k;
        let kk = perm[k];
        for q in p.col_ptr[kk]..p.col_ptr[kk + 1] {
            let mut i = iperm[p.row_idx[q]];
            if i < k {
                // Follow the etree from i up to the root of the current
                // subtree; each node visited gains a nonzero in row k.
                while flag[i] != k {
                    if parent[i] == NONE {
                        parent[i] = k;
                    }
                    lnz[i] += 1;
                    flag[i] = k;
                    i = parent[i];
                }
            }
        }
    }
    (parent, lnz)
}

/// Symbolic factorization on a given ordering, `perm[new] = old`.
pub fn ldlt_symbolic_with_perm(p: &SparsePattern, perm: &[usize]) -> LdltSymbolic {
    let n = p.n;
    let iperm = check_perm(n, perm);
    let (parent, lnz) = column_counts(p, perm, &iperm);
    let mut lp = vec![0usize; n + 1];
    for k in 0..n {
        lp[k + 1] = lp[k] + lnz[k];
    }
    let supernodes = supernodes(p, perm, &iperm, &parent, &lnz);
    LdltSymbolic { n, perm: perm.to_vec(), iperm, parent, lp, pattern: Rc::new(p.clone()), supernodes }
}

/// Whether a panel of `width` columns may carry `zeros` explicit zeros out
/// of `stored` entries: CHOLMOD's default relaxation (widths 4, 16, 48 and
/// zero fractions 0.8, 0.1, 0.05).
fn relax(width: usize, zeros: usize, stored: usize) -> bool {
    let frac = zeros as f64 / stored.max(1) as f64;
    width <= 4 || (width <= 16 && frac < 0.8) || (width <= 48 && frac < 0.1) || frac < 0.05
}

/// The supernode partition: fundamental supernodes (j and j+1 share one when
/// j+1 is j's parent and only child and column j's structure is column
/// j+1's plus j+1), then relaxed: a panel merges into the next when that is
/// its parent and the explicit zeros the merge stores are few (`relax`).
/// A merged panel's rows are its columns plus the rows below its last
/// column, which hold every other column's (a column's structure, past its
/// parent, is within its parent's).
fn partition(parent: &[usize], lnz: &[usize]) -> Vec<usize> {
    let n = parent.len();
    let mut children = vec![0usize; n];
    for &q in parent {
        if q != NONE {
            children[q] += 1;
        }
    }
    let mut fundamental = Vec::new();
    for j in 0..n {
        let joins = j > 0 && parent[j - 1] == j && children[j] == 1 && lnz[j - 1] == lnz[j] + 1;
        if !joins {
            fundamental.push(j);
        }
    }
    fundamental.push(n);
    // prefix[j] = Σ lnz[..j]: the true entries of a column range.
    let mut prefix = vec![0usize; n + 1];
    for j in 0..n {
        prefix[j + 1] = prefix[j] + lnz[j];
    }
    let stored = |f: usize, l: usize| -> usize {
        let w = l - f;
        w * (w - 1) / 2 + w * lnz[l - 1]
    };
    let mut start: Vec<usize> = Vec::new();
    for k in 0..fundamental.len() - 1 {
        let (f, l) = (fundamental[k], fundamental[k + 1]);
        if let Some(&g) = start.last() {
            // The group [g, f) is a child of this supernode when its last
            // column's parent is f; merged, it would be [g, l).
            if parent[f - 1] == f {
                let total = stored(g, l);
                let zeros = total - (prefix[l] - prefix[g]);
                if relax(l - g, zeros, total) {
                    continue;
                }
            }
        }
        start.push(f);
    }
    start.push(n);
    start
}

fn supernodes(p: &SparsePattern, perm: &[usize], iperm: &[usize], parent: &[usize], lnz: &[usize]) -> Supernodes {
    let n = p.n;
    let start = partition(parent, lnz);
    let ns = start.len() - 1;
    let mut col2sn = vec![0usize; n];
    for s in 0..ns {
        for c in &mut col2sn[start[s]..start[s + 1]] {
            *c = s;
        }
    }

    // Panel row structures: own columns, then the rows below the last
    // column, gathered by the same etree traversal as the symbolic count.
    let mut rows_ptr = vec![0usize; ns + 1];
    let mut val_ptr = vec![0usize; ns + 1];
    for s in 0..ns {
        let (f, l) = (start[s], start[s + 1]);
        let nr = (l - f) + lnz[l - 1];
        rows_ptr[s + 1] = rows_ptr[s] + nr;
        val_ptr[s + 1] = val_ptr[s] + nr * (l - f);
    }
    let mut rows = vec![0usize; rows_ptr[ns]];
    let mut fill = vec![0usize; ns];
    for s in 0..ns {
        let (f, l) = (start[s], start[s + 1]);
        for (r, j) in (f..l).enumerate() {
            rows[rows_ptr[s] + r] = j;
        }
        fill[s] = rows_ptr[s] + (l - f);
    }
    let mut flag = vec![NONE; n];
    for k in 0..n {
        flag[k] = k;
        let kk = perm[k];
        for q in p.col_ptr[kk]..p.col_ptr[kk + 1] {
            let mut i = iperm[p.row_idx[q]];
            if i < k {
                while flag[i] != k {
                    flag[i] = k;
                    let s = col2sn[i];
                    if i == start[s + 1] - 1 {
                        rows[fill[s]] = k;
                        fill[s] += 1;
                    }
                    i = parent[i];
                }
            }
        }
    }

    // Which earlier panels update each one: those with a row below their own
    // columns inside it.
    let mut lists: Vec<Vec<usize>> = vec![Vec::new(); ns];
    for t in 0..ns {
        let w = start[t + 1] - start[t];
        let mut last = NONE;
        for &r in &rows[rows_ptr[t] + w..rows_ptr[t + 1]] {
            let s = col2sn[r];
            if s != last {
                lists[s].push(t);
                last = s;
            }
        }
    }
    let mut upd_ptr = vec![0usize; ns + 1];
    let mut upd = Vec::new();
    for (s, list) in lists.iter().enumerate() {
        upd.extend_from_slice(list);
        upd_ptr[s + 1] = upd.len();
    }

    // A's entries by column of the permuted lower triangle, read from the
    // upper triangle as the simplicial path reads them: the lower entry
    // (i, j), i ≥ j, is the stored (perm[j], perm[i]).
    let mut a_ptr = vec![0usize; n + 1];
    for c in 0..n {
        let i = iperm[c];
        for &r in &p.row_idx[p.col_ptr[c]..p.col_ptr[c + 1]] {
            let j = iperm[r];
            if j <= i {
                a_ptr[j + 1] += 1;
            }
        }
    }
    for j in 0..n {
        a_ptr[j + 1] += a_ptr[j];
    }
    let mut a_row = vec![0usize; a_ptr[n]];
    let mut a_src = vec![0usize; a_ptr[n]];
    let mut next = a_ptr.clone();
    for c in 0..n {
        let i = iperm[c];
        for q in p.col_ptr[c]..p.col_ptr[c + 1] {
            let j = iperm[p.row_idx[q]];
            if j <= i {
                a_row[next[j]] = i;
                a_src[next[j]] = q;
                next[j] += 1;
            }
        }
    }

    Supernodes { start, rows_ptr, rows, val_ptr, upd_ptr, upd, a_ptr, a_row, a_src }
}

#[derive(Debug, Clone)]
enum Storage {
    /// Column j of L: rows `li[lp[j]..lp[j+1]]`, values `lx[..]`.
    Simplicial { li: Vec<usize>, lx: Vec<f64> },
    /// The panels, column-major, unit diagonal implicit.
    Supernodal { lx: Vec<f64> },
}

/// A factorization P·A·Pᵀ = L·D·Lᵀ.
#[derive(Debug, Clone)]
pub struct LdltFactor {
    sym: Rc<LdltSymbolic>,
    storage: Storage,
    d: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LdltError {
    /// The pivot of `column` (an index of the original matrix) is too small
    /// to divide by in this ordering.
    TinyPivot { column: usize, value: f64 },
}

fn same_pattern(a: &SparsePattern, b: &SparsePattern) -> bool {
    a.n == b.n && a.col_ptr == b.col_ptr && a.row_idx == b.row_idx
}

/// The refusal threshold: `pivot_tol`·max|a_ii|, or `pivot_tol`·‖A‖∞ when
/// every diagonal entry vanishes.
fn pivot_threshold(a: &SparseMatrix, pivot_tol: f64) -> f64 {
    let p = &*a.pattern;
    let mut scale = 0.0f64;
    for j in 0..p.n {
        if let Some(q) = p.position(j, j) {
            scale = scale.max(a.values[q].abs());
        }
    }
    if scale == 0.0 {
        scale = a.max_abs_row_sum();
    }
    pivot_tol * scale
}

fn check_matrix(sym: &LdltSymbolic, a: &SparseMatrix) {
    assert!(
        Rc::ptr_eq(&a.pattern, &sym.pattern) || same_pattern(&a.pattern, &sym.pattern),
        "the matrix is not on the pattern of the symbolic factorization",
    );
}

/// Numeric factorization. A pivot |d_k| ≤ `pivot_tol`·max|a_ii| (or
/// ≤ `pivot_tol`·‖A‖∞ when every diagonal entry vanishes) is refused, as is
/// a NaN or infinite one. Supernodal from `SUPERNODAL_MIN_N` unknowns on.
pub fn ldlt_numeric(sym: &Rc<LdltSymbolic>, a: &SparseMatrix, pivot_tol: f64) -> Result<LdltFactor, LdltError> {
    if sym.n >= SUPERNODAL_MIN_N {
        ldlt_numeric_supernodal(sym, a, pivot_tol)
    } else {
        ldlt_numeric_simplicial(sym, a, pivot_tol)
    }
}

/// The simplicial factorization, whatever the size (for tests and
/// comparisons; [`ldlt_numeric`] picks).
#[doc(hidden)]
pub fn ldlt_numeric_simplicial(sym: &Rc<LdltSymbolic>, a: &SparseMatrix, pivot_tol: f64) -> Result<LdltFactor, LdltError> {
    check_matrix(sym, a);
    let p = &*a.pattern;
    let n = sym.n;
    let threshold = pivot_threshold(a, pivot_tol);

    let l_nnz = sym.l_nnz();
    let mut li = vec![0usize; l_nnz];
    let mut lx = vec![0.0; l_nnz];
    let mut d = vec![0.0; n];
    let mut y = vec![0.0; n];
    let mut pattern = vec![0usize; n];
    let mut flag = vec![NONE; n];
    let mut lnz = vec![0usize; n];

    for k in 0..n {
        // Scatter column k of the permuted upper triangle into y, and
        // collect the nonzero pattern of row k of L in topological order.
        y[k] = 0.0;
        let mut top = n;
        flag[k] = k;
        let kk = sym.perm[k];
        for q in p.col_ptr[kk]..p.col_ptr[kk + 1] {
            let mut i = sym.iperm[p.row_idx[q]];
            if i <= k {
                y[i] += a.values[q];
                let mut len = 0;
                while flag[i] != k {
                    pattern[len] = i;
                    len += 1;
                    flag[i] = k;
                    i = sym.parent[i];
                }
                while len > 0 {
                    top -= 1;
                    len -= 1;
                    pattern[top] = pattern[len];
                }
            }
        }
        // Sparse triangular solve for row k of L, and the pivot d_k.
        d[k] = y[k];
        y[k] = 0.0;
        for &i in &pattern[top..n] {
            let yi = y[i];
            y[i] = 0.0;
            let p2 = sym.lp[i] + lnz[i];
            for q in sym.lp[i]..p2 {
                y[li[q]] -= lx[q] * yi;
            }
            let l_ki = yi / d[i];
            d[k] -= l_ki * yi;
            li[p2] = k;
            lx[p2] = l_ki;
            lnz[i] += 1;
        }
        if !d[k].is_finite() || d[k].abs() <= threshold {
            return Err(LdltError::TinyPivot { column: sym.perm[k], value: d[k] });
        }
    }
    Ok(LdltFactor { sym: Rc::clone(sym), storage: Storage::Simplicial { li, lx }, d })
}

/// The supernodal factorization, whatever the size (for tests and
/// comparisons; [`ldlt_numeric`] picks).
#[doc(hidden)]
pub fn ldlt_numeric_supernodal(sym: &Rc<LdltSymbolic>, a: &SparseMatrix, pivot_tol: f64) -> Result<LdltFactor, LdltError> {
    check_matrix(sym, a);
    let n = sym.n;
    let sn = &sym.supernodes;
    let ns = sn.start.len() - 1;
    let threshold = pivot_threshold(a, pivot_tol);

    let mut lx = vec![0.0; sn.val_ptr[ns]];
    let mut d = vec![0.0; n];
    // map[row] = position of `row` in the current panel's structure.
    let mut map = vec![NONE; n];
    let mut rel = Vec::new();
    let mut tmp = Vec::new();

    for s in 0..ns {
        let (f, l) = (sn.start[s], sn.start[s + 1]);
        let w = l - f;
        let rows = &sn.rows[sn.rows_ptr[s]..sn.rows_ptr[s + 1]];
        let nr = rows.len();
        let off = sn.val_ptr[s];
        for (r, &row) in rows.iter().enumerate() {
            map[row] = r;
        }
        let (done, panels) = lx.split_at_mut(off);
        let panel = &mut panels[..nr * w];

        // Gather A.
        for c in 0..w {
            let j = f + c;
            for e in sn.a_ptr[j]..sn.a_ptr[j + 1] {
                panel[c * nr + map[sn.a_row[e]]] += a.values[sn.a_src[e]];
            }
        }

        // Updates from every earlier panel that reaches this one:
        // panel(rows ≥ f, cols in [f, l)) −= L_t·D_t·L_tᵀ.
        for &t in &sn.upd[sn.upd_ptr[s]..sn.upd_ptr[s + 1]] {
            let (ft, lt) = (sn.start[t], sn.start[t + 1]);
            let wt = lt - ft;
            let rt = &sn.rows[sn.rows_ptr[t]..sn.rows_ptr[t + 1]];
            let nrt = rt.len();
            let pt = &done[sn.val_ptr[t]..sn.val_ptr[t] + nrt * wt];
            let a0 = wt + rt[wt..].partition_point(|&r| r < f);
            let b0 = a0 + rt[a0..].partition_point(|&r| r < l);
            let m = nrt - a0;
            rel.clear();
            rel.extend(rt[a0..].iter().map(|&r| map[r]));
            // Four target columns at a time: each column of L_t is read once
            // for all four (rows above a target column's own are computed
            // and not scattered).
            let k = b0 - a0;
            let mut i = 0;
            while i < k {
                let bs = (k - i).min(4);
                let len = m - i;
                tmp.clear();
                tmp.resize(4 * len, 0.0);
                {
                    let (t0, rest) = tmp.split_at_mut(len);
                    let (t1, rest) = rest.split_at_mut(len);
                    let (t2, t3) = rest.split_at_mut(len);
                    for c in 0..wt {
                        let col = &pt[c * nrt + a0 + i..c * nrt + nrt];
                        let dc = d[ft + c];
                        let wv = [
                            col[0] * dc,
                            if bs > 1 { col[1] * dc } else { 0.0 },
                            if bs > 2 { col[2] * dc } else { 0.0 },
                            if bs > 3 { col[3] * dc } else { 0.0 },
                        ];
                        if wv == [0.0; 4] {
                            continue;
                        }
                        for r in 0..len {
                            let x = col[r];
                            t0[r] += x * wv[0];
                            t1[r] += x * wv[1];
                            t2[r] += x * wv[2];
                            t3[r] += x * wv[3];
                        }
                    }
                }
                for q in 0..bs {
                    let cs = rt[a0 + i + q] - f;
                    let dest = &mut panel[cs * nr..cs * nr + nr];
                    for (&r, &v) in rel[i + q..].iter().zip(&tmp[q * len + q..(q + 1) * len]) {
                        dest[r] -= v;
                    }
                }
                i += bs;
            }
        }

        // Dense LDLᵀ of the panel, right-looking, no pivoting.
        for c in 0..w {
            let dk = panel[c * nr + c];
            if !dk.is_finite() || dk.abs() <= threshold {
                return Err(LdltError::TinyPivot { column: sym.perm[f + c], value: dk });
            }
            d[f + c] = dk;
            let (left, right) = panel.split_at_mut((c + 1) * nr);
            let lc = &mut left[c * nr..];
            for x in &mut lc[c + 1..nr] {
                *x /= dk;
            }
            for c2 in (c + 1)..w {
                let lv = lc[c2] * dk;
                if lv == 0.0 {
                    continue;
                }
                let dst = &mut right[(c2 - c - 1) * nr..(c2 - c) * nr];
                for (x, &lr) in dst[c2..nr].iter_mut().zip(&lc[c2..nr]) {
                    *x -= lr * lv;
                }
            }
        }

        for &row in rows {
            map[row] = NONE;
        }
    }
    Ok(LdltFactor { sym: Rc::clone(sym), storage: Storage::Supernodal { lx }, d })
}

impl LdltFactor {
    /// x = A⁻¹·b.
    pub fn solve(&self, b: &[f64]) -> Vec<f64> {
        let s = &*self.sym;
        let n = s.n;
        let mut x: Vec<f64> = s.perm.iter().map(|&old| b[old]).collect();
        match &self.storage {
            Storage::Simplicial { li, lx } => {
                for j in 0..n {
                    let xj = x[j];
                    for q in s.lp[j]..s.lp[j + 1] {
                        x[li[q]] -= lx[q] * xj;
                    }
                }
                for (xj, dj) in x.iter_mut().zip(&self.d) {
                    *xj /= dj;
                }
                for j in (0..n).rev() {
                    let mut xj = x[j];
                    for q in s.lp[j]..s.lp[j + 1] {
                        xj -= lx[q] * x[li[q]];
                    }
                    x[j] = xj;
                }
            }
            Storage::Supernodal { lx } => {
                let sn = &s.supernodes;
                let ns = sn.start.len() - 1;
                for t in 0..ns {
                    let (f, l) = (sn.start[t], sn.start[t + 1]);
                    let rows = &sn.rows[sn.rows_ptr[t]..sn.rows_ptr[t + 1]];
                    let nr = rows.len();
                    let p = &lx[sn.val_ptr[t]..];
                    for c in 0..(l - f) {
                        let xj = x[f + c];
                        if xj != 0.0 {
                            for (&row, &v) in rows[c + 1..].iter().zip(&p[c * nr + c + 1..c * nr + nr]) {
                                x[row] -= v * xj;
                            }
                        }
                    }
                }
                for (xj, dj) in x.iter_mut().zip(&self.d) {
                    *xj /= dj;
                }
                for t in (0..ns).rev() {
                    let (f, l) = (sn.start[t], sn.start[t + 1]);
                    let rows = &sn.rows[sn.rows_ptr[t]..sn.rows_ptr[t + 1]];
                    let nr = rows.len();
                    let p = &lx[sn.val_ptr[t]..];
                    for c in (0..(l - f)).rev() {
                        let mut xj = x[f + c];
                        for (&row, &v) in rows[c + 1..].iter().zip(&p[c * nr + c + 1..c * nr + nr]) {
                            xj -= v * x[row];
                        }
                        x[f + c] = xj;
                    }
                }
            }
        }
        let mut out = vec![0.0; n];
        for (new, &old) in s.perm.iter().enumerate() {
            out[old] = x[new];
        }
        out
    }

    /// (negative, zero, positive) pivots: the inertia of A.
    pub fn inertia(&self) -> (usize, usize, usize) {
        let mut c = (0, 0, 0);
        for &v in &self.d {
            if v < 0.0 {
                c.0 += 1;
            } else if v == 0.0 {
                c.1 += 1;
            } else {
                c.2 += 1;
            }
        }
        c
    }

    /// The pivots D, in the permuted order.
    pub fn pivots(&self) -> &[f64] {
        &self.d
    }
}
