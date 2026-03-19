/// Validation: Laminate/Composite Plate Theory
///
/// References:
///   - Jones, "Mechanics of Composite Materials", 2nd Ed., CRC Press (1999)
///   - Reddy, "Mechanics of Laminated Composite Plates and Shells", 2nd Ed., CRC (2004)
///   - Daniel & Ishai, "Engineering Mechanics of Composite Materials", 2nd Ed., Oxford (2006)
///   - Tsai & Wu, "A General Theory of Strength for Anisotropic Materials", J. Composite Materials 5:58-80 (1971)
///   - Herakovich, "Mechanics of Fibrous Composites", Wiley (1998)
///   - Kaw, "Mechanics of Composite Materials", 2nd Ed., CRC (2006), Chs. 2-4
///   - ASTM D3039/D7264 for composite testing standards
///
/// Tests:
///   1. Rule of mixtures for composite elastic modulus
///   2. CLT stiffness: [A], [B], [D] matrix computation
///   3. Tsai-Wu failure criterion for composite lamina
///   4. Symmetric laminate: [B] = 0 (no membrane-bending coupling)
///   5. Cross-ply vs angle-ply stiffness comparison
///   6. Laminate beam: equivalent EI from D matrix for beam strip
///   7. Thermal residual stress: cure to service temperature
///   8. Effective modulus: laminate Ex, Ey from compliance matrix
use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Rule of Mixtures: E_composite = Vf*Ef + Vm*Em
// ================================================================
//
// The Voigt (upper bound) rule of mixtures predicts the longitudinal
// modulus E1 of a unidirectional composite lamina:
//   E1 = Vf * Ef + Vm * Em = Vf * Ef + (1 - Vf) * Em
//
// Similarly, the transverse modulus E2 (Reuss/lower bound):
//   1/E2 = Vf/Ef + Vm/Em
//
// For carbon/epoxy: Ef = 230,000 MPa, Em = 3,500 MPa, Vf = 0.60
//   E1 = 0.60 * 230000 + 0.40 * 3500 = 139,400 MPa
//   E2 = 1/(0.60/230000 + 0.40/3500) = 8,556.0 MPa (approx)
//
// We verify by building a beam with E1 and checking deflection matches.
//
// Source: Jones, "Mechanics of Composite Materials", §3.3.1, Eqs. 3.22-3.23.

#[test]
fn validation_laminate_rule_of_mixtures() {
    // Carbon fiber properties
    let ef: f64 = 230_000.0; // MPa — fiber modulus
    let em: f64 = 3_500.0;   // MPa — matrix modulus
    let vf: f64 = 0.60;      // fiber volume fraction
    let vm: f64 = 1.0 - vf;  // matrix volume fraction

    // Rule of mixtures — longitudinal (Voigt)
    let e1_rom: f64 = vf * ef + vm * em;
    let e1_expected: f64 = 139_400.0;
    assert_close(e1_rom, e1_expected, 1e-6, "ROM E1 (longitudinal)");

    // Inverse rule of mixtures — transverse (Reuss)
    let e2_rom: f64 = 1.0 / (vf / ef + vm / em);
    let e2_expected: f64 = 1.0 / (0.60 / 230_000.0 + 0.40 / 3_500.0);
    assert_close(e2_rom, e2_expected, 1e-6, "ROM E2 (transverse)");

    // Verify E1 >> E2 (strong anisotropy)
    assert!(
        e1_rom / e2_rom > 10.0,
        "Anisotropy ratio E1/E2={:.2} should be > 10 for carbon/epoxy",
        e1_rom / e2_rom
    );

    // Validate E1 with beam solver: cantilever under tip load
    // δ = PL³ / (3EI), so beam with E1_rom should give correct deflection
    let l: f64 = 2.0;       // m
    let b: f64 = 0.050;     // m — width 50 mm
    let h: f64 = 0.010;     // m — thickness 10 mm
    let a_sec: f64 = b * h;
    let iz: f64 = b * h.powi(3) / 12.0;
    let p: f64 = 100.0;     // N
    let n = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, e1_rom, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    let delta_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e1_rom * 1000.0 * iz);

    assert_close(delta_fem, delta_exact, 0.01, "ROM beam deflection with E1");

    // Shear modulus via rule of mixtures (Reuss)
    let gf: f64 = 20_000.0; // MPa — fiber shear modulus
    let gm: f64 = 1_300.0;  // MPa — matrix shear modulus
    let g12_rom: f64 = 1.0 / (vf / gf + vm / gm);
    let g12_expected: f64 = 1.0 / (0.60 / 20_000.0 + 0.40 / 1_300.0);
    assert_close(g12_rom, g12_expected, 1e-6, "ROM G12 (shear)");
}

