/// Validation: Initial Imperfections Module
///
/// References:
///   - AISC 360-22, Appendix 1: notional load = 0.002Yi per story
///   - EN 1993-1-1, 5.3.2: equivalent geometric imperfections
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2
///
/// Tests verify:
///   1. Geometric imperfection offsets node coordinates
///   2. Notional loads 2D: lateral = ratio x gravity
///   3. Notional loads 3D: correct direction mapping
///   4. Cantilever with offset produces moment at base
///   5. Notional load direction axis selection
///   6. Zero imperfection leaves model unchanged
///   7. Multiple node imperfections applied correctly
///   8. Notional load sums gravity from multiple loads
use dedaliano_engine::solver::imperfections;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. Geometric Imperfection Offsets Node Coordinates
// ================================================================
//
// Apply dx=0.01, dy=0.02 to a node and verify coordinates change.

#[test]
fn validation_geometric_imperfection_offsets_node() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "rollerX")],
        vec![],
    );

    let imperfections = vec![
        NodeImperfection { node_id: 2, dx: 0.01, dy: 0.02, dz: 0.0 },
    ];

    imperfections::apply_geometric_imperfections_2d(&mut input, &imperfections);

    let node2 = input.nodes.values().find(|n| n.id == 2).unwrap();
    assert_close(node2.x, 5.01, 1e-6, "Node 2 x offset");
    assert_close(node2.z, 0.02, 1e-6, "Node 2 y offset");

    // Node 1 should be unchanged
    let node1 = input.nodes.values().find(|n| n.id == 1).unwrap();
    assert_close(node1.x, 0.0, 1e-6, "Node 1 x unchanged");
    assert_close(node1.z, 0.0, 1e-6, "Node 1 y unchanged");
}

// ================================================================
// 2. Notional Loads 2D: Lateral = Ratio x Gravity Force
// ================================================================
//
// A node with Fy = -100 kN gravity, ratio = 0.005 (1/200):
// Notional lateral = 0.005 * 100 = 0.5 kN in direction X.

#[test]
fn validation_notional_loads_2d_basic() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 5.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -100.0, my: 0.0,
        })],
    );

    let notional = NotionalLoadDef {
        ratio: 0.005,
        direction: 0, // X
        gravity_axis: 1, // Y
    };

    let loads = imperfections::notional_loads_2d(&input, &notional);
    assert_eq!(loads.len(), 1, "Should produce one notional load");

    if let SolverLoad::Nodal(nl) = &loads[0] {
        assert_eq!(nl.node_id, 2);
        // lateral = 0.005 * |−100| = 0.5
        assert_close(nl.fx, 0.5, 1e-6, "Notional fx = ratio * |gravity|");
        assert_close(nl.fz, 0.0, 1e-6, "Notional fy = 0 (lateral in X)");
    } else {
        panic!("Expected nodal load");
    }
}

// ================================================================
// 3. Notional Loads 3D: Correct Direction Mapping
// ================================================================
//
// 3D model with gravity in Y, notional load in X direction.

#[test]
fn validation_notional_loads_3d_direction() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ, IZ, 1e-5)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -200.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let notional = NotionalLoadDef {
        ratio: 0.005,
        direction: 0, // X
        gravity_axis: 1, // Y
    };

    let loads = imperfections::notional_loads_3d(&input, &notional);
    assert_eq!(loads.len(), 1, "Should produce one 3D notional load");

    if let SolverLoad3D::Nodal(nl) = &loads[0] {
        assert_eq!(nl.node_id, 2);
        // lateral = 0.005 * 200 = 1.0 in X
        assert_close(nl.fx, 1.0, 1e-6, "3D notional fx");
        assert_close(nl.fy, 0.0, 1e-6, "3D notional fy = 0");
        assert_close(nl.fz, 0.0, 1e-6, "3D notional fz = 0");
    } else {
        panic!("Expected 3D nodal load");
    }
}

