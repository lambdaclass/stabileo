/// Validation: Time-History Dynamic Analysis
///
/// Benchmarks:
///   1. SDOF free vibration — period matches modal T within 5% (Chopra Ch.2)
///   2. SDOF step load — DAF = u_max/u_static ∈ [1.8, 2.2] (Chopra Ch.4)
///   3. Newmark energy conservation — amplitude ratio < 1.05 after 10 periods
///   4. HHT numerical dissipation — late/early ratio < 0.95
mod helpers;

use dedaliano_engine::solver::{time_integration, modal};
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

fn make_sdof_multi(
    n_elem: usize,
    length: f64,
    density: f64,
    dt: f64,
    n_steps: usize,
    damping_xi: Option<f64>,
    alpha: Option<f64>,
    force_history: Option<Vec<TimeForceRecord>>,
) -> TimeHistoryInput {
    let solver = make_beam(n_elem, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    TimeHistoryInput {
        solver,
        densities,
        time_step: dt,
        n_steps,
        method: if alpha.is_some() { "hht".to_string() } else { "newmark".to_string() },
        beta: 0.25,
        gamma: 0.5,
        alpha,
        damping_xi,
        ground_accel: None,
        ground_direction: None,
        force_history,
    }
}

/// Compute FE fundamental frequency via modal analysis.
fn get_fundamental_period(n_elem: usize, length: f64, density: f64) -> f64 {
    let solver = make_beam(n_elem, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();
    let omega = modal_res.modes[0].omega;
    2.0 * std::f64::consts::PI / omega
}

// ================================================================
// 1. SDOF Free Vibration: Period Matches Modal T within 5%
// ================================================================
//
// Source: Chopra Ch.2
// Impulse at cantilever tip, measure period from zero crossings,
// compare with modal analysis fundamental period.

#[test]
fn validation_time_history_sdof_free_vibration_period() {
    let l = 2.0;
    let density = 7850.0;
    let n_elem = 4;
    let tip_node = n_elem + 1;

    let t_fe = get_fundamental_period(n_elem, l, density);

    let dt = t_fe / 40.0;
    let n_steps = (5.0 * t_fe / dt) as usize;

    let force_history = vec![
        TimeForceRecord {
            time: 0.0,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 10.0, mz: 0.0,
            }],
        },
        TimeForceRecord {
            time: dt,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 0.0, mz: 0.0,
            }],
        },
    ];

    let input = make_sdof_multi(n_elem, l, density, dt, n_steps, None, None, Some(force_history));
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();
    let uy = &tip_hist.uy;

    // Find zero crossings
    let mut zero_crossings = Vec::new();
    for i in 1..uy.len() {
        if uy[i - 1] * uy[i] < 0.0 {
            let t_cross = result.time_steps[i - 1]
                + (result.time_steps[i] - result.time_steps[i - 1])
                * uy[i - 1].abs() / (uy[i - 1].abs() + uy[i].abs());
            zero_crossings.push(t_cross);
        }
    }

    assert!(
        zero_crossings.len() >= 4,
        "Need at least 4 zero crossings, got {}", zero_crossings.len()
    );

    // Measure full periods (every 2 zero crossings)
    let mut periods = Vec::new();
    for i in 0..zero_crossings.len().saturating_sub(2) {
        periods.push(zero_crossings[i + 2] - zero_crossings[i]);
    }

    let avg_period = periods.iter().sum::<f64>() / periods.len() as f64;
    let error = (avg_period - t_fe).abs() / t_fe;
    assert!(
        error < 0.05,
        "Free vibration period: measured={:.6}, modal={:.6}, error={:.1}%",
        avg_period, t_fe, error * 100.0
    );
}

// ================================================================
// 2. SDOF Step Load: DAF = u_max/u_static ∈ [1.8, 2.2]
// ================================================================
//
// Source: Chopra Ch.4
// Undamped, suddenly applied constant force. Exact DAF=2.0 for SDOF.
// Multi-DOF cantilever approximation: DAF ∈ [1.8, 2.2].

