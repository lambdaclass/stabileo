/// Validation: Extended Superposition Principle Tests
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4 (Principle of superposition)
///   - Ghali & Neville, "Structural Analysis", Ch. 4
///   - Kassimali, "Structural Analysis", Ch. 5 (Beams and Frames)
///
/// These tests extend the basic superposition validation by verifying:
///   1. Moment superposition at mid-span of a simply-supported beam
///   2. Element forces superposition under UDL + moment load
///   3. Cantilever: UDL + tip point load superposition
///   4. Frame: independent lateral loads at different nodes
///   5. Continuous beam: reaction superposition under multiple point loads
///   6. Rotation (rz) superposition under two applied moments
///   7. Axial + transverse load independence on a fixed-fixed beam
///   8. Triangular distributed load + point load superposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Moment Superposition at Mid-Span (Simply-Supported Beam)
// ================================================================
//
// Two separate point loads at quarter-points. Verify that the
// bending moment at mid-span from the combined case equals the
// sum of moments from individual cases.

#[test]
fn validation_superposition_ext_moment_at_midspan() {
    let l = 10.0;
    let n = 10;
    let p1 = 12.0;
    let p2 = 8.0;
    let node_quarter = 3;  // near L/4
    let node_3quarter = 8; // near 3L/4
    // Mid-span element: element 5 connects node 5 to node 6
    let mid_elem = 5;

    // Load 1 only
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_quarter, fx: 0.0, fz: -p1, my: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let m1 = res1.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap().m_start;

    // Load 2 only
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_3quarter, fx: 0.0, fz: -p2, my: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let m2 = res2.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap().m_start;

    // Combined
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_quarter, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_3quarter, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let m_c = res_c.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap().m_start;

    assert_close(m_c, m1 + m2, 0.01, "Moment superposition at mid-span");
}

// ================================================================
// 2. Element Forces Superposition: UDL + Applied Moment
// ================================================================
//
// Fixed-fixed beam with UDL on all elements, plus an applied nodal
// moment at mid-span. Verify shear force superposition at mid-element.

#[test]
fn validation_superposition_ext_udl_plus_moment() {
    let l = 8.0;
    let n = 8;
    let q = -4.0;
    let m_app = 20.0;
    let mid_node = n / 2 + 1; // node 5
    let check_elem = 3;

    // UDL only
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_udl = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_udl);
    let res_udl = linear::solve_2d(&input_udl).unwrap();
    let v_udl = res_udl.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().v_start;
    let m_udl = res_udl.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().m_start;

    // Moment only
    let loads_m = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: 0.0, my: m_app,
    })];
    let input_m = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_m);
    let res_m = linear::solve_2d(&input_m).unwrap();
    let v_m = res_m.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().v_start;
    let m_m = res_m.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().m_start;

    // Combined
    let mut loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: 0.0, my: m_app,
    }));
    let input_c = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let v_c = res_c.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().v_start;
    let m_c = res_c.element_forces.iter().find(|ef| ef.element_id == check_elem).unwrap().m_start;

    assert_close(v_c, v_udl + v_m, 0.02, "Shear superposition: UDL + moment");
    assert_close(m_c, m_udl + m_m, 0.02, "Moment superposition: UDL + moment");
}

// ================================================================
// 3. Cantilever: UDL + Tip Point Load Superposition
// ================================================================
//
// Cantilever beam (fixed at start, free at end) with UDL and a
// tip point load. Verify tip displacement superposes.

