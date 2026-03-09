/// Validation: Structural Dynamics (Pure Formula Verification)
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed.
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Biggs, "Introduction to Structural Dynamics", McGraw-Hill
///   - Paz & Kim, "Structural Dynamics: Theory and Computation", 6th Ed.
///
/// Tests verify structural dynamics formulas without calling the solver.
///   1. SDOF free vibration (undamped and damped)
///   2. Duhamel integral for step load on SDOF
///   3. Newmark-beta integration accuracy (average acceleration)
///   4. Spectral displacement from pseudo-acceleration
///   5. Dynamic amplification factor (DAF) for harmonic loading
///   6. Damped natural frequency
///   7. Base shear from response spectrum
///   8. Modal superposition accuracy for 2-DOF system

use std::f64::consts::PI;

// ================================================================
// 1. SDOF Free Vibration (Undamped and Damped)
// ================================================================
//
// Undamped: u(t) = u0 * cos(omega_n * t) + (v0/omega_n) * sin(omega_n * t)
//   where omega_n = sqrt(k/m), T_n = 2*pi/omega_n
//
// Damped: u(t) = exp(-zeta*omega_n*t) *
//   [u0*cos(omega_d*t) + (v0 + zeta*omega_n*u0)/omega_d * sin(omega_d*t)]
//   where omega_d = omega_n * sqrt(1-zeta^2)
//
// Reference: Chopra, Ch. 2

#[test]
fn validation_dynamic_sdof_free_vibration() {
    let m: f64 = 1000.0;  // kg
    let k: f64 = 40_000.0; // N/m (stiffness)

    // Natural frequency
    let omega_n: f64 = (k / m).sqrt();
    // = sqrt(40) = 6.3246 rad/s
    let omega_n_expected: f64 = (40.0_f64 as f64).sqrt();
    assert!(
        (omega_n - omega_n_expected).abs() < 1e-10_f64,
        "omega_n: {:.6} rad/s, expected {:.6}",
        omega_n, omega_n_expected
    );

    // Natural period
    let t_n: f64 = 2.0_f64 * PI / omega_n;
    // ~ 0.9934 s
    assert!(
        t_n > 0.0_f64 && t_n < 2.0_f64,
        "T_n = {:.4} s should be in (0, 2)",
        t_n
    );

    // Frequency in Hz
    let f_n: f64 = 1.0_f64 / t_n;
    let f_n_alt: f64 = omega_n / (2.0_f64 * PI);
    assert!(
        (f_n - f_n_alt).abs() < 1e-10_f64,
        "f_n: {:.6} Hz, alt: {:.6} Hz",
        f_n, f_n_alt
    );

    // Undamped response with u0 = 0.01 m, v0 = 0
    let u0: f64 = 0.01;
    let v0: f64 = 0.0;

    // At t = T_n/4, u should be 0 (cos goes to 0)
    let t_quarter: f64 = t_n / 4.0_f64;
    let u_quarter: f64 = u0 * (omega_n * t_quarter).cos()
        + v0 / omega_n * (omega_n * t_quarter).sin();
    assert!(
        u_quarter.abs() < 1e-10_f64,
        "u(T/4) should be ~0: got {:.6e}",
        u_quarter
    );

    // At t = T_n, u should return to u0
    let u_period: f64 = u0 * (omega_n * t_n).cos()
        + v0 / omega_n * (omega_n * t_n).sin();
    assert!(
        (u_period - u0).abs() < 1e-10_f64,
        "u(T) should equal u0: got {:.6e}, expected {:.6e}",
        u_period, u0
    );

    // Damped response: zeta = 5%
    let zeta: f64 = 0.05;
    // After one period, amplitude decays by exp(-zeta*omega_n*T_n)
    let decay_factor: f64 = (-zeta * omega_n * t_n).exp();
    // = exp(-0.05 * 6.3246 * 0.9934) = exp(-0.3142) ~ 0.730
    assert!(
        decay_factor > 0.7_f64 && decay_factor < 0.75_f64,
        "Decay factor after 1 period: {:.4}",
        decay_factor
    );

    // Log decrement: delta = 2*pi*zeta / sqrt(1-zeta^2) ~ 2*pi*zeta for small zeta
    let log_dec: f64 = 2.0_f64 * PI * zeta / (1.0_f64 - zeta * zeta).sqrt();
    let log_dec_approx: f64 = 2.0_f64 * PI * zeta;
    assert!(
        (log_dec - log_dec_approx).abs() / log_dec < 0.005_f64,
        "Log decrement: exact={:.6}, approx={:.6}",
        log_dec, log_dec_approx
    );
}

