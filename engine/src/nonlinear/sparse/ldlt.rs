//! LDLᵀ without pivoting: simplicial, up-looking (Davis's LDL), on an AMD
//! ordering.
//!
//! Row k of L is a sparse triangular solve with the already-factored rows,
//! whose pattern is the set of etree paths from the nonzeros of column k
//! of the permuted upper triangle. Only entries with a permuted row index
//! ≤ k are read: the upper triangle of P·A·Pᵀ.

use super::pattern::{SparseMatrix, SparsePattern};
use crate::linalg::amd::amd_order;
use std::rc::Rc;

const NONE: usize = usize::MAX;

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
}

impl LdltSymbolic {
    pub fn l_nnz(&self) -> usize {
        self.lp[self.n]
    }
}

/// Symbolic factorization on an AMD ordering of the pattern.
pub fn ldlt_symbolic(p: &SparsePattern) -> LdltSymbolic {
    let (cp, ri) = p.lower();
    let perm = amd_order(p.n, &cp, &ri);
    ldlt_symbolic_with_perm(p, &perm)
}

/// Symbolic factorization on a given ordering, `perm[new] = old`.
pub fn ldlt_symbolic_with_perm(p: &SparsePattern, perm: &[usize]) -> LdltSymbolic {
    let n = p.n;
    assert_eq!(perm.len(), n, "the permutation must have one entry per row");
    let mut iperm = vec![NONE; n];
    for (new, &old) in perm.iter().enumerate() {
        assert!(old < n && iperm[old] == NONE, "not a permutation");
        iperm[old] = new;
    }
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
    let mut lp = vec![0usize; n + 1];
    for k in 0..n {
        lp[k + 1] = lp[k] + lnz[k];
    }
    LdltSymbolic { n, perm: perm.to_vec(), iperm, parent, lp, pattern: Rc::new(p.clone()) }
}

/// A factorization P·A·Pᵀ = L·D·Lᵀ.
#[derive(Debug, Clone)]
pub struct LdltFactor {
    sym: Rc<LdltSymbolic>,
    li: Vec<usize>,
    lx: Vec<f64>,
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

/// Numeric factorization. A pivot |d_k| ≤ `pivot_tol`·max|a_ii| (or
/// ≤ `pivot_tol`·‖A‖∞ when every diagonal entry vanishes) is refused.
pub fn ldlt_numeric(sym: &Rc<LdltSymbolic>, a: &SparseMatrix, pivot_tol: f64) -> Result<LdltFactor, LdltError> {
    let p = &*a.pattern;
    let n = sym.n;
    assert!(
        Rc::ptr_eq(&a.pattern, &sym.pattern) || same_pattern(p, &sym.pattern),
        "the matrix is not on the pattern of the symbolic factorization",
    );

    let mut scale = 0.0f64;
    for j in 0..n {
        if let Some(q) = p.position(j, j) {
            scale = scale.max(a.values[q].abs());
        }
    }
    if scale == 0.0 {
        scale = a.max_abs_row_sum();
    }
    let threshold = pivot_tol * scale;

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
    Ok(LdltFactor { sym: Rc::clone(sym), li, lx, d })
}

impl LdltFactor {
    /// x = A⁻¹·b.
    pub fn solve(&self, b: &[f64]) -> Vec<f64> {
        let s = &*self.sym;
        let n = s.n;
        let mut x: Vec<f64> = s.perm.iter().map(|&old| b[old]).collect();
        for j in 0..n {
            let xj = x[j];
            for q in s.lp[j]..s.lp[j + 1] {
                x[self.li[q]] -= self.lx[q] * xj;
            }
        }
        for (xj, dj) in x.iter_mut().zip(&self.d) {
            *xj /= dj;
        }
        for j in (0..n).rev() {
            let mut xj = x[j];
            for q in s.lp[j]..s.lp[j + 1] {
                xj -= self.lx[q] * x[self.li[q]];
            }
            x[j] = xj;
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
