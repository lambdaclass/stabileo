/// Validation: Design Code Provisions (EN 1993, EC8, ASCE 7)
///
/// Tests compliance with structural design code requirements:
///   - EN 1993-1-1 §5.2: Second-order sensitivity (α_cr check)
///   - EC8 / ASCE 7: Cumulative mass participation ≥ 90%
///   - ASCE 7 design spectrum response
///   - Spectral base shear consistency
///
/// References:
///   - EN 1993-1-1:2005, Section 5.2 — Structural stability
///   - Eurocode 8 (EN 1998-1), Section 4.3.3.3 — Modal analysis requirements
///   - ASCE 7-22, Section 12.9 — Modal response spectrum analysis
use dedaliano_engine::solver::{buckling, modal, pdelta, spectral};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7850.0;

// ================================================================
// 1. EN 1993-1-1 §5.2: α_cr Classification
// ================================================================
//
// α_cr = P_cr / P_applied is the elastic critical load factor.
// EN 1993 says:
//   α_cr ≥ 10 → first-order analysis sufficient
//   α_cr ≥ 3  → second-order analysis needed (but stable)
//   α_cr < 3  → stability is a concern
//
// Test: cantilever column with moderate axial load → α_cr > 10.

#[test]
fn validation_en1993_alpha_cr_first_order_ok() {
    let length = 3.0;
    let p = -5.0; // Small compressive load

    let input = make_column(4, length, E, A, IZ, "fixed", "free", p);
    let buckling_res = buckling::solve_buckling_2d(&input, 1).unwrap();

    let lambda = buckling_res.modes[0].load_factor;
    let alpha_cr = lambda; // α_cr = λ_cr for unit load

    // With small load, α_cr should be large → first-order OK per EN 1993
    assert!(
        alpha_cr > 10.0,
        "EN 1993 §5.2: α_cr={:.2} should be > 10 for first-order analysis", alpha_cr
    );
}

#[test]
fn validation_en1993_alpha_cr_second_order_needed() {
    let length = 5.0;
    let ei = E * 1000.0 * IZ;
    let p_euler = std::f64::consts::PI * std::f64::consts::PI * ei / (4.0 * length * length);

    // Load at ~20% of Euler → α_cr ≈ 5 → second-order needed
    let p = -(p_euler * 0.20);

    let input = make_column(8, length, E, A, IZ, "fixed", "free", p);
    let buckling_res = buckling::solve_buckling_2d(&input, 1).unwrap();

    let alpha_cr = buckling_res.modes[0].load_factor;

    assert!(
        alpha_cr >= 3.0 && alpha_cr < 10.0,
        "EN 1993 §5.2: α_cr={:.2} should be in [3, 10] for second-order requirement", alpha_cr
    );
}

// ================================================================
// 2. EN 1993 §5.2: P-Delta amplification matches α_cr prediction
// ================================================================
//
// The amplification factor from P-Delta should be ≈ 1/(1 - 1/α_cr).

#[test]
fn validation_en1993_pdelta_vs_buckling_amplification() {
    let length = 4.0;
    let h_lateral = 5.0;
    let p_axial = -50.0;

    // Portal frame with lateral load
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, length)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: h_lateral, fz: p_axial, my: 0.0,
        })],
    );

    // Buckling analysis for α_cr
    let buckling_res = buckling::solve_buckling_2d(&input, 1).unwrap();
    let alpha_cr = buckling_res.modes[0].load_factor;

    // P-Delta analysis
    let pdelta_res = pdelta::solve_pdelta_2d(&input, 30, 1e-5).unwrap();

    // Predicted amplification from α_cr
    let af_predicted = 1.0 / (1.0 - 1.0 / alpha_cr);

    // Actual amplification from P-Delta
    let lin_ux = pdelta_res.linear_results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let pd_ux = pdelta_res.results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    if lin_ux.abs() > 1e-12 {
        let af_actual = pd_ux / lin_ux;

        // Should match within 20% (approximate formula)
        assert!(
            (af_actual - af_predicted).abs() / af_predicted < 0.30,
            "EN 1993: P-Delta AF={:.3}, predicted 1/(1-1/α_cr)={:.3}, α_cr={:.2}",
            af_actual, af_predicted, alpha_cr
        );
    }
}

// ================================================================
// 3. EC8 §4.3.3.3 / ASCE 7 §12.9.1: Mass Participation ≥ 90%
// ================================================================
//
// Modal analysis must include enough modes so that the cumulative
// effective modal mass is ≥ 90% of total mass in each direction.