// ================================================================
// 2. Duhamel Integral for Step Load on SDOF
// ================================================================
//
// For a step load F0 applied at t=0 to an undamped SDOF system:
//   u(t) = (F0/k) * (1 - cos(omega_n * t))
//
// Maximum response: u_max = 2 * F0/k = 2 * u_static
// This gives a dynamic amplification factor (DAF) of 2.0.
//
// For a damped system:
//   u(t) = (F0/k) * [1 - exp(-zeta*omega_n*t) *
//           (cos(omega_d*t) + zeta/sqrt(1-zeta^2) * sin(omega_d*t))]
//
// Reference: Chopra, Ch. 4; Clough & Penzien, Ch. 3

#[test]
fn validation_dynamic_duhamel_step_load() {
    let m: f64 = 500.0;    // kg
    let k: f64 = 50_000.0; // N/m
    let f0: f64 = 1000.0;  // N (step load magnitude)

    let omega_n: f64 = (k / m).sqrt();
    let t_n: f64 = 2.0_f64 * PI / omega_n;

    // Static displacement
    let u_static: f64 = f0 / k;
    // = 0.02 m
    assert!(
        (u_static - 0.02_f64).abs() < 1e-10_f64,
        "u_static: {:.6} m",
        u_static
    );

    // Undamped step response at various times
    let u_at = |t: f64| -> f64 {
        u_static * (1.0_f64 - (omega_n * t).cos())
    };

    // At t = 0: u = 0
    assert!(u_at(0.0_f64).abs() < 1e-10_f64, "u(0) = 0");

    // At t = T/2: u = 2*u_static (maximum)
    let u_half_period: f64 = u_at(t_n / 2.0_f64);
    assert!(
        (u_half_period - 2.0_f64 * u_static).abs() / u_static < 1e-10_f64,
        "u(T/2): {:.6e}, expected {:.6e}",
        u_half_period, 2.0_f64 * u_static
    );

    // DAF for step load = 2.0
    let daf: f64 = u_half_period / u_static;
    assert!(
        (daf - 2.0_f64).abs() < 1e-10_f64,
        "DAF for step load: {:.4}, expected 2.0",
        daf
    );

    // At t = T: u returns to 0
    let u_full_period: f64 = u_at(t_n);
    assert!(
        u_full_period.abs() < 1e-10_f64,
        "u(T): {:.6e}, expected ~0",
        u_full_period
    );

    // Damped response: zeta = 0.1
    let zeta: f64 = 0.1;
    let omega_d: f64 = omega_n * (1.0_f64 - zeta * zeta).sqrt();

    let u_damped_at = |t: f64| -> f64 {
        let exp_term: f64 = (-zeta * omega_n * t).exp();
        let cos_term: f64 = (omega_d * t).cos();
        let sin_term: f64 = zeta / (1.0_f64 - zeta * zeta).sqrt() * (omega_d * t).sin();
        u_static * (1.0_f64 - exp_term * (cos_term + sin_term))
    };

    // Damped response converges to u_static as t -> infinity
    let u_late: f64 = u_damped_at(10.0_f64 * t_n);
    assert!(
        (u_late - u_static).abs() / u_static < 0.01_f64,
        "u(10T) -> u_static: {:.6e}, expected {:.6e}",
        u_late, u_static
    );

    // Damped peak < undamped peak (2*u_static)
    // The peak occurs near t = T_d/2 = pi/omega_d
    let t_peak_approx: f64 = PI / omega_d;
    let u_damped_peak: f64 = u_damped_at(t_peak_approx);
    assert!(
        u_damped_peak < 2.0_f64 * u_static,
        "Damped peak ({:.6e}) < undamped peak ({:.6e})",
        u_damped_peak, 2.0_f64 * u_static
    );
}

// ================================================================
// 3. Newmark-Beta Integration Accuracy (Average Acceleration)
// ================================================================
//
// The Newmark average acceleration method (beta=1/4, gamma=1/2)
// is unconditionally stable and second-order accurate.
//
// For an undamped SDOF under constant force F0 (step load),
// verify that the numerical solution matches the exact solution:
//   u(t) = (F0/k)*(1 - cos(omega_n*t))
//
// Reference: Chopra, Ch. 5; Newmark (1959)

