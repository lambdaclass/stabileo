/// Validation: Extended Arch Analysis Formula Verification
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 9
///   - Megson, "Structural and Stress Analysis", 4th Ed., Ch. 6
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15
///   - Heyman, "The Masonry Arch", Cambridge University Press
///   - Charlton, "A History of the Theory of Structures in the 19th Century"
///
/// Tests verify extended arch analysis formulas without calling the solver.
///   1. Catenary vs parabolic shape: deviation grows with f/L ratio
///   2. Arch thermal thrust: H_T = alpha * dT * E * A / arch_flexibility
///   3. Elastic horizontal spring at support: reduced thrust
///   4. Spandrel-braced arch: column load to arch reactions
///   5. Three-hinged arch bending moment under asymmetric point loads
///   6. Fixed parabolic arch: support moments under UDL
///   7. Two-hinged arch: horizontal thrust via elastic center method integral
///   8. Arch section normal force and shear: N and V from H, V, theta

use std::f64::consts::PI;

// ================================================================
// 1. Catenary vs Parabolic Shape: Deviation Grows with f/L
// ================================================================
//
// A catenary y = a*(cosh(x/a) - 1) is the funicular shape for
// self-weight (load per unit arc length), while a parabola is
// funicular for UDL per unit horizontal projection.
//
// For shallow arches (f/L < 0.1), the two shapes nearly coincide.
// For deeper arches the deviation at quarter span grows.
//
// Catenary parameter: a = H/w, where H = horizontal thrust.
// At x = L/2: f = a*(cosh(L/(2a)) - 1), solved iteratively.
//
// Reference: Megson, "Structural and Stress Analysis", 4th Ed., Sec. 6.2

#[test]
fn validation_arch_ext_formula_catenary_vs_parabolic() {
    // Compare catenary and parabolic ordinates at quarter-span
    // for different rise-to-span ratios.

    let l: f64 = 40.0;

    // For a shallow arch: f/L = 0.05
    let f_shallow: f64 = 2.0;
    // Find catenary parameter a such that a*(cosh(L/(2a))-1) = f
    // Use the approximation: for small f/L, a ≈ L^2/(8f)
    let a_shallow: f64 = l * l / (8.0 * f_shallow);

    // Catenary ordinate at quarter span (x measured from center)
    let x_quarter: f64 = l / 4.0; // distance from center
    let y_cat_shallow: f64 = a_shallow * ((x_quarter / a_shallow).cosh() - 1.0);
    let _y_para_shallow: f64 = f_shallow * (1.0 - (2.0 * x_quarter / l).powi(2));
    // Actually measure from support: parabola y(x) = 4f/L^2 * x*(L-x)
    // At x = L/4: y_para = 4f/L^2 * (L/4)*(3L/4) = 3f/4
    let y_para_quarter_shallow: f64 = 3.0 * f_shallow / 4.0;

    // For catenary measured from the lowest point (crown), at x=L/4 from center:
    // y_cat = a*(cosh(x/a) - 1) is height above crown
    // So the ordinate from the baseline at quarter span is f - y_cat
    let y_cat_quarter_shallow: f64 = f_shallow - y_cat_shallow;

    // For shallow arch, deviation should be very small
    let dev_shallow: f64 = (y_cat_quarter_shallow - y_para_quarter_shallow).abs();
    let rel_dev_shallow: f64 = dev_shallow / f_shallow;
    assert!(
        rel_dev_shallow < 0.01,
        "Shallow arch (f/L=0.05): catenary-parabola deviation={:.6}, rel={:.4}%",
        dev_shallow, rel_dev_shallow * 100.0
    );

    // For a deep arch: f/L = 0.3
    let f_deep: f64 = 12.0;
    let a_deep: f64 = l * l / (8.0 * f_deep);

    let y_cat_deep: f64 = a_deep * ((x_quarter / a_deep).cosh() - 1.0);
    let y_para_quarter_deep: f64 = 3.0 * f_deep / 4.0;
    let y_cat_quarter_deep: f64 = f_deep - y_cat_deep;

    let dev_deep: f64 = (y_cat_quarter_deep - y_para_quarter_deep).abs();
    let rel_dev_deep: f64 = dev_deep / f_deep;

    // Deep arch should have larger relative deviation than shallow
    assert!(
        rel_dev_deep > rel_dev_shallow,
        "Deep arch deviation ({:.6}) should exceed shallow ({:.6})",
        rel_dev_deep, rel_dev_shallow
    );

    // Both shapes should give the same value at supports (y=0) and crown (y=f)
    // Check crown: catenary at x=0 from center gives y=0 (height above crown),
    // so ordinate = f - 0 = f (correct).
    let y_cat_crown: f64 = a_shallow * (0.0_f64.cosh() - 1.0);
    assert!(
        y_cat_crown.abs() < 1e-12,
        "Catenary at crown should be 0 above crown: got {:.6e}",
        y_cat_crown
    );
}

