//! Issue #1367: a rotation is an orphan (held by the artificial spring) only
//! when its stiffness is round-off of its own node's rotational stiffness,
//! never of the whole model's.

use crate::common;

use common::{make_3d_input, make_input};
use dedaliano_engine::solver::assembly::{assemble_stiffness_2d, assemble_stiffness_3d, assemble_stiffness_sparse_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::sparse_assembly::{assemble_stiffness_sparse_2d, assemble_stiffness_sparse_3d_parallel};
use dedaliano_engine::types::*;

const L: f64 = 4.0;
const E_SOFT: f64 = 10_000.0;
const I_SOFT: f64 = 1e-9;
const P: f64 = 1e-3;

fn ei_soft() -> f64 {
    E_SOFT * 1000.0 * I_SOFT
}

fn propped_cantilever_end_rotation() -> f64 {
    P * L * L / (32.0 * ei_soft())
}

fn point_3d(element_id: usize, a: f64, py: f64, pz: f64) -> SolverLoad3D {
    SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id, a, py, pz })
}

fn nodal_3d(node_id: usize, f: [f64; 6]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None })
}

fn soft_propped_cantilever_3d(pad: bool, loads: Vec<SolverLoad3D>) -> SolverInput3D {
    let fixed = vec![true; 6];
    let pinned = vec![true, true, true, false, false, false];
    let mut nodes = vec![(1, 0.0, 0.0, 0.0), (2, L, 0.0, 0.0)];
    let mut elems = vec![(1, "frame", 1, 2, 1, 1)];
    let mut sups = vec![(1, fixed.clone()), (2, pinned.clone())];
    if pad {
        nodes.extend([(3, 0.0, 10.0, 0.0), (4, 0.1, 10.0, 0.0)]);
        elems.push((2, "frame", 3, 4, 2, 2));
        sups.extend([(3, fixed), (4, pinned)]);
    }
    make_3d_input(
        nodes,
        vec![(1, E_SOFT, 0.3), (2, 4e8, 0.3)],
        vec![(1, 0.01, I_SOFT, I_SOFT, I_SOFT), (2, 0.1, 0.01, 0.01, 0.01)],
        elems,
        sups,
        loads,
    )
}

fn soft_propped_cantilever_2d(pad: bool, loads: Vec<SolverLoad>) -> SolverInput {
    let mut nodes = vec![(1, 0.0, 0.0), (2, L, 0.0)];
    let mut elems = vec![(1, "frame", 1, 2, 1, 1, false, false)];
    let mut sups = vec![(1, 1, "fixed"), (2, 2, "pinned")];
    if pad {
        nodes.extend([(3, 0.0, 10.0), (4, 0.1, 10.0)]);
        elems.push((2, "frame", 3, 4, 2, 2, false, false));
        sups.extend([(3, 3, "fixed"), (4, 4, "pinned")]);
    }
    make_input(nodes, vec![(1, E_SOFT, 0.3), (2, 4e8, 0.3)], vec![(1, 0.01, I_SOFT), (2, 0.1, 0.01)], elems, sups, loads)
}

fn rot_dofs_3d(input: &SolverInput3D, node: usize) -> Vec<usize> {
    let dn = DofNumbering::build_3d(input);
    (3..6).filter_map(|l| dn.global_dof(node, l)).collect()
}

fn artificial_3d(input: &SolverInput3D) -> [Vec<usize>; 3] {
    let dn = DofNumbering::build_3d(input);
    let mut out = [
        assemble_stiffness_3d(input, &dn).artificial_dofs,
        assemble_stiffness_sparse_3d(input, &dn, true).artificial_dofs,
        assemble_stiffness_sparse_3d_parallel(input, &dn, true).artificial_dofs,
    ];
    for v in out.iter_mut() {
        v.sort_unstable();
    }
    out
}

fn artificial_2d(input: &SolverInput) -> [Vec<usize>; 2] {
    let dn = DofNumbering::build_2d(input);
    let mut out = [assemble_stiffness_2d(input, &dn).artificial_dofs, assemble_stiffness_sparse_2d(input, &dn).artificial_dofs];
    for v in out.iter_mut() {
        v.sort_unstable();
    }
    out
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs()
}

