/// Validation: Fracture Mechanics — Pure-Math Formulas
///
/// References:
///   - Anderson, "Fracture Mechanics: Fundamentals and Applications", 4th ed. (2017)
///   - Tada, Paris & Irwin, "The Stress Analysis of Cracks Handbook", 3rd ed. (2000)
///   - Griffith, "The phenomena of rupture and flow in solids", Phil. Trans. (1921)
///   - Paris & Erdogan, "A critical analysis of crack propagation laws", J. Basic Eng. (1963)
///   - Rice, "A path independent integral...", J. Appl. Mech. (1968)
///   - Irwin, "Analysis of stresses and strains near the end of a crack", J. Appl. Mech. (1957)
///   - Broek, "Elementary Engineering Fracture Mechanics", 4th ed. (1986)
///   - BS 7910:2019 — Guide to methods for assessing the acceptability of flaws
///
/// Tests verify fracture mechanics formulas with hand-computed expected values.
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
// 1. Griffith Energy Release Rate — Plane Stress & Plane Strain
// ================================================================
//
// For a central crack of length 2a in an infinite plate under uniform
// tensile stress sigma:
//
//   G = pi * sigma^2 * a / E            (plane stress)
//   G = pi * sigma^2 * a * (1 - nu^2) / E  (plane strain)
//
// And the critical condition G = Gc gives:
//   sigma_cr = sqrt(E * Gc / (pi * a))   (plane stress)
//
// Ref: Anderson Ch.2, Griffith (1921)

#[test]
fn validation_griffith_energy_release_rate() {
    let e_modulus: f64 = 70_000.0; // MPa (aluminum)
    let nu: f64 = 0.33;
    let sigma: f64 = 100.0; // MPa
    let a: f64 = 0.010; // half-crack length in meters (10 mm)

    // Plane stress: G = pi * sigma^2 * a / E
    let g_plane_stress = PI * sigma * sigma * a / e_modulus;
    // = pi * 10000 * 0.01 / 70000 = pi * 100 / 70000
    let expected_ps = PI * 100.0 / 70_000.0;
    assert_close(g_plane_stress, expected_ps, 1e-12, "G plane stress");

    // Plane strain: G = pi * sigma^2 * a * (1 - nu^2) / E
    let g_plane_strain = PI * sigma * sigma * a * (1.0 - nu * nu) / e_modulus;
    let expected_pe = expected_ps * (1.0 - nu * nu);
    assert_close(g_plane_strain, expected_pe, 1e-12, "G plane strain");

    // Ratio: G_plane_strain / G_plane_stress = (1 - nu^2)
    let ratio = g_plane_strain / g_plane_stress;
    assert_close(ratio, 1.0 - nu * nu, 1e-12, "plane strain/stress ratio");

    // Critical stress from Gc (Griffith criterion)
    let _gc: f64 = 0.020; // kJ/m^2 = 20 J/m^2 -> need consistent units
    // Using E in MPa = N/mm^2, a in mm: sigma_cr in MPa
    let a_mm: f64 = 10.0;
    let gc_nmm: f64 = 0.020; // N/mm (= 20 J/m^2 = 20 N*m/m^2 = 0.020 N*mm/mm^2 = 0.020 N/mm)
    let sigma_cr = (e_modulus * gc_nmm / (PI * a_mm)).sqrt();
    // = sqrt(70000 * 0.020 / (pi * 10)) = sqrt(1400 / 31.416) = sqrt(44.563)
    let expected_cr = (70_000.0_f64 * 0.020 / (PI * 10.0)).sqrt();
    assert_close(sigma_cr, expected_cr, 1e-12, "Griffith critical stress");
}

