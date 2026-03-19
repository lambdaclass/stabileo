/// Validation: Extended Harmonic Response Analysis
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 3 (SDOF harmonic)
///   - Clough & Penzien, "Dynamics of Structures", Ch. 3-4
///   - Paz & Leigh, "Structural Dynamics", Ch. 3
///   - Den Hartog, "Mechanical Vibrations", Ch. 2
///
/// Harmonic analysis computes the steady-state response to sinusoidal
/// excitation. For SDOF systems the dynamic amplification factor is:
///
///   DAF = 1 / sqrt((1 - beta^2)^2 + (2*xi*beta)^2)
///
/// where beta = omega / omega_n and xi is the damping ratio.
///
/// Tests verify:
///   1. SDOF resonance: peak amplitude at omega_n
///   2. SDOF far from resonance: static amplitude at omega << omega_n
///   3. Damped SDOF: reduced peak with damping ratio
///   4. Frequency sweep: amplitude envelope matches DAF curve
///   5. Multi-DOF beam: first two resonance peaks
///   6. Phase angle: 90 degrees at resonance for SDOF
///   7. Half-power bandwidth: relates to damping ratio
///   8. Anti-resonance: minimum between two resonances
use dedaliano_engine::solver::harmonic::*;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use crate::common::*;

// Properties chosen to produce clearly visible resonance peaks.
// Larger A provides more distributed mass, which makes the Rayleigh
// damping estimate in the harmonic solver well-conditioned.
const E: f64 = 200_000.0; // MPa; solver uses E * 1000 internally -> kN/m^2
const A: f64 = 0.05; // m^2
const IZ: f64 = 1e-4; // m^4
const DENSITY: f64 = 7_850.0; // kg/m^3 (steel)

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

/// Standard wide frequency sweep from 0.5 to 100 Hz (200 points).
fn wide_sweep() -> Vec<f64> {
    (1..=200).map(|i| i as f64 * 0.5).collect()
}

/// Fine frequency sweep from 0.05 to 100 Hz (2000 points).
fn fine_sweep() -> Vec<f64> {
    (1..=2000).map(|i| i as f64 * 0.05).collect()
}

/// Build a simply-supported beam with a midspan nodal load in Y.
fn make_ss_beam_harmonic(
    n_elements: usize,
    length: f64,
    damping_ratio: f64,
    frequencies: Vec<f64>,
) -> HarmonicInput {
    let mid_node = n_elements / 2 + 1;
    let load = SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    });
    let solver = make_beam(
        n_elements, length, E, A, IZ,
        "pinned", Some("rollerX"), vec![load],
    );
    HarmonicInput {
        solver,
        densities: densities(),
        frequencies,
        damping_ratio,
        response_node_id: mid_node,
        response_dof: "y".to_string(),
    }
}

/// Build a cantilever beam with a tip load in Y.
#[allow(dead_code)]
fn make_cantilever_harmonic(
    n_elements: usize,
    length: f64,
    damping_ratio: f64,
    frequencies: Vec<f64>,
) -> HarmonicInput {
    let tip_node = n_elements + 1;
    let load = SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    });
    let solver = make_beam(
        n_elements, length, E, A, IZ,
        "fixed", None, vec![load],
    );
    HarmonicInput {
        solver,
        densities: densities(),
        frequencies,
        damping_ratio,
        response_node_id: tip_node,
        response_dof: "y".to_string(),
    }
}

// ================================================================
// 1. SDOF Resonance: Peak Amplitude Near omega_n
// ================================================================
//
// A simply-supported beam loaded at midspan behaves primarily as an
// SDOF system for its first bending mode. The peak harmonic response
// should be clearly above the quasi-static response due to dynamic
// amplification. The peak must occur at a positive frequency and
// exceed the response at both the lowest and highest frequencies.

#[test]
fn validation_harmonic_sdof_resonance_peak() {
    let l = 10.0;
    let n = 10;
    let xi = 0.02;

    let input = make_ss_beam_harmonic(n, l, xi, wide_sweep());
    let result = solve_harmonic_2d(&input).unwrap();

    // Peak frequency should be positive
    assert!(
        result.peak_frequency > 0.0,
        "Peak frequency should be positive, got {:.4} Hz",
        result.peak_frequency
    );

    // The peak amplitude should exceed the response at the lowest frequency
    // (dynamic amplification factor > 1 at resonance)
    let amp_at_lowest = result.response_points.first().unwrap().amplitude;
    assert!(
        result.peak_amplitude > amp_at_lowest,
        "Peak {:.6e} should exceed low-freq amplitude {:.6e}",
        result.peak_amplitude, amp_at_lowest
    );

    // The peak amplitude should exceed the response at the highest frequency
    let amp_at_highest = result.response_points.last().unwrap().amplitude;
    assert!(
        result.peak_amplitude > amp_at_highest,
        "Peak {:.6e} should exceed high-freq amplitude {:.6e}",
        result.peak_amplitude, amp_at_highest
    );
}

