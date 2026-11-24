use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

use super::*;

fn aliases<T: DeserializeOwned + Serialize>(canonical: Value, pairs: &[(&str, &str)]) {
    let expected =
        serde_json::to_value(serde_json::from_value::<T>(canonical.clone()).unwrap()).unwrap();
    for &(field, alias) in pairs {
        let mut legacy = canonical.clone();
        let value = legacy.as_object_mut().unwrap().remove(field).unwrap();
        legacy[alias] = value.clone();
        let actual =
            serde_json::to_value(serde_json::from_value::<T>(legacy.clone()).unwrap()).unwrap();
        assert_eq!(actual, expected);
        legacy[field] = value;
        let mut ambiguous = legacy.clone();
        ambiguous[alias] = json!(0);
        assert!(
            serde_json::from_value::<T>(ambiguous).is_err(),
            "{field}/{alias}"
        );
        let actual = serde_json::to_value(serde_json::from_value::<T>(legacy).unwrap()).unwrap();
        assert_eq!(actual, expected);
    }
}

#[test]
fn canonical_model_alias_planar_coordinates_require_exactly_one_spelling() {
    let canonical = json!({"id":1,"x":0.0,"z":1.0});
    let legacy = json!({"id":1,"x":0.0,"y":1.0});
    for node in [canonical.clone(), legacy] {
        let node = serde_json::from_value::<SolverNode>(node).unwrap();
        assert_eq!(serde_json::to_value(node).unwrap(), canonical);
    }
    for y in [0, 1] {
        let ambiguous = json!({"id":1,"x":0,"z":1,"y":y});
        assert!(serde_json::from_value::<SolverNode>(ambiguous).is_err());
    }
}

#[test]
fn canonical_model_alias_legacy_wire_records() {
    aliases::<SolverSupport>(
        json!({"id":1,"nodeId":1,"type":"fixed","dz":1,"dry":1}),
        &[("dz", "dy"), ("dry", "drz")],
    );
    aliases::<SolverNodalLoad>(
        json!({"nodeId":1,"fx":0,"fz":1,"my":1}),
        &[("fz", "fy"), ("my", "mz")],
    );
    aliases::<SolverPointLoadOnElement>(json!({"elementId":1,"a":1,"p":0,"my":1}), &[("my", "mz")]);
    aliases::<NodalMass>(
        json!({"nodeId":1,"massZ":1,"iy":1}),
        &[("massZ", "massY"), ("iy", "iz")],
    );
    aliases::<SpectralModeDisp>(
        json!({"nodeId":1,"ux":0,"uz":1,"ry":1}),
        &[("uz", "uy"), ("ry", "rz")],
    );
}

#[test]
fn canonical_model_aliases_reach_native_linear_and_pdelta_solves() {
    let model = json!({
        "nodes": { "1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":2,"z":0} },
        "elements": {"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "materials": {"1":{"id":1,"e":200000,"nu":0.3}},
        "sections": {"1":{"id":1,"a":0.01,"iz":1e-4}},
        "supports": {"1":{"id":1,"nodeId":1,"type":"fixed"}},
        "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fz":0,"my":5}}]
    });
    let mut paired = model.clone();
    paired["loads"][0]["data"]["mz"] = json!(5);
    let canonical = crate::reproduce::linear_hashes(&model.to_string(), false).unwrap();
    let agreeing = crate::reproduce::linear_hashes(&paired.to_string(), false).unwrap();
    assert_eq!(canonical.input_sha256, agreeing.input_sha256);
    assert_eq!(canonical.results_sha256, agreeing.results_sha256);

    let solve = |input| {
        let parsed = serde_json::from_value::<SolverInput>(input).unwrap();
        let result = crate::solver::pdelta::solve_pdelta_2d(&parsed, 20, 1e-9).unwrap();
        crate::reproduce::canonical_results_json(&result.results).unwrap()
    };
    assert_eq!(solve(paired.clone()), solve(model));
    paired["loads"][0]["data"]["mz"] = json!(0);
    assert!(crate::reproduce::linear_hashes(&paired.to_string(), false).is_err());
    assert!(serde_json::from_value::<SolverInput>(paired).is_err());
}

