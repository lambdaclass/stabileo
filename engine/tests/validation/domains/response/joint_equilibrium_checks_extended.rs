/// Validation: Joint Equilibrium Checks — Extended
///
/// These tests verify internal joint equilibrium: at every internal node where
/// elements meet, the sum of element end forces must balance applied nodal loads
/// and reactions. Unlike the original file which checks global equilibrium (sum
/// of all reactions = sum of all loads), these tests inspect local force balance
/// at interior joints using element end forces.
///
/// Sign convention for joint equilibrium:
///   The solver reports element forces as true internal forces. At a joint where
///   element A has its j-end and element B has its i-end, the equilibrium is:
///
///     m_end_A  -  m_start_B  +  M_applied  =  0
///     v_end_A  -  v_start_B  +  Fy_ext     =  0
///     n_end_A  -  n_start_B  +  Fx_ext     =  0
///
///   where Fy_ext / Fx_ext / M_applied include both applied loads and reactions.
///   At free interior nodes (no support, no applied load), this simplifies to:
///     m_end_A = m_start_B,  v_end_A = v_start_B,  n_end_A = n_start_B
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 15 (matrix stiffness method)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 5 (joint equilibrium)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 15 (stiffness method)
///   - McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 4
///
/// Tests:
///   1. Two-span continuous beam — shear balance at interior support
///   2. Two-span continuous beam — moment balance at interior support
///   3. Fixed-fixed beam with midspan load — shear jump equals applied force
///   4. Portal frame beam-column joint — moment balance at knee
///   5. Three-span beam with UDL — force balance at all interior supports
///   6. L-frame corner joint — shear and axial force transfer
///   7. Propped cantilever — element force consistency with reactions
///   8. Symmetric portal under symmetric load — antisymmetric moment check
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Span Continuous Beam — Shear Balance at Interior Support
// ================================================================
//
// Two-span continuous beam: spans L1=6, L2=6, UDL q=-10 kN/m.
// 4 elements per span = 8 elements total. Interior support at node 5.
//
// At the interior support (node 5), element 4 has its j-end and element 5
// has its i-end. The joint equilibrium for shear is:
//   v_end_4 - v_start_5 + Ry = 0
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., Section 5.3
// For a two-span continuous beam with equal spans L and UDL q:
//   R_interior = 1.25 * q * L (by three-moment equation)

#[test]
fn validation_two_span_shear_balance_at_interior() {
    let spans = [6.0, 6.0];
    let n_per = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..(n_per * spans.len()) {
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

    // Interior support is at node n_per+1 = 5
    let interior_node = n_per + 1;

    // Element 4 ends at node 5 (j-end), element 5 starts at node 5 (i-end)
    let ef4 = results.element_forces.iter().find(|e| e.element_id == n_per).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == n_per + 1).unwrap();

    // The reaction at interior support
    let r_int = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();

    // Joint equilibrium: v_end_left - v_start_right + Ry = 0
    let residual: f64 = (ef4.v_end - ef5.v_start + r_int.rz).abs();
    assert!(
        residual < 0.5,
        "Two-span shear balance at interior: residual={:.6}, Ry={:.4}, v4_end={:.4}, v5_start={:.4}",
        residual, r_int.rz, ef4.v_end, ef5.v_start
    );

    // Also verify total vertical equilibrium
    let total_load: f64 = q.abs() * spans.iter().sum::<f64>();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Two-span: global vert. equilibrium");
}

// ================================================================
// 2. Two-Span Continuous Beam — Moment Balance at Interior Support
// ================================================================
//
// Same two-span beam as test 1. At the interior support (node 5),
// element 4 has its j-end and element 5 has its i-end. The moment
// equilibrium at a roller (no applied moment, no moment restraint) is:
//   m_end_left - m_start_right = 0
// i.e., the moments from the two elements at the joint must be equal.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Section 15.4

