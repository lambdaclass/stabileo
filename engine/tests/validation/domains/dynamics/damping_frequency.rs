/// Validation: Natural Frequencies and Modal Properties
///
/// References:
///   - Chopra, "Dynamics of Structures", Ch. 2-3, 11-12
///   - Clough & Penzien, "Dynamics of Structures", Ch. 2-4
///   - Paz & Leigh, "Structural Dynamics", Ch. 2-3
///
/// Modal analysis computes natural frequencies and mode shapes.
/// For simple structures, analytical solutions exist.
///
/// Tests verify:
///   1. Cantilever beam: f₁ = (1.875)²/(2πL²)×√(EI/ρA)
///   2. SS beam: f_n = (nπ)²/(2πL²)×√(EI/ρA)
///   3. Frequency ratio: f₂/f₁ for SS beam = 4
///   4. Mass effect: doubling density halves ω²
///   5. Stiffness effect: doubling IZ doubles ω²
///   6. Portal frame: sway frequency ordering
///   7. Cantilever convergence: more elements → better ω₁
///   8. Fixed-fixed beam: frequency between SS and clamped
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

fn densities_with(rho: f64) -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), rho);
    d
}

// ================================================================
// 1. Cantilever Beam: First Natural Frequency
// ================================================================
//
// ω₁ = (β₁L)² / L² × √(EI/(ρA))
// β₁L = 1.875104, EI = 200000×1000×1e-4 = 20000 kN·m²

#[test]
fn validation_freq_cantilever_first() {
    let l = 5.0;
    let n = 20;

    let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 3).unwrap();

    let omega1 = result.modes[0].omega;
    // Solver units: E in MPa, internally kN/m². EI = E*1000*IZ
    // Mass: ρA_solver = density * A / 1000 (kg/m → kN·s²/m² units)
    let ei = E * 1000.0 * IZ;
    let rho_a = DENSITY * A / 1000.0;
    let beta1 = 1.8751;
    let omega1_exact = (beta1 / l).powi(2) * (ei / rho_a).sqrt();

    let err = (omega1 - omega1_exact).abs() / omega1_exact;
    assert!(err < 0.05, "Cantilever ω₁: err={:.2}%, got {:.4}, expected {:.4}",
        err * 100.0, omega1, omega1_exact);
}

// ================================================================
// 2. SS Beam: Natural Frequencies
// ================================================================
//
// ω_n = (nπ/L)² × √(EI/(ρA))

#[test]
fn validation_freq_ss_beam() {
    let l = 8.0;
    let n = 32;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 3).unwrap();

    let pi = std::f64::consts::PI;
    let ei = E * 1000.0 * IZ;
    let rho_a = DENSITY * A / 1000.0;
    let omega1_exact = (pi / l).powi(2) * (ei / rho_a).sqrt();

    let omega1 = result.modes[0].omega;
    let err = (omega1 - omega1_exact).abs() / omega1_exact;
    assert!(err < 0.05, "SS beam ω₁: err={:.2}%, got {:.4}, expected {:.4}",
        err * 100.0, omega1, omega1_exact);
}

// ================================================================
// 3. Frequency Ratio: f₂/f₁ for SS Beam = 4
// ================================================================
//
// ω_n ∝ n² → ω₂/ω₁ = 4

#[test]
fn validation_freq_ratio_ss() {
    let l = 8.0;
    let n = 32;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let result = modal::solve_modal_2d(&input, &densities(), 3).unwrap();

    assert!(result.modes.len() >= 2, "At least 2 modes found");

    let ratio = result.modes[1].omega / result.modes[0].omega;
    assert!((ratio - 4.0).abs() / 4.0 < 0.10,
        "SS beam: ω₂/ω₁ ≈ 4: got {:.4}", ratio);
}

// ================================================================
// 4. Mass Effect: Doubling Density Halves ω²
// ================================================================
//
// ω² = k/m. Doubling ρ doubles m → ω → ω/√2

#[test]
fn validation_freq_mass_effect() {
    let l = 5.0;
    let n = 20;

    let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);

    let r1 = modal::solve_modal_2d(&input, &densities_with(DENSITY), 1).unwrap();
    let r2 = modal::solve_modal_2d(&input, &densities_with(2.0 * DENSITY), 1).unwrap();

    let omega1 = r1.modes[0].omega;
    let omega2 = r2.modes[0].omega;

    // ω₂/ω₁ = √(ρ1/ρ2) = 1/√2
    let ratio = omega2 / omega1;
    let expected = 1.0 / (2.0_f64).sqrt();
    assert!((ratio - expected).abs() / expected < 0.05,
        "Mass effect: ω ∝ 1/√ρ: got {:.4}, expected {:.4}", ratio, expected);
}

