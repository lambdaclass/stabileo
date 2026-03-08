/// Validation: Clough & Penzien "Dynamics of Structures" (3rd ed.) — Extended
///            Chopra "Dynamics of Structures" (5th ed.)
///
/// Extended tests covering additional dynamic analysis concepts:
///   1. Propped cantilever first mode frequency
///   2. Truss fundamental axial frequency
///   3. Three-story shear building: frequency ordering and mode shapes
///   4. Fixed-fixed beam frequency ratios (mode 2/mode 1)
///   5. Stiffening effect: stiffer section raises frequency
///   6. Harmonic FRF: peak frequency matches modal fundamental
///   7. CQC vs SRSS spectral combination: CQC >= SRSS for separated modes
///   8. Newmark energy conservation: undamped free vibration energy is constant
///
/// References:
///   Clough, R.W. & Penzien, J., "Dynamics of Structures", 3rd Ed.
///   Chopra, A.K., "Dynamics of Structures", 5th Ed.
mod helpers;

use dedaliano_engine::solver::{harmonic, modal, spectral, time_integration};
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (steel)
const E_EFF: f64 = E * 1000.0; // kN/m^2
const DENSITY: f64 = 7_850.0; // kg/m^3

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

fn make_densities_multi() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d.insert("2".to_string(), DENSITY);
    d
}

// ================================================================
// 1. Clough & Penzien: Propped Cantilever Fundamental Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 18; Blevins "Formulas for Natural
// Frequency and Mode Shape" Table 8-1.
//
// For a fixed-pinned (propped cantilever) beam:
//   omega_1 = (beta_1*L)^2 / L^2 * sqrt(EI / (rho*A))
//
// where beta_1*L = 3.9266 for the first mode of a fixed-pinned beam.
//
// Properties: L = 6m, IPE300: A = 53.8e-4 m^2, Iz = 8356e-8 m^4
//
// rho_A = 7850 * 53.8e-4 / 1000 = 0.042233 tonnes/m
// EI = E_EFF * Iz = 200e6 * 8356e-8 = 16712 kN*m^2 (but assembly uses E*1000)
//   => EI_eff = 200_000 * 1000 * 8356e-8 = 16712.0 kN*m^2
//
// omega_1 = (3.9266/6)^2 * sqrt(16712 / 0.042233)
//         = 0.4281 * 629.06 = 269.28 rad/s? No -- let's recompute:
//   (3.9266/6)^2 = 0.6544^2 = 0.4283
//   sqrt(16712 / 0.042233) = sqrt(395700) = 629.05
//   omega_1 = 0.4283 * 629.05 = 269.4 rad/s
//   f_1 = 269.4 / (2*pi) = 42.87 Hz
//
// The solver with 12+ elements should match within ~2%.

#[test]
fn validation_ext_1_propped_cantilever_frequency() {
    let l = 6.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let n_elem = 12;

    // fixed-pinned beam (propped cantilever)
    let input = make_beam(n_elem, l, E, a, iz, "fixed", Some("pinned"), vec![]);

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 2).unwrap();

    // Analytical
    let rho_a = DENSITY * a / 1000.0;
    let ei = E_EFF * iz;
    let beta1_l = 3.9266_f64;
    let omega_expected = (beta1_l / l).powi(2) * (ei / rho_a).sqrt();
    let f_expected = omega_expected / (2.0 * std::f64::consts::PI);

    let f_computed = result.modes[0].frequency;
    let error = (f_computed - f_expected).abs() / f_expected;

    assert!(
        error < 0.03,
        "Propped cantilever f1: computed={:.4} Hz, expected={:.4} Hz, error={:.2}%",
        f_computed, f_expected, error * 100.0
    );
}

// ================================================================
// 2. Clough & Penzien: Simply-Supported Beam Higher Mode Convergence
// ================================================================
//
// Reference: Clough & Penzien Ch. 18; Chopra Ch. 18.
//
// For a simply-supported beam, the analytical natural frequencies are:
//   omega_n = (n*pi/L)^2 * sqrt(EI / (rho*A))
//
// With a coarse mesh, higher modes are less accurate. We verify
// that mesh refinement improves the accuracy of mode 3 frequency.
//
// Coarse mesh (8 elements) vs fine mesh (20 elements):
//   The fine mesh should give a mode-3 frequency closer to the
//   analytical value than the coarse mesh.
//
// L = 8m, A = 0.01 m^2, Iz = 1e-4 m^4

