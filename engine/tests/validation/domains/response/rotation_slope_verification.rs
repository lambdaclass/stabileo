/// Validation: Rotation (Slope) Values at Nodes Against Analytical Formulas
///
/// References:
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Roark's Formulas for Stress and Strain, 8th Ed.
///
/// Tests verify exact rotation (rz) formulas for standard beam cases:
///   1. SS beam UDL: end slope theta = qL^3/(24EI)
///   2. SS beam midspan point load: end slope theta = PL^2/(16EI)
///   3. Cantilever tip load: tip rotation theta = PL^2/(2EI)
///   4. Cantilever UDL: tip rotation theta = qL^3/(6EI)
///   5. Cantilever tip moment: tip rotation theta = ML/(EI)
///   6. Fixed-fixed beam UDL: zero end rotations
///   7. Propped cantilever UDL: roller end rotation theta_B = qL^3/(48EI)
///   8. SS beam symmetric UDL: midspan rotation = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: End Slope theta = qL^3/(24EI)
// ================================================================
//
// Simply-supported beam under uniform distributed load.
// By symmetry, |theta_A| = |theta_B| = qL^3/(24EI),
// with opposite signs (A rotates clockwise, B counter-clockwise
// or vice versa depending on convention).

#[test]
fn validation_ss_beam_udl_end_slope() {
    let l = 10.0;
    let n = 8;
    let q = 12.0;
    let e_eff = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let theta_exact = q * l.powi(3) / (24.0 * e_eff * IZ);

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Both ends should have the same magnitude of rotation
    assert_close(d_a.ry.abs(), theta_exact, 0.02, "SS UDL theta_A magnitude");
    assert_close(d_b.ry.abs(), theta_exact, 0.02, "SS UDL theta_B magnitude");

    // Opposite signs (symmetric loading on symmetric beam)
    assert!(
        d_a.ry * d_b.ry < 0.0,
        "SS UDL end slopes should have opposite signs: theta_A={:.6e}, theta_B={:.6e}",
        d_a.ry, d_b.ry
    );
}

// ================================================================
// 2. SS Beam Point Load at Midspan: End Slope theta = PL^2/(16EI)
// ================================================================
//
// Simply-supported beam with concentrated load P at midspan.
// End slopes: theta_A = theta_B = PL^2/(16EI) in magnitude.

#[test]
fn validation_ss_beam_midspan_point_end_slope() {
    let l = 10.0;
    let n = 8;
    let p = 100.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let theta_exact = p * l.powi(2) / (16.0 * e_eff * IZ);

    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_a.ry.abs(), theta_exact, 0.02, "SS midspan P theta_A");
    assert_close(d_b.ry.abs(), theta_exact, 0.02, "SS midspan P theta_B");
}

// ================================================================
// 3. Cantilever Tip Load: Tip Rotation theta = PL^2/(2EI)
// ================================================================
//
// Cantilever beam (fixed at left, free at right) with point load P
// at the free end. Tip rotation: theta_tip = PL^2/(2EI).

#[test]
fn validation_cantilever_tip_load_rotation() {
    let l = 8.0;
    let n = 8;
    let p = 60.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact = p * l.powi(2) / (2.0 * e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever tip load theta_tip");

    // Fixed end should have zero rotation
    let fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        fixed.ry.abs() < 1e-10,
        "Fixed end rotation should be zero, got {:.6e}", fixed.ry
    );
}

// ================================================================
// 4. Cantilever UDL: Tip Rotation theta = qL^3/(6EI)
// ================================================================
//
// Cantilever with uniform distributed load q over full span.
// Tip rotation: theta_tip = qL^3/(6EI).

#[test]
fn validation_cantilever_udl_tip_rotation() {
    let l = 8.0;
    let n = 8;
    let q = 10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact = q * l.powi(3) / (6.0 * e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever UDL theta_tip");
}

// ================================================================
// 5. Cantilever Tip Moment: Tip Rotation theta = ML/(EI)
// ================================================================
//
// Cantilever with applied moment M at free end.
// Produces uniform curvature. Tip rotation: theta_tip = ML/(EI).

#[test]
fn validation_cantilever_tip_moment_rotation() {
    let l = 5.0;
    let n = 4;
    let m = 50.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact = m * l / (e_eff * IZ);

    assert_close(tip.ry.abs(), theta_exact, 0.02, "Cantilever tip moment theta_tip");
}

// ================================================================
// 6. Fixed-Fixed Beam UDL: Zero End Rotations
// ================================================================
//
// Both ends fully fixed. The boundary conditions enforce rz = 0
// at both support nodes regardless of loading.

#[test]
fn validation_fixed_fixed_udl_zero_end_rotations() {
    let l = 10.0;
    let n = 8;
    let q = 12.0;

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
}

// ================================================================
// 7. Propped Cantilever UDL: Roller End Rotation theta_B = qL^3/(48EI)
// ================================================================
//
// Fixed at A, roller at B, UDL q over full span.
// The roller support allows rotation. theta_B = qL^3/(48EI).

#[test]
fn validation_propped_cantilever_roller_end_rotation() {
    let l = 10.0;
    let n = 16;
    let q = 10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: -q, q_j: -q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let theta_exact = q * l.powi(3) / (48.0 * e_eff * IZ);

    assert_close(d_b.ry.abs(), theta_exact, 0.05, "Propped cantilever theta_B");

    // Fixed end should have zero rotation
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(
        d_a.ry.abs() < 1e-10,
        "Fixed end A rotation should be zero, got {:.6e}", d_a.ry
    );
}

// ================================================================
// 8. SS Beam Symmetric UDL: Midspan Rotation = 0
// ================================================================
//
// Simply-supported beam with symmetric UDL. By symmetry, the slope
// (rotation) at the midspan point is exactly zero -- the elastic
// curve has a horizontal tangent at the point of maximum deflection.

#[test]
fn validation_ss_beam_symmetric_udl_midspan_rotation_zero() {
    let l = 10.0;
    let n = 8;
    let q = 12.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    assert!(
        d_mid.ry.abs() < 1e-10,
        "SS UDL midspan rotation should be zero by symmetry, got {:.6e}", d_mid.ry
    );

    // Additionally verify the midspan has the maximum deflection
    // (confirming we are at the correct inflection point of slope)
    let max_defl = results.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    let mid_defl = d_mid.uz.abs();

    assert!(
        (max_defl - mid_defl).abs() / max_defl < 0.01,
        "Midspan should have maximum deflection: mid={:.6e}, max={:.6e}",
        mid_defl, max_defl
    );
}
