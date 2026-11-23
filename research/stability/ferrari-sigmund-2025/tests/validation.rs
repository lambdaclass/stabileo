use serde_json::Value;

#[test]
fn validation_and_published_comparison() {
    let dir = env!("CARGO_MANIFEST_DIR");
    let paper: Value = serde_json::from_str(include_str!("../reference-results/paper_values.json")).unwrap();
    let replay: Value = serde_json::from_str(include_str!("../results/stabileo_results.json")).unwrap();
    let (validation, comparison) = koiter_ferrari_sigmund_2025::validation::evidence(&paper, &replay);
    std::fs::write(format!("{dir}/VALIDATION.json"), serde_json::to_string_pretty(&validation).unwrap() + "\n").unwrap();
    std::fs::write(format!("{dir}/reference-results/published_comparison.json"), serde_json::to_string_pretty(&comparison).unwrap() + "\n").unwrap();
    println!("{}", serde_json::to_string_pretty(&validation["study"]).unwrap());
    for check in validation["checks"].as_array().unwrap() {
        assert_eq!(check["passed"], true, "{check}");
    }
}