// ================================================================
// 2. CLT Stiffness: [A], [B], [D] Matrix Computation
// ================================================================
//
// Classical Lamination Theory defines stiffness matrices for a laminate:
//   [A]_ij = Σ_k (Q_ij)_k (z_k - z_{k-1})          — extensional
//   [B]_ij = (1/2) Σ_k (Q_ij)_k (z_k² - z_{k-1}²)  — coupling
//   [D]_ij = (1/3) Σ_k (Q_ij)_k (z_k³ - z_{k-1}³)  — bending
//
// For a single orthotropic layer [0°] of thickness t:
//   A11 = Q11 * t,  B11 = 0 (symmetric about midplane),  D11 = Q11 * t³/12
//
// where Q11 = E1/(1 - ν12*ν21), Q22 = E2/(1 - ν12*ν21), Q12 = ν12*E2/(1 - ν12*ν21)
//
// Source: Reddy, "Mechanics of Laminated Composite Plates", §1.3, Eqs. 1.3.67-69.

#[test]
fn validation_laminate_clt_abd_matrices() {
    // Unidirectional carbon/epoxy lamina properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1; // reciprocal relation
    let _g12: f64 = 5_000.0; // MPa

    let t: f64 = 0.125; // mm — ply thickness

    // Reduced stiffness matrix [Q] for 0° ply
    let denom: f64 = 1.0 - nu12 * nu21;
    let q11: f64 = e1 / denom;
    let q22: f64 = e2 / denom;
    let q12: f64 = nu12 * e2 / denom;

    // Single ply laminate: z goes from -t/2 to +t/2
    // [A] = Q * t
    let a11: f64 = q11 * t;
    let a22: f64 = q22 * t;
    let a12: f64 = q12 * t;

    // [B] = 0 for single symmetric ply (midplane symmetric)
    let z_bot: f64 = -t / 2.0;
    let z_top: f64 = t / 2.0;
    let b11: f64 = 0.5 * q11 * (z_top.powi(2) - z_bot.powi(2));

    // [D] = Q * t³/12
    let d11: f64 = (1.0 / 3.0) * q11 * (z_top.powi(3) - z_bot.powi(3));
    let d11_formula: f64 = q11 * t.powi(3) / 12.0;

    // Verify Q matrix entries
    let q11_expected: f64 = e1 / (1.0 - nu12 * nu21);
    assert_close(q11, q11_expected, 1e-10, "Q11");
    assert_close(q22, e2 / denom, 1e-10, "Q22");
    assert_close(q12, nu12 * e2 / denom, 1e-10, "Q12");

    // Verify A matrix
    assert_close(a11, q11 * t, 1e-10, "A11 = Q11 * t");
    assert_close(a22, q22 * t, 1e-10, "A22 = Q22 * t");
    assert_close(a12, q12 * t, 1e-10, "A12 = Q12 * t");

    // Verify B = 0 for single symmetric ply
    assert_close(b11, 0.0, 1e-10, "B11 = 0 for symmetric ply");

    // Verify D matrix
    assert_close(d11, d11_formula, 1e-10, "D11 = Q11*t³/12");

    // Verify D11 > D22 (stiffer along fiber direction)
    let d22: f64 = q22 * t.powi(3) / 12.0;
    assert!(
        d11 > d22,
        "D11={:.4} should be > D22={:.4} for 0° ply", d11, d22
    );

    // Verify reciprocal relation ν21 = ν12 * E2 / E1
    let nu21_check: f64 = nu12 * e2 / e1;
    assert_close(nu21, nu21_check, 1e-10, "Reciprocal relation ν21 = ν12*E2/E1");

    // Verify extensional stiffness ratio A11/A22 = Q11/Q22 = E1/E2
    assert_close(a11 / a22, e1 / e2, 1e-10, "A11/A22 = E1/E2");
}

// ================================================================
// 3. Tsai-Wu Failure Criterion
// ================================================================
//
// The Tsai-Wu criterion is a quadratic interaction failure criterion:
//   F1*σ1 + F2*σ2 + F11*σ1² + F22*σ2² + F66*τ12² + 2*F12*σ1*σ2 = 1
//
// where:
//   F1 = 1/Xt - 1/Xc,  F2 = 1/Yt - 1/Yc
//   F11 = 1/(Xt*Xc),   F22 = 1/(Yt*Yc),   F66 = 1/S²
//   F12 = -0.5 * sqrt(F11*F22)   (Tsai-Hahn interaction term)
//
// A failure index FI < 1 means safe; FI >= 1 means failure.
//
// Source: Tsai & Wu, J. Composite Materials 5:58-80 (1971); Kaw, §2.8.

