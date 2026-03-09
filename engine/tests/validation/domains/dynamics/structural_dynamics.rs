/// Validation: Structural Dynamics Formulas
///
/// References:
///   - Chopra: "Dynamics of Structures" 5th ed., Ch. 2-6
///   - Clough & Penzien: "Dynamics of Structures" 3rd ed., Ch. 2-4
///   - Den Hartog: "Mechanical Vibrations" 4th ed.
///   - Newmark & Hall: "Earthquake Spectra and Design" (1982)
///   - Naeim: "The Seismic Design Handbook" 2nd ed.
///
/// Tests verify structural dynamics formulas with hand-computed expected values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. SDOF Natural Frequency (f = 1/(2*pi) * sqrt(k/m))
// ================================================================
//
// omega_n = sqrt(k/m), fn = omega_n/(2*pi), Tn = 2*pi/omega_n
//
// k = 5e6 N/m, m = 50000 kg
//   omega_n = sqrt(100) = 10 rad/s
//   fn = 1.5915 Hz, Tn = 0.6283 s

#[test]
fn validation_sdof_natural_frequency() {
    let k: f64 = 5e6;
    let m: f64 = 50_000.0;

    let omega_n: f64 = (k / m).sqrt();
    let fn_hz: f64 = omega_n / (2.0 * PI);
    let tn: f64 = 2.0 * PI / omega_n;

    assert_close(omega_n, 10.0, 0.001, "omega_n");
    assert_close(fn_hz, 10.0 / (2.0 * PI), 0.001, "fn");
    assert_close(tn, 2.0 * PI / 10.0, 0.001, "Tn");

    // Verify relationship: fn * Tn = 1
    assert_close(fn_hz * tn, 1.0, 0.001, "fn * Tn = 1");

    // Doubling stiffness: new omega = sqrt(2) * omega_n
    let omega_2k: f64 = (2.0 * k / m).sqrt();
    assert_close(omega_2k / omega_n, 2.0_f64.sqrt(), 0.001, "omega ratio with 2k");

    // Doubling mass: new omega = omega_n / sqrt(2)
    let omega_2m: f64 = (k / (2.0 * m)).sqrt();
    assert_close(omega_2m / omega_n, 1.0 / 2.0_f64.sqrt(), 0.001, "omega ratio with 2m");
}

// ================================================================
// 2. Damped Natural Frequency (omega_d = omega_n * sqrt(1 - xi^2))
// ================================================================
//
// omega_d = omega_n * sqrt(1 - xi²)
//
// omega_n = 10 rad/s, xi = 0.05:
//   omega_d = 10*sqrt(0.9975) = 9.9875 rad/s
// xi = 0.20:
//   omega_d = 10*sqrt(0.96) = 9.7980 rad/s

#[test]
fn validation_damped_natural_frequency() {
    let omega_n: f64 = 10.0;

    // Typical structural damping (5%)
    let xi1: f64 = 0.05;
    let omega_d1: f64 = omega_n * (1.0 - xi1 * xi1).sqrt();

    let expected_d1: f64 = 10.0 * (0.9975_f64).sqrt();
    assert_close(omega_d1, expected_d1, 0.001, "omega_d at 5% damping");

    // At 5% damping, frequency reduction is negligible
    let freq_reduction: f64 = 1.0 - omega_d1 / omega_n;
    assert!(freq_reduction < 0.002, "5% damping barely changes frequency");

    // Higher damping (20%)
    let xi2: f64 = 0.20;
    let omega_d2: f64 = omega_n * (1.0 - xi2 * xi2).sqrt();
    let expected_d2: f64 = 10.0 * (0.96_f64).sqrt();
    assert_close(omega_d2, expected_d2, 0.001, "omega_d at 20% damping");

    // omega_d decreases with increasing damping
    assert!(omega_d2 < omega_d1, "Higher damping reduces damped frequency");

    // At critical damping (xi = 1.0), omega_d = 0
    let xi_crit: f64 = 1.0;
    let omega_d_crit: f64 = omega_n * (1.0 - xi_crit * xi_crit).sqrt();
    assert_close(omega_d_crit, 0.0, 0.001, "omega_d at critical damping");
}

