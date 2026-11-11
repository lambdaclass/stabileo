use super::{assembly, dof::DofNumbering, linear};
use crate::types::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Case {
    model: String,
    input: SolverInput3D,
    before_displacements: Vec<Displacement3D>,
}

fn cases() -> Vec<Case> {
    serde_json::from_str(include_str!(
        "../../tests/fixtures/1753-frozen-shell-refusals.json"
    ))
    .unwrap()
}

fn max(values: &[f64]) -> f64 {
    values.iter().fold(0.0_f64, |a, x| a.max(x.abs()))
}

fn controls(input: &SolverInput3D) -> (SolverInput3D, SolverInput3D) {
    let mut roller = input.clone();
    let mut drilling = input.clone();
    let pin = input.supports.values().find(|s| s.rx && s.ry).unwrap();
    let pivot = input.nodes.values().find(|n| n.id == pin.node_id).unwrap();
    let corner = input
        .nodes
        .values()
        .filter(|n| n.y == pivot.y)
        .max_by(|a, b| a.x.total_cmp(&b.x))
        .unwrap();
    let mut support = pin.clone();
    support.node_id = corner.id;
    support.rx = false;
    roller.supports.insert("audit-roller".into(), support);
    for node in input.nodes.values() {
        let mut support = pin.clone();
        support.node_id = node.id;
        support.rx = false;
        support.ry = false;
        support.rz = false;
        support.rrz = true;
        drilling
            .supports
            .insert(format!("audit-drilling-{}", node.id), support);
    }
    (roller, drilling)
}

fn physical(results: &[Displacement3D]) -> Vec<f64> {
    results
        .iter()
        .flat_map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry])
        .collect()
}

fn check(index: usize) {
    let case = cases().swap_remove(index);
    let input = &case.input;
    let dof = DofNumbering::build_3d(input);
    let asm =
        assembly::without_artificial_stiffness(|| assembly::assemble_sparse_3d(input, &dof, true));
    let k = asm.k_full.unwrap();
    let pin = input.supports.values().find(|s| s.rx && s.ry).unwrap();
    let pivot = input.nodes.values().find(|n| n.id == pin.node_id).unwrap();
    let mut mode = vec![0.0; dof.n_total];
    for node in input.nodes.values() {
        for (local, value) in [(0, pivot.y - node.y), (1, node.x - pivot.x), (5, 1.0)] {
            mode[dof.global_dof(node.id, local).unwrap()] = value;
        }
    }
    assert!(mode[dof.n_free..].iter().all(|&x| x == 0.0));
    assert!(input
        .nodes
        .values()
        .any(|n| mode[dof.global_dof(n.id, 0).unwrap()] != 0.0));
    let residual = max(&k.sym_mat_vec(&mode)) / (max(&k.values) * max(&mode));
    assert!(residual < 1e-14, "{}: {residual:e}", case.model);
    assert!(linear::solve_3d(input).is_err(), "{}", case.model);
    let mut drilling_only = vec![0.0; dof.n_total];
    for node in input.nodes.values() {
        drilling_only[dof.global_dof(node.id, 5).unwrap()] = 1.0;
    }
    let drilling_residual = max(&k.sym_mat_vec(&drilling_only)) / max(&k.values);
    assert!(drilling_residual > 1e-14);
    let work = mode.iter().zip(&asm.f).map(|(u, f)| u * f).sum::<f64>();
    let work_scale = mode
        .iter()
        .zip(&asm.f)
        .map(|(u, f)| (u * f).abs())
        .sum::<f64>();
    if work_scale == 0.0 {
        assert_eq!(work, 0.0);
    } else {
        assert!(work.abs() / work_scale < 1e-14);
    }
    let mut loaded = input.clone();
    loaded.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: pin.node_id,
        fx: 0.0,
        fy: 0.0,
        fz: 0.0,
        mx: 0.0,
        my: 0.0,
        mz: 1.0,
        bw: None,
    }));
    assert!(linear::solve_3d(&loaded).is_err());
    let (roller, drilling) = controls(input);
    let roller = linear::solve_3d(&roller).unwrap();
    let drilling = linear::solve_3d(&drilling).unwrap();
    let corner = input
        .nodes
        .values()
        .filter(|n| n.y == pivot.y)
        .max_by(|a, b| a.x.total_cmp(&b.x))
        .unwrap();
    let turn = case
        .before_displacements
        .iter()
        .find(|d| d.node_id == corner.id)
        .unwrap()
        .uy
        / (corner.x - pivot.x);
    let mut reference = case.before_displacements.clone();
    for d in &mut reference {
        let node = input.nodes.values().find(|n| n.id == d.node_id).unwrap();
        d.ux -= turn * (pivot.y - node.y);
        d.uy -= turn * (node.x - pivot.x);
    }
    let ids = |d: &[Displacement3D]| d.iter().map(|d| d.node_id).collect::<Vec<_>>();
    assert_eq!(ids(&roller.displacements), ids(&reference));
    assert_eq!(ids(&drilling.displacements), ids(&reference));
    let before = physical(&reference);
    let roller = physical(&roller.displacements);
    let drilling = physical(&drilling.displacements);
    assert_eq!(before.len(), roller.len());
    assert_eq!(before.len(), drilling.len());
    let scale = max(&before);
    assert!(scale > 0.0);
    let error = |values: &[f64]| {
        before
            .iter()
            .zip(values)
            .map(|(a, b)| (a - b).abs() / scale)
            .fold(0.0_f64, f64::max)
    };
    assert!(
        error(&roller) < 1e-6,
        "{}: roller {}",
        case.model,
        error(&roller)
    );
    assert!(
        error(&drilling) < 1e-6,
        "{}: drilling {}",
        case.model,
        error(&drilling)
    );
    eprintln!("{}: physical mechanism residual={residual:e}, load work={work:e}, max|uz|={}, roller error={:e}, drilling error={:e}",
        case.model, max(&case.before_displacements.iter().map(|d| d.uz).collect::<Vec<_>>()), error(&roller), error(&drilling));
}