#[test]
fn validation_laminate_tsai_wu_failure() {
    // Typical carbon/epoxy strength values (MPa)
    let xt: f64 = 1500.0;  // longitudinal tensile strength
    let xc: f64 = 1200.0;  // longitudinal compressive strength
    let yt: f64 = 50.0;    // transverse tensile strength
    let yc: f64 = 200.0;   // transverse compressive strength
    let s: f64 = 70.0;     // in-plane shear strength

    // Tsai-Wu coefficients
    let f1: f64 = 1.0 / xt - 1.0 / xc;
    let f2: f64 = 1.0 / yt - 1.0 / yc;
    let f11: f64 = 1.0 / (xt * xc);
    let f22: f64 = 1.0 / (yt * yc);
    let f66: f64 = 1.0 / s.powi(2);
    let f12: f64 = -0.5 * (f11 * f22).sqrt();

    // Verify coefficient signs/magnitudes
    assert!(f11 > 0.0, "F11 must be positive");
    assert!(f22 > 0.0, "F22 must be positive");
    assert!(f66 > 0.0, "F66 must be positive");
    assert!(f12 < 0.0, "F12 (Tsai-Hahn) should be negative");

    // Test case 1: Pure longitudinal tension at failure (σ1 = Xt)
    let sigma1: f64 = xt;
    let sigma2: f64 = 0.0;
    let tau12: f64 = 0.0;
    let fi_1: f64 = f1 * sigma1 + f2 * sigma2
        + f11 * sigma1.powi(2) + f22 * sigma2.powi(2)
        + f66 * tau12.powi(2) + 2.0 * f12 * sigma1 * sigma2;
    // At pure Xt: FI = F1*Xt + F11*Xt² = (1/Xt - 1/Xc)*Xt + 1/(Xt*Xc)*Xt²
    //           = 1 - Xt/Xc + Xt/Xc = 1.0
    assert_close(fi_1, 1.0, 1e-10, "Tsai-Wu at σ1=Xt (pure tension)");

    // Test case 2: Pure transverse tension at failure (σ2 = Yt)
    let sigma1_2: f64 = 0.0;
    let sigma2_2: f64 = yt;
    let fi_2: f64 = f1 * sigma1_2 + f2 * sigma2_2
        + f11 * sigma1_2.powi(2) + f22 * sigma2_2.powi(2)
        + f66 * tau12.powi(2) + 2.0 * f12 * sigma1_2 * sigma2_2;
    assert_close(fi_2, 1.0, 1e-10, "Tsai-Wu at σ2=Yt (transverse tension)");

    // Test case 3: Pure shear at failure (τ12 = S)
    let fi_3: f64 = f66 * s.powi(2);
    assert_close(fi_3, 1.0, 1e-10, "Tsai-Wu at τ12=S (pure shear)");

    // Test case 4: Biaxial — safe stress state (50% of uniaxial)
    let sigma1_safe: f64 = 0.5 * xt;
    let sigma2_safe: f64 = 0.0;
    let fi_safe: f64 = f1 * sigma1_safe + f11 * sigma1_safe.powi(2);
    assert!(
        fi_safe < 1.0,
        "Half of Xt should be safe: FI={:.4} < 1.0", fi_safe
    );

    // Test case 5: Pure compressive failure (σ1 = -Xc)
    let sigma1_c: f64 = -xc;
    let fi_c: f64 = f1 * sigma1_c + f11 * sigma1_c.powi(2);
    // F1*(-Xc) + F11*Xc² = (1/Xt - 1/Xc)*(-Xc) + Xc/(Xt)
    //                     = -Xc/Xt + 1 + Xc/Xt = 1.0
    assert_close(fi_c, 1.0, 1e-10, "Tsai-Wu at σ1=-Xc (compression)");

    // Test case 6: Verify with beam solver that a beam at safe stress deflects properly
    let e_composite: f64 = 140_000.0;
    let l: f64 = 1.0;
    let b_width: f64 = 0.020;
    let h_thick: f64 = 0.005;
    let a_sec: f64 = b_width * h_thick;
    let iz: f64 = b_width * h_thick.powi(3) / 12.0;
    let n = 4;
    let p_safe: f64 = 10.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p_safe, my: 0.0,
    })];
    let input = make_beam(n, l, e_composite, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");
    let delta: f64 = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let delta_exact: f64 = p_safe * l.powi(3) / (3.0 * e_composite * 1000.0 * iz);
    assert_close(delta, delta_exact, 0.01, "Tsai-Wu beam deflection check");
}

// ================================================================
// 4. Symmetric Laminate: [B] = 0 (No Coupling)
// ================================================================
//
// A symmetric laminate has plies mirrored about the midplane. This
// guarantees [B] = 0 (no membrane-bending coupling), meaning applied
// in-plane forces produce no curvature, and bending moments produce
// no midplane strains.
//
// For a [0/90/90/0] laminate (4 plies, each thickness t):
//   Ply 1 (0°):  z from -2t to -t
//   Ply 2 (90°): z from -t  to  0
//   Ply 3 (90°): z from  0  to  t
//   Ply 4 (0°):  z from  t  to  2t
//
// B_ij = (1/2) Σ Q_ij^k (z_k² - z_{k-1}²) = 0 by symmetry.
//
// We verify by computing B_11 explicitly.
//
// Source: Jones, "Mechanics of Composite Materials", §4.3; Reddy, §1.3.5.

