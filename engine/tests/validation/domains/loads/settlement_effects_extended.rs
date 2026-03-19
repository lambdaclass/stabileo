/// Validation: Extended Support Settlement Effects
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 5 (settlement of supports)
///   - Hibbeler, "Structural Analysis", Ch. 10 (force method with settlements)
///   - Kassimali, "Structural Analysis", Ch. 13 (slope-deflection with settlements)
///
/// Tests verify structural response to prescribed support displacements:
///   1. SS beam: uniform settlement = no internal forces (rigid body)
///   2. Fixed-fixed beam: differential settlement M = 6EI*delta/L²
///   3. Propped cantilever: roller settlement, moment at fixed end
///   4. Two-span beam: middle support settles, moment redistribution
///   5. Fixed-fixed beam: prescribed rotation, M = 4EI*theta/L
///   6. Continuous beam: central support settlement, symmetric response
///   7. Portal frame: one base settles, asymmetric response
///   8. Fixed beam: both supports settle equally = no internal forces
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01;      // m²
const IZ: f64 = 1e-4;     // m⁴

/// Helper: build nodes for a beam along X-axis with n elements of total length l
fn build_beam_nodes(n: usize, l: f64) -> HashMap<String, SolverNode> {
    let mut nodes = HashMap::new();
    for i in 0..=n {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * l / n as f64,
                z: 0.0,
            },
        );
    }
    nodes
}

/// Helper: build standard material map
fn build_mats() -> HashMap<String, SolverMaterial> {
    let mut mats = HashMap::new();
    mats.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E,
            nu: 0.3,
        },
    );
    mats
}

/// Helper: build standard section map
fn build_secs() -> HashMap<String, SolverSection> {
    let mut secs = HashMap::new();
    secs.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a: A,
            iz: IZ,
            as_y: None,
        },
    );
    secs
}

/// Helper: build frame elements for a beam with n elements
fn build_beam_elems(n: usize) -> HashMap<String, SolverElement> {
    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }
    elems
}

// ================================================================
// 1. SS Beam: Uniform Settlement = No Internal Forces (Rigid Body)
// ================================================================
//
// A simply supported beam with both supports settling by the same
// amount undergoes pure rigid-body translation. No relative
// displacement => no bending, shear, or axial forces.

#[test]
fn settlement_ext_ss_beam_uniform_settlement_rigid_body() {
    let l = 8.0;
    let n = 8;
    let delta = 0.02; // 20mm uniform settlement

    let nodes = build_beam_nodes(n, l);
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n + 1,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // All element forces must be zero (rigid body motion)
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.01,
            "SS uniform settlement: M_start should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.m_start
        );
        assert!(
            ef.m_end.abs() < 0.01,
            "SS uniform settlement: M_end should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.m_end
        );
        assert!(
            ef.v_start.abs() < 0.01,
            "SS uniform settlement: V should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.v_start
        );
    }

    // All nodes should have uy = -delta
    for d in &results.displacements {
        assert_close(
            d.uz,
            -delta,
            0.02,
            &format!(
                "SS uniform settlement: node {} uy = -delta",
                d.node_id
            ),
        );
    }
}

// ================================================================
// 2. Fixed-Fixed Beam: Differential Settlement M = 6EI*delta/L²
// ================================================================
//
// One end fixed without settlement, other end fixed with settlement
// delta. Classical result:
//   M = 6*E*I*delta/L² at each end
//   R = 12*E*I*delta/L³ shear

#[test]
fn settlement_ext_fixed_fixed_differential_settlement() {
    let l = 10.0;
    let n = 10;
    let delta = 0.015; // 15mm differential settlement
    let e_eff: f64 = E * 1000.0;

    let nodes = build_beam_nodes(n, l);
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n + 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M = 6EI*delta/L²
    let m_exact: f64 = 6.0 * e_eff * IZ * delta / (l * l);
    let r1 = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    assert_close(
        r1.my.abs(),
        m_exact,
        0.05,
        "FF diff settlement: M_left = 6EI*delta/L²",
    );

    let r2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(
        r2.my.abs(),
        m_exact,
        0.05,
        "FF diff settlement: M_right = 6EI*delta/L²",
    );

    // R = 12EI*delta/L³
    let r_exact: f64 = 12.0 * e_eff * IZ * delta / (l * l * l);
    assert_close(
        r1.rz.abs(),
        r_exact,
        0.05,
        "FF diff settlement: R = 12EI*delta/L³",
    );

    // Equilibrium: sum of vertical reactions = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "FF diff settlement: vertical equilibrium, sum_ry = {:.6e}",
        sum_ry
    );
}

