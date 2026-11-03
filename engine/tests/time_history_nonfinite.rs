use dedaliano_engine::solver::time_integration::{solve_time_history_3d, NON_FINITE_RESPONSE};
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn nightly_model(issue: u32) -> SolverInput3D {
    let path = format!("{}/tests/fixtures/time_history_nonfinite/nightly-{issue}.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ground_motion(solver: SolverInput3D, scale: f64) -> TimeHistoryInput3D {
    let n = 60;
    let rec = |g: f64| -> Vec<f64> { (0..=n).map(|i| scale * g * (0.9 * i as f64).sin() * (-(i as f64) / 40.0).exp()).collect() };
    let densities: HashMap<String, f64> = solver.materials.values().map(|m| (m.id.to_string(), 7850.0)).collect();
    TimeHistoryInput3D {
        solver, densities, time_step: 0.002, n_steps: n, method: "newmark".into(),
        beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
        ground_accel_x: Some(rec(1.0)), ground_accel_y: Some(rec(0.6)), ground_accel_z: Some(rec(0.3)), force_history: None,
    }
}

fn peak_translation(r: &TimeHistoryResult3D) -> f64 {
    r.node_histories.iter()
        .flat_map(|h| h.ux.iter().chain(&h.uy).chain(&h.uz))
        .fold(0.0_f64, |m, v| if v.is_finite() { m.max(v.abs()) } else { f64::INFINITY })
}

#[test]
fn nightly_reproducers_with_massless_rotations_integrate_to_a_bounded_response() {
    for issue in [1196, 1205, 1207] {
        let r = solve_time_history_3d(&ground_motion(nightly_model(issue), 1.0))
            .unwrap_or_else(|e| panic!("#{issue}: {e}"));
        assert_eq!(r.time_steps.len(), 61, "#{issue}");
        assert!(!r.node_histories.is_empty(), "#{issue}");
        for h in &r.node_histories {
            for series in [&h.ux, &h.uy, &h.uz] { assert_eq!(series.len(), 61, "#{issue}: node {}", h.node_id); }
        }
        let peak = peak_translation(&r);
        assert!(peak > 0.0 && peak < 0.01, "#{issue}: peak relative translation {peak:e} m under a 1.2 m/s² record of 0.12 s");
        let half = peak_translation(&solve_time_history_3d(&ground_motion(nightly_model(issue), 0.5)).unwrap());
        assert!((half / peak - 0.5).abs() < 1e-9, "#{issue}: half the record gives {half:e}, not half of {peak:e}");
    }
}

#[test]
fn an_overflowing_response_is_refused_with_its_code() {
    let err = solve_time_history_3d(&ground_motion(nightly_model(1205), 1.7e308)).unwrap_err();
    assert!(err.starts_with(&format!("{NON_FINITE_RESPONSE}: ")), "{err}");
}
