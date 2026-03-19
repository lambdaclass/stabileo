/// Validation: Combined Loading Extended Scenarios
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 5 (combined loading)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 14 (combined effects)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 7 (superposition)
///
/// Tests verify combined axial+bending, superposition, and multi-load scenarios:
///   1. Axial + transverse: cantilever independence check
///   2. Axial + distributed: propped cantilever combined loading
///   3. Superposition: two UDL cases on SS beam
///   4. Multi-span superposition: point loads at different spans
///   5. Symmetric vs antisymmetric load decomposition
///   6. Combined eccentric loads on fixed-fixed beam
///   7. Portal frame: gravity + lateral superposition
///   8. Truss member: pure axial superposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Cantilever: Axial and Transverse Independence
// ================================================================
//
// A cantilever with an axial load should have zero transverse
// deflection, and one with a transverse load should have zero
// axial displacement. Combined should be the sum of both.

#[test]
fn validation_combined_axial_transverse_independence() {
    let l = 4.0;
    let n = 8;
    let px = 30.0;
    let py: f64 = -12.0;
    let e_eff = E * 1000.0;

    // Axial only
    let input_ax = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: px, fz: 0.0, my: 0.0,
        })]);
    let res_ax = linear::solve_2d(&input_ax).unwrap();

    // Transverse only
    let input_tr = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: py, my: 0.0,
        })]);
    let res_tr = linear::solve_2d(&input_tr).unwrap();

    // Combined
    let input_both = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: px, fz: py, my: 0.0,
        })]);
    let res_both = linear::solve_2d(&input_both).unwrap();

    let d_ax = res_ax.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let d_tr = res_tr.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let d_both = res_both.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Axial-only should have negligible transverse deflection
    assert!(d_ax.uz.abs() < 1e-10,
        "Axial-only: uy should be ~0, got {:.6e}", d_ax.uz);

    // Transverse-only should have negligible axial displacement
    assert!(d_tr.ux.abs() < 1e-10,
        "Transverse-only: ux should be ~0, got {:.6e}", d_tr.ux);

    // Combined ux = axial-only ux
    let ux_exact = px * l / (e_eff * A);
    assert_close(d_both.ux, ux_exact, 0.02,
        "Combined: ux = PxL/(EA)");

    // Combined uy = transverse-only uy
    let uy_exact = py * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(d_both.uz, uy_exact, 0.02,
        "Combined: uy = PyL^3/(3EI)");

    // Superposition: combined = axial + transverse
    assert_close(d_both.ux, d_ax.ux + d_tr.ux, 0.01,
        "Superposition: ux_both = ux_ax + ux_tr");
    assert_close(d_both.uz, d_ax.uz + d_tr.uz, 0.01,
        "Superposition: uy_both = uy_ax + uy_tr");
}

// ================================================================
// 2. Propped Cantilever: Axial + Distributed Load
// ================================================================
//
// Propped cantilever (fixed-rollerX) with UDL and axial tip load.
// Axial force should be constant along length. Bending reactions
// should match the UDL-only case.

#[test]
fn validation_combined_axial_distributed_propped() {
    let l = 6.0;
    let n = 10;
    let px = 40.0;
    let q: f64 = -8.0;

    // UDL only
    let mut loads_udl = Vec::new();
    for i in 1..=n {
        loads_udl.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_udl = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_udl.clone());
    let res_udl = linear::solve_2d(&input_udl).unwrap();

    // Combined: UDL + axial
    let mut loads_both = loads_udl;
    loads_both.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: px, fz: 0.0, my: 0.0,
    }));
    let input_both = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_both);
    let res_both = linear::solve_2d(&input_both).unwrap();

    // Vertical reactions should be the same (axial doesn't affect bending in linear analysis)
    let ry_udl: f64 = res_udl.reactions.iter().map(|r| r.rz).sum();
    let ry_both: f64 = res_both.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_udl, ry_both, 0.02,
        "Propped cantilever: Ry unchanged by axial load");

    // Axial force in first element should equal px
    let ef_both = res_both.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_both.n_start.abs(), px, 0.02,
        "Propped cantilever: N = Px");

    // Moment at fixed end should match UDL-only case
    let mz_udl = res_udl.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let mz_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    assert_close(mz_both, mz_udl, 0.02,
        "Propped cantilever: Mz_fixed unchanged by axial load");
}

