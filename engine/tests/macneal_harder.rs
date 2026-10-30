#[path = "benchmarks/macneal_harder.rs"]
mod cases;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};

#[test]
fn browser_cases() {
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
        }).sum::<f64>().abs() / nodes.len() as f64;
        assert!(value.is_finite() && value > 0.0, "{}", c["id"]);
        let reference = c["reference"].as_f64().unwrap();
        let error = (value / reference - 1.0).abs();
        let pass = error < c["tolerance"].as_f64().unwrap();
        assert!(within_native_bounds(c, value), "{}: {value}", c["id"]);
        rows.push(json!({"id": c["id"], "value": value, "reference": reference, "error": error, "pass": pass}));
    }
    println!("MACNEAL_HARDER_RESULTS={}", Value::Array(rows.clone()));
    if let Ok(path) = std::env::var("MACNEAL_HARDER_RESULTS") {
        std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap()).unwrap();
    }
}

fn within_native_bounds(c: &Value, value: f64) -> bool {
    let bounds = &c["nativeBounds"];
    if !value.is_finite() || value <= 0.0 { return false; }
    if let Some(tol) = bounds["relativeErrorLessThan"].as_f64() {
        return (value / c["reference"].as_f64().unwrap() - 1.0).abs() < tol;
    }
    value > bounds["valueGreaterThan"].as_f64().expect("lower regression bound")
        && value < bounds["valueLessThan"].as_f64().expect("upper regression bound")
}

#[test]
fn regression_gate_rejects_perturbed_measurements() {
    for c in cases::DATA["cases"].as_array().unwrap() {
        let value = c["nativeBounds"]["valueGreaterThan"].as_f64()
            .map(|low| (low + c["nativeBounds"]["valueLessThan"].as_f64().unwrap()) / 2.0)
            .unwrap_or_else(|| c["reference"].as_f64().unwrap());
        assert!(within_native_bounds(c, value), "{}", c["id"]);
        for bad in [value * 0.5, value * 0.97, value * 1.03, value * 1.5, 0.0, f64::NAN, f64::INFINITY] {
            assert!(!within_native_bounds(c, bad), "{}: {bad}", c["id"]);
        }
    }
}
