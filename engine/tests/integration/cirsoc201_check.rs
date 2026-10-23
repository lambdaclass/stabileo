use dedaliano_engine::postprocess::cirsoc201_check::*;

/// A rectangular section with no stirrups and no compression steel, edition 2025.
fn section(fc: f64, fy: f64, b: f64, h: f64, d: f64, as_tension: f64) -> Cirsoc201MemberData {
    Cirsoc201MemberData {
        element_id: 1,
        fc,
        fy,
        es: None,
        b,
        h,
        d,
        as_tension,
        as_compression: None,
        d_prime: None,
        av: None,
        s_stirrup: None,
        fyt: None,
        ag: None,
        lambda: None, bf: None, hf: None,
        edition: Cirsoc201Edition::E2025,
    }
}

fn forces(mu: Option<f64>, vu: Option<f64>, nu: Option<f64>) -> Cirsoc201DesignForces {
    Cirsoc201DesignForces { element_id: 1, mu, vu, axial_compression: nu }
}

fn check(m: Cirsoc201MemberData, f: Cirsoc201DesignForces) -> Cirsoc201CheckResult {
    check_single_cirsoc201(&m, &f)
}

fn close(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol * b.abs().max(1e-12)
}

/// Singly reinforced, tension-controlled: the closed form of 22.2 with both steels yielding.
#[test]
fn cirsoc201_singly_reinforced() {
    let r = check(section(25e6, 420e6, 0.30, 0.50, 0.45, 1.257e-3), forces(Some(150_000.0), None, None));
    let a = 1.257e-3 * 420e6 / (0.85 * 25e6 * 0.30);
    assert!(close(r.a, a, 1e-6), "a: {} vs {}", r.a, a);
    // c = a/0.85, εt = 0.003(d − c)/c ≈ 0.0109 ≥ εty + 0.003 = 0.0051 → φ = 0.90.
    assert_eq!(r.phi, 0.90);
    assert!(close(r.phi_mn, 0.9 * 1.257e-3 * 420e6 * (0.45 - a / 2.0), 1e-6), "{}", r.phi_mn);
    assert!(close(r.fs_tension, 420e6, 1e-12));
    assert!(r.flexure_ratio < 1.0);
    assert!(r.pass, "{:?}", r);
}

#[test]
fn cirsoc201_flexure_fails() {
    let r = check(section(21e6, 420e6, 0.25, 0.40, 0.35, 3.93e-4), forces(Some(60_000.0), None, None));
    // φMn ≈ 0.90 · 3.93e-4 · 420e6 · (0.35 − 0.018) ≈ 49.3 kN·m < 60 kN·m
    assert!(r.flexure_ratio > 1.0, "Should fail: {:.3}", r.flexure_ratio);
    assert!(!r.pass);
}

/// Doubly reinforced: the state returned must satisfy equilibrium.
#[test]
fn cirsoc201_doubly_reinforced() {
    let mut m = section(30e6, 420e6, 0.30, 0.60, 0.54, 2.513e-3);
    m.as_compression = Some(6.28e-4);
    m.d_prime = Some(0.06);
    let r = check(m.clone(), forces(Some(350_000.0), None, None));
    let cc = 0.85 * 30e6 * r.a * 0.30;
    let displaced = if 0.06 <= r.a { 0.85 * 30e6 } else { 0.0 };
    let cs = 6.28e-4 * (r.fs_compression - displaced).max(0.0);
    let t = 2.513e-3 * r.fs_tension;
    assert!(((cc + cs) - t).abs() < 1e-6 * t, "C = {} vs T = {}", cc + cs, t);
    assert!(r.phi_mn > 300_000.0, "phi*Mn: {:.0}", r.phi_mn);
    assert!(r.pass);
}

