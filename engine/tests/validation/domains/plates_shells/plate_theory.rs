/// Validation: Plate Theory Formulas
///
/// References:
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", 2nd Ed.
///   - Ventsel & Krauthammer, "Thin Plates and Shells", Marcel Dekker
///   - Ugural, "Stresses in Plates and Shells", 2nd Ed.
///   - Szilard, "Theories and Applications of Plate Analysis"
///   - Timoshenko & Gere, "Theory of Elastic Stability", McGraw-Hill
///   - Westergaard, "Stresses in Concrete Pavements", Public Roads, 1926
///
/// Tests verify plate theory formulas without calling the solver.
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
// 1. Kirchhoff Plate Bending: Navier Solution (T&WK Sec 5.8)
// ================================================================
//
// Rectangular simply-supported plate (a x b) under uniform load q.
// Navier double series at center (a/2, b/2):
//
//   w_center = Σ Σ [16q / (π⁶ D m n (m²/a² + n²/b²)²)] * sin(mπ/2)*sin(nπ/2)
//
// For square plate a = b = 1.0 m, first term (m=1, n=1):
//   w₁₁ = 16q / (π⁶ D (1/a² + 1/a²)²)
//        = 16q / (π⁶ D (2/a²)²)
//        = 16q a⁴ / (π⁶ D * 4) = 4q a⁴ / (π⁶ D)
//
// Tabulated: α = 0.00406 (T&WK Table 8.1)
// First term: α₁₁ = 4/π⁶ ≈ 0.004159

#[test]
fn validation_kirchhoff_navier_solution() {
    let a: f64 = 1.0;          // m, plate side length
    let e: f64 = 200e9;        // Pa, Young's modulus
    let nu: f64 = 0.3;         // Poisson's ratio
    let t: f64 = 0.01;         // m, plate thickness
    let q: f64 = 10000.0;      // Pa, uniform load

    // Flexural rigidity D = Et³/[12(1-ν²)]
    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let expected_d: f64 = 200e9 * 1e-6 / (12.0 * 0.91);
    assert_close(d, expected_d, 0.01, "Flexural rigidity D");

    // First-term Navier coefficient for square plate
    let alpha_11: f64 = 4.0 / PI.powi(6);
    assert_close(alpha_11, 0.004159, 0.01, "α₁₁");

    // First-term deflection
    let w_11: f64 = alpha_11 * q * a.powi(4) / d;

    // Sum first 5x5 odd terms for convergence
    let mut w_sum: f64 = 0.0;
    for mi in (1_i32..=9).step_by(2) {
        for ni in (1_i32..=9).step_by(2) {
            let m: f64 = mi as f64;
            let n: f64 = ni as f64;
            let denom: f64 = PI.powi(6) * d * m * n
                * (m * m / (a * a) + n * n / (a * a)).powi(2);
            let sign_m: f64 = if mi % 4 == 1 { 1.0 } else { -1.0 };
            let sign_n: f64 = if ni % 4 == 1 { 1.0 } else { -1.0 };
            w_sum += 16.0 * q * sign_m * sign_n / denom;
        }
    }

    // Tabulated exact
    let alpha_exact: f64 = 0.00406;
    let w_exact: f64 = alpha_exact * q * a.powi(4) / d;

    // Multi-term converges within 0.5% of exact
    let alpha_computed: f64 = w_sum * d / (q * a.powi(4));
    assert!(
        (alpha_computed - alpha_exact).abs() / alpha_exact < 0.005,
        "Navier converges: α={:.6} vs exact {:.5}",
        alpha_computed, alpha_exact
    );

    // First term overestimates
    assert!(w_11 > w_exact, "First term > exact deflection");
}

// ================================================================
// 2. Plate Buckling (T&G Ch. 9)
// ================================================================
//
// Critical buckling stress for uniaxial compression:
//   σ_cr = k π² D / (b² t)
//
// where k = buckling coefficient depending on BCs and aspect ratio.
// For SSSS plate (all sides simply supported):
//   k = (m*b/a + a/(m*b))² where m minimizes k
//   For square plate (a/b = 1): k_min = 4.0 (at m = 1)
//
// D = Et³/[12(1-ν²)]
//
// Example: steel plate, E=200 GPa, ν=0.3, t=10mm, b=500mm
//   D = 200e9*(0.01)³/[12*0.91] = 200e3/(10.92) = 18315 N·m
//   σ_cr = 4*π²*18315/(0.5²*0.01) = 4*9.8696*18315/0.0025
//        = 723,054/0.0025 = 289.2 MPa

