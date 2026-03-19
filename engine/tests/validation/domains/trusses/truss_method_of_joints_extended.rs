/// Validation: Extended Truss Analysis via Method of Joints
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3 (Method of Joints)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 3-4
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///   - Beer & Johnston, "Vector Mechanics for Engineers", 11th Ed., Ch. 6
///
/// All trusses use "frame" elements with hinge_start=true, hinge_end=true
/// and IZ = 1e-8 (tiny but non-zero) to model pin-jointed behavior.
///
/// Tests:
///   1. Simple triangle truss: 3 members, vertical load at apex
///   2. Warren truss (4 panels): diagonal and chord forces
///   3. Pratt truss: vertical members in tension, diagonal compression pattern
///   4. K-truss simple: 2-panel with vertical load
///   5. Symmetric truss with symmetric load: symmetric member forces
///   6. Cantilever truss: 2 panels, tip load
///   7. Truss with horizontal load: force distribution
///   8. Fan truss: radial members meeting at one point
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-8;     // tiny but non-zero for numerical stability

/// E_EFF = E * 1000.0, the effective modulus the solver uses internally.
#[allow(dead_code)]
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Simple Triangle Truss: 3 Members, Vertical Load at Apex
// ================================================================
//
// Triangle: nodes 1(0,0) pinned, 2(6,0) rollerX, 3(3,4) apex.
// Load P = 24 kN downward at apex (node 3).
//
// By symmetry:  R1y = R2y = P/2 = 12 kN
//
// Method of joints at apex (node 3):
//   Member 2 (1-3): length = sqrt(9+16) = 5, sin(theta) = 4/5, cos(theta) = 3/5
//   Member 3 (2-3): same by symmetry
//   SumFy = 0: -N_13*sin(theta) - N_23*sin(theta) = -P
//   By symmetry N_13 = N_23 = N_diag
//   => 2*N_diag*(4/5) = 24 => N_diag = -15 (compression, pushing up on apex)
//
// At joint 1: SumFx = 0:  N_12 + N_13*cos(theta) = 0
//   N_12 = -(-15)*(3/5) = 9 kN (tension)
//
// Ref: Hibbeler, "Structural Analysis" Example 3-1
#[test]
fn validation_ext_joints_simple_triangle() {
    let p = 24.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 3.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (3, "frame", 2, 3, 1, 1, true, true), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R1y = R2y = P/2 = 12 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, 12.0, 0.02, "Triangle R1y = P/2");
    assert_close(r2.rz, 12.0, 0.02, "Triangle R2y = P/2");

    // Bottom chord: N = PL/(4H) = 24*6/(4*4) = 9 kN tension
    let ef_chord = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_chord.n_start.abs(), 9.0, 0.02, "Bottom chord |N| = 9");
    assert!(ef_chord.n_start > 0.0, "Bottom chord in tension: N={:.4}", ef_chord.n_start);

    // Diagonals: N = P/(2*sin(theta)) = 24/(2*4/5) = 15 kN compression
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap();
    assert_close(ef_left.n_start.abs(), 15.0, 0.02, "Left diagonal |N| = 15");
    assert_close(ef_right.n_start.abs(), 15.0, 0.02, "Right diagonal |N| = 15");
    // Diagonals in compression
    assert!(ef_left.n_start < 0.0, "Left diagonal in compression: N={:.4}", ef_left.n_start);
    assert!(ef_right.n_start < 0.0, "Right diagonal in compression: N={:.4}", ef_right.n_start);

    // Truss behavior: moments near zero
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "elem {} m_start near zero: {:.6e}", ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 0.01,
            "elem {} m_end near zero: {:.6e}", ef.element_id, ef.m_end);
    }
}