/// No stirrups: CIRSOC 201-2025 Tabla 22.5.5.1 row (c), with the size factor. The checker
/// used 0,17·√f'c·bw·d here, row (a), which needs Av ≥ Av,min: 45 % above the clause.
#[test]
fn cirsoc201_shear_without_stirrups_uses_row_c() {
    let r = check(section(25e6, 420e6, 0.30, 0.50, 0.45, 1.257e-3), forces(None, Some(50_000.0), None));
    let lambda_s = (2.0_f64 / (1.0 + 0.004 * 450.0)).sqrt();
    let rho_w: f64 = 1.257e-3 / (0.30 * 0.45);
    let vc = 0.66 * lambda_s * rho_w.cbrt() * 5.0 * 300.0 * 450.0;
    assert!(close(r.vc, vc, 1e-9), "Vc: {} vs {}", r.vc, vc);
    assert!(r.vc < 0.17 * 5.0 * 300.0 * 450.0 * 0.75, "row (c) is well below row (a) here");
    assert!(r.av_below_min);
    assert_eq!(r.vs, 0.0);
    // 50 kN > φ·0,085·√f'c·bw·d = 43 kN: 9.6.3.1 asks for Av,min, and there is none.
    assert!(r.min_shear_reinforcement_missing);
    assert!(!r.pass);
}

/// The 2005 edition: Vc = √f'c/6·bw·d (11.3.1.1), not the 0,17 of ACI 318M.
#[test]
fn cirsoc201_2005_concrete_shear_is_one_sixth() {
    let mut m = section(25e6, 420e6, 0.30, 0.50, 0.45, 1.257e-3);
    m.edition = Cirsoc201Edition::E2005;
    let r = check(m, forces(None, Some(30_000.0), None));
    assert!(close(r.vc, 5.0 / 6.0 * 300.0 * 450.0, 1e-12), "{}", r.vc);
    // 30 kN < 0,5·φ·Vc = 42 kN: no minimum required.
    assert!(!r.min_shear_reinforcement_missing);
    assert!(r.pass);
}

#[test]
fn cirsoc201_shear_with_stirrups() {
    let mut m = section(25e6, 420e6, 0.30, 0.60, 0.54, 1.885e-3);
    m.av = Some(1.57e-4);
    m.s_stirrup = Some(0.15);
    let r = check(m, forces(None, Some(200_000.0), None));
    let expected_vs = 1.57e-4 * 420e6 * 0.54 / 0.15;
    assert!(close(r.vs, expected_vs, 1e-12), "Vs: {} vs {}", r.vs, expected_vs);
    // Av,min = max(0,062·5, 0,35)·300·150/420 = 37,5 mm² ≤ 157 mm²: row (a).
    assert!(!r.av_below_min);
    assert!(close(r.vc, 0.17 * 5.0 * 300.0 * 540.0, 1e-12));
    assert!(r.shear_ratio < 1.0);
    assert!(r.pass);
}

/// fyt above 420 MPa is not credited (22.5.3.3).
#[test]
fn cirsoc201_stirrup_yield_is_capped_at_420() {
    let mut m = section(25e6, 500e6, 0.30, 0.60, 0.54, 1.885e-3);
    m.av = Some(1.57e-4);
    m.s_stirrup = Some(0.15);
    let r = check(m, forces(None, Some(100_000.0), None));
    assert!(close(r.vs, 1.57e-4 * 420e6 * 0.54 / 0.15, 1e-12), "{}", r.vs);
}

/// Vs is limited to 0,66·√f'c·bw·d (22.5.1.2).
#[test]
fn cirsoc201_vs_is_capped_by_the_section() {
    let mut m = section(20e6, 420e6, 0.20, 0.40, 0.36, 1.0e-3);
    m.av = Some(4.0 * 1.131e-4);
    m.s_stirrup = Some(0.05);
    let r = check(m, forces(None, Some(100_000.0), None));
    assert!(r.vs_capped);
    assert!(close(r.vs, 0.66 * 20f64.sqrt() * 200.0 * 360.0, 1e-12));
}

/// Axial force in Tabla 22.5.5.1: Nu/(6·Ag), compression positive, capped at 0,05·f'c.
#[test]
fn cirsoc201_axial_term_in_shear() {
    let mut m = section(25e6, 420e6, 0.30, 0.50, 0.45, 1.257e-3);
    m.av = Some(1.57e-4);
    m.s_stirrup = Some(0.15);
    let base = check(m.clone(), forces(None, Some(10.0), None)).vc;
    let comp = check(m.clone(), forces(None, Some(10.0), Some(300_000.0))).vc;
    let tens = check(m.clone(), forces(None, Some(10.0), Some(-300_000.0))).vc;
    let term = 300_000.0 / (6.0 * 0.15e6) * 300.0 * 450.0;
    assert!(close(comp - base, term, 1e-9), "{} vs {}", comp - base, term);
    assert!(close(base - tens, term, 1e-9));
    // A huge compression is capped at 0,05·f'c, then by 0,42·√f'c.
    let huge = check(m, forces(None, Some(10.0), Some(1e9))).vc;
    assert!(close(huge, (0.17_f64 * 5.0 + 0.05 * 25.0).min(0.42 * 5.0) * 300.0 * 450.0, 1e-12));
}

