use dedaliano_engine::postprocess::connection_check::*;

// ==================== Bolt Group Tests ====================

/// Test 1: Single bolt — direct shear only.
#[test]
fn bolt_group_single_bolt_direct_shear() {
    let input = BoltGroupInput {
        groups: vec![BoltGroupData {
            connection_id: 1,
            bolts: vec![BoltPosition { x: 0.0, y: 0.0 }],
            rn_shear: 100_000.0, // 100 kN per bolt
            rn_bearing: None,
            phi: Some(0.75),
        }],
        forces: vec![BoltGroupForces {
            connection_id: 1,
            vx: 50_000.0, // 50 kN
            vy: 0.0,
            m: None,
        }],
    };

    let results = check_bolt_groups(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // phi*Rn = 0.75 * 100 = 75 kN
    assert!((r.phi_rn - 75_000.0).abs() < 1.0);
    // Max bolt force = 50 kN (only bolt takes all)
    assert!((r.max_bolt_force - 50_000.0).abs() < 1.0);
    // Unity = 50/75 = 0.667
    assert!((r.unity_ratio - 50.0 / 75.0).abs() < 1e-4);
}

/// Test 2: Four-bolt pattern — direct shear shared equally.
#[test]
fn bolt_group_four_bolts_direct_shear() {
    let input = BoltGroupInput {
        groups: vec![BoltGroupData {
            connection_id: 1,
            bolts: vec![
                BoltPosition { x: -0.05, y: -0.05 },
                BoltPosition { x: 0.05, y: -0.05 },
                BoltPosition { x: -0.05, y: 0.05 },
                BoltPosition { x: 0.05, y: 0.05 },
            ],
            rn_shear: 100_000.0,
            rn_bearing: None,
            phi: Some(0.75),
        }],
        forces: vec![BoltGroupForces {
            connection_id: 1,
            vx: 200_000.0, // 200 kN total
            vy: 0.0,
            m: None,
        }],
    };

    let results = check_bolt_groups(&input);
    let r = &results[0];

    // Each bolt takes 200/4 = 50 kN
    assert!((r.max_bolt_force - 50_000.0).abs() < 1.0);
    // Unity = 50/75 = 0.667
    assert!((r.unity_ratio - 50.0 / 75.0).abs() < 1e-3);
}

/// Test 3: Four-bolt pattern — eccentric moment.
#[test]
fn bolt_group_eccentric_moment() {
    let input = BoltGroupInput {
        groups: vec![BoltGroupData {
            connection_id: 1,
            bolts: vec![
                BoltPosition { x: -0.05, y: -0.10 },
                BoltPosition { x: 0.05, y: -0.10 },
                BoltPosition { x: -0.05, y: 0.10 },
                BoltPosition { x: 0.05, y: 0.10 },
            ],
            rn_shear: 100_000.0,
            rn_bearing: None,
            phi: Some(0.75),
        }],
        forces: vec![BoltGroupForces {
            connection_id: 1,
            vx: 0.0,
            vy: 0.0,
            m: Some(10_000.0), // 10 kN-m moment
        }],
    };

    let results = check_bolt_groups(&input);
    let r = &results[0];

    // Ip = sum(x² + y²) = 4 * (0.05² + 0.10²) = 4 * 0.0125 = 0.05
    let ip_expected = 4.0 * (0.05_f64.powi(2) + 0.10_f64.powi(2));
    assert!(
        (r.ip - ip_expected).abs() / ip_expected < 1e-4,
        "Ip: {:.6} vs {:.6}",
        r.ip,
        ip_expected
    );

    // All bolts are at same distance from centroid: r = sqrt(0.05² + 0.10²) = 0.1118 m
    // Force per bolt = M * r / Ip = 10000 * 0.1118 / 0.05 = 22360 N
    let r_bolt = (0.05_f64.powi(2) + 0.10_f64.powi(2)).sqrt();
    let expected_force = 10_000.0 * r_bolt / ip_expected;
    assert!(
        (r.max_bolt_force - expected_force).abs() / expected_force < 1e-3,
        "Max bolt force: {:.0} vs {:.0}",
        r.max_bolt_force,
        expected_force
    );

    assert!(r.unity_ratio > 0.0);
}

/// Test 4: Combined direct shear + moment.
#[test]
fn bolt_group_combined_shear_moment() {
    let input = BoltGroupInput {
        groups: vec![BoltGroupData {
            connection_id: 1,
            bolts: vec![
                BoltPosition { x: 0.0, y: -0.075 },
                BoltPosition { x: 0.0, y: 0.0 },
                BoltPosition { x: 0.0, y: 0.075 },
            ],
            rn_shear: 80_000.0,
            rn_bearing: None,
            phi: Some(0.75),
        }],
        forces: vec![BoltGroupForces {
            connection_id: 1,
            vx: 60_000.0,
            vy: 0.0,
            m: Some(5_000.0),
        }],
    };

    let results = check_bolt_groups(&input);
    let r = &results[0];

    // Direct shear per bolt = 60000/3 = 20000 N (in x direction)
    // Moment-induced force: perpendicular to radius from centroid
    // Corner bolts have max force from combined effects
    assert!(r.max_bolt_force > 20_000.0, "Combined > direct only");
    assert!(r.unity_ratio > 0.0);
}

// ==================== Weld Group Tests ====================

/// Test 5: Single horizontal weld — direct shear.
#[test]
fn weld_group_single_weld_direct_shear() {
    let input = WeldGroupInput {
        groups: vec![WeldGroupData {
            connection_id: 1,
            segments: vec![WeldSegment {
                x1: 0.0,
                y1: 0.0,
                x2: 0.20,
                y2: 0.0,
                size: 0.006, // 6mm fillet
            }],
            fexx: 482e6, // E70XX
            phi: Some(0.75),
        }],
        forces: vec![WeldGroupForces {
            connection_id: 1,
            vx: 50_000.0,
            vy: 0.0,
            m: None,
        }],
    };

    let results = check_weld_groups(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // Throat = 0.707 * 6mm = 4.24mm
    // Area = 0.00424 * 0.20 = 8.485e-4 m²
    let throat = 0.707 * 0.006;
    let area = throat * 0.20;
    assert!(
        (r.total_throat_area - area).abs() / area < 1e-3,
        "Throat area: {:.6} vs {:.6}",
        r.total_throat_area,
        area
    );

    // Stress = 50000 / 8.485e-4 = 58.9 MPa
    let expected_stress = 50_000.0 / area;
    assert!(
        (r.max_weld_stress - expected_stress).abs() / expected_stress < 0.05,
        "Weld stress: {:.0} vs {:.0}",
        r.max_weld_stress,
        expected_stress
    );

    // phi*Fnw = 0.75 * 0.60 * 482e6 = 216.9 MPa
    let expected_phi_fnw = 0.75 * 0.60 * 482e6;
    assert!(
        (r.phi_fnw - expected_phi_fnw).abs() / expected_phi_fnw < 1e-6,
        "phi*Fnw: {:.0} vs {:.0}",
        r.phi_fnw,
        expected_phi_fnw
    );

    assert!(r.unity_ratio > 0.0 && r.unity_ratio < 1.0);
}

/// Test 6: C-shaped weld (two vertical + one horizontal).
#[test]
fn weld_group_c_shape() {
    let input = WeldGroupInput {
        groups: vec![WeldGroupData {
            connection_id: 1,
            segments: vec![
                WeldSegment { x1: 0.0, y1: 0.0, x2: 0.0, y2: 0.20, size: 0.008 },
                WeldSegment { x1: 0.0, y1: 0.20, x2: 0.15, y2: 0.20, size: 0.008 },
                WeldSegment { x1: 0.15, y1: 0.20, x2: 0.15, y2: 0.0, size: 0.008 },
            ],
            fexx: 482e6,
            phi: Some(0.75),
        }],
        forces: vec![WeldGroupForces {
            connection_id: 1,
            vx: 0.0,
            vy: 100_000.0,
            m: None,
        }],
    };

    let results = check_weld_groups(&input);
    let r = &results[0];

    // Total length = 0.20 + 0.15 + 0.20 = 0.55 m
    assert!(
        (r.total_length - 0.55).abs() < 1e-4,
        "Total length: {:.3}",
        r.total_length
    );
    assert!(r.unity_ratio > 0.0);
}

/// Test 7: Weld with eccentric moment.
#[test]
fn weld_group_eccentric() {
    let input = WeldGroupInput {
        groups: vec![WeldGroupData {
            connection_id: 1,
            segments: vec![
                WeldSegment { x1: 0.0, y1: -0.10, x2: 0.0, y2: 0.10, size: 0.006 },
                WeldSegment { x1: 0.15, y1: -0.10, x2: 0.15, y2: 0.10, size: 0.006 },
            ],
            fexx: 482e6,
            phi: Some(0.75),
        }],
        forces: vec![WeldGroupForces {
            connection_id: 1,
            vx: 80_000.0,
            vy: 0.0,
            m: Some(8_000.0), // 8 kN-m
        }],
    };

    let results = check_weld_groups(&input);
    let r = &results[0];

    // With moment, stress at corners should be higher than direct shear alone
    let direct_stress = 80_000.0 / r.total_throat_area;
    assert!(
        r.max_weld_stress > direct_stress * 0.9,
        "Eccentric stress should be at least close to direct: {:.0} vs {:.0}",
        r.max_weld_stress,
        direct_stress
    );
    assert!(r.unity_ratio > 0.0);
}

/// Test 8: Bearing controls over shear.
#[test]
fn bolt_group_bearing_controls() {
    let input = BoltGroupInput {
        groups: vec![BoltGroupData {
            connection_id: 1,
            bolts: vec![
                BoltPosition { x: 0.0, y: -0.05 },
                BoltPosition { x: 0.0, y: 0.05 },
            ],
            rn_shear: 100_000.0,
            rn_bearing: Some(60_000.0), // Bearing is lower
            phi: Some(0.75),
        }],
        forces: vec![BoltGroupForces {
            connection_id: 1,
            vx: 40_000.0,
            vy: 0.0,
            m: None,
        }],
    };

    let results = check_bolt_groups(&input);
    let r = &results[0];

    // phi*Rn = 0.75 * min(100000, 60000) = 0.75 * 60000 = 45000 N
    assert!((r.phi_rn - 45_000.0).abs() < 1.0);

    // Each bolt takes 20 kN
    // Unity = 20000 / 45000 = 0.444
    assert!(
        (r.unity_ratio - 20_000.0 / 45_000.0).abs() < 1e-3,
        "Unity: {:.3}",
        r.unity_ratio
    );
}
