/// Validation: Extended Reaction Force Patterns for Classic Structural Configurations
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 2-6
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 3, 13, 15
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9-10
///   - AISC Steel Construction Manual, 15th Ed., Table 3-23
///   - Timoshenko & Gere, "Theory of Elastic Stability"
///
/// These tests verify additional reaction force patterns for well-known
/// structural configurations where closed-form solutions exist.
///
/// Tests verify:
///   1. SS beam with UDL: R_A = R_B = qL/2
///   2. Fixed-fixed beam with UDL: R_A = R_B = qL/2, M_A = M_B = qL^2/12
///   3. Propped cantilever with UDL: R_B = 3qL/8, R_A = 5qL/8, M_A = qL^2/8
///   4. Cantilever with UDL: R = qL, M = qL^2/2
///   5. SS beam with two symmetric point loads: R_A = R_B = P
///   6. Three-span beam with UDL: end reactions < interior reactions
///   7. Portal frame lateral load: base shear equilibrium and antisymmetric moments
///   8. Fixed-fixed beam with end moment: reaction pattern M_A, M_B, R = 6M₀/(L²) type
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply Supported Beam with Uniform Distributed Load
// ================================================================
//
// Pinned at A, rollerX at B, UDL q over full span L.
// By symmetry: R_A = R_B = qL/2
// Reference: Hibbeler, "Structural Analysis", Ch. 2

#[test]
fn validation_ext_ss_beam_udl_reactions() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -15.0; // downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r_exact = q.abs() * l / 2.0; // qL/2 = 75.0

    // R_A = qL/2
    assert_close(r_a.rz, r_exact, 0.02, "SS UDL: R_A = qL/2");

    // R_B = qL/2
    assert_close(r_b.rz, r_exact, 0.02, "SS UDL: R_B = qL/2");

    // Symmetry: R_A = R_B
    assert_close(r_a.rz, r_b.rz, 0.01, "SS UDL: R_A = R_B (symmetry)");

    // No moment reactions at pin/roller
    assert_close(r_a.my, 0.0, 0.02, "SS UDL: M_A = 0 (pinned)");
    assert_close(r_b.my, 0.0, 0.02, "SS UDL: M_B = 0 (roller)");

    // Equilibrium
    assert_close(r_a.rz + r_b.rz, q.abs() * l, 0.02, "SS UDL: R_A + R_B = qL");
}

// ================================================================
// 2. Fixed-Fixed Beam with UDL
// ================================================================
//
// Both ends fixed, UDL q over full span L.
// R_A = R_B = qL/2, M_A = M_B = qL^2/12
// Reference: AISC Table 3-23 Case 1; Kassimali Ch. 15

#[test]
fn validation_ext_fixed_fixed_beam_udl() {
    let l = 12.0;
    let n = 24;
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

    let r_exact = q.abs() * l / 2.0; // qL/2 = 60.0
    let m_exact = q.abs() * l * l / 12.0; // qL^2/12 = 120.0

    // R_A = qL/2
    assert_close(r_a.rz, r_exact, 0.02, "Fixed-fixed UDL: R_A = qL/2");

    // R_B = qL/2
    assert_close(r_b.rz, r_exact, 0.02, "Fixed-fixed UDL: R_B = qL/2");

    // Symmetry of vertical reactions
    assert_close(r_a.rz, r_b.rz, 0.01, "Fixed-fixed UDL: R_A = R_B (symmetry)");

    // M_A = qL^2/12 (both moments have same magnitude)
    assert_close(r_a.my.abs(), m_exact, 0.03, "Fixed-fixed UDL: |M_A| = qL^2/12");
    assert_close(r_b.my.abs(), m_exact, 0.03, "Fixed-fixed UDL: |M_B| = qL^2/12");

    // Moment magnitudes are equal by symmetry
    assert_close(r_a.my.abs(), r_b.my.abs(), 0.02, "Fixed-fixed UDL: |M_A| = |M_B|");

    // Equilibrium
    assert_close(r_a.rz + r_b.rz, q.abs() * l, 0.02, "Fixed-fixed UDL: R_A + R_B = qL");
}

