/// Validation: Portal frames verified against slope-deflection method.
///
/// Reference: Ghali/Neville *Structural Analysis*, Chen/Lui *Stability Design*
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const EI: f64 = 20_000.0;

// ═══════════════════════════════════════════════════════════════
// 1. Simple Portal — Fixed Bases, Lateral Load
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_portal_lateral_load() {
    // Fixed-base portal: h=4, w=6, H=20 kN at top-left
    // Slope-deflection method: antisymmetric case
    // Base moments by slope-deflection (equal columns + beam):
    // Sway Δ from equilibrium: H + ΣV_base = 0
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;
    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: ΣRx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "portal lateral ΣRx");

    // ΣRy = 0 (no vertical load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.5, "portal lateral ΣRy={:.4}, expected ~0", sum_ry);

    // Both base moments should be nonzero (fixed bases resist sway)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.my.abs() > 5.0, "base moment 1 should be significant");
    assert!(r4.my.abs() > 5.0, "base moment 4 should be significant");

    // Sway should be positive (load direction)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.ux > 0.0, "sway should be positive");
}

#[test]
fn validation_portal_gravity_symmetric() {
    // Fixed-base portal with symmetric gravity loads → zero sway
    // q=20 kN/m on beam (element 2, from node 2 to node 3)
    let h = 4.0;
    let w = 6.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: -20.0, q_j: -20.0, a: None, b: None,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric → negligible sway (both top nodes move equally)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(
        (d2.ux - d3.ux).abs() < 1e-4,
        "symmetric portal: nodes 2,3 should have same ux ({:.8} vs {:.8})",
        d2.ux, d3.ux
    );

    // Equilibrium: total gravity = q*w = 120
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 20.0 * w, 0.01, "portal gravity ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 2. Pinned-Base Portal
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_portal_pinned_bases() {
    // Pinned-base portal: h=4, w=6, H=20
    // More flexible than fixed → larger sway
    let h = 4.0;
    let w = 6.0;
    let lateral = 20.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: lateral, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Base moments should be zero (pinned)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.my.abs() < 0.01, "pinned base: Mz_1 should be ~0");
    assert!(r4.my.abs() < 0.01, "pinned base: Mz_4 should be ~0");

    // Compare sway: pinned base should deflect more than fixed base
    let fixed_input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let fixed_results = linear::solve_2d(&fixed_input).unwrap();

    let sway_pinned = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let sway_fixed = fixed_results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    assert!(
        sway_pinned.abs() > sway_fixed.abs(),
        "pinned sway ({:.6}) should exceed fixed sway ({:.6})",
        sway_pinned, sway_fixed
    );

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.01, "pinned portal ΣRx");
}

// ═══════════════════════════════════════════════════════════════
// 3. Frame with Internal Hinge (Gerber beam)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_gerber_beam_hinge() {
    // Fixed-fixed beam L=10 with internal hinge at midspan
    // Hinge → M=0 at midspan, making the beam statically determinate
    let l = 10.0;
    let q = 10.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),  // hinge at end of elem 1
            (2, "frame", 2, 3, 1, 1, true, false),  // hinge at start of elem 2
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 1, q_i: -q, q_j: -q, a: None, b: None,
            }),
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: 2, q_i: -q, q_j: -q, a: None, b: None,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Moment at hinge (node 2) should be ~0
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef1.m_end.abs() < 1.0, "hinge: M_end_1={:.2}, should be ~0", ef1.m_end);
    assert!(ef2.m_start.abs() < 1.0, "hinge: M_start_2={:.2}, should be ~0", ef2.m_start);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "gerber ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 4. Prescribed Displacement (Settlement)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_fixed_fixed_settlement() {
    // Fixed-fixed beam L=10, end settlement δ₀=0.01m (4 elements for free DOFs)
    // M = 6EIδ/L² = 6*20000*0.01/100 = 12.0 kN·m at each end
    // V = 12EIδ/L³ = 12*20000*0.01/1000 = 2.4 kN
    let l = 10.0;
    let delta0 = 0.01;
    let n = 4;
    let elem_len = l / n as f64;

    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert((i + 1).to_string(), SolverNode {
            id: i + 1, x: i as f64 * elem_len, z: 0.0,
        });
    }
    let mut mats_map = std::collections::HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = std::collections::HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = std::collections::HashMap::new();
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups_map = std::collections::HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta0), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: std::collections::HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // M = 6EIδ/L² = 12.0 kN·m
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let expected_m = 6.0 * EI * delta0 / (l * l);
    assert_close(r1.my.abs(), expected_m, 0.05, "settlement M");

    // V = 12EIδ/L³ = 2.4 kN
    let expected_v = 12.0 * EI * delta0 / (l.powi(3));
    assert_close(r1.rz.abs(), expected_v, 0.05, "settlement V");
}

// ═══════════════════════════════════════════════════════════════
// 5. Spring Support
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_cantilever_tip_spring() {
    // Cantilever L=5, UDL q=10, tip spring ky=5000
    // Without spring: δ_tip = qL⁴/(8EI) = 10*625/(8*20000) = 0.0390625
    // With spring: δ = qL⁴/(8EI) * 1/(1 + ky*L³/(3EI))
    //            = 0.0390625 / (1 + 5000*125/60000) = 0.0390625 / 11.4167 ≈ 0.003421
    // Alternatively: δ = qL⁴/(8EI + 8*ky*L³/3)
    //
    // Exact: solve (K_beam + K_spring) * u = F
    // The spring adds ky to the tip DOF. We just check that deflection is reduced.
    let l = 5.0;
    let q = 10.0;
    let ky = 5000.0;
    let n = 8;

    // Build cantilever with spring at tip
    let elem_len = l / n as f64;
    let n_nodes = n + 1;
    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..n {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    // Build support map directly (spring support)
    let mut sups_map = std::collections::HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "spring".to_string(),
        kx: None, ky: Some(ky), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let mut nodes_map = std::collections::HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, z: *y });
    }
    let mut mats_map = std::collections::HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = std::collections::HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = std::collections::HashMap::new();
    for (id, _, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: "frame".to_string(),
            node_i: *ni, node_j: *nj, material_id: *mi, section_id: *si,
            hinge_start: *hs, hinge_end: *he,
        });
    }

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![],
        connectors: std::collections::HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Without spring: δ_free = qL⁴/(8EI) = 0.0390625
    let delta_free = q * l.powi(4) / (8.0 * EI);

    // With spring, tip deflection should be much smaller
    let tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert!(
        tip.uz.abs() < delta_free * 0.5,
        "spring should reduce deflection: δ={:.6}, free={:.6}",
        tip.uz.abs(), delta_free
    );
    assert!(tip.uz.abs() > 0.0, "tip should still deflect");
}

// ═══════════════════════════════════════════════════════════════
// 6. Symmetry Checks
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_symmetric_portal_reactions() {
    // Symmetric portal with symmetric load → symmetric reactions
    let h = 5.0;
    let w = 8.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fz: -50.0, my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3, fx: 0.0, fz: -50.0, my: 0.0,
            }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rz, r4.rz, 0.001, "symmetric Ry");
    // Moments should be equal in magnitude (same sign due to symmetry)
    assert_close(r1.my.abs(), r4.my.abs(), 0.001, "symmetric Mz");
}
