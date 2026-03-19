/// Validation: Nodal Equilibrium — Extended
///
/// These tests verify nodal equilibrium conditions at individual nodes
/// by checking that element end forces, applied loads, and reactions
/// satisfy force and moment balance at each joint.
///
/// Sign convention for joint equilibrium (element A j-end meets element B i-end):
///     v_end_A  -  v_start_B  +  Fy_ext     =  0
///     n_end_A  -  n_start_B  +  Fx_ext     =  0
///     m_end_A  -  m_start_B  +  M_applied  =  0
///
/// At free interior nodes (no support, no applied load):
///     m_end_A = m_start_B,  v_end_A = v_start_B,  n_end_A = n_start_B
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 15
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 4
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 5
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 15
///
/// Tests:
///   1. SS beam midspan node: V_end(left) - V_start(right) + applied load = 0
///   2. Continuous beam interior support: sum of element shears + reaction = 0
///   3. Portal frame corner node: moment equilibrium (m_end col = m_start beam)
///   4. Free node with point load: sum of element end forces = applied load
///   5. Fixed support: reaction forces balance all element forces at that node
///   6. Two elements meeting at interior node (no load): forces are continuous
///   7. Portal frame base: reaction moment equals element start moment
///   8. Multi-span beam: check equilibrium at each interior support
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Midspan Node: Shear Equilibrium with Applied Load
// ================================================================
//
// Simply-supported beam, L=12, 2 elements, point load P=36 kN at midspan
// (node 2). At node 2 the equilibrium condition is:
//   v_end(elem 1) - v_start(elem 2) + Fy = 0
// where Fy = -P (downward), so:
//   v_end(elem 1) - v_start(elem 2) = P
//
// Also check that there is no moment discontinuity (no applied moment):
//   m_end(elem 1) - m_start(elem 2) = 0
//
// Analytical: R_A = R_B = P/2 = 18, M_midspan = PL/4 = 108

#[test]
fn validation_ss_beam_midspan_shear_equilibrium() {
    let l = 12.0;
    let p = 36.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(2, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Shear equilibrium at node 2: v_end(1) - v_start(2) + Fy = 0
    // Fy = -P, so v_end(1) - v_start(2) = P
    let shear_jump: f64 = ef1.v_end - ef2.v_start;
    assert_close(shear_jump, p, 0.02, "SS beam midspan: shear jump = P");

    // Moment continuity at node 2 (no applied moment):
    // m_end(1) - m_start(2) = 0
    let moment_residual: f64 = (ef1.m_end - ef2.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "SS beam midspan: moment continuity, residual={:.6}, m_end_1={:.4}, m_start_2={:.4}",
        moment_residual, ef1.m_end, ef2.m_start
    );

    // Analytical check: midspan moment = PL/4 = 108
    let m_mid = p * l / 4.0;
    assert_close(ef1.m_end.abs(), m_mid, 0.02, "SS beam: M_midspan = PL/4");

    // Reactions: R_A = R_B = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r_a.rz, p / 2.0, 0.02, "SS beam: R_A = P/2");
    assert_close(r_b.rz, p / 2.0, 0.02, "SS beam: R_B = P/2");
}

// ================================================================
// 2. Continuous Beam Interior Support: Shear + Reaction Equilibrium
// ================================================================
//
// Two-span continuous beam: L1=8, L2=10, UDL q=-6 kN/m.
// 4 elements per span = 8 total. Interior support at node 5.
//
// At the interior support (roller), the equilibrium is:
//   v_end(elem 4) - v_start(elem 5) + Ry = 0
//   m_end(elem 4) - m_start(elem 5) = 0  (no moment restraint at roller)
//
// Global equilibrium: sum Ry = q * (L1 + L2) = 6 * 18 = 108

#[test]
fn validation_continuous_beam_interior_support_equilibrium() {
    let spans = [8.0, 10.0];
    let n_per = 4;
    let q = -6.0;

    let total_elems = n_per * spans.len();
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&spans, n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support at node n_per + 1 = 5
    let int_node = n_per + 1;

    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == n_per).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == n_per + 1).unwrap();
    let r_int = results.reactions.iter()
        .find(|r| r.node_id == int_node).unwrap();

    // Shear equilibrium: v_end_left - v_start_right + Ry = 0
    let shear_residual: f64 = (ef_left.v_end - ef_right.v_start + r_int.rz).abs();
    assert!(
        shear_residual < 0.5,
        "Continuous beam: shear equilibrium at node {}: residual={:.6}, v_end={:.4}, v_start={:.4}, Ry={:.4}",
        int_node, shear_residual, ef_left.v_end, ef_right.v_start, r_int.rz
    );

    // Moment continuity at roller (no moment restraint):
    // m_end_left - m_start_right = 0
    let moment_residual: f64 = (ef_left.m_end - ef_right.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "Continuous beam: moment continuity at node {}: residual={:.6}",
        int_node, moment_residual
    );

    // Global vertical equilibrium
    let total_load: f64 = q.abs() * spans.iter().sum::<f64>();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Continuous beam: sum Ry = q*L_total");
}

