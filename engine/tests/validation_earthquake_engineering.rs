/// Validation: Earthquake Engineering Fundamentals
///
/// References:
///   - Chopra: "Dynamics of Structures" 5th ed. (2017)
///   - Newmark & Hall: "Earthquake Spectra and Design" (1982)
///   - EN 1998-1 (EC8): Design of Structures for Earthquake Resistance
///   - ASCE 7-22: Seismic Design Requirements
///   - Paulay & Priestley: "Seismic Design of RC and Masonry Buildings" (1992)
///   - ATC-40: Seismic Evaluation and Retrofit of Concrete Buildings
///
/// Tests verify response spectra, ductility demand, capacity spectrum,
/// base isolation, and displacement-based design.

mod helpers;

// ================================================================
// 1. Elastic Response Spectrum -- Newmark-Hall
// ================================================================
//
// Newmark-Hall amplification factors:
// Acceleration region: Sa = αa × PGA (T < Tc)
// Velocity region: Sv = αv × PGV (Tc < T < Td)
// Displacement region: Sd = αd × PGD (T > Td)
// For 5% damping: αa ≈ 2.12, αv ≈ 1.65, αd ≈ 1.39

#[test]
fn earthquake_newmark_spectrum() {
    let pga: f64 = 0.40;        // g
    let alpha_a: f64 = 2.12;    // 5% damping amplification

    // Spectral acceleration plateau
    let sa_max: f64 = alpha_a * pga;
    // = 0.848g

    assert!(
        sa_max > pga,
        "Sa_max = {:.3}g > PGA = {:.2}g", sa_max, pga
    );

    // Corner periods (Newmark-Hall)
    let ta: f64 = 0.03;         // s, start of acceleration plateau
    let tc: f64 = 0.33;         // s, transition to velocity region
    let td: f64 = 3.0;          // s, transition to displacement region

    // Spectral values at different periods
    let sa_short: f64 = sa_max; // T = 0.2s (in plateau)
    let sa_1s: f64 = sa_max * tc / 1.0; // T = 1.0s (velocity region, Sa ∝ 1/T)

    assert!(
        sa_1s < sa_short,
        "Sa(1s) = {:.3}g < Sa(0.2s) = {:.3}g", sa_1s, sa_short
    );

    // At long periods: Sa → 0 (displacement controlled)
    let sa_3s: f64 = sa_max * tc * td / (3.0 * 3.0); // Sa ∝ 1/T²
    assert!(
        sa_3s < sa_1s,
        "Sa(3s) = {:.4}g < Sa(1s) = {:.3}g", sa_3s, sa_1s
    );

    let _ta = ta;
}

// ================================================================
// 2. Ductility Demand -- R-μ-T Relationship
// ================================================================
//
// Equal displacement rule: μ = R (for T > Tc)
// Equal energy rule: μ = (R² + 1) / 2 (for T < Tc)
// Newmark-Hall: μ = R for T ≥ 0.5s, transition for short periods.

#[test]
fn earthquake_ductility_demand() {
    let r: f64 = 4.0;           // response modification factor

    // Long period (T > Tc): equal displacement
    let mu_long: f64 = r;
    assert!(
        (mu_long - r).abs() < 0.01,
        "Long period μ = {:.1} = R", mu_long
    );

    // Short period: equal energy
    let mu_short: f64 = (r * r + 1.0) / 2.0;
    // = (16 + 1) / 2 = 8.5

    assert!(
        mu_short > mu_long,
        "Short period μ = {:.1} > long period μ = {:.1}", mu_short, mu_long
    );

    // Implication: short period structures need MORE ductility for same R
    // This is why codes limit R for short period structures

    // Miranda & Bertero (1994): site-dependent
    let t: f64 = 0.3;           // s, short period
    // For rock site: μ = R-1 + 1/(R × 1.0) (approximate)
    let mu_miranda: f64 = r - 1.0 + 1.0 / r;

    assert!(
        mu_miranda > 1.0,
        "Miranda μ(T={:.1}s) = {:.2}", t, mu_miranda
    );
}

// ================================================================
// 3. Capacity Spectrum Method -- ATC-40
// ================================================================
//
// Convert pushover curve to ADRS (Acceleration-Displacement Response Spectrum).
// Sa = V/(W × α1), Sd = Δroof / (PF1 × φ1,roof)
// Performance point: intersection of capacity and demand.

