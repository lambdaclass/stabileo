/// Validation: Geotechnical Bearing Capacity — Pure-Math Formulas
///
/// References:
///   - Terzaghi (1943): "Theoretical Soil Mechanics"
///   - Meyerhof (1963): "Some Recent Research on the Bearing Capacity of Foundations",
///     Canadian Geotechnical Journal, 1(1), pp. 16-26
///   - Hansen (1970): "A Revised and Extended Formula for Bearing Capacity",
///     Danish Geotechnical Institute, Bulletin No. 28
///   - Vesic (1973): "Analysis of Ultimate Loads of Shallow Foundations",
///     ASCE J. Soil Mech. Found. Div., 99(SM1), pp. 45-73
///   - Das: "Principles of Foundation Engineering" 9th ed.
///   - Bowles: "Foundation Analysis and Design" 5th ed.
///
/// Tests verify bearing capacity factors, correction factors, and settlement
/// formulas with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

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
// 1. Meyerhof Bearing Capacity Factors (Nq, Nc, Ngamma)
// ================================================================
//
// Meyerhof (1963) / Reissner (1924) bearing capacity factors:
//   Nq = exp(pi*tan(phi)) * tan^2(45 + phi/2)
//   Nc = (Nq - 1) * cot(phi)
//   Ngamma = 2*(Nq + 1)*tan(phi)  (Meyerhof approximation)
//
// For phi = 25 deg:
//   tan(25) = 0.4663
//   Nq = exp(pi*0.4663) * tan^2(57.5) = e^1.4649 * (1.5697)^2
//      = 4.3271 * 2.4640 = 10.662
//   Nc = (10.662-1)/0.4663 = 9.662/0.4663 = 20.72
//   Ngamma = 2*(10.662+1)*0.4663 = 2*11.662*0.4663 = 10.878

#[test]
fn validation_meyerhof_bearing_capacity_factors() {
    let test_phis_deg: [f64; 5] = [0.0, 10.0, 20.0, 30.0, 40.0];

    for &phi_deg in &test_phis_deg {
        let phi = phi_deg * PI / 180.0;

        // Nq
        let nq = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);

        if phi_deg.abs() < 1e-10 {
            // Special case: phi = 0
            // Nq(0) = exp(0) * tan^2(45) = 1 * 1 = 1
            assert_close(nq, 1.0, 1e-10, "Nq at phi=0");
            // Nc(0) = (Nq-1)*cot(phi) -> use L'Hopital: Nc = pi + 2 = 5.14
            let nc_zero = PI + 2.0;
            assert_close(nc_zero, 5.14159265, 1e-6, "Nc at phi=0 (exact: pi+2)");
        } else {
            // Nc = (Nq - 1) * cot(phi)
            let nc = (nq - 1.0) / phi.tan();

            // Ngamma (Meyerhof)
            let ngamma = 2.0 * (nq + 1.0) * phi.tan();

            // Basic sanity checks
            assert!(nq >= 1.0, "Nq must be >= 1 for phi={:.0}", phi_deg);
            assert!(nc > 0.0, "Nc must be > 0 for phi={:.0}", phi_deg);
            assert!(ngamma >= 0.0, "Ngamma must be >= 0 for phi={:.0}", phi_deg);

            // Nq should increase with phi
            if phi_deg > 10.0 {
                let phi_prev = (phi_deg - 10.0) * PI / 180.0;
                let nq_prev = (PI * phi_prev.tan()).exp()
                    * (PI / 4.0 + phi_prev / 2.0).tan().powi(2);
                assert!(nq > nq_prev, "Nq should increase with phi");
            }
        }
    }

    // Specific check for phi = 30 deg (well-known values)
    let phi30 = 30.0 * PI / 180.0;
    let nq30 = (PI * phi30.tan()).exp() * (PI / 4.0 + phi30 / 2.0).tan().powi(2);
    let nc30 = (nq30 - 1.0) / phi30.tan();
    let ngamma30 = 2.0 * (nq30 + 1.0) * phi30.tan();

    // Published values: Nq ~ 18.40, Nc ~ 30.14, Ngamma ~ 22.40
    assert_close(nq30, 18.401, 0.001, "Nq at phi=30");
    assert_close(nc30, 30.14, 0.01, "Nc at phi=30");
    assert_close(ngamma30, 22.40, 0.01, "Ngamma (Meyerhof) at phi=30");
}

