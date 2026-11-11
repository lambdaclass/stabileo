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

#[test]
fn issue_1846_prestress_inclined_public_refusals_2d_and_3d() {
    for (pads2, pads3) in [(0, 0), (20, 9), (21, 10)] {
        let mut input = make_input(
            vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
            vec![(1, 10_000.0, 0.3)],
            vec![(1, 0.01, 0.001)],
            vec![(1, "frame", 1, 2, 1, 1, false, false)],
            vec![(1, 1, "fixed"), (2, 2, "rollerZ")],
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 1.0,
                fz: 0.0,
                my: 0.0,
            })],
        );
        pad_2d(&mut input, pads2);
        assert_eq!(
            DofNumbering::build_2d(&input).n_free >= SPARSE_THRESHOLD,
            pads2 == 21
        );
        let mut staged = stage_2d(&input);
        let prestress = PrestressLoad {
            element_id: 1,
            force: 1.0,
            eccentricity_i: 0.0,
            eccentricity_j: 0.0,
            profile: TendonProfile::Straight,
            mu: None,
            kappa: None,
        };
        staged.stages[0].prestress_loads.push(prestress.clone());
        let correct = solve_staged_2d(&staged).unwrap();
        let mut equivalent = input.clone();
        equivalent.loads.extend([
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1,
                fx: -1.0,
                fz: 0.0,
                my: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 1.0,
                fz: 0.0,
                my: 0.0,
            }),
        ]);
        let linear = solve_2d(&equivalent).unwrap();
        for d in &linear.displacements {
            let s = correct
                .final_results
                .displacements
                .iter()
                .find(|s| s.node_id == d.node_id)
                .unwrap();
            assert!((d.ux - s.ux).abs() <= 1e-12);
            assert!((d.uz - s.uz).abs() <= 1e-12);
            assert!((d.ry - s.ry).abs() <= 1e-12);
        }
        for angle in [0.0, 30.0, 90.0] {
            let mut inclined = staged.clone();
            let support = inclined.supports.get_mut("2").unwrap();
            support.support_type = "inclinedRoller".into();
            support.angle = Some(angle);
            assert!(solve_staged_2d(&inclined)
                .unwrap_err()
                .contains("Inclined supports are not yet supported"));
        }
        let mut input3 = make_3d_input(
            vec![(1, 0.0, 0.0, 0.0), (2, 4.0, 0.0, 0.0)],
            vec![(1, 10_000.0, 0.3)],
            vec![(1, 0.01, 0.001, 0.002, 0.003)],
            vec![(1, "frame", 1, 2, 1, 1)],
            vec![(1, vec![true; 6])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: 2,
                fx: 1.0,
                fy: 0.0,
                fz: 0.0,
                mx: 0.0,
                my: 0.0,
                mz: 0.0,
                bw: None,
            })],
        );
        pad_3d(&mut input3, pads3);
        assert_eq!(
            DofNumbering::build_3d(&input3).n_free >= SPARSE_THRESHOLD,
            pads3 == 10
        );
        check_3d(&input3);
        let mut inclined3 = stage_3d(&input3);
        inclined3.stages[0].prestress_loads.push(prestress);
        for normal in [[1.0, 0.0, 0.0], [1.0, 2.0, 3.0]] {
            let support = inclined3.supports.get_mut("1").unwrap();
            support.is_inclined = Some(true);
            support.normal_x = Some(normal[0]);
            support.normal_y = Some(normal[1]);
            support.normal_z = Some(normal[2]);
            assert!(solve_staged_3d(&inclined3)
                .unwrap_err()
                .contains("Inclined supports are not yet supported"));
        }
    }
}