#[test]
fn validation_laminate_symmetric_b_zero() {
    // Material properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1;
    let denom: f64 = 1.0 - nu12 * nu21;

    // Q matrix for 0° ply
    let q11_0: f64 = e1 / denom;
    let q22_0: f64 = e2 / denom;
    let q12_0: f64 = nu12 * e2 / denom;

    // Q matrix for 90° ply (swap E1 and E2 roles)
    let q11_90: f64 = q22_0;  // E2/denom when rotated 90°
    let q22_90: f64 = q11_0;  // E1/denom when rotated 90°
    let q12_90: f64 = q12_0;  // unchanged by 90° rotation

    // Ply thickness
    let t: f64 = 0.125; // mm

    // [0/90/90/0] layup — z coordinates from bottom
    let z = [-2.0 * t, -t, 0.0, t, 2.0 * t]; // ply boundaries
    let q11_plies = [q11_0, q11_90, q11_90, q11_0];
    let q22_plies = [q22_0, q22_90, q22_90, q22_0];
    let q12_plies = [q12_0, q12_90, q12_90, q12_0];

    // Compute B_11, B_22, B_12
    let mut b11: f64 = 0.0;
    let mut b22: f64 = 0.0;
    let mut b12: f64 = 0.0;
    for k in 0..4 {
        let z_top: f64 = z[k + 1];
        let z_bot: f64 = z[k];
        b11 += 0.5 * q11_plies[k] * (z_top.powi(2) - z_bot.powi(2));
        b22 += 0.5 * q22_plies[k] * (z_top.powi(2) - z_bot.powi(2));
        b12 += 0.5 * q12_plies[k] * (z_top.powi(2) - z_bot.powi(2));
    }

    // For symmetric laminate, all B components must be zero
    assert_close(b11, 0.0, 1e-10, "[B]11 = 0 for symmetric laminate");
    assert_close(b22, 0.0, 1e-10, "[B]22 = 0 for symmetric laminate");
    assert_close(b12, 0.0, 1e-10, "[B]12 = 0 for symmetric laminate");

    // Also compute [A] and [D] for verification
    let mut a11: f64 = 0.0;
    let mut a22: f64 = 0.0;
    let mut d11: f64 = 0.0;
    let mut d22: f64 = 0.0;
    for k in 0..4 {
        let z_top: f64 = z[k + 1];
        let z_bot: f64 = z[k];
        a11 += q11_plies[k] * (z_top - z_bot);
        a22 += q22_plies[k] * (z_top - z_bot);
        d11 += (1.0 / 3.0) * q11_plies[k] * (z_top.powi(3) - z_bot.powi(3));
        d22 += (1.0 / 3.0) * q22_plies[k] * (z_top.powi(3) - z_bot.powi(3));
    }

    // A11 should equal A22 for [0/90/90/0] (balanced cross-ply)
    assert_close(a11, a22, 1e-10, "A11 = A22 for balanced cross-ply");

    // D11 != D22 because 0° plies are farther from midplane
    assert!(
        d11 > d22,
        "D11={:.4} should be > D22={:.4} (0° plies farther from midplane)",
        d11, d22
    );

    // Verify with beam: symmetric laminate beam should have predictable stiffness
    let total_h: f64 = 4.0 * t; // total laminate thickness in mm
    let h_m: f64 = total_h / 1000.0; // convert to m
    let b_m: f64 = 0.050; // 50 mm width in m
    // D11 is in MPa*mm³; equivalent EI = D11 * width (N·mm² per unit width → N·mm² for strip)
    // For beam: EI = D11 * b (width)
    let ei_beam: f64 = d11 * (b_m * 1000.0); // D11 in MPa*mm³, b in mm → N·mm²
    // Convert to N·m²: N·mm² / 1e6 = N·m²? No: 1 N·mm² = 1e-6 N·m²
    let _ei_si: f64 = ei_beam * 1e-6; // N·m²

    // Verify D11 matches expected for [0/90/90/0]
    // Outer plies (0°): z from t to 2t and -2t to -t
    // Inner plies (90°): z from -t to 0 and 0 to t
    let d11_outer: f64 = (1.0 / 3.0) * q11_0 * ((2.0 * t).powi(3) - t.powi(3));
    let d11_inner: f64 = (1.0 / 3.0) * q11_90 * (t.powi(3));
    let d11_check: f64 = 2.0 * d11_outer + 2.0 * d11_inner; // factor 2 for +/- sides
    // Actually recompute properly:
    let d11_manual: f64 = (1.0 / 3.0) * q11_0 * ((2.0 * t).powi(3) - t.powi(3))
        + (1.0 / 3.0) * q11_90 * (t.powi(3) - 0.0_f64.powi(3))
        + (1.0 / 3.0) * q11_90 * (0.0_f64.powi(3) - (-t).powi(3))
        + (1.0 / 3.0) * q11_0 * ((-t).powi(3) - (-2.0 * t).powi(3));
    let _d11_check2 = d11_check; // suppress unused warning
    assert_close(d11, d11_manual, 1e-10, "D11 manual check for [0/90/90/0]");
}

