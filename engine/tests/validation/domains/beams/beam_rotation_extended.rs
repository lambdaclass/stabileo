/// Validation: Extended Beam Rotation Analysis
///
/// References:
///   - Ghali, Neville & Brown, "Structural Analysis", 7th ed., Ch. 9-10
///   - Timoshenko & Gere, "Mechanics of Materials", Ch. 9
///   - Hibbeler, "Structural Analysis", 10th ed., Ch. 8
///   - Beer & Johnston, "Mechanics of Materials", 7th ed., Table B
///
/// These tests extend the basic beam rotation tests to cover additional
/// loading patterns, superposition, and multi-span configurations that
/// exercise different aspects of the solver's rotation computation.
///
/// Tests verify:
///   1. SS beam + triangular load: end rotation θ_A = 7qL³/(360EI)
///   2. Cantilever + intermediate point load: rotation at load point
///   3. SS beam + single end moment: rotation θ_A = ML/(3EI)
///   4. Two-span continuous beam: rotation at interior support (asymmetric)
///   5. Propped cantilever + midspan point load: rotation at roller
///   6. Superposition principle: rotation from combined loads
///   7. SS beam + two symmetric point loads: end rotation
///   8. Cantilever + partial UDL: tip rotation
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + Triangular Load: End Rotations
// ================================================================
//
// Triangular load from 0 at left to q at right.
// θ_A (left support) = 7qL³/(360EI)
// θ_B (right support) = 8qL³/(360EI)
// Reference: Beer & Johnston Table B, Case 12

#[test]
fn validation_rotation_ext_ss_triangular_load() {
    let l = 10.0;
    let n = 40; // fine mesh for triangular load accuracy
    let q_max: f64 = -12.0; // max intensity at right end
    let e_eff: f64 = E * 1000.0;
    let elem_len: f64 = l / n as f64;

    // Triangular load: linearly increasing from 0 at left to q_max at right
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i: f64 = (i as f64 - 1.0) * elem_len;
            let x_j: f64 = i as f64 * elem_len;
            let q_i = q_max * x_i / l;
            let q_j = q_max * x_j / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i, q_j, a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // θ_A = 7qL³/(360EI) — rotation at left (smaller rotation side)
    let theta_a: f64 = 7.0 * q_max.abs() * l.powi(3) / (360.0 * e_eff * IZ);
    // θ_B = 8qL³/(360EI) — rotation at right (larger rotation side)
    let theta_b: f64 = 8.0 * q_max.abs() * l.powi(3) / (360.0 * e_eff * IZ);

    let rz_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_a.abs(), theta_a, 0.03,
        "SS triangular: θ_A = 7qL³/(360EI)");
    assert_close(rz_b.abs(), theta_b, 0.03,
        "SS triangular: θ_B = 8qL³/(360EI)");

    // Rotation at right (loaded end) should be larger
    assert!(rz_b.abs() > rz_a.abs(),
        "SS triangular: θ_B > θ_A");
}

// ================================================================
// 2. Cantilever + Intermediate Point Load: Rotation at Load Point
// ================================================================
//
// Cantilever of length L, point load P at distance a from fixed end.
// θ(a) = Pa²/(2EI)
// θ_tip = Pa²/(2EI) (rotation constant beyond load point)
// Reference: Timoshenko & Gere, Table D-1

#[test]
fn validation_rotation_ext_cantilever_intermediate_load() {
    let l = 10.0;
    let n = 20;
    let p = 10.0;
    let a_frac = 0.5; // load at midpoint
    let a: f64 = a_frac * l;
    let e_eff: f64 = E * 1000.0;

    let load_node = (a / l * n as f64).round() as usize + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Rotation at load point: θ(a) = Pa²/(2EI)
    let theta_at_a: f64 = p * a.powi(2) / (2.0 * e_eff * IZ);
    let rz_at_a = results.displacements.iter()
        .find(|d| d.node_id == load_node).unwrap().rz;

    assert_close(rz_at_a.abs(), theta_at_a, 0.02,
        "Cantilever intermediate: θ(a) = Pa²/(2EI)");

    // Tip rotation should equal the rotation at load point
    // (beyond the load, there is no moment, so slope stays constant)
    let rz_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_tip.abs(), theta_at_a, 0.02,
        "Cantilever intermediate: θ_tip = θ(a) (constant beyond load)");
}

// ================================================================
// 3. SS Beam + Single End Moment: Rotations
// ================================================================
//
// SS beam with moment M applied at left end only.
// θ_A = ML/(3EI)  (at moment end)
// θ_B = ML/(6EI)  (at far end)
// Reference: Hibbeler, Table B-2, Case 7

