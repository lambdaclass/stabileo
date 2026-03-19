/// Validation: Hardy Cross Moment Distribution Benchmarks
///
/// References:
///   - Cross, H. "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", 4th Ed.
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///
/// Tests verify indeterminate structure results against moment distribution:
///   1. Two-span equal, UDL: M_B = wL²/8
///   2. Three-span equal, UDL: M_interior = wL²/10
///   3. Four-span equal, UDL: classical solution
///   4. Two-span unequal: three-moment equation
///   5. Continuous beam with point load on one span
///   6. Pattern loading: live load on alternate spans
///   7. Portal frame lateral load: joint moment distribution
///   8. Propped cantilever distribution factors
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Span Equal, UDL: M_B = wL²/8
// ================================================================
//
// Classic moment distribution result. Two equal spans, pinned ends,
// UDL w on both spans. Interior moment = wL²/8.

#[test]
fn validation_hardy_cross_two_span_equal_udl() {
    let l = 6.0;
    let n_per_span = 4;
    let q = -10.0;

    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment M_B = wL²/8
    let m_exact = q.abs() * l * l / 8.0;

    // Find element forces at the interior support (node n_per_span+1)
    // Element n_per_span ends at interior support
    let ef = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span)
        .unwrap();
    let err = (ef.m_end.abs() - m_exact).abs() / m_exact;
    assert!(err < 0.05,
        "Two-span M_B: {:.4}, expected wL²/8={:.4}", ef.m_end.abs(), m_exact);

    // Reactions: R_A = R_C = 3wL/8, R_B = 10wL/8 = 5wL/4
    let r_end = 3.0 * q.abs() * l / 8.0;
    let r_mid = 10.0 * q.abs() * l / 8.0;
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter()
        .find(|r| r.node_id == n_per_span + 1).unwrap().rz;

    let err_ra = (ra - r_end).abs() / r_end;
    let err_rb = (rb - r_mid).abs() / r_mid;
    assert!(err_ra < 0.05, "R_A={:.4}, expected 3wL/8={:.4}", ra, r_end);
    assert!(err_rb < 0.05, "R_B={:.4}, expected 5wL/4={:.4}", rb, r_mid);
}

// ================================================================
// 2. Three-Span Equal, UDL: M_interior = wL²/10
// ================================================================
//
// Three equal spans, pinned ends, UDL on all.
// By symmetry and three-moment equation: M₁ = M₂ = wL²/10.

#[test]
fn validation_hardy_cross_three_span_equal_udl() {
    let l = 6.0;
    let n_per_span = 4;
    let q = -10.0;

    let total_elems = n_per_span * 3;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments = wL²/10
    let m_exact = q.abs() * l * l / 10.0;

    // First interior support at node n_per_span+1
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let err1 = (ef1.m_end.abs() - m_exact).abs() / m_exact;
    assert!(err1 < 0.05,
        "Three-span M₁: {:.4}, expected wL²/10={:.4}", ef1.m_end.abs(), m_exact);

    // Second interior support at node 2*n_per_span+1
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    let err2 = (ef2.m_end.abs() - m_exact).abs() / m_exact;
    assert!(err2 < 0.05,
        "Three-span M₂: {:.4}, expected wL²/10={:.4}", ef2.m_end.abs(), m_exact);

    // By symmetry, M₁ = M₂
    let diff = (ef1.m_end.abs() - ef2.m_end.abs()).abs();
    assert!(diff < m_exact * 0.02,
        "Symmetry: M₁={:.4}, M₂={:.4} should be equal", ef1.m_end.abs(), ef2.m_end.abs());
}

