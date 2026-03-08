/// Validation: Clough & Penzien "Dynamics of Structures" (3rd ed.)
///            Chopra "Dynamics of Structures" (5th ed.)
///
/// Tests fundamental dynamic analysis concepts:
///   1. Cantilever fundamental frequency (beta_1*L = 1.8751)
///   2. SS beam first 3 natural frequencies
///   3. Portal frame sway frequency
///   4. Two-story shear building modal frequencies
///   5. Rayleigh quotient: added mass lowers frequency
///   6. Newmark time history: free vibration period matches modal
///   7. Spectral response: base shear = m * Sa for SDOF
///   8. Damping effect: damped peak < undamped peak
///
/// References:
///   Clough, R.W. & Penzien, J., "Dynamics of Structures", 3rd Ed.
///   Chopra, A.K., "Dynamics of Structures", 5th Ed.
mod helpers;

use dedaliano_engine::solver::{modal, spectral, time_integration};
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa (E for steel)
const E_EFF: f64 = E * 1000.0; // kN/m^2 (MPa -> kN/m^2 as used in assembly)
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
// 1. Clough & Penzien: Cantilever Fundamental Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 18, Table 18-1.
//
// For a uniform cantilever beam (fixed-free):
//   f_1 = (beta_1*L)^2 / (2*pi*L^2) * sqrt(EI / (rho*A))
//
// where beta_1*L = 1.8751 for the first mode.
//
// Properties: L = 5m, E = 200 GPa = 200000 MPa, IPE300:
//   I = 8356e-8 m^4, A = 53.8e-4 m^2, rho = 7850 kg/m^3
//
// Solver units: E in MPa, rho_A = density * A / 1000 (tonnes/m)
// EI_eff = E_MPa * I = 200000 * 8356e-8 = 16.712 (kN*m^2)
//
// omega_1 = (1.8751/L)^2 * sqrt(EI / rho_A)
//   rho_A = 7850 * 53.8e-4 / 1000 = 0.042233 tonnes/m
//   EI = 200000 * 8356e-8 = 16.712
//   omega_1 = (1.8751/5)^2 * sqrt(16.712 / 0.042233)
//           = 0.14063 * 19.896 = 2.798 rad/s
//   f_1 = omega_1 / (2*pi) = 0.4454 Hz (expected ~ 0.445 Hz)

#[test]
fn validation_clough_1_cantilever_fundamental() {
    let l = 5.0;
    let iz = 8356e-8; // m^4 (IPE300)
    let a = 53.8e-4;  // m^2 (IPE300)
    let n_elem = 10;

    let input = make_beam(n_elem, l, E, a, iz, "fixed", None, vec![]);

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 2).unwrap();

    // Analytical: omega = (beta_1*L / L)^2 * sqrt(EI / rho_A)
    let rho_a = DENSITY * a / 1000.0; // tonnes/m
    let ei = E_EFF * iz;              // kN*m^2 (assembly uses E*1000)
    let beta1_l = 1.8751_f64;
    let omega_expected = (beta1_l / l).powi(2) * (ei / rho_a).sqrt();
    let f_expected = omega_expected / (2.0 * std::f64::consts::PI);

    let f_computed = result.modes[0].frequency;
    let error = (f_computed - f_expected).abs() / f_expected;

    assert!(
        error < 0.02,
        "Clough cantilever f1: computed={:.4} Hz, expected={:.4} Hz, error={:.2}%",
        f_computed, f_expected, error * 100.0
    );
}

// ================================================================
// 2. Clough & Penzien: Simply-Supported Beam First 3 Modes
// ================================================================
//
// Reference: Clough & Penzien Ch. 18.
//
// For a simply-supported beam:
//   f_n = (n*pi)^2 / (2*pi*L^2) * sqrt(EI / (rho*A))
//
// This is equivalent to:
//   omega_n = (n*pi/L)^2 * sqrt(EI / rho_A)
//
// L = 8m, same section properties as standard test.
// A = 0.01 m^2, Iz = 1e-4 m^4