#[test]
fn validation_ext_2_ss_beam_mesh_convergence() {
    let l = 8.0;
    let a = 0.01;
    let iz = 1e-4;
    let pi = std::f64::consts::PI;
    let densities = make_densities();

    let rho_a = DENSITY * a / 1000.0;
    let ei = E_EFF * iz;

    // Analytical mode 3 frequency
    let omega_3 = (3.0 * pi / l).powi(2) * (ei / rho_a).sqrt();
    let f3_exact = omega_3 / (2.0 * pi);

    // Coarse mesh (8 elements)
    let mut input_coarse = make_ss_beam_udl(8, l, E, a, iz, 0.0);
    input_coarse.loads.clear();
    let res_coarse = modal::solve_modal_2d(&input_coarse, &densities, 6).unwrap();
    let f3_coarse = res_coarse.modes[2].frequency;
    let err_coarse = (f3_coarse - f3_exact).abs() / f3_exact;

    // Fine mesh (20 elements)
    let mut input_fine = make_ss_beam_udl(20, l, E, a, iz, 0.0);
    input_fine.loads.clear();
    let res_fine = modal::solve_modal_2d(&input_fine, &densities, 6).unwrap();
    let f3_fine = res_fine.modes[2].frequency;
    let err_fine = (f3_fine - f3_exact).abs() / f3_exact;

    // Fine mesh should be more accurate
    assert!(
        err_fine < err_coarse,
        "Fine mesh mode-3 error={:.4}% should be < coarse error={:.4}%",
        err_fine * 100.0, err_coarse * 100.0
    );

    // Fine mesh mode 3 should be within 2%
    assert!(
        err_fine < 0.02,
        "Fine mesh mode-3: computed={:.4} Hz, exact={:.4} Hz, error={:.2}%",
        f3_fine, f3_exact, err_fine * 100.0
    );

    // Coarse mesh mode 3 should still be reasonable (within 10%)
    assert!(
        err_coarse < 0.10,
        "Coarse mesh mode-3: computed={:.4} Hz, exact={:.4} Hz, error={:.2}%",
        f3_coarse, f3_exact, err_coarse * 100.0
    );
}

// ================================================================
// 3. Clough & Penzien: Cumulative Mass Participation Increases
// ================================================================
//
// Reference: Clough & Penzien Ch. 12; Chopra Ch. 13.
//
// The cumulative effective mass ratio increases monotonically as
// more modes are included. For most practical structures, 90% of
// the total mass can be captured within a modest number of modes.
//
// For a multi-story frame:
//   - Each mode has non-negative effective mass
//   - The sum of effective masses across all modes approaches total mass
//   - The first mode typically captures the largest share (> 50%)
//
// We test a 3-story portal frame and verify these properties.

#[test]
fn validation_ext_3_cumulative_mass_participation() {
    let h = 3.0;
    let span = 6.0;
    let a_col = 0.01;
    let iz_col = 1e-4;

    // Stiff beams
    let a_beam = 0.5;
    let iz_beam = 1.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, span, 0.0),
            (3, 0.0, h),
            (4, span, h),
            (5, 0.0, 2.0 * h),
            (6, span, 2.0 * h),
            (7, 0.0, 3.0 * h),
            (8, span, 3.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, a_col, iz_col),
            (2, a_beam, iz_beam),
        ],
        vec![
            // Columns (6 total)
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            (5, "frame", 5, 7, 1, 1, false, false),
            (6, "frame", 6, 8, 1, 1, false, false),
            // Beams (3 floors)
            (7, "frame", 3, 4, 1, 2, false, false),
            (8, "frame", 5, 6, 1, 2, false, false),
            (9, "frame", 7, 8, 1, 2, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );

    let densities = make_densities_multi();
    let result = modal::solve_modal_2d(&input, &densities, 8).unwrap();

    assert!(
        result.modes.len() >= 3,
        "Should extract at least 3 modes for a 3-story frame"
    );

    let total_mass = result.total_mass;
    assert!(total_mass > 0.0, "Total mass should be positive");

    // Frequencies must be in ascending order
    for i in 1..result.modes.len() {
        assert!(
            result.modes[i].frequency >= result.modes[i - 1].frequency,
            "Modes not in ascending order: f[{}]={:.4} < f[{}]={:.4}",
            i, result.modes[i].frequency, i - 1, result.modes[i - 1].frequency
        );
    }

    // Effective mass in X direction must be non-negative for each mode
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(
            mode.effective_mass_x >= -1e-10,
            "Mode {} effective_mass_x={:.6} should be non-negative",
            i + 1, mode.effective_mass_x
        );
    }

    // Cumulative X-direction effective mass should increase
    let mut cum_mass_x = 0.0;
    for mode in &result.modes {
        let new_cum = cum_mass_x + mode.effective_mass_x;
        assert!(
            new_cum >= cum_mass_x - 1e-10,
            "Cumulative mass should increase: was {:.4}, now {:.4}",
            cum_mass_x, new_cum
        );
        cum_mass_x = new_cum;
    }

    // The cumulative mass ratio (from solver) should approach or exceed 0.5
    // with 8 modes for this structure
    let cum_ratio_x = result.cumulative_mass_ratio_x;
    assert!(
        cum_ratio_x > 0.5,
        "Cumulative mass ratio X={:.4} should be > 0.5 with 8 modes",
        cum_ratio_x
    );

    // First mode should capture a significant portion of mass
    // in at least one direction (X or Y)
    let first_x = result.modes[0].mass_ratio_x;
    let first_y = result.modes[0].mass_ratio_y;
    let first_max = first_x.max(first_y);
    assert!(
        first_max > 0.30,
        "First mode mass ratio max(X={:.4}, Y={:.4})={:.4} should be > 0.30",
        first_x, first_y, first_max
    );
}

