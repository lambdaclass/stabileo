/// Validation: Structural Damping Models — Pure-Math Formulas
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th ed. (2017)
///   - Clough & Penzien, "Dynamics of Structures", 3rd ed. (2003)
///   - Rayleigh, "Theory of Sound", 2nd ed. (1896)
///   - Crandall, "The role of damping in vibration theory", J. Sound Vib. (1970)
///   - Nashif, Jones & Henderson, "Vibration Damping" (1985)
///   - EN 1998-1 (Eurocode 8), Clause 3.2.2.2 (Damping correction factor)
///
/// Tests verify damping-related formulas for structural dynamics.
/// No solver calls — pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Logarithmic Decrement — Free Vibration Decay
// ================================================================
//
// For a viscously damped SDOF system in free vibration:
//   x(t) = X * exp(-zeta*omega_n*t) * cos(omega_d*t - phi)
//
// The logarithmic decrement (ratio of successive peaks):
//   delta = ln(x_n / x_{n+1}) = 2*pi*zeta / sqrt(1 - zeta^2)
//
// For small damping (zeta << 1): delta ≈ 2*pi*zeta
//
// After n cycles: x_n / x_0 = exp(-n*delta)
//
// Ref: Chopra Ch.2, Clough & Penzien Ch.3

#[test]
fn validation_logarithmic_decrement_free_vibration() {
    let zeta: f64 = 0.05; // 5% damping ratio

    // Exact logarithmic decrement
    let delta = 2.0 * PI * zeta / (1.0 - zeta * zeta).sqrt();
    let expected = 2.0 * PI * 0.05 / (1.0 - 0.0025_f64).sqrt();
    assert_close(delta, expected, 1e-12, "logarithmic decrement");

    // Approximate (small damping): delta ≈ 2*pi*zeta
    let delta_approx = 2.0 * PI * zeta;
    let rel_err = (delta - delta_approx).abs() / delta;
    assert!(
        rel_err < 0.002,
        "approximate delta should be within 0.2% for zeta=5%, err={:.4}%",
        rel_err * 100.0
    );

    // Amplitude ratio after 1 cycle
    let ratio_1 = (-delta).exp();
    // After n cycles
    let n: f64 = 10.0;
    let ratio_n = (-n * delta).exp();

    // For zeta = 5%, after 10 cycles: exp(-10*0.3142) = exp(-3.142)
    let expected_ratio_10 = (-10.0_f64 * delta).exp();
    assert_close(ratio_n, expected_ratio_10, 1e-12, "amplitude after 10 cycles");

    // Damping ratio from measured decrement
    let zeta_recovered = delta / (4.0 * PI * PI + delta * delta).sqrt();
    assert_close(zeta_recovered, zeta, 1e-10, "recovered damping ratio");

    // For higher damping: zeta = 20%
    let zeta_high: f64 = 0.20;
    let delta_high = 2.0 * PI * zeta_high / (1.0 - zeta_high * zeta_high).sqrt();
    let delta_approx_high = 2.0 * PI * zeta_high;
    let err_high = (delta_high - delta_approx_high).abs() / delta_high;
    // For 20% damping, the approximation is less accurate
    assert!(
        err_high > rel_err,
        "approximation error should increase with damping ratio"
    );

    // 1 cycle decay for zeta = 5%: about 73% of original amplitude
    assert!(
        ratio_1 > 0.7 && ratio_1 < 0.75,
        "one-cycle ratio for 5% damping should be ~73%, got {:.2}%",
        ratio_1 * 100.0
    );
}

// ================================================================
// 2. Rayleigh Damping — Mass and Stiffness Proportional
// ================================================================
//
// Rayleigh damping matrix: C = a0*M + a1*K
//
// The damping ratio for mode i:
//   zeta_i = a0/(2*omega_i) + a1*omega_i/2
//
// Given damping ratios at two frequencies:
//   a0 = 2*omega_i*omega_j*(zeta_i*omega_j - zeta_j*omega_i) / (omega_j^2 - omega_i^2)
//   a1 = 2*(zeta_j*omega_j - zeta_i*omega_i) / (omega_j^2 - omega_i^2)
//
// For equal damping (zeta_i = zeta_j = zeta):
//   a0 = 2*zeta*omega_i*omega_j / (omega_i + omega_j)
//   a1 = 2*zeta / (omega_i + omega_j)
//
// Ref: Rayleigh (1896), Chopra Ch.11