/// Heavy steel: the tension bars do not yield, φ drops, and 9.3.3.1 rejects the beam.
#[test]
fn cirsoc201_over_reinforced_beam_is_not_ductile() {
    let r = check(section(25e6, 420e6, 0.25, 0.40, 0.35, 2.513e-3), forces(Some(100_000.0), None, None));
    assert!(r.fs_tension < 420e6, "tension steel must not be assumed to yield: {}", r.fs_tension);
    assert!(r.epsilon_t < 420e6 / 200e9);
    assert_eq!(r.phi, 0.65);
    assert!(r.ductility_ratio > 1.0);
    assert!(!r.pass);
    assert_eq!(r.governing_check, "Ductility");
}

/// The 2025 tension-controlled limit is εty + 0,003, which for 500 MPa steel is 0,0055.
#[test]
fn cirsoc201_phi_limit_depends_on_fy_in_2025() {
    // Choose As so that εt lands between 0,005 and 0,0055.
    let (fc, fy, b, d) = (25e6, 500e6, 0.30, 0.45);
    let b1 = 0.85;
    let c = 0.003 * d / (0.003 + 0.0052);
    let as_t = 0.85 * fc * b1 * c * b / fy;
    let r = check(section(fc, fy, b, 0.50, d, as_t), forces(Some(1.0), None, None));
    assert!((r.epsilon_t - 0.0052).abs() < 1e-6, "{}", r.epsilon_t);
    let phi = 0.65 + 0.25 * (0.0052 - 0.0025) / 0.003;
    assert!((r.phi - phi).abs() < 1e-6, "{} vs {}", r.phi, phi);
    // And the beam is not tension-controlled, so 9.3.3.1 rejects it.
    assert!(r.ductility_ratio > 1.0 && !r.pass);
    // The 2005 edition calls the same section tension-controlled, and 10.3.5 accepts it.
    let mut m = section(fc, fy, b, 0.50, d, as_t);
    m.edition = Cirsoc201Edition::E2005;
    let r05 = check(m, forces(Some(1.0), None, None));
    assert_eq!(r05.phi, 0.90);
    assert!(r05.pass);
}

/// No tension steel against a moment is unevaluated, never a pass.
#[test]
fn cirsoc201_no_tension_steel_is_not_a_pass() {
    let r = check(section(25e6, 420e6, 0.30, 0.50, 0.45, 0.0), forces(Some(10_000.0), None, None));
    assert!(!r.pass);
    assert!(!r.unevaluated.is_empty());
}

/// JSON without an edition means the edition in force.
#[test]
fn cirsoc201_edition_defaults_to_2025() {
    let json = r#"{"members":[{"elementId":1,"fc":25e6,"fy":420e6,"b":0.3,"h":0.5,"d":0.45,"asTension":1.257e-3}],
                  "forces":[{"elementId":1,"vu":1000.0}]}"#;
    let input: Cirsoc201CheckInput = serde_json::from_str(json).unwrap();
    let r = &check_cirsoc201_members(&input)[0];
    assert_eq!(r.edition, Cirsoc201Edition::E2025);
}

#[test]
fn cirsoc201_multiple_members() {
    let mut a = section(30e6, 420e6, 0.35, 0.60, 0.54, 2.513e-3);
    a.element_id = 3;
    a.av = Some(1.57e-4);
    a.s_stirrup = Some(0.20);
    let b = section(25e6, 420e6, 0.25, 0.45, 0.40, 9.42e-4);
    let input = Cirsoc201CheckInput {
        members: vec![a, b],
        forces: vec![
            Cirsoc201DesignForces { element_id: 3, mu: Some(300_000.0), vu: Some(150_000.0), axial_compression: None },
            forces(Some(100_000.0), Some(40_000.0), None),
        ],
    };
    let results = check_cirsoc201_members(&input);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].element_id, 1);
    assert_eq!(results[1].element_id, 3);
    assert!(results[0].phi_mn > 0.0);
    assert!(results[1].phi_mn > 0.0);
}

