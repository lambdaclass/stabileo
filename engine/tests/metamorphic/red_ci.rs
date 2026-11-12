use dedaliano_engine::{
    metamorphic::{
        planes::{embed_2d, Plane},
        relabel::Relabel,
    },
    solver::{
        linear, pdelta,
        ssi::{SSIInput, SSIInput3D},
    },
    types::*,
};
use serde_json::{json, Value};

pub(crate) fn calls() -> Vec<Value> {
    let s: SolverInput3D = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-shell-self-weight-mitc4-strip-equiv.json"
    ))
    .unwrap();
    let relabel = Relabel::random_3d(&s, 12758164673192605130);
    let mut calls = Vec::new();
    for solver in [s.clone(), relabel.apply_3d(&s, 12758164673192605130)] {
        for max_iter in [0, 100] {
            calls.push(json!({"api":"solve_pdelta_3d","input":solver,"maxIter":max_iter,"tolerance":1e-12,"converged":max_iter>0}));
        }
        let r = linear::solve_3d(&solver).unwrap();
        calls.push(json!({"api":"solve_3d","input":solver,"converged":true,"expectedDisplacements":r.displacements}));
    }
    let s: SolverInput =
        serde_json::from_str(include_str!("../fixtures/ex-cantilever-point-input.json")).unwrap();
    let r = pdelta::solve_pdelta_2d(&s, 100, 1e-12).unwrap();
    assert!(r.converged);
    calls.push(json!({"api":"solve_pdelta_2d","input":s,"maxIter":100,"tolerance":1e-12,"converged":true,"expectedDisplacements":r.results.displacements}));
    let input: SSIInput = serde_json::from_str(include_str!("ssi-constrained-761.json")).unwrap();
    for max_iter in [1, 300] {
        let mut input = input.clone();
        input.max_iter = max_iter;
        calls.push(json!({"api":"solve_ssi_2d","input":input,"converged":max_iter>1}));
        let mut spatial: SSIInput3D =
            serde_json::from_str(include_str!("ssi-constrained-3d-761.json")).unwrap();
        spatial.max_iter = max_iter;
        calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":max_iter>1}));
    }
    let pile: Value = serde_json::from_str(include_str!("ssi-axial-pile-761.json")).unwrap();
    for rigid in [false, true] {
        let mut input: SSIInput = serde_json::from_value(pile["input"].clone()).unwrap();
        if rigid {
            input.solver.constraints = serde_json::from_value(json!((2..=11)
                .map(|node| json!({"type":"equalDOF","masterNode":1,"slaveNode":node,"dofs":[1]}))
                .collect::<Vec<_>>()))
            .unwrap();
        }
        let capacity = json!({"delta":pile["delta"],"shaft":pile["shaft"],"tip":pile["tip"],"displacement":"uz"});
        calls.push(
            json!({"api":"solve_ssi_2d","input":input,"converged":rigid,"pileCapacity":capacity}),
        );
        for plane in Plane::ALL {
            let mut planar = input.solver.clone();
            planar.constraints.clear();
            let mut solver = embed_2d(&planar, plane).unwrap();
            let axis = if plane == Plane::XY { 1 } else { 2 };
            if rigid {
                solver.constraints = serde_json::from_value(json!((2..=11).map(|node| json!({"type":"equalDOF","masterNode":1,"slaveNode":node,"dofs":[axis]})).collect::<Vec<_>>())).unwrap();
            }
            let springs = input
                .soil_springs
                .iter()
                .map(|s| dedaliano_engine::solver::ssi::SoilSpring {
                    direction: axis,
                    ..s.clone()
                })
                .collect();
            let spatial = SSIInput3D {
                solver,
                soil_springs: springs,
                max_iter: input.max_iter,
                tolerance: input.tolerance,
            };
            let mut capacity = capacity.clone();
            capacity["displacement"] = json!(["ux", "uy", "uz"][axis]);
            calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":rigid,"pileCapacity":capacity}));
        }
    }
    let point = json!({"nodes":{"1":{"id":1,"x":0.0,"z":0.0}},
        "materials":{},"sections":{},"elements":{},
        "supports":{"1":{"id":1,"nodeId":1,"type":"spring","kx":1e16,"ky":1.0,"kz":1.0}},
        "loads":[{"type":"nodal","data":{"nodeId":1,"fx":1e16,"fz":0.0,"my":0.0}}]});
    let point: SolverInput = serde_json::from_value(point).unwrap();
    calls.push(json!({"api":"solve_2d","input":point,"converged":true,"expectedDisplacements":[{"nodeId":1,"ux":1.0,"uz":0.0,"ry":0.0}]}));
    for plane in Plane::ALL {
        let expected = if plane == Plane::YZ {
            json!({"nodeId":1,"ux":0.0,"uy":1.0,"uz":0.0})
        } else {
            json!({"nodeId":1,"ux":1.0,"uy":0.0,"uz":0.0})
        };
        calls.push(json!({"api":"solve_3d","input":embed_2d(&point,plane).unwrap(),"converged":true,"expectedDisplacements":[expected]}));
    }
    for tolerance in [1e-20, 1e-15] {
        for soil in [false, true] {
            let springs: Vec<dedaliano_engine::solver::ssi::SoilSpring> = if soil {
                serde_json::from_value(json!([{"nodeId":1,"direction":0,"tributaryLength":1.0,"curve":{"type":"custom","points":[[0.0,0.0],[2.0,2.0]]}}])).unwrap()
            } else {
                vec![]
            };
            let input = SSIInput {
                solver: point.clone(),
                soil_springs: springs.clone(),
                max_iter: 5,
                tolerance,
            };
            calls.push(json!({"api":"solve_ssi_2d","input":input,"converged":!soil || tolerance>1e-16,"smallSoilBalance":true,"expectedDisplacements":[{"nodeId":1,"ux":1.0,"uz":0.0,"ry":0.0}]}));
            for plane in Plane::ALL {
                let spatial = SSIInput3D {
                    solver: embed_2d(&point, plane).unwrap(),
                    soil_springs: springs
                        .iter()
                        .map(|s| dedaliano_engine::solver::ssi::SoilSpring {
                            direction: if plane == Plane::YZ { 1 } else { 0 },
                            ..s.clone()
                        })
                        .collect(),
                    max_iter: 5,
                    tolerance,
                };
                calls.push(json!({"api":"solve_ssi_3d","input":spatial,"converged":!soil || tolerance>1e-16,"smallSoilBalance":true,"expectedDisplacements":[if plane == Plane::YZ { json!({"nodeId":1,"ux":0.0,"uy":1.0,"uz":0.0}) } else { json!({"nodeId":1,"ux":1.0,"uy":0.0,"uz":0.0}) }]}));
            }
        }
    }
    for case in &mut calls {
        case["requireNodeCoverage"] = json!(true);
        if case["api"].as_str().unwrap().ends_with("3d") {
            if let Some(expected) = case["expectedDisplacements"].as_array_mut() {
                for d in expected {
                    for key in ["rx", "ry", "rz"] {
                        if d.get(key).is_none() {
                            d[key] = json!(0.0);
                        }
                    }
                }
            }
        }
    }
    calls
}