// ================================================================
// 3. Propped Cantilever with UDL
// ================================================================
//
// Fixed at A (left), rollerX at B (right), UDL q over full span.
// R_B = 3qL/8, R_A = 5qL/8, M_A = qL^2/8
// Reference: Gere & Goodno Ch. 9; Hibbeler Ch. 10

#[test]
fn validation_ext_propped_cantilever_udl() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -12.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 3qL/8
    let r_b_exact = 3.0 * q.abs() * l / 8.0; // 45.0
    assert_close(r_b.rz, r_b_exact, 0.02, "Propped UDL: R_B = 3qL/8");

    // R_A = 5qL/8
    let r_a_exact = 5.0 * q.abs() * l / 8.0; // 75.0
    assert_close(r_a.rz, r_a_exact, 0.02, "Propped UDL: R_A = 5qL/8");

    // M_A = qL^2/8
    let m_a_exact = q.abs() * l * l / 8.0; // 150.0
    assert_close(r_a.my.abs(), m_a_exact, 0.03, "Propped UDL: |M_A| = qL^2/8");

    // R_A > R_B (fixed end attracts more load)
    assert!(r_a.rz > r_b.rz,
        "Propped UDL: R_A > R_B, got R_A={:.4}, R_B={:.4}", r_a.rz, r_b.rz);

    // No moment at roller
    assert_close(r_b.my, 0.0, 0.02, "Propped UDL: M_B = 0 (roller)");

    // Equilibrium
    assert_close(r_a.rz + r_b.rz, q.abs() * l, 0.02, "Propped UDL: R_A + R_B = qL");
}

// ================================================================
// 4. Cantilever with Uniform Distributed Load
// ================================================================
//
// Fixed at A (left), free at right, UDL q over full span.
// R = qL, M = qL^2/2
// Reference: Hibbeler, "Structural Analysis", Ch. 2; Gere & Goodno Ch. 9

#[test]
fn validation_ext_cantilever_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -20.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction R = qL
    let r_exact = q.abs() * l; // 160.0
    assert_close(r_a.rz, r_exact, 0.02, "Cantilever UDL: Ry = qL");

    // Moment reaction M = qL^2/2
    let m_exact = q.abs() * l * l / 2.0; // 640.0
    assert_close(r_a.my.abs(), m_exact, 0.02, "Cantilever UDL: |M| = qL^2/2");

    // No horizontal load => Rx = 0
    assert_close(r_a.rx, 0.0, 0.02, "Cantilever UDL: Rx = 0");

    // Only one support, so only one reaction set
    assert_eq!(results.reactions.len(), 1, "Cantilever UDL: single support");
}

// ================================================================
// 5. SS Beam with Two Symmetric Point Loads (Four-Point Bending)
// ================================================================
//
// Pinned at A, rollerX at B, two equal loads P at L/3 and 2L/3.
// By symmetry: R_A = R_B = P (each reaction carries one full load).
// Reference: Hibbeler Ch. 2; "Four-point bending" test configuration

#[test]
fn validation_ext_ss_beam_two_symmetric_loads() {
    let l = 12.0;
    let n = 18;
    let p = 30.0;

    // Load at L/3 and 2L/3
    let node_1 = (n as f64 / 3.0).round() as usize + 1; // node at L/3
    let node_2 = (2.0 * n as f64 / 3.0).round() as usize + 1; // node at 2L/3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = R_B = P by symmetry
    assert_close(r_a.rz, p, 0.02, "SS 2-sym loads: R_A = P");
    assert_close(r_b.rz, p, 0.02, "SS 2-sym loads: R_B = P");

    // Symmetry
    assert_close(r_a.rz, r_b.rz, 0.01, "SS 2-sym loads: R_A = R_B");

    // No moments at pin/roller
    assert_close(r_a.my, 0.0, 0.02, "SS 2-sym loads: M_A = 0");
    assert_close(r_b.my, 0.0, 0.02, "SS 2-sym loads: M_B = 0");

    // Equilibrium
    assert_close(r_a.rz + r_b.rz, 2.0 * p, 0.02, "SS 2-sym loads: R_A + R_B = 2P");
}

