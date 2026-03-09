/// Validation: Frame Behavior Classes
///
/// References:
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2-3
///   - Chen & Lui, "Stability Design of Steel Frames", Ch. 4-5
///   - AISC 360-16, Chapter C (Stability and Classification)
///
/// Tests verify behavioral classification of frame structures:
///   1. Braced vs unbraced sway under lateral load
///   2. Gravity-only produces no lateral sway in symmetric frame
///   3. Fixed base vs pinned base sway comparison
///   4. Rigid beam vs hinged beam portal sway
///   5. Two-bay portal distributes lateral load among columns
///   6. Strong beam, weak column: rigid beam constraint
///   7. Weak beam, strong column: beam flexibility under asymmetric load
///   8. Gravity increases sway under combined loading (moment redistribution)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Braced vs Unbraced Sway
// ================================================================
//
// Portal frame with lateral load: the unbraced frame exhibits significant
// sway. Adding a diagonal brace (truss element from node 1 to node 3)
// dramatically reduces the lateral displacement.

#[test]
fn validation_braced_vs_unbraced_sway() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    // Unbraced portal frame
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    let sway_unbraced = res_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert!(sway_unbraced > 0.0, "Unbraced frame should sway in load direction");

    // Braced portal frame: add diagonal brace 1->3 (truss element)
    let a_brace = 0.005;
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input_braced = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, a_brace, 0.0)],
        elems, sups, loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    let sway_braced = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Braced frame sway should be much less than unbraced
    assert!(sway_braced.abs() < sway_unbraced.abs() * 0.5,
        "Braced sway ({:.6e}) should be < 50% of unbraced sway ({:.6e})",
        sway_braced.abs(), sway_unbraced.abs());

    // Both should satisfy equilibrium
    let sum_rx_unbraced: f64 = res_unbraced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_unbraced, -lateral, 0.02, "Unbraced equilibrium ΣRx");

    let sum_rx_braced: f64 = res_braced.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_braced, -lateral, 0.02, "Braced equilibrium ΣRx");
}

// ================================================================
// 2. Gravity-Only Produces No Lateral Sway in Symmetric Frame
// ================================================================
//
// Symmetric portal with equal gravity loads at nodes 2 and 3.
// By symmetry, horizontal displacement at both top nodes should be zero.

#[test]
fn validation_symmetric_gravity_no_sway() {
    let h = 5.0;
    let w = 8.0;
    let gravity = -30.0; // downward

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Horizontal displacement at both top nodes should be essentially zero
    assert!(d2.ux.abs() < 1e-10,
        "Node 2 ux should be ~0 for symmetric gravity: {:.6e}", d2.ux);
    assert!(d3.ux.abs() < 1e-10,
        "Node 3 ux should be ~0 for symmetric gravity: {:.6e}", d3.ux);

    // Vertical displacements should be equal (downward)
    assert_close(d2.uy, d3.uy, 0.02, "Symmetric gravity: uy at nodes 2 and 3");

    // Vertical equilibrium: sum of vertical reactions = total gravity load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -2.0 * gravity, 0.02, "Gravity equilibrium ΣRy");
}

// ================================================================
// 3. Fixed Base vs Pinned Base Sway
// ================================================================
//
// Portal with lateral load: fixed base provides rotational restraint
// and is stiffer. Pinned base allows column base rotation, resulting
// in larger sway displacement.

#[test]
fn validation_fixed_vs_pinned_base_sway() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    // Fixed base portal
    let input_fixed = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let sway_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Pinned base portal
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input_pinned = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();
    let sway_pinned = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Pinned base should sway more than fixed base
    assert!(sway_pinned.abs() > sway_fixed.abs(),
        "Pinned sway ({:.6e}) should exceed fixed sway ({:.6e})",
        sway_pinned.abs(), sway_fixed.abs());

    // Fixed base should have nonzero base moments
    let r1_fixed = res_fixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1_fixed.mz.abs() > 1.0, "Fixed base should have moment: Mz={:.4}", r1_fixed.mz);

    // Pinned base should have zero base moments
    let r1_pinned = res_pinned.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1_pinned.mz.abs() < 0.01, "Pinned base Mz should be ~0: {:.6}", r1_pinned.mz);
}