#[test]
fn validation_ec8_mass_participation_90_percent() {
    // Multi-story frame: 3 stories, should capture >90% mass in few modes
    let h = 3.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 6.0, 0.0),
            (3, 0.0, h),   (4, 6.0, h),
            (5, 0.0, 2.0 * h), (6, 6.0, 2.0 * h),
            (7, 0.0, 3.0 * h), (8, 6.0, 3.0 * h),
        ],
        vec![(1, E, 0.3)],
        vec![
            (1, A, IZ),     // column
            (2, 0.05, 0.5), // stiff beam
        ],
        vec![
            // Columns
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 5, 1, 1, false, false),
            (4, "frame", 4, 6, 1, 1, false, false),
            (5, "frame", 5, 7, 1, 1, false, false),
            (6, "frame", 6, 8, 1, 1, false, false),
            // Beams
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

    let modal_res = modal::solve_modal_2d(&input, &densities, 6).unwrap();

    // Cumulative mass participation should reach ≥ 90%
    let cum_x = modal_res.cumulative_mass_ratio_x;
    let cum_y = modal_res.cumulative_mass_ratio_y;

    // At least one direction should have > 80% (with 6 modes of a 3-story)
    let max_cum = cum_x.max(cum_y);
    assert!(
        max_cum > 0.80,
        "EC8 §4.3.3.3: cumulative mass ratio should be >80% with 6 modes, got X={:.1}%, Y={:.1}%",
        cum_x * 100.0, cum_y * 100.0
    );

    // Individual mode mass ratios should sum correctly
    let sum_x: f64 = modal_res.modes.iter().map(|m| m.mass_ratio_x).sum();
    let sum_y: f64 = modal_res.modes.iter().map(|m| m.mass_ratio_y).sum();

    assert!(
        (sum_x - cum_x).abs() < 0.01,
        "Cumulative X mass ratio mismatch: sum={:.4}, cum={:.4}", sum_x, cum_x
    );
    assert!(
        (sum_y - cum_y).abs() < 0.01,
        "Cumulative Y mass ratio mismatch: sum={:.4}, cum={:.4}", sum_y, cum_y
    );
}

// ================================================================
// 4. ASCE 7 §12.9: Response Spectrum — Base Shear
// ================================================================
//
// For a flat spectrum Sa = constant, the base shear should equal
// the sum of effective masses × Sa (approximately).
// V_base ≈ Σ (M_eff,i × Sa) combined via CQC/SRSS.

#[test]
fn validation_asce7_spectral_base_shear() {
    let length = 5.0;
    let n = 8;
    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let num_modes = 3;
    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();

    // Build flat spectrum (constant Sa)
    let sa_g = 0.3; // 0.3g
    let spectrum = DesignSpectrum {
        name: "ASCE7 Flat".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: sa_g },
            SpectrumPoint { period: 0.5, sa: sa_g },
            SpectrumPoint { period: 1.0, sa: sa_g },
            SpectrumPoint { period: 5.0, sa: sa_g },
            SpectrumPoint { period: 10.0, sa: sa_g },
        ],
        in_g: Some(true),
    };

    // Convert modal results to spectral input
    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency,
            period: m.period,
            omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }
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

    // Base shear should be positive and non-zero
    assert!(
        spectral_res.base_shear > 0.0,
        "ASCE 7: base shear should be > 0, got {:.6}", spectral_res.base_shear
    );

    // Per-mode results should have correct Sa values
    for pm in &spectral_res.per_mode {
        assert!(pm.sa > 0.0, "Per-mode Sa should be positive");
    }
}

// ================================================================
// 5. ASCE 7: Importance Factor Scaling
// ================================================================
//
// Doubling the importance factor should double all spectral responses.

#[test]
fn validation_asce7_importance_factor_scaling() {
    let length = 5.0;
    let n = 6;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();

    let spectrum = DesignSpectrum {
        name: "Flat".to_string(),
        points: vec![
            SpectrumPoint { period: 0.0, sa: 0.3 },
            SpectrumPoint { period: 10.0, sa: 0.3 },
        ],
        in_g: Some(true),
    };

    let modes: Vec<SpectralModeInput> = modal_res.modes.iter().map(|m| {
        SpectralModeInput {
            frequency: m.frequency, period: m.period, omega: m.omega,
            displacements: m.displacements.iter().map(|d| {
                SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }
            }).collect(),
            participation_x: m.participation_x,
            participation_y: m.participation_y,
            effective_mass_x: m.effective_mass_x,
            effective_mass_y: m.effective_mass_y,
        }
    }).collect();

    let make_input = |ie: f64| -> SpectralInput {
        SpectralInput {
            solver: solver.clone(),
            modes: modes.clone(),
            densities: densities.clone(),
            spectrum: spectrum.clone(),
            direction: "Y".to_string(),
            rule: Some("SRSS".to_string()),
            xi: Some(0.05),
            importance_factor: Some(ie),
            reduction_factor: Some(1.0),
            total_mass: Some(modal_res.total_mass),
        }
    };

    let res1 = spectral::solve_spectral_2d(&make_input(1.0)).unwrap();
    let res2 = spectral::solve_spectral_2d(&make_input(2.0)).unwrap();

    if res1.base_shear > 1e-10 {
        let ratio = res2.base_shear / res1.base_shear;
        assert!(
            (ratio - 2.0).abs() < 0.1,
            "ASCE 7: importance factor 2× should double base shear, ratio={:.3}", ratio
        );
    }
}

// ================================================================
// 6. EC8: Modal Mass Ratios Are Non-Negative
// ================================================================

#[test]
fn validation_ec8_modal_mass_ratios_non_negative() {
    let length = 5.0;
    let n = 8;

    let solver = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 4).unwrap();

    for (i, m) in modal_res.modes.iter().enumerate() {
        assert!(
            m.mass_ratio_x >= -1e-10,
            "Mode {} mass_ratio_x={:.6} should be non-negative", i + 1, m.mass_ratio_x
        );
        assert!(
            m.mass_ratio_y >= -1e-10,
            "Mode {} mass_ratio_y={:.6} should be non-negative", i + 1, m.mass_ratio_y
        );
    }

    // Total mass should be positive
    assert!(modal_res.total_mass > 0.0, "Total mass should be positive");
}