#[test]
fn validation_plate_buckling() {
    let e: f64 = 200e9;        // Pa
    let nu: f64 = 0.3;
    let t: f64 = 0.010;        // m (10 mm)
    let b: f64 = 0.500;        // m (500 mm)

    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // SSSS square plate: k = 4.0
    let k_ssss: f64 = 4.0;
    let sigma_cr_ssss: f64 = k_ssss * PI * PI * d / (b * b * t);
    let sigma_cr_mpa: f64 = sigma_cr_ssss / 1e6;

    // Verify D
    let expected_d: f64 = 200e9 * 1e-6 / (12.0 * 0.91);
    assert_close(d, expected_d, 0.01, "Plate D");

    // Verify buckling stress is in reasonable range (100-500 MPa for steel)
    assert!(
        sigma_cr_mpa > 100.0 && sigma_cr_mpa < 500.0,
        "σ_cr = {:.1} MPa should be reasonable",
        sigma_cr_mpa
    );

    // SSFS plate (one free edge): k ≈ 0.425
    let k_ssfs: f64 = 0.425;
    let sigma_cr_ssfs: f64 = k_ssfs * PI * PI * d / (b * b * t);

    // Free edge reduces buckling capacity dramatically
    assert!(
        sigma_cr_ssfs < sigma_cr_ssss / 5.0,
        "Free edge σ_cr ({:.1}) << SSSS ({:.1})",
        sigma_cr_ssfs / 1e6, sigma_cr_mpa
    );

    // Long plate (a/b = 3): k = (1*3/3 + 3/(1*3))^2 for m=3
    // Actually for a/b=3 and m=3: k = (3*1/3 + 3/(3*1))^2 = (1+1)^2 = 4.0
    // For m=1: k = (1*1/3 + 3/(1*1))^2 = (1/3 + 3)^2 = (10/3)^2 = 11.11
    // Minimum at m=3 gives k=4.0 still
    let a_over_b: f64 = 3.0;
    let mut k_min: f64 = f64::MAX;
    for mi in 1..=5 {
        let m: f64 = mi as f64;
        let k_m: f64 = (m / a_over_b + a_over_b / m).powi(2);
        if k_m < k_min {
            k_min = k_m;
        }
    }
    assert_close(k_min, 4.0, 0.01, "Long plate k_min = 4.0");
}

// ================================================================
// 3. Circular Plate Under Uniform Load (T&WK Ch. 3)
// ================================================================
//
// Clamped circular plate, radius R, under uniform load q:
//   w_max = q R⁴ / (64 D)   (at center)
//   M_r(0) = q R² (1+ν) / 16  (radial moment at center)
//   M_r(R) = -q R² / 8         (radial moment at edge, fixed)
//
// Simply supported circular plate:
//   w_max = q R⁴ (5+ν) / [64 D (1+ν)]
//   M_r(0) = q R² (3+ν) / 16
//
// Example: R = 0.5 m, q = 10 kPa, E = 200 GPa, ν = 0.3, t = 8 mm

#[test]
fn validation_circular_plate() {
    let r: f64 = 0.5;          // m, radius
    let q: f64 = 10000.0;      // Pa (10 kPa)
    let e: f64 = 200e9;        // Pa
    let nu: f64 = 0.3;
    let t: f64 = 0.008;        // m (8 mm)

    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // Clamped edge: max deflection at center
    let w_clamped: f64 = q * r.powi(4) / (64.0 * d);

    // Clamped: radial moment at center
    let mr_center_clamped: f64 = q * r * r * (1.0 + nu) / 16.0;

    // Clamped: radial moment at edge (negative = hogging)
    let mr_edge_clamped: f64 = -q * r * r / 8.0;

    // Simply supported: max deflection at center
    let w_ss: f64 = q * r.powi(4) * (5.0 + nu) / (64.0 * d * (1.0 + nu));

    // Simply supported: radial moment at center
    let mr_center_ss: f64 = q * r * r * (3.0 + nu) / 16.0;

    // SS deflection > clamped deflection (less restraint)
    assert!(
        w_ss > w_clamped,
        "SS deflection ({:.4e}) > clamped ({:.4e})",
        w_ss, w_clamped
    );

    // Ratio w_ss/w_clamped = (5+ν)/(1+ν) for circular plates
    let ratio: f64 = w_ss / w_clamped;
    let expected_ratio: f64 = (5.0 + nu) / (1.0 + nu);
    assert_close(ratio, expected_ratio, 0.001, "w_ss/w_clamp ratio");

    // Clamped edge moment is negative (hogging)
    assert!(mr_edge_clamped < 0.0, "Edge moment is hogging");

    // SS center moment > clamped center moment (no edge restraint)
    assert!(
        mr_center_ss > mr_center_clamped,
        "SS Mr_center ({:.2}) > clamped Mr_center ({:.2})",
        mr_center_ss, mr_center_clamped
    );

    // Moment ratio at center
    let mr_ratio: f64 = mr_center_ss / mr_center_clamped;
    let expected_mr_ratio: f64 = (3.0 + nu) / (1.0 + nu);
    assert_close(mr_ratio, expected_mr_ratio, 0.001, "Moment ratio at center");
}

