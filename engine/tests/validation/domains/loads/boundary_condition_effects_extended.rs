/// Validation: Extended Boundary Condition Effects on Structural Behavior
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Ghali & Neville, "Structural Analysis", 7th Ed.
///   - AISC Steel Construction Manual, Table 3-23
///
/// These tests verify advanced boundary condition effects NOT covered in
/// the base boundary_condition_effects test file:
///   1. Support settlement induces moment M = 6EIδ/L² in fixed-fixed beam
///   2. Symmetric loading on symmetric structure yields symmetric reactions
///   3. Cantilever tip rotation under point load: θ = PL²/(2EI)
///   4. SS beam end rotation under UDL: θ = qL³/(24EI)
///   5. Internal hinge creates zero-moment point in a beam
///   6. Fixed-fixed beam with midspan point load: M_fixed = PL/8
///   7. Propped cantilever with point load: analytical reaction at roller
///   8. Cantilever with applied end moment: deflection δ = ML²/(2EI)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Support Settlement Induces Moment in Fixed-Fixed Beam
// ================================================================
//
// A fixed-fixed beam with no external load but a prescribed vertical
// settlement δ at one support develops end moments:
//   M = 6EIδ/L²
// and shear:
//   V = 12EIδ/L³
//
// Source: Ghali & Neville, Table of FEMs with settlement.

#[test]
fn validation_bce_settlement_moment() {
    let l: f64 = 6.0;
    let n = 8;
    let delta = 0.01; // 10mm settlement at right end (downward)
    let e_eff: f64 = E * 1000.0; // kN/m²

    let elem_len = l / n as f64;
    let mut nodes = HashMap::new();
    for i in 0..=n {
        nodes.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
        );
    }
    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = HashMap::new();
    for i in 0..n {
        elems.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }
    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n + 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: Some(-delta), dry: None, angle: None,
    });
    let input = SolverInput {
        nodes, materials: mats, sections: secs,
        elements: elems, supports: sups, loads: vec![], constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    // M = 6EIδ/L²
    let m_exact = 6.0 * e_eff * IZ * delta / (l * l);
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.my.abs(), m_exact, 0.05,
        "BCE settlement: M_left = 6EIδ/L²");
    assert_close(r2.my.abs(), m_exact, 0.05,
        "BCE settlement: M_right = 6EIδ/L²");

    // V = 12EIδ/L³
    let v_exact = 12.0 * e_eff * IZ * delta / (l * l * l);
    assert_close(r1.rz.abs(), v_exact, 0.05,
        "BCE settlement: V = 12EIδ/L³");
}

// ================================================================
// 2. Symmetric Loading on Symmetric Structure
// ================================================================
//
// A simply-supported beam with symmetric UDL must have equal vertical
// reactions at both ends: R = qL/2. The midspan deflection must be
// symmetric (node at L/4 deflects same as node at 3L/4).
//
// Source: Timoshenko, basic equilibrium and symmetry arguments.

#[test]
fn validation_bce_symmetric_reactions() {
    let l: f64 = 8.0;
    let n: usize = 8;
    let q: f64 = -12.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Both vertical reactions should equal qL/2
    let r_exact = q.abs() * l / 2.0;
    assert_close(r_left.rz, r_exact, 0.01,
        "BCE symmetric: R_left = qL/2");
    assert_close(r_right.rz, r_exact, 0.01,
        "BCE symmetric: R_right = qL/2");

    // Deflections at L/4 and 3L/4 should be equal by symmetry
    let n_quarter = n / 4 + 1;       // node at L/4
    let n_three_quarter = 3 * n / 4 + 1; // node at 3L/4
    let d_quarter = results.displacements.iter()
        .find(|d| d.node_id == n_quarter).unwrap().uz;
    let d_three_quarter = results.displacements.iter()
        .find(|d| d.node_id == n_three_quarter).unwrap().uz;

    let sym_err: f64 = (d_quarter - d_three_quarter).abs();
    assert!(sym_err < 1e-10,
        "BCE symmetric: deflection at L/4 ({:.6e}) = deflection at 3L/4 ({:.6e})",
        d_quarter, d_three_quarter);
}

// ================================================================
// 3. Cantilever Tip Rotation Under Point Load
// ================================================================
//
// Cantilever beam (fixed at left, free at right) with tip point load P:
//   θ_tip = PL²/(2EI)
//
// Source: Timoshenko, Table of Beam Deflections.

