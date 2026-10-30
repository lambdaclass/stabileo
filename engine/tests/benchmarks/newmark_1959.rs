use dedaliano_engine::{solver::time_integration::solve_time_history_3d, types::TimeHistoryInput3D};
use serde_json::{json, Value};
use std::f64::consts::PI;

#[test]
fn newmark_1959_step_response() {
    let case: Value = serde_json::from_str(include_str!("newmark_1959.json")).unwrap();
    let omega = case["reference"]["omega"].as_f64().unwrap();
    let stiffness = case["input"]["solver"]["materials"]["1"]["e"].as_f64().unwrap()
        * 1000.0 * case["input"]["solver"]["sections"]["1"]["a"].as_f64().unwrap();
    let mass = case["input"]["densities"]["1"].as_f64().unwrap()
        * case["input"]["solver"]["sections"]["1"]["a"].as_f64().unwrap() / 3000.0;
    assert!((stiffness / mass - omega * omega).abs() < 1e-12);
    let period = 2.0 * PI / omega;
    let amplitude = case["reference"]["force"].as_f64().unwrap()
        / case["reference"]["stiffness"].as_f64().unwrap();
    let mut runs = vec![];
    let mut previous_error = 0.0;
    for ratio in case["ratios"].as_array().unwrap() {
        let ratio = ratio.as_f64().unwrap();
        let mut input: TimeHistoryInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        input.time_step = period * ratio;
        input.n_steps = (case["cycles"].as_f64().unwrap() / ratio).round() as usize;
        let result = solve_time_history_3d(&input).unwrap();
        let u = &result.node_histories.iter().find(|h| h.node_id == 2).unwrap().ux;
        let theta = 2.0 * (omega * input.time_step / 2.0).atan();
        let mut error: f64 = 0.0;
        for (i, (&t, &actual)) in result.time_steps.iter().zip(u).enumerate() {
            assert!(actual.is_finite());
            let discrete = amplitude * (1.0 - (i as f64 * theta).cos());
            assert!((actual - discrete).abs() < 1e-10, "discrete solution at {i}");
            error = error.max((actual - amplitude * (1.0 - (omega * t).cos())).abs());
        }
        let crossings: Vec<f64> = (1..u.len()).filter_map(|i| {
            if u[i - 1] < amplitude && u[i] >= amplitude {
                Some(result.time_steps[i - 1] + input.time_step * (amplitude - u[i - 1]) / (u[i] - u[i - 1]))
            } else { None }
        }).collect();
        assert!(crossings.len() >= 3);
        let measured = (crossings.last().unwrap() - crossings[0]) / (crossings.len() - 1) as f64;
        let predicted = 2.0 * PI * input.time_step / theta;
        assert!((measured / predicted - 1.0).abs() < 0.005);
        assert!(measured > period);
        assert!(error > previous_error);
        if ratio == 0.025 { assert!(error < 0.0005); }
        previous_error = error;
        println!("dt/T={ratio}: exact T={period:.9}, Stabileo T={measured:.9}, predicted T={predicted:.9}, max |du|={error:.9} m");
        runs.push(json!({"ratio":ratio,"time":result.time_steps,"u":u,"measuredPeriod":measured,"maxError":error}));
    }
    if let Ok(path) = std::env::var("NEWMARK_REPLAY_OUT") {
        std::fs::write(path, serde_json::to_string_pretty(&json!({"solver":"production solve_time_history_3d", "runs":runs})).unwrap() + "\n").unwrap();
    }
}