// ================================================================
// 4. Rigid Beam vs Hinged Beam in Portal
// ================================================================
//
// Portal with rigid beam-column connections vs portal with moment
// releases (hinges) at both ends of the beam. The hinged version
// loses beam bending restraint and sways more.

#[test]
fn validation_rigid_vs_hinged_beam_sway() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    // Rigid beam connections (standard portal)
    let input_rigid = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_rigid = linear::solve_2d(&input_rigid).unwrap();
    let sway_rigid = res_rigid.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Hinged beam connections: hinge_start on beam (at node 2), hinge_end on beam (at node 3)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (rigid)
        (2, "frame", 2, 3, 1, 1, true, true),    // beam with hinges at both ends
        (3, "frame", 3, 4, 1, 1, false, false),  // right column (rigid)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input_hinged = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let res_hinged = linear::solve_2d(&input_hinged).unwrap();
    let sway_hinged = res_hinged.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Hinged beam version should sway more (beam cannot transfer moment)
    assert!(sway_hinged.abs() > sway_rigid.abs(),
        "Hinged beam sway ({:.6e}) should exceed rigid beam sway ({:.6e})",
        sway_hinged.abs(), sway_rigid.abs());

    // The beam in the hinged version should have zero end moments
    let ef_beam = res_hinged.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.m_start.abs() < 0.5,
        "Hinged beam m_start should be ~0: {:.4}", ef_beam.m_start);
    assert!(ef_beam.m_end.abs() < 0.5,
        "Hinged beam m_end should be ~0: {:.4}", ef_beam.m_end);
}

// ================================================================
// 5. Two-Bay Portal Distributes Lateral Load
// ================================================================
//
// 2-bay portal frame (5 nodes, 6 elements): 3 columns, 2 beams.
// Lateral load at node 2. With 3 columns, each column carries a
// share of the lateral shear. Equilibrium: sum of base shears = H.

#[test]
fn validation_two_bay_lateral_distribution() {
    let h = 4.0;
    let w = 5.0;
    let lateral = 30.0;

    // 2-bay portal: nodes at base and beam level
    // 1(0,0)  3(w,0)  5(2w,0)   -- base nodes
    // 2(0,h)  4(w,h)  6(2w,h)   -- beam level nodes
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, 0.0),   (4, w, h),
        (5, 2.0 * w, 0.0), (6, 2.0 * w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 3, 4, 1, 1, false, false), // middle column
        (3, "frame", 5, 6, 1, 1, false, false), // right column
        (4, "frame", 2, 4, 1, 1, false, false), // left beam
        (5, "frame", 4, 6, 1, 1, false, false), // right beam
    ];
    // Removed the extra element 6 to have exactly 5 elements for 2-bay frame
    let sups = vec![
        (1, 1_usize, "fixed"), (2, 3, "fixed"), (3, 5, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum of horizontal reactions = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.02, "Two-bay ΣRx = -H");

    // Each column base carries some horizontal shear
    let rx1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx;
    let rx3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rx;
    let rx5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rx;

    // Each should carry a meaningful fraction — roughly H/3 each, but not exactly
    // due to frame action. Interior column typically attracts more.
    let avg_shear = lateral / 3.0;
    assert!(rx1.abs() > avg_shear * 0.2,
        "Left column should carry significant shear: Rx={:.4}", rx1);
    assert!(rx3.abs() > avg_shear * 0.2,
        "Middle column should carry significant shear: Rx={:.4}", rx3);
    assert!(rx5.abs() > avg_shear * 0.2,
        "Right column should carry significant shear: Rx={:.4}", rx5);

    // All three reactions should be in the same direction (opposing the load)
    assert!(rx1 < 0.0 && rx3 < 0.0 && rx5 < 0.0,
        "All column base shears should oppose load: Rx1={:.4}, Rx3={:.4}, Rx5={:.4}",
        rx1, rx3, rx5);
}

// ================================================================
// 6. Strong Beam, Weak Column
// ================================================================
//
// Portal with beam Iz >> column Iz. The stiff beam acts as a rigid
// diaphragm, constraining both columns to sway equally. Under lateral
// load, ux at node 2 should be very close to ux at node 3.

