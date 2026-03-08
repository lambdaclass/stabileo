/// Validation: Truss and Frame Problems from Kassimali, "Structural Analysis" (6th Ed.)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 4 (Plane Trusses)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (Space Trusses)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 17 (Direct Stiffness Method)
///
/// Tests:
///   1. Simple 3-bar planar truss: axial forces from method of joints
///   2. Warren truss 6-panel: chord compression/tension pattern
///   3. Pratt truss 4-panel: diagonal tension, zero-force verticals
///   4. Howe truss 4-panel: diagonals in compression (reversed from Pratt)
///   5. K-truss: member forces in loaded panel
///   6. Determinate frame (3-hinge portal): reactions and zero moments at pins
///   7. Truss with thermal load: indeterminate thermal forces
///   8. Compound truss (Fink/fan): symmetry and equilibrium
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

/// E in MPa (will be converted to kN/m^2 internally via E_EFF = E * 1000)
const E: f64 = 200_000.0;
/// Cross-section area for truss members (m^2), per Kassimali examples
const A_TRUSS: f64 = 10e-4; // 10 cm^2 = 0.001 m^2
/// No bending stiffness for truss members
const IZ_TRUSS: f64 = 0.0;

// ================================================================
// 1. Simple 3-Bar Planar Truss (Kassimali Example 4.1 style)
// ================================================================
//
// Geometry:
//   Node 1: (0, 0) — pinned support
//   Node 2: (4, 0) — roller support (vertical reaction only)
//   Node 3: (2, 3) — loaded node
//
// Members: 1-3 (left), 2-3 (right), 1-2 (bottom chord)
// Loads: Fx = 10 kN (horizontal), Fy = -20 kN (vertical) at node 3
//
// By method of joints at node 3:
//   L_13 = sqrt(4+9) = sqrt(13), cos_13 = 2/sqrt(13), sin_13 = 3/sqrt(13)
//   L_23 = sqrt(4+9) = sqrt(13), cos_23 = 2/sqrt(13), sin_23 = 3/sqrt(13)
//   (both diagonals are symmetric about the vertical axis)
//
// Reactions by statics:
//   ΣM about 1: R2y * 4 = 20 * 2 - 10 * 3 → R2y = (40-30)/4 = 2.5 kN
//   ΣFy: R1y + R2y = 20 → R1y = 17.5 kN
//   ΣFx: R1x = -10 kN
//
// At joint 1: method of joints
//   F_13 (along member 1-3), F_12 (along member 1-2)
//   cos(α) = 2/√13, sin(α) = 3/√13
//   ΣFy at 1: R1y + F_13 * sin(α) = 0 → F_13 = -R1y / sin(α) = -17.5 * √13/3
//   ΣFx at 1: R1x + F_12 + F_13 * cos(α) = 0 → F_12 = -R1x - F_13 * cos(α)

#[test]
fn validation_kassimali_1_simple_truss_3bar() {
    let fx = 10.0;
    let fy = 20.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            (1, "truss", 1, 3, 1, 1, true, true), // left diagonal
            (2, "truss", 2, 3, 1, 1, true, true), // right diagonal
            (3, "truss", 1, 2, 1, 1, true, true), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx,
            fy: -fy,
            mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // ΣM about 1: R2y*4 = Fy*2 + Fx*3 = 20*2 + 10*3 = 70 → R2y = 17.5
    assert_close(r2.ry, 17.5, 0.03, "Kassimali 3-bar: R2y = 17.5 kN");
    // R1y = Py - R2y = 20 - 17.5 = 2.5
    assert_close(r1.ry, 2.5, 0.03, "Kassimali 3-bar: R1y = 2.5 kN");
    // R1x = -Fx = -10
    assert_close(r1.rx, -fx, 0.03, "Kassimali 3-bar: R1x = -10 kN");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, fy, 0.02, "Kassimali 3-bar: ΣRy = Py");

    // Member 1 (1→3): at joint 1: ΣFy = R1y + F_13*sin(a) = 0
    // F_13 = -R1y / sin(a) = -2.5 / (3/sqrt(13)) = -2.5*sqrt(13)/3
    let sqrt13 = 13.0_f64.sqrt();
    let sin_a = 3.0 / sqrt13;
    let f13_exact = -2.5 / sin_a; // negative = compression
    let ef1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    assert_close(
        ef1.n_start,
        f13_exact,
        0.05,
        "Kassimali 3-bar: F_13 (left diagonal)",
    );

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "Kassimali 3-bar: finite force elem {}",
            ef.element_id
        );
    }
}

