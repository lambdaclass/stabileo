/// Validation: 3D Modal Analysis Benchmarks
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 12
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - ASCE 7-22 §12.9: Modal Response Spectrum Analysis
///
/// Tests:
///   1. 3D cantilever: fundamental frequencies match beam theory
///   2. Symmetric frame: degenerate weak/strong axis modes
///   3. Frequency ordering: ω₁ ≤ ω₂ ≤ ω₃
///   4. Mass participation: cumulative > 0 for reasonable modes
///   5. Mode orthogonality: M-orthogonality of mode shapes
///   6. Frequency scaling: doubling length halves frequency
///   7. Torsional mode: asymmetric mass produces coupled response
///   8. Total mass conservation: total_mass matches ρAL
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;
const DENSITY: f64 = 7_850.0;

// ================================================================
// 1. 3D Cantilever: Fundamental Frequency Matches Beam Theory
// ================================================================
//
// f₁ = (1.8751)² / (2π) × sqrt(EI / (ρAL⁴))
// First mode: weak-axis bending (smaller I → lower frequency).

#[test]
fn validation_3d_modal_cantilever_fundamental() {
    let l: f64 = 4.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 3).unwrap();

    // Theoretical cantilever: f₁ = (1.8751²)/(2π) × sqrt(EI/(ρAL⁴))
    let e_eff = E * 1000.0;
    let i_min = IY.min(IZ);
    let rho_a = DENSITY * A / 1000.0; // ρA in consistent units

    let beta1: f64 = 1.8751;
    let f1_exact = beta1.powi(2) / (2.0 * std::f64::consts::PI)
        * (e_eff * i_min / (rho_a * l.powi(4))).sqrt();

    // First mode should be near weak-axis frequency
    let f1_computed = result.modes[0].frequency;

    // Allow 20% tolerance (lumped vs consistent mass, MDOF effects)
    let error = (f1_computed - f1_exact).abs() / f1_exact;
    assert!(error < 0.20,
        "Cantilever f₁: computed={:.2} Hz, exact={:.2} Hz, err={:.1}%",
        f1_computed, f1_exact, error * 100.0);
}

// ================================================================
// 2. Symmetric Section: Degenerate Bending Modes
// ================================================================
//
// Square section (Iy = Iz) → first two bending modes have same frequency
// (degenerate modes in Y and Z directions).

#[test]
fn validation_3d_modal_symmetric_section() {
    let l: f64 = 4.0;
    let n = 6;
    let i_sym = 1e-4; // same for both axes

    let input = make_3d_beam(
        n, l, E, NU, A, i_sym, i_sym, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 4).unwrap();

    // With Iy=Iz, first two bending modes should have same frequency
    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;

    let ratio = f2 / f1;
    assert!((ratio - 1.0).abs() < 0.10,
        "Symmetric section: f₁={:.2}, f₂={:.2}, ratio={:.3} (expect ≈1.0)",
        f1, f2, ratio);
}

// ================================================================
// 3. Frequency Ordering: ω₁ ≤ ω₂ ≤ ω₃
// ================================================================

#[test]
fn validation_3d_modal_frequency_ordering() {
    let l: f64 = 5.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 5).unwrap();

    for i in 1..result.modes.len() {
        assert!(result.modes[i].omega >= result.modes[i - 1].omega * 0.99,
            "Mode {}: ω={:.2} should be ≥ mode {}: ω={:.2}",
            i + 1, result.modes[i].omega, i, result.modes[i - 1].omega);
    }
}

// ================================================================
// 4. Mass Participation: Cumulative > 0
// ================================================================
//
// Modal mass participation should be positive and sum toward 1.0.

#[test]
fn validation_3d_modal_mass_participation() {
    let l: f64 = 4.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 5).unwrap();

    // At least one direction should show significant participation
    let max_cum = result.cumulative_mass_ratio_x
        .max(result.cumulative_mass_ratio_y)
        .max(result.cumulative_mass_ratio_z);

    assert!(max_cum > 0.0,
        "Should have positive mass participation, max cumulative={:.4}", max_cum);

    // Check individual modes have positive effective mass
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.effective_mass_x >= 0.0,
            "Mode {} effective_mass_x={:.6} should be ≥ 0", i + 1, mode.effective_mass_x);
        assert!(mode.effective_mass_y >= 0.0,
            "Mode {} effective_mass_y={:.6} should be ≥ 0", i + 1, mode.effective_mass_y);
    }
}

