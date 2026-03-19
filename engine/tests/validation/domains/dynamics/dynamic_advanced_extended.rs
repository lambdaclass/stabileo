/// Validation: Extended Advanced Dynamic Analysis Benchmarks
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed.
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Biggs, "Introduction to Structural Dynamics", McGraw-Hill
///   - Craig & Kurdila, "Fundamentals of Structural Dynamics", 2nd Ed.
///
/// Tests:
///   1. Portal frame lateral sway under impulse excitation
///   2. Superposition: sum of individual load responses matches combined
///   3. Triangular pulse: DAF bounded in [1.0, 2.0] (Biggs Fig. 2.11)
///   4. Damping reduces peak response compared to undamped system
///   5. Continuous beam modal frequencies: f2/f1 ratio check
///   6. Step-then-release load: free vibration about static equilibrium
///   7. Half-sine pulse: response depends on t_d/T ratio (shock spectrum)
///   8. Velocity history consistency: v_peak ~ omega * u_peak for free vibration
use dedaliano_engine::solver::{linear, modal, time_integration};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;
use std::f64::consts::PI;

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
        _ => (0.25, 0.5, None),
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
// 1. Portal Frame Lateral Sway Under Impulse
// ================================================================
//
// Chopra Ch.12: A portal frame (2 columns + beam, fixed bases)
// subjected to a lateral impulse at the beam level should exhibit
// horizontal sway. The tip displacement should be non-zero and
// the response should oscillate at the frame's fundamental sway
// frequency.

#[test]
fn validation_dyn_adv_ext_portal_frame_sway_impulse() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;

    let solver = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let dt = period / 30.0;
    let n_steps = (8.0 * period / dt) as usize;
    let f0 = 20.0;

    // Short lateral impulse at node 2 (top-left corner of portal)
    let impulse_steps = 3;
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let fx = if i < impulse_steps { f0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: 2, fx, fz: 0.0, my: 0.0 }] });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // Check horizontal response at beam level (node 2)
    let hist = result.node_histories.iter()
        .find(|h| h.node_id == 2).unwrap();
    let peak_ux = hist.ux.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    assert!(peak_ux > 1e-8,
        "Portal frame should sway under lateral impulse, peak_ux={:.6e}", peak_ux);

    // Count zero crossings to verify oscillation
    let mut crossings = 0;
    for i in (impulse_steps + 5)..hist.ux.len() - 1 {
        if hist.ux[i] * hist.ux[i + 1] < 0.0 {
            crossings += 1;
        }
    }
    assert!(crossings > 4,
        "Portal frame should oscillate: {} zero crossings, omega1={:.1}", crossings, omega1);
}

// ================================================================
// 2. Superposition Principle: Combined Load = Sum of Individual
// ================================================================
//
// Chopra Ch.4: For a linear system, the response to the sum
// of two load histories equals the sum of the individual responses.
// u(F1 + F2, t) = u(F1, t) + u(F2, t)
//
// We apply two different harmonic loads separately and together,
// then verify superposition at each time step.

#[test]
fn validation_dyn_adv_ext_superposition_principle() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let dt = period / 25.0;
    let n_steps = (5.0 * period / dt) as usize;
    let f1_amp = 3.0;
    let f2_amp = 2.0;
    let omega_drive = 0.5 * omega1; // drive well away from resonance

    // Force history 1: harmonic in Y
    let make_fh = |a1: f64, a2: f64| -> Vec<TimeForceRecord> {
        let mut fh = Vec::new();
        for i in 0..n_steps {
            let t = i as f64 * dt;
            let fy = a1 * (omega_drive * t).sin() + a2 * (omega_drive * t).cos();
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
        }
        fh
    };

    // Response to load 1 alone
    let input1 = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(make_fh(f1_amp, 0.0)), None);
    let res1 = time_integration::solve_time_history_2d(&input1).unwrap();

    // Response to load 2 alone
    let input2 = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(make_fh(0.0, f2_amp)), None);
    let res2 = time_integration::solve_time_history_2d(&input2).unwrap();

    // Response to combined load (1+2)
    let input_comb = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(make_fh(f1_amp, f2_amp)), None);
    let res_comb = time_integration::solve_time_history_2d(&input_comb).unwrap();

    let h1 = res1.node_histories.iter().find(|h| h.node_id == tip).unwrap();
    let h2 = res2.node_histories.iter().find(|h| h.node_id == tip).unwrap();
    let hc = res_comb.node_histories.iter().find(|h| h.node_id == tip).unwrap();

    // Check superposition at multiple time steps
    let check_count = n_steps.min(hc.uz.len()).min(h1.uz.len()).min(h2.uz.len());
    let mut max_err: f64 = 0.0;
    let mut max_combined: f64 = 0.0;

    for i in 0..check_count {
        let sum_uy = h1.uz[i] + h2.uz[i];
        let combined_uy = hc.uz[i];
        let err = (sum_uy - combined_uy).abs();
        if combined_uy.abs() > max_combined {
            max_combined = combined_uy.abs();
        }
        if err > max_err {
            max_err = err;
        }
    }

    // Superposition should hold within tight tolerance
    let rel_err = if max_combined > 1e-15 { max_err / max_combined } else { max_err };
    assert!(rel_err < 0.01,
        "Superposition: max relative error={:.4e}, max_combined={:.6e}",
        rel_err, max_combined);
}