// ================================================================
// 3. Four-Span Equal, UDL: Interior Moments
// ================================================================
//
// Four equal spans, UDL on all. From three-moment equations:
//   M₁ = M₃ = wL²/28 × 3 = 3wL²/28
//   M₂ = wL²/28 × 2 = wL²/14
//
// Actually, four equal spans from simultaneous equations:
//   M₁ = M₃ (symmetry), and from the system:
//   4M₁ + M₂ = -wL²/2
//   M₁ + 4M₂ + M₃ = -wL²/2
//   M₂ + 4M₃ = -wL²/2
//   Using M₁=M₃: M₁(4+1) + M₂ = M₁ + 4M₂ + M₁
//   From (i): M₂ = -wL²/2 - 4M₁
//   From (ii): M₁ + 4(-wL²/2 - 4M₁) + M₁ = -wL²/2
//     → 2M₁ - 2wL² - 16M₁ = -wL²/2
//     → -14M₁ = 3wL²/2
//     → M₁ = -3wL²/28
//   M₂ = -wL²/2 + 12wL²/28 = -14wL²/28 + 12wL²/28 = -2wL²/28 = -wL²/14

#[test]
fn validation_hardy_cross_four_span_equal_udl() {
    let l = 5.0;
    let n_per_span = 4;
    let q = -12.0;

    let total_elems = n_per_span * 4;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let w = q.abs();
    let m1_exact = 3.0 * w * l * l / 28.0; // end interior supports
    let m2_exact = w * l * l / 14.0;        // center support

    // Support 1 at node n_per_span+1
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let err1 = (ef1.m_end.abs() - m1_exact).abs() / m1_exact;
    assert!(err1 < 0.05,
        "Four-span M₁: {:.4}, expected 3wL²/28={:.4}", ef1.m_end.abs(), m1_exact);

    // Center support at node 2*n_per_span+1
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    let err2 = (ef2.m_end.abs() - m2_exact).abs() / m2_exact;
    assert!(err2 < 0.05,
        "Four-span M₂: {:.4}, expected wL²/14={:.4}", ef2.m_end.abs(), m2_exact);
}

// ================================================================
// 4. Two-Span Unequal: Three-Moment Equation
// ================================================================
//
// Spans L₁=4, L₂=8 with UDL w. From three-moment equation:
//   M_B = -w(L₁³ + L₂³) / (8(L₁+L₂))

#[test]
fn validation_hardy_cross_two_span_unequal() {
    let l1 = 4.0;
    let l2 = 8.0;
    let n_per_span = 4;
    let q: f64 = -10.0;
    let w = q.abs();

    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B from three-moment equation for uniform EI:
    // 2M_B(L₁+L₂) = -6[wL₁³/24 + wL₂³/24]
    // M_B = -w(L₁³ + L₂³) / (8(L₁+L₂))
    let m_exact = w * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));

    let ef = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let err = (ef.m_end.abs() - m_exact).abs() / m_exact;
    assert!(err < 0.05,
        "Unequal spans M_B: {:.4}, expected {:.4}", ef.m_end.abs(), m_exact);

    // Equilibrium check: sum of reactions = total load
    let total_load = w * (l1 + l2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err_eq = (sum_ry - total_load).abs() / total_load;
    assert!(err_eq < 0.01,
        "Equilibrium: ΣRy={:.4}, expected wL_total={:.4}", sum_ry, total_load);
}

// ================================================================
// 5. Continuous Beam with Point Load on One Span
// ================================================================
//
// Two equal spans, point load P at midspan of span 1.
// From three-moment equation:
//   M_B = -3PL/32

#[test]
fn validation_hardy_cross_point_load_one_span() {
    let l = 8.0;
    let n_per_span = 4;
    let p = 20.0;

    // Point load at midspan of first span: node (n_per_span/2 + 1)
    let mid_node = n_per_span / 2 + 1;
    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // M_B = 3PL/32 (hogging)
    let m_exact = 3.0 * p * l / 32.0;

    let ef = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let err = (ef.m_end.abs() - m_exact).abs() / m_exact;
    assert!(err < 0.10,
        "Point load M_B: {:.4}, expected 3PL/32={:.4}", ef.m_end.abs(), m_exact);

    // Equilibrium: sum of reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err_eq = (sum_ry - p).abs() / p;
    assert!(err_eq < 0.01,
        "Equilibrium: ΣRy={:.4}, expected P={:.4}", sum_ry, p);
}

// ================================================================
// 6. Pattern Loading: Alternate Spans Loaded
// ================================================================
//
// Three-span beam, UDL on spans 1 and 3 only (checkerboard pattern).
// This maximizes positive moment in spans 1 and 3 and negative moment at supports.

