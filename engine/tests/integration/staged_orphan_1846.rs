use crate::common::{make_3d_input, make_input};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d, SPARSE_THRESHOLD};
use dedaliano_engine::solver::staged::{solve_staged_2d, solve_staged_3d};
use dedaliano_engine::types::*;

fn stage_3d(input: &SolverInput3D) -> StagedInput3D {
    let mut value = serde_json::to_value(input).unwrap();
    value["stages"] = serde_json::json!([{
        "name": "all", "elementsAdded": input.elements.values().map(|e| e.id).collect::<Vec<_>>(),
        "supportsAdded": input.supports.values().map(|s| s.node_id).collect::<Vec<_>>(),
        "loadIndices": (0..input.loads.len()).collect::<Vec<_>>()
    }]);
    serde_json::from_value(value).unwrap()
}

fn stage_2d(input: &SolverInput) -> StagedInput {
    let mut value = serde_json::to_value(input).unwrap();
    value["stages"] = serde_json::json!([{
        "name": "all", "elementsAdded": input.elements.values().map(|e| e.id).collect::<Vec<_>>(),
        "supportsAdded": input.supports.values().map(|s| s.node_id).collect::<Vec<_>>(),
        "loadIndices": (0..input.loads.len()).collect::<Vec<_>>()
    }]);
    serde_json::from_value(value).unwrap()
}

fn pad_3d(input: &mut SolverInput3D, count: usize) {
    for i in 0..count {
        let a = 100 + 2 * i;
        let b = a + 1;
        let mut node = input.nodes["1"].clone();
        node.id = a;
        input.nodes.insert(a.to_string(), node.clone());
        node.id = b;
        node.x += 1.0;
        input.nodes.insert(b.to_string(), node);
        let mut element = input.elements["1"].clone();
        element.id = a;
        element.node_i = a;
        element.node_j = b;
        element.release_my_start = false;
        element.release_my_end = false;
        element.release_mz_start = false;
        element.release_mz_end = false;
        element.release_t_start = false;
        element.release_t_end = false;
        input.elements.insert(a.to_string(), element);
        let mut support = input.supports["1"].clone();
        support.node_id = a;
        input.supports.insert(a.to_string(), support);
    }
}

fn pad_2d(input: &mut SolverInput, pads: usize) {
    let scale = (input.nodes["2"].x.powi(2) + input.nodes["2"].z.powi(2)).sqrt() / 4.0;
    for i in 0..pads {
        let a = 100 + 2 * i;
        let b = a + 1;
        let mut node = input.nodes["1"].clone();
        node.id = a;
        input.nodes.insert(a.to_string(), node.clone());
        node.id = b;
        node.x += scale;
        input.nodes.insert(b.to_string(), node);
        let mut e = input.elements["1"].clone();
        e.id = a;
        e.node_i = a;
        e.node_j = b;
        e.hinge_end = false;
        input.elements.insert(a.to_string(), e);
        let mut s = input.supports["1"].clone();
        s.id = a;
        s.node_id = a;
        input.supports.insert(a.to_string(), s);
    }
}

fn check_3d(input: &SolverInput3D) {
    let linear = solve_3d(input).unwrap();
    assert!(dedaliano_engine::solver::kinematic::analyze_kinematics_3d(input).is_solvable);
    let staged = solve_staged_3d(&stage_3d(input)).unwrap();
    for a in &linear.displacements {
        let b = staged
            .final_results
            .displacements
            .iter()
            .find(|b| b.node_id == a.node_id)
            .unwrap();
        for (x, y) in [a.ux, a.uy, a.uz, a.rx, a.ry, a.rz]
            .into_iter()
            .zip([b.ux, b.uy, b.uz, b.rx, b.ry, b.rz])
        {
            assert!(
                (x - y).abs() <= 1e-9 * x.abs().max(1e-10),
                "node {}: linear={x}, staged={y}",
                a.node_id
            );
        }
    }
}

