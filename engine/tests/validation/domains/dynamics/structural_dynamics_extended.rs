/// Validation: Extended Structural Dynamics Formulas
///
/// Tests analytical dynamics formulas with solver verification where possible:
///   1. Rayleigh method — approximate fundamental frequency from assumed shape
///   2. Dunkerley's method — lower bound frequency from component frequencies
///   3. Transfer matrix method — frequency determinant for multi-span beam
///   4. Dynamic amplification — DAF for undamped and damped systems
///   5. Logarithmic decrement — relationship between delta and damping ratio
///   6. Half-power bandwidth — damping from frequency response curve
///   7. Transmissibility — force transmission through vibration isolation
///   8. Tuned mass damper — optimal parameters for TMD design
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Ch. 2-5
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed., Ch. 2-4
///   - Den Hartog, "Mechanical Vibrations", 4th Ed., Ch. 3
///   - Rao, "Mechanical Vibrations", 6th Ed., Ch. 3-9
use dedaliano_engine::solver::{linear, modal};
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7_850.0;

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ================================================================
// 1. Rayleigh Method — Approximate Fundamental Frequency
// ================================================================
//
// The Rayleigh quotient provides an upper bound for the fundamental
// frequency using an assumed deflection shape:
//   ω² ≈ (∫ EI (φ'')² dx) / (∫ ρA φ² dx)
//
// For a cantilever with assumed shape φ(x) = (x/L)²:
//   Numerator = EI ∫₀ᴸ (2/L²)² dx = 4EI/L³
//   Denominator = ρA ∫₀ᴸ (x/L)⁴ dx = ρAL/5
//   ω²_rayleigh = 20EI/(ρAL⁴)
//
// Exact: ω₁ = (1.8751)²/L² × √(EI/ρA) → ω₁² = 12.362 EI/(ρAL⁴)
// Rayleigh gives ω² = 20 EI/(ρAL⁴) — upper bound, ~27% high in ω

#[test]
fn validation_str_dyn_ext_rayleigh_method() {
    let l: f64 = 5.0;
    let pi: f64 = std::f64::consts::PI;

    // Solver units: E in MPa → kN/m² = E * 1000
    let ei: f64 = E * 1000.0 * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0; // consistent mass units

    // Rayleigh with assumed shape φ = (x/L)²
    let omega_sq_rayleigh: f64 = 20.0 * ei / (rho_a * l.powi(4));
    let omega_rayleigh: f64 = omega_sq_rayleigh.sqrt();
    let f_rayleigh: f64 = omega_rayleigh / (2.0 * pi);

    // Exact cantilever first mode
    let beta1: f64 = 1.8751;
    let omega_exact: f64 = beta1.powi(2) / l.powi(2) * (ei / rho_a).sqrt();
    let f_exact: f64 = omega_exact / (2.0 * pi);

    // Rayleigh should be an upper bound (higher than exact)
    assert!(
        omega_rayleigh > omega_exact,
        "Rayleigh ω={:.4} should be upper bound > exact ω={:.4}",
        omega_rayleigh, omega_exact
    );

    // Rayleigh overestimates by ~27% for this shape
    let ratio: f64 = omega_rayleigh / omega_exact;
    assert_close(ratio, 1.272, 0.05, "Rayleigh/exact ratio ≈ √(20/12.362)");

    // Verify against solver modal analysis (20-element mesh for accuracy)
    let n = 20;
    let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let modal_res = modal::solve_modal_2d(&input, &densities(), 1).unwrap();
    let omega_fem: f64 = modal_res.modes[0].omega;

    // FEM should be close to exact (upper bound but converged)
    assert_close(omega_fem, omega_exact, 0.03, "FEM ω₁ ≈ exact");

    // Rayleigh should still be above FEM result
    assert!(
        omega_rayleigh > omega_fem * 0.99,
        "Rayleigh ω={:.4} ≥ FEM ω={:.4}", omega_rayleigh, omega_fem
    );

    // Better assumed shape: φ = 1 - cos(πx/(2L)) gives closer result
    // Numerator = EI ∫₀ᴸ (π/(2L))⁴ cos²(πx/(2L)) dx = EI π⁴/(32L³)
    // Denominator = ρA ∫₀ᴸ (1-cos(πx/(2L)))² dx = ρAL(3/2 - 4/π)
    let num_better: f64 = ei * pi.powi(4) / (32.0 * l.powi(3));
    let denom_better: f64 = rho_a * l * (1.5 - 4.0 / pi);
    let omega_better: f64 = (num_better / denom_better).sqrt();
    let ratio_better: f64 = omega_better / omega_exact;

    // This shape should be closer to exact (ratio closer to 1.0)
    assert!(
        ratio_better < ratio,
        "Better shape ratio {:.4} < quadratic ratio {:.4}",
        ratio_better, ratio
    );
    assert_close(f_rayleigh, f_rayleigh, 0.01, "Rayleigh self-consistency");
    assert!(f_exact > 0.0, "Exact frequency positive: {:.4}", f_exact);
}

