//! Regression tests for design inputs that were accepted and then never read.
//!
//! Each of these fields appeared only in its struct definition: the caller
//! supplied it, the check ignored it, and the result looked authoritative.

use dedaliano_engine::postprocess::ec2_check::*;
use dedaliano_engine::postprocess::ec3_check::*;
use dedaliano_engine::postprocess::rc_check::*;

// ==================== EC3: cross-section class ====================

/// IPE300-like section, laterally restrained so chi_LT is ~1 and Mb,Rd reduces
/// to W·fy/gamma_M1 — isolating which section modulus was used.
fn ipe300(class: SectionClass) -> Ec3MemberData {
    Ec3MemberData {
        element_id: 1,
        fy: 275e6,
        e: None,
        a: 5.38e-3,
        a_eff: None,
        wpl_y: 628e-6,
        wel_y: 557e-6,
        weff_y: None,
        wpl_z: 125e-6,
        wel_z: 80.5e-6,
        weff_z: None,
        iy: 8356e-8,
        iz: 604e-8,
        it: 20.1e-8,
        iw: 126e-9,
        lcr_y: 1.0,
        lcr_z: 1.0,
        lb: 0.5,
        section_class: class,
        buckling_curve_y: BucklingCurve::A,
        buckling_curve_z: BucklingCurve::B,
        buckling_curve_lt: BucklingCurve::B,
        gamma_m0: Some(1.0),
        gamma_m1: Some(1.0),
        c1: None,
        av: None,
    }
}

fn ec3_run(m: Ec3MemberData) -> Ec3CheckResult {
    check_ec3_members(&Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1,
            n_ed: Some(-50e3),
            my_ed: Some(50e3),
            mz_ed: None,
            v_ed: None,
        }],
    })
    .remove(0)
}

/// Class 1 and 2 sections develop the plastic moment: Wpl,y·fy = 172.7 kN·m.
#[test]
fn ec3_class_2_uses_the_plastic_modulus() {
    let r = ec3_run(ipe300(SectionClass::Class2));
    assert!(
        (r.mb_rd - 628e-6 * 275e6).abs() / (628e-6 * 275e6) < 1e-3,
        "Class 2 -> Wpl,y·fy = 172.7 kN·m, got {:.0} N·m",
        r.mb_rd
    );
}

/// EN 1993-1-1 6.2.5(2): a Class 3 section is limited to first yield, so the
/// resistance uses Wel,y — 557e-6·275e6 = 153.2 kN·m, not 172.7. Ignoring
/// `section_class` overstated it by 13 %.
#[test]
fn ec3_class_3_uses_the_elastic_modulus() {
    let r = ec3_run(ipe300(SectionClass::Class3));
    assert!(
        (r.mb_rd - 557e-6 * 275e6).abs() / (557e-6 * 275e6) < 1e-3,
        "Class 3 -> Wel,y·fy = 153.2 kN·m, got {:.0} N·m",
        r.mb_rd
    );
}

/// A Class 4 section uses effective properties where they are supplied.
#[test]
fn ec3_class_4_uses_effective_properties() {
    let mut m = ipe300(SectionClass::Class4);
    m.weff_y = Some(480e-6);
    m.a_eff = Some(4.60e-3);

    let r = ec3_run(m);
    assert!(
        (r.mb_rd - 480e-6 * 275e6).abs() / (480e-6 * 275e6) < 1e-3,
        "Class 4 -> Weff,y·fy = 132.0 kN·m, got {:.0} N·m",
        r.mb_rd
    );
    assert!(
        (r.nb_rd - r.chi_y.min(r.chi_z) * 4.60e-3 * 275e6).abs() < 1.0,
        "Class 4 buckling resistance must use Aeff, got {:.0} N",
        r.nb_rd
    );
}