// ================================================================
// 2. Arch Thermal Thrust: Uniform Temperature Change
// ================================================================
//
// For a two-hinged arch, a uniform temperature rise dT causes
// expansion that is resisted by supports, producing a horizontal thrust.
//
// H_T = alpha * dT * E * A * integral(y ds) / integral(y^2/I ds + y^2/(A*r^2) ds)
//
// For a parabolic arch with uniform cross-section (simplified):
//   H_T = alpha * dT * E * A * (2/3 * f * L) / (8/15 * f^2 * L / I + rib_shortening_term)
//
// For slender arches ignoring rib shortening:
//   H_T ≈ alpha * dT * E * I * (15 / (8 * f))  (approximately)
//
// Reference: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 15

#[test]
fn validation_arch_ext_formula_thermal_thrust() {
    let alpha: f64 = 12e-6; // /°C, coefficient of thermal expansion (steel)
    let dt: f64 = 30.0;     // °C, temperature rise
    let e: f64 = 200_000.0; // MPa
    let e_kn: f64 = e * 1000.0; // kN/m^2
    let a_sec: f64 = 0.02;  // m^2
    let i_sec: f64 = 5e-4;  // m^4
    let l: f64 = 30.0;      // m, span
    let f_rise: f64 = 7.5;  // m, rise

    // Free thermal expansion of the arch (approximate as if straight at base):
    // dL = alpha * dT * L
    let d_l: f64 = alpha * dt * l;
    let d_l_expected: f64 = 12e-6 * 30.0 * 30.0;
    assert!(
        (d_l - d_l_expected).abs() / d_l_expected < 1e-10,
        "Free expansion: computed={:.6e}, expected={:.6e}",
        d_l, d_l_expected
    );

    // For a two-hinged parabolic arch (simplified, ignoring axial shortening):
    // The numerator integral: integral(y ds) ≈ (2/3) * f * L (for parabola)
    let numer: f64 = alpha * dt * (2.0 / 3.0) * f_rise * l;

    // The denominator integral: integral(y^2/I ds) ≈ (8/15)*f^2*L/I
    // Plus axial term: integral(cos^2(theta)/A ds) ≈ L/A (for shallow arch)
    let denom_bending: f64 = (8.0 / 15.0) * f_rise * f_rise * l / i_sec;
    let denom_axial: f64 = l / a_sec;
    let denom: f64 = (denom_bending + denom_axial) / (e_kn);

    let h_thermal: f64 = numer / denom;

    // The thermal thrust should be positive (expansion pushes outward)
    assert!(
        h_thermal > 0.0,
        "Thermal thrust should be positive: H_T={:.4}",
        h_thermal
    );

    // For a stiffer arch (larger A and I), thermal thrust should be higher
    let a_sec2: f64 = 0.04;
    let i_sec2: f64 = 1e-3;
    let denom2_bending: f64 = (8.0 / 15.0) * f_rise * f_rise * l / i_sec2;
    let denom2_axial: f64 = l / a_sec2;
    let denom2: f64 = (denom2_bending + denom2_axial) / e_kn;
    let h_thermal2: f64 = numer / denom2;

    assert!(
        h_thermal2 > h_thermal,
        "Stiffer arch has higher thermal thrust: H2={:.4} > H1={:.4}",
        h_thermal2, h_thermal
    );

    // Thermal thrust scales linearly with dT
    let dt2: f64 = 60.0;
    let numer2: f64 = alpha * dt2 * (2.0 / 3.0) * f_rise * l;
    let h_thermal_2dt: f64 = numer2 / denom;
    let ratio: f64 = h_thermal_2dt / h_thermal;
    assert!(
        (ratio - 2.0).abs() < 1e-10,
        "Doubling dT doubles H_T: ratio={:.6}",
        ratio
    );
}