#[test]
fn validation_superposition_ext_cantilever_udl_plus_tip() {
    let l = 5.0;
    let n = 10;
    let q = -3.0;
    let p = 7.0;
    let tip = n + 1;

    // UDL only
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_udl = make_beam(n, l, E, A, IZ, "fixed", None, loads_udl);
    let res_udl = linear::solve_2d(&input_udl).unwrap();
    let d_udl = res_udl.displacements.iter().find(|d| d.node_id == tip).unwrap().uz;
    let rz_udl = res_udl.displacements.iter().find(|d| d.node_id == tip).unwrap().ry;

    // Tip load only
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_pt = make_beam(n, l, E, A, IZ, "fixed", None, loads_pt);
    let res_pt = linear::solve_2d(&input_pt).unwrap();
    let d_pt = res_pt.displacements.iter().find(|d| d.node_id == tip).unwrap().uz;
    let rz_pt = res_pt.displacements.iter().find(|d| d.node_id == tip).unwrap().ry;

    // Combined
    let mut loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip, fx: 0.0, fz: -p, my: 0.0,
    }));
    let input_c = make_beam(n, l, E, A, IZ, "fixed", None, loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let d_c = res_c.displacements.iter().find(|d| d.node_id == tip).unwrap().uz;
    let rz_c = res_c.displacements.iter().find(|d| d.node_id == tip).unwrap().ry;

    assert_close(d_c, d_udl + d_pt, 0.01, "Cantilever tip deflection superposition");
    assert_close(rz_c, rz_udl + rz_pt, 0.01, "Cantilever tip rotation superposition");
}

// ================================================================
// 4. Frame: Two Independent Lateral Loads at Different Nodes
// ================================================================
//
// Portal frame with lateral loads at both column tops.
// Verify that sway at node 2 superposes from each individual load.

#[test]
fn validation_superposition_ext_frame_two_lateral() {
    let h = 4.0;
    let w = 6.0;
    let f1 = 15.0;
    let f2 = 10.0;

    // Build custom frames using make_input for finer control
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Lateral load at node 2 only
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f1, fz: 0.0, my: 0.0,
    })];
    let input1 = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads1,
    );
    let res1 = linear::solve_2d(&input1).unwrap();
    let ux1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Lateral load at node 3 only
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f2, fz: 0.0, my: 0.0,
    })];
    let input2 = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads2,
    );
    let res2 = linear::solve_2d(&input2).unwrap();
    let ux2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Both lateral loads
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2, fz: 0.0, my: 0.0 }),
    ];
    let input_c = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_c,
    );
    let res_c = linear::solve_2d(&input_c).unwrap();
    let ux_c = res_c.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert_close(ux_c, ux1 + ux2, 0.01, "Frame: two lateral loads sway superposition");
}

// ================================================================
// 5. Continuous Beam: Reaction Superposition Under Multiple Loads
// ================================================================
//
// Three-span continuous beam. Verify that reactions at the interior
// supports superpose under separate span loads.

#[test]
fn validation_superposition_ext_continuous_reactions() {
    let span = 6.0;
    let n = 6;
    let p1 = 20.0;
    let p2 = 15.0;
    let mid_span1 = n / 2 + 1;           // node 4 (mid of span 1)
    let mid_span3 = 2 * n + n / 2 + 1;   // node 16 (mid of span 3)
    let interior_support = n + 1;          // node 7 (between span 1 and 2)

    // Load on span 1 only
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fz: -p1, my: 0.0,
    })];
    let input1 = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads1);
    let r1 = linear::solve_2d(&input1).unwrap()
        .reactions.iter().find(|r| r.node_id == interior_support).unwrap().rz;

    // Load on span 3 only
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span3, fx: 0.0, fz: -p2, my: 0.0,
    })];
    let input2 = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads2);
    let r2 = linear::solve_2d(&input2).unwrap()
        .reactions.iter().find(|r| r.node_id == interior_support).unwrap().rz;

    // Both loads
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid_span1, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid_span3, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input_c = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_c);
    let r_c = linear::solve_2d(&input_c).unwrap()
        .reactions.iter().find(|r| r.node_id == interior_support).unwrap().rz;

    assert_close(r_c, r1 + r2, 0.01, "Continuous beam: reaction superposition at interior support");
}

// ================================================================
// 6. Rotation Superposition Under Two Applied Moments
// ================================================================
//
// Simply-supported beam with two applied nodal moments at different
// locations. Verify that the rotation at mid-span superposes.

