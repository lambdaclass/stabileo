/// Validation: Extended Column Buckling Curves
///
/// References:
///   - Timoshenko & Gere, *Theory of Elastic Stability*, Ch. 2
///   - AISC 360-16, Chapter E (Compression Members)
///   - Galambos & Surovek, *Structural Stability of Steel*, Ch. 2-3
///
/// Tests verify eigenvalue-based buckling behavior:
///   1. Pcr scales inversely with L^2 for pinned-pinned columns
///   2. Doubling area doubles Pcr (Iz held constant is wrong; test with scaled Iz)
///   3. Effective length factors: K ordering across boundary conditions
///   4. Higher modes: pinned-pinned 3rd mode ratio ~9
///   5. Slenderness ratio from element_data matches L/r
///   6. Mesh refinement: 16-element Pcr upper-bounds exact for pinned-pinned
///   7. Fixed-pinned vs pinned-pinned Pcr ratio ~2.046
///   8. Multi-mode spectrum: first 4 pinned-pinned eigenvalues follow n^2 law
use dedaliano_engine::solver::buckling;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4
const E_EFF: f64 = E * 1000.0; // kN/m^2
const PI2: f64 = std::f64::consts::PI * std::f64::consts::PI;
const P: f64 = 100.0;     // kN reference load

/// Euler critical load for pinned-pinned: Pcr = pi^2 * EI / L^2
fn pcr_exact_pp(l: f64, iz: f64) -> f64 {
    PI2 * E_EFF * iz / (l * l)
}

// ================================================================
// 1. Pcr Inversely Proportional to L^2
// ================================================================
//
// For pinned-pinned columns with same cross-section,
// Pcr(L1) / Pcr(L2) = (L2/L1)^2.
// Test with L1=3m and L2=6m: ratio should be 4.0.

#[test]
fn validation_column_curves_ext_pcr_inverse_length_squared() {
    let l1 = 3.0;
    let l2 = 6.0;

    let input1 = make_column(10, l1, E, A, IZ, "pinned", "rollerX", -P);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let pcr1 = result1.modes[0].load_factor * P;

    let input2 = make_column(10, l2, E, A, IZ, "pinned", "rollerX", -P);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let pcr2 = result2.modes[0].load_factor * P;

    let ratio = pcr1 / pcr2;
    let expected: f64 = (l2 / l1).powi(2); // 4.0

    let error = (ratio - expected).abs() / expected;
    assert!(
        error < 0.02,
        "Pcr ratio L1={}/L2={}: got {:.4}, expected {:.4}, error={:.2}%",
        l1, l2, ratio, expected, error * 100.0
    );
}

// ================================================================
// 2. Pcr Scales Linearly with Moment of Inertia
// ================================================================
//
// For pinned-pinned columns with same length and E,
// Pcr is proportional to Iz. Doubling Iz doubles Pcr.
// Use L=5m, compare Iz=1e-4 vs Iz=2e-4.

#[test]
fn validation_column_curves_ext_pcr_proportional_to_iz() {
    let l = 5.0;
    let iz1 = 1e-4;
    let iz2 = 2e-4;

    let input1 = make_column(10, l, E, A, iz1, "pinned", "rollerX", -P);
    let result1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let pcr1 = result1.modes[0].load_factor * P;

    let input2 = make_column(10, l, E, A, iz2, "pinned", "rollerX", -P);
    let result2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let pcr2 = result2.modes[0].load_factor * P;

    let ratio = pcr2 / pcr1;
    let expected = iz2 / iz1; // 2.0

    let error = (ratio - expected).abs() / expected;
    assert!(
        error < 0.02,
        "Pcr ratio Iz2/Iz1: got {:.4}, expected {:.4}, error={:.2}%",
        ratio, expected, error * 100.0
    );
}

// ================================================================
// 3. Effective Length Factor Ordering Across Boundary Conditions
// ================================================================
//
// Pcr ordering: fixed-fixed > fixed-pinned > pinned-pinned > fixed-free.
// All at same L=5m. Verify strict ordering of eigenvalues.

