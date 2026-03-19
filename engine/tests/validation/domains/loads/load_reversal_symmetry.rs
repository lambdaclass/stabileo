/// Validation: Load reversal and superposition symmetry properties.
///
/// Verifies fundamental properties of linear elastic analysis:
///   - Reversing all loads reverses all displacements, reactions, and element forces
///   - Equal and opposite loads cancel to zero
///   - Linearity: 2P produces twice the response of P
///   - Antisymmetric loading on symmetric frames produces antisymmetric response
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Reversed load reverses displacements
// ================================================================

/// Simply-supported beam with midspan point load: fy=-10 gives uy<0,
/// fy=+10 gives uy>0 with the same magnitude.
#[test]
fn validation_reversed_load_reverses_displacement() {
    let l = 10.0;
    let p = 10.0;
    let n = 8;
    let mid = n / 2 + 1;

    let input_down = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let input_up = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: p, my: 0.0,
        })]);

    let res_down = linear::solve_2d(&input_down).unwrap();
    let res_up = linear::solve_2d(&input_up).unwrap();

    // Midspan displacement should flip sign
    let d_down = res_down.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let d_up = res_up.displacements.iter().find(|d| d.node_id == mid).unwrap();

    assert!(d_down.uz < 0.0, "downward load should give negative uy, got {}", d_down.uz);
    assert!(d_up.uz > 0.0, "upward load should give positive uy, got {}", d_up.uz);
    assert_close(d_down.uz, -d_up.uz, 0.02, "reversed displacement magnitude");

    // Check all nodes
    for dd in &res_down.displacements {
        let du = res_up.displacements.iter().find(|d| d.node_id == dd.node_id).unwrap();
        assert_close(dd.uz, -du.uz, 0.02, &format!("reversed uy node {}", dd.node_id));
        assert_close(dd.ry, -du.ry, 0.02, &format!("reversed rz node {}", dd.node_id));
    }
}

// ================================================================
// 2. Reversed load reverses reactions
// ================================================================

/// Same SS beam setup: verify that reactions flip sign exactly.
#[test]
fn validation_reversed_load_reverses_reactions() {
    let l = 10.0;
    let p = 10.0;
    let n = 8;
    let mid = n / 2 + 1;

    let input_down = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let input_up = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: p, my: 0.0,
        })]);

    let res_down = linear::solve_2d(&input_down).unwrap();
    let res_up = linear::solve_2d(&input_up).unwrap();

    for rd in &res_down.reactions {
        let ru = res_up.reactions.iter().find(|r| r.node_id == rd.node_id).unwrap();
        assert_close(rd.rx, -ru.rx, 0.02, &format!("reversed rx node {}", rd.node_id));
        assert_close(rd.rz, -ru.rz, 0.02, &format!("reversed ry node {}", rd.node_id));
        assert_close(rd.my, -ru.my, 0.02, &format!("reversed mz node {}", rd.node_id));
    }
}

// ================================================================
// 3. Reversed load reverses element forces
// ================================================================

/// Verify that m_start, v_start, n_start, etc. all flip sign.
#[test]
fn validation_reversed_load_reverses_element_forces() {
    let l = 10.0;
    let p = 10.0;
    let n = 8;
    let mid = n / 2 + 1;

    let input_down = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let input_up = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: p, my: 0.0,
        })]);

    let res_down = linear::solve_2d(&input_down).unwrap();
    let res_up = linear::solve_2d(&input_up).unwrap();

    for efd in &res_down.element_forces {
        let efu = res_up.element_forces.iter()
            .find(|ef| ef.element_id == efd.element_id).unwrap();
        assert_close(efd.n_start, -efu.n_start, 0.02,
            &format!("reversed n_start elem {}", efd.element_id));
        assert_close(efd.n_end, -efu.n_end, 0.02,
            &format!("reversed n_end elem {}", efd.element_id));
        assert_close(efd.v_start, -efu.v_start, 0.02,
            &format!("reversed v_start elem {}", efd.element_id));
        assert_close(efd.v_end, -efu.v_end, 0.02,
            &format!("reversed v_end elem {}", efd.element_id));
        assert_close(efd.m_start, -efu.m_start, 0.02,
            &format!("reversed m_start elem {}", efd.element_id));
        assert_close(efd.m_end, -efu.m_end, 0.02,
            &format!("reversed m_end elem {}", efd.element_id));
    }
}

// ================================================================
// 4. Superposition of equal and opposite loads gives zero
// ================================================================

