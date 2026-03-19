/// Validation: Transfer Matrix Method — Force and Displacement Transfer Along Beams
///
/// References:
///   - Pestel & Leckie, "Matrix Methods in Elastomechanics", McGraw-Hill (1963)
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., McGraw-Hill
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// The transfer matrix method propagates a state vector (force, moment, displacement,
/// rotation) from one end of a member to the other. The FEM stiffness method produces
/// element forces that must satisfy the same compatibility and equilibrium conditions.
/// These tests verify that force/moment values "transfer" correctly between elements
/// by checking that the stiffness solver reproduces the exact analytical results.
///
/// Tests:
///   1. SS beam UDL: force transfer — V and M match analytic distribution
///   2. Fixed beam: moment transfer at joints — fixed-end moments exact
///   3. Carry-over: moment from loaded span reaches far end of SS beam
///   4. Cantilever: force accumulation along length under UDL
///   5. Two-span beam: force transfer across intermediate support
///   6. Element stiffness scaling: subdivision does not change global response
///   7. Transfer of nodal load through structure: shear continuity
///   8. Global equilibrium maintained through force transfer
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: V and M Transfer Match Analytic Distribution
// ================================================================
//
// For a simply-supported beam of length L under UDL q:
//   V(x) = q(L/2 - x)
//   M(x) = qx(L-x)/2
//
// The FEM element forces must reproduce this parabolic moment distribution.
// We discretize into n elements and check the start-of-element shear and
// moment against the analytic formulae at each element's left node.
//
// Source: Timoshenko & Young, "Theory of Structures", §3.2.

#[test]
fn validation_transfer_ss_udl_distribution() {
    let l = 8.0;
    let n = 8;
    let q = -10.0; // kN/m (downward)

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    for elem_id in 1..=n {
        let x_i = (elem_id - 1) as f64 * elem_len; // position of left node
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();

        // Analytic shear at x_i: V(x) = q_abs*(L/2 - x)  (positive = upward)
        let v_exact = q.abs() * (l / 2.0 - x_i);

        // Analytic moment at x_i: M(x) = q_abs * x * (L - x) / 2
        let m_exact = q.abs() * x_i * (l - x_i) / 2.0;

        let v_err = (ef.v_start - v_exact).abs() / (v_exact.abs().max(1.0));
        let m_err = (ef.m_start.abs() - m_exact.abs()).abs() / (m_exact.abs().max(1.0));

        assert!(v_err < 0.05,
            "Elem {} V_start={:.4}, analytic={:.4}, err={:.1}%",
            elem_id, ef.v_start, v_exact, v_err * 100.0);
        assert!(m_err < 0.05,
            "Elem {} M_start={:.4}, analytic={:.4}, err={:.1}%",
            elem_id, ef.m_start.abs(), m_exact.abs(), m_err * 100.0);
    }
}

// ================================================================
// 2. Fixed Beam: Moment Transfer at Joints — Fixed-End Moments
// ================================================================
//
// A fixed-fixed beam under UDL q develops end moments M_end = qL²/12
// and a midspan moment M_mid = qL²/24. These are the classical
// fixed-end moments used in the moment distribution (Hardy Cross) method.
//
// The transfer matrix for this case propagates the fixed-end moment from
// the support through the span to produce the parabolic moment variation.
//
// Source: McGuire et al., "Matrix Structural Analysis", §3.4.

