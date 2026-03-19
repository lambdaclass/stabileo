/// Validation: Moment Redistribution in Indeterminate Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///   - Ghali, Neville & Brown, "Structural Analysis", 6th Ed., Ch. 10-11
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed.
///   - Cross, H., "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///
/// Tests verify how moments redistribute when stiffness ratios change:
///   1. Fixed-fixed beam UDL: end moment = qL²/12, midspan = qL²/24
///   2. Continuous two-span beam: interior support moment
///   3. Propped cantilever moment ratios: M_fixed = wL²/8
///   4. Adding an intermediate support changes moment diagram
///   5. Relative stiffness effect on two-span moment distribution
///   6. Fixed vs pinned far end: moment redistribution
///   7. Symmetric three-span continuous beam moment pattern
///   8. Fixed-fixed vs propped cantilever: carry-over factor effect
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam UDL: End and Midspan Moments
// ================================================================
//
// Fixed-fixed beam, UDL q, span L.
// FEM at each end (hogging): M_end = qL²/12
// Midspan moment (sagging): M_mid = qL²/24
// Ref: Hibbeler, "Structural Analysis" Table 12-1

#[test]
fn validation_redistrib_fixed_fixed_udl_moments() {
    let l = 6.0;
    let n = 12;
    let q = -10.0; // kN/m downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let w = q.abs();

    // End moment = qL²/12
    let m_end_exact = w * l * l / 12.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.my.abs(), m_end_exact, 0.02,
        "Fixed-fixed end moment = qL²/12");
    assert_close(r_end.my.abs(), m_end_exact, 0.02,
        "Fixed-fixed far end moment = qL²/12");

    // Midspan moment from element forces at center element
    // M_mid = qL²/24 (sagging, positive convention)
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    let m_mid_exact = w * l * l / 24.0;
    // midspan moment can be read at end of element n/2 (which is at x=L/2)
    assert_close(ef_mid.m_end.abs(), m_mid_exact, 0.05,
        "Fixed-fixed midspan moment = qL²/24");
}

// ================================================================
// 2. Two-Span Continuous Beam: Interior Support Moment
// ================================================================
//
// Two equal spans, UDL q, pinned ends, pinned at interior.
// By three-moment equation: M_B = qL²/8
// Ref: Ghali & Neville, "Structural Analysis", Three-Moment Equation

#[test]
fn validation_redistrib_two_span_interior_moment() {
    let l = 8.0;
    let n_per_span = 8;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment: M_B = wL²/8
    let m_b_exact = q.abs() * l * l / 8.0;
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_at_b.m_end.abs(), m_b_exact, 0.02,
        "Two-span interior moment = wL²/8");

    // End reactions: R_A = R_C = 3wL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz, 3.0 * q.abs() * l / 8.0, 0.02,
        "Two-span end reaction = 3wL/8");
}

// ================================================================
// 3. Propped Cantilever Moment Ratios
// ================================================================
//
// Fixed at A, rollerX at B, UDL q.
// M_A = wL²/8, R_B = 3wL/8, R_A = 5wL/8
// Ref: McCormac & Nelson, "Structural Analysis", propped cantilever table

#[test]
fn validation_redistrib_propped_cantilever_ratios() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -12.0;
    let w = q.abs();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M_A = wL²/8
    let m_exact = w * l * l / 8.0;
    assert_close(r_a.my.abs(), m_exact, 0.02,
        "Propped cantilever M_A = wL²/8");

    // R_A = 5wL/8, R_B = 3wL/8
    assert_close(r_a.rz, 5.0 * w * l / 8.0, 0.02,
        "Propped cantilever R_A = 5wL/8");
    assert_close(r_b.rz, 3.0 * w * l / 8.0, 0.02,
        "Propped cantilever R_B = 3wL/8");
}

// ================================================================
// 4. Adding an Intermediate Support Changes Moment Diagram
// ================================================================
//
// Simply-supported beam without interior support: zero interior moment.
// Adding a mid-span support (making it two-span) introduces hogging.
// Ref: Ghali & Neville, effect of support conditions on moment distribution

