use dedaliano_engine::solver::moving_loads::{solve_moving_loads_2d, solve_moving_loads_3d};
use dedaliano_engine::types::*;
use serde_json::Value;

fn train() -> LoadTrain {
    LoadTrain {
        name: "two axles".into(),
        axles: vec![
            Axle {
                offset: 0.0,
                weight: 50.0,
            },
            Axle {
                offset: 1.5,
                weight: 25.0,
            },
        ],
    }
}

fn tip_flexibility(x: f64, length: f64, ei: f64) -> f64 {
    x * x * (3.0 * length - x) / (6.0 * ei)
}

fn minimum_shear(
    train: &LoadTrain,
    length: f64,
    member: usize,
    reaction: impl Fn(f64) -> f64,
) -> f64 {
    let start = member as f64 - 1.0;
    let end = member as f64;
    let mut minimum = 0.0_f64;
    for sample in -3..=12 {
        let ref_pos = f64::from(sample) / 2.0;
        let axles: Vec<_> = train
            .axles
            .iter()
            .map(|axle| (ref_pos + axle.offset, axle.weight))
            .filter(|(x, _)| (0.0..=length).contains(x))
            .collect();
        for side in [-1, 0, 1] {
            let active: Vec<_> = axles.iter().copied()
                .filter(|&(x, _)| (side >= 0 || x != 0.0) && (side <= 0 || x != length))
                .collect();
            let mut cuts = vec![start, end];
            cuts.extend(active.iter().map(|&(x, _)| x).filter(|&x| start < x && x < end));
            cuts.sort_by(f64::total_cmp);
            let tip = reaction(
                active.iter()
                    .map(|&(x, weight)| weight * tip_flexibility(x, length, 1.0))
                    .sum(),
            );
            let shear = |cut, includes_joint| {
                active.iter()
                    .filter(|&&(x, _)| x > cut || (includes_joint && x == cut))
                    .map(|&(_, weight)| weight)
                    .sum::<f64>() - tip
            };
            for interval in cuts.windows(2) {
                let cut = (interval[0] + interval[1]) / 2.0;
                minimum = minimum.min(shear(cut, false));
            }
            if side > 0 && active.iter().any(|&(x, _)| x == start) {
                minimum = minimum.min(shear(start, true));
            }
            if side < 0 && active.iter().any(|&(x, _)| x == end) {
                minimum = minimum.min(shear(end, false));
            }
        }
    }
    minimum
}

fn assert_force(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-9,
        "got {actual:.15}, expected {expected:.15}"
    );
}

#[test]
fn issue_2101_inclined_support_moving_shear() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/moving-shear-2101.json")).unwrap();
    let solver: SolverInput3D = serde_json::from_value(fixture.clone()).unwrap();
    let section = &solver.sections["6"];
    let e = solver.materials["1"].e * 1000.0;
    let support = &solver.supports["7"];
    let nx = support.normal_x.unwrap();
    let nz = support.normal_z.unwrap();
    let length = solver.nodes["7"].x - solver.nodes["1"].x;
    let axial_flexibility = length / (e * section.a);
    let ei = e * section.iy;
    let [SolverLoad3D::Nodal(nodal)] = solver.loads.as_slice() else {
        panic!("expected the nightly tip load");
    };
    let train = train();
    let expected = minimum_shear(&train, length, 6, |loaded| {
        nz * (-nx * nodal.fx * axial_flexibility + nz * loaded / ei)
            / (nx * nx * axial_flexibility + nz * nz * tip_flexibility(length, length, ei))
    });
    let mut input = MovingLoadInput3D {
        solver,
        train,
        step: Some(0.5),
        path_element_ids: Some((1..=6).collect()),
        gravity_direction: None,
    };
    let baseline = solve_moving_loads_3d(&input).unwrap();
    assert!(baseline
        .structured_diagnostics
        .iter()
        .all(|d| d.severity == Severity::Info));
    assert_force(baseline.elements["6"].vz_max_neg, expected);
    input.solver.nodes = serde_json::from_value(fixture["_transformedNodes"].clone()).unwrap();
    let [cx, cy]: [f64; 2] = serde_json::from_value(fixture["_rotationDirection"].clone()).unwrap();
    let angle = cy.atan2(cx);
    let (sin, cos) = angle.sin_cos();
    let prop = input.solver.supports.get_mut("7").unwrap();
    prop.normal_x = Some(nx * cos);
    prop.normal_y = Some(nx * sin);
    let SolverLoad3D::Nodal(tip_load) = &mut input.solver.loads[0] else {
        unreachable!()
    };
    (tip_load.fx, tip_load.fy) = (tip_load.fx * cos, tip_load.fx * sin);
    for constrained in [false, true] {
        if constrained {
            input
                .solver
                .constraints
                .push(Constraint::EqualDOF(EqualDOFConstraint {
                    master_node: 1,
                    slave_node: 7,
                    dofs: vec![5],
                }));
        }
        let rotated = solve_moving_loads_3d(&input).unwrap();
        assert!(rotated
            .structured_diagnostics
            .iter()
            .all(|d| d.severity == Severity::Info));
        assert_force(rotated.elements["6"].vz_max_neg, expected);
    }
}