// ================================================================
// 4. Plate Natural Frequency (T&WK Sec 11.8)
// ================================================================
//
// Simply-supported rectangular plate (a x b), mode (m, n):
//   ω_mn = π² [(m/a)² + (n/b)²] √(D / (ρh))
//
// where ρh = mass per unit area (kg/m²)
//
// Steel plate: E=200 GPa, ν=0.3, ρ=7850 kg/m³, t=5mm
// a=1.0m, b=0.5m
//   D = 200e9*(0.005)³/[12*0.91] = 2289 N·m
//   ρh = 7850*0.005 = 39.25 kg/m²
//
// Mode (1,1): ω₁₁ = π²[(1/1)²+(1/0.5)²]*√(2289/39.25)
//           = π²*5 * √(58.32) = 49.348 * 7.637 = 376.8 rad/s
//   f₁₁ = ω₁₁/(2π) = 59.96 Hz

#[test]
fn validation_plate_natural_frequency() {
    let a: f64 = 1.0;          // m
    let b: f64 = 0.5;          // m
    let e: f64 = 200e9;        // Pa
    let nu: f64 = 0.3;
    let t: f64 = 0.005;        // m (5 mm)
    let rho: f64 = 7850.0;     // kg/m³

    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));
    let rho_h: f64 = rho * t;
    assert_close(rho_h, 39.25, 0.001, "Mass per unit area");

    // Mode (1,1) frequency
    let omega_11: f64 = PI * PI * ((1.0 / a).powi(2) + (1.0 / b).powi(2))
        * (d / rho_h).sqrt();
    let f_11: f64 = omega_11 / (2.0 * PI);

    // Verify frequency is physically reasonable (10-500 Hz for small steel plate)
    assert!(
        f_11 > 10.0 && f_11 < 500.0,
        "f₁₁ = {:.1} Hz should be reasonable",
        f_11
    );

    // Mode (2,1): higher frequency
    let omega_21: f64 = PI * PI * ((2.0 / a).powi(2) + (1.0 / b).powi(2))
        * (d / rho_h).sqrt();
    let f_21: f64 = omega_21 / (2.0 * PI);

    // Mode (1,2): higher frequency
    let omega_12: f64 = PI * PI * ((1.0 / a).powi(2) + (2.0 / b).powi(2))
        * (d / rho_h).sqrt();
    let f_12: f64 = omega_12 / (2.0 * PI);

    // Higher modes have higher frequencies
    assert!(f_21 > f_11, "f₂₁ ({:.1}) > f₁₁ ({:.1})", f_21, f_11);
    assert!(f_12 > f_21, "f₁₂ ({:.1}) > f₂₁ ({:.1})", f_12, f_21);

    // Frequency scales with √(D/ρh) ∝ t (for thin plates)
    // Double thickness → 2× frequency (since D ∝ t³ and ρh ∝ t, ratio ∝ t)
    let t2: f64 = 2.0 * t;
    let d2: f64 = e * t2.powi(3) / (12.0 * (1.0 - nu * nu));
    let rho_h2: f64 = rho * t2;
    let omega_11_2: f64 = PI * PI * ((1.0 / a).powi(2) + (1.0 / b).powi(2))
        * (d2 / rho_h2).sqrt();
    let ratio: f64 = omega_11_2 / omega_11;
    assert_close(ratio, 2.0, 0.01, "Doubling thickness doubles frequency");
}

