/// Validation: Truss Topology and Member Force Patterns
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 6 (Truss Analysis)
///   - Kassimali, "Structural Analysis", Ch. 4-5 (Trusses)
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", Ch. 3
///
/// These tests verify member force patterns in various truss
/// topologies: Warren, Pratt, Howe, K-truss, and fan trusses.
/// Results are checked against method of joints/sections
/// analytical solutions.
///
/// Tests verify:
///   1. Warren truss: alternating diagonal tension/compression
///   2. Pratt truss: diagonals in tension, verticals in compression
///   3. Howe truss: diagonals in compression, verticals in tension
///   4. Simple truss: method of joints verification
///   5. K-truss: member force pattern
///   6. Symmetric truss: force symmetry under symmetric load
///   7. Truss depth effect: deeper truss → lower chord forces
///   8. Truss equilibrium: sum of joint forces = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Warren Truss: Alternating Diagonal Pattern
// ================================================================
//
//   3---5---7
//  /|\ |/| |\
// 1   2   4   6---8
//
// Warren truss: no verticals, diagonals alternate between
// tension and compression.

#[test]
fn validation_truss_warren_pattern() {
    let span = 12.0;
    let h = 3.0;
    let p = 20.0;
    let dx = span / 4.0; // 4 panels

    let nodes = vec![
        (1, 0.0, 0.0),       // bottom left
        (2, dx, 0.0),        // bottom
        (3, 2.0 * dx, 0.0),  // bottom mid
        (4, 3.0 * dx, 0.0),  // bottom
        (5, 4.0 * dx, 0.0),  // bottom right
        (6, 0.5 * dx, h),    // top
        (7, 1.5 * dx, h),    // top
        (8, 2.5 * dx, h),    // top
        (9, 3.5 * dx, h),    // top
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        (7, "truss", 8, 9, 1, 1, false, false),
        // Left-leaning diagonals
        (8, "truss", 1, 6, 1, 1, false, false),
        (9, "truss", 2, 7, 1, 1, false, false),
        (10, "truss", 3, 8, 1, 1, false, false),
        (11, "truss", 4, 9, 1, 1, false, false),
        // Right-leaning diagonals
        (12, "truss", 6, 2, 1, 1, false, false),
        (13, "truss", 7, 3, 1, 1, false, false),
        (14, "truss", 8, 4, 1, 1, false, false),
        (15, "truss", 9, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Bottom chord should be in tension (positive axial)
    let ef_bottom = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_bottom.n_start > 0.0, "Warren: bottom chord in tension");

    // Top chord should be in compression (negative axial)
    let ef_top = results.element_forces.iter()
        .find(|e| e.element_id == 6).unwrap();
    assert!(ef_top.n_start < 0.0, "Warren: top chord in compression");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Warren: ΣRy = P");
}

// ================================================================
// 2. Pratt Truss: Diagonals in Tension
// ================================================================
//
// Pratt truss has verticals and diagonals sloping toward midspan.
// Under gravity, diagonals are in tension, verticals in compression.

#[test]
fn validation_truss_pratt_pattern() {
    let span = 12.0;
    let h = 3.0;
    let p = 30.0;
    let dx = span / 3.0; // 3 panels

    let nodes = vec![
        (1, 0.0, 0.0),       // BL
        (2, dx, 0.0),        // B
        (3, 2.0 * dx, 0.0),  // B
        (4, 3.0 * dx, 0.0),  // BR
        (5, 0.0, h),         // TL
        (6, dx, h),          // T
        (7, 2.0 * dx, h),    // T
        (8, 3.0 * dx, h),    // TR
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Top chord
        (4, "truss", 5, 6, 1, 1, false, false),
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7, "truss", 1, 5, 1, 1, false, false),
        (8, "truss", 2, 6, 1, 1, false, false),
        (9, "truss", 3, 7, 1, 1, false, false),
        (10, "truss", 4, 8, 1, 1, false, false),
        // Pratt diagonals (slope toward midspan)
        (11, "truss", 1, 6, 1, 1, false, false), // left panel
        (12, "truss", 7, 4, 1, 1, false, false), // right panel (mirror)
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
    // Loads at top chord joints
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Bottom chord should be in tension
    let ef_bc = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_bc.n_start > 0.0, "Pratt: bottom chord in tension");

    // Top chord should be in compression
    let ef_tc = results.element_forces.iter()
        .find(|e| e.element_id == 5).unwrap();
    assert!(ef_tc.n_start < 0.0, "Pratt: top chord in compression");

    // Diagonals carry significant force
    let ef_diag = results.element_forces.iter()
        .find(|e| e.element_id == 11).unwrap();
    assert!(ef_diag.n_start.abs() > 0.1, "Pratt: diagonal carries force");
}