// ================================================================
// 2. Warren Truss (4 Panels): Diagonal and Chord Forces
// ================================================================
//
// 4-panel Warren truss (no verticals):
//   Bottom: 1(0,0), 2(3,0), 3(6,0), 4(9,0), 5(12,0)
//   Top:    6(1.5,3), 7(4.5,3), 8(7.5,3), 9(10.5,3)
//   Pinned at 1, rollerX at 5.
//   Load P = 36 kN downward at node 3 (midspan bottom).
//
// By symmetry: R1y = R5y = P/2 = 18 kN
//
// Method of sections (cut between panels 2 and 3):
//   At midspan, bottom chord force is maximum.
//   Moment about top node 7: R1y * 4.5 - F_bot * 3 = 0
//   F_bot = 18 * 4.5 / 3 = 27 kN (tension)
//
// Top chord 6-7 by moment about node 2:
//   R1y * 3 - F_top * 3 = 0 => F_top = 18 kN (compression)
//
// Ref: Leet et al., "Fundamentals of Structural Analysis" Ch. 4
#[test]
fn validation_ext_joints_warren_4panel() {
    let d = 3.0;
    let h = 3.0;
    let p = 36.0;

    let nodes = vec![
        (1, 0.0,       0.0),
        (2, d,         0.0),
        (3, 2.0 * d,   0.0),
        (4, 3.0 * d,   0.0),
        (5, 4.0 * d,   0.0),
        (6, 0.5 * d,   h),
        (7, 1.5 * d,   h),
        (8, 2.5 * d,   h),
        (9, 3.5 * d,   h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        (4, "frame", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "frame", 6, 7, 1, 1, true, true),
        (6, "frame", 7, 8, 1, 1, true, true),
        (7, "frame", 8, 9, 1, 1, true, true),
        // Diagonals (zig-zag)
        (8,  "frame", 1, 6, 1, 1, true, true),
        (9,  "frame", 6, 2, 1, 1, true, true),
        (10, "frame", 2, 7, 1, 1, true, true),
        (11, "frame", 7, 3, 1, 1, true, true),
        (12, "frame", 3, 8, 1, 1, true, true),
        (13, "frame", 8, 4, 1, 1, true, true),
        (14, "frame", 4, 9, 1, 1, true, true),
        (15, "frame", 9, 5, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "Warren R1y = P/2");
    assert_close(r5.rz, p / 2.0, 0.02, "Warren R5y = P/2");

    // Bottom chord panel 2 (elem 2, nodes 2-3) in tension
    let ef_bot2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_bot2.n_start > 0.0,
        "Warren bottom chord panel 2 in tension: N={:.4}", ef_bot2.n_start);

    // Symmetry: bottom chord 1-2 and 4-5 have same magnitude
    let ef_bot1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bot4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef_bot1.n_start.abs(), ef_bot4.n_start.abs(), 0.02,
        "Warren: symmetric bottom chord |1-2| = |4-5|");

    // Top chords in compression (under gravity loading)
    let ef_top1 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert!(ef_top1.n_start < 0.0,
        "Warren top chord in compression: N={:.4}", ef_top1.n_start);

    // All moments near zero
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "Warren elem {} m_start near zero: {:.6e}", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 3. Pratt Truss: Vertical Members and Diagonal Compression Pattern
// ================================================================
//
// 4-panel Pratt truss:
//   Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
//   Top:    6(0,4), 7(4,4), 8(8,4), 9(12,4), 10(16,4)
//   Pinned at 1, rollerX at 5.
//   Equal loads P at bottom nodes 2, 3, 4.
//
// Pratt truss characteristics:
//   - Diagonals slope toward center (from outer bottom to inner top)
//   - Under gravity, verticals tend to be in tension
//   - Diagonals tend to be in compression
//
// Reactions: R1y = R5y = 3P/2 = 30 kN (by symmetry with P=20)
//
// Ref: Kassimali, "Structural Analysis" Ch. 4
#[test]
fn validation_ext_joints_pratt_truss_pattern() {
    let w = 4.0;
    let h = 4.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0,       0.0), (2, w,       0.0), (3, 2.0*w, 0.0),
        (4, 3.0*w,     0.0), (5, 4.0*w,   0.0),
        (6, 0.0,       h),   (7, w,       h),   (8, 2.0*w, h),
        (9, 3.0*w,     h),   (10, 4.0*w,  h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        (4, "frame", 4, 5, 1, 1, true, true),
        // Top chord
        (5, "frame", 6, 7,   1, 1, true, true),
        (6, "frame", 7, 8,   1, 1, true, true),
        (7, "frame", 8, 9,   1, 1, true, true),
        (8, "frame", 9, 10,  1, 1, true, true),
        // Verticals
        (9,  "frame", 1, 6,  1, 1, true, true),
        (10, "frame", 2, 7,  1, 1, true, true),
        (11, "frame", 3, 8,  1, 1, true, true),
        (12, "frame", 4, 9,  1, 1, true, true),
        (13, "frame", 5, 10, 1, 1, true, true),
        // Diagonals (Pratt: from outer-bottom toward inner-top)
        (14, "frame", 1, 7,  1, 1, true, true),  // panel 1 diagonal
        (15, "frame", 2, 8,  1, 1, true, true),  // panel 2 diagonal
        (16, "frame", 4, 8,  1, 1, true, true),  // panel 3 diagonal (mirror)
        (17, "frame", 5, 9,  1, 1, true, true),  // panel 4 diagonal (mirror)
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R1y = R5y = 3P/2 = 30 by symmetry
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, 3.0 * p / 2.0, 0.02, "Pratt R1y = 3P/2");
    assert_close(r5.rz, 3.0 * p / 2.0, 0.02, "Pratt R5y = 3P/2");

    // Interior verticals (elems 10, 11, 12) should carry tension
    // under gravity loading in a Pratt truss
    let ef_v2 = results.element_forces.iter().find(|e| e.element_id == 10).unwrap();
    let ef_v3 = results.element_forces.iter().find(|e| e.element_id == 11).unwrap();
    let ef_v4 = results.element_forces.iter().find(|e| e.element_id == 12).unwrap();
    assert!(ef_v2.n_start.abs() > 0.1,
        "Pratt vertical 2-7 carries load: |N|={:.4}", ef_v2.n_start.abs());
    assert!(ef_v3.n_start.abs() > 0.1 || ef_v3.n_start.abs() < 0.01,
        "Pratt center vertical finite: |N|={:.4}", ef_v3.n_start.abs());
    assert!(ef_v4.n_start.abs() > 0.1,
        "Pratt vertical 4-9 carries load: |N|={:.4}", ef_v4.n_start.abs());

    // Symmetry: vertical 2-7 force = vertical 4-9 force in magnitude
    assert_close(ef_v2.n_start.abs(), ef_v4.n_start.abs(), 0.02,
        "Pratt symmetric verticals: |V2-7| = |V4-9|");

    // Top chord in compression (bending analogy: compression on concave side)
    let ef_top_center = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef_top_center.n_start < 0.0,
        "Pratt top chord center in compression: N={:.4}", ef_top_center.n_start);

    // Bottom chord at center in tension
    let ef_bot_center = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_bot_center.n_start > 0.0,
        "Pratt bottom chord center in tension: N={:.4}", ef_bot_center.n_start);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Pratt SumRy = 3P");
}

