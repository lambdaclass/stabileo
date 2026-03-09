/// Validation: Extended Energy Methods and Work Principles
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 7-8
///   - Hibbeler, "Structural Analysis", Ch. 9
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 12
///   - Reddy, "Energy Principles and Variational Methods in Applied Mechanics"
///
/// Tests verify energy-based quantities computed from solver results:
///   1. Strain energy of a beam: U = integral(M^2/(2EI))dx
///   2. Castigliano's theorem: deflection = dU/dP for cantilever
///   3. Virtual work: delta = integral(m*M/(EI))dx for SS beam
///   4. Maxwell's reciprocal theorem: delta_ij = delta_ji
///   5. Betti's theorem: P1*delta12 = P2*delta21
///   6. Minimum potential energy: solver finds minimum energy state
///   7. Complementary energy: dU*/dR = 0 at correct reaction
///   8. Work-energy consistency: external work = internal strain energy
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Strain Energy of a Beam: U = integral(M^2/(2EI))dx
// ================================================================
//
// Simply-supported beam with center point load P.
// M(x) = Px/2 for x in [0, L/2], M(x) = P(L-x)/2 for x in [L/2, L]
// U = integral(M^2/(2EI))dx = P^2 L^3 / (96 EI)
// Also verify U = (1/2) * P * delta where delta = PL^3/(48EI)

#[test]
fn validation_energy_strain_energy_beam() {
    let l = 8.0;
    let n = 16;
    let p = 30.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Compute strain energy by summing over elements: U = sum M_avg^2 * Le / (2EI)
    // Use trapezoidal integration of M^2 along each element
    let mut u_internal = 0.0;
    for ef in &results.element_forces {
        let le = ef.length;
        // Trapezoidal rule: integral(M^2)dx ~ (M_start^2 + M_end^2)/2 * Le
        let m2_avg = (ef.m_start * ef.m_start + ef.m_end * ef.m_end) / 2.0;
        u_internal += m2_avg * le / (2.0 * e_eff * IZ);
    }

    // Analytical strain energy: U = P^2 L^3 / (96 EI)
    let u_exact = p * p * l * l * l / (96.0 * e_eff * IZ);

    assert_close(u_internal, u_exact, 0.02,
        "Strain energy: numerical integration matches P^2*L^3/(96EI)");

    // Cross-check: U = 1/2 * P * delta
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let u_external = 0.5 * p * d_mid.uy.abs();
    assert_close(u_external, u_exact, 0.02,
        "Strain energy: 1/2*P*delta matches analytical");
}

// ================================================================
// 2. Castigliano's Theorem: deflection = dU/dP
// ================================================================
//
// Cantilever with tip load P.
// U = P^2 L^3 / (6 EI)
// dU/dP = P L^3 / (3 EI) = delta_tip
// Verify numerically by computing U(P+dP) and U(P-dP) and using
// central difference: delta ~ (U(P+dP) - U(P-dP)) / (2*dP)

#[test]
fn validation_energy_castigliano_derivative() {
    let l = 5.0;
    let n = 10;
    let p = 20.0;
    let dp = 0.01;
    let e_eff = E * 1000.0;

    // Solve for P + dP
    let loads_plus = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -(p + dp), mz: 0.0,
    })];
    let input_plus = make_beam(n, l, E, A, IZ, "fixed", None, loads_plus);
    let res_plus = linear::solve_2d(&input_plus).unwrap();
    let d_plus = res_plus.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let u_plus = 0.5 * (p + dp) * d_plus.uy.abs();

    // Solve for P - dP
    let loads_minus = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -(p - dp), mz: 0.0,
    })];
    let input_minus = make_beam(n, l, E, A, IZ, "fixed", None, loads_minus);
    let res_minus = linear::solve_2d(&input_minus).unwrap();
    let d_minus = res_minus.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let u_minus = 0.5 * (p - dp) * d_minus.uy.abs();

    // Numerical derivative: dU/dP ~ (U(P+dP) - U(P-dP)) / (2*dP)
    let delta_numerical = (u_plus - u_minus) / (2.0 * dp);

    // Exact: delta = PL^3 / (3EI)
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);

    // Also get solver displacement directly
    let loads_p = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_p = make_beam(n, l, E, A, IZ, "fixed", None, loads_p);
    let res_p = linear::solve_2d(&input_p).unwrap();
    let delta_solver = res_p.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    assert_close(delta_numerical, delta_exact, 0.02,
        "Castigliano: dU/dP matches PL^3/(3EI)");
    assert_close(delta_solver, delta_exact, 0.02,
        "Castigliano: solver displacement matches exact");
}