fn review_model(dim: usize, pads: usize) -> serde_json::Value {
    let mut v = serde_json::json!({
        "nodes":{"1":{"id":1,"x":0.0,"y":0.0,"z":0.0},"2":{"id":2,"x":4.0,"y":0.0,"z":0.0},"3":{"id":3,"x":8.0,"y":0.0,"z":0.0},"4":{"id":4,"x":12.0,"y":0.0,"z":0.0}},
        "materials":{"1":{"id":1,"e":10000.0,"nu":0.3}},
        "sections":{"1":{"id":1,"a":0.01,"iy":0.001,"iz":0.002,"j":0.003}},
        "elements":{"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},"2":{"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},"3":{"id":3,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1}},
        "supports":{"1":{"id":1,"nodeId":1,"type":"fixed","rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
        "loads":[{"type":"nodal","data":{"nodeId":2,"fx":1.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}}]
    });
    for i in 0..pads {
        let a = (100 + 2 * i).to_string();
        let b = (101 + 2 * i).to_string();
        v["nodes"][&a] = serde_json::json!({"id":100+2*i,"x":0.0,"y":0.0,"z":0.0});
        v["nodes"][&b] = serde_json::json!({"id":101+2*i,"x":4.0,"y":0.0,"z":0.0});
        let mut e = v["elements"]["1"].clone();
        e["id"] = serde_json::json!(100 + 2 * i);
        e["nodeI"] = serde_json::json!(100 + 2 * i);
        e["nodeJ"] = serde_json::json!(101 + 2 * i);
        v["elements"][&a] = e;
        let mut s = v["supports"]["1"].clone();
        s["id"] = serde_json::json!(100 + 2 * i);
        s["nodeId"] = serde_json::json!(100 + 2 * i);
        v["supports"][&a] = s;
    }
    if dim == 2 {
        for l in v["loads"].as_array_mut().unwrap() {
            for key in ["fy", "mz"] {
                l["data"].as_object_mut().unwrap().remove(key);
            }
        }
        for n in v["nodes"].as_object_mut().unwrap().values_mut() {
            n.as_object_mut().unwrap().remove("y");
        }
        for e in v["elements"].as_object_mut().unwrap().values_mut() {
            e["hingeStart"] = false.into();
            e["hingeEnd"] = false.into();
        }
    }
    v
}

fn review_stages(v: &mut serde_json::Value, loads_first: bool) {
    let initial: Vec<_> = v["elements"]
        .as_object()
        .unwrap()
        .values()
        .filter(|e| e["id"] != 2 && e["id"] != 3)
        .map(|e| e["id"].clone())
        .collect();
    let supports: Vec<_> = v["supports"]
        .as_object()
        .unwrap()
        .values()
        .map(|s| s["nodeId"].clone())
        .collect();
    v["stages"] = serde_json::json!([
        {"name":"first","elementsAdded":initial,"supportsAdded":supports,"loadIndices":if loads_first {vec![0]} else {vec![]}},
        {"name":"second","elementsAdded":[2,3],"loadIndices":if loads_first {vec![]} else {vec![0]}}
    ]);
}

fn review_solve(dim: usize, mut v: serde_json::Value) -> Result<serde_json::Value, String> {
    if dim == 2 {
        for l in v["loads"].as_array_mut().unwrap() {
            for key in ["fy", "mz"] {
                l["data"].as_object_mut().unwrap().remove(key);
            }
        }
    }
    if dim == 2 {
        solve_staged_2d(&serde_json::from_value(v).unwrap())
            .map(|r| serde_json::to_value(r).unwrap())
    } else {
        solve_staged_3d(&serde_json::from_value(v).unwrap())
            .map(|r| serde_json::to_value(r).unwrap())
    }
}

#[test]
fn issue_1846_review_partial_constraints_and_multistage_erection() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            for partial in [false, true] {
                let dofs = if partial {
                    vec![0]
                } else {
                    (0..if dim == 2 { 3 } else { 6 }).collect()
                };
                for kind in [
                    "equalDOF",
                    "rigidLink",
                    "diaphragm",
                    "eccentricConnection",
                    "linearMPC",
                ] {
                    if kind == "diaphragm" && dim == 2 {
                        continue;
                    }
                    let mut v = review_model(dim, pads);
                    let (master, slave) = if partial { (2, 3) } else { (3, 4) };
                    let constraint = match kind {
                        "diaphragm" => {
                            serde_json::json!({"type":kind,"masterNode":master,"slaveNodes":[slave],"plane":"XY"})
                        }
                        "eccentricConnection" => {
                            serde_json::json!({"type":kind,"masterNode":master,"slaveNode":slave,"releases":[]})
                        }
                        "linearMPC" => {
                            serde_json::json!({"type":kind,"terms":[{"nodeId":master,"dof":0,"coefficient":1.0},{"nodeId":slave,"dof":0,"coefficient":-1.0}]})
                        }
                        _ => {
                            serde_json::json!({"type":kind,"masterNode":master,"slaveNode":slave,"dofs":dofs})
                        }
                    };
                    v["constraints"] = serde_json::json!([constraint]);
                    if partial && matches!(kind, "equalDOF" | "linearMPC") {
                        v["loads"][0]["data"]["fx"] = 1000.0.into();
                    }
                    review_stages(&mut v, true);
                    let r = review_solve(dim, v)
                        .unwrap_or_else(|e| panic!("{dim}D {pads} {partial} {kind}: {e}"));
                    let d = r["stages"][0]["results"]["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|d| d["nodeId"] == 3)
                        .unwrap();
                    assert_eq!(d["uz"].as_f64().unwrap(), 0.0);
                    if !partial {
                        assert_eq!(d["ux"].as_f64().unwrap(), 0.0);
                    }
                    if partial && matches!(kind, "equalDOF" | "linearMPC") {
                        for node in [2, 3] {
                            let ux = r["stages"][0]["results"]["displacements"]
                                .as_array()
                                .unwrap()
                                .iter()
                                .find(|d| d["nodeId"] == node)
                                .unwrap()["ux"]
                                .as_f64()
                                .unwrap();
                            assert!(
                                (ux - 0.04).abs() <= 1e-12,
                                "{dim}D {pads} {kind} node {node}: {ux}"
                            );
                        }
                    }
                    assert!(r["finalResults"]["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .all(|d| d["ux"].as_f64().unwrap().is_finite()));
                }
            }
        }
    }
}

#[test]
fn issue_1846_review_loads_on_future_members_refused() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            for field in if dim == 2 {
                vec!["fx", "fz", "my"]
            } else {
                vec!["fx", "fy", "fz", "mx", "my", "mz"]
            } {
                let mut v = review_model(dim, pads);
                v["loads"][0]["data"] = serde_json::json!({"nodeId":3,"fx":0.0,"fy":0.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0});
                v["loads"][0]["data"][field] = 1.0.into();
                if field.starts_with('m') {
                    v["supports"]["3"] = if dim == 2 {
                        serde_json::json!({"id":3,"nodeId":3,"type":"pinned"})
                    } else {
                        serde_json::json!({"nodeId":3,"rx":true,"ry":true,"rz":true,"rrx":false,"rry":false,"rrz":false})
                    };
                }
                review_stages(&mut v, true);
                assert!(
                    review_solve(dim, v.clone()).is_err(),
                    "{dim}D {pads} {field} answered an unsupported stage load"
                );
                v["stages"][0]["loadIndices"] = serde_json::json!([]);
                v["stages"][1]["loadIndices"] = serde_json::json!([0]);
                review_solve(dim, v).unwrap();
            }
        }
    }
}