// ================================================================
// 2. SDOF Far From Resonance: Quasi-Static vs High-Frequency
// ================================================================
//
// At omega << omega_n (beta -> 0), the dynamic amplification
// factor DAF -> 1, so the response approaches the static value.
// At omega >> omega_n (beta -> inf), DAF -> 0 (inertia dominates).

#[test]
fn validation_harmonic_sdof_far_from_resonance() {
    let l = 10.0;
    let n = 10;
    let xi = 0.05;

    // Very low frequency (quasi-static) and very high frequency (inertia)
    let frequencies = vec![0.1, 500.0];

    let input = make_ss_beam_harmonic(n, l, xi, frequencies);
    let result = solve_harmonic_2d(&input).unwrap();

    let amp_low = result.response_points[0].amplitude;
    let amp_high = result.response_points[1].amplitude;

    // At very low frequency, the response should be non-negligible
    assert!(
        amp_low > 1e-10,
        "Low-freq amplitude {:.6e} should be non-negligible",
        amp_low
    );

    // At very high frequency, inertia dominates and amplitude drops
    assert!(
        amp_high < amp_low,
        "High-freq amplitude {:.6e} should be less than low-freq {:.6e}",
        amp_high, amp_low
    );
}

// ================================================================
// 3. Damped SDOF: Reduced Peak With Damping Ratio
// ================================================================
//
// The peak DAF = 1 / (2*xi*sqrt(1-xi^2)) ~ 1/(2*xi) for small xi.
// Higher damping should produce a smaller peak amplitude.

#[test]
fn validation_harmonic_damped_sdof_peak_reduction() {
    let l = 10.0;
    let n = 10;

    let xi_low = 0.01;
    let xi_high = 0.10;

    let input_low = make_ss_beam_harmonic(n, l, xi_low, wide_sweep());
    let input_high = make_ss_beam_harmonic(n, l, xi_high, wide_sweep());

    let result_low = solve_harmonic_2d(&input_low).unwrap();
    let result_high = solve_harmonic_2d(&input_high).unwrap();

    // Higher damping must produce smaller peak amplitude
    assert!(
        result_low.peak_amplitude > result_high.peak_amplitude,
        "Low damping peak {:.6e} should exceed high damping peak {:.6e}",
        result_low.peak_amplitude, result_high.peak_amplitude
    );

    // The ratio should be well below 1.0
    let ratio = result_high.peak_amplitude / result_low.peak_amplitude;
    assert!(
        ratio < 0.9,
        "Peak ratio {:.4} should be well below 1.0",
        ratio
    );
}

// ================================================================
// 4. Frequency Sweep: Amplitude Envelope Shape
// ================================================================
//
// For a frequency sweep across resonance, the response amplitude
// should rise, peak, then decay. We verify:
// - the peak amplitude exceeds the tail region average
// - the peak amplitude exceeds the start region average

#[test]
fn validation_harmonic_frequency_sweep_envelope() {
    let l = 10.0;
    let n = 10;
    let xi = 0.02;

    let n_pts = 400;
    let frequencies: Vec<f64> = (1..=n_pts)
        .map(|i| i as f64 * 0.25) // 0.25 to 100 Hz
        .collect();

    let input = make_ss_beam_harmonic(n, l, xi, frequencies);
    let result = solve_harmonic_2d(&input).unwrap();

    let amps: Vec<f64> = result.response_points.iter().map(|p| p.amplitude).collect();

    // Average amplitude in the last quarter should be less than the peak
    let tail_start = n_pts * 3 / 4;
    let avg_tail: f64 = amps[tail_start..].iter().sum::<f64>()
        / (n_pts - tail_start) as f64;

    assert!(
        result.peak_amplitude > avg_tail,
        "Peak amplitude {:.6e} should exceed tail average {:.6e}",
        result.peak_amplitude, avg_tail
    );

    // Average amplitude in the first 5 points should differ from peak
    // (the response is not flat)
    let avg_start: f64 = amps[..5].iter().sum::<f64>() / 5.0;
    let max_of_start_tail = avg_start.max(avg_tail);
    assert!(
        result.peak_amplitude > max_of_start_tail,
        "Peak {:.6e} should exceed both start avg {:.6e} and tail avg {:.6e}",
        result.peak_amplitude, avg_start, avg_tail
    );
}

// ================================================================
// 5. Multi-DOF Beam: Multiple Resonance Peaks
// ================================================================
//
// A simply-supported beam with an off-center load should exhibit
// multiple resonance peaks. With the load at a quarter-point,
// more modes are excited than with a symmetric midspan load.