#[test]
#[ignore = "known wrong result: #1846"]
fn issue_1846_exact_original_and_unit_copy_dense_and_sparse() {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-orphan-1846.json")).unwrap();
    for key in ["staged:1846:original", "staged:1846:transformed"] {
        for pads in [0, 11] {
            let mut input: SolverInput3D = serde_json::from_value(fixtures[key].clone()).unwrap();
            pad_3d(&mut input, pads);
            assert_eq!(
                DofNumbering::build_3d(&input).n_free >= SPARSE_THRESHOLD,
                pads == 11
            );
            check_3d(&input);
        }
    }
}

#[test]
#[ignore = "known wrong result: #1846"]
fn issue_1846_release_family_3d() {
    for scale in [1.0_f64, 1e-3, 1e3] {
        for axis in 0..4 {
            for release in 0..5 {
                for pads in [0, 10, 11] {
                    let mut end = [0.0; 3];
                    if axis == 3 {
                        end = [scale, 2.0 * scale, 3.0 * scale];
                    } else {
                        end[axis] = 4.0 * scale;
                    }
                    let mut input = make_3d_input(
                        vec![(1, 0.0, 0.0, 0.0), (2, end[0], end[1], end[2])],
                        vec![(1, 10_000.0 / scale.powi(2), 0.3)],
                        vec![(
                            1,
                            0.01 * scale.powi(2),
                            1e-9 * scale.powi(4),
                            2e-9 * scale.powi(4),
                            3e-9 * scale.powi(4),
                        )],
                        vec![(1, "frame", 1, 2, 1, 1)],
                        vec![
                            (1, vec![true; 6]),
                            (2, vec![true, true, true, false, false, false]),
                        ],
                        vec![SolverLoad3D::PointOnElement(SolverPointLoad3D {
                            element_id: 1,
                            a: scale,
                            px: 0.0,
                            py: 1e-3,
                            pz: 2e-3,
                        })],
                    );
                    let e = input.elements.get_mut("1").unwrap();
                    e.release_my_end = release == 1 || release >= 3;
                    e.release_mz_end = release == 2 || release >= 3;
                    e.release_t_end = release == 4;
                    pad_3d(&mut input, pads);
                    assert_eq!(
                        DofNumbering::build_3d(&input).n_free >= SPARSE_THRESHOLD,
                        pads == 11
                    );
                    check_3d(&input);
                    if release == 4 {
                        for direction in 0..3 {
                            let mut loaded = input.clone();
                            let mut moment = [0.0; 3];
                            moment[direction] = 1e-10 * scale;
                            loaded.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                                node_id: 2,
                                fx: 0.0,
                                fy: 0.0,
                                fz: 0.0,
                                mx: moment[0],
                                my: moment[1],
                                mz: moment[2],
                                bw: None,
                            })];
                            assert!(solve_3d(&loaded).unwrap_err().contains("Nodal moment"));
                            assert!(solve_staged_3d(&stage_3d(&loaded))
                                .unwrap_err()
                                .contains("Nodal moment"));
                        }
                    }
                }
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #1846"]
fn issue_1846_release_family_2d_and_spring_boundary() {
    for scale in [1.0_f64, 1e-3, 1e3] {
        for angle in [0.0_f64, 0.7] {
            for hinged in [false, true] {
                for spring in [0.0, 1e-8, 1.0] {
                    for pads in [0, 20, 21] {
                        let mut input = make_input(
                            vec![
                                (1, 0.0, 0.0),
                                (2, 4.0 * scale * angle.cos(), 4.0 * scale * angle.sin()),
                            ],
                            vec![(1, 10_000.0 / scale.powi(2), 0.3)],
                            vec![(1, 0.01 * scale.powi(2), 1e-9 * scale.powi(4))],
                            vec![(1, "frame", 1, 2, 1, 1, false, hinged)],
                            vec![(1, 1, "fixed"), (2, 2, "spring")],
                            vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
                                element_id: 1,
                                a: scale,
                                p: 1e-3,
                                px: None,
                                my: None,
                            })],
                        );
                        input.supports.get_mut("2").unwrap().kz = Some(spring * scale);
                        if spring > 0.0 {
                            input.loads.push(SolverLoad::Nodal(SolverNodalLoad {
                                node_id: 2,
                                fx: 0.0,
                                fz: 0.0,
                                my: 1e-10 * scale,
                            }));
                        }
                        pad_2d(&mut input, pads);
                        assert_eq!(
                            DofNumbering::build_2d(&input).n_free >= SPARSE_THRESHOLD,
                            pads == 21
                        );
                        let linear = solve_2d(&input).unwrap();
                        assert!(
                            dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&input)
                                .is_solvable
                        );
                        let dn = DofNumbering::build_2d(&input);
                        let r = dn.global_dof(2, 2).unwrap();
                        let expected_orphan = hinged && spring == 0.0;
                        let dense = dedaliano_engine::solver::assembly::assemble_2d(&input, &dn);
                        let sparse = dedaliano_engine::solver::sparse_assembly::assemble_2d_sparse(
                            &input, &dn,
                        );
                        let parallel = dedaliano_engine::solver::sparse_assembly::assemble_elements_parallel_2d(&input, &dn);
                        for artificial in [
                            &dense.artificial_dofs,
                            &sparse.artificial_dofs,
                            &parallel.artificial_dofs,
                        ] {
                            assert_eq!(artificial.contains(&r), expected_orphan);
                        }
                        let staged = solve_staged_2d(&stage_2d(&input)).unwrap();
                        if hinged && spring > 0.0 {
                            let expected = 1e-10 / spring;
                            let actual = staged
                                .final_results
                                .displacements
                                .iter()
                                .find(|d| d.node_id == 2)
                                .unwrap()
                                .ry;
                            assert!(
                                (actual - expected).abs() <= 1e-9 * expected,
                                "spring-only rotation: {actual}, expected {expected}"
                            );
                        }
                        if hinged && spring == 0.0 {
                            let mut loaded = input.clone();
                            loaded.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                                node_id: 2,
                                fx: 0.0,
                                fz: 0.0,
                                my: 1e-10 * scale,
                            })];
                            assert!(solve_2d(&loaded).unwrap_err().contains("Nodal moment"));
                            assert!(solve_staged_2d(&stage_2d(&loaded))
                                .unwrap_err()
                                .contains("Nodal moment"));
                        }
                        let a = linear
                            .displacements
                            .iter()
                            .find(|d| d.node_id == 2)
                            .unwrap()
                            .ry;
                        let b = staged
                            .final_results
                            .displacements
                            .iter()
                            .find(|d| d.node_id == 2)
                            .unwrap()
                            .ry;
                        assert!((a - b).abs() <= 1e-9 * a.abs().max(1e-10), "scale={scale}, hinged={hinged}, spring={spring}, pads={pads}: linear={a}, staged={b}");
                    }
                }
            }
        }
    }
}

