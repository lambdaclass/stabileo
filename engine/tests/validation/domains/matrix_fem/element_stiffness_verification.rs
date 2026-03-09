/// Validation: Element Stiffness Matrix Properties via Observable Behavior
///
/// Verifies that the element stiffness matrix produces correct deflections,
/// forces, and reactions for fundamental load cases. Rather than inspecting
/// the matrix directly, these tests check observable consequences of correct
/// stiffness formulation.
///
/// References:
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
///   - Cook et al., "Concepts and Applications of Finite Element Analysis", 4th Ed.
///   - Timoshenko & Gere, "Mechanics of Materials"
///
/// Tests:
///   1. Single element cantilever tip load: delta = PL^3/(3EI)
///   2. Single element axial bar: delta = PL/(EA)
///   3. Two-element vs one-element cantilever: identical tip deflection
///   4. Stiffness scales with E: double E -> half displacement
///   5. Stiffness scales with I: double Iz -> half displacement
///   6. Stiffness scales inversely with L^3 for bending
///   7. Fixed-fixed beam center point load: delta = PL^3/(192EI)
///   8. Element equilibrium: force balance on each element
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Single Element Cantilever Tip Load
// ================================================================
//
// A single cubic Euler-Bernoulli beam element exactly represents
// the deformation under end loads (no distributed load). The tip
// deflection must match delta = PL^3/(3EI) with no mesh refinement.

#[test]
fn validation_single_element_cantilever_tip_load() {
    let l = 6.0;
    let p = 50.0;
    let e_eff = E * 1000.0; // solver uses kN, m with E in MPa

    // Single element: node 1 fixed, node 2 free with tip load
    let input = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta = p * l.powi(3) / (3.0 * e_eff * IZ);

    assert_close(tip.uy.abs(), expected_delta, 0.02, "single elem cantilever tip delta");

    // Also verify reaction at fixed end
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, p, 0.02, "single elem cantilever Ry");
    assert_close(r1.mz.abs(), p * l, 0.02, "single elem cantilever M_fixed");
}

// ================================================================
// 2. Single Element Axial Bar
// ================================================================
//
// A single bar element under axial load should give exact
// displacement delta = PL/(EA). The linear shape function for
// axial DOFs is exact for constant axial load.

#[test]
fn validation_single_element_axial_bar() {
    let l = 5.0;
    let p_axial = 100.0; // kN axial load in +X direction
    let e_eff = E * 1000.0;

    // Single element along X: node 1 fixed, node 2 free, axial load at tip
    let input = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p_axial, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta = p_axial * l / (e_eff * A);

    assert_close(tip.ux, expected_delta, 0.02, "axial bar tip delta");

    // Transverse displacement should be zero
    assert!(tip.uy.abs() < 1e-10, "axial bar should have no transverse displacement");

    // Reaction at fixed end
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -p_axial, 0.02, "axial bar Rx reaction");
}

// ================================================================
// 3. Two-Element vs One-Element Cantilever
// ================================================================
//
// For a cantilever with a tip point load, the cubic shape function
// is exact. Therefore 1 element and 2 elements must give the same
// tip deflection (no improvement from mesh refinement for end loads).