#[test]
fn validation_redistrib_adding_support_changes_diagram() {
    let l_total = 10.0;
    let n = 10;
    let q = -10.0;

    // Case 1: Single span simply supported
    let loads_ss: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ss = make_beam(n, l_total, E, A, IZ, "pinned", Some("rollerX"), loads_ss);
    let res_ss = linear::solve_2d(&input_ss).unwrap();

    // For SS beam, moment at midspan is maximum and each end is zero
    let r1_ss = res_ss.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1_ss.my.abs() < 1e-3,
        "SS beam: no fixed-end moment: mz={:.6e}", r1_ss.my);

    // Case 2: With interior support at midspan (two spans of L/2)
    let l_half = l_total / 2.0;
    let n_per_half = n / 2;
    let loads_2span: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_2span = make_continuous_beam(&[l_half, l_half], n_per_half, E, A, IZ, loads_2span);
    let res_2span = linear::solve_2d(&input_2span).unwrap();

    // Two-span: interior moment M_B = wL_half²/8
    let m_b_2span = q.abs() * l_half * l_half / 8.0;
    let ef_at_mid = res_2span.element_forces.iter()
        .find(|ef| ef.element_id == n_per_half).unwrap();
    assert_close(ef_at_mid.m_end.abs(), m_b_2span, 0.05,
        "Two-span with added support: interior moment = wL_half²/8");

    // The interior support reaction should be non-zero
    let r_mid = res_2span.reactions.iter().find(|r| r.node_id == n_per_half + 1).unwrap();
    assert!(r_mid.rz > q.abs() * l_total * 0.5,
        "Added interior support carries more than half load: R_mid={:.4}", r_mid.rz);
}

// ================================================================
// 5. Relative Stiffness Effect: Two-Span Unequal
// ================================================================
//
// Two spans L1 and L2. Stiffer (shorter) span attracts more moment.
// The ratio M_B(span1) / M_B(span2) reflects stiffness ratio I/L.
// Ref: Cross (1930), Hardy Cross moment distribution method

#[test]
fn validation_redistrib_stiffness_ratio_effect() {
    let l_short = 4.0;
    let l_long = 8.0;
    let n_per_span = 8;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l_short, l_long], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Three-moment equation gives M_B = w(L1³ + L2³) / (8(L1+L2))
    let w = q.abs();
    let m_exact = w * (l_short.powi(3) + l_long.powi(3)) / (8.0 * (l_short + l_long));
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_at_b.m_end.abs(), m_exact, 0.03,
        "Unequal spans: three-moment equation M_B");

    // The end reactions: shorter span end < longer span end
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    // Shorter span end carries less load (less area under its moment diagram)
    assert!(r_a.rz < r_c.rz,
        "Shorter span end reaction < longer span end: Ra={:.4}, Rc={:.4}", r_a.rz, r_c.rz);
}

// ================================================================
// 6. Fixed vs Pinned Far End: Moment Redistribution
// ================================================================
//
// Beam fixed at A, UDL q.
// Case 1: Pinned at B → M_A = wL²/8 (propped cantilever)
// Case 2: Fixed at B  → M_A = M_B = wL²/12 (fixed-fixed)
// Fixing B reduces M_A from wL²/8 to wL²/12 (redistribution).
// Ref: Hibbeler, Table 12-1

#[test]
fn validation_redistrib_fixed_vs_pinned_far_end() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let w = q.abs();

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Propped cantilever (fixed-pinned)
    let input_fp = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads.clone());
    let res_fp = linear::solve_2d(&input_fp).unwrap();
    let m_a_propped = res_fp.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();

    // Fixed-fixed
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let res_ff = linear::solve_2d(&input_ff).unwrap();
    let m_a_fixed = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap().my.abs();

    // Expected values
    let m_propped_exact = w * l * l / 8.0;   // = 80
    let m_fixed_exact   = w * l * l / 12.0;  // = 53.33

    assert_close(m_a_propped, m_propped_exact, 0.02,
        "Propped cantilever M_A = wL²/8");
    assert_close(m_a_fixed, m_fixed_exact, 0.02,
        "Fixed-fixed M_A = wL²/12");

    // Fixing far end redistributes moment: M_A decreases
    assert!(m_a_fixed < m_a_propped,
        "Adding far-end fixity reduces M_A: fixed={:.4}, propped={:.4}",
        m_a_fixed, m_a_propped);

    // Ratio should be approximately 2/3
    let ratio = m_a_fixed / m_a_propped;
    assert_close(ratio, 2.0 / 3.0, 0.02,
        "M_A ratio fixed/propped = 2/3");
}

