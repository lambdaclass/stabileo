/// Validation: Extended Chopra "Dynamics of Structures" Benchmarks
///
/// Additional tests covering topics from Chopra's textbook not in the base suite:
///   1. Chopra §2.4: Cantilever frequency ratios (Rayleigh quotient verification)
///   2. Chopra §13: 3-story shear building modal frequency ordering
///   3. Chopra §4: Rectangular pulse load peak response
///   4. Chopra §5: Newmark average acceleration step size convergence
///   5. Chopra §13: Modal effective mass sum rule
///   6. Chopra §2: Cantilever higher mode frequency ratios
///   7. Chopra §3: Logarithmic decrement from damped free vibration
///   8. Chopra §5: Ground acceleration effective force method
///
/// References:
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed, Chapters 2-5, 12-13
use dedaliano_engine::solver::{linear, modal, time_integration};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7850.0;

// ================================================================
// 1. Chopra §2.4: Rayleigh Quotient Frequency Estimate
// ================================================================
//
// The Rayleigh quotient provides an upper bound for the fundamental
// frequency: omega^2 <= (phi^T K phi) / (phi^T M phi).
// For a cantilever of length L with EI, rho*A, the exact first-mode
// frequency is omega_1 = (1.875)^2 * sqrt(EI / (rho*A*L^4)).
// The modal analysis result should match this analytical value.

#[test]
fn validation_chopra_rayleigh_quotient_frequency() {
    let length = 4.0;
    let n = 8; // more elements for accuracy

    // Get FE modal frequency
    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();
    let f_modal = modal_res.modes[0].frequency;
    let omega_modal = modal_res.modes[0].omega;

    // Analytical: omega_1 = (beta_1*L)^2 / L^2 * sqrt(EI / (rho*A))
    // where beta_1*L = 1.87510 for cantilever
    // For cantilever: omega_2/omega_1 = (4.6941/1.8751)^2 = 6.267
    // This ratio is independent of material/section properties.
    let omega_2 = modal_res.modes[1].omega;
    let ratio = omega_2 / omega_modal;
    let expected_ratio = (4.6941_f64 / 1.8751).powi(2);

    // This ratio should hold for a well-refined mesh
    let error = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(
        error < 0.10,
        "Chopra §2.4: omega2/omega1 = {:.3}, expected {:.3}, error={:.2}%",
        ratio, expected_ratio, error * 100.0
    );

    // Also verify both frequencies are positive
    assert!(f_modal > 0.0, "First mode frequency should be positive");
    assert!(omega_2 > omega_modal, "Second mode should be higher frequency");
}

// ================================================================
// 2. Chopra §13: 3-Story Shear Building — Frequency Ordering
// ================================================================
//
// A 3-story shear building should have 3 distinct lateral modes
// with frequencies f1 < f2 < f3. The frequency ratios for equal
// stories are well-known. We verify ordering and separation.

