/// Line search for Newton-Raphson solvers using Armijo backtracking.
///
/// Given a displacement update Δu and current residual R(u), finds a step
/// length α ∈ (0, 1] such that the residual energy decreases sufficiently:
///
///   E(u + α·Δu) ≤ E(u) + c₁·α·∇E·Δu
///
/// where E(u) = 0.5 * ||R(u)||².
///
/// Reference: Nocedal & Wright, "Numerical Optimization" Ch. 3
/// Compute the energy (squared residual norm) for a displacement vector.
/// Only considers free DOFs (indices 0..nf).
pub fn residual_energy(residual: &[f64], nf: usize) -> f64 {
    let mut e = 0.0;
    for i in 0..nf {
        e += residual[i] * residual[i];
    }
    0.5 * e
}

/// Compute the directional derivative of energy along delta_u.
/// ∇E · Δu = -R · Δu (since R = F_ext - F_int, and ∇E = -R for E = 0.5*||R||²)
/// Only considers free DOFs.
pub fn directional_derivative(residual: &[f64], delta_u: &[f64], nf: usize) -> f64 {
    let mut dd = 0.0;
    for i in 0..nf {
        dd -= residual[i] * delta_u[i];
    }
    dd
}

/// Armijo backtracking line search.
///
/// Returns the optimal step length α.
///
/// `u_full`: current full displacement vector (modified in place temporarily)
/// `delta_u_f`: displacement increment for free DOFs
/// `nf`: number of free DOFs
/// `energy_0`: current energy E(u)
/// `slope_0`: directional derivative ∇E·Δu at α=0
/// `residual_fn`: callback that computes residual R(u) for given u_full, returns energy
/// `c1`: sufficient decrease parameter (typically 1e-4)
/// `rho`: backtracking factor (typically 0.5)
/// `max_iter`: maximum backtracking steps
///
/// Returns α ∈ (0, 1].
pub fn armijo_backtrack<F>(
    u_full: &mut [f64],
    delta_u_f: &[f64],
    nf: usize,
    energy_0: f64,
    slope_0: f64,
    residual_fn: &mut F,
    c1: f64,
    rho: f64,
    max_iter: usize,
) -> f64
where
    F: FnMut(&[f64]) -> f64,
{
    // If slope is non-negative, Δu is not a descent direction — use full step
    if slope_0 >= 0.0 {
        for i in 0..nf {
            u_full[i] += delta_u_f[i];
        }
        return 1.0;
    }

    let mut alpha = 1.0;

    // Save original u values
    let u_orig: Vec<f64> = u_full[..nf].to_vec();

    for _ in 0..max_iter {
        // Trial: u = u_orig + α * Δu
        for i in 0..nf {
            u_full[i] = u_orig[i] + alpha * delta_u_f[i];
        }

        let energy_trial = residual_fn(u_full);

        // Armijo condition: E(u + α·Δu) ≤ E(u) + c₁·α·slope
        if energy_trial <= energy_0 + c1 * alpha * slope_0 {
            return alpha;
        }

        alpha *= rho;
    }

    // If no step satisfies Armijo, use the smallest step tried
    for i in 0..nf {
        u_full[i] = u_orig[i] + alpha * delta_u_f[i];
    }
    alpha
}

/// Simple line search: tries α=1, α=0.5, α=0.25, returns the one with lowest energy.
/// Useful as a fallback when the full Armijo is too expensive.
pub fn simple_line_search<F>(
    u_full: &mut [f64],
    delta_u_f: &[f64],
    nf: usize,
    residual_fn: &mut F,
) -> f64
where
    F: FnMut(&[f64]) -> f64,
{
    let u_orig: Vec<f64> = u_full[..nf].to_vec();
    let alphas = [1.0, 0.5, 0.25];
    let mut best_alpha = 1.0;
    let mut best_energy = f64::MAX;

    for &alpha in &alphas {
        for i in 0..nf {
            u_full[i] = u_orig[i] + alpha * delta_u_f[i];
        }
        let energy = residual_fn(u_full);
        if energy < best_energy {
            best_energy = energy;
            best_alpha = alpha;
        }
    }

    for i in 0..nf {
        u_full[i] = u_orig[i] + best_alpha * delta_u_f[i];
    }
    best_alpha
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_residual_energy() {
        let r = vec![3.0, 4.0, 0.0];
        assert!((residual_energy(&r, 2) - 12.5).abs() < 1e-10);
    }

    #[test]
    fn test_directional_derivative() {
        let r = vec![1.0, 2.0];
        let du = vec![1.0, 1.0];
        // dd = -(1*1 + 2*1) = -3
        assert!((directional_derivative(&r, &du, 2) - (-3.0)).abs() < 1e-10);
    }

    #[test]
    fn test_armijo_accepts_full_step_for_quadratic() {
        // For a simple quadratic E(x) = 0.5*x², the Newton step is exact
        let mut u = vec![10.0, 0.0];
        let du = vec![-10.0]; // Newton step to zero
        let nf = 1;
        let energy_0 = residual_energy(&u, nf);
        let slope_0 = directional_derivative(&u, &du, nf);

        let alpha = armijo_backtrack(
            &mut u, &du, nf, energy_0, slope_0,
            &mut |u| 0.5 * u[0] * u[0],
            1e-4, 0.5, 10,
        );
        assert!((alpha - 1.0).abs() < 1e-10);
    }
}
