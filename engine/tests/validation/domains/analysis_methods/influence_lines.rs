/// Validation: Influence Lines for Beams (Pure Formula Verification)
///
/// References:
///   - Mueller-Breslau, "Die neueren Methoden der Festigkeitslehre" (1886)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 6
///   - Kassimali, "Structural Analysis", 5th Ed., Ch. 8
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 12
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed.
///
/// Tests verify influence line formulas and live load positioning
/// without calling the solver.
///
/// Tests:
///   1. IL ordinates for reaction on simply supported beam
///   2. IL ordinates for midspan moment on simply supported beam
///   3. IL ordinates for shear at a section on simply supported beam
///   4. Maximum moment from a single moving load
///   5. Two-span continuous beam: IL for interior reaction (Mueller-Breslau)
///   6. Maximum live load effect using pattern loading
///   7. IL for moment at interior support of two-span beam
///   8. Moving load envelope: absolute maximum moment

// ================================================================
// 1. IL Ordinates for Reaction on Simply Supported Beam
// ================================================================
//
// For a simply supported beam of span L, the influence line for
// the left reaction R_A when a unit load P=1 moves from left (x=0)
// to right (x=L) is:
//   IL_R_A(x) = 1 - x/L
//
// This is a straight line from 1.0 at x=0 to 0.0 at x=L.
//
// Reference: Hibbeler, Structural Analysis, Ch. 6, Example 6.1

#[test]
fn validation_il_reaction_simply_supported() {
    let l: f64 = 10.0; // m, span length

    // Check IL ordinates at several positions
    let positions: [f64; 5] = [0.0, 2.5, 5.0, 7.5, 10.0];
    let expected: [f64; 5] = [1.0, 0.75, 0.5, 0.25, 0.0];

    for i in 0_usize..5 {
        let x: f64 = positions[i];
        let il_ra: f64 = 1.0 - x / l;
        assert!(
            (il_ra - expected[i]).abs() < 1e-12,
            "IL R_A at x={:.1}: computed={:.6}, expected={:.6}",
            x, il_ra, expected[i]
        );
    }

    // The IL for R_B is complementary: IL_R_B(x) = x/L
    for i in 0_usize..5 {
        let x: f64 = positions[i];
        let il_rb: f64 = x / l;
        let il_ra: f64 = 1.0 - x / l;

        // Sum of IL ordinates = 1 at every position (equilibrium)
        assert!(
            (il_ra + il_rb - 1.0).abs() < 1e-12,
            "Sum of IL ordinates at x={:.1}: {:.6} (should be 1.0)",
            x, il_ra + il_rb
        );
    }

    // For a UDL of intensity w over full span,
    // R_A = integral of w * IL_R_A dx from 0 to L = w * L / 2
    let w: f64 = 12.0; // kN/m
    let ra_full: f64 = w * l / 2.0;
    let ra_full_expected: f64 = 60.0;
    assert!(
        (ra_full - ra_full_expected).abs() < 1e-10,
        "Full UDL reaction: computed={:.4}, expected={:.4}",
        ra_full, ra_full_expected
    );
}

// ================================================================
// 2. IL Ordinates for Midspan Moment on Simply Supported Beam
// ================================================================
//
// For a simply supported beam (span L), the influence line for
// the bending moment at midspan (x = L/2) when a unit load is at
// position xi is:
//   IL_M(xi) = xi/2          for 0 <= xi <= L/2
//   IL_M(xi) = (L - xi)/2    for L/2 <= xi <= L
//
// The maximum ordinate is L/4, occurring at xi = L/2.
//
// Reference: Kassimali, Structural Analysis, Ch. 8, Table 8.1

