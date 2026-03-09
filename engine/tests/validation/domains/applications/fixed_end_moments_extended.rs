/// Validation: Extended Fixed-End Moment Formulas
///
/// References:
///   - AISC Steel Construction Manual, Table 3-23
///   - Ghali & Neville, "Structural Analysis", Appendix D
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed.
///
/// Tests verify extended FEM cases beyond the basic file:
///   1. Fixed-fixed beam with two symmetric point loads: M = Pa(L-a)/L^2 * (L-a+a)... Pab(a+L)/(2L^2) etc.
///   2. Fixed-fixed beam midspan deflection under UDL: delta = qL^4/(384EI)
///   3. Cantilever UDL: tip deflection = qL^4/(8EI), base moment = qL^2/2
///   4. Propped cantilever midspan point: R_prop = 5P/16, M_fixed = 3PL/16
///   5. Fixed-fixed beam: midspan moment = qL^2/24 (sagging) for UDL
///   6. Two-span continuous beam with UDL: interior moment = qL^2/8
///   7. Cantilever with tip point load: delta = PL^3/(3EI)
///   8. Fixed-fixed beam with quarter-point loads: symmetric reaction check
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Fixed-Fixed Beam with Two Symmetric Point Loads
// ================================================================
//
// Reference: AISC Table 3-23, Case 13
// Fixed-fixed beam, length L, two equal loads P at distance a from
// each end (symmetric placement).
// By symmetry: R_left = R_right = P (each support carries one load).
// FEM at each end (by superposition of two eccentric loads):
//   M = P*a*(L-a)^2/L^2 + P*(L-a)*a^2/L^2 = P*a*(L-a)/L^2 * ((L-a) + a) = P*a*(L-a)/L
// Since loads are at a from each end (symmetric), the end moments are equal.

#[test]
fn validation_fem_ext_two_symmetric_point_loads() {
    let l = 12.0;
    let n = 12;
    let p = 30.0;
    // Load at L/4 from each end: a = 3.0, so nodes 4 and 10
    let a_dist = l / 4.0;

    let load_node_left = 4;   // x = 3.0
    let load_node_right = 10; // x = 9.0

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_left, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node_right, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // By symmetry each support carries P
    assert_close(r1.ry, p, 0.02, "Two sym loads: R_left = P");
    assert_close(r_end.ry, p, 0.02, "Two sym loads: R_right = P");

    // End moment by superposition:
    // For left load at a from left: M_left = P*a*b^2/L^2 where b = L - a
    // For right load at (L-a) from left: M_left = P*(L-a)*a^2/L^2
    // Total M_left = P*a*(L-a)^2/L^2 + P*(L-a)*a^2/L^2 = P*a*(L-a)/L
    let b_dist = l - a_dist;
    let m_end = p * a_dist * b_dist / l;
    // By symmetry, both end moments should be equal
    assert_close(r1.mz.abs(), m_end, 0.03, "Two sym loads: M_left = Pa(L-a)/L");
    assert_close(r_end.mz.abs(), m_end, 0.03, "Two sym loads: M_right = Pa(L-a)/L");

    // Vertical equilibrium: sum = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Two sym loads: ΣRy = 2P");
}

// ================================================================
// 2. Fixed-Fixed Beam UDL: Midspan Deflection
// ================================================================
//
// Reference: Timoshenko, Table of Beam Deflections
// Fixed-fixed beam with UDL q. Midspan deflection:
//   delta_max = qL^4 / (384 EI)
// This is 5x smaller than the simply-supported case.

#[test]
fn validation_fem_ext_fixed_fixed_udl_deflection() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -15.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1; // node 6 at x = 5.0
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // delta_max = q*L^4 / (384*E*I)
    let delta_exact: f64 = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(mid_d.uy.abs(), delta_exact, 0.03,
        "FF UDL deflection: delta = qL^4/(384EI)");

    // Also verify end moments: M = qL^2/12
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let fem: f64 = q.abs() * l * l / 12.0;
    assert_close(r1.mz.abs(), fem, 0.02, "FF UDL: M_end = qL^2/12");
}

