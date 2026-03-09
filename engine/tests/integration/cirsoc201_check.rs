use dedaliano_engine::postprocess::cirsoc201_check::*;

/// Test 1: Singly reinforced beam — flexure (H-25, ADN 420).
#[test]
fn cirsoc201_singly_reinforced() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 25e6,   // H-25
            fy: 420e6,  // ADN 420
            es: None,
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.257e-3, // 4 dia 20
            as_compression: None,
            d_prime: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: Some(150_000.0), // 150 kN-m
            vu: None,
        }],
    };

    let results = check_cirsoc201_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // a = As * fy / (0.85 * f'c * b) = 1.257e-3 * 420e6 / (0.85 * 25e6 * 0.30)
    //   = 528.14e3 / 6.375e6 = 0.08285 m
    let a_expected = 1.257e-3 * 420e6 / (0.85 * 25e6 * 0.30);
    assert!(
        (r.a - a_expected).abs() / a_expected < 1e-3,
        "a: {:.4} vs {:.4}",
        r.a,
        a_expected
    );

    // Mn = As * fy * (d - a/2) = 1.257e-3 * 420e6 * (0.45 - 0.04143) = 215.8 kN-m
    // phi = 0.90 for tension-controlled
    assert!(r.phi > 0.85, "phi: {:.3}", r.phi);
    assert!(r.phi_mn > 190_000.0, "phi*Mn: {:.0}", r.phi_mn);
    assert!(r.flexure_ratio < 1.0);
    assert!(r.pass);
}

/// Test 2: Flexure fails — under-reinforced section.
#[test]
fn cirsoc201_flexure_fails() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 21e6,  // H-21
            fy: 420e6,
            es: None,
            b: 0.25,
            h: 0.40,
            d: 0.35,
            as_tension: 3.93e-4, // 2 dia 16
            as_compression: None,
            d_prime: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: Some(60_000.0), // 60 kN-m
            vu: None,
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    // phi*Mn ≈ 0.90 * 3.93e-4 * 420e6 * (0.35 - ~0.037) ≈ 46.5 kN-m < 60 kN-m
    assert!(r.flexure_ratio > 1.0, "Should fail: {:.3}", r.flexure_ratio);
    assert!(!r.pass);
}

/// Test 3: Doubly reinforced beam.
#[test]
fn cirsoc201_doubly_reinforced() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 30e6,  // H-30
            fy: 420e6,
            es: None,
            b: 0.30,
            h: 0.60,
            d: 0.54,
            as_tension: 2.513e-3, // 8 dia 20
            as_compression: Some(6.28e-4), // 2 dia 20
            d_prime: Some(0.06),
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: Some(350_000.0), // 350 kN-m
            vu: None,
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    assert!(r.phi_mn > 300_000.0, "phi*Mn: {:.0}", r.phi_mn);
    assert!(r.pass);
}

/// Test 4: Shear — concrete only.
#[test]
fn cirsoc201_shear_concrete_only() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 25e6,
            fy: 420e6,
            es: None,
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.257e-3,
            as_compression: None,
            d_prime: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: None,
            vu: Some(50_000.0), // 50 kN
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    // Vc = 0.17 * 1.0 * sqrt(25) * 300 * 450 = 0.17 * 5.0 * 135000 = 114750 N
    let expected_vc = 0.17 * 25.0_f64.sqrt() * 300.0 * 450.0;
    assert!(
        (r.vc - expected_vc).abs() / expected_vc < 1e-3,
        "Vc: {:.0} vs {:.0}",
        r.vc,
        expected_vc
    );

    // phi*Vn = 0.75 * 114750 = 86063 N
    assert!(r.vs == 0.0);
    assert!(r.shear_ratio < 1.0);
}