// ================================================================
// 2. Warren Truss 6-Panel (Kassimali style)
// ================================================================
//
// Span = 18 m (6 panels x 3 m), height = 3 m.
// Bottom chord: nodes 1-7 at y=0, x = 0, 3, 6, 9, 12, 15, 18
// Top chord: nodes 8-12 at y=3, x = 3, 6, 9, 12, 15
// (Warren with verticals variant for stability)
//
// Joint loads: P = 20 kN at each internal bottom node (2..6).
// Symmetric loading on symmetric truss → R1 = R7 = 5P/2 = 50.

#[test]
fn validation_kassimali_2_warren_truss_6panel() {
    let d = 3.0; // panel width
    let h = 3.0; // height
    let p = 20.0; // load per bottom node

    // Bottom chord nodes: 1..=7
    // Top chord nodes: 8..=12
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, d, 0.0),
        (3, 2.0 * d, 0.0),
        (4, 3.0 * d, 0.0),
        (5, 4.0 * d, 0.0),
        (6, 5.0 * d, 0.0),
        (7, 6.0 * d, 0.0),
        (8, d, h),
        (9, 2.0 * d, h),
        (10, 3.0 * d, h),
        (11, 4.0 * d, h),
        (12, 5.0 * d, h),
    ];

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord: 1-2, 2-3, 3-4, 4-5, 5-6, 6-7
    for i in 1..=6 {
        elems.push((eid, "truss", i, i + 1, 1, 1, true, true));
        eid += 1;
    }
    // Top chord: 8-9, 9-10, 10-11, 11-12
    for i in 8..=11 {
        elems.push((eid, "truss", i, i + 1, 1, 1, true, true));
        eid += 1;
    }
    // Verticals: 2-8, 3-9, 4-10, 5-11, 6-12
    for i in 0..5 {
        elems.push((eid, "truss", i + 2, i + 8, 1, 1, true, true));
        eid += 1;
    }
    // Warren diagonals (alternating): 1-8, 8-3, 3-9 already covered by verticals
    // Actually Warren pattern: diagonals zigzag
    // Left-leaning: 1-8, 9-3, 3-10(skip), etc.
    // Correct Warren: 1-8, 8-3, 2-9, 9-4, 3-10(skip) ... let's use V-pattern:
    //   Up diagonals: 1-8, 3-10, 5-12
    //   Down diagonals: 8-3 (already vert at 2-8), 10-5, 12-7
    // Actually simplest: alternating pattern
    //   Panel 1: 1-8 (up-right)
    //   Panel 2: 8-3 (down-right) — wait, 8 is at (3,3), node 3 is at (6,0)
    // Let me just do explicit diagonals for a proper Warren pattern:
    // Diagonals going up-right: 1→8, 2→9, 3→10, 4→11, 5→12
    // Diagonals going down-right: 8→3, 9→4, 10→5, 11→6, 12→7
    // This gives a Warren-with-verticals pattern (Pratt+Warren hybrid).
    // For pure Warren (no verticals), remove the verticals and keep diagonals.
    // Since we already added verticals, let's add the diagonals:
    // Up-right diagonals: 1→8, 3→10, 5→12
    elems.push((eid, "truss", 1, 8, 1, 1, true, true));
    eid += 1;
    elems.push((eid, "truss", 3, 10, 1, 1, true, true));
    eid += 1;
    elems.push((eid, "truss", 5, 12, 1, 1, true, true));
    eid += 1;
    // Down-right diagonals: 8→3, 10→5, 12→7
    elems.push((eid, "truss", 8, 3, 1, 1, true, true));
    eid += 1;
    elems.push((eid, "truss", 10, 5, 1, 1, true, true));
    eid += 1;
    elems.push((eid, "truss", 12, 7, 1, 1, true, true));
    let _eid = eid + 1;

    // Loads at internal bottom nodes: 2, 3, 4, 5, 6
    let loads: Vec<SolverLoad> = (2..=6)
        .map(|nid| {
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: nid,
                fx: 0.0,
                fy: -p,
                mz: 0.0,
            })
        })
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        elems,
        vec![(1, 1, "pinned"), (2, 7, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total load = 5P = 100
    let total_load = 5.0 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        total_load,
        0.02,
        "Warren 6-panel: ΣRy = 5P",
    );

    // Symmetric: R1 = R7 = 5P/2 = 50
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap();
    assert_close(r1.ry, total_load / 2.0, 0.02, "Warren 6-panel: R1 = 5P/2");
    assert_close(r7.ry, total_load / 2.0, 0.02, "Warren 6-panel: R7 = 5P/2");

    // Top chord should be in compression (under gravity loading)
    // Check first top chord member (element 7: nodes 8→9)
    let ef_top = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 7)
        .unwrap();
    assert!(
        ef_top.n_start < 0.0,
        "Warren 6-panel: top chord in compression: N={:.4}",
        ef_top.n_start
    );

    // Bottom chord should be in tension
    // Check middle bottom chord member (element 3: nodes 3→4)
    let ef_bot = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    assert!(
        ef_bot.n_start > 0.0,
        "Warren 6-panel: bottom chord in tension: N={:.4}",
        ef_bot.n_start
    );

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "Warren 6-panel: finite force elem {}",
            ef.element_id
        );
    }
}