// ================================================================
// 3. Cantilever with UDL: Tip Deflection and Base Moment
// ================================================================
//
// Reference: Timoshenko, "Strength of Materials"
// Cantilever (fixed at left, free at right) with UDL q:
//   delta_tip = qL^4 / (8 EI)
//   theta_tip = qL^3 / (6 EI)
//   M_base = qL^2 / 2
//   R_base = qL

#[test]
fn validation_fem_ext_cantilever_udl() {
    let l = 6.0;
    let n = 6;
    let q: f64 = -20.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    // Fixed at left, free at right (no end support)
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // delta_tip = qL^4 / (8EI)
    let delta_exact: f64 = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Cantilever UDL: delta_tip = qL^4/(8EI)");

    // theta_tip = qL^3 / (6EI)
    let theta_exact: f64 = q.abs() * l.powi(3) / (6.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Cantilever UDL: theta_tip = qL^3/(6EI)");

    // Base reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_base: f64 = q.abs() * l * l / 2.0;
    let r_base: f64 = q.abs() * l;
    assert_close(r1.mz.abs(), m_base, 0.02, "Cantilever UDL: M_base = qL^2/2");
    assert_close(r1.ry, r_base, 0.02, "Cantilever UDL: R_base = qL");
}

// ================================================================
// 4. Propped Cantilever with Midspan Point Load
// ================================================================
//
// Reference: McCormac & Nelson, "Structural Analysis"
// Fixed at left, rollerX at right. Point load P at midspan.
//   R_roller = 5P/16
//   R_fixed = 11P/16
//   M_fixed = 3PL/16

#[test]
fn validation_fem_ext_propped_cantilever_midspan_point() {
    let l = 10.0;
    let n = 10;
    let p = 40.0;

    let mid = n / 2 + 1; // node 6 at x = 5.0
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_roller = 5P/16
    let r_roller = 5.0 * p / 16.0;
    assert_close(r_end.ry, r_roller, 0.02,
        "Propped midspan P: R_roller = 5P/16");

    // R_fixed = 11P/16
    let r_fixed = 11.0 * p / 16.0;
    assert_close(r1.ry, r_fixed, 0.02,
        "Propped midspan P: R_fixed = 11P/16");

    // M_fixed = 3PL/16
    let m_fixed = 3.0 * p * l / 16.0;
    assert_close(r1.mz.abs(), m_fixed, 0.02,
        "Propped midspan P: M_fixed = 3PL/16");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Propped midspan P: ΣRy = P");
}

// ================================================================
// 5. Fixed-Fixed Beam UDL: Midspan Sagging Moment
// ================================================================
//
// Reference: AISC Table 3-23, Case 1
// Fixed-fixed beam with UDL q:
//   End hogging moment = qL^2/12
//   Midspan sagging moment = qL^2/24
// The midspan moment is checked via element forces at the middle element.

#[test]
fn validation_fem_ext_fixed_fixed_midspan_moment() {
    let l = 12.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments (hogging) = qL^2/12
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let m_end: f64 = q.abs() * l * l / 12.0;
    assert_close(r1.mz.abs(), m_end, 0.02, "FF UDL: hogging M_end = qL^2/12");
    assert_close(r_end.mz.abs(), m_end, 0.02, "FF UDL: hogging M_end_B = qL^2/12");

    // Midspan sagging moment = qL^2/24
    // At the midspan element (element n/2), the end moment m_end gives the
    // internal moment at the center. Check element forces at element n/2.
    let mid_elem = n / 2; // element 6, spans from node 6 to node 7
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    // The moment at the end of element n/2 (= start of the right half) should
    // be the midspan moment. m_end of element 6 is at node 7 (midspan).
    let m_mid_exact: f64 = q.abs() * l * l / 24.0;
    // m_end is the moment at the right end of the element (node 7 = midspan)
    assert_close(ef.m_end.abs(), m_mid_exact, 0.05,
        "FF UDL: midspan sagging M = qL^2/24");
}

// ================================================================
// 6. Two-Span Continuous Beam with UDL
// ================================================================
//
// Reference: Ghali & Neville, "Structural Analysis"
// Two equal spans L, UDL q on both spans. Supports: pinned, rollerX, rollerX.
// Interior support moment = qL^2/8 (by three-moment equation).
// End reactions = 3qL/8, interior reaction = 10qL/8 = 5qL/4.

#[test]
fn validation_fem_ext_two_span_continuous_udl() {
    let span = 8.0;
    let n_per_span = 8;
    let q: f64 = -12.0;
    let total_n = n_per_span * 2;

    // Apply UDL to all elements
    let loads: Vec<SolverLoad> = (1..=total_n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let interior_node = n_per_span + 1; // node 9, at x = 8.0
    let r_interior = results.reactions.iter()
        .find(|r| r.node_id == interior_node).unwrap();
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == total_n + 1).unwrap();

    // Interior reaction = 5qL/4
    let r_int_exact: f64 = 5.0 * q.abs() * span / 4.0;
    assert_close(r_interior.ry, r_int_exact, 0.02,
        "2-span UDL: R_interior = 5qL/4");

    // End reactions = 3qL/8
    let r_end_exact: f64 = 3.0 * q.abs() * span / 8.0;
    assert_close(r_left.ry, r_end_exact, 0.02, "2-span UDL: R_left = 3qL/8");
    assert_close(r_right.ry, r_end_exact, 0.02, "2-span UDL: R_right = 3qL/8");

    // Total vertical equilibrium: 2 * qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load: f64 = q.abs() * span * 2.0;
    assert_close(sum_ry, total_load, 0.01, "2-span UDL: ΣRy = 2qL");
}

// ================================================================
// 7. Cantilever with Tip Point Load: Deflection and Rotation
// ================================================================
//
// Reference: Timoshenko, "Strength of Materials"
// Cantilever (fixed at left, free at right) with point load P at tip:
//   delta_tip = PL^3 / (3 EI)
//   theta_tip = PL^2 / (2 EI)
//   M_base = PL
//   R_base = P

#[test]
fn validation_fem_ext_cantilever_tip_point() {
    let l = 8.0;
    let n = 8;
    let p = 50.0;
    let e_eff: f64 = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // delta_tip = PL^3 / (3EI)
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Cantilever tip P: delta = PL^3/(3EI)");

    // theta_tip = PL^2 / (2EI)
    let theta_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Cantilever tip P: theta = PL^2/(2EI)");

    // Base reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, p, 0.01, "Cantilever tip P: R_base = P");
    assert_close(r1.mz.abs(), p * l, 0.01, "Cantilever tip P: M_base = PL");
}

// ================================================================
// 8. Fixed-Fixed Beam with Quarter-Point Loads (4-Point Bending)
// ================================================================
//
// Reference: McCormac & Nelson, "Structural Analysis"
// Fixed-fixed beam, length L, equal loads P at L/4 and 3L/4.
// By symmetry: R_left = R_right = P.
// Superposing eccentric load formula M_left = Pab^2/L^2 for each load:
//   Load at a=L/4: M_left = P*(L/4)*(3L/4)^2/L^2 = 9PL/64
//   Load at a=3L/4: M_left = P*(3L/4)*(L/4)^2/L^2 = 3PL/64
//   Total M_left = 9PL/64 + 3PL/64 = 12PL/64 = 3PL/16
// By symmetry M_right = M_left = 3PL/16.

#[test]
fn validation_fem_ext_quarter_point_loads() {
    let l = 16.0;
    let n = 16;
    let p = 24.0;

    // Loads at L/4 = node 5, and 3L/4 = node 13
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 13, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Each support carries P by symmetry
    assert_close(r1.ry, p, 0.02, "Quarter-point: R_left = P");
    assert_close(r_end.ry, p, 0.02, "Quarter-point: R_right = P");

    // End moments = 3PL/16
    let m_end: f64 = 3.0 * p * l / 16.0;
    assert_close(r1.mz.abs(), m_end, 0.03, "Quarter-point: M_left = 3PL/16");
    assert_close(r_end.mz.abs(), m_end, 0.03, "Quarter-point: M_right = 3PL/16");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Quarter-point: ΣRy = 2P");
}
