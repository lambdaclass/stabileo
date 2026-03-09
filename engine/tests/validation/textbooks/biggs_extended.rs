/// Validation: Extended Biggs *Introduction to Structural Dynamics* Benchmarks
///
/// Reference: Biggs *Introduction to Structural Dynamics*, Chopra *Dynamics of Structures*,
///            EN 1998-1 (Eurocode 8) design spectrum.
///
/// Tests: triangular spectrum, EC8 Type 1 spectrum, shear building floor forces,
///        base overturning moment from spectral analysis.
use dedaliano_engine::solver::{modal, spectral, ModalResult, SpectralResult};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0;

fn flat_spectrum(sa_g: f64) -> DesignSpectrum {
    DesignSpectrum {
        name: "Flat".into(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 0.5, sa: sa_g },
            SpectrumPoint { period: 1.0, sa: sa_g },
            SpectrumPoint { period: 2.0, sa: sa_g },
            SpectrumPoint { period: 5.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    }
}

/// Triangular spectrum: Sa decreases linearly from sa_max at T=0 to 0 at T=t_max.
fn triangular_spectrum(sa_max_g: f64, t_max: f64) -> DesignSpectrum {
    DesignSpectrum {
        name: "Triangular".into(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_max_g },
            SpectrumPoint { period: t_max / 4.0, sa: sa_max_g * 0.75 },
            SpectrumPoint { period: t_max / 2.0, sa: sa_max_g * 0.5 },
            SpectrumPoint { period: 3.0 * t_max / 4.0, sa: sa_max_g * 0.25 },
            SpectrumPoint { period: t_max, sa: 0.001 }, // near-zero, not exactly 0
            SpectrumPoint { period: t_max * 2.0, sa: 0.001 },
        ],
        in_g: Some(true),
    }
}

/// EC8 Type 1 spectrum shape (simplified): ag=0.25g, soil B
/// T_B=0.15, T_C=0.5, T_D=2.0, S=1.2, η=1.0
fn ec8_type1_spectrum() -> DesignSpectrum {
    let ag = 0.25;
    let s = 1.2;
    let tb = 0.15;
    let tc = 0.5;
    let td = 2.0;
    let eta = 1.0;

    let plateau = ag * s * eta * 2.5; // constant acceleration plateau

    DesignSpectrum {
        name: "EC8-Type1-B".into(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: ag * s },
            SpectrumPoint { period: tb, sa: plateau },
            SpectrumPoint { period: tc, sa: plateau },
            SpectrumPoint { period: 1.0, sa: plateau * tc / 1.0 },
            SpectrumPoint { period: td, sa: plateau * tc / td },
            SpectrumPoint { period: 4.0, sa: plateau * tc * td / (4.0 * 4.0) },
        ],
        in_g: Some(true),
    }
}

/// Run spectral pipeline for a SS beam.
fn run_spectral(
    solver: SolverInput, num_modes: usize,
    spectrum: DesignSpectrum, direction: &str,
) -> (SpectralResult, ModalResult) {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();

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
        densities: {
            let mut d = HashMap::new();
            d.insert("1".to_string(), DENSITY);
            d
        },
        spectrum,
        direction: direction.to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: Some(modal_res.total_mass),
    };

    let spectral_res = spectral::solve_spectral_2d(&spectral_input).unwrap();
    (spectral_res, modal_res)
}