#[test]
fn issue_1846_review_unidirectional_inactive_springs() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            for scale in [1.0, 1000.0] {
                let mut v = review_model(dim, pads);
                for n in v["nodes"].as_object_mut().unwrap().values_mut() {
                    n["x"] = serde_json::json!(n["x"].as_f64().unwrap() * scale);
                }
                v["materials"]["1"]["e"] = serde_json::json!(10000.0 / scale.powi(2));
                for (field, power) in [("a", 2), ("iy", 4), ("iz", 4), ("j", 4)] {
                    v["sections"]["1"][field] = serde_json::json!(
                        v["sections"]["1"][field].as_f64().unwrap() * scale.powi(power)
                    );
                }
                v["supports"]["3"] = if dim == 2 {
                    serde_json::json!({"id":3,"nodeId":3,"type":"spring","kx":1000.0/scale})
                } else {
                    serde_json::json!({"nodeId":3,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":1000.0/scale})
                };
                v["loads"][0]["data"]["nodeId"] = 3.into();
                review_stages(&mut v, true);
                let r = review_solve(dim, v.clone()).unwrap();
                let d = r["stages"][0]["results"]["displacements"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|d| d["nodeId"] == 3)
                    .unwrap();
                assert!((d["ux"].as_f64().unwrap() - scale / 1000.0).abs() <= 1e-12);
                v["loads"][0]["data"]["fx"] = 0.0.into();
                v["loads"][0]["data"]["fz"] = 1.0.into();
                assert!(review_solve(dim, v).is_err());
            }
        }
    }
}

#[test]
fn issue_1846_review_inactive_settlement_has_no_reaction() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            let mut v = review_model(dim, pads);
            let mut s = v["supports"]["1"].clone();
            s["id"] = 3.into();
            s["nodeId"] = 3.into();
            s["dx"] = 0.125.into();
            v["supports"]["3"] = s;
            review_stages(&mut v, false);
            let r = review_solve(dim, v).unwrap();
            let reactions = r["stages"][0]["results"]["reactions"].as_array().unwrap();
            let r = reactions.iter().find(|r| r["nodeId"] == 3).unwrap();
            assert_eq!(
                r[if dim == 2 { "rx" } else { "fx" }].as_f64().unwrap(),
                0.0,
                "{dim}D {pads}: {r}"
            );
        }
    }
}

#[test]
fn issue_1846_review_hinged_support_springs_carry_moments() {
    for support in ["pinned", "rollerX", "rollerY", "spring"] {
        for pads in [0, 22] {
            let mut v = review_model(2, pads);
            v["elements"].as_object_mut().unwrap().remove("2");
            v["elements"].as_object_mut().unwrap().remove("3");
            v["nodes"].as_object_mut().unwrap().remove("3");
            v["nodes"].as_object_mut().unwrap().remove("4");
            v["elements"]["1"]["hingeEnd"] = true.into();
            v["supports"]["2"] = serde_json::json!({"id":2,"nodeId":2,"type":support,"kz":2.0});
            v["loads"][0]["data"]["fx"] = 0.0.into();
            v["loads"][0]["data"]["my"] = 1.0.into();
            let input: SolverInput = serde_json::from_value(v.clone()).unwrap();
            let raw = solve_2d(&input).unwrap();
            let (certified, _) = dedaliano_engine::certify::certify_linear_2d(&input).unwrap();
            let staged = solve_staged_2d(&stage_2d(&input)).unwrap();
            let nonlinear = dedaliano_engine::solver::corotational::solve_corotational_2d(
                &input, 20, 1e-12, 1, false,
            )
            .unwrap();
            assert!(nonlinear.converged);
            for r in [&raw, &certified, &staged.final_results, &nonlinear.results] {
                let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
                assert!((d.ry - 0.5).abs() <= 1e-12);
            }
            v["supports"]["2"]["kz"] = 0.0.into();
            let input: SolverInput = serde_json::from_value(v).unwrap();
            assert!(solve_2d(&input).is_err());
            assert!(solve_staged_2d(&stage_2d(&input)).is_err());
            assert!(
                dedaliano_engine::solver::corotational::solve_corotational_2d(
                    &input, 20, 1e-12, 1, false
                )
                .is_err()
            );
        }
    }
}

