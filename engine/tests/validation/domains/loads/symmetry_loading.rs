/// Validation: Symmetry and Antisymmetry Properties of Structural Analysis
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed.
///
/// Tests verify fundamental symmetry/antisymmetry properties:
///   1. Symmetric beam + symmetric load: equal reactions
///   2. Symmetric beam + symmetric load: zero rotation at midspan
///   3. Symmetric beam + antisymmetric load: zero deflection at midspan
///   4. Symmetric beam + antisymmetric load: zero moment at midspan
///   5. Symmetric portal + symmetric gravity: no sway
///   6. Symmetric portal + antisymmetric lateral load: opposite base moments
///   7. Fixed-fixed beam + symmetric UDL: equal end moments = wL^2/12
///   8. Superposition: any load = symmetric part + antisymmetric part
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Symmetric beam with symmetric load: equal reactions
// ================================================================
//
// Simply-supported beam L=10m, 4 elements, UDL w=-10 kN/m.
// Nodes at 0, 2.5, 5, 7.5, 10. Pinned at node 1, rollerX at node 5.
// Symmetric structure + symmetric load => R_A = R_B = wL/2 = 50 kN.

#[test]
fn validation_symmetry_ss_beam_udl_equal_reactions() {
    let l = 10.0;
    let n = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let expected = q.abs() * l / 2.0; // 50 kN

    assert_close(r_a.rz, expected, 0.02, "R_A vertical reaction");
    assert_close(r_b.rz, expected, 0.02, "R_B vertical reaction");
    assert_close(r_a.rz, r_b.rz, 0.02, "R_A should equal R_B by symmetry");
}

// ================================================================
// 2. Symmetric beam with symmetric load: zero rotation at midspan
// ================================================================
//
// Same SS beam L=10m, UDL. At midspan node 3 (x=5), rz should be
// zero by symmetry (slope is zero at the point of maximum deflection).

#[test]
fn validation_symmetry_ss_beam_udl_zero_midspan_rotation() {
    let l = 10.0;
    let n = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n / 2 + 1; // node 3
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    assert!(
        mid_d.ry.abs() < 1e-8,
        "Midspan rotation should be zero by symmetry, got rz={:.6e}",
        mid_d.ry
    );
}

// ================================================================
// 3. Symmetric beam with antisymmetric load: zero deflection at midspan
// ================================================================
//
// SS beam L=10m, 4 elements. Nodes at 0, 2.5, 5, 7.5, 10.
// P=+10kN downward at node 2 (x=2.5) and P=-10kN upward at node 4 (x=7.5).
// Antisymmetric loading on symmetric structure => uy at midspan (node 3) = 0.

#[test]
fn validation_antisymmetry_zero_deflection_at_midspan() {
    let l = 10.0;
    let n = 4;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0, // downward at x=2.5
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: 10.0, my: 0.0, // upward at x=7.5
        }),
    ];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid_node = n / 2 + 1; // node 3
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    assert!(
        mid_d.uz.abs() < 1e-8,
        "Midspan deflection should be zero for antisymmetric load, got uy={:.6e}",
        mid_d.uz
    );
}

// ================================================================
// 4. Symmetric beam with antisymmetric load: zero moment at midspan
// ================================================================
//
// Same configuration as test 3. Antisymmetric load on symmetric structure
// implies moment at midspan = 0. Check m_end of element 2 (at node 3).

#[test]
fn validation_antisymmetry_zero_moment_at_midspan() {
    let l = 10.0;
    let n = 4;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: 10.0, my: 0.0,
        }),
    ];

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Element 2 connects node 2 to node 3 (midspan). m_end is the moment at node 3.
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();

    assert!(
        ef2.m_end.abs() < 1e-8,
        "Moment at midspan should be zero for antisymmetric load, got m_end={:.6e}",
        ef2.m_end
    );
}

// ================================================================
// 5. Symmetric portal under symmetric gravity: no sway
// ================================================================
//
// Portal frame h=4, w=6. Equal gravity G=-20kN at both top nodes (2 and 3).
// Symmetric => ux at both top nodes should be equal (zero by symmetry).

#[test]
fn validation_symmetry_portal_no_sway() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 0.0, -20.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should have the same ux (both ~0 by symmetry)
    assert!(
        (d2.ux - d3.ux).abs() < 1e-8,
        "Top node lateral displacements should be equal by symmetry: ux2={:.6e}, ux3={:.6e}",
        d2.ux, d3.ux
    );

    // Additionally, both should be essentially zero
    assert!(
        d2.ux.abs() < 1e-8,
        "Top node 2 lateral displacement should be zero by symmetry, got ux={:.6e}",
        d2.ux
    );
    assert!(
        d3.ux.abs() < 1e-8,
        "Top node 3 lateral displacement should be zero by symmetry, got ux={:.6e}",
        d3.ux
    );
}

// ================================================================
// 6. Symmetric portal under antisymmetric (lateral) load
// ================================================================
//
// Portal frame h=4, w=6. Lateral H=10kN at node 2.
// Column base moments should be equal in magnitude by symmetry of the frame.
// Vertical reactions should be equal and opposite (couple resisting overturning).