// ================================================================
// 5. Cross-Ply vs Angle-Ply Stiffness Comparison
// ================================================================
//
// A cross-ply laminate [0/90]s has fibers in the 0° and 90° directions,
// while an angle-ply laminate [+45/-45]s has fibers at ±45°.
//
// For axial loading in the 0° direction:
//   - Cross-ply is much stiffer (fibers aligned with load)
//   - Angle-ply is less stiff (fibers at 45° to load)
//
// The transformed Q matrix for a ply at angle θ:
//   Q̄11 = Q11*cos⁴θ + 2(Q12+2Q66)*sin²θ*cos²θ + Q22*sin⁴θ
//
// For θ=0°:  Q̄11 = Q11
// For θ=45°: Q̄11 = (Q11 + Q22 + 2Q12 + 4Q66)/4
//
// Cross-ply Ex = A11/h should be much larger than angle-ply.
//
// Source: Kaw, "Mechanics of Composite Materials", §4.3; Jones, §4.4.

#[test]
fn validation_laminate_crossply_vs_angleply() {
    // Material properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1;
    let g12: f64 = 5_000.0;  // MPa
    let denom: f64 = 1.0 - nu12 * nu21;

    // Q matrix components
    let q11: f64 = e1 / denom;
    let q22: f64 = e2 / denom;
    let q12: f64 = nu12 * e2 / denom;
    let q66: f64 = g12;

    // Cross-ply [0/90]s — average Q̄11 for 0° and 90° plies
    let qbar11_0: f64 = q11;     // 0° ply
    let qbar11_90: f64 = q22;   // 90° ply
    let qbar11_crossply: f64 = (qbar11_0 + qbar11_90) / 2.0;

    // Angle-ply [+45/-45]s — Q̄11 for 45° ply
    let theta: f64 = 45.0_f64.to_radians();
    let c: f64 = theta.cos();
    let s_val: f64 = theta.sin();
    let c2: f64 = c.powi(2);
    let s2: f64 = s_val.powi(2);
    let c4: f64 = c.powi(4);
    let s4: f64 = s_val.powi(4);
    let qbar11_45: f64 = q11 * c4 + 2.0 * (q12 + 2.0 * q66) * s2 * c2 + q22 * s4;
    // For ±45° symmetric, both plies give the same Q̄11
    let qbar11_angleply: f64 = qbar11_45;

    // Cross-ply should be much stiffer than angle-ply in the 0° direction
    assert!(
        qbar11_crossply > qbar11_angleply,
        "Cross-ply Q̄11={:.2} should be > angle-ply Q̄11={:.2}",
        qbar11_crossply, qbar11_angleply
    );

    // Verify 45° transformation formula
    let qbar11_45_expected: f64 = (q11 + q22 + 2.0 * q12 + 4.0 * q66) / 4.0;
    assert_close(
        qbar11_45, qbar11_45_expected, 1e-6,
        "Q̄11(45°) = (Q11+Q22+2Q12+4Q66)/4"
    );

    // Ratio check: cross-ply/angle-ply stiffness ratio
    let ratio: f64 = qbar11_crossply / qbar11_angleply;
    assert!(
        ratio > 1.5,
        "Cross-ply/angle-ply ratio={:.2} should be > 1.5", ratio
    );

    // Validate with beam solver:
    // A beam with cross-ply equivalent modulus should deflect less than angle-ply
    let t_ply: f64 = 0.125; // mm per ply
    let n_plies = 4;
    let h_total: f64 = n_plies as f64 * t_ply / 1000.0; // m
    let b_width: f64 = 0.050; // m
    let a_sec: f64 = b_width * h_total;
    let iz: f64 = b_width * h_total.powi(3) / 12.0;
    let l: f64 = 1.0;
    let p: f64 = 5.0;
    let n = 4;

    // Cross-ply effective modulus (extensional average)
    let e_crossply: f64 = qbar11_crossply * denom; // approximate Ex

    // Angle-ply effective modulus
    let e_angleply: f64 = qbar11_angleply * denom; // approximate Ex

    let loads_cp = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_cp = make_beam(n, l, e_crossply, a_sec, iz, "fixed", None, loads_cp);
    let res_cp = solve_2d(&input_cp).expect("solve");
    let delta_cp: f64 = res_cp.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    let loads_ap = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_ap = make_beam(n, l, e_angleply, a_sec, iz, "fixed", None, loads_ap);
    let res_ap = solve_2d(&input_ap).expect("solve");
    let delta_ap: f64 = res_ap.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    assert!(
        delta_cp < delta_ap,
        "Cross-ply δ={:.6e} should be less than angle-ply δ={:.6e}",
        delta_cp, delta_ap
    );
}

// ================================================================
// 6. Laminate Beam: Equivalent EI from D Matrix
// ================================================================
//
// For a laminate beam strip (width b), the equivalent flexural rigidity is:
//   EI_eq = D11 * b
//
// where D11 is the (1,1) entry of the [D] bending stiffness matrix.
// The beam deflection under tip load P on a cantilever of length L is:
//   δ = P*L³ / (3 * EI_eq)
//
// We compare the analytic deflection from D11 with the FEM solver result.
//
// Source: Reddy, §1.3; Daniel & Ishai, §7.4.

