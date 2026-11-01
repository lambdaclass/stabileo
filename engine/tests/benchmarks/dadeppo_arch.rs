use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};

#[test]
fn limit_load() {
    let case: serde_json::Value = serde_json::from_str(include_str!("dadeppo_arch.json")).unwrap();
    let input: ArcLengthInput = serde_json::from_value(case["input"].clone()).unwrap();
    let result = solve_arc_length(&input).unwrap();
    let peak = result.steps.iter().map(|s| s.load_factor).fold(0.0_f64, f64::max);
    println!("peak={peak}, final={}, steps={}, converged={}", result.final_load_factor, result.steps.len(), result.converged);
    assert!((peak - 9.0112911888175).abs() < 1e-6, "limit-load regression: {peak}");
    assert!(result.converged);
    assert_eq!(result.steps.len(), input.max_steps);
    assert!((peak / case["reference"].as_f64().unwrap() - 1.0).abs() < case["relativeTolerance"].as_f64().unwrap());
    assert!(result.final_load_factor < peak * 0.95, "must pass the limit point");
    if let Ok(path) = std::env::var("DADEPPO_EXPORT") {
        let mut frames = Vec::new();
        for step in (20..=input.max_steps).step_by(20) {
            let mut prefix = input.clone();
            prefix.max_steps = step;
            let run = solve_arc_length(&prefix).unwrap();
            assert!(run.converged);
            assert_eq!(run.steps.len(), step);
            frames.push(serde_json::json!({"step": step, "loadFactor": run.final_load_factor, "displacements": run.results.displacements}));
        }
        std::fs::write(path, serde_json::to_string(&serde_json::json!({"frames": frames, "steps": result.steps})).unwrap() + "\n").unwrap();
    }
}
