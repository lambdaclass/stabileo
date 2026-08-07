//! Regression tests for limit states the governing standard requires but the
//! checks never evaluated — so a member could fail in reality while reporting
//! a unity ratio well under 1.0.

use dedaliano_engine::postprocess::foundation_check::*;
use dedaliano_engine::postprocess::masonry_check::*;
use dedaliano_engine::postprocess::rc_check::*;
use dedaliano_engine::postprocess::steel_check::*;

// ==================== AISC: tension rupture and shear ====================

/// W14x22 in SI, A992 steel (Fy = 345 MPa, Fu = 450 MPa).
fn w14x22() -> SteelMemberData {
    SteelMemberData {
        element_id: 1,
        fy: 345e6,
        fu: None,
        ag: 4.19e-3,
        an: None,
        u_factor: None,
        aw: None,
        cv1: None,
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

fn steel_run(member: SteelMemberData, forces: ElementDesignForces) -> SteelCheckResult {
    check_steel_members(&SteelCheckInput { members: vec![member], forces: vec![forces] }).remove(0)
}

/// AISC D2 takes the *lower* of yielding on the gross section (D2-1, phi = 0.90)
/// and rupture on the effective net section (D2-2, phi = 0.75). Only yielding
/// was evaluated, although `an` and `u_factor` were already accepted as inputs.
///
/// Yielding: 0.90 · 345e6 · 4.19e-3            = 1_300_995 N
/// Rupture:  0.75 · 450e6 · (3.60e-3 · 0.85)   = 1_032_750 N  <- governs
#[test]
fn aisc_tension_rupture_on_the_net_section_governs() {
    let mut m = w14x22();
    m.fu = Some(450e6);
    m.an = Some(3.60e-3);
    m.u_factor = Some(0.85);

    let r = steel_run(m, ElementDesignForces { element_id: 1, n: 900e3, my: 0.0, mz: None, vy: None });

    assert!(
        (r.phi_pn_tension - 1_032_750.0).abs() / 1_032_750.0 < 1e-6,
        "rupture must govern at 1032.8 kN, got {:.0} N",
        r.phi_pn_tension
    );
    assert!(r.tension_ratio > 0.87, "900 kN / 1033 kN = 0.871, got {:.3}", r.tension_ratio);
}

/// Without Fu there is no basis for a rupture check, so yielding stands alone.
#[test]
fn aisc_tension_without_fu_falls_back_to_yielding() {
    let r = steel_run(w14x22(), ElementDesignForces { element_id: 1, n: 900e3, my: 0.0, mz: None, vy: None });
    assert!(
        (r.phi_pn_tension - 0.90 * 345e6 * 4.19e-3).abs() < 1.0,
        "expected gross-section yielding, got {:.0} N",
        r.phi_pn_tension
    );
}

/// AISC G2-1: Vn = 0.6·Fy·Aw·Cv1. `vy` was accepted and never used, so a member
/// failing in shear reported whatever the flexural and axial checks said.
///
/// Aw = d·tw = 0.348 · 0.0058 = 2.0184e-3 m²
/// phi_v·Vn = 0.90 · 0.6 · 345e6 · 2.0184e-3 · 1.0 = 376_028 N
#[test]
fn aisc_shear_is_checked_when_the_web_area_is_known() {
    let mut m = w14x22();
    m.aw = Some(2.0184e-3);

    let r = steel_run(m, ElementDesignForces {
        element_id: 1, n: 0.0, my: 10e3, mz: None, vy: Some(200e3),
    });

    assert!(
        (r.phi_vn - 376_027.9).abs() / 376_027.9 < 1e-4,
        "phi_v·Vn = 376.0 kN, got {:.0} N",
        r.phi_vn
    );
    assert!(
        (r.shear_ratio - 0.531883).abs() < 1e-4,
        "200 kN / 376.0 kN = 0.5319, got {:.4}",
        r.shear_ratio
    );
}

/// Shear must be able to govern the reported unity ratio.
#[test]
fn aisc_shear_can_govern_the_unity_ratio() {
    let mut m = w14x22();
    m.aw = Some(2.0184e-3);

    let r = steel_run(m, ElementDesignForces {
        element_id: 1, n: 0.0, my: 10e3, mz: None, vy: Some(400e3),
    });

    assert!(r.shear_ratio > 1.0, "400 kN over 376 kN exceeds unity, got {:.3}", r.shear_ratio);
    assert_eq!(r.governing_check, "Shear G2");
    assert!((r.unity_ratio - r.shear_ratio).abs() < 1e-12);
}

/// With no web area supplied there is no shear check to report.
#[test]
fn aisc_shear_absent_without_web_area() {
    let r = steel_run(w14x22(), ElementDesignForces {
        element_id: 1, n: 0.0, my: 10e3, mz: None, vy: Some(400e3),
    });
    assert_eq!(r.phi_vn, 0.0);
    assert_eq!(r.shear_ratio, 0.0);
}

// ==================== Masonry: Vn upper limit ====================

/// TMS 402 9.3.4.1.2 caps the nominal shear strength independently of how much
/// reinforcement is present:
///   M/(V·dv) <= 0.25  ->  Vn <= 0.5 ·An·sqrt(f'm)
///   M/(V·dv) >= 1.00  ->  Vn <= 0.33·An·sqrt(f'm)
/// with linear interpolation between. Without it, closely spaced reinforcement
/// bought unlimited shear capacity.
///
/// An = 0.2 m² = 2e5 mm², f'm = 10.3 MPa -> sqrt = 3.2094
/// M/(V·dv) = 0 so the cap is 0.5 · 2e5 · 3.2094 = 320_938 N
/// Uncapped the same wall computes Vm + Vs = 263_080 + 84_000 = 347_080 N.
#[test]
fn masonry_shear_capacity_is_capped() {
    let results = check_masonry_members(&MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.20,
            d: 0.10,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: Some(2.0e-4),
            s_stirrup: Some(0.05),
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(200_000.0),
            mu: Some(0.0),
            vu: Some(100_000.0),
        }],
    });
    let r = &results[0];

    let cap = 0.5 * 2.0e5 * 10.3_f64.sqrt();
    assert!(
        (r.vn - cap).abs() / cap < 1e-3,
        "Vn must be capped at 0.5·An·sqrt(f'm) = {cap:.0} N, got {:.0} N",
        r.vn
    );
}

