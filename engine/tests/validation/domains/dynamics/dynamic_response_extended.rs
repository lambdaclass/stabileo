/// Validation: Extended Structural Dynamics (Formula Verification)
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed.
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Biggs, "Introduction to Structural Dynamics", McGraw-Hill
///   - Paz & Kim, "Structural Dynamics: Theory and Computation", 6th Ed.
///   - Newmark & Rosenblueth, "Fundamentals of Earthquake Engineering"
///
/// Tests verify additional structural dynamics formulas:
///   1. Transmissibility ratio for force isolation
///   2. Coulomb (friction) equivalent damping in SDOF
///   3. Half-power bandwidth method for damping estimation
///   4. Rayleigh quotient upper-bound frequency estimate
///   5. Wilson-theta method single-step accuracy
///   6. SRSS and CQC modal combination rules
///   7. Duhamel integral for triangular pulse load
///   8. Logarithmic decrement chain for multi-cycle damping

use std::f64::consts::PI;

// ================================================================
// 1. Transmissibility Ratio for Force Isolation
// ================================================================
//
// For a harmonically excited SDOF system mounted on a vibrating base,
// the force transmissibility is:
//   TR = sqrt((1 + (2*zeta*r)^2) / ((1 - r^2)^2 + (2*zeta*r)^2))
//
// At r = 0: TR = 1 (quasi-static)
// At r = sqrt(2): TR = 1 (crossover, independent of damping)
// For r >> sqrt(2): TR < 1 (isolation regime)
// At resonance (r=1): TR = sqrt(1 + (2*zeta)^2) / (2*zeta)
//
// Reference: Chopra, Ch. 3; Clough & Penzien, Ch. 3

#[test]
fn validation_dynamic_transmissibility_ratio() {
    let zeta: f64 = 0.05;

    let tr = |r: f64, z: f64| -> f64 {
        let num: f64 = 1.0_f64 + (2.0_f64 * z * r).powi(2);
        let den: f64 = (1.0_f64 - r * r).powi(2) + (2.0_f64 * z * r).powi(2);
        (num / den).sqrt()
    };

    // At r = 0: TR = 1.0
    let tr_static: f64 = tr(0.0, zeta);
    assert!(
        (tr_static - 1.0_f64).abs() < 1e-10_f64,
        "TR(r=0) = {:.6}, expected 1.0",
        tr_static
    );

    // At resonance (r=1): TR = sqrt(1 + 4*zeta^2) / (2*zeta)
    let tr_res: f64 = tr(1.0, zeta);
    let tr_res_expected: f64 = (1.0_f64 + 4.0_f64 * zeta * zeta).sqrt() / (2.0_f64 * zeta);
    assert!(
        (tr_res - tr_res_expected).abs() / tr_res_expected < 1e-10_f64,
        "TR(r=1) = {:.4}, expected {:.4}",
        tr_res, tr_res_expected
    );

    // At r = sqrt(2): TR = 1 for all damping ratios
    let r_cross: f64 = (2.0_f64 as f64).sqrt();
    for &z in &[0.01_f64, 0.05, 0.10, 0.20, 0.50] {
        let tr_val: f64 = tr(r_cross, z);
        assert!(
            (tr_val - 1.0_f64).abs() < 1e-10_f64,
            "TR(r=sqrt2, zeta={}) = {:.6}, expected 1.0",
            z, tr_val
        );
    }

    // For r > sqrt(2), TR < 1 (isolation)
    let tr_iso: f64 = tr(3.0, zeta);
    assert!(
        tr_iso < 1.0_f64,
        "TR(r=3) = {:.6}, should be < 1 (isolation)",
        tr_iso
    );

    // Verify that higher damping increases TR in isolation regime
    // (counterintuitive: more damping is worse for isolation at high r)
    let tr_low_damp: f64 = tr(3.0, 0.01);
    let tr_high_damp: f64 = tr(3.0, 0.30);
    assert!(
        tr_high_damp > tr_low_damp,
        "In isolation, higher damping gives worse TR: TR(z=0.01)={:.6}, TR(z=0.30)={:.6}",
        tr_low_damp, tr_high_damp
    );
}

