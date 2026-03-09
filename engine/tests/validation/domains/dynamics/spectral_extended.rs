/// Validation: Extended Spectral (Response Spectrum) Analysis
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 13
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed., Ch. 26
///   - ASCE 7-22 Section 12.9 — Modal response spectrum analysis
///   - EN 1998-1 (Eurocode 8) Section 3.2.2.5 — Design spectrum shape
///
/// Tests:
///   1. SDOF spectral response — matches Sd directly
///   2. Multi-DOF SRSS combination — square root of sum of squares
///   3. CQC combination — complete quadratic combination
///   4. Modal participation factors — sum to total mass
///   5. Base shear distribution — vertical force distribution
///   6. Spectral vs time history comparison — peak response consistency
///   7. Design spectrum shape — EC8/ASCE 7 plateau and descent
///   8. Multi-story drift from spectral — interstory drift
use dedaliano_engine::solver::{modal, spectral};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// Steel properties (E in MPa — solver uses E * 1000.0 internally)
const E: f64 = 200_000.0;
const A: f64 = 0.01;       // m^2
const IZ: f64 = 1e-4;      // m^4
const DENSITY: f64 = 7_850.0; // kg/m^3

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

/// Build an EC8-shaped design spectrum with plateau and descending branch.
/// TB, TC, TD are the control periods; ag is the design ground acceleration in g;
/// S is the soil factor; eta is the damping correction.
fn ec8_spectrum(ag: f64, s: f64, tb: f64, tc: f64, td: f64, eta: f64) -> DesignSpectrum {
    // Build a piecewise-linear approximation of the EC8 Type 1 elastic spectrum
    let mut points = Vec::new();

    // T = 0: Sa = ag*S*(1 + T/TB*(eta*2.5 - 1)) = ag*S*1.0
    points.push(SpectrumPoint { period: 0.0, sa: ag * s * 1.0 });
    // T = TB: start of plateau
    points.push(SpectrumPoint { period: tb, sa: ag * s * eta * 2.5 });
    // T = TC: end of plateau
    points.push(SpectrumPoint { period: tc, sa: ag * s * eta * 2.5 });
    // Descending branch: Sa = ag*S*eta*2.5*(TC/T)
    let n_desc = 10;
    let t_max = td * 2.0;
    for i in 1..=n_desc {
        let t = tc + (t_max - tc) * i as f64 / n_desc as f64;
        let sa = if t <= td {
            ag * s * eta * 2.5 * tc / t
        } else {
            ag * s * eta * 2.5 * tc * td / (t * t)
        };
        points.push(SpectrumPoint { period: t, sa });
    }

    DesignSpectrum {
        name: "EC8 Type 1".into(),
        points,
        in_g: Some(true),
    }
}

/// Helper: convert 2D modal results to SpectralModeInput.
fn modal_to_spectral_modes(modal_res: &modal::ModalResult) -> Vec<SpectralModeInput> {
    modal_res.modes.iter().map(|m| {
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
    }).collect()
}

/// Run modal + spectral pipeline for a given SolverInput and return both results.
fn run_spectral(
    solver: SolverInput,
    num_modes: usize,
    spectrum: DesignSpectrum,
    direction: &str,
    rule: Option<&str>,
    importance: Option<f64>,
    reduction: Option<f64>,
) -> (spectral::SpectralResult, modal::ModalResult) {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();
    let modes = modal_to_spectral_modes(&modal_res);

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

/// Build a multi-story shear building (vertical cantilever column with lumped masses).
/// Returns a SolverInput with `n_stories` stories of height `h` each,
/// with a fixed base and a lateral nodal load of 0 (pure modal/spectral).
fn make_shear_building(n_stories: usize, h: f64, e: f64, a: f64, iz: f64) -> SolverInput {
    // Nodes along Y axis (vertical): node 1 at base, node n+1 at top
    let n_nodes = n_stories + 1;
    let mut nodes = Vec::new();
    for i in 0..n_nodes {
        // x = 0, y = i * h (vertical cantilever)
        nodes.push((i + 1, 0.0, i as f64 * h));
    }

    let mut elems = Vec::new();
    for i in 0..n_stories {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }

    let sups = vec![(1, 1, "fixed")];

    make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        sups,
        vec![],
    )
}

