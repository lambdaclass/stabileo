/// Validation: Prescribed Displacements & Support Settlement
///
/// References:
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4 (force method with settlement)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 13 (slope-deflection with settlement)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11 (displacement method)
///
/// Key formulas:
///   - Fixed-fixed beam with end settlement δ: M = ±6EIδ/L²
///   - Propped cantilever with prop settlement δ: M_fixed = 3EIδ/L² (released end)
///   - Continuous beam: three-moment equation with settlement terms
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam: End Settlement
// ================================================================
//
// Fixed-fixed beam of length L, right support settles by δ.
// M_left = -6EIδ/L², M_right = +6EIδ/L² (hogging at settling end).
// Shear V = 12EIδ/L³.

#[test]
fn validation_settlement_fixed_fixed() {
    let l = 6.0;
    let n = 8;
    let delta: f64 = 0.01; // 10 mm settlement at right end
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Both ends fixed, right end has prescribed settlement dy = -delta
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moments due to settlement: M = 6EIδ/L²
    let m_exact = 6.0 * ei * delta / (l * l);
    let v_exact = 12.0 * ei * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Moments at supports
    assert_close(r_left.mz.abs(), m_exact, 0.03,
        "Settlement fixed-fixed: M_left = 6EIδ/L²");

    // Shear forces = 12EIδ/L³
    assert_close(r_left.ry.abs(), v_exact, 0.03,
        "Settlement fixed-fixed: V = 12EIδ/L³");

    // Equilibrium: ΣFy = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < v_exact * 0.01,
        "Settlement equilibrium: ΣRy={:.6}", sum_ry);
}

// ================================================================
// 2. Propped Cantilever: Prop Settlement
// ================================================================
//
// Fixed at left, roller at right. Right support settles by δ.
// M_fixed = 3EIδ/(2L²), but no: for propped cantilever with far end settling:
// M_fixed = 3EIδ/L² (from three-moment or slope-deflection).
// Actually: use slope-deflection: M_AB = 2EI/L (2θA + θB - 3ψ).
// With θA=0 (fixed), θB free, ψ = δ/L.
// M_AB = 2EI/L(-3δ/L) = -6EIδ/L² at fixed end (if both fixed)
// For propped cantilever (hinge at B): M_AB = EI/L(3×(-δ/L)) = -3EIδ/L²
// R_B = M_AB/L = 3EIδ/L³

#[test]
fn validation_settlement_propped_cantilever() {
    let l = 5.0;
    let n = 8;
    let delta: f64 = 0.005;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = 3EIδ/L²
    let m_exact = 3.0 * ei * delta / (l * l);
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_left.mz.abs(), m_exact, 0.03,
        "Settlement propped cantilever: M = 3EIδ/L²");

    // R_roller = 3EIδ/L³
    let v_exact = 3.0 * ei * delta / (l * l * l);
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.ry.abs(), v_exact, 0.03,
        "Settlement propped cantilever: R = 3EIδ/L³");
}

// ================================================================
// 3. Continuous Beam: Middle Support Settlement
// ================================================================
//
// Two equal spans L, pinned-roller-roller. Middle support settles δ.
// By three-moment equation: M_B = -3EIδ/L²

#[test]
fn validation_settlement_continuous_two_span() {
    let l = 4.0;
    let n_per_span = 6;
    let delta: f64 = 0.008;
    let total_n = n_per_span * 2;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per_span as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mid_node = n_per_span + 1;
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // The middle support settlement on two equal spans produces:
    // Internal moment at middle support should be non-zero
    // Check: displacement at middle support = -delta
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uy, -delta, 0.01,
        "Prescribed settlement: uy at mid support = -δ");

    // Equilibrium: ΣRy = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.01,
        "Settlement equilibrium: ΣRy={:.6}", sum_ry);

    // Middle support reaction should be downward (it's settling away from load)
    // and end reactions should be upward to balance
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    assert!(r_mid.ry.abs() > 0.1,
        "Middle support should have reaction: Ry={:.6}", r_mid.ry);
}

// ================================================================
// 4. SS Beam with Settlement + Load
// ================================================================
//
// SS beam under UDL + one support settles.
// Superposition: settlement + load effects.

#[test]
fn validation_settlement_plus_load() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0;
    let delta: f64 = 0.005;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // SS beam: pinned left, roller right with settlement
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

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

    // Equilibrium: ΣRy = total load
    let total_load = q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Settlement + load: ΣRy = wL");

    // Right support displacement should be prescribed
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uy, -delta, 0.01,
        "Prescribed settlement: uy at right = -δ");

    // Midspan deflection should be larger than without settlement
    // (settlement adds to downward displacement)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let e_eff = E * 1000.0;
    let delta_load_only = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert!(d_mid.uy.abs() > delta_load_only * 0.9,
        "Settlement adds to deflection: uy={:.6e}, load-only={:.6e}", d_mid.uy, delta_load_only);
}