#[test]
fn validation_clough_2_ss_beam_three_modes() {
    let l = 8.0;
    let a = 0.01;
    let iz = 1e-4;
    let n_elem = 16; // fine mesh for higher modes

    let mut input = make_ss_beam_udl(n_elem, l, E, a, iz, 0.0);
    input.loads.clear();

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 6).unwrap();

    let rho_a = DENSITY * a / 1000.0;
    let ei = E_EFF * iz; // kN*m^2
    let pi = std::f64::consts::PI;

    // Analytical frequencies for modes 1, 2, 3
    for n in 1..=3_usize {
        let omega_n = (n as f64 * pi / l).powi(2) * (ei / rho_a).sqrt();
        let f_expected = omega_n / (2.0 * pi);

        let f_computed = result.modes[n - 1].frequency;
        let error = (f_computed - f_expected).abs() / f_expected;

        assert!(
            error < 0.02,
            "Clough SS mode {}: computed={:.4} Hz, expected={:.4} Hz, error={:.2}%",
            n, f_computed, f_expected, error * 100.0
        );
    }
}

// ================================================================
// 3. Clough & Penzien: Portal Frame Sway Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 19, SDOF idealization.
//
// Single-bay portal frame: 2 columns H=4m, beam L=6m, fixed bases.
// Rigid beam approximation: k = 24*EI_col / H^3 (two fixed-base columns).
// Mass from beam and column self-weight via consistent mass matrix.
//
// The sway frequency is approximately:
//   f = (1 / 2*pi) * sqrt(k_lateral / m_effective)
//
// With very stiff beam, k_lateral = 2 * 12*EI/H^3 = 24*EI/H^3.
// We compare the first (sway) mode from the modal solver to the
// analytical SDOF approximation. Within 5% (flexible beam effect).

#[test]
fn validation_clough_3_portal_frame_sway() {
    let h = 4.0;
    let w = 6.0;
    let a_col = 53.8e-4;  // IPE300 area
    let iz_col = 8356e-8;  // IPE300 Iz

    // Very stiff beam to approximate rigid diaphragm
    let a_beam = 0.1;
    let iz_beam = 1.0; // very large to simulate rigid beam

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        // Columns: material 1, section 1
        (1, "frame", 1, 2, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        // Beam: material 1, section 2 (very stiff)
        (2, "frame", 2, 3, 1, 2, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_col, iz_col), (2, a_beam, iz_beam)],
        elems, sups, vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    // Analytical: k = 24 * EI / H^3
    let ei_col = E_EFF * iz_col;
    let k_lateral = 24.0 * ei_col / h.powi(3);

    // Effective mass: beam mass + fraction of column mass
    // Beam mass = rho * A_beam * L_beam / 1000
    // Column mass (consistent): roughly 50% participates in sway
    let m_beam = DENSITY * a_beam * w / 1000.0;
    let m_col_total = DENSITY * a_col * h * 2.0 / 1000.0; // two columns
    let m_effective = m_beam + 0.5 * m_col_total; // approximate

    let f_analytical = (1.0 / (2.0 * std::f64::consts::PI)) * (k_lateral / m_effective).sqrt();
    let f_computed = result.modes[0].frequency;

    let error = (f_computed - f_analytical).abs() / f_analytical;

    assert!(
        error < 0.05,
        "Clough portal sway: computed={:.4} Hz, analytical={:.4} Hz, error={:.2}%",
        f_computed, f_analytical, error * 100.0
    );
}

// ================================================================
// 4. Clough & Penzien: Two-Story Shear Building
// ================================================================
//
// Reference: Clough & Penzien Ch. 11, Chopra Ch. 12.
//
// Two-story shear building with equal story stiffnesses.
// Each story: 2 columns with 12*EI/H^3 each -> k_story = 24*EI/H^3.
// k1 = k2 = k (equal stiffness).
//
// Stiffness matrix K = [k1+k2, -k2; -k2, k2] = [2k, -k; -k, k]
// Mass matrix M = diag(m1, m2) with equal masses.
//
// Eigenvalues: omega^2 = (k/m) * (3 +/- sqrt(5)) / 2
//   omega_1^2 = k/m * (3 - sqrt(5)) / 2 = k/m * 0.382
//   omega_2^2 = k/m * (3 + sqrt(5)) / 2 = k/m * 2.618
//
// Frequency ratio: f2/f1 = sqrt(2.618 / 0.382) = 2.618

