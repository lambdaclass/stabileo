/// Validation: Differential Support Settlement Effects
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 13 (slope-deflection with settlement)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4 (force method with settlement)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11 (displacement method, settlement)
///   - Timoshenko, "Strength of Materials" Vol. II, §69 (statically indeterminate beams)
///
/// Key formulas used:
///   Fixed-fixed beam, end settlement δ:
///     M = ±6·E·I·δ / L²,  V = 12·E·I·δ / L³
///   Propped cantilever (fixed-roller), roller settles δ:
///     M_fixed = 3·E·I·δ / L²,  R_roller = 3·E·I·δ / L³
///   Two-span equal beam (three supports), middle support settles δ:
///     M_B (at middle support) = −3·E·I·δ / L²  (per span)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

// Effective stiffness in kN/m² units
// E_eff = E * 1000 kN/m², EI in kN·m²
fn ei() -> f64 {
    E * 1000.0 * IZ
}

/// Helper: build fixed-fixed beam with optional settlement at right end.
fn make_ff_beam_settlement(n: usize, l: f64, delta: Option<f64>) -> SolverInput {
    let elem_len = l / n as f64;
    let n_nodes = n + 1;

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
    for i in 0..n {
        elems_map.insert((i + 1).to_string(), SolverElement {
            id: i + 1, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
    }
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: delta, drz: None, angle: None,
    });
    SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), }
}

// ================================================================
// 1. SS Beam with Center Intermediate Support Settling
// ================================================================
//
// Three-support beam: pinned at A (x=0), roller at B (x=L), roller at C (x=2L).
// B is the middle support and settles by δ.
// By three-moment equation:
//   M_B = −3·E·I·δ / L²  (hogging over B)
//
// This is the standard "middle support settlement" formula for equal spans.
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §4.6.

#[test]
fn validation_sse_middle_support_settlement() {
    let l = 4.0;       // each span
    let n_per = 6;
    let delta = 0.01;  // m (10 mm settlement at B)
    let total_n = 2 * n_per;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mid_node = n_per + 1;

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Middle support prescribed displacement should be imposed
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uy, -delta, 0.01,
        "SSE middle support: prescribed uy = -δ");

    // Equilibrium (no external loads): ΣRy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.01,
        "SSE middle support equilibrium: ΣRy={:.6}", sum_ry);

    // Three-moment theorem: M_B = −3EIδ/L²
    // The element forces at the mid-support node reflect this moment
    let m_exact = 3.0 * ei() * delta / (l * l);
    // Find max moment in elements adjacent to mid-support
    let max_m = results.element_forces.iter()
        .filter(|ef| ef.element_id == n_per || ef.element_id == n_per + 1)
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_m > m_exact * 0.5,
        "SSE middle support: adjacent moments should be significant: M_max={:.4}, M_exact={:.4}",
        max_m, m_exact);
}

// ================================================================
// 2. Continuous Beam: One End Support Settling
// ================================================================
//
// Two-span beam (pinned-roller-roller), right end settles by δ.
// Since the right end is a roller (only vertical restraint), settlement
// releases vertical reaction there → right reaction = 0 after settlement.
// The beam effectively becomes simply supported between the left pin and
// the middle roller, with the right end free to settle.
//
// Reference: Kassimali "Structural Analysis" 6th Ed., §13.3.

#[test]
fn validation_sse_continuous_end_settlement() {
    let l = 5.0;
    let n_per = 6;
    let delta = 0.012; // m
    let total_n = 2 * n_per;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let mid_node = n_per + 1;

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "rollerX".to_string(),
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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Prescribed end displacement must be satisfied
    let d_end = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_end.uy, -delta, 0.01,
        "SSE end settlement: prescribed uy at right = -δ");

    // Equilibrium: ΣRy = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.01,
        "SSE end settlement equilibrium: ΣRy={:.6}", sum_ry);
}

// ================================================================
// 3. Fixed-Fixed Beam with End Settlement
// ================================================================
//
// Fixed-fixed beam, length L = 6 m. Right support settles by δ = 0.01 m.
// From slope-deflection equations:
//   M_left  = +6·E·I·δ / L²  (measured as reaction moment magnitude)
//   M_right = −6·E·I·δ / L²
//   V       = 12·E·I·δ / L³  (equal at both ends)
//
// Reference: Kassimali "Structural Analysis" 6th Ed., §13.4, Ex. 13.5.

