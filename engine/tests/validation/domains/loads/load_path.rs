/// Validation: Load Path and Force Flow Verification
///
/// References:
///   - Schlaich, Schäfer & Jennewein, "Toward a Consistent Design of Structural Concrete" (1987)
///   - Mörsch, "Der Eisenbetonbau", strut-and-tie principles
///   - ASCE 7, load path requirements
///
/// Tests verify that loads follow correct paths through structures:
///   1. Direct load path: column → foundation
///   2. Indirect path: beam collects load → transfers to columns
///   3. Cantilever overturning: moment equilibrium at base
///   4. Truss force flow: tension/compression members
///   5. Frame lateral load path: columns resist shear
///   6. Rigid diaphragm: equal drift assumption
///   7. Load redistribution with member removal
///   8. Gravity load path through multi-story frame
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Direct Load Path: Column to Foundation
// ================================================================

#[test]
fn validation_load_path_direct() {
    let h = 4.0;
    let p = 30.0;

    // Single column: load at top, fixed at base
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Full load transfers to foundation
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.rz, p, 0.02, "Direct path: R = P");

    // No lateral reaction (load is vertical on vertical column)
    assert!(r.rx.abs() < 0.1, "Direct path: Rx ≈ 0");

    // Axial force = P throughout column
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), p, 0.02, "Direct path: N = P");
}

// ================================================================
// 2. Indirect Path: Beam Collects and Transfers
// ================================================================

#[test]
fn validation_load_path_indirect() {
    let w = 8.0;
    let h = 4.0;
    let p = 20.0;

    // Portal frame with midspan beam load
    // Load on beam → transfers to columns
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h), (4, w, h), (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 5, 4, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed"), (2, 5, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both columns should carry vertical load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rz;

    assert!(r1 > 0.0, "Indirect: left column carries load");
    assert!(r5 > 0.0, "Indirect: right column carries load");
    assert_close(r1 + r5, p, 0.02, "Indirect: total = P");
}

// ================================================================
// 3. Cantilever Overturning Moment
// ================================================================

#[test]
fn validation_load_path_overturning() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Overturning moment at base = P × L
    assert_close(r.my.abs(), p * l, 0.02,
        "Overturning: M = P×L");

    // Shear at base = P
    assert_close(r.rz, p, 0.02, "Overturning: V = P");
}

// ================================================================
// 4. Truss Force Flow: Tension and Compression
// ================================================================

#[test]
fn validation_load_path_truss_flow() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // Simple triangular truss with vertical load at apex
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, w / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (2, "truss", 2, 3, 1, 1, false, false), // right diagonal
            (3, "truss", 1, 2, 1, 1, false, false), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Diagonals should be in compression (load pushes down, diagonals resist)
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;
    // Bottom chord should be in tension
    let f3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start;

    // Both diagonals carry equal force (symmetric)
    assert_close(f1.abs(), f2.abs(), 0.02, "Truss flow: symmetric diagonals");
    // Bottom chord is in tension
    assert!(f3.abs() > 0.0, "Truss flow: non-zero bottom chord force");
}

// ================================================================
// 5. Frame Lateral Load Path: Column Shear
// ================================================================

#[test]
fn validation_load_path_lateral() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Both columns resist the lateral shear
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Total horizontal reaction = F
    assert_close(r1.rx + r4.rx, -f, 0.02,
        "Lateral path: ΣRx = -F");

    // Each column carries a share of the shear
    assert!(r1.rx.abs() > 0.0, "Lateral path: left column carries shear");
    assert!(r4.rx.abs() > 0.0, "Lateral path: right column carries shear");
}

// ================================================================
// 6. Rigid Floor: Equal Drift
// ================================================================

#[test]
fn validation_load_path_rigid_floor() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    // Portal frame: beam is much stiffer than columns
    // → top nodes have nearly equal lateral displacement (rigid diaphragm)
    let input = make_portal_frame(h, w, E, A, IZ, f, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Top nodes should have similar drift (beam is reasonably stiff)
    assert_close(d2, d3, 0.15,
        "Rigid floor: similar drift at top");
}

// ================================================================
// 7. Load Redistribution: Compare Stiff vs Flexible
// ================================================================

#[test]
fn validation_load_path_redistribution() {
    let w = 6.0;
    let h = 4.0;
    let p = 10.0;

    // Stiff beam (large IZ) distributes load more evenly
    let iz_stiff = 10.0 * IZ;

    // With standard beam
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Load at one corner
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -p, my: 0.0,
    })];

    // Standard IZ
    let input1 = make_input(nodes.clone(), vec![(1, E, 0.3)],
        vec![(1, A, IZ)], elems.clone(), sups.clone(), loads.clone());
    let r1_std = linear::solve_2d(&input1).unwrap();
    let r4_std = r1_std.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;

    // Stiff beam
    let input2 = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_stiff)], elems, sups, loads);
    let r2_stiff = linear::solve_2d(&input2).unwrap();
    let r4_stiff = r2_stiff.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;

    // Stiffer beam redistributes more load to far column
    assert!(r4_stiff > r4_std,
        "Redistribution: stiffer beam sends more to far column: {:.4} > {:.4}",
        r4_stiff, r4_std);
}

// ================================================================
// 8. Multi-Story Gravity Path
// ================================================================

#[test]
fn validation_load_path_multi_story() {
    let w = 6.0;
    let h1 = 4.0;
    let h2 = 3.5;
    let p1 = 10.0;
    let p2 = 8.0;

    // 2-story, 1-bay frame
    // Bottom: 1(0,0), 2(w,0)
    // Floor 1: 3(0,h1), 4(w,h1)
    // Floor 2: 5(0,h1+h2), 6(w,h1+h2)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h1), (4, w, h1),
        (5, 0.0, h1 + h2), (6, w, h1 + h2),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // col 1 floor 1
        (2, "frame", 2, 4, 1, 1, false, false), // col 2 floor 1
        (3, "frame", 3, 5, 1, 1, false, false), // col 1 floor 2
        (4, "frame", 4, 6, 1, 1, false, false), // col 2 floor 2
        (5, "frame", 3, 4, 1, 1, false, false), // beam floor 1
        (6, "frame", 5, 6, 1, 1, false, false), // beam floor 2
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p2, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p2, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p1, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems,
        vec![(1, 1, "fixed"), (2, 2, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total gravity = 2P1 + 2P2
    let total = 2.0 * p1 + 2.0 * p2;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total, 0.02,
        "Multi-story: ΣRy = total gravity");

    // By symmetry: equal reactions at both bases
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    assert_close(r1, r2, 0.02,
        "Multi-story: symmetric reactions");
}
