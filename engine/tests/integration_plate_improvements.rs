/// Integration tests for plate element improvements.
///
/// Tests verify:
/// 1. Drilling DOF stiffness is symmetric and positive
/// 2. Nodal stress output is populated
/// 3. Plate thermal loads produce deflection
/// 4. Element quality metrics are reasonable
/// 5. Patch test: uniform stress field

use dedaliano_engine::element::{
    plate_local_stiffness, plate_local_stiffness_thick, plate_pressure_load,
    plate_thermal_load, plate_element_quality, plate_stress_at_nodes,
    plate_stress_recovery, plate_geometric_stiffness, plate_shear_stiffness_dkmt,
    plate_thickness_ratio,
};

#[test]
fn plate_drilling_stiffness_symmetry() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let e = 200e6; // kN/m²
    let nu = 0.3;
    let t = 0.01; // m

    let k = plate_local_stiffness(&coords, e, nu, t);
    let n = 18;

    // Verify symmetry
    let mut max_asym = 0.0f64;
    for i in 0..n {
        for j in 0..n {
            let diff = (k[i * n + j] - k[j * n + i]).abs();
            if diff > max_asym {
                max_asym = diff;
            }
        }
    }
    assert!(
        max_asym < 1e-8,
        "Stiffness matrix should be symmetric, max asymmetry: {:.2e}",
        max_asym
    );

    // Drilling DOF positions: 5, 11, 17
    let drill = [5, 11, 17];
    for &d in &drill {
        assert!(
            k[d * n + d] > 0.0,
            "Drilling stiffness at DOF {} should be positive: {}",
            d, k[d * n + d]
        );
    }

    // Off-diagonal drilling coupling should exist
    assert!(
        k[drill[0] * n + drill[1]].abs() > 0.0,
        "Off-diagonal drilling coupling should exist"
    );
}

#[test]
fn plate_nodal_stress_output() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let e = 200e6;
    let nu = 0.3;
    let t = 0.01;

    // Apply a simple bending displacement (uz at node 2)
    let mut u_local = vec![0.0; 18];
    u_local[2] = 0.001; // uz at node 0
    u_local[14] = -0.001; // uz at node 2

    let nodal = plate_stress_at_nodes(&coords, e, nu, t, &u_local);

    // Should return 3 stress states
    assert_eq!(nodal.len(), 3);

    // At least some stresses should be non-zero
    let has_nonzero = nodal.iter().any(|s| s.von_mises > 0.0);
    assert!(has_nonzero, "At least one nodal stress should be non-zero");

    // Also verify centroid stress recovery
    let centroid = plate_stress_recovery(&coords, e, nu, t, &u_local);
    assert!(centroid.von_mises >= 0.0);
}

#[test]
fn plate_thermal_load_produces_forces() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let e = 200e6;
    let nu = 0.3;
    let t = 0.01;
    let alpha = 12e-6;

    // Uniform temperature change only
    let f_uniform = plate_thermal_load(&coords, e, nu, t, alpha, 100.0, 0.0);
    assert_eq!(f_uniform.len(), 18);
    let max_f_uniform = f_uniform.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    assert!(
        max_f_uniform > 0.0,
        "Uniform temperature should produce non-zero loads"
    );

    // Gradient only
    let f_gradient = plate_thermal_load(&coords, e, nu, t, alpha, 0.0, 50.0);
    let max_f_gradient = f_gradient.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    assert!(
        max_f_gradient > 0.0,
        "Temperature gradient should produce non-zero loads"
    );

    // Zero temperature: no loads
    let f_zero = plate_thermal_load(&coords, e, nu, t, alpha, 0.0, 0.0);
    let max_f_zero = f_zero.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    assert!(
        max_f_zero < 1e-15,
        "Zero temperature should produce zero loads"
    );
}

#[test]
fn plate_element_quality_equilateral() {
    // Equilateral triangle: perfect quality
    let side = 1.0;
    let coords = [
        [0.0, 0.0, 0.0],
        [side, 0.0, 0.0],
        [side / 2.0, side * (3.0_f64).sqrt() / 2.0, 0.0],
    ];

    let (aspect, skew, min_angle) = plate_element_quality(&coords);

    assert!(
        (aspect - 1.0).abs() < 0.01,
        "Equilateral aspect ratio should be ~1.0: {}",
        aspect
    );
    assert!(
        skew < 1.0,
        "Equilateral skew should be ~0°: {}",
        skew
    );
    assert!(
        (min_angle - 60.0).abs() < 1.0,
        "Equilateral min angle should be ~60°: {}",
        min_angle
    );
}

#[test]
fn plate_element_quality_distorted() {
    // Very elongated triangle: poor quality
    let coords = [
        [0.0, 0.0, 0.0],
        [10.0, 0.0, 0.0],
        [5.0, 0.1, 0.0],
    ];

    let (aspect, _skew, min_angle) = plate_element_quality(&coords);

    assert!(
        aspect > 1.5,
        "Elongated triangle should have high aspect ratio: {}",
        aspect
    );
    assert!(
        min_angle < 15.0,
        "Elongated triangle should have small min angle: {}",
        min_angle
    );
}