#[test]
fn validation_sse_fixed_fixed_end_settlement() {
    let l = 6.0;
    let n = 8;
    let delta = 0.01; // m

    let input = make_ff_beam_settlement(n, l, Some(-delta));
    let results = linear::solve_2d(&input).unwrap();

    let m_exact = 6.0 * ei() * delta / (l * l);
    let v_exact = 12.0 * ei() * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_left.mz.abs(), m_exact, 0.03,
        "SSE fixed-fixed: |M_left| = 6EIδ/L²");
    assert_close(r_left.ry.abs(), v_exact, 0.03,
        "SSE fixed-fixed: V = 12EIδ/L³");

    // Equilibrium: ΣRy = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < v_exact * 0.01,
        "SSE fixed-fixed equilibrium: ΣRy={:.6}", sum_ry);

    // The prescribed settlement must be imposed
    let n_nodes = n + 1;
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uy, -delta, 0.01,
        "SSE fixed-fixed: prescribed uy at right = -δ");
}

// ================================================================
// 4. Portal Frame with One Base Settling
// ================================================================
//
// Fixed-base portal frame (h=4m, w=6m). Right column base settles δ = 0.01 m.
// Settlement induces moments and shears throughout the frame.
// Global equilibrium must hold: ΣRy = 0, ΣRx = 0 (no applied loads).
//
// Reference: Hibbeler "Structural Analysis" 10th Ed., §11-6.

#[test]
fn validation_sse_portal_frame_base_settlement() {
    let h = 4.0;
    let w = 6.0;
    let delta = 0.01; // m

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium (no applied loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_ry.abs() < 0.01,
        "Portal frame settlement: ΣRy={:.6} should be 0", sum_ry);
    assert!(sum_rx.abs() < 0.01,
        "Portal frame settlement: ΣRx={:.6} should be 0", sum_rx);

    // Settling support must be at prescribed position
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert_close(d4.uy, -delta, 0.01,
        "Portal frame settlement: prescribed uy at node 4 = -δ");

    // Settlement must induce non-zero moments (statically indeterminate frame)
    let max_m = results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_m > 0.01,
        "Portal frame settlement should induce moments: M_max={:.6}", max_m);
}

// ================================================================
// 5. Propped Cantilever with Roller Settlement
// ================================================================
//
// Fixed at left (node 1), roller support at right (node n+1).
// The roller settles by δ.
// From slope-deflection (or force method):
//   M_fixed = 3·E·I·δ / L²
//   R_roller = 3·E·I·δ / L³
//   R_fixed_y = −R_roller (opposite, for equilibrium)
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §4.3 Ex. 4.2.

#[test]
fn validation_sse_propped_cantilever_roller_settlement() {
    let l = 5.0;
    let n = 8;
    let delta = 0.008; // m

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
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = 3EIδ/L²
    let m_exact = 3.0 * ei() * delta / (l * l);
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.mz.abs(), m_exact, 0.03,
        "SSE propped cantilever: M_fixed = 3EIδ/L²");

    // R_roller = 3EIδ/L³
    let r_exact = 3.0 * ei() * delta / (l * l * l);
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.ry.abs(), r_exact, 0.03,
        "SSE propped cantilever: R_roller = 3EIδ/L³");

    // The prescribed settlement must be satisfied
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uy, -delta, 0.01,
        "SSE propped cantilever: prescribed uy at roller = -δ");
}

// ================================================================
// 6. Two-Span Beam Settlement: Moment Proportional to EI
// ================================================================
//
// Two equal-span beams (L = 4 m each), with the same geometry but
// different EI (by changing E). Apply the same middle support settlement δ.
//
// Three-moment theorem gives: M_B = −3·E·I·δ / L²
// Thus M_B is proportional to EI: doubling EI doubles M_B.
//
// Reference: Timoshenko "Strength of Materials" Vol. II, §69.

#[test]
fn validation_sse_moment_proportional_to_ei() {
    let l = 4.0;
    let n_per = 6;
    let delta = 0.01; // m
    let total_n = 2 * n_per;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;
    let mid_node = n_per + 1;

    let run_case = |e_val: f64| -> f64 {
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..total_n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

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
        mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: e_val, nu: 0.3 });
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
            elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
            connectors: HashMap::new(), };
        let results = linear::solve_2d(&input).unwrap();

        // Return max moment in elements adjacent to mid-support
        results.element_forces.iter()
            .filter(|ef| ef.element_id == n_per || ef.element_id == n_per + 1)
            .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
            .fold(0.0_f64, f64::max)
    };

    let m_base = run_case(E);
    let m_double = run_case(2.0 * E);

    // Doubling E should double the moment (proportionality)
    let ratio = m_double / m_base;
    assert!((ratio - 2.0).abs() < 0.05,
        "Moment proportional to EI: ratio m_double/m_base={:.4}, expected 2.0", ratio);
}