// ================================================================
// 3. Elastic Horizontal Spring at Support: Reduced Thrust
// ================================================================
//
// If the supports of a two-hinged arch can spread horizontally
// with stiffness k_h, the horizontal thrust is reduced:
//   H_elastic = H_rigid / (1 + 2*H_rigid / (k_h * delta_0))
//
// More precisely, for a horizontal spring at each support:
//   H = H_rigid / (1 + 1/(k_h * C))
// where C = integral(y^2 ds / (EI)) is the arch flexibility.
//
// As k_h -> infinity: H -> H_rigid (no spreading).
// As k_h -> 0: H -> 0 (free to spread, no thrust).
//
// Reference: Timoshenko & Young, "Theory of Structures", 2nd Ed., Sec. 9.4

#[test]
fn validation_arch_ext_formula_elastic_support_thrust() {
    let w: f64 = 20.0;      // kN/m
    let l: f64 = 24.0;      // m
    let f_rise: f64 = 6.0;  // m
    let e_kn: f64 = 200e6;  // kN/m^2
    let i_sec: f64 = 5e-4;  // m^4

    // Rigid-support thrust
    let h_rigid: f64 = w * l * l / (8.0 * f_rise);
    let h_rigid_expected: f64 = 20.0 * 576.0 / 48.0;
    assert!(
        (h_rigid - h_rigid_expected).abs() / h_rigid_expected < 1e-10,
        "H_rigid: computed={:.4}, expected={:.4}",
        h_rigid, h_rigid_expected
    );

    // Arch flexibility: C = integral(y^2 ds / EI) ≈ (8/15)*f^2*L / (EI)
    let c_flex: f64 = (8.0 / 15.0) * f_rise * f_rise * l / (e_kn * i_sec);

    // Test with a stiff spring (k_h = 1e8 kN/m) -> nearly rigid
    let k_stiff: f64 = 1e8;
    let h_stiff: f64 = h_rigid / (1.0 + 1.0 / (k_stiff * c_flex));
    let reduction_stiff: f64 = (h_rigid - h_stiff) / h_rigid;
    assert!(
        reduction_stiff < 0.001,
        "Stiff spring: thrust reduction={:.6}% should be negligible",
        reduction_stiff * 100.0
    );

    // Test with a soft spring (k_h = 1000 kN/m) -> significant reduction
    let k_soft: f64 = 1000.0;
    let h_soft: f64 = h_rigid / (1.0 + 1.0 / (k_soft * c_flex));
    assert!(
        h_soft < h_rigid,
        "Soft spring thrust ({:.4}) should be less than rigid ({:.4})",
        h_soft, h_rigid
    );
    assert!(
        h_soft > 0.0,
        "Thrust with spring should be positive: {:.4}",
        h_soft
    );

    // As k -> 0, H -> 0
    let k_tiny: f64 = 0.001;
    let h_tiny: f64 = h_rigid / (1.0 + 1.0 / (k_tiny * c_flex));
    assert!(
        h_tiny < h_soft,
        "Smaller spring -> smaller thrust: H_tiny={:.4} < H_soft={:.4}",
        h_tiny, h_soft
    );

    // Monotonicity: H increases with k_h
    let k_values: [f64; 5] = [10.0, 100.0, 1000.0, 10000.0, 100000.0];
    let mut prev_h: f64 = 0.0;
    for &k in &k_values {
        let h_k: f64 = h_rigid / (1.0 + 1.0 / (k * c_flex));
        assert!(
            h_k > prev_h,
            "Thrust should increase with k: H(k={})={:.4} > prev={:.4}",
            k, h_k, prev_h
        );
        prev_h = h_k;
    }
}