// ================================================================
// 5. Stiffness Effect: Doubling IZ Doubles ω²
// ================================================================
//
// ω² ∝ EI/m. Doubling IZ → ω → ω×√2

#[test]
fn validation_freq_stiffness_effect() {
    let l = 5.0;
    let n = 20;

    let input1 = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let input2 = make_beam(n, l, E, A, 2.0 * IZ, "fixed", None, vec![]);

    let r1 = modal::solve_modal_2d(&input1, &densities(), 1).unwrap();
    let r2 = modal::solve_modal_2d(&input2, &densities(), 1).unwrap();

    let ratio = r2.modes[0].omega / r1.modes[0].omega;
    let expected = (2.0_f64).sqrt();
    assert!((ratio - expected).abs() / expected < 0.05,
        "Stiffness effect: ω ∝ √(EI): got {:.4}, expected {:.4}", ratio, expected);
}

// ================================================================
// 6. Portal Frame: Sway Frequency Ordering
// ================================================================
//
// Portal frame should have multiple modes. First mode is
// typically the lateral sway mode.

#[test]
fn validation_freq_portal_ordering() {
    let h = 4.0;
    let w = 6.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let result = modal::solve_modal_2d(&input, &densities(), 4).unwrap();

    assert!(!result.modes.is_empty(), "Portal: found modes");

    // Frequencies should be ordered (ascending)
    for i in 1..result.modes.len() {
        assert!(result.modes[i].omega >= result.modes[i - 1].omega,
            "Modes ordered: ω[{}] = {:.4} >= ω[{}] = {:.4}",
            i, result.modes[i].omega, i - 1, result.modes[i - 1].omega);
    }

    // All frequencies positive
    for mode in &result.modes {
        assert!(mode.omega > 0.0, "ω > 0: {:.6e}", mode.omega);
    }
}

// ================================================================
// 7. Cantilever Convergence: More Elements → Better ω₁
// ================================================================
//
// As mesh refines, computed ω₁ converges to analytical value.

#[test]
fn validation_freq_cantilever_convergence() {
    let l = 5.0;
    let ei = E * 1000.0 * IZ;
    let rho_a = DENSITY * A / 1000.0;
    let beta1: f64 = 1.8751;
    let omega1_exact = (beta1 / l).powi(2) * (ei / rho_a).sqrt();

    let mut errors = Vec::new();
    for &n in &[4, 8, 16, 32] {
        let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
        let result = modal::solve_modal_2d(&input, &densities(), 1).unwrap();
        let omega1 = result.modes[0].omega;
        let err = ((omega1 - omega1_exact) / omega1_exact).abs();
        errors.push(err);
    }

    // All meshes should be within 5% of analytical
    for (i, err) in errors.iter().enumerate() {
        assert!(*err < 0.05,
            "n={}: error {:.2}% < 5%", [4, 8, 16, 32][i], err * 100.0);
    }

    // Coarsest mesh should have larger error than finest
    assert!(errors[0] > errors[2],
        "Coarse err > fine err: {:.4}% > {:.4}%",
        errors[0] * 100.0, errors[2] * 100.0);
}

// ================================================================
// 8. Fixed-Fixed: Frequency Higher Than SS
// ================================================================
//
// Fixed-fixed beam has higher first frequency than SS beam
// because the boundary conditions are stiffer.
// β₁L = 4.73004 (clamped-clamped) vs π (SS)

#[test]
fn validation_freq_fixed_vs_ss() {
    let l = 8.0;
    let n = 32;

    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), vec![]);

    let r_ss = modal::solve_modal_2d(&input_ss, &densities(), 1).unwrap();
    let r_ff = modal::solve_modal_2d(&input_ff, &densities(), 1).unwrap();

    // Fixed-fixed should have higher frequency
    assert!(r_ff.modes[0].omega > r_ss.modes[0].omega,
        "Fixed > SS: {:.4} > {:.4}",
        r_ff.modes[0].omega, r_ss.modes[0].omega);

    // Ratio should be approximately (4.73004/π)² ≈ 2.267
    let ratio = r_ff.modes[0].omega / r_ss.modes[0].omega;
    let expected_ratio = (4.73004_f64 / std::f64::consts::PI).powi(2);
    assert!((ratio - expected_ratio).abs() / expected_ratio < 0.10,
        "Ratio ≈ (4.73/π)²: got {:.4}, expected {:.4}", ratio, expected_ratio);
}