#[test]
fn validation_time_history_sdof_step_load_daf() {
    let l: f64 = 2.0;
    let density = 7850.0;
    let n_elem = 4;
    let p = 5.0;
    let tip_node = n_elem + 1;

    let e_eff = E * 1000.0;
    let u_static = p * l.powi(3) / (3.0 * e_eff * IZ);

    let t_period = get_fundamental_period(n_elem, l, density);
    let dt = t_period / 40.0;
    let n_steps = (3.0 * t_period / dt) as usize;

    // Constant force for all time steps
    let mut force_history = Vec::new();
    for i in 0..=n_steps {
        force_history.push(TimeForceRecord {
            time: i as f64 * dt,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: p, mz: 0.0,
            }],
        });
    }

    let input = make_sdof_multi(n_elem, l, density, dt, n_steps, None, None, Some(force_history));
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();

    let max_abs_uy = tip_hist.uy.iter()
        .cloned()
        .fold(0.0_f64, |a, b| a.max(b.abs()));

    let daf = max_abs_uy / u_static;
    assert!(
        daf > 1.8 && daf < 2.2,
        "DAF={:.3}, expected ∈ [1.8, 2.2] (u_max={:.3e}, u_static={:.3e})",
        daf, max_abs_uy, u_static
    );
}

// ================================================================
// 3. Newmark Energy Conservation: Amplitude Ratio < 1.05
// ================================================================
//
// Source: Newmark (1959)
// Average acceleration (β=1/4, γ=1/2) conserves energy for undamped systems.
// After 10 periods, amplitude should not grow by more than 5%.

#[test]
fn validation_time_history_newmark_energy_conservation() {
    let l = 2.0;
    let density = 7850.0;
    let n_elem = 4;
    let tip_node = n_elem + 1;

    let t_period = get_fundamental_period(n_elem, l, density);
    let dt = t_period / 30.0;
    let n_steps = (10.0 * t_period / dt) as usize;

    let force_history = vec![
        TimeForceRecord {
            time: 0.0,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 10.0, mz: 0.0,
            }],
        },
        TimeForceRecord {
            time: dt,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 0.0, mz: 0.0,
            }],
        },
    ];

    let input = make_sdof_multi(n_elem, l, density, dt, n_steps, None, None, Some(force_history));
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();
    let uy = &tip_hist.uy;

    let steps_per_period = (t_period / dt) as usize;
    let first_max = uy[..steps_per_period.min(uy.len())]
        .iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let last_start = if uy.len() > steps_per_period { uy.len() - steps_per_period } else { 0 };
    let last_max = uy[last_start..]
        .iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));

    if first_max > 1e-12 {
        let ratio = last_max / first_max;
        assert!(
            ratio < 1.05,
            "Energy conservation: last/first amplitude={:.4}, should be < 1.05", ratio
        );
    }
}

// ================================================================
// 4. HHT Numerical Dissipation: Late/Early Ratio < 0.95
// ================================================================
//
// Source: Hilber, Hughes & Taylor (1977)
// HHT-alpha with α=-0.1 introduces numerical damping.
// Late-time amplitude should be noticeably less than early-time.

#[test]
fn validation_time_history_hht_numerical_dissipation() {
    let l = 2.0;
    let density = 7850.0;
    let n_elem = 4;
    let tip_node = n_elem + 1;

    let t_period = get_fundamental_period(n_elem, l, density);
    let dt = t_period / 20.0;
    let n_steps = (8.0 * t_period / dt) as usize;

    let force_history = vec![
        TimeForceRecord {
            time: 0.0,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 10.0, mz: 0.0,
            }],
        },
        TimeForceRecord {
            time: dt,
            loads: vec![SolverNodalLoad {
                node_id: tip_node, fx: 0.0, fy: 0.0, mz: 0.0,
            }],
        },
    ];

    let input = make_sdof_multi(
        n_elem, l, density, dt, n_steps,
        None, Some(-0.1), Some(force_history),
    );

    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();
    let uy = &tip_hist.uy;

    let steps_per_period = (t_period / dt) as usize;
    let early_max = uy[..2 * steps_per_period.min(uy.len())]
        .iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let late_start = if uy.len() > 2 * steps_per_period {
        uy.len() - 2 * steps_per_period
    } else { 0 };
    let late_max = uy[late_start..]
        .iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));

    if early_max > 1e-12 {
        let ratio = late_max / early_max;
        assert!(
            ratio < 0.95,
            "HHT dissipation: late/early={:.4}, should be < 0.95 (showing decay)", ratio
        );
    }
}
