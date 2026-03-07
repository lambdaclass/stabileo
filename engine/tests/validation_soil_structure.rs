/// Validation: Soil-Structure Interaction
///
/// References:
///   - Bowles, "Foundation Analysis and Design", 5th Ed.
///   - Das, "Principles of Foundation Engineering", 8th Ed.
///   - Hetenyi, "Beams on Elastic Foundation"
///   - Terzaghi, "Theoretical Soil Mechanics"
///   - Tomlinson, "Pile Design and Construction Practice", 6th Ed.
///   - Poulos & Davis, "Elastic Solutions for Soil and Rock Mechanics"
///   - ACI 336.2R: "Suggested Analysis and Design Procedures for Combined Footings"
///
/// Tests verify Winkler springs, beam on elastic foundation, earth pressure,
/// bearing capacity, pile capacity, group efficiency, and settlement.

#[allow(unused_imports)]
use dedaliano_engine::types::*;

// ═══════════════════════════════════════════════════════════════
// 1. Winkler Spring Modulus from Subgrade Reaction
// ═══════════════════════════════════════════════════════════════
//
// The Winkler model idealizes soil as a bed of independent springs.
// The spring constant per unit area is the coefficient of subgrade
// reaction ks (kN/m^3).
//
// For a beam of width B on soil with ks:
//   spring constant per unit length: k = ks * B (kN/m per m = kN/m^2)
//
// Terzaghi's approximation for ks (granular soil):
//   ks(B) = ks(1) * [(B + 0.305) / (2*B)]^2
// where ks(1) = subgrade modulus from a 0.305 m (1 ft) plate test.
//
// Example:
//   ks(1) = 30,000 kN/m^3 (medium dense sand, from plate load test)
//   B = 2.0 m (footing width)
//
//   ks(2.0) = 30000 * [(2.0 + 0.305)/(2*2.0)]^2
//           = 30000 * [2.305/4.0]^2
//           = 30000 * [0.5763]^2
//           = 30000 * 0.3321
//           = 9963 kN/m^3
//
// Spring constant per unit length:
//   k = ks * B = 9963 * 2.0 = 19926 kN/m per m