#[test]
fn validation_laminate_beam_equivalent_ei() {
    // Material properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1;
    let denom: f64 = 1.0 - nu12 * nu21;
    let q11: f64 = e1 / denom;

    // 8-ply symmetric [0₄]s laminate (all 0° plies)
    let t_ply: f64 = 0.125; // mm per ply
    let n_plies = 8;
    let h_total: f64 = n_plies as f64 * t_ply; // 1.0 mm total thickness

    // D11 for all-0° laminate:
    // D11 = Q11 * h³/12 (same as isotropic formula since all plies are identical)
    let d11: f64 = q11 * h_total.powi(3) / 12.0;

    // Beam strip width
    let b_mm: f64 = 50.0; // mm

    // Equivalent EI = D11 * b  (in MPa * mm⁴ = N·mm²)
    let ei_eq_nmm2: f64 = d11 * b_mm;

    // Convert to consistent units for solver (E in MPa, lengths in m)
    // EI_eq [N·mm²] = E_eq [MPa] * Iz [m⁴] * 1e12  (since 1 m⁴ = 1e12 mm⁴)
    // So E_eq * Iz = EI_eq / 1e12  ... but Iz is in m⁴
    let h_m: f64 = h_total / 1000.0;    // m
    let b_m: f64 = b_mm / 1000.0;       // m
    let iz_m4: f64 = b_m * h_m.powi(3) / 12.0; // m⁴

    // EI from D11: in N·mm² / 1e6 → N·m²
    let ei_eq_nm2: f64 = ei_eq_nmm2 * 1e-6;
    // e_eq [MPa] such that E_eq * Iz_m4 = ei_eq_nm2
    // E_eq [MPa] * Iz [m⁴] = E_eq [N/mm²] * Iz [m⁴]
    // 1 MPa * 1 m⁴ = 1 N/mm² * 1e12 mm⁴ / 1e6 = 1e6 N·mm²? Let's just use
    // E_eq [MPa] such that E_eq * Iz_m4 [in "solver units"] = d11 * b in solver units.
    //
    // The solver uses E in MPa, lengths in meters internally but we need to make
    // sure E * I matches physical stiffness.
    //
    // For the beam solver: δ = PL³/(3EI) where E is in MPa, I is geometric param in m⁴.
    // But MPa = N/mm², and the solver likely uses [mm, N, MPa] or [m, N].
    // Looking at helpers.rs: make_beam(n, L, E, A, Iz, ...) with E in MPa.
    //
    // The "effective E" for our laminate is simply Q11 (since all 0°)
    // and the cross-section is b_m * h_m with Iz = b_m * h_m³/12.
    // E_eff = Q11 (in MPa) and the deflection formula works.
    let e_eff: f64 = q11; // MPa — effective modulus for all-0° laminate
    let iz: f64 = iz_m4;  // m⁴

    let l: f64 = 0.200; // m (200 mm span)
    let p: f64 = 1.0;   // N
    let n = 8;

    // Exact cantilever tip deflection
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * 1000.0 * iz);

    // FEM solver
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let a_sec: f64 = b_m * h_m;
    let input = make_beam(n, l, e_eff, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");
    let delta_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    assert_close(delta_fem, delta_exact, 0.01, "Laminate beam EI from D11");

    // Cross-check: EI_eq from D11 matches E_eff * Iz
    let ei_from_d11: f64 = d11 * b_mm; // N·mm²
    let ei_from_eff: f64 = e_eff * iz * 1e12; // MPa * m⁴ * 1e12 = N/mm² * mm⁴ = N·mm²
    assert_close(ei_from_d11, ei_from_eff, 1e-6, "EI from D11 = E_eff * Iz");
}

// ================================================================
// 7. Thermal Residual Stress: Cure to Service Temperature
// ================================================================
//
// When a composite laminate is cured at elevated temperature T_cure and
// then cooled to service temperature T_service, thermal residual stresses
// develop due to CTE mismatch between plies.
//
// For a [0/90]s cross-ply laminate:
//   ε_thermal = α * ΔT  (free thermal strain per ply)
//   σ_residual = Q * (ε_laminate - ε_thermal_free)
//
// Since 0° and 90° plies have different CTEs (α1 << α2), the laminate
// settles at an average strain, and each ply develops stress.
//
// For symmetric balanced laminate, the laminate thermal strain:
//   ε_x^0 = (A11*N_T_x + A12*N_T_y) / (A11*A22 - A12²)   — simplified
// where N_T = Σ Q_k * α_k * ΔT * t_k
//
// Source: Herakovich, "Mechanics of Fibrous Composites", §5.6; Kaw, §4.5.

