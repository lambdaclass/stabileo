/// Compressed Sparse Column (CSC) matrix — lower triangle only for symmetric SPD.
///
/// Storage: column pointers, row indices, values. Lower triangle only means
/// for symmetric matrices we store (i,j) where i >= j.
#[derive(Debug, Clone)]
pub struct CscMatrix {
    pub n: usize,
    pub col_ptr: Vec<usize>,   // length n+1
    pub row_idx: Vec<usize>,   // length nnz
    pub values: Vec<f64>,      // length nnz
}

/// COO triplet for building sparse matrices.
struct Triplet {
    row: usize,
    col: usize,
    val: f64,
}

impl CscMatrix {
    /// Build CSC from COO triplets (lower triangle only). Duplicates are summed.
    pub fn from_triplets(n: usize, rows: &[usize], cols: &[usize], vals: &[f64]) -> Self {
        assert_eq!(rows.len(), cols.len());
        assert_eq!(rows.len(), vals.len());

        // Ensure lower triangle: swap if row < col
        let mut triplets: Vec<Triplet> = Vec::with_capacity(rows.len());
        for i in 0..rows.len() {
            let (r, c) = if rows[i] >= cols[i] {
                (rows[i], cols[i])
            } else {
                (cols[i], rows[i])
            };
            triplets.push(Triplet { row: r, col: c, val: vals[i] });
        }

        // Count entries per column
        let mut col_counts = vec![0usize; n];
        for t in &triplets {
            col_counts[t.col] += 1;
        }

        // Build col_ptr
        let mut col_ptr = vec![0usize; n + 1];
        for j in 0..n {
            col_ptr[j + 1] = col_ptr[j] + col_counts[j];
        }
        let nnz = col_ptr[n];

        // Fill row_idx and values (unsorted within each column)
        let mut row_idx = vec![0usize; nnz];
        let mut values = vec![0.0f64; nnz];
        let mut offsets = col_ptr[..n].to_vec();

        for t in &triplets {
            let pos = offsets[t.col];
            row_idx[pos] = t.row;
            values[pos] = t.val;
            offsets[t.col] += 1;
        }

        // Sort each column by row index and sum duplicates
        let mut result = CscMatrix { n, col_ptr, row_idx, values };
        result.sort_and_sum_duplicates();
        result
    }

    fn sort_and_sum_duplicates(&mut self) {
        for j in 0..self.n {
            let start = self.col_ptr[j];
            let end = self.col_ptr[j + 1];
            if start == end {
                continue;
            }

            // Sort by row index within this column
            let mut pairs: Vec<(usize, f64)> = (start..end)
                .map(|k| (self.row_idx[k], self.values[k]))
                .collect();
            pairs.sort_by_key(|p| p.0);

            // Write back, summing duplicates
            let mut write = start;
            let mut k = 0;
            while k < pairs.len() {
                let row = pairs[k].0;
                let mut val = pairs[k].1;
                k += 1;
                while k < pairs.len() && pairs[k].0 == row {
                    val += pairs[k].1;
                    k += 1;
                }
                self.row_idx[write] = row;
                self.values[write] = val;
                write += 1;
            }

            // If duplicates were merged, we have fewer entries — compact
            if write < end {
                // Shift subsequent data
                let removed = end - write;
                let total = self.row_idx.len();
                // Remove the gap
                self.row_idx.copy_within(end..total, write);
                self.row_idx.truncate(total - removed);
                self.values.copy_within(end..total, write);
                self.values.truncate(total - removed);
                // Update col_ptr for subsequent columns
                for jj in (j + 1)..=self.n {
                    self.col_ptr[jj] -= removed;
                }
            }
        }
    }

    /// Number of stored non-zeros.
    pub fn nnz(&self) -> usize {
        self.col_ptr[self.n]
    }

