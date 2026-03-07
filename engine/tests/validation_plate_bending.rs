/// Validation: Plate Bending Theory (Pure Formula Verification)
///
/// References:
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed.
///   - Ventsel & Krauthammer, "Thin Plates and Shells", Marcel Dekker
///   - Ugural, "Stresses in Plates and Shells", 2nd Ed.
///   - Szilard, "Theories and Applications of Plate Analysis"
///   - Timoshenko & Gere, "Theory of Elastic Stability", McGraw-Hill
///
/// Tests verify plate bending formulas without calling the solver.
///   1. Navier solution for simply supported plate under UDL
///   2. Kirchhoff plate bending rigidity D
///   3. Levy solution for one-way plate (two edges SS, two edges free)
///   4. Critical buckling stress for plates (Euler plate buckling)
///   5. Effective width for post-buckled plates (von Karman formula)
///   6. Plate natural frequency (SS all sides)
///   7. Mindlin plate correction factor for thick plates
///   8. Orthotropic plate bending under UDL

mod helpers;
use helpers::*;

use std::f64::consts::PI;

// ================================================================
// 1. Navier Solution for Simply Supported Plate Under UDL
// ================================================================
//
// The Navier double Fourier series for a simply supported rectangular
// plate (a x b) under uniform load q:
//
//   w(x,y) = sum_{m=1,3,5...} sum_{n=1,3,5...}
//     (16*q) / (pi^6*D*m*n*(m^2/a^2 + n^2/b^2)^2) *
//     sin(m*pi*x/a) * sin(n*pi*y/b)
//
// At the center (x=a/2, y=b/2), sin terms = +/-1.
// First term (m=1, n=1) dominates.
//
// For a square plate (a=b):
//   w_center ~ alpha * q * a^4 / D
//   alpha_exact = 0.00406 (tabulated, Timoshenko Table 8.1)
//   alpha_(1,1) = 4/pi^6 = 0.004159 (first term overestimates by ~2%)
//
// Reference: Timoshenko & Woinowsky-Krieger, Sec. 5.8, Table 8.1

#[test]
fn validation_plate_navier_solution() {
    let a: f64 = 2.0;         // m (square plate side)
    let b: f64 = 2.0;         // m
    let e: f64 = 200_000.0;   // MPa
    let nu: f64 = 0.3;
    let t: f64 = 0.015;       // m (15 mm)
    let q: f64 = 5000.0;      // Pa

    let d: f64 = e * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu * nu));

    // First term coefficient for square plate
    let alpha_11: f64 = 4.0_f64 / PI.powi(6);
    // ~ 0.004159
    assert!(
        (alpha_11 - 0.004159_f64).abs() < 0.0001_f64,
        "alpha_11 = {:.6}, expected ~0.00416",
        alpha_11
    );

    // Sum first 5 terms of double series at center
    let mut w_center: f64 = 0.0;
    for m_int in (1..=9).step_by(2) {
        for n_int in (1..=9).step_by(2) {
            let m: f64 = m_int as f64;
            let n: f64 = n_int as f64;
            let denom: f64 = PI.powi(6) * d * m * n
                * (m * m / (a * a) + n * n / (b * b)).powi(2);
            // sin(m*pi/2) * sin(n*pi/2): for odd m,n this alternates +/-1
            let sign_m: f64 = if m_int % 4 == 1 { 1.0_f64 } else { -1.0_f64 };
            let sign_n: f64 = if n_int % 4 == 1 { 1.0_f64 } else { -1.0_f64 };
            w_center += 16.0_f64 * q * sign_m * sign_n / denom;
        }
    }

    // Tabulated exact value
    let alpha_exact: f64 = 0.00406;
    let w_exact: f64 = alpha_exact * q * a.powi(4) / d;

    // Multi-term series should be within 0.5% of tabulated value
    let alpha_computed: f64 = w_center * d / (q * a.powi(4));
    assert!(
        (alpha_computed - alpha_exact).abs() / alpha_exact < 0.005_f64,
        "Navier alpha: computed={:.6}, exact={:.6}",
        alpha_computed, alpha_exact
    );

    // First term should overestimate (positive terms subtract in higher orders)
    let w_first_term: f64 = alpha_11 * q * a.powi(4) / d;
    assert!(
        w_first_term > w_exact,
        "First term ({:.6e}) > exact ({:.6e})",
        w_first_term, w_exact
    );
}