// ================================================================
// 3. Propped Cantilever: Roller Settles, Verify Induced Moment
// ================================================================
//
// Fixed at left (node 1), roller at right (node n+1) settles by delta.
//   R_B = 3EI*delta/L³
//   M_A = 3EI*delta/L² (moment at fixed end)

#[test]
fn settlement_ext_propped_cantilever_roller_settlement() {
    let l = 6.0;
    let n = 6;
    let delta = 0.01; // 10mm settlement at roller
    let e_eff: f64 = E * 1000.0;

    let nodes = build_beam_nodes(n, l);
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n + 1,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // R_B = 3EI*delta/L³
    let r_b_exact: f64 = 3.0 * e_eff * IZ * delta / (l * l * l);
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(
        r_b.rz.abs(),
        r_b_exact,
        0.05,
        "Propped cantilever settlement: R_B = 3EI*delta/L³",
    );

    // M_A = 3EI*delta/L² (moment at fixed end)
    let m_a_exact: f64 = 3.0 * e_eff * IZ * delta / (l * l);
    let r_a = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    assert_close(
        r_a.my.abs(),
        m_a_exact,
        0.05,
        "Propped cantilever settlement: M_A = 3EI*delta/L²",
    );

    // Right end displacement should match prescribed settlement
    let d_end = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        d_end.uz,
        -delta,
        0.02,
        "Propped cantilever settlement: prescribed uy at roller",
    );
}

// ================================================================
// 4. Two-Span Beam: Middle Support Settles
// ================================================================
//
// Two equal spans L, pinned-roller-roller. Middle support (node n+1)
// settles by delta. Verify moment redistribution and equilibrium.

#[test]
fn settlement_ext_two_span_middle_support_settlement() {
    let span = 5.0;
    let n_per_span = 5;
    let total_n = 2 * n_per_span;
    let delta = 0.01;

    // Build two-span beam nodes
    let mut nodes = HashMap::new();
    for i in 0..=total_n {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * span / n_per_span as f64,
                z: 0.0,
            },
        );
    }

    let mut sups = HashMap::new();
    // Left end: pinned
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    // Middle support: roller with settlement
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n_per_span + 1,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );
    // Right end: roller
    sups.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: total_n + 1,
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(total_n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of vertical reactions = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "Two-span settlement: vertical equilibrium, sum_ry = {:.6e}",
        sum_ry
    );

    // Symmetry: the two outer reactions should be equal and opposite to
    // the middle reaction (equal spans, symmetric structure, symmetric settlement)
    let r_left = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == total_n + 1)
        .unwrap();
    assert_close(
        r_left.rz,
        r_right.rz,
        0.05,
        "Two-span settlement: symmetric outer reactions",
    );

    // Middle support should have the prescribed displacement
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == n_per_span + 1)
        .unwrap();
    assert_close(
        d_mid.uz,
        -delta,
        0.02,
        "Two-span settlement: prescribed uy at middle support",
    );

    // Settlement induces non-zero internal forces
    let ef_mid = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();
    assert!(
        ef_mid.m_end.abs() > 0.001,
        "Two-span settlement: non-zero moment at interior support, got {:.6e}",
        ef_mid.m_end
    );
}

// ================================================================
// 5. Fixed-Fixed Beam: Prescribed Rotation at One End
// ================================================================
//
// Fixed-fixed beam, rotation theta prescribed at right end.
// Slope-deflection: M_near = 4EI*theta/L, M_far = 2EI*theta/L

#[test]
fn settlement_ext_fixed_fixed_prescribed_rotation() {
    let l = 8.0;
    let n = 8;
    let theta = 0.005; // prescribed rotation (radians)
    let e_eff: f64 = E * 1000.0;

    let nodes = build_beam_nodes(n, l);
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n + 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: Some(theta),
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M_near = 4EI*theta/L at the end with prescribed rotation
    let m_near_exact: f64 = 4.0 * e_eff * IZ * theta / l;
    let r_near = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(
        r_near.my.abs(),
        m_near_exact,
        0.05,
        "FF prescribed rotation: M_near = 4EI*theta/L",
    );

    // M_far = 2EI*theta/L at the other end
    let m_far_exact: f64 = 2.0 * e_eff * IZ * theta / l;
    let r_far = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    assert_close(
        r_far.my.abs(),
        m_far_exact,
        0.05,
        "FF prescribed rotation: M_far = 2EI*theta/L",
    );

    // The prescribed rotation should be achieved
    let d_end = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();
    assert_close(
        d_end.ry,
        theta,
        0.02,
        "FF prescribed rotation: prescribed theta achieved",
    );

    // No vertical displacement at supports (no settlement prescribed)
    let d_start = results
        .displacements
        .iter()
        .find(|d| d.node_id == 1)
        .unwrap();
    assert!(
        d_start.uz.abs() < 1e-10,
        "FF prescribed rotation: no vertical displacement at left end",
    );
}