#[test]
fn validation_strong_beam_weak_column() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let iz_col = 1e-4;
    let iz_beam = 1e-1; // beam 1000x stiffer

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (weak)
        (2, "frame", 2, 3, 1, 2, false, false), // beam (strong)
        (3, "frame", 3, 4, 1, 1, false, false), // right column (weak)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let ux2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // With a very stiff beam, both top nodes should move nearly the same amount
    let rel_diff = (ux2 - ux3).abs() / ux2.abs().max(1e-12);
    assert!(rel_diff < 0.05,
        "Strong beam: ux2={:.6e} ≈ ux3={:.6e}, rel_diff={:.4}",
        ux2, ux3, rel_diff);

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.02, "Strong beam equilibrium ΣRx");
}

// ================================================================
// 7. Weak Beam, Strong Column
// ================================================================
//
// Portal with beam Iz << column Iz. The flexible beam cannot fully
// transfer moment between columns. Under asymmetric lateral loading,
// ux at node 2 may differ significantly from ux at node 3.

#[test]
fn validation_weak_beam_strong_column() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let iz_col = 1e-1; // strong columns
    let iz_beam = 1e-5; // very weak beam

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (strong)
        (2, "frame", 2, 3, 1, 2, false, false), // beam (weak)
        (3, "frame", 3, 4, 1, 1, false, false), // right column (strong)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_col), (2, A, iz_beam)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let ux2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // With a very weak beam, the loaded column (node 2) should deflect more
    // than the unloaded column (node 3), since the beam cannot transfer shear effectively
    assert!(ux2.abs() > ux3.abs(),
        "Weak beam: loaded node ux2={:.6e} should exceed unloaded ux3={:.6e}",
        ux2.abs(), ux3.abs());

    // The loaded column should carry the majority of the lateral load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx;
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rx;
    assert!(r1.abs() > r4.abs(),
        "Loaded column base shear ({:.4}) should exceed unloaded ({:.4})",
        r1.abs(), r4.abs());

    // Equilibrium still holds
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.02, "Weak beam equilibrium ΣRx");
}

// ================================================================
// 8. Gravity Changes Moment Distribution Under Combined Loading
// ================================================================
//
// Portal with lateral load + distributed beam gravity vs lateral only.
// A distributed load on the beam generates fixed-end moments at the
// beam-column joints, which redistribute through the frame and alter
// the base moment pattern compared to lateral-only loading.

#[test]
fn validation_gravity_changes_moment_distribution() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let q_gravity = -15.0; // distributed gravity on beam (kN/m)

    // Case 1: Lateral only
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads_lateral = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input_lateral = make_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_lateral,
    );
    let res_lateral = linear::solve_2d(&input_lateral).unwrap();

    // Case 2: Lateral + distributed gravity on beam
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q_gravity, q_j: q_gravity, a: None, b: None,
        }),
    ];

    let input_combined = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_combined,
    );
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Base moments should differ: distributed beam load creates joint moments
    // that redistribute through the columns
    let r1_lat = res_lateral.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_lat = res_lateral.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let r1_comb = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_comb = res_combined.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let m1_diff = (r1_comb.mz - r1_lat.mz).abs();
    let m4_diff = (r4_comb.mz - r4_lat.mz).abs();

    assert!(m1_diff > 1.0 || m4_diff > 1.0,
        "Distributed gravity should change base moments: ΔM1={:.4}, ΔM4={:.4}",
        m1_diff, m4_diff);

    // Vertical reactions should increase (gravity adds vertical load)
    let ry_lat_sum: f64 = res_lateral.reactions.iter().map(|r| r.ry).sum();
    let ry_comb_sum: f64 = res_combined.reactions.iter().map(|r| r.ry).sum();
    let ry_diff = (ry_comb_sum - ry_lat_sum).abs();
    assert!(ry_diff > 10.0,
        "Combined loading should add vertical reactions: ΔRy={:.4}", ry_diff);

    // Both cases must satisfy horizontal equilibrium
    let sum_rx_lat: f64 = res_lateral.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_lat, -lateral, 0.02, "Lateral-only equilibrium ΣRx");

    let sum_rx_comb: f64 = res_combined.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_comb, -lateral, 0.02, "Combined equilibrium ΣRx");

    // Lateral sway should be the same (symmetric gravity produces zero sway
    // by superposition in linear analysis)
    let sway_lat = res_lateral.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let sway_comb = res_combined.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    assert_close(sway_lat, sway_comb, 0.02,
        "Symmetric gravity should not affect lateral sway");
}