// ================================================================
// 2. Kirchhoff Plate Bending Rigidity D
// ================================================================
//
// The flexural (bending) rigidity of a thin plate:
//   D = E * t^3 / (12 * (1 - nu^2))
//
// This is analogous to EI for beams. For various materials:
//   Steel: E = 200 GPa, nu = 0.3  => D ~ 18315 * t^3 N*m per m width
//   Aluminum: E = 70 GPa, nu = 0.33 => D ~ 6570 * t^3
//   Concrete: E = 30 GPa, nu = 0.2  => D ~ 2604 * t^3
//
// Reference: Timoshenko & Woinowsky-Krieger, Ch. 1

#[test]
fn validation_plate_bending_rigidity() {
    // Steel plate
    let e_steel: f64 = 200_000.0; // MPa = 200 GPa
    let nu_steel: f64 = 0.3;
    let t: f64 = 0.010; // m (10 mm)

    let d_steel: f64 = e_steel * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu_steel * nu_steel));
    // = 200e9 * 1e-6 / (12 * 0.91) = 200000 / 10.92 = 18315.02 N*m
    let d_steel_expected: f64 = 200e9_f64 * 1e-6_f64 / (12.0_f64 * (1.0_f64 - 0.09_f64));
    assert!(
        (d_steel - d_steel_expected).abs() / d_steel_expected < 1e-10_f64,
        "D_steel: {:.2} N*m",
        d_steel
    );

    // Aluminum plate
    let e_al: f64 = 70_000.0;
    let nu_al: f64 = 0.33;
    let d_al: f64 = e_al * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu_al * nu_al));

    // Steel should be stiffer than aluminum
    assert!(
        d_steel > d_al,
        "D_steel ({:.2}) > D_aluminum ({:.2})",
        d_steel, d_al
    );

    // Concrete plate
    let e_conc: f64 = 30_000.0;
    let nu_conc: f64 = 0.2;
    let d_conc: f64 = e_conc * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu_conc * nu_conc));

    // Ordering: steel > aluminum > concrete
    assert!(
        d_al > d_conc,
        "D_aluminum ({:.2}) > D_concrete ({:.2})",
        d_al, d_conc
    );

    // D scales as t^3
    let t2: f64 = 0.020; // 20 mm
    let d_steel_20: f64 = e_steel * 1e6_f64 * t2.powi(3) / (12.0_f64 * (1.0_f64 - nu_steel * nu_steel));
    let ratio: f64 = d_steel_20 / d_steel;
    let ratio_expected: f64 = (t2 / t).powi(3); // = 8.0
    assert!(
        (ratio - ratio_expected).abs() / ratio_expected < 1e-10_f64,
        "D ratio (20mm/10mm): {:.4}, expected {:.4}",
        ratio, ratio_expected
    );

    // Verify D formula units: [MPa]*[m^3] / [1] = [N/m^2 * 10^6]*[m^3] = [N*m]
    // Actually: E in MPa * 10^6 gives Pa, then Pa * m^3 / 1 = N*m
    // Check numerical value for steel, t=10mm:
    // D = 200e9 * (0.01)^3 / (12*0.91) = 200e9 * 1e-6 / 10.92 = 200000/10.92 = 18315
    assert!(
        (d_steel - 18315.02_f64).abs() / 18315.02_f64 < 0.001_f64,
        "D_steel numerical check: {:.2}",
        d_steel
    );
}

