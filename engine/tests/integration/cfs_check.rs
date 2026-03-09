use dedaliano_engine::postprocess::cfs_check::*;

/// Helper: build a typical CFS C-section (C6x2x0.060) in SI units.
/// Approximate properties for a 152x51x1.52mm C-section.
fn typical_c_section() -> CfsMemberData {
    CfsMemberData {
        element_id: 1,
        fy: 345e6,   // 50 ksi = 345 MPa
        e: 200e9,    // 200 GPa
        ag: 4.84e-4, // 4.84 cm²
        ae: 4.50e-4, // ~93% effective
        ix: 1.16e-6, // 116 cm⁴
        se_x: 1.40e-5, // effective section modulus
        sf_x: 1.53e-5, // full section modulus
        iy: 1.10e-7, // 11.0 cm⁴
        se_y: 3.80e-6,
        rx: 0.0490,
        ry: 0.0151,
        j: 3.73e-10, // thin-walled torsion
        cw: 7.50e-10, // warping
        lb: 3.0,
        lc: 3.0,
        k: Some(1.0),
        cb: Some(1.0),
        fcrd: None,
        fcrd_flex: None,
        aw: None,
        h: Some(0.150),
        t: Some(0.00152),
    }
}

/// Test 1: Pure compression — stocky column.
#[test]
fn cfs_pure_compression_stocky() {
    let mut m = typical_c_section();
    m.lc = 1.0; // short column
    m.lb = 1.0;

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(-50_000.0), // 50 kN compression
            mx: None,
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // KL/ry = 1.0/0.0151 = 66.2
    // Fe = pi² * 200e9 / 66.2² = ~450 MPa
    assert!(r.fe > 300e6, "Fe should be high for short column: {:.0}", r.fe);
    assert!(r.pn > 0.0);
    assert!(r.compression_ratio > 0.0 && r.compression_ratio < 1.0);
    assert!(r.pass);
}

/// Test 2: Pure compression — slender column (elastic buckling).
#[test]
fn cfs_pure_compression_slender() {
    let mut m = typical_c_section();
    m.lc = 5.0; // long column

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(-30_000.0), // 30 kN
            mx: None,
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    // KL/ry = 5.0/0.0151 = 331 — very slender
    // Fe = pi² * 200e9 / 331² = ~18 MPa — elastic buckling governs
    assert!(r.fe < 100e6, "Fe should be low for slender: {:.0}", r.fe);
    // lambda_c > 1.5, so elastic formula applies
    let lambda_c = (345e6_f64 / r.fe).sqrt();
    assert!(lambda_c > 1.5, "lambda_c = {:.2}", lambda_c);
    assert!(r.compression_ratio > 0.0);
}

/// Test 3: Pure tension.
#[test]
fn cfs_pure_tension() {
    let m = typical_c_section();

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(100_000.0), // 100 kN tension
            mx: None,
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    // Tn = Ag * Fy = 4.84e-4 * 345e6 = 166,980 N
    // phi_t * Tn = 0.90 * 166980 = 150,282
    // ratio = 100000 / 150282 = 0.665
    let expected_tn = 4.84e-4 * 345e6;
    assert!(
        (r.tension_ratio - 100_000.0 / (0.90 * expected_tn)).abs() < 0.01,
        "Tension ratio: {:.3}",
        r.tension_ratio
    );
    assert!(r.compression_ratio == 0.0);
    assert!(r.pass);
}

/// Test 4: Pure flexure — strong axis.
#[test]
fn cfs_pure_flexure() {
    let mut m = typical_c_section();
    m.lb = 2.0; // moderate unbraced length

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: None,
            mx: Some(3_000.0), // 3 kN-m
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    assert!(r.mn_x > 0.0, "Mn_x should be positive");
    assert!(r.flexure_ratio_x > 0.0);
    // My = Sf * Fy = 1.53e-5 * 345e6 = 5278 N-m
    // Mn should be less than or equal to My
    assert!(r.mn_x <= 1.53e-5 * 345e6 * 1.01);
    assert!(r.pass);
}

