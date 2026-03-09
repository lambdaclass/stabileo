/// Validation: Cable and Suspension Bridge Analysis (Pure Formula Verification)
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed.
///   - Ernst, "Der E-Modul von Seilen unter Beruecksichtigung des Durchhanges"
///     (Der Bauingenieur, 1965)
///   - Starossek, "Cable Dynamics — A Review", Structural Eng. International, 1994
///   - O'Brien & Francis, "Cable Movements Under Two-Dimensional Loads"
///   - Pugsley, "The Theory of Suspension Bridges", 2nd Ed.
///
/// Tests verify cable analysis formulas without calling the solver.
/// Pure arithmetic verification of catenary, parabolic cable, and Ernst modulus.

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
// 1. Catenary Equation: Sag Under Self-Weight (Irvine, Ch. 2)
// ================================================================
//
// A cable hanging under its own weight w (force/length of cable) forms
// a catenary curve:
//   y(x) = H/w * (cosh(w*x/H) - 1)
//
// where H = horizontal tension, origin at lowest point.
//
// For a symmetric cable with span L and sag d:
//   d = H/w * (cosh(w*L/(2H)) - 1)
//
// Cable length: S = 2H/w * sinh(w*L/(2H))
//
// For small sag/span ratio (d/L < 1/8), the parabolic approximation:
//   d ≈ wL^2/(8H) or equivalently H ≈ wL^2/(8d)
//   S ≈ L*(1 + 8d^2/(3L^2))

#[test]
fn validation_catenary_sag_self_weight() {
    let l: f64 = 200.0;    // m, span
    let w: f64 = 0.5;      // kN/m, cable self-weight per unit length

    // Case 1: sag-to-span ratio = 1/10 => d = 20 m
    let d: f64 = 20.0;

    // Parabolic approximation for H
    let h_parab: f64 = w * l * l / (8.0 * d);
    assert_close(h_parab, 0.5 * 40000.0 / 160.0, 0.001, "H parabolic");
    assert_close(h_parab, 125.0, 0.001, "H = 125 kN");

    // Catenary: solve H/w * (cosh(wL/(2H)) - 1) = d numerically
    // For d/L = 0.1, the catenary and parabola differ by ~1-2%.
    // Let's verify the catenary sag with the parabolic H:
    let arg: f64 = w * l / (2.0 * h_parab);
    let d_catenary: f64 = h_parab / w * (arg.cosh() - 1.0);

    // Catenary sag should be slightly different from parabolic
    let diff_pct: f64 = ((d_catenary - d) / d).abs() * 100.0;
    assert!(
        diff_pct < 5.0,
        "Catenary vs parabolic sag differ by {:.2}% (should be < 5%)",
        diff_pct
    );

    // Cable length: parabolic approximation
    let s_parab: f64 = l * (1.0 + 8.0 * d * d / (3.0 * l * l));
    assert!(s_parab > l, "Cable is longer than span");

    // Catenary length
    let s_catenary: f64 = 2.0 * h_parab / w * (arg).sinh();

    // Both lengths should agree within ~2% for d/L = 0.1
    let len_diff: f64 = ((s_catenary - s_parab) / s_parab).abs();
    assert!(
        len_diff < 0.03,
        "Cable length: catenary={:.2}, parabolic={:.2}, diff={:.2}%",
        s_catenary, s_parab, len_diff * 100.0
    );

    // Cable length exceeds span by a known amount
    let excess_ratio: f64 = (s_parab - l) / l;
    let expected_excess: f64 = 8.0 * d * d / (3.0 * l * l);
    assert_close(excess_ratio, expected_excess, 0.01, "Length excess ratio");
}

// ================================================================
// 2. Parabolic Cable Under Uniform Horizontal Load (Pugsley, Ch. 1)
// ================================================================
//
// When load is uniform per horizontal length (e.g., dead load of deck):
//   y(x) = 4*d*x*(L-x)/L^2  (parabola, origin at left support)
//   where d = sag at midspan
//
// Max slope at supports: dy/dx|_{x=0} = 4d/L
// Cable tension at any point:
//   T(x) = H * sqrt(1 + (dy/dx)^2)
//   dy/dx = 4d*(L-2x)/L^2
//
// At midspan (x=L/2): T = H (minimum tension, horizontal)
// At supports (x=0,L): T = H*sqrt(1 + (4d/L)^2) (maximum tension)

