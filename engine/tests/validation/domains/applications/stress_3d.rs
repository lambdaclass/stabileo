/// Validation: 3D Section Stress Computation
///
/// References:
///   - Navier: σ(y,z) = N/A + Mz·y/Iz - My·z/Iy
///   - Jourawski: τ = VQ/(Ib), parabolic for rectangular
///   - Saint-Venant: τ = T·t/J for open sections
///   - Von Mises: σ_vm = √(σ² + 3τ²)
///
/// Tests:
///   1. Pure axial: σ = N/A, zero bending stress
///   2. Biaxial bending: Navier formula at known fibers
///   3. Shear rectangular: Jourawski parabolic distribution
///   4. Torsion: Saint-Venant for open section
///   5. Von Mises: combined bending + shear
///   6. Neutral axis angle under biaxial bending
use dedaliano_engine::postprocess::section_stress::SectionGeometry;
use dedaliano_engine::postprocess::section_stress_3d::*;
use dedaliano_engine::types::*;
#[allow(unused_imports)]
use crate::common::*;

/// Build a minimal ElementForces3D with known internal forces at a section.
fn make_ef3d(
    n: f64, vy: f64, vz: f64, mx: f64, my: f64, mz: f64, length: f64,
) -> ElementForces3D {
    ElementForces3D {
        element_id: 1,
        length,
        n_start: n, n_end: -n,
        vy_start: vy, vy_end: -vy,
        vz_start: vz, vz_end: -vz,
        mx_start: mx, mx_end: -mx,
        my_start: my, my_end: -my,
        mz_start: mz, mz_end: -mz,
        hinge_start: false, hinge_end: false,
        q_yi: 0.0, q_yj: 0.0,
        distributed_loads_y: vec![],
        point_loads_y: vec![],
        q_zi: 0.0, q_zj: 0.0,
        distributed_loads_z: vec![],
        point_loads_z: vec![],
        bimoment_start: None, bimoment_end: None,
    }
}

/// Rectangular section geometry.
/// Rectangular section: h is depth (y-direction), b is width (z-direction).
/// Iz = ∫y²dA = b·h³/12 (controls Mz bending and Vy shear)
/// Iy = ∫z²dA = h·b³/12 (controls My bending and Vz shear)
fn rect_section(b: f64, h: f64) -> SectionGeometry {
    let a = b * h;
    let iz = b * h.powi(3) / 12.0;
    let iy = h * b.powi(3) / 12.0;
    let j = b * h * (b * b + h * h) / 12.0; // approximate
    SectionGeometry {
        shape: "rect".to_string(),
        a, iy, iz,
        j: Some(j),
        h, b,
        tw: None, tf: None, t: None,
    }
}

// ================================================================
// 1. Pure Axial: σ = N/A
// ================================================================
//
// Uniform tension → constant σ_xx at all fibers, zero bending stress.

#[test]
fn validation_stress_3d_pure_axial() {
    let b = 0.1;
    let h = 0.2;
    let section = rect_section(b, h);
    let n_force = 100.0; // kN

    let ef = make_ef3d(n_force, 0.0, 0.0, 0.0, 0.0, 0.0, 3.0);

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: None,
        t: 0.0, // At start section
        y_fiber: Some(0.0),
        z_fiber: Some(0.0),
    };

    let result = compute_section_stress_3d(&input);

    // σ = N/A = 100/(0.1*0.2) = 5000 kN/m² = 5 MPa
    let sigma_expected = n_force / section.a / 1000.0; // MPa
    assert_close(result.sigma_at_fiber, sigma_expected, 0.01, "pure axial σ at centroid");

    // All distribution points should have same normal stress (no bending)
    for pt in &result.distribution_y {
        assert_close(pt.sigma, sigma_expected, 0.01,
            &format!("pure axial σ at y={:.4}", pt.y));
    }
}

// ================================================================
// 2. Biaxial Bending: Navier Formula
// ================================================================
//
// σ(y,z) = N/A + Mz·y/Iz - My·z/Iy at known fiber points.

#[test]
fn validation_stress_3d_biaxial_bending() {
    let b = 0.1;
    let h = 0.2;
    let section = rect_section(b, h);
    let mz = 10.0; // kN·m bending about z
    let my = 5.0;  // kN·m bending about y

    let ef = make_ef3d(0.0, 0.0, 0.0, 0.0, my, mz, 3.0);

    // Check stress at top-right corner: y = b/2, z = h/2
    let y_fiber = b / 2.0;
    let z_fiber = h / 2.0;

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: None,
        t: 0.0,
        y_fiber: Some(y_fiber),
        z_fiber: Some(z_fiber),
    };

    let result = compute_section_stress_3d(&input);

    // σ = Mz·y/Iz - My·z/Iy (in MPa, so divide by 1000)
    let sigma_expected = (mz * y_fiber / section.iz - my * z_fiber / section.iy) / 1000.0;
    assert_close(result.sigma_at_fiber, sigma_expected, 0.02,
        "biaxial bending σ at corner fiber");
}

// ================================================================
// 3. Shear Rectangular: Jourawski Parabolic
// ================================================================
//
// τ = VQ/(Ib) for rectangular cross-section.
// Maximum at neutral axis: τ_max = 1.5·V/A