#[test]
fn validation_rotation_ext_ss_end_moment() {
    let l = 8.0;
    let n = 20;
    let m = 30.0;
    let e_eff: f64 = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // θ_A = ML/(3EI) at the moment end
    let theta_a: f64 = m * l / (3.0 * e_eff * IZ);
    // θ_B = ML/(6EI) at the far end
    let theta_b: f64 = m * l / (6.0 * e_eff * IZ);

    let rz_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_a.abs(), theta_a, 0.02,
        "SS end moment: θ_A = ML/(3EI)");
    assert_close(rz_b.abs(), theta_b, 0.02,
        "SS end moment: θ_B = ML/(6EI)");

    // θ_A should be exactly twice θ_B
    let ratio: f64 = rz_a.abs() / rz_b.abs();
    assert_close(ratio, 2.0, 0.02,
        "SS end moment: θ_A = 2 × θ_B");
}

// ================================================================
// 4. Two-Span Continuous Beam: Rotation at Interior Support
//    Under Asymmetric Loading (load on one span only)
// ================================================================
//
// For a two-span continuous beam (equal spans L) with UDL on span 1 only:
// By three-moment equation: M_B = -qL²/16
// θ_B = qL³/(48EI) at interior support
// Reference: Ghali & Neville, "Structural Analysis", Ch. 10

#[test]
fn validation_rotation_ext_continuous_asymmetric() {
    let span = 8.0;
    let n = 16; // elements per span
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    // Load only on span 1 (elements 1..n)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let interior_node = n + 1;
    let d_int = results.displacements.iter()
        .find(|d| d.node_id == interior_node).unwrap();

    // Interior support deflection should be zero
    assert!(d_int.uy.abs() < 1e-10,
        "Continuous asymm: δ at interior = 0");

    // Rotation at interior support: θ_B = qL³/(48EI) for load on one span
    let theta_b: f64 = q.abs() * span.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_int.rz.abs(), theta_b, 0.05,
        "Continuous asymm: θ_B = qL³/(48EI)");
}

// ================================================================
// 5. Propped Cantilever + Midspan Point Load: Rotation at Roller
// ================================================================
//
// Fixed-roller beam with point load P at midspan.
// Reaction at roller: R_B = 5P/16
// θ_roller = 7PL²/(768EI)
// Reference: Timoshenko & Gere, Table D-3

#[test]
fn validation_rotation_ext_propped_midspan_load() {
    let l = 10.0;
    let n = 20;
    let p = 20.0;
    let e_eff: f64 = E * 1000.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction: R_B = 5P/16
    let r_b_expected: f64 = 5.0 * p / 16.0;
    let r_b = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(r_b.abs(), r_b_expected, 0.02,
        "Propped midspan: R_B = 5P/16");

    // Rotation at roller: θ_B = 7PL²/(768EI)
    let theta_b: f64 = 7.0 * p * l.powi(2) / (768.0 * e_eff * IZ);
    let rz_b = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_b.abs(), theta_b, 0.05,
        "Propped midspan: θ_B = 7PL²/(768EI)");

    // Fixed end should have zero rotation
    let rz_fixed = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().rz;
    assert!(rz_fixed.abs() < 1e-10,
        "Propped midspan: fixed end θ = 0");
}

// ================================================================
// 6. Superposition Principle: Rotations from Combined Loads
// ================================================================
//
// The rotation from two loads applied simultaneously should equal
// the sum of rotations from each load applied individually.
// This validates linearity of the solver.
// Reference: Superposition principle (any linear elasticity text)

#[test]
fn validation_rotation_ext_superposition() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -10.0;
    let p = 15.0;

    // Load case 1: UDL only
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_udl);
    let res1 = linear::solve_2d(&input1).unwrap();
    let rz1_a = res1.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz1_b = res1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    // Load case 2: midspan point load only
    let mid = n / 2 + 1;
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_pt);
    let res2 = linear::solve_2d(&input2).unwrap();
    let rz2_a = res2.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz2_b = res2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    // Load case 3: both loads combined
    let mut loads_both: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_both.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    }));
    let input3 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_both);
    let res3 = linear::solve_2d(&input3).unwrap();
    let rz3_a = res3.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz3_b = res3.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    // Combined should equal sum of individual
    assert_close(rz3_a, rz1_a + rz2_a, 0.001,
        "Superposition: θ_A combined = θ_A(UDL) + θ_A(point)");
    assert_close(rz3_b, rz1_b + rz2_b, 0.001,
        "Superposition: θ_B combined = θ_B(UDL) + θ_B(point)");
}

// ================================================================
// 7. SS Beam + Two Symmetric Point Loads: End Rotation
// ================================================================
//
// SS beam with loads P at L/3 and 2L/3.
// By superposition: θ_A = Pa(L²-a²)/(6LEI) for each load,
// where a = L/3 and a = 2L/3.
// θ_A = P/(6LEI) × [a₁(L²-a₁²) + b₂(L²-b₂²)]
// For symmetric loads at L/3 and 2L/3: each gives same θ_A
// θ_A (per load at a=L/3, b=2L/3) = P×(2L/3)×(L²-(2L/3)²)/(6LEI)
//     = P×(2L/3)×(5L²/9)/(6LEI) = 10PL²/(162EI) = 5PL²/(81EI)
// Total θ_A = 2 × 5PL²/(81EI) = 10PL²/(81EI)
// Reference: Hibbeler, "Structural Analysis", superposition tables

