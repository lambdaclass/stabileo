/// Validation: Shell and Membrane Theory
///
/// References:
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed.
///   - Ventsel & Krauthammer, "Thin Plates and Shells", Marcel Dekker
///   - Flügge, "Stresses in Shells", Springer
///   - Billington, "Thin Shell Concrete Structures", McGraw-Hill
///   - Zingoni, "Shell Structures in Civil and Mechanical Engineering"
///   - Donnell, "Stability of Thin-Walled Tubes Under Torsion", NACA 479 (1933)
///
/// Tests verify shell/membrane theory formulas without calling the solver.
/// Pure arithmetic verification of analytical expressions.

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
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Spherical Pressure Vessel — Membrane Stress
// ================================================================
//
// A thin-walled spherical pressure vessel of radius R and thickness t
// under internal pressure p has uniform membrane stress:
//   σ = pR / (2t)
//
// Reference: Timoshenko & Woinowsky-Krieger, Sec 14.1
// Example: R = 2.0 m, t = 0.02 m, p = 1.5 MPa
//   σ = 1.5 * 2.0 / (2 * 0.02) = 75.0 MPa

#[test]
fn validation_spherical_pressure_vessel_membrane_stress() {
    let r: f64 = 2.0;     // m, radius
    let t: f64 = 0.02;    // m, wall thickness
    let p: f64 = 1.5;     // MPa, internal pressure

    let sigma: f64 = p * r / (2.0 * t);
    assert_close(sigma, 75.0, 1e-10, "Spherical vessel σ = pR/(2t)");

    // Von Mises stress for equi-biaxial state: σ_vm = σ (since σ₁ = σ₂ = σ)
    let sigma_vm: f64 = sigma; // biaxial equal → VM = σ
    assert_close(sigma_vm, 75.0, 1e-10, "Spherical vessel von Mises = σ");

    // Volumetric strain: ε_v = 3σ(1-ν)/(E) for biaxial
    let e: f64 = 200e3;   // MPa
    let nu: f64 = 0.3;
    let eps_v: f64 = 3.0 * sigma * (1.0 - nu) / e;
    let expected_eps_v: f64 = 3.0 * 75.0 * 0.7 / 200e3;
    assert_close(eps_v, expected_eps_v, 1e-10, "Spherical vessel volumetric strain");
}

// ================================================================
// 2. Cylindrical Shell Under Internal Pressure
// ================================================================
//
// Thin-walled cylinder (R, t) under internal pressure p:
//   Hoop (circumferential) stress: σ₁ = pR/t
//   Longitudinal stress:           σ₂ = pR/(2t)
//   σ₁ = 2σ₂ (hoop is governing)
//
// Reference: Timoshenko & Woinowsky-Krieger, Sec 14.2
// Example: R = 1.5 m, t = 0.015 m, p = 2.0 MPa

#[test]
fn validation_cylindrical_shell_internal_pressure() {
    let r: f64 = 1.5;     // m, radius
    let t: f64 = 0.015;   // m, wall thickness
    let p: f64 = 2.0;     // MPa, internal pressure

    let sigma_hoop: f64 = p * r / t;
    let sigma_long: f64 = p * r / (2.0 * t);

    assert_close(sigma_hoop, 200.0, 1e-10, "Cylinder hoop σ₁ = pR/t");
    assert_close(sigma_long, 100.0, 1e-10, "Cylinder longitudinal σ₂ = pR/(2t)");
    assert_close(sigma_hoop, 2.0 * sigma_long, 1e-10, "σ₁ = 2σ₂");

    // Von Mises for biaxial: σ_vm = √(σ₁² - σ₁σ₂ + σ₂²)
    let sigma_vm: f64 = (sigma_hoop.powi(2) - sigma_hoop * sigma_long + sigma_long.powi(2)).sqrt();
    let expected_vm: f64 = (200.0_f64.powi(2) - 200.0 * 100.0 + 100.0_f64.powi(2)).sqrt();
    assert_close(sigma_vm, expected_vm, 1e-10, "Cylinder von Mises stress");

    // R/t ratio check for thin-wall validity
    let r_over_t: f64 = r / t;
    assert!(r_over_t > 10.0, "R/t = {} should be > 10 for thin-wall", r_over_t);
}

