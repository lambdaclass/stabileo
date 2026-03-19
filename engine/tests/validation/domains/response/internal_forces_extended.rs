/// Validation: Extended Internal Force Diagram Benchmarks
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-7
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///
/// Tests verify internal forces for additional standard load cases:
///   1. Fixed-fixed beam center point load: M_fixed = PL/8, M_mid = PL/8
///   2. Cantilever with end moment: constant shear = 0, linear moment
///   3. SS beam triangular load: R_A = qL/6, R_B = qL/3
///   4. Propped cantilever center point: R_roller = 5P/16
///   5. Two-span continuous beam UDL: center reaction = 10qL/8
///   6. Portal frame lateral load: column base shear = P/2 (symmetric)
///   7. SS beam with overhang point load: internal moment at support
///   8. Fixed-pinned beam UDL: fixed end moment = qL²/8
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam with Center Point Load
//    Reference: Hibbeler Table, Fixed-Fixed beam with P at midspan
//    M_fixed_ends = PL/8, M_midspan = PL/8
//    Reactions: R = P/2 at each end
// ================================================================

#[test]
fn validation_forces_ext_fixed_fixed_center_point() {
    let l = 8.0;
    let n = 8;
    let p = 24.0;

    let mid_node = n / 2 + 1; // node 5
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Each reaction = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rn = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "FF center point R1_y");
    assert_close(rn.rz, p / 2.0, 0.02, "FF center point Rn_y");

    // Fixed end moments = PL/8
    let m_fixed = p * l / 8.0;
    // At node 1 the moment reaction should be PL/8 (hogging, negative convention)
    assert_close(r1.my.abs(), m_fixed, 0.05, "FF center point M_fixed_start");
    assert_close(rn.my.abs(), m_fixed, 0.05, "FF center point M_fixed_end");

    // Midspan moment = PL/8 (sagging)
    let ef_mid = results.element_forces.iter()
        .find(|f| f.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_fixed, 0.05, "FF center point M_midspan");
}

// ================================================================
// 2. Cantilever with Applied End Moment
//    Reference: Gere & Goodno, Appendix D, Case 8
//    V = 0 everywhere (no transverse load)
//    M = M_applied constant along the beam
//    delta_tip = ML²/(2EI)
// ================================================================

#[test]
fn validation_forces_ext_cantilever_end_moment() {
    let l = 6.0;
    let n = 4;
    let m_app = 30.0; // applied clockwise moment at free end

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m_app,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Shear should be zero everywhere (no transverse load)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 0.5,
            "Cantilever end moment V elem {}: {:.4} should be ~0", ef.element_id, ef.v_start);
        assert!(ef.v_end.abs() < 0.5,
            "Cantilever end moment V_end elem {}: {:.4} should be ~0", ef.element_id, ef.v_end);
    }

    // Moment should be approximately constant = m_app along the beam
    for ef in &results.element_forces {
        assert_close(ef.m_start.abs(), m_app, 0.05,
            &format!("Cantilever end moment M_start elem {}", ef.element_id));
        assert_close(ef.m_end.abs(), m_app, 0.05,
            &format!("Cantilever end moment M_end elem {}", ef.element_id));
    }

    // Tip deflection = ML²/(2EI)
    let e_eff: f64 = E * 1000.0;
    let delta_exact = m_app * l * l / (2.0 * e_eff * IZ);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip_disp.uz.abs(), delta_exact, 0.02, "Cantilever end moment tip deflection");
}

// ================================================================
// 3. SS Beam with Triangular Load (zero at left, q at right)
//    Reference: Hibbeler, Appendix, SS beam with linearly varying load
//    R_A = qL/6, R_B = qL/3
//    M_max at x = L/sqrt(3) = qL²/(9*sqrt(3))
// ================================================================