#[test]
fn issue_2104_tip_spring_moving_shear() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/moving-shear-2104.json")).unwrap();
    let solver: SolverInput = serde_json::from_value(fixture.clone()).unwrap();
    let length = solver.nodes["7"].x - solver.nodes["1"].x;
    let ei = solver.materials["1"].e * 1000.0 * solver.sections["1"].iz;
    let k = solver.supports["2"].ky.unwrap();
    let train = train();
    let expected = minimum_shear(&train, length, 2, |loaded| {
        loaded / ei / (1.0 / k + tip_flexibility(length, length, ei))
    });
    let mut input = MovingLoadInput {
        solver,
        train,
        step: Some(0.5),
        path_element_ids: Some((1..=6).collect()),
    };
    let baseline = solve_moving_loads_2d(&input).unwrap();
    assert!(baseline
        .structured_diagnostics
        .iter()
        .all(|d| d.severity == Severity::Info));
    assert_force(baseline.elements["2"].v_max_neg, expected);
    input.solver.nodes = serde_json::from_value(fixture["_transformedNodes"].clone()).unwrap();
    let SolverLoad::Nodal(tip_load) = &mut input.solver.loads[0] else {
        unreachable!()
    };
    tip_load.fx = -tip_load.fx;
    for constrained in [false, true] {
        if constrained {
            input
                .solver
                .constraints
                .push(Constraint::EqualDOF(EqualDOFConstraint {
                    master_node: 1,
                    slave_node: 7,
                    dofs: vec![0],
                }));
        }
        let mirrored = solve_moving_loads_2d(&input).unwrap();
        assert!(mirrored
            .structured_diagnostics
            .iter()
            .all(|d| d.severity == Severity::Info));
        assert_force(mirrored.elements["2"].v_max_pos, -expected);
    }
}

