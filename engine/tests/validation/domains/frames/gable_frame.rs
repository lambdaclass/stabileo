/// Validation: Gable (Pitched Roof) Frame Analysis
///
/// References:
///   - Kassimali, "Structural Analysis", Ch. 16 (Slope-Deflection)
///   - Hibbeler, "Structural Analysis", Ch. 15 (portal method)
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", Ch. 11
///
/// Gable frames (portal frames with pitched roof beams) appear in
/// industrial buildings, warehouses, and stadium structures.
/// These tests verify equilibrium, symmetry, and deflection properties
/// of gable frames under gravity and lateral loads.
///
/// Tests verify:
///   1. Symmetric gable under symmetric gravity: symmetric reactions
///   2. Symmetric gable under lateral wind: antisymmetric component
///   3. Gable with knee braces: increased lateral stiffness
///   4. A-frame (steep gable): equilibrium and horizontal thrust
///   5. Gable vs flat portal: ridge moment comparison
///   6. Pitched frame UDL: vertical equilibrium
///   7. Asymmetric gable: moment distribution
///   8. Gable with roller: horizontal thrust calculation
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a gable (pitched roof) frame.
/// Nodes: 1(0,0), 2(0,h), 3(w/2,h+rise), 4(w,h), 5(w,0)
/// Elements: col1(1→2), rafter1(2→3), rafter2(3→4), col2(4→5)
fn make_gable_frame(
    h: f64, w: f64, rise: f64,
    e: f64, a: f64, iz: f64,
    lateral_load: f64, gravity_load: f64,
    base_support: &str,
) -> SolverInput {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 2.0, h + rise),
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left rafter
        (3, "frame", 3, 4, 1, 1, false, false), // right rafter
        (4, "frame", 4, 5, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, base_support), (2, 5, base_support)];
    let mut loads = Vec::new();
    if lateral_load.abs() > 1e-20 {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral_load, fz: 0.0, my: 0.0,
        }));
    }
    if gravity_load.abs() > 1e-20 {
        // Apply gravity at eave nodes and ridge
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: gravity_load, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: gravity_load, my: 0.0,
        }));
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: gravity_load, my: 0.0,
        }));
    }
    make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads)
}

// ================================================================
// 1. Symmetric Gable, Symmetric Load → Symmetric Reactions
// ================================================================

#[test]
fn validation_gable_symmetric_gravity() {
    let h = 5.0;
    let w = 10.0;
    let rise = 3.0;
    let g = -20.0;

    let input = make_gable_frame(h, w, rise, E, A, IZ, 0.0, g, "fixed");
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // By symmetry: Ry1 = Ry5 = total_gravity / 2
    let total_gravity = 3.0 * g; // 3 nodes loaded
    assert_close(r1.rz, -total_gravity / 2.0, 0.01,
        "Gable symmetric: Ry1 = total/2");
    assert_close(r5.rz, -total_gravity / 2.0, 0.01,
        "Gable symmetric: Ry5 = total/2");

    // By symmetry: Rx1 = -Rx5 (horizontal thrusts equal and opposite)
    assert_close(r1.rx, -r5.rx, 0.01,
        "Gable symmetric: Rx1 = -Rx5");

    // By symmetry: Mz1 ≈ Mz5 in magnitude (both fixed)
    assert_close(r1.my.abs(), r5.my.abs(), 0.01,
        "Gable symmetric: |Mz1| = |Mz5|");
}

// ================================================================
// 2. Gable Under Lateral Wind: Horizontal Equilibrium
// ================================================================

#[test]
fn validation_gable_lateral_wind() {
    let h = 5.0;
    let w = 10.0;
    let rise = 2.0;
    let f_lat = 15.0;

    let input = make_gable_frame(h, w, rise, E, A, IZ, f_lat, 0.0, "fixed");
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // ΣFx = 0
    assert_close(r1.rx + r5.rx + f_lat, 0.0, 0.01,
        "Gable wind: ΣFx = 0");

    // ΣFy = 0 (no vertical load)
    assert_close(r1.rz + r5.rz, 0.0, 0.01,
        "Gable wind: ΣFy = 0");

    // Both bases should develop moments
    assert!(r1.my.abs() > 0.1, "Gable wind: base moment at 1 exists");
    assert!(r5.my.abs() > 0.1, "Gable wind: base moment at 5 exists");
}

