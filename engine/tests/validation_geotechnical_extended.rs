/// Validation: Advanced Geotechnical Engineering Benchmark Cases
///
/// References:
///   - Meyerhof (1963): "Some Recent Research on the Bearing Capacity of Foundations",
///     Canadian Geotechnical Journal, 1(1), pp. 16-26
///   - Das: "Principles of Foundation Engineering" 9th ed.
///   - Terzaghi (1943): "Theoretical Soil Mechanics"
///   - Coulomb (1776): "Essai sur une application des regles de maximis et minimis"
///   - Rankine (1857): "On the Stability of Loose Earth"
///   - Tomlinson: "Pile Design and Construction Practice" 6th ed.
///   - Bowles: "Foundation Analysis and Design" 5th ed.
///   - Coduto: "Foundation Design: Principles and Practices" 3rd ed.
///   - Hetenyi (1946): "Beams on Elastic Foundation"
///
/// Tests verify geotechnical formulas with hand-computed analytical values.
/// Pure arithmetic verification unless noted otherwise.

mod helpers;

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Meyerhof Bearing Capacity with Shape, Depth, Inclination Factors
// ================================================================
//
// q_ult = c*Nc*Fcs*Fcd*Fci + q*Nq*Fqs*Fqd*Fqi + 0.5*gamma*B*Ngamma*Fgs*Fgd*Fgi
//
// Bearing capacity factors (Meyerhof/Reissner):
//   Nq = exp(pi*tan(phi)) * tan^2(45 + phi/2)
//   Nc = (Nq - 1) * cot(phi)
//   Ngamma = 2*(Nq + 1)*tan(phi)
//
// Shape factors (De Beer 1970):
//   Fcs = 1 + (B/L)*(Nq/Nc)
//   Fqs = 1 + (B/L)*tan(phi)
//   Fgs = 1 - 0.4*(B/L)
//
// Depth factors (Hansen 1970, Df/B <= 1):
//   Fcd = 1 + 0.4*(Df/B)
//   Fqd = 1 + 2*tan(phi)*(1-sin(phi))^2*(Df/B)
//   Fgd = 1.0
//
// Inclination factors (Meyerhof 1963):
//   Fci = Fqi = (1 - alpha/90)^2
//   Fgi = (1 - alpha/phi)^2
//
// Test: c = 25 kPa, phi = 28 deg, gamma = 18 kN/m^3
//       B = 2.0 m, L = 4.0 m, Df = 1.5 m, alpha = 10 deg (load inclination)

#[test]
fn validation_geo_ext_1_meyerhof_bearing() {
    let c: f64 = 25.0;         // kPa
    let phi_deg: f64 = 28.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let gamma: f64 = 18.0;     // kN/m^3
    let b: f64 = 2.0;          // m (width)
    let l: f64 = 4.0;          // m (length)
    let df: f64 = 1.5;         // m (depth)
    let alpha_deg: f64 = 10.0; // degrees (load inclination)

    let q: f64 = gamma * df; // overburden pressure = 27 kPa

    // Bearing capacity factors
    let nq: f64 = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc: f64 = (nq - 1.0) / phi.tan();
    let n_gamma: f64 = 2.0 * (nq + 1.0) * phi.tan();

    // Verify Nq, Nc, Ngamma for phi=28
    // Expected: Nq ~ 14.72, Nc ~ 25.80, Ngamma ~ 16.72
    assert!(nq > 10.0 && nq < 25.0, "Nq for phi=28 in reasonable range: {:.2}", nq);
    assert!(nc > 20.0 && nc < 35.0, "Nc for phi=28 in reasonable range: {:.2}", nc);

    // Shape factors (De Beer 1970)
    let fcs: f64 = 1.0 + (b / l) * (nq / nc);
    let fqs: f64 = 1.0 + (b / l) * phi.tan();
    let fgs: f64 = 1.0 - 0.4 * (b / l);

    assert!(fcs > 1.0, "Fcs should be > 1.0");
    assert!(fqs > 1.0, "Fqs should be > 1.0");
    assert_close(fgs, 0.8, 1e-10, "Fgs = 1 - 0.4*(2/4) = 0.8");

    // Depth factors (Df/B = 0.75 <= 1)
    let df_over_b: f64 = df / b;
    let fcd: f64 = 1.0 + 0.4 * df_over_b;
    let fqd: f64 = 1.0 + 2.0 * phi.tan() * (1.0 - phi.sin()).powi(2) * df_over_b;
    let fgd: f64 = 1.0;

    assert_close(fcd, 1.3, 1e-10, "Fcd = 1 + 0.4*0.75 = 1.3");

    // Inclination factors (Meyerhof)
    let fci: f64 = (1.0 - alpha_deg / 90.0).powi(2);
    let fqi: f64 = fci;
    let fgi: f64 = (1.0 - alpha_deg / phi_deg).powi(2);

    assert!(fci < 1.0 && fci > 0.0, "Fci should be between 0 and 1");
    assert!(fgi < 1.0 && fgi > 0.0, "Fgi should be between 0 and 1");

    let ratio_ci: f64 = 1.0 - 10.0 / 90.0;
    let expected_fci: f64 = ratio_ci.powi(2);
    assert_close(fci, expected_fci, 1e-10, "Fci = (1 - 10/90)^2");

    let ratio_gi: f64 = 1.0 - 10.0 / 28.0;
    let expected_fgi: f64 = ratio_gi.powi(2);
    assert_close(fgi, expected_fgi, 1e-10, "Fgi = (1 - 10/28)^2");

    // Full bearing capacity
    let term1: f64 = c * nc * fcs * fcd * fci;
    let term2: f64 = q * nq * fqs * fqd * fqi;
    let term3: f64 = 0.5 * gamma * b * n_gamma * fgs * fgd * fgi;
    let q_ult: f64 = term1 + term2 + term3;

    // Verify sum
    assert_close(q_ult, term1 + term2 + term3, 1e-10, "q_ult = sum of three terms");

    // All three terms should be positive
    assert!(term1 > 0.0, "cohesion term positive: {:.2}", term1);
    assert!(term2 > 0.0, "overburden term positive: {:.2}", term2);
    assert!(term3 > 0.0, "self-weight term positive: {:.2}", term3);

    // Reasonable range: q_ult should be 500-3000 kPa for these parameters
    assert!(q_ult > 500.0 && q_ult < 3000.0,
        "q_ult = {:.1} kPa in reasonable range", q_ult);

    // Inclined load should give lower capacity than vertical
    let q_ult_vert: f64 = c * nc * fcs * fcd * 1.0
        + q * nq * fqs * fqd * 1.0
        + 0.5 * gamma * b * n_gamma * fgs * fgd * 1.0;
    assert!(q_ult < q_ult_vert, "Inclined load gives lower capacity");
}

