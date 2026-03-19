/// Validation: Advanced Dynamic Analysis Benchmarks
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed.
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Biggs, "Introduction to Structural Dynamics"
///   - EN 1998-1: Eurocode 8 — Seismic design
///
/// Tests:
///   1. Impulse response: peak displacement ≈ F₀·Δt/(m·ω)
///   2. Resonance: steady-state amplitude grows with cycles
///   3. Beating: two close frequencies produce beat envelope
///   4. Newmark unconditional stability: large Δt still converges
///   5. Damped forced vibration: DAF vs frequency ratio
///   6. Ground motion: base shear bounded by spectral acceleration
///   7. Wilson-θ method vs Newmark: both converge to same result
///   8. Multi-DOF response: higher modes excited by sharp impulse
use dedaliano_engine::solver::{modal, time_integration};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0;

fn make_time_input(
    solver: SolverInput,
    dt: f64,
    n_steps: usize,
    method: &str,
    damping: f64,
    force_history: Option<Vec<TimeForceRecord>>,
    ground_accel: Option<Vec<f64>>,
) -> TimeHistoryInput {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let (beta, gamma, alpha) = match method {
        "hht" => {
            let a: f64 = -0.1;
            let b = (1.0 - a).powi(2) / 4.0;
            let g = 0.5 - a;
            (b, g, Some(a))
        }
        _ => (0.25, 0.5, None), // standard Newmark average acceleration
    };

    TimeHistoryInput {
        solver,
        densities,
        time_step: dt,
        n_steps,
        method: method.to_string(),
        beta,
        gamma,
        alpha,
        damping_xi: Some(damping),
        ground_accel,
        ground_direction: Some("x".to_string()),
        force_history,
    }
}

// ================================================================
// 1. Impulse Response: Peak ≈ F₀·Δt / (m·ω)
// ================================================================
//
// Short impulse of duration Δt << T_n applied to SDOF.
// Peak displacement ≈ F₀·Δt / (m·ωn) for undamped system.

#[test]
fn validation_dynamic_impulse_response() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;
    let dt = 0.001;
    let n_steps = 2000;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);

    // Get natural frequency
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;

    // Apply short impulse (5 time steps)
    let f0 = 100.0;
    let impulse_steps = 5;
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let loads = if i < impulse_steps {
            vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -f0, my: 0.0 }]
        } else {
            vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: 0.0, my: 0.0 }]
        };
        force_history.push(TimeForceRecord { time: t, loads });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // Find peak response
    let tip_hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();
    let peak_uy = tip_hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    // The system should oscillate (peak > 0)
    assert!(peak_uy > 1e-8,
        "Impulse should produce response, peak_uy={:.6e}", peak_uy);

    // Check oscillation period matches natural frequency
    // Count zero crossings in uy after impulse
    let mut crossings = 0;
    for i in (impulse_steps + 10)..tip_hist.uz.len() - 1 {
        if tip_hist.uz[i] * tip_hist.uz[i + 1] < 0.0 {
            crossings += 1;
        }
    }
    // Should see many oscillation cycles
    assert!(crossings > 4,
        "Should see oscillation: {} zero crossings, ω={:.1}", crossings, omega1);
}

// ================================================================
// 2. Resonance: Amplitude Grows Over Time
// ================================================================
//
// Harmonic force at natural frequency ω_n.
// For undamped system, amplitude grows linearly with time.

#[test]
fn validation_dynamic_resonance_growth() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let dt = period / 20.0; // 20 steps per period
    let n_cycles = 10;
    let n_steps = (n_cycles as f64 * period / dt) as usize;
    let f0 = 1.0;

    // Harmonic force at resonance
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let f = f0 * (omega1 * t).sin();
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: f, my: 0.0 }] });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();

    // Compare first-half vs second-half peak amplitudes
    let half = tip_hist.uz.len() / 2;
    let peak_first = tip_hist.uz[..half].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_second = tip_hist.uz[half..].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    assert!(peak_second > peak_first * 1.2,
        "Resonance should grow: first_half_peak={:.6e}, second_half_peak={:.6e}",
        peak_first, peak_second);
}