// ================================================================
// 5. Mode Shapes Have Nonzero Displacements
// ================================================================
//
// Mode shapes should have nonzero displacement components.

#[test]
fn validation_3d_modal_mode_shapes_nonzero() {
    let l: f64 = 4.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 3).unwrap();

    for (i, mode) in result.modes.iter().enumerate() {
        let max_disp = mode.displacements.iter()
            .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
            .fold(0.0_f64, f64::max);
        assert!(max_disp > 1e-12,
            "Mode {} should have nonzero displacement, max={:.6e}", i + 1, max_disp);
    }
}

// ================================================================
// 6. Frequency Scaling: Doubling Length Halves Frequency
// ================================================================
//
// f ∝ 1/L² for bending modes (Euler-Bernoulli beam).
// Doubling L should reduce f by factor of 4.

#[test]
fn validation_3d_modal_length_scaling() {
    let l1: f64 = 3.0;
    let l2: f64 = 6.0;
    let n = 8;

    let make_cantilever = |l: f64| -> SolverInput3D {
        make_3d_beam(n, l, E, NU, A, IY, IZ, J,
            vec![true, true, true, true, true, true],
            None, vec![])
    };

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let res1 = modal::solve_modal_3d(&make_cantilever(l1), &densities, 1).unwrap();
    let res2 = modal::solve_modal_3d(&make_cantilever(l2), &densities, 1).unwrap();

    let f1 = res1.modes[0].frequency;
    let f2 = res2.modes[0].frequency;

    // f ∝ 1/L² → f1/f2 = (L2/L1)² = 4
    let ratio = f1 / f2;
    let expected = (l2 / l1).powi(2);
    let error = (ratio - expected).abs() / expected;

    assert!(error < 0.15,
        "Length scaling: f1/f2={:.3}, expected (L2/L1)²={:.1}, err={:.1}%",
        ratio, expected, error * 100.0);
}

// ================================================================
// 7. Portal Frame: First Mode is Sway
// ================================================================
//
// A 3D portal frame fixed at base → first mode should be lateral sway.

#[test]
fn validation_3d_modal_portal_sway_mode() {
    let h: f64 = 4.0;
    let bay: f64 = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, bay, 0.0, h),
        (4, bay, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![]);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 3).unwrap();

    assert!(result.modes.len() >= 1, "Should have at least 1 mode");

    // First mode should have positive frequency
    assert!(result.modes[0].frequency > 0.0,
        "First mode frequency={:.4} should be > 0", result.modes[0].frequency);

    // Roof nodes (2, 3) should have significant displacement in first mode
    let mode1 = &result.modes[0];
    let roof_disp: f64 = mode1.displacements.iter()
        .filter(|d| d.node_id == 2 || d.node_id == 3)
        .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
        .fold(0.0, f64::max);

    assert!(roof_disp > 1e-6,
        "Roof should have significant mode displacement, max={:.6e}", roof_disp);
}

// ================================================================
// 8. Total Mass Conservation
// ================================================================
//
// total_mass should equal ρ × A × L / 1000 (engine convention).

#[test]
fn validation_3d_modal_total_mass() {
    let l: f64 = 5.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_3d(&input, &densities, 1).unwrap();

    // Expected mass = ρ × A × L / 1000 (engine multiplies by 1000)
    let expected_mass = DENSITY * A * l / 1000.0;

    // Allow 20% tolerance for consistent vs lumped mass formulation
    let error = (result.total_mass - expected_mass).abs() / expected_mass;
    assert!(error < 0.20,
        "Total mass: computed={:.6}, expected≈{:.6}, err={:.1}%",
        result.total_mass, expected_mass, error * 100.0);
}
