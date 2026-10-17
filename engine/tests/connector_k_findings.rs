//! Connector stiffness findings (from the element K checks in
//! `element_rigid_body_modes.rs`), now fixed, plus analytic, rotation-invariance
//! and dense/sparse checks of models with connectors. Each FINDING test was an
//! `#[ignore]`d reproduction that failed before the fix.

#[path = "common/mod.rs"]
mod common;

use common::{make_3d_input, make_input};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;

fn connector(id: usize, i: usize, j: usize, ka: f64, ks: f64, km: f64) -> ConnectorElement {
    ConnectorElement { id, node_i: i, node_j: j, k_axial: ka, k_shear: ks, k_moment: km, k_shear_z: ks, k_bend_y: km, k_bend_z: km }
}

/// FINDING 1 (fixed): a FINITE-length connector with shear stiffness violated
/// moment equilibrium. K = [K_ii, −K_ii; −K_ii, K_ii], K_ii = diag(k_axial,
/// k_shear, k_moment) in local axes, had no shear–moment coupling (no L·k_shear
/// terms), so it was not invariant under rigid rotation and the shear force it
/// transmitted carried no moment arm. Cantilever node 1 (fixed) — connector —
/// node 2 at x = 2, load Fz = 10 at node 2: the support must react M = −20
/// (ΣM = 0); the solver gave M = 0. The frame element 2–3 only makes the model
/// use rotation DOFs.
#[test]
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

/// FINDING 2 (fixed): connectors were assembled with a hard-coded 3-DOF (2D) /
/// 6-DOF (3D) per-node layout (`ke[i * 6 + j]`, `ke[i * 12 + j]` over
/// `element_dofs`), but the DOF numbering uses 2 DOFs/node in an all-truss 2D
/// model (3 in 3D), so the connector's entries landed on the wrong DOFs. Here
/// node 2 is held only by the connector's axial spring in x (the truss 2–3 is
/// vertical), so ux2 = F/k_axial = 1e-3; the mis-assembly put k_moment on ux2.
/// The model has no rotations, so k_moment is dropped (nothing to act on).
#[test]
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

/// FINDING 2 (3D, warping; fixed): with a warping section the numbering has 7
/// DOFs/node, so `element_dofs` returned 14 indices and `ke[i * 12 + j]` read past
/// the 144 entries (index out of bounds) or onto the wrong DOFs. The model is a fixed
/// column with a zero-length connector to a second node; the solve must succeed
/// and the connector node must move by F/k_axial relative to the column top.
#[test]
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

// ─── analytic checks ────────────────────────────────────────────────────────

/// Cantilever through a finite connector, L = 2, shear springs at the midpoint
/// (arm L/2 = 1 to each end). Node 2 is held only by the connector: the shear
/// force V = P and the moment balance at node 2, k_moment·θ = V·L/2, give
/// θ = P·(L/2)/k_moment and uz = P/k_shear + (L/2)·θ; ux = Fx/k_axial.
#[test]
fn connector_cantilever_analytic_2d() {
    let (ka, ks, km, p, fx) = (1e4, 2e4, 5e3, 10.0, 3.0);
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 2.0, 0.0), (3, 2.0, 1.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx, fz: p, my: 0.0 })],
    );
    input.connectors.insert("1".into(), connector(1, 1, 2, ka, ks, km));
    let res = solve_2d(&input).unwrap();
    let d = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let theta = p * 1.0 / km;
    assert!((d.ux - fx / ka).abs() < 1e-12, "ux = {}", d.ux);
    assert!((d.ry - theta).abs() < 1e-12, "θ = {} (expected {theta})", d.ry);
    assert!((d.uz - (p / ks + 1.0 * theta)).abs() < 1e-12, "uz = {}", d.uz);
    let r = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((r.rx + fx).abs() < 1e-9 && (r.rz + p).abs() < 1e-9 && (r.my + 2.0 * p).abs() < 1e-9);
}

