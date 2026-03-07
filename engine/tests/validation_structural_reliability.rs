/// Validation: Structural Reliability & Safety
///
/// References:
///   - EN 1990 (EC0): Eurocode — Basis of Structural Design
///   - ISO 2394:2015: General Principles on Reliability for Structures
///   - JCSS Probabilistic Model Code (2001)
///   - Ditlevsen & Madsen: "Structural Reliability Methods" (2007)
///   - Melchers & Beck: "Structural Reliability Analysis and Prediction" 3rd ed.
///   - Cornell (1969): "A Probability-Based Structural Code"
///   - Hasofer & Lind (1974): "An Exact and Invariant FORM"
///
/// Tests verify reliability index, partial factors, FORM,
/// and load combination probabilistic basis.

mod helpers;

// ================================================================
// 1. Reliability Index — Normal Variables (Cornell)
// ================================================================
//
// For g(R,S) = R - S, with R~N(μR,σR), S~N(μS,σS):
// β = (μR - μS) / sqrt(σR² + σS²)
// Target β for ULS: 3.8 (50yr, CC2) per EN 1990

#[test]
fn reliability_cornell_index() {
    let mu_r: f64 = 200.0;     // kN, mean resistance
    let sigma_r: f64 = 20.0;   // kN, std dev of resistance
    let mu_s: f64 = 100.0;     // kN, mean load effect
    let sigma_s: f64 = 25.0;   // kN, std dev of load

    let beta: f64 = (mu_r - mu_s) / (sigma_r * sigma_r + sigma_s * sigma_s).sqrt();
    // = 100 / sqrt(400 + 625) = 100 / 32.02 = 3.12

    let expected: f64 = 100.0 / (400.0 + 625.0_f64).sqrt();
    assert!(
        (beta - expected).abs() / expected < 0.001,
        "β = {:.3}, expected {:.3}", beta, expected
    );

    // Probability of failure: Pf = Φ(-β)
    // For β = 3.12: Pf ≈ 9.1e-4
    // Using normal CDF approximation
    let pf_approx: f64 = 0.5 * (1.0 - erf_approx(beta / 2.0_f64.sqrt()));

    assert!(
        pf_approx > 1e-5 && pf_approx < 1e-2,
        "Pf ≈ {:.2e}", pf_approx
    );
}

/// Simple error function approximation (Abramowitz & Stegun)
fn erf_approx(x: f64) -> f64 {
    let a1: f64 = 0.254829592;
    let a2: f64 = -0.284496736;
    let a3: f64 = 1.421413741;
    let a4: f64 = -1.453152027;
    let a5: f64 = 1.061405429;
    let p: f64 = 0.3275911;

    let sign = if x >= 0.0 { 1.0 } else { -1.0 };
    let x = x.abs();
    let t: f64 = 1.0 / (1.0 + p * x);
    let y: f64 = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x * x).exp();
    sign * y
}

// ================================================================
// 2. EN 1990 Target Reliability (Table B2)
// ================================================================
//
// Reference period 50 years:
// CC1 (low): β = 3.3 (Pf ≈ 4.8e-4)
// CC2 (normal): β = 3.8 (Pf ≈ 7.2e-5)
// CC3 (high): β = 4.3 (Pf ≈ 8.5e-6)
//
// Reference period 1 year:
// CC1: β = 4.2, CC2: β = 4.7, CC3: β = 5.2

#[test]
fn reliability_en1990_targets() {
    // 50-year targets
    let beta_cc1_50: f64 = 3.3;
    let beta_cc2_50: f64 = 3.8;
    let beta_cc3_50: f64 = 4.3;

    // 1-year targets (higher because shorter reference period)
    let beta_cc1_1: f64 = 4.2;
    let beta_cc2_1: f64 = 4.7;
    let beta_cc3_1: f64 = 5.2;

    // Relationship: β_1 > β_50 (shorter period → higher required β)
    assert!(
        beta_cc2_1 > beta_cc2_50,
        "1-yr β = {:.1} > 50-yr β = {:.1}", beta_cc2_1, beta_cc2_50
    );

    // Approximate conversion: Φ(-β_1) ≈ 1-(1-Φ(-β_50))^(1/50)
    // For CC2: Pf_50 ≈ 7.2e-5, Pf_1 ≈ 1.44e-6
    let pf_50: f64 = 0.5 * (1.0 - erf_approx(beta_cc2_50 / 2.0_f64.sqrt()));
    let pf_1: f64 = 0.5 * (1.0 - erf_approx(beta_cc2_1 / 2.0_f64.sqrt()));

    assert!(
        pf_1 < pf_50,
        "Pf(1yr) = {:.2e} < Pf(50yr) = {:.2e}", pf_1, pf_50
    );

    // Consequence classes are ordered
    assert!(
        beta_cc1_50 < beta_cc2_50 && beta_cc2_50 < beta_cc3_50,
        "CC1 < CC2 < CC3"
    );

    let _beta_cc1_1 = beta_cc1_1;
    let _beta_cc3_1 = beta_cc3_1;
}

