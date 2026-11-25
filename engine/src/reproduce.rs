//! Reproducing a linear solve from its provenance (testing/docs/PROVENANCE.md).
//!
//! The web app records, for the static solve behind a report, the SHA-256 of the
//! solver input as the engine parsed it and of the engine's result, both as
//! canonical JSON (`certify::provenance::canonical_json`: keys sorted, compact,
//! every f64 in its shortest round-trip form). `cargo run --release --example
//! reproduce -- input.json` recomputes both from the same input natively; the WASM
//! export `engine_reproduce_hashes` computes them in the browser.
//!
//! Wall-clock fields (`timings`, `solveTimings`, `runMeta`) are left out of the
//! result hash: they describe the run, not the answer.

use crate::certify::provenance::{canonical_json, sha256_hex};
use crate::solver::linear::{solve_2d, solve_3d};
use crate::types::{SolverInput, SolverInput3D};
use serde::Serialize;

/// The hashes that identify one linear solve.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReproduceHashes {
    /// `2d` or `3d`.
    pub dimension: String,
    /// SHA-256 of the canonical JSON of the parsed solver input.
    pub input_sha256: String,
    /// SHA-256 of the canonical JSON of the result, without wall-clock fields.
    pub results_sha256: String,
    pub engine_version: String,
    pub engine_commit: String,
}

const RUN_FIELDS: [&str; 3] = ["timings", "solveTimings", "runMeta"];

fn strip_run_fields(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(m) => {
            for k in RUN_FIELDS {
                m.remove(k);
            }
            m.values_mut().for_each(strip_run_fields);
        }
        serde_json::Value::Array(a) => a.iter_mut().for_each(strip_run_fields),
        _ => {}
    }
}

/// Canonical JSON of a result, wall-clock fields removed.
pub fn canonical_results_json<T: Serialize>(r: &T) -> Result<String, String> {
    let mut v = serde_json::to_value(r).map_err(|e| format!("result does not serialize: {e}"))?;
    strip_run_fields(&mut v);
    canonical_json(&v)
}

fn hashes<I: Serialize, R: Serialize>(dim: &str, input: &I, result: &R) -> Result<ReproduceHashes, String> {
    Ok(ReproduceHashes {
        dimension: dim.into(),
        input_sha256: sha256_hex(canonical_json(input)?.as_bytes()),
        results_sha256: sha256_hex(canonical_results_json(result)?.as_bytes()),
        engine_version: env!("CARGO_PKG_VERSION").into(),
        engine_commit: env!("STABILEO_ENGINE_COMMIT").into(),
    })
}

/// Solve a linear `SolverInput` (2D) or `SolverInput3D` (3D) given as JSON and hash input and result.
pub fn linear_hashes(json: &str, is_3d: bool) -> Result<ReproduceHashes, String> {
    if is_3d {
        let input = serde_json::from_str::<crate::types::units::ElasticInput3D>(json).map_err(|e| format!("SolverInput3D: {e}"))?.into_legacy();
        let r = solve_3d(&input)?;
        hashes("3d", &input, &r)
    } else {
        let input: SolverInput = serde_json::from_str(json).map_err(|e| format!("SolverInput: {e}"))?;
        let r = solve_2d(&input)?;
        hashes("2d", &input, &r)
    }
}

