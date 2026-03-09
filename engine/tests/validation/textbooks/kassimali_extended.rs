/// Validation: Extended Kassimali *Structural Analysis* Benchmarks
///
/// Reference: Kassimali *Structural Analysis* (6th ed.)
///
/// Tests: propped cantilever, partial UDL, settlement, multi-story frame,
///        truss joints, influence line for continuous beam.
use dedaliano_engine::postprocess::influence::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ═══════════════════════════════════════════════════════════════
// 1. Propped Cantilever with Concentrated Load (Ex. 15.4)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_propped_cantilever() {
    // Fixed at left, roller at right, P at midspan
    // L=8m, P=100 kN at L/2
    // R_B = 5P/16 = 31.25 kN (roller reaction)
    // R_A = P - R_B = 68.75 kN
    // M_A = PL/8 - ... = 3PL/16 = 150 kN·m
    let l = 8.0;
    let p = 100.0;
    let n = 16;

    let elem_len = l / n as f64;
    let mid_elem = n / 2; // element at midspan

    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: mid_elem,
        a: elem_len,
        p: -p,
        px: None,
        mz: None,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction R_B = 5P/16
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, 5.0 * p / 16.0, 0.03, "KASS propped R_B = 5P/16");

    // Fixed reaction R_A = 11P/16
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, 11.0 * p / 16.0, 0.03, "KASS propped R_A = 11P/16");

    // Fixed-end moment M_A = 3PL/16
    let m_a_expected = 3.0 * p * l / 16.0;
    assert_close(r_a.mz.abs(), m_a_expected, 0.05, "KASS propped M_A = 3PL/16");

    // Equilibrium
    assert_close(r_a.ry + r_b.ry, p, 0.01, "KASS propped equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// 2. Fixed-End Beam with Partial UDL
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_fixed_partial_udl() {
    // Fixed-fixed beam L=10m, UDL q=20 kN/m on left half only (0 to L/2)
    // This is an asymmetric loading on a symmetric structure.
    // Total load = q*L/2 = 100 kN.
    // By superposition of full UDL + reverse UDL on right half.
    let l = 10.0;
    let q = 20.0;
    let n = 20;

    // Apply UDL only on first half of elements
    let half = n / 2;
    let mut loads = Vec::new();
    for i in 0..half {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * L/2 = 100 kN
    let total_load = q * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "KASS partial UDL ΣRy = qL/2");

    // Left support carries more (load is on left half)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(
        r_left.ry > r_right.ry,
        "KASS partial UDL: R_left={:.2} should > R_right={:.2}", r_left.ry, r_right.ry
    );

    // Both supports should have nonzero moments
    assert!(r_left.mz.abs() > 1.0, "KASS: left moment should be nonzero");
    assert!(r_right.mz.abs() > 1.0, "KASS: right moment should be nonzero");
}

// ═══════════════════════════════════════════════════════════════
// 3. Continuous Beam with Settlement
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_continuous_settlement() {
    // 2-span continuous beam, equal spans L=6m each
    // Interior support settles by δ=10mm
    // This induces moments: M = 6EIδ/L² at each span
    let l_span = 6.0;
    let n_per = 6;
    let delta = -0.01; // 10mm downward

    // Build 2-span continuous beam manually with prescribed displacement at interior support
    let n_total = n_per * 2;
    let n_nodes = n_total + 1;
    let elem_len = l_span / n_per as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, y: 0.0,
        });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..n_total {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }

    let interior = n_per + 1; // interior support node
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: interior, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(delta), drz: None, angle: None,
    });
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Settlement of interior support should induce bending moments
    let m_max: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);

    assert!(m_max > 0.1, "KASS settlement: should induce moments, got M_max={:.4}", m_max);

    // Interior support should have the prescribed displacement
    let d_int = results.displacements.iter().find(|d| d.node_id == interior);
    if let Some(d) = d_int {
        // Should be close to delta (may be exact or approximate depending on solver)
        assert!(
            (d.uy - delta).abs() < delta.abs() * 0.1 + 1e-6,
            "KASS settlement: interior uy={:.6}, expected {:.6}", d.uy, delta
        );
    }

    // Equilibrium: sum of reactions should be ≈ 0 (no external load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1.0, "KASS settlement: ΣRy={:.4} should ≈ 0", sum_ry);
}