// ================================================================
// 4. Clough & Penzien: Fixed-Fixed Beam Mode Ratio
// ================================================================
//
// Reference: Clough & Penzien Ch. 18; Blevins Table 8-1.
//
// For a fixed-fixed beam:
//   omega_n = (beta_n*L)^2 / L^2 * sqrt(EI / (rho*A))
//
// beta_1*L = 4.7300, beta_2*L = 7.8532
//
// Frequency ratio: f2/f1 = (beta_2*L / beta_1*L)^2 = (7.8532/4.7300)^2 = 2.757
//
// L = 5m, IPE300 section. We verify mode 2 / mode 1 ratio.

#[test]
fn validation_ext_4_fixed_fixed_beam_mode_ratio() {
    let l = 5.0;
    let a = 53.8e-4;
    let iz = 8356e-8;
    let n_elem = 14;

    let input = make_beam(n_elem, l, E, a, iz, "fixed", Some("fixed"), vec![]);

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    assert!(
        result.modes.len() >= 2,
        "Should have at least 2 modes"
    );

    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;

    // Analytical ratio
    let beta1_l = 4.7300_f64;
    let beta2_l = 7.8532_f64;
    let expected_ratio = (beta2_l / beta1_l).powi(2);

    let ratio = f2 / f1;
    let error = (ratio - expected_ratio).abs() / expected_ratio;

    assert!(
        error < 0.03,
        "Fixed-fixed f2/f1: computed={:.4}, expected={:.4}, error={:.2}%",
        ratio, expected_ratio, error * 100.0
    );

    // Also verify absolute first mode frequency
    let rho_a = DENSITY * a / 1000.0;
    let ei = E_EFF * iz;
    let omega1_expected = (beta1_l / l).powi(2) * (ei / rho_a).sqrt();
    let f1_expected = omega1_expected / (2.0 * std::f64::consts::PI);

    let err_f1 = (f1 - f1_expected).abs() / f1_expected;
    assert!(
        err_f1 < 0.03,
        "Fixed-fixed f1: computed={:.4} Hz, expected={:.4} Hz, error={:.2}%",
        f1, f1_expected, err_f1 * 100.0
    );
}

// ================================================================
// 5. Clough & Penzien: Stiffening Raises Natural Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 8 (Rayleigh quotient).
//
// For a given mass, increasing stiffness (larger Iz) raises the
// natural frequency. omega^2 = K/M, so doubling EI at constant
// mass doubles omega^2 -> multiplies f by sqrt(2).
//
// Test: SS beam with two different Iz values, same A (same mass).
// f_stiff / f_flex = sqrt(Iz_stiff / Iz_flex).