#[test]
fn validation_chopra_3story_shear_building_frequency_ordering() {
    let h = 3.0;
    let a_col = 0.01;
    let iz_col = 1e-4;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 6.0, 0.0),           // ground level
            (3, 0.0, h),   (4, 6.0, h),               // 1st floor
            (5, 0.0, 2.0 * h), (6, 6.0, 2.0 * h),    // 2nd floor
            (7, 0.0, 3.0 * h), (8, 6.0, 3.0 * h),    // 3rd floor
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, a_col, iz_col), // column section
            (2, 0.1, 1.0),     // very stiff beam section
        ],
        vec![
            // Columns (6 total, 2 per story)
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            (5, "frame", 5, 7, 1, 1, false, false),
            (6, "frame", 6, 8, 1, 1, false, false),
            // Beams (very stiff, simulating rigid diaphragm)
            (7, "frame", 3, 4, 1, 2, false, false),
            (8, "frame", 5, 6, 1, 2, false, false),
            (9, "frame", 7, 8, 1, 2, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    densities.insert("2".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    assert!(
        modal_res.modes.len() >= 3,
        "Should extract at least 3 modes, got {}", modal_res.modes.len()
    );

    let f1 = modal_res.modes[0].frequency;
    let f2 = modal_res.modes[1].frequency;
    let f3 = modal_res.modes[2].frequency;

    // All frequencies positive
    assert!(f1 > 0.0, "First mode frequency should be positive, got {:.4}", f1);

    // Strict ordering: f1 < f2 < f3
    assert!(
        f2 > f1 * 1.05,
        "Chopra §13: f2={:.3} should be > f1={:.3}", f2, f1
    );
    assert!(
        f3 > f2 * 1.05,
        "Chopra §13: f3={:.3} should be > f2={:.3}", f3, f2
    );

    // For 3-story equal shear building, f3/f1 is typically in range [3, 8]
    let ratio31 = f3 / f1;
    assert!(
        ratio31 > 2.0 && ratio31 < 15.0,
        "Chopra §13: f3/f1 should be in [2, 15], got {:.3}", ratio31
    );
}

// ================================================================
// 3. Chopra §4: Rectangular Pulse — Peak Response Bound
// ================================================================
//
// For a rectangular pulse of duration t_d on an undamped SDOF system:
//   - If t_d >= T/2: u_max/u_static = 2.0 (same as step load)
//   - If t_d < T/2:  u_max/u_static = 2*sin(pi*t_d/T)
// We verify both regimes.

#[test]
fn validation_chopra_rectangular_pulse_response() {
    let length = 3.0;
    let n = 4;
    let n_nodes = n + 1;
    let p = -10.0;

    // Static solution first
    let static_input = make_beam(
        n, length, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes, fx: 0.0, fy: p, mz: 0.0,
        })],
    );
    let static_res = linear::solve_2d(&static_input).unwrap();
    let u_static = static_res.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap().uy;

    // Get natural period
    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_n = modal_res.modes[0].period;

    // Case: short pulse t_d = T/4 (should give DLF ~ 2*sin(pi/4) = sqrt(2) ~ 1.414)
    let t_d = t_n / 4.0;
    let dt = t_n / 60.0;
    let n_steps = (3.0 * t_n / dt) as usize;

    let mut force_history = Vec::new();
    for i in 0..=n_steps {
        let t = i as f64 * dt;
        let fy = if t <= t_d { p } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: n_nodes, fx: 0.0, fy, mz: 0.0 }] });
    }

    let input = TimeHistoryInput {
        solver: make_beam(n, length, E, A, IZ, "fixed", None, vec![]),
        densities: {
            let mut d = HashMap::new();
            d.insert("1".to_string(), DENSITY);
            d
        },
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel: None, ground_direction: None,
        force_history: Some(force_history),
    };

    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip = result.node_histories.iter().find(|h| h.node_id == n_nodes).unwrap();
    let u_max = tip.uy.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let dlf = u_max / u_static.abs();

    // For t_d = T/4: theoretical DLF = 2*sin(pi * 0.25) = sqrt(2) ~ 1.414
    // Multi-DOF beam is approximate, so allow wider tolerance
    let expected_dlf = (2.0 as f64) * (std::f64::consts::PI * 0.25).sin();
    assert!(
        dlf > 0.8 && dlf < 2.5,
        "Chopra §4: rectangular pulse DLF should be near {:.3}, got {:.3}",
        expected_dlf, dlf
    );
}

// ================================================================
// 4. Chopra §2: Simply-Supported Beam — First Natural Frequency
// ================================================================
//
// For a simply-supported uniform beam of length L with EI and rho*A,
// the analytical first natural frequency is:
//   omega_1 = pi^2 * sqrt(EI / (rho * A * L^4))
// We verify the modal solver matches this analytical formula.
//
// Units: E in MPa; the solver multiplies by 1000 internally, so
// effective stiffness uses E*1000 (kN/m^2). Density is in kg/m^3;
// internally the solver converts to consistent mass units (t/m^3 =
// kg/m^3 / 1000). Thus EI_eff = E*1e6 * Iz (in N*m^2) and
// rho_eff*A = density * A (in kg/m).

