/// Validation: Prescribed Displacements / Settlement Analysis (Extended)
///
/// References:
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4 (force method with settlement)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 13 (slope-deflection with settlement)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11 (displacement method)
///
/// Key formulas:
///   - Fixed-fixed beam with end settlement delta: M = 6EI*delta/L^2, V = 12EI*delta/L^3
///   - Propped cantilever with roller settlement delta: M_fixed = 3EI*delta/L^2
///   - Fixed-fixed beam with prescribed rotation theta at one end: M_near = 4EI*theta/L
///   - Equal settlement at all supports: zero internal forces (rigid body translation)
///
/// Tests:
///   1. Fixed-fixed beam with support settlement: verify 6EI*delta/L^2 end moments
///   2. Propped cantilever with roller settlement: verify induced reactions
///   3. Two-span beam with interior support settlement: verify moment redistribution
///   4. Portal frame with differential settlement at one base: verify sway and moments
///   5. Fixed beam with prescribed rotation at one end: verify moment = 4EI*theta/L
///   6. SS beam with both supports settling equally: zero internal forces
///   7. Continuous beam with middle support settlement: verify symmetry of response
///   8. Fixed-fixed beam with both ends settling equally: zero internal forces
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally => E_eff = 200e6 kPa)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

/// Helper: build nodes, materials, sections, and elements for a single-span beam along X.
/// Returns (nodes_map, mats_map, secs_map, elems_map, n_nodes).
fn build_beam_maps(
    n: usize,
    l: f64,
) -> (
    HashMap<String, SolverNode>,
    HashMap<String, SolverMaterial>,
    HashMap<String, SolverSection>,
    HashMap<String, SolverElement>,
    usize,
) {
    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
        );
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert(
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
    (nodes_map, mats_map, secs_map, elems_map, n_nodes)
}

// ================================================================
// 1. Fixed-Fixed Beam with Support Settlement
// ================================================================
//
// Fixed-fixed beam of length L. Right end settles by delta.
// Classical result (no external load):
//   M_A = M_B = 6*EI*delta/L^2 (magnitude)
//   V = 12*EI*delta/L^3
//
// Slope-deflection equations with theta_A = theta_B = 0, psi = delta/L:
//   M_AB = 2EI/L*(2*0 + 0 - 3*delta/L) = -6EI*delta/L^2
//   M_BA = 2EI/L*(0 + 2*0 - 3*delta/L) = -6EI*delta/L^2

#[test]
fn test_fixed_fixed_beam_support_settlement() {
    let l: f64 = 6.0;
    let n: usize = 8;
    let delta: f64 = 0.01; // 10 mm downward settlement at right end
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    let (nodes_map, mats_map, secs_map, elems_map, n_nodes) = build_beam_maps(n, l);

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Expected values
    let m_exact: f64 = 6.0 * ei * delta / (l * l);
    let v_exact: f64 = 12.0 * ei * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

    // Both end moments should equal 6EI*delta/L^2
    assert_close(r_left.my.abs(), m_exact, 0.03,
        "Fixed-fixed settlement: |M_left| = 6EI*delta/L^2");
    assert_close(r_right.my.abs(), m_exact, 0.03,
        "Fixed-fixed settlement: |M_right| = 6EI*delta/L^2");

    // Shear = 12EI*delta/L^3
    assert_close(r_left.rz.abs(), v_exact, 0.03,
        "Fixed-fixed settlement: |V| = 12EI*delta/L^3");

    // Equilibrium: sum of vertical reactions = 0 (no external loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < v_exact * 0.02,
        "Fixed-fixed settlement equilibrium: sum_Ry={:.6}", sum_ry);

    // Prescribed displacement check
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uz, -delta, 0.01,
        "Fixed-fixed settlement: uy at right = -delta");
}

