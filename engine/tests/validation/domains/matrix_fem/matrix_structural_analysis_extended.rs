/// Validation: Extended Matrix Structural Analysis (Solver-based)
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Dover
///   - Kassimali, "Matrix Analysis of Structures", 2nd Ed.
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed.
///   - Ghali & Neville, "Structural Analysis", 7th Ed.
///
/// Tests verify solver output against closed-form textbook solutions for
/// deflections, reactions, element forces, and rotations.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Simply-Supported Beam with UDL: Midspan Deflection and End Rotation
// ================================================================
//
// Reference: Ghali & Neville, Table 5.1.
// SS beam of length L with uniform load q (downward).
//   delta_mid = 5 * q * L^4 / (384 * EI)
//   theta_A  = q * L^3 / (24 * EI)
//   R_A = R_B = q * L / 2

#[test]
fn validation_ext_ss_beam_udl_deflection_rotation() {
    let l = 10.0;
    let q = 15.0; // kN/m downward
    let n = 8;
    let e_eff: f64 = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = 5*q*L^4 / (384*EI)
    let delta_exact: f64 = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uy.abs(), delta_exact, 0.02, "SS UDL midspan deflection");

    // End rotation at support A: theta_A = q*L^3 / (24*EI)
    let theta_exact: f64 = q * l.powi(3) / (24.0 * e_eff * IZ);
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert_close(d1.rz.abs(), theta_exact, 0.02, "SS UDL end rotation theta_A");

    // Reactions: R_A = R_B = q*L/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, q * l / 2.0, 0.01, "SS UDL reaction R_A");
    assert_close(r_b.ry, q * l / 2.0, 0.01, "SS UDL reaction R_B");
}

// ================================================================
// 2. Cantilever with Tip Point Load: Deflection, Rotation, and Fixed-End Moment
// ================================================================
//
// Reference: Przemieniecki, Ch. 5, Example 5.1.
// Fixed-free beam of length L, point load P downward at tip.
//   delta_tip = P * L^3 / (3 * EI)
//   theta_tip = P * L^2 / (2 * EI)
//   M_fixed   = P * L

#[test]
fn validation_ext_cantilever_tip_load_full() {
    let l = 6.0;
    let p = 50.0; // kN downward
    let n = 6;
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = P*L^3/(3*EI)
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy.abs(), delta_exact, 0.01, "Cantilever tip deflection");

    // Tip rotation: theta = P*L^2/(2*EI)
    let theta_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.01, "Cantilever tip rotation");

    // Fixed-end reaction: Ry = P, Mz = P*L
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, p, 0.01, "Cantilever reaction Ry");
    assert_close(r1.mz.abs(), p * l, 0.01, "Cantilever fixed-end moment");
}

// ================================================================
// 3. Fixed-Fixed Beam with UDL: Midspan Deflection and Fixed-End Moments
// ================================================================
//
// Reference: Kassimali, Table A.3.
// Both ends fixed, uniform load q downward over length L.
//   delta_mid = q * L^4 / (384 * EI)
//   M_fixed   = q * L^2 / 12  (hogging at supports)
//   R = q * L / 2

#[test]
fn validation_ext_fixed_fixed_udl_moments() {
    let l = 8.0;
    let q = 12.0; // kN/m downward
    let n = 8;
    let e_eff: f64 = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = q*L^4/(384*EI)
    let delta_exact: f64 = q * l.powi(4) / (384.0 * e_eff * IZ);
    let mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
    assert_close(mid.uy.abs(), delta_exact, 0.05, "Fixed-fixed UDL midspan deflection");

    // Fixed-end moments: M = q*L^2/12
    let m_exact: f64 = q * l * l / 12.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.mz.abs(), m_exact, 0.02, "Fixed-fixed M_A");
    assert_close(r_b.mz.abs(), m_exact, 0.02, "Fixed-fixed M_B");

    // Reactions: R = q*L/2 each
    assert_close(r_a.ry, q * l / 2.0, 0.01, "Fixed-fixed R_A");
    assert_close(r_b.ry, q * l / 2.0, 0.01, "Fixed-fixed R_B");
}

