/// Validation: Extended Carry-Over Factor Analysis in Moment Distribution
///
/// References:
///   - Cross, H. "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed., Ch. 14-15
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///
/// These tests extend the base carry-over factor tests to cover:
///   1. Four members at a joint with equal stiffness (DF = 1/4)
///   2. Mixed far-end conditions (two pinned + one fixed) at a joint
///   3. Three-span continuous beam moment distribution
///   4. Unequal EI (different sections) distribution factors
///   5. Asymmetric T-junction with UDL (FEM + moment distribution)
///   6. Carry-over chain: propagation through two sequential joints
///   7. Propped cantilever moment via carry-over analysis
///   8. Four-span continuous beam moment distribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Four Members at a Joint: DF = 1/4 Each
// ================================================================
//
// Four equal-length beams (L=4) meeting at a central joint, all far ends fixed.
// Node layout:
//   node 1 (0,0) fixed, node 2 (4,0) joint, node 3 (8,0) fixed,
//   node 4 (4,4) fixed, node 5 (4,-4) fixed.
// Elements: 1->2, 2->3, 2->4, 2->5, all L=4.
// k = 4EI/4 = EI for each. DF = 1/4 each.
// Apply M=40 at node 2.
// Each beam gets M = 40 * 1/4 = 10.
// Carry-over to each far end = 0.5 * 10 = 5.

/// Ref: Cross (1930) — equal stiffness at multi-member joint gives equal DFs.
#[test]
fn validation_four_members_equal_df_quarter() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 4.0, 0.0),
        (3, 8.0, 0.0),
        (4, 4.0, 4.0),
        (5, 4.0, -4.0),
    ];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 2, 4, 1, 1, false, false),
        (4, "frame", 2, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1, "fixed"),
        (2, 3, "fixed"),
        (3, 4, "fixed"),
        (4, 5, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: 0.0, my: 40.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Carry-over to each fixed far end = 0.5 * 10 = 5
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(r1.my.abs(), 5.0, 0.03, "Carry-over to node 1");
    assert_close(r3.my.abs(), 5.0, 0.03, "Carry-over to node 3");
    assert_close(r4.my.abs(), 5.0, 0.03, "Carry-over to node 4");
    assert_close(r5.my.abs(), 5.0, 0.03, "Carry-over to node 5");

    // All four carry-over moments should be equal
    let moments = [r1.my.abs(), r3.my.abs(), r4.my.abs(), r5.my.abs()];
    let m_avg = moments.iter().sum::<f64>() / 4.0;
    let max_dev: f64 = moments.iter().map(|m| (m - m_avg).abs()).fold(0.0_f64, f64::max);
    assert!(
        max_dev / m_avg < 0.02,
        "Four-member equal distribution: max deviation {:.4} from mean {:.4}",
        max_dev, m_avg
    );
}

// ================================================================
// 2. Mixed Far-End Conditions: Two Pinned + One Fixed
// ================================================================
//
// Three beams meet at node 2 (5,0):
//   Beam A: 1->2, horizontal L=5, far end at node 1 (0,0) FIXED
//   Beam B: 2->3, horizontal L=5, far end at node 3 (10,0) PINNED
//   Beam C: 2->4, vertical L=5, far end at node 4 (5,5) PINNED
//
// Stiffnesses:
//   k_A = 4EI/5 (fixed far end)
//   k_B = 3EI/5 (pinned far end)
//   k_C = 3EI/5 (pinned far end)
// Sum_k = (4+3+3)EI/5 = 2EI
// DF_A = (4/5)/(2) = 2/5 = 0.4
// DF_B = (3/5)/(2) = 3/10 = 0.3
// DF_C = (3/5)/(2) = 3/10 = 0.3
//
// Apply M=20 at node 2.
// M_A = 20 * 0.4 = 8, M_B = 20 * 0.3 = 6, M_C = 20 * 0.3 = 6
// Carry-over to node 1 (fixed) = 0.5 * 8 = 4
// Carry-over to node 3 (pinned) = 0 (no moment)
// Carry-over to node 4 (pinned) = 0 (no moment)

