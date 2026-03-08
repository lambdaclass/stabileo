use dedaliano_engine::postprocess::ec3_check::*;

/// Helper: IPE 300, S275 steel — approximate SI properties.
fn ipe300_s275() -> Ec3MemberData {
    Ec3MemberData {
        element_id: 1,
        fy: 275e6,
        e: Some(210e9),
        a: 53.8e-4,       // 53.8 cm²
        wpl_y: 628e-6,    // 628 cm³
        wel_y: 557e-6,    // 557 cm³
        wpl_z: 96.9e-6,   // 96.9 cm³
        wel_z: 63.2e-6,   // 63.2 cm³
        iy: 8356e-8,      // 8356 cm⁴
        iz: 604e-8,       // 604 cm⁴
        it: 20.1e-8,      // 20.1 cm⁴
        iw: 126e-9,       // 126000 cm⁶ = 126e3 cm⁶ = 126e3 * 1e-12 = 126e-9 m⁶
        lcr_y: 5.0,
        lcr_z: 5.0,
        lb: 5.0,
        section_class: SectionClass::Class1,
        buckling_curve_y: BucklingCurve::A,
        buckling_curve_z: BucklingCurve::B,
        buckling_curve_lt: BucklingCurve::B,
        gamma_m0: Some(1.0),
        gamma_m1: Some(1.0),
        c1: Some(1.0),
        av: Some(25.7e-4), // ~50% of gross area for I-section
    }
}

/// Test 1: Pure compression — intermediate column.
#[test]
fn ec3_compression_intermediate() {
    let m = ipe300_s275();

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(-500_000.0), // 500 kN compression
            my_ed: None,
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // Npl,Rd = 53.8e-4 * 275e6 = 1479.5 kN
    // Ncr,z = pi² * 210e9 * 604e-8 / 25 = 500.2 kN
    // lambda_z = sqrt(1479500/500200) = 1.72 — slender
    assert!(r.chi_z < r.chi_y, "Weak axis should govern");
    assert!(r.compression_ratio > 0.0);
    assert!(r.nb_rd > 0.0);
}

/// Test 2: Short column — high chi.
#[test]
fn ec3_compression_short() {
    let mut m = ipe300_s275();
    m.lcr_y = 1.5;
    m.lcr_z = 1.5;

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(-800_000.0),
            my_ed: None,
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    // Short column: high chi values
    assert!(r.chi_y > 0.8, "chi_y: {:.3}", r.chi_y);
    assert!(r.chi_z > 0.5, "chi_z: {:.3}", r.chi_z);
}

/// Test 3: Pure flexure with LTB.
#[test]
fn ec3_flexure_ltb() {
    let m = ipe300_s275();

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: None,
            my_ed: Some(100_000.0), // 100 kN-m
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    // Mpl,y,Rd = 628e-6 * 275e6 = 172.7 kN-m
    // With LTB reduction, Mb,Rd < Mpl,y,Rd
    assert!(r.chi_lt > 0.0 && r.chi_lt <= 1.0);
    assert!(r.mb_rd > 0.0);
    assert!(r.mb_rd <= 628e-6 * 275e6 * 1.01);
    assert!(r.flexure_ratio_y > 0.0);
}

/// Test 4: Flexure — short unbraced length (no LTB reduction).
#[test]
fn ec3_flexure_no_ltb() {
    let mut m = ipe300_s275();
    m.lb = 1.0; // Very short — no LTB

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: None,
            my_ed: Some(150_000.0),
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    // Short Lb => lambda_LT small => chi_LT ≈ 1.0
    assert!(r.chi_lt > 0.95, "chi_LT should be ~1.0: {:.3}", r.chi_lt);
    // Mb,Rd ≈ Mpl,y,Rd = 172.7 kN-m
    assert!(r.flexure_ratio_y < 1.0);
    assert!(r.pass);
}

/// Test 5: Pure tension.
#[test]
fn ec3_pure_tension() {
    let m = ipe300_s275();

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(1_000_000.0), // 1000 kN tension
            my_ed: None,
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    // Npl,Rd = 53.8e-4 * 275e6 = 1479.5 kN
    let npl_rd = 53.8e-4 * 275e6;
    assert!(
        (r.tension_ratio - 1_000_000.0 / npl_rd).abs() < 0.01,
        "Tension ratio: {:.3}",
        r.tension_ratio
    );
    assert!(r.compression_ratio == 0.0);
    assert!(r.pass);
}

/// Test 6: Shear check.
#[test]
fn ec3_shear() {
    let m = ipe300_s275();

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: None,
            my_ed: None,
            mz_ed: None,
            v_ed: Some(200_000.0), // 200 kN
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    // Vpl,Rd = Av * (fy/sqrt(3)) / gamma_M0
    // = 25.7e-4 * 275e6/sqrt(3) / 1.0 = 25.7e-4 * 158.77e6 = 408.0 kN
    let vpl_rd = 25.7e-4 * 275e6 / 3.0_f64.sqrt();
    assert!(
        (r.shear_ratio - 200_000.0 / vpl_rd).abs() < 0.01,
        "Shear ratio: {:.3}",
        r.shear_ratio
    );
    assert!(r.pass);
}

/// Test 7: Combined compression + bending.
#[test]
fn ec3_combined_compression_bending() {
    let m = ipe300_s275();

    let input = Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(-300_000.0), // 300 kN compression
            my_ed: Some(80_000.0),  // 80 kN-m
            mz_ed: None,
            v_ed: None,
        }],
    };

    let results = check_ec3_members(&input);
    let r = &results[0];

    assert!(r.compression_ratio > 0.0);
    assert!(r.flexure_ratio_y > 0.0);
    assert!(
        r.interaction_ratio > r.compression_ratio,
        "Interaction should exceed pure compression"
    );
    assert!(
        r.interaction_ratio > r.flexure_ratio_y,
        "Interaction should exceed pure flexure"
    );
}

/// Test 8: Multiple members — sorted.
#[test]
fn ec3_multiple_members() {
    let mut m1 = ipe300_s275();
    m1.element_id = 3;

    let mut m2 = ipe300_s275();
    m2.element_id = 1;
    m2.lcr_z = 8.0; // Longer column

    let input = Ec3CheckInput {
        members: vec![m1, m2],
        forces: vec![
            Ec3DesignForces {
                element_id: 3,
                n_ed: Some(-400_000.0),
                my_ed: None,
                mz_ed: None,
                v_ed: None,
            },
            Ec3DesignForces {
                element_id: 1,
                n_ed: Some(-400_000.0),
                my_ed: None,
                mz_ed: None,
                v_ed: None,
            },
        ],
    };

    let results = check_ec3_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);

    // Longer column should have higher compression ratio
    assert!(
        results[0].compression_ratio > results[1].compression_ratio,
        "Longer column should have higher ratio"
    );
}
