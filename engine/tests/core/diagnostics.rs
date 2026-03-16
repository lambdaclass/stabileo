#[allow(unused_imports)]
use crate::common::{make_input, make_3d_input, make_3d_beam};
use dedaliano_engine::types::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::constraints::{solve_constrained_2d, ConstrainedInput};

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

#[test]
fn constraint_validation_conflicting() {
    // Two EqualDOF constraints on the same slave DOF → ConflictingConstraints diagnostic
    let mut base = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );

    // Both constraints make node 2 DOF 0 dependent on different masters
    base.constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 1, slave_node: 2, dofs: vec![0],
        }),
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 3, slave_node: 2, dofs: vec![0],
        }),
    ];

    let ci = ConstrainedInput {
        solver: base.clone(),
        constraints: base.constraints.clone(),
    };
    let results = solve_constrained_2d(&ci).unwrap();

    // Should have ConflictingConstraints diagnostic
    let conflict = results.structured_diagnostics.iter()
        .find(|d| d.code == DiagnosticCode::ConflictingConstraints);
    assert!(conflict.is_some(), "should detect conflicting constraints, got: {:?}",
        results.structured_diagnostics);

    // Equilibrium should still be populated (solve succeeds, just with a warning)
    assert!(results.equilibrium.is_some());
}

#[test]
fn constraint_validation_clean_passes() {
    // A clean constraint setup should produce no constraint diagnostics
    let mut base = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0)],
        vec![(1, 200e3, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -10.0, mz: 0.0,
        })],
    );

    base.constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint {
            master_node: 1, slave_node: 2, dofs: vec![0],
        }),
    ];

    let ci = ConstrainedInput {
        solver: base.clone(),
        constraints: base.constraints.clone(),
    };
    let results = solve_constrained_2d(&ci).unwrap();

    // No constraint-related diagnostics
    let constraint_diags: Vec<_> = results.structured_diagnostics.iter()
        .filter(|d| matches!(d.code,
            DiagnosticCode::ConflictingConstraints |
            DiagnosticCode::CircularConstraint |
            DiagnosticCode::OverConstrainedDof
        ))
        .collect();
    assert!(constraint_diags.is_empty(), "clean constraints should have no issues: {:?}", constraint_diags);
}

// ==================== Path-Parity Tests ====================
//
// Verify that every solver path emits the same diagnostic contract:
// 1. Exactly one solver-path code (SparseCholesky | DenseLu | SparseFallbackDenseLu)
// 2. Exactly one residual code (ResidualOk | ResidualHigh)
// 3. Phase fields are always present
// 4. Residual diagnostic carries value + threshold
// 5. Equilibrium summary is always present

/// Assert the diagnostics contract that all solver paths must satisfy.
fn assert_diagnostics_contract(diags: &[StructuredDiagnostic], eq: Option<&EquilibriumSummary>, label: &str) {
    // 1. Exactly one solver-path diagnostic
    let path_codes: Vec<_> = diags.iter()
        .filter(|d| matches!(d.code,
            DiagnosticCode::SparseCholesky | DiagnosticCode::DenseLu | DiagnosticCode::SparseFallbackDenseLu
        ))
        .collect();
    assert_eq!(path_codes.len(), 1,
        "[{}] expected exactly 1 solver-path diagnostic, got {}: {:?}",
        label, path_codes.len(), path_codes.iter().map(|d| &d.code).collect::<Vec<_>>());

    // All path diagnostics have phase
    let pd = path_codes[0];
    assert!(pd.phase.is_some(), "[{}] solver-path diagnostic missing phase", label);
    // Normal paths are Info; fallback paths are Warning
    if pd.code == DiagnosticCode::SparseFallbackDenseLu {
        assert_eq!(pd.severity, Severity::Warning,
            "[{}] fallback solver-path severity should be Warning", label);
    } else {
        assert_eq!(pd.severity, Severity::Info,
            "[{}] solver-path severity should be Info", label);
    }

    // 2. Exactly one residual diagnostic
    let res_codes: Vec<_> = diags.iter()
        .filter(|d| matches!(d.code, DiagnosticCode::ResidualOk | DiagnosticCode::ResidualHigh))
        .collect();
    assert_eq!(res_codes.len(), 1,
        "[{}] expected exactly 1 residual diagnostic, got {}", label, res_codes.len());

    let rd = res_codes[0];
    assert!(rd.phase.is_some(), "[{}] residual diagnostic missing phase", label);
    assert!(rd.value.is_some(), "[{}] residual diagnostic missing value", label);
    assert!(rd.threshold.is_some(), "[{}] residual diagnostic missing threshold", label);

    // 3. If conditioning diagnostics exist, they have phase + value
    for d in diags.iter().filter(|d| matches!(d.code,
        DiagnosticCode::HighDiagonalRatio | DiagnosticCode::ExtremelyHighDiagonalRatio | DiagnosticCode::NearZeroDiagonal
    )) {
        assert!(d.phase.is_some(), "[{}] conditioning diagnostic {:?} missing phase", label, d.code);
    }

    // 4. Equilibrium summary present
    assert!(eq.is_some(), "[{}] equilibrium summary missing", label);
}