// ================================================================
// 2. Hansen Shape, Depth, and Inclination Factors
// ================================================================
//
// Hansen (1970) correction factors for rectangular footings:
//
// Shape factors (B/L < 1):
//   sc = 1 + (Nq/Nc)*(B/L)
//   sq = 1 + (B/L)*tan(phi)
//   sgamma = 1 - 0.4*(B/L)
//
// Depth factors:
//   For Df/B <= 1:
//     dc = 1 + 0.4*(Df/B)
//     dq = 1 + 2*tan(phi)*(1-sin(phi))^2*(Df/B)
//     dgamma = 1.0
//   For Df/B > 1:
//     dc = 1 + 0.4*arctan(Df/B)
//     dq = 1 + 2*tan(phi)*(1-sin(phi))^2*arctan(Df/B)
//
// Inclination factors (H = horizontal load):
//   ic = iq - (1-iq)/(Nc*tan(phi))
//   iq = (1 - 0.5*H/(V + A*c*cot(phi)))^5  (Hansen/Vesic)
//   igamma = (1 - 0.7*H/(V + A*c*cot(phi)))^5
//
// Test: B = 2m, L = 3m, Df = 1.5m, phi = 25 deg

#[test]
fn validation_hansen_correction_factors() {
    let phi_deg: f64 = 25.0;
    let phi = phi_deg * PI / 180.0;
    let b: f64 = 2.0; // m, footing width
    let l: f64 = 3.0; // m, footing length
    let df: f64 = 1.5; // m, foundation depth

    // Bearing capacity factors
    let nq = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc = (nq - 1.0) / phi.tan();

    // Shape factors
    let sc = 1.0 + (nq / nc) * (b / l);
    let sq = 1.0 + (b / l) * phi.tan();
    let sgamma = 1.0 - 0.4 * (b / l);

    // Verify
    assert!(sc > 1.0, "sc should be > 1 for rectangular footing");
    assert!(sq > 1.0, "sq should be > 1");
    assert!(sgamma > 0.0 && sgamma < 1.0, "sgamma should be between 0 and 1");

    let expected_sc = 1.0 + (nq / nc) * (2.0 / 3.0);
    assert_close(sc, expected_sc, 1e-10, "shape factor sc");

    let expected_sgamma = 1.0 - 0.4 * (2.0 / 3.0);
    assert_close(sgamma, expected_sgamma, 1e-10, "shape factor sgamma");

    // Depth factors (Df/B = 0.75 <= 1)
    let df_over_b = df / b; // 0.75
    assert!(df_over_b <= 1.0, "using shallow depth factors");

    let dc = 1.0 + 0.4 * df_over_b;
    let dq = 1.0 + 2.0 * phi.tan() * (1.0 - phi.sin()).powi(2) * df_over_b;
    let dgamma: f64 = 1.0;

    let expected_dc = 1.0 + 0.4 * 0.75;
    assert_close(dc, expected_dc, 1e-10, "depth factor dc");
    assert!(dq > 1.0, "dq should be > 1");
    assert_close(dgamma, 1.0, 1e-10, "depth factor dgamma");

    // Inclination factors for vertical load (H=0): all should be 1.0
    let ic_vert: f64 = 1.0;
    let iq_vert: f64 = 1.0;
    let igamma_vert: f64 = 1.0;
    assert_close(ic_vert, 1.0, 1e-10, "inclination ic for vertical load");
    assert_close(iq_vert, 1.0, 1e-10, "inclination iq for vertical load");
    assert_close(igamma_vert, 1.0, 1e-10, "inclination igamma for vertical load");
}

// ================================================================
// 3. Vesic Bearing Capacity — General Equation
// ================================================================
//
// Vesic (1973) general bearing capacity equation:
//   qu = c*Nc*sc*dc*ic*bc*gc
//      + q*Nq*sq*dq*iq*bq*gq
//      + 0.5*gamma*B*Ngamma*sgamma*dgamma*igamma*bgamma*ggamma
//
// where b-factors are base tilt and g-factors are ground slope.
//
// Vesic Ngamma differs from Meyerhof:
//   Ngamma_Vesic = 2*(Nq+1)*tan(phi)  (same formula, different name attribution)
//
// Test: Strip footing (no shape/depth), flat ground, vertical load
//   c = 20 kPa, phi = 20 deg, gamma = 17 kN/m^3, B = 2.5 m, Df = 1.0 m
//   q = gamma*Df = 17 kPa

