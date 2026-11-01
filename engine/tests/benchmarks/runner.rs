//! Test-only adapter: the same Python generator serves lint, negative tests and solver runs.
use dedaliano_engine::{
    solver::{corotational, linear},
    types::*,
};
use serde_json::{json, Value};
use std::{
    io::Write,
    process::{Command, Stdio},
};

fn protocol(args: &[&str], input: Option<&Value>) -> Result<Value, String> {
    let mut child = Command::new("python3")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/benchmarks/protocol.py"
        ))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    if let Some(value) = input {
        child
            .stdin
            .take()
            .unwrap()
            .write_all(value.to_string().as_bytes())
            .unwrap();
    }
    let output = child.wait_with_output().unwrap();
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}
fn model(name: &str, n: usize, full: bool, mutant: &str) -> Value {
    protocol(
        &[
            "generate",
            &format!("{name}.json"),
            &n.to_string(),
            if full { "full" } else { "reduced" },
            mutant,
        ],
        None,
    )
    .unwrap()
}
#[derive(Debug, PartialEq)]
enum AnalysisMode {
    Linear2D,
    Corotational2D,
    Linear3D,
}
fn analysis_mode(e: &Value) -> Result<AnalysisMode, String> {
    match (e["dimension"].as_u64(), e["spec"]["analysis"].as_str()) {
        (Some(2), Some("linear")) => Ok(AnalysisMode::Linear2D),
        (Some(2), Some("corotational")) => Ok(AnalysisMode::Corotational2D),
        (Some(3), Some("linear")) => Ok(AnalysisMode::Linear3D),
        (dimension, analysis) => Err(format!(
            "unsupported benchmark analysis: dimension={dimension:?}, analysis={analysis:?}"
        )),
    }
}
fn solve(e: &Value, check: bool) -> f64 {
    try_solve(e, check).unwrap()
}
fn try_solve(e: &Value, check: bool) -> Result<f64, String> {
    let mode = analysis_mode(e)?;
    if check {
        protocol(&["precheck"], Some(e))?;
    }
    let result = if mode == AnalysisMode::Corotational2D {
        let input: SolverInput =
            serde_json::from_value(e["model"].clone()).map_err(|error| error.to_string())?;
        let r = corotational::solve_corotational_2d(
            &input,
            e["spec"]["solver"]["max_iterations"].as_u64().unwrap() as usize,
            e["spec"]["solver"]["residual_tolerance"].as_f64().unwrap(),
            e["spec"]["solver"]["load_steps"].as_u64().unwrap() as usize,
            false,
        )
        .map_err(|error| format!("model or reference suspect: {error:?}"))?;
        if !r.converged || (r.load_factor - 1.).abs() >= 1e-10 {
            return Err("model or reference suspect: full-load convergence required".into());
        }
        serde_json::to_value(r.results).unwrap()
    } else if mode == AnalysisMode::Linear2D {
        let input: SolverInput =
            serde_json::from_value(e["model"].clone()).map_err(|error| error.to_string())?;
        serde_json::to_value(
            linear::solve_2d(&input)
                .map_err(|error| format!("model or reference suspect: {error:?}"))?,
        )
        .unwrap()
    } else {
        let input: SolverInput3D =
            serde_json::from_value(e["model"].clone()).map_err(|error| error.to_string())?;
        serde_json::to_value(
            linear::solve_3d(&input)
                .map_err(|error| format!("model or reference suspect: {error:?}"))?,
        )
        .unwrap()
    };
    if check {
        Ok(
            protocol(&["check"], Some(&json!({"envelope":e,"result":result})))?
                .as_f64()
                .unwrap(),
        )
    } else {
        let d = result["displacements"]
            .as_array()
            .unwrap()
            .iter()
            .find(|d| d["nodeId"] == e["target"])
            .unwrap();
        Ok(d[e["spec"]["measurement"]["component"].as_str().unwrap()]
            .as_f64()
            .unwrap())
    }
}
fn sequence(name: &str) {
    let initial = model(name, 1, false, "");
    let spec = &initial["spec"];
    if !spec["symmetry_planes"].as_array().unwrap().is_empty() {
        symmetry(name);
    }
    let values: Vec<_> = spec["mesh_sequence"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| solve(&model(name, n.as_u64().unwrap() as usize, false, ""), true))
        .collect();
    let report = protocol(
        &["convergence"],
        Some(&json!({"spec":spec,"values":values})),
    )
    .unwrap();
    eprintln!("{name}: {report}");
}
#[test]
fn benchmark_protocol_mattiasson() {
    for q in [1, 2, 5, 10] {
        sequence(&format!("mattiasson-{q}"));
        sequence(&format!("mattiasson-{q}-shortening"));
    }
}
#[test]
fn benchmark_protocol_roof() {
    sequence("scordelis-lo");
}
#[test]
fn benchmark_protocol_cylinder() {
    sequence("pinched-cylinder");
}
fn symmetry(name: &str) {
    let full = solve(&model(name, 4, true, ""), true);
    let reduced = solve(&model(name, 4, false, ""), true);
    eprintln!("{name}: full={full}, reduced={reduced}");
    assert!(
        (reduced / full - 1.).abs() < 1e-6,
        "full/reduced symmetry mismatch"
    );
}
#[test]
fn benchmark_protocol_full_symmetry() {
    for name in ["scordelis-lo", "pinched-cylinder"] {
        symmetry(name);
    }
}
#[test]
fn benchmark_protocol_original_shell_errors() {
    let crown = model("scordelis-lo", 4, false, "crown_pin");
    assert!(protocol(&["precheck"], Some(&crown))
        .unwrap_err()
        .contains("support/reaction contract"));
    let missing = model("pinched-cylinder", 4, false, "missing_corner_symmetry");
    assert!(protocol(&["precheck"], Some(&missing))
        .unwrap_err()
        .contains("support/reaction contract"));
    // Bypass the contract intentionally to prove that the physical symmetry comparison also fails.
    let wrong = solve(&missing, false);
    let full = solve(&model("pinched-cylinder", 4, true, ""), true);
    assert!(
        (wrong / full - 1.).abs() > 1e-3,
        "old corner bug escaped full/reduced check"
    );
}
#[test]
fn benchmark_protocol_toggle_discrete_reference() {
    for element in ["truss", "frame"] {
        let e = model(&format!("shallow-toggle-{element}"), 1, false, "");
        let value = solve(&e, true);
        protocol(
            &["discrete"],
            Some(&json!({"spec":e["spec"],"value":value})),
        )
        .unwrap();
    }
}
#[test]
fn benchmark_protocol_lint_and_negative_tests() {
    let output = Command::new("python3")
        .arg(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/benchmarks/test_protocol.py"
        ))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn benchmark_protocol_toggle_frame_refinement() {
    // Every mesh must converge at full load and satisfy the result contract.
    for n in [1, 2, 4] {
        let value = solve(&model("shallow-toggle-frame", n, false, ""), true);
        eprintln!("shallow-toggle-frame, mesh {n}: {value}");
    }
}

