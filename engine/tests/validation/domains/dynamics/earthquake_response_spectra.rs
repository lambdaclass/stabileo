/// Validation: Earthquake Response Spectra Calculations
///
/// References:
///   - Chopra, "Dynamics of Structures", 5th Ed., Chapters 3-6, 13
///   - ASCE 7-22, Chapter 12: Seismic Design Requirements
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed.
///   - Newmark & Hall, "Earthquake Spectra and Design", EERI, 1982
///   - Rosenblueth & Elorduy, CQC correlation coefficients, 1969
///   - Wilson, Der Kiureghian & Bayo, "CQC method", Earthquake Eng., 1981
///
/// Tests verify earthquake engineering response spectra formulas
/// without calling the solver. Pure arithmetic verification.

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
// 1. SDOF Response to Harmonic Excitation (Chopra Sec 3.2)
// ================================================================
//
// Equation of motion: m*u'' + c*u' + k*u = p0*sin(omega*t)
//
// Steady-state amplitude:
//   u_st = p0/k (static displacement)
//   Rd = 1/sqrt((1-beta^2)^2 + (2*xi*beta)^2)
//   where beta = omega/omega_n, xi = damping ratio
//   u_max = u_st * Rd
//
// At resonance (beta=1): Rd = 1/(2*xi)
// At beta=0 (static): Rd = 1.0
// At beta>>1 (high freq): Rd -> 0

#[test]
fn validation_sdof_harmonic_excitation() {
    let m: f64 = 1000.0;       // kg
    let k: f64 = 400_000.0;    // N/m (-> omega_n = 20 rad/s)
    let xi: f64 = 0.05;        // 5% damping
    let p0: f64 = 5000.0;      // N, amplitude

    let omega_n: f64 = (k / m).sqrt();
    assert_close(omega_n, 20.0, 0.001, "Natural frequency");

    let u_st: f64 = p0 / k;    // static displacement
    assert_close(u_st, 0.0125, 0.001, "Static displacement");

    // Dynamic amplification factor at various frequency ratios
    let rd = |beta: f64| -> f64 {
        1.0 / ((1.0 - beta * beta).powi(2) + (2.0 * xi * beta).powi(2)).sqrt()
    };

    // beta = 0 (static): Rd = 1.0
    assert_close(rd(0.0), 1.0, 0.001, "Rd at beta=0 (static)");

    // beta = 1 (resonance): Rd = 1/(2*xi) = 10.0
    let rd_resonance: f64 = rd(1.0);
    let expected_resonance: f64 = 1.0 / (2.0 * xi);
    assert_close(rd_resonance, expected_resonance, 0.001, "Rd at resonance");
    assert_close(rd_resonance, 10.0, 0.001, "Rd = 10 at resonance for xi=5%");

    // beta = 2 (high frequency): Rd < 1
    let rd_high: f64 = rd(2.0);
    assert!(rd_high < 1.0, "Rd < 1 for beta > sqrt(2)");

    // beta = 0.5: moderate amplification
    let rd_half: f64 = rd(0.5);
    let expected_half: f64 = 1.0 / ((1.0_f64 - 0.25).powi(2) + (2.0_f64 * 0.05 * 0.5).powi(2)).sqrt();
    assert_close(rd_half, expected_half, 0.001, "Rd at beta=0.5");

    // Maximum response at resonance
    let u_max_resonance: f64 = u_st * rd_resonance;
    assert_close(u_max_resonance, 0.125, 0.001, "u_max at resonance");
}

// ================================================================
// 2. Duhamel Integral for Impulse Response (Chopra Sec 4.2)
// ================================================================
//
// Unit impulse response of undamped SDOF:
//   h(t) = (1/(m*omega_d)) * exp(-xi*omega_n*t) * sin(omega_d*t)
//   where omega_d = omega_n*sqrt(1-xi^2)
//
// For rectangular impulse of duration t_d and amplitude p0:
//   u_max = (p0/k) * 2*sin(pi*t_d/T_n)  [for t_d < T_n/2, undamped]
//
// Dynamic load factor DLF = u_max/u_st