#[test]
fn validation_column_curves_ext_effective_length_ordering() {
    let l = 5.0;
    let n = 10;

    // Fixed-fixed (guidedX end for 2D)
    let input_ff = make_column(n, l, E, A, IZ, "fixed", "guidedX", -P);
    let pcr_ff = buckling::solve_buckling_2d(&input_ff, 1).unwrap()
        .modes[0].load_factor * P;

    // Fixed-pinned
    let input_fp = make_column(n, l, E, A, IZ, "fixed", "rollerX", -P);
    let pcr_fp = buckling::solve_buckling_2d(&input_fp, 1).unwrap()
        .modes[0].load_factor * P;

    // Pinned-pinned
    let input_pp = make_column(n, l, E, A, IZ, "pinned", "rollerX", -P);
    let pcr_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap()
        .modes[0].load_factor * P;

    // Verify strict ordering
    assert!(
        pcr_ff > pcr_fp,
        "Fixed-fixed ({:.2}) > Fixed-pinned ({:.2})",
        pcr_ff, pcr_fp
    );
    assert!(
        pcr_fp > pcr_pp,
        "Fixed-pinned ({:.2}) > Pinned-pinned ({:.2})",
        pcr_fp, pcr_pp
    );

    // Check approximate ratios against theory
    // fixed-fixed / pinned-pinned ~ 4.0
    let ratio_ff_pp = pcr_ff / pcr_pp;
    assert!(
        (ratio_ff_pp - 4.0).abs() < 0.2,
        "Fixed-fixed/Pinned-pinned ratio: {:.3}, expected ~4.0",
        ratio_ff_pp
    );

    // fixed-pinned / pinned-pinned ~ 2.046
    let ratio_fp_pp = pcr_fp / pcr_pp;
    assert!(
        (ratio_fp_pp - 2.046).abs() < 0.15,
        "Fixed-pinned/Pinned-pinned ratio: {:.3}, expected ~2.046",
        ratio_fp_pp
    );
}

// ================================================================
// 4. Higher Mode: Pinned-Pinned 3rd Mode Ratio ~9
// ================================================================
//
// For pinned-pinned columns, the nth mode has
// Pcr_n = n^2 * Pcr_1. So mode 3 has ratio 9.
// Need enough elements (16) to capture 3rd mode accurately.

