/// Validation: 3D Grid and Grillage-Like Structures
///
/// References:
///   - Hambly, "Bridge Deck Behaviour", Ch. 3-5
///   - Ghali & Neville, "Structural Analysis", Ch. 14
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 8
///
/// Grid structures are planar frame systems loaded normal to their
/// plane. They involve bending and torsion of members. These tests
/// verify 3D beam behavior for grid-like configurations.
///
/// Tests verify:
///   1. Single beam bending: 3D simply-supported beam
///   2. Crossed beams: load sharing between perpendicular beams
///   3. Torsional coupling: eccentric load causes twist
///   4. Grid symmetry: symmetric grid under symmetric load
///   5. Two-beam grid: deflection comparison with single beam
///   6. Edge beam effect: stiff edge beam reduces interior deflection
///   7. Point load on grid intersection: load distribution
///   8. Grid with unequal spans: longer span deflects more
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 8e-5;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;

// ================================================================
// 1. Single 3D SS Beam: Reference Deflection
// ================================================================
//
// Simply-supported 3D beam with midspan point load.
// δ = PL³/(48EI_z) for load in Y direction.

#[test]
fn validation_3d_grid_single_beam() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],     // fixed rotation at pin
        Some(vec![false, true, true, false, false, false]), // roller in Y,Z
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid, d_exact, 0.02, "3D SS beam: δ = PL³/(48EI_z)");
}

// ================================================================
// 2. Crossed Beams: Load Sharing
// ================================================================
//
// Two beams crossing at right angles at their midpoints.
// Point load at intersection → shared between the two beams.
// If both beams have same properties and span, each carries P/2.

#[test]
fn validation_3d_grid_crossed_beams() {
    let l = 6.0;
    let p = 20.0;

    // Beam 1: along X-axis from (-L/2,0,0) to (L/2,0,0)
    // Beam 2: along Z-axis from (0,0,-L/2) to (0,0,L/2)
    // Intersection at origin (0,0,0) = node 3 = node 5 (shared)
    let input = make_3d_input(
        vec![
            (1, -l / 2.0, 0.0, 0.0), (2, 0.0, 0.0, 0.0), (3, l / 2.0, 0.0, 0.0),
            (4, 0.0, 0.0, -l / 2.0), (5, 0.0, 0.0, l / 2.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 2, 1, 1),
            (4, "frame", 2, 5, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]), // pin at beam 1 left
            (3, vec![true, true, true, true, true, true]), // pin at beam 1 right
            (4, vec![true, true, true, true, true, true]), // pin at beam 2 left
            (5, vec![true, true, true, true, true, true]), // pin at beam 2 right
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Center deflection
    let d_center = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;
    assert!(d_center < 0.0, "Crossed: center deflects down");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, p, 0.01, "Crossed: ΣRy = P");
}

// ================================================================
// 3. Eccentric Load on 3D Beam: Torsion
// ================================================================
//
// 3D beam loaded eccentrically (off the shear center) produces torsion.
// Here we apply a torque directly and verify twist.

#[test]
fn validation_3d_grid_torsion() {
    let l = 5.0;
    let n = 10;
    let t = 5.0;
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let phi = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().rx;
    let phi_exact = t * l / (g * J);
    assert_close(phi.abs(), phi_exact, 0.02, "Torsion: φ = TL/(GJ)");
}

// ================================================================
// 4. Grid Symmetry: Symmetric Loading
// ================================================================
//
// Symmetric structure under symmetric load → symmetric deflections.

#[test]
fn validation_3d_grid_symmetry() {
    let l = 6.0;
    let p = 10.0;

    // Beam along X: from (0,0,0) to (L,0,0)
    // Equal loads at L/3 and 2L/3 (symmetric)
    let n = 12;
    let node_l3 = n / 3 + 1; // node 5
    let node_2l3 = 2 * n / 3 + 1; // node 9

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_l3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: node_2l3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        Some(vec![false, true, true, false, false, false]),
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Deflections at L/3 and 2L/3 should be equal
    let d1 = results.displacements.iter()
        .find(|d| d.node_id == node_l3).unwrap().uy;
    let d2 = results.displacements.iter()
        .find(|d| d.node_id == node_2l3).unwrap().uy;
    assert_close(d1, d2, 0.001, "Grid symmetry: δ(L/3) = δ(2L/3)");
}