// ================================================================
// 2. Propped Cantilever with Roller Settlement
// ================================================================
//
// Fixed at left (node 1), rollerX at right (node n+1).
// Right support settles by delta.
// Slope-deflection with far end pinned:
//   M_fixed = 3EI*delta/L^2
//   R_roller = 3EI*delta/L^3

#[test]
fn test_propped_cantilever_roller_settlement() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let delta: f64 = 0.005; // 5 mm settlement
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    let (nodes_map, mats_map, secs_map, elems_map, n_nodes) = build_beam_maps(n, l);

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = 3EI*delta/L^2
    let m_exact: f64 = 3.0 * ei * delta / (l * l);
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.my.abs(), m_exact, 0.03,
        "Propped cantilever settlement: |M_fixed| = 3EI*delta/L^2");

    // R_roller = 3EI*delta/L^3
    let v_exact: f64 = 3.0 * ei * delta / (l * l * l);
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.rz.abs(), v_exact, 0.03,
        "Propped cantilever settlement: |R_roller| = 3EI*delta/L^3");

    // Equilibrium: sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < v_exact * 0.02,
        "Propped cantilever settlement equilibrium: sum_Ry={:.6}", sum_ry);

    // Prescribed displacement at roller
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uz, -delta, 0.01,
        "Propped cantilever settlement: uy at roller = -delta");
}

// ================================================================
// 3. Two-Span Beam with Interior Support Settlement
// ================================================================
//
// Two equal spans L, pinned at ends, rollerX at interior.
// Interior support settles by delta.
// By three-moment equation for equal spans with settlement at B:
//   M_B is induced at the interior support.
// Equilibrium: sum Ry = 0. Reactions redistribute due to settlement.
// The response should cause non-zero internal moments.

#[test]
fn test_two_span_interior_support_settlement() {
    let span: f64 = 5.0;
    let n_per_span: usize = 8;
    let delta: f64 = 0.008; // 8 mm settlement at interior support
    let total_n = n_per_span * 2;
    let n_nodes = total_n + 1;
    let elem_len = span / n_per_span as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
        );
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..total_n {
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }

    let mid_node = n_per_span + 1;
    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01,
        "Two-span settlement equilibrium: sum_Ry={:.6}", sum_ry);

    // Interior support displacement must match prescribed value
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz, -delta, 0.01,
        "Two-span settlement: uy at mid = -delta");

    // Settlement should induce a non-zero reaction at the interior support
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    assert!(r_mid.rz.abs() > 0.1,
        "Two-span settlement: interior reaction is non-zero: Ry={:.6}", r_mid.rz);

    // Settlement induces moments in elements near the interior support.
    // By symmetry (equal spans), end-span element forces on each side of mid
    // should have equal magnitudes.
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let diff: f64 = (r_left.rz.abs() - r_right.rz.abs()).abs();
    let max_r: f64 = r_left.rz.abs().max(r_right.rz.abs()).max(1e-10);
    assert!(diff / max_r < 0.03,
        "Two-span settlement symmetry: R_left={:.6}, R_right={:.6}", r_left.rz, r_right.rz);
}

// ================================================================
// 4. Portal Frame with Differential Settlement at One Base
// ================================================================
//
// Portal frame: nodes 1(0,0), 2(0,h), 3(w,h), 4(w,0).
// Fixed at both bases (1 and 4). Node 4 settles by delta.
// Settlement induces sway (horizontal displacement at beam level)
// and parasitic moments. No external loads applied.

