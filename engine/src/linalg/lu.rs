/// LU factorization with partial pivoting (in-place).
/// Returns the row permutation on success, None if singular.
/// After the call, `a` holds the combined L-U factors (L below diagonal, unit diagonal implied).
pub fn lu_factor(a: &mut [f64], n: usize) -> Option<Vec<usize>> {
    let mut piv = vec![0usize; n];
    for i in 0..n {
        piv[i] = i;
    }

    // Forward elimination with partial pivoting
    for k in 0..n {
        // Find pivot
        let mut max_val = a[piv[k] * n + k].abs();
        let mut max_row = k;
        for i in (k + 1)..n {
            let val = a[piv[i] * n + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        if max_val < 1e-14 {
            return None; // Singular
        }

        piv.swap(k, max_row);

        let pivot = a[piv[k] * n + k];
        for i in (k + 1)..n {
            let factor = a[piv[i] * n + k] / pivot;
            a[piv[i] * n + k] = factor;
            for j in (k + 1)..n {
                let val = a[piv[k] * n + j];
                a[piv[i] * n + j] -= factor * val;
            }
        }
    }

    Some(piv)
}

/// Solve A*x = b given the in-place LU factors from `lu_factor`.
/// Returns None if the solution contains NaN/Inf.
pub fn lu_apply(a: &[f64], piv: &[usize], b: &[f64], n: usize) -> Option<Vec<f64>> {
    // Forward substitution (Ly = Pb)
    let mut y = vec![0.0; n];
    for i in 0..n {
        y[i] = b[piv[i]];
        for j in 0..i {
            y[i] -= a[piv[i] * n + j] * y[j];
        }
    }

    // Back substitution (Ux = y)
    let mut x = vec![0.0; n];
    for i in (0..n).rev() {
        x[i] = y[i];
        for j in (i + 1)..n {
            x[i] -= a[piv[i] * n + j] * x[j];
        }
        x[i] /= a[piv[i] * n + i];
    }

    // Check for NaN/Inf
    for &v in &x {
        if v.is_nan() || v.is_infinite() {
            return None;
        }
    }

    Some(x)
}

/// LU decomposition with partial pivoting.
/// Solves A*x = b. Returns None if singular.
pub fn lu_solve(a: &mut [f64], b: &mut [f64], n: usize) -> Option<Vec<f64>> {
    let piv = lu_factor(a, n)?;
    lu_apply(a, &piv, b, n)
}

/// Compute rank of matrix via LU with partial pivoting.
/// Returns (rank, zero_pivot_indices).
pub fn lu_rank(a: &[f64], n: usize, tol: f64) -> (usize, Vec<usize>) {
    let mut work = a.to_vec();
    let mut piv: Vec<usize> = (0..n).collect();
    let mut zero_pivots = Vec::new();

    for k in 0..n {
        let mut max_val = work[piv[k] * n + k].abs();
        let mut max_row = k;
        for i in (k + 1)..n {
            let val = work[piv[i] * n + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }

        if max_val < tol {
            zero_pivots.push(k);
            continue;
        }

        piv.swap(k, max_row);

        let pivot = work[piv[k] * n + k];
        for i in (k + 1)..n {
            let factor = work[piv[i] * n + k] / pivot;
            work[piv[i] * n + k] = factor;
            for j in (k + 1)..n {
                let val = work[piv[k] * n + j];
                work[piv[i] * n + j] -= factor * val;
            }
        }
    }

    let rank = n - zero_pivots.len();
    (rank, zero_pivots)
}

/// Condition number estimate: max|diag| / min|diag| after LU
pub fn condition_estimate(a: &[f64], n: usize) -> f64 {
    let mut work = a.to_vec();
    let mut piv: Vec<usize> = (0..n).collect();

    for k in 0..n {
        let mut max_val = work[piv[k] * n + k].abs();
        let mut max_row = k;
        for i in (k + 1)..n {
            let val = work[piv[i] * n + k].abs();
            if val > max_val {
                max_val = val;
                max_row = i;
            }
        }
        if max_val < 1e-30 {
            return f64::INFINITY;
        }
        piv.swap(k, max_row);
        let pivot = work[piv[k] * n + k];
        for i in (k + 1)..n {
            let factor = work[piv[i] * n + k] / pivot;
            work[piv[i] * n + k] = factor;
            for j in (k + 1)..n {
                let val = work[piv[k] * n + j];
                work[piv[i] * n + j] -= factor * val;
            }
        }
    }

    let mut max_diag = 0.0_f64;
    let mut min_diag = f64::INFINITY;
    for i in 0..n {
        let d = work[piv[i] * n + i].abs();
        max_diag = max_diag.max(d);
        min_diag = min_diag.min(d);
    }

    if min_diag < 1e-30 {
        f64::INFINITY
    } else {
        max_diag / min_diag
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lu_2x2() {
        let mut a = vec![2.0, 1.0, 1.0, 3.0];
        let mut b = vec![5.0, 7.0];
        let x = lu_solve(&mut a, &mut b, 2).unwrap();
        assert!((x[0] - 1.6).abs() < 1e-10);
        assert!((x[1] - 1.8).abs() < 1e-10);
    }

    #[test]
    fn test_lu_singular() {
        let mut a = vec![1.0, 2.0, 2.0, 4.0];
        let mut b = vec![1.0, 2.0];
        assert!(lu_solve(&mut a, &mut b, 2).is_none());
    }

    #[test]
    fn test_lu_rank() {
        // Rank 2 matrix (3x3)
        let a = vec![
            1.0, 2.0, 3.0,
            2.0, 4.0, 6.0,
            0.0, 1.0, 1.0,
        ];
        let (rank, _) = lu_rank(&a, 3, 1e-10);
        assert_eq!(rank, 2);
    }
}