// ================================================================
// 3. Levy Solution for One-Way Plate
// ================================================================
//
// For a plate with two opposite edges simply supported (say y=0 and y=b)
// and arbitrary conditions on the other two edges, the Levy solution is:
//   w(x,y) = sum_{n=1}^inf [A_n*cosh(alpha_n*x) + B_n*sinh(alpha_n*x)
//            + C_n*x*cosh(alpha_n*x) + D_n*x*sinh(alpha_n*x)
//            + f_n(x)] * sin(n*pi*y/b)
//
// For a long plate (a >> b), the plate behaves as a one-way slab (beam).
// The maximum deflection approaches the beam solution:
//   w_max = 5*q*b^4 / (384*D)  (for strip of width 1)
//
// For a plate strip (a >> b), the moment per unit length:
//   M_max = q*b^2/8  (at midspan)
//
// Reference: Timoshenko & Woinowsky-Krieger, Ch. 6; Levy (1899)

#[test]
fn validation_plate_levy_solution() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let t: f64 = 0.012;     // m (12 mm)
    let b: f64 = 1.0;       // m (span between SS edges)
    let q: f64 = 10_000.0;  // Pa

    let d: f64 = e * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu * nu));

    // For a very long plate (a >> b): strip behavior
    // w_max = 5*q*b^4 / (384*D)
    let w_strip: f64 = 5.0_f64 * q * b.powi(4) / (384.0_f64 * d);
    assert!(
        w_strip > 0.0_f64,
        "Strip deflection must be positive: {:.6e} m",
        w_strip
    );

    // Maximum moment in strip: M = q*b^2/8
    let m_strip: f64 = q * b * b / 8.0_f64;
    let m_strip_expected: f64 = 1250.0; // N*m/m
    assert!(
        (m_strip - m_strip_expected).abs() / m_strip_expected < 1e-10_f64,
        "Strip moment: {:.2} N*m/m, expected {:.2}",
        m_strip, m_strip_expected
    );

    // Compare with square plate (a = b): alpha = 0.00406
    let w_square: f64 = 0.00406_f64 * q * b.powi(4) / d;

    // Strip deflection should be larger (less restraint)
    let alpha_strip: f64 = 5.0_f64 / 384.0_f64;
    // = 0.01302
    assert!(
        alpha_strip > 0.00406_f64,
        "Strip alpha ({:.5}) > square alpha (0.00406)",
        alpha_strip
    );
    assert!(
        w_strip > w_square,
        "Strip deflection ({:.6e}) > square ({:.6e})",
        w_strip, w_square
    );

    // Ratio: w_strip / w_square = alpha_strip / alpha_square = 0.01302 / 0.00406 = 3.207
    let defl_ratio: f64 = w_strip / w_square;
    let defl_ratio_expected: f64 = alpha_strip / 0.00406_f64;
    assert!(
        (defl_ratio - defl_ratio_expected).abs() / defl_ratio_expected < 1e-6_f64,
        "Deflection ratio: {:.4}, expected {:.4}",
        defl_ratio, defl_ratio_expected
    );

    // Maximum stress in strip: sigma = 6*M / t^2 (per unit width)
    let sigma_max: f64 = 6.0_f64 * m_strip / (t * t * 1e6_f64); // MPa
    // = 6*1250 / (0.000144 * 1e6) = 7500 / 144 = 52.08 MPa
    let sigma_expected: f64 = 6.0_f64 * 1250.0_f64 / (0.012_f64 * 0.012_f64 * 1e6_f64);
    assert!(
        (sigma_max - sigma_expected).abs() / sigma_expected < 1e-10_f64,
        "Strip stress: {:.2} MPa, expected {:.2}",
        sigma_max, sigma_expected
    );
}

// ================================================================
// 4. Critical Buckling Stress for Plates (Euler Plate Buckling)
// ================================================================
//
// The critical buckling stress for a simply supported plate under
// uniform uniaxial compression:
//   sigma_cr = k * pi^2 * E / (12*(1-nu^2)) * (t/b)^2
//
// where k is the buckling coefficient:
//   k = (m*b/a + a/(m*b))^2
// m = number of half-waves minimizing k.
//
// For SS plate with a/b = integer: k_min = 4.0
// For SS long plate (a >> b): k_min = 4.0
//
// Reference: Timoshenko & Gere, Ch. 9