#[test]
fn test_portal_frame_differential_settlement() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let delta: f64 = 0.01; // 10 mm settlement at right base

    let mut nodes_map = HashMap::new();
    for &(id, x, y) in &[(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)] {
        nodes_map.insert(id.to_string(), SolverNode { id, x, z: y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for &(id, ni, nj) in &[(1, 1, 2), (2, 2, 3), (3, 3, 4)] {
        elems_map.insert(id.to_string(), SolverElement {
            id, elem_type: "frame".to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 4, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium (no external loads): sum Ry = 0, sum Rx = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_ry.abs() < 0.01,
        "Portal settlement: sum_Ry should be ~0: {:.6}", sum_ry);
    assert!(sum_rx.abs() < 0.01,
        "Portal settlement: sum_Rx should be ~0: {:.6}", sum_rx);

    // Prescribed displacement at settling node
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert_close(d4.uz, -delta, 0.01,
        "Portal settlement: uy at node 4 = -delta");

    // Settlement induces sway at beam level: nodes 2 and 3 should have
    // horizontal displacement (from column chord rotation)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    // At least one beam-level node should have non-trivial horizontal displacement
    let max_sway: f64 = d2.ux.abs().max(d3.ux.abs());
    assert!(max_sway > 1e-6,
        "Portal settlement: sway at beam level, max_ux={:.6e}", max_sway);

    // Settlement should induce non-zero moments in the frame
    let max_moment: f64 = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_moment > 0.01,
        "Portal settlement: induced moments, M_max={:.6}", max_moment);

    // Moment equilibrium about any point: sum Mz + sum(Ry * x) + sum(Rx * y) = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let moment_about_origin: f64 = r1.my + r4.my + r4.rz * w;
    // r1 is at origin so its Ry*x = 0, Rx*y = 0
    // r4 is at (w, 0) so Ry*w contributes, Rx*0 = 0
    assert!(moment_about_origin.abs() < 1.0,
        "Portal settlement moment equilibrium: {:.6}", moment_about_origin);
}

// ================================================================
// 5. Fixed Beam with Prescribed Rotation at One End
// ================================================================
//
// Fixed-fixed beam with prescribed rotation theta at right end.
// Slope-deflection (no settlement psi=0, theta_A=0, theta_B=theta):
//   M_BA = 2EI/L*(2*theta + 0 - 0) = 4EI*theta/L  (near end)
//   M_AB = 2EI/L*(0 + theta - 0)   = 2EI*theta/L  (far end, carry-over)
// Shear V = (M_AB + M_BA)/L = 6EI*theta/L^2

#[test]
fn test_fixed_beam_prescribed_rotation() {
    let l: f64 = 8.0;
    let n: usize = 16;
    let theta: f64 = 0.001; // small prescribed rotation
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    let (nodes_map, mats_map, secs_map, elems_map, n_nodes) = build_beam_maps(n, l);

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: Some(theta), angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M_near (at B) = 4EI*theta/L
    let m_near: f64 = 4.0 * ei * theta / l;
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.my.abs(), m_near, 0.05,
        "Prescribed rotation: |M_near| = 4EI*theta/L");

    // M_far (at A) = 2EI*theta/L (carry-over factor = 0.5)
    let m_far: f64 = 2.0 * ei * theta / l;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.my.abs(), m_far, 0.05,
        "Prescribed rotation: |M_far| = 2EI*theta/L (COF=0.5)");

    // Shear V = 6EI*theta/L^2
    let v_exact: f64 = 6.0 * ei * theta / (l * l);
    assert_close(r_left.rz.abs(), v_exact, 0.05,
        "Prescribed rotation: |V| = 6EI*theta/L^2");

    // Prescribed rotation must be present in displacements
    let d_right = results.displacements.iter().find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.ry, theta, 0.01,
        "Prescribed rotation: rz at right = theta");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < v_exact * 0.02,
        "Prescribed rotation equilibrium: sum_Ry={:.6}", sum_ry);
}

// ================================================================
// 6. SS Beam with Both Supports Settling Equally
// ================================================================
//
// Simply-supported beam (pinned + rollerX), both supports settle
// by the same amount. This is a rigid body translation.
// No internal forces should be induced.