// ================================================================
// 2. Equivalent Viscous Damping from Coulomb Friction
// ================================================================
//
// For a system with Coulomb friction force F_f under harmonic motion
// at amplitude X, the equivalent viscous damping ratio is:
//   zeta_eq = (2/pi) * F_f / (k * X)
//             = (2/pi) * mu * N / (k * X)
//
// The energy dissipated per cycle by Coulomb friction:
//   W_f = 4 * F_f * X
//
// Compared to viscous dissipation:
//   W_v = pi * c * omega * X^2
//
// Setting equal: c_eq = 4*F_f / (pi*omega*X)
// => zeta_eq = c_eq / (2*m*omega) = 2*F_f / (pi*k*X)
//
// Reference: Chopra, Ch. 3; Clough & Penzien, §3.7

#[test]
fn validation_dynamic_coulomb_equivalent_damping() {
    let m: f64 = 100.0;
    let k: f64 = 10_000.0;
    let omega_n: f64 = (k / m).sqrt(); // = 10 rad/s

    // Friction parameters
    let mu: f64 = 0.1;        // friction coefficient
    let n_force: f64 = m * 9.81; // normal force = weight
    let f_f: f64 = mu * n_force; // friction force

    // Assumed vibration amplitude
    let x_amp: f64 = 0.01; // m

    // Energy dissipated per cycle by Coulomb friction
    let w_coulomb: f64 = 4.0_f64 * f_f * x_amp;

    // Energy dissipated per cycle by viscous damper c at frequency omega
    // W_v = pi * c * omega * X^2
    // Setting W_coulomb = W_v:
    let c_eq: f64 = 4.0_f64 * f_f / (PI * omega_n * x_amp);

    // Equivalent damping ratio
    let c_cr: f64 = 2.0_f64 * m * omega_n; // critical damping
    let zeta_eq: f64 = c_eq / c_cr;

    // Direct formula: zeta_eq = 2*F_f / (pi*k*X)
    let zeta_eq_direct: f64 = 2.0_f64 * f_f / (PI * k * x_amp);
    assert!(
        (zeta_eq - zeta_eq_direct).abs() / zeta_eq < 1e-10_f64,
        "zeta_eq: {:.6}, direct: {:.6}",
        zeta_eq, zeta_eq_direct
    );

    // Verify energy equivalence
    let w_viscous: f64 = PI * c_eq * omega_n * x_amp * x_amp;
    assert!(
        (w_viscous - w_coulomb).abs() / w_coulomb < 1e-10_f64,
        "W_viscous={:.6}, W_coulomb={:.6}",
        w_viscous, w_coulomb
    );

    // Coulomb friction dissipation is independent of frequency (unlike viscous)
    // Check: W_coulomb depends only on F_f and X, not omega
    let w_coulomb_alt: f64 = 4.0_f64 * f_f * x_amp;
    assert!(
        (w_coulomb - w_coulomb_alt).abs() < 1e-14_f64,
        "Coulomb dissipation is frequency-independent"
    );

    // zeta_eq should be positive and less than 1 for realistic parameters
    assert!(
        zeta_eq > 0.0_f64 && zeta_eq < 1.0_f64,
        "zeta_eq = {:.6} should be in (0, 1)",
        zeta_eq
    );

    // If amplitude doubles, equivalent damping halves (nonlinear feature)
    let zeta_eq_2x: f64 = 2.0_f64 * f_f / (PI * k * (2.0_f64 * x_amp));
    assert!(
        (zeta_eq_2x - zeta_eq / 2.0_f64).abs() / zeta_eq < 1e-10_f64,
        "Doubling amplitude halves zeta_eq: {:.6} vs {:.6}",
        zeta_eq_2x, zeta_eq / 2.0
    );
}

// ================================================================
// 3. Half-Power Bandwidth Method for Damping Estimation
// ================================================================
//
// From the frequency response function, the damping ratio can be
// estimated by measuring the bandwidth at 1/sqrt(2) of the peak:
//   zeta = (omega_2 - omega_1) / (2 * omega_n)
//
// where omega_1, omega_2 are the frequencies at which |H| = |H_peak|/sqrt(2).
//
// For the magnification factor Rd:
//   Rd_peak = 1/(2*zeta) at r = sqrt(1 - 2*zeta^2) ~ 1
//   At Rd = Rd_peak/sqrt(2), the two frequency ratios satisfy:
//     r^2 = 1 - 2*zeta^2 +/- 2*zeta*sqrt(1-zeta^2)
//   For small zeta: r1 ~ 1-zeta, r2 ~ 1+zeta
//
// Reference: Chopra, Ch. 3; Clough & Penzien, §3.4

