//! CIRSOC 201 at f'c = 35 MPa, fy = fyd and Es = 200 GPa·0,0035/0,003 is the EN 1992-1-1 section at η·fcd = 29,75 MPa.

use dedaliano_engine::certify::design::{certify_ec2_members, BoundedEc2Demand, CertifiedEc2CheckInput, DemandBound};
use dedaliano_engine::postprocess::cirsoc201_check::{nominal_flexure, Cirsoc201Edition, Cirsoc201MemberData};
use dedaliano_engine::postprocess::ec2_check::*;

const FCK: f64 = 35.0 * 0.85 * 1.5 * 1e6;
const FCD: f64 = FCK / 1.5;
const FYD: f64 = 500e6 / 1.15;
const ES: f64 = 200e9;
const ECU3: f64 = 0.0035;
const EPS_YD: f64 = FYD / ES;
const LAMBDA: f64 = 0.8;

fn section(fck: f64, b: f64, h: f64, d: f64, as_t: f64, compression: Option<(f64, f64)>) -> Ec2MemberData {
    Ec2MemberData {
        element_id: 1,
        fck,
        fyk: 500e6,
        b,
        h,
        d,
        as_tension: as_t,
        as_compression: compression.map(|c| c.0),
        d_prime: compression.map(|c| c.1),
        es: None,
        gamma_c: None,
        gamma_s: None,
        alpha_cc: None,
        asw: None,
        s_stirrup: None,
        theta_shear: None,
        bw: None,
        z: None,
    }
}

fn run(m: &Ec2MemberData, m_ed: f64) -> Ec2CheckResult {
    let r = check_ec2_members(&Ec2CheckInput {
        members: vec![m.clone()],
        forces: vec![Ec2DesignForces { element_id: m.element_id, m_ed: Some(m_ed), v_ed: None, n_ed: None }],
    });
    r[0].clone()
}

fn cirsoc_mn(m: &Ec2MemberData) -> f64 {
    let c = Cirsoc201MemberData {
        element_id: m.element_id,
        fc: 35e6,
        fy: FYD,
        es: Some(ES * ECU3 / 0.003),
        b: m.b,
        bf: None,
        hf: None,
        h: m.h,
        d: m.d,
        as_tension: m.as_tension,
        as_compression: m.as_compression,
        d_prime: m.d_prime,
        av: None,
        s_stirrup: None,
        fyt: None,
        ag: None,
        lambda: None,
        edition: Cirsoc201Edition::default(),
    };
    nominal_flexure(&c).expect("CIRSOC 201 evaluates the section").mn
}

fn positive_root(a: f64, b: f64, c: f64) -> f64 {
    (-b + (b * b - 4.0 * a * c).sqrt()) / (2.0 * a)
}

fn close(got: f64, want: f64, rel: f64, what: &str) {
    assert!((got - want).abs() <= rel * want.abs(), "{what}: {got} vs {want}");
}

fn certify(m: &Ec2MemberData, m_ed: f64) -> dedaliano_engine::certify::design::CertifiedMemberResult {
    let res = certify_ec2_members(&CertifiedEc2CheckInput {
        members: vec![m.clone()],
        demands: vec![BoundedEc2Demand {
            forces: Ec2DesignForces { element_id: m.element_id, m_ed: Some(m_ed), v_ed: None, n_ed: None },
            bound: DemandBound { n: 0.0, my: 0.0, mz: 0.0, vy: 0.0 },
        }],
    });
    res[0].clone()
}

#[test]
fn singly_reinforced_tension_steel_yields() {
    let (b, d, as_t) = (0.30, 0.45, 1.257e-3);
    let m = section(FCK, b, 0.50, d, as_t, None);

    let x = as_t * FYD / (FCD * LAMBDA * b);
    assert!(ECU3 * (d / x - 1.0) > EPS_YD);
    let m_rd = as_t * FYD * (d - LAMBDA * x / 2.0);
    close(x, 0.076_543_660_942_6, 1e-10, "hand x");
    close(m_rd, 229_201.672_729_6, 1e-10, "hand MRd");

    let r = run(&m, 200e3);
    close(r.x_na, x, 1e-9, "x");
    close(r.z, d - LAMBDA * x / 2.0, 1e-9, "z");
    close(r.m_rd, m_rd, 1e-9, "MRd");
    close(cirsoc_mn(&m), m_rd, 1e-9, "CIRSOC 201 Mn");
    assert!(r.pass);
}