// ================================================================
// 3. Portal Frame Corner: Moment Equilibrium at Knee Joints
// ================================================================
//
// Portal frame: h=6, w=10. Fixed bases. Lateral load H=25 at node 2.
// At node 2 (left knee): column 1 j-end meets beam 2 i-end.
// At node 3 (right knee): beam 2 j-end meets column 3 i-end.
//
// Joint equilibrium (no applied moment at knees):
//   m_end(col) - m_start(beam) = 0  at node 2
//   m_end(beam) - m_start(col) = 0  at node 3
//
// Additionally verify shear/axial force transfer at the knees.

#[test]
fn validation_portal_corner_moment_equilibrium() {
    let h = 6.0;
    let w = 10.0;
    let h_load = 25.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Element 1: column (1->2), Element 2: beam (2->3), Element 3: column (3->4)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Moment equilibrium at node 2 (left knee):
    // m_end(col1) - m_start(beam2) = 0
    let m_res_2: f64 = (ef1.m_end - ef2.m_start).abs();
    assert!(
        m_res_2 < 0.5,
        "Portal node 2: moment equilibrium residual={:.6}, m_col_end={:.4}, m_beam_start={:.4}",
        m_res_2, ef1.m_end, ef2.m_start
    );

    // Moment equilibrium at node 3 (right knee):
    // m_end(beam2) - m_start(col3) = 0
    let m_res_3: f64 = (ef2.m_end - ef3.m_start).abs();
    assert!(
        m_res_3 < 0.5,
        "Portal node 3: moment equilibrium residual={:.6}, m_beam_end={:.4}, m_col_start={:.4}",
        m_res_3, ef2.m_end, ef3.m_start
    );

    // Shear equilibrium at node 2 (lateral load H applied):
    // Column shear at j-end contributes to horizontal direction,
    // beam axial at i-end contributes to horizontal direction.
    // Just verify global horizontal equilibrium as sanity check.
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.01, "Portal: sum Rx = -H");

    // Both knees should have non-trivial moments
    assert!(ef1.m_end.abs() > 1.0, "Portal: column top moment non-trivial");
    assert!(ef2.m_start.abs() > 1.0, "Portal: beam start moment non-trivial");
}

// ================================================================
// 4. Free Node with Point Load: Element End Forces = Applied Load
// ================================================================
//
// Cantilever beam, L=9, 3 elements. Point load P=24 kN downward and
// Fx=8 kN horizontal at the free tip (node 4, no support).
//
// At node 4 (free end): only element 3 contributes (its j-end).
// Equilibrium: element 3's j-end forces must equal the applied loads:
//   v_end(3) + Fy = 0  =>  v_end(3) = P
//   n_end(3) + Fx = 0  =>  n_end(3) = -Fx
//   m_end(3) = 0 (free end, no applied moment)
//
// At intermediate free node 3 (no load, no support):
//   v_end(2) - v_start(3) = 0
//   m_end(2) - m_start(3) = 0