#[test]
fn validation_dynamic_newmark_beta_accuracy() {
    let m: f64 = 1.0;     // kg (unit mass for simplicity)
    let k: f64 = 100.0;   // N/m
    let f0: f64 = 10.0;   // N (step load)

    let omega_n: f64 = (k / m).sqrt(); // 10 rad/s
    let t_n: f64 = 2.0_f64 * PI / omega_n;

    // Newmark parameters (average acceleration)
    let beta: f64 = 0.25;
    let gamma: f64 = 0.5;

    // Time step: dt = T_n / 20 (20 steps per period)
    let n_steps: usize = 40;
    let dt: f64 = t_n / 20.0_f64;

    // Initial conditions
    let mut u: f64 = 0.0;
    let mut v: f64 = 0.0;
    let mut a: f64 = f0 / m; // initial acceleration from F0

    // Newmark constants
    // For undamped: c = 0
    let k_eff: f64 = k + m / (beta * dt * dt);

    let mut max_error: f64 = 0.0;

    for step in 1..=n_steps {
        let t: f64 = step as f64 * dt;

        // Effective force increment (constant force, so delta_F = 0 for step > 0...
        // Actually for step load, F is constant F0 for all t >= 0)
        // Newmark: k_eff * du = delta_F_eff
        // For constant F0: at each step, solve k_eff * u_{n+1} = F0 + m*(u_n/(beta*dt^2) + v_n/(beta*dt) + (1/(2*beta)-1)*a_n)

        let f_eff: f64 = f0 + m * (u / (beta * dt * dt) + v / (beta * dt)
            + (1.0_f64 / (2.0_f64 * beta) - 1.0_f64) * a);

        let u_new: f64 = f_eff / k_eff;
        let a_new: f64 = (u_new - u) / (beta * dt * dt) - v / (beta * dt)
            - (1.0_f64 / (2.0_f64 * beta) - 1.0_f64) * a;
        let v_new: f64 = v + dt * ((1.0_f64 - gamma) * a + gamma * a_new);

        u = u_new;
        v = v_new;
        a = a_new;

        // Exact solution
        let u_exact: f64 = (f0 / k) * (1.0_f64 - (omega_n * t).cos());

        // Track maximum error
        let error: f64 = (u - u_exact).abs();
        if error > max_error {
            max_error = error;
        }
    }

    let u_static: f64 = f0 / k;
    let relative_error: f64 = max_error / (2.0_f64 * u_static);

    // Newmark average acceleration with dt = T/20 gives ~4-5% period error
    assert!(
        relative_error < 0.05_f64,
        "Newmark max relative error: {:.4}%, should be < 5%",
        relative_error * 100.0_f64
    );
}

// ================================================================
// 4. Spectral Displacement from Pseudo-Acceleration
// ================================================================
//
// The pseudo-acceleration response spectrum Sa and spectral
// displacement Sd are related by:
//   Sd = Sa * T^2 / (4*pi^2)
//   Sv = Sa * T / (2*pi)   (pseudo-velocity)
//
// where T is the natural period of the SDOF oscillator.
//
// Reference: Chopra, Ch. 6; ASCE 7-22 Ch. 11