#[test]
fn doubly_reinforced_compression_steel_does_not_yield() {
    let (b, d, d_p, as_t, as_c) = (0.25, 0.45, 0.06, 2.9e-3, 1.5e-3);
    let m = section(FCK, b, 0.50, d, as_t, Some((as_c, d_p)));

    let x = positive_root(FCD * LAMBDA * b, as_c * (ES * ECU3 - FCD) - as_t * FYD, -as_c * ES * ECU3 * d_p);
    let sigma_sc = ES * ECU3 * (1.0 - d_p / x);
    assert!(FCD < sigma_sc && sigma_sc < FYD, "compression steel elastic: {sigma_sc}");
    assert!(ECU3 * (d / x - 1.0) > EPS_YD);
    let m_rd = FCD * LAMBDA * b * x * (d - LAMBDA * x / 2.0) + as_c * (sigma_sc - FCD) * (d - d_p);
    close(x, 0.126_585_315_220_3, 1e-10, "hand x");
    close(sigma_sc, 368.207_959_8e6, 1e-9, "hand σsc");
    close(m_rd, 498_793.343_938_4, 1e-10, "hand MRd");

    let r = run(&m, 400e3);
    close(r.x_na, x, 1e-9, "x");
    close(r.z, d - LAMBDA * x / 2.0, 1e-9, "z");
    close(r.m_rd, m_rd, 1e-9, "MRd");
    close(cirsoc_mn(&m), m_rd, 1e-9, "CIRSOC 201 Mn");
}

#[test]
fn over_reinforced_tension_steel_does_not_yield() {
    let (b, h, d, as_t) = (0.25, 0.40, 0.35, 4.0e-3);
    assert!(as_t / (b * h) <= 0.04);
    let m = section(FCK, b, h, d, as_t, None);

    let x = positive_root(FCD * LAMBDA * b, as_t * ES * ECU3, -as_t * ES * ECU3 * d);
    let sigma_st = ES * ECU3 * (d / x - 1.0);
    assert!(sigma_st < FYD, "tension steel elastic: {sigma_st}");
    let m_rd = FCD * LAMBDA * b * x * (d - LAMBDA * x / 2.0);
    close(x, 0.233_821_224_408_9, 1e-10, "hand x");
    close(sigma_st, 347.809_071_3e6, 1e-9, "hand σst");
    close(m_rd, 356_812.471_169_4, 1e-10, "hand MRd");

    let r = run(&m, 300e3);
    close(r.x_na, x, 1e-9, "x");
    close(r.m_rd, m_rd, 1e-9, "MRd");
    close(cirsoc_mn(&m), m_rd, 1e-9, "CIRSOC 201 Mn");
}

#[test]
fn issue_534_over_reinforced_c25_30_reproduction() {
    let (b, d, as_t) = (0.25, 0.35, 2.5e-3);
    let m = section(25e6, b, 0.40, d, as_t, None);
    let fcd = 25e6 / 1.5;
    let x = positive_root(fcd * LAMBDA * b, as_t * ES * ECU3, -as_t * ES * ECU3 * d);
    assert!(ECU3 * (d / x - 1.0) < EPS_YD);
    let m_rd = fcd * LAMBDA * b * x * (d - LAMBDA * x / 2.0);
    close(m_rd, 203_278.565_601_2, 1e-10, "hand MRd");
    close(run(&m, 0.0).m_rd, m_rd, 1e-9, "MRd");
}

#[test]
fn high_strength_concrete_uses_table_3_1_ultimate_strain() {
    let fck = 70e6;
    let (b, d, as_t) = (0.25, 0.35, 6.0e-3);
    let m = section(fck, b, 0.40, d, as_t, None);
    let fck_mpa = fck / 1e6;
    let ecu3 = (2.6 + 35.0 * ((90.0 - fck_mpa) / 100.0).powi(4)) / 1000.0;
    let lambda = 0.8 - (fck_mpa - 50.0) / 400.0;
    let eta = 1.0 - (fck_mpa - 50.0) / 200.0;
    let k = eta * fck / 1.5;
    let x = positive_root(k * lambda * b, as_t * ES * ecu3, -as_t * ES * ecu3 * d);
    assert!(ecu3 * (d / x - 1.0) < EPS_YD);
    let m_rd = k * lambda * b * x * (d - lambda * x / 2.0);
    let r = run(&m, 0.0);
    close(r.x_na, x, 1e-9, "x");
    close(r.m_rd, m_rd, 1e-9, "MRd");
}

#[test]
fn compression_bars_in_tension_add_nothing() {
    let (b, d, d_p, as_t) = (0.30, 0.45, 0.06, 0.5e-3);
    let singly = run(&section(25e6, b, 0.50, d, as_t, None), 0.0);
    let doubly = run(&section(25e6, b, 0.50, d, as_t, Some((as_t, d_p))), 0.0);
    assert!(singly.x_na < d_p);
    close(doubly.m_rd, singly.m_rd, 1e-12, "MRd");
    close(doubly.x_na, singly.x_na, 1e-12, "x");
}

