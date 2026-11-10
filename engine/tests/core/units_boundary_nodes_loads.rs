use dedaliano_engine::solver::linear::{solve_2d, solve_2d_typed, solve_3d};
use dedaliano_engine::types::units::{ElasticInput2D, ElasticInput3D, TypedLoad, TypedLoad3D, TypedNode, TypedNode3D};
use dedaliano_engine::types::{SolverInput, SolverInput3D, SolverLoad, SolverLoad3D, SolverNode, SolverNode3D};
use serde_json::{json, Value};
use std::collections::HashMap;
use crate::units_legacy_3d as legacy;

fn fixtures(three_d: bool) -> Vec<(String, String)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut out: Vec<(String, String)> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.contains("3d") == three_d && name.ends_with("input.json")
        })
        .map(|p| (p.display().to_string(), std::fs::read_to_string(&p).unwrap()))
        .collect();
    out.sort();
    out
}

fn bits(v: f64) -> u64 {
    v.to_bits()
}

fn node_bits_2d(nodes: &HashMap<String, SolverNode>) -> Vec<(String, usize, u64, u64)> {
    let mut out: Vec<_> = nodes.iter().map(|(k, n)| (k.clone(), n.id, bits(n.x), bits(n.z))).collect();
    out.sort();
    out
}

fn node_bits_3d(nodes: &HashMap<String, SolverNode3D>) -> Vec<(String, usize, u64, u64, u64)> {
    let mut out: Vec<_> = nodes.iter().map(|(k, n)| (k.clone(), n.id, bits(n.x), bits(n.y), bits(n.z))).collect();
    out.sort();
    out
}

fn load_bits_2d(loads: &[SolverLoad]) -> Vec<(usize, Vec<Option<u64>>)> {
    loads
        .iter()
        .map(|l| match l {
            SolverLoad::Nodal(n) => (n.node_id, vec![Some(bits(n.fx)), Some(bits(n.fz)), Some(bits(n.my))]),
            SolverLoad::PointOnElement(p) => {
                (p.element_id, vec![Some(bits(p.a)), Some(bits(p.p)), p.px.map(bits), p.my.map(bits)])
            }
            other => (usize::MAX, vec![Some(serde_json::to_string(other).unwrap().len() as u64)]),
        })
        .collect()
}

fn load_bits_3d(loads: &[SolverLoad3D]) -> Vec<(usize, Vec<Option<u64>>)> {
    loads
        .iter()
        .map(|l| match l {
            SolverLoad3D::Nodal(n) => (
                n.node_id,
                [n.fx, n.fy, n.fz, n.mx, n.my, n.mz].into_iter().map(|v| Some(bits(v))).chain([n.bw.map(bits)]).collect(),
            ),
            SolverLoad3D::PointOnElement(p) => (p.element_id, vec![Some(bits(p.a)), Some(bits(p.py)), Some(bits(p.pz))]),
            other => (usize::MAX, vec![Some(serde_json::to_string(other).unwrap().len() as u64)]),
        })
        .collect()
}

fn without_timings(value: Value) -> String {
    fn strip(v: &mut Value) {
        match v {
            Value::Object(m) => {
                m.remove("timings");
                m.values_mut().for_each(strip);
            }
            Value::Array(a) => a.iter_mut().for_each(strip),
            _ => {}
        }
    }
    let mut value = value;
    strip(&mut value);
    value.to_string()
}

fn every_2d_field() -> Value {
    json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.14159, "y": -0.0}, "3": {"id": 3, "x": 6.0, "z": 1e-17}},
        "materials": {"1": {"id": 1, "e": 27123.456789, "nu": 0.271}},
        "sections": {"1": {"id": 1, "a": 0.0137, "iz": 0.000173, "asY": 0.006127}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}, "2": {"id": 2, "nodeId": 3, "type": "rollerX"}},
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 1.25, "fz": -10, "my": 0.3}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": -0.0, "fy": 7.1, "mz": -2.2}},
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 1.1, "p": -4.4, "px": 0.7, "my": 1.9}},
            {"type": "pointOnElement", "data": {"elementId": 2, "a": 0.4, "p": 3, "mz": -0.6}},
            {"type": "pointOnElement", "data": {"elementId": 2, "a": 2.0, "p": 1e-9, "px": null}},
            {"type": "distributed", "data": {"elementId": 1, "qI": -5, "qJ": -2}}
        ]
    })
}