#[test]
fn validation_dynamic_spectral_relationships() {
    // Typical design spectrum values
    let sa: f64 = 0.5; // g (pseudo-acceleration, fraction of g)
    let g: f64 = 9.81;  // m/s^2

    let sa_ms2: f64 = sa * g; // m/s^2

    // For T = 1.0 s
    let t: f64 = 1.0;
    let sd: f64 = sa_ms2 * t * t / (4.0_f64 * PI * PI);
    // = 0.5*9.81*1.0/(4*pi^2) = 4.905/39.478 = 0.12425 m
    let sd_expected: f64 = sa_ms2 / (4.0_f64 * PI * PI);
    assert!(
        (sd - sd_expected).abs() / sd_expected < 1e-10_f64,
        "Sd at T=1s: {:.6} m",
        sd
    );

    // Pseudo-velocity
    let sv: f64 = sa_ms2 * t / (2.0_f64 * PI);
    // = 4.905 / 6.2832 = 0.7808 m/s
    let sv_expected: f64 = sa_ms2 / (2.0_f64 * PI);
    assert!(
        (sv - sv_expected).abs() / sv_expected < 1e-10_f64,
        "Sv at T=1s: {:.6} m/s",
        sv
    );

    // Verify relationship: Sd = Sv * T / (2*pi) = Sa * T^2 / (4*pi^2)
    let sd_from_sv: f64 = sv * t / (2.0_f64 * PI);
    assert!(
        (sd_from_sv - sd).abs() / sd < 1e-10_f64,
        "Sd from Sv: {:.6} m, direct: {:.6} m",
        sd_from_sv, sd
    );

    // For T = 0.5 s: Sd should be 1/4 of T=1s value (quadratic in T)
    let t2: f64 = 0.5;
    let sd2: f64 = sa_ms2 * t2 * t2 / (4.0_f64 * PI * PI);
    let ratio: f64 = sd2 / sd;
    assert!(
        (ratio - 0.25_f64).abs() < 1e-10_f64,
        "Sd ratio (T=0.5/T=1.0): {:.6}, expected 0.25",
        ratio
    );

    // Tripartite relationship on log scale:
    // Sd * omega^2 = Sa, Sd * omega = Sv
    let omega: f64 = 2.0_f64 * PI / t;
    assert!(
        (sd * omega * omega - sa_ms2).abs() / sa_ms2 < 1e-10_f64,
        "Sd * omega^2 = Sa: {:.6} vs {:.6}",
        sd * omega * omega, sa_ms2
    );
    assert!(
        (sd * omega - sv).abs() / sv < 1e-10_f64,
        "Sd * omega = Sv: {:.6} vs {:.6}",
        sd * omega, sv
    );
}

// ================================================================
// 5. Dynamic Amplification Factor (DAF) for Harmonic Loading
// ================================================================
//
// For an SDOF system under harmonic force F(t) = F0*sin(omega*t):
//   u_max = (F0/k) * Rd
//
// where the dynamic magnification factor (DMF) is:
//   Rd = 1 / sqrt((1 - r^2)^2 + (2*zeta*r)^2)
//   r = omega/omega_n (frequency ratio)
//
// At resonance (r=1): Rd = 1/(2*zeta)
// For r << 1: Rd -> 1 (quasi-static)
// For r >> 1: Rd -> 0 (isolation)
//
// Reference: Chopra, Ch. 3; Clough & Penzien, Ch. 3

#[test]
fn validation_dynamic_amplification_factor() {
    let zeta: f64 = 0.05; // 5% damping

    // Compute Rd for various frequency ratios
    let rd = |r: f64| -> f64 {
        1.0_f64 / ((1.0_f64 - r * r).powi(2) + (2.0_f64 * zeta * r).powi(2)).sqrt()
    };

    // r = 0 (static): Rd = 1.0
    let rd_static: f64 = rd(0.0_f64);
    assert!(
        (rd_static - 1.0_f64).abs() < 1e-10_f64,
        "Rd(r=0) = {:.6}, expected 1.0",
        rd_static
    );

    // r = 1 (resonance): Rd = 1/(2*zeta) = 10.0
    let rd_resonance: f64 = rd(1.0_f64);
    let rd_resonance_expected: f64 = 1.0_f64 / (2.0_f64 * zeta);
    assert!(
        (rd_resonance - rd_resonance_expected).abs() / rd_resonance_expected < 1e-10_f64,
        "Rd(r=1) = {:.4}, expected {:.4}",
        rd_resonance, rd_resonance_expected
    );

    // r >> 1 (isolation): Rd -> 0
    let rd_high: f64 = rd(5.0_f64);
    assert!(
        rd_high < 0.05_f64,
        "Rd(r=5) = {:.6}, should be small",
        rd_high
    );

    // r = sqrt(2) crossover: Rd < 1 for all zeta (isolation regime)
    let rd_sqrt2: f64 = rd(2.0_f64.sqrt());
    // At r=sqrt(2): (1-r^2)^2 = (1-2)^2 = 1, (2*zeta*r)^2 = 8*zeta^2
    // Rd = 1/sqrt(1 + 8*zeta^2)
    let rd_sqrt2_expected: f64 = 1.0_f64 / (1.0_f64 + 8.0_f64 * zeta * zeta).sqrt();
    assert!(
        (rd_sqrt2 - rd_sqrt2_expected).abs() / rd_sqrt2_expected < 1e-10_f64,
        "Rd(r=sqrt2) = {:.6}, expected {:.6}",
        rd_sqrt2, rd_sqrt2_expected
    );

    // Peak Rd occurs at r_peak = sqrt(1 - 2*zeta^2) (for small zeta ~ 1)
    let r_peak: f64 = (1.0_f64 - 2.0_f64 * zeta * zeta).sqrt();
    let rd_peak: f64 = rd(r_peak);
    let rd_peak_expected: f64 = 1.0_f64 / (2.0_f64 * zeta * (1.0_f64 - zeta * zeta).sqrt());
    assert!(
        (rd_peak - rd_peak_expected).abs() / rd_peak_expected < 1e-10_f64,
        "Rd_peak = {:.6}, expected {:.6}",
        rd_peak, rd_peak_expected
    );

    // Phase angle at resonance should be -pi/2
    let _phase_resonance: f64 = (-2.0_f64 * zeta * 1.0_f64).atan2(1.0_f64 - 1.0_f64);
    // atan2(-2*zeta, 0) = -pi/2
    assert!(
        (_phase_resonance + PI / 2.0_f64).abs() < 1e-10_f64,
        "Phase at resonance: {:.6}, expected {:.6}",
        _phase_resonance, -PI / 2.0_f64
    );
}