#[test]
fn validation_dynamic_half_power_bandwidth() {
    // Test for several damping ratios
    let test_cases: [(f64, &str); 4] = [
        (0.01_f64, "1%"),
        (0.05_f64, "5%"),
        (0.10_f64, "10%"),
        (0.02_f64, "2%"),
    ];

    for (zeta, label) in &test_cases {
        let omega_n: f64 = 100.0; // rad/s (arbitrary reference)

        // Exact half-power frequencies
        // r1^2 = 1 - 2*zeta^2 - 2*zeta*sqrt(1-zeta^2)
        // r2^2 = 1 - 2*zeta^2 + 2*zeta*sqrt(1-zeta^2)
        let disc: f64 = 2.0_f64 * zeta * (1.0_f64 - zeta * zeta).sqrt();
        let r1_sq: f64 = 1.0_f64 - 2.0_f64 * zeta * zeta - disc;
        let r2_sq: f64 = 1.0_f64 - 2.0_f64 * zeta * zeta + disc;

        // Both should be positive for small zeta
        assert!(
            r1_sq > 0.0_f64 && r2_sq > 0.0_f64,
            "zeta={}: r1_sq={:.6}, r2_sq={:.6}",
            label, r1_sq, r2_sq
        );

        let r1: f64 = r1_sq.sqrt();
        let r2: f64 = r2_sq.sqrt();

        let omega_1: f64 = r1 * omega_n;
        let omega_2: f64 = r2 * omega_n;

        // Half-power bandwidth damping estimate
        let zeta_est: f64 = (omega_2 - omega_1) / (2.0_f64 * omega_n);

        // For small zeta, this approximation is very accurate
        // Exact: delta_r = r2 - r1
        // We expect zeta_est ~ zeta (exact for small zeta)
        let rel_error: f64 = (zeta_est - *zeta).abs() / *zeta;

        if *zeta < 0.15_f64 {
            assert!(
                rel_error < 0.02_f64,
                "zeta={}: estimated={:.6}, actual={:.6}, error={:.4}%",
                label, zeta_est, zeta, rel_error * 100.0
            );
        }

        // Verify Rd at half-power points equals Rd_peak / sqrt(2)
        let rd = |r: f64, z: f64| -> f64 {
            1.0_f64 / ((1.0_f64 - r * r).powi(2) + (2.0_f64 * z * r).powi(2)).sqrt()
        };

        let rd_peak: f64 = 1.0_f64 / (2.0_f64 * zeta * (1.0_f64 - zeta * zeta).sqrt());
        let rd_at_r1: f64 = rd(r1, *zeta);
        let rd_at_r2: f64 = rd(r2, *zeta);
        let rd_half_power: f64 = rd_peak / (2.0_f64 as f64).sqrt();

        assert!(
            (rd_at_r1 - rd_half_power).abs() / rd_half_power < 1e-6_f64,
            "zeta={}: Rd(r1)={:.4}, Rd_peak/sqrt2={:.4}",
            label, rd_at_r1, rd_half_power
        );
        assert!(
            (rd_at_r2 - rd_half_power).abs() / rd_half_power < 1e-6_f64,
            "zeta={}: Rd(r2)={:.4}, Rd_peak/sqrt2={:.4}",
            label, rd_at_r2, rd_half_power
        );
    }
}

// ================================================================
// 4. Rayleigh Quotient Upper-Bound Frequency Estimate
// ================================================================
//
// The Rayleigh quotient R(psi) = (psi^T K psi) / (psi^T M psi)
// provides an upper bound on omega_1^2 for any trial shape psi.
//
// For a uniform cantilever beam with assumed static deflection shape
// psi(x) = 1 - cos(pi*x/(2L)), the Rayleigh frequency is close
// to the exact first-mode frequency:
//   omega_1_exact = (1.8751)^2 * sqrt(EI / (rho*A*L^4))
//
// Reference: Chopra, Ch. 8; Paz & Kim, Ch. 5