// ================================================================
// 3. Virtual Work: delta = integral(m*M/(EI))dx
// ================================================================
//
// SS beam with point load P at center.
// To find deflection at L/4 using unit load method:
// Apply virtual unit load at L/4, get m(x).
// delta = integral(m*M/(EI))dx
//
// M(x): real moment from P at L/2
// m(x): virtual moment from unit load at L/4
//
// Analytical result for delta at L/4:
// delta(L/4) = 11*P*L^3 / (768*EI)

#[test]
fn validation_energy_virtual_work() {
    let l = 8.0;
    let n = 16;
    let p = 25.0;
    let e_eff = E * 1000.0;

    // Real system: SS beam with P at center
    let mid = n / 2 + 1;
    let loads_real = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_real = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_real);
    let res_real = linear::solve_2d(&input_real).unwrap();

    // Deflection at quarter point from solver
    let qtr = n / 4 + 1;
    let delta_solver = res_real.displacements.iter()
        .find(|d| d.node_id == qtr).unwrap().uy.abs();

    // Virtual system: unit load at quarter point
    let loads_virt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: qtr, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_virt = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_virt);
    let res_virt = linear::solve_2d(&input_virt).unwrap();

    // Compute virtual work integral: delta = integral(m*M/(EI))dx
    // Numerically: sum over elements using trapezoidal rule
    let mut delta_vw = 0.0;
    for ef_real in &res_real.element_forces {
        let ef_virt = res_virt.element_forces.iter()
            .find(|e| e.element_id == ef_real.element_id).unwrap();
        let le = ef_real.length;
        // Trapezoidal: integral(m*M)dx ~ (m_s*M_s + m_e*M_e)/2 * Le
        let mm_avg = (ef_virt.m_start * ef_real.m_start
                    + ef_virt.m_end * ef_real.m_end) / 2.0;
        delta_vw += mm_avg * le / (e_eff * IZ);
    }

    // Analytical: delta(L/4) = 11*P*L^3 / (768*EI)
    let delta_exact = 11.0 * p * l * l * l / (768.0 * e_eff * IZ);

    assert_close(delta_solver, delta_exact, 0.02,
        "Virtual work: solver deflection at L/4");
    assert_close(delta_vw, delta_exact, 0.02,
        "Virtual work: integral(m*M/(EI))dx at L/4");
}

// ================================================================
// 4. Maxwell's Reciprocal Theorem: delta_ij = delta_ji
// ================================================================
//
// Apply unit load at point i, measure displacement at point j: delta_ij
// Apply unit load at point j, measure displacement at point i: delta_ji
// Maxwell: delta_ij = delta_ji

#[test]
fn validation_energy_maxwell_reciprocal() {
    let l = 10.0;
    let n = 10;

    let node_i = 4;  // x = 3.0
    let node_j = 8;  // x = 7.0

    // Load at i, measure displacement at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_i = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_i);
    let res_i = linear::solve_2d(&input_i).unwrap();
    let delta_ij = res_i.displacements.iter()
        .find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure displacement at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_j = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_j);
    let res_j = linear::solve_2d(&input_j).unwrap();
    let delta_ji = res_j.displacements.iter()
        .find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ij, delta_ji, 0.01,
        "Maxwell reciprocal: delta_ij = delta_ji");

    // Also verify with a cantilever (different boundary conditions)
    let loads_ci = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_ci = make_beam(n, l, E, A, IZ, "fixed", None, loads_ci);
    let res_ci = linear::solve_2d(&input_ci).unwrap();
    let d_ij_c = res_ci.displacements.iter()
        .find(|d| d.node_id == 8).unwrap().uy;

    let loads_cj = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 8, fx: 0.0, fy: -1.0, mz: 0.0,
    })];
    let input_cj = make_beam(n, l, E, A, IZ, "fixed", None, loads_cj);
    let res_cj = linear::solve_2d(&input_cj).unwrap();
    let d_ji_c = res_cj.displacements.iter()
        .find(|d| d.node_id == 4).unwrap().uy;

    assert_close(d_ij_c, d_ji_c, 0.01,
        "Maxwell reciprocal (cantilever): delta_ij = delta_ji");
}

