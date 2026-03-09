/// Validation: Propped Cantilever Extended Tests
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9-10
///   - Timoshenko & Young, "Theory of Structures", Ch. 5
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 10-12
///   - Ghali & Neville, "Structural Analysis", Ch. 4
///
/// Extended tests for the propped cantilever (fixed at A, roller at B).
/// Each test verifies solver output against a closed-form analytical formula.
///
/// Tests:
///   1. UDL midspan deflection: delta_mid = qL^4/(192EI)
///   2. Quarter-point load: R_B = Pa^2(3L-a)/(2L^3) with a = L/4
///   3. Two symmetric point loads: superposition of individual reactions
///   4. Roller-end slope under UDL: theta_B = qL^3/(48EI)
///   5. Shear force at fixed end under UDL: V_A = 5qL/8
///   6. Point load at 3L/4 from fixed end: reactions and fixed-end moment
///   7. Zero-shear point location and maximum sagging moment under UDL
///   8. Moment equilibrium check: sum of moments about A = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. UDL Midspan Deflection
// ================================================================
//
// Propped cantilever (fixed A, roller B) with UDL q (downward).
// Deflection at midspan: delta_mid = qL^4 / (192 EI)
// Reference: Timoshenko & Young, Table of Beam Deflections

#[test]
fn validation_propped_ext_udl_midspan_deflection() {
    let l = 6.0;
    let n = 24;
    let q: f64 = -12.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan node
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    // delta_mid = qL^4 / (192 EI)
    let delta_exact = q.abs() * l.powi(4) / (192.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.03,
        "Propped ext UDL midspan deflection: qL^4/(192EI)");
}

// ================================================================
// 2. Quarter-Point Load
// ================================================================
//
// Load P at a = L/4 from fixed end.
// R_B = Pa^2(3L-a) / (2L^3)
// M_A = Pab(L+b) / (2L^2) where b = L - a
// Reference: Hibbeler, Structural Analysis, Table of Fixed-Roller Beams

#[test]
fn validation_propped_ext_quarter_point_load() {
    let l = 8.0;
    let n = 16;
    let p = 24.0;
    let a_val: f64 = l / 4.0;
    let b_val: f64 = l - a_val;

    let load_node = (n as f64 / 4.0).round() as usize + 1; // node at L/4

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = Pa^2(3L - a) / (2L^3)
    let r_b_exact = p * a_val.powi(2) * (3.0 * l - a_val) / (2.0 * l.powi(3));
    assert_close(r_b.ry, r_b_exact, 0.03,
        "Propped ext quarter load: R_B = Pa^2(3L-a)/(2L^3)");

    // R_A = P - R_B
    let r_a_exact = p - r_b_exact;
    assert_close(r_a.ry, r_a_exact, 0.03,
        "Propped ext quarter load: R_A = P - R_B");

    // M_A = Pab(L+b) / (2L^2)
    let m_a_exact = p * a_val * b_val * (l + b_val) / (2.0 * l.powi(2));
    assert_close(r_a.mz.abs(), m_a_exact, 0.05,
        "Propped ext quarter load: M_A = Pab(L+b)/(2L^2)");
}

// ================================================================
// 3. Two Symmetric Point Loads (Superposition)
// ================================================================
//
// Two equal loads P at L/3 and 2L/3 from fixed end.
// By superposition: R_B = sum of R_B for each load individually.
// R_B_i = P * a_i^2 * (3L - a_i) / (2L^3)
// Reference: Superposition principle, Gere & Goodno Ch. 9

#[test]
fn validation_propped_ext_two_symmetric_loads() {
    let l = 9.0;
    let n = 18;
    let p = 10.0;

    let node_1 = n / 3 + 1;     // at L/3
    let node_2 = 2 * n / 3 + 1; // at 2L/3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Superposition: R_B = R_B1 + R_B2
    let a1: f64 = l / 3.0;
    let a2: f64 = 2.0 * l / 3.0;
    let r_b1 = p * a1.powi(2) * (3.0 * l - a1) / (2.0 * l.powi(3));
    let r_b2 = p * a2.powi(2) * (3.0 * l - a2) / (2.0 * l.powi(3));
    let r_b_exact = r_b1 + r_b2;
    assert_close(r_b.ry, r_b_exact, 0.03,
        "Propped ext two loads: R_B by superposition");

    // Vertical equilibrium: R_A + R_B = 2P
    assert_close(r_a.ry + r_b.ry, 2.0 * p, 0.02,
        "Propped ext two loads: R_A + R_B = 2P");
}

// ================================================================
// 4. Roller-End Slope Under UDL
// ================================================================
//
// Propped cantilever with UDL: slope at roller end (B).
// theta_B = qL^3 / (48EI)
// Reference: Gere & Goodno, Beam Deflection Tables

#[test]
fn validation_propped_ext_roller_end_slope() {
    let l = 8.0;
    let n = 32;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Slope at roller end (last node)
    let d_b = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // theta_B = qL^3 / (48EI)
    let theta_exact = q.abs() * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_b.rz.abs(), theta_exact, 0.03,
        "Propped ext roller slope: theta_B = qL^3/(48EI)");
}

// ================================================================
// 5. Shear Force at Fixed End Under UDL
// ================================================================
//
// V_A = 5qL/8 (upward, i.e., positive in our convention since load is downward)
// The first element's v_start should equal R_A = 5qL/8
// Reference: Beer & Johnston, Mechanics of Materials, Ch. 9

