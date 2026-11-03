use dedaliano_engine::solver::time_integration::{solve_time_history_2d_traced, solve_time_history_3d};
use dedaliano_engine::types::*;
use serde_json::{json, Value};

const E_MPA: f64 = 200_000.0;
const E: f64 = E_MPA * 1000.0;
const AREA: f64 = 1e-4;
const MASS: f64 = 2.0;

fn k1() -> f64 {
    E * AREA / 1.0
}

fn k2() -> f64 {
    E * AREA / 0.5
}

fn chain(dt: f64, n_steps: usize, xi: f64, load_node: usize, p: f64) -> TimeHistoryInput {
    let solver = json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 1.0, "z": 0.0},
            "3": {"id": 3, "x": 1.5, "z": 0.0},
        },
        "materials": {"1": {"id": 1, "e": E_MPA, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": AREA, "iz": 1e-8}},
        "elements": {
            "1": {"id": 1, "type": "truss", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
            "2": {"id": 2, "type": "truss", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false},
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "pinned"},
            "2": {"id": 2, "nodeId": 2, "type": "rollerX"},
            "3": {"id": 3, "nodeId": 3, "type": "rollerX"},
        },
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": MASS}]},
    });
    let record = |t: f64| json!({"time": t, "loads": [{"nodeId": load_node, "fx": p, "fz": 0.0, "my": 0.0}]});
    serde_json::from_value(json!({
        "solver": solver, "densities": {}, "timeStep": dt, "nSteps": n_steps,
        "method": "newmark", "dampingXi": xi,
        "forceHistory": [record(0.0), record(1e6)],
    }))
    .unwrap()
}

fn damped_step(m: f64, c: f64, k: f64, p: f64, t: f64) -> f64 {
    let omega = (k / m).sqrt();
    let zeta = c / (2.0 * m * omega);
    let wd = omega * (1.0 - zeta * zeta).sqrt();
    p / k * (1.0 - (-zeta * omega * t).exp() * ((wd * t).cos() + zeta * omega / wd * (wd * t).sin()))
}

fn ux(r: &TimeHistoryResult, node: usize) -> Vec<f64> {
    r.node_histories.iter().find(|h| h.node_id == node).unwrap().ux.clone()
}

struct Regime {
    name: &'static str,
    steps_per_period: f64,
    xi: f64,
    tol_a: f64,
    tol_w: Option<f64>,
}

const REGIMES: [Regime; 3] = [
    Regime { name: "undamped", steps_per_period: 400.0, xi: 0.0, tol_a: 1e-3, tol_w: Some(1e-9) },
    Regime { name: "damped, step below 2·a1", steps_per_period: 400.0, xi: 0.05, tol_a: 1e-3, tol_w: Some(2e-2) },
    Regime { name: "damped, step above 2·a1", steps_per_period: 40.0, xi: 0.05, tol_a: 2e-2, tol_w: None },
];

fn period() -> f64 {
    2.0 * std::f64::consts::PI * (MASS / k1()).sqrt()
}

