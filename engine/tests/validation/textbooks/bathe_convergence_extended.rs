/// Validation: Extended FEM Convergence Analysis (Bathe)
///
/// Tests additional FEM convergence properties, superposition, energy
/// convergence, and solution quality for indeterminate structures:
///   - Superposition principle (linearity check)
///   - Strain energy convergence (U = 1/2 P delta)
///   - Propped cantilever convergence (indeterminate structure)
///   - Triangular load h-refinement convergence
///   - Interior support moment convergence (continuous beam)
///   - Shear force convergence (fixed-fixed beam)
///   - Equilibrium satisfaction under mesh refinement
///   - Convergence rate estimation via log-log slope
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2nd Ed., 2014, Ch. 4
///   - Zienkiewicz, O.C., Taylor, R.L., "The Finite Element Method", 7th Ed.
///   - Cook, R.D., et al., "Concepts and Applications of FEA", 4th Ed.
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4

// ================================================================
// 1. Superposition Principle (Linearity Verification)
// ================================================================
//
// For a linear FEM solver, the response to combined loads must equal
// the sum of responses to individual loads:
//   u(P1 + P2) = u(P1) + u(P2)
//
// Test: cantilever beam with (a) tip point load, (b) UDL, (c) both.
// The displacement under combined loading must equal the sum of
// individual displacements. This verifies the solver preserves
// linearity and the stiffness matrix is assembled correctly.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.2

#[test]
fn validation_bathe_ext_1_superposition_principle() {
    let length: f64 = 5.0;
    let n = 8;
    let tip_node = n + 1;
    let p: f64 = -10.0; // tip load (kN)
    let q: f64 = -3.0; // UDL (kN/m)

    // Case A: tip load only
    let input_a = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let res_a = linear::solve_2d(&input_a).unwrap();
    let tip_a = res_a.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // Case B: UDL only
    let mut input_b = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    for i in 1..=n {
        input_b.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_b = linear::solve_2d(&input_b).unwrap();
    let tip_b = res_b.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // Case C: both loads simultaneously
    let mut input_c = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    for i in 1..=n {
        input_c.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let res_c = linear::solve_2d(&input_c).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == tip_node).unwrap();

    // Superposition: u_c = u_a + u_b
    let uy_sum = tip_a.uy + tip_b.uy;
    assert_close(tip_c.uy, uy_sum, 0.001, "Superposition: uy combined vs sum");

    let rz_sum = tip_a.rz + tip_b.rz;
    assert_close(tip_c.rz, rz_sum, 0.001, "Superposition: rz combined vs sum");

    // Also check an interior node
    let mid_node = n / 2 + 1;
    let mid_a = res_a.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let mid_b = res_b.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let mid_c = res_c.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_c.uy, mid_a.uy + mid_b.uy, 0.001, "Superposition: midpoint uy");
}

// ================================================================
// 2. Strain Energy Convergence
// ================================================================
//
// The strain energy U = (1/2) * sum(f_i * u_i) should converge
// monotonically from below to the exact value as the mesh is
// refined. For a simply-supported beam under UDL:
//   U_exact = (1/2) * integral(q * v(x) dx)
//           = (1/2) * q * integral(v(x) dx)
// where v(x) = (q/(24EI)) * x * (L^3 - 2Lx^2 + x^3).
//
// Integrating: U_exact = q^2 * L^5 / (240 * EI)
//
// Reference: Przemieniecki, "Theory of Matrix Structural Analysis", 1968, Ch. 4

