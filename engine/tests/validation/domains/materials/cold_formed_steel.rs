/// Validation: Cold-Formed Steel Design
///
/// References:
///   - AISI S100-16: North American Specification for Cold-Formed Steel
///   - EN 1993-1-3:2006 (EC3-1-3): Cold-formed members and sheeting
///   - Yu & LaBoube: "Cold-Formed Steel Design" 5th ed. (2020)
///   - Hancock: "Cold-Formed Steel Structures to AS/NZS 4600" (2007)
///   - Schafer: "Direct Strength Method Design Guide" (2006)
///
/// Tests verify effective width, distortional buckling, direct strength,
/// and connection design for thin-walled steel members.

// ================================================================
// 1. Effective Width — Winter's Formula (AISI / EC3-1-3)
// ================================================================
//
// Effective width: be = b * ρ
// ρ = (1 - 0.22/λ) / λ for λ > 0.673
// ρ = 1.0 for λ ≤ 0.673
// λ = √(fy/fcr) = (b/t) / (1.052*√(k)) * √(fy/E)

#[test]
fn cfs_effective_width_winter() {
    let b: f64 = 100.0;     // mm, flat width
    let t: f64 = 1.5;       // mm, thickness
    let fy: f64 = 350.0;    // MPa, yield stress
    let e: f64 = 203_000.0; // MPa
    let k: f64 = 4.0;       // buckling coefficient (SS edges)

    // Slenderness ratio
    let lambda: f64 = (b / t) / (1.052 * k.sqrt()) * (fy / e).sqrt();
    // = 66.67 / (1.052 * 2.0) * sqrt(350/203000)
    // = 66.67 / 2.104 * 0.04152
    // = 31.69 * 0.04152 = 1.316

    assert!(
        lambda > 0.673,
        "λ = {:.3} > 0.673 — width reduction needed", lambda
    );

    // Effective width ratio
    let rho: f64 = (1.0 - 0.22 / lambda) / lambda;
    // = (1 - 0.167) / 1.316 = 0.833 / 1.316 = 0.633

    assert!(
        rho > 0.0 && rho < 1.0,
        "ρ = {:.3}", rho
    );

    // Effective width
    let be: f64 = b * rho;
    assert!(
        be < b,
        "Effective width {:.1}mm < full width {:.0}mm", be, b
    );

    // For thicker plate (t=3mm): λ decreases, ρ increases
    let t_thick: f64 = 3.0;
    let lambda_thick: f64 = (b / t_thick) / (1.052 * k.sqrt()) * (fy / e).sqrt();
    assert!(
        lambda_thick < lambda,
        "Thicker plate: λ={:.3} < {:.3}", lambda_thick, lambda
    );
}

// ================================================================
// 2. Distortional Buckling (AISI S100 / DSM)
// ================================================================
//
// Critical distortional stress:
// fcrd = k_d * (π²E)/(12(1-ν²)) * (t/b_o)²
// where k_d depends on cross-section geometry

#[test]
fn cfs_distortional_buckling() {
    let e: f64 = 203_000.0;  // MPa
    let nu: f64 = 0.3;
    let t: f64 = 1.2;        // mm
    let b_o: f64 = 60.0;     // mm, flange width
    let k_d: f64 = 0.85;     // distortional buckling coefficient (C-section)

    // Critical distortional stress
    let fcrd: f64 = k_d * std::f64::consts::PI * std::f64::consts::PI * e
        / (12.0 * (1.0 - nu * nu)) * (t / b_o) * (t / b_o);

    // = 0.85 * 9.8696 * 203000 / (12*0.91) * (0.02)²
    // = 0.85 * 2003640 / 10.92 * 0.0004
    // = 0.85 * 183480 * 0.0004 = 62.4 MPa

    assert!(
        fcrd > 0.0 && fcrd < 500.0,
        "Distortional buckling stress: {:.1} MPa", fcrd
    );

    // Compare to yield stress
    let fy: f64 = 350.0;
    let lambda_d: f64 = (fy / fcrd).sqrt();

    // If λd > 0.561, distortional buckling controls
    if lambda_d > 0.561 {
        let rho_d: f64 = (1.0 - 0.25 * (fcrd / fy).powf(0.6)) * (fcrd / fy).powf(0.6);
        assert!(
            rho_d > 0.0 && rho_d < 1.0,
            "Distortional reduction: {:.3}", rho_d
        );
    }
}