#[test]
fn validation_two_span_moment_balance_at_interior() {
    let spans = [6.0, 6.0];
    let n_per = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..(n_per * spans.len()) {
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

    // Element n_per ends at interior node (j-end), element n_per+1 starts there (i-end)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == n_per).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n_per + 1).unwrap();

    // At interior roller (no applied moment), moment equilibrium requires:
    // m_end_left - m_start_right = 0  =>  m_end_left = m_start_right
    let moment_residual: f64 = (ef_left.m_end - ef_right.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "Two-span moment balance at interior: residual={:.6}, m_left_end={:.4}, m_right_start={:.4}",
        moment_residual, ef_left.m_end, ef_right.m_start
    );

    // For symmetric two-span beam with UDL, the interior moment magnitude should be
    // M_interior = q*L^2/8 (by three-moment equation for equal spans)
    let l = spans[0];
    let m_interior = q.abs() * l * l / 8.0;
    // The m_end of the left element at the interior support should be close to this
    assert_close(ef_left.m_end.abs(), m_interior, 0.05, "Two-span: M_interior = qL^2/8");
}

// ================================================================
// 3. Fixed-Fixed Beam — Shear Jump at Load Point Equals Applied Force
// ================================================================
//
// Fixed-fixed beam, L=8, point load P=48 at midspan (node 5 for n=8).
// At the loaded node, joint equilibrium gives:
//   v_end_left - v_start_right + Fy = 0
// where Fy = -P (downward), so:
//   v_end_left - v_start_right = P
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 4.3
// By symmetry: R_A = R_B = P/2, M_A = M_B = PL/8 = 48.

#[test]
fn validation_fixed_beam_shear_jump_at_load_point() {
    let l = 8.0;
    let n: usize = 8;
    let p = 48.0;

    let mid_node = n / 2 + 1; // node 5
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Element n/2 ends at mid_node (j-end), element n/2+1 starts there (i-end)
    let elem_left = n / 2; // element 4
    let elem_right = n / 2 + 1; // element 5

    let ef_left = results.element_forces.iter().find(|e| e.element_id == elem_left).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == elem_right).unwrap();

    // Joint equilibrium: v_end_left - v_start_right + Fy = 0
    // Fy = -P (downward), so: v_end_left - v_start_right = P
    let shear_jump: f64 = ef_left.v_end - ef_right.v_start;
    assert_close(shear_jump, p, 0.02, "Shear jump at load point = P");

    // Moment continuity at loaded node (no applied moment):
    // m_end_left - m_start_right = 0
    let moment_residual: f64 = (ef_left.m_end - ef_right.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "Moment continuity at load point: residual={:.6}",
        moment_residual
    );

    // By symmetry, reactions should be P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "Fixed beam: R_A = P/2");
    assert_close(r_end.rz, p / 2.0, 0.02, "Fixed beam: R_B = P/2");

    // Fixed-end moments = PL/8
    let fem = p * l / 8.0;
    assert_close(r1.my.abs(), fem, 0.02, "Fixed beam: M_A = PL/8");
    assert_close(r_end.my.abs(), fem, 0.02, "Fixed beam: M_B = PL/8");
}

// ================================================================
// 4. Portal Frame — Moment Balance at Beam-Column Joint (Knee)
// ================================================================
//
// Portal frame: nodes 1(0,0), 2(0,5), 3(8,5), 4(8,0). Fixed bases.
// Lateral load H=20 at node 2.
//
// At node 2 (knee joint), element 1 (column, j-end) and element 2
// (beam, i-end) meet. No applied moment at node 2, so:
//   m_end_col - m_start_beam = 0  =>  m_end_col = m_start_beam
//
// Reference: McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 4

#[test]
fn validation_portal_moment_balance_at_knee() {
    let h = 5.0;
    let w = 8.0;
    let h_load = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Element 1: column from node 1 to node 2 (j-end at node 2)
    // Element 2: beam from node 2 to node 3 (i-end at node 2)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Moment equilibrium at node 2 (no applied moment):
    // m_end_col - m_start_beam = 0
    let moment_residual: f64 = (ef1.m_end - ef2.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "Portal knee moment balance at node 2: residual={:.6}, m_col_end={:.4}, m_beam_start={:.4}",
        moment_residual, ef1.m_end, ef2.m_start
    );

    // Similarly check node 3 (beam j-end meets column 3 i-end):
    // Element 2: beam j-end at node 3, Element 3: column i-end at node 3
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let moment_residual_3: f64 = (ef2.m_end - ef3.m_start).abs();
    assert!(
        moment_residual_3 < 0.5,
        "Portal knee moment balance at node 3: residual={:.6}, m_beam_end={:.4}, m_col_start={:.4}",
        moment_residual_3, ef2.m_end, ef3.m_start
    );

    // Global horizontal equilibrium as sanity check
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -h_load, 0.01, "Portal: sum Rx = -H");
}

// ================================================================
// 5. Three-Span Beam — Force Balance at All Interior Supports
// ================================================================
//
// Three-span continuous beam: L1=5, L2=7, L3=5, UDL q=-8 kN/m.
// 4 elements per span = 12 elements total.
// Interior supports at nodes 5 and 9.
// At each interior support, the joint equilibrium is:
//   v_end_left - v_start_right + Ry = 0
//   m_end_left - m_start_right = 0  (roller has no moment restraint)
//
// Reference: Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 5
// Global equilibrium: sum Ry = q * (L1+L2+L3) = 8 * 17 = 136