#[test]
fn validation_bathe_ext_2_strain_energy_convergence() {
    let length: f64 = 6.0;
    let q: f64 = -5.0; // kN/m (downward)
    let ei = E * 1000.0 * IZ;

    // Exact strain energy for SS beam under UDL:
    // U = q^2 * L^5 / (240 * EI)
    let u_exact: f64 = q * q * length.powi(5) / (240.0 * ei);

    let mesh_sizes: [usize; 5] = [2, 4, 8, 16, 32];
    let mut energies = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();

        // Compute strain energy: U = (1/2) * sum(R_i * u_i)
        // For a beam with only distributed loads and support reactions,
        // use the work done by the external distributed load on the displacements.
        // U = (1/2) * sum over elements of integral(q * v dx)
        // Approximate using nodal displacements and trapezoidal rule.
        let elem_len = length / n as f64;
        let mut strain_energy: f64 = 0.0;
        for i in 0..n {
            let n_i = i + 1;
            let n_j = i + 2;
            let uy_i = results.displacements.iter().find(|d| d.node_id == n_i).unwrap().uy;
            let uy_j = results.displacements.iter().find(|d| d.node_id == n_j).unwrap().uy;
            // Work = (1/2) * integral(q * v dx) over element, trapezoid rule
            // q is downward negative, v is downward negative => product is positive
            strain_energy += 0.5 * q.abs() * (uy_i.abs() + uy_j.abs()) / 2.0 * elem_len;
        }
        energies.push(strain_energy);
    }

    // Strain energy should approach from below (stiffness bound)
    // and converge monotonically
    for i in 1..energies.len() {
        assert!(
            energies[i] >= energies[i - 1] * (1.0 - 0.001),
            "Strain energy should increase with refinement: n={}→{}: {:.6}→{:.6}",
            mesh_sizes[i - 1], mesh_sizes[i], energies[i - 1], energies[i]
        );
    }

    // Finest mesh energy should be close to exact
    let err_finest = (energies.last().unwrap() - u_exact).abs() / u_exact;
    assert!(
        err_finest < 0.05,
        "Strain energy finest mesh error = {:.4}%, expected < 5%. U_fem={:.6}, U_exact={:.6}",
        err_finest * 100.0, energies.last().unwrap(), u_exact
    );
}

// ================================================================
// 3. Propped Cantilever Convergence (Indeterminate Structure)
// ================================================================
//
// A propped cantilever (fixed at one end, roller at other) under UDL
// is statically indeterminate. The exact midspan deflection requires
// compatibility and is:
//   R_roller = 3qL/8
//   delta_max at x = 0.4215L from fixed end:
//     delta_max = q*L^4 / (185 * EI)  (approximately)
//
// The fixed-end moment is M = -qL^2/8.
// This test verifies convergence of the reaction at the roller support.
//
// Reference: Bathe, 2014, Sec. 4.3; Hibbeler, "Structural Analysis", Ch. 10

#[test]
fn validation_bathe_ext_3_propped_cantilever_convergence() {
    let length: f64 = 8.0;
    let q: f64 = -6.0; // kN/m (downward)

    // Exact reaction at roller (node at x=L): R_roller = 3*|q|*L/8
    let r_roller_exact: f64 = 3.0 * q.abs() * length / 8.0;

    // Exact fixed-end moment: M_fixed = -q*L^2/8 => |M_fixed| = |q|*L^2/8
    let m_fixed_exact: f64 = q.abs() * length * length / 8.0;

    let mesh_sizes: [usize; 5] = [2, 4, 8, 16, 32];
    let mut reaction_errors = Vec::new();
    let mut moment_errors = Vec::new();

    for &n in &mesh_sizes {
        // Build propped cantilever: fixed at node 1, rollerX at node n+1
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("rollerX"), vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();

        // Check roller reaction
        let r_roller = results.reactions.iter()
            .find(|r| r.node_id == n + 1).unwrap();
        let err_r = (r_roller.ry.abs() - r_roller_exact).abs() / r_roller_exact;
        reaction_errors.push(err_r);

        // Check fixed-end moment
        let r_fixed = results.reactions.iter()
            .find(|r| r.node_id == 1).unwrap();
        let err_m = (r_fixed.mz.abs() - m_fixed_exact).abs() / m_fixed_exact;
        moment_errors.push(err_m);
    }

    // Reactions should converge with mesh refinement
    for i in 1..reaction_errors.len() {
        if reaction_errors[i - 1] > 1e-10 {
            assert!(
                reaction_errors[i] <= reaction_errors[i - 1] * 1.01,
                "Propped cantilever reaction: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], reaction_errors[i], mesh_sizes[i - 1], reaction_errors[i - 1]
            );
        }
    }

    // Finest mesh should be very accurate
    assert!(
        *reaction_errors.last().unwrap() < 0.01,
        "Propped cantilever reaction error = {:.4}%, expected < 1%",
        reaction_errors.last().unwrap() * 100.0
    );
    assert!(
        *moment_errors.last().unwrap() < 0.01,
        "Propped cantilever moment error = {:.4}%, expected < 1%",
        moment_errors.last().unwrap() * 100.0
    );
}

