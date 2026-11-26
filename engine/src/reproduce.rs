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
    fn json_analysis_refuses_duplicate_connector_keys() {
        let mut failures = Vec::new();
        for space in [false, true] {
            let mut model = cantilever(space);
            model["loads"] = if space {
                json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 1, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}])
            } else {
                json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 1, "fz": 0, "my": 0}}])
            };
            let first = json!({"id": 17, "nodeI": 1, "nodeJ": 2, "kAxial": 1e6});
            let second = json!({"id": 18, "nodeI": 1, "nodeJ": 2, "kAxial": 2e6});
            let last_only = json!({"17": second}).to_string();
            let both = json!({"17": first, "18": second}).to_string();
            let empty = model.to_string();
            model["connectors"] = json!({});
            let with_table = |table: &str| model.to_string().replace(r#""connectors":{}"#, &format!(r#""connectors":{table}"#));
            let response = |text: &str| {
                if space {
                    let result = solve_3d(&serde_json::from_str(text).unwrap()).unwrap();
                    (result.displacements.iter().find(|n| n.node_id == 2).unwrap().ux, result.element_forces[0].n_start.abs())
                } else {
                    let result = solve_2d(&serde_json::from_str(text).unwrap()).unwrap();
                    (result.displacements.iter().find(|n| n.node_id == 2).unwrap().ux, result.element_forces[0].n_start.abs())
                }
            };
            let (bare_ux, bare_force) = response(&empty);
            let (last_ux, last_force) = response(&with_table(&last_only));
            let (both_ux, both_force) = response(&with_table(&both));
            assert!(0.0 < both_ux && both_ux < last_ux && last_ux < bare_ux);
            assert!(0.0 < both_force && both_force < last_force && last_force < bare_force);
            assert!(pdelta(&with_table(&both), space).is_ok());

            for table in [
                format!(r#"{{"17":{first},"17":{second}}}"#),
                format!(r#"{{"17":{first},"18":{second},"1\u0037":{first}}}"#),
                format!(r#"{{"17":{first},"17":null}}"#),
            ] {
                let text = with_table(&table);
                for (path, result) in [
                    ("linear replay", linear_hashes(&text, space).map(|_| ())),
                    ("P-Delta", pdelta(&text, space)),
                ] {
                    if !matches!(&result, Err(error) if error.contains("duplicate key in field `connectors`")) {
                        failures.push(format!("space={space}, {path}: {result:?}"));
                    }
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn json_analysis_refuses_duplicate_structural_table_keys() {
        use crate::solver::staged::{parse_staged_2d, parse_staged_3d};
        use crate::types::units::{ElasticInput2D, ElasticInput3D};

        let mut failures = Vec::new();
        for space in [false, true] {
            let mut model = cantilever(space);
            model["loads"] = if space {
                json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 1, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}])
            } else {
                json!([{"type": "nodal", "data": {"nodeId": 2, "fx": 1, "fz": 0, "my": 0}}])
            };
            let mut both = model.clone();
            let mut last_only = model.clone();
            let mut second = model["elements"]["1"].clone();
            second["id"] = json!(2);
            both["elements"]["2"] = second.clone();
            last_only["elements"]["1"] = second.clone();
            let tip = |model: &Value| {
                if space {
                    solve_3d(&serde_json::from_value(model.clone()).unwrap()).unwrap()
                        .displacements.iter().find(|n| n.node_id == 2).unwrap().ux
                } else {
                    solve_2d(&serde_json::from_value(model.clone()).unwrap()).unwrap()
                        .displacements.iter().find(|n| n.node_id == 2).unwrap().ux
                }
            };
            let both_ux = tip(&both);
            assert!(0.0 < both_ux && both_ux < tip(&last_only));
            assert!(linear_hashes(&both.to_string(), space).is_ok());
            assert!(pdelta(&both.to_string(), space).is_ok());

            let common = ["nodes", "materials", "sections", "elements", "supports"];
            let shell_rows = [
                ("plates", json!({"id": 1, "nodes": [1, 2, 3], "materialId": 1, "thickness": 0.1})),
                ("quads", json!({"id": 1, "nodes": [1, 2, 3, 4], "materialId": 1, "thickness": 0.1})),
                ("quad9s", json!({"id": 1, "nodes": [1, 2, 3, 4, 5, 6, 7, 8, 9], "materialId": 1, "thickness": 0.1})),
                ("solidShells", json!({"id": 1, "nodes": [1, 2, 3, 4, 5, 6, 7, 8], "materialId": 1})),
                ("curvedShells", json!({"id": 1, "nodes": [1, 2, 3, 4], "materialId": 1, "thickness": 0.1})),
            ];
            let tables = common.into_iter().map(|field| (field, model[field]["1"].clone()))
                .chain(shell_rows.into_iter().filter(|_| space));
            for (field, first) in tables {
                let last = if field == "elements" { &second } else { &first };
                let mut empty = model.clone();
                empty[field] = json!({});
                let replace = |entries: &str| {
                    empty.to_string().replace(&format!(r#""{field}":{{}}"#), &format!(r#""{field}":{{{entries}}}"#))
                };
                let check = |text: &str| {
                    if space {
                        serde_json::from_str::<ElasticInput3D>(text).map(|_| ())
                    } else {
                        serde_json::from_str::<ElasticInput2D>(text).map(|_| ())
                    }
                };
                assert!(check(&replace(&format!(r#""1":{first}"#))).is_ok(), "{field}");
                assert!(check(&replace(&format!(r#""1":{first},"2":{last}"#))).is_ok(), "{field}");

                for entries in [
                    format!(r#""1":{first},"1":{last}"#),
                    format!(r#""1":{first},"2":{last},"\u0031":{last}"#),
                    format!(r#""1":{first},"1":null"#),
                ] {
                    let text = replace(&entries);
                    let staged = format!(r#"{},"stages":[]}}"#, text.strip_suffix('}').unwrap());
                    let mut results = vec![
                        ("typed wire", check(&text).map_err(|e| e.to_string())),
                        ("linear replay", linear_hashes(&text, space).map(|_| ())),
                        ("P-Delta", pdelta(&text, space)),
                    ];
                    match (space, field) {
                        (false, _) => results.push(("staged", parse_staged_2d(&staged).map(|_| ()))),
                        (true, "solidShells" | "curvedShells") => {}
                        (true, _) => results.push(("staged", parse_staged_3d(&staged).map(|_| ()))),
                    }
                    for (path, result) in results {
                        let expected = format!("duplicate key in field `{field}`");
                        if !matches!(&result, Err(error) if error.contains(&expected)) {
                            failures.push(format!("space={space}, {path}, {field}: {result:?}"));
                        }
                    }
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn json_analysis_refuses_duplicate_nested_table_keys() {
        use crate::solver::{
            contact::{ContactInput, ContactInput3D},
            creep_shrinkage::{CreepShrinkageInput, CreepShrinkageInput3D},
            fiber_nonlinear::{FiberNonlinearInput, FiberNonlinearInput3D},
            harmonic::{HarmonicInput, HarmonicInput3D},
            load_cases::CombinationDef,
            plastic_limit::LimitInput,
            reduction::{CraigBamptonInput, CraigBamptonInput3D},
        };
        use crate::types::{
            CableInput, ImperfectionInput, ModalInput, ModalInput3D, NonlinearMaterialInput,
            NonlinearMaterialInput3D, PlasticInput, PlasticInput3D, SpectralInput, SpectralInput3D,
            TimeHistoryInput, TimeHistoryInput3D,
        };

        fn check<T: serde::de::DeserializeOwned>(
            input: Value, field: &str, row: Value, failures: &mut Vec<String>,
        ) {
            let input = input.to_string();
            let encode = |second_key: &str| {
                input.replace(
                    &format!(r#""{field}":{{}}"#),
                    &format!(r#""{field}":{{"1":{row},"{second_key}":{row}}}"#),
                )
            };
            assert!(serde_json::from_str::<T>(&encode("2")).is_ok(), "{} {field}", std::any::type_name::<T>());
            let expected = format!("duplicate key in field `{field}`");
            if !matches!(serde_json::from_str::<T>(&encode("1")), Err(error) if error.to_string().contains(&expected)) {
                failures.push(format!("{} {field}", std::any::type_name::<T>()));
            }
        }

        let mut failures = Vec::new();
        let plane = cantilever(false);
        let space = cantilever(true);
        macro_rules! check {
            ($type:ty, $input:expr, $field:literal, $row:tt) => {{
                let mut input = $input;
                input[$field] = json!({});
                check::<$type>(input, $field, json!($row), &mut failures);
            }};
        }
        check!(CombinationDef, json!({"name": "D"}), "factors", 1);
        check!(ModalInput, json!({"solver": plane}), "densities", 1);
        check!(ModalInput3D, json!({"solver": space}), "densities", 1);
        check!(CableInput<SolverInput>, json!({"solver": plane}), "densities", 1);
        check!(CableInput<SolverInput3D>, json!({"solver": space}), "pretension", 1);
        check!(TimeHistoryInput, json!({"solver": plane, "timeStep": 1, "nSteps": 2}), "densities", 1);
        check!(TimeHistoryInput3D, json!({"solver": space, "timeStep": 1, "nSteps": 2}), "densities", 1);
        check!(HarmonicInput, json!({"solver": plane, "frequencies": [], "responseNodeId": 2}), "densities", 1);
        check!(HarmonicInput3D, json!({"solver": space, "frequencies": [], "responseNodeId": 2}), "densities", 1);
        check!(CraigBamptonInput, json!({"solver": plane, "boundaryNodes": []}), "densities", 1);
        check!(CraigBamptonInput3D, json!({"solver": space, "boundaryNodes": []}), "densities", 1);
        check!(ContactInput, json!({"solver": plane}), "elementBehaviors", "tension_only");
        check!(ContactInput3D, json!({"solver": space}), "elementBehaviors", "tension_only");
        check!(FiberNonlinearInput, json!({"solver": plane}), "fiberSections", {"fibers": [], "materials": []});
        check!(FiberNonlinearInput3D, json!({"solver": space}), "fiberSections", {"fibers": [], "materials": []});
        check!(CreepShrinkageInput, json!({"solver": plane, "timeSteps": []}), "creepParams", {"fc": 1, "rh": 1, "h0": 1});
        check!(CreepShrinkageInput3D, json!({"solver": space, "timeSteps": []}), "creepParams", {"fc": 1, "rh": 1, "h0": 1});
        check!(LimitInput, json!({"solver": plane}), "mp", 1);
        check!(LimitInput, json!({"solver": plane}), "np", 1);
        check!(ImperfectionInput, json!({}), "initialDisplacements", [0, 0, 0]);
        check!(ImperfectionInput, json!({}), "residualStresses", {"type": "uniform", "stress": 1});

        let plastic = json!({"solver": plane, "sections": {}, "materials": {}});
        let plastic3d = json!({"solver": space, "sections": {}, "materials": {}});
        check!(PlasticInput, plastic.clone(), "mpOverrides", 1);
        check!(PlasticInput, plastic.clone(), "sections", {"a": 1, "iz": 1, "materialId": 1});
        check!(PlasticInput, plastic, "materials", {});
        check!(PlasticInput3D, plastic3d.clone(), "mpOverrides", [1, 1]);
        check!(PlasticInput3D, plastic3d.clone(), "sections", {"a": 1, "iy": 1, "iz": 1, "materialId": 1});
        check!(PlasticInput3D, plastic3d, "materials", {});

        let nonlinear = json!({"solver": plane, "materialModels": {}, "sectionCapacities": {}});
        let nonlinear3d = json!({"solver": space, "materialModels": {}, "sectionCapacities": {}});
        check!(NonlinearMaterialInput, nonlinear.clone(), "materialModels", {"modelType": "elastic", "fy": 1});
        check!(NonlinearMaterialInput, nonlinear, "sectionCapacities", {"np": 1, "mp": 1});
        check!(NonlinearMaterialInput3D, nonlinear3d.clone(), "materialModels", {"modelType": "elastic", "fy": 1});
        check!(NonlinearMaterialInput3D, nonlinear3d, "sectionCapacities", {"np": 1, "mpy": 1, "mpz": 1});
        let spectrum = json!({"name": "Test", "points": []});
        check!(SpectralInput, json!({"solver": plane, "modes": [], "spectrum": spectrum, "direction": "X"}), "densities", 1);
        check!(SpectralInput3D, json!({"solver": space, "modes": [], "spectrum": spectrum, "direction": "X"}), "densities", 1);

        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn json_analysis_refuses_duplicate_section_ratio_keys() {
        use crate::section::{SectionInput, analyze_section};

        let section = r#"{"polygons":[{"materialId":1,"vertices":[[0,0],[2,0],[2,1],[0,1]]}],"modularRatios":{}}"#;
        let encode = |rows: &str| section.replace(r#""modularRatios":{}"#, &format!(r#""modularRatios":{{{rows}}}"#));
        let area = |rows: &str| {
            let input = serde_json::from_str::<SectionInput>(&encode(rows)).unwrap();
            analyze_section(&input).unwrap().a
        };

        assert_eq!(area(""), area(r#""1":1"#));
        assert_eq!(area(r#""1":2,"2":3"#), 2.0 * area(r#""1":1"#));
        let mut accepted = Vec::new();
        for rows in [r#""1":1,"1":2"#, r#""1":1,"1":null"#] {
            let input = serde_json::from_str::<SectionInput>(&encode(rows));
            if !matches!(input, Err(error) if error.to_string().contains("duplicate key in field `modularRatios`")) {
                accepted.push(rows);
            }
        }
        assert!(accepted.is_empty(), "{accepted:?}");
    }

    #[test]
    fn planar_json_requires_a_named_model() {
        let model = cantilever(false);
        let positional = json!([
            model["nodes"], model["materials"], model["sections"],
            model["elements"], model["supports"], model["loads"],
            [], {}, null, {}, false, {}, {}, {}, {}, {}
        ]);
        let named = model.to_string();
        let unnamed = positional.to_string();
        assert!(linear_hashes(&named, false).is_ok());
        assert!(pdelta(&named, false).is_ok());
        assert!(linear_hashes(&unnamed, false).is_err());
        assert!(pdelta(&unnamed, false).is_err());
        assert!(serde_json::from_value::<SolverInput>(positional).is_err());
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

#[test]
fn staged_wire_fixtures_preserve_their_support_and_section_contracts() {
    use crate::types::{StagedInput, StagedInput3D};
    use serde_json::Value;

    for source in [
        include_str!("../tests/fixtures/staged-removal-r20.json"),
        include_str!("../tests/fixtures/staged-global-springs-r20.json"),
        include_str!("../tests/fixtures/staged-determined-r23.json"),
    ] {
        let cases: Vec<Value> = serde_json::from_str(source).unwrap();
        let mut failures = Vec::new();
        for case in cases {
            let model = case["model"].clone();
            let decoded = if case["dim"] == 2 {
                serde_json::from_value::<StagedInput>(model).map(|_| ())
            } else {
                serde_json::from_value::<StagedInput3D>(model).map(|_| ())
            };
            if let Err(error) = decoded {
                failures.push(format!("{}: {error}", case["name"]));
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}

#[test]
fn staged_wire_refuses_tables_it_cannot_consume() {
    use crate::solver::staged::{parse_staged_2d, parse_staged_3d, solve_staged_2d, solve_staged_3d};
    use crate::types::{StagedInput, StagedInput3D};
    use serde_json::{json, Value};

    fn decode_2d(value: &Value) -> Result<Value, String> {
        let model: StagedInput = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
        Ok(serde_json::to_value(solve_staged_2d(&model)?).unwrap())
    }

    fn decode_3d(value: &Value) -> Result<Value, String> {
        let model: StagedInput3D = serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
        Ok(serde_json::to_value(solve_staged_3d(&model)?).unwrap())
    }

    let mut failures = Vec::new();
    for spatial in [false, true] {
        let sections = if spatial {
            json!({"1": {"id": 1, "a": 1, "iy": 1, "iz": 1, "j": 1}})
        } else {
            json!({"1": {"id": 1, "a": 1, "iz": 1}})
        };
        let supports = if spatial {
            json!({"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}})
        } else {
            json!({"1": {"id": 1, "nodeId": 1, "type": "fixed"}})
        };
        let dof = if spatial {
            json!({"nodeId": 2, "fx": 1, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0})
        } else {
            json!({"nodeId": 2, "fx": 1, "fz": 0, "my": 0})
        };
        let base = json!({
            "nodes": {"1": {"id": 1, "x": 0, "y": 0}, "2": {"id": 2, "x": 1, "y": 0}},
            "materials": {"1": {"id": 1, "e": 1, "nu": 0}},
            "sections": sections,
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": supports,
            "loads": [{"type": "nodal", "data": dof}],
            "stages": [{"name": "Load beam", "elementsAdded": [1], "supportsAdded": [1], "loadIndices": [0]}]
        });
        let mut base = base;
        if spatial {
            base["nodes"]["1"]["z"] = json!(0);
            base["nodes"]["2"]["z"] = json!(0);
        }
        let decode = if spatial { decode_3d } else { decode_2d };
        let parse = |value: &Value| {
            if spatial {
                parse_staged_3d(&value.to_string()).and_then(|model| solve_staged_3d(&model))
                    .map(|results| serde_json::to_value(results).unwrap())
            } else {
                parse_staged_2d(&value.to_string()).and_then(|model| solve_staged_2d(&model))
                    .map(|results| serde_json::to_value(results).unwrap())
            }
        };
        let expected = decode(&base).unwrap();
        assert_eq!(expected["finalResults"]["displacements"][1]["ux"], json!(1.0 / 1000.0));

        let fields: &[(&str, &str)] = if spatial {
            &[
                ("solidShells", "solid shell elements"),
                ("curvedShells", "curved shell elements"),
                ("curvedBeams", "curved beams"),
                ("connectors", "connector elements"),
                ("quad9s", "Nine-node shell elements"),
            ]
        } else {
            &[
                ("solidShells", "Shell elements require 3D analysis"),
                ("curvedShells", "Shell elements require 3D analysis"),
                ("plates", "Shell elements require 3D analysis"),
                ("quads", "Shell elements require 3D analysis"),
                ("quad9s", "Shell elements require 3D analysis"),
                ("connectors", "connector elements"),
            ]
        };
        for &(field, diagnostic) in fields {
            for (empty, populated) in [
                (json!({}), json!({"1": {"id": 1}})),
                (json!([]), json!([{"id": 1}])),
                (Value::Null, json!(true)),
            ] {
                let mut input = base.clone();
                input[field] = empty;
                for (entry, result) in [("decode", decode(&input)), ("parse", parse(&input))] {
                    if result.as_ref() != Ok(&expected) {
                        failures.push(format!("{spatial} {entry} empty {field} {}: {result:?}", input[field]));
                    }
                }
                input[field] = populated;
                for (entry, result) in [("decode", decode(&input)), ("parse", parse(&input))] {
                    match result {
                        Err(error) if error.contains(diagnostic) => (),
                        Ok(_) => failures.push(format!("{spatial} {entry} {field} {} returned a result", input[field])),
                        Err(error) => failures.push(format!("{spatial} {entry} {field}: {error}")),
                    }
                }
            }
        }
        let mut input = base.clone();
        input["shellTableTypo"] = json!({"1": {"id": 1}});
        for (entry, result) in [("decode", decode(&input)), ("parse", parse(&input))] {
            match result {
                Err(error) if error.contains("unknown field `shellTableTypo`") => (),
                Ok(_) => failures.push(format!("{spatial} {entry} shellTableTypo returned a result")),
                Err(error) => failures.push(format!("{spatial} {entry} shellTableTypo: {error}")),
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