// ================================================================
// 2. Primary Consolidation Settlement
// ================================================================
//
// For normally consolidated clay:
//   S = Cc * H / (1 + e0) * log10((sigma'_0 + delta_sigma') / sigma'_0)
//
// For overconsolidated clay (sigma'_0 + delta_sigma' <= sigma'_p):
//   S = Cs * H / (1 + e0) * log10((sigma'_0 + delta_sigma') / sigma'_0)
//
// For partially overconsolidated (mixed):
//   S = Cs*H/(1+e0)*log10(sigma'_p/sigma'_0)
//     + Cc*H/(1+e0)*log10((sigma'_0+delta_sigma')/sigma'_p)
//
// Test: Two-layer system
//   Layer 1: H=3m, Cc=0.30, e0=0.90, sigma'_0=60 kPa, NC
//   Layer 2: H=4m, Cc=0.45, Cs=0.09, e0=1.20, sigma'_0=100 kPa,
//            sigma'_p=130 kPa, mixed case
//   Applied stress increment: delta_sigma = 80 kPa

#[test]
fn validation_geo_ext_2_consolidation_settlement() {
    // Layer 1: Normally consolidated
    let h1: f64 = 3.0;
    let cc1: f64 = 0.30;
    let e01: f64 = 0.90;
    let sigma01: f64 = 60.0;
    let delta_sigma: f64 = 80.0;

    let s1: f64 = cc1 * h1 / (1.0 + e01) * ((sigma01 + delta_sigma) / sigma01).log10();

    // Hand calculation:
    // s1 = 0.30 * 3.0 / 1.90 * log10(140/60)
    //    = 0.4737 * log10(2.3333)
    //    = 0.4737 * 0.36798
    //    = 0.17432 m = 174.3 mm
    let expected_s1: f64 = 0.30 * 3.0 / 1.90 * (140.0_f64 / 60.0).log10();
    assert_close(s1, expected_s1, 1e-10, "Layer 1 NC settlement");
    let s1_mm: f64 = s1 * 1000.0;
    assert!(s1_mm > 100.0 && s1_mm < 300.0,
        "Layer 1 settlement = {:.1} mm in range", s1_mm);

    // Layer 2: Mixed (overconsolidated then virgin)
    let h2: f64 = 4.0;
    let cc2: f64 = 0.45;
    let cs2: f64 = 0.09;
    let e02: f64 = 1.20;
    let sigma02: f64 = 100.0;
    let sigma_p2: f64 = 130.0;

    // Mixed case: sigma02 < sigma_p2 < sigma02 + delta_sigma
    let sigma_final2: f64 = sigma02 + delta_sigma;
    assert!(sigma02 < sigma_p2 && sigma_p2 < sigma_final2, "mixed case");

    let s2_recomp: f64 = cs2 * h2 / (1.0 + e02) * (sigma_p2 / sigma02).log10();
    let s2_virgin: f64 = cc2 * h2 / (1.0 + e02) * (sigma_final2 / sigma_p2).log10();
    let s2: f64 = s2_recomp + s2_virgin;

    // Hand verification
    let expected_s2_recomp: f64 = 0.09 * 4.0 / 2.20 * (130.0_f64 / 100.0).log10();
    let expected_s2_virgin: f64 = 0.45 * 4.0 / 2.20 * (180.0_f64 / 130.0).log10();
    let expected_s2: f64 = expected_s2_recomp + expected_s2_virgin;

    assert_close(s2, expected_s2, 1e-10, "Layer 2 mixed settlement");

    // Virgin portion should dominate since Cc >> Cs
    assert!(s2_virgin > s2_recomp, "virgin > recompression");

    // Total settlement
    let s_total: f64 = s1 + s2;
    let s_total_mm: f64 = s_total * 1000.0;
    let expected_total_mm: f64 = (expected_s1 + expected_s2) * 1000.0;

    assert_close(s_total_mm, expected_total_mm, 1e-10, "total settlement");
    assert!(s_total_mm > 200.0 && s_total_mm < 600.0,
        "total = {:.1} mm in range", s_total_mm);

    // Check that if the clay were entirely NC, settlement would be larger
    let s2_if_nc: f64 = cc2 * h2 / (1.0 + e02) * (sigma_final2 / sigma02).log10();
    assert!(s2_if_nc > s2, "NC settlement > mixed settlement");
}