#[test]
fn a_step_load_on_a_massless_dof_matches_the_two_dof_closed_form() {
    let p = 10.0;
    let mut failures = Vec::new();
    for g in &REGIMES {
        let dt = period() / g.steps_per_period;
        let n_steps = (2.0 * g.steps_per_period) as usize;
        let (r, trace) = solve_time_history_2d_traced(&chain(dt, n_steps, g.xi, 3, p)).unwrap();
        let (a0, a1) = (trace.a0, trace.a1);
        match g.name {
            "undamped" => assert_eq!(a1, 0.0),
            "damped, step below 2·a1" => assert!(dt < 2.0 * a1, "dt {dt} a1 {a1}"),
            _ => assert!(dt >= 2.0 * a1, "dt {dt} a1 {a1}"),
        }
        let (ua, ub) = (ux(&r, 2), ux(&r, 3));
        let c = a0 * MASS + a1 * k1();
        let rho = if a1 > 0.0 { (1.0 - dt / (2.0 * a1)) / (1.0 + dt / (2.0 * a1)) } else { 1.0 };
        let (mut err_a, mut err_w, mut err_trapezoid) = (0.0f64, 0.0f64, 0.0f64);
        for (n, &t) in r.time_steps.iter().enumerate() {
            let w = ub[n] - ua[n];
            if a1 > 0.0 {
                err_trapezoid = err_trapezoid.max((w - p / k2() * (1.0 - rho.powi(n as i32))).abs() / (p / k2()));
            }
            if n == 0 {
                continue;
            }
            let exact_w = if a1 > 0.0 { p / k2() * (1.0 - (-t / a1).exp()) } else { p / k2() };
            err_a = err_a.max((ua[n] - damped_step(MASS, c, k1(), p, t)).abs() / (p / k1()));
            err_w = err_w.max((w - exact_w).abs() / (p / k2()));
        }
        let w0 = (ub[0] - ua[0]) / (p / k2());
        let expected_w0 = if a1 > 0.0 { 0.0 } else { 1.0 };
        if err_a > g.tol_a || g.tol_w.is_some_and(|tol| err_w > tol) || err_trapezoid > 1e-9 || (w0 - expected_w0).abs() > 1e-9 {
            failures.push(format!(
                "{}: u_A off the damped SDOF by {err_a:.3e} of P/k1; u_B − u_A off P/k2·(1 − e^(−t/a1)) by {err_w:.3e} and off the trapezoidal rule's P/k2·(1 − ρ^n) by {err_trapezoid:.3e} of P/k2; at t = 0 it is {w0:.3e} of P/k2",
                g.name
            ));
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

#[test]
fn the_two_dof_chain_is_reciprocal_at_every_step() {
    for g in &REGIMES {
        let dt = period() / g.steps_per_period;
        let n_steps = (2.0 * g.steps_per_period) as usize;
        let (on_a, _) = solve_time_history_2d_traced(&chain(dt, n_steps, g.xi, 2, 1.0)).unwrap();
        let (on_b, _) = solve_time_history_2d_traced(&chain(dt, n_steps, g.xi, 3, 1.0)).unwrap();
        let (b_from_a, a_from_b) = (ux(&on_a, 3), ux(&on_b, 2));
        let scale = b_from_a.iter().chain(&a_from_b).fold(0.0f64, |m, v| m.max(v.abs()));
        for (n, (x, y)) in b_from_a.iter().zip(&a_from_b).enumerate() {
            assert!((x - y).abs() <= 1e-9 * scale, "{}: step {n}: u_B(P_A) = {x:e} vs u_A(P_B) = {y:e}", g.name);
        }
    }
}

fn cantilever_3d(load: Value) -> TimeHistoryInput3D {
    let solver = json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 0.0, "y": 0.0, "z": 1.5},
            "3": {"id": 3, "x": 0.0, "y": 0.0, "z": 3.0},
        },
        "materials": {"1": {"id": 1, "e": E_MPA, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
        },
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [],
        "masses": {"nodal": [{"nodeId": 2, "mass": 1.0}, {"nodeId": 3, "mass": 2.0}]},
    });
    let record = |t: f64| json!({"time": t, "loads": [load.clone()]});
    serde_json::from_value(json!({
        "solver": solver, "densities": {}, "timeStep": 0.002, "nSteps": 200,
        "method": "newmark", "dampingXi": 0.05,
        "forceHistory": [record(0.0), record(1e6)],
    }))
    .unwrap()
}

#[test]
fn a_moment_on_massless_rotations_is_reciprocal_with_a_force_in_3d() {
    let force = solve_time_history_3d(&cantilever_3d(json!({"nodeId": 3, "fx": 1.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": 0.0}))).unwrap();
    let moment = solve_time_history_3d(&cantilever_3d(json!({"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 1.0, "mz": 0.0}))).unwrap();
    let rot = &force.node_histories.iter().find(|h| h.node_id == 2).unwrap().ry;
    let disp = &moment.node_histories.iter().find(|h| h.node_id == 3).unwrap().ux;
    let scale = rot.iter().chain(disp).fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(scale > 0.0);
    for (n, (x, y)) in rot.iter().zip(disp).enumerate() {
        assert!((x - y).abs() <= 1e-9 * scale, "step {n}: θy2(Fx3) = {x:e} vs ux3(My2) = {y:e}");
    }
}
