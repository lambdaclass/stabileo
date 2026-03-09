/// Validation: Extended Natural Frequencies, Damping, and Modal Properties
///
/// References:
///   - Chopra, "Dynamics of Structures", Ch. 11-13 (Rayleigh damping, MDOF)
///   - Clough & Penzien, "Dynamics of Structures", Ch. 12-13
///   - Paz & Leigh, "Structural Dynamics", Ch. 11 (continuous beams)
///   - Blevins, "Formulas for Natural Frequency and Mode Shape"
///
/// Tests verify:
///   1. Rayleigh damping coefficients: a0, a1 from two target frequencies
///   2. Propped cantilever: β₁L = 3.9266 (between cantilever and fixed-fixed)
///   3. Continuous 2-span beam: first mode frequency relationship
///   4. Length scaling: ω ∝ 1/L² for Euler-Bernoulli beams
///   5. Cumulative mass participation: sum of mass ratios bounded [0,1]
///   6. Period-frequency consistency: T = 1/f for all modes
///   7. Frequency ordering across boundary conditions (free < SS < fixed)
///   8. Portal frame: sway mode mass participation dominance in X
use dedaliano_engine::solver::modal;
use std::collections::HashMap;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0; // kg/m³ (steel)

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ================================================================
// 1. Rayleigh Damping Coefficients
// ================================================================
//
// For 5% critical damping at modes 1 and N:
//   a0 = 2·ξ·ω₁·ωₙ / (ω₁ + ωₙ)
//   a1 = 2·ξ / (ω₁ + ωₙ)
// Damping ratio at any mode i:
//   ξᵢ = a0/(2·ωᵢ) + a1·ωᵢ/2
// At the two anchor frequencies, ξ should equal 0.05.

#[test]
fn validation_rayleigh_damping_coefficients() {
    let l = 8.0;
    let n = 32;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 4).unwrap();

    let rayleigh = result.rayleigh.as_ref().expect("Rayleigh damping computed");

    // a0 and a1 must be positive
    assert!(rayleigh.a0 > 0.0, "a0 > 0: got {:.6e}", rayleigh.a0);
    assert!(rayleigh.a1 > 0.0, "a1 > 0: got {:.6e}", rayleigh.a1);

    // Verify formula: a0 = 2·ξ·ω₁·ω₂/(ω₁+ω₂)
    let w1 = result.modes[0].omega;
    let w2 = result.modes.last().unwrap().omega;
    let xi: f64 = 0.05;
    let a0_expected = 2.0 * xi * w1 * w2 / (w1 + w2);
    let a1_expected = 2.0 * xi / (w1 + w2);

    let err_a0 = (rayleigh.a0 - a0_expected).abs() / a0_expected;
    let err_a1 = (rayleigh.a1 - a1_expected).abs() / a1_expected;
    assert!(err_a0 < 1e-10, "a0 matches formula: err={:.2e}", err_a0);
    assert!(err_a1 < 1e-10, "a1 matches formula: err={:.2e}", err_a1);

    // Damping ratio at anchor frequencies should be 0.05
    let xi1 = rayleigh.a0 / (2.0 * w1) + rayleigh.a1 * w1 / 2.0;
    let xi2 = rayleigh.a0 / (2.0 * w2) + rayleigh.a1 * w2 / 2.0;
    assert!((xi1 - 0.05).abs() < 1e-10, "ξ₁ = 5%: got {:.6}", xi1);
    assert!((xi2 - 0.05).abs() < 1e-10, "ξₙ = 5%: got {:.6}", xi2);
}

// ================================================================
// 2. Propped Cantilever: β₁L = 3.9266
// ================================================================
//
// Fixed-rollerX (propped cantilever) has β₁L = 3.9266.
// ω₁ = (β₁L / L)² × √(EI / ρA)

#[test]
fn validation_freq_propped_cantilever() {
    let l = 6.0;
    let n = 24;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 1).unwrap();

    let omega1 = result.modes[0].omega;
    let ei: f64 = E * 1000.0 * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;
    let beta1_l: f64 = 3.9266;
    let omega1_exact = (beta1_l / l).powi(2) * (ei / rho_a).sqrt();

    let err = (omega1 - omega1_exact).abs() / omega1_exact;
    assert!(err < 0.05, "Propped cantilever ω₁: err={:.2}%, got {:.4}, expected {:.4}",
        err * 100.0, omega1, omega1_exact);
}