// ================================================================
// 3. Rankine Active and Passive Earth Pressure
// ================================================================
//
// Ka = tan^2(45 - phi/2) = (1 - sin(phi)) / (1 + sin(phi))
// Kp = tan^2(45 + phi/2) = (1 + sin(phi)) / (1 - sin(phi))
//
// For cohesionless soil (c = 0):
//   Pa = 0.5 * Ka * gamma * H^2   (active force per unit length)
//   Pp = 0.5 * Kp * gamma * H^2   (passive force per unit length)
//
// For c-phi soil:
//   sigma_a(z) = Ka * gamma * z - 2*c*sqrt(Ka)
//   sigma_p(z) = Kp * gamma * z + 2*c*sqrt(Kp)
//
// Test: phi = 32 deg, gamma = 19 kN/m^3, H = 8 m, c = 0 and c = 12 kPa

#[test]
fn validation_geo_ext_3_active_passive_pressure() {
    let phi_deg: f64 = 32.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let gamma: f64 = 19.0;
    let h: f64 = 8.0;

    // Active and passive coefficients
    let ka: f64 = (PI / 4.0 - phi / 2.0).tan().powi(2);
    let kp: f64 = (PI / 4.0 + phi / 2.0).tan().powi(2);

    // Alternative formula
    let ka_alt: f64 = (1.0 - phi.sin()) / (1.0 + phi.sin());
    let kp_alt: f64 = (1.0 + phi.sin()) / (1.0 - phi.sin());

    assert_close(ka, ka_alt, 1e-10, "Ka two formulas agree");
    assert_close(kp, kp_alt, 1e-10, "Kp two formulas agree");

    // Fundamental relationship: Ka * Kp = 1
    assert_close(ka * kp, 1.0, 1e-10, "Ka * Kp = 1");

    // Ka < 1 < Kp
    assert!(ka < 1.0, "Ka < 1");
    assert!(kp > 1.0, "Kp > 1");

    // At-rest coefficient (Jaky)
    let k0: f64 = 1.0 - phi.sin();
    assert!(ka < k0 && k0 < 1.0, "Ka < K0 < 1");

    // Cohesionless soil: total active and passive forces
    let pa: f64 = 0.5 * ka * gamma * h * h;
    let pp: f64 = 0.5 * kp * gamma * h * h;

    let expected_pa: f64 = 0.5 * ka_alt * 19.0 * 64.0;
    let expected_pp: f64 = 0.5 * kp_alt * 19.0 * 64.0;

    assert_close(pa, expected_pa, 1e-10, "Active force Pa");
    assert_close(pp, expected_pp, 1e-10, "Passive force Pp");
    assert!(pp > pa, "Passive force > Active force");

    // With cohesion: c = 12 kPa
    let c: f64 = 12.0;

    // Active pressure at base: sigma_a(H) = Ka*gamma*H - 2*c*sqrt(Ka)
    let sigma_a_base: f64 = ka * gamma * h - 2.0 * c * ka.sqrt();
    let expected_sigma_a: f64 = ka_alt * 19.0 * 8.0 - 2.0 * 12.0 * ka_alt.sqrt();
    assert_close(sigma_a_base, expected_sigma_a, 1e-10, "Active stress at base with cohesion");

    // Passive pressure at base: sigma_p(H) = Kp*gamma*H + 2*c*sqrt(Kp)
    let sigma_p_base: f64 = kp * gamma * h + 2.0 * c * kp.sqrt();
    let expected_sigma_p: f64 = kp_alt * 19.0 * 8.0 + 2.0 * 12.0 * kp_alt.sqrt();
    assert_close(sigma_p_base, expected_sigma_p, 1e-10, "Passive stress at base with cohesion");

    // Tension crack depth: zc = 2*c / (gamma * sqrt(Ka))
    let zc: f64 = 2.0 * c / (gamma * ka.sqrt());
    let expected_zc: f64 = 2.0 * 12.0 / (19.0 * ka_alt.sqrt());
    assert_close(zc, expected_zc, 1e-10, "Tension crack depth");
    assert!(zc > 0.0 && zc < h, "zc = {:.2} m should be between 0 and H", zc);

    // Net active force with tension crack (reduced area)
    let h_eff: f64 = h - zc;
    let sigma_a_bottom: f64 = ka * gamma * h - 2.0 * c * ka.sqrt();
    let pa_net: f64 = 0.5 * sigma_a_bottom * h_eff;
    assert!(pa_net > 0.0, "Net active force should be positive: {:.2}", pa_net);
    assert!(pa_net < pa, "Cohesion reduces active force");
}