#[test]
fn export_native_and_wasm_cases() {
    if let Ok(path) = std::env::var("RED_CI_CASES") {
        std::fs::write(path, serde_json::to_vec(&calls()).unwrap()).unwrap();
    }
}

#[test]
fn strict_equilibrium_survives_numbering_and_constraints() {
    let calls = calls();
    for c in calls {
        check_result(&native_result(&c), &c);
    }
}

fn native_result(c: &Value) -> Value {
    let api = c["api"].as_str().unwrap();
    let text = c["input"].to_string();
    let max_iter = c["maxIter"].as_u64().unwrap_or(0) as usize;
    let result = match api {
        "solve_pdelta_2d" => dedaliano_engine::solve_pdelta_2d(&text, max_iter, 1e-12).unwrap(),
        "solve_pdelta_3d" => dedaliano_engine::solve_pdelta_3d(&text, max_iter, 1e-12).unwrap(),
        "solve_ssi_2d" => dedaliano_engine::solve_ssi_2d(&text).unwrap(),
        "solve_ssi_3d" => dedaliano_engine::solve_ssi_3d(&text).unwrap(),
        "solve_2d" => {
            return json!({"converged":true,"results":linear::solve_2d(&serde_json::from_str(&text).unwrap()).unwrap()})
        }
        "solve_3d" => {
            return json!({"converged":true,"results":linear::solve_3d(&serde_json::from_str(&text).unwrap()).unwrap()})
        }
        _ => panic!("unknown API"),
    };
    serde_json::from_str(&result).unwrap()
}

pub(crate) fn check_result(r: &Value, c: &Value) {
    assert_eq!(r["converged"], c["converged"], "{} convergence", c["api"]);
    crate::nonlinear_convergence::check_expected_displacements(r, c);
    check_capacity(r, c);
}

