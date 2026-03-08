/// Validation: Extended Reaction Force Checks
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 2-3
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 4
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed., Ch. 4
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 3-5
///
/// Tests verify exact analytical reaction forces for classical beam and frame
/// configurations using static equilibrium and compatibility conditions.
///
/// Tests:
///   1. SS beam with UDL: R_A = R_B = qL/2 (symmetric)
///   2. SS beam with offset point load: R_A = Pb/L, R_B = Pa/L
///   3. Cantilever with tip load: R = P, M = PL
///   4. Fixed-fixed beam UDL: R_A = R_B = qL/2, M_A = M_B = qL^2/12
///   5. Propped cantilever UDL: R_A = 5qL/8, R_B = 3qL/8, M_A = qL^2/8
///   6. Two-span continuous beam UDL: R_A = R_C = 3qL/8, R_B = 10qL/8
///   7. Portal frame gravity: vertical sum = total load, horizontal sum = 0
///   8. Cantilever with distributed load + tip point load: R = P + qL, M = PL + qL^2/2
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply Supported Beam with UDL: R_A = R_B = qL/2
// ================================================================
//
// A uniform beam on two simple supports with a uniformly distributed
// load q (downward). By symmetry both vertical reactions equal qL/2.

#[test]
fn validation_reaction_ss_beam_udl_symmetric() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -12.0; // downward

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r_exact = q.abs() * l / 2.0; // = 60.0

    assert_close(r_a.ry, r_exact, 0.01,
        "SS UDL: R_A = qL/2");
    assert_close(r_b.ry, r_exact, 0.01,
        "SS UDL: R_B = qL/2");

    // Symmetry: R_A = R_B
    assert_close(r_a.ry, r_b.ry, 0.01,
        "SS UDL: R_A = R_B (symmetry)");

    // Total equilibrium
    let total_load = q.abs() * l;
    assert_close(r_a.ry + r_b.ry, total_load, 0.01,
        "SS UDL: R_A + R_B = qL");

    // No horizontal reactions
    assert_close(r_a.rx, 0.0, 0.01, "SS UDL: R_Ax = 0");
}

// ================================================================
// 2. SS Beam with Offset Point Load: R_A = Pb/L, R_B = Pa/L
// ================================================================
//
// Point load P at distance a from A and b = L - a from B.
// By moment equilibrium: R_A = Pb/L, R_B = Pa/L.

#[test]
fn validation_reaction_ss_beam_offset_point_load() {
    let l = 9.0;
    let n = 18;
    let p = 30.0; // downward magnitude
    let a_frac = 1.0 / 3.0; // load at L/3 from left

    let a = a_frac * l; // = 3.0
    let b = l - a;      // = 6.0
    let load_node = (a_frac * n as f64).round() as usize + 1; // node 7

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = Pb/L
    let ra_exact = p * b / l; // = 30 * 6 / 9 = 20
    assert_close(r_a.ry, ra_exact, 0.01,
        "SS offset load: R_A = Pb/L");

    // R_B = Pa/L
    let rb_exact = p * a / l; // = 30 * 3 / 9 = 10
    assert_close(r_b.ry, rb_exact, 0.01,
        "SS offset load: R_B = Pa/L");

    // Total equilibrium
    assert_close(r_a.ry + r_b.ry, p, 0.01,
        "SS offset load: R_A + R_B = P");
}

// ================================================================
// 3. Cantilever with Tip Load: R = P, M = PL
// ================================================================
//
// Fixed at left end, free at right, downward point load P at the tip.
// Reaction at fixed end: Ry = P (upward), Mz = PL (counterclockwise
// for downward load convention).