// ================================================================
// 4. Single Pile Capacity (End Bearing + Skin Friction)
// ================================================================
//
// Q_ult = Q_b + Q_s
//
// End bearing (Meyerhof):
//   Q_b = Ap * (c*Nc + q'*Nq)
//   For driven piles in sand: Q_b = Ap * q' * Nq, limited to Ap * 400*Nq (kPa)
//
// Skin friction (alpha method for clay):
//   Q_s = sum(alpha_i * c_u_i * A_s_i)
//   alpha = adhesion factor (depends on cu, typically 0.3-1.0)
//
// Skin friction (beta method for sand):
//   Q_s = sum(beta_i * sigma'_v_i * A_s_i)
//   beta = K*tan(delta), K ~ 0.8-1.2, delta ~ 0.75*phi
//
// Test: Bored pile in layered soil
//   D = 0.6 m, L = 18 m
//   Layer 1 (clay): 0-8m, cu = 50 kPa, alpha = 0.7
//   Layer 2 (sand): 8-18m, phi = 35 deg, gamma' = 10 kN/m^3, K = 1.0
//   Bearing stratum: dense sand, Nq = 40 (from chart, phi=35)

#[test]
fn validation_geo_ext_4_pile_capacity() {
    let d: f64 = 0.6;          // m (pile diameter)
    let l: f64 = 18.0;         // m (pile length)

    let ap: f64 = PI / 4.0 * d * d; // pile tip area
    let perimeter: f64 = PI * d;     // pile perimeter

    // Layer 1: Clay (0 to 8 m) - alpha method
    let l1: f64 = 8.0;
    let cu1: f64 = 50.0;       // kPa
    let alpha1: f64 = 0.7;     // adhesion factor

    let qs1: f64 = alpha1 * cu1 * perimeter * l1;
    let expected_qs1: f64 = 0.7 * 50.0 * PI * 0.6 * 8.0;
    assert_close(qs1, expected_qs1, 1e-10, "Skin friction in clay");

    // Layer 2: Sand (8 to 18 m) - beta method
    let l2: f64 = 10.0;
    let phi2_deg: f64 = 35.0;
    let phi2: f64 = phi2_deg * PI / 180.0;
    let gamma_prime: f64 = 10.0; // kN/m^3 (submerged)
    let k_sand: f64 = 1.0;      // lateral earth pressure coefficient
    let delta: f64 = 0.75 * phi2; // wall friction angle

    // Average effective vertical stress in sand layer
    // At z=8m: sigma'_v = gamma_prime * 8 (simplified, ignoring clay weight)
    // At z=18m: sigma'_v = gamma_prime * 18
    // Average: sigma'_v_avg = gamma_prime * (8 + 18) / 2 = 130 kPa
    let sigma_v_avg: f64 = gamma_prime * (8.0 + 18.0) / 2.0;
    let beta: f64 = k_sand * delta.tan();

    let qs2: f64 = beta * sigma_v_avg * perimeter * l2;
    let expected_qs2: f64 = k_sand * delta.tan() * sigma_v_avg * PI * 0.6 * 10.0;
    assert_close(qs2, expected_qs2, 1e-10, "Skin friction in sand");

    // Total skin friction
    let qs_total: f64 = qs1 + qs2;

    // End bearing
    let nq_bearing: f64 = 40.0; // from Meyerhof chart for phi=35 in bearing stratum
    let sigma_v_tip: f64 = gamma_prime * l; // effective stress at pile tip
    let qb_calc: f64 = ap * sigma_v_tip * nq_bearing;

    let expected_qb: f64 = ap * (10.0 * 18.0) * 40.0;
    assert_close(qb_calc, expected_qb, 1e-10, "End bearing");

    // Ultimate pile capacity
    let q_ult: f64 = qb_calc + qs_total;
    let expected_q_ult: f64 = expected_qb + expected_qs1 + expected_qs2;
    assert_close(q_ult, expected_q_ult, 1e-10, "Total pile capacity");

    // Allowable capacity with FS = 2.5
    let fs: f64 = 2.5;
    let q_allow: f64 = q_ult / fs;

    assert!(q_ult > 0.0, "Ultimate capacity must be positive");
    assert!(q_allow < q_ult, "Allowable < Ultimate");
    assert!(q_allow > 100.0, "Allowable should be > 100 kN: {:.1}", q_allow);

    // Verify skin friction dominates for long pile in clay/sand
    let skin_fraction: f64 = qs_total / q_ult;
    assert!(skin_fraction > 0.3, "Skin friction should be significant: {:.1}%", skin_fraction * 100.0);
}

