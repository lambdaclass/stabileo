//! The residual a constrained solve reports is the residual of the system it solved.
//!
//! Measured unreduced, K_ff·u_f − f_f is the set of forces the constraints carry, so every
//! constraint that transmitted load made a correct solution report `ResidualHigh` — a Warning
//! the diagnostics panel shows. Reduced by Cᵀ it is the solve's own error.

#[path = "common/mod.rs"]
mod common;

use common::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn codes(d: &[StructuredDiagnostic]) -> Vec<DiagnosticCode> {
    d.iter().filter(|x| x.phase.as_deref() == Some("solve")).map(|x| x.code).collect()
}

/// Two cantilever columns whose tops share ux; the lateral load acts on one of them only,
/// so the tie carries half of it.
#[test]
fn tied_columns_2d_report_a_small_residual() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 0.0), (4, 4.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 3, 4, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] })];
    let res = solve_2d(&input).unwrap();

    let top = |n: usize| res.displacements.iter().find(|d| d.node_id == n).unwrap().ux;
    assert!((top(2) - top(4)).abs() < 1e-12, "the tie holds");
    let c = codes(&res.structured_diagnostics);
    assert!(c.contains(&DiagnosticCode::ResidualOk), "expected ResidualOk, got {c:?}");
    assert!(!c.contains(&DiagnosticCode::ResidualHigh), "a correct solve reported ResidualHigh: {c:?}");
}

#[test]
fn tied_columns_3d_report_a_small_residual() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 0.0), (4, 4.0, 0.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4, 6.75e-4, 1.14e-3)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 3, 4, 1, 1)],
        vec![(1, vec![true; 6]), (3, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 10.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] })];
    let res = solve_3d(&input).unwrap();

    let top = |n: usize| res.displacements.iter().find(|d| d.node_id == n).unwrap().ux;
    assert!((top(2) - top(4)).abs() < 1e-12, "the tie holds");
    let c = codes(&res.structured_diagnostics);
    assert!(c.contains(&DiagnosticCode::ResidualOk), "expected ResidualOk, got {c:?}");
    assert!(!c.contains(&DiagnosticCode::ResidualHigh), "a correct solve reported ResidualHigh: {c:?}");
}

/// A free top tied to a restrained base that settles: the tie prescribes the slave's ux
/// through the settlement (u_p), which the solver moves to the right-hand side. The
/// residual must be measured against the system that was actually solved.
#[test]
fn tied_to_a_settling_support_2d_reports_a_small_residual() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 0.0), (4, 4.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 3, 4, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    // Node 1's support settles 5 mm along x, and node 4's ux is tied to node 1's.
    input.supports.get_mut("1").unwrap().dx = Some(0.005);
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 4, dofs: vec![0] })];
    let res = solve_2d(&input).unwrap();

    let ux4 = res.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    assert!((ux4 - 0.005).abs() < 1e-9, "the slave follows the settlement: ux4 = {ux4}");
    let c = codes(&res.structured_diagnostics);
    assert!(!c.contains(&DiagnosticCode::ResidualHigh), "a correct solve reported ResidualHigh: {c:?}");
}

#[test]
fn tied_to_a_settling_support_3d_reports_a_small_residual() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 0.0), (4, 4.0, 0.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4, 6.75e-4, 1.14e-3)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 3, 4, 1, 1)],
        vec![(1, vec![true; 6]), (3, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 10.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    for s in input.supports.values_mut() {
        if s.node_id == 1 { s.dx = Some(0.005); }
    }
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 4, dofs: vec![0] })];
    let res = solve_3d(&input).unwrap();

    let ux4 = res.displacements.iter().find(|d| d.node_id == 4).unwrap().ux;
    assert!((ux4 - 0.005).abs() < 1e-9, "the slave follows the settlement: ux4 = {ux4}");
    let c = codes(&res.structured_diagnostics);
    assert!(!c.contains(&DiagnosticCode::ResidualHigh), "a correct solve reported ResidualHigh: {c:?}");
}
