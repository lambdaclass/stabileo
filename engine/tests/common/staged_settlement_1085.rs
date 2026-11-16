use dedaliano_engine::solver::{linear, staged};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};

pub fn input(dim: usize, copies: usize, factor: f64, linked: bool) -> Value {
    let mut source: Value = serde_json::from_str(include_str!(
        "../metamorphic_corpus/nightly/issue-1085.json"
    ))
    .unwrap();
    source["supports"]["1"]["dz"] = json!(source["supports"]["1"]["dz"].as_f64().unwrap() * factor);
    if dim == 3 {
        for node in source["nodes"].as_object_mut().unwrap().values_mut() {
            node["y"] = json!(0.0);
        }
        source["elements"]["1"]
            .as_object_mut()
            .unwrap()
            .remove("hingeStart");
        source["elements"]["1"]
            .as_object_mut()
            .unwrap()
            .remove("hingeEnd");
        let iz = source["sections"]["1"]["iz"].clone();
        source["sections"]["1"]["iy"] = iz.clone();
        source["sections"]["1"]["j"] = iz;
        for axis in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
            source["supports"]["1"][axis] = json!(true);
        }
    }
    if !linked {
        source["nodes"].as_object_mut().unwrap().remove("3");
        source["constraints"] = json!([]);
    }
    let mut result = source.clone();
    result["constraints"] = json!([]);
    for kind in ["nodes", "elements", "supports"] {
        result[kind] = json!({});
    }
    for copy in 0..copies {
        for (key, node) in source["nodes"].as_object().unwrap() {
            let id = key.parse::<usize>().unwrap() + 3 * copy;
            let mut node = node.clone();
            node["id"] = json!(id);
            result["nodes"][id.to_string()] = node;
        }
        let id = copy + 1;
        let mut element = source["elements"]["1"].clone();
        element["id"] = json!(id);
        element["nodeI"] = json!(1 + 3 * copy);
        element["nodeJ"] = json!(2 + 3 * copy);
        result["elements"][id.to_string()] = element;
        let mut support = source["supports"]["1"].clone();
        support["id"] = json!(id);
        support["nodeId"] = json!(1 + 3 * copy);
        result["supports"][id.to_string()] = support;
        if linked {
            let mut constraint = source["constraints"][0].clone();
            constraint["masterNode"] = json!(2 + 3 * copy);
            constraint["slaveNode"] = json!(3 + 3 * copy);
            result["constraints"]
                .as_array_mut()
                .unwrap()
                .push(constraint);
        }
    }
    result
}

fn reference(result: &Value, input: &Value, dim: usize) -> Result<(), String> {
    let dz = input["supports"]["1"]["dz"].as_f64().unwrap();
    let a = &input["nodes"]["1"];
    let b = &input["nodes"]["2"];
    let length = (b["x"].as_f64().unwrap() - a["x"].as_f64().unwrap())
        .hypot(b["z"].as_f64().unwrap() - a["z"].as_f64().unwrap());
    let force = input["materials"]["1"]["e"].as_f64().unwrap()
        * input["sections"]["1"]["a"].as_f64().unwrap()
        * dz.abs()
        / length;
    for (group, fields, scale, count) in [
        (
            "displacements",
            if dim == 2 {
                vec!["ux", "uz"]
            } else {
                vec!["ux", "uy", "uz"]
            },
            dz.abs(),
            input["nodes"].as_object().unwrap().len(),
        ),
        (
            "displacements",
            if dim == 2 {
                vec!["ry"]
            } else {
                vec!["rx", "ry", "rz"]
            },
            dz.abs() / length,
            input["nodes"].as_object().unwrap().len(),
        ),
        (
            "reactions",
            if dim == 2 {
                vec!["rx", "rz"]
            } else {
                vec!["fx", "fy", "fz"]
            },
            force,
            input["supports"].as_object().unwrap().len(),
        ),
        (
            "reactions",
            if dim == 2 {
                vec!["my"]
            } else {
                vec!["mx", "my", "mz"]
            },
            force * length,
            input["supports"].as_object().unwrap().len(),
        ),
        (
            "elementForces",
            if dim == 2 {
                vec!["nStart", "nEnd", "vStart", "vEnd"]
            } else {
                vec!["nStart", "nEnd", "vyStart", "vyEnd", "vzStart", "vzEnd"]
            },
            force,
            input["elements"].as_object().unwrap().len(),
        ),
        (
            "elementForces",
            if dim == 2 {
                vec!["mStart", "mEnd"]
            } else {
                vec!["mxStart", "mxEnd", "myStart", "myEnd", "mzStart", "mzEnd"]
            },
            force * length,
            input["elements"].as_object().unwrap().len(),
        ),
    ] {
        let items = result[group]
            .as_array()
            .ok_or_else(|| format!("missing {group}"))?;
        if items.len() != count {
            return Err(format!(
                "{group}: {} entries, expected {count}",
                items.len()
            ));
        }
        for item in items {
            for field in &fields {
                let actual = item[field]
                    .as_f64()
                    .ok_or_else(|| format!("missing {field}"))?;
                let expected = if group == "displacements" && *field == "uz" {
                    dz
                } else {
                    0.0
                };
                if !actual.is_finite() || (actual - expected).abs() > 2.5e-10 * scale {
                    return Err(format!("{group} {field}: {actual:e} != {expected:e}"));
                }
            }
        }
    }
    Ok(())
}