#[test]
fn benchmark_protocol_toggle_truss_refinement_mechanism() {
    for n in [1, 2] {
        solve(&model("shallow-toggle-truss", n, false, ""), true);
    }
    // Only the four-subdivision mesh fails the tangent solve; the two-subdivision
    // mesh above must still reach full load rather than accepting any error.
    let error = try_solve(&model("shallow-toggle-truss", 4, false, ""), true)
        .expect_err("four-subdivision truss must expose its transverse mechanism");
    assert_eq!(error, "model or reference suspect: \"Singular tangent stiffness — structure may be a mechanism or load increment too large\"");
}

#[test]
fn benchmark_protocol_toggle_refinement_is_not_a_continuum_gate() {
    for element in ["truss", "frame"] {
        let e = model(&format!("shallow-toggle-{element}"), 1, false, "");
        let value = e["spec"]["references"][0]["value"].as_f64().unwrap();
        let error = protocol(
            &["convergence"],
            Some(&json!({"spec":e["spec"],"values":[value, value, value]})),
        )
        .unwrap_err();
        assert!(
            error.contains("discrete reference cannot gate continuum refinement"),
            "{error}"
        );
    }
}

#[test]
fn benchmark_protocol_analysis_dispatch() {
    let mut frame = model("mattiasson-1", 1, false, "");
    assert_eq!(analysis_mode(&frame).unwrap(), AnalysisMode::Corotational2D);
    let nonlinear = solve(&frame, true);
    frame["spec"]["analysis"] = json!("linear");
    frame["spec"].as_object_mut().unwrap().remove("solver");
    assert_eq!(analysis_mode(&frame).unwrap(), AnalysisMode::Linear2D);
    let input: SolverInput = serde_json::from_value(frame["model"].clone()).unwrap();
    let direct = serde_json::to_value(linear::solve_2d(&input).unwrap()).unwrap();
    let expected = protocol(&["check"], Some(&json!({"envelope":frame,"result":direct})))
        .unwrap()
        .as_f64()
        .unwrap();
    let actual = solve(&frame, true);
    assert_eq!(actual, expected);
    assert!((actual - nonlinear).abs() > 1e-4);
    let shell = model("scordelis-lo", 4, false, "");
    assert_eq!(analysis_mode(&shell).unwrap(), AnalysisMode::Linear3D);
    let input: SolverInput3D = serde_json::from_value(shell["model"].clone()).unwrap();
    let direct = serde_json::to_value(linear::solve_3d(&input).unwrap()).unwrap();
    let expected = protocol(&["check"], Some(&json!({"envelope":shell,"result":direct})))
        .unwrap()
        .as_f64()
        .unwrap();
    assert_eq!(solve(&shell, true), expected);
}

#[test]
fn benchmark_protocol_unsupported_analysis() {
    let mut shell = model("scordelis-lo", 4, false, "");
    shell["spec"]["analysis"] = json!("corotational");
    shell["spec"]["solver"] = model("mattiasson-1", 1, false, "")["spec"]["solver"].clone();
    protocol(&["precheck"], Some(&shell)).unwrap();
    assert!(try_solve(&shell, true)
        .unwrap_err()
        .contains("unsupported benchmark analysis"));
    for (dimension, analysis) in [(4, "linear"), (2, "unknown")] {
        let e = json!({"dimension":dimension,"spec":{"analysis":analysis},"model":null});
        assert!(try_solve(&e, true)
            .unwrap_err()
            .contains("unsupported benchmark analysis"));
    }
}