// ================================================================
// 3. Continuous 2-Span Beam: Higher Than Single-Span SS
// ================================================================
//
// A 2-span continuous beam (each span L) has a higher first
// frequency than a single-span SS beam of length 2L, because
// the intermediate support stiffens the system.

#[test]
fn validation_freq_continuous_two_span() {
    let span = 5.0;
    let n_per_span = 16;

    // 2-span continuous beam, each span = 5m
    let input_cont = make_continuous_beam(
        &[span, span], n_per_span, E, A, IZ, vec![],
    );
    let r_cont = modal::solve_modal_2d(&input_cont, &densities(), 1).unwrap();

    // Single-span SS beam of length 2*span = 10m
    let input_ss = make_beam(
        2 * n_per_span, 2.0 * span, E, A, IZ,
        "pinned", Some("rollerX"), vec![],
    );
    let r_ss = modal::solve_modal_2d(&input_ss, &densities(), 1).unwrap();

    let omega_cont = r_cont.modes[0].omega;
    let omega_ss = r_ss.modes[0].omega;

    assert!(omega_cont > omega_ss,
        "Continuous 2-span stiffer than single SS: {:.4} > {:.4}",
        omega_cont, omega_ss);
}

// ================================================================
// 4. Length Scaling: ω ∝ 1/L² for Euler-Bernoulli Beams
// ================================================================
//
// For any given boundary condition, ω_n = (βL)²/(L²) × √(EI/ρA).
// If we halve L, ω should quadruple (factor of 4).

#[test]
fn validation_freq_length_scaling() {
    let l1 = 8.0;
    let l2 = 4.0; // half the length
    let n = 24;

    let input1 = make_beam(n, l1, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let input2 = make_beam(n, l2, E, A, IZ, "pinned", Some("rollerX"), vec![]);

    let r1 = modal::solve_modal_2d(&input1, &densities(), 1).unwrap();
    let r2 = modal::solve_modal_2d(&input2, &densities(), 1).unwrap();

    let ratio = r2.modes[0].omega / r1.modes[0].omega;
    let expected: f64 = (l1 / l2).powi(2); // (8/4)² = 4

    let err = (ratio - expected).abs() / expected;
    assert!(err < 0.05,
        "Length scaling ω ∝ 1/L²: ratio={:.4}, expected={:.4}, err={:.2}%",
        ratio, expected, err * 100.0);
}

// ================================================================
// 5. Cumulative Mass Participation Ratios Bounded [0, 1]
// ================================================================
//
// The sum of mass participation ratios across all modes should
// converge to 1.0 as more modes are included. For a subset of
// modes, each ratio ∈ [0,1] and sum ≤ 1.

#[test]
fn validation_mass_participation_bounds() {
    let l = 8.0;
    let n = 32;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 6).unwrap();

    // Each individual mass ratio must be non-negative
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.mass_ratio_x >= -1e-10,
            "Mode {} mass_ratio_x >= 0: got {:.6e}", i + 1, mode.mass_ratio_x);
        assert!(mode.mass_ratio_y >= -1e-10,
            "Mode {} mass_ratio_y >= 0: got {:.6e}", i + 1, mode.mass_ratio_y);
    }

    // Cumulative ratios must be in [0, 1]
    assert!(result.cumulative_mass_ratio_x >= -1e-10 && result.cumulative_mass_ratio_x <= 1.0 + 1e-10,
        "Cumulative MRx ∈ [0,1]: got {:.6}", result.cumulative_mass_ratio_x);
    assert!(result.cumulative_mass_ratio_y >= -1e-10 && result.cumulative_mass_ratio_y <= 1.0 + 1e-10,
        "Cumulative MRy ∈ [0,1]: got {:.6}", result.cumulative_mass_ratio_y);

    // Total mass must be positive
    assert!(result.total_mass > 0.0, "Total mass > 0: got {:.6}", result.total_mass);
}

// ================================================================
// 6. Period-Frequency Consistency: T = 1/f, ω = 2πf
// ================================================================
//
// For every mode, the solver reports frequency, period, and omega.
// These must be self-consistent: T = 1/f, ω = 2πf.