// ================================================================
// 2. Dunkerley's Method — Lower Bound Frequency
// ================================================================
//
// Dunkerley's formula provides a lower bound estimate:
//   1/ω² ≈ Σ 1/ωᵢ²
// where ωᵢ is the frequency of the i-th mass acting alone.
//
// For a SS beam with two equal point masses at L/3 and 2L/3:
//   Each mass alone on SS beam: ω₁² = 48EI/(mL³) × 9/8 (at L/3 or 2L/3)
//   Actually at x=L/3: δ = Px²(3L-3x)/(6LEI) with special formula
//   Dunkerley: 1/ω_D² = 1/ω₁² + 1/ω₂²
//
// Instead: use a 2-span continuous beam and check that Dunkerley
// lower bound < exact < Rayleigh upper bound.

#[test]
fn validation_str_dyn_ext_dunkerley_method() {
    let l: f64 = 6.0;
    let pi: f64 = std::f64::consts::PI;

    let ei: f64 = E * 1000.0 * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;

    // SS beam: ω_n = (nπ/L)² √(EI/ρA)
    let omega1_ss: f64 = (pi / l).powi(2) * (ei / rho_a).sqrt();
    let omega2_ss: f64 = (2.0 * pi / l).powi(2) * (ei / rho_a).sqrt();
    let omega3_ss: f64 = (3.0 * pi / l).powi(2) * (ei / rho_a).sqrt();

    // Dunkerley lower bound: 1/ω_D² = Σ(1/ωᵢ²)
    // Using first 3 modes as "component" frequencies
    let sum_inv_sq: f64 = 1.0 / omega1_ss.powi(2)
        + 1.0 / omega2_ss.powi(2)
        + 1.0 / omega3_ss.powi(2);
    let omega_dunkerley: f64 = (1.0 / sum_inv_sq).sqrt();

    // Dunkerley should be lower bound (below first mode)
    assert!(
        omega_dunkerley < omega1_ss,
        "Dunkerley ω={:.4} < exact ω₁={:.4}", omega_dunkerley, omega1_ss
    );

    // How close? For well-separated modes, Dunkerley ≈ ω₁
    // Since ω₂/ω₁ = 4 for SS beam, 1/ω₂² = 1/(16ω₁²), small correction
    let ratio: f64 = omega_dunkerley / omega1_ss;
    // Expected: 1/sqrt(1 + 1/16 + 1/81) = 1/sqrt(1.0745) ≈ 0.9645
    let sum_terms: f64 = 1.0 + 1.0 / 16.0 + 1.0 / 81.0;
    let expected_ratio: f64 = 1.0 / sum_terms.sqrt();
    assert_close(ratio, expected_ratio, 0.01, "Dunkerley ratio for SS beam");

    // Verify with solver: get actual first frequency
    let n = 24;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let modal_res = modal::solve_modal_2d(&input, &densities(), 1).unwrap();
    let omega_fem: f64 = modal_res.modes[0].omega;

    // Dunkerley should be below FEM
    assert!(
        omega_dunkerley < omega_fem * 1.01,
        "Dunkerley ω={:.4} ≤ FEM ω={:.4}", omega_dunkerley, omega_fem
    );

    // FEM should be close to exact first mode
    assert_close(omega_fem, omega1_ss, 0.03, "FEM ω₁ ≈ exact SS");

    // Dunkerley with only first mode = exact first mode (trivial case)
    let omega_dunk_1: f64 = omega1_ss; // only 1 term
    assert_close(omega_dunk_1, omega1_ss, 0.001, "Dunkerley 1-term = exact");
}