#[test]
#[ignore = "known wrong result: #1846"]
fn issue_1846_nonlinear_entry_points_keep_real_rotations_and_true_orphans() {
    use dedaliano_engine::solver::corotational::{solve_corotational_2d, solve_corotational_3d};
    for scale in [1.0_f64, 1e-3, 1e3] {
        for release in 0..5 {
            let mut input = make_3d_input(
                vec![(1, 0.0, 0.0, 0.0), (2, 4.0 * scale, 0.0, 0.0)],
                vec![(1, 10_000.0 / scale.powi(2), 0.3)],
                vec![(
                    1,
                    0.01 * scale.powi(2),
                    1e-9 * scale.powi(4),
                    2e-9 * scale.powi(4),
                    3e-9 * scale.powi(4),
                )],
                vec![(1, "frame", 1, 2, 1, 1)],
                vec![
                    (1, vec![true; 6]),
                    (2, vec![true, true, true, false, false, false]),
                ],
                vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id: 2,
                    fx: 0.0,
                    fy: 0.0,
                    fz: 0.0,
                    mx: if release == 4 { 0.0 } else { 1e-6 * scale },
                    my: 0.0,
                    mz: 0.0,
                    bw: None,
                })],
            );
            let e = input.elements.get_mut("1").unwrap();
            e.release_my_end = release == 1 || release >= 3;
            e.release_mz_end = release == 2 || release >= 3;
            e.release_t_end = release == 4;
            let linear = solve_3d(&input).unwrap();
            check_3d(&input);
            let material = NonlinearMaterialInput3D {
                solver: input.clone(),
                material_models: Default::default(),
                section_capacities: Default::default(),
                max_iter: 20,
                tolerance: 1e-12,
                n_increments: 1,
            };
            let nonlinear =
                dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d(
                    &material,
                )
                .unwrap();
            if release == 0 {
                let corotational = solve_corotational_3d(&input, 20, 1e-12, 1, false).unwrap();
                assert!(corotational.converged);
            }
            assert!(nonlinear.converged);
            let a = linear
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .rx;
            let b = nonlinear
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .rx;
            assert!(
                (a - b).abs() <= 1e-9 * a.abs().max(1e-10),
                "3D release={release}, scale={scale}: {a} vs {b}"
            );
        }
        for spring in [0.0, 1e-8, 1.0] {
            let input = make_input(
                vec![(1, 0.0, 0.0), (2, 4.0 * scale, 0.0)],
                vec![(1, 10_000.0 / scale.powi(2), 0.3)],
                vec![(1, 0.01 * scale.powi(2), 1e-9 * scale.powi(4))],
                vec![(1, "frame", 1, 2, 1, 1, false, true)],
                vec![(1, 1, "fixed"), (2, 2, "spring")],
                vec![SolverLoad::Nodal(SolverNodalLoad {
                    node_id: 2,
                    fx: 0.0,
                    fz: 0.0,
                    my: if spring == 0.0 { 0.0 } else { 1e-6 * scale },
                })],
            );
            let mut input = input;
            input.supports.get_mut("2").unwrap().kz = Some(spring * scale);
            let linear = solve_2d(&input).unwrap();
            let nonlinear = solve_corotational_2d(&input, 20, 1e-12, 1, false).unwrap();
            assert!(nonlinear.converged);
            let a = linear
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .ry;
            let b = nonlinear
                .results
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .ry;
            assert!(
                (a - b).abs() <= 1e-9 * a.abs().max(1e-10),
                "2D spring={spring}, scale={scale}: {a} vs {b}"
            );
        }
    }
}