#[test]
fn validation_antisymmetry_portal_lateral_load() {
    let input = make_portal_frame(4.0, 6.0, E, A, IZ, 10.0, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // For a lateral load on a symmetric portal, column base moments are equal
    // in magnitude (antisymmetric deformation pattern produces equal restraining moments).
    assert_close(
        r1.my.abs(), r4.my.abs(), 0.02,
        "Base moments should be equal in magnitude"
    );

    // Vertical reactions should be equal and opposite (forming a couple to resist overturning)
    assert!(
        (r1.rz + r4.rz).abs() < (r1.rz.abs() + r4.rz.abs()) * 0.02 + 1e-8,
        "Vertical reactions should be equal and opposite: ry1={:.6}, ry4={:.6}",
        r1.rz, r4.rz
    );
}

// ================================================================
// 7. Fixed-fixed beam: symmetric UDL gives equal end moments
// ================================================================
//
// Fixed-fixed beam L=8m, 4 elements, UDL w=-10kN/m.
// By symmetry: M_A = M_B. Both should equal wL^2/12 = 53.33 kN-m.

#[test]
fn validation_symmetry_fixed_fixed_equal_end_moments() {
    let l = 8.0;
    let n = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let expected_moment = q.abs() * l * l / 12.0; // wL^2/12 = 53.33 kN-m

    // End moments should be equal in magnitude
    assert_close(
        r_a.my.abs(), r_b.my.abs(), 0.02,
        "Fixed-fixed end moments should be equal in magnitude"
    );

    // Each should equal wL^2/12
    assert_close(
        r_a.my.abs(), expected_moment, 0.02,
        "Left end moment should equal wL^2/12"
    );
    assert_close(
        r_b.my.abs(), expected_moment, 0.02,
        "Right end moment should equal wL^2/12"
    );
}

// ================================================================
// 8. Decomposition: any load = symmetric + antisymmetric
// ================================================================
//
// SS beam L=8m, 4 elements. Nodes at 0, 2, 4, 6, 8.
// Case 1: P=20kN at node 2 (x=2) only.
// Case 2 (symmetric): P=10kN at node 2 (x=2) + P=10kN at node 4 (x=6).
// Case 3 (antisymmetric): P=10kN at node 2 (x=2) + P=-10kN at node 4 (x=6).
// Verify: deflection(case 1) = deflection(case 2) + deflection(case 3) at every node.

#[test]
fn validation_superposition_symmetric_plus_antisymmetric() {
    let l = 8.0;
    let n = 4;

    // Case 1: P=20kN downward at node 2 only
    let loads_1 = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -20.0, my: 0.0,
        }),
    ];
    let input_1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_1);
    let results_1 = linear::solve_2d(&input_1).unwrap();

    // Case 2 (symmetric part): P=10kN at node 2 + P=10kN at node 4
    let loads_2 = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -10.0, my: 0.0,
        }),
    ];
    let input_2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_2);
    let results_2 = linear::solve_2d(&input_2).unwrap();

    // Case 3 (antisymmetric part): P=10kN at node 2 + P=-10kN at node 4
    let loads_3 = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -10.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: 10.0, my: 0.0,
        }),
    ];
    let input_3 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_3);
    let results_3 = linear::solve_2d(&input_3).unwrap();

    // Verify at every node: uy(case1) = uy(case2) + uy(case3)
    for node_id in 1..=(n + 1) {
        let d1 = results_1.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d2 = results_2.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d3 = results_3.displacements.iter().find(|d| d.node_id == node_id).unwrap();

        let combined_uy = d2.uz + d3.uz;
        let combined_ux = d2.ux + d3.ux;
        let combined_rz = d2.ry + d3.ry;

        // Check uy
        if d1.uz.abs() > 1e-10 {
            assert_close(
                combined_uy, d1.uz, 0.02,
                &format!("Node {} uz: case1 vs sym+antisym", node_id)
            );
        } else {
            assert!(
                (combined_uy - d1.uz).abs() < 1e-8,
                "Node {} uz: case1={:.6e}, sym+antisym={:.6e}",
                node_id, d1.uz, combined_uy
            );
        }

        // Check ux
        if d1.ux.abs() > 1e-10 {
            assert_close(
                combined_ux, d1.ux, 0.02,
                &format!("Node {} ux: case1 vs sym+antisym", node_id)
            );
        } else {
            assert!(
                (combined_ux - d1.ux).abs() < 1e-8,
                "Node {} ux: case1={:.6e}, sym+antisym={:.6e}",
                node_id, d1.ux, combined_ux
            );
        }

        // Check rz
        if d1.ry.abs() > 1e-10 {
            assert_close(
                combined_rz, d1.ry, 0.02,
                &format!("Node {} ry: case1 vs sym+antisym", node_id)
            );
        } else {
            assert!(
                (combined_rz - d1.ry).abs() < 1e-8,
                "Node {} ry: case1={:.6e}, sym+antisym={:.6e}",
                node_id, d1.ry, combined_rz
            );
        }
    }
}
