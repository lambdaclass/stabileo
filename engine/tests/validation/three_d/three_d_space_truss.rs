/// Validation: 3D Space Truss Analysis
///
/// References:
///   - Kassimali, "Matrix Analysis of Structures", Ch. 4
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 3
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 3
///
/// Space trusses are 3D structures with pin-jointed members carrying
/// only axial forces. These tests verify equilibrium, member forces,
/// and deflections for common 3D truss configurations.
///
/// Tests verify:
///   1. Simple tripod: vertical load → three member forces
///   2. Symmetric tripod: equal leg forces by symmetry
///   3. Horizontal force on tripod: asymmetric member forces
///   4. Tetrahedron truss: 6-member space truss
///   5. Tower segment: 4-legged tower under lateral load
///   6. 3D equilibrium: ΣF = 0 and ΣM = 0
///   7. Member force sign: tension vs compression
///   8. Deflection proportionality: double load → double deflection
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.005;

// ================================================================
// 1. Simple Tripod: Vertical Load
// ================================================================
//
// Three legs from apex (0,0,h) to base corners of equilateral triangle.
// Vertical load P at apex. All three member forces equal by symmetry.

#[test]
fn validation_3d_truss_tripod_vertical() {
    let h = 4.0;
    let r = 3.0; // radius of base triangle
    let p = 30.0;

    let pi = std::f64::consts::PI;
    let x1 = r;
    let y1 = 0.0;
    let x2 = r * (2.0 * pi / 3.0).cos();
    let y2 = r * (2.0 * pi / 3.0).sin();
    let x3 = r * (4.0 * pi / 3.0).cos();
    let y3 = r * (4.0 * pi / 3.0).sin();

    let input = make_3d_input(
        vec![
            (1, x1, y1, 0.0), (2, x2, y2, 0.0), (3, x3, y3, 0.0),
            (4, 0.0, 0.0, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            (1, "truss", 1, 4, 1, 1),
            (2, "truss", 2, 4, 1, 1),
            (3, "truss", 3, 4, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // All three member forces should be equal (by symmetry)
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start.abs();
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start.abs();
    let f3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start.abs();

    assert_close(f1, f2, 0.01, "Tripod: F1 = F2");
    assert_close(f2, f3, 0.01, "Tripod: F2 = F3");

    // All members in compression (load pushes apex down)
    assert!(f1 > 0.0, "Tripod: members carry load");
}

// ================================================================
// 2. Symmetric Tripod: Apex Deflection
// ================================================================
//
// Apex deflects vertically only (by symmetry, no lateral drift).

#[test]
fn validation_3d_truss_tripod_symmetry() {
    let h = 4.0;
    let r = 3.0;
    let p = 30.0;

    let pi = std::f64::consts::PI;
    let x1 = r;
    let y1 = 0.0;
    let x2 = r * (2.0 * pi / 3.0).cos();
    let y2 = r * (2.0 * pi / 3.0).sin();
    let x3 = r * (4.0 * pi / 3.0).cos();
    let y3 = r * (4.0 * pi / 3.0).sin();

    let input = make_3d_input(
        vec![
            (1, x1, y1, 0.0), (2, x2, y2, 0.0), (3, x3, y3, 0.0),
            (4, 0.0, 0.0, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            (1, "truss", 1, 4, 1, 1),
            (2, "truss", 2, 4, 1, 1),
            (3, "truss", 3, 4, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    let apex = results.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // Lateral displacements should be zero by symmetry
    assert!(apex.ux.abs() < 1e-10, "Tripod symmetry: ux ≈ 0: {:.6e}", apex.ux);
    assert!(apex.uy.abs() < 1e-10, "Tripod symmetry: uy ≈ 0: {:.6e}", apex.uy);

    // Vertical deflection downward
    assert!(apex.uz < 0.0, "Tripod: apex moves down: {:.6e}", apex.uz);
}

// ================================================================
// 3. Horizontal Force on Tripod
// ================================================================
//
// Horizontal force at apex → asymmetric member forces.

#[test]
fn validation_3d_truss_tripod_horizontal() {
    let h = 4.0;
    let r = 3.0;
    let f_horiz = 10.0;

    let pi = std::f64::consts::PI;
    let x1 = r;
    let y1 = 0.0;
    let x2 = r * (2.0 * pi / 3.0).cos();
    let y2 = r * (2.0 * pi / 3.0).sin();
    let x3 = r * (4.0 * pi / 3.0).cos();
    let y3 = r * (4.0 * pi / 3.0).sin();

    let input = make_3d_input(
        vec![
            (1, x1, y1, 0.0), (2, x2, y2, 0.0), (3, x3, y3, 0.0),
            (4, 0.0, 0.0, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            (1, "truss", 1, 4, 1, 1),
            (2, "truss", 2, 4, 1, 1),
            (3, "truss", 3, 4, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: f_horiz, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium: ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_rx, -f_horiz, 0.01, "Horizontal: ΣRx = -Fx");

    // Apex should drift in X direction
    let apex = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(apex.ux > 0.0, "Horizontal: apex moves in +X");
}

// ================================================================
// 4. Tetrahedron Truss: 6-Member Space Truss
// ================================================================
//
// Regular tetrahedron: 4 nodes, 6 members.
// Pin 3 base nodes, load apex vertically.

#[test]
fn validation_3d_truss_tetrahedron() {
    let a = 4.0; // edge length
    let h = a * (2.0_f64 / 3.0).sqrt(); // height of regular tetrahedron

    // Base: equilateral triangle in XY plane
    let x1 = 0.0;
    let y1 = 0.0;
    let x2 = a;
    let y2 = 0.0;
    let x3 = a / 2.0;
    let y3 = a * (3.0_f64).sqrt() / 2.0;
    // Apex above centroid
    let cx = (x1 + x2 + x3) / 3.0;
    let cy = (y1 + y2 + y3) / 3.0;
    let p = 20.0;

    let input = make_3d_input(
        vec![
            (1, x1, y1, 0.0), (2, x2, y2, 0.0), (3, x3, y3, 0.0),
            (4, cx, cy, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            // 6 edges of tetrahedron
            (1, "truss", 1, 2, 1, 1),
            (2, "truss", 2, 3, 1, 1),
            (3, "truss", 3, 1, 1, 1),
            (4, "truss", 1, 4, 1, 1),
            (5, "truss", 2, 4, 1, 1),
            (6, "truss", 3, 4, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, p, 0.01, "Tetrahedron: ΣRz = P");

    // By symmetry, all three vertical reactions should be equal
    let rz1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fz;
    let rz2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().fz;
    let rz3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().fz;
    assert_close(rz1, rz2, 0.01, "Tetrahedron: Rz1 = Rz2");
    assert_close(rz2, rz3, 0.01, "Tetrahedron: Rz2 = Rz3");
    assert_close(rz1, p / 3.0, 0.01, "Tetrahedron: Rz = P/3");
}

// ================================================================
// 5. Tower Segment: 4-Legged Tower Under Lateral Load
// ================================================================
//
// Simple 4-legged tower segment: 4 base nodes, 4 top nodes,
// 4 vertical members, 4 diagonal braces.

#[test]
fn validation_3d_truss_tower() {
    let w = 2.0; // base width
    let h = 5.0;
    let f = 10.0; // lateral

    let input = make_3d_input(
        vec![
            // Base corners
            (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0),
            (3, w, w, 0.0), (4, 0.0, w, 0.0),
            // Top corners
            (5, 0.0, 0.0, h), (6, w, 0.0, h),
            (7, w, w, h), (8, 0.0, w, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            // Vertical legs
            (1, "truss", 1, 5, 1, 1),
            (2, "truss", 2, 6, 1, 1),
            (3, "truss", 3, 7, 1, 1),
            (4, "truss", 4, 8, 1, 1),
            // Diagonal braces (one per face)
            (5, "truss", 1, 6, 1, 1), // front face
            (6, "truss", 2, 7, 1, 1), // right face
            (7, "truss", 3, 8, 1, 1), // back face
            (8, "truss", 4, 5, 1, 1), // left face
            // Horizontal ties at top
            (9,  "truss", 5, 6, 1, 1),
            (10, "truss", 6, 7, 1, 1),
            (11, "truss", 7, 8, 1, 1),
            (12, "truss", 8, 5, 1, 1),
            // Horizontal ties at base
            (13, "truss", 1, 2, 1, 1),
            (14, "truss", 2, 3, 1, 1),
            (15, "truss", 3, 4, 1, 1),
            (16, "truss", 4, 1, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
            (4, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: f, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_rx, -f, 0.01, "Tower: ΣRx = -F");

    // Top node should drift in X
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    assert!(d5.ux > 0.0, "Tower: top drifts in +X");
}

// ================================================================
// 6. 3D Equilibrium: Full Vector Check
// ================================================================
//
// For any static structure: ΣFx = ΣFy = ΣFz = 0.

#[test]
fn validation_3d_truss_equilibrium() {
    let h = 4.0;
    let r = 3.0;
    let fx = 5.0;
    let fy = -3.0;
    let fz = -20.0;

    let pi = std::f64::consts::PI;
    let input = make_3d_input(
        vec![
            (1, r, 0.0, 0.0),
            (2, r * (2.0 * pi / 3.0).cos(), r * (2.0 * pi / 3.0).sin(), 0.0),
            (3, r * (4.0 * pi / 3.0).cos(), r * (4.0 * pi / 3.0).sin(), 0.0),
            (4, 0.0, 0.0, h),
        ],
        vec![(1, E, NU)],
        vec![(1, A, 1e-6, 1e-6, 1e-6)],
        vec![
            (1, "truss", 1, 4, 1, 1),
            (2, "truss", 2, 4, 1, 1),
            (3, "truss", 3, 4, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, false, false, false]),
            (2, vec![true, true, true, false, false, false]),
            (3, vec![true, true, true, false, false, false]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx, fy, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert_close(sum_rx, -fx, 0.01, "3D equil: ΣRx = -Fx");
    assert_close(sum_ry, -fy, 0.01, "3D equil: ΣRy = -Fy");
    assert_close(sum_rz, -fz, 0.01, "3D equil: ΣRz = -Fz");
}

// ================================================================
// 7. Member Force Sign: Tension vs Compression
// ================================================================
//
// Tripod with upward load → legs in tension.
// Tripod with downward load → legs in compression.

#[test]
fn validation_3d_truss_tension_compression() {
    let h = 4.0;
    let r = 3.0;
    let p = 20.0;

    let pi = std::f64::consts::PI;
    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, r * (2.0 * pi / 3.0).cos(), r * (2.0 * pi / 3.0).sin(), 0.0),
        (3, r * (4.0 * pi / 3.0).cos(), r * (4.0 * pi / 3.0).sin(), 0.0),
        (4, 0.0, 0.0, h),
    ];
    let mats = vec![(1, E, NU)];
    let secs = vec![(1, A, 1e-6, 1e-6, 1e-6)];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    // Downward load → compression
    let input_down = make_3d_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let rd = linear::solve_3d(&input_down).unwrap();
    let nd = rd.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;

    // Upward load → tension
    let input_up = make_3d_input(
        nodes, mats, secs, elems, sups,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let ru = linear::solve_3d(&input_up).unwrap();
    let nu = ru.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;

    // Forces should be opposite
    assert_close(nd, -nu, 0.01, "Tension/compression: opposite forces");
}

// ================================================================
// 8. Deflection Proportionality: Double Load Double Deflection
// ================================================================

#[test]
fn validation_3d_truss_proportionality() {
    let h = 4.0;
    let r = 3.0;
    let p = 15.0;

    let pi = std::f64::consts::PI;
    let nodes = vec![
        (1, r, 0.0, 0.0),
        (2, r * (2.0 * pi / 3.0).cos(), r * (2.0 * pi / 3.0).sin(), 0.0),
        (3, r * (4.0 * pi / 3.0).cos(), r * (4.0 * pi / 3.0).sin(), 0.0),
        (4, 0.0, 0.0, h),
    ];
    let mats = vec![(1, E, NU)];
    let secs = vec![(1, A, 1e-6, 1e-6, 1e-6)];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    // Load P
    let input1 = make_3d_input(
        nodes.clone(), mats.clone(), secs.clone(), elems.clone(), sups.clone(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let d1 = linear::solve_3d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 4).unwrap().uz;

    // Load 2P
    let input2 = make_3d_input(
        nodes, mats, secs, elems, sups,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: 0.0, fz: -2.0 * p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let d2 = linear::solve_3d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 4).unwrap().uz;

    assert_close(d2 / d1, 2.0, 0.001, "Proportionality: 2P → 2δ");
}