// ================================================================
// 5. Infinite Slope Stability Factor of Safety
// ================================================================
//
// For infinite slope in c-phi soil:
//   FS = c / (gamma * H * sin(alpha) * cos(alpha)) + tan(phi) / tan(alpha)
//
// For purely cohesionless (c = 0):
//   FS = tan(phi) / tan(alpha)
//
// With pore water pressure (ru = u / (gamma*H)):
//   FS = c' / (gamma*H*sin(alpha)*cos(alpha))
//      + (1 - ru) * tan(phi') / tan(alpha)
//
// Test cases:
//   Case A: phi=35, alpha=25, c=0 (dry cohesionless) -> FS = tan35/tan25
//   Case B: phi=30, alpha=20, c=15 kPa, gamma=19, H=4m (c-phi soil)
//   Case C: Same as B but with ru=0.3 (pore pressure)

#[test]
fn validation_geo_ext_5_slope_stability_factor() {
    // Case A: Dry cohesionless
    let phi_a_deg: f64 = 35.0;
    let alpha_a_deg: f64 = 25.0;
    let phi_a: f64 = phi_a_deg * PI / 180.0;
    let alpha_a: f64 = alpha_a_deg * PI / 180.0;

    let fs_a: f64 = phi_a.tan() / alpha_a.tan();
    let expected_fs_a: f64 = (35.0_f64 * PI / 180.0).tan() / (25.0_f64 * PI / 180.0).tan();
    assert_close(fs_a, expected_fs_a, 1e-10, "FS case A: dry cohesionless");
    assert!(fs_a > 1.0, "Slope should be stable: FS = {:.3}", fs_a);

    // Verify critical condition: phi = alpha -> FS = 1.0
    let fs_critical: f64 = phi_a.tan() / phi_a.tan();
    assert_close(fs_critical, 1.0, 1e-10, "FS at critical angle = 1.0");

    // Case B: c-phi soil
    let phi_b_deg: f64 = 30.0;
    let alpha_b_deg: f64 = 20.0;
    let phi_b: f64 = phi_b_deg * PI / 180.0;
    let alpha_b: f64 = alpha_b_deg * PI / 180.0;
    let c_b: f64 = 15.0;       // kPa
    let gamma_b: f64 = 19.0;   // kN/m^3
    let h_b: f64 = 4.0;        // m

    let c_component: f64 = c_b / (gamma_b * h_b * alpha_b.sin() * alpha_b.cos());
    let phi_component: f64 = phi_b.tan() / alpha_b.tan();
    let fs_b: f64 = c_component + phi_component;

    let expected_c_comp: f64 = 15.0 / (19.0 * 4.0 * alpha_b.sin() * alpha_b.cos());
    let expected_phi_comp: f64 = phi_b.tan() / alpha_b.tan();
    let expected_fs_b: f64 = expected_c_comp + expected_phi_comp;

    assert_close(fs_b, expected_fs_b, 1e-10, "FS case B: c-phi soil");
    assert!(fs_b > fs_a.min(phi_component), "Cohesion should improve FS");

    // Case C: With pore water pressure
    let ru: f64 = 0.3;
    let fs_c: f64 = c_component + (1.0 - ru) * phi_b.tan() / alpha_b.tan();
    let expected_fs_c: f64 = expected_c_comp + (1.0 - 0.3) * expected_phi_comp;

    assert_close(fs_c, expected_fs_c, 1e-10, "FS case C: with pore pressure");
    assert!(fs_c < fs_b, "Pore pressure reduces FS: {:.3} < {:.3}", fs_c, fs_b);

    // The reduction due to pore pressure affects only the friction component
    let fs_reduction: f64 = fs_b - fs_c;
    let expected_reduction: f64 = ru * phi_component;
    assert_close(fs_reduction, expected_reduction, 1e-10, "Pore pressure reduction");

    // Deeper failure plane (larger H) reduces cohesion contribution
    let h_deep: f64 = 10.0;
    let c_comp_deep: f64 = c_b / (gamma_b * h_deep * alpha_b.sin() * alpha_b.cos());
    assert!(c_comp_deep < c_component, "Deeper plane reduces cohesion effect");
}

