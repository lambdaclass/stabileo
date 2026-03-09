/// Validation: Foundation & Soil-Structure Interaction
///
/// References:
///   - Bowles, "Foundation Analysis and Design", 5th Ed., Ch. 9
///   - Hetényi, "Beams on Elastic Foundation", Dover
///   - Winkler model: p = k × y (spring foundation)
///   - Eurocode 7 (EN 1997): Geotechnical design
///
/// Tests verify soil-structure interaction concepts:
///   1. Beam on elastic foundation: Winkler model deflection
///   2. Foundation spring stiffness effect
///   3. Mat foundation: multiple springs
///   4. Rigid foundation: very stiff springs
///   5. Point load on Winkler beam: localized deflection
///   6. Stiff beam on springs: uniform deflection
///   7. Foundation settlement with spring support
///   8. Mixed foundation: springs + fixed supports
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Beam on Elastic Foundation: Central Load
// ================================================================
//
// Beam on springs (Winkler model) with central point load.
// The beam should deflect and the springs distribute the reaction.

#[test]
fn validation_foundation_winkler_central_load() {
    let l = 10.0;
    let n = 10;
    let p = 20.0;
    let k_spring = 500.0; // spring stiffness at each node (kN/m)

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Springs at every node
    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let node_id = i + 1;
        // First node also has horizontal restraint
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id,
            support_type: "spring".to_string(),
            kx, ky: Some(k_spring), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Deflection at center should be maximum
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uy < 0.0, "Winkler: center deflects down: {:.6e}", d_mid.uy);

    // End nodes should deflect less than center
    let d_end = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_end.uy.abs() < d_mid.uy.abs(),
        "Winkler: end deflects less: {:.6e} < {:.6e}", d_end.uy.abs(), d_mid.uy.abs());

    // Total spring reaction should equal applied load
    let total_reaction: f64 = results.displacements.iter()
        .map(|d| d.uy.abs() * k_spring)
        .sum();
    assert_close(total_reaction, p, 0.05,
        "Winkler: total spring reaction = P");
}

// ================================================================
// 2. Spring Stiffness Effect: Softer Soil = More Deflection
// ================================================================
//
// Same beam, different spring stiffness. Softer springs → more deflection.

#[test]
fn validation_foundation_stiffness_effect() {
    let l = 8.0;
    let n = 8;
    let p = 10.0;

    let get_max_deflection = |k: f64| -> f64 {
        let n_nodes = n + 1;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let mut sups_map = HashMap::new();
        for i in 0..n_nodes {
            let kx = if i == 0 { Some(1e10) } else { None };
            sups_map.insert((i + 1).to_string(), SolverSupport {
                id: i + 1, node_id: i + 1,
                support_type: "spring".to_string(),
                kx, ky: Some(k), kz: None,
                dx: None, dy: None, drz: None, angle: None,
            });
        }

        let mid = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })];

        let mut nodes_map = HashMap::new();
        for (id, x, y) in &nodes {
            nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
        }
        let mut mats_map = HashMap::new();
        mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
        let mut secs_map = HashMap::new();
        secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
        let mut elems_map = HashMap::new();
        for (id, t, ni, nj, mi, si, hs, he) in &elems {
            elems_map.insert(id.to_string(), SolverElement {
                id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
                material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
            });
        }
        let input = SolverInput {
            nodes: nodes_map, materials: mats_map, sections: secs_map,
            elements: elems_map, supports: sups_map, loads, constraints: vec![], };

        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs()
    };

    let d_soft = get_max_deflection(100.0);
    let d_stiff = get_max_deflection(10000.0);

    assert!(d_soft > d_stiff,
        "Soft soil → more deflection: {:.6e} > {:.6e}", d_soft, d_stiff);
}

// ================================================================
// 3. Very Stiff Springs: Approaches Fixed Support
// ================================================================
//
// With very stiff springs, the beam approaches fixed-end behavior.
// Deflection approaches zero (rigid foundation).

#[test]
fn validation_foundation_rigid_limit() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Very stiff springs (1e8 kN/m)
    let k = 1e8;
    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let kx = if i == 0 { Some(k) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: i + 1,
            support_type: "spring".to_string(),
            kx, ky: Some(k), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Deflection should be very small (rigid foundation)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uy.abs() < 1e-5,
        "Rigid foundation: uy should be ≈ 0: {:.6e}", d_mid.uy);
}

// ================================================================
// 4. UDL on Winkler Beam: Symmetric Deflection
// ================================================================
//
// Beam on springs under uniform distributed load.
// Deflection should be symmetric about midspan.

