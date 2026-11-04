//! Seed corpora for the fuzz targets in engine/fuzz (docs/verification/FUZZ_MUTANTS.md).
//!
//!   cargo run --release --example fuzz_seeds [OUT_DIR]
//!
//! Turns every model in tests/fixtures (the solver inputs of the web app's
//! example templates, web/src/lib/templates, plus generated models) into one
//! input per entry point of each JSON target: selector byte, parameter byte,
//! then the JSON the entry point takes (the model itself, or the model wrapped
//! with densities, load cases, time-history or plastic data). OUT_DIR defaults
//! to fuzz/corpus. The inputs of past findings (fuzz/regressions/<target>/,
//! kept in git) are copied in too, so every run starts from them.

use dedaliano_engine::solver::modal;
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// num_modes 3, max_iter 31, tolerance 1e-8 (see dedaliano_engine_fuzz::Params).
const PARAMS: u8 = 0x52;

/// Fixtures used as seeds: the template examples and a few generated models.
fn is_seed(name: &str) -> bool {
    name.ends_with("-input.json")
        && (name.starts_with("ex-") || name.starts_with("portal-") || name.starts_with("cantilever")
            || name.starts_with("random-1") || name.starts_with("random3d-1"))
}

fn main() {
    let out = std::env::args().nth(1).unwrap_or_else(|| "fuzz/corpus".to_string());
    let out = Path::new(&out);
    let mut files: Vec<_> = fs::read_dir("tests/fixtures")
        .expect("run from engine/")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(is_seed))
        .collect();
    files.sort();
    let mut count = 0;
    for path in &files {
        let stem = path.file_stem().unwrap().to_str().unwrap().trim_end_matches("-input");
        let text = fs::read_to_string(path).unwrap();
        let model: Value = serde_json::from_str(&text).unwrap();
        let results_path = path.with_file_name(format!("{stem}-results.json"));
        let results: Option<Value> = fs::read_to_string(results_path).ok().and_then(|t| serde_json::from_str(&t).ok());
        let seeds = if serde_json::from_value::<SolverInput3D>(model.clone()).is_ok() && is_3d(&model) {
            seeds_3d(&model, results.as_ref())
        } else if serde_json::from_value::<SolverInput>(model.clone()).is_ok() {
            seeds_2d(&model, results.as_ref())
        } else {
            continue;
        };
        for (target, sel, v) in seeds {
            let dir = out.join(target);
            fs::create_dir_all(&dir).unwrap();
            let mut bytes = vec![sel, PARAMS];
            bytes.extend_from_slice(serde_json::to_string(&v).unwrap().as_bytes());
            fs::write(dir.join(format!("{stem}-{sel}")), bytes).unwrap();
            count += 1;
        }
    }
    // Past findings (docs/verification/FUZZ_MUTANTS.md), one directory per target.
    if let Ok(targets) = fs::read_dir("fuzz/regressions") {
        for t in targets.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()) {
            let dir = out.join(t.file_name());
            fs::create_dir_all(&dir).unwrap();
            for f in fs::read_dir(t.path()).unwrap().filter_map(|e| e.ok()) {
                fs::copy(f.path(), dir.join(f.file_name())).unwrap();
                count += 1;
            }
        }
    }
    eprintln!("wrote {count} seeds from {} fixtures and fuzz/regressions to {}", files.len(), out.display());
}

fn is_3d(v: &Value) -> bool {
    v.get("supports").and_then(Value::as_object).is_some_and(|m| m.values().any(|s| s.get("rx").is_some()))
        || v.get("nodes").and_then(Value::as_object).is_some_and(|m| m.values().any(|n| n.get("y").is_some() && n.get("z").is_some()))
}

fn densities(model: &Value) -> Value {
    let ids: Map<String, Value> = model["materials"]
        .as_object()
        .map(|m| m.keys().map(|k| (k.clone(), json!(7850.0))).collect())
        .unwrap_or_default();
    Value::Object(ids)
}

fn first_free_node(model: &Value) -> u64 {
    model["nodes"].as_object().and_then(|m| m.values().filter_map(|n| n["id"].as_u64()).max()).unwrap_or(1)
}

fn spectrum() -> Value {
    json!({ "name": "seed", "inG": true, "points": [
        { "period": 0.0, "sa": 0.4 }, { "period": 0.5, "sa": 1.0 }, { "period": 2.0, "sa": 0.3 }
    ]})
}

fn multi_case(model: &Value) -> Value {
    let mut solver = model.clone();
    let loads = solver["loads"].take();
    solver["loads"] = json!([]);
    json!({
        "solver": solver,
        "loadCases": [{ "name": "D", "loads": loads }, { "name": "L", "loads": loads }],
        "combinations": [{ "name": "1.2D+1.6L", "factors": { "D": 1.2, "L": 1.6 } }]
    })
}

