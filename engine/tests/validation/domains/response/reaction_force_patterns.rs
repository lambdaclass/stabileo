/// Validation: Reaction Force Patterns for Classic Structural Configurations
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 2-6
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 3
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9-10
///   - AISC Steel Construction Manual, 15th Ed., Table 3-23
///
/// These tests verify specific reaction force patterns for well-known
/// structural configurations where closed-form solutions exist.
///
/// Tests verify:
///   1. SS beam with asymmetric point load: R_A = P(L-a)/L, R_B = Pa/L
///   2. Cantilever with two point loads: R = P1+P2, M = P1*L/3 + P2*2L/3
///   3. Fixed-fixed beam asymmetric load: R_A = Pb^2(3a+b)/L^3, R_B = Pa^2(a+3b)/L^3
///   4. Propped cantilever center load: R_B = 5P/16, R_A = 11P/16, M_A = 3PL/16
///   5. Two-span beam with one span loaded: uplift at far end
///   6. Roller provides zero horizontal reaction
///   7. Fixed support provides moment reaction with proper signs
///   8. 3-support beam: interior reaction > end reactions
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Asymmetric Point Load
// ================================================================
//
// Simply supported beam with point load P at distance a = L/3 from left.
// By statics: R_A = P*(L-a)/L, R_B = P*a/L
// Reference: Hibbeler, "Structural Analysis", Ch. 2

#[test]
fn validation_ss_beam_asymmetric_point_load() {
    let l = 9.0;
    let n = 18;
    let p = 36.0;
    let a_frac = 1.0 / 3.0; // load at L/3 from left

    let load_node = (a_frac * n as f64).round() as usize + 1; // node 7
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = P*(L-a)/L = P*(1 - 1/3) = 2P/3 = 24
    let r_a_exact = p * (1.0 - a_frac);
    assert_close(r_a.rz, r_a_exact, 0.02, "SS asymmetric: R_A = P*(L-a)/L");

    // R_B = P*a/L = P/3 = 12
    let r_b_exact = p * a_frac;
    assert_close(r_b.rz, r_b_exact, 0.02, "SS asymmetric: R_B = P*a/L");

    // Sum of reactions = P
    assert_close(r_a.rz + r_b.rz, p, 0.02, "SS asymmetric: R_A + R_B = P");
}

// ================================================================
// 2. Cantilever with Two Point Loads
// ================================================================
//
// Cantilever (fixed at left, free at right) with P1 at L/3 and P2 at 2L/3.
// R = P1 + P2, M = P1*(L/3) + P2*(2L/3)
// Reference: Gere & Goodno, "Mechanics of Materials", Ch. 9

#[test]
fn validation_cantilever_two_point_loads() {
    let l = 9.0;
    let n = 18;
    let p1 = 15.0;
    let p2 = 25.0;

    let node_1 = (n as f64 / 3.0).round() as usize + 1; // node at L/3
    let node_2 = (2.0 * n as f64 / 3.0).round() as usize + 1; // node at 2L/3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1, fx: 0.0, fz: -p1, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2, fx: 0.0, fz: -p2, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = P1 + P2
    assert_close(r.rz, p1 + p2, 0.02, "Cantilever 2P: Ry = P1 + P2");

    // Moment reaction = P1*(L/3) + P2*(2L/3)
    // The fixed end must resist the moment caused by both loads
    let m_expected = p1 * (l / 3.0) + p2 * (2.0 * l / 3.0);
    assert_close(r.my.abs(), m_expected, 0.02, "Cantilever 2P: M = P1*L/3 + P2*2L/3");

    // No horizontal load, so Rx = 0
    assert_close(r.rx, 0.0, 0.02, "Cantilever 2P: Rx = 0");
}

// ================================================================
// 3. Fixed-Fixed Beam Asymmetric Load Reactions
// ================================================================
//
// Point load P at L/4 from left (a = L/4, b = 3L/4).
// R_A = P*b^2*(3a+b)/L^3, R_B = P*a^2*(a+3b)/L^3
// Reference: AISC Table 3-23 Case 5; Kassimali Ch. 15

