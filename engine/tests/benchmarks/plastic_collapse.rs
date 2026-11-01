use dedaliano_engine::{solver::plastic::solve_plastic_3d, types::PlasticInput3D};

#[test]
fn portal_combined_mechanism() {
    let case: serde_json::Value = serde_json::from_str(include_str!("plastic_collapse.json")).unwrap();
    let input: PlasticInput3D = serde_json::from_value(case["input"].clone()).unwrap();
    let result = solve_plastic_3d(&input).unwrap();
    println!("{}", serde_json::to_string(&result).unwrap());
    assert!(result.is_mechanism);
    assert!(result.warnings.is_empty(), "{:?}", result.warnings);
    let expected = case["reference"]["combined"].as_f64().unwrap();
    assert!((result.collapse_factor - expected).abs() < case["tolerance"].as_f64().unwrap());
}