#[test]
fn validation_transfer_fixed_beam_end_moments() {
    let l = 6.0;
    let n = 8;
    let q = -12.0; // kN/m

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moment: M_fe = qL²/12
    let m_fe = q.abs() * l * l / 12.0;

    // Moment at start of first element (fixed left end)
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_err_start = (ef1.m_start.abs() - m_fe).abs() / m_fe;
    assert!(m_err_start < 0.02,
        "Fixed-fixed M_start: {:.4}, exact qL²/12={:.4}, err={:.1}%",
        ef1.m_start.abs(), m_fe, m_err_start * 100.0);

    // Moment at end of last element (fixed right end)
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    let m_err_end = (ef_last.m_end.abs() - m_fe).abs() / m_fe;
    assert!(m_err_end < 0.02,
        "Fixed-fixed M_end: {:.4}, exact qL²/12={:.4}, err={:.1}%",
        ef_last.m_end.abs(), m_fe, m_err_end * 100.0);

    // Midspan moment: M_mid = qL²/24
    let m_mid = q.abs() * l * l / 24.0;
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter().find(|f| f.element_id == mid_elem).unwrap();
    let m_mid_fem = ef_mid.m_end.abs().min(
        results.element_forces.iter()
            .find(|f| f.element_id == mid_elem + 1).unwrap()
            .m_start.abs()
    );
    let m_err_mid = (m_mid_fem - m_mid).abs() / m_mid;
    assert!(m_err_mid < 0.05,
        "Fixed-fixed M_mid: {:.4}, exact qL²/24={:.4}, err={:.1}%",
        m_mid_fem, m_mid, m_err_mid * 100.0);
}

// ================================================================
// 3. Carry-Over: Moment from Loaded Span Reaches Far End
// ================================================================
//
// In the moment distribution method, applying a moment at one end of a
// beam "carries over" half its value to the far end when that end is fixed.
// Here we verify the slope-deflection equations:
//   M_near = (4EI/L)θ + (2EI/L)θ_far   (propped condition)
// For a fixed-far-end beam with an applied moment at the near end M_near,
// the carry-over moment at the far end is M_far = M_near / 2.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., §11.3 (Moment Distribution).

#[test]
fn validation_transfer_carry_over_moment() {
    let l = 6.0;
    let n = 6;
    let m_applied = 30.0; // kN·m applied at near end

    // Fixed-far-end beam: fixed at node 1, free at node n+1 with an applied moment
    // This is equivalent to: fixed at A, pin at B, with moment M applied at B.
    // Carry-over to A: M_A = M_B / 2 (Hardy Cross carry-over factor = 1/2 for far-fixed).
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m_applied,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // The carry-over moment at the fixed end = M_applied / 2
    let m_carry_over = m_applied / 2.0;
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_err = (r_fixed.my.abs() - m_carry_over).abs() / m_carry_over;
    assert!(m_err < 0.02,
        "Carry-over: M_fixed={:.4}, expected M/2={:.4}, err={:.1}%",
        r_fixed.my.abs(), m_carry_over, m_err * 100.0);

    // The applied-end reaction moment should be the full moment (roller provides no moment)
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_roller.my.abs() < 1e-6,
        "Roller end moment should be zero, got {:.6e}", r_roller.my);
}

// ================================================================
// 4. Cantilever: Force Accumulation Along Length Under UDL
// ================================================================
//
// For a cantilever with UDL q, the shear at distance x from the free tip is:
//   V(x) = q * x
// and the moment is:
//   M(x) = q * x² / 2
//
// The transfer matrix method accumulates these forces from the free end.
// This tests that the FEM shear and moment at each element's right node
// correctly accumulates from zero (at free tip) to qL and qL²/2 (at fixed end).
//
// Source: Pestel & Leckie, "Matrix Methods in Elastomechanics", §4.2.

#[test]
fn validation_transfer_cantilever_force_accumulation() {
    let l = 6.0;
    let n = 6;
    let q = -10.0; // kN/m downward

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    // Check shear and moment at the end (right node) of each element,
    // measuring distance from the free tip = l - x_j where x_j is the node position.
    for elem_id in 1..=n {
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();
        let x_i = (elem_id - 1) as f64 * elem_len; // left node position from fixed end
        // Distance from free tip to left node of this element
        let dist_from_tip = l - x_i;

        // V at left node = q_abs * dist_from_tip
        let v_exact = q.abs() * dist_from_tip;
        // M at left node = q_abs * dist_from_tip² / 2
        let m_exact = q.abs() * dist_from_tip * dist_from_tip / 2.0;

        let v_err = (ef.v_start.abs() - v_exact).abs() / v_exact;
        let m_err = (ef.m_start.abs() - m_exact).abs() / m_exact;

        assert!(v_err < 0.05,
            "Cantilever elem {} V_start={:.4}, exact={:.4}, err={:.1}%",
            elem_id, ef.v_start.abs(), v_exact, v_err * 100.0);
        assert!(m_err < 0.05,
            "Cantilever elem {} M_start={:.4}, exact={:.4}, err={:.1}%",
            elem_id, ef.m_start.abs(), m_exact, m_err * 100.0);
    }
}

