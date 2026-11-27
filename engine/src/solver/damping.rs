/// Compute Rayleigh damping coefficients from two target frequencies and damping ratio.
/// omega1, omega2: circular frequencies (rad/s)
/// xi: damping ratio (typically 0.02-0.05)
/// Returns (a0, a1) such that C = a0*M + a1*K
pub fn rayleigh_coefficients(omega1: f64, omega2: f64, xi: f64) -> (f64, f64) {
    let a0 = 2.0 * xi * omega1 * omega2 / (omega1 + omega2);
    let a1 = 2.0 * xi / (omega1 + omega2);
    (a0, a1)
}

pub const ANCHOR_UNRESOLVED: &str = "DAMPING-ANCHOR-UNRESOLVED";

/// Rayleigh coefficients anchored on the structure's own first two natural frequencies.
///
/// `ξ(ω) = a₀/2ω + a₁ω/2` only means the requested ratio at the frequencies it is anchored on,
/// so there is no estimate to fall back on when they cannot be computed: the ratio of the
/// diagonals of K and M is not a natural frequency and has given hundreds of times the damping
/// asked for. A model with one natural frequency is anchored on it and on three times it.
pub fn rayleigh_from_modes(k: &[f64], m: &[f64], n: usize, xi: f64) -> Result<(f64, f64), String> {
    anchored(crate::linalg::lanczos_generalized_eigen(k, m, n, 2, 0.0), xi)
}

fn anchored(eigen: Option<crate::linalg::EigenResult>, xi: f64) -> Result<(f64, f64), String> {
    let positive: Vec<f64> = eigen.iter().flat_map(|result| &result.values).copied().filter(|&v| v.is_finite() && v > 1e-10).collect();
    match positive[..] {
        [first, second, ..] => Ok(rayleigh_coefficients(first.sqrt(), second.sqrt(), xi)),
        [only] => Ok(rayleigh_coefficients(only.sqrt(), 3.0 * only.sqrt(), xi)),
        [] => Err(format!("{ANCHOR_UNRESOLVED}: Rayleigh damping: the natural frequencies the damping ratio is anchored on could not be computed for this model, so the requested damping cannot be applied; no result is returned")),
    }
}

/// Assemble Rayleigh damping matrix C = a0*M + a1*K.
/// m, k: mass and stiffness matrices (n x n, row-major dense)
pub fn rayleigh_damping_matrix(m: &[f64], k: &[f64], n: usize, a0: f64, a1: f64) -> Vec<f64> {
    let mut c = vec![0.0; n * n];
    for i in 0..n * n {
        c[i] = a0 * m[i] + a1 * k[i];
    }
    c
}

pub fn rayleigh_from_modes_sparse(
    k: &crate::linalg::sparse::CscMatrix,
    m: &crate::linalg::sparse::CscMatrix,
    xi: f64,
) -> Result<(f64, f64), String> {
    anchored(crate::linalg::lanczos_generalized_eigen_sparse(k, m, 2, 0.0), xi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_model_without_computed_frequencies_is_refused_not_given_an_estimate() {
        let refused = |r: Result<(f64, f64), String>| r.unwrap_err().starts_with(&format!("{ANCHOR_UNRESOLVED}: "));
        let eigen = |values: &[f64]| Some(crate::linalg::EigenResult { values: values.to_vec(), vectors: Vec::new() });
        assert!(refused(anchored(None, 0.05)));
        assert!(refused(anchored(eigen(&[]), 0.05)));
        assert!(refused(anchored(eigen(&[0.0, -4.0, f64::INFINITY, f64::NAN]), 0.05)));
        assert_eq!(anchored(eigen(&[4.0, 25.0, 100.0]), 0.05), Ok(rayleigh_coefficients(2.0, 5.0, 0.05)));
        assert_eq!(anchored(eigen(&[0.0, 4.0, f64::INFINITY]), 0.05), Ok(rayleigh_coefficients(2.0, 6.0, 0.05)));

        let stiffness = [3.0, 0.0, 0.0, 5.0];
        let indefinite_mass = [1.0, 2.0, 2.0, 1.0];
        assert!(crate::linalg::lanczos_generalized_eigen(&stiffness, &indefinite_mass, 2, 2, 0.0).is_none());
        assert!(refused(rayleigh_from_modes(&stiffness, &indefinite_mass, 2, 0.05)));
        let (rows, cols) = ([0, 1, 1], [0, 0, 1]);
        let sparse = |a: &[f64; 4]| crate::linalg::sparse::CscMatrix::from_triplets(2, &rows, &cols, &[a[0], a[2], a[3]]);
        assert!(refused(rayleigh_from_modes_sparse(&sparse(&stiffness), &sparse(&indefinite_mass), 0.05)));
        assert_eq!(rayleigh_from_modes(&stiffness, &[1.0, 0.0, 0.0, 1.0], 2, 0.05), Ok(rayleigh_coefficients(3f64.sqrt(), 5f64.sqrt(), 0.05)));
    }

    #[test]
    fn test_rayleigh_coefficients_symmetry() {
        let xi = 0.05;
        let omega1 = 10.0;
        let omega2 = 30.0;
        let (a0, a1) = rayleigh_coefficients(omega1, omega2, xi);

        // At omega1: xi = a0/(2*omega1) + a1*omega1/2
        let xi_at_1 = a0 / (2.0 * omega1) + a1 * omega1 / 2.0;
        assert!((xi_at_1 - xi).abs() < 1e-12, "xi at omega1 = {}", xi_at_1);

        // At omega2: xi = a0/(2*omega2) + a1*omega2/2
        let xi_at_2 = a0 / (2.0 * omega2) + a1 * omega2 / 2.0;
        assert!((xi_at_2 - xi).abs() < 1e-12, "xi at omega2 = {}", xi_at_2);
    }

    #[test]
    fn test_rayleigh_damping_matrix() {
        let m = vec![2.0, 0.0, 0.0, 3.0];
        let k = vec![10.0, -5.0, -5.0, 10.0];
        let c = rayleigh_damping_matrix(&m, &k, 2, 0.5, 0.1);
        // c[0] = 0.5*2 + 0.1*10 = 2.0
        assert!((c[0] - 2.0).abs() < 1e-12);
        // c[1] = 0.5*0 + 0.1*(-5) = -0.5
        assert!((c[1] - (-0.5)).abs() < 1e-12);
        // c[3] = 0.5*3 + 0.1*10 = 2.5
        assert!((c[3] - 2.5).abs() < 1e-12);
    }
}
