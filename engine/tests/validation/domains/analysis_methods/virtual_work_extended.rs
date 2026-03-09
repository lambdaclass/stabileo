/// Validation: Virtual Work and Energy Method Benchmarks
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 7-8
///   - Hibbeler, "Structural Analysis", Ch. 9
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 11-12
///   - Castigliano, "Theorie de l'equilibre des systemes elastiques" (1879)
///   - Maxwell, "On the Calculation of the Equilibrium and Stiffness of Frames" (1864)
///
/// Tests verify energy-based analytical results against the stiffness method solver:
///   1. Unit load method: SS beam midspan deflection = PL^3/(48EI)
///   2. Castigliano's first theorem: cantilever tip deflection via strain energy derivative
///   3. Betti's reciprocal theorem: cross-flexibility f12 = f21
///   4. Strain energy: U = integral(M^2/(2EI)dx) for various loading patterns
///   5. Complementary virtual work: propped cantilever redundant reaction
///   6. Maxwell's reciprocal theorem: deflection symmetry in multi-span beam
///   7. Minimum total potential energy: stable equilibrium configuration
///   8. Dummy load method for rotation: slope at support of SS beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Unit Load Method: SS Beam Midspan Deflection = PL^3/(48EI)
// ================================================================
//
// The unit load (virtual work) method gives deflection at a point
// by applying a virtual unit force there and integrating:
//   delta = integral(M * m / (EI) dx)
// where M = real moment diagram, m = virtual moment diagram.
//
// For SS beam with center load P:
//   M(x) = Px/2 for x <= L/2 (symmetric)
//   m(x) = x/2 for x <= L/2 (unit load at center)
//   delta = 2 * integral_0^{L/2} (Px/2)(x/2)/(EI) dx
//         = P/(2EI) * integral_0^{L/2} x^2 dx
//         = P/(2EI) * (L/2)^3/3 = PL^3/(48EI)

#[test]
fn validation_vw_ext_unit_load_ss_midspan() {
    let l = 8.0;
    let n = 16;
    let p = 25.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Unit load method analytical result
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);

    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Unit load method: SS midspan delta = PL^3/(48EI)");

    // Also verify reactions: R_A = R_B = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, p / 2.0, 0.02, "Unit load: R_A = P/2");
    assert_close(r_b.ry, p / 2.0, 0.02, "Unit load: R_B = P/2");
}

// ================================================================
// 2. Castigliano's First Theorem: Cantilever Tip Deflection
// ================================================================
//
// Castigliano's second theorem: delta_i = dU/dP_i
// For cantilever with tip load P:
//   M(x) = P(L-x) for x measured from fixed end
//   U = integral_0^L M^2/(2EI) dx = P^2 L^3 / (6EI)
//   delta = dU/dP = PL^3/(3EI)
//
// Verify both the deflection formula and that U = 0.5 * P * delta.

#[test]
fn validation_vw_ext_castigliano_cantilever_tip() {
    let l = 6.0;
    let n = 12;
    let p = 18.0;
    let e_eff: f64 = E * 1000.0;

    let tip_node = n + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // Castigliano: delta = dU/dP = PL^3/(3EI)
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Castigliano: cantilever tip delta = PL^3/(3EI)");

    // Strain energy: U = P^2 L^3 / (6EI)
    let u_exact: f64 = p.powi(2) * l.powi(3) / (6.0 * e_eff * IZ);
    // External work: W = 0.5 * P * delta
    let w_external = 0.5 * p * tip.uy.abs();
    assert_close(w_external, u_exact, 0.02,
        "Castigliano: U = P^2 L^3/(6EI) = 0.5*P*delta");

    // Verify tip rotation: theta = PL^2/(2EI)
    let theta_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Castigliano: cantilever tip theta = PL^2/(2EI)");
}