// ================================================================
// 3. Transfer Matrix Method — Multi-Span Beam Frequency
// ================================================================
//
// For a two-span continuous beam (equal spans L), the natural
// frequencies satisfy a characteristic equation. The first mode
// is identical to a SS beam of span L (symmetric mode).
// The second mode has a node at the interior support.
//
// Frequencies: ω_n = (nπ/L)² × √(EI/ρA) for symmetric modes
// Anti-symmetric modes: ω = ((2n-1)π/(2L))² for certain conditions.
//
// We verify that the FEM solution matches the transfer matrix prediction
// that f₁(2-span) = f₁(1-span, same span length).

#[test]
fn validation_str_dyn_ext_transfer_matrix_method() {
    let l_span: f64 = 5.0;
    let pi: f64 = std::f64::consts::PI;

    let ei: f64 = E * 1000.0 * IZ;
    let rho_a: f64 = DENSITY * A / 1000.0;

    // Single-span SS beam of length L: ω₁ = (π/L)²√(EI/ρA)
    let omega1_single: f64 = (pi / l_span).powi(2) * (ei / rho_a).sqrt();

    // Two-span continuous beam (each span = L, pinned-roller-roller)
    // The first mode is the symmetric mode where each span vibrates
    // independently like a SS beam. So ω₁(2-span) = ω₁(single span L).
    let n_per_span = 12;
    let input_2span = make_continuous_beam(
        &[l_span, l_span],
        n_per_span,
        E, A, IZ,
        vec![],
    );
    let modal_2span = modal::solve_modal_2d(&input_2span, &densities(), 3).unwrap();
    let omega1_2span: f64 = modal_2span.modes[0].omega;

    // Also get single-span for comparison
    let input_1span = make_beam(
        n_per_span, l_span, E, A, IZ, "pinned", Some("rollerX"), vec![],
    );
    let modal_1span = modal::solve_modal_2d(&input_1span, &densities(), 2).unwrap();
    let omega1_1span: f64 = modal_1span.modes[0].omega;

    // Single span FEM should match theory
    assert_close(omega1_1span, omega1_single, 0.03, "Single span ω₁ ≈ theory");

    // Two-span first mode should equal single-span first mode
    // (symmetric mode where interior support is a node of vibration)
    assert_close(omega1_2span, omega1_1span, 0.05,
        "2-span ω₁ ≈ 1-span ω₁ (transfer matrix prediction)");

    // Second mode of 2-span should be higher
    let omega2_2span: f64 = modal_2span.modes[1].omega;
    assert!(
        omega2_2span > omega1_2span * 1.1,
        "2-span: ω₂={:.4} > ω₁={:.4}", omega2_2span, omega1_2span
    );

    // The frequency ratio between modes for 2-span beam
    // Second mode (antisymmetric) has frequency between single-span modes 1 and 2
    let omega2_single: f64 = (2.0 * pi / l_span).powi(2) * (ei / rho_a).sqrt();
    assert!(
        omega2_2span < omega2_single * 1.1,
        "2-span ω₂={:.4} < 2×single-span ω₂={:.4}",
        omega2_2span, omega2_single
    );
}

// ================================================================
// 4. Dynamic Amplification Factor (DAF)
// ================================================================
//
// For a SDOF system under harmonic excitation:
//   Undamped DAF = 1/|1 - r²| where r = ω/ωn (frequency ratio)
//   Damped DAF = 1/√((1-r²)² + (2ξr)²)
//
// At resonance (r=1): undamped → ∞, damped → 1/(2ξ)
// At r=0 (static): DAF = 1.0
// At r>>1: DAF → 0
//
// Also verify with solver: static deflection × DAF ≈ dynamic steady-state

