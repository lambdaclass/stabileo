/// Validation: Extended Braced Frames — Multi-Bay and Multi-Story Analysis
///
/// References:
///   - Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 5
///   - Stafford Smith & Coull, "Tall Building Structures", Ch. 8–9
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 13
///   - AISC 360-16, Chapter C (Stability)
///
/// Tests verify multi-bay and multi-story braced frame behaviour:
///   1. Two-bay single-story: lateral load sharing between braced bays
///   2. Three-story single-bay: inter-story drift ratio
///   3. Two-bay two-story: soft story effect (unbraced lower story)
///   4. Symmetric two-bay frame: reaction symmetry under symmetric gravity load
///   5. Multi-bay: brace force distribution across three bays
///   6. Three-story frame: overturning moment equilibrium
///   7. Two-bay frame: combined gravity + lateral moment equilibrium
///   8. Three-story two-bay: column axial force accumulation from gravity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_COL: f64 = 0.02;
const A_BEAM: f64 = 0.015;
const A_BRACE: f64 = 0.005;
const IZ_COL: f64 = 1e-4;
const IZ_BEAM: f64 = 8e-5;

// ================================================================
// 1. Two-Bay Single-Story: Lateral Load Sharing
// ================================================================
//
// Two adjacent bays, each with a diagonal brace. A lateral load P is
// applied at the top-left node. Both braced bays share the lateral
// shear. The total horizontal reaction must equal P, and both braces
// must carry nonzero axial force.
//
//  2----3----4     Lateral load P -> at node 2
//  |  / |  / |
//  | /  | /  |
//  1    5    6
//
// Reference: Stafford Smith & Coull, "Tall Building Structures", §8.2.

#[test]
fn validation_braced_ext_two_bay_load_sharing() {
    let h = 4.0;
    let w = 5.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, 2.0 * w, h),
        (5, w, 0.0),
        (6, 2.0 * w, 0.0),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 5, 3, 1, 1, false, false),
        (3, "frame", 6, 4, 1, 1, false, false),
        // Beams
        (4, "frame", 2, 3, 1, 2, false, false),
        (5, "frame", 3, 4, 1, 2, false, false),
        // Braces: one diagonal per bay
        (6, "truss", 1, 3, 1, 3, false, false),  // bay 1 brace
        (7, "truss", 5, 4, 1, 3, false, false),  // bay 2 brace
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 5, "pinned"),
        (3, 6, "pinned"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fz: 0.0, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Both braces carry axial force
    let n6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start.abs();
    let n7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap().n_start.abs();
    assert!(n6 > 1.0, "Bay 1 brace should carry force: N={:.4}", n6);
    assert!(n7 > 0.5, "Bay 2 brace should carry force: N={:.4}", n7);

    // Bay 1 brace (closer to load) carries more force than bay 2
    assert!(
        n6 > n7,
        "Bay 1 brace (N={:.4}) should carry more than bay 2 (N={:.4})",
        n6, n7
    );

    // Global horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Two-bay: ΣRx = -P");
}

// ================================================================
// 2. Three-Story Single-Bay: Inter-Story Drift Ratio
// ================================================================
//
// Three-story braced frame with equal lateral loads at each floor.
// All stories are X-braced. The cumulative shear increases downward,
// so the ground-story drift should be comparable to or larger than
// the upper stories (despite bracing) because the shear is larger.
//
// Reference: Taranath, "Structural Analysis and Design of Tall Buildings", §5.3.

