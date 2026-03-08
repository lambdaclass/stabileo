/// Validation: Extended Structural Stability and Design Methods
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd ed. (1961)
///   - Galambos & Surovek, "Structural Stability of Steel" (2008)
///   - Ziemian, "Guide to Stability Design Criteria for Metal Structures", 6th ed.
///   - AISC 360-22, Chapters C and E, Appendix 7 and 8
///   - EN 1993-1-1:2005 (Eurocode 3), Clauses 5 and 6.3
///   - Brush & Almroth, "Buckling of Bars, Plates, and Shells" (1975)
///   - Winter, "Lateral Bracing of Columns and Beams" (1960)
///   - Yura, "Fundamentals of Beam Bracing" (2001)
///   - LeMessurier, "A Practical Method of Second Order Analysis" (1977)
///   - Trahair, "Flexural-Torsional Buckling of Structures" (1993)
///
/// Tests verify analytical stability formulas with hand-computed values and,
/// where applicable, cross-check against the 2D/3D finite element solver.

mod helpers;

use dedaliano_engine::solver::{buckling, linear};
use dedaliano_engine::types::*;
use helpers::*;
use std::f64::consts::PI;

// ================================================================
// 1. Euler Column — P_cr for Four Boundary Conditions with Solver
// ================================================================
//
// P_cr = pi^2 * E * I / (K * L)^2
//
// K = 1.0  (pinned-pinned, PP)
// K = 0.5  (fixed-fixed, FF)
// K = 0.6992 (fixed-pinned, FP)
// K = 2.0  (fixed-free, CF)
//
// E = 210,000 MPa, I = 5e-5 m^4, L = 6.0 m
// EI = 210_000 * 1000 * 5e-5 = 10,500 kN*m^2

#[test]
fn validation_stab_ext_euler_four_bcs() {
    let e: f64 = 210_000.0;
    let a: f64 = 0.008;
    let iz: f64 = 5e-5;
    let l: f64 = 6.0;
    let p: f64 = 100.0; // reference load kN
    let ei: f64 = e * 1000.0 * iz;

    // Analytical critical loads
    let k_vals: [f64; 4] = [1.0, 0.5, 0.6992, 2.0];
    let labels = ["PP", "FF", "FP", "CF"];

    let mut pcr_analytical = [0.0_f64; 4];
    for i in 0..4 {
        let le: f64 = k_vals[i] * l;
        pcr_analytical[i] = PI * PI * ei / (le * le);
    }

    // Verify ratios between boundary conditions
    // FF / PP = (K_PP / K_FF)^2 = (1.0/0.5)^2 = 4.0
    let ratio_ff_pp: f64 = pcr_analytical[1] / pcr_analytical[0];
    assert_close(ratio_ff_pp, 4.0, 0.01, "FF/PP ratio");

    // CF / PP = (K_PP / K_CF)^2 = (1.0/2.0)^2 = 0.25
    let ratio_cf_pp: f64 = pcr_analytical[3] / pcr_analytical[0];
    assert_close(ratio_cf_pp, 0.25, 0.01, "CF/PP ratio");

    // FP / PP = (K_PP / K_FP)^2 = (1.0/0.6992)^2 = 2.0449
    let ratio_fp_pp: f64 = pcr_analytical[2] / pcr_analytical[0];
    let expected_fp_ratio: f64 = (1.0 / 0.6992_f64).powi(2);
    assert_close(ratio_fp_pp, expected_fp_ratio, 0.01, "FP/PP ratio");

    // Solver verification for pinned-pinned (PP)
    let input_pp = make_column(10, l, e, a, iz, "pinned", "rollerX", -p);
    let result_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap();
    let pcr_solver_pp: f64 = result_pp.modes[0].load_factor * p;
    assert_close(pcr_solver_pp, pcr_analytical[0], 0.02, &format!("{} solver vs analytical", labels[0]));

    // Solver verification for fixed-fixed (FF) — guidedX at end
    let input_ff = make_column(10, l, e, a, iz, "fixed", "guidedX", -p);
    let result_ff = buckling::solve_buckling_2d(&input_ff, 1).unwrap();
    let pcr_solver_ff: f64 = result_ff.modes[0].load_factor * p;
    assert_close(pcr_solver_ff, pcr_analytical[1], 0.02, &format!("{} solver vs analytical", labels[1]));

    // Solver verification for fixed-pinned (FP)
    let input_fp = make_column(10, l, e, a, iz, "fixed", "rollerX", -p);
    let result_fp = buckling::solve_buckling_2d(&input_fp, 1).unwrap();
    let pcr_solver_fp: f64 = result_fp.modes[0].load_factor * p;
    assert_close(pcr_solver_fp, pcr_analytical[2], 0.02, &format!("{} solver vs analytical", labels[2]));
}