// ================================================================
// 4. Propped Cantilever with UDL: Reactions and Deflection
// ================================================================
//
// Reference: Weaver & Gere, Ch. 7; Ghali & Neville, Table 5.2.
// Fixed at left, rollerX at right, uniform load q downward.
//   R_B (roller) = 3*q*L/8
//   R_A (fixed)  = 5*q*L/8
//   M_A = q*L^2/8
//   delta_max = q*L^4/(185*EI) at x = 0.4215*L (approximate)

#[test]
fn validation_ext_propped_cantilever_udl_reactions() {
    let l = 10.0;
    let q = 10.0; // kN/m downward
    let n = 10;
    let e_eff: f64 = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reaction at roller end (node n+1): R_B = 3*q*L/8
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, 3.0 * q * l / 8.0, 0.02, "Propped cantilever R_B = 3qL/8");

    // Reaction at fixed end (node 1): R_A = 5*q*L/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.ry, 5.0 * q * l / 8.0, 0.02, "Propped cantilever R_A = 5qL/8");

    // Fixed-end moment: M_A = q*L^2/8
    let m_a_exact: f64 = q * l * l / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02, "Propped cantilever M_A = qL^2/8");

    // Equilibrium check: total vertical load = q*L = 100
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.01, "Propped cantilever equilibrium SumRy = qL");

    // Maximum deflection: delta_max approx q*L^4/(185*EI)
    let delta_approx: f64 = q * l.powi(4) / (185.0 * e_eff * IZ);
    // Find maximum deflection among all nodes
    let max_uy: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, |a, b| a.max(b));
    assert_close(max_uy, delta_approx, 0.05, "Propped cantilever delta_max approx qL^4/(185EI)");
}

// ================================================================
// 5. Two-Span Continuous Beam with UDL: Three-Moment Equation
// ================================================================
//
// Reference: Ghali & Neville, Ch. 4, Clapeyron's Theorem.
// Two equal spans L, UDL q on both spans.
//   M_B (interior support) = -q*L^2/8
//   R_A = R_C = 3*q*L/8
//   R_B = 10*q*L/8 = 5*q*L/4

#[test]
fn validation_ext_two_span_continuous_reactions() {
    let l = 8.0;
    let q = 10.0; // kN/m downward
    let n_per_span = 4;
    let n_total = 2 * n_per_span;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions: R_A = R_C = 3*q*L/8 = 30
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();
    assert_close(r_a.ry, 3.0 * q * l / 8.0, 0.02, "2-span R_A = 3qL/8");
    assert_close(r_c.ry, 3.0 * q * l / 8.0, 0.02, "2-span R_C = 3qL/8");

    // Interior support reaction: R_B = 10*q*L/8 = 100
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    assert_close(r_b.ry, 10.0 * q * l / 8.0, 0.02, "2-span R_B = 10qL/8");

    // Total vertical equilibrium: sum = 2*q*L = 160
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * q * l, 0.01, "2-span equilibrium SumRy = 2qL");

    // Interior support moment from element forces: M_B = q*L^2/8 = 80
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b_expected: f64 = q * l * l / 8.0;
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.05, "2-span M_B = qL^2/8");
}

// ================================================================
// 6. Portal Frame with Lateral Load: Antisymmetric Sway
// ================================================================
//
// Reference: McGuire et al., Ch. 3, Example 3.4.
// Rigid-jointed portal frame, fixed at both bases.
// Height h, width w, lateral load H at top-left joint.
// For equal columns (same EI) and beam EI:
//   Lateral sway at top: delta = H * h^3 / (24 * EI)  (for rigid beam, stiff columns)
//   Base moment: M_base = H * h / 4 (for stiff beam relative to columns)
//
// With finite beam stiffness, exact solution depends on stiffness ratio.
// For EI_col = EI_beam, h = w: approximate sway and verify equilibrium.

