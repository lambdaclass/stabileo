//! A check that could not be evaluated must not read as a check that passed.
//!
//! Every module guarded its demand/capacity ratios with
//! `if capacity > 0.0 { d / c } else { 0.0 }`. A capacity that failed to
//! compute — degenerate geometry, a missing property, a NaN arriving from a
//! diverged nonlinear solve — therefore produced ratio 0.0, which then fed
//! `unity_ratio` and `pass` as the safest possible answer. "Could not
//! evaluate" and "no demand" were indistinguishable in the output.

use dedaliano_engine::postprocess::ec2_check::*;
use dedaliano_engine::postprocess::ec3_check::*;
use dedaliano_engine::postprocess::foundation_check::*;
use dedaliano_engine::postprocess::masonry_check::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::postprocess::serviceability::*;
use dedaliano_engine::postprocess::steel_check::*;
use dedaliano_engine::postprocess::timber_check::*;

// ==================== AISC ====================

fn steel_member(fy: f64) -> SteelMemberData {
    SteelMemberData {
        element_id: 1,
        fy,
        ag: 4.19e-3,
        an: None,
        u_factor: None,
        lby: 3.0,
        lbz: 3.0,
        ky: None,
        kz: None,
        iy: 8.28e-5,
        iz: 2.91e-6,
        ry: 0.1407,
        rz: 0.02642,
        zy: 5.44e-4,
        zz: 7.19e-5,
        sy: 4.75e-4,
        sz: 4.59e-5,
        j: 8.66e-8,
        cw: Some(8.43e-8),
        lb: Some(3.0),
        cb: Some(1.0),
        e: 200e9,
        g: Some(77e9),
        depth: Some(0.348),
    }
}

/// A member with no yield strength has no computable capacity. Reporting
/// unity_ratio 0.0 for a real 500 kN demand is the worst possible answer.
#[test]
fn steel_zero_capacity_is_reported_as_unevaluated() {
    let r = check_steel_members(&SteelCheckInput {
        members: vec![steel_member(0.0)],
        forces: vec![ElementDesignForces { element_id: 1, n: 500e3, my: 80e3, mz: None, vy: None }],
    })
    .remove(0);

    assert!(
        !r.unevaluated.is_empty(),
        "a member with fy = 0 must flag its checks as unevaluated"
    );
    assert_ne!(
        r.governing_check, "Tension D2",
        "an unevaluated check must not be presented as the governing one"
    );
}

