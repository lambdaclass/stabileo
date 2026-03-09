/// Validation: Structural Reliability Formulas
///
/// References:
///   - Nowak & Collins: "Reliability of Structures" 2nd ed., Ch. 3-8
///   - Melchers & Beck: "Structural Reliability Analysis and Prediction" 3rd ed.
///   - ASCE 7-22: "Minimum Design Loads and Associated Criteria"
///   - Ang & Tang: "Probability Concepts in Engineering" 2nd ed.
///   - Haldar & Mahadevan: "Probability, Reliability, and Statistical Methods" 2nd ed.
///   - AISC 360-16 Commentary, Ch. B
///   - Hasofer & Lind (1974): "An Exact and Invariant FORM"
///
/// Tests verify reliability and safety factor formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

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
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

/// Standard normal CDF approximation (Abramowitz & Stegun, 26.2.17)
/// Accurate to |epsilon| < 7.5e-8
fn phi_normal(x: f64) -> f64 {
    let a1: f64 = 0.254829592;
    let a2: f64 = -0.284496736;
    let a3: f64 = 1.421413741;
    let a4: f64 = -1.453152027;
    let a5: f64 = 1.061405429;
    let p: f64 = 0.3275911;

    let sign: f64 = if x < 0.0 { -1.0 } else { 1.0 };
    let x_abs: f64 = x.abs() / (2.0_f64).sqrt();
    let t: f64 = 1.0 / (1.0 + p * x_abs);
    let y: f64 = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x_abs * x_abs).exp();
    0.5 * (1.0 + sign * y)
}

// ================================================================
// 1. FORM Reliability Index: beta = (mu_R - mu_S) / sqrt(sigma_R^2 + sigma_S^2)
// ================================================================
//
// Independent normal R and S:
// mu_R = 300 kN, sigma_R = 30 kN
// mu_S = 150 kN, sigma_S = 25 kN
//
// beta = (300-150)/sqrt(900+625) = 150/sqrt(1525) = 150/39.051 = 3.841
// Pf = Phi(-beta)