#[test]
fn validation_reaction_cantilever_tip_load() {
    let l = 6.0;
    let n = 12;
    let p = 25.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = P
    assert_close(r_a.ry, p, 0.01,
        "Cantilever tip: Ry = P");

    // Moment reaction = PL (check absolute value)
    assert_close(r_a.mz.abs(), p * l, 0.01,
        "Cantilever tip: |Mz| = PL");

    // Only one reaction point
    assert_eq!(results.reactions.len(), 1,
        "Cantilever tip: single support reaction");

    // No horizontal reaction
    assert_close(r_a.rx, 0.0, 0.01,
        "Cantilever tip: Rx = 0");
}

// ================================================================
// 4. Fixed-Fixed Beam with UDL: R_A = R_B = qL/2, M_A = M_B = qL^2/12
// ================================================================
//
// Both ends fixed, uniform load q. By symmetry the vertical reactions
// are equal. The fixed-end moments are qL^2/12.

#[test]
fn validation_reaction_fixed_fixed_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r_exact = q.abs() * l / 2.0;  // = 40.0
    let m_exact = q.abs() * l * l / 12.0; // = 53.333...

    // Vertical reactions
    assert_close(r_a.ry, r_exact, 0.02,
        "Fixed-fixed UDL: R_A = qL/2");
    assert_close(r_b.ry, r_exact, 0.02,
        "Fixed-fixed UDL: R_B = qL/2");

    // Symmetry
    assert_close(r_a.ry, r_b.ry, 0.01,
        "Fixed-fixed UDL: R_A = R_B (symmetry)");

    // Fixed-end moments (absolute values)
    assert_close(r_a.mz.abs(), m_exact, 0.02,
        "Fixed-fixed UDL: |M_A| = qL^2/12");
    assert_close(r_b.mz.abs(), m_exact, 0.02,
        "Fixed-fixed UDL: |M_B| = qL^2/12");

    // Moments should be equal in magnitude (symmetry)
    assert_close(r_a.mz.abs(), r_b.mz.abs(), 0.01,
        "Fixed-fixed UDL: |M_A| = |M_B| (symmetry)");

    // Total equilibrium
    let total_load = q.abs() * l;
    assert_close(r_a.ry + r_b.ry, total_load, 0.01,
        "Fixed-fixed UDL: R_A + R_B = qL");
}

// ================================================================
// 5. Propped Cantilever with UDL: R_A = 5qL/8, R_B = 3qL/8, M_A = qL^2/8
// ================================================================
//
// Fixed at A (left), roller at B (right). One degree of indeterminacy.
// Exact analytical values from compatibility method.

#[test]
fn validation_reaction_propped_cantilever_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = 5qL/8
    let ra_exact = 5.0 * q.abs() * l / 8.0; // = 50.0
    assert_close(r_a.ry, ra_exact, 0.02,
        "Propped UDL: R_A = 5qL/8");

    // R_B = 3qL/8
    let rb_exact = 3.0 * q.abs() * l / 8.0; // = 30.0
    assert_close(r_b.ry, rb_exact, 0.02,
        "Propped UDL: R_B = 3qL/8");

    // M_A = qL^2/8
    let ma_exact = q.abs() * l * l / 8.0; // = 80.0
    assert_close(r_a.mz.abs(), ma_exact, 0.02,
        "Propped UDL: |M_A| = qL^2/8");

    // No moment at roller
    assert_close(r_b.mz, 0.0, 0.01,
        "Propped UDL: M_B = 0 (roller)");

    // Total equilibrium
    let total_load = q.abs() * l;
    assert_close(r_a.ry + r_b.ry, total_load, 0.01,
        "Propped UDL: R_A + R_B = qL");
}

// ================================================================
// 6. Two-Span Continuous Beam with UDL:
//    R_A = R_C = 3qL/8, R_B = 10qL/8
// ================================================================
//
// Two equal spans L, each carrying UDL q. By the three-moment equation
// the interior reaction is R_B = 10qL/8 = 5qL/4, and the end reactions
// are each 3qL/8. Total = 2 * 3qL/8 + 10qL/8 = 16qL/8 = 2qL.

