//! Real-model acceptance suite (docs/VERIFICATION.md layer 9,
//! testing/docs/ACCEPTANCE.md).
//!
//! Every case in `tests/acceptance/models/*.json` is a public benchmark with
//! published reference results: the model in stabileo's solver JSON, the
//! analysis to run, the source of every reference value and a tolerance
//! justified by the precision the source reports. A failure here is either a
//! stabileo bug (fix the engine, add a regression test) or a modelling
//! difference that must be documented in the case and in ACCEPTANCE.md —
//! never a reason to widen a tolerance.
//!
//! Case file schema (camelCase):
//!   id, title, dimension ("2d" | "3d"), analysis ("linear" | "modal" | "buckling"),
//!   numModes (modal/buckling), densities (modal: materialId -> kg/m^3),
//!   source {citation, where, independence}, modelling [notes],
//!   references [{quantity, ..selector.., value, tolAbs?, tolRel?, tolBasis}],
//!   model (SolverInput / SolverInput3D).
//! Quantities: "frequency" (Hz) / "period" (s) / "eigenvalue" (omega^2,
//! (rad/s)^2) / "loadFactor" with `mode`
//! (1-based); "displacement" / "reaction" with `node` + `component`;
//! "elementForce" with `element` + `component` (field names of the result
//! structs, e.g. "ux", "rz", "mStart"). Reference values are in the engine's
//! units (m, kN, kN·m, rad); the source's own value and unit may be kept in
//! `sourceValue`/`sourceUnit` for traceability.

use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::{solve_buckling_2d, solve_buckling_3d, solve_modal_2d, solve_modal_3d};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

fn models_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/acceptance/models")
}

fn load(id: &str) -> Value {
    let path = models_dir().join(format!("{id}.json"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

fn to_json<T: serde::Serialize>(r: Result<T, String>, id: &str) -> Value {
    serde_json::to_value(r.unwrap_or_else(|e| panic!("{id}: solver error: {e}"))).unwrap()
}

/// Runs the case's analysis and returns the solver's result struct as JSON.
fn run(case: &Value) -> Value {
    let id = case["id"].as_str().unwrap();
    let three_d = match case["dimension"].as_str() {
        Some("2d") => false,
        Some("3d") => true,
        other => panic!("{id}: dimension must be \"2d\" or \"3d\", got {other:?}"),
    };
    let model = case["model"].clone();
    let num_modes = case["numModes"].as_u64().unwrap_or(4) as usize;
    let densities: HashMap<String, f64> =
        serde_json::from_value(case.get("densities").cloned().unwrap_or(Value::Null)).unwrap_or_default();
    let analysis = case["analysis"].as_str().unwrap();
    if three_d {
        let m: SolverInput3D = serde_json::from_value(model).unwrap_or_else(|e| panic!("{id}: model: {e}"));
        match analysis {
            "linear" => to_json(solve_3d(&m), id),
            "modal" => to_json(solve_modal_3d(&m, &densities, num_modes), id),
            "buckling" => to_json(solve_buckling_3d(&m, num_modes), id),
            a => panic!("{id}: unknown analysis {a}"),
        }
    } else {
        let m: SolverInput = serde_json::from_value(model).unwrap_or_else(|e| panic!("{id}: model: {e}"));
        match analysis {
            "linear" => to_json(solve_2d(&m), id),
            "modal" => to_json(solve_modal_2d(&m, &densities, num_modes), id),
            "buckling" => to_json(solve_buckling_2d(&m, num_modes), id),
            a => panic!("{id}: unknown analysis {a}"),
        }
    }
}

fn pick<'a>(list: &'a Value, key: &str, id: u64, what: &str) -> &'a Value {
    list.as_array()
        .unwrap_or_else(|| panic!("result has no list for {what}"))
        .iter()
        .find(|e| e[key].as_u64() == Some(id))
        .unwrap_or_else(|| panic!("{what} {id} not in results"))
}

fn computed(result: &Value, r: &Value) -> f64 {
    let q = r["quantity"].as_str().unwrap();
    let field = |v: &Value, c: &str| {
        v[c].as_f64().unwrap_or_else(|| panic!("component {c} missing for {q}"))
    };
    match q {
        "frequency" | "period" | "loadFactor" | "eigenvalue" => {
            let mode = r["mode"].as_u64().expect("mode") as usize;
            let modes = result["modes"].as_array().expect("modes");
            assert!(mode >= 1 && mode <= modes.len(), "mode {mode} not computed ({} modes)", modes.len());
            if q == "eigenvalue" {
                field(&modes[mode - 1], "omega").powi(2)
            } else {
                field(&modes[mode - 1], q)
            }
        }
        "displacement" | "reaction" => {
            let list = if q == "displacement" { &result["displacements"] } else { &result["reactions"] };
            let node = r["node"].as_u64().expect("node");
            field(pick(list, "nodeId", node, q), r["component"].as_str().expect("component"))
        }
        "elementForce" => {
            let el = r["element"].as_u64().expect("element");
            field(pick(&result["elementForces"], "elementId", el, q), r["component"].as_str().expect("component"))
        }
        other => panic!("unknown quantity {other}"),
    }
}

fn describe(r: &Value) -> String {
    let q = r["quantity"].as_str().unwrap();
    match q {
        "frequency" | "period" | "loadFactor" | "eigenvalue" => format!("{q} mode {}", r["mode"]),
        "elementForce" => format!("{q} el {} {}", r["element"], r["component"].as_str().unwrap()),
        _ => format!("{q} node {} {}", r["node"], r["component"].as_str().unwrap()),
    }
}

/// Checks every reference of one case; panics with the full comparison
/// table if any value falls outside its tolerance.
fn check(id: &str) {
    let case = load(id);
    assert_eq!(case["id"].as_str(), Some(id), "case id must match its file name");
    for k in ["title", "source", "references", "model", "analysis"] {
        assert!(case.get(k).is_some(), "{id}: missing `{k}`");
    }
    let src = &case["source"];
    for k in ["citation", "where", "independence"] {
        assert!(src[k].as_str().map_or(false, |s| !s.is_empty()), "{id}: source.{k} required");
    }
    let refs = case["references"].as_array().unwrap();
    assert!(!refs.is_empty(), "{id}: no references");
    let result = run(&case);
    let mut table = String::new();
    let mut failures = 0;
    for r in refs {
        let reference = r["value"].as_f64().expect("value");
        let tol_abs = r["tolAbs"].as_f64().unwrap_or(0.0);
        let tol_rel = r["tolRel"].as_f64().unwrap_or(0.0);
        assert!(tol_abs > 0.0 || tol_rel > 0.0, "{id}: {} has no tolerance", describe(r));
        assert!(r["tolBasis"].as_str().map_or(false, |s| !s.is_empty()), "{id}: {} needs tolBasis", describe(r));
        let allowed = tol_abs.max(tol_rel * reference.abs());
        let got = computed(&result, r);
        let err = (got - reference).abs();
        let ok = got.is_finite() && err <= allowed;
        if !ok {
            failures += 1;
        }
        table.push_str(&format!(
            "  {:<4} {:<34} ref {:>14.6e}  stabileo {:>14.6e}  |err| {:>10.3e}  allowed {:>10.3e}{}\n",
            if ok { "ok" } else { "FAIL" },
            describe(r),
            reference,
            got,
            err,
            allowed,
            if reference != 0.0 { format!("  ({:+.3}%)", 100.0 * (got - reference) / reference) } else { String::new() },
        ));
    }
    println!("{id}: {}\n{table}", case["title"].as_str().unwrap());
    assert_eq!(failures, 0, "{id}: {failures} reference value(s) out of tolerance\n{table}");
}

/// Case names on disk (`tests/acceptance/models/*.json`), sorted.
fn models_on_disk() -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(models_dir())
        .unwrap()
        .filter_map(|e| {
            let p = e.unwrap().path();
            (p.extension()? == "json").then(|| p.file_stem().unwrap().to_string_lossy().into_owned())
        })
        .collect();
    v.sort();
    v
}

