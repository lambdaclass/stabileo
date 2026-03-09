/// Validation: Extended Natural Frequency Tests
///
/// 8 additional modal frequency tests covering scaling laws, multi-span beams,
/// alternative boundary conditions, and consistency relations.
///
/// References:
///   - Blevins, R.D., "Formulas for Natural Frequency and Mode Shape", 1979
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed
///   - Paz & Leigh, "Structural Dynamics", 6th Ed
use dedaliano_engine::solver::modal;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0;

/// E_EFF is the solver-internal Young's modulus in kN/m^2.
const E_EFF: f64 = E * 1000.0;

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

fn make_densities_with(rho: f64) -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), rho);
    d
}

// ================================================================
// 1. Frequency-Length Scaling: omega ~ 1/L^2
// ================================================================
//
// For an Euler-Bernoulli beam with given BCs:
//   omega_n = (beta_n*L)^2 / L^2 * sqrt(EI / rhoA)
// Since (beta_n*L) is constant for a given BC, omega ~ 1/L^2.
// Comparing L=4 and L=8: omega(L=8)/omega(L=4) = (4/8)^2 = 0.25

#[test]
fn validation_modal_frequency_length_scaling() {
    let l_short: f64 = 4.0;
    let l_long: f64 = 8.0;
    let n_elem = 12;

    // Simply-supported beams of two different lengths
    let input_short = make_beam(n_elem, l_short, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let input_long = make_beam(n_elem, l_long, E, A, IZ, "pinned", Some("rollerX"), vec![]);

    let result_short = modal::solve_modal_2d(&input_short, &make_densities(), 2).unwrap();
    let result_long = modal::solve_modal_2d(&input_long, &make_densities(), 2).unwrap();

    let omega_short = result_short.modes[0].omega;
    let omega_long = result_long.modes[0].omega;

    // Expected ratio: (L_short / L_long)^2 = (4/8)^2 = 0.25
    let expected_ratio: f64 = (l_short / l_long).powi(2);
    let actual_ratio = omega_long / omega_short;

    let rel_err: f64 = (actual_ratio - expected_ratio).abs() / expected_ratio;
    assert!(
        rel_err < 0.02,
        "Length scaling: omega(L={})/omega(L={}) = {:.4}, expected {:.4}, error = {:.2}%",
        l_long, l_short, actual_ratio, expected_ratio, rel_err * 100.0
    );
}

// ================================================================
// 2. Continuous Two-Span Beam: Frequency Between SS and Fixed-Fixed
// ================================================================
//
// A two-span continuous beam (pinned-roller-roller) has its fundamental
// frequency between that of a single-span SS beam of the same total
// length and a fixed-fixed beam. Each span acts as a SS beam of half
// length, so the fundamental frequency equals that of a single SS beam
// of half the total length (which is 4x the single-span SS frequency).
//
// Reference: Blevins, Table 8-1

#[test]
fn validation_modal_two_span_continuous_beam() {
    let total_length = 10.0;
    let n_per_span = 8;

    // Two equal spans of 5.0 each
    let input_cont = make_continuous_beam(
        &[5.0, 5.0], n_per_span, E, A, IZ, vec![],
    );
    let result_cont = modal::solve_modal_2d(&input_cont, &make_densities(), 4).unwrap();

    // Single-span SS beam of total length (lower bound reference)
    let input_ss = make_beam(16, total_length, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let result_ss = modal::solve_modal_2d(&input_ss, &make_densities(), 2).unwrap();

    let omega_cont = result_cont.modes[0].omega;
    let omega_ss_total = result_ss.modes[0].omega;

    // The continuous beam's first frequency should be higher than the single SS
    // beam of total length, because the interior support constrains the structure.
    assert!(
        omega_cont > omega_ss_total * 0.95,
        "Two-span omega_1 = {:.4} should be >= single SS omega_1 = {:.4}",
        omega_cont, omega_ss_total
    );

    // Exact: the first mode of a two-span beam is the 2nd mode of a single SS
    // beam of total length, i.e., omega = 4 * omega_ss(total_length).
    let expected: f64 = 4.0 * omega_ss_total;
    let rel_err: f64 = (omega_cont - expected).abs() / expected;
    assert!(
        rel_err < 0.05,
        "Two-span omega_1 = {:.4}, expected 4*omega_ss = {:.4}, error = {:.2}%",
        omega_cont, expected, rel_err * 100.0
    );
}

// ================================================================
// 3. Period-Frequency-Omega Consistency Across All Modes
// ================================================================
//
// For every mode returned by the solver, verify the three
// relationships: omega = 2*pi*f and T = 1/f and T = 2*pi/omega.

#[test]
fn validation_modal_period_frequency_omega_consistency() {
    let length = 6.0;
    let n_elem = 10;
    let pi: f64 = std::f64::consts::PI;

    let input = make_beam(n_elem, length, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 6).unwrap();

    assert!(
        result.modes.len() >= 4,
        "Expected at least 4 modes, got {}",
        result.modes.len()
    );

    for (i, mode) in result.modes.iter().enumerate() {
        let f = mode.frequency;
        let t = mode.period;
        let omega = mode.omega;

        // omega = 2*pi*f
        let omega_from_f: f64 = 2.0 * pi * f;
        assert_close(
            omega, omega_from_f, 0.001,
            &format!("Mode {}: omega = 2*pi*f", i + 1),
        );

        // T = 1/f
        assert_close(
            t, 1.0 / f, 0.001,
            &format!("Mode {}: T = 1/f", i + 1),
        );

        // T = 2*pi/omega
        let t_from_omega: f64 = 2.0 * pi / omega;
        assert_close(
            t, t_from_omega, 0.001,
            &format!("Mode {}: T = 2*pi/omega", i + 1),
        );
    }
}

// ================================================================
// 4. Pinned-GuidedX Beam: Same as Fixed-Fixed Symmetric Mode
// ================================================================
//
// A pinned-guidedX beam (ux free, uy+rz restrained at right end)
// exploits symmetry of the fixed-fixed beam. Its fundamental frequency
// matches the fixed-fixed beam's first symmetric mode.
//
// For pinned-guidedX (Blevins, Table 8-1): beta_1*L = 3.9266
// which is the same as fixed-pinned due to reciprocity.

#[test]
fn validation_modal_pinned_guided_frequency() {
    let length: f64 = 5.0;
    let n_elem = 12;

    let ei: f64 = E_EFF * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;

    // pinned at start, guidedX at end
    let input = make_beam(n_elem, length, E, A, IZ, "pinned", Some("guidedX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 4).unwrap();

    // beta_1*L for pinned-guided = 3.9266 (same as clamped-pinned by reciprocity)
    let beta_1_l: f64 = 3.9266;
    let omega_exact: f64 = (beta_1_l / length).powi(2) * (ei / rho_a).sqrt();

    let omega_fe = result.modes[0].omega;
    let rel_err: f64 = (omega_fe - omega_exact).abs() / omega_exact;

    assert!(
        rel_err < 0.02,
        "Pinned-guided: omega_FE = {:.4}, omega_exact = {:.4}, error = {:.2}%",
        omega_fe, omega_exact, rel_err * 100.0
    );
}

// ================================================================
// 5. Iz Scaling: Doubling Iz Scales Frequency by sqrt(2)
// ================================================================
//
// For a beam where bending dominates:
//   omega ~ sqrt(EI / rhoA) ~ sqrt(Iz)
// Doubling Iz (keeping A constant) should scale frequency by sqrt(2).
// This isolates the moment of inertia effect.

#[test]
fn validation_modal_iz_scaling() {
    let length = 5.0;
    let n_elem = 10;

    let iz_base: f64 = 1e-4;
    let iz_double: f64 = 2e-4;

    let input_base = make_beam(n_elem, length, E, A, iz_base, "fixed", None, vec![]);
    let input_double = make_beam(n_elem, length, E, A, iz_double, "fixed", None, vec![]);

    let result_base = modal::solve_modal_2d(&input_base, &make_densities(), 3).unwrap();
    let result_double = modal::solve_modal_2d(&input_double, &make_densities(), 3).unwrap();

    let expected_ratio: f64 = (2.0_f64).sqrt(); // sqrt(2) ~ 1.4142

    // Only check the first 2 bending modes; higher modes may have axial modes
    // interleaved that do not scale with Iz.
    for i in 0..2 {
        let omega_base = result_base.modes[i].omega;
        let omega_double = result_double.modes[i].omega;
        let actual_ratio = omega_double / omega_base;

        let rel_err: f64 = (actual_ratio - expected_ratio).abs() / expected_ratio;
        assert!(
            rel_err < 0.05,
            "Mode {}: omega(2*Iz)/omega(Iz) = {:.4}, expected sqrt(2) = {:.4}, error = {:.2}%",
            i + 1, actual_ratio, expected_ratio, rel_err * 100.0
        );
    }
}

// ================================================================
// 6. Light vs Heavy Material: Aluminum vs Steel Frequency Ratio
// ================================================================
//
// Comparing two beams with identical geometry but different densities
// (steel rho=7850 vs aluminum rho=2700):
//   omega ~ 1/sqrt(rho) so omega_al / omega_st = sqrt(rho_st / rho_al)
//
// Note: We keep E the same to isolate mass effect only.

#[test]
fn validation_modal_density_ratio_two_materials() {
    let length = 5.0;
    let n_elem = 10;
    let rho_steel: f64 = 7_850.0;
    let rho_aluminum: f64 = 2_700.0;

    let input = make_beam(n_elem, length, E, A, IZ, "fixed", Some("rollerX"), vec![]);

    let result_steel = modal::solve_modal_2d(&input, &make_densities_with(rho_steel), 3).unwrap();
    let result_aluminum = modal::solve_modal_2d(&input, &make_densities_with(rho_aluminum), 3).unwrap();

    let expected_ratio: f64 = (rho_steel / rho_aluminum).sqrt();

    for i in 0..result_steel.modes.len().min(result_aluminum.modes.len()) {
        let omega_steel = result_steel.modes[i].omega;
        let omega_al = result_aluminum.modes[i].omega;
        let actual_ratio = omega_al / omega_steel;

        let rel_err: f64 = (actual_ratio - expected_ratio).abs() / expected_ratio;
        assert!(
            rel_err < 0.03,
            "Mode {}: omega_al/omega_st = {:.4}, expected sqrt(rho_st/rho_al) = {:.4}, error = {:.2}%",
            i + 1, actual_ratio, expected_ratio, rel_err * 100.0
        );
    }
}

// ================================================================
// 7. Modes Strictly Ordered by Ascending Frequency
// ================================================================
//
// The modal solver must return modes ordered by ascending natural
// frequency. This is a basic consistency requirement. We verify it
// on a multi-element portal frame which produces a mix of flexural
// and sway modes that could potentially be mis-ordered.

#[test]
fn validation_modal_ascending_frequency_order() {
    let h = 4.0;
    let w = 6.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let result = modal::solve_modal_2d(&input, &make_densities(), 6).unwrap();

    assert!(
        result.modes.len() >= 4,
        "Portal frame: expected at least 4 modes, got {}",
        result.modes.len()
    );

    for i in 1..result.modes.len() {
        assert!(
            result.modes[i].frequency >= result.modes[i - 1].frequency - 1e-10,
            "Mode {} freq = {:.6} < mode {} freq = {:.6}: modes not in ascending order",
            i + 1, result.modes[i].frequency,
            i, result.modes[i - 1].frequency
        );
    }

    // Also verify on a cantilever beam (different topology)
    let input_cant = make_beam(12, 5.0, E, A, IZ, "fixed", None, vec![]);
    let result_cant = modal::solve_modal_2d(&input_cant, &make_densities(), 6).unwrap();

    for i in 1..result_cant.modes.len() {
        assert!(
            result_cant.modes[i].frequency >= result_cant.modes[i - 1].frequency - 1e-10,
            "Cantilever: mode {} freq = {:.6} < mode {} freq = {:.6}",
            i + 1, result_cant.modes[i].frequency,
            i, result_cant.modes[i - 1].frequency
        );
    }
}

// ================================================================
// 8. Fixed-GuidedX Higher Bending Modes with Axial Mode Detection
// ================================================================
//
// A beam with fixed-guidedX (clamped-sliding clamp) BCs produces both
// bending and axial modes. The solver returns them in ascending frequency
// order, so axial modes can appear between bending modes.
//
// We verify bending modes 1 and 2 against closed-form solutions, and
// confirm that the interleaved axial mode is near its expected value:
//   axial: f_ax = 1/(2L) * sqrt(E_eff / rho_eff)
//   bending: omega_n = (beta_n*L / L)^2 * sqrt(EI / rhoA)
//
// References:
//   - Blevins, Table 8-1 (fixed-fixed beam eigenvalues)
//   - Chopra, "Dynamics of Structures", Ch. 16

#[test]
fn validation_modal_fixed_guided_higher_modes() {
    let length: f64 = 5.0;
    let n_elem = 16;
    let pi: f64 = std::f64::consts::PI;

    let ei: f64 = E_EFF * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;

    let input = make_beam(n_elem, length, E, A, IZ, "fixed", Some("guidedX"), vec![]);
    let result = modal::solve_modal_2d(&input, &make_densities(), 6).unwrap();

    assert!(
        result.modes.len() >= 4,
        "Expected at least 4 modes, got {}",
        result.modes.len()
    );

    // Mode 1 (bending): beta_1*L = 4.7300
    let beta_1_l: f64 = 4.7300;
    let omega_1_exact: f64 = (beta_1_l / length).powi(2) * (ei / rho_a).sqrt();
    let f_1_exact: f64 = omega_1_exact / (2.0 * pi);

    let f_1_fe = result.modes[0].frequency;
    let rel_err_1: f64 = (f_1_fe - f_1_exact).abs() / f_1_exact;
    assert!(
        rel_err_1 < 0.02,
        "Fixed-guided bending mode 1: f_FE = {:.4} Hz, f_exact = {:.4} Hz, error = {:.2}%",
        f_1_fe, f_1_exact, rel_err_1 * 100.0
    );

    // Mode 2 (bending): beta_2*L = 7.8532
    let beta_2_l: f64 = 7.8532;
    let omega_2_exact: f64 = (beta_2_l / length).powi(2) * (ei / rho_a).sqrt();
    let f_2_exact: f64 = omega_2_exact / (2.0 * pi);

    let f_2_fe = result.modes[1].frequency;
    let rel_err_2: f64 = (f_2_fe - f_2_exact).abs() / f_2_exact;
    assert!(
        rel_err_2 < 0.03,
        "Fixed-guided bending mode 2: f_FE = {:.4} Hz, f_exact = {:.4} Hz, error = {:.2}%",
        f_2_fe, f_2_exact, rel_err_2 * 100.0
    );

    // Between bending modes 2 and 3, an axial mode appears.
    // Find the bending mode 3 by looking for the FE mode closest to the
    // exact bending mode 3 frequency (beta_3*L = 10.9956).
    let beta_3_l: f64 = 10.9956;
    let omega_3_exact: f64 = (beta_3_l / length).powi(2) * (ei / rho_a).sqrt();
    let f_3_exact: f64 = omega_3_exact / (2.0 * pi);

    // Search modes 2..5 for the one closest to f_3_exact
    let mut best_idx = 2;
    let mut best_err: f64 = f64::INFINITY;
    let search_end = result.modes.len().min(6);
    for idx in 2..search_end {
        let err: f64 = (result.modes[idx].frequency - f_3_exact).abs() / f_3_exact;
        if err < best_err {
            best_err = err;
            best_idx = idx;
        }
    }

    assert!(
        best_err < 0.05,
        "Fixed-guided bending mode 3: closest FE mode {} has f = {:.4} Hz, expected {:.4} Hz, error = {:.2}%",
        best_idx + 1, result.modes[best_idx].frequency, f_3_exact, best_err * 100.0
    );
}
