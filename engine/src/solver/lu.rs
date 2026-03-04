use super::sparse::SparseMatrix;

/// LU decomposition solver with partial pivoting
/// Solves the system A * x = b
pub fn solve_lu(a: &SparseMatrix, b: &[f64]) -> Result<Vec<f64>, String> {
    let n = a.rows;
    if n != a.cols {
        return Err("Matrix must be square".to_string());
    }
    if n != b.len() {
        return Err("Vector b must have same dimension as matrix".to_string());
    }

    if n == 0 {
        return Ok(Vec::new());
    }

    // Convert to dense for LU decomposition (for simplicity)
    // For large systems, we would use sparse LU (e.g., SuperLU)
    let mut a_dense = a.to_dense();
    let mut b_work = b.to_vec();

    // Pivoting indices
    let mut perm: Vec<usize> = (0..n).collect();

    // LU decomposition with partial pivoting (in-place)
    for k in 0..n - 1 {
        // Find pivot
        let mut max_val = a_dense[k][k].abs();
        let mut max_row = k;
        for i in (k + 1)..n {
            let val = a_dense[i][k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        // Check for singularity
        if max_val < 1e-14 {
            return Err(format!(
                "Matrix is singular or nearly singular at row {}",
                k
            ));
        }

        // Swap rows if needed
        if max_row != k {
            a_dense.swap(k, max_row);
            b_work.swap(k, max_row);
            perm.swap(k, max_row);
        }

        // Elimination
        for i in (k + 1)..n {
            let factor = a_dense[i][k] / a_dense[k][k];
            a_dense[i][k] = factor; // Store L factor

            for j in (k + 1)..n {
                a_dense[i][j] -= factor * a_dense[k][j];
            }
            b_work[i] -= factor * b_work[k];
        }
    }

    // Check last diagonal element
    if a_dense[n - 1][n - 1].abs() < 1e-14 {
        return Err("Matrix is singular or nearly singular".to_string());
    }

    // Back substitution
    let mut x = vec![0.0; n];
    for i in (0..n).rev() {
        let mut sum = b_work[i];
        for j in (i + 1)..n {
            sum -= a_dense[i][j] * x[j];
        }
        x[i] = sum / a_dense[i][i];
    }

    // Check for NaN or Inf in solution
    for (i, &val) in x.iter().enumerate() {
        if !val.is_finite() {
            return Err(format!("Solution contains invalid value at index {}", i));
        }
    }

    Ok(x)
}

/// Compute condition number estimate (ratio of max/min diagonal after LU)
pub fn condition_estimate(a: &SparseMatrix) -> f64 {
    let dense = a.to_dense();
    let n = dense.len();
    if n == 0 {
        return 1.0;
    }

    let mut max_diag = 0.0f64;
    let mut min_diag = f64::MAX;

    for i in 0..n {
        let d = dense[i][i].abs();
        if d > max_diag {
            max_diag = d;
        }
        if d > 1e-14 && d < min_diag {
            min_diag = d;
        }
    }

    if min_diag < 1e-14 {
        f64::INFINITY
    } else {
        max_diag / min_diag
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_system() {
        // [2 1] [x1]   [5]
        // [1 3] [x2] = [7]
        // Solution: x1 = 1.6, x2 = 1.8
        let a = SparseMatrix::from_dense(&vec![
            vec![2.0, 1.0],
            vec![1.0, 3.0],
        ]);
        let b = vec![5.0, 7.0];
        let x = solve_lu(&a, &b).unwrap();

        assert!((x[0] - 1.6).abs() < 1e-10);
        assert!((x[1] - 1.8).abs() < 1e-10);
    }

    #[test]
    fn test_3x3_system() {
        // [4  2  1] [x1]   [11]
        // [2  5  2] [x2] = [16]
        // [1  2  4] [x3]   [15]
        let a = SparseMatrix::from_dense(&vec![
            vec![4.0, 2.0, 1.0],
            vec![2.0, 5.0, 2.0],
            vec![1.0, 2.0, 4.0],
        ]);
        let b = vec![11.0, 16.0, 15.0];
        let x = solve_lu(&a, &b).unwrap();

        // Verify A*x ≈ b
        let ax = a.mul_vec(&x);
        for i in 0..3 {
            assert!((ax[i] - b[i]).abs() < 1e-10);
        }
    }

    #[test]
    fn test_needs_pivoting() {
        // [0 1] [x1]   [1]   -> needs pivoting
        // [1 1] [x2] = [2]
        // Solution: x1 = 1, x2 = 1
        let a = SparseMatrix::from_dense(&vec![
            vec![0.0, 1.0],
            vec![1.0, 1.0],
        ]);
        let b = vec![1.0, 2.0];
        let x = solve_lu(&a, &b).unwrap();

        assert!((x[0] - 1.0).abs() < 1e-10);
        assert!((x[1] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_singular_matrix() {
        let a = SparseMatrix::from_dense(&vec![
            vec![1.0, 2.0],
            vec![2.0, 4.0], // linearly dependent
        ]);
        let b = vec![1.0, 2.0];
        let result = solve_lu(&a, &b);
        assert!(result.is_err());
    }
}
