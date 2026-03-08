use dedaliano_engine::postprocess::ec2_check::*;

/// Test 1: Singly reinforced beam — flexure (C25/30, B500).
#[test]
fn ec2_singly_reinforced_flexure() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 25e6,  // C25/30
            fyk: 500e6, // B500
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.257e-3, // 4 dia 20 = 4 * pi/4 * 0.02² = 1257 mm²
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: Some(1.5),
            gamma_s: Some(1.15),
            alpha_cc: Some(1.0),
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(150_000.0), // 150 kN-m
            v_ed: None,
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // fcd = 1.0 * 25e6 / 1.5 = 16.67 MPa
    // fyd = 500e6 / 1.15 = 434.8 MPa
    // x = As * fyd / (eta * fcd * lambda * b) = 1.257e-3 * 434.8e6 / (1.0 * 16.67e6 * 0.8 * 0.30)
    //   = 546682.6 / 4001600 = 0.1366 m
    let fcd = 25e6 / 1.5;
    let fyd = 500e6 / 1.15;
    let x_expected = 1.257e-3 * fyd / (1.0 * fcd * 0.8 * 0.30);
    assert!(
        (r.x_na - x_expected).abs() / x_expected < 1e-3,
        "x: {:.4} vs {:.4}",
        r.x_na,
        x_expected
    );

    // z = d - lambda*x/2 = 0.45 - 0.8*0.1366/2 = 0.45 - 0.0547 = 0.3953
    let z_expected = 0.45 - 0.8 * x_expected / 2.0;
    assert!(
        (r.z - z_expected).abs() / z_expected < 1e-3,
        "z: {:.4} vs {:.4}",
        r.z,
        z_expected
    );

    // MRd = As * fyd * z = 1.257e-3 * 434.8e6 * 0.3953 = 216 kN-m approx
    assert!(r.m_rd > 200_000.0, "MRd should be > 200 kN-m: {:.0}", r.m_rd);
    assert!(r.flexure_ratio < 1.0);
    assert!(r.pass);
}

/// Test 2: Flexure fails — insufficient reinforcement.
#[test]
fn ec2_flexure_fails() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 25e6,
            fyk: 500e6,
            b: 0.25,
            h: 0.40,
            d: 0.35,
            as_tension: 3.93e-4, // 2 dia 16 = 402 mm²
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: None,
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(80_000.0), // 80 kN-m
            v_ed: None,
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    let r = &results[0];

    // MRd ≈ 3.93e-4 * (500/1.15)*1e6 * ~0.33 ≈ 56 kN-m < 80 kN-m
    assert!(r.flexure_ratio > 1.0, "Should fail: {:.3}", r.flexure_ratio);
    assert!(!r.pass);
}

/// Test 3: Doubly reinforced beam.
#[test]
fn ec2_doubly_reinforced() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 30e6,  // C30/37
            fyk: 500e6,
            b: 0.30,
            h: 0.60,
            d: 0.54,
            as_tension: 2.513e-3, // 8 dia 20
            as_compression: Some(6.28e-4), // 2 dia 20
            d_prime: Some(0.06),
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: Some(1.0),
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(400_000.0), // 400 kN-m
            v_ed: None,
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    let r = &results[0];

    // Doubly reinforced should have higher MRd than singly reinforced
    assert!(r.m_rd > 350_000.0, "MRd: {:.0}", r.m_rd);
    assert!(r.pass);
}

/// Test 4: Shear — concrete only (no stirrups).
#[test]
fn ec2_shear_concrete_only() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 25e6,
            fyk: 500e6,
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.257e-3,
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: None,
            asw: None,  // No stirrups
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: None,
            v_ed: Some(50_000.0), // 50 kN
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    let r = &results[0];

    // VRd,c = CRd,c * k * (100 * rho_l * fck)^(1/3) * bw * d
    // k = min(1 + sqrt(200/450), 2.0) = 1.667
    // rho_l = 1257/(300*450) = 0.00931
    // CRd,c = 0.18/1.5 = 0.12
    // VRd,c = 0.12 * 1.667 * (100 * 0.00931 * 25)^0.333 * 300 * 450 = ... (in mm/MPa units)
    assert!(r.v_rdc > 0.0);
    assert!(r.v_rds == 0.0); // No stirrups
    assert!(r.shear_ratio > 0.0);
}