#[test]
fn validation_plate_critical_buckling_stress() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let t: f64 = 10.0;      // mm
    let b: f64 = 500.0;     // mm (plate width)

    // Buckling coefficient for various aspect ratios
    // a/b = 1.0: k = (1+1)^2 = 4.0
    // a/b = 1.5: k = min over m of (m/1.5 + 1.5/m)^2
    //   m=1: (0.667 + 1.5)^2 = 4.694
    //   m=2: (1.333 + 0.75)^2 = 4.340
    //   => k = 4.340
    // a/b = 2.0: k = (1+1)^2 = 4.0 (at m=2, same: (2*0.5+1/(2*0.5))^2 = (1+1)^2 = 4)
    // Actually: for a/b = 2 and m=2: k = (2*(b/a) + (a/b)/2)^2 ... let me redo.
    // k(m) = (m*(b/a) + (a/b)/m)^2 = (m/R + R/m)^2 where R = a/b
    // For a/b=1, m=1: (1+1)^2 = 4
    // For a/b=2, m=1: (0.5+2)^2 = 6.25; m=2: (1+1)^2 = 4

    let compute_k_min = |aspect_ratio: f64| -> f64 {
        let mut k_min: f64 = f64::MAX;
        for m_int in 1..=10 {
            let m: f64 = m_int as f64;
            let k: f64 = (m / aspect_ratio + aspect_ratio / m).powi(2);
            if k < k_min {
                k_min = k;
            }
        }
        k_min
    };

    // Square plate
    let k_sq: f64 = compute_k_min(1.0_f64);
    assert!(
        (k_sq - 4.0_f64).abs() < 1e-10_f64,
        "k(a/b=1) = {:.6}, expected 4.0",
        k_sq
    );

    // a/b = 2
    let k_2: f64 = compute_k_min(2.0_f64);
    assert!(
        (k_2 - 4.0_f64).abs() < 1e-10_f64,
        "k(a/b=2) = {:.6}, expected 4.0",
        k_2
    );

    // a/b = 1.5 (between transition points, k > 4)
    let k_15: f64 = compute_k_min(1.5_f64);
    assert!(
        k_15 > 4.0_f64,
        "k(a/b=1.5) = {:.6} should be > 4.0",
        k_15
    );
    assert!(
        k_15 < 5.0_f64,
        "k(a/b=1.5) = {:.6} should be < 5.0",
        k_15
    );

    // Critical stress for square plate
    let sigma_cr: f64 = k_sq * PI * PI * e / (12.0_f64 * (1.0_f64 - nu * nu)) * (t / b).powi(2);
    // = 4 * pi^2 * 200000 / 10.92 * (10/500)^2
    // = 4 * 9.8696 * 200000 / 10.92 * 0.0004
    // = 4 * 72.27 = 289.1 MPa
    assert!(
        sigma_cr > 200.0_f64 && sigma_cr < 400.0_f64,
        "sigma_cr = {:.2} MPa, should be ~289 MPa",
        sigma_cr
    );

    // Compare with Euler column: sigma_cr_col = pi^2*E / (L/r)^2
    // For a plate strip of width b, t thick: r = t/sqrt(12), L = b
    // sigma_cr_col = pi^2*E*t^2/(12*b^2)
    // Plate buckling includes (1-nu^2) factor: plate is stiffer due to biaxial constraint
    let sigma_cr_col: f64 = PI * PI * e * (t / b).powi(2) / 12.0_f64;
    let plate_to_col: f64 = sigma_cr / sigma_cr_col;
    // Should be k / (1-nu^2) = 4/0.91 = 4.396
    let plate_to_col_expected: f64 = k_sq / (1.0_f64 - nu * nu);
    assert!(
        (plate_to_col - plate_to_col_expected).abs() / plate_to_col_expected < 1e-10_f64,
        "Plate/column ratio: {:.4}, expected {:.4}",
        plate_to_col, plate_to_col_expected
    );
}