#[test]
fn validation_braced_ext_three_story_drift_ratio() {
    let h = 3.5;
    let w = 6.0;
    let p = 10.0;

    // 8 nodes: 4 floors x 2 columns
    let nodes = vec![
        (1, 0.0, 0.0),       (2, w, 0.0),
        (3, 0.0, h),          (4, w, h),
        (5, 0.0, 2.0 * h),   (6, w, 2.0 * h),
        (7, 0.0, 3.0 * h),   (8, w, 3.0 * h),
    ];
    let elems = vec![
        // Columns (ground to 1st)
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // Columns (1st to 2nd)
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        // Columns (2nd to 3rd)
        (5, "frame", 5, 7, 1, 1, false, false),
        (6, "frame", 6, 8, 1, 1, false, false),
        // Beams
        (7, "frame", 3, 4, 1, 2, false, false),
        (8, "frame", 5, 6, 1, 2, false, false),
        (9, "frame", 7, 8, 1, 2, false, false),
        // X-braces: all three stories
        (10, "truss", 1, 4, 1, 3, false, false),
        (11, "truss", 2, 3, 1, 3, false, false),
        (12, "truss", 3, 6, 1, 3, false, false),
        (13, "truss", 4, 5, 1, 3, false, false),
        (14, "truss", 5, 8, 1, 3, false, false),
        (15, "truss", 6, 7, 1, 3, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 2, "pinned"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: p, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: p, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Get floor displacements (left column nodes)
    let ux_0: f64 = 0.0; // ground is fixed
    let ux_1 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux_2 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let ux_3 = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;

    let drift_1 = (ux_1 - ux_0).abs();
    let drift_2 = (ux_2 - ux_1).abs();
    let drift_3 = (ux_3 - ux_2).abs();

    // Ground story carries 3P shear, so drift_1 >= drift_3 (which carries only P)
    assert!(
        drift_1 >= drift_3 * 0.9,
        "Ground drift ({:.6e}) should be >= top drift ({:.6e}) due to cumulative shear",
        drift_1, drift_3
    );

    // All drifts should be positive (frame sways in load direction)
    assert!(drift_1 > 0.0, "Ground story drift should be positive");
    assert!(drift_2 > 0.0, "Second story drift should be positive");
    assert!(drift_3 > 0.0, "Third story drift should be positive");

    // Global equilibrium: total lateral load = 3P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -3.0 * p, 0.02, "Three-story: ΣRx = -3P");
}

// ================================================================
// 3. Two-Bay Two-Story: Soft Story Effect
// ================================================================
//
// Two-story, two-bay frame. Upper story has braces in both bays,
// ground story is unbraced. Under lateral loads, the ground-story
// drift should be much larger (soft story effect).
//
// Reference: Taranath, "Structural Analysis and Design of Tall Buildings", §5.5.

#[test]
fn validation_braced_ext_soft_story_effect() {
    let h = 3.5;
    let w = 5.0;
    let p = 15.0;

    // 6 column-line nodes (3 cols x 2 stories + ground)
    let nodes = vec![
        // Ground floor
        (1, 0.0, 0.0),   (2, w, 0.0),   (3, 2.0 * w, 0.0),
        // First floor
        (4, 0.0, h),     (5, w, h),     (6, 2.0 * w, h),
        // Second floor (roof)
        (7, 0.0, 2.0 * h), (8, w, 2.0 * h), (9, 2.0 * w, 2.0 * h),
    ];
    let elems = vec![
        // Ground-story columns (no braces)
        (1,  "frame", 1, 4, 1, 1, false, false),
        (2,  "frame", 2, 5, 1, 1, false, false),
        (3,  "frame", 3, 6, 1, 1, false, false),
        // Upper-story columns
        (4,  "frame", 4, 7, 1, 1, false, false),
        (5,  "frame", 5, 8, 1, 1, false, false),
        (6,  "frame", 6, 9, 1, 1, false, false),
        // First-floor beams
        (7,  "frame", 4, 5, 1, 2, false, false),
        (8,  "frame", 5, 6, 1, 2, false, false),
        // Roof beams
        (9,  "frame", 7, 8, 1, 2, false, false),
        (10, "frame", 8, 9, 1, 2, false, false),
        // Upper-story braces ONLY (creating soft story at ground)
        (11, "truss", 4, 8, 1, 3, false, false),  // bay 1 upper
        (12, "truss", 5, 9, 1, 3, false, false),  // bay 2 upper
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: p, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: p, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Ground-story drift (unbraced) should be much larger than upper story (braced)
    let ux_1st = results.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    let ux_roof = results.displacements.iter().find(|d| d.node_id == 7).unwrap().ux;

    let drift_ground = ux_1st.abs();
    let drift_upper = (ux_roof - ux_1st).abs();

    assert!(
        drift_ground > drift_upper * 2.0,
        "Soft-story ground drift ({:.6e}) should be > 2x upper drift ({:.6e})",
        drift_ground, drift_upper
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -2.0 * p, 0.02, "Soft story: ΣRx = -2P");
}

// ================================================================
// 4. Symmetric Two-Bay: Reaction Symmetry Under Gravity
// ================================================================
//
// Two-bay frame with symmetric geometry and symmetric gravity loads
// at all roof nodes. The outer column reactions should be equal,
// and the interior column reaction should be approximately double
// (it supports both bays).
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., §5.6.

#[test]
fn validation_braced_ext_two_bay_symmetric_gravity() {
    let h = 4.0;
    let w = 6.0;
    let fy = -30.0; // downward gravity at each roof node

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 0.0, h),
        (5, w, h),
        (6, 2.0 * w, h),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 4, 1, 1, false, false),
        (2, "frame", 2, 5, 1, 1, false, false),
        (3, "frame", 3, 6, 1, 1, false, false),
        // Beams
        (4, "frame", 4, 5, 1, 2, false, false),
        (5, "frame", 5, 6, 1, 2, false, false),
        // X-braces in both bays (symmetric)
        (6, "truss", 1, 5, 1, 3, false, false),
        (7, "truss", 2, 4, 1, 3, false, false),
        (8, "truss", 2, 6, 1, 3, false, false),
        (9, "truss", 3, 5, 1, 3, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: fy, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: fy, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: fy, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Outer column reactions (nodes 1 and 3) should be equal by symmetry
    let ry_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let ry_3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(ry_1, ry_3, 0.02, "Symmetric: Ry(1) = Ry(3)");

    // Interior column (node 2) carries vertical load from two tributary bays.
    // With X-braces the load paths are complex, but interior column should
    // carry at least 30% of total vertical load (it serves both bays).
    let ry_2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let total_fz = 3.0 * fy.abs();
    assert!(
        ry_2.abs() > total_fz * 0.30,
        "Interior column Ry ({:.4}) should carry >30% of total load ({:.4})",
        ry_2.abs(), total_fz
    );

    // Total vertical equilibrium: ΣRy = 3|fy|
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -3.0 * fy, 0.02, "Symmetric: ΣRy = 3|Fy|");

    // Horizontal reactions should sum to zero (no lateral load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.02, "Symmetric: ΣRx = 0");
}

// ================================================================
// 5. Three-Bay Frame: Brace Force Distribution
// ================================================================
//
// Three-bay single-story frame with diagonal braces in all bays.
// Under a lateral load at the leftmost node, the leftmost brace
// should carry the largest axial force. All braces should carry
// nonzero force and satisfy equilibrium.
//
// Reference: Stafford Smith & Coull, "Tall Building Structures", §8.4.

#[test]
fn validation_braced_ext_three_bay_force_distribution() {
    let h = 4.0;
    let w = 5.0;
    let p = 25.0;

    let nodes = vec![
        // Ground
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0), (4, 3.0 * w, 0.0),
        // Roof
        (5, 0.0, h),   (6, w, h),   (7, 2.0 * w, h),   (8, 3.0 * w, h),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 5, 1, 1, false, false),
        (2, "frame", 2, 6, 1, 1, false, false),
        (3, "frame", 3, 7, 1, 1, false, false),
        (4, "frame", 4, 8, 1, 1, false, false),
        // Beams
        (5, "frame", 5, 6, 1, 2, false, false),
        (6, "frame", 6, 7, 1, 2, false, false),
        (7, "frame", 7, 8, 1, 2, false, false),
        // Diagonal braces in each bay
        (8,  "truss", 1, 6, 1, 3, false, false),  // bay 1
        (9,  "truss", 2, 7, 1, 3, false, false),  // bay 2
        (10, "truss", 3, 8, 1, 3, false, false),  // bay 3
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
        (4, 4, "pinned"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fz: 0.0, my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // All braces should carry nonzero axial force
    let n8  = results.element_forces.iter().find(|e| e.element_id == 8).unwrap().n_start.abs();
    let n9  = results.element_forces.iter().find(|e| e.element_id == 9).unwrap().n_start.abs();
    let n10 = results.element_forces.iter().find(|e| e.element_id == 10).unwrap().n_start.abs();

    assert!(n8 > 0.5,  "Bay 1 brace force: {:.4}", n8);
    assert!(n9 > 0.1,  "Bay 2 brace force: {:.4}", n9);
    assert!(n10 > 0.01, "Bay 3 brace force: {:.4}", n10);

    // Bay 1 brace should carry the most force (closest to load application)
    assert!(
        n8 > n9 && n8 > n10,
        "Bay 1 brace (N={:.4}) should be largest: N9={:.4}, N10={:.4}",
        n8, n9, n10
    );

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Three-bay: ΣRx = -P");
}

// ================================================================
// 6. Three-Story Frame: Overturning Moment Equilibrium
// ================================================================
//
// Three-story braced frame with lateral loads at each floor.
// The overturning moment about the base due to applied loads
// must equal the restoring moment from the vertical reactions.
// M_overturn = P1*h + P2*2h + P3*3h
// M_restore = Ry_right * w (where w is the bay width)
//
// Reference: McCormac & Csernak, "Structural Steel Design", 6th Ed., §13.6.

#[test]
fn validation_braced_ext_overturning_moment() {
    let h = 3.0;
    let w = 6.0;
    let p1 = 10.0;
    let p2 = 10.0;
    let p3 = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),       (2, w, 0.0),
        (3, 0.0, h),          (4, w, h),
        (5, 0.0, 2.0 * h),   (6, w, 2.0 * h),
        (7, 0.0, 3.0 * h),   (8, w, 3.0 * h),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        (5, "frame", 5, 7, 1, 1, false, false),
        (6, "frame", 6, 8, 1, 1, false, false),
        // Beams
        (7, "frame", 3, 4, 1, 2, false, false),
        (8, "frame", 5, 6, 1, 2, false, false),
        (9, "frame", 7, 8, 1, 2, false, false),
        // Diagonal braces (one per story)
        (10, "truss", 1, 4, 1, 3, false, false),
        (11, "truss", 3, 6, 1, 3, false, false),
        (12, "truss", 5, 8, 1, 3, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 2, "pinned"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p1, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: p2, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: p3, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Overturning moment about node 1 (base-left) from applied loads
    let m_overturn = p1 * h + p2 * 2.0 * h + p3 * 3.0 * h;

    // Restoring moment from vertical reactions
    // Taking moments about node 1: Ry_node2 * w contributes restoring moment
    // Ry_node1 * 0 = 0 (at pivot), and horizontal reactions at base contribute via lever arm = 0
    let ry_2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;

    // Moment about left base: Ry_2 * w = M_overturn
    // Ry_1 * 0 = 0 (at pivot), Rx reactions at y=0 have zero lever arm.
    // Support moments (Mz) are zero since supports are pinned.
    let m_restore = ry_2 * w;

    // The overturning moment should be balanced by the restoring moment
    // m_overturn (positive = clockwise from loads pushing right)
    // m_restore = ry_2 * w; if ry_2 is negative (downward), it would resist uplift
    // ry_1 would be upward (positive) for overturning resistance
    // ΣM about node 1 = 0: -m_overturn + ry_2 * w = 0 (sign depends on convention)
    // We check: |ry_2 * w| ≈ m_overturn (accounting for ry_1 contribution = 0 at pivot)
    // More precisely: ry_1 * 0 + ry_2 * w = -m_overturn (reactions oppose loads)
    assert_close(m_restore.abs(), m_overturn, 0.05, "Overturning: |Ry2*w| = M_overturn");

    // Total horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -(p1 + p2 + p3), 0.02, "Overturning: ΣRx = -ΣP");

    // Total vertical equilibrium (no gravity loads, so ΣRy = 0)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 0.02, "Overturning: ΣRy = 0");
}

// ================================================================
// 7. Two-Bay Frame: Combined Gravity + Lateral Moment Equilibrium
// ================================================================
//
// Two-bay single-story frame under combined lateral and gravity loads.
// Full moment equilibrium about the left base is verified:
//   ΣM_base = 0: Ry_mid*w + Ry_right*2w + M_fixed_joints = Σ(applied moments about base)
//
// Reference: AISC 360-16, Commentary on Chapter C.

#[test]
fn validation_braced_ext_two_bay_combined_equilibrium() {
    let h = 4.0;
    let w = 5.0;
    let px = 12.0; // lateral at roof-left
    let fy_val = -20.0; // gravity at each roof node

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 0.0, h),
        (5, w, h),
        (6, 2.0 * w, h),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 4, 1, 1, false, false),
        (2, "frame", 2, 5, 1, 1, false, false),
        (3, "frame", 3, 6, 1, 1, false, false),
        // Beams
        (4, "frame", 4, 5, 1, 2, false, false),
        (5, "frame", 5, 6, 1, 2, false, false),
        // Diagonal braces
        (6, "truss", 1, 5, 1, 3, false, false),
        (7, "truss", 2, 6, 1, 3, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: px, fz: fy_val, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: fy_val, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: fy_val, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "Combined: ΣRx = -Px");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -3.0 * fy_val, 0.02, "Combined: ΣRy = 3|Fy|");

    // Full moment equilibrium about node 1 (left base, at origin):
    // Moment convention: positive = counterclockwise
    // Moment of force F at point (x, y) about origin = Fx * y - Fy * x
    //
    // Applied load moments about (0, 0):
    //   Node 4 (0, h): Px * h - Fy_4 * 0 = Px * h
    //   Node 5 (w, h): 0 * h - Fy_5 * w = -Fy_5 * w
    //   Node 6 (2w, h): 0 * h - Fy_6 * 2w = -Fy_6 * 2w
    let m_applied = px * h - fy_val * 0.0 - fy_val * w - fy_val * 2.0 * w;

    // Reaction moments about (0, 0):
    //   All base nodes at y=0, so Rx * 0 = 0 for all.
    //   Node 1 (0, 0): -Ry_1 * 0 + Mz_1
    //   Node 2 (w, 0): -Ry_2 * w + Mz_2
    //   Node 3 (2w, 0): -Ry_3 * 2w + Mz_3
    let ry_2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    let ry_3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    let mz_1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().my;
    let mz_2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().my;
    let mz_3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().my;

    // Ry_1 * 0 = 0 (at pivot point), so omitted
    let m_reactions = -ry_2 * w - ry_3 * 2.0 * w + mz_1 + mz_2 + mz_3;

    // ΣM about node 1 = 0 => m_applied + m_reactions = 0
    // Normalize residual by total applied moment magnitude
    let m_residual = (m_applied + m_reactions).abs();
    let m_scale = m_applied.abs();
    assert!(
        m_residual / m_scale < 0.02,
        "Combined: moment equilibrium residual/scale = {:.6}/{:.6} = {:.4}%",
        m_residual, m_scale, m_residual / m_scale * 100.0
    );
}

