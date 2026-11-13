use dedaliano_engine::{
    metamorphic::{
        compare::{self, Parts},
        conditioning,
        planes::{embed_2d, Plane},
        transform::{transform_2d, transform_3d, Iso2, Iso3},
        units::{scale_2d, scale_3d, Units},
    },
    solver::{
        linear,
        ssi::{self, SSIInput, SSIInput3D},
    },
    types::{SolverInput, SolverInput3D},
};
use serde_json::{json, Value};

fn witness(key: &str) -> SolverInput {
    let all: Value =
        serde_json::from_str(include_str!("../fixtures/nightly-2026-11-13.json")).unwrap();
    serde_json::from_value(all[key].clone()).unwrap()
}

fn models2() -> Vec<SolverInput> {
    let base = witness("2011");
    let mut out = vec![base.clone(), witness("transformed-2011")];
    for angle in [0.17, 0.63, 1.21] {
        out.push(transform_2d(&base, &Iso2::rotation(angle)).unwrap());
    }
    out.into_iter()
        .flat_map(|s| {
            [
                Units::froude(1.0, 1.0),
                Units::froude(0.001, 1000.0),
                Units::froude(1000.0, 0.001),
            ]
            .map(|u| scale_2d(&s, &u))
        })
        .collect()
}

fn models3() -> Vec<SolverInput3D> {
    let mut base = embed_2d(&witness("transformed-2011"), Plane::XZ).unwrap();
    base.supports.retain(|_, support| support.node_id == 1);
    let mut out = vec![base.clone()];
    for angles in [[0.17, 0.0, 0.0], [0.0, 0.63, 0.0], [0.17, 0.63, 1.21]] {
        out.push(transform_3d(&base, &Iso3::from_euler(angles[0], angles[1], angles[2])).unwrap());
    }
    out.into_iter()
        .flat_map(|s| {
            [
                Units::froude(1.0, 1.0),
                Units::froude(0.001, 1000.0),
                Units::froude(1000.0, 0.001),
            ]
            .map(|u| scale_3d(&s, &u))
        })
        .collect()
}

fn compare2(s: &SolverInput, r: &ssi::SSIResult) {
    let c = conditioning::of_2d(s).unwrap();
    assert!(c.rel() < conditioning::INCONCLUSIVE);
    compare::compare(
        &compare::flat_2d(&r.results, Parts::ALL),
        &compare::flat_2d(&linear::solve_2d(s).unwrap(), Parts::ALL),
        c.lchar,
        c.rel(),
    )
    .unwrap();
}

fn compare3(s: &SolverInput3D, r: &ssi::SSIResult3D) {
    let c = conditioning::of_3d(s).unwrap();
    assert!(c.rel() < conditioning::INCONCLUSIVE);
    compare::compare(
        &compare::flat_3d(&r.results, Parts::ALL),
        &compare::flat_3d(&linear::solve_3d(s).unwrap(), Parts::ALL),
        c.lchar,
        c.rel(),
    )
    .unwrap();
}

fn record(cases: &mut Vec<Value>, api: &str, input: Value, expected: Value) {
    let returned = match api {
        "solve_ssi_2d" => dedaliano_engine::solve_ssi_2d(&input.to_string()),
        "solve_ssi_3d" => dedaliano_engine::solve_ssi_3d(&input.to_string()),
        _ => unreachable!(),
    }
    .unwrap();
    assert_eq!(serde_json::from_str::<Value>(&returned).unwrap(), expected);
    cases.push(json!({"api":api,"inputText":input.to_string(),"input":input,"expected":expected}));
}

fn export(cases: &[Value], dimension: usize) {
    if let Ok(path) = std::env::var("SSI_ELASTIC_2011_CASES") {
        let mut cases = cases.to_vec();
        if dimension <= 5 {
            for case in &mut cases {
                case["requiredConvergence"] = json!(true);
            }
        }
        std::fs::write(
            format!("{path}.{dimension}.json"),
            serde_json::to_vec(&cases).unwrap(),
        )
        .unwrap();
    }
}

