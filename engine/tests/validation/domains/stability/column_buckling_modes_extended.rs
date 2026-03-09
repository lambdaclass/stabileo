/// Validation: Column Buckling Modes Extended
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 2
///   - Bazant & Cedolin, "Stability of Structures", Ch. 1-2
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-3
///   - AISC 360, Appendix 7 (Effective Length Method)
///
/// Pcr = pi^2 * E * I / (K * L)^2
///
/// Tests verify:
///   1. Pinned-pinned: load_factor scaling with different applied loads
///   2. Pcr inversely proportional to L^2 (length effect)
///   3. Pcr proportional to Iz (moment of inertia effect)
///   4. Higher modes for pinned-pinned: lambda_n / lambda_1 = n^2
///   5. Fixed-free third mode ratio (cantilever odd-mode sequence)
///   6. Fixed-fixed second and third mode ratios
///   7. Pcr proportional to E (modulus effect)
///   8. Fixed-pinned vs pinned-pinned Pcr ratio ~ 2.046
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. Load Factor Inversely Scales with Applied Load Magnitude
// ================================================================
//
// For a given column, Pcr is fixed. If we apply P1, lambda1 = Pcr/P1.
// If we apply P2 = 2*P1, lambda2 = Pcr/P2 = lambda1/2.
// This verifies the solver's eigenvalue normalization is correct.

#[test]
fn validation_ext_buckling_load_factor_scaling() {
    let l: f64 = 6.0;
    let n = 12;
    let p1: f64 = 50.0;
    let p2: f64 = 100.0;

    let input1 = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p1);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let lambda1 = result1.modes[0].load_factor;

    let input2 = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p2);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let lambda2 = result2.modes[0].load_factor;

    // Pcr = lambda * P is constant, so lambda1 * p1 == lambda2 * p2
    let pcr1 = lambda1 * p1;
    let pcr2 = lambda2 * p2;
    let error = (pcr1 - pcr2).abs() / pcr1;
    assert!(
        error < 0.001,
        "Load factor scaling: Pcr1={:.4}, Pcr2={:.4}, error={:.6}%",
        pcr1, pcr2, error * 100.0
    );

    // Also check lambda ratio: lambda1/lambda2 should be p2/p1 = 2
    let ratio = lambda1 / lambda2;
    assert!(
        (ratio - 2.0).abs() < 0.01,
        "Load factor ratio: lambda1/lambda2={:.4}, expected 2.0", ratio
    );
}

// ================================================================
// 2. Pcr Inversely Proportional to L^2
// ================================================================
//
// For pinned-pinned: Pcr = pi^2 * E_eff * Iz / L^2
// Doubling L should quarter Pcr.

#[test]
fn validation_ext_buckling_length_effect() {
    let l1: f64 = 5.0;
    let l2: f64 = 10.0;
    let n = 16;
    let p: f64 = 100.0;

    let input1 = make_column(n, l1, E, A, IZ, "pinned", "rollerX", -p);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let pcr1 = result1.modes[0].load_factor * p;

    let input2 = make_column(n, l2, E, A, IZ, "pinned", "rollerX", -p);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let pcr2 = result2.modes[0].load_factor * p;

    // Pcr1 / Pcr2 = (L2/L1)^2 = 4.0
    let ratio = pcr1 / pcr2;
    let error = (ratio - 4.0).abs() / 4.0;
    assert!(
        error < 0.01,
        "Length effect: Pcr1/Pcr2={:.4}, expected 4.0, error={:.4}%",
        ratio, error * 100.0
    );
}

// ================================================================
// 3. Pcr Proportional to Moment of Inertia Iz
// ================================================================
//
// For pinned-pinned: Pcr = pi^2 * E_eff * Iz / L^2
// Doubling Iz should double Pcr.