#[test]
fn issue_1846_review_kinematic_spring_threshold_and_dispatch() {
    for dim in [2, 3] {
        for target_nf in [63, 64] {
            for spring in [0.0, 0.5e-4, 1e-4, 0.1] {
                let mut v = review_model(dim, 0);
                v["elements"].as_object_mut().unwrap().remove("2");
                v["elements"].as_object_mut().unwrap().remove("3");
                v["nodes"].as_object_mut().unwrap().remove("3");
                v["nodes"].as_object_mut().unwrap().remove("4");
                v["elements"]["1"]["type"] = "truss".into();
                v["nodes"]["2"]["x"] = 1.0.into();
                v["nodes"]["2"]["z"] = 1.0.into();
                v["materials"]["1"]["e"] = 1e7.into();
                v["supports"]["2"] = if dim == 2 {
                    serde_json::json!({"id":2,"nodeId":2,"type":"spring","kx":spring})
                } else {
                    serde_json::json!({"nodeId":2,"rx":false,"ry":true,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":spring})
                };
                v["loads"] = serde_json::json!([]);
                for i in 2..target_nf {
                    let id = 100 + i;
                    v["nodes"][id.to_string()] = if dim == 2 {
                        serde_json::json!({"id":id,"x":0.0,"z":2.0})
                    } else {
                        serde_json::json!({"id":id,"x":0.0,"y":0.0,"z":2.0})
                    };
                    v["supports"][id.to_string()] = if dim == 2 {
                        serde_json::json!({"id":id,"nodeId":id,"type":"guidedY","ky":1.0})
                    } else {
                        serde_json::json!({"nodeId":id,"rx":true,"ry":true,"rz":false,"rrx":false,"rry":false,"rrz":false,"kz":1.0})
                    };
                }
                let r = if dim == 2 {
                    let input: SolverInput = serde_json::from_value(v).unwrap();
                    assert_eq!(DofNumbering::build_2d(&input).n_free, target_nf);
                    dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&input)
                } else {
                    let input: SolverInput3D = serde_json::from_value(v).unwrap();
                    assert_eq!(DofNumbering::build_3d(&input).n_free, target_nf);
                    dedaliano_engine::solver::kinematic::analyze_kinematics_3d(&input)
                };
                if spring <= 1e-4 {
                    assert!(!r.is_solvable, "{dim}D {target_nf} {spring}: {r:?}");
                    assert_eq!(r.mechanism_modes, 1, "{r:?}");
                    assert!(r.mechanism_nodes.contains(&2));
                    assert!(r.diagnosis.contains("mecanismo"), "{r:?}");
                } else {
                    assert!(r.is_solvable, "{dim}D {target_nf} {spring}: {r:?}");
                    assert_eq!(r.mechanism_modes, 0);
                }
            }
        }
    }
}

#[test]
fn issue_1846_review_kinematic_conditioning_is_not_plastic_mechanism() {
    let mut v = review_model(2, 0);
    v["nodes"].as_object_mut().unwrap().remove("4");
    v["elements"].as_object_mut().unwrap().remove("3");
    v["elements"]["2"]["nodeI"] = 1.into();
    v["elements"]["2"]["nodeJ"] = 2.into();
    v["nodes"].as_object_mut().unwrap().remove("3");
    v["sections"]["1"]["iz"] = 1e-13.into();
    v["nodes"]["2"]["z"] = 4.0.into();
    v["loads"][0]["data"]["fx"] = 0.0.into();
    v["loads"][0]["data"]["fz"] = 1.0.into();
    let input: SolverInput = serde_json::from_value(v).unwrap();
    let k = dedaliano_engine::solver::kinematic::analyze_kinematics_2d(&input);
    assert!(k.is_solvable, "{k:?}");
    assert_eq!(k.mechanism_modes, 0);
    assert_eq!(k.classification, "hyperstatic");
    let capacities = [(1, 1.0), (2, 1.0)].into_iter().collect();
    let r = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(
        &input,
        &capacities,
        &Default::default(),
    )
    .unwrap();
    assert!((r.lambda - 0.5).abs() <= 1e-8, "{r:?}");
}

#[test]
fn issue_1846_review_tiny_springs_dense_sparse_refusal_parity() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            let mut v = review_model(dim, pads);
            let mut s = v["supports"]["1"].clone();
            s["id"] = 3.into();
            s["nodeId"] = 3.into();
            s["type"] = "spring".into();
            for key in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
                s[key] = false.into();
            }
            for key in ["kx", "ky", "kz", "krx", "kry", "krz"] {
                s[key] = 1e-35.into();
            }
            v["supports"]["3"] = s;
            v["loads"][0]["data"]["nodeId"] = 3.into();
            v["loads"][0]["data"]["fx"] = 1e-35.into();
            v["elements"].as_object_mut().unwrap().remove("2");
            v["elements"].as_object_mut().unwrap().remove("3");
            v["nodes"].as_object_mut().unwrap().remove("4");
            if dim == 2 {
                let input: SolverInput = serde_json::from_value(v).unwrap();
                assert_eq!(
                    solve_2d(&input).unwrap_err(),
                    solve_staged_2d(&stage_2d(&input)).unwrap_err()
                );
            } else {
                let input: SolverInput3D = serde_json::from_value(v).unwrap();
                assert_eq!(
                    solve_3d(&input).unwrap_err(),
                    solve_staged_3d(&stage_3d(&input)).unwrap_err()
                );
            }
        }
    }
}

fn review_archived_comment(key: &str) {
    use dedaliano_engine::metamorphic::units::{scale_3d, Units};
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-review-comments.json")).unwrap();
    let v = &fixtures[key];
    for (length, force) in [(1.0, 1.0), (1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448)] {
        for pads in [0, 11] {
            let input: SolverInput3D = serde_json::from_value(v.clone()).unwrap();
            let mut input = scale_3d(&input, &Units::froude(length, force));
            pad_3d(&mut input, pads);
            let linear = solve_3d(&input).unwrap();
            for split in [false, true] {
                let mut staged = stage_3d(&input);
                if split {
                    let all = staged.stages[0].load_indices.clone();
                    staged.stages[0].load_indices =
                        all.iter().copied().filter(|i| i % 2 == 0).collect();
                    let mut second = staged.stages[0].clone();
                    second.name = "second".into();
                    second.elements_added.clear();
                    second.supports_added.clear();
                    second.load_indices = all.iter().copied().filter(|i| i % 2 == 1).collect();
                    staged.stages.push(second);
                }
                let actual = solve_staged_3d(&staged).unwrap().final_results;
                for a in &linear.displacements {
                    let b = actual
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
                            "{key}, {length}, pads={pads}, split={split}, node {}: {x} != {y}",
                            a.node_id
                        );
                    }
                }
                let expected = serde_json::to_value(&linear.element_forces).unwrap();
                let got = serde_json::to_value(&actual.element_forces).unwrap();
                review_force_components(&expected, &got, &input.elements.values().map(|e| e.id).collect::<Vec<_>>(), &format!("{key}, length={length}, pads={pads}, split={split}"));
            }
        }
    }
}

#[test]
fn issue_1846_review_comment_1085() {
    review_archived_comment("1085-6760749658-0");
}

#[test]
fn issue_1846_review_comment_1011() {
    review_archived_comment("1011-6730900141-0");
}

