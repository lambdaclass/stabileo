use dedaliano_engine::{
    certify,
    metamorphic::planes::{embed_2d, Plane},
    solver::{constraints, linear, pdelta},
    types::*,
};

fn witness(key: &str) -> SolverInput {
    let all: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/truss-balance-1969.json")).unwrap();
    serde_json::from_value(all[key].clone()).unwrap()
}

fn finite<T: serde::Serialize>(r: &T) {
    assert!(certify::finite::non_finite_paths(r).is_empty());
}

fn assert_displacements<T: serde::Serialize>(a: &T, b: &T) {
    fn compare(a: &serde_json::Value, b: &serde_json::Value) {
        match (a, b) {
            (serde_json::Value::Number(a), serde_json::Value::Number(b)) => {
                let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
                assert!((a - b).abs() <= 1e-8 * a.abs().max(b.abs()).max(1.0));
            }
            (serde_json::Value::Array(a), serde_json::Value::Array(b)) => {
                assert_eq!(a.len(), b.len());
                for (a, b) in a.iter().zip(b) {
                    compare(a, b);
                }
            }
            (serde_json::Value::Object(a), serde_json::Value::Object(b)) => {
                assert_eq!(a.len(), b.len());
                for (k, a) in a {
                    compare(a, &b[k]);
                }
            }
            _ => assert_eq!(a, b),
        }
    }
    compare(
        &serde_json::to_value(a).unwrap(),
        &serde_json::to_value(b).unwrap(),
    );
}

#[test]
fn issue_1969_transverse_truss_member_loads_reach_the_balance_check() {
    let input = witness("1969");
    let reference = linear::solve_2d(&witness("nodal-1969")).unwrap();
    let typed = serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap();
    for result in [
        linear::solve_2d(&input),
        linear::solve_2d_typed(&typed),
        linear::prepare_static_2d_dense_reference(&input)
            .unwrap()
            .solve_loads(&input.loads),
        linear::prepare_static_2d(&input)
            .unwrap()
            .solve_loads(&input.loads),
    ] {
        let result = result.unwrap();
        finite(&result);
        assert_displacements(&result.displacements, &reference.displacements);
    }
}

#[test]
fn issue_1969_transverse_truss_actions_survive_a_3d_embedding() {
    let input = embed_2d(&witness("1969"), Plane::XZ).unwrap();
    let reference =
        linear::solve_3d(&embed_2d(&witness("nodal-1969"), Plane::XZ).unwrap()).unwrap();
    for result in [
        linear::solve_3d(&input),
        linear::prepare_static_3d(&input)
            .unwrap()
            .solve_loads(&input.loads),
    ] {
        let result = result.unwrap();
        finite(&result);
        assert_displacements(&result.displacements, &reference.displacements);
    }
}

#[test]
fn issue_1969_nonlinear_initial_balance_accepts_member_actions() {
    let input = witness("1969");
    let input3 = embed_2d(&input, Plane::XZ).unwrap();
    let r = pdelta::solve_pdelta_2d(&input, 1, f64::EPSILON).unwrap();
    finite(&r.linear_results);
    let r = pdelta::solve_pdelta_3d(&input3, 1, f64::EPSILON).unwrap();
    finite(&r.linear_results);
}

#[test]
fn issue_1969_equivalent_nodal_actions_return_an_answer() {
    let input = witness("nodal-1969");
    let result = linear::solve_2d(&input).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), input.nodes.len());
    let result = linear::solve_3d(&embed_2d(&input, Plane::XZ).unwrap()).unwrap();
    finite(&result);
    assert_eq!(result.displacements.len(), input.nodes.len());
}

fn constrained_family(input: serde_json::Value, copies: usize) -> serde_json::Value {
    let mut out = input.clone();
    for field in ["nodes", "elements", "supports"] {
        out[field] = serde_json::json!({});
    }
    out["loads"] = serde_json::json!([]);
    for copy in 0..copies {
        let offset = copy * 100;
        for field in ["nodes", "elements", "supports"] {
            for (key, v) in input[field].as_object().unwrap() {
                let mut v = v.clone();
                for id in ["id", "nodeId", "nodeI", "nodeJ"] {
                    if let Some(n) = v[id].as_u64() {
                        v[id] = (n as usize + offset).into();
                    }
                }
                out[field][(key.parse::<usize>().unwrap() + offset).to_string()] = v;
            }
        }
        for load in input["loads"].as_array().unwrap() {
            let mut load = load.clone();
            for field in ["elementId", "nodeId"] {
                if let Some(id) = load["data"][field].as_u64() {
                    load["data"][field] = (id as usize + offset).into();
                }
            }
            out["loads"].as_array_mut().unwrap().push(load);
        }
    }
    out
}

#[test]
fn issue_1969_constrained_dense_and_sparse_balance_accept_member_actions() {
    for copies in [1, 4] {
        let original = witness("1969");
        let embedded = embed_2d(&original, Plane::XZ).unwrap();
        let constraint = serde_json::Value::Array((0..copies).map(|copy| serde_json::json!({"type":"equalDOF","masterNode":1+copy*100,"slaveNode":2+copy*100,"dofs":[0]})).collect());
        let input = constraints::ConstrainedInput {
            solver: serde_json::from_value(constrained_family(
                serde_json::to_value(original).unwrap(),
                copies,
            ))
            .unwrap(),
            constraints: serde_json::from_value(constraint.clone()).unwrap(),
        };
        finite(&constraints::solve_constrained_2d(&input).unwrap());
        let input = constraints::ConstrainedInput3D {
            solver: serde_json::from_value(constrained_family(
                serde_json::to_value(embedded).unwrap(),
                copies,
            ))
            .unwrap(),
            constraints: serde_json::from_value(constraint).unwrap(),
        };
        finite(&constraints::solve_constrained_3d(&input).unwrap());
    }
}