// ================================================================
// 3. FORM — First Order Reliability Method (Hasofer-Lind)
// ================================================================
//
// For linear limit state g = R - S with standard normal:
// Transform: U_R = (R - μR)/σR, U_S = (S - μS)/σS
// g(u) = 0 defines failure surface in standard normal space.
// β_HL = minimum distance from origin to failure surface.

#[test]
fn reliability_form_linear() {
    let mu_r: f64 = 300.0;
    let sigma_r: f64 = 30.0;
    let mu_s: f64 = 150.0;
    let sigma_s: f64 = 30.0;

    // For g = R - S (linear):
    // β = (μR - μS) / sqrt(σR² + σS²) (same as Cornell)
    let beta_hl: f64 = (mu_r - mu_s) / (sigma_r.powi(2) + sigma_s.powi(2)).sqrt();
    // = 150 / sqrt(900+900) = 150/42.43 = 3.536

    // Direction cosines (sensitivity factors)
    let alpha_r: f64 = -sigma_r / (sigma_r.powi(2) + sigma_s.powi(2)).sqrt();
    let alpha_s: f64 = sigma_s / (sigma_r.powi(2) + sigma_s.powi(2)).sqrt();

    // Sum of squares of direction cosines = 1
    let sum_sq: f64 = alpha_r.powi(2) + alpha_s.powi(2);
    assert!(
        (sum_sq - 1.0).abs() < 0.001,
        "Σα² = {:.4}, expected 1.0", sum_sq
    );

    // EN 1990 Annex C: αR ≈ -0.8, αS ≈ 0.7 (standardized)
    // For equal CoVs, |αR| = |αS| = 1/√2 ≈ 0.707
    let expected_alpha: f64 = 1.0 / 2.0_f64.sqrt();
    assert!(
        (alpha_r.abs() - expected_alpha).abs() < 0.01,
        "|αR| = {:.3}, expected {:.3}", alpha_r.abs(), expected_alpha
    );

    // Design point in original space
    let r_star: f64 = mu_r + alpha_r * beta_hl * sigma_r;
    let s_star: f64 = mu_s + alpha_s * beta_hl * sigma_s;

    // At design point: g(R*, S*) = 0
    let g_star: f64 = r_star - s_star;
    assert!(
        g_star.abs() < 0.1,
        "g(R*, S*) = {:.3} ≈ 0", g_star
    );
}

// ================================================================
// 4. Partial Factor Calibration
// ================================================================
//
// EN 1990 Annex C: For β = 3.8 (CC2):
// γR = 1 / (1 + αR * β * VR)   (resistance)
// γS = 1 * (1 - αS * β * VS)   (action, inverted for characteristic)
// With αR = -0.8, αS = 0.7

#[test]
fn reliability_partial_factors() {
    let beta: f64 = 3.8;       // CC2, 50 years
    let alpha_r: f64 = 0.8;    // |αR| (EN 1990 convention: positive)
    let alpha_s: f64 = 0.7;    // αS

    // Resistance: assuming lognormal with CoV_R = 0.15
    let vr: f64 = 0.15;
    let gamma_r: f64 = 1.0 / (1.0 - alpha_r * beta * vr);
    // ≈ 1 / (1 - 0.8*3.8*0.15) = 1/(1-0.456) = 1.838

    // Action: assuming normal with CoV_S = 0.3
    let vs: f64 = 0.30;
    let gamma_s: f64 = 1.0 + alpha_s * beta * vs;
    // ≈ 1 + 0.7*3.8*0.3 = 1 + 0.798 = 1.798

    // Typical EC values: γ_M ≈ 1.0-1.5 (material), γ_G ≈ 1.35, γ_Q ≈ 1.50
    assert!(
        gamma_r > 1.0 && gamma_r < 3.0,
        "γR = {:.3} (resistance partial factor)", gamma_r
    );
    assert!(
        gamma_s > 1.0 && gamma_s < 3.0,
        "γS = {:.3} (action partial factor)", gamma_s
    );

    // Sensitivity: doubling CoV doubles the excess partial factor
    let vr2: f64 = 0.30;
    let gamma_r2: f64 = 1.0 / (1.0 - alpha_r * beta * vr2);
    let excess_1: f64 = gamma_r - 1.0;
    let excess_2: f64 = gamma_r2 - 1.0;
    // Not exactly double due to 1/(1-x) nonlinearity, but should be > 1.5x
    assert!(
        excess_2 > 1.5 * excess_1,
        "Doubling CoV increases γR from {:.3} to {:.3}", gamma_r, gamma_r2
    );
}