// ================================================================
// 3. Direct Strength Method (DSM) — Beam
// ================================================================
//
// DSM nominal moment:
// For local: Mnl = min(My, My*(1 - 0.15*(Mcrl/My)^0.4)*(Mcrl/My)^0.4)
// For distortional: Mnd = My*(1 - 0.22*(Mcrd/My)^0.5)*(Mcrd/My)^0.5

#[test]
fn cfs_dsm_beam() {
    let fy: f64 = 350.0;      // MPa
    let s_f: f64 = 15000.0;   // mm³, full section modulus
    let my: f64 = fy * s_f / 1e6; // kN·m = 5.25

    // Local buckling ratio
    let mcrl: f64 = 0.75 * my;  // local buckling moment (from analysis)
    let lambda_l: f64 = (my / mcrl).sqrt();
    // = sqrt(1/0.75) = 1.155

    // DSM local buckling nominal moment
    let mnl: f64 = if lambda_l <= 0.776 {
        my
    } else {
        let ratio: f64 = mcrl / my;
        my * (1.0 - 0.15 * ratio.powf(0.4)) * ratio.powf(0.4)
    };

    assert!(
        mnl <= my,
        "Mnl = {:.3} ≤ My = {:.3} kN·m", mnl, my
    );

    // Distortional buckling
    let mcrd: f64 = 0.60 * my;
    let lambda_d: f64 = (my / mcrd).sqrt();
    // = sqrt(1/0.60) = 1.291

    let mnd: f64 = if lambda_d <= 0.673 {
        my
    } else {
        let ratio: f64 = mcrd / my;
        my * (1.0 - 0.22 * ratio.powf(0.5)) * ratio.powf(0.5)
    };

    assert!(
        mnd <= my,
        "Mnd = {:.3} ≤ My = {:.3} kN·m", mnd, my
    );

    // Nominal capacity = min of all modes
    let mn: f64 = mnl.min(mnd);
    let mn_ratio: f64 = mn / my;
    assert!(
        mn_ratio > 0.3 && mn_ratio < 1.0,
        "Mn/My = {:.3}", mn_ratio
    );
}

// ================================================================
// 4. CFS Connection — Screw Capacity (AISI S100)
// ================================================================
//
// Screw shear: Pss = 0.5 * d² * Fxx (in tension)
// Bearing/tilting: depends on t1/t2 ratio
// For t2/t1 ≤ 1.0: Pns = 4.2*(t2³*d)^0.5 * Fu2

#[test]
fn cfs_screw_connection() {
    let d_screw: f64 = 5.5;     // mm, screw diameter (#12)
    let t1: f64 = 1.0;          // mm, top sheet thickness
    let t2: f64 = 1.5;          // mm, bottom sheet
    let fu1: f64 = 450.0;       // MPa, top sheet ultimate
    let fu2: f64 = 450.0;       // MPa, bottom sheet ultimate

    // Screw bearing (t2/t1 ratio)
    let ratio: f64 = t2 / t1;
    assert!((ratio - 1.5).abs() < 0.01, "t2/t1 = {:.1}", ratio);

    // For 1.0 < t2/t1 ≤ 2.5 (Case II):
    // Pns = min of:
    // (a) 4.2*(t2³*d)^0.5 * Fu2  → bearing
    // (b) 2.7*t1*d*Fu1            → tilting
    // (c) 2.7*t2*d*Fu2            → bearing of bottom

    let pns_a: f64 = 4.2 * (t2.powi(3) * d_screw).sqrt() * fu2 / 1000.0; // kN
    let pns_b: f64 = 2.7 * t1 * d_screw * fu1 / 1000.0;
    let pns_c: f64 = 2.7 * t2 * d_screw * fu2 / 1000.0;

    let pns: f64 = pns_a.min(pns_b).min(pns_c);

    assert!(
        pns > 0.5 && pns < 20.0,
        "Screw capacity: {:.2} kN (min of {:.2}, {:.2}, {:.2})",
        pns, pns_a, pns_b, pns_c
    );

    // Tilting often controls for thin sheets
    assert!(
        pns_b <= pns_c || pns_a <= pns_b,
        "Thinner sheet or bearing controls"
    );
}