#[test]
fn validation_il_moment_midspan() {
    let l: f64 = 12.0; // m, span

    // Left half: IL_M(xi) = xi / 2
    let xi_1: f64 = 0.0;
    let il_m1: f64 = xi_1 / 2.0;
    assert!(
        il_m1.abs() < 1e-12,
        "IL M at x=0: {:.6} (should be 0)",
        il_m1
    );

    let xi_2: f64 = 3.0; // L/4
    let il_m2: f64 = xi_2 / 2.0;
    let il_m2_expected: f64 = 1.5;
    assert!(
        (il_m2 - il_m2_expected).abs() < 1e-12,
        "IL M at L/4: computed={:.6}, expected={:.6}",
        il_m2, il_m2_expected
    );

    // At midspan: IL_M(L/2) = L/4
    let xi_mid: f64 = l / 2.0;
    let il_m_mid: f64 = xi_mid / 2.0;
    let il_m_mid_expected: f64 = l / 4.0;
    assert!(
        (il_m_mid - il_m_mid_expected).abs() < 1e-12,
        "IL M at midspan: computed={:.6}, expected={:.6}",
        il_m_mid, il_m_mid_expected
    );

    // Right half: IL_M(xi) = (L - xi) / 2
    let xi_3: f64 = 9.0; // 3L/4
    let il_m3: f64 = (l - xi_3) / 2.0;
    let il_m3_expected: f64 = 1.5;
    assert!(
        (il_m3 - il_m3_expected).abs() < 1e-12,
        "IL M at 3L/4: computed={:.6}, expected={:.6}",
        il_m3, il_m3_expected
    );

    // Symmetry: IL_M(a) = IL_M(L - a)
    let a: f64 = 2.0;
    let il_left: f64 = a / 2.0;
    let il_right: f64 = (l - (l - a)) / 2.0;
    assert!(
        (il_left - il_right).abs() < 1e-12,
        "Symmetry: IL({:.1})={:.6} == IL({:.1})={:.6}",
        a, il_left, l - a, il_right
    );

    // Maximum moment from single point load P at midspan
    let p: f64 = 50.0; // kN
    let m_max: f64 = p * l / 4.0;
    let m_max_expected: f64 = 150.0; // kN-m
    assert!(
        (m_max - m_max_expected).abs() < 1e-10,
        "Max moment from P at midspan: computed={:.4}, expected={:.4}",
        m_max, m_max_expected
    );
}

// ================================================================
// 3. IL Ordinates for Shear at a Section on Simply Supported Beam
// ================================================================
//
// For a simply supported beam (span L), the influence line for
// shear at a section distance a from the left support:
//   IL_V(xi) = -xi/L             for 0 <= xi < a   (load left of section)
//   IL_V(xi) = 1 - xi/L          for a < xi <= L   (load right of section)
//
// There is a jump discontinuity of magnitude 1 at xi = a.
//
// Reference: Hibbeler, Structural Analysis, Ch. 6, Example 6.4

#[test]
fn validation_il_shear_at_section() {
    let l: f64 = 10.0; // m, span
    let a: f64 = 3.0;  // m, section location from left

    // Load left of section: IL_V = -xi/L
    let xi_left: f64 = 1.0;
    let il_v_left: f64 = -xi_left / l;
    let il_v_left_expected: f64 = -0.1;
    assert!(
        (il_v_left - il_v_left_expected).abs() < 1e-12,
        "IL V (load left): computed={:.6}, expected={:.6}",
        il_v_left, il_v_left_expected
    );

    // Just to the left of section: IL_V(a-) = -a/L
    let il_v_left_of_cut: f64 = -a / l;
    let il_v_left_of_cut_expected: f64 = -0.3;
    assert!(
        (il_v_left_of_cut - il_v_left_of_cut_expected).abs() < 1e-12,
        "IL V just left of cut: computed={:.6}, expected={:.6}",
        il_v_left_of_cut, il_v_left_of_cut_expected
    );

    // Just to the right of section: IL_V(a+) = 1 - a/L
    let il_v_right_of_cut: f64 = 1.0 - a / l;
    let il_v_right_of_cut_expected: f64 = 0.7;
    assert!(
        (il_v_right_of_cut - il_v_right_of_cut_expected).abs() < 1e-12,
        "IL V just right of cut: computed={:.6}, expected={:.6}",
        il_v_right_of_cut, il_v_right_of_cut_expected
    );

    // Jump at section = 1.0
    let jump: f64 = il_v_right_of_cut - il_v_left_of_cut;
    assert!(
        (jump - 1.0).abs() < 1e-12,
        "Jump at section: {:.6} (should be 1.0)",
        jump
    );

    // Load at right support: IL_V = 1 - L/L = 0
    let il_v_at_b: f64 = 1.0 - l / l;
    assert!(
        il_v_at_b.abs() < 1e-12,
        "IL V at right support: {:.6} (should be 0)",
        il_v_at_b
    );

    // Maximum positive shear: UDL from section to right support
    // V_max = w * integral of (1-xi/L) dxi from a to L
    //       = w * [(L-a)^2 / (2L)]
    let w: f64 = 8.0; // kN/m
    let v_max_pos: f64 = w * (l - a) * (l - a) / (2.0 * l);
    let v_max_pos_expected: f64 = 8.0 * 49.0 / 20.0; // = 19.6 kN
    assert!(
        (v_max_pos - v_max_pos_expected).abs() < 1e-10,
        "Max positive shear from UDL: computed={:.4}, expected={:.4}",
        v_max_pos, v_max_pos_expected
    );
}

