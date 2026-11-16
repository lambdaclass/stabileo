use dedaliano_engine::{
    certify::modal::{self as certified, ModalCertificate},
    solver::modal,
    types::*,
};
use serde_json::{json, Value};
use std::collections::HashMap;

fn assert_same_bits(actual: &Value, expected: &Value) {
    match (actual, expected) {
        (Value::Number(a), Value::Number(b)) => {
            assert_eq!(a.as_f64().unwrap().to_bits(), b.as_f64().unwrap().to_bits())
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len());
            for (a, b) in a.iter().zip(b) {
                assert_same_bits(a, b);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            assert_eq!(a.len(), b.len());
            for (key, value) in a {
                assert_same_bits(value, &b[key]);
            }
        }
        (a, b) => assert_eq!(a, b),
    }
}

fn export_case(case: Value) {
    if let Ok(path) = std::env::var("MODAL_MASS_RANGE_CASES") {
        use std::io::Write;
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _lock = LOCK.lock().unwrap();
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(file, "{case}").unwrap();
    }
}

fn family(spatial: bool, copies: usize, constrained: bool, padding: usize, split: f64) -> Value {
    let mut nodes = serde_json::Map::new();
    let mut supports = serde_json::Map::new();
    let mut masses = vec![];
    let mut constraints = vec![];
    for id in 1..=copies * 2 + padding {
        nodes.insert(
            id.to_string(),
            if spatial {
                json!({"id":id,"x":id as f64,"y":0.0,"z":0.0})
            } else {
                json!({"id":id,"x":id as f64,"z":0.0})
            },
        );
        let k = if id > 2 && id <= copies * 2 {
            1.0 + split
        } else {
            1.0
        };
        let support = if spatial {
            json!({"nodeId":id,"rx":false,"ry":false,"rz":false,"rrx":false,"rry":false,"rrz":false,"kx":k,"ky":k,"kz":k,"krx":k,"kry":k,"krz":k})
        } else {
            json!({"id":id,"nodeId":id,"type":"spring","kx":k,"ky":k,"kz":k})
        };
        supports.insert(id.to_string(), support);
    }
    for copy in 0..copies {
        let source = 2 * copy + 1;
        let target = source + 1;
        masses.push(json!({"nodeId":source,"massX":1.0}));
        if constrained {
            let mut terms = vec![
                json!({"nodeId":source,"dof":0,"coefficient":1.0}),
                json!({"nodeId":target,"dof":0,"coefficient":-0.3}),
                json!({"nodeId":target,"dof":1,"coefficient":-0.7}),
            ];
            if spatial {
                terms.push(json!({"nodeId":target,"dof":2,"coefficient":-0.9}));
            }
            constraints.push(json!({"type":"linearMPC","terms":terms}));
        }
    }
    json!({"nodes":nodes,"supports":supports,"materials":{},"sections":{},"elements":{},"loads":[],"constraints":constraints,"masses":{"nodal":masses}})
}

fn check_certificate(c: &ModalCertificate, expected: &[f64]) {
    let ModalCertificate::Certified {
        modes,
        complete_modes,
        ..
    } = c
    else {
        panic!("{c:?}")
    };
    assert_eq!(modes.len(), expected.len());
    assert_eq!(
        *complete_modes,
        expected.len(),
        "expected {expected:?}: {c:?}"
    );
    for (mode, value) in modes.iter().zip(expected) {
        assert!(
            mode.omega2_lower <= *value && *value <= mode.omega2_upper,
            "{mode:?} excludes {value}"
        );
    }
}

