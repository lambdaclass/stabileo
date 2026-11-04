//! Regression tests for "right formula, wrong variable" defects in the
//! design-code checks: a standard equation implemented with the wrong section
//! dimension, the wrong slenderness measure, or the wrong code coefficient.
//!
//! Each expected value below is computed by hand from the governing clause and
//! written out in the comment so it can be re-derived without running the code.

use dedaliano_engine::postprocess::ec2_check::*;
use dedaliano_engine::postprocess::foundation_check::*;
use dedaliano_engine::postprocess::masonry_check::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::postprocess::timber_check::*;

// ==================== Foundation: L/B assignment ====================

/// 4 m (length) x 2 m (width) footing, P = 1000 kN.
fn rect_footing() -> SpreadFootingData {
    SpreadFootingData {
        footing_id: 1,
        length: 4.0,
        width: 2.0,
        thickness: 0.60,
        depth: 1.0,
        q_allowable: 300_000.0,
        gamma_soil: 18_000.0,
        fc: 28e6,
        col_length: 0.40,
        col_width: 0.40,
        d: None,
        mu_sliding: None,
        rho_w: None, neglect_size_effect: None,
    }
}

/// `my` acts about the width axis, so it offsets the load along the *length*.
/// Meyerhof: L' = L - 2e_x = 4 - 0.8 = 3.2, B' = B = 2.0, A' = 6.4 m²,
/// q = 1000 kN / 6.4 m² = 156.25 kPa.
#[test]
fn foundation_moment_about_width_axis_shortens_the_length() {
    let results = check_spread_footings(&SpreadFootingInput {
        footings: vec![rect_footing()],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 1_000_000.0,
            mx: None,
            my: Some(400_000.0),
            h: None,
        }],
    });
    let r = &results[0];

    assert!((r.eccentricity_x - 0.4).abs() < 1e-9, "e_x = my/P = 0.4 m, got {}", r.eccentricity_x);
    assert!(
        (r.max_bearing_pressure - 156_250.0).abs() < 1.0,
        "q = P/((L-2e_x)·B) = 156.25 kPa, got {:.1} Pa",
        r.max_bearing_pressure
    );
}

/// `mx` acts about the length axis, so it offsets the load across the *width*.
/// Meyerhof: L' = L = 4.0, B' = B - 2e_y = 2 - 0.8 = 1.2, A' = 4.8 m²,
/// q = 1000 kN / 4.8 m² = 208.33 kPa.
///
/// Swapping the two reports 156.25 kPa here — 25 % low, in the unsafe direction.
#[test]
fn foundation_moment_about_length_axis_shortens_the_width() {
    let results = check_spread_footings(&SpreadFootingInput {
        footings: vec![rect_footing()],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 1_000_000.0,
            mx: Some(400_000.0),
            my: None,
            h: None,
        }],
    });
    let r = &results[0];

    assert!((r.eccentricity_y - 0.4).abs() < 1e-9, "e_y = mx/P = 0.4 m, got {}", r.eccentricity_y);
    assert!(
        (r.max_bearing_pressure - 208_333.33).abs() < 1.0,
        "q = P/(L·(B-2e_y)) = 208.33 kPa, got {:.1} Pa",
        r.max_bearing_pressure
    );
}

/// Overturning about the length axis tips the footing across its width, so the
/// stabilising arm is B/2, not L/2.
/// SF = (P·B/2)/mx = (1000 kN · 1.0 m)/400 kN·m = 2.5.
#[test]
fn foundation_overturning_about_length_axis_uses_half_width_arm() {
    let results = check_spread_footings(&SpreadFootingInput {
        footings: vec![rect_footing()],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 1_000_000.0,
            mx: Some(400_000.0),
            my: None,
            h: None,
        }],
    });
    let r = &results[0];

    assert!(
        (r.overturning_sf_x - 2.5).abs() < 1e-6,
        "SF_x = P·(B/2)/mx = 2.5, got {:.3}",
        r.overturning_sf_x
    );
}

/// Overturning about the width axis tips the footing along its length: arm L/2.
/// SF = (1000 kN · 2.0 m)/400 kN·m = 5.0.
#[test]
fn foundation_overturning_about_width_axis_uses_half_length_arm() {
    let results = check_spread_footings(&SpreadFootingInput {
        footings: vec![rect_footing()],
        forces: vec![SpreadFootingForces {
            footing_id: 1,
            p: 1_000_000.0,
            mx: None,
            my: Some(400_000.0),
            h: None,
        }],
    });
    let r = &results[0];

    assert!(
        (r.overturning_sf_y - 5.0).abs() < 1e-6,
        "SF_y = P·(L/2)/my = 5.0, got {:.3}",
        r.overturning_sf_y
    );
}