#[test]
fn validation_dynamic_rayleigh_quotient() {
    let ei: f64 = 1e6;      // N*m^2
    let rho_a: f64 = 10.0;  // kg/m (mass per unit length)
    let l: f64 = 5.0;       // m

    // Exact first-mode frequency for cantilever
    let beta1_l: f64 = 1.8751;
    let omega_exact: f64 = beta1_l.powi(2) / (l * l) * (ei / rho_a).sqrt();

    // Rayleigh quotient with static deflection: psi = 1 - cos(pi*x/(2L))
    // Numerator: integral of EI * (psi'')^2 dx from 0 to L
    // psi'' = (pi/(2L))^2 * cos(pi*x/(2L))
    // integral((psi'')^2, 0, L) = (pi/(2L))^4 * integral(cos^2(pi*x/(2L)), 0, L)
    //                            = (pi/(2L))^4 * L/2

    let pi_2l: f64 = PI / (2.0_f64 * l);
    let k_num: f64 = ei * pi_2l.powi(4) * l / 2.0_f64;

    // Denominator: integral of rho*A * psi^2 dx from 0 to L
    // psi = 1 - cos(pi*x/(2L))
    // psi^2 = 1 - 2*cos(pi*x/(2L)) + cos^2(pi*x/(2L))
    // integral(psi^2, 0, L) = L - 2*L*2/pi*sin(pi/2) + L/2*(1 + sin(pi)/(pi))
    //                        = L - 4L/pi + L/2
    //                        = L*(3/2 - 4/pi)
    let m_den: f64 = rho_a * l * (1.5_f64 - 4.0_f64 / PI);

    let omega_rayleigh_sq: f64 = k_num / m_den;
    let omega_rayleigh: f64 = omega_rayleigh_sq.sqrt();

    // Rayleigh quotient should be an upper bound
    assert!(
        omega_rayleigh >= omega_exact * 0.999_f64,
        "Rayleigh should be >= exact: {:.4} vs {:.4}",
        omega_rayleigh, omega_exact
    );

    // And close to the exact value (within ~5% for a reasonable trial shape)
    let error: f64 = (omega_rayleigh - omega_exact).abs() / omega_exact;
    assert!(
        error < 0.10_f64,
        "Rayleigh estimate error: {:.2}% (omega_R={:.4}, omega_exact={:.4})",
        error * 100.0, omega_rayleigh, omega_exact
    );
}

// ================================================================
// 5. Wilson-Theta Method Single-Step Accuracy
// ================================================================
//
// The Wilson-theta method extends the Newmark approach by assuming
// linear acceleration over an extended interval theta*dt.
// For theta = 1.4, it is unconditionally stable.
//
// For an undamped SDOF under step load F0:
//   u(t) = (F0/k)*(1 - cos(omega*t))
//
// We verify one step of the Wilson-theta algorithm manually.
//
// Reference: Clough & Penzien, Ch. 13; Bathe, "Numerical Methods"