#[test]
fn test_ss_beam_equal_settlement_zero_forces() {
    let l: f64 = 6.0;
    let n: usize = 8;
    let delta: f64 = 0.02; // 20 mm equal settlement

    let (nodes_map, mats_map, secs_map, elems_map, n_nodes) = build_beam_maps(n, l);

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // All internal forces should be zero (rigid body translation)
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 1e-6,
            "Equal SS settlement: M_start=0 at elem {}, got {:.6e}", ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 1e-6,
            "Equal SS settlement: M_end=0 at elem {}, got {:.6e}", ef.element_id, ef.m_end);
        assert!(ef.v_start.abs() < 1e-6,
            "Equal SS settlement: V_start=0 at elem {}, got {:.6e}", ef.element_id, ef.v_start);
        assert!(ef.n_start.abs() < 1e-6,
            "Equal SS settlement: N_start=0 at elem {}, got {:.6e}", ef.element_id, ef.n_start);
    }

    // All nodes should have the same vertical displacement = -delta
    for d in &results.displacements {
        assert_close(d.uz, -delta, 0.001,
            &format!("Equal SS settlement: all nodes at -delta, node {}", d.node_id));
    }

    // All reactions should be zero
    for r in &results.reactions {
        assert!(r.rz.abs() < 1e-6,
            "Equal SS settlement: Ry=0 at node {}, got {:.6e}", r.node_id, r.rz);
    }
}

// ================================================================
// 7. Continuous Beam with Middle Support Settlement: Symmetry
// ================================================================
//
// Three-span continuous beam with equal spans L.
// Supports: pinned at start, rollerX at each span boundary.
// Middle support (between spans 1 and 2, i.e. at x=L) settles by delta.
// Wait -- for true symmetry we need the beam to be symmetric about
// the settling support. Use two equal spans: A-B-C with B settling.
// (That is a 2-span beam, already tested in test 3.)
//
// Instead: 3 equal spans A-B-C-D. B settles. By the three-moment
// equation the response at B and C (equal distance from the midpoint
// of the structure) are NOT symmetric, but the structure itself is
// symmetric about the midpoint of the total length. If we settle the
// midpoint support (C at x=1.5L for 3 spans of L), symmetry holds.
//
// Simplest: two equal spans with interior support settling.
// The structure is symmetric about the interior support.
// Due to symmetry, R_A = R_C (end reactions are equal).

#[test]
fn test_continuous_beam_middle_settlement_symmetry() {
    let span: f64 = 6.0;
    let n_per_span: usize = 8;
    let delta: f64 = 0.01;
    let e_eff: f64 = E * 1000.0;
    let ei: f64 = e_eff * IZ;

    // 3 equal spans: 4 supports at x=0, span, 2*span, 3*span
    // Middle support at x = 1.5*span (between span 1-2) -- but node won't land there.
    // Better: just use 2 equal spans with middle support settling (symmetric structure).
    // Pinned-roller-roller. Middle support settles. By symmetry R_left = R_right.

    let total_n = n_per_span * 2;
    let n_nodes = total_n + 1;
    let elem_len = span / n_per_span as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
        );
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for i in 0..total_n {
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }

    let mid_node = n_per_span + 1;
    let mut sups_map = HashMap::new();
    // Pinned at left end
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // RollerX at middle with settlement
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid_node, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });
    // RollerX at right end (use pinned for symmetry with left)
    // To have true symmetry, both end supports should be the same type.
    // Use pinned at left and pinned at right (pin provides Rx + Ry).
    // But two pinned supports would be over-constrained in X.
    // Use pinned + rollerX which is standard. The Y-response is symmetric
    // even though Rx constraint differs, because there is no horizontal load.
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // Symmetry: R_A (ry) should equal R_C (ry) in magnitude
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let diff_ry: f64 = (r_left.rz - r_right.rz).abs();
    let max_ry: f64 = r_left.rz.abs().max(r_right.rz.abs()).max(1e-10);
    assert!(diff_ry / max_ry < 0.03,
        "Symmetry: R_left={:.6}, R_right={:.6}", r_left.rz, r_right.rz);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01,
        "Continuous beam settlement equilibrium: sum_Ry={:.6}", sum_ry);

    // Prescribed displacement at middle
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz, -delta, 0.01,
        "Continuous beam settlement: uy at mid = -delta");

    // By three-moment equation for equal spans with centre support settlement:
    // The internal moment at B is related to 3EI*delta/L^2 for the two-span case.
    // Check that element forces near the middle support are non-trivial.
    // Elements on either side of mid_node: element n_per_span (left side) and
    // element n_per_span+1 (right side).
    let ef_left = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span + 1).unwrap();

    // Symmetry: m_end of left element should equal m_start of right element (magnitude)
    let diff_m: f64 = (ef_left.m_end.abs() - ef_right.m_start.abs()).abs();
    let max_m: f64 = ef_left.m_end.abs().max(ef_right.m_start.abs()).max(1e-10);
    assert!(diff_m / max_m < 0.05,
        "Moment symmetry at middle: M_left_end={:.6}, M_right_start={:.6}",
        ef_left.m_end, ef_right.m_start);

    // The moment at B for a two-span beam with B settling:
    // M_B = 3*EI*delta/L^2 (from three-moment equation)
    let m_b_expected: f64 = 3.0 * ei * delta / (span * span);
    assert_close(ef_left.m_end.abs(), m_b_expected, 0.10,
        "Two-span settlement: |M_B| ~ 3EI*delta/L^2");
}