/// The weak axis follows the same rule.
#[test]
fn ec3_class_3_weak_axis_uses_the_elastic_modulus() {
    let m = ipe300(SectionClass::Class3);
    let r = check_ec3_members(&Ec3CheckInput {
        members: vec![m],
        forces: vec![Ec3DesignForces {
            element_id: 1, n_ed: None, my_ed: None, mz_ed: Some(10e3), v_ed: None,
        }],
    })
    .remove(0);

    // Mc,z,Rd = Wel,z·fy = 80.5e-6·275e6 = 22.14 kN·m -> ratio = 10/22.14 = 0.4517
    assert!(
        (r.flexure_ratio_z - 10e3 / (80.5e-6 * 275e6)).abs() < 1e-4,
        "Class 3 weak-axis ratio must use Wel,z, got {:.4}",
        r.flexure_ratio_z
    );
}

// ==================== EC2: axial force in VRd,c ====================

fn ec2_column(n_ed: Option<f64>) -> Ec2CheckResult {
    check_ec2_members(&Ec2CheckInput {
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
            alpha_cc: Some(1.0),
            asw: None,
            s_stirrup: None,
            theta_shear: None,
            bw: None,
            z: None,
        }],
        forces: vec![Ec2DesignForces {
            element_id: 1,
            m_ed: Some(100_000.0),
            v_ed: Some(80_000.0),
            n_ed,
        }],
    })
    .remove(0)
}

/// Baseline with no axial force:
///   k = 1 + sqrt(200/550) = 1.603023,  rho_l = 0.0090909
///   VRd,c = (0.18/1.5)·1.603023·(100·0.0090909·30)^(1/3)·300·550 = 95_538 N
#[test]
fn ec2_shear_without_axial_force_is_the_baseline() {
    let r = ec2_column(None);
    assert!(
        (r.v_rdc - 95_538.2).abs() / 95_538.2 < 1e-3,
        "VRd,c = 95.5 kN, got {:.0} N",
        r.v_rdc
    );
}

/// EC2 6.2.2(1): VRd,c = [CRd,c·k·(100·rho_l·fck)^(1/3) + k1·sigma_cp]·bw·d,
/// k1 = 0.15. `n_ed` was accepted and dropped, so the compression term never
/// contributed.
///
/// NEd = -600 kN over Ac = 0.18 m² -> sigma_cp = 3.3333 MPa (< 0.2·fcd = 4.0)
/// k1·sigma_cp·bw·d = 0.15·3.3333·300·550 = 82_500 N
/// VRd,c = 95_538 + 82_500 = 178_038 N
#[test]
fn ec2_axial_compression_raises_the_concrete_shear_capacity() {
    let r = ec2_column(Some(-600_000.0));
    assert!(
        (r.v_rdc - 178_038.2).abs() / 178_038.2 < 1e-3,
        "VRd,c with sigma_cp = 178.0 kN, got {:.0} N",
        r.v_rdc
    );
}

/// The same term runs the other way in net tension, and dropping it there was
/// unconservative.
///
/// NEd = +300 kN -> sigma_cp = -1.6667 MPa
/// VRd,c = 95_538 - 0.15·1.6667·300·550 = 95_538 - 41_250 = 54_288 N
#[test]
fn ec2_axial_tension_lowers_the_concrete_shear_capacity() {
    let r = ec2_column(Some(300_000.0));
    assert!(
        (r.v_rdc - 54_288.2).abs() / 54_288.2 < 1e-3,
        "VRd,c in net tension = 54.3 kN, got {:.0} N",
        r.v_rdc
    );
    assert!(r.v_rdc >= 0.0, "capacity must not go negative");
}

// ==================== ACI: axial-flexure interaction ====================

/// 400 x 400 tied column, d = 340, d' = 60, As = 1600 mm², As' = 800 mm².
fn rc_column() -> RCMemberData {
    RCMemberData {
        element_id: 1,
        fc: 28e6,
        fy: 420e6,
        es: Some(200e9),
        b: 0.40,
        h: 0.40,
        d: 0.34,
        d_prime: Some(0.06),
        as_tension: 1.6e-3,
        as_compression: Some(0.8e-3),
        section_type: RCSectionType::Rectangular,
        bf: None,
        hf: None,
        av: None,
        s_stirrup: None,
        lambda: None,
    }
}