#[test]
fn validation_form_reliability_index() {
    let mu_r: f64 = 300.0;
    let sigma_r: f64 = 30.0;
    let mu_s: f64 = 150.0;
    let sigma_s: f64 = 25.0;

    let beta: f64 = (mu_r - mu_s) / (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();
    let expected_beta: f64 = 150.0 / (1525.0_f64).sqrt();
    assert_close(beta, expected_beta, 0.001, "FORM beta");

    // beta should be between 3 and 5 (typical for structural members)
    assert!(beta > 3.0 && beta < 5.0, "Beta in typical structural range");

    // Probability of failure
    let pf: f64 = phi_normal(-beta);
    assert!(pf < 1e-3, "Pf < 0.001 for beta > 3");
    assert!(pf > 1e-6, "Pf > 1e-6 for beta < 5");

    // Safety margin: M = R - S, mu_M = mu_R - mu_S, sigma_M = sqrt(sigma_R^2 + sigma_S^2)
    let mu_m: f64 = mu_r - mu_s;
    let sigma_m: f64 = (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();
    assert_close(beta, mu_m / sigma_m, 1e-10, "Beta = mu_M / sigma_M");

    // Central safety factor
    let csf: f64 = mu_r / mu_s;
    assert_close(csf, 2.0, 0.001, "Central safety factor = 2.0");
}

// ================================================================
// 2. Monte Carlo: Analytical vs Closed-Form for R - S > 0
// ================================================================
//
// For independent normal R ~ N(200, 20^2) and S ~ N(100, 15^2):
//   beta = (200-100)/sqrt(400+225) = 100/25 = 4.0
//   Pf_exact = Phi(-4.0)
//
// Monte Carlo with N samples: CoV of Pf estimator = sqrt((1-Pf)/(N*Pf))

#[test]
fn validation_monte_carlo_estimation() {
    let mu_r: f64 = 200.0;
    let sigma_r: f64 = 20.0;
    let mu_s: f64 = 100.0;
    let sigma_s: f64 = 15.0;

    // Exact reliability index
    let beta: f64 = (mu_r - mu_s) / (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();
    assert_close(beta, 100.0 / 25.0, 0.001, "MC beta = 4.0");
    assert_close(beta, 4.0, 0.001, "MC beta exact");

    // Exact failure probability
    let pf_exact: f64 = phi_normal(-beta);
    assert!(pf_exact > 1e-6 && pf_exact < 1e-4, "Pf in expected range for beta=4");

    // Required samples for CoV < 0.1: N > (1-Pf)/(0.01*Pf)
    let cov_target: f64 = 0.10;
    let n_required: f64 = (1.0 - pf_exact) / (cov_target * cov_target * pf_exact);
    assert!(n_required > 1e6, "Need > 1M samples for CoV < 10% at beta=4");

    // CoV with N = 1e7 samples
    let n_samples: f64 = 1e7;
    let cov_mc: f64 = ((1.0 - pf_exact) / (n_samples * pf_exact)).sqrt();
    assert!(cov_mc < 0.10, "CoV < 10% with 10M samples");

    // Verify Phi(-beta) + Phi(beta) = 1
    let phi_pos: f64 = phi_normal(beta);
    let phi_neg: f64 = phi_normal(-beta);
    assert_close(phi_pos + phi_neg, 1.0, 0.001, "Phi symmetry");
}

// ================================================================
// 3. LRFD Load Combinations: phi*Rn >= sum(gamma_i * Q_i)
// ================================================================
//
// ASCE 7-22 Combo 2: 1.2D + 1.6L + 0.5S
// ASCE 7-22 Combo 4: 1.2D + 1.0W + L + 0.5S
//
// D = 50 kN, L = 80 kN, S = 20 kN, W = 40 kN
// Rn = 300 kN, phi = 0.9 (flexure)
//
// Combo 2: 1.2*50 + 1.6*80 + 0.5*20 = 60+128+10 = 198 kN
// Combo 4: 1.2*50 + 1.0*40 + 80 + 0.5*20 = 60+40+80+10 = 190 kN

#[test]
fn validation_lrfd_load_combinations() {
    let d: f64 = 50.0;
    let l: f64 = 80.0;
    let s: f64 = 20.0;
    let w: f64 = 40.0;
    let rn: f64 = 300.0;
    let phi: f64 = 0.9;

    // ASCE 7 Combo 2: 1.2D + 1.6L + 0.5S
    let combo2: f64 = 1.2 * d + 1.6 * l + 0.5 * s;
    assert_close(combo2, 198.0, 0.001, "LRFD Combo 2");

    // ASCE 7 Combo 4: 1.2D + 1.0W + L + 0.5S
    let combo4: f64 = 1.2 * d + 1.0 * w + l + 0.5 * s;
    assert_close(combo4, 190.0, 0.001, "LRFD Combo 4");

    // ASCE 7 Combo 5: 1.2D + 1.0E + L + 0.2S (E = seismic = 0 here)
    let combo5: f64 = 1.2 * d + 0.0 + l + 0.2 * s;
    assert_close(combo5, 144.0, 0.001, "LRFD Combo 5 no seismic");

    // Governing combo
    let governing: f64 = combo2.max(combo4).max(combo5);
    assert_close(governing, 198.0, 0.001, "Governing = Combo 2");

    // Design check: phi*Rn >= Pu
    let design_strength: f64 = phi * rn;
    assert_close(design_strength, 270.0, 0.001, "phi*Rn = 270 kN");
    assert!(design_strength >= governing, "Design check passes");

    // Demand/capacity ratio
    let dcr: f64 = governing / design_strength;
    assert!(dcr < 1.0, "DCR < 1.0 means adequate");
    assert_close(dcr, 198.0 / 270.0, 0.001, "DCR = 0.733");
}

// ================================================================
// 4. Hasofer-Lind: Beta for Linear Limit State with Correlated Normals
// ================================================================
//
// Limit state: g(X1, X2) = X1 - X2 = 0
// X1 ~ N(200, 30^2), X2 ~ N(100, 20^2), rho_12 = 0.3
//
// mu_g = 200 - 100 = 100
// sigma_g = sqrt(30^2 + 20^2 - 2*0.3*30*20) = sqrt(900+400-360) = sqrt(940) = 30.659
// beta = 100/30.659 = 3.262

#[test]
fn validation_hasofer_lind_correlated() {
    let mu1: f64 = 200.0;
    let sigma1: f64 = 30.0;
    let mu2: f64 = 100.0;
    let sigma2: f64 = 20.0;
    let rho: f64 = 0.3;

    // Mean and std of g = X1 - X2
    let mu_g: f64 = mu1 - mu2;
    let var_g: f64 = sigma1 * sigma1 + sigma2 * sigma2 - 2.0 * rho * sigma1 * sigma2;
    let sigma_g: f64 = var_g.sqrt();

    assert_close(mu_g, 100.0, 0.001, "HL mean of g");
    assert_close(var_g, 940.0, 0.001, "HL variance of g");
    assert_close(sigma_g, 940.0_f64.sqrt(), 0.001, "HL std of g");

    let beta: f64 = mu_g / sigma_g;
    assert_close(beta, 100.0 / 940.0_f64.sqrt(), 0.001, "Hasofer-Lind beta");

    // Compare with uncorrelated case
    let var_g_uncorr: f64 = sigma1 * sigma1 + sigma2 * sigma2;
    let beta_uncorr: f64 = mu_g / var_g_uncorr.sqrt();

    // Positive correlation reduces variance of difference -> higher beta
    assert!(beta > beta_uncorr, "Positive correlation increases beta for R-S");

    // With negative correlation, beta would decrease
    let rho_neg: f64 = -0.3;
    let var_g_neg: f64 = sigma1 * sigma1 + sigma2 * sigma2 - 2.0 * rho_neg * sigma1 * sigma2;
    let beta_neg: f64 = mu_g / var_g_neg.sqrt();
    assert!(beta_neg < beta_uncorr, "Negative correlation decreases beta for R-S");

    // Sensitivity: direction cosines
    let alpha1: f64 = sigma1 / sigma_g;
    let alpha2: f64 = -sigma2 / sigma_g;
    assert!(alpha1 > 0.0, "X1 contributes positively to reliability");
    assert!(alpha2 < 0.0, "X2 contributes negatively (it is a load)");
}

// ================================================================
// 5. System Reliability: Series and Parallel Bounds
// ================================================================
//
// Three components with Pf1=0.01, Pf2=0.02, Pf3=0.015
//
// Series system (weakest link): Pf_sys = 1 - prod(1 - Pf_i)
//   = 1 - 0.99*0.98*0.985 = 1 - 0.95555 = 0.04445
// Ditlevsen bounds for series: max(Pf_i) <= Pf_sys <= sum(Pf_i)
//
// Parallel system (redundant): Pf_sys = prod(Pf_i) (independent)
//   = 0.01 * 0.02 * 0.015 = 3.0e-6

#[test]
fn validation_system_reliability_bounds() {
    let pf1: f64 = 0.01;
    let pf2: f64 = 0.02;
    let pf3: f64 = 0.015;

    // Series system: all must survive
    let r1: f64 = 1.0 - pf1;
    let r2: f64 = 1.0 - pf2;
    let r3: f64 = 1.0 - pf3;
    let r_series: f64 = r1 * r2 * r3;
    let pf_series: f64 = 1.0 - r_series;

    let expected_r: f64 = 0.99 * 0.98 * 0.985;
    assert_close(r_series, expected_r, 0.001, "Series system reliability");
    assert_close(pf_series, 1.0 - expected_r, 0.01, "Series system Pf");

    // Series bounds (independent): max(Pf_i) <= Pf_sys <= sum(Pf_i)
    let max_pf: f64 = pf1.max(pf2).max(pf3);
    let sum_pf: f64 = pf1 + pf2 + pf3;
    assert!(pf_series >= max_pf - 1e-10, "Series lower bound");
    assert!(pf_series <= sum_pf + 1e-10, "Series upper bound");

    // Parallel system (all must fail): Pf = prod(Pf_i)
    let pf_parallel: f64 = pf1 * pf2 * pf3;
    assert_close(pf_parallel, 3.0e-6, 0.001, "Parallel system Pf");

    // Parallel is much more reliable than series
    assert!(pf_parallel < pf_series * 0.001, "Parallel >> series reliability");

    // System reliability ratio
    let ratio: f64 = pf_series / pf_parallel;
    assert!(ratio > 1000.0, "Series/parallel Pf ratio > 1000");
}

// ================================================================
// 6. Fatigue Reliability: Miner's Rule
// ================================================================
//
// Miner's cumulative damage: D = sum(ni/Ni) where failure at D >= 1.0
//
// S-N curve: N = A / S^m with A = 1e12, m = 3 (steel detail)
//
// Loading blocks:
//   S1 = 100 MPa, n1 = 50000 cycles -> N1 = 1e12/1e6 = 1e6
//   S2 = 80 MPa,  n2 = 200000        -> N2 = 1e12/512000 = 1.953e6
//   S3 = 60 MPa,  n3 = 500000        -> N3 = 1e12/216000 = 4.630e6

#[test]
fn validation_fatigue_miner_rule() {
    let a_sn: f64 = 1e12;
    let m: f64 = 3.0;

    // Stress range and cycle counts
    let s1: f64 = 100.0;
    let n1: f64 = 50_000.0;
    let s2: f64 = 80.0;
    let n2: f64 = 200_000.0;
    let s3: f64 = 60.0;
    let n3: f64 = 500_000.0;

    // Cycles to failure at each stress level
    let big_n1: f64 = a_sn / s1.powf(m);
    let big_n2: f64 = a_sn / s2.powf(m);
    let big_n3: f64 = a_sn / s3.powf(m);

    assert_close(big_n1, 1e6, 0.001, "N1 at 100 MPa");
    assert_close(big_n2, 1e12 / 512_000.0, 0.001, "N2 at 80 MPa");
    assert_close(big_n3, 1e12 / 216_000.0, 0.001, "N3 at 60 MPa");

    // Miner's damage
    let d1: f64 = n1 / big_n1;
    let d2: f64 = n2 / big_n2;
    let d3: f64 = n3 / big_n3;
    let d_total: f64 = d1 + d2 + d3;

    assert_close(d1, 0.05, 0.001, "Damage from block 1");
    assert_close(d2, 200_000.0 * 512_000.0 / 1e12, 0.01, "Damage from block 2");
    assert_close(d3, 500_000.0 * 216_000.0 / 1e12, 0.01, "Damage from block 3");

    // Total damage < 1 means no fatigue failure
    assert!(d_total < 1.0, "No fatigue failure (D < 1)");

    // Remaining life fraction
    let remaining: f64 = 1.0 - d_total;
    assert!(remaining > 0.0 && remaining < 1.0, "Remaining life fraction valid");

    // If we repeat the same loading, how many repetitions until failure?
    let reps_to_fail: f64 = 1.0 / d_total;
    assert!(reps_to_fail > 1.0, "More than one repetition possible");
}

// ================================================================
// 7. Target Reliability: ASCE 7 Risk Categories
// ================================================================
//
// ASCE 7-22 Table 1.3-1 target reliabilities:
//   Risk Category II: beta_target = 3.0 (50-year)
//   Risk Category III: beta_target = 3.5
//   Risk Category IV: beta_target = 3.75
//
// Annual Pf = 1 - (1 - Pf_T)^(1/T) where T = reference period (50 years)

#[test]
fn validation_target_reliability() {
    // Target betas for different risk categories
    let beta_ii: f64 = 3.0;
    let beta_iii: f64 = 3.5;
    let beta_iv: f64 = 3.75;

    // 50-year failure probabilities
    let pf_ii: f64 = phi_normal(-beta_ii);
    let pf_iii: f64 = phi_normal(-beta_iii);
    let pf_iv: f64 = phi_normal(-beta_iv);

    // Verify ordering: higher beta -> lower Pf
    assert!(pf_ii > pf_iii, "Cat II has higher Pf than Cat III");
    assert!(pf_iii > pf_iv, "Cat III has higher Pf than Cat IV");

    // Phi(-3.0) should be around 1.35e-3
    assert!(pf_ii > 1e-4 && pf_ii < 5e-3, "Pf for beta=3.0 in expected range");

    // Convert to annual failure probabilities
    let t: f64 = 50.0;
    let pf_annual_ii: f64 = 1.0 - (1.0 - pf_ii).powf(1.0 / t);
    let pf_annual_iii: f64 = 1.0 - (1.0 - pf_iii).powf(1.0 / t);
    let _pf_annual_iv: f64 = 1.0 - (1.0 - pf_iv).powf(1.0 / t);

    // Annual Pf should be much smaller than 50-year Pf
    assert!(pf_annual_ii < pf_ii, "Annual Pf < 50-year Pf");
    assert!(pf_annual_ii > pf_ii / 100.0, "Annual Pf > Pf/100");

    // Approximate relationship: Pf_annual ~ Pf_T / T for small Pf
    let pf_annual_approx: f64 = pf_ii / t;
    let ratio: f64 = pf_annual_ii / pf_annual_approx;
    assert!(ratio > 0.9 && ratio < 1.1, "Approximate annual Pf within 10%");

    // Risk Category III should have lower annual Pf than Cat II
    assert!(pf_annual_iii < pf_annual_ii, "Cat III more reliable than Cat II");
}

// ================================================================
// 8. Partial Safety Factors from Reliability Index and CoV
// ================================================================
//
// For lognormal R: gamma_R = exp(-alpha_R * beta * V_R - 0.5 * V_R^2)
// For lognormal S: gamma_S = exp(alpha_S * beta * V_S - 0.5 * V_S^2)
// where alpha_R = 0.8, alpha_S = 0.7 (FORM sensitivity factors)
//
// R: V_R = 0.15 (CoV), S: V_S = 0.20, beta = 3.5

#[test]
fn validation_partial_safety_factors() {
    let alpha_r: f64 = 0.8;
    let alpha_s: f64 = 0.7;
    let beta: f64 = 3.5;
    let v_r: f64 = 0.15; // CoV of resistance
    let v_s: f64 = 0.20; // CoV of load effect

    // Resistance factor (lognormal model)
    let ln_gamma_r: f64 = -alpha_r * beta * v_r - 0.5 * v_r * v_r;
    let gamma_r: f64 = ln_gamma_r.exp();

    let expected_ln_r: f64 = -0.8 * 3.5 * 0.15 - 0.5 * 0.0225;
    assert_close(ln_gamma_r, expected_ln_r, 0.001, "ln(gamma_R)");

    // Load factor (lognormal model)
    let ln_gamma_s: f64 = alpha_s * beta * v_s - 0.5 * v_s * v_s;
    let gamma_s: f64 = ln_gamma_s.exp();

    let expected_ln_s: f64 = 0.7 * 3.5 * 0.20 - 0.5 * 0.04;
    assert_close(ln_gamma_s, expected_ln_s, 0.001, "ln(gamma_S)");

    // phi (resistance factor) and gamma (load factor) for design
    let phi: f64 = gamma_r; // phi < 1
    let gamma_load: f64 = gamma_s; // gamma > 1

    assert!(phi < 1.0, "Resistance factor phi < 1.0");
    assert!(gamma_load > 1.0, "Load factor gamma > 1.0");

    // Check: phi*Rn >= gamma*Sn implies adequate reliability
    // gamma_r ~ 0.650, gamma_s ~ 1.600, so need R_mean >> S_mean
    let r_mean: f64 = 200.0;
    let s_mean: f64 = 50.0;
    let design_ok: bool = phi * r_mean >= gamma_load * s_mean;
    assert!(design_ok, "Design check with derived factors passes");

    // Higher CoV -> more extreme factors
    let v_r_high: f64 = 0.25;
    let gamma_r_high: f64 = (-alpha_r * beta * v_r_high - 0.5 * v_r_high * v_r_high).exp();
    assert!(gamma_r_high < gamma_r, "Higher CoV -> lower phi (more conservative)");

    // Verify alpha_R^2 + alpha_S^2 is near 1 (FORM constraint)
    let alpha_check: f64 = alpha_r * alpha_r + alpha_s * alpha_s;
    assert!(alpha_check > 0.9 && alpha_check < 1.2, "Alpha sum of squares near 1.0");

    let _ = PI; // acknowledge import
}