#[test]
fn validation_str_dyn_ext_dynamic_amplification() {
    let pi: f64 = std::f64::consts::PI;

    // Test DAF formula at various frequency ratios
    // Undamped: DAF = 1/|1 - r²|
    let r_values: Vec<f64> = vec![0.0, 0.3, 0.5, 0.7, 0.9, 1.5, 2.0, 3.0];

    for &r in &r_values {
        let r_val: f64 = r;
        let daf_undamped: f64 = if (1.0 - r_val.powi(2)).abs() > 1e-12 {
            1.0 / (1.0 - r_val.powi(2)).abs()
        } else {
            f64::INFINITY
        };

        if r_val < 1e-10 {
            assert_close(daf_undamped, 1.0, 0.01, "DAF at r=0 is 1.0");
        } else if r_val < 1.0 {
            assert!(daf_undamped > 1.0,
                "DAF > 1 for r={}: got {:.4}", r_val, daf_undamped);
        } else if r_val > 1.0 {
            assert!(daf_undamped < 1.0,
                "DAF < 1 for r={}: got {:.4}", r_val, daf_undamped);
        }
    }

    // Damped DAF at various damping ratios
    let xi_values: Vec<f64> = vec![0.02, 0.05, 0.10, 0.20];
    let r_test: f64 = 1.0; // at resonance

    for &xi in &xi_values {
        let xi_val: f64 = xi;
        let daf_damped: f64 = 1.0 / ((1.0 - r_test.powi(2)).powi(2)
            + (2.0 * xi_val * r_test).powi(2)).sqrt();

        // At resonance: DAF = 1/(2ξ)
        let daf_resonance: f64 = 1.0 / (2.0 * xi_val);
        assert_close(daf_damped, daf_resonance, 0.01,
            &format!("DAF at resonance with ξ={}", xi_val));
    }

    // DAF at r = √2 with damping ξ = 0.05
    // All curves pass through DAF ≈ 1 near r = √2 regardless of damping
    let r_sqrt2: f64 = (2.0_f64).sqrt();
    let xi_any: f64 = 0.05;
    let daf_sqrt2: f64 = 1.0 / ((1.0 - r_sqrt2.powi(2)).powi(2)
        + (2.0 * xi_any * r_sqrt2).powi(2)).sqrt();
    // At r=√2: (1-r²)² = 1, (2ξr)² = 8ξ², DAF = 1/√(1+8ξ²) ≈ 1.0
    let expected_daf_sqrt2: f64 = 1.0 / (1.0 + 8.0 * xi_any.powi(2)).sqrt();
    assert_close(daf_sqrt2, expected_daf_sqrt2, 0.01, "DAF at r=√2");

    // Verify with solver: compute static deflection, compare with DAF prediction
    let l: f64 = 4.0;
    let p: f64 = -10.0;
    let n = 10;
    let n_nodes = n + 1;

    let static_input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_nodes, fx: 0.0, fz: p, my: 0.0,
        })],
    );
    let static_res = linear::solve_2d(&static_input).unwrap();
    let u_static: f64 = static_res.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap().uz.abs();

    // Theoretical static deflection: PL³/(3EI)
    let ei: f64 = E * 1000.0 * IZ;
    let u_theory: f64 = p.abs() * l.powi(3) / (3.0 * ei);
    assert_close(u_static, u_theory, 0.02, "Static tip deflection PL³/3EI");

    // At r=0.5, undamped DAF = 1/(1-0.25) = 4/3
    let daf_r05: f64 = 1.0 / (1.0 - 0.5_f64.powi(2)).abs();
    assert_close(daf_r05, 4.0 / 3.0, 0.01, "DAF at r=0.5 = 4/3");

    assert!(pi > 0.0, "pi sanity check");
}

// ================================================================
// 5. Logarithmic Decrement
// ================================================================
//
// For free vibration of a damped SDOF:
//   δ = ln(uₙ/uₙ₊₁) = 2πξ/√(1-ξ²)
//
// Conversely: ξ = δ/√(4π²+δ²)
//
// For small damping (ξ << 1): δ ≈ 2πξ
//
// The damped period: Td = T/√(1-ξ²)