// ================================================================
// 6. Continuous Beam: Central Support Settlement, Symmetric Response
// ================================================================
//
// Four-span continuous beam (equal spans L), 5 supports.
// Supports at x = 0, L, 2L, 3L, 4L.
// Center support (at x = 2L) settles by delta.
// The structure is symmetric about x = 2L, so the response must
// be symmetric: R(0) = R(4L), R(L) = R(3L).

#[test]
fn settlement_ext_continuous_beam_central_settlement_symmetric() {
    let span = 5.0;
    let n_per_span = 5;
    let n_spans = 4;
    let total_n = n_per_span * n_spans; // 20 elements, 21 nodes
    let delta = 0.008; // 8mm settlement at central support

    // Build nodes for 4-span beam
    let mut nodes = HashMap::new();
    for i in 0..=total_n {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode {
                id: i + 1,
                x: i as f64 * span / n_per_span as f64,
                z: 0.0,
            },
        );
    }

    // 5 supports at span boundaries: nodes 1, 6, 11, 16, 21
    // Center = node 11 (at x = 2*span = 10.0)
    let mid_node = 2 * n_per_span + 1; // node 11
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n_per_span + 1, // node 6
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "3".to_string(),
        SolverSupport {
            id: 3,
            node_id: mid_node, // node 11, center
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "4".to_string(),
        SolverSupport {
            id: 4,
            node_id: 3 * n_per_span + 1, // node 16
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "5".to_string(),
        SolverSupport {
            id: 5,
            node_id: total_n + 1, // node 21
            support_type: "rollerX".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(total_n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "Continuous symmetric settlement: vertical equilibrium, sum_ry = {:.6e}",
        sum_ry
    );

    // Symmetry about x = 2*span: R(node 1) = R(node 21), R(node 6) = R(node 16)
    let r_left_outer = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let r_right_outer = results
        .reactions
        .iter()
        .find(|r| r.node_id == total_n + 1)
        .unwrap();
    assert_close(
        r_left_outer.rz,
        r_right_outer.rz,
        0.05,
        "Continuous symmetric settlement: outer reactions equal",
    );

    let r_left_inner = results
        .reactions
        .iter()
        .find(|r| r.node_id == n_per_span + 1)
        .unwrap();
    let r_right_inner = results
        .reactions
        .iter()
        .find(|r| r.node_id == 3 * n_per_span + 1)
        .unwrap();
    assert_close(
        r_left_inner.rz,
        r_right_inner.rz,
        0.05,
        "Continuous symmetric settlement: inner reactions equal",
    );

    // Prescribed displacement at central support
    let d_mid = results
        .displacements
        .iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();
    assert_close(
        d_mid.uz,
        -delta,
        0.02,
        "Continuous symmetric settlement: prescribed uy at center",
    );
}

// ================================================================
// 7. Portal Frame: One Base Settles, Asymmetric Response
// ================================================================
//
// Portal frame: fixed bases at nodes 1 and 4. Node 4 settles.
// The settlement breaks symmetry, producing asymmetric reactions.

#[test]
fn settlement_ext_portal_frame_base_settlement() {
    let h = 4.0; // column height
    let w = 6.0; // beam span
    let delta = 0.01; // 10mm settlement at right base

    // Nodes: 1(0,0), 2(0,h), 3(w,h), 4(w,0)
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: 0.0, z: h });
    nodes.insert("3".to_string(), SolverNode { id: 3, x: w, z: h });
    nodes.insert("4".to_string(), SolverNode { id: 4, x: w, z: 0.0 });

    // Three frame elements: col1 (1-2), beam (2-3), col2 (3-4)
    let mut elems = HashMap::new();
    elems.insert(
        "1".to_string(),
        SolverElement {
            id: 1,
            elem_type: "frame".to_string(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        },
    );
    elems.insert(
        "2".to_string(),
        SolverElement {
            id: 2,
            elem_type: "frame".to_string(),
            node_i: 2,
            node_j: 3,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        },
    );
    elems.insert(
        "3".to_string(),
        SolverElement {
            id: 3,
            elem_type: "frame".to_string(),
            node_i: 3,
            node_j: 4,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        },
    );

    let mut sups = HashMap::new();
    // Left base: fixed, no settlement
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    // Right base: fixed, settles by delta
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: 4,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: elems,
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: sum Ry = 0 (no external vertical loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.1,
        "Portal settlement: vertical equilibrium, sum_ry = {:.6e}",
        sum_ry
    );

    // Horizontal equilibrium: sum Rx = 0 (no external horizontal loads)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.1,
        "Portal settlement: horizontal equilibrium, sum_rx = {:.6e}",
        sum_rx
    );

    // Asymmetric response: moments at left and right base should differ in sign
    let r1 = results
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap();
    let r4 = results
        .reactions
        .iter()
        .find(|r| r.node_id == 4)
        .unwrap();
    // Both should have non-zero moments
    assert!(
        r1.my.abs() > 0.001,
        "Portal settlement: non-zero moment at left base, got {:.6e}",
        r1.my
    );
    assert!(
        r4.my.abs() > 0.001,
        "Portal settlement: non-zero moment at right base, got {:.6e}",
        r4.my
    );

    // Right base should have the prescribed settlement
    let d4 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap();
    assert_close(
        d4.uz,
        -delta,
        0.02,
        "Portal settlement: prescribed uy at right base",
    );

    // Moment equilibrium: sum of all moments about origin = 0
    // M1 + M4 + Ry1*0 + Ry4*w - Rx1*0 - Rx4*0 = 0
    // (simplified: moment equilibrium is implicitly satisfied by the solver)
    let m_sum: f64 = r1.my + r4.my + r4.rz * w;
    assert!(
        m_sum.abs() < 1.0,
        "Portal settlement: moment equilibrium about left base, residual = {:.6e}",
        m_sum
    );
}

