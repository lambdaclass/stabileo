/// Validation: Extended Slope/Rotation Verification at Nodes
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Roark's Formulas for Stress and Strain, 8th Ed.
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed.
///
/// These tests verify rotation (slope) results from the 2D solver against
/// classical analytical formulas for standard beam configurations.
///
/// Tests verify:
///   1. SS beam UDL: end rotation theta = qL^3/(24EI) at both ends (symmetry)
///   2. Cantilever tip load: tip rotation theta = PL^2/(2EI)
///   3. Cantilever UDL: tip rotation theta = qL^3/(6EI)
///   4. SS beam midspan point load: end rotation theta = PL^2/(16EI)
///   5. Fixed-fixed beam: zero rotation at both ends (fixed constraint)
///   6. Propped cantilever UDL: fixed end has zero rotation, roller end nonzero
///   7. SS beam with end moment: theta_A = ML/(3EI), theta_B = ML/(6EI)
///   8. Cantilever with tip moment: tip rotation = ML/(EI), constant curvature
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 210_000.0;
const A: f64 = 0.015;
const IZ: f64 = 8e-5;

// ================================================================
// 1. SS Beam UDL: End Rotation theta = qL^3/(24EI) at Both Ends
// ================================================================
//
// Simply-supported beam under uniform distributed load.
// By symmetry, |theta_A| = |theta_B| = qL^3/(24EI).
// The two end rotations have opposite signs (beam sags symmetrically).

#[test]
fn validation_ext_ss_udl_end_rotation_symmetry() {
    let l = 12.0;
    let n = 12;
    let q = 15.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let theta_exact: f64 = q * l.powi(3) / (24.0 * e_eff * IZ);

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Both ends should have the same magnitude of rotation
    assert_close(d_a.ry.abs(), theta_exact, 0.02, "SS UDL ext theta_A magnitude");
    assert_close(d_b.ry.abs(), theta_exact, 0.02, "SS UDL ext theta_B magnitude");

    // Symmetry: magnitudes should be equal
    let diff_ratio: f64 = (d_a.ry.abs() - d_b.ry.abs()).abs() / theta_exact;
    assert!(
        diff_ratio < 0.01,
        "SS UDL end rotations should be equal by symmetry: theta_A={:.6e}, theta_B={:.6e}",
        d_a.ry, d_b.ry
    );

    // Opposite signs
    assert!(
        d_a.ry * d_b.ry < 0.0,
        "SS UDL end slopes should have opposite signs: theta_A={:.6e}, theta_B={:.6e}",
        d_a.ry, d_b.ry
    );
}

// ================================================================
// 2. Cantilever Tip Load: Tip Rotation theta = PL^2/(2EI)
// ================================================================
//
// Cantilever beam (fixed at left, free at right) with concentrated
// load P at free end. The tip rotation is PL^2/(2EI).

#[test]
fn validation_ext_cantilever_tip_load_rotation() {
    let l = 6.0;
    let n = 12;
    let p = 80.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact: f64 = p * l.powi(2) / (2.0 * e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever tip load ext theta_tip");

    // Fixed end must have zero rotation
    let fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        fixed.ry.abs() < 1e-10,
        "Fixed end rotation should be zero, got {:.6e}", fixed.ry
    );

    // Rotation should increase monotonically from fixed to free end
    let mut prev_rz: f64 = 0.0;
    for i in 1..=n + 1 {
        let d = results.displacements.iter().find(|d| d.node_id == i).unwrap();
        assert!(
            d.ry.abs() >= prev_rz - 1e-12,
            "Rotation should increase from fixed to free end at node {}", i
        );
        prev_rz = d.ry.abs();
    }
}

// ================================================================
// 3. Cantilever UDL: Tip Rotation theta = qL^3/(6EI)
// ================================================================
//
// Cantilever with uniform distributed load q over full span.
// Tip rotation: theta_tip = qL^3/(6EI).

#[test]
fn validation_ext_cantilever_udl_tip_rotation() {
    let l = 7.0;
    let n = 14;
    let q = 8.0;
    let e_eff: f64 = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact: f64 = q * l.powi(3) / (6.0 * e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever UDL ext theta_tip");

    // Fixed end must have zero rotation
    let fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        fixed.ry.abs() < 1e-10,
        "Fixed end rotation should be zero, got {:.6e}", fixed.ry
    );
}

// ================================================================
// 4. SS Beam Midspan Point Load: End Rotation theta = PL^2/(16EI)
// ================================================================
//
// Simply-supported beam with concentrated load P at midspan.
// End slopes: theta_A = theta_B = PL^2/(16EI) in magnitude.