// ================================================================
// 8. Fixed-Fixed Beam with Both Ends Settling Equally
// ================================================================
//
// Both ends fixed, both settle by the same delta.
// This is a rigid body translation => zero internal forces.
// All displacements should equal delta, all forces = 0.

#[test]
fn test_fixed_fixed_equal_settlement_zero_forces() {
    let l: f64 = 8.0;
    let n: usize = 12;
    let delta: f64 = 0.015; // 15 mm equal settlement

    let (nodes_map, mats_map, secs_map, elems_map, n_nodes) = build_beam_maps(n, l);

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let input = SolverInput {
        nodes: nodes_map, materials: mats_map, sections: secs_map,
        elements: elems_map, supports: sups_map, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // All internal forces should be zero
    for ef in &results.element_forces {
        assert!(ef.m_start.abs() < 1e-6,
            "Equal fixed settlement: M_start=0 at elem {}, got {:.6e}", ef.element_id, ef.m_start);
        assert!(ef.m_end.abs() < 1e-6,
            "Equal fixed settlement: M_end=0 at elem {}, got {:.6e}", ef.element_id, ef.m_end);
        assert!(ef.v_start.abs() < 1e-6,
            "Equal fixed settlement: V_start=0 at elem {}, got {:.6e}", ef.element_id, ef.v_start);
        assert!(ef.v_end.abs() < 1e-6,
            "Equal fixed settlement: V_end=0 at elem {}, got {:.6e}", ef.element_id, ef.v_end);
        assert!(ef.n_start.abs() < 1e-6,
            "Equal fixed settlement: N_start=0 at elem {}, got {:.6e}", ef.element_id, ef.n_start);
    }

    // All nodes should have the same vertical displacement = -delta
    for d in &results.displacements {
        assert_close(d.uz, -delta, 0.001,
            &format!("Equal fixed settlement: uy=-delta at node {}", d.node_id));
    }

    // All reactions should be zero (no load, rigid body motion only)
    for r in &results.reactions {
        assert!(r.rz.abs() < 1e-6,
            "Equal fixed settlement: Ry=0 at node {}, got {:.6e}", r.node_id, r.rz);
        assert!(r.my.abs() < 1e-6,
            "Equal fixed settlement: Mz=0 at node {}, got {:.6e}", r.node_id, r.my);
    }

    // Rotations should all be zero (pure translation, no chord rotation)
    for d in &results.displacements {
        assert!(d.ry.abs() < 1e-8,
            "Equal fixed settlement: rz=0 at node {}, got {:.6e}", d.node_id, d.ry);
    }
}
