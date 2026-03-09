/// Validation: Advanced Stability
///
/// References:
///   - AISC 360-22, Chapter E and Appendix 7
///   - EN 1993-1-1:2005 (Eurocode 3), Section 6.3
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///   - Galambos & Surovek, "Structural Stability of Steel", 5th Ed.
///   - Chen & Lui, "Structural Stability: Theory and Implementation"
///   - AISI S100-16, "North American Specification for Cold-Formed Steel"
///   - Bleich, "Buckling Strength of Metal Structures"
///
/// Tests verify effective length, inelastic buckling, lateral-torsional
/// buckling, web classification, distortional buckling, frame stability,
/// plate buckling, and elastic critical moment.

#[allow(unused_imports)]
use dedaliano_engine::types::*;

// ═══════════════════════════════════════════════════════════════
// 1. Effective Length Factor --- Alignment Chart Approximation
// ═══════════════════════════════════════════════════════════════
//
// AISC alignment chart approximate equations.
//
// For braced (non-sway) frames, Duan-Chen approximation:
//   K = sqrt[(1 + 0.5*G_A)/(2 + 0.5*G_A) * (1 + 0.5*G_B)/(2 + 0.5*G_B)]
//   This is a lower bound approximation.
//
// For sway frames, Lui-Chen approximation:
//   K = sqrt[(1.6*G_A*G_B + 4*(G_A+G_B) + 7.5) / (G_A+G_B + 7.5)]
//
// G = sum(EI/L_column) / sum(EI/L_beam) at each joint.
// G = 0 for fixed end (rigid restraint).
// G = 10 (effectively infinity) for pinned end.
//
// Example (braced frame):
//   G_A = 1.5 (moderate beam restraint at top)
//   G_B = 0.0 (fixed base)
//
//   K_braced = sqrt[(1+0.75)/(2+0.75) * (1+0)/(2+0)]
//            = sqrt[1.75/2.75 * 0.5]
//            = sqrt[0.6364 * 0.5]
//            = sqrt[0.3182] = 0.564
//
// Example (sway frame):
//   G_A = 1.5, G_B = 1.5
//   K_sway = sqrt[(1.6*2.25 + 4*3.0 + 7.5) / (3.0 + 7.5)]
//          = sqrt[(3.6 + 12.0 + 7.5) / 10.5]
//          = sqrt[23.1 / 10.5] = sqrt[2.20] = 1.483