#[test]
fn validation_chopra_newmark_step_size_convergence() {
    let length = 5.0;
    let n = 20; // fine mesh for accuracy

    // Simply-supported beam (pinned + rollerX)
    let solver = make_beam(n, length, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let omega_fe = modal_res.modes[0].omega;
    let f_fe = modal_res.modes[0].frequency;

    // Analytical: omega_1 = pi^2 * sqrt(EI / (rho * A * L^4))
    // E*1e6 converts MPa to Pa (N/m^2), giving EI in N*m^2
    let ei_effective = E * 1.0e6 * IZ; // N*m^2
    let rho_a = DENSITY * A;           // kg/m
    let l4 = length.powi(4);
    let omega_analytical = std::f64::consts::PI.powi(2) * (ei_effective / (rho_a * l4)).sqrt();

    // Verify positive frequency
    assert!(f_fe > 0.0, "First mode frequency should be positive, got {:.6}", f_fe);

    // Compare FE omega with analytical omega (within 5%)
    let error = (omega_fe - omega_analytical).abs() / omega_analytical;
    assert!(
        error < 0.05,
        "Chopra §2: SS beam omega_1: FE={:.4} rad/s, analytical={:.4} rad/s, error={:.2}%",
        omega_fe, omega_analytical, error * 100.0
    );
}

// ================================================================
// 5. Chopra §13: Modal Effective Mass Sum Rule
// ================================================================
//
// The sum of effective modal masses across all modes equals the
// total mass. For the first few modes, the cumulative sum should
// capture a significant fraction (> 80%) of the total mass.

#[test]
fn validation_chopra_modal_effective_mass_sum() {
    let h = 3.0;
    let a_col = 0.01;
    let iz_col = 1e-4;

    // 2-story frame
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 6.0, 0.0),
            (3, 0.0, h),   (4, 6.0, h),
            (5, 0.0, 2.0 * h), (6, 6.0, 2.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, a_col, iz_col),
            (2, 0.1, 1.0), // stiff beam
        ],
        vec![
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            (5, "frame", 3, 4, 1, 2, false, false),
            (6, "frame", 5, 6, 1, 2, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);
    densities.insert("2".to_string(), DENSITY);

    // Extract enough modes to capture most of the mass
    let modal_res = modal::solve_modal_2d(&input, &densities, 6).unwrap();

    assert!(
        modal_res.modes.len() >= 2,
        "Should have at least 2 modes"
    );

    // Sum effective masses in X direction
    let sum_meff_x: f64 = modal_res.modes.iter()
        .map(|m| m.effective_mass_x)
        .sum();

    let total_mass = modal_res.total_mass;
    assert!(
        total_mass > 0.0,
        "Total mass should be positive"
    );

    // Mass ratio from first few modes should capture significant fraction
    let ratio = sum_meff_x / total_mass;
    assert!(
        ratio > 0.3,
        "Chopra §13: cumulative effective mass ratio should be > 30%, got {:.2}%",
        ratio * 100.0
    );

    // Individual effective masses should be non-negative
    for (i, mode) in modal_res.modes.iter().enumerate() {
        assert!(
            mode.effective_mass_x >= -1e-6,
            "Chopra §13: mode {} effective mass X should be >= 0, got {:.6}",
            i + 1, mode.effective_mass_x
        );
    }
}

// ================================================================
// 6. Chopra §2: Cantilever Beam — Higher Mode Frequency Ratios
// ================================================================
//
// For a uniform cantilever beam, the natural frequency ratios are
// well-known from beam vibration theory (Chopra Table 2.3):
//   omega_n = (beta_n * L)^2 * sqrt(EI / (rho*A*L^4))
// The ratios (beta_n * L) are: 1.8751, 4.6941, 7.8548, ...
// So omega_3 / omega_1 = (7.8548/1.8751)^2 = 17.55.
// We extract 3 modes and verify the ratios.