// ==================== Regression tests (certification review) ====================

fn beam(fc: f64, fy: f64, b: f64, d: f64, as_t: f64) -> Cirsoc201MemberData {
    Cirsoc201MemberData {
        element_id: 1,
        fc,
        fy,
        es: None,
        b,
        h: d + 0.05,
        d,
        as_tension: as_t,
        as_compression: None,
        d_prime: None,
        av: None,
        s_stirrup: None,
        fyt: None,
        ag: None,
        lambda: None,
        bf: None,
        hf: None,
        // These regressions follow the CIRSOC 201-2005 clauses they cite.
        edition: Cirsoc201Edition::E2005,
    }
}

fn run(m: Cirsoc201MemberData, mu: Option<f64>, vu: Option<f64>) -> Cirsoc201CheckResult {
    check_cirsoc201_members(&Cirsoc201CheckInput {
        members: vec![m],
        forces: vec![Cirsoc201DesignForces { element_id: 1, mu, vu, axial_compression: None }],
    })
    .remove(0)
}

/// A section with no tension steel has no flexural capacity. phi·Mn was 0,
/// read as ratio 0, and the member passed any moment.
#[test]
fn cirsoc201_zero_capacity_does_not_pass() {
    let r = run(beam(25e6, 420e6, 0.3, 0.45, 0.0), Some(100_000.0), None);
    assert!(!r.pass, "{r:?}");
    assert!(r.unevaluated.iter().any(|n| n.contains("Flexure")), "{r:?}");
}

/// Over-reinforced beam (test 6 section): εt < εy, so the tension steel does
/// not yield. Strain compatibility (independent bisection): c = 0.25184 m,
/// fs = 383.63 MPa, Mn = 249 947 N·m, εt = 0.001918 → phi = 0.65.
/// Assuming fs = fy gave Mn = 264 564 N·m (+5.8%).
#[test]
fn cirsoc201_over_reinforced_uses_steel_strain() {
    let r = run(beam(25e6, 420e6, 0.25, 0.35, 2.513e-3), Some(100_000.0), None);
    let expected = 0.65 * 249_947.42;
    assert!((r.phi - 0.65).abs() < 1e-12, "phi {}", r.phi);
    assert!((r.phi_mn - expected).abs() / expected < 1e-6, "phi·Mn {} vs {expected}", r.phi_mn);
}

/// Doubly reinforced, c < d' (the "compression" bars are in tension). The
/// bar stress was taken from the singly reinforced c (fs' = −385.6 MPa):
/// Mn 125.6 kN·m. Full strain compatibility crediting the top bars' tension
/// gives 120.5 kN·m (c = 0.060840 m, fs' = −139.64 MPa). The merged checker
/// (integration/safety-wave) does not credit bars on the compression side
/// while they are in tension, which can only lower Mn: here the section acts
/// as singly reinforced, Mn = As·fy·(d − a/2) = 115.1 kN·m, below both.
#[test]
fn cirsoc201_doubly_reinforced_uses_strain_compatibility() {
    let mut m = beam(40e6, 420e6, 0.40, 0.26, 1.13e-3);
    m.as_compression = Some(1.13e-3);
    m.d_prime = Some(0.075);
    let r = run(m, Some(100_000.0), None);
    let a = 1.13e-3 * 420e6 / (0.85 * 40e6 * 0.40);
    let expected = 0.90 * 1.13e-3 * 420e6 * (0.26 - a / 2.0);
    assert!((r.phi_mn - expected).abs() / expected < 1e-6, "phi·Mn {} vs {expected}", r.phi_mn);
    assert!(r.phi_mn < 0.90 * 120_527.496, "never above full strain compatibility");
    assert!(r.c < 0.075 && r.fs_compression == 0.0, "{r:?}");
}