// ================================================================
// 5. Two-Span Beam: Force Transfer Across Intermediate Support
// ================================================================
//
// Two equal spans, each loaded with UDL q. The three-moment equation gives
// the intermediate support reaction R_B = 10qL/8 = 5qL/4 for equal spans.
// This reaction is the sum of shear forces "transferred" from both spans
// to the internal support.
//
// V_left_of_B  + V_right_of_B = R_B
//
// Source: Timoshenko & Young, "Theory of Structures", §3.10.

#[test]
fn validation_transfer_two_span_intermediate() {
    let l = 5.0;
    let n_per = 4;
    let n_total = 2 * n_per;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Element just to the left of intermediate support (element n_per)
    let ef_left = results.element_forces.iter()
        .find(|f| f.element_id == n_per).unwrap();
    // Element just to the right of intermediate support (element n_per + 1)
    let ef_right = results.element_forces.iter()
        .find(|f| f.element_id == n_per + 1).unwrap();

    // The shear just to the left comes in as v_end of left-span last element
    // The shear just to the right starts as v_start of right-span first element
    // Sum of magnitudes (they act in opposite directions at the support)
    let v_left = ef_left.v_end.abs();
    let v_right = ef_right.v_start.abs();
    let r_b_fem = v_left + v_right;

    // Exact: R_B = 10qL/8
    let r_b_exact = 10.0 * q.abs() * l / 8.0;
    let err = (r_b_fem - r_b_exact).abs() / r_b_exact;
    assert!(err < 0.05,
        "Two-span R_B: V_left+V_right={:.4}, exact 10qL/8={:.4}, err={:.1}%",
        r_b_fem, r_b_exact, err * 100.0);

    // Reaction from solver should also match
    let rb_reaction = results.reactions.iter()
        .find(|r| r.node_id == n_per + 1).unwrap().rz;
    let err_r = (rb_reaction - r_b_exact).abs() / r_b_exact;
    assert!(err_r < 0.02,
        "Two-span R_B reaction: {:.4}, exact 10qL/8={:.4}, err={:.1}%",
        rb_reaction, r_b_exact, err_r * 100.0);
}

// ================================================================
// 6. Element Stiffness Scaling: Finer Mesh Gives Same Global Result
// ================================================================
//
// A fundamental property of the stiffness method is convergence with
// mesh refinement. A coarse and fine mesh of the same structure must
// produce the same (or very close) global deflections and reactions.
// The exact results for a cantilever under point load (PL³/3EI) hold
// regardless of the number of elements.
//
// Source: McGuire et al., "Matrix Structural Analysis", §2.8.