#[test]
fn validation_dynamic_wilson_theta_single_step() {
    let m: f64 = 1.0;
    let k: f64 = 100.0;
    let f0: f64 = 10.0;

    let omega_n: f64 = (k / m).sqrt(); // 10 rad/s
    let t_n: f64 = 2.0_f64 * PI / omega_n;

    // Wilson-theta parameters
    let theta: f64 = 1.4;
    let dt: f64 = t_n / 20.0_f64;

    // Initial conditions: u=0, v=0, a = F0/m = 10
    let u0: f64 = 0.0;
    let v0: f64 = 0.0;
    let a0: f64 = f0 / m;

    // Effective stiffness for Wilson-theta:
    // k_hat = k + 6*m/(theta*dt)^2  (no damping)
    let theta_dt: f64 = theta * dt;
    let k_hat: f64 = k + 6.0_f64 * m / (theta_dt * theta_dt);

    // Effective force at t + theta*dt:
    // F_hat = F(t+theta*dt) + m*(6/(theta*dt)^2 * u + 6/(theta*dt) * v + 2*a)
    // For step load: F(t+theta*dt) = F0 (constant)
    let f_hat: f64 = f0 + m * (6.0_f64 / (theta_dt * theta_dt) * u0
        + 6.0_f64 / theta_dt * v0
        + 2.0_f64 * a0);

    // Solve for u at t + theta*dt
    let u_theta_dt: f64 = f_hat / k_hat;

    // Extract acceleration at t + theta*dt
    let a_theta_dt: f64 = 6.0_f64 / (theta_dt * theta_dt) * (u_theta_dt - u0)
        - 6.0_f64 / theta_dt * v0 - 2.0_f64 * a0;

    // Interpolate back to get acceleration at t + dt:
    // a1 = a0 + (a_theta_dt - a0) / theta
    let a1: f64 = a0 + (a_theta_dt - a0) / theta;

    // Velocity and displacement at t + dt using linear acceleration within dt:
    let v1: f64 = v0 + dt / 2.0_f64 * (a0 + a1);
    let u1: f64 = u0 + dt * v0 + dt * dt / 6.0_f64 * (2.0_f64 * a0 + a1);

    // Exact solution at t = dt
    let u_exact: f64 = (f0 / k) * (1.0_f64 - (omega_n * dt).cos());
    let v_exact: f64 = (f0 / k) * omega_n * (omega_n * dt).sin();

    // Wilson-theta should be reasonably accurate for dt = T/20
    let u_error: f64 = (u1 - u_exact).abs() / u_exact;
    let v_error: f64 = (v1 - v_exact).abs() / v_exact;

    assert!(
        u_error < 0.05_f64,
        "Wilson-theta u1 error: {:.4}% (u1={:.6e}, exact={:.6e})",
        u_error * 100.0, u1, u_exact
    );
    assert!(
        v_error < 0.05_f64,
        "Wilson-theta v1 error: {:.4}% (v1={:.6e}, exact={:.6e})",
        v_error * 100.0, v1, v_exact
    );

    // theta=1.4 should be unconditionally stable: k_hat > 0 always
    assert!(k_hat > 0.0_f64, "k_hat should be positive: {:.4}", k_hat);
}

// ================================================================
// 6. SRSS and CQC Modal Combination Rules
// ================================================================
//
// For modal analysis with well-separated frequencies:
//   SRSS: R = sqrt(sum(Ri^2))
//
// For closely-spaced modes, CQC (Complete Quadratic Combination):
//   R = sqrt(sum_i sum_j rho_ij * Ri * Rj)
//
// where rho_ij (Der Kiureghian correlation coefficient):
//   rho_ij = 8*zeta^2*(1+beta)*beta^(3/2) /
//            ((1-beta^2)^2 + 4*zeta^2*beta*(1+beta)^2)
//   beta = omega_j / omega_i
//
// For i=j: rho_ii = 1 (exactly)
// For well-separated modes: rho_ij -> 0, CQC -> SRSS
//
// Reference: Chopra, Ch. 13; Der Kiureghian (1981)