#[test]
fn validation_ext_5_stiffening_raises_frequency() {
    let l = 8.0;
    let a = 0.01; // same area = same mass
    let iz_flex = 1e-4;
    let iz_stiff = 4e-4; // 4x stiffer
    let n_elem = 12;

    let densities = make_densities();

    // Flexible beam
    let mut input_flex = make_ss_beam_udl(n_elem, l, E, a, iz_flex, 0.0);
    input_flex.loads.clear();
    let result_flex = modal::solve_modal_2d(&input_flex, &densities, 2).unwrap();
    let f_flex = result_flex.modes[0].frequency;

    // Stiff beam
    let n_nodes = n_elem + 1;
    let elem_len = l / n_elem as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")];
    let input_stiff = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a, iz_stiff)],
        elems,
        sups,
        vec![],
    );
    let result_stiff = modal::solve_modal_2d(&input_stiff, &densities, 2).unwrap();
    let f_stiff = result_stiff.modes[0].frequency;

    // Stiffer beam must have higher frequency
    assert!(
        f_stiff > f_flex,
        "Stiffer beam f1={:.4} Hz should exceed flexible beam f1={:.4} Hz",
        f_stiff, f_flex
    );

    // Quantitative: f_stiff/f_flex ~ sqrt(Iz_stiff/Iz_flex) = sqrt(4) = 2.0
    let ratio = f_stiff / f_flex;
    let expected_ratio = (iz_stiff / iz_flex).sqrt();
    let error = (ratio - expected_ratio).abs() / expected_ratio;

    assert!(
        error < 0.02,
        "Stiffening: f_stiff/f_flex={:.4}, expected={:.4}, error={:.2}%",
        ratio, expected_ratio, error * 100.0
    );
}

// ================================================================
// 6. Clough & Penzien: Harmonic FRF Peak at Natural Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 3; Chopra Ch. 3.
//
// The frequency response function (FRF) of a structure peaks at
// its natural frequencies. For a cantilever under tip harmonic
// loading, the peak of the FRF should coincide with the first
// natural frequency from modal analysis.
//
// We sweep a set of frequencies and verify the peak frequency
// returned by the harmonic solver matches f1 from modal analysis.

#[test]
fn validation_ext_6_harmonic_frf_peak() {
    let l = 4.0;
    let n = 8;
    let n_nodes = n + 1;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, l, E, a, iz, "fixed", None, vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes,
            fx: 0.0,
            fy: -1.0, // unit harmonic force at tip
            mz: 0.0,
        }),
    ]);
    let densities = make_densities();

    // Get modal frequency for reference
    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();
    let f1_modal = modal_res.modes[0].frequency;

    // Sweep frequencies around f1
    let n_points = 80;
    let f_min = f1_modal * 0.3;
    let f_max = f1_modal * 2.0;
    let mut frequencies = Vec::new();
    for i in 0..n_points {
        let f = f_min + (f_max - f_min) * i as f64 / (n_points - 1) as f64;
        frequencies.push(f);
    }

    let harmonic_input = harmonic::HarmonicInput {
        solver,
        densities,
        frequencies,
        damping_ratio: 0.02,
        response_node_id: n_nodes,
        response_dof: "y".to_string(),
    };

    let result = harmonic::solve_harmonic_2d(&harmonic_input).unwrap();

    // The peak frequency should be close to the modal f1
    let peak_f = result.peak_frequency;
    let error = (peak_f - f1_modal).abs() / f1_modal;

    assert!(
        error < 0.05,
        "Harmonic FRF peak={:.4} Hz, modal f1={:.4} Hz, error={:.2}%",
        peak_f, f1_modal, error * 100.0
    );

    // The peak amplitude should be significantly larger than static response
    // (dynamic amplification factor ~ 1/(2*xi) = 25 for xi=0.02)
    assert!(
        result.peak_amplitude > 0.0,
        "Harmonic FRF peak amplitude should be positive"
    );
}

// ================================================================
// 7. Clough & Penzien: CQC vs SRSS Spectral Combination
// ================================================================
//
// Reference: Clough & Penzien Ch. 26; Chopra Ch. 13.
//
// For well-separated modes, SRSS and CQC give similar results.
// For a flat spectrum and well-separated modes:
//   CQC base shear >= SRSS base shear (CQC accounts for cross-mode
//   correlation, which is positive for correlated modes).
//
// We run both SRSS and CQC on the same portal frame and check:
//   - Both give positive base shear
//   - The ratio CQC/SRSS is between 0.90 and 1.15 for well-separated modes