pub fn check(dim: usize) {
    for linked in [false, true] {
        check_kind(dim, linked);
    }
}

pub fn check_kind(dim: usize, linked: bool) {
    for copies in [1, 22] {
        for factor in [1.0, -1.0, 0.0] {
            let mut input = input(dim, copies, factor, linked);
            let linear = if dim == 2 {
                serde_json::to_value(
                    linear::solve_2d(
                        &serde_json::from_value::<SolverInput>(input.clone()).unwrap(),
                    )
                    .unwrap(),
                )
                .unwrap()
            } else {
                serde_json::to_value(
                    linear::solve_3d(
                        &serde_json::from_value::<SolverInput3D>(input.clone()).unwrap(),
                    )
                    .unwrap(),
                )
                .unwrap()
            };
            reference(&linear, &input, dim).unwrap();
            input["stages"] = json!([]);
            let refused = if dim == 2 {
                staged::solve_staged_2d(&staged::parse_staged_2d(&input.to_string()).unwrap())
                    .unwrap_err()
            } else {
                staged::solve_staged_3d(&staged::parse_staged_3d(&input.to_string()).unwrap())
                    .unwrap_err()
            };
            assert!(refused.contains("No construction stages defined"));
            for count in [1, 2, 3] {
                let first = json!({"name": "settle", "elementsAdded": (1..=copies).collect::<Vec<_>>(), "supportsAdded": if dim == 2 { (1..=copies).collect::<Vec<_>>() } else { (0..copies).map(|c| 1 + 3 * c).collect::<Vec<_>>() }});
                let mut stages = vec![first];
                stages.extend((1..count).map(|_| json!({"name": "hold"})));
                input["stages"] = json!(stages);
                let result = if dim == 2 {
                    serde_json::to_value(
                        staged::solve_staged_2d(
                            &staged::parse_staged_2d(&input.to_string()).unwrap(),
                        )
                        .unwrap(),
                    )
                    .unwrap()
                } else {
                    serde_json::to_value(
                        staged::solve_staged_3d(
                            &staged::parse_staged_3d(&input.to_string()).unwrap(),
                        )
                        .unwrap(),
                    )
                    .unwrap()
                };
                let stages = result["stages"].as_array().unwrap();
                assert_eq!(stages.len(), count);
                for stage in stages {
                    reference(&stage["results"], &input, dim).unwrap();
                }
                reference(&result["finalResults"], &input, dim).unwrap();
                if factor != 0.0 {
                    let mut wrong = result["finalResults"].clone();
                    let node = wrong["displacements"]
                        .as_array_mut()
                        .unwrap()
                        .iter_mut()
                        .find(|d| d["nodeId"] == 2)
                        .unwrap();
                    node["uz"] = json!(2.0 * node["uz"].as_f64().unwrap());
                    assert!(reference(&wrong, &input, dim).is_err());
                }
                let mut missing = result["finalResults"].clone();
                missing["displacements"] = json!([]);
                assert!(reference(&missing, &input, dim).is_err());
            }
        }
    }
}