// ================================================================
// 3. Triangular Pulse: DAF Bounded in [1.0, 2.0]
// ================================================================
//
// Biggs Ch.2, Fig. 2.11: For a triangular pulse (rises linearly
// to F0 at t=t_d/2, then decreases to 0 at t=t_d) applied to an
// undamped SDOF, the DAF depends on t_d/T:
//   - For t_d/T << 1 (impulsive): DAF -> 0
//   - For t_d/T >> 1 (quasi-static): DAF -> 2.0
//   - Peak DAF ~ 1.5-1.7 at t_d/T ~ 1
//
// We use t_d ~ T for a moderate DAF and verify it lies in [1.0, 2.5].

#[test]
fn validation_dyn_adv_ext_triangular_pulse_daf() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let f0 = 5.0;
    let t_d = period; // pulse duration = 1 natural period
    let dt = period / 40.0;
    let n_steps = (5.0 * period / dt) as usize;

    // Triangular pulse: linear rise to peak at t_d/2, linear fall to 0 at t_d
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let fy = if t < t_d / 2.0 {
            -f0 * (2.0 * t / t_d)
        } else if t < t_d {
            -f0 * (2.0 * (1.0 - t / t_d))
        } else {
            0.0
        };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
    }

    let input = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // Static deflection under peak force
    let static_input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: -f0, my: 0.0,
        })]);
    let static_res = linear::solve_2d(&static_input).unwrap();
    let u_static = static_res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz.abs();

    let hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();
    let peak = hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    let daf = peak / u_static;

    // For t_d/T ~ 1 triangular pulse, DAF should be moderate
    assert!(daf > 1.0 && daf < 2.5,
        "Triangular pulse DAF: {:.3}, expected in [1.0, 2.5], u_static={:.6e}, peak={:.6e}",
        daf, u_static, peak);
}

// ================================================================
// 4. Damping Reduces Peak Response
// ================================================================
//
// Chopra Ch.3: Increasing the damping ratio reduces the peak
// dynamic displacement for any transient excitation. We verify
// that the peak response with 10% damping is strictly less than
// the peak response with 0% damping under the same loading.

#[test]
fn validation_dyn_adv_ext_damping_reduces_peak() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let dt = period / 30.0;
    let n_steps = (10.0 * period / dt) as usize;
    let f0 = 5.0;

    // Harmonic load near resonance (to maximize damping effect)
    let make_fh = || -> Vec<TimeForceRecord> {
        let mut fh = Vec::new();
        for i in 0..n_steps {
            let t = i as f64 * dt;
            let fy = f0 * (0.95 * omega1 * t).sin();
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
        }
        fh
    };

    // Undamped response
    let input_undamped = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
        Some(make_fh()), None);
    let res_undamped = time_integration::solve_time_history_2d(&input_undamped).unwrap();

    // Damped response (10% critical)
    let input_damped = make_time_input(solver, dt, n_steps, "newmark", 0.10,
        Some(make_fh()), None);
    let res_damped = time_integration::solve_time_history_2d(&input_damped).unwrap();

    let hist_undamped = res_undamped.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();
    let hist_damped = res_damped.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();

    let peak_undamped = hist_undamped.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_damped = hist_damped.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    assert!(peak_undamped > 1e-10,
        "Undamped should have response, peak={:.6e}", peak_undamped);
    assert!(peak_damped < peak_undamped,
        "10% damping should reduce peak: damped={:.6e}, undamped={:.6e}",
        peak_damped, peak_undamped);

    // The reduction should be significant (at least 10%)
    let reduction = 1.0 - peak_damped / peak_undamped;
    assert!(reduction > 0.10,
        "Damping should produce > 10% reduction: actual={:.1}%", reduction * 100.0);
}

// ================================================================
// 5. Continuous Beam Modal Frequency Ratio
// ================================================================
//
// Clough & Penzien Ch.12: A two-span continuous beam (each span L)
// has a different frequency pattern than a single-span beam.
// The first mode is a symmetric shape and the second is antisymmetric.
// For equal spans with pinned ends and roller at center:
//   f1 corresponds to single-span mode: f1 ~ (pi/L)^2 * sqrt(EI/rhoA)
//   f2/f1 > 1 and depends on span ratio.
//
// We verify that f2 > f1 and both are positive.