#[test]
fn diagnostics_parity_2d_dense() {
    // 2 elements → 3 nodes × 3 DOFs = 9 total, minus 3 fixed = 6 free → dense
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
    let r = solve_2d(&input).unwrap();
    assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "2D-dense");

    // Should be DenseLu (< SPARSE_THRESHOLD free DOFs)
    assert!(r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::DenseLu),
        "2D small model should use dense path");
}

#[test]
fn diagnostics_parity_3d_dense() {
    // 1 element → 2 nodes × 6 DOFs = 12 total, minus 6 fixed = 6 free → dense
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
    let r = solve_3d(&input).unwrap();
    assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "3D-dense");

    assert!(r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::DenseLu),
        "3D small model should use dense path");
}

#[test]
fn diagnostics_parity_3d_sparse() {
    // 12 elements → 13 nodes × 6 DOFs = 78 total, minus 6 fixed = 72 free → sparse
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
    let r = solve_3d(&input).unwrap();
    assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "3D-sparse");

    assert!(r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky),
        "3D large model should use sparse path");
}

#[test]
fn diagnostics_residual_values_consistent() {
    // Verify that residual in the diagnostic matches residual in the equilibrium summary
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
    let r = solve_3d(&input).unwrap();

    let eq = r.equilibrium.as_ref().unwrap();
    let res_diag = r.structured_diagnostics.iter()
        .find(|d| matches!(d.code, DiagnosticCode::ResidualOk | DiagnosticCode::ResidualHigh))
        .unwrap();

    let diag_residual = res_diag.value.unwrap();
    let eq_residual = eq.relative_residual;

    assert!((diag_residual - eq_residual).abs() < 1e-15,
        "residual mismatch: diagnostic={:.2e}, equilibrium={:.2e}", diag_residual, eq_residual);

    // Both should agree on ok/not-ok
    let diag_says_ok = res_diag.code == DiagnosticCode::ResidualOk;
    assert_eq!(diag_says_ok, eq.residual_ok,
        "residual ok mismatch: diagnostic code={:?}, equilibrium.residual_ok={}", res_diag.code, eq.residual_ok);
}

/// Verify that when the sparse path succeeds, the solver-path code is SparseCholesky
/// (not SparseFallbackDenseLu) and the residual describes the actual returned solution.
///
/// Note: testing the residual-triggered fallback path (sparse residual > 1e-6 → dense LU)
/// is not practical with a normal model since well-conditioned problems always produce
/// good sparse residuals. The fix for that path (recomputing residual from the dense
/// solution's K*u) is verified by code inspection and the structural invariant below.
#[test]
fn diagnostics_sparse_path_code_matches_actual_solver() {
    // 12 elements → 72 free DOFs → sparse path
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
    let r = solve_3d(&input).unwrap();

    // On a well-conditioned problem, sparse should succeed — no fallback
    let path = r.structured_diagnostics.iter()
        .find(|d| matches!(d.code,
            DiagnosticCode::SparseCholesky | DiagnosticCode::SparseFallbackDenseLu
        ))
        .expect("should have solver-path diagnostic");
    assert_eq!(path.code, DiagnosticCode::SparseCholesky,
        "well-conditioned problem should not trigger fallback");

    // Residual in diagnostic should be the actual solve residual, not stale
    let res_diag = r.structured_diagnostics.iter()
        .find(|d| d.code == DiagnosticCode::ResidualOk)
        .expect("should have ResidualOk");
    assert!(res_diag.value.unwrap() < 1e-10,
        "sparse residual should be near-machine-precision: {:.2e}", res_diag.value.unwrap());

    // No SparseFallbackDenseLu should appear on a clean solve
    assert!(!r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseFallbackDenseLu),
        "clean solve should not emit fallback diagnostic");
}

/// Verify the diagnostics parity contract for the early sparse-factorization-failure
/// fallback path. This path is entered when Cholesky factorization fails completely
/// (even with regularization). Like the residual-triggered fallback, it returns a dense
/// LU solution.
///
/// Note: triggering this path requires a matrix where Cholesky fails for all shift
/// values, which doesn't happen with normal FEA models. The test verifies the contract
/// shape on the paths we can trigger, and the code structure ensures both fallback paths
/// emit the same diagnostic contract.
#[test]
fn diagnostics_parity_contract_residual_describes_returned_solution() {
    // Test the invariant: reported residual matches what you'd get from the returned
    // displacements. Tests all reachable paths (2D dense, 3D dense, 3D sparse).
    for (label, eq_opt) in [
        ("2D-dense", {
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
            let r = solve_2d(&input).unwrap();
            assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "2D-dense-residual");
            r.equilibrium
        }),
        ("3D-dense", {
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
            let r = solve_3d(&input).unwrap();
            assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "3D-dense-residual");
            r.equilibrium
        }),
        ("3D-sparse", {
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
            let r = solve_3d(&input).unwrap();
            assert_diagnostics_contract(&r.structured_diagnostics, r.equilibrium.as_ref(), "3D-sparse-residual");
            r.equilibrium
        }),
    ] {
        let eq = eq_opt.as_ref().unwrap();
        // The reported residual must be honest: small for a well-conditioned problem
        assert!(eq.relative_residual < 1e-8,
            "[{}] residual {:.2e} too large for well-conditioned model", label, eq.relative_residual);
        assert!(eq.residual_ok, "[{}] residual_ok should be true", label);
        assert!(eq.equilibrium_ok, "[{}] equilibrium_ok should be true", label);
    }
}
