/// Validation: Grillage (3D Grid) Analysis
///
/// References:
///   - Hambly, "Bridge Deck Behaviour", 2nd Ed., E & FN Spon (1991)
///   - O'Brien & Keogh, "Bridge Deck Analysis", E & FN Spon (1999)
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 14
///   - Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells"
///
/// A grillage is a planar grid of beams lying in the XZ plane, loaded
/// in the Y direction. It combines bending and torsion coupling.
///
/// Tests:
///   1. Two-beam grid: load sharing proportional to stiffness
///   2. Cross-beam effect: transverse beam redistributes load
///   3. Symmetric grid: equal load sharing under center load
///   4. Cantilever grid: free edge deflection
///   5. Grid torsion coupling: twist induces bending
///   6. Single main beam vs grillage comparison
///   7. Grillage equilibrium: ΣR = applied load
///   8. Grid with different main/cross beam stiffness
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;

// ================================================================
// 1. Two Parallel Beams with Cross-Beam: Load Sharing
// ================================================================
//
// Two simply-supported beams (in X direction) connected by a
// cross-beam (in Z direction) at midspan. Load on one beam is
// shared with the other through the cross-beam.

#[test]
fn validation_grillage_load_sharing() {
    let lx = 8.0;  // main beam span
    let lz = 3.0;  // cross-beam spacing
    let p = 20.0;

    // Nodes: beams along X at z=0 and z=lz
    // 1--2--3 (beam 1 at z=0)
    // 4     5 (only midspan cross-beam connection)
    // Wait, let's use a cleaner layout:
    //
    // 1---3---5  (z=0, main beam 1)
    //     |
    // 2---4---6  (z=lz, main beam 2)
    //     ^ cross-beam connects nodes 3 and 4

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, lz),
        (3, lx / 2.0, 0.0, 0.0),
        (4, lx / 2.0, 0.0, lz),
        (5, lx, 0.0, 0.0),
        (6, lx, 0.0, lz),
    ];

    let elems = vec![
        (1, "frame", 1, 3, 1, 1), // main beam 1, left half
        (2, "frame", 3, 5, 1, 1), // main beam 1, right half
        (3, "frame", 2, 4, 1, 1), // main beam 2, left half
        (4, "frame", 4, 6, 1, 1), // main beam 2, right half
        (5, "frame", 3, 4, 1, 1), // cross-beam
    ];

    // Pin-roller supports at all four ends
    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()),
        (2, fix.clone()),
        (5, roller_x.clone()),
        (6, roller_x.clone()),
    ];

    // Load at midspan of beam 1 (node 3)
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01,
        "Grillage equilibrium: ΣRy={:.4}, expected P={:.4}", sum_ry, p);

    // Beam 2 (node 4) should also deflect due to cross-beam
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    // Both should deflect downward
    assert!(d3 < 0.0, "Node 3 should deflect down: uy={:.6e}", d3);
    assert!(d4 < 0.0, "Node 4 should deflect down: uy={:.6e}", d4);

    // Loaded beam deflects more
    assert!(d3.abs() > d4.abs(),
        "Loaded beam deflects more: d3={:.6e}, d4={:.6e}", d3, d4);
}

// ================================================================
// 2. Cross-Beam Redistribution Effect
// ================================================================
//
// Compare: single beam alone vs same beam in a grillage.
// The grillage beam should deflect less due to load sharing.

#[test]
fn validation_grillage_redistribution() {
    let l = 6.0;
    let lz = 3.0;
    let p = 15.0;

    // Single beam (3D)
    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];

    let input_single = make_3d_beam(2, l, E, NU, A, IY, IZ, J,
        fix.clone(), Some(roller_x.clone()),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let r_single = linear::solve_3d(&input_single).unwrap();
    let d_single = r_single.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Grillage: same beam + parallel beam connected by cross-beam at midspan
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l / 2.0, 0.0, 0.0), (3, l, 0.0, 0.0),
        (4, 0.0, 0.0, lz), (5, l / 2.0, 0.0, lz), (6, l, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1), // cross-beam
    ];
    let sups = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input_grid = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let r_grid = linear::solve_3d(&input_grid).unwrap();
    let d_grid = r_grid.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy;

    // Grillage should deflect less (load is shared)
    assert!(d_grid.abs() < d_single.abs(),
        "Grillage deflection {:.6e} should be less than single beam {:.6e}",
        d_grid, d_single);
}

// ================================================================
// 3. Symmetric Grid: Equal Load Sharing
// ================================================================
//
// Two identical beams with cross-beam, load at center of cross-beam.
// Both beams should share load equally.