/// Apply +P and -P at the same node simultaneously. All displacements
/// should be zero everywhere.
#[test]
fn validation_equal_opposite_loads_cancel() {
    let l = 10.0;
    let p = 50.0;
    let n = 8;
    let mid = n / 2 + 1;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: -p, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid, fx: 0.0, fz: p, my: 0.0,
            }),
        ]);

    let results = linear::solve_2d(&input).unwrap();

    for d in &results.displacements {
        assert!(d.ux.abs() < 1e-10,
            "node {} ux should be zero, got {:.6e}", d.node_id, d.ux);
        assert!(d.uz.abs() < 1e-10,
            "node {} uy should be zero, got {:.6e}", d.node_id, d.uz);
        assert!(d.ry.abs() < 1e-10,
            "node {} rz should be zero, got {:.6e}", d.node_id, d.ry);
    }

    for r in &results.reactions {
        assert!(r.rx.abs() < 1e-10,
            "node {} rx should be zero, got {:.6e}", r.node_id, r.rx);
        assert!(r.rz.abs() < 1e-10,
            "node {} ry should be zero, got {:.6e}", r.node_id, r.rz);
    }
}

// ================================================================
// 5. Portal frame reversed lateral load
// ================================================================

/// Lateral load +H gives sway right, -H gives sway left with same magnitude.
#[test]
fn validation_portal_frame_reversed_lateral() {
    let h = 4.0;
    let w = 6.0;
    let load = 20.0;

    let input_right = make_portal_frame(h, w, E, A, IZ, load, 0.0);
    let input_left = make_portal_frame(h, w, E, A, IZ, -load, 0.0);

    let res_right = linear::solve_2d(&input_right).unwrap();
    let res_left = linear::solve_2d(&input_left).unwrap();

    // Top-left corner (node 2) horizontal displacement
    let d_right_2 = res_right.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_left_2 = res_left.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert!(d_right_2.ux > 0.0, "+H should sway right at node 2, got ux={}", d_right_2.ux);
    assert!(d_left_2.ux < 0.0, "-H should sway left at node 2, got ux={}", d_left_2.ux);
    assert_close(d_right_2.ux, -d_left_2.ux, 0.02, "reversed lateral ux node 2");

    // Top-right corner (node 3)
    let d_right_3 = res_right.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d_left_3 = res_left.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(d_right_3.ux, -d_left_3.ux, 0.02, "reversed lateral ux node 3");

    // Reactions should also reverse
    for rr in &res_right.reactions {
        let rl = res_left.reactions.iter().find(|r| r.node_id == rr.node_id).unwrap();
        assert_close(rr.rx, -rl.rx, 0.02, &format!("reversed lateral rx node {}", rr.node_id));
        assert_close(rr.rz, -rl.rz, 0.02, &format!("reversed lateral ry node {}", rr.node_id));
        assert_close(rr.my, -rl.my, 0.02, &format!("reversed lateral mz node {}", rr.node_id));
    }
}

// ================================================================
// 6. Moment reversal on cantilever tip
// ================================================================

/// Applied mz=+M vs mz=-M at cantilever tip. Rotations and displacements
/// flip sign with same magnitude.
#[test]
fn validation_moment_reversal_cantilever() {
    let l = 8.0;
    let m = 100.0;
    let n = 8;
    let tip = n + 1;

    let input_pos = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: 0.0, my: m,
        })]);
    let input_neg = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: 0.0, my: -m,
        })]);

    let res_pos = linear::solve_2d(&input_pos).unwrap();
    let res_neg = linear::solve_2d(&input_neg).unwrap();

    // Tip displacement and rotation
    let d_pos = res_pos.displacements.iter().find(|d| d.node_id == tip).unwrap();
    let d_neg = res_neg.displacements.iter().find(|d| d.node_id == tip).unwrap();

    assert_close(d_pos.uz, -d_neg.uz, 0.02, "moment reversal tip uy");
    assert_close(d_pos.ry, -d_neg.ry, 0.02, "moment reversal tip rz");
    assert_close(d_pos.ry.abs(), d_neg.ry.abs(), 0.02, "moment reversal tip rz magnitude");

    // All interior nodes
    for dp in &res_pos.displacements {
        let dn = res_neg.displacements.iter().find(|d| d.node_id == dp.node_id).unwrap();
        assert_close(dp.uz, -dn.uz, 0.02, &format!("moment reversal uy node {}", dp.node_id));
        assert_close(dp.ry, -dn.ry, 0.02, &format!("moment reversal rz node {}", dp.node_id));
    }

    // Fixed-end reactions should also reverse
    let r_pos = res_pos.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_neg = res_neg.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_pos.my, -r_neg.my, 0.02, "moment reversal fixed-end mz");
    assert_close(r_pos.rz, -r_neg.rz, 0.02, "moment reversal fixed-end ry");
}