#[test]
fn issue_1846_review_comment_1846() {
    review_archived_comment("1846-6760758840-0");
}

#[test]
fn issue_1846_review_spring_held_connector_arms() {
    let mut v = review_model(2, 0);
    v["elements"].as_object_mut().unwrap().remove("2");
    v["elements"].as_object_mut().unwrap().remove("3");
    v["loads"] = serde_json::json!([]);
    v["connectors"] = serde_json::json!({"1":{"id":1,"nodeI":3,"nodeJ":4,"kShear":1.0}});
    for node in [3, 4] {
        v["supports"][node.to_string()] =
            serde_json::json!({"id":node,"nodeId":node,"type":"pinned","kz":2.0});
    }
    let input: SolverInput = serde_json::from_value(v.clone()).unwrap();
    solve_2d(&input).unwrap();
    dedaliano_engine::certify::certify_linear_2d(&input).unwrap();
    v["loads"] =
        serde_json::json!([{"type":"nodal","data":{"nodeId":3,"fx":0.0,"fz":0.0,"my":1e-6}}]);
    let input: SolverInput = serde_json::from_value(v.clone()).unwrap();
    let linear = solve_2d(&input).unwrap();
    let unsupported =
        dedaliano_engine::solver::corotational::solve_corotational_2d(&input, 20, 1e-12, 1, false)
            .unwrap_err();
    assert!(unsupported.contains("does not support the shear stiffness of a connector with length"));
    let (certified, _) = dedaliano_engine::certify::certify_linear_2d(&input).unwrap();
    for node in [3, 4] {
        v["supports"][node.to_string()]["type"] = "spring".into();
        v["supports"][node.to_string()]["kx"] = 1e8.into();
        v["supports"][node.to_string()]["ky"] = 1e8.into();
    }
    let reference: SolverInput = serde_json::from_value(v.clone()).unwrap();
    assert!(solve_2d(&reference)
        .unwrap()
        .displacements
        .iter()
        .all(|d| d.ry.is_finite()));
    for node in [3, 4] {
        v["supports"][node.to_string()]["type"] = "pinned".into();
        v["supports"][node.to_string()]
            .as_object_mut()
            .unwrap()
            .remove("kx");
        v["supports"][node.to_string()]
            .as_object_mut()
            .unwrap()
            .remove("ky");
        v["supports"][node.to_string()]["kz"] = 0.0.into();
    }
    v["loads"] = serde_json::json!([]);
    let mechanism: SolverInput = serde_json::from_value(v).unwrap();
    assert!(solve_2d(&mechanism).is_err());
    for d in &linear.displacements {
        let actual = certified
            .displacements
            .iter()
            .find(|a| a.node_id == d.node_id)
            .unwrap();
        assert!((d.ry - actual.ry).abs() <= 1e-12);
    }
}

