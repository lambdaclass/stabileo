/// Validation: 3D Extended Dynamic Analysis Benchmarks
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 12-13
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 11
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Weaver & Johnston, "Structural Dynamics by Finite Elements"
///   - ASCE 7-22 Section 12.9: Modal Response Spectrum Analysis
///
/// Tests:
///   1. 3D cantilever biaxial bending modes (Y vs Z planes)
///   2. Torsional mode frequency for prismatic beam
///   3. 3D portal frame sway modes (X vs Z directions)
///   4. 3D space truss modal frequencies
///   5. 3D building spectral analysis base shear
///   6. Effective mass participation sums toward total mass
///   7. 3D mode shape M-orthogonality
///   8. Rayleigh quotient consistency for 3D modes
use dedaliano_engine::solver::{assembly, dof, mass_matrix, modal, spectral};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 2e-4;
const J: f64 = 1.5e-4;
const DENSITY: f64 = 7_850.0;

fn make_densities_3d() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

fn flat_spectrum(sa_g: f64) -> DesignSpectrum {
    DesignSpectrum {
        name: format!("Flat {}g", sa_g),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    }
}

fn modal_to_spectral_modes(modal_res: &modal::ModalResult3D) -> Vec<SpectralModeInput3D> {
    modal_res.modes.iter().map(|m| {
        SpectralModeInput3D {
            frequency: m.frequency,
            period: m.period,
            omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp3D {
                    node_id: d.node_id,
                    ux: d.ux, uy: d.uy, uz: d.uz,
                    rx: d.rx, ry: d.ry, rz: d.rz,
                }
            }).collect(),
            participation_x: m.participation_x,
            participation_y: m.participation_y,
            participation_z: m.participation_z,
            effective_mass_x: m.effective_mass_x,
            effective_mass_y: m.effective_mass_y,
            effective_mass_z: m.effective_mass_z,
        }
    }).collect()
}

/// Reconstruct 3D eigenvector in global DOF ordering from ModeShape3D displacements.
fn mode3d_to_dof_vec(mode: &modal::ModeShape3D, dof_num: &dof::DofNumbering) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut phi = vec![0.0; n];
    for d in &mode.displacements {
        if let Some(idx) = dof_num.global_dof(d.node_id, 0) { phi[idx] = d.ux; }
        if let Some(idx) = dof_num.global_dof(d.node_id, 1) { phi[idx] = d.uy; }
        if let Some(idx) = dof_num.global_dof(d.node_id, 2) { phi[idx] = d.uz; }
        if dof_num.dofs_per_node >= 4 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 3) { phi[idx] = d.rx; }
        }
        if dof_num.dofs_per_node >= 5 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 4) { phi[idx] = d.ry; }
        }
        if dof_num.dofs_per_node >= 6 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 5) { phi[idx] = d.rz; }
        }
    }
    phi
}

/// Dense matrix-vector product: y = M * x
fn mat_vec(m: &[f64], x: &[f64], n: usize) -> Vec<f64> {
    let mut y = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            y[i] += m[i * n + j] * x[j];
        }
    }
    y
}

/// Dot product
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(ai, bi)| ai * bi).sum()
}

// ================================================================
// 1. 3D Cantilever Biaxial Bending Modes
// ================================================================
//
// A 3D cantilever with Iy != Iz produces distinct bending modes
// in the Y-plane (using Iz) and Z-plane (using Iy).
//
// Euler-Bernoulli cantilever: f_n = (beta_n^2 / (2*pi*L^2)) * sqrt(EI / (rho*A))
// beta_1*L = 1.8751
//
// The weak-axis mode (smaller I) has a lower frequency.
// We verify that the first two modes correspond to bending about
// the two principal axes and their frequency ratio reflects I_y / I_z.