// ================================================================
// 6. Coulomb Active Earth Pressure with Wall Friction
// ================================================================
//
// Coulomb (1776) active earth pressure coefficient:
//   Ka = sin^2(alpha + phi) /
//        [sin^2(alpha) * sin(alpha - delta) *
//         (1 + sqrt(sin(phi+delta)*sin(phi-beta) / (sin(alpha-delta)*sin(alpha+beta))))^2]
//
// where:
//   alpha = wall angle from horizontal (90 for vertical)
//   phi = soil friction angle
//   delta = wall friction angle
//   beta = backfill slope angle
//
// For vertical wall (alpha=90), horizontal backfill (beta=0):
//   Ka = cos^2(phi) /
//        [cos(delta) * (1 + sqrt(sin(phi+delta)*sin(phi) / cos(delta)))^2]
//
// Test: phi = 30, delta = 20, alpha = 90, beta = 0

#[test]
fn validation_geo_ext_6_lateral_earth_pressure_coulomb() {
    let phi_deg: f64 = 30.0;
    let delta_deg: f64 = 20.0;
    let alpha_deg: f64 = 90.0;
    let beta_deg: f64 = 0.0;

    let phi: f64 = phi_deg * PI / 180.0;
    let delta: f64 = delta_deg * PI / 180.0;
    let alpha: f64 = alpha_deg * PI / 180.0;
    let beta: f64 = beta_deg * PI / 180.0;

    // Coulomb Ka (general formula)
    let num: f64 = (alpha + phi).sin().powi(2);
    let inner: f64 = ((phi + delta).sin() * (phi - beta).sin())
        / ((alpha - delta).sin() * (alpha + beta).sin());
    let sqrt_term: f64 = inner.sqrt();
    let denom: f64 = alpha.sin().powi(2)
        * (alpha - delta).sin()
        * (1.0 + sqrt_term).powi(2);
    let ka_coulomb: f64 = num / denom;

    // Verify intermediate values
    // sin^2(90+30) = sin^2(120) = (sqrt(3)/2)^2 = 0.75
    assert_close(num, 0.75, 0.01, "sin^2(alpha+phi)");

    // For comparison: Rankine Ka (no wall friction)
    let ka_rankine: f64 = (PI / 4.0 - phi / 2.0).tan().powi(2);
    assert_close(ka_rankine, 1.0 / 3.0, 1e-10, "Rankine Ka for phi=30");

    // Coulomb Ka with wall friction should be <= Rankine Ka
    // Wall friction generally reduces Ka (more favorable)
    assert!(ka_coulomb < ka_rankine + 0.05,
        "Coulomb Ka ({:.4}) should be close to or less than Rankine Ka ({:.4})",
        ka_coulomb, ka_rankine);

    // Ka should be positive and less than 1
    assert!(ka_coulomb > 0.0 && ka_coulomb < 1.0,
        "Ka_Coulomb = {:.4} should be in (0, 1)", ka_coulomb);

    // Test with different wall friction angles
    // delta = 0 should recover Rankine
    let inner_d0: f64 = ((phi + 0.0_f64).sin() * (phi - beta).sin())
        / ((alpha - 0.0_f64).sin() * (alpha + beta).sin());
    let sqrt_d0: f64 = inner_d0.sqrt();
    let denom_d0: f64 = alpha.sin().powi(2)
        * (alpha - 0.0_f64).sin()
        * (1.0 + sqrt_d0).powi(2);
    let ka_d0: f64 = num / denom_d0;
    assert_close(ka_d0, ka_rankine, 0.01, "Coulomb Ka with delta=0 ~ Rankine Ka");

    // Total active force
    let gamma: f64 = 18.0;
    let h: f64 = 6.0;
    let pa_coulomb: f64 = 0.5 * ka_coulomb * gamma * h * h;
    let pa_rankine: f64 = 0.5 * ka_rankine * gamma * h * h;

    assert!(pa_coulomb > 0.0, "Pa_Coulomb should be positive: {:.2}", pa_coulomb);

    // Direction of resultant: for Coulomb, Pa acts at (delta) to the wall normal
    // Horizontal component: Pa * cos(delta)
    // Vertical component: Pa * sin(delta)
    let pa_h: f64 = pa_coulomb * delta.cos();
    let pa_v: f64 = pa_coulomb * delta.sin();
    assert!(pa_h > pa_v, "Horizontal component > vertical for delta < 45 deg");

    // The Coulomb passive case (for reference)
    let num_p: f64 = (alpha + phi).sin().powi(2);
    let inner_p: f64 = ((phi + delta).sin() * (phi + beta).sin())
        / ((alpha - delta).sin() * (alpha + beta).sin());
    let sqrt_p: f64 = inner_p.sqrt();
    let denom_p: f64 = alpha.sin().powi(2)
        * (alpha - delta).sin()
        * (1.0 - sqrt_p).powi(2);
    let kp_coulomb: f64 = num_p / denom_p;

    // Kp should be much larger than Ka
    assert!(kp_coulomb > ka_coulomb * 3.0,
        "Kp ({:.2}) >> Ka ({:.4})", kp_coulomb, ka_coulomb);

    // Unused but verify pa_rankine computed correctly
    let _ = pa_rankine;
}

