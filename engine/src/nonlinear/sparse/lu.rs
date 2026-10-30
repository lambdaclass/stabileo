//! LU with threshold partial pivoting: left-looking, Gilbert–Peierls
//! (Davis, *Direct Methods for Sparse Linear Systems*, 2006, `cs_lu`).
//!
//! Column k of L and U is one sparse triangular solve L·x = A(:, q[k]) with
//! the columns already factored. Its nonzero pattern is found first, by a
//! depth-first search in the graph of L from the nonzeros of A(:, q[k]),
//! so the work is proportional to the flops and not to n. P·A·Q = L·U, with
//! the row permutation chosen by pivoting and Q given by the caller.

use super::pattern::SparseMatrix;

const NONE: usize = usize::MAX;

/// A factorization P·A·Q = L·U. L is unit lower triangular with its
/// diagonal stored first in each column; U stores its diagonal last.
#[derive(Debug, Clone)]
pub struct LuFactor {
    n: usize,
    lp: Vec<usize>,
    li: Vec<usize>,
    lx: Vec<f64>,
    up: Vec<usize>,
    ui: Vec<usize>,
    ux: Vec<f64>,
    /// pinv[old row] = pivot position.
    pinv: Vec<usize>,
    /// q[new column] = old column.
    q: Vec<usize>,
}

/// Depth-first search from node `j` in the graph of the L columns built so
/// far (a row is a node; a pivotal row's edges are its L column). Pushes the
/// nodes it finishes onto `xi[..top]` from the top down, so `xi[top..n]`
/// ends in topological order. Pivotal rows map to finished columns only,
/// and `lp` already holds the start of the current one, so `lp[j + 1]` is
/// the end of every column the search can enter.
#[allow(clippy::too_many_arguments)]
fn dfs(j: usize, lp: &[usize], li: &[usize], pinv: &[usize], mut top: usize, xi: &mut [usize], pstack: &mut [usize], mark: &mut [bool]) -> usize {
    let mut head: isize = 0;
    let n = pinv.len();
    xi[n] = j; // the recursion stack lives in xi[n..2n]
    while head >= 0 {
        let h = head as usize;
        let j = xi[n + h];
        let jnew = pinv[j];
        if !mark[j] {
            mark[j] = true;
            pstack[h] = if jnew == NONE { 0 } else { lp[jnew] };
        }
        let mut done = true;
        let end = if jnew == NONE { 0 } else { lp[jnew + 1] };
        let mut p = pstack[h];
        while p < end {
            let i = li[p];
            if !mark[i] {
                pstack[h] = p;
                head += 1;
                xi[n + head as usize] = i;
                done = false;
                break;
            }
            p += 1;
        }
        if done {
            head -= 1;
            top -= 1;
            xi[top] = j;
        }
    }
    top
}