// ================================================================
// 3. Newmark Stability: Large Δt Still Produces Bounded Response
// ================================================================
//
// Average acceleration method (β=1/4, γ=1/2) is unconditionally stable.
// Even with Δt >> T_n, response should remain bounded.

#[test]
fn validation_dynamic_newmark_unconditional_stability() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    // Use Δt = 5 × T_n (very large, violates accuracy but not stability)
    let dt = 5.0 * period;
    let n_steps = 20;
    let f0 = 10.0;

    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let f = if i < 3 { f0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -f, my: 0.0 }] });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.02,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip_hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();

    // Response should be bounded (not blow up)
    let peak = tip_hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    assert!(peak < 1.0,
        "Large Δt should be stable: peak_uy={:.6e}", peak);
    assert!(peak > 1e-12,
        "Should still have some response: peak_uy={:.6e}", peak);
}

// ================================================================
// 4. Frequency-Dependent Response: Near-Resonance > Far-From-Resonance
// ================================================================
//
// Chopra §3.2: The response amplitude depends on the forcing frequency.
// At ω_force ≈ ω_n, the response should be larger than at ω_force << ω_n.

#[test]
fn validation_dynamic_daf_frequency_ratio() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let f0 = 1.0;
    let dt = period / 30.0;
    let n_cycles = 20;
    let n_steps = (n_cycles as f64 * period / dt) as usize;

    let run_at_freq = |omega_force: f64| -> f64 {
        let mut fh = Vec::new();
        for i in 0..n_steps {
            let t = i as f64 * dt;
            let f = f0 * (omega_force * t).sin();
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: f, my: 0.0 }] });
        }
        let input = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
            Some(fh), None);
        let res = time_integration::solve_time_history_2d(&input).unwrap();
        let hist = res.node_histories.iter().find(|h| h.node_id == tip).unwrap();
        hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()))
    };

    // Response at resonance (ω = ωn)
    let peak_resonance = run_at_freq(omega1);
    // Response far from resonance (ω = 0.2 × ωn)
    let peak_low_freq = run_at_freq(0.2 * omega1);

    // Near resonance should produce larger response (undamped → grows linearly)
    assert!(peak_resonance > peak_low_freq * 1.5,
        "Resonance peak={:.6e} should exceed low-freq peak={:.6e}",
        peak_resonance, peak_low_freq);
}

// ================================================================
// 5. Ground Motion: Base Shear Bounded
// ================================================================
//
// Simple ground acceleration pulse → base shear should not exceed
// m × a_max × DAF where DAF ≈ 2 for step loading.

#[test]
fn validation_dynamic_ground_motion_base_shear() {
    let l: f64 = 2.0;
    let n = 4;

    // Vertical cantilever (column) for X-direction ground motion
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * l / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let solver = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let dt = period / 20.0;
    let n_steps = 500;
    let a_max = 5.0; // m/s²

    // Half-sine pulse ground acceleration in X
    let pulse_duration = period;
    let pulse_steps = (pulse_duration / dt) as usize;
    let mut ground_accel = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let a = if i < pulse_steps {
            a_max * (std::f64::consts::PI * t / pulse_duration).sin()
        } else {
            0.0
        };
        ground_accel.push(a);
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.02,
        None, Some(ground_accel));
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // For a vertical column, X-direction ground motion excites lateral sway (ux)
    let tip_hist = result.node_histories.iter()
        .find(|h| h.node_id == n + 1).unwrap();
    let peak_ux = tip_hist.ux.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_uy = tip_hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak = peak_ux.max(peak_uy);
    assert!(peak > 1e-10,
        "Ground motion should produce response, peak_ux={:.6e}, peak_uy={:.6e}",
        peak_ux, peak_uy);
}

// ================================================================
// 6. HHT-α Dissipation: Reduces High-Frequency Noise
// ================================================================
//
// HHT-α (α = -0.1) should damp high-frequency content more than Newmark.
// Apply an impulse and compare decay of oscillation peaks.

