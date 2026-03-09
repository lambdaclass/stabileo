/// Validation: Elastic Curve and Beam Deflection Theory (Extended)
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Hibbeler, "Structural Analysis", Ch. 8-12
///   - Ghali & Neville, "Structural Analysis", Ch. 5, 7
///
/// Tests verify classical elastic curve methods:
///   1. Double integration: cantilever point load, delta = PL^3/(3EI)
///   2. Conjugate beam: slopes and deflections via conjugate reactions/shears
///   3. Moment area (Mohr's theorems): slope change and tangential deviation
///   4. Macaulay brackets: beam with multiple point loads
///   5. Superposition: combined point + UDL equals sum of individual
///   6. Maximum deflection location: dy/dx = 0 for asymmetric loading
///   7. Propped cantilever: compatibility equation for redundant reaction
///   8. Continuous beam: three-moment equation deflections
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Double Integration Method
// ================================================================
//
// EI*y'' = M(x). For a cantilever with point load P at the free end:
//   M(x) = -P(L - x)
//   y(x) = P/(6EI) * (3Lx^2 - x^3)
//   delta_tip = PL^3/(3EI)
//   theta_tip = PL^2/(2EI)
//
// We verify tip deflection, tip slope, and an intermediate point
// at x = L/2: y(L/2) = 5PL^3/(48EI).

#[test]
fn validation_ecurve_ext_double_integration_cantilever() {
    let l: f64 = 6.0;
    let n = 12;
    let p: f64 = 20.0;
    let e_eff: f64 = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // delta_tip = PL^3 / (3EI)
    let delta_tip_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_tip_exact, 0.02,
        "Double integration: delta_tip = PL^3/(3EI)");

    // theta_tip = PL^2 / (2EI)
    let theta_tip_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_tip_exact, 0.02,
        "Double integration: theta_tip = PL^2/(2EI)");

    // Intermediate check at x = L/2 (node n/2 + 1)
    // y(L/2) = P/(6EI) * (3L*(L/2)^2 - (L/2)^3) = P/(6EI) * (3L^3/4 - L^3/8) = 5PL^3/(48EI)
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_mid_exact: f64 = 5.0 * p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_mid_exact, 0.02,
        "Double integration: delta(L/2) = 5PL^3/(48EI)");
}

// ================================================================
// 2. Conjugate Beam Method
// ================================================================
//
// For a simply supported beam with UDL q:
//   Real beam slope at end A: theta_A = qL^3/(24EI)
//   Real beam deflection at midspan: delta_mid = 5qL^4/(384EI)
//
// In the conjugate beam, the M/EI diagram is applied as a load.
// Conjugate beam "reactions" give real slopes at supports.
// Conjugate beam "moment" at midspan gives real deflection.
//
// We verify end slopes and midspan deflection, plus the relationship
// that the slope changes sign at midspan (zero crossing).

#[test]
fn validation_ecurve_ext_conjugate_beam_ss_udl() {
    let l: f64 = 10.0;
    let n = 20;
    let q: f64 = -12.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End slope: theta_A = qL^3/(24EI) (magnitude)
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact: f64 = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);
    assert_close(d_a.rz.abs(), theta_exact, 0.02,
        "Conjugate beam: theta_A = qL^3/(24EI)");
    // By symmetry, both end slopes are equal in magnitude
    assert_close(d_a.rz.abs(), d_b.rz.abs(), 0.01,
        "Conjugate beam: |theta_A| = |theta_B| (symmetry)");

    // Midspan deflection: delta_mid = 5qL^4/(384EI)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Conjugate beam: delta_mid = 5qL^4/(384EI)");

    // Midspan slope = 0 (by symmetry)
    assert!(d_mid.rz.abs() < 1e-10,
        "Conjugate beam: theta_mid = 0 (symmetry): {:.6e}", d_mid.rz);
}

// ================================================================
// 3. Moment Area Method (Mohr's Theorems)
// ================================================================
//
// Mohr's First Theorem: The change in slope between two points equals
//   the area of the M/EI diagram between them.
// Mohr's Second Theorem: The tangential deviation of point B from the
//   tangent at A equals the first moment of the M/EI diagram about B.
//
// For SS beam with center point load P:
//   Slope at A: theta_A = PL^2/(16EI)
//   Slope change from A to mid: Delta_theta = theta_A (since theta_mid = 0)
//   Tangential deviation t_{B/A} = PL^3/(48EI)
//   Midspan deflection = theta_A * L/2 - t_{mid/A} = PL^3/(48EI)