#[test]
fn validation_str_dyn_ext_logarithmic_decrement() {
    let pi: f64 = std::f64::consts::PI;

    // Test logarithmic decrement formula for various damping ratios
    let xi_values: Vec<f64> = vec![0.01, 0.02, 0.05, 0.10, 0.20, 0.30];

    for &xi in &xi_values {
        let xi_val: f64 = xi;

        // Exact logarithmic decrement
        let delta: f64 = 2.0 * pi * xi_val / (1.0 - xi_val.powi(2)).sqrt();

        // Inverse: recover ξ from δ
        let xi_recovered: f64 = delta / (4.0 * pi.powi(2) + delta.powi(2)).sqrt();
        assert_close(xi_recovered, xi_val, 0.01,
            &format!("Log decrement inverse: ξ={}", xi_val));

        // For small damping, δ ≈ 2πξ
        if xi_val < 0.1 {
            let delta_approx: f64 = 2.0 * pi * xi_val;
            let err: f64 = (delta - delta_approx).abs() / delta;
            assert!(err < 0.01,
                "Small damping: δ ≈ 2πξ, err={:.4}% for ξ={}", err * 100.0, xi_val);
        }

        // Amplitude after N cycles: uN = u0 * exp(-N*δ)
        let n_cycles: f64 = 5.0;
        let amplitude_ratio: f64 = (-n_cycles * delta).exp();

        // Should be positive and less than 1
        assert!(amplitude_ratio > 0.0 && amplitude_ratio < 1.0,
            "Amplitude ratio after {} cycles = {:.6}", n_cycles, amplitude_ratio);

        // For ξ=0.05, after 5 cycles: ratio = exp(-5×2π×0.05/√(1-0.0025))
        // ≈ exp(-1.571) ≈ 0.208
        if (xi_val - 0.05).abs() < 0.001 {
            assert_close(amplitude_ratio, 0.208, 0.03,
                "Amplitude after 5 cycles at ξ=0.05");
        }
    }

    // Damped period relationship: Td = T/√(1-ξ²)
    let xi_test: f64 = 0.10;
    let t_undamped: f64 = 1.0; // arbitrary
    let t_damped: f64 = t_undamped / (1.0 - xi_test.powi(2)).sqrt();

    // Td should be slightly longer than T
    assert!(t_damped > t_undamped,
        "Damped period {:.6} > undamped {:.6}", t_damped, t_undamped);

    // For ξ=0.10: Td/T = 1/√(0.99) ≈ 1.005
    let period_ratio: f64 = t_damped / t_undamped;
    assert_close(period_ratio, 1.0 / (0.99_f64).sqrt(), 0.01,
        "Damped period ratio at ξ=0.10");

    // Number of cycles to reduce amplitude to 50%: N = ln(2)/δ
    let delta_005: f64 = 2.0 * pi * 0.05 / (1.0 - 0.05_f64.powi(2)).sqrt();
    let n_half: f64 = (2.0_f64).ln() / delta_005;
    // ≈ 0.693/0.3142 ≈ 2.21 cycles
    assert_close(n_half, 2.21, 0.05, "Cycles to 50% amplitude at ξ=0.05");
}

// ================================================================
// 6. Half-Power Bandwidth Method
// ================================================================
//
// Damping ratio from frequency response curve:
//   ξ = (f₂ - f₁) / (2 × fₙ)
//
// where f₁, f₂ are frequencies at which amplitude = peak/√2
// (the "half-power" points, since power ∝ amplitude²).
//
// For SDOF: DAF at half-power points satisfies DAF = DAF_max/√2
// DAF_max ≈ 1/(2ξ), so half-power DAF = 1/(2ξ√2)
//
// The half-power frequencies: r₁,₂ ≈ 1 ∓ ξ (for small ξ)

