//! Connector stiffness findings (from the element K checks in
//! `element_rigid_body_modes.rs`). Each `#[ignore]`d test states the CORRECT
//! behaviour and fails today; run with `--ignored` to reproduce. The non-ignored
//! tests pin the behaviour that is right.

#[path = "common/mod.rs"]
mod common;

use common::{make_3d_input, make_input};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn connector(id: usize, i: usize, j: usize, ka: f64, ks: f64, km: f64) -> ConnectorElement {
    ConnectorElement { id, node_i: i, node_j: j, k_axial: ka, k_shear: ks, k_moment: km, k_shear_z: ks, k_bend_y: km, k_bend_z: km }
}

/// FINDING 1: a FINITE-length connector with shear stiffness violates moment
/// equilibrium. K = [K_ii, −K_ii; −K_ii, K_ii], K_ii = diag(k_axial, k_shear,
/// k_moment) in local axes, has no shear–moment coupling (no L·k_shear terms), so
/// it is not invariant under rigid rotation and the shear force it transmits
/// carries no moment arm. Cantilever node 1 (fixed) — connector — node 2 at x = 2,
/// load Fz = 10 at node 2: the support must react M = −20 (ΣM = 0); the solver
/// gives M = 0. The frame element 2–3 only makes the model use rotation DOFs.
#[test]
#[ignore = "FINDING: finite-length connector with k_shear has no shear-moment coupling (moment equilibrium violated)"]
fn connector_finite_length_moment_equilibrium() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 2.0, 1.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: 10.0, my: 0.0 })],
    );
    input.connectors.insert("1".into(), connector(1, 1, 2, 1e4, 1e4, 1e4));
    let res = solve_2d(&input).unwrap();
    let r = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r.rz + 10.0).abs() < 1e-9, "Rz = {}", r.rz);
    // ΣM about node 1: reaction moment + 2·Fz = 0.
    assert!((r.my + 20.0).abs() < 1e-6, "reaction moment {} (expected −20): moment equilibrium violated", r.my);
}

/// The same connector at zero length (its documented primary use) is exact.
#[test]
fn connector_zero_length_equilibrium() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 0.0), (3, 2.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 3.0, fz: 10.0, my: 0.0 })],
    );
    input.connectors.insert("1".into(), connector(1, 1, 2, 1e4, 2e4, 3e4));
    let res = solve_2d(&input).unwrap();
    let r = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r.rx + 3.0).abs() < 1e-9 && (r.rz + 10.0).abs() < 1e-9);
    assert!((r.my + 20.0).abs() < 1e-9, "reaction moment {}", r.my);
}

/// FINDING 2: connectors are assembled with a hard-coded 3-DOF (2D) / 6-DOF (3D)
/// per-node layout (`ke[i * 6 + j]`, `ke[i * 12 + j]` over `element_dofs`), but
/// the DOF numbering uses 2 DOFs/node in an all-truss 2D model (3 in 3D), so the
/// connector's entries land on the wrong DOFs. Here node 2 is held only by the
/// connector's axial spring in x (the truss 2–3 is vertical), so ux2 = F/k_axial
/// = 1e-3; the mis-assembly puts k_moment on ux2 instead.
#[test]
#[ignore = "FINDING: connector assembly assumes 3 DOFs/node; wrong in all-truss 2D models (2 DOFs/node)"]
fn connector_in_truss_only_2d_model() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0), (3, 1.0, 2.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "truss", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    input.connectors.insert("1".into(), connector(1, 1, 2, 1e4, 0.0, 5e3));
    let res = solve_2d(&input);
    let ux = res.ok().and_then(|r| r.displacements.iter().find(|d| d.node_id == 2).map(|d| d.ux));
    assert!(matches!(ux, Some(u) if (u - 1e-3).abs() < 1e-9), "ux2 = {ux:?}, expected F/k_axial = 1e-3");
}

/// FINDING 2 (3D, warping): with a warping section the numbering has 7 DOFs/node,
/// so `element_dofs` returns 14 indices and `ke[i * 12 + j]` reads past the 144
/// entries (index out of bounds) or onto the wrong DOFs. The model is a fixed
/// column with a zero-length connector to a second node; the solve must succeed
/// and the connector node must move by F/k_axial relative to the column top.
#[test]
#[ignore = "FINDING: connector assembly assumes 6 DOFs/node; panics/mis-assembles with warping (7 DOFs/node)"]
fn connector_in_warping_3d_model() {
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 0.0, 0.0, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-5)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 10.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    input.sections.get_mut("1").unwrap().cw = Some(1e-7);
    input.connectors.insert("1".into(), connector(1, 2, 3, 1e4, 1e4, 1e4));
    let res = std::panic::catch_unwind(|| solve_3d(&input));
    let res = res.expect("solve_3d panicked").expect("solve failed");
    let d2 = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = res.displacements.iter().find(|d| d.node_id == 3).unwrap();
    // Zero-length connector along global x: relative displacement = F / k_axial.
    assert!(((d3.ux - d2.ux) - 1e-3).abs() < 1e-9, "relative ux = {}", d3.ux - d2.ux);
}