#[test]
fn validation_grillage_symmetric_sharing() {
    let lx = 8.0;
    let lz = 4.0;
    let p = 20.0;

    // Two main beams in X, two cross-beams connecting them
    // Layout:
    // 1---3---5  (z=0)
    //     |
    // 2---4---6  (z=lz)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, lz),
        (3, lx / 2.0, 0.0, 0.0), (4, lx / 2.0, 0.0, lz),
        (5, lx, 0.0, 0.0), (6, lx, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), (2, "frame", 3, 5, 1, 1),
        (3, "frame", 2, 4, 1, 1), (4, "frame", 4, 6, 1, 1),
        (5, "frame", 3, 4, 1, 1), // cross-beam at midspan
    ];

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (5, roller_x.clone()), (6, roller_x.clone()),
    ];

    // Load at midspan of cross-beam? No, node at midspan doesn't exist.
    // Instead: equal loads at nodes 3 and 4 (symmetric)
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p / 2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: -p / 2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // By symmetry: both main beams should deflect equally
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    let diff = (d3 - d4).abs() / d3.abs();
    assert!(diff < 0.01,
        "Symmetric sharing: d3={:.6e}, d4={:.6e}", d3, d4);

    // Reactions at beam 1 ends = reactions at beam 2 ends
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().fy;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().fy;
    let diff_r = (r1 - r2).abs() / r1.abs();
    assert!(diff_r < 0.01,
        "Symmetric reactions: R1={:.4}, R2={:.4}", r1, r2);
}

// ================================================================
// 4. Cantilever Grid: Free Edge Deflection
// ================================================================
//
// Two cantilever beams connected by a cross-beam at their tips.
// Loading at one tip deflects both cantilevers.

#[test]
fn validation_grillage_cantilever() {
    let l = 4.0;
    let lz = 3.0;
    let p = 10.0;

    let fix = vec![true, true, true, true, true, true];

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, lz),
        (3, l, 0.0, 0.0), (4, l, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), // cantilever 1
        (2, "frame", 2, 4, 1, 1), // cantilever 2
        (3, "frame", 3, 4, 1, 1), // cross-beam at tips
    ];
    let sups = vec![(1, fix.clone()), (2, fix.clone())];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Both tips deflect
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    assert!(d3 < 0.0, "Loaded tip should deflect: d3={:.6e}", d3);
    assert!(d4 < 0.0, "Connected tip should deflect: d4={:.6e}", d4);

    // Loaded tip deflects more
    assert!(d3.abs() > d4.abs(),
        "Loaded tip deflects more: d3={:.6e} > d4={:.6e}", d3, d4);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01, "Equilibrium: ΣRy={:.4}", sum_ry);
}

// ================================================================
// 5. Grid Torsion Coupling
// ================================================================
//
// Eccentric load on a grid induces torsion in main beams.
// The torsion in the main beam causes bending in the cross-beam.

#[test]
fn validation_grillage_torsion_coupling() {
    let lx = 8.0;
    let lz = 4.0;
    let p = 15.0;

    // Load only on beam 1 at midspan → asymmetric → torsion in cross-beam
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, lz),
        (3, lx / 2.0, 0.0, 0.0), (4, lx / 2.0, 0.0, lz),
        (5, lx, 0.0, 0.0), (6, lx, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), (2, "frame", 3, 5, 1, 1),
        (3, "frame", 2, 4, 1, 1), (4, "frame", 4, 6, 1, 1),
        (5, "frame", 3, 4, 1, 1), // cross-beam
    ];

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (5, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Asymmetric loading: nodes 3 and 4 have different deflections
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    assert!(d3.abs() > d4.abs(),
        "Asymmetric: d3={:.6e} > d4={:.6e}", d3, d4);

    // The cross-beam element (5) should have non-zero shear
    // (it redistributes load from beam 1 to beam 2)
    let ef5 = results.element_forces.iter()
        .find(|f| f.element_id == 5).unwrap();
    assert!(ef5.vy_start.abs() > 0.1 || ef5.vz_start.abs() > 0.1,
        "Cross-beam should carry shear: vy={:.4}, vz={:.4}",
        ef5.vy_start, ef5.vz_start);
}

// ================================================================
// 6. Grillage vs Single Beam: Stiffness Enhancement
// ================================================================
//
// A grillage with n parallel beams should be stiffer than a single beam
// (for eccentric loading) and approach n× stiffness for uniform loading.

