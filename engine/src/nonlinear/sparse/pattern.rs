//! The structure of a sparse square matrix, and values on it.

use std::rc::Rc;

/// Structure of a square n×n matrix in CSC, both triangles stored, rows
/// strictly increasing in each column, the diagonal always present.
///
/// Full storage, not one triangle: the LU fallback needs both, and a
/// tangent that is not symmetric fits on the same pattern.
#[derive(Debug, Clone)]
pub struct SparsePattern {
    pub n: usize,
    pub col_ptr: Vec<usize>,
    pub row_idx: Vec<usize>,
}

impl SparsePattern {
    /// From element connectivity: the indices of each group are all coupled
    /// to each other (an element's DOFs). Indices ≥ `n` are dropped (a
    /// restrained DOF the caller numbers past the free ones); repeats are
    /// merged.
    pub fn from_groups(n: usize, groups: &[Vec<usize>]) -> Self {
        let mut cols: Vec<Vec<usize>> = (0..n).map(|j| vec![j]).collect();
        let mut g = Vec::new();
        for group in groups {
            g.clear();
            g.extend(group.iter().copied().filter(|&i| i < n));
            g.sort_unstable();
            g.dedup();
            for &j in &g {
                cols[j].extend(g.iter().copied());
            }
        }
        let mut col_ptr = Vec::with_capacity(n + 1);
        let mut row_idx = Vec::new();
        col_ptr.push(0);
        for mut c in cols {
            c.sort_unstable();
            c.dedup();
            row_idx.extend(c);
            col_ptr.push(row_idx.len());
        }
        SparsePattern { n, col_ptr, row_idx }
    }

    /// Position of (row, col) in `row_idx` and in a matrix's `values`.
    pub fn position(&self, row: usize, col: usize) -> Option<usize> {
        if row >= self.n || col >= self.n {
            return None;
        }
        let (a, b) = (self.col_ptr[col], self.col_ptr[col + 1]);
        self.row_idx[a..b].binary_search(&row).ok().map(|k| a + k)
    }

    pub fn nnz(&self) -> usize {
        self.row_idx.len()
    }

    /// The lower triangle (diagonal included) in CSC, as `linalg::amd` takes it.
    pub(crate) fn lower(&self) -> (Vec<usize>, Vec<usize>) {
        let mut col_ptr = Vec::with_capacity(self.n + 1);
        let mut row_idx = Vec::new();
        col_ptr.push(0);
        for j in 0..self.n {
            for &i in &self.row_idx[self.col_ptr[j]..self.col_ptr[j + 1]] {
                if i >= j {
                    row_idx.push(i);
                }
            }
            col_ptr.push(row_idx.len());
        }
        (col_ptr, row_idx)
    }
}

/// Values on a [`SparsePattern`], in the order of its `row_idx`.
#[derive(Debug, Clone)]
pub struct SparseMatrix {
    pub pattern: Rc<SparsePattern>,
    pub values: Vec<f64>,
}

impl SparseMatrix {
    pub fn zeros(p: Rc<SparsePattern>) -> Self {
        let nnz = p.nnz();
        SparseMatrix { pattern: p, values: vec![0.0; nnz] }
    }

    /// y = A·x.
    pub fn mat_vec(&self, x: &[f64]) -> Vec<f64> {
        let p = &self.pattern;
        let mut y = vec![0.0; p.n];
        for (j, &xj) in x.iter().enumerate().take(p.n) {
            for k in p.col_ptr[j]..p.col_ptr[j + 1] {
                y[p.row_idx[k]] += self.values[k] * xj;
            }
        }
        y
    }

    /// |a_ij − a_ji| ≤ `rel_tol`·max|a| for every stored pair.
    pub fn is_symmetric(&self, rel_tol: f64) -> bool {
        let p = &self.pattern;
        let max = self.values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let tol = rel_tol * max;
        for j in 0..p.n {
            for k in p.col_ptr[j]..p.col_ptr[j + 1] {
                let i = p.row_idx[k];
                if i <= j {
                    continue;
                }
                let t = p.position(j, i).map_or(0.0, |q| self.values[q]);
                if (self.values[k] - t).abs() > tol {
                    return false;
                }
            }
        }
        true
    }

    /// ‖A‖∞, the largest absolute row sum.
    pub fn max_abs_row_sum(&self) -> f64 {
        let p = &self.pattern;
        let mut rows = vec![0.0; p.n];
        for (k, &i) in p.row_idx.iter().enumerate() {
            rows[i] += self.values[k].abs();
        }
        rows.into_iter().fold(0.0, f64::max)
    }

    /// Dense, row-major. For tests and small checks only.
    pub fn to_dense(&self) -> Vec<f64> {
        let p = &self.pattern;
        let mut d = vec![0.0; p.n * p.n];
        for j in 0..p.n {
            for k in p.col_ptr[j]..p.col_ptr[j + 1] {
                d[p.row_idx[k] * p.n + j] = self.values[k];
            }
        }
        d
    }
}