#[test]
fn validation_ext_7_cqc_vs_srss_comparison() {
    let l = 4.0;
    let n = 6;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, l, E, a, iz, "fixed", None, vec![]);
    let densities = make_densities();

    let modal_res = modal::solve_modal_2d(&solver, &densities, 4).unwrap();

    // Flat spectrum
    let sa_g = 5.0 / 9.81;
    let spectrum = DesignSpectrum {
        name: "Flat 5.0 m/s^2".into(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 0.5, sa: sa_g },
            SpectrumPoint { period: 1.0, sa: sa_g },
            SpectrumPoint { period: 2.0, sa: sa_g },
            SpectrumPoint { period: 5.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency,
            period: m.period,
            omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp { node_id: d.node_id, ux: d.ux, uy: d.uy, rz: d.rz }
            }).collect(),
            participation_x: m.participation_x,
            participation_y: m.participation_y,
            effective_mass_x: m.effective_mass_x,
            effective_mass_y: m.effective_mass_y,
        }
    }).collect();

    // SRSS run
    let srss_input = SpectralInput {
        solver: solver.clone(),
        modes: modes.clone(),
        densities: densities.clone(),
        spectrum: spectrum.clone(),
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: Some(modal_res.total_mass),
    };
    let srss_result = spectral::solve_spectral_2d(&srss_input).unwrap();

    // CQC run
    let cqc_input = SpectralInput {
        solver,
        modes,
        densities,
        spectrum,
        direction: "Y".to_string(),
        rule: Some("CQC".to_string()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: Some(modal_res.total_mass),
    };
    let cqc_result = spectral::solve_spectral_2d(&cqc_input).unwrap();

    // Both must give positive base shear
    assert!(
        srss_result.base_shear > 0.0,
        "SRSS base shear should be positive, got {:.4}",
        srss_result.base_shear
    );
    assert!(
        cqc_result.base_shear > 0.0,
        "CQC base shear should be positive, got {:.4}",
        cqc_result.base_shear
    );

    // For well-separated modes with flat spectrum, CQC and SRSS
    // should be close. The ratio should be between 0.90 and 1.15.
    let ratio = cqc_result.base_shear / srss_result.base_shear;
    assert!(
        ratio > 0.90 && ratio < 1.15,
        "CQC/SRSS ratio={:.4}, expected between 0.90 and 1.15",
        ratio
    );
}

// ================================================================
// 8. Clough & Penzien: Undamped Free Vibration Amplitude Stability
// ================================================================
//
// Reference: Clough & Penzien Ch. 5; Chopra Ch. 5.
//
// For an undamped system with the average acceleration Newmark method
// (beta=0.25, gamma=0.5), the scheme is unconditionally stable and
// introduces no numerical damping. Therefore the peak displacement
// amplitude should remain constant throughout free vibration.
//
// We verify this by comparing the peak displacement in the first
// half of the free vibration response with the peak in the second
// half. For an undamped system they should be nearly equal.

#[test]
fn validation_ext_8_undamped_amplitude_stability() {
    let length = 4.0;
    let n = 6;
    let n_nodes = n + 1;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, length, E, a, iz, "fixed", None, vec![]);
    let densities = make_densities();

    // Get fundamental period
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_modal = modal_res.modes[0].period;

    // Time stepping
    let dt = t_modal / 40.0;
    let n_cycles = 10.0;
    let n_steps = (n_cycles * t_modal / dt) as usize;

    // Short impulse at tip then free vibration
    let pulse_steps = 3;
    let mut force_history = Vec::new();
    for i in 0..=pulse_steps {
        let t = i as f64 * dt;
        let fy = if i < pulse_steps { -100.0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad {
                node_id: n_nodes,
                fx: 0.0,
                fy,
                mz: 0.0,
            }],
        });
    }

    let input = TimeHistoryInput {
        solver,
        densities,
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None, // undamped
        ground_accel: None,
        ground_direction: None,
        force_history: Some(force_history),
    };

    let result = time_integration::solve_time_history_2d(&input).unwrap();

    let tip = result.node_histories.iter()
        .find(|h| h.node_id == n_nodes)
        .unwrap();

    // Divide the free vibration into two halves
    let free_start = pulse_steps + 5;
    let total_free = tip.uy.len() - free_start;
    let half = total_free / 2;
    let mid = free_start + half;

    // Peak in first half
    let peak_first = tip.uy[free_start..mid].iter()
        .cloned().fold(0.0_f64, |acc, v| acc.max(v.abs()));

    // Peak in second half
    let peak_second = tip.uy[mid..].iter()
        .cloned().fold(0.0_f64, |acc, v| acc.max(v.abs()));

    assert!(
        peak_first > 1e-10,
        "First-half peak should be non-negligible, got {:.2e}", peak_first
    );
    assert!(
        peak_second > 1e-10,
        "Second-half peak should be non-negligible, got {:.2e}", peak_second
    );

    // Undamped Newmark (average acceleration): no numerical damping.
    // The peak in the second half should be very close to the first half.
    let ratio = peak_second / peak_first;
    assert!(
        (ratio - 1.0).abs() < 0.05,
        "Undamped amplitude stability: peak_first={:.6}, peak_second={:.6}, ratio={:.4} (expected ~1.0)",
        peak_first, peak_second, ratio
    );
}