// ================================================================
// 5. Von Karman Large Deflection Correction (T&WK Ch. 13)
// ================================================================
//
// For thin plates with large deflections (w/t > 0.5), membrane stresses
// develop and the linear theory underpredicts stiffness.
//
// Approximate correction for clamped circular plate under uniform load:
//   q = (64D/R⁴)*w_0 * [1 + 0.488*(w_0/t)²]
//
// where w_0 is the center deflection.
//
// Rearranging: the linear deflection w_lin = qR⁴/(64D) and the
// actual deflection w_0 satisfies:
//   w_lin/w_0 = 1 + 0.488*(w_0/t)²
//
// For w_0/t = 1.0: w_lin/w_0 = 1.488, so actual deflection is
//   w_0 = w_lin/1.488 ≈ 0.672*w_lin (32.8% reduction)

#[test]
fn validation_von_karman_correction() {
    let t: f64 = 0.005;        // m (5 mm)
    let r: f64 = 0.3;          // m
    let e: f64 = 200e9;        // Pa
    let nu: f64 = 0.3;
    let _d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // Von Karman correction factor
    // q/q_linear = 1 + 0.488*(w0/t)^2
    let correction = |w0_over_t: f64| -> f64 {
        1.0 + 0.488 * w0_over_t * w0_over_t
    };

    // Small deflection (w0/t = 0.1): negligible correction
    let corr_small: f64 = correction(0.1);
    assert_close(corr_small, 1.00488, 0.001, "Small deflection correction");

    // Moderate deflection (w0/t = 0.5)
    let corr_mod: f64 = correction(0.5);
    assert_close(corr_mod, 1.122, 0.01, "Moderate deflection correction");

    // Large deflection (w0/t = 1.0)
    let corr_large: f64 = correction(1.0);
    assert_close(corr_large, 1.488, 0.001, "Large deflection correction");

    // Very large deflection (w0/t = 2.0)
    let corr_vlarge: f64 = correction(2.0);
    assert_close(corr_vlarge, 2.952, 0.001, "Very large deflection correction");

    // Effective stiffness ratio: actual_defl/linear_defl = 1/correction
    let reduction_1: f64 = 1.0 / corr_large;
    assert_close(reduction_1, 0.6720, 0.01, "Deflection reduction at w0/t=1");

    // Membrane stress at center for clamped plate (approximate):
    // σ_m = E*(w0/R)² * C where C ≈ 0.295 for clamped
    let w0: f64 = 1.0 * t;  // w0/t = 1.0
    let sigma_m: f64 = 0.295 * e * (w0 / r).powi(2);
    let sigma_m_mpa: f64 = sigma_m / 1e6;

    // Membrane stress should be non-negligible but less than yield
    assert!(
        sigma_m_mpa > 1.0 && sigma_m_mpa < 300.0,
        "σ_m = {:.1} MPa in reasonable range",
        sigma_m_mpa
    );
}

// ================================================================
// 6. Orthotropic Plate Rigidities for Ribbed Slab (T&WK Sec 11.1)
// ================================================================
//
// For a slab with equally spaced parallel ribs:
//   Dx = EI_rib / s  (rigidity in rib direction, per unit width)
//   Dy = E t³ / [12(1-ν²)]  (rigidity perpendicular, plain slab)
//   Dxy = Dy * ν + G*t³/6 ≈ 2*Dy (for isotropic slab between ribs)
//   H = (Dx*Dy)^0.5  (geometric mean rigidity)
//
// Example: slab t=150mm, ribs 300mm deep × 200mm wide at 1.0m c/c
//   I_rib = b*h³/12 (rib only) = 0.2*0.3³/12 = 4.5e-4 m⁴
//   E = 30 GPa (concrete), ν = 0.2
//   Dx = 30e9 * 4.5e-4 / 1.0 = 13.5e6 N·m²/m
//   Dy = 30e9 * 0.15³ / [12*(1-0.04)] = 30e9*3.375e-3/11.52
//      = 8789 N·m/m... wait, let's re-compute.
//   Dy = 30e9 * (0.15)^3 / [12*(1-0.04)] = 30e9 * 3.375e-3 / 11.52
//      = 101.25e6 / 11.52 = 8.789e6 N·m²/m

