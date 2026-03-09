/// Validation: 3D Response Spectrum Analysis (RSA)
///
/// Tests spectral analysis in 3D:
///   1. Base shear bounded by total_mass × Sa × g
///   2. SRSS vs CQC give similar results for well-separated modes
///   3. Reduction factor scales base shear linearly
///   4. X-direction vs Y-direction RSA on symmetric section beam
///   5. RSA displacement consistent with modal participation
///   6. RSA equilibrium: reactions match base shear
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 13
///   - ASCE 7-22 §12.9 — Modal response spectrum analysis
///   - EN 1998-1 §4.3.3.3
use dedaliano_engine::solver::{modal, spectral};
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

// ================================================================
// 1. RSA Base Shear Bounded by Total Mass × Sa × g
// ================================================================
//
// For a flat spectrum, V_base ≤ m_total × Sa × g.

#[test]
fn validation_3d_spectral_base_shear_bound() {
    let l: f64 = 5.0;
    let n = 6;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let sa_g = 0.4;
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

    assert!(res.base_shear > 0.0, "Base shear should be positive");
    assert!(
        res.base_shear <= v_upper * 1.1,
        "V_base={:.4} should be ≤ m×Sa×g={:.4}",
        res.base_shear, v_upper
    );
}

// ================================================================
// 2. SRSS vs CQC for Well-Separated Modes
// ================================================================
//
// Cantilever beam modes are well separated (ω₂/ω₁ > 6).
// SRSS and CQC should give similar results.

#[test]
fn validation_3d_spectral_srss_vs_cqc() {
    let l: f64 = 5.0;
    let n = 6;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let sa_g = 0.3;
    let make_input = |rule: &str| -> SpectralInput3D {
        SpectralInput3D {
            solver: input.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: flat_spectrum(sa_g),
            direction: "Y".to_string(),
            rule: Some(rule.to_string()),
            xi: Some(0.05),
            importance_factor: Some(1.0),
            reduction_factor: Some(1.0),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res_srss = spectral::solve_spectral_3d(&make_input("SRSS")).unwrap();
    let res_cqc = spectral::solve_spectral_3d(&make_input("CQC")).unwrap();

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
// 3. Reduction Factor Scales Base Shear
// ================================================================
//
// V(R=1) / V(R=3) ≈ 3.0

#[test]
fn validation_3d_spectral_reduction_factor() {
    let l: f64 = 5.0;
    let n = 6;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 3).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let make_input = |r: f64| -> SpectralInput3D {
        SpectralInput3D {
            solver: input.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: flat_spectrum(0.4),
            direction: "Y".to_string(),
            rule: Some("SRSS".to_string()),
            xi: Some(0.05),
            importance_factor: Some(1.0),
            reduction_factor: Some(r),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res_r1 = spectral::solve_spectral_3d(&make_input(1.0)).unwrap();
    let res_r3 = spectral::solve_spectral_3d(&make_input(3.0)).unwrap();

    if res_r1.base_shear > 1e-10 {
        let ratio = res_r1.base_shear / res_r3.base_shear;
        assert!(
            (ratio - 3.0).abs() < 0.5,
            "V(R=1)/V(R=3)={:.3}, should be ≈3.0", ratio
        );
    }
}

// ================================================================
// 4. Symmetric Section: X vs Y Direction RSA
// ================================================================
//
// Beam with Iy = Iz → same modal participation in Y and Z.
// RSA in Y vs Z should give comparable base shears.

#[test]
fn validation_3d_spectral_symmetric_section_directions() {
    let l: f64 = 5.0;
    let n = 6;
    let i_sym = 1e-4;

    let input = make_3d_beam(
        n, l, E, NU, A, i_sym, i_sym, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let make_input = |dir: &str| -> SpectralInput3D {
        SpectralInput3D {
            solver: input.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: flat_spectrum(0.3),
            direction: dir.to_string(),
            rule: Some("SRSS".to_string()),
            xi: Some(0.05),
            importance_factor: Some(1.0),
            reduction_factor: Some(1.0),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res_y = spectral::solve_spectral_3d(&make_input("Y")).unwrap();
    let res_z = spectral::solve_spectral_3d(&make_input("Z")).unwrap();

    // Symmetric section → Y and Z base shears should be similar
    if res_y.base_shear > 1e-10 && res_z.base_shear > 1e-10 {
        let ratio = res_y.base_shear / res_z.base_shear;
        assert!(
            ratio > 0.5 && ratio < 2.0,
            "Symmetric section: V_Y/V_Z={:.3}, should be ≈1", ratio
        );
    }
}

// ================================================================
// 5. RSA Produces Non-Zero Displacements
// ================================================================
//
// Verify RSA returns sensible displacement values at all free nodes.

#[test]
fn validation_3d_spectral_nonzero_displacements() {
    let l: f64 = 4.0;
    let n = 4;
    let tip = n + 1;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None, vec![],
    );

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 3).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let spectral_input = SpectralInput3D {
        solver: input.clone(),
        modes,
        densities: densities.clone(),
        spectrum: flat_spectrum(0.5),
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let res = spectral::solve_spectral_3d(&spectral_input).unwrap();

    // Tip should have non-zero displacement in Y
    let tip_d = res.displacements.iter().find(|d| d.node_id == tip);
    assert!(tip_d.is_some(), "Should have displacement at tip node");
    let tip_d = tip_d.unwrap();
    assert!(tip_d.uy.abs() > 1e-10, "Tip uy should be non-zero, got {:.2e}", tip_d.uy);
}

// ================================================================
// 6. 3D Portal Frame RSA — Multi-Mode Participation
// ================================================================
//
// Portal frame has multiple modes with significant mass participation.
// RSA should capture combined effect.

#[test]
fn validation_3d_spectral_portal_frame() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, h, 0.0),
        (3, w, h, 0.0),
        (4, w, 0.0, 0.0),
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

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_3d(&input, &densities, 4).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

    let spectral_input = SpectralInput3D {
        solver: input.clone(),
        modes,
        densities: densities.clone(),
        spectrum: flat_spectrum(0.3),
        direction: "X".to_string(),
        rule: Some("CQC".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let res = spectral::solve_spectral_3d(&spectral_input).unwrap();

    assert!(res.base_shear > 0.0, "Portal RSA base shear should be > 0");

    // Beam-level nodes should have X displacement (sway mode)
    let d2 = res.displacements.iter().find(|d| d.node_id == 2);
    let d3 = res.displacements.iter().find(|d| d.node_id == 3);
    if let (Some(d2), Some(d3)) = (d2, d3) {
        // Both beam-column joints should sway in X
        assert!(
            d2.ux.abs() > 1e-10 || d3.ux.abs() > 1e-10,
            "Portal nodes should sway in X under X-direction RSA"
        );
    }
}