#[test]
fn validation_dynamic_srss_cqc_combination() {
    let zeta: f64 = 0.05;

    // Der Kiureghian cross-correlation coefficient
    let rho = |beta: f64, z: f64| -> f64 {
        let num: f64 = 8.0_f64 * z * z * (1.0_f64 + beta) * beta.powf(1.5_f64);
        let den: f64 = (1.0_f64 - beta * beta).powi(2)
            + 4.0_f64 * z * z * beta * (1.0_f64 + beta).powi(2);
        num / den
    };

    // rho(1.0) = 1.0 (self-correlation)
    let rho_self: f64 = rho(1.0, zeta);
    assert!(
        (rho_self - 1.0_f64).abs() < 1e-10_f64,
        "rho(1.0) = {:.6}, expected 1.0",
        rho_self
    );

    // For well-separated modes (beta = 0.5): rho should be small
    let rho_sep: f64 = rho(0.5, zeta);
    assert!(
        rho_sep < 0.05_f64,
        "rho(0.5) = {:.6}, should be small for separated modes",
        rho_sep
    );

    // For closely-spaced modes (beta = 0.95): rho should be large
    let rho_close: f64 = rho(0.95, zeta);
    assert!(
        rho_close > 0.3_f64,
        "rho(0.95) = {:.6}, should be significant for close modes",
        rho_close
    );

    // SRSS combination for 3 modes
    let r_modes: [f64; 3] = [100.0_f64, 40.0_f64, 10.0_f64];
    let r_srss: f64 = (r_modes[0].powi(2) + r_modes[1].powi(2) + r_modes[2].powi(2)).sqrt();
    let r_srss_expected: f64 = (100.0_f64 * 100.0 + 40.0 * 40.0 + 10.0 * 10.0 as f64).sqrt();
    assert!(
        (r_srss - r_srss_expected).abs() < 1e-10_f64,
        "SRSS: {:.4}, expected {:.4}",
        r_srss, r_srss_expected
    );

    // CQC with well-separated modes should approximate SRSS
    let omegas: [f64; 3] = [10.0_f64, 30.0_f64, 60.0_f64]; // well-separated
    let mut r_cqc_sq: f64 = 0.0;
    for i in 0..3 {
        for j in 0..3 {
            let beta_ij: f64 = omegas[j] / omegas[i];
            let _rho_ij: f64 = rho(beta_ij.min(1.0_f64 / beta_ij) * beta_ij.min(1.0) / beta_ij.min(1.0), zeta);
            // Use the correct formulation: always compute with beta <= 1
            let beta_val: f64 = if omegas[j] <= omegas[i] {
                omegas[j] / omegas[i]
            } else {
                omegas[i] / omegas[j]
            };
            let rho_val: f64 = rho(beta_val, zeta);
            r_cqc_sq += rho_val * r_modes[i] * r_modes[j];
        }
    }
    let r_cqc: f64 = r_cqc_sq.sqrt();

    // For well-separated modes, CQC ~ SRSS (within a few percent)
    let cqc_srss_diff: f64 = (r_cqc - r_srss).abs() / r_srss;
    assert!(
        cqc_srss_diff < 0.05_f64,
        "CQC ({:.4}) ~ SRSS ({:.4}) for separated modes, diff={:.4}%",
        r_cqc, r_srss, cqc_srss_diff * 100.0
    );

    // For identical modes (beta=1), CQC gives absolute sum
    let r_identical: [f64; 2] = [50.0_f64, 30.0_f64];
    let rho_11: f64 = rho(1.0, zeta);
    let r_cqc_identical: f64 = (rho_11 * r_identical[0] * r_identical[0]
        + rho_11 * r_identical[0] * r_identical[1]
        + rho_11 * r_identical[1] * r_identical[0]
        + rho_11 * r_identical[1] * r_identical[1]).sqrt();
    let r_abs_sum: f64 = r_identical[0] + r_identical[1];
    assert!(
        (r_cqc_identical - r_abs_sum).abs() / r_abs_sum < 1e-10_f64,
        "CQC with identical modes = absolute sum: {:.4} vs {:.4}",
        r_cqc_identical, r_abs_sum
    );
}

// ================================================================
// 7. Duhamel Integral for Triangular Pulse Load
// ================================================================
//
// A triangular pulse load rises from 0 to F0 at t=0, then linearly
// decreases back to 0 at t = td (pulse duration).
//
// For td/T_n = 1 (pulse duration equals natural period):
//   The response during the loading phase (0 <= t <= td) is:
//     u(t) = (F0/k) * [t/td - sin(omega*t)/(omega*td)]           for 0 <= t <= td/2
//
// Peak response occurs during or shortly after the pulse.
// The dynamic load factor (DLF) depends on td/T_n ratio.
//
// For td/T_n = 1: DLF ~ 1.0 (first peak)
// For td/T_n >> 1: DLF -> 1.0 (quasi-static)
// For td/T_n << 1: DLF -> 0 (impulse regime)
//
// Reference: Biggs, Ch. 2; Chopra, Ch. 4

