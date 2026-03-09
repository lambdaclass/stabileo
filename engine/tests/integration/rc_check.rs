use dedaliano_engine::postprocess::rc_check::*;

fn rectangular_beam(eid: usize, b: f64, h: f64, d: f64, as_t: f64) -> RCMemberData {
    // Standard rectangular beam with f'c=28 MPa, fy=420 MPa
    RCMemberData {
        element_id: eid,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b,
        h,
        d,
        d_prime: None,
        as_tension: as_t,
        as_compression: None,
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    }
}

/// Test 1: Singly reinforced rectangular beam — hand-calculated capacity.
/// b=300mm, d=500mm, As=1500mm², f'c=28MPa, fy=420MPa
#[test]
fn rc_check_singly_reinforced_flexure() {
    let m = rectangular_beam(1, 0.30, 0.55, 0.50, 1500e-6);
    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 200e3, // 200 kN-m
            vu: None,
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    assert_eq!(results.len(), 1);
    let r = &results[0];

    // Hand calc: a = As*fy / (0.85*fc*b) = 1500e-6*420e6 / (0.85*28e6*0.30)
    //          = 630 / 7140 = 0.08824 m = 88.2 mm
    let a_expected = 1500e-6 * 420e6 / (0.85 * 28e6 * 0.30);
    assert!(
        (r.a - a_expected).abs() / a_expected < 1e-4,
        "a: {:.4} vs {:.4}",
        r.a,
        a_expected
    );

    // beta1 for 28 MPa = 0.85
    // c = a / beta1 = 0.08824 / 0.85 = 0.1038 m
    let c_expected = a_expected / 0.85;
    assert!(
        (r.c - c_expected).abs() / c_expected < 1e-4,
        "c: {:.4} vs {:.4}",
        r.c,
        c_expected
    );

    // epsilon_t = 0.003 * (d - c) / c = 0.003 * (0.50 - 0.1038) / 0.1038 = 0.01145
    // This is > 0.005, so tension-controlled, phi = 0.90
    assert!(r.tension_controlled, "Should be tension-controlled");
    assert!(
        (r.phi_flexure - 0.90).abs() < 1e-6,
        "phi: {:.3}",
        r.phi_flexure
    );

    // Mn = As*fy*(d - a/2) = 1500e-6 * 420e6 * (0.50 - 0.08824/2)
    //    = 630000 * 0.45588 = 287,204 N-m
    // phi*Mn = 0.90 * 287,204 = 258,484 N-m
    let mn = 1500e-6 * 420e6 * (0.50 - a_expected / 2.0);
    let phi_mn_expected = 0.90 * mn;
    assert!(
        (r.phi_mn - phi_mn_expected).abs() / phi_mn_expected < 1e-4,
        "phi*Mn: {:.0} vs {:.0}",
        r.phi_mn,
        phi_mn_expected
    );

    // Flexure ratio = 200e3 / 258484 ≈ 0.774
    assert!(
        r.flexure_ratio > 0.7 && r.flexure_ratio < 0.9,
        "Flexure ratio: {:.3}",
        r.flexure_ratio
    );
}

/// Test 2: Doubly reinforced beam.
/// As=3000mm², As'=1000mm², d'=50mm
#[test]
fn rc_check_doubly_reinforced() {
    let m = RCMemberData {
        element_id: 1,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.30,
        h: 0.55,
        d: 0.50,
        d_prime: Some(0.05),
        as_tension: 3000e-6,
        as_compression: Some(1000e-6),
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    };

    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 400e3,
            vu: None,
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // Doubly reinforced: a = (As - As')*fy / (0.85*fc*b)
    //   = (3000-1000)e-6 * 420e6 / (0.85*28e6*0.30) = 840000/7140 = 0.1176 m
    // phi*Mn should be significantly more than singly reinforced with 2000mm²
    assert!(r.phi_mn > 350e3, "phi*Mn should be > 350 kN-m: {:.0}", r.phi_mn);
    assert!(r.tension_controlled, "Should be tension-controlled");
    assert!(r.flexure_ratio > 0.0, "Should have flexure demand");
}

/// Test 3: T-beam with NA in flange.
#[test]
fn rc_check_tbeam_na_in_flange() {
    let m = RCMemberData {
        element_id: 1,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.25,  // web width
        h: 0.60,
        d: 0.55,
        d_prime: None,
        as_tension: 1200e-6, // small As — NA should be in flange
        as_compression: None,
        section_type: RCSectionType::TBeam,
        bf: Some(1.0),   // 1m effective flange width
        hf: Some(0.12),  // 120mm flange
        av: None,
        s_stirrup: None,
        lambda: None,
    };

    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 250e3,
            vu: None,
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // a = As*fy / (0.85*fc*bf) = 1200e-6 * 420e6 / (0.85*28e6*1.0)
    //   = 504000 / 23800000 = 0.02118 m = 21.2 mm < hf=120mm → NA in flange
    assert!(
        r.a < 0.12,
        "NA should be in flange: a={:.4} < hf=0.12",
        r.a
    );

    // Acts like wide rectangular section
    assert!(r.phi_mn > 0.0);
    assert!(r.tension_controlled);
}