#[test]
fn validation_superposition_ext_rotation_two_moments() {
    let l = 8.0;
    let n = 8;
    let m1 = 15.0;
    let m2 = -10.0;
    let node_a = 3;
    let node_b = 7;
    let check_node = 5;

    // Moment 1 only
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fz: 0.0, my: m1,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let rz1 = linear::solve_2d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    // Moment 2 only
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fz: 0.0, my: m2,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads2);
    let rz2 = linear::solve_2d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    // Combined
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fz: 0.0, my: m1 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fz: 0.0, my: m2 }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let rz_c = linear::solve_2d(&input_c).unwrap()
        .displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    assert_close(rz_c, rz1 + rz2, 0.01, "Rotation superposition: two applied moments");
}

// ================================================================
// 7. Axial + Transverse Load Independence (Fixed-Fixed Beam)
// ================================================================
//
// On a fixed-fixed beam, an axial load produces ux displacement
// while a transverse load produces uy displacement. Verify that
// combining them gives independent superposed results in both
// directions.

#[test]
fn validation_superposition_ext_axial_transverse_independence() {
    let l = 6.0;
    let n = 6;
    let p_axial = 50.0;
    let p_trans = 10.0;
    let mid = n / 2 + 1;

    // Axial load only (at mid-span node)
    let loads_ax = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: p_axial, fz: 0.0, my: 0.0,
    })];
    let input_ax = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ax);
    let res_ax = linear::solve_2d(&input_ax).unwrap();
    let ux_ax = res_ax.displacements.iter().find(|d| d.node_id == mid).unwrap().ux;
    let uy_ax = res_ax.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Transverse load only (at mid-span node)
    let loads_tr = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p_trans, my: 0.0,
    })];
    let input_tr = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_tr);
    let res_tr = linear::solve_2d(&input_tr).unwrap();
    let ux_tr = res_tr.displacements.iter().find(|d| d.node_id == mid).unwrap().ux;
    let uy_tr = res_tr.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    // Combined
    let loads_c = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid, fx: p_axial, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid, fx: 0.0, fz: -p_trans, my: 0.0 }),
    ];
    let input_c = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let ux_c = res_c.displacements.iter().find(|d| d.node_id == mid).unwrap().ux;
    let uy_c = res_c.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    assert_close(ux_c, ux_ax + ux_tr, 0.01, "Axial+transverse: ux superposition");
    assert_close(uy_c, uy_ax + uy_tr, 0.01, "Axial+transverse: uy superposition");
}

// ================================================================
// 8. Triangular Distributed Load + Point Load Superposition
// ================================================================
//
// Simply-supported beam with a triangular (linearly varying)
// distributed load on all elements, plus a point load at mid-span.
// Verify displacement superposition.

#[test]
fn validation_superposition_ext_triangular_plus_point() {
    let l = 10.0;
    let n = 10;
    let q_max = -6.0;
    let p = 12.0;
    let mid = n / 2 + 1;
    let check_node = mid;

    // Triangular load only: linearly varying from 0 at start to q_max at end
    let loads_tri: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let q_i_val = q_max * (i as f64 - 1.0) / n as f64;
            let q_j_val = q_max * i as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q_i_val, q_j: q_j_val, a: None, b: None,
            })
        })
        .collect();
    let input_tri = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_tri);
    let res_tri = linear::solve_2d(&input_tri).unwrap();
    let d_tri = res_tri.displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;
    let rz_tri = res_tri.displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    // Point load only
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_pt = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_pt);
    let res_pt = linear::solve_2d(&input_pt).unwrap();
    let d_pt = res_pt.displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;
    let rz_pt = res_pt.displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    // Combined
    let mut loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let q_i_val = q_max * (i as f64 - 1.0) / n as f64;
            let q_j_val = q_max * i as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q_i_val, q_j: q_j_val, a: None, b: None,
            })
        })
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    }));
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();
    let d_c = res_c.displacements.iter().find(|d| d.node_id == check_node).unwrap().uz;
    let rz_c = res_c.displacements.iter().find(|d| d.node_id == check_node).unwrap().ry;

    assert_close(d_c, d_tri + d_pt, 0.01, "Triangular+point: displacement superposition");
    assert_close(rz_c, rz_tri + rz_pt, 0.01, "Triangular+point: rotation superposition");
}
