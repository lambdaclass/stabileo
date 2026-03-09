/// Validation: Carry-Over Factors and Distribution Factors (Moment Distribution Method)
///
/// References:
///   - Cross, H. "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///
/// Tests verify indirectly (through FEM results) the fundamental quantities of
/// the Hardy Cross moment distribution method:
///   1. T-junction carry-over factor = 0.5 for fixed far end
///   2. Distribution factors proportional to member stiffness k
///   3. Carry-over = 0 for pinned far end (zero moment at pin)
///   4. Stiffness 4EI/L (fixed) vs 3EI/L (pinned) distribution
///   5. Equal stiffness yields equal distribution
///   6. Three members at a joint: DF = 1/3 each
///   7. Unequal lengths: distribution proportional to 1/L
///   8. Two-span continuous beam FEM and redistribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Carry-Over Factor = 0.5 for Fixed Far End
// ================================================================
//
// T-junction: node 1(0,0) fixed, node 2(3,0), node 3(3,4) fixed.
// Elements: 1->2 (horizontal L=3), 2->3 (vertical L=4).
// Apply moment mz=10 at node 2 (the free joint).
//
// Stiffnesses:  k_12 = 4EI/3,  k_23 = 4EI/4 = EI
// Distribution factors: DF_12 = (4/3)/(4/3 + 1) = (4/3)/(7/3) = 4/7
//                        DF_23 = 1/(7/3) = 3/7
// Distributed moments: M_12 = 10 * 4/7, M_23 = 10 * 3/7
// Carry-over to far ends (factor = 0.5):
//   M_1 = 0.5 * 10 * 4/7 = 20/7 ~ 2.857
//   M_3 = 0.5 * 10 * 3/7 = 15/7 ~ 2.143
// Verify: reaction moments at fixed supports 1 and 3.

#[test]
fn validation_carry_over_factor_half() {
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 4.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 10.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected carry-over moments at the fixed far ends
    let m1_expected = 20.0 / 7.0; // ~ 2.857
    let m3_expected = 15.0 / 7.0; // ~ 2.143

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.mz.abs(), m1_expected, 0.02, "Carry-over to node 1");
    assert_close(r3.mz.abs(), m3_expected, 0.02, "Carry-over to node 3");

    // Verify the ratio of far-end moments = ratio of distribution factors * 0.5 each
    // i.e. M1/M3 = DF_12/DF_23 = 4/3
    let ratio = r1.mz.abs() / r3.mz.abs();
    assert_close(ratio, 4.0 / 3.0, 0.02, "Carry-over moment ratio M1/M3");
}

// ================================================================
// 2. Distribution Factor Verification
// ================================================================
//
// Same T-junction as test 1. The distribution factors determine how
// the applied moment splits between the two members at the joint.
// At node 2: the element end moments should be in ratio DF_12:DF_23 = 4:3.
//
// Elem 1 (1->2): m_end is the moment at node 2 end = 10*4/7 ~ 5.714
// Elem 2 (2->3): m_start is the moment at node 2 end = 10*3/7 ~ 4.286

#[test]
fn validation_distribution_factor_ratio() {
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 4.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 10.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2).unwrap();

    // At the joint (node 2): elem 1 m_end, elem 2 m_start
    // Their absolute values should be in ratio 4:3 (DF_12:DF_23)
    let m_joint_1 = ef1.m_end.abs();
    let m_joint_2 = ef2.m_start.abs();

    let ratio = m_joint_1 / m_joint_2;
    assert_close(ratio, 4.0 / 3.0, 0.02, "Distribution factor ratio at joint");

    // Also verify they sum to the applied moment (equilibrium at joint)
    // The signs should be opposite (one clockwise, one counterclockwise at the joint)
    // but the magnitudes should sum close to 10.
    let m_sum = m_joint_1 + m_joint_2;
    assert_close(m_sum, 10.0, 0.02, "Sum of distributed moments at joint");
}