#[test]
fn r7_native_displacement_checks_reject_zero_answers_and_bad_node_coverage() {
    let mut accepted = Vec::new();
    let mut checked = 0;
    for c in calls()
        .into_iter()
        .filter(|c| c["expectedDisplacements"].is_array())
    {
        let actual = native_result(&c);
        check_result(&actual, &c);
        checked += 1;
        for mutation in [
            "zero",
            "missing",
            "duplicate",
            "extra",
            "reversed",
            "spurious-zero",
        ] {
            let mut wrong = actual.clone();
            let ds = wrong["results"]["displacements"].as_array_mut().unwrap();
            match mutation {
                "missing" => {
                    ds.pop();
                }
                "duplicate" => ds.push(ds[0].clone()),
                "extra" => {
                    let mut extra = ds[0].clone();
                    extra["nodeId"] = json!(usize::MAX);
                    ds.push(extra);
                }
                _ => {
                    for d in ds {
                        for key in ["ux", "uy", "uz", "rx", "ry", "rz"] {
                            if let Some(value) = d[key].as_f64() {
                                d[key] = json!(match mutation {
                                    "zero" => 0.0,
                                    "reversed" => -value,
                                    _ =>
                                        if value == 0.0 {
                                            1.0
                                        } else {
                                            value
                                        },
                                });
                            }
                        }
                    }
                }
            }
            if std::panic::catch_unwind(|| check_result(&wrong, &c)).is_ok() {
                accepted.push(format!("{} {mutation}", c["api"]));
            }
        }
    }
    assert!(checked > 0);
    assert!(
        accepted.is_empty(),
        "accepted fabricated displacements: {accepted:?}"
    );
}

#[test]
fn r7_subset_test_cannot_replace_the_exported_corpus() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join(format!("../.r7-corpus-{}.json", std::process::id()));
    let executable = std::env::current_exe().unwrap();
    for names in [
        vec![
            "red_ci::strict_equilibrium_survives_numbering_and_constraints",
            "red_ci::export_native_and_wasm_cases",
            "red_ci::small_soil_force_cannot_disappear_between_structure_and_applied_load",
        ],
        vec!["red_ci::small_soil_force_cannot_disappear_between_structure_and_applied_load"],
    ] {
        let output = std::process::Command::new(&executable)
            .args(names)
            .args(["--test-threads=2"])
            .env("RED_CI_CASES", &path)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
    }
    let exported: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    std::fs::remove_file(path).unwrap();
    assert!(
        exported == json!(calls()),
        "exported {} of {} cases",
        exported.as_array().unwrap().len(),
        calls().len()
    );
}

pub(crate) fn check_capacity(r: &Value, c: &Value) {
    let capacity = &c["pileCapacity"];
    if capacity.is_null() {
        return;
    }
    let close = |actual: f64, expected: f64| {
        assert!(
            (actual - expected).abs() <= 1e-6 * expected.abs().max(1e-12),
            "{actual} vs {expected}"
        )
    };
    for d in r["results"]["displacements"].as_array().unwrap() {
        close(
            -d[capacity["displacement"].as_str().unwrap()]
                .as_f64()
                .unwrap(),
            capacity["delta"].as_f64().unwrap(),
        );
    }
    let springs = r["springResults"].as_array().unwrap();
    close(
        -springs[..11]
            .iter()
            .map(|s| s["reaction"].as_f64().unwrap())
            .sum::<f64>(),
        capacity["shaft"].as_f64().unwrap(),
    );
    close(
        -springs[11]["reaction"].as_f64().unwrap(),
        capacity["tip"].as_f64().unwrap(),
    );
}

#[test]
fn small_soil_force_cannot_disappear_between_structure_and_applied_load() {
    let calls: Vec<_> = calls()
        .into_iter()
        .filter(|c| c["smallSoilBalance"] == true)
        .collect();
    let mut failures = Vec::new();
    for c in calls {
        let text = c["input"].to_string();
        let result = if c["api"] == "solve_ssi_2d" {
            dedaliano_engine::solve_ssi_2d(&text).unwrap()
        } else {
            dedaliano_engine::solve_ssi_3d(&text).unwrap()
        };
        let r: Value = serde_json::from_str(&result).unwrap();
        if r["converged"] != c["converged"] {
            failures.push(json!({"api":c["api"],"tolerance":c["input"]["tolerance"],"expected":c["converged"],"actual":r["converged"]}));
        }
        check_result(&r, &c);
    }
    assert!(failures.is_empty(), "{}", json!(failures));
}