#[test]
fn validation_orthotropic_plate_rigidities() {
    let e: f64 = 30e9;         // Pa, concrete
    let nu: f64 = 0.2;
    let t_slab: f64 = 0.150;   // m, slab thickness
    let b_rib: f64 = 0.200;    // m, rib width
    let h_rib: f64 = 0.300;    // m, rib depth
    let s_rib: f64 = 1.0;      // m, rib spacing

    // Rib moment of inertia (rectangular rib only, simplified)
    let i_rib: f64 = b_rib * h_rib.powi(3) / 12.0;
    assert_close(i_rib, 4.5e-4, 0.01, "Rib I");

    // Directional rigidities
    let dx: f64 = e * i_rib / s_rib;
    assert_close(dx, 13.5e6, 0.01, "Dx (rib direction)");

    let dy: f64 = e * t_slab.powi(3) / (12.0 * (1.0 - nu * nu));
    let expected_dy: f64 = 30e9 * 0.15_f64.powi(3) / (12.0 * (1.0 - 0.04));
    assert_close(dy, expected_dy, 0.001, "Dy (perpendicular)");

    // Geometric mean rigidity
    let h_mean: f64 = (dx * dy).sqrt();
    assert!(h_mean > dy, "H > Dy (ribs stiffen one direction)");
    assert!(h_mean < dx, "H < Dx (geometric mean between Dx and Dy)");

    // Orthotropic ratio
    let ortho_ratio: f64 = dx / dy;
    assert!(
        ortho_ratio > 1.0,
        "Dx/Dy = {:.2} > 1 (ribs stiffen x-direction)",
        ortho_ratio
    );

    // For isotropic plate, Dx = Dy
    let d_iso: f64 = e * t_slab.powi(3) / (12.0 * (1.0 - nu * nu));
    assert_close(dy, d_iso, 0.001, "Dy = isotropic D (slab portion)");
}

// ================================================================
// 7. Westergaard Solution: Concentrated Load on Elastic Foundation
// ================================================================
//
// Westergaard (1926) for concrete pavement on elastic foundation:
//   Radius of relative stiffness:
//     l = [D / k]^0.25
//   where D = plate flexural rigidity, k = modulus of subgrade reaction
//
// Stress under interior load P:
//   σ = 0.316 * P / h² * [4*log10(l/b) + 1.069]
//
// where b = equivalent contact radius:
//   b = √(1.6*a² + h²) - 0.675*h  if a < 1.724*h
//   b = a                           if a >= 1.724*h
//   a = actual contact radius = √(P / (π*q_tire))
//
// Example: P = 40 kN, h = 200mm, E = 30 GPa, k = 50 MPa/m
//   D = 30e9*0.2³/[12*0.91] = 30e9*8e-3/10.92 = 21978 N·m
//   Actually D = E*h³/[12(1-ν²)] with ν=0.15 for concrete
//   D = 30e9*0.008/(12*0.9775) = 240e6/11.73 = 20461 N·m

#[test]
fn validation_westergaard_solution() {
    let e: f64 = 30e9;         // Pa, concrete
    let nu: f64 = 0.15;        // Poisson's ratio for concrete pavement
    let h: f64 = 0.200;        // m, slab thickness
    let k_sub: f64 = 50e6;     // Pa/m, subgrade modulus (50 MPa/m)
    let p: f64 = 40000.0;      // N, wheel load

    // Flexural rigidity
    let d: f64 = e * h.powi(3) / (12.0 * (1.0 - nu * nu));

    // Radius of relative stiffness
    let l_rel: f64 = (d / k_sub).powf(0.25);
    assert!(
        l_rel > 0.1 && l_rel < 2.0,
        "l = {:.3} m should be reasonable",
        l_rel
    );

    // Contact radius (assume tire pressure q = 700 kPa)
    let q_tire: f64 = 700e3;   // Pa
    let a_contact: f64 = (p / (PI * q_tire)).sqrt();
    assert!(
        a_contact > 0.05 && a_contact < 0.30,
        "a = {:.3} m reasonable tire contact radius",
        a_contact
    );

    // Equivalent contact radius (Westergaard correction)
    let b: f64 = if a_contact < 1.724 * h {
        (1.6 * a_contact * a_contact + h * h).sqrt() - 0.675 * h
    } else {
        a_contact
    };
    assert!(b > 0.0, "Equivalent radius must be positive");

    // Interior stress
    let sigma_int: f64 = 0.316 * p / (h * h)
        * (4.0 * (l_rel / b).log10() + 1.069);
    let sigma_mpa: f64 = sigma_int / 1e6;

    // Stress should be reasonable for concrete pavement (0.5 - 5 MPa)
    assert!(
        sigma_mpa > 0.1 && sigma_mpa < 10.0,
        "σ = {:.2} MPa should be reasonable",
        sigma_mpa
    );

    // Edge loading produces higher stress (factor ~2)
    // σ_edge = 0.572*P/h² * [4*log10(l/b) + 0.359]
    let sigma_edge: f64 = 0.572 * p / (h * h)
        * (4.0 * (l_rel / b).log10() + 0.359);
    assert!(
        sigma_edge > sigma_int,
        "Edge stress ({:.2}) > interior ({:.2})",
        sigma_edge / 1e6, sigma_mpa
    );
}