#[test]
fn constrained_nodal_controls_and_redundant_fixed_restraints_return_answers() {
    for dimension in [2, 3] {
        for copies in [1, 4] {
            for slave in [2, 3] {
                let original = witness("nodal-1969");
                let original = if dimension == 2 {
                    serde_json::to_value(original).unwrap()
                } else {
                    serde_json::to_value(embed_2d(&original, Plane::XZ).unwrap()).unwrap()
                };
                let solver = constrained_family(original, copies);
                let c = serde_json::Value::Array((0..copies).map(|copy| serde_json::json!({"type":"equalDOF","masterNode":1+copy*100,"slaveNode":slave+copy*100,"dofs":[0]})).collect());
                let result = if dimension == 2 {
                    constraints::solve_constrained_2d(&constraints::ConstrainedInput {
                        solver: serde_json::from_value(solver).unwrap(),
                        constraints: serde_json::from_value(c).unwrap(),
                    })
                    .map(|r| finite(&r))
                } else {
                    constraints::solve_constrained_3d(&constraints::ConstrainedInput3D {
                        solver: serde_json::from_value(solver).unwrap(),
                        constraints: serde_json::from_value(c).unwrap(),
                    })
                    .map(|r| finite(&r))
                };
                assert!(
                    result.is_ok(),
                    "{dimension}D {copies} copies slave {slave}: {result:?}"
                );
            }
        }
    }
}

fn member_load_class(kind: &str) {
    for point in [false, true] {
        let mut input = witness("1969");
        input.elements.get_mut("5").unwrap().elem_type = kind.into();
        if point {
            let SolverLoad::Distributed(load) = &input.loads[0] else {
                panic!()
            };
            let element = &input.elements["5"];
            let (a, b) = (
                &input.nodes[&element.node_i.to_string()],
                &input.nodes[&element.node_j.to_string()],
            );
            let length = (b.x - a.x).hypot(b.z - a.z);
            input.loads =
                serde_json::from_value(serde_json::json!([{"type":"pointOnElement","data":{
                    "elementId":5,"p":load.q_i,"px":load.q_j,"a":length/3.0
                }}]))
                .unwrap();
        }
        finite(&linear::solve_2d(&input).unwrap());
        finite(
            &pdelta::solve_pdelta_2d(&input, 1, f64::EPSILON)
                .unwrap()
                .linear_results,
        );
        let input = embed_2d(&input, Plane::XZ).unwrap();
        finite(&linear::solve_3d(&input).unwrap());
        finite(
            &pdelta::solve_pdelta_3d(&input, 1, f64::EPSILON)
                .unwrap()
                .linear_results,
        );
    }
}

#[test]
fn truss_distributed_and_point_actions_reach_linear_and_nonlinear_solvers() {
    member_load_class("truss");
}

#[test]
fn frame_distributed_and_point_actions_reach_linear_and_nonlinear_solvers() {
    member_load_class("frame");
}

#[test]
fn issue_2075_constrained_nodal_answers_match_independent_high_precision_solution() {
    let audit: serde_json::Value = serde_json::from_str(include_str!(
        "../../../docs/verification/constraint-rounding-2075.json"
    ))
    .unwrap();
    for (case, slave) in [(1, 2), (2, 3)] {
        let expected: Vec<Vec<f64>> = audit[case]["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| {
                row.as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap().parse().unwrap())
                    .collect()
            })
            .collect();
        let scale = expected
            .iter()
            .flatten()
            .copied()
            .map(f64::abs)
            .fold(0.0, f64::max);
        for copies in [1, 4] {
            let base = witness("nodal-1969");
            let c: Vec<Constraint> = serde_json::from_value(serde_json::Value::Array((0..copies).map(|copy| serde_json::json!({"type":"equalDOF","masterNode":1+copy*100,"slaveNode":slave+copy*100,"dofs":[0]})).collect())).unwrap();
            let input = constraints::ConstrainedInput {
                solver: serde_json::from_value(constrained_family(
                    serde_json::to_value(&base).unwrap(),
                    copies,
                ))
                .unwrap(),
                constraints: c.clone(),
            };
            let result = constraints::solve_constrained_2d(&input).unwrap();
            finite(&result);
            assert_eq!(result.displacements.len(), base.nodes.len() * copies);
            for d in result.displacements {
                for (actual, reference) in [d.ux, d.uz, d.ry]
                    .into_iter()
                    .zip(&expected[d.node_id % 100 - 1])
                {
                    assert!(
                        (actual - reference).abs() <= 1e-8 * scale,
                        "2D node {}: {actual} != {reference}",
                        d.node_id
                    );
                }
            }
            let input = constraints::ConstrainedInput3D {
                solver: serde_json::from_value(constrained_family(
                    serde_json::to_value(embed_2d(&base, Plane::XZ).unwrap()).unwrap(),
                    copies,
                ))
                .unwrap(),
                constraints: c,
            };
            let result = constraints::solve_constrained_3d(&input).unwrap();
            finite(&result);
            assert_eq!(result.displacements.len(), base.nodes.len() * copies);
            for d in result.displacements {
                for (actual, reference) in [d.ux, d.uz, d.ry * Plane::XZ.normal()[1]]
                    .into_iter()
                    .zip(&expected[d.node_id % 100 - 1])
                {
                    assert!(
                        (actual - reference).abs() <= 1e-8 * scale,
                        "3D node {}: {actual} != {reference}",
                        d.node_id
                    );
                }
                assert_eq!([d.uy, d.rx, d.rz], [0.0; 3]);
            }
        }
    }
}