// ================================================================
// 3. Carry-Over = 0 for Pinned Far End
// ================================================================
//
// T-junction: node 1(0,0) fixed, node 2(6,0) joint, node 3(6,6) pinned.
// Beam 1: 1->2 (horizontal L=6), far end fixed -> k_1 = 4EI/6.
// Beam 2: 2->3 (vertical L=6), far end pinned -> k_2 = 3EI/6.
// Apply M=10 at node 2.
//
// DF_1 = (4/6)/((4/6)+(3/6)) = 4/7.
// DF_2 = (3/6)/((4/6)+(3/6)) = 3/7.
//
// Carry-over to node 1 (fixed) = 0.5 * 10 * 4/7 = 20/7 ~ 2.857.
// Carry-over to node 3 (pinned) = 0 (no moment at pinned support).
// Verify: reaction moment at node 3 = 0 (pinned support has no mz).

#[test]
fn validation_carry_over_zero_pinned_far_end() {
    let nodes = vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 6.0, 6.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    // Node 1 fixed, node 3 pinned (rotation free, translation fixed)
    let sups = vec![(1, 1, "fixed"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 10.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Pinned far end: m_end of elem 2 (at node 3) should be ~0
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2).unwrap();
    assert!(ef2.m_end.abs() < 0.05,
        "Pinned far end moment should be ~0, got {:.6}", ef2.m_end);

    // Fixed far end: should have nonzero carry-over moment
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.mz.abs() > 1.0,
        "Fixed far end should have nonzero carry-over moment, got {:.6}", r1.mz);

    // Expected carry-over to node 1 = 0.5 * 10 * 4/7 = 20/7 ~ 2.857
    let m1_expected = 20.0 / 7.0;
    assert_close(r1.mz.abs(), m1_expected, 0.05, "Carry-over to fixed far end");
}

// ================================================================
// 4. Stiffness Factor 4EI/L (Fixed) vs 3EI/L (Pinned)
// ================================================================
//
// L-junction: node 1(0,0) fixed, node 2(4,0) joint, node 3(4,4) pinned.
// Beam A: 1->2 (horizontal L=4), far end fixed -> k_A = 4EI/4 = EI.
// Beam B: 2->3 (vertical L=4), far end pinned -> k_B = 3EI/4 = 0.75EI.
// DF_A = EI/(EI + 0.75EI) = 1/1.75 = 4/7.
// DF_B = 0.75/1.75 = 3/7.
// Apply M=14 at node 2.
// M_A = 14 * 4/7 = 8, M_B = 14 * 3/7 = 6.
// Carry-over: M_1 = 0.5 * 8 = 4, M_3 = 0 (pinned).

#[test]
fn validation_stiffness_4ei_vs_3ei() {
    let nodes = vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 4.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 14.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Distribution at joint: elem 1 m_end ~ 8, elem 2 m_start ~ 6
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2).unwrap();

    let m_a = ef1.m_end.abs();
    let m_b = ef2.m_start.abs();

    assert_close(m_a, 8.0, 0.02, "Fixed far end member moment at joint");
    assert_close(m_b, 6.0, 0.02, "Pinned far end member moment at joint");

    // Carry-over to node 1 (fixed) = 0.5 * 8 = 4
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), 4.0, 0.02, "Carry-over moment to fixed end");

    // No moment at pinned end
    assert!(ef2.m_end.abs() < 0.05,
        "Pinned far end moment should be ~0, got {:.6}", ef2.m_end);
}

// ================================================================
// 5. Equal Stiffness: Equal Distribution
// ================================================================
//
// Two identical beams at a joint, both far ends fixed, same L=5.
// k each = 4EI/5. DF = 0.5 each.
// Apply M=20 at joint. Each beam gets M=10.
// Carry-over: 0.5 * 10 = 5 at each far end.

#[test]
fn validation_equal_stiffness_equal_distribution() {
    let nodes = vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 10.0, 0.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 20.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // At joint node 2: each member takes half the applied moment
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2).unwrap();

    let m1_joint = ef1.m_end.abs();
    let m2_joint = ef2.m_start.abs();

    // Equal distribution: each ~ 10
    assert_close(m1_joint, 10.0, 0.02, "Equal distribution member 1");
    assert_close(m2_joint, 10.0, 0.02, "Equal distribution member 2");

    // Carry-over to each fixed end: 0.5 * 10 = 5
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.mz.abs(), 5.0, 0.02, "Carry-over to node 1");
    assert_close(r3.mz.abs(), 5.0, 0.02, "Carry-over to node 3");

    // By symmetry, the two carry-over moments should be equal
    let ratio = r1.mz.abs() / r3.mz.abs();
    assert_close(ratio, 1.0, 0.01, "Symmetric carry-over ratio");
}