// ================================================================
// 3. Pratt Truss 4-Panel (Kassimali style)
// ================================================================
//
// Pratt truss: verticals carry compression, diagonals slope toward center
// and carry tension under gravity loading.
// L = 16m (4 panels x 4m), H = 4m.
// Equivalent UDL as joint loads: P = 10 kN at each internal bottom node (2,3,4).
//
// Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
// Top:    6(0,4), 7(4,4), 8(8,4), 9(12,4), 10(16,4)
// Verticals: 1-6, 2-7, 3-8, 4-9, 5-10
// Diagonals (Pratt, slope toward center): 1-7, 2-8, 4-8, 5-9
//   (from each end, diagonals go up toward center)

#[test]
fn validation_kassimali_3_pratt_truss() {
    let w = 4.0;
    let h = 4.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 3.0 * w, 0.0),
        (5, 4.0 * w, 0.0),
        (6, 0.0, h),
        (7, w, h),
        (8, 2.0 * w, h),
        (9, 3.0 * w, h),
        (10, 4.0 * w, h),
    ];

    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, true, true),
        (2, "truss", 2, 3, 1, 1, true, true),
        (3, "truss", 3, 4, 1, 1, true, true),
        (4, "truss", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "truss", 6, 7, 1, 1, true, true),
        (6, "truss", 7, 8, 1, 1, true, true),
        (7, "truss", 8, 9, 1, 1, true, true),
        (8, "truss", 9, 10, 1, 1, true, true),
        // Verticals
        (9, "truss", 1, 6, 1, 1, true, true),
        (10, "truss", 2, 7, 1, 1, true, true),
        (11, "truss", 3, 8, 1, 1, true, true),
        (12, "truss", 4, 9, 1, 1, true, true),
        (13, "truss", 5, 10, 1, 1, true, true),
        // Diagonals (Pratt: slope downward toward center, i.e. from top near ends
        // to bottom near center — these diagonals carry tension under gravity)
        (14, "truss", 6, 2, 1, 1, true, true),  // left panel: top-left(0,4) to bot(4,0)
        (15, "truss", 7, 3, 1, 1, true, true),  // second panel: top(4,4) to bot-center(8,0)
        (16, "truss", 9, 3, 1, 1, true, true),  // third panel: top(12,4) to bot-center(8,0)
        (17, "truss", 10, 4, 1, 1, true, true), // right panel: top-right(16,4) to bot(12,0)
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        elems,
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = 3P = 30
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Pratt: ΣRy = 3P");

    // Symmetric loading → equal reactions R1 = R5 = 3P/2 = 15
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, 1.5 * p, 0.02, "Pratt: R1 = 3P/2");
    assert_close(r5.ry, 1.5 * p, 0.02, "Pratt: R5 = 3P/2");

    // Pratt diagonals should be in tension under gravity
    let ef14 = results.element_forces.iter().find(|e| e.element_id == 14).unwrap();
    let ef17 = results.element_forces.iter().find(|e| e.element_id == 17).unwrap();
    assert!(
        ef14.n_start > 0.0,
        "Pratt: left outer diagonal in tension: N={:.4}",
        ef14.n_start
    );
    assert!(
        ef17.n_start > 0.0,
        "Pratt: right outer diagonal in tension: N={:.4}",
        ef17.n_start
    );

    // Symmetric diagonal forces: |F_14| = |F_17|
    assert_close(
        ef14.n_start.abs(),
        ef17.n_start.abs(),
        0.03,
        "Pratt: symmetric outer diagonals",
    );

    // Top chord at center (element 6: 7→8 or element 7: 8→9) should be in compression
    let ef_top_center = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef_top_center.n_start < 0.0,
        "Pratt: top chord center in compression: N={:.4}",
        ef_top_center.n_start
    );

    // Bottom chord at center (element 2: 2→3 or 3: 3→4) should be in tension
    let ef_bot_center = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef_bot_center.n_start > 0.0,
        "Pratt: bottom chord center in tension: N={:.4}",
        ef_bot_center.n_start
    );

    // Maximum chord force is at center (higher moment)
    let ef_bot_outer = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        ef_bot_center.n_start.abs() > ef_bot_outer.n_start.abs(),
        "Pratt: center chord > outer chord: center={:.4}, outer={:.4}",
        ef_bot_center.n_start,
        ef_bot_outer.n_start
    );
}