/// A NaN demand — the shape a diverged nonlinear solve produces — must not
/// reach `max_by(partial_cmp().unwrap())`, which aborts the WASM module.
#[test]
fn steel_nan_demand_does_not_panic() {
    let r = check_steel_members(&SteelCheckInput {
        members: vec![steel_member(345e6)],
        forces: vec![ElementDesignForces {
            element_id: 1, n: f64::NAN, my: 80e3, mz: None, vy: None,
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "a NaN demand must be flagged, got {:?}", r.unevaluated);
    assert!(r.unity_ratio.is_finite(), "unity_ratio must stay finite: {}", r.unity_ratio);
}

/// A well-formed member must keep reporting exactly what it did before.
#[test]
fn steel_healthy_member_reports_nothing_unevaluated() {
    let r = check_steel_members(&SteelCheckInput {
        members: vec![steel_member(345e6)],
        forces: vec![ElementDesignForces { element_id: 1, n: 500e3, my: 80e3, mz: None, vy: None }],
    })
    .remove(0);

    assert!(r.unevaluated.is_empty(), "healthy member flagged: {:?}", r.unevaluated);
    assert!(r.unity_ratio > 0.0);
}

// ==================== ACI ====================

/// f'c = 0 makes the stress block depth infinite and every downstream quantity
/// NaN, which the `phi_mn > 0.0` guard then turned into ratio 0.0.
#[test]
fn rc_degenerate_section_is_reported_as_unevaluated() {
    let r = check_rc_members(&RCCheckInput {
        members: vec![RCMemberData {
            element_id: 1,
            fc: 0.0,
            fy: 420e6,
            es: None,
            b: 0.30,
            h: 0.60,
            d: 0.55,
            d_prime: None,
            as_tension: 1.5e-3,
            as_compression: None,
            section_type: RCSectionType::Rectangular,
            bf: None,
            hf: None,
            av: None,
            s_stirrup: None,
            lambda: None,
        }],
        forces: vec![RCDesignForces { element_id: 1, mu: 200e3, vu: Some(150e3), nu: None }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "f'c = 0 must flag the flexure check");
    assert!(r.unity_ratio.is_finite());
}

/// NaN moment must not panic in the governing-check selection.
#[test]
fn rc_nan_demand_does_not_panic() {
    let r = check_rc_members(&RCCheckInput {
        members: vec![RCMemberData {
            element_id: 1,
            fc: 30e6, fy: 420e6, es: None,
            b: 0.30, h: 0.60, d: 0.55,
            d_prime: None, as_tension: 1.5e-3, as_compression: None,
            section_type: RCSectionType::Rectangular,
            bf: None, hf: None, av: None, s_stirrup: None, lambda: None,
        }],
        forces: vec![RCDesignForces { element_id: 1, mu: f64::NAN, vu: Some(150e3), nu: None }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty());
    assert!(r.unity_ratio.is_finite());
}

// ==================== NDS ====================

/// NaN moment must not panic in the timber governing-check selection either.
#[test]
fn timber_nan_demand_does_not_panic() {
    let r = check_timber_members(&TimberCheckInput {
        members: vec![TimberMemberData {
            element_id: 1,
            fb: 12e6, ft: 6e6, fc: 12e6, fv: 1e6,
            e: 10e9, e_min: Some(2e9),
            b: 0.10, d: 0.30, le: 3.0, lu: None,
            cd: None, cm: None, ct: None,
            cf_bending: None, cf_tension: None, cf_compression: None,
            cfu: None, ci: None, cr: None,
        }],
        forces: vec![TimberDesignForces { element_id: 1, m: f64::NAN, n: None, v: None }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty());
    assert!(r.unity_ratio.is_finite());
}

// ==================== EC3 ====================

/// `chi.min(1.0)` returns 1.0 when chi is NaN, because Rust's f64::min ignores
/// NaN. A NaN slenderness therefore meant "no buckling reduction at all" —
/// silently the most unconservative outcome available.
#[test]
fn ec3_nan_slenderness_does_not_become_full_capacity() {
    let r = check_ec3_members(&Ec3CheckInput {
        members: vec![Ec3MemberData {
            element_id: 1,
            fy: -275e6, // negative strength makes lambda_bar NaN
            e: None,
            a: 5.38e-3,
            wpl_y: 628e-6, wel_y: 557e-6,
            wpl_z: 125e-6, wel_z: 80.5e-6,
            iy: 8356e-8, iz: 604e-8, it: 20.1e-8, iw: 126e-9,
            lcr_y: 4.0, lcr_z: 4.0, lb: 4.0,
            section_class: SectionClass::Class1,
            buckling_curve_y: BucklingCurve::A,
            buckling_curve_z: BucklingCurve::B,
            buckling_curve_lt: BucklingCurve::B,
            gamma_m0: Some(1.0), gamma_m1: Some(1.0),
            c1: None, av: None,
        }],
        forces: vec![Ec3DesignForces {
            element_id: 1, n_ed: Some(-200e3), my_ed: Some(50e3), mz_ed: None, v_ed: None,
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "a NaN slenderness must be flagged");
    assert!(!r.pass, "a member whose buckling could not be evaluated must not pass");
    assert!(
        !(r.chi_y == 1.0 && r.chi_z == 1.0),
        "NaN must not collapse to chi = 1.0 (no reduction): chi_y = {}, chi_z = {}",
        r.chi_y, r.chi_z
    );
}

// ==================== EC2 ====================

/// A section with no depth has no computable MRd, so the flexure check has no
/// answer — not a passing one.
#[test]
fn ec2_degenerate_section_does_not_pass() {
    let r = check_ec2_members(&Ec2CheckInput {
        members: vec![Ec2MemberData {
            element_id: 1,
            fck: 30e6, fyk: 500e6,
            b: 0.30, h: 0.0, d: 0.0,
            as_tension: 1.5e-3, as_compression: None, d_prime: None,
            es: None, gamma_c: Some(1.5), gamma_s: Some(1.15), alpha_cc: None,
            asw: None, s_stirrup: None, theta_shear: None, bw: None, z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1, m_ed: Some(200e3), v_ed: Some(150e3), n_ed: None,
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "d = 0 must flag the flexure check");
    assert!(!r.pass, "an unevaluable section must not pass");
}

// ==================== TMS 402 ====================

/// A wall whose axial capacity computes to zero must not report zero demand.
#[test]
fn masonry_zero_capacity_does_not_pass() {
    let r = check_masonry_members(&MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 0.0, fy: 420e6, em: None,
            b: 1.0, t: 0.20, d: 0.10,
            as_tension: 0.0,
            h: 3.0, k: Some(1.0), an: None, av: None, s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1, pu: Some(200e3), mu: Some(50e3), vu: Some(30e3),
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "f'm = 0 must flag the checks");
    assert!(!r.pass, "a wall with no computable capacity must not pass");
}

// ==================== Foundation ====================

/// A footing with no allowable bearing pressure cannot be checked for bearing.
#[test]
fn foundation_missing_allowable_pressure_does_not_pass() {
    let r = check_spread_footings(&SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.0, width: 2.0, thickness: 0.5, depth: 1.0,
            q_allowable: 0.0,
            gamma_soil: 18_000.0, fc: 28e6,
            col_length: 0.4, col_width: 0.4, d: None, mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1, p: 500e3, mx: None, my: None, h: None,
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty(), "q_allowable = 0 must flag the bearing check");
    assert!(!r.pass);
}

// ==================== Serviceability ====================

/// A modal analysis that produced no usable frequency fell through to
/// `vibration_ok: None`, and `pass` then used `unwrap_or(true)`.
#[test]
fn serviceability_unusable_frequency_does_not_pass_by_default() {
    let r = check_serviceability(&ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 6.0,
            max_deflection: 0.010,
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: Some(0.0), // modal solve produced nothing usable
            min_frequency: Some(4.0),
            description: None,
        }],
    })
    .remove(0);

    assert!(
        !r.unevaluated.is_empty(),
        "a requested vibration check with no usable frequency must be flagged"
    );
    assert!(!r.pass, "an unevaluated vibration check must not pass by default");
}

/// A zero span makes the L/360 limit zero, so the deflection check has no
/// meaning — it must not read as satisfied.
#[test]
fn serviceability_zero_span_does_not_pass() {
    let r = check_serviceability(&ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 0.0,
            max_deflection: 0.050,
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: None,
            min_frequency: None,
            description: None,
        }],
    })
    .remove(0);

    assert!(!r.unevaluated.is_empty());
    assert!(!r.pass);
}

/// A member with no vibration data requested simply has no vibration check —
/// that is not an unevaluated one.
#[test]
fn serviceability_without_vibration_data_is_not_flagged() {
    let r = check_serviceability(&ServiceabilityInput {
        members: vec![ServiceabilityMember {
            element_id: 1,
            span: 6.0,
            max_deflection: 0.010,
            criterion: DeflectionCriterion::SpanRatio(360.0),
            natural_frequency: None,
            min_frequency: None,
            description: None,
        }],
    })
    .remove(0);

    assert!(r.unevaluated.is_empty(), "not requested is not unevaluated: {:?}", r.unevaluated);
    assert!(r.pass, "6000/360 = 16.7 mm allowed vs 10 mm actual");
}
