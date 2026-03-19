/// Validation: Extended Thermal Loads and Prescribed Displacements
///
/// References:
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 7th Ed., Ch. 4, 6
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed., Ch. 15
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///
/// Tests verify FEA solver results against closed-form thermal and settlement
/// formulas for beams, frames, and trusses:
///   1. Fully restrained bar under uniform temperature change
///   2. Cantilever with thermal gradient (tip deflection)
///   3. 2-span continuous beam with thermal load on one span
///   4. Portal frame with uniform temperature on beam only
///   5. Propped cantilever with support settlement
///   6. Fixed-fixed beam with end settlement
///   7. Statically indeterminate truss-like frame with thermal load on one bar
///   8. Cantilever with combined mechanical and thermal loading (superposition)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (steel)
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4
const ALPHA: f64 = 12e-6; // /degC  (hardcoded in solver)

// ================================================================
// 1. Fully Restrained Bar under Uniform Temperature Change
// ================================================================
//
// A bar fixed at both ends (axially restrained) is subjected to a
// uniform temperature rise DeltaT = 50 degC.
//
// Thermal strain (free): epsilon = alpha * DeltaT
// Since the bar cannot expand, the restrained axial force is:
//   N = alpha * DeltaT * E * A
//
// Reference: Ghali & Neville, Ch. 6; Timoshenko & Gere, Ch. 1

#[test]
fn validation_thermal_ext_1_restrained_bar() {
    let l = 5.0;
    let n = 8;
    let dt = 50.0; // degC uniform temperature rise

    // Fixed-fixed beam (both ends restrained axially)
    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: dt,
            dt_gradient: 0.0,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected restrained axial force: N = alpha * DeltaT * E_eff * A
    // E_eff = E(MPa) * 1000 = 200e6 kN/m^2 (solver internal unit)
    let e_eff = E * 1000.0;
    let n_expected = ALPHA * dt * e_eff * A; // in kN

    // All elements should have the same compressive axial force
    // (thermal expansion is resisted, so the bar is in compression)
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), n_expected, 0.03,
            &format!("Restrained bar: element {} N = alpha*DeltaT*E*A = {:.4} kN",
                ef.element_id, n_expected));
    }

    // No transverse displacement (pure axial problem)
    for d in &results.displacements {
        assert!(d.uz.abs() < 1e-8,
            "No transverse displacement: node {} uy={:.6e}", d.node_id, d.uz);
    }

    // Equilibrium: sum of horizontal reactions = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < n_expected * 0.01,
        "Axial equilibrium: sum_Rx={:.6}", sum_rx);
}

// ================================================================
// 2. Cantilever with Thermal Gradient Only
// ================================================================
//
// Cantilever beam (fixed at left, free at right) with a thermal
// gradient DeltaT_gradient across the section depth h. No uniform
// temperature change. The gradient induces curvature:
//   kappa = alpha * DeltaT_g / h
//
// Tip deflection of cantilever under constant curvature:
//   delta_tip = kappa * L^2 / 2 = alpha * DeltaT_g * L^2 / (2*h)
//
// Reference: Ghali & Neville, Ch. 6; Roark's Formulas, Ch. 15

#[test]
fn validation_thermal_ext_2_gradient_cantilever() {
    let l = 6.0;
    let n = 10;
    let dt_gradient = 20.0; // degC gradient (top-bottom)

    // Section height computed same as solver: h = sqrt(12*I/A)
    let h = (12.0 * IZ / A).sqrt();

    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }

    // Cantilever: fixed at left, free at right
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Expected tip deflection: delta = alpha * DeltaT_g * L^2 / (2*h)
    let delta_tip_expected = ALPHA * dt_gradient * l * l / (2.0 * h);

    let tip_node = n + 1;
    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    assert_close(d_tip.uz.abs(), delta_tip_expected, 0.05,
        &format!("Cantilever thermal gradient: tip deflection = {:.6e}", delta_tip_expected));

    // No axial force (cantilever is free to expand axially, and dt_uniform=0)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() < 1.0,
            "No axial force from gradient: element {} N={:.4}",
            ef.element_id, ef.n_start);
    }

    // Fixed end should have zero moment (cantilever with free curvature,
    // no restraint against bending for determinate structure)
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_fixed.my.abs() < 1.0,
        "Determinate cantilever: no restraint moment from thermal gradient: Mz={:.6}",
        r_fixed.my);
}