#[test]
fn validation_rayleigh_damping_coefficients() {
    let f1: f64 = 1.0; // Hz (1st mode)
    let f2: f64 = 5.0; // Hz (2nd mode)
    let zeta: f64 = 0.05; // 5% damping for both modes

    let omega1 = 2.0 * PI * f1;
    let omega2 = 2.0 * PI * f2;

    // Equal damping formula
    let a0 = 2.0 * zeta * omega1 * omega2 / (omega1 + omega2);
    let a1 = 2.0 * zeta / (omega1 + omega2);

    // Verify: zeta at omega1 = a0/(2*omega1) + a1*omega1/2 = zeta
    let zeta1_check = a0 / (2.0 * omega1) + a1 * omega1 / 2.0;
    assert_close(zeta1_check, zeta, 1e-10, "damping ratio at mode 1");

    // Verify: zeta at omega2
    let zeta2_check = a0 / (2.0 * omega2) + a1 * omega2 / 2.0;
    assert_close(zeta2_check, zeta, 1e-10, "damping ratio at mode 2");

    // At intermediate frequency, damping should be less than zeta
    // Minimum of Rayleigh curve occurs at omega_min = sqrt(a0/a1)
    let omega_min = (a0 / a1).sqrt();
    let zeta_min = a0 / (2.0 * omega_min) + a1 * omega_min / 2.0;
    // omega_min = sqrt(omega1*omega2) (geometric mean for equal damping)
    let omega_geo = (omega1 * omega2).sqrt();
    assert_close(omega_min, omega_geo, 1e-10, "minimum damping at geometric mean");
    assert!(
        zeta_min <= zeta + 1e-10,
        "minimum damping ({:.6}) should be <= target ({:.6})",
        zeta_min, zeta
    );

    // At frequencies outside the range, damping increases
    let omega_high = 3.0 * omega2;
    let zeta_high = a0 / (2.0 * omega_high) + a1 * omega_high / 2.0;
    assert!(
        zeta_high > zeta,
        "damping at 3x omega2 ({:.4}) should exceed target ({:.4})",
        zeta_high, zeta
    );

    // At very low frequency, mass-proportional term dominates
    let omega_low = omega1 / 10.0;
    let zeta_low = a0 / (2.0 * omega_low) + a1 * omega_low / 2.0;
    assert!(
        zeta_low > zeta,
        "damping at low frequency ({:.4}) should exceed target ({:.4})",
        zeta_low, zeta
    );
}

// ================================================================
// 3. Half-Power Bandwidth Method — Experimental Damping
// ================================================================
//
// From a frequency response function (FRF), the damping ratio
// can be estimated using the half-power bandwidth:
//   zeta = (f2 - f1) / (2 * f_n)
//
// where f1 and f2 are the frequencies at which the amplitude
// is 1/sqrt(2) of the peak amplitude (i.e., -3dB points).
//
// For the standard SDOF magnification factor:
//   H(r) = 1 / sqrt((1-r^2)^2 + (2*zeta*r)^2)
//   where r = omega/omega_n
//
// Peak occurs at r = sqrt(1 - 2*zeta^2) for zeta < 1/sqrt(2)
//   H_peak = 1 / (2*zeta*sqrt(1-zeta^2))
//
// Ref: Chopra Ch.3, Ewins "Modal Testing" (2000)