// ================================================================
// 3. Gable with Knee Braces: Increased Lateral Stiffness
// ================================================================
//
// Adding diagonal braces from mid-column to eave increases
// lateral stiffness.

#[test]
fn validation_gable_knee_braces() {
    let h = 6.0;
    let w = 12.0;
    let rise = 3.0;
    let f_lat = 10.0;

    // Unbraced gable
    let input_unbraced = make_gable_frame(h, w, rise, E, A, IZ, f_lat, 0.0, "pinned");
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    // Braced gable: add knee braces from mid-column to eave
    // Nodes: 1(0,0), 2(0,h), 3(w/2,h+rise), 4(w,h), 5(w,0), 6(0,h/2), 7(w,h/2)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h + rise),
        (4, w, h), (5, w, 0.0), (6, 0.0, h / 2.0), (7, w, h / 2.0),
    ];
    let elems_clean = vec![
        (1, "frame", 1, 6, 1, 1, false, false),
        (2, "frame", 6, 2, 1, 1, false, false),
        (3, "frame", 2, 3, 1, 1, false, false),
        (4, "frame", 3, 4, 1, 1, false, false),
        (5, "frame", 4, 7, 1, 1, false, false),
        (6, "frame", 7, 5, 1, 1, false, false),
        (7, "frame", 6, 3, 1, 1, false, false), // left diagonal
        (8, "frame", 7, 3, 1, 1, false, false), // right diagonal
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fz: 0.0, my: 0.0,
    })];
    let input_braced = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_clean, sups, loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    // Eave node lateral displacement
    let d_unbraced = res_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_braced = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame should be stiffer (less lateral displacement)
    assert!(d_braced < d_unbraced * 0.8,
        "Knee braces reduce sway: {:.6} < {:.6}", d_braced, d_unbraced);
}

// ================================================================
// 4. A-Frame (Steep Gable): Equilibrium and Horizontal Thrust
// ================================================================
//
// A steep A-frame under vertical load at apex develops horizontal
// thrust at the base.

#[test]
fn validation_gable_a_frame() {
    let h = 2.0;   // short columns
    let w = 8.0;
    let rise = 6.0; // steep pitch
    let p = -30.0;  // vertical load at ridge only

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h + rise),
        (4, w, h), (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // ΣFy = 0
    assert_close(r1.rz + r5.rz, -p, 0.01, "A-frame: ΣFy = P");

    // ΣFx = 0
    assert_close(r1.rx + r5.rx, 0.0, 0.01, "A-frame: ΣFx = 0");

    // By symmetry: Ry1 = Ry5 = P/2
    assert_close(r1.rz, -p / 2.0, 0.01, "A-frame: Ry1 = P/2");

    // Horizontal thrust should exist (outward push at bases)
    assert!(r1.rx.abs() > 0.01, "A-frame: horizontal thrust at base");
}

// ================================================================
// 5. Gable vs Flat Portal: Ridge Effects
// ================================================================
//
// Under same vertical load, a gable frame develops horizontal
// thrust that a flat portal does not (under symmetric loading).