#[test]
fn validation_bce_cantilever_tip_rotation() {
    let l: f64 = 5.0;
    let n: usize = 10;
    let p: f64 = 15.0;
    let e_eff: f64 = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // θ_tip = PL²/(2EI)
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    // Negative rotation for downward load on cantilever extending along +x
    assert_close(tip.ry.abs(), theta_exact, 0.02,
        "BCE cantilever tip rotation: θ = PL²/(2EI)");

    // Also verify tip deflection: δ = PL³/(3EI)
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02,
        "BCE cantilever tip deflection: δ = PL³/(3EI)");
}

// ================================================================
// 4. Simply-Supported Beam End Rotation Under UDL
// ================================================================
//
// SS beam with UDL q:
//   θ_end = qL³/(24EI) at each support
//
// Source: AISC Manual, Table 3-23.

#[test]
fn validation_bce_ss_end_rotation_udl() {
    let l: f64 = 6.0;
    let n: usize = 12;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let d_left = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // θ = qL³/(24EI) (magnitude)
    let theta_exact = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);

    assert_close(d_left.ry.abs(), theta_exact, 0.02,
        "BCE SS end rotation left: θ = qL³/(24EI)");
    assert_close(d_right.ry.abs(), theta_exact, 0.02,
        "BCE SS end rotation right: θ = qL³/(24EI)");

    // Both rotations should have equal magnitude (symmetric loading)
    let rot_diff: f64 = (d_left.ry.abs() - d_right.ry.abs()).abs();
    assert!(rot_diff < 1e-10,
        "BCE SS end rotations equal by symmetry: diff = {:.6e}", rot_diff);
}

// ================================================================
// 5. Internal Hinge Creates Zero-Moment Point
// ================================================================
//
// A continuous two-span beam (pinned-roller-roller) with an internal
// hinge at midspan of the first span. The hinge cannot transmit moment,
// so the bending moment at the hinge must be zero.
//
// Source: Gere & Goodno, internal releases in beams.

#[test]
fn validation_bce_internal_hinge_zero_moment() {
    let l: f64 = 8.0;
    let n: usize = 8; // elements per span
    let q: f64 = -10.0;

    // Build a single-span beam with a hinge at midspan.
    // Pinned at left, rollerX at right, hinge at element boundary at midspan.
    let n_total = n;
    let elem_len = l / n_total as f64;
    let hinge_elem = n_total / 2; // element just before midspan node

    let mut nodes_vec = Vec::new();
    for i in 0..=n_total {
        nodes_vec.push((i + 1, i as f64 * elem_len, 0.0));
    }

    let mut elems_vec = Vec::new();
    for i in 0..n_total {
        // Place hinge at the midspan node boundary:
        //   hinge_end on element before midspan node,
        //   hinge_start on element after midspan node.
        if i + 1 == hinge_elem {
            elems_vec.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, true));
        } else if i == hinge_elem {
            elems_vec.push((i + 1, "frame", i + 1, i + 2, 1, 1, true, false));
        } else {
            elems_vec.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
        }
    }

    let sups_vec = vec![(1, 1, "pinned"), (2, n_total + 1, "rollerX")];

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_input(nodes_vec, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_vec, sups_vec, loads);
    let results = linear::solve_2d(&input).unwrap();

    // At the hinge node (midspan), bending moment must be zero.
    // Check the element just before the hinge: m_end should be ~0.
    let ef_before = results.element_forces.iter()
        .find(|e| e.element_id == hinge_elem).unwrap();
    assert!(ef_before.m_end.abs() < 0.1,
        "BCE internal hinge: m_end at hinge = {:.6e}, expected ~0", ef_before.m_end);

    // Check the element just after the hinge: m_start should be ~0.
    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == hinge_elem + 1).unwrap();
    assert!(ef_after.m_start.abs() < 0.1,
        "BCE internal hinge: m_start at hinge = {:.6e}, expected ~0", ef_after.m_start);

    // The beam should deflect MORE than a normal SS beam (hinge reduces stiffness)
    let input_no_hinge = make_ss_beam_udl(n_total, l, E, A, IZ, q);
    let results_no_hinge = linear::solve_2d(&input_no_hinge).unwrap();

    let max_hinge: f64 = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    let max_no_hinge: f64 = results_no_hinge.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    assert!(max_hinge > max_no_hinge,
        "BCE internal hinge increases deflection: {:.6e} > {:.6e}", max_hinge, max_no_hinge);
}

// ================================================================
// 6. Fixed-Fixed Beam with Midspan Point Load
// ================================================================
//
// Fixed-fixed beam with point load P at midspan:
//   R_each = P/2 (symmetry)
//   M_fixed = PL/8 (each end)
//   δ_mid = PL³/(192 EI)
//
// Source: AISC Manual, Table 3-23, Case 13.