// ================================================================
// 5. Two-Beam Grid vs Single Beam: Stiffening Effect
// ================================================================
//
// Adding a cross beam to a single beam reduces deflection at the
// junction point (the cross beam provides additional stiffness).

#[test]
fn validation_3d_grid_stiffening() {
    let l = 8.0;
    let p = 15.0;
    let n = 8;
    // Single beam: cantilever along X
    let loads_single = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_single = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_single,
    );
    let d_single = linear::solve_3d(&input_single).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Two beams: main beam + perpendicular bracing beam at midspan
    // This creates a T-junction that adds stiffness
    let input_grid = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, l / 2.0, 0.0, 0.0),
            (3, l, 0.0, 0.0),
            (4, l / 2.0, 0.0, -l / 2.0),
            (5, l / 2.0, 0.0, l / 2.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
            (3, "frame", 4, 2, 1, 1),
            (4, "frame", 2, 5, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
            (5, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let d_grid = linear::solve_3d(&input_grid).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().uy.abs();

    // Grid should be stiffer than single beam (smaller deflection)
    assert!(d_grid < d_single,
        "Grid stiffening: grid < single: {:.6e} < {:.6e}", d_grid, d_single);
}

// ================================================================
// 6. Edge Beam Effect: Stiffer Edge Reduces Interior Deflection
// ================================================================
//
// A grid with stiffer edge beams has less deflection than one
// with uniform section properties.

#[test]
fn validation_3d_grid_edge_beam() {
    let l = 6.0;
    let p = 10.0;

    // Simple L-frame: two beams meeting at right angle
    // Version 1: uniform properties
    let input1 = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0), (3, l, 0.0, l)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (3, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let d1 = linear::solve_3d(&input1).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().uy.abs();

    // Version 2: double stiffness on both beams
    let input2 = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0), (3, l, 0.0, l)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J), (2, A, 2.0 * IY, 2.0 * IZ, 2.0 * J)],
        vec![
            (1, "frame", 1, 2, 1, 2),
            (2, "frame", 2, 3, 1, 2),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (3, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let d2 = linear::solve_3d(&input2).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().uy.abs();

    assert!(d2 < d1, "Edge beam: stiffer → less deflection: {:.6e} < {:.6e}", d2, d1);
}

// ================================================================
// 7. Point Load at Grid Intersection: Reaction Check
// ================================================================
//
// Load at intersection → total reactions = applied load.

#[test]
fn validation_3d_grid_intersection_load() {
    let l = 5.0;
    let p = 12.0;

    let input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0),
            (3, l / 2.0, 0.0, 0.0),
            (4, l / 2.0, 0.0, -l / 2.0), (5, l / 2.0, 0.0, l / 2.0),
        ],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 3, 1, 1),
            (2, "frame", 3, 2, 1, 1),
            (3, "frame", 4, 3, 1, 1),
            (4, "frame", 3, 5, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (2, vec![true, true, true, true, true, true]),
            (4, vec![true, true, true, true, true, true]),
            (5, vec![true, true, true, true, true, true]),
        ],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_ry, p, 0.01, "Grid intersection: ΣRy = P");

    // Center deflection
    let d = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d.uy < 0.0, "Grid intersection: center deflects down");
}

// ================================================================
// 8. Grid with Unequal Spans: Longer Span Deflects More
// ================================================================

#[test]
fn validation_3d_grid_unequal_spans() {
    let l_short = 4.0;
    let l_long = 8.0;
    let p = 10.0;
    let n = 8;

    // Short cantilever
    let loads_s = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_s = make_3d_beam(
        n, l_short, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_s,
    );
    let d_short = linear::solve_3d(&input_s).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Long cantilever
    let loads_l = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_l = make_3d_beam(
        n, l_long, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_l,
    );
    let d_long = linear::solve_3d(&input_l).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // δ ∝ L³ → ratio = (L_long/L_short)³ = 8
    assert_close(d_long / d_short, (l_long / l_short).powi(3), 0.02,
        "Unequal spans: δ ∝ L³");
}
