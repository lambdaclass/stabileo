use dedaliano_engine::{solver::corotational::solve_corotational_2d, types::SolverInput};
use serde_json::{json, Value};

fn main() {
    let data: Value = serde_json::from_str(include_str!("../../../../engine/tests/benchmarks/mattiasson_elastica.json")).unwrap();
    let rows: Vec<Value> = data["cases"].as_array().unwrap().iter().map(|c| {
        let input: SolverInput = serde_json::from_value(c["input"].clone()).unwrap();
        let s = &c["solver"];
        match solve_corotational_2d(&input, s["maxIter"].as_u64().unwrap() as usize, s["tolerance"].as_f64().unwrap(), s["nIncrements"].as_u64().unwrap() as usize, false) {
            Ok(result) => json!({ "id": c["id"], "result": result }),
            Err(error) => json!({ "id": c["id"], "failure": error }),
        }
    }).collect();
    std::fs::write(std::env::args().nth(1).expect("output path"), serde_json::to_string_pretty(&rows).unwrap()).unwrap();
}
