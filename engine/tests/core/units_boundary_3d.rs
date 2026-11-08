use dedaliano_engine::solver::linear::solve_3d;
use dedaliano_engine::solver::load_cases::MultiCaseInput3D;
use dedaliano_engine::types::units::ElasticInput3D;
use dedaliano_engine::types::{ModalInput3D, SolverInput3D};
use serde_json::{json, Value};

fn fixtures() -> Vec<(String, String)> {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");
    let mut out: Vec<(String, String)> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let name = p.file_name().unwrap().to_string_lossy();
            name.contains("3d") && name.ends_with("input.json")
        })
        .map(|p| (p.display().to_string(), std::fs::read_to_string(&p).unwrap()))
        .collect();
    out.sort();
    out
}

fn every_section_field() -> Value {
    json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.14159, "y": 0.1, "z": -0.2}},
        "materials": {"1": {"id": 1, "e": 27123.456789, "nu": 0.271}},
        "sections": {
            "1": {"id": 1, "name": "C", "a": 0.0137, "iy": 0.000173, "iz": 0.0001234567, "j": 1.7e-6,
                  "cw": 3.3e-9, "asY": 0.006127, "asZ": 0.0041, "shearCenterY": -0.0213, "shearCenterZ": 1e-17},
            "2": {"id": 2, "a": 0.01, "iy": 1e-4, "iz": 2e-4, "j": 0.0, "asY": null, "shearCenterY": -0.0}
        },
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}
        },
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 1.0, "fy": -10.0, "fz": 2.5, "mx": 0.3, "my": 0.0, "mz": 0.0}}]
    })
}

fn section_bits(input: &SolverInput3D) -> Vec<(String, Vec<Option<u64>>)> {
    let mut out: Vec<_> = input
        .sections
        .iter()
        .map(|(k, s)| {
            let b = |v: Option<f64>| v.map(f64::to_bits);
            (
                k.clone(),
                vec![
                    b(Some(s.a)), b(Some(s.iy)), b(Some(s.iz)), b(Some(s.j)), b(s.cw),
                    b(s.as_y), b(s.as_z), b(s.shear_center_y), b(s.shear_center_z),
                ],
            )
        })
        .collect();
    out.sort();
    out
}

fn material_bits(input: &SolverInput3D) -> Vec<(String, u64, u64)> {
    let mut out: Vec<_> = input.materials.iter().map(|(k, m)| (k.clone(), m.e.to_bits(), m.nu.to_bits())).collect();
    out.sort();
    out
}

fn assert_same_input(typed: &SolverInput3D, legacy: &SolverInput3D, what: &str) {
    assert_eq!(serde_json::to_value(typed).unwrap(), serde_json::to_value(legacy).unwrap(), "{what}");
    assert_eq!(section_bits(typed), section_bits(legacy), "{what}");
    assert_eq!(material_bits(typed), material_bits(legacy), "{what}");
    for (k, s) in &legacy.sections {
        assert_eq!(typed.sections[k].name, s.name, "{what}");
    }
}

