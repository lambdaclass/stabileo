/// Simple sparse matrix in CSR (Compressed Sparse Row) format
/// Optimized for assembly and row-wise operations
#[derive(Debug, Clone)]
pub struct SparseMatrix {
    /// Number of rows
    pub rows: usize,
    /// Number of columns
    pub cols: usize,
    /// Row pointers (length = rows + 1)
    row_ptr: Vec<usize>,
    /// Column indices
    col_idx: Vec<usize>,
    /// Values
    values: Vec<f64>,
}

impl SparseMatrix {
    /// Create empty sparse matrix
    pub fn new(rows: usize, cols: usize) -> Self {
        Self {
            rows,
            cols,
            row_ptr: vec![0; rows + 1],
            col_idx: Vec::new(),
            values: Vec::new(),
        }
    }

    /// Create from dense matrix (for small matrices or testing)
    pub fn from_dense(dense: &[Vec<f64>]) -> Self {
        let rows = dense.len();
        let cols = if rows > 0 { dense[0].len() } else { 0 };

        let mut row_ptr = vec![0];
        let mut col_idx = Vec::new();
        let mut values = Vec::new();

        for row in dense {
            for (j, &val) in row.iter().enumerate() {
                if val.abs() > 1e-14 {
                    col_idx.push(j);
                    values.push(val);
                }
            }
            row_ptr.push(col_idx.len());
        }

        Self {
            rows,
            cols,
            row_ptr,
            col_idx,
            values,
        }
    }

    /// Create from COO (Coordinate) format triplets
    /// Automatically sums duplicates
    pub fn from_triplets(rows: usize, cols: usize, triplets: &[(usize, usize, f64)]) -> Self {
        // Sort by (row, col)
        let mut sorted: Vec<_> = triplets.iter().cloned().collect();
        sorted.sort_by(|a, b| {
            if a.0 != b.0 {
                a.0.cmp(&b.0)
            } else {
                a.1.cmp(&b.1)
            }
        });

        let mut row_ptr = vec![0];
        let mut col_idx = Vec::new();
        let mut values = Vec::new();

        let mut current_row = 0;
        let mut last_col: Option<usize> = None;

        for (r, c, v) in sorted {
            // Fill in empty rows
            while current_row < r {
                row_ptr.push(col_idx.len());
                current_row += 1;
            }

            // Sum duplicates
            if last_col == Some(c) && !values.is_empty() {
                *values.last_mut().unwrap() += v;
            } else {
                col_idx.push(c);
                values.push(v);
                last_col = Some(c);
            }
        }

        // Fill remaining rows
        while current_row < rows {
            row_ptr.push(col_idx.len());
            current_row += 1;
        }
        row_ptr.push(col_idx.len());

        Self {
            rows,
            cols,
            row_ptr,
            col_idx,
            values,
        }
    }

    /// Get value at (i, j)
    pub fn get(&self, i: usize, j: usize) -> f64 {
        if i >= self.rows {
            return 0.0;
        }

        let start = self.row_ptr[i];
        let end = self.row_ptr[i + 1];

        for k in start..end {
            if self.col_idx[k] == j {
                return self.values[k];
            }
        }
        0.0
    }

    /// Convert to dense matrix
    pub fn to_dense(&self) -> Vec<Vec<f64>> {
        let mut dense = vec![vec![0.0; self.cols]; self.rows];
        for i in 0..self.rows {
            let start = self.row_ptr[i];
            let end = self.row_ptr[i + 1];
            for k in start..end {
                dense[i][self.col_idx[k]] = self.values[k];
            }
        }
        dense
    }

    /// Extract a submatrix
    pub fn extract_submatrix(&self, row_start: usize, n_rows: usize, col_start: usize, n_cols: usize) -> Self {
        let mut triplets = Vec::new();

        for i in 0..n_rows {
            let global_row = row_start + i;
            if global_row >= self.rows {
                continue;
            }

            let start = self.row_ptr[global_row];
            let end = self.row_ptr[global_row + 1];

            for k in start..end {
                let global_col = self.col_idx[k];
                if global_col >= col_start && global_col < col_start + n_cols {
                    triplets.push((i, global_col - col_start, self.values[k]));
                }
            }
        }

        Self::from_triplets(n_rows, n_cols, &triplets)
    }

    /// Number of non-zero elements
    pub fn nnz(&self) -> usize {
        self.values.len()
    }

    /// Matrix-vector multiplication: y = A * x
    pub fn mul_vec(&self, x: &[f64]) -> Vec<f64> {
        assert_eq!(x.len(), self.cols);
        let mut y = vec![0.0; self.rows];

        for i in 0..self.rows {
            let start = self.row_ptr[i];
            let end = self.row_ptr[i + 1];
            for k in start..end {
                y[i] += self.values[k] * x[self.col_idx[k]];
            }
        }
        y
    }

    /// Get row as iterator over (col, value) pairs
    pub fn row_iter(&self, i: usize) -> impl Iterator<Item = (usize, f64)> + '_ {
        let start = self.row_ptr[i];
        let end = self.row_ptr[i + 1];
        (start..end).map(move |k| (self.col_idx[k], self.values[k]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_dense() {
        let dense = vec![
            vec![1.0, 0.0, 2.0],
            vec![0.0, 3.0, 0.0],
            vec![4.0, 5.0, 6.0],
        ];
        let sparse = SparseMatrix::from_dense(&dense);

        assert_eq!(sparse.get(0, 0), 1.0);
        assert_eq!(sparse.get(0, 1), 0.0);
        assert_eq!(sparse.get(0, 2), 2.0);
        assert_eq!(sparse.get(1, 1), 3.0);
        assert_eq!(sparse.get(2, 0), 4.0);
    }

    #[test]
    fn test_mul_vec() {
        let dense = vec![
            vec![2.0, 1.0],
            vec![1.0, 3.0],
        ];
        let sparse = SparseMatrix::from_dense(&dense);
        let x = vec![1.0, 2.0];
        let y = sparse.mul_vec(&x);

        assert!((y[0] - 4.0).abs() < 1e-10); // 2*1 + 1*2
        assert!((y[1] - 7.0).abs() < 1e-10); // 1*1 + 3*2
    }

    #[test]
    fn test_from_triplets_with_duplicates() {
        let triplets = vec![
            (0, 0, 1.0),
            (0, 0, 2.0), // duplicate - should sum
            (1, 1, 5.0),
        ];
        let sparse = SparseMatrix::from_triplets(2, 2, &triplets);

        assert!((sparse.get(0, 0) - 3.0).abs() < 1e-10);
        assert!((sparse.get(1, 1) - 5.0).abs() < 1e-10);
    }
}