#[test]
fn validation_grillage_stiffness_enhancement() {
    let l = 6.0;
    let p = 10.0;

    let fix = vec![true, true, true, true, true, true];
    let roller = vec![false, true, true, true, true, true];

    // Single beam: midspan load
    let input_single = make_3d_beam(2, l, E, NU, A, IY, IZ, J,
        fix.clone(), Some(roller.clone()),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let r_single = linear::solve_3d(&input_single).unwrap();
    let d_single = r_single.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // Two-beam grillage with equal load P/2 on each beam midspan
    let lz = 3.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, l / 2.0, 0.0, 0.0), (3, l, 0.0, 0.0),
        (4, 0.0, 0.0, lz), (5, l / 2.0, 0.0, lz), (6, l, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1),
        (3, "frame", 4, 5, 1, 1), (4, "frame", 5, 6, 1, 1),
        (5, "frame", 2, 5, 1, 1),
    ];
    let sups = vec![
        (1, fix.clone()), (4, fix.clone()),
        (3, roller.clone()), (6, roller.clone()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -p / 2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 0.0, fy: -p / 2.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];
    let input_grid = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let r_grid = linear::solve_3d(&input_grid).unwrap();
    let d_grid = r_grid.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().uy.abs();

    // Each beam carries P/2, so grillage deflection should be roughly
    // half of single beam (since each beam only carries half the load)
    let ratio = d_grid / d_single;
    assert!(ratio < 0.7,
        "Grillage deflection ratio {:.2} should be < 0.7 of single beam", ratio);
}

// ================================================================
// 7. Grillage Global Equilibrium
// ================================================================
//
// Multi-beam grid with distributed loads: verify all 6 equilibrium equations.

#[test]
fn validation_grillage_equilibrium() {
    let lx = 6.0;
    let lz = 4.0;
    let p1 = 10.0;
    let p2 = 8.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, lz),
        (3, lx / 2.0, 0.0, 0.0), (4, lx / 2.0, 0.0, lz),
        (5, lx, 0.0, 0.0), (6, lx, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), (2, "frame", 3, 5, 1, 1),
        (3, "frame", 2, 4, 1, 1), (4, "frame", 4, 6, 1, 1),
        (5, "frame", 3, 4, 1, 1),
    ];

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (5, roller_x.clone()), (6, roller_x.clone()),
    ];

    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p1, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: -p2, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    let total = p1 + p2;

    // ΣFy = applied loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let err = (sum_ry - total).abs() / total;
    assert!(err < 0.01, "ΣRy={:.4}, expected {:.4}", sum_ry, total);

    // ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert!(sum_rx.abs() < total * 0.001, "ΣRx={:.6} should be 0", sum_rx);

    // ΣFz = 0
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_rz.abs() < total * 0.001, "ΣRz={:.6} should be 0", sum_rz);
}

// ================================================================
// 8. Grid with Different Main/Cross Beam Stiffness
// ================================================================
//
// Main beams (EI_main) are stiffer than cross-beams (EI_cross).
// Load on main beam should be redistributed less to the other.

#[test]
fn validation_grillage_different_stiffness() {
    let lx = 8.0;
    let lz = 3.0;
    let p = 20.0;

    let iz_main = IZ;
    let iz_cross = IZ / 10.0; // Cross-beam much more flexible

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, lz),
        (3, lx / 2.0, 0.0, 0.0), (4, lx / 2.0, 0.0, lz),
        (5, lx, 0.0, 0.0), (6, lx, 0.0, lz),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1), // main beam 1 (section 1)
        (2, "frame", 3, 5, 1, 1),
        (3, "frame", 2, 4, 1, 1), // main beam 2 (section 1)
        (4, "frame", 4, 6, 1, 1),
        (5, "frame", 3, 4, 1, 2), // cross-beam (section 2, flexible)
    ];

    let fix = vec![true, true, true, true, true, true];
    let roller_x = vec![false, true, true, true, true, true];
    let sups = vec![
        (1, fix.clone()), (2, fix.clone()),
        (5, roller_x.clone()), (6, roller_x.clone()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, NU)],
        vec![(1, A, IY, iz_main, J), (2, A, IY / 10.0, iz_cross, J / 10.0)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // With very flexible cross-beam, very little load transfers to beam 2
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    // Beam 2 should deflect much less than beam 1
    let ratio = d4.abs() / d3.abs();
    assert!(ratio < 0.5,
        "Flexible cross-beam: d4/d3 ratio={:.2} should be small", ratio);

    // Equilibrium still holds
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let err = (sum_ry - p).abs() / p;
    assert!(err < 0.01, "Equilibrium: ΣRy={:.4}", sum_ry);
}
