/// Validation: Performance-Based Earthquake Engineering (PBEE)
///
/// References:
///   - FEMA P-58: Seismic Performance Assessment of Buildings (2018)
///   - ASCE 41-17: Seismic Evaluation and Retrofit
///   - FEMA 356/440: Prestandard for Seismic Rehabilitation
///   - Porter: "An Overview of PEER's Performance-Based Earthquake Engineering" (2003)
///   - Cornell & Krawinkler: "Progress and Challenges in PBEE" (2000)
///   - EC8-3: Assessment and Retrofitting of Buildings
///
/// Tests verify hazard curves, fragility functions, loss estimation,
/// and acceptance criteria for performance-based design.

// ================================================================
// 1. Seismic Hazard Curve (Power Law Approximation)
// ================================================================
//
// Annual probability of exceedance: λ(a) = k₀ * a^(-k)
// For California: k ≈ 2-3, k₀ depends on site
// Return period: T = 1/λ

#[test]
fn pbee_hazard_curve() {
    let k: f64 = 2.5;          // slope parameter
    let k0: f64 = 0.001;       // scale parameter

    // PGA for 475-year return (10%/50yr)
    let lambda_475: f64 = 1.0 / 475.0;
    let pga_475: f64 = (lambda_475 / k0).powf(-1.0 / k);

    // λ = k₀ * PGA^(-k) → PGA = (λ/k₀)^(-1/k)
    // = (0.002105/0.001)^(-1/2.5) = 2.105^(-0.4) = 1/2.105^0.4

    assert!(
        pga_475 > 0.1 && pga_475 < 2.0,
        "475-yr PGA: {:.3}g", pga_475
    );

    // PGA for 2475-year return (2%/50yr)
    let lambda_2475: f64 = 1.0 / 2475.0;
    let pga_2475: f64 = (lambda_2475 / k0).powf(-1.0 / k);

    // MCE should be larger than DBE
    assert!(
        pga_2475 > pga_475,
        "MCE PGA {:.3} > DBE PGA {:.3}", pga_2475, pga_475
    );

    // Ratio depends on k: MCE/DBE = (T_MCE/T_DBE)^(1/k)
    let ratio: f64 = pga_2475 / pga_475;
    let t_ratio: f64 = 2475.0 / 475.0;
    let expected_ratio: f64 = t_ratio.powf(1.0 / k);

    assert!(
        (ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "MCE/DBE ratio: {:.3}, expected {:.3}", ratio, expected_ratio
    );
}

// ================================================================
// 2. Fragility Function — Lognormal CDF
// ================================================================
//
// P(DS ≥ ds | IM = im) = Φ((ln(im) - ln(θ)) / β)
// θ = median capacity, β = dispersion (log-standard deviation)
// Φ = standard normal CDF

#[test]
fn pbee_fragility_function() {
    let theta: f64 = 0.03;    // median drift capacity (3% story drift)
    let beta: f64 = 0.40;     // dispersion

    // Probability of exceeding at median: P(DS|IM=θ) = 0.50
    let im: f64 = theta;
    let z: f64 = (im.ln() - theta.ln()) / beta;
    assert!(
        z.abs() < 0.001,
        "At median: z = {:.4} (should be 0)", z
    );

    // At 2× median: z = ln(2)/0.40 = 1.733
    let im_double: f64 = 2.0 * theta;
    let z_double: f64 = (im_double.ln() - theta.ln()) / beta;
    let z_expected: f64 = 2.0_f64.ln() / 0.40;

    assert!(
        (z_double - z_expected).abs() / z_expected < 0.01,
        "z at 2×median: {:.3}, expected {:.3}", z_double, z_expected
    );

    // Approximate CDF using error function
    // Φ(z) ≈ 0.5*(1 + erf(z/√2))
    let phi_z: f64 = 0.5 * (1.0 + erf_approx(z_double / 2.0_f64.sqrt()));

    assert!(
        phi_z > 0.90,
        "P(DS|IM=2θ) = {:.3} (should be ~0.96)", phi_z
    );
}

// Approximate error function (Abramowitz & Stegun)
fn erf_approx(x: f64) -> f64 {
    let a1: f64 = 0.254829592;
    let a2: f64 = -0.284496736;
    let a3: f64 = 1.421413741;
    let a4: f64 = -1.453152027;
    let a5: f64 = 1.061405429;
    let p: f64 = 0.3275911;
    let sign = if x >= 0.0 { 1.0 } else { -1.0 };
    let x_abs = x.abs();
    let t = 1.0 / (1.0 + p * x_abs);
    let y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (-x_abs * x_abs).exp();
    sign * y
}

// ================================================================
// 3. ASCE 41 — Acceptance Criteria (Deformation)
// ================================================================
//
// ASCE 41 acceptance criteria for steel moment frames:
// IO (Immediate Occupancy): θ ≤ 1%
// LS (Life Safety): θ ≤ 2%
// CP (Collapse Prevention): θ ≤ 4%

#[test]
fn pbee_asce41_acceptance() {
    let theta_io: f64 = 0.01;   // 1% drift
    let theta_ls: f64 = 0.02;   // 2% drift
    let theta_cp: f64 = 0.04;   // 4% drift

    // Example: computed drift = 1.5%
    let theta_demand: f64 = 0.015;

    // Check performance levels
    let io_ok: bool = theta_demand <= theta_io;
    let ls_ok: bool = theta_demand <= theta_ls;
    let cp_ok: bool = theta_demand <= theta_cp;

    assert!(!io_ok, "Does not satisfy IO (1.5% > 1%)");
    assert!(ls_ok, "Satisfies LS (1.5% ≤ 2%)");
    assert!(cp_ok, "Satisfies CP (1.5% ≤ 4%)");

    // DCR at each level
    let dcr_io: f64 = theta_demand / theta_io;
    let dcr_ls: f64 = theta_demand / theta_ls;
    let dcr_cp: f64 = theta_demand / theta_cp;

    assert!((dcr_io - 1.5).abs() < 0.01, "IO DCR: {:.2}", dcr_io);
    assert!((dcr_ls - 0.75).abs() < 0.01, "LS DCR: {:.2}", dcr_ls);
    assert!((dcr_cp - 0.375).abs() < 0.01, "CP DCR: {:.2}", dcr_cp);
}

// ================================================================
// 4. FEMA P-58 — Expected Annual Loss (EAL)
// ================================================================
//
// EAL = ∫ E[L|IM] * |dλ(IM)/dIM| * dIM
// Discretized: EAL ≈ Σ E[L|IMᵢ] * Δλᵢ
// where Δλ = λ(IMᵢ) - λ(IMᵢ₊₁)

#[test]
fn pbee_expected_annual_loss() {
    // Hazard levels and corresponding expected losses
    let hazard: [(f64, f64); 4] = [
        (0.050, 0.001),  // (return period fraction, expected loss ratio)
        (0.021, 0.005),  // 475-yr: 2.1e-3 annual prob, 0.5% loss
        (0.010, 0.020),  // 1000-yr
        (0.004, 0.080),  // 2500-yr
    ];

    let replacement_cost: f64 = 10_000_000.0; // $10M

    // EAL by trapezoidal integration
    let mut eal: f64 = 0.0;
    for i in 0..hazard.len() - 1 {
        let lambda_i = hazard[i].0;
        let lambda_j = hazard[i + 1].0;
        let loss_i = hazard[i].1;
        let loss_j = hazard[i + 1].1;

        let delta_lambda: f64 = lambda_i - lambda_j;
        let avg_loss: f64 = (loss_i + loss_j) / 2.0;
        eal += avg_loss * delta_lambda;
    }

    let eal_dollars: f64 = eal * replacement_cost;

    assert!(
        eal > 0.0,
        "EAL ratio: {:.6}", eal
    );
    assert!(
        eal_dollars > 0.0 && eal_dollars < 1_000_000.0,
        "EAL: ${:.0}", eal_dollars
    );

    // EAL as percentage of replacement cost
    let eal_pct: f64 = eal * 100.0;
    assert!(
        eal_pct < 1.0,
        "EAL: {:.3}% of replacement cost", eal_pct
    );
}

// ================================================================
// 5. Structural Ductility Demand
// ================================================================
//
// Ductility demand: μ = Δ_max / Δ_yield
// For equal-displacement rule (T > Tc): μ = R (reduction factor)
// For short periods: μ = (R² + 1) / (2R) — Newmark-Hall

#[test]
fn pbee_ductility_demand() {
    let r: f64 = 4.0; // response modification factor

    // Long period (equal displacement): μ = R
    let mu_long: f64 = r;
    assert!(
        (mu_long - 4.0).abs() < 0.01,
        "Long period ductility: {:.1}", mu_long
    );

    // Short period (equal energy, Newmark-Hall):
    // μ = (R² + 1) / (2*R) — but this is for R relating force to ductility
    // Actually: R = sqrt(2μ - 1) → μ = (R²+1)/2
    let mu_short: f64 = (r * r + 1.0) / 2.0;
    // = (16+1)/2 = 8.5

    assert!(
        mu_short > mu_long,
        "Short period μ = {:.1} > long period μ = {:.1}", mu_short, mu_long
    );

    // Medium period (interpolation): between R and (R²+1)/2
    let tc: f64 = 0.5;  // characteristic period
    let t: f64 = 0.3;   // structural period
    // Linear interpolation in log-space
    let factor: f64 = t / tc;
    let mu_med: f64 = mu_short + (mu_long - mu_short) * factor;

    assert!(
        mu_med > mu_long && mu_med < mu_short,
        "Medium period μ = {:.1}", mu_med
    );
}

// ================================================================
// 6. Target Reliability (ASCE 7 Risk Category)
// ================================================================
//
// ASCE 7 Table 1.3-1: Acceptable probabilities
// Risk Category II: 10% in 50 yr for collapse prevention
// Risk Category IV: 5% in 50 yr for essential facilities

#[test]
fn pbee_target_reliability() {
    // Annual probability from 50-year probability:
    // P_annual = 1 - (1 - P_50)^(1/50)
    let p_50_ii: f64 = 0.10;   // 10% in 50 years
    let p_50_iv: f64 = 0.05;   // 5% in 50 years

    let p_annual_ii: f64 = 1.0 - (1.0 - p_50_ii).powf(1.0 / 50.0);
    let p_annual_iv: f64 = 1.0 - (1.0 - p_50_iv).powf(1.0 / 50.0);

    // P_annual ≈ P_50/50 for small probabilities
    // = 0.002105, 0.001026
    assert!(
        p_annual_ii > p_annual_iv,
        "RC II annual P = {:.6} > RC IV = {:.6}", p_annual_ii, p_annual_iv
    );

    // Return periods
    let t_ii: f64 = 1.0 / p_annual_ii;
    let t_iv: f64 = 1.0 / p_annual_iv;

    assert!(
        (t_ii - 475.0).abs() / 475.0 < 0.02,
        "RC II return period: {:.0} years ≈ 475", t_ii
    );
    assert!(
        (t_iv - 975.0).abs() / 975.0 < 0.02,
        "RC IV return period: {:.0} years ≈ 975", t_iv
    );
}

// ================================================================
// 7. Pushover — Target Displacement (FEMA 440)
// ================================================================
//
// Target displacement: δt = C₀*C₁*C₂*Sa*(Te²/(4π²))*g
// C₀ = modification factor for MDOF
// C₁ = modification for inelastic displacement (short period)
// C₂ = modification for hysteresis degradation

#[test]
fn pbee_target_displacement() {
    let sa: f64 = 0.80;       // g, spectral acceleration
    let te: f64 = 1.0;        // s, effective period
    let c0: f64 = 1.3;        // MDOF modification (3-story)
    let c1: f64 = 1.0;        // inelastic displacement (T > Ts)
    let c2: f64 = 1.0;        // hysteresis (no degradation)
    let g: f64 = 9.81;        // m/s²

    // Target displacement
    let delta_t: f64 = c0 * c1 * c2 * sa * te * te / (4.0 * std::f64::consts::PI * std::f64::consts::PI) * g;
    // = 1.3 * 1.0 * 1.0 * 0.80 * 1.0 / 39.48 * 9.81
    // = 1.04 / 39.48 * 9.81 = 0.02634 * 9.81 = 0.2584 m

    let delta_expected: f64 = 1.3 * 0.80 * 1.0 / (4.0 * std::f64::consts::PI * std::f64::consts::PI) * 9.81;

    assert!(
        (delta_t - delta_expected).abs() / delta_expected < 0.01,
        "Target displacement: {:.4} m, expected {:.4}", delta_t, delta_expected
    );

    // Drift ratio for 3-story building (H ≈ 10.5m)
    let h_building: f64 = 10.5;
    let drift: f64 = delta_t / h_building;

    assert!(
        drift > 0.01 && drift < 0.05,
        "Global drift: {:.3} ({:.1}%)", drift, drift * 100.0
    );
}

// ================================================================
// 8. EC8-3 — Knowledge Level and Confidence Factor
// ================================================================
//
// EC8-3 defines knowledge levels for existing buildings:
// KL1 (limited): CF = 1.35
// KL2 (normal): CF = 1.20
// KL3 (full): CF = 1.00
// Mean material strength is divided by CF for assessment.

#[test]
fn pbee_ec8_knowledge_level() {
    let f_cm: f64 = 30.0;    // MPa, mean concrete strength from tests
    let f_ym: f64 = 450.0;   // MPa, mean steel yield from tests

    // Confidence factors
    let cf_kl1: f64 = 1.35;
    let cf_kl2: f64 = 1.20;
    let cf_kl3: f64 = 1.00;

    // Design values at each knowledge level
    let fc_kl1: f64 = f_cm / cf_kl1;
    let fc_kl2: f64 = f_cm / cf_kl2;
    let fc_kl3: f64 = f_cm / cf_kl3;

    assert!(
        fc_kl1 < fc_kl2 && fc_kl2 < fc_kl3,
        "KL1 {:.1} < KL2 {:.1} < KL3 {:.1} MPa", fc_kl1, fc_kl2, fc_kl3
    );

    // KL3 has no reduction (full knowledge)
    assert!(
        (fc_kl3 - f_cm).abs() < 0.01,
        "KL3: no reduction from mean"
    );

    // Capacity reduction from limited knowledge
    let reduction_kl1: f64 = (1.0 - fc_kl1 / f_cm) * 100.0;
    // = (1 - 1/1.35) * 100 = 25.9%
    assert!(
        (reduction_kl1 - 25.9).abs() < 0.5,
        "KL1 reduction: {:.1}%", reduction_kl1
    );

    // Steel is similarly affected
    let fy_kl1: f64 = f_ym / cf_kl1;
    let fy_kl3: f64 = f_ym / cf_kl3;
    assert!(
        fy_kl1 < fy_kl3,
        "Steel KL1 {:.0} < KL3 {:.0} MPa", fy_kl1, fy_kl3
    );
}