fn common(model: &Value, results: Option<&Value>, three_d: bool) -> Vec<(&'static str, u8, Value)> {
    let d = densities(model);
    let s = if three_d { 1 } else { 0 };
    let mut v = vec![
        ("json_static", s, model.clone()),
        ("json_static", 2 + s, model.clone()),
        ("json_static", 4 + s, model.clone()),
        ("json_static", 6 + 2 * s, model.clone()),
        ("json_static", 7 + 2 * s, model.clone()),
        ("json_static", 10 + s, multi_case(model)),
        ("json_static", 12 + s, multi_case(model)),
        ("json_dynamics", s, json!({ "solver": model, "densities": d })),
        ("json_dynamics", 2 + s, json!({ "solver": model, "densities": d })),
        ("json_dynamics", 4 + s, model.clone()),
        ("json_dynamics", 6 + s, model.clone()),
        ("json_dynamics", 16 + s, harmonic(model, &d)),
        ("json_dynamics", 18 + s, harmonic(model, &d)),
        // metamorphic: selector picks rotation / relabel / units and the seed.
        ("metamorphic", 0, model.clone()),
        ("metamorphic", 1, model.clone()),
        ("metamorphic", 2, model.clone()),
        ("metamorphic", 4, model.clone()),
    ];
    if let Some(r) = results {
        v.push(("json_static", 14 + s, json!({ "factors": [{ "caseId": 1, "factor": 1.4 }], "cases": [{ "caseId": 1, "results": r }] })));
        v.push(("json_static", 16 + s, json!([r, r])));
    }
    v
}

fn harmonic(model: &Value, d: &Value) -> Value {
    json!({ "solver": model, "densities": d, "frequencies": [0.5, 2.0, 8.0], "dampingRatio": 0.05,
            "responseNodeId": first_free_node(model), "responseDof": "x" })
}

fn seeds_2d(model: &Value, results: Option<&Value>) -> Vec<(&'static str, u8, Value)> {
    let d = densities(model);
    let mut v = common(model, results, false);
    let th = json!({ "solver": model, "densities": d, "timeStep": 0.01, "nSteps": 40,
                     "groundAccel": vec![0.5; 40], "groundDirection": "X" });
    v.push(("json_dynamics", 12, th.clone()));
    v.push(("json_dynamics", 14, th));
    let input: SolverInput = serde_json::from_value(model.clone()).unwrap();
    let dens: HashMap<String, f64> = serde_json::from_value(d.clone()).unwrap();
    if let Ok(m) = modal::solve_modal_2d(&input, &dens, 3) {
        let sp = json!({ "solver": model, "modes": m.modes, "densities": d, "spectrum": spectrum(), "direction": "X" });
        v.push(("json_dynamics", 8, sp.clone()));
        v.push(("json_dynamics", 10, sp));
    }
    let sections: Map<String, Value> = model["sections"]
        .as_object()
        .map(|m| m.iter().map(|(k, s)| (k.clone(), json!({ "a": s["a"], "iz": s["iz"], "materialId": 1, "b": 0.15, "h": 0.3 }))).collect())
        .unwrap_or_default();
    let materials: Map<String, Value> =
        model["materials"].as_object().map(|m| m.keys().map(|k| (k.clone(), json!({ "fy": 250.0 }))).collect()).unwrap_or_default();
    let pl = json!({ "solver": model, "sections": sections, "materials": materials });
    v.push(("json_plastic", 0, pl.clone()));
    v.push(("json_plastic", 2, pl));
    v
}

fn seeds_3d(model: &Value, results: Option<&Value>) -> Vec<(&'static str, u8, Value)> {
    let d = densities(model);
    let mut v = common(model, results, true);
    let th = json!({ "solver": model, "densities": d, "timeStep": 0.01, "nSteps": 40, "groundAccelX": vec![0.5; 40] });
    v.push(("json_dynamics", 13, th.clone()));
    v.push(("json_dynamics", 15, th));
    let input: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
    let dens: HashMap<String, f64> = serde_json::from_value(d.clone()).unwrap();
    if let Ok(m) = modal::solve_modal_3d(&input, &dens, 3) {
        let sp = json!({ "solver": model, "modes": m.modes, "densities": d, "spectrum": spectrum(), "direction": "X" });
        v.push(("json_dynamics", 9, sp.clone()));
        v.push(("json_dynamics", 11, sp));
    }
    let sections: Map<String, Value> = model["sections"]
        .as_object()
        .map(|m| {
            m.iter()
                .map(|(k, s)| (k.clone(), json!({ "a": s["a"], "iy": s["iy"], "iz": s["iz"], "materialId": 1, "b": 0.15, "h": 0.3 })))
                .collect()
        })
        .unwrap_or_default();
    let materials: Map<String, Value> =
        model["materials"].as_object().map(|m| m.keys().map(|k| (k.clone(), json!({ "fy": 250.0 }))).collect()).unwrap_or_default();
    let pl = json!({ "solver": model, "sections": sections, "materials": materials });
    v.push(("json_plastic", 1, pl.clone()));
    v.push(("json_plastic", 3, pl));
    v
}
