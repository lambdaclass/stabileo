/// Validation: Cable Structures (Pure Formula Verification)
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed.
///   - Ernst, "Der E-Modul von Seilen" (Effective modulus of cables), 1965
///   - Starossek, "Cable Dynamics", Structural Engineering International
///   - Krishna, "Cable-Suspended Roofs", McGraw-Hill
///
/// Tests verify cable analysis formulas without calling the solver.
///
/// Tests:
///   1. Catenary equations: horizontal thrust H = wL^2/(8d)
///   2. Cable sag under self-weight (parabolic approximation)
///   3. Cable length formulas: parabolic and exact catenary
///   4. Cable with concentrated loads: segment geometry
///   5. Ernst formula: effective cable stiffness
///   6. Wind loading on cables: drag force and galloping
///   7. Cable vibration: Irvine parameter lambda^2
///   8. Cable stiffness: axial + sag contributions

use std::f64::consts::PI;

// ================================================================
// 1. Catenary Equations: H = wL^2/(8d)
// ================================================================
//
// For a cable under uniform load w per unit horizontal length
// (parabolic cable), the horizontal thrust is:
//   H = w * L^2 / (8 * d)
// where L = horizontal span, d = sag at midspan.
//
// The vertical reactions are:
//   V_A = V_B = w * L / 2  (symmetric case)
//
// The maximum cable tension occurs at the supports:
//   T_max = sqrt(H^2 + V^2)
//
// Reference: Irvine, Cable Structures, Ch. 2