#[test]
fn frozen_shell_02b13e348ce7e7ef() {
    check(0);
}
#[test]
fn frozen_shell_1ec27e3af1804283() {
    check(1);
}
#[test]
fn frozen_shell_2ef13b8c4e82f579() {
    check(2);
}
#[test]
fn frozen_shell_5c0d30ad3f5e457a() {
    check(3);
}
#[test]
fn frozen_shell_afd76d209a97b31c() {
    check(4);
}
#[test]
fn frozen_shell_c01f6e21e2c0cc35() {
    check(5);
}
#[test]
fn frozen_shell_c1578ad4f1ef88d3() {
    check(6);
}

#[test]
fn frozen_shell_dense_and_sparse_share_the_physical_mechanism() {
    let case = cases().swap_remove(1);
    for (input, stable) in [(&case.input, false), (&controls(&case.input).0, true)] {
        let dof = DofNumbering::build_3d(input);
        let nf = dof.n_free;
        let sparse = assembly::without_artificial_stiffness(|| {
            assembly::assemble_sparse_3d(input, &dof, true)
        });
        let dense = assembly::without_artificial_stiffness(|| assembly::assemble_3d(input, &dof));
        let free: Vec<usize> = (0..nf).collect();
        let mut k = crate::linalg::extract_submatrix(&dense.k, dof.n_total, &free, &free);
        let tags = linear::free_tags(&dof, false);
        let coupling = super::stability::coupling_3d(input, &dof);
        let releases = super::stability::released_rotations_3d(input, &dof);
        let dense_gate =
            super::stability::analyze_dense_with_coupling(&k, nf, &tags, &coupling, &releases);
        let sparse_gate =
            super::stability::analyze_with_coupling(&sparse.k_ff, &tags, &coupling, &releases);
        assert_eq!(dense_gate.is_stable(), stable);
        assert_eq!(sparse_gate.is_stable(), stable);
        if stable {
            let u = crate::linalg::cholesky_solve(&mut k, &dense.f[..nf], nf).unwrap();
            let result = linear::solve_3d(input).unwrap();
            let scale = max(&u);
            let mut error = 0.0_f64;
            for d in &result.displacements {
                for (local, value) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].into_iter().enumerate() {
                    let g = dof.global_dof(d.node_id, local).unwrap();
                    if g < nf {
                        error = error.max((value - u[g]).abs() / scale);
                    }
                }
            }
            assert!(error < 1e-6, "dense/sparse physical response {error:e}");
            eprintln!(
                "dense/sparse corrected pressure control relative displacement error={error:e}"
            );
        }
    }
}