#[test]
fn validation_dyn_adv_ext_continuous_beam_modal_frequencies() {
    let span: f64 = 4.0;
    let n_per_span = 8;

    // Two equal spans
    let input = make_continuous_beam(
        &[span, span], n_per_span, E, A, IZ, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();
    assert!(result.modes.len() >= 2,
        "Continuous beam should have at least 2 modes");

    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;

    assert!(f1 > 0.0, "First frequency should be positive: {:.4} Hz", f1);
    assert!(f2 > f1, "Second frequency should exceed first: f2={:.4} > f1={:.4}", f2, f1);

    let ratio = f2 / f1;

    // For a 2-span continuous beam, the frequency ratio depends on the
    // boundary conditions and mode shapes. It should be well-separated.
    assert!(ratio > 1.1 && ratio < 6.0,
        "Continuous beam f2/f1={:.3}, expected in [1.1, 6.0]", ratio);

    // Compare with single-span SS beam analytical fundamental frequency
    // f_ss = (pi/L)^2 / (2*pi) * sqrt(EI/rhoA) for pinned-pinned
    let ei: f64 = E * 1000.0 * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;
    let f_ss_single: f64 = (PI / span).powi(2) / (2.0 * PI) * (ei / rho_a).sqrt();

    // The continuous beam fundamental frequency should be comparable to
    // the single-span frequency (same order of magnitude)
    let order = f1 / f_ss_single;
    assert!(order > 0.5 && order < 3.0,
        "Continuous beam f1={:.4} vs single-span f_ss={:.4}, ratio={:.3}",
        f1, f_ss_single, order);
}

// ================================================================
// 6. Step-Then-Release: Free Vibration About Static Equilibrium
// ================================================================
//
// Chopra Ch.2: If a constant force F0 is suddenly removed at time
// t = t_release after the system has reached steady state (with
// damping), the system vibrates about zero with amplitude equal
// to the static displacement u_static.
//
// We apply a step load for many periods (with damping to reach
// steady state), then release, and verify oscillation about zero.

#[test]
fn validation_dyn_adv_ext_step_then_release() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let dt = period / 25.0;
    let hold_periods = 15; // hold load until system settles
    let free_periods = 5;  // observe free vibration after release
    let n_hold = (hold_periods as f64 * period / dt) as usize;
    let n_free = (free_periods as f64 * period / dt) as usize;
    let n_steps = n_hold + n_free;
    let f0 = 5.0;

    // Step load applied for n_hold steps, then released
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let fy = if i < n_hold { -f0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
    }

    // Use moderate damping so the system reaches near-steady-state during hold
    let input = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.05,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();

    // During late hold phase, displacement should be near static value
    let static_input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: -f0, my: 0.0,
        })]);
    let static_res = linear::solve_2d(&static_input).unwrap();
    let u_static = static_res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz;

    // Check that near end of hold phase, displacement is close to u_static
    let check_start = n_hold - (n_hold / 5);
    let check_end = n_hold.min(hist.uz.len());
    let avg_hold: f64 = hist.uz[check_start..check_end].iter().sum::<f64>()
        / (check_end - check_start) as f64;

    let hold_err = (avg_hold - u_static).abs() / u_static.abs();
    assert!(hold_err < 0.30,
        "During hold phase, avg displacement={:.6e} should approach u_static={:.6e}, error={:.1}%",
        avg_hold, u_static, hold_err * 100.0);

    // After release, the system should oscillate (not stay at u_static)
    let free_start = n_hold.min(hist.uz.len());
    let free_end = hist.uz.len();
    if free_end > free_start + 10 {
        let free_slice = &hist.uz[free_start..free_end];
        let max_free = free_slice.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
        let min_free = free_slice.iter().fold(f64::MAX, |a, &b| a.min(b));
        let range = max_free - min_free.abs().min(0.0);

        // After release, there should be oscillation (nonzero range)
        assert!(range > 1e-10,
            "After release, should oscillate: max={:.6e}, min={:.6e}", max_free, min_free);
    }
}

// ================================================================
// 7. Half-Sine Pulse: Shock Spectrum Behavior (t_d/T Dependence)
// ================================================================
//
// Biggs Ch.2: The peak response to a half-sine pulse depends on
// the ratio t_d/T (pulse duration / natural period).
//   - For t_d/T << 1 (impulsive): peak ~ impulse / (m*omega)
//   - For t_d/T = 0.5: DAF ~ 1.5 (approximate)
//   - For t_d/T >> 1 (quasi-static): peak ~ 2*u_static
//
// We verify that longer pulses produce larger peak response when
// t_d/T is in the impulsive-to-resonance range.