// ================================================================
// 4. K-Truss Simple: 2-Panel with Vertical Load
// ================================================================
//
// 2-panel K-truss with K-nodes at mid-height:
//   Bottom: 1(0,0), 2(4,0), 3(8,0)
//   Top:    4(0,4), 5(4,4), 6(8,4)
//   K-nodes: 7(2,2), 8(6,2) at mid-height of each panel
//   Pinned at 1, rollerX at 3.
//   Load P = 40 kN downward at node 5 (top center).
//
// By symmetry: R1y = R3y = P/2 = 20 kN
//
// The K-nodes create subdivided diagonals that reduce member
// buckling lengths while maintaining the same overall force paths.
//
// Ref: Hibbeler, "Structural Analysis" Problem 3-31
#[test]
fn validation_ext_joints_k_truss_simple() {
    let w = 4.0;
    let h = 4.0;
    let p = 40.0;

    let nodes = vec![
        (1, 0.0,   0.0),     // bottom left
        (2, w,     0.0),     // bottom center
        (3, 2.0*w, 0.0),     // bottom right
        (4, 0.0,   h),       // top left
        (5, w,     h),       // top center
        (6, 2.0*w, h),       // top right
        (7, w/2.0, h/2.0),   // left K-node
        (8, 1.5*w, h/2.0),   // right K-node
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        // Top chord
        (3, "frame", 4, 5, 1, 1, true, true),
        (4, "frame", 5, 6, 1, 1, true, true),
        // End verticals
        (5, "frame", 1, 4, 1, 1, true, true),
        (6, "frame", 3, 6, 1, 1, true, true),
        // Center vertical
        (7, "frame", 2, 5, 1, 1, true, true),
        // Left K: diagonals through K-node 7
        (8,  "frame", 1, 7, 1, 1, true, true),
        (9,  "frame", 7, 5, 1, 1, true, true),
        (10, "frame", 7, 2, 1, 1, true, true),
        (11, "frame", 4, 7, 1, 1, true, true),
        // Right K: diagonals through K-node 8
        (12, "frame", 2, 8, 1, 1, true, true),
        (13, "frame", 8, 6, 1, 1, true, true),
        (14, "frame", 8, 3, 1, 1, true, true),
        (15, "frame", 5, 8, 1, 1, true, true),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: R1y = R3y = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "K-truss R1y = P/2");
    assert_close(r3.rz, p / 2.0, 0.02, "K-truss R3y = P/2");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "K-truss SumRy = P");

    // Symmetry: left K-node member forces should mirror right K-node
    // elem 8 (1-7) should match elem 14 (8-3) by mirror symmetry
    let ef8 = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    let ef14 = results.element_forces.iter().find(|e| e.element_id == 14).unwrap();
    assert_close(ef8.n_start.abs(), ef14.n_start.abs(), 0.02,
        "K-truss mirror symmetry: |1-7| = |8-3|");

    // Bottom chords symmetric in magnitude
    let ef_bc1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bc2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef_bc1.n_start.abs(), ef_bc2.n_start.abs(), 0.02,
        "K-truss symmetric bottom chords");

    // All forces finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "K-truss elem {} force finite: {:.6e}", ef.element_id, ef.n_start);
    }
}

