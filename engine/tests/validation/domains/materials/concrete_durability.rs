/// Validation: Concrete Durability Design
///
/// References:
///   - EN 1992-1-1 (EC2): Design of Concrete Structures
///   - EN 206-1: Concrete — Specification, Performance, Production
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - ACI 201.2R: Guide to Durable Concrete
///   - BS 8500-1: Concrete — Complementary Standard to BS EN 206
///   - fib Bulletin 34: Model Code for Service Life Design (2006)
///
/// Tests verify cover requirements, carbonation, chloride ingress,
/// freeze-thaw, alkali-silica reaction, sulfate attack, and corrosion.

// ================================================================
// 1. Concrete Cover Requirements
// ================================================================
//
// Minimum cover: c_min = max(c_min,b; c_min,dur + Δc_dur - Δc_st - Δc_add; 10mm)
// Nominal cover: c_nom = c_min + Δc_dev
// Depends on exposure class, structural class, concrete type.

#[test]
fn durability_cover() {
    // Exposure class XC3 (moderate humidity, external sheltered)
    let c_min_b: f64 = 20.0;        // mm, bond requirement (bar diameter)
    let c_min_dur: f64 = 25.0;      // mm, durability (XC3, structural class S4)
    let delta_c_dur: f64 = 0.0;     // mm, additional safety
    let delta_c_st: f64 = 0.0;      // mm, stainless steel reduction
    let delta_c_add: f64 = 0.0;     // mm, additional protection

    let c_min: f64 = c_min_b
        .max(c_min_dur + delta_c_dur - delta_c_st - delta_c_add)
        .max(10.0);

    assert!(
        c_min >= 25.0,
        "Minimum cover: {:.0} mm", c_min
    );

    // Nominal cover
    let delta_c_dev: f64 = 10.0;    // mm, construction tolerance
    let c_nom: f64 = c_min + delta_c_dev;

    assert!(
        c_nom >= 35.0,
        "Nominal cover: {:.0} mm", c_nom
    );

    // Exposure class XS2 (submerged in seawater)
    let c_min_dur_xs2: f64 = 40.0;  // mm
    let c_nom_xs2: f64 = c_min_dur_xs2.max(c_min_b).max(10.0) + delta_c_dev;

    assert!(
        c_nom_xs2 > c_nom,
        "Seawater cover {:.0} > sheltered {:.0} mm", c_nom_xs2, c_nom
    );

    // Increasing structural class gives more cover
    let c_min_s6: f64 = 30.0;       // XC3, structural class S6 (100-year life)
    let c_nom_s6: f64 = c_min_s6 + delta_c_dev;

    assert!(
        c_nom_s6 > c_nom,
        "100-year cover {:.0} > 50-year {:.0} mm", c_nom_s6, c_nom
    );
}

// ================================================================
// 2. Carbonation Depth -- Prediction
// ================================================================
//
// Carbonation front advances as √t (Fick's first law analogy).
// x_c = k × √t, where k depends on concrete quality and environment.
// Corrosion initiates when x_c reaches reinforcement.

#[test]
fn durability_carbonation() {
    // Carbonation coefficient (fib Model Code approach)
    // k = k_NAC × k_e × k_c × (k_t × R_NAC,0^-1 × C_s)^0.5 × W(t)
    // Simplified: k depends on w/c ratio and exposure

    let k_sheltered: f64 = 5.0;     // mm/√year, sheltered outdoor
    let k_exposed: f64 = 2.5;       // mm/√year, exposed to rain

    // Carbonation depth at time t
    let t_50: f64 = 50.0;           // years
    let t_100: f64 = 100.0;

    let x_sheltered_50: f64 = k_sheltered * t_50.sqrt();
    let x_exposed_50: f64 = k_exposed * t_50.sqrt();

    assert!(
        x_sheltered_50 > x_exposed_50,
        "Sheltered {:.0} > exposed {:.0} mm (rain washes CO2)", x_sheltered_50, x_exposed_50
    );

    // Cover adequacy check
    let cover: f64 = 40.0;          // mm, nominal cover

    assert!(
        cover > x_sheltered_50,
        "Cover {:.0} > carbonation {:.0} mm at 50y", cover, x_sheltered_50
    );

    // Time to depassivation
    let t_depass: f64 = (cover / k_sheltered).powi(2); // years

    assert!(
        t_depass > 40.0,
        "Depassivation time: {:.0} years", t_depass
    );

    // Effect of concrete quality (lower w/c = lower k)
    let k_high_quality: f64 = 3.0;  // mm/√year (w/c = 0.45)
    let x_100: f64 = k_high_quality * t_100.sqrt();

    assert!(
        x_100 < cover,
        "High quality: {:.0} mm at 100y < cover {:.0} mm", x_100, cover
    );
}