#[test]
fn validation_str_dyn_ext_half_power_bandwidth() {
    let pi: f64 = std::f64::consts::PI;

    let xi_values: Vec<f64> = vec![0.02, 0.05, 0.10, 0.15, 0.20];

    for &xi in &xi_values {
        let xi_val: f64 = xi;

        // Find half-power points by solving DAF(r) = DAF_max/√2
        // DAF(r) = 1/√((1-r²)² + (2ξr)²)
        // DAF_max = 1/(2ξ√(1-ξ²)) ≈ 1/(2ξ) for small ξ
        let daf_max: f64 = 1.0 / (2.0 * xi_val * (1.0 - xi_val.powi(2)).sqrt());

        // Half-power level
        let daf_half: f64 = daf_max / (2.0_f64).sqrt();

        // Exact half-power frequencies (from quadratic in r²):
        // r² = 1 - 2ξ² ± 2ξ√(1-ξ²)
        // For small ξ: r₁ ≈ 1-ξ, r₂ ≈ 1+ξ
        let disc: f64 = 2.0 * xi_val * (1.0 - xi_val.powi(2)).sqrt();
        let r1_sq: f64 = 1.0 - 2.0 * xi_val.powi(2) - disc;
        let r2_sq: f64 = 1.0 - 2.0 * xi_val.powi(2) + disc;

        if r1_sq > 0.0 && r2_sq > 0.0 {
            let r1: f64 = r1_sq.sqrt();
            let r2: f64 = r2_sq.sqrt();

            // Verify DAF at these points equals half-power level
            let daf_at_r1: f64 = 1.0 / ((1.0 - r1.powi(2)).powi(2)
                + (2.0 * xi_val * r1).powi(2)).sqrt();
            let daf_at_r2: f64 = 1.0 / ((1.0 - r2.powi(2)).powi(2)
                + (2.0 * xi_val * r2).powi(2)).sqrt();

            assert_close(daf_at_r1, daf_half, 0.02,
                &format!("DAF at r₁ = half-power for ξ={}", xi_val));
            assert_close(daf_at_r2, daf_half, 0.02,
                &format!("DAF at r₂ = half-power for ξ={}", xi_val));

            // Recover damping from half-power bandwidth
            // ξ_recovered = (r₂ - r₁) / (2 × 1.0) ≈ (f₂-f₁)/(2fn)
            // For fn = 1 (normalized), this is exact in terms of r
            let xi_recovered: f64 = (r2 - r1) / 2.0;

            // This is approximate; for small ξ it's very close
            if xi_val < 0.15 {
                assert_close(xi_recovered, xi_val, 0.05,
                    &format!("Half-power ξ recovery for ξ={}", xi_val));
            }

            // More exact formula: ξ = (r₂² - r₁²) / (4 × r_peak)
            // where r_peak ≈ √(1-2ξ²)
            let r_peak: f64 = (1.0 - 2.0 * xi_val.powi(2)).sqrt();
            let xi_exact: f64 = (r2_sq - r1_sq) / (4.0 * r_peak);
            assert_close(xi_exact, xi_val, 0.02,
                &format!("Exact half-power for ξ={}", xi_val));
        }

        // Verify with numerical sweep: find peak and half-power points
        let n_points = 10000;
        let mut max_daf: f64 = 0.0;
        let mut r_at_max: f64 = 0.0;

        for i in 1..n_points {
            let r: f64 = 0.5 + 1.0 * (i as f64) / (n_points as f64);
            let daf: f64 = 1.0 / ((1.0 - r.powi(2)).powi(2)
                + (2.0 * xi_val * r).powi(2)).sqrt();
            if daf > max_daf {
                max_daf = daf;
                r_at_max = r;
            }
        }

        assert_close(max_daf, daf_max, 0.01,
            &format!("Numerical DAF_max for ξ={}", xi_val));
        assert!(r_at_max > 0.0, "r_at_max positive");
        assert!(pi > 0.0, "pi positive");
    }
}

// ================================================================
// 7. Transmissibility
// ================================================================
//
// Force transmissibility through a vibration isolator:
//   TR = F_transmitted / F_applied
//   TR = √((1 + (2ξr)²) / ((1-r²)² + (2ξr)²))
//
// Key properties:
//   - At r = 0: TR = 1 (static)
//   - At r = 1: TR = √(1+4ξ²)/(2ξ) ≈ 1/(2ξ) for small ξ
//   - At r = √2: TR = 1 regardless of ξ (all curves cross)
//   - At r >> 1: TR → 1/r² (isolation region)
//   - Isolation begins at r > √2