#[test]
#[ignore = "known wrong result: #1846"]
fn issue_1846_inactive_nodes_preserve_positive_springs_and_constraint_stiffness() {
    for constrained in [false, true] {
        let mut input = make_3d_input(
            vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0), (3, 4.0, 0.0, 0.0)],
            vec![(1, 10_000.0, 0.3)],
            vec![(1, 0.01, 1e-9, 2e-9, 3e-9)],
            vec![(1, "frame", 1, 2, 1, 1)],
            vec![(1, vec![true; 6])],
            vec![],
        );
        if constrained {
            input.constraints = serde_json::from_value(serde_json::json!([{"type":"equalDOF", "masterNode":2, "slaveNode":3, "dofs":[0,1,2,3,4,5]}])).unwrap();
            input.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: 0.0,
                fy: 0.0,
                fz: 1e-3,
                mx: 0.0,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })];
        } else {
            let mut s = input.supports["1"].clone();
            s.node_id = 3;
            s.rx = false;
            s.ry = false;
            s.rz = false;
            s.rrx = false;
            s.rry = false;
            s.rrz = false;
            s.kx = Some(1e-8);
            s.ky = Some(1e-8);
            s.kz = Some(1e-8);
            s.krx = Some(1e-8);
            s.kry = Some(1e-8);
            s.krz = Some(1e-8);
            input.supports.insert("3".into(), s);
            input.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 3,
                fx: 1e-8,
                fy: 0.0,
                fz: 0.0,
                mx: 1e-8,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })];
        }
        if !constrained {
            let mut tiny = input.clone();
            let s = tiny.supports.get_mut("3").unwrap();
            s.kx = Some(1e-35);
            s.ky = Some(1e-35);
            s.kz = Some(1e-35);
            s.krx = Some(1e-35);
            s.kry = Some(1e-35);
            s.krz = Some(1e-35);
            tiny.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 3,
                fx: 1e-35,
                fy: 0.0,
                fz: 0.0,
                mx: 1e-35,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })];
            assert_eq!(
                solve_staged_3d(&stage_3d(&tiny)).unwrap_err(),
                solve_3d(&tiny).unwrap_err()
            );
        }
        for pads in [0, 11] {
            let mut padded = input.clone();
            pad_3d(&mut padded, pads);
            if constrained {
                check_3d(&padded);
            } else {
                let staged = solve_staged_3d(&stage_3d(&padded)).unwrap();
                let d = staged
                    .final_results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 3)
                    .unwrap();
                assert!(
                    (d.ux - 1.0).abs() <= 1e-9 && (d.rx - 1.0).abs() <= 1e-9,
                    "spring-only DOFs: {d:?}"
                );
            }
        }

        let mut input = make_input(
            vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 0.0)],
            vec![(1, 10_000.0, 0.3)],
            vec![(1, 0.01, 1e-9)],
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "fixed")],
            vec![],
        );
        if constrained {
            input.constraints = serde_json::from_value(serde_json::json!([{"type":"equalDOF", "masterNode":2, "slaveNode":3, "dofs":[0,1,2]}])).unwrap();
            input.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 0.0,
                fz: 1e-3,
                my: 0.0,
            })];
        } else {
            let mut s = input.supports["1"].clone();
            s.id = 3;
            s.node_id = 3;
            s.support_type = "spring".into();
            s.kx = Some(1e-8);
            s.ky = Some(1e-8);
            s.kz = Some(1e-8);
            input.supports.insert("3".into(), s);
            input.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3,
                fx: 1e-8,
                fz: 0.0,
                my: 1e-8,
            })];
        }
        if !constrained {
            let mut tiny = input.clone();
            let s = tiny.supports.get_mut("3").unwrap();
            s.kx = Some(1e-35);
            s.ky = Some(1e-35);
            s.kz = Some(1e-35);
            tiny.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 3,
                fx: 1e-35,
                fz: 0.0,
                my: 1e-35,
            })];
            assert_eq!(
                solve_staged_2d(&stage_2d(&tiny)).unwrap_err(),
                solve_2d(&tiny).unwrap_err()
            );
        }
        for pads in [0, 21] {
            let mut input = input.clone();
            pad_2d(&mut input, pads);
            let staged = solve_staged_2d(&stage_2d(&input)).unwrap();
            if !constrained {
                let d = staged
                    .final_results
                    .displacements
                    .iter()
                    .find(|d| d.node_id == 3)
                    .unwrap();
                assert!(
                    (d.ux - 1.0).abs() <= 1e-9 && (d.ry - 1.0).abs() <= 1e-9,
                    "spring-only DOFs: {d:?}"
                );
                continue;
            }
            let linear = solve_2d(&input).unwrap();
            for a in &linear.displacements {
                let b = staged
                    .final_results
                    .displacements
                    .iter()
                    .find(|b| b.node_id == a.node_id)
                    .unwrap();
                for (x, y) in [a.ux, a.uz, a.ry].into_iter().zip([b.ux, b.uz, b.ry]) {
                    assert!(
                        (x - y).abs() <= 1e-9 * x.abs().max(1e-10),
                        "constrained={constrained}, node {}: linear={x}, staged={y}",
                        a.node_id
                    );
                }
            }
        }
    }
}