#[test]
fn validation_three_span_force_balance_all_interior() {
    let spans = [5.0, 7.0, 5.0];
    let n_per = 4;
    let q = -8.0;

    let total_elements = n_per * spans.len();
    let mut loads = Vec::new();
    for i in 0..total_elements {
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

    // Interior support nodes: node 5 (end of span 1), node 9 (end of span 2)
    let interior_nodes = vec![n_per + 1, 2 * n_per + 1]; // nodes 5, 9

    for &int_node in &interior_nodes {
        // Elements meeting at this node
        let elem_left_id = int_node - 1; // element ending at this node
        let elem_right_id = int_node;    // element starting at this node

        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == elem_left_id).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == elem_right_id).unwrap();

        // Reaction at this interior support
        let r_int = results.reactions.iter()
            .find(|r| r.node_id == int_node).unwrap();

        // Shear equilibrium: v_end_left - v_start_right + Ry = 0
        let shear_residual: f64 = (ef_left.v_end - ef_right.v_start + r_int.rz).abs();
        assert!(
            shear_residual < 0.5,
            "Three-span shear balance at node {}: residual={:.6}",
            int_node, shear_residual
        );

        // Moment equilibrium (no applied moment at roller):
        // m_end_left - m_start_right = 0
        let moment_residual: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(
            moment_residual < 0.5,
            "Three-span moment balance at node {}: residual={:.6}",
            int_node, moment_residual
        );
    }

    // Global vertical equilibrium
    let total_load: f64 = q.abs() * spans.iter().sum::<f64>();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Three-span: sum Ry = q*L_total");
}

// ================================================================
// 6. L-Frame — Shear and Axial Force Transfer at Corner Joint
// ================================================================
//
// L-frame: vertical column (node 1 at (0,0) to node 2 at (0,4))
// and horizontal beam (node 2 at (0,4) to node 3 at (6,4)).
// Fixed at node 1, free at node 3. Tip load P=30 downward at node 3.
//
// At the corner joint (node 2), column j-end meets beam i-end.
// The column is vertical, so its local axial direction is global Y;
// the beam is horizontal, so its local axial direction is global X.
//
// Joint equilibrium at node 2 (no external force/moment):
//   m_end_col - m_start_beam = 0  =>  m_end_col = m_start_beam
//
// Force transfer: the beam shear (local V) maps to global Y,
// and the column axial (local N) maps to global Y.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Section 15.6

#[test]
fn validation_l_frame_force_transfer_at_corner() {
    let h = 4.0;
    let w = 6.0;
    let p = 30.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // vertical column
            (2, "frame", 2, 3, 1, 1, false, false), // horizontal beam
        ],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef_col = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Global equilibrium checks first
    let r1 = &results.reactions[0];
    assert_close(r1.rz, p, 0.02, "L-frame: R_y = P");

    // Moment equilibrium at node 2 (no applied moment):
    // m_end_col - m_start_beam = 0
    let moment_residual: f64 = (ef_col.m_end - ef_beam.m_start).abs();
    assert!(
        moment_residual < 0.5,
        "L-frame corner moment balance: residual={:.6}, m_col_end={:.4}, m_beam_start={:.4}",
        moment_residual, ef_col.m_end, ef_beam.m_start
    );

    // The beam carries the vertical load P as shear at its start.
    // For a cantilever beam with tip load, v_start = P (upward on left face).
    assert_close(ef_beam.v_start.abs(), p, 0.05, "L-frame: beam shear at start ~ P");

    // The column's axial force at j-end must transfer the gravity load.
    // The column local axis points from node 1 to node 2 (upward),
    // so local N corresponds to global Y. The column carries the beam's weight.
    assert_close(ef_col.n_end.abs(), p, 0.05, "L-frame: column axial at j-end ~ P");

    // Moment at fixed base: M = P * w (beam creates moment arm w about base)
    // plus any secondary effect from column shear * h
    // For the pure cantilever L-frame: M_base = P * w = 30 * 6 = 180
    let m_base_expected = p * w;
    assert_close(r1.my.abs(), m_base_expected, 0.05, "L-frame: M_base = P*w");
}

// ================================================================
// 7. Propped Cantilever — Element Force Consistency with Reactions
// ================================================================
//
// Propped cantilever: fixed at left (node 1), roller at right (node n+1).
// UDL q=-12 kN/m, L=8.
//
// Analytical results (Timoshenko & Gere):
//   R_B (roller) = 3qL/8 = 3*12*8/8 = 36 kN
//   R_A (fixed)  = 5qL/8 = 5*12*8/8 = 60 kN
//   M_A (fixed)  = qL^2/8 = 12*64/8 = 96 kN-m
//
// At every interior node (no support), the element end forces must be
// continuous: m_end_left = m_start_right, v_end_left = v_start_right.
// At the roller end (node n+1), the moment should be zero (free rotation).
//
// Reference: Timoshenko & Gere, "Mechanics of Materials", Table A (beam formulas)

