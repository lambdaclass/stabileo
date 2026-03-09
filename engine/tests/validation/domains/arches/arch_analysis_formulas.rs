/// Validation: Arch Analysis Formulas (Pure Formula Verification)
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", Ch. 9
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 6
///   - Heyman, "The Masonry Arch", Cambridge University Press
///   - Charlton, "A History of the Theory of Structures in the 19th Century"
///
/// Tests verify arch analysis formulas without calling the solver.
///   1. Three-hinged parabolic arch: H = wL^2/(8f), V = wL/2
///   2. Two-hinged circular arch thrust with correction factor
///   3. Arch rib shortening effect on thrust
///   4. Tied arch: tie force equals horizontal thrust
///   5. Arch with concentrated load: influence line ordinates
///   6. Parabolic arch moment under UDL (should be zero)
///   7. Circular arch vs parabolic arch thrust comparison
///   8. Arch buckling: P_cr = pi^2 EI / (beta L)^2

use std::f64::consts::PI;

// ================================================================
// 1. Three-Hinged Parabolic Arch: H = wL^2/(8f), V = wL/2
// ================================================================
//
// For a three-hinged parabolic arch under uniformly distributed load
// (projected horizontally), the horizontal thrust and vertical
// reactions are given by:
//   H = w * L^2 / (8 * f)
//   V = w * L / 2
// where w = load intensity (kN/m), L = span (m), f = rise (m).
//
// Reference: Timoshenko & Young, Eq. 9.1

#[test]
fn validation_arch_three_hinge_parabolic_thrust() {
    let w: f64 = 20.0;   // kN/m, uniformly distributed load
    let l: f64 = 30.0;   // m, span
    let f: f64 = 6.0;    // m, rise

    // Horizontal thrust
    let h_computed: f64 = w * l * l / (8.0 * f);
    let h_expected: f64 = 375.0; // kN: 20 * 900 / 48 = 375
    assert!(
        (h_computed - h_expected).abs() / h_expected < 1e-10,
        "Three-hinge H: computed={:.4}, expected={:.4}",
        h_computed, h_expected
    );

    // Vertical reactions (symmetric)
    let v_computed: f64 = w * l / 2.0;
    let v_expected: f64 = 300.0; // kN: 20 * 30 / 2 = 300
    assert!(
        (v_computed - v_expected).abs() / v_expected < 1e-10,
        "Three-hinge V: computed={:.4}, expected={:.4}",
        v_computed, v_expected
    );

    // Verify with different parameters
    let w2: f64 = 15.0;
    let l2: f64 = 40.0;
    let f2: f64 = 10.0;
    let h2: f64 = w2 * l2 * l2 / (8.0 * f2);
    let h2_expected: f64 = 300.0; // kN: 15 * 1600 / 80 = 300
    assert!(
        (h2 - h2_expected).abs() / h2_expected < 1e-10,
        "Three-hinge H (case 2): computed={:.4}, expected={:.4}",
        h2, h2_expected
    );
}

// ================================================================
// 2. Two-Hinged Circular Arch Thrust with Correction Factor
// ================================================================
//
// For a two-hinged circular arch under UDL, the horizontal thrust
// is approximately:
//   H = w * L^2 / (8 * f) * correction_factor
//
// The correction factor for a circular arch vs parabolic is:
//   C = 1 / (1 + (A * f^2) / (2 * I_arch))
// where A = cross-section area, I_arch = moment of inertia.
// This accounts for the arch shortening due to axial compression.
//
// For slender arches (I >> A*f^2), C -> 1 (parabolic approx).
//
// Reference: Megson, "Structural and Stress Analysis", Sec. 6.4