// ================================================================
// 2. Stress Intensity Factor — Mode I, Central Crack
// ================================================================
//
// For a central crack of length 2a in an infinite plate:
//   K_I = sigma * sqrt(pi * a)
//
// For a finite-width plate (width W):
//   K_I = sigma * sqrt(pi * a) * F(a/W)
//   where F(a/W) ≈ sqrt(sec(pi*a/W))   (Tada et al.)
//
// Fracture condition: K_I = K_Ic
//
// Ref: Tada, Paris & Irwin (2000), Anderson Ch.2

#[test]
fn validation_stress_intensity_factor_mode_i() {
    let sigma: f64 = 150.0; // MPa
    let a: f64 = 5.0; // mm half-crack length

    // Infinite plate: K_I = sigma * sqrt(pi * a)
    let k_inf = sigma * (PI * a).sqrt();
    let expected_k = 150.0 * (PI * 5.0).sqrt();
    assert_close(k_inf, expected_k, 1e-12, "K_I infinite plate");

    // Numerical value: sqrt(pi*5) = sqrt(15.708) = 3.9633
    // K_I = 150 * 3.9633 = 594.49 MPa*sqrt(mm)
    let k_numerical = 150.0 * (PI * 5.0_f64).sqrt();
    assert_close(k_inf, k_numerical, 1e-12, "K_I numerical check");

    // Finite width correction: F(a/W) = sqrt(sec(pi*a/W))
    let w: f64 = 50.0; // mm plate width
    let a_over_w = a / w; // = 0.1
    let f_corr = (PI * a_over_w).cos().recip().sqrt();
    let k_finite = sigma * (PI * a).sqrt() * f_corr;

    // F(0.1) = sqrt(sec(pi*0.1)) = sqrt(1/cos(0.3142)) = sqrt(1/0.9511) = sqrt(1.0514) = 1.02536
    let f_expected = (1.0_f64 / (PI * 0.1).cos()).sqrt();
    assert_close(f_corr, f_expected, 1e-10, "finite width correction F(a/W)");
    assert!(k_finite > k_inf, "finite width K should exceed infinite plate K");

    // For a/W -> 0, F -> 1.0
    let a_small: f64 = 0.001;
    let w_large: f64 = 1000.0;
    let f_small = (1.0_f64 / (PI * a_small / w_large).cos()).sqrt();
    assert_close(f_small, 1.0, 1e-6, "F(a/W) -> 1 for small cracks");
}

// ================================================================
// 3. Paris Law — Fatigue Crack Growth
// ================================================================
//
// da/dN = C * (delta_K)^m
//
// For a central crack: delta_K = delta_sigma * sqrt(pi * a)
//
// Integrating for cycles to failure from a_i to a_f:
//   N = integral from a_i to a_f of da / [C * (delta_sigma * sqrt(pi*a))^m]
//
// For m != 2:
//   N = 2 / [(m-2) * C * (delta_sigma * sqrt(pi))^m] * [a_i^(1-m/2) - a_f^(1-m/2)]
//
// Ref: Paris & Erdogan (1963), Anderson Ch.10

