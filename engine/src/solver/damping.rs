/// Compute Rayleigh damping coefficients from two target frequencies and damping ratio.
/// omega1, omega2: circular frequencies (rad/s)
/// xi: damping ratio (typically 0.02-0.05)
/// Returns (a0, a1) such that C = a0*M + a1*K
pub fn rayleigh_coefficients(omega1: f64, omega2: f64, xi: f64) -> (f64, f64) {
    let a0 = 2.0 * xi * omega1 * omega2 / (omega1 + omega2);
    let a1 = 2.0 * xi / (omega1 + omega2);
    (a0, a1)
}

/// Rayleigh coefficients anchored on the structure's OWN first two natural
/// frequencies, solved for rather than guessed at.
///
/// `ξ(ω) = a₀/2ω + a₁ω/2` is a U-shaped curve, so the pair only means anything
/// relative to the frequencies it was anchored on, and anchoring above the real
/// spectrum sends the `a₀/2ω` branch through the roof exactly where a building
/// responds. `time_integration` used to anchor on `√(Σ|K_ii| / Σ|M_ii|)`, which is
/// a mass-weighted average of diagonal ratios and not a fundamental frequency at
/// all: on the repo's 10-storey frame it returns 1027 rad/s against a true 1.15,
/// and hands the fundamental mode ~669× the requested damping. A mode damped that
/// hard does not respond, and a seismic run that suppresses the dominant mode
/// under-predicts demand.
///
/// Rigid-body modes are filtered out — they are not what Rayleigh should anchor
/// on — and the diagonal estimate survives only as the last resort when the
/// eigensolve finds nothing usable, where being crude beats returning nothing.
pub fn rayleigh_from_modes(k: &[f64], m: &[f64], n: usize, xi: f64) -> (f64, f64) {
    if let Some(result) = crate::linalg::lanczos_generalized_eigen(k, m, n, 2, 0.0) {
        let positive: Vec<f64> = result.values.iter().copied().filter(|&v| v > 1e-10).collect();
        if positive.len() >= 2 {
            return rayleigh_coefficients(positive[0].sqrt(), positive[1].sqrt(), xi);
        } else if positive.len() == 1 {
            let omega1 = positive[0].sqrt();
            // One usable mode: bracket it rather than anchoring twice on the same
            // frequency, which would leave the curve unconstrained on one side.
            return rayleigh_coefficients(omega1, 3.0 * omega1, xi);
        }
    }

    // Last resort: the smallest diagonal ratio, which at least tracks the softest
    // DOF rather than the average of all of them.
    let mut omega1_sq = f64::INFINITY;
    for i in 0..n {
        let kii = k[i * n + i];
        let mii = m[i * n + i];
        if mii > 1e-20 && kii > 1e-20 {
            omega1_sq = omega1_sq.min(kii / mii);
        }
    }
    if !omega1_sq.is_finite() || omega1_sq < 1e-20 {
        return (0.0, 0.0);
    }
    let omega1 = omega1_sq.sqrt();
    rayleigh_coefficients(omega1, 3.0 * omega1, xi)
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

/// Sparse counterpart of `rayleigh_from_modes`: same anchoring logic, with the
/// two-mode eigensolve on the sparse Lanczos path and the last-resort diagonal
/// estimate read from the CSC diagonal.
pub fn rayleigh_from_modes_sparse(
    k: &crate::linalg::sparse::CscMatrix,
    m: &crate::linalg::sparse::CscMatrix,
    xi: f64,
) -> (f64, f64) {
    if let Some(result) = crate::linalg::lanczos_generalized_eigen_sparse(k, m, 2, 0.0) {
        let positive: Vec<f64> = result.values.iter().copied().filter(|&v| v > 1e-10).collect();
        if positive.len() >= 2 {
            return rayleigh_coefficients(positive[0].sqrt(), positive[1].sqrt(), xi);
        } else if positive.len() == 1 {
            let omega1 = positive[0].sqrt();
            // One usable mode: bracket it rather than anchoring twice on the same
            // frequency, which would leave the curve unconstrained on one side.
            return rayleigh_coefficients(omega1, 3.0 * omega1, xi);
        }
    }

    // Last resort: the smallest diagonal ratio, which at least tracks the softest
    // DOF rather than the average of all of them.
    let kd = k.diagonal();
    let md = m.diagonal();
    let mut omega1_sq = f64::INFINITY;
    for i in 0..k.n {
        let (kii, mii) = (kd[i], md[i]);
        if mii > 1e-20 && kii > 1e-20 {
            omega1_sq = omega1_sq.min(kii / mii);
        }
    }
    if !omega1_sq.is_finite() || omega1_sq < 1e-20 {
        return (0.0, 0.0);
    }
    let omega1 = omega1_sq.sqrt();
    rayleigh_coefficients(omega1, 3.0 * omega1, xi)
}

#[cfg(test)]
mod tests {
    use super::*;

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
