//! Determinism: the same model solved twice gives bit-identical results
//! (docs/verification/PROVENANCE.md, "Determinism").
//!
//! Every solver input keeps its nodes, elements, supports, … in `HashMap`s, and
//! every `HashMap` gets its own random hash keys. Two deserializations of the same
//! JSON therefore iterate in different orders, and a sum whose terms come in a
//! different order can differ in the last bit. Each test parses the same JSON
//! several times, solves each copy, and compares the serialized results as text:
//! `serde_json` writes every f64 as its shortest round-trip form, so equal text is
//! equal bits.

use crate::fuzz_models;

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::{
    solve_buckling_2d, solve_buckling_3d, solve_modal_2d, solve_modal_3d, solve_pdelta_2d, solve_pdelta_3d,
};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde::de::DeserializeOwned;
use serde::Serialize;

const COPIES: usize = 6;

/// Strip wall-clock fields, which describe the run and not the answer.
fn answer<T: Serialize>(r: &T) -> String {
    let mut v = serde_json::to_value(r).unwrap();
    fn strip(v: &mut serde_json::Value) {
        match v {
            serde_json::Value::Object(m) => {
                m.remove("timings");
                m.remove("solveTimings");
                m.remove("runMeta");
                for x in m.values_mut() {
                    strip(x);
                }
            }
            serde_json::Value::Array(a) => a.iter_mut().for_each(strip),
            _ => {}
        }
    }
    strip(&mut v);
    serde_json::to_string(&v).unwrap()
}

/// The JSON paths where two answers differ (at most five), with both values.
fn first_difference(a: &str, b: &str) -> String {
    fn walk(a: &serde_json::Value, b: &serde_json::Value, path: String, out: &mut Vec<String>) {
        if out.len() >= 5 { return; }
        match (a, b) {
            (serde_json::Value::Object(x), serde_json::Value::Object(y)) => {
                for (k, v) in x { walk(v, y.get(k).unwrap_or(&serde_json::Value::Null), format!("{path}.{k}"), out); }
            }
            (serde_json::Value::Array(x), serde_json::Value::Array(y)) if x.len() == y.len() => {
                for (i, (v, w)) in x.iter().zip(y).enumerate() { walk(v, w, format!("{path}[{i}]"), out); }
            }
            _ if a != b => out.push(format!("{path}: {a} vs {b}")),
            _ => {}
        }
    }
    let (x, y): (serde_json::Value, serde_json::Value) = (serde_json::from_str(a).unwrap(), serde_json::from_str(b).unwrap());
    let mut out = Vec::new();
    walk(&x, &y, String::new(), &mut out);
    out.join("; ")
}

/// Solve `COPIES` fresh deserializations of `json` and require one answer.
fn same_every_time<I: DeserializeOwned, R: Serialize>(json: &str, what: &str, solve: impl Fn(&I) -> Result<R, String>) -> usize {
    let mut first: Option<Result<String, String>> = None;
    for copy in 0..COPIES {
        let input: I = serde_json::from_str(json).unwrap();
        let got = solve(&input).map(|r| answer(&r));
        match &first {
            None => first = Some(got),
            Some(f) => assert!(
                *f == got,
                "{what}: copy {copy} differs from copy 0 (nondeterministic result): {}",
                match (f, &got) {
                    (Ok(a), Ok(b)) => first_difference(a, b),
                    (a, b) => format!("{a:?} vs {b:?}"),
                },
            ),
        }
    }
    if let Some(Err(error)) = &first {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(error) {
            if let Some(id) = value["structuredDiagnostics"].as_array().and_then(|ds| ds.iter().find(|d| d["code"] == "known_issue" && d["severity"] == "error")).and_then(|d| d["phase"].as_str()) {
                crate::common::assert_containment::<()>(Err(error.clone()), id);
                // A contained model now proves deterministic refusal instead of numbers.
                return 1;
            }
        }
    }
    matches!(first, Some(Ok(_))) as usize
}

#[test]
fn linear_2d_is_bit_identical_across_hash_orders() {
    let mut solved = 0;
    for seed in 0..60 {
        let (m, _) = fuzz_models::random_2d_model_rich(seed);
        let json = serde_json::to_string(&m).unwrap();
        solved += same_every_time::<SolverInput, _>(&json, &format!("2D seed {seed}"), solve_2d);
    }
    assert!(solved > 20, "too few random 2D models solved ({solved})");
}

#[test]
fn linear_3d_is_bit_identical_across_hash_orders() {
    let mut solved = 0;
    for seed in 0..60 {
        let (m, _) = fuzz_models::random_3d_model_rich(seed);
        let json = serde_json::to_string(&m).unwrap();
        solved += same_every_time::<SolverInput3D, _>(&json, &format!("3D seed {seed}"), solve_3d);
    }
    assert!(solved > 20, "too few random 3D models solved or explicitly contained ({solved})");
}

#[test]
fn constrained_models_are_bit_identical_across_hash_orders() {
    for seed in 0..30 {
        let (mut m2, _) = fuzz_models::random_2d_model_rich(seed);
        fuzz_models::add_random_constraints_2d(&mut m2, seed);
        let j2 = serde_json::to_string(&m2).unwrap();
        same_every_time::<SolverInput, _>(&j2, &format!("2D constrained seed {seed}"), solve_2d);
        let (mut m3, _) = fuzz_models::random_3d_model_rich(seed);
        fuzz_models::add_random_constraints_3d(&mut m3, seed);
        let j3 = serde_json::to_string(&m3).unwrap();
        same_every_time::<SolverInput3D, _>(&j3, &format!("3D constrained seed {seed}"), solve_3d);
    }
}

#[test]
fn advanced_analyses_are_bit_identical_across_hash_orders() {
    for seed in 0..12 {
        let (m2, d2) = fuzz_models::random_2d_model_rich(seed);
        let j2 = serde_json::to_string(&m2).unwrap();
        same_every_time::<SolverInput, _>(&j2, &format!("2D modal {seed}"), |i| solve_modal_2d(i, &d2, 4));
        same_every_time::<SolverInput, _>(&j2, &format!("2D buckling {seed}"), |i| solve_buckling_2d(i, 3));
        same_every_time::<SolverInput, _>(&j2, &format!("2D P-Delta {seed}"), |i| solve_pdelta_2d(i, 30, 1e-8));
        let (m3, d3) = fuzz_models::random_3d_model_rich(seed);
        let j3 = serde_json::to_string(&m3).unwrap();
        same_every_time::<SolverInput3D, _>(&j3, &format!("3D modal {seed}"), |i| solve_modal_3d(i, &d3, 4));
        same_every_time::<SolverInput3D, _>(&j3, &format!("3D buckling {seed}"), |i| solve_buckling_3d(i, 3));
        same_every_time::<SolverInput3D, _>(&j3, &format!("3D P-Delta {seed}"), |i| solve_pdelta_3d(i, 30, 1e-8));
    }
}