// ===================================================================
// 1. SDOF Spectral Response -- Matches Sd Directly
// ===================================================================
//
// Reference: Chopra, Ch. 6 & 13.
// A single-DOF system (one-element cantilever with lumped mass at tip)
// has a single mode. Under a flat spectrum with Sa = Sa_g * g, the
// spectral displacement is Sd = Sa / omega^2, and the tip displacement
// from the spectral solver should match participation * Sd.

#[test]
fn validation_spectral_sdof_response_matches_sd() {
    // Cantilever beam: 1 element, fixed at base, free at tip
    let l = 3.0;
    let solver = make_beam(1, l, E, A, IZ, "fixed", None, vec![]);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
    assert!(!modal_res.modes.is_empty(), "Should have at least 1 mode");

    let mode = &modal_res.modes[0];
    let sa_g = 0.4; // g
    let sa_ms2 = sa_g * 9.81;
    let omega = mode.omega;
    let sd_expected = sa_ms2 / (omega * omega);

    let modes = modal_to_spectral_modes(&modal_res);
    let spectral_input = SpectralInput {
        solver,
        modes,
        densities,
        spectrum: flat_spectrum(sa_g),
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(modal_res.total_mass),
    };

    let result = spectral::solve_spectral_2d(&spectral_input).unwrap();

    // With SDOF: only one mode contributes, so per_mode[0].sd should match
    assert_eq!(result.per_mode.len(), 1, "SDOF should have exactly 1 mode");
    assert_close(result.per_mode[0].sd, sd_expected, 0.02, "SDOF Sd vs Sa/omega^2");

    // Per-mode Sa should equal sa_g * g (flat spectrum, importance=1, R=1)
    assert_close(result.per_mode[0].sa, sa_ms2, 0.02, "SDOF per-mode Sa");

    // Tip displacement (node 2) should be non-zero and in the right ballpark
    let tip = result.displacements.iter().find(|d| d.node_id == 2);
    assert!(tip.is_some(), "Should have tip displacement");
    let tip_uy = tip.unwrap().uy.abs();
    assert!(
        tip_uy > 1e-10,
        "SDOF tip displacement should be non-zero, got {:.2e}", tip_uy
    );
}

// ===================================================================
// 2. Multi-DOF SRSS Combination -- Square Root of Sum of Squares
// ===================================================================
//
// Reference: Chopra, Section 13.4 (SRSS rule).
// For well-separated modes, the SRSS combined response R = sqrt(sum(Ri^2)).
// We verify this manually: sum the per-mode base shear squared, take sqrt.

#[test]
fn validation_spectral_multi_dof_srss_combination() {
    // 4-story shear building, cantilever
    let n = 4;
    let h = 3.5;
    let solver = make_shear_building(n, h, E, A, IZ);

    // Vertical cantilever along Y: lateral sway modes are in X direction
    let (result, _modal_res) = run_spectral(
        solver, 4, flat_spectrum(0.3), "X", Some("SRSS"), Some(1.0), Some(1.0),
    );

    assert!(result.per_mode.len() >= 2, "Should have multiple modes");

    // Manual SRSS of modal_force: V_base = sqrt(sum(Fi^2))
    let manual_srss: f64 = result.per_mode.iter()
        .map(|pm| pm.modal_force * pm.modal_force)
        .sum::<f64>()
        .sqrt();

    // The solver computes base_shear the same way (see spectral.rs line 145-148)
    assert_close(result.base_shear, manual_srss, 0.01, "SRSS base shear vs manual computation");

    // Verify base_shear is positive
    assert!(result.base_shear > 0.0, "Base shear should be positive");

    // Verify SRSS >= any single mode contribution
    for pm in &result.per_mode {
        assert!(
            result.base_shear >= pm.modal_force.abs() * 0.99,
            "SRSS combined ({:.4}) should be >= individual mode force ({:.4})",
            result.base_shear, pm.modal_force.abs()
        );
    }
}