#[test]
fn validation_ext_portal_frame_lateral_equilibrium() {
    let h = 5.0;
    let w = 6.0;
    let lateral = 40.0; // kN horizontal at top-left

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum of Rx reactions = applied lateral force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), lateral, 0.01, "Portal lateral equilibrium SumRx = H");

    // By symmetry of stiffness (equal columns), each base takes approx H/2 shear
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let avg_rx: f64 = (r1.rx.abs() + r4.rx.abs()) / 2.0;
    assert_close(avg_rx, lateral / 2.0, 0.05, "Portal average base shear approx H/2");

    // Sway: both top nodes should have approximately equal horizontal displacement
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    // Beam is axially stiff, so ux2 approx ux3
    let sway_diff: f64 = (d2.ux - d3.ux).abs();
    assert!(sway_diff < 0.001, "Portal sway: top nodes move together, diff={:.6}", sway_diff);

    // Vertical equilibrium: no vertical loads applied, so sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.1,
        "Portal vertical equilibrium: SumRy={:.6}, expected ~0", sum_ry);

    // Base moments should be non-zero (frame develops moments under lateral load)
    assert!(r1.mz.abs() > 1.0, "Portal base moment M1 non-zero");
    assert!(r4.mz.abs() > 1.0, "Portal base moment M4 non-zero");
}

// ================================================================
// 7. SS Beam with Asymmetric Point Load: Reactions and Load-Point Deflection
// ================================================================
//
// Reference: Kassimali, Ch. 6, Table 6.1.
// Simply-supported beam L, point load P at distance a from left.
//   R_A = P * b / L    (b = L - a)
//   R_B = P * a / L
//   delta_at_load = P * a^2 * b^2 / (3 * EI * L)

#[test]
fn validation_ext_ss_asymmetric_point_load() {
    let l = 12.0;
    let p = 80.0; // kN downward
    let n = 12; // elem_len = 1.0
    let a = 4.0; // load at x = 4
    let b: f64 = l - a; // = 8
    let e_eff: f64 = E * 1000.0;
    let load_node = (a / (l / n as f64)).round() as usize + 1; // node 5

    let input = make_beam(
        n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, p * b / l, 0.01, "SS asym R_A = Pb/L");
    assert_close(r_b.ry, p * a / l, 0.01, "SS asym R_B = Pa/L");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "SS asym equilibrium SumRy = P");

    // Deflection at load point: delta = P*a^2*b^2/(3*EI*L)
    let delta_exact: f64 = p * a.powi(2) * b.powi(2) / (3.0 * e_eff * IZ * l);
    let d_load = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    assert_close(d_load.uy.abs(), delta_exact, 0.01, "SS asym deflection at load point");
}

// ================================================================
// 8. Three-Span Continuous Beam with UDL: Reactions by Symmetry
// ================================================================
//
// Reference: Ghali & Neville, Ch. 4, Table 4.3.
// Three equal spans L, UDL q on all spans. Pinned at ends, rollerX interior.
//   By three-moment equation for 3 equal spans:
//     R_A = R_D = 0.4 * q * L    (end supports)
//     R_B = R_C = 1.1 * q * L    (interior supports)
//   Total = 2*(0.4 + 1.1)*q*L = 3*q*L
//
//   Interior moment at B (and C by symmetry): M_B = q*L^2/10

#[test]
fn validation_ext_three_span_continuous_reactions() {
    let l = 6.0;
    let q = 10.0; // kN/m downward
    let n_per_span = 4;
    let n_total = 3 * n_per_span;

    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End support reactions: R_A = R_D = 0.4*q*L = 24
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();
    assert_close(r_a.ry, 0.4 * q * l, 0.03, "3-span R_A = 0.4qL");
    assert_close(r_d.ry, 0.4 * q * l, 0.03, "3-span R_D = 0.4qL");

    // Interior support reactions: R_B = R_C = 1.1*q*L = 66
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_b.ry, 1.1 * q * l, 0.03, "3-span R_B = 1.1qL");
    assert_close(r_c.ry, 1.1 * q * l, 0.03, "3-span R_C = 1.1qL");

    // Total vertical equilibrium: sum = 3*q*L = 180
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * q * l, 0.01, "3-span equilibrium SumRy = 3qL");

    // Interior moment at B: M_B = q*L^2/10 = 36
    let ef_at_b = results.element_forces.iter().find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b_expected: f64 = q * l * l / 10.0;
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.05, "3-span M_B = qL^2/10");

    // Symmetry: R_A = R_D and R_B = R_C
    assert_close(r_a.ry, r_d.ry, 0.01, "3-span symmetry R_A = R_D");
    assert_close(r_b.ry, r_c.ry, 0.01, "3-span symmetry R_B = R_C");
}