// ================================================================
// 5. Betti's Theorem: P1*delta12 = P2*delta21
// ================================================================
//
// System 1: load P1 at point A, measure displacement at B -> delta12
// System 2: load P2 at point B, measure displacement at A -> delta21
// Betti: P1 * delta12 = P2 * delta21

#[test]
fn validation_energy_betti_theorem() {
    let l = 10.0;
    let n = 10;

    let p1 = 15.0;
    let p2 = 30.0;
    let node_a = 4;
    let node_b = 8;

    // System 1: P1 at A
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();
    // Displacement at B due to system 1 forces
    let d1_at_b = res_1.displacements.iter()
        .find(|d| d.node_id == node_b).unwrap().uy;

    // System 2: P2 at B
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p2, mz: 0.0,
    })];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();
    // Displacement at A due to system 2 forces
    let d2_at_a = res_2.displacements.iter()
        .find(|d| d.node_id == node_a).unwrap().uy;

    // Betti: work of system 1 forces through system 2 displacements
    //      = work of system 2 forces through system 1 displacements
    // P1(-fy) acts downward at A; d2_at_a is displacement at A from system 2
    // P2(-fy) acts downward at B; d1_at_b is displacement at B from system 1
    // Work = force * displacement (both downward, so use uy directly with fy sign)
    let work_1_on_2 = p1 * d2_at_a.abs();
    let work_2_on_1 = p2 * d1_at_b.abs();

    assert_close(work_1_on_2, work_2_on_1, 0.01,
        "Betti theorem: P1*delta12 = P2*delta21");

    // Verify with different structure: cantilever
    // System C1: P1 at node 5
    let loads_c1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input_c1 = make_beam(n, l, E, A, IZ, "fixed", None, loads_c1);
    let res_c1 = linear::solve_2d(&input_c1).unwrap();
    // Displacement at tip (node n+1) due to system C1
    let d_c1_at_tip = res_c1.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    // System C2: P2 at tip (node n+1)
    let loads_c2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p2, mz: 0.0,
    })];
    let input_c2 = make_beam(n, l, E, A, IZ, "fixed", None, loads_c2);
    let res_c2 = linear::solve_2d(&input_c2).unwrap();
    // Displacement at node 5 due to system C2
    let d_c2_at_5 = res_c2.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uy;

    // Betti: P1 * d_c2_at_5 = P2 * d_c1_at_tip
    let w_c1 = p1 * d_c2_at_5.abs();
    let w_c2 = p2 * d_c1_at_tip.abs();

    assert_close(w_c1, w_c2, 0.01,
        "Betti theorem (cantilever): P1*d12 = P2*d21");
}

// ================================================================
// 6. Minimum Potential Energy: Solver Finds Minimum
// ================================================================
//
// The principle of minimum potential energy states that among all
// kinematically admissible displacement fields, the actual one
// minimizes the total potential energy: Pi = U - W_ext
//
// Verify: perturb the solver solution slightly, recompute Pi,
// and confirm Pi_perturbed > Pi_solver.
// We do this by solving, then computing U and W for the solver
// solution and for a slightly perturbed displacement field.

