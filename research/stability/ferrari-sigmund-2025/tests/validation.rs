use serde_json::Value;

#[test]
fn validation_and_published_comparison() {
    validate_at(env!("CARGO_MANIFEST_DIR"));
}

fn validate_at(dir: &str) {
    let paper: Value = serde_json::from_str(include_str!("../reference-results/paper_values.json")).unwrap();
    let replay: Value = serde_json::from_str(include_str!("../results/stabileo_results.json")).unwrap();
    let (validation, comparison) = koiter_ferrari_sigmund_2025::validation::evidence(&paper, &replay);
    println!("{}", serde_json::to_string_pretty(&validation["study"]).unwrap());
    assert_eq!(validation["checks"].as_array().unwrap().len(), 12);
    for check in validation["checks"].as_array().unwrap() {
        assert_eq!(check["passed"], true, "{check}");
    }
    for (file, record) in [("VALIDATION.json", validation), ("reference-results/published_comparison.json", comparison)] {
        let path = std::path::Path::new(dir).join(file);
        let bytes = serde_json::to_string_pretty(&record).unwrap() + "\n";
        if std::env::var("UPDATE_FERRARI").as_deref() == Ok("1") && dir == env!("CARGO_MANIFEST_DIR") {
            std::fs::write(path, bytes).unwrap();
        } else {
            use std::io::Write;
            use std::process::{Command, Stdio};
            let mut compare = Command::new("python3").arg("-I").arg(concat!(env!("CARGO_MANIFEST_DIR"), "/../../tools/compare_evidence.py"))
                .arg(path).arg("/dev/stdin").stdin(Stdio::piped()).spawn().unwrap();
            compare.stdin.take().unwrap().write_all(bytes.as_bytes()).unwrap();
            assert!(compare.wait().unwrap().success(), "stale {file}");
        }
    }
}

#[test]
fn stale_evidence_is_rejected_without_rewriting_either_file() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dir = root.join("target").join(format!("freshness-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("reference-results")).unwrap();
    let validation = dir.join("VALIDATION.json");
    let comparison = dir.join("reference-results/published_comparison.json");
    std::fs::copy(root.join("VALIDATION.json"), &validation).unwrap();
    let original = std::fs::read(&validation).unwrap();
    std::fs::write(&comparison, "{}").unwrap();
    let rejected = std::panic::catch_unwind(|| validate_at(dir.to_str().unwrap())).is_err();
    let unchanged = std::fs::read(&validation).unwrap() == original && std::fs::read(&comparison).unwrap() == b"{}";
    std::fs::remove_dir_all(dir).unwrap();
    assert!(rejected && unchanged);
}