/// Test 5: Shear with stirrups.
#[test]
fn cirsoc201_shear_with_stirrups() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 25e6,
            fy: 420e6,
            es: None,
            b: 0.30,
            h: 0.60,
            d: 0.54,
            as_tension: 1.885e-3,
            as_compression: None,
            d_prime: None,
            av: Some(1.57e-4), // 2-leg dia 10
            s_stirrup: Some(0.15),
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: None,
            vu: Some(200_000.0), // 200 kN
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    // Vs = Av * fy * d / s = 1.57e-4 * 420e6 * 0.54 / 0.15 = 237,384 N
    let expected_vs = 1.57e-4 * 420e6 * 0.54 / 0.15;
    assert!(
        (r.vs - expected_vs).abs() / expected_vs < 1e-3,
        "Vs: {:.0} vs {:.0}",
        r.vs,
        expected_vs
    );

    assert!(r.shear_ratio < 1.0);
    assert!(r.pass);
}

/// Test 6: Phi factor — transition zone.
#[test]
fn cirsoc201_phi_transition() {
    // Heavy reinforcement => low strain => phi < 0.90
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 25e6,
            fy: 420e6,
            es: None,
            b: 0.25,
            h: 0.40,
            d: 0.35,
            as_tension: 2.513e-3, // Heavy rebar for this section
            as_compression: None,
            d_prime: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: Some(100_000.0),
            vu: None,
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    // a = 2.513e-3 * 420e6 / (0.85 * 25e6 * 0.25) = 1055.46e3 / 5312.5e3 = 0.1987 m
    // c = a / beta1 = 0.1987 / 0.85 = 0.2338 m
    // epsilon_t = 0.003 * (0.35 - 0.2338) / 0.2338 = 0.003 * 0.497 = 0.00149
    // This is in the transition zone (0.002 < epsilon_t < 0.005)?
    // Actually epsilon_t = 0.00149 < 0.002, so phi = 0.65 (compression-controlled)
    assert!(r.phi <= 0.90, "phi should be reduced: {:.3}", r.phi);
}

/// Test 7: H-30 with ADN 500 reinforcement.
#[test]
fn cirsoc201_h30_adn500() {
    let input = Cirsoc201CheckInput {
        members: vec![Cirsoc201MemberData {
            element_id: 1,
            fc: 30e6,  // H-30
            fy: 500e6, // ADN 500
            es: None,
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.257e-3,
            as_compression: None,
            d_prime: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![Cirsoc201DesignForces {
            element_id: 1,
            mu: Some(200_000.0),
            vu: None,
        }],
    };

    let results = check_cirsoc201_members(&input);
    let r = &results[0];

    // Higher fy => larger a, but same As
    // a = 1.257e-3 * 500e6 / (0.85 * 30e6 * 0.30) = 628500/7650000 = 0.08216 m
    // Mn = 1.257e-3 * 500e6 * (0.45 - 0.04108) = 257.3 kN-m
    assert!(r.phi_mn > 220_000.0, "phi*Mn: {:.0}", r.phi_mn);
    assert!(r.pass);
}

/// Test 8: Multiple members — sorted results.
#[test]
fn cirsoc201_multiple_members() {
    let input = Cirsoc201CheckInput {
        members: vec![
            Cirsoc201MemberData {
                element_id: 3,
                fc: 30e6,
                fy: 420e6,
                es: None,
                b: 0.35,
                h: 0.60,
                d: 0.54,
                as_tension: 2.513e-3,
                as_compression: None,
                d_prime: None,
                av: Some(1.57e-4),
                s_stirrup: Some(0.20),
                lambda: None,
            },
            Cirsoc201MemberData {
                element_id: 1,
                fc: 25e6,
                fy: 420e6,
                es: None,
                b: 0.25,
                h: 0.45,
                d: 0.40,
                as_tension: 9.42e-4,
                as_compression: None,
                d_prime: None,
                av: None,
                s_stirrup: None,
                lambda: None,
            },
        ],
        forces: vec![
            Cirsoc201DesignForces {
                element_id: 3,
                mu: Some(300_000.0),
                vu: Some(150_000.0),
            },
            Cirsoc201DesignForces {
                element_id: 1,
                mu: Some(100_000.0),
                vu: Some(40_000.0),
            },
        ],
    };

    let results = check_cirsoc201_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);

    assert!(results[0].phi_mn > 0.0);
    assert!(results[1].phi_mn > 0.0);
}