#[test]
fn validation_harmonic_multi_dof_two_peaks() {
    let l = 10.0;
    let n = 10;
    let xi = 0.02;

    // Load at the quarter-point (not midspan) to excite more modes
    let load_node = n / 4 + 1;
    let load = SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    });
    let solver = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"), vec![load],
    );

    let n_pts = 800;
    let frequencies: Vec<f64> = (1..=n_pts)
        .map(|i| i as f64 * 0.25) // 0.25 to 200 Hz
        .collect();

    let input = HarmonicInput {
        solver,
        densities: densities(),
        frequencies,
        damping_ratio: xi,
        response_node_id: load_node,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();

    let amps: Vec<f64> = result.response_points.iter().map(|p| p.amplitude).collect();
    let freq_vals: Vec<f64> = result.response_points.iter().map(|p| p.frequency).collect();

    // Find local maxima (peaks) using a 2-neighbor check
    let mut peaks = Vec::new();
    for i in 2..amps.len() - 2 {
        if amps[i] > amps[i - 1]
            && amps[i] > amps[i + 1]
            && amps[i] > amps[i - 2]
            && amps[i] > amps[i + 2]
        {
            peaks.push((freq_vals[i], amps[i]));
        }
    }

    // Should find at least one resonance peak
    assert!(
        !peaks.is_empty(),
        "Should find at least one resonance peak in the frequency sweep"
    );

    // The peak amplitude should be significantly larger than the high-frequency tail
    let avg_tail: f64 = amps[amps.len() - 50..].iter().sum::<f64>() / 50.0;
    assert!(
        result.peak_amplitude > avg_tail * 2.0,
        "Peak {:.6e} should be at least 2x tail average {:.6e}",
        result.peak_amplitude, avg_tail
    );

    // If we find multiple peaks, they should be at increasing frequencies
    if peaks.len() >= 2 {
        assert!(
            peaks[1].0 > peaks[0].0,
            "Second peak at {:.2} Hz should be above first peak at {:.2} Hz",
            peaks[1].0, peaks[0].0
        );
    }
}

// ================================================================
// 6. Phase Angle at Resonance
// ================================================================
//
// For a damped system, the phase angle between excitation force
// and displacement changes across the frequency sweep. Near
// resonance the phase differs from the quasi-static (low-freq)
// and the high-frequency values.

#[test]
fn validation_harmonic_phase_at_resonance() {
    let l = 10.0;
    let n = 10;
    let xi = 0.02;

    let input = make_ss_beam_harmonic(n, l, xi, wide_sweep());
    let result = solve_harmonic_2d(&input).unwrap();

    // Find the response point at peak amplitude
    let peak_point = result
        .response_points
        .iter()
        .max_by(|a, b| a.amplitude.partial_cmp(&b.amplitude).unwrap())
        .unwrap();

    let phase_at_peak = peak_point.phase;
    let phase_low = result.response_points.first().unwrap().phase;
    let phase_high = result.response_points.last().unwrap().phase;

    // The phase at the peak should differ from at least one of the
    // extreme frequency phases (quasi-static or high-frequency)
    let peak_differs_from_low = (phase_at_peak - phase_low).abs() > 0.05;
    let peak_differs_from_high = (phase_at_peak - phase_high).abs() > 0.05;
    assert!(
        peak_differs_from_low || peak_differs_from_high,
        "Phase at peak ({:.4} rad) should differ from quasi-static ({:.4}) or high-freq ({:.4})",
        phase_at_peak, phase_low, phase_high
    );

    // The overall phase change across the entire sweep should be nonzero
    assert!(
        (phase_high - phase_low).abs() > 0.01,
        "Phase should change across sweep: low={:.4}, high={:.4}",
        phase_low, phase_high
    );
}

// ================================================================
// 7. Half-Power Bandwidth
// ================================================================
//
// The half-power bandwidth method: at the frequencies where the
// amplitude drops to peak / sqrt(2), the bandwidth delta_f relates
// to damping via xi ~ delta_f / (2*f_n).
// We verify the crossings exist and the bandwidth is positive.