#[test]
fn validation_parabolic_cable_profile() {
    let l: f64 = 300.0;    // m, span
    let d: f64 = 30.0;     // m, midspan sag
    let q: f64 = 20.0;     // kN/m, uniform load per horizontal length

    // Horizontal thrust
    let h: f64 = q * l * l / (8.0 * d);
    assert_close(h, 20.0 * 90000.0 / 240.0, 0.001, "H = qL^2/(8d)");
    assert_close(h, 7500.0, 0.001, "H = 7500 kN");

    // Cable profile at quarter span
    let x: f64 = l / 4.0;
    let y_quarter: f64 = 4.0 * d * x * (l - x) / (l * l);
    assert_close(y_quarter, 4.0 * 30.0 * 75.0 * 225.0 / 90000.0, 0.001, "y at L/4");
    assert_close(y_quarter, 22.5, 0.001, "Sag at quarter span = 3d/4");

    // At midspan, y = d
    let y_mid: f64 = 4.0 * d * (l / 2.0) * (l / 2.0) / (l * l);
    assert_close(y_mid, d, 1e-10, "Sag at midspan = d");

    // Slope at support
    let slope_support: f64 = 4.0 * d / l;
    assert_close(slope_support, 0.4, 0.001, "Slope at support = 4d/L");

    // Maximum tension at supports
    let t_support: f64 = h * (1.0 + slope_support * slope_support).sqrt();
    let expected_t: f64 = 7500.0 * (1.0_f64 + 0.16).sqrt();
    assert_close(t_support, expected_t, 0.001, "T at support");

    // Minimum tension at midspan
    let t_midspan: f64 = h; // slope = 0 at midspan
    assert_close(t_midspan, 7500.0, 0.001, "T at midspan = H");

    // Tension ratio
    let tension_ratio: f64 = t_support / t_midspan;
    assert_close(tension_ratio, (1.0_f64 + 0.16).sqrt(), 0.001, "Tension ratio");
    assert!(tension_ratio > 1.0, "Support tension > midspan tension");
}

// ================================================================
// 3. Cable Tension at Supports (Asymmetric Case)
// ================================================================
//
// Cable with supports at different heights:
//   Left: (0, 0), Right: (L, h_diff)
//   Uniform load q per horizontal length, sag d measured from chord.
//
// The cable equation shifts: y(x) = h_diff*x/L + 4*d*x*(L-x)/L^2 - correction
// Horizontal thrust still: H = q*L^2/(8*d)
//
// Vertical reactions:
//   V_left = q*L/2 - H*h_diff/L
//   V_right = q*L/2 + H*h_diff/L

#[test]
fn validation_cable_tension_supports() {
    let l: f64 = 150.0;    // m, horizontal span
    let h_diff: f64 = 15.0; // m, right support is 15m higher
    let q: f64 = 10.0;      // kN/m, uniform horizontal load
    let d: f64 = 18.0;      // m, sag from chord

    // Horizontal thrust
    let h: f64 = q * l * l / (8.0 * d);
    assert_close(h, 10.0 * 22500.0 / 144.0, 0.001, "H asymmetric cable");

    // Vertical reactions
    let v_left: f64 = q * l / 2.0 - h * h_diff / l;
    let v_right: f64 = q * l / 2.0 + h * h_diff / l;

    // Sum of vertical reactions = total load
    let v_total: f64 = v_left + v_right;
    assert_close(v_total, q * l, 1e-10, "Sum V = qL");

    // Right support carries more due to height difference
    assert!(
        v_right > v_left,
        "Higher support carries more: V_R={:.1} > V_L={:.1}",
        v_right, v_left
    );

    // Cable tensions at supports
    let t_left: f64 = (h * h + v_left * v_left).sqrt();
    let t_right: f64 = (h * h + v_right * v_right).sqrt();

    // Both tensions must be positive
    assert!(t_left > 0.0, "Left tension positive");
    assert!(t_right > 0.0, "Right tension positive");

    // Right support has higher tension (steeper cable on that side)
    assert!(
        t_right > t_left,
        "T_right ({:.1}) > T_left ({:.1})",
        t_right, t_left
    );

    // For zero height difference, reactions are symmetric
    let v_left_sym: f64 = q * l / 2.0;
    let v_right_sym: f64 = q * l / 2.0;
    assert_close(v_left_sym, v_right_sym, 1e-10, "Symmetric reactions for h=0");
}