// ================================================================
// 4. Triangular Load Convergence
// ================================================================
//
// A simply-supported beam with linearly varying (triangular) load
// from zero at x=0 to q_max at x=L. The exact midspan deflection is:
//   delta_mid = q_max * L^4 / (120 * EI)  (approximately, for max at L)
// Exact reaction at left: R_left = q_max * L / 6
// Exact reaction at right: R_right = q_max * L / 3
//
// Since the load varies linearly element-by-element, convergence
// requires fine enough mesh to approximate the load variation.
//
// Reference: Zienkiewicz & Taylor, "The Finite Element Method", Vol. 1, Ch. 9

#[test]
fn validation_bathe_ext_4_triangular_load_convergence() {
    let length: f64 = 6.0;
    let q_max: f64 = -10.0; // peak intensity at x=L (kN/m, downward)

    // Exact reactions for triangular load (q=0 at x=0, q=q_max at x=L):
    let r_left_exact: f64 = q_max.abs() * length / 6.0;
    let r_right_exact: f64 = q_max.abs() * length / 3.0;

    let mesh_sizes: [usize; 5] = [2, 4, 8, 16, 32];
    let mut errors_left = Vec::new();
    let mut errors_right = Vec::new();

    for &n in &mesh_sizes {
        let n_nodes = n + 1;
        let elem_len = length / n as f64;

        // Build SS beam with triangular load
        let nodes: Vec<_> = (0..n_nodes)
            .map(|i| (i + 1, i as f64 * elem_len, 0.0))
            .collect();
        let elems: Vec<_> = (0..n)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")];

        // Linearly varying load on each element
        let mut loads = Vec::new();
        for i in 0..n {
            let x_i = i as f64 * elem_len;
            let x_j = (i + 1) as f64 * elem_len;
            let q_i = q_max * x_i / length;
            let q_j = q_max * x_j / length;
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i, q_j, a: None, b: None,
            }));
        }

        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A, IZ)],
            elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();

        let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();

        let err_l = (r_left.ry.abs() - r_left_exact).abs() / r_left_exact;
        let err_r = (r_right.ry.abs() - r_right_exact).abs() / r_right_exact;
        errors_left.push(err_l);
        errors_right.push(err_r);
    }

    // Finest mesh should give accurate reactions
    assert!(
        *errors_left.last().unwrap() < 0.01,
        "Triangular load left reaction error = {:.4}%, expected < 1%",
        errors_left.last().unwrap() * 100.0
    );
    assert!(
        *errors_right.last().unwrap() < 0.01,
        "Triangular load right reaction error = {:.4}%, expected < 1%",
        errors_right.last().unwrap() * 100.0
    );

    // Error should decrease or stay near-zero with refinement
    for i in 1..errors_left.len() {
        if errors_left[i - 1] > 1e-10 {
            assert!(
                errors_left[i] <= errors_left[i - 1] * 1.01,
                "Triangular load left reaction: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors_left[i], mesh_sizes[i - 1], errors_left[i - 1]
            );
        }
    }
}

// ================================================================
// 5. Continuous Beam Interior Support Moment Convergence
// ================================================================
//
// A two-span continuous beam (each span L, UDL on both spans) has
// an exact interior support moment from the three-moment equation:
//   M_interior = -qL^2/8
//
// The FEM solution should converge to this value as the mesh is
// refined independently in each span.
//
// Reference: Cook et al., "Concepts and Applications of FEA", 4th Ed., Ch. 2