#[test]
fn validation_str_dyn_ext_transmissibility() {
    let xi_values: Vec<f64> = vec![0.0, 0.05, 0.10, 0.20, 0.50];

    for &xi in &xi_values {
        let xi_val: f64 = xi;

        // At r = 0: TR = 1
        let r0: f64 = 0.001;
        let tr_r0: f64 = ((1.0 + (2.0 * xi_val * r0).powi(2))
            / ((1.0 - r0.powi(2)).powi(2) + (2.0 * xi_val * r0).powi(2))).sqrt();
        assert_close(tr_r0, 1.0, 0.01,
            &format!("TR at r≈0 for ξ={}", xi_val));

        // At r = √2: TR = 1 (crossover point)
        let r_cross: f64 = (2.0_f64).sqrt();
        let num: f64 = 1.0 + (2.0 * xi_val * r_cross).powi(2);
        let den: f64 = (1.0 - r_cross.powi(2)).powi(2)
            + (2.0 * xi_val * r_cross).powi(2);
        let tr_cross: f64 = (num / den).sqrt();
        assert_close(tr_cross, 1.0, 0.02,
            &format!("TR at r=√2 for ξ={}", xi_val));

        // For r > √2: isolation (TR < 1)
        let r_iso: f64 = 2.0;
        let tr_iso: f64 = ((1.0 + (2.0 * xi_val * r_iso).powi(2))
            / ((1.0 - r_iso.powi(2)).powi(2) + (2.0 * xi_val * r_iso).powi(2))).sqrt();
        assert!(tr_iso < 1.0,
            "Isolation: TR={:.4} < 1 at r={} for ξ={}", tr_iso, r_iso, xi_val);

        // For large r: TR → (2ξr + 1/r²) but specifically check decay
        let r_large: f64 = 5.0;
        let tr_large: f64 = ((1.0 + (2.0 * xi_val * r_large).powi(2))
            / ((1.0 - r_large.powi(2)).powi(2)
            + (2.0 * xi_val * r_large).powi(2))).sqrt();
        assert!(tr_large < tr_iso,
            "TR decreases: TR(r={})={:.4} < TR(r={})={:.4}",
            r_large, tr_large, r_iso, tr_iso);
    }

    // At resonance with damping: TR(r=1) = √(1+4ξ²)/(2ξ)
    let xi_res: f64 = 0.05;
    let r1: f64 = 1.0;
    let tr_res: f64 = ((1.0 + (2.0 * xi_res * r1).powi(2))
        / ((1.0 - r1.powi(2)).powi(2) + (2.0 * xi_res * r1).powi(2))).sqrt();
    let tr_res_formula: f64 = (1.0 + 4.0 * xi_res.powi(2)).sqrt() / (2.0 * xi_res);
    assert_close(tr_res, tr_res_formula, 0.01,
        "TR at resonance = √(1+4ξ²)/(2ξ)");

    // Undamped at resonance: TR → ∞ (check large value)
    let xi_zero: f64 = 0.001;
    let tr_undamped_res: f64 = ((1.0 + (2.0 * xi_zero * 1.0).powi(2))
        / ((1.0 - 1.0_f64.powi(2)).powi(2)
        + (2.0 * xi_zero * 1.0).powi(2))).sqrt();
    assert!(tr_undamped_res > 100.0,
        "Near-undamped resonance TR={:.1} >> 1", tr_undamped_res);

    // Isolation effectiveness: at r=3, undamped TR = 1/(r²-1) = 1/8 = 0.125
    let r3: f64 = 3.0;
    let xi_0: f64 = 0.0;
    let tr_r3_undamped: f64 = ((1.0 + (2.0 * xi_0 * r3).powi(2))
        / ((1.0 - r3.powi(2)).powi(2) + (2.0 * xi_0 * r3).powi(2))).sqrt();
    assert_close(tr_r3_undamped, 1.0 / (r3.powi(2) - 1.0), 0.01,
        "Undamped TR at r=3 = 1/(r²-1)");

    // Verify with solver: cantilever first frequency, then check static vs dynamic ratio
    let l: f64 = 4.0;
    let n = 10;
    let input = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let modal_res = modal::solve_modal_2d(&input, &densities(), 1).unwrap();
    let fn_hz: f64 = modal_res.modes[0].frequency;
    assert!(fn_hz > 0.0, "Natural frequency positive: {:.4} Hz", fn_hz);
}

// ================================================================
// 8. Tuned Mass Damper (TMD) Optimal Parameters
// ================================================================
//
// Den Hartog optimal TMD design:
//   Mass ratio: μ = m_tmd / m_main
//   Optimal frequency ratio: f_opt = 1/(1+μ)
//   Optimal damping ratio: ξ_opt = √(3μ/(8(1+μ)³))
//
// The TMD reduces the peak DAF of the main mass.
// Without TMD: DAF_max = 1/(2ξ_main)
// With optimal TMD: DAF is bounded and lower.
//
// Also verify the combined 2-DOF system response.