#[test]
fn validation_forces_ext_ss_triangular_load() {
    let l = 9.0;
    let n = 18; // fine mesh for accuracy with varying load
    let q_max = -12.0; // peak intensity at right end (downward)

    let elem_len = l / n as f64;
    let mut loads = Vec::new();
    for i in 0..n {
        let x_i = i as f64 * elem_len;
        let x_j = (i + 1) as f64 * elem_len;
        // Linear from 0 at x=0 to q_max at x=L
        let q_i = q_max * x_i / l;
        let q_j = q_max * x_j / l;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i, q_j, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = qL/6, R_B = qL/3
    let r_a = q_max.abs() * l / 6.0;
    let r_b = q_max.abs() * l / 3.0;

    let ra_actual = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb_actual = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(ra_actual.rz, r_a, 0.03, "SS triangular R_A");
    assert_close(rb_actual.rz, r_b, 0.03, "SS triangular R_B");

    // Total load = qL/2 = 54; R_A + R_B should equal it
    let total_load = q_max.abs() * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "SS triangular sum reactions");
}

// ================================================================
// 4. Propped Cantilever with Center Point Load
//    Reference: Timoshenko & Young, Table of beam formulas
//    Fixed at left, roller at right, P at midspan
//    R_roller = 5P/16, R_fixed = 11P/16
//    M_fixed = 3PL/16
// ================================================================

#[test]
fn validation_forces_ext_propped_cantilever_center_point() {
    let l = 8.0;
    let n = 16; // fine mesh
    let p = 32.0;

    let mid_node = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction = 5P/16
    let r_roller = 5.0 * p / 16.0;
    let r_fixed_y = 11.0 * p / 16.0;
    let m_fixed = 3.0 * p * l / 16.0;

    let r_at_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_at_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_at_roller.rz, r_roller, 0.03, "Propped cantilever center P: R_roller");
    assert_close(r_at_fixed.rz, r_fixed_y, 0.03, "Propped cantilever center P: R_fixed");
    assert_close(r_at_fixed.my.abs(), m_fixed, 0.05, "Propped cantilever center P: M_fixed");
}

// ================================================================
// 5. Two-Span Continuous Beam with UDL
//    Reference: Kassimali, "Structural Analysis", continuous beams
//    Two equal spans L with UDL q.
//    Center reaction = 10qL/8 = 5qL/4
//    End reactions = 3qL/8 each
//    Moment at center support = qL²/8
// ================================================================

#[test]
fn validation_forces_ext_two_span_continuous_udl() {
    let span = 6.0;
    let n_per_span = 8;
    let q = -10.0;
    let total_elems = n_per_span * 2;

    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions = 3qL/8
    let r_end = 3.0 * q.abs() * span / 8.0;
    // Center reaction = 10qL/8 = 5qL/4
    let r_center = 10.0 * q.abs() * span / 8.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_mid = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_end_node = results.reactions.iter().find(|r| r.node_id == total_elems + 1).unwrap();

    assert_close(r1.rz, r_end, 0.03, "Two-span continuous R_left");
    assert_close(r_mid.rz, r_center, 0.03, "Two-span continuous R_center");
    assert_close(r_end_node.rz, r_end, 0.03, "Two-span continuous R_right");

    // Moment at center support = qL²/8
    let m_center = q.abs() * span * span / 8.0;
    // The element just before the center support
    let ef_at_center = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef_at_center.m_end.abs(), m_center, 0.05, "Two-span continuous M_center");
}

// ================================================================
// 6. Portal Frame under Lateral Load (Symmetric Fixed Bases)
//    Reference: Hibbeler, Ch.15 — Portal method approximation
//    Symmetric portal frame with fixed bases, lateral load P at beam level.
//    By symmetry: base shear = P/2 at each column.
//    Total horizontal reactions sum to P.
// ================================================================

#[test]
fn validation_forces_ext_portal_frame_lateral() {
    let h = 4.0;
    let w = 6.0;
    let p_lat = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, p_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Sum of horizontal reactions = -P (equilibrium)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p_lat, 0.02, "Portal frame sum Rx = -P");

    // By symmetry of stiffness (same EI, same height), base shears split equally
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx.abs(), p_lat / 2.0, 0.05, "Portal frame R1_x = P/2");
    assert_close(r4.rx.abs(), p_lat / 2.0, 0.05, "Portal frame R4_x = P/2");

    // Vertical reactions should be equal and opposite (frame antisymmetric loading)
    // R1_y + R4_y = 0 (no vertical applied load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.5,
        "Portal frame sum Ry should be ~0: {:.4}", sum_ry);
}

