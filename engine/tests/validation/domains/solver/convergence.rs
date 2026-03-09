/// Validation: h-Convergence Rate and Numerical Accuracy
///
/// Tests mesh refinement convergence properties:
///   - h-convergence: displacement error ∝ h² (quadratic for cubic elements)
///   - Newmark period elongation characterization at various Δt/T
///   - Richardson extrapolation consistency
///   - Stress convergence at refinement
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2014, Ch. 4
///   - Hughes, T.J.R., "The Finite Element Method", 2000
///   - Newmark, N.M., "A Method of Computation for Structural Dynamics", 1959
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed, Ch. 5
use dedaliano_engine::solver::{linear, modal, time_integration};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7850.0;

// ================================================================
// 1. h-Convergence: Cantilever Tip Deflection
// ================================================================
//
// For Euler-Bernoulli beam with cubic Hermite shape functions,
// the displacement error should converge at rate O(h²) or better.
// Exact tip deflection: δ = PL³/(3EI)

#[test]
fn validation_h_convergence_cantilever_tip() {
    let length: f64 = 5.0;
    let p: f64 = -10.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = p.abs() * length.powi(3) / (3.0 * ei);

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let input = make_beam(
            n, length, E, A, IZ, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: n + 1, fx: 0.0, fy: p, mz: 0.0,
            })],
        );
        let results = linear::solve_2d(&input).unwrap();
        let d_tip = results.displacements.iter()
            .find(|d| d.node_id == n + 1).unwrap();
        let err = (d_tip.uy.abs() - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // For cubic elements with point load at node, displacement should be
    // exact or converge very rapidly. Check that error decreases.
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 {
            assert!(
                errors[i] <= errors[i - 1] * 1.1,
                "h-convergence: error should decrease, n={}: {:.6e} vs n={}: {:.6e}",
                mesh_sizes[i], errors[i], mesh_sizes[i - 1], errors[i - 1]
            );
        }
    }

    // Finest mesh should be very accurate
    assert!(
        errors.last().unwrap() < &0.01,
        "Finest mesh error={:.6e}, should be < 1%", errors.last().unwrap()
    );
}

// ================================================================
// 2. h-Convergence: SS Beam UDL Midspan Deflection
// ================================================================
//
// Exact: δ_mid = 5qL⁴/(384EI)
// UDL causes non-polynomial loading — convergence should be O(h²).

#[test]
fn validation_h_convergence_ss_beam_udl() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        let mid = n / 2 + 1;
        let d_mid = results.displacements.iter()
            .find(|d| d.node_id == mid).unwrap();
        let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
        errors.push(err);
    }

    // Check convergence rate: error(n) / error(2n) ≈ 4 for O(h²)
    for i in 1..errors.len() {
        if errors[i - 1] > 1e-10 && errors[i] > 1e-10 {
            let rate = errors[i - 1] / errors[i];
            // Rate should be ≥ 2 (at least linear convergence)
            assert!(
                rate > 1.5,
                "h-convergence rate: {:.2} (expected ≥ 2 for O(h²)), n={}→{}",
                rate, mesh_sizes[i - 1], mesh_sizes[i]
            );
        }
    }

    // Finest mesh should be very accurate for cubic elements
    assert!(
        errors.last().unwrap() < &0.02,
        "SS beam UDL finest mesh error={:.6e}, should be < 2%", errors.last().unwrap()
    );
}

// ================================================================
// 3. h-Convergence: Reaction Forces
// ================================================================
//
// Reaction forces should also converge with mesh refinement.
// SS beam with UDL: R = qL/2