#[test]
fn validation_clough_4_two_story_shear_building() {
    let h = 3.0;
    let a_col = 0.01;
    let iz_col = 1e-4;

    // Very stiff beams to enforce shear-building behavior
    let a_beam = 0.5;
    let iz_beam = 1.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 6.0, 0.0),           // ground
            (3, 0.0, h),   (4, 6.0, h),               // 1st floor
            (5, 0.0, 2.0 * h), (6, 6.0, 2.0 * h),    // 2nd floor
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, a_col, iz_col),   // column section
            (2, a_beam, iz_beam), // very stiff beam
        ],
        vec![
            // Columns (4 total, 2 per story)
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            // Stiff beams
            (5, "frame", 3, 4, 1, 2, false, false),
            (6, "frame", 5, 6, 1, 2, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![],
    );

    let densities = make_densities_multi();
    let result = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    assert!(
        result.modes.len() >= 2,
        "Should extract at least 2 modes for a 2-story frame"
    );

    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;

    // Both frequencies should be positive and distinct
    assert!(f1 > 0.0, "First mode frequency should be positive");
    assert!(f2 > f1, "Second mode should be higher: f2={:.4}, f1={:.4}", f2, f1);

    // Analytical: k_story = 2 * 12*EI/H^3 = 24*EI/H^3
    let ei_col = E_EFF * iz_col;
    let k = 24.0 * ei_col / h.powi(3);

    // Effective floor mass (beam + half columns)
    let m_beam = DENSITY * a_beam * 6.0 / 1000.0;
    let m_col_story = DENSITY * a_col * h * 2.0 / 1000.0;
    let m_floor = m_beam + m_col_story; // approximate

    // Analytical eigenvalues for 2-story shear building
    let omega1_sq = k / m_floor * (3.0 - 5.0_f64.sqrt()) / 2.0;
    let omega2_sq = k / m_floor * (3.0 + 5.0_f64.sqrt()) / 2.0;
    let f1_analytical = omega1_sq.sqrt() / (2.0 * std::f64::consts::PI);
    let f2_analytical = omega2_sq.sqrt() / (2.0 * std::f64::consts::PI);

    let error1 = (f1 - f1_analytical).abs() / f1_analytical;
    let error2 = (f2 - f2_analytical).abs() / f2_analytical;

    assert!(
        error1 < 0.05,
        "2-story mode 1: computed={:.4} Hz, analytical={:.4} Hz, error={:.2}%",
        f1, f1_analytical, error1 * 100.0
    );
    assert!(
        error2 < 0.05,
        "2-story mode 2: computed={:.4} Hz, analytical={:.4} Hz, error={:.2}%",
        f2, f2_analytical, error2 * 100.0
    );

    // Also check the frequency ratio: should be ~ sqrt(2.618/0.382) = 2.618
    let ratio = f2 / f1;
    let expected_ratio = (omega2_sq / omega1_sq).sqrt();
    let ratio_err = (ratio - expected_ratio).abs() / expected_ratio;

    assert!(
        ratio_err < 0.05,
        "2-story f2/f1: computed={:.3}, expected={:.3}, error={:.2}%",
        ratio, expected_ratio, ratio_err * 100.0
    );
}

// ================================================================
// 5. Clough & Penzien: Rayleigh Quotient — Added Mass Lowers Frequency
// ================================================================
//
// Reference: Clough & Penzien Ch. 8 (Rayleigh quotient).
//
// The Rayleigh quotient provides an upper bound on omega_1^2.
// Adding mass to a structure should always lower (or maintain)
// the natural frequency: f_with_mass <= f_bare.
//
// Test: simply-supported beam, compare bare frequency to frequency
// with a heavier section (larger area to simulate added mass).
// The beam with larger A (more mass) must have a lower f1.

#[test]
fn validation_clough_5_rayleigh_quotient() {
    let l = 8.0;
    let a_bare = 0.01;
    let iz = 1e-4;
    let n_elem = 12;

    // Bare beam
    let mut input_bare = make_ss_beam_udl(n_elem, l, E, a_bare, iz, 0.0);
    input_bare.loads.clear();
    let densities = make_densities();
    let result_bare = modal::solve_modal_2d(&input_bare, &densities, 2).unwrap();
    let f_bare = result_bare.modes[0].frequency;

    // Beam with 3x the area (3x mass, same stiffness via same Iz)
    let a_heavy = 0.03;
    let n_nodes_heavy = n_elem + 1;
    let elem_len = l / n_elem as f64;
    let nodes: Vec<_> = (0..n_nodes_heavy)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, n_nodes_heavy, "rollerX")];
    let input_heavy = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_heavy, iz)], // same Iz, more area = more mass
        elems,
        sups,
        vec![],
    );
    let result_heavy = modal::solve_modal_2d(&input_heavy, &densities, 2).unwrap();
    let f_heavy = result_heavy.modes[0].frequency;

    // Rayleigh quotient: adding mass lowers frequency
    assert!(
        f_heavy < f_bare,
        "Rayleigh: heavier beam f1={:.4} Hz should be < bare f1={:.4} Hz",
        f_heavy, f_bare
    );

    // Quantitative: f scales as 1/sqrt(m) for same stiffness
    // With 3x mass: f_heavy/f_bare ~ 1/sqrt(3) ~ 0.577
    let ratio = f_heavy / f_bare;
    let expected_ratio = 1.0 / 3.0_f64.sqrt(); // 0.5774
    let error = (ratio - expected_ratio).abs() / expected_ratio;

    assert!(
        error < 0.02,
        "Rayleigh: f_heavy/f_bare={:.4}, expected={:.4}, error={:.2}%",
        ratio, expected_ratio, error * 100.0
    );
}