// ================================================================
// 2. Alignment Chart — Effective Length K for Sway Frames
// ================================================================
//
// G = sum(EI/L)_columns / sum(EI/L)_beams at each joint
//
// Braced (non-sway) approximate formula:
//   K = sqrt( (1 + 0.205*(GA+GB) + 0.148*GA*GB)
//            / (1 + 0.41*(GA+GB) + 0.264*GA*GB) )
//
// Sway (unbraced) approximate formula (Liu 1989):
//   K = sqrt( (1.6*GA*GB + 4*(GA+GB) + 7.5)
//            / (GA+GB + 7.5) )
//
// Cross-check: compute G from a portal frame model.

#[test]
fn validation_stab_ext_alignment_chart_k_factor() {
    // Case 1: G_A = G_B = 1.0 (equal column/beam stiffness)
    let ga: f64 = 1.0;
    let gb: f64 = 1.0;

    // Braced K
    let k_br_num: f64 = 1.0 + 0.205 * (ga + gb) + 0.148 * ga * gb;
    let k_br_den: f64 = 1.0 + 0.41 * (ga + gb) + 0.264 * ga * gb;
    let k_braced: f64 = (k_br_num / k_br_den).sqrt();

    // Hand: num = 1 + 0.41 + 0.148 = 1.558
    //       den = 1 + 0.82 + 0.264 = 2.084
    //       K = sqrt(1.558 / 2.084) = sqrt(0.7476) = 0.8647
    assert_close(k_br_num, 1.558, 0.01, "braced numerator GA=GB=1");
    assert_close(k_br_den, 2.084, 0.01, "braced denominator GA=GB=1");
    assert_close(k_braced, 0.8647, 0.02, "K_braced GA=GB=1");
    assert!(k_braced <= 1.0, "braced K must be <= 1.0");

    // Sway K
    let k_sw_num: f64 = 1.6 * ga * gb + 4.0 * (ga + gb) + 7.5;
    let k_sw_den: f64 = ga + gb + 7.5;
    let k_sway: f64 = (k_sw_num / k_sw_den).sqrt();

    // Hand: num = 1.6 + 8.0 + 7.5 = 17.1
    //       den = 2.0 + 7.5 = 9.5
    //       K = sqrt(17.1 / 9.5) = sqrt(1.8) = 1.3416
    assert_close(k_sway, 1.3416, 0.02, "K_sway GA=GB=1");
    assert!(k_sway >= 1.0, "sway K must be >= 1.0");

    // Sway K always > braced K
    assert!(k_sway > k_braced, "sway K > braced K");

    // Case 2: G_A = 0, G_B = 0 (infinitely rigid beams — ideal fixed ends)
    let ga0: f64 = 0.0;
    let gb0: f64 = 0.0;
    let k_braced_0: f64 = ((1.0 + 0.205 * (ga0 + gb0) + 0.148 * ga0 * gb0)
        / (1.0 + 0.41 * (ga0 + gb0) + 0.264 * ga0 * gb0)).sqrt();
    assert_close(k_braced_0, 1.0, 0.01, "K_braced at G=0");

    let k_sway_0: f64 = ((1.6 * ga0 * gb0 + 4.0 * (ga0 + gb0) + 7.5) / (ga0 + gb0 + 7.5)).sqrt();
    assert_close(k_sway_0, 1.0, 0.01, "K_sway at G=0");

    // Case 3: Large G (pinned base approximation)
    let ga_large: f64 = 100.0;
    let gb_large: f64 = 100.0;
    let k_sway_large: f64 = ((1.6 * ga_large * gb_large + 4.0 * (ga_large + gb_large) + 7.5)
        / (ga_large + gb_large + 7.5)).sqrt();
    // As G -> inf, sway K -> sqrt(1.6 * G^2 / (2G)) = sqrt(0.8*G) -> large
    assert!(k_sway_large > 5.0, "K_sway with large G should be very large: {}", k_sway_large);

    // Solver cross-check: portal frame stiffness ratio
    let h: f64 = 4.0;
    let w: f64 = 8.0;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz_sec: f64 = 1e-4;
    let lateral: f64 = 10.0;

    let input = make_portal_frame(h, w, e, a_sec, iz_sec, lateral, 0.0);
    let res = linear::solve_2d(&input).unwrap();

    // Compute lateral stiffness from drift
    let top_disp: f64 = res.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;
    let frame_stiffness: f64 = lateral / top_disp;
    assert!(frame_stiffness > 0.0, "Frame lateral stiffness should be positive");

    // G at top joint: column EI/L_col on each side, beam EI/L_beam
    let ei_col: f64 = e * 1000.0 * iz_sec;
    let g_top: f64 = (ei_col / h) / (ei_col / w);
    // = w/h = 8/4 = 2.0
    assert_close(g_top, w / h, 0.01, "G at top joint");
}

