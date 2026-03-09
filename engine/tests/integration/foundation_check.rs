use dedaliano_engine::postprocess::foundation_check::*;

/// Test 1: Concentric load — uniform bearing pressure.
#[test]
fn foundation_concentric_bearing() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.0,
            width: 2.0,
            thickness: 0.50,
            depth: 1.0,
            q_allowable: 200_000.0, // 200 kPa
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.40,
            col_width: 0.40,
            d: None,
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 500_000.0, // 500 kN
            mx: None,
            my: None,
            h: None,
        }],
    };

    let results = check_spread_footings(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // q = P/A = 500000 / (2*2) = 125000 Pa = 125 kPa
    assert!((r.max_bearing_pressure - 125_000.0).abs() < 1.0);
    assert!((r.bearing_ratio - 125.0 / 200.0).abs() < 1e-3);
    assert!(r.pass);
    assert_eq!(r.eccentricity_x, 0.0);
    assert_eq!(r.eccentricity_y, 0.0);
}

/// Test 2: Eccentric load — increased bearing pressure (Meyerhof).
#[test]
fn foundation_eccentric_bearing() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.5,
            width: 2.0,
            thickness: 0.50,
            depth: 1.0,
            q_allowable: 200_000.0,
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.40,
            col_width: 0.40,
            d: None,
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 600_000.0,       // 600 kN
            mx: Some(60_000.0), // 60 kN-m about length axis
            my: None,
            h: None,
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // ey = Mx/P = 60000/600000 = 0.10 m
    assert!((r.eccentricity_y - 0.10).abs() < 1e-6);

    // L' = L - 2*|ey| = 2.5 - 0.20 = 2.30 m
    // A' = 2.30 * 2.0 = 4.60 m²
    // q = 600000 / 4.60 = 130435 Pa
    let expected_q = 600_000.0 / (2.30 * 2.0);
    assert!(
        (r.max_bearing_pressure - expected_q).abs() / expected_q < 1e-3,
        "Bearing: {:.0} vs {:.0}",
        r.max_bearing_pressure,
        expected_q
    );
}

/// Test 3: Bearing capacity exceeded — fails.
#[test]
fn foundation_bearing_fails() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 1.5,
            width: 1.5,
            thickness: 0.40,
            depth: 0.8,
            q_allowable: 150_000.0, // 150 kPa
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.30,
            col_width: 0.30,
            d: None,
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 400_000.0, // 400 kN
            mx: None,
            my: None,
            h: None,
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // q = 400000 / 2.25 = 177778 Pa > 150000 Pa
    assert!(r.bearing_ratio > 1.0);
    assert!(!r.pass);
}

/// Test 4: Overturning check with horizontal force.
#[test]
fn foundation_overturning() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 3.0,
            width: 2.0,
            thickness: 0.60,
            depth: 1.5,
            q_allowable: 300_000.0,
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.50,
            col_width: 0.50,
            d: None,
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 800_000.0,
            mx: Some(100_000.0),
            my: None,
            h: Some(50_000.0),
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // Resisting moment about length axis: P * L/2 = 800000 * 1.5 = 1200000 N-m
    // Overturning moment about length axis: |Mx| + |H|*D = 100000 + 50000*1.5 = 175000 N-m
    // SF = 1200000/175000 = 6.86
    let expected_sf_x = 1_200_000.0 / 175_000.0;
    assert!(
        (r.overturning_sf_x - expected_sf_x).abs() / expected_sf_x < 1e-3,
        "OT SF_x: {:.2} vs {:.2}",
        r.overturning_sf_x,
        expected_sf_x
    );

    assert!(r.overturning_sf_x > 1.5);
    assert!(r.overturning_sf_y > 1.5);
}

/// Test 5: Sliding check.
#[test]
fn foundation_sliding() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.0,
            width: 2.0,
            thickness: 0.50,
            depth: 1.0,
            q_allowable: 200_000.0,
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.40,
            col_width: 0.40,
            d: None,
            mu_sliding: Some(0.45),
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 300_000.0,
            mx: None,
            my: None,
            h: Some(80_000.0), // 80 kN horizontal
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // Fr = mu * P = 0.45 * 300000 = 135000 N
    // SF = 135000 / 80000 = 1.6875
    let expected_sf = 0.45 * 300_000.0 / 80_000.0;
    assert!(
        (r.sliding_sf - expected_sf).abs() < 1e-3,
        "Sliding SF: {:.3} vs {:.3}",
        r.sliding_sf,
        expected_sf
    );
    assert!(r.sliding_sf > 1.5);
}