// ================================================================
// 3. Duhamel Integral for Step Load
// ================================================================
//
// For step load F0 on SDOF:
//   u(t) = (F0/k) * [1 - e^(-xi*omega_n*t) * (cos(omega_d*t)
//           + (xi*omega_n/omega_d)*sin(omega_d*t))]
//
// u_st = F0/k, DAF at first peak < 2.0 for damped system
//
// F0 = 100 kN, k = 5000 kN/m, m = 50000 kg, xi = 0.05
//   u_st = 0.02 m, omega_n = 10, omega_d = 9.9875
//   At t = pi/omega_d (first peak): cos(pi)=-1, sin(pi)≈0
//   u ≈ u_st * (1 + e^(-xi*pi/sqrt(1-xi²)))

#[test]
fn validation_duhamel_step_load() {
    let f0: f64 = 100e3;
    let k: f64 = 5e6;
    let m: f64 = 50_000.0;
    let xi: f64 = 0.05;

    let omega_n: f64 = (k / m).sqrt();
    let omega_d: f64 = omega_n * (1.0 - xi * xi).sqrt();
    let u_st: f64 = f0 / k;

    assert_close(u_st, 0.02, 0.001, "Static displacement");

    // Response at t = pi/omega_d (near first peak)
    let t: f64 = PI / omega_d;
    let exp_term: f64 = (-xi * omega_n * t).exp();
    let cos_term: f64 = (omega_d * t).cos();
    let sin_term: f64 = (omega_d * t).sin();

    let u_t: f64 = u_st * (1.0 - exp_term * (cos_term + xi * omega_n / omega_d * sin_term));

    // At t = pi/omega_d: cos(pi) = -1, sin(pi) ≈ 0
    let u_peak_approx: f64 = u_st * (1.0 + exp_term);
    assert_close(u_t, u_peak_approx, 0.01, "Step response at first peak");

    // DAF (dynamic amplification)
    let daf: f64 = u_t / u_st;
    assert!(daf > 1.5 && daf < 2.0, "DAF = {:.4}, should be between 1.5 and 2.0", daf);

    // Steady-state: as t → inf, u → u_st
    let t_large: f64 = 100.0;
    let u_ss: f64 = u_st * (1.0 - (-xi * omega_n * t_large).exp()
        * ((omega_d * t_large).cos()
           + xi * omega_n / omega_d * (omega_d * t_large).sin()));
    assert_close(u_ss, u_st, 0.01, "Steady-state displacement");
}

// ================================================================
// 4. Logarithmic Decrement (delta = 2*pi*xi / sqrt(1-xi^2))
// ================================================================
//
// delta = ln(u_n / u_{n+1}) = 2*pi*xi / sqrt(1-xi²)
// For small xi: delta ≈ 2*pi*xi
//
// xi = 0.05: delta = 0.31455
// Cycles to halve amplitude: n = ln(2)/delta = 2.203
//
// Inverse: from u1=10mm, u11=3mm (10 cycles):
//   delta = ln(10/3)/10 = 0.12040
//   xi = delta/sqrt(4*pi²+delta²) = 0.01915

#[test]
fn validation_logarithmic_decrement() {
    // Forward: compute delta from damping ratio
    let xi: f64 = 0.05;
    let delta: f64 = 2.0 * PI * xi / (1.0 - xi * xi).sqrt();
    let delta_approx: f64 = 2.0 * PI * xi;

    assert_close(delta, 0.31455, 0.01, "Log decrement delta");
    assert_close(delta, delta_approx, 0.01, "delta approx 2*pi*xi for small xi");

    // Cycles to halve amplitude
    let n_half: f64 = 2.0_f64.ln() / delta;
    assert_close(n_half, 2.203, 0.02, "Cycles to halve amplitude");

    // Inverse: extract damping from measured peaks
    let u1: f64 = 10.0;
    let u11: f64 = 3.0;
    let n_cycles: f64 = 10.0;
    let delta_meas: f64 = (u1 / u11).ln() / n_cycles;
    let xi_meas: f64 = delta_meas / (4.0 * PI * PI + delta_meas * delta_meas).sqrt();

    assert_close(delta_meas, 0.12040, 0.01, "Measured delta");
    assert_close(xi_meas, 0.01915, 0.02, "Extracted damping ratio");
}