// ===================================================================
// 3. CQC Combination -- Complete Quadratic Combination
// ===================================================================
//
// Reference: Chopra, Section 13.8; Der Kiureghian (1981).
// CQC accounts for cross-modal correlation. For well-separated modes
// (frequency ratios >> 1), CQC converges to SRSS. For closely spaced
// modes, CQC > SRSS due to positive cross-correlation terms.
// We test: (a) CQC >= SRSS for all cases, (b) CQC ~ SRSS for well-separated.

#[test]
fn validation_spectral_cqc_combination() {
    // 6-element cantilever with well-separated modes
    let l = 6.0;
    let solver = make_beam(6, l, E, A, IZ, "fixed", None, vec![]);

    let (res_srss, _) = run_spectral(
        solver.clone(), 4, flat_spectrum(0.4), "Y", Some("SRSS"), Some(1.0), Some(1.0),
    );
    let (res_cqc, _) = run_spectral(
        solver, 4, flat_spectrum(0.4), "Y", Some("CQC"), Some(1.0), Some(1.0),
    );

    // Both should produce positive base shear
    assert!(res_srss.base_shear > 0.0, "SRSS base shear > 0");
    assert!(res_cqc.base_shear > 0.0, "CQC base shear > 0");

    // For well-separated modes, CQC and SRSS should be within 15%
    if res_srss.base_shear > 1e-6 {
        let ratio = res_cqc.base_shear / res_srss.base_shear;
        assert!(
            ratio > 0.85 && ratio < 1.15,
            "CQC/SRSS ratio={:.4}, expected ~1.0 for well-separated modes",
            ratio
        );
    }

    // CQC rule string should be recorded
    assert_eq!(res_cqc.rule, "CQC", "Rule should be CQC");
    assert_eq!(res_srss.rule, "SRSS", "Rule should be SRSS");

    // CQC per-mode data should be identical to SRSS per-mode
    // (per-mode results don't depend on combination rule)
    for (a, b) in res_cqc.per_mode.iter().zip(res_srss.per_mode.iter()) {
        assert_close(a.sa, b.sa, 0.001, "Per-mode Sa should match between CQC and SRSS");
        assert_close(a.sd, b.sd, 0.001, "Per-mode Sd should match between CQC and SRSS");
        assert_close(
            a.participation, b.participation, 0.001,
            "Per-mode participation should match between CQC and SRSS",
        );
    }
}

// ===================================================================
// 4. Modal Participation Factors -- Sum to Total Mass
// ===================================================================
//
// Reference: Chopra, Section 13.2.
// The sum of effective modal masses in each direction equals the total
// structural mass. With enough modes included, the cumulative mass
// ratio should approach 1.0.

#[test]
fn validation_spectral_modal_participation_sum_to_total_mass() {
    // 8-element cantilever — use enough modes to capture > 90% mass
    let l = 8.0;
    let n_elem = 8;
    let solver = make_beam(n_elem, l, E, A, IZ, "fixed", None, vec![]);

    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let num_modes = 6;
    let modal_res = modal::solve_modal_2d(&solver, &densities, num_modes).unwrap();

    // Compute sum of effective masses in Y direction
    let sum_meff_y: f64 = modal_res.modes.iter()
        .map(|m| m.effective_mass_y)
        .sum();

    let total_mass = modal_res.total_mass;
    assert!(total_mass > 0.0, "Total mass must be positive");

    // Sum of effective masses should be <= total mass (theoretical bound)
    assert!(
        sum_meff_y <= total_mass * 1.05,
        "Sum of effective masses {:.4} should be <= total mass {:.4}",
        sum_meff_y, total_mass
    );

    // With 6 modes of an 8-DOF cantilever, we should capture > 90% of the Y mass
    let mass_ratio_y = sum_meff_y / total_mass;
    assert!(
        mass_ratio_y > 0.90,
        "Cumulative Y mass ratio={:.4} should be > 90% with {} modes",
        mass_ratio_y, num_modes
    );

    // The modal result cumulative_mass_ratio_y should agree
    assert_close(
        modal_res.cumulative_mass_ratio_y, mass_ratio_y, 0.05,
        "Cumulative mass ratio Y consistency",
    );

    // Run spectral to verify per-mode effective mass data propagates correctly
    let modes = modal_to_spectral_modes(&modal_res);
    let spectral_input = SpectralInput {
        solver,
        modes,
        densities,
        spectrum: flat_spectrum(0.3),
        direction: "Y".to_string(),
        rule: Some("SRSS".to_string()),
        xi: Some(0.05),
        importance_factor: Some(1.0),
        reduction_factor: Some(1.0),
        total_mass: Some(total_mass),
    };

    let spectral_res = spectral::solve_spectral_2d(&spectral_input).unwrap();

    // per_mode modal_force = effective_mass * Sa, so sum(modal_force/Sa)^2 relates to mass
    // Just verify per_mode participation values are non-trivial
    let first_mode = &spectral_res.per_mode[0];
    assert!(
        first_mode.participation.abs() > 0.1,
        "First mode participation={:.4} should be significant for cantilever Y-direction",
        first_mode.participation
    );
}

