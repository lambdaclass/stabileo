/// Validation: Transfer Matrix Method (Extended) — Advanced Force/Displacement Transfer
///
/// References:
///   - Pestel & Leckie, "Matrix Methods in Elastomechanics", McGraw-Hill (1963)
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., McGraw-Hill
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Ghali & Neville, "Structural Analysis: A Unified Classical and Matrix Approach"
///
/// These tests extend the basic transfer matrix validation with additional scenarios:
///   1. Propped cantilever UDL: reaction and deflection at roller end
///   2. Three-span continuous beam: intermediate reactions via three-moment equation
///   3. Fixed-pinned beam with point load: asymmetric moment transfer
///   4. Cantilever with triangular load: cubic moment distribution
///   5. Two-span beam with unequal spans: force redistribution
///   6. SS beam with two symmetric point loads: pure bending zone
///   7. Overhang beam: negative moment region beyond support
///   8. Fixed-fixed beam with off-center point load: fixed-end force transfer
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever Under UDL: Reaction and Deflection
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) of length L under UDL q:
//   R_B = 3qL/8  (upward reaction at roller)
//   R_A = 5qL/8  (upward reaction at fixed end)
//   M_A = qL²/8  (hogging moment at fixed end)
//   δ_max occurs at x = (1 + √33)/16 · L ≈ 0.4215L from fixed end
//   δ_max = qL⁴ / (185 EI)  (approximately, exact is qL⁴·√33/(4096 EI)·...)
//
// The maximum deflection for a propped cantilever under UDL is:
//   δ_max = qL⁴ / (185·EI) (approximately)
//
// Source: Timoshenko & Young, "Theory of Structures", §3.6.

#[test]
fn validation_transfer_ext_propped_cantilever_udl() {
    let l = 8.0;
    let n = 8;
    let q = -12.0; // kN/m downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    // Fixed at node 1, roller at node n+1
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff: f64 = E * 1000.0;

    // R_B = 3qL/8
    let r_b_exact = 3.0 * q.abs() * l / 8.0;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, r_b_exact, 0.02, "Propped cantilever R_B = 3qL/8");

    // R_A = 5qL/8
    let r_a_exact = 5.0 * q.abs() * l / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.02, "Propped cantilever R_A = 5qL/8");

    // M_A = qL²/8 (hogging)
    let m_a_exact = q.abs() * l * l / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02, "Propped cantilever M_A = qL²/8");

    // Maximum deflection: δ_max = qL⁴ / (185·EI) (approx)
    // Find max |uy| among interior nodes
    let max_uy: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, |a, b| a.max(b));
    let delta_approx = q.abs() * l.powi(4) / (185.0 * e_eff * IZ);
    assert_close(max_uy, delta_approx, 0.05, "Propped cantilever δ_max ≈ qL⁴/(185EI)");
}

// ================================================================
// 2. Three-Span Continuous Beam: Intermediate Reactions
// ================================================================
//
// Three equal spans of length L each, all under UDL q.
// By the three-moment equation (Clapeyron), for equal spans:
//   M_1 = M_2 = qL²/10  (hogging moments at interior supports)
//   R_end = 0.4qL  (end reactions)
//   R_int = 1.1qL  (interior reactions)
//
// Source: Ghali & Neville, "Structural Analysis", §4.5.