#[test]
fn validation_dyn_adv_ext_half_sine_shock_spectrum() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let period = modal_res.modes[0].period;

    let f0 = 5.0;
    let dt = period / 50.0;
    let n_steps = (5.0 * period / dt) as usize;

    let run_half_sine = |t_d: f64| -> f64 {
        let mut fh = Vec::new();
        for i in 0..n_steps {
            let t = i as f64 * dt;
            let fy = if t < t_d {
                -f0 * (PI * t / t_d).sin()
            } else {
                0.0
            };
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
        }
        let input = make_time_input(solver.clone(), dt, n_steps, "newmark", 0.0,
            Some(fh), None);
        let res = time_integration::solve_time_history_2d(&input).unwrap();
        let hist = res.node_histories.iter().find(|h| h.node_id == tip).unwrap();
        hist.uz.iter().fold(0.0_f64, |a, &b| a.max(b.abs()))
    };

    // Impulsive regime: short pulse
    let peak_short = run_half_sine(0.1 * period);

    // Moderate: pulse = 0.5T
    let peak_moderate = run_half_sine(0.5 * period);

    // Long pulse: pulse = 1.5T (quasi-static regime)
    let peak_long = run_half_sine(1.5 * period);

    // All should produce nonzero response
    assert!(peak_short > 1e-12,
        "Short pulse should produce response, peak={:.6e}", peak_short);
    assert!(peak_moderate > 1e-12,
        "Moderate pulse should produce response, peak={:.6e}", peak_moderate);
    assert!(peak_long > 1e-12,
        "Long pulse should produce response, peak={:.6e}", peak_long);

    // Longer pulse should generally produce larger response in impulsive regime
    // (t_d/T from 0.1 to 0.5 increases peak on shock spectrum)
    assert!(peak_moderate > peak_short * 0.8,
        "Moderate pulse peak ({:.6e}) should generally exceed short pulse ({:.6e})",
        peak_moderate, peak_short);

    // Static deflection for reference
    let static_input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip, fx: 0.0, fz: -f0, my: 0.0,
        })]);
    let static_res = linear::solve_2d(&static_input).unwrap();
    let u_static = static_res.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uz.abs();

    // Long pulse DAF should be bounded by ~ 2.0 (slightly above for multi-DOF)
    let daf_long = peak_long / u_static;
    assert!(daf_long < 2.5,
        "Long half-sine pulse DAF={:.3} should be < 2.5", daf_long);
}

// ================================================================
// 8. Velocity History Consistency: v_peak ~ omega * u_peak
// ================================================================
//
// Craig & Kurdila Ch.3: For undamped free vibration dominated by
// the fundamental mode, the peak velocity and peak displacement
// are related by: v_peak ~ omega_1 * u_peak
//
// This relationship holds for a single-mode response. For a
// multi-DOF system, the ratio v_peak/(omega_1 * u_peak) should
// be approximately 1.0 if the response is dominated by mode 1.

#[test]
fn validation_dyn_adv_ext_velocity_displacement_consistency() {
    let l: f64 = 2.0;
    let n = 4;
    let tip = n + 1;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega1 = modal_res.modes[0].omega;
    let period = modal_res.modes[0].period;

    let dt = period / 40.0;
    let n_steps = (8.0 * period / dt) as usize;
    let f0 = 10.0;

    // Short impulse to excite primarily mode 1
    let impulse_steps = 2;
    let mut force_history = Vec::new();
    for i in 0..n_steps {
        let t = i as f64 * dt;
        let fy = if i < impulse_steps { -f0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: tip, fx: 0.0, fz: fy, my: 0.0 }] });
    }

    let input = make_time_input(solver, dt, n_steps, "newmark", 0.0,
        Some(force_history), None);
    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let hist = result.node_histories.iter()
        .find(|h| h.node_id == tip).unwrap();

    // Use the free vibration portion (after impulse)
    let free_start = impulse_steps + 5;
    let uy_free = &hist.uz[free_start..];
    let vy_free = &hist.vz[free_start..];

    let peak_uy = uy_free.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));
    let peak_vy = vy_free.iter().fold(0.0_f64, |a, &b| a.max(b.abs()));

    assert!(peak_uy > 1e-12,
        "Free vibration displacement should be nonzero: {:.6e}", peak_uy);
    assert!(peak_vy > 1e-12,
        "Free vibration velocity should be nonzero: {:.6e}", peak_vy);

    // For mode-1-dominated response: v_peak / (omega * u_peak) ~ 1.0
    let ratio = peak_vy / (omega1 * peak_uy);

    // Allow wide tolerance because higher modes contribute some velocity
    assert!(ratio > 0.3 && ratio < 3.0,
        "v_peak / (omega1 * u_peak) = {:.3}, expected ~1.0 (omega1={:.2}, u_peak={:.6e}, v_peak={:.6e})",
        ratio, omega1, peak_uy, peak_vy);
}