#[test]
fn validation_vesic_general_bearing_capacity() {
    let c: f64 = 20.0; // kPa
    let phi_deg: f64 = 20.0;
    let phi = phi_deg * PI / 180.0;
    let gamma: f64 = 17.0; // kN/m^3
    let b: f64 = 2.5; // m
    let df: f64 = 1.0; // m
    let q = gamma * df; // overburden pressure, kPa

    // Bearing capacity factors
    let nq = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc = (nq - 1.0) / phi.tan();
    let ngamma = 2.0 * (nq + 1.0) * phi.tan();

    // Strip footing, flat ground, vertical load: all correction factors = 1.0
    let qu = c * nc + q * nq + 0.5 * gamma * b * ngamma;

    // Verify each term separately
    let term_c = c * nc;
    let term_q = q * nq;
    let term_gamma = 0.5 * gamma * b * ngamma;

    // All terms should be positive
    assert!(term_c > 0.0, "cohesion term must be positive");
    assert!(term_q > 0.0, "overburden term must be positive");
    assert!(term_gamma > 0.0, "self-weight term must be positive");

    // Total should be sum
    assert_close(qu, term_c + term_q + term_gamma, 1e-10, "qu = sum of three terms");

    // Reasonable range check: qu should be 200-2000 kPa for these parameters
    assert!(qu > 200.0 && qu < 2000.0,
        "qu = {:.1} kPa should be in reasonable range", qu);

    // Factor of safety
    let q_applied: f64 = 200.0; // kPa (design bearing pressure)
    let fs = qu / q_applied;
    assert!(fs > 1.0, "factor of safety should be > 1.0");
    // Typical FS for bearing capacity: 2.5 to 3.0
}

// ================================================================
// 4. Net Allowable Bearing Capacity with Safety Factors
// ================================================================
//
// q_net_ult = qu - q (net ultimate, subtracting overburden)
// q_all = q_net_ult / FS + q  (allowable bearing capacity)
//
// Or alternatively:
//   q_all = qu / FS (gross allowable, simpler but less accurate)
//
// Test: qu = 850 kPa, q = 27 kPa, FS = 3.0
//   q_net_ult = 850 - 27 = 823 kPa
//   q_all (net) = 823/3 + 27 = 274.3 + 27 = 301.3 kPa
//   q_all (gross) = 850/3 = 283.3 kPa

#[test]
fn validation_net_allowable_bearing_capacity() {
    let qu: f64 = 850.0; // kPa (ultimate bearing capacity)
    let q: f64 = 27.0; // kPa (overburden pressure = gamma * Df)
    let fs: f64 = 3.0; // factor of safety

    // Net ultimate
    let q_net_ult = qu - q;
    assert_close(q_net_ult, 823.0, 1e-10, "net ultimate bearing capacity");

    // Net allowable
    let q_all_net = q_net_ult / fs + q;
    let expected_net = 823.0 / 3.0 + 27.0;
    assert_close(q_all_net, expected_net, 1e-10, "net allowable bearing capacity");

    // Gross allowable
    let q_all_gross = qu / fs;
    assert_close(q_all_gross, 850.0 / 3.0, 1e-10, "gross allowable bearing capacity");

    // Net method gives higher allowable (less conservative for overburden)
    assert!(q_all_net > q_all_gross, "net method gives higher allowable");

    // The difference is q*(1 - 1/FS)
    let diff = q_all_net - q_all_gross;
    let expected_diff = q * (1.0 - 1.0 / fs);
    assert_close(diff, expected_diff, 1e-10, "difference between net and gross");

    // Footing sizing: required area for column load
    let p_column: f64 = 800.0; // kN (column load)
    let area_required = p_column / (q_all_net - q); // net contact pressure
    let b_square = area_required.sqrt(); // square footing side
    assert!(b_square > 0.0, "footing size must be positive");

    // Verify: P/A + q = q_all_net means P/A = q_all_net - q = q_net_ult/FS
    let check_pressure = p_column / area_required;
    assert_close(check_pressure, q_net_ult / fs, 1e-10, "net pressure equals q_net/FS");
}

