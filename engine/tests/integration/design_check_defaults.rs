//! Regression tests for silently-guessed defaults that overstate capacity.
//!
//! Where an input is optional, the fallback the check invents must be
//! traceable to the standard — not a round number that happens to compile.
//! Every expected value below is derived in the comment above it.

use dedaliano_engine::postprocess::ec2_check::*;
use dedaliano_engine::postprocess::steel_check::*;
use dedaliano_engine::postprocess::timber_check::*;

// ==================== Timber ====================

fn timber(b: f64, d: f64, le: f64, lu: Option<f64>, e: f64, e_min: Option<f64>) -> TimberMemberData {
    TimberMemberData {
        element_id: 1,
        fb: 12e6,
        ft: 6e6,
        fc: 12e6,
        fv: 1e6,
        e,
        e_min,
        b,
        d,
        le,
        lu,
        cd: None, cm: None, ct: None,
        cf_bending: None, cf_tension: None, cf_compression: None,
        cfu: None, ci: None, cr: None,
    }
}

fn run(m: TimberMemberData, n: Option<f64>, moment: f64) -> TimberCheckResult {
    check_timber_members(&TimberCheckInput {
        members: vec![m],
        forces: vec![TimberDesignForces { element_id: 1, m: moment, n, v: None }],
    })
    .remove(0)
}

/// NDS Appendix F: Emin = E·(1 - 1.645·COV_E)·1.03/1.66. For visually graded
/// sawn lumber COV_E = 0.25, giving Emin = 0.3653·E — not 0.58·E. (0.58875 is
/// the bare (1 - 1.645·0.25) term with the 1.03/1.66 adjustment left off.)
///
/// Square 150x150, le = 3.0 m, E = 10 GPa, Fc = 12 MPa:
///   Emin = 3.653e9,  le/d = 20
///   FcE  = 0.822·3.653e9/400 = 7_507_100 Pa
///   Fc*  = 12e6,  ratio = 0.625592,  c = 0.8
///   term = 1.625592/1.6 = 1.015995
///   CP   = term - sqrt(term² - ratio/c) = 1.015995 - 0.500256 = 0.515739
///
/// With 0.58·E the same member reports CP = 0.68864 — 34 % more column capacity.
#[test]
fn timber_emin_default_follows_nds_appendix_f() {
    let r = run(timber(0.15, 0.15, 3.0, None, 10e9, None), Some(-100_000.0), 0.0);
    assert!(
        (r.cp - 0.515739).abs() < 1e-4,
        "CP with Emin = 0.3653E is 0.51574, got {:.6}",
        r.cp
    );
}

/// An explicit Emin must still be honoured verbatim.
#[test]
fn timber_explicit_emin_is_not_overridden() {
    let with_default = run(timber(0.15, 0.15, 3.0, None, 10e9, None), Some(-100_000.0), 0.0);
    let with_explicit = run(
        timber(0.15, 0.15, 3.0, None, 10e9, Some(0.3653094e10)),
        Some(-100_000.0),
        0.0,
    );
    assert!(
        (with_default.cp - with_explicit.cp).abs() < 1e-6,
        "explicit Emin equal to the default must give the same CP: {:.6} vs {:.6}",
        with_default.cp, with_explicit.cp
    );
}

/// NDS Table 3.3.3, single span with uniformly distributed load:
///   lu/d < 7        -> le = 2.06·lu
///   7 <= lu/d <= 14.3 -> le = 1.63·lu + 3d
///   lu/d > 14.3     -> le = 1.84·lu
/// Using le = lu understates RB and so overstates FbE and CL.
///
/// 100 x 400 section, lu = 4.0 m, Emin = 2 GPa: lu/d = 10 -> le = 1.63·4 + 1.2 = 7.72 m
///   RB² = le·d/b² = 7.72·0.4/0.01 = 308.8
///   FbE = 1.20·2e9/308.8 = 7_772_021 Pa
///   Fb* = 12e6,  ratio = 0.647668
///   term = 1.647668/1.9 = 0.867194
///   CL  = term - sqrt(term² - ratio/0.95) = 0.867194 - 0.265083 = 0.602111
///
/// With le = lu the same beam reports CL = 0.88999.
#[test]
fn timber_beam_stability_uses_nds_effective_span() {
    let r = run(timber(0.10, 0.40, 4.0, Some(4.0), 10e9, Some(2e9)), None, 10_000.0);
    assert!(
        (r.cl - 0.602111).abs() < 1e-4,
        "CL with le = 1.63·lu + 3d is 0.60211, got {:.6}",
        r.cl
    );
}