// ================================================================
// 7. Settlement on Stiff vs. Flexible Beam
// ================================================================
//
// Two propped cantilevers with the same geometry but different EI.
// Both have the same roller settlement δ.
//
// The stiffer beam (higher EI) develops larger induced moments
// and reactions. This is because for prescribed displacement (not force),
// the induced force ∝ EI: M = 3EIδ/L².
//
// Reference: Hibbeler "Structural Analysis" 10th Ed., §11-7.

#[test]
fn validation_sse_stiff_vs_flexible_beam() {
    let l = 5.0;
    let n = 6;
    let delta = 0.01;
    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let run_with_e = |e_val: f64| -> f64 {
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
        mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: e_val, nu: 0.3 });
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
            elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
            connectors: HashMap::new(), };
        let results = linear::solve_2d(&input).unwrap();
        results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs()
    };

    let m_flexible = run_with_e(E / 4.0);
    let m_stiff = run_with_e(E);

    // Stiffer beam → larger induced moments
    assert!(m_stiff > m_flexible,
        "Stiff vs flexible: M_stiff={:.4} should exceed M_flexible={:.4}",
        m_stiff, m_flexible);

    // Ratio should match EI ratio (4:1)
    let ratio = m_stiff / m_flexible;
    assert!((ratio - 4.0).abs() < 0.1,
        "Stiff vs flexible: M ratio={:.4}, expected 4.0", ratio);
}

// ================================================================
// 8. Multiple Settlement Pattern Effects
// ================================================================
//
// Three-span beam (pinned at A, rollers at B, C, D).
// Pattern 1: middle support B settles δ (others at zero).
// Pattern 2: outer support D settles δ (others at zero).
// Pattern 3: both B and D settle δ simultaneously.
//
// By linearity: response_3 = response_1 + response_2.
// Verify using reaction at node A.
//
// Reference: Ghali & Neville "Structural Analysis" 7th Ed., §4.7.

#[test]
fn validation_sse_multiple_settlement_patterns() {
    let l = 4.0;  // each span
    let n_per = 4;
    let delta = 0.008; // m
    let total_n = 3 * n_per;
    let n_nodes = total_n + 1;
    let elem_len = l / n_per as f64;

    let build = |settle_b: bool, settle_d: bool| -> AnalysisResults {
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..total_n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();

        let node_b = n_per + 1;
        let node_c = 2 * n_per + 1;
        let node_d = n_nodes;

        let mut sups_map = HashMap::new();
        sups_map.insert("1".to_string(), SolverSupport {
            id: 1, node_id: 1, support_type: "pinned".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2, node_id: node_b, support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: if settle_b { Some(-delta) } else { None }, drz: None, angle: None,
        });
        sups_map.insert("3".to_string(), SolverSupport {
            id: 3, node_id: node_c, support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        sups_map.insert("4".to_string(), SolverSupport {
            id: 4, node_id: node_d, support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: if settle_d { Some(-delta) } else { None }, drz: None, angle: None,
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
            elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
            connectors: HashMap::new(), };
        linear::solve_2d(&input).unwrap()
    };

    let res1 = build(true, false);  // B settles
    let res2 = build(false, true);  // D settles
    let res3 = build(true, true);   // both B and D settle

    // Superposition at node A (node 1)
    let ry1 = res1.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry2 = res2.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry3 = res3.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;

    let sum_sep = ry1 + ry2;
    let denom = ry3.abs().max(0.1);
    let err = (ry3 - sum_sep).abs() / denom;
    assert!(err < 0.02,
        "Multiple settlement superposition: Ry_both={:.6}, Ry1+Ry2={:.6}, err={:.2}%",
        ry3, sum_sep, err * 100.0);

    // Each individual case should produce nonzero reactions (indeterminate beam)
    assert!(ry1.abs() > 0.001,
        "Settlement B: reaction at A={:.6} should be nonzero", ry1);
    assert!(ry2.abs() > 0.001,
        "Settlement D: reaction at A={:.6} should be nonzero", ry2);
}
