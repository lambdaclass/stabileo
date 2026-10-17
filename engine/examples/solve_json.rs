//! Tiny JSON CLI around the solvers, used by the OpenSees differential
//! harness (tools/opensees/).
//!
//!   solve_json [--2d|--3d] [FILE]     solve a SolverInput / SolverInput3D
//!                                     (stdin when FILE is absent; the
//!                                     dimension is auto-detected unless
//!                                     forced) and print AnalysisResults JSON
//!
//! A JSON object with an "analysis" key selects another solver (the
//! dimension is detected on the model):
//!
//!   {"analysis": "buckling", "numModes": N, "model": M}
//!   {"analysis": "modal", "numModes": N, "densities": {..}, "model": M}
//!   {"analysis": "pdelta", "maxIter": N, "tolerance": T, "model": M}
//!   {"analysis": "timeHistory", "input": TimeHistoryInput[3D]}
//!
//! and prints the solver's result struct as JSON.
//!   solve_json --gen2d SEED           print fuzz_models::random_2d_model(SEED)
//!   solve_json --gen3d SEED           print fuzz_models::random_3d_model(SEED)
//!
//! On a solver error it prints {"error": "..."} and exits with status 2.

#[path = "../tests/fuzz_models/mod.rs"]
#[allow(dead_code)]
mod fuzz_models;

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::{
    solve_buckling_2d, solve_buckling_3d, solve_modal_2d, solve_modal_3d, solve_pdelta_2d,
    solve_pdelta_3d, solve_time_history_2d, solve_time_history_3d,
};
use dedaliano_engine::types::{SolverInput, SolverInput3D, TimeHistoryInput, TimeHistoryInput3D};
use serde::de::DeserializeOwned;
use std::io::Read;

fn fail(msg: &str, code: i32) -> ! {
    println!("{}", serde_json::json!({ "error": msg }));
    std::process::exit(code);
}

/// 3D when any node carries both `y` and `z` (2D nodes carry `z` or its
/// alias `y`, never both) or any support carries the 3D `rx` flag.
fn is_3d(v: &serde_json::Value) -> bool {
    let any = |key: &str, pred: &dyn Fn(&serde_json::Value) -> bool| {
        v.get(key)
            .and_then(|m| m.as_object())
            .map_or(false, |m| m.values().any(|x| pred(x)))
    };
    any("nodes", &|n| n.get("y").is_some() && n.get("z").is_some())
        || any("supports", &|s| s.get("rx").is_some())
}

fn parse<T: DeserializeOwned>(v: serde_json::Value, what: &str) -> T {
    serde_json::from_value(v).unwrap_or_else(|e| fail(&format!("{what}: {e}"), 1))
}

fn json<T: serde::Serialize>(r: Result<T, String>) -> Result<String, String> {
    r.map(|r| serde_json::to_string(&r).unwrap())
}

/// The {"analysis": ...} wrapper (see the module docs).
fn solve_analysis(mut v: serde_json::Value, force: Option<bool>) -> Result<String, String> {
    let kind = v["analysis"].as_str().unwrap_or_else(|| fail("analysis must be a string", 1)).to_string();
    let n = |key: &str, default: u64| v.get(key).and_then(|x| x.as_u64()).unwrap_or(default) as usize;
    let (num_modes, max_iter) = (n("numModes", 4), n("maxIter", 100));
    let tolerance = v.get("tolerance").and_then(|x| x.as_f64()).unwrap_or(1e-10);
    if kind == "timeHistory" {
        let input = v["input"].take();
        return if force.unwrap_or_else(|| is_3d(&input["solver"])) {
            json(solve_time_history_3d(&parse::<TimeHistoryInput3D>(input, "TimeHistoryInput3D")))
        } else {
            json(solve_time_history_2d(&parse::<TimeHistoryInput>(input, "TimeHistoryInput")))
        };
    }
    let densities = parse(v.get_mut("densities").map(|d| d.take()).unwrap_or(serde_json::json!({})), "densities");
    let model = v["model"].take();
    if force.unwrap_or_else(|| is_3d(&model)) {
        let m: SolverInput3D = parse(model, "SolverInput3D");
        match kind.as_str() {
            "buckling" => json(solve_buckling_3d(&m, num_modes)),
            "modal" => json(solve_modal_3d(&m, &densities, num_modes)),
            "pdelta" => json(solve_pdelta_3d(&m, max_iter, tolerance)),
            _ => fail(&format!("unknown analysis {kind}"), 1),
        }
    } else {
        let m: SolverInput = parse(model, "SolverInput");
        match kind.as_str() {
            "buckling" => json(solve_buckling_2d(&m, num_modes)),
            "modal" => json(solve_modal_2d(&m, &densities, num_modes)),
            "pdelta" => json(solve_pdelta_2d(&m, max_iter, tolerance)),
            _ => fail(&format!("unknown analysis {kind}"), 1),
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut force: Option<bool> = None;
    let mut file: Option<String> = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--2d" => force = Some(false),
            "--3d" => force = Some(true),
            "--gen2d" | "--gen3d" => {
                let seed: u64 = args
                    .get(i + 1)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or_else(|| fail("--genNd needs an integer SEED", 1));
                let out = if args[i] == "--gen2d" {
                    serde_json::to_string(&fuzz_models::random_2d_model(seed))
                } else {
                    serde_json::to_string(&fuzz_models::random_3d_model(seed))
                };
                println!("{}", out.unwrap());
                return;
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

    let out = if value.get("analysis").is_some() {
        solve_analysis(value, force)
    } else if force.unwrap_or_else(|| is_3d(&value)) {
        let input: SolverInput3D = serde_json::from_value(value)
            .unwrap_or_else(|e| fail(&format!("SolverInput3D: {e}"), 1));
        solve_3d(&input).map(|r| serde_json::to_string(&r).unwrap())
    } else {
        let input: SolverInput = serde_json::from_value(value)
            .unwrap_or_else(|e| fail(&format!("SolverInput: {e}"), 1));
        solve_2d(&input).map(|r| serde_json::to_string(&r).unwrap())
    };
    match out {
        Ok(s) => println!("{s}"),
        Err(e) => fail(&e, 2),
    }
}
