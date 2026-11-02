use dedaliano_engine::solver::time_integration::solve_time_history_3d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn nightly_model(issue: u32) -> SolverInput3D {
    let path = format!("{}/tests/fixtures/time_history_nonfinite/nightly-{issue}.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ground_motion(solver: SolverInput3D) -> TimeHistoryInput3D {
    let n = 60;
    let rec = |g: f64| -> Vec<f64> { (0..=n).map(|i| g * (0.9 * i as f64).sin() * (-(i as f64) / 40.0).exp()).collect() };
    let densities: HashMap<String, f64> = solver.materials.values().map(|m| (m.id.to_string(), 7850.0)).collect();
    TimeHistoryInput3D {
        solver, densities, time_step: 0.002, n_steps: n, method: "newmark".into(),
        beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
        ground_accel_x: Some(rec(1.0)), ground_accel_y: Some(rec(0.6)), ground_accel_z: Some(rec(0.3)), force_history: None,
    }
}

#[test]
fn nightly_ground_motion_reproducers_never_return_non_finite_histories() {
    for issue in [1196, 1205, 1207] {
        match solve_time_history_3d(&ground_motion(nightly_model(issue))) {
            Ok(r) => {
                let finite = r.node_histories.iter().all(|h| {
                    [&h.ux, &h.uy, &h.uz, &h.rx, &h.ry, &h.rz].iter().all(|s| s.iter().all(|v| v.is_finite()))
                });
                assert!(finite, "#{issue}: time history returned non-finite displacements without a refusal");
            }
            Err(e) => eprintln!("#{issue}: refused: {e}"),
        }
    }
}