#[test]
fn validation_3d_dyn_ext_1_cantilever_biaxial_modes() {
    let l: f64 = 5.0;
    let n = 10;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let result = modal::solve_modal_3d(&input, &make_densities_3d(), 4).unwrap();
    assert!(result.modes.len() >= 2, "Need at least 2 modes");

    let e_eff = E * 1000.0;
    let rho_a = DENSITY * A / 1000.0;
    let beta1: f64 = 1.8751;

    // Weak axis (IY is smaller) -> lower frequency
    let f_weak_exact = beta1.powi(2) / (2.0 * std::f64::consts::PI * l * l)
        * (e_eff * IY / rho_a).sqrt();
    // Strong axis (IZ is larger) -> higher frequency
    let f_strong_exact = beta1.powi(2) / (2.0 * std::f64::consts::PI * l * l)
        * (e_eff * IZ / rho_a).sqrt();

    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;

    // First mode should be near weak-axis frequency
    let err1 = (f1 - f_weak_exact).abs() / f_weak_exact;
    assert!(err1 < 0.20,
        "Weak-axis mode: computed={:.2} Hz, exact={:.2} Hz, err={:.1}%",
        f1, f_weak_exact, err1 * 100.0);

    // Second mode should be near strong-axis frequency
    let err2 = (f2 - f_strong_exact).abs() / f_strong_exact;
    assert!(err2 < 0.20,
        "Strong-axis mode: computed={:.2} Hz, exact={:.2} Hz, err={:.1}%",
        f2, f_strong_exact, err2 * 100.0);

    // Frequency ratio should reflect sqrt(Iz/Iy) = sqrt(2)
    let ratio = f2 / f1;
    let expected_ratio = (IZ / IY).sqrt();
    let ratio_err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(ratio_err < 0.10,
        "Frequency ratio f2/f1={:.3}, expected sqrt(Iz/Iy)={:.3}, err={:.1}%",
        ratio, expected_ratio, ratio_err * 100.0);
}

// ================================================================
// 2. Torsional Mode Frequency
// ================================================================
//
// For a prismatic beam fixed at one end, free at other,
// the first torsional frequency is:
//   f_torsion = (1 / (4*L)) * sqrt(G*J / (rho * I_p))
// where G = E / (2*(1+nu)), I_p = Iy + Iz (polar moment).
//
// The torsional mode should appear among the first few modes.
// We verify a torsional mode exists with frequency close to analytical.

#[test]
fn validation_3d_dyn_ext_2_torsional_mode() {
    let l: f64 = 4.0;
    let n = 10;
    // Use larger J relative to bending I to push torsional mode lower
    let j_large = 3e-4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, j_large,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let result = modal::solve_modal_3d(&input, &make_densities_3d(), 6).unwrap();
    assert!(result.modes.len() >= 3, "Need at least 3 modes");

    let e_eff = E * 1000.0;
    let g_eff = e_eff / (2.0 * (1.0 + NU));
    let rho = DENSITY / 1000.0; // tonnes/m^3
    let i_p = IY + IZ; // polar moment of area

    // Torsional cantilever: f = (beta*L) / (2*pi*L) * sqrt(GJ / (rho*Ip))
    // with beta_1*L = pi/2 for fixed-free torsion
    let f_torsion_exact = 1.0 / (4.0 * l) * (g_eff * j_large / (rho * i_p)).sqrt();

    // Look for a torsional mode among the computed modes.
    // Identify it by checking if it has dominant rotation about X axis (rx).
    let mut best_torsion_freq = 0.0;
    let mut best_rx_dominance = 0.0;
    for mode in &result.modes {
        let max_rx = mode.displacements.iter()
            .map(|d| d.rx.abs())
            .fold(0.0_f64, f64::max);
        let max_trans = mode.displacements.iter()
            .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
            .fold(0.0_f64, f64::max);
        let rx_dominance = if max_trans > 1e-15 { max_rx / max_trans } else { max_rx };
        if rx_dominance > best_rx_dominance {
            best_rx_dominance = rx_dominance;
            best_torsion_freq = mode.frequency;
        }
    }

    // There should be a mode with torsional character
    assert!(best_rx_dominance > 0.01,
        "Should find a torsional mode with rx dominance, best={:.4}", best_rx_dominance);

    // Verify frequency is in reasonable range of analytical estimate
    // Lumped mass vs consistent mass and coupling effects cause some deviation
    if best_torsion_freq > 0.0 && f_torsion_exact > 0.0 {
        let ratio = best_torsion_freq / f_torsion_exact;
        assert!(ratio > 0.3 && ratio < 3.0,
            "Torsional mode: computed={:.2} Hz, analytical={:.2} Hz, ratio={:.3}",
            best_torsion_freq, f_torsion_exact, ratio);
    }
}

