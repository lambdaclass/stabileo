use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::{json, Value};

#[test]
fn issue_2220_generated_pressure_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_member_2220.json")).unwrap();
    let cases: Vec<_> = fixtures
        .as_array()
        .unwrap()
        .iter()
        .filter(|case| {
            let kind = case["kind"].as_str().unwrap();
            !kind.starts_with("cubicGrid:") && !kind.starts_with("towerMast:")
        })
        .collect();
    assert_eq!(cases.len(), 196);
    check_pressure_cases(cases);
}

#[test]
#[ignore = "known wrong result: #2529"]
fn issue_2220_cubic_grid_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_member_2220.json")).unwrap();
    let cases: Vec<_> = fixtures
        .as_array()
        .unwrap()
        .iter()
        .filter(|case| case["kind"].as_str().unwrap().starts_with("cubicGrid:"))
        .collect();
    assert_eq!(cases.len(), 32);
    check_pressure_cases(cases);
}

#[test]
fn issue_2220_tower_mast_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_member_2220.json")).unwrap();
    let cases: Vec<_> = fixtures
        .as_array()
        .unwrap()
        .iter()
        .filter(|case| case["kind"].as_str().unwrap().starts_with("towerMast:"))
        .collect();
    assert_eq!(cases.len(), 36);
    check_pressure_cases(cases);
}

#[test]
#[ignore = "known wrong result: #2529"]
fn issue_2220_apex_pressure_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_apex_2220.json")).unwrap();
    let cases: Vec<_> = fixtures.as_array().unwrap().iter().collect();
    assert_eq!(cases.len(), 48);
    check_pressure_cases(cases);
}

#[test]
fn issue_2220_endpoint_torque_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_endpoint_2220.json")).unwrap();
    let cases: Vec<_> = fixtures.as_array().unwrap().iter().collect();
    assert_eq!(cases.len(), 464);
    check_pressure_cases(cases);
}

#[test]
fn issue_2220_unloaded_band_retains_supported_native_member_loading() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_band_2220.json")).unwrap();
    let cases: Vec<_> = fixtures.as_array().unwrap().iter().collect();
    assert_eq!(cases.len(), 160);
    check_pressure_cases(cases);
}