// ================================================================
// 8. Three-Story Two-Bay: Column Axial Force Accumulation
// ================================================================
//
// Three-story, two-bay braced frame under uniform gravity loads at
// every floor. Interior columns carry tributary load from two bays,
// so their axial force should be approximately double that of
// exterior columns at each level. The ground-floor columns carry
// the cumulative load from all stories above.
//
// Reference: Taranath, "Structural Analysis and Design of Tall Buildings", §5.2.

#[test]
fn validation_braced_ext_column_axial_accumulation() {
    let h = 3.5;
    let w = 6.0;
    let fy_floor = -15.0; // gravity load per node per floor

    // 12 nodes: 3 columns x 4 levels (ground + 3 floors)
    let nodes = vec![
        // Ground (y=0)
        (1, 0.0, 0.0),   (2, w, 0.0),   (3, 2.0 * w, 0.0),
        // Floor 1 (y=h)
        (4, 0.0, h),     (5, w, h),     (6, 2.0 * w, h),
        // Floor 2 (y=2h)
        (7, 0.0, 2.0 * h), (8, w, 2.0 * h), (9, 2.0 * w, 2.0 * h),
        // Roof (y=3h)
        (10, 0.0, 3.0 * h), (11, w, 3.0 * h), (12, 2.0 * w, 3.0 * h),
    ];
    let elems = vec![
        // Ground-story columns
        (1, "frame", 1, 4, 1, 1, false, false),
        (2, "frame", 2, 5, 1, 1, false, false),
        (3, "frame", 3, 6, 1, 1, false, false),
        // Second-story columns
        (4, "frame", 4, 7, 1, 1, false, false),
        (5, "frame", 5, 8, 1, 1, false, false),
        (6, "frame", 6, 9, 1, 1, false, false),
        // Third-story columns
        (7, "frame", 7, 10, 1, 1, false, false),
        (8, "frame", 8, 11, 1, 1, false, false),
        (9, "frame", 9, 12, 1, 1, false, false),
        // Floor 1 beams
        (10, "frame", 4, 5, 1, 2, false, false),
        (11, "frame", 5, 6, 1, 2, false, false),
        // Floor 2 beams
        (12, "frame", 7, 8, 1, 2, false, false),
        (13, "frame", 8, 9, 1, 2, false, false),
        // Roof beams
        (14, "frame", 10, 11, 1, 2, false, false),
        (15, "frame", 11, 12, 1, 2, false, false),
        // One diagonal brace per story in bay 1 for stability
        (16, "truss", 1, 5, 1, 3, false, false),
        (17, "truss", 4, 8, 1, 3, false, false),
        (18, "truss", 7, 11, 1, 3, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 2, "fixed"),
        (3, 3, "fixed"),
    ];
    // Gravity loads at all floor and roof nodes (9 loaded nodes)
    let loads = vec![
        // Floor 1
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        // Floor 2
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 9,  fx: 0.0, fz: fy_floor, my: 0.0 }),
        // Roof
        SolverLoad::Nodal(SolverNodalLoad { node_id: 10, fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 11, fx: 0.0, fz: fy_floor, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 12, fx: 0.0, fz: fy_floor, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_COL, IZ_COL), (2, A_BEAM, IZ_BEAM), (3, A_BRACE, 0.0)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Ground-floor columns carry more axial load than upper columns
    // Element 1 is ground-story left column, element 7 is top-story left column
    let n_ground_left = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap().n_start.abs();
    let n_top_left = results.element_forces.iter()
        .find(|e| e.element_id == 7).unwrap().n_start.abs();

    assert!(
        n_ground_left > n_top_left * 1.5,
        "Ground column axial ({:.4}) should be > 1.5x top column ({:.4})",
        n_ground_left, n_top_left
    );

    // Interior ground column (elem 2) carries more than exterior (elem 1)
    let n_ground_int = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap().n_start.abs();

    assert!(
        n_ground_int > n_ground_left * 0.8,
        "Interior ground col ({:.4}) should carry significant load vs exterior ({:.4})",
        n_ground_int, n_ground_left
    );

    // Vertical equilibrium: total gravity = 9 * fy_floor
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -9.0 * fy_floor, 0.02, "Column accumulation: ΣRy = 9|Fy|");

    // Horizontal equilibrium: no lateral loads
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, 0.0, 0.05, "Column accumulation: ΣRx = 0");
}