#[test]
fn validation_bathe_ext_5_continuous_beam_moment_convergence() {
    let span: f64 = 6.0;
    let q: f64 = -5.0; // UDL (kN/m, downward)

    // Three-moment equation for two equal spans with UDL:
    // M_B = -q*L^2/8
    let m_interior_exact: f64 = q.abs() * span * span / 8.0;

    let mesh_sizes: [usize; 5] = [1, 2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n_per_span in &mesh_sizes {
        let total_elem = 2 * n_per_span;

        // Build loads for all elements
        let mut loads = Vec::new();
        for i in 1..=total_elem {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }

        let input = make_continuous_beam(
            &[span, span],
            n_per_span,
            E, A, IZ,
            loads,
        );
        let results = linear::solve_2d(&input).unwrap();

        // Interior support is at node (n_per_span + 1)
        let _interior_node = n_per_span + 1;

        // Get the moment at the interior support from element forces.
        // The moment at the right end of the element ending at the interior node
        // (element n_per_span) gives the support moment.
        let ef = results.element_forces.iter()
            .find(|ef| ef.element_id == n_per_span)
            .unwrap();
        let m_interior = ef.m_end.abs();

        let err = (m_interior - m_interior_exact).abs() / m_interior_exact;
        errors.push(err);
    }

    // Error should decrease with refinement
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.01,
                "Continuous beam moment: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    // Finest mesh should be accurate
    assert!(
        *errors.last().unwrap() < 0.01,
        "Continuous beam interior moment error = {:.4}%, expected < 1%",
        errors.last().unwrap() * 100.0
    );
}

// ================================================================
// 6. Shear Force Convergence (Fixed-Fixed Beam under UDL)
// ================================================================
//
// For a fixed-fixed beam under UDL, exact shear at the supports:
//   V = qL/2  (by symmetry)
// Exact maximum moment at supports: M = qL^2/12
// Exact midspan moment: M_mid = qL^2/24
//
// Shear forces converge slower than displacements for FEM.
// This test verifies that shear converges with mesh refinement.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.3

#[test]
fn validation_bathe_ext_6_shear_force_convergence() {
    let length: f64 = 6.0;
    let q: f64 = -8.0; // kN/m (downward)

    // Exact end shear for fixed-fixed beam under UDL:
    let v_exact: f64 = q.abs() * length / 2.0;

    let mesh_sizes: [usize; 5] = [2, 4, 8, 16, 32];
    let mut shear_errors = Vec::new();

    for &n in &mesh_sizes {
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();

        // Get shear at left end (element 1, start)
        let ef1 = results.element_forces.iter()
            .find(|ef| ef.element_id == 1).unwrap();
        let v_start = ef1.v_start.abs();

        let err = (v_start - v_exact).abs() / v_exact;
        shear_errors.push(err);
    }

    // Shear should converge with refinement
    for i in 1..shear_errors.len() {
        if shear_errors[i - 1] > 1e-10 {
            assert!(
                shear_errors[i] <= shear_errors[i - 1] * 1.01,
                "Shear convergence: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], shear_errors[i], mesh_sizes[i - 1], shear_errors[i - 1]
            );
        }
    }

    // Finest mesh shear should be accurate
    assert!(
        *shear_errors.last().unwrap() < 0.01,
        "Shear convergence error = {:.4}%, expected < 1%",
        shear_errors.last().unwrap() * 100.0
    );
}

// ================================================================
// 7. Equilibrium Satisfaction Under Mesh Refinement
// ================================================================
//
// Regardless of mesh refinement level, the FEM solution must
// satisfy global equilibrium exactly (to machine precision):
//   sum(Reactions_y) = sum(Applied_loads_y)
//   sum(Reactions_x) = sum(Applied_loads_x)
//   sum(Moments about any point) = 0
//
// This should hold for every mesh, not just the finest.
// Non-trivial load case: cantilever with combined UDL and tip load.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.2

#[test]
fn validation_bathe_ext_7_equilibrium_satisfaction() {
    let length: f64 = 5.0;
    let q: f64 = -4.0; // UDL (kN/m)
    let p_tip: f64 = -10.0; // tip load (kN)

    let mesh_sizes: [usize; 5] = [1, 2, 4, 8, 16];

    for &n in &mesh_sizes {
        let tip_node = n + 1;

        let mut input = make_beam(
            n, length, E, A, IZ, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: p_tip, mz: 0.0,
            })],
        );
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();

        // Total applied vertical load = q*L + P_tip
        let total_applied_fy: f64 = q * length + p_tip;

        // Sum of reaction forces in Y
        let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

        // Equilibrium: sum_ry + total_applied = 0
        // (reactions oppose the applied loads)
        let residual_y = (sum_ry + total_applied_fy).abs();
        assert!(
            residual_y < 1e-6,
            "Vertical equilibrium n={}: residual={:.6e}, sum_ry={:.6}, applied={:.6}",
            n, residual_y, sum_ry, total_applied_fy
        );

        // Moment equilibrium about the fixed support (node 1, x=0):
        // Applied moment from UDL: integral(q*x dx, 0..L) = q*L^2/2
        // Applied moment from tip load: P_tip * L
        // Reaction moment at support: sum_mz from reactions
        let applied_moment: f64 = q * length * length / 2.0 + p_tip * length;
        let sum_mz: f64 = results.reactions.iter().map(|r| r.mz).sum();
        let residual_m = (sum_mz + applied_moment).abs();

        assert!(
            residual_m < 1e-4,
            "Moment equilibrium n={}: residual={:.6e}, sum_mz={:.6}, applied_m={:.6}",
            n, residual_m, sum_mz, applied_moment
        );
    }
}