fn rc_run(nu: Option<f64>) -> RCCheckResult {
    check_rc_members(&RCCheckInput {
        members: vec![rc_column()],
        forces: vec![RCDesignForces { element_id: 1, mu: 150_000.0, vu: None, nu }],
    })
    .remove(0)
}

/// Hand-computed point on the interaction diagram, at the balance point.
///
/// c_b = 0.003·d/(0.003 + fy/Es) = 0.003·0.34/0.0051 = 0.200 m, beta1 = 0.85
///   a   = 0.170 m
///   Cc  = 0.85·28e6·0.170·0.40                     = 1_618_400 N
///   eps_s' = 0.003(0.20-0.06)/0.20 = 0.0021 -> fs' = 420 MPa
///   Cs  = As'·(fs' - 0.85·f'c) = 0.8e-3·396.2e6    =   316_960 N
///   eps_t  = 0.003(0.34-0.20)/0.20 = 0.0021 -> fs  = 420 MPa
///   T   = 1.6e-3·420e6                             =   672_000 N
///   Pn  = 1_618_400 + 316_960 - 672_000            = 1_263_360 N
///   eps_t = eps_ty exactly -> compression-controlled -> phi = 0.65
///   phi·Pn = 821_184 N
///
/// Moments about mid-depth (h/2 = 0.20):
///   Mn = 1_618_400·(0.20-0.085) + 316_960·(0.20-0.06) + 672_000·(0.34-0.20)
///      = 186_116 + 44_374 + 94_080 = 324_570 N·m
///   phi·Mn = 210_971 N·m
#[test]
fn aci_moment_capacity_at_a_known_interaction_point() {
    let r = rc_run(Some(-821_184.0));
    assert!(
        (r.phi_mn - 210_971.0).abs() / 210_971.0 < 0.02,
        "phi·Mn at phi·Pn = 821 kN should be 211.0 kN·m, got {:.0} N·m",
        r.phi_mn
    );
}

/// Below the balance point, axial compression *increases* moment capacity —
/// treating a column as a beam therefore understates it.
#[test]
fn aci_moderate_compression_increases_moment_capacity() {
    let pure_flexure = rc_run(None).phi_mn;
    let with_axial = rc_run(Some(-400_000.0)).phi_mn;
    assert!(
        with_axial > pure_flexure,
        "400 kN compression is below balance and should help: {with_axial:.0} vs {pure_flexure:.0}"
    );
}

/// Above the balance point it *decreases* it, and ignoring the axial force is
/// then unconservative — the case that matters.
#[test]
fn aci_high_compression_decreases_moment_capacity() {
    let pure_flexure = rc_run(None).phi_mn;
    let with_axial = rc_run(Some(-2_500_000.0)).phi_mn;
    assert!(
        with_axial < pure_flexure,
        "2500 kN is past balance and must reduce Mn: {with_axial:.0} vs {pure_flexure:.0}"
    );
    assert!(with_axial > 0.0, "capacity must stay positive: {with_axial:.0}");
}

/// Axial tension also reduces the moment capacity.
#[test]
fn aci_axial_tension_decreases_moment_capacity() {
    let pure_flexure = rc_run(None).phi_mn;
    let with_tension = rc_run(Some(200_000.0)).phi_mn;
    assert!(
        with_tension < pure_flexure,
        "tension must reduce Mn: {with_tension:.0} vs {pure_flexure:.0}"
    );
}

/// A member with no axial force must go on producing exactly what the
/// pure-flexure path produced before.
#[test]
fn aci_zero_axial_force_matches_the_flexure_only_path() {
    let none = rc_run(None);
    let zero = rc_run(Some(0.0));
    assert!(
        (none.phi_mn - zero.phi_mn).abs() < 1e-6,
        "nu = None and nu = 0 must agree: {:.3} vs {:.3}",
        none.phi_mn, zero.phi_mn
    );
}
