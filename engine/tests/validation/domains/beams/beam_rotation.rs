/// Validation: Beam End Rotations and Slope Calculations
///
/// References:
///   - Timoshenko & Goodier, "Theory of Elasticity"
///   - Ghali, Neville & Brown, "Structural Analysis", Ch. 9
///   - AISC Steel Construction Manual, Part 3 (Beam Design)
///
/// End rotations are critical for connection design and for
/// verifying compatibility at joints. These tests check
/// computed rotations against known analytical formulas.
///
/// Tests verify:
///   1. SS beam UDL: end rotation θ = qL³/(24EI)
///   2. SS beam point load: end rotation θ = PL²/(16EI) (at midspan)
///   3. Cantilever tip load: tip rotation θ = PL²/(2EI)
///   4. Cantilever UDL: tip rotation θ = qL³/(6EI)
///   5. Fixed end: rotation = 0
///   6. Propped cantilever: slope at roller
///   7. Rotation proportionality: θ ∝ L²
///   8. Rotation antisymmetry under antisymmetric load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: End Rotations
// ================================================================
//
// θ_end = qL³/(24EI)

#[test]
fn validation_rotation_ss_udl() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_expected = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);
    let rz1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    let rz_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    // End rotations should be equal magnitude, opposite sign
    assert_close(rz1.abs(), theta_expected, 0.02,
        "SS UDL: θ_start = qL³/(24EI)");
    assert_close(rz_end.abs(), theta_expected, 0.02,
        "SS UDL: θ_end = qL³/(24EI)");
    // Opposite signs (symmetric load → antisymmetric rotation)
    assert!(rz1 * rz_end < 0.0, "SS UDL: opposite rotation signs");
}

// ================================================================
// 2. SS Beam Point Load: End Rotations
// ================================================================
//
// θ_A = Pb(L²-b²)/(6LEI), at midspan b = L/2:
// θ_A = P*L²/(16EI)

#[test]
fn validation_rotation_ss_point() {
    let l = 10.0;
    let n = 20;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_expected = p * l.powi(2) / (16.0 * e_eff * IZ);
    let rz1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    let rz_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    assert_close(rz1.abs(), theta_expected, 0.02,
        "SS point: θ = PL²/(16EI)");
    // Symmetric load → equal magnitude rotations
    assert_close(rz1.abs(), rz_end.abs(), 0.01,
        "SS point: symmetric end rotations");
}

// ================================================================
// 3. Cantilever Tip Load: Tip Rotation
// ================================================================
//
// θ_tip = PL²/(2EI)

#[test]
fn validation_rotation_cantilever_tip() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_expected = p * l.powi(2) / (2.0 * e_eff * IZ);
    let rz_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    assert_close(rz_tip.abs(), theta_expected, 0.02,
        "Cantilever: θ_tip = PL²/(2EI)");

    // Fixed end should have zero rotation
    let rz_fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    assert!(rz_fixed.abs() < 1e-10, "Cantilever: fixed end θ = 0");
}

// ================================================================
// 4. Cantilever UDL: Tip Rotation
// ================================================================
//
// θ_tip = qL³/(6EI)

#[test]
fn validation_rotation_cantilever_udl() {
    let l = 6.0;
    let n = 12;
    let q = -8.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_expected = q.abs() * l.powi(3) / (6.0 * e_eff * IZ);
    let rz_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    assert_close(rz_tip.abs(), theta_expected, 0.02,
        "Cantilever UDL: θ_tip = qL³/(6EI)");
}

// ================================================================
// 5. Fixed End: Zero Rotation
// ================================================================

#[test]
fn validation_rotation_fixed_end() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let rz1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    let rz_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    assert!(rz1.abs() < 1e-10, "Fixed-fixed: θ at node 1 = 0");
    assert!(rz_end.abs() < 1e-10, "Fixed-fixed: θ at node n+1 = 0");

    // Midspan rotation should also be zero by symmetry
    let rz_mid = results.displacements.iter()
        .find(|d| d.node_id == n / 2 + 1).unwrap().ry;
    assert!(rz_mid.abs() < 1e-10, "Fixed-fixed UDL: θ at midspan = 0");
}

// ================================================================
// 6. Propped Cantilever: Slope at Roller
// ================================================================
//
// For a propped cantilever (fixed-roller) with UDL:
// θ_roller = qL³/(48EI)

#[test]
fn validation_rotation_propped_roller() {
    let l = 10.0;
    let n = 20;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let theta_roller = q.abs() * l.powi(3) / (48.0 * e_eff * IZ);
    let rz_roller = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().ry;

    assert_close(rz_roller.abs(), theta_roller, 0.02,
        "Propped: θ_roller = qL³/(48EI)");

    // Fixed end rotation = 0
    let rz_fixed = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    assert!(rz_fixed.abs() < 1e-10, "Propped: fixed end θ = 0");
}

// ================================================================
// 7. Rotation Proportionality: θ ∝ L²
// ================================================================

#[test]
fn validation_rotation_l_squared() {
    let p = 10.0;
    let n = 20;

    let get_rotation = |l: f64| -> f64 {
        let mid = n / 2 + 1;
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry.abs()
    };

    let theta_6 = get_rotation(6.0);
    let theta_12 = get_rotation(12.0);

    // θ ∝ L² → ratio should be (12/6)² = 4
    let ratio = theta_12 / theta_6;
    assert_close(ratio, 4.0, 0.02, "Rotation: θ ∝ L²");
}

// ================================================================
// 8. Rotation Antisymmetry Under Antisymmetric Load
// ================================================================
//
// Equal opposite moments at the two ends of a SS beam produce
// antisymmetric curvature: rotation at both ends has same sign.

#[test]
fn validation_rotation_antisymmetric() {
    let l = 10.0;
    let n = 20;
    let m = 50.0;

    // Apply opposite end moments: +M at left, -M at right
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fz: 0.0, my: m,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: -m,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let rz1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ry;
    let rz_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ry;

    // Antisymmetric loading → rotations at both ends have opposite signs
    assert!(rz1 * rz_end < 0.0,
        "Antisymmetric: ends rotate opposite: {:.6} and {:.6}",
        rz1, rz_end);

    // Equal magnitude by antisymmetry
    assert_close(rz1.abs(), rz_end.abs(), 0.01,
        "Antisymmetric: equal magnitude rotations");
}