#[test]
fn validation_ext_buckling_inertia_effect() {
    let l: f64 = 8.0;
    let n = 16;
    let p: f64 = 100.0;
    let iz1: f64 = 1e-4;
    let iz2: f64 = 2e-4;

    let input1 = make_column(n, l, E, A, iz1, "pinned", "rollerX", -p);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let pcr1 = result1.modes[0].load_factor * p;

    let input2 = make_column(n, l, E, A, iz2, "pinned", "rollerX", -p);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let pcr2 = result2.modes[0].load_factor * p;

    // Pcr2 / Pcr1 = Iz2 / Iz1 = 2.0
    let ratio = pcr2 / pcr1;
    let error = (ratio - 2.0).abs() / 2.0;
    assert!(
        error < 0.01,
        "Inertia effect: Pcr2/Pcr1={:.4}, expected 2.0, error={:.4}%",
        ratio, error * 100.0
    );
}

// ================================================================
// 4. Higher Modes for Pinned-Pinned: lambda_n = n^2 * lambda_1
// ================================================================
//
// For pinned-pinned columns, the n-th buckling mode has
// Pcr_n = n^2 * pi^2 * EI / L^2.
// Verify modes 2, 3, and 4 against their theoretical ratios.

#[test]
fn validation_ext_buckling_pinned_higher_modes() {
    let l: f64 = 8.0;
    let n = 20; // need enough elements to capture higher modes
    let p: f64 = 100.0;

    let input = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(
        result.modes.len() >= 4,
        "Need at least 4 modes, got {}", result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;

    // Mode 2: ratio = 4
    let ratio2 = result.modes[1].load_factor / lambda1;
    assert!(
        (ratio2 - 4.0).abs() < 0.3,
        "Mode 2 ratio: {:.3}, expected 4.0", ratio2
    );

    // Mode 3: ratio = 9
    let ratio3 = result.modes[2].load_factor / lambda1;
    assert!(
        (ratio3 - 9.0).abs() < 1.0,
        "Mode 3 ratio: {:.3}, expected 9.0", ratio3
    );

    // Mode 4: ratio = 16
    let ratio4 = result.modes[3].load_factor / lambda1;
    assert!(
        (ratio4 - 16.0).abs() < 2.5,
        "Mode 4 ratio: {:.3}, expected 16.0", ratio4
    );
}

// ================================================================
// 5. Cantilever (Fixed-Free) Third Mode
// ================================================================
//
// Cantilever buckling modes correspond to odd half-waves:
//   Mode 1: (pi/2)^2 * EI/L^2 -> effective factor 1
//   Mode 2: (3*pi/2)^2 * EI/L^2 -> ratio = 9
//   Mode 3: (5*pi/2)^2 * EI/L^2 -> ratio = 25
// Verify mode 3 / mode 1 ratio.

#[test]
fn validation_ext_buckling_cantilever_third_mode() {
    let l: f64 = 5.0;
    let n = 20;
    let p: f64 = 50.0;

    // Cantilever: fixed at start, free at end (no end support)
    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: -p, fy: 0.0, mz: 0.0,
        })]);

    let result = buckling::solve_buckling_2d(&input, 3).unwrap();
    assert!(
        result.modes.len() >= 3,
        "Need at least 3 modes, got {}", result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;
    let lambda2 = result.modes[1].load_factor;
    let lambda3 = result.modes[2].load_factor;

    // Mode 2 / Mode 1 = 9
    let ratio2 = lambda2 / lambda1;
    assert!(
        (ratio2 - 9.0).abs() < 2.0,
        "Cantilever mode 2/1 ratio: {:.3}, expected ~9.0", ratio2
    );

    // Mode 3 / Mode 1 = 25
    let ratio3 = lambda3 / lambda1;
    assert!(
        (ratio3 - 25.0).abs() < 5.0,
        "Cantilever mode 3/1 ratio: {:.3}, expected ~25.0", ratio3
    );
}

// ================================================================
// 6. Fixed-Fixed Second and Third Mode Ratios
// ================================================================
//
// Fixed-fixed critical loads from transcendental equation:
//   Mode 1: (2*pi)^2 * EI/L^2  (symmetric)
//   Mode 2: ~(2.86*pi)^2 * EI/L^2 ~ 80.76*EI/L^2 -> ratio ~ 2.046
//   Mode 3: (4*pi)^2 * EI/L^2 = 4*mode1 -> ratio = 4.0
// Verify these mode ratios.

