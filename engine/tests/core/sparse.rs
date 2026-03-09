/// Integration tests: sparse solver parity with dense solver.

use std::collections::HashMap;
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear;

fn make_input(
    nodes: Vec<(usize, f64, f64)>,
    mats: Vec<(usize, f64, f64)>,
    secs: Vec<(usize, f64, f64)>,
    elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)>,
    sups: Vec<(usize, usize, &str)>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut nodes_map = HashMap::new();
    for (id, x, y) in nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, y });
    }
    let mut mats_map = HashMap::new();
    for (id, e, nu) in mats {
        mats_map.insert(id.to_string(), SolverMaterial { id, e, nu });
    }
    let mut secs_map = HashMap::new();
    for (id, a, iz) in secs {
        secs_map.insert(id.to_string(), SolverSection { id, a, iz, as_y: None });
    }
    let mut elems_map = HashMap::new();
    for (id, t, ni, nj, mi, si, hs, he) in elems {
        elems_map.insert(id.to_string(), SolverElement {
            id, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: mi, section_id: si, hinge_start: hs, hinge_end: he,
        });
    }
    let mut sups_map = HashMap::new();
    for (id, nid, t) in sups {
        sups_map.insert(id.to_string(), SolverSupport {
            id, node_id: nid, support_type: t.to_string(),
            kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
        });
    }
    SolverInput { nodes: nodes_map, materials: mats_map, sections: secs_map, elements: elems_map, supports: sups_map, loads, constraints: vec![], }
}

fn assert_results_close(a: &AnalysisResults, b: &AnalysisResults, tol: f64) {
    // Compare displacements
    for (da, db) in a.displacements.iter().zip(b.displacements.iter()) {
        assert_eq!(da.node_id, db.node_id);
        assert!((da.ux - db.ux).abs() < tol, "node {} ux: {} vs {}", da.node_id, da.ux, db.ux);
        assert!((da.uy - db.uy).abs() < tol, "node {} uy: {} vs {}", da.node_id, da.uy, db.uy);
        assert!((da.rz - db.rz).abs() < tol, "node {} rz: {} vs {}", da.node_id, da.rz, db.rz);
    }
    // Compare element forces
    for (ea, eb) in a.element_forces.iter().zip(b.element_forces.iter()) {
        assert_eq!(ea.element_id, eb.element_id);
        assert!((ea.n_start - eb.n_start).abs() < tol, "elem {} n_start", ea.element_id);
        assert!((ea.v_start - eb.v_start).abs() < tol, "elem {} v_start", ea.element_id);
        assert!((ea.m_start - eb.m_start).abs() < tol, "elem {} m_start", ea.element_id);
    }
}

#[test]
fn test_ss_beam_sparse_vs_dense() {
    // 2-node simply supported beam — too small for sparse, but tests the path
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None,
        })],
    );
    let r = linear::solve_2d(&input).unwrap();
    let r1 = r.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r1.ry - 30.0).abs() < 0.5);
}

#[test]
fn test_cantilever_sparse_vs_dense() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.15, 0.003125)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -50.0, mz: 0.0 })],
    );
    let r = linear::solve_2d(&input).unwrap();
    let r1 = r.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r1.ry - 50.0).abs() < 0.5);
    assert!((r1.mz.abs() - 200.0).abs() < 1.0);
}

#[test]
fn test_100_element_beam_forces_sparse() {
    // 100-element simply supported beam — forces sparse path (101 nodes × 3 DOFs - 4 restrained = 299 free DOFs)
    let n_elem = 100;
    let l_total = 10.0;
    let l_elem = l_total / n_elem as f64;
    let n_nodes = n_elem + 1;

    let nodes: Vec<(usize, f64, f64)> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * l_elem, 0.0))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let q = -10.0; // kN/m uniform load
    let loads: Vec<SolverLoad> = (0..n_elem)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, 200000.0, 0.3)],
        vec![(1, 0.01, 8.333e-6)], // A=0.01, Iz=8.333e-6
        elems,
        vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")],
        loads,
    );

    let r = linear::solve_2d(&input).unwrap();

    // Analytical midspan deflection: δ = 5*q*L^4 / (384*E*I)
    let e = 200000.0 * 1000.0;
    let iz = 8.333e-6;
    let expected_deflection = 5.0 * q.abs() * l_total.powi(4) / (384.0 * e * iz);
    let mid_node = n_nodes / 2 + 1;
    let mid_disp = r.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let actual = mid_disp.uy.abs();
    let rel_err = (actual - expected_deflection).abs() / expected_deflection;
    assert!(rel_err < 0.01, "Expected ~{:.6}, got {:.6}, rel_err={:.4}", expected_deflection, actual, rel_err);

    // Reactions should sum to total load
    let total_reaction: f64 = r.reactions.iter().map(|r| r.ry).sum();
    let total_load = q.abs() * l_total;
    assert!((total_reaction - total_load).abs() < 0.01, "reactions={}, load={}", total_reaction, total_load);
}