/// Short-span branch of the same table: lu/d = 5 < 7 -> le = 2.06·lu = 4.12 m.
///   RB² = 4.12·0.4/0.01 = 164.8,  FbE = 1.20·2e9/164.8 = 14_563_107 Pa
///   ratio = 1.213592,  term = 2.213592/1.9 = 1.165049
///   CL = 1.165049 - sqrt(1.357339 - 1.277465) = 1.165049 - 0.282619 = 0.882430
#[test]
fn timber_beam_stability_short_span_branch() {
    let r = run(timber(0.10, 0.40, 2.0, Some(2.0), 10e9, Some(2e9)), None, 10_000.0);
    assert!(
        (r.cl - 0.882430).abs() < 1e-4,
        "CL with le = 2.06·lu is 0.88243, got {:.6}",
        r.cl
    );
}

/// NDS 3.9.2 requires fc < FcE1 for the amplification 1/(1 - fc/FcE1) to mean
/// anything. Past that point the member has buckled, and falling back to the
/// *un-amplified* bending ratio makes the interaction check weakest exactly
/// where it should diverge.
///
/// 100x100, le = 4.0 m, Emin = 0.5 GPa: FcE = 0.822·0.5e9/1600 = 256_875 Pa.
/// N = -3 kN over A = 0.01 m² gives fc = 300_000 Pa > FcE, so 1 - fc/FcE < 0.
#[test]
fn timber_interaction_diverges_past_the_buckling_load() {
    let r = run(timber(0.10, 0.10, 4.0, None, 10e9, Some(0.5e9)), Some(-3_000.0), 100.0);

    assert!(
        r.interaction_ratio > 100.0,
        "fc exceeds FcE, so NDS 3.9.2 must blow up rather than drop the \
         amplification; got {:.3}",
        r.interaction_ratio
    );
    assert!(r.interaction_ratio.is_finite(), "must stay finite for serialization");
}

/// With no bending there is nothing to amplify, so the same buckled member is
/// governed by the (fc/Fc')² term alone and must stay a plain number.
#[test]
fn timber_interaction_without_bending_stays_bounded() {
    let r = run(timber(0.10, 0.10, 4.0, None, 10e9, Some(0.5e9)), Some(-3_000.0), 0.0);
    assert!(
        r.interaction_ratio > 1.0 && r.interaction_ratio < 10.0,
        "pure compression past FcE: (fc/Fc')² alone, got {:.3}",
        r.interaction_ratio
    );
}

// ==================== EC2 strut angle ====================

fn ec2_member(theta: Option<f64>) -> Ec2MemberData {
    Ec2MemberData {
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
        alpha_cc: None,
        asw: Some(1.57e-4),
        s_stirrup: Some(0.20),
        theta_shear: theta,
        bw: None,
        z: None,
    }
}

fn ec2_run(theta: Option<f64>) -> Ec2CheckResult {
    check_ec2_members(&Ec2CheckInput {
        members: vec![ec2_member(theta)],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(200_000.0),
            v_ed: Some(150_000.0),
            n_ed: None,
        }],
    })
    .remove(0)
}

/// EC2 6.2.3(2) bounds the strut inclination: 1 <= cot t <= 2.5, i.e.
/// 21.8 deg <= t <= 45 deg. A caller-supplied 10 deg gives cot t = 5.67 and a
/// shear capacity 2.3x the code maximum, so it must be brought back to 21.8 deg.
///
/// VRd,s = Asw·z·fyd·cot t / s
///       = 1.57e-4 · 0.495 · (500/1.15)e6 · 2.5 / 0.20 = 422_364 N
#[test]
fn ec2_strut_angle_below_the_code_minimum_is_clamped() {
    let r = ec2_run(Some(10.0_f64.to_radians()));
    assert!(
        (r.v_rds - 422_364.0).abs() / 422_364.0 < 1e-3,
        "cot t must be capped at 2.5, giving VRd,s = 422.4 kN, got {:.0} N",
        r.v_rds
    );
}

