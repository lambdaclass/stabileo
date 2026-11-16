use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::{SolverInput, SolverInput3D};
use serde_json::Value;

#[test]
fn issue_2220_generated_pressure_reaches_native_members() {
    let fixtures: Value = serde_json::from_str(include_str!("wind_member_2220.json")).unwrap();
    assert_eq!(fixtures.as_array().unwrap().len(), 152);
    for case in fixtures.as_array().unwrap() {
        let integral = |station: f64, power: i32| -> f64 {
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
                    part["q"].as_f64().unwrap() * (b.powi(power + 1) - a.powi(power + 1))
                        / f64::from(power + 1)
                })
                .sum()
        };
        let tip = case["tip"].as_u64().unwrap();
        for nonlinear in [false, true] {
            let result = if case["dimension"] == 2 {
                let model: SolverInput = serde_json::from_value(case["input"].clone()).unwrap();
                serde_json::to_value(if nonlinear {
                    pdelta::solve_pdelta_2d(&model, 50, 1e-8).unwrap().results
                } else {
                    linear::solve_2d(&model).unwrap()
                })
                .unwrap()
            } else {
                let model: SolverInput3D = serde_json::from_value(case["input"].clone()).unwrap();
                serde_json::to_value(if nonlinear {
                    pdelta::solve_pdelta_3d(&model, 50, 1e-8).unwrap().results
                } else {
                    linear::solve_3d(&model).unwrap()
                })
                .unwrap()
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
                    .unwrap();
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
            }
        }
    }
}