// ================================================================
// 8. Scaling Invariance (Load Proportionality)
// ================================================================
//
// For a linear FEM solver, scaling all loads by a factor alpha
// must scale all displacements, reactions, and element forces
// by the same factor alpha:
//   u(alpha * P) = alpha * u(P)
//
// This test verifies load proportionality by comparing results
// from a simply-supported beam under UDL at two different load
// levels. The ratio of results must equal the ratio of loads,
// which is a fundamental linearity requirement.
//
// Reference: Bathe, "Finite Element Procedures", 2014, Sec. 4.2;
//   Przemieniecki, "Theory of Matrix Structural Analysis", 1968, Ch. 3

#[test]
fn validation_bathe_ext_8_scaling_invariance() {
    let length: f64 = 6.0;
    let n = 8;
    let q1: f64 = -5.0; // base load
    let q2: f64 = -17.5; // scaled load
    let alpha: f64 = q2 / q1; // scaling factor = 3.5

    // Case 1: base load
    let input1 = make_ss_beam_udl(n, length, E, A, IZ, q1);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Case 2: scaled load
    let input2 = make_ss_beam_udl(n, length, E, A, IZ, q2);
    let res2 = linear::solve_2d(&input2).unwrap();

    // Check displacement scaling at midspan
    let mid_node = n / 2 + 1;
    let d1_mid = res1.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let d2_mid = res2.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(
        d2_mid.uy, alpha * d1_mid.uy, 0.001,
        "Scaling: midspan displacement proportionality",
    );

    // Check reaction scaling at left support
    let r1_left = res1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2_left = res2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(
        r2_left.ry, alpha * r1_left.ry, 0.001,
        "Scaling: left reaction proportionality",
    );

    // Check element force scaling for a middle element
    let mid_elem = n / 2;
    let ef1 = res1.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap();
    let ef2 = res2.element_forces.iter().find(|ef| ef.element_id == mid_elem).unwrap();
    assert_close(
        ef2.m_start, alpha * ef1.m_start, 0.001,
        "Scaling: element moment proportionality",
    );
    assert_close(
        ef2.v_start, alpha * ef1.v_start, 0.001,
        "Scaling: element shear proportionality",
    );

    // Check rotation scaling at quarter-span
    let quarter_node = n / 4 + 1;
    let d1_q = res1.displacements.iter().find(|d| d.node_id == quarter_node).unwrap();
    let d2_q = res2.displacements.iter().find(|d| d.node_id == quarter_node).unwrap();
    assert_close(
        d2_q.rz, alpha * d1_q.rz, 0.001,
        "Scaling: quarter-span rotation proportionality",
    );
}
