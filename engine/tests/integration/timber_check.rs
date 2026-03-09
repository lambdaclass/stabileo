use dedaliano_engine::postprocess::timber_check::*;

fn doug_fir_2x12(eid: usize, le: f64) -> TimberMemberData {
    // Douglas Fir-Larch No. 1, 2x12 (actual 38mm x 286mm)
    // Reference design values per NDS Supplement
    TimberMemberData {
        element_id: eid,
        fb: 6.9e6,    // 1000 psi ≈ 6.9 MPa
        ft: 4.5e6,    // 650 psi ≈ 4.5 MPa
        fc: 10.3e6,   // 1500 psi ≈ 10.3 MPa
        fv: 1.3e6,    // 180 psi ≈ 1.3 MPa (actually ~1.24 MPa)
        e: 12.4e9,    // 1,800,000 psi ≈ 12.4 GPa
        e_min: Some(4.6e9), // 660,000 psi ≈ 4.6 GPa
        b: 0.038,     // 1.5 in
        d: 0.286,     // 11.25 in
        le,
        lu: Some(le),
        cd: Some(1.0),
        cm: Some(1.0),
        ct: Some(1.0),
        cf_bending: Some(1.0),
        cf_tension: Some(1.0),
        cf_compression: Some(1.0),
        cfu: Some(1.0),
        ci: Some(1.0),
        cr: Some(1.15), // Repetitive member
    }
}