// ================================================================
// 5. Effective Width for Post-Buckled Plates (von Karman)
// ================================================================
//
// The von Karman effective width formula:
//   b_eff / b = sqrt(sigma_cr / sigma_applied)
//
// At sigma = sigma_cr: b_eff = b (full width)
// At sigma = 4*sigma_cr: b_eff = b/2
//
// Winter's modified formula (AISI/CFS):
//   b_eff / b = sqrt(sigma_cr/sigma) * (1 - 0.22*sqrt(sigma_cr/sigma))
//
// Reference: von Karman, Sechler & Donnell (1932); Winter (1947)

#[test]
fn validation_plate_effective_width_von_karman() {
    let b: f64 = 300.0;     // mm (plate width)
    let t: f64 = 6.0;       // mm (plate thickness)
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let fy: f64 = 350.0;    // MPa (yield stress)

    // Critical buckling stress (SS, k=4)
    let sigma_cr: f64 = 4.0_f64 * PI * PI * e / (12.0_f64 * (1.0_f64 - nu * nu))
        * (t / b).powi(2);

    // Verify sigma_cr < fy (plate buckles before yielding)
    assert!(
        sigma_cr < fy,
        "sigma_cr ({:.2}) < fy ({:.2})",
        sigma_cr, fy
    );

    // Von Karman at yield
    let lambda: f64 = (sigma_cr / fy).sqrt();
    let b_eff_vk: f64 = b * lambda;
    assert!(
        b_eff_vk < b,
        "b_eff ({:.2}) < b ({:.2}) when sigma > sigma_cr",
        b_eff_vk, b
    );

    // At sigma = sigma_cr: b_eff = b
    let b_eff_at_cr: f64 = b * (sigma_cr / sigma_cr).sqrt();
    assert!(
        (b_eff_at_cr - b).abs() < 1e-10_f64,
        "b_eff at sigma_cr: {:.2}, expected {:.2}",
        b_eff_at_cr, b
    );

    // At sigma = 4*sigma_cr: b_eff = b/2
    let b_eff_4cr: f64 = b * (sigma_cr / (4.0_f64 * sigma_cr)).sqrt();
    assert!(
        (b_eff_4cr - b / 2.0_f64).abs() / (b / 2.0_f64) < 1e-10_f64,
        "b_eff at 4*sigma_cr: {:.2}, expected {:.2}",
        b_eff_4cr, b / 2.0_f64
    );

    // Winter's modified formula
    let b_eff_winter: f64 = b * lambda * (1.0_f64 - 0.22_f64 * lambda);
    // Winter's always gives less than von Karman (more conservative)
    assert!(
        b_eff_winter < b_eff_vk,
        "Winter ({:.2}) < von Karman ({:.2})",
        b_eff_winter, b_eff_vk
    );
    assert!(
        b_eff_winter > 0.0_f64,
        "Winter b_eff must be positive: {:.2}",
        b_eff_winter
    );

    // Slenderness check: lambda_p = sqrt(fy/sigma_cr)
    // If lambda_p <= 0.673: plate is fully effective (no reduction)
    let lambda_p: f64 = (fy / sigma_cr).sqrt();
    // lambda_p = 1/lambda
    assert!(
        (lambda_p - 1.0_f64 / lambda).abs() < 1e-10_f64,
        "lambda_p = {:.4}, 1/lambda = {:.4}",
        lambda_p, 1.0_f64 / lambda
    );

    // For our case, lambda_p > 0.673 (plate is slender)
    assert!(
        lambda_p > 0.673_f64,
        "lambda_p = {:.4} > 0.673 (plate is slender)",
        lambda_p
    );
}

// ================================================================
// 6. Plate Natural Frequency (SS All Sides)
// ================================================================
//
// For a simply supported rectangular plate (a x b):
//   f_mn = (pi/2) * (m^2/a^2 + n^2/b^2) * sqrt(D/(rho*t))
//
// Fundamental mode (m=1, n=1):
//   f_11 = (pi/2) * (1/a^2 + 1/b^2) * sqrt(D/(rho*t))
//
// For a square plate (a=b):
//   f_11 = pi/(a^2) * sqrt(D/(rho*t))
//
// Reference: Ventsel & Krauthammer, Ch. 16