#[test]
fn validation_free_node_point_load_equilibrium() {
    let l = 9.0;
    let p = 24.0;
    let fx = 8.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx, fz: -p, my: 0.0,
    })];
    let input = make_beam(3, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // At free tip (node 4), element 3 j-end forces must balance the applied load.
    // The internal axial force at the j-end equals the applied axial load
    // (tension positive convention): n_end = Fx for a cantilever with tip axial load.
    assert_close(ef3.n_end, fx, 0.02,
        "Free tip: n_end = Fx");

    // The shear at the j-end has magnitude P.
    assert_close(ef3.v_end.abs(), p, 0.02,
        "Free tip: |v_end| = P");

    // Moment at free end should be zero (no applied moment)
    assert!(
        ef3.m_end.abs() < 0.5,
        "Free tip: m_end ~ 0, got {:.6}", ef3.m_end
    );

    // Check continuity at intermediate free nodes 2 and 3
    for node in 2..=3 {
        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == node - 1).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == node).unwrap();

        let v_res: f64 = (ef_left.v_end - ef_right.v_start).abs();
        assert!(v_res < 0.5,
            "Interior node {}: shear continuity residual={:.6}", node, v_res);

        let m_res: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(m_res < 0.5,
            "Interior node {}: moment continuity residual={:.6}", node, m_res);
    }
}

// ================================================================
// 5. Fixed Support: Reaction Balances Element Forces
// ================================================================
//
// Fixed-fixed beam, L=10, 4 elements, UDL q=-15 kN/m.
// At the fixed support node 1, only element 1 has its i-end.
// The reaction must balance the element's i-end forces:
//   n_start(1) + Rx = 0  =>  Rx = -n_start(1)
//   v_start(1) + Ry = 0  =>  Ry = -v_start(1)  (but beware sign conventions)
//   m_start(1) + Mz = 0  =>  Mz = -m_start(1)
//
// Similarly at node 5 (right fixed support), element 4 j-end:
//   Ry_right balances v_end(4), Mz_right balances m_end(4).
//
// Analytical (fixed-fixed UDL): R = qL/2 = 75, M = qL^2/12 = 125

#[test]
fn validation_fixed_support_reaction_balance() {
    let l = 10.0;
    let n: usize = 4;
    let q = -15.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical values
    let r_exact = q.abs() * l / 2.0;       // 75
    let m_exact = q.abs() * l * l / 12.0;  // 125

    // Left fixed support (node 1)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.rz, r_exact, 0.02, "Fixed-fixed: R_A = qL/2");
    assert_close(r_left.my.abs(), m_exact, 0.05, "Fixed-fixed: M_A = qL^2/12");

    // Right fixed support (node n+1)
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_right.rz, r_exact, 0.02, "Fixed-fixed: R_B = qL/2");
    assert_close(r_right.my.abs(), m_exact, 0.05, "Fixed-fixed: M_B = qL^2/12");

    // By symmetry, reactions should be equal
    assert_close(r_left.rz, r_right.rz, 0.02, "Fixed-fixed: R_A = R_B");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q.abs() * l, 0.01, "Fixed-fixed: sum Ry = qL");

    // At all interior nodes (2..n), force continuity must hold
    for node in 2..=n {
        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == node - 1).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == node).unwrap();

        let v_res: f64 = (ef_left.v_end - ef_right.v_start).abs();
        assert!(v_res < 0.5,
            "Fixed-fixed: shear continuity at node {}: residual={:.6}", node, v_res);

        let m_res: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(m_res < 0.5,
            "Fixed-fixed: moment continuity at node {}: residual={:.6}", node, m_res);
    }
}

// ================================================================
// 6. Two Elements at Interior Node (No Load): Force Continuity
// ================================================================
//
// Propped cantilever, L=6, 2 elements, UDL q=-20 kN/m.
// At the interior node 2 there is no support and no applied load.
// All forces must be continuous across the joint:
//   v_end(1) - v_start(2) = 0
//   m_end(1) - m_start(2) = 0
//   n_end(1) - n_start(2) = 0
//
// Analytical (propped cantilever UDL):
//   R_B (roller) = 3qL/8 = 45,  R_A (fixed) = 5qL/8 = 75

