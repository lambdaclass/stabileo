/// Dense matrix stored as row-major Vec<f64>.
/// Element (i,j) is at index i*n + j.
/// Matrix-vector multiply: y = A*x (square n×n matrix)
pub fn mat_vec(a: &[f64], x: &[f64], n: usize) -> Vec<f64> {
    let mut y = vec![0.0; n];
    for i in 0..n {
        let mut sum = 0.0;
        let row = i * n;
        for j in 0..n {
            sum += a[row + j] * x[j];
        }
        y[i] = sum;
    }
    y
}

/// Rectangular matrix-vector multiply: y = A*x where A is (nrow × ncol)
pub fn mat_vec_rect(a: &[f64], x: &[f64], nrow: usize, ncol: usize) -> Vec<f64> {
    let mut y = vec![0.0; nrow];
    for i in 0..nrow {
        let mut sum = 0.0;
        let row = i * ncol;
        for j in 0..ncol {
            sum += a[row + j] * x[j];
        }
        y[i] = sum;
    }
    y
}

/// Matrix-matrix multiply: C = A*B (all n×n)
pub fn mat_mul(a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
    let mut c = vec![0.0; n * n];
    for i in 0..n {
        for k in 0..n {
            let a_ik = a[i * n + k];
            if a_ik == 0.0 {
                continue;
            }
            for j in 0..n {
                c[i * n + j] += a_ik * b[k * n + j];
            }
        }
    }
    c
}

/// Transpose n×n matrix in-place
pub fn transpose_inplace(a: &mut [f64], n: usize) {
    for i in 0..n {
        for j in (i + 1)..n {
            a.swap(i * n + j, j * n + i);
        }
    }
}

/// C = Tᵀ * K * T for dense square matrices of size n
/// T_transpose is computed implicitly
pub fn transform_stiffness(k_local: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    // temp = K * T
    let temp = mat_mul(k_local, t, n);
    // result = Tᵀ * temp
    let mut result = vec![0.0; n * n];
    for i in 0..n {
        for j in 0..n {
            let mut sum = 0.0;
            for k in 0..n {
                sum += t[k * n + i] * temp[k * n + j]; // T^T[i,k] = T[k,i]
            }
            result[i * n + j] = sum;
        }
    }
    result
}

/// F_global = Tᵀ * F_local
pub fn transform_force(f_local: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    let mut f_global = vec![0.0; n];
    for i in 0..n {
        let mut sum = 0.0;
        for k in 0..n {
            sum += t[k * n + i] * f_local[k]; // T^T[i,k] = T[k,i]
        }
        f_global[i] = sum;
    }
    f_global
}

/// u_local = T * u_global
pub fn transform_displacement(u_global: &[f64], t: &[f64], n: usize) -> Vec<f64> {
    mat_vec(t, u_global, n)
}

/// Extract submatrix from dense n×n into m×m
pub fn extract_submatrix(
    a: &[f64],
    n: usize,
    rows: &[usize],
    cols: &[usize],
) -> Vec<f64> {
    let nr = rows.len();
    let nc = cols.len();
    let mut sub = vec![0.0; nr * nc];
    for (i, &r) in rows.iter().enumerate() {
        for (j, &c) in cols.iter().enumerate() {
            sub[i * nc + j] = a[r * n + c];
        }
    }
    sub
}

/// Extract subvector
pub fn extract_subvec(v: &[f64], indices: &[usize]) -> Vec<f64> {
    indices.iter().map(|&i| v[i]).collect()
}

/// Scatter subvector values into full vector
pub fn scatter_subvec(full: &mut [f64], indices: &[usize], sub: &[f64]) {
    for (i, &idx) in indices.iter().enumerate() {
        full[idx] = sub[i];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mat_vec() {
        // 2x2 identity
        let a = vec![1.0, 0.0, 0.0, 1.0];
        let x = vec![3.0, 4.0];
        let y = mat_vec(&a, &x, 2);
        assert_eq!(y, vec![3.0, 4.0]);
    }

    #[test]
    fn test_mat_mul() {
        let a = vec![1.0, 2.0, 3.0, 4.0];
        let b = vec![5.0, 6.0, 7.0, 8.0];
        let c = mat_mul(&a, &b, 2);
        assert_eq!(c, vec![19.0, 22.0, 43.0, 50.0]);
    }

    #[test]
    fn test_transpose() {
        let mut a = vec![1.0, 2.0, 3.0, 4.0];
        transpose_inplace(&mut a, 2);
        assert_eq!(a, vec![1.0, 3.0, 2.0, 4.0]);
    }
}