#[cfg(test)]
mod tests {
    use super::linear_hashes;
    use crate::solver::linear::{solve_2d, solve_3d};
    use crate::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d};
    use crate::types::{SolverInput, SolverInput3D};
    use serde_json::{json, Value};

    #[test]
    fn strict_analysis_wire_rejects_ignored_fields() {
        let mut failures = Vec::new();
        for space in [false, true] {
            for (pointer, field, value) in [
                ("", "solverOption", json!({"method": "direct"})),
                ("/materials/1", "poissonRatio", json!(0)),
                ("/sections/1", "shearArea", json!(1)),
            ] {
                let mut model = cantilever(space);
                assert!(linear_hashes(&model.to_string(), space).is_ok());
                model.pointer_mut(pointer).unwrap()[field] = value;
                let text = model.to_string();
                let legacy = if space {
                    serde_json::from_str::<SolverInput3D>(&text).map(|_| ())
                } else {
                    serde_json::from_str::<SolverInput>(&text).map(|_| ())
                };
                let typed = if space {
                    serde_json::from_str::<crate::types::units::ElasticInput3D>(&text).map(|_| ())
                } else {
                    serde_json::from_str::<crate::types::units::ElasticInput2D>(&text).map(|_| ())
                };
                for (path, result) in [
                    ("linear replay", linear_hashes(&text, space).map(|_| ())),
                    ("legacy wire", legacy.map_err(|error| error.to_string())),
                    ("typed wire", typed.map_err(|error| error.to_string())),
                ] {
                    let expected = format!("unknown field `{field}`");
                    if !matches!(&result, Err(error) if error.contains(&expected)) {
                        failures.push(format!("space={space}, {path}, {field}: {result:?}"));
                    }
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn time_history_rejects_cross_dimension_excitation() {
        use crate::solver::time_integration::{solve_time_history_2d, solve_time_history_3d};
        use crate::types::{TimeHistoryInput, TimeHistoryInput3D};

        let run = |text: &str, space| {
            if space {
                let input = serde_json::from_str::<TimeHistoryInput3D>(text).map_err(|e| e.to_string())?;
                solve_time_history_3d(&input).map(|_| ())
            } else {
                let input = serde_json::from_str::<TimeHistoryInput>(text).map_err(|e| e.to_string())?;
                solve_time_history_2d(&input).map(|_| ())
            }
        };

        let mut failures = Vec::new();
        for (space, field) in [(false, "groundAccelX"), (true, "groundAccel")] {
            let mut input = json!({"solver": cantilever(space), "densities": {"1": 1}, "timeStep": 1, "nSteps": 3});
            assert!(run(&input.to_string(), space).is_ok());
            input[field] = json!([0, 1, 0]);
            let result = run(&input.to_string(), space);
            if !matches!(&result, Err(error) if error.contains(field)) {
                failures.push(format!("space={space}, {field}: {result:?}"));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    fn cantilever(space: bool) -> Value {
        let mut input = json!({
            "nodes": {"1": {"id": 1, "x": 0, "z": 0}, "2": {"id": 2, "x": 5, "z": 0}},
            "materials": {"1": {"id": 1, "e": 200000, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
            "loads": [{"type": "pointOnElement", "data": {"elementId": 1, "a": 1, "p": -10}}]
        });
        if space {
            for node in ["1", "2"] {
                input["nodes"][node]["y"] = json!(0);
            }
            input["sections"]["1"]["iy"] = json!(1e-4);
            input["sections"]["1"]["j"] = json!(2e-4);
            input["supports"]["1"] = json!({"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true});
            input["loads"][0]["data"] = json!({"elementId": 1, "a": 1, "py": 0, "pz": -10});
        }
        input
    }

    fn pdelta(text: &str, space: bool) -> Result<(), String> {
        if space {
            let input: SolverInput3D = serde_json::from_str(text).map_err(|err| err.to_string())?;
            solve_pdelta_3d(&input, 20, 1e-8).map(|_| ())
        } else {
            let input: SolverInput = serde_json::from_str(text).map_err(|err| err.to_string())?;
            solve_pdelta_2d(&input, 20, 1e-8).map(|_| ())
        }
    }

    #[test]
    fn issue_2472_native_linear_refuses_null_numeric_fields() {
        check_refusals(|text, space| linear_hashes(text, space).map(|_| ()));
    }

    #[test]
    fn issue_2472_native_pdelta_refuses_null_numeric_fields() {
        check_refusals(pdelta);
    }

    fn check_refusals(run: impl Fn(&str, bool) -> Result<(), String>) {
        let mut failures = Vec::new();
        for space in [false, true] {
            let input = cantilever(space);
            assert!(run(&input.to_string(), space).is_ok());
            for (pointer, field, bad) in [
                ("/loads/0/data", "my", Value::Null),
                ("/loads/0/data", "mz", Value::Null),
                ("/loads/0/data", "px", Value::Null),
                ("/supports/1", "kx", Value::Null),
                ("/materials/1", "e", Value::Null),
                ("/supports/1", "kx", json!("0")),
            ] {
                let mut bad_input = input.clone();
                bad_input.pointer_mut(pointer).unwrap()[field] = bad;
                let text = bad_input.to_string();
                let result = run(&text, space);
                let named_field = if space || !matches!(field, "my" | "mz") { field } else { "my/mz" };
                let diagnostic = format!("Invalid numeric input at {named_field} (");
                if !matches!(&result, Err(error) if error.contains(&diagnostic)) {
                    failures.push(format!("space={space}, {pointer}/{field}: {result:?}"));
                }
            }
            let mut missing = input.clone();
            missing["materials"]["1"].as_object_mut().unwrap().remove("e");
            assert!(matches!(run(&missing.to_string(), space), Err(error) if error.contains("`e`")));
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn issue_2472_native_point_load_requires_supported_moment_components() {
        let mut failures = Vec::new();
        for space in [false, true] {
            let omitted = cantilever(space);
            let fields: &[&str] = if space { &["mx", "my", "mz"] } else { &["mx"] };
            let mut zero = omitted.clone();
            for &field in fields {
                zero["loads"][0]["data"][field] = json!(-0.0);
            }
            let reference = linear_hashes(&omitted.to_string(), space).unwrap();
            match linear_hashes(&zero.to_string(), space) {
                Ok(actual) => assert_eq!(actual, reference),
                Err(error) => failures.push(format!("space={space}, linear zero: {error}")),
            }
            if let Err(error) = pdelta(&zero.to_string(), space) {
                failures.push(format!("space={space}, P-Delta zero: {error}"));
            }
            for &field in fields {
                for (value, diagnostic) in [
                    (Value::Null, format!("Invalid numeric input at {field}")),
                    (json!("0"), format!("Invalid numeric input at {field}")),
                    (json!(1e-20), format!("Unsupported point load field {field}")),
                    (json!(-10), format!("Unsupported point load field {field}")),
                ] {
                    let mut input = omitted.clone();
                    input["loads"][0]["data"][field] = value.clone();
                    let text = input.to_string();
                    for (path, result) in [("linear", linear_hashes(&text, space).map(|_| ())), ("P-Delta", pdelta(&text, space))] {
                        if !matches!(&result, Err(error) if error.contains(&diagnostic)) {
                            failures.push(format!("space={space}, {path}, {field}={value}: {result:?}"));
                        }
                    }
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn issue_2472_native_applies_either_planar_point_moment_alias_with_its_sign() {
        let input = cantilever(false);
        let reactions = |wire: &Value| {
            let input: SolverInput = serde_json::from_value(wire.clone()).unwrap();
            let linear = solve_2d(&input).unwrap();
            let pdelta = solve_pdelta_2d(&input, 20, 1e-8).unwrap();
            assert!(pdelta.converged);
            (linear.reactions[0].my, pdelta.results.reactions[0].my)
        };
        let (linear_base, pdelta_base) = reactions(&input);
        for field in ["my", "mz"] {
            for moment in [-5.0, 5.0] {
                let mut loaded = input.clone();
                loaded["loads"][0]["data"][field] = json!(moment);
                let (linear, pdelta) = reactions(&loaded);
                assert!((linear - linear_base + moment).abs() < 1e-8, "{field}: {linear}");
                assert!((pdelta - pdelta_base + moment).abs() < 1e-8, "{field}: {pdelta}");
            }
        }
    }

    #[test]
    fn issue_2472_native_keeps_omitted_and_explicit_zero_optional_fields() {
        for space in [false, true] {
            let omitted = cantilever(space);
            let mut zero = omitted.clone();
            zero["loads"][0]["data"]["px"] = json!(0);
            if !space {
                zero["loads"][0]["data"]["my"] = json!(0);
            }
            let reactions = |input: Value| {
                if space {
                    let input = serde_json::from_value(input).unwrap();
                    let result = solve_3d(&input).unwrap();
                    (json!(result.displacements), json!(result.reactions))
                } else {
                    let input = serde_json::from_value(input).unwrap();
                    let result = solve_2d(&input).unwrap();
                    (json!(result.displacements), json!(result.reactions))
                }
            };
            assert_eq!(reactions(omitted), reactions(zero.clone()));
            assert!(pdelta(&zero.to_string(), space).is_ok());
        }
    }
}
