/// Validation: Classical Laminate Theory (CLT) — Pure-Math Formulas
///
/// References:
///   - Jones, "Mechanics of Composite Materials", 2nd ed. (1999)
///   - Tsai & Hahn, "Introduction to Composite Materials" (1980)
///   - Reddy, "Mechanics of Laminated Composite Plates and Shells", 2nd ed. (2004)
///   - Daniel & Ishai, "Engineering Mechanics of Composite Materials", 2nd ed. (2006)
///   - ASTM D3039 (tensile properties), ASTM D3518 (in-plane shear)
///   - Barbero, "Introduction to Composite Materials Design", 3rd ed. (2018)
///
/// Tests verify CLT stiffness computations and failure criteria.
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
// 1. Reduced Stiffness Matrix Q — Orthotropic Lamina
// ================================================================
//
// For an orthotropic lamina (e.g., unidirectional CFRP):
//   Q11 = E1 / (1 - nu12*nu21)
//   Q22 = E2 / (1 - nu12*nu21)
//   Q12 = nu12*E2 / (1 - nu12*nu21)
//   Q66 = G12
//
// where nu21 = nu12 * E2/E1 (reciprocity)
//
// Ref: Jones Ch.2, Reddy Ch.3

#[test]
fn validation_reduced_stiffness_matrix_orthotropic() {
    // Typical T300/5208 CFRP properties
    let e1: f64 = 181_000.0; // MPa (fiber direction)
    let e2: f64 = 10_300.0; // MPa (transverse)
    let nu12: f64 = 0.28;
    let g12: f64 = 7_170.0; // MPa

    // Reciprocity: nu21 = nu12 * E2/E1
    let nu21 = nu12 * e2 / e1;
    let expected_nu21 = 0.28 * 10_300.0 / 181_000.0;
    assert_close(nu21, expected_nu21, 1e-12, "nu21 reciprocity");

    // Denominator
    let denom = 1.0 - nu12 * nu21;

    // Q matrix entries
    let q11 = e1 / denom;
    let q22 = e2 / denom;
    let q12 = nu12 * e2 / denom;
    let q66 = g12;

    // Verify Q is positive definite: Q11*Q22 > Q12^2
    assert!(
        q11 * q22 > q12 * q12,
        "Q matrix should be positive definite"
    );

    // Symmetry check: Q12 = Q21 (both equal nu12*E2/denom = nu21*E1/denom)
    let q21 = nu21 * e1 / denom;
    assert_close(q12, q21, 1e-10, "Q12 = Q21 symmetry");

    // Q66 is independent
    assert_close(q66, g12, 1e-12, "Q66 = G12");

    // Q11/Q22 should be close to E1/E2 (since denom is same)
    let ratio = q11 / q22;
    let expected_ratio = e1 / e2;
    assert_close(ratio, expected_ratio, 1e-10, "Q11/Q22 = E1/E2");
}

// ================================================================
// 2. Transformed Stiffness — Off-Axis Lamina Rotation
// ================================================================
//
// For a lamina rotated by angle theta, the transformed reduced stiffness:
//   Q_bar_11 = Q11*c^4 + 2*(Q12+2*Q66)*s^2*c^2 + Q22*s^4
//   Q_bar_22 = Q11*s^4 + 2*(Q12+2*Q66)*s^2*c^2 + Q22*c^4
//   Q_bar_12 = (Q11+Q22-4*Q66)*s^2*c^2 + Q12*(c^4+s^4)
//   Q_bar_66 = (Q11+Q22-2*Q12-2*Q66)*s^2*c^2 + Q66*(c^4+s^4)
//
// where c = cos(theta), s = sin(theta)
//
// At theta = 0: Q_bar = Q
// At theta = 90: Q_bar_11 = Q22, Q_bar_22 = Q11
//
// Ref: Jones Ch.2 Eqs. 2.72-2.78

