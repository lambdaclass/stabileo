use dedaliano_engine::{solver::corotational::solve_corotational_2d, types::SolverInput};
use serde_json::{json, Value};

fn solve(input: &Value, solver: &Value) -> Value {
    let input: SolverInput = serde_json::from_value(input.clone()).unwrap();
    match solve_corotational_2d(&input, solver["maxIter"].as_u64().unwrap() as usize, solver["tolerance"].as_f64().unwrap(), solver["nIncrements"].as_u64().unwrap() as usize, false) {
        Ok(result) => json!({ "result": result }),
        Err(error) => json!({ "failure": error }),
    }
}

fn refined(case: &Value, elements: usize) -> Value {
    let mut input = case["input"].clone();
    let length = case["length"].as_f64().unwrap();
    let template = input["elements"]["1"].clone();
    input["nodes"] = (1..=elements + 1).map(|id| (id.to_string(), json!({ "id": id, "x": length * (id - 1) as f64 / elements as f64, "z": 0.0 }))).collect::<serde_json::Map<_, _>>().into();
    input["elements"] = (1..=elements).map(|id| {
        let mut element = template.clone();
        element["id"] = json!(id);
        element["nodeI"] = json!(id);
        element["nodeJ"] = json!(id + 1);
        (id.to_string(), element)
    }).collect::<serde_json::Map<_, _>>().into();
    input["loads"][0]["data"]["nodeId"] = json!(elements + 1);
    input
}

fn main() {
    let data: Value = serde_json::from_str(include_str!("../../../../engine/tests/benchmarks/mattiasson_elastica.json")).unwrap();
    let cases = data["cases"].as_array().unwrap();
    let rows: Vec<Value> = cases.iter().map(|c| {
        let mut row = solve(&c["input"], &c["solver"]);
        row["id"] = c["id"].clone();
        row
    }).collect();
    std::fs::write(std::env::args().nth(1).expect("output path"), serde_json::to_string_pretty(&rows).unwrap()).unwrap();
    if let Some(path) = std::env::args().nth(2) {
        let study: Vec<Value> = cases.iter().filter(|c| c["kind"] == "force" && !c["reference"].is_null()).flat_map(|c| {
            data["meshErrorCeilings"].as_array().unwrap().iter().map(move |ceiling| {
                let elements = ceiling["elements"].as_u64().unwrap() as usize;
                let mut row = solve(&refined(c, elements), &c["solver"]);
                row["id"] = c["id"].clone();
                row["elements"] = json!(elements);
                row["tipNode"] = json!(elements + 1);
                row
            })
        }).collect();
        std::fs::write(path, serde_json::to_string_pretty(&study).unwrap()).unwrap();
    }
}
