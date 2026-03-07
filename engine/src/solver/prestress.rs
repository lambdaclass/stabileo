use crate::types::*;

/// Compute fixed-end forces (FEF) from a prestress load on a 2D frame element.
///
/// Returns a 6-element vector [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j] in local coords.
///
/// Sign convention:
/// - Positive force = compression on concrete (tension in tendon)
/// - Positive eccentricity = below centroid → causes sagging (positive) moment
///
/// For a parabolic tendon with peak eccentricity e_mid:
///   Equivalent UDL: w_eq = 8 * P * e_mid / L²  (upward, opposing gravity)
///   Plus end moments from eccentricities at i and j.
///
/// For a straight tendon:
///   Only axial + end moments from eccentricity.
pub fn prestress_fef_2d(ps: &PrestressLoad, length: f64) -> [f64; 6] {
    let p = ps.force; // positive = compression on concrete

    let mut fef = [0.0f64; 6];

    // Axial: prestress applies compression → negative N (convention: tension +)
    // In FEF terms: fx_i = +P (pushes node i in +x), fx_j = -P
    // But for concrete prestress, the tendon pulls the ends together:
    // fx_i = -P, fx_j = +P (compression in element)
    fef[0] = -p;
    fef[3] = p;

    match &ps.profile {
        TendonProfile::Straight => {
            // Straight tendon at eccentricity e below centroid:
            // Compression P at eccentricity e creates hogging moment M = P*e
            // This causes upward camber. Equivalent end moments:
            // mz_i = +P*e_i (counterclockwise at left → upward curvature)
            // mz_j = -P*e_j (clockwise at right → upward curvature)
            fef[2] = p * ps.eccentricity_i;
            fef[5] = -p * ps.eccentricity_j;
        }
        TendonProfile::Parabolic { e_mid } => {
            // Parabolic tendon: curvature produces equivalent upward distributed load:
            // w_eq = 8 * P * e_net / L²
            // where e_net is the net sag from the chord line.

            let e_chord_mid = (ps.eccentricity_i + ps.eccentricity_j) / 2.0;
            let net_sag = e_mid - e_chord_mid;

            let l2 = length * length;
            let w_eq = 8.0 * p * net_sag / l2;

            // FEF for uniform transverse load w_eq (positive = upward in local y):
            fef[1] = w_eq * length / 2.0;
            fef[2] = w_eq * l2 / 12.0;
            fef[4] = w_eq * length / 2.0;
            fef[5] = -w_eq * l2 / 12.0;

            // Add end moments from eccentricity at supports (hogging → upward)
            fef[2] += p * ps.eccentricity_i;
            fef[5] -= p * ps.eccentricity_j;
        }
    }

    // Apply friction losses if specified
    if let (Some(mu), Some(kappa)) = (ps.mu, ps.kappa) {
        // For post-tensioning: P(x) = P_jack * exp(-μα - κx)
        // α = total angular change, for parabolic: α ≈ 8*e_mid/L
        let alpha = match &ps.profile {
            TendonProfile::Straight => {
                let de = (ps.eccentricity_j - ps.eccentricity_i).abs();
                (de / length).atan()
            }
            TendonProfile::Parabolic { e_mid } => {
                let e_chord_mid = (ps.eccentricity_i + ps.eccentricity_j) / 2.0;
                let net_sag = (*e_mid - e_chord_mid).abs();
                8.0 * net_sag / length
            }
        };

        let loss_factor = (-mu * alpha - kappa * length).exp();

        // Scale the far-end forces by the loss factor
        // (approximation: linear loss from jack end to far end)
        let avg_loss = (1.0 + loss_factor) / 2.0;
        for v in fef.iter_mut() {
            *v *= avg_loss;
        }
    }

    fef
}

/// Compute friction loss along a tendon at distance x from jacking end.
///
/// P(x) = P_jack * exp(-μ*α(x) - κ*x)
///
/// where α(x) is the cumulative angular change up to x.
pub fn tendon_force_at(
    p_jack: f64,
    mu: f64,
    kappa: f64,
    alpha_cumulative: f64,
    x: f64,
) -> f64 {
    p_jack * (-mu * alpha_cumulative - kappa * x).exp()
}

/// Compute elastic shortening loss for pretensioned members.
///
/// Δf_pES = n * f_cgp
///
/// where n = E_ps / E_ci, f_cgp = stress at tendon CG due to prestress + self-weight.
pub fn elastic_shortening_loss(
    e_ps: f64,    // Elastic modulus of prestress steel (MPa)
    e_ci: f64,    // Elastic modulus of concrete at transfer (MPa)
    f_cgp: f64,   // Concrete stress at tendon CG (MPa, compression positive)
) -> f64 {
    let n = e_ps / e_ci;
    n * f_cgp
}

/// ACI 318 lump-sum prestress losses (approximate).
///
/// Returns total long-term losses in MPa.
pub fn aci_lump_sum_losses(
    _f_pi: f64,          // Initial prestress after transfer (MPa)
    is_low_relax: bool,  // Low-relaxation strand?
) -> f64 {
    // ACI 318-19 §20.3.2.6 approximate total losses:
    // For low-relaxation: ~240 MPa for normal weight concrete
    // For stress-relieved: ~310 MPa
    if is_low_relax { 240.0 } else { 310.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn straight_tendon_fef() {
        let ps = PrestressLoad {
            element_id: 1,
            force: 1000.0,        // 1000 kN
            eccentricity_i: 0.1,  // 100mm below centroid
            eccentricity_j: 0.1,
            profile: TendonProfile::Straight,
            mu: None,
            kappa: None,
        };
        let fef = prestress_fef_2d(&ps, 10.0);

        // Axial: -1000 at i, +1000 at j
        assert!((fef[0] - (-1000.0)).abs() < 1e-10);
        assert!((fef[3] - 1000.0).abs() < 1e-10);

        // Moments: +P*e at i (hogging), -P*e at j (hogging)
        assert!((fef[2] - 100.0).abs() < 1e-10);  // +1000 * 0.1
        assert!((fef[5] - (-100.0)).abs() < 1e-10); // -1000 * 0.1
    }

    #[test]
    fn parabolic_tendon_fef() {
        let ps = PrestressLoad {
            element_id: 1,
            force: 1000.0,
            eccentricity_i: 0.0,
            eccentricity_j: 0.0,
            profile: TendonProfile::Parabolic { e_mid: 0.2 },
            mu: None,
            kappa: None,
        };
        let l = 10.0;
        let fef = prestress_fef_2d(&ps, l);

        // w_eq = 8 * 1000 * 0.2 / 100 = 16 kN/m (upward)
        let _w_eq: f64 = 16.0;

        // fy_i = fy_j = w_eq * L / 2 = 80 kN
        assert!((fef[1] - 80.0).abs() < 1e-10);
        assert!((fef[4] - 80.0).abs() < 1e-10);

        // mz_i = w_eq * L² / 12 = 133.33 kN·m (no end eccentricity)
        assert!((fef[2] - 133.333333333).abs() < 0.01);
        assert!((fef[5] - (-133.333333333)).abs() < 0.01);
    }

    #[test]
    fn friction_loss() {
        // 1000 kN jacking force, μ=0.2, κ=0.002, α=0.1 rad, x=20m
        let p = tendon_force_at(1000.0, 0.2, 0.002, 0.1, 20.0);
        let expected = 1000.0 * (-0.2_f64 * 0.1 - 0.002 * 20.0).exp();
        assert!((p - expected).abs() < 0.01);
    }
}