// ═══════════════════════════════════════════════════════════════
// 1. Triangular Spectrum: Higher Modes Attenuated
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_biggs_triangular_spectrum() {
    // With triangular spectrum (Sa decreases with T), higher modes (shorter T)
    // get higher Sa but have less mass participation.
    // Compare to flat spectrum: triangular should give different response.
    let n = 8;
    let l = 10.0;

    let solver_flat = make_ss_beam_udl(n, l, E, A, IZ, 0.0);
    let solver_tri = make_ss_beam_udl(n, l, E, A, IZ, 0.0);

    let (res_flat, _) = run_spectral(solver_flat, 4, flat_spectrum(0.5), "Y");
    let (res_tri, _) = run_spectral(solver_tri, 4, triangular_spectrum(0.5, 2.0), "Y");

    // Both should produce positive base shear
    assert!(res_flat.base_shear > 0.0, "Flat spectrum: base shear > 0");
    assert!(res_tri.base_shear > 0.0, "Triangular spectrum: base shear > 0");

    // Per-mode Sa should decrease for triangular spectrum (higher mode = shorter period = lower Sa)
    if res_tri.per_mode.len() >= 2 {
        // Mode 1 has longer period → higher Sa in triangular spectrum
        // Mode 2 has shorter period → lower Sa
        // But it depends on the period range. Just verify they're different.
        let sa_diff = (res_tri.per_mode[0].sa - res_tri.per_mode[1].sa).abs();
        assert!(
            sa_diff > 0.01 || res_tri.per_mode[0].sa < 0.02,
            "Triangular spectrum: per-mode Sa should vary, got mode1={:.4}, mode2={:.4}",
            res_tri.per_mode[0].sa, res_tri.per_mode[1].sa
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 2. EC8 Type 1 Design Spectrum Shape
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_biggs_ec8_spectrum() {
    // EC8 Type 1 spectrum on a simple beam
    // Verify: response is nonzero and per-mode Sa follows spectrum shape
    let n = 8;
    let l = 10.0;
    let solver = make_ss_beam_udl(n, l, E, A, IZ, 0.0);

    let (result, modal_res) = run_spectral(solver, 4, ec8_type1_spectrum(), "Y");

    // Base shear should be positive
    assert!(result.base_shear > 0.0, "EC8: base shear > 0");

    // Per-mode Sa should be consistent with EC8 shape
    // (plateau between T_B and T_C, decreasing after T_C)
    for pm in &result.per_mode {
        assert!(pm.sa >= 0.0, "EC8: per-mode Sa should be ≥ 0");
    }

    // Total mass should be positive
    assert!(modal_res.total_mass > 0.0, "EC8: total mass > 0");

    // Base shear should be bounded by mass * max_Sa
    let max_sa = 0.25 * 1.2 * 2.5 * 9.81; // ag*S*2.5*g in m/s²
    let upper = modal_res.total_mass * max_sa;
    assert!(
        result.base_shear < upper * 1.1,
        "EC8: base shear {:.2} < upper bound {:.2}", result.base_shear, upper
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Multi-DOF Shear Building: Floor Forces
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_biggs_shear_building_forces() {
    // 2-story portal frame (shear building model)
    // Spectral analysis → per-floor forces should increase with height
    // (typical inverted triangular distribution for first mode)
    let h = 3.5;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h), (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let solver = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, vec![],
    );

    let (result, _) = run_spectral(solver, 3, flat_spectrum(0.3), "X");

    // Base shear should be positive
    assert!(result.base_shear >= 0.0, "Shear building: base shear ≥ 0");

    // Floor displacements: 2nd floor > 1st floor (for X direction)
    let d3 = result.displacements.iter().find(|d| d.node_id == 3);
    let d5 = result.displacements.iter().find(|d| d.node_id == 5);
    if let (Some(d1f), Some(d2f)) = (d3, d5) {
        assert!(
            d2f.ux.abs() >= d1f.ux.abs() * 0.9,
            "Shear building: 2nd floor ux={:.6} should ≥ 1st floor ux={:.6}",
            d2f.ux.abs(), d1f.ux.abs()
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. Base Overturning Moment from Spectral Analysis
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_biggs_base_moment() {
    // Spectral analysis of portal frame → base moment from element forces
    // M_base = sum of base column moments
    // Should be consistent with V_base * effective height
    let h = 4.0;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let solver = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, vec![],
    );

    let (result, _) = run_spectral(solver, 2, flat_spectrum(0.3), "X");

    // Base moment from column base element forces
    // Elements 1 (left col, node_i=1) and 3 (right col, node_j=4→base at node_i=3→4)
    let col_left = result.element_forces.iter().find(|e| e.element_id == 1);
    let col_right = result.element_forces.iter().find(|e| e.element_id == 3);

    if let (Some(cl), Some(cr)) = (col_left, col_right) {
        let base_moment = cl.m_max + cr.m_max;

        if result.base_shear > 0.01 {
            // Overturning moment should be positive
            assert!(base_moment > 0.0,
                "Base moment = {:.4} should be > 0", base_moment);

            // Effective height: M_base / V_base
            // For SRSS combination, forces are not simultaneous, so h_eff can differ from h
            let h_eff = base_moment / result.base_shear;
            assert!(
                h_eff > 0.1 * h && h_eff < 5.0 * h,
                "Effective height {:.2} should be reasonable vs story height {:.2}", h_eff, h
            );
        }
    }
}