#[test]
fn no_soil_2d_matches_linear_rotations_and_units() {
    let mut cases = Vec::new();
    let mut failures = Vec::new();
    let mut models = models2();
    let constrained: SSIInput =
        serde_json::from_str(include_str!("ssi-constrained-761.json")).unwrap();
    models.push(constrained.solver);
    for (i, solver) in models.into_iter().enumerate() {
        let input = SSIInput {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let result = ssi::solve_ssi_2d(&input).unwrap();
        if !result.converged {
            failures.push(i);
        }
        compare2(&input.solver, &result);
        record(
            &mut cases,
            "solve_ssi_2d",
            serde_json::to_value(&input).unwrap(),
            serde_json::to_value(&result).unwrap(),
        );
    }
    export(&cases, 2);
    assert!(failures.is_empty(), "unconverged 2D cells: {failures:?}");
}

#[test]
fn no_soil_3d_matches_linear_rotations_and_units() {
    let mut cases = Vec::new();
    let mut failures = Vec::new();
    let mut models = models3();
    let constrained: SSIInput3D =
        serde_json::from_str(include_str!("ssi-constrained-3d-761.json")).unwrap();
    models.push(constrained.solver);
    for (i, solver) in models.into_iter().enumerate() {
        let input = SSIInput3D {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let result = ssi::solve_ssi_3d(&input).unwrap();
        if !result.converged {
            failures.push(i);
        }
        compare3(&input.solver, &result);
        record(
            &mut cases,
            "solve_ssi_3d",
            serde_json::to_value(&input).unwrap(),
            serde_json::to_value(&result).unwrap(),
        );
    }
    export(&cases, 3);
    assert!(failures.is_empty(), "unconverged 3D cells: {failures:?}");
}

#[test]
fn nonlinear_soil_and_exhaustion_keep_main_results() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("ssi-elastic-2011-controls.json")).unwrap();
    assert_eq!(cases.len(), 8);
    let mut output = Vec::new();
    for case in cases {
        let api = case["api"].as_str().unwrap();
        let input = &case["input"];
        let actual = if api == "solve_ssi_2d" {
            serde_json::to_value(
                ssi::solve_ssi_2d(&serde_json::from_value(input.clone()).unwrap()).unwrap(),
            )
            .unwrap()
        } else {
            serde_json::to_value(
                ssi::solve_ssi_3d(&serde_json::from_value(input.clone()).unwrap()).unwrap(),
            )
            .unwrap()
        };
        assert_bits(&actual, &case["expected"]);
        record(&mut output, api, input.clone(), actual);
    }
    export(&output, 7);
}

fn assert_bits(actual: &Value, expected: &Value) {
    assert_eq!(actual, expected);
    match (actual, expected) {
        (Value::Number(a), Value::Number(e)) => {
            assert_eq!(a.as_f64().unwrap().to_bits(), e.as_f64().unwrap().to_bits())
        }
        (Value::Array(a), Value::Array(e)) => {
            for (a, e) in a.iter().zip(e) {
                assert_bits(a, e);
            }
        }
        (Value::Object(a), Value::Object(e)) => {
            for (k, e) in e {
                assert_bits(&a[k], e);
            }
        }
        _ => {}
    }
}

fn copies(s: &SolverInput, count: usize) -> SolverInput {
    let mut out = s.clone();
    out.nodes.clear();
    out.elements.clear();
    out.supports.clear();
    out.loads.clear();
    for i in 0..count {
        for node in s.nodes.values() {
            let mut node = node.clone();
            node.id += 2 * i;
            out.nodes.insert(node.id.to_string(), node);
        }
        let mut e = s.elements.values().next().unwrap().clone();
        e.id = i + 1;
        e.node_i += 2 * i;
        e.node_j += 2 * i;
        out.elements.insert(e.id.to_string(), e);
        let mut support = s.supports.values().next().unwrap().clone();
        support.id = i + 1;
        support.node_id += 2 * i;
        out.supports.insert(support.id.to_string(), support);
        let mut load = s.loads[0].clone();
        if let dedaliano_engine::types::SolverLoad::Distributed(ref mut l) = load {
            l.element_id = i + 1;
        } else {
            panic!();
        }
        out.loads.push(load);
    }
    out
}