// ================================================================
// 7. Symmetric Three-Span Continuous Beam: Moment Pattern
// ================================================================
//
// Three equal spans L, UDL w on all spans. By symmetry:
//   M_B = M_C = wL²/10, R_A = R_D = 0.4wL, R_B = R_C = 1.1wL
// Ref: Norris, Wilbur & Utku, Table 14.3

#[test]
fn validation_redistrib_three_span_symmetric_pattern() {
    let l = 6.0;
    let n_per_span = 6;
    let q: f64 = -12.0;
    let w = q.abs();

    let loads: Vec<SolverLoad> = (1..=(3 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments: M_B = M_C = wL²/10
    let m_interior = w * l * l / 10.0;
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let ef_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span).unwrap();

    assert_close(ef_b.m_end.abs(), m_interior, 0.02,
        "Three-span M_B = wL²/10");
    assert_close(ef_c.m_end.abs(), m_interior, 0.02,
        "Three-span M_C = wL²/10");

    // Symmetry: M_B = M_C
    assert_close(ef_b.m_end.abs(), ef_c.m_end.abs(), 0.005,
        "Three-span symmetry: M_B = M_C");

    // Reactions: R_A = R_D = 0.4wL
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_a.rz, 0.4 * w * l, 0.02, "Three-span R_A = 0.4wL");
    assert_close(r_d.rz, 0.4 * w * l, 0.02, "Three-span R_D = 0.4wL");

    // R_B = R_C = 1.1wL
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_b.rz, 1.1 * w * l, 0.02, "Three-span R_B = 1.1wL");
    assert_close(r_c.rz, 1.1 * w * l, 0.02, "Three-span R_C = 1.1wL");
}

// ================================================================
// 8. Carry-Over Factor: Element End-Moment Ratio for Fixed Far End
// ================================================================
//
// For a prismatic beam AB fixed at both ends, when the near-end moment is M_near,
// the far-end moment (carry-over) is M_far = M_near/2 (carry-over factor = 0.5).
// This holds when no rotation occurs at far end.
//
// Demonstration: fixed-pinned beam vs fixed-fixed beam both under UDL.
// Fixed-fixed: M_A = M_B = qL²/12 (both ends equal — no carry-over imbalance).
// Fixed-pinned (propped cantilever): M_A = qL²/8, M_B = 0.
// The ratio M_A(propped)/M_A(fixed) = (qL²/8)/(qL²/12) = 3/2, consistent with
// stiffness factor ratio 3EI/L vs 4EI/L = 3/4 (and moment builds up differently).
//
// Ref: Cross (1930), Hardy Cross moment distribution method;
//      McCormac & Nelson, "Structural Analysis", Ch. 12

#[test]
fn validation_redistrib_carry_over_factor() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let make_loads = |n_elems: usize| -> Vec<SolverLoad> {
        (1..=n_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect()
    };

    // Fixed-fixed beam
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), make_loads(n));
    let res_ff = linear::solve_2d(&input_ff).unwrap();
    let r1_ff = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Propped cantilever (fixed-pinned)
    let input_fp = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), make_loads(n));
    let res_fp = linear::solve_2d(&input_fp).unwrap();
    let r1_fp = res_fp.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let w = q.abs();

    // Fixed-fixed: M_A = qL²/12
    let m_ff_exact = w * l * l / 12.0;
    assert_close(r1_ff.my.abs(), m_ff_exact, 0.02,
        "Fixed-fixed M_A = qL²/12");

    // Propped cantilever: M_A = qL²/8
    let m_fp_exact = w * l * l / 8.0;
    assert_close(r1_fp.my.abs(), m_fp_exact, 0.02,
        "Propped cantilever M_A = qL²/8");

    // Ratio M_fp/M_ff = (qL²/8) / (qL²/12) = 3/2
    // This reflects that fixing far end (adding carry-over back) reduces near-end moment
    let ratio = r1_fp.my.abs() / r1_ff.my.abs();
    assert_close(ratio, 3.0 / 2.0, 0.02,
        "Carry-over effect: M_propped/M_fixed = 3/2");

    // Also verify: the carry-over from fixed-fixed endpoint (m_end of last element)
    // For fixed-fixed: both ends carry qL²/12 (equal), element forces confirm
    let ef_last = res_ff.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert_close(ef_last.m_end.abs(), m_ff_exact, 0.02,
        "Fixed-fixed far-end moment = qL²/12");
}