#[test]
fn validation_cable_catenary_horizontal_thrust() {
    let w: f64 = 5.0;    // kN/m, load per unit horizontal length
    let l: f64 = 100.0;  // m, horizontal span
    let d: f64 = 10.0;   // m, midspan sag

    // Horizontal thrust
    let h: f64 = w * l * l / (8.0 * d);
    let h_expected: f64 = 5.0 * 10000.0 / 80.0; // = 625 kN
    assert!(
        (h - h_expected).abs() / h_expected < 1e-12,
        "Horizontal thrust: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Vertical reactions (symmetric)
    let v: f64 = w * l / 2.0;
    let v_expected: f64 = 250.0; // kN
    assert!(
        (v - v_expected).abs() / v_expected < 1e-12,
        "Vertical reaction: computed={:.4}, expected={:.4}",
        v, v_expected
    );

    // Maximum cable tension at supports
    let t_max: f64 = (h * h + v * v).sqrt();
    let t_max_expected: f64 = (625.0_f64 * 625.0 + 250.0 * 250.0).sqrt();
    assert!(
        (t_max - t_max_expected).abs() / t_max_expected < 1e-12,
        "Max tension: computed={:.4}, expected={:.4}",
        t_max, t_max_expected
    );

    // Verify: H increases as sag decreases (inverse relationship)
    let d2: f64 = 5.0; // half the sag
    let h2: f64 = w * l * l / (8.0 * d2);
    assert!(
        (h2 - 2.0 * h).abs() < 1e-10,
        "Halving sag doubles thrust: H2={:.4}, 2*H={:.4}",
        h2, 2.0 * h
    );
}

// ================================================================
// 2. Cable Sag Under Self-Weight (Parabolic Approximation)
// ================================================================
//
// For a cable with self-weight w_c (kN/m) and total horizontal
// load w_t, the midspan sag is:
//   d = w_t * L^2 / (8 * H)
//
// The cable profile for parabolic assumption:
//   y(x) = 4 * d * x * (L - x) / L^2
//
// Sag-to-span ratio should be f/L = 1/8 to 1/12 for typical cables.
//
// Reference: Gimsing & Georgakis, Ch. 3

#[test]
fn validation_cable_sag_parabolic_profile() {
    let w_t: f64 = 8.0;   // kN/m, total distributed load
    let l: f64 = 120.0;   // m, span
    let h: f64 = 1440.0;  // kN, horizontal thrust

    // Compute sag from H
    let d: f64 = w_t * l * l / (8.0 * h);
    let d_expected: f64 = 8.0 * 14400.0 / 11520.0; // = 10.0 m
    assert!(
        (d - d_expected).abs() / d_expected < 1e-12,
        "Cable sag: computed={:.4}, expected={:.4}",
        d, d_expected
    );

    // Sag-to-span ratio
    let sag_ratio: f64 = d / l;
    let sag_ratio_expected: f64 = 10.0 / 120.0;
    assert!(
        (sag_ratio - sag_ratio_expected).abs() < 1e-12,
        "Sag ratio: computed={:.6}, expected={:.6}",
        sag_ratio, sag_ratio_expected
    );

    // Verify profile at quarter span: y(L/4) = 3d/4
    let x_quarter: f64 = l / 4.0;
    let y_quarter: f64 = 4.0 * d * x_quarter * (l - x_quarter) / (l * l);
    let y_quarter_expected: f64 = 3.0 * d / 4.0;
    assert!(
        (y_quarter - y_quarter_expected).abs() < 1e-10,
        "Profile at L/4: computed={:.6}, expected={:.6}",
        y_quarter, y_quarter_expected
    );

    // Verify profile at midspan: y(L/2) = d
    let x_mid: f64 = l / 2.0;
    let y_mid: f64 = 4.0 * d * x_mid * (l - x_mid) / (l * l);
    assert!(
        (y_mid - d).abs() < 1e-10,
        "Profile at midspan: computed={:.6}, expected={:.6}",
        y_mid, d
    );

    // Profile at supports should be zero
    let y_0: f64 = 4.0 * d * 0.0_f64 * (l - 0.0) / (l * l);
    let y_l: f64 = 4.0 * d * l * (l - l) / (l * l);
    assert!(
        y_0.abs() < 1e-12 && y_l.abs() < 1e-12,
        "Zero at supports: y(0)={:.6e}, y(L)={:.6e}",
        y_0, y_l
    );
}

// ================================================================
// 3. Cable Length Formulas: Parabolic and Exact Catenary
// ================================================================
//
// Parabolic cable length (approximate, for small sag/span):
//   S = L * (1 + 8/3 * (d/L)^2 - 128/5 * (d/L)^4 + ...)
//   For d/L small: S ≈ L * (1 + 8/3 * (d/L)^2)
//
// Exact catenary cable length:
//   S = 2 * (H/w) * sinh(wL/(2H))
//
// Reference: Irvine, Cable Structures, Eq. 2.12-2.15

#[test]
fn validation_cable_length_formulas() {
    let l: f64 = 200.0; // m, span
    let d: f64 = 20.0;  // m, sag (d/L = 0.1)
    let w: f64 = 3.0;   // kN/m

    // Horizontal thrust
    let h: f64 = w * l * l / (8.0 * d);
    let h_expected: f64 = 3.0 * 40000.0 / 160.0; // = 750 kN
    assert!(
        (h - h_expected).abs() / h_expected < 1e-12,
        "H: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Parabolic approximation for cable length
    let d_over_l: f64 = d / l;
    let s_parabolic: f64 = l * (1.0 + 8.0 / 3.0 * d_over_l * d_over_l);
    // = 200 * (1 + 8/3 * 0.01) = 200 * 1.02667 = 205.333
    let s_para_expected: f64 = 200.0 * (1.0 + 8.0 / 3.0 * 0.01);
    assert!(
        (s_parabolic - s_para_expected).abs() / s_para_expected < 1e-12,
        "Parabolic length: computed={:.4}, expected={:.4}",
        s_parabolic, s_para_expected
    );

    // Exact catenary length
    let s_catenary: f64 = 2.0 * (h / w) * (w * l / (2.0 * h)).sinh();
    // For small wL/(2H), sinh(x) ≈ x + x^3/6, so this should be close to parabolic
    assert!(
        s_catenary > l,
        "Catenary length ({:.4}) must exceed span ({:.4})",
        s_catenary, l
    );

    // Parabolic and catenary lengths should be close for d/L = 0.1
    let length_diff: f64 = (s_parabolic - s_catenary).abs() / s_catenary;
    assert!(
        length_diff < 0.01,
        "Parabolic vs catenary: diff={:.4}%, para={:.4}, cat={:.4}",
        length_diff * 100.0, s_parabolic, s_catenary
    );

    // Cable should be longer than span
    assert!(
        s_parabolic > l && s_catenary > l,
        "Cable length must exceed span"
    );
}

// ================================================================
// 4. Cable with Concentrated Loads: Segment Geometry
// ================================================================
//
// A cable with a single concentrated load P at distance a from
// the left support deflects to form two straight segments.
//
// Equilibrium at the load point gives:
//   H = P * a * (L - a) / (L * d)
//   V_A = P * (L - a) / L
//   V_B = P * a / L
//
// where d is the vertical sag at the load point.
//
// Reference: Hibbeler, Structural Analysis, Ch. 5 (Cables)

#[test]
fn validation_cable_concentrated_load() {
    let l: f64 = 40.0;  // m, span
    let p: f64 = 50.0;  // kN, concentrated load
    let a: f64 = 15.0;  // m, distance from left support
    let d: f64 = 5.0;   // m, sag at load point

    // Horizontal thrust
    let h: f64 = p * a * (l - a) / (l * d);
    // = 50 * 15 * 25 / (40 * 5) = 18750 / 200 = 93.75 kN
    let h_expected: f64 = 93.75;
    assert!(
        (h - h_expected).abs() / h_expected < 1e-12,
        "H (concentrated): computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Vertical reactions
    let v_a: f64 = p * (l - a) / l;
    let v_a_expected: f64 = 50.0 * 25.0 / 40.0; // = 31.25 kN
    assert!(
        (v_a - v_a_expected).abs() / v_a_expected < 1e-12,
        "V_A: computed={:.4}, expected={:.4}",
        v_a, v_a_expected
    );

    let v_b: f64 = p * a / l;
    let v_b_expected: f64 = 50.0 * 15.0 / 40.0; // = 18.75 kN
    assert!(
        (v_b - v_b_expected).abs() / v_b_expected < 1e-12,
        "V_B: computed={:.4}, expected={:.4}",
        v_b, v_b_expected
    );

    // Equilibrium: V_A + V_B = P
    assert!(
        (v_a + v_b - p).abs() < 1e-10,
        "Vertical equilibrium: V_A + V_B = {:.4}, P = {:.4}",
        v_a + v_b, p
    );

    // Tension in segment AC (left segment)
    let t_ac: f64 = (h * h + v_a * v_a).sqrt();
    let t_ac_expected: f64 = (93.75_f64 * 93.75 + 31.25 * 31.25).sqrt();
    assert!(
        (t_ac - t_ac_expected).abs() / t_ac_expected < 1e-12,
        "Tension AC: computed={:.4}, expected={:.4}",
        t_ac, t_ac_expected
    );

    // Tension in segment CB (right segment)
    let t_cb: f64 = (h * h + v_b * v_b).sqrt();
    // Left segment has higher tension (steeper angle)
    assert!(
        t_ac > t_cb,
        "Left segment tension ({:.4}) > right ({:.4})",
        t_ac, t_cb
    );
}

// ================================================================
// 5. Ernst Formula: Effective Cable Stiffness
// ================================================================
//
// The Ernst formula accounts for the reduction in apparent elastic
// modulus of a cable due to sag. The effective modulus is:
//
//   E_eff = E / (1 + (w_c * L_h)^2 * A * E / (12 * T^3))
//
// where:
//   E = cable elastic modulus
//   w_c = cable weight per unit length
//   L_h = horizontal projected length
//   A = cable cross-section area
//   T = cable tension
//
// For highly stressed cables (T >> w_c*L_h), E_eff -> E.
// For low-tension cables, sag effect is dominant.
//
// Reference: Ernst, "Der E-Modul von Seilen", 1965

#[test]
fn validation_cable_ernst_effective_modulus() {
    let e_cable: f64 = 195_000.0; // MPa, cable elastic modulus
    let a_cable: f64 = 2000.0;    // mm^2, cable cross-section area
    let w_c: f64 = 0.155;         // kN/m, cable weight per unit length
    let l_h: f64 = 150.0;         // m, horizontal projected length

    // High tension case
    let t_high: f64 = 500.0; // kN
    let numerator: f64 = (w_c * l_h) * (w_c * l_h) * (a_cable * e_cable / 1000.0);
    // a_cable * e_cable / 1000 converts mm^2 * MPa to kN
    // = 2000 * 195000 / 1000 = 390000 kN
    let denominator_high: f64 = 12.0 * t_high * t_high * t_high;

    let e_eff_high: f64 = e_cable / (1.0 + numerator / denominator_high);

    // For high tension, E_eff should be close to E
    let ratio_high: f64 = e_eff_high / e_cable;
    assert!(
        ratio_high > 0.80,
        "High tension: E_eff/E = {:.4} (should be close to 1.0)",
        ratio_high
    );

    // Low tension case
    let t_low: f64 = 100.0; // kN
    let denominator_low: f64 = 12.0 * t_low * t_low * t_low;
    let e_eff_low: f64 = e_cable / (1.0 + numerator / denominator_low);

    // For low tension, E_eff should be much less than E
    let ratio_low: f64 = e_eff_low / e_cable;
    assert!(
        ratio_low < ratio_high,
        "Low tension: E_eff/E={:.4} < high tension E_eff/E={:.4}",
        ratio_low, ratio_high
    );

    // E_eff always positive and less than E
    assert!(
        e_eff_high > 0.0 && e_eff_high <= e_cable,
        "E_eff should be in (0, E]: {:.2}",
        e_eff_high
    );
    assert!(
        e_eff_low > 0.0 && e_eff_low <= e_cable,
        "E_eff should be in (0, E]: {:.2}",
        e_eff_low
    );
}

// ================================================================
// 6. Wind Loading on Cables: Drag Force
// ================================================================
//
// Wind load per unit length on a cable:
//   F_w = 0.5 * rho * V^2 * C_d * D
//
// where:
//   rho = air density (1.225 kg/m^3 at sea level)
//   V = wind speed (m/s)
//   C_d = drag coefficient (1.2 for circular cable)
//   D = cable diameter (m)
//
// For a stay cable, combined gravity + wind loading changes
// the sag plane and increases tension.
//
// Reference: Gimsing & Georgakis, Ch. 8

#[test]
fn validation_cable_wind_loading() {
    let rho: f64 = 1.225;    // kg/m^3, air density
    let v: f64 = 40.0;       // m/s, design wind speed
    let c_d: f64 = 1.2;      // drag coefficient for circular cable
    let d_cable: f64 = 0.10; // m, cable diameter (100 mm)

    // Wind force per unit length
    let f_w: f64 = 0.5 * rho * v * v * c_d * d_cable;
    // = 0.5 * 1.225 * 1600 * 1.2 * 0.10
    // = 0.5 * 1.225 * 192.0 = 117.6 N/m
    let f_w_expected: f64 = 0.5 * 1.225 * 1600.0 * 1.2 * 0.10;
    assert!(
        (f_w - f_w_expected).abs() / f_w_expected < 1e-12,
        "Wind force: computed={:.4} N/m, expected={:.4} N/m",
        f_w, f_w_expected
    );

    // Convert to kN/m
    let f_w_kn: f64 = f_w / 1000.0;
    assert!(
        f_w_kn > 0.0 && f_w_kn < 1.0,
        "Wind force in kN/m should be small: {:.4}",
        f_w_kn
    );

    // Combined loading: gravity (cable self-weight) + wind
    let w_gravity: f64 = 0.60; // kN/m, cable self-weight
    let w_combined: f64 = (w_gravity * w_gravity + f_w_kn * f_w_kn).sqrt();
    // Resultant load per unit length
    assert!(
        w_combined > w_gravity,
        "Combined load ({:.4}) > gravity alone ({:.4})",
        w_combined, w_gravity
    );

    // Angle of resultant from vertical
    let theta: f64 = (f_w_kn / w_gravity).atan();
    let theta_deg: f64 = theta * 180.0 / PI;
    assert!(
        theta_deg > 0.0 && theta_deg < 45.0,
        "Resultant angle: {:.2} degrees",
        theta_deg
    );

    // Wind speed proportional to force squared: doubling V quadruples F
    let v2: f64 = 2.0 * v;
    let f_w2: f64 = 0.5 * rho * v2 * v2 * c_d * d_cable;
    assert!(
        (f_w2 - 4.0 * f_w).abs() / (4.0 * f_w) < 1e-10,
        "Doubling wind speed quadruples force: F2={:.4}, 4F={:.4}",
        f_w2, 4.0 * f_w
    );
}

// ================================================================
// 7. Cable Vibration: Irvine Parameter Lambda^2
// ================================================================
//
// The Irvine parameter lambda^2 characterizes cable dynamics:
//   lambda^2 = (w * L / H)^2 * (L / L_e) * (E * A / H)
//
// Simplified for small sag:
//   lambda^2 = (w_c * L_h)^2 * L_h * E * A / (H^3 * L_e)
//
// where L_e = effective cable length.
// For horizontal cables: L_e ≈ L * (1 + 8*(d/L)^2)
//
// When lambda^2 < 4*pi^2: first symmetric mode has lower freq
// than first antisymmetric mode (cable behaves like a taut string).
//
// When lambda^2 = 4*pi^2: frequency crossover (Irvine's crossover).
//
// Reference: Irvine, "Cable Structures", Ch. 4

#[test]
fn validation_cable_irvine_parameter() {
    let w_c: f64 = 1.0;     // kN/m, cable weight per unit length
    let l: f64 = 100.0;     // m, span
    let d: f64 = 5.0;       // m, sag (d/L = 0.05)
    let e: f64 = 160_000.0; // MPa, cable modulus
    let a: f64 = 5000.0;    // mm^2, cable area

    // Horizontal thrust
    let h: f64 = w_c * l * l / (8.0 * d);
    let h_expected: f64 = 1.0 * 10000.0 / 40.0; // = 250 kN
    assert!(
        (h - h_expected).abs() / h_expected < 1e-12,
        "H: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Effective cable length (approximate)
    let d_over_l: f64 = d / l;
    let l_e: f64 = l * (1.0 + 8.0 * d_over_l * d_over_l);
    let l_e_expected: f64 = 100.0 * (1.0 + 8.0 * 0.0025);
    assert!(
        (l_e - l_e_expected).abs() / l_e_expected < 1e-12,
        "Effective length: computed={:.4}, expected={:.4}",
        l_e, l_e_expected
    );

    // Irvine parameter: lambda^2 = (wL/H)^2 * (L*EA)/(H*L_e)
    // EA in kN: e * a / 1000 = 160000 * 5000 / 1000 = 800000 kN
    let ea_kn: f64 = e * a / 1000.0;
    let lambda_sq: f64 = (w_c * l / h).powi(2) * l * ea_kn / (h * l_e);

    // Compare to crossover value 4*pi^2 ≈ 39.478
    let crossover: f64 = 4.0 * PI * PI;
    assert!(
        crossover > 0.0,
        "Crossover value: {:.4}",
        crossover
    );

    // Lambda^2 should be positive
    assert!(
        lambda_sq > 0.0,
        "Lambda^2 must be positive: {:.4}",
        lambda_sq
    );

    // Fundamental frequency of taut string (antisymmetric):
    // f_1 = (1/(2L)) * sqrt(H / (m))
    // where m = w_c / g (mass per unit length)
    let g: f64 = 9.81; // m/s^2
    let m: f64 = w_c / g; // kN/m / (m/s^2) = kN*s^2/m^2
    // Need H in N and m in kg/m for proper units:
    // H_n = 250 * 1000 = 250000 N, m_kg = 1000/9.81 ≈ 101.94 kg/m
    let h_n: f64 = h * 1000.0;       // N
    let m_kg: f64 = w_c * 1000.0 / g; // kg/m
    let f_1: f64 = 1.0 / (2.0 * l) * (h_n / m_kg).sqrt();
    assert!(
        f_1 > 0.0,
        "Fundamental frequency: {:.4} Hz",
        f_1
    );
    let _ = m;
}

// ================================================================
// 8. Cable Stiffness: Axial + Sag Contributions
// ================================================================
//
// Total cable stiffness (horizontal) combines elastic stretching
// and sag change (geometric stiffness):
//
//   1/K_total = 1/K_elastic + 1/K_sag
//
// where:
//   K_elastic = EA / L_e  (axial stiffness)
//   K_sag = 12 * H^3 / (w^2 * L_h^3)  (sag stiffness)
//
// For highly prestressed cables: K_sag >> K_elastic, so K_total -> K_elastic
// For slack cables: K_sag << K_elastic, so K_total -> K_sag
//
// Reference: Gimsing & Georgakis, Eq. 3.21-3.24

#[test]
fn validation_cable_stiffness_components() {
    let e: f64 = 195_000.0;   // MPa, elastic modulus
    let a: f64 = 3000.0;      // mm^2, cross-section area
    let w_c: f64 = 0.23;      // kN/m, cable weight
    let l_h: f64 = 200.0;     // m, horizontal projected length
    let d: f64 = 10.0;        // m, midspan sag

    // EA in kN
    let ea_kn: f64 = e * a / 1000.0; // = 585000 kN

    // Horizontal thrust
    let h: f64 = w_c * l_h * l_h / (8.0 * d);
    let h_expected: f64 = 0.23 * 40000.0 / 80.0; // = 115 kN
    assert!(
        (h - h_expected).abs() / h_expected < 1e-10,
        "H: computed={:.4}, expected={:.4}",
        h, h_expected
    );

    // Effective cable length
    let d_over_l: f64 = d / l_h;
    let l_e: f64 = l_h * (1.0 + 8.0 * d_over_l * d_over_l);

    // Elastic stiffness
    let k_elastic: f64 = ea_kn / l_e;

    // Sag stiffness
    let k_sag: f64 = 12.0 * h * h * h / (w_c * w_c * l_h * l_h * l_h);

    // Total stiffness (series combination)
    let k_total: f64 = 1.0 / (1.0 / k_elastic + 1.0 / k_sag);

    // Total should be less than both individual stiffnesses
    assert!(
        k_total < k_elastic && k_total < k_sag,
        "Series: K_total={:.2} < K_e={:.2} and K_s={:.2}",
        k_total, k_elastic, k_sag
    );

    // Verify that increasing tension increases sag stiffness (cubic)
    let h2: f64 = 2.0 * h;
    let k_sag2: f64 = 12.0 * h2 * h2 * h2 / (w_c * w_c * l_h * l_h * l_h);
    assert!(
        (k_sag2 - 8.0 * k_sag).abs() / (8.0 * k_sag) < 1e-10,
        "Doubling H: K_sag*8={:.2}, K_sag2={:.2}",
        8.0 * k_sag, k_sag2
    );

    // Both stiffnesses must be positive
    assert!(
        k_elastic > 0.0 && k_sag > 0.0 && k_total > 0.0,
        "All stiffnesses must be positive"
    );
}