// ================================================================
// 4. Spandrel-Braced Arch: Column Load Distribution
// ================================================================
//
// In a spandrel-braced arch, the deck is supported by vertical
// columns (spandrels) that transfer deck loads to the arch rib.
// Each column at horizontal position x_i transfers a load P_i
// to the arch at ordinate y_i = 4f/L^2 * x_i * (L - x_i).
//
// For a three-hinged parabolic arch with n equally spaced columns
// carrying equal loads P each:
//   V_left = sum of P_i * (L - x_i) / L
//   H = sum of [P_i * (L - x_i) / L * x_i] / (2 * f)  (from crown hinge)
//
// This is equivalent to the superposition of individual point loads.
//
// Reference: Charlton, "A History of the Theory of Structures", Ch. 5

#[test]
fn validation_arch_ext_formula_spandrel_column_loads() {
    let l: f64 = 30.0;
    let f_rise: f64 = 7.5;
    let n_columns: usize = 9; // columns at L/10, 2L/10, ..., 9L/10
    let p_col: f64 = 50.0;    // kN per column

    // Column positions
    let positions: Vec<f64> = (1..=n_columns)
        .map(|i| i as f64 * l / (n_columns as f64 + 1.0))
        .collect();

    // Vertical reactions (simple beam analogy)
    let mut v_left: f64 = 0.0;
    let mut v_right: f64 = 0.0;
    for &x in &positions {
        v_left += p_col * (l - x) / l;
        v_right += p_col * x / l;
    }

    // Total vertical reaction = n * P
    let total_p: f64 = n_columns as f64 * p_col;
    assert!(
        (v_left + v_right - total_p).abs() / total_p < 1e-10,
        "Vertical equilibrium: V_L + V_R = {:.4}, nP = {:.4}",
        v_left + v_right, total_p
    );

    // Symmetry check: for symmetric column placement, V_L = V_R
    assert!(
        (v_left - v_right).abs() / v_left < 1e-10,
        "Symmetric loading: V_L={:.4} should equal V_R={:.4}",
        v_left, v_right
    );

    // Horizontal thrust from crown hinge condition:
    // Taking moments about the crown from the right half:
    // H * f = V_R * L/2 - sum of P_i * (L/2 - x_i) for x_i > L/2
    // Alternatively, we can sum moment contributions:
    let mut m_right_about_crown: f64 = v_right * l / 2.0;
    for &x in &positions {
        if x > l / 2.0 {
            m_right_about_crown -= p_col * (x - l / 2.0);
        }
    }
    let h: f64 = m_right_about_crown / f_rise;

    // For symmetric loading the result should match:
    // H = V_R * L / (2f) - sum(P_i * (x_i - L/2)) / f  for x_i > L/2
    assert!(
        h > 0.0,
        "Horizontal thrust should be positive: H={:.4}",
        h
    );

    // Compare to UDL approximation: if total load P_total = n*P over length L,
    // equivalent w = P_total / L, then H_udl = w * L^2 / (8f)
    let w_equiv: f64 = total_p / l;
    let h_udl: f64 = w_equiv * l * l / (8.0 * f_rise);

    // The point load thrust should be close to the UDL thrust
    // (converges as n -> infinity)
    let rel_diff: f64 = (h - h_udl).abs() / h_udl;
    assert!(
        rel_diff < 0.15,
        "Spandrel thrust ({:.4}) vs UDL approx ({:.4}): diff={:.2}%",
        h, h_udl, rel_diff * 100.0
    );
}

// ================================================================
// 5. Three-Hinged Arch: Bending Moment Under Asymmetric Point Load
// ================================================================
//
// For a three-hinged parabolic arch with a single point load P
// at distance a from the left support (a < L/2):
//
//   V_L = P(L-a)/L,  V_R = Pa/L
//   H = Pa(L-a) / (2fL)  (from crown hinge moment condition)
//
// Bending moment at any section x (x < a):
//   M(x) = V_L * x - H * y(x)
// where y(x) = 4f/L^2 * x * (L - x)
//
// At the load point x = a:
//   M(a) = V_L * a - H * y(a) = Pa(L-a)/L - [Pa(L-a)/(2fL)] * [4fa(L-a)/L^2]
//        = Pa(L-a)/L * [1 - 2a(L-a)/L^2]
//
// Reference: Timoshenko & Young, "Theory of Structures", 2nd Ed., Eq. 9.10