// ================================================================
// 3. Betti's Reciprocal Theorem: f12 = f21
// ================================================================
//
// Betti's theorem states: for a linearly elastic structure,
// the work done by force system 1 acting through displacements
// caused by force system 2 equals the work done by force system 2
// acting through displacements caused by force system 1.
//
// For a SS beam: apply P at node A, measure delta at node B (= f12*P)
// Then apply P at node B, measure delta at node A (= f21*P)
// f12 must equal f21.

#[test]
fn validation_vw_ext_betti_reciprocal() {
    let l = 10.0;
    let n = 20;
    let p = 15.0;

    let node_a = 5;  // x = 2.0 (L/5 from left)
    let node_b = 15; // x = 7.0 (7L/10 from left)

    // Case 1: Load at A, measure displacement at B
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let delta_b_from_a = res_1.displacements.iter()
        .find(|d| d.node_id == node_b).unwrap().uy;

    // Case 2: Load at B, measure displacement at A
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let delta_a_from_b = res_2.displacements.iter()
        .find(|d| d.node_id == node_a).unwrap().uy;

    // Betti: P * delta_b_from_a = P * delta_a_from_b
    // i.e. f12 = f21 (flexibility coefficients are symmetric)
    let f12: f64 = delta_b_from_a / p;
    let f21: f64 = delta_a_from_b / p;
    assert_close(f12, f21, 0.01,
        "Betti reciprocal: f12 = f21");

    // Cross-verify with analytical formula for SS beam:
    // For load P at distance a from left, deflection at distance b (b > a):
    //   delta(b) = P*a*(L-b)*(2*L*b - a^2 - b^2) / (6*L*EI) for b >= a
    let e_eff: f64 = E * 1000.0;
    let a_pos: f64 = (node_a - 1) as f64 * l / n as f64;
    let b_pos: f64 = (node_b - 1) as f64 * l / n as f64;
    let delta_analytical: f64 = p * a_pos * (l - b_pos)
        * (2.0 * l * b_pos - a_pos.powi(2) - b_pos.powi(2))
        / (6.0 * l * e_eff * IZ);
    assert_close(delta_b_from_a.abs(), delta_analytical.abs(), 0.02,
        "Betti: solver matches analytical deflection");
}

// ================================================================
// 4. Strain Energy: U = integral(M^2/(2EI)dx) for Various Loads
// ================================================================
//
// Compare strain energy computed from external work (U = 0.5 * sum(P_i * delta_i))
// with analytical integration of the moment diagram.
//
// Case A: SS beam with two symmetric point loads (four-point bending)
//   Loads at L/3 and 2L/3 each of magnitude P
//   M is trapezoidal: rises linearly to PL/3 in the middle third
//   U = P^2 L^3 / (18EI) * (23/27)... simplified to external work check.
//
// Case B: Cantilever with linearly varying (triangular) load
//   q(x) = q_max * x / L, total load = q_max*L/2
//   U = q_max^2 L^5 / (40EI) ... but we verify U_ext = U_int.