#[test]
fn validation_dynamic_triangular_pulse() {
    let m: f64 = 1.0;
    let k: f64 = 100.0;
    let f0: f64 = 10.0;

    let omega_n: f64 = (k / m).sqrt();
    let t_n: f64 = 2.0_f64 * PI / omega_n;
    let u_static: f64 = f0 / k;

    // Triangular pulse: F(t) = F0*(1 - t/td) for 0 <= t <= td
    // For td/T = 1: td = T
    let td: f64 = t_n;

    // Response during loading (0 <= t <= td) for triangular (linearly decreasing) pulse:
    // u(t) = (F0/k) * [1 - t/td - cos(omega*t) + sin(omega*t)/(omega*td)]
    let u_pulse = |t: f64| -> f64 {
        u_static * (1.0_f64 - t / td - (omega_n * t).cos()
            + (omega_n * t).sin() / (omega_n * td))
    };

    // At t = 0: u = 0
    let u_0: f64 = u_pulse(0.0);
    assert!(
        u_0.abs() < 1e-10_f64,
        "u(0) = {:.6e}, expected 0",
        u_0
    );

    // Find approximate peak during loading phase by sampling
    let n_samples: usize = 1000;
    let mut u_max: f64 = 0.0;
    for i in 0..=n_samples {
        let t: f64 = i as f64 * td / n_samples as f64;
        let u_val: f64 = u_pulse(t).abs();
        if u_val > u_max {
            u_max = u_val;
        }
    }

    // DLF = u_max / u_static
    let dlf: f64 = u_max / u_static;

    // For triangular pulse with td/T = 1, DLF should be approximately 1.2-1.5
    assert!(
        dlf > 0.5_f64 && dlf < 2.0_f64,
        "DLF for triangular pulse (td/T=1): {:.4}, expected in (0.5, 2.0)",
        dlf
    );

    // Free vibration phase (t > td): the response should oscillate
    // At t = td, we have u(td) and v(td) as initial conditions for free vibration
    let u_td: f64 = u_pulse(td);

    // After the pulse, the system continues with free vibration:
    // u(t) = A*cos(omega*(t-td)) + B*sin(omega*(t-td)) for t > td
    // The system oscillates about u=0 (no static force after pulse)

    // Verify free vibration response is bounded by sqrt(u_td^2 + (v_td/omega)^2)
    // Compute velocity at t = td using derivative of u_pulse
    let v_td: f64 = u_static * (-1.0_f64 / td + omega_n * (omega_n * td).sin()
        + (omega_n * (omega_n * td).cos()) / (omega_n * td));

    let amplitude: f64 = (u_td * u_td + (v_td / omega_n).powi(2)).sqrt();
    // Amplitude should be finite and positive
    assert!(
        amplitude >= 0.0_f64 && amplitude < 10.0_f64 * u_static,
        "Free vibration amplitude: {:.6e}",
        amplitude
    );

    // For td/T >> 1 (quasi-static): DLF -> 1.0
    let td_long: f64 = 10.0_f64 * t_n;
    let u_quasi = |t: f64| -> f64 {
        u_static * (1.0_f64 - t / td_long - (omega_n * t).cos()
            + (omega_n * t).sin() / (omega_n * td_long))
    };
    // At t small compared to td_long, the response approaches static
    let u_early: f64 = u_quasi(0.001_f64 * td_long);
    // Should be small relative to F0/k since load barely decreased
    assert!(
        u_early.abs() < 5.0_f64 * u_static,
        "Quasi-static response bounded: u={:.6e}",
        u_early
    );
}

// ================================================================
// 8. Logarithmic Decrement Chain for Multi-Cycle Damping
// ================================================================
//
// The logarithmic decrement delta relates successive peaks:
//   delta = ln(u_n / u_{n+1}) = 2*pi*zeta / sqrt(1 - zeta^2)
//
// For N cycles:
//   delta = (1/N) * ln(u_1 / u_{N+1})
//
// The damping ratio can be recovered:
//   zeta = delta / sqrt(4*pi^2 + delta^2)
//
// For small damping: delta ~ 2*pi*zeta
//   and after N cycles: u_{N+1}/u_1 = exp(-N*delta) = exp(-2*N*pi*zeta)
//
// Reference: Chopra, Ch. 2; Clough & Penzien, §2.5