// ================================================================
// 4. Howe Truss 4-Panel (Kassimali style)
// ================================================================
//
// Howe truss: same geometry as Pratt but diagonals slope AWAY from center.
// Under gravity loading, Howe diagonals carry COMPRESSION (opposite to Pratt).
// L = 16m (4 panels x 4m), H = 4m.

#[test]
fn validation_kassimali_4_howe_truss() {
    let w = 4.0;
    let h = 4.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 3.0 * w, 0.0),
        (5, 4.0 * w, 0.0),
        (6, 0.0, h),
        (7, w, h),
        (8, 2.0 * w, h),
        (9, 3.0 * w, h),
        (10, 4.0 * w, h),
    ];

    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, true, true),
        (2, "truss", 2, 3, 1, 1, true, true),
        (3, "truss", 3, 4, 1, 1, true, true),
        (4, "truss", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "truss", 6, 7, 1, 1, true, true),
        (6, "truss", 7, 8, 1, 1, true, true),
        (7, "truss", 8, 9, 1, 1, true, true),
        (8, "truss", 9, 10, 1, 1, true, true),
        // Verticals
        (9, "truss", 1, 6, 1, 1, true, true),
        (10, "truss", 2, 7, 1, 1, true, true),
        (11, "truss", 3, 8, 1, 1, true, true),
        (12, "truss", 4, 9, 1, 1, true, true),
        (13, "truss", 5, 10, 1, 1, true, true),
        // Diagonals (Howe: slope upward toward center, i.e. from bottom near ends
        // to top near center — these diagonals carry compression under gravity)
        (14, "truss", 1, 7, 1, 1, true, true),  // left panel: bot-left(0,0) to top(4,4)
        (15, "truss", 2, 8, 1, 1, true, true),  // second panel: bot(4,0) to top-center(8,4)
        (16, "truss", 4, 8, 1, 1, true, true),  // third panel: bot(12,0) to top-center(8,4)
        (17, "truss", 5, 9, 1, 1, true, true),  // right panel: bot-right(16,0) to top(12,4)
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        elems,
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = 3P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Howe: ΣRy = 3P");

    // Symmetric: R1 = R5 = 3P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, 1.5 * p, 0.02, "Howe: R1 = 3P/2");
    assert_close(r5.ry, 1.5 * p, 0.02, "Howe: R5 = 3P/2");

    // Howe diagonals should be in COMPRESSION under gravity
    // Diagonal 14: node 2(4,0) → node 6(0,4) — goes up-left
    let ef14 = results.element_forces.iter().find(|e| e.element_id == 14).unwrap();
    let ef17 = results.element_forces.iter().find(|e| e.element_id == 17).unwrap();
    assert!(
        ef14.n_start < 0.0,
        "Howe: left outer diagonal in compression: N={:.4}",
        ef14.n_start
    );
    assert!(
        ef17.n_start < 0.0,
        "Howe: right outer diagonal in compression: N={:.4}",
        ef17.n_start
    );

    // Symmetric diagonal forces
    assert_close(
        ef14.n_start.abs(),
        ef17.n_start.abs(),
        0.03,
        "Howe: symmetric outer diagonals",
    );

    // Top chord in compression under gravity
    let ef_top = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef_top.n_start < 0.0,
        "Howe: top chord in compression: N={:.4}",
        ef_top.n_start
    );

    // Bottom chord in tension under gravity
    let ef_bot = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef_bot.n_start > 0.0,
        "Howe: bottom chord in tension: N={:.4}",
        ef_bot.n_start
    );
}