#[test]
fn validation_foundation_winkler_udl_symmetric() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -5.0;
    let k = 500.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: i + 1,
            support_type: "spring".to_string(),
            kx, ky: Some(k), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Symmetry check
    let mid = n / 2 + 1;
    for i in 1..mid {
        let d_left = results.displacements.iter().find(|d| d.node_id == i + 1).unwrap().uy;
        let d_right = results.displacements.iter().find(|d| d.node_id == n + 1 - i).unwrap().uy;
        let err = (d_left - d_right).abs() / d_left.abs().max(1e-10);
        assert!(err < 0.02,
            "Winkler UDL symmetry: node {}: {:.6e}, node {}: {:.6e}",
            i + 1, d_left, n + 1 - i, d_right);
    }
}

// ================================================================
// 5. Point Load: Localized Deflection
// ================================================================
//
// Point load on beam on springs: deflection should be localized
// near the load point, decreasing away from it.

#[test]
fn validation_foundation_localized_deflection() {
    let l = 12.0;
    let n = 12;
    let p = 20.0;
    let k = 200.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: i + 1,
            support_type: "spring".to_string(),
            kx, ky: Some(k), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    // Load at 1/4 span
    let load_node = n / 4 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Deflection at load point should be maximum
    let d_load = results.displacements.iter().find(|d| d.node_id == load_node).unwrap().uy.abs();

    // Deflection at far end should be much less
    let d_far = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap().uy.abs();
    assert!(d_far < d_load * 0.5,
        "Localized: d_far < d_load: {:.6e} < {:.6e}", d_far, d_load);
}

// ================================================================
// 6. Spring + Fixed Support: Mixed Boundary
// ================================================================
//
// Beam with fixed support at one end and spring at the other.
// Spring takes some reaction, fixed takes the rest.

#[test]
fn validation_foundation_mixed_boundary() {
    let l = 6.0;
    let n = 8;
    let p = 10.0;
    let k = 1000.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    // Fixed at left
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1,
        support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    // Spring at right
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes,
        support_type: "spring".to_string(),
        kx: None, ky: Some(k), kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Fixed support reaction
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_fixed.ry > 0.0, "Fixed support takes upward reaction: {:.4}", r_fixed.ry);

    // Spring support: reaction = k × uy at that node
    let d_spring = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap().uy;
    let r_spring = -k * d_spring; // spring force = -k * displacement
    assert!(r_spring > 0.0, "Spring takes positive reaction: {:.4}", r_spring);

    // Total reaction ≈ P
    let total = r_fixed.ry + r_spring;
    assert_close(total, p, 0.05,
        "Mixed boundary: total reaction = P");
}

// ================================================================
// 7. Stiff Beam on Springs: Uniform Settlement
// ================================================================
//
// Very stiff beam (large EI) on uniform springs under UDL.
// All springs should compress approximately equally (rigid body translation).

#[test]
fn validation_foundation_stiff_beam_uniform() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;
    let k = 500.0;
    let iz_stiff = 1.0; // very large moment of inertia

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: i + 1,
            support_type: "spring".to_string(),
            kx, ky: Some(k), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: iz_stiff, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // All nodes should have approximately equal vertical displacement
    let disps: Vec<f64> = results.displacements.iter().map(|d| d.uy).collect();
    let avg = disps.iter().sum::<f64>() / disps.len() as f64;
    let max_dev = disps.iter().map(|&d| (d - avg).abs()).fold(0.0_f64, f64::max);

    assert!(max_dev < avg.abs() * 0.15,
        "Stiff beam: uniform settlement. avg={:.6e}, max_dev={:.6e}",
        avg, max_dev);
}

// ================================================================
// 8. Foundation Equilibrium
// ================================================================
//
// Total spring reactions must equal total applied load.

#[test]
fn validation_foundation_equilibrium() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -8.0;
    let p = 15.0;
    let k = 300.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    for i in 0..n_nodes {
        let kx = if i == 0 { Some(1e10) } else { None };
        sups_map.insert((i + 1).to_string(), SolverSupport {
            id: i + 1, node_id: i + 1,
            support_type: "spring".to_string(),
            kx, ky: Some(k), kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    let mid = n / 2 + 1;
    let mut loads = Vec::new();
    // UDL + point load
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    }));

    let mut nodes_map = HashMap::new();
    for (id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id: *id, x: *x, y: *y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id: *id, elem_type: t.to_string(), node_i: *ni, node_j: *nj,
            material_id: *mi, section_id: *si, hinge_start: *hs, hinge_end: *he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads, constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Total spring reactions = total load
    let total_load = q.abs() * l + p;
    let total_reaction: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_reaction, total_load, 0.05,
        "Foundation equilibrium: ΣR = total load");
}