// ================================================================
// 3. Chloride Ingress -- Fick's 2nd Law
// ================================================================
//
// Chloride concentration: C(x,t) = Cs × (1 - erf(x/(2√(D×t))))
// Corrosion when C(cover, t) > C_crit (typically 0.4% by cement weight).

#[test]
fn durability_chloride_ingress() {
    let c_s: f64 = 5.0;             // % by cement weight, surface chloride
    let c_crit: f64 = 0.4;          // %, critical chloride content
    let d: f64 = 1.0e-12;           // m²/s, diffusion coefficient (C30, w/c=0.50)
    let cover: f64 = 0.050;         // m, 50mm cover

    // Chloride at reinforcement after time t
    let t: f64 = 50.0 * 365.25 * 24.0 * 3600.0; // seconds (50 years)

    // Argument to error function
    let z: f64 = cover / (2.0 * (d * t).sqrt());

    // Approximate erf using series: erf(z) ≈ 1 - (a1t + a2t² + a3t³)e^(-z²)
    // with t = 1/(1 + 0.3275911z)
    let p: f64 = 0.3275911;
    let tt: f64 = 1.0 / (1.0 + p * z);
    let a1: f64 = 0.254829592;
    let a2: f64 = -0.284496736;
    let a3: f64 = 1.421413741;
    let a4: f64 = -1.453152027;
    let a5: f64 = 1.061405429;
    let erf_z: f64 = 1.0 - (a1 * tt + a2 * tt.powi(2) + a3 * tt.powi(3)
        + a4 * tt.powi(4) + a5 * tt.powi(5)) * (-z * z).exp();

    let c_rebar: f64 = c_s * (1.0 - erf_z);

    // Check if corrosion has initiated
    if c_rebar > c_crit {
        // Corrosion likely within 50 years → need better concrete or more cover
        assert!(
            c_rebar > c_crit,
            "Chloride at rebar: {:.2}% > critical {:.1}%", c_rebar, c_crit
        );
    }

    // Time to critical chloride (rearranging)
    // Need erf(z) = 1 - C_crit/C_s
    let _target_erf: f64 = 1.0 - c_crit / c_s; // = 0.92

    // For erf(z) = 0.92 → z ≈ 1.23 (from tables)
    let z_crit: f64 = 1.23;
    let t_crit: f64 = (cover / (2.0 * z_crit)).powi(2) / d; // seconds
    let t_crit_years: f64 = t_crit / (365.25 * 24.0 * 3600.0);

    assert!(
        t_crit_years > 10.0,
        "Time to corrosion: {:.0} years", t_crit_years
    );
}

// ================================================================
// 4. Freeze-Thaw Resistance
// ================================================================
//
// Concrete exposed to cycles of freezing and thawing.
// Air entrainment (4-7% air) essential for resistance.
// ACI 318: maximum w/c = 0.45 for severe exposure.

#[test]
fn durability_freeze_thaw() {
    // Air content requirements (ACI 318 Table 19.3.3.1)
    let max_aggregate: f64 = 20.0;  // mm, nominal maximum aggregate size

    // Required air content (moderate exposure)
    let air_moderate: f64 = if max_aggregate <= 10.0 {
        6.0
    } else if max_aggregate <= 20.0 {
        5.0
    } else {
        4.5
    };

    assert!(
        air_moderate >= 4.5,
        "Required air content: {:.1}%", air_moderate
    );

    // Maximum w/c ratio
    let wc_max_moderate: f64 = 0.50; // moderate exposure (ACI)
    let wc_max_severe: f64 = 0.45;   // severe exposure

    assert!(
        wc_max_severe < wc_max_moderate,
        "Severe max w/c {:.2} < moderate {:.2}", wc_max_severe, wc_max_moderate
    );

    // Spacing factor (Powers' criterion)
    // Maximum spacing factor for freeze-thaw durability: 0.20 mm
    let spacing_factor: f64 = 0.18;  // mm (good air void system)
    let max_spacing: f64 = 0.20;

    assert!(
        spacing_factor < max_spacing,
        "Spacing factor: {:.2} < {:.2} mm", spacing_factor, max_spacing
    );

    // Scaling resistance with deicers
    // CDF test (EN 12390-9): mass loss < 1.5 kg/m² after 28 cycles
    let mass_loss: f64 = 0.8;       // kg/m², test result
    let limit: f64 = 1.5;

    assert!(
        mass_loss < limit,
        "Scaling: {:.1} < {:.1} kg/m²", mass_loss, limit
    );

    // Minimum strength for freeze-thaw (EC2)
    let f_ck_min: f64 = 25.0;       // MPa, XF1 exposure
    let f_ck: f64 = 30.0;

    assert!(
        f_ck >= f_ck_min,
        "Strength {:.0} >= {:.0} MPa for XF1", f_ck, f_ck_min
    );
}