#[test]
fn validation_transformed_stiffness_off_axis() {
    let e1: f64 = 140_000.0;
    let e2: f64 = 10_000.0;
    let nu12: f64 = 0.30;
    let g12: f64 = 5_000.0;

    let nu21 = nu12 * e2 / e1;
    let denom = 1.0 - nu12 * nu21;

    let q11 = e1 / denom;
    let q22 = e2 / denom;
    let q12 = nu12 * e2 / denom;
    let q66 = g12;

    // At theta = 0 degrees
    let theta: f64 = 0.0;
    let c = theta.cos();
    let s = theta.sin();

    let qb11 =
        q11 * c.powi(4) + 2.0 * (q12 + 2.0 * q66) * s * s * c * c + q22 * s.powi(4);
    assert_close(qb11, q11, 1e-10, "Q_bar_11 at 0 deg = Q11");

    // At theta = 90 degrees: Q_bar_11 = Q22
    let theta90 = PI / 2.0;
    let c90 = theta90.cos();
    let s90 = theta90.sin();

    let qb11_90 = q11 * c90.powi(4)
        + 2.0 * (q12 + 2.0 * q66) * s90 * s90 * c90 * c90
        + q22 * s90.powi(4);
    assert_close(qb11_90, q22, 1e-8, "Q_bar_11 at 90 deg = Q22");

    let qb22_90 = q11 * s90.powi(4)
        + 2.0 * (q12 + 2.0 * q66) * s90 * s90 * c90 * c90
        + q22 * c90.powi(4);
    assert_close(qb22_90, q11, 1e-8, "Q_bar_22 at 90 deg = Q11");

    // At theta = 45 degrees: Q_bar_11 = Q_bar_22 (symmetry of 45-deg)
    let theta45 = PI / 4.0;
    let c45 = theta45.cos();
    let s45 = theta45.sin();

    let qb11_45 = q11 * c45.powi(4)
        + 2.0 * (q12 + 2.0 * q66) * s45 * s45 * c45 * c45
        + q22 * s45.powi(4);
    let qb22_45 = q11 * s45.powi(4)
        + 2.0 * (q12 + 2.0 * q66) * s45 * s45 * c45 * c45
        + q22 * c45.powi(4);
    assert_close(qb11_45, qb22_45, 1e-10, "Q_bar_11 = Q_bar_22 at 45 deg");
}

// ================================================================
// 3. ABD Matrix — Symmetric Laminate [0/90]_s
// ================================================================
//
// For a symmetric laminate, B = 0 (no coupling).
// A_ij = sum_k Q_bar_ij^(k) * t_k
// D_ij = sum_k Q_bar_ij^(k) * (t_k * z_k^2 + t_k^3/12)
//
// For [0/90]_s with equal ply thickness t:
//   Total thickness h = 4*t
//   Plies at: [-2t to -t (0°), -t to 0 (90°), 0 to t (90°), t to 2t (0°)]
//
// Ref: Jones Ch.4