/// The same cantilever in 3D, along x, loaded in y and z. Isotropic springs about
/// the axis (k_shear = k_shear_z, k_bend_y = k_bend_z) so the result does not
/// depend on the connector's choice of local y/z.
#[test]
fn connector_cantilever_analytic_3d() {
    let (ka, ks, kt, kb, fy, fz, mx) = (1e4, 2e4, 1e3, 5e3, 10.0, 4.0, 2.0);
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 2.0, 0.0, 0.0), (3, 2.0, 0.0, 1.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-5)],
        vec![(1, "frame", 2, 3, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy, fz, mx, my: 0.0, mz: 0.0, bw: None })],
    );
    input.connectors.insert("1".into(), ConnectorElement {
        id: 1, node_i: 1, node_j: 2, k_axial: ka, k_shear: ks, k_moment: kt,
        k_shear_z: ks, k_bend_y: kb, k_bend_z: kb,
    });
    let res = solve_3d(&input).unwrap();
    let d = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    // uy = x·θz, uz = −x·θy for a rotation about node 1.
    let (rz, ry) = (fy * 1.0 / kb, -fz * 1.0 / kb);
    assert!((d.rz - rz).abs() < 1e-12 && (d.ry - ry).abs() < 1e-12, "θ = ({}, {})", d.ry, d.rz);
    assert!((d.uy - (fy / ks + rz)).abs() < 1e-12, "uy = {}", d.uy);
    assert!((d.uz - (fz / ks - ry)).abs() < 1e-12, "uz = {}", d.uz);
    assert!((d.rx - mx / kt).abs() < 1e-12 && d.ux.abs() < 1e-12);
    let r = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    // Reaction moment = −(r × F) − M with r = (2, 0, 0).
    assert!((r.fy + fy).abs() < 1e-9 && (r.fz + fz).abs() < 1e-9);
    assert!((r.mx + mx).abs() < 1e-9 && (r.my - 2.0 * fz).abs() < 1e-9 && (r.mz + 2.0 * fy).abs() < 1e-9,
        "reaction moments ({}, {}, {})", r.mx, r.my, r.mz);
}

/// A shear spring on a finite connector needs the end rotations to carry V·L; in
/// a model without rotation DOFs that is refused, not silently dropped. At zero
/// length the same spring is fine (no moment arm).
#[test]
fn connector_finite_shear_without_rotations_is_refused() {
    let build = |xj: f64| {
        let mut input = make_input(
            vec![(1, 0.0, 0.0), (2, xj, 0.0), (3, xj + 1.0, 2.0)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 1e-4)],
            vec![(1, "truss", 2, 3, 1, 1, false, false)],
            vec![(1, 1, "pinned"), (2, 3, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 4.0, my: 0.0 })],
        );
        input.connectors.insert("1".into(), connector(1, 1, 2, 1e4, 2e4, 0.0));
        input
    };
    let err = solve_2d(&build(1.0)).unwrap_err();
    assert!(err.contains("Connector 1") && err.contains("rotation DOFs"), "{err}");
    // Zero length: the truss 2–3 (direction (1, 2)/√5) and the connector share the load.
    let res = solve_2d(&build(0.0)).unwrap();
    let r1 = res.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = res.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!((r1.rx + r3.rx + 10.0).abs() < 1e-9 && (r1.rz + r3.rz + 4.0).abs() < 1e-9);
}

#[test]
fn connector_with_missing_node_is_refused() {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 2.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![],
    );
    input.connectors.insert("7".into(), connector(7, 2, 99, 1e4, 1e4, 1e4));
    let err = solve_2d(&input).unwrap_err();
    assert!(err.contains("Connector 7") && err.contains("99"), "{err}");
}

// ─── rotation invariance ────────────────────────────────────────────────────

/// Rotating a whole 2D model (an inclined finite connector into a frame) and its
/// loads rotates the displacements and reactions and leaves rotations unchanged.
#[test]
fn connector_model_rotation_invariance_2d() {
    let base = [(1, 0.0, 0.0), (2, 1.5, 0.8), (3, 3.0, 0.2)];
    let (fx, fz, m) = (7.0, -12.0, 3.0);
    let solve = |phi: f64| {
        let (c, s) = (phi.cos(), phi.sin());
        let rot = |x: f64, z: f64| (c * x - s * z, s * x + c * z);
        let nodes = base.iter().map(|&(id, x, z)| { let (x, z) = rot(x, z); (id, x, z) }).collect();
        let (lx, lz) = rot(fx, fz);
        let mut input = make_input(
            nodes,
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 1e-4)],
            vec![(1, "frame", 2, 3, 1, 1, false, false)],
            vec![(1, 1, "fixed"), (2, 3, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lx, fz: lz, my: m })],
        );
        input.connectors.insert("1".into(), connector(1, 1, 2, 3e4, 2e4, 4e3));
        solve_2d(&input).unwrap()
    };
    let r0 = solve(0.0);
    for phi in [0.4, 1.3, 2.9, -2.2] {
        let r = solve(phi);
        let (c, s) = (phi.cos(), phi.sin());
        for d0 in &r0.displacements {
            let d = r.displacements.iter().find(|d| d.node_id == d0.node_id).unwrap();
            let (ux, uz) = (c * d0.ux - s * d0.uz, s * d0.ux + c * d0.uz);
            assert!((d.ux - ux).abs() < 1e-10 && (d.uz - uz).abs() < 1e-10 && (d.ry - d0.ry).abs() < 1e-10,
                "node {} at φ = {phi}: ({}, {}, {}) vs ({ux}, {uz}, {})", d0.node_id, d.ux, d.uz, d.ry, d0.ry);
        }
        for q0 in &r0.reactions {
            let q = r.reactions.iter().find(|q| q.node_id == q0.node_id).unwrap();
            let (rx, rz) = (c * q0.rx - s * q0.rz, s * q0.rx + c * q0.rz);
            assert!((q.rx - rx).abs() < 1e-8 && (q.rz - rz).abs() < 1e-8 && (q.my - q0.my).abs() < 1e-8);
        }
    }
}

