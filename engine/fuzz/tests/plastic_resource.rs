#[test]
fn issue_743_large_exact_lp_is_refused_before_browser_work() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let output = std::process::Command::new("python3")
        .arg(root.join("../../scripts/replay-plastic-budget.py"))
        .arg(root.join("corpus-regressions/plastic-lp-budget/engine-grid-slab.bin"))
        .arg("--binary")
        .arg(root.join("target/release/examples/plastic_replay"))
        .args(["--mode", "engine", "--seconds", "1", "--repeats", "1"])
        .output()
        .unwrap();
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert!(output.status.success(), "{report}");
    assert!(report["failure"].is_null(), "{report}");
    let outcome = report["iterations"][0]["outcome"].as_str().unwrap();
    assert!(
        outcome.starts_with("error:") && outcome.contains("resource budget"),
        "{report}"
    );
}