#[test]
fn validation_abd_matrix_symmetric_laminate() {
    let e1: f64 = 140_000.0;
    let e2: f64 = 10_000.0;
    let nu12: f64 = 0.30;
    let g12: f64 = 5_000.0;
    let t_ply: f64 = 0.125; // mm ply thickness

    let nu21 = nu12 * e2 / e1;
    let denom = 1.0 - nu12 * nu21;

    let q11 = e1 / denom;
    let q22 = e2 / denom;
    let q12 = nu12 * e2 / denom;
    let _q66 = g12;

    // [0/90]_s laminate: 4 plies, total thickness h = 4*t
    let h = 4.0 * t_ply;

    // A11 for [0/90]_s: 2 plies at 0° contribute Q11, 2 plies at 90° contribute Q22
    // A11 = 2*Q11*t + 2*Q22*t = 2*t*(Q11 + Q22)
    let a11 = 2.0 * t_ply * (q11 + q22);

    // A22 = 2*Q22*t + 2*Q11*t = A11 (same by symmetry of 0/90 layup)
    let a22 = 2.0 * t_ply * (q22 + q11);
    assert_close(a11, a22, 1e-10, "A11 = A22 for [0/90]_s");

    // A12 = 4*Q12*t (Q12 is same for 0° and 90° plies)
    let a12 = 4.0 * t_ply * q12;

    // For symmetric laminate, B should be zero
    // B11 = sum Q_bar_ij * (z_k_top^2 - z_k_bot^2) / 2
    // The symmetric layup cancels all B terms.
    // We can verify: for [0/90]_s with midplane at 0:
    //   Ply 1 (0°):  z_bot = -h/2 = -0.25, z_top = -0.125
    //   Ply 2 (90°): z_bot = -0.125, z_top = 0
    //   Ply 3 (90°): z_bot = 0, z_top = 0.125
    //   Ply 4 (0°):  z_bot = 0.125, z_top = h/2 = 0.25
    let z = [-h / 2.0, -t_ply, 0.0, t_ply, h / 2.0];
    let q11_plies = [q11, q22, q22, q11]; // 0, 90, 90, 0 degrees

    let mut b11: f64 = 0.0;
    for k in 0..4 {
        b11 += 0.5 * q11_plies[k] * (z[k + 1].powi(2) - z[k].powi(2));
    }
    assert!(b11.abs() < 1e-6, "B11 should be ~zero for symmetric layup, got {}", b11);

    // Effective in-plane modulus: E_x = A11/h - A12^2/(A22*h)
    // For [0/90]_s: since A11 = A22, E_x = (A11^2 - A12^2) / (A11 * h)
    let _ex_eff = (a11 * a11 - a12 * a12) / (a11 * h);

    // E_x should be between E2 and E1 (rule of mixtures approximate)
    let ex_rom = (e1 + e2) / 2.0; // simple rule of mixtures
    // The actual value from CLT differs slightly from ROM due to Poisson effects
    assert!(
        _ex_eff > e2 && _ex_eff < e1,
        "E_x effective ({:.0}) should be between E2 ({:.0}) and E1 ({:.0})",
        _ex_eff, e2, e1
    );

    // Due to Poisson coupling, CLT value slightly exceeds simple ROM
    let _rom_diff = (_ex_eff - ex_rom).abs() / ex_rom;
    // This difference should be small (< 5% for typical composites)
    assert!(
        _rom_diff < 0.05,
        "CLT vs ROM difference should be < 5%, got {:.2}%",
        _rom_diff * 100.0
    );
}

// ================================================================
// 4. Rule of Mixtures — Fiber/Matrix Properties
// ================================================================
//
// Voigt (upper bound, fiber direction):
//   E1 = E_f * V_f + E_m * (1 - V_f)
//
// Reuss (lower bound, transverse):
//   1/E2 = V_f/E_f + (1 - V_f)/E_m
//
// Halpin-Tsai (improved transverse estimate):
//   E2 = E_m * (1 + xi*eta*V_f) / (1 - eta*V_f)
//   where eta = (E_f/E_m - 1) / (E_f/E_m + xi)
//   and xi ≈ 2 for circular fibers
//
// Ref: Jones Ch.3, Barbero Ch.4