// ================================================================
// 5. EC3-1-3 — Lip Stiffener Effectiveness
// ================================================================
//
// For an edge stiffener (lip), the effective area depends on
// the spring stiffness from the flange and the lip geometry.
// Lip must be c ≥ 0.2*b (flange width) for full effectiveness.

#[test]
fn cfs_lip_stiffener() {
    let b: f64 = 80.0;    // mm, flange width
    let c: f64 = 20.0;    // mm, lip depth

    // Lip/flange ratio
    let lip_ratio: f64 = c / b;
    let lip_ratio_expected: f64 = 0.25;

    assert!(
        (lip_ratio - lip_ratio_expected).abs() < 0.01,
        "Lip ratio c/b = {:.2}, expected {:.2}", lip_ratio, lip_ratio_expected
    );

    // Minimum lip for full stiffening: c ≥ 0.2*b
    let c_min: f64 = 0.2 * b;
    assert!(
        c >= c_min,
        "Lip {:.0}mm ≥ minimum {:.0}mm — fully effective", c, c_min
    );

    // Maximum lip (avoid local buckling of lip): c ≤ 0.6*b
    let c_max: f64 = 0.6 * b;
    assert!(
        c <= c_max,
        "Lip {:.0}mm ≤ maximum {:.0}mm", c, c_max
    );

    // Reduced effectiveness for short lips (c < 0.2b)
    let c_short: f64 = 10.0;
    let eta: f64 = if c_short >= c_min { 1.0 } else { c_short / c_min };
    assert!(
        eta < 1.0,
        "Short lip effectiveness: {:.3}", eta
    );
}

// ================================================================
// 6. CFS Column — Flexural-Torsional Buckling
// ================================================================
//
// Thin-walled open sections are susceptible to FT buckling.
// σ_FT from: (σ_FT - σ_ex)(σ_FT - σ_t) - σ_FT²*(x₀/r₀)² = 0
// For singly-symmetric: interaction of flexural and torsional modes.

#[test]
fn cfs_flexural_torsional_buckling() {
    let _sigma_ex: f64 = 800.0; // MPa, Euler stress (strong axis)
    let sigma_ey: f64 = 200.0;  // MPa, Euler stress (weak axis)
    let sigma_t: f64 = 250.0;   // MPa, torsional buckling stress
    let x0: f64 = 30.0;         // mm, shear center offset
    let r0: f64 = 60.0;         // mm, polar radius of gyration

    // For doubly-symmetric: FT = min(σ_ex, σ_ey, σ_t)
    // For singly-symmetric (about x): FT from quadratic
    let beta: f64 = 1.0 - (x0 / r0).powi(2);
    // = 1 - (30/60)² = 1 - 0.25 = 0.75

    // Quadratic: σ_FT = 1/(2β) * [(σ_ey + σ_t) - sqrt((σ_ey+σ_t)² - 4β*σ_ey*σ_t)]
    let sum_st: f64 = sigma_ey + sigma_t;
    let discriminant: f64 = sum_st * sum_st - 4.0 * beta * sigma_ey * sigma_t;
    let sigma_ft: f64 = (sum_st - discriminant.sqrt()) / (2.0 * beta);

    // = (450 - sqrt(202500 - 150000)) / 1.5
    // = (450 - sqrt(52500)) / 1.5
    // = (450 - 229.1) / 1.5
    // = 220.9 / 1.5 = 147.3 MPa

    assert!(
        sigma_ft > 0.0 && sigma_ft < sigma_ey.min(sigma_t),
        "FT stress: {:.1} MPa (less than both σ_ey and σ_t)", sigma_ft
    );

    // FT buckling reduces capacity below simple Euler (weak axis)
    assert!(
        sigma_ft < sigma_ey,
        "FT {:.1} < Euler weak {:.1} — FT controls", sigma_ft, sigma_ey
    );
}

