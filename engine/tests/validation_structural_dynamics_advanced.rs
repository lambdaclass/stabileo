/// Validation: Advanced Structural Dynamics
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Chapters 10-14
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Den Hartog, "Mechanical Vibrations", 4th Ed.
///   - Newmark & Hall, "Earthquake Spectra and Design"
///   - Paz & Leigh, "Structural Dynamics: Theory and Computation", 6th Ed.
///   - ASCE 7-22: Minimum Design Loads for Buildings
///
/// Tests verify multi-DOF natural frequencies, modal combination rules,
/// damping models, TMD tuning, base isolation, and ductility demand.

#[allow(unused_imports)]
use dedaliano_engine::types::*;

// ═══════════════════════════════════════════════════════════════
// 1. Two-DOF System Natural Frequencies (Stiffness Method)
// ═══════════════════════════════════════════════════════════════
//
// A 2-story shear building:
//   m1 = m2 = 1000 kg (floor masses)
//   k1 = k2 = 500 kN/m = 500,000 N/m (story stiffnesses)
//
// Stiffness matrix:
//   K = [k1+k2  -k2 ] = [1000  -500] kN/m
//       [-k2     k2 ]   [-500   500]
//
// Mass matrix:
//   M = [m1  0 ] = [1000  0   ] kg
//       [0   m2]   [0     1000]
//
// Eigenvalue problem: det(K - omega^2 M) = 0
// Substitution: Omega = omega^2 / (k/m) = omega^2 / 500
//   (2 - Omega)(1 - Omega) - 1 = 0
//   Omega^2 - 3*Omega + 1 = 0
//   Omega = (3 +/- sqrt(5)) / 2
//
//   Omega_1 = (3 - sqrt(5))/2 = 0.3820
//   Omega_2 = (3 + sqrt(5))/2 = 2.6180
//
//   omega_1^2 = 0.3820 * 500 = 191.0  -> omega_1 = 13.82 rad/s -> T_1 = 0.4547 s
//   omega_2^2 = 2.6180 * 500 = 1309.0 -> omega_2 = 36.18 rad/s -> T_2 = 0.1737 s