#[test]
fn validation_half_power_bandwidth_method() {
    let zeta: f64 = 0.02; // 2% damping (lightly damped)
    let f_n: f64 = 10.0; // Hz natural frequency
    let omega_n = 2.0 * PI * f_n;

    // Magnification factor function
    let h_mag = |r: f64, z: f64| -> f64 {
        1.0 / ((1.0 - r * r).powi(2) + (2.0 * z * r).powi(2)).sqrt()
    };

    // Peak magnification
    let r_peak = (1.0 - 2.0 * zeta * zeta).sqrt();
    let h_peak = h_mag(r_peak, zeta);
    let h_peak_formula = 1.0 / (2.0 * zeta * (1.0 - zeta * zeta).sqrt());
    assert_close(h_peak, h_peak_formula, 1e-8, "peak magnification");

    // For small zeta: H_peak ≈ 1/(2*zeta)
    let h_approx = 1.0 / (2.0 * zeta);
    let err = (h_peak - h_approx).abs() / h_peak;
    assert!(err < 0.001, "H_peak ≈ 1/(2*zeta) for small damping");

    // Half-power frequencies (approximate for small zeta)
    // r_1 ≈ 1 - zeta, r_2 ≈ 1 + zeta
    let r1 = 1.0 - zeta;
    let r2 = 1.0 + zeta;
    let f1 = r1 * f_n;
    let f2 = r2 * f_n;

    // Bandwidth method: zeta = (f2-f1)/(2*f_n)
    let zeta_recovered = (f2 - f1) / (2.0 * f_n);
    assert_close(zeta_recovered, zeta, 1e-10, "recovered damping from bandwidth");

    // Verify half-power level at approximate points
    let h_at_r1 = h_mag(r1, zeta);
    let h_at_r2 = h_mag(r2, zeta);
    let h_half = h_peak / 2.0_f64.sqrt();

    // These should be close to the half-power level
    let err1 = (h_at_r1 - h_half).abs() / h_half;
    let err2 = (h_at_r2 - h_half).abs() / h_half;
    assert!(
        err1 < 0.02,
        "H at r1 should be near half-power level, err={:.3}%",
        err1 * 100.0
    );
    assert!(
        err2 < 0.02,
        "H at r2 should be near half-power level, err={:.3}%",
        err2 * 100.0
    );

    // Damped frequency
    let _omega_d = omega_n * (1.0 - zeta * zeta).sqrt();
    let _f_d = f_n * (1.0 - zeta * zeta).sqrt();
    // For small zeta, f_d ≈ f_n
    assert_close(_f_d, f_n, 0.001, "damped freq ≈ natural freq for small zeta");
}

// ================================================================
// 4. Complex Stiffness (Hysteretic) Damping Model
// ================================================================
//
// The complex stiffness model replaces k with k*(1 + i*eta):
//   k_complex = k * (1 + i*eta)
//
// where eta = loss factor = 2*zeta (for equivalent viscous damping
// at resonance).
//
// Energy dissipated per cycle:
//   W_d = pi * k * eta * X^2    (hysteretic)
//   W_d = pi * c * omega * X^2  (viscous)
//
// At resonance: eta = 2*zeta (equivalence condition)
//
// Ref: Crandall (1970), Nashif et al. (1985)

#[test]
fn validation_complex_stiffness_damping() {
    let k: f64 = 1e6; // N/m
    let zeta: f64 = 0.03; // 3%
    let x_amp: f64 = 0.005; // m amplitude

    // Loss factor
    let eta = 2.0 * zeta;
    assert_close(eta, 0.06, 1e-12, "loss factor = 2*zeta");

    // Energy dissipated per cycle (hysteretic model)
    let w_d_hysteretic = PI * k * eta * x_amp * x_amp;
    let expected_wd = PI * 1e6 * 0.06 * 25e-6;
    assert_close(w_d_hysteretic, expected_wd, 1e-10, "hysteretic energy per cycle");

    // Maximum stored energy
    let w_stored = 0.5 * k * x_amp * x_amp;

    // Loss factor from energy: eta = W_d / (2*pi*W_stored)
    let eta_from_energy = w_d_hysteretic / (2.0 * PI * w_stored);
    assert_close(eta_from_energy, eta, 1e-10, "eta from energy balance");

    // Viscous equivalent at resonance
    let m: f64 = 100.0; // kg
    let omega_n = (k / m).sqrt();
    let c_eq = k * eta / omega_n; // equivalent viscous damping at resonance
    let c_critical = 2.0 * (k * m).sqrt();
    let zeta_from_c = c_eq / c_critical;
    assert_close(zeta_from_c, zeta, 1e-10, "zeta from equivalent viscous");

    // Key difference: hysteretic damping energy is FREQUENCY-INDEPENDENT
    // Viscous damping energy depends on frequency
    let omega_low = omega_n / 2.0;
    let omega_high = omega_n * 2.0;

    // Hysteretic energy is same at all frequencies (for same amplitude)
    let _wd_low = PI * k * eta * x_amp * x_amp;
    let _wd_high = PI * k * eta * x_amp * x_amp;
    assert_close(_wd_low, _wd_high, 1e-12, "hysteretic energy freq-independent");

    // Viscous energy varies with frequency
    let c_visc = c_eq; // fixed dashpot
    let wd_visc_low = PI * c_visc * omega_low * x_amp * x_amp;
    let wd_visc_high = PI * c_visc * omega_high * x_amp * x_amp;
    let visc_ratio = wd_visc_high / wd_visc_low;
    assert_close(
        visc_ratio,
        omega_high / omega_low,
        1e-10,
        "viscous energy scales with omega",
    );
}

