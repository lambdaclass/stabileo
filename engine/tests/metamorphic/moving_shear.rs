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
        let mut cuts = vec![start, end];
        cuts.extend(
            axles
                .iter()
                .map(|&(x, _)| x)
                .filter(|&x| start < x && x < end),
        );
        cuts.sort_by(f64::total_cmp);
        let tip = reaction(
            axles
                .iter()
                .map(|&(x, weight)| weight * tip_flexibility(x, length, 1.0))
                .sum(),
        );
        for interval in cuts.windows(2) {
            let cut = (interval[0] + interval[1]) / 2.0;
            let downward = axles
                .iter()
                .filter(|&&(x, _)| x > cut)
                .map(|&(_, weight)| weight)
                .sum::<f64>();
            minimum = minimum.min(downward - tip);
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
#[ignore = "known wrong result: #2101"]
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
#[ignore = "known wrong result: #2104"]
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
#[ignore = "known wrong result: #2104"]
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
        (2.0 - 16.0 * f64::EPSILON, [0.0, 0.0]),
        (2.0 + 16.0 * f64::EPSILON, [0.0, 0.0]),
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
}