#[test]
fn validation_propped_cantilever_element_force_consistency() {
    let l = 8.0;
    let n: usize = 8;
    let q = -12.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions
    let r_b_exact = 3.0 * q.abs() * l / 8.0;  // 36
    let r_a_exact = 5.0 * q.abs() * l / 8.0;  // 60
    let m_a_exact = q.abs() * l * l / 8.0;     // 96

    // Check reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.rz, r_a_exact, 0.02, "Propped cantilever: R_A = 5qL/8");
    assert_close(r_b.rz, r_b_exact, 0.02, "Propped cantilever: R_B = 3qL/8");
    assert_close(r_a.my.abs(), m_a_exact, 0.02, "Propped cantilever: M_A = qL^2/8");

    // Global equilibrium: sum Ry = qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q.abs() * l, 0.01, "Propped cantilever: sum Ry = qL");

    // The last element's j-end moment should be ~0 at the roller (free rotation)
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(
        ef_last.m_end.abs() < 1.0,
        "Propped cantilever: moment at roller end ~ 0, got {:.4}",
        ef_last.m_end
    );

    // Check joint equilibrium at every interior node (nodes 2 through n)
    // No supports or applied loads at interior nodes, so:
    //   m_end_left - m_start_right = 0
    //   v_end_left - v_start_right = 0
    for node in 2..=n {
        let ef_left = results.element_forces.iter()
            .find(|e| e.element_id == node - 1).unwrap();
        let ef_right = results.element_forces.iter()
            .find(|e| e.element_id == node).unwrap();

        // Moment continuity at interior node:
        let m_residual: f64 = (ef_left.m_end - ef_right.m_start).abs();
        assert!(
            m_residual < 0.5,
            "Propped cantilever: moment balance at node {}: residual={:.6}",
            node, m_residual
        );

        // Shear continuity at interior node:
        let v_residual: f64 = (ef_left.v_end - ef_right.v_start).abs();
        assert!(
            v_residual < 0.5,
            "Propped cantilever: shear balance at node {}: residual={:.6}",
            node, v_residual
        );
    }
}

// ================================================================
// 8. Symmetric Portal Under Symmetric Load — Antisymmetric Moments
// ================================================================
//
// Symmetric portal frame: h=4, w=8. Fixed bases at nodes 1 and 4.
// Symmetric gravity load G=50 at nodes 2 and 3 (downward).
// By symmetry, the structure deforms symmetrically:
//   - Column moments at bases are equal: |M_1| = |M_4|
//   - Base reactions are equal: R1_y = R4_y = G
//   - Horizontal reactions vanish: R1_x = R4_x = 0
//   - Beam end moments are equal in magnitude: |m_start_beam| = |m_end_beam|
//   - Joint equilibrium at knee nodes: m_end_col = m_start_beam
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Section 15.5

#[test]
fn validation_symmetric_portal_antisymmetric_moments() {
    let h = 4.0;
    let w = 8.0;
    let g = 50.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -g);
    let results = linear::solve_2d(&input).unwrap();

    // Elements: 1 (col 1->2), 2 (beam 2->3), 3 (col 3->4)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // By symmetry: base reactions are equal
    assert_close(r1.rz, r4.rz, 0.02, "Symmetric portal: R1_y = R4_y");
    assert_close(r1.rz, g, 0.02, "Symmetric portal: R1_y = G");

    // Horizontal reactions are zero (no lateral load, symmetric structure)
    assert!(
        r1.rx.abs() < 0.01,
        "Symmetric portal: R1_x ~ 0, got {:.6}",
        r1.rx
    );
    assert!(
        r4.rx.abs() < 0.01,
        "Symmetric portal: R4_x ~ 0, got {:.6}",
        r4.rx
    );

    // Base moments equal in magnitude (same sign due to symmetry)
    assert_close(r1.my.abs(), r4.my.abs(), 0.02, "Symmetric portal: |M1| = |M4|");

    // Moment balance at node 2: m_end_col1 - m_start_beam = 0
    let m_residual_2: f64 = (ef1.m_end - ef2.m_start).abs();
    assert!(
        m_residual_2 < 0.5,
        "Symmetric portal: moment balance at node 2, residual={:.6}",
        m_residual_2
    );

    // Moment balance at node 3: m_end_beam - m_start_col3 = 0
    let m_residual_3: f64 = (ef2.m_end - ef3.m_start).abs();
    assert!(
        m_residual_3 < 0.5,
        "Symmetric portal: moment balance at node 3, residual={:.6}",
        m_residual_3
    );

    // Beam end moments should be equal in magnitude (symmetric loading)
    assert_close(
        ef2.m_start.abs(), ef2.m_end.abs(), 0.02,
        "Symmetric portal: |m_beam_start| = |m_beam_end|"
    );
}