#[test]
fn validation_ext_ss_midspan_point_end_rotation() {
    let l = 8.0;
    let n = 16;
    let p = 120.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let theta_exact: f64 = p * l.powi(2) / (16.0 * e_eff * IZ);

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_a.ry.abs(), theta_exact, 0.02, "SS midspan P ext theta_A");
    assert_close(d_b.ry.abs(), theta_exact, 0.02, "SS midspan P ext theta_B");

    // Symmetry: magnitudes should be equal
    let diff_ratio: f64 = (d_a.ry.abs() - d_b.ry.abs()).abs() / theta_exact;
    assert!(
        diff_ratio < 0.01,
        "SS midspan P end rotations should be equal: theta_A={:.6e}, theta_B={:.6e}",
        d_a.ry, d_b.ry
    );

    // Midspan rotation should be zero by symmetry
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(
        d_mid.ry.abs() < 1e-10,
        "SS midspan P midspan rotation should be zero, got {:.6e}", d_mid.ry
    );
}

// ================================================================
// 5. Fixed-Fixed Beam: Zero Rotation at Both Ends
// ================================================================
//
// Both ends fully fixed under UDL. The boundary conditions enforce
// rz = 0 at both support nodes regardless of loading.

#[test]
fn validation_ext_fixed_fixed_zero_rotation() {
    let l = 9.0;
    let n = 12;
    let q = 20.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert!(
        d_a.ry.abs() < 1e-10,
        "Fixed-fixed end A rotation should be zero, got {:.6e}", d_a.ry
    );
    assert!(
        d_b.ry.abs() < 1e-10,
        "Fixed-fixed end B rotation should be zero, got {:.6e}", d_b.ry
    );

    // Interior nodes should have nonzero rotation (beam deflects)
    let mid = n / 2;
    let d_interior = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(
        d_interior.ry.abs() > 1e-12,
        "Interior node of fixed-fixed beam should have nonzero rotation"
    );
}

// ================================================================
// 6. Propped Cantilever UDL: Fixed End Zero, Roller End Nonzero
// ================================================================
//
// Fixed at A, roller at B, UDL q over full span.
// The fixed support enforces zero rotation at A.
// The roller support allows rotation at B.
// Analytical: theta_B = qL^3/(48EI).

#[test]
fn validation_ext_propped_cantilever_rotation_check() {
    let l = 10.0;
    let n = 20;
    let q = 12.0;
    let e_eff: f64 = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end A: zero rotation
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        d_a.ry.abs() < 1e-10,
        "Propped cantilever fixed end rotation should be zero, got {:.6e}", d_a.ry
    );

    // Roller end B: nonzero rotation
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(
        d_b.ry.abs() > 1e-8,
        "Propped cantilever roller end should have nonzero rotation, got {:.6e}", d_b.ry
    );

    // Verify analytical value: theta_B = qL^3/(48EI)
    let theta_exact: f64 = q * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_b.ry.abs(), theta_exact, 0.05, "Propped cantilever ext theta_B");
}

// ================================================================
// 7. SS Beam with End Moment: theta_A = ML/(3EI), theta_B = ML/(6EI)
// ================================================================
//
// Simply-supported beam with applied moment M at end A.
// Rotation at moment end: theta_A = ML/(3EI)
// Rotation at far end:    theta_B = ML/(6EI)
// Reference: Roark's Formulas, Table 8.1

#[test]
fn validation_ext_ss_end_moment_rotations() {
    let l = 10.0;
    let n = 20;
    let m = 100.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let theta_a_exact: f64 = m * l / (3.0 * e_eff * IZ);
    let theta_b_exact: f64 = m * l / (6.0 * e_eff * IZ);

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_a.ry.abs(), theta_a_exact, 0.02, "SS end moment ext theta_A");
    assert_close(d_b.ry.abs(), theta_b_exact, 0.02, "SS end moment ext theta_B");

    // theta_A should be exactly twice theta_B
    let ratio: f64 = d_a.ry.abs() / d_b.ry.abs();
    assert_close(ratio, 2.0, 0.02, "SS end moment theta_A/theta_B ratio");
}

// ================================================================
// 8. Cantilever with Tip Moment: theta_tip = ML/(EI), Constant Curvature
// ================================================================
//
// Cantilever with applied moment M at free end.
// Produces uniform curvature along the entire length.
// Tip rotation: theta_tip = ML/(EI).
// Rotation varies linearly from 0 (fixed end) to ML/(EI) (tip).

#[test]
fn validation_ext_cantilever_tip_moment_constant_curvature() {
    let l = 6.0;
    let n = 12;
    let m = 75.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact: f64 = m * l / (e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever tip moment ext theta_tip");

    // Fixed end must have zero rotation
    let fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        fixed.ry.abs() < 1e-10,
        "Fixed end rotation should be zero, got {:.6e}", fixed.ry
    );

    // Constant curvature means rotation varies linearly along beam.
    // Check that rotation at each node is approximately proportional to distance.
    let elem_len: f64 = l / n as f64;
    for i in 2..=n + 1 {
        let d = results.displacements.iter().find(|d| d.node_id == i).unwrap();
        let x: f64 = (i - 1) as f64 * elem_len;
        let theta_expected: f64 = m * x / (e_eff * IZ);
        assert_close(
            d.ry.abs(), theta_expected, 0.02,
            &format!("Cantilever tip moment rotation at x={:.1}", x)
        );
    }
}