#[test]
fn validation_bce_fixed_fixed_midspan_point_load() {
    let l: f64 = 6.0;
    let n: usize = 8;
    let p: f64 = 20.0;
    let e_eff: f64 = E * 1000.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R = P/2 each
    assert_close(r1.rz, p / 2.0, 0.02,
        "BCE fixed-fixed P mid: R_left = P/2");
    assert_close(r2.rz, p / 2.0, 0.02,
        "BCE fixed-fixed P mid: R_right = P/2");

    // M_fixed = PL/8
    let m_exact = p * l / 8.0;
    assert_close(r1.my.abs(), m_exact, 0.02,
        "BCE fixed-fixed P mid: M_left = PL/8");
    assert_close(r2.my.abs(), m_exact, 0.02,
        "BCE fixed-fixed P mid: M_right = PL/8");

    // δ_mid = PL³/(192 EI)
    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();
    assert_close(d_mid.uz.abs(), delta_exact, 0.05,
        "BCE fixed-fixed P mid: δ = PL³/(192EI)");
}

// ================================================================
// 7. Propped Cantilever with Midspan Point Load
// ================================================================
//
// Propped cantilever (fixed left, roller right) with point load P
// at midspan (a = L/2):
//   R_roller = P * a² * (3L - a) / (2L³) = P/2 * (1/4)*(3-1/2)/(1) = 5P/16
//   where a = L/2:
//   R_B = P*(L/2)²*(3L - L/2)/(2L³) = P*L²/4 * 5L/2 / (2L³) = 5P/16
//
// Source: Ghali & Neville, propped cantilever with concentrated load.

#[test]
fn validation_bce_propped_cantilever_point_load() {
    let l: f64 = 8.0;
    let n: usize = 16;
    let p: f64 = 24.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // R_roller (right end) = 5P/16 for load at midspan
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap();
    let rb_exact = 5.0 * p / 16.0;
    assert_close(r_right.rz, rb_exact, 0.02,
        "BCE propped cantilever: R_roller = 5P/16");

    // R_fixed (left end) = P - 5P/16 = 11P/16
    let r_left = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let ra_exact = 11.0 * p / 16.0;
    assert_close(r_left.rz, ra_exact, 0.02,
        "BCE propped cantilever: R_fixed = 11P/16");

    // Fixed-end moment: M_A = 3PL/16 for load at midspan
    let ma_exact = 3.0 * p * l / 16.0;
    // The fixed end moment should be negative (hogging) for downward load
    assert_close(r_left.my.abs(), ma_exact, 0.05,
        "BCE propped cantilever: M_fixed = 3PL/16");
}

// ================================================================
// 8. Cantilever with Applied End Moment
// ================================================================
//
// Cantilever beam with applied moment M at the free end:
//   δ_tip = ML²/(2EI)  (upward or downward depending on sign)
//   θ_tip = ML/(EI)
//   Shear = 0 everywhere (only moment, no transverse load)
//
// Source: Timoshenko, Table of Beam Deflections.

#[test]
fn validation_bce_cantilever_end_moment() {
    let l: f64 = 5.0;
    let n: usize = 8;
    let m_app: f64 = 10.0; // Applied moment at free end (kN*m)
    let e_eff: f64 = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: 0.0, my: m_app,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // δ_tip = ML²/(2EI)
    let delta_exact = m_app * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02,
        "BCE cantilever moment: δ = ML²/(2EI)");

    // θ_tip = ML/(EI)
    let theta_exact = m_app * l / (e_eff * IZ);
    assert_close(tip.ry.abs(), theta_exact, 0.02,
        "BCE cantilever moment: θ = ML/(EI)");

    // Shear should be zero in all elements (pure bending)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-6,
            "BCE cantilever moment: V_start of element {} = {:.6e}, expected ~0",
            ef.element_id, ef.v_start);
        assert!(ef.v_end.abs() < 1e-6,
            "BCE cantilever moment: V_end of element {} = {:.6e}, expected ~0",
            ef.element_id, ef.v_end);
    }

    // Reaction moment at fixed end should equal applied moment (equilibrium)
    let r_fixed = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.my.abs(), m_app, 0.01,
        "BCE cantilever moment: reaction M = applied M");
    // No vertical reaction (no transverse load)
    assert!(r_fixed.rz.abs() < 1e-6,
        "BCE cantilever moment: R_y = {:.6e}, expected ~0", r_fixed.rz);
}