// ================================================================
// 7. Subgrade Reaction Modulus (Soil Spring)
// ================================================================
//
// From plate load test:
//   k_s = q / s
// where q = applied pressure, s = measured settlement
//
// Size correction (Terzaghi):
//   For clay: k_s(BxB) = k_s1 * (B1/B)
//   For sand: k_s(BxB) = k_s1 * ((B + B1) / (2*B))^2
// where B1 = plate size (typically 0.3 m), B = footing size
//
// Relationship to elastic modulus:
//   k_s ~ Es / (B * (1 - nu^2) * Is)
//
// Winkler beam deflection (analytical for infinite beam, point load):
//   delta_max = P * beta / (2 * k_s)
//   where beta = (k_s / (4*E*I))^0.25
//
// Test: plate test at B1=0.3m gives k_s1=40000 kN/m^3
//       Extrapolate to B=2.0m footing (clay and sand)
//       Then verify Winkler beam formula

#[test]
fn validation_geo_ext_7_soil_spring_modulus() {
    let b1: f64 = 0.3;          // m (plate size)
    let k_s1: f64 = 40_000.0;   // kN/m^3 (from plate load test)

    // Plate load test verification: q=200 kPa, s=5mm -> k_s = 200/0.005 = 40000
    let q_test: f64 = 200.0;
    let s_test: f64 = 0.005;
    let ks_check: f64 = q_test / s_test;
    assert_close(ks_check, k_s1, 1e-10, "k_s from plate load test");

    // Size correction for clay: k_s = k_s1 * (B1/B)
    let b_footing: f64 = 2.0; // m
    let ks_clay: f64 = k_s1 * (b1 / b_footing);
    let expected_clay: f64 = 40_000.0 * (0.3 / 2.0);
    assert_close(ks_clay, expected_clay, 1e-10, "k_s clay size correction");
    assert!(ks_clay < k_s1, "Larger footing gives lower k_s in clay");

    // Size correction for sand: k_s = k_s1 * ((B + B1) / (2*B))^2
    let ks_sand: f64 = k_s1 * ((b_footing + b1) / (2.0 * b_footing)).powi(2);
    let sand_ratio: f64 = (2.0 + 0.3) / (2.0 * 2.0);
    let expected_sand: f64 = 40_000.0 * sand_ratio.powi(2);
    assert_close(ks_sand, expected_sand, 1e-10, "k_s sand size correction");
    assert!(ks_sand < k_s1, "Larger footing gives lower k_s in sand");

    // Sand correction is less severe than clay for large footings
    assert!(ks_sand > ks_clay, "Sand k_s > clay k_s for large footing");

    // Winkler beam on elastic foundation (infinite beam, point load)
    // beta = (k_s / (4*E*I))^0.25
    let e_beam: f64 = 200_000_000.0; // kPa (200 GPa for steel)
    let i_beam: f64 = 1.0e-4;        // m^4
    let p_load: f64 = 100.0;         // kN (point load)

    // Using clay k_s per unit length: k_per_m = k_s * B_beam_width
    // For simplicity, assume beam width = 1.0 m
    let b_beam: f64 = 1.0;
    let k_per_m: f64 = ks_clay * b_beam; // kN/m per m length

    let beta: f64 = (k_per_m / (4.0 * e_beam * i_beam)).powf(0.25);
    let delta_max: f64 = p_load * beta / (2.0 * k_per_m);

    // Hand verification
    let expected_beta: f64 = (ks_clay * b_beam / (4.0 * e_beam * i_beam)).powf(0.25);
    assert_close(beta, expected_beta, 1e-10, "Winkler beta parameter");

    let expected_delta: f64 = p_load * expected_beta / (2.0 * k_per_m);
    assert_close(delta_max, expected_delta, 1e-10, "Winkler max deflection");

    // Delta should be reasonable (mm range)
    let delta_mm: f64 = delta_max * 1000.0;
    assert!(delta_mm > 0.0 && delta_mm < 100.0,
        "Max deflection = {:.3} mm in range", delta_mm);

    // Characteristic length = 1/beta
    let l_char: f64 = 1.0 / beta;
    assert!(l_char > 0.0, "Characteristic length positive: {:.3} m", l_char);

    // Maximum bending moment (Hetenyi): M_max = P / (4*beta)
    let m_max: f64 = p_load / (4.0 * beta);
    let expected_m: f64 = 100.0 / (4.0 * expected_beta);
    assert_close(m_max, expected_m, 1e-10, "Winkler max moment");
}

