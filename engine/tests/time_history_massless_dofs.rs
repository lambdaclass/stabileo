use dedaliano_engine::solver::time_integration::{solve_time_history_2d, solve_time_history_2d_traced, solve_time_history_3d};
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

fn ax(r: &TimeHistoryResult, node: usize) -> Vec<f64> {
    r.node_histories.iter().find(|h| h.node_id == node).unwrap().ax.clone()
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

#[test]
fn a_node_with_a_tiny_but_positive_mass_keeps_its_initial_displacement_beside_a_massless_one() {
    let p = 10.0;
    let dt = period() / 400.0;
    for ratio in [1e-13, 1e-15, 1e-20] {
        let mut input = chain(dt, 4, 0.0, 3, p);
        let mut solver = serde_json::to_value(&input.solver).unwrap();
        solver["nodes"]["4"] = json!({"id": 4, "x": 2.0, "z": 0.0});
        solver["elements"]["3"] = json!({"id": 3, "type": "truss", "nodeI": 3, "nodeJ": 4, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false});
        solver["supports"]["4"] = json!({"id": 4, "nodeId": 4, "type": "rollerX"});
        solver["masses"]["nodal"] = json!([{"nodeId": 2, "mass": MASS}, {"nodeId": 3, "mass": MASS * ratio}]);
        input.solver = serde_json::from_value(solver).unwrap();
        let r = match solve_time_history_2d(&input) {
            Ok(r) => r,
            Err(e) if ratio < 1e-18 && e.starts_with("TH-MASS-SINGULAR: ") => continue,
            Err(e) => panic!("{ratio:e}: {e}"),
        };
        let (ua, ub) = (ux(&r, 2), ux(&r, 3));
        assert_eq!(ub[0] - ua[0], 0.0, "node 3, of {ratio:e} of node 2's mass, started displaced by {:.3e} of P/k2", (ub[0] - ua[0]) / (p / k2()));
        assert!(ub.iter().chain(&ua).all(|x| x.is_finite()), "{ratio:e}");
    }
}

#[test]
fn an_undamped_massless_tip_accelerates_with_the_mass_it_hangs_from() {
    let p = 10.0;
    let dt = period() / 400.0;
    let (r, _) = solve_time_history_2d_traced(&chain(dt, 800, 0.0, 3, p)).unwrap();
    let (aa, ab) = (ax(&r, 2), ax(&r, 3));
    let worst = aa.iter().zip(&ab).map(|(a, b)| (a - b).abs()).fold(0.0f64, f64::max);
    assert!(worst <= 1e-6 * p / MASS, "a_B − a_A reaches {:.3e} of P/m", worst / (p / MASS));
    let exact: Vec<f64> = r.time_steps.iter().map(|&t| p / MASS * (k1() / MASS).sqrt().mul_add(t, 0.0).cos()).collect();
    let off = aa.iter().zip(&exact).map(|(a, e)| (a - e).abs()).fold(0.0f64, f64::max);
    assert!(off <= 2e-3 * p / MASS, "a_A off the undamped SDOF P/m·cos(ωt) by {:.3e} of P/m", off / (p / MASS));
}

#[test]
fn a_damped_massless_tip_under_a_ramp_accelerates_as_its_first_order_closed_form() {
    let slope = 10.0;
    let dt = period() / 400.0;
    let mut input = serde_json::to_value(chain(dt, 800, 0.05, 3, 0.0)).unwrap();
    let record = |t: f64| json!({"time": t, "loads": [{"nodeId": 3, "fx": slope * t, "fz": 0.0, "my": 0.0}]});
    input["forceHistory"] = json!([record(0.0), record(1e3)]);
    let input: TimeHistoryInput = serde_json::from_value(input).unwrap();
    let (r, trace) = solve_time_history_2d_traced(&input).unwrap();
    let a1 = trace.a1;
    assert!(dt < 2.0 * a1, "dt {dt} a1 {a1}");
    let scale = slope / (k2() * a1);
    let (aa, ab) = (ax(&r, 2), ax(&r, 3));
    let worst = r.time_steps.iter().enumerate().map(|(n, &t)| {
        let exact = scale * (-t / a1).exp();
        ((ab[n] - aa[n]) - exact).abs()
    }).fold(0.0f64, f64::max);
    assert!(worst <= 3e-2 * scale, "a_B − a_A off (s/(k2·a1))·e^(−t/a1) by {:.3e} of s/(k2·a1)", worst / scale);
}

fn vx(r: &TimeHistoryResult, node: usize) -> Vec<f64> {
    r.node_histories.iter().find(|h| h.node_id == node).unwrap().vx.clone()
}

#[test]
fn an_undamped_massless_tip_under_a_ramp_stretches_at_the_load_rate() {
    let slope = 10.0;
    let dt = period() / 400.0;
    let mut input = serde_json::to_value(chain(dt, 800, 0.0, 3, 0.0)).unwrap();
    let record = |t: f64| json!({"time": t, "loads": [{"nodeId": 3, "fx": slope * t, "fz": 0.0, "my": 0.0}]});
    input["forceHistory"] = json!([record(0.0), record(1e3)]);
    let input: TimeHistoryInput = serde_json::from_value(input).unwrap();
    let r = solve_time_history_2d(&input).unwrap();
    let rate = slope / k2();
    let (va, vb) = (vx(&r, 2), vx(&r, 3));
    let off_v = va.iter().zip(&vb).map(|(a, b)| (b - a - rate).abs()).fold(0.0f64, f64::max);
    assert!(off_v <= 1e-6 * rate, "v_B − v_A off s/k2 by {:.3e} of it", off_v / rate);
    let (aa, ab) = (ax(&r, 2), ax(&r, 3));
    let peak = aa.iter().fold(0.0f64, |m, a| m.max(a.abs()));
    let off_a = aa.iter().zip(&ab).map(|(a, b)| (b - a).abs()).fold(0.0f64, f64::max);
    assert!(peak > 0.0 && off_a <= 1e-6 * peak, "a_B − a_A reaches {:.3e} of the peak a_A", off_a / peak);
}

fn ramp_then_hold(xi: f64, slope: f64, kink: f64, dt: f64, n_steps: usize) -> TimeHistoryResult {
    let mut input = serde_json::to_value(chain(dt, n_steps, xi, 3, 0.0)).unwrap();
    let record = |t: f64, f: f64| json!({"time": t, "loads": [{"nodeId": 3, "fx": f, "fz": 0.0, "my": 0.0}]});
    input["forceHistory"] = json!([record(0.0, 0.0), record(kink, slope * kink), record(1e3, slope * kink)]);
    solve_time_history_2d(&serde_json::from_value(input).unwrap()).unwrap()
}

#[test]
fn an_undamped_massless_tip_holds_its_rates_after_a_kink_in_the_load() {
    let (slope, dt) = (10.0, period() / 400.0);
    let kink = 100.37 * dt;
    let r = ramp_then_hold(0.0, slope, kink, dt, 400);
    let rate = slope / k2();
    let (va, vb, aa, ab) = (vx(&r, 2), vx(&r, 3), ax(&r, 2), ax(&r, 3));
    let peak = aa.iter().fold(0.0f64, |m, a| m.max(a.abs()));
    for (n, &t) in r.time_steps.iter().enumerate() {
        if t > kink && t - dt < kink {
            continue;
        }
        let exact = if t < kink { rate } else { 0.0 };
        assert!((vb[n] - va[n] - exact).abs() <= 1e-9 * rate, "t = {t}: v_B − v_A = {:.4e}, the load gives {exact:.4e}", vb[n] - va[n]);
        assert!((ab[n] - aa[n]).abs() <= 1e-6 * peak, "t = {t}: a_B − a_A = {:.4e} against a peak a_A of {peak:.4e}", ab[n] - aa[n]);
    }
}

#[test]
fn a_damped_massless_tip_relaxes_after_a_kink_in_the_load() {
    let (slope, dt) = (10.0, period() / 400.0);
    let kink = 100.37 * dt;
    let mut input = serde_json::to_value(chain(dt, 400, 0.05, 3, 0.0)).unwrap();
    let record = |t: f64, f: f64| json!({"time": t, "loads": [{"nodeId": 3, "fx": f, "fz": 0.0, "my": 0.0}]});
    input["forceHistory"] = json!([record(0.0, 0.0), record(kink, slope * kink), record(1e3, slope * kink)]);
    let (r, trace) = solve_time_history_2d_traced(&serde_json::from_value(input).unwrap()).unwrap();
    let a1 = trace.a1;
    let w = |t: f64| slope / k2() * (t - a1 + a1 * (-t / a1).exp());
    let held = slope * kink / k2();
    let w_dd = |t: f64| if t < kink { slope / (k2() * a1) * (-t / a1).exp() } else { (w(kink) - held) / (a1 * a1) * (-(t - kink) / a1).exp() };
    let scale = slope / (k2() * a1);
    let (aa, ab) = (ax(&r, 2), ax(&r, 3));
    for (n, &t) in r.time_steps.iter().enumerate() {
        if t > kink && t - 2.0 * dt < kink {
            continue;
        }
        assert!((ab[n] - aa[n] - w_dd(t)).abs() <= 3e-2 * scale, "t = {t}: a_B − a_A = {:.4e}, the first-order closed form gives {:.4e}", ab[n] - aa[n], w_dd(t));
    }
}