#[test]
fn validation_duhamel_impulse_response() {
    let m: f64 = 500.0;        // kg
    let k: f64 = 50_000.0;     // N/m
    let xi: f64 = 0.02;        // 2% damping

    let omega_n: f64 = (k / m).sqrt();
    assert_close(omega_n, 10.0, 0.001, "omega_n = 10 rad/s");

    let omega_d: f64 = omega_n * (1.0 - xi * xi).sqrt();
    assert_close(omega_d, 10.0 * (1.0_f64 - 0.0004).sqrt(), 0.001, "Damped frequency");

    // Damped frequency is very close to undamped for small xi
    let freq_ratio: f64 = omega_d / omega_n;
    assert!(freq_ratio > 0.999, "omega_d ~ omega_n for small damping");

    let t_n: f64 = 2.0 * PI / omega_n;
    assert_close(t_n, 2.0 * PI / 10.0, 0.001, "Natural period");

    // Impulse response function at t = T_n/4 (quarter period)
    let t_eval: f64 = t_n / 4.0;
    let h_t: f64 = (1.0 / (m * omega_d))
        * (-xi * omega_n * t_eval).exp()
        * (omega_d * t_eval).sin();

    // At t = T/4, sin(omega_d*T/4) ~ sin(pi/2) ~ 1
    // h ~ 1/(m*omega_d) * exp(-xi*omega_n*T/4)
    let h_undamped: f64 = 1.0 / (m * omega_n); // undamped peak
    assert!(h_t < h_undamped, "Damped response < undamped peak");
    assert!(h_t > 0.9 * h_undamped, "Small damping: nearly undamped");

    // Rectangular pulse DLF (undamped approximation)
    // For t_d = T_n/2: DLF = 2*sin(pi*0.5) = 2.0
    let p0: f64 = 1000.0;
    let u_st: f64 = p0 / k;
    let t_d: f64 = t_n / 2.0;
    let dlf_half_period: f64 = 2.0 * (PI * t_d / t_n).sin();
    assert_close(dlf_half_period, 2.0, 0.001, "DLF at t_d = T/2");

    // For t_d = T_n/4: DLF = 2*sin(pi/4) = sqrt(2)
    let t_d_quarter: f64 = t_n / 4.0;
    let dlf_quarter: f64 = 2.0 * (PI * t_d_quarter / t_n).sin();
    assert_close(dlf_quarter, 2.0_f64.sqrt(), 0.01, "DLF at t_d = T/4");

    // Maximum displacement under half-period pulse
    let _u_max: f64 = u_st * dlf_half_period;
    assert_close(u_st * 2.0, 2.0 * p0 / k, 0.001, "u_max = 2*u_st at DLF=2");
}

// ================================================================
// 3. Response Spectrum Construction (Chopra Sec 6.6)
// ================================================================
//
// For a given ground motion, the pseudo-acceleration response spectrum
// value at period T is:
//   Sa(T) = omega_n^2 * Sd(T)
//   Sv(T) = omega_n * Sd(T)
//
// where Sd = peak displacement of SDOF with period T under the
// ground motion.
//
// Tripartite relationship: Sa / omega_n = Sv = omega_n * Sd
//
// Test: verify these spectral relationships hold for synthetic values.

#[test]
fn validation_response_spectrum_relationships() {
    // Synthetic Sd values at different periods (representative of moderate quake)
    let periods: [f64; 5] = [0.1, 0.5, 1.0, 2.0, 4.0];
    let sd_values: [f64; 5] = [0.001, 0.015, 0.05, 0.10, 0.15]; // m

    for i in 0..5 {
        let t: f64 = periods[i];
        let sd: f64 = sd_values[i];
        let omega_n: f64 = 2.0 * PI / t;

        // Pseudo-velocity
        let sv: f64 = omega_n * sd;

        // Pseudo-acceleration
        let sa: f64 = omega_n * omega_n * sd;

        // Tripartite check: Sa = omega_n * Sv = omega_n^2 * Sd
        assert_close(sa, omega_n * sv, 1e-10, &format!("Sa = wn*Sv at T={}", t));
        assert_close(sv, omega_n * sd, 1e-10, &format!("Sv = wn*Sd at T={}", t));

        // Sa has units of acceleration (m/s^2)
        assert!(sa > 0.0, "Sa must be positive");

        // At short periods, Sa should be large (structures are stiff)
        // At long periods, Sd dominates
    }

    // Verify Sa decreases at long periods (typical spectrum shape after peak)
    let omega_1: f64 = 2.0 * PI / 1.0;
    let omega_4: f64 = 2.0 * PI / 4.0;
    let sa_1: f64 = omega_1 * omega_1 * 0.05;
    let sa_4: f64 = omega_4 * omega_4 * 0.15;
    assert!(
        sa_1 > sa_4,
        "Sa decreases at longer periods: Sa(1s)={:.2} > Sa(4s)={:.2}",
        sa_1, sa_4
    );

    // Verify Sd increases monotonically with period (typical behavior)
    for i in 1..5 {
        assert!(
            sd_values[i] > sd_values[i - 1],
            "Sd increases with period"
        );
    }
}