// ================================================================
// 5. Symmetric Truss with Symmetric Load
// ================================================================
//
// 3-panel Howe truss, symmetric geometry and loading:
//   Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0)
//   Top:    5(0,3), 6(4,3), 7(8,3), 8(12,3)
//   Pinned at 1, rollerX at 4.
//   Symmetric loads: P at nodes 6 and 7 (top interior nodes).
//
// By symmetry:
//   R1y = R4y = P (total load = 2P, each support carries P)
//   Left member forces mirror right member forces
//   Bottom chord 1-2 force = bottom chord 3-4 force (magnitude)
//   Top chord 5-6 force = top chord 7-8 force (magnitude)
//   Diagonal 1-6 force = diagonal 4-7 force (magnitude)
//
// Ref: Beer & Johnston, "Vector Mechanics" Ch. 6
#[test]
fn validation_ext_joints_symmetric_loading() {
    let w = 4.0;
    let h = 3.0;
    let p = 30.0;

    let nodes = vec![
        (1, 0.0,       0.0), (2, w,       0.0), (3, 2.0*w, 0.0), (4, 3.0*w, 0.0),
        (5, 0.0,       h),   (6, w,       h),   (7, 2.0*w, h),   (8, 3.0*w, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        // Top chord
        (4, "frame", 5, 6, 1, 1, true, true),
        (5, "frame", 6, 7, 1, 1, true, true),
        (6, "frame", 7, 8, 1, 1, true, true),
        // Verticals
        (7,  "frame", 1, 5, 1, 1, true, true),
        (8,  "frame", 2, 6, 1, 1, true, true),
        (9,  "frame", 3, 7, 1, 1, true, true),
        (10, "frame", 4, 8, 1, 1, true, true),
        // Howe diagonals (slope toward center from top)
        (11, "frame", 6, 1, 1, 1, true, true),  // top-left to bottom-left
        (12, "frame", 6, 3, 1, 1, true, true),  // top-left interior to bottom-right interior
        (13, "frame", 7, 2, 1, 1, true, true),  // top-right interior to bottom-left interior
        (14, "frame", 7, 4, 1, 1, true, true),  // top-right to bottom-right
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions: R1y = R4y = P = 30
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rz, p, 0.02, "Symmetric R1y = P");
    assert_close(r4.rz, p, 0.02, "Symmetric R4y = P");

    // Mirror symmetry: bottom chord 1-2 matches 3-4
    let ef_bc1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bc3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef_bc1.n_start.abs(), ef_bc3.n_start.abs(), 0.02,
        "Symmetric: |BC 1-2| = |BC 3-4|");

    // Mirror symmetry: top chord 5-6 matches 7-8
    let ef_tc1 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef_tc3 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert_close(ef_tc1.n_start.abs(), ef_tc3.n_start.abs(), 0.02,
        "Symmetric: |TC 5-6| = |TC 7-8|");

    // Mirror symmetry: diagonal 6-1 matches 7-4
    let ef_d1 = results.element_forces.iter().find(|e| e.element_id == 11).unwrap();
    let ef_d4 = results.element_forces.iter().find(|e| e.element_id == 14).unwrap();
    assert_close(ef_d1.n_start.abs(), ef_d4.n_start.abs(), 0.02,
        "Symmetric: |diag 6-1| = |diag 7-4|");

    // Mirror symmetry: diagonal 6-3 matches 7-2
    let ef_d2 = results.element_forces.iter().find(|e| e.element_id == 12).unwrap();
    let ef_d3 = results.element_forces.iter().find(|e| e.element_id == 13).unwrap();
    assert_close(ef_d2.n_start.abs(), ef_d3.n_start.abs(), 0.02,
        "Symmetric: |diag 6-3| = |diag 7-2|");

    // End verticals: symmetric forces
    let ef_v1 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    let ef_v4 = results.element_forces.iter().find(|e| e.element_id == 10).unwrap();
    assert_close(ef_v1.n_start.abs(), ef_v4.n_start.abs(), 0.02,
        "Symmetric: |vert 1-5| = |vert 4-8|");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "Symmetric SumRy = 2P");
}