// ================================================================
// 4. Horizontal Thrust of Parabolic Cable (Gimsing, Ch. 3)
// ================================================================
//
// H = q*L^2 / (8*d)
//
// For a given cable: increasing sag decreases H (and thus tension).
// Sag-span ratio design: typical suspension bridge main cable d/L ~ 1/9 to 1/11.
//
// The cable's weight per unit length w relates to its cross-section:
//   A_cable = H_max / (f_allowable)
// where f_allowable = 0.4 * f_ult for bridge cables (f_ult ~ 1770 MPa for steel wire)

#[test]
fn validation_horizontal_thrust_parabolic() {
    let l: f64 = 500.0;    // m, main span
    let q: f64 = 150.0;    // kN/m, total distributed load (deck + cable self-weight)

    // Sag-span ratios
    let sag_ratios: [f64; 4] = [1.0 / 8.0, 1.0 / 9.0, 1.0 / 10.0, 1.0 / 12.0];

    let mut h_values: Vec<f64> = Vec::new();
    for &ratio in &sag_ratios {
        let d: f64 = ratio * l;
        let h: f64 = q * l * l / (8.0 * d);
        h_values.push(h);

        // H = q*L / (8*ratio)
        let expected_h: f64 = q * l / (8.0 * ratio);
        assert_close(h, expected_h, 1e-10, &format!("H at d/L={:.3}", ratio));
    }

    // Larger sag -> smaller thrust
    for i in 1..h_values.len() {
        assert!(
            h_values[i] > h_values[i - 1],
            "Smaller sag ratio -> larger thrust: H={:.0} > H={:.0}",
            h_values[i], h_values[i - 1]
        );
    }

    // For d/L = 1/10 (typical):
    let d_typical: f64 = l / 10.0;
    let h_typical: f64 = q * l * l / (8.0 * d_typical);
    assert_close(h_typical, 150.0 * 500.0 / (8.0 * 0.1), 0.001, "H typical");

    // Cable area required
    let f_ult: f64 = 1770.0; // MPa = N/mm^2 = 1770e3 kN/m^2
    let safety_factor: f64 = 2.5; // f_allow = f_ult / SF
    let f_allow: f64 = f_ult / safety_factor; // MPa

    // Max tension at support
    let slope: f64 = 4.0 * d_typical / l;
    let t_max: f64 = h_typical * (1.0 + slope * slope).sqrt();
    let a_cable: f64 = t_max / (f_allow * 1000.0); // m^2 (convert MPa to kN/m^2)
    assert!(a_cable > 0.0, "Cable area must be positive");

    // Cable weight per meter = gamma_steel * A
    let gamma_steel: f64 = 78.5; // kN/m^3
    let cable_weight: f64 = gamma_steel * a_cable;

    // Cable self-weight should be a fraction of total load
    let cable_load_fraction: f64 = cable_weight / q;
    assert!(
        cable_load_fraction < 0.5,
        "Cable self-weight fraction = {:.2} (should be < 50%)",
        cable_load_fraction
    );
}

// ================================================================
// 5. Cable Elongation Under Thermal Effects (Gimsing, Ch. 5)
// ================================================================
//
// Thermal expansion of cable:
//   Delta_L = alpha * Delta_T * L_cable
//
// For a parabolic cable, the unstressed length:
//   L_cable ≈ L * (1 + 8*(d/L)^2/3)
//
// Change in sag due to temperature change:
//   Delta_d / d ≈ (3/16) * (L/d)^2 * alpha * Delta_T
//   (for parabolic cable with inextensible assumption)
//
// Steel: alpha = 12e-6 /°C