// ================================================================
// 3. SS Beam: Superposition of Two Different UDL Intensities
// ================================================================
//
// SS beam with UDL of intensity q1 + SS beam with UDL of intensity q2
// should give the same result as SS beam with UDL of (q1+q2).

#[test]
fn validation_combined_udl_superposition_ss() {
    let l = 8.0;
    let n = 10;
    let q1: f64 = -6.0;
    let q2: f64 = -4.0;

    let build_udl = |q: f64| -> AnalysisResults {
        let mut loads = Vec::new();
        for i in 1..=n {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_q1 = build_udl(q1);
    let res_q2 = build_udl(q2);
    let res_sum = build_udl(q1 + q2);

    let mid = n / 2 + 1;

    // Midspan deflection superposition
    let d_q1 = res_q1.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_q2 = res_q2.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;
    let d_sum = res_sum.displacements.iter().find(|d| d.node_id == mid).unwrap().uz;

    assert_close(d_sum, d_q1 + d_q2, 0.01,
        "UDL superposition: δ(q1+q2) = δ(q1) + δ(q2)");

    // Reaction superposition
    let r_q1 = res_q1.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_q2 = res_q2.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_sum = res_sum.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;

    assert_close(r_sum, r_q1 + r_q2, 0.01,
        "UDL superposition: R(q1+q2) = R(q1) + R(q2)");

    // Midspan bending moment superposition via element forces
    let ef_q1 = res_q1.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    let ef_q2 = res_q2.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    let ef_sum = res_sum.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();

    assert_close(ef_sum.m_end, ef_q1.m_end + ef_q2.m_end, 0.01,
        "UDL superposition: M(q1+q2) = M(q1) + M(q2)");
}

// ================================================================
// 4. Multi-Span: Point Loads at Different Spans
// ================================================================
//
// Three-span continuous beam. Point load in span 1 alone, point load
// in span 3 alone, both together. Verify superposition of displacements.

#[test]
fn validation_combined_multispan_point_superposition() {
    let l = 5.0;
    let n_per = 6;
    let p1 = 20.0;
    let p3 = 15.0;

    let build = |load_span1: bool, load_span3: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if load_span1 {
            let mid_span1 = n_per / 2 + 1;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_span1, fx: 0.0, fz: -p1, my: 0.0,
            }));
        }
        if load_span3 {
            let mid_span3 = 2 * n_per + n_per / 2 + 1;
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_span3, fx: 0.0, fz: -p3, my: 0.0,
            }));
        }
        let input = make_continuous_beam(&[l, l, l], n_per, E, A, IZ, loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_both = build(true, true);
    let res_s1 = build(true, false);
    let res_s3 = build(false, true);

    // Check displacement superposition at several nodes
    for node_id in [n_per / 2 + 1, n_per + 1, 2 * n_per + n_per / 2 + 1] {
        let d_both = res_both.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;
        let d_s1 = res_s1.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;
        let d_s3 = res_s3.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;

        let sum = d_s1 + d_s3;
        if d_both.abs() > 1e-10 {
            let err = (d_both - sum).abs() / d_both.abs();
            assert!(err < 0.02,
                "Multi-span superposition at node {}: both={:.6e}, sum={:.6e}, err={:.4}%",
                node_id, d_both, sum, err * 100.0);
        }
    }

    // Reaction superposition at interior support
    let r_both = res_both.reactions.iter().find(|r| r.node_id == n_per + 1).unwrap().rz;
    let r_s1 = res_s1.reactions.iter().find(|r| r.node_id == n_per + 1).unwrap().rz;
    let r_s3 = res_s3.reactions.iter().find(|r| r.node_id == n_per + 1).unwrap().rz;

    assert_close(r_both, r_s1 + r_s3, 0.02,
        "Multi-span: reaction superposition at interior support");
}

// ================================================================
// 5. Symmetric + Antisymmetric Load Decomposition
// ================================================================
//
// A SS beam with an asymmetric point load P at L/3 can be decomposed:
//   Symmetric part:  P/2 at L/3 and P/2 at 2L/3
//   Antisymmetric:   +P/2 at L/3 and -P/2 at 2L/3
// Sum should match the original asymmetric loading.