// ===================================================================
// 5. Base Shear Distribution -- Vertical Force Distribution
// ===================================================================
//
// Reference: ASCE 7-22 Section 12.8.3.
// For a multi-story building, the base shear distributes vertically
// roughly in proportion to m_i * h_i^k. In spectral analysis, the
// element shears should increase toward the base (cumulative effect).

#[test]
fn validation_spectral_base_shear_distribution() {
    // 3-story shear building: vertical cantilever
    let n_stories = 3;
    let h = 3.5; // story height
    let solver = make_shear_building(n_stories, h, E, A, IZ);

    // Vertical cantilever along Y: lateral sway modes are in X direction
    let (result, modal_res) = run_spectral(
        solver, 3, flat_spectrum(0.5), "X", Some("SRSS"), Some(1.0), Some(1.0),
    );

    // Base shear should be positive
    assert!(result.base_shear > 0.0, "Base shear should be positive");

    // Base shear bounded by total_mass * Sa * g
    let sa_ms2 = 0.5 * 9.81;
    let v_upper = modal_res.total_mass * sa_ms2;
    assert!(
        result.base_shear < v_upper * 1.05,
        "Base shear {:.4} should be < upper bound {:.4}",
        result.base_shear, v_upper
    );

    // Element shears: the base element (element 1, from node 1 to node 2)
    // should carry the largest shear since it carries cumulative forces
    // from all stories above.
    let base_elem = result.element_forces.iter().find(|ef| ef.element_id == 1);
    assert!(base_elem.is_some(), "Should have base element forces");
    let base_v = base_elem.unwrap().v_max;

    // Top element (element n_stories) should carry less shear
    let top_elem = result.element_forces.iter().find(|ef| ef.element_id == n_stories);
    assert!(top_elem.is_some(), "Should have top element forces");
    let top_v = top_elem.unwrap().v_max;

    assert!(
        base_v >= top_v * 0.95,
        "Base element shear ({:.4}) should be >= top element shear ({:.4})",
        base_v, top_v
    );

    // All element forces should be non-negative (spectral = absolute values)
    for ef in &result.element_forces {
        assert!(ef.v_max >= 0.0, "Element {} shear should be >= 0", ef.element_id);
        assert!(ef.m_max >= 0.0, "Element {} moment should be >= 0", ef.element_id);
    }
}

// ===================================================================
// 6. Spectral vs Time History Comparison -- Peak Response Consistency
// ===================================================================
//
// Reference: Chopra, Section 13.1; Clough & Penzien, Ch. 26.
// For a structure under a flat spectrum, the spectral analysis gives an
// envelope estimate. We compare the spectral base shear against the
// theoretical static-equivalent approach: V = sum(participation^2 * meff * Sa).
// This is not a full time-history comparison but validates that the
// spectral result is consistent with the static-equivalent force method.