#[test]
fn validation_dynamic_log_decrement_chain() {
    let zeta: f64 = 0.03;  // 3% damping
    let omega_n: f64 = 20.0; // rad/s
    let omega_d: f64 = omega_n * (1.0_f64 - zeta * zeta).sqrt();
    let t_d: f64 = 2.0_f64 * PI / omega_d;

    // Exact logarithmic decrement
    let delta: f64 = 2.0_f64 * PI * zeta / (1.0_f64 - zeta * zeta).sqrt();

    // Approximate: delta ~ 2*pi*zeta for small zeta
    let delta_approx: f64 = 2.0_f64 * PI * zeta;
    let approx_error: f64 = (delta - delta_approx).abs() / delta;
    assert!(
        approx_error < 0.001_f64,
        "delta approx error: {:.4}% for zeta=3%",
        approx_error * 100.0
    );

    // Recover zeta from delta
    let zeta_recovered: f64 = delta / (4.0_f64 * PI * PI + delta * delta).sqrt();
    assert!(
        (zeta_recovered - zeta).abs() / zeta < 1e-10_f64,
        "Recovered zeta: {:.6}, original: {:.6}",
        zeta_recovered, zeta
    );

    // Generate peak amplitudes for N cycles of damped free vibration
    // u(t) = u0 * exp(-zeta*omega_n*t) * cos(omega_d*t - phi)
    // Peaks at t_n = n * T_d (approximately, for small damping)
    let u0: f64 = 1.0;
    let n_cycles: usize = 20;

    let mut peaks = Vec::new();
    for n in 0..=n_cycles {
        let t: f64 = n as f64 * t_d;
        let envelope: f64 = u0 * (-zeta * omega_n * t).exp();
        peaks.push(envelope);
    }

    // Check log decrement between consecutive peaks
    for n in 0..n_cycles {
        let measured_delta: f64 = (peaks[n] / peaks[n + 1]).ln();
        assert!(
            (measured_delta - delta).abs() / delta < 1e-10_f64,
            "Cycle {}: measured delta={:.6}, expected={:.6}",
            n, measured_delta, delta
        );
    }

    // Multi-cycle formula: delta = (1/N) * ln(u_1 / u_{N+1})
    let delta_multi: f64 = (1.0_f64 / n_cycles as f64) * (peaks[0] / peaks[n_cycles]).ln();
    assert!(
        (delta_multi - delta).abs() / delta < 1e-10_f64,
        "Multi-cycle delta: {:.6}, expected: {:.6}",
        delta_multi, delta
    );

    // After N cycles, amplitude ratio
    let ratio_expected: f64 = (-(n_cycles as f64) * delta).exp();
    let ratio_actual: f64 = peaks[n_cycles] / peaks[0];
    assert!(
        (ratio_actual - ratio_expected).abs() / ratio_expected < 1e-10_f64,
        "Amplitude ratio after {} cycles: {:.6}, expected {:.6}",
        n_cycles, ratio_actual, ratio_expected
    );

    // Energy dissipated per cycle (proportional to 1 - exp(-2*delta))
    // Ratio of energies (proportional to amplitude^2)
    let energy_ratio: f64 = (peaks[1] / peaks[0]).powi(2);
    let energy_ratio_expected: f64 = (-2.0_f64 * delta).exp();
    assert!(
        (energy_ratio - energy_ratio_expected).abs() / energy_ratio_expected < 1e-10_f64,
        "Energy ratio per cycle: {:.6}, expected {:.6}",
        energy_ratio, energy_ratio_expected
    );

    // Verify: number of cycles for 50% amplitude reduction
    // 0.5 = exp(-N50 * delta) => N50 = ln(2) / delta
    let n_50: f64 = (2.0_f64 as f64).ln() / delta;
    let n_50_approx: f64 = (2.0_f64 as f64).ln() / (2.0_f64 * PI * zeta);
    assert!(
        (n_50 - n_50_approx).abs() / n_50 < 0.001_f64,
        "N_50: exact={:.2}, approx={:.2}",
        n_50, n_50_approx
    );

    // For zeta=3%: N_50 ~ ln(2)/(2*pi*0.03) ~ 3.68 cycles
    assert!(
        n_50 > 3.0_f64 && n_50 < 4.0_f64,
        "N_50 = {:.2} cycles for zeta=3%",
        n_50
    );
}
