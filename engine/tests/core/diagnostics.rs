#[allow(unused_imports)]
use crate::common::{make_input, make_3d_input, make_3d_beam};
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};

#[test]
fn equilibrium_summary_2d_cantilever() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).unwrap();

    let eq = results.equilibrium.as_ref().expect("equilibrium summary should be populated");

    // Applied: Fy = -10
    assert_eq!(eq.applied_force_sum.len(), 3);
    assert!((eq.applied_force_sum[1] - (-10.0)).abs() < 1e-10, "fy = -10");

    // Reactions should balance: Ry = +10
    assert!((eq.reaction_force_sum[1] - 10.0).abs() < 0.01,
        "Ry ≈ 10: got {}", eq.reaction_force_sum[1]);

    assert!(eq.equilibrium_ok, "global equilibrium should pass");
    assert!(eq.max_imbalance < 1e-3, "imbalance should be tiny: {}", eq.max_imbalance);
}

#[test]
fn equilibrium_summary_3d_cantilever() {
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    let eq = results.equilibrium.as_ref().expect("equilibrium summary should be populated");

    assert_eq!(eq.applied_force_sum.len(), 6);
    assert!((eq.applied_force_sum[1] - (-10.0)).abs() < 1e-10);
    assert!((eq.reaction_force_sum[1] - 10.0).abs() < 0.01,
        "Fy reaction ≈ 10: got {}", eq.reaction_force_sum[1]);
    assert!(eq.equilibrium_ok, "global equilibrium should pass");
    assert!(eq.max_imbalance < 1e-3, "imbalance: {}", eq.max_imbalance);
}

#[test]
fn structured_diagnostics_3d_sparse_path() {
    // 12-element cantilever → 72 free DOFs > 64 → sparse path
    let input = make_3d_beam(
        12, 12.0,
        200e3, 0.3, 0.01, 1e-4, 1e-4, 2e-4,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 13, fx: 0.0, fy: -10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    // Sparse path should emit structured diagnostics
    assert!(!results.structured_diagnostics.is_empty(),
        "sparse path should emit structured diagnostics");

    // Check for ResidualOk diagnostic
    let residual_diag = results.structured_diagnostics.iter()
        .find(|d| d.code == DiagnosticCode::ResidualOk);
    assert!(residual_diag.is_some(), "should have ResidualOk diagnostic");

    let rd = residual_diag.unwrap();
    assert_eq!(rd.severity, Severity::Info);
    assert!(rd.value.unwrap() < 1e-6, "residual should be small");
    assert_eq!(rd.phase.as_deref(), Some("solve"));

    // Equilibrium should be good
    let eq = results.equilibrium.as_ref().unwrap();
    assert!(eq.equilibrium_ok);
    assert!(eq.residual_ok);
}

#[test]
fn structured_diagnostics_2d_solver_path() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).unwrap();

    // 2D solver should emit solver path diagnostic
    assert!(!results.structured_diagnostics.is_empty(),
        "2D solver should emit structured diagnostics");

    let path_diag = results.structured_diagnostics.iter()
        .find(|d| d.code == DiagnosticCode::DenseLu || d.code == DiagnosticCode::SparseCholesky);
    assert!(path_diag.is_some(), "should have solver path diagnostic");
    assert_eq!(path_diag.unwrap().severity, Severity::Info);
}

#[test]
fn structured_diagnostics_3d_dense_path() {
    // Small model (< 64 free DOFs) → dense path
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: -10.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = solve_3d(&input).unwrap();

    // Dense path should emit DenseLu diagnostic
    let path_diag = results.structured_diagnostics.iter()
        .find(|d| d.code == DiagnosticCode::DenseLu);
    assert!(path_diag.is_some(), "3D dense path should emit DenseLu diagnostic");
    assert_eq!(path_diag.unwrap().phase.as_deref(), Some("solve"));

    // Equilibrium should be populated
    assert!(results.equilibrium.is_some());
    assert!(results.equilibrium.as_ref().unwrap().equilibrium_ok);
}