fn every_3d_field() -> Value {
    json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.14159, "y": 0.1, "z": -0.0}, "3": {"id": 3, "x": 3.14159, "y": 4.0, "z": 1e-17}},
        "materials": {"1": {"id": 1, "e": 27123.456789, "nu": 0.271}},
        "sections": {"1": {"id": 1, "a": 0.0137, "iy": 0.000173, "iz": 0.0001234567, "j": 1.7e-6, "asY": 0.006127}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true},
            "2": {"nodeId": 3, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}
        },
        "loads": [
            {"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fy": -10.0, "fz": 2.5, "mx": 0.3, "my": -0.0, "mz": 0.0}},
            {"type": "nodal", "data": {"nodeId": 2, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 1.7, "bw": 0.02, "axialOf": {"elementId": 1, "end": "j", "p": 3}}},
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 1.1, "py": -4.4, "pz": 0.7}},
            {"type": "pointOnElement", "data": {"elementId": 2, "a": 0.0, "py": 3, "pz": -1e-9}},
            {"type": "distributed", "data": {"elementId": 1, "qYI": -5, "qYJ": -2, "qZI": 0, "qZJ": 1}}
        ]
    })
}


#[test]
fn units_2d_nodes_and_loads_parse_to_the_same_bits_and_results() {
    let mut inputs = fixtures(false);
    inputs.push(("every 2D field".into(), every_2d_field().to_string()));
    let (mut parsed, mut solved) = (0, 0);
    for (what, text) in inputs {
        let legacy = serde_json::from_str::<SolverInput>(&text);
        let typed = serde_json::from_str::<ElasticInput2D>(&text);
        let (legacy, typed) = match (legacy, typed) {
            (Ok(l), Ok(t)) => (l, t),
            (Err(l), Err(t)) => {
                assert_eq!(l.to_string(), t.to_string(), "{what}");
                continue;
            }
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        };
        let erased = typed.clone().into_legacy();
        assert_eq!(serde_json::to_string(&erased.loads).unwrap(), serde_json::to_string(&legacy.loads).unwrap(), "{what}");
        assert_eq!(node_bits_2d(&erased.nodes), node_bits_2d(&legacy.nodes), "{what}");
        assert_eq!(load_bits_2d(&erased.loads), load_bits_2d(&legacy.loads), "{what}");
        parsed += 1;
        match (solve_2d(&legacy), solve_2d_typed(&typed)) {
            (Ok(l), Ok(t)) => {
                assert_eq!(
                    without_timings(serde_json::to_value(&t).unwrap()),
                    without_timings(serde_json::to_value(&l).unwrap()),
                    "{what}"
                );
                solved += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l, t, "{what}"),
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(parsed >= 30, "only {parsed} 2D fixtures parsed");
    assert!(solved >= 30, "only {solved} 2D fixtures solved");
}

#[test]
fn units_2d_old_file_aliases_still_parse() {
    let typed: ElasticInput2D = serde_json::from_value(every_2d_field()).unwrap();
    let erased = typed.into_legacy();
    assert_eq!(bits(erased.nodes["2"].z), bits(-0.0));
    let SolverLoad::Nodal(n) = &erased.loads[1] else { panic!() };
    assert_eq!((bits(n.fx), bits(n.fz), bits(n.my)), (bits(-0.0), bits(7.1), bits(-2.2)));
    let SolverLoad::PointOnElement(p) = &erased.loads[3] else { panic!() };
    assert_eq!((p.px, p.my.map(bits)), (None, Some(bits(-0.6))));
    let SolverLoad::PointOnElement(p) = &erased.loads[4] else { panic!() };
    assert_eq!((p.px, p.my), (None, None));
}

#[test]
fn units_3d_nodes_and_loads_parse_to_the_same_bits_and_results() {
    let mut inputs = fixtures(true);
    inputs.push(("every 3D field".into(), every_3d_field().to_string()));
    let (mut parsed, mut solved) = (0, 0);
    for (what, text) in inputs {
        let value: Value = serde_json::from_str(&text).unwrap();
        let typed = serde_json::from_str::<ElasticInput3D>(&text).map_err(|e| e.to_string());
        let (legacy, typed) = match (legacy::parse(&text), typed) {
            (Ok(l), Ok(t)) => (l, t),
            (Err(l), Err(t)) => {
                assert_eq!(t, l, "{what}");
                continue;
            }
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        };
        let erased = typed.into_legacy();
        assert_eq!(serde_json::to_value(&erased).unwrap(), serde_json::to_value(&legacy).unwrap(), "{what}");
        assert_eq!(node_bits_3d(&erased.nodes), node_bits_3d(&legacy.nodes), "{what}");
        assert_eq!(load_bits_3d(&erased.loads), load_bits_3d(&legacy.loads), "{what}");
        for (k, n) in &erased.nodes {
            let raw = &value["nodes"][k];
            assert_eq!([n.x, n.y, n.z].map(bits), ["x", "y", "z"].map(|c| bits(raw[c].as_f64().unwrap())), "{what} node {k}");
        }
        parsed += 1;
        match (solve_3d(&legacy), solve_3d(&erased)) {
            (Ok(l), Ok(t)) => {
                assert_eq!(
                    without_timings(serde_json::to_value(&t).unwrap()),
                    without_timings(serde_json::to_value(&l).unwrap()),
                    "{what}"
                );
                solved += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l, t, "{what}"),
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(parsed >= 30, "only {parsed} 3D fixtures parsed");
    assert!(solved >= 30, "only {solved} 3D fixtures solved");
}

#[test]
fn units_3d_point_loads_and_bimoment_keep_signed_zeros() {
    let erased = serde_json::from_value::<ElasticInput3D>(every_3d_field()).unwrap().into_legacy();
    assert_eq!(bits(erased.nodes["2"].z), bits(-0.0));
    let SolverLoad3D::Nodal(n) = &erased.loads[0] else { panic!() };
    assert_eq!(bits(n.my), bits(-0.0));
    assert_eq!(n.bw, None);
    let SolverLoad3D::Nodal(n) = &erased.loads[1] else { panic!() };
    assert_eq!(n.bw.map(bits), Some(bits(0.02)));
    let SolverLoad3D::PointOnElement(p) = &erased.loads[3] else { panic!() };
    assert_eq!((bits(p.a), bits(p.pz)), (bits(0.0), bits(-1e-9)));
}

fn malformed_cases() -> Vec<(&'static str, &'static str, Value)> {
    vec![
        ("nodes", "string x", json!({"1": {"id": 1, "x": "0", "z": 0}})),
        ("nodes", "missing coordinate", json!({"1": {"id": 1, "x": 0}})),
        ("nodes", "node is a string", json!({"1": "node"})),
        ("nodes", "null coordinate", json!({"1": {"id": 1, "x": null, "y": 0, "z": 0}})),
        ("loads", "nodal missing fx", json!([{"type": "nodal", "data": {"nodeId": 1, "fz": 0, "my": 0, "fy": 0, "mx": 0, "mz": 0}}])),
        ("loads", "nodal string moment", json!([{"type": "nodal", "data": {"nodeId": 1, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": "1", "mz": 0}}])),
        ("loads", "point string a", json!([{"type": "pointOnElement", "data": {"elementId": 1, "a": "1", "p": 1, "py": 1, "pz": 1}}])),
        ("loads", "point missing force", json!([{"type": "pointOnElement", "data": {"elementId": 1, "a": 1}}])),
        ("loads", "point bool px", json!([{"type": "pointOnElement", "data": {"elementId": 1, "a": 1, "p": 1, "px": true, "py": 1, "pz": 1}}])),
        ("loads", "unknown load type", json!([{"type": "gravity", "data": {}}])),
        ("loads", "missing data", json!([{"type": "nodal"}])),
        ("loads", "load is a number", json!([3])),
        ("loads", "string bimoment", json!([{"type": "nodal", "data": {"nodeId": 1, "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0, "bw": "x"}}])),
    ]
}

#[test]
fn units_malformed_nodes_and_loads_give_the_same_message() {
    let mut compared = 0;
    for (field, what, bad) in malformed_cases() {
        let mut model = every_2d_field();
        model[field] = bad.clone();
        let text = model.to_string();
        let legacy = serde_json::from_str::<SolverInput>(&text).map(|_| ()).map_err(|e| e.to_string());
        let typed = serde_json::from_str::<ElasticInput2D>(&text).map(|_| ()).map_err(|e| e.to_string());
        assert_eq!(typed, legacy, "2D {what}");
        compared += legacy.is_err() as usize;
        let mut model = every_3d_field();
        model[field] = bad.clone();
        let text = model.to_string();
        let typed = serde_json::from_str::<ElasticInput3D>(&text).map(|_| ()).map_err(|e| e.to_string());
        assert_eq!(typed, legacy::parse(&text).map(|_| ()), "3D model {what}");
        assert_eq!(serde_json::from_str::<SolverInput3D>(&text).map(|_| ()).map_err(|e| e.to_string()), typed, "3D model {what}");
        let text = bad.to_string();
        let (legacy, typed) = if field == "nodes" {
            (
                serde_json::from_str::<HashMap<String, SolverNode3D>>(&text).map(|_| ()).map_err(|e| e.to_string()),
                serde_json::from_str::<HashMap<String, TypedNode3D>>(&text).map(|_| ()).map_err(|e| e.to_string()),
            )
        } else {
            (
                serde_json::from_str::<Vec<SolverLoad3D>>(&text).map(|_| ()).map_err(|e| e.to_string()),
                serde_json::from_str::<Vec<TypedLoad3D>>(&text).map(|_| ()).map_err(|e| e.to_string()),
            )
        };
        assert_eq!(typed, legacy, "3D {what}");
        compared += legacy.is_err() as usize;
        let text = bad.to_string();
        let (legacy, typed) = if field == "nodes" {
            (
                serde_json::from_str::<HashMap<String, SolverNode>>(&text).map(|_| ()).map_err(|e| e.to_string()),
                serde_json::from_str::<HashMap<String, TypedNode>>(&text).map(|_| ()).map_err(|e| e.to_string()),
            )
        } else {
            (
                serde_json::from_str::<Vec<SolverLoad>>(&text).map(|_| ()).map_err(|e| e.to_string()),
                serde_json::from_str::<Vec<TypedLoad>>(&text).map(|_| ()).map_err(|e| e.to_string()),
            )
        };
        assert_eq!(typed, legacy, "2D records {what}");
    }
    assert!(compared >= 20, "only {compared} malformed inputs were rejected");
}

#[test]
fn units_an_inferred_3d_parse_goes_through_the_typed_records() {
    fn parse<T: serde::de::DeserializeOwned>(text: &str) -> Result<T, String> {
        serde_json::from_str(text).map_err(|e| e.to_string())
    }
    let text = every_3d_field().to_string();
    let inferred: SolverInput3D = parse(&text).unwrap();
    let typed = parse::<ElasticInput3D>(&text).unwrap().into_legacy();
    assert_eq!(
        without_timings(serde_json::to_value(solve_3d(&inferred).unwrap()).unwrap()),
        without_timings(serde_json::to_value(solve_3d(&typed).unwrap()).unwrap())
    );
    let mut bad = every_3d_field();
    bad["loads"][2]["data"]["a"] = json!("1.1");
    let text = bad.to_string();
    assert_eq!(parse::<SolverInput3D>(&text).unwrap_err(), parse::<ElasticInput3D>(&text).unwrap_err());
    assert_eq!(parse::<SolverInput3D>(&text).unwrap_err(), legacy::parse(&text).unwrap_err());
}

#[test]
fn units_malformed_property_records_name_the_legacy_struct() {
    use dedaliano_engine::types::units::{ElasticMaterial, ElasticSection2D, ElasticSection3D};
    use dedaliano_engine::types::{SolverMaterial, SolverSection, SolverSection3D};
    fn err<T: serde::de::DeserializeOwned>(text: &str) -> String {
        serde_json::from_str::<T>(text).map(|_| ()).unwrap_err().to_string()
    }
    for text in [r#""steel""#, "7", "[1, 2]"] {
        assert_eq!(err::<ElasticMaterial>(text), err::<SolverMaterial>(text), "{text}");
        assert_eq!(err::<ElasticSection2D>(text), err::<SolverSection>(text), "{text}");
        assert_eq!(err::<ElasticSection3D>(text), err::<SolverSection3D>(text), "{text}");
        assert_eq!(err::<TypedNode>(text), err::<SolverNode>(text), "{text}");
        assert_eq!(err::<TypedLoad>(text), err::<SolverLoad>(text), "{text}");
        assert_eq!(err::<TypedLoad3D>(text), err::<SolverLoad3D>(text), "{text}");
    }
    let mut model = every_2d_field();
    model["materials"]["1"] = json!("steel");
    let text = model.to_string();
    assert_eq!(err::<ElasticInput2D>(&text), err::<SolverInput>(&text));
}