fn rot3(axis: [f64; 3], angle: f64) -> [[f64; 3]; 3] {
    let n = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
    let [x, y, z] = axis.map(|v| v / n);
    let (c, s) = (angle.cos(), angle.sin());
    let t = 1.0 - c;
    [
        [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
        [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
        [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
    ]
}

fn apply(r: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| r[i][0] * v[0] + r[i][1] * v[1] + r[i][2] * v[2])
}

/// Rotating a whole 3D model (an inclined finite connector into a frame) rotates
/// translations, rotations, reaction forces and moments as vectors. The springs
/// are isotropic about the connector axis and the frame section has Iy = Iz,
/// since neither the connector nor this frame is given an orientation.
#[test]
fn connector_model_rotation_invariance_3d() {
    let base = [(1, [0.0, 0.0, 0.0]), (2, [1.2, 0.7, -0.5]), (3, [2.5, 1.0, 0.4])];
    let (f, m) = ([5.0, -8.0, 3.0], [1.0, 2.0, -1.5]);
    let solve = |r: &[[f64; 3]; 3]| {
        let nodes = base.iter().map(|&(id, p)| { let q = apply(r, p); (id, q[0], q[1], q[2]) }).collect();
        let (lf, lm) = (apply(r, f), apply(r, m));
        let mut input = make_3d_input(
            nodes,
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 2e-4, 2e-4, 1e-4)],
            vec![(1, "frame", 2, 3, 1, 1)],
            vec![(1, vec![true; 6]), (3, vec![true, true, true, false, false, false])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2, fx: lf[0], fy: lf[1], fz: lf[2], mx: lm[0], my: lm[1], mz: lm[2], bw: None,
            })],
        );
        input.connectors.insert("1".into(), ConnectorElement {
            id: 1, node_i: 1, node_j: 2, k_axial: 3e4, k_shear: 2e4, k_moment: 1e3,
            k_shear_z: 2e4, k_bend_y: 4e3, k_bend_z: 4e3,
        });
        solve_3d(&input).unwrap()
    };
    let id = rot3([0.0, 0.0, 1.0], 0.0);
    let r0 = solve(&id);
    for (axis, angle) in [([1.0, 2.0, 3.0], 0.7), ([-0.3, 1.0, 0.2], 2.1), ([0.0, 0.0, 1.0], -1.1)] {
        let rm = rot3(axis, angle);
        let r = solve(&rm);
        for d0 in &r0.displacements {
            let d = r.displacements.iter().find(|d| d.node_id == d0.node_id).unwrap();
            let u = apply(&rm, [d0.ux, d0.uy, d0.uz]);
            let t = apply(&rm, [d0.rx, d0.ry, d0.rz]);
            let got = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
            let want = [u[0], u[1], u[2], t[0], t[1], t[2]];
            for k in 0..6 {
                assert!((got[k] - want[k]).abs() < 1e-10, "node {} dof {k}: {} vs {}", d0.node_id, got[k], want[k]);
            }
        }
        for q0 in &r0.reactions {
            let q = r.reactions.iter().find(|q| q.node_id == q0.node_id).unwrap();
            let fr = apply(&rm, [q0.fx, q0.fy, q0.fz]);
            let mr = apply(&rm, [q0.mx, q0.my, q0.mz]);
            let got = [q.fx, q.fy, q.fz, q.mx, q.my, q.mz];
            let want = [fr[0], fr[1], fr[2], mr[0], mr[1], mr[2]];
            for k in 0..6 {
                assert!((got[k] - want[k]).abs() < 1e-8, "reaction {} comp {k}: {} vs {}", q0.node_id, got[k], want[k]);
            }
        }
    }
}

// ─── every assembly path agrees ─────────────────────────────────────────────

fn assert_same(a: &[f64], b: &[f64], label: &str) {
    assert_eq!(a.len(), b.len(), "{label}: size");
    let scale = a.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    for (i, (x, y)) in a.iter().zip(b).enumerate() {
        assert!((x - y).abs() <= 1e-12 * scale, "{label}: entry {i}: {x} vs {y}");
    }
}