// ================================================================
// 7. Double load = sum of two single loads (linearity)
// ================================================================

/// SS beam with P at node A: compare 2P at A vs solving P twice and
/// summing. Verifies linear proportionality of the solver.
#[test]
fn validation_double_load_equals_sum_of_single_loads() {
    let l = 10.0;
    let p = 15.0;
    let n = 8;
    let load_node = 4; // at x = 3*10/8 = 3.75

    // Case 1: single load P
    let input_single = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
        })]);

    // Case 2: double load 2P
    let input_double = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fz: -2.0 * p, my: 0.0,
        })]);

    // Case 3: two separate P loads at the same node (P + P)
    let input_sum = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
            }),
        ]);

    let res_single = linear::solve_2d(&input_single).unwrap();
    let res_double = linear::solve_2d(&input_double).unwrap();
    let res_sum = linear::solve_2d(&input_sum).unwrap();

    // 2P case should give exactly 2x the single P displacements
    for ds in &res_single.displacements {
        let dd = res_double.displacements.iter().find(|d| d.node_id == ds.node_id).unwrap();
        assert_close(dd.uz, 2.0 * ds.uz, 0.02,
            &format!("double load uy node {}", ds.node_id));
        assert_close(dd.ry, 2.0 * ds.ry, 0.02,
            &format!("double load rz node {}", ds.node_id));
    }

    // P+P case should match 2P case exactly
    for dd in &res_double.displacements {
        let dpp = res_sum.displacements.iter().find(|d| d.node_id == dd.node_id).unwrap();
        assert_close(dd.uz, dpp.uz, 0.02,
            &format!("sum vs double uy node {}", dd.node_id));
        assert_close(dd.ry, dpp.ry, 0.02,
            &format!("sum vs double rz node {}", dd.node_id));
    }

    // Reactions: 2P case should give 2x single P reactions
    for rs in &res_single.reactions {
        let rd = res_double.reactions.iter().find(|r| r.node_id == rs.node_id).unwrap();
        assert_close(rd.rz, 2.0 * rs.rz, 0.02,
            &format!("double load ry node {}", rs.node_id));
    }

    // Element forces: 2P case should give 2x single P forces
    for efs in &res_single.element_forces {
        let efd = res_double.element_forces.iter()
            .find(|ef| ef.element_id == efs.element_id).unwrap();
        assert_close(efd.v_start, 2.0 * efs.v_start, 0.02,
            &format!("double load v_start elem {}", efs.element_id));
        assert_close(efd.m_start, 2.0 * efs.m_start, 0.02,
            &format!("double load m_start elem {}", efs.element_id));
        assert_close(efd.m_end, 2.0 * efs.m_end, 0.02,
            &format!("double load m_end elem {}", efs.element_id));
    }
}

// ================================================================
// 8. Antisymmetric loading decomposition on symmetric portal frame
// ================================================================

/// Portal frame with lateral load only (symmetric geometry, antisymmetric load).
/// The horizontal sway at top-left (node 2) should be approximately equal to
/// the sway at top-right (node 3), because the rigid beam transfers the sway
/// with negligible axial deformation. For a perfectly antisymmetric response
/// of a symmetric frame under lateral load, ux at node 2 should approximately
/// equal ux at node 3 (both sway in the same direction).
#[test]
fn validation_antisymmetric_loading_portal_frame() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    // Symmetric portal frame: columns same length, same properties, fixed-fixed
    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should sway in the positive x direction (same direction as load)
    assert!(d2.ux > 0.0, "node 2 should sway right, got ux={}", d2.ux);
    assert!(d3.ux > 0.0, "node 3 should sway right, got ux={}", d3.ux);

    // For a portal frame with lateral load at one corner, the beam is relatively
    // stiff axially so both top nodes translate nearly equally.
    // The antisymmetric sway property: ux(node 2) ≈ ux(node 3)
    assert_close(d2.ux, d3.ux, 0.05, "antisymmetric sway: ux node 2 ~ ux node 3");

    // Additionally, verify that reversing the load reverses the pattern
    let input_rev = make_portal_frame(h, w, E, A, IZ, -lateral, 0.0);
    let res_rev = linear::solve_2d(&input_rev).unwrap();

    let d2_rev = res_rev.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3_rev = res_rev.displacements.iter().find(|d| d.node_id == 3).unwrap();

    assert_close(d2.ux, -d2_rev.ux, 0.02, "reversed antisymmetric ux node 2");
    assert_close(d3.ux, -d3_rev.ux, 0.02, "reversed antisymmetric ux node 3");
}