#[test]
fn validation_rule_of_mixtures() {
    let e_f: f64 = 230_000.0; // MPa carbon fiber
    let e_m: f64 = 3_500.0; // MPa epoxy matrix
    let v_f: f64 = 0.60; // fiber volume fraction

    // Voigt (longitudinal)
    let e1_voigt = e_f * v_f + e_m * (1.0 - v_f);
    let expected_e1 = 230_000.0 * 0.6 + 3_500.0 * 0.4;
    assert_close(e1_voigt, expected_e1, 1e-12, "E1 Voigt");
    // = 138000 + 1400 = 139400 MPa
    assert_close(e1_voigt, 139_400.0, 1e-10, "E1 numerical");

    // Reuss (transverse, lower bound)
    let e2_reuss = 1.0 / (v_f / e_f + (1.0 - v_f) / e_m);
    // = 1 / (0.6/230000 + 0.4/3500) = 1 / (2.609e-6 + 1.143e-4) = 1 / 1.169e-4
    let expected_inv = v_f / e_f + (1.0 - v_f) / e_m;
    assert_close(e2_reuss, 1.0 / expected_inv, 1e-12, "E2 Reuss");

    // Reuss should be much less than Voigt
    assert!(
        e2_reuss < e1_voigt / 10.0,
        "E2 Reuss ({:.0}) should be << E1 Voigt ({:.0})",
        e2_reuss, e1_voigt
    );

    // Halpin-Tsai
    let xi: f64 = 2.0;
    let eta = (e_f / e_m - 1.0) / (e_f / e_m + xi);
    let e2_ht = e_m * (1.0 + xi * eta * v_f) / (1.0 - eta * v_f);

    // Halpin-Tsai should be between Reuss and Voigt
    assert!(
        e2_ht > e2_reuss && e2_ht < e1_voigt,
        "Halpin-Tsai ({:.0}) should be between Reuss ({:.0}) and Voigt ({:.0})",
        e2_ht, e2_reuss, e1_voigt
    );

    // Halpin-Tsai should be closer to Reuss than to Voigt for transverse
    assert!(
        e2_ht < e2_reuss * 3.0,
        "E2 Halpin-Tsai ({:.0}) should be in the neighborhood of Reuss ({:.0})",
        e2_ht, e2_reuss
    );

    // At V_f = 0, all models should give E_m
    let e1_0 = e_f * 0.0 + e_m * 1.0;
    assert_close(e1_0, e_m, 1e-12, "E1 at Vf=0");
    let e2_r_0 = 1.0 / (0.0 / e_f + 1.0 / e_m);
    assert_close(e2_r_0, e_m, 1e-12, "E2 Reuss at Vf=0");
}

// ================================================================
// 5. Tsai-Wu Failure Criterion — Lamina Strength
// ================================================================
//
// The Tsai-Wu criterion for a 2D lamina:
//   F1*s1 + F2*s2 + F11*s1^2 + F22*s2^2 + F66*s6^2 + 2*F12*s1*s2 = 1
//
// where:
//   F1 = 1/Xt - 1/Xc,  F2 = 1/Yt - 1/Yc
//   F11 = 1/(Xt*Xc),   F22 = 1/(Yt*Yc)
//   F66 = 1/S^2
//   F12 = -0.5*sqrt(F11*F22)  (common approximation)
//
// Xt, Xc = tensile/compressive strength in fiber direction
// Yt, Yc = tensile/compressive strength transverse
// S = in-plane shear strength
//
// Ref: Tsai & Wu (1971), Jones Ch.2