// ================================================================
// 3. Two-Span Continuous Beam with Thermal Gradient on Span 1
// ================================================================
//
// Continuous beam (pinned-roller-roller) with 2 equal spans L.
// Thermal gradient (top-bottom DeltaT_g) on span 1 only.
//
// A thermal gradient induces curvature kappa = alpha*DeltaT_g/h.
// On a statically indeterminate structure, the curvature in one
// span is incompatible with the other, so the interior support
// develops a moment and the beam deflects.
//
// For a two-span continuous beam with thermal gradient on one span:
//   The interior support moment M_B != 0
//   Vertical reactions appear even though there is no applied load.
//
// Reference: Ghali & Neville, Ch. 4 (force method with thermal)

#[test]
fn validation_thermal_ext_3_continuous_beam_thermal() {
    let l = 5.0; // each span
    let n_per_span = 8;
    let dt_gradient = 30.0; // thermal gradient on span 1
    let total_n = n_per_span * 2;
    let n_nodes = total_n + 1;
    let mid_node = n_per_span + 1;

    // Build the continuous beam manually
    let elem_len_1 = l / n_per_span as f64;
    let elem_len_2 = l / n_per_span as f64;
    let mut nodes = Vec::new();
    for i in 0..=n_per_span {
        nodes.push((i + 1, i as f64 * elem_len_1, 0.0));
    }
    for i in 1..=n_per_span {
        nodes.push((n_per_span + 1 + i, l + i as f64 * elem_len_2, 0.0));
    }
    let elems: Vec<_> = (0..total_n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![
        (1, 1, "pinned"),
        (2, mid_node, "rollerX"),
        (3, n_nodes, "rollerX"),
    ];

    // Thermal gradient on span 1 only (elements 1..n_per_span)
    let mut loads = Vec::new();
    for i in 1..=n_per_span {
        loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_gradient,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of vertical reactions = 0 (no external vertical loads)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.1,
        "Thermal continuous beam: sum_Ry should be ~0: {:.6}", sum_ry);

    // Interior support develops reactions due to incompatible curvature
    // The beam should have nonzero moments (indeterminate structure)
    let max_moment = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    assert!(max_moment > 0.1,
        "Indeterminate beam under thermal gradient: moments should be induced, M_max={:.6}",
        max_moment);

    // Span 2 should deflect due to the transmitted moment, even though
    // it has no thermal load applied directly
    // Check that midspan of span 2 has nonzero deflection
    let mid_span2_node = n_per_span + 1 + n_per_span / 2;
    let d_mid_span2 = results.displacements.iter()
        .find(|d| d.node_id == mid_span2_node).unwrap();
    assert!(d_mid_span2.uz.abs() > 1e-8,
        "Thermal gradient on span 1 induces deflection in span 2: uy={:.6e}",
        d_mid_span2.uz);

    // Verify nonzero reaction at interior support
    let r_mid = results.reactions.iter()
        .find(|r| r.node_id == mid_node).unwrap();
    assert!(r_mid.rz.abs() > 0.01,
        "Interior support reaction from thermal gradient: Ry={:.6}", r_mid.rz);
}

// ================================================================
// 4. Portal Frame with Uniform Temperature on Beam Only
// ================================================================
//
// Portal frame (fixed-fixed bases), beam undergoes uniform DeltaT.
// The beam wants to expand, pushing the column tops apart.
// This creates horizontal reactions at the column bases.
//
// The horizontal reaction at each base can be estimated by modeling
// the columns as guided cantilevers (fixed base, translation at top).
// The beam thermal expansion: delta = alpha * DeltaT * W
// Each column resists with: H = 12*EI*delta/(2*h^3)  (shared between 2 columns)
//
// Reference: Roark's Formulas, Ch. 15; Ghali & Neville, Ch. 6

#[test]
fn validation_thermal_ext_4_portal_thermal() {
    let h = 4.0; // column height
    let w = 6.0; // beam span
    let dt = 30.0; // uniform temperature rise on beam

    // Portal frame: nodes 1(0,0) -> 2(0,h) -> 3(w,h) -> 4(w,0)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    // Thermal load on beam only (element 2)
    let loads = vec![SolverLoad::Thermal(SolverThermalLoad {
        element_id: 2,
        dt_uniform: dt,
        dt_gradient: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium checks
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_rx.abs() < 0.01,
        "Portal thermal: sum_Rx = 0: {:.6}", sum_rx);
    assert!(sum_ry.abs() < 0.01,
        "Portal thermal: sum_Ry = 0: {:.6}", sum_ry);

    // Column bases should have horizontal reactions (thermal pushes columns apart)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Reactions should be equal and opposite
    assert_close(r_left.rx, -r_right.rx, 0.03,
        "Portal thermal: Rx_left = -Rx_right");

    // Horizontal reactions should be nonzero
    assert!(r_left.rx.abs() > 0.01,
        "Portal thermal: horizontal reaction from beam thermal load: Rx_left={:.6}",
        r_left.rx);

    // The beam element should have axial force from thermal effects
    let ef_beam = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();
    assert!(ef_beam.n_start.abs() > 0.1,
        "Portal thermal: beam should have axial force from thermal load: N={:.4}",
        ef_beam.n_start);

    // Column top nodes should move due to thermal effects
    let d_left_top = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    let d_right_top = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    let relative_motion = (d_right_top.ux - d_left_top.ux).abs();
    assert!(relative_motion > 1e-6,
        "Portal thermal: column tops move relative to each other: delta_ux={:.6e}",
        relative_motion);

    // Columns should develop bending moments from thermal effects
    let ef_col_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    assert!(ef_col_left.m_start.abs().max(ef_col_left.m_end.abs()) > 0.01,
        "Portal thermal: columns develop bending moments: M_start={:.4}, M_end={:.4}",
        ef_col_left.m_start, ef_col_left.m_end);
}

// ================================================================
// 5. Propped Cantilever with Settlement at Roller
// ================================================================
//
// Cantilever beam (fixed at left, roller at right). The roller
// settles by delta downward.
//
// From slope-deflection method:
//   M_fixed = 3*EI*delta / (2*L^2)  (at the fixed end, restoring moment)
//   But from the propped cantilever settlement formula:
//   M_fixed = 3*EI*delta / L^2  (standard result for propped cantilever)
//   R_roller = 3*EI*delta / L^3
//
// The factor depends on convention. The standard propped cantilever
// settlement result (slope-deflection with one fixed, one roller) gives:
//   M_fixed = 3*EI*delta / L^2
//
// Reference: Ghali & Neville, Ch. 4; Kassimali, Ch. 13

#[test]
fn validation_thermal_ext_5_settlement_propped() {
    let l = 5.0;
    let n = 8;
    let delta: f64 = 0.005; // 5 mm settlement at roller
    let e_eff = E * 1000.0; // kN/m^2
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
        dx: None, dz: None, dry: None, angle: None,
    });
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });

    let mut nodes_map = HashMap::new();
    for &(id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, z: y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for &(id, ref t, ni, nj, mi, si, hs, he) in &elems {
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

    // M_fixed = 3*EI*delta / L^2
    let m_exact = 3.0 * ei * delta / (l * l);
    // R_roller = 3*EI*delta / L^3
    let v_exact = 3.0 * ei * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_left.my.abs(), m_exact, 0.03,
        &format!("Propped settlement: M_fixed = 3EI*delta/L^2 = {:.4}", m_exact));

    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_right.rz.abs(), v_exact, 0.03,
        &format!("Propped settlement: R_roller = 3EI*delta/L^3 = {:.4}", v_exact));

    // Prescribed displacement check
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uz, -delta, 0.01,
        "Prescribed settlement: uy at roller = -delta");

    // Equilibrium: sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < v_exact * 0.01,
        "Settlement equilibrium: sum_Ry={:.6}", sum_ry);
}