/// Test 5: Shear with stirrups.
#[test]
fn ec2_shear_with_stirrups() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 30e6,
            fyk: 500e6,
            b: 0.30,
            h: 0.60,
            d: 0.54,
            as_tension: 1.885e-3,
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: Some(1.0),
            asw: Some(1.57e-4), // 2-leg dia 10 = 157 mm²
            s_stirrup: Some(0.20),
            theta_shear: None, // Use default 21.8 degrees (cot=2.5)
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: None,
            v_ed: Some(200_000.0), // 200 kN
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    let r = &results[0];

    // VRd,s = Asw/s * z * fywd * cot(theta)
    // = (1.57e-4 / 0.20) * 0.9*0.54 * (500e6/1.15) * 2.5
    // = 7.85e-4 * 0.486 * 434.8e6 * 2.5
    // = 414,632 N ≈ 415 kN
    assert!(r.v_rds > 200_000.0, "VRd,s should be > 200 kN: {:.0}", r.v_rds);
    assert!(r.v_rd_max > 0.0);
    assert!(r.shear_ratio < 1.0);
    assert!(r.pass);
}

/// Test 6: High-strength concrete (C50/60).
#[test]
fn ec2_high_strength_concrete() {
    let input = Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 50e6,
            fyk: 500e6,
            b: 0.30,
            h: 0.50,
            d: 0.45,
            as_tension: 1.885e-3,
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: None,
            gamma_s: None,
            alpha_cc: Some(1.0),
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(250_000.0),
            v_ed: None,
            n_ed: None,
        }],
    };

    let results = check_ec2_members(&input);
    let r = &results[0];

    // fcd = 50/1.5 = 33.3 MPa — higher capacity
    // lambda = 0.8, eta = 1.0 (fck = 50 MPa, boundary)
    assert!(r.m_rd > 200_000.0);
    assert!(r.pass);
}

/// Test 7: alpha_cc = 0.85 (French NA).
#[test]
fn ec2_french_na_alpha_cc() {
    let base_member = Ec2MemberData {
        element_id: 1,
        fck: 25e6,
        fyk: 500e6,
        b: 0.30,
        h: 0.50,
        d: 0.45,
        as_tension: 1.257e-3,
        as_compression: None,
        d_prime: None,
        es: None,
        gamma_c: None,
        gamma_s: None,
        alpha_cc: Some(1.0), // UK NA
        asw: None,
        s_stirrup: None,
        theta_shear: None,
        bw: None,
        z: None,
    };

    let forces = Ec2DesignForces {
        element_id: 1,
        m_ed: Some(200_000.0),
        v_ed: None,
        n_ed: None,
    };

    let input_uk = Ec2CheckInput {
        members: vec![base_member.clone()],
        forces: vec![forces.clone()],
    };
    let r_uk = &check_ec2_members(&input_uk)[0];

    let mut french_member = base_member;
    french_member.alpha_cc = Some(0.85);
    let input_fr = Ec2CheckInput {
        members: vec![french_member],
        forces: vec![forces],
    };
    let r_fr = &check_ec2_members(&input_fr)[0];

    // French NA gives lower fcd, so slightly lower capacity but
    // the difference is small because the steel force is the same
    // The neutral axis is deeper with lower fcd
    assert!(r_fr.x_na > r_uk.x_na, "French NA => deeper NA");
    // MRd should be slightly lower (lever arm reduced)
    assert!(r_fr.m_rd < r_uk.m_rd, "French NA => lower MRd");
}

/// Test 8: Multiple members — sorted results.
#[test]
fn ec2_multiple_members() {
    let input = Ec2CheckInput {
        members: vec![
            Ec2MemberData {
                element_id: 3,
                fck: 30e6,
                fyk: 500e6,
                b: 0.35,
                h: 0.60,
                d: 0.54,
                as_tension: 2.513e-3,
                as_compression: None,
                d_prime: None,
                es: None,
                gamma_c: None,
                gamma_s: None,
                alpha_cc: None,
                asw: Some(1.57e-4),
                s_stirrup: Some(0.15),
                theta_shear: None,
                bw: None,
                z: None,
            },
            Ec2MemberData {
                element_id: 1,
                fck: 25e6,
                fyk: 500e6,
                b: 0.25,
                h: 0.45,
                d: 0.40,
                as_tension: 9.42e-4,
                as_compression: None,
                d_prime: None,
                es: None,
                gamma_c: None,
                gamma_s: None,
                alpha_cc: None,
                asw: None,
                s_stirrup: None,
                theta_shear: None,
                bw: None,
                z: None,
            },
        ],
        forces: vec![
            Ec2DesignForces {
                element_id: 3,
                m_ed: Some(300_000.0),
                v_ed: Some(150_000.0),
                n_ed: None,
            },
            Ec2DesignForces {
                element_id: 1,
                m_ed: Some(100_000.0),
                v_ed: Some(40_000.0),
                n_ed: None,
            },
        ],
    };

    let results = check_ec2_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);

    // Both should have positive capacities
    assert!(results[0].m_rd > 0.0);
    assert!(results[1].m_rd > 0.0);
}