// ================================================================
// 4. Imperfection + Linear Solve: Offset Changes Structural Response
// ================================================================
//
// Horizontal cantilever, length L=4m, fixed at node 1. Tip load P=-50 kN
// (downward at node 5). Apply geometric imperfection to offset all
// intermediate nodes in Y by a bow of L/200 = 0.02 m at midspan.
// Compare tip deflection with and without imperfection: the offset
// geometry should yield a different (larger) tip displacement due
// to the changed element orientations affecting stiffness assembly.

#[test]
fn validation_imperfection_changes_response() {
    let n = 4;
    let l = 4.0;
    let p = -50.0;

    // Helper to build the cantilever
    let build = || {
        let nodes: Vec<_> = (0..=n).map(|i| {
            (i + 1, i as f64 * l / n as f64, 0.0)
        }).collect();
        let elems: Vec<_> = (0..n).map(|i| {
            (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)
        }).collect();
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: p, my: 0.0,
        })];
        make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, IZ)],
            elems,
            vec![(1, 1, "fixed")],
            loads,
        )
    };

    // Baseline: no imperfection
    let input_clean = build();
    let res_clean = linear::solve_2d(&input_clean).unwrap();
    let tip_clean = res_clean.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // With imperfection: bow-shaped offset at interior nodes
    let mut input_imp = build();
    let bow = l / 200.0; // 0.02 m
    let imps: Vec<NodeImperfection> = (2..=n).map(|i| {
        // Parabolic bow: max at midspan
        let xi = (i - 1) as f64 / n as f64;
        let dy = 4.0 * bow * xi * (1.0 - xi);
        NodeImperfection { node_id: i, dx: 0.0, dy: dy, dz: 0.0 }
    }).collect();
    imperfections::apply_geometric_imperfections_2d(&mut input_imp, &imps);
    let res_imp = linear::solve_2d(&input_imp).unwrap();
    let tip_imp = res_imp.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // The imperfection should change the response; tip deflections differ
    let diff_uy = (tip_imp.uz - tip_clean.uz).abs();
    assert!(
        diff_uy > 1e-8,
        "Imperfection should alter tip deflection: clean_uy={:.8}, imp_uy={:.8}",
        tip_clean.uz, tip_imp.uz
    );

    // Also verify the imperfected model still satisfies equilibrium:
    // sum of vertical reactions = applied vertical load
    let sum_ry: f64 = res_imp.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -p, 0.01, "Vertical equilibrium after imperfection");
}

// ================================================================
// 5. Notional Load Direction: Test Y-Direction
// ================================================================
//
// With direction=1 (Y), the notional load should appear in fy, not fx.
// gravity_axis=0 (X), so gravity is collected from fx.

#[test]
fn validation_notional_load_y_direction() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: -50.0, fz: 0.0, my: 0.0,
        })],
    );

    let notional = NotionalLoadDef {
        ratio: 0.01,
        direction: 1, // Y direction
        gravity_axis: 0, // gravity collected from X axis
    };

    let loads = imperfections::notional_loads_2d(&input, &notional);
    assert_eq!(loads.len(), 1);

    if let SolverLoad::Nodal(nl) = &loads[0] {
        // lateral = 0.01 * |-50| = 0.5 in Y
        assert_close(nl.fx, 0.0, 1e-6, "No force in X for Y-direction notional");
        assert_close(nl.fz, 0.5, 1e-6, "Notional fy = ratio * |gravity_x|");
    } else {
        panic!("Expected nodal load");
    }
}

// ================================================================
// 6. Zero Imperfection: No Change to Model
// ================================================================
//
// Applying zero offsets should leave node coordinates unchanged.

#[test]
fn validation_zero_imperfection_no_change() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 3.0, 4.0), (3, 6.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![],
    );

    // Save original coordinates
    let orig: Vec<(usize, f64, f64)> = input.nodes.values()
        .map(|n| (n.id, n.x, n.z))
        .collect();

    let imperfections = vec![
        NodeImperfection { node_id: 1, dx: 0.0, dy: 0.0, dz: 0.0 },
        NodeImperfection { node_id: 2, dx: 0.0, dy: 0.0, dz: 0.0 },
        NodeImperfection { node_id: 3, dx: 0.0, dy: 0.0, dz: 0.0 },
    ];

    imperfections::apply_geometric_imperfections_2d(&mut input, &imperfections);

    for (id, ox, oy) in &orig {
        let node = input.nodes.values().find(|n| n.id == *id).unwrap();
        assert_close(node.x, *ox, 1e-12, &format!("Node {} x unchanged", id));
        assert_close(node.z, *oy, 1e-12, &format!("Node {} y unchanged", id));
    }
}