// ================================================================
// 7. CFS Purlin Design — Gravity + Uplift
// ================================================================
//
// Purlins must resist both gravity (downward) and wind uplift.
// Uplift is critical: top flange in compression, unbraced.
// Through-fastened correction factor R applies.

#[test]
fn cfs_purlin_design() {
    let fy: f64 = 350.0;      // MPa
    let s_f: f64 = 25000.0;   // mm³, full section modulus
    let my: f64 = fy * s_f / 1e6; // kN·m = 8.75

    // Gravity loading: top flange braced by deck
    let r_gravity: f64 = 1.0; // full capacity
    let mn_gravity: f64 = r_gravity * my;

    // Uplift loading: bottom flange braced, top in compression
    // Through-fastened R factor (AISI S100 Table C3.1.4-1)
    let r_uplift: f64 = 0.70; // typical for simple span Z-purlin

    let mn_uplift: f64 = r_uplift * my;

    assert!(
        mn_uplift < mn_gravity,
        "Uplift capacity {:.2} < gravity {:.2} kN·m", mn_uplift, mn_gravity
    );

    // Reduction ratio
    let reduction: f64 = mn_uplift / mn_gravity;
    assert!(
        (reduction - r_uplift).abs() < 0.01,
        "Capacity ratio: {:.2}", reduction
    );

    // Required moment for UDL: M = wL²/8
    let l: f64 = 6.0; // m, purlin span
    let w_uplift: f64 = 8.0 * mn_uplift / (l * l); // max UDL capacity
    assert!(
        w_uplift > 0.5,
        "Max uplift UDL: {:.2} kN/m", w_uplift
    );
}

// ================================================================
// 8. CFS Wall Stud — Axial + Bending Interaction
// ================================================================
//
// Combined axial + bending: P/Pa + M/Ma ≤ 1.0 (ASD)
// or LRFD: Pu/(φPn) + Mu/(φMn) ≤ 1.0

#[test]
fn cfs_wall_stud_interaction() {
    let phi_pn: f64 = 35.0;    // kN, design axial capacity
    let phi_mn: f64 = 3.5;     // kN·m, design moment capacity

    // Applied loads
    let pu: f64 = 20.0;        // kN, factored axial
    let mu: f64 = 1.5;         // kN·m, factored moment (wind)

    // Interaction check
    let interaction: f64 = pu / phi_pn + mu / phi_mn;
    // = 20/35 + 1.5/3.5 = 0.571 + 0.429 = 1.000

    assert!(
        interaction <= 1.01, // allow small rounding
        "Interaction: {:.3} ≤ 1.0", interaction
    );

    // For AISC-style interaction (with Cm):
    let cm: f64 = 0.85;
    let pe: f64 = 80.0; // kN, Euler buckling
    let amplified_mu: f64 = cm * mu / (1.0 - pu / pe);
    // = 0.85 * 1.5 / (1 - 0.25) = 1.275 / 0.75 = 1.70 kN·m

    let interaction_amplified: f64 = pu / phi_pn + amplified_mu / phi_mn;
    assert!(
        interaction_amplified > interaction,
        "Amplified interaction: {:.3} > simple {:.3}", interaction_amplified, interaction
    );
}