#[test]
fn validation_transfer_ext_three_span_reactions() {
    let l = 6.0;
    let n_per = 6;
    let q = -10.0; // kN/m downward

    let total_elems = 3 * n_per;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions: R_end = 0.4·q·L
    let r_end_exact = 0.4 * q.abs() * l;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, r_end_exact, 0.02, "Three-span R_end (left)");

    let last_node = 3 * n_per + 1;
    let r4 = results.reactions.iter().find(|r| r.node_id == last_node).unwrap();
    assert_close(r4.ry, r_end_exact, 0.02, "Three-span R_end (right)");

    // Interior reactions: R_int = 1.1·q·L
    let r_int_exact = 1.1 * q.abs() * l;
    let node_b = n_per + 1;
    let r2 = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    assert_close(r2.ry, r_int_exact, 0.02, "Three-span R_int (B)");

    let node_c = 2 * n_per + 1;
    let r3 = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    assert_close(r3.ry, r_int_exact, 0.02, "Three-span R_int (C)");

    // Total reaction = total load = 3qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = q.abs() * 3.0 * l;
    assert_close(sum_ry, total_load, 0.01, "Three-span total equilibrium");
}

// ================================================================
// 3. Fixed-Pinned Beam with Point Load: Asymmetric Moment Transfer
// ================================================================
//
// A beam fixed at A, pinned at B, with a point load P at midspan (x = L/2):
//   R_A = 11P/16,  R_B = 5P/16
//   M_A = 3PL/16   (fixed-end moment)
//   M_midspan = 5PL/32
//
// The moment distribution is asymmetric due to the different boundary
// conditions, testing that force transfer captures the stiffness difference
// between fixed and pinned ends.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Table (inside cover).

#[test]
fn validation_transfer_ext_fixed_pinned_point_load() {
    let l = 10.0;
    let n = 10;
    let p = 20.0; // kN downward

    let mid_node = n / 2 + 1; // node 6 at x = 5.0
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("pinned"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // R_A = 11P/16
    let r_a_exact = 11.0 * p / 16.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.02, "Fixed-pinned R_A = 11P/16");

    // R_B = 5P/16
    let r_b_exact = 5.0 * p / 16.0;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, r_b_exact, 0.02, "Fixed-pinned R_B = 5P/16");

    // M_A = 3PL/16 (hogging, so the reaction moment is negative)
    let m_a_exact = 3.0 * p * l / 16.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02, "Fixed-pinned M_A = 3PL/16");

    // No moment at pinned end
    assert_close(r_b.mz.abs(), 0.0, 0.01, "Pinned end moment = 0");
}

// ================================================================
// 4. Cantilever with Triangular Load: Cubic Moment Distribution
// ================================================================
//
// Cantilever of length L, fixed at left end (node 1), free at right end.
// Triangular load: q varies from q_max at fixed end to 0 at free end.
//   Total load = q_max * L / 2
//   R_A = q_max * L / 2  (vertical reaction at fixed end)
//   M_A = q_max * L² / 6  (moment at fixed end)
//
// The moment varies cubically, testing force accumulation for non-uniform loads.
//
// Source: Pestel & Leckie, "Matrix Methods in Elastomechanics", §4.3.

#[test]
fn validation_transfer_ext_cantilever_triangular_load() {
    let l = 6.0;
    let n = 12; // more elements for better triangular approximation
    let q_max = -15.0; // kN/m at fixed end

    let elem_len = l / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        // q varies linearly from q_max at x=0 to 0 at x=L
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        let q_i = q_max * (1.0 - x_i / l);
        let q_j = q_max * (1.0 - x_j / l);
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // R_A = q_max * L / 2
    let r_a_exact = q_max.abs() * l / 2.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.02, "Triangular cantilever R_A = qL/2");

    // M_A = q_max * L² / 6
    let m_a_exact = q_max.abs() * l * l / 6.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.03, "Triangular cantilever M_A = qL²/6");

    // Tip deflection should be zero (free end has zero force)
    let tip_v = results.element_forces.iter()
        .find(|f| f.element_id == n).unwrap().v_end;
    assert_close(tip_v.abs(), 0.0, 0.05, "Triangular cantilever tip shear ≈ 0");
}