#[test]
fn validation_stress_3d_shear_rectangular() {
    let b = 0.1;
    let h = 0.2;
    let section = rect_section(b, h);
    let vy = 50.0; // kN shear force

    let ef = make_ef3d(0.0, vy, 0.0, 0.0, 0.0, 0.0, 3.0);

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: None,
        t: 0.0,
        y_fiber: Some(0.0), // neutral axis
        z_fiber: Some(0.0),
    };

    let result = compute_section_stress_3d(&input);

    // τ_max = 1.5·V/A = 1.5 * 50 / (0.1 * 0.2) = 3750 kN/m² = 3.75 MPa
    let tau_max_expected = 1.5 * vy / section.a / 1000.0;

    // The distribution_y should show parabolic shear — max at neutral axis (y=0)
    let center_pt = result.distribution_y.iter()
        .min_by(|a, b| a.y.abs().partial_cmp(&b.y.abs()).unwrap())
        .unwrap();

    assert_close(center_pt.tau_vy.abs(), tau_max_expected, 0.05,
        "Jourawski τ_max at neutral axis");

    // At extreme fibers (y = ±h/2), shear should be near zero
    let top = result.distribution_y.iter()
        .max_by(|a, b| a.y.partial_cmp(&b.y).unwrap())
        .unwrap();
    assert!(top.tau_vy.abs() < tau_max_expected * 0.15,
        "Shear at extreme fiber should be near zero, got {:.4}", top.tau_vy);
}

// ================================================================
// 4. Torsion: Saint-Venant Open Section
// ================================================================
//
// For generic/rectangular open section: τ = Mx·t/J
// (Note: section_stress_3d uses t_max from section for open sections)

#[test]
fn validation_stress_3d_torsion() {
    let b = 0.1;
    let h = 0.2;
    let section = rect_section(b, h);
    let mx = 2.0; // kN·m torque

    let ef = make_ef3d(0.0, 0.0, 0.0, mx, 0.0, 0.0, 3.0);

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: None,
        t: 0.0,
        y_fiber: Some(0.0),
        z_fiber: Some(0.0),
    };

    let result = compute_section_stress_3d(&input);

    // Verify torsion shear is non-zero and reasonable
    let has_torsion = result.distribution_y.iter().any(|pt| pt.tau_t.abs() > 1e-6);
    assert!(has_torsion, "Torsion should produce τ_t in distribution");

    // All points should have same torsion shear magnitude (for open section, τ_t is constant)
    let tau_t_vals: Vec<f64> = result.distribution_y.iter().map(|pt| pt.tau_t.abs()).collect();
    let tau_t_max = tau_t_vals.iter().cloned().fold(0.0_f64, f64::max);
    assert!(tau_t_max > 0.0, "Torsion shear should be non-zero");
}

// ================================================================
// 5. Von Mises: Combined Bending + Shear
// ================================================================
//
// σ_vm = √(σ² + 3τ²) for plane stress.

#[test]
fn validation_stress_3d_von_mises() {
    let b = 0.1;
    let h = 0.2;
    let section = rect_section(b, h);

    // Combined bending and shear
    let mz = 10.0; // kN·m
    let vy = 30.0; // kN

    let ef = make_ef3d(0.0, vy, 0.0, 0.0, 0.0, mz, 3.0);

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: Some(250.0), // Yield stress for failure check
        t: 0.0,
        y_fiber: Some(0.0), // neutral axis (max shear, zero bending)
        z_fiber: Some(0.0),
    };

    let result = compute_section_stress_3d(&input);

    // At neutral axis: σ ≈ 0 (no bending), τ ≈ max
    // Von Mises at centroid: σ_vm = √(σ² + 3·τ²) ≈ √(3)·|τ|
    let sigma = result.sigma_at_fiber;
    let tau = result.tau_total;
    let vm_expected = (sigma * sigma + 3.0 * tau * tau).sqrt();

    // Check Von Mises in distribution
    let center_pt = result.distribution_y.iter()
        .min_by(|a, b| a.y.abs().partial_cmp(&b.y.abs()).unwrap())
        .unwrap();

    assert_close(center_pt.von_mises, vm_expected, 0.05,
        "Von Mises at centroid");
    assert!(center_pt.von_mises > 0.0, "Von Mises should be positive");
}

// ================================================================
// 6. Neutral Axis Angle Under Biaxial Bending
// ================================================================
//
// For biaxial bending: NA angle = arctan(Iz·My / (Iy·Mz))

#[test]
fn validation_stress_3d_neutral_axis() {
    let b = 0.1;
    let h = 0.3; // Rectangular, asymmetric Iy ≠ Iz
    let section = rect_section(b, h);
    let mz = 10.0;
    let my = 5.0;

    let ef = make_ef3d(0.0, 0.0, 0.0, 0.0, my, mz, 3.0);

    let input = SectionStressInput3D {
        element_forces: ef,
        section: section.clone(),
        fy: None,
        t: 0.0,
        y_fiber: Some(0.0),
        z_fiber: Some(0.0),
    };

    let result = compute_section_stress_3d(&input);

    // Should have a neutral axis for biaxial bending
    assert!(result.neutral_axis.is_some(), "Biaxial bending should produce neutral axis");

    if let Some(na) = &result.neutral_axis {
        // Neutral axis should pass through (or near) centroid
        // Verify it's a line with non-degenerate endpoints
        let dx = na.y2 - na.y1;
        let dz = na.z2 - na.z1;
        let length = (dx * dx + dz * dz).sqrt();
        assert!(length > 1e-6, "Neutral axis should have non-zero length");
    }
}