// ================================================================
// 6. Damped Natural Frequency
// ================================================================
//
// The damped natural frequency is:
//   omega_d = omega_n * sqrt(1 - zeta^2)
//   f_d = f_n * sqrt(1 - zeta^2)
//   T_d = T_n / sqrt(1 - zeta^2)
//
// For typical structural damping (zeta = 2-10%),
// omega_d is very close to omega_n (< 1% difference).
//
// Critical damping: zeta = 1 => omega_d = 0
//
// Reference: Chopra, Ch. 2

#[test]
fn validation_dynamic_damped_frequency() {
    let omega_n: f64 = 10.0; // rad/s (natural frequency)

    // Test various damping ratios
    let cases: [(f64, &str); 5] = [
        (0.02_f64, "2%"),
        (0.05_f64, "5%"),
        (0.10_f64, "10%"),
        (0.20_f64, "20%"),
        (0.50_f64, "50%"),
    ];

    for (zeta, label) in &cases {
        let omega_d: f64 = omega_n * (1.0_f64 - zeta * zeta).sqrt();

        // omega_d should be less than omega_n
        assert!(
            omega_d < omega_n,
            "zeta={}: omega_d ({:.6}) should be < omega_n ({:.6})",
            label, omega_d, omega_n
        );

        // Verify formula
        let omega_d_expected: f64 = omega_n * (1.0_f64 - zeta * zeta).sqrt();
        assert!(
            (omega_d - omega_d_expected).abs() < 1e-12_f64,
            "zeta={}: omega_d = {:.6}",
            label, omega_d
        );

        // For small zeta: omega_d ~ omega_n (1 - zeta^2/2) to first order
        if *zeta < 0.15_f64 {
            let omega_d_approx: f64 = omega_n * (1.0_f64 - zeta * zeta / 2.0_f64);
            let err: f64 = (omega_d - omega_d_approx).abs() / omega_n;
            assert!(
                err < 0.01_f64,
                "zeta={}: Taylor approx error = {:.6}",
                label, err
            );
        }
    }

    // Critical damping: zeta = 1
    let omega_d_critical: f64 = omega_n * (1.0_f64 - 1.0_f64).sqrt();
    assert!(
        omega_d_critical.abs() < 1e-10_f64,
        "Critical damping: omega_d = {:.6e}, expected 0",
        omega_d_critical
    );

    // Damped period: T_d = 2*pi/omega_d = T_n / sqrt(1-zeta^2)
    let zeta: f64 = 0.05;
    let t_n: f64 = 2.0_f64 * PI / omega_n;
    let omega_d: f64 = omega_n * (1.0_f64 - zeta * zeta).sqrt();
    let t_d: f64 = 2.0_f64 * PI / omega_d;
    let t_d_expected: f64 = t_n / (1.0_f64 - zeta * zeta).sqrt();
    assert!(
        (t_d - t_d_expected).abs() / t_d < 1e-10_f64,
        "T_d = {:.6}, expected {:.6}",
        t_d, t_d_expected
    );
}

