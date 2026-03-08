use dedaliano_engine::postprocess::steel_check::*;

fn w14x22_data(eid: usize, lby: f64, lbz: f64) -> SteelMemberData {
    // W14x22 properties (AISC 14th ed.) converted to SI
    // Conversion factors: 1 in=0.0254m, 1 in²=6.452e-4 m², 1 in³=1.639e-5 m³,
    //                     1 in⁴=4.162e-7 m⁴, 1 in⁶=2.685e-10 m⁶
    SteelMemberData {
        element_id: eid,
        fy: 345e6,        // 50 ksi = 345 MPa
        ag: 4.19e-3,      // 6.49 in²
        an: None,
        u_factor: None,
        lby,
        lbz,
        ky: None,
        kz: None,
        iy: 8.28e-5,      // Ix = 199 in⁴ (strong axis)
        iz: 2.91e-6,      // Iy = 7.00 in⁴ (weak axis)
        ry: 0.1407,       // rx = 5.54 in (strong axis)
        rz: 0.02642,      // ry = 1.04 in (weak axis)
        zy: 5.44e-4,      // Zx = 33.2 in³ (strong axis)
        zz: 7.19e-5,      // Zy = 4.39 in³ (weak axis)
        sy: 4.75e-4,      // Sx = 29.0 in³ (strong axis)
        sz: 4.59e-5,      // Sy = 2.80 in³ (weak axis)
        j: 8.66e-8,       // J = 0.208 in⁴
        cw: Some(8.43e-8), // Cw = 314 in⁶
        lb: Some(lbz),
        cb: Some(1.0),
        e: 200e9,
        g: Some(77e9),
        depth: Some(0.348), // d = 13.7 in
    }
}

/// Test 1: Pure tension member — capacity = phi * Fy * Ag.
#[test]
fn steel_check_pure_tension() {
    let input = SteelCheckInput {
        members: vec![w14x22_data(1, 3.0, 3.0)],
        forces: vec![ElementDesignForces {
            element_id: 1,
            n: 500e3,  // 500 kN tension
            my: 0.0,
            mz: None,
            vy: None,
        }],
    };

    let results = check_steel_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // phi * Pn_tension = 0.90 * 345e6 * 4.19e-3 = 1301 kN
    let expected_phi_pn = 0.90 * 345e6 * 4.19e-3;
    assert!((r.phi_pn_tension - expected_phi_pn).abs() / expected_phi_pn < 1e-6,
        "phi*Pn_tension: {:.0} vs {:.0}", r.phi_pn_tension, expected_phi_pn);

    // Tension ratio = 500e3 / 1301e3 ≈ 0.384
    assert!(r.tension_ratio > 0.3 && r.tension_ratio < 0.5,
        "Tension ratio: {:.3}", r.tension_ratio);
    assert!(r.compression_ratio < 1e-10, "No compression");
}

/// Test 2: Pure compression — check Euler buckling.
#[test]
fn steel_check_pure_compression() {
    let input = SteelCheckInput {
        members: vec![w14x22_data(1, 5.0, 5.0)],
        forces: vec![ElementDesignForces {
            element_id: 1,
            n: -300e3,  // 300 kN compression
            my: 0.0,
            mz: None,
            vy: None,
        }],
    };

    let results = check_steel_members(&input);
    let r = &results[0];

    // Compression capacity should be positive and > 0
    assert!(r.phi_pn_compression > 0.0,
        "Compression capacity: {:.0}", r.phi_pn_compression);

    // Compression ratio > 0
    assert!(r.compression_ratio > 0.0, "Should have compression demand");
    assert!(r.tension_ratio < 1e-10, "No tension");

    // For KL/r = 5.0/0.02642 = 189 (very slender), capacity should be much less than yield
    let yield_capacity = 0.90 * 345e6 * 4.19e-3;
    assert!(r.phi_pn_compression < yield_capacity * 0.3,
        "Slender compression: {:.0} < {:.0}", r.phi_pn_compression, yield_capacity * 0.3);
}