/// Ref: Hibbeler Ch.12 — modified stiffness 3EI/L for pinned far end.
#[test]
fn validation_mixed_far_end_two_pinned_one_fixed() {
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
        (2, 3, "pinned"),
        (3, 4, "pinned"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: 0.0, my: 20.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Carry-over to node 1 (fixed) = 0.5 * 8 = 4
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), 4.0, 0.04, "Carry-over to fixed far end");

    // Pinned ends: zero moment at element end
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|f| f.element_id == 3).unwrap();
    assert!(ef2.m_end.abs() < 0.05,
        "Pinned far end node 3: moment should be ~0, got {:.6}", ef2.m_end);
    assert!(ef3.m_end.abs() < 0.05,
        "Pinned far end node 4: moment should be ~0, got {:.6}", ef3.m_end);

    // Distribution at joint: verify ratio A:B:C = 0.4:0.3:0.3
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_a = ef1.m_end.abs();
    let m_b = ef2.m_start.abs();
    let m_c = ef3.m_start.abs();

    // m_b and m_c should be equal (both pinned, same L)
    let ratio_bc = m_b / m_c;
    assert_close(ratio_bc, 1.0, 0.03, "Equal pinned members distribution ratio");

    // m_a / m_b should be 0.4/0.3 = 4/3
    let ratio_ab = m_a / m_b;
    assert_close(ratio_ab, 4.0 / 3.0, 0.04, "Fixed vs pinned member ratio");
}

// ================================================================
// 3. Three-Span Continuous Beam: Interior Moments
// ================================================================
//
// Three equal spans L=6, all simply supported (pinned at ends, rollers at interior).
// UDL q = -10 kN/m on all spans.
//
// By the three-moment equation for three equal spans with UDL:
//   M_A = M_D = 0 (simple supports at ends)
//   M_B = M_C = -wL^2/10 (by symmetry and three-moment equation)
//
// Three-moment equation: M_{n-1}*L + 2*M_n*(L+L) + M_{n+1}*L = -(wL^3/4 + wL^3/4)
// For span AB-BC: 0 + 4L*M_B + L*M_C = -wL^3/2
// For span BC-CD: L*M_B + 4L*M_C + 0 = -wL^3/2
// By symmetry M_B = M_C:  5L*M_B = -wL^3/2  =>  M_B = -wL^2/10
//
// M_B = wL^2/10 = 10*36/10 = 36 (absolute value)

/// Ref: Three-moment equation for equal spans — Hibbeler Ch.12, Table 12.1.
#[test]
fn validation_three_span_continuous_beam_interior_moments() {
    let l: f64 = 6.0;
    let n_per_span = 4;
    let q: f64 = -10.0;
    let w: f64 = q.abs();

    let total_elems = n_per_span * 3;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments M_B = M_C = wL^2/10 = 36
    let m_interior = w * l * l / 10.0;

    // First interior support at node (n_per_span + 1) = 5
    // Element n_per_span ends at first interior support
    let ef_b = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_interior, 0.05,
        "First interior moment M_B = wL^2/10");

    // Second interior support at node (2*n_per_span + 1) = 9
    let ef_c = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_c.m_end.abs(), m_interior, 0.05,
        "Second interior moment M_C = wL^2/10");

    // By symmetry, M_B = M_C
    let ratio = ef_b.m_end.abs() / ef_c.m_end.abs();
    assert_close(ratio, 1.0, 0.02, "Symmetry: M_B = M_C");

    // Equilibrium check: total reaction = total load = 3*w*L
    let total_load = 3.0 * w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Global vertical equilibrium");
}

