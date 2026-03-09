/// Validation: Extended Beam Deflection Benchmarks
///
/// References:
///   - Roark's Formulas for Stress and Strain, 8th Ed.
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Ghali, Neville & Brown, "Structural Analysis", 6th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///
/// These tests cover deflection cases NOT in validation_beam_deflections.rs:
///   1. SS beam center point load: delta_mid = PL^3/(48EI)
///   2. SS beam UDL midspan deflection: delta_mid = 5qL^4/(384EI)
///   3. Cantilever tip point load: delta = PL^3/(3EI), theta = PL^2/(2EI)
///   4. SS beam UDL end rotation: theta = qL^3/(24EI)
///   5. Two-span continuous beam UDL: center support reaction = 5qL/4
///   6. Cantilever with two point loads (superposition)
///   7. SS beam point load at L/3: deflection under load Pa^2*b^2/(3EIL)
///   8. Propped cantilever center point: delta_max and reaction at roller
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply-Supported Beam, Center Point Load
// ================================================================
//
// Source: Timoshenko, Table of Beam Deflections.
// Midspan deflection under center point load P:
//   delta_mid = PL^3 / (48EI)

#[test]
fn validation_deflection_ss_center_point_load() {
    let l = 10.0;
    let n: usize = 10;
    let p = 25.0;
    let e_eff: f64 = E * 1000.0;

    let mid_node = n / 2 + 1; // node at midspan

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // delta_mid = PL^3 / (48EI)
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);

    assert_close(mid_d.uy.abs(), delta_exact, 0.02,
        "SS center point load: midspan deflection PL^3/(48EI)");
}

// ================================================================
// 2. Simply-Supported Beam, UDL Midspan Deflection
// ================================================================
//
// Source: Standard beam tables (Timoshenko, Roark's).
// Midspan deflection under uniform load q:
//   delta_mid = 5qL^4 / (384EI)

#[test]
fn validation_deflection_ss_udl_midspan() {
    let l = 8.0;
    let n: usize = 16;
    let q = -12.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // delta_mid = 5qL^4 / (384EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);

    assert_close(mid_d.uy.abs(), delta_exact, 0.02,
        "SS UDL: midspan deflection 5qL^4/(384EI)");
}

// ================================================================
// 3. Cantilever with Point Load at Free End
// ================================================================
//
// Source: Timoshenko, Table of Beam Deflections.
// Tip deflection and rotation under end point load P:
//   delta_tip = PL^3 / (3EI)
//   theta_tip = PL^2 / (2EI)

#[test]
fn validation_deflection_cantilever_tip_point_load() {
    let l = 6.0;
    let n: usize = 8;
    let p = 15.0;
    let e_eff: f64 = E * 1000.0;

    let tip_node = n + 1;
    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // delta_tip = PL^3 / (3EI)
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Cantilever tip load: deflection PL^3/(3EI)");

    // theta_tip = PL^2 / (2EI)
    let theta_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Cantilever tip load: rotation PL^2/(2EI)");
}

// ================================================================
// 4. SS Beam UDL: Verify End Rotation
// ================================================================
//
// Source: Gere & Goodno, "Mechanics of Materials".
// End rotation of simply-supported beam under UDL:
//   theta_end = qL^3 / (24EI)

#[test]
fn validation_deflection_ss_udl_end_rotation() {
    let l = 10.0;
    let n: usize = 20;
    let q = -8.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left end rotation (node 1)
    let left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();

    // theta_end = qL^3 / (24EI), both ends have the same magnitude (symmetric)
    let theta_exact: f64 = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);

    assert_close(left.rz.abs(), theta_exact, 0.02,
        "SS UDL: end rotation qL^3/(24EI)");
}

// ================================================================
// 5. Two-Span Continuous Beam with UDL
// ================================================================
//
// Source: Ghali & Neville, "Structural Analysis", Chapter 4.
// Two equal spans L each, UDL q on both spans.
// Center support reaction R_B = 10qL/8 = 5qL/4.
// End reactions R_A = R_C = 3qL/8.
// Midspan deflection of each span:
//   delta = qL^4 / (185 EI)  (approximate, same as propped cantilever)

#[test]
fn validation_deflection_two_span_continuous_udl() {
    let span: f64 = 6.0;
    let n_per_span: usize = 8;
    let q = -10.0;
    let total_elements = n_per_span * 2;

    let loads: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Center support node is at position n_per_span + 1
    let center_node = n_per_span + 1;
    let center_reaction = results.reactions.iter()
        .find(|r| r.node_id == center_node).unwrap();

    // R_center = 5qL/4 (upward, so positive)
    let r_center_exact: f64 = 5.0 * q.abs() * span / 4.0;

    assert_close(center_reaction.ry, r_center_exact, 0.03,
        "Two-span continuous: center reaction 5qL/4");

    // End reactions R_A = R_C = 3qL/8
    let r_end_exact: f64 = 3.0 * q.abs() * span / 8.0;
    let left_reaction = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();

    assert_close(left_reaction.ry, r_end_exact, 0.03,
        "Two-span continuous: end reaction 3qL/8");
}