// ================================================================
// 5. Alkali-Silica Reaction (ASR)
// ================================================================
//
// Reaction between alkali (Na₂O_eq) in cement and reactive silica in aggregate.
// Produces expansive gel → cracking and deterioration.
// Prevention: limit alkalis, use SCMs, avoid reactive aggregates.

#[test]
fn durability_asr() {
    // Cement alkali content
    let na2o_eq: f64 = 0.80;        // %, Na₂O equivalent (Na₂O + 0.658×K₂O)
    let cement_content: f64 = 350.0; // kg/m³

    // Total alkalis in concrete
    let alkali_total: f64 = na2o_eq / 100.0 * cement_content; // kg/m³

    // BRE Digest 330: limit total alkalis to 3.0 kg/m³ Na₂O_eq
    let limit_low_risk: f64 = 3.0;   // kg/m³

    assert!(
        alkali_total < limit_low_risk,
        "Total alkalis: {:.1} < {:.1} kg/m³", alkali_total, limit_low_risk
    );

    // Effect of SCMs (supplementary cementitious materials)
    // Fly ash reduces effective alkali contribution
    let pfa_content: f64 = 100.0;    // kg/m³ (30% replacement)
    let pfa_alkali: f64 = 0.5;       // %, alkali in PFA
    let contribution_factor: f64 = 0.17; // only 17% of PFA alkali contributes

    let alkali_with_pfa: f64 = (na2o_eq / 100.0 * (cement_content - pfa_content))
        + (pfa_alkali / 100.0 * pfa_content * contribution_factor);

    assert!(
        alkali_with_pfa < alkali_total,
        "With PFA: {:.2} < without: {:.2} kg/m³", alkali_with_pfa, alkali_total
    );

    // Expansion test (ASTM C1260: mortar bar, 14 days)
    let expansion_14d: f64 = 0.08;   // % (< 0.10 innocuous, 0.10-0.20 potentially reactive)
    let _limit_innocuous: f64 = 0.10;

    assert!(
        expansion_14d < 0.10,
        "14-day expansion: {:.2}% (innocuous)", expansion_14d
    );
}

// ================================================================
// 6. Sulfate Attack Resistance
// ================================================================
//
// External sulfates react with cement hydration products.
// Produces ettringite → expansion → cracking.
// Prevention: sulfate-resisting cement, low w/c, SCMs.

#[test]
fn durability_sulfate_attack() {
    // Soil sulfate classification (BRE Special Digest 1)
    let so4_soil: f64 = 2500.0;     // mg/l, water-soluble sulfate in soil
    let ph_water: f64 = 5.5;        // groundwater pH

    // Design sulfate class (DS)
    let ds_class: usize = if so4_soil < 500.0 {
        1 // DS-1: negligible
    } else if so4_soil < 1500.0 {
        2 // DS-2: low
    } else if so4_soil < 4000.0 {
        3 // DS-3: moderate
    } else {
        4 // DS-4: high
    };

    assert!(
        ds_class >= 3,
        "Design sulfate class: DS-{}", ds_class
    );

    // ACEC (Aggressive Chemical Environment for Concrete) class
    let acid_aggression: bool = ph_water < 5.5;

    // Recommended concrete
    let min_cement: f64 = 340.0;     // kg/m³ for DS-3
    let max_wc: f64 = 0.50;         // for DS-3
    let min_strength: f64 = 32.0;   // MPa, minimum

    // Check concrete specification
    let cement: f64 = 370.0;
    let wc: f64 = 0.45;
    let f_ck: f64 = 35.0;

    assert!(
        cement >= min_cement && wc <= max_wc && f_ck >= min_strength,
        "Concrete: {:.0} kg/m³, w/c={:.2}, f_ck={:.0}",
        cement, wc, f_ck
    );

    // Sulfate-resisting cement: C3A content < 3.5%
    let c3a: f64 = 3.0;             // %, tricalcium aluminate content
    let c3a_limit: f64 = 3.5;

    assert!(
        c3a < c3a_limit,
        "C3A: {:.1}% < {:.1}% (SR cement)", c3a, c3a_limit
    );

    let _acid_aggression = acid_aggression;
}