#[test]
fn soft_rotation_beside_a_stiff_pad_is_not_locked_3d() {
    let theta = propped_cantilever_end_rotation();
    let padded = soft_propped_cantilever_3d(true, vec![point_3d(1, L / 2.0, P, 0.0)]);
    let plain = soft_propped_cantilever_3d(false, vec![point_3d(1, L / 2.0, P, 0.0)]);
    for (path, art) in artificial_3d(&padded).iter().enumerate() {
        assert!(art.is_empty(), "assembler {path} held real rotations with the artificial spring: {art:?}");
    }
    let rz_plain = solve_3d(&plain).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().rz;
    let rz = solve_3d(&padded).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().rz;
    assert!(rel(rz_plain.abs(), theta) < 1e-9, "unpadded rz {rz_plain}, closed form P·L²/(32·EI) = {theta}");
    assert!(rel(rz, rz_plain) < 1e-9 && rel(rz.abs(), theta) < 1e-9, "padded rz {rz}, unpadded {rz_plain}, closed form {theta}");
}

#[test]
fn moment_on_a_soft_rotation_beside_a_stiff_pad_solves_3d() {
    let m = 1e-4;
    let padded = soft_propped_cantilever_3d(true, vec![nodal_3d(2, [0.0, 0.0, 0.0, 0.0, 0.0, m])]);
    let rz = solve_3d(&padded).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().rz;
    let theta = m * L / (4.0 * ei_soft());
    assert!(rel(rz, theta) < 1e-9, "rz {rz}, closed form M·L/(4·EI) = {theta}");
}

#[test]
fn issue_1367_model_with_a_force_load_matches_the_unpadded_model() {
    let fixed = vec![true; 6];
    let node2 = vec![true, true, true, false, false, true];
    let build = |pad: bool| {
        let mut nodes = vec![
            (1, 34.50850527797162, 23.95496927621093, 33.61405218206383),
            (2, -22.507957548977608, -46.28478813646979, 1.3197412788959326),
        ];
        let mut elems = vec![(1, "frame", 1, 2, 3, 1)];
        let mut sups = vec![(1, fixed.clone()), (2, node2.clone())];
        if pad {
            nodes.extend([(101, 200.0, 0.0, 0.0), (102, 200.05, 0.0, 0.0)]);
            elems.push((101, "frame", 101, 102, 1, 3));
            sups.extend([(101, fixed.clone()), (102, vec![true, true, true, false, false, false])]);
        }
        make_3d_input(
            nodes,
            vec![(1, 429795355.74485034, 0.3648387936541636), (3, 10644.081840968833, 0.22741339478810724)],
            vec![
                (1, 0.017120662642133716, 5.53292686103114e-8, 3.064796139771744e-8, 0.0000013286453327475972),
                (3, 0.012780568660367421, 0.007747758692538699, 7.309547532074366e-8, 0.000010456647151638618),
            ],
            elems,
            sups,
            vec![point_3d(1, 40.0, 1e-3, 1e-3)],
        )
    };
    let padded = build(true);
    let plain = build(false);
    let rots = rot_dofs_3d(&padded, 2);
    for (path, art) in artificial_3d(&padded).iter().enumerate() {
        assert!(!art.iter().any(|d| rots.contains(d)), "assembler {path} locked node 2's rotations: {art:?}");
    }
    let a = solve_3d(&plain).unwrap();
    let b = solve_3d(&padded).unwrap();
    let da = a.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let db = b.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(da.rx.abs() > 0.1, "unpadded rx {}", da.rx);
    assert!(rel(db.rx, da.rx) < 1e-8 && rel(db.ry, da.ry) < 1e-8, "padded (rx, ry) = ({}, {}), unpadded ({}, {})", db.rx, db.ry, da.rx, da.ry);
}