/// Test 6: One-way (beam) shear check.
#[test]
fn foundation_oneway_shear() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.0,
            width: 2.0,
            thickness: 0.50,
            depth: 1.0,
            q_allowable: 300_000.0,
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.40,
            col_width: 0.40,
            d: Some(0.425), // d = 500 - 75 = 425mm
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 1_000_000.0, // 1000 kN
            mx: None,
            my: None,
            h: None,
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // q = 1000000 / 4 = 250000 Pa
    // Critical section at d from column face:
    // dist = L/2 - col_L/2 - d = 1.0 - 0.2 - 0.425 = 0.375 m
    // Vu = q * B * dist = 250000 * 2.0 * 0.375 = 187500 N
    // phi*Vc = 0.75 * 0.17 * sqrt(28) * 2000 * 425 = 0.75 * 0.17 * 5.292 * 850000
    //        = 0.75 * 0.17 * 5.292 * 850000 = 574,538 N
    assert!(r.oneway_shear_ratio > 0.0);
    assert!(r.oneway_shear_ratio < 1.0, "One-way shear should pass");
}

/// Test 7: Two-way (punching) shear check.
#[test]
fn foundation_punching_shear() {
    let input = SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 1.8,
            width: 1.8,
            thickness: 0.40,
            depth: 1.0,
            q_allowable: 250_000.0,
            gamma_soil: 18_000.0,
            fc: 25e6,
            col_length: 0.30,
            col_width: 0.30,
            d: Some(0.325),
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 600_000.0,
            mx: None,
            my: None,
            h: None,
        }],
    };

    let results = check_spread_footings(&input);
    let r = &results[0];

    // Punching perimeter: b0 = 2*((0.30+0.325) + (0.30+0.325)) = 2*(0.625+0.625) = 2.50 m
    // Area inside: (0.625)² = 0.390625 m²
    // q = 600000/3.24 = 185185 Pa
    // Vu = 600000 - 185185 * 0.390625 = 600000 - 72338 = 527662 N
    assert!(r.punching_shear_ratio > 0.0);
    // Should be a meaningful ratio
    assert!(
        r.punching_shear_ratio < 2.0,
        "Punching ratio: {:.3}",
        r.punching_shear_ratio
    );
}

/// Test 8: Multiple footings — sorted results.
#[test]
fn foundation_multiple_footings() {
    let input = SpreadFootingInput {
        footings: vec![
            SpreadFootingData {
                footing_id: 3,
                length: 2.5,
                width: 2.5,
                thickness: 0.60,
                depth: 1.2,
                q_allowable: 250_000.0,
                gamma_soil: 18_000.0,
                fc: 28e6,
                col_length: 0.50,
                col_width: 0.50,
                d: None,
                mu_sliding: None,
            },
            SpreadFootingData {
                footing_id: 1,
                length: 2.0,
                width: 2.0,
                thickness: 0.50,
                depth: 1.0,
                q_allowable: 200_000.0,
                gamma_soil: 18_000.0,
                fc: 28e6,
                col_length: 0.40,
                col_width: 0.40,
                d: None,
                mu_sliding: None,
            },
        ],
        forces: vec![
            SpreadFootingForces {
                footing_id: 3,
                p: 800_000.0,
                mx: None,
                my: None,
                h: None,
            },
            SpreadFootingForces {
                footing_id: 1,
                p: 500_000.0,
                mx: None,
                my: None,
                h: None,
            },
        ],
    };

    let results = check_spread_footings(&input);
    assert_eq!(results.len(), 2);

    // Sorted by footing_id
    assert_eq!(results[0].footing_id, 1);
    assert_eq!(results[1].footing_id, 3);

    // Footing 1: 500000/4 = 125000 < 200000 — passes
    assert!(results[0].pass);
    // Footing 3: 800000/6.25 = 128000 < 250000 — passes
    assert!(results[1].pass);
}