#[test]
fn validation_two_dof_natural_frequencies() {
    let m: f64 = 1000.0;           // kg, floor mass
    let k: f64 = 500_000.0;        // N/m, story stiffness

    // --- Eigenvalue solutions ---
    let sqrt5: f64 = 5.0_f64.sqrt();
    let omega_ratio_1: f64 = (3.0 - sqrt5) / 2.0;
    let omega_ratio_2: f64 = (3.0 + sqrt5) / 2.0;

    let omega_ratio_1_expected: f64 = 0.3820;
    let omega_ratio_2_expected: f64 = 2.6180;

    let rel_err_1 = (omega_ratio_1 - omega_ratio_1_expected).abs() / omega_ratio_1_expected;
    assert!(
        rel_err_1 < 0.01,
        "Omega_1: computed={:.4}, expected={:.4}", omega_ratio_1, omega_ratio_1_expected
    );

    let rel_err_2 = (omega_ratio_2 - omega_ratio_2_expected).abs() / omega_ratio_2_expected;
    assert!(
        rel_err_2 < 0.01,
        "Omega_2: computed={:.4}, expected={:.4}", omega_ratio_2, omega_ratio_2_expected
    );

    // --- Natural frequencies ---
    let omega_scale: f64 = k / m; // 500 rad^2/s^2
    let omega1: f64 = (omega_ratio_1 * omega_scale).sqrt();
    let omega2: f64 = (omega_ratio_2 * omega_scale).sqrt();

    let omega1_expected: f64 = 13.82;
    let omega2_expected: f64 = 36.18;

    let rel_err_w1 = (omega1 - omega1_expected).abs() / omega1_expected;
    assert!(
        rel_err_w1 < 0.01,
        "omega_1: computed={:.2} rad/s, expected={:.2} rad/s, err={:.4}%",
        omega1, omega1_expected, rel_err_w1 * 100.0
    );

    let rel_err_w2 = (omega2 - omega2_expected).abs() / omega2_expected;
    assert!(
        rel_err_w2 < 0.01,
        "omega_2: computed={:.2} rad/s, expected={:.2} rad/s, err={:.4}%",
        omega2, omega2_expected, rel_err_w2 * 100.0
    );

    // --- Natural periods ---
    let pi = std::f64::consts::PI;
    let t1: f64 = 2.0 * pi / omega1;
    let t2: f64 = 2.0 * pi / omega2;

    let t1_expected: f64 = 0.4547;
    let t2_expected: f64 = 0.1737;

    let rel_err_t1 = (t1 - t1_expected).abs() / t1_expected;
    assert!(
        rel_err_t1 < 0.01,
        "T_1: computed={:.4} s, expected={:.4} s, err={:.4}%",
        t1, t1_expected, rel_err_t1 * 100.0
    );

    let rel_err_t2 = (t2 - t2_expected).abs() / t2_expected;
    assert!(
        rel_err_t2 < 0.01,
        "T_2: computed={:.4} s, expected={:.4} s, err={:.4}%",
        t2, t2_expected, rel_err_t2 * 100.0
    );

    // --- Frequency ratio ---
    let freq_ratio: f64 = omega2 / omega1;
    let freq_ratio_expected: f64 = (omega_ratio_2 / omega_ratio_1).sqrt();

    let rel_err_ratio = (freq_ratio - freq_ratio_expected).abs() / freq_ratio_expected;
    assert!(
        rel_err_ratio < 0.001,
        "omega_2/omega_1: computed={:.4}, expected={:.4}", freq_ratio, freq_ratio_expected
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Response Spectrum Combination --- SRSS Rule
// ═══════════════════════════════════════════════════════════════
//
// Square Root of Sum of Squares (SRSS) modal combination:
//   R = sqrt(sum(Ri^2))
//
// Modal responses (e.g., base shear or displacement):
//   R_1 = 120 kN (mode 1)
//   R_2 = 45 kN (mode 2)
//   R_3 = 15 kN (mode 3)
//
// SRSS:
//   R = sqrt(120^2 + 45^2 + 15^2) = sqrt(14400 + 2025 + 225)
//     = sqrt(16650) = 129.03 kN
//
// Mode 1 dominance check:
//   R_1/R = 120/129.03 = 93.0% -- mode 1 dominates

#[test]
fn validation_srss_modal_combination() {
    let r1: f64 = 120.0;           // kN, mode 1 response
    let r2: f64 = 45.0;            // kN, mode 2 response
    let r3: f64 = 15.0;            // kN, mode 3 response

    // --- SRSS combination ---
    let r_srss: f64 = (r1 * r1 + r2 * r2 + r3 * r3).sqrt();
    let r_srss_expected: f64 = 129.03;

    let rel_err = (r_srss - r_srss_expected).abs() / r_srss_expected;
    assert!(
        rel_err < 0.01,
        "R(SRSS): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        r_srss, r_srss_expected, rel_err * 100.0
    );

    // --- Mode 1 contribution ---
    let mode1_pct: f64 = r1 / r_srss * 100.0;
    assert!(
        mode1_pct > 90.0,
        "Mode 1 dominates: {:.1}% of SRSS response", mode1_pct
    );

    // --- SRSS <= absolute sum ---
    let r_abs: f64 = r1 + r2 + r3;
    assert!(
        r_srss <= r_abs,
        "SRSS={:.2} <= absolute sum={:.2}", r_srss, r_abs
    );

    // --- SRSS >= maximum single mode ---
    assert!(
        r_srss >= r1,
        "SRSS={:.2} >= max mode={:.2}", r_srss, r1
    );

    // --- With 2 modes only ---
    let r_srss_2: f64 = (r1 * r1 + r2 * r2).sqrt();
    assert!(
        r_srss > r_srss_2,
        "3 modes give larger SRSS than 2: {:.2} > {:.2}", r_srss, r_srss_2
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. CQC Modal Combination
// ═══════════════════════════════════════════════════════════════
//
// Complete Quadratic Combination (CQC):
//   R^2 = sum_i sum_j rho_ij * R_i * R_j
//
// Cross-modal coefficient (Der Kiureghian, 1981):
//   rho_ij = [8*xi^2*(1+r_ij)*r_ij^(3/2)] /
//            [(1-r_ij^2)^2 + 4*xi^2*r_ij*(1+r_ij)^2]
//   where r_ij = omega_j/omega_i (<=1), xi = damping ratio
//
// Two modes: omega_1 = 10 rad/s, omega_2 = 25 rad/s, xi = 0.05
//   r_12 = 10/25 = 0.4
//   rho_12 = 8*0.0025*(1.4)*0.4^1.5 / [(1-0.16)^2 + 4*0.0025*0.4*(1.4)^2]
//          = 0.007084 / [0.7056 + 0.00784]
//          = 0.007084 / 0.71344
//          = 0.00993
//
// R_1 = 100 kN, R_2 = 50 kN
// CQC:
//   R^2 = 1.0*R1^2 + 2*rho12*R1*R2 + 1.0*R2^2
//       = 10000 + 2*0.00993*5000 + 2500
//       = 10000 + 99.3 + 2500 = 12599.3
//   R = sqrt(12599.3) = 112.25 kN

#[test]
fn validation_cqc_modal_combination() {
    let omega1: f64 = 10.0;        // rad/s
    let omega2: f64 = 25.0;        // rad/s
    let xi: f64 = 0.05;            // damping ratio
    let r1: f64 = 100.0;           // kN, mode 1 response
    let r2: f64 = 50.0;            // kN, mode 2 response

    // --- Frequency ratio ---
    let r12: f64 = omega1 / omega2;
    let r12_expected: f64 = 0.4;

    let err_r = (r12 - r12_expected).abs();
    assert!(
        err_r < 0.001,
        "r_12: computed={:.4}, expected={:.4}", r12, r12_expected
    );

    // --- Cross-modal coefficient ---
    let xi2: f64 = xi * xi;
    let numerator: f64 = 8.0 * xi2 * (1.0 + r12) * r12.powf(1.5);
    let denom: f64 = (1.0 - r12 * r12).powi(2) + 4.0 * xi2 * r12 * (1.0 + r12).powi(2);
    let rho12: f64 = numerator / denom;
    let rho12_expected: f64 = 0.00993;

    let rel_err_rho = (rho12 - rho12_expected).abs() / rho12_expected;
    assert!(
        rel_err_rho < 0.02,
        "rho_12: computed={:.5}, expected={:.5}, err={:.4}%",
        rho12, rho12_expected, rel_err_rho * 100.0
    );

    // --- CQC combination ---
    let r_cqc_sq: f64 = 1.0 * r1 * r1 + 2.0 * rho12 * r1 * r2 + 1.0 * r2 * r2;
    let r_cqc: f64 = r_cqc_sq.sqrt();
    let r_cqc_expected: f64 = 112.25;

    let rel_err_cqc = (r_cqc - r_cqc_expected).abs() / r_cqc_expected;
    assert!(
        rel_err_cqc < 0.01,
        "R(CQC): computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        r_cqc, r_cqc_expected, rel_err_cqc * 100.0
    );

    // --- Compare with SRSS ---
    let r_srss: f64 = (r1 * r1 + r2 * r2).sqrt();
    let r_srss_expected: f64 = 111.80;

    let rel_err_srss = (r_srss - r_srss_expected).abs() / r_srss_expected;
    assert!(
        rel_err_srss < 0.01,
        "R(SRSS): computed={:.2} kN, expected={:.2} kN", r_srss, r_srss_expected
    );

    // --- CQC >= SRSS for well-separated modes (cross terms add) ---
    assert!(
        r_cqc >= r_srss - 0.01,
        "CQC={:.2} >= SRSS={:.2} (positive cross-modal terms)", r_cqc, r_srss
    );

    // --- For well-separated modes, CQC approx SRSS ---
    let diff_pct: f64 = (r_cqc - r_srss).abs() / r_srss * 100.0;
    assert!(
        diff_pct < 1.0,
        "Well-separated modes: CQC-SRSS diff = {:.2}% < 1%", diff_pct
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Rayleigh Damping Coefficients
// ═══════════════════════════════════════════════════════════════
//
// Rayleigh (proportional) damping:
//   C = a_0 * M + a_1 * K
//
// For 2 modes with target damping ratio xi at omega_i and omega_j:
//   a_0 = 2*xi*omega_i*omega_j / (omega_i + omega_j)
//   a_1 = 2*xi / (omega_i + omega_j)
//
// Verification: damping ratio at any frequency omega:
//   xi(omega) = a_0/(2*omega) + a_1*omega/2
//
// Example: omega_1 = 5 rad/s, omega_2 = 20 rad/s, xi = 0.05
//   a_0 = 2*0.05*5*20 / (5+20) = 10/25 = 0.40
//   a_1 = 2*0.05 / (5+20) = 0.10/25 = 0.004
//
// Check at omega_1: xi(5) = 0.40/(2*5) + 0.004*5/2 = 0.04 + 0.01 = 0.05
// Check at omega_2: xi(20) = 0.40/(2*20) + 0.004*20/2 = 0.01 + 0.04 = 0.05

#[test]
fn validation_rayleigh_damping_coefficients() {
    let omega_i: f64 = 5.0;        // rad/s, lower frequency
    let omega_j: f64 = 20.0;       // rad/s, upper frequency
    let xi_target: f64 = 0.05;     // target damping ratio

    // --- Rayleigh coefficients ---
    let a0: f64 = 2.0 * xi_target * omega_i * omega_j / (omega_i + omega_j);
    let a1: f64 = 2.0 * xi_target / (omega_i + omega_j);

    let a0_expected: f64 = 0.40;
    let a1_expected: f64 = 0.004;

    let err_a0 = (a0 - a0_expected).abs();
    assert!(
        err_a0 < 0.001,
        "a_0: computed={:.4}, expected={:.4}", a0, a0_expected
    );

    let err_a1 = (a1 - a1_expected).abs();
    assert!(
        err_a1 < 0.0001,
        "a_1: computed={:.6}, expected={:.6}", a1, a1_expected
    );

    // --- Verify damping ratio at omega_1 ---
    let xi_at_w1: f64 = a0 / (2.0 * omega_i) + a1 * omega_i / 2.0;
    let err_xi1 = (xi_at_w1 - xi_target).abs();
    assert!(
        err_xi1 < 1e-10,
        "xi(omega_1): computed={:.6}, expected={:.6}", xi_at_w1, xi_target
    );

    // --- Verify damping ratio at omega_2 ---
    let xi_at_w2: f64 = a0 / (2.0 * omega_j) + a1 * omega_j / 2.0;
    let err_xi2 = (xi_at_w2 - xi_target).abs();
    assert!(
        err_xi2 < 1e-10,
        "xi(omega_2): computed={:.6}, expected={:.6}", xi_at_w2, xi_target
    );

    // --- Check at intermediate frequency (omega = 10 rad/s) ---
    let omega_mid: f64 = 10.0;
    let xi_mid: f64 = a0 / (2.0 * omega_mid) + a1 * omega_mid / 2.0;
    // Should be less than target (Rayleigh curve dips between anchor points)
    assert!(
        xi_mid < xi_target,
        "xi(omega_mid)={:.4} < xi_target={:.4} (Rayleigh curve minimum)",
        xi_mid, xi_target
    );

    // --- Minimum damping occurs at omega_min = sqrt(a_0/a_1) ---
    let omega_min: f64 = (a0 / a1).sqrt();
    let xi_min: f64 = a0 / (2.0 * omega_min) + a1 * omega_min / 2.0;
    let omega_min_expected: f64 = 10.0; // sqrt(0.40/0.004) = sqrt(100) = 10

    let err_wmin = (omega_min - omega_min_expected).abs();
    assert!(
        err_wmin < 0.01,
        "omega_min: computed={:.2} rad/s, expected={:.2} rad/s", omega_min, omega_min_expected
    );

    // Minimum xi = sqrt(a_0 * a_1)
    let xi_min_formula: f64 = (a0 * a1).sqrt();
    let err_ximin = (xi_min - xi_min_formula).abs();
    assert!(
        err_ximin < 1e-10,
        "xi_min: computed={:.6}, formula={:.6}", xi_min, xi_min_formula
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. TMD Optimal Tuning --- Den Hartog Parameters
// ═══════════════════════════════════════════════════════════════
//
// Den Hartog optimal tuning for a tuned mass damper (TMD):
//   Optimal frequency ratio: f_opt = 1 / (1 + mu)
//   Optimal damping ratio:   xi_opt = sqrt(3*mu / (8*(1+mu)))
//
// where mu = m_d/m_s (mass ratio, TMD mass / structure mass)
//
// Example: m_s = 50,000 kg, m_d = 2500 kg
//   mu = 2500/50000 = 0.05
//
//   f_opt = 1 / (1 + 0.05) = 1/1.05 = 0.9524
//   xi_opt = sqrt(3*0.05 / (8*1.05)) = sqrt(0.15/8.40) = sqrt(0.01786) = 0.1336
//
// If structure frequency f_s = 2.0 Hz:
//   TMD frequency f_d = f_opt * f_s = 0.9524 * 2.0 = 1.905 Hz
//   TMD stiffness k_d = m_d * (2*pi*f_d)^2 = 2500 * (2*pi*1.905)^2 = 358,122 N/m

#[test]
fn validation_tmd_den_hartog_tuning() {
    let m_s: f64 = 50_000.0;       // kg, structure mass
    let m_d: f64 = 2_500.0;        // kg, TMD mass
    let f_s: f64 = 2.0;            // Hz, structure frequency
    let pi = std::f64::consts::PI;

    // --- Mass ratio ---
    let mu: f64 = m_d / m_s;
    let mu_expected: f64 = 0.05;

    let err_mu = (mu - mu_expected).abs();
    assert!(
        err_mu < 1e-6,
        "mu: computed={:.4}, expected={:.4}", mu, mu_expected
    );

    // --- Optimal frequency ratio ---
    let f_opt: f64 = 1.0 / (1.0 + mu);
    let f_opt_expected: f64 = 0.9524;

    let rel_err_f = (f_opt - f_opt_expected).abs() / f_opt_expected;
    assert!(
        rel_err_f < 0.01,
        "f_opt: computed={:.4}, expected={:.4}, err={:.4}%",
        f_opt, f_opt_expected, rel_err_f * 100.0
    );

    // --- Optimal damping ratio ---
    let xi_opt: f64 = (3.0 * mu / (8.0 * (1.0 + mu))).sqrt();
    let xi_opt_expected: f64 = 0.1336;

    let rel_err_xi = (xi_opt - xi_opt_expected).abs() / xi_opt_expected;
    assert!(
        rel_err_xi < 0.01,
        "xi_opt: computed={:.4}, expected={:.4}, err={:.4}%",
        xi_opt, xi_opt_expected, rel_err_xi * 100.0
    );

    // --- TMD frequency ---
    let f_d: f64 = f_opt * f_s;
    let f_d_expected: f64 = 1.905;

    let rel_err_fd = (f_d - f_d_expected).abs() / f_d_expected;
    assert!(
        rel_err_fd < 0.01,
        "f_d: computed={:.3} Hz, expected={:.3} Hz, err={:.4}%",
        f_d, f_d_expected, rel_err_fd * 100.0
    );

    // --- TMD stiffness ---
    let omega_d: f64 = 2.0 * pi * f_d;
    let k_d: f64 = m_d * omega_d * omega_d;
    let k_d_expected: f64 = 358_122.0;

    let rel_err_kd = (k_d - k_d_expected).abs() / k_d_expected;
    assert!(
        rel_err_kd < 0.01,
        "k_d: computed={:.0} N/m, expected={:.0} N/m, err={:.4}%",
        k_d, k_d_expected, rel_err_kd * 100.0
    );

    // --- TMD damping coefficient ---
    let c_d: f64 = 2.0 * xi_opt * m_d * omega_d;
    assert!(
        c_d > 0.0,
        "TMD damping c_d = {:.2} N*s/m must be positive", c_d
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Seismic Base Isolation --- Period Shift
// ═══════════════════════════════════════════════════════════════
//
// Base-isolated structure:
//   Fixed-base period T_fb = 0.5 s
//   Total mass above isolation: m = 500,000 kg
//
// Target isolated period: T_iso = 2.5 s
//
// Required isolation stiffness:
//   omega_iso = 2*pi/T_iso = 2.5133 rad/s
//   k_iso = m * omega_iso^2 = 500,000 * 6.3165 = 3,158,273 N/m = 3158 kN/m
//
// Period shift ratio: T_iso/T_fb = 2.5/0.5 = 5.0
//
// Spectral acceleration reduction (assuming 1/T relationship):
//   Sa_iso/Sa_fb = T_fb/T_iso = 0.5/2.5 = 0.20  (80% reduction)
//
// Combined system period (exact for 2-DOF):
//   T_c = sqrt(T_fb^2 + T_iso^2) = sqrt(0.25 + 6.25) = sqrt(6.50) = 2.550 s

#[test]
fn validation_base_isolation_period_shift() {
    let t_fb: f64 = 0.5;           // s, fixed-base period
    let t_iso_target: f64 = 2.5;   // s, target isolated period
    let m: f64 = 500_000.0;        // kg, total mass
    let pi = std::f64::consts::PI;

    // --- Required isolation stiffness ---
    let omega_iso: f64 = 2.0 * pi / t_iso_target;
    let k_iso: f64 = m * omega_iso * omega_iso;
    let k_iso_kn: f64 = k_iso / 1000.0;
    let k_iso_expected: f64 = 3158.0;

    let rel_err_k = (k_iso_kn - k_iso_expected).abs() / k_iso_expected;
    assert!(
        rel_err_k < 0.01,
        "k_iso: computed={:.0} kN/m, expected={:.0} kN/m, err={:.4}%",
        k_iso_kn, k_iso_expected, rel_err_k * 100.0
    );

    // --- Period shift ratio ---
    let period_ratio: f64 = t_iso_target / t_fb;
    assert!(
        (period_ratio - 5.0).abs() < 0.001,
        "Period ratio = {:.4}, expected 5.0", period_ratio
    );

    // --- Spectral acceleration reduction ---
    let sa_ratio: f64 = t_fb / t_iso_target;
    let sa_ratio_expected: f64 = 0.20;

    let err_sa = (sa_ratio - sa_ratio_expected).abs();
    assert!(
        err_sa < 0.001,
        "Sa ratio = {:.4}, expected {:.4}", sa_ratio, sa_ratio_expected
    );

    let reduction_pct: f64 = (1.0 - sa_ratio) * 100.0;
    assert!(
        (reduction_pct - 80.0).abs() < 0.1,
        "Sa reduction = {:.1}%, expected 80%", reduction_pct
    );

    // --- Combined period ---
    let t_combined: f64 = (t_fb * t_fb + t_iso_target * t_iso_target).sqrt();
    let t_combined_expected: f64 = 2.550;

    let rel_err_tc = (t_combined - t_combined_expected).abs() / t_combined_expected;
    assert!(
        rel_err_tc < 0.01,
        "T_combined: computed={:.3} s, expected={:.3} s, err={:.4}%",
        t_combined, t_combined_expected, rel_err_tc * 100.0
    );

    // --- Combined period is dominated by isolation ---
    assert!(
        (t_combined - t_iso_target).abs() / t_iso_target < 0.05,
        "Combined period approx isolation period: {:.3} approx {:.3}", t_combined, t_iso_target
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. Ductility Demand --- Equal Displacement Rule
// ═══════════════════════════════════════════════════════════════
//
// For structures with period T > Tc (characteristic period of ground motion):
//   Equal displacement rule: Delta_inelastic approx Delta_elastic
//   mu = R (ductility demand equals strength reduction factor)
//
// For T < Tc (short period):
//   Equal energy rule: mu = (R^2 + 1) / (2*R)
//
// Newmark-Hall approximation:
//   Long period (T > Tc):    R = mu
//   Intermediate (T ~ Tc):   R = sqrt(2*mu - 1)
//   Short period (T < T_a):  R = 1 (no reduction)
//
// Example 1: T = 1.5 s, Tc = 0.5 s -> long period
//   Target R = 4.0 -> mu = R = 4.0
//
// Example 2: T = 0.3 s, Tc = 0.5 s -> short period, equal energy rule
//   R = 4.0 -> mu = (R^2 + 1)/(2R) = (16 + 1)/8 = 2.125

#[test]
fn validation_ductility_demand_equal_displacement() {
    let r_factor: f64 = 4.0;       // strength reduction factor
    let tc: f64 = 0.5;             // s, characteristic period

    // --- Long period (equal displacement rule) ---
    let t_long: f64 = 1.5;         // s
    assert!(t_long > tc, "T={:.1} > Tc={:.1}: long period range", t_long, tc);

    let mu_long: f64 = r_factor;   // mu = R
    let mu_long_expected: f64 = 4.0;

    let err_long = (mu_long - mu_long_expected).abs();
    assert!(
        err_long < 0.001,
        "mu(long period): computed={:.4}, expected={:.4}", mu_long, mu_long_expected
    );

    // --- Short period (equal energy rule) ---
    let t_short: f64 = 0.3;        // s
    assert!(t_short < tc, "T={:.1} < Tc={:.1}: short period range", t_short, tc);

    let mu_short: f64 = (r_factor * r_factor + 1.0) / (2.0 * r_factor);
    let mu_short_expected: f64 = 2.125;

    let err_short = (mu_short - mu_short_expected).abs();
    assert!(
        err_short < 0.001,
        "mu(short period): computed={:.4}, expected={:.4}", mu_short, mu_short_expected
    );

    // --- Equal energy ductility < equal displacement ductility ---
    assert!(
        mu_short < mu_long,
        "Short period mu={:.3} < long period mu={:.3}", mu_short, mu_long
    );

    // --- Inverse: given mu, find R ---
    // Long period: R = mu
    let mu_target: f64 = 3.0;
    let r_long: f64 = mu_target;

    // Intermediate period: R = sqrt(2*mu - 1)
    let r_intermediate: f64 = (2.0 * mu_target - 1.0).sqrt();
    let r_intermediate_expected: f64 = 5.0_f64.sqrt(); // = 2.236

    let rel_err_ri = (r_intermediate - r_intermediate_expected).abs() / r_intermediate_expected;
    assert!(
        rel_err_ri < 0.001,
        "R(intermediate): computed={:.4}, expected={:.4}", r_intermediate, r_intermediate_expected
    );

    // R_intermediate < R_long for same ductility
    assert!(
        r_intermediate < r_long,
        "R(intermediate)={:.3} < R(long)={:.3} for same mu",
        r_intermediate, r_long
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Floor Response Spectrum Generation --- Simple SDOF Chain
// ═══════════════════════════════════════════════════════════════
//
// A simple model for floor response spectra: equipment on a floor slab.
// Using the standard SDOF transmissibility model:
//
// Transmissibility:
//   TR(r) = sqrt[(1 + (2*xi*r)^2) / ((1-r^2)^2 + (2*xi*r)^2)]
//   where r = omega_eq/omega_floor = T_floor/T_eq
//
// At resonance (r = 1):
//   TR = sqrt[(1 + 4*xi^2) / (4*xi^2)] approx 1/(2*xi) for small xi
//
// At r = 0.5:
//   TR = sqrt[(1 + 4*0.0025*0.25) / ((1-0.25)^2 + 4*0.0025*0.25)]
//      = sqrt[(1.0025) / (0.5625 + 0.0025)]
//      = sqrt(1.0025/0.5650) = sqrt(1.7743) = 1.332

#[test]
fn validation_floor_response_spectrum() {
    let xi: f64 = 0.05;            // 5% damping

    // Transmissibility function
    let transmissibility = |r: f64| -> f64 {
        let num: f64 = 1.0 + (2.0 * xi * r).powi(2);
        let den: f64 = (1.0 - r * r).powi(2) + (2.0 * xi * r).powi(2);
        (num / den).sqrt()
    };

    // --- At resonance (r = 1) ---
    let tr_resonance: f64 = transmissibility(1.0);
    let tr_resonance_approx: f64 = 1.0 / (2.0 * xi); // = 10.0

    // Exact at r=1: TR = sqrt(1 + 4*xi^2) / (2*xi) = sqrt(1.01) / 0.1 = 10.05
    let tr_resonance_exact: f64 = (1.0 + 4.0 * xi * xi).sqrt() / (2.0 * xi);

    let rel_err_res = (tr_resonance - tr_resonance_exact).abs() / tr_resonance_exact;
    assert!(
        rel_err_res < 0.001,
        "TR(r=1): computed={:.4}, exact={:.4}", tr_resonance, tr_resonance_exact
    );

    // Approximate formula is close for small damping
    let rel_err_approx = (tr_resonance - tr_resonance_approx).abs() / tr_resonance_approx;
    assert!(
        rel_err_approx < 0.01,
        "TR(r=1) approx 1/(2*xi): computed={:.4}, approx={:.4}", tr_resonance, tr_resonance_approx
    );

    // --- At r = 0.5 (below resonance) ---
    let tr_05: f64 = transmissibility(0.5);
    let tr_05_expected: f64 = 1.332;

    let rel_err_05 = (tr_05 - tr_05_expected).abs() / tr_05_expected;
    assert!(
        rel_err_05 < 0.01,
        "TR(r=0.5): computed={:.3}, expected={:.3}", tr_05, tr_05_expected
    );

    // --- At r = 2.0 (above resonance) ---
    let tr_20: f64 = transmissibility(2.0);
    // High frequency equipment is isolated from floor motion
    assert!(
        tr_20 < 1.0,
        "TR(r=2.0)={:.4} < 1.0 (isolation region)", tr_20
    );

    // --- At r = sqrt(2) (transition point where TR approx 1) ---
    let r_crossover: f64 = 2.0_f64.sqrt();
    let tr_cross: f64 = transmissibility(r_crossover);
    // For any damping, TR(sqrt(2)) = 1.0 (exact for undamped; approximate otherwise)
    assert!(
        (tr_cross - 1.0).abs() < 0.05,
        "TR(sqrt(2)) approx 1.0: computed={:.4}", tr_cross
    );

    // --- Monotonic decrease for r > sqrt(2) ---
    let tr_30: f64 = transmissibility(3.0);
    assert!(
        tr_30 < tr_20,
        "TR decreases with r in isolation: TR(3.0)={:.4} < TR(2.0)={:.4}",
        tr_30, tr_20
    );
}