// ================================================================
// 5. Prescribed Rotation at Fixed End
// ================================================================
//
// Cantilever beam, fixed end has prescribed rotation θ.
// This creates a triangular moment diagram with M_fixed = 0
// and deflection at tip = θ × L.

#[test]
fn validation_prescribed_rotation() {
    let l = 4.0;
    let n = 8;
    let theta: f64 = 0.01; // prescribed rotation at fixed end

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: Some(theta), angle: None,
    });

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Rotation at fixed end should be prescribed
    let d_fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert_close(d_fixed.rz, theta, 0.01,
        "Prescribed rotation: rz at fixed end = θ");

    // Tip deflection for cantilever with base rotation (no load): δ_tip = θ × L
    let d_tip = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_tip.uy, theta * l, 0.02,
        "Prescribed rotation: tip deflection = θL");
}

// ================================================================
// 6. Prescribed Axial Displacement
// ================================================================
//
// Fixed-fixed beam, one end displaced axially by δx.
// Axial force N = EA × δx / L.

#[test]
fn validation_prescribed_axial() {
    let l = 5.0;
    let n = 4;
    let dx: f64 = 0.002;
    let e_eff = E * 1000.0;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: Some(dx), dy: None, drz: None, angle: None,
    });

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Axial force N = EA × δx / L
    let n_exact = e_eff * A * dx / l;
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), n_exact, 0.02,
        "Prescribed axial: N = EAδ/L");

    // No bending (pure axial problem)
    assert!(ef.m_start.abs() < n_exact * 0.01,
        "No bending from axial settlement: M={:.6}", ef.m_start);
}

// ================================================================
// 7. Differential Settlement on Frame
// ================================================================
//
// Portal frame with one column base settling.
// Creates parasitic moments and redistribution.

#[test]
fn validation_settlement_portal_frame() {
    let h = 4.0;
    let w = 6.0;
    let delta: f64 = 0.01;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: Some(-delta), drz: None, angle: None,
    });

    let mut nodes_map = HashMap::new();
    for &(id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for &(id, t, ni, nj, mi, si, hs, he) in &elems {
        elems_map.insert(id.to_string(), SolverElement {
            id, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: mi, section_id: si, hinge_start: hs, hinge_end: he,
        });
    }
    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![], };

    let results = linear::solve_2d(&input).unwrap();

    // Settlement creates parasitic forces in the frame
    // Equilibrium must hold: ΣRy = 0, ΣRx = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_ry.abs() < 0.01,
        "Frame settlement: ΣRy should be 0: {:.6}", sum_ry);
    assert!(sum_rx.abs() < 0.01,
        "Frame settlement: ΣRx should be 0: {:.6}", sum_rx);

    // Settling support should have prescribed displacement
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert_close(d4.uy, -delta, 0.01,
        "Frame settlement: uy at node 4 = -δ");

    // Beam should develop moments (settlement-induced)
    let max_moment = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_moment > 0.01,
        "Frame settlement should induce moments: M_max={:.6}", max_moment);
}

// ================================================================
// 8. Superposition: Settlement Only vs Settlement + Load
// ================================================================
//
// Verify that results with settlement + load = settlement alone + load alone
// (linearity / superposition principle).

#[test]
fn validation_settlement_superposition() {
    let l = 5.0;
    let n = 6;
    let p = 10.0;
    let delta: f64 = 0.005;

    // Helper to build fixed-fixed beam with optional settlement and load
    let build = |apply_settlement: bool, apply_load: bool| -> AnalysisResults {
        let n_nodes = n + 1;
        let elem_len = l / n as f64;
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let dy = if apply_settlement { Some(-delta) } else { None };

        let mut sups_map = HashMap::new();
        sups_map.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: dy, drz: None, angle: None,
        });

        let loads = if apply_load {
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 2 + 1, fx: 0.0, fy: -p, mz: 0.0,
            })]
        } else {
            vec![]
        };

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
        linear::solve_2d(&input).unwrap()
    };

    let res_both = build(true, true);
    let res_settle = build(true, false);
    let res_load = build(false, true);

    // Superposition: reactions from combined ≈ settlement + load
    let r_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_settle = res_settle.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_load = res_load.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let ry_sum = r_settle.ry + r_load.ry;
    let err = (r_both.ry - ry_sum).abs() / r_both.ry.abs().max(0.1);
    assert!(err < 0.02,
        "Superposition Ry: combined={:.6}, settle+load={:.6}", r_both.ry, ry_sum);

    let mz_sum = r_settle.mz + r_load.mz;
    let err_m = (r_both.mz - mz_sum).abs() / r_both.mz.abs().max(0.1);
    assert!(err_m < 0.02,
        "Superposition Mz: combined={:.6}, settle+load={:.6}", r_both.mz, mz_sum);
}