#[test]
fn issue_1846_review_tiny_spring_dispatch_boundaries() {
    for dim in [2, 3] {
        for nf in [63, 64] {
            let mut v = review_model(dim, 0);
            v["elements"].as_object_mut().unwrap().remove("2");
            v["elements"].as_object_mut().unwrap().remove("3");
            v["nodes"].as_object_mut().unwrap().remove("4");
            v["supports"]["3"] = if dim == 2 {
                serde_json::json!({"id":3,"nodeId":3,"type":"spring","kx":1e-35,"ky":1e-35,"kz":1e-35})
            } else {
                serde_json::json!({"nodeId":3,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":1e-35,"ky":1e-35,"kz":1e-35,"krx":1e-35,"kry":1e-35,"krz":1e-35})
            };
            v["loads"][0]["data"]["nodeId"] = 3.into();
            v["loads"][0]["data"]["fx"] = 1e-35.into();
            let base = if dim == 2 { 6 } else { 12 };
            for i in base..nf {
                let id = 100 + i;
                v["nodes"][id.to_string()] = if dim == 2 {
                    serde_json::json!({"id":id,"x":0.0,"z":2.0})
                } else {
                    serde_json::json!({"id":id,"x":0.0,"y":0.0,"z":2.0})
                };
                v["supports"][id.to_string()] = if dim == 2 {
                    serde_json::json!({"id":id,"nodeId":id,"type":"guidedY","ky":1.0})
                } else {
                    serde_json::json!({"nodeId":id,"rx":true,"ry":true,"rz":false,"rrx":true,"rry":true,"rrz":true,"kz":1.0})
                };
            }
            if dim == 2 {
                let input: SolverInput = serde_json::from_value(v).unwrap();
                assert_eq!(DofNumbering::build_2d(&input).n_free, nf);
                assert_eq!(
                    solve_2d(&input).unwrap_err(),
                    solve_staged_2d(&stage_2d(&input)).unwrap_err()
                );
            } else {
                let input: SolverInput3D = serde_json::from_value(v).unwrap();
                assert_eq!(DofNumbering::build_3d(&input).n_free, nf);
                assert_eq!(
                    solve_3d(&input).unwrap_err(),
                    solve_staged_3d(&stage_3d(&input)).unwrap_err()
                );
            }
        }
    }
}

fn round3_model(name: &str, pads: usize) -> serde_json::Value {
    let fixtures: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/staged-review-round3.json")).unwrap();
    let mut v = fixtures[name].clone();
    let dim = if name.ends_with('2') { 2 } else { 3 };
    let padding = review_model(dim, pads);
    for field in ["nodes", "elements", "supports"] {
        for (key, value) in padding[field].as_object().unwrap() {
            if key.parse::<usize>().unwrap() >= 100 {
                v[field][key] = value.clone();
            }
        }
    }
    v
}

#[test]
fn issue_1846_round3_swinging_rotations_report_mechanisms() {
    use dedaliano_engine::solver::kinematic::{analyze_kinematics_2d, analyze_kinematics_3d};
    for dim in [2, 3] {
        for pads in [0, 22] {
            for kind in ["rigidLink", "eccentricConnection", "diaphragm"] {
                if dim == 2 && kind == "diaphragm" {
                    continue;
                }
                let mut v = round3_model(&format!("swing{dim}"), pads);
                v["constraints"][0] = match kind {
                    "diaphragm" => {
                        serde_json::json!({"type":kind,"masterNode":1,"slaveNodes":[2],"plane":"XZ"})
                    }
                    "eccentricConnection" => {
                        serde_json::json!({"type":kind,"masterNode":1,"slaveNode":2,"offsetX":2.0,"offsetY":0.0,"offsetZ":1.0,"releases":[]})
                    }
                    _ => serde_json::json!({"type":kind,"masterNode":1,"slaveNode":2,"dofs":[]}),
                };
                if kind == "diaphragm" {
                    v["supports"]["2"] = serde_json::json!({"nodeId":2,"rx":false,"ry":true,"rz":false,"rrx":false,"rry":false,"rrz":false});
                }
                for held in [false, true] {
                    if held {
                        v["supports"]["1"]["type"] = "fixed".into();
                        for field in ["rrx", "rry", "rrz"] {
                            v["supports"]["1"][field] = true.into();
                        }
                    }
                    let k = if dim == 2 {
                        analyze_kinematics_2d(&serde_json::from_value(v.clone()).unwrap())
                    } else {
                        analyze_kinematics_3d(&serde_json::from_value(v.clone()).unwrap())
                    };
                    assert_eq!(k.is_solvable, held, "{dim}D {pads} {kind}: {k:?}");
                    if held {
                        assert_eq!(k.mechanism_modes, 0, "{k:?}");
                    } else {
                        assert!(k.mechanism_modes > 0, "{dim}D {pads} {kind}: {k:?}");
                        assert!(k.mechanism_nodes.contains(&1), "{k:?}");
                        assert!(!k.unconstrained_dofs.is_empty());
                        assert!(k.diagnosis.contains("Mecanismo"), "{k:?}");
                    }
                    let linear = if dim == 2 {
                        solve_2d(&serde_json::from_value(v.clone()).unwrap()).map(|_| ())
                    } else {
                        solve_3d(&serde_json::from_value(v.clone()).unwrap()).map(|_| ())
                    };
                    assert_eq!(linear.is_ok(), held, "{linear:?}");
                }
            }
        }
    }
}

#[test]
fn issue_1846_round3_elastic_refusals_do_not_become_kinematic_mechanisms() {
    use dedaliano_engine::solver::{kinematic::*, stability};
    for dim in [2, 3] {
        for pads in [0, 22] {
            for soft in [true, false] {
                let mut v = round3_model(&format!("soft{dim}"), pads);
                if !soft {
                    v["sections"]["1"][if dim == 2 { "iz" } else { "iy" }] = 0.001.into();
                }
                let (k, s, r) = if dim == 2 {
                    let i = serde_json::from_value(v).unwrap();
                    (
                        analyze_kinematics_2d(&i),
                        stability::of_2d(&i).unwrap(),
                        solve_2d(&i).map(|_| ()),
                    )
                } else {
                    let i = serde_json::from_value(v).unwrap();
                    (
                        analyze_kinematics_3d(&i),
                        stability::of_3d(&i).unwrap(),
                        solve_3d(&i).map(|_| ()),
                    )
                };
                if soft {
                    assert_eq!(
                        s.reason,
                        if dim == 2 {
                            stability::Reason::ConstraintRounding
                        } else {
                            stability::Reason::CoupledSoftDirection
                        }
                    );
                }
                assert!(k.is_solvable, "{dim}D {pads} soft={soft}: {k:?}");
                assert_eq!(k.mechanism_modes, 0, "{k:?}");
                assert_eq!(r.is_ok(), !soft, "{r:?}");
            }
        }
    }
}

#[test]
fn issue_1846_round3_limit_analysis_normalizes_elastic_contrast() {
    for soft in [true, false] {
        let mut v = round3_model("soft2", 0);
        if !soft {
            v["sections"]["1"]["iz"] = 0.001.into();
        }
        let i = serde_json::from_value(v).unwrap();
        let r = dedaliano_engine::solver::plastic_limit::limit_analysis_2d(
            &i,
            &[(1, 1.0)].into_iter().collect(),
            &Default::default(),
        )
        .unwrap();
        assert!(r.lambda.is_finite() && r.lambda > 0.0, "{r:?}");
        assert!((r.lambda - 0.25).abs() <= 1e-10, "{r:?}");
    }
}

#[test]
fn issue_1846_round3_plastic_preserves_coupled_soft_refusal() {
    for pads in [1, 22] {
        for soft in [true, false] {
            let mut v = round3_model("soft3", pads);
            v["loads"] = serde_json::json!([{"type":"nodal","data":{"nodeId":101,"fx":0.0,"fy":1.0,"fz":0.0,"mx":0.0,"my":0.0,"mz":0.0}}]);
            if !soft {
                v["sections"]["1"]["iy"] = 0.001.into();
            }
            let p: PlasticInput3D = serde_json::from_value(serde_json::json!({
                "solver":v,"sections":{"1":{"a":0.01,"iy":0.001,"iz":0.002,"materialId":1},"2":{"a":0.01,"iy":0.001,"iz":0.002,"materialId":1}},
                "materials":{"1":{"fy":1.0}},"maxHinges":1
            })).unwrap();
            let r = dedaliano_engine::solver::plastic::solve_plastic_3d(&p);
            if soft {
                assert!(r.unwrap_err().contains("coupled"));
            } else {
                assert!(r.unwrap().collapse_factor > 0.0);
            }
        }
    }
}

#[test]
fn issue_1846_round3_dormant_pins_do_not_create_conditioning_warnings() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            for scale in [1e-12, 1.0, 1e12] {
                let mut v = review_model(dim, pads);
                v["materials"]["1"]["e"] = (10000.0 * scale).into();
                v["loads"][0]["data"]["fx"] = (1000.0 * scale).into();
                review_stages(&mut v, true);
                let r = review_solve(dim, v).unwrap();
                for stage in r["stages"].as_array().unwrap() {
                    let result = &stage["results"];
                    let d = result["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|d| d["nodeId"] == 2)
                        .unwrap();
                    assert!((d["ux"].as_f64().unwrap() - 0.04).abs() <= 1e-12);
                    assert!(
                        !result["structuredDiagnostics"]
                            .as_array()
                            .unwrap_or(&vec![])
                            .iter()
                            .any(|d| d["phase"] == "NUM-INVARIANCE"),
                        "{dim}D {pads} {scale}: {result}"
                    );
                }
            }
        }
    }
}