// ================================================================
// 7. SS Beam with Overhang and Point Load at Tip
//    Reference: Gere & Goodno, Ch.4, overhanging beams
//    Layout: pinned at node 1 (x=0), roller at node (n_main+1) (x=L_main),
//            free tip at node (n_main+n_oh+1) (x=L_main+L_oh)
//    P applied at tip.
//    R_roller = P*(L_main+L_oh)/L_main
//    R_pinned = -P*L_oh/L_main  (downward!)
//    Moment at roller = P*L_oh (hogging)
// ================================================================

#[test]
fn validation_forces_ext_overhang_point_load() {
    let l_main = 6.0;
    let l_oh = 2.0;
    let n_main = 6;
    let n_oh = 2;
    let n_total = n_main + n_oh;
    let p = 15.0;

    let elem_len_main = l_main / n_main as f64;
    let elem_len_oh = l_oh / n_oh as f64;

    // Build nodes: main span then overhang
    let mut nodes = Vec::new();
    for i in 0..=n_main {
        nodes.push((i + 1, i as f64 * elem_len_main, 0.0));
    }
    for i in 1..=n_oh {
        nodes.push((n_main + 1 + i, l_main + i as f64 * elem_len_oh, 0.0));
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Supports: pinned at node 1, rollerX at node n_main+1
    let sups = vec![(1, 1, "pinned"), (2, n_main + 1, "rollerX")];

    // Point load at tip (last node)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_total + 1, fx: 0.0, fz: -p, my: 0.0,
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

    // R_roller = P*(L_main+L_oh)/L_main (upward)
    let r_roller_exact = p * (l_main + l_oh) / l_main;
    // R_pinned = -P*L_oh/L_main (downward, i.e. negative)
    let r_pinned_exact: f64 = -(p * l_oh / l_main);

    let r_pinned = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_roller = results.reactions.iter().find(|r| r.node_id == n_main + 1).unwrap();

    assert_close(r_roller.rz, r_roller_exact, 0.03, "Overhang R_roller");
    assert_close(r_pinned.rz, r_pinned_exact, 0.03, "Overhang R_pinned");

    // Moment at roller support = P * L_oh (hogging)
    let m_at_roller = p * l_oh;
    let ef_at_roller = results.element_forces.iter()
        .find(|f| f.element_id == n_main).unwrap();
    assert_close(ef_at_roller.m_end.abs(), m_at_roller, 0.05, "Overhang M at roller support");
}

// ================================================================
// 8. Fixed-Pinned Beam with UDL
//    Reference: Timoshenko & Young, Table of beam formulas
//    Fixed at left, pinned at right, UDL q.
//    R_fixed = 5qL/8, R_pinned = 3qL/8
//    M_fixed = qL²/8
//    M at x = 3L/8 (point of zero shear) is the max positive moment
// ================================================================

#[test]
fn validation_forces_ext_fixed_pinned_udl() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("pinned"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_fixed_y = 5.0 * q.abs() * l / 8.0;
    let r_pinned_y = 3.0 * q.abs() * l / 8.0;
    let m_fixed = q.abs() * l * l / 8.0;

    let r_at_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_at_pinned = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_at_fixed.rz, r_fixed_y, 0.03, "Fixed-pinned UDL R_fixed");
    assert_close(r_at_pinned.rz, r_pinned_y, 0.03, "Fixed-pinned UDL R_pinned");
    assert_close(r_at_fixed.my.abs(), m_fixed, 0.05, "Fixed-pinned UDL M_fixed");

    // Global equilibrium: sum of reactions = total load
    let total_load = q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "Fixed-pinned UDL sum reactions");

    // Pinned end has zero moment
    let r_pin_mz = r_at_pinned.my;
    assert!(r_pin_mz.abs() < 1.0,
        "Fixed-pinned UDL: pinned end moment should be ~0, got {:.4}", r_pin_mz);
}