// ==================== Masonry: h/r vs h/t ====================

/// 200 mm wall, per metre of length. r = t/sqrt(12) = 57.735 mm.
fn slender_wall(h: f64) -> MasonryMemberData {
    MasonryMemberData {
        element_id: 1,
        fm: 10.3e6,
        fy: 420e6,
        em: None,
        b: 1.0,
        t: 0.20,
        d: 0.10,
        as_tension: 6.45e-4,
        h,
        k: Some(1.0),
        an: None,
        av: None,
        s_stirrup: None,
        // Tied, so the fy·As term below counts (untied bars are neglected).
        laterally_tied: Some(true),
        gamma_g: None,
    }
}

/// Base term 0.80·[0.80·f'm·(An - As) + fy·As]:
///   0.80·10.3e6·(0.2 - 0.000645) = 1_642_685 N
///   420e6·6.45e-4                =   270_900 N
///   0.80·(1_642_685 + 270_900)   = 1_530_868 N
const MASONRY_BASE_PN: f64 = 1_530_868.2;

/// TMS 402 9.3.5.4 switches to the Euler branch at **h/r > 99**, not h/t > 99.
/// h = 8 m, r = 0.057735 m gives h/r = 138.6, so Pn = base·(70r/h)²
///   (70·0.057735/8)² = 0.255208  ->  Pn = 390.7 kN
/// Testing h/t (= 40) against 99 keeps the parabolic branch and reports 31.2 kN.
#[test]
fn masonry_euler_branch_switches_on_radius_of_gyration() {
    let results = check_masonry_members(&MasonryCheckInput {
        members: vec![slender_wall(8.0)],
        forces: vec![MasonryDesignForces { element_id: 1, pu: Some(200_000.0), mu: None, vu: None }],
    });
    let r = &results[0];

    let expected = MASONRY_BASE_PN * 0.2552083;
    assert!(
        (r.pn - expected).abs() / expected < 0.01,
        "Pn = base·(70r/h)² = {expected:.0} N, got {:.0} N",
        r.pn
    );
}

/// Beyond h/r = 140 the parabolic term goes negative and is clamped to zero, so
/// the wall reports zero capacity — which the `if pn > 0.0` guard then turns
/// into `axial_ratio = 0.0` and an overall pass. A wall too slender to carry
/// its load must not pass.
///
/// h = 12 m, h/r = 207.8: Pn = base·(70·0.057735/12)² = base·0.113426 = 173.6 kN
/// phi·Pn = 0.9·173.6 = 156.3 kN < Pu = 200 kN, so the ratio is 1.28.
#[test]
fn masonry_very_slender_wall_does_not_report_zero_demand() {
    let results = check_masonry_members(&MasonryCheckInput {
        members: vec![slender_wall(12.0)],
        forces: vec![MasonryDesignForces { element_id: 1, pu: Some(200_000.0), mu: None, vu: None }],
    });
    let r = &results[0];

    let expected = MASONRY_BASE_PN * 0.11342594;
    assert!(
        (r.pn - expected).abs() / expected < 0.01,
        "Pn = base·(70r/h)² = {expected:.0} N, got {:.0} N",
        r.pn
    );
    assert!(
        r.axial_ratio > 1.0,
        "Pu = 200 kN over phi·Pn = 156 kN must exceed unity, got {:.3}",
        r.axial_ratio
    );
    assert!(!r.pass, "an overloaded wall must not pass");
}

// ==================== Timber: both buckling axes ====================

/// NDS 3.7.1.4: le/d is the *larger* of le1/d1 and le2/d2.
///
/// 100 x 300 mm member, le = 3.0 m braced identically both ways:
///   le/d = 10 (strong axis), le/b = 30 (weak axis) -> 30 governs.
///   FcE  = 0.822·Emin'/(le/d)² = 0.822e9/900 = 913_333 Pa
///   Fc*  = 10e6 Pa,  ratio = 0.0913333,  c = 0.8
///   term = (1+ratio)/1.6 = 0.6820833
///   CP   = term - sqrt(term² - ratio/c) = 0.6820833 - 0.5925124 = 0.089571
///
/// Using only le/d gives CP = 0.6199 — a 7x overstatement of column capacity.
#[test]
fn timber_column_stability_uses_the_governing_axis() {
    let results = check_timber_members(&TimberCheckInput {
        members: vec![TimberMemberData {
            element_id: 1,
            fb: 10e6,
            ft: 6e6,
            fc: 10e6,
            fv: 1e6,
            e: 10e9,
            e_min: Some(1e9),
            b: 0.10,
            d: 0.30,
            le: 3.0,
            lu: None,
            le_b: None,
            le_bending: None,
            cd: None, cm: None, ct: None,
            cf_bending: None, cf_tension: None, cf_compression: None,
            cfu: None, ci: None, cr: None,
        }],
        forces: vec![TimberDesignForces { element_id: 1, m: 0.0, n: Some(-50_000.0), v: None }],
    });
    let r = &results[0];

    assert!(
        (r.cp - 0.089571).abs() < 1e-5,
        "CP from the governing le/b = 30 is 0.08957, got {:.6}",
        r.cp
    );
}