// ================================================================
// 4. Unequal EI: Different Sections Affect Distribution
// ================================================================
//
// L-junction: two beams meeting at a right angle at node 2 (5,0).
//   Beam A: 1->2 horizontal (L=5), far end node 1 (0,0) FIXED, Iz_A = 1e-4
//   Beam B: 2->3 vertical (L=5), far end node 3 (5,5) FIXED, Iz_B = 3e-4
//
// k_A = 4*E*Iz_A/5
// k_B = 4*E*Iz_B/5 = 3 * k_A
// DF_A = k_A/(k_A + k_B) = 1/4
// DF_B = k_B/(k_A + k_B) = 3/4
//
// Apply M=20 at node 2.
// M_A = 20 * 1/4 = 5, M_B = 20 * 3/4 = 15
// Carry-over: CO_1 = 0.5 * 5 = 2.5, CO_3 = 0.5 * 15 = 7.5

/// Ref: McCormac Ch.14 — distribution proportional to member stiffness EI/L.
#[test]
fn validation_unequal_ei_distribution_factors() {
    let iz_a: f64 = 1e-4;
    let iz_b: f64 = 3e-4;

    let nodes = vec![(1, 0.0, 0.0), (2, 5.0, 0.0), (3, 5.0, 5.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![
        (1, A, iz_a),  // section for beam A
        (2, A, iz_b),  // section for beam B
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // beam A uses section 1
        (2, "frame", 2, 3, 1, 2, false, false), // beam B uses section 2
    ];
    let sups = vec![(1, 1, "fixed"), (2, 3, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: 0.0, my: 20.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Carry-over moments
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.my.abs(), 2.5, 0.04, "Carry-over to node 1 (flexible beam)");
    assert_close(r3.my.abs(), 7.5, 0.04, "Carry-over to node 3 (stiff beam)");

    // Ratio of carry-over moments = 3:1
    let ratio = r3.my.abs() / r1.my.abs();
    assert_close(ratio, 3.0, 0.04, "Carry-over ratio stiff/flexible = 3");

    // Joint moments: DF_A = 1/4 -> 5, DF_B = 3/4 -> 15
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|f| f.element_id == 2).unwrap();

    assert_close(ef1.m_end.abs(), 5.0, 0.04, "Joint moment beam A");
    assert_close(ef2.m_start.abs(), 15.0, 0.04, "Joint moment beam B");
}

// ================================================================
// 5. Two-Span Beam with UDL on One Span Only: Moment Redistribution
// ================================================================
//
// Two equal spans L=6, simply supported (pinned-rollerX-rollerX).
// UDL q=-10 kN/m on span AB only. Span BC has no load.
//
// Fixed-end moments for span AB: FEM = wL^2/12 = 10*36/12 = 30
// Span BC: FEM = 0
//
// At interior support B, unbalanced moment = 30 (from span AB).
// DF_AB = DF_BC = 0.5 (equal spans, both pinned far ends -> k = 3EI/L each)
// Actually: far end of AB is pinned -> k_AB = 3EI/L
//           far end of BC is pinned -> k_BC = 3EI/L
// DF = 0.5 each.
//
// But this is a continuous beam, not moment distribution at a free joint.
// For a two-span continuous beam with UDL on one span only:
//   By three-moment equation:
//     M_A*L + 2*M_B*(L+L) + M_C*L = -6*A_1*a_1/L + 0
//     where A_1 = wL^2/2 (area of load diagram), a_1 = L/2 (centroid distance from A)
//     But the standard form is:
//     M_A*L_1 + 2*M_B*(L_1+L_2) + M_C*L_2 = -6*[A_1*a_1/L_1 + A_2*b_2/L_2]
//     With M_A = M_C = 0 (simple supports):
//     2*M_B*(L+L) = -6*A_1*a_1/L
//     4L*M_B = -6*(wL^2/2)*(L/2)/L = -6*wL/4*L = -3wL^3/2 ...
//     Wait, let me be more careful:
//     A_1 = total load on span 1 = w*L (area under load)
//     a_1 = L/2 (centroid of UDL from left support A)
//     6*A_1*a_1/L_1 = 6*w*L*(L/2)/L = 3*w*L^2/1... no.
//
//     Standard three-moment equation:
//     M_{n-1}*L_1 + 2*M_n*(L_1+L_2) + M_{n+1}*L_2 = -6EI*(A_1*a_1/(L_1*EI) + A_2*b_2/(L_2*EI))
//     For constant EI and equal spans L:
//     0 + 4L*M_B + 0 = -6*(wL^2/2 * L/3)/L = ...
//
//     Actually for UDL on span 1: 6*A*a_bar/L = wL^3/4
//     (this is the standard result for UDL)
//     Since span 2 has no load: 6*A*b_bar/L = 0
//     So: 4L*M_B = -(wL^3/4)
//     M_B = -wL^2/16
//     |M_B| = 10*36/16 = 22.5

/// Ref: Three-moment equation — UDL on one span of two-span beam.
#[test]
fn validation_two_span_udl_one_span_only() {
    let l: f64 = 6.0;
    let n_per_span = 4_usize;
    let q: f64 = -10.0;
    let w: f64 = q.abs();

    // UDL on span 1 only (elements 1..n_per_span)
    let mut loads = Vec::new();
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment |M_B| = wL^2/16 = 22.5
    let m_b_expected = w * l * l / 16.0;

    // Interior support B at node (n_per_span + 1) = 5
    let ef_b = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_expected, 0.05,
        "Interior moment M_B = wL^2/16 for UDL on one span");

    // End supports have zero moment (simple supports)
    let ef_first = results.element_forces.iter()
        .find(|f| f.element_id == 1).unwrap();
    assert!(ef_first.m_start.abs() < 0.5,
        "Simple support moment at A should be ~0, got {:.4}", ef_first.m_start);

    let ef_last = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    assert!(ef_last.m_end.abs() < 0.5,
        "Simple support moment at C should be ~0, got {:.4}", ef_last.m_end);

    // Reactions: by statics with M_B known
    // For loaded span AB: R_A = wL/2 - M_B/L = 30 - 22.5/6 = 30 - 3.75 = 26.25
    // For unloaded span BC: R_C = M_B/L = 22.5/6 = 3.75
    // R_B = wL - R_A - R_C = 60 - 26.25 - 3.75 = 30.0
    let r_a = w * l / 2.0 - m_b_expected / l;
    let r_c = m_b_expected / l;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(ra.rz, r_a, 0.05, "End reaction R_A");

    let last_node = 2 * n_per_span + 1;
    let rc = results.reactions.iter().find(|r| r.node_id == last_node).unwrap();
    // R_C is negative (uplift from unloaded span) so compare absolute values
    assert_close(rc.rz.abs(), r_c, 0.05, "End reaction |R_C|");

    // Equilibrium: total reactions = total load = wL
    let total_load = w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Vertical equilibrium");
}

// ================================================================
// 6. Carry-Over Through Interior Joints: Three-Span UDL Pattern Loading
// ================================================================
//
// Three equal spans L=6, simply supported. UDL q=-10 on spans 1 and 3 only
// (pattern loading: loaded-unloaded-loaded).
//
// By the three-moment equation for three spans:
//   Supports A-B-C-D with M_A = M_D = 0.
//   At B: 0 + 4L*M_B + L*M_C = -6*[A1*a1/L + 0]
//         where 6*A1*a1/L = wL^3/4 for UDL on span AB.
//         4L*M_B + L*M_C = -wL^3/4  ...(1)
//
//   At C: L*M_B + 4L*M_C + 0 = -6*[0 + A3*b3/L]
//         where 6*A3*b3/L = wL^3/4 for UDL on span CD.
//         L*M_B + 4L*M_C = -wL^3/4  ...(2)
//
//   By symmetry of the loading pattern (spans 1 and 3 loaded, span 2 not):
//   M_B = M_C. From (1): 5L*M_B = -wL^3/4 => M_B = -wL^2/20
//   |M_B| = 10*36/20 = 18
//
// The pattern loading causes less redistribution than full loading because
// the unloaded middle span acts as a buffer.

/// Ref: Three-moment equation — pattern loading on three-span continuous beam.
#[test]
fn validation_carry_over_pattern_loading_three_span() {
    let l: f64 = 6.0;
    let n_per_span = 4_usize;
    let q: f64 = -10.0;
    let w: f64 = q.abs();

    // UDL on spans 1 and 3 only (elements 1..4 and 9..12)
    let mut loads = Vec::new();
    // Span 1: elements 1..n_per_span
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    // Span 3: elements (2*n_per_span+1)..(3*n_per_span)
    for i in (2 * n_per_span)..(3 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments M_B = M_C = wL^2/20 = 18
    let m_interior = w * l * l / 20.0;

    // First interior support B at node (n_per_span + 1) = 5
    let ef_b = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_interior, 0.05,
        "Interior moment M_B = wL^2/20 for pattern loading");

    // Second interior support C at node (2*n_per_span + 1) = 9
    let ef_c = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_c.m_end.abs(), m_interior, 0.05,
        "Interior moment M_C = wL^2/20 for pattern loading");

    // By symmetry: M_B = M_C
    let ratio = ef_b.m_end.abs() / ef_c.m_end.abs();
    assert_close(ratio, 1.0, 0.02, "Symmetry of pattern loading: M_B = M_C");

    // Equilibrium: total reactions = 2*w*L (two loaded spans)
    let total_load = 2.0 * w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Vertical equilibrium");
}