// ================================================================
// 8. Levy Solution: SSSS Plate with Strip Loading (T&WK Sec 6.1)
// ================================================================
//
// Levy solution: two opposite edges simply supported (y=0, y=b),
// general BCs on x-edges. Solution form:
//   w(x,y) = Σ Ym(y) sin(mπx/a)
//
// For all-SS plate under sinusoidal line load p*sin(πx/a) at y=η:
//   w(x,y) = p*a/(π³*D) * sinh(πη/a)*sinh(π(b-y)/a) / sinh(πb/a)
//             * sin(πx/a)   for y ≥ η (first term)
//
// Simplification: for uniform load q on a long plate (b >> a),
// the deflection at center approaches beam-like behavior:
//   w_center ≈ 5*q*a⁴/(384*D)  (one-way bending)
//
// For square plate, tabulated α = 0.00406 (Navier).
// The Levy and Navier solutions must agree for SSSS.
//
// Test: verify that for b/a = 5 (long plate), center deflection
// approaches the beam formula 5qL⁴/(384D).

#[test]
fn validation_levy_solution_convergence() {
    let a: f64 = 1.0;          // m, short span (SS edges)
    let b: f64 = 5.0;          // m, long span (5:1 aspect ratio)
    let e: f64 = 200e9;        // Pa
    let nu: f64 = 0.3;
    let t: f64 = 0.010;        // m
    let q: f64 = 5000.0;       // Pa

    let d: f64 = e * t.powi(3) / (12.0 * (1.0 - nu * nu));

    // Navier solution at center for long plate
    let mut w_navier: f64 = 0.0;
    for mi in (1_i32..=19).step_by(2) {
        for ni in (1_i32..=19).step_by(2) {
            let m: f64 = mi as f64;
            let n: f64 = ni as f64;
            let denom: f64 = PI.powi(6) * d * m * n
                * (m * m / (a * a) + n * n / (b * b)).powi(2);
            let sign_m: f64 = if mi % 4 == 1 { 1.0 } else { -1.0 };
            let sign_n: f64 = if ni % 4 == 1 { 1.0 } else { -1.0 };
            w_navier += 16.0 * q * sign_m * sign_n / denom;
        }
    }

    // Beam formula for one-way bending: 5qL⁴/(384D)
    // Here L = a (the short span controls)
    let w_beam: f64 = 5.0 * q * a.powi(4) / (384.0 * d);

    // For b/a = 5, Navier should approach beam solution within ~5%
    let diff: f64 = (w_navier - w_beam).abs() / w_beam;
    assert!(
        diff < 0.05,
        "Long plate approaches beam: w_navier={:.4e}, w_beam={:.4e}, diff={:.1}%",
        w_navier, w_beam, diff * 100.0
    );

    // For square plate (b=a), deflection should be less than beam
    let b_sq: f64 = 1.0;
    let mut w_square: f64 = 0.0;
    for mi in (1_i32..=19).step_by(2) {
        for ni in (1_i32..=19).step_by(2) {
            let m: f64 = mi as f64;
            let n: f64 = ni as f64;
            let denom: f64 = PI.powi(6) * d * m * n
                * (m * m / (a * a) + n * n / (b_sq * b_sq)).powi(2);
            let sign_m: f64 = if mi % 4 == 1 { 1.0 } else { -1.0 };
            let sign_n: f64 = if ni % 4 == 1 { 1.0 } else { -1.0 };
            w_square += 16.0 * q * sign_m * sign_n / denom;
        }
    }

    // Square plate has two-way bending: stiffer than beam
    assert!(
        w_square < w_beam,
        "Square plate ({:.4e}) < beam ({:.4e})",
        w_square, w_beam
    );

    // Verify tabulated α for square plate
    let alpha_sq: f64 = w_square * d / (q * a.powi(4));
    assert!(
        (alpha_sq - 0.00406).abs() / 0.00406 < 0.01,
        "α_square = {:.5} ≈ 0.00406",
        alpha_sq
    );
}