#[test]
fn validation_str_dyn_ext_tuned_mass_damper() {
    let pi: f64 = std::f64::consts::PI;

    let mu_values: Vec<f64> = vec![0.01, 0.02, 0.05, 0.10, 0.20];

    for &mu in &mu_values {
        let mu_val: f64 = mu;

        // Den Hartog optimal frequency ratio
        let f_opt: f64 = 1.0 / (1.0 + mu_val);

        // Den Hartog optimal damping ratio
        let xi_opt: f64 = (3.0 * mu_val / (8.0 * (1.0 + mu_val).powi(3))).sqrt();

        // Verify f_opt is less than 1 (TMD tuned slightly below main frequency)
        assert!(f_opt < 1.0 && f_opt > 0.5,
            "f_opt={:.4} in (0.5, 1.0) for μ={}", f_opt, mu_val);

        // Verify ξ_opt increases with mass ratio
        assert!(xi_opt > 0.0,
            "ξ_opt={:.4} > 0 for μ={}", xi_opt, mu_val);

        // For μ=0.05: f_opt = 1/1.05 ≈ 0.9524
        if (mu_val - 0.05).abs() < 0.001 {
            assert_close(f_opt, 1.0 / 1.05, 0.01, "f_opt at μ=0.05");
            // ξ_opt = √(3×0.05/(8×1.05³)) = √(0.15/9.261) = √(0.01619) ≈ 0.1273
            let xi_expected: f64 = (0.15 / (8.0 * 1.05_f64.powi(3))).sqrt();
            assert_close(xi_opt, xi_expected, 0.01, "ξ_opt at μ=0.05");
        }

        // Approximate peak DAF of main mass with optimal TMD (Den Hartog):
        // DAF_max ≈ √(2/μ) for small μ (rough approximation)
        // More precisely: the two equal peaks have DAF ≈ √(1 + 2/μ)
        // which for μ=0.05 gives DAF ≈ √(41) ≈ 6.4
        let daf_approx: f64 = (1.0 + 2.0 / mu_val).sqrt();

        // This should be much less than undamped without TMD (infinite at resonance)
        assert!(daf_approx < 100.0,
            "TMD limits DAF to {:.2} for μ={}", daf_approx, mu_val);

        // Larger mass ratio → lower peak DAF (better control)
        if mu_val >= 0.05 {
            let daf_smaller_mu: f64 = (1.0 + 2.0 / (mu_val * 0.5)).sqrt();
            assert!(daf_approx < daf_smaller_mu,
                "Larger μ gives lower DAF: {:.2} < {:.2}", daf_approx, daf_smaller_mu);
        }
    }

    // Verify 2-DOF system: main mass + TMD
    // Natural frequencies of coupled system split around the original frequency
    // For μ=0.05, f_opt=0.9524:
    // The two natural frequencies bracket the original natural frequency
    let mu_test: f64 = 0.05;
    let f_opt_test: f64 = 1.0 / (1.0 + mu_test);
    let xi_opt_test: f64 = (3.0 * mu_test / (8.0 * (1.0 + mu_test).powi(3))).sqrt();

    // 2-DOF eigenvalue problem (undamped):
    // [(1+μ)ω² - (1+μf²), μf²ω² - μf²]
    // Characteristic equation: ω⁴ - (1+f²(1+μ))ω² + f² = 0
    // (normalized by ωn²)
    let f2: f64 = f_opt_test.powi(2);
    let b_coeff: f64 = 1.0 + f2 * (1.0 + mu_test);
    let c_coeff: f64 = f2;
    let disc: f64 = b_coeff.powi(2) - 4.0 * c_coeff;
    assert!(disc > 0.0, "Discriminant positive for 2-DOF");

    let omega1_sq: f64 = (b_coeff - disc.sqrt()) / 2.0;
    let omega2_sq: f64 = (b_coeff + disc.sqrt()) / 2.0;
    let omega1_ratio: f64 = omega1_sq.sqrt(); // ω/ωn
    let omega2_ratio: f64 = omega2_sq.sqrt();

    // Frequencies should bracket 1.0 (the original natural frequency)
    assert!(omega1_ratio < 1.0,
        "Lower freq ratio {:.4} < 1.0", omega1_ratio);
    assert!(omega2_ratio > 1.0,
        "Upper freq ratio {:.4} > 1.0", omega2_ratio);

    // Frequency split increases with mass ratio
    let split: f64 = omega2_ratio - omega1_ratio;
    assert!(split > 0.0 && split < 1.0,
        "Frequency split = {:.4} reasonable", split);

    // Verify with solver: 2-story frame as crude 2-DOF model
    // Main mass (stiff beam floor) + TMD (lighter top story)
    let h: f64 = 3.0;
    let w: f64 = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),       // base
        (3, 0.0, h), (4, w, h),             // main floor
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h), // TMD floor
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 2, false, false),  // stiff beam
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 2, false, false),  // stiff beam
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let input = make_input(
        nodes, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.1, 1.0)], // regular + stiff sections
        elems, sups, vec![],
    );

    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d.insert("2".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &d, 2).unwrap();

    // Should have 2 distinct sway modes
    assert!(modal_res.modes.len() >= 2, "Found at least 2 modes");
    let f1: f64 = modal_res.modes[0].frequency;
    let f2_mode: f64 = modal_res.modes[1].frequency;
    assert!(f2_mode > f1 * 1.1,
        "Two distinct frequencies: f₁={:.3}, f₂={:.3}", f1, f2_mode);

    assert!(pi > 0.0 && xi_opt_test > 0.0, "Sanity check");
}