#[test]
fn validation_energy_minimum_potential() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Compute external work at solver solution: W = P * delta
    let delta_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // For the actual solution, Pi = U - W = (1/2)*P*delta - P*delta = -(1/2)*P*delta
    let pi_solver = 0.5 * p * delta_mid - p * delta_mid;
    // Pi_solver = -0.5 * P * delta

    // Analytical: delta = PL^3/(48EI)
    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);

    // For a perturbed field: delta_perturbed = alpha * delta_exact
    // U_perturbed = (1/2) * k * (alpha*delta)^2 where k = 48EI/L^3 (stiffness)
    // W_perturbed = P * alpha * delta
    // Pi = (1/2)*k*(alpha*delta)^2 - P*alpha*delta
    let k_eff = 48.0 * e_eff * IZ / (l * l * l);

    // Test several perturbation factors
    for &alpha in &[0.8, 0.9, 1.1, 1.2, 0.5, 1.5] {
        let d_pert = alpha * delta_exact;
        let u_pert = 0.5 * k_eff * d_pert * d_pert;
        let w_pert = p * d_pert;
        let pi_pert = u_pert - w_pert;

        // The solver solution should have the minimum Pi
        let u_solver = 0.5 * k_eff * delta_exact * delta_exact;
        let w_solver = p * delta_exact;
        let pi_exact = u_solver - w_solver;

        assert!(pi_pert >= pi_exact - 1e-10,
            "Minimum potential energy: Pi(alpha={}) = {:.6e} >= Pi_solver = {:.6e}",
            alpha, pi_pert, pi_exact);
    }

    // Verify solver solution is close to exact minimum
    assert_close(delta_mid, delta_exact, 0.02,
        "Minimum potential energy: solver delta matches exact");

    // Pi at minimum should be -P^2*L^3/(96EI)
    let pi_exact = -p * p * l * l * l / (96.0 * e_eff * IZ);
    assert_close(pi_solver, pi_exact, 0.02,
        "Minimum potential energy: Pi = -P^2*L^3/(96EI)");
}

// ================================================================
// 7. Complementary Energy: dU*/dR = 0 at Correct Reaction
// ================================================================
//
// For a propped cantilever (fixed-roller) with center load P:
// The redundant reaction R at the roller can be found by minimizing
// complementary energy: dU*/dR = 0.
//
// Compute U* for the solver reaction and for perturbed values,
// verify the solver reaction gives the minimum.

#[test]
fn validation_energy_complementary() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    // Propped cantilever: fixed at left, roller at right
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Get solver reaction at roller
    let r_solver = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;

    // The complementary energy U* = integral(M^2/(2EI))dx
    // For a propped cantilever with P at center and reaction R at the roller end:
    // With R as the redundant, the moment field is:
    //   For x in [0, L/2]: M(x) = -R*(L-x) + P*(L/2-x)  (measuring from fixed end)
    //   For x in [L/2, L]: M(x) = -R*(L-x)
    //
    // We compute U*(R) numerically for several values of R and verify
    // that the solver value minimizes it.
    let compute_complementary_energy = |r: f64| -> f64 {
        // Numerical integration with many small steps
        let steps = 1000;
        let dx = l / steps as f64;
        let mut u_star = 0.0;
        for i in 0..steps {
            let x = (i as f64 + 0.5) * dx; // midpoint rule
            let m = if x <= l / 2.0 {
                // Left of load: moment from fixed end reactions and applied load
                // Using superposition: cantilever moment + redundant effect
                // M = R*(L - x) - P*(L/2 - x) for x < L/2 if measuring from left
                // Actually let's use a clean formulation:
                // Reaction at left: Ry_left = P - R (equilibrium)
                // Moment at left: M_left (from fixed support)
                // M(x) = M_left + Ry_left * x  for x < L/2
                // M(x) = M_left + Ry_left * x - P*(x - L/2) for x > L/2
                // At x = L: M(L) = 0 (free end at roller, no moment)
                // 0 = M_left + (P - R)*L - P*(L - L/2) = M_left + PL - RL - PL/2
                // M_left = RL - PL/2
                let ry_left = p - r;
                let m_left = r * l - p * l / 2.0;
                m_left + ry_left * x
            } else {
                let ry_left = p - r;
                let m_left = r * l - p * l / 2.0;
                m_left + ry_left * x - p * (x - l / 2.0)
            };
            u_star += m * m * dx / (2.0 * e_eff * IZ);
        }
        u_star
    };

    let u_star_solver = compute_complementary_energy(r_solver);

    // Verify that perturbed R values give higher complementary energy
    for &dr in &[-3.0, -1.0, -0.5, 0.5, 1.0, 3.0] {
        let r_pert = r_solver + dr;
        let u_star_pert = compute_complementary_energy(r_pert);
        assert!(u_star_pert >= u_star_solver - 1e-10,
            "Complementary energy: U*(R+{}) = {:.6e} >= U*(R_solver) = {:.6e}",
            dr, u_star_pert, u_star_solver);
    }

    // Verify dU*/dR ~ 0 at solver reaction using central difference
    let eps = 0.001;
    let u_plus = compute_complementary_energy(r_solver + eps);
    let u_minus = compute_complementary_energy(r_solver - eps);
    let du_dr = (u_plus - u_minus) / (2.0 * eps);

    // dU*/dR should be zero (compatibility condition)
    assert!(du_dr.abs() < 0.01,
        "Complementary energy: |dU*/dR| = {:.6e} ~ 0", du_dr);
}

