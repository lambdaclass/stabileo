use dedaliano_engine::solver::ssi::{solve_ssi_2d, SSIInput};

#[test]
fn audit_ssi_reaction_outputs() {
    let cases: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(std::env::var("AUDIT_SSI_CASES").unwrap()).unwrap()).unwrap();
    let out = std::env::var("AUDIT_SSI_OUT").unwrap();
    std::fs::create_dir_all(&out).unwrap();
    for case in cases.as_array().unwrap() {
        let input: SSIInput = serde_json::from_value(case["input"][0].clone()).unwrap();
        let result = solve_ssi_2d(&input);
        let value = serde_json::json!({"model":case["model"],"input":case["input"],"result":result});
        std::fs::write(std::path::Path::new(&out).join(case["model"].as_str().unwrap()), serde_json::to_vec(&value).unwrap()).unwrap();
    }
}