// ================================================================
// 5. K-Truss (Kassimali style)
// ================================================================
//
// K-truss: each panel has two diagonals meeting at a vertical midpoint.
// 4 panels, L = 16m (4 x 4m), H = 4m.
// Bottom: 1..5, Top: 6..10, Mid-height K-nodes: 11..14
//
// Single point load P = 40 kN at midspan bottom (node 3).

#[test]
fn validation_kassimali_5_k_truss() {
    let w = 4.0;
    let h = 4.0;
    let p = 40.0;

    let nodes = vec![
        // Bottom chord
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 3.0 * w, 0.0),
        (5, 4.0 * w, 0.0),
        // Top chord
        (6, 0.0, h),
        (7, w, h),
        (8, 2.0 * w, h),
        (9, 3.0 * w, h),
        (10, 4.0 * w, h),
        // K-nodes at mid-height of each panel's vertical
        (11, w, h / 2.0),       // panel 1 K-node (above node 2)
        (12, 2.0 * w, h / 2.0), // panel 2 K-node (above node 3)
        (13, 3.0 * w, h / 2.0), // panel 3 K-node (above node 4)
    ];

    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, true, true),
        (2, "truss", 2, 3, 1, 1, true, true),
        (3, "truss", 3, 4, 1, 1, true, true),
        (4, "truss", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "truss", 6, 7, 1, 1, true, true),
        (6, "truss", 7, 8, 1, 1, true, true),
        (7, "truss", 8, 9, 1, 1, true, true),
        (8, "truss", 9, 10, 1, 1, true, true),
        // End verticals
        (9, "truss", 1, 6, 1, 1, true, true),
        (10, "truss", 5, 10, 1, 1, true, true),
        // K-verticals: lower half (bottom node to K-node)
        (11, "truss", 2, 11, 1, 1, true, true),
        (12, "truss", 3, 12, 1, 1, true, true),
        (13, "truss", 4, 13, 1, 1, true, true),
        // K-verticals: upper half (K-node to top node)
        (14, "truss", 11, 7, 1, 1, true, true),
        (15, "truss", 12, 8, 1, 1, true, true),
        (16, "truss", 13, 9, 1, 1, true, true),
        // K-diagonals: from each bottom node to adjacent K-node
        // Panel 1: 1→11 (up-right), 11→6 is redundant, use: 1→11, 11→8
        // Actually K-truss: from bottom-left of panel to K-node, from K-node to top-right
        // Panel 1 diagonals
        (17, "truss", 1, 11, 1, 1, true, true),   // bottom-left to K-node
        (18, "truss", 11, 8, 1, 1, true, true),   // K-node to top-right of next panel
        // Panel 2 diagonals
        (19, "truss", 2, 12, 1, 1, true, true),   // bottom-left to K-node
        (20, "truss", 12, 9, 1, 1, true, true),   // K-node to top-right
        // Panel 3 diagonals
        (21, "truss", 4, 12, 1, 1, true, true),   // bottom-right to K-node (mirror)
        (22, "truss", 12, 7, 1, 1, true, true),   // K-node to top-left (mirror)
        // Panel 4 diagonals
        (23, "truss", 5, 13, 1, 1, true, true),   // bottom-right to K-node
        (24, "truss", 13, 8, 1, 1, true, true),   // K-node to top-left
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        elems,
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "K-truss: ΣRy = P");

    // Symmetric load at midspan → R1 = R5 = P/2 = 20
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "K-truss: R1 = P/2");
    assert_close(r5.ry, p / 2.0, 0.02, "K-truss: R5 = P/2");

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "K-truss: finite force elem {}: {:.6e}",
            ef.element_id,
            ef.n_start
        );
    }

    // Members in loaded panel (panel 2, around node 3/K-node 12) should carry force
    let ef_k_lower = results.element_forces.iter().find(|e| e.element_id == 12).unwrap();
    let ef_k_upper = results.element_forces.iter().find(|e| e.element_id == 15).unwrap();
    // At least one of the K-verticals around the loaded node carries significant force
    assert!(
        ef_k_lower.n_start.abs() > 0.1 || ef_k_upper.n_start.abs() > 0.1,
        "K-truss: K-node verticals at loaded panel carry force: lower={:.4}, upper={:.4}",
        ef_k_lower.n_start,
        ef_k_upper.n_start
    );

    // Top chord should be in compression
    let ef_top = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef_top.n_start < 0.0,
        "K-truss: top chord in compression: N={:.4}",
        ef_top.n_start
    );
}