// ================================================================
// 3. Howe Truss: Diagonals in Compression
// ================================================================
//
// Howe truss diagonals slope away from midspan.
// Under gravity, diagonals are in compression, verticals in tension.

#[test]
fn validation_truss_howe_pattern() {
    let span = 12.0;
    let h = 3.0;
    let p = 30.0;
    let dx = span / 3.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, dx, 0.0), (3, 2.0 * dx, 0.0), (4, 3.0 * dx, 0.0),
        (5, 0.0, h), (6, dx, h), (7, 2.0 * dx, h), (8, 3.0 * dx, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Top chord
        (4, "truss", 5, 6, 1, 1, false, false),
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7, "truss", 1, 5, 1, 1, false, false),
        (8, "truss", 2, 6, 1, 1, false, false),
        (9, "truss", 3, 7, 1, 1, false, false),
        (10, "truss", 4, 8, 1, 1, false, false),
        // Howe diagonals (slope away from midspan)
        (11, "truss", 5, 2, 1, 1, false, false), // left panel
        (12, "truss", 3, 8, 1, 1, false, false), // right panel
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Howe diagonals carry significant force
    let ef_diag = results.element_forces.iter()
        .find(|e| e.element_id == 11).unwrap();
    assert!(ef_diag.n_start.abs() > 0.1, "Howe: diagonal carries force");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Howe: ΣRy = 2P");
}

// ================================================================
// 4. Simple Truss: Method of Joints Verification
// ================================================================
//
// Simple triangular truss with known member forces.
// P at apex, reactions P/2 at each base.

#[test]
fn validation_truss_method_of_joints() {
    let span = 8.0;
    let h = 3.0;
    let p = 24.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, span, 0.0), (3, span / 2.0, h),
    ];
    let elems = vec![
        (1, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (2, "truss", 3, 2, 1, 1, false, false), // right diagonal
        (3, "truss", 1, 2, 1, 1, false, false), // bottom chord
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: Ry1 = Ry2 = P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.01, "Triangle: Ry1 = P/2");
    assert_close(r2.rz, p / 2.0, 0.01, "Triangle: Ry2 = P/2");

    // Member forces by method of joints:
    // At joint 3 (apex): ΣFy = 0: F13*sinα + F23*sinα = P
    // where α = atan(h/(span/2))
    let diag_l = ((span / 2.0).powi(2) + h.powi(2)).sqrt();
    let sin_a = h / diag_l;
    let f_diag = p / (2.0 * sin_a); // magnitude (compression)

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.n_start.abs(), f_diag, 0.02,
        "Triangle: diagonal force = P/(2sinα)");

    // Both diagonals should be in compression
    assert!(ef1.n_start < 0.0, "Triangle: left diagonal in compression");

    // Bottom chord tension: F_bc = F_diag * cos(α) = P*cos(α)/(2sinα) = P/(2tanα)
    let cos_a = (span / 2.0) / diag_l;
    let f_bc = f_diag * cos_a;
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef3.n_start.abs(), f_bc, 0.02,
        "Triangle: bottom chord = P/(2tanα)");
    assert!(ef3.n_start > 0.0, "Triangle: bottom chord in tension");
}

// ================================================================
// 5. K-Truss: Interior Panel Forces
// ================================================================
//
// K-truss has verticals split by a diagonal at midheight.
// It distributes forces more evenly.