#[test]
fn issue_2104_cumulative_station_resolves_both_sides_of_a_joint() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let mut solver: SolverInput =
        serde_json::from_str(include_str!("../fixtures/moving-shear-2104.json")).unwrap();
    solver.loads.clear();
    solver.elements.retain(|_, e| e.id <= 3);
    solver.nodes.retain(|_, n| n.id <= 4);
    solver.supports = (1..=4)
        .map(|id| {
            let mut s = solver.supports["1"].clone();
            s.id = id;
            s.node_id = id;
            (id.to_string(), s)
        })
        .collect();
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let weight = 50.0;
    let train = LoadTrain {
        name: "one axle".into(),
        axles: vec![Axle {
            offset: 0.0,
            weight,
        }],
    };
    let ids = Some(vec![1, 2, 3]);

    for (station, expected) in [
        (2.0 - 16.0 * f64::EPSILON, [weight, weight]),
        (2.0 + 16.0 * f64::EPSILON, [weight, weight]),
        (2.0 - 17.0 * f64::EPSILON, [weight, 0.0]),
        ((2.0 + 16.0 * f64::EPSILON).next_up(), [0.0, weight]),
    ] {
        let planar_env = solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(),
            train: train.clone(),
            step: Some(station),
            path_element_ids: ids.clone(),
        })
        .unwrap();
        let spatial_env = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial.clone(),
            train: train.clone(),
            step: Some(station),
            path_element_ids: ids.clone(),
            gravity_direction: None,
        })
        .unwrap();
        assert_eq!(planar_env.num_positions, 2);
        assert_eq!(spatial_env.num_positions, 2);
        for (id, expected) in ["2", "3"].into_iter().zip(expected) {
            let p = &planar_env.elements[id];
            assert_force(p.v_max_pos - p.v_max_neg, expected);
            let s = &spatial_env.elements[id];
            assert_force(
                s.vy_max_pos.max(s.vz_max_pos) - s.vy_max_neg.min(s.vz_max_neg),
                expected,
            );
        }
    }

    solver.elements.retain(|_, element| element.id <= 2);
    solver.nodes.retain(|_, node| node.id <= 3);
    solver.supports.remove("4");
    let start = 1_000_000.0_f64;
    let ulp = start.next_up() - start;
    solver.nodes.get_mut("2").unwrap().x = start;
    solver.nodes.get_mut("3").unwrap().x = start;
    for (width, resolvable) in [(30.0 * ulp, false), (31.0 * ulp, true)] {
        solver.nodes.get_mut("3").unwrap().z = width;
        let spatial = embed_2d(&solver, Plane::XZ).unwrap();
        let planar = solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(),
            train: train.clone(),
            step: Some(start),
            path_element_ids: Some(vec![1, 2]),
        });
        let spatial = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial,
            train: train.clone(),
            step: Some(start),
            path_element_ids: Some(vec![1, 2]),
            gravity_direction: None,
        });
        if resolvable {
            let p = &planar.unwrap().elements["2"];
            assert_force(p.v_max_pos - p.v_max_neg, 0.0);
            let s = &spatial.unwrap().elements["2"];
            assert_force(
                s.vy_max_pos.max(s.vz_max_pos) - s.vy_max_neg.min(s.vz_max_neg),
                0.0,
            );
        } else {
            let error = "Moving loads: axle position cannot be resolved at a path joint";
            assert_eq!(planar.unwrap_err(), error);
            assert_eq!(spatial.unwrap_err(), error);
        }
    }
}

fn review_beam(length: f64) -> SolverInput {
    let mut solver: SolverInput =
        serde_json::from_str(include_str!("../fixtures/moving-shear-2104.json")).unwrap();
    solver.loads.clear();
    solver.elements.retain(|_, e| e.id == 1);
    solver.nodes.retain(|_, n| n.id <= 2);
    solver.nodes.get_mut("2").unwrap().x = length;
    let mut support = solver.supports["1"].clone();
    support.id = 2;
    support.node_id = 2;
    solver.supports = [("2".into(), support)].into();
    solver
}

#[test]
fn issue_2101_shear_limits_at_both_support_faces() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let mut solver = review_beam(10.0);
    let support = solver.supports.get_mut("2").unwrap();
    support.support_type = "rollerX".into();
    let mut pin = support.clone();
    pin.id = 1;
    pin.node_id = 1;
    pin.support_type = "pinned".into();
    solver.supports.insert("1".into(), pin);
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let weight = 100.0;
    let train = LoadTrain {
        name: "one axle".into(),
        axles: vec![Axle { offset: 0.0, weight }],
    };
    let p = solve_moving_loads_2d(&MovingLoadInput {
        solver,
        train: train.clone(),
        step: Some(0.25),
        path_element_ids: Some(vec![1]),
    })
    .unwrap();
    let s = solve_moving_loads_3d(&MovingLoadInput3D {
        solver: spatial,
        train,
        step: Some(0.25),
        path_element_ids: Some(vec![1]),
        gravity_direction: None,
    })
    .unwrap();
    assert_force(p.elements["1"].v_max_pos, weight);
    assert_force(p.elements["1"].v_max_neg, -weight);
    assert_force(s.elements["1"].vz_max_pos, weight);
    assert_force(s.elements["1"].vz_max_neg, -weight);
}

