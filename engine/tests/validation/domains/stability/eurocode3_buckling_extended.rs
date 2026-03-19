/// Validation: Eurocode 3 Elastic Critical Buckling — Extended
///
/// Reference: EN 1993-1-1 §5.2, §6.3.
///            Euler critical load: P_cr = π² EI / L_e²
///            Effective length factors for ideal columns.
///
/// Tests cover Euler columns with various boundary conditions,
/// higher buckling modes, stiffness/length proportionality, and
/// multi-bay frame alpha_cr.
use dedaliano_engine::solver::buckling;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa  (solver multiplies by 1000 → E_eff = 200e6 kN/m²)
const A: f64 = 0.01;       // m²
const IZ: f64 = 1e-4;      // m⁴

// ═══════════════════════════════════════════════════════════════
// 1. Euler Column: Pinned-Pinned (k = 1.0)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_euler_column_pinned_pinned() {
    // Pinned-pinned column, length L = 5 m
    // Effective length factor k = 1.0, so L_e = L
    // P_cr = π² EI / L² where E_eff = E * 1000
    //
    // The buckling solver returns load_factor = P_cr / P_applied.
    // We apply P = 1 kN axial compression, so load_factor ≈ P_cr.
    let l: f64 = 5.0;
    let p_applied: f64 = -1.0; // 1 kN compression (negative = compression in local x)

    // Column along Y-axis (vertical): node 1 at bottom, node 2 at top
    // Use make_column which builds along X-axis with axial load at end
    let n_elems = 8;
    let input = make_column(n_elems, l, E, A, IZ, "pinned", "rollerX", p_applied);

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Expected: P_cr = π² * E_eff * IZ / L²
    let e_eff: f64 = E * 1000.0;
    let p_cr_expected: f64 = std::f64::consts::PI.powi(2) * e_eff * IZ / l.powi(2);

    // load_factor = P_cr / |P_applied| = P_cr / 1.0 = P_cr
    let expected_factor = p_cr_expected / p_applied.abs();

    let rel = (alpha_cr - expected_factor).abs() / expected_factor;
    assert!(
        rel < 0.05,
        "Pinned-pinned Euler: α_cr={:.2}, expected={:.2}, diff={:.2}%",
        alpha_cr, expected_factor, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Euler Column: Fixed-Free Cantilever (k = 2.0)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_euler_column_fixed_free() {
    // Fixed-free cantilever column, length L = 4 m
    // Effective length factor k = 2.0, so L_e = 2L
    // P_cr = π² EI / (2L)²
    //
    // Boundary: fixed at start (node 1), free at end with compression load.
    // make_column with "fixed" start and "free" end -- but "free" is not a support type.
    // Instead: build manually with fixed base, no support at tip.
    let l: f64 = 4.0;
    let p_applied: f64 = -1.0;
    let n_elems: usize = 8;
    let elem_len = l / n_elems as f64;
    let n_nodes = n_elems + 1;

    let nodes: Vec<(usize, f64, f64)> = (0..n_nodes)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")]; // only base is fixed; tip is free

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: 0.0,
        fz: p_applied,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Expected: P_cr = π² * E_eff * IZ / (2L)²
    let e_eff: f64 = E * 1000.0;
    let p_cr_expected: f64 = std::f64::consts::PI.powi(2) * e_eff * IZ / (2.0 * l).powi(2);
    let expected_factor = p_cr_expected / p_applied.abs();

    let rel = (alpha_cr - expected_factor).abs() / expected_factor;
    assert!(
        rel < 0.10,
        "Fixed-free Euler: α_cr={:.2}, expected={:.2}, diff={:.2}%",
        alpha_cr, expected_factor, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Euler Column: Fixed-Pinned (k ≈ 0.7)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_euler_column_fixed_pinned() {
    // Fixed at base, pinned at top. k ≈ 0.6992 (exact transcendental root).
    // P_cr = π² EI / (kL)²
    let l: f64 = 5.0;
    let p_applied: f64 = -1.0;
    let n_elems: usize = 10;

    let input = make_column(n_elems, l, E, A, IZ, "fixed", "rollerX", p_applied);

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Expected: k = 0.6992
    let k_eff: f64 = 0.6992;
    let e_eff: f64 = E * 1000.0;
    let p_cr_expected: f64 = std::f64::consts::PI.powi(2) * e_eff * IZ / (k_eff * l).powi(2);
    let expected_factor = p_cr_expected / p_applied.abs();

    // Allow 10% tolerance for discrete mesh effects
    let rel = (alpha_cr - expected_factor).abs() / expected_factor;
    assert!(
        rel < 0.10,
        "Fixed-pinned Euler: α_cr={:.2}, expected={:.2} (k={:.4}), diff={:.2}%",
        alpha_cr, expected_factor, k_eff, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Euler Column: Fixed-Fixed (k = 0.5)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_euler_column_fixed_fixed() {
    // Both ends fixed. k = 0.5, so L_e = L/2.
    // P_cr = π² EI / (0.5 L)² = 4 π² EI / L²
    let l: f64 = 5.0;
    let input = make_column(10, l, E, A, IZ, "fixed", "guidedX", -1.0);

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // Expected: P_cr = 4 π² EI / L²
    let e_eff: f64 = E * 1000.0;
    let p_cr_pinned: f64 = std::f64::consts::PI.powi(2) * e_eff * IZ / l.powi(2);

    // Fixed-fixed should have alpha_cr ~ 4x pinned-pinned alpha_cr
    let ratio = alpha_cr / p_cr_pinned;
    assert!(
        ratio > 3.0 && ratio < 5.0,
        "Fixed-fixed should be ~4x pinned: α_cr={:.2}, P_cr_pinned={:.2}, ratio={:.3}",
        alpha_cr, p_cr_pinned, ratio
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Higher Buckling Modes: Ascending Order
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_buckling_modes_ascending_order() {
    // Request 3 buckling modes for a pinned-pinned column.
    // Mode n has P_cr(n) = n² * P_cr(1).
    // Verify modes are returned in ascending load_factor order.
    let l: f64 = 6.0;
    let p_applied: f64 = -1.0;
    let n_elems: usize = 12; // enough elements to resolve higher modes

    let input = make_column(n_elems, l, E, A, IZ, "pinned", "rollerX", p_applied);

    let buck = buckling::solve_buckling_2d(&input, 3).unwrap();

    assert!(
        buck.modes.len() >= 3,
        "Expected at least 3 modes, got {}",
        buck.modes.len()
    );

    // Modes must be in ascending order
    for i in 1..buck.modes.len() {
        assert!(
            buck.modes[i].load_factor >= buck.modes[i - 1].load_factor,
            "Mode {} (λ={:.2}) should be >= mode {} (λ={:.2})",
            i + 1,
            buck.modes[i].load_factor,
            i,
            buck.modes[i - 1].load_factor
        );
    }

    // Check ratio between mode 2 and mode 1 ≈ 4 (2² = 4)
    let ratio_2_1 = buck.modes[1].load_factor / buck.modes[0].load_factor;
    assert!(
        ratio_2_1 > 3.0 && ratio_2_1 < 5.0,
        "Mode 2/Mode 1 ratio={:.2}, expected ~4.0",
        ratio_2_1
    );

    // Check ratio between mode 3 and mode 1 ≈ 9 (3² = 9)
    let ratio_3_1 = buck.modes[2].load_factor / buck.modes[0].load_factor;
    assert!(
        ratio_3_1 > 7.0 && ratio_3_1 < 11.0,
        "Mode 3/Mode 1 ratio={:.2}, expected ~9.0",
        ratio_3_1
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Stiffness Proportionality: Doubling I Doubles α_cr
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_stiffness_proportionality() {
    // P_cr ∝ I, so doubling I should double α_cr.
    // Use two pinned-pinned columns: one with IZ, one with 2*IZ.
    let l: f64 = 5.0;
    let p_applied: f64 = -1.0;
    let n_elems: usize = 8;

    // Column with IZ
    let input1 = make_column(n_elems, l, E, A, IZ, "pinned", "rollerX", p_applied);
    let buck1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let alpha1 = buck1.modes[0].load_factor;

    // Column with 2 * IZ
    let iz2: f64 = 2.0 * IZ;
    let elem_len = l / n_elems as f64;
    let n_nodes = n_elems + 1;
    let nodes: Vec<(usize, f64, f64)> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: p_applied,
        fz: 0.0,
        my: 0.0,
    })];
    let input2 = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz2)],
        elems,
        sups,
        loads,
    );
    let buck2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let alpha2 = buck2.modes[0].load_factor;

    // ratio should be ~2.0
    let ratio = alpha2 / alpha1;
    let rel = (ratio - 2.0).abs() / 2.0;
    assert!(
        rel < 0.05,
        "Doubling IZ: α_cr2/α_cr1={:.4}, expected ~2.0, diff={:.2}%",
        ratio, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Length Effect: α_cr Inversely Proportional to L²
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_length_effect_on_alpha_cr() {
    // P_cr ∝ 1/L², so doubling L should quarter α_cr.
    // Two pinned-pinned columns: L=4 and L=8.
    let l1: f64 = 4.0;
    let l2: f64 = 8.0;
    let p_applied: f64 = -1.0;
    let n_elems: usize = 8;

    let input1 = make_column(n_elems, l1, E, A, IZ, "pinned", "rollerX", p_applied);
    let buck1 = buckling::solve_buckling_2d(&input1, 1).unwrap();
    let alpha1 = buck1.modes[0].load_factor;

    let input2 = make_column(n_elems * 2, l2, E, A, IZ, "pinned", "rollerX", p_applied);
    let buck2 = buckling::solve_buckling_2d(&input2, 1).unwrap();
    let alpha2 = buck2.modes[0].load_factor;

    // α_cr1 / α_cr2 should be ≈ (L2/L1)² = 4.0
    let ratio = alpha1 / alpha2;
    let rel = (ratio - 4.0).abs() / 4.0;
    assert!(
        rel < 0.05,
        "L²-effect: α_cr(L={})/α_cr(L={})={:.4}, expected ~4.0, diff={:.2}%",
        l1, l2, ratio, rel * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Two-Bay Frame: α_cr Reasonableness
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_ec3_two_bay_frame_alpha_cr() {
    // 2-bay, single-story portal frame.
    // Fixed base, 3 columns, 2 beams.
    // Gravity 400 kN on each beam-column joint, lateral 40 kN at roof.
    //
    // More columns provide more lateral stiffness → higher α_cr
    // than an equivalent single-bay frame of same total width.
    let h = 4.0;
    let w = 5.0; // bay width (total width = 2*w = 10m)
    let p = 400.0; // kN gravity per joint
    let h_load = 40.0; // kN lateral

    // Nodes
    let nodes = vec![
        (1, 0.0, 0.0),     // left base
        (2, w, 0.0),        // middle base
        (3, 2.0 * w, 0.0),  // right base
        (4, 0.0, h),         // left roof
        (5, w, h),           // middle roof
        (6, 2.0 * w, h),    // right roof
    ];

    // 3 columns + 2 beams
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, false, false), // left column
        (2, "frame", 2, 5, 1, 1, false, false), // middle column
        (3, "frame", 3, 6, 1, 1, false, false), // right column
        (4, "frame", 4, 5, 1, 1, false, false), // left beam
        (5, "frame", 5, 6, 1, 1, false, false), // right beam
    ];

    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: h_load, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let buck = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buck.modes[0].load_factor;

    // α_cr should be positive and > 1 (frame is stable under applied loads)
    assert!(
        alpha_cr > 1.0,
        "Two-bay frame α_cr={:.3} should be > 1 (stable)",
        alpha_cr
    );

    // Compare with equivalent single-bay frame of width 2*w
    let single_bay = make_portal_frame(h, 2.0 * w, E, A, IZ, h_load, -p);
    let buck_single = buckling::solve_buckling_2d(&single_bay, 1).unwrap();
    let alpha_single = buck_single.modes[0].load_factor;

    // Two-bay frame (3 columns) should have higher α_cr than single-bay (2 columns)
    // because the interior column adds lateral stiffness
    assert!(
        alpha_cr > alpha_single,
        "Two-bay α_cr={:.3} should exceed single-bay α_cr={:.3} (extra column adds stiffness)",
        alpha_cr, alpha_single
    );
}