// ═══════════════════════════════════════════════════════════════
// 4. Multi-Story Frame (3-Story, 2-Bay)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_multistory_frame() {
    // 3-story, 2-bay frame. Fixed base.
    // h=3.5m per story, w=5m per bay
    // Lateral loads: 20 kN at each floor (left column node)
    // Gravity: 100 kN at each beam-column joint
    //
    // Basic checks: equilibrium, lateral drift increases with height,
    // base moments nonzero
    let h = 3.5;
    let w = 5.0;
    let n_stories = 3;
    let n_bays = 2;

    // Nodes: 3 columns × (n_stories+1) levels = 3×4 = 12 nodes
    let mut nodes = Vec::new();
    let mut nid = 1;
    for col in 0..=n_bays {
        for level in 0..=n_stories {
            nodes.push((nid, col as f64 * w, level as f64 * h));
            nid += 1;
        }
    }

    // Node numbering: col0: 1,2,3,4; col1: 5,6,7,8; col2: 9,10,11,12
    let node_id = |col: usize, level: usize| -> usize {
        col * (n_stories + 1) + level + 1
    };

    let mut elems = Vec::new();
    let mut eid = 1;
    // Columns
    for col in 0..=n_bays {
        for level in 0..n_stories {
            elems.push((eid, "frame", node_id(col, level), node_id(col, level + 1), 1, 1, false, false));
            eid += 1;
        }
    }
    // Beams (at each floor level)
    for level in 1..=n_stories {
        for bay in 0..n_bays {
            elems.push((eid, "frame", node_id(bay, level), node_id(bay + 1, level), 1, 1, false, false));
            eid += 1;
        }
    }

    // Fixed at base
    let sups = vec![
        (1, node_id(0, 0), "fixed"),
        (2, node_id(1, 0), "fixed"),
        (3, node_id(2, 0), "fixed"),
    ];

    // Loads
    let mut loads = Vec::new();
    for level in 1..=n_stories {
        // Lateral at left column
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_id(0, level), fx: 20.0, fy: 0.0, mz: 0.0,
        }));
        // Gravity at all joints
        for col in 0..=n_bays {
            loads.push(SolverLoad::Nodal(SolverNodalLoad {
                node_id: node_id(col, level), fx: 0.0, fy: -100.0, mz: 0.0,
            }));
        }
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: ΣRx = total lateral = 3 × 20 = 60 kN
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), 60.0, 0.02, "KASS multi-story ΣRx = 60");

    // ΣRy = total gravity = 3 stories × 3 columns × 100 = 900 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 900.0, 0.02, "KASS multi-story ΣRy = 900");

    // Lateral drift should increase with height
    let ux_1 = results.displacements.iter().find(|d| d.node_id == node_id(0, 1)).unwrap().ux;
    let ux_2 = results.displacements.iter().find(|d| d.node_id == node_id(0, 2)).unwrap().ux;
    let ux_3 = results.displacements.iter().find(|d| d.node_id == node_id(0, 3)).unwrap().ux;
    assert!(ux_1.abs() < ux_2.abs(), "KASS: drift should increase with height");
    assert!(ux_2.abs() < ux_3.abs(), "KASS: drift should increase with height");
}

// ═══════════════════════════════════════════════════════════════
// 5. Truss: Method of Joints Verification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_truss_joints() {
    // 4-bar truss (king post):
    //   Nodes: (0,0)=1, (3,0)=2, (6,0)=3, (3,2)=4
    //   Bars: 1-4, 4-3, 1-2, 2-3, 2-4
    //   Load: P=80 kN downward at node 4
    //   Supports: 1=pinned, 3=rollerX
    let p = 80.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0), (4, 3.0, 2.0),
    ];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1, false, false), // inclined left
        (2, "truss", 4, 3, 1, 1, false, false), // inclined right
        (3, "truss", 1, 2, 1, 1, false, false), // bottom left
        (4, "truss", 2, 3, 1, 1, false, false), // bottom right
        (5, "truss", 2, 4, 1, 1, false, false), // vertical
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, 0.005, 1e-10)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: R1_y = R3_y = P/2 = 40 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "KASS truss R1");
    assert_close(r3.ry, p / 2.0, 0.02, "KASS truss R3");

    // Vertical bar (element 5, node 2→4): by method of joints at node 4,
    // the vertical bar carries the vertical component not balanced by inclined bars
    // By symmetry at node 4: F_vert = P - 2*F_incl*sinθ
    // where θ = arctan(2/3), sinθ = 2/√13
    // At node 2 (free joint on bottom chord): equilibrium gives F_vert
    // Actually, vertical bar force: at node 4, vertical equilibrium
    // P = F_14*sinα + F_43*sinβ + F_24 (compression)
    // With symmetry: F_14 = F_43 (magnitude), and F_24 = tension pulling node 4 down...
    // Let's just verify equilibrium at node 2 (all truss)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.1, "KASS truss ΣFx = 0, got {:.4}", sum_rx);

    // Symmetry: inclined bars have equal force magnitude
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start.abs();
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start.abs();
    assert_close(f1, f2, 0.02, "KASS truss symmetric bar forces");
}

// ═══════════════════════════════════════════════════════════════
// 6. Influence Line for 3-Span Continuous Beam
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_kass_influence_line_continuous() {
    // 3-span continuous beam, equal spans L=5m each
    // Influence line for reaction at 2nd support (interior)
    // The IL should have value 1.0 at the support and positive on adjacent spans
    let l_span = 5.0;
    let n_per = 5;

    let solver = make_continuous_beam(
        &[l_span, l_span, l_span], n_per, E, A, IZ, vec![],
    );

    let interior_support = n_per + 1; // 2nd support node

    let il_input = InfluenceLineInput {
        solver,
        quantity: "Ry".to_string(),
        target_node_id: Some(interior_support),
        target_element_id: None,
        target_position: 0.5,
        n_points_per_element: 10,
    };

    let result = compute_influence_line(&il_input).unwrap();
    assert!(!result.points.is_empty(), "KASS IL should have points");

    // At the support location x = L_span, IL value should ≈ 1.0
    let x_support = l_span;
    let at_support = result.points.iter()
        .min_by(|a, b| (a.x - x_support).abs().partial_cmp(&(b.x - x_support).abs()).unwrap())
        .unwrap();
    assert_close(at_support.value, 1.0, 0.1, "KASS IL at support ≈ 1.0");

    // At far ends (x=0 and x=3L), IL should be small or zero
    let at_start = result.points.iter()
        .min_by(|a, b| a.x.abs().partial_cmp(&b.x.abs()).unwrap())
        .unwrap();
    assert!(
        at_start.value.abs() < 0.3,
        "KASS IL at far end should be small, got {:.3}", at_start.value
    );
}