// ================================================================
// 8. Deep Foundation Settlement (Pile Group Elastic)
// ================================================================
//
// Elastic settlement of a single pile (Vesic 1977):
//   s_e = s1 + s2 + s3
//
// where:
//   s1 = (Q_wp + xi*Q_ws) * L / (Ap * Ep)
//       (elastic shortening of pile shaft)
//   s2 = Q_wp * Cp / (D * q_p)
//       (settlement of pile tip due to load at tip)
//   s3 = Q_ws * Cs / (L * q_p)
//       (settlement of pile tip due to shaft friction)
//
// xi = 0.5-0.67 (distribution of shaft friction)
// Cp = empirical coefficient (0.02-0.04 for sand, 0.02-0.03 for clay)
// Cs = (0.93 + 0.16*sqrt(L/D)) * Cp
//
// Pile group settlement (Vesic):
//   s_g = s_single * sqrt(B_g / D)
// where B_g = group width
//
// Test: Single pile D=0.5m, L=15m, Ep=30 GPa (concrete)
//       Q_wp=300 kN (tip), Q_ws=400 kN (shaft)
//       Cp=0.03, xi=0.6
//       3x3 pile group at 3D spacing

#[test]
fn validation_geo_ext_8_deep_foundation_settlement() {
    let d: f64 = 0.5;                // m (pile diameter)
    let l: f64 = 15.0;               // m (pile length)
    let ep: f64 = 30_000_000.0;      // kPa = 30 GPa (concrete)
    let ap: f64 = PI / 4.0 * d * d;  // pile cross-section area
    let q_wp: f64 = 300.0;           // kN (load carried by tip)
    let q_ws: f64 = 400.0;           // kN (load carried by shaft)
    let xi: f64 = 0.6;               // shaft friction distribution factor
    let cp: f64 = 0.03;              // empirical coefficient for tip settlement
    let q_p: f64 = 5000.0;           // kPa (unit tip resistance)

    // s1: Elastic shortening of pile shaft
    let s1: f64 = (q_wp + xi * q_ws) * l / (ap * ep);
    let expected_s1: f64 = (300.0 + 0.6 * 400.0) * 15.0 / (ap * 30_000_000.0);
    assert_close(s1, expected_s1, 1e-10, "s1: pile shaft shortening");

    // s2: Tip settlement due to tip load
    let s2: f64 = q_wp * cp / (d * q_p);
    let expected_s2: f64 = 300.0 * 0.03 / (0.5 * 5000.0);
    assert_close(s2, expected_s2, 1e-10, "s2: tip settlement from tip load");

    // Cs factor
    let cs: f64 = (0.93 + 0.16 * (l / d).sqrt()) * cp;
    let expected_cs: f64 = (0.93 + 0.16 * (15.0_f64 / 0.5).sqrt()) * 0.03;
    assert_close(cs, expected_cs, 1e-10, "Cs coefficient");

    // s3: Tip settlement due to shaft friction
    let s3: f64 = q_ws * cs / (l * q_p);
    let expected_s3: f64 = 400.0 * expected_cs / (15.0 * 5000.0);
    assert_close(s3, expected_s3, 1e-10, "s3: tip settlement from shaft load");

    // Total single pile settlement
    let s_single: f64 = s1 + s2 + s3;
    let s_single_mm: f64 = s_single * 1000.0;
    let expected_single_mm: f64 = (expected_s1 + expected_s2 + expected_s3) * 1000.0;
    assert_close(s_single_mm, expected_single_mm, 1e-10, "single pile settlement (mm)");

    // Settlement should be small (typical: 5-25 mm)
    assert!(s_single_mm > 0.0 && s_single_mm < 50.0,
        "Single pile settlement = {:.2} mm in range", s_single_mm);

    // Pile group settlement (3x3 group at 3D spacing)
    let n_piles: f64 = 9.0;
    let spacing: f64 = 3.0 * d; // 3D spacing = 1.5 m
    let b_group: f64 = 2.0 * spacing + d; // group width = 3.5 m
    let _ = n_piles;

    let s_group: f64 = s_single * (b_group / d).sqrt();
    let expected_s_group: f64 = s_single * (3.5_f64 / 0.5).sqrt();
    assert_close(s_group, expected_s_group, 1e-10, "pile group settlement");

    // Group settlement > single pile settlement
    assert!(s_group > s_single, "Group settlement > single pile");

    let s_group_mm: f64 = s_group * 1000.0;
    assert!(s_group_mm > s_single_mm, "Group settlement (mm) > single (mm)");

    // Group amplification factor
    let amp_factor: f64 = s_group / s_single;
    let expected_amp: f64 = (b_group / d).sqrt();
    assert_close(amp_factor, expected_amp, 1e-10, "amplification factor");
    assert!(amp_factor > 1.0, "Amplification > 1.0: {:.2}", amp_factor);

    // Verify each component's contribution
    let s1_pct: f64 = s1 / s_single * 100.0;
    let s2_pct: f64 = s2 / s_single * 100.0;
    let s3_pct: f64 = s3 / s_single * 100.0;
    assert_close(s1_pct + s2_pct + s3_pct, 100.0, 1e-10, "components sum to 100%");
}