#[test]
fn validation_cable_thermal_elongation() {
    let l: f64 = 400.0;            // m, span
    let d: f64 = 40.0;             // m, sag (d/L = 1/10)
    let alpha: f64 = 12e-6;        // 1/°C, steel thermal expansion
    let delta_t: f64 = 40.0;       // °C, temperature rise

    // Cable length (parabolic approximation)
    let sag_ratio: f64 = d / l;
    let l_cable: f64 = l * (1.0 + 8.0 * sag_ratio * sag_ratio / 3.0);
    let expected_l: f64 = 400.0 * (1.0 + 8.0 * 0.01 / 3.0);
    assert_close(l_cable, expected_l, 0.001, "Cable length");

    // Cable extension due to temperature
    let delta_l: f64 = alpha * delta_t * l_cable;
    assert_close(delta_l, 12e-6 * 40.0 * l_cable, 1e-10, "Thermal extension");

    // Approximate sag change (linearized)
    // For parabolic cable: Delta_d/d ~ (3/16)*(L/d)^2 * alpha * Delta_T
    let delta_d_ratio: f64 = (3.0 / 16.0) * (l / d).powi(2) * alpha * delta_t;
    let delta_d: f64 = delta_d_ratio * d;

    // The sag increases with temperature (cable gets longer)
    assert!(delta_d > 0.0, "Sag increases with temperature rise");

    // Sag change should be a small fraction of original sag
    assert!(
        delta_d_ratio < 0.1,
        "Sag change fraction = {:.4} (should be < 10%)",
        delta_d_ratio
    );

    // Verify the formula: (3/16)*(L/d)^2*alpha*DT
    let expected_ratio: f64 = 3.0 / 16.0 * 100.0 * 12e-6 * 40.0;
    assert_close(delta_d_ratio, expected_ratio, 0.001, "Sag change ratio");

    // Horizontal thrust changes: H = qL^2/(8d), so dH/H = -dd/d
    let q: f64 = 50.0; // kN/m
    let h_orig: f64 = q * l * l / (8.0 * d);
    let h_new: f64 = q * l * l / (8.0 * (d + delta_d));
    let h_change_pct: f64 = ((h_new - h_orig) / h_orig).abs() * 100.0;
    assert!(
        h_change_pct < 5.0,
        "Thrust change = {:.2}% (small for moderate temp change)",
        h_change_pct
    );

    // Temperature rise reduces thrust (more sag)
    assert!(h_new < h_orig, "Higher temp -> more sag -> lower thrust");
}

// ================================================================
// 6. Suspension Bridge Main Cable Profile (Pugsley, Ch. 2)
// ================================================================
//
// Main cable of a 3-span suspension bridge:
//   Main span L_m with sag d_m
//   Side spans L_s with sag d_s
//
// For the cable to have no bending at the tower:
//   d_s/d_m = (L_s/L_m)^2  (equal horizontal thrust)
//
// The sag in the side span for equal H:
//   H_main = q_m * L_m^2 / (8*d_m)
//   H_side = q_s * L_s^2 / (8*d_s)
//   For H_main = H_side and q_m = q_s: d_s = d_m*(L_s/L_m)^2

#[test]
fn validation_suspension_bridge_cable_profile() {
    let l_m: f64 = 1000.0;  // m, main span
    let l_s: f64 = 400.0;   // m, side spans
    let d_m: f64 = 100.0;   // m, main span sag (d/L = 1/10)
    let q: f64 = 200.0;     // kN/m, uniform load (same for all spans)

    // Required side span sag for equal horizontal thrust
    let d_s: f64 = d_m * (l_s / l_m).powi(2);
    assert_close(d_s, 100.0 * 0.16, 0.001, "Side span sag");
    assert_close(d_s, 16.0, 0.001, "d_s = 16 m");

    // Verify equal horizontal thrust
    let h_main: f64 = q * l_m * l_m / (8.0 * d_m);
    let h_side: f64 = q * l_s * l_s / (8.0 * d_s);
    assert_close(h_main, h_side, 1e-10, "Equal thrust in main and side spans");

    // Main cable max tension (at tower, main span side)
    let slope_main: f64 = 4.0 * d_m / l_m;
    let t_tower_main: f64 = h_main * (1.0 + slope_main * slope_main).sqrt();

    // Main cable max tension (at tower, side span side)
    let slope_side: f64 = 4.0 * d_s / l_s;
    let t_tower_side: f64 = h_side * (1.0 + slope_side * slope_side).sqrt();

    // At the tower: cable angles from both sides
    // tan(theta_main) = 4*d_m/L_m, tan(theta_side) = 4*d_s/L_s
    let theta_main: f64 = slope_main.atan();
    let theta_side: f64 = slope_side.atan();

    // For parabolic cables with equal H and d_s = d_m*(Ls/Lm)^2:
    // slope_side = 4*d_s/L_s = 4*d_m*(Ls/Lm)^2/Ls = 4*d_m*Ls/Lm^2
    // slope_main = 4*d_m/L_m
    // slope_side/slope_main = Ls/Lm
    assert_close(
        slope_side / slope_main,
        l_s / l_m,
        0.001,
        "Slope ratio = span ratio"
    );

    // Tower vertical force = V_main + V_side
    let v_main: f64 = q * l_m / 2.0;
    let v_side: f64 = q * l_s / 2.0;
    let v_tower: f64 = v_main + v_side;
    assert_close(v_tower, q * (l_m + l_s) / 2.0, 0.001, "Tower vertical load");

    // Total cable length (main span, parabolic)
    let s_main: f64 = l_m * (1.0 + 8.0 * (d_m / l_m).powi(2) / 3.0);
    assert!(s_main > l_m, "Cable longer than span");

    let _ = (t_tower_main, t_tower_side, theta_main, theta_side);
}

