/// Cholesky decomposition: A = L*L^T (in-place, lower triangle stored in A)
/// Returns true if successful (A is SPD), false if not.
pub fn cholesky_decompose(a: &mut [f64], n: usize) -> bool {
    for j in 0..n {
        let mut sum = a[j * n + j];
        for k in 0..j {
            sum -= a[j * n + k] * a[j * n + k];
        }
        // Negated `>` rather than `<=` so a NaN pivot is REJECTED. Every IEEE-754
        // comparison against NaN is false, so `sum <= 1e-15` waved NaN straight through:
        // `sqrt(NaN)` became the diagonal and the routine returned "successful (A is SPD)"
        // for a matrix that is not a number. For every non-NaN value the two forms are
        // identical, so this changes nothing else.
        if !(sum > 1e-15) {
            return false;
        }
        a[j * n + j] = sum.sqrt();
        let ljj = a[j * n + j];

        for i in (j + 1)..n {
            let mut sum = a[i * n + j];
            for k in 0..j {
                sum -= a[i * n + k] * a[j * n + k];
            }
            a[i * n + j] = sum / ljj;
        }
    }
    true
}

/// Forward substitution: solve L*y = b
pub fn forward_solve(l: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut y = b.to_vec();
    forward_solve_in_place(l, &mut y, n);
    y
}

pub(crate) fn forward_solve_in_place(l: &[f64], y: &mut [f64], n: usize) {
    for i in 0..n {
        for j in 0..i {
            y[i] -= l[i * n + j] * y[j];
        }
        y[i] /= l[i * n + i];
    }
}

/// Back substitution: solve L^T * x = y
pub fn back_solve(l: &[f64], y: &[f64], n: usize) -> Vec<f64> {
    let mut x = y.to_vec();
    back_solve_in_place(l, &mut x, n);
    x
}

pub(crate) fn back_solve_in_place(l: &[f64], x: &mut [f64], n: usize) {
    for i in (0..n).rev() {
        for j in (i + 1)..n {
            x[i] -= l[j * n + i] * x[j]; // L^T[i,j] = L[j,i]
        }
        x[i] /= l[i * n + i];
    }
}

/// Solve A*x = b using Cholesky decomposition.
/// Returns None if A is not SPD.
pub fn cholesky_solve(a: &mut [f64], b: &[f64], n: usize) -> Option<Vec<f64>> {
    if !cholesky_decompose(a, n) {
        return None;
    }
    let y = forward_solve(a, b, n);
    Some(back_solve(a, &y, n))
}

/// Compute L^{-1} for lower triangular L (for generalized eigenvalue)
pub fn lower_triangular_inverse(l: &[f64], n: usize) -> Vec<f64> {
    let mut inv = vec![0.0; n * n];
    for i in 0..n {
        inv[i * n + i] = 1.0 / l[i * n + i];
        for j in (i + 1)..n {
            let mut sum = 0.0;
            for k in i..j {
                sum -= l[j * n + k] * inv[k * n + i];
            }
            inv[j * n + i] = sum / l[j * n + j];
        }
    }
    inv
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cholesky_2x2() {
        let mut a = vec![4.0, 2.0, 2.0, 5.0];
        let b = vec![8.0, 12.0];
        let x = cholesky_solve(&mut a, &b, 2).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-10);
        assert!((x[1] - 2.0).abs() < 1e-10, "got {}", x[1]);
    }

    #[test]
    fn test_cholesky_3x3() {
        let mut a = vec![
            4.0, 2.0, 1.0,
            2.0, 5.0, 3.0,
            1.0, 3.0, 6.0,
        ];
        let b = vec![11.0, 21.0, 25.0];
        let x = cholesky_solve(&mut a, &b, 3).unwrap();
        assert!((x[0] - 1.0).abs() < 1e-10);
        assert!((x[1] - 2.0).abs() < 1e-10);
        assert!((x[2] - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_cholesky_not_spd() {
        let mut a = vec![1.0, 2.0, 2.0, 1.0]; // not positive definite
        let b = vec![1.0, 1.0];
        assert!(cholesky_solve(&mut a, &b, 2).is_none());
    }
}