#[test]
fn validation_tsai_wu_failure_criterion() {
    // T300/5208 strengths (MPa)
    let xt: f64 = 1500.0; // fiber tensile
    let xc: f64 = 1500.0; // fiber compressive
    let yt: f64 = 40.0; // transverse tensile
    let yc: f64 = 246.0; // transverse compressive
    let s_shear: f64 = 68.0; // shear

    let f1 = 1.0 / xt - 1.0 / xc;
    let f2 = 1.0 / yt - 1.0 / yc;
    let f11 = 1.0 / (xt * xc);
    let f22 = 1.0 / (yt * yc);
    let f66 = 1.0 / (s_shear * s_shear);
    let f12 = -0.5 * (f11 * f22).sqrt();

    // Since Xt = Xc, F1 = 0
    assert_close(f1, 0.0, 1e-10, "F1 for Xt=Xc");

    // Uniaxial fiber tension: s1 = Xt, s2 = 0, s6 = 0
    // F1*Xt + F11*Xt^2 = 0 + 1/(Xt*Xc)*Xt^2 = Xt/Xc = 1 ✓
    let tw_fiber = f1 * xt + f11 * xt * xt;
    assert_close(tw_fiber, 1.0, 1e-10, "Tsai-Wu at fiber tensile strength");

    // Uniaxial transverse tension: s2 = Yt
    let tw_trans = f2 * yt + f22 * yt * yt;
    assert_close(tw_trans, 1.0, 1e-10, "Tsai-Wu at transverse tensile strength");

    // Pure shear: s6 = S
    let tw_shear = f66 * s_shear * s_shear;
    assert_close(tw_shear, 1.0, 1e-10, "Tsai-Wu at shear strength");

    // Biaxial loading should modify the failure surface
    // s1 = 500, s2 = 20, s6 = 0 (well within envelope)
    let s1: f64 = 500.0;
    let s2: f64 = 20.0;
    let s6: f64 = 0.0;
    let tw_biax = f1 * s1 + f2 * s2 + f11 * s1 * s1 + f22 * s2 * s2
        + f66 * s6 * s6
        + 2.0 * f12 * s1 * s2;
    assert!(
        tw_biax < 1.0,
        "biaxial point (500, 20, 0) should be inside failure envelope, TW = {:.4}",
        tw_biax
    );
}

// ================================================================
// 6. Laminate Thermal Stresses — CTE Mismatch
// ================================================================
//
// When a symmetric cross-ply [0/90]_s laminate is cooled by delta_T,
// residual stresses develop due to CTE mismatch:
//   alpha_1 (fiber direction) ≈ small (near zero for carbon)
//   alpha_2 (transverse) ≈ larger
//
// Free thermal strain: epsilon_T = alpha * delta_T
// Constrained strain leads to stress: sigma = Q * (epsilon - epsilon_T)
//
// For a balanced symmetric laminate, the effective CTE is:
//   alpha_eff = (alpha_1*E1 + alpha_2*E2) / (E1 + E2)  (approximate)
//
// Ref: Jones Ch.4, Daniel & Ishai Ch.8

#[test]
fn validation_laminate_thermal_stresses() {
    let alpha_1: f64 = -0.5e-6; // 1/C (carbon fiber, slightly negative)
    let alpha_2: f64 = 30.0e-6; // 1/C (transverse)
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0; // MPa
    let delta_t: f64 = -150.0; // C (cooling from cure)

    // Free thermal strains
    let eps_t1 = alpha_1 * delta_t;
    let eps_t2 = alpha_2 * delta_t;

    // eps_t1 = -0.5e-6 * (-150) = 75e-6 (expansion in fiber dir on cooling)
    assert_close(eps_t1, 75.0e-6, 1e-10, "thermal strain fiber dir");
    // eps_t2 = 30e-6 * (-150) = -4500e-6 (contraction transverse on cooling)
    assert_close(eps_t2, -4500.0e-6, 1e-10, "thermal strain transverse");

    // Effective CTE for balanced [0/90]_s (approximate weighted average)
    let alpha_eff = (alpha_1 * e1 + alpha_2 * e2) / (e1 + e2);
    // = (-0.5e-6*140000 + 30e-6*10000) / 150000
    // = (-70e-3 + 300e-3) / 150000
    // = 230e-3 / 150000
    // = 1.533e-6 /C
    let expected_alpha = (-0.5e-6_f64 * 140_000.0 + 30.0e-6 * 10_000.0) / 150_000.0;
    assert_close(alpha_eff, expected_alpha, 1e-10, "effective CTE");

    // The effective CTE should be between alpha_1 and alpha_2
    assert!(
        alpha_eff > alpha_1 && alpha_eff < alpha_2,
        "effective CTE ({:.3e}) should be between alpha_1 and alpha_2",
        alpha_eff
    );

    // Residual stress in 0-degree ply (constrained):
    // The laminate expands by alpha_eff*dT, but the 0-degree ply
    // wants to expand by alpha_1*dT. Stress develops:
    // sigma_1_in_0_ply ≈ E1 * (alpha_eff - alpha_1) * delta_T (simplified)
    let sigma_residual_0 = e1 * (alpha_eff - alpha_1) * delta_t;
    // Since alpha_eff > alpha_1 and delta_T < 0, this is compressive
    assert!(
        sigma_residual_0 < 0.0,
        "residual stress in 0-ply should be compressive on cooling"
    );

    // Residual stress in 90-degree ply (fiber direction of that ply = transverse of laminate)
    let sigma_residual_90 = e2 * (alpha_eff - alpha_2) * delta_t;
    // alpha_eff < alpha_2, delta_T < 0, so (alpha_eff - alpha_2) < 0, * (-150) > 0 => tensile
    assert!(
        sigma_residual_90 > 0.0,
        "residual stress in 90-ply should be tensile on cooling"
    );
}