/// Test 1: Pure bending — joist in bending.
#[test]
fn timber_check_pure_bending() {
    let m = doug_fir_2x12(1, 3.0);
    let input = TimberCheckInput {
        members: vec![m.clone()],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 3000.0, // 3 kN-m
            n: None,
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // Section modulus S = b*d²/6 = 0.038 * 0.286² / 6 = 5.18e-4 m³
    let s = 0.038 * 0.286 * 0.286 / 6.0;
    let fb_actual = 3000.0 / s;

    // Fb' includes CL (beam stability) and Cr (repetitive)
    assert!(r.fb_prime > 0.0, "Fb' should be positive: {:.0}", r.fb_prime);

    // Bending ratio
    let expected_ratio = fb_actual / r.fb_prime;
    assert!(
        (r.bending_ratio - expected_ratio).abs() / expected_ratio < 1e-4,
        "Bending ratio: {:.3} vs {:.3}",
        r.bending_ratio,
        expected_ratio
    );

    assert!(r.compression_ratio < 1e-10, "No compression");
    assert!(r.tension_ratio < 1e-10, "No tension");
}

/// Test 2: Pure compression — short column.
#[test]
fn timber_check_pure_compression_short() {
    let m = TimberMemberData {
        element_id: 1,
        fb: 6.9e6,
        ft: 4.5e6,
        fc: 10.3e6,
        fv: 1.3e6,
        e: 12.4e9,
        e_min: Some(4.6e9),
        b: 0.089,  // 3.5 in (4x4 actual)
        d: 0.089,  // 3.5 in
        le: 0.5,   // 0.5 m — very short
        lu: Some(0.5),
        cd: Some(1.0),
        cm: Some(1.0),
        ct: Some(1.0),
        cf_bending: Some(1.0),
        cf_tension: Some(1.0),
        cf_compression: Some(1.0),
        cfu: Some(1.0),
        ci: Some(1.0),
        cr: None,
    };

    let input = TimberCheckInput {
        members: vec![m.clone()],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 0.0,
            n: Some(-30_000.0), // 30 kN compression
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // Short column: CP should be close to 1.0
    assert!(
        r.cp > 0.8,
        "Short column CP should be close to 1.0: {:.3}",
        r.cp
    );

    // Fc' = Fc * CP ≈ 10.3 MPa * ~0.95
    assert!(r.fc_prime > 0.0, "Fc' should be positive");

    // Compression ratio
    let area = 0.089 * 0.089;
    let _fc_actual = 30_000.0 / area;
    assert!(r.compression_ratio > 0.0, "Should have compression demand");
    assert!(r.tension_ratio < 1e-10, "No tension");
}

/// Test 3: Slender column — CP significantly reduced.
#[test]
fn timber_check_slender_column() {
    let m = TimberMemberData {
        element_id: 1,
        fb: 6.9e6,
        ft: 4.5e6,
        fc: 10.3e6,
        fv: 1.3e6,
        e: 12.4e9,
        e_min: Some(4.6e9),
        b: 0.089,
        d: 0.089,
        le: 3.0, // 3m — Le/d = 3.0/0.089 = 33.7
        lu: Some(3.0),
        cd: Some(1.0),
        cm: Some(1.0),
        ct: Some(1.0),
        cf_bending: Some(1.0),
        cf_tension: Some(1.0),
        cf_compression: Some(1.0),
        cfu: Some(1.0),
        ci: Some(1.0),
        cr: None,
    };

    let input = TimberCheckInput {
        members: vec![m.clone()],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 0.0,
            n: Some(-20_000.0),
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // Slender column: CP should be significantly less than 1.0
    assert!(
        r.cp < 0.5,
        "Slender column CP should be < 0.5: {:.3}",
        r.cp
    );

    // Fc' should be much less than Fc
    assert!(
        r.fc_prime < 0.5 * 10.3e6,
        "Fc' should be much less than Fc: {:.0}",
        r.fc_prime
    );
}

/// Test 4: Pure tension.
#[test]
fn timber_check_pure_tension() {
    let m = doug_fir_2x12(1, 3.0);
    let input = TimberCheckInput {
        members: vec![m],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 0.0,
            n: Some(20_000.0), // 20 kN tension
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // Ft' = Ft * CD * CM * Ct * CF * Ci = 4.5e6 * 1.0 * ... = 4.5e6
    assert!(
        (r.ft_prime - 4.5e6).abs() / 4.5e6 < 1e-6,
        "Ft': {:.0}",
        r.ft_prime
    );

    let area = 0.038 * 0.286;
    let ft_actual = 20_000.0 / area;
    let expected_ratio = ft_actual / r.ft_prime;
    assert!(
        (r.tension_ratio - expected_ratio).abs() / expected_ratio < 1e-4,
        "Tension ratio: {:.3} vs {:.3}",
        r.tension_ratio,
        expected_ratio
    );
    assert!(r.compression_ratio < 1e-10);
}

/// Test 5: Shear check.
#[test]
fn timber_check_shear() {
    let m = doug_fir_2x12(1, 3.0);
    let input = TimberCheckInput {
        members: vec![m],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 0.0,
            n: None,
            v: Some(8_000.0), // 8 kN shear
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // Fv' = Fv * CD * CM * Ct * Ci = 1.3e6
    assert!(
        (r.fv_prime - 1.3e6).abs() / 1.3e6 < 1e-6,
        "Fv': {:.0}",
        r.fv_prime
    );

    // fv = 1.5 * V / (b*d) = 1.5 * 8000 / (0.038*0.286) = 1,104,010 Pa
    let area = 0.038 * 0.286;
    let fv_actual = 1.5 * 8_000.0 / area;
    let expected_ratio = fv_actual / r.fv_prime;
    assert!(
        (r.shear_ratio - expected_ratio).abs() / expected_ratio < 1e-4,
        "Shear ratio: {:.3} vs {:.3}",
        r.shear_ratio,
        expected_ratio
    );
}

/// Test 6: Combined bending + compression (NDS 3.9.2 interaction).
#[test]
fn timber_check_combined_compression_bending() {
    let m = TimberMemberData {
        element_id: 1,
        fb: 6.9e6,
        ft: 4.5e6,
        fc: 10.3e6,
        fv: 1.3e6,
        e: 12.4e9,
        e_min: Some(4.6e9),
        b: 0.089,
        d: 0.089,
        le: 2.0,
        lu: Some(2.0),
        cd: Some(1.0),
        cm: Some(1.0),
        ct: Some(1.0),
        cf_bending: Some(1.0),
        cf_tension: Some(1.0),
        cf_compression: Some(1.0),
        cfu: Some(1.0),
        ci: Some(1.0),
        cr: None,
    };

    let input = TimberCheckInput {
        members: vec![m],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 500.0,                  // 0.5 kN-m bending
            n: Some(-15_000.0),        // 15 kN compression
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // Interaction ratio should be higher than either alone
    assert!(
        r.interaction_ratio >= r.compression_ratio,
        "Interaction >= compression: {:.3} >= {:.3}",
        r.interaction_ratio,
        r.compression_ratio
    );
    assert!(
        r.interaction_ratio >= r.bending_ratio,
        "Interaction >= bending: {:.3} >= {:.3}",
        r.interaction_ratio,
        r.bending_ratio
    );
    assert_eq!(r.governing_check, "Interaction NDS 3.9");
}

/// Test 7: Combined bending + tension (NDS 3.9.1).
#[test]
fn timber_check_combined_tension_bending() {
    let m = doug_fir_2x12(1, 3.0);
    let input = TimberCheckInput {
        members: vec![m],
        forces: vec![TimberDesignForces {
            element_id: 1,
            m: 2000.0,          // 2 kN-m
            n: Some(15_000.0),   // 15 kN tension
            v: None,
        }],
    };

    let results = check_timber_members(&input);
    let r = &results[0];

    // NDS 3.9.1: ft/Ft' + fb/Fb' <= 1.0
    let expected_interaction = r.tension_ratio + r.bending_ratio;
    assert!(
        (r.interaction_ratio - expected_interaction).abs() < 1e-6,
        "Tension+bending interaction: {:.3} vs {:.3}",
        r.interaction_ratio,
        expected_interaction
    );
}

/// Test 8: Multiple members with different conditions.
#[test]
fn timber_check_multiple_members() {
    let input = TimberCheckInput {
        members: vec![
            doug_fir_2x12(1, 3.0),
            doug_fir_2x12(2, 4.0),
            doug_fir_2x12(3, 5.0),
        ],
        forces: vec![
            TimberDesignForces { element_id: 1, m: 2000.0, n: None, v: Some(5000.0) },
            TimberDesignForces { element_id: 2, m: 0.0, n: Some(-10_000.0), v: None },
            TimberDesignForces { element_id: 3, m: 3000.0, n: Some(5000.0), v: Some(3000.0) },
        ],
    };

    let results = check_timber_members(&input);
    assert_eq!(results.len(), 3);

    // Sorted by element_id
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 2);
    assert_eq!(results[2].element_id, 3);

    // All should have positive unity ratios
    for r in &results {
        assert!(
            r.unity_ratio > 0.0,
            "Element {} should have demand",
            r.element_id
        );
    }

    // Element 2 (compression only) should have zero bending
    assert!(results[1].bending_ratio < 1e-10);
    assert!(results[1].compression_ratio > 0.0);
}