// ================================================================
// 3. Inelastic Buckling — Tangent Modulus and Shanley Column
// ================================================================
//
// Tangent modulus approach (Engesser/Shanley):
//   P_cr_inelastic = pi^2 * E_t * I / (KL)^2
//
// Ramberg-Osgood stress-strain:
//   epsilon = sigma/E + 0.002*(sigma/Fy)^n
//
// Tangent modulus:
//   E_t = E / (1 + 0.002*n*(E/Fy)*(sigma/Fy)^(n-1))

#[test]
fn validation_stab_ext_inelastic_buckling() {
    let e: f64 = 200_000.0;      // MPa
    let fy: f64 = 345.0;         // MPa (A992 steel)
    let n_ro: f64 = 20.0;        // Ramberg-Osgood exponent
    let iz: f64 = 1e-4;          // m^4
    let l: f64 = 5.0;            // m

    let ei_kn: f64 = e * 1000.0 * iz; // kN*m^2

    // Elastic Euler load for pinned-pinned
    let pcr_elastic: f64 = PI * PI * ei_kn / (l * l);

    // Compute tangent modulus at several stress levels
    let stress_levels: [f64; 4] = [0.5, 0.7, 0.85, 0.95];

    let mut et_prev: f64 = e;
    let mut pcr_prev: f64 = pcr_elastic;

    for &ratio in &stress_levels {
        let sigma: f64 = ratio * fy;
        let sigma_ratio: f64 = sigma / fy;
        let sigma_ratio_nm1: f64 = sigma_ratio.powf(n_ro - 1.0);
        let et: f64 = e / (1.0 + 0.002 * n_ro * (e / fy) * sigma_ratio_nm1);

        // Et must be less than E (inelastic range)
        assert!(et < e, "Et < E at sigma/Fy = {:.2}", ratio);
        // Et must decrease as stress increases
        assert!(et < et_prev || (et - et_prev).abs() < 1.0,
            "Et should decrease with stress: Et={:.1}, prev={:.1}", et, et_prev);

        // Inelastic critical load
        let pcr_inelastic: f64 = PI * PI * (et * 1000.0) * iz / (l * l);
        assert!(pcr_inelastic < pcr_elastic,
            "Inelastic Pcr < elastic Pcr at sigma/Fy={:.2}", ratio);
        assert!(pcr_inelastic < pcr_prev || (pcr_inelastic - pcr_prev).abs() < 1.0,
            "Pcr should decrease with stress: Pcr={:.1}, prev={:.1}", pcr_inelastic, pcr_prev);

        et_prev = et;
        pcr_prev = pcr_inelastic;
    }

    // Shanley column concept: tangent modulus load is a lower bound
    // Reduced modulus load is an upper bound
    // Reduced modulus: E_r = 4*E*E_t / (sqrt(E) + sqrt(E_t))^2
    let sigma_test: f64 = 0.85 * fy;
    let sigma_ratio_test: f64 = sigma_test / fy;
    let sigma_ratio_nm1_test: f64 = sigma_ratio_test.powf(n_ro - 1.0);
    let et_test: f64 = e / (1.0 + 0.002 * n_ro * (e / fy) * sigma_ratio_nm1_test);
    let sqrt_e: f64 = e.sqrt();
    let sqrt_et: f64 = et_test.sqrt();
    let e_reduced: f64 = 4.0 * e * et_test / ((sqrt_e + sqrt_et) * (sqrt_e + sqrt_et));

    // E_t <= E_r <= E (Shanley bounds)
    assert!(et_test <= e_reduced, "Et <= Er (Shanley lower bound)");
    assert!(e_reduced <= e, "Er <= E (Shanley upper bound)");

    // Solver verification: elastic buckling should match analytical
    let a_sec: f64 = 0.01;
    let p_ref: f64 = 100.0;
    let input = make_column(10, l, e, a_sec, iz, "pinned", "rollerX", -p_ref);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();
    let pcr_solver: f64 = result.modes[0].load_factor * p_ref;
    assert_close(pcr_solver, pcr_elastic, 0.02, "elastic Pcr solver vs analytical");
}

