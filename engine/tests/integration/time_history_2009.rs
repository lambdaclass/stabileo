use dedaliano_engine::{certify::dynamics, solver::time_integration, types::*};
use serde_json::{json, Value};

fn model(dim: usize) -> Value {
    let cases: Vec<Value> = serde_json::from_str(include_str!("../fixtures/prescribed-master-2008.json")).unwrap();
    cases.into_iter().find(|c| c["dim"] == dim && c["fillers"] == 1 && c["rotation"] == false).unwrap()["model"].clone()
}

fn run(dim: usize, entry: &str, input: Value) -> Result<Value, String> {
    let result = if dim == 2 {
        let input = serde_json::from_value(input).unwrap();
        match entry {
            "solve" => serde_json::to_value(time_integration::solve_time_history_2d(&input)?),
            "traced" => serde_json::to_value(time_integration::solve_time_history_2d_traced(&input)?.0),
            "certified" => serde_json::to_value(dynamics::certify_time_history_2d(&input)?.results),
            _ => unreachable!(),
        }
    } else {
        let input = serde_json::from_value(input).unwrap();
        match entry {
            "solve" => serde_json::to_value(time_integration::solve_time_history_3d(&input)?),
            "traced" => serde_json::to_value(time_integration::solve_time_history_3d_traced(&input)?.0),
            "certified" => serde_json::to_value(dynamics::certify_time_history_3d(&input)?.results),
            _ => unreachable!(),
        }
    };
    Ok(result.unwrap())
}

fn wrapper(model: Value, method: &str) -> Value {
    json!({"solver":model,"densities":{"1":7850.0},"timeStep":0.001,"nSteps":2,
        "method":method,"alpha":if method == "hht" { Some(-0.1) } else { None }})
}

#[test]
fn nonzero_motion_is_a_structured_refusal_at_every_entry() {
    let mut failures = Vec::new();
    let mut replay = Vec::new();
    for dim in [2, 3] {
        let fields: &[&str] = if dim == 2 { &["dx", "dz", "dry"] } else { &["dx", "dy", "dz", "drx", "dry", "drz"] };
        for field in fields {
            for motion in [-0.0013, -1e-16, -f64::from_bits(1), f64::from_bits(1), 1e-16, 0.0013] {
                let mut model = model(dim);
                model["supports"]["2"].as_object_mut().unwrap().remove("dz");
                model["supports"]["2"][field] = json!(motion);
                for method in ["newmark", "hht"] {
                    for entry in ["solve", "traced", "certified"] {
                        let input = wrapper(model.clone(), method);
                        let result = run(dim, entry, input.clone());
                        let valid = result.as_ref().err().and_then(|e| serde_json::from_str::<Value>(e).ok()).is_some_and(|e| {
                            let ds = e["structuredDiagnostics"].as_array().unwrap();
                            ds.len() == 1 && ds[0]["code"] == "unsupported_feature"
                                && ds[0]["severity"] == "error" && ds[0]["phase"] == "input"
                                && e["message"].as_str().unwrap().contains("prescribed support displacements")
                        });
                        if !valid { failures.push(format!("{dim}D {field} {motion} {method} {entry}: {result:?}")); }
                        replay.push(json!({"dim":dim,"field":field,"motion":motion,"method":method,"entry":entry,"input":input,"result":result}));
                    }
                }
            }
        }
    }
    if let Ok(path) = std::env::var("REPLAY_2009") { std::fs::write(path, serde_json::to_string_pretty(&replay).unwrap()).unwrap(); }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn zero_and_absent_motion_return_the_same_loaded_response() {
    let mut replay = Vec::new();
    for dim in [2, 3] {
        let mut model = model(dim);
        let fields: &[&str] = if dim == 2 { &["dx", "dz", "dry"] } else { &["dx", "dy", "dz", "drx", "dry", "drz"] };
        for support in model["supports"].as_object_mut().unwrap().values_mut() {
            for field in fields { support.as_object_mut().unwrap().remove(*field); }
        }
        for method in ["newmark", "hht"] {
            let absent = run(dim, "solve", wrapper(model.clone(), method)).unwrap();
            assert!(absent["nodeHistories"].as_array().unwrap().iter().any(|h| h["ux"].as_array().unwrap().iter().any(|u| u.as_f64().unwrap() != 0.0)));
            replay.push(json!({"dim":dim,"method":method,"absent":absent}));
            for zero in [-0.0, 0.0] {
                let mut zero_model = model.clone();
                for support in zero_model["supports"].as_object_mut().unwrap().values_mut() {
                    for field in fields { support[field] = json!(zero); }
                }
                for entry in ["solve", "traced", "certified"] {
                    assert_eq!(run(dim, entry, wrapper(zero_model.clone(), method)).unwrap(), absent, "{dim}D {method} {entry} zero={zero}");
                }
            }
        }
    }
    if let Ok(path) = std::env::var("REPLAY_ZERO_2009") { std::fs::write(path, serde_json::to_string_pretty(&replay).unwrap()).unwrap(); }
}