// ================================================================
// 4. SRSS Modal Combination Rule (Chopra Sec 13.1)
// ================================================================
//
// Square-Root-of-Sum-of-Squares (SRSS) for N modes:
//   R_total = sqrt( sum(R_i^2) )
//
// where R_i = peak response in mode i.
//
// SRSS is accurate when modal frequencies are well-separated
// (frequency ratios > 1.5).
//
// Example: 3-mode system with modal responses:
//   R1 = 100 kN, R2 = 50 kN, R3 = 25 kN

#[test]
fn validation_srss_combination_rule() {
    let r1: f64 = 100.0;
    let r2: f64 = 50.0;
    let r3: f64 = 25.0;

    // SRSS combination
    let r_srss: f64 = (r1 * r1 + r2 * r2 + r3 * r3).sqrt();
    let expected: f64 = (10000.0_f64 + 2500.0 + 625.0).sqrt();
    assert_close(r_srss, expected, 1e-10, "SRSS 3-mode");
    assert_close(r_srss, 13125.0_f64.sqrt(), 1e-10, "SRSS = sqrt(13125)");

    // SRSS is always >= max individual response
    assert!(r_srss >= r1, "SRSS >= R1");
    assert!(r_srss >= r2, "SRSS >= R2");
    assert!(r_srss >= r3, "SRSS >= R3");

    // SRSS <= absolute sum
    let r_abs: f64 = r1 + r2 + r3;
    assert!(r_srss <= r_abs, "SRSS <= absolute sum");

    // Ratio to first mode response (dominant mode)
    let ratio: f64 = r_srss / r1;
    assert_close(ratio, (1.0_f64 + 0.25 + 0.0625).sqrt(), 0.001, "SRSS/R1 ratio");

    // If modes are equal, SRSS = R * sqrt(N)
    let r_equal: f64 = 80.0;
    let n_modes: f64 = 4.0;
    let srss_equal: f64 = (n_modes * r_equal * r_equal).sqrt();
    assert_close(srss_equal, r_equal * n_modes.sqrt(), 1e-10, "Equal modes: SRSS = R*sqrt(N)");

    // For single mode, SRSS = R
    let srss_single: f64 = (r1 * r1).sqrt();
    assert_close(srss_single, r1, 1e-10, "Single mode SRSS = R");

    // Adding a small mode barely changes result
    let r_small: f64 = 1.0;
    let srss_with_small: f64 = (r1 * r1 + r_small * r_small).sqrt();
    let increase: f64 = (srss_with_small - r1) / r1;
    assert!(increase < 0.001, "Small mode adds < 0.1% to SRSS");
}

// ================================================================
// 5. CQC Combination with Correlation Coefficients (Wilson et al.)
// ================================================================
//
// Complete Quadratic Combination:
//   R_cqc = sqrt( sum_i sum_j rho_ij * R_i * R_j )
//
// where the correlation coefficient (Der Kiureghian, 1981):
//   rho_ij = 8*xi^2*(1+r)*r^(3/2) / ((1-r^2)^2 + 4*xi^2*r*(1+r)^2)
//   r = omega_i / omega_j (frequency ratio, r <= 1)
//
// When modes are well-separated (r << 1): rho_ij -> 0, CQC -> SRSS
// When modes are identical (r = 1): rho_ij = 1