// ================================================================
// 3. 3D Portal Frame Sway Modes: X vs Z Direction
// ================================================================
//
// A 3D portal frame in the XZ-plane fixed at base.
// The first sway mode is in-plane (X direction).
// A deeper beam (Iz > Iy) makes out-of-plane sway softer.
// We verify both X and Z sway frequencies exist and X-sway is lower
// than the stiff in-plane mode.

#[test]
fn validation_3d_dyn_ext_3_3d_portal_sway() {
    let h: f64 = 4.0;
    let bay: f64 = 6.0;

    // Portal in XZ-plane: columns along Z, beam along X
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, bay, 0.0, h),
        (4, bay, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let result = modal::solve_modal_3d(&input, &make_densities_3d(), 5).unwrap();
    assert!(result.modes.len() >= 2, "Need at least 2 modes");

    // All modes should have positive frequencies
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.frequency > 0.0,
            "Mode {} frequency={:.4} should be > 0", i + 1, mode.frequency);
    }

    // Frequency ordering: f1 <= f2 <= f3
    for i in 1..result.modes.len() {
        assert!(result.modes[i].frequency >= result.modes[i - 1].frequency * 0.99,
            "Mode {} freq={:.4} should be >= mode {} freq={:.4}",
            i + 1, result.modes[i].frequency, i, result.modes[i - 1].frequency);
    }

    // Roof nodes should have significant displacement in first mode (sway)
    let mode1 = &result.modes[0];
    let roof_disp: f64 = mode1.displacements.iter()
        .filter(|d| d.node_id == 2 || d.node_id == 3)
        .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
        .fold(0.0, f64::max);

    assert!(roof_disp > 1e-6,
        "Portal sway: roof should move in first mode, max_disp={:.6e}", roof_disp);

    // The first two modes should have distinct frequencies (in-plane vs out-of-plane)
    let f1 = result.modes[0].frequency;
    let f2 = result.modes[1].frequency;
    assert!(f2 / f1 > 1.0,
        "First two modes should have different frequencies: f1={:.4}, f2={:.4}", f1, f2);
}

// ================================================================
// 4. 3D Space Truss Modal Frequencies
// ================================================================
//
// A 3D space truss (tetrahedron) with 4 nodes.
// Bottom triangle pinned, apex free.
// Truss elements have only axial stiffness.
// Verify modal frequencies are positive and ordered.

#[test]
fn validation_3d_dyn_ext_4_space_truss_modal() {
    let s: f64 = 3.0; // side length
    let h: f64 = 2.5; // height of apex

    // Tetrahedron nodes: equilateral triangle at base, apex above centroid
    let cx = s / 2.0;
    let cy = s * (3.0_f64).sqrt() / 6.0;
    let apex_x = s / 2.0;
    let apex_y = s * (3.0_f64).sqrt() / 3.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, cx, cy * 3.0, 0.0),  // top of equilateral triangle
        (4, apex_x, apex_y, h),  // apex
    ];

    // 6 truss elements connecting all pairs
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 1, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];

    // Pin base nodes (all translations), free apex
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let result = modal::solve_modal_3d(&input, &make_densities_3d(), 3).unwrap();
    assert!(result.modes.len() >= 1, "Should have at least 1 mode");

    // All frequencies should be positive
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.frequency > 0.0,
            "Space truss mode {} frequency should be > 0, got {:.6}", i + 1, mode.frequency);
    }

    // Frequency ordering
    for i in 1..result.modes.len() {
        assert!(result.modes[i].omega >= result.modes[i - 1].omega * 0.99,
            "Mode ordering: omega[{}]={:.4} < omega[{}]={:.4}",
            i + 1, result.modes[i].omega, i, result.modes[i - 1].omega);
    }

    // Apex (node 4) should have significant displacement in first mode
    let mode1 = &result.modes[0];
    let apex_disp = mode1.displacements.iter()
        .find(|d| d.node_id == 4)
        .map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs()))
        .unwrap_or(0.0);

    assert!(apex_disp > 1e-6,
        "Space truss: apex should move in first mode, disp={:.6e}", apex_disp);

    // Total mass should be consistent with structure
    assert!(result.total_mass > 0.0, "Total mass should be positive");
}