#[test]
fn issue_2104_a_joint_axle_governs_both_adjacent_members() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let mut solver: SolverInput =
        serde_json::from_str(include_str!("../fixtures/moving-shear-2104.json")).unwrap();
    solver.loads.clear();
    solver.elements.retain(|_, e| e.id <= 2);
    solver.nodes.retain(|_, n| n.id <= 3);
    let mut fixed = solver.supports["1"].clone();
    solver.supports.clear();
    for id in [1, 2, 3] {
        fixed.id = id;
        fixed.node_id = id;
        solver.supports.insert(id.to_string(), fixed.clone());
    }
    let second = solver.elements.get_mut("2").unwrap();
    (second.node_i, second.node_j) = (second.node_j, second.node_i);
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let weight = 50.0;
    let train = LoadTrain {
        name: "stacked axles".into(),
        axles: vec![
            Axle { offset: 0.0, weight },
            Axle { offset: 0.0, weight },
        ],
    };
    let p = solve_moving_loads_2d(&MovingLoadInput {
        solver,
        train: train.clone(),
        step: Some(1.0),
        path_element_ids: Some(vec![1, 2]),
    })
    .unwrap();
    let s = solve_moving_loads_3d(&MovingLoadInput3D {
        solver: spatial,
        train,
        step: Some(1.0),
        path_element_ids: Some(vec![1, 2]),
        gravity_direction: None,
    })
    .unwrap();
    assert_eq!(p.num_positions, 3);
    assert_eq!(s.num_positions, 3);
    assert_force(p.elements["1"].v_max_neg, -2.0 * weight);
    assert_force(p.elements["2"].v_max_pos, 2.0 * weight);
    assert_force(s.elements["1"].vz_max_neg, -2.0 * weight);
    assert_force(s.elements["2"].vz_max_neg, -2.0 * weight);
}

#[test]
fn review_2101_sampled_entrance_axle_governs_shear() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let solver = review_beam(0.01);
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    for (step, offset, expected) in [
        (0.1, 1.0, 100.0),
        (0.3, 0.9000000000000001, 100.0),
        (0.3, 0.90000000000001, 1.0),
    ] {
        let train = LoadTrain {
            name: "entrance".into(),
            axles: vec![
                Axle {
                    offset: 0.0,
                    weight: 100.0,
                },
                Axle {
                    offset,
                    weight: 1.0,
                },
            ],
        };
        let planar = solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(),
            train: train.clone(),
            step: Some(step),
            path_element_ids: Some(vec![1]),
        })
        .unwrap();
        let spatial = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial.clone(),
            train,
            step: Some(step),
            path_element_ids: Some(vec![1]),
            gravity_direction: None,
        })
        .unwrap();
        let p = &planar.elements["1"];
        assert_force(p.v_max_pos.max(-p.v_max_neg), expected);
        let s = &spatial.elements["1"];
        assert_force(
            s.vy_max_pos
                .max(-s.vy_max_neg)
                .max(s.vz_max_pos)
                .max(-s.vz_max_neg),
            expected,
        );
    }
    let limit = 0.01 / (8.0 * f64::EPSILON);
    for (offset, accepted) in [(limit.next_down(), true), (limit, false)] {
        let train = LoadTrain {
            name: "resolution".into(),
            axles: vec![
                Axle {
                    offset: 0.0,
                    weight: 100.0,
                },
                Axle {
                    offset,
                    weight: 1.0,
                },
            ],
        };
        let planar = solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(),
            train: train.clone(),
            step: Some(offset),
            path_element_ids: Some(vec![1]),
        });
        let spatial = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial.clone(),
            train,
            step: Some(offset),
            path_element_ids: Some(vec![1]),
            gravity_direction: None,
        });
        if accepted {
            assert_eq!(planar.unwrap().num_positions, 2);
            assert_eq!(spatial.unwrap().num_positions, 2);
        } else {
            let error = "Moving loads: axle position cannot be resolved at a path joint";
            assert_eq!(planar.unwrap_err(), error);
            assert_eq!(spatial.unwrap_err(), error);
        }
    }
}