#[test]
fn issue_1846_round3_plastic_2d_retains_existing_refusal() {
    for soft in [true, false] {
        let mut v = round3_model("soft2", 0);
        if !soft {
            v["sections"]["1"]["iz"] = 0.001.into();
        }
        let p: PlasticInput = serde_json::from_value(serde_json::json!({
            "solver":v,"sections":{"1":{"a":0.01,"iz":0.002,"materialId":1}},
            "materials":{"1":{"fy":1.0}},"maxHinges":1
        }))
        .unwrap();
        let error = dedaliano_engine::solver::plastic::solve_plastic_2d(&p).unwrap_err();
        let refusal: serde_json::Value = serde_json::from_str(&error).unwrap();
        assert!(refusal["structuredDiagnostics"]
            .as_array()
            .unwrap()
            .iter()
            .any(|d| d["phase"] == "PL-2D-INVARIANCE" && d["severity"] == "error"));
    }
}

#[test]
fn issue_1846_round3_zero_arm_is_a_harmless_free_rotation() {
    use dedaliano_engine::solver::kinematic::*;
    for dim in [2, 3] {
        for arm in [0.0, 1e-6] {
            let mut v = round3_model(&format!("swing{dim}"), 0);
            v["nodes"]["2"]["x"] = (2.0 * arm).into();
            v["nodes"]["2"]["z"] = arm.into();
            let k = if dim == 2 {
                analyze_kinematics_2d(&serde_json::from_value(v.clone()).unwrap())
            } else {
                analyze_kinematics_3d(&serde_json::from_value(v.clone()).unwrap())
            };
            assert_eq!(k.is_solvable, arm == 0.0, "{dim}D {arm}: {k:?}");
            assert_eq!(k.mechanism_modes == 0, arm == 0.0, "{k:?}");
            let r = if dim == 2 {
                solve_2d(&serde_json::from_value(v).unwrap()).map(|_| ())
            } else {
                solve_3d(&serde_json::from_value(v).unwrap()).map(|_| ())
            };
            assert_eq!(r.is_ok(), arm == 0.0, "{r:?}");
        }
    }
}

#[test]
fn issue_1846_round3_empty_stage_has_no_artificial_conditioning_warning() {
    for dim in [2, 3] {
        for pads in [0, 22] {
            for scale in [1e-12, 1.0, 1e12] {
                let mut v = review_model(dim, pads);
                v["materials"]["1"]["e"] = (10000.0 * scale).into();
                v["loads"][0]["data"]["fx"] = (1000.0 * scale).into();
                review_stages(&mut v, false);
                let all = v["elements"]
                    .as_object()
                    .unwrap()
                    .values()
                    .map(|e| e["id"].clone())
                    .collect::<Vec<_>>();
                v["stages"][0]["elementsAdded"] = serde_json::json!([]);
                v["stages"][1]["elementsAdded"] = serde_json::json!(all);
                let r = review_solve(dim, v).unwrap();
                for (i, stage) in r["stages"].as_array().unwrap().iter().enumerate() {
                    let result = &stage["results"];
                    let d = result["displacements"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|d| d["nodeId"] == 2)
                        .unwrap();
                    assert!(
                        (d["ux"].as_f64().unwrap() - if i == 0 { 0.0 } else { 0.04 }).abs()
                            <= 1e-12
                    );
                    assert!(
                        !result["structuredDiagnostics"]
                            .as_array()
                            .unwrap_or(&vec![])
                            .iter()
                            .any(|d| d["phase"] == "NUM-INVARIANCE"),
                        "{result}"
                    );
                }
            }
        }
    }
}

fn review_force_components(
    expected: &serde_json::Value,
    got: &serde_json::Value,
    ids: &[usize],
    context: &str,
) {
    let mut ids = ids.to_vec();
    assert!(!ids.is_empty(), "{context}: no expected elements");
    ids.sort_unstable();
    for (side, forces) in [("expected", expected), ("actual", got)] {
        let mut actual_ids: Vec<_> = forces
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["elementId"].as_u64().unwrap() as usize)
            .collect();
        actual_ids.sort_unstable();
        assert_eq!(actual_ids, ids, "{context}: {side} element IDs");
    }
    for a in expected.as_array().unwrap() {
        let b = got
            .as_array()
            .unwrap()
            .iter()
            .find(|b| b["elementId"] == a["elementId"])
            .unwrap();
        for fields in [
            ["nStart", "nEnd", "vyStart", "vyEnd", "vzStart", "vzEnd"],
            ["mxStart", "mxEnd", "myStart", "myEnd", "mzStart", "mzEnd"],
        ] {
            let finite = |value: &serde_json::Value, field: &str| {
                let number = value[field]
                    .as_f64()
                    .expect("missing or nonnumeric force component");
                assert!(number.is_finite(), "{context}: nonfinite {field}");
                number
            };
            let scale = fields
                .iter()
                .map(|field| finite(a, field).abs())
                .fold(1e-10, f64::max);
            for field in fields {
                let x = finite(a, field);
                let y = finite(b, field);
                assert!(
                    (x - y).abs() <= 1e-9 * scale,
                    "{context}, element {}: {field} {x} != {y}",
                    a["elementId"]
                );
            }
        }
    }
}