// ================================================================
// 5. Two-Span Beam with Unequal Spans: Force Redistribution
// ================================================================
//
// Two spans: L1 = 4m and L2 = 8m, both under UDL q.
// The three-moment equation for unequal spans gives:
//   M_B = -q(L1² L2 + L1 L2²) / (4(L1 + L2))  ... simplified for pinned ends
//   Actually for SS at A and C, pinned at B:
//   M_B = 0 (pinned), but the reaction at B depends on the span ratio.
//
// For a two-span continuous beam (SS at ends) with UDL on both spans:
//   M_B = -q/8 · (L1·L2·(L1+L2)) / (L1+L2) = -q·L1·L2/8  ... via three-moment
//   Actually the three-moment equation for two spans gives:
//   M_B = -q(L1² + L2²) / (8·(L1+L2)/(L1·L2)) -- need careful derivation.
//
// Simpler: verify total equilibrium and symmetry breaking.
// Total load = q·(L1 + L2), sum of reactions must equal this.
// Also R_A < R_C since span 2 is longer (stiffer path to C).
//
// Source: McGuire et al., "Matrix Structural Analysis", §5.3.

#[test]
fn validation_transfer_ext_unequal_spans() {
    let l1 = 4.0;
    let l2 = 8.0;
    let n_per = 4;
    let q = -10.0; // kN/m downward

    let total_elems = 2 * n_per;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l1, l2], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium
    let total_load = q.abs() * (l1 + l2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Unequal spans total equilibrium");

    // The intermediate support (node n_per + 1) should carry the most load
    let node_b = n_per + 1;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().ry;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let last_node = 2 * n_per + 1;
    let r_c = results.reactions.iter().find(|r| r.node_id == last_node).unwrap().ry;

    // Intermediate reaction should be largest
    assert!(r_b > r_a, "R_B ({:.2}) should be > R_A ({:.2})", r_b, r_a);
    assert!(r_b > r_c, "R_B ({:.2}) should be > R_C ({:.2})", r_b, r_c);

    // Three-moment equation for pinned-roller-roller with UDL on both spans:
    // M_B·2(L1+L2) = -q·L1³/4 - q·L2³/4
    // M_B = -q(L1³ + L2³) / (8(L1 + L2))
    // Using this to compute R_A:
    // R_A = qL1/2 - M_B/L1
    let m_b = q.abs() * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let r_a_exact = q.abs() * l1 / 2.0 - m_b / l1;
    assert_close(r_a, r_a_exact, 0.03, "Unequal spans R_A via three-moment eq");
}

// ================================================================
// 6. SS Beam with Two Symmetric Point Loads: Pure Bending Zone
// ================================================================
//
// A simply-supported beam of length L with two equal point loads P at
// distances a from each support (four-point bending):
//   R_A = R_B = P
//   Between the two loads: V = 0, M = P·a (constant — pure bending)
//   Outside the loads: V = ±P, M varies linearly
//
// The pure bending zone between the loads has zero shear, which is a
// fundamental check for force transfer.
//
// Source: Timoshenko & Young, "Theory of Structures", §3.3.

#[test]
fn validation_transfer_ext_four_point_bending() {
    let l = 12.0;
    let n = 12;
    let p = 10.0; // kN per load point

    // Load at nodes 4 and 10 (at x=3 and x=9, so a=3 from each end)
    let a_dist: f64 = 3.0; // distance from support to load point
    let load_node_left = 4;  // node at x = 3
    let load_node_right = 10; // node at x = 9

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node_left, fx: 0.0, fy: -p, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node_right, fx: 0.0, fy: -p, mz: 0.0,
            }),
        ]);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, p, 0.02, "Four-point bending R_A = P");
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, p, 0.02, "Four-point bending R_B = P");

    // Pure bending zone: elements between the load points should have V ≈ 0
    // Elements 4 through 9 are in the pure bending zone
    for elem_id in load_node_left..load_node_right {
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();
        assert_close(ef.v_start.abs(), 0.0, 0.02,
            &format!("Pure bending zone elem {} V_start ≈ 0", elem_id));
    }

    // Moment in pure bending zone: M = P·a
    let m_pure = p * a_dist;
    for elem_id in load_node_left..load_node_right {
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();
        assert_close(ef.m_start.abs(), m_pure, 0.02,
            &format!("Pure bending zone elem {} M = P·a = {}", elem_id, m_pure));
    }
}