/// Test 3: Pure bending about Y-axis (major axis).
#[test]
fn steel_check_pure_flexure_y() {
    let input = SteelCheckInput {
        members: vec![w14x22_data(1, 2.0, 2.0)],
        forces: vec![ElementDesignForces {
            element_id: 1,
            n: 0.0,
            my: 80e3,  // 80 kN-m
            mz: None,
            vy: None,
        }],
    };

    let results = check_steel_members(&input);
    let r = &results[0];

    // phi * Mp = 0.90 * 345e6 * 5.44e-4 = 168.9 kN-m
    let phi_mp = 0.90 * 345e6 * 5.44e-4;
    // Actual capacity may be less due to LTB
    assert!(r.phi_mn_y > 0.0 && r.phi_mn_y <= phi_mp * 1.01,
        "phi*Mn_y: {:.0} <= {:.0}", r.phi_mn_y, phi_mp);

    // Flexure ratio
    assert!(r.flexure_y_ratio > 0.5 && r.flexure_y_ratio < 1.5,
        "Flexure-Y ratio: {:.3}", r.flexure_y_ratio);

    // No compression or tension demand
    assert!(r.compression_ratio < 1e-10);
    assert!(r.tension_ratio < 1e-10);
}

/// Test 4: Combined axial + bending (AISC H1 interaction).
#[test]
fn steel_check_combined_loading() {
    let input = SteelCheckInput {
        members: vec![w14x22_data(1, 3.0, 3.0)],
        forces: vec![ElementDesignForces {
            element_id: 1,
            n: -200e3,   // 200 kN compression
            my: 50e3,    // 50 kN-m
            mz: Some(10e3),  // 10 kN-m minor axis
            vy: None,
        }],
    };

    let results = check_steel_members(&input);
    let r = &results[0];

    // Interaction ratio should be sum of demand/capacity ratios
    assert!(r.interaction_ratio > 0.0, "Should have interaction demand");

    // Interaction should be >= max of individual ratios
    assert!(r.interaction_ratio >= r.compression_ratio,
        "Interaction >= compression: {:.3} >= {:.3}",
        r.interaction_ratio, r.compression_ratio);
    assert!(r.interaction_ratio >= r.flexure_y_ratio,
        "Interaction >= flexure: {:.3} >= {:.3}",
        r.interaction_ratio, r.flexure_y_ratio);

    // Governing check should be interaction
    assert_eq!(r.governing_check, "Interaction H1");
}

/// Test 5: Short stocky column — compression capacity near yield.
#[test]
fn steel_check_stocky_column() {
    let input = SteelCheckInput {
        members: vec![w14x22_data(1, 1.0, 1.0)], // Very short Lb
        forces: vec![ElementDesignForces {
            element_id: 1,
            n: -1000e3,  // 1000 kN compression
            my: 0.0,
            mz: None,
            vy: None,
        }],
    };

    let results = check_steel_members(&input);
    let r = &results[0];

    // For short column (KL/r ~ 1.0/0.02642 = 38), capacity should be close to yield
    let yield_capacity = 0.90 * 345e6 * 4.19e-3;
    assert!(r.phi_pn_compression > yield_capacity * 0.5,
        "Stocky column: {:.0} > {:.0}", r.phi_pn_compression, yield_capacity * 0.5);
}

/// Test 6: Multiple members check — all get results.
#[test]
fn steel_check_multiple_members() {
    let input = SteelCheckInput {
        members: vec![
            w14x22_data(1, 3.0, 3.0),
            w14x22_data(2, 4.0, 4.0),
            w14x22_data(3, 5.0, 5.0),
        ],
        forces: vec![
            ElementDesignForces { element_id: 1, n: -100e3, my: 30e3, mz: None, vy: None },
            ElementDesignForces { element_id: 2, n: 200e3, my: 0.0, mz: None, vy: None },
            ElementDesignForces { element_id: 3, n: -50e3, my: 60e3, mz: Some(5e3), vy: None },
        ],
    };

    let results = check_steel_members(&input);
    assert_eq!(results.len(), 3);

    // Results should be sorted by element_id
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 2);
    assert_eq!(results[2].element_id, 3);

    // All should have positive unity ratios
    for r in &results {
        assert!(r.unity_ratio > 0.0, "Element {} should have demand", r.element_id);
    }

    // Element 2 (tension only) should have tension governing
    assert!(results[1].tension_ratio > 0.0);
    assert!(results[1].compression_ratio < 1e-10);
}
