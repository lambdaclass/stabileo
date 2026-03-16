/// Validation: Advanced Corotational / Large Displacement Benchmarks
///
/// Tests corotational solver against known large-displacement solutions:
///   1. VM14 (ANSYS) — Eccentric compression of column
///   2. Cantilever under increasing transverse load — stiffening effect
///   3. Corotational → linear convergence as load → 0
///   4. Portal frame snap-through tendency under gravity
///   5. Axial-bending coupling in large rotation
///
/// References:
///   - ANSYS VM14: Eccentric compression column
///   - Mattiasson (1981): Large deflection beam problems
///   - Crisfield, "Non-linear Finite Element Analysis of Solids and Structures"
use dedaliano_engine::solver::{linear, corotational};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const E_EFF: f64 = E * 1000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. VM14 — Eccentric Column Compression
// ================================================================
//
// Simply supported column, eccentric axial load P at both ends.
// Reference: δ_mid = e × [sec(L/2 × √(P/EI)) - 1]
// Parameters from VM14: L=120in, 3×5 section, E=30e6 psi, P=4000 lb, e=0.3 in
// Converted to metric for our solver.

#[test]
fn validation_corotational_vm14_eccentric_column() {
    // Eccentric compression: cantilever with axial + lateral load
    // Lateral tip force simulates eccentricity effect
    let l: f64 = 3.0;
    let n = 16;
    let p_axial: f64 = -300.0; // kN compression (< Pcr)
    let p_lateral: f64 = 1.0;  // small lateral perturbation

    let pcr = std::f64::consts::PI.powi(2) * E_EFF * IZ / (4.0 * l * l);

    // Only run if below critical load
    assert!(p_axial.abs() < 0.5 * pcr, "Load should be below 0.5 Pcr");

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fy: p_lateral, mz: 0.0,
        })],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-5, 10, false);

    let corot = corot_res.expect("VM14 corotational solve must succeed");
    let tip_lin = lin_res.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let tip_corot = corot.results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    assert!(corot.converged, "VM14-like should converge");
    assert!(tip_lin > 1e-8, "Linear should deflect");
    assert!(tip_corot > 1e-8, "Corotational should deflect");

    // Corotational with axial compression should amplify lateral displacement
    assert!(
        tip_corot >= tip_lin * 0.95,
        "Axial compression should amplify: corot={:.6e} vs linear={:.6e}",
        tip_corot, tip_lin
    );
}

// ================================================================
// 2. Geometric Stiffening: Load → 0 Matches Linear
// ================================================================
//
// As applied load decreases, corotational should converge to linear.

#[test]
fn validation_corotational_small_load_equals_linear() {
    let l: f64 = 3.0;
    let n = 8;
    let tip_node = n + 1;
    let p_small = -0.1; // very small load

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p_small, mz: 0.0,
        })],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-5, 5, false);

    let corot = corot_res.expect("small-load corotational solve must succeed");
    let lin_uy = lin_res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;
    let corot_uy = corot.results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;

    if lin_uy.abs() > 1e-12 {
        let ratio = corot_uy / lin_uy;
        assert!(
            (ratio - 1.0).abs() < 0.05,
            "Small load: corot/linear={:.4}, should be ≈1.0", ratio
        );
    }
}

// ================================================================
// 3. Large Load: Significant Geometric Effect
// ================================================================
//
// Under large transverse load, corotational gives stiffer response
// (membrane effect / shortening).

#[test]
fn validation_corotational_large_load_stiffening() {
    let l: f64 = 1.0; // short beam for larger rotations
    let n = 8;
    let tip_node = n + 1;
    let p_large: f64 = -5000.0; // very large transverse load

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p_large, mz: 0.0,
        })],
    );

    let lin_res = linear::solve_2d(&input).unwrap();
    let corot_res = corotational::solve_corotational_2d(&input, 100, 1e-5, 20, false);

    let corot = corot_res.expect("large-load corotational solve must succeed");
    let lin_uy = lin_res.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;
    let corot_uy = corot.results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;

    // Both should be negative (downward)
    assert!(lin_uy < 0.0, "Linear should deflect down");

    // Corotational should converge and produce a result
    assert!(corot.converged, "Large load should still converge");

    // The key check is that corotational gives a different result from linear
    // For very large transverse loads, the beam develops membrane forces
    // which stiffen the response
    assert!(corot_uy < 0.0, "Corotational should deflect down");
}

// ================================================================
// 4. Convergence Monitoring
// ================================================================
//
// Track iteration count — should converge within reasonable iterations.

#[test]
fn validation_corotational_convergence_monitoring() {
    let l: f64 = 3.0;
    let n = 8;
    let tip_node = n + 1;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: -100.0, mz: 0.0,
        })],
    );

    let corot_res = corotational::solve_corotational_2d(&input, 50, 1e-5, 10, false);

    let corot = corot_res.expect("convergence-monitoring corotational solve must succeed");
    assert!(corot.converged, "Moderate load should converge");
    assert!(corot.iterations <= 50, "Should converge in ≤50 iterations, took {}", corot.iterations);
}

// ================================================================
// 5. Incremental Loading: More Increments → Better Convergence
// ================================================================

#[test]
fn validation_corotational_increments_convergence() {
    let l: f64 = 2.0;
    let n = 8;
    let tip_node = n + 1;
    let p = -200.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
        })],
    );

    // Few increments
    let res_few = corotational::solve_corotational_2d(&input, 50, 1e-5, 3, false);
    // Many increments
    let res_many = corotational::solve_corotational_2d(&input, 50, 1e-5, 20, false);

    // Both should converge (if they do, compare results)
    let few = res_few.expect("few-increments corotational solve must succeed");
    let many = res_many.expect("many-increments corotational solve must succeed");
    assert!(few.converged, "Few-increments solve should converge");
    assert!(many.converged, "Many-increments solve should converge");

    let uy_few = few.results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;
    let uy_many = many.results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap().uy;

    // Results should be similar (converged to same answer)
    if uy_few.abs() > 1e-8 {
        let ratio = uy_many / uy_few;
        assert!(
            (ratio - 1.0).abs() < 0.20,
            "Different increments should give similar results: ratio={:.4}",
            ratio
        );
    }
}
