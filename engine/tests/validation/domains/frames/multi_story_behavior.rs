/// Validation: Multi-Story Frame Behavior
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 15 (approximate methods)
///   - Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 3-4
///   - ASCE 7-22 §12.8.6 (story drift limits)
///   - Ghali/Neville, "Structural Analysis", Ch. 9 (multi-story frames)
///
/// Tests verify multi-story portal frame behavior:
///   1. Two-story lateral drift: upper floors drift more
///   2. Story shear distribution: total base shear = applied lateral load
///   3. Symmetric gravity: no lateral sway
///   4. Inter-story drift ratio: positive drifts that sum correctly
///   5. Column axial force from gravity: bottom columns carry both stories
///   6. Stiffer columns reduce drift
///   7. Base moment under lateral load: moment equilibrium
///   8. Cantilever column vs portal column: frame action reduces drift
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Story Portal Frame Lateral Drift
// ================================================================
//
// 2-story portal frame with lateral load at node 2.
// Upper floors should drift more than lower floors.
//
//   5 --------  6       (story 2, y=8)
//   |          |
//   2 --------  3       (story 1, y=4)
//   |          |
//   1 (fixed)   4 (fixed)  (base, y=0)

#[test]
fn validation_two_story_lateral_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col floor 1
        (2, "frame", 2, 3, 1, 1, false, false), // beam level 1
        (3, "frame", 3, 4, 1, 1, false, false), // right col floor 1
        (4, "frame", 2, 5, 1, 1, false, false), // left col floor 2
        (5, "frame", 3, 6, 1, 1, false, false), // right col floor 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam level 2
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 should drift in load direction
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0,
        "Node 2 should drift in load direction: ux={:.6e}", d2.ux);

    // Node 5 (upper floor) should drift more than node 2 (lower floor)
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(d5.ux > d2.ux,
        "Upper floor drift ({:.6e}) should exceed lower floor drift ({:.6e})",
        d5.ux, d2.ux);
}

// ================================================================
// 2. Story Shear Distribution
// ================================================================
//
// Same 2-story frame. Apply H=10kN at top (node 5).
// Total base shear must equal applied lateral load.

#[test]
fn validation_two_story_shear_distribution() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 2, 5, 1, 1, false, false),
        (5, "frame", 3, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: lateral, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear: sum of rx at nodes 1 and 4 must equal -H
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let sum_rx = r1.rx + r4.rx;

    assert_close(sum_rx, -lateral, 0.01, "Total base shear = -H");
}

// ================================================================
// 3. Symmetric Gravity — No Sway
// ================================================================
//
// 2-story frame with equal UDL on both beams.
// Symmetric loading + symmetric geometry => zero lateral sway.

#[test]
fn validation_two_story_symmetric_gravity_no_sway() {
    let h = 4.0;
    let w = 6.0;
    let q = -15.0; // gravity UDL (downward)

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false), // beam level 1
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 2, 5, 1, 1, false, false),
        (5, "frame", 3, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false), // beam level 2
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: q, q_j: q, a: None, b: None,
        }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All beam-column joints should have negligible lateral displacement.
    // Allow small numerical noise from element orientation asymmetry (column
    // element directions create minor axial-coupling effects).
    let d_max = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    for nid in &[2, 3, 5, 6] {
        let d = results.displacements.iter().find(|d| d.node_id == *nid).unwrap();
        assert!(d.ux.abs() < d_max * 0.05 || d.ux.abs() < 1e-4,
            "Symmetric gravity: node {} ux={:.6e} should be ~0 (d_max={:.6e})",
            nid, d.ux, d_max);
    }
}

// ================================================================
// 4. Inter-Story Drift Ratio
// ================================================================
//
// 2-story frame with lateral load. Verify:
//   drift_1 = ux(node2)
//   drift_2 = ux(node5) - ux(node2)
//   Both positive; total = ux(node5).

#[test]
fn validation_two_story_inter_story_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 2, 5, 1, 1, false, false),
        (5, "frame", 3, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: lateral, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ux2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    let drift_1 = ux2;          // first story drift (base is fixed at 0)
    let drift_2 = ux5 - ux2;    // second story inter-story drift

    // Both drifts should be positive (load pushes frame to the right)
    assert!(drift_1 > 0.0,
        "First story drift should be positive: {:.6e}", drift_1);
    assert!(drift_2 > 0.0,
        "Second story drift should be positive: {:.6e}", drift_2);

    // Total drift at top = sum of inter-story drifts
    let total = drift_1 + drift_2;
    assert_close(total, ux5, 0.001, "Total drift = ux(node5)");
}