#[test]
fn validation_plate_natural_frequency() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let t: f64 = 0.010;     // m (10 mm)
    let rho: f64 = 7850.0;  // kg/m^3 (steel)
    let a: f64 = 1.0;       // m
    let b: f64 = 0.8;       // m

    let d: f64 = e * 1e6_f64 * t.powi(3) / (12.0_f64 * (1.0_f64 - nu * nu));

    // Fundamental frequency
    let f_11: f64 = (PI / 2.0_f64) * (1.0_f64 / (a * a) + 1.0_f64 / (b * b))
        * (d / (rho * t)).sqrt();
    assert!(
        f_11 > 0.0_f64 && f_11 < 5000.0_f64,
        "f_11 = {:.2} Hz, should be reasonable",
        f_11
    );

    // Higher modes
    let f_21: f64 = (PI / 2.0_f64) * (4.0_f64 / (a * a) + 1.0_f64 / (b * b))
        * (d / (rho * t)).sqrt();
    let f_12: f64 = (PI / 2.0_f64) * (1.0_f64 / (a * a) + 4.0_f64 / (b * b))
        * (d / (rho * t)).sqrt();
    let f_22: f64 = (PI / 2.0_f64) * (4.0_f64 / (a * a) + 4.0_f64 / (b * b))
        * (d / (rho * t)).sqrt();

    // Frequency ordering
    assert!(f_11 < f_21, "f_11 < f_21");
    assert!(f_11 < f_12, "f_11 < f_12");
    assert!(f_21 < f_22, "f_21 < f_22");
    assert!(f_12 < f_22, "f_12 < f_22");

    // For rectangular plate (a > b), f_12 > f_21 because b < a
    // 1/a^2 + 4/b^2 vs 4/a^2 + 1/b^2
    // For a=1, b=0.8: 1+6.25=7.25 vs 4+1.5625=5.5625
    // So f_12 > f_21
    assert!(f_12 > f_21, "f_12 ({:.2}) > f_21 ({:.2}) for a > b", f_12, f_21);

    // Frequency ratio: f_mn / f_11 = (m^2/a^2 + n^2/b^2) / (1/a^2 + 1/b^2)
    let ratio_21: f64 = f_21 / f_11;
    let ratio_21_expected: f64 = (4.0_f64 / (a * a) + 1.0_f64 / (b * b))
        / (1.0_f64 / (a * a) + 1.0_f64 / (b * b));
    assert!(
        (ratio_21 - ratio_21_expected).abs() / ratio_21_expected < 1e-10_f64,
        "f_21/f_11 = {:.4}, expected {:.4}",
        ratio_21, ratio_21_expected
    );

    // Square plate: f_11 = pi/a^2 * sqrt(D/(rho*t))
    let f_11_sq: f64 = PI / (a * a) * (d / (rho * t)).sqrt();
    let f_11_sq_check: f64 = (PI / 2.0_f64) * (2.0_f64 / (a * a)) * (d / (rho * t)).sqrt();
    assert!(
        (f_11_sq - f_11_sq_check).abs() / f_11_sq < 1e-10_f64,
        "Square plate f_11: {:.2} Hz",
        f_11_sq
    );
}

// ================================================================
// 7. Mindlin Plate Correction Factor for Thick Plates
// ================================================================
//
// Mindlin plate theory accounts for transverse shear deformation.
// The shear flexibility parameter:
//   S = D / (kappa * G * t)
//
// where kappa = 5/6 (shear correction factor) and G = E/(2*(1+nu)).
//
// For thin plates (t/a < 0.05): Mindlin ~ Kirchhoff
// For thick plates (t/a > 0.1): shear deformation is significant
//
// The ratio of Mindlin to Kirchhoff deflection:
//   w_M / w_K ~ 1 + C * (t/a)^2
// where C depends on boundary conditions (~12/(5*(1-nu))*pi^2 for SS)
//
// Reference: Mindlin (1951); Ugural, Ch. 7