#[test]
fn validation_arch_ext_formula_asymmetric_point_load_moment() {
    let l: f64 = 24.0;
    let f_rise: f64 = 6.0;
    let p: f64 = 80.0;
    let a: f64 = 6.0; // quarter span

    // Reactions
    let v_l: f64 = p * (l - a) / l;
    let v_r: f64 = p * a / l;

    assert!(
        (v_l + v_r - p).abs() < 1e-10,
        "Vertical equilibrium: V_L + V_R = {:.4}, P = {:.4}",
        v_l + v_r, p
    );

    // Horizontal thrust from crown hinge condition
    // Take moments about crown from the right side:
    //   H * f = V_R * L/2  (no load on right half since a < L/2)
    let h: f64 = v_r * l / (2.0 * f_rise);
    let _h_check: f64 = p * a * (l - a) / (2.0 * f_rise * l);

    // Verify both formulations give the same result
    // Actually V_R * L / (2f) = Pa/L * L/(2f) = Pa/(2f)
    // And Pa(L-a)/(2fL) are only the same if a < L/2 (load to left of crown).
    // Crown hinge: M_crown = 0 from the right: V_R * L/2 - H * f = 0
    // => H = V_R * L / (2f) = Pa / (2f)
    let h_from_crown: f64 = p * a / (2.0 * f_rise);
    assert!(
        (h - h_from_crown).abs() < 1e-10,
        "H formulas should agree: {:.4} vs {:.4}",
        h, h_from_crown
    );

    // Bending moment at the load point
    let y_a: f64 = 4.0 * f_rise / (l * l) * a * (l - a);
    let m_at_load: f64 = v_l * a - h * y_a;

    // Check analytically:
    // M(a) = P(L-a)/L * a - Pa/(2f) * 4f*a*(L-a)/L^2
    //       = Pa(L-a)/L - 2Pa^2(L-a)/L^2
    //       = Pa(L-a)/L * [1 - 2a/L]
    let m_analytical: f64 = p * a * (l - a) / l * (1.0 - 2.0 * a / l);
    assert!(
        (m_at_load - m_analytical).abs() < 1e-10,
        "M at load point: from forces={:.4}, analytical={:.4}",
        m_at_load, m_analytical
    );

    // M at load point for a = L/4:
    // M = 80 * 6 * 18 / 24 * (1 - 12/24) = 360 * 0.5 = 180 kN-m
    let m_expected: f64 = 180.0;
    assert!(
        (m_at_load - m_expected).abs() / m_expected < 1e-10,
        "M at quarter span: computed={:.4}, expected={:.4}",
        m_at_load, m_expected
    );

    // At x = L/2 (crown), the moment should be zero (three-hinge condition)
    let x_crown: f64 = l / 2.0;
    let y_crown: f64 = f_rise;
    // For x > a (crown is to the right of load):
    // M(x) = V_L * x - P * (x - a) - H * y(x)
    let m_crown: f64 = v_l * x_crown - p * (x_crown - a) - h * y_crown;
    assert!(
        m_crown.abs() < 1e-10,
        "Crown moment should be zero: {:.4e}",
        m_crown
    );
}

// ================================================================
// 6. Fixed Parabolic Arch: Support Moments Under UDL
// ================================================================
//
// A fixed (encastre) parabolic arch under UDL (per horizontal
// projection) still has H = wL^2/(8f) for the thrust (since the
// parabola is the funicular), but the fixed ends develop moments
// due to rib shortening and arch-end rotation.
//
// For a fixed parabolic arch ignoring axial deformation:
//   M_A = M_B = 0 (if arch is truly the funicular shape)
//
// With rib shortening (axial deformation), an approximate
// support moment develops:
//   M_A ≈ -H * f * A_sec * f^2 / (15 * I_sec)  (simplified)
//
// More precisely, the support moment arises because the rib
// shortening effectively reduces the rise by a small amount.
//
// Reference: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Sec. 15.4