// ================================================================
// 7. Base Shear from Response Spectrum
// ================================================================
//
// The maximum base shear for an SDOF system is:
//   V_base = m * Sa(T, zeta)
// where Sa is the pseudo-acceleration from the response spectrum.
//
// For a multi-story building (approximated as MDOF), the base
// shear from the first mode is:
//   V1 = M_eff_1 * Sa(T1)
// where M_eff_1 is the effective modal mass.
//
// For a uniform shear building with N stories and rigid floors:
//   M_eff_1 ~ 0.81 * M_total (for N -> infinity)
//
// Reference: Chopra, Ch. 6 & 13; ASCE 7-22 Ch. 12

#[test]
fn validation_dynamic_base_shear_spectrum() {
    let m: f64 = 100_000.0; // kg (total building mass)
    let g: f64 = 9.81;       // m/s^2

    // SDOF case: Sa = 0.4g
    let sa: f64 = 0.4_f64 * g; // m/s^2
    let v_base_sdof: f64 = m * sa;
    let v_base_expected: f64 = 100_000.0_f64 * 0.4_f64 * 9.81_f64;
    assert!(
        (v_base_sdof - v_base_expected).abs() / v_base_expected < 1e-10_f64,
        "SDOF V_base: {:.2} N, expected {:.2}",
        v_base_sdof, v_base_expected
    );

    // Weight
    let w: f64 = m * g;
    // Seismic coefficient Cs = Sa/g = 0.4
    let cs: f64 = sa / g;
    let v_base_from_cs: f64 = cs * w;
    assert!(
        (v_base_from_cs - v_base_sdof).abs() / v_base_sdof < 1e-10_f64,
        "V = Cs*W = {:.2} N",
        v_base_from_cs
    );

    // MDOF: first mode effective mass ratio
    // For a 3-story uniform shear building, the first mode shape
    // is approximately: phi = [0.445, 0.802, 1.000] (for equal story stiffnesses)
    // Actually, for a uniform 3-story shear building:
    //   mode 1: phi = [sin(pi/7), sin(2pi/7), sin(3pi/7)] (approx)
    //   Effective mass fraction = (sum mi*phi_i)^2 / (M_total * sum mi*phi_i^2)

    // Use exact first mode for 3 equal masses, 3 equal stiffnesses:
    // Eigenvalue problem: K*phi = omega^2*M*phi
    // For uniform building: phi_1 = [1, sqrt(2), sqrt(3)] approximately
    // Let's use a simpler approach: assume phi = [1, 2, 3] (triangular)
    let phi: [f64; 3] = [1.0_f64, 2.0_f64, 3.0_f64];
    let m_story: f64 = m / 3.0_f64; // equal mass per floor

    let sum_m_phi: f64 = m_story * (phi[0] + phi[1] + phi[2]);
    let sum_m_phi2: f64 = m_story * (phi[0] * phi[0] + phi[1] * phi[1] + phi[2] * phi[2]);
    let m_eff: f64 = sum_m_phi * sum_m_phi / sum_m_phi2;
    let m_eff_ratio: f64 = m_eff / m;

    // For triangular mode shape (3 floors): M_eff/M_total = (1+2+3)^2 / (3*(1+4+9))
    // = 36 / (3*14) = 36/42 = 6/7 = 0.857
    let m_eff_ratio_expected: f64 = 6.0_f64 / 7.0_f64;
    assert!(
        (m_eff_ratio - m_eff_ratio_expected).abs() / m_eff_ratio_expected < 1e-10_f64,
        "M_eff/M_total: {:.4}, expected {:.4}",
        m_eff_ratio, m_eff_ratio_expected
    );

    // First mode base shear
    let v1: f64 = m_eff * sa;
    // Should be less than SDOF base shear
    assert!(
        v1 < v_base_sdof,
        "MDOF V1 ({:.2}) < SDOF V ({:.2})",
        v1, v_base_sdof
    );
}

// ================================================================
// 8. Modal Superposition Accuracy for 2-DOF System
// ================================================================
//
// For a 2-DOF system with mass matrix M and stiffness matrix K,
// the exact static solution (K*u = F) must equal the sum of
// modal contributions:
//   u = sum_i (phi_i * phi_i^T * M * phi_i)^{-1} * phi_i^T * F / omega_i^2 * phi_i
//
// Actually: u = sum_i (Gamma_i / omega_i^2) * phi_i
// where Gamma_i = phi_i^T * F / (phi_i^T * M * phi_i)
//
// Reference: Chopra, Ch. 12; Clough & Penzien, Ch. 12