#[test]
fn units_3d_boundary_preserves_every_fixture_bit_for_bit() {
    let mut parsed = 0;
    for (path, text) in fixtures() {
        let legacy = serde_json::from_str::<SolverInput3D>(&text);
        let typed = serde_json::from_str::<ElasticInput3D>(&text);
        match (legacy, typed) {
            (Ok(legacy), Ok(typed)) => {
                assert_same_input(&typed.into_legacy(), &legacy, &path);
                parsed += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l.to_string(), t.to_string(), "{path}"),
            (l, t) => panic!("{path}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(parsed >= 10, "only {parsed} 3D fixtures parsed");
}

#[test]
fn units_3d_boundary_keeps_optional_fields_and_signed_zeros() {
    let value = every_section_field();
    let legacy: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
    let typed = serde_json::from_value::<ElasticInput3D>(value).unwrap().into_legacy();
    assert_same_input(&typed, &legacy, "every section field");
    assert_eq!(typed.sections["2"].as_y, None);
    assert_eq!(typed.sections["2"].as_z, None);
    assert_eq!(typed.sections["2"].cw, None);
    assert_eq!(typed.sections["2"].name, None);
    assert_eq!(typed.sections["2"].shear_center_y.map(f64::to_bits), Some((-0.0f64).to_bits()));
    assert_eq!(typed.sections["1"].cw.map(f64::to_bits), Some(3.3e-9f64.to_bits()));
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

#[test]
fn units_3d_boundary_results_are_bit_identical() {
    let mut inputs: Vec<(String, String)> = fixtures();
    inputs.push(("every section field".into(), every_section_field().to_string()));
    let mut solved = 0;
    for (what, text) in inputs {
        let Ok(legacy) = serde_json::from_str::<SolverInput3D>(&text) else { continue };
        let typed = serde_json::from_str::<ElasticInput3D>(&text).unwrap().into_legacy();
        match (solve_3d(&legacy), solve_3d(&typed)) {
            (Ok(l), Ok(t)) => {
                let (l, t) = (without_timings(serde_json::to_value(&l).unwrap()), without_timings(serde_json::to_value(&t).unwrap()));
                assert_eq!(l, t, "{what}");
                solved += 1;
            }
            (Err(l), Err(t)) => assert_eq!(l, t, "{what}"),
            (l, t) => panic!("{what}: legacy ok {} typed ok {}", l.is_ok(), t.is_ok()),
        }
    }
    assert!(solved >= 10, "only {solved} 3D fixtures solved");
}

#[test]
fn units_3d_wrappers_route_through_the_typed_boundary() {
    let model = every_section_field();
    let multi = json!({"solver": model, "loadCases": [], "combinations": []});
    let wrapped: MultiCaseInput3D = serde_json::from_value(multi).unwrap();
    let legacy: SolverInput3D = serde_json::from_value(model.clone()).unwrap();
    assert_same_input(&wrapped.solver, &legacy, "multi-case wrapper");
    let modal = json!({"solver": model, "densities": {"1": 7850.0}});
    let wrapped: ModalInput3D = serde_json::from_value(modal).unwrap();
    assert_same_input(&wrapped.solver, &legacy, "modal wrapper");
}

#[test]
fn units_3d_boundary_rejects_malformed_sections_with_the_same_message() {
    let cases: [(&str, Value); 5] = [
        ("missing j", json!({"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4})),
        ("string iy", json!({"id": 1, "a": 0.01, "iy": "1e-4", "iz": 1e-4, "j": 1e-5})),
        ("string cw", json!({"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-5, "cw": "x"})),
        ("bool shear centre", json!({"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-5, "shearCenterY": true})),
        ("string e", json!({"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 1e-5})),
    ];
    for (what, section) in cases {
        let mut model = every_section_field();
        model["sections"]["1"] = section;
        if what == "string e" {
            model["materials"]["1"]["e"] = json!("200000");
        }
        let legacy = serde_json::from_value::<SolverInput3D>(model.clone()).unwrap_err().to_string();
        let typed = serde_json::from_value::<ElasticInput3D>(model).unwrap_err().to_string();
        assert_eq!(typed, legacy, "{what}");
    }
}

#[test]
fn units_3d_every_deserialized_model_goes_through_the_typed_boundary() {
    fn rust_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                rust_files(&path, out);
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path);
            }
        }
    }
    let mut files = Vec::new();
    rust_files(std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/src")), &mut files);
    let mut wrappers = 0;
    let mut unrouted = Vec::new();
    for path in files {
        let text = std::fs::read_to_string(&path).unwrap();
        let production_lines = text.split("#[cfg(test)]\nmod ").next().unwrap().lines().count();
        let lines: Vec<&str> = text.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let t = line.trim();
            let field = t.starts_with("pub solver: SolverInput3D") || t.starts_with("solver: types::SolverInput3D");
            if field {
                if lines[i - 1].contains("deserialize_input_3d") {
                    wrappers += 1;
                } else {
                    unrouted.push(format!("{}:{}", path.display(), i + 1));
                }
            }
            let raw_parse = (t.contains(": SolverInput3D =") || t.contains(": types::SolverInput3D ="))
                && (t.contains("from_js_value") || t.contains("serde_json::from_"));
            if raw_parse && i < production_lines {
                unrouted.push(format!("{}:{}", path.display(), i + 1));
            }
        }
    }
    assert!(unrouted.is_empty(), "3D models parsed without the typed boundary: {unrouted:?}");
    assert_eq!(wrappers, 18, "routed wrapper fields");
}