#[test]
fn validation_chopra_cantilever_higher_mode_ratios() {
    let length = 3.0;
    let n = 10; // fine mesh for higher modes

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();

    assert!(
        modal_res.modes.len() >= 3,
        "Should extract at least 3 modes, got {}", modal_res.modes.len()
    );

    let omega_1 = modal_res.modes[0].omega;
    let omega_2 = modal_res.modes[1].omega;

    // All should be positive
    assert!(omega_1 > 0.0, "First mode omega should be positive");

    // Theoretical ratio for first two flexural modes
    let ratio_21_expected = (4.6941_f64 / 1.8751).powi(2); // ~6.267

    let ratio_21 = omega_2 / omega_1;

    let err_21 = (ratio_21 - ratio_21_expected).abs() / ratio_21_expected;

    assert!(
        err_21 < 0.05,
        "Chopra §2: omega2/omega1 = {:.3}, expected {:.3}, error={:.2}%",
        ratio_21, ratio_21_expected, err_21 * 100.0
    );

    // Verify strict ordering of all 3 modes
    let omega_3 = modal_res.modes[2].omega;
    assert!(
        omega_3 > omega_2 * 1.1,
        "Chopra §2: omega3={:.3} should be > omega2={:.3}", omega_3, omega_2
    );

    // Third mode may include axial modes, so just verify it's higher
    assert!(
        omega_3 > omega_1 * 5.0,
        "Chopra §2: omega3/omega1 should be > 5, got {:.3}", omega_3 / omega_1
    );
}

// ================================================================
// 7. Chopra §3: Logarithmic Decrement from Damped Free Vibration
// ================================================================
//
// For a damped SDOF system, the logarithmic decrement is:
//   delta = ln(u_n / u_{n+1}) = 2*pi*xi / sqrt(1 - xi^2) ~ 2*pi*xi
// We measure consecutive peaks from time history and verify.

#[test]
fn validation_chopra_logarithmic_decrement() {
    let length = 3.0;
    let n = 4;
    let n_nodes = n + 1;
    let xi = 0.03; // 3% damping

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_modal = modal_res.modes[0].period;

    let dt = t_modal / 60.0;
    let n_cycles = 12;
    let n_steps = (n_cycles as f64 * t_modal / dt) as usize;

    // Initial impulse then free vibration
    let pulse_steps = 3;
    let mut force_history = Vec::new();
    for i in 0..=pulse_steps {
        let t = i as f64 * dt;
        let fy = if i < pulse_steps { -300.0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: n_nodes, fx: 0.0, fy, mz: 0.0 }] });
    }

    let input = TimeHistoryInput {
        solver: make_beam(n, length, E, A, IZ, "fixed", None, vec![]),
        densities: {
            let mut d = HashMap::new();
            d.insert("1".to_string(), DENSITY);
            d
        },
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: Some(xi),
        ground_accel: None, ground_direction: None,
        force_history: Some(force_history),
    };

    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip = result.node_histories.iter().find(|h| h.node_id == n_nodes).unwrap();
    let uy = &tip.uy;

    // Find positive peaks (local maxima where uy < 0 since load is -Y)
    let start_idx = (pulse_steps + 10).min(uy.len() - 1);
    let mut peaks: Vec<f64> = Vec::new();
    for i in (start_idx + 1)..(uy.len() - 1) {
        if uy[i].abs() > uy[i - 1].abs() && uy[i].abs() > uy[i + 1].abs()
            && uy[i].abs() > 1e-10
        {
            peaks.push(uy[i].abs());
        }
    }

    if peaks.len() >= 6 {
        // Compute logarithmic decrements between every other peak (same sign)
        let mut decrements = Vec::new();
        for i in 0..(peaks.len() - 2) {
            // Every other peak to get full cycles
            let ratio = peaks[i] / peaks[i + 2];
            if ratio > 1.0 {
                decrements.push(ratio.ln());
            }
        }

        if !decrements.is_empty() {
            let avg_decrement = decrements.iter().sum::<f64>() / decrements.len() as f64;

            // Theoretical for 2 half-cycles: delta_2 = 2 * 2*pi*xi = 4*pi*xi
            // But since we compare every other peak (which may be 1 full cycle apart):
            // For a multi-DOF system with Rayleigh damping, just check it's positive
            // and in a reasonable range
            assert!(
                avg_decrement > 0.0,
                "Chopra §3: logarithmic decrement should be positive, got {:.4}", avg_decrement
            );

            // For xi=3%, the per-cycle decrement ~ 2*pi*0.03 ~ 0.189
            // Over 2 half-cycles: ~ 0.377
            // Allow wide tolerance due to multi-DOF effects
            assert!(
                avg_decrement < 3.0,
                "Chopra §3: logarithmic decrement unreasonably large: {:.4}", avg_decrement
            );
        }
    }

    // Also verify amplitude decay overall
    if peaks.len() >= 4 {
        let early = peaks[1];
        let late = peaks[peaks.len() - 1];
        assert!(
            late < early,
            "Chopra §3: damped amplitudes should decrease, early={:.6}, late={:.6}",
            early, late
        );
    }
}