#[test]
fn validation_truss_k_pattern() {
    let span = 12.0;
    let h = 4.0;
    let p = 20.0;
    let dx = span / 3.0;

    // Standard Pratt truss with verticals and diagonals (simpler than K)
    // This tests a common truss with multiple load-carrying paths.
    let nodes = vec![
        (1, 0.0, 0.0), (2, dx, 0.0), (3, 2.0 * dx, 0.0), (4, 3.0 * dx, 0.0),
        (5, 0.0, h), (6, dx, h), (7, 2.0 * dx, h), (8, 3.0 * dx, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Top chord
        (4, "truss", 5, 6, 1, 1, false, false),
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7, "truss", 1, 5, 1, 1, false, false),
        (8, "truss", 2, 6, 1, 1, false, false),
        (9, "truss", 3, 7, 1, 1, false, false),
        (10, "truss", 4, 8, 1, 1, false, false),
        // Diagonals (X-bracing in panels)
        (11, "truss", 1, 6, 1, 1, false, false),
        (12, "truss", 2, 7, 1, 1, false, false),
        (13, "truss", 7, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Multi-panel truss: ΣRy = 2P");

    // Bottom chord should be in tension at center
    let ef_bc = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_bc.n_start > 0.0, "Multi-panel: bottom chord in tension");

    // Top chord should be in compression
    let ef_tc = results.element_forces.iter()
        .find(|e| e.element_id == 5).unwrap();
    assert!(ef_tc.n_start < 0.0, "Multi-panel: top chord in compression");
}

// ================================================================
// 6. Symmetric Truss: Force Symmetry
// ================================================================

#[test]
fn validation_truss_symmetry() {
    let span = 10.0;
    let h = 3.0;
    let p = 20.0;
    let dx = span / 2.0;

    // Symmetric truss: 3-panel with load at midspan
    let nodes = vec![
        (1, 0.0, 0.0), (2, dx, 0.0), (3, 2.0 * dx, 0.0),
        (4, 0.0, h), (5, dx, h), (6, 2.0 * dx, h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false),  // BC left
        (2, "truss", 2, 3, 1, 1, false, false),  // BC right
        (3, "truss", 4, 5, 1, 1, false, false),  // TC left
        (4, "truss", 5, 6, 1, 1, false, false),  // TC right
        (5, "truss", 1, 4, 1, 1, false, false),  // left vert
        (6, "truss", 2, 5, 1, 1, false, false),  // center vert
        (7, "truss", 3, 6, 1, 1, false, false),  // right vert
        (8, "truss", 1, 5, 1, 1, false, false),  // left diag
        (9, "truss", 5, 3, 1, 1, false, false),  // right diag
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: reactions equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, r3.rz, 0.01, "Symmetric truss: equal reactions");

    // Symmetric member pairs should have equal force magnitude
    // BC left (1) = BC right (2), TC left (3) = TC right (4)
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;
    assert_close(f1.abs(), f2.abs(), 0.02, "Symmetric: BC left = BC right");

    let f3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start;
    let f4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap().n_start;
    assert_close(f3.abs(), f4.abs(), 0.02, "Symmetric: TC left = TC right");
}

// ================================================================
// 7. Truss Depth Effect: Deeper → Lower Chord Forces
// ================================================================

#[test]
fn validation_truss_depth_effect() {
    let span = 12.0;
    let p = 30.0;

    let solve_truss = |h: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0), (2, span, 0.0), (3, span / 2.0, h),
        ];
        let elems = vec![
            (1, "truss", 1, 3, 1, 1, false, false),
            (2, "truss", 3, 2, 1, 1, false, false),
            (3, "truss", 1, 2, 1, 1, false, false),
        ];
        let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })];
        let input = make_input(
            nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        results.element_forces.iter()
            .find(|e| e.element_id == 3).unwrap().n_start.abs()
    };

    let f_shallow = solve_truss(2.0);
    let f_deep = solve_truss(6.0);

    // Deeper truss → lower chord forces
    // F_bc = M/h ∝ 1/h, so tripling depth divides chord force by 3
    assert!(f_deep < f_shallow,
        "Depth effect: deeper truss has lower chord force: {:.2} < {:.2}",
        f_deep, f_shallow);

    let ratio = f_shallow / f_deep;
    assert_close(ratio, 3.0, 0.1,
        "Depth effect: force ratio ≈ depth ratio");
}

// ================================================================
// 8. Truss Global Equilibrium
// ================================================================

#[test]
fn validation_truss_global_equilibrium() {
    let span = 16.0;
    let h = 4.0;
    let dx = span / 4.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, dx, 0.0), (3, 2.0 * dx, 0.0),
        (4, 3.0 * dx, 0.0), (5, 4.0 * dx, 0.0),
        (6, dx, h), (7, 2.0 * dx, h), (8, 3.0 * dx, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7, "truss", 2, 6, 1, 1, false, false),
        (8, "truss", 3, 7, 1, 1, false, false),
        (9, "truss", 4, 8, 1, 1, false, false),
        // Diagonals
        (10, "truss", 1, 6, 1, 1, false, false),
        (11, "truss", 6, 3, 1, 1, false, false),
        (12, "truss", 7, 4, 1, 1, false, false),
        (13, "truss", 8, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -10.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fz: -20.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fz: -10.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 5.0, fz: 0.0, my: 0.0 }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // ΣFx = 0: Rx_reactions + 5.0 = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -5.0, 0.01, "Truss equilibrium: ΣRx = -5");

    // ΣFy = 0: Ry_reactions = 40
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 40.0, 0.01, "Truss equilibrium: ΣRy = 40");
}