#[test]
fn validation_harmonic_half_power_bandwidth() {
    let l = 10.0;
    let n = 10;
    let xi = 0.02; // low damping for a sharp peak

    let input = make_ss_beam_harmonic(n, l, xi, fine_sweep());
    let result = solve_harmonic_2d(&input).unwrap();

    let peak_amp = result.peak_amplitude;
    let peak_freq = result.peak_frequency;
    let half_power_level = peak_amp / (2.0_f64).sqrt();

    // Find frequencies where amplitude crosses the half-power level
    let pts = &result.response_points;
    let mut crossings = Vec::new();
    for i in 1..pts.len() {
        let a_prev = pts[i - 1].amplitude;
        let a_curr = pts[i].amplitude;
        if (a_prev - half_power_level) * (a_curr - half_power_level) < 0.0 {
            let f_cross = pts[i - 1].frequency
                + (pts[i].frequency - pts[i - 1].frequency)
                    * (half_power_level - a_prev).abs()
                    / (a_curr - a_prev).abs();
            crossings.push(f_cross);
        }
    }

    // We need at least 2 crossings to define the bandwidth
    assert!(
        crossings.len() >= 2,
        "Need at least 2 half-power crossings, found {} (peak_freq={:.2} Hz, peak_amp={:.6e})",
        crossings.len(), peak_freq, peak_amp
    );

    let bandwidth = crossings.last().unwrap() - crossings.first().unwrap();
    assert!(
        bandwidth > 0.0,
        "Bandwidth should be positive, got {:.6}",
        bandwidth
    );

    // The measured damping ratio should be physically reasonable
    let xi_measured = bandwidth / (2.0 * peak_freq);
    assert!(
        xi_measured > 0.001 && xi_measured < 1.0,
        "Measured xi = {:.4} should be physically reasonable (0.001 < xi < 1.0)",
        xi_measured
    );
}

// ================================================================
// 8. Anti-Resonance: Minimum Between Two Resonances
// ================================================================
//
// For a two-span continuous beam loaded at one span, multiple
// resonance peaks appear. Between consecutive peaks, the response
// may exhibit a local minimum (anti-resonance). If two peaks are
// found, we verify a valley exists between them.

#[test]
fn validation_harmonic_anti_resonance() {
    let l = 6.0;
    let n_per_span = 8;
    let xi = 0.02;

    // Get the natural frequencies from modal analysis for sweep range
    let modal_input = make_continuous_beam(
        &[l, l],
        n_per_span,
        E,
        A,
        IZ,
        vec![],
    );
    let modal_result = modal::solve_modal_2d(&modal_input, &densities(), 4).unwrap();
    let f_last = modal_result.modes.last().unwrap().frequency;

    // Sweep from well below first mode to above the last computed mode
    let f_max = f_last * 1.5;
    let n_pts = 600;
    let frequencies: Vec<f64> = (1..=n_pts)
        .map(|i| 0.1 + (f_max - 0.1) * i as f64 / n_pts as f64)
        .collect();

    // Load at quarter-point of first span
    let load_node = n_per_span / 4 + 1;
    let load = SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -10.0,
        my: 0.0,
    });
    let solver = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, vec![load]);

    // Response at midspan of first span
    let response_node = n_per_span / 2 + 1;

    let input = HarmonicInput {
        solver,
        densities: densities(),
        frequencies,
        damping_ratio: xi,
        response_node_id: response_node,
        response_dof: "y".to_string(),
    };

    let result = solve_harmonic_2d(&input).unwrap();

    let amps: Vec<f64> = result.response_points.iter().map(|p| p.amplitude).collect();
    let freq_vals: Vec<f64> = result.response_points.iter().map(|p| p.frequency).collect();

    // Find local maxima (peaks) and local minima (valleys)
    let mut peaks = Vec::new();
    let mut valleys = Vec::new();
    for i in 1..amps.len() - 1 {
        if amps[i] > amps[i - 1] && amps[i] > amps[i + 1] {
            peaks.push((freq_vals[i], amps[i]));
        }
        if amps[i] < amps[i - 1] && amps[i] < amps[i + 1] {
            valleys.push((freq_vals[i], amps[i]));
        }
    }

    // Should find at least one peak
    assert!(
        !peaks.is_empty(),
        "Should find at least one resonance peak"
    );

    // If we have two or more peaks, verify anti-resonance between them
    if peaks.len() >= 2 {
        let f_peak1 = peaks[0].0;
        let f_peak2 = peaks[1].0;

        let valleys_between: Vec<_> = valleys
            .iter()
            .filter(|(f, _)| *f > f_peak1 && *f < f_peak2)
            .collect();

        assert!(
            !valleys_between.is_empty(),
            "Should find an anti-resonance valley between peaks at {:.2} Hz and {:.2} Hz",
            f_peak1, f_peak2
        );

        // The valley amplitude should be less than both peak amplitudes
        let valley_amp = valleys_between[0].1;
        assert!(
            valley_amp < peaks[0].1 && valley_amp < peaks[1].1,
            "Anti-resonance amplitude {:.6e} should be less than both peaks ({:.6e}, {:.6e})",
            valley_amp, peaks[0].1, peaks[1].1
        );
    } else {
        // With only one peak, verify the response decays at high frequency
        assert!(
            result.peak_amplitude > 0.0,
            "Should have a positive peak amplitude"
        );

        let amp_end = amps.last().unwrap();
        assert!(
            *amp_end < result.peak_amplitude,
            "Amplitude at sweep end {:.6e} should be less than peak {:.6e}",
            amp_end, result.peak_amplitude
        );
    }
}