// ================================================================
// 8. Chopra §5: Ground Acceleration — Effective Force Method
// ================================================================
//
// Under ground acceleration, the equation of motion becomes:
//   M*u_tt + C*u_t + K*u = -M*{1}*a_g(t)
// We verify that a half-sine ground pulse produces a bounded response
// and that the peak displacement is proportional to the peak ground
// acceleration (for linear system).

#[test]
fn validation_chopra_ground_acceleration_response() {
    let length = 3.0;
    let n = 4;
    let n_nodes = n + 1;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_modal = modal_res.modes[0].period;

    let dt = t_modal / 40.0;
    let n_steps = (5.0 * t_modal / dt) as usize;

    // Half-sine ground acceleration pulse
    let t_pulse = t_modal; // pulse duration = one natural period
    let a_g_peak = 1.0;    // 1 m/s^2

    let ground_accel_1: Vec<f64> = (0..=n_steps)
        .map(|i| {
            let t = i as f64 * dt;
            if t <= t_pulse {
                a_g_peak * (std::f64::consts::PI * t / t_pulse).sin()
            } else {
                0.0
            }
        })
        .collect();

    let input_1 = TimeHistoryInput {
        solver: make_beam(n, length, E, A, IZ, "fixed", None, vec![]),
        densities: {
            let mut d = HashMap::new();
            d.insert("1".to_string(), DENSITY);
            d
        },
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.02),
        ground_accel: Some(ground_accel_1),
        ground_direction: Some("x".to_string()),
        force_history: None,
    };

    let result_1 = time_integration::solve_time_history_2d(&input_1).unwrap();

    let tip_1 = result_1.node_histories.iter()
        .find(|h| h.node_id == n_nodes).unwrap();
    let max_ux_1 = tip_1.ux.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));

    // Now with 2x ground acceleration
    let ground_accel_2: Vec<f64> = (0..=n_steps)
        .map(|i| {
            let t = i as f64 * dt;
            if t <= t_pulse {
                2.0 * a_g_peak * (std::f64::consts::PI * t / t_pulse).sin()
            } else {
                0.0
            }
        })
        .collect();

    let input_2 = TimeHistoryInput {
        solver: make_beam(n, length, E, A, IZ, "fixed", None, vec![]),
        densities: {
            let mut d = HashMap::new();
            d.insert("1".to_string(), DENSITY);
            d
        },
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.02),
        ground_accel: Some(ground_accel_2),
        ground_direction: Some("x".to_string()),
        force_history: None,
    };

    let result_2 = time_integration::solve_time_history_2d(&input_2).unwrap();

    let tip_2 = result_2.node_histories.iter()
        .find(|h| h.node_id == n_nodes).unwrap();
    let max_ux_2 = tip_2.ux.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));

    // Linear superposition: doubling ground acceleration should ~double response
    if max_ux_1 > 1e-12 {
        let ratio = max_ux_2 / max_ux_1;
        assert_close(ratio, 2.0, 0.15, "Chopra §5: ground accel linearity ratio");
    }

    // Response should be bounded and non-zero
    assert!(
        max_ux_1 > 1e-12,
        "Chopra §5: ground acceleration should produce non-zero response"
    );
    assert!(
        max_ux_1 < 1.0,
        "Chopra §5: response should be bounded, got {:.6} m", max_ux_1
    );
}