// ================================================================
// 7. Maximum Stress Failure — Off-Axis Uniaxial Loading
// ================================================================
//
// For a unidirectional lamina loaded at angle theta to the fiber:
//   sigma_1 = sigma_x * cos^2(theta)
//   sigma_2 = sigma_x * sin^2(theta)
//   tau_12  = -sigma_x * sin(theta) * cos(theta)
//
// Failure occurs when any of:
//   |sigma_1| >= Xt or Xc
//   |sigma_2| >= Yt or Yc
//   |tau_12| >= S
//
// The failure strength as a function of theta:
//   sigma_x = min(Xt/cos^2, Yt/sin^2, S/(sin*cos))
//
// Ref: Jones Ch.2, Daniel & Ishai Ch.5

#[test]
fn validation_maximum_stress_off_axis() {
    let xt: f64 = 1500.0; // MPa
    let yt: f64 = 40.0; // MPa
    let s_str: f64 = 68.0; // MPa

    // At theta = 0: failure by fiber tension
    let theta0: f64 = 0.001_f64.to_radians(); // avoid divide by zero, near-zero
    let c0 = theta0.cos();
    let _s0 = theta0.sin();
    let sx_fiber = xt / (c0 * c0);
    assert_close(sx_fiber, xt, 1e-3, "sigma_x at ~0 deg = Xt");

    // At theta = 90: failure by transverse tension
    let theta90 = 89.999_f64.to_radians();
    let s90 = theta90.sin();
    let sx_trans = yt / (s90 * s90);
    assert_close(sx_trans, yt, 1e-3, "sigma_x at ~90 deg = Yt");

    // At theta = 45: all three stress components are active
    let theta45 = 45.0_f64.to_radians();
    let c45 = theta45.cos();
    let s45 = theta45.sin();
    let sx_fiber_45 = xt / (c45 * c45);
    let sx_trans_45 = yt / (s45 * s45);
    let sx_shear_45 = s_str / (s45 * c45);

    // At 45 deg: cos^2 = sin^2 = 0.5, sin*cos = 0.5
    assert_close(sx_fiber_45, 3000.0, 1e-6, "fiber limit at 45 deg");
    assert_close(sx_trans_45, 80.0, 1e-6, "transverse limit at 45 deg");
    assert_close(sx_shear_45, 136.0, 1e-6, "shear limit at 45 deg");

    // The governing mode at 45 deg is transverse (80 MPa < 136 < 3000)
    let sx_45 = sx_fiber_45.min(sx_trans_45).min(sx_shear_45);
    assert_close(sx_45, 80.0, 1e-6, "governing failure at 45 deg = transverse");

    // At small angles (~5-10 deg), shear failure often governs
    let theta_small = 5.0_f64.to_radians();
    let c_s = theta_small.cos();
    let s_s = theta_small.sin();
    let sx_f = xt / (c_s * c_s);
    let sx_t = yt / (s_s * s_s);
    let sx_sh = s_str / (s_s * c_s);
    let sx_governing = sx_f.min(sx_t).min(sx_sh);
    assert_close(sx_governing, sx_sh, 1e-10, "shear governs at small angles");
}