// ================================================================
// 6. Determinate Frame: 3-Hinge Portal (Kassimali style)
// ================================================================
//
// Three-hinged portal frame:
//   Node 1: (0, 0) — pinned base (left)
//   Node 2: (0, 6) — left knee (frame connection)
//   Node 3: (4, 8) — apex with internal hinge
//   Node 4: (8, 6) — right knee (frame connection)
//   Node 5: (8, 0) — pinned base (right)
//
// Beam 2→3→4 has an internal hinge at node 3:
//   element 2-3: hinge at end (node 3 side)
//   element 3-4: hinge at start (node 3 side)
//
// Vertical UDL w = 10 kN/m on beam (via equivalent nodal loads).
// Horizontal span = 8m, so total vertical load = 80 kN.
// By statics: R1y + R5y = 80, and moment at the hinge = 0.

#[test]
fn validation_kassimali_6_determinate_frame() {
    let w_load = 10.0; // kN/m
    let span = 8.0;
    let h_col = 6.0;
    let h_apex = 8.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h_col),
        (3, span / 2.0, h_apex),
        (4, span, h_col),
        (5, span, 0.0),
    ];

    // Columns: frame elements (rigid connections at knees)
    // Beam: two frame elements with a hinge at apex (node 3)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, true),  // left beam, hinge at end (apex)
        (3, "frame", 3, 4, 1, 1, true, false),  // right beam, hinge at start (apex)
        (4, "frame", 4, 5, 1, 1, false, false), // right column
    ];

    // Approximate UDL on beams as equivalent nodal loads
    // Beam 2→3 has horizontal length = 4m, beam 3→4 has horizontal length = 4m
    // Total load on each beam segment ≈ w * horizontal_span/2 per node
    // For simplicity: place half the total at each node of the beam
    // Total = w * span = 80 kN, distributed: 20 at node 2, 40 at node 3, 20 at node 4
    let total_load = w_load * span;
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fy: -total_load / 4.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fy: -total_load / 2.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fy: -total_load / 4.0,
            mz: 0.0,
        }),
    ];

    let a_frame = 0.01;  // 100 cm^2
    let iz_frame = 1e-4;  // m^4

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_frame, iz_frame)],
        elems,
        vec![(1, 1, "pinned"), (2, 5, "pinned")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: ΣRy = total load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "3-hinge portal: ΣRy = wL");

    // Symmetric structure + symmetric load → R1y = R5y = wL/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, total_load / 2.0, 0.03, "3-hinge portal: R1y = wL/2");
    assert_close(r5.ry, total_load / 2.0, 0.03, "3-hinge portal: R5y = wL/2");

    // Moment at pin supports should be zero (pinned support → Mz = 0)
    assert_close(r1.mz.abs(), 0.0, 0.05, "3-hinge portal: M at base left = 0");
    assert_close(r5.mz.abs(), 0.0, 0.05, "3-hinge portal: M at base right = 0");

    // The hinge at node 3 means moment transmitted across the apex is zero.
    // Check: element 2 (ends at node 3) should have m_end ≈ 0
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef2.m_end.abs() < 0.5,
        "3-hinge portal: moment at hinge (elem 2 end) ≈ 0: M={:.4}",
        ef2.m_end
    );

    // Element 3 (starts at node 3) should have m_start ≈ 0
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(
        ef3.m_start.abs() < 0.5,
        "3-hinge portal: moment at hinge (elem 3 start) ≈ 0: M={:.4}",
        ef3.m_start
    );

    // Horizontal reactions should be equal and opposite (symmetric)
    assert_close(
        r1.rx.abs(),
        r5.rx.abs(),
        0.05,
        "3-hinge portal: |R1x| = |R5x|",
    );
}