// ================================================================
// 5. 3D Shear Building Spectral Analysis: Base Shear
// ================================================================
//
// A 3-story 3D building frame with columns in Z-direction.
// Apply spectral analysis in Y direction.
// Base shear V should be <= total_mass * Sa * g.

#[test]
fn validation_3d_dyn_ext_5_spectral_3d_building() {
    let h: f64 = 3.5; // story height
    let w: f64 = 5.0; // bay width

    // 4-column building: 3 stories
    let nodes = vec![
        // Base level (z=0)
        (1, 0.0, 0.0, 0.0),
        (2, w,   0.0, 0.0),
        (3, w,   w,   0.0),
        (4, 0.0, w,   0.0),
        // Level 1 (z=h)
        (5, 0.0, 0.0, h),
        (6, w,   0.0, h),
        (7, w,   w,   h),
        (8, 0.0, w,   h),
        // Level 2 (z=2h)
        (9,  0.0, 0.0, 2.0*h),
        (10, w,   0.0, 2.0*h),
        (11, w,   w,   2.0*h),
        (12, 0.0, w,   2.0*h),
    ];

    // Columns (vertical, along Z)
    let mut elems = vec![];
    let mut eid = 1;
    // Story 1 columns
    for i in 0..4 {
        elems.push((eid, "frame", i + 1, i + 5, 1, 1));
        eid += 1;
    }
    // Story 2 columns
    for i in 0..4 {
        elems.push((eid, "frame", i + 5, i + 9, 1, 1));
        eid += 1;
    }
    // Beams at level 1
    elems.push((eid, "frame", 5, 6, 1, 1)); eid += 1;
    elems.push((eid, "frame", 6, 7, 1, 1)); eid += 1;
    elems.push((eid, "frame", 7, 8, 1, 1)); eid += 1;
    elems.push((eid, "frame", 8, 5, 1, 1)); eid += 1;
    // Beams at level 2
    elems.push((eid, "frame", 9, 10, 1, 1)); eid += 1;
    elems.push((eid, "frame", 10, 11, 1, 1)); eid += 1;
    elems.push((eid, "frame", 11, 12, 1, 1)); eid += 1;
    elems.push((eid, "frame", 12, 9, 1, 1));

    // Fix all base nodes
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (2, vec![true, true, true, true, true, true]),
        (3, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities_3d();
    let modal_res = modal::solve_modal_3d(&input, &densities, 6).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let sa_g = 0.3;
    let spectral_input = SpectralInput3D {
        solver: input.clone(),
        modes,
        densities: densities.clone(),
        spectrum: flat_spectrum(sa_g),
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let res = spectral::solve_spectral_3d(&spectral_input).unwrap();

    let g = 9.81;
    let v_upper = modal_res.total_mass * sa_g * g;

    assert!(res.base_shear > 0.0,
        "Building spectral base shear should be > 0");
    assert!(res.base_shear <= v_upper * 1.1,
        "V_base={:.4} should be <= m*Sa*g={:.4}", res.base_shear, v_upper);
}

// ================================================================
// 6. Effective Mass Participation Sums Toward Total Mass
// ================================================================
//
// Sum of effective masses across all modes <= total mass.
// For a sufficient number of modes, cumulative mass ratio > 0.
// Each mode's effective mass is non-negative.

#[test]
fn validation_3d_dyn_ext_6_mass_participation() {
    let l: f64 = 5.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let result = modal::solve_modal_3d(&input, &make_densities_3d(), 6).unwrap();

    // Each mode's effective mass should be non-negative
    for (i, mode) in result.modes.iter().enumerate() {
        assert!(mode.effective_mass_x >= -1e-10,
            "Mode {} effective_mass_x={:.6e} should be >= 0", i + 1, mode.effective_mass_x);
        assert!(mode.effective_mass_y >= -1e-10,
            "Mode {} effective_mass_y={:.6e} should be >= 0", i + 1, mode.effective_mass_y);
        assert!(mode.effective_mass_z >= -1e-10,
            "Mode {} effective_mass_z={:.6e} should be >= 0", i + 1, mode.effective_mass_z);
    }

    // Sum of effective masses in each direction <= total mass (with small tolerance)
    let sum_x: f64 = result.modes.iter().map(|m| m.effective_mass_x).sum();
    let sum_y: f64 = result.modes.iter().map(|m| m.effective_mass_y).sum();
    let sum_z: f64 = result.modes.iter().map(|m| m.effective_mass_z).sum();

    assert!(sum_x <= result.total_mass * 1.05,
        "Sum effective_mass_x={:.6} should be <= total_mass={:.6}", sum_x, result.total_mass);
    assert!(sum_y <= result.total_mass * 1.05,
        "Sum effective_mass_y={:.6} should be <= total_mass={:.6}", sum_y, result.total_mass);
    assert!(sum_z <= result.total_mass * 1.05,
        "Sum effective_mass_z={:.6} should be <= total_mass={:.6}", sum_z, result.total_mass);

    // Cumulative mass ratios should be positive
    let max_cum = result.cumulative_mass_ratio_x
        .max(result.cumulative_mass_ratio_y)
        .max(result.cumulative_mass_ratio_z);
    assert!(max_cum > 0.0,
        "At least one direction should have positive cumulative mass ratio, max={:.6}", max_cum);

    // Each cumulative mass ratio <= 1.0 (with tolerance)
    assert!(result.cumulative_mass_ratio_x <= 1.05,
        "cum_mass_ratio_x={:.4} should be <= 1.0", result.cumulative_mass_ratio_x);
    assert!(result.cumulative_mass_ratio_y <= 1.05,
        "cum_mass_ratio_y={:.4} should be <= 1.0", result.cumulative_mass_ratio_y);
    assert!(result.cumulative_mass_ratio_z <= 1.05,
        "cum_mass_ratio_z={:.4} should be <= 1.0", result.cumulative_mass_ratio_z);
}

// ================================================================
// 7. 3D Mode Shape M-Orthogonality
// ================================================================
//
// For the generalized eigenvalue problem K*phi = w^2*M*phi,
// eigenvectors satisfy: phi_i^T * M * phi_j = 0 for i != j.
//
// We test this on a 3D portal frame with diverse mode types
// (sway, vertical, torsional).
//
// Reference: Bathe, "Finite Element Procedures", Theorem 10.1

#[test]
fn validation_3d_dyn_ext_7_orthogonality_3d() {
    let h: f64 = 4.0;
    let bay: f64 = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, h),
        (3, bay, 0.0, h),
        (4, bay, 0.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]),
        (4, vec![true, true, true, true, true, true]),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, vec![],
    );

    let densities = make_densities_3d();
    let dof_num = dof::DofNumbering::build_3d(&input);
    let m_full = mass_matrix::assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();

    let n_total = dof_num.n_total;

    for i in 0..modal_res.modes.len() {
        let phi_i = mode3d_to_dof_vec(&modal_res.modes[i], &dof_num);
        let m_phi_i = mat_vec(&m_full, &phi_i, n_total);
        let diag_i = dot(&phi_i, &m_phi_i);

        for j in (i + 1)..modal_res.modes.len() {
            let phi_j = mode3d_to_dof_vec(&modal_res.modes[j], &dof_num);
            let m_phi_j = mat_vec(&m_full, &phi_j, n_total);
            let diag_j = dot(&phi_j, &m_phi_j);

            let cross = dot(&phi_i, &m_phi_j);

            // Normalize by geometric mean of diagonal products
            let scale = (diag_i.abs() * diag_j.abs()).sqrt().max(1e-20);
            let normalized_cross = cross.abs() / scale;

            assert!(
                normalized_cross < 0.10,
                "Modes {} and {}: phi_i^T*M*phi_j / sqrt(m_ii*m_jj) = {:.6e}, should be ~0",
                i + 1, j + 1, normalized_cross
            );
        }
    }
}