// ================================================================
// 6. Fixed-Fixed Beam with Settlement at One End
// ================================================================
//
// Fixed-fixed beam, right end settles by delta.
// From the slope-deflection method:
//   M = 6*EI*delta / L^2  (at each end, equal and opposite in sign)
//   V = 12*EI*delta / L^3 (constant shear)
//
// The moments at the two ends are equal in magnitude and opposite
// in sign (antisymmetric bending from chord rotation).
//
// Reference: Ghali & Neville, Ch. 4; Kassimali, Ch. 13

#[test]
fn validation_thermal_ext_6_double_settlement() {
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

    let mut nodes_map = HashMap::new();
    for &(id, x, y) in &nodes {
        nodes_map.insert(id.to_string(), SolverNode { id, x, z: y });
    }
    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems_map = HashMap::new();
    for &(id, ref t, ni, nj, mi, si, hs, he) in &elems {
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

    // M = 6*EI*delta / L^2
    let m_exact = 6.0 * ei * delta / (l * l);
    // V = 12*EI*delta / L^3
    let v_exact = 12.0 * ei * delta / (l * l * l);

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

    // Moments at both ends: equal magnitude = 6EI*delta/L^2
    assert_close(r_left.my.abs(), m_exact, 0.03,
        &format!("Fixed-fixed settlement: |M_left| = 6EI*delta/L^2 = {:.4}", m_exact));
    assert_close(r_right.my.abs(), m_exact, 0.03,
        &format!("Fixed-fixed settlement: |M_right| = 6EI*delta/L^2 = {:.4}", m_exact));

    // Both reaction moments have equal magnitude (chord rotation symmetry)
    let moment_diff = (r_left.my.abs() - r_right.my.abs()).abs();
    assert!(moment_diff < m_exact * 0.03,
        "Fixed-fixed settlement: |M_left| = |M_right|: diff={:.4}", moment_diff);

    // Shear = 12*EI*delta/L^3
    assert_close(r_left.rz.abs(), v_exact, 0.03,
        &format!("Fixed-fixed settlement: V = 12EI*delta/L^3 = {:.4}", v_exact));

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < v_exact * 0.01,
        "Settlement equilibrium: sum_Ry={:.6}", sum_ry);

    // Prescribed displacement
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap();
    assert_close(d_right.uz, -delta, 0.01,
        "Prescribed settlement: uy at right = -delta");
}

