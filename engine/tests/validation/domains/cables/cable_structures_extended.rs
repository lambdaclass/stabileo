/// Validation: Advanced Cable/Catenary Structure Analysis (Extended)
///
/// References:
///   - Irvine, "Cable Structures", MIT Press, 1981
///   - Ernst, "Der E-Modul von Seilen", Der Stahlbau 34(11), 1965
///   - Gimsing & Georgakis, "Cable Supported Bridges", 3rd Ed., 2012
///   - Hibbeler, "Structural Analysis", Ch. 5 (Cables)
///   - Buchholdt, "Introduction to Cable Roof Structures", 1999
///   - EN 1993-1-11:2006, Design of structures with tension components
///
/// Tests verify advanced cable mechanics benchmarks: horizontal thrust
/// from parabolic approximation, sag-ratio effects on tension, Ernst
/// equivalent modulus, taut cable vibration frequencies, the Irvine
/// parameter, thermal sag changes, multi-span cable behavior, and
/// pretension effects on axial forces.
///
/// Tests:
///   1. Catenary horizontal tension: H = wL^2/(8d)
///   2. Cable sag ratio: tension proportional to 1/sag
///   3. Ernst equivalent modulus: sag-softened stiffness
///   4. Cable vibration frequency: f_n = (n/2L)*sqrt(T/(rho*A))
///   5. Irvine parameter: lambda^2 classification
///   6. Thermal cable sag change
///   7. Multi-span cable: two spans with intermediate support
///   8. Cable pretension effect: axial forces match expected values

use std::f64::consts::PI;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use dedaliano_engine::element;
use crate::common::*;

const E_CABLE: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally -> kN/m^2)
const A_CABLE: f64 = 0.002;     // m^2, cable cross-section area

// ================================================================
// 1. Catenary Horizontal Tension — H = wL^2/(8d)
// ================================================================
//
// For a parabolic cable under uniformly distributed load w per unit
// horizontal length, the horizontal thrust is:
//   H = wL^2 / (8d)
//
// We model a V-shaped cable (two truss elements) with supports at
// height d above the midspan node. A load P at midspan produces
// horizontal reactions: H = P*L/(4*d) = P/(2*tan(alpha)).
//
// Verify that the solver horizontal reaction matches the analytical
// formula from cable statics.
//
// Reference: Irvine, "Cable Structures", Ch. 2