#[test]
fn validation_fixed_fixed_asymmetric_load() {
    let l = 8.0;
    let n = 16;
    let p = 32.0;

    let a = l / 4.0; // 2.0
    let b = 3.0 * l / 4.0; // 6.0
    let load_node = (n as f64 / 4.0).round() as usize + 1; // node at L/4

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = P*b^2*(3a+b)/L^3 = P*b^2*(L+2a)/L^3
    let r_a_exact = p * b * b * (3.0 * a + b) / l.powi(3);
    assert_close(r_a.rz, r_a_exact, 0.02, "Fixed-fixed asym: R_A = Pb^2(3a+b)/L^3");

    // R_B = P*a^2*(a+3b)/L^3 = P*a^2*(L+2b)/L^3
    let r_b_exact = p * a * a * (a + 3.0 * b) / l.powi(3);
    assert_close(r_b.rz, r_b_exact, 0.02, "Fixed-fixed asym: R_B = Pa^2(a+3b)/L^3");

    // Equilibrium check
    assert_close(r_a.rz + r_b.rz, p, 0.02, "Fixed-fixed asym: R_A + R_B = P");

    // R_A > R_B since load is closer to left
    assert!(r_a.rz > r_b.rz, "Fixed-fixed asym: R_A > R_B (load closer to A)");
}

// ================================================================
// 4. Propped Cantilever Point Load at Center
// ================================================================
//
// Fixed at A (left), roller at B (right), P at midspan.
// R_B = 5P/16, R_A = 11P/16, M_A = 3PL/16
// Reference: Gere & Goodno Ch. 9; Hibbeler Ch. 10

#[test]
fn validation_propped_cantilever_center_load() {
    let l = 8.0;
    let n = 16;
    let p = 32.0;

    let mid = n / 2 + 1; // midspan node
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 5P/16
    assert_close(r_b.rz, 5.0 * p / 16.0, 0.02, "Propped center: R_B = 5P/16");

    // R_A = 11P/16
    assert_close(r_a.rz, 11.0 * p / 16.0, 0.02, "Propped center: R_A = 11P/16");

    // M_A = 3PL/16
    assert_close(r_a.my.abs(), 3.0 * p * l / 16.0, 0.02, "Propped center: M_A = 3PL/16");

    // Equilibrium: R_A + R_B = P
    assert_close(r_a.rz + r_b.rz, p, 0.02, "Propped center: R_A + R_B = P");
}

// ================================================================
// 5. Two-Span Beam: Only One Span Loaded
// ================================================================
//
// 2-span continuous beam (pinned-rollerX-rollerX), UDL on span 1 only.
// Total Ry = q*L1. Far support (C) experiences uplift (R_C < 0).
// Reference: Kassimali Ch. 13; three-moment equation

#[test]
fn validation_two_span_one_loaded_uplift() {
    let l1 = 8.0;
    let l2 = 8.0;
    let n_per_span = 10;
    let q: f64 = -12.0; // downward on span 1

    // UDL only on span 1 (elements 1 through n_per_span)
    let loads: Vec<SolverLoad> = (1..=n_per_span)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();

    // Total vertical reaction = total load on span 1 = q_abs * L1
    let total_load = q.abs() * l1;
    let sum_ry = r_a.rz + r_b.rz + r_c.rz;
    assert_close(sum_ry, total_load, 0.02, "2-span loaded: total Ry = q*L1");

    // Far support C experiences uplift (negative reaction = downward)
    assert!(r_c.rz < 0.0,
        "2-span loaded: R_C < 0 (uplift at far end), got R_C = {:.4}", r_c.rz);

    // Support B carries the most since it is adjacent to the loaded span
    assert!(r_b.rz > r_a.rz,
        "2-span loaded: R_B > R_A, got R_B={:.4}, R_A={:.4}", r_b.rz, r_a.rz);
}

// ================================================================
// 6. Roller Provides Zero Horizontal Reaction
// ================================================================
//
// SS beam (pinned + rollerX) with pure vertical load.
// Roller cannot resist horizontal force, so rx = 0 at both supports.
// Reference: Hibbeler Ch. 2