// ================================================================
// 7. Propped Cantilever Moment via Carry-Over Analysis
// ================================================================
//
// Fixed-pinned beam (propped cantilever) with UDL q=-10 kN/m, L=8.
// This is a classic moment distribution problem:
//   Fixed-end moments: FEM_fixed = -wL^2/12, FEM_pin = +wL^2/12
//   Release the pin: distribute FEM_pin to zero (pin has DF=1 for itself).
//   Carry-over to fixed end: 0.5 * (-FEM_pin)
//   Final moment at fixed end: FEM_fixed + 0.5*(-FEM_pin) ... but this is
//   single-span, so the pin end has DF=1 (all moment goes to the beam).
//
// Actually for a propped cantilever:
//   M_fixed = wL^2/8 (textbook result)
//
// Using moment distribution:
//   FEM_A = -wL^2/12 (at fixed end A), FEM_B = +wL^2/12 (at pinned end B)
//   At pin B: DF=1 (single member, far end fixed). Distribute: -wL^2/12
//   Carry-over to A: 0.5 * (-wL^2/12) = -wL^2/24
//   Final M_A = -wL^2/12 + (-wL^2/24) = -wL^2/12 - wL^2/24 = -wL^2(2+1)/24 = -wL^2/8
//   |M_A| = wL^2/8 = 10*64/8 = 80