// ================================================================
// 5. Coulomb (Friction) Damping — Amplitude Decay
// ================================================================
//
// For a SDOF system with Coulomb friction force F_f:
//   Amplitude decreases linearly: x_n = x_0 - n * (4*F_f/k)
//
// Number of half-cycles to stop:
//   N = x_0 * k / (2 * F_f)  (half-cycles)
//
// The system stops when the restoring force is less than the friction force.
// Final resting position: within +/- F_f/k of equilibrium.
//
// Ref: Chopra Ch.2, Den Hartog "Mechanical Vibrations" (1956)

#[test]
fn validation_coulomb_damping_decay() {
    let k: f64 = 5000.0; // N/m
    let x_0: f64 = 0.050; // m initial displacement
    let f_f: f64 = 20.0; // N friction force
    let _m: f64 = 50.0; // kg (for natural frequency)

    // Amplitude loss per cycle
    let delta_x_per_cycle = 4.0 * f_f / k;
    assert_close(delta_x_per_cycle, 4.0 * 20.0 / 5000.0, 1e-12, "amplitude loss per cycle");
    // = 80/5000 = 0.016 m per full cycle

    // Amplitude after n full cycles
    let n_cycles: f64 = 2.0;
    let x_after_2 = x_0 - n_cycles * delta_x_per_cycle;
    assert_close(x_after_2, 0.050 - 0.032, 1e-12, "amplitude after 2 cycles");
    assert_close(x_after_2, 0.018, 1e-12, "amplitude after 2 cycles numerical");

    // Number of full cycles until stop
    // x_0 - n * 4*F_f/k = 0 => n = x_0*k/(4*F_f)
    let n_stop_cycles = x_0 * k / (4.0 * f_f);
    assert_close(n_stop_cycles, 0.050 * 5000.0 / 80.0, 1e-12, "cycles to stop");
    // = 250/80 = 3.125 cycles

    // Number of half-cycles to stop
    let n_half = x_0 * k / (2.0 * f_f);
    assert_close(n_half, 2.0 * n_stop_cycles, 1e-10, "half-cycles = 2x cycles");

    // Final resting position tolerance: within F_f/k of equilibrium
    let rest_band = f_f / k;
    assert_close(rest_band, 0.004, 1e-12, "resting band = F_f/k");

    // After integer number of full cycles (3 cycles):
    let x_after_3 = x_0 - 3.0 * delta_x_per_cycle;
    // = 0.050 - 0.048 = 0.002
    assert_close(x_after_3, 0.002, 1e-12, "amplitude after 3 cycles");
    // This is within the rest band (0.004), so the system stops
    assert!(
        x_after_3 < rest_band,
        "system should stop: x ({:.4}) < F_f/k ({:.4})",
        x_after_3, rest_band
    );

    // Key difference from viscous: Coulomb decay is LINEAR, not exponential
    // Check linearity: equal amplitude drops each cycle
    let drops: Vec<f64> = (0..3)
        .map(|i| {
            let x_i = x_0 - i as f64 * delta_x_per_cycle;
            let x_i1 = x_0 - (i as f64 + 1.0) * delta_x_per_cycle;
            x_i - x_i1
        })
        .collect();
    assert_close(drops[0], drops[1], 1e-12, "constant amplitude drop 0-1 vs 1-2");
    assert_close(drops[1], drops[2], 1e-12, "constant amplitude drop 1-2 vs 2-3");
}

// ================================================================
// 6. Modal Damping — Damping in Multi-DOF Systems
// ================================================================
//
// For a classically damped system (Caughey condition):
//   [M]{x_ddot} + [C]{x_dot} + [K]{x} = {F}
//
// Modal decomposition: x = [Phi]*q
// Each modal equation: q_i_ddot + 2*zeta_i*omega_i*q_i_dot + omega_i^2*q_i = f_i
//
// The Caughey condition requires:
//   [M]^{-1}[C] and [M]^{-1}[K] commute
//
// For Rayleigh damping (C = a0*M + a1*K), this is always satisfied.
//
// Modal superposition response (steady-state harmonic):
//   X_i = F_i / (k_i * sqrt((1-r_i^2)^2 + (2*zeta_i*r_i)^2))
//
// Ref: Chopra Ch.12, Clough & Penzien Ch.12