#[test]
fn plate_pressure_load_equilibrium() {
    // A flat plate in XY plane: pressure in Z
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 1.0, 0.0],
    ];
    let pressure = 10.0; // kN/m²

    let f = plate_pressure_load(&coords, pressure);

    // Total Z-force should equal pressure * area
    let area = 0.5; // triangle area = 0.5 * base * height = 0.5 * 1.0 * 1.0
    let total_z: f64 = f[2] + f[8] + f[14]; // uz DOFs for each node
    let expected_total = pressure * area;

    assert!(
        (total_z - expected_total).abs() / expected_total < 0.01,
        "Total Z force {:.4} should equal p*A = {:.4}",
        total_z, expected_total
    );

    // X and Y components should be zero for a plate in XY plane
    let total_x: f64 = f[0] + f[6] + f[12];
    let total_y: f64 = f[1] + f[7] + f[13];
    assert!(total_x.abs() < 1e-10, "X force should be zero: {}", total_x);
    assert!(total_y.abs() < 1e-10, "Y force should be zero: {}", total_y);
}

#[test]
fn plate_geometric_stiffness_symmetry_and_sign() {
    // Geometric stiffness under uniform compression should be:
    // - Symmetric
    // - Negative definite on the uz DOFs (destabilizing)
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let nxx = -100.0; // compression (kN/m)
    let nyy = -100.0;
    let nxy = 0.0;

    let kg = plate_geometric_stiffness(&coords, nxx, nyy, nxy);
    let n = 18;

    // Symmetry check
    let mut max_asym = 0.0f64;
    for i in 0..n {
        for j in 0..n {
            let diff = (kg[i * n + j] - kg[j * n + i]).abs();
            if diff > max_asym {
                max_asym = diff;
            }
        }
    }
    assert!(
        max_asym < 1e-12,
        "Geometric stiffness should be symmetric: {:.2e}",
        max_asym
    );

    // Under compression (negative Nxx, Nyy), the geometric stiffness
    // should have negative diagonal entries at uz DOFs (2, 8, 14).
    // This means the geometric stiffness REDUCES the effective stiffness.
    // Actually the sign depends on the formulation:
    // K_g(i,j) = A * (Nxx * dNi/dx * dNj/dx + ...) and Nxx < 0
    // So diagonal terms should be negative (destabilizing).
    let uz_dofs = [2, 8, 14];
    for &d in &uz_dofs {
        assert!(
            kg[d * n + d] < 0.0,
            "Geometric stiffness diagonal at uz DOF {} should be negative under compression: {}",
            d, kg[d * n + d]
        );
    }

    // Under tension, geometric stiffness should have positive diagonal
    let kg_tens = plate_geometric_stiffness(&coords, 100.0, 100.0, 0.0);
    for &d in &uz_dofs {
        assert!(
            kg_tens[d * n + d] > 0.0,
            "Geometric stiffness diagonal at uz DOF {} should be positive under tension: {}",
            d, kg_tens[d * n + d]
        );
    }

    // Zero stress → zero geometric stiffness
    let kg_zero = plate_geometric_stiffness(&coords, 0.0, 0.0, 0.0);
    let max_val = kg_zero.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    assert!(max_val < 1e-15, "Zero stress should give zero Kg: {:.2e}", max_val);
}

#[test]
fn plate_dkmt_shear_stiffness_properties() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let e = 200e6;
    let nu = 0.3;
    let t = 0.1; // thick plate: t/L = 0.1
    let kappa_s = 5.0 / 6.0;

    let ks = plate_shear_stiffness_dkmt(&coords, e, nu, t, kappa_s);

    // Symmetry check (9×9)
    let mut max_asym = 0.0f64;
    for i in 0..9 {
        for j in 0..9 {
            let diff = (ks[i * 9 + j] - ks[j * 9 + i]).abs();
            if diff > max_asym {
                max_asym = diff;
            }
        }
    }
    assert!(
        max_asym < 1e-8,
        "Shear stiffness should be symmetric: {:.2e}",
        max_asym
    );

    // All diagonal entries should be non-negative (positive semi-definite)
    for i in 0..9 {
        assert!(
            ks[i * 9 + i] >= 0.0,
            "Shear stiffness diagonal at {} should be non-negative: {}",
            i, ks[i * 9 + i]
        );
    }

    // Shear stiffness should scale linearly with thickness
    let ks2 = plate_shear_stiffness_dkmt(&coords, e, nu, 2.0 * t, kappa_s);
    let ratio = ks2[0] / ks[0];
    assert!(
        (ratio - 2.0).abs() < 0.01,
        "Shear stiffness should scale linearly with t: ratio = {}",
        ratio
    );
}