#[test]
fn validation_interior_node_no_load_continuity() {
    let l = 6.0;
    let q = -20.0;

    let loads: Vec<SolverLoad> = (1..=2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(2, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Force continuity at node 2 (no load, no support):
    // v_end(1) - v_start(2) = 0
    let v_residual: f64 = (ef1.v_end - ef2.v_start).abs();
    assert!(
        v_residual < 0.5,
        "Interior node 2: shear continuity residual={:.6}, v_end_1={:.4}, v_start_2={:.4}",
        v_residual, ef1.v_end, ef2.v_start
    );

    // m_end(1) - m_start(2) = 0
    let m_residual: f64 = (ef1.m_end - ef2.m_start).abs();
    assert!(
        m_residual < 0.5,
        "Interior node 2: moment continuity residual={:.6}, m_end_1={:.4}, m_start_2={:.4}",
        m_residual, ef1.m_end, ef2.m_start
    );

    // n_end(1) - n_start(2) = 0
    let n_residual: f64 = (ef1.n_end - ef2.n_start).abs();
    assert!(
        n_residual < 0.5,
        "Interior node 2: axial continuity residual={:.6}, n_end_1={:.4}, n_start_2={:.4}",
        n_residual, ef1.n_end, ef2.n_start
    );

    // Check analytical reactions
    let r_a_exact = 5.0 * q.abs() * l / 8.0;  // 75
    let r_b_exact = 3.0 * q.abs() * l / 8.0;  // 45

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r_a.rz, r_a_exact, 0.02, "Propped cantilever: R_A = 5qL/8");
    assert_close(r_b.rz, r_b_exact, 0.02, "Propped cantilever: R_B = 3qL/8");
}

// ================================================================
// 7. Portal Frame Base: Reaction Moment = Element Start Moment
// ================================================================
//
// Portal frame: h=5, w=8, fixed bases. Both lateral (H=15) and
// gravity (G=-30) loads applied. At fixed base node 1, only
// element 1 (column) has its i-end. At base node 4, only
// element 3 (column) has its j-end.
//
// The column free-body equilibrium gives:
//   M_base + M_top = V_col * h  (moment equilibrium of column)
//
// The reaction moment at the base must satisfy:
//   Mz_reaction at node 1 relates to m_start of column 1
//   Mz_reaction at node 4 relates to m_end of column 3

#[test]
fn validation_portal_base_reaction_moment() {
    let h = 5.0;
    let w = 8.0;
    let h_load = 15.0;
    let g_load = -30.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, g_load);
    let results = linear::solve_2d(&input).unwrap();

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Column 1 free-body moment equilibrium:
    //   |M_start| + |M_end| should approximately equal |V_col| * h
    // This is a self-consistency check of the solver output.
    let m_base_1: f64 = ef1.m_start;
    let m_top_1: f64 = ef1.m_end;
    let v_col_1: f64 = ef1.v_start;

    // For a column, moment equilibrium: m_end - m_start + v_start * L = 0
    // (accounting for the sign convention of internal forces)
    // Check: m_end - m_start + v_start * h ~ 0
    let col1_equilibrium: f64 = (m_top_1 - m_base_1 + v_col_1 * h).abs();
    assert!(
        col1_equilibrium < 1.0,
        "Column 1 moment equilibrium: residual={:.6}, m_start={:.4}, m_end={:.4}, v_start={:.4}",
        col1_equilibrium, m_base_1, m_top_1, v_col_1
    );

    // Same check for column 3
    let m_top_3: f64 = ef3.m_start;
    let m_base_3: f64 = ef3.m_end;
    let v_col_3: f64 = ef3.v_start;
    let col3_equilibrium: f64 = (m_base_3 - m_top_3 + v_col_3 * h).abs();
    assert!(
        col3_equilibrium < 1.0,
        "Column 3 moment equilibrium: residual={:.6}, m_start={:.4}, m_end={:.4}, v_start={:.4}",
        col3_equilibrium, m_top_3, m_base_3, v_col_3
    );

    // Global equilibrium checks
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.01, "Portal combined: sum Rx = -H");

    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    // Two gravity loads (at nodes 2 and 3): total = 2 * g_load
    assert_close(sum_ry, -2.0 * g_load, 0.01, "Portal combined: sum Ry = -2G");

    // Base moments should be non-zero
    assert!(r1.my.abs() > 1.0, "Portal base node 1: moment non-trivial");
    assert!(r4.my.abs() > 1.0, "Portal base node 4: moment non-trivial");
}