#[test]
fn validation_cqc_correlation_coefficients() {
    let xi: f64 = 0.05; // 5% damping

    // Correlation coefficient formula
    let rho = |r: f64, zeta: f64| -> f64 {
        8.0 * zeta * zeta * (1.0 + r) * r.powf(1.5)
            / ((1.0 - r * r).powi(2) + 4.0 * zeta * zeta * r * (1.0 + r).powi(2))
    };

    // Equal frequencies (r=1): rho = 1.0
    assert_close(rho(1.0, xi), 1.0, 0.001, "rho at r=1");

    // Well-separated modes (r=0.5): rho should be small
    let rho_05: f64 = rho(0.5, xi);
    assert!(rho_05 < 0.1, "rho(0.5) = {:.4} should be small", rho_05);

    // Very close modes (r=0.95): rho should be large
    let rho_095: f64 = rho(0.95, xi);
    assert!(rho_095 > 0.5, "rho(0.95) = {:.4} should be large", rho_095);

    // CQC with 2 well-separated modes reduces to SRSS
    let r1: f64 = 80.0;
    let r2: f64 = 40.0;
    let rho_separated: f64 = rho(0.3, xi); // well separated
    let cqc_2: f64 = (r1 * r1 + 2.0 * rho_separated * r1 * r2 + r2 * r2).sqrt();
    let srss_2: f64 = (r1 * r1 + r2 * r2).sqrt();
    let diff: f64 = (cqc_2 - srss_2).abs() / srss_2;
    assert!(diff < 0.05, "CQC ~ SRSS for well-separated modes: diff={:.2}%", diff * 100.0);

    // CQC with identical modes: R_cqc = R1 + R2 (absolute sum)
    let cqc_identical: f64 = (r1 * r1 + 2.0 * 1.0 * r1 * r2 + r2 * r2).sqrt();
    assert_close(cqc_identical, r1 + r2, 0.001, "CQC with identical modes = abs sum");

    // Monotonicity: higher damping -> higher correlation
    let rho_xi2: f64 = rho(0.7, 0.02);
    let rho_xi10: f64 = rho(0.7, 0.10);
    assert!(rho_xi10 > rho_xi2, "Higher damping -> higher correlation");
}

// ================================================================
// 6. Equivalent Lateral Force Distribution per ASCE 7 (Sec 12.8)
// ================================================================
//
// Base shear: V = Cs * W
//   Cs = SDS / (R/Ie) but Cs >= 0.044*SDS*Ie and Cs >= 0.01
//   Also Cs <= SD1 / (T*(R/Ie)) for T <= TL
//
// Vertical distribution:
//   Fx = Cvx * V
//   Cvx = wx*hx^k / sum(wi*hi^k)
//   k = 1.0 for T <= 0.5s, k = 2.0 for T >= 2.5s, interpolate between

#[test]
fn validation_equivalent_lateral_force() {
    // Design parameters
    let sds: f64 = 1.0;        // g (design short-period spectral acceleration)
    let sd1: f64 = 0.5;        // g (design 1-sec spectral acceleration)
    let r_factor: f64 = 8.0;   // special moment frame
    let ie: f64 = 1.0;         // importance factor
    let t: f64 = 1.2;          // fundamental period (s)
    let _tl: f64 = 8.0;        // long-period transition period (s)

    // Seismic response coefficient
    let cs_max: f64 = sds / (r_factor / ie);
    assert_close(cs_max, 0.125, 0.001, "Cs_max = SDS/(R/Ie)");

    let cs_t: f64 = sd1 / (t * (r_factor / ie));
    assert_close(cs_t, 0.5 / (1.2 * 8.0), 0.001, "Cs from SD1/T");

    let cs_min: f64 = (0.044 * sds * ie).max(0.01);
    assert_close(cs_min, 0.044, 0.001, "Cs_min = 0.044*SDS*Ie");

    let cs: f64 = cs_max.min(cs_t).max(cs_min);
    // cs_max = 0.125, cs_t = 0.05208, cs_min = 0.044
    // cs = min(0.125, 0.05208) = 0.05208, then max(0.05208, 0.044) = 0.05208
    assert_close(cs, cs_t, 0.001, "Governing Cs");

    // 4-story building: weights and heights
    let weights: [f64; 4] = [2000.0, 2000.0, 2000.0, 1500.0]; // kN
    let heights: [f64; 4] = [4.0, 8.0, 12.0, 16.0];             // m

    let w_total: f64 = weights.iter().sum();
    assert_close(w_total, 7500.0, 0.001, "Total seismic weight");

    // Base shear
    let v: f64 = cs * w_total;
    let expected_v: f64 = cs_t * 7500.0;
    assert_close(v, expected_v, 0.001, "Base shear V");

    // Distribution exponent k (T = 1.2s, interpolate between 1 and 2)
    let k: f64 = if t <= 0.5 {
        1.0
    } else if t >= 2.5 {
        2.0
    } else {
        1.0 + (t - 0.5) / 2.0
    };
    assert_close(k, 1.35, 0.001, "Distribution exponent k");

    // Vertical distribution factors
    let mut sum_wh_k: f64 = 0.0;
    for i in 0..4 {
        sum_wh_k += weights[i] * heights[i].powf(k);
    }

    let mut f_sum: f64 = 0.0;
    for i in 0..4 {
        let cvx: f64 = weights[i] * heights[i].powf(k) / sum_wh_k;
        let fx: f64 = cvx * v;
        f_sum += fx;
        assert!(cvx > 0.0 && cvx < 1.0, "Cvx in (0,1)");
    }

    // Sum of lateral forces = base shear
    assert_close(f_sum, v, 0.001, "Sum(Fx) = V");
}