/// The inventory mismatch between model files and wired tests: (model
/// files with no test, tests with no model file).
fn inventory_mismatch(on_disk: &[String], wired: &[&str]) -> (Vec<String>, Vec<String>) {
    let unwired = on_disk.iter().filter(|m| !wired.contains(&m.as_str())).cloned().collect();
    let orphan = wired.iter().filter(|w| !on_disk.iter().any(|m| m == *w)).map(|w| w.to_string()).collect();
    (unwired, orphan)
}

/// Every model file must have a test, so no case can be added and then
/// never run. `CASES` and the test functions come from the same `cases!`
/// invocation, so a name in the inventory always has a test that solves it.
#[test]
fn acceptance_every_model_has_a_test() {
    let (unwired, orphan) = inventory_mismatch(&models_on_disk(), CASES);
    assert!(unwired.is_empty(), "model files with no test (add them to cases!): {unwired:?}");
    assert!(orphan.is_empty(), "cases! names with no model file: {orphan:?}");
}

/// Self-check of the guard: an unwired model file and an orphan name are
/// both reported.
#[test]
fn acceptance_inventory_guard_catches_unwired_model() {
    let on_disk = vec!["a".to_string(), "b".to_string()];
    assert_eq!(inventory_mismatch(&on_disk, &["a", "b"]), (vec![], vec![]));
    assert_eq!(inventory_mismatch(&on_disk, &["a"]), (vec!["b".to_string()], vec![]));
    assert_eq!(inventory_mismatch(&on_disk, &["a", "b", "c"]), (vec![], vec!["c".to_string()]));
    // and the real inventory is exactly the macro's list, one test per name
    let mut names: Vec<&str> = CASES.to_vec();
    names.sort();
    names.dedup();
    assert_eq!(names.len(), CASES.len(), "duplicate case name in cases!");
}

/// One list generates both the inventory `CASES` and one `#[test]` per case.
macro_rules! cases {
    ($($name:ident),* $(,)?) => {
        const CASES: &[&str] = &[$(stringify!($name)),*];
        $( #[test] fn $name() { check(stringify!($name)); } )*
    };
}

cases!(
    sac_la_3story,
    sac_la_9story,
    sac_la_20story,
    asce_shm_120dof_undamaged,
    asce_shm_120dof_damage_i,
    asce_shm_120dof_damage_ii,
    bathe_wilson_10bay_9storey,
    asce_shm_12dof_undamaged,
    asce_shm_12dof_damage_i,
    asce_shm_12dof_damage_ii,
    asce_shm_12dof_storey_stiffness_undamaged,
    asce_shm_12dof_storey_stiffness_damage_i,
);