#[test]
fn validation_rotation_ext_ss_two_symmetric_loads() {
    let l = 12.0;
    let n = 24;
    let p = 10.0;
    let e_eff: f64 = E * 1000.0;

    let n1 = n / 3 + 1;      // node at L/3
    let n2 = 2 * n / 3 + 1;  // node at 2L/3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n1, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: n2, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // For load P at a from left, b = L - a from right:
    // θ_A = Pb(L²-b²)/(6LEI)
    // Load 1 at a₁ = L/3: b₁ = 2L/3
    //   θ_A1 = P×(2L/3)×(L²-(2L/3)²)/(6LEI) = P×(2L/3)×(5L²/9)/(6LEI)
    // Load 2 at a₂ = 2L/3: b₂ = L/3
    //   θ_A2 = P×(L/3)×(L²-(L/3)²)/(6LEI) = P×(L/3)×(8L²/9)/(6LEI)
    let _a1: f64 = l / 3.0;
    let b1: f64 = 2.0 * l / 3.0;
    let _a2: f64 = 2.0 * l / 3.0;
    let b2: f64 = l / 3.0;

    let theta_a1: f64 = p * b1 * (l * l - b1 * b1) / (6.0 * l * e_eff * IZ);
    let theta_a2: f64 = p * b2 * (l * l - b2 * b2) / (6.0 * l * e_eff * IZ);
    let theta_a_total: f64 = theta_a1 + theta_a2;

    let rz_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_a.abs(), theta_a_total, 0.02,
        "SS two symmetric loads: θ_A by superposition");

    // By symmetry, |θ_A| = |θ_B|
    assert_close(rz_a.abs(), rz_b.abs(), 0.01,
        "SS two symmetric loads: |θ_A| = |θ_B|");

    // Midspan slope = 0 by symmetry
    let mid = n / 2 + 1;
    let rz_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().rz;
    assert!(rz_mid.abs() < 1e-10,
        "SS two symmetric loads: θ_mid = 0 by symmetry");

    // Also verify θ_A1 + θ_A2 = 10PL²/(81EI) as a cross-check
    let theta_a_formula: f64 = 10.0 * p * l.powi(2) / (81.0 * e_eff * IZ);
    assert_close(theta_a_total, theta_a_formula, 0.001,
        "SS two symmetric loads: closed form 10PL²/(81EI)");
}

// ================================================================
// 8. Cantilever + Partial UDL: Tip Rotation
// ================================================================
//
// Cantilever of length L with UDL of intensity q over the first
// portion of length a (from fixed end to x = a).
// For x in [0, a]: M(x) = -qa²/2 + qax - qx²/2
// For x > a: M(x) = 0 (no load, no shear beyond a)
// Since curvature is zero beyond a, the slope is constant from a to L:
// θ_tip = θ(a) = qa³/(6EI)
// The tip deflection uses: δ_tip = qa³(4L-a)/(24EI)
// Reference: Timoshenko, "Strength of Materials", Vol. 1, Ch. 4

#[test]
fn validation_rotation_ext_cantilever_partial_udl() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -8.0;
    let e_eff: f64 = E * 1000.0;
    let a: f64 = l / 2.0; // UDL covers first half

    // Load only on first half of the beam (elements 1..n/2)
    let n_loaded = n / 2;
    let loads: Vec<SolverLoad> = (1..=n_loaded)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // θ_tip = θ(a) = qa³/(6EI)
    // Since M(x) = 0 for x > a, slope is constant beyond load
    let theta_tip: f64 = q.abs() * a.powi(3) / (6.0 * e_eff * IZ);
    let rz_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().rz;

    assert_close(rz_tip.abs(), theta_tip, 0.02,
        "Cantilever partial UDL: θ_tip = qa³/(6EI)");

    // Rotation at the end of the loaded portion equals tip rotation
    let load_end_node = n_loaded + 1;
    let rz_at_a = results.displacements.iter()
        .find(|d| d.node_id == load_end_node).unwrap().rz;

    assert_close(rz_at_a.abs(), rz_tip.abs(), 0.001,
        "Cantilever partial UDL: θ(a) = θ_tip (constant slope beyond load)");

    // Tip deflection: δ_tip = qa³(4L-a)/(24EI)
    let delta_tip: f64 = q.abs() * a.powi(3) * (4.0 * l - a) / (24.0 * e_eff * IZ);
    let uy_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy;

    assert_close(uy_tip.abs(), delta_tip, 0.02,
        "Cantilever partial UDL: δ_tip = qa³(4L-a)/(24EI)");

    // Fixed end rotation must be zero
    let rz_fixed = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap().rz;
    assert!(rz_fixed.abs() < 1e-10,
        "Cantilever partial UDL: fixed end θ = 0");
}