/// Below the cap the computed Vn passes through untouched.
#[test]
fn masonry_shear_below_the_cap_is_unchanged() {
    let results = check_masonry_members(&MasonryCheckInput {
        members: vec![MasonryMemberData {
            element_id: 1,
            fm: 10.3e6,
            fy: 420e6,
            em: None,
            b: 1.0,
            t: 0.20,
            d: 0.10,
            as_tension: 6.45e-4,
            h: 3.0,
            k: Some(1.0),
            an: None,
            av: None,
            s_stirrup: None,
        }],
        forces: vec![MasonryDesignForces {
            element_id: 1,
            pu: Some(0.0),
            mu: Some(0.0),
            vu: Some(100_000.0),
        }],
    });
    let r = &results[0];

    // Vm alone = 0.083·4·sqrt(10.3)·2e5 = 213_080 N, well under the 320_938 cap.
    assert!(
        (r.vn - 213_080.0).abs() / 213_080.0 < 1e-3,
        "expected the uncapped Vm = 213.1 kN, got {:.0} N",
        r.vn
    );
}

// ==================== ACI 318-19: size effect in Vc ====================

fn rc_beam(av: Option<f64>, s: Option<f64>) -> RCMemberData {
    RCMemberData {
        element_id: 1,
        fc: 30e6,
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
        av,
        s_stirrup: s,
        lambda: None,
    }
}

