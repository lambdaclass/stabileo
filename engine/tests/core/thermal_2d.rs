/// Regression tests for 2D thermal load bugs:
/// Bug 1: Thermal FEF sign convention — cantilever with DT>0 should expand (positive ux at free end)
/// Bug 2: 2D truss thermal FEF not subtracted in internal force computation
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear;
use crate::common::make_input;

const E: f64 = 200_000.0;  // MPa (steel)
const A: f64 = 0.01;       // m^2
const IZ: f64 = 1e-4;      // m^4
const L: f64 = 3.0;        // m
const ALPHA: f64 = 12e-6;  // /degC (hardcoded in solver)
const DT: f64 = 50.0;      // degC

/// Bug 1: 2D cantilever beam (fixed at node 1, free at node 2) along X with DT=50 degC.
/// Expected: free end expands in +x direction: ux = +alpha*DT*L = +0.0018 m.
/// The 3D solver gets this right but the 2D solver has the sign flipped.
#[test]
fn thermal_2d_cantilever_positive_displacement() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient: 0.0,
        })],
    );

    let result = linear::solve_2d(&input).expect("solve should succeed");
    let tip = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let expected = ALPHA * DT * L; // +0.0018 m
    assert!(
        (tip.ux - expected).abs() < 1e-8,
        "Expected ux = +{expected} (positive expansion), got ux = {} (sign bug if negative)",
        tip.ux
    );
}

/// Bug 1 (continued): Fixed-fixed beam with DT > 0 should produce compressive axial force (negative N).
/// If the FEF sign is wrong, the force will have the wrong sign.
#[test]
fn thermal_2d_fixed_fixed_compressive_force() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient: 0.0,
        })],
    );

    let result = linear::solve_2d(&input).expect("solve should succeed");

    // Zero displacements expected
    for d in &result.displacements {
        assert!(d.ux.abs() < 1e-10, "Expected zero ux, got {}", d.ux);
    }

    // Internal force should be compressive (negative N)
    let forces = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let e_kn = E * 1000.0; // E in kN/m^2
    let expected_n = -(e_kn * A * ALPHA * DT); // negative = compression
    assert!(
        (forces.n_start - expected_n).abs() < 1.0,
        "Expected compressive n_start = {expected_n}, got {} (wrong sign if positive)",
        forces.n_start,
    );
}

/// Bug 2: 2D truss with thermal load — fixed-fixed truss should develop axial force.
/// The 2D truss internal force path does not subtract thermal FEF (unlike the 3D path).
#[test]
fn thermal_2d_truss_fixed_fixed_axial_force() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient: 0.0,
        })],
    );

    let result = linear::solve_2d(&input).expect("solve should succeed");
    let forces = result.element_forces.iter().find(|f| f.element_id == 1).unwrap();

    let e_kn = E * 1000.0;
    let expected_n = e_kn * A * ALPHA * DT; // magnitude

    assert!(
        forces.n_start.abs() > 1.0,
        "Truss thermal load should produce non-zero axial force, got n_start = {}",
        forces.n_start,
    );
    assert!(
        (forces.n_start.abs() - expected_n).abs() < 1.0,
        "Expected |n_start| = {expected_n}, got {}",
        forces.n_start.abs(),
    );
}

/// Bug 2: 2D truss with thermal load — free-to-expand truss should displace.
#[test]
fn thermal_2d_truss_free_expansion() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        // Node 1: pinned (both translations fixed), Node 2: rollerX (free in x, fixed in z)
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Thermal(SolverThermalLoad {
            element_id: 1,
            dt_uniform: DT,
            dt_gradient: 0.0,
        })],
    );

    let result = linear::solve_2d(&input).expect("solve should succeed");
    let tip = result.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let expected = ALPHA * DT * L;
    assert!(
        (tip.ux - expected).abs() < 1e-8,
        "Expected ux = +{expected} for truss free expansion, got ux = {}",
        tip.ux,
    );
}