#[test]
fn validation_transfer_mesh_independence() {
    let l = 6.0;
    let p = 15.0;

    // Coarse mesh: 2 elements
    let input_coarse = make_beam(2, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_coarse = linear::solve_2d(&input_coarse).unwrap();
    let tip_coarse = res_coarse.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz.abs();

    // Fine mesh: 10 elements
    let input_fine = make_beam(10, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 11, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_fine = linear::solve_2d(&input_fine).unwrap();
    let tip_fine = res_fine.displacements.iter()
        .find(|d| d.node_id == 11).unwrap().uz.abs();

    // Both should agree to within 1%
    let diff = (tip_coarse - tip_fine).abs() / tip_fine;
    assert!(diff < 0.01,
        "Mesh independence: coarse δ={:.6e}, fine δ={:.6e}, diff={:.2}%",
        tip_coarse, tip_fine, diff * 100.0);

    // Both should match exact PL³/(3EI)
    let e_eff = E * 1000.0;
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let err = (tip_fine - delta_exact).abs() / delta_exact;
    assert!(err < 0.01,
        "Mesh fine vs exact: δ={:.6e}, exact PL³/3EI={:.6e}, err={:.1}%",
        tip_fine, delta_exact, err * 100.0);
}

// ================================================================
// 7. Transfer of Nodal Load Through Structure: Shear Continuity
// ================================================================
//
// A nodal load creates a shear discontinuity at its node.
// All elements away from the load node must carry the same constant shear
// (assuming no other distributed loads). This verifies that the shear force
// is correctly transferred from the loading point to both supports.
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., §4.2.

#[test]
fn validation_transfer_nodal_load_shear_continuity() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    // Load at midspan of SS beam
    let mid = n / 2 + 1; // node 5 for n=8
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    // Shear in left half should be constant at P/2
    let v_left_expected = p / 2.0;
    for elem_id in 1..mid {
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();
        let err = (ef.v_start.abs() - v_left_expected).abs() / v_left_expected;
        assert!(err < 0.02,
            "Left half elem {} V={:.4}, expected P/2={:.4}",
            elem_id, ef.v_start.abs(), v_left_expected);
    }

    // Shear in right half should be constant at P/2 (opposite sign)
    for elem_id in mid..=n {
        let ef = results.element_forces.iter()
            .find(|f| f.element_id == elem_id).unwrap();
        let err = (ef.v_start.abs() - v_left_expected).abs() / v_left_expected;
        assert!(err < 0.02,
            "Right half elem {} V={:.4}, expected P/2={:.4}",
            elem_id, ef.v_start.abs(), v_left_expected);
    }
}

// ================================================================
// 8. Global Equilibrium Maintained Through Force Transfer
// ================================================================
//
// For any structure, global equilibrium requires:
//   ΣFx = 0,  ΣFy = 0,  ΣM = 0
//
// The transfer matrix ensures internal forces are self-consistent and
// reactions balance external loads. This test applies a general combined
// loading (point + distributed) and verifies all three equilibrium equations
// at the global level.
//
// Source: Pestel & Leckie, "Matrix Methods in Elastomechanics", §2.1.

#[test]
fn validation_transfer_global_equilibrium() {
    let l = 10.0;
    let n = 10;
    let q = -8.0;
    let p_node = 5; // node 5 at x = 4.0
    let p = -15.0;

    let mut loads = Vec::new();
    // UDL on all elements
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    // Additional point load at node 5
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: p_node, fx: 5.0, fz: p, my: 0.0,
    }));

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total applied vertical load: UDL + point
    let total_fz = q * l + p;  // negative (downward)

    // Sum of vertical reactions must equal -total_fz
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let err_fy = (sum_ry + total_fz).abs() / total_fz.abs();
    assert!(err_fy < 0.01,
        "ΣFy equilibrium: ΣRy={:.4}, applied Fy={:.4}, err={:.1}%",
        sum_ry, total_fz, err_fy * 100.0);

    // Sum of horizontal reactions must equal -applied Fx
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let err_fx = (sum_rx + 5.0).abs() / 5.0;
    assert!(err_fx < 0.01,
        "ΣFx equilibrium: ΣRx={:.4}, applied Fx=5.0, err={:.1}%",
        sum_rx, err_fx * 100.0);

    // Moment equilibrium about left support (node 1 at x=0)
    let x_p = (p_node - 1) as f64 * (l / n as f64);
    let m_applied = q * l * l / 2.0 + p * x_p + 5.0 * 0.0; // Fy components only
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().rz;
    let m_from_right = r_right * l;
    let err_m = (m_from_right + m_applied).abs() / m_applied.abs();
    assert!(err_m < 0.01,
        "ΣM equilibrium: R_right×L={:.4}, applied moment sum={:.4}, err={:.1}%",
        m_from_right, -m_applied, err_m * 100.0);
}