// ================================================================
// 7. Statically Indeterminate Truss (3-Bar) with Thermal Load
// ================================================================
//
// Three-bar truss: two symmetric outer bars at angle theta from the
// vertical, one vertical center bar. All bars meet at a single node.
// The center bar is heated by DeltaT.
//
// Since the structure is indeterminate (3 bars, 2 DOFs at central
// node), the thermal expansion of the center bar is partially
// restrained by the outer bars, creating forces in all members.
//
// For symmetric geometry with all bars having the same EA:
//   The center bar develops compressive force (restrained expansion)
//   The outer bars develop tensile force (pulling center node)
//
// We use frame elements (the solver only applies thermal FEF to
// frame elements), with hinges at both ends to simulate truss behavior.
//
// Reference: Timoshenko & Gere; Ghali & Neville, Ch. 4

#[test]
fn validation_thermal_ext_7_thermal_truss() {
    let l = 3.0; // length of center bar (vertical)
    let dt = 60.0; // temperature rise on center bar only
    let theta = 30.0_f64.to_radians(); // outer bars at 30 deg from vertical

    // Outer bar length
    let _l_outer = l / theta.cos();

    // Geometry:
    //   Node 1: bottom-left  (pin support)
    //   Node 2: bottom-center (pin support)
    //   Node 3: bottom-right  (pin support)
    //   Node 4: top-center    (free joint where bars meet)
    let half_w = l * theta.tan(); // horizontal offset of outer supports
    let nodes = vec![
        (1, -half_w, 0.0),  // left support
        (2, 0.0, 0.0),       // center support
        (3, half_w, 0.0),   // right support
        (4, 0.0, l),          // free joint at top
    ];

    // Frame elements with hinges at both ends (truss-like behavior)
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, true, true), // left outer bar
        (2, "frame", 2, 4, 1, 1, true, true), // center bar (vertical)
        (3, "frame", 3, 4, 1, 1, true, true), // right outer bar
    ];

    let sups = vec![
        (1, 1, "pinned"),
        (2, 2, "pinned"),
        (3, 3, "pinned"),
    ];

    // Thermal load on center bar only (element 2)
    let loads = vec![SolverLoad::Thermal(SolverThermalLoad {
        element_id: 2,
        dt_uniform: dt,
        dt_gradient: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_rx.abs() < 0.1,
        "Truss thermal: sum_Rx = 0: {:.6}", sum_rx);
    assert!(sum_ry.abs() < 0.1,
        "Truss thermal: sum_Ry = 0: {:.6}", sum_ry);

    // Center bar should be in compression (restrained thermal expansion)
    let ef_center = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();
    // n_start < 0 means compression in the convention N = tension positive
    // Since the bar wants to expand upward but the outer bars resist,
    // the center bar is compressed.
    assert!(ef_center.n_start.abs() > 0.1,
        "Truss thermal: center bar has axial force: N={:.4}", ef_center.n_start);

    // Outer bars should have equal forces (symmetry)
    let ef_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|ef| ef.element_id == 3).unwrap();
    assert_close(ef_left.n_start.abs(), ef_right.n_start.abs(), 0.05,
        "Truss thermal: symmetric outer bar forces");

    // All bars should have nonzero axial forces
    assert!(ef_left.n_start.abs() > 0.01,
        "Truss thermal: left bar has force: N={:.4}", ef_left.n_start);
    assert!(ef_right.n_start.abs() > 0.01,
        "Truss thermal: right bar has force: N={:.4}", ef_right.n_start);

    // The free joint (node 4) should have nonzero vertical displacement
    // from thermal effects on the center bar
    let d_top = results.displacements.iter()
        .find(|d| d.node_id == 4).unwrap();
    assert!(d_top.uz.abs() > 1e-6,
        "Truss thermal: top joint displaces vertically: uy={:.6e}", d_top.uz);

    // Analytical solution for symmetric 3-bar truss:
    // Compatibility + equilibrium with EA same for all bars, center bar heated.
    // Let u = vertical displacement of joint. Force in center bar:
    //   P_c = EA*(u/L - alpha*DeltaT)
    // Equilibrium:
    //   u = alpha*DeltaT*L / (1 + 2*cos^3(theta))
    //   |P_c| = 2*cos^3(theta) * alpha*DeltaT*EA / (1 + 2*cos^3(theta))
    let e_eff = E * 1000.0;
    let ea = e_eff * A;
    let cos_t = theta.cos();
    let p_center_analytical = 2.0 * cos_t.powi(3) * ALPHA * dt * ea
        / (1.0 + 2.0 * cos_t.powi(3));

    // Compare magnitude (center bar force should match analytical)
    assert_close(ef_center.n_start.abs(), p_center_analytical, 0.05,
        &format!("Truss thermal: center bar force = {:.4} kN (analytical)", p_center_analytical));
}