#[test]
fn validation_vw_ext_strain_energy_patterns() {
    let l = 9.0;
    let n = 18;
    let p = 12.0;
    let e_eff: f64 = E * 1000.0;

    // Case A: Four-point bending (two symmetric loads)
    let node_1 = n / 3 + 1;      // L/3
    let node_2 = 2 * n / 3 + 1;  // 2L/3
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2, fx: 0.0, fy: -p, mz: 0.0,
        }),
    ];
    let input_a = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    let d1 = res_a.displacements.iter().find(|d| d.node_id == node_1).unwrap();
    let d2 = res_a.displacements.iter().find(|d| d.node_id == node_2).unwrap();

    // External work = 0.5 * P * delta_1 + 0.5 * P * delta_2
    let u_ext = 0.5 * p * d1.uy.abs() + 0.5 * p * d2.uy.abs();

    // By symmetry, delta_1 = delta_2
    assert_close(d1.uy.abs(), d2.uy.abs(), 0.01,
        "Four-point bending: symmetric deflections");

    // Analytical strain energy for four-point bending:
    // M = P*x for 0 <= x <= L/3 (linear ramp)
    // M = P*L/3 for L/3 <= x <= 2L/3 (constant)
    // U = 2 * integral_0^{L/3} (Px)^2/(2EI) dx + (P*L/3)^2/(2EI) * (L/3)
    // U = 2 * P^2/(2EI) * (L/3)^3/3 + P^2*L^2/(9*2*EI) * (L/3)
    // U = P^2*L^3/(81*EI) + P^2*L^3/(54*EI) = P^2*L^3*(2+3)/(162*EI) = 5*P^2*L^3/(162*EI)
    let u_analytical: f64 = 5.0 * p.powi(2) * l.powi(3) / (162.0 * e_eff * IZ);
    assert_close(u_ext, u_analytical, 0.03,
        "Strain energy: four-point bending U = 5P^2L^3/(162EI)");

    // Case B: Cantilever with triangular load (increasing toward tip)
    let q_max: f64 = -8.0;
    let loads_b: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i: f64 = (i - 1) as f64 / n as f64;
            let x_j: f64 = i as f64 / n as f64;
            let qi = q_max * x_i;
            let qj = q_max * x_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: qi, q_j: qj, a: None, b: None,
            })
        })
        .collect();
    let input_b = make_beam(n, l, E, A, IZ, "fixed", None, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Compute external work via trapezoidal rule: W = 0.5 * integral(q(x)*delta(x))dx
    let dx: f64 = l / n as f64;
    let u_ext_b: f64 = res_b.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n + 1)
        .map(|d| {
            let x_frac: f64 = (d.node_id - 1) as f64 / n as f64;
            let q_at_x: f64 = q_max.abs() * x_frac;
            let weight: f64 = if d.node_id == 1 || d.node_id == n + 1 { 0.5 } else { 1.0 };
            0.5 * q_at_x * d.uy.abs() * dx * weight
        })
        .sum();

    // Analytical: for cantilever with triangular load q(x) = q_max*x/L:
    //   M(x) = q_max*(L-x)^2*(2L+x) / (6L)
    //   U = integral_0^L M^2/(2EI) dx = 11*q_max^2*L^5 / (840*EI)
    let u_analytical_b: f64 = 11.0 * q_max.powi(2) * l.powi(5) / (840.0 * e_eff * IZ);
    assert_close(u_ext_b, u_analytical_b, 0.05,
        "Strain energy: cantilever triangular load U = 11*q^2*L^5/(840*EI)");
}

// ================================================================
// 5. Complementary Virtual Work: Propped Cantilever Redundant
// ================================================================
//
// For a propped cantilever (fixed + roller) with UDL q:
// Using the force method (complementary virtual work):
//   - Release roller to get primary (cantilever) structure
//   - Deflection at roller from UDL: delta_q = qL^4/(8EI) downward
//   - Deflection at roller from unit upward R_B: f_BB = L^3/(3EI) upward
//   - Compatibility: delta_q = R_B * f_BB
//   - R_B = 3qL/8
//
// Verify that the solver produces this exact redundant reaction.

#[test]
fn validation_vw_ext_complementary_vw_propped() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -12.0;
    let e_eff: f64 = E * 1000.0;

    // Propped cantilever: fixed at node 1, roller at node n+1
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force method derivation:
    // Primary structure: cantilever loaded with UDL
    // delta_q = q*L^4/(8EI) (tip deflection of cantilever under UDL)
    // f_BB = L^3/(3EI) (tip deflection per unit upward load)
    // R_B = delta_q / f_BB = 3qL/8
    let r_b_exact: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, r_b_exact, 0.02,
        "Complementary VW: R_B = 3qL/8");

    // R_A = qL - R_B = 5qL/8
    let r_a_exact: f64 = 5.0 * q.abs() * l / 8.0;
    assert_close(r_a.ry, r_a_exact, 0.02,
        "Complementary VW: R_A = 5qL/8");

    // Fixed-end moment: M_A = qL^2/2 - R_B*L = qL^2/8
    let m_a_exact: f64 = q.abs() * l.powi(2) / 8.0;
    assert_close(r_a.mz.abs(), m_a_exact, 0.02,
        "Complementary VW: M_A = qL^2/8");

    // Verify zero displacement at roller (compatibility condition)
    let d_b = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b.uy.abs() < 1e-6,
        "Complementary VW: roller displacement = 0: {:.2e}", d_b.uy.abs());

    // Cross-check: maximum deflection
    // For propped cantilever with UDL: delta_max = qL^4/(185EI) approximately
    // More precise: delta_max at x = L(15-sqrt(33))/16
    let max_uy: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let delta_approx: f64 = q.abs() * l.powi(4) / (185.0 * e_eff * IZ);
    // Allow 15% tolerance for approximate formula
    assert!((max_uy - delta_approx).abs() / delta_approx < 0.15,
        "Complementary VW: max deflection ~ qL^4/(185EI): {:.6e} vs {:.6e}",
        max_uy, delta_approx);
}