// ================================================================
// 7. Cable Natural Frequency: Irvine Parameter (Irvine, Ch. 4)
// ================================================================
//
// The Irvine parameter lambda^2 governs cable vibration behavior:
//   lambda^2 = (wL)^2 * L / (H * L_e * EA)
//            = (w*L/H)^2 * (L*EA / (H*L_e))
//
// where L_e = L*(1 + 8*(d/L)^2) is the effective cable length
//       (for the elastic elongation integral).
//
// Simplified for flat cables (d/L < 1/8):
//   lambda^2 = (mgL/H)^2 / (H*L/(EA))
//            = (8d/L)^2 * EA*L / H
//            = 64*(d/L)^2 * EA/H
//
// Natural frequencies:
//   In-plane symmetric: f_n determined by tan(xi_n/2) = xi_n/2 - 4/lambda^2*(xi_n/2)^3
//   Out-of-plane: f_n = n*pi*sqrt(H/(m*L^2)) (string-like)
//   In-plane antisymmetric: same as out-of-plane

#[test]
fn validation_cable_natural_frequency_irvine() {
    let l: f64 = 100.0;     // m, span
    let d: f64 = 5.0;       // m, sag (d/L = 0.05)
    let e: f64 = 160e6;     // kN/m^2 (160 GPa), cable modulus
    let a: f64 = 0.005;     // m^2, cable area
    let w: f64 = 0.4;       // kN/m, weight per unit length

    // Horizontal thrust
    let h: f64 = w * l * l / (8.0 * d);
    assert_close(h, 100.0, 0.001, "H = 100 kN");

    // Effective length for elastic stretch
    let l_e: f64 = l * (1.0 + 8.0 * (d / l).powi(2));
    assert_close(l_e, 100.0 * (1.0 + 8.0 * 0.0025), 0.001, "L_e");
    assert_close(l_e, 102.0, 0.001, "L_e = 102 m");

    // Irvine parameter lambda^2
    let lambda_sq: f64 = (w * l).powi(2) * l / (h * l_e * e * a);
    assert!(lambda_sq > 0.0, "Lambda^2 must be positive");

    // Lambda^2 should be a small positive number for this cable
    assert!(lambda_sq > 0.0 && lambda_sq < 1.0,
        "Lambda^2 = {:.6} should be small for stiff cable", lambda_sq);

    // For lambda^2 < 4*pi^2 ≈ 39.48: first symmetric mode is above first antisymmetric
    // For lambda^2 > 4*pi^2: first symmetric is below (crossover point)
    let crossover: f64 = 4.0 * PI * PI;
    assert_close(crossover, 39.478, 0.001, "Crossover lambda^2 = 4*pi^2");

    // Out-of-plane frequency (string-like):
    // f1 = (1/2L) * sqrt(H/m)
    // m = w/g (mass per unit length), but w is already force/length
    let g: f64 = 9.81;
    let m_per_length: f64 = w / g; // kN/m / (m/s^2) = kN*s^2/m^2
    let f1_oop: f64 = (1.0 / (2.0 * l)) * (h / m_per_length).sqrt();

    // Frequency should be in reasonable range (0.1-10 Hz)
    assert!(
        f1_oop > 0.01 && f1_oop < 50.0,
        "f1 = {:.3} Hz, should be reasonable",
        f1_oop
    );

    // Second mode out-of-plane: f2 = 2*f1
    let f2_oop: f64 = 2.0 * f1_oop;
    assert_close(f2_oop / f1_oop, 2.0, 1e-10, "f2/f1 = 2 for string");
}