#[test]
fn validation_period_frequency_consistency() {
    let l = 6.0;
    let n = 24;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 4).unwrap();

    let pi = std::f64::consts::PI;
    for (i, mode) in result.modes.iter().enumerate() {
        // ω = 2πf
        let omega_from_f = 2.0 * pi * mode.frequency;
        let err_omega = (mode.omega - omega_from_f).abs() / mode.omega;
        assert!(err_omega < 1e-10,
            "Mode {}: ω = 2πf: got ω={:.6}, 2πf={:.6}", i + 1, mode.omega, omega_from_f);

        // T = 1/f
        let t_from_f = 1.0 / mode.frequency;
        let err_t = (mode.period - t_from_f).abs() / mode.period;
        assert!(err_t < 1e-10,
            "Mode {}: T = 1/f: got T={:.6}, 1/f={:.6}", i + 1, mode.period, t_from_f);

        // Positive values
        assert!(mode.frequency > 0.0, "Mode {}: f > 0", i + 1);
        assert!(mode.period > 0.0, "Mode {}: T > 0", i + 1);
        assert!(mode.omega > 0.0, "Mode {}: ω > 0", i + 1);
    }
}

// ================================================================
// 7. Frequency Ordering Across Boundary Conditions
// ================================================================
//
// For the same beam geometry:
//   ω(cantilever) < ω(SS) < ω(fixed-fixed)
// β₁L: cantilever=1.8751, SS=π, fixed-fixed=4.7300

#[test]
fn validation_freq_boundary_condition_ordering() {
    let l = 8.0;
    let n = 32;

    // Cantilever (fixed - free)
    let input_cant = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let r_cant = modal::solve_modal_2d(&input_cant, &densities(), 1).unwrap();

    // Simply supported (pinned - rollerX)
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let r_ss = modal::solve_modal_2d(&input_ss, &densities(), 1).unwrap();

    // Fixed-fixed
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);
    let r_ff = modal::solve_modal_2d(&input_ff, &densities(), 1).unwrap();

    let w_cant = r_cant.modes[0].omega;
    let w_ss = r_ss.modes[0].omega;
    let w_ff = r_ff.modes[0].omega;

    assert!(w_cant < w_ss,
        "Cantilever < SS: {:.4} < {:.4}", w_cant, w_ss);
    assert!(w_ss < w_ff,
        "SS < Fixed-Fixed: {:.4} < {:.4}", w_ss, w_ff);

    // Verify approximate ratios from βL values
    // SS/cantilever ≈ (π/1.8751)² ≈ 2.80
    let ratio_ss_cant = w_ss / w_cant;
    let expected_ratio_ss_cant: f64 = (std::f64::consts::PI / 1.8751).powi(2);
    let err_sc = (ratio_ss_cant - expected_ratio_ss_cant).abs() / expected_ratio_ss_cant;
    assert!(err_sc < 0.10,
        "SS/Cant ≈ (π/1.875)²: got {:.4}, expected {:.4}", ratio_ss_cant, expected_ratio_ss_cant);
}

// ================================================================
// 8. Portal Frame: Sway Mode X-Participation Dominance
// ================================================================
//
// A portal frame's first mode is typically lateral sway.
// The X-direction mass participation should dominate for mode 1,
// while the Y-direction participation should be small for the sway mode.

#[test]
fn validation_portal_sway_participation() {
    let h = 4.0;
    let w = 6.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let result = modal::solve_modal_2d(&input, &densities(), 4).unwrap();

    assert!(result.modes.len() >= 2, "Portal: at least 2 modes");

    // Find the mode with maximum X participation (sway mode)
    let sway_mode = result.modes.iter()
        .max_by(|a, b| a.mass_ratio_x.partial_cmp(&b.mass_ratio_x).unwrap())
        .unwrap();

    // Sway mode should have significant X participation
    assert!(sway_mode.mass_ratio_x > 0.3,
        "Sway mode mass_ratio_x > 0.3: got {:.4}", sway_mode.mass_ratio_x);

    // Rayleigh damping should be defined (>= 2 modes)
    assert!(result.rayleigh.is_some(), "Rayleigh damping defined for portal");
    let ray = result.rayleigh.as_ref().unwrap();

    // Damping ratios array has one entry per mode
    assert_eq!(ray.damping_ratios.len(), result.modes.len(),
        "Damping ratios count matches modes count");

    // All damping ratios should be positive
    for (i, &xi) in ray.damping_ratios.iter().enumerate() {
        assert!(xi > 0.0, "Mode {} damping ratio > 0: got {:.6e}", i + 1, xi);
    }
}