#[test]
fn validation_arch_two_hinge_circular_thrust() {
    let w: f64 = 25.0;     // kN/m
    let l: f64 = 20.0;     // m, span
    let f: f64 = 5.0;      // m, rise

    // Parabolic arch thrust (baseline)
    let h_parabolic: f64 = w * l * l / (8.0 * f);
    let h_parabolic_expected: f64 = 250.0; // kN

    assert!(
        (h_parabolic - h_parabolic_expected).abs() / h_parabolic_expected < 1e-10,
        "Parabolic thrust: computed={:.4}, expected={:.4}",
        h_parabolic, h_parabolic_expected
    );

    // Correction factor for rib shortening with realistic values
    let a_sec3: f64 = 0.015;  // m^2
    let i_sec3: f64 = 0.01;   // m^4
    let f3: f64 = 3.0;        // m

    let correction3: f64 = 1.0 / (1.0 + a_sec3 * f3 * f3 / (2.0 * i_sec3));
    let correction3_expected: f64 = 1.0 / (1.0 + 0.015 * 9.0 / 0.02);
    assert!(
        (correction3 - correction3_expected).abs() < 1e-10,
        "Correction factor: computed={:.6}, expected={:.6}",
        correction3, correction3_expected
    );

    // The corrected thrust should always be less than the parabolic thrust
    let h_corrected: f64 = h_parabolic * correction3;
    assert!(
        h_corrected < h_parabolic,
        "Corrected thrust ({:.4}) should be less than parabolic ({:.4})",
        h_corrected, h_parabolic
    );

    // Verify that as I -> infinity, correction -> 1
    let correction_large_i: f64 = 1.0 / (1.0 + a_sec3 * f3 * f3 / (2.0 * 1e6));
    assert!(
        (correction_large_i - 1.0).abs() < 1e-6,
        "Large I correction should approach 1.0: got {:.8}",
        correction_large_i
    );
}

// ================================================================
// 3. Arch Rib Shortening Effect on Thrust
// ================================================================
//
// Rib shortening reduces the horizontal thrust in a two-hinged arch.
// The thrust reduction factor due to rib shortening is:
//   H_actual = H_no_shortening / (1 + delta)
//
// For a parabolic arch: the length s of the arch rib is
//   s = L * (1 + (8/3)(f/L)^2)  approximately for f/L < 0.3
//
// Reference: Charlton, "A History of the Theory of Structures"

#[test]
fn validation_arch_rib_shortening_effect() {
    let w: f64 = 30.0;   // kN/m
    let l: f64 = 24.0;   // m, span
    let f: f64 = 6.0;    // m, rise
    let a_sec: f64 = 0.03; // m^2

    // Thrust without rib shortening
    let h0: f64 = w * l * l / (8.0 * f);
    let h0_expected: f64 = 360.0; // kN: 30 * 576 / 48 = 360
    assert!(
        (h0 - h0_expected).abs() / h0_expected < 1e-10,
        "H0 (no shortening): computed={:.4}, expected={:.4}",
        h0, h0_expected
    );

    // Arch rib length approximation
    let f_over_l: f64 = f / l;
    let s_approx: f64 = l * (1.0 + (8.0 / 3.0) * f_over_l * f_over_l);
    let s_expected: f64 = 24.0 * (1.0 + (8.0 / 3.0) * 0.0625);
    assert!(
        (s_approx - s_expected).abs() / s_expected < 1e-10,
        "Arch length: computed={:.4}, expected={:.4}",
        s_approx, s_expected
    );

    // The rib shortening reduces thrust by a factor related to
    // axial flexibility: H_reduced = H0 * (1 - H0 * s / (A * E_arch * L))
    let e_arch: f64 = 200_000_000.0; // kN/m^2
    let shortening_factor: f64 = h0 * s_approx / (a_sec * e_arch * l);
    assert!(
        shortening_factor < 0.1,
        "Shortening factor should be small: {:.6}",
        shortening_factor
    );
    assert!(
        shortening_factor > 0.0,
        "Shortening factor should be positive: {:.6}",
        shortening_factor
    );

    // Verify that rib shortening always reduces the thrust
    let h_reduced: f64 = h0 * (1.0 - shortening_factor);
    assert!(
        h_reduced < h0,
        "Reduced thrust ({:.4}) must be less than H0 ({:.4})",
        h_reduced, h0
    );
    assert!(
        h_reduced > 0.0,
        "Reduced thrust must remain positive: {:.4}",
        h_reduced
    );
}