#[test]
fn review_2104_reversed_interior_axle_cancels_coincident_load() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    use dedaliano_engine::solver::{
        linear::{solve_2d, solve_3d},
        moving_loads::{build_load_path, build_load_path_3d, moving_loads_at_position_2d, moving_loads_at_position_3d},
    };

    let mut solver = review_beam(0.0);
    solver.nodes.get_mut("2").unwrap().z = 64.0;
    solver.nodes.insert(
        "3".into(),
        SolverNode {
            id: 3,
            x: 0.1,
            z: 64.0,
        },
    );
    let mut reverse = solver.elements["1"].clone();
    reverse.id = 2;
    reverse.node_i = 3;
    reverse.node_j = 2;
    solver.elements.insert("2".into(), reverse);
    let mut fixed = solver.supports["2"].clone();
    fixed.id = 3;
    fixed.node_id = 3;
    solver.supports.insert("3".into(), fixed);
    let weight = 100.0;
    let station = 0.1 - 0.0625;
    let position = 64.0625;
    let path_ids = [1, 2];
    solver
        .loads
        .push(SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2,
            a: station,
            p: -weight,
            px: None,
            my: None,
        }));
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let train = |weight| LoadTrain {
        name: "coincident".into(),
        axles: vec![Axle { offset: 0.0, weight }],
    };
    let planar = |weight| {
        solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(),
            train: train(weight),
            step: Some(position),
            path_element_ids: Some(path_ids.to_vec()),
        })
        .unwrap()
    };
    let spatial_envelope = |weight| {
        solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial.clone(),
            train: train(weight),
            step: Some(position),
            path_element_ids: Some(path_ids.to_vec()),
            gravity_direction: None,
        })
        .unwrap()
    };
    let reference = &planar(0.0).elements["2"];
    let actual = &planar(weight).elements["2"];
    assert_force(actual.v_max_neg, reference.v_max_neg);
    assert_force(actual.v_max_pos, reference.v_max_pos);
    let reference = &spatial_envelope(0.0).elements["2"];
    let actual = &spatial_envelope(weight).elements["2"];
    assert_force(actual.vz_max_neg, reference.vz_max_neg);
    assert_force(actual.vz_max_pos, reference.vz_max_pos);

    let path = build_load_path(&solver, Some(&path_ids)).unwrap();
    let mut planar_sample = solver;
    planar_sample.loads = moving_loads_at_position_2d(&planar_sample, &train(weight), &path, position).unwrap();
    let [SolverLoad::PointOnElement(permanent), SolverLoad::PointOnElement(axle)] = planar_sample.loads.as_slice() else {
        panic!("expected the permanent point load and the axle");
    };
    assert_eq!(axle.element_id, 2);
    assert_eq!(axle.a, station);
    assert_eq!(axle.a, permanent.a);
    assert_force(axle.p, weight);
    assert_force(axle.p + permanent.p, 0.0);
    let result = solve_2d(&planar_sample).unwrap();
    let member = result.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    assert_force(member.v_start, 0.0);
    assert_force(member.v_end, 0.0);
    let t = station / member.length;
    for cut in [t / 2.0, (1.0 + t) / 2.0] {
        let shear = dedaliano_engine::postprocess::diagrams::compute_diagram_value_at("shear", cut, member);
        assert_force(shear, 0.0);
    }

    let path = build_load_path_3d(&spatial, Some(&path_ids)).unwrap();
    let mut spatial_sample = spatial;
    spatial_sample.loads = moving_loads_at_position_3d(&spatial_sample, &train(weight), "z", &path, position).unwrap();
    let [SolverLoad3D::PointOnElement(permanent), SolverLoad3D::PointOnElement(axle)] = spatial_sample.loads.as_slice() else {
        panic!("expected the permanent point load and the axle");
    };
    assert_eq!(axle.element_id, 2);
    assert_eq!(axle.a, station);
    assert_eq!(axle.a, permanent.a);
    assert_force(axle.pz, -weight);
    assert_force(axle.pz + permanent.pz, 0.0);
    let result = solve_3d(&spatial_sample).unwrap();
    let member = result.element_forces.iter().find(|f| f.element_id == 2).unwrap();
    assert_force(member.vz_start, 0.0);
    assert_force(member.vz_end, 0.0);
    let t = station / member.length;
    for cut in [t / 2.0, (1.0 + t) / 2.0] {
        let shear = dedaliano_engine::postprocess::diagrams_3d::checked_diagram_value_3d(member, "shearZ", cut).unwrap();
        assert_force(shear, 0.0);
    }
}