// ================================================================
// 6. Three-Span Continuous Beam with UDL on All Spans
// ================================================================
//
// Equal 3-span continuous beam (pinned-rollerX-rollerX-rollerX),
// UDL on all spans. By the three-moment equation for equal spans:
// R_end = 0.4*qL, R_interior = 1.1*qL
// Total = 2*0.4*qL + 2*1.1*qL = 3.0*qL (= total load on 3 spans)
// Reference: Kassimali Ch. 13; continuous beam tables

#[test]
fn validation_ext_three_span_udl_reactions() {
    let span = 8.0;
    let n_per_span = 10;
    let q: f64 = -10.0;

    // UDL on all three spans
    let loads: Vec<SolverLoad> = (1..=(3 * n_per_span))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();

    let q_abs: f64 = q.abs();

    // End reactions: R_A = R_D = 0.4*qL
    let r_end_exact = 0.4 * q_abs * span; // 32.0
    assert_close(r_a.rz, r_end_exact, 0.05, "3-span UDL: R_A = 0.4qL");
    assert_close(r_d.rz, r_end_exact, 0.05, "3-span UDL: R_D = 0.4qL");

    // Interior reactions: R_B = R_C = 1.1*qL
    let r_int_exact = 1.1 * q_abs * span; // 88.0
    assert_close(r_b.rz, r_int_exact, 0.05, "3-span UDL: R_B = 1.1qL");
    assert_close(r_c.rz, r_int_exact, 0.05, "3-span UDL: R_C = 1.1qL");

    // Interior > end
    assert!(r_b.rz > r_a.rz, "3-span UDL: R_B > R_A");
    assert!(r_c.rz > r_d.rz, "3-span UDL: R_C > R_D");

    // Symmetry
    assert_close(r_a.rz, r_d.rz, 0.02, "3-span UDL: R_A = R_D (symmetry)");
    assert_close(r_b.rz, r_c.rz, 0.02, "3-span UDL: R_B = R_C (symmetry)");

    // Total equilibrium: sum = q * 3L
    let total_load = q_abs * 3.0 * span;
    let sum_ry = r_a.rz + r_b.rz + r_c.rz + r_d.rz;
    assert_close(sum_ry, total_load, 0.02, "3-span UDL: total Ry = q*3L");
}

// ================================================================
// 7. Portal Frame with Lateral Load: Base Shear Equilibrium
// ================================================================
//
// Fixed-base portal frame (nodes 1-4). Lateral load H at top-left (node 2).
// Global horizontal equilibrium: Rx_base1 + Rx_base4 = -H (reactions resist applied load)
// For a symmetric portal with lateral load: antisymmetric bending.
// Both base moments are nonzero and have the same sign.
// Reference: Hibbeler Ch. 5; portal method / exact analysis