#[test]
fn validation_paris_law_fatigue_crack_growth() {
    let c_paris: f64 = 1.5e-11; // Paris constant (mm/cycle units)
    let m_paris: f64 = 3.0; // Paris exponent (typical for steel)
    let delta_sigma: f64 = 100.0; // MPa stress range
    let a_i: f64 = 1.0; // mm initial crack
    let a_f: f64 = 10.0; // mm final crack

    // Growth rate at initial crack size
    let dk_i = delta_sigma * (PI * a_i).sqrt();
    let da_dn_i = c_paris * dk_i.powf(m_paris);

    // dk_i = 100 * sqrt(pi) = 177.245
    let dk_expected = 100.0 * PI.sqrt();
    assert_close(dk_i, dk_expected, 1e-10, "delta_K at initial crack");

    // da/dN = 1.5e-11 * 177.245^3 = 1.5e-11 * 5.568e6 = 8.352e-5 mm/cycle
    let da_dn_expected = 1.5e-11_f64 * dk_expected.powf(3.0);
    assert_close(da_dn_i, da_dn_expected, 1e-10, "da/dN at initial crack");

    // Cycles to failure for m = 3 (m != 2):
    // N = 2 / [(m-2)*C*(delta_sigma*sqrt(pi))^m] * [a_i^(1-m/2) - a_f^(1-m/2)]
    // = 2 / [1 * 1.5e-11 * (100*sqrt(pi))^3] * [1^(-0.5) - 10^(-0.5)]
    // = 2 / [1.5e-11 * 5.568e6] * [1.0 - 0.31623]
    // = 2 / 8.352e-5 * 0.68377
    // = 23952.1 * 0.68377
    // = 16373 cycles
    let factor = 2.0
        / ((m_paris - 2.0) * c_paris * (delta_sigma * PI.sqrt()).powf(m_paris));
    let n_cycles = factor * (a_i.powf(1.0 - m_paris / 2.0) - a_f.powf(1.0 - m_paris / 2.0));

    assert!(n_cycles > 0.0, "cycles to failure must be positive");

    // Cross-check: growth rate at final crack should be much larger
    let dk_f = delta_sigma * (PI * a_f).sqrt();
    let da_dn_f = c_paris * dk_f.powf(m_paris);
    let rate_ratio = da_dn_f / da_dn_i;
    // ratio = (a_f/a_i)^(m/2) = 10^1.5 = 31.623
    let expected_ratio = (a_f / a_i).powf(m_paris / 2.0);
    assert_close(rate_ratio, expected_ratio, 1e-10, "crack growth rate ratio");
}

// ================================================================
// 4. J-Integral — Elastic Equivalence to G and K
// ================================================================
//
// Under linear elastic conditions:
//   J = G = K_I^2 / E'
//
// where E' = E (plane stress), E' = E/(1-nu^2) (plane strain)
//
// For power-law hardening (HRR field):
//   J = alpha * sigma_0 * epsilon_0 * a * h(n, theta)
//
// But the elastic relationship is the key validation here.
//
// Ref: Rice (1968), Anderson Ch.3

#[test]
fn validation_j_integral_elastic_equivalence() {
    let e_modulus: f64 = 200_000.0; // MPa (steel)
    let nu: f64 = 0.30;
    let sigma: f64 = 200.0; // MPa
    let a: f64 = 8.0; // mm half-crack

    // K_I for infinite plate
    let k_i = sigma * (PI * a).sqrt();

    // Plane stress: J = K^2 / E
    let j_ps = k_i * k_i / e_modulus;

    // Plane strain: J = K^2 * (1 - nu^2) / E
    let j_pe = k_i * k_i * (1.0 - nu * nu) / e_modulus;

    // Also compute G directly: G = pi * sigma^2 * a / E (plane stress)
    let g_ps = PI * sigma * sigma * a / e_modulus;

    // J should equal G in linear elastic case
    assert_close(j_ps, g_ps, 1e-10, "J = G plane stress");

    // Plane strain G
    let g_pe = PI * sigma * sigma * a * (1.0 - nu * nu) / e_modulus;
    assert_close(j_pe, g_pe, 1e-10, "J = G plane strain");

    // Ratio check
    let ratio = j_pe / j_ps;
    assert_close(ratio, 1.0 - nu * nu, 1e-10, "J_pe/J_ps = 1-nu^2");

    // Energy interpretation: J = -dU/da (per unit thickness)
    // For finite crack in infinite plate: U = U_0 - pi*sigma^2*a^2/E
    // dU/da = -2*pi*sigma^2*a/E
    // J (both crack tips) = pi*sigma^2*a/E (per tip)
    // This confirms our G = J relationship
    let du_da_per_tip = PI * sigma * sigma * a / e_modulus;
    assert_close(j_ps, du_da_per_tip, 1e-10, "J = dU/da energy consistency");
}