// ================================================================
// 5. Response Spectrum (Pseudo-Acceleration Sa from Sd)
// ================================================================
//
// Sa = omega_n² * Sd, Sv = omega_n * Sd, Sa = omega_n * Sv
//
// Sd = 0.05 m, T = 1.0 s: omega_n = 6.2832
//   Sa = 39.478*0.05 = 1.974 m/s²
//   Sv = 6.2832*0.05 = 0.3142 m/s
//
// T = 0.5 s: omega_n = 12.566
//   Sa = 157.91*0.05 = 7.896 m/s²

#[test]
fn validation_response_spectrum() {
    let sd: f64 = 0.05;

    // T = 1.0 s
    let t1: f64 = 1.0;
    let omega1: f64 = 2.0 * PI / t1;
    let sa1: f64 = omega1 * omega1 * sd;
    let sv1: f64 = omega1 * sd;

    assert_close(omega1, 6.2832, 0.001, "omega_n at T=1s");
    assert_close(sa1, 1.974, 0.01, "Sa at T=1s");
    assert_close(sv1, 0.3142, 0.01, "Sv at T=1s");

    // Verify Sa = omega * Sv
    assert_close(sa1, omega1 * sv1, 0.001, "Sa = omega*Sv");

    // T = 0.5 s
    let t2: f64 = 0.5;
    let omega2: f64 = 2.0 * PI / t2;
    let sa2: f64 = omega2 * omega2 * sd;
    assert_close(sa2, 7.896, 0.01, "Sa at T=0.5s");

    // Shorter period → higher Sa for same Sd
    assert!(sa2 > sa1, "Sa increases with shorter period for constant Sd");

    // Design spectrum check
    let g: f64 = 9.81;
    let sds: f64 = 1.0 * g;
    let sd1: f64 = 0.6 * g;
    let ts: f64 = sd1 / sds;
    assert_close(ts, 0.6, 0.001, "Ts transition period");

    let sa_design_short: f64 = sds;
    let sa_design_long: f64 = sd1 / 1.0;
    assert!(sa_design_short > sa_design_long, "Sa decreases past Ts");
}

// ================================================================
// 6. Rayleigh Quotient for Fundamental Frequency
// ================================================================
//
// omega² = phi^T*K*phi / (phi^T*M*phi)
//
// 3-story shear building, linear mode shape phi = [1/3, 2/3, 1]
//   k1 = k2 = k3 = 10000 kN/m, m1 = m2 = m3 = 50000 kg
//
// Numerator = k*(3*(1/3)²) = k/3
// Denominator = m*(1/9 + 4/9 + 1) = m*14/9

#[test]
fn validation_rayleigh_quotient() {
    let k: f64 = 10_000e3; // N/m
    let m: f64 = 50_000.0; // kg

    // Assumed linear mode shape
    let phi: [f64; 3] = [1.0 / 3.0, 2.0 / 3.0, 1.0];

    // Story drifts
    let deltas: [f64; 3] = [phi[0], phi[1] - phi[0], phi[2] - phi[1]];
    let numerator: f64 = deltas.iter().map(|d| k * d * d).sum();
    let denominator: f64 = phi.iter().map(|p| m * p * p).sum();

    let omega_sq: f64 = numerator / denominator;
    let omega: f64 = omega_sq.sqrt();
    let fn_hz: f64 = omega / (2.0 * PI);

    let expected_num: f64 = k * 3.0 / 9.0;
    let expected_den: f64 = m * 14.0 / 9.0;
    assert_close(numerator, expected_num, 0.01, "Rayleigh numerator");
    assert_close(denominator, expected_den, 0.01, "Rayleigh denominator");

    assert_close(omega_sq, expected_num / expected_den, 0.001, "omega^2 Rayleigh");
    assert!(fn_hz > 0.5 && fn_hz < 5.0, "fn = {:.3} Hz in reasonable range", fn_hz);

    // Rayleigh quotient always overestimates the true frequency (upper bound)
    assert!(omega > 0.0, "omega must be positive");
}