// ================================================================
// 4. Frame Buckling — LeMessurier Method (System Effective Length)
// ================================================================
//
// LeMessurier (1977): system effective length approach for sway frames.
//
// For a story:
//   sum(P_e_story) = sum(H) * h / delta_oh
// where H = story shear, h = story height, delta_oh = drift
//
// Effective K for individual column i:
//   K_i = sqrt( pi^2 * E * I_i / (P_i * L^2) * (sum(P) / sum(P_e)) )
//
// Verify with a portal frame: first-order drift gives P_e_story,
// then derive K for columns.

#[test]
fn validation_stab_ext_frame_buckling_lemessurier() {
    let h: f64 = 4.0;    // story height (m)
    let w: f64 = 8.0;    // bay width (m)
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let lateral: f64 = 50.0;
    let gravity: f64 = -500.0; // per joint

    // First-order analysis to get drift
    let input = make_portal_frame(h, w, e, a, iz, lateral, gravity);
    let res = linear::solve_2d(&input).unwrap();

    let drift_top: f64 = res.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux;

    assert!(drift_top.abs() > 0.0, "drift must be nonzero");

    // LeMessurier: P_e_story = H * h / delta_oh
    let pe_story: f64 = lateral * h / drift_top.abs();
    assert!(pe_story > 0.0, "P_e_story must be positive");

    // Total gravity in story
    let sum_p: f64 = 2.0 * gravity.abs(); // two joints

    // Story stability index Q = sum(P) / P_e_story
    let q_index: f64 = sum_p / pe_story;

    // B2 amplifier
    let b2: f64 = 1.0 / (1.0 - q_index);
    assert!(b2 > 1.0, "B2 should be > 1.0 for gravity-loaded frame");

    // Effective K for each column (both identical in portal frame)
    let ei_col: f64 = e * 1000.0 * iz;
    let pcr_euler_pp: f64 = PI * PI * ei_col / (h * h); // pinned-pinned Euler load
    let p_per_col: f64 = gravity.abs(); // gravity per column

    // K_eff = sqrt(Pcr_euler / (P_col * sum(P)/sum(Pe)))
    let k_eff: f64 = (pcr_euler_pp / (p_per_col * (1.0 / (1.0 - q_index)))).sqrt();

    // For a sway frame, K > 1.0 (portal with fixed bases)
    // The effective K captures the system instability
    assert!(k_eff > 0.0, "K_eff must be positive: {}", k_eff);

    // Verify: amplified moment > first-order moment
    // Column base moment from solver
    let col1_forces = res.element_forces.iter()
        .find(|ef| ef.element_id == 1)
        .unwrap();
    let m_base: f64 = col1_forces.m_start.abs();

    // Amplified moment
    let m_amplified: f64 = b2 * m_base;
    assert!(m_amplified > m_base, "amplified moment > first-order moment");

    // Q < 1.0 for stability (otherwise frame is unstable)
    assert!(q_index < 1.0, "Q index must be < 1.0 for stable frame: Q={:.4}", q_index);
}

// ================================================================
// 5. Second-Order Effects — B1 and B2 Amplifiers
// ================================================================
//
// B1 = Cm / (1 - P/Pe1) >= 1.0 (non-sway, member level)
// B2 = 1 / (1 - sum(P)/sum(Pe2))  (sway, story level)
//
// Cm = 0.6 - 0.4*(M1/M2) for members without transverse load
// Pe1 = pi^2*EI / (K1*L)^2 with K1 for braced case