#[test]
fn validation_laminate_thermal_residual_stress() {
    // Material properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1;
    let denom: f64 = 1.0 - nu12 * nu21;

    // Q matrix
    let q11: f64 = e1 / denom;
    let q22: f64 = e2 / denom;
    let q12: f64 = nu12 * e2 / denom;

    // Coefficients of thermal expansion (1/°C)
    let alpha1: f64 = -0.3e-6;  // longitudinal (slightly negative for carbon)
    let alpha2: f64 = 28.0e-6;  // transverse

    // Temperature change: cure at 180°C, service at 20°C
    let dt: f64 = 20.0 - 180.0; // ΔT = -160°C (cooling)

    // [0/90]s laminate, 4 plies each of thickness t
    let t: f64 = 0.125; // mm
    let h_total: f64 = 4.0 * t;

    // Thermal force resultants N_T (force per unit width, N/mm)
    // For 0° ply: [Q]*{α}*ΔT, contributes to N_T_x and N_T_y
    // N_T_x = Σ (Q11_k * α1_k + Q12_k * α2_k) * ΔT * t_k
    // For 0° ply: α_x = α1, α_y = α2
    // For 90° ply: α_x = α2, α_y = α1

    let nt_x_0: f64 = (q11 * alpha1 + q12 * alpha2) * dt * t; // per 0° ply
    let nt_x_90: f64 = (q22 * alpha2 + q12 * alpha1) * dt * t; // per 90° ply (Q̄11=Q22, Q̄12=Q12)
    // Wait: for 90° ply, in the x-direction the stiffness is Q22 (since fibers are along y).
    // Actually more precisely: for 90° ply Q̄ matrix has Q̄11=Q22, Q̄22=Q11, Q̄12=Q12
    // and thermal: α_x(90°) = α2, α_y(90°) = α1
    // N_T_x from 90° ply: Q̄11*α_x + Q̄12*α_y = Q22*α2 + Q12*α1

    // Total (2 plies of each orientation for [0/90]s):
    let nt_x: f64 = 2.0 * nt_x_0 + 2.0 * nt_x_90;

    let nt_y_0: f64 = (q12 * alpha1 + q22 * alpha2) * dt * t;
    let nt_y_90: f64 = (q12 * alpha2 + q11 * alpha1) * dt * t;
    let nt_y: f64 = 2.0 * nt_y_0 + 2.0 * nt_y_90;

    // For symmetric cross-ply: N_T_x = N_T_y (because [0/90]s is balanced)
    assert_close(nt_x, nt_y, 1e-6, "N_T_x = N_T_y for balanced [0/90]s");

    // A matrix for [0/90]s
    let a11: f64 = 2.0 * q11 * t + 2.0 * q22 * t; // 2 plies of 0° + 2 plies of 90°
    let a22: f64 = a11; // balanced
    let a12: f64 = 4.0 * q12 * t; // Q12 same for 0° and 90°

    // Mid-plane strain: ε_x^0 = (A22*N_T_x - A12*N_T_y) / (A11*A22 - A12²)
    let det_a: f64 = a11 * a22 - a12.powi(2);
    let eps_x0: f64 = (a22 * nt_x - a12 * nt_y) / det_a;
    let eps_y0: f64 = (a11 * nt_y - a12 * nt_x) / det_a;

    // For balanced symmetric cross-ply: ε_x = ε_y
    assert_close(eps_x0, eps_y0, 1e-10, "ε_x = ε_y for balanced [0/90]s");

    // Residual stress in 0° ply (in x-direction):
    // σ_x = Q11*(ε_x - α1*ΔT) + Q12*(ε_y - α2*ΔT)
    let sigma_x_0: f64 = q11 * (eps_x0 - alpha1 * dt) + q12 * (eps_y0 - alpha2 * dt);

    // Residual stress in 90° ply (in x-direction):
    // σ_x = Q̄11*(ε_x - α2*ΔT) + Q̄12*(ε_y - α1*ΔT)  where Q̄11=Q22 for 90°
    let sigma_x_90: f64 = q22 * (eps_x0 - alpha2 * dt) + q12 * (eps_y0 - alpha1 * dt);

    // Force equilibrium: resultant of residual stresses through thickness = 0
    // (since N_T was accounted for in the strain calculation)
    // For a free laminate (no external loads), ε_0 = [A]^-1 * N_T
    // So: Σ σ_k*t_k = [A]*ε_0 - N_T = N_T - N_T = 0
    // The stress resultant through thickness must be zero (self-equilibrating).
    let n_residual: f64 = 2.0 * sigma_x_0 * t + 2.0 * sigma_x_90 * t;
    assert!(n_residual.abs() < 1e-3, "Self-equilibrating residual: n_res={:.6}", n_residual);

    // CTE mismatch should produce non-zero stresses (not trivially zero)
    assert!(
        sigma_x_0.abs() > 1.0,
        "0° ply residual stress should be non-trivial: σ={:.2} MPa", sigma_x_0
    );
    assert!(
        sigma_x_90.abs() > 1.0,
        "90° ply residual stress should be non-trivial: σ={:.2} MPa", sigma_x_90
    );

    // Stresses should be opposite in sign (equilibrium condition for free laminate)
    // After accounting for the fact that they have different magnitudes due to different Q
    // Actually: for the "free" thermal strain problem (no external force), the residual
    // stresses must self-equilibrate: 2*σ_0*t + 2*σ_90*t = 0 (no net force).
    // But we computed N_T != 0. The actual residual stress above the "mean" is:
    // σ_res_0 = Q11*(ε_x - α1*ΔT) + Q12*(ε_y - α2*ΔT) which includes the mean strain.
    // The key check is that stresses are opposite for the two ply orientations:
    assert!(
        sigma_x_0 * sigma_x_90 < 0.0,
        "0° and 90° ply stresses should be opposite sign: σ_0={:.2}, σ_90={:.2}",
        sigma_x_0, sigma_x_90
    );
}