// ================================================================
// 6. Clough & Penzien: Newmark SDOF Impulse — Period Matching
// ================================================================
//
// Reference: Clough & Penzien Ch. 5, Chopra Ch. 5.
//
// Cantilever beam with consistent mass under impulse at tip.
// The free vibration period from time-history zero-crossings
// should match the fundamental period from modal analysis.

#[test]
fn validation_clough_6_newmark_sdof_impulse() {
    let length = 4.0;
    let n = 6;
    let n_nodes = n + 1;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, length, E, a, iz, "fixed", None, vec![]);
    let densities = make_densities();

    // Get modal period for reference
    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_modal = modal_res.modes[0].period;

    // Time history: short impulse then free vibration
    let dt = t_modal / 40.0;
    let n_steps = (5.0 * t_modal / dt) as usize;

    let pulse_steps = 3;
    let mut force_history = Vec::new();
    for i in 0..=pulse_steps {
        let t = i as f64 * dt;
        let fy = if i < pulse_steps { -100.0 } else { 0.0 };
        force_history.push(TimeForceRecord {
            time: t,
            loads: vec![SolverNodalLoad { node_id: n_nodes, fx: 0.0, fy, mz: 0.0 }],
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
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: Some(force_history),
    };

    let result = time_integration::solve_time_history_2d(&input).unwrap();

    // Extract tip displacement history
    let tip = result.node_histories.iter().find(|h| h.node_id == n_nodes).unwrap();
    let uy = &tip.uy;

    // Find zero crossings after the impulse
    let start_idx = (pulse_steps + 5).min(uy.len() - 1);
    let mut crossings = Vec::new();
    for i in (start_idx + 1)..uy.len() {
        if uy[i - 1] * uy[i] < 0.0 && uy[i - 1].abs() > 1e-15 {
            let frac = uy[i - 1].abs() / (uy[i - 1].abs() + uy[i].abs());
            let t_cross = ((i - 1) as f64 + frac) * dt;
            crossings.push(t_cross);
        }
    }

    assert!(
        crossings.len() >= 4,
        "Expected at least 4 zero crossings, got {}", crossings.len()
    );

    // Full period = time between every other zero crossing
    let t_measured = crossings[2] - crossings[0];
    let error = (t_measured - t_modal).abs() / t_modal;

    assert!(
        error < 0.05,
        "Clough Newmark: measured T={:.6}s, modal T={:.6}s, error={:.2}%",
        t_measured, t_modal, error * 100.0
    );
}

// ================================================================
// 7. Clough & Penzien: Spectral Response — Base Shear = m * Sa
// ================================================================
//
// Reference: Clough & Penzien Ch. 26, Chopra Ch. 13.
//
// For a single-DOF-dominant system under a flat design spectrum,
// the SRSS base shear should be approximately:
//   V_base = sum_modes(m_eff_i * Sa_i)  (SRSS combined)
//
// For flat Sa and single dominant mode:
//   V_base ~ sqrt(sum(m_eff_i * Sa)^2) ~ m_total * alpha * Sa
//
// We verify the base shear is in the correct range relative to m*Sa.

#[test]
fn validation_clough_7_spectral_response_sdof() {
    let l = 4.0;
    let n = 6;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, l, E, a, iz, "fixed", None, vec![]);
    let densities = make_densities();

    // Modal analysis
    let modal_res = modal::solve_modal_2d(&solver, &densities, 4).unwrap();

    // Flat spectrum: Sa = 5.0 m/s^2 for all periods (in g: 5.0/9.81)
    let sa_ms2 = 5.0;
    let sa_g = sa_ms2 / 9.81;
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

    // Convert modal to spectral input
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

    let spectral_input = SpectralInput {
        solver,
        modes,
        densities,
        spectrum,
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: Some(modal_res.total_mass),
    };

    let result = spectral::solve_spectral_2d(&spectral_input).unwrap();

    // Base shear should be roughly m_total * Sa
    // For a cantilever, first mode effective mass ~ 61% of total mass
    // SRSS base shear = sqrt(sum(m_eff_i * Sa)^2) ~ m_eff_1 * Sa (dominated by mode 1)
    let total_mass = modal_res.total_mass;
    let v_upper = total_mass * sa_ms2; // upper bound

    assert!(
        result.base_shear > 0.0,
        "Spectral: base shear should be positive"
    );

    // Base shear should be between 40% and 105% of m*Sa
    assert!(
        result.base_shear < v_upper * 1.05,
        "Spectral: V={:.3} should be < m*Sa={:.3}", result.base_shear, v_upper
    );
    assert!(
        result.base_shear > v_upper * 0.40,
        "Spectral: V={:.3} should be > 40% of m*Sa={:.3}", result.base_shear, v_upper
    );

    // Check that effective mass of first mode is close to 61% of total mass
    // (cantilever first mode participation factor)
    let meff_y_1 = modal_res.modes[0].effective_mass_y;
    let mass_ratio_1 = meff_y_1 / total_mass;
    assert!(
        mass_ratio_1 > 0.5 && mass_ratio_1 < 0.75,
        "Spectral: first mode mass ratio={:.3}, expected ~0.61", mass_ratio_1
    );
}

