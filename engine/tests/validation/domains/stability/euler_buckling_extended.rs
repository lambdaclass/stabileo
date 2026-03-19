/// Extended Euler Column Buckling Validation Tests
///
/// Reference: Timoshenko & Gere, *Theory of Elastic Stability*
///
/// These tests extend the base Euler buckling suite with:
///   1. Pcr scales linearly with moment of inertia (I)
///   2. Pcr scales inversely with L^2
///   3. Pcr scales linearly with elastic modulus (E)
///   4. Effective length factors (K) from element_data match theory
///   5. Mode shape symmetry for pinned-pinned first mode
///   6. Load factor is always positive for compressive (negative fx) loads
///   7. Boundary condition ordering: FF > FP > PP > cantilever
///   8. Pinned-pinned higher modes follow n^2 law up to mode 4
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;

// ---------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------
const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 => E_eff = 2e8 kN/m^2)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4
const L: f64 = 5.0;       // m
const P: f64 = 100.0;     // kN applied compressive load

// ═══════════════════════════════════════════════════════════════
// 1. Pcr scales linearly with moment of inertia
//    Double Iz => double Pcr (same BCs, same L)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pcr_scales_with_iz() {
    let iz1: f64 = 1e-4;
    let iz2: f64 = 2e-4;

    let input1 = make_column(8, L, E, A, iz1, "pinned", "rollerX", -P);
    let input2 = make_column(8, L, E, A, iz2, "pinned", "rollerX", -P);

    let r1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let r2 = buckling::solve_buckling_2d(&input2, 1).unwrap();

    let pcr1 = r1.modes[0].load_factor * P;
    let pcr2 = r2.modes[0].load_factor * P;

    let ratio = pcr2 / pcr1;
    let error = (ratio - 2.0).abs() / 2.0;
    assert!(
        error < 0.01,
        "Pcr should double when Iz doubles: pcr1={:.2}, pcr2={:.2}, ratio={:.4}, error={:.4}%",
        pcr1, pcr2, ratio, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Pcr scales inversely with L^2
//    Half the length => 4x the Pcr (same BCs, same section)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pcr_inversely_proportional_to_l_squared() {
    let l1: f64 = 5.0;
    let l2: f64 = 2.5; // half length

    let input1 = make_column(8, l1, E, A, IZ, "pinned", "rollerX", -P);
    let input2 = make_column(8, l2, E, A, IZ, "pinned", "rollerX", -P);

    let r1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let r2 = buckling::solve_buckling_2d(&input2, 1).unwrap();

    let pcr1 = r1.modes[0].load_factor * P;
    let pcr2 = r2.modes[0].load_factor * P;

    let ratio = pcr2 / pcr1;
    // (L1/L2)^2 = (5/2.5)^2 = 4.0
    let expected_ratio: f64 = (l1 / l2).powi(2);
    let error = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(
        error < 0.01,
        "Pcr should quadruple when L halves: pcr1={:.2}, pcr2={:.2}, ratio={:.4}, expected={:.4}, error={:.4}%",
        pcr1, pcr2, ratio, expected_ratio, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Pcr scales linearly with elastic modulus E
//    Double E => double Pcr (same BCs, same geometry)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pcr_scales_with_elastic_modulus() {
    let e1: f64 = 200_000.0;
    let e2: f64 = 100_000.0; // half the modulus

    let input1 = make_column(8, L, e1, A, IZ, "pinned", "rollerX", -P);
    let input2 = make_column(8, L, e2, A, IZ, "pinned", "rollerX", -P);

    let r1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let r2 = buckling::solve_buckling_2d(&input2, 1).unwrap();

    let pcr1 = r1.modes[0].load_factor * P;
    let pcr2 = r2.modes[0].load_factor * P;

    // Pcr1 / Pcr2 = E1 / E2 = 2.0
    let ratio = pcr1 / pcr2;
    let error = (ratio - 2.0).abs() / 2.0;
    assert!(
        error < 0.01,
        "Pcr should double when E doubles: pcr_e1={:.2}, pcr_e2={:.2}, ratio={:.4}, error={:.4}%",
        pcr1, pcr2, ratio, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Effective length factor K from element_data matches theory
//    Pinned-pinned: K = 1.0, Fixed-fixed: K = 0.5
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_effective_length_factors() {
    // Pinned-pinned: K_eff = 1.0
    let input_pp = make_column(8, L, E, A, IZ, "pinned", "rollerX", -P);
    let r_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap();

    // Fixed-fixed (guidedX at end): K_eff = 0.5
    let input_ff = make_column(8, L, E, A, IZ, "fixed", "guidedX", -P);
    let r_ff = buckling::solve_buckling_2d(&input_ff, 1).unwrap();

    let pcr_pp = r_pp.modes[0].load_factor * P;
    let pcr_ff = r_ff.modes[0].load_factor * P;

    // Pcr_ff / Pcr_pp = (K_pp / K_ff)^2 = (1.0 / 0.5)^2 = 4.0
    let ratio = pcr_ff / pcr_pp;
    let error = (ratio - 4.0).abs() / 4.0;
    assert!(
        error < 0.02,
        "Fixed-fixed Pcr should be 4x pinned-pinned: ratio={:.4}, error={:.4}%",
        ratio, error * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Mode shape symmetry for pinned-pinned first mode
//    The first buckling mode of a pinned-pinned column is
//    sin(pi*x/L): symmetric about midspan, uy(x) = uy(L-x)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pinned_pinned_mode_shape_symmetry() {
    let n_elem = 8;
    let input = make_column(n_elem, L, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 1).unwrap();

    let mode = &result.modes[0];
    let disps = &mode.displacements;
    let n_nodes = n_elem + 1; // 9 nodes for 8 elements

    // Check symmetry: node i should have same |uy| as node (n_nodes+1 - i)
    // Nodes are numbered 1..9; midpoint is node 5
    for i in 1..=4 {
        let uy_left = disps.iter().find(|d| d.node_id == i).unwrap().uz;
        let uy_right = disps.iter().find(|d| d.node_id == n_nodes + 1 - i).unwrap().uz;
        let diff = (uy_left.abs() - uy_right.abs()).abs();
        let max_uy = uy_left.abs().max(uy_right.abs()).max(1e-12);
        let sym_error = diff / max_uy;
        assert!(
            sym_error < 0.01,
            "Mode shape not symmetric at node pair ({}, {}): uy_left={:.6}, uy_right={:.6}, error={:.4}%",
            i, n_nodes + 1 - i, uy_left, uy_right, sym_error * 100.0
        );
    }

    // Also check that midpoint (node 5) has maximum |uy|
    let uy_mid = disps.iter().find(|d| d.node_id == 5).unwrap().uz.abs();
    for d in disps {
        assert!(
            d.uz.abs() <= uy_mid * 1.01,
            "Midpoint should have max |uy|: node {} has |uy|={:.6} > mid={:.6}",
            d.node_id, d.uz.abs(), uy_mid
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. Load factor is positive for compressive loads
//    Buckling only occurs under compression. With negative fx
//    (compressive), the load factor lambda should be positive.
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_load_factor_positive_for_compression() {
    let bcs: Vec<(&str, &str)> = vec![
        ("pinned", "rollerX"),
        ("fixed", "rollerX"),
        ("fixed", "guidedX"),
    ];

    for (start, end) in &bcs {
        let input = make_column(8, L, E, A, IZ, start, end, -P);
        let result = buckling::solve_buckling_2d(&input, 1).unwrap();
        let lambda = result.modes[0].load_factor;
        assert!(
            lambda > 0.0,
            "Load factor should be positive for compression ({}-{}): lambda={:.4}",
            start, end, lambda
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 7. Boundary condition ordering: Pcr_FF > Pcr_FP > Pcr_PP > Pcr_CF
//    Fixed-Fixed > Fixed-Pinned > Pinned-Pinned > Cantilever (fixed-free)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_boundary_condition_ordering() {
    // Fixed-fixed
    let input_ff = make_column(8, L, E, A, IZ, "fixed", "guidedX", -P);
    let pcr_ff = buckling::solve_buckling_2d(&input_ff, 1).unwrap().modes[0].load_factor * P;

    // Fixed-pinned
    let input_fp = make_column(8, L, E, A, IZ, "fixed", "rollerX", -P);
    let pcr_fp = buckling::solve_buckling_2d(&input_fp, 1).unwrap().modes[0].load_factor * P;

    // Pinned-pinned
    let input_pp = make_column(8, L, E, A, IZ, "pinned", "rollerX", -P);
    let pcr_pp = buckling::solve_buckling_2d(&input_pp, 1).unwrap().modes[0].load_factor * P;

    // Build cantilever (fixed-free) directly
    let elem_len = L / 8.0;
    let nodes: Vec<(usize, f64, f64)> = (0..=8).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> =
        (0..8).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let input_cf = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 9,
            fx: -P,
            fz: 0.0,
            my: 0.0,
        })],
    );
    let pcr_cf = buckling::solve_buckling_2d(&input_cf, 1).unwrap().modes[0].load_factor * P;

    assert!(
        pcr_ff > pcr_fp,
        "Fixed-fixed ({:.2}) should > Fixed-pinned ({:.2})", pcr_ff, pcr_fp
    );
    assert!(
        pcr_fp > pcr_pp,
        "Fixed-pinned ({:.2}) should > Pinned-pinned ({:.2})", pcr_fp, pcr_pp
    );
    assert!(
        pcr_pp > pcr_cf,
        "Pinned-pinned ({:.2}) should > Cantilever ({:.2})", pcr_pp, pcr_cf
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Higher modes follow n^2 law for pinned-pinned
//    Mode n has Pcr_n = n^2 * Pcr_1
//    Check modes 1 through 4
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_euler_pinned_pinned_n_squared_law() {
    let input = make_column(16, L, E, A, IZ, "pinned", "rollerX", -P);
    let result = buckling::solve_buckling_2d(&input, 4).unwrap();
    assert!(
        result.modes.len() >= 4,
        "Need at least 4 modes, got {}", result.modes.len()
    );

    let lambda1 = result.modes[0].load_factor;
    for n in 2..=4_usize {
        let lambda_n = result.modes[n - 1].load_factor;
        let ratio = lambda_n / lambda1;
        let expected: f64 = (n as f64).powi(2);
        let error = (ratio - expected).abs() / expected;
        assert!(
            error < 0.05,
            "Mode {} ratio: lambda_{}/lambda_1 = {:.4}, expected {:.1}, error={:.4}%",
            n, n, ratio, expected, error * 100.0
        );
    }
}