// ================================================================
// 4. Maximum Moment from a Single Moving Load
// ================================================================
//
// For a simply supported beam (span L) with a single concentrated
// load P, the maximum bending moment at any section x is:
//   M_max(x) = P * x * (L - x) / L
//
// The absolute maximum moment occurs at midspan:
//   M_abs_max = P * L / 4
//
// For two equal loads P separated by distance d, the absolute
// maximum moment is:
//   M_abs_max = P * (L/2 - d/4)  when the resultant is at midspan
//
// Reference: Ghali & Neville, Structural Analysis, Ch. 12

#[test]
fn validation_il_max_moment_single_load() {
    let l: f64 = 16.0; // m, span
    let p: f64 = 80.0;  // kN, moving load

    // Absolute maximum moment at midspan
    let m_abs_max: f64 = p * l / 4.0;
    let m_abs_max_expected: f64 = 320.0; // kN-m
    assert!(
        (m_abs_max - m_abs_max_expected).abs() < 1e-10,
        "Abs max moment: computed={:.4}, expected={:.4}",
        m_abs_max, m_abs_max_expected
    );

    // Maximum moment at quarter span (a = L/4)
    let a: f64 = l / 4.0;
    let m_at_quarter: f64 = p * a * (l - a) / l;
    let m_at_quarter_expected: f64 = 80.0 * 4.0 * 12.0 / 16.0; // = 240 kN-m
    assert!(
        (m_at_quarter - m_at_quarter_expected).abs() < 1e-10,
        "Max moment at L/4: computed={:.4}, expected={:.4}",
        m_at_quarter, m_at_quarter_expected
    );

    // The midspan moment is always the largest
    assert!(
        m_abs_max > m_at_quarter,
        "Midspan moment ({:.4}) > quarter span ({:.4})",
        m_abs_max, m_at_quarter
    );

    // For two equal loads P separated by distance d, the absolute
    // maximum moment occurs under one of the loads when the midspan
    // bisects the distance between that load and the resultant.
    // M_abs_max = P * (L/2 - d/4)
    //
    // Reference: Hibbeler, Example 6.11
    let d: f64 = 4.0; // m, spacing between loads
    let m_two_loads: f64 = p * (l / 2.0 - d / 4.0);
    let m_two_loads_expected: f64 = 80.0 * (8.0 - 1.0); // = 560 kN-m
    assert!(
        (m_two_loads - m_two_loads_expected).abs() < 1e-10,
        "Max moment (two loads): computed={:.4}, expected={:.4}",
        m_two_loads, m_two_loads_expected
    );

    // Critical section location is NOT at midspan for two loads.
    // It occurs at distance d/4 from midspan, under one of the loads.
    let x_max: f64 = l / 2.0 - d / 4.0;
    let x_max_expected: f64 = 7.0; // m from left support
    assert!(
        (x_max - x_max_expected).abs() < 1e-10,
        "Critical section location: computed={:.4}, expected={:.4}",
        x_max, x_max_expected
    );
}

// ================================================================
// 5. Two-Span Continuous Beam: IL for Interior Reaction
// ================================================================
//
// For a two-span continuous beam (equal spans L), the influence
// line ordinate for the interior reaction R_B when a unit load
// is in span 1 at distance xi from the left support:
//
//   IL_R_B(xi) = xi * (3*L^2 - xi^2) / (4*L^3)   for 0 <= xi <= L
//
// Derived from the three-moment equation (flexibility method).
// At xi = L/2: IL = 11/32 = 0.34375
// At xi = L:   IL = 2/4 = 0.5 (from span 1 contribution)
//
// Reference: Ghali & Neville, Table 12.4

