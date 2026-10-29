use dedaliano_engine::{solver::{buckling, corotational}, types::SolverInput};
use serde_json::{json, Value};

#[test]
fn imperfect_column() {
    let case: Value = serde_json::from_str(include_str!("southwell_1932.json")).unwrap();
    let base = &case["input"];
    let length = case["length"].as_f64().unwrap();
    let euler = std::f64::consts::PI.powi(2) * base["materials"]["1"]["e"].as_f64().unwrap() * 1000.0
        * base["sections"]["1"]["iz"].as_f64().unwrap() / length.powi(2);
    let mut straight = base.clone();
    for node in straight["nodes"].as_object_mut().unwrap().values_mut() { node["z"] = json!(0.0); }
    let linear = buckling::solve_buckling_2d(&serde_json::from_value(straight).unwrap(), 1).unwrap().modes[0].load_factor;
    assert!((linear / euler - 1.0).abs() < case["bucklingTolerance"].as_f64().unwrap());
    let mut rows = vec![];
    let mut points = vec![];
    for fraction in case["loadFractions"].as_array().unwrap() {
        let load = fraction.as_f64().unwrap() * euler;
        let mut raw = base.clone();
        raw["loads"][0]["data"]["fx"] = json!(-load);
        let input: SolverInput = serde_json::from_value(raw).unwrap();
        let result = corotational::solve_corotational_2d(&input,
            case["solver"]["maxIter"].as_u64().unwrap() as usize,
            case["solver"]["tolerance"].as_f64().unwrap(),
            case["solver"]["nIncrements"].as_u64().unwrap() as usize, false).unwrap();
        assert!(result.converged);
        assert!((result.load_factor - 1.0).abs() < 1e-12);
        let delta = result.results.displacements.iter().find(|d| d.node_id == case["midNode"].as_u64().unwrap() as usize).unwrap().uz;
        assert!(delta.is_finite() && delta > 0.0);
        if let Some(&(previous, _)) = points.last() { assert!(delta > previous); }
        points.push((delta, delta / load));
        rows.push(json!({"load":load,"delta":delta,"displacements":result.results.displacements}));
    }
    let mean_x = points.iter().map(|p| p.0).sum::<f64>() / points.len() as f64;
    let mean_y = points.iter().map(|p| p.1).sum::<f64>() / points.len() as f64;
    let slope = points.iter().map(|p| (p.0-mean_x)*(p.1-mean_y)).sum::<f64>()
        / points.iter().map(|p| (p.0-mean_x).powi(2)).sum::<f64>();
    let estimated = 1.0 / slope;
    assert!((estimated / euler - 1.0).abs() < case["relativeTolerance"].as_f64().unwrap());
    let intercept = mean_y - slope * mean_x;
    assert!((intercept * estimated / case["imperfection"].as_f64().unwrap() - 1.0).abs() < 0.02);
    println!("Euler={euler:.9} kN; linear={linear:.9} kN; Southwell={estimated:.9} kN; difference={:.6}%", (estimated/euler-1.0)*100.0);
    if let Ok(path) = std::env::var("SOUTHWELL_EXPORT") {
        std::fs::write(path, serde_json::to_string_pretty(&json!({"euler":euler,"linear":linear,"estimated":estimated,"slope":slope,"intercept":intercept,"rows":rows})).unwrap()+"\n").unwrap();
    }
}