// ================================================================
// 8. Cantilever with Combined Mechanical + Thermal Loading
// ================================================================
//
// Cantilever beam with tip point load P (downward) and thermal
// gradient DeltaT_gradient. Verify superposition:
//   total deflection = mechanical + thermal components
//
// Mechanical tip deflection: delta_mech = P*L^3 / (3*EI)
// Thermal tip deflection:    delta_therm = alpha*DeltaT_g*L^2 / (2*h)
//
// Reference: Timoshenko & Gere; Roark's Formulas

#[test]
fn validation_thermal_ext_8_combined_thermal_mech() {
    let l = 6.0;
    let n = 10;
    let p = -10.0; // kN downward at tip
    let dt_gradient = 15.0; // degC thermal gradient
    let e_eff = E * 1000.0;
    let h = (12.0 * IZ / A).sqrt(); // section height (solver convention)

    // --- Mechanical only ---
    let loads_mech = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];
    let input_mech = make_beam(n, l, E, A, IZ, "fixed", None, loads_mech);
    let res_mech = linear::solve_2d(&input_mech).unwrap();

    // --- Thermal only ---
    let mut loads_therm = Vec::new();
    for i in 1..=n {
        loads_therm.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }
    let input_therm = make_beam(n, l, E, A, IZ, "fixed", None, loads_therm);
    let res_therm = linear::solve_2d(&input_therm).unwrap();

    // --- Combined ---
    let mut loads_combined = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: 0.0,
        fz: p,
        my: 0.0,
    })];
    for i in 1..=n {
        loads_combined.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient,
        }));
    }
    let input_combined = make_beam(n, l, E, A, IZ, "fixed", None, loads_combined);
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Tip deflections
    let tip = n + 1;
    let d_mech = res_mech.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz;
    let d_therm = res_therm.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz;
    let d_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz;

    // Verify superposition: combined = mech + therm
    let d_sum = d_mech + d_therm;
    let err = (d_combined - d_sum).abs() / d_combined.abs().max(1e-10);
    assert!(err < 0.02,
        "Superposition: combined={:.6e}, mech+therm={:.6e}, err={:.4}%",
        d_combined, d_sum, err * 100.0);

    // Verify mechanical component against formula: delta = PL^3 / (3*EI)
    let delta_mech_exact = p.abs() * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(d_mech.abs(), delta_mech_exact, 0.03,
        "Mechanical tip deflection: PL^3/(3EI)");

    // Verify thermal component against formula: delta = alpha*DeltaT_g*L^2/(2*h)
    let delta_therm_exact = ALPHA * dt_gradient * l * l / (2.0 * h);
    assert_close(d_therm.abs(), delta_therm_exact, 0.05,
        "Thermal tip deflection: alpha*DeltaT_g*L^2/(2h)");

    // Also verify reaction superposition
    let r_mech = res_mech.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_therm = res_therm.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_combined = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();

    let ry_sum = r_mech.rz + r_therm.rz;
    let err_ry = (r_combined.rz - ry_sum).abs() / r_combined.rz.abs().max(1e-6);
    assert!(err_ry < 0.02,
        "Reaction superposition Ry: combined={:.6}, sum={:.6}",
        r_combined.rz, ry_sum);

    let mz_sum = r_mech.my + r_therm.my;
    let err_mz = (r_combined.my - mz_sum).abs() / r_combined.my.abs().max(1e-6);
    assert!(err_mz < 0.02,
        "Reaction superposition Mz: combined={:.6}, sum={:.6}",
        r_combined.my, mz_sum);
}