// ================================================================
// 8. Effective Modulus: Laminate Ex, Ey from Compliance Matrix
// ================================================================
//
// The effective in-plane moduli of a laminate are obtained from the
// extensional compliance matrix [a] = [A]⁻¹:
//   Ex = 1 / (h * a11)
//   Ey = 1 / (h * a22)
//   νxy = -a12 / a11
//
// For a balanced symmetric laminate, Ex = Ey if the layup is quasi-isotropic
// or balanced cross-ply. For [0/90]s: Ex = Ey by symmetry of the layup.
//
// Source: Jones, §4.4; Daniel & Ishai, §7.2.

#[test]
fn validation_laminate_effective_modulus() {
    // Material properties
    let e1: f64 = 140_000.0; // MPa
    let e2: f64 = 10_000.0;  // MPa
    let nu12: f64 = 0.30;
    let nu21: f64 = nu12 * e2 / e1;
    let denom: f64 = 1.0 - nu12 * nu21;

    // Q matrix
    let q11: f64 = e1 / denom;
    let q22: f64 = e2 / denom;
    let q12: f64 = nu12 * e2 / denom;

    // [0/90]s laminate, 4 plies of thickness t
    let t: f64 = 0.125; // mm per ply
    let h: f64 = 4.0 * t;   // 0.5 mm total

    // A matrix (force per unit width per strain): [0/90]s balanced
    let a11: f64 = 2.0 * q11 * t + 2.0 * q22 * t;
    let a22: f64 = a11; // balanced cross-ply
    let a12: f64 = 4.0 * q12 * t;

    // Invert 2x2 [A] to get [a] = [A]⁻¹
    let det_a: f64 = a11 * a22 - a12.powi(2);
    let a_inv_11: f64 = a22 / det_a;
    let a_inv_22: f64 = a11 / det_a;
    let a_inv_12: f64 = -a12 / det_a;

    // Effective moduli
    let ex: f64 = 1.0 / (h * a_inv_11);
    let ey: f64 = 1.0 / (h * a_inv_22);
    let nu_xy: f64 = -a_inv_12 / a_inv_11;

    // For balanced cross-ply [0/90]s: Ex = Ey
    assert_close(ex, ey, 1e-10, "Ex = Ey for balanced [0/90]s");

    // Effective modulus should be between E1 and E2
    assert!(
        ex > e2 && ex < e1,
        "Ex={:.2} should be between E2={:.2} and E1={:.2}", ex, e2, e1
    );

    // For [0/90]s: Ex ≈ (E1 + E2) / 2 approximately (equal thickness plies)
    // More precisely: Ex = (A11*A22 - A12²) / (A22 * h)
    //                    = (A11 - A12²/A22) / h
    let ex_check: f64 = (a11 - a12.powi(2) / a22) / h;
    assert_close(ex, ex_check, 1e-10, "Ex from compliance = direct formula");

    // Poisson's ratio should be positive and reasonable
    assert!(
        nu_xy > 0.0 && nu_xy < 0.5,
        "νxy={:.4} should be between 0 and 0.5", nu_xy
    );

    // Validate with beam solver: cantilever with effective Ex
    let l: f64 = 0.500; // m
    let b_width: f64 = 0.050; // m (50 mm)
    let h_m: f64 = h / 1000.0; // m
    let a_sec: f64 = b_width * h_m;
    let iz: f64 = b_width * h_m.powi(3) / 12.0;
    let p: f64 = 0.5; // N
    let n = 8;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, ex, a_sec, iz, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");
    let delta_fem: f64 = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();
    let delta_exact: f64 = p * l.powi(3) / (3.0 * ex * 1000.0 * iz);

    assert_close(delta_fem, delta_exact, 0.01, "Effective modulus beam deflection");

    // Verify: beam with Ex gives same deflection as beam with equivalent E
    // (since Ex already is the effective modulus, this is a tautology check)
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input2 = make_beam(n, l, ey, a_sec, iz, "fixed", None, loads2);
    let res2 = solve_2d(&input2).expect("solve");
    let delta_fem2: f64 = res2.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();
    assert_close(delta_fem, delta_fem2, 1e-10, "Ex = Ey gives same deflection");

    // Also verify the laminate is stiffer than pure E2 but softer than pure E1
    let loads_e2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_e2 = make_beam(n, l, e2, a_sec, iz, "fixed", None, loads_e2);
    let res_e2 = solve_2d(&input_e2).expect("solve");
    let delta_e2: f64 = res_e2.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    let loads_e1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_e1 = make_beam(n, l, e1, a_sec, iz, "fixed", None, loads_e1);
    let res_e1 = solve_2d(&input_e1).expect("solve");
    let delta_e1: f64 = res_e1.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    assert!(
        delta_fem > delta_e1 && delta_fem < delta_e2,
        "δ_laminate={:.6e} should be between δ_E1={:.6e} and δ_E2={:.6e}",
        delta_fem, delta_e1, delta_e2
    );
}