/// ACI 318-19 22.5.5.1 replaced the single 0.17·lambda·sqrt(f'c) expression.
/// Where Av < Av,min the size-effect factor applies:
///   Vc = 0.66·lambda_s·lambda·rho_w^(1/3)·sqrt(f'c)·bw·d
///   lambda_s = sqrt(2/(1 + d/250)) <= 1.0
///
/// d = 550 mm -> lambda_s = sqrt(2/3.2) = 0.790569
/// rho_w = 1.5e-3/(0.3·0.55) = 0.0090909 -> cube root 0.208702
/// Vc = 0.66·0.790569·0.208702·sqrt(30)·300·550 = 98_413 N
/// phi·Vn = 0.75 · 98_413 = 73_810 N
///
/// The 318-14 expression reports Vc = 153_636 N — 56 % higher, and the size
/// effect is missing for every beam deeper than 250 mm.
#[test]
fn aci_shear_applies_the_size_effect_without_minimum_stirrups() {
    let results = check_rc_members(&RCCheckInput {
        members: vec![rc_beam(None, None)],
        forces: vec![RCDesignForces { element_id: 1, mu: 100_000.0, vu: Some(60_000.0), nu: None }],
    });
    let r = &results[0];

    assert!(
        (r.phi_vn - 73_810.0).abs() / 73_810.0 < 1e-3,
        "phi·Vn with lambda_s = 0.7906 is 73.8 kN, got {:.0} N",
        r.phi_vn
    );
}

/// With at least Av,min the size effect does not apply (lambda_s = 1.0) and the
/// 0.17·lambda·sqrt(f'c) form stands.
///   Av,min = max(0.062·sqrt(30)·300·200/420, 0.35·300·200/420) = 50.0 mm²
///   Av = 100 mm² >= Av,min
///   Vc = 0.17·sqrt(30)·300·550           = 153_636 N
///   Vs = 1.0e-4·420e6·0.55/0.20          = 115_500 N
///   phi·Vn = 0.75·(153_636 + 115_500)    = 201_852 N
#[test]
fn aci_shear_skips_the_size_effect_with_minimum_stirrups() {
    let results = check_rc_members(&RCCheckInput {
        members: vec![rc_beam(Some(1.0e-4), Some(0.20))],
        forces: vec![RCDesignForces { element_id: 1, mu: 100_000.0, vu: Some(60_000.0), nu: None }],
    });
    let r = &results[0];

    assert!(
        (r.phi_vn - 201_852.3).abs() / 201_852.3 < 1e-3,
        "phi·Vn = 201.9 kN, got {:.0} N",
        r.phi_vn
    );
}

// ==================== Foundation: both one-way shear directions ====================

/// One-way shear was only ever evaluated across the length. On a footing that
/// is longer across its width the other direction governs and was missed.
///
/// L = 2.0, B = 4.0, t = 0.6 -> d = 0.525, column 0.4 x 0.4, P = 1000 kN,
/// q = 1000/8 = 125 kPa.
///   length direction:  a = 1.0 - 0.2 - 0.525 = 0.275 m
///                      Vu = 125·4·0.275 = 137.5 kN over bw = B = 4.0 m
///                      phi·Vc = 0.75·0.17·sqrt(28)·4000·525 = 1_416_800 N
///                      ratio = 0.0971
///   width direction:   a = 2.0 - 0.2 - 0.525 = 1.275 m
///                      Vu = 125·2·1.275 = 318.75 kN over bw = L = 2.0 m
///                      phi·Vc = 708_400 N  ->  ratio = 0.4500  <- governs
#[test]
fn foundation_one_way_shear_checks_both_directions() {
    let results = check_spread_footings(&SpreadFootingInput {
        footings: vec![SpreadFootingData {
            footing_id: 1,
            length: 2.0,
            width: 4.0,
            thickness: 0.60,
            depth: 1.0,
            q_allowable: 300_000.0,
            gamma_soil: 18_000.0,
            fc: 28e6,
            col_length: 0.40,
            col_width: 0.40,
            d: None,
            mu_sliding: None,
        }],
        forces: vec![SpreadFootingForces {
            footing_id: 1, p: 1_000_000.0, mx: None, my: None, h: None,
        }],
    });
    let r = &results[0];

    assert!(
        (r.oneway_shear_ratio - 0.45001).abs() < 1e-3,
        "the width direction governs at 0.4500, got {:.4}",
        r.oneway_shear_ratio
    );
}