#[test]
fn validation_propped_ext_shear_at_fixed_end() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -8.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // R_A = 5qL/8 (upward reaction for downward load)
    let r_a_exact = 5.0 * q.abs() * l / 8.0;
    assert_close(r_a.ry, r_a_exact, 0.02,
        "Propped ext shear: R_A = 5qL/8");

    // R_B = 3qL/8
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_b_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02,
        "Propped ext shear: R_B = 3qL/8");

    // Equilibrium: R_A + R_B = qL
    assert_close(r_a.ry + r_b.ry, q.abs() * l, 0.02,
        "Propped ext shear: equilibrium R_A + R_B = qL");
}

// ================================================================
// 6. Point Load at 3L/4 From Fixed End
// ================================================================
//
// Load P at a = 3L/4 from fixed end (b = L/4 from roller).
// R_B = Pa^2(3L - a) / (2L^3)
// M_A = Pab(L + b) / (2L^2)
// Reference: Hibbeler, Structural Analysis, Table of Beam Formulas

#[test]
fn validation_propped_ext_three_quarter_load() {
    let l = 12.0;
    let n = 24;
    let p = 30.0;
    let a_val: f64 = 3.0 * l / 4.0;
    let b_val: f64 = l - a_val;

    let load_node = (3 * n / 4) + 1; // node at 3L/4

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = Pa^2(3L - a) / (2L^3)
    let r_b_exact = p * a_val.powi(2) * (3.0 * l - a_val) / (2.0 * l.powi(3));
    assert_close(r_b.ry, r_b_exact, 0.03,
        "Propped ext 3L/4 load: R_B");

    // R_A = P - R_B
    let r_a_exact = p - r_b_exact;
    assert_close(r_a.ry, r_a_exact, 0.03,
        "Propped ext 3L/4 load: R_A = P - R_B");

    // M_A = Pab(L + b) / (2L^2)
    let m_a_exact = p * a_val * b_val * (l + b_val) / (2.0 * l.powi(2));
    assert_close(r_a.mz.abs(), m_a_exact, 0.05,
        "Propped ext 3L/4 load: M_A");
}

// ================================================================
// 7. UDL: Zero-Shear Point Location and Maximum Sagging Moment
// ================================================================
//
// Propped cantilever with UDL q (downward), fixed at A, roller at B.
// Shear = R_A - q*x = 0  =>  x_0 = R_A / q = 5L/8
// (where R_A = 5qL/8 and we measure from the fixed end)
// Maximum sagging moment at x_0: M_max = R_A * x_0 - M_A - q*x_0^2/2
//   = (5qL/8)(5L/8) - qL^2/8 - q(5L/8)^2/2
//   = 9qL^2/128
// Reference: Gere & Goodno, "Mechanics of Materials", Ch. 9

#[test]
fn validation_propped_ext_max_sagging_moment() {
    let l = 8.0;
    let n = 32; // fine mesh
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Zero-shear point at x = 5L/8 from fixed end
    // This is element number (5/8)*n = 20, at node 21
    let x0_frac: f64 = 5.0 / 8.0;
    let x0_node = (x0_frac * n as f64).round() as usize + 1;

    // Find the element just before the zero-shear node
    let ef_at_x0 = results.element_forces.iter()
        .find(|e| e.element_id == x0_node - 1).unwrap();

    // Maximum sagging moment = 9qL^2/128
    let m_max_exact = 9.0 * q.abs() * l.powi(2) / 128.0;

    // The moment at the end of this element should be close to M_max
    // (m_end is the moment at the right end of the element)
    assert_close(ef_at_x0.m_end.abs(), m_max_exact, 0.05,
        "Propped ext max sag moment: M_max = 9qL^2/128");

    // Also verify R_A = 5qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, 5.0 * q.abs() * l / 8.0, 0.02,
        "Propped ext max sag moment: R_A = 5qL/8");
}

// ================================================================
// 8. Moment Equilibrium About Fixed End Under UDL
// ================================================================
//
// For propped cantilever with UDL q over length L:
//   R_B = 3qL/8,  M_A = qL^2/8
// Moment about A: R_B * L - q*L * L/2 + M_A = 0
// i.e., R_B * L = q*L^2/2 - M_A
// This verifies internal consistency of the solver results.
// Reference: Equilibrium equations, Gere & Goodno Ch. 9

#[test]
fn validation_propped_ext_moment_equilibrium() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -15.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Verify analytical values first
    let r_b_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02,
        "Propped ext equil: R_B = 3qL/8");

    let m_a_exact = q.abs() * l.powi(2) / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02,
        "Propped ext equil: M_A = qL^2/8");

    // Moment equilibrium about A (taking CCW as positive):
    //   R_B * L  (CCW from upward force at distance L)
    // - q*L * L/2  (CW from total downward load at centroid L/2)
    // - M_A  (CW reaction moment at fixed end)
    // = 0
    //
    // Using solver values (with sign conventions):
    //   R_B.ry is positive (upward), contributes +R_B*L
    //   Total load = |q|*L downward at L/2, contributes -|q|*L*(L/2)
    //   M_A: r_a.mz is the reaction moment (negative = CW for sagging)
    //
    // Check: R_B*L + M_A_reaction - |q|*L^2/2 = 0
    let moment_sum = r_b.ry * l + r_a.mz - q.abs() * l.powi(2) / 2.0;
    assert!(moment_sum.abs() < 1.0,
        "Propped ext equil: moment about A = {:.6}, expected ~0", moment_sum);

    // Also check vertical equilibrium: R_A + R_B = |q|*L
    assert_close(r_a.ry + r_b.ry, q.abs() * l, 0.02,
        "Propped ext equil: vertical R_A + R_B = qL");
}