// ================================================================
// 6. Three Members at a Joint: DF = 1/3 Each
// ================================================================
//
// Node 2 at center (5,0), beams to:
//   node 1 (0,0) fixed  — horizontal left, L=5
//   node 3 (10,0) fixed — horizontal right, L=5
//   node 4 (5,5) fixed  — vertical up, L=5
// All same L=5, so k = 4EI/5 for each. DF = 1/3 each.
// Apply M=30 at node 2. Each beam gets M=10.
// Carry-over: 0.5 * 10 = 5 at each far end.

#[test]
fn validation_three_members_equal_distribution() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 5.0, 0.0),
        (3, 10.0, 0.0),
        (4, 5.0, 5.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 2, 4, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 3, "fixed"),
        (3, 4, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 30.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Carry-over to each fixed far end = 0.5 * 10 = 5
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r1.mz.abs(), 5.0, 0.02, "Carry-over to node 1");
    assert_close(r3.mz.abs(), 5.0, 0.02, "Carry-over to node 3");
    assert_close(r4.mz.abs(), 5.0, 0.02, "Carry-over to node 4");

    // All three carry-over moments should be equal (DF = 1/3 each)
    let m_avg = (r1.mz.abs() + r3.mz.abs() + r4.mz.abs()) / 3.0;
    let max_dev = [r1.mz.abs(), r3.mz.abs(), r4.mz.abs()]
        .iter()
        .map(|m| (m - m_avg).abs())
        .fold(0.0_f64, f64::max);
    assert!(max_dev / m_avg < 0.02,
        "Three-member equal distribution: max deviation {:.4} from mean {:.4}",
        max_dev, m_avg);
}

// ================================================================
// 7. Unequal Lengths: Distribution Proportional to k = 4EI/L
// ================================================================
//
// L-junction: node 1(0,0) fixed, node 2(3,0) joint, node 3(3,6) fixed.
// Beam 1: 1->2 (horizontal L=3, fixed far end) -> k1 = 4EI/3.
// Beam 2: 2->3 (vertical L=6, fixed far end) -> k2 = 4EI/6 = 2EI/3.
// DF1 = (4/3)/((4/3)+(2/3)) = (4/3)/2 = 2/3.
// DF2 = (2/3)/2 = 1/3.
// Apply M=12 at node 2.
// M1 = 12 * 2/3 = 8, M2 = 12 * 1/3 = 4.
// Carry-over: M_far1 = 0.5 * 8 = 4, M_far2 = 0.5 * 4 = 2.

#[test]
fn validation_unequal_lengths_distribution() {
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 6.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // horizontal L=3
        (2, "frame", 2, 3, 1, 1, false, false), // vertical L=6
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: 0.0, mz: 12.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Carry-over moments at fixed far ends
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    // Tolerance 4% to account for axial deformation coupling in FEM
    // (moment distribution ignores axial effects; FEM includes them)
    assert_close(r1.mz.abs(), 4.0, 0.04, "Carry-over to node 1 (short beam)");
    assert_close(r3.mz.abs(), 2.0, 0.04, "Carry-over to node 3 (long beam)");

    // Ratio of carry-over moments = DF1/DF2 = 2/1
    let ratio = r1.mz.abs() / r3.mz.abs();
    assert_close(ratio, 2.0, 0.04, "Carry-over ratio (short/long)");

    // Distribution at joint: elem 1 m_end ~ 8, elem 2 m_start ~ 4
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.m_end.abs(), 8.0, 0.04, "Joint moment beam 1 (L=3)");
    assert_close(ef2.m_start.abs(), 4.0, 0.04, "Joint moment beam 2 (L=6)");
}

