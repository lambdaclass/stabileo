//! Test-only adapter: the same Python generator serves lint, negative tests and solver runs.
use dedaliano_engine::{solver::{linear, corotational}, types::*};
use serde_json::{json, Value};
use std::{io::Write, process::{Command, Stdio}};

fn protocol(args: &[&str], input: Option<&Value>) -> Result<Value, String> {
    let mut child = Command::new("python3")
        .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/benchmarks/protocol.py"))
        .args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().unwrap();
    if let Some(value) = input { child.stdin.take().unwrap().write_all(value.to_string().as_bytes()).unwrap(); }
    let output = child.wait_with_output().unwrap();
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).into_owned()); }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}
fn model(name: &str, n: usize, full: bool, mutant: &str) -> Value {
    protocol(&["generate", &format!("{name}.json"), &n.to_string(), if full {"full"} else {"reduced"}, mutant], None).unwrap()
}
fn solve(e: &Value, check: bool) -> f64 {
    if check { protocol(&["precheck"], Some(e)).unwrap(); }
    let result = if e["dimension"] == 2 {
        let input: SolverInput = serde_json::from_value(e["model"].clone()).unwrap();
        let r = corotational::solve_corotational_2d(&input, 50, 1e-10, 100, false).unwrap();
        assert!(r.converged && (r.load_factor-1.).abs()<1e-10, "full-load convergence required");
        serde_json::to_value(r.results).unwrap()
    } else {
        let input: SolverInput3D = serde_json::from_value(e["model"].clone()).unwrap();
        serde_json::to_value(linear::solve_3d(&input).unwrap()).unwrap()
    };
    if check {
        protocol(&["check"], Some(&json!({"envelope":e,"result":result}))).unwrap().as_f64().unwrap()
    } else {
        let d = result["displacements"].as_array().unwrap().iter().find(|d| d["nodeId"]==e["target"]).unwrap();
        d[e["spec"]["measurement"]["component"].as_str().unwrap()].as_f64().unwrap()
    }
}
fn sequence(name: &str) {
    let initial = model(name, 1, false, "");
    let spec = &initial["spec"];
    let values: Vec<_> = spec["mesh_sequence"].as_array().unwrap().iter().map(|n| solve(&model(name,n.as_u64().unwrap() as usize,false,""),true)).collect();
    let report = protocol(&["convergence"],Some(&json!({"spec":spec,"values":values}))).unwrap();
    eprintln!("{name}: {report}");
}
#[test]
fn benchmark_protocol_mattiasson() {
    for q in [1,2,5,10] { sequence(&format!("mattiasson-{q}")); }
}
#[test]
fn benchmark_protocol_roof() { sequence("scordelis-lo"); }
#[test]
fn benchmark_protocol_cylinder() { sequence("pinched-cylinder"); }
#[test]
fn benchmark_protocol_full_symmetry() {
    for name in ["scordelis-lo","pinched-cylinder"] {
        let full = solve(&model(name,4,true,""),true);
        let reduced = solve(&model(name,4,false,""),true);
        eprintln!("{name}: full={full}, reduced={reduced}");
        assert!((reduced/full-1.).abs()<1e-6, "full/reduced symmetry mismatch");
    }
}
#[test]
fn benchmark_protocol_original_shell_errors() {
    let crown = model("scordelis-lo",4,false,"crown_pin");
    assert!(protocol(&["precheck"],Some(&crown)).unwrap_err().contains("support/reaction contract"));
    let missing = model("pinched-cylinder",4,false,"missing_corner_symmetry");
    assert!(protocol(&["precheck"],Some(&missing)).unwrap_err().contains("support/reaction contract"));
    // Bypass the contract intentionally to prove that the physical symmetry comparison also fails.
    let wrong = solve(&missing,false);
    let full = solve(&model("pinched-cylinder",4,true,""),true);
    assert!((wrong/full-1.).abs()>1e-3, "old corner bug escaped full/reduced check");
}
#[test]
fn benchmark_protocol_toggle_discrete_reference() {
    for element in ["truss","frame"] {
        let e = model(&format!("shallow-toggle-{element}"),1,false,"");
        let value = solve(&e,true);
        let reference = e["spec"]["references"][0]["value"].as_f64().unwrap();
        assert!((value/reference-1.).abs()<1e-8, "{element}: {value} vs {reference}");
    }
}
#[test]
fn benchmark_protocol_lint_and_negative_tests() {
    let output = Command::new("python3").arg(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/benchmarks/test_protocol.py")).output().unwrap();
    assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));
}