#[test]
fn validation_winkler_spring_subgrade_reaction() {
    let ks_1: f64 = 30_000.0;      // kN/m^3, plate test modulus (B=0.305m)
    let b: f64 = 2.0;              // m, footing width

    // --- Terzaghi correction for footing size ---
    let ks: f64 = ks_1 * ((b + 0.305) / (2.0 * b)).powi(2);
    let ks_expected: f64 = 9963.0;

    let rel_err = (ks - ks_expected).abs() / ks_expected;
    assert!(
        rel_err < 0.01,
        "ks(B): computed={:.0} kN/m^3, expected={:.0} kN/m^3, err={:.4}%",
        ks, ks_expected, rel_err * 100.0
    );

    // --- Spring constant per unit length ---
    let k_per_m: f64 = ks * b;
    let k_per_m_expected: f64 = 19926.0;

    let rel_err_k = (k_per_m - k_per_m_expected).abs() / k_per_m_expected;
    assert!(
        rel_err_k < 0.01,
        "k: computed={:.0} kN/m, expected={:.0} kN/m, err={:.4}%",
        k_per_m, k_per_m_expected, rel_err_k * 100.0
    );

    // --- Wider footing has smaller ks (size effect) ---
    let b_large: f64 = 4.0;
    let ks_large: f64 = ks_1 * ((b_large + 0.305) / (2.0 * b_large)).powi(2);
    assert!(
        ks_large < ks,
        "Larger footing has smaller ks: ks(4m)={:.0} < ks(2m)={:.0}", ks_large, ks
    );

    // --- For clay, ks is inversely proportional to B ---
    // ks(B) = ks(1) * 0.305 / B
    let ks_clay_1: f64 = 20_000.0;
    let ks_clay: f64 = ks_clay_1 * 0.305 / b;
    let ks_clay_expected: f64 = 3050.0;

    let err_clay = (ks_clay - ks_clay_expected).abs();
    assert!(
        err_clay < 1.0,
        "ks(clay): computed={:.0} kN/m^3, expected={:.0} kN/m^3", ks_clay, ks_clay_expected
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Beam on Elastic Foundation --- Winkler Model Deflection
// ═══════════════════════════════════════════════════════════════
//
// Hetenyi's solution for an infinite beam on elastic foundation
// under a concentrated load P:
//
//   y(x) = (P * lambda) / (2*k) * exp(-lambda*|x|) *
//           [cos(lambda*x) + sin(lambda*|x|)]
//
// where lambda = (k / (4*E*I))^(1/4)
//       k = subgrade spring constant per unit length (kN/m/m)
//       E*I = beam flexural rigidity
//
// Maximum deflection at x = 0:
//   y_max = P*lambda / (2*k)
//
// Maximum moment at x = 0:
//   M_max = P / (4*lambda)
//
// Example:
//   P = 200 kN, E = 200,000 MPa = 200e6 kN/m^2, I = 2e-4 m^4
//   k = 15,000 kN/m^2 (subgrade spring per unit length)
//
//   EI = 200e6 * 2e-4 = 40,000 kN*m^2
//   lambda = (15000 / (4*40000))^0.25 = (0.09375)^0.25
//          = 0.3071^0.5 = 0.5535 m^(-1)
//          Wait: (15000/160000)^0.25 = (0.09375)^0.25
//          0.09375^0.5 = 0.30619
//          0.30619^0.5 = 0.55335 m^(-1)
//   Actually: lambda = (k/(4EI))^(1/4) = (15000/(4*40000))^(1/4)
//           = (15000/160000)^0.25 = 0.09375^0.25
//           0.09375^0.25 = exp(0.25*ln(0.09375)) = exp(0.25*(-2.3671))
//           = exp(-0.5918) = 0.5534 m^(-1)
//
//   y_max = 200 * 0.5534 / (2 * 15000) = 110.67 / 30000 = 0.003689 m = 3.689 mm
//   M_max = 200 / (4 * 0.5534) = 200 / 2.2136 = 90.35 kN*m

#[test]
fn validation_beam_elastic_foundation_winkler() {
    let p: f64 = 200.0;            // kN, concentrated load
    let e: f64 = 200.0e6;          // kN/m^2
    let iz: f64 = 2.0e-4;          // m^4
    let k: f64 = 15_000.0;         // kN/m^2, spring constant per unit length
    let ei: f64 = e * iz;          // = 40,000 kN*m^2

    // --- Characteristic length parameter ---
    let lambda: f64 = (k / (4.0 * ei)).powf(0.25);
    let lambda_expected: f64 = 0.5534;

    let rel_err_l = (lambda - lambda_expected).abs() / lambda_expected;
    assert!(
        rel_err_l < 0.01,
        "lambda: computed={:.4} m^(-1), expected={:.4} m^(-1), err={:.4}%",
        lambda, lambda_expected, rel_err_l * 100.0
    );

    // --- Maximum deflection at x = 0 ---
    let y_max: f64 = p * lambda / (2.0 * k);
    let y_max_mm: f64 = y_max * 1000.0;
    let y_max_expected: f64 = 3.689;  // mm

    let rel_err_y = (y_max_mm - y_max_expected).abs() / y_max_expected;
    assert!(
        rel_err_y < 0.01,
        "y_max: computed={:.3} mm, expected={:.3} mm, err={:.4}%",
        y_max_mm, y_max_expected, rel_err_y * 100.0
    );

    // --- Maximum moment at x = 0 ---
    let m_max: f64 = p / (4.0 * lambda);
    let m_max_expected: f64 = 90.35;

    let rel_err_m = (m_max - m_max_expected).abs() / m_max_expected;
    assert!(
        rel_err_m < 0.01,
        "M_max: computed={:.2} kN*m, expected={:.2} kN*m, err={:.4}%",
        m_max, m_max_expected, rel_err_m * 100.0
    );

    // --- Deflection at x = pi/(2*lambda) (first zero crossing) ---
    let x_zero: f64 = std::f64::consts::PI / (2.0 * lambda);
    let y_at_xzero: f64 = (p * lambda) / (2.0 * k)
        * (-lambda * x_zero).exp()
        * ((lambda * x_zero).cos() + (lambda * x_zero).sin());
    // At x = pi/(2*lambda): cos + sin = cos(pi/2) + sin(pi/2) = 0 + 1 = 1
    // y = P*lambda/(2k) * exp(-pi/2) * 1 = y_max * exp(-pi/2)
    let y_decay: f64 = y_max * (-std::f64::consts::PI / 2.0).exp();

    let err_zero = (y_at_xzero - y_decay).abs();
    assert!(
        err_zero < 1e-10,
        "y at pi/(2*lambda): computed={:.6e}, decay formula={:.6e}",
        y_at_xzero, y_decay
    );

    // Deflection decays rapidly
    assert!(
        y_at_xzero.abs() < y_max * 0.3,
        "Deflection decays: y({:.2})={:.4e} < 0.3*y_max={:.4e}",
        x_zero, y_at_xzero, 0.3 * y_max
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Active Earth Pressure Coefficient --- Rankine Theory
// ═══════════════════════════════════════════════════════════════
//
// Rankine active earth pressure coefficient:
//   Ka = (1 - sin(phi)) / (1 + sin(phi)) = tan^2(45 - phi/2)
//
// For phi = 30 degrees:
//   Ka = (1 - sin(30)) / (1 + sin(30)) = (1 - 0.5)/(1 + 0.5)
//      = 0.5/1.5 = 0.3333
//
// Active pressure at depth z:
//   sigma_a = Ka * gamma * z - 2*c*sqrt(Ka)
//
// For cohesionless soil (c=0), gamma = 18 kN/m^3, z = 5 m:
//   sigma_a = 0.3333 * 18 * 5 = 30.0 kN/m^2
//
// Total active force on wall (height H):
//   Pa = 0.5 * Ka * gamma * H^2
//      = 0.5 * 0.3333 * 18 * 25 = 75.0 kN/m

#[test]
fn validation_active_earth_pressure_rankine() {
    let phi_deg: f64 = 30.0;       // degrees, friction angle
    let gamma: f64 = 18.0;         // kN/m^3, soil unit weight
    let h: f64 = 5.0;              // m, wall height
    let phi_rad: f64 = phi_deg * std::f64::consts::PI / 180.0;

    // --- Active earth pressure coefficient ---
    let ka: f64 = (1.0 - phi_rad.sin()) / (1.0 + phi_rad.sin());
    let ka_expected: f64 = 1.0 / 3.0;

    let rel_err_ka = (ka - ka_expected).abs() / ka_expected;
    assert!(
        rel_err_ka < 0.001,
        "Ka: computed={:.4}, expected={:.4}", ka, ka_expected
    );

    // --- Verify tan^2(45 - phi/2) formula ---
    let ka_alt: f64 = (std::f64::consts::PI / 4.0 - phi_rad / 2.0).tan().powi(2);
    let err_alt = (ka - ka_alt).abs();
    assert!(
        err_alt < 1e-10,
        "Ka formulas match: {:.6} vs {:.6}", ka, ka_alt
    );

    // --- Active pressure at z = H ---
    let sigma_a: f64 = ka * gamma * h;
    let sigma_a_expected: f64 = 30.0;

    let rel_err_s = (sigma_a - sigma_a_expected).abs() / sigma_a_expected;
    assert!(
        rel_err_s < 0.01,
        "sigma_a(z=H): computed={:.1} kN/m^2, expected={:.1} kN/m^2",
        sigma_a, sigma_a_expected
    );

    // --- Total active force ---
    let pa: f64 = 0.5 * ka * gamma * h * h;
    let pa_expected: f64 = 75.0;

    let rel_err_pa = (pa - pa_expected).abs() / pa_expected;
    assert!(
        rel_err_pa < 0.01,
        "Pa: computed={:.1} kN/m, expected={:.1} kN/m, err={:.4}%",
        pa, pa_expected, rel_err_pa * 100.0
    );

    // --- Ka must be < 1.0 ---
    assert!(
        ka < 1.0,
        "Ka={:.4} must be < 1.0 (active case)", ka
    );

    // --- Point of application (triangular distribution: H/3 from base) ---
    let z_app: f64 = h / 3.0;
    let z_app_expected: f64 = 1.667;

    let rel_err_z = (z_app - z_app_expected).abs() / z_app_expected;
    assert!(
        rel_err_z < 0.01,
        "Application point: z={:.3} m from base, expected {:.3} m", z_app, z_app_expected
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Passive Earth Pressure Coefficient --- Rankine Theory
// ═══════════════════════════════════════════════════════════════
//
// Rankine passive earth pressure coefficient:
//   Kp = (1 + sin(phi)) / (1 - sin(phi)) = tan^2(45 + phi/2)
//
// Note: Kp = 1/Ka
//
// For phi = 30 degrees:
//   Kp = (1 + 0.5)/(1 - 0.5) = 1.5/0.5 = 3.0
//
// Passive pressure at depth z (c = 0):
//   sigma_p = Kp * gamma * z
//
// Total passive force on wall (height H = 3 m):
//   Pp = 0.5 * Kp * gamma * H^2 = 0.5 * 3.0 * 18 * 9 = 243.0 kN/m

#[test]
fn validation_passive_earth_pressure_rankine() {
    let phi_deg: f64 = 30.0;
    let gamma: f64 = 18.0;         // kN/m^3
    let h: f64 = 3.0;              // m
    let phi_rad: f64 = phi_deg * std::f64::consts::PI / 180.0;

    // --- Passive earth pressure coefficient ---
    let kp: f64 = (1.0 + phi_rad.sin()) / (1.0 - phi_rad.sin());
    let kp_expected: f64 = 3.0;

    let rel_err_kp = (kp - kp_expected).abs() / kp_expected;
    assert!(
        rel_err_kp < 0.001,
        "Kp: computed={:.4}, expected={:.4}", kp, kp_expected
    );

    // --- Kp = 1/Ka ---
    let ka: f64 = (1.0 - phi_rad.sin()) / (1.0 + phi_rad.sin());
    let kp_from_ka: f64 = 1.0 / ka;

    let err_recip = (kp - kp_from_ka).abs();
    assert!(
        err_recip < 1e-10,
        "Kp = 1/Ka: Kp={:.6}, 1/Ka={:.6}", kp, kp_from_ka
    );

    // --- Verify tan^2(45 + phi/2) formula ---
    let kp_alt: f64 = (std::f64::consts::PI / 4.0 + phi_rad / 2.0).tan().powi(2);
    let err_alt = (kp - kp_alt).abs();
    assert!(
        err_alt < 1e-10,
        "Kp formulas match: {:.6} vs {:.6}", kp, kp_alt
    );

    // --- Total passive force ---
    let pp: f64 = 0.5 * kp * gamma * h * h;
    let pp_expected: f64 = 243.0;

    let rel_err_pp = (pp - pp_expected).abs() / pp_expected;
    assert!(
        rel_err_pp < 0.01,
        "Pp: computed={:.1} kN/m, expected={:.1} kN/m, err={:.4}%",
        pp, pp_expected, rel_err_pp * 100.0
    );

    // --- Kp > Ka and Kp > 1 ---
    assert!(
        kp > ka,
        "Kp={:.4} > Ka={:.4}", kp, ka
    );
    assert!(
        kp > 1.0,
        "Kp={:.4} > 1.0 (passive case)", kp
    );

    // --- Passive force >> active force for same geometry ---
    let pa: f64 = 0.5 * ka * gamma * h * h;
    assert!(
        pp > pa,
        "Passive force Pp={:.1} >> Active force Pa={:.1} kN/m", pp, pa
    );

    // Ratio Pp/Pa = Kp/Ka = Kp^2
    let force_ratio: f64 = pp / pa;
    let force_ratio_expected: f64 = kp / ka;
    let err_ratio = (force_ratio - force_ratio_expected).abs() / force_ratio_expected;
    assert!(
        err_ratio < 1e-10,
        "Pp/Pa = Kp/Ka = {:.1}", force_ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Bearing Capacity --- Terzaghi for Strip Footing
// ═══════════════════════════════════════════════════════════════
//
// Terzaghi's bearing capacity equation for a strip footing:
//   qu = c*Nc + q*Nq + 0.5*gamma*B*N_gamma
//
// Bearing capacity factors (Terzaghi, for phi = 30 deg):
//   Nc = 37.16
//   Nq = 22.46
//   N_gamma = 19.13
//
// These are tabulated values from Terzaghi (1943).
//
// Example:
//   c = 0 (cohesionless sand), phi = 30 deg
//   q = gamma * Df = 18 * 1.5 = 27 kN/m^2 (surcharge at depth)
//   B = 2.0 m (footing width)
//   gamma = 18 kN/m^3
//
//   qu = 0 + 27 * 22.46 + 0.5 * 18 * 2.0 * 19.13
//      = 606.42 + 344.34
//      = 950.76 kN/m^2
//
// Allowable bearing capacity with FS = 3:
//   qa = qu / 3 = 316.92 kN/m^2

#[test]
fn validation_bearing_capacity_terzaghi_strip() {
    let c: f64 = 0.0;              // kN/m^2, cohesion (sand)
    let gamma: f64 = 18.0;         // kN/m^3
    let df: f64 = 1.5;             // m, foundation depth
    let b: f64 = 2.0;              // m, footing width
    let fs: f64 = 3.0;             // factor of safety

    // Surcharge at foundation level
    let q: f64 = gamma * df;
    let q_expected: f64 = 27.0;

    let err_q = (q - q_expected).abs();
    assert!(
        err_q < 0.01,
        "q: computed={:.1} kN/m^2, expected={:.1} kN/m^2", q, q_expected
    );

    // Terzaghi bearing capacity factors for phi = 30 deg
    let nc: f64 = 37.16;
    let nq: f64 = 22.46;
    let n_gamma: f64 = 19.13;

    // --- Ultimate bearing capacity (strip footing) ---
    let qu: f64 = c * nc + q * nq + 0.5 * gamma * b * n_gamma;
    let qu_expected: f64 = 950.76;

    let rel_err_qu = (qu - qu_expected).abs() / qu_expected;
    assert!(
        rel_err_qu < 0.01,
        "qu: computed={:.2} kN/m^2, expected={:.2} kN/m^2, err={:.4}%",
        qu, qu_expected, rel_err_qu * 100.0
    );

    // --- Allowable bearing capacity ---
    let qa: f64 = qu / fs;
    let qa_expected: f64 = 316.92;

    let rel_err_qa = (qa - qa_expected).abs() / qa_expected;
    assert!(
        rel_err_qa < 0.01,
        "qa: computed={:.2} kN/m^2, expected={:.2} kN/m^2, err={:.4}%",
        qa, qa_expected, rel_err_qa * 100.0
    );

    // --- Contribution breakdown ---
    let term_c: f64 = c * nc;
    let term_q: f64 = q * nq;
    let term_gamma: f64 = 0.5 * gamma * b * n_gamma;

    assert!(
        (term_c - 0.0).abs() < 0.01,
        "Cohesion term = 0 for sand"
    );
    assert!(
        term_q > 0.0 && term_gamma > 0.0,
        "Surcharge and self-weight terms positive: q_term={:.1}, gamma_term={:.1}",
        term_q, term_gamma
    );

    // --- Wider footing has higher total capacity ---
    let b2: f64 = 3.0;
    let qu2: f64 = c * nc + q * nq + 0.5 * gamma * b2 * n_gamma;
    assert!(
        qu2 > qu,
        "Wider footing: qu(3m)={:.1} > qu(2m)={:.1} kN/m^2", qu2, qu
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Pile Capacity --- Single Pile in Clay (Alpha Method)
// ═══════════════════════════════════════════════════════════════
//
// Alpha method for piles in clay (Tomlinson):
//   Qu = Qb + Qs = Ab*Nc*Su_b + sum(alpha*Su*As)
//
// where:
//   Qb = end bearing capacity
//   Qs = shaft friction capacity
//   Ab = pile base area
//   Nc = 9 (bearing capacity factor for deep foundations in clay)
//   Su_b = undrained shear strength at pile base
//   alpha = adhesion factor (function of Su/Pa, where Pa = 100 kPa)
//   As = shaft surface area per segment
//
// Example:
//   Pile: diameter D = 0.6 m, length L = 15 m
//   Clay: Su = 60 kPa (uniform), gamma = 19 kN/m^3
//   Alpha = 0.72 (for Su/Pa = 0.6, from Tomlinson chart)
//
//   Ab = pi/4 * 0.6^2 = 0.2827 m^2
//   Qb = 0.2827 * 9 * 60 = 152.66 kN
//
//   As = pi * D * L = pi * 0.6 * 15 = 28.274 m^2
//   Qs = 0.72 * 60 * 28.274 = 1221.4 kN
//
//   Qu = 152.66 + 1221.4 = 1374.1 kN
//   Qa = Qu / 2.5 = 549.6 kN

#[test]
fn validation_pile_capacity_alpha_method() {
    let d: f64 = 0.6;              // m, pile diameter
    let l: f64 = 15.0;             // m, pile length
    let su: f64 = 60.0;            // kPa, undrained shear strength
    let alpha: f64 = 0.72;         // adhesion factor
    let nc: f64 = 9.0;             // bearing capacity factor (deep clay)
    let fs: f64 = 2.5;             // factor of safety
    let pi = std::f64::consts::PI;

    // --- Pile base area ---
    let ab: f64 = pi / 4.0 * d * d;
    let ab_expected: f64 = 0.2827;

    let rel_err_ab = (ab - ab_expected).abs() / ab_expected;
    assert!(
        rel_err_ab < 0.01,
        "Ab: computed={:.4} m^2, expected={:.4} m^2", ab, ab_expected
    );

    // --- End bearing ---
    let qb: f64 = ab * nc * su;
    let qb_expected: f64 = 152.66;

    let rel_err_qb = (qb - qb_expected).abs() / qb_expected;
    assert!(
        rel_err_qb < 0.01,
        "Qb: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        qb, qb_expected, rel_err_qb * 100.0
    );

    // --- Shaft surface area ---
    let a_s: f64 = pi * d * l;
    let as_expected: f64 = 28.274;

    let rel_err_as = (a_s - as_expected).abs() / as_expected;
    assert!(
        rel_err_as < 0.01,
        "As: computed={:.3} m^2, expected={:.3} m^2", a_s, as_expected
    );

    // --- Shaft friction ---
    let qs: f64 = alpha * su * a_s;
    let qs_expected: f64 = 1221.4;

    let rel_err_qs = (qs - qs_expected).abs() / qs_expected;
    assert!(
        rel_err_qs < 0.01,
        "Qs: computed={:.1} kN, expected={:.1} kN, err={:.4}%",
        qs, qs_expected, rel_err_qs * 100.0
    );

    // --- Ultimate pile capacity ---
    let qu: f64 = qb + qs;
    let qu_expected: f64 = 1374.1;

    let rel_err_qu = (qu - qu_expected).abs() / qu_expected;
    assert!(
        rel_err_qu < 0.01,
        "Qu: computed={:.1} kN, expected={:.1} kN, err={:.4}%",
        qu, qu_expected, rel_err_qu * 100.0
    );

    // --- Allowable capacity ---
    let qa: f64 = qu / fs;
    let qa_expected: f64 = 549.6;

    let rel_err_qa = (qa - qa_expected).abs() / qa_expected;
    assert!(
        rel_err_qa < 0.01,
        "Qa: computed={:.1} kN, expected={:.1} kN, err={:.4}%",
        qa, qa_expected, rel_err_qa * 100.0
    );

    // --- Shaft friction dominates over end bearing ---
    assert!(
        qs > qb,
        "Shaft friction Qs={:.1} > end bearing Qb={:.1} (typical for clay)",
        qs, qb
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Group Pile Efficiency --- Converse-Labarre Formula
// ═══════════════════════════════════════════════════════════════
//
// The Converse-Labarre formula estimates group efficiency for
// friction piles:
//   eta = 1 - theta * [(n-1)*m + (m-1)*n] / (90*m*n)
//
// where:
//   theta = arctan(D/s) in degrees
//   D = pile diameter
//   s = center-to-center spacing
//   m = number of rows
//   n = number of piles per row
//
// Example:
//   D = 0.4 m, s = 1.2 m (3D spacing)
//   m = 3 rows, n = 4 piles per row (12 piles total)
//
//   theta = arctan(0.4/1.2) = arctan(0.3333) = 18.43 degrees
//
//   eta = 1 - 18.43 * [(4-1)*3 + (3-1)*4] / (90*3*4)
//       = 1 - 18.43 * [9 + 8] / 1080
//       = 1 - 18.43 * 17 / 1080
//       = 1 - 313.37 / 1080
//       = 1 - 0.2902
//       = 0.710
//
// Group capacity = eta * n_total * Q_single
// For Q_single = 500 kN:
//   Q_group = 0.710 * 12 * 500 = 4260 kN

#[test]
fn validation_group_pile_efficiency_converse_labarre() {
    let d: f64 = 0.4;              // m, pile diameter
    let s: f64 = 1.2;              // m, center-to-center spacing
    let m: f64 = 3.0;              // number of rows
    let n: f64 = 4.0;              // piles per row
    let q_single: f64 = 500.0;     // kN, single pile capacity

    // --- Theta angle ---
    let theta: f64 = (d / s).atan() * 180.0 / std::f64::consts::PI;
    let theta_expected: f64 = 18.43;

    let rel_err_theta = (theta - theta_expected).abs() / theta_expected;
    assert!(
        rel_err_theta < 0.01,
        "theta: computed={:.2} deg, expected={:.2} deg, err={:.4}%",
        theta, theta_expected, rel_err_theta * 100.0
    );

    // --- Group efficiency ---
    let eta: f64 = 1.0 - theta * ((n - 1.0) * m + (m - 1.0) * n) / (90.0 * m * n);
    let eta_expected: f64 = 0.710;

    let rel_err_eta = (eta - eta_expected).abs() / eta_expected;
    assert!(
        rel_err_eta < 0.01,
        "eta: computed={:.3}, expected={:.3}, err={:.4}%",
        eta, eta_expected, rel_err_eta * 100.0
    );

    // --- eta must be between 0 and 1 ---
    assert!(
        eta > 0.0 && eta <= 1.0,
        "eta={:.3} must be in (0, 1]", eta
    );

    // --- Group capacity ---
    let n_total: f64 = m * n;
    let q_group: f64 = eta * n_total * q_single;
    let q_group_expected: f64 = 4260.0;

    let rel_err_qg = (q_group - q_group_expected).abs() / q_group_expected;
    assert!(
        rel_err_qg < 0.01,
        "Q_group: computed={:.0} kN, expected={:.0} kN, err={:.4}%",
        q_group, q_group_expected, rel_err_qg * 100.0
    );

    // --- Wider spacing improves efficiency ---
    let s_wide: f64 = 2.4;  // 6D spacing
    let theta_wide: f64 = (d / s_wide).atan() * 180.0 / std::f64::consts::PI;
    let eta_wide: f64 = 1.0 - theta_wide * ((n - 1.0) * m + (m - 1.0) * n) / (90.0 * m * n);
    assert!(
        eta_wide > eta,
        "Wider spacing improves efficiency: eta(6D)={:.3} > eta(3D)={:.3}",
        eta_wide, eta
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Settlement of Circular Footing on Elastic Half-Space
// ═══════════════════════════════════════════════════════════════
//
// Boussinesq elastic settlement of a uniformly loaded circular
// footing on an elastic half-space:
//
//   delta = q * B * (1 - nu^2) * I_w / Es
//
// For a rigid circular footing:
//   I_w = pi/4 (influence factor for rigid circular plate)
//
// For a flexible circular footing (center settlement):
//   I_w = 1.0
//
// For a flexible circular footing (average settlement):
//   I_w = 0.85
//
// Example (rigid circular footing):
//   q = 200 kN/m^2 (bearing pressure)
//   B = 3.0 m (diameter)
//   Es = 25,000 kN/m^2 (soil elastic modulus)
//   nu = 0.3
//
//   delta = 200 * 3.0 * (1 - 0.09) * (pi/4) / 25000
//         = 200 * 3.0 * 0.91 * 0.7854 / 25000
//         = 428.9 / 25000
//         = 0.01716 m = 17.16 mm

#[test]
fn validation_settlement_circular_footing() {
    let q: f64 = 200.0;            // kN/m^2, bearing pressure
    let b: f64 = 3.0;              // m, footing diameter
    let es: f64 = 25_000.0;        // kN/m^2, soil elastic modulus
    let nu: f64 = 0.3;
    let pi = std::f64::consts::PI;

    // --- Rigid circular footing ---
    let iw_rigid: f64 = pi / 4.0;  // = 0.7854
    let delta_rigid: f64 = q * b * (1.0 - nu * nu) * iw_rigid / es;
    let delta_rigid_mm: f64 = delta_rigid * 1000.0;
    let delta_rigid_expected: f64 = 17.16;

    let rel_err_rigid = (delta_rigid_mm - delta_rigid_expected).abs() / delta_rigid_expected;
    assert!(
        rel_err_rigid < 0.01,
        "delta(rigid): computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        delta_rigid_mm, delta_rigid_expected, rel_err_rigid * 100.0
    );

    // --- Flexible circular footing (center) ---
    let iw_flex_center: f64 = 1.0;
    let delta_flex_center: f64 = q * b * (1.0 - nu * nu) * iw_flex_center / es;
    let delta_flex_center_mm: f64 = delta_flex_center * 1000.0;
    let delta_flex_expected: f64 = 21.84;

    let rel_err_flex = (delta_flex_center_mm - delta_flex_expected).abs() / delta_flex_expected;
    assert!(
        rel_err_flex < 0.01,
        "delta(flex center): computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        delta_flex_center_mm, delta_flex_expected, rel_err_flex * 100.0
    );

    // --- Flexible > rigid settlement (center) ---
    assert!(
        delta_flex_center_mm > delta_rigid_mm,
        "Flexible center > rigid: {:.2} mm > {:.2} mm",
        delta_flex_center_mm, delta_rigid_mm
    );

    // --- Average settlement of flexible footing ---
    let iw_flex_avg: f64 = 0.85;
    let delta_flex_avg: f64 = q * b * (1.0 - nu * nu) * iw_flex_avg / es;
    let delta_flex_avg_mm: f64 = delta_flex_avg * 1000.0;

    // Average is between rigid and center
    assert!(
        delta_flex_avg_mm > delta_rigid_mm && delta_flex_avg_mm < delta_flex_center_mm,
        "Avg settlement between rigid and flex center: {:.2} < {:.2} < {:.2} mm",
        delta_rigid_mm, delta_flex_avg_mm, delta_flex_center_mm
    );

    // --- Effect of soil modulus: stiffer soil = less settlement ---
    let es_stiff: f64 = 50_000.0;
    let delta_stiff: f64 = q * b * (1.0 - nu * nu) * iw_rigid / es_stiff * 1000.0;
    assert!(
        delta_stiff < delta_rigid_mm,
        "Stiffer soil: {:.2} mm < {:.2} mm", delta_stiff, delta_rigid_mm
    );

    // Settlement inversely proportional to Es
    let ratio_settle: f64 = delta_rigid_mm / delta_stiff;
    let ratio_es: f64 = es_stiff / es;
    let err_ratio = (ratio_settle - ratio_es).abs() / ratio_es;
    assert!(
        err_ratio < 0.001,
        "Settlement ratio matches Es ratio: {:.3} vs {:.3}", ratio_settle, ratio_es
    );
}