#[test]
fn plate_thick_vs_thin_stiffness() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];
    let e = 200e6;
    let nu = 0.3;
    let kappa_s = 5.0 / 6.0;

    // Thin plate: t/L << 1/20, shear contribution should be small
    let t_thin = 0.001; // t/L ≈ 0.001
    let k_thin = plate_local_stiffness(&coords, e, nu, t_thin);
    let k_thick_thin = plate_local_stiffness_thick(&coords, e, nu, t_thin, kappa_s);

    // For a very thin plate, the thick and thin formulations should agree closely.
    // Compare using Frobenius norm of the difference relative to Frobenius norm of the original.
    let n = 18;
    let mut diff_sq = 0.0f64;
    let mut norm_sq = 0.0f64;
    for i in 0..n {
        for j in 0..n {
            let d = k_thick_thin[i * n + j] - k_thin[i * n + j];
            diff_sq += d * d;
            norm_sq += k_thin[i * n + j] * k_thin[i * n + j];
        }
    }
    let rel_diff = (diff_sq / norm_sq).sqrt();
    assert!(
        rel_diff < 0.01,
        "For thin plate, DKMT Frobenius norm diff should be < 1%: {:.6}",
        rel_diff
    );

    // Thick plate: t/L ~ 0.2, shear should add meaningful stiffness
    let t_thick = 0.2;
    let k_pure_thin = plate_local_stiffness(&coords, e, nu, t_thick);
    let k_dkmt = plate_local_stiffness_thick(&coords, e, nu, t_thick, kappa_s);

    // The DKMT stiffness should be STIFFER than DKT alone (shear adds stiffness)
    // Compare bending DOF diagonal entries
    let bend_dofs = [2, 3, 4, 8, 9, 10, 14, 15, 16];
    let mut found_increase = false;
    for &d in &bend_dofs {
        if k_dkmt[d * n + d] > k_pure_thin[d * n + d] * 1.01 {
            found_increase = true;
        }
    }
    assert!(found_increase, "DKMT should add noticeable shear stiffness for thick plates");
}

#[test]
fn plate_thickness_ratio_calculation() {
    let coords = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.5, 0.866, 0.0],
    ];

    // Shortest edge ≈ 0.866 for near-equilateral
    let ratio = plate_thickness_ratio(&coords, 0.05);
    // t/L_min ≈ 0.05 / 0.866 ≈ 0.0577
    assert!(
        (ratio - 0.05 / 0.866).abs() < 0.01,
        "Thickness ratio should be ~0.058: {}",
        ratio
    );

    // Very thin plate
    let ratio_thin = plate_thickness_ratio(&coords, 0.001);
    assert!(ratio_thin < 0.05, "Should be classified as thin: {}", ratio_thin);

    // Thick plate
    let ratio_thick = plate_thickness_ratio(&coords, 0.1);
    assert!(ratio_thick > 0.05, "Should be classified as thick: {}", ratio_thick);
}

#[test]
fn plate_membrane_patch_test() {
    // Patch test: a uniform strain field should be exactly represented.
    // For a CST element under uniform in-plane stretch (epsilon_xx = 1e-4),
    // the displacements are: u = epsilon_xx * x, v = 0.
    // The recovered stress should be sigma_xx = E * epsilon_xx (plane stress).
    let coords = [
        [0.0, 0.0, 0.0],
        [2.0, 0.0, 0.0],
        [1.0, 1.5, 0.0],
    ];
    let e = 200e6;
    let nu = 0.3;
    let t = 0.01;

    let eps_xx = 1e-4;

    // Set displacements: u = eps_xx * x, v = -nu * eps_xx * y
    // This gives epsilon_xx = eps_xx, epsilon_yy = -nu * eps_xx, gamma_xy = 0
    // For plane stress: sigma_xx = E/(1-nu²) * (eps_xx + nu*(-nu*eps_xx))
    //                            = E/(1-nu²) * eps_xx * (1 - nu²) = E * eps_xx
    // So sigma_xx = E * eps_xx exactly.
    let mut u_local = vec![0.0; 18];
    // Node 0: (0, 0) → u=0, v=0
    u_local[0] = 0.0;
    u_local[1] = 0.0;
    // Node 1: (2, 0) → u = eps_xx * 2, v = 0
    u_local[6] = eps_xx * 2.0;
    u_local[7] = -nu * eps_xx * 0.0;
    // Node 2: (1, 1.5) → u = eps_xx * 1, v = -nu * eps_xx * 1.5
    u_local[12] = eps_xx * 1.0;
    u_local[13] = -nu * eps_xx * 1.5;

    let stress = plate_stress_recovery(&coords, e, nu, t, &u_local);

    let expected_sigma_xx = e * eps_xx;
    assert!(
        (stress.sigma_xx - expected_sigma_xx).abs() / expected_sigma_xx < 1e-10,
        "Patch test sigma_xx: expected {:.2}, got {:.2}",
        expected_sigma_xx, stress.sigma_xx
    );

    // sigma_yy should be zero (free Poisson contraction)
    assert!(
        stress.sigma_yy.abs() < expected_sigma_xx * 1e-10,
        "Patch test sigma_yy should be ~0: {:.2e}",
        stress.sigma_yy
    );

    // tau_xy should be zero
    assert!(
        stress.tau_xy.abs() < expected_sigma_xx * 1e-10,
        "Patch test tau_xy should be ~0: {:.2e}",
        stress.tau_xy
    );
}