// ================================================================
// 4. Tied Arch: Tie Force Equals Horizontal Thrust
// ================================================================
//
// In a tied arch, the horizontal thrust is resisted by a tie rod.
// The tie force T equals the horizontal thrust H.
//   T = H = w * L^2 / (8 * f)
//
// Reference: Megson, Sec. 6.5

#[test]
fn validation_arch_tied_force() {
    let w: f64 = 18.0;  // kN/m
    let l: f64 = 36.0;  // m, span
    let f: f64 = 9.0;   // m, rise

    // Horizontal thrust = tie force
    let h: f64 = w * l * l / (8.0 * f);
    let h_expected: f64 = 324.0; // kN: 18 * 1296 / 72 = 324
    assert!(
        (h - h_expected).abs() / h_expected < 1e-10,
        "Tied arch thrust: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Tie rod design: A_tie = T / (phi * fy)
    let fy: f64 = 350.0;   // MPa
    let phi: f64 = 0.9;     // resistance factor

    // A_tie = T * 1000 / (phi * fy) [mm^2]
    let a_tie: f64 = h * 1000.0 / (phi * fy);
    let a_tie_expected: f64 = 324000.0 / 315.0;
    assert!(
        (a_tie - a_tie_expected).abs() / a_tie_expected < 1e-6,
        "Tie area: computed={:.2} mm^2, expected={:.2} mm^2",
        a_tie, a_tie_expected
    );

    // Tie force should scale linearly with w
    let w2: f64 = 36.0; // double the load
    let h2: f64 = w2 * l * l / (8.0 * f);
    assert!(
        (h2 - 2.0 * h).abs() / (2.0 * h) < 1e-10,
        "Doubling load doubles tie force: H2={:.4}, 2*H={:.4}",
        h2, 2.0 * h
    );
}

// ================================================================
// 5. Arch with Concentrated Load: Influence Line Ordinates
// ================================================================
//
// For a three-hinged parabolic arch with a concentrated load P
// at distance a from the left support:
//   V_L = P * (L - a) / L
//   V_R = P * a / L
//   H = V_R * L / (2 * f)  (from crown hinge condition, load left of crown)
//
// Reference: Timoshenko & Young, Eq. 9.8-9.12

#[test]
fn validation_arch_concentrated_load_influence() {
    let l: f64 = 20.0;   // m, span
    let f: f64 = 5.0;    // m, rise
    let p: f64 = 100.0;  // kN, concentrated load
    let a: f64 = 5.0;    // m, distance from left support (quarter span)

    // Vertical reactions (same as simple beam)
    let v_l: f64 = p * (l - a) / l;
    let v_l_expected: f64 = 75.0;
    assert!(
        (v_l - v_l_expected).abs() / v_l_expected < 1e-10,
        "V_L: computed={:.4}, expected={:.4}",
        v_l, v_l_expected
    );

    let v_r: f64 = p * a / l;
    let v_r_expected: f64 = 25.0;
    assert!(
        (v_r - v_r_expected).abs() / v_r_expected < 1e-10,
        "V_R: computed={:.4}, expected={:.4}",
        v_r, v_r_expected
    );

    // Horizontal thrust from crown hinge condition
    let h: f64 = v_r * l / (2.0 * f);
    let h_expected: f64 = 50.0;
    assert!(
        (h - h_expected).abs() / h_expected < 1e-10,
        "H (concentrated): computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Verify with load at midspan (a = L/2)
    let a_mid: f64 = l / 2.0;
    let v_l_mid: f64 = p * (l - a_mid) / l;
    let v_r_mid: f64 = p * a_mid / l;
    assert!(
        (v_l_mid - 50.0).abs() < 1e-10,
        "V_L at midspan: {:.4}",
        v_l_mid
    );
    let h_mid: f64 = v_r_mid * l / (2.0 * f);
    let h_mid_expected: f64 = 100.0;
    assert!(
        (h_mid - h_mid_expected).abs() / h_mid_expected < 1e-10,
        "H at midspan: computed={:.4}, expected={:.4}",
        h_mid, h_mid_expected
    );
}

// ================================================================
// 6. Parabolic Arch Moment Under UDL (Should Be Zero)
// ================================================================
//
// A parabolic arch is the funicular shape for a uniformly distributed
// load. Therefore, the bending moment at any point is exactly zero.
//
// M(x) = w*x*(L-x)/2 - [wL^2/(8f)] * [4f/L^2 * x*(L-x)]
//       = w*x*(L-x)/2 - w*x*(L-x)/2
//       = 0  (identically)
//
// Reference: Timoshenko & Young, Sec. 9.2

#[test]
fn validation_arch_parabolic_zero_moment_udl() {
    let w: f64 = 12.0;   // kN/m
    let l: f64 = 24.0;   // m, span
    let f: f64 = 6.0;    // m, rise

    // Horizontal thrust
    let h: f64 = w * l * l / (8.0 * f);

    // Check moment at several points along the arch
    let n_points: usize = 10;
    for i in 1..n_points {
        let x: f64 = i as f64 * l / n_points as f64;
        let m_beam: f64 = w * x * (l - x) / 2.0;
        let y: f64 = 4.0 * f / (l * l) * x * (l - x);
        let m_arch: f64 = m_beam - h * y;
        assert!(
            m_arch.abs() < 1e-10,
            "Parabolic arch moment at x={:.1}: M={:.2e} (should be 0)",
            x, m_arch
        );
    }

    // Also verify at the critical section (midspan)
    let x_mid: f64 = l / 2.0;
    let m_beam_mid: f64 = w * x_mid * (l - x_mid) / 2.0;
    let y_mid: f64 = f;
    let m_arch_mid: f64 = m_beam_mid - h * y_mid;
    assert!(
        m_arch_mid.abs() < 1e-10,
        "Moment at crown: {:.2e} (should be 0)",
        m_arch_mid
    );
}

// ================================================================
// 7. Circular Arch vs Parabolic Arch Thrust Comparison
// ================================================================
//
// For a uniformly distributed load, a circular arch develops
// bending moments (it is not the funicular shape), while a
// parabolic arch does not.
//
// Radius of circular arch: R = (L^2 + 4f^2) / (8f)
// y_circ(x) = sqrt(R^2 - (x - L/2)^2) + (f - R)
// y_para(x) = 4f/L^2 * x * (L-x)
//
// Reference: Heyman, "The Masonry Arch"

#[test]
fn validation_arch_circular_vs_parabolic_thrust() {
    let l: f64 = 20.0;   // m, span
    let f: f64 = 5.0;    // m, rise (f/L = 0.25)

    // Radius of circular arch
    let r: f64 = (l * l + 4.0 * f * f) / (8.0 * f);
    let r_expected: f64 = 12.5;
    assert!(
        (r - r_expected).abs() / r_expected < 1e-10,
        "Circular arch radius: computed={:.4}, expected={:.4}",
        r, r_expected
    );

    // Compare ordinates at quarter span (x = L/4 = 5 m)
    let x: f64 = l / 4.0;

    // Parabolic ordinate
    let y_para: f64 = 4.0 * f / (l * l) * x * (l - x);
    let y_para_expected: f64 = 3.75;
    assert!(
        (y_para - y_para_expected).abs() / y_para_expected < 1e-10,
        "Parabolic ordinate at L/4: computed={:.4}, expected={:.4}",
        y_para, y_para_expected
    );

    // Circular ordinate
    let x_from_center: f64 = x - l / 2.0;
    let y_circ: f64 = (r * r - x_from_center * x_from_center).sqrt() + (f - r);
    let y_circ_expected: f64 = (156.25_f64 - 25.0).sqrt() - 7.5;
    assert!(
        (y_circ - y_circ_expected).abs() < 1e-10,
        "Circular ordinate at L/4: computed={:.4}, expected={:.4}",
        y_circ, y_circ_expected
    );

    // The circular arch is slightly higher than the parabolic at quarter span
    assert!(
        y_circ > y_para,
        "Circular ({:.4}) > Parabolic ({:.4}) at quarter span",
        y_circ, y_para
    );

    // Both ordinates should equal f at midspan
    let y_para_mid: f64 = 4.0 * f / (l * l) * (l / 2.0) * (l / 2.0);
    let y_circ_mid: f64 = (r * r).sqrt() + (f - r);
    assert!(
        (y_para_mid - f).abs() < 1e-10,
        "Parabolic at midspan: {:.4}, expected f={:.4}",
        y_para_mid, f
    );
    assert!(
        (y_circ_mid - f).abs() < 1e-10,
        "Circular at midspan: {:.4}, expected f={:.4}",
        y_circ_mid, f
    );
}

// ================================================================
// 8. Arch Buckling: P_cr = pi^2 EI / (beta L)^2
// ================================================================
//
// The elastic buckling load of an arch rib follows Euler-type
// formula with an effective length factor beta:
//   P_cr = pi^2 * E * I / (beta * s)^2
//
// For a three-hinged arch: beta = 0.5
// For a two-hinged arch:   beta = 0.7
// For a fixed arch:        beta = 0.35
//
// Reference: Timoshenko & Gere, "Theory of Elastic Stability", Ch. 7

#[test]
fn validation_arch_buckling_critical_load() {
    let e: f64 = 200_000.0;  // MPa
    let i_val: f64 = 5e-4;   // m^4
    let l: f64 = 20.0;       // m, span
    let f: f64 = 5.0;        // m, rise

    // Approximate arch length (parabolic)
    let f_over_l: f64 = f / l;
    let s: f64 = l * (1.0 + (8.0 / 3.0) * f_over_l * f_over_l);
    let s_expected: f64 = 20.0 * (1.0 + 8.0 / 3.0 * 0.0625);
    assert!(
        (s - s_expected).abs() / s_expected < 1e-10,
        "Arch length: computed={:.4}, expected={:.4}",
        s, s_expected
    );

    // E in kN/m^2: 200000 MPa * 1000 = 2e8 kN/m^2
    let e_kn: f64 = e * 1000.0;

    // Effective length factors for arch buckling:
    // Larger beta = longer effective length = lower buckling load.
    // Three-hinged: beta = 1.0 (least restraint, crown hinge adds flexibility)
    // Two-hinged:   beta = 0.7 (intermediate restraint)
    // Fixed:        beta = 0.5 (most restraint)
    let beta_3h: f64 = 1.0;
    let p_cr_3h: f64 = PI * PI * e_kn * i_val / (beta_3h * s).powi(2);

    let beta_2h: f64 = 0.7;
    let p_cr_2h: f64 = PI * PI * e_kn * i_val / (beta_2h * s).powi(2);

    let beta_fixed: f64 = 0.5;
    let p_cr_fixed: f64 = PI * PI * e_kn * i_val / (beta_fixed * s).powi(2);

    // Fixed > Two-hinged > Three-hinged (more restraint = higher buckling load)
    assert!(
        p_cr_fixed > p_cr_2h,
        "Fixed ({:.2}) > Two-hinged ({:.2})",
        p_cr_fixed, p_cr_2h
    );
    assert!(
        p_cr_2h > p_cr_3h,
        "Two-hinged ({:.2}) > Three-hinged ({:.2})",
        p_cr_2h, p_cr_3h
    );

    // Verify the three-hinged case numerically
    let p_cr_3h_expected: f64 = PI * PI * e_kn * i_val / (beta_3h * s_expected).powi(2);
    assert!(
        (p_cr_3h - p_cr_3h_expected).abs() / p_cr_3h_expected < 1e-10,
        "P_cr (3-hinge): computed={:.2}, expected={:.2}",
        p_cr_3h, p_cr_3h_expected
    );

    // Ratio of fixed to three-hinged: (beta_3h/beta_fixed)^2 = (1.0/0.5)^2 = 4.0
    let ratio: f64 = p_cr_fixed / p_cr_3h;
    let ratio_expected: f64 = (beta_3h / beta_fixed).powi(2);
    assert!(
        (ratio - ratio_expected).abs() / ratio_expected < 1e-10,
        "P_cr ratio fixed/3h: computed={:.4}, expected={:.4}",
        ratio, ratio_expected
    );
}