// ================================================================
// 3. Conical Shell Membrane Stresses
// ================================================================
//
// Conical shell of half-angle α, radius r at a given latitude, thickness t,
// under internal pressure p:
//   Meridional stress: σ_φ = p r / (2 t cos α)
//   Hoop stress:       σ_θ = p r / (t cos α)
//
// Reference: Ventsel & Krauthammer, Ch. 13
// Example: half-angle α = 30°, r = 1.0 m at section, t = 0.01 m, p = 1.0 MPa

#[test]
fn validation_conical_shell_membrane_stresses() {
    let alpha_deg: f64 = 30.0;
    let alpha: f64 = alpha_deg * PI / 180.0;
    let r: f64 = 1.0;     // m, radius at section
    let t: f64 = 0.01;    // m, thickness
    let p: f64 = 1.0;     // MPa

    let cos_alpha: f64 = alpha.cos();
    assert_close(cos_alpha, (3.0_f64).sqrt() / 2.0, 1e-10, "cos(30°)");

    let sigma_meridional: f64 = p * r / (2.0 * t * cos_alpha);
    let sigma_hoop: f64 = p * r / (t * cos_alpha);

    // Expected: σ_φ = 1.0 * 1.0 / (2 * 0.01 * cos30°) = 1 / (0.02 * 0.8660) = 57.735 MPa
    let expected_meridional: f64 = 1.0 / (0.02 * cos_alpha);
    assert_close(sigma_meridional, expected_meridional, 1e-10, "Cone meridional σ_φ");

    // Hoop is 2x meridional (same ratio as cylinder)
    assert_close(sigma_hoop, 2.0 * sigma_meridional, 1e-10, "Cone σ_θ = 2σ_φ");

    // At apex (r→0), stresses vanish (unlike sphere)
    let sigma_apex: f64 = p * 0.0 / (2.0 * t * cos_alpha);
    assert_close(sigma_apex, 0.0, 1e-12, "Cone membrane stress at apex = 0");
}

// ================================================================
// 4. Edge Bending in Cylindrical Shell (Geckeler Approximation)
// ================================================================
//
// At a junction (e.g., cylinder-head), membrane theory alone violates
// compatibility, producing edge bending effects. The bending length
// (decay length) is approximately:
//   λ = (R t)^(1/2) / [3(1-ν²)]^(1/4)   (simplified Geckeler)
//
// More commonly written: characteristic length ℓ_b = √(R·t) × factor
// The bending disturbance decays as e^(-x/ℓ_b), practically zero at 4ℓ_b.
//
// Standard form: β = [3(1-ν²)]^(1/4) / √(R·t) and ℓ_b = π/β
//
// Reference: Flügge, Ch. 5; Timoshenko & Woinowsky-Krieger, Sec 15.4

#[test]
fn validation_edge_bending_cylindrical_shell() {
    let r: f64 = 2.0;     // m, radius
    let t: f64 = 0.02;    // m, thickness
    let nu: f64 = 0.3;

    // β = [3(1-ν²)]^{1/4} / √(Rt)
    let factor: f64 = (3.0 * (1.0 - nu * nu)).powf(0.25);
    let rt_sqrt: f64 = (r * t).sqrt();
    let beta: f64 = factor / rt_sqrt;

    // Expected factor = [3(1-0.09)]^0.25 = [2.73]^0.25 = 1.2849
    let expected_factor: f64 = (3.0 * 0.91_f64).powf(0.25);
    assert_close(factor, expected_factor, 1e-10, "Geckeler factor [3(1-ν²)]^¼");

    // √(Rt) = √(0.04) = 0.2
    assert_close(rt_sqrt, 0.2, 1e-10, "√(Rt)");

    // β = 1.2849 / 0.2 = 6.425
    let expected_beta: f64 = expected_factor / 0.2;
    assert_close(beta, expected_beta, 1e-10, "β characteristic parameter");

    // Bending length ℓ_b = π/β
    let ell_b: f64 = PI / beta;
    let expected_ell_b: f64 = PI / expected_beta;
    assert_close(ell_b, expected_ell_b, 1e-10, "Bending length π/β");

    // Practical decay: at x = π/β, bending moment decayed to e^{-π} ≈ 4.3% of edge value
    let decay_at_pi_over_beta: f64 = (-PI as f64).exp();
    assert_close(decay_at_pi_over_beta, (-PI).exp(), 1e-10, "Decay factor e^{-π}");
    assert!(decay_at_pi_over_beta < 0.05, "Edge bending decays to < 5% at one ℓ_b");
}