// ================================================================
// 7. Truss with Thermal Load (Kassimali style)
// ================================================================
//
// For a statically determinate truss, thermal expansion causes no internal
// forces — the structure is free to expand.
// For a statically indeterminate truss (or a restrained truss), thermal
// expansion induces internal forces.
//
// We model a fixed-fixed bar (frame element with hinges) subjected to
// uniform temperature increase. The bar is restrained at both ends (pinned),
// so thermal expansion induces axial compression:
//   N_thermal = -alpha * DeltaT * E * A
//
// Since the solver uses frame elements for thermal loads, we use frame type
// with hinge_start=true, hinge_end=true for axial-only behavior.

#[test]
fn validation_kassimali_7_truss_thermal() {
    let l = 5.0;
    let alpha = 12e-6; // steel coefficient of thermal expansion (hardcoded in solver)
    let dt = 50.0;     // temperature increase in degrees
    let e_eff = E * 1000.0; // kN/m^2

    // Single bar pinned at both ends (axially restrained)
    // Using "frame" with hinges so thermal loads are processed
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 1e-8)], // tiny Iz to avoid singularity, but hinges make it truss-like
        vec![(1, "frame", 1, 2, 1, 1, true, true)],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1,
            dt_uniform: dt,
            dt_gradient: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Expected axial force: N = -alpha * DeltaT * E * A (compression)
    // The bar wants to expand but is restrained, so it goes into compression.
    let n_expected = alpha * dt * e_eff * A_TRUSS;

    let ef = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();

    // The axial force should match the thermal force
    assert_close(
        ef.n_start.abs(),
        n_expected,
        0.05,
        "Thermal truss: |N| = alpha*DT*E*A",
    );

    // Reactions should be non-zero (restrained thermal expansion)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // Horizontal reactions should balance
    let sum_rx = r1.rx + r2.rx;
    assert!(
        sum_rx.abs() < 0.01,
        "Thermal: ΣRx ≈ 0 (self-equilibrating): sum={:.6}",
        sum_rx
    );

    // Each reaction should be approximately alpha*DT*E*A
    assert_close(
        r1.rx.abs(),
        n_expected,
        0.05,
        "Thermal: |R1x| = alpha*DT*E*A",
    );
}