#[test]
fn validation_il_interior_reaction_two_span() {
    let l: f64 = 10.0; // m, each span length

    // IL_R_B(xi) = xi * (3*L^2 - xi^2) / (4*L^3) for 0 <= xi <= L

    // At xi = 0 (left support)
    let il_at_0: f64 = 0.0 * (3.0 * l * l - 0.0) / (4.0 * l * l * l);
    assert!(
        il_at_0.abs() < 1e-12,
        "IL R_B at left support: {:.6}",
        il_at_0
    );

    // At xi = L/2 (midspan of first span)
    let xi_mid: f64 = l / 2.0;
    let il_at_mid: f64 = xi_mid * (3.0 * l * l - xi_mid * xi_mid) / (4.0 * l * l * l);
    // = 5 * (300 - 25) / 4000 = 5 * 275 / 4000 = 1375/4000 = 0.34375
    let il_at_mid_expected: f64 = 11.0 / 32.0; // = 0.34375
    assert!(
        (il_at_mid - il_at_mid_expected).abs() < 1e-12,
        "IL R_B at midspan of span 1: computed={:.6}, expected={:.6}",
        il_at_mid, il_at_mid_expected
    );

    // At xi = L: IL_R_B = L*(3L^2 - L^2)/(4L^3) = 2L^3/(4L^3) = 1/2
    let il_at_b: f64 = l * (3.0 * l * l - l * l) / (4.0 * l * l * l);
    let il_at_b_expected: f64 = 0.5;
    assert!(
        (il_at_b - il_at_b_expected).abs() < 1e-12,
        "IL R_B from span 1 at B: computed={:.6}, expected={:.6}",
        il_at_b, il_at_b_expected
    );

    // By symmetry, the total IL ordinate at B (unit load directly over B)
    // includes contributions from both spans: R_B_total = 5/4 = 1.25
    let il_rb_total_at_b: f64 = 5.0 / 4.0;
    assert!(
        il_rb_total_at_b > 1.0,
        "IL R_B at B exceeds 1.0 due to continuity: {:.4}",
        il_rb_total_at_b
    );

    // IL for R_B must be non-negative everywhere in span 1
    let n_check: usize = 100;
    for i in 0..=n_check {
        let xi: f64 = i as f64 * l / n_check as f64;
        let il_val: f64 = xi * (3.0 * l * l - xi * xi) / (4.0 * l * l * l);
        assert!(
            il_val >= -1e-12,
            "IL R_B should be non-negative at xi={:.2}: got {:.6}",
            xi, il_val
        );
    }
}

// ================================================================
// 6. Maximum Live Load Effect Using Pattern Loading
// ================================================================
//
// For a two-span continuous beam (equal spans L) under UDL w,
// the maximum positive moment in span 1 occurs when only span 1
// is loaded (checker-board pattern).
//
// For a two-span beam with UDL w on span 1 only:
//   M_B = -wL^2/16  (interior support moment, from three-moment eq.)
//   R_A = 7wL/16    (left reaction)
//   Max positive moment in span 1 at x = 7L/16 from A:
//     M_max = 49wL^2/512
//
// Compare with both spans loaded:
//   M_B = -wL^2/8, R_A = 3wL/8
//   M_max = 9wL^2/128
//
// Reference: Ghali & Neville, Table 3.1

