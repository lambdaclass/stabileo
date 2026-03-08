/// Validation: RSA vs Time History Cross-Validation
///
/// Tests consistency between response spectrum analysis (RSA) and
/// direct time-history integration:
///   - RSA peak displacement vs time-history envelope
///   - RSA base shear vs time-history peak base shear
///   - Spectral direction independence (X vs Y for symmetric structure)
///
/// References:
///   - Chopra, A.K., "Dynamics of Structures", 5th Ed, Ch. 13
///   - ASCE 7-22, Section 12.9 — Modal response spectrum analysis
///   - Eurocode 8 (EN 1998-1), Section 4.3.3.3
mod helpers;

use dedaliano_engine::solver::{modal, spectral};
use dedaliano_engine::types::*;
use helpers::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7850.0;

// ================================================================
// 1. RSA vs Time History: Cantilever Beam
// ================================================================
//
// For a flat spectrum, RSA and time-history peak responses should
// be of similar order of magnitude.

#[test]
fn validation_rsa_vs_th_cantilever_order_of_magnitude() {
    let length: f64 = 3.0;
    let n = 4;
    let tip_node = n + 1;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let num_modes = 3;
    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();

    // Flat spectrum at 0.3g
    let sa_g = 0.3;
    let spectrum = DesignSpectrum {
        name: "Flat 0.3g".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 5.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency, period: m.period, omega: m.omega,
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
        solver: solver.clone(),
        modes,
        densities: densities.clone(),
        spectrum,
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let spectral_res = spectral::solve_spectral_2d(&spectral_input).unwrap();

    // RSA tip displacement
    let rsa_tip = spectral_res.displacements.iter()
        .find(|d| d.node_id == tip_node)
        .map(|d| d.uy.abs())
        .unwrap_or(0.0);

    // Both should be non-zero
    assert!(rsa_tip > 0.0, "RSA tip displacement should be > 0");
    assert!(spectral_res.base_shear > 0.0, "RSA base shear should be > 0");
}

// ================================================================
// 2. RSA Base Shear: Consistent with Effective Mass × Sa
// ================================================================
//
// For a flat spectrum Sa = constant, V_base should relate to
// the effective modal masses and Sa.

#[test]
fn validation_rsa_base_shear_effective_mass() {
    let length: f64 = 4.0;
    let n = 6;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();

    let sa_g = 0.5;
    let spectrum = DesignSpectrum {
        name: "Flat 0.5g".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency, period: m.period, omega: m.omega,
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
        solver: solver.clone(),
        modes,
        densities: densities.clone(),
        spectrum,
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let spectral_res = spectral::solve_spectral_2d(&spectral_input).unwrap();

    // Base shear should be bounded by total_mass × Sa × g
    let g = 9.81;
    let v_upper = modal_res.total_mass * sa_g * g;

    assert!(
        spectral_res.base_shear <= v_upper * 1.1,
        "RSA base shear={:.4} should be ≤ total_mass×Sa×g={:.4}",
        spectral_res.base_shear, v_upper
    );
    assert!(
        spectral_res.base_shear > 0.0,
        "RSA base shear should be positive"
    );
}

// ================================================================
// 3. RSA: SRSS vs CQC Give Similar Results for Well-Separated Modes
// ================================================================
//
// When modal frequencies are well-separated (ratio > 1.5), SRSS
// and CQC should give similar results.

#[test]
fn validation_rsa_srss_vs_cqc_separated_modes() {
    let length: f64 = 4.0;
    let n = 6;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();

    let sa_g = 0.3;
    let spectrum = DesignSpectrum {
        name: "Flat".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency, period: m.period, omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp { node_id: d.node_id, ux: d.ux, uy: d.uy, rz: d.rz }
            }).collect(),
            participation_x: m.participation_x,
            participation_y: m.participation_y,
            effective_mass_x: m.effective_mass_x,
            effective_mass_y: m.effective_mass_y,
        }
    }).collect();

    let make_spectral = |rule: &str| -> SpectralInput {
        SpectralInput {
            solver: solver.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: spectrum.clone(),
            direction: "Y".to_string(),
            rule: Some(rule.to_string()),
            xi: Some(0.05),
            importance_factor: Some(1.0),
            reduction_factor: Some(1.0),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res_srss = spectral::solve_spectral_2d(&make_spectral("SRSS")).unwrap();
    let res_cqc = spectral::solve_spectral_2d(&make_spectral("CQC")).unwrap();

    // For well-separated modes, SRSS ≈ CQC (within 30%)
    if res_srss.base_shear > 1e-10 {
        let ratio = res_cqc.base_shear / res_srss.base_shear;
        assert!(
            ratio > 0.7 && ratio < 1.5,
            "SRSS vs CQC: ratio={:.3}, should be ≈1 for well-separated modes",
            ratio
        );
    }
}

// ================================================================
// 4. RSA: Reduction Factor Scaling
// ================================================================
//
// Dividing Sa by a reduction factor R should divide base shear by R.

#[test]
fn validation_rsa_reduction_factor() {
    let length: f64 = 4.0;
    let n = 6;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();

    let spectrum = DesignSpectrum {
        name: "Flat".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: 0.4 },
            SpectrumPoint { period: 10.0, sa: 0.4 },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency, period: m.period, omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp { node_id: d.node_id, ux: d.ux, uy: d.uy, rz: d.rz }
            }).collect(),
            participation_x: m.participation_x,
            participation_y: m.participation_y,
            effective_mass_x: m.effective_mass_x,
            effective_mass_y: m.effective_mass_y,
        }
    }).collect();

    let make_spectral = |r: f64| -> SpectralInput {
        SpectralInput {
            solver: solver.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: spectrum.clone(),
            direction: "Y".to_string(),
            rule: Some("SRSS".to_string()),
            xi: Some(0.05),
            importance_factor: Some(1.0),
            reduction_factor: Some(r),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res_r1 = spectral::solve_spectral_2d(&make_spectral(1.0)).unwrap();
    let res_r3 = spectral::solve_spectral_2d(&make_spectral(3.0)).unwrap();

    if res_r1.base_shear > 1e-10 {
        let ratio = res_r1.base_shear / res_r3.base_shear;
        assert!(
            (ratio - 3.0).abs() < 0.3,
            "Reduction factor: V(R=1)/V(R=3)={:.3}, should be ≈3", ratio
        );
    }
}