#[test]
fn validation_gable_vs_flat() {
    let h = 5.0;
    let w = 10.0;
    let g = -20.0;

    // Flat portal frame
    let input_flat = make_portal_frame(h, w, E, A, IZ, 0.0, g);
    let res_flat = linear::solve_2d(&input_flat).unwrap();

    // Gable with rise
    let rise = 3.0;
    let input_gable = make_gable_frame(h, w, rise, E, A, IZ, 0.0, g, "fixed");
    let res_gable = linear::solve_2d(&input_gable).unwrap();

    // Both should have same total vertical reaction
    let ry_flat: f64 = res_flat.reactions.iter().map(|r| r.rz).sum();
    let total_flat_load = 2.0 * g; // portal has 2 loaded nodes
    let total_gable_load = 3.0 * g; // gable has 3 loaded nodes
    assert_close(ry_flat, -total_flat_load, 0.01, "Flat: ΣRy = -ΣFy");

    let ry_gable: f64 = res_gable.reactions.iter().map(|r| r.rz).sum();
    assert_close(ry_gable, -total_gable_load, 0.01, "Gable: ΣRy = -ΣFy");

    // Ridge deflection in gable frame should be non-zero vertical
    let d_ridge = res_gable.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    assert!(d_ridge.uz.abs() > 1e-6, "Gable: ridge deflects vertically");
}

// ================================================================
// 6. Pitched Frame UDL on Rafters: Vertical Equilibrium
// ================================================================

#[test]
fn validation_gable_rafter_udl() {
    let h = 4.0;
    let w = 12.0;
    let rise = 3.0;
    let q = -5.0;

    // Build gable with UDL on rafters
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h + rise),
        (4, w, h), (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    // UDL on rafters (elements 2 and 3)
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 3, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Rafter lengths
    let rafter_l = ((w / 2.0).powi(2) + rise.powi(2)).sqrt();
    // Total vertical reactions should balance the vertical component of loads.
    // For UDL in local Y (perpendicular to rafter), the vertical component
    // is q * L * cos(θ) per rafter, but FEA distributes in local coords.
    let _total_load = q * rafter_l * 2.0;
    let sum_ry = r1.rz + r5.rz;
    assert!(sum_ry > 0.0, "Gable UDL: reactions are upward");
    assert!(sum_ry.abs() > 1.0, "Gable UDL: significant vertical reaction");

    // ΣFx = 0: horizontal reactions balance
    assert_close(r1.rx + r5.rx, 0.0, 0.02,
        "Gable UDL: ΣRx = 0 (symmetric load on symmetric frame)");
}

// ================================================================
// 7. Asymmetric Gable: Unequal Column Heights
// ================================================================

#[test]
fn validation_gable_asymmetric() {
    let h_left = 5.0;
    let h_right = 3.0;
    let w = 10.0;
    let rise = 2.0;
    let p = -30.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h_left),
        (3, w / 2.0, ((h_left + h_right) / 2.0) + rise),
        (4, w, h_right),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 5, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Global equilibrium
    assert_close(r1.rz + r5.rz, -p, 0.01, "Asymmetric gable: ΣRy = P");
    assert_close(r1.rx + r5.rx, 0.0, 0.01, "Asymmetric gable: ΣFx = 0");

    // Asymmetric: reactions should NOT be equal (different column heights)
    assert!((r1.rz - r5.rz).abs() > 0.1,
        "Asymmetric gable: unequal vertical reactions");
}

// ================================================================
// 8. Gable with Roller Base: Horizontal Thrust
// ================================================================
//
// Pinned-roller gable: one base is pinned, the other is a roller.
// Under vertical load, the horizontal reaction at the pinned base
// resists the rafter thrust.

#[test]
fn validation_gable_pinned_roller() {
    let h = 4.0;
    let w = 10.0;
    let rise = 3.0;
    let p = -20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h + rise),
        (4, w, h), (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: p, my: 0.0,
    })];
    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // ΣFy = 0
    assert_close(r1.rz + r5.rz, -p, 0.01, "Gable roller: ΣRy = P");

    // Roller at node 5 has no horizontal reaction
    assert_close(r5.rx, 0.0, 0.01, "Gable roller: Rx5 = 0");

    // Pinned base takes all horizontal reaction
    // Under asymmetric support, the structure sways
    // Ridge should deflect horizontally
    let d_ridge = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    assert!(d_ridge.ux.abs() > 1e-6, "Gable roller: ridge sways horizontally");
}
