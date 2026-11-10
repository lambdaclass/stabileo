use std::path::Path;
use std::process::Command;

fn run(program: &str, args: &[&str]) {
    let output = Command::new(program)
        .args(args)
        .current_dir(Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn issue_1508_snapshot_registration_must_apply_to_each_moved_field() {
    run("node", &["scripts/tests/snapshot-applicability.mjs"]);
}

#[test]
fn issue_1489_case_file_consumers_and_disabled_benchmarks_are_gated() {
    run(
        "python3",
        &[
            "-B",
            "-I",
            "scripts/tests/test_benchmark_gate.py",
            "ConsumerGaps",
        ],
    );
}

#[test]
fn issue_1490_navier_cases_have_individual_accuracy_bounds() {
    let data: serde_json::Value =
        serde_json::from_str(include_str!("benchmarks/navier_plate.json")).unwrap();
    for case in data["cases"].as_array().unwrap() {
        let bound = case["tolerance_relative"]
            .as_f64()
            .expect("each Navier case needs its measured bound");
        assert!(bound < data["parameters"]["tolerance_relative"].as_f64().unwrap());
    }
}