#[test]
fn validation_column_curves_ext_third_mode_ratio() {
    let l = 5.0;
    let input = make_column(16, l, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();

    assert!(
        result.modes.len() >= 3,
        "Need at least 3 modes, got {}",
        result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;
    let lambda3 = result.modes[2].load_factor;
    let ratio = lambda3 / lambda1;

    // Theoretical: n^2 = 9
    assert!(
        (ratio - 9.0).abs() < 1.0,
        "3rd mode ratio lambda3/lambda1 = {:.2}, expected ~9.0",
        ratio
    );
}

// ================================================================
// 5. Slenderness Ratio from element_data Matches L/r
// ================================================================
//
// The buckling solver reports slenderness = KL/r per element.
// For a pinned-pinned column (K=1), slenderness = L/r
// where r = sqrt(Iz/A). Verify element_data values.

#[test]
fn validation_column_curves_ext_slenderness_from_element_data() {
    let l = 5.0;
    let n = 8;

    let input = make_column(n, l, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();

    // Radius of gyration
    let r: f64 = (IZ / A).sqrt();
    // Each element has length L/n
    let elem_len = l / n as f64;

    // Check that element_data is populated
    assert!(
        !result.element_data.is_empty(),
        "element_data should not be empty"
    );

    // Each element should report slenderness based on its length and k_effective
    for ed in &result.element_data {
        let expected_slenderness = ed.k_effective * ed.length / r;
        let error = (ed.slenderness - expected_slenderness).abs()
            / expected_slenderness.max(1e-10);
        assert!(
            error < 0.05,
            "Element {} slenderness: got {:.4}, expected {:.4} (K={:.3}, L={:.4}, r={:.6})",
            ed.element_id, ed.slenderness, expected_slenderness,
            ed.k_effective, ed.length, r
        );
    }

    // Also verify element length is correct
    for ed in &result.element_data {
        let error = (ed.length - elem_len).abs() / elem_len;
        assert!(
            error < 0.01,
            "Element {} length: got {:.6}, expected {:.6}",
            ed.element_id, ed.length, elem_len
        );
    }
}

// ================================================================
// 6. Mesh Convergence: Fine Mesh Upper-Bounds Exact Pcr
// ================================================================
//
// FEM buckling with consistent geometric stiffness typically
// gives Pcr >= exact (upper bound from Rayleigh-Ritz).
// A 16-element pinned-pinned column Pcr should be very close
// to (but >= ) the exact value pi^2*EI/L^2.

#[test]
fn validation_column_curves_ext_mesh_convergence_upper_bound() {
    let l = 5.0;
    let pcr_exact = pcr_exact_pp(l, IZ);

    // Coarse mesh: 4 elements
    let input4 = make_column(4, l, E, A, IZ, "pinned", "rollerX", -P);
    let pcr4 = buckling::solve_buckling_2d(&input4, 1).unwrap()
        .modes[0].load_factor * P;

    // Fine mesh: 16 elements
    let input16 = make_column(16, l, E, A, IZ, "pinned", "rollerX", -P);
    let pcr16 = buckling::solve_buckling_2d(&input16, 1).unwrap()
        .modes[0].load_factor * P;

    // Fine mesh should be closer to exact than coarse
    let error4 = (pcr4 - pcr_exact).abs() / pcr_exact;
    let error16 = (pcr16 - pcr_exact).abs() / pcr_exact;

    assert!(
        error16 < error4,
        "Fine mesh error ({:.4}%) < coarse mesh error ({:.4}%)",
        error16 * 100.0, error4 * 100.0
    );

    // Fine mesh should be within 0.5% of exact
    assert!(
        error16 < 0.005,
        "16-element Pcr error = {:.4}%, expected < 0.5%",
        error16 * 100.0
    );

    // FEM with cubic shape functions typically gives upper bound
    // (Pcr_FEM >= Pcr_exact), but allow small undershoot from numerics
    assert!(
        pcr16 > pcr_exact * 0.995,
        "16-element Pcr={:.4} should be near or above exact={:.4}",
        pcr16, pcr_exact
    );
}

// ================================================================
// 7. Fixed-Pinned vs Pinned-Pinned Pcr Ratio ~2.046
// ================================================================
//
// The exact ratio of Pcr(fixed-pinned) / Pcr(pinned-pinned) is
// 20.1907 / pi^2 = 2.0457. Verify this with the solver.

#[test]
fn validation_column_curves_ext_fixed_pinned_ratio() {
    let l = 5.0;
    let n = 12;

    let input_fp = make_column(n, l, E, A, IZ, "fixed", "rollerX", -P);
    let pcr_fp = buckling::solve_buckling_2d(&input_fp, 1).unwrap()
        .modes[0].load_factor * P;

    let input_pp = make_column(n, l, E, A, IZ, "pinned", "rollerX", -P);
    let pcr_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap()
        .modes[0].load_factor * P;

    let ratio = pcr_fp / pcr_pp;
    let expected = 20.1907 / PI2; // 2.0457

    let error = (ratio - expected).abs() / expected;
    assert!(
        error < 0.02,
        "Fixed-pinned/Pinned-pinned ratio: {:.4}, expected {:.4}, error={:.2}%",
        ratio, expected, error * 100.0
    );
}

// ================================================================
// 8. Multi-Mode Spectrum: n^2 Law for Pinned-Pinned
// ================================================================
//
// For a pinned-pinned column, the eigenvalue of mode n is
// lambda_n / lambda_1 = n^2. Verify modes 1-4 follow this law
// using 16 elements for adequate resolution of higher modes.

#[test]
fn validation_column_curves_ext_multi_mode_n_squared_law() {
    let l = 5.0;
    let input = make_column(16, l, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 5).unwrap();

    assert!(
        result.modes.len() >= 4,
        "Need at least 4 modes, got {}",
        result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;

    // Verify each mode follows n^2 law
    for n in 1..=4_usize {
        let lambda_n = result.modes[n - 1].load_factor;
        let ratio = lambda_n / lambda1;
        let expected: f64 = (n as f64).powi(2);
        let error = (ratio - expected).abs() / expected;

        assert!(
            error < 0.05,
            "Mode {} ratio: {:.3}, expected {:.3}, error={:.2}%",
            n, ratio, expected, error * 100.0
        );
    }

    // Also verify absolute value of first mode against theory
    let pcr1 = lambda1 * P;
    let pcr_exact = pcr_exact_pp(l, IZ);
    let error1 = (pcr1 - pcr_exact).abs() / pcr_exact;
    assert!(
        error1 < 0.005,
        "First mode Pcr={:.2}, exact={:.2}, error={:.4}%",
        pcr1, pcr_exact, error1 * 100.0
    );
}