// ================================================================
// 5. Immediate Settlement — Elastic Theory (Boussinesq)
// ================================================================
//
// Immediate settlement of a flexible footing on elastic half-space:
//   s_i = q * B * (1 - nu^2) / Es * Is * If
//
// where Is = shape factor, If = depth factor
//
// For a rigid footing (more practical):
//   s_i = q * B * (1 - nu^2) / Es * Ir
//
// Steinbrenner (1934) influence factor for center of rectangular footing:
//   Is = F1 + (1-2*nu)/(1-nu) * F2
//   (where F1, F2 depend on m = L/B and n = H/B)
//
// Simplified for square footing on deep deposit (H/B large):
//   Is ≈ 0.56 (for L/B = 1, center, flexible)
//   Ir ≈ 0.82 (rigid, average)
//
// Test: q = 150 kPa, B = 3 m, nu = 0.3, Es = 25 MPa = 25000 kPa

#[test]
fn validation_immediate_settlement_elastic() {
    let q: f64 = 150.0; // kPa
    let b: f64 = 3.0; // m
    let nu: f64 = 0.3;
    let es: f64 = 25_000.0; // kPa

    // Flexible footing at center, square (Is = 1.12 for L/B=1 from Bowles Table)
    let is_center: f64 = 1.12; // influence factor (center of flexible square footing)
    let s_flex = q * b * (1.0 - nu * nu) / es * is_center;

    // Hand calculation
    let expected_flex = 150.0 * 3.0 * (1.0 - 0.09) / 25_000.0 * 1.12;
    assert_close(s_flex, expected_flex, 1e-10, "flexible settlement at center");

    // Rigid footing average settlement
    // For rigid square: Ir = 0.82 (average displacement)
    let ir_rigid: f64 = 0.82;
    let s_rigid = q * b * (1.0 - nu * nu) / es * ir_rigid;

    assert!(s_rigid < s_flex, "rigid settlement < flexible center settlement");

    // Settlement should be in mm range (convert from m)
    let s_flex_mm = s_flex * 1000.0;
    let s_rigid_mm = s_rigid * 1000.0;
    assert!(s_flex_mm > 0.0 && s_flex_mm < 100.0,
        "flexible settlement = {:.2} mm in reasonable range", s_flex_mm);
    assert!(s_rigid_mm > 0.0 && s_rigid_mm < 100.0,
        "rigid settlement = {:.2} mm in reasonable range", s_rigid_mm);

    // Effect of Poisson's ratio: higher nu -> less settlement
    let s_nu0 = q * b * (1.0 - 0.0) / es * is_center;
    let s_nu05 = q * b * (1.0 - 0.25) / es * is_center;
    assert!(s_nu05 < s_nu0, "higher nu should give less settlement");

    // Effect of soil stiffness: double Es -> half settlement
    let s_stiff = q * b * (1.0 - nu * nu) / (2.0 * es) * is_center;
    assert_close(s_stiff, s_flex / 2.0, 1e-10, "doubling Es halves settlement");
}

// ================================================================
// 6. Consolidation Settlement (Terzaghi 1D)
// ================================================================
//
// Primary consolidation settlement:
//   For normally consolidated clay (sigma_0' + delta_sigma > sigma_p'):
//     Sc = Cc * H / (1 + e0) * log10((sigma_0' + delta_sigma) / sigma_0')
//
//   For overconsolidated (sigma_0' + delta_sigma <= sigma_p'):
//     Sc = Cs * H / (1 + e0) * log10((sigma_0' + delta_sigma) / sigma_0')
//
//   For mixed (sigma_0' < sigma_p' < sigma_0' + delta_sigma):
//     Sc = Cs*H/(1+e0)*log10(sigma_p'/sigma_0')
//        + Cc*H/(1+e0)*log10((sigma_0'+delta_sigma)/sigma_p')
//
// Test: H = 4 m, e0 = 0.85, Cc = 0.35, Cs = 0.07
//   sigma_0' = 80 kPa, sigma_p' = 120 kPa, delta_sigma = 100 kPa
//   (mixed case: 80 < 120 < 180)

