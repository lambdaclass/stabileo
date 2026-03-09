use dedaliano_engine::postprocess::masonry_check::*;

/// Test 1: Reinforced masonry wall — pure axial compression.
#[test]
fn masonry_axial_compression() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,  // f'm = 1500 psi ≈ 10.3 MPa
            fy: 420e6,   // Grade 60
            em: None,    // 900 * f'm
            b: 1.0,      // per meter of wall length
            t: 0.20,     // 200mm block
            d: 0.10,     // centroid of rebar
            as_tension: 6.45e-4, // #5 bars @ 400mm = 645 mm²/m
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(200_000.0), // 200 kN/m
            mu: None,
            vu: None,
        }],
    };

    let results = check_masonry_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // h/t = 3.0/0.20 = 15 — stocky
    assert!((r.slenderness - 15.0).abs() < 0.1);
    assert!(r.pn > 0.0);
    assert!(r.axial_ratio > 0.0 && r.axial_ratio < 1.0);
    assert!(r.pass);
}

/// Test 2: Slender wall — high h/t.
#[test]
fn masonry_slender_wall() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.15, // 150mm block
            d: 0.075,
            as_tension: 3.93e-4,
            h: 6.0, // tall wall
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(100_000.0),
            mu: None,
            vu: None,
        }],
    };

    let results = check_masonry_members(&input);
    let r = &results[0];

    // h/t = 6.0/0.15 = 40 — slender
    assert!(r.slenderness > 30.0);
    // Capacity should be significantly reduced by slenderness
    assert!(r.pn > 0.0);
}

/// Test 3: Pure flexure — reinforced wall.
#[test]
fn masonry_pure_flexure() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 13.8e6, // f'm = 2000 psi ≈ 13.8 MPa
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.20,
            d: 0.16,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: None,
            mu: Some(30_000.0), // 30 kN-m/m
            vu: None,
        }],
    };

    let results = check_masonry_members(&input);
    let r = &results[0];

    // a = As * fy / (0.80 * f'm * b) = 6.45e-4 * 420e6 / (0.80 * 13.8e6 * 1.0)
    //   = 270900 / 11040000 = 0.02454 m
    // Mn = As * fy * (d - a/2) = 6.45e-4 * 420e6 * (0.16 - 0.01227) = 40.0 kN-m
    let a_expected = 6.45e-4 * 420e6 / (0.80 * 13.8e6 * 1.0);
    assert!(
        (r.mn - 6.45e-4 * 420e6 * (0.16 - a_expected / 2.0)).abs() < 100.0,
        "Mn: {:.0}",
        r.mn
    );
    assert!(r.flexure_ratio < 1.0);
    assert!(r.pass);
}

/// Test 4: Shear — in-plane wall shear.
#[test]
fn masonry_shear() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,
            fy: 420e6,
            em: None,
            b: 3.0, // 3m long wall
            t: 0.20,
            d: 2.50,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: Some(3.0 * 0.20), // An = 0.60 m²
            av: Some(1.42e-4),    // #4 horizontal
            s_stirrup: Some(0.40),
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(100_000.0),
            mu: Some(50_000.0),
            vu: Some(80_000.0),
        }],
    };

    let results = check_masonry_members(&input);
    let r = &results[0];

    assert!(r.vn > 0.0);
    assert!(r.shear_ratio > 0.0);
}

/// Test 5: Combined axial + flexure.
#[test]
fn masonry_combined_axial_flexure() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.20,
            d: 0.16,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(150_000.0),
            mu: Some(20_000.0),
            vu: None,
        }],
    };

    let results = check_masonry_members(&input);
    let r = &results[0];

    assert!(r.axial_ratio > 0.0);
    assert!(r.flexure_ratio > 0.0);
    assert!(
        r.interaction_ratio > r.axial_ratio,
        "Interaction should exceed axial alone"
    );
    assert!(
        r.interaction_ratio > r.flexure_ratio,
        "Interaction should exceed flexure alone"
    );
}

/// Test 6: High-strength masonry (f'm = 20.7 MPa).
#[test]
fn masonry_high_strength() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 20.7e6, // f'm = 3000 psi
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.20,
            d: 0.16,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(300_000.0),
            mu: None,
            vu: None,
        }],
    };

    let results_hs = check_masonry_members(&input);
    let r_hs = &results_hs[0];

    // Compare with lower strength
    let mut low_input = input.clone();
    low_input.members[0].fm = 10.3e6;
    let results_ls = check_masonry_members(&low_input);
    let r_ls = &results_ls[0];

    assert!(r_hs.pn > r_ls.pn, "Higher f'm should give higher Pn");
    assert!(
        r_hs.axial_ratio < r_ls.axial_ratio,
        "Higher f'm should give lower ratio"
    );
}

/// Test 7: Axial fails — overloaded.
#[test]
fn masonry_axial_fails() {
    let input = MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 6.9e6, // f'm = 1000 psi — weak masonry
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.15,
            d: 0.075,
            as_tension: 2.0e-4,
            h: 4.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(500_000.0), // Very heavy load
            mu: None,
            vu: None,
        }],
    };

    let results = check_masonry_members(&input);
    let r = &results[0];

    assert!(r.axial_ratio > 1.0, "Should fail: {:.3}", r.axial_ratio);
    assert!(!r.pass);
}

/// Test 8: Multiple members — sorted.
#[test]
fn masonry_multiple_members() {
    let input = MasonryCheckInput {
        members: vec![
            MasonryMemberData {
                element_id: 3,
                fm: 13.8e6,
                fy: 420e6,
                em: None,
                b: 1.0,
                t: 0.20,
                d: 0.16,
                as_tension: 6.45e-4,
                h: 3.0,
                k: None,
                an: None,
                av: None,
                s_stirrup: None,
            },
            MasonryMemberData {
                element_id: 1,
                fm: 10.3e6,
                fy: 420e6,
                em: None,
                b: 1.0,
                t: 0.15,
                d: 0.12,
                as_tension: 3.93e-4,
                h: 3.0,
                k: None,
                an: None,
                av: None,
                s_stirrup: None,
            },
        ],
        forces: vec![
            MasonryDesignForces {
                element_id: 3,
                pu: Some(150_000.0),
                mu: None,
                vu: None,
            },
            MasonryDesignForces {
                element_id: 1,
                pu: Some(100_000.0),
                mu: None,
                vu: None,
            },
        ],
    };

    let results = check_masonry_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);
}