// ================================================================
// 7. Multiple Node Imperfections: All Nodes Offset Correctly
// ================================================================
//
// Apply different offsets to multiple nodes and verify each one.

#[test]
fn validation_multiple_node_imperfections() {
    let mut input = make_3d_input(
        vec![
            (1, 0.0, 0.0, 0.0),
            (2, 5.0, 0.0, 0.0),
            (3, 10.0, 0.0, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ, IZ, 1e-5)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![
            (1, vec![true, true, true, true, true, true]),
            (3, vec![true, true, true, true, true, true]),
        ],
        vec![],
    );

    let imperfections = vec![
        NodeImperfection { node_id: 1, dx: 0.001, dy: 0.0,   dz: 0.0 },
        NodeImperfection { node_id: 2, dx: 0.005, dy: 0.010, dz: -0.002 },
        NodeImperfection { node_id: 3, dx: 0.0,   dy: 0.003, dz: 0.007 },
    ];

    imperfections::apply_geometric_imperfections_3d(&mut input, &imperfections);

    let n1 = input.nodes.values().find(|n| n.id == 1).unwrap();
    assert_close(n1.x, 0.001, 1e-12, "Node 1 x");
    assert_close(n1.y, 0.0, 1e-12, "Node 1 y");
    assert_close(n1.z, 0.0, 1e-12, "Node 1 z");

    let n2 = input.nodes.values().find(|n| n.id == 2).unwrap();
    assert_close(n2.x, 5.005, 1e-12, "Node 2 x");
    assert_close(n2.y, 0.010, 1e-12, "Node 2 y");
    assert_close(n2.z, -0.002, 1e-12, "Node 2 z");

    let n3 = input.nodes.values().find(|n| n.id == 3).unwrap();
    assert_close(n3.x, 10.0, 1e-12, "Node 3 x");
    assert_close(n3.y, 0.003, 1e-12, "Node 3 y");
    assert_close(n3.z, 0.007, 1e-12, "Node 3 z");
}

// ================================================================
// 8. Notional Loads with Multiple Gravity Loads: Summation
// ================================================================
//
// Two nodal loads on the same node should be summed before
// computing the notional lateral. Two different nodes each get
// their own notional load.
//
// Node 2: Fy = -80 + (-20) = -100 => lateral = 0.005 * 100 = 0.5
// Node 3: Fy = -60              => lateral = 0.005 * 60  = 0.3

#[test]
fn validation_notional_load_multiple_gravity() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 0.0, 8.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -80.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -20.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -60.0, my: 0.0 }),
        ],
    );

    let notional = NotionalLoadDef {
        ratio: 0.005,
        direction: 0, // X
        gravity_axis: 1, // Y
    };

    let loads = imperfections::notional_loads_2d(&input, &notional);
    assert_eq!(loads.len(), 2, "Two nodes with gravity => two notional loads");

    // Collect notional loads by node_id
    let mut by_node = std::collections::HashMap::new();
    for load in &loads {
        if let SolverLoad::Nodal(nl) = load {
            by_node.insert(nl.node_id, nl);
        }
    }

    // Node 2: gravity = -80 + (-20) = -100, lateral = 0.005 * 100 = 0.5
    let nl2 = by_node.get(&2).expect("Notional load for node 2");
    assert_close(nl2.fx, 0.5, 1e-6, "Node 2 notional fx = 0.005 * 100");
    assert_close(nl2.fz, 0.0, 1e-6, "Node 2 notional fy = 0");

    // Node 3: gravity = -60, lateral = 0.005 * 60 = 0.3
    let nl3 = by_node.get(&3).expect("Notional load for node 3");
    assert_close(nl3.fx, 0.3, 1e-6, "Node 3 notional fx = 0.005 * 60");
    assert_close(nl3.fz, 0.0, 1e-6, "Node 3 notional fy = 0");
}