// ================================================================
// 8. Fixed Beam: Both Supports Settle Equally = No Internal Forces
// ================================================================
//
// Fixed-fixed beam where both ends have the same prescribed
// settlement. This is a rigid body translation, so no internal
// forces should develop (same as test 1 but with fixed ends).

#[test]
fn settlement_ext_fixed_beam_equal_settlement_no_forces() {
    let l = 10.0;
    let n = 10;
    let delta = 0.025; // 25mm equal settlement at both ends

    let nodes = build_beam_nodes(n, l);
    let mut sups = HashMap::new();
    sups.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );
    sups.insert(
        "2".to_string(),
        SolverSupport {
            id: 2,
            node_id: n + 1,
            support_type: "fixed".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: Some(-delta),
            dry: None,
            angle: None,
        },
    );

    let input = SolverInput {
        nodes,
        materials: build_mats(),
        sections: build_secs(),
        elements: build_beam_elems(n),
        supports: sups,
        loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Equal settlement => rigid body => no internal forces
    for ef in &results.element_forces {
        assert!(
            ef.m_start.abs() < 0.01,
            "Fixed equal settlement: M_start should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.m_start
        );
        assert!(
            ef.m_end.abs() < 0.01,
            "Fixed equal settlement: M_end should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.m_end
        );
        assert!(
            ef.v_start.abs() < 0.01,
            "Fixed equal settlement: V_start should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.v_start
        );
        assert!(
            ef.v_end.abs() < 0.01,
            "Fixed equal settlement: V_end should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.v_end
        );
        assert!(
            ef.n_start.abs() < 0.01,
            "Fixed equal settlement: N_start should be ~0 in elem {}, got {:.6e}",
            ef.element_id,
            ef.n_start
        );
    }

    // All nodes should have uy = -delta (pure downward translation)
    for d in &results.displacements {
        assert_close(
            d.uz,
            -delta,
            0.02,
            &format!(
                "Fixed equal settlement: node {} uy = -delta",
                d.node_id
            ),
        );
    }

    // No rotations anywhere
    for d in &results.displacements {
        assert!(
            d.ry.abs() < 1e-8,
            "Fixed equal settlement: node {} rotation should be ~0, got {:.6e}",
            d.node_id,
            d.ry
        );
    }
}