/// ADN 500: the compression-controlled limit is fy/Es = 0.0025, not 0.002.
/// At εt = 0.00247 the section is compression-controlled (phi = 0.65); the
/// fixed 0.002 limit gave phi ≈ 0.68.
#[test]
fn cirsoc201_adn500_compression_controlled_limit() {
    let r = run(beam(30e6, 500e6, 0.3, 0.45, 3.1966e-3), Some(100_000.0), None);
    assert!((r.phi - 0.65).abs() < 1e-12, "phi {}", r.phi);
}

/// ADN 420: 10.3.3 permits εty = 0.002, which gives a higher φ than fy/Es =
/// 0.0021 (0.775 vs 0.7707 at εt = 0.0035). The merged checker takes the
/// stricter fy/Es for every grade.
#[test]
fn cirsoc201_adn420_uses_fy_over_es() {
    let (fc, fy, b, d) = (25e6, 420e6, 0.3, 0.45);
    let c: f64 = 0.003 * d / 0.0065;
    let as_t = 0.85 * fc * 0.85 * c * b / fy;
    let r = run(beam(fc, fy, b, d, as_t), Some(1.0), None);
    let ety = 420e6 / 200e9;
    let expected = 0.65 + 0.25 * (0.0035 - ety) / (0.005 - ety);
    assert!((r.phi - expected).abs() < 1e-9, "phi {} vs {expected}", r.phi);
    assert!(r.phi < 0.775);
}

/// 11.1.2: sqrt(f'c) is capped in Vc. 2005 writes 25/3 MPa, 2025 8.3 MPa;
/// the checker uses the lower 8.3 in both editions. Vc = (1/6)·√f'c·bw·d (11.3.1.1).
#[test]
fn cirsoc201_vc_caps_sqrt_fc() {
    let r = run(beam(80e6, 420e6, 0.3, 0.45, 1.257e-3), None, Some(50_000.0));
    let expected = 8.3 / 6.0 * 300.0 * 450.0;
    assert!((r.vc - expected).abs() / expected < 1e-12, "Vc {} vs {expected}", r.vc);
    assert!(r.vc < (25.0 / 3.0) / 6.0 * 300.0 * 450.0);
}

/// 22.4.3.1 & Tabla 21.2.2: axial tension above φ·Pnt,max = 0,90·As·fy cannot
/// be equilibrated by the section and must not pass.
#[test]
fn cirsoc201_axial_tension_exceeding_phi_pnt_does_not_pass() {
    let m = section(25e6, 420e6, 0.30, 0.50, 0.45, 1.0e-3);
    // φ·Pnt,max = 0,90 · 1,0e-3 · 420e6 = 378 kN < 400 kN tension
    let r = check(m, forces(Some(5_000.0), None, Some(-400_000.0)));
    assert!(!r.pass, "{r:?}");
    assert!(r.unevaluated.iter().any(|n| n.contains("Flexure")), "{r:?}");
}

/// Tabla 22.4.2.1 & 21.2.2: compression-controlled axial force uses φ = 0,65
/// in axial equilibrium (Pn = Nu / 0,65) and rejects Nu > φ·Pn,max = 0,80·0,65·Po.
#[test]
fn cirsoc201_axial_compression_uses_phi_and_enforces_phi_pn_max() {
    let mut m = section(28e6, 420e6, 0.40, 0.40, 0.34, 1.6e-3);
    m.as_compression = Some(0.8e-3);
    m.d_prime = Some(0.06);
    m.es = Some(200e9);

    // Nu = 1800 kN (compression-controlled, φ = 0,65): φ·Mn ≈ 152,2 kN·m < Mu = 200 kN·m
    let r = check(m.clone(), forces(Some(200_000.0), None, Some(1_800_000.0)));
    assert!((r.phi_mn - 152_188.6).abs() / 152_188.6 < 1e-3, "phi_mn = {}", r.phi_mn);
    assert!(r.flexure_ratio > 1.0 && !r.pass, "{r:?}");

    // Nu = 2800 kN > φ·Pn,max = 0,80 · 0,65 · Po = 2474,6 kN: rejected
    let r_over = check(m, forces(Some(10_000.0), None, Some(2_800_000.0)));
    assert!(!r_over.pass, "{r_over:?}");
    assert!(r_over.unevaluated.iter().any(|n| n.contains("Flexure")), "{r_over:?}");
}