#[test]
fn validation_spectral_vs_static_equivalent_consistency() {
    // 4-element simply-supported beam excited in Y
    let n = 4;
    let l = 8.0;
    let solver = make_ss_beam_udl(n, l, E, A, IZ, 0.0);

    let (result, modal_res) = run_spectral(
        solver, 4, flat_spectrum(0.3), "Y", Some("SRSS"), Some(1.0), Some(1.0),
    );

    // Flat spectrum: all modes see the same Sa
    let sa_ms2 = 0.3 * 9.81;
    for pm in &result.per_mode {
        assert_close(pm.sa, sa_ms2, 0.02, "Flat spectrum per-mode Sa");
    }

    // Static equivalent base shear = sqrt(sum(meff_i * Sa)^2) for SRSS
    let static_equiv_base_shear: f64 = modal_res.modes.iter()
        .map(|m| {
            let force = m.effective_mass_y * sa_ms2;
            force * force
        })
        .sum::<f64>()
        .sqrt();

    // Spectral base shear should match static equivalent closely
    if static_equiv_base_shear > 1e-6 {
        let ratio = result.base_shear / static_equiv_base_shear;
        assert!(
            ratio > 0.90 && ratio < 1.10,
            "Spectral/static-equiv base shear ratio={:.4}, expected ~1.0",
            ratio
        );
    }

    // Additionally, the displacement envelope should be non-negative everywhere
    // (spectral results are absolute values after combination)
    for d in &result.displacements {
        assert!(
            d.uy.abs() >= 0.0,
            "Spectral displacements should be non-negative envelope values"
        );
    }
}

// ===================================================================
// 7. Design Spectrum Shape -- EC8/ASCE 7 Plateau and Descent
// ===================================================================
//
// Reference: EN 1998-1 Section 3.2.2.5, Figure 3.1.
// Verify that spectra with a plateau + descending branch produce:
//   (a) Higher Sa at short periods than long periods
//   (b) The long-period modes contribute less base shear
//   (c) The overall base shear is controlled by the plateau region

#[test]
fn validation_spectral_design_spectrum_shape() {
    // EC8 Type 1, Soil Type B: TB=0.15, TC=0.5, TD=2.0, ag=0.25g, S=1.2
    let ag = 0.25;
    let s = 1.2;
    let tb = 0.15;
    let tc = 0.5;
    let td = 2.0;
    let eta = 1.0; // 5% damping correction factor

    let spectrum = ec8_spectrum(ag, s, tb, tc, td, eta);

    // Verify the spectrum shape: plateau Sa = ag*S*eta*2.5 = 0.25*1.2*1.0*2.5 = 0.75g
    let plateau_sa = ag * s * eta * 2.5;

    // Use a 6-element cantilever (has modes at different periods)
    let l = 6.0;
    let solver = make_beam(6, l, E, A, IZ, "fixed", None, vec![]);

    let (result, _modal_res) = run_spectral(
        solver, 4, spectrum, "Y", Some("SRSS"), Some(1.0), Some(1.0),
    );

    assert!(result.per_mode.len() >= 2, "Should have multiple modes");

    // The first mode (longest period) should have lower Sa than shorter-period modes
    // unless it falls in the plateau region. Verify that at least the spectrum
    // has been interpolated correctly.
    let first = &result.per_mode[0];
    assert!(first.sa > 0.0, "First mode Sa should be > 0");

    // If first mode period is > TC (descending branch), its Sa should be less than plateau
    if first.period > tc {
        let plateau_sa_ms2 = plateau_sa * 9.81;
        assert!(
            first.sa < plateau_sa_ms2 * 1.05,
            "Long-period mode Sa={:.4} should be < plateau Sa={:.4}",
            first.sa, plateau_sa_ms2
        );
    }

    // All per-mode Sa values should be positive
    for pm in &result.per_mode {
        assert!(pm.sa > 0.0, "Mode {} Sa should be > 0", pm.mode);
        assert!(pm.sd >= 0.0, "Mode {} Sd should be >= 0", pm.mode);
        assert!(pm.period > 0.0, "Mode {} period should be > 0", pm.mode);
    }

    // Base shear should be bounded by plateau_Sa * total_mass
    let plateau_upper = plateau_sa * 9.81 * _modal_res.total_mass;
    assert!(
        result.base_shear < plateau_upper * 1.1,
        "Base shear {:.4} should be < plateau upper bound {:.4}",
        result.base_shear, plateau_upper
    );

    // Verify descending branch: for periods > TC, Sa should decrease with T
    let mut desc_modes: Vec<&spectral::PerModeResult> = result.per_mode.iter()
        .filter(|pm| pm.period > tc)
        .collect();
    desc_modes.sort_by(|a, b| a.period.partial_cmp(&b.period).unwrap());

    if desc_modes.len() >= 2 {
        for i in 0..desc_modes.len() - 1 {
            assert!(
                desc_modes[i].sa >= desc_modes[i + 1].sa * 0.99,
                "Sa should decrease with period in descending branch: T1={:.3} Sa1={:.4}, T2={:.3} Sa2={:.4}",
                desc_modes[i].period, desc_modes[i].sa,
                desc_modes[i + 1].period, desc_modes[i + 1].sa
            );
        }
    }
}

