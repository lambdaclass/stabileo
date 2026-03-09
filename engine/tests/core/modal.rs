/// Modal analysis tests with analytical beam frequency benchmarks.
use dedaliano_engine::solver::modal;
use std::collections::HashMap;
use crate::common::*;

// Material/section constants
const E: f64 = 200_000.0;     // MPa
const A: f64 = 0.01;          // m²
const IZ: f64 = 1e-4;         // m⁴
const L: f64 = 5.0;           // m
const DENSITY: f64 = 7_850.0; // kg/m³ (steel)
// EI = 200,000 × 1000 × 1e-4 = 20,000 kN·m²
const EI: f64 = 20_000.0;

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ─── Simply-Supported Beam Frequencies ──────────────────────

#[test]
fn modal_ss_beam_first_mode() {
    // ω₁ = (π/L)² × √(EI / ρA)
    // ω₁ = (π/5)² × √(20,000,000 / 78.5)  [EI in N·m², ρA in kg/m]
    // Wait — need consistent units.
    // EI = 20,000 kN·m² = 20,000,000 N·m²
    // ρA = 78.5 kg/m
    // ω₁ = (π/5)² × √(20,000,000 / 78.5)
    // = 0.3948 × 504.97 = 199.4 rad/s

    let n_elem = 8;
    let input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
    // Remove the distributed load (modal = no loads)
    let mut input = input;
    input.loads.clear();

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 6).unwrap();

    assert!(!result.modes.is_empty(), "should find modes");

    // EI in N·m² for formula: 20,000 * 1000 = 20,000,000 N·m²? No.
    // Wait: EI = E * 1000 * Iz = 200,000 * 1000 * 1e-4 = 20,000 kN·m²
    // For ω formula we need consistent units.
    // Using kN and tonnes: EI = 20,000 kN·m², ρA = 0.0785 tonnes/m
    // ω₁ = (π/L)² × √(EI / ρA) = (π/5)² × √(20,000 / 0.0785)
    // = 0.3948 × 504.97 = 199.4 rad/s
    let rho_a_solver = DENSITY * A / 1000.0; // 0.0785 tonnes/m
    let omega1_exact = (std::f64::consts::PI / L).powi(2) * (EI / rho_a_solver).sqrt();

    let omega1 = result.modes[0].omega;
    let error = (omega1 - omega1_exact).abs() / omega1_exact;

    assert!(
        error < 0.02,
        "SS beam ω₁={:.2}, expected={:.2}, error={:.2}%",
        omega1, omega1_exact, error * 100.0
    );
}

#[test]
fn modal_ss_beam_frequency_ratio() {
    // ω₂/ω₁ ≈ 4 for simply-supported beam (n² scaling)
    let n_elem = 8;
    let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
    input.loads.clear();

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    if result.modes.len() >= 2 {
        let ratio = result.modes[1].omega / result.modes[0].omega;
        assert!(
            ratio > 3.5 && ratio < 4.5,
            "ω₂/ω₁={:.2}, expected ~4.0", ratio
        );
    }
}

#[test]
fn modal_ss_beam_convergence() {
    // More elements → better frequency accuracy
    let rho_a_solver = DENSITY * A / 1000.0;
    let omega1_exact = (std::f64::consts::PI / L).powi(2) * (EI / rho_a_solver).sqrt();

    let mut prev_error = f64::INFINITY;
    for n_elem in [4, 8] {
        let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
        input.loads.clear();

        let densities = make_densities();
        let result = modal::solve_modal_2d(&input, &densities, 2).unwrap();
        let omega1 = result.modes[0].omega;
        let error = (omega1 - omega1_exact).abs() / omega1_exact;

        assert!(
            error <= prev_error + 0.001,
            "n_elem={}: error={:.4}% should decrease (prev={:.4}%)",
            n_elem, error * 100.0, prev_error * 100.0
        );
        prev_error = error;
    }
}

// ─── Cantilever Beam Frequencies ─────────────────────────────

#[test]
fn modal_cantilever_first_mode() {
    // β₁L = 1.8751 → ω₁ = (β₁)² × √(EI / ρA) = (1.8751/L)² × √(EI/ρA)
    let n_elem = 8;
    let elem_len = L / n_elem as f64;
    let mut nodes = Vec::new();
    for i in 0..=n_elem {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n_elem {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed")],
        vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    let rho_a_solver = DENSITY * A / 1000.0;
    let beta1 = 1.8751;
    let omega1_exact = (beta1 / L).powi(2) * (EI / rho_a_solver).sqrt();

    let omega1 = result.modes[0].omega;
    let error = (omega1 - omega1_exact).abs() / omega1_exact;

    assert!(
        error < 0.02,
        "Cantilever ω₁={:.2}, expected={:.2}, error={:.2}%",
        omega1, omega1_exact, error * 100.0
    );
}

// ─── Modal Properties ────────────────────────────────────────

#[test]
fn modal_total_mass() {
    let n_elem = 4;
    let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
    input.loads.clear();
    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    // Total mass = ρ × A × L / 1000 = 7850 × 0.01 × 5 / 1000 = 0.3925 tonnes
    let expected_mass = DENSITY * A * L / 1000.0;
    let error = (result.total_mass - expected_mass).abs() / expected_mass;
    assert!(error < 0.01, "total_mass={:.6}, expected={:.6}", result.total_mass, expected_mass);
}

#[test]
fn modal_participation_factors_exist() {
    let n_elem = 4;
    let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
    input.loads.clear();
    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    // Each mode should have valid dynamic properties
    for mode in &result.modes {
        assert!(mode.frequency > 0.0, "frequency should be positive");
        assert!(mode.period > 0.0, "period should be positive");
        assert!(mode.omega > 0.0, "omega should be positive");
    }
    // At least one mode across all should have nonzero participation
    // (some modes may be purely rotational with zero translational participation)
    let any_participation = result.modes.iter().any(|m|
        m.participation_x.abs() > 1e-10 || m.participation_y.abs() > 1e-10
    );
    assert!(any_participation, "at least one mode should have nonzero participation");
}

#[test]
fn modal_rayleigh_damping() {
    let n_elem = 8;
    let mut input = make_ss_beam_udl(n_elem, L, E, A, IZ, 0.0);
    input.loads.clear();
    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    // Should have Rayleigh damping if ≥2 modes
    if result.modes.len() >= 2 {
        let rayleigh = result.rayleigh.as_ref().expect("should have Rayleigh damping");
        assert!(rayleigh.a0 > 0.0, "a0 should be positive");
        assert!(rayleigh.a1 > 0.0, "a1 should be positive");
        // First and last mode should have exactly 5% damping
        let first_xi = rayleigh.damping_ratios[0];
        let last_xi = rayleigh.damping_ratios.last().unwrap();
        assert_close(first_xi, 0.05, 0.01, "first mode damping ratio");
        assert_close(*last_xi, 0.05, 0.01, "last mode damping ratio");
    }
}

// ─── No Density → Error ──────────────────────────────────────

#[test]
fn modal_no_density_fails() {
    let mut input = make_ss_beam_udl(2, L, E, A, IZ, 0.0);
    input.loads.clear();
    let densities = HashMap::new(); // Empty
    let result = modal::solve_modal_2d(&input, &densities, 2);
    assert!(result.is_err(), "should fail with no mass");
}
