/// Validation: guidedY support type
///
/// guidedY = ux+rz fixed, uy free (sliding clamp in Y direction).
/// Mirrors the existing guidedX pattern.
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::kinematic;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const L: f64 = 4.0;

// ================================================================
// 1. Cantilever with guidedY at free end
// ================================================================

#[test]
fn validation_guided_y_cantilever() {
    // Fixed at node 1, guidedY at node 2 (free end).
    // Apply vertical load at node 2: uy should be free, ux=0, rz=0.
    let input = make_beam(
        4, L, E, A, IZ,
        "fixed",
        Some("guidedY"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 5).unwrap();

    // uy should be nonzero (free direction)
    assert!(
        tip.uy.abs() > 1e-8,
        "guidedY should allow vertical displacement, got uy={:.6e}", tip.uy
    );

    // ux should be zero (restrained)
    assert!(
        tip.ux.abs() < 1e-10,
        "guidedY should fix ux, got ux={:.6e}", tip.ux
    );

    // rz should be zero (restrained)
    assert!(
        tip.rz.abs() < 1e-10,
        "guidedY should fix rz, got rz={:.6e}", tip.rz
    );
}

// ================================================================
// 2. guidedY vs manual spring equivalent
// ================================================================

#[test]
fn validation_guided_y_vs_springs() {
    // guidedY = ux+rz fixed, uy free.
    // Equivalent to very stiff springs on ux and rz with uy free.
    let fy = -15.0;

    // Case 1: guidedY support
    let input_guided = make_beam(
        4, L, E, A, IZ,
        "fixed",
        Some("guidedY"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy, mz: 0.0,
        })],
    );

    let res_guided = linear::solve_2d(&input_guided).unwrap();

    // Case 2: Spring support with very large kx and kz, ky=0
    let mut input_spring = make_beam(
        4, L, E, A, IZ,
        "fixed",
        None, // No end support initially
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy, mz: 0.0,
        })],
    );

    // Add spring support manually
    let big_k = 1e12;
    input_spring.supports.insert("2".to_string(), SolverSupport {
        id: 2,
        node_id: 5,
        support_type: "spring".to_string(),
        kx: Some(big_k), ky: Some(0.0), kz: Some(big_k),
        dx: None, dy: None, drz: None, angle: None,
    });

    let res_spring = linear::solve_2d(&input_spring).unwrap();

    // Compare tip displacements
    let tip_guided = res_guided.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let tip_spring = res_spring.displacements.iter().find(|d| d.node_id == 5).unwrap();

    assert_close(tip_guided.uy, tip_spring.uy, 0.01, "uy comparison");
}

// ================================================================
// 3. Kinematic classification with guidedY
// ================================================================

#[test]
fn validation_guided_y_kinematic() {
    // Simple beam: fixed at one end, guidedY at the other.
    // guidedY provides 2 restraints (ux + rz).
    // fixed provides 3 restraints.
    // Total r = 5, for 1 frame element: GH = 3*1 + 5 - 3*2 = 2 → hyperstatic degree 2.
    let input = make_beam(
        1, L, E, A, IZ,
        "fixed",
        Some("guidedY"),
        vec![],
    );

    let kin = kinematic::analyze_kinematics_2d(&input);

    assert_eq!(kin.degree, 2, "Expected degree 2, got {}", kin.degree);
    assert!(kin.is_solvable, "Fixed + guidedY should be solvable");
    assert_eq!(kin.classification, "hyperstatic");
}