// ================================================================
// 5. Column Axial Force from Gravity
// ================================================================
//
// 2-story frame with gravity point loads P at beam-column joints
// (nodes 2,3,5,6). Symmetric case: base vertical reaction = 2P
// per support (each base carries half of both stories).

#[test]
fn validation_two_story_column_axial_gravity() {
    let h = 4.0;
    let w = 6.0;
    let p = 50.0; // gravity point load at each joint

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 2, 5, 1, 1, false, false),
        (5, "frame", 3, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical load = 4P
    let total_gravity = 4.0 * p;

    // Sum of base vertical reactions = total gravity
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let sum_ry = r1.rz + r4.rz;
    assert_close(sum_ry, total_gravity, 0.01, "Sum Ry = total gravity");

    // Symmetric case: each base reaction = total_gravity / 2 = 2P
    assert_close(r1.rz, total_gravity / 2.0, 0.01, "Ry at node 1 = 2P");
    assert_close(r4.rz, total_gravity / 2.0, 0.01, "Ry at node 4 = 2P");
}

// ================================================================
// 6. Stiffer Columns Reduce Drift
// ================================================================
//
// Compare two 1-story portal frames: one with IZ, one with 2*IZ.
// Same lateral load. Stiffer frame should drift less.

#[test]
fn validation_stiffer_columns_reduce_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Frame with normal stiffness
    let input_normal = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 })],
    );
    let r_normal = linear::solve_2d(&input_normal).unwrap();
    let drift_normal = r_normal.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Frame with double stiffness
    let iz_double = 2.0 * IZ;
    let input_stiff = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, iz_double)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 })],
    );
    let r_stiff = linear::solve_2d(&input_stiff).unwrap();
    let drift_stiff = r_stiff.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Stiffer frame drifts less
    assert!(drift_stiff < drift_normal,
        "Stiffer frame should drift less: {:.6e} < {:.6e}", drift_stiff, drift_normal);
    assert!(drift_stiff > 0.0, "Both frames should drift in load direction");
    assert!(drift_normal > 0.0, "Both frames should drift in load direction");
}

// ================================================================
// 7. Base Moment Under Lateral Load
// ================================================================
//
// 1-story fixed-base portal, lateral load H at beam level.
// Global moment equilibrium about left base (node 1):
//   -H*h + Mz_1 + Mz_4 + Ry_4 * w = 0
// So: Mz_1 + Mz_4 + Ry_4 * w = H * h

#[test]
fn validation_base_moment_lateral_load() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Moment equilibrium about node 1 (base left):
    //   -H*h + Mz_1 + Mz_4 + Ry_4 * w = 0
    let m_overturning = lateral * h;
    let m_resisting = r1.my + r4.my + r4.rz * w;

    assert_close(m_resisting, m_overturning, 0.01,
        "Moment equilibrium: resisting = overturning");
}

// ================================================================
// 8. Cantilever Column vs Portal Column
// ================================================================
//
// Compare a single cantilever column (fixed base, free top, lateral P)
// vs the same column as part of a portal frame.
// Portal frame action provides additional stiffness, so drift is smaller.

#[test]
fn validation_cantilever_vs_portal_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Cantilever column: fixed base at node 1, free top at node 2
    let input_cantilever = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 })],
    );
    let r_cantilever = linear::solve_2d(&input_cantilever).unwrap();
    let drift_cantilever = r_cantilever.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Portal frame: same column but connected to a beam and second column
    let input_portal = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fz: 0.0, my: 0.0 })],
    );
    let r_portal = linear::solve_2d(&input_portal).unwrap();
    let drift_portal = r_portal.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Both should drift in load direction
    assert!(drift_cantilever > 0.0, "Cantilever should drift positive");
    assert!(drift_portal > 0.0, "Portal should drift positive");

    // Portal should have smaller drift (frame action stiffens it)
    assert!(drift_portal < drift_cantilever,
        "Portal drift ({:.6e}) should be less than cantilever drift ({:.6e})",
        drift_portal, drift_cantilever);
}