// ================================================================
// 5. Donnell Stability: Cylindrical Shell Under Axial Compression
// ================================================================
//
// Classical buckling stress for a perfect thin cylinder under axial compression:
//   σ_cr = E t / [R √(3(1-ν²))]
//
// This is the Donnell-type classical solution. Real shells buckle at
// much lower loads due to imperfections (knockdown factor ~0.2-0.3).
//
// Reference: Donnell (1933), Timoshenko & Gere "Theory of Elastic Stability"

#[test]
fn validation_donnell_cylindrical_shell_buckling() {
    let e: f64 = 200e3;   // MPa
    let r: f64 = 1.0;     // m
    let t: f64 = 0.005;   // m, 5 mm thickness
    let nu: f64 = 0.3;

    // Classical buckling stress
    let sigma_cr: f64 = e * t / (r * (3.0 * (1.0 - nu * nu)).sqrt());
    let denominator: f64 = (3.0 * 0.91_f64).sqrt();
    let expected_cr: f64 = 200e3 * 0.005 / (1.0 * denominator);
    assert_close(sigma_cr, expected_cr, 1e-10, "Donnell σ_cr = Et/[R√(3(1-ν²))]");

    // Numerical check: σ_cr ≈ 200000 * 0.005 / 1.6523 ≈ 605.3 MPa
    assert_close(sigma_cr, 1000.0 / denominator, 1e-10, "Donnell numerical value");

    // Knockdown factor for real shells (NASA SP-8007 recommends ~0.2-0.3 for R/t > 100)
    let r_over_t: f64 = r / t;
    assert_close(r_over_t, 200.0, 1e-10, "R/t ratio");
    let knockdown: f64 = 0.25;
    let sigma_design: f64 = knockdown * sigma_cr;
    assert!(sigma_design < sigma_cr, "Design stress < classical critical stress");
    assert_close(sigma_design, 0.25 * sigma_cr, 1e-10, "Design stress with knockdown");
}

// ================================================================
// 6. Barrel Vault Under Self-Weight (Arch Action)
// ================================================================
//
// A cylindrical barrel vault of radius R, span angle 2φ₀, length L,
// under self-weight w (per unit area of middle surface):
//
// Using membrane theory, the meridional resultant:
//   N_φ = -w R cos φ     (compression, arch action)
// The hoop resultant:
//   N_x = -w R cos²φ / cos φ₀  at the crown (simplified for long barrel)
//
// Thrust at supports (φ = φ₀):
//   H = w R cos φ₀  (horizontal component of meridional force)
//
// Reference: Billington, "Thin Shell Concrete Structures", Ch. 7

#[test]
fn validation_barrel_vault_self_weight() {
    let r: f64 = 10.0;       // m, radius
    let phi0_deg: f64 = 40.0; // half opening angle
    let phi0: f64 = phi0_deg * PI / 180.0;
    let w: f64 = 5.0;        // kN/m², self-weight

    // At crown (φ = 0): N_φ = -wR
    let n_phi_crown: f64 = -w * r;
    assert_close(n_phi_crown, -50.0, 1e-10, "Barrel vault N_φ at crown = -wR");

    // At support (φ = φ₀): N_φ = -wR cos(φ₀)
    let n_phi_support: f64 = -w * r * phi0.cos();
    let expected_support: f64 = -50.0 * phi0.cos();
    assert_close(n_phi_support, expected_support, 1e-10, "Barrel vault N_φ at support");

    // Horizontal thrust at springing
    let h: f64 = w * r * phi0.cos();
    assert_close(h, 50.0 * phi0.cos(), 1e-10, "Horizontal thrust H = wR cos φ₀");

    // Vertical reaction per unit length of vault
    // V = w R sin(φ₀) (from equilibrium of half arch)
    let v: f64 = w * r * phi0.sin();
    assert_close(v, 50.0 * phi0.sin(), 1e-10, "Vertical reaction V = wR sin φ₀");

    // Check: H² + V² = (wR)² (resultant = wR along meridional)
    let resultant_sq: f64 = h * h + v * v;
    assert_close(resultant_sq, (w * r).powi(2), 1e-10, "H² + V² = (wR)²");
}

// ================================================================
// 7. Ring Stiffener Effective Width
// ================================================================
//
// When a cylindrical shell is stiffened by ring frames, only part of
// the shell plate acts with the ring. The effective width of shell
// plating on each side of the ring is:
//   b_eff = 0.78 √(R t)     (for closely spaced frames)
// or limited by frame spacing L_s:
//   b_eff = min(0.78√(Rt), L_s/2)
//
// Reference: DNV-RP-C202 / ABS "Buckling and Ultimate Strength of Shells"

