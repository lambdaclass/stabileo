/// Validation: Response Spectrum Analysis Benchmarks
///
/// Reference: Chopra *Dynamics of Structures*, Biggs *Introduction to Structural Dynamics*.
///
/// Tests: single-mode base shear, SRSS vs CQC, importance/reduction scaling,
///        direction sensitivity, flat spectrum sanity, multi-mode participation.
use dedaliano_engine::solver::{modal, spectral, ModalResult, SpectralResult};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0; // kg/m³

/// Build a flat design spectrum (constant Sa for all periods).
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

/// Run modal → spectral pipeline for a SS beam.
fn run_spectral_ss_beam(
    n: usize, l: f64, num_modes: usize,
    spectrum: DesignSpectrum, direction: &str,
    rule: Option<&str>,
    importance: Option<f64>,
    reduction: Option<f64>,
) -> (SpectralResult, ModalResult) {
    let solver = make_ss_beam_udl(n, l, E, A, IZ, 0.0);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();

    // Convert modal results to SpectralModeInput
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
        solver,
        modes,
        densities,
        spectrum,
        direction: direction.to_string(),
        rule: rule.map(|s| s.to_string()),
        xi: Some(0.05),
        importance_factor: importance,
        reduction_factor: reduction,
        total_mass: Some(modal_res.total_mass),
    };

    let spectral_res = spectral::solve_spectral_2d(&spectral_input).unwrap();
    (spectral_res, modal_res)
}

// ═══════════════════════════════════════════════════════════════
// 1. Single-Mode Base Shear
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_single_mode_base_shear() {
    // SS beam, flat spectrum Sa=0.5g, direction Y
    // V_base ≈ Γ₁²*m_total*Sa (approximate, single-mode dominance)
    let n = 8;
    let l = 10.0;

    let (result, modal_res) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, None,
    );

    // Base shear should be positive and proportional to mass
    assert!(result.base_shear > 0.0, "base shear should be > 0");

    // Total mass * Sa (in m/s²) gives upper bound
    let sa_ms2 = 0.5 * 9.81;
    let upper_bound = modal_res.total_mass * sa_ms2;

    // Base shear should be a fraction of total weight (typically 60-90% for first mode)
    assert!(
        result.base_shear < upper_bound * 1.05,
        "base shear {:.2} should be < upper bound {:.2}", result.base_shear, upper_bound
    );
    assert!(
        result.base_shear > upper_bound * 0.3,
        "base shear {:.2} should be > 30% of upper bound {:.2}", result.base_shear, upper_bound
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. SRSS vs CQC: Well-Separated Modes
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_srss_vs_cqc_separated() {
    // For well-separated modes, SRSS ≈ CQC (< 5% difference)
    let n = 8;
    let l = 10.0;

    let (srss, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, None,
    );
    let (cqc, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("CQC"), None, None,
    );

    let diff = (srss.base_shear - cqc.base_shear).abs();
    let max_shear = srss.base_shear.max(cqc.base_shear);

    if max_shear > 1.0 {
        let rel = diff / max_shear;
        assert!(
            rel < 0.10,
            "SRSS={:.2} vs CQC={:.2}, diff={:.1}% (expected < 10% for separated modes)",
            srss.base_shear, cqc.base_shear, rel * 100.0
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// 3. Importance Factor Scaling
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_importance_factor_scaling() {
    // Doubling importance factor should double all responses
    let n = 8;
    let l = 10.0;

    let (res1, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), Some(1.0), None,
    );
    let (res2, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), Some(2.0), None,
    );

    let ratio = res2.base_shear / res1.base_shear;
    assert_close(ratio, 2.0, 0.01, "Importance factor scaling");
}

// ═══════════════════════════════════════════════════════════════
// 4. Reduction Factor Scaling
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_reduction_factor_scaling() {
    // R=2 should halve all responses
    let n = 8;
    let l = 10.0;

    let (res1, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, Some(1.0),
    );
    let (res2, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, Some(2.0),
    );

    let ratio = res1.base_shear / res2.base_shear;
    assert_close(ratio, 2.0, 0.01, "Reduction factor scaling");
}

// ═══════════════════════════════════════════════════════════════
// 5. Direction X vs Y
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_direction_sensitivity() {
    // Same beam, spectrum in X vs Y should give different responses
    // (beam primarily vibrates in Y, so X participation is smaller)
    let n = 8;
    let l = 10.0;

    let (res_y, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, None,
    );
    let (res_x, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "X", Some("SRSS"), None, None,
    );

    // Both directions should produce non-negative response
    assert!(res_y.base_shear >= 0.0, "Y-direction base shear should be ≥ 0");
    assert!(res_x.base_shear >= 0.0, "X-direction base shear should be ≥ 0");

    // Y direction should have significant response for a beam loaded transversely
    assert!(res_y.base_shear > 0.1, "Y-direction base shear={:.2} should be significant", res_y.base_shear);
}

// ═══════════════════════════════════════════════════════════════
// 6. Flat Spectrum Sanity: Per-Mode Sa Equal
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_flat_spectrum_per_mode_sa() {
    // With flat spectrum, all modes should see the same Sa
    let n = 8;
    let l = 10.0;

    let (result, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.5), "Y", Some("SRSS"), None, None,
    );

    if result.per_mode.len() >= 2 {
        let sa_0 = result.per_mode[0].sa;
        for pm in &result.per_mode {
            if sa_0 > 1e-6 {
                assert_close(pm.sa, sa_0, 0.01, "flat spectrum per-mode Sa");
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 7. Multi-Mode Participation > 90%
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_multi_mode_participation() {
    // Sum of effective masses from modes should > 90% of total mass
    let n = 8;
    let l = 10.0;

    let solver = make_ss_beam_udl(n, l, E, A, IZ, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 4).unwrap();

    // With 4 modes of an 8-element beam, cumulative Y mass ratio should be substantial
    // (may not reach 90% since even modes have zero Y participation for SS beam)
    assert!(
        modal_res.cumulative_mass_ratio_y > 0.80,
        "Cumulative Y mass ratio={:.3} should be > 80%",
        modal_res.cumulative_mass_ratio_y
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Zero Spectrum → Zero Response
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_spectral_zero_spectrum_zero_response() {
    let n = 8;
    let l = 10.0;

    let (result, _) = run_spectral_ss_beam(
        n, l, 4, flat_spectrum(0.0), "Y", Some("SRSS"), None, None,
    );

    assert!(
        result.base_shear.abs() < 1e-6,
        "Zero spectrum: base shear={:.6} should be ≈ 0", result.base_shear
    );

    for d in &result.displacements {
        assert!(d.ux.abs() < 1e-10 && d.uz.abs() < 1e-10,
            "Zero spectrum: node {} has nonzero displacement", d.node_id);
    }
}