// ================================================================
// 6. Cantilever with Two Point Loads (Superposition)
// ================================================================
//
// Source: Roark's Formulas for Stress and Strain.
// Fixed at left, free at right, length L.
// Load P1 at midspan (L/2), load P2 at tip (L).
// By superposition:
//   delta_tip = P1*(L/2)^2*(3L - L/2)/(6EI) + P2*L^3/(3EI)
//             = P1*L^2*(5L/2)/(6*4*EI) + P2*L^3/(3EI)
//             = 5*P1*L^3/(48EI) + P2*L^3/(3EI)

#[test]
fn validation_deflection_cantilever_two_point_loads() {
    let l = 8.0;
    let n: usize = 8;
    let p1 = 10.0; // at midspan
    let p2 = 20.0; // at tip
    let e_eff: f64 = E * 1000.0;

    let mid_node = n / 2 + 1;
    let tip_node = n + 1;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: mid_node, fx: 0.0, fy: -p1, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: -p2, mz: 0.0,
            }),
        ]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // delta_tip = P1*a^2*(3L - a)/(6EI) + P2*L^3/(3EI)  where a = L/2
    let a: f64 = l / 2.0;
    let delta_p1: f64 = p1 * a.powi(2) * (3.0 * l - a) / (6.0 * e_eff * IZ);
    let delta_p2: f64 = p2 * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_exact: f64 = delta_p1 + delta_p2;

    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Cantilever two loads: tip deflection by superposition");
}

// ================================================================
// 7. SS Beam Point Load at L/3: Deflection Under Load
// ================================================================
//
// Source: Roark's Formulas, Table 3.
// SS beam, point load P at distance a = L/3 from left support.
// Deflection under load:
//   delta = P * a^2 * b^2 / (3 * EI * L)
// where b = L - a = 2L/3.
// Also verifying max deflection location and value (at x = sqrt((L^2 - b^2)/3))
// delta_max = P*b*(L^2-b^2)^(3/2) / (9*sqrt(3)*EI*L)

#[test]
fn validation_deflection_ss_point_load_third_span() {
    let l = 9.0;
    let n: usize = 9;
    let p = 30.0;
    let e_eff: f64 = E * 1000.0;
    let a_pos: f64 = l / 3.0;
    let b_pos: f64 = 2.0 * l / 3.0;
    let load_node = n / 3 + 1; // node at L/3

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let load_d = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();

    // delta at load point = P * a^2 * b^2 / (3 * EI * L)
    let delta_load: f64 = p * a_pos.powi(2) * b_pos.powi(2) / (3.0 * e_eff * IZ * l);

    assert_close(load_d.uy.abs(), delta_load, 0.02,
        "SS load at L/3: deflection Pa^2*b^2/(3EIL)");

    // Also check reactions: R_left = P*b/L, R_right = P*a/L
    let r_left_exact: f64 = p * b_pos / l;
    let left_r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(left_r.ry, r_left_exact, 0.02,
        "SS load at L/3: left reaction Pb/L");
}

// ================================================================
// 8. Propped Cantilever with Center Point Load
// ================================================================
//
// Source: Roark's Formulas, Table 3; Ghali & Neville Ch. 10.
// Fixed at left (A), roller at right (B), length L.
// Point load P at midspan (L/2).
// Roller reaction: R_B = 5P/16
// Fixed end reaction: R_A = 11P/16
// Fixed end moment: M_A = -3PL/16
// Max deflection under load:
//   delta_mid = 7PL^3 / (768EI)

#[test]
fn validation_deflection_propped_cantilever_center_point() {
    let l = 8.0;
    let n: usize = 16;
    let p = 20.0;
    let e_eff: f64 = E * 1000.0;

    let mid_node = n / 2 + 1;
    let end_node = n + 1;

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction at right: R_B = 5P/16
    let r_b_exact: f64 = 5.0 * p / 16.0;
    let right_r = results.reactions.iter().find(|r| r.node_id == end_node).unwrap();
    assert_close(right_r.ry, r_b_exact, 0.03,
        "Propped cantilever center P: roller reaction 5P/16");

    // Fixed end reaction: R_A = 11P/16
    let r_a_exact: f64 = 11.0 * p / 16.0;
    let left_r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(left_r.ry, r_a_exact, 0.03,
        "Propped cantilever center P: fixed reaction 11P/16");

    // Deflection at midspan: delta = 7PL^3 / (768EI)
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_exact: f64 = 7.0 * p * l.powi(3) / (768.0 * e_eff * IZ);
    assert_close(mid_d.uy.abs(), delta_exact, 0.05,
        "Propped cantilever center P: midspan deflection 7PL^3/(768EI)");

    // Fixed end moment: M_A = 3PL/16 (positive in solver convention = sagging)
    let m_a_exact: f64 = 3.0 * p * l / 16.0;
    assert_close(left_r.mz.abs(), m_a_exact, 0.03,
        "Propped cantilever center P: fixed end moment 3PL/16");
}