#[test]
fn validation_reaction_two_span_continuous_udl() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();

    // End reactions: R_A = R_C = 3qL/8
    let r_end_exact = 3.0 * q.abs() * span / 8.0; // = 22.5
    assert_close(r_a.ry, r_end_exact, 0.02,
        "Two-span UDL: R_A = 3qL/8");
    assert_close(r_c.ry, r_end_exact, 0.02,
        "Two-span UDL: R_C = 3qL/8");

    // Symmetry: R_A = R_C
    assert_close(r_a.ry, r_c.ry, 0.01,
        "Two-span UDL: R_A = R_C (symmetry)");

    // Interior reaction: R_B = 10qL/8 = 5qL/4
    let r_int_exact = 10.0 * q.abs() * span / 8.0; // = 75.0
    assert_close(r_b.ry, r_int_exact, 0.02,
        "Two-span UDL: R_B = 10qL/8");

    // Total equilibrium: R_A + R_B + R_C = 2qL
    let total_load = q.abs() * 2.0 * span;
    let total_reaction = r_a.ry + r_b.ry + r_c.ry;
    assert_close(total_reaction, total_load, 0.01,
        "Two-span UDL: sum R = 2qL");
}

// ================================================================
// 7. Portal Frame Gravity: Vertical Sum = Total, Horizontal Sum = 0
// ================================================================
//
// Rigid portal frame with fixed bases, gravity loads at the two upper
// nodes. By global equilibrium the sum of vertical reactions equals
// the total applied gravity load, and the sum of horizontal reactions
// must be zero (no lateral load applied).

#[test]
fn validation_reaction_portal_frame_gravity() {
    let h = 4.0;
    let w = 6.0;
    let p_gravity = -20.0; // applied at each upper node (nodes 2 and 3)

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, p_gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Supports are at nodes 1 (left base) and 4 (right base)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Total applied gravity = 2 * |p_gravity| (applied at nodes 2 and 3)
    let total_gravity = 2.0 * p_gravity.abs();

    // Sum of vertical reactions = total gravity
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.01,
        "Portal gravity: sum Ry = total gravity load");

    // Sum of horizontal reactions = 0 (no lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.01,
        "Portal gravity: sum Rx = 0");

    // By symmetry, vertical reactions at both bases should be equal
    assert_close(r1.ry, r4.ry, 0.01,
        "Portal gravity: R1_y = R4_y (symmetry)");

    // Each vertical reaction = total_gravity / 2
    assert_close(r1.ry, total_gravity / 2.0, 0.01,
        "Portal gravity: R1_y = total/2");

    // By symmetry, horizontal reactions should be equal and opposite (sum = 0)
    let sum_rx_check: f64 = r1.rx + r4.rx;
    assert_close(sum_rx_check, 0.0, 0.01,
        "Portal gravity: R1_x + R4_x = 0");
}

// ================================================================
// 8. Cantilever with Distributed Load + Tip Point Load
//    R = P + qL, M = PL + qL^2/2
// ================================================================
//
// Superposition: cantilever with UDL q over entire length L plus a
// concentrated tip load P. The fixed-end reaction and moment are the
// sum of the individual cases.

#[test]
fn validation_reaction_cantilever_combined_loading() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;          // tip point load magnitude (downward)
    let q: f64 = -8.0;     // UDL (downward)

    let mut loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    }));

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction: R = P + qL
    let r_exact = p + q.abs() * l; // = 15 + 40 = 55
    assert_close(r_a.ry, r_exact, 0.02,
        "Cantilever combined: Ry = P + qL");

    // Moment reaction: M = PL + qL^2/2
    let m_exact = p * l + q.abs() * l * l / 2.0; // = 75 + 100 = 175
    assert_close(r_a.mz.abs(), m_exact, 0.02,
        "Cantilever combined: |Mz| = PL + qL^2/2");

    // No horizontal reaction
    assert_close(r_a.rx, 0.0, 0.01,
        "Cantilever combined: Rx = 0");

    // Only one reaction point
    assert_eq!(results.reactions.len(), 1,
        "Cantilever combined: single support");
}
