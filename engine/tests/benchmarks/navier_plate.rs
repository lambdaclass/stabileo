use dedaliano_engine::{solver::linear, types::SolverInput3D};
use serde_json::{json, Value};

#[test]
fn navier_plate_shared_cases() {
    let data: Value = serde_json::from_str(include_str!("navier_plate.json")).unwrap();
    let reference = data["parameters"]["reference_mm"].as_f64().unwrap();
    assert!((reference - 1.28375).abs() < 0.00001);
    let mut rows = Vec::new();
    let mut previous = [f64::INFINITY; 2];
    let mut previous_w = [0.0; 2];
    let mut increment = [f64::INFINITY; 2];
    for case in data["cases"].as_array().unwrap() {
        let input: SolverInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        let result = linear::solve_3d(&input).unwrap();
        let center = case["center"].as_u64().unwrap() as usize;
        let w = -1000.0 * result.displacements.iter().find(|d| d.node_id == center).unwrap().uz;
        let error = (w / reference - 1.0).abs();
        let family = case["family"].as_str().unwrap();
        let index = usize::from(family == "MITC4");
        assert!(w.is_finite() && w > 0.0);
        if family == "DKT" {
            assert!(error < previous[index], "DKT refinement did not reduce the Kirchhoff error");
        }
        let change = (w - previous_w[index]).abs();
        if case["n"] == 16 {
            assert!(change < increment[index], "{family}: displacement increments did not shrink");
        }
        increment[index] = change;
        previous_w[index] = w;
        previous[index] = error;
        if case["n"] == 16 {
            assert!(error < data["parameters"]["tolerance_relative"].as_f64().unwrap());
        }
        let reaction: f64 = result.reactions.iter().map(|r| r.fz).sum();
        assert!((reaction - 150.0).abs() < 1e-6);
        let values: Vec<f64> = (1..=input.nodes.len()).map(|id| -1000.0 * result.displacements.iter().find(|d| d.node_id == id).unwrap().uz).collect();
        println!("{family} {}: reference={reference:.9} mm, Stabileo={w:.9} mm, error={:.6}%", case["n"], error * 100.0);
        rows.push(json!({"family":family,"n":case["n"],"center_mm":w,"values":values}));
    }
    if let Ok(path) = std::env::var("NAVIER_RESULTS") {
        std::fs::write(path, serde_json::to_string(&json!({"parameters":data["parameters"],"rows":rows})).unwrap() + "\n").unwrap();
    }
}