// ================================================================
// 5. Load Combination — Turkstra's Rule
// ================================================================
//
// For combination of independent loads:
// S_total = S_permanent + max_i(S_i + Σ_{j≠i} ψ_0j * S_j)
// ψ_0: combination factor, accounts for low probability of simultaneous maxima.

#[test]
fn reliability_turkstra_rule() {
    let g_k: f64 = 50.0;       // kN, permanent load (characteristic)
    let q1_k: f64 = 30.0;      // kN, imposed load
    let q2_k: f64 = 20.0;      // kN, wind load

    // Combination factors (EN 1990 Table A1.1)
    let psi_0_imposed: f64 = 0.7;
    let psi_0_wind: f64 = 0.6;

    // Combination 1: imposed leading
    let s_comb1: f64 = 1.35 * g_k + 1.50 * q1_k + 1.50 * psi_0_wind * q2_k;
    // = 67.5 + 45.0 + 18.0 = 130.5

    // Combination 2: wind leading
    let s_comb2: f64 = 1.35 * g_k + 1.50 * q2_k + 1.50 * psi_0_imposed * q1_k;
    // = 67.5 + 30.0 + 31.5 = 129.0

    // Design uses the more onerous
    let s_design: f64 = s_comb1.max(s_comb2);

    assert!(
        (s_design - s_comb1).abs() < 0.1,
        "Governing combination: {:.1} kN", s_design
    );

    // Without combination factors (all maxima simultaneously):
    let s_uncombined: f64 = 1.35 * g_k + 1.50 * (q1_k + q2_k);
    // = 67.5 + 75.0 = 142.5

    // Turkstra's rule gives lower (more realistic) design load
    assert!(
        s_design < s_uncombined,
        "Turkstra {:.1} < uncombined {:.1} kN", s_design, s_uncombined
    );
}

// ================================================================
// 6. System Reliability — Series and Parallel
// ================================================================
//
// Series system (any element fails → system fails):
// Pf,sys ≤ Σ Pf,i (upper bound, Ditlevsen)
// Parallel system (all must fail):
// Pf,sys = Π Pf,i (if independent)

#[test]
fn reliability_system() {
    // Three independent elements
    let pf1: f64 = 1e-4;
    let pf2: f64 = 2e-4;
    let pf3: f64 = 1.5e-4;

    // Series system (weakest link)
    let pf_series_upper: f64 = pf1 + pf2 + pf3;
    // = 4.5e-4

    // Series: system Pf ≥ max(Pf,i)
    let pf_series_lower: f64 = pf1.max(pf2).max(pf3);

    assert!(
        pf_series_upper > pf_series_lower,
        "Series bounds: [{:.2e}, {:.2e}]", pf_series_lower, pf_series_upper
    );

    // Parallel system (all must fail)
    let pf_parallel: f64 = pf1 * pf2 * pf3;
    // = 3e-12 (extremely small)

    assert!(
        pf_parallel < pf1.min(pf2).min(pf3),
        "Parallel Pf = {:.2e} << individual element Pf", pf_parallel
    );

    // System reliability index (approximate)
    let beta_series: f64 = normal_inv(1.0 - pf_series_upper);
    let beta_parallel: f64 = normal_inv(1.0 - pf_parallel);

    assert!(
        beta_parallel > beta_series,
        "β_parallel = {:.2} > β_series = {:.2}", beta_parallel, beta_series
    );
}