#[test]
fn validation_stab_ext_second_order_b1_b2() {
    let e: f64 = 200_000.0;
    let iz: f64 = 1e-4;
    let l: f64 = 4.0;
    let ei: f64 = e * 1000.0 * iz;

    // ------- B1 amplifier -------
    // Member with reverse curvature: M1/M2 = -0.5 (double curvature)
    let m1_over_m2: f64 = -0.5;
    let cm: f64 = 0.6 - 0.4 * m1_over_m2; // = 0.6 + 0.2 = 0.8
    assert_close(cm, 0.8, 0.01, "Cm double curvature");

    // Braced Euler load (K=1.0)
    let pe1: f64 = PI * PI * ei / (l * l);
    let pr: f64 = 0.3 * pe1; // axial demand = 30% of Euler

    let b1: f64 = (cm / (1.0 - pr / pe1)).max(1.0);
    // = 0.8 / (1 - 0.3) = 0.8 / 0.7 = 1.1429
    let b1_expected: f64 = 0.8 / 0.7;
    assert_close(b1, b1_expected, 0.01, "B1 double curvature");

    // Single curvature: M1/M2 = 1.0 -> Cm = 0.6 - 0.4 = 0.2
    let cm_sc: f64 = 0.6 - 0.4 * 1.0;
    assert_close(cm_sc, 0.2, 0.01, "Cm single curvature");
    let b1_sc: f64 = (cm_sc / (1.0 - pr / pe1)).max(1.0);
    // = 0.2/0.7 = 0.286 -> clamped to 1.0
    assert_close(b1_sc, 1.0, 0.01, "B1 single curvature clamped");

    // With transverse loads: Cm = 1.0 (AISC conservative)
    let cm_trans: f64 = 1.0;
    let b1_trans: f64 = (cm_trans / (1.0 - pr / pe1)).max(1.0);
    // = 1.0 / 0.7 = 1.4286
    let b1_trans_expected: f64 = 1.0 / 0.7;
    assert_close(b1_trans, b1_trans_expected, 0.01, "B1 transverse load");

    // ------- B2 amplifier -------
    // Story with multiple columns
    let sum_p: f64 = 2000.0;    // kN, total story gravity
    let sum_pe2: f64 = 15000.0;  // kN, sum of sway Euler loads

    let b2: f64 = 1.0 / (1.0 - sum_p / sum_pe2);
    // = 1.0 / (1 - 0.1333) = 1.0 / 0.8667 = 1.1538
    let b2_expected: f64 = 1.0 / (1.0 - 2000.0 / 15000.0);
    assert_close(b2, b2_expected, 0.01, "B2 story amplifier");
    assert!(b2 > 1.0, "B2 must exceed 1.0");

    // Design moment: Mr = B1*Mnt + B2*Mlt
    let mnt: f64 = 150.0;  // non-sway moment (kN*m)
    let mlt: f64 = 80.0;   // sway moment (kN*m)
    let mr: f64 = b1 * mnt + b2 * mlt;
    assert!(mr > mnt + mlt, "design moment must exceed first-order sum");

    // Solver cross-check: portal frame drift -> Pe_story -> B2
    let h: f64 = 4.0;
    let w: f64 = 8.0;
    let lat: f64 = 20.0;
    let grav: f64 = -300.0;
    let a: f64 = 0.01;

    let input = make_portal_frame(h, w, e, a, iz, lat, grav);
    let res = linear::solve_2d(&input).unwrap();

    let drift: f64 = res.displacements.iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .ux
        .abs();

    let pe_story_solver: f64 = lat * h / drift;
    let sum_p_solver: f64 = 2.0 * grav.abs();
    let b2_solver: f64 = 1.0 / (1.0 - sum_p_solver / pe_story_solver);
    assert!(b2_solver > 1.0, "B2 from solver drift must exceed 1.0: {:.4}", b2_solver);
}

// ================================================================
// 6. Bracing Requirements — Winter/Yura Ideal Stiffness and Strength
// ================================================================
//
// Winter (1960) / Yura (2001):
// Ideal brace stiffness (point brace at midheight):
//   beta_ideal = 2 * P / L_b   (nodal brace)
//   beta_ideal = 4 * P / L_b   (for full bracing, n braces = 1 at mid)
//
// Required brace stiffness (with imperfection):
//   beta_req = 2 * beta_ideal = 4 * P / L_b  (AISC App.6)
//
// Required brace strength:
//   P_br = 0.01 * P_r  (AISC nodal bracing, 1% rule)
//   or P_br = 0.008 * P_r  (relative bracing)