// ================================================================
// 7. Inelastic Response Modification (R Factor) (ASCE 7 Table 12.2-1)
// ================================================================
//
// The design base shear is reduced by the response modification
// coefficient R to account for ductility and overstrength:
//   V_design = V_elastic / R
//
// The total system overstrength factor:
//   Omega_0 = V_yield / V_design
//
// The ductility demand:
//   mu = delta_max / delta_y
//
// Newmark-Hall equal displacement rule (T > ~0.5s):
//   R_mu ~ mu (ductility reduction factor)
//
// Equal energy rule (short period T < ~0.2s):
//   R_mu = sqrt(2*mu - 1)

#[test]
fn validation_inelastic_response_modification() {
    // Elastic base shear for a structure
    let v_elastic: f64 = 5000.0;  // kN

    // Response modification factors (ASCE 7 Table 12.2-1)
    let r_smf: f64 = 8.0;      // special moment frame
    let r_imf: f64 = 5.0;      // intermediate moment frame
    let r_omf: f64 = 3.5;      // ordinary moment frame
    let r_braced: f64 = 6.0;   // special concentrically braced frame

    // Design base shears
    let v_smf: f64 = v_elastic / r_smf;
    let v_imf: f64 = v_elastic / r_imf;
    let v_omf: f64 = v_elastic / r_omf;
    let _v_braced: f64 = v_elastic / r_braced;

    assert_close(v_smf, 625.0, 0.001, "V_design for SMF");
    assert_close(v_imf, 1000.0, 0.001, "V_design for IMF");
    assert_close(v_omf, 5000.0 / 3.5, 0.001, "V_design for OMF");

    // Higher R -> lower design forces (more ductile system)
    assert!(v_smf < v_imf, "SMF < IMF design shear");
    assert!(v_imf < v_omf, "IMF < OMF design shear");

    // Newmark-Hall equal displacement rule (long period)
    let mu: f64 = 6.0; // ductility demand
    let r_mu_long: f64 = mu;
    assert_close(r_mu_long, 6.0, 0.001, "Equal displacement: R_mu = mu");

    // Equal energy rule (short period)
    let r_mu_short: f64 = (2.0 * mu - 1.0).sqrt();
    assert_close(r_mu_short, 11.0_f64.sqrt(), 0.001, "Equal energy: R_mu = sqrt(2*mu-1)");

    // Equal energy always gives smaller R_mu than equal displacement for mu > 1
    assert!(
        r_mu_short < r_mu_long,
        "Equal energy R_mu ({:.2}) < equal displacement R_mu ({:.2})",
        r_mu_short, r_mu_long
    );

    // Overstrength factor Omega_0 (typical values: 2-3)
    let omega_0: f64 = 3.0; // SMF
    let v_yield: f64 = omega_0 * v_smf;
    assert_close(v_yield, 1875.0, 0.001, "V_yield = Omega_0 * V_design");

    // Deflection amplification: Cd = R for equal displacement rule
    let cd: f64 = 5.5; // ASCE 7 for SMF
    let delta_design: f64 = 0.02; // m, design level displacement
    let ie: f64 = 1.0;
    let delta_inelastic: f64 = cd * delta_design / ie;
    assert_close(delta_inelastic, 0.11, 0.001, "Amplified displacement");
}