#[test]
fn validation_cable_ext2_1_catenary_horizontal_tension() {
    let l: f64 = 80.0;        // m, span
    let d: f64 = 8.0;         // m, sag (supports elevated above midspan)
    let w: f64 = 3.0;         // kN/m, distributed load intensity

    // Analytical: H = wL^2/(8d) for uniformly distributed load
    let h_analytical = w * l * l / (8.0 * d);
    // H = 3 * 6400 / 64 = 300 kN
    assert_close(h_analytical, 300.0, 0.001, "H_analytical = wL^2/(8d) = 300 kN");

    // Verify cable_thrust utility function matches
    let h_from_fn = element::cable_thrust(w, l, d);
    assert_close(h_from_fn, h_analytical, 0.001, "cable_thrust matches formula");

    // FEM model: V-shaped cable with point load at midspan
    // Equivalent concentrated load = w * L (total UDL load) applied at midspan
    // For a point load at midspan: H_pt = P*L/(4d)
    let p = 40.0; // kN, concentrated load
    let h_pt_analytical = p * l / (4.0 * d);
    // H_pt = 40 * 80 / (4*8) = 100 kN

    let input = make_input(
        vec![
            (1, 0.0, d),          // left support (elevated)
            (2, l / 2.0, 0.0),    // midspan (lowest point)
            (3, l, d),            // right support (elevated)
        ],
        vec![(1, E_CABLE, 0.3)],
        vec![(1, A_CABLE, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check horizontal reactions at supports (should be equal and opposite)
    let rx_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx;
    let rx_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rx;

    // For V-truss: horizontal reaction magnitude = H_pt = P*L/(4d)
    // The truss members pull inward on the supports, so rx_left > 0 (pointing right)
    // and rx_right < 0 (pointing left), or vice versa by convention.
    let h_fem = (rx_left.abs() + rx_right.abs()) / 2.0;
    assert_close(h_fem, h_pt_analytical, 0.02, "FEM horizontal thrust matches analytical");

    // Verify vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Vertical equilibrium: sum(Ry) = P");

    // Verify symmetry of vertical reactions
    let ry_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(ry_left, ry_right, 0.02, "Symmetric vertical reactions");
    assert_close(ry_left, p / 2.0, 0.02, "V_A = P/2");

    // Member force: F = P / (2*sin(alpha))
    let half_l = l / 2.0;
    let diag = (half_l * half_l + d * d).sqrt();
    let sin_a = d / diag;
    let f_analytical = p / (2.0 * sin_a);
    let f_member = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start;
    assert_close(f_member.abs(), f_analytical, 0.02,
        "Member force F = P/(2*sin(alpha))");
}

// ================================================================
// 2. Cable Sag Ratio — Tension Proportional to 1/sag
// ================================================================
//
// For a cable under the same load, increasing sag decreases tension
// and vice versa. For parabolic cable:
//   H = wL^2/(8d)  =>  H is inversely proportional to d
//
// We model cables with d/L = 1/10 and d/L = 1/20, verifying that
// the tension in the shallower cable is approximately double.
//
// Reference: Irvine, "Cable Structures", Ch. 2

#[test]
fn validation_cable_ext2_2_cable_sag_ratio() {
    let l: f64 = 60.0;
    let p: f64 = 50.0;       // kN, point load at midspan

    let d1: f64 = l / 10.0;  // d/L = 1/10 = 6.0 m
    let d2: f64 = l / 20.0;  // d/L = 1/20 = 3.0 m

    // Analytical horizontal thrust: H = P*L/(4d)
    let h1_analytical = p * l / (4.0 * d1);  // = 50*60/24 = 125 kN
    let h2_analytical = p * l / (4.0 * d2);  // = 50*60/12 = 250 kN

    // Tension doubles when sag halves
    assert_close(h2_analytical / h1_analytical, 2.0, 0.001,
        "Analytical: halving sag doubles thrust");

    // Model both cables as V-trusses
    let mut deflections = Vec::new();
    let mut forces = Vec::new();

    for &d in &[d1, d2] {
        let input = make_input(
            vec![
                (1, 0.0, d),
                (2, l / 2.0, 0.0),
                (3, l, d),
            ],
            vec![(1, E_CABLE, 0.3)],
            vec![(1, A_CABLE, 0.0)],
            vec![
                (1, "truss", 1, 2, 1, 1, false, false),
                (2, "truss", 2, 3, 1, 1, false, false),
            ],
            vec![(1, 1, "pinned"), (2, 3, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -p, my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        let uy = results.displacements.iter()
            .find(|dd| dd.node_id == 2).unwrap().uz.abs();
        let f = results.element_forces.iter()
            .find(|e| e.element_id == 1).unwrap().n_start.abs();

        deflections.push(uy);
        forces.push(f);

        // Equilibrium check
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert_close(sum_ry, p, 0.01,
            &format!("Sag ratio d={:.1}: vertical equilibrium", d));
    }

    // Member force: F = P/(2*sin(alpha))
    // For d1: sin(a1) = d1 / sqrt((L/2)^2 + d1^2)
    // For d2: sin(a2) = d2 / sqrt((L/2)^2 + d2^2)
    let half_l = l / 2.0;
    let sin_a1 = d1 / (half_l * half_l + d1 * d1).sqrt();
    let sin_a2 = d2 / (half_l * half_l + d2 * d2).sqrt();
    let f1_exact = p / (2.0 * sin_a1);
    let f2_exact = p / (2.0 * sin_a2);

    assert_close(forces[0], f1_exact, 0.02, "Sag ratio d/L=1/10: member force");
    assert_close(forces[1], f2_exact, 0.02, "Sag ratio d/L=1/20: member force");

    // Shallower cable has higher member force
    assert!(forces[1] > forces[0],
        "Shallower cable (d/L=1/20) has higher force: {:.2} > {:.2}",
        forces[1], forces[0]);

    // Verify the force ratio matches analytical expectation
    let force_ratio = forces[1] / forces[0];
    let expected_ratio = f2_exact / f1_exact;
    assert_close(force_ratio, expected_ratio, 0.02,
        "Force ratio matches analytical ratio");
}

// ================================================================
// 3. Ernst Equivalent Modulus
// ================================================================
//
// E_eff = E / (1 + (wL)^2 * E * A / (12 * T^3))
//
// The Ernst formula accounts for sag-induced softening of cables.
// Higher tension leads to E_eff closer to E (less softening).
// We verify the formula using the engine's ernst_equivalent_modulus
// function and check consistency with manual computation.
//
// Reference: Ernst, "Der E-Modul von Seilen", 1965

#[test]
fn validation_cable_ext2_3_ernst_equivalent_modulus() {
    let e: f64 = 195_000.0;       // MPa, cable modulus
    let a: f64 = 0.003;           // m^2, cable area
    let w_cable: f64 = 0.25;      // kN/m, cable weight per unit length
    let l_h: f64 = 180.0;         // m, horizontal projection

    // Manual Ernst formula: E_eff = E / (1 + (wL)^2 * E * A / (12 * T^3))
    // Note: ernst_equivalent_modulus expects E in same units throughout
    let e_kpa = e * 1000.0;       // kN/m^2

    // Case 1: High tension (T = 2000 kN)
    let t_high: f64 = 2000.0;
    let wl_sq = (w_cable * l_h) * (w_cable * l_h);
    let denom_high = 1.0 + wl_sq * e_kpa * a / (12.0 * t_high.powi(3));
    let e_eff_high_manual = e_kpa / denom_high;

    let e_eff_high_fn = element::ernst_equivalent_modulus(e_kpa, a, w_cable, l_h, t_high);
    assert_close(e_eff_high_fn, e_eff_high_manual, 0.001,
        "Ernst high tension: function matches manual");

    // At high tension, E_eff should be close to E
    let ratio_high = e_eff_high_fn / e_kpa;
    assert!(ratio_high > 0.95,
        "Ernst high tension: E_eff/E = {:.4} > 0.95", ratio_high);

    // Case 2: Low tension (T = 300 kN)
    let t_low: f64 = 300.0;
    let denom_low = 1.0 + wl_sq * e_kpa * a / (12.0 * t_low.powi(3));
    let e_eff_low_manual = e_kpa / denom_low;

    let e_eff_low_fn = element::ernst_equivalent_modulus(e_kpa, a, w_cable, l_h, t_low);
    assert_close(e_eff_low_fn, e_eff_low_manual, 0.001,
        "Ernst low tension: function matches manual");

    // At low tension, E_eff should be significantly reduced
    let ratio_low = e_eff_low_fn / e_kpa;
    assert!(ratio_low < ratio_high,
        "Ernst: low tension ratio {:.4} < high tension ratio {:.4}",
        ratio_low, ratio_high);

    // E_eff always positive and <= E
    assert!(e_eff_high_fn > 0.0 && e_eff_high_fn <= e_kpa,
        "Ernst high: 0 < E_eff <= E");
    assert!(e_eff_low_fn > 0.0 && e_eff_low_fn <= e_kpa,
        "Ernst low: 0 < E_eff <= E");

    // Verify cubic sensitivity: doubling tension should dramatically
    // reduce the sag correction (denominator term goes as 1/T^3)
    let t_mid = 600.0;
    let e_eff_mid = element::ernst_equivalent_modulus(e_kpa, a, w_cable, l_h, t_mid);
    // t_mid = 2 * t_low, so the correction term scales as 1/8
    let correction_low = 1.0 / ratio_low - 1.0;
    let correction_mid = e_kpa / e_eff_mid - 1.0;
    // correction_mid should be ~1/8 of correction_low
    assert_close(correction_low / correction_mid, 8.0, 0.02,
        "Ernst: doubling T reduces correction by factor 8");
}

// ================================================================
// 4. Cable Vibration Frequency
// ================================================================
//
// The natural frequency of a taut cable (string) is:
//   f_n = (n / 2L) * sqrt(T / (rho * A))
//
// where T is tension, rho is density (t/m^3), A is area (m^2),
// and n is the mode number. Higher modes are integer multiples of f1.
//
// Reference: Irvine, "Cable Structures", Ch. 3-4

#[test]
fn validation_cable_ext2_4_cable_vibration_frequency() {
    let l: f64 = 80.0;        // m, cable length
    let t: f64 = 1000.0;      // kN, cable tension
    let rho: f64 = 7.85;      // t/m^3 (7850 kg/m^3), steel density
    let a: f64 = 0.0015;      // m^2, cable area

    // Mass per unit length
    let mu = rho * a;          // t/m = kN*s^2/m^2

    // Analytical fundamental frequency
    let f1_analytical = 1.0 / (2.0 * l) * (t / mu).sqrt();

    // Using engine function
    let f1_engine = element::cable_natural_frequency(1, l, t, rho, a);
    assert_close(f1_engine, f1_analytical, 0.001,
        "Vibration: f1 engine matches analytical");

    // Numerical sanity check
    // f1 = 1/(2*80) * sqrt(1000/0.01178) = 0.00625 * sqrt(84889) = 0.00625 * 291.4 = 1.821 Hz
    assert!(f1_engine > 1.0 && f1_engine < 3.0,
        "Vibration: f1 = {:.3} Hz (reasonable range)", f1_engine);

    // Higher modes: f_n = n * f_1 (harmonic series)
    let f2 = element::cable_natural_frequency(2, l, t, rho, a);
    let f3 = element::cable_natural_frequency(3, l, t, rho, a);
    let f5 = element::cable_natural_frequency(5, l, t, rho, a);

    assert_close(f2, 2.0 * f1_engine, 0.001, "Vibration: f2 = 2*f1");
    assert_close(f3, 3.0 * f1_engine, 0.001, "Vibration: f3 = 3*f1");
    assert_close(f5, 5.0 * f1_engine, 0.001, "Vibration: f5 = 5*f1");

    // Parametric checks:
    // 1. Frequency scales as sqrt(T)
    let f1_2t = element::cable_natural_frequency(1, l, 4.0 * t, rho, a);
    assert_close(f1_2t, 2.0 * f1_engine, 0.001,
        "Vibration: 4T -> 2*f1 (sqrt relationship)");

    // 2. Frequency inversely proportional to L
    let f1_half_l = element::cable_natural_frequency(1, l / 2.0, t, rho, a);
    assert_close(f1_half_l, 2.0 * f1_engine, 0.001,
        "Vibration: L/2 -> 2*f1 (inverse relationship)");

    // 3. Frequency inversely proportional to sqrt(rho*A)
    let f1_4rho = element::cable_natural_frequency(1, l, t, 4.0 * rho, a);
    assert_close(f1_4rho, 0.5 * f1_engine, 0.001,
        "Vibration: 4*rho -> f1/2 (inverse sqrt relationship)");
}

// ================================================================
// 5. Irvine Parameter
// ================================================================
//
// The Irvine parameter lambda^2 distinguishes cable from string behavior:
//   lambda^2 = (wL/H)^2 * (L_e/L) * (EA*L / (H*L_e))
//
// Simplified for flat cable: the ratio determines which mode governs.
//   lambda^2 < 4*pi^2 (~39.48): antisymmetric mode (string-like)
//   lambda^2 > 4*pi^2: symmetric mode (cable-specific crossover)
//
// We test with a taut cable (high T, low lambda^2) and a slack cable
// (low T, high lambda^2) to verify the classification.
//
// Reference: Irvine, "Cable Structures", Ch. 4

#[test]
fn validation_cable_ext2_5_irvine_parameter() {
    let l: f64 = 100.0;
    let e: f64 = E_CABLE * 1000.0; // kN/m^2
    let a: f64 = A_CABLE;
    let rho: f64 = 7.85;           // t/m^3
    let w_cable = element::cable_self_weight(rho, a);
    // w = 7.85 * 0.002 * 9.80665 ≈ 0.154 kN/m

    let crossover = 4.0 * PI * PI; // ~39.478

    // Case 1: Taut cable — high tension, small sag
    let t_taut = 5000.0; // kN (very high tension)
    let lambda_sq_taut = element::irvine_parameter(w_cable, l, t_taut, e, a);

    assert!(lambda_sq_taut > 0.0,
        "Irvine: lambda^2 positive for taut cable: {:.4}", lambda_sq_taut);
    assert!(lambda_sq_taut < crossover,
        "Irvine: taut cable lambda^2 = {:.4} < 4*pi^2 = {:.4} (string regime)",
        lambda_sq_taut, crossover);

    // Case 2: Slacker cable — lower tension, more sag
    let t_slack = 50.0; // kN (low tension)
    let lambda_sq_slack = element::irvine_parameter(w_cable, l, t_slack, e, a);

    assert!(lambda_sq_slack > 0.0,
        "Irvine: lambda^2 positive for slack cable: {:.4}", lambda_sq_slack);
    assert!(lambda_sq_slack > lambda_sq_taut,
        "Irvine: slack lambda^2 ({:.4}) > taut lambda^2 ({:.4})",
        lambda_sq_slack, lambda_sq_taut);

    // For sufficiently low tension, lambda^2 should exceed crossover
    // (cable regime rather than string regime)
    assert!(lambda_sq_slack > crossover,
        "Irvine: slack cable lambda^2 = {:.4} > 4*pi^2 = {:.4} (cable regime)",
        lambda_sq_slack, crossover);

    // Verify self-weight formula
    let w_expected = rho * a * 9.80665;
    assert_close(w_cable, w_expected, 0.001, "Irvine: self-weight = rho*A*g");

    // Verify: increasing tension decreases lambda^2
    let t_mid = 500.0;
    let lambda_sq_mid = element::irvine_parameter(w_cable, l, t_mid, e, a);
    assert!(lambda_sq_mid > lambda_sq_taut && lambda_sq_mid < lambda_sq_slack,
        "Irvine: lambda^2 monotonically decreases with tension");
}

// ================================================================
// 6. Thermal Cable Sag Change
// ================================================================
//
// When a cable experiences temperature change delta_T, it expands:
//   delta_L = alpha * delta_T * L_cable
//
// For a parabolic cable with sag d, the sag change (linearized) is:
//   delta_d / d ≈ (3/16) * (L/d)^2 * alpha * delta_T
//
// The horizontal thrust changes:
//   H_new = wL^2 / (8*(d + delta_d))
//
// A restrained cable develops thermal force:
//   delta_P = E * A * alpha * delta_T
//
// Reference: Gimsing & Georgakis, Ch. 5; Irvine Ch. 2

#[test]
fn validation_cable_ext2_6_thermal_cable_sag_change() {
    let l: f64 = 150.0;            // m, span
    let d: f64 = 12.0;             // m, midspan sag (d/L = 0.08)
    let w: f64 = 4.0;              // kN/m, cable weight
    let alpha: f64 = 12e-6;        // 1/degC, thermal expansion coefficient
    let delta_t: f64 = 40.0;       // degC, temperature rise
    let e: f64 = 200_000.0;        // MPa
    let a_mm2: f64 = 2500.0;       // mm^2

    // Original horizontal thrust: H = wL^2/(8d)
    let h_orig = element::cable_thrust(w, l, d);
    // H = 4 * 150^2 / (8 * 12) = 4 * 22500 / 96 = 937.5 kN
    assert_close(h_orig, 937.5, 0.001, "Thermal: original H = 937.5 kN");

    // Free cable expansion
    let l_cable = element::cable_length_parabolic(l, d);
    let delta_l = alpha * delta_t * l_cable;
    assert!(delta_l > 0.0, "Thermal: cable expands with heat");

    // Sag change (linearized approximation for inextensible cable)
    let delta_d_ratio = (3.0 / 16.0) * (l / d).powi(2) * alpha * delta_t;
    let delta_d = delta_d_ratio * d;
    assert!(delta_d > 0.0, "Thermal: sag increases with temperature rise");
    assert!(delta_d < d, "Thermal: sag change is small relative to d");

    // New thrust after temperature increase (more sag => less thrust)
    let h_new = element::cable_thrust(w, l, d + delta_d);
    assert!(h_new < h_orig,
        "Thermal: thrust decreases with more sag: {:.2} < {:.2}", h_new, h_orig);

    // Thrust change should be moderate (< 10% for reasonable temp change)
    let h_change_pct = (h_orig - h_new) / h_orig * 100.0;
    assert!(h_change_pct > 0.0 && h_change_pct < 10.0,
        "Thermal: thrust change {:.2}% (moderate for 40C rise)", h_change_pct);

    // Restrained cable thermal force: delta_P = E * A * alpha * delta_T
    let e_eff = e * 1000.0;         // kN/m^2
    let a_m2 = a_mm2 / 1e6;         // m^2
    let delta_p = e_eff * a_m2 * alpha * delta_t;
    // = 200e6 * 2.5e-3 * 12e-6 * 40 = 200e6 * 2.5e-3 * 4.8e-4 = 240 kN
    assert_close(delta_p, 240.0, 0.001, "Thermal: restrained force = 240 kN");

    // Verify cable_sag and cable_thrust are inverse operations
    let sag_from_thrust = element::cable_sag(w, l, h_orig);
    assert_close(sag_from_thrust, d, 0.001, "Thermal: sag/thrust inverse");

    // Heated cable should be longer
    let l_cable_new = element::cable_length_parabolic(l, d + delta_d);
    assert!(l_cable_new > l_cable,
        "Thermal: heated cable length {:.4} > original {:.4}",
        l_cable_new, l_cable);
}

// ================================================================
// 7. Multi-Span Cable — Two Spans with Intermediate Support
// ================================================================
//
// A cable spans two bays with an intermediate pinned support.
// Each bay has a midspan load node (forming a V-truss per bay).
// The intermediate support carries load from both adjacent bays.
//
// For identical bays with equal loads:
//   - End reactions = P/2 (one bay contribution)
//   - Interior reaction = P (contributions from both sides)
//   - Total vertical reaction = 2P
//
// Reference: Irvine, "Cable Structures", Ch. 5

#[test]
fn validation_cable_ext2_7_multi_span_cable() {
    let span: f64 = 12.0;    // m, each bay span
    let d: f64 = 3.0;        // m, cable sag height
    let p: f64 = 20.0;       // kN, load at each midspan

    // Two-span cable: 3 support nodes + 2 midspan load nodes
    // Layout:
    //   Node 1 (0, d) -- Node 2 (span/2, 0) -- Node 3 (span, d)
    //   Node 3 (span, d) -- Node 4 (1.5*span, 0) -- Node 5 (2*span, d)
    let input = make_input(
        vec![
            (1, 0.0, d),                        // left support
            (2, span / 2.0, 0.0),                // midspan bay 1
            (3, span, d),                        // intermediate support
            (4, span + span / 2.0, 0.0),         // midspan bay 2
            (5, 2.0 * span, d),                  // right support
        ],
        vec![(1, E_CABLE, 0.3)],
        vec![(1, A_CABLE, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 5, 1, 1, false, false),
        ],
        vec![
            (1, 1, "pinned"),
            (2, 3, "pinned"),
            (3, 5, "pinned"),
        ],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -p, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 4, fx: 0.0, fz: -p, my: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical equilibrium: sum(Ry) = 2P
    let total_load = 2.0 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Multi-span: total vertical equilibrium");

    // Symmetry: end supports carry equal reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_right = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rz;
    assert_close(r_left, r_right, 0.02, "Multi-span: end supports symmetric");

    // Interior support carries more than each end support
    let r_interior = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert!(r_interior > r_left,
        "Multi-span: interior support ({:.2}) > end support ({:.2})",
        r_interior, r_left);

    // By symmetry and equilibrium for identical V-trusses:
    // Each bay acts as a symmetric V-truss, and the interior support
    // receives P/2 from each of the two adjacent bays = P total
    // End supports each receive P/2 from one bay
    assert_close(r_left, p / 2.0, 0.02, "Multi-span: end reaction = P/2");
    assert_close(r_interior, p, 0.02, "Multi-span: interior reaction = P");

    // Both midspan nodes deflect downward
    let d2 = results.displacements.iter().find(|dd| dd.node_id == 2).unwrap();
    let d4 = results.displacements.iter().find(|dd| dd.node_id == 4).unwrap();
    assert!(d2.uz < 0.0, "Multi-span: midspan node 2 deflects down");
    assert!(d4.uz < 0.0, "Multi-span: midspan node 4 deflects down");

    // Symmetric deflections
    assert_close(d2.uz.abs(), d4.uz.abs(), 0.02,
        "Multi-span: symmetric midspan deflections");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01, "Multi-span: horizontal equilibrium");
}

// ================================================================
// 8. Cable Pretension Effect
// ================================================================
//
// For a truss cable model, the axial force depends on geometry
// and applied load (not on area for linear analysis). Under the same
// geometry and load, F = P/(2*sin(alpha)) regardless of EA.
//
// However, a pretensioned cable (higher EA) deflects less, and when
// geometry is fixed, the force is identical. The pretension effect
// manifests through reduced displacement (proportional to 1/EA).
//
// We verify:
//   1. Axial force is geometry-dependent, independent of EA
//   2. Deflection is inversely proportional to EA
//   3. Higher stiffness models the effect of pretension reducing sag
//
// Reference: Gimsing & Georgakis, Ch. 3

#[test]
fn validation_cable_ext2_8_cable_pretension_effect() {
    let l: f64 = 20.0;
    let d: f64 = 4.0;        // m, cable sag (support elevation)
    let p: f64 = 35.0;       // kN, applied load

    // Analytical: F = P / (2 * sin(alpha)) for V-truss
    let half_l = l / 2.0;
    let diag = (half_l * half_l + d * d).sqrt();
    let sin_a = d / diag;
    let cos_a = half_l / diag;
    let f_exact = p / (2.0 * sin_a);
    let h_exact = f_exact * cos_a; // horizontal component

    // Test with three different areas (simulating different pretension levels)
    let areas = [A_CABLE, 2.0 * A_CABLE, 5.0 * A_CABLE];
    let mut deflections = Vec::new();
    let mut axial_forces = Vec::new();

    for &a in &areas {
        let input = make_input(
            vec![
                (1, 0.0, d),
                (2, half_l, 0.0),
                (3, l, d),
            ],
            vec![(1, E_CABLE, 0.3)],
            vec![(1, a, 0.0)],
            vec![
                (1, "truss", 1, 2, 1, 1, false, false),
                (2, "truss", 2, 3, 1, 1, false, false),
            ],
            vec![(1, 1, "pinned"), (2, 3, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -p, my: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();

        let uy = results.displacements.iter()
            .find(|dd| dd.node_id == 2).unwrap().uz.abs();
        let f1 = results.element_forces.iter()
            .find(|e| e.element_id == 1).unwrap().n_start.abs();

        deflections.push(uy);
        axial_forces.push(f1);

        // Equilibrium always holds
        let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
        assert_close(sum_ry, p, 0.01,
            &format!("Pretension A={:.4}: vertical equilibrium", a));
    }

    // 1. Axial force is the same for all areas (geometry-dependent only)
    for (i, &f) in axial_forces.iter().enumerate() {
        assert_close(f, f_exact, 0.02,
            &format!("Pretension: force at A*{} matches analytical", [1, 2, 5][i]));
    }

    // 2. Deflection inversely proportional to A (linear truss behavior)
    assert_close(deflections[0] / deflections[1], 2.0, 0.02,
        "Pretension: delta(A) / delta(2A) = 2");
    assert_close(deflections[0] / deflections[2], 5.0, 0.02,
        "Pretension: delta(A) / delta(5A) = 5");

    // 3. Higher stiffness -> smaller deflection
    assert!(deflections[0] > deflections[1],
        "Pretension: 2A deflects less than A");
    assert!(deflections[1] > deflections[2],
        "Pretension: 5A deflects less than 2A");

    // 4. Verify horizontal thrust matches expected value
    // H = F * cos(alpha)
    let h_computed = axial_forces[0] * cos_a;
    assert_close(h_computed, h_exact, 0.02,
        "Pretension: horizontal thrust matches analytical");

    // 5. Verify Ernst modulus increases with pretension (higher T -> less sag softening)
    let e_kpa = E_CABLE * 1000.0;
    let w_cable = 0.3; // kN/m, cable weight
    let e_eq_low_t = element::ernst_equivalent_modulus(e_kpa, A_CABLE, w_cable, l, 100.0);
    let e_eq_high_t = element::ernst_equivalent_modulus(e_kpa, A_CABLE, w_cable, l, 5000.0);
    assert!(e_eq_high_t > e_eq_low_t,
        "Pretension: higher T -> higher Ernst E_eq");
    assert!(e_eq_high_t / e_kpa > 0.99,
        "Pretension: at high T, E_eq ~ E");
}
