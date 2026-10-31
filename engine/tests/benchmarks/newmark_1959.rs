use dedaliano_engine::{solver::time_integration::solve_time_history_3d, types::TimeHistoryInput3D};
use serde_json::{json, Value};
use std::f64::consts::PI;

fn number(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() <= 1e-12 * b.abs().max(1.0)
}

fn check(metric: String, observed: f64, tolerance: f64) -> Value {
    json!({"metric": metric, "observed": observed, "tolerance": tolerance, "passed": observed < tolerance})
}

#[test]
fn newmark_1959_step_response() {
    let case: Value = serde_json::from_str(include_str!("newmark_1959.json")).unwrap();
    let solver = &case["input"]["solver"];
    let reference = &case["reference"];
    let omega = number(&reference["omega"]);
    let force = number(&reference["force"]);

    let (n1, n2) = (&solver["nodes"]["1"], &solver["nodes"]["2"]);
    let length = ["x", "y", "z"].iter().map(|c| (number(&n2[c]) - number(&n1[c])).powi(2)).sum::<f64>().sqrt();
    assert_eq!(solver["elements"].as_object().unwrap().len(), 1);
    let element = &solver["elements"]["1"];
    assert_eq!((element["type"].as_str(), element["nodeI"].as_u64(), element["nodeJ"].as_u64()), (Some("frame"), Some(1), Some(2)));
    let e = number(&solver["materials"]["1"]["e"]);
    let area = number(&solver["sections"]["1"]["a"]);
    let density = number(&case["input"]["densities"]["1"]);
    let stiffness = 1000.0 * e * area / length;
    let mass = density * area * length / 3.0 / 1000.0;
    assert!(close(stiffness, number(&reference["stiffness"])), "k = {stiffness}");
    assert!(close(mass, number(&reference["mass"])), "m = {mass}");
    assert!(close(stiffness / mass, omega * omega));

    assert_eq!(solver["supports"].as_object().unwrap().len(), 2);
    for (node, free) in [(1u64, None), (2, Some("rx"))] {
        let support = &solver["supports"][node.to_string()];
        assert_eq!(support["nodeId"].as_u64(), Some(node));
        for dof in ["rx", "ry", "rz", "rrx", "rry", "rrz"] {
            assert_eq!(support[dof].as_bool(), Some(Some(dof) != free), "support {node} {dof}");
        }
    }
    assert!(solver["loads"].as_array().unwrap().is_empty());
    let history = case["input"]["forceHistory"].as_array().unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(number(&history[0]["time"]), 0.0);
    let loads = history[0]["loads"].as_array().unwrap();
    assert_eq!(loads.len(), 1);
    assert_eq!(loads[0]["nodeId"].as_u64(), Some(2));
    assert_eq!(number(&loads[0]["fx"]), force);
    for c in ["fy", "fz", "mx", "my", "mz"] {
        assert_eq!(number(&loads[0][c]), 0.0);
    }
    assert_eq!(case["input"]["method"].as_str(), Some("newmark"));
    assert_eq!((number(&case["input"]["beta"]), number(&case["input"]["gamma"])), (0.25, 0.5));
    assert!(case["input"].get("dampingXi").is_none());

    let period = 2.0 * PI / omega;
    let amplitude = force / stiffness;
    let mut runs = vec![];
    let mut checks = vec![];
    let mut previous_error = 0.0;
    for ratio in case["ratios"].as_array().unwrap() {
        let ratio = number(ratio);
        let mut input: TimeHistoryInput3D = serde_json::from_value(case["input"].clone()).unwrap();
        input.time_step = period * ratio;
        input.n_steps = (number(&case["cycles"]) / ratio).round() as usize;
        let result = solve_time_history_3d(&input).unwrap();
        let u = &result.node_histories.iter().find(|h| h.node_id == 2).unwrap().ux;
        assert_eq!(u.len(), input.n_steps + 1);
        let theta = 2.0 * (omega * input.time_step / 2.0).atan();
        let mut error: f64 = 0.0;
        let mut discrete_error: f64 = 0.0;
        for (i, (&t, &actual)) in result.time_steps.iter().zip(u).enumerate() {
            assert!(actual.is_finite());
            let discrete = amplitude * (1.0 - (i as f64 * theta).cos());
            discrete_error = discrete_error.max((actual - discrete).abs());
            error = error.max((actual - amplitude * (1.0 - (omega * t).cos())).abs());
        }
        assert!(discrete_error < 1e-10, "discrete solution at dt/T={ratio}");
        let crossings: Vec<f64> = (1..u.len()).filter_map(|i| {
            if u[i - 1] < amplitude && u[i] >= amplitude {
                Some(result.time_steps[i - 1] + input.time_step * (amplitude - u[i - 1]) / (u[i] - u[i - 1]))
            } else { None }
        }).collect();
        assert!(crossings.len() >= 3);
        let measured = (crossings.last().unwrap() - crossings[0]) / (crossings.len() - 1) as f64;
        let predicted = 2.0 * PI * input.time_step / theta;
        let period_difference = (measured / predicted - 1.0).abs();
        assert!(period_difference < 0.005);
        assert!(measured > period);
        let phase_lag = input.n_steps as f64 * (omega * input.time_step - theta);
        let bound = amplitude * phase_lag.min(2.0) + 1e-10;
        assert!(error < bound, "dt/T={ratio}: {error} exceeds the phase-lag bound {bound}");
        assert!(error > previous_error);
        if ratio == 0.025 { assert!(error < 0.0005); }
        previous_error = error;
        println!("dt/T={ratio}: exact T={period:.9}, Stabileo T={measured:.9}, predicted T={predicted:.9}, max |du|={error:.9} m, bound={bound:.9} m");
        checks.push(check(format!("dt/T={ratio}: maximum discrete displacement error (m)"), discrete_error, 1e-10));
        checks.push(check(format!("dt/T={ratio}: measured period relative difference from discrete prediction"), period_difference, 0.005));
        checks.push(check(format!("dt/T={ratio}: maximum continuous displacement error (m) within the phase-lag bound"), error, bound));
        if ratio == 0.025 {
            checks.push(check(format!("dt/T={ratio}: maximum continuous displacement error (m)"), error, 0.0005));
        }
        runs.push(json!({"ratio":ratio,"time":result.time_steps,"u":u,"measuredPeriod":measured,"maxError":error}));
    }
    if let Ok(path) = std::env::var("NEWMARK_REPLAY_OUT") {
        std::fs::write(path, serde_json::to_string_pretty(&json!({"solver":"production solve_time_history_3d", "runs":runs})).unwrap() + "\n").unwrap();
    }
    if let Ok(path) = std::env::var("NEWMARK_VALIDATION_OUT") {
        let mut evidence: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        evidence["checks"] = Value::Array(checks);
        std::fs::write(path, serde_json::to_string_pretty(&evidence).unwrap() + "\n").unwrap();
    }
}