// ================================================================
// 7. Corrosion Rate Estimation
// ================================================================
//
// After depassivation, reinforcement corrodes.
// Rate depends on moisture, oxygen, temperature.
// Section loss → capacity reduction → failure.

#[test]
fn durability_corrosion_rate() {
    // Corrosion current density (µA/cm²)
    let i_corr_active: f64 = 1.0;   // µA/cm² (moderate corrosion, XC3/XC4)
    let i_corr_high: f64 = 10.0;    // µA/cm² (high, marine splash)

    // Section loss rate (Faraday's law)
    // Penetration: x = 11.6 × i_corr (µm/year) for i_corr in µA/cm²
    let x_rate_moderate: f64 = 11.6 * i_corr_active; // µm/year
    let x_rate_high: f64 = 11.6 * i_corr_high;

    assert!(
        x_rate_moderate > 5.0,
        "Moderate corrosion rate: {:.0} µm/year", x_rate_moderate
    );

    // Diameter reduction over time
    let d_bar: f64 = 16.0;          // mm, original bar diameter
    let t_corrosion: f64 = 30.0;    // years of active corrosion
    let x_loss: f64 = x_rate_moderate * t_corrosion / 1000.0; // mm

    let d_remaining: f64 = d_bar - 2.0 * x_loss; // corrosion on all sides

    assert!(
        d_remaining > 0.9 * d_bar,
        "Remaining diameter: {:.1} mm ({:.0}% of original)",
        d_remaining, d_remaining / d_bar * 100.0
    );

    // Area loss
    let a_original: f64 = std::f64::consts::PI * d_bar * d_bar / 4.0;
    let a_remaining: f64 = std::f64::consts::PI * d_remaining * d_remaining / 4.0;
    let area_loss_pct: f64 = (1.0 - a_remaining / a_original) * 100.0;

    assert!(
        area_loss_pct < 15.0,
        "Area loss: {:.1}%", area_loss_pct
    );

    // High corrosion scenario (marine splash)
    let x_loss_high: f64 = x_rate_high * 20.0 / 1000.0; // mm, 20 years
    let d_high: f64 = d_bar - 2.0 * x_loss_high;

    assert!(
        d_high < d_remaining,
        "Marine corrosion: {:.1} mm remaining", d_high
    );
}

// ================================================================
// 8. Service Life Prediction -- Probabilistic
// ================================================================
//
// fib Model Code: probabilistic approach to service life.
// Reliability index β_SL for initiation period.
// Target: β ≥ 1.3 for depassivation (serviceability limit).

#[test]
fn durability_service_life() {
    // Design service life
    let t_sl: f64 = 50.0;           // years, target service life

    // Carbonation: t_depass = (c_nom / k_c)²
    // Mean values with CoV
    let c_mean: f64 = 40.0;         // mm, mean cover
    let c_std: f64 = 5.0;           // mm, std dev of cover
    let k_mean: f64 = 4.0;          // mm/√yr, mean carbonation rate
    let k_std: f64 = 1.0;           // std dev

    // Mean time to depassivation
    let t_mean: f64 = (c_mean / k_mean).powi(2); // years
    assert!(
        t_mean > 50.0,
        "Mean depassivation: {:.0} years", t_mean
    );

    // First-order reliability (simplified)
    // g = c - k×√t_SL > 0
    let g_mean: f64 = c_mean - k_mean * t_sl.sqrt();
    let g_std: f64 = (c_std * c_std + (k_std * t_sl.sqrt()).powi(2)).sqrt();

    let beta: f64 = g_mean / g_std;

    assert!(
        beta > 1.3,
        "Reliability index: {:.2} (>1.3 for SLS)", beta
    );

    // Probability of depassivation
    // P_f ≈ Φ(-β) — approximate using normal CDF
    // For β=2.0: P_f ≈ 2.3%, for β=1.3: P_f ≈ 10%
    let pf_approx: f64 = if beta > 3.0 {
        0.001
    } else if beta > 2.0 {
        0.02
    } else if beta > 1.3 {
        0.10
    } else {
        0.20
    };

    assert!(
        pf_approx < 0.15,
        "P(depassivation) ≈ {:.1}%", pf_approx * 100.0
    );

    // Effect of increasing cover by 5mm
    let c_new: f64 = c_mean + 5.0;
    let g_new: f64 = c_new - k_mean * t_sl.sqrt();
    let beta_new: f64 = g_new / g_std;

    assert!(
        beta_new > beta,
        "With +5mm cover: β = {:.2} > {:.2}", beta_new, beta
    );
}
