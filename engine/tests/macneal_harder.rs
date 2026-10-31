#[path = "benchmarks/macneal_harder.rs"]
mod cases;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};

fn conjugate_load(c: &Value) -> f64 {
    let component = c["measurement"]["component"].as_str().unwrap();
    let planar = c["dimension"] == 2;
    c["input"]["loads"].as_array().unwrap().iter().map(|l| {
        let f = |k: &str| l["data"][k].as_f64().unwrap_or(0.0);
        match component {
            "uz" if planar => f("fz") + f("my"),
            "uz" => f("fz"),
            "uy" => f("fy"),
            "ry" => f("my"),
            other => panic!("unexpected component {other}"),
        }
    }).sum()
}

#[test]
fn every_reference_lies_along_its_load() {
    for c in cases::DATA["cases"].as_array().unwrap() {
        let reference = c["reference"].as_f64().unwrap();
        assert!(conjugate_load(c) * reference > 0.0, "{}: reference {reference} opposes the load", c["id"]);
    }
}

#[test]
fn browser_cases() {
    let tolerance = cases::DATA["accuracyTolerance"].as_f64().unwrap();
    let mut rows = vec![];
    for c in cases::DATA["cases"].as_array().unwrap() {
        let input = c["input"].clone();
        let result = if c["dimension"] == 2 {
            serde_json::to_value(linear::solve_2d(&serde_json::from_value::<SolverInput>(input).unwrap()).unwrap()).unwrap()
        } else {
            serde_json::to_value(linear::solve_3d(&serde_json::from_value::<SolverInput3D>(input).unwrap()).unwrap()).unwrap()
        };
        let nodes = c["measurement"]["nodes"].as_array().unwrap();
        let component = c["measurement"]["component"].as_str().unwrap();
        let value = nodes.iter().map(|id| {
            result["displacements"].as_array().unwrap().iter().find(|d| d["nodeId"] == *id).unwrap()[component].as_f64().unwrap()
        }).sum::<f64>() / nodes.len() as f64;
        assert!(value.is_finite(), "{}", c["id"]);
        let reference = c["reference"].as_f64().unwrap();
        let error = (value / reference - 1.0).abs();
        let pass = error < tolerance;
        assert_eq!(pass, c["expectedPass"].as_bool().unwrap(), "{}: {value} vs {reference}", c["id"]);
        let bounds = &c["nativeBounds"];
        if let Some(limit) = bounds["relativeErrorLessThan"].as_f64() {
            assert!(error < limit, "{}: {value}", c["id"]);
        } else {
            let pinned = bounds["pinnedValue"].as_f64().unwrap();
            let drift = bounds["relativeTolerance"].as_f64().unwrap();
            assert!((value / pinned - 1.0).abs() < drift, "{}: {value} moved from pinned {pinned}", c["id"]);
        }
        rows.push(json!({"id": c["id"], "value": value, "reference": reference, "error": error, "pass": pass}));
    }
    println!("MACNEAL_HARDER_RESULTS={}", Value::Array(rows.clone()));
    if let Ok(path) = std::env::var("MACNEAL_HARDER_RESULTS") {
        std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap()).unwrap();
    }
}

#[test]
fn shell_references_match_timoshenko_beam_theory() {
    let c = cases::case("mitc4-regular-out");
    let e = c["input"]["materials"]["1"]["e"].as_f64().unwrap() * 1000.0;
    let nu = c["input"]["materials"]["1"]["nu"].as_f64().unwrap();
    let t = c["input"]["quads"]["1"]["thickness"].as_f64().unwrap();
    let coords = |k: &str| -> Vec<f64> { c["input"]["nodes"].as_object().unwrap().values().map(|n| n[k].as_f64().unwrap()).collect() };
    let span = |v: Vec<f64>| v.iter().cloned().fold(f64::MIN, f64::max) - v.iter().cloned().fold(f64::MAX, f64::min);
    let (l, b) = (span(coords("x")), span(coords("y")));
    let g = e / (2.0 * (1.0 + nu));
    let shear = l / (5.0 / 6.0 * g * b * t);
    let out_of_plane = l.powi(3) / (3.0 * e * b * t.powi(3) / 12.0) + shear;
    let in_plane = l.powi(3) / (3.0 * e * t * b.powi(3) / 12.0) + shear;
    for (id, theory) in [("mitc4-regular-out", out_of_plane), ("mitc4-regular-in", in_plane)] {
        let printed = cases::case(id)["reference"].as_f64().unwrap();
        let half_digit = cases::case(id)["referenceRounding"].as_f64().unwrap();
        assert!((theory - printed).abs() <= half_digit, "{id}: Timoshenko {theory} vs printed {printed}");
    }
}