// ================================================================
// 8. Rayleigh Quotient Consistency for 3D Modes
// ================================================================
//
// The Rayleigh quotient R(phi) = phi^T*K*phi / (phi^T*M*phi)
// should equal omega^2 for each computed eigenvector phi.
//
// This verifies eigenvalue consistency of the 3D modal solver.
//
// Reference: Bathe, "Finite Element Procedures", Section 10.2

#[test]
fn validation_3d_dyn_ext_8_rayleigh_quotient() {
    let l: f64 = 5.0;
    let n = 8;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let densities = make_densities_3d();
    let dof_num = dof::DofNumbering::build_3d(&input);
    let asm = assembly::assemble_3d(&input, &dof_num);
    let m_full = mass_matrix::assemble_mass_matrix_3d(&input, &dof_num, &densities);
    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();

    let n_total = dof_num.n_total;

    for (idx, mode) in modal_res.modes.iter().enumerate() {
        let phi = mode3d_to_dof_vec(mode, &dof_num);

        let k_phi = mat_vec(&asm.k, &phi, n_total);
        let m_phi = mat_vec(&m_full, &phi, n_total);

        let phi_k_phi = dot(&phi, &k_phi);
        let phi_m_phi = dot(&phi, &m_phi);

        if phi_m_phi.abs() > 1e-20 {
            let omega_sq_rayleigh = phi_k_phi / phi_m_phi;
            let omega_sq_modal = mode.omega * mode.omega;

            // The mode shapes from the solver are normalized (max=1),
            // so the Rayleigh quotient should still match omega^2.
            let rel_err = (omega_sq_rayleigh - omega_sq_modal).abs()
                / omega_sq_modal.abs().max(1e-20);

            assert!(
                rel_err < 0.10,
                "3D Mode {}: R(phi) = {:.4}, omega^2 = {:.4}, rel_err = {:.2}%",
                idx + 1, omega_sq_rayleigh, omega_sq_modal, rel_err * 100.0
            );
        }
    }

    // Additional check: Rayleigh quotient is an upper bound for fundamental frequency.
    // Use a simple trial vector (linear displacement along beam) and verify
    // R(trial) >= omega_1^2.
    let omega_1_sq = modal_res.modes[0].omega.powi(2);
    let mut trial = vec![0.0; n_total];
    // Build a linear trial vector: u_y increases along the beam length
    for &node_id in &dof_num.node_order {
        if let Some(&dof_idx) = dof_num.map.get(&(node_id, 1)) {
            // Linear shape: proportional to distance along beam
            // node positions: node_id goes from 1 to n+1, so (node_id-1)/n * L
            let frac = (node_id as f64 - 1.0) / n as f64;
            trial[dof_idx] = frac;
        }
    }

    let k_trial = mat_vec(&asm.k, &trial, n_total);
    let m_trial = mat_vec(&m_full, &trial, n_total);
    let phi_k_trial = dot(&trial, &k_trial);
    let phi_m_trial = dot(&trial, &m_trial);

    if phi_m_trial.abs() > 1e-20 {
        let r_trial = phi_k_trial / phi_m_trial;
        assert!(
            r_trial >= omega_1_sq * 0.95,
            "Rayleigh upper bound: R(trial)={:.4} should be >= omega_1^2={:.4}",
            r_trial, omega_1_sq
        );
    }
}