#[test]
fn issue_1846_round4_force_comparison_rejects_incomplete_components() {
    let fields = [
        "nStart", "nEnd", "vyStart", "vyEnd", "vzStart", "vzEnd", "mxStart", "mxEnd", "myStart",
        "myEnd", "mzStart", "mzEnd",
    ];
    let mut element = serde_json::json!({"elementId": 1});
    for field in fields {
        element[field] = 1.0.into();
    }
    let valid = serde_json::json!([element]);
    review_force_components(&valid, &valid, &[1], "valid");
    let mut cases = vec![
        (serde_json::json!([]), serde_json::json!([])),
        (valid.clone(), serde_json::json!([])),
        (
            valid.clone(),
            serde_json::json!([valid[0].clone(), valid[0].clone()]),
        ),
    ];
    let mut wrong_id = valid.clone();
    wrong_id[0]["elementId"] = 2.into();
    cases.push((wrong_id.clone(), wrong_id));
    for field in fields {
        for side in [false, true] {
            for missing in [false, true] {
                let mut broken = valid.clone();
                if missing {
                    broken[0].as_object_mut().unwrap().remove(field);
                } else {
                    broken[0][field] = serde_json::to_value(f64::NAN).unwrap();
                }
                cases.push(if side {
                    (valid.clone(), broken)
                } else {
                    (broken, valid.clone())
                });
            }
        }
    }
    for (expected, got) in cases {
        assert!(
            std::panic::catch_unwind(|| review_force_components(
                &expected,
                &got,
                &[1],
                "negative control"
            ))
            .is_err(),
            "accepted {expected} / {got}"
        );
    }
}

fn round4_plastic_mechanisms(torsions: &[f64]) {
    for propped in [false, true] {
        let mut p: PlasticInput3D =
            serde_json::from_str(include_str!("../fixtures/staged-round4-plastic.json")).unwrap();
        if propped {
            p.solver.nodes.retain(|id, _| id == "1" || id == "2");
            p.solver.elements.retain(|id, _| id == "1");
            p.solver.supports.remove("4");
            let mut support = p.solver.supports["1"].clone();
            support.node_id = 2;
            support.rry = false;
            support.rrz = false;
            p.solver.supports.insert("2".into(), support);
        }
        for (&torsion, pads) in torsions.iter().flat_map(|j| {
            [
                0,
                if propped { 10 } else { 8 },
                if propped { 11 } else { 9 },
            ]
            .map(|pads| (j, pads))
        }) {
            let mut p = p.clone();
            p.solver.sections.get_mut("1").unwrap().j = torsion;
            pad_3d(&mut p.solver, pads);
            let raw = dedaliano_engine::solver::plastic::solve_plastic_3d(&p);
            let certified = dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&p)
                .map(|out| out.results);
            for r in [raw, certified] {
                let r = r.unwrap();
                assert!(r.is_mechanism, "{r:?}");
                assert!(
                    (r.collapse_factor - if propped { 100.0 } else { 200.0 }).abs() <= 1e-9,
                    "propped={propped}, pads={pads}: {r:?}"
                );
            }
        }
    }
}

#[test]
fn issue_1846_round4_plastic_joint_moment_mechanisms() {
    round4_plastic_mechanisms(&[1e-5]);
}

#[test]
fn issue_1846_round4_plastic_hinge_soft_states() {
    round4_plastic_mechanisms(&[1e-11, 1e-15, 1e-17]);
}

#[test]
fn issue_1846_round4_plastic_hinge_induced_coupled_soft_state() {
    let p: PlasticInput3D =
        serde_json::from_str(include_str!("../fixtures/staged-round4-soft-hinge.json")).unwrap();
    let raw = dedaliano_engine::solver::plastic::solve_plastic_3d(&p).unwrap();
    let certified = dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&p).unwrap();
    for r in [&raw, &certified.results] {
        assert!(
            r.collapse_factor.is_finite() && r.collapse_factor > 0.0,
            "{r:?}"
        );
        assert!(r.is_mechanism, "{r:?}");
    }
}

#[test]
fn issue_1846_round4_plastic_hinge_induced_conditioning() {
    for torsion in [1e-11, 1e-13, 1e-15, 1e-17] {
        let mut p: PlasticInput3D =
            serde_json::from_str(include_str!("../fixtures/staged-round4-plastic.json")).unwrap();
        p.solver.nodes.get_mut("3").unwrap().y = 4.0;
        p.solver.nodes.get_mut("4").unwrap().y = 4.0;
        p.solver.sections.get_mut("1").unwrap().j = torsion;
        let raw = dedaliano_engine::solver::plastic::solve_plastic_3d(&p);
        let certified =
            dedaliano_engine::certify::plastic_3d::certify_plastic_3d(&p).map(|out| out.results);
        for result in [raw, certified] {
            let result = result.unwrap();
            eprintln!(
                "full conditioning torsion={torsion}: factor={}, mechanism={}",
                result.collapse_factor, result.is_mechanism
            );
            assert!(result.collapse_factor.is_finite() && result.collapse_factor > 0.0);
            assert!(result.is_mechanism);
        }
    }
}