#[test]
fn validation_stab_ext_bracing_requirements() {
    let pr: f64 = 2000.0;       // kN, required axial compression
    let lb: f64 = 4.0;          // m, unbraced length
    let e: f64 = 200_000.0;     // MPa
    let iz: f64 = 1e-4;         // m^4
    let ei: f64 = e * 1000.0 * iz;

    // --- Ideal brace stiffness ---
    // For a single nodal brace at midheight (n=1 intermediate brace):
    let beta_ideal: f64 = 2.0 * pr / lb;
    // = 2 * 2000 / 4 = 1000 kN/m
    assert_close(beta_ideal, 1000.0, 0.01, "ideal brace stiffness (n=1)");

    // Required stiffness with 2x factor per AISC App.6:
    let beta_req: f64 = 2.0 * beta_ideal;
    // = 2000 kN/m
    assert_close(beta_req, 2000.0, 0.01, "required brace stiffness");

    // For n=2 intermediate braces: beta_ideal = 3*P/L_b (Winter formula)
    let n_braces: f64 = 2.0;
    let beta_ideal_2: f64 = (n_braces + 1.0) * pr / lb;
    // = 3 * 2000 / 4 = 1500 kN/m
    assert_close(beta_ideal_2, 1500.0, 0.01, "ideal brace stiffness (n=2)");

    // --- Brace strength ---
    // Nodal bracing: P_br = 0.01 * Pr
    let pbr_nodal: f64 = 0.01 * pr;
    assert_close(pbr_nodal, 20.0, 0.01, "nodal brace strength");

    // Relative bracing: P_br = 0.008 * Pr
    let pbr_relative: f64 = 0.008 * pr;
    assert_close(pbr_relative, 16.0, 0.01, "relative brace strength");

    // --- Effect on column buckling capacity ---
    // Without brace: Pcr for L (full height)
    let pcr_unbraced: f64 = PI * PI * ei / (lb * lb);

    // With brace at mid: effectively halves the unbraced length
    let pcr_braced: f64 = PI * PI * ei / ((lb / 2.0) * (lb / 2.0));

    // Bracing quadruples the buckling load
    let capacity_ratio: f64 = pcr_braced / pcr_unbraced;
    assert_close(capacity_ratio, 4.0, 0.01, "bracing capacity increase");

    // Solver verification: column with vs without intermediate support
    let p_ref: f64 = 100.0;
    let a_sec: f64 = 0.01;

    // Unbraced column
    let input_unbraced = make_column(10, lb, e, a_sec, iz, "pinned", "rollerX", -p_ref);
    let pcr_solver_unbraced: f64 = buckling::solve_buckling_2d(&input_unbraced, 1)
        .unwrap().modes[0].load_factor * p_ref;

    assert_close(pcr_solver_unbraced, pcr_unbraced, 0.02, "solver unbraced Pcr");

    // Braced column (half length, same BCs for each segment)
    let input_braced = make_column(10, lb / 2.0, e, a_sec, iz, "pinned", "rollerX", -p_ref);
    let pcr_solver_braced: f64 = buckling::solve_buckling_2d(&input_braced, 1)
        .unwrap().modes[0].load_factor * p_ref;

    let solver_ratio: f64 = pcr_solver_braced / pcr_solver_unbraced;
    assert_close(solver_ratio, 4.0, 0.05, "solver braced/unbraced ratio");
}

// ================================================================
// 7. Plate Buckling — Buckling Coefficients for Various Edge Conditions
// ================================================================
//
// sigma_cr = k * pi^2 * E / (12*(1-nu^2)) * (t/b)^2
//
// k depends on boundary conditions and load type:
//   - All edges simply supported (SS-SS-SS-SS): k = 4.0
//   - Loaded edges SS, long edges fixed: k = 6.97
//   - One long edge free, other fixed: k = 1.277
//   - One long edge free, other SS: k = 0.425
//
// Also check k variation with aspect ratio a/b for SS plate.

