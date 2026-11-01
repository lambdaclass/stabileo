use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};

#[test]
fn lee_frame_limit_load() {
    let data: serde_json::Value = serde_json::from_str(include_str!("benchmarks/lee_frame.json")).unwrap();
    let mut input: ArcLengthInput = serde_json::from_value(data["input"].clone()).unwrap();
    let result = solve_arc_length(&input).unwrap();
    assert!(result.converged);
    assert_eq!(result.steps.len(), input.max_steps);
    assert!(result.steps.iter().all(|s| s.converged && s.load_factor.is_finite()));
    let peak = result.steps.windows(3).find(|w| w[1].load_factor > w[0].load_factor && w[1].load_factor > w[2].load_factor).unwrap()[1].clone();
    let expected = data["regression"]["firstLimitLoad"].as_f64().unwrap();
    let tolerance = data["regression"]["absoluteTolerance"].as_f64().unwrap();
    assert!((peak.load_factor - expected).abs() < tolerance);
    assert!(result.final_load_factor < peak.load_factor * 0.5);
    for id in [1, 21] {
        let d = result.results.displacements.iter().find(|d| d.node_id == id).unwrap();
        assert_eq!(d.ux, 0.0);
        assert_eq!(d.uz, 0.0);
    }
    println!("First limit: {} kN at step {}; provisional reference: 1.83 kN", peak.load_factor, peak.step);
    if let Ok(path) = std::env::var("LEE_REPLAY_OUTPUT") {
        let count = input.max_steps;
        let mut frames = Vec::new();
        for step in 1..=count {
            input.max_steps = step;
            let r = solve_arc_length(&input).unwrap();
            assert!(r.converged);
            frames.push(serde_json::json!({"step": step, "load": r.final_load_factor, "displacement": r.results.displacements}));
        }
        std::fs::write(path, serde_json::to_string(&serde_json::json!({"frames": frames})).unwrap() + "\n").unwrap();
    }
}