#[test]
fn validation_dynamic_modal_superposition() {
    // 2-DOF shear building: 2 stories, equal mass m, equal stiffness k
    //   M = m * [[1, 0], [0, 1]]
    //   K = k * [[2, -1], [-1, 1]]
    let m_val: f64 = 1000.0; // kg per floor
    let k_val: f64 = 40_000.0; // N/m per story

    // Eigenvalues: det(K - omega^2*M) = 0
    // k*(2-lambda)*k*(1-lambda) - k^2 = 0 where lambda = omega^2*m/k
    // (2-lambda)*(1-lambda) - 1 = 0
    // 2 - 3*lambda + lambda^2 - 1 = 0
    // lambda^2 - 3*lambda + 1 = 0
    // lambda = (3 +/- sqrt(5)) / 2
    let lambda1: f64 = (3.0_f64 - 5.0_f64.sqrt()) / 2.0_f64;
    let lambda2: f64 = (3.0_f64 + 5.0_f64.sqrt()) / 2.0_f64;

    let omega1_sq: f64 = lambda1 * k_val / m_val;
    let omega2_sq: f64 = lambda2 * k_val / m_val;

    // Mode shapes: phi_i = [1, (2-lambda_i)]
    // Mode 1: phi1 = [1, (2-lambda1)] = [1, (2 - (3-sqrt5)/2)] = [1, (4-3+sqrt5)/2] = [1, (1+sqrt5)/2]
    let phi1: [f64; 2] = [1.0_f64, (1.0_f64 + 5.0_f64.sqrt()) / 2.0_f64]; // golden ratio!
    let phi2: [f64; 2] = [1.0_f64, (1.0_f64 - 5.0_f64.sqrt()) / 2.0_f64];

    // Verify orthogonality: phi1^T * M * phi2 = 0
    let ortho: f64 = m_val * (phi1[0] * phi2[0] + phi1[1] * phi2[1]);
    assert!(
        ortho.abs() < 1e-8_f64,
        "Modal orthogonality: phi1^T*M*phi2 = {:.6e}",
        ortho
    );

    // Apply force: F = [0, F0] (force on top floor)
    let f0: f64 = 1000.0; // N
    let f_vec: [f64; 2] = [0.0_f64, f0];

    // Modal masses
    let m1: f64 = m_val * (phi1[0] * phi1[0] + phi1[1] * phi1[1]);
    let m2: f64 = m_val * (phi2[0] * phi2[0] + phi2[1] * phi2[1]);

    // Modal participation factors (for static response)
    // Gamma_i = phi_i^T * F / M_i
    let gamma1: f64 = (phi1[0] * f_vec[0] + phi1[1] * f_vec[1]) / m1;
    let gamma2: f64 = (phi2[0] * f_vec[0] + phi2[1] * f_vec[1]) / m2;

    // Modal contributions to static displacement
    // u = sum_i (Gamma_i / omega_i^2) * phi_i
    let u_modal: [f64; 2] = [
        gamma1 / omega1_sq * phi1[0] + gamma2 / omega2_sq * phi2[0],
        gamma1 / omega1_sq * phi1[1] + gamma2 / omega2_sq * phi2[1],
    ];

    // Direct static solution: K*u = F
    // K = k * [[2, -1], [-1, 1]]
    // K^{-1} = (1/k) * [[1, 1], [1, 2]] (since det = 2-1 = 1)
    let u_direct: [f64; 2] = [
        (1.0_f64 / k_val) * (1.0_f64 * f_vec[0] + 1.0_f64 * f_vec[1]),
        (1.0_f64 / k_val) * (1.0_f64 * f_vec[0] + 2.0_f64 * f_vec[1]),
    ];

    // Compare modal superposition with direct solution
    let tol: f64 = 1e-8;
    assert!(
        (u_modal[0] - u_direct[0]).abs() / u_direct[0].abs().max(1e-20_f64) < tol,
        "u1: modal={:.6e}, direct={:.6e}",
        u_modal[0], u_direct[0]
    );
    assert!(
        (u_modal[1] - u_direct[1]).abs() / u_direct[1].abs().max(1e-20_f64) < tol,
        "u2: modal={:.6e}, direct={:.6e}",
        u_modal[1], u_direct[1]
    );
}