#[test]
fn validation_combined_symmetric_antisymmetric_decomposition() {
    let l = 9.0;
    let n = 9;
    let p = 18.0;
    let n_third = n / 3 + 1;       // node at L/3
    let n_twothirds = 2 * n / 3 + 1; // node at 2L/3

    // Original: single load at L/3
    let input_orig = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_third, fx: 0.0, fz: -p, my: 0.0,
        })]);
    let res_orig = linear::solve_2d(&input_orig).unwrap();

    // Symmetric part: P/2 at L/3 and P/2 at 2L/3
    let input_sym = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_third, fx: 0.0, fz: -p / 2.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_twothirds, fx: 0.0, fz: -p / 2.0, my: 0.0,
            }),
        ]);
    let res_sym = linear::solve_2d(&input_sym).unwrap();

    // Antisymmetric part: +P/2 at L/3 and -P/2 at 2L/3
    let input_anti = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_third, fx: 0.0, fz: -p / 2.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n_twothirds, fx: 0.0, fz: p / 2.0, my: 0.0,
            }),
        ]);
    let res_anti = linear::solve_2d(&input_anti).unwrap();

    // Superposition at every node
    for node_id in 1..=(n + 1) {
        let d_orig = res_orig.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;
        let d_sym = res_sym.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;
        let d_anti = res_anti.displacements.iter().find(|d| d.node_id == node_id).unwrap().uz;

        let sum = d_sym + d_anti;
        if d_orig.abs() > 1e-10 {
            let err = (d_orig - sum).abs() / d_orig.abs();
            assert!(err < 0.02,
                "Sym+Anti decomposition at node {}: orig={:.6e}, sum={:.6e}",
                node_id, d_orig, sum);
        } else {
            assert!((d_orig - sum).abs() < 1e-8,
                "Sym+Anti decomposition at node {}: orig={:.6e}, sum={:.6e}",
                node_id, d_orig, sum);
        }
    }
}

// ================================================================
// 6. Fixed-Fixed Beam: Eccentric Loads at Both Ends
// ================================================================
//
// Fixed-fixed beam with axial load + moment at one end, and a
// transverse point load at midspan. Verify equilibrium and that
// bending response matches the point-load-only case.

#[test]
fn validation_combined_eccentric_fixed_fixed() {
    let l = 5.0;
    let n = 10;
    let px = 25.0;
    let m_end = 10.0;
    let py_mid: f64 = -20.0;

    let mid_node = n / 2 + 1;

    // Point load only at midspan
    let input_point = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fz: py_mid, my: 0.0,
        })]);
    let res_point = linear::solve_2d(&input_point).unwrap();

    // Axial + moment at tip only
    let input_axmom = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: px, fz: 0.0, my: m_end,
        })]);
    let res_axmom = linear::solve_2d(&input_axmom).unwrap();

    // Combined
    let input_combined = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fz: py_mid, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: px, fz: 0.0, my: m_end,
            }),
        ]);
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Superposition of midspan deflection
    let d_point = res_point.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;
    let d_axmom = res_axmom.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;
    let d_combined = res_combined.displacements.iter().find(|d| d.node_id == mid_node).unwrap().uz;

    assert_close(d_combined, d_point + d_axmom, 0.01,
        "Fixed-fixed combined: midspan uy superposition");

    // Global equilibrium: sum_Ry = -py_mid
    let sum_ry: f64 = res_combined.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -py_mid, 0.02,
        "Fixed-fixed combined: ΣRy = -Py_mid");

    // Global equilibrium: sum_Rx = -px
    let sum_rx: f64 = res_combined.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02,
        "Fixed-fixed combined: ΣRx = -Px");
}

// ================================================================
// 7. Portal Frame: Gravity + Lateral Superposition
// ================================================================
//
// Portal frame with fixed bases. Verify that gravity-only + lateral-only
// results sum to the combined case.