#[test]
fn validation_roller_zero_horizontal_reaction() {
    let l = 10.0;
    let n = 10;
    let p = 50.0;

    // Vertical load at midspan
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_pin = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Both horizontal reactions should be zero (no horizontal load applied)
    assert_close(r_pin.rx, 0.0, 0.02, "Roller: Rx_pinned = 0");
    assert_close(r_roller.rx, 0.0, 0.02, "Roller: Rx_roller = 0");

    // Moment reactions should be zero (both are pins/rollers)
    assert_close(r_pin.my, 0.0, 0.02, "Roller: Mz_pinned = 0");
    assert_close(r_roller.my, 0.0, 0.02, "Roller: Mz_roller = 0");

    // Vertical reactions should each be P/2 by symmetry
    assert_close(r_pin.rz, p / 2.0, 0.02, "Roller: Ry_pinned = P/2");
    assert_close(r_roller.rz, p / 2.0, 0.02, "Roller: Ry_roller = P/2");
}

// ================================================================
// 7. Fixed Support Provides Moment Reaction
// ================================================================
//
// Fixed-fixed beam with eccentric point load. Both fixed supports
// develop moment reactions. The moments are nonzero and have
// opposite signs (one clockwise, one counterclockwise).
// Reference: AISC Table 3-23 Case 5

#[test]
fn validation_fixed_support_moment_reaction() {
    let l = 12.0;
    let n = 12;
    let p = 24.0;

    // Eccentric load at L/4 from left
    let load_node = n / 4 + 1; // node at L/4
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Both moment reactions must be nonzero
    assert!(r_a.my.abs() > 1.0,
        "Fixed moment: M_A nonzero, got {:.4}", r_a.my);
    assert!(r_b.my.abs() > 1.0,
        "Fixed moment: M_B nonzero, got {:.4}", r_b.my);

    // Moment reactions should have opposite signs
    // (one end hogging, other end sagging in the global sense)
    assert!(r_a.my * r_b.my < 0.0,
        "Fixed moment: M_A and M_B have opposite signs, got M_A={:.4}, M_B={:.4}",
        r_a.my, r_b.my);

    // The moment at the end closer to the load (A) should be larger in magnitude
    let a = l / 4.0;
    let b = 3.0 * l / 4.0;
    let m_a_exact = p * a * b * b / (l * l); // Pab^2/L^2
    let m_b_exact = p * a * a * b / (l * l); // Pa^2b/L^2
    assert_close(r_a.my.abs(), m_a_exact, 0.05,
        "Fixed moment: |M_A| = Pab^2/L^2");
    assert_close(r_b.my.abs(), m_b_exact, 0.05,
        "Fixed moment: |M_B| = Pa^2b/L^2");
    assert!(r_a.my.abs() > r_b.my.abs(),
        "Fixed moment: |M_A| > |M_B| (load closer to A)");
}

// ================================================================
// 8. 3-Support Beam: Interior Reaction > End Reactions
// ================================================================
//
// Equal 2-span continuous beam with UDL on both spans.
// Interior R_B = 10qL/8 = 5qL/4, end R_A = R_C = 3qL/8.
// R_B > R_A (and R_B > R_C).
// Reference: Kassimali Ch. 13; three-moment equation

#[test]
fn validation_three_support_interior_gt_end() {
    let span = 8.0;
    let n_per_span = 10;
    let q: f64 = -10.0;

    // UDL on both spans
    let loads: Vec<SolverLoad> = (1..=(2 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();

    // End reactions: R_A = R_C = 3qL/8
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    assert_close(r_a.rz, r_end_exact, 0.05,
        "3-support: R_A = 3qL/8");
    assert_close(r_c.rz, r_end_exact, 0.05,
        "3-support: R_C = 3qL/8");

    // Interior reaction: R_B = 10qL/8 = 5qL/4
    let r_int_exact = 10.0 * q.abs() * span / 8.0;
    assert_close(r_b.rz, r_int_exact, 0.05,
        "3-support: R_B = 10qL/8");

    // Interior reaction > end reactions
    assert!(r_b.rz > r_a.rz,
        "3-support: R_B ({:.4}) > R_A ({:.4})", r_b.rz, r_a.rz);
    assert!(r_b.rz > r_c.rz,
        "3-support: R_B ({:.4}) > R_C ({:.4})", r_b.rz, r_c.rz);

    // Symmetry: R_A = R_C
    assert_close(r_a.rz, r_c.rz, 0.02,
        "3-support: R_A = R_C (symmetry)");

    // Total equilibrium: R_A + R_B + R_C = q * 2L
    let total_load = q.abs() * 2.0 * span;
    let sum_ry = r_a.rz + r_b.rz + r_c.rz;
    assert_close(sum_ry, total_load, 0.02,
        "3-support: total Ry = q * 2L");
}
