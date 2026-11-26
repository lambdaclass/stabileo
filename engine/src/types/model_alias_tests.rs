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
        "id": 1, "nodeId": 1, "type": "fixed", "dz": 0.01, "dry": 0.02, "angle": 0.02
    });
    assert_eq!(positional::<SolverSupport>(support.clone()), expected);
    assert_eq!(positional::<units::TypedSupport>(support.clone()), expected);
    let mut extra = support;
    extra.as_array_mut().unwrap().push(json!(0.02));
    assert!(serde_json::from_value::<SolverSupport>(extra).is_err());

    let minimal = positional::<SolverSupport>(json!([1, 1, "fixed"]));
    assert_eq!(minimal, json!({"id": 1, "nodeId": 1, "type": "fixed"}));
    assert_eq!(
        positional::<SolverNodalLoad>(json!([1, 0, 1, 2])),
        json!({"nodeId": 1, "fx": 0.0, "fz": 1.0, "my": 2.0})
    );
    assert_eq!(
        positional::<SolverPointLoadOnElement>(json!([1, 1, 2, null, 3])),
        json!({"elementId": 1, "a": 1.0, "p": 2.0, "my": 3.0})
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

#[cfg(test)]
mod planar_nodal {
    use super::*;

    #[test]
    fn canonical_model_alias_planar_nodal_wire_keys_are_mapped_or_checked() {
        fn check<T: DeserializeOwned + Serialize>(
            key: &str,
            wire: Value,
            expected: Result<Value, &str>,
        ) {
            for decoded in [
                serde_json::from_value::<T>(wire.clone()),
                serde_json::from_str::<T>(&wire.to_string()),
            ] {
                match &expected {
                    Ok(expected) => assert_eq!(
                        serde_json::to_value(decoded.unwrap()).unwrap(),
                        *expected,
                        "{key}"
                    ),
                    Err(message) => match decoded {
                        Err(error) => {
                            assert!(error.to_string().contains(message), "{key}: {error}")
                        }
                        Ok(_) => panic!("{key}: accepted {wire}"),
                    },
                }
            }
        }

        let canonical = json!({"nodeId": 2, "fx": 1.0, "fz": 2.0, "my": 3.0});
        let cases = [
            ("nodeId", Some("nodeId")),
            ("fx", Some("fx")),
            ("fz", Some("fz")),
            ("my", Some("my")),
            ("fy", Some("fz")),
            ("mz", Some("my")),
            ("id", None),
            ("caseId", None),
        ];
        let mut unknown = canonical.clone();
        unknown["unknown"] = json!(5);
        let error = serde_json::from_value::<SolverNodalLoad>(unknown)
            .unwrap_err()
            .to_string();
        let accepted_keys: std::collections::BTreeSet<_> =
            error.split('`').skip(3).step_by(2).collect();
        assert_eq!(
            accepted_keys,
            cases.iter().map(|&(key, _)| key).chain(["mx"]).collect()
        );
        for (key, maps_to) in cases {
            let mut wire = canonical.clone();
            let expected = if let Some(maps_to) = maps_to {
                let value = if key == "nodeId" {
                    json!(7)
                } else {
                    json!(7.0)
                };
                let mut expected = canonical.clone();
                expected[maps_to] = value.clone();
                wire.as_object_mut().unwrap().remove(maps_to);
                wire[key] = value;
                Ok(expected)
            } else {
                wire[key] = json!(9_007_199_254_740_991_u64);
                Ok(canonical.clone())
            };
            check::<SolverNodalLoad>(key, wire.clone(), expected.clone());
            check::<units::TypedNodalLoad>(key, wire, expected);
        }

        let mut padded = canonical.clone();
        for key in ["fy", "mx", "mz"] {
            padded[key] = json!(-0.0);
        }
        check::<SolverNodalLoad>("zero padding", padded.clone(), Ok(canonical.clone()));
        check::<units::TypedNodalLoad>("zero padding", padded.clone(), Ok(canonical.clone()));

        for (key, message) in [
            ("fy", "out-of-plane nodal component `fy`"),
            ("mx", "out-of-plane nodal component `mx`"),
            ("mz", "out-of-plane nodal component `mz`"),
        ] {
            for value in [json!(-5), json!(5), json!(null), json!("0")] {
                let mut wire = padded.clone();
                wire[key] = value;
                let expected = if wire[key].is_number() {
                    message
                } else {
                    "invalid type"
                };
                check::<SolverNodalLoad>(key, wire.clone(), Err(expected));
                check::<units::TypedNodalLoad>(key, wire, Err(expected));
            }
        }

        for key in ["bw", "momentX"] {
            let mut wire = canonical.clone();
            wire[key] = json!(5);
            check::<SolverNodalLoad>(key, wire.clone(), Err("unknown field"));
            check::<units::TypedNodalLoad>(key, wire, Err("unknown field"));
        }

        let mut short = canonical.clone();
        short["mx"] = json!(5);
        let unsupported = "out-of-plane nodal component `mx`";
        check::<SolverNodalLoad>("short nonzero padding", short.clone(), Err(unsupported));
        check::<units::TypedNodalLoad>("short nonzero padding", short.clone(), Err(unsupported));
        short["mx"] = json!(0);
        check::<SolverNodalLoad>("short zero padding", short.clone(), Ok(canonical.clone()));
        check::<units::TypedNodalLoad>("short zero padding", short, Ok(canonical));
    }

    #[test]
    fn canonical_model_alias_refuses_the_dropped_couple_before_native_solves() {
        let mut model = json!({
            "nodes": { "1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":2,"z":0} },
            "elements": {"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "materials": {"1":{"id":1,"e":200000,"nu":0.3}},
            "sections": {"1":{"id":1,"a":0.01,"iz":1e-4}},
            "supports": {"1":{"id":1,"nodeId":1,"type":"fixed"}},
            "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":0,"mx":5,"my":0,"mz":0}}]
        });
        let linear = |model: &Value| crate::reproduce::linear_hashes(&model.to_string(), false);
        let pdelta = |model: &Value| {
            let model: SolverInput =
                serde_json::from_str(&model.to_string()).map_err(|e| e.to_string())?;
            let result = crate::solver::pdelta::solve_pdelta_2d(&model, 20, 1e-9)?;
            assert!(result.converged);
            crate::reproduce::canonical_results_json(&result.results)
        };

        let refused = [linear(&model).err(), pdelta(&model).err()];
        let mut control = model.clone();
        control["loads"][0]["data"] = json!({"nodeId":2,"fx":0,"fz":0,"my":0});
        let control_hashes = linear(&control).unwrap();
        let control_pdelta = pdelta(&control).unwrap();
        model["loads"][0]["data"]["mx"] = json!(0);
        assert_eq!(
            linear(&model).unwrap().results_sha256,
            control_hashes.results_sha256
        );
        assert_eq!(pdelta(&model).unwrap(), control_pdelta);
        assert!(
            refused.iter().all(|error| error
                .as_deref()
                .is_some_and(|s| s.contains("out-of-plane nodal component `mx`"))),
            "linear and P-Delta must refuse the applied couple: {refused:?}"
        );
    }

    #[test]
    fn canonical_model_alias_spatial_nodal_couple_reaches_native_solves() {
        let model = json!({
            "nodes": { "1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":2,"y":0,"z":0} },
            "elements": {"1":{"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1}},
            "materials": {"1":{"id":1,"e":262144,"nu":0}},
            "sections": {"1":{"id":1,"a":0.01,"iy":1e-4,"iz":1e-4,"j":0.0009765625}},
            "supports": {"1":{"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}},
            "loads": [{"type":"nodal","data":{"nodeId":2,"fx":0,"fy":0,"fz":0,"mx":5,"my":0,"mz":0}}]
        });
        let model: units::ElasticInput3D = serde_json::from_str(&model.to_string()).unwrap();
        let model = model.into_legacy();
        let linear = crate::solver::linear::solve_3d(&model).unwrap();
        let pdelta = crate::solver::pdelta::solve_pdelta_3d(&model, 20, 1e-9).unwrap();
        assert!(pdelta.converged);
        for reactions in [&linear.reactions, &pdelta.results.reactions] {
            assert_eq!(reactions.len(), 1);
            assert_eq!(reactions[0].mx, -5.0);
        }
    }
}

#[test]
fn producer_wire_metadata_is_accepted_by_native_wire_types() {
    use crate::reproduce::canonical_results_json;
    use crate::solver::{linear, pdelta};

    fn check<T: DeserializeOwned + Serialize>(
        model: &Value,
        table: &str,
        metadata: &[(&str, Value)],
        misspelled: &str,
        solve: impl Fn(T) -> String,
    ) {
        let decode = |input: &Value| serde_json::from_str::<T>(&input.to_string());
        let mut produced = model.clone();
        for (key, value) in metadata {
            produced[table]["1"][key] = value.clone();
        }
        let expected = decode(model).unwrap();
        let actual = decode(&produced).unwrap();
        assert_eq!(serde_json::to_value(&actual).unwrap(), serde_json::to_value(&expected).unwrap());
        assert_eq!(solve(actual), solve(expected));

        produced[table]["1"][misspelled] = json!(1);
        let error = decode(&produced).err().unwrap();
        assert_eq!(error.classify(), serde_json::error::Category::Data);
    }

    let planar = json!({
        "nodes": { "1": {"id": 1, "x": 0, "z": 0}, "2": {"id": 2, "x": 2, "z": 0} },
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fz": 1, "my": 0}}],
        "materials": {"1": {"id": 1, "e": 25000, "nu": 0.2}},
        "sections": {"1": {"id": 1, "a": 0.18, "iz": 0.00135}},
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}}
    });
    let spatial = json!({
        "nodes": { "1": {"id": 1, "x": 0, "y": 0, "z": 0}, "2": {"id": 2, "x": 2, "y": 0, "z": 0} },
        "elements": planar["elements"],
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": 1, "mx": 0, "my": 0, "mz": 0}}],
        "materials": planar["materials"],
        "sections": {"1": {"id": 1, "a": 0.18, "iy": 0.0054, "iz": 0.00135, "j": 0.001}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}}
    });
    let material = [
        ("name", json!("H25")), ("fc", json!(25)), ("fy", json!(420)),
        ("fu", json!(400)), ("rho", json!(25)),
    ];
    let section = [("b", json!(0.3)), ("h", json!(0.6)), ("rotation", json!(0))];
    let planar_section = [
        ("name", json!("RC")), ("iy", json!(0.0054)), ("j", json!(0.001)),
        section[0].clone(), section[1].clone(), section[2].clone(),
    ];
    let support = [
        ("id", json!(1)), ("type", json!("fixed")), ("stabilised", json!("created")),
        ("stabilisedAxes", json!([true, true, true])),
    ];

    let planar_linear = |input: units::ElasticInput2D| {
        canonical_results_json(&linear::solve_2d_typed(&input).unwrap()).unwrap()
    };
    let planar_nonlinear = |input: SolverInput| {
        canonical_results_json(&pdelta::solve_pdelta_2d(&input, 20, 1e-9).unwrap().results).unwrap()
    };
    let spatial_linear = |input: units::ElasticInput3D| {
        canonical_results_json(&linear::solve_3d(&input.into_legacy()).unwrap()).unwrap()
    };
    let spatial_nonlinear = |input: SolverInput3D| {
        canonical_results_json(&pdelta::solve_pdelta_3d(&input, 20, 1e-9).unwrap().results).unwrap()
    };
    for (table, metadata, typo) in [
        ("materials", material.as_slice(), "nU"),
        ("sections", planar_section.as_slice(), "asYY"),
    ] {
        check(&planar, table, metadata, typo, planar_linear);
        check(&planar, table, metadata, typo, planar_nonlinear);
    }
    for (table, metadata, typo) in [
        ("materials", material.as_slice(), "nU"),
        ("sections", section.as_slice(), "asYY"),
        ("supports", support.as_slice(), "rrX"),
    ] {
        check(&spatial, table, metadata, typo, spatial_linear);
        check(&spatial, table, metadata, typo, spatial_nonlinear);
    }
}

#[test]
fn producer_wire_metadata_remains_named_and_unique() {
    let row = r#"[1,25000,0.2]"#;
    let excess = r#"[1,25000,0.2,"H25"]"#;
    let duplicate = r#"{"id":1,"e":25000,"nu":0.2,"name":"H25","name":"RC"}"#;
    assert!(serde_json::from_str::<SolverMaterial>(row).is_ok());
    assert!(serde_json::from_str::<units::ElasticMaterial>(row).is_ok());
    for invalid in [excess, duplicate] {
        assert!(serde_json::from_str::<SolverMaterial>(invalid).is_err());
        assert!(serde_json::from_str::<units::ElasticMaterial>(invalid).is_err());
    }
}