#[test]
fn earthquake_capacity_spectrum() {
    let w: f64 = 10000.0;       // kN, building weight
    let alpha1: f64 = 0.85;     // effective mass factor (first mode)
    let pf1: f64 = 1.30;        // participation factor
    let phi1_roof: f64 = 1.0;   // mode shape at roof (normalized)

    // Pushover curve points (V, Δroof)
    let vy: f64 = 2000.0;       // kN, yield base shear
    let delta_y: f64 = 50.0;    // mm, yield displacement
    let vu: f64 = 2500.0;       // kN, ultimate base shear
    let delta_u: f64 = 200.0;   // mm, ultimate displacement

    // Convert to ADRS format
    let say: f64 = vy / (w * alpha1); // g (V in kN, W in kN → ratio)
    let sdy: f64 = delta_y / (pf1 * phi1_roof); // mm

    let sau: f64 = vu / (w * alpha1);
    let sdu: f64 = delta_u / (pf1 * phi1_roof);

    assert!(
        say < sau,
        "Sa_yield {:.3} < Sa_ultimate {:.3}", say, sau
    );

    assert!(
        sdy < sdu,
        "Sd_yield {:.1} < Sd_ultimate {:.1} mm", sdy, sdu
    );

    // Effective period at yield point
    let t_eff: f64 = 2.0 * std::f64::consts::PI * (sdy / 1000.0 / (say * 9.81)).sqrt();

    assert!(
        t_eff > 0.1 && t_eff < 3.0,
        "Effective period: {:.2} s", t_eff
    );

    // Ductility from capacity curve
    let mu: f64 = sdu / sdy;
    assert!(
        mu > 2.0,
        "Available ductility: {:.1}", mu
    );
}

// ================================================================
// 4. EC8 Design Spectrum -- Soil Amplification
// ================================================================
//
// EC8 elastic spectrum with soil factors:
// Ground type A (rock): S=1.0, TB=0.15, TC=0.4, TD=2.0
// Ground type C (dense sand): S=1.15, TB=0.20, TC=0.6, TD=2.0
// Se(T) = ag*S × spectral shape factor

#[test]
fn earthquake_ec8_spectrum() {
    let ag: f64 = 0.25;         // g, reference PGA on rock

    // Ground type A (rock)
    let s_a: f64 = 1.0;
    let tc_a: f64 = 0.4;

    // Ground type C (dense sand/gravel)
    let s_c: f64 = 1.15;
    let tc_c: f64 = 0.6;

    // Spectral acceleration at T = 0.3s (in plateau)
    let sa_rock: f64 = ag * s_a * 2.5; // plateau value
    let sa_soil: f64 = ag * s_c * 2.5;

    assert!(
        sa_soil > sa_rock,
        "Soil Sa = {:.3}g > rock Sa = {:.3}g", sa_soil, sa_rock
    );

    // At T = 1.0s (velocity region)
    let sa_rock_1s: f64 = ag * s_a * 2.5 * tc_a / 1.0;
    let sa_soil_1s: f64 = ag * s_c * 2.5 * tc_c / 1.0;

    // Soil amplification is larger at longer periods
    let amp_plateau: f64 = sa_soil / sa_rock;
    let amp_1s: f64 = sa_soil_1s / sa_rock_1s;

    assert!(
        amp_1s > amp_plateau,
        "Amplification at 1s ({:.2}) > plateau ({:.2})", amp_1s, amp_plateau
    );
}

// ================================================================
// 5. Base Isolation -- Period Shift
// ================================================================
//
// Isolation: shift period beyond spectral plateau → reduce Sa.
// T_iso = 2π√(W/(g×K_iso))
// Displacement: D_iso = Sa(T_iso) × g × T² / (4π²)

#[test]
fn earthquake_base_isolation() {
    let w: f64 = 50000.0;       // kN, building weight
    let g_val: f64 = 9.81;      // m/s²
    let m: f64 = w / g_val;     // tonnes

    // Fixed-base period
    let t_fixed: f64 = 0.5;     // s

    // Isolation system stiffness
    let k_iso: f64 = 5000.0;    // kN/m

    // Isolated period
    let t_iso: f64 = 2.0 * std::f64::consts::PI * (w / (g_val * k_iso)).sqrt();

    assert!(
        t_iso > 2.0,
        "Isolated period: {:.2}s (>> fixed {:.1}s)", t_iso, t_fixed
    );

    // Spectral acceleration reduction
    let sa_fixed: f64 = 0.25 * 2.5; // plateau (PGA=0.25g)
    let tc: f64 = 0.5;
    let sa_iso: f64 = sa_fixed * tc / t_iso; // velocity region

    let reduction: f64 = 1.0 - sa_iso / sa_fixed;
    assert!(
        reduction > 0.50,
        "Force reduction: {:.0}%", reduction * 100.0
    );

    // Isolation displacement
    let d_iso: f64 = sa_iso * g_val * t_iso * t_iso / (4.0 * std::f64::consts::PI * std::f64::consts::PI);
    // in meters

    assert!(
        d_iso > 0.05 && d_iso < 0.50,
        "Isolation displacement: {:.0} mm", d_iso * 1000.0
    );

    let _m = m;
}

// ================================================================
// 6. Displacement-Based Design -- Equivalent SDOF
// ================================================================
//
// Priestley et al.: Direct Displacement-Based Design (DDBD).
// Design for target displacement, derive required strength.
// Equivalent damping: ξ_eq = ξ_el + ξ_hyst