// ================================================================
// 8. Ernst Equivalent Modulus for Cable Stays (Ernst, 1965)
// ================================================================
//
// For an inclined cable stay, the effective modulus accounting for
// sag is reduced from the material modulus E:
//
//   E_eff = E / (1 + (gamma*L_h)^2 * E * A / (12 * T^3))
//
// where:
//   gamma = cable weight per unit length (force/length)
//   L_h = horizontal projection of the cable
//   T = cable tension (assumed constant for flat cables)
//   A = cable cross-sectional area
//
// For high tension (T large), E_eff -> E (sag negligible).
// For low tension, E_eff << E (sag dominates).

#[test]
fn validation_ernst_equivalent_modulus() {
    let e_mat: f64 = 195e6;    // kN/m^2 (195 GPa), cable material modulus
    let a: f64 = 0.003;        // m^2, cable area
    let gamma: f64 = 0.24;     // kN/m, cable weight per unit length
    let l_h: f64 = 200.0;      // m, horizontal projection

    // Case 1: High tension (T = 3000 kN)
    let t_high: f64 = 3000.0;
    let e_eff_high: f64 = e_mat / (1.0 + (gamma * l_h).powi(2) * e_mat * a
        / (12.0 * t_high.powi(3)));

    // At high tension, E_eff is close to E_mat
    let reduction_high: f64 = e_eff_high / e_mat;
    assert!(
        reduction_high > 0.90,
        "High tension: E_eff/E = {:.4} > 0.90",
        reduction_high
    );

    // Case 2: Low tension (T = 500 kN)
    let t_low: f64 = 500.0;
    let e_eff_low: f64 = e_mat / (1.0 + (gamma * l_h).powi(2) * e_mat * a
        / (12.0 * t_low.powi(3)));

    // At low tension, E_eff is significantly reduced
    let reduction_low: f64 = e_eff_low / e_mat;
    assert!(
        reduction_low < 0.90,
        "Low tension: E_eff/E = {:.4} < 0.90",
        reduction_low
    );

    // Higher tension -> higher effective modulus
    assert!(
        e_eff_high > e_eff_low,
        "E_eff(high T) > E_eff(low T): {:.0} > {:.0}",
        e_eff_high, e_eff_low
    );

    // The sag parameter (denominator term)
    let sag_param = |t: f64| -> f64 {
        (gamma * l_h).powi(2) * e_mat * a / (12.0 * t.powi(3))
    };

    // Sag parameter decreases rapidly with tension (cubic)
    let sp_high: f64 = sag_param(t_high);
    let sp_low: f64 = sag_param(t_low);
    let sp_ratio: f64 = sp_low / sp_high;
    let expected_ratio: f64 = (t_high / t_low).powi(3);
    assert_close(sp_ratio, expected_ratio, 0.001, "Sag param ratio ~ (T_high/T_low)^3");

    // For very short cables (L_h small), sag effect is negligible
    let l_h_short: f64 = 20.0;
    let e_eff_short: f64 = e_mat / (1.0 + (gamma * l_h_short).powi(2) * e_mat * a
        / (12.0 * t_low.powi(3)));
    assert!(
        e_eff_short / e_mat > 0.99,
        "Short cable: E_eff/E = {:.4} > 0.99 even at low tension",
        e_eff_short / e_mat
    );

    // E_eff is bounded: 0 < E_eff <= E_mat
    assert!(e_eff_high > 0.0 && e_eff_high <= e_mat, "E_eff bounds (high)");
    assert!(e_eff_low > 0.0 && e_eff_low <= e_mat, "E_eff bounds (low)");
}