#[test]
fn validation_ring_stiffener_effective_width() {
    let r: f64 = 3.0;        // m, cylinder radius
    let t: f64 = 0.012;      // m, shell thickness
    let l_s: f64 = 1.5;      // m, frame spacing

    // Effective width on each side
    let b_eff_formula: f64 = 0.78 * (r * t).sqrt();
    let b_eff: f64 = b_eff_formula.min(l_s / 2.0);

    // √(Rt) = √(0.036) = 0.18974
    let rt_sqrt: f64 = (r * t).sqrt();
    assert_close(rt_sqrt, (0.036_f64).sqrt(), 1e-10, "√(Rt)");

    // b_eff_formula = 0.78 * 0.18974 = 0.14800
    let expected_b: f64 = 0.78 * rt_sqrt;
    assert_close(b_eff_formula, expected_b, 1e-10, "0.78√(Rt) formula");

    // L_s/2 = 0.75, so formula governs (0.148 < 0.75)
    assert_close(b_eff, b_eff_formula, 1e-10, "Effective width governed by formula");

    // Total effective width (both sides of ring)
    let b_eff_total: f64 = 2.0 * b_eff;
    assert_close(b_eff_total, 2.0 * b_eff_formula, 1e-10, "Total effective width");

    // Moment of inertia contribution: A_eff = b_eff_total * t
    let a_eff: f64 = b_eff_total * t;
    let expected_a: f64 = 2.0 * expected_b * t;
    assert_close(a_eff, expected_a, 1e-10, "Effective shell area");
}

// ================================================================
// 8. Toroidal Shell Membrane Stresses (Inside vs Outside)
// ================================================================
//
// A toroidal shell (torus) of tube radius r and center-line radius R,
// thickness t, under internal pressure p:
//
// At the outer equator (φ = 0):
//   σ_θ = pR/(2t) × (2R + r)/(R + r)   (hoop, circumferential)
//   σ_φ = pr/(2t)                         (meridional in tube)
//
// At the inner equator (φ = π):
//   σ_θ = pR/(2t) × (2R - r)/(R - r)   (hoop)
//   σ_φ = pr/(2t)                         (meridional, same)
//
// The inner equator has higher hoop stress than outer when R > r.
//
// Reference: Flügge, "Stresses in Shells", Ch. 3; Zingoni, Ch. 5

#[test]
fn validation_toroidal_shell_membrane_stresses() {
    let big_r: f64 = 5.0;   // m, center-line radius (torus center to tube center)
    let r: f64 = 1.0;       // m, tube radius
    let t: f64 = 0.01;      // m, wall thickness
    let p: f64 = 0.8;       // MPa, internal pressure

    // Meridional stress (constant around tube cross-section)
    let sigma_phi: f64 = p * r / (2.0 * t);
    assert_close(sigma_phi, 0.8 * 1.0 / 0.02, 1e-10, "Torus meridional σ_φ = pr/(2t)");
    assert_close(sigma_phi, 40.0, 1e-10, "Torus σ_φ = 40 MPa");

    // Hoop stress at outer equator (φ = 0, ρ = R + r)
    let sigma_theta_outer: f64 = p * big_r / (2.0 * t) * (2.0 * big_r + r) / (big_r + r);
    // = 0.8 * 5 / 0.02 * (10+1)/(5+1) = 200 * 11/6 = 366.667 MPa
    let expected_outer: f64 = 200.0 * 11.0 / 6.0;
    assert_close(sigma_theta_outer, expected_outer, 1e-10, "Torus hoop σ_θ at outer equator");

    // Hoop stress at inner equator (φ = π, ρ = R - r)
    let sigma_theta_inner: f64 = p * big_r / (2.0 * t) * (2.0 * big_r - r) / (big_r - r);
    // = 200 * (10-1)/(5-1) = 200 * 9/4 = 450 MPa
    let expected_inner: f64 = 200.0 * 9.0 / 4.0;
    assert_close(sigma_theta_inner, expected_inner, 1e-10, "Torus hoop σ_θ at inner equator");

    // Inner hoop > outer hoop (stress concentration on inside of torus)
    assert!(
        sigma_theta_inner > sigma_theta_outer,
        "Inner equator hoop stress should exceed outer: {} > {}",
        sigma_theta_inner, sigma_theta_outer
    );
}