#[test]
fn validation_combined_portal_gravity_lateral_superposition() {
    let h = 4.0;
    let w = 6.0;
    let p_lat = 10.0;
    let p_grav: f64 = -20.0;

    // Gravity only
    let res_grav = linear::solve_2d(
        &make_portal_frame(h, w, E, A, IZ, 0.0, p_grav)).unwrap();

    // Lateral only
    let res_lat = linear::solve_2d(
        &make_portal_frame(h, w, E, A, IZ, p_lat, 0.0)).unwrap();

    // Combined
    let res_both = linear::solve_2d(
        &make_portal_frame(h, w, E, A, IZ, p_lat, p_grav)).unwrap();

    // Superposition of sway (horizontal displacement at beam level)
    let ux_grav = res_grav.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_lat = res_lat.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_both = res_both.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert_close(ux_both, ux_grav + ux_lat, 0.01,
        "Portal frame: sway superposition");

    // Superposition of vertical displacement at node 2
    let uy_grav = res_grav.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    let uy_lat = res_lat.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    let uy_both = res_both.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;

    assert_close(uy_both, uy_grav + uy_lat, 0.01,
        "Portal frame: vertical displacement superposition");

    // Reaction superposition at base
    for node_id in [1, 4] {
        let rx_grav = res_grav.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;
        let rx_lat = res_lat.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;
        let rx_both = res_both.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;

        assert_close(rx_both, rx_grav + rx_lat, 0.02,
            &format!("Portal frame: Rx superposition at node {}", node_id));

        let ry_grav = res_grav.reactions.iter().find(|r| r.node_id == node_id).unwrap().rz;
        let ry_lat = res_lat.reactions.iter().find(|r| r.node_id == node_id).unwrap().rz;
        let ry_both = res_both.reactions.iter().find(|r| r.node_id == node_id).unwrap().rz;

        assert_close(ry_both, ry_grav + ry_lat, 0.02,
            &format!("Portal frame: Ry superposition at node {}", node_id));

        let mz_grav = res_grav.reactions.iter().find(|r| r.node_id == node_id).unwrap().my;
        let mz_lat = res_lat.reactions.iter().find(|r| r.node_id == node_id).unwrap().my;
        let mz_both = res_both.reactions.iter().find(|r| r.node_id == node_id).unwrap().my;

        assert_close(mz_both, mz_grav + mz_lat, 0.02,
            &format!("Portal frame: Mz superposition at node {}", node_id));
    }
}

// ================================================================
// 8. Axial Bar: Superposition of Multiple Axial Loads
// ================================================================
//
// A horizontal bar (fixed-fixed) with two axial loads applied at
// different interior nodes. Verify that each load contribution sums
// linearly in displacement and internal force.

#[test]
fn validation_combined_axial_bar_superposition() {
    let l = 10.0;
    let n = 5;
    let p1 = 50.0;
    let p2 = 30.0;

    let node_a = 2; // at 2.0 m
    let node_b = 4; // at 8.0 m

    let build = |load_a: bool, load_b: bool| -> AnalysisResults {
        let mut loads = Vec::new();
        if load_a {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_a, fx: p1, fz: 0.0, my: 0.0,
            }));
        }
        if load_b {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_b, fx: p2, fz: 0.0, my: 0.0,
            }));
        }
        let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
        linear::solve_2d(&input).unwrap()
    };

    let res_a = build(true, false);
    let res_b = build(false, true);
    let res_both = build(true, true);

    // Displacement superposition at each interior node
    for nid in 2..=n {
        let ux_a = res_a.displacements.iter().find(|d| d.node_id == nid).unwrap().ux;
        let ux_b = res_b.displacements.iter().find(|d| d.node_id == nid).unwrap().ux;
        let ux_both = res_both.displacements.iter().find(|d| d.node_id == nid).unwrap().ux;

        assert_close(ux_both, ux_a + ux_b, 0.02,
            &format!("Axial bar: ux superposition at node {}", nid));
    }

    // Axial force superposition in each element
    for eid in 1..=n {
        let n_a = res_a.element_forces.iter().find(|e| e.element_id == eid).unwrap().n_start;
        let n_b = res_b.element_forces.iter().find(|e| e.element_id == eid).unwrap().n_start;
        let n_both = res_both.element_forces.iter().find(|e| e.element_id == eid).unwrap().n_start;

        assert_close(n_both, n_a + n_b, 0.02,
            &format!("Axial bar: N superposition in element {}", eid));
    }

    // Global equilibrium: ΣRx + P1 + P2 = 0
    let sum_rx: f64 = res_both.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -(p1 + p2), 0.02,
        "Axial bar: ΣRx = -(P1+P2)");

    // For load at node_a only: equilibrium Rx_left + Rx_right = -P1
    let sum_rx_a: f64 = res_a.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_a, -p1, 0.02,
        "Axial bar load A: ΣRx = -P1");

    // Reaction superposition at each fixed end
    for node_id in [1, n + 1] {
        let rx_a = res_a.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;
        let rx_b = res_b.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;
        let rx_both = res_both.reactions.iter().find(|r| r.node_id == node_id).unwrap().rx;

        assert_close(rx_both, rx_a + rx_b, 0.02,
            &format!("Axial bar: Rx superposition at node {}", node_id));
    }
}