// ================================================================
// 5. Irwin Plastic Zone Size
// ================================================================
//
// The Irwin estimate for the plastic zone radius ahead of a Mode I crack tip:
//   r_y = (1/(2*pi)) * (K_I / sigma_y)^2     (plane stress)
//   r_y = (1/(6*pi)) * (K_I / sigma_y)^2     (plane strain, approximate)
//
// Effective crack length: a_eff = a + r_y
//
// Ref: Irwin (1957), Anderson Ch.2, Broek Ch.4

#[test]
fn validation_irwin_plastic_zone_size() {
    let sigma_y: f64 = 350.0; // MPa yield stress
    let sigma: f64 = 100.0; // MPa applied stress
    let a: f64 = 20.0; // mm half-crack

    let k_i = sigma * (PI * a).sqrt();

    // Plane stress plastic zone
    let r_y_ps = (1.0 / (2.0 * PI)) * (k_i / sigma_y).powi(2);

    // K_I = 100 * sqrt(pi*20) = 100 * 7.9266 = 792.66 MPa*sqrt(mm)
    // (K_I/sigma_y)^2 = (792.66/350)^2 = 2.2648^2 = 5.129
    // r_y = 5.129 / (2*pi) = 0.8165 mm
    let k_val = 100.0 * (PI * 20.0_f64).sqrt();
    let r_expected_ps = (k_val / sigma_y).powi(2) / (2.0 * PI);
    assert_close(r_y_ps, r_expected_ps, 1e-10, "plastic zone plane stress");

    // Plane strain plastic zone (smaller by factor of 3)
    let r_y_pe = (1.0 / (6.0 * PI)) * (k_i / sigma_y).powi(2);
    let ratio = r_y_ps / r_y_pe;
    assert_close(ratio, 3.0, 1e-10, "plane stress/strain zone ratio = 3");

    // Effective crack length correction
    let a_eff_ps = a + r_y_ps;
    let k_eff = sigma * (PI * a_eff_ps).sqrt();
    assert!(k_eff > k_i, "effective K should exceed uncorrected K");

    // Small-scale yielding check: r_y << a
    assert!(
        r_y_ps < a / 5.0,
        "small-scale yielding: r_y ({:.3}) should be much less than a ({:.1})",
        r_y_ps,
        a
    );
}

// ================================================================
// 6. Crack Tip Opening Displacement (CTOD) — Irwin-Dugdale
// ================================================================
//
// Dugdale strip-yield model (plane stress):
//   delta = (8 * sigma_y * a) / (pi * E) * ln(sec(pi*sigma/(2*sigma_y)))
//
// For small sigma/sigma_y (LEFM limit):
//   delta ≈ K_I^2 / (E * sigma_y)  (plane stress)
//   delta ≈ K_I^2 / (E * sigma_y) * (1 - nu^2)  (plane strain, approx)
//
// Ref: Dugdale (1960), Wells (1961), Anderson Ch.3