/// Approximate inverse normal CDF (Beasley-Springer-Moro approximation, simplified)
fn normal_inv(p: f64) -> f64 {
    // Simple rational approximation for 0.5 < p < 1
    let t: f64 = (-2.0 * (1.0 - p).ln()).sqrt();
    let c0: f64 = 2.515517;
    let c1: f64 = 0.802853;
    let c2: f64 = 0.010328;
    let d1: f64 = 1.432788;
    let d2: f64 = 0.189269;
    let d3: f64 = 0.001308;
    t - (c0 + c1 * t + c2 * t * t) / (1.0 + d1 * t + d2 * t * t + d3 * t * t * t)
}

// ================================================================
// 7. Coefficient of Variation and Bias
// ================================================================
//
// Design codes calibrated against statistical data:
// Dead load: bias λ = 1.05, CoV = 0.10
// Live load: bias λ = 1.0, CoV = 0.25
// Steel yield: bias λ = 1.10, CoV = 0.06
// Concrete f'c: bias λ = 1.15, CoV = 0.15

#[test]
fn reliability_statistical_parameters() {
    // Dead load statistics
    let lambda_d: f64 = 1.05;   // bias (mean/nominal)
    let cov_d: f64 = 0.10;      // coefficient of variation

    // Live load statistics
    let lambda_l: f64 = 1.0;
    let cov_l: f64 = 0.25;

    // Steel yield strength
    let lambda_fy: f64 = 1.10;
    let cov_fy: f64 = 0.06;

    // Concrete compressive strength
    let lambda_fc: f64 = 1.15;
    let cov_fc: f64 = 0.15;

    // Resistance has lower CoV than load
    assert!(
        cov_fy < cov_l,
        "Steel CoV ({:.2}) < Live load CoV ({:.2})", cov_fy, cov_l
    );

    // Bias > 1 means actual mean exceeds nominal
    assert!(
        lambda_fy > 1.0 && lambda_fc > 1.0,
        "Material bias > 1: steel {:.2}, concrete {:.2}", lambda_fy, lambda_fc
    );

    // For nominal steel fy = 350 MPa
    let fy_nom: f64 = 350.0;
    let fy_mean: f64 = lambda_fy * fy_nom;
    let fy_std: f64 = cov_fy * fy_mean;

    // 5th percentile (characteristic value):
    // fk = mean - 1.645*std = 385 - 1.645*23.1 = 347 ≈ nominal
    let fy_5pct: f64 = fy_mean - 1.645 * fy_std;

    // Characteristic value should be close to nominal
    let char_ratio: f64 = fy_5pct / fy_nom;
    assert!(
        (char_ratio - 1.0).abs() < 0.10,
        "Characteristic/nominal ratio: {:.3} ≈ 1.0", char_ratio
    );

    let _lambda_d = lambda_d;
    let _cov_d = cov_d;
    let _lambda_l = lambda_l;
    let _lambda_fc = lambda_fc;
    let _cov_fc = cov_fc;
}

// ================================================================
// 8. Monte Carlo Convergence
// ================================================================
//
// For direct Monte Carlo: CoV of Pf estimate = sqrt((1-Pf)/(N*Pf))
// N required for 10% CoV: N = 100/Pf
// For Pf = 1e-4: need N = 1,000,000 samples

#[test]
fn reliability_monte_carlo_convergence() {
    let pf_target: f64 = 1e-4;

    // Required samples for given CoV of estimator
    let cov_target: f64 = 0.10; // 10% coefficient of variation
    let cov_target_sq: f64 = cov_target * cov_target;
    let n_required: f64 = (1.0 - pf_target) / (cov_target_sq * pf_target);
    // ≈ 1/0.01/1e-4 = 1e6

    assert!(
        (n_required - 1e6).abs() / 1e6 < 0.01,
        "N required: {:.0} ≈ 1,000,000", n_required
    );

    // For 5% CoV: N = 400/Pf = 4,000,000
    let cov_5pct: f64 = 0.05;
    let cov_5pct_sq: f64 = cov_5pct * cov_5pct;
    let n_5pct: f64 = (1.0 - pf_target) / (cov_5pct_sq * pf_target);
    assert!(
        n_5pct > n_required,
        "5% CoV needs {:.0} > 10% CoV needs {:.0}", n_5pct, n_required
    );

    // Importance sampling can reduce by orders of magnitude
    // Typical reduction factor: 100-1000x
    let is_factor: f64 = 100.0;
    let n_is: f64 = n_required / is_factor;
    assert!(
        n_is < 1e5,
        "IS needs only {:.0} samples", n_is
    );
}