// ================================================================
// 6. Maxwell's Reciprocal Theorem: Multi-span Beam
// ================================================================
//
// Maxwell's theorem: delta_ij = delta_ji
// For a continuous beam, apply unit load at point i, measure
// deflection at point j, and vice versa. They must be equal.
//
// This extends Betti's theorem to a statically indeterminate
// structure (two-span continuous beam).

#[test]
fn validation_vw_ext_maxwell_reciprocal_multispan() {
    let span = 6.0;
    let n = 12;
    let p = 10.0;

    // Two-span continuous beam: supports at nodes 1, n+1, 2n+1
    let node_i = 4;       // in first span
    let node_j = n + 8;   // in second span

    // Case 1: Load at node_i, measure displacement at node_j
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_1 = make_continuous_beam(&[span, span], n, E, A, IZ, loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    let delta_j_from_i = res_1.displacements.iter()
        .find(|d| d.node_id == node_j).unwrap().uy;

    // Case 2: Load at node_j, measure displacement at node_i
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_2 = make_continuous_beam(&[span, span], n, E, A, IZ, loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let delta_i_from_j = res_2.displacements.iter()
        .find(|d| d.node_id == node_i).unwrap().uy;

    // Maxwell: delta_ij = delta_ji
    // (flexibility coefficients are symmetric even for indeterminate structures)
    let f_ij: f64 = delta_j_from_i / p;
    let f_ji: f64 = delta_i_from_j / p;
    assert_close(f_ij, f_ji, 0.01,
        "Maxwell reciprocal: f_ij = f_ji for continuous beam");

    // Both should be non-trivial (non-zero deflection)
    assert!(f_ij.abs() > 1e-10,
        "Maxwell: non-trivial flexibility coefficient: {:.6e}", f_ij);

    // Also verify that both deflections have the same sign (both downward)
    assert!(delta_j_from_i * delta_i_from_j > 0.0,
        "Maxwell: consistent deflection signs");
}

// ================================================================
// 7. Minimum Total Potential Energy: Stable Equilibrium
// ================================================================
//
// The principle of minimum total potential energy states that
// among all kinematically admissible displacement fields,
// the actual solution minimizes the total potential energy:
//   Pi = U - W_ext
// where U = strain energy, W_ext = work by external forces.
//
// Test: for a SS beam with center load, perturb the solution slightly
// and show that the solver's solution has lower Pi than the perturbed one.
// We verify this by comparing with the Rayleigh-Ritz approximation
// using a sinusoidal trial function.

#[test]
fn validation_vw_ext_minimum_potential_energy() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_solver: f64 = d_mid.uy.abs();

    // Solver solution: Pi = U - W = 0.5*P*delta - P*delta = -0.5*P*delta
    // (At equilibrium, Pi = -U for conservative loading)
    let pi_solver: f64 = -0.5 * p * delta_solver;

    // Rayleigh-Ritz with sinusoidal trial: v(x) = C * sin(pi*x/L)
    // U_ritz = EI * C^2 * pi^4 / (4*L^3)
    // W_ritz = P * C * sin(pi/2) = P * C
    // Minimize Pi = U - W: dPi/dC = 0 => C = 2*P*L^3 / (EI * pi^4)
    let pi_val: f64 = std::f64::consts::PI;
    let c_opt: f64 = 2.0 * p * l.powi(3) / (e_eff * IZ * pi_val.powi(4));

    // Ritz deflection at midspan
    let delta_ritz: f64 = c_opt; // sin(pi/2) = 1

    // Ritz approximate deflection should be close to exact
    // Exact: PL^3/(48EI), Ritz: 2PL^3/(pi^4 * EI) = PL^3/(48.705*EI)
    // Error ~ 1.5%
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(delta_ritz, delta_exact, 0.02,
        "Min PE: Ritz approximation close to exact");

    // Ritz Pi
    let u_ritz: f64 = e_eff * IZ * c_opt.powi(2) * pi_val.powi(4) / (4.0 * l.powi(3));
    let w_ritz: f64 = p * c_opt;
    let pi_ritz: f64 = u_ritz - w_ritz;

    // Solver solution must have Pi <= Pi_ritz (exact is the minimum)
    assert!(pi_solver <= pi_ritz + 1e-10,
        "Min PE: solver Pi ({:.6e}) <= Ritz Pi ({:.6e})", pi_solver, pi_ritz);

    // Also verify solver matches exact deflection
    assert_close(delta_solver, delta_exact, 0.02,
        "Min PE: solver deflection = PL^3/(48EI)");
}

// ================================================================
// 8. Dummy Load Method for Rotation: Slope at SS Beam Support
// ================================================================
//
// The dummy load method applies a fictitious moment M* at the
// point where the rotation is desired. The rotation is:
//   theta = dU/dM* evaluated at M* = 0
//
// For SS beam with center load P, the slope at the left support:
//   theta_A = PL^2/(16EI)
//
// Derivation via virtual work:
//   Apply virtual moment m* at A. The virtual moment diagram is
//   m(x) = 1 - x/L (just the reaction from the virtual moment).
//   theta_A = integral(M*m/(EI))dx
//   where M(x) = Px/2 for x <= L/2.
//   theta_A = (1/EI) * integral_0^{L/2} (Px/2)(1-x/L) dx + ...
//   = PL^2/(16EI)

#[test]
fn validation_vw_ext_dummy_load_rotation() {
    let l = 10.0;
    let n = 20;
    let p = 16.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Slope at left support (node 1)
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let theta_a_solver: f64 = d_a.rz.abs();

    // Analytical: theta_A = PL^2/(16EI) for SS beam with center load
    let theta_exact: f64 = p * l.powi(2) / (16.0 * e_eff * IZ);
    assert_close(theta_a_solver, theta_exact, 0.02,
        "Dummy load: theta_A = PL^2/(16EI)");

    // By symmetry, slope at right support has equal magnitude
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_b_solver: f64 = d_b.rz.abs();
    assert_close(theta_b_solver, theta_exact, 0.02,
        "Dummy load: theta_B = PL^2/(16EI) by symmetry");

    // Verify with numerical differentiation of energy:
    // Apply small dummy moment at support A, compute delta_U
    let dm = 0.001;
    let loads_with_m = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fy: 0.0, mz: dm,
        }),
    ];
    let input_m = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_with_m);
    let res_m = linear::solve_2d(&input_m).unwrap();

    // U_with_m = 0.5 * P * delta_mid_new + 0.5 * dm * theta_A_new
    let d_mid_new = res_m.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let d_a_new = res_m.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let u_with: f64 = 0.5 * p * d_mid_new.uy.abs() + 0.5 * dm * d_a_new.rz;

    // U_without = 0.5 * P * delta_mid_original
    let d_mid_orig = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let u_without: f64 = 0.5 * p * d_mid_orig.uy.abs();

    // theta = dU/dM ≈ (U_with - U_without) / dm
    let theta_numerical: f64 = (u_with - u_without) / dm;
    assert_close(theta_numerical.abs(), theta_exact, 0.05,
        "Dummy load: numerical dU/dM matches theta_A");
}