#[test]
fn validation_modal_damping_superposition() {
    // Two-mode system
    let omega1: f64 = 2.0 * PI * 2.0; // 2 Hz
    let omega2: f64 = 2.0 * PI * 6.0; // 6 Hz
    let zeta1: f64 = 0.03;
    let zeta2: f64 = 0.05;
    let m1: f64 = 1000.0; // modal mass
    let m2: f64 = 800.0;

    // Modal stiffness
    let k1 = m1 * omega1 * omega1;
    let k2 = m2 * omega2 * omega2;

    // Harmonic excitation at omega = omega1 (resonance of mode 1)
    let omega_exc = omega1;
    let r1 = omega_exc / omega1;
    let r2 = omega_exc / omega2;

    assert_close(r1, 1.0, 1e-10, "r1 = 1 at resonance");
    assert_close(r2, 1.0 / 3.0, 1e-10, "r2 = omega1/omega2 = 1/3");

    // Modal magnification factors
    let h1 = 1.0 / ((1.0 - r1 * r1).powi(2) + (2.0 * zeta1 * r1).powi(2)).sqrt();
    let h2 = 1.0 / ((1.0 - r2 * r2).powi(2) + (2.0 * zeta2 * r2).powi(2)).sqrt();

    // At resonance (r=1): H = 1/(2*zeta)
    assert_close(h1, 1.0 / (2.0 * zeta1), 1e-6, "H1 at resonance");

    // Mode 2 is off-resonance: H2 should be much smaller than H1
    assert!(
        h2 < h1 / 5.0,
        "off-resonance H2 ({:.2}) should be << resonant H1 ({:.2})",
        h2, h1
    );

    // Modal force (assume unit force equally distributed)
    let f_modal_1: f64 = 1.0;
    let f_modal_2: f64 = 1.0;

    // Modal displacements
    let q1 = f_modal_1 * h1 / k1;
    let q2 = f_modal_2 * h2 / k2;

    // Mode 1 dominates at its resonance
    let q_ratio = q1 / q2;
    assert!(
        q_ratio > 10.0,
        "mode 1 should dominate at its resonance: q1/q2 = {:.1}",
        q_ratio
    );

    // Phase angle at resonance: phi = 90 degrees
    let phi1 = (2.0 * zeta1 * r1 / (1.0 - r1 * r1)).atan();
    // At r=1: atan(infinity) = pi/2
    assert_close(phi1, PI / 2.0, 1e-6, "phase at resonance = 90 deg");
}

// ================================================================
// 7. Eurocode 8 Damping Correction Factor
// ================================================================
//
// EC8 provides a damping correction factor eta for response spectra:
//   eta = sqrt(10 / (5 + zeta_percent)) >= 0.55
//
// where zeta_percent is damping as a percentage (e.g., 5 for 5%).
//
// The reference spectrum is defined for 5% damping, so eta(5%) = 1.0.
//
// Ref: EN 1998-1:2004, Clause 3.2.2.2

#[test]
fn validation_eurocode8_damping_correction() {
    // EC8 damping correction factor
    let eta_ec8 = |zeta_pct: f64| -> f64 {
        let val = (10.0 / (5.0 + zeta_pct)).sqrt();
        if val < 0.55 { 0.55 } else { val }
    };

    // At 5% damping: eta = sqrt(10/10) = 1.0
    assert_close(eta_ec8(5.0), 1.0, 1e-12, "eta at 5% damping");

    // At 2% damping: eta = sqrt(10/7) = 1.1952
    let eta_2 = eta_ec8(2.0);
    let expected_2 = (10.0_f64 / 7.0).sqrt();
    assert_close(eta_2, expected_2, 1e-10, "eta at 2% damping");
    assert!(eta_2 > 1.0, "lower damping => higher spectral values");

    // At 10% damping: eta = sqrt(10/15) = 0.8165
    let eta_10 = eta_ec8(10.0);
    let expected_10 = (10.0_f64 / 15.0).sqrt();
    assert_close(eta_10, expected_10, 1e-10, "eta at 10% damping");
    assert!(eta_10 < 1.0, "higher damping => lower spectral values");

    // At 0% damping: eta = sqrt(10/5) = sqrt(2) = 1.4142
    let eta_0 = eta_ec8(0.0);
    assert_close(eta_0, 2.0_f64.sqrt(), 1e-10, "eta at 0% damping");

    // Minimum value check: at very high damping
    let eta_high = eta_ec8(100.0);
    // sqrt(10/105) = 0.3086 < 0.55, so capped at 0.55
    assert_close(eta_high, 0.55, 1e-12, "eta capped at 0.55");

    // Monotonically decreasing with damping
    let mut prev = eta_ec8(0.0);
    for i in 1..=20 {
        let z = i as f64;
        let eta_val = eta_ec8(z);
        assert!(
            eta_val <= prev + 1e-12,
            "eta should be non-increasing: eta({})={:.4} > eta({})={:.4}",
            z,
            eta_val,
            z - 1.0,
            prev
        );
        prev = eta_val;
    }
}