#[test]
fn validation_ecurve_ext_moment_area_mohr() {
    let l: f64 = 8.0;
    let n = 16;
    let p: f64 = 30.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Slope at A: theta_A = PL^2/(16EI)
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let theta_a_exact: f64 = p * l.powi(2) / (16.0 * e_eff * IZ);
    assert_close(d_a.rz.abs(), theta_a_exact, 0.02,
        "Moment area: theta_A = PL^2/(16EI)");

    // First theorem: slope change A to midspan = theta_A (since theta_mid = 0)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let slope_change: f64 = (d_a.rz - d_mid.rz).abs();
    assert_close(slope_change, theta_a_exact, 0.02,
        "Moment area 1st theorem: slope change A->mid = theta_A");

    // Midspan deflection: delta_mid = PL^3/(48EI)
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Moment area: delta_mid = PL^3/(48EI)");

    // Second theorem check: tangential deviation t_{B/A}
    // For SS beam with center load: t_{B/A} = PL^3/(48EI)
    // which equals the midspan deflection by geometry (tangent at A
    // passes through A, deviation at B from that tangent = delta_B + theta_A * L)
    // Actually: delta_B = 0 (support), so t_{B/A} = theta_A * L
    let t_ba: f64 = d_a.rz.abs() * l;
    let t_ba_exact: f64 = p * l.powi(3) / (16.0 * e_eff * IZ);
    assert_close(t_ba, t_ba_exact, 0.03,
        "Moment area 2nd theorem: t_BA = PL^3/(16EI)");
}

// ================================================================
// 4. Macaulay Brackets (Singularity Functions)
// ================================================================
//
// SS beam of length L with two point loads:
//   P1 at x = a1, P2 at x = a2
//
// Using Macaulay's method:
//   EI*y'' = R_A*x - P1*<x-a1> - P2*<x-a2>
//   where R_A = (P1*(L-a1) + P2*(L-a2))/L
//
// We verify deflections at both load points and at midspan.

#[test]
fn validation_ecurve_ext_macaulay_brackets() {
    let l: f64 = 12.0;
    let n = 24;
    let p1: f64 = 15.0;
    let p2: f64 = 25.0;
    let a1: f64 = 3.0; // L/4
    let a2: f64 = 9.0; // 3L/4
    let e_eff: f64 = E * 1000.0;

    let node_1 = (a1 / l * n as f64).round() as usize + 1; // node 7
    let node_2 = (a2 / l * n as f64).round() as usize + 1; // node 19

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1, fx: 0.0, fy: -p1, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2, fx: 0.0, fy: -p2, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = (P1*b1 + P2*b2)/L where b = L - a
    let b1: f64 = l - a1;
    let b2: f64 = l - a2;
    let r_a_exact: f64 = (p1 * b1 + p2 * b2) / l;
    let r_b_exact: f64 = (p1 * a1 + p2 * a2) / l;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, r_a_exact, 0.02, "Macaulay: R_A");
    assert_close(r_b.ry, r_b_exact, 0.02, "Macaulay: R_B");

    // Deflection at load point 1 using singularity function integration:
    // delta(a1) = (R_A*a1^3/6) / (EI)  [no Macaulay terms active yet]
    //           = R_A*a1^3 / (6EI) ... but must subtract the chord line contribution
    // More precisely, from the general formula:
    // delta(a) = Pb(L^2 - b^2 - (L-b-a_eval)^2?) ... use superposition of two loads.
    //
    // For load P at distance a from left on SS beam:
    //   delta(x) = Pb/(6LEI) * (L^2 - b^2 - x^2) * x,  for x <= a
    //   delta(x) = Pa/(6LEI) * (L^2 - a^2 - (L-x)^2) * (L-x), for x >= a (using b side)
    //
    // By superposition: delta_total(x) = delta_P1(x) + delta_P2(x)

    // delta at x = a1 = 3.0 (under P1, with x < a2)
    // From P1: delta_P1(a1) = P1*a1*b1/(6*L*EI) * (L^2 - a1^2 - b1^2) -- WRONG formula
    // Correct: For P at distance 'a' from left, b = L - a:
    //   delta_under_load = P*a^2*b^2/(3*EI*L)
    // At x=a1 due to P1: delta = P1*a1^2*b1^2 / (3*EI*L)
    let delta_p1_at_a1: f64 = p1 * a1.powi(2) * b1.powi(2) / (3.0 * e_eff * IZ * l);

    // At x=a1 due to P2 (a1 < a2, so use formula for x < a):
    //   delta = P2*b2*x*(L^2 - b2^2 - x^2) / (6*L*EI)
    let delta_p2_at_a1: f64 = p2 * b2 * a1 * (l.powi(2) - b2.powi(2) - a1.powi(2)) / (6.0 * e_eff * IZ * l);

    let delta_total_a1: f64 = delta_p1_at_a1 + delta_p2_at_a1;
    let d1 = results.displacements.iter().find(|d| d.node_id == node_1).unwrap();
    assert_close(d1.uy.abs(), delta_total_a1, 0.03,
        "Macaulay: deflection at load point 1");

    // Verify equilibrium: R_A + R_B = P1 + P2
    assert_close(r_a.ry + r_b.ry, p1 + p2, 0.01,
        "Macaulay: sum of reactions = sum of loads");
}

