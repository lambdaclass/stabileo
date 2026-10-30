use dedaliano_engine::{solver::linear, types::SolverInput3D};
use serde_json::{json, Value};
use std::sync::LazyLock;

static DATA: LazyLock<Value> = LazyLock::new(|| serde_json::from_str(include_str!("shell_obstacle_course.json")).unwrap());
static RESULTS: LazyLock<Vec<Value>> = LazyLock::new(|| {
    DATA["cases"].as_array().unwrap().iter().map(|c| {
        let input: SolverInput3D = serde_json::from_value(c["input"].clone()).unwrap();
        let result = serde_json::to_value(linear::solve_3d(&input).unwrap()).unwrap();
        let d = result["displacements"].as_array().unwrap().iter().find(|d| d["nodeId"] == c["measurement"]["node"]).unwrap();
        // Signed: the roof and the pinched cylinder deflect downward, the hemisphere outward;
        // a response in the wrong direction must fail, not pass on its magnitude.
        let value = d[c["measurement"]["component"].as_str().unwrap()].as_f64().unwrap();
        let direction = if c["id"].as_str().unwrap().starts_with("hemisphere") { 1.0 } else { -1.0 };
        let error = (value / (direction * c["reference"].as_f64().unwrap()) - 1.0).abs();
        let row = json!({"id": c["id"], "value": value, "reference": c["reference"], "error": error, "pass": error < c["tolerance"].as_f64().unwrap()});
        if let Ok(directory) = std::env::var("SHELL_OBSTACLE_RESULTS") {
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(std::path::Path::new(&directory).join(format!("{}.json", c["id"].as_str().unwrap())), serde_json::to_string_pretty(&row).unwrap()).unwrap();
        }
        row
    }).collect()
});

pub fn solve(group: &str, nx: usize, ny: usize) -> f64 {
    assert_eq!(nx, ny);
    let id = format!("{group}-{nx}");
    RESULTS.iter().find(|r| r["id"] == id).unwrap()["value"].as_f64().unwrap()
}