fn check(spatial: bool, value: Value, expected: &[f64]) {
    let densities = HashMap::new();
    let (raw, cert, certificate) = if spatial {
        let input: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
        let typed: dedaliano_engine::types::units::ElasticInput3D =
            serde_json::from_value(value.clone()).unwrap();
        let wrapped: ModalInput3D =
            serde_json::from_value(json!({"solver":value,"densities":{}})).unwrap();
        assert_eq!(
            serde_json::to_value(&input).unwrap(),
            serde_json::to_value(typed.into_legacy()).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&input).unwrap(),
            serde_json::to_value(&wrapped.solver).unwrap()
        );
        let raw = modal::solve_modal_3d(&input, &densities, expected.len() + 3).unwrap();
        let cert = certified::certify_modal_3d(&input, &densities, expected.len() + 3).unwrap();
        (
            raw.modes
                .iter()
                .map(|m| m.omega.powi(2))
                .collect::<Vec<_>>(),
            cert.results
                .modes
                .iter()
                .map(|m| m.omega.powi(2))
                .collect::<Vec<_>>(),
            cert.certificate,
        )
    } else {
        let input: SolverInput = serde_json::from_value(value.clone()).unwrap();
        let raw = modal::solve_modal_2d(&input, &densities, expected.len() + 3).unwrap();
        let cert = certified::certify_modal_2d(&input, &densities, expected.len() + 3).unwrap();
        (
            raw.modes
                .iter()
                .map(|m| m.omega.powi(2))
                .collect::<Vec<_>>(),
            cert.results
                .modes
                .iter()
                .map(|m| m.omega.powi(2))
                .collect::<Vec<_>>(),
            cert.certificate,
        )
    };
    assert_eq!(raw.len(), expected.len());
    assert_eq!(raw, cert);
    for (got, want) in raw.iter().zip(expected) {
        assert!((got - want).abs() <= 1e-12 * want.abs(), "{got} != {want}");
    }
    check_certificate(&certificate, expected);
    let input = serde_json::to_string(&json!({"solver":value,"densities":densities})).unwrap();
    let (json_raw, json_cert) = if spatial {
        (
            dedaliano_engine::solve_modal_3d(&input, expected.len() + 3).unwrap(),
            dedaliano_engine::certify_modal_3d(&input, expected.len() + 3).unwrap(),
        )
    } else {
        (
            dedaliano_engine::solve_modal_2d(&input, expected.len() + 3).unwrap(),
            dedaliano_engine::certify_modal_2d(&input, expected.len() + 3).unwrap(),
        )
    };
    let json_raw: Value = serde_json::from_str(&json_raw).unwrap();
    let json_cert: Value = serde_json::from_str(&json_cert).unwrap();
    assert_same_bits(&json_raw, &json_cert["results"]);
    let json_values: Vec<_> = json_raw["modes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["omega"].as_f64().unwrap().powi(2))
        .collect();
    assert_eq!(raw, json_values);
    for count in [1, expected.len()] {
        let partial = if spatial {
            dedaliano_engine::certify_modal_3d(&input, count).unwrap()
        } else {
            dedaliano_engine::certify_modal_2d(&input, count).unwrap()
        };
        let partial: Value = serde_json::from_str(&partial).unwrap();
        let modes = partial["results"]["modes"].as_array().unwrap();
        assert_eq!(modes.len(), count);
        let bounds = partial["certificate"]["modes"].as_array().unwrap();
        assert_eq!(bounds.len(), count);
        for (i, mode) in modes.iter().enumerate() {
            assert!(
                (mode["omega"].as_f64().unwrap().powi(2) - expected[i]).abs()
                    <= 1e-12 * expected[i].abs()
            );
            assert!(bounds[i]["omega2Lower"].as_f64().unwrap() <= expected[i]);
            assert!(expected[i] <= bounds[i]["omega2Upper"].as_f64().unwrap());
        }
    }
    export_case(
        json!({"spatial":spatial,"input":{"solver":value,"densities":densities},"expected":expected}),
    );
}