#[test]
fn simultaneous_entrance_and_exit_use_the_same_travel_direction() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let length = 10.0;
    let weight = 100.0;
    let solver = review_beam(length);
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let train = LoadTrain {
        name: "axle spacing equals route length".into(),
        axles: vec![
            Axle { offset: 0.0, weight },
            Axle { offset: length, weight },
        ],
    };
    let planar = solve_moving_loads_2d(&MovingLoadInput {
        solver,
        train: train.clone(),
        path_element_ids: Some(vec![1]),
        step: Some(length),
    })
    .unwrap();
    let spatial = solve_moving_loads_3d(&MovingLoadInput3D {
        solver: spatial,
        train,
        path_element_ids: Some(vec![1]),
        step: Some(length),
        gravity_direction: None,
    })
    .unwrap();
    assert_force(planar.elements["1"].v_max_neg, -weight);
    assert_force(spatial.elements["1"].vz_max_neg, -weight);
}

#[test]
#[ignore = "known wrong result: #2101"]
fn distant_axle_does_not_snap_an_exact_interior_sample() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};

    let mut solver = review_beam(1.0);
    let mut support = solver.supports.remove("2").unwrap();
    support.id = 1;
    support.node_id = 1;
    solver.supports.insert("1".into(), support);
    let spatial = embed_2d(&solver, Plane::XZ).unwrap();
    let offset = 2.0f64.powi(42);
    let weight = 100.0;
    let train = LoadTrain {
        name: "widely spaced axles".into(),
        axles: vec![Axle { offset: 0.0, weight }, Axle { offset, weight }],
    };
    for (station, moment) in [(1.0 / 256.0, weight / 256.0), (0.0, 0.0), (1.0 + 1.0 / 256.0, 0.0)] {
        let step = Some(offset + station);
        let planar = solve_moving_loads_2d(&MovingLoadInput {
            solver: solver.clone(), train: train.clone(), step, path_element_ids: Some(vec![1]),
        }).unwrap();
        let spatial = solve_moving_loads_3d(&MovingLoadInput3D {
            solver: spatial.clone(), train: train.clone(), step, path_element_ids: Some(vec![1]), gravity_direction: None,
        }).unwrap();
        let p = &planar.elements["1"];
        let s = &spatial.elements["1"];
        assert_force(p.m_max_pos - p.m_max_neg, moment);
        assert_force(s.my_max_pos - s.my_max_neg, moment);
    }
}