#[test]
fn canonical_model_alias_positional_records_keep_legacy_field_order() {
    let support = json!([1, 1, "fixed", null, null, null, null, 0.01, 0.02, 0.02]);
    let expected = json!({
        "id": 1, "nodeId": 1, "type": "fixed", "kx": null, "ky": null, "kz": null,
        "dx": null, "dz": 0.01, "dry": 0.02, "angle": 0.02
    });
    assert_eq!(positional::<SolverSupport>(support.clone()), expected);
    assert_eq!(positional::<units::TypedSupport>(support.clone()), expected);
    let mut extra = support;
    extra.as_array_mut().unwrap().push(json!(0.02));
    assert!(serde_json::from_value::<SolverSupport>(extra).is_err());

    let minimal = positional::<SolverSupport>(json!([1, 1, "fixed"]));
    assert_eq!(minimal["dz"], Value::Null);
    assert_eq!(minimal["dry"], Value::Null);
    assert_eq!(minimal["angle"], Value::Null);
    assert_eq!(
        positional::<SolverNodalLoad>(json!([1, 0, 1, 2])),
        json!({"nodeId": 1, "fx": 0.0, "fz": 1.0, "my": 2.0})
    );
    assert_eq!(
        positional::<SolverPointLoadOnElement>(json!([1, 1, 2, null, 3])),
        json!({"elementId": 1, "a": 1.0, "p": 2.0, "px": null, "my": 3.0})
    );
    assert_eq!(
        positional::<NodalMass>(json!([1, 2, 3, 4, 5])),
        json!({"nodeId": 1, "mass": 2.0, "massX": 3.0, "massZ": 4.0, "iy": 5.0})
    );
    assert_eq!(
        positional::<SpectralModeDisp>(json!([1, 2, 3, 4])),
        json!({"nodeId": 1, "ux": 2.0, "uz": 3.0, "ry": 4.0})
    );
    assert!(serde_json::from_value::<SolverNodalLoad>(json!([1, 2, 3])).is_err());
}

fn positional<T: DeserializeOwned + Serialize>(wire: Value) -> Value {
    let json = serde_json::to_value(serde_json::from_value::<T>(wire.clone()).unwrap()).unwrap();
    let decoded: T = serde_json::from_str(&wire.to_string()).unwrap();
    assert_eq!(serde_json::to_value(decoded).unwrap(), json);
    json
}

#[test]
fn canonical_model_alias_positional_support_reaches_native_linear_and_pdelta() {
    let mut model = json!({
        "nodes": { "1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":2,"z":0} },
        "elements": {"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
        "materials": {"1":{"id":1,"e":200000,"nu":0.3}},
        "sections": {"1":{"id":1,"a":0.01,"iz":1e-4}},
        "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fz":0,"my":5}}]
    });
    model["supports"] = json!({"1": {"id": 1, "nodeId": 1, "type": "fixed", "dz": 0.01, "dry": 0.02, "angle": 0.02}});
    let linear =
        |input: &Value| crate::reproduce::linear_hashes(&input.to_string(), false).unwrap();
    let pdelta = |input: &Value| {
        let parsed: SolverInput = serde_json::from_value(input.clone()).unwrap();
        let result = crate::solver::pdelta::solve_pdelta_2d(&parsed, 20, 1e-9).unwrap();
        crate::reproduce::canonical_results_json(&result.results).unwrap()
    };
    let reference = linear(&model);
    let nonlinear = pdelta(&model);
    model["supports"]["1"] = json!([1, 1, "fixed", null, null, null, null, 0.01, 0.02, 0.02]);
    assert_eq!(pdelta(&model), nonlinear);
    let actual = linear(&model);
    assert_eq!(actual.input_sha256, reference.input_sha256);
    assert_eq!(actual.results_sha256, reference.results_sha256);
}