#[test]
fn issue_1965_rank_one_and_two_constrained_modal_entry_points() {
    for case in
        serde_json::from_str::<Vec<Value>>(include_str!("../fixtures/modal-full-rank-main.json"))
            .unwrap()
    {
        let expected = case["expected"].clone();
        let actual = if case["dim"] == "2d" {
            let input: ModalInput = serde_json::from_value(case["input"].clone()).unwrap();
            serde_json::to_value(modal::solve_modal_2d(&input.solver, &input.densities, 6).unwrap())
                .unwrap()
        } else {
            let input: ModalInput3D = serde_json::from_value(case["input"].clone()).unwrap();
            serde_json::to_value(modal::solve_modal_3d(&input.solver, &input.densities, 6).unwrap())
                .unwrap()
        };
        assert_same_bits(&actual, &expected);
    }
    for spatial in [false, true] {
        let lambda = 1.0
            + 1.0
                / (0.3_f64.powi(2) + 0.7_f64.powi(2) + if spatial { 0.9_f64.powi(2) } else { 0.0 });
        let mut full = family(spatial, 1, false, 0, 0.0);
        full["masses"]["nodal"] = json!([{"nodeId":1,"mass":1.0},{"nodeId":2,"mass":1.0}]);
        check(spatial, full, &vec![1.0; if spatial { 6 } else { 4 }]);
        if spatial {
            for normal in [[1.0, 0.0, 0.0], [0.3, 0.4, 0.5], [0.7, -0.2, 0.6]] {
                let mut value = family(true, 1, true, 0, 0.0);
                for (key, v) in [
                    ("normalX", normal[0]),
                    ("normalY", normal[1]),
                    ("normalZ", normal[2]),
                ] {
                    value["supports"]["2"][key] = json!(v);
                }
                value["supports"]["2"]["isInclined"] = json!(true);
                let norm2: f64 = normal.iter().map(|v| v * v).sum();
                let dot = 0.3 * normal[0] + 0.7 * normal[1] + 0.9 * normal[2];
                let h2 = 0.3_f64.powi(2) + 0.7_f64.powi(2) + 0.9_f64.powi(2) - dot * dot / norm2;
                check(true, value, &[1.0 + 1.0 / h2]);
            }
        } else {
            for angle in [0.0_f64, 0.3, 1.2, std::f64::consts::FRAC_PI_2, 3.7] {
                let mut value = family(false, 1, true, 0, 0.0);
                value["supports"]["2"]["type"] = json!("inclinedRoller");
                value["supports"]["2"]["angle"] = json!(angle);
                let h = -0.3 * angle.cos() + 0.7 * angle.sin();
                check(false, value, &[1.0 + 1.0 / (h * h)]);
            }
        }
        if spatial {
            for normal in [[0.0, 1.0, 0.0], [0.3, 0.4, 0.5], [1.0, 1e-3, 0.0]] {
                let mut value = family(true, 1, false, 0, 0.0);
                for (key, v) in [
                    ("normalX", normal[0]),
                    ("normalY", normal[1]),
                    ("normalZ", normal[2]),
                ] {
                    value["supports"]["1"][key] = json!(v);
                }
                value["supports"]["1"]["isInclined"] = json!(true);
                let norm2: f64 = normal.iter().map(|v| v * v).sum();
                let transverse = (normal[1] * normal[1] + normal[2] * normal[2]) / norm2;
                check(true, value, &[1.0 / transverse]);
            }
            let mut value = family(true, 1, false, 0, 0.0);
            value["supports"]["1"]["isInclined"] = json!(true);
            value["supports"]["1"]["normalX"] = json!(1.0);
            value["supports"]["1"]["normalY"] = json!(0.0);
            value["supports"]["1"]["normalZ"] = json!(0.0);
            let input: SolverInput3D = serde_json::from_value(value).unwrap();
            assert!(modal::solve_modal_3d(&input, &HashMap::new(), 3)
                .unwrap_err()
                .contains("physical_mass_range"));
            assert!(certified::certify_modal_3d(&input, &HashMap::new(), 3)
                .unwrap_err()
                .contains("physical_mass_range"));
        } else {
            for angle in [0.0_f64, 0.3, 1.2, 3.7] {
                let mut value = family(false, 1, false, 0, 0.0);
                value["supports"]["1"]["type"] = json!("inclinedRoller");
                value["supports"]["1"]["angle"] = json!(angle);
                check(false, value, &[1.0 / angle.cos().powi(2)]);
            }
        }
        for tiny in [0.0, 1e-10_f64.next_down(), 1e-10, 1e-10_f64.next_up()] {
            let mut value = family(spatial, 2, true, 0, 0.0);
            value["masses"]["nodal"][1]["massX"] = json!(tiny);
            if tiny > 0.0 {
                for node in ["3", "4"] {
                    for field in if spatial {
                        vec!["kx", "ky", "kz", "krx", "kry", "krz"]
                    } else {
                        vec!["kx", "ky", "kz"]
                    } {
                        value["supports"][node][field] = json!(tiny);
                    }
                }
            }
            let expected = if tiny == 0.0 {
                vec![lambda]
            } else {
                vec![lambda, lambda]
            };
            check(spatial, value, &expected);
        }
        for copies in [1, 2] {
            for split in [0.0, 1e-7, 1.0] {
                let expected: Vec<_> = (0..copies)
                    .map(|i| lambda * if i == 0 { 1.0 } else { 1.0 + split })
                    .collect();
                check(spatial, family(spatial, copies, true, 0, split), &expected);
                let control: Vec<_> = (0..copies)
                    .map(|i| if i == 0 { 1.0 } else { 1.0 + split })
                    .collect();
                check(spatial, family(spatial, copies, false, 0, split), &control);
            }
        }
    }
}