#[test]
fn validation_two_element_vs_one_element_cantilever() {
    let l = 8.0;
    let p = 40.0;

    // One-element cantilever
    let input_1 = make_beam(
        1, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results_1 = linear::solve_2d(&input_1).unwrap();
    let tip_1 = results_1.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Two-element cantilever (tip node is 3)
    let input_2 = make_beam(
        2, l, E, A, IZ,
        "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results_2 = linear::solve_2d(&input_2).unwrap();
    let tip_2 = results_2.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both should agree to high precision
    let rel_diff = (tip_1.uy - tip_2.uy).abs() / tip_1.uy.abs().max(1e-20);
    assert!(
        rel_diff < 0.02,
        "1-elem tip delta={:.6e}, 2-elem tip delta={:.6e}, rel_diff={:.4}%",
        tip_1.uy, tip_2.uy, rel_diff * 100.0
    );

    // Rotations should also match
    let rot_diff = (tip_1.rz - tip_2.rz).abs() / tip_1.rz.abs().max(1e-20);
    assert!(
        rot_diff < 0.02,
        "1-elem tip rz={:.6e}, 2-elem tip rz={:.6e}, rel_diff={:.4}%",
        tip_1.rz, tip_2.rz, rot_diff * 100.0
    );
}

// ================================================================
// 4. Stiffness Scales with E
// ================================================================
//
// For the same geometry and load, doubling E should halve the
// displacement. This verifies that E enters the stiffness matrix
// correctly as a linear multiplier.

#[test]
fn validation_stiffness_scales_with_e() {
    let l = 6.0;
    let p = 30.0;
    let e1 = 200_000.0;
    let e2 = 400_000.0; // doubled

    let make_case = |e_val: f64| {
        make_beam(
            1, l, e_val, A, IZ,
            "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
            })],
        )
    };

    let results_1 = linear::solve_2d(&make_case(e1)).unwrap();
    let results_2 = linear::solve_2d(&make_case(e2)).unwrap();

    let tip_1 = results_1.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let tip_2 = results_2.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta_1 / delta_2 should be 2.0 (double E -> half displacement)
    let ratio = tip_1.uy.abs() / tip_2.uy.abs();
    assert_close(ratio, 2.0, 0.02, "E scaling: delta ratio");

    // Reactions should be identical (same load, same geometry)
    let r1_a = results_1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_b = results_2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_a.ry, r1_b.ry, 0.02, "E scaling: Ry unchanged");
    assert_close(r1_a.mz, r1_b.mz, 0.02, "E scaling: Mz unchanged");
}

// ================================================================
// 5. Stiffness Scales with I
// ================================================================
//
// Doubling the moment of inertia Iz should halve the bending
// displacement. This confirms that Iz enters the bending stiffness
// correctly.

#[test]
fn validation_stiffness_scales_with_iz() {
    let l = 6.0;
    let p = 30.0;
    let iz1 = 1e-4;
    let iz2 = 2e-4; // doubled

    let make_case = |iz_val: f64| {
        make_beam(
            1, l, E, A, iz_val,
            "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
            })],
        )
    };

    let results_1 = linear::solve_2d(&make_case(iz1)).unwrap();
    let results_2 = linear::solve_2d(&make_case(iz2)).unwrap();

    let tip_1 = results_1.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let tip_2 = results_2.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta_1 / delta_2 should be 2.0 (double Iz -> half displacement)
    let ratio = tip_1.uy.abs() / tip_2.uy.abs();
    assert_close(ratio, 2.0, 0.02, "Iz scaling: delta ratio");

    // Reactions should be identical
    let r1_a = results_1.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_b = results_2.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1_a.ry, r1_b.ry, 0.02, "Iz scaling: Ry unchanged");
}

// ================================================================
// 6. Stiffness Scales Inversely with L^3 for Bending
// ================================================================
//
// Cantilever tip deflection delta = PL^3/(3EI). So for L2=2*L1,
// delta_2/delta_1 = (L2/L1)^3 = 8. This verifies the cubic
// dependence on length in the bending stiffness.

#[test]
fn validation_stiffness_scales_inversely_with_l_cubed() {
    let p = 25.0;
    let l1 = 4.0;
    let l2 = 8.0; // doubled length

    let make_case = |length: f64| {
        // Use single element for exact result
        make_beam(
            1, length, E, A, IZ,
            "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
            })],
        )
    };

    let results_1 = linear::solve_2d(&make_case(l1)).unwrap();
    let results_2 = linear::solve_2d(&make_case(l2)).unwrap();

    let tip_1 = results_1.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let tip_2 = results_2.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // delta_2 / delta_1 should be (L2/L1)^3 = 8
    let ratio = tip_2.uy.abs() / tip_1.uy.abs();
    assert_close(ratio, 8.0, 0.02, "L^3 scaling: delta ratio");

    // Also verify absolute values against formula
    let e_eff = E * 1000.0;
    let expected_1 = p * l1.powi(3) / (3.0 * e_eff * IZ);
    let expected_2 = p * l2.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip_1.uy.abs(), expected_1, 0.02, "L^3 scaling: delta_short");
    assert_close(tip_2.uy.abs(), expected_2, 0.02, "L^3 scaling: delta_long");
}

