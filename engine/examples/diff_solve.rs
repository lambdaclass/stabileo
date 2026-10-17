//! JSON CLI around the engine's analyses, used by the differential harnesses
//! in tools/differential/ (Frame3DD, PyNite, Mystran, Kratos, CalculiX).
//!
//!   diff_solve [--2d|--3d] [--analysis KIND] [options] [FILE]
//!
//! KIND (default `static`):
//!   static        solve_2d / solve_3d                -> AnalysisResults
//!   modal         solve_modal_*  (--modes N, --densities JSON)
//!   pdelta        solve_pdelta_* (--max-iter N, --tol T)
//!   buckling      solve_buckling_* (--modes N)
//!   corotational  solve_corotational_* (--max-iter N, --tol T, --increments N)
//!
//! --densities takes a JSON object {materialId: kg/m³}. The input is read
//! from FILE (stdin when absent); the dimension is auto-detected as in
//! solve_json unless forced. On a solver error it prints {"error": "..."}
//! and exits with status 2.

use dedaliano_engine::solver::corotational::{solve_corotational_2d, solve_corotational_3d};
use dedaliano_engine::solver::{
    solve_2d, solve_3d, solve_buckling_2d, solve_buckling_3d, solve_modal_2d, solve_modal_3d,
    solve_pdelta_2d, solve_pdelta_3d,
};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use std::collections::HashMap;
use std::io::Read;

fn fail(msg: &str, code: i32) -> ! {
    println!("{}", serde_json::json!({ "error": msg }));
    std::process::exit(code);
}

/// Same rule as solve_json: 3D when a node carries both `y` and `z` or a
/// support carries the 3D `rx` flag.
fn is_3d(v: &serde_json::Value) -> bool {
    let any = |key: &str, pred: &dyn Fn(&serde_json::Value) -> bool| {
        v.get(key)
            .and_then(|m| m.as_object())
            .map_or(false, |m| m.values().any(|x| pred(x)))
    };
    any("nodes", &|n| n.get("y").is_some() && n.get("z").is_some())
        || any("supports", &|s| s.get("rx").is_some())
}

fn json<T: serde::Serialize>(r: Result<T, String>) -> Result<String, String> {
    r.map(|x| serde_json::to_string(&x).unwrap())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut force: Option<bool> = None;
    let mut file: Option<String> = None;
    let mut kind = "static".to_string();
    let mut modes = 6usize;
    let mut max_iter = 100usize;
    let mut tol = 1e-10f64;
    let mut increments = 10usize;
    let mut densities: HashMap<String, f64> = HashMap::new();
    let mut i = 0;
    let value_of = |i: usize| -> &String {
        args.get(i + 1).unwrap_or_else(|| fail(&format!("{} needs a value", args[i]), 1))
    };
    let num = |s: &String| -> f64 { s.parse().unwrap_or_else(|_| fail(&format!("bad number {s}"), 1)) };
    while i < args.len() {
        match args[i].as_str() {
            "--2d" => force = Some(false),
            "--3d" => force = Some(true),
            "--analysis" => { kind = value_of(i).clone(); i += 1; }
            "--modes" => { modes = num(value_of(i)) as usize; i += 1; }
            "--max-iter" => { max_iter = num(value_of(i)) as usize; i += 1; }
            "--tol" => { tol = num(value_of(i)); i += 1; }
            "--increments" => { increments = num(value_of(i)) as usize; i += 1; }
            "--densities" => {
                densities = serde_json::from_str(value_of(i))
                    .unwrap_or_else(|e| fail(&format!("--densities: {e}"), 1));
                i += 1;
            }
            other => file = Some(other.to_string()),
        }
        i += 1;
    }

    let mut text = String::new();
    match &file {
        Some(path) => {
            text = std::fs::read_to_string(path)
                .unwrap_or_else(|e| fail(&format!("read {path}: {e}"), 1))
        }
        None => {
            std::io::stdin()
                .read_to_string(&mut text)
                .unwrap_or_else(|e| fail(&format!("read stdin: {e}"), 1));
        }
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).unwrap_or_else(|e| fail(&format!("parse: {e}"), 1));

    let out = if force.unwrap_or_else(|| is_3d(&value)) {
        let input: SolverInput3D = serde_json::from_value(value)
            .unwrap_or_else(|e| fail(&format!("SolverInput3D: {e}"), 1));
        match kind.as_str() {
            "static" => json(solve_3d(&input)),
            "modal" => json(solve_modal_3d(&input, &densities, modes)),
            "pdelta" => json(solve_pdelta_3d(&input, max_iter, tol)),
            "buckling" => json(solve_buckling_3d(&input, modes)),
            "corotational" => json(solve_corotational_3d(&input, max_iter, tol, increments, false)),
            k => fail(&format!("unknown analysis {k}"), 1),
        }
    } else {
        let input: SolverInput = serde_json::from_value(value)
            .unwrap_or_else(|e| fail(&format!("SolverInput: {e}"), 1));
        match kind.as_str() {
            "static" => json(solve_2d(&input)),
            "modal" => json(solve_modal_2d(&input, &densities, modes)),
            "pdelta" => json(solve_pdelta_2d(&input, max_iter, tol)),
            "buckling" => json(solve_buckling_2d(&input, modes)),
            "corotational" => json(solve_corotational_2d(&input, max_iter, tol, increments, false)),
            k => fail(&format!("unknown analysis {k}"), 1),
        }
    };
    match out {
        Ok(s) => println!("{s}"),
        Err(e) => fail(&e, 2),
    }
}