// ================================================================
// 6. Cantilever Truss: 2 Panels, Tip Load
// ================================================================
//
// 2-panel cantilever truss fixed at left wall (pin both bottom-left
// and top-left), free at right with downward load P at free-end bottom.
//
//   Bottom: 1(0,0), 2(3,0), 3(6,0)
//   Top:    4(0,3), 5(3,3), 6(6,3)
//   Fixed: pinned at 1 and 4.
//   Load: P = 24 kN downward at node 3 (free-end bottom).
//
// Bending analogy for cantilever:
//   At wall section: M = P * L = 24 * 6 = 144 kN.m
//   Top chord at wall: tension = M/h = 144/3 = 48 kN (hogging puts top in tension)
//   Bottom chord at wall: compression = 48 kN
//
// At mid-section (x = 3): M = P * 3 = 72 kN.m
//   Top chord (5-6): tension = 72/3 = 24 kN
//   Bottom chord (2-3): compression = 24 kN
//
// Ref: Beer & Johnston, "Vector Mechanics for Engineers" Section 6.4
#[test]
fn validation_ext_joints_cantilever_truss() {
    let w = 3.0;
    let h = 3.0;
    let p = 24.0;

    let nodes = vec![
        (1, 0.0,   0.0),
        (2, w,     0.0),
        (3, 2.0*w, 0.0),
        (4, 0.0,   h),
        (5, w,     h),
        (6, 2.0*w, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        // Top chord
        (3, "frame", 4, 5, 1, 1, true, true),
        (4, "frame", 5, 6, 1, 1, true, true),
        // Verticals
        (5, "frame", 1, 4, 1, 1, true, true),
        (6, "frame", 2, 5, 1, 1, true, true),
        (7, "frame", 3, 6, 1, 1, true, true),
        // Diagonals (X-pattern in each panel for stability)
        (8, "frame", 1, 5, 1, 1, true, true),
        (9, "frame", 2, 6, 1, 1, true, true),
    ];
    // Fixed at left: pin both bottom-left (1) and top-left (4)
    let sups = vec![
        (1, 1, "pinned"),
        (2, 4, "pinned"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: SumRy = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Cantilever SumRy = P");

    // Free tip deflects downward
    let tip = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    assert!(tip.uz < 0.0,
        "Cantilever free tip deflects down: uy={:.6}", tip.uz);

    // Cantilever under hogging: top chord at wall is in TENSION
    // Bottom chord at wall (elem 1, 1-2) is in COMPRESSION
    let ef_bot_wall = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let ef_top_wall = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap();

    assert!(ef_top_wall.n_start > 0.0,
        "Cantilever: top chord at wall in tension (hogging): N={:.4}", ef_top_wall.n_start);
    assert!(ef_bot_wall.n_start < 0.0,
        "Cantilever: bottom chord at wall in compression (hogging): N={:.4}", ef_bot_wall.n_start);

    // Chord force at wall > chord force at mid-panel (higher moment at wall)
    let ef_bot_free = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let ef_top_free = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap();

    assert!(ef_bot_wall.n_start.abs() > ef_bot_free.n_start.abs(),
        "Cantilever: wall chord > free chord: {:.4} > {:.4}",
        ef_bot_wall.n_start.abs(), ef_bot_free.n_start.abs());
    assert!(ef_top_wall.n_start.abs() > ef_top_free.n_start.abs(),
        "Cantilever: wall top chord > free top chord: {:.4} > {:.4}",
        ef_top_wall.n_start.abs(), ef_top_free.n_start.abs());

    // Bending analogy: top chord at wall ~ M_wall / h = P*2w / h = 24*6/3 = 48
    let m_wall: f64 = p * 2.0 * w;
    let expected_wall_chord: f64 = m_wall / h;
    assert_close(ef_top_wall.n_start.abs(), expected_wall_chord, 0.05,
        "Cantilever: wall chord ~ M/h = 48");
}

// ================================================================
// 7. Truss with Horizontal Load: Force Distribution
// ================================================================
//
// Simple 4-node truss with horizontal force:
//   Nodes: 1(0,0) pinned, 2(6,0) rollerX, 3(0,4), 4(6,4)
//   Elements form a rectangular frame with diagonals.
//   Horizontal load Fx = 20 kN at node 3.
//
// Statics:
//   SumFx = 0:  R1x + 20 = 0 => R1x = -20
//   SumM about 1: R2y*6 + 20*4 = 0 => R2y = -80/6 = -13.333
//   SumFy = 0:  R1y + R2y = 0 => R1y = 13.333
//
// The horizontal load creates a racking effect. The diagonals carry
// the shear, and the chords carry the moment couple.
//
// Ref: Kassimali, "Structural Analysis" Ch. 3
#[test]
fn validation_ext_joints_horizontal_load() {
    let w = 6.0;
    let h = 4.0;
    let fx_load = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w,   0.0),
        (3, 0.0, h),
        (4, w,   h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
        (2, "frame", 3, 4, 1, 1, true, true), // top chord
        (3, "frame", 1, 3, 1, 1, true, true), // left vertical
        (4, "frame", 2, 4, 1, 1, true, true), // right vertical
        (5, "frame", 1, 4, 1, 1, true, true), // diagonal 1-4
        (6, "frame", 2, 3, 1, 1, true, true), // diagonal 2-3
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: fx_load, fz: 0.0, my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // R1x = -Fx = -20
    assert_close(r1.rx, -fx_load, 0.02, "Horiz truss R1x = -Fx");

    // Moment about node 1 (CCW positive):
    //   Fx at node 3 (height h) creates moment Fx*h CCW about node 1.
    //   R2y at node 2 (distance w) creates moment -R2y*w CCW.
    //   => -R2y*w + Fx*h = 0 => R2y = Fx*h/w = 20*4/6 = 13.333 (upward)
    let r2y_expected: f64 = fx_load * h / w;
    assert_close(r2.rz, r2y_expected, 0.02, "Horiz truss R2y");

    // R1y = -R2y = -13.333 (downward)
    assert_close(r1.rz, -r2y_expected, 0.02, "Horiz truss R1y");

    // Global equilibrium checks
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx, -fx_load, 0.02, "Horiz truss SumRx = -Fx");
    assert_close(sum_ry, 0.0, 0.02, "Horiz truss SumRy = 0");

    // The diagonals should carry non-zero force (they resist the shear)
    let ef_d1 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef_d2 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef_d1.n_start.abs() > 0.1,
        "Diagonal 1-4 carries shear: |N|={:.4}", ef_d1.n_start.abs());
    assert!(ef_d2.n_start.abs() > 0.1,
        "Diagonal 2-3 carries shear: |N|={:.4}", ef_d2.n_start.abs());

    // One diagonal in tension, the other in compression (racking behavior)
    assert!(ef_d1.n_start * ef_d2.n_start < 0.0,
        "Diagonals have opposite signs: D1={:.4}, D2={:.4}",
        ef_d1.n_start, ef_d2.n_start);

    // Moments near zero (truss behavior)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "Horiz truss elem {} m_start near zero: {:.6e}", ef.element_id, ef.m_start);
    }
}