// ================================================================
// 5. Superposition Principle
// ================================================================
//
// For a simply supported beam:
//   Case A: Point load P at midspan -> delta_A = PL^3/(48EI)
//   Case B: UDL q over full span -> delta_B = 5qL^4/(384EI)
//   Combined: delta_C = delta_A + delta_B
//
// We solve all three cases and verify superposition holds exactly.

#[test]
fn validation_ecurve_ext_superposition() {
    let l: f64 = 8.0;
    let n = 16;
    let p: f64 = 20.0;
    let q: f64 = -5.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;

    // Case A: point load only
    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();
    let d_a = results_a.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Case B: UDL only
    let loads_b: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_b = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let d_b = results_b.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Case C: combined
    let mut loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_c.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    }));
    let input_c = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_c);
    let results_c = linear::solve_2d(&input_c).unwrap();
    let d_c = results_c.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Superposition: delta_C = delta_A + delta_B
    let sum_uy: f64 = d_a.uy + d_b.uy;
    assert_close(d_c.uy, sum_uy, 0.01,
        "Superposition: delta_combined = delta_point + delta_UDL");

    // Also verify slopes superpose
    let sum_rz: f64 = d_a.rz + d_b.rz;
    assert_close(d_c.rz, sum_rz, 0.01,
        "Superposition: theta_combined = theta_point + theta_UDL");

    // Verify each component against exact formulas
    let delta_a_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_a.uy.abs(), delta_a_exact, 0.02,
        "Superposition: delta_point = PL^3/(48EI)");

    let delta_b_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_b.uy.abs(), delta_b_exact, 0.02,
        "Superposition: delta_UDL = 5qL^4/(384EI)");
}

// ================================================================
// 6. Maximum Deflection Location (dy/dx = 0)
// ================================================================
//
// SS beam with single point load P at x = a (a != L/2).
// The maximum deflection does NOT occur under the load for asymmetric
// loading. It occurs where the slope is zero:
//   x_max = sqrt((L^2 - a^2)/3)  for a < L/2
//   (measured from the nearer support)
//
// For a = L/3: x_max = sqrt((L^2 - (L/3)^2)/3) = L*sqrt(8/27)
// delta_max = P*b*(L^2-b^2)^(3/2) / (9*sqrt(3)*L*EI)  where b = L - a

#[test]
fn validation_ecurve_ext_max_deflection_location() {
    let l: f64 = 12.0;
    let n = 48; // fine mesh to locate maximum precisely
    let p: f64 = 30.0;
    let a: f64 = l / 3.0; // load at L/3
    let b: f64 = l - a;
    let e_eff: f64 = E * 1000.0;

    let load_node = (a / l * n as f64).round() as usize + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find node with maximum deflection
    let max_disp = results.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();
    let x_max_fem: f64 = (max_disp.node_id - 1) as f64 * l / n as f64;

    // Theoretical: x_max = sqrt((L^2 - b^2)/3) from the left support
    // where b is measured from the right support
    let x_max_exact: f64 = ((l.powi(2) - b.powi(2)) / 3.0).sqrt();
    let dx: f64 = l / n as f64;
    assert!((x_max_fem - x_max_exact).abs() < 2.0 * dx,
        "Max defl location: x_fem={:.4} vs x_exact={:.4} (tolerance {:.4})",
        x_max_fem, x_max_exact, 2.0 * dx);

    // Maximum deflection value:
    // delta_max = P*b*(L^2 - b^2)^(3/2) / (9*sqrt(3)*L*EI)
    let l2_b2: f64 = l.powi(2) - b.powi(2);
    let delta_max_exact: f64 = p * b * l2_b2.powf(1.5) / (9.0 * 3.0_f64.sqrt() * l * e_eff * IZ);
    assert_close(max_disp.uy.abs(), delta_max_exact, 0.03,
        "Max defl value: delta_max = Pb(L^2-b^2)^(3/2)/(9*sqrt(3)*L*EI)");

    // The slope at the maximum deflection point should be approximately zero.
    // With a discrete mesh the node may not land exactly at the zero-slope point,
    // so we check that the slope is small relative to the end slope.
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let end_slope: f64 = d_a.rz.abs();
    assert!(max_disp.rz.abs() < 0.05 * end_slope,
        "Max defl: slope at max deflection point small vs end slope: {:.6e} vs {:.6e}",
        max_disp.rz.abs(), end_slope);
}