fn check_pressure_cases(cases: Vec<&Value>) {
    let mut apex_results = std::collections::HashMap::<String, Value>::new();
    for case in cases {
        let integral = |station: f64, power: i32| -> f64 {
            if let Some(density) = case["heightDensity"].as_object() {
                let from = density["from"].as_f64().unwrap();
                let scale = density["scale"].as_f64().unwrap();
                let exponent = density["exponent"].as_f64().unwrap();
                let factor = density["factor"].as_f64().unwrap();
                let a = from + station * scale;
                let b = from + case["length"].as_f64().unwrap() * scale;
                let mut result = 0.0;
                let mut binomial = 1.0;
                for k in 0..=power {
                    let n = exponent + f64::from(k) + 1.0;
                    let moment = ((b.powf(n + 1.0) - a.powf(n + 1.0)) / (n + 1.0)
                        - 6.0 * (b.powf(n) - a.powf(n)) / n)
                        * factor
                        / 4.0;
                    result += binomial * (-from).powi(power - k) * moment / scale.powi(power);
                    binomial *= f64::from(power - k) / f64::from(k + 1);
                }
                return result;
            }
            if let Some(coefficients) = case["polynomial"].as_array() {
                let length = case["length"].as_f64().unwrap();
                return coefficients
                    .iter()
                    .enumerate()
                    .map(|(k, c)| {
                        let exponent = k as i32 + power + 1;
                        c.as_f64().unwrap() * (length.powi(exponent) - station.powi(exponent))
                            / f64::from(exponent)
                    })
                    .sum();
            }
            case["segments"]
                .as_array()
                .unwrap()
                .iter()
                .map(|part| {
                    let a = station.max(part["a"].as_f64().unwrap());
                    let b = part["b"].as_f64().unwrap();
                    if b <= a {
                        return 0.0;
                    }
                    let q = part["q"].as_f64().unwrap();
                    let start = part["a"].as_f64().unwrap();
                    let gradient = (part["qJ"].as_f64().unwrap_or(q) - q)
                        / (part["b"].as_f64().unwrap() - start);
                    (q - gradient * start) * (b.powi(power + 1) - a.powi(power + 1))
                        / f64::from(power + 1)
                        + gradient * (b.powi(power + 2) - a.powi(power + 2)) / f64::from(power + 2)
                })
                .sum()
        };
        let tip = case["tip"].as_u64().unwrap();
        let mut input = case["input"].clone();
        if case["dimension"] == 2 {
            crate::common::use_planar_fixture_sections(&mut input);
        }
        if let Some(loads) = case["memberLoads"].as_array() {
            input["loads"] = loads.iter().map(|p| {
                let data = if case["dimension"] == 2 {
                    json!({"elementId": p[0], "a": p[1], "b": p[2], "qI": p[3], "qJ": p[4]})
                } else {
                    json!({"elementId": p[0], "a": p[1], "b": p[2], "qYI": p[3], "qYJ": p[4], "qZI": 0, "qZJ": 0})
                };
                json!({"type": "distributed", "data": data})
            }).collect();
        }
        for nonlinear in [false, true] {
            let run = || {
                if case["dimension"] == 2 {
                    let model: SolverInput = serde_json::from_value(input.clone()).unwrap();
                    serde_json::to_value(if nonlinear {
                        pdelta::solve_pdelta_2d(&model, 50, 1e-8).unwrap().results
                    } else {
                        linear::solve_2d(&model).unwrap()
                    })
                    .unwrap()
                } else {
                    let model: SolverInput3D = serde_json::from_value(input.clone()).unwrap();
                    serde_json::to_value(if nonlinear {
                        pdelta::solve_pdelta_3d(&model, 50, 1e-8).unwrap().results
                    } else {
                        linear::solve_3d(&model).unwrap()
                    })
                    .unwrap()
                }
            };
            let result = if case["heightDensity"].is_object() {
                let key = format!("{}:{}:{}", case["dimension"], nonlinear, input);
                if let Some(result) = apex_results.get(&key) {
                    result.clone()
                } else {
                    let result = run();
                    apex_results.insert(key, result.clone());
                    result
                }
            } else {
                run()
            };
            let displacement = result["displacements"]
                .as_array()
                .unwrap()
                .iter()
                .find(|d| d["nodeId"].as_u64() == Some(tip))
                .unwrap();
            let length = case["length"].as_f64().unwrap();
            let expected = case["tipScale"].as_f64().unwrap_or(1.0)
                * (3.0 * length * integral(0.0, 2) - integral(0.0, 3))
                / (6.0 * 200000.0 * 1000.0 * 1e-4);
            assert!(
                (displacement[case["displacement"].as_str().unwrap()]
                    .as_f64()
                    .unwrap()
                    - expected)
                    .abs()
                    < 5e-9
            );
            let tip_coordinate =
                &case["input"]["nodes"][tip.to_string()][case["axis"].as_str().unwrap()];
            for (id, node) in case["input"]["nodes"].as_object().unwrap() {
                if &node[case["axis"].as_str().unwrap()] == tip_coordinate {
                    let id: u64 = id.parse().unwrap();
                    assert_eq!(
                        result["displacements"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .filter(|d| d["nodeId"].as_u64() == Some(id))
                            .count(),
                        1
                    );
                }
            }
            for displacement in result["displacements"].as_array().unwrap() {
                let node = displacement["nodeId"].as_u64().unwrap();
                if &case["input"]["nodes"][node.to_string()][case["axis"].as_str().unwrap()]
                    != tip_coordinate
                {
                    continue;
                }
                let element = case["input"]["elements"]
                    .as_object()
                    .unwrap()
                    .iter()
                    .find(|(_, element)| element["nodeJ"].as_u64() == Some(node))
                    .unwrap()
                    .0;
                let scale = case["scales"][element].as_f64().unwrap_or(1.0);
                let expected = scale * (3.0 * length * integral(0.0, 2) - integral(0.0, 3))
                    / (6.0 * 200000.0 * 1000.0 * 1e-4);
                assert!(
                    (displacement[case["displacement"].as_str().unwrap()]
                        .as_f64()
                        .unwrap()
                        - expected)
                        .abs()
                        < 5e-9
                );
            }
            let mut expected_ids: Vec<u64> = case["input"]["elements"]
                .as_object()
                .unwrap()
                .keys()
                .map(|id| id.parse().unwrap())
                .collect();
            let mut actual_ids: Vec<u64> = result["elementForces"]
                .as_array()
                .unwrap()
                .iter()
                .map(|f| f["elementId"].as_u64().unwrap())
                .collect();
            expected_ids.sort_unstable();
            actual_ids.sort_unstable();
            assert_eq!(actual_ids, expected_ids);
            for force in result["elementForces"].as_array().unwrap() {
                let id = force["elementId"].as_u64().unwrap().to_string();
                let scale = case["scales"][&id].as_f64().unwrap_or(1.0);
                let node = case["input"]["elements"][&id]["nodeI"]
                    .as_u64()
                    .unwrap()
                    .to_string();
                let station = case["input"]["nodes"][&node][case["axis"].as_str().unwrap()]
                    .as_f64()
                    .unwrap()
                    * case["coordinateScale"].as_f64().unwrap_or(1.0);
                let (shear, moment, torsion) = if case["dimension"] == 2 {
                    ("vStart", "mStart", None)
                } else if case["axis"] == "z" {
                    ("vyStart", "mzStart", Some("mxStart"))
                } else {
                    ("vzStart", "myStart", Some("mxStart"))
                };
                let shear_sign = if case["dimension"] == 2 && case["axis"] == "z" {
                    1.0
                } else {
                    -1.0
                };
                let moment_sign = if (case["dimension"] == 2) == (case["axis"] == "z") {
                    1.0
                } else {
                    -1.0
                };
                assert!(
                    (force[shear].as_f64().unwrap() - scale * shear_sign * integral(station, 0))
                        .abs()
                        < 5e-9
                );
                assert!(
                    (force[moment].as_f64().unwrap()
                        - scale
                            * moment_sign
                            * (integral(station, 1) - station * integral(station, 0)))
                    .abs()
                        < 5e-9
                );
                if let Some(key) = torsion {
                    assert!(force[key].as_f64().unwrap().abs() < 5e-11);
                }
                for t in [0.2, 0.5, 0.8] {
                    let at = station + t * force["length"].as_f64().unwrap();
                    let expected_shear = scale * shear_sign * integral(at, 0);
                    let expected_moment =
                        scale * moment_sign * (integral(at, 1) - at * integral(at, 0));
                    let (actual_shear, actual_moment) = if case["dimension"] == 2 {
                        let member = serde_json::from_value(force.clone()).unwrap();
                        (
                            dedaliano_engine::postprocess::diagrams::compute_diagram_value_at(
                                "shear", t, &member,
                            ),
                            dedaliano_engine::postprocess::diagrams::compute_diagram_value_at(
                                "moment", t, &member,
                            ),
                        )
                    } else {
                        let member = serde_json::from_value(force.clone()).unwrap();
                        let (shear, moment) = if case["axis"] == "z" {
                            ("shearY", "momentZ")
                        } else {
                            ("shearZ", "momentY")
                        };
                        assert!(
                            dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at(
                                &member, "torsion", t
                            )
                            .abs()
                                < 5e-11
                        );
                        (
                            dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at(
                                &member, shear, t,
                            ),
                            dedaliano_engine::postprocess::diagrams_3d::evaluate_diagram_3d_at(
                                &member, moment, t,
                            ),
                        )
                    };
                    assert!((actual_shear - expected_shear).abs() < 5e-9);
                    assert!((actual_moment - expected_moment).abs() < 5e-9);
                }
            }
        }
    }
}