// ================================================================
// 7. Overhang Beam: Negative Moment Region Beyond Support
// ================================================================
//
// A beam with span L between supports A and B, plus an overhang of length
// a beyond support B. A point load P is applied at the tip of the overhang.
//   R_B = P(L+a)/L  (upward)
//   R_A = -Pa/L     (downward! — the beam lifts at A)
//   M_B = -P·a      (hogging moment at B — negative)
//
// The moment diagram changes sign at B, which tests correct force transfer
// across a support with sign reversal.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Example 4.6.

#[test]
fn validation_transfer_ext_overhang_beam() {
    let l = 8.0;   // main span
    let a_oh: f64 = 3.0;   // overhang length
    let total_l = l + a_oh;
    let n = 11; // 11 elements for 11m total
    let p = 12.0; // kN at tip

    let elem_len = total_l / n as f64;

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Support A at node 1 (x=0), support B at the node closest to x=8
    // With elem_len = 1.0, node 9 is at x=8.0
    let node_b = (l / elem_len).round() as usize + 1; // node 9

    let sups = vec![(1, 1_usize, "pinned"), (2, node_b, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // R_A = -P·a/L (downward reaction — beam lifts)
    let r_a_exact = -p * a_oh / l;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.03, "Overhang R_A = -Pa/L");

    // R_B = P(L+a)/L (upward)
    let r_b_exact = p * (l + a_oh) / l;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    assert_close(r_b.ry, r_b_exact, 0.03, "Overhang R_B = P(L+a)/L");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Overhang total equilibrium");
}

// ================================================================
// 8. Fixed-Fixed Beam with Off-Center Point Load: Force Transfer
// ================================================================
//
// A fixed-fixed beam of length L with point load P at distance a from left end.
// Let b = L - a.
//   M_A = P·a·b²/L²  (fixed-end moment at A)
//   M_B = P·a²·b/L²  (fixed-end moment at B)
//   R_A = P·b²(3a+b)/L³
//   R_B = P·a²(a+3b)/L³
//
// This tests asymmetric force transfer through a fixed-fixed beam, where
// both ends develop different moments depending on load position.
//
// Source: McGuire et al., "Matrix Structural Analysis", Table 3.1.

#[test]
fn validation_transfer_ext_fixed_fixed_offcenter_load() {
    let l = 10.0;
    let n = 10;
    let p = 30.0; // kN
    let a_pos: f64 = 3.0; // load at x = 3 from left
    let b_pos: f64 = l - a_pos; // = 7.0

    // Load at node 4 (x = 3.0)
    let load_node = (a_pos / (l / n as f64)).round() as usize + 1;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // R_A = P·b²(3a+b)/L³
    let r_a_exact = p * b_pos.powi(2) * (3.0 * a_pos + b_pos) / l.powi(3);
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.02, "Fixed-fixed off-center R_A");

    // R_B = P·a²(a+3b)/L³
    let r_b_exact = p * a_pos.powi(2) * (a_pos + 3.0 * b_pos) / l.powi(3);
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, r_b_exact, 0.02, "Fixed-fixed off-center R_B");

    // M_A = P·a·b²/L²
    let m_a_exact = p * a_pos * b_pos.powi(2) / l.powi(2);
    assert_close(r_a.mz.abs(), m_a_exact, 0.02, "Fixed-fixed off-center M_A");

    // M_B = P·a²·b/L²
    let m_b_exact = p * a_pos.powi(2) * b_pos / l.powi(2);
    assert_close(r_b.mz.abs(), m_b_exact, 0.02, "Fixed-fixed off-center M_B");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Fixed-fixed off-center equilibrium");
}