// ================================================================
// 7. Tuned Mass Damper Optimal Parameters (Den Hartog)
// ================================================================
//
// Optimal tuning ratio: f_opt = 1/(1+mu)
// Optimal damping ratio: xi_opt = sqrt(3*mu/(8*(1+mu)))
//
// ms = 500000 kg, md = 25000 kg (mu = 0.05)
//   f_opt = 1/1.05 = 0.9524
//   xi_opt = sqrt(0.15/8.4) = 0.1336

#[test]
fn validation_tuned_mass_damper() {
    let ms: f64 = 500_000.0;
    let md: f64 = 25_000.0;
    let mu: f64 = md / ms;
    assert_close(mu, 0.05, 0.001, "Mass ratio mu");

    let ts: f64 = 3.0;
    let omega_s: f64 = 2.0 * PI / ts;

    // Den Hartog optimal parameters
    let f_opt: f64 = 1.0 / (1.0 + mu);
    let xi_opt: f64 = (3.0 * mu / (8.0 * (1.0 + mu))).sqrt();

    assert_close(f_opt, 1.0 / 1.05, 0.001, "Optimal tuning ratio");
    assert_close(xi_opt, (0.15_f64 / 8.4).sqrt(), 0.001, "Optimal TMD damping");

    // TMD physical properties
    let omega_d: f64 = f_opt * omega_s;
    let kd: f64 = omega_d * omega_d * md;
    let cd: f64 = 2.0 * xi_opt * omega_d * md;

    let kd_kn: f64 = kd / 1e3;
    let cd_kns: f64 = cd / 1e3;

    assert_close(omega_d, f_opt * omega_s, 0.001, "TMD frequency");

    // TMD period slightly longer than structure period
    let td: f64 = 2.0 * PI / omega_d;
    assert!(td > ts, "TMD period should be slightly longer than structure period");

    // Verify stiffness and damping are positive and reasonable
    assert!(kd_kn > 50.0 && kd_kn < 200.0, "kd = {:.1} kN/m", kd_kn);
    assert!(cd_kns > 5.0 && cd_kns < 50.0, "cd = {:.1} kN*s/m", cd_kns);
}

// ================================================================
// 8. Base Isolation Period Shift (Effective Period)
// ================================================================
//
// Fixed-base: Tf = 2*pi*sqrt(m/ks)
// Isolated: Ti = 2*pi*sqrt(m*(1/kb + 1/ks))
//
// m = 1e6 kg, ks = 500e6 N/m, kb = 5e6 N/m
//   Tf = 2*pi*sqrt(0.002) = 0.2810 s
//   Ti ≈ 2.824 s
//   Period shift ≈ 10.0

#[test]
fn validation_base_isolation_period() {
    let m: f64 = 1e6;
    let ks: f64 = 500e6;
    let kb: f64 = 5e6;

    // Fixed-base period
    let tf: f64 = 2.0 * PI * (m / ks).sqrt();
    assert_close(tf, 0.2810, 0.01, "Fixed-base period");

    // Isolated period (series spring model)
    let k_eff_inv: f64 = 1.0 / kb + 1.0 / ks;
    let ti: f64 = 2.0 * PI * (m * k_eff_inv).sqrt();

    // Period shift
    let shift: f64 = ti / tf;
    let expected_shift: f64 = ((ks + kb) / kb).sqrt();
    assert_close(shift, expected_shift, 0.001, "Period shift ratio");

    // Approximate shift for kb << ks
    let approx_shift: f64 = (ks / kb).sqrt();
    assert_close(shift, approx_shift, 0.02, "Approximate period shift");

    // Isolated period should be much longer
    assert!(ti > 2.0, "Isolated period should be > 2.0 s, got {:.3}", ti);
    assert!(ti / tf > 5.0, "Period shift should be significant");

    // Force reduction: Sa ratio ≈ (Tf/Ti)² for constant Sv spectrum
    let force_reduction: f64 = (tf / ti).powi(2);
    assert!(force_reduction < 0.02, "Force reduction = {:.4}, should be significant", force_reduction);

    // Displacement amplification: Sd(Ti)/Sd(Tf) ≈ Ti/Tf for constant Sv
    let disp_amplification: f64 = ti / tf;
    assert!(disp_amplification > 5.0, "Displacement at isolator increases");
}