// ================================================================
// 8. Laminate Invariants — Tsai-Pagano Parameters
// ================================================================
//
// The stiffness invariants (independent of orientation) are:
//   U1 = (3*Q11 + 3*Q22 + 2*Q12 + 4*Q66) / 8
//   U2 = (Q11 - Q22) / 2
//   U3 = (Q11 + Q22 - 2*Q12 - 4*Q66) / 8
//   U4 = (Q11 + Q22 + 6*Q12 - 4*Q66) / 8
//   U5 = (Q11 + Q22 - 2*Q12 + 4*Q66) / 8
//
// For a quasi-isotropic laminate [0/45/-45/90]_s:
//   A11 = A22 = h*(U1 + U4) -- equal in-plane stiffness in all directions
//
// Ref: Tsai & Pagano (1968), Jones Ch.2

#[test]
fn validation_laminate_invariants_tsai_pagano() {
    let e1: f64 = 140_000.0;
    let e2: f64 = 10_000.0;
    let nu12: f64 = 0.30;
    let g12: f64 = 5_000.0;

    let nu21 = nu12 * e2 / e1;
    let denom = 1.0 - nu12 * nu21;

    let q11 = e1 / denom;
    let q22 = e2 / denom;
    let q12 = nu12 * e2 / denom;
    let q66 = g12;

    // Invariants
    let u1 = (3.0 * q11 + 3.0 * q22 + 2.0 * q12 + 4.0 * q66) / 8.0;
    let _u2 = (q11 - q22) / 2.0;
    let _u3 = (q11 + q22 - 2.0 * q12 - 4.0 * q66) / 8.0;
    let u4 = (q11 + q22 + 6.0 * q12 - 4.0 * q66) / 8.0;
    let u5 = (q11 + q22 - 2.0 * q12 + 4.0 * q66) / 8.0;

    // U1 + U5 = (3Q11+3Q22+2Q12+4Q66)/8 + (Q11+Q22-2Q12+4Q66)/8
    //         = (4Q11+4Q22+8Q66)/8 = (Q11+Q22+2Q66)/2
    let u1_plus_u5 = u1 + u5;
    let expected_sum = (q11 + q22 + 2.0 * q66) / 2.0;
    assert_close(u1_plus_u5, expected_sum, 1e-10, "U1 + U5 identity");

    // U1 - U5 = (3Q11+3Q22+2Q12+4Q66)/8 - (Q11+Q22-2Q12+4Q66)/8
    //         = (2Q11+2Q22+4Q12)/8 = (Q11+Q22+2Q12)/4
    let u1_minus_u5 = u1 - u5;
    let expected_diff = (q11 + q22 + 2.0 * q12) / 4.0;
    assert_close(u1_minus_u5, expected_diff, 1e-10, "U1 - U5 identity");

    // U4 + U5 = (Q11+Q22+6Q12-4Q66)/8 + (Q11+Q22-2Q12+4Q66)/8
    //         = (2Q11+2Q22+4Q12)/8 = (Q11+Q22+2Q12)/4
    let u4_plus_u5 = u4 + u5;
    assert_close(u4_plus_u5, expected_diff, 1e-10, "U4 + U5 = U1 - U5");

    // For quasi-isotropic laminate: A_11 should equal A_22
    // The key identity: for n equally-spaced angles with n >= 3,
    // the in-plane stiffness becomes isotropic:
    //   A_11 = A_22 = h*(U1)  and  A_12 = h*(U4)  and  A_66 = h*(U5)
    // (when computing per unit thickness, all angle-dependent terms cancel)

    // Verify: Q positive definite => Q11*Q22 - Q12^2 > 0
    assert!(
        q11 * q22 - q12 * q12 > 0.0,
        "Q positive definiteness check"
    );

    // All invariants should be positive for typical composites
    assert!(u1 > 0.0, "U1 > 0");
    assert!(u5 > 0.0, "U5 > 0");
}