/// Above 45 deg, cot t is capped at 1.0: VRd,s = 422_364/2.5 = 168_946 N.
#[test]
fn ec2_strut_angle_above_the_code_maximum_is_clamped() {
    let r = ec2_run(Some(60.0_f64.to_radians()));
    assert!(
        (r.v_rds - 168_945.6).abs() / 168_945.6 < 1e-3,
        "cot t must be floored at 1.0, giving VRd,s = 168.9 kN, got {:.0} N",
        r.v_rds
    );
}

/// A value inside the range is used as given: t = 30 deg -> cot t = 1.7320508.
#[test]
fn ec2_strut_angle_inside_the_range_is_untouched() {
    let r = ec2_run(Some(30.0_f64.to_radians()));
    let expected = 1.57e-4 * 0.495 * (500e6 / 1.15) * 3.0_f64.sqrt() / 0.20;
    assert!(
        (r.v_rds - expected).abs() / expected < 1e-6,
        "t = 30 deg must pass through, expected {expected:.0} N, got {:.0} N",
        r.v_rds
    );
}

// ==================== AISC: flange centroid distance ====================

/// W14x22 in SI, warping constant supplied but overall depth omitted.
fn w14x22_without_depth(lb: f64) -> SteelMemberData {
    SteelMemberData {
        element_id: 1,
        fy: 345e6,
        ag: 4.19e-3,
        an: None,
        u_factor: None,
        lby: lb,
        lbz: lb,
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
        lb: Some(lb),
        cb: Some(1.0),
        e: 200e9,
        g: Some(77e9),
        depth: None,
    }
}

/// `ho` is the distance between flange centroids in AISC F2-4/F2-6. When the
/// depth is not supplied it was defaulting to a literal 0.3 m regardless of the
/// section. For a doubly-symmetric I-shape Cw = Iz·ho²/4, so the value that is
/// already implied by the supplied properties is ho = 2·sqrt(Cw/Iz):
///
///   ho = 2·sqrt(8.43e-8 / 2.91e-6) = 0.340406 m
///        (W14x22: d - tf = 0.348 - 0.0085 = 0.3395 m, 0.3 % off)
///
/// At Lb = 5.0 m the section is past Lr and in elastic LTB:
///   rts    = sqrt(sqrt(Iz·Cw)/Sy) = 0.0322909 m,  Lb/rts = 154.842
///   J·c/(Sy·ho) = 8.66e-8/(4.75e-4·0.340406) = 5.35586e-4
///   Fcr    = pi²E/(Lb/rts)² · sqrt(1 + 0.078·5.35586e-4·(Lb/rts)²)
///          = 8.2329e7 · 1.414787 = 1.16477e8 Pa
///   phi·Mn = 0.9 · 1.16477e8 · 4.75e-4 = 49_794 N·m
///
/// The 0.3 m default reports 51_444 N·m.
#[test]
fn aisc_flange_centroid_distance_comes_from_the_warping_constant() {
    let results = check_steel_members(&SteelCheckInput {
        members: vec![w14x22_without_depth(5.0)],
        forces: vec![ElementDesignForces {
            element_id: 1, n: 0.0, my: 30_000.0, mz: None, vy: None,
        }],
    });
    let r = &results[0];

    assert!(
        (r.phi_mn_y - 49_794.0).abs() / 49_794.0 < 0.01,
        "phi·Mn_y with ho = 2·sqrt(Cw/Iz) is 49.8 kN·m, got {:.0} N·m",
        r.phi_mn_y
    );
}

/// Supplying the depth explicitly must not change the answer materially when Cw
/// is also present — both routes describe the same section.
#[test]
fn aisc_explicit_depth_agrees_with_the_derived_value() {
    let mut with_depth = w14x22_without_depth(5.0);
    with_depth.depth = Some(0.3395); // d - tf for a W14x22

    let derived = check_steel_members(&SteelCheckInput {
        members: vec![w14x22_without_depth(5.0)],
        forces: vec![ElementDesignForces { element_id: 1, n: 0.0, my: 30_000.0, mz: None, vy: None }],
    })[0].phi_mn_y;

    let explicit = check_steel_members(&SteelCheckInput {
        members: vec![with_depth],
        forces: vec![ElementDesignForces { element_id: 1, n: 0.0, my: 30_000.0, mz: None, vy: None }],
    })[0].phi_mn_y;

    assert!(
        (derived - explicit).abs() / explicit < 0.005,
        "derived ho and explicit ho should agree within 0.5 %: {derived:.0} vs {explicit:.0}"
    );
}