#[test]
fn soft_rotation_beside_a_stiff_pad_is_not_locked_2d() {
    let theta = propped_cantilever_end_rotation();
    let load = || vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a: L / 2.0, p: P, px: None, my: None })];
    let padded = soft_propped_cantilever_2d(true, load());
    let plain = soft_propped_cantilever_2d(false, load());
    for (path, art) in artificial_2d(&padded).iter().enumerate() {
        assert!(art.is_empty(), "2D assembler {path} held real rotations with the artificial spring: {art:?}");
    }
    let ry_plain = solve_2d(&plain).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    let ry = solve_2d(&padded).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    assert!(rel(ry_plain.abs(), theta) < 1e-9, "unpadded ry {ry_plain}, closed form {theta}");
    assert!(rel(ry, ry_plain) < 1e-9, "padded ry {ry}, unpadded {ry_plain}");
}

#[test]
fn fully_released_rotation_is_still_an_orphan_3d() {
    let mut input = soft_propped_cantilever_3d(false, vec![point_3d(1, L / 2.0, P, 0.0)]);
    let e = input.elements.get_mut("1").unwrap();
    e.release_my_end = true;
    e.release_mz_end = true;
    e.release_t_end = true;
    let rots = rot_dofs_3d(&input, 2);
    for (path, art) in artificial_3d(&input).iter().enumerate() {
        assert_eq!(art, &rots, "assembler {path}");
    }
    let rz = solve_3d(&input).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().rz;
    assert!(rz.abs() < 1e-9 * propped_cantilever_end_rotation(), "an orphan rotation carries no load: rz {rz}");
    input.loads = vec![nodal_3d(2, [0.0, 0.0, 0.0, 0.0, 0.0, 1e-4])];
    let err = solve_3d(&input).unwrap_err();
    assert!(err.contains("Nodal moment at node 2 is not supported"), "{err}");
}

#[test]
fn bending_released_rotation_keeps_its_torsion_3d() {
    let mut input = soft_propped_cantilever_3d(false, vec![nodal_3d(2, [0.0, 0.0, 0.0, 1e-6, 0.0, 0.0])]);
    let e = input.elements.get_mut("1").unwrap();
    e.release_my_end = true;
    e.release_mz_end = true;
    let rots = rot_dofs_3d(&input, 2);
    for (path, art) in artificial_3d(&input).iter().enumerate() {
        assert_eq!(art, &rots[1..].to_vec(), "assembler {path}");
    }
    let rx = solve_3d(&input).unwrap().displacements.iter().find(|d| d.node_id == 2).unwrap().rx;
    let gj = E_SOFT * 1000.0 / (2.0 * 1.3) * I_SOFT;
    assert!(rel(rx, 1e-6 * L / gj) < 1e-9, "rx {rx}, closed form T·L/(GJ) = {}", 1e-6 * L / gj);
    input.loads = vec![nodal_3d(2, [0.0, 0.0, 0.0, 0.0, 1e-4, 0.0])];
    let err = solve_3d(&input).unwrap_err();
    assert!(err.contains("Nodal moment at node 2 is not supported"), "{err}");
}

#[test]
fn truss_only_rotation_is_still_an_orphan_2d() {
    let mut input = soft_propped_cantilever_2d(false, vec![]);
    input.nodes.insert("5".into(), SolverNode { id: 5, x: L, z: 3.0 });
    input.elements.insert(
        "3".into(),
        SolverElement { id: 3, elem_type: "truss".into(), node_i: 2, node_j: 5, material_id: 1, section_id: 1, hinge_start: false, hinge_end: false },
    );
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -1e-3, my: 0.0 })];
    input.supports.insert("9".into(), SolverSupport { id: 9, node_id: 5, support_type: "rollerZ".into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None });
    let dn = DofNumbering::build_2d(&input);
    let r5 = dn.global_dof(5, 2).unwrap();
    for (path, art) in artificial_2d(&input).iter().enumerate() {
        assert_eq!(art, &vec![r5], "2D assembler {path}");
    }
    let uz5 = solve_2d(&input).unwrap().displacements.iter().find(|d| d.node_id == 5).unwrap().uz;
    let expected = -1e-3 * 3.0 / (E_SOFT * 1000.0 * 0.01);
    assert!(rel(uz5, expected) < 1e-9, "uz5 {uz5}, closed form -F·L/(EA) = {expected}");
    input.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: 0.0, my: 1e-4 })];
    let err = solve_2d(&input).unwrap_err();
    assert!(err.contains("not supported") || err.contains("Nodal moment"), "{err}");
}