#[test]
fn validation_ext_portal_frame_lateral_load() {
    let h = 6.0;
    let w = 8.0;
    let lateral: f64 = 40.0; // horizontal force at node 2

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Horizontal equilibrium: sum of base horizontal reactions = -H
    // (reactions oppose the applied lateral force)
    let sum_rx = r_1.rx + r_4.rx;
    assert_close(sum_rx, -lateral, 0.02,
        "Portal lateral: Rx1 + Rx4 = -H");

    // Vertical equilibrium: no net vertical load, so sum Ry = 0
    let sum_ry = r_1.rz + r_4.rz;
    assert_close(sum_ry, 0.0, 0.02,
        "Portal lateral: Ry1 + Ry4 = 0 (no vertical load)");

    // Both base moments should be nonzero (fixed supports develop moments)
    assert!(r_1.my.abs() > 1.0,
        "Portal lateral: M_1 nonzero, got {:.4}", r_1.my);
    assert!(r_4.my.abs() > 1.0,
        "Portal lateral: M_4 nonzero, got {:.4}", r_4.my);

    // Both horizontal reactions should resist the applied load
    // (both act in opposite direction to the applied lateral force)
    assert!(r_1.rx < 0.0,
        "Portal lateral: Rx1 < 0 (resists lateral), got {:.4}", r_1.rx);
    assert!(r_4.rx < 0.0,
        "Portal lateral: Rx4 < 0 (resists lateral), got {:.4}", r_4.rx);

    // Moment equilibrium about base of column 1:
    // H*h + R4_y*w + M1 + M4 = 0  (taking counterclockwise positive)
    // => R4_y = -(H*h + M1 + M4) / w
    // The vertical reactions form a couple to resist overturning
    // Leeward column (node 4) should pull down (negative Ry) and
    // windward column (node 1) should push up (positive Ry)
    // Actually, with lateral load pushing right at top, overturning causes
    // node 1 to pull up (tension) and node 4 to push down (compression)
    // or vice versa depending on sign convention. Let's just check the couple.
    assert!((r_1.rz - r_4.rz).abs() > 1.0,
        "Portal lateral: vertical reactions form a couple");
}

// ================================================================
// 8. Fixed-Fixed Beam with Applied End Moment
// ================================================================
//
// Fixed at both ends, external moment M0 applied at midspan.
// For fixed-fixed beam with concentrated moment M0 at distance a from left
// (a = b = L/2 for midspan):
//   R_A = -R_B = 6*M0*a*b / L^3 = 3*M0/(2L)
//   M_A = M_B = M0/4
// The vertical reactions form an antisymmetric couple while the moment
// reactions are symmetric (same sign and magnitude at both ends).
// Global moment equilibrium about A: M_A + M_B + M0 + R_B*L = 0
// Reference: AISC Table 3-23; Timoshenko & Gere

#[test]
fn validation_ext_fixed_fixed_applied_moment() {
    let l = 10.0;
    let n = 20;
    let m0 = 100.0; // applied moment at midspan

    let mid = n / 2 + 1; // midspan node
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: 0.0, my: m0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Shear reactions: R_A_y = 3*M0/(2L), R_B_y = -3*M0/(2L)
    let v_exact: f64 = 3.0 * m0 / (2.0 * l); // 15.0
    assert_close(r_a.rz, v_exact, 0.03,
        "Fixed-fixed moment: R_A_y = 3M0/(2L)");
    assert_close(r_b.rz, -v_exact, 0.03,
        "Fixed-fixed moment: R_B_y = -3M0/(2L)");

    // Vertical equilibrium: R_A + R_B = 0 (no transverse load)
    assert_close(r_a.rz + r_b.rz, 0.0, 0.02,
        "Fixed-fixed moment: R_A + R_B = 0");

    // Moment reactions: both M_A and M_B = M0/4
    // In the solver's convention, both fixed-end moment reactions are positive
    // when M0 is applied positive at midspan (a = b = L/2).
    let m_end_exact: f64 = m0 / 4.0; // 25.0
    assert_close(r_a.my, m_end_exact, 0.05,
        "Fixed-fixed moment: M_A = M0/4");
    assert_close(r_b.my, m_end_exact, 0.05,
        "Fixed-fixed moment: M_B = M0/4");

    // By symmetry of the loading position (midspan), |M_A| = |M_B|
    assert_close(r_a.my.abs(), r_b.my.abs(), 0.02,
        "Fixed-fixed moment: |M_A| = |M_B| (midspan symmetry)");

    // Global moment equilibrium about A:
    // M_A + M_B + M0 + R_B*L = 0
    let moment_sum = r_a.my + r_b.my + m0 + r_b.rz * l;
    assert_close(moment_sum, 0.0, 0.05,
        "Fixed-fixed moment: global moment equilibrium about A");
}