// ================================================================
// 8. Clough & Penzien: Damping Reduces Dynamic Response
// ================================================================
//
// Reference: Clough & Penzien Ch. 3, Chopra Ch. 3.
//
// A damped system (xi = 5%) under impulse loading should have smaller
// peak displacement than the same undamped system. This is a fundamental
// property of viscous damping.

#[test]
fn validation_clough_8_damping_effect() {
    let length = 4.0;
    let n = 6;
    let n_nodes = n + 1;
    let a = 53.8e-4;
    let iz = 8356e-8;

    let solver = make_beam(n, length, E, a, iz, "fixed", None, vec![]);
    let densities = make_densities();

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    let t_modal = modal_res.modes[0].period;

    let dt = t_modal / 40.0;
    let n_steps = (5.0 * t_modal / dt) as usize;

    // Same impulse for both runs
    let pulse_steps = 3;
    let make_force = || {
        let mut fh = Vec::new();
        for i in 0..=pulse_steps {
            let t = i as f64 * dt;
            let fy = if i < pulse_steps { -100.0 } else { 0.0 };
            fh.push(TimeForceRecord {
                time: t,
                loads: vec![SolverNodalLoad { node_id: n_nodes, fx: 0.0, fy, mz: 0.0 }],
            });
        }
        fh
    };

    // Undamped run
    let input_undamped = TimeHistoryInput {
        solver: solver.clone(),
        densities: densities.clone(),
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel: None, ground_direction: None,
        force_history: Some(make_force()),
    };
    let result_undamped = time_integration::solve_time_history_2d(&input_undamped).unwrap();

    // Damped run (5% Rayleigh damping)
    let input_damped = TimeHistoryInput {
        solver,
        densities,
        time_step: dt,
        n_steps,
        method: "newmark".to_string(),
        beta: 0.25, gamma: 0.5,
        alpha: None,
        damping_xi: Some(0.05),
        ground_accel: None, ground_direction: None,
        force_history: Some(make_force()),
    };
    let result_damped = time_integration::solve_time_history_2d(&input_damped).unwrap();

    // Compare peak displacements at tip
    let tip_undamped = result_undamped.node_histories.iter()
        .find(|h| h.node_id == n_nodes).unwrap();
    let tip_damped = result_damped.node_histories.iter()
        .find(|h| h.node_id == n_nodes).unwrap();

    // Look at peak after the impulse (skip initial transient)
    let skip = pulse_steps + 5;
    let peak_undamped = tip_undamped.uy[skip..].iter()
        .cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let peak_damped = tip_damped.uy[skip..].iter()
        .cloned().fold(0.0_f64, |a, b| a.max(b.abs()));

    assert!(
        peak_undamped > 1e-10,
        "Undamped peak should be non-negligible, got {:.2e}", peak_undamped
    );

    assert!(
        peak_damped < peak_undamped,
        "Clough damping: damped peak={:.6} should be < undamped peak={:.6}",
        peak_damped, peak_undamped
    );

    // Quantitative: damped response should be noticeably smaller
    // With 5% damping over ~4 cycles, amplitude decays by exp(-2*pi*4*0.05) ~ 0.28
    // So the overall peak should be smaller by a meaningful factor
    let ratio = peak_damped / peak_undamped;
    assert!(
        ratio < 0.95,
        "Clough damping: damped/undamped ratio={:.4}, expected < 0.95", ratio
    );
}