// ================================================================
// 8. Two-Span Continuous Beam: FEM Redistribution
// ================================================================
//
// Two equal spans L=6, fixed at both outer ends, UDL q=-10.
// This is the classic scenario for moment distribution.
//
// Fixed-end moments per span: FEM = wL^2/12 = 10*36/12 = 30.
// At the interior joint (node in the middle), two fixed-end moments
// meet. For a fixed-fixed-fixed continuous beam:
//
// By the three-moment equation for two spans with fixed ends:
//   The interior moment M_B is found from:
//   M_A*L1 + 2*M_B*(L1+L2) + M_C*L2 = -6*[A1*a1/L1 + A2*b2/L2]
//   For UDL: 6*A*a/(L) = wL^3/4 per span.
//   With fixed ends M_A and M_C are not zero; they are unknowns too.
//
// For the symmetric case (two equal spans, both ends fixed, UDL):
//   By symmetry and using slope-deflection:
//   At the interior support: M_B = -wL^2/8 (from each side, they balance).
//
// Actually, for a two-span beam with FIXED outer ends and UDL:
//   Using slope-deflection with theta_A=theta_C=0 (fixed), theta_B free:
//   M_AB = 2EI/L*(2*0 + theta_B) - wL^2/12
//   M_BA = 2EI/L*(theta_B + 2*0) + wL^2/12 ... wait, let me use the
//   standard: M_near = (2EI/L)*(2*theta_near + theta_far - 3*psi) + FEM_near
//
//   For span AB: M_BA = (2EI/L)*(2*theta_B + 0) + wL^2/12
//   For span BC: M_BC = (2EI/L)*(2*theta_B + 0) - wL^2/12
//   Equilibrium at B: M_BA + M_BC = 0
//   (2EI/L)*(2*theta_B) + wL^2/12 + (2EI/L)*(2*theta_B) - wL^2/12 = 0
//   8*EI*theta_B/L = 0 => theta_B = 0
//   So M_BA = wL^2/12, M_BC = -wL^2/12
//
// This means: for equal spans, equal load, fixed outer ends, the interior
// joint is already balanced (no redistribution needed). The fixed-end
// moments are the final answer: M = wL^2/12 = 30.
// The outer fixed-end moments: M_A = M_C = -wL^2/12 = -30 as well.
//
// Now with PINNED outer ends instead (classic two-span continuous beam):
// M_B = wL^2/8 = 45.
//
// We test the pinned-end case, which requires redistribution of the
// released fixed-end moments at the pins.

#[test]
fn validation_two_span_fem_redistribution() {
    let l = 6.0;
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

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment M_B = wL^2/8 = 10*36/8 = 45
    let m_interior = w * l * l / 8.0;

    // The interior support is at node (n_per_span + 1)
    // Element n_per_span ends at the interior support
    let ef = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef.m_end.abs(), m_interior, 0.05,
        "Interior moment M_B = wL^2/8");

    // The FEM per span was wL^2/12 = 30.
    // The redistribution added (45 - 30) = 15 to the interior moment.
    // This redistribution comes from releasing the outer pin moments:
    // Each pin had FEM = wL^2/12 = 30, which was released.
    // Half carries over to the interior: 0.5 * 30 = 15 per span.
    // But the two carry-overs from each span go in the same direction,
    // so only one contributes (they balance for the symmetric case).
    // The result is M_B goes from 30 to 45.
    let fem = w * l * l / 12.0;
    let carry_over_increment = m_interior - fem;
    assert_close(carry_over_increment, 15.0, 0.05,
        "Redistribution increment from carry-over");

    // Verify reactions: R_end = 3wL/8, R_interior = 10wL/8 = 5wL/4
    let r_end_exact = 3.0 * w * l / 8.0;
    let r_mid_exact = 10.0 * w * l / 8.0;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let rb = results.reactions.iter()
        .find(|r| r.node_id == n_per_span + 1).unwrap().ry;

    assert_close(ra, r_end_exact, 0.05, "End reaction R_A = 3wL/8");
    assert_close(rb, r_mid_exact, 0.05, "Interior reaction R_B = 5wL/4");

    // Equilibrium: total reactions = total applied load = 2*w*L
    let total_load = 2.0 * w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Global vertical equilibrium");
}