/// Test 5: Shear check.
#[test]
fn cfs_shear() {
    let m = typical_c_section();

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: None,
            mx: None,
            my: None,
            shear: Some(15_000.0), // 15 kN
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    assert!(r.shear_ratio > 0.0);
    // h/t = 150/1.52 = 98.7
    // Shear yielding Vn = 0.60 * Fy * h * t = 0.60 * 345e6 * 0.15 * 0.00152 = 47,196 N
    // phi*Vn = 0.95 * 47196 = 44,836
    // ratio = 15000/44836 = 0.335 (approximate, depends on which shear formula governs)
    assert!(r.shear_ratio < 1.0, "Shear should pass: {:.3}", r.shear_ratio);
}

/// Test 6: Combined compression + bending.
#[test]
fn cfs_combined_compression_bending() {
    let mut m = typical_c_section();
    m.lc = 2.5;
    m.lb = 2.5;

    let input = CfsCheckInput {
        members: vec![m],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(-40_000.0),
            mx: Some(3_000.0),
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    // Both compression and flexure should contribute
    assert!(r.compression_ratio > 0.0);
    assert!(r.flexure_ratio_x > 0.0);
    // Interaction should be >= max of individual ratios
    assert!(
        r.interaction_ratio >= r.compression_ratio,
        "interaction {:.3} >= compression {:.3}",
        r.interaction_ratio,
        r.compression_ratio
    );
    assert!(
        r.interaction_ratio >= r.flexure_ratio_x,
        "interaction {:.3} >= flexure {:.3}",
        r.interaction_ratio,
        r.flexure_ratio_x
    );
}

/// Test 7: Distortional buckling controls compression.
#[test]
fn cfs_distortional_buckling() {
    let mut m = typical_c_section();
    m.lc = 2.0;
    m.fcrd = Some(150e6); // distortional stress lower than global

    let input = CfsCheckInput {
        members: vec![m.clone()],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(-30_000.0),
            mx: None,
            my: None,
            shear: None,
        }],
    };

    let results = check_cfs_members(&input);
    let r = &results[0];

    // With distortional buckling, Pn may be lower
    assert!(r.pn > 0.0);
    assert!(r.compression_ratio > 0.0);

    // Compare: without distortional
    let mut m2 = m;
    m2.fcrd = None;
    let input2 = CfsCheckInput {
        members: vec![m2],
        forces: vec![CfsDesignForces {
            element_id: 1,
            axial: Some(-30_000.0),
            mx: None,
            my: None,
            shear: None,
        }],
    };

    let r2 = &check_cfs_members(&input2)[0];
    // With distortional, Pn should be <= without
    assert!(
        r.pn <= r2.pn * 1.001,
        "Pn with dist ({:.0}) should be <= Pn without ({:.0})",
        r.pn,
        r2.pn
    );
}

/// Test 8: Multiple members — sorted results.
#[test]
fn cfs_multiple_members() {
    let mut m1 = typical_c_section();
    m1.element_id = 3;
    let mut m2 = typical_c_section();
    m2.element_id = 1;
    m2.lc = 4.0;
    m2.lb = 4.0;

    let input = CfsCheckInput {
        members: vec![m1, m2],
        forces: vec![
            CfsDesignForces {
                element_id: 3,
                axial: Some(-20_000.0),
                mx: None,
                my: None,
                shear: None,
            },
            CfsDesignForces {
                element_id: 1,
                axial: Some(-20_000.0),
                mx: None,
                my: None,
                shear: None,
            },
        ],
    };

    let results = check_cfs_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);

    // Longer column should have higher compression ratio (lower capacity)
    assert!(
        results[0].compression_ratio > results[1].compression_ratio,
        "Longer column should have higher ratio"
    );
}