#[test]
fn validation_ext_buckling_fixed_fixed_mode_ratios() {
    let l: f64 = 6.0;
    let n = 20;
    let p: f64 = 100.0;

    let input = make_column(n, l, E, A, IZ, "fixed", "guidedX", -p);
    let result = buckling::solve_buckling_2d(&input, 3).unwrap();
    assert!(
        result.modes.len() >= 3,
        "Need at least 3 modes, got {}", result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;

    // Mode 2 / Mode 1 ~ 2.05 (antisymmetric mode)
    let ratio2 = result.modes[1].load_factor / lambda1;
    assert!(
        ratio2 > 1.8 && ratio2 < 2.3,
        "Fixed-fixed mode 2/1 ratio: {:.3}, expected ~2.05", ratio2
    );

    // Mode 3 / Mode 1 ~ 4.0 (next symmetric mode)
    let ratio3 = result.modes[2].load_factor / lambda1;
    assert!(
        ratio3 > 3.5 && ratio3 < 4.5,
        "Fixed-fixed mode 3/1 ratio: {:.3}, expected ~4.0", ratio3
    );
}

// ================================================================
// 7. Pcr Proportional to Elastic Modulus E
// ================================================================
//
// For pinned-pinned: Pcr = pi^2 * E_eff * Iz / L^2
// Halving E should halve Pcr.

#[test]
fn validation_ext_buckling_modulus_effect() {
    let l: f64 = 6.0;
    let n = 12;
    let p: f64 = 100.0;
    let e1: f64 = 200_000.0; // steel
    let e2: f64 = 100_000.0; // half stiffness

    let input1 = make_column(n, l, e1, A, IZ, "pinned", "rollerX", -p);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let pcr1 = result1.modes[0].load_factor * p;

    let input2 = make_column(n, l, e2, A, IZ, "pinned", "rollerX", -p);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let pcr2 = result2.modes[0].load_factor * p;

    // Pcr1 / Pcr2 = E1 / E2 = 2.0
    let ratio = pcr1 / pcr2;
    let error = (ratio - 2.0).abs() / 2.0;
    assert!(
        error < 0.01,
        "Modulus effect: Pcr1/Pcr2={:.4}, expected 2.0, error={:.4}%",
        ratio, error * 100.0
    );
}

// ================================================================
// 8. Fixed-Pinned vs Pinned-Pinned Pcr Ratio
// ================================================================
//
// Fixed-pinned: Pcr_fp = 20.1907 * EI / L^2  (K ~ 0.699)
// Pinned-pinned: Pcr_pp = pi^2 * EI / L^2 = 9.8696 * EI / L^2
// Ratio Pcr_fp / Pcr_pp = 20.1907 / 9.8696 ~ 2.046
//
// This ratio is independent of E, I, L — purely a boundary condition effect.

#[test]
fn validation_ext_buckling_fixed_pinned_vs_pinned_ratio() {
    let l: f64 = 7.0;
    let n = 16;
    let p: f64 = 100.0;

    // Pinned-pinned
    let input_pp = make_column(n, l, E, A, IZ, "pinned", "rollerX", -p);
    let result_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap();
    let pcr_pp = result_pp.modes[0].load_factor * p;

    // Fixed-pinned
    let input_fp = make_column(n, l, E, A, IZ, "fixed", "rollerX", -p);
    let result_fp = buckling::solve_buckling_2d(&input_fp, 1).unwrap();
    let pcr_fp = result_fp.modes[0].load_factor * p;

    // Theoretical ratio: 20.1907 / 9.8696 = 2.0457
    let ratio = pcr_fp / pcr_pp;
    let expected: f64 = 20.1907 / 9.8696;
    let error = (ratio - expected).abs() / expected;
    assert!(
        error < 0.02,
        "Fixed-pinned / Pinned-pinned ratio: {:.4}, expected {:.4}, error={:.4}%",
        ratio, expected, error * 100.0
    );
}