/// Numeric factorization. `col_perm[new] = old` orders the columns (an AMD
/// ordering of the symmetric pattern keeps the fill low). `pivot_threshold`
/// in (0, 1]: the diagonal is kept as pivot when it is at least that
/// fraction of the largest candidate; 1.0 is strict partial pivoting.
pub fn lu_numeric(a: &SparseMatrix, col_perm: &[usize], pivot_threshold: f64) -> Result<LuFactor, String> {
    let p = &*a.pattern;
    let n = p.n;
    if col_perm.len() != n {
        return Err("the column permutation must have one entry per column".into());
    }
    let tiny = 1e-14 * a.max_abs_row_sum();
    let mut lp = Vec::with_capacity(n + 1);
    let mut up = Vec::with_capacity(n + 1);
    let mut li = Vec::with_capacity(4 * p.nnz());
    let mut lx = Vec::with_capacity(4 * p.nnz());
    let mut ui = Vec::with_capacity(4 * p.nnz());
    let mut ux = Vec::with_capacity(4 * p.nnz());
    let mut pinv = vec![NONE; n];
    let mut x = vec![0.0; n];
    let mut xi = vec![0usize; 2 * n];
    let mut pstack = vec![0usize; n];
    let mut mark = vec![false; n];

    for (k, &col) in col_perm.iter().enumerate() {
        lp.push(li.len());
        up.push(ui.len());
        if col >= n {
            return Err("the column permutation is out of range".into());
        }
        let (c0, c1) = (p.col_ptr[col], p.col_ptr[col + 1]);

        // Pattern of x = L⁻¹·A(:, col): everything reachable from A's nonzeros.
        let mut top = n;
        for q in c0..c1 {
            let i = p.row_idx[q];
            if !mark[i] {
                top = dfs(i, &lp, &li, &pinv, top, &mut xi, &mut pstack, &mut mark);
            }
        }
        for &i in &xi[top..n] {
            mark[i] = false;
        }

        // Sparse triangular solve, in topological order.
        for &i in &xi[top..n] {
            x[i] = 0.0;
        }
        for q in c0..c1 {
            x[p.row_idx[q]] = a.values[q];
        }
        for &j in &xi[top..n] {
            let jcol = pinv[j];
            if jcol == NONE {
                continue;
            }
            // L's diagonal is 1 and stored first.
            let xj = x[j];
            for q in lp[jcol] + 1..lp[jcol + 1] {
                x[li[q]] -= lx[q] * xj;
            }
        }

        // Pivot: the largest candidate among rows not yet pivotal, or the
        // diagonal if it is within the threshold of it.
        let mut ipiv = NONE;
        let mut amax = -1.0f64;
        for &i in &xi[top..n] {
            if pinv[i] == NONE {
                let t = x[i].abs();
                if t > amax {
                    amax = t;
                    ipiv = i;
                }
            } else {
                ui.push(pinv[i]);
                ux.push(x[i]);
            }
        }
        if ipiv == NONE || amax <= tiny || !amax.is_finite() {
            return Err(format!("singular matrix: no usable pivot in column {col}"));
        }
        if pinv[col] == NONE && x[col].abs() >= amax * pivot_threshold {
            ipiv = col;
        }
        let pivot = x[ipiv];
        ui.push(k);
        ux.push(pivot);
        pinv[ipiv] = k;
        li.push(ipiv);
        lx.push(1.0);
        for &i in &xi[top..n] {
            if pinv[i] == NONE {
                li.push(i);
                lx.push(x[i] / pivot);
            }
            x[i] = 0.0;
        }
    }
    lp.push(li.len());
    up.push(ui.len());
    // L's rows in pivot order.
    for r in li.iter_mut() {
        *r = pinv[*r];
    }
    Ok(LuFactor { n, lp, li, lx, up, ui, ux, pinv, q: col_perm.to_vec() })
}

fn permutation_parity(perm: &[usize]) -> i8 {
    let mut seen = vec![false; perm.len()];
    let mut sign = 1i8;
    for start in 0..perm.len() {
        let mut len = 0;
        let mut i = start;
        while !seen[i] {
            seen[i] = true;
            i = perm[i];
            len += 1;
        }
        if len > 0 && len % 2 == 0 {
            sign = -sign;
        }
    }
    sign
}

impl LuFactor {
    /// x = A⁻¹·b.
    pub fn solve(&self, b: &[f64]) -> Vec<f64> {
        let n = self.n;
        let mut x = vec![0.0; n];
        for i in 0..n {
            x[self.pinv[i]] = b[i];
        }
        for j in 0..n {
            let xj = x[j];
            for q in self.lp[j] + 1..self.lp[j + 1] {
                x[self.li[q]] -= self.lx[q] * xj;
            }
        }
        for j in (0..n).rev() {
            let last = self.up[j + 1] - 1;
            x[j] /= self.ux[last];
            let xj = x[j];
            for q in self.up[j]..last {
                x[self.ui[q]] -= self.ux[q] * xj;
            }
        }
        let mut out = vec![0.0; n];
        for k in 0..n {
            out[self.q[k]] = x[k];
        }
        out
    }

    /// Sign of det(A): det(U), times the parities of P and Q.
    pub fn det_sign(&self) -> i8 {
        let mut sign = permutation_parity(&self.pinv) * permutation_parity(&self.q);
        for j in 0..self.n {
            if self.ux[self.up[j + 1] - 1] < 0.0 {
                sign = -sign;
            }
        }
        sign
    }
}