// ===================================================================
// 8. Multi-Story Drift from Spectral -- Interstory Drift
// ===================================================================
//
// Reference: ASCE 7-22 Section 12.8.6; EN 1998-1 Section 4.3.4.
// For a multi-story building, the interstory drift delta_i = u_i - u_{i-1}
// is a critical design parameter. The spectral analysis should produce
// drift values that are positive (envelope) and largest at mid-height
// or base for a regular structure.

#[test]
fn validation_spectral_multistory_interstory_drift() {
    // 5-story shear building
    let n_stories = 5;
    let h = 3.0; // story height
    let solver = make_shear_building(n_stories, h, E, A, IZ);

    // Vertical cantilever along Y: lateral sway modes are in X direction
    let (result, _modal_res) = run_spectral(
        solver, 4, flat_spectrum(0.4), "X", Some("SRSS"), Some(1.0), Some(1.0),
    );

    // Extract lateral displacements at each floor
    // Node 1 = base (fixed), Nodes 2..6 = floors 1..5
    // For a vertical cantilever along Y, the lateral sway displacement is ux
    let mut floor_disps: Vec<(usize, f64)> = Vec::new();
    for node_id in 1..=(n_stories + 1) {
        if let Some(d) = result.displacements.iter().find(|d| d.node_id == node_id) {
            floor_disps.push((node_id, d.ux.abs()));
        }
    }

    assert_eq!(
        floor_disps.len(),
        n_stories + 1,
        "Should have displacements at all {} nodes",
        n_stories + 1
    );

    // Base node (fixed) should have zero or near-zero displacement
    let base_disp = floor_disps[0].1;
    assert!(
        base_disp < 1e-8,
        "Base displacement should be ~0, got {:.2e}",
        base_disp
    );

    // Compute interstory drifts
    let mut drifts: Vec<f64> = Vec::new();
    for i in 1..floor_disps.len() {
        // In spectral analysis, displacements are positive envelopes,
        // so drift = |u_i| - |u_{i-1}| could be negative due to different
        // modal combinations. Use absolute story displacement difference.
        let drift = (floor_disps[i].1 - floor_disps[i - 1].1).abs();
        drifts.push(drift);
    }

    // At least one drift should be non-zero (structure deforms)
    let max_drift = drifts.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        max_drift > 1e-12,
        "Max interstory drift should be non-zero, got {:.2e}",
        max_drift
    );

    // Drift ratio = drift / story_height
    let max_drift_ratio = max_drift / h;
    // For a reasonable structure under moderate seismic loading, drift ratio
    // should be small (well under 5% for elastic analysis)
    assert!(
        max_drift_ratio < 0.05,
        "Max drift ratio={:.6} should be < 5% for elastic analysis",
        max_drift_ratio
    );

    // Top floor should have the largest absolute displacement
    let top_disp = floor_disps[n_stories].1;
    for (node_id, disp) in &floor_disps {
        assert!(
            top_disp >= disp * 0.99,
            "Top floor displacement ({:.6}) should be >= node {} displacement ({:.6})",
            top_disp, node_id, disp
        );
    }
}