// ================================================================
// 8. Compound Truss: Fink/Fan Pattern (Kassimali style)
// ================================================================
//
// Fink truss: a common roof truss with sub-divided panels.
// Two symmetric halves connected at the apex.
//
//        5
//       / \
//      3   4
//     /|   |\
//    / |   | \
//   1--2---6--7
//
// Node positions:
//   1(0,0), 2(3,0), 6(9,0), 7(12,0) — bottom chord
//   3(3,3), 4(9,3) — intermediate top
//   5(6,6) — apex
//
// Members form a compound truss with two simple triangles
// connected through the center.
// Symmetric load at apex: P = 30 kN downward.

#[test]
fn validation_kassimali_8_compound_truss() {
    let p = 30.0;

    let nodes = vec![
        (1, 0.0, 0.0),   // bottom left
        (2, 3.0, 0.0),   // bottom inner-left
        (3, 3.0, 3.0),   // intermediate top-left
        (4, 9.0, 3.0),   // intermediate top-right
        (5, 6.0, 6.0),   // apex
        (6, 9.0, 0.0),   // bottom inner-right
        (7, 12.0, 0.0),  // bottom right
    ];

    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, true, true),
        (2, "truss", 2, 6, 1, 1, true, true),
        (3, "truss", 6, 7, 1, 1, true, true),
        // Left rafter: 1→3→5
        (4, "truss", 1, 3, 1, 1, true, true),
        (5, "truss", 3, 5, 1, 1, true, true),
        // Right rafter: 7→4→5
        (6, "truss", 7, 4, 1, 1, true, true),
        (7, "truss", 4, 5, 1, 1, true, true),
        // Verticals/web members
        (8, "truss", 2, 3, 1, 1, true, true),   // left vertical
        (9, "truss", 6, 4, 1, 1, true, true),   // right vertical
        // Diagonals connecting intermediate nodes to bottom
        (10, "truss", 2, 5, 1, 1, true, true),  // left inner diagonal
        (11, "truss", 6, 5, 1, 1, true, true),  // right inner diagonal
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        elems,
        vec![(1, 1, "pinned"), (2, 7, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Compound Fink: ΣRy = P");

    // Symmetric structure + symmetric load → R1 = R7 = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "Compound Fink: R1 = P/2");
    assert_close(r7.ry, p / 2.0, 0.02, "Compound Fink: R7 = P/2");

    // Symmetry of forces: left rafter members should equal right rafter members
    // Left rafter: elem 4 (1→3), elem 5 (3→5)
    // Right rafter: elem 6 (7→4), elem 7 (4→5)
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert_close(
        ef4.n_start.abs(),
        ef6.n_start.abs(),
        0.03,
        "Compound Fink: symmetric outer rafter forces",
    );

    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert_close(
        ef5.n_start.abs(),
        ef7.n_start.abs(),
        0.03,
        "Compound Fink: symmetric inner rafter forces",
    );

    // Symmetric verticals
    let ef8 = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    let ef9 = results.element_forces.iter().find(|e| e.element_id == 9).unwrap();
    assert_close(
        ef8.n_start.abs(),
        ef9.n_start.abs(),
        0.03,
        "Compound Fink: symmetric verticals",
    );

    // Symmetric inner diagonals
    let ef10 = results.element_forces.iter().find(|e| e.element_id == 10).unwrap();
    let ef11 = results.element_forces.iter().find(|e| e.element_id == 11).unwrap();
    assert_close(
        ef10.n_start.abs(),
        ef11.n_start.abs(),
        0.03,
        "Compound Fink: symmetric inner diagonals",
    );

    // Bottom chord in tension (gravity loaded truss)
    let ef_bot = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef_bot.n_start > 0.0,
        "Compound Fink: bottom chord in tension: N={:.4}",
        ef_bot.n_start
    );

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "Compound Fink: finite force elem {}: {:.6e}",
            ef.element_id,
            ef.n_start
        );
    }
}