// ================================================================
// 8. Work-Energy Consistency: External Work = Internal Strain Energy
// ================================================================
//
// For any linear elastic structure: (1/2) * sum(P_i * delta_i) = U_internal
// Test with multiple loads on a beam.

#[test]
fn validation_energy_work_consistency() {
    let l = 10.0;
    let n = 20;
    let e_eff = E * 1000.0;

    // Apply multiple point loads at different locations
    let p1 = 15.0;
    let p2 = 25.0;
    let p3 = 10.0;
    let node1 = 5;   // x = 2.0
    let node2 = 11;  // x = 5.0
    let node3 = 16;  // x = 7.5

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node1, fx: 0.0, fy: -p1, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node2, fx: 0.0, fy: -p2, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node3, fx: 0.0, fy: -p3, mz: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // External work: W = (1/2) * sum(P_i * |delta_i|)
    let d1 = results.displacements.iter().find(|d| d.node_id == node1).unwrap().uy.abs();
    let d2 = results.displacements.iter().find(|d| d.node_id == node2).unwrap().uy.abs();
    let d3 = results.displacements.iter().find(|d| d.node_id == node3).unwrap().uy.abs();
    let w_ext = 0.5 * (p1 * d1 + p2 * d2 + p3 * d3);

    // Internal strain energy: U = sum over elements of integral(M^2/(2EI))dx
    // Use trapezoidal rule on each element
    let mut u_int = 0.0;
    for ef in &results.element_forces {
        let le = ef.length;
        let m2_avg = (ef.m_start * ef.m_start + ef.m_end * ef.m_end) / 2.0;
        u_int += m2_avg * le / (2.0 * e_eff * IZ);
    }

    assert_close(w_ext, u_int, 0.02,
        "Work-energy consistency: W_ext = U_int for multi-load beam");

    // Also test with a cantilever + combined loads (transverse + moment)
    let p_tip = 12.0;
    let m_tip = 8.0;
    let n_cant = 10;
    let l_cant = 5.0;
    let loads_cant = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_cant + 1, fx: 0.0, fy: -p_tip, mz: m_tip,
    })];
    let input_cant = make_beam(n_cant, l_cant, E, A, IZ, "fixed", None, loads_cant);
    let res_cant = linear::solve_2d(&input_cant).unwrap();

    let tip = res_cant.displacements.iter()
        .find(|d| d.node_id == n_cant + 1).unwrap();
    // W_ext = (1/2) * sum(F_i * u_i)
    // Force at tip: fy = -p_tip, mz = m_tip
    // Work = 0.5 * ((-p_tip)*uy + m_tip*rz)
    // Since uy is negative (downward) and fy is negative, (-p_tip)*uy > 0
    let w_ext_cant = 0.5 * ((-p_tip) * tip.uy + m_tip * tip.rz);

    let mut u_int_cant = 0.0;
    for ef in &res_cant.element_forces {
        let le = ef.length;
        let m2_avg = (ef.m_start * ef.m_start + ef.m_end * ef.m_end) / 2.0;
        u_int_cant += m2_avg * le / (2.0 * e_eff * IZ);
    }

    assert_close(w_ext_cant, u_int_cant, 0.02,
        "Work-energy consistency: cantilever with P + M");
}