#[test]
fn sparse_dispatch_boundary_preserves_elastic_answers() {
    let mut failures = Vec::new();
    let mut cases = Vec::new();
    for count in [21, 22] {
        let solver = copies(&witness("transformed-2011"), count);
        let input = SSIInput {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let r = ssi::solve_ssi_2d(&input).unwrap();
        if !r.converged {
            failures.push(format!("2d {count}"));
        }
        compare2(&input.solver, &r);
        record(
            &mut cases,
            "solve_ssi_2d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
    }
    for count in [10, 11] {
        let mut solver = embed_2d(&copies(&witness("transformed-2011"), count), Plane::XZ).unwrap();
        solver.supports.retain(|_, s| s.node_id % 2 == 1);
        let input = SSIInput3D {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let r = ssi::solve_ssi_3d(&input).unwrap();
        if !r.converged {
            failures.push(format!("3d {count}"));
        }
        compare3(&input.solver, &r);
        record(
            &mut cases,
            "solve_ssi_3d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
    }
    export(&cases, 4);
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn soil_in_its_linear_range_uses_elastic_equilibrium() {
    let mut failures = Vec::new();
    let mut cases = Vec::new();
    for solver in [witness("2011"), witness("transformed-2011")] {
        let mut compliance_model = solver.clone();
        compliance_model.loads = vec![dedaliano_engine::types::SolverLoad::Nodal(
            dedaliano_engine::types::SolverNodalLoad {
                node_id: 2,
                fx: 1.0,
                fz: 0.0,
                my: 0.0,
            },
        )];
        let compliance = linear::solve_2d(&compliance_model).unwrap();
        let stiffness = 1.0
            / compliance
                .displacements
                .iter()
                .find(|d| d.node_id == 2)
                .unwrap()
                .ux;
        assert!(stiffness.is_finite() && stiffness > 0.0);
        let reference = linear::solve_2d(&solver).unwrap();
        let tip = reference
            .displacements
            .iter()
            .find(|d| d.node_id == 2)
            .unwrap();
        let end = tip.ux.abs().max(tip.uz.abs()) * 4.0;
        let spring = ssi::SoilSpring {
            node_id: 2,
            direction: 0,
            tributary_length: 1.0,
            curve: dedaliano_engine::solver::soil_curves::SoilCurve::Custom {
                points: vec![[0.0, 0.0], [end, end * stiffness]],
            },
        };
        let input = SSIInput {
            solver: solver.clone(),
            soil_springs: vec![spring.clone()],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let r = ssi::solve_ssi_2d(&input).unwrap();
        if !r.converged {
            failures.push("2d");
        }
        assert!(r.spring_results[0].reaction != 0.0);
        let mut equivalent = solver.clone();
        equivalent.supports.insert(
            "2".into(),
            serde_json::from_value(json!({"id":2,"nodeId":2,"type":"spring","kx":stiffness}))
                .unwrap(),
        );
        let c = conditioning::of_2d(&equivalent).unwrap();
        assert!(c.rel() < conditioning::INCONCLUSIVE);
        let expected = linear::solve_2d(&equivalent).unwrap();
        assert!(
            compare::compare(
                &compare::flat_2d(&reference, Parts::DISPLACEMENTS),
                &compare::flat_2d(&expected, Parts::DISPLACEMENTS),
                c.lchar,
                c.rel(),
            )
            .is_err(),
            "dropping the 2D spring must change the answer"
        );
        compare::compare(
            &compare::flat_2d(&r.results, Parts::DISPLACEMENTS),
            &compare::flat_2d(&expected, Parts::DISPLACEMENTS),
            c.lchar,
            c.rel(),
        )
        .unwrap();
        record(
            &mut cases,
            "solve_ssi_2d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
        let mut spatial = embed_2d(&solver, Plane::XZ).unwrap();
        spatial.supports.retain(|_, s| s.node_id == 1);
        let input = SSIInput3D {
            solver: spatial,
            soil_springs: vec![spring],
            max_iter: 50,
            tolerance: 1e-10,
        };
        let r = ssi::solve_ssi_3d(&input).unwrap();
        if !r.converged {
            failures.push("3d");
        }
        assert!(r.spring_results[0].reaction != 0.0);
        let mut equivalent = input.solver.clone();
        equivalent.supports.insert("2".into(), serde_json::from_value(json!({"nodeId":2,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":stiffness})).unwrap());
        let c = conditioning::of_3d(&equivalent).unwrap();
        assert!(c.rel() < conditioning::INCONCLUSIVE);
        let expected = linear::solve_3d(&equivalent).unwrap();
        assert!(
            compare::compare(
                &compare::flat_3d(
                    &linear::solve_3d(&input.solver).unwrap(),
                    Parts::DISPLACEMENTS
                ),
                &compare::flat_3d(&expected, Parts::DISPLACEMENTS),
                c.lchar,
                c.rel(),
            )
            .is_err(),
            "dropping the 3D spring must change the answer"
        );
        compare::compare(
            &compare::flat_3d(&r.results, Parts::DISPLACEMENTS),
            &compare::flat_3d(&expected, Parts::DISPLACEMENTS),
            c.lchar,
            c.rel(),
        )
        .unwrap();

        record(
            &mut cases,
            "solve_ssi_3d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
    }
    export(&cases, 5);
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn unchanged_residual_and_iteration_limits_still_refuse() {
    let mut cases = Vec::new();
    for (tolerance, limit, converged) in [
        (1e-10, 0, false),
        (1e-10, 1, false),
        (1e-10, 50, true),
        (1e-18, 50, false),
    ] {
        let input = SSIInput {
            solver: witness("transformed-2011"),
            soil_springs: vec![],
            max_iter: limit,
            tolerance,
        };
        let r = ssi::solve_ssi_2d(&input).unwrap();
        assert_eq!(r.converged, converged, "2D {tolerance} {limit}");
        record(
            &mut cases,
            "solve_ssi_2d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
        let input = SSIInput3D {
            solver: models3().remove(0),
            soil_springs: vec![],
            max_iter: limit,
            tolerance,
        };
        let r = ssi::solve_ssi_3d(&input).unwrap();
        assert_eq!(r.converged, converged, "3D {tolerance} {limit}");
        record(
            &mut cases,
            "solve_ssi_3d",
            serde_json::to_value(input).unwrap(),
            serde_json::to_value(r).unwrap(),
        );
    }
    let mut solver = witness("2011");
    solver.elements.clear();
    solver.nodes.retain(|_, n| n.id == 2);
    solver.supports.clear();
    solver.supports.insert(
        "2".into(),
        serde_json::from_value(json!({"id":2,"nodeId":2,"type":"guidedX"})).unwrap(),
    );
    solver.loads = vec![dedaliano_engine::types::SolverLoad::Nodal(
        dedaliano_engine::types::SolverNodalLoad {
            node_id: 2,
            fx: -2.0,
            fz: 0.0,
            my: 0.0,
        },
    )];
    let spring = ssi::SoilSpring {
        node_id: 2,
        direction: 0,
        tributary_length: 1.0,
        curve: dedaliano_engine::solver::soil_curves::SoilCurve::Custom {
            points: vec![[0.0, 0.0], [1.0, 1.0]],
        },
    };
    let input = SSIInput {
        solver: solver.clone(),
        soil_springs: vec![spring.clone()],
        max_iter: 50,
        tolerance: 1e-10,
    };
    let r = ssi::solve_ssi_2d(&input).unwrap();
    assert!(!r.converged);
    assert_eq!(r.iterations, 50);
    record(
        &mut cases,
        "solve_ssi_2d",
        serde_json::to_value(input).unwrap(),
        serde_json::to_value(r).unwrap(),
    );
    let input = SSIInput3D {
        solver: embed_2d(&solver, Plane::XZ).unwrap(),
        soil_springs: vec![spring],
        max_iter: 50,
        tolerance: 1e-10,
    };
    let r = ssi::solve_ssi_3d(&input).unwrap();
    assert!(!r.converged);
    assert_eq!(r.iterations, 50);
    record(
        &mut cases,
        "solve_ssi_3d",
        serde_json::to_value(input).unwrap(),
        serde_json::to_value(r).unwrap(),
    );
    for displacement in [0.0, -0.0, f64::from_bits(1), -f64::from_bits(1)] {
        let mut solver = witness("2011");
        solver.supports.values_mut().next().unwrap().dx = Some(displacement);
        let input = SSIInput {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        if displacement == 0.0 {
            let r = ssi::solve_ssi_2d(&input).unwrap();
            assert!(r.converged);
            record(
                &mut cases,
                "solve_ssi_2d",
                serde_json::to_value(input).unwrap(),
                serde_json::to_value(r).unwrap(),
            );
        } else {
            assert!(ssi::solve_ssi_2d(&input)
                .unwrap_err()
                .contains("prescribed"));
            cases.push(json!({"api":"solve_ssi_2d","input":input,"error":"prescribed"}));
        }
        let mut solver = models3().remove(0);
        solver.supports.values_mut().next().unwrap().dx = Some(displacement);
        let input = SSIInput3D {
            solver,
            soil_springs: vec![],
            max_iter: 50,
            tolerance: 1e-10,
        };
        if displacement == 0.0 {
            let r = ssi::solve_ssi_3d(&input).unwrap();
            assert!(r.converged);
            record(
                &mut cases,
                "solve_ssi_3d",
                serde_json::to_value(input).unwrap(),
                serde_json::to_value(r).unwrap(),
            );
        } else {
            assert!(ssi::solve_ssi_3d(&input)
                .unwrap_err()
                .contains("prescribed"));
            cases.push(json!({"api":"solve_ssi_3d","input":input,"error":"prescribed"}));
        }
    }
    export(&cases, 6);
}

fn settled_nonlinear_matches_main(api: &str, dimension: usize) {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("ssi-settled-nonlinear-2072.json")).unwrap();
    let mut output = Vec::new();
    for case in cases.into_iter().filter(|c| c["api"] == api) {
        let input = &case["input"];
        let actual = if api == "solve_ssi_2d" {
            let input: SSIInput = serde_json::from_value(input.clone()).unwrap();
            let dofs = dedaliano_engine::solver::dof::DofNumbering::build_2d(&input.solver);
            assert_eq!(dofs.n_free >= linear::SPARSE_THRESHOLD, case["count"] != 1);
            serde_json::to_value(ssi::solve_ssi_2d(&input).unwrap()).unwrap()
        } else {
            let input: SSIInput3D = serde_json::from_value(input.clone()).unwrap();
            let dofs = dedaliano_engine::solver::dof::DofNumbering::build_3d(&input.solver);
            assert_eq!(dofs.n_free >= linear::SPARSE_THRESHOLD, case["count"] != 1);
            serde_json::to_value(ssi::solve_ssi_3d(&input).unwrap()).unwrap()
        };
        let mut previous_input = input.clone();
        previous_input["maxIter"] = json!(case["expected"]["iterations"].as_u64().unwrap() - 1);
        let previous = if api == "solve_ssi_2d" {
            serde_json::to_value(
                ssi::solve_ssi_2d(&serde_json::from_value(previous_input).unwrap()).unwrap(),
            )
            .unwrap()
        } else {
            serde_json::to_value(
                ssi::solve_ssi_3d(&serde_json::from_value(previous_input).unwrap()).unwrap(),
            )
            .unwrap()
        };
        let old = previous["springResults"][0]["secantStiffness"]
            .as_f64()
            .unwrap();
        let new = case["expected"]["springResults"][0]["secantStiffness"]
            .as_f64()
            .unwrap();
        assert!(
            (new - old).abs() / old.abs().max(new.abs()) < input["tolerance"].as_f64().unwrap(),
            "secant must have settled: {api} {} {}",
            case["count"],
            input["tolerance"]
        );
        let spring = &case["expected"]["springResults"][0];
        assert!(
            spring["displacement"].as_f64().unwrap().abs()
                > input["soilSprings"][0]["curve"]["points"][1][0]
                    .as_f64()
                    .unwrap()
        );
        assert_bits(&actual, &case["expected"]);
        record(&mut output, api, input.clone(), actual);
    }
    assert_eq!(output.len(), 6);
    export(&output, dimension);
}

#[test]
#[ignore = "known wrong result: #2072"]
fn settled_nonlinear_2d_is_bit_identical_to_main() {
    settled_nonlinear_matches_main("solve_ssi_2d", 8);
}

#[test]
#[ignore = "known wrong result: #2072"]
fn settled_nonlinear_3d_is_bit_identical_to_main() {
    settled_nonlinear_matches_main("solve_ssi_3d", 9);
}