/// Dense, sparse, triplet and parallel assemblers place connector stiffness identically:
/// frame (3 DOFs/node) and all-truss (2) models in 2D, warping (7) and all-truss
/// (3) in 3D.
#[test]
fn connector_assembly_paths_agree() {
    use dedaliano_engine::solver::assembly::{assemble_2d, assemble_3d, assemble_sparse_2d, assemble_sparse_3d};
    use dedaliano_engine::solver::dof::DofNumbering;
    use dedaliano_engine::solver::sparse_assembly::{assemble_2d_sparse, assemble_elements_parallel_2d, assemble_stiffness_sparse_3d_parallel};
    use dedaliano_engine::linalg::sparse::CscMatrix;

    let ff = |k: &[f64], n: usize, nf: usize| -> Vec<f64> {
        (0..nf * nf).map(|t| k[(t / nf) * n + t % nf]).collect()
    };
    for ty in ["frame", "truss"] {
        let mut input = make_input(
            vec![(1, 0.0, 0.0), (2, 1.5, 0.8), (3, 3.0, 0.2), (4, 1.5, 0.8)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 1e-4)],
            vec![(1, ty, 2, 3, 1, 1, false, false), (2, ty, 1, 3, 1, 1, false, false)],
            vec![(1, 1, "pinned"), (2, 3, "pinned")],
            vec![],
        );
        let ks = if ty == "frame" { 2e4 } else { 0.0 };
        input.connectors.insert("1".into(), connector(1, 1, 2, 3e4, ks, 4e3));
        input.connectors.insert("2".into(), connector(2, 2, 4, 1e4, 5e3, 6e3));
        let dof = DofNumbering::build_2d(&input);
        let (n, nf) = (dof.n_total, dof.n_free);
        let dense = ff(&assemble_2d(&input, &dof).k, n, nf);
        assert_same(&dense, &assemble_sparse_2d(&input, &dof).k_ff.to_dense_symmetric(), &format!("2D {ty} sparse"));
        let t = assemble_2d_sparse(&input, &dof).triplets;
        let trip = CscMatrix::from_triplets(nf, &t.rows, &t.cols, &t.vals).to_dense_symmetric();
        assert_same(&dense, &trip, &format!("2D {ty} triplets"));
        let t = assemble_elements_parallel_2d(&input, &dof).triplets;
        let par = CscMatrix::from_triplets(nf, &t.rows, &t.cols, &t.vals).to_dense_symmetric();
        assert_same(&dense, &par, &format!("2D {ty} parallel triplets"));
    }
    for (ty, warp) in [("frame", true), ("truss", false)] {
        let mut input = make_3d_input(
            vec![(1, 0.0, 0.0, 0.0), (2, 1.2, 0.7, -0.5), (3, 2.5, 1.0, 0.4), (4, 1.2, 0.7, -0.5)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 2e-4, 1e-4, 1e-4)],
            vec![(1, ty, 2, 3, 1, 1), (2, ty, 1, 3, 1, 1)],
            vec![(1, vec![true, true, true, false, false, false]), (3, vec![true, true, true, false, false, false])],
            vec![],
        );
        if warp {
            input.sections.get_mut("1").unwrap().cw = Some(1e-7);
        }
        let (ks, ksz) = if ty == "frame" { (2e4, 3e4) } else { (0.0, 0.0) };
        input.connectors.insert("1".into(), ConnectorElement {
            id: 1, node_i: 1, node_j: 2, k_axial: 3e4, k_shear: ks, k_moment: 1e3,
            k_shear_z: ksz, k_bend_y: 4e3, k_bend_z: 5e3,
        });
        input.connectors.insert("2".into(), connector(2, 2, 4, 1e4, 5e3, 6e3));
        let dof = DofNumbering::build_3d(&input);
        assert_eq!(dof.dofs_per_node, if warp { 7 } else { 3 });
        let (n, nf) = (dof.n_total, dof.n_free);
        let asm = assemble_3d(&input, &dof);
        let mut dense = ff(&asm.k, n, nf);
        let mut sparse = assemble_sparse_3d(&input, &dof, false).k_ff.to_dense_symmetric();
        let mut par = assemble_stiffness_sparse_3d_parallel(&input, &dof, false).k_ff.to_dense_symmetric();
        // The artificial stiffness on floating warping DOFs is scaled by the
        // largest diagonal over all DOFs (dense) or the free ones (sparse); it is
        // not connector stiffness, so leave it out.
        for &d in &asm.artificial_dofs {
            dense[d * nf + d] = 0.0;
            sparse[d * nf + d] = 0.0;
            par[d * nf + d] = 0.0;
        }
        assert_same(&dense, &sparse, &format!("3D {ty} sparse"));
        assert_same(&dense, &par, &format!("3D {ty} parallel"));
    }
}