/// Ref: Propped cantilever — moment distribution single-cycle convergence.
#[test]
fn validation_propped_cantilever_carry_over() {
    let l: f64 = 8.0;
    let q: f64 = -10.0;
    let w: f64 = q.abs();
    let n_elem = 8_usize;

    let mut loads = Vec::new();
    for i in 0..n_elem {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n_elem, l, E, A, IZ, "fixed", Some("pinned"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end moment = wL^2/8 = 80
    let m_fixed = w * l * l / 8.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), m_fixed, 0.03, "Propped cantilever fixed end moment wL^2/8");

    // Zero moment at pinned end
    let ef_last = results.element_forces.iter()
        .find(|f| f.element_id == n_elem).unwrap();
    assert!(ef_last.m_end.abs() < 0.5,
        "Pinned end moment should be ~0, got {:.4}", ef_last.m_end);

    // Reactions: R_fixed = 5wL/8, R_pin = 3wL/8
    let r_fixed = 5.0 * w * l / 8.0;
    let r_pin = 3.0 * w * l / 8.0;
    let n_nodes = n_elem + 1;

    assert_close(r1.rz, r_fixed, 0.03, "Fixed end reaction = 5wL/8");

    let r_end = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_end.rz, r_pin, 0.03, "Pinned end reaction = 3wL/8");

    // Equilibrium
    let total_load = w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Vertical equilibrium");
}