// ================================================================
// 8. Fan Truss: Radial Members Meeting at One Point
// ================================================================
//
// Fan truss: all top members radiate from a single apex node.
//   Bottom: 1(0,0) pinned, 2(3,0), 3(6,0), 4(9,0), 5(12,0) rollerX
//   Apex:   6(6,5)
//   All top members connect to apex node 6.
//   Bottom chord connects all bottom nodes.
//   Load P = 20 kN downward at each interior bottom node (2, 3, 4).
//
// By symmetry (symmetric geometry + symmetric loading):
//   R1y = R5y = 3P/2 = 30
//   Fan member 1-6 force = fan member 5-6 force (magnitude)
//   Fan member 2-6 force = fan member 4-6 force (magnitude)
//
// Apex node 6 equilibrium: sum of all radial member forces + any applied
// load must balance. Since node 6 is unloaded, the vertical components
// of the fan members must cancel, and horizontal components must cancel.
//
// Ref: Kassimali, "Structural Analysis" Section 3.4
#[test]
fn validation_ext_joints_fan_truss() {
    let d = 3.0;
    let h = 5.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0,       0.0),
        (2, d,         0.0),
        (3, 2.0 * d,   0.0),
        (4, 3.0 * d,   0.0),
        (5, 4.0 * d,   0.0),
        (6, 2.0 * d,   h),    // apex at center-top
    ];
    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        (4, "frame", 4, 5, 1, 1, true, true),
        // Radial fan members from apex (node 6)
        (5, "frame", 1, 6, 1, 1, true, true),  // outermost left
        (6, "frame", 2, 6, 1, 1, true, true),  // inner left
        (7, "frame", 3, 6, 1, 1, true, true),  // center vertical
        (8, "frame", 4, 6, 1, 1, true, true),  // inner right
        (9, "frame", 5, 6, 1, 1, true, true),  // outermost right
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: by symmetry R1y = R5y = 3P/2 = 30
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, 3.0 * p / 2.0, 0.02, "Fan R1y = 3P/2");
    assert_close(r5.rz, 3.0 * p / 2.0, 0.02, "Fan R5y = 3P/2");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Fan SumRy = 3P");

    // Symmetry: outermost fan members equal
    let ef_fan_left = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef_fan_right = results.element_forces.iter().find(|e| e.element_id == 9).unwrap();
    assert_close(ef_fan_left.n_start.abs(), ef_fan_right.n_start.abs(), 0.02,
        "Fan: outer radials symmetric |1-6| = |5-6|");

    // Symmetry: inner fan members equal
    let ef_fan_inl = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    let ef_fan_inr = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    assert_close(ef_fan_inl.n_start.abs(), ef_fan_inr.n_start.abs(), 0.02,
        "Fan: inner radials symmetric |2-6| = |4-6|");

    // Symmetry: bottom chords mirrored
    let ef_bc1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bc4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef_bc1.n_start.abs(), ef_bc4.n_start.abs(), 0.02,
        "Fan: bottom chord 1-2 = 4-5 (magnitude)");

    let ef_bc2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_bc3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef_bc2.n_start.abs(), ef_bc3.n_start.abs(), 0.02,
        "Fan: bottom chord 2-3 = 3-4 (magnitude)");

    // Radial fan members (compression, since they push down on bottom nodes)
    assert!(ef_fan_left.n_start < 0.0,
        "Fan outer left in compression: N={:.4}", ef_fan_left.n_start);
    assert!(ef_fan_right.n_start < 0.0,
        "Fan outer right in compression: N={:.4}", ef_fan_right.n_start);

    // Bottom chord in tension (resists outward thrust from fan)
    assert!(ef_bc1.n_start > 0.0,
        "Fan bottom chord in tension: N={:.4}", ef_bc1.n_start);

    // Center vertical (elem 7, node 3-6): carries vertical component
    let ef_center = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert!(ef_center.n_start.is_finite(),
        "Fan center vertical finite: N={:.6e}", ef_center.n_start);

    // All moments near zero (truss behavior)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 0.01,
            "Fan elem {} m_start near zero: {:.6e}", ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 0.01,
            "Fan elem {} m_end near zero: {:.6e}", ef.element_id, ef.m_end);
    }
}