#[test]
fn validation_ctod_irwin_dugdale() {
    let e_modulus: f64 = 200_000.0; // MPa
    let sigma_y: f64 = 400.0; // MPa
    let sigma: f64 = 80.0; // MPa (low stress ratio for LEFM validity)
    let a: f64 = 25.0; // mm
    let nu: f64 = 0.3;

    // Dugdale CTOD
    let ratio_s = PI * sigma / (2.0 * sigma_y);
    let dugdale_ctod =
        (8.0 * sigma_y * a) / (PI * e_modulus) * (1.0_f64 / ratio_s.cos()).ln();

    // LEFM approximation: delta = K^2 / (E * sigma_y)
    let k_i = sigma * (PI * a).sqrt();
    let lefm_ctod = k_i * k_i / (e_modulus * sigma_y);

    // For small sigma/sigma_y, Dugdale should approach LEFM
    // sigma/sigma_y = 80/400 = 0.2, which is small enough
    let rel_diff = (dugdale_ctod - lefm_ctod).abs() / lefm_ctod;
    assert!(
        rel_diff < 0.02,
        "Dugdale CTOD should match LEFM within 2% for low stress ratio, got {:.4}%",
        rel_diff * 100.0
    );

    // Plane strain CTOD
    let lefm_ctod_pe = k_i * k_i * (1.0 - nu * nu) / (e_modulus * sigma_y);
    let ratio_ctod = lefm_ctod_pe / lefm_ctod;
    assert_close(ratio_ctod, 1.0 - nu * nu, 1e-10, "CTOD plane strain factor");

    // At high stress ratio, Dugdale gives larger CTOD than LEFM
    let sigma_high: f64 = 300.0; // sigma/sigma_y = 0.75
    let ratio_high = PI * sigma_high / (2.0 * sigma_y);
    let dugdale_high =
        (8.0 * sigma_y * a) / (PI * e_modulus) * (1.0_f64 / ratio_high.cos()).ln();
    let k_high = sigma_high * (PI * a).sqrt();
    let lefm_high = k_high * k_high / (e_modulus * sigma_y);
    assert!(
        dugdale_high > lefm_high,
        "Dugdale should exceed LEFM at high stress ratio"
    );
}

// ================================================================
// 7. Mixed-Mode Fracture — Maximum Tangential Stress Criterion
// ================================================================
//
// For combined Mode I + Mode II loading, the maximum tangential stress
// (MTS) criterion predicts the crack propagation angle theta_0:
//
//   K_I * sin(theta_0) + K_II * (3*cos(theta_0) - 1) = 0
//
// For pure Mode II (K_I = 0):
//   theta_0 = -arctan(1/sqrt(3)) * 2 = -70.53 degrees
//   (crack kinks at ~70.5 degrees)
//
// Effective SIF: K_eq = cos(theta/2) * [K_I*cos^2(theta/2) - 1.5*K_II*sin(theta)]
//
// Ref: Erdogan & Sih (1963), Anderson Ch.2

#[test]
fn validation_mixed_mode_fracture_mts_criterion() {
    // Pure Mode II: K_I = 0, find theta_0
    // sin(theta) + K_II/K_I * (3*cos(theta) - 1) = 0
    // For K_I = 0: 3*cos(theta_0) - 1 = 0 => cos(theta_0) = 1/3
    // theta_0 = -arccos(1/3) = -70.529 degrees
    let theta_pure_mode2 = -(1.0_f64 / 3.0_f64).acos();
    let expected_deg = -70.5288_f64;
    let got_deg = theta_pure_mode2.to_degrees();
    assert_close(got_deg, expected_deg, 1e-4, "pure Mode II kink angle");

    // Verify the equation: for pure Mode II with theta = arccos(1/3)
    // K_II * (3*cos(theta) - 1) = 0 => 3*(1/3) - 1 = 0 ✓
    let check = 3.0 * theta_pure_mode2.cos() - 1.0;
    assert_close(check, 0.0, 1e-10, "MTS criterion pure Mode II");

    // Mixed mode: K_I = K_II (45-degree mixed mode)
    // K_I*sin(theta) + K_II*(3*cos(theta) - 1) = 0
    // sin(theta) + 3*cos(theta) - 1 = 0
    // Solve: R*sin(theta + phi) = 1, R=sqrt(10), phi=atan(3)
    // theta = arcsin(1/sqrt(10)) - atan(3) ≈ -0.9273 rad ≈ -53.13 degrees
    let theta_mixed = -0.9273_f64;
    let lhs = theta_mixed.sin() + 3.0 * theta_mixed.cos() - 1.0;
    assert!(
        lhs.abs() < 0.01,
        "MTS equation residual should be small, got {}",
        lhs
    );

    // Better: use Newton-Raphson for refinement
    // f(theta) = sin(theta) + 3*cos(theta) - 1
    // f'(theta) = cos(theta) - 3*sin(theta)
    let mut theta = -0.9273_f64;
    for _iter in 0..10 {
        let f_val = theta.sin() + 3.0 * theta.cos() - 1.0;
        let f_prime = theta.cos() - 3.0 * theta.sin();
        theta -= f_val / f_prime;
    }
    let residual = theta.sin() + 3.0 * theta.cos() - 1.0;
    assert_close(residual, 0.0, 1e-12, "Newton-Raphson converged");

    // The angle should be negative (crack kinks away from Mode II direction)
    assert!(theta < 0.0, "kink angle should be negative");
    assert!(
        theta.to_degrees() > -70.0 && theta.to_degrees() < 0.0,
        "mixed mode angle ({:.1} deg) should be between -70 and 0 degrees",
        theta.to_degrees()
    );
}