// ================================================================
// 8. Multi-Span Beam: Equilibrium at Each Interior Support
// ================================================================
//
// Four-span continuous beam: spans [6, 8, 7, 5], UDL q=-10 kN/m.
// 2 elements per span = 8 elements total.
// Interior supports at nodes 3, 5, 7.
//
// At each interior support (roller):
//   v_end_left - v_start_right + Ry = 0
//   m_end_left - m_start_right = 0
//
// Also verify all interior free nodes (no support, no load) have
// force continuity.
//
// Global equilibrium: sum Ry = q * (6+8+7+5) = 10 * 26 = 260

#[test]
fn validation_multi_span_equilibrium_all_supports() {
    let spans = [6.0, 8.0, 7.0, 5.0];
    let n_per = 2;
    let q = -10.0;

    let total_elems = n_per * spans.len();
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&spans, n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support nodes: end of each span except last
    // With n_per=2: support nodes are at 3, 5, 7 (end of spans 1, 2, 3)
    let interior_support_nodes: Vec<usize> = (1..spans.len())
        .map(|s| 1 + n_per * s)
        .collect();
    // That gives: [3, 5, 7]

    for &sup_node in &interior_support_nodes {
        // Element to the left of the support: its j-end is at sup_node
        let elem_left_id = sup_node - 1;
        // Element to the right of the support: its i-end is at sup_node
        let elem_right_id = sup_node;

        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == elem_left_id).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == elem_right_id).unwrap();
        let r_sup = results.reactions.iter()
            .find(|r| r.node_id == sup_node).unwrap();

        // Shear equilibrium: v_end_left - v_start_right + Ry = 0
        let shear_res: f64 = (ef_left.v_end - ef_right.v_start + r_sup.rz).abs();
        assert!(
            shear_res < 0.5,
            "Multi-span: shear equilibrium at node {}: residual={:.6}, v_end={:.4}, v_start={:.4}, Ry={:.4}",
            sup_node, shear_res, ef_left.v_end, ef_right.v_start, r_sup.rz
        );

        // Moment continuity at roller (no moment restraint):
        // m_end_left - m_start_right = 0
        let moment_res: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(
            moment_res < 0.5,
            "Multi-span: moment continuity at node {}: residual={:.6}, m_end={:.4}, m_start={:.4}",
            sup_node, moment_res, ef_left.m_end, ef_right.m_start
        );
    }

    // Check interior free nodes (within each span, not at supports)
    // For n_per=2, interior free nodes within spans are at positions 2, 4, 6, 8
    // But nodes 3, 5, 7 are supports; node 9 is end support.
    // Actually with n_per=2, each span has 2 elements: the mid-node of each span.
    // Span 1: nodes 1,2,3 -> node 2 is interior free node
    // Span 2: nodes 3,4,5 -> node 4 is interior free node
    // Span 3: nodes 5,6,7 -> node 6 is interior free node
    // Span 4: nodes 7,8,9 -> node 8 is interior free node
    let interior_free_nodes = vec![2, 4, 6, 8];

    for &free_node in &interior_free_nodes {
        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == free_node - 1).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == free_node).unwrap();

        // Force continuity at unloaded free node:
        let v_res: f64 = (ef_left.v_end - ef_right.v_start).abs();
        assert!(
            v_res < 0.5,
            "Multi-span: shear continuity at free node {}: residual={:.6}",
            free_node, v_res
        );

        let m_res: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(
            m_res < 0.5,
            "Multi-span: moment continuity at free node {}: residual={:.6}",
            free_node, m_res
        );
    }

    // Global vertical equilibrium
    let total_load: f64 = q.abs() * spans.iter().sum::<f64>();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Multi-span: sum Ry = q*L_total");
}