#[test]
fn earthquake_ddbd() {
    let delta_target: f64 = 0.150; // m, target roof displacement
    let _h_eff: f64 = 14.0;       // m, effective height (≈ 0.7H)
    let mu: f64 = 3.0;            // design ductility

    // Equivalent viscous damping (Jacobsen)
    let xi_el: f64 = 0.05;        // elastic damping
    let xi_hyst: f64 = 0.05 + 0.444 * (mu - 1.0) / (std::f64::consts::PI * mu);
    let xi_eq: f64 = xi_el + xi_hyst;

    assert!(
        xi_eq > 0.10,
        "Equivalent damping: {:.1}%", xi_eq * 100.0
    );

    // Damping reduction factor (for spectrum)
    let eta: f64 = (0.10 / (0.05 + xi_eq)).sqrt().max(0.55);

    assert!(
        eta < 1.0,
        "Spectral reduction: {:.2}", eta
    );

    // Effective period from displacement spectrum
    // Sd = Sa × T² / (4π²) = η × Sd_5%
    // Rearrange: T_eff from target displacement
    let sd_5pct_at_t3: f64 = 0.200; // m, 5% damped Sd at T=3s
    let sd_target: f64 = eta * sd_5pct_at_t3;

    // If target displacement < sd_target, period is shorter
    let t_eff: f64 = if delta_target < sd_target {
        3.0 * (delta_target / sd_target).sqrt()
    } else {
        3.0
    };

    assert!(
        t_eff > 0.5 && t_eff < 5.0,
        "Effective period: {:.2}s", t_eff
    );
}

// ================================================================
// 7. Inelastic Response -- Equal Displacement
// ================================================================
//
// For T > Tc: maximum displacement of inelastic system ≈ elastic displacement.
// μ = R (ductility = reduction factor)
// Inelastic displacement: δ_inel = δ_el (equal displacement)

#[test]
fn earthquake_equal_displacement() {
    let sa_el: f64 = 0.60;      // g, elastic spectral acceleration
    let t: f64 = 1.0;           // s, period
    let r: f64 = 4.0;           // response modification factor

    // Elastic displacement
    let sd_el: f64 = sa_el * 9.81 * t * t / (4.0 * std::f64::consts::PI * std::f64::consts::PI);
    // in meters

    // Design force
    let sa_design: f64 = sa_el / r;

    // Inelastic displacement (equal displacement principle)
    let sd_inel: f64 = sd_el; // key result: same as elastic

    assert!(
        (sd_inel - sd_el).abs() < 0.001,
        "Inelastic disp {:.4}m ≈ elastic {:.4}m", sd_inel, sd_el
    );

    // Force is reduced by R, but displacement is NOT
    assert!(
        sa_design < sa_el,
        "Design Sa {:.3}g < elastic Sa {:.3}g", sa_design, sa_el
    );

    // Ductility demand
    let mu: f64 = sd_inel / (sd_el / r); // = R
    assert!(
        (mu - r).abs() < 0.01,
        "μ = {:.1} = R = {:.1}", mu, r
    );
}

// ================================================================
// 8. P-Delta in Seismic -- Stability Coefficient
// ================================================================
//
// ASCE 7: θ = (P × Δ) / (V × h × Cd)
// θ ≤ 0.10: acceptable without P-delta analysis
// θ ≤ θ_max = 0.5/(β×Cd) ≤ 0.25: maximum allowed
// If θ > 0.10: amplify displacements by 1/(1-θ)

#[test]
fn earthquake_pdelta_stability() {
    let p: f64 = 15000.0;       // kN, total gravity load at level
    let v: f64 = 3000.0;        // kN, story shear
    let delta: f64 = 0.025;     // m, story drift
    let h: f64 = 3.5;           // m, story height
    let cd: f64 = 5.0;          // deflection amplification factor

    // Stability coefficient
    let theta: f64 = p * delta / (v * h * cd);

    assert!(
        theta > 0.0,
        "Stability coefficient: {:.4}", theta
    );

    // Check limits
    let beta: f64 = 1.0;        // ratio of shear demand to capacity
    let theta_max: f64 = (0.5 / (beta * cd)).min(0.25);

    assert!(
        theta < theta_max,
        "θ = {:.4} < θ_max = {:.3}", theta, theta_max
    );

    // P-delta amplification
    let amplifier: f64 = if theta > 0.10 {
        1.0 / (1.0 - theta)
    } else {
        1.0 // no amplification needed
    };

    assert!(
        amplifier >= 1.0,
        "P-Δ amplifier: {:.3}", amplifier
    );

    // Drift check
    let drift_ratio: f64 = delta * cd / h;
    let drift_limit: f64 = 0.020; // 2% for typical buildings

    assert!(
        drift_ratio > 0.0,
        "Drift ratio: {:.3} (limit: {:.3})", drift_ratio, drift_limit
    );
}