#[test]
fn validation_plate_mindlin_correction() {
    let e: f64 = 200_000.0; // MPa
    let nu: f64 = 0.3;
    let kappa: f64 = 5.0_f64 / 6.0_f64; // shear correction factor

    let g: f64 = e / (2.0_f64 * (1.0_f64 + nu));
    let g_expected: f64 = 200_000.0_f64 / 2.6_f64;
    assert!(
        (g - g_expected).abs() / g_expected < 1e-10_f64,
        "G = {:.2} MPa, expected {:.2}",
        g, g_expected
    );

    // Thin plate: t/a = 0.01
    let a: f64 = 1.0; // m
    let t_thin: f64 = 0.01; // m

    let d_thin: f64 = e * 1e6_f64 * t_thin.powi(3) / (12.0_f64 * (1.0_f64 - nu * nu));
    let s_thin: f64 = d_thin / (kappa * g * 1e6_f64 * t_thin);

    // For thin plate, S/a^2 should be very small
    let s_ratio_thin: f64 = s_thin / (a * a);
    assert!(
        s_ratio_thin < 0.001_f64,
        "Thin plate S/a^2 = {:.6e}, should be << 1",
        s_ratio_thin
    );

    // Thick plate: t/a = 0.2
    let t_thick: f64 = 0.2;
    let d_thick: f64 = e * 1e6_f64 * t_thick.powi(3) / (12.0_f64 * (1.0_f64 - nu * nu));
    let s_thick: f64 = d_thick / (kappa * g * 1e6_f64 * t_thick);
    let s_ratio_thick: f64 = s_thick / (a * a);

    assert!(
        s_ratio_thick > 0.01_f64,
        "Thick plate S/a^2 = {:.6e}, should be significant",
        s_ratio_thick
    );

    // S scales as t^2 (D ~ t^3, divide by t gives t^2)
    let s_ratio_ratio: f64 = s_thick / s_thin;
    let t_ratio_sq: f64 = (t_thick / t_thin).powi(2);
    assert!(
        (s_ratio_ratio - t_ratio_sq).abs() / t_ratio_sq < 1e-10_f64,
        "S ratio: {:.4}, (t_thick/t_thin)^2 = {:.4}",
        s_ratio_ratio, t_ratio_sq
    );

    // Approximate Mindlin/Kirchhoff deflection ratio for SS square plate
    // w_M/w_K ~ 1 + alpha * S/a^2
    // For SS square plate, alpha ~ 2*pi^2/(5*(1-nu))
    // (from first-mode correction)
    let alpha_corr: f64 = 2.0_f64 * PI * PI / (5.0_f64 * (1.0_f64 - nu));
    let correction_thin: f64 = 1.0_f64 + alpha_corr * s_ratio_thin;
    let correction_thick: f64 = 1.0_f64 + alpha_corr * s_ratio_thick;

    // Thin plate: correction ~ 1.0
    assert!(
        (correction_thin - 1.0_f64).abs() < 0.05_f64,
        "Thin plate correction: {:.6}",
        correction_thin
    );

    // Thick plate: correction > 1.0 (more deflection due to shear)
    assert!(
        correction_thick > 1.05_f64,
        "Thick plate correction: {:.6}, should be > 1.05",
        correction_thick
    );
}

// ================================================================
// 8. Orthotropic Plate Bending Under UDL
// ================================================================
//
// An orthotropic plate has different stiffnesses in two directions:
//   D_x = E_x * t^3 / (12*(1-nu_xy*nu_yx))
//   D_y = E_y * t^3 / (12*(1-nu_xy*nu_yx))
//   D_xy = G_xy * t^3 / 12
//   H = D_xy + sqrt(D_x * D_y) * nu_xy  (torsional rigidity, simplified)
//
// For a simply supported orthotropic plate under UDL, the Navier solution
// replaces D with direction-dependent rigidities:
//   w(x,y) = sum_{m,n odd} 16*q / (pi^6 * m*n *
//     (D_x*(m/a)^4 + 2*H*(m/a)^2*(n/b)^2 + D_y*(n/b)^4))
//     * sin(m*pi*x/a) * sin(n*pi*y/b)
//
// Common orthotropic plates: corrugated sheets, ribbed slabs,
// timber decking, composite floor panels.
//
// Reference: Timoshenko & Woinowsky-Krieger, Ch. 11; Szilard, Ch. 8