// ================================================================
// 7. Fixed-Fixed Beam Center Point Load
// ================================================================
//
// 2 elements, fixed-fixed, center point load P at midspan.
// delta_mid = PL^3/(192EI). This tests the assembled stiffness of
// two elements with both ends fully restrained.

#[test]
fn validation_fixed_fixed_center_point_load() {
    let l = 10.0;
    let p = 80.0;
    let e_eff = E * 1000.0;

    // 2 elements: nodes 1-2-3, fixed at 1 and 3, load at node 2 (midspan)
    let input = make_beam(
        2, l, E, A, IZ,
        "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let expected_delta = p * l.powi(3) / (192.0 * e_eff * IZ);

    assert_close(mid.uy.abs(), expected_delta, 0.02, "FF center point delta");

    // Reactions: by symmetry each support carries P/2 vertically
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "FF center point R_A");
    assert_close(r3.ry, p / 2.0, 0.02, "FF center point R_B");

    // End moments: M = PL/8
    assert_close(r1.mz.abs(), p * l / 8.0, 0.05, "FF center point M_A");
    assert_close(r3.mz.abs(), p * l / 8.0, 0.05, "FF center point M_B");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "FF center point equilibrium");
}

// ================================================================
// 8. Element Equilibrium
// ================================================================
//
// For each element, true internal forces must satisfy equilibrium:
//   - n_start + n_end approx 0 (no distributed axial load)
//   - v_start - v_end = q*L_elem (shear drop across element under UDL)
//   - m_start - m_end - v_start*L_elem + q*L_elem^2/2 = 0 (moment balance)
//
// Test with a cantilever beam under UDL to exercise all terms.

#[test]
fn validation_element_equilibrium() {
    let l = 10.0;
    let n = 4;
    let q = 15.0; // kN/m downward
    let elem_len = l / n as f64; // 2.5 m per element

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    for ef in &results.element_forces {
        // Axial equilibrium: n_start + n_end should be ~0 (no distributed axial load)
        let axial_sum = ef.n_start + ef.n_end;
        assert!(
            axial_sum.abs() < 0.05 * q * elem_len,
            "Element {} axial equilibrium: n_start={:.4} + n_end={:.4} = {:.4}, expected ~0",
            ef.element_id, ef.n_start, ef.n_end, axial_sum
        );

        // Shear equilibrium for true internal forces:
        // The change in shear across the element due to the UDL is q*L_elem.
        // v_start - v_end = q*L_elem (shear decreases by q*L along span)
        let shear_change = ef.v_start - ef.v_end;
        assert_close(
            shear_change.abs(), q * elem_len, 0.05,
            &format!("Element {} shear equilibrium (v_start - v_end = qL)", ef.element_id)
        );

        // Moment equilibrium about the end node:
        // m_end = m_start - v_start*L_elem + q*L_elem^2/2
        // Rearranged: m_start - m_end - v_start*L_elem + q*L_elem^2/2 = 0
        let moment_residual = ef.m_start - ef.m_end - ef.v_start * elem_len
            + q * elem_len.powi(2) / 2.0;
        assert!(
            moment_residual.abs() < 0.05 * q * elem_len.powi(2),
            "Element {} moment equilibrium: residual={:.4}, expected ~0",
            ef.element_id, moment_residual
        );
    }

    // Global check: total vertical reaction = total applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, q * l, 0.02, "element equilibrium global Ry");
}