// ================================================================
// 8. Failure Assessment Diagram (FAD) — BS 7910 Level 1
// ================================================================
//
// The FAD (or R6) approach plots (K_r, L_r) where:
//   K_r = K_I / K_Ic  (fracture ratio)
//   L_r = sigma_ref / sigma_y  (load ratio, reference stress / yield)
//
// Level 1 (Option 1) failure curve:
//   K_r = (1 - 0.14 * L_r^2) * [0.3 + 0.7 * exp(-0.65 * L_r^6)]
//
// valid for L_r <= L_r_max = (sigma_y + sigma_u) / (2 * sigma_y)
//
// Points inside the curve are safe; outside = failure predicted.
//
// Ref: BS 7910:2019, R6 procedure

#[test]
fn validation_failure_assessment_diagram_bs7910() {
    let sigma_y: f64 = 355.0; // MPa (S355 steel)
    let sigma_u: f64 = 510.0; // MPa

    // FAD curve function
    let fad_kr = |lr: f64| -> f64 {
        (1.0 - 0.14 * lr * lr) * (0.3 + 0.7 * (-0.65 * lr.powi(6)).exp())
    };

    // At L_r = 0: K_r = 1.0 (pure fracture)
    let kr_0 = fad_kr(0.0);
    assert_close(kr_0, 1.0, 1e-10, "FAD at L_r=0");

    // L_r_max
    let lr_max = (sigma_y + sigma_u) / (2.0 * sigma_y);
    // = (355 + 510) / 710 = 865 / 710 = 1.2183
    let lr_max_expected = 865.0 / 710.0;
    assert_close(lr_max, lr_max_expected, 1e-10, "L_r_max");

    // At L_r = 1.0: K_r should be positive but less than 1
    let kr_1 = fad_kr(1.0);
    let expected_kr1 = (1.0 - 0.14) * (0.3 + 0.7 * (-0.65_f64).exp());
    assert_close(kr_1, expected_kr1, 1e-10, "FAD at L_r=1");
    assert!(kr_1 > 0.0 && kr_1 < 1.0, "K_r(1) should be in (0,1)");

    // Safety check: a point inside the curve is safe
    let lr_test: f64 = 0.5;
    let kr_test: f64 = 0.3; // well inside
    let kr_limit = fad_kr(lr_test);
    assert!(
        kr_test < kr_limit,
        "point ({}, {}) should be inside FAD curve (limit {})",
        lr_test,
        kr_test,
        kr_limit
    );

    // A point outside the curve is unsafe
    let kr_unsafe: f64 = 0.99;
    assert!(
        kr_unsafe > kr_limit,
        "point ({}, {}) should be outside FAD curve (limit {})",
        lr_test,
        kr_unsafe,
        kr_limit
    );

    // FAD curve is monotonically decreasing for L_r > 0
    let mut prev = fad_kr(0.0);
    for i in 1..=20 {
        let lr = i as f64 * 0.05;
        let kr = fad_kr(lr);
        assert!(
            kr <= prev + 1e-12,
            "FAD should be non-increasing: K_r({:.2})={:.6} > K_r({:.2})={:.6}",
            lr,
            kr,
            lr - 0.05,
            prev
        );
        prev = kr;
    }
}