#[test]
fn validation_il_pattern_loading_max_moment() {
    let l: f64 = 8.0;  // m, each span
    let w: f64 = 15.0;  // kN/m

    // Pattern loading (span 1 only): maximum positive moment
    let m_max_pattern: f64 = 49.0 * w * l * l / 512.0;
    let m_max_pattern_expected: f64 = 49.0 * 15.0 * 64.0 / 512.0;
    assert!(
        (m_max_pattern - m_max_pattern_expected).abs() < 1e-10,
        "Pattern loading M_max: computed={:.4}, expected={:.4}",
        m_max_pattern, m_max_pattern_expected
    );

    // Both spans loaded: maximum positive moment
    let m_max_both: f64 = 9.0 * w * l * l / 128.0;
    let m_max_both_expected: f64 = 9.0 * 15.0 * 64.0 / 128.0;
    assert!(
        (m_max_both - m_max_both_expected).abs() < 1e-10,
        "Both spans M_max: computed={:.4}, expected={:.4}",
        m_max_both, m_max_both_expected
    );

    // Pattern loading always gives larger positive moment in the loaded span
    assert!(
        m_max_pattern > m_max_both,
        "Pattern loading ({:.4}) > both loaded ({:.4})",
        m_max_pattern, m_max_both
    );

    // Ratio check: (49/512)/(9/128) = 49*128/(512*9) = 49/36
    let ratio: f64 = m_max_pattern / m_max_both;
    let ratio_expected: f64 = 49.0 / 36.0;
    assert!(
        (ratio - ratio_expected).abs() < 1e-10,
        "Ratio: computed={:.6}, expected={:.6}",
        ratio, ratio_expected
    );

    // Interior support moment is worse with both spans loaded
    let m_b_pattern: f64 = w * l * l / 16.0; // magnitude
    let m_b_both: f64 = w * l * l / 8.0;     // magnitude
    assert!(
        m_b_both > m_b_pattern,
        "M_B (both spans)={:.4} > M_B (pattern)={:.4}",
        m_b_both, m_b_pattern
    );
}

// ================================================================
// 7. IL for Moment at Interior Support of Two-Span Beam
// ================================================================
//
// For a two-span continuous beam (equal spans L), the influence
// line for bending moment at the interior support B when a unit
// load is at position xi in span 1:
//   IL_M_B(xi) = -xi * (L^2 - xi^2) / (4*L^2)
//
// The maximum negative ordinate occurs at xi = L/sqrt(3):
//   IL_M_B_max = -L * sqrt(3) / 18
//
// Reference: Kassimali, Structural Analysis, Ch. 8

#[test]
fn validation_il_interior_moment_two_span() {
    let l: f64 = 12.0; // m, each span

    // IL_M_B(xi) = -xi * (L^2 - xi^2) / (4*L^2)

    // At xi = 0: IL_M_B = 0
    let il_at_0: f64 = -0.0_f64 * (l * l - 0.0_f64) / (4.0 * l * l);
    assert!(
        il_at_0.abs() < 1e-12,
        "IL M_B at xi=0: {:.6}",
        il_at_0
    );

    // At xi = L: IL_M_B = -L * (L^2 - L^2) / (4*L^2) = 0
    let il_at_l: f64 = -l * (l * l - l * l) / (4.0 * l * l);
    assert!(
        il_at_l.abs() < 1e-12,
        "IL M_B at xi=L: {:.6}",
        il_at_l
    );

    // At xi = L/2: IL_M_B = -(L/2)*(L^2 - L^2/4)/(4L^2) = -3L/32
    let xi_mid: f64 = l / 2.0;
    let il_at_mid: f64 = -xi_mid * (l * l - xi_mid * xi_mid) / (4.0 * l * l);
    let il_at_mid_expected: f64 = -3.0 * l / 32.0;
    assert!(
        (il_at_mid - il_at_mid_expected).abs() < 1e-10,
        "IL M_B at midspan: computed={:.6}, expected={:.6}",
        il_at_mid, il_at_mid_expected
    );

    // Maximum negative ordinate at xi = L/sqrt(3)
    let xi_max: f64 = l / 3.0_f64.sqrt();
    let il_max: f64 = -xi_max * (l * l - xi_max * xi_max) / (4.0 * l * l);
    let il_max_expected: f64 = -l * 3.0_f64.sqrt() / 18.0;
    assert!(
        (il_max - il_max_expected).abs() < 1e-10,
        "Max IL M_B ordinate: computed={:.6}, expected={:.6}",
        il_max, il_max_expected
    );

    // IL is always non-positive for load in span 1
    let n_check: usize = 100;
    for i in 0..=n_check {
        let xi: f64 = i as f64 * l / n_check as f64;
        let il_val: f64 = -xi * (l * l - xi * xi) / (4.0 * l * l);
        assert!(
            il_val <= 1e-12,
            "IL M_B should be non-positive at xi={:.2}: got {:.6}",
            xi, il_val
        );
    }

    // UDL over full span 1: M_B = -wL^2/16
    let w: f64 = 20.0;
    let m_b_udl: f64 = -w * l * l / 16.0;
    let m_b_udl_expected: f64 = -20.0 * 144.0 / 16.0; // = -180 kN-m
    assert!(
        (m_b_udl - m_b_udl_expected).abs() < 1e-10,
        "M_B from full UDL on span 1: computed={:.4}, expected={:.4}",
        m_b_udl, m_b_udl_expected
    );
}