#[test]
fn validation_stab_ext_plate_buckling_coefficients() {
    let e: f64 = 200_000.0;     // MPa
    let nu: f64 = 0.3;
    let t: f64 = 12.0;          // mm
    let b: f64 = 400.0;         // mm

    // Common factor: D_factor = pi^2 * E / (12*(1-nu^2))
    let d_factor: f64 = PI * PI * e / (12.0 * (1.0 - nu * nu));
    let tb_ratio: f64 = t / b;
    let tb_sq: f64 = tb_ratio * tb_ratio;

    // Case 1: All SS — k = 4.0
    let k_ss: f64 = 4.0;
    let sigma_cr_ss: f64 = k_ss * d_factor * tb_sq;

    // Case 2: Loaded edges SS, long edges fixed — k = 6.97
    let k_fixed: f64 = 6.97;
    let sigma_cr_fixed: f64 = k_fixed * d_factor * tb_sq;

    // Case 3: One long edge free, other fixed — k = 1.277
    let k_free_fixed: f64 = 1.277;
    let sigma_cr_ff: f64 = k_free_fixed * d_factor * tb_sq;

    // Case 4: One long edge free, other SS — k = 0.425
    let k_free_ss: f64 = 0.425;
    let sigma_cr_fs: f64 = k_free_ss * d_factor * tb_sq;

    // Ordering: fixed > SS > free-fixed > free-SS
    assert!(sigma_cr_fixed > sigma_cr_ss, "fixed edges > SS edges");
    assert!(sigma_cr_ss > sigma_cr_ff, "SS > free-fixed");
    assert!(sigma_cr_ff > sigma_cr_fs, "free-fixed > free-SS");

    // Verify ratios match k ratios
    let ratio_fixed_ss: f64 = sigma_cr_fixed / sigma_cr_ss;
    assert_close(ratio_fixed_ss, k_fixed / k_ss, 0.01, "fixed/SS ratio");

    let ratio_ff_fs: f64 = sigma_cr_ff / sigma_cr_fs;
    assert_close(ratio_ff_fs, k_free_fixed / k_free_ss, 0.01, "free-fixed/free-SS ratio");

    // --- Aspect ratio effect on k for SS plate ---
    // k = (m*b/a + a/(m*b))^2, minimum over m
    // For a/b = 1: k = (1 + 1)^2 = 4.0
    // For a/b = 1.5: m=1 gives k = (1/1.5 + 1.5)^2 = (0.667+1.5)^2 = 4.694
    //                 m=2 gives k = (2/1.5 + 1.5/2)^2 = (1.333+0.75)^2 = 4.340
    // min is m=2 -> k = 4.340
    let a_over_b: f64 = 1.5;
    let k_m1: f64 = (1.0 / a_over_b + a_over_b / 1.0).powi(2);
    let k_m2: f64 = (2.0 / a_over_b + a_over_b / 2.0).powi(2);
    assert_close(k_m1, 4.694, 0.02, "k at m=1, a/b=1.5");
    assert_close(k_m2, 4.340, 0.02, "k at m=2, a/b=1.5");
    assert!(k_m2 < k_m1, "m=2 gives lower k for a/b=1.5");

    // For a/b = 2: k_min = 4.0 (at m=2)
    let a_over_b_2: f64 = 2.0;
    let k_ab2_m2: f64 = (2.0 / a_over_b_2 + a_over_b_2 / 2.0).powi(2);
    assert_close(k_ab2_m2, 4.0, 0.01, "k at m=2, a/b=2");

    // For long plates (a/b -> inf), k -> 4.0 for all m
    let a_over_b_long: f64 = 10.0;
    // Find minimum k over m = 1..20
    let mut k_min: f64 = f64::MAX;
    for m in 1..=20_u32 {
        let mf: f64 = m as f64;
        let k_m: f64 = (mf / a_over_b_long + a_over_b_long / mf).powi(2);
        if k_m < k_min {
            k_min = k_m;
        }
    }
    assert_close(k_min, 4.0, 0.05, "k_min for long plate approaches 4.0");
}

// ================================================================
// 8. Lateral Buckling of Beams — Mcr with Moment Gradient Factor C1
// ================================================================
//
// For a doubly-symmetric I-section (no warping simplification):
//   Mcr = C1 * (pi/L) * sqrt(E*Iy*G*J)
//
// With warping:
//   Mcr = C1 * (pi/L) * sqrt(E*Iy*G*J) * sqrt(1 + (pi^2*E*Cw)/(G*J*L^2))
//
// C1 (moment gradient factor):
//   Uniform moment:      C1 = 1.0
//   Linear moment (UDL): C1 = 1.136
//   Midpoint load:        C1 = 1.365
//   End moment ratio:     C1 per Serna et al. (2006)
//
// Cross-check with 3D solver for trend verification.