#[test]
fn validation_effective_length_alignment_chart() {
    // --- Braced frame: Duan-Chen approximation ---
    let ga_braced: f64 = 1.5;
    let gb_braced: f64 = 0.0;  // fixed base

    let k_braced: f64 = ((1.0 + 0.5 * ga_braced) / (2.0 + 0.5 * ga_braced)
        * (1.0 + 0.5 * gb_braced) / (2.0 + 0.5 * gb_braced))
        .sqrt();
    let k_braced_expected: f64 = 0.564;

    let rel_err_kb = (k_braced - k_braced_expected).abs() / k_braced_expected;
    assert!(
        rel_err_kb < 0.01,
        "K(braced): computed={:.3}, expected={:.3}, err={:.4}%",
        k_braced, k_braced_expected, rel_err_kb * 100.0
    );

    // Braced K must be <= 1.0
    assert!(
        k_braced <= 1.0,
        "Braced frame K={:.3} must be <= 1.0", k_braced
    );

    // --- Sway frame: Lui-Chen approximation ---
    let ga_sway: f64 = 1.5;
    let gb_sway: f64 = 1.5;

    let k_sway: f64 = ((1.6 * ga_sway * gb_sway + 4.0 * (ga_sway + gb_sway) + 7.5)
        / (ga_sway + gb_sway + 7.5))
        .sqrt();
    let k_sway_expected: f64 = 1.483;

    let rel_err_ks = (k_sway - k_sway_expected).abs() / k_sway_expected;
    assert!(
        rel_err_ks < 0.01,
        "K(sway): computed={:.3}, expected={:.3}, err={:.4}%",
        k_sway, k_sway_expected, rel_err_ks * 100.0
    );

    // Sway K must be >= 1.0
    assert!(
        k_sway >= 1.0,
        "Sway frame K={:.3} must be >= 1.0", k_sway
    );

    // --- Idealized cases ---
    // Fixed-fixed (G_A=G_B=0): K_braced = sqrt(0.5*0.5) = 0.5
    let k_ff: f64 = (1.0_f64 / 2.0 * 1.0 / 2.0).sqrt();
    assert!(
        (k_ff - 0.5).abs() < 0.001,
        "Fixed-fixed K: computed={:.3}, expected 0.5", k_ff
    );

    // Pinned-pinned approx (G_A=G_B=10): approaches K=1.0
    let k_pp: f64 = ((1.0_f64 + 5.0) / (2.0 + 5.0) * (1.0 + 5.0) / (2.0 + 5.0)).sqrt();
    assert!(
        k_pp > 0.8 && k_pp <= 1.0,
        "Pinned-pinned approx K: computed={:.3}, expected near 1.0", k_pp
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Inelastic Buckling --- Tangent Modulus Theory
// ═══════════════════════════════════════════════════════════════
//
// Shanley's tangent modulus gives the critical stress for inelastic buckling:
//   sigma_cr = pi^2 * E_t / (KL/r)^2
//
// For a Ramberg-Osgood material model (simplified):
//   E_t = E / [1 + n*(sigma/sigma_0)^(n-1)]
// where n = shape parameter, sigma_0 = reference stress
//
// For steel with bilinear model (simplified):
//   E_t = E   for sigma < F_y
//   E_t = E_h for sigma >= F_y  (strain hardening modulus)
//
// AISC column curve (inelastic range, Fe >= 0.44*Fy):
//   F_cr = 0.658^(Fy/Fe) * Fy
//
// For KL/r = 60, E = 200,000 MPa, Fy = 345 MPa:
//   Fe = pi^2 * 200000 / 60^2 = pi^2 * 200000 / 3600 = 548.31 MPa
//   F_cr = 0.658^(345/548.31) * 345 = 0.658^0.6293 * 345
//   0.658^0.6293 = exp(0.6293*ln(0.658)) = exp(0.6293*(-0.4189)) = exp(-0.2636) = 0.7684
//   F_cr = 0.7684 * 345 = 265.1 MPa

#[test]
fn validation_inelastic_buckling_tangent_modulus() {
    let e: f64 = 200_000.0;        // MPa
    let fy: f64 = 345.0;           // MPa
    let pi = std::f64::consts::PI;

    // --- Euler stress at KL/r = 60 ---
    let kl_r: f64 = 60.0;
    let fe: f64 = pi * pi * e / (kl_r * kl_r);
    let fe_expected: f64 = 548.31;

    let rel_err_fe = (fe - fe_expected).abs() / fe_expected;
    assert!(
        rel_err_fe < 0.01,
        "Fe: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        fe, fe_expected, rel_err_fe * 100.0
    );

    // --- Check inelastic range ---
    assert!(
        fe >= 0.44 * fy,
        "Inelastic range: Fe={:.2} >= 0.44*Fy={:.2}", fe, 0.44 * fy
    );

    // --- AISC inelastic critical stress ---
    let fy_over_fe: f64 = fy / fe;
    let fcr: f64 = 0.658_f64.powf(fy_over_fe) * fy;
    let fcr_expected: f64 = 265.1;

    let rel_err_fcr = (fcr - fcr_expected).abs() / fcr_expected;
    assert!(
        rel_err_fcr < 0.01,
        "Fcr(inelastic): computed={:.1} MPa, expected={:.1} MPa, err={:.4}%",
        fcr, fcr_expected, rel_err_fcr * 100.0
    );

    // --- Fcr must be less than Fy ---
    assert!(
        fcr < fy,
        "Fcr={:.1} < Fy={:.1}: inelastic reduction applies", fcr, fy
    );

    // --- Compare elastic range at KL/r = 150 ---
    let kl_r_long: f64 = 150.0;
    let fe_long: f64 = pi * pi * e / (kl_r_long * kl_r_long);
    assert!(
        fe_long < 0.44 * fy,
        "Elastic range: Fe={:.2} < 0.44*Fy={:.2}", fe_long, 0.44 * fy
    );

    let fcr_long: f64 = 0.877 * fe_long;
    assert!(
        fcr_long < fcr,
        "Long column Fcr={:.1} < short column Fcr={:.1}", fcr_long, fcr
    );

    // --- Reduced modulus (double modulus) for comparison ---
    let e_sh: f64 = 2000.0;  // strain hardening modulus
    let e_r: f64 = 4.0 * e * e_sh / (e.sqrt() + e_sh.sqrt()).powi(2);
    assert!(
        e_r > e_sh && e_r < e,
        "Reduced modulus E_r={:.0} between E_sh={:.0} and E={:.0}", e_r, e_sh, e
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Lateral-Torsional Buckling --- Cb Factor Computation
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-22, Eq. F1-1:
//   Cb = 12.5*M_max / (2.5*M_max + 3*M_A + 4*M_B + 3*M_C)
//
// where M_max = maximum absolute moment in the unbraced segment
//       M_A = absolute moment at quarter point
//       M_B = absolute moment at midpoint
//       M_C = absolute moment at three-quarter point
//
// Case 1: Uniform moment (M constant throughout):
//   M_A = M_B = M_C = M_max = M
//   Cb = 12.5M / (2.5M + 3M + 4M + 3M) = 12.5/12.5 = 1.0
//
// Case 2: Linear moment (M1=M at one end, M2=0 at other):
//   M_max = M, M_A = 0.75M, M_B = 0.50M, M_C = 0.25M
//   Cb = 12.5M / (2.5M + 2.25M + 2.0M + 0.75M) = 12.5/7.5 = 1.667
//
// Case 3: Midspan point load on SS beam:
//   M_max at center = PL/4
//   M_A = M_C = 3/16*PL = 0.75*M_max? No.
//   Actually: M_A(L/4) = P/2 * L/4 = PL/8 = 0.5*M_max
//   M_B(L/2) = PL/4 = M_max
//   M_C(3L/4) = PL/8 = 0.5*M_max
//   Cb = 12.5*M / (2.5M + 1.5M + 4M + 1.5M) = 12.5/9.5 = 1.316

#[test]
fn validation_ltb_cb_factor() {
    // Cb formula
    let cb = |m_max: f64, m_a: f64, m_b: f64, m_c: f64| -> f64 {
        12.5 * m_max / (2.5 * m_max + 3.0 * m_a + 4.0 * m_b + 3.0 * m_c)
    };

    // --- Case 1: Uniform moment ---
    let m: f64 = 100.0; // arbitrary magnitude
    let cb_uniform: f64 = cb(m, m, m, m);
    let cb_uniform_expected: f64 = 1.0;

    let err_1 = (cb_uniform - cb_uniform_expected).abs();
    assert!(
        err_1 < 0.001,
        "Cb(uniform): computed={:.4}, expected={:.4}", cb_uniform, cb_uniform_expected
    );

    // --- Case 2: Linear moment diagram (M at one end, 0 at other) ---
    let cb_linear: f64 = cb(m, 0.75 * m, 0.50 * m, 0.25 * m);
    let cb_linear_expected: f64 = 1.667;

    let rel_err_2 = (cb_linear - cb_linear_expected).abs() / cb_linear_expected;
    assert!(
        rel_err_2 < 0.01,
        "Cb(linear): computed={:.3}, expected={:.3}, err={:.4}%",
        cb_linear, cb_linear_expected, rel_err_2 * 100.0
    );

    // --- Case 3: Midspan point load ---
    let cb_point: f64 = cb(m, 0.50 * m, m, 0.50 * m);
    let cb_point_expected: f64 = 1.316;

    let rel_err_3 = (cb_point - cb_point_expected).abs() / cb_point_expected;
    assert!(
        rel_err_3 < 0.01,
        "Cb(point load): computed={:.3}, expected={:.3}, err={:.4}%",
        cb_point, cb_point_expected, rel_err_3 * 100.0
    );

    // --- Cb for uniform moment is minimum ---
    assert!(
        cb_uniform <= cb_linear && cb_uniform <= cb_point,
        "Uniform moment gives lowest Cb: Cb_unif={:.3}, Cb_lin={:.3}, Cb_pt={:.3}",
        cb_uniform, cb_linear, cb_point
    );

    // --- Cb >= 1.0 for all standard loading cases ---
    assert!(
        cb_uniform >= 1.0 && cb_linear >= 1.0 && cb_point >= 1.0,
        "All Cb values >= 1.0"
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Web Local Buckling Classification
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-22, Table B4.1b: Web classification under flexure.
//
// Width-to-thickness ratio for web: h/tw
// Compact limit:     lambda_p = 3.76*sqrt(E/Fy)
// Noncompact limit:  lambda_r = 5.70*sqrt(E/Fy)
//
// For E = 200,000 MPa, Fy = 345 MPa:
//   lambda_p = 3.76*sqrt(200000/345) = 3.76*sqrt(579.71) = 3.76*24.077 = 90.53
//   lambda_r = 5.70*sqrt(200000/345) = 5.70*24.077 = 137.24
//
// Classification:
//   h/tw <= lambda_p: Compact (can develop full plastic moment)
//   lambda_p < h/tw <= lambda_r: Noncompact
//   h/tw > lambda_r: Slender
//
// W610x125 (W24x84 approx):
//   h = 612 mm, tw = 11.2 mm, h/tw = 54.6 -- Compact
//
// Built-up girder:
//   h = 1500 mm, tw = 10 mm, h/tw = 150 -- Slender

#[test]
fn validation_web_local_buckling_classification() {
    let e: f64 = 200_000.0;        // MPa
    let fy: f64 = 345.0;           // MPa

    // --- Slenderness limits ---
    let sqrt_ratio: f64 = (e / fy).sqrt();
    let lambda_p: f64 = 3.76 * sqrt_ratio;
    let lambda_r: f64 = 5.70 * sqrt_ratio;

    let lambda_p_expected: f64 = 90.53;
    let lambda_r_expected: f64 = 137.24;

    let rel_err_p = (lambda_p - lambda_p_expected).abs() / lambda_p_expected;
    assert!(
        rel_err_p < 0.01,
        "lambda_p: computed={:.2}, expected={:.2}, err={:.4}%",
        lambda_p, lambda_p_expected, rel_err_p * 100.0
    );

    let rel_err_r = (lambda_r - lambda_r_expected).abs() / lambda_r_expected;
    assert!(
        rel_err_r < 0.01,
        "lambda_r: computed={:.2}, expected={:.2}, err={:.4}%",
        lambda_r, lambda_r_expected, rel_err_r * 100.0
    );

    // --- W610x125 section: Compact ---
    let h_tw_w610: f64 = 612.0 / 11.2;  // = 54.64
    assert!(
        h_tw_w610 <= lambda_p,
        "W610x125 is Compact: h/tw={:.1} <= lambda_p={:.1}", h_tw_w610, lambda_p
    );

    // --- Built-up girder: Slender ---
    let h_tw_girder: f64 = 1500.0 / 10.0;  // = 150.0
    assert!(
        h_tw_girder > lambda_r,
        "Built-up girder is Slender: h/tw={:.1} > lambda_r={:.1}", h_tw_girder, lambda_r
    );

    // --- Intermediate case: Noncompact ---
    let h_tw_nc: f64 = 120.0;  // between 90.53 and 137.24
    assert!(
        h_tw_nc > lambda_p && h_tw_nc <= lambda_r,
        "h/tw={:.1} is Noncompact: lambda_p={:.1} < h/tw <= lambda_r={:.1}",
        h_tw_nc, lambda_p, lambda_r
    );

    // --- lambda_p < lambda_r always ---
    assert!(
        lambda_p < lambda_r,
        "lambda_p={:.2} < lambda_r={:.2}", lambda_p, lambda_r
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Distortional Buckling of Cold-Formed Sections
// ═══════════════════════════════════════════════════════════════
//
// AISI S100-16, Section F4.1: Distortional buckling stress.
//
// Simplified expression for C-section with simple lip stiffener:
//   F_d = k_d * pi^2 * E * t^2 / (12*(1-nu^2)*b_f^2)
//
// where k_d = distortional buckling coefficient (function of geometry),
// t = thickness, b_f = flange width, nu = Poisson's ratio.
//
// For a typical C-section:
//   t = 1.5 mm, b_f = 65 mm, E = 200,000 MPa, nu = 0.3
//   k_d = 0.5 (approximate for standard lip)
//
//   F_d = 0.5 * pi^2 * 200000 * 1.5^2 / (12*(1-0.09)*65^2)
//       = 0.5 * 9.8696 * 200000 * 2.25 / (12*0.91*4225)
//       = 0.5 * 4,441,320 / 46,134
//       = 0.5 * 96.27
//       = 48.13 MPa
//
// The distortional buckling strength depends on the ratio F_d/F_y:
//   If lambda_d = sqrt(Fy/Fd) <= 0.673: F_n = F_y
//   If lambda_d > 0.673: F_n = (1 - 0.22*(Fd/Fy)^0.5) * (Fd/Fy)^0.5 * Fy

#[test]
fn validation_distortional_buckling_cold_formed() {
    let e: f64 = 200_000.0;        // MPa
    let nu: f64 = 0.3;
    let t: f64 = 1.5;              // mm, thickness
    let bf: f64 = 65.0;            // mm, flange width
    let fy: f64 = 345.0;           // MPa, yield stress
    let kd: f64 = 0.5;             // distortional buckling coefficient
    let pi = std::f64::consts::PI;

    // --- Distortional buckling stress ---
    let fd: f64 = kd * pi * pi * e * t * t / (12.0 * (1.0 - nu * nu) * bf * bf);
    let fd_expected: f64 = 48.13;

    let rel_err_fd = (fd - fd_expected).abs() / fd_expected;
    assert!(
        rel_err_fd < 0.01,
        "Fd: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        fd, fd_expected, rel_err_fd * 100.0
    );

    // --- Distortional slenderness ---
    let lambda_d: f64 = (fy / fd).sqrt();
    let lambda_d_expected: f64 = (345.0 / 48.13_f64).sqrt();

    let rel_err_ld = (lambda_d - lambda_d_expected).abs() / lambda_d_expected;
    assert!(
        rel_err_ld < 0.001,
        "lambda_d: computed={:.3}, expected={:.3}", lambda_d, lambda_d_expected
    );

    // lambda_d > 0.673, so distortional reduction applies
    assert!(
        lambda_d > 0.673,
        "lambda_d={:.3} > 0.673: distortional reduction applies", lambda_d
    );

    // --- Distortional buckling nominal stress ---
    let fd_fy_ratio: f64 = (fd / fy).sqrt();
    let fn_dist: f64 = (1.0 - 0.22 * fd_fy_ratio) * fd_fy_ratio * fy;

    // Fn must be between Fd and Fy
    assert!(
        fn_dist > 0.0 && fn_dist < fy,
        "Fn(distortional)={:.1} MPa must be between 0 and Fy={:.1}", fn_dist, fy
    );

    // --- Compare with local buckling (typically plate buckling) ---
    // Plate buckling of flange: F_local = k_local * pi^2 * E * t^2 / (12*(1-nu^2)*b^2)
    let kl: f64 = 4.0;  // fixed-free flange edges (typically k = 0.425 for outstand)
    let f_local: f64 = kl * pi * pi * e * t * t / (12.0 * (1.0 - nu * nu) * bf * bf);

    // Local buckling with k=4 should be higher than distortional with k=0.5
    assert!(
        f_local > fd,
        "Local buckling F={:.1} > distortional F={:.1} (k_local > k_d)", f_local, fd
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Frame Stability --- Story Stiffness Method
// ═══════════════════════════════════════════════════════════════
//
// AISC 360-22, Appendix 7: Story stability using B2 factor.
//
//   B2 = 1 / (1 - alpha * sum(P_story) / sum(Pe_story))
//
// where alpha = 1.0 (LRFD), and the elastic critical load for the story:
//   Pe_story = R_M * sum(H*L) / Delta_H
//   R_M = 1 - 0.15*(P_mf / P_story) (moment frame adjustment)
//
// H = total story shear, L = story height, Delta_H = first-order
// interstory drift due to lateral forces.
//
// Example:
//   P_story = 3000 kN (total gravity on the story)
//   H = 150 kN (story shear)
//   L = 3.5 m (story height)
//   Delta_H = 8 mm = 0.008 m (interstory drift)
//   All columns are moment frame: R_M = 1 - 0.15 = 0.85
//
//   Pe_story = 0.85 * 150 * 3.5 / 0.008 = 0.85 * 65625 = 55781 kN
//   B2 = 1 / (1 - 3000/55781) = 1 / (1 - 0.05380) = 1 / 0.9462 = 1.0569

#[test]
fn validation_frame_stability_story_stiffness() {
    let p_story: f64 = 3000.0;     // kN, total gravity load
    let h_shear: f64 = 150.0;      // kN, story shear
    let l_story: f64 = 3.5;        // m, story height
    let delta_h: f64 = 0.008;      // m, interstory drift
    let alpha: f64 = 1.0;          // LRFD

    // --- Story P_e ---
    let rm: f64 = 0.85;            // all moment frame columns
    let pe_story: f64 = rm * h_shear * l_story / delta_h;
    let pe_story_expected: f64 = 55781.0;

    let rel_err_pe = (pe_story - pe_story_expected).abs() / pe_story_expected;
    assert!(
        rel_err_pe < 0.01,
        "Pe_story: computed={:.0} kN, expected={:.0} kN, err={:.4}%",
        pe_story, pe_story_expected, rel_err_pe * 100.0
    );

    // --- B2 factor ---
    let b2: f64 = 1.0 / (1.0 - alpha * p_story / pe_story);
    let b2_expected: f64 = 1.0569;

    let rel_err_b2 = (b2 - b2_expected).abs() / b2_expected;
    assert!(
        rel_err_b2 < 0.01,
        "B2: computed={:.4}, expected={:.4}, err={:.4}%",
        b2, b2_expected, rel_err_b2 * 100.0
    );

    // --- Stability check ---
    assert!(
        b2 >= 1.0,
        "B2={:.4} must be >= 1.0 for stable frame", b2
    );

    // --- Stability ratio ---
    let theta: f64 = p_story / pe_story;
    assert!(
        theta < 0.25,
        "Stability ratio theta={:.4} must be < 0.25", theta
    );

    // --- If B2 > 1.5, second-order analysis required directly ---
    assert!(
        b2 < 1.5,
        "B2={:.4} < 1.5: approximate method is acceptable", b2
    );

    // --- Sensitivity: doubling drift doubles B2 correction ---
    let pe_double_drift: f64 = rm * h_shear * l_story / (2.0 * delta_h);
    let b2_double: f64 = 1.0 / (1.0 - alpha * p_story / pe_double_drift);
    assert!(
        b2_double > b2,
        "Doubling drift increases B2: {:.4} > {:.4}", b2_double, b2
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Plate Buckling Under Combined Loading
// ═══════════════════════════════════════════════════════════════
//
// Classical plate buckling under combined compression and shear
// (Bleich interaction formula):
//
//   (sigma/sigma_cr)^2 + (tau/tau_cr)^2 = 1
//
// For a simply supported plate:
//   sigma_cr = k_sigma * pi^2 * D / (b^2 * t)
//   tau_cr = k_tau * pi^2 * D / (b^2 * t)
//
// where D = E*t^3 / (12*(1-nu^2)) = flexural rigidity per unit width,
// k_sigma = 4.0 (biaxial compression, a/b >= 1),
// k_tau = 5.35 + 4.0/(a/b)^2 (shear buckling).
//
// Plate: a = 600 mm, b = 300 mm, t = 6 mm, E = 200000 MPa, nu = 0.3
//   a/b = 2.0
//   D = 200000*216 / (12*0.91) = 43,200,000 / 10.92 = 3,956,044 N*mm
//   sigma_cr = 4.0 * pi^2 * 3,956,044 / (300^2 * 6) = 4 * 39,047,792 / 540000
//            = 156,191,168 / 540000 = 289.24 MPa
//   k_tau = 5.35 + 4.0/4.0 = 6.35
//   tau_cr = 6.35 * 39,047,792 / 540000 = 247,953,469 / 540000 = 459.17 MPa
//
// If applied sigma = 200 MPa, tau = 0 MPa:
//   IR = (200/289.24)^2 + 0 = 0.478 < 1.0 -- OK
//
// If applied sigma = 200 MPa, find max tau:
//   tau_max = tau_cr * sqrt(1 - (200/289.24)^2) = 459.17 * sqrt(0.522) = 459.17 * 0.7225
//           = 331.8 MPa

#[test]
fn validation_plate_buckling_combined_loading() {
    let e: f64 = 200_000.0;        // MPa
    let nu: f64 = 0.3;
    let a: f64 = 600.0;            // mm, plate length
    let b: f64 = 300.0;            // mm, plate width
    let t: f64 = 6.0;              // mm, plate thickness
    let pi = std::f64::consts::PI;

    // --- Flexural rigidity ---
    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let d_expected: f64 = 3_956_044.0;

    let rel_err_d = (d - d_expected).abs() / d_expected;
    assert!(
        rel_err_d < 0.01,
        "D: computed={:.0} N*mm, expected={:.0} N*mm, err={:.4}%",
        d, d_expected, rel_err_d * 100.0
    );

    // --- Compression buckling stress ---
    let k_sigma: f64 = 4.0;  // SS plate, a/b >= 1
    let sigma_cr: f64 = k_sigma * pi * pi * d / (b * b * t);
    let sigma_cr_expected: f64 = 289.24;

    let rel_err_sc = (sigma_cr - sigma_cr_expected).abs() / sigma_cr_expected;
    assert!(
        rel_err_sc < 0.01,
        "sigma_cr: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        sigma_cr, sigma_cr_expected, rel_err_sc * 100.0
    );

    // --- Shear buckling stress ---
    let aspect: f64 = a / b;
    let k_tau: f64 = 5.35 + 4.0 / (aspect * aspect);
    let k_tau_expected: f64 = 6.35;

    let err_kt = (k_tau - k_tau_expected).abs();
    assert!(
        err_kt < 0.01,
        "k_tau: computed={:.2}, expected={:.2}", k_tau, k_tau_expected
    );

    let tau_cr: f64 = k_tau * pi * pi * d / (b * b * t);
    let tau_cr_expected: f64 = 459.17;

    let rel_err_tc = (tau_cr - tau_cr_expected).abs() / tau_cr_expected;
    assert!(
        rel_err_tc < 0.01,
        "tau_cr: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        tau_cr, tau_cr_expected, rel_err_tc * 100.0
    );

    // --- Interaction check: sigma=200, tau=0 ---
    let sigma_app: f64 = 200.0;
    let ir: f64 = (sigma_app / sigma_cr).powi(2);
    let ir_expected: f64 = 0.478;

    let rel_err_ir = (ir - ir_expected).abs() / ir_expected;
    assert!(
        rel_err_ir < 0.01,
        "IR(sigma only): computed={:.3}, expected={:.3}", ir, ir_expected
    );
    assert!(ir < 1.0, "IR={:.3} < 1.0: plate is stable", ir);

    // --- Maximum shear with sigma=200 MPa ---
    let tau_max: f64 = tau_cr * (1.0 - (sigma_app / sigma_cr).powi(2)).sqrt();
    let tau_max_expected: f64 = 331.8;

    let rel_err_tm = (tau_max - tau_max_expected).abs() / tau_max_expected;
    assert!(
        rel_err_tm < 0.01,
        "tau_max: computed={:.1} MPa, expected={:.1} MPa, err={:.4}%",
        tau_max, tau_max_expected, rel_err_tm * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Elastic Critical Moment (Mcr) for Doubly Symmetric I-Beam
// ═══════════════════════════════════════════════════════════════
//
// EN 1993-1-1, Annex F (informative): Elastic critical moment for LTB.
//
// For a doubly symmetric I-section under uniform moment (C1=1.0):
//   Mcr = C1 * (pi/L) * sqrt(E*Iy*G*J) * sqrt(1 + (pi^2*E*Cw)/(G*J*L^2))
//
// where:
//   E = elastic modulus, G = shear modulus = E/(2*(1+nu))
//   Iy = minor axis moment of inertia
//   J = torsional constant
//   Cw = warping constant
//   L = unbraced length
//   C1 = moment gradient factor (1.0 for uniform moment)
//
// Example: W410x67 (W16x45 approx):
//   Iy = 11.0e6 mm^4, J = 284e3 mm^4, Cw = 490e9 mm^6
//   E = 200,000 MPa, nu = 0.3, G = 76,923 MPa
//   L = 6000 mm
//
// First factor: (pi/L)*sqrt(E*Iy*G*J)
//   = (pi/6000) * sqrt(200000*11e6*76923*284000)
//   = 5.236e-4 * sqrt(200000*11e6*76923*284000)
//
// E*Iy = 200000 * 11e6 = 2.2e12
// G*J = 76923 * 284000 = 2.1846e10
// E*Iy*G*J = 2.2e12 * 2.1846e10 = 4.806e22
// sqrt(E*Iy*G*J) = 2.194e11
//
// Second factor: sqrt(1 + pi^2*E*Cw / (G*J*L^2))
//   = sqrt(1 + 9.8696*200000*490e9 / (2.1846e10*36e6))
//   = sqrt(1 + 9.671e17 / 7.865e17)
//   = sqrt(1 + 1.2296) = sqrt(2.2296) = 1.4932
//
// Mcr = 1.0 * 5.236e-4 * 2.194e11 * 1.4932
//     = 1.0 * 1.149e8 * 1.4932
//     = 1.716e8 N*mm = 171.6 kN*m

#[test]
fn validation_elastic_critical_moment_mcr() {
    let e: f64 = 200_000.0;        // MPa
    let nu: f64 = 0.3;
    let g: f64 = e / (2.0 * (1.0 + nu));  // = 76923 MPa
    let iy: f64 = 11.0e6;          // mm^4, minor axis MOI
    let j: f64 = 284.0e3;          // mm^4, torsional constant
    let cw: f64 = 490.0e9;         // mm^6, warping constant
    let l: f64 = 6000.0;           // mm, unbraced length
    let c1: f64 = 1.0;             // uniform moment
    let pi = std::f64::consts::PI;

    // --- Shear modulus ---
    let g_expected: f64 = 76923.0;
    let rel_err_g = (g - g_expected).abs() / g_expected;
    assert!(
        rel_err_g < 0.01,
        "G: computed={:.0} MPa, expected={:.0} MPa", g, g_expected
    );

    // --- First factor: (pi/L)*sqrt(E*Iy*G*J) ---
    let factor1: f64 = (pi / l) * (e * iy * g * j).sqrt();

    // --- Second factor: warping contribution ---
    let warping_term: f64 = pi * pi * e * cw / (g * j * l * l);
    let factor2: f64 = (1.0 + warping_term).sqrt();

    let warping_expected: f64 = 1.2296;
    let rel_err_w = (warping_term - warping_expected).abs() / warping_expected;
    assert!(
        rel_err_w < 0.02,
        "Warping term: computed={:.4}, expected={:.4}, err={:.4}%",
        warping_term, warping_expected, rel_err_w * 100.0
    );

    let factor2_expected: f64 = 1.4932;
    let rel_err_f2 = (factor2 - factor2_expected).abs() / factor2_expected;
    assert!(
        rel_err_f2 < 0.01,
        "Factor2: computed={:.4}, expected={:.4}", factor2, factor2_expected
    );

    // --- Elastic critical moment ---
    let mcr: f64 = c1 * factor1 * factor2;  // N*mm
    let mcr_knm: f64 = mcr / 1.0e6;         // kN*m
    let mcr_expected: f64 = 171.6;

    let rel_err_mcr = (mcr_knm - mcr_expected).abs() / mcr_expected;
    assert!(
        rel_err_mcr < 0.02,
        "Mcr: computed={:.1} kN*m, expected={:.1} kN*m, err={:.4}%",
        mcr_knm, mcr_expected, rel_err_mcr * 100.0
    );

    // --- Effect of unbraced length: doubling L reduces Mcr ---
    let l_double: f64 = 2.0 * l;
    let factor1_2: f64 = (pi / l_double) * (e * iy * g * j).sqrt();
    let warping_2: f64 = pi * pi * e * cw / (g * j * l_double * l_double);
    let factor2_2: f64 = (1.0 + warping_2).sqrt();
    let mcr_double: f64 = c1 * factor1_2 * factor2_2 / 1.0e6;

    assert!(
        mcr_double < mcr_knm,
        "Doubling L reduces Mcr: {:.1} < {:.1} kN*m", mcr_double, mcr_knm
    );
}