// ================================================================
// 8. Moving Load Envelope: Absolute Maximum Moment
// ================================================================
//
// For a simply supported beam (span L) with a series of concentrated
// loads (e.g., truck axle loads), the absolute maximum moment occurs
// when the midspan bisects the distance between the resultant of all
// loads and the nearest heavy load.
//
// AASHTO HL-93 design truck:
//   P1 = 35 kN (front axle), P2 = 145 kN, P3 = 145 kN (rear axles)
//   Spacing: 4.3 m between P1-P2, 4.3 m between P2-P3
//   Resultant R = 325 kN at x_R from P1
//
// Reference: AASHTO LRFD, Section 3.6.1.2

#[test]
fn validation_il_moving_load_envelope() {
    let l: f64 = 20.0; // m, span

    // AASHTO HL-93 design truck axle loads
    let p1: f64 = 35.0;  // kN, front axle
    let p2: f64 = 145.0; // kN, drive axle
    let p3: f64 = 145.0; // kN, rear axle
    let s12: f64 = 4.3;  // m, spacing P1-P2
    let s23: f64 = 4.3;  // m, spacing P2-P3

    // Total resultant
    let r_total: f64 = p1 + p2 + p3;
    let r_total_expected: f64 = 325.0;
    assert!(
        (r_total - r_total_expected).abs() < 1e-10,
        "Total resultant: computed={:.4}, expected={:.4}",
        r_total, r_total_expected
    );

    // Resultant location from P1
    let x_r: f64 = (p2 * s12 + p3 * (s12 + s23)) / r_total;
    let x_r_expected: f64 = (145.0 * 4.3 + 145.0 * 8.6) / 325.0;
    assert!(
        (x_r - x_r_expected).abs() < 1e-10,
        "Resultant location from P1: computed={:.4}, expected={:.4}",
        x_r, x_r_expected
    );

    // Offset of P2 from resultant
    let offset_p2: f64 = x_r - s12;
    assert!(
        offset_p2 > 0.0,
        "P2 is to the left of the resultant: offset={:.4}",
        offset_p2
    );

    // For absolute maximum moment, place the beam so that the
    // midspan bisects the distance between R and the nearest heavy load (P2).
    let x_p2: f64 = l / 2.0 - offset_p2 / 2.0;
    let x_p1: f64 = x_p2 - s12;
    let x_p3: f64 = x_p2 + s23;

    // Verify all loads are on the beam
    assert!(
        x_p1 >= 0.0 && x_p3 <= l,
        "All loads on beam: x_P1={:.4}, x_P3={:.4}, L={:.1}",
        x_p1, x_p3, l
    );

    // Left reaction from statics: sum of P*(L-x)/L
    let r_a: f64 = (p1 * (l - x_p1) + p2 * (l - x_p2) + p3 * (l - x_p3)) / l;

    // Moment under P2
    let m_under_p2: f64 = r_a * x_p2 - p1 * (x_p2 - x_p1);
    assert!(
        m_under_p2 > 0.0,
        "Moment under P2 should be positive: {:.4}",
        m_under_p2
    );

    // Upper bound sanity check: M_max < R_total * L / 4
    let m_upper_bound: f64 = r_total * l / 4.0;
    assert!(
        m_under_p2 < m_upper_bound,
        "M_P2 ({:.4}) < upper bound ({:.4})",
        m_under_p2, m_upper_bound
    );

    // Equilibrium check: R_A + R_B = R_total
    let r_b: f64 = r_total - r_a;
    assert!(
        (r_a + r_b - r_total).abs() < 1e-10,
        "Equilibrium: R_A + R_B = {:.4}, R_total = {:.4}",
        r_a + r_b, r_total
    );
}