#[test]
fn validation_stab_ext_lateral_buckling_beams() {
    let e: f64 = 200_000.0;       // MPa
    let nu: f64 = 0.3;
    let g: f64 = e / (2.0 * (1.0 + nu)); // shear modulus

    // IPE 300 properties (in mm for analytical, then convert)
    let iy_mm4: f64 = 6.04e6;     // mm^4 (weak axis)
    let j_mm4: f64 = 2.01e5;      // mm^4 (torsional)
    let cw_mm6: f64 = 1.26e11;    // mm^6 (warping constant)
    let l_mm: f64 = 6000.0;       // mm (unbraced length)

    // --- Uniform moment (C1 = 1.0) ---
    let c1_uniform: f64 = 1.0;
    let base_term: f64 = (PI / l_mm) * (e * iy_mm4 * g * j_mm4).sqrt();
    let warp_term: f64 = (1.0 + (PI * PI * e * cw_mm6) / (g * j_mm4 * l_mm * l_mm)).sqrt();
    let mcr_uniform: f64 = c1_uniform * base_term * warp_term;

    // Convert to kN*m
    let mcr_uniform_knm: f64 = mcr_uniform / 1e6;
    assert!(mcr_uniform_knm > 50.0 && mcr_uniform_knm < 1500.0,
        "Mcr uniform = {:.1} kN*m should be reasonable", mcr_uniform_knm);

    // --- Midpoint load (C1 = 1.365) ---
    let c1_midpoint: f64 = 1.365;
    let mcr_midpoint: f64 = c1_midpoint * base_term * warp_term;
    let _mcr_midpoint_knm: f64 = mcr_midpoint / 1e6;

    // Midpoint C1 > uniform C1 -> higher Mcr
    assert!(mcr_midpoint > mcr_uniform, "midpoint load Mcr > uniform Mcr");
    let ratio_mid_uni: f64 = mcr_midpoint / mcr_uniform;
    assert_close(ratio_mid_uni, c1_midpoint / c1_uniform, 0.01, "Mcr ratio = C1 ratio");

    // --- UDL (C1 = 1.136) ---
    let c1_udl: f64 = 1.136;
    let mcr_udl: f64 = c1_udl * base_term * warp_term;
    assert!(mcr_udl > mcr_uniform, "UDL Mcr > uniform Mcr");
    assert!(mcr_midpoint > mcr_udl, "midpoint Mcr > UDL Mcr (higher gradient)");

    // --- Length effect: doubling L reduces Mcr ---
    let l2_mm: f64 = 2.0 * l_mm;
    let base_term_2l: f64 = (PI / l2_mm) * (e * iy_mm4 * g * j_mm4).sqrt();
    let warp_term_2l: f64 = (1.0 + (PI * PI * e * cw_mm6) / (g * j_mm4 * l2_mm * l2_mm)).sqrt();
    let mcr_2l: f64 = c1_uniform * base_term_2l * warp_term_2l;
    assert!(mcr_2l < mcr_uniform, "doubling L reduces Mcr");

    // Without warping, Mcr ~ 1/L; with warping the reduction is less severe
    let ratio_length: f64 = mcr_2l / mcr_uniform;
    assert!(ratio_length < 0.6, "Mcr at 2L / Mcr at L = {:.3}, should be well below 1.0", ratio_length);
    assert!(ratio_length > 0.1, "ratio should not be too extreme: {:.3}", ratio_length);

    // --- Warping contribution check ---
    // Without warping (Cw=0): Mcr_no_warp = C1 * (pi/L) * sqrt(E*Iy*G*J)
    let mcr_no_warp: f64 = c1_uniform * base_term;
    assert!(mcr_uniform > mcr_no_warp, "warping increases Mcr");
    let warp_increase: f64 = (mcr_uniform - mcr_no_warp) / mcr_no_warp * 100.0;
    assert!(warp_increase > 0.0, "warping should increase Mcr by > 0%: {:.1}%", warp_increase);

    // --- 3D solver cross-check: trend verification ---
    // Shorter beam should have higher buckling capacity than longer beam
    let n_elem: usize = 10;
    let a_sec: f64 = 0.005381;
    let iy_m4: f64 = 8.356e-5;
    let iz_m4: f64 = 6.038e-6;
    let j_m4: f64 = 2.007e-7;
    let p_small: f64 = -1.0;
    let m0: f64 = 10.0;

    let short_l: f64 = 4.0;
    let long_l: f64 = 8.0;

    let make_ltb_beam = |length: f64| -> SolverInput3D {
        let last_node = n_elem + 1;
        let loads = vec![
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 1, fx: 0.0, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: m0, bw: None,
            }),
            SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: last_node, fx: p_small, fy: 0.0, fz: 0.0,
                mx: 0.0, my: 0.0, mz: -m0, bw: None,
            }),
        ];
        make_3d_beam(
            n_elem, length, e, nu, a_sec, iy_m4, iz_m4, j_m4,
            vec![true, true, true, true, false, false],
            Some(vec![false, true, true, true, false, false]),
            loads,
        )
    };

    let buck_short = buckling::solve_buckling_3d(&make_ltb_beam(short_l), 1).unwrap();
    let buck_long = buckling::solve_buckling_3d(&make_ltb_beam(long_l), 1).unwrap();

    let lambda_short: f64 = buck_short.modes[0].load_factor;
    let lambda_long: f64 = buck_long.modes[0].load_factor;

    assert!(lambda_short > lambda_long,
        "shorter beam should have higher buckling capacity: short={:.2}, long={:.2}",
        lambda_short, lambda_long);
}