#[test]
fn validation_consolidation_settlement() {
    let h: f64 = 4.0; // m (layer thickness)
    let e0: f64 = 0.85; // initial void ratio
    let cc: f64 = 0.35; // compression index
    let cs: f64 = 0.07; // recompression index (swelling index)
    let sigma_0: f64 = 80.0; // kPa (initial effective stress at midpoint)
    let sigma_p: f64 = 120.0; // kPa (preconsolidation pressure)
    let delta_sigma: f64 = 100.0; // kPa (stress increment)

    let sigma_final = sigma_0 + delta_sigma; // 180 kPa

    // Mixed case: sigma_0 < sigma_p < sigma_final
    assert!(sigma_0 < sigma_p && sigma_p < sigma_final, "mixed consolidation case");

    // Recompression portion (sigma_0 to sigma_p)
    let sc_recomp = cs * h / (1.0 + e0) * (sigma_p / sigma_0).log10();
    // Virgin compression portion (sigma_p to sigma_final)
    let sc_virgin = cc * h / (1.0 + e0) * (sigma_final / sigma_p).log10();
    // Total
    let sc = sc_recomp + sc_virgin;

    // Hand verification
    let expected_recomp = 0.07 * 4.0 / 1.85 * (120.0 / 80.0_f64).log10();
    let expected_virgin = 0.35 * 4.0 / 1.85 * (180.0 / 120.0_f64).log10();
    let expected_sc = expected_recomp + expected_virgin;

    assert_close(sc_recomp, expected_recomp, 1e-10, "recompression settlement");
    assert_close(sc_virgin, expected_virgin, 1e-10, "virgin compression settlement");
    assert_close(sc, expected_sc, 1e-10, "total consolidation settlement");

    // Virgin portion should dominate since Cc >> Cs
    assert!(sc_virgin > sc_recomp, "virgin compression > recompression");

    // Settlement in mm
    let sc_mm = sc * 1000.0;
    assert!(sc_mm > 0.0 && sc_mm < 500.0,
        "consolidation settlement = {:.1} mm in reasonable range", sc_mm);

    // Normally consolidated case (sigma_p = sigma_0)
    let sc_nc = cc * h / (1.0 + e0) * (sigma_final / sigma_0).log10();
    assert!(sc_nc > sc, "NC settlement should exceed mixed case settlement");
}

// ================================================================
// 7. Degree of Consolidation — Time Factor
// ================================================================
//
// Terzaghi 1D consolidation:
//   Tv = cv * t / Hdr^2
//
// where Tv = time factor, cv = coefficient of consolidation,
//       Hdr = drainage path length
//
// Approximate solutions:
//   For U < 60%: Tv = (pi/4) * U^2
//   For U >= 60%: Tv = -0.9332*log10(1-U) - 0.0851
//
// Inverse:
//   For Tv < 0.2827: U = sqrt(4*Tv/pi)
//   For Tv >= 0.2827: U = 1 - 10^(-(Tv+0.0851)/0.9332)
//
// Test: cv = 3.5 m^2/year, Hdr = 5 m (one-way drainage), t = 2 years
//   Tv = 3.5*2/25 = 0.28

#[test]
fn validation_degree_of_consolidation() {
    let cv: f64 = 3.5; // m^2/year
    let hdr: f64 = 5.0; // m (drainage path)
    let t: f64 = 2.0; // years

    let tv = cv * t / (hdr * hdr);
    assert_close(tv, 0.28, 1e-10, "time factor Tv");

    // Since Tv = 0.28 < 0.2827, use early-time approximation
    let u_approx = (4.0 * tv / PI).sqrt();
    assert_close(u_approx, (4.0 * 0.28 / PI).sqrt(), 1e-10, "U from early-time formula");

    // Check that U is in valid range (0, 1)
    assert!(u_approx > 0.0 && u_approx < 1.0, "U = {:.4} in valid range", u_approx);

    // Inverse check: compute Tv from U and verify consistency
    let tv_check = (PI / 4.0) * u_approx * u_approx;
    assert_close(tv_check, tv, 1e-10, "inverse check: Tv from U");

    // Test late-time formula at Tv = 0.5 (U > 60%)
    let tv_late: f64 = 0.5;
    let u_late = 1.0 - 10.0_f64.powf(-(tv_late + 0.0851) / 0.9332);
    assert!(u_late > 0.6, "U at Tv=0.5 should be > 60%");
    assert!(u_late < 1.0, "U must be < 100%");

    // Verify late-time inverse
    let tv_late_check = -0.9332 * (1.0 - u_late).log10() - 0.0851;
    assert_close(tv_late_check, tv_late, 1e-8, "late-time inverse check");

    // At Tv = infinity (very large), U -> 1.0
    let tv_inf: f64 = 10.0;
    let u_inf = 1.0 - 10.0_f64.powf(-(tv_inf + 0.0851) / 0.9332);
    assert!(u_inf > 0.999, "U at Tv=10 should be > 99.9%");

    // Time to reach 90% consolidation: Tv = 0.848
    let tv_90 = -0.9332 * (1.0 - 0.9_f64).log10() - 0.0851;
    assert_close(tv_90, 0.848, 0.001, "Tv for 90% consolidation");

    // Time to reach 50% consolidation: Tv = pi/4 * 0.5^2 = 0.1963
    let tv_50 = (PI / 4.0) * 0.5 * 0.5;
    assert_close(tv_50, 0.19635, 0.001, "Tv for 50% consolidation");
}