#[test]
fn validation_plate_orthotropic_bending() {
    // Ribbed concrete slab (typical orthotropic properties)
    let t: f64 = 0.150;       // m (slab thickness)
    let a: f64 = 6.0;         // m (span in x, rib direction = stiffer)
    let b: f64 = 6.0;         // m (span in y)
    let q: f64 = 5000.0;      // Pa (uniform load)
    let nu_xy: f64 = 0.15;    // Poisson's ratio

    // Ribbed slab: stiffer in rib direction
    // E_x_eff > E_y_eff due to ribs
    let e_x_eff: f64 = 40_000.0; // MPa (effective, with ribs)
    let e_y_eff: f64 = 30_000.0; // MPa (plain slab direction)
    let nu_yx: f64 = nu_xy * e_y_eff / e_x_eff; // reciprocal relation

    // Verify reciprocal relation: nu_yx/E_y = nu_xy/E_x
    let check: f64 = (nu_yx / e_y_eff - nu_xy / e_x_eff).abs();
    assert!(
        check < 1e-15_f64,
        "Reciprocal relation check: {:.6e}",
        check
    );

    // Flexural rigidities
    let denom: f64 = 1.0_f64 - nu_xy * nu_yx;
    let d_x: f64 = e_x_eff * 1e6_f64 * t.powi(3) / (12.0_f64 * denom);
    let d_y: f64 = e_y_eff * 1e6_f64 * t.powi(3) / (12.0_f64 * denom);

    // D_x should be larger than D_y (ribs in x-direction)
    assert!(
        d_x > d_y,
        "D_x ({:.2}) > D_y ({:.2})",
        d_x, d_y
    );

    // Torsional rigidity (simplified): H = sqrt(D_x * D_y)
    // (Huber's approximation for orthotropic plate)
    let h_huber: f64 = (d_x * d_y).sqrt();

    // For isotropic plate: D_x = D_y = D, H = D, and we recover standard formula
    // Check: if e_x = e_y, then D_x = D_y and H = D_x = D_y (consistent)

    // First-term Navier solution for orthotropic plate at center
    let m: f64 = 1.0_f64;
    let n: f64 = 1.0_f64;
    let navier_denom: f64 = d_x * (m / a).powi(4)
        + 2.0_f64 * h_huber * (m / a).powi(2) * (n / b).powi(2)
        + d_y * (n / b).powi(4);
    let w_11: f64 = 16.0_f64 * q / (PI.powi(6) * m * n * navier_denom);

    assert!(
        w_11 > 0.0_f64,
        "Orthotropic first-term deflection must be positive: {:.6e} m",
        w_11
    );

    // Compare with isotropic plate (using average stiffness)
    let d_avg: f64 = (d_x + d_y) / 2.0_f64;
    let navier_iso_denom: f64 = d_avg * ((m / a).powi(2) + (n / b).powi(2)).powi(2);
    let w_11_iso: f64 = 16.0_f64 * q / (PI.powi(6) * m * n * navier_iso_denom);

    // The orthotropic and isotropic solutions should be in the same order of magnitude
    let ratio: f64 = w_11 / w_11_iso;
    assert!(
        ratio > 0.5_f64 && ratio < 2.0_f64,
        "Orthotropic/isotropic ratio: {:.4}, should be close to 1",
        ratio
    );

    // Verify that stiffening one direction reduces deflection
    // Double D_x while keeping D_y and H the same
    let d_x_stiff: f64 = 2.0_f64 * d_x;
    let h_stiff: f64 = (d_x_stiff * d_y).sqrt();
    let navier_stiff: f64 = d_x_stiff * (m / a).powi(4)
        + 2.0_f64 * h_stiff * (m / a).powi(2) * (n / b).powi(2)
        + d_y * (n / b).powi(4);
    let w_11_stiff: f64 = 16.0_f64 * q / (PI.powi(6) * m * n * navier_stiff);

    assert!(
        w_11_stiff < w_11,
        "Stiffer plate ({:.6e}) < original ({:.6e})",
        w_11_stiff, w_11
    );
}