#[test]
fn validation_hardy_cross_pattern_loading() {
    let l = 6.0;
    let n_per_span = 4;
    let q = -10.0;

    // Load only on spans 1 and 3 (elements 1-4 and 9-12)
    let mut loads = Vec::new();
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (2 * n_per_span)..(3 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry of loading (spans 1 and 3 loaded, 2 empty):
    // M₁ = M₂ by the anti-pattern, but we can verify symmetry
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();

    // By the symmetric loading pattern, M₁ = M₂
    let diff = (ef1.m_end.abs() - ef2.m_end.abs()).abs();
    let m_avg = (ef1.m_end.abs() + ef2.m_end.abs()) / 2.0;
    assert!(diff < m_avg * 0.05,
        "Pattern loading symmetry: M₁={:.4}, M₂={:.4}", ef1.m_end.abs(), ef2.m_end.abs());

    // Equilibrium: total reaction = 2 × wL
    let total_load = 2.0 * q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err = (sum_ry - total_load).abs() / total_load;
    assert!(err < 0.01,
        "Pattern loading equilibrium: ΣRy={:.4}, expected 2wL={:.4}", sum_ry, total_load);
}

// ================================================================
// 7. Portal Frame Under Lateral Load
// ================================================================
//
// Portal frame (fixed bases) under lateral load H at beam level.
// By moment distribution / slope-deflection:
//   Column moments depend on relative stiffness of columns and beam.
//   For equal column/beam stiffness (same EI, h=w):
//   M_base = Hh/4, M_top = Hh/4 (for fixed-base portal with rigid beam)
//   For flexible beam, moments redistribute.

#[test]
fn validation_hardy_cross_portal_lateral() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Overturning moment = P × h (minus restoring from vertical reactions)
    // For portal: P × h = M_base_left + M_base_right + (R_right - R_left) × w
    // The equilibrium must hold. Check global moment about base-left:
    // P × h = M_base_left + M_base_right + R_right_y × w
    // (minus R_left_y × 0, plus Rx contributions)

    // Simpler check: horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err_h = (sum_rx + p).abs() / p;
    assert!(err_h < 0.01,
        "Portal ΣRx={:.4}, expected -P={:.4}", sum_rx, -p);

    // Vertical equilibrium (no gravity): ΣRy ≈ 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < p * 0.01,
        "Portal ΣRy={:.6} should be ≈ 0", sum_ry);

    // Moment equilibrium about left base:
    // -P×h + M_left + M_right + Ry_right × w = 0
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let m_eq = -p * h + r_left.my + r_right.my + r_right.rz * w;
    assert!(m_eq.abs() < p * h * 0.01,
        "Portal moment equilibrium residual: {:.6}", m_eq);
}

// ================================================================
// 8. Propped Cantilever: Distribution and Carry-Over
// ================================================================
//
// Fixed-pinned beam with UDL demonstrates carry-over factor = 1/2.
// M_fixed = wL²/8, R_prop = 3wL/8, R_fixed = 5wL/8.

#[test]
fn validation_hardy_cross_propped_cantilever() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let w = q.abs();

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = wL²/8
    let m_exact = w * l * l / 8.0;
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_m = (r_fixed.my.abs() - m_exact).abs() / m_exact;
    assert!(err_m < 0.05,
        "Propped M_fixed: {:.4}, expected wL²/8={:.4}", r_fixed.my.abs(), m_exact);

    // R_prop = 3wL/8
    let r_prop_exact = 3.0 * w * l / 8.0;
    let r_prop = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;
    let err_rp = (r_prop - r_prop_exact).abs() / r_prop_exact;
    assert!(err_rp < 0.05,
        "R_prop={:.4}, expected 3wL/8={:.4}", r_prop, r_prop_exact);

    // R_fixed = 5wL/8
    let r_fixed_exact = 5.0 * w * l / 8.0;
    let err_rf = (r_fixed.rz - r_fixed_exact).abs() / r_fixed_exact;
    assert!(err_rf < 0.05,
        "R_fixed={:.4}, expected 5wL/8={:.4}", r_fixed.rz, r_fixed_exact);
}