// ================================================================
// 8. Four-Span Continuous Beam: Moment Distribution
// ================================================================
//
// Four equal spans L=5, all simply supported, UDL q=-8 kN/m.
// By the three-moment equation for four equal spans with UDL:
//
// Supports: A-B-C-D-E, M_A = M_E = 0.
// Three-moment equations (L constant, UDL):
//   M_{i-1} + 4*M_i + M_{i+1} = -wL^2/2  for each interior support.
//
//   At B: M_A + 4*M_B + M_C = -wL^2/2  =>  4*M_B + M_C = -wL^2/2   ...(1)
//   At C: M_B + 4*M_C + M_D = -wL^2/2                                ...(2)
//   At D: M_C + 4*M_D + M_E = -wL^2/2  =>  M_C + 4*M_D = -wL^2/2   ...(3)
//
// By symmetry: M_B = M_D, so (1) and (3) are the same.
// From (1): 4*M_B + M_C = -wL^2/2   ...(1)
// From (2): 2*M_B + 4*M_C = -wL^2/2 ...(2, using symmetry)
//
// From (1): M_C = -wL^2/2 - 4*M_B
// Sub into (2): 2*M_B + 4*(-wL^2/2 - 4*M_B) = -wL^2/2
//   2*M_B - 2*wL^2 - 16*M_B = -wL^2/2
//   -14*M_B = -wL^2/2 + 2*wL^2 = 3*wL^2/2
//   M_B = -3*wL^2/28
// M_C = -wL^2/2 - 4*(-3*wL^2/28) = -wL^2/2 + 12*wL^2/28 = -wL^2/2 + 3*wL^2/7
//      = wL^2*(-7 + 6)/14 = -wL^2/14
//
// wL^2 = 8*25 = 200
// |M_B| = 3*200/28 = 600/28 = 150/7 ~ 21.43
// |M_C| = 200/14 = 100/7 ~ 14.29

/// Ref: Three-moment equation for four equal spans — Leet et al., Ch.10.
#[test]
fn validation_four_span_continuous_beam() {
    let l: f64 = 5.0;
    let n_per_span = 4;
    let q: f64 = -8.0;
    let w: f64 = q.abs();

    let total_elems = n_per_span * 4;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let wl2: f64 = w * l * l;

    // |M_B| = 3*wL^2/28
    let m_b_expected = 3.0 * wl2 / 28.0;
    // |M_C| = wL^2/14
    let m_c_expected = wl2 / 14.0;

    // Interior support B at node (n_per_span + 1)
    let ef_b = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_expected, 0.05,
        "Interior moment M_B = 3wL^2/28");

    // Interior support C at node (2*n_per_span + 1)
    let ef_c = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_c.m_end.abs(), m_c_expected, 0.05,
        "Interior moment M_C = wL^2/14");

    // By symmetry: M_D = M_B
    let ef_d = results.element_forces.iter()
        .find(|f| f.element_id == 3 * n_per_span).unwrap();
    assert_close(ef_d.m_end.abs(), m_b_expected, 0.05,
        "Interior moment M_D = M_B by symmetry");

    // M_B / M_C = (3/28)/(1/14) = (3/28)*(14/1) = 42/28 = 3/2
    let ratio = ef_b.m_end.abs() / ef_c.m_end.abs();
    assert_close(ratio, 1.5, 0.05, "Moment ratio M_B/M_C = 3/2");

    // Equilibrium
    let total_load = 4.0 * w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Global vertical equilibrium");
}