// ================================================================
// 8. Rankine Lateral Earth Pressure Coefficients
// ================================================================
//
// Rankine (1857):
//   Active:  Ka = tan^2(45 - phi/2) = (1 - sin(phi))/(1 + sin(phi))
//   Passive: Kp = tan^2(45 + phi/2) = (1 + sin(phi))/(1 - sin(phi))
//   At-rest (Jaky): K0 = 1 - sin(phi)
//
// Relationships:
//   Ka * Kp = 1
//   Ka < K0 < 1 < Kp
//   K0 ≈ sqrt(Ka) (approximate)
//
// For phi = 30 deg:
//   Ka = tan^2(30) = 1/3 = 0.3333
//   Kp = tan^2(60) = 3.0
//   K0 = 1 - sin(30) = 1 - 0.5 = 0.5
//
// Lateral pressure at depth z:
//   sigma_a = Ka * gamma * z - 2*c*sqrt(Ka)   (active, with cohesion)
//   sigma_p = Kp * gamma * z + 2*c*sqrt(Kp)   (passive, with cohesion)

#[test]
fn validation_rankine_earth_pressure_coefficients() {
    let phi_deg: f64 = 30.0;
    let phi = phi_deg * PI / 180.0;

    // Active coefficient
    let ka_trig = (PI / 4.0 - phi / 2.0).tan().powi(2);
    let ka_sin = (1.0 - phi.sin()) / (1.0 + phi.sin());
    assert_close(ka_trig, ka_sin, 1e-10, "Ka: trig form = sin form");
    assert_close(ka_trig, 1.0 / 3.0, 1e-10, "Ka at phi=30 = 1/3");

    // Passive coefficient
    let kp_trig = (PI / 4.0 + phi / 2.0).tan().powi(2);
    let kp_sin = (1.0 + phi.sin()) / (1.0 - phi.sin());
    assert_close(kp_trig, kp_sin, 1e-10, "Kp: trig form = sin form");
    assert_close(kp_trig, 3.0, 1e-10, "Kp at phi=30 = 3");

    // At-rest (Jaky)
    let k0 = 1.0 - phi.sin();
    assert_close(k0, 0.5, 1e-10, "K0 at phi=30 = 0.5");

    // Relationships
    assert_close(ka_trig * kp_trig, 1.0, 1e-10, "Ka * Kp = 1");
    assert!(ka_trig < k0, "Ka < K0");
    assert!(k0 < 1.0, "K0 < 1");
    assert!(kp_trig > 1.0, "Kp > 1");

    // Lateral pressures at depth z = 5 m
    let gamma: f64 = 18.0; // kN/m^3
    let c: f64 = 10.0; // kPa (cohesion)
    let z: f64 = 5.0; // m

    let sigma_a = ka_trig * gamma * z - 2.0 * c * ka_trig.sqrt();
    let sigma_p = kp_trig * gamma * z + 2.0 * c * kp_trig.sqrt();
    let sigma_0 = k0 * gamma * z;

    // Active < At-rest < Passive
    assert!(sigma_a < sigma_0, "active pressure < at-rest pressure");
    assert!(sigma_0 < sigma_p, "at-rest pressure < passive pressure");

    // Tension crack depth (where sigma_a = 0)
    // 0 = Ka*gamma*zc - 2*c*sqrt(Ka)
    // zc = 2*c/(gamma*sqrt(Ka))
    let zc = 2.0 * c / (gamma * ka_trig.sqrt());
    let expected_zc = 2.0 * 10.0 / (18.0 * (1.0 / 3.0_f64).sqrt());
    assert_close(zc, expected_zc, 1e-10, "tension crack depth");
    assert!(zc > 0.0, "tension crack depth must be positive");
}