// ================================================================
// 8. Damping Ratio from Resonance Curve — Magnification Factor
// ================================================================
//
// The dynamic magnification factor (DMF) for a viscously damped
// SDOF system under harmonic base excitation:
//   |X/Y| = sqrt(1 + (2*zeta*r)^2) / sqrt((1-r^2)^2 + (2*zeta*r)^2)
//
// where X = mass displacement, Y = base displacement, r = omega/omega_n
//
// Transmissibility (force transmitted / applied force):
//   TR = sqrt(1 + (2*zeta*r)^2) / sqrt((1-r^2)^2 + (2*zeta*r)^2)
//
// Key features:
//   - TR = 1 at r = 0 (static)
//   - TR peaks near r = 1 (resonance)
//   - TR = 1 at r = sqrt(2) (independent of zeta)
//   - TR < 1 for r > sqrt(2) (isolation region)
//
// Ref: Chopra Ch.3, Den Hartog

#[test]
fn validation_transmissibility_curve() {
    let zeta: f64 = 0.10; // 10% damping

    // Transmissibility function
    let tr = |r: f64, z: f64| -> f64 {
        let num = 1.0 + (2.0 * z * r).powi(2);
        let den = (1.0 - r * r).powi(2) + (2.0 * z * r).powi(2);
        (num / den).sqrt()
    };

    // At r = 0: TR = 1 (static)
    assert_close(tr(0.0, zeta), 1.0, 1e-10, "TR at r=0");

    // At r = sqrt(2): TR = 1 regardless of damping
    let r_cross = 2.0_f64.sqrt();
    let tr_at_cross = tr(r_cross, zeta);
    assert_close(tr_at_cross, 1.0, 1e-10, "TR at r=sqrt(2)");

    // This crossing point is independent of damping
    let tr_cross_low = tr(r_cross, 0.01);
    let tr_cross_high = tr(r_cross, 0.50);
    assert_close(tr_cross_low, 1.0, 1e-10, "TR at sqrt(2), zeta=1%");
    assert_close(tr_cross_high, 1.0, 1e-10, "TR at sqrt(2), zeta=50%");

    // For r > sqrt(2): TR < 1 (isolation)
    let tr_isolated = tr(2.0, zeta);
    assert!(
        tr_isolated < 1.0,
        "TR at r=2 ({:.4}) should be < 1 (isolation)",
        tr_isolated
    );

    // More damping is WORSE in the isolation region (counterintuitive)
    let tr_low_damp = tr(2.0, 0.01);
    let tr_high_damp = tr(2.0, 0.30);
    assert!(
        tr_low_damp < tr_high_damp,
        "lower damping gives better isolation: TR(0.01)={:.4} < TR(0.30)={:.4}",
        tr_low_damp, tr_high_damp
    );

    // Peak transmissibility near resonance
    // For force transmissibility, peak occurs at r < 1 when zeta > 0
    let tr_peak = tr(1.0, zeta);
    let tr_sub = tr(0.95, zeta);
    let tr_super = tr(1.05, zeta);
    // Near resonance, TR should be elevated
    assert!(
        tr_peak > 3.0,
        "TR at resonance for 10% damping should be significant, got {:.2}",
        tr_peak
    );
    // At resonance for transmissibility: TR(r=1) = sqrt(1+4z^2)/(2z)
    let tr_res_exact = (1.0 + 4.0 * zeta * zeta).sqrt() / (2.0 * zeta);
    assert_close(tr_peak, tr_res_exact, 1e-10, "TR at r=1 formula");

    // Verify TR is greater than 1 for r between 0 and sqrt(2)
    assert!(tr_sub > 1.0, "TR in amplification region should be > 1");
    assert!(tr_super > 1.0, "TR just above resonance should be > 1");
}