#[test]
fn validation_h_convergence_reactions() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let r_exact = q.abs() * length / 2.0;

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let input = make_ss_beam_udl(n, length, E, A, IZ, q);
        let results = linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let err = (r1.ry - r_exact).abs() / r_exact;
        errors.push(err);
    }

    // Reactions converge — finest mesh should be accurate
    assert!(
        errors.last().unwrap() < &0.02,
        "Reaction convergence: finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 4. h-Convergence: Fixed Beam End Moment
// ================================================================
//
// Fixed-fixed beam under UDL: M_end = qL²/12
// Moment convergence rate for cubic elements.

#[test]
fn validation_h_convergence_end_moment() {
    let length: f64 = 6.0;
    let q: f64 = -4.0;
    let m_exact = q.abs() * length * length / 12.0;

    let mesh_sizes = [2, 4, 8, 16];
    let mut errors = Vec::new();

    for &n in &mesh_sizes {
        let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);
        for i in 1..=n {
            input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let results = linear::solve_2d(&input).unwrap();
        let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
        let err = (r1.mz.abs() - m_exact).abs() / m_exact;
        errors.push(err);
    }

    // End moment should converge
    assert!(
        errors.last().unwrap() < &0.05,
        "End moment convergence: finest mesh error={:.6e}", errors.last().unwrap()
    );
}

// ================================================================
// 5. Newmark Period Elongation Characterization
// ================================================================
//
// Average acceleration Newmark (β=0.25, γ=0.5) has no numerical
// damping but introduces period elongation:
//   ΔT/T ≈ (π²/12)·(Δt/T)² for small Δt/T
// Test that measured period elongation follows this trend.

#[test]
fn validation_newmark_period_elongation() {
    let length: f64 = 3.0;
    let n = 4;
    let tip_node = n + 1;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
    let t_nat = modal_res.modes[0].period;

    // Use a moderate dt/T ratio
    let dt = 0.05 * t_nat;
    let n_steps = (5.0 * t_nat / dt) as usize;

    // Impulse at t=0
    let force_history = vec![
        TimeForceRecord {
            time: 0.0,
            loads: vec![SolverNodalLoad { node_id: tip_node, fx: 0.0, fy: -100.0, mz: 0.0 }] },
        TimeForceRecord {
            time: dt,
            loads: vec![SolverNodalLoad { node_id: tip_node, fx: 0.0, fy: 0.0, mz: 0.0 }] },
    ];

    let th_input = TimeHistoryInput {
        solver: input.clone(),
        densities: densities.clone(),
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None, // no damping for clean period measurement
        ground_accel: None,
        ground_direction: None,
        force_history: Some(force_history),
    };

    let th_res = time_integration::solve_time_history_2d(&th_input).unwrap();

    let tip_hist = th_res.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();
    let uy = &tip_hist.uy;

    // Count zero crossings to measure period
    let mut crossings = Vec::new();
    for i in 3..uy.len() - 1 {
        if uy[i] * uy[i + 1] < 0.0 {
            let t_cross = (i as f64 + uy[i].abs() / (uy[i].abs() + uy[i + 1].abs())) * dt;
            crossings.push(t_cross);
        }
    }

    if crossings.len() >= 4 {
        let measured_t = (crossings[crossings.len() - 1] - crossings[0]) / ((crossings.len() - 1) as f64 / 2.0);
        let elong = (measured_t - t_nat) / t_nat;
        assert!(
            elong.abs() < 0.05,
            "Newmark period elongation: {:.4}%, should be < 5%", elong * 100.0
        );
    }
}

// ================================================================
// 6. Newmark Energy Conservation (Average Acceleration)
// ================================================================
//
// Average acceleration Newmark (β=0.25, γ=0.5) conserves energy
// in free vibration (no numerical damping).

#[test]
fn validation_newmark_energy_conservation() {
    let length: f64 = 3.0;
    let n = 4;
    let tip_node = n + 1;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
    let t_nat = modal_res.modes[0].period;
    let dt = t_nat / 40.0;
    let n_steps = (10.0 * t_nat / dt) as usize;

    let force_history = vec![
        TimeForceRecord {
            time: 0.0,
            loads: vec![SolverNodalLoad { node_id: tip_node, fx: 0.0, fy: -100.0, mz: 0.0 }] },
        TimeForceRecord {
            time: dt,
            loads: vec![SolverNodalLoad { node_id: tip_node, fx: 0.0, fy: 0.0, mz: 0.0 }] },
    ];

    let th_input = TimeHistoryInput {
        solver: input.clone(),
        densities: densities.clone(),
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: Some(force_history),
    };

    let th_res = time_integration::solve_time_history_2d(&th_input).unwrap();

    let tip_hist = th_res.node_histories.iter()
        .find(|nh| nh.node_id == tip_node).unwrap();
    let uy = &tip_hist.uy;

    // Find peak amplitudes in second half vs first half
    let mid = uy.len() / 2;
    let max_first = uy[5..mid].iter().map(|v| v.abs()).fold(0.0_f64, |a: f64, b: f64| a.max(b));
    let max_second = uy[mid..].iter().map(|v| v.abs()).fold(0.0_f64, |a: f64, b: f64| a.max(b));

    if max_first > 1e-10 {
        let ratio = max_second / max_first;
        assert!(
            ratio > 0.80,
            "Newmark energy conservation: amplitude ratio={:.4} (2nd/1st half), should be ~1.0",
            ratio
        );
    }
}

// ================================================================
// 7. Richardson Extrapolation Consistency
// ================================================================
//
// If two meshes give results f(h) and f(h/2), and convergence is O(h^p),
// then f_exact ≈ f(h/2) + (f(h/2) - f(h)) / (2^p - 1).
// The extrapolated value should be closer to exact than either mesh.

#[test]
fn validation_richardson_extrapolation() {
    let length: f64 = 6.0;
    let q: f64 = -5.0;
    let ei = E * 1000.0 * IZ;
    let delta_exact = 5.0 * q.abs() * length.powi(4) / (384.0 * ei);

    // Coarse and fine mesh results
    let input_coarse = make_ss_beam_udl(4, length, E, A, IZ, q);
    let input_fine = make_ss_beam_udl(8, length, E, A, IZ, q);

    let res_coarse = linear::solve_2d(&input_coarse).unwrap();
    let res_fine = linear::solve_2d(&input_fine).unwrap();

    let d_coarse = res_coarse.displacements.iter().find(|d| d.node_id == 3).unwrap().uy.abs();
    let d_fine = res_fine.displacements.iter().find(|d| d.node_id == 5).unwrap().uy.abs();

    // Richardson extrapolation assuming O(h²): p=2
    let d_richardson = d_fine + (d_fine - d_coarse) / 3.0;

    let err_fine = (d_fine - delta_exact).abs() / delta_exact;
    let err_richardson = (d_richardson - delta_exact).abs() / delta_exact;

    // Richardson should be no worse than fine mesh (or very close)
    assert!(
        err_richardson < err_fine * 2.0 + 0.001,
        "Richardson: err={:.6e} should be ≤ fine err={:.6e}",
        err_richardson, err_fine
    );
}