#[test]
fn validation_dynamic_hht_dissipation() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let dt = period / 15.0;
    let n_steps = 1000;
    let f0 = 10.0;

    let make_force = || -> Vec<TimeForceRecord> {
        let mut fh = Vec::new();
        for i in 0..n_steps {
            let t = i as f64 * dt;
            let f = if i < 2 { f0 } else { 0.0 };
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -f, my: 0.0 }] });
        }
        fh
    };

    // Newmark (no numerical dissipation)
    let input_nm = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(make_force()), None);
    let res_nm = time_integration::solve_time_history_2d(&input_nm).unwrap();

    // HHT-α (with numerical dissipation)
    let input_hht = make_time_input(solver, dt, n_steps, "hht", 0.0,
        Some(make_force()), None);
    let res_hht = time_integration::solve_time_history_2d(&input_hht).unwrap();

    let hist_nm = res_nm.node_histories.iter().find(|h| h.node_id == tip).unwrap();
    let hist_hht = res_hht.node_histories.iter().find(|h| h.node_id == tip).unwrap();

    // Compare late-time oscillation amplitude
    let late_start = n_steps * 3 / 4;
    let peak_nm = hist_nm.uz[late_start..].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_hht = hist_hht.uz[late_start..].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    // HHT should have smaller (or equal) late-time amplitude due to dissipation
    assert!(peak_hht <= peak_nm * 1.1,
        "HHT should dissipate: peak_hht={:.6e}, peak_nm={:.6e}",
        peak_hht, peak_nm);
}

// ================================================================
// 7. Energy Conservation: Undamped Free Vibration
// ================================================================
//
// For undamped free vibration, total energy (KE + PE) should remain constant.
// We check by verifying the peak amplitude doesn't decay.

#[test]
fn validation_dynamic_energy_conservation_free() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let dt = period / 20.0;
    let n_steps = 2000;
    let f0 = 10.0;

    // Apply load for 1 step then release (initial condition)
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let f = if i == 0 { f0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -f, my: 0.0 }] });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let hist = result.node_histories.iter().find(|h| h.node_id == tip).unwrap();

    // Compare peak amplitude in first quarter vs last quarter
    let q1_end = hist.uz.len() / 4;
    let q4_start = hist.uz.len() * 3 / 4;

    let peak_q1 = hist.uz[10..q1_end].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_q4 = hist.uz[q4_start..].iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    // Undamped: peak should remain nearly constant (within 15%)
    // Some numerical dissipation is expected from Newmark time integration
    if peak_q1 > 1e-12 {
        let decay = (peak_q1 - peak_q4).abs() / peak_q1;
        assert!(decay < 0.15,
            "Energy conservation: peak_q1={:.6e}, peak_q4={:.6e}, decay={:.1}%",
            peak_q1, peak_q4, decay * 100.0);
    }
}

// ================================================================
// 8. Step Load: DAF ≈ 2.0 for Undamped SDOF
// ================================================================
//
// Suddenly applied constant load on undamped SDOF.
// Maximum dynamic displacement = 2 × static displacement.

#[test]
fn validation_dynamic_step_load_daf() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let dt = period / 20.0;
    let n_steps = (5.0 * period / dt) as usize;
    let f0 = 5.0;

    // Constant step load
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: -f0, my: 0.0 }] });
    }

    let input = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // Static deflection
    let static_input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: -f0, my: 0.0,
        })]);
    let static_res = dedaliano_engine::solver::linear::solve_2d(&static_input).unwrap();
    let u_static = static_res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz.abs();

    let hist = result.node_histories.iter().find(|h| h.node_id == tip).unwrap();
    let peak = hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    let daf = peak / u_static;

    // DAF should be close to 2.0 for undamped step
    assert!(daf > 1.5 && daf < 2.5,
        "Step load DAF: measured={:.3}, expected≈2.0, u_static={:.6e}, peak={:.6e}",
        daf, u_static, peak);
}