#[test]
fn issue_1965_sparse_modal_preserves_physical_rank() {
    for spatial in [false, true] {
        let lambda = 1.0
            + 1.0
                / (0.3_f64.powi(2) + 0.7_f64.powi(2) + if spatial { 0.9_f64.powi(2) } else { 0.0 });
        for copies in [80, 81] {
            let base = 1.0 + 1.0 / (0.3_f64.powi(2) + 0.7_f64.powi(2));
            let expected: Vec<_> = (0..copies)
                .map(|i| base * if i == 0 { 1.0 } else { 1.001 })
                .collect();
            let mut value = family(spatial, copies, true, 0, 0.001);
            for copy in 0..copies {
                let source = (2 * copy + 1).to_string();
                let target = (2 * copy + 2).to_string();
                if spatial {
                    for field in ["ry", "rz"] {
                        value["supports"][&source][field] = json!(true);
                    }
                    for field in ["ky", "kz"] {
                        value["supports"][&source]
                            .as_object_mut()
                            .unwrap()
                            .remove(field);
                    }
                    value["supports"][&target]["rz"] = json!(true);
                    value["supports"][&target]
                        .as_object_mut()
                        .unwrap()
                        .remove("kz");
                } else {
                    value["supports"][&source]["type"] = json!("inclinedRoller");
                    value["supports"][&source]["angle"] = json!(0.0);
                }
            }
            check(spatial, value, &expected);
        }
        for copies in [1, 2] {
            for padding in [18, 19, 20, 25, 26, 27, 28, 29, 30, 31, 64, 65, 66] {
                check(
                    spatial,
                    family(spatial, copies, true, padding, 1e-7),
                    &[lambda, lambda * (1.0 + 1e-7)][..copies],
                );
            }
        }
    }
}

#[test]
fn issue_1965_3d_units_boundary_preserves_finite_modes() {
    use dedaliano_engine::metamorphic::units::{scale_3d, Units};
    let base: SolverInput3D = serde_json::from_value(family(true, 2, true, 0, 1e-7)).unwrap();
    let lambda = 1.0 + 1.0 / (0.3_f64.powi(2) + 0.7_f64.powi(2) + 0.9_f64.powi(2));
    for length in [
        1e-3_f64.next_down(),
        1e-3,
        1e-3_f64.next_up(),
        1.0,
        1e3_f64.next_down(),
        1e3,
        1e3_f64.next_up(),
    ] {
        let units = Units {
            length,
            force: 1.0,
            time: 1.0,
        };
        let mut scaled = scale_3d(&base, &units);
        for mass in &mut scaled.masses.nodal {
            mass.mass_x = mass
                .mass_x
                .map(|m| m * units.force * units.time.powi(2) / units.length);
        }
        check(
            true,
            serde_json::to_value(scaled).unwrap(),
            &[lambda, lambda * (1.0 + 1e-7)],
        );
    }
}

#[test]
fn issue_2007_massless_mechanism_refuses_with_positive_physical_mass() {
    for spatial in [false, true] {
        for constrained in [false, true] {
            for padding in [1, 65] {
                for stiffness in [-1.0, 0.0, 1e-10, 1.0] {
                    let mut value = family(spatial, 1, constrained, padding, 0.0);
                    value["supports"]["3"]["kx"] = json!(stiffness);
                    if stiffness > 0.0 {
                        let lambda = if constrained {
                            1.0 + 1.0
                                / (0.3_f64.powi(2)
                                    + 0.7_f64.powi(2)
                                    + if spatial { 0.9_f64.powi(2) } else { 0.0 })
                        } else {
                            1.0
                        };
                        check(spatial, value, &[lambda]);
                        continue;
                    }
                    assert_eq!(value["masses"]["nodal"][0]["massX"], json!(1.0));
                    let errors = if spatial {
                        let input: SolverInput3D = serde_json::from_value(value.clone()).unwrap();
                        vec![
                            modal::solve_modal_3d(&input, &HashMap::new(), 3).unwrap_err(),
                            certified::certify_modal_3d(&input, &HashMap::new(), 3).unwrap_err(),
                        ]
                    } else {
                        let input: SolverInput = serde_json::from_value(value.clone()).unwrap();
                        vec![
                            modal::solve_modal_2d(&input, &HashMap::new(), 3).unwrap_err(),
                            certified::certify_modal_2d(&input, &HashMap::new(), 3).unwrap_err(),
                        ]
                    };
                    let wrapped = json!({"solver":value,"densities":{}});
                    for error in errors {
                        assert!(error.contains("Eigenvalue decomposition failed"), "{error}");
                    }
                    export_case(json!({"spatial":spatial,"input":wrapped,"refusal":true}));
                }
            }
        }
    }
}