    /// Remove entries with absolute value below threshold and compact the CSC.
    /// Matches the filtering behavior of `from_dense_symmetric` (threshold 1e-30).
    pub fn drop_below_threshold(&mut self, threshold: f64) {
        let mut new_rows = Vec::with_capacity(self.nnz());
        let mut new_vals = Vec::with_capacity(self.nnz());
        let mut new_col_ptr = vec![0usize; self.n + 1];
        for j in 0..self.n {
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                if self.values[k].abs() >= threshold {
                    new_rows.push(self.row_idx[k]);
                    new_vals.push(self.values[k]);
                }
            }
            new_col_ptr[j + 1] = new_rows.len();
        }
        self.col_ptr = new_col_ptr;
        self.row_idx = new_rows;
        self.values = new_vals;
    }

    /// Symmetric matrix-vector product: y = A*x where A is stored as lower triangle.
    pub fn sym_mat_vec(&self, x: &[f64]) -> Vec<f64> {
        assert_eq!(x.len(), self.n);
        let mut y = vec![0.0; self.n];

        for j in 0..self.n {
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                let i = self.row_idx[k];
                let v = self.values[k];
                y[i] += v * x[j];
                if i != j {
                    y[j] += v * x[i];
                }
            }
        }
        y
    }

    /// Apply symmetric permutation: B = P*A*P^T.
    /// perm[new_i] = old_i.
    pub fn permute_symmetric(&self, perm: &[usize]) -> CscMatrix {
        let n = self.n;
        assert_eq!(perm.len(), n);

        // Build inverse permutation
        let mut iperm = vec![0usize; n];
        for (new, &old) in perm.iter().enumerate() {
            iperm[old] = new;
        }

        // Collect permuted triplets (lower triangle only)
        let mut rows = Vec::with_capacity(self.nnz());
        let mut cols = Vec::with_capacity(self.nnz());
        let mut vals = Vec::with_capacity(self.nnz());

        for j in 0..n {
            let new_j = iperm[j];
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                let i = self.row_idx[k];
                let new_i = iperm[i];
                let v = self.values[k];
                // Ensure lower triangle
                if new_i >= new_j {
                    rows.push(new_i);
                    cols.push(new_j);
                } else {
                    rows.push(new_j);
                    cols.push(new_i);
                }
                vals.push(v);
            }
        }

        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }

    /// Convert lower-triangle CSC to full dense symmetric matrix (row-major).
    pub fn to_dense_symmetric(&self) -> Vec<f64> {
        let n = self.n;
        let mut dense = vec![0.0; n * n];
        for j in 0..n {
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                let i = self.row_idx[k];
                let v = self.values[k];
                dense[i * n + j] = v;
                dense[j * n + i] = v;
            }
        }
        dense
    }

    /// Extract principal submatrix for given indices (returns new CscMatrix).
    pub fn extract_principal_submatrix(&self, indices: &[usize]) -> CscMatrix {
        let m = indices.len();
        // Build mapping: old_index → new_index (or None if not included)
        let mut old_to_new = vec![usize::MAX; self.n];
        for (new, &old) in indices.iter().enumerate() {
            old_to_new[old] = new;
        }

        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();

        for j in 0..self.n {
            let new_j = old_to_new[j];
            if new_j == usize::MAX {
                continue;
            }
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                let i = self.row_idx[k];
                let new_i = old_to_new[i];
                if new_i == usize::MAX {
                    continue;
                }
                rows.push(new_i);
                cols.push(new_j);
                vals.push(self.values[k]);
            }
        }

        CscMatrix::from_triplets(m, &rows, &cols, &vals)
    }

    /// Update values in-place, keeping the same sparsity pattern.
    /// `other` must have the same pattern (col_ptr, row_idx).
    pub fn add_values_inplace(&mut self, other: &CscMatrix) {
        assert_eq!(self.n, other.n);
        assert_eq!(self.nnz(), other.nnz());
        for k in 0..self.nnz() {
            debug_assert_eq!(self.row_idx[k], other.row_idx[k]);
            self.values[k] += other.values[k];
        }
    }

    /// Build CSC from dense symmetric matrix (lower triangle), skipping zeros.
    pub fn from_dense_symmetric(dense: &[f64], n: usize) -> Self {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for j in 0..n {
            for i in j..n {
                let v = dense[i * n + j];
                if v.abs() > 1e-30 {
                    rows.push(i);
                    cols.push(j);
                    vals.push(v);
                }
            }
        }
        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }
    /// Compute y[i] += K[i, j] * x[j] for i < nf, j >= nf (cross-block mat-vec).
    /// K is symmetric lower-triangle CSC of dimension n. Extracts the free×restrained
    /// block contribution for prescribed displacement handling.
    pub fn sparse_cross_block_matvec(&self, x_rest: &[f64], nf: usize) -> Vec<f64> {
        let mut y = vec![0.0; nf];
        for j in 0..self.n {
            for k in self.col_ptr[j]..self.col_ptr[j + 1] {
                let i = self.row_idx[k];
                let v = self.values[k];
                // Lower triangle: i >= j always.
                // We want (free, restrained) pairs:
                //   stored (i,j) with i < nf, j >= nf  → i is free, j is restrained
                //   stored (i,j) with i >= nf, j < nf  → j is free, i is restrained (symmetric)
                if i < nf && j >= nf {
                    y[i] += v * x_rest[j - nf];
                } else if i >= nf && j < nf {
                    y[j] += v * x_rest[i - nf];
                }
            }
        }
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_triplets_basic() {
        // 2×2: [[4, 2], [2, 3]]
        let a = CscMatrix::from_triplets(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[4.0, 2.0, 3.0],
        );
        assert_eq!(a.n, 2);
        assert_eq!(a.nnz(), 3);
    }

    #[test]
    fn test_duplicate_summing() {
        // Add two entries at (1,0)
        let a = CscMatrix::from_triplets(
            2,
            &[0, 1, 1],
            &[0, 0, 0],
            &[4.0, 2.0, 3.0],
        );
        // Column 0 should have: row 0 = 4.0, row 1 = 5.0
        assert_eq!(a.nnz(), 2);
        let dense = a.to_dense_symmetric();
        assert!((dense[0] - 4.0).abs() < 1e-15);
        assert!((dense[1] - 5.0).abs() < 1e-15); // (0,1) = symmetric of (1,0)
        assert!((dense[2] - 5.0).abs() < 1e-15); // (1,0)
    }

    #[test]
    fn test_sym_mat_vec() {
        // [[4, 2], [2, 3]]
        let a = CscMatrix::from_triplets(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[4.0, 2.0, 3.0],
        );
        let x = vec![1.0, 2.0];
        let y = a.sym_mat_vec(&x);
        assert!((y[0] - 8.0).abs() < 1e-15);  // 4*1 + 2*2
        assert!((y[1] - 8.0).abs() < 1e-15);  // 2*1 + 3*2
    }

    #[test]
    fn test_sym_mat_vec_vs_dense() {
        // 3×3 SPD: [[10, 2, 1], [2, 8, 3], [1, 3, 6]]
        let a = CscMatrix::from_triplets(
            3,
            &[0, 1, 2, 1, 2, 2],
            &[0, 0, 0, 1, 1, 2],
            &[10.0, 2.0, 1.0, 8.0, 3.0, 6.0],
        );
        let x = vec![1.0, -1.0, 2.0];
        let y = a.sym_mat_vec(&x);
        // Dense: [10*1 + 2*(-1) + 1*2, 2*1 + 8*(-1) + 3*2, 1*1 + 3*(-1) + 6*2]
        assert!((y[0] - 10.0).abs() < 1e-14);
        assert!((y[1] - 0.0).abs() < 1e-14);
        assert!((y[2] - 10.0).abs() < 1e-14);
    }

    #[test]
    fn test_permute_round_trip() {
        let a = CscMatrix::from_triplets(
            3,
            &[0, 1, 2, 1, 2, 2],
            &[0, 0, 0, 1, 1, 2],
            &[10.0, 2.0, 1.0, 8.0, 3.0, 6.0],
        );
        let perm = vec![2, 0, 1]; // new[0]=old[2], etc.
        let b = a.permute_symmetric(&perm);
        let c = b.permute_symmetric(&[1, 2, 0]); // inverse perm
        let d1 = a.to_dense_symmetric();
        let d2 = c.to_dense_symmetric();
        for i in 0..9 {
            assert!((d1[i] - d2[i]).abs() < 1e-14, "mismatch at {}: {} vs {}", i, d1[i], d2[i]);
        }
    }

    #[test]
    fn test_to_dense_symmetric() {
        let a = CscMatrix::from_triplets(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[4.0, 2.0, 3.0],
        );
        let d = a.to_dense_symmetric();
        assert_eq!(d, vec![4.0, 2.0, 2.0, 3.0]);
    }

    #[test]
    fn test_extract_principal_submatrix() {
        // 3×3 → extract rows/cols [0,2]
        let a = CscMatrix::from_triplets(
            3,
            &[0, 1, 2, 1, 2, 2],
            &[0, 0, 0, 1, 1, 2],
            &[10.0, 2.0, 1.0, 8.0, 3.0, 6.0],
        );
        let sub = a.extract_principal_submatrix(&[0, 2]);
        let d = sub.to_dense_symmetric();
        assert!((d[0] - 10.0).abs() < 1e-14);
        assert!((d[1] - 1.0).abs() < 1e-14);
        assert!((d[2] - 1.0).abs() < 1e-14);
        assert!((d[3] - 6.0).abs() < 1e-14);
    }

    #[test]
    fn test_from_dense_symmetric() {
        let dense = vec![4.0, 2.0, 2.0, 5.0];
        let a = CscMatrix::from_dense_symmetric(&dense, 2);
        let roundtrip = a.to_dense_symmetric();
        for i in 0..4 {
            assert!((dense[i] - roundtrip[i]).abs() < 1e-15);
        }
    }

    #[test]
    fn test_upper_triangle_input_flipped() {
        // Provide (0,1) which is upper triangle — should be stored as (1,0)
        let a = CscMatrix::from_triplets(2, &[0], &[1], &[7.0]);
        let d = a.to_dense_symmetric();
        assert!((d[0 * 2 + 1] - 7.0).abs() < 1e-15);
        assert!((d[1 * 2 + 0] - 7.0).abs() < 1e-15);
    }
}