#[test]
fn validation_arch_ext_formula_fixed_arch_support_moments() {
    let w: f64 = 15.0;
    let l: f64 = 30.0;
    let f_rise: f64 = 7.5;
    let e_kn: f64 = 200e6; // kN/m^2
    let a_sec: f64 = 0.03; // m^2
    let i_sec: f64 = 1e-3; // m^4

    // Horizontal thrust (same as three-hinged for parabolic under UDL)
    let h: f64 = w * l * l / (8.0 * f_rise);
    let h_expected: f64 = 15.0 * 900.0 / 60.0; // = 225 kN
    assert!(
        (h - h_expected).abs() / h_expected < 1e-10,
        "H for fixed arch: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Rib shortening effect: the mean axial force in the rib is approximately H
    // (since the arch is shallow enough). The rib shortens by:
    //   delta_s = H * s / (E * A)
    // where s is the arch length.
    let f_over_l: f64 = f_rise / l;
    let s: f64 = l * (1.0 + (8.0 / 3.0) * f_over_l * f_over_l);

    let delta_s: f64 = h * s / (e_kn * a_sec);
    assert!(
        delta_s > 0.0,
        "Rib shortening should be positive: {:.6e} m",
        delta_s
    );

    // The equivalent horizontal displacement from rib shortening is approximately:
    //   delta_h ≈ delta_s * cos(mean angle) ≈ delta_s (for shallow arch)
    // This is resisted by the fixed supports, creating a moment correction.

    // The correction moment at supports (approximate):
    // M_fix ≈ H * delta_s * EI / (H * some_flexibility_coefficient)
    // Simplified: M_corr ≈ w * L^2 / 8 * (A * f^2) / (15 * I)
    // This is a dimensionless ratio showing the relative importance.
    let rib_shortening_ratio: f64 = a_sec * f_rise * f_rise / (15.0 * i_sec);

    // For our parameters: 0.03 * 56.25 / (15 * 0.001) = 1.6875 / 0.015 = 112.5
    let ratio_expected: f64 = 0.03 * 56.25 / 0.015;
    assert!(
        (rib_shortening_ratio - ratio_expected).abs() / ratio_expected < 1e-10,
        "Rib shortening ratio: computed={:.4}, expected={:.4}",
        rib_shortening_ratio, ratio_expected
    );

    // If this ratio >> 1, rib shortening is important and the fixed arch
    // develops significant support moments even under UDL.
    assert!(
        rib_shortening_ratio > 1.0,
        "Rib shortening ratio should be > 1 for typical concrete arches: {:.4}",
        rib_shortening_ratio
    );

    // Compare with a very stiff section (I much larger): ratio decreases
    let i_large: f64 = 0.1;
    let ratio_large_i: f64 = a_sec * f_rise * f_rise / (15.0 * i_large);
    assert!(
        ratio_large_i < rib_shortening_ratio,
        "Larger I reduces rib shortening effect: {:.4} < {:.4}",
        ratio_large_i, rib_shortening_ratio
    );
}

// ================================================================
// 7. Two-Hinged Arch: Thrust via Energy Method (Castigliano)
// ================================================================
//
// For a two-hinged parabolic arch under UDL (horizontal projection),
// the horizontal thrust is found by releasing H as a redundant and
// imposing zero horizontal displacement:
//
//   H = integral(M_0 * y / (EI) ds) / integral(y^2 / (EI) ds)
//
// where M_0 = wLx/2 - wx^2/2 is the simply-supported beam moment.
//
// For a parabolic arch with y = 4f/L^2 * x*(L-x) and uniform EI:
//   Numerator: integral(M_0 * y dx) = integral(w*x*(L-x)/2 * 4f/(L^2) * x*(L-x) dx)
//            = 2wf/L^2 * integral(x^2*(L-x)^2 dx, 0, L)
//            = 2wf/L^2 * L^5/30 = wfL^3/15
//
//   Denominator: integral(y^2 dx) = integral((4f/L^2)^2 * x^2*(L-x)^2 dx, 0, L)
//              = 16f^2/L^4 * L^5/30 = 8f^2*L/15
//
//   H = (wfL^3/15) / (8f^2*L/15) = wL^2/(8f)
//
// This confirms the parabolic arch is the funicular shape.
//
// Reference: Megson, "Structural and Stress Analysis", 4th Ed., Sec. 6.4

#[test]
fn validation_arch_ext_formula_energy_method_thrust() {
    let w: f64 = 10.0;
    let l: f64 = 20.0;
    let f_rise: f64 = 5.0;

    // Numerical integration of the integrals using the trapezoidal rule
    let n: usize = 1000;
    let dx: f64 = l / n as f64;
    let mut numer_sum: f64 = 0.0;
    let mut denom_sum: f64 = 0.0;

    for i in 0..=n {
        let x: f64 = i as f64 * dx;
        let m0: f64 = w * x * (l - x) / 2.0; // simply-supported beam moment
        let y: f64 = 4.0 * f_rise / (l * l) * x * (l - x);

        let weight: f64 = if i == 0 || i == n { 0.5 } else { 1.0 };
        numer_sum += weight * m0 * y * dx;
        denom_sum += weight * y * y * dx;
    }

    let h_numerical: f64 = numer_sum / denom_sum;
    let h_analytical: f64 = w * l * l / (8.0 * f_rise);

    // The numerical integration should match the analytical result
    assert!(
        (h_numerical - h_analytical).abs() / h_analytical < 0.001,
        "Energy method H: numerical={:.6}, analytical={:.6}",
        h_numerical, h_analytical
    );

    // Verify the individual integrals analytically
    // Numerator: integral(M_0 * y dx) = wfL^3/15
    let numer_exact: f64 = w * f_rise * l.powi(3) / 15.0;
    assert!(
        (numer_sum - numer_exact).abs() / numer_exact < 0.001,
        "Numerator integral: numerical={:.6}, exact={:.6}",
        numer_sum, numer_exact
    );

    // Denominator: integral(y^2 dx) = 8f^2*L/15
    let denom_exact: f64 = 8.0 * f_rise * f_rise * l / 15.0;
    assert!(
        (denom_sum - denom_exact).abs() / denom_exact < 0.001,
        "Denominator integral: numerical={:.6}, exact={:.6}",
        denom_sum, denom_exact
    );

    // Cross-check: numer/denom = (wfL^3/15) / (8f^2*L/15) = wL^2/(8f)
    let h_from_ratio: f64 = numer_exact / denom_exact;
    assert!(
        (h_from_ratio - h_analytical).abs() / h_analytical < 1e-10,
        "Ratio check: {:.6} vs {:.6}",
        h_from_ratio, h_analytical
    );
}

// ================================================================
// 8. Arch Section Forces: Normal Force and Shear from H, V, theta
// ================================================================
//
// At any section of an arch at angle theta from horizontal,
// the normal force and shear force are resolved from the
// horizontal thrust H and vertical force V at that section:
//
//   N = -H * cos(theta) - V * sin(theta)   (compression positive for inward)
//   S =  H * sin(theta) - V * cos(theta)
//
// For a parabolic arch under UDL: y = 4f/L^2 * x*(L-x)
//   dy/dx = 4f/L^2 * (L - 2x)
//   tan(theta) = dy/dx
//   cos(theta) = 1 / sqrt(1 + tan^2)
//   sin(theta) = tan(theta) / sqrt(1 + tan^2)
//
// At the supports (x = 0):  tan(theta) = 4f/L, maximum slope.
// At the crown (x = L/2):   tan(theta) = 0, arch is horizontal.
//
// Reference: Megson, "Structural and Stress Analysis", 4th Ed., Sec. 6.3

#[test]
fn validation_arch_ext_formula_section_forces_n_v() {
    let w: f64 = 15.0;
    let l: f64 = 24.0;
    let f_rise: f64 = 6.0;

    // Thrust and reactions for three-hinged parabolic under UDL
    let h: f64 = w * l * l / (8.0 * f_rise);
    let v_total: f64 = w * l / 2.0;

    // At the left support (x = 0):
    // V_section = V_left = wL/2 = 180 kN (upward)
    // Slope: tan(theta) = 4f/L = 4*6/24 = 1.0, theta = 45 degrees
    let tan_theta_support: f64 = 4.0 * f_rise / l;
    let cos_theta_support: f64 = 1.0 / (1.0 + tan_theta_support * tan_theta_support).sqrt();
    let sin_theta_support: f64 = tan_theta_support * cos_theta_support;

    // At support: theta = atan(1) = 45 degrees
    let theta_support: f64 = tan_theta_support.atan();
    let theta_expected: f64 = PI / 4.0;
    assert!(
        (theta_support - theta_expected).abs() < 1e-10,
        "Support angle: computed={:.6}, expected=pi/4={:.6}",
        theta_support, theta_expected
    );

    // Normal force at support (compression, directed along the arch)
    // N = H * cos(theta) + V * sin(theta)  (compression positive)
    let n_support: f64 = h * cos_theta_support + v_total * sin_theta_support;
    // H = 180, V = 180, theta = 45deg
    // N = 180/sqrt(2) + 180/sqrt(2) = 360/sqrt(2) = 180*sqrt(2)
    let sqrt2: f64 = 2.0_f64.sqrt();
    let n_support_expected: f64 = 180.0 * sqrt2;
    assert!(
        (n_support - n_support_expected).abs() / n_support_expected < 1e-10,
        "N at support: computed={:.4}, expected={:.4}",
        n_support, n_support_expected
    );

    // Shear at support
    // S = H * sin(theta) - V * cos(theta)
    // S = 180 * sin(45) - 180 * cos(45) = 0
    let s_support: f64 = h * sin_theta_support - v_total * cos_theta_support;
    assert!(
        s_support.abs() < 1e-10,
        "Shear at support should be zero for this case: S={:.4e}",
        s_support
    );

    // At the crown (x = L/2): slope = 0, theta = 0
    // V_section at crown = wL/2 - w*L/2 = 0 (for symmetric UDL)
    let v_crown: f64 = v_total - w * l / 2.0;
    assert!(
        v_crown.abs() < 1e-10,
        "V at crown should be zero: {:.4e}",
        v_crown
    );

    // N at crown: cos(0) = 1, sin(0) = 0
    // N = H * 1 + 0 = H = 180 kN (pure axial compression)
    let n_crown: f64 = h;
    let n_crown_expected: f64 = 180.0;
    assert!(
        (n_crown - n_crown_expected).abs() / n_crown_expected < 1e-10,
        "N at crown = H: computed={:.4}, expected={:.4}",
        n_crown, n_crown_expected
    );

    // At quarter span (x = L/4):
    // dy/dx = 4f/L^2 * (L - 2*L/4) = 4f/L^2 * L/2 = 2f/L
    let tan_theta_quarter: f64 = 2.0 * f_rise / l;
    let cos_theta_quarter: f64 = 1.0 / (1.0 + tan_theta_quarter * tan_theta_quarter).sqrt();
    let sin_theta_quarter: f64 = tan_theta_quarter * cos_theta_quarter;

    // V at quarter span: V = wL/2 - w*L/4 = wL/4 = 90 kN
    let v_quarter: f64 = v_total - w * l / 4.0;
    let v_quarter_expected: f64 = w * l / 4.0;
    assert!(
        (v_quarter - v_quarter_expected).abs() / v_quarter_expected < 1e-10,
        "V at quarter span: computed={:.4}, expected={:.4}",
        v_quarter, v_quarter_expected
    );

    // N at quarter span
    let _n_quarter: f64 = h * cos_theta_quarter + v_quarter * sin_theta_quarter;

    // S at quarter span
    let s_quarter: f64 = h * sin_theta_quarter - v_quarter * cos_theta_quarter;

    // For a funicular arch (parabolic under UDL), the shear should be zero
    // at every section. Let's verify:
    // S = H * sin(theta) - V(x) * cos(theta)
    // H = wL^2/(8f), V(x) = wL/2 - wx, tan(theta) = 4f/L^2 * (L - 2x)
    // S = H * sin - V * cos = (H * tan - V) * cos
    // H * tan = wL^2/(8f) * 4f/L^2 * (L-2x) = w(L-2x)/2 = wL/2 - wx = V(x)
    // => S = 0 identically!
    assert!(
        s_quarter.abs() < 1e-10,
        "Shear at quarter span should be zero (funicular): S={:.4e}",
        s_quarter
    );

    // Verify the identity H * tan(theta) = V(x) at a general point
    let x_test: f64 = l / 3.0;
    let tan_test: f64 = 4.0 * f_rise / (l * l) * (l - 2.0 * x_test);
    let v_test: f64 = v_total - w * x_test;
    let h_tan: f64 = h * tan_test;
    assert!(
        (h_tan - v_test).abs() < 1e-10,
        "H*tan(theta) = V(x) identity: H*tan={:.4}, V={:.4}",
        h_tan, v_test
    );
}