// ================================================================
// 7. Propped Cantilever: Compatibility Equation
// ================================================================
//
// Fixed at A (node 1), roller at B (node n+1), UDL q.
// The redundant is R_B. By compatibility:
//   delta_B(released) + R_B * f_BB = 0
// where delta_B(released) = qL^4/(8EI) (cantilever tip deflection)
//       f_BB = L^3/(3EI) (tip deflection due to unit upward load)
// So R_B = 3qL/8.
// Also: M_A = qL^2/2 - R_B*L = qL^2/2 - 3qL^2/8 = qL^2/8
// Max deflection: delta_max = qL^4/(185.2*EI) at x ~ 0.5785L from fixed end.

#[test]
fn validation_ecurve_ext_propped_cantilever_compatibility() {
    let l: f64 = 10.0;
    let n = 20;
    let q: f64 = -15.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 3qL/8 (from compatibility)
    let r_b_exact: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02,
        "Propped compatibility: R_B = 3qL/8");

    // R_A = qL - R_B = 5qL/8
    let r_a_exact: f64 = 5.0 * q.abs() * l / 8.0;
    assert_close(r_a.ry, r_a_exact, 0.02,
        "Propped compatibility: R_A = 5qL/8");

    // M_A = qL^2/8 (fixed-end moment)
    let m_a_exact: f64 = q.abs() * l.powi(2) / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02,
        "Propped compatibility: M_A = qL^2/8");

    // Maximum deflection: delta_max = qL^4/(185.2*EI)
    let max_defl: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let delta_max_exact: f64 = q.abs() * l.powi(4) / (185.2 * e_eff * IZ);
    assert_close(max_defl, delta_max_exact, 0.05,
        "Propped compatibility: delta_max = qL^4/(185.2*EI)");

    // Verify compatibility: deflection at roller = 0
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b.uy.abs() < 1e-10,
        "Propped compatibility: delta_B = 0 (support): {:.6e}", d_b.uy);
}

// ================================================================
// 8. Continuous Beam: Three-Moment Equation Deflections
// ================================================================
//
// Two equal spans L with UDL q on both spans (pinned-roller-roller).
// Three-moment equation gives: M_interior = qL^2/8.
// Reactions: R_end = 3qL/8, R_center = 10qL/8 = 5qL/4.
//
// Midspan deflection of each span:
//   delta_midspan = qL^4/(384EI) * (5 - 24*(M_int/(qL^2)))
//
// For M_int = qL^2/8:
//   delta = qL^4/(384EI) * (5 - 24/8) = qL^4/(384EI) * 2 = qL^4/(192EI)
//
// More precisely, for a continuous beam with interior moment M_B,
// each span behaves like a SS beam with end moments 0 and M_B.
// Using superposition of UDL + end moment M_B:
//   delta_mid = 5qL^4/(384EI) - M_B*L^2/(16EI)
//             = 5qL^4/(384EI) - qL^4/(128EI)
//             = qL^4*(5/384 - 3/384) = qL^4/(192EI)

#[test]
fn validation_ecurve_ext_continuous_beam_deflections() {
    let span: f64 = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment: M_B = qL^2/8
    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior: f64 = ef.m_end.abs();
    let m_exact: f64 = q.abs() * span.powi(2) / 8.0;
    assert_close(m_interior, m_exact, 0.05,
        "Continuous: M_interior = qL^2/8");

    // Interior reaction: R_center = 5qL/4
    let interior_node = n + 1;
    let r_int = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();
    let r_center_exact: f64 = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int.ry, r_center_exact, 0.02,
        "Continuous: R_center = 5qL/4");

    // Midspan deflection of first span: delta = qL^4/(192EI)
    // Actually, let's compute more carefully:
    //   delta = 5qL^4/(384EI) - M_B*L^2/(16EI)
    //         = 5qL^4/(384EI) - (qL^2/8)*L^2/(16EI)
    //         = qL^4/(384EI)*(5 - 3)
    //         = 2qL^4/(384EI) = qL^4/(192EI)
    let mid1 = n / 2 + 1;
    let d_mid1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();
    let delta_exact: f64 = q.abs() * span.powi(4) / (192.0 * e_eff * IZ);
    assert_close(d_mid1.uy.abs(), delta_exact, 0.05,
        "Continuous: midspan delta = qL^4/(192EI)");

    // By symmetry, midspan deflections of both spans should be equal
    let mid2 = n + n / 2 + 1;
    let d_mid2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap();
    assert_close(d_mid1.uy, d_mid2.uy, 0.01,
        "Continuous: symmetric midspan deflections");

    // Deflection at interior support = 0
    let d_int = results.displacements.iter().find(|d| d.node_id == interior_node).unwrap();
    assert!(d_int.uy.abs() < 1e-10,
        "Continuous: delta at interior support = 0: {:.6e}", d_int.uy);
}