// ================================================================
// 8. Vertical Distribution of Seismic Forces (ASCE 7 Sec 12.8.3)
// ================================================================
//
// For a multi-story building, the vertical force distribution:
//   Fx = Cvx * V
//   Cvx = wx * hx^k / sum(wi * hi^k)
//
// Test with a 5-story building to verify:
//   - Sum(Cvx) = 1.0
//   - Higher floors get more force
//   - Story shears decrease from bottom to top
//   - For k=1 (inverted triangle), distribution is linear in height

#[test]
fn validation_vertical_seismic_force_distribution() {
    // 5-story building with equal story weights and uniform story height
    let n_stories: usize = 5;
    let story_height: f64 = 3.5; // m
    let story_weight: f64 = 1200.0; // kN per floor
    let v_base: f64 = 600.0; // kN base shear

    // Heights to each floor level
    let mut heights: Vec<f64> = Vec::new();
    let mut weights: Vec<f64> = Vec::new();
    for i in 0..n_stories {
        heights.push((i as f64 + 1.0) * story_height);
        weights.push(story_weight);
    }

    // Case 1: k = 1 (T <= 0.5s, inverted triangular distribution)
    let k: f64 = 1.0;
    let mut sum_wh: f64 = 0.0;
    for i in 0..n_stories {
        sum_wh += weights[i] * heights[i].powf(k);
    }

    let mut cvx: Vec<f64> = Vec::new();
    let mut fx: Vec<f64> = Vec::new();
    for i in 0..n_stories {
        let cv: f64 = weights[i] * heights[i].powf(k) / sum_wh;
        cvx.push(cv);
        fx.push(cv * v_base);
    }

    // Sum of Cvx = 1.0
    let sum_cvx: f64 = cvx.iter().sum();
    assert_close(sum_cvx, 1.0, 1e-10, "Sum(Cvx) = 1.0");

    // Sum of lateral forces = base shear
    let sum_fx: f64 = fx.iter().sum();
    assert_close(sum_fx, v_base, 1e-10, "Sum(Fx) = V");

    // Higher floors get more force (for equal weights, Cvx proportional to height)
    for i in 1..n_stories {
        assert!(
            fx[i] > fx[i - 1],
            "F_{} ({:.1}) > F_{} ({:.1})",
            i + 1, fx[i], i, fx[i - 1]
        );
    }

    // For uniform weight and k=1: Cvx = hx / sum(hi) = (i+1) / sum(1..=5) = (i+1)/15
    for i in 0..n_stories {
        let expected_cv: f64 = (i as f64 + 1.0) / 15.0;
        assert_close(cvx[i], expected_cv, 0.001, &format!("Cvx[{}] for k=1", i));
    }

    // Story shears (cumulative from top)
    let mut story_shears: Vec<f64> = vec![0.0; n_stories];
    story_shears[n_stories - 1] = fx[n_stories - 1];
    for i in (0..n_stories - 1).rev() {
        story_shears[i] = story_shears[i + 1] + fx[i];
    }

    // Base shear at ground floor = total
    assert_close(story_shears[0], v_base, 1e-10, "Story shear at base = V");

    // Story shears increase downward
    for i in 1..n_stories {
        assert!(
            story_shears[i] < story_shears[i - 1],
            "Story shear at {} < story shear at {}",
            i + 1, i
        );
    }

    // Case 2: k = 2 (T >= 2.5s) concentrates more force at top
    let k2: f64 = 2.0;
    let mut sum_wh2: f64 = 0.0;
    for i in 0..n_stories {
        sum_wh2 += weights[i] * heights[i].powf(k2);
    }
    let cvx_top_k1: f64 = cvx[n_stories - 1];
    let cvx_top_k2: f64 = weights[n_stories - 1] * heights[n_stories - 1].powf(k2) / sum_wh2;
    assert!(
        cvx_top_k2 > cvx_top_k1,
        "k=2 concentrates more force at top: {:.3} > {:.3}",
        cvx_top_k2, cvx_top_k1
    );
}