// ==================== EC2: alpha_cw vs alpha_cc ====================

/// EC2 6.2.3(3) Eq. 6.9: VRd,max = alpha_cw·bw·z·nu1·fcd/(cot t + tan t).
/// alpha_cw (state of stress, 1.0 for non-prestressed) is a different
/// coefficient from alpha_cc, which is already inside fcd.
///
/// fck = 30 MPa, gamma_c = 1.5, alpha_cc = 0.85 -> fcd = 17 MPa
/// nu1 = 0.6(1 - 30/250) = 0.528
/// cot t = 2.5 -> cot/(1+cot²) = 0.344828
/// VRd,max = 1.0·0.528·17e6·0.3·0.495·0.344828 = 459_633 N
///
/// Reusing alpha_cc as alpha_cw applies the 0.85 twice: 390_688 N.
#[test]
fn ec2_strut_capacity_does_not_apply_alpha_cc_twice() {
    let results = check_ec2_members(&Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 30e6,
            fyk: 500e6,
            b: 0.30,
            h: 0.60,
            d: 0.55,
            as_tension: 1.5e-3,
            as_compression: None,
            d_prime: None,
            es: None,
            gamma_c: Some(1.5),
            gamma_s: Some(1.15),
            alpha_cc: Some(0.85),
            asw: Some(1.57e-4),
            s_stirrup: Some(0.20),
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(200_000.0),
            v_ed: Some(150_000.0),
            n_ed: None,
        }],
    });
    let r = &results[0];

    assert!(
        (r.v_rd_max - 459_633.1).abs() / 459_633.1 < 1e-3,
        "VRd,max = 459.6 kN with alpha_cw = 1.0, got {:.0} N",
        r.v_rd_max
    );
}

// ==================== ACI: one definition of tension-controlled ====================

/// ACI 318-19 Table 21.2.2 ties both the phi factor and the tension-controlled
/// classification to the same limit, eps_t >= eps_ty + 0.003. The reported flag
/// must therefore agree with the phi that was applied.
///
/// With fy = 550 MPa the limit is 0.00275 + 0.003 = 0.00575, but a fixed 0.005
/// threshold calls As = 2340 mm² (eps_t = 0.005197) tension-controlled while
/// phi is still 0.854.
#[test]
fn rc_tension_controlled_flag_agrees_with_phi() {
    let members: Vec<RCMemberData> = [1.0e-3, 1.8e-3, 2.34e-3, 3.0e-3, 4.5e-3]
        .iter()
        .enumerate()
        .map(|(i, &as_tension)| RCMemberData {
            element_id: i + 1,
            fc: 30e6,
            fy: 550e6,
            es: None,
            b: 0.30,
            h: 0.60,
            d: 0.55,
            d_prime: None,
            as_tension,
            as_compression: None,
            section_type: RCSectionType::Rectangular,
            bf: None,
            hf: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        })
        .collect();

    let forces = members
        .iter()
        .map(|m| RCDesignForces { element_id: m.element_id, mu: 100_000.0, vu: None, nu: None })
        .collect();

    let results = check_rc_members(&RCCheckInput { members, forces });
    assert_eq!(results.len(), 5);

    for r in &results {
        assert_eq!(
            r.tension_controlled,
            r.phi_flexure >= 0.8999,
            "element {}: eps_t = {:.6}, phi = {:.4}, flag = {} — flag and phi disagree",
            r.element_id, r.epsilon_t, r.phi_flexure, r.tension_controlled
        );
    }

    // The specific case that a fixed 0.005 threshold gets wrong.
    let mid = results.iter().find(|r| r.element_id == 3).unwrap();
    assert!(
        (mid.epsilon_t - 0.005197).abs() < 1e-5,
        "expected eps_t = 0.005197, got {:.6}", mid.epsilon_t
    );
    assert!(!mid.tension_controlled, "eps_t = 0.0052 < 0.00575 is not tension-controlled");
}