/// Test 4: T-beam with NA in web.
#[test]
fn rc_check_tbeam_na_in_web() {
    let m = RCMemberData {
        element_id: 1,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.25,   // web width
        h: 0.60,
        d: 0.55,
        d_prime: None,
        as_tension: 5000e-6, // large As — NA should enter web
        as_compression: None,
        section_type: RCSectionType::TBeam,
        bf: Some(0.80),
        hf: Some(0.10), // 100mm flange
        av: None,
        s_stirrup: None,
        lambda: None,
    };

    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 600e3,
            vu: None,
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // a_flange = As*fy / (0.85*fc*bf) = 5000e-6*420e6 / (0.85*28e6*0.80) = 2100000/19040000 = 0.1103 > hf=0.10
    // NA is in the web
    assert!(r.phi_mn > 0.0, "Should have flexural capacity");
    assert!(r.flexure_ratio > 0.0, "Should have flexure demand");
}

/// Test 5: Shear capacity with stirrups.
#[test]
fn rc_check_shear_with_stirrups() {
    let m = RCMemberData {
        element_id: 1,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.30,
        h: 0.55,
        d: 0.50,
        d_prime: None,
        as_tension: 1500e-6,
        as_compression: None,
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: Some(200e-6),     // 2 legs of #10 stirrup ≈ 200 mm²
        s_stirrup: Some(0.20), // 200 mm spacing
        lambda: None,
    };

    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 100e3,
            vu: Some(150e3), // 150 kN shear
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // Vc = 0.17 * lambda * sqrt(f'c_MPa) * bw_mm * d_mm
    //    = 0.17 * 1.0 * sqrt(28) * 300 * 500 = 134,946 N
    let vc = 0.17 * 28.0_f64.sqrt() * 300.0 * 500.0;
    // Vs = Av * fy * d / s = 200e-6 * 420e6 * 0.50 / 0.20 = 210,000 N
    let vs = 200e-6 * 420e6 * 0.50 / 0.20;
    let phi_vn_expected = 0.75 * (vc + vs);

    assert!(
        (r.phi_vn - phi_vn_expected).abs() / phi_vn_expected < 1e-4,
        "phi*Vn: {:.0} vs {:.0}",
        r.phi_vn,
        phi_vn_expected
    );

    assert!(r.shear_ratio > 0.0, "Should have shear demand");
}

/// Test 6: Shear without stirrups — concrete only.
#[test]
fn rc_check_shear_concrete_only() {
    let m = rectangular_beam(1, 0.30, 0.55, 0.50, 1500e-6);
    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 50e3,
            vu: Some(80e3),
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // Vc = 0.17 * sqrt(28_MPa) * 300_mm * 500_mm = 134,946 N
    let vc = 0.17 * 28.0_f64.sqrt() * 300.0 * 500.0;
    let phi_vn_expected = 0.75 * vc;

    assert!(
        (r.phi_vn - phi_vn_expected).abs() / phi_vn_expected < 1e-4,
        "phi*Vn (no stirrups): {:.0} vs {:.0}",
        r.phi_vn,
        phi_vn_expected
    );

    // 80 kN / ~101 kN ≈ 0.79
    assert!(
        r.shear_ratio > 0.6 && r.shear_ratio < 1.0,
        "Shear ratio: {:.3}",
        r.shear_ratio
    );
}

/// Test 7: Multiple members — sorted results.
#[test]
fn rc_check_multiple_members() {
    let input = RCCheckInput {
        members: vec![
            rectangular_beam(3, 0.30, 0.55, 0.50, 2000e-6),
            rectangular_beam(1, 0.30, 0.55, 0.50, 1500e-6),
            rectangular_beam(2, 0.25, 0.45, 0.40, 1000e-6),
        ],
        forces: vec![
            RCDesignForces { element_id: 1, mu: 100e3, vu: Some(50e3), nu: None },
            RCDesignForces { element_id: 2, mu: 80e3, vu: None, nu: None },
            RCDesignForces { element_id: 3, mu: 200e3, vu: Some(100e3), nu: None },
        ],
    };

    let results = check_rc_members(&input);
    assert_eq!(results.len(), 3);

    // Results sorted by element_id
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 2);
    assert_eq!(results[2].element_id, 3);

    // All should have positive unity ratios
    for r in &results {
        assert!(r.unity_ratio > 0.0, "Element {} should have demand", r.element_id);
    }
}

/// Test 8: High-strength concrete — beta1 reduction.
#[test]
fn rc_check_high_strength_concrete() {
    let m = RCMemberData {
        element_id: 1,
        fc: 55e6, // 55 MPa — near upper limit for beta1 reduction
        fy: 420e6,
        es: Some(200e9),
        b: 0.30,
        h: 0.55,
        d: 0.50,
        d_prime: None,
        as_tension: 1500e-6,
        as_compression: None,
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    };

    let input = RCCheckInput {
        members: vec![m],
        forces: vec![RCDesignForces {
            element_id: 1,
            mu: 200e3,
            vu: None,
            nu: None,
        }],
    };

    let results = check_rc_members(&input);
    let r = &results[0];

    // beta1 for 55 MPa ≈ 0.85 - 0.05*(55-28)/7 = 0.85 - 0.193 = 0.657
    // With higher f'c, a is smaller (more concrete strength), but c is larger/smaller
    // depending on beta1. The stress block is narrower but stronger.
    let a_expected = 1500e-6 * 420e6 / (0.85 * 55e6 * 0.30);
    assert!(
        (r.a - a_expected).abs() / a_expected < 1e-4,
        "a for HSC: {:.4} vs {:.4}",
        r.a,
        a_expected
    );

    // Higher f'c → smaller a → larger lever arm → more moment capacity per unit of steel
    assert!(r.phi_mn > 0.0);
    assert!(r.tension_controlled);
}