#[test]
fn symmetric_reinforcement_keeps_a_positive_neutral_axis() {
    let (b, d, d_p, as_t) = (0.30, 0.55, 0.05, 3.0e-3);
    let r = run(&section(25e6, b, 0.60, d, as_t, Some((as_t, d_p))), 0.0);
    assert!(r.x_na > 0.0 && r.x_na < d, "x = {}", r.x_na);
    assert!(r.z < d);
    let singly = run(&section(25e6, b, 0.60, d, as_t, None), 0.0);
    assert!(r.m_rd >= singly.m_rd && r.m_rd <= as_t * FYD * d, "{} vs {}", r.m_rd, singly.m_rd);
}

#[test]
fn matches_cirsoc_201_strain_compatibility_on_a_sweep() {
    let mut seed = 0x534u64;
    let mut unit = || {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 11) as f64 / (1u64 << 53) as f64
    };
    for i in 0..2000 {
        let b = 0.2 + 0.4 * unit();
        let h = 0.3 + 0.6 * unit();
        let d = h - 0.04 - 0.03 * unit();
        let as_t = b * h * (0.002 + 0.038 * unit());
        let compression = if unit() < 0.6 { Some((as_t * unit(), 0.03 + 0.05 * unit())) } else { None };
        let m = section(FCK, b, h, d, as_t, compression);
        close(run(&m, 0.0).m_rd, cirsoc_mn(&m), 1e-9, &format!("section {i}"));
    }
}

#[test]
fn old_overestimate_does_not_certify_ok() {
    let over = section(FCK, 0.25, 0.40, 0.35, 4.0e-3, None);
    let doubly = section(FCK, 0.25, 0.50, 0.45, 2.9e-3, Some((1.5e-3, 0.06)));
    let issue = section(25e6, 0.25, 0.40, 0.35, 2.5e-3, None);
    for (m, old_m_rd, m_rd) in [
        (over, 405_362.901_304_2, 356_812.471_169_4),
        (doubly, 503_352.607_583_7, 498_793.343_938_4),
        (issue, 238_657.844_990_5, 203_278.565_601_2),
    ] {
        let m_ed = 0.5 * (old_m_rd + m_rd);
        let r = run(&m, m_ed);
        assert!(r.flexure_ratio > 1.0 && !r.pass, "{r:?}");
        let c = certify(&m, m_ed);
        assert!(c.certified && !c.certified_ok && c.certified_fail, "{c:?}");
        close(c.utilization_lower, m_ed / m_rd, 1e-9, "certified lower");
        close(c.utilization_upper, m_ed / m_rd, 1e-9, "certified upper");
    }
}

#[test]
fn certified_capacity_encloses_the_strain_compatibility_root() {
    let cases = [
        section(FCK, 0.30, 0.50, 0.45, 1.257e-3, None),
        section(FCK, 0.25, 0.50, 0.45, 2.9e-3, Some((1.5e-3, 0.06))),
        section(FCK, 0.25, 0.40, 0.35, 4.0e-3, None),
        section(70e6, 0.25, 0.40, 0.35, 6.0e-3, None),
    ];
    for m in cases {
        let m_rd = run(&m, 0.0).m_rd;
        let c = certify(&m, 0.9 * m_rd);
        assert!(c.certified && c.certified_ok, "{c:?}");
        assert!(c.utilization_lower <= 0.9 + 1e-12 && 0.9 - 1e-12 <= c.utilization_upper, "{c:?}");
        assert!(c.utilization_upper - c.utilization_lower < 1e-9, "{c:?}");
    }
}

#[test]
fn inputs_without_a_monotone_force_balance_are_not_evaluated() {
    let base = section(25e6, 0.30, 0.50, 0.45, 1.5e-3, None);
    let cases = [
        Ec2MemberData { alpha_cc: Some(0.0), ..base.clone() },
        Ec2MemberData { gamma_c: Some(-1.5), ..base.clone() },
        Ec2MemberData { gamma_s: Some(f64::NAN), ..base.clone() },
        Ec2MemberData { es: Some(f64::INFINITY), ..base.clone() },
        Ec2MemberData { d: 0.55, ..base.clone() },
        Ec2MemberData { as_tension: -1.5e-3, ..base.clone() },
    ];
    for m in cases {
        let r = run(&m, 100e3);
        assert!(!r.pass && r.unevaluated.iter().any(|c| c == "Flexure 6.1"), "{r:?}");
        let c = certify(&m, 100e3);
        assert!(!c.certified && !c.certified_ok, "{c:?}");
    }
}
