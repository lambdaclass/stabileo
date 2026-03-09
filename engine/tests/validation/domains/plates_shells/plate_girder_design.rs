/// Validation: Steel Plate Girder Design
///
/// References:
///   - AISC 360-22 Chapter G: Design of Members for Shear
///   - EN 1993-1-5: Plated Structural Elements
///   - Basler (1961): "Strength of Plate Girders in Shear"
///   - Höglund (1997): Shear buckling resistance of steel plate girders
///   - Salmon, Johnson & Malhas: "Steel Structures" 5th ed.
///   - Galambos & Surovek: "Structural Stability of Steel" (2008)
///
/// Tests verify web shear buckling, tension field action,
/// stiffener design, and flange local buckling.

// ================================================================
// 1. Web Shear Buckling — Elastic Critical Stress
// ================================================================
//
// τ_cr = k_v * π² * E / (12*(1-ν²)) * (t_w/h)²
// k_v depends on aspect ratio a/h and boundary conditions:
// k_v = 5.34 + 4/(a/h)² for a/h ≥ 1 (simply supported edges)
// k_v = 5.34*(a/h)² + 4 for a/h < 1 (not typical for girders)

#[test]
fn girder_web_shear_buckling() {
    let e: f64 = 200_000.0;     // MPa
    let nu: f64 = 0.3;
    let tw: f64 = 12.0;         // mm, web thickness
    let h: f64 = 1500.0;        // mm, web depth
    let a: f64 = 2000.0;        // mm, stiffener spacing

    let aspect: f64 = a / h; // = 1.333

    // Buckling coefficient
    let aspect_sq: f64 = aspect * aspect;
    let kv: f64 = 5.34 + 4.0 / aspect_sq;

    let kv_expected: f64 = 5.34 + 4.0 / (1.333 * 1.333);

    assert!(
        (kv - kv_expected).abs() / kv_expected < 0.01,
        "k_v = {:.3}, expected {:.3}", kv, kv_expected
    );

    // Critical shear stress
    let ratio: f64 = tw / h;
    let ratio_sq: f64 = ratio * ratio;
    let tau_cr: f64 = kv * std::f64::consts::PI.powi(2) * e / (12.0 * (1.0 - nu * nu)) * ratio_sq;

    // Should be less than yield shear stress (τ_y ≈ 0.6*F_y ≈ 210 MPa for 350 MPa steel)
    // This determines if web buckles before yielding
    let tau_y: f64 = 0.6 * 350.0; // MPa

    // Web slenderness λ_w = sqrt(τ_y / τ_cr)
    let lambda_w: f64 = (tau_y / tau_cr).sqrt();

    // For slender webs: λ_w > 1.0 → post-buckling strength needed
    assert!(
        tau_cr > 0.0,
        "τ_cr = {:.1} MPa", tau_cr
    );

    // Check: h/tw ratio
    let hw_tw: f64 = h / tw; // = 125
    assert!(
        hw_tw > 100.0,
        "h/tw = {:.0} — slender web, stiffeners needed", hw_tw
    );

    // Verify kv > 5.34 (stiffened web has higher buckling coefficient)
    assert!(
        kv > 5.34,
        "kv = {:.3} > 5.34 (unstiffened)", kv
    );

    // Store lambda_w for reference
    let _lambda_w = lambda_w;
}

// ================================================================
// 2. Tension Field Action — Basler Model
// ================================================================
//
// Post-buckling strength of thin webs via diagonal tension field.
// V_n = V_cr + V_tf
// V_tf = 0.5 * F_yw * t_w * h * (1 - τ_cr/τ_y) * sin(2θ)
// where θ ≈ angle of tension field

#[test]
fn girder_tension_field() {
    let fy: f64 = 350.0;        // MPa
    let tw: f64 = 10.0;         // mm
    let h: f64 = 1200.0;        // mm
    let tau_cr: f64 = 80.0;     // MPa, elastic buckling stress

    let tau_y: f64 = fy / 3.0_f64.sqrt(); // von Mises: τ_y = fy/√3
    // = 350/1.732 = 202 MPa

    // Pre-buckling shear capacity
    let v_cr: f64 = tau_cr * h * tw / 1000.0; // kN
    // = 80 * 1200 * 10 / 1000 = 960 kN

    // Post-buckling contribution (AISC simplified)
    // C_v1 = τ_cr / τ_y (ratio)
    let cv1: f64 = tau_cr / tau_y;

    // AISC: V_n = 0.6*Fy*Aw*(Cv1 + (1-Cv1)/(1.15*sqrt(1+(a/h)²)))
    let a_h: f64 = 1.5; // aspect ratio
    let aw: f64 = h * tw; // mm²
    let a_h_sq: f64 = a_h * a_h;

    let vn: f64 = 0.6 * fy * aw * (cv1 + (1.0 - cv1) / (1.15 * (1.0 + a_h_sq).sqrt())) / 1000.0;

    // Total should exceed pre-buckling
    assert!(
        vn > v_cr,
        "V_n = {:.0} kN > V_cr = {:.0} kN (tension field adds capacity)", vn, v_cr
    );

    // Tension field contribution
    let v_tf: f64 = vn - v_cr;
    let tf_fraction: f64 = v_tf / vn;
    assert!(
        tf_fraction > 0.1,
        "Tension field provides {:.1}% of total capacity", tf_fraction * 100.0
    );
}

// ================================================================
// 3. Transverse Stiffener Design
// ================================================================
//
// Intermediate stiffeners must provide rigidity and strength.
// AISC: I_st ≥ j * a * t_w³ where j depends on aspect ratio
// EN 1993-1-5: I_st ≥ 1.5 * h³ * t_w³ / a²

#[test]
fn girder_transverse_stiffener() {
    let h: f64 = 1500.0;       // mm
    let tw: f64 = 12.0;        // mm
    let a: f64 = 2000.0;       // mm, stiffener spacing

    // AISC requirement for moment of inertia
    let j: f64 = 2.5 / ((a / h).powi(2)) - 2.0;
    let j_min: f64 = j.max(0.5); // minimum j = 0.5

    let ist_min_aisc: f64 = j_min * a * tw.powi(3);

    // EN 1993-1-5 requirement
    let ist_min_ec3: f64 = 1.5 * h.powi(3) * tw.powi(3) / (a * a);

    // Both should be positive
    assert!(
        ist_min_aisc > 0.0,
        "AISC I_st,min = {:.0} mm⁴", ist_min_aisc
    );
    assert!(
        ist_min_ec3 > 0.0,
        "EC3 I_st,min = {:.0} mm⁴", ist_min_ec3
    );

    // Check a typical stiffener plate: 150mm × 16mm each side
    let bs: f64 = 150.0;       // mm, stiffener width
    let ts: f64 = 16.0;        // mm, stiffener thickness

    // I about web centerline (pair of stiffeners)
    let ist_provided: f64 = 2.0 * ts * bs.powi(3) / 12.0 + 2.0 * ts * bs * (bs / 2.0 + tw / 2.0).powi(2);

    assert!(
        ist_provided > ist_min_aisc.max(ist_min_ec3),
        "I_st = {:.0} mm⁴ > required", ist_provided
    );
}

// ================================================================
// 4. Flange Local Buckling (FLB)
// ================================================================
//
// bf/(2*tf) ≤ λ_pf for compact: 0.38*sqrt(E/Fy)
// bf/(2*tf) ≤ λ_rf for noncompact: 0.95*sqrt(k_c*E/F_L)

#[test]
fn girder_flange_local_buckling() {
    let bf: f64 = 400.0;       // mm, flange width
    let tf: f64 = 25.0;        // mm, flange thickness
    let e: f64 = 200_000.0;    // MPa
    let fy: f64 = 350.0;       // MPa

    let lambda_f: f64 = bf / (2.0 * tf); // = 8.0

    // Compact limit (AISC Table B4.1b)
    let lambda_pf: f64 = 0.38 * (e / fy).sqrt();
    // = 0.38 * sqrt(571.4) = 0.38 * 23.9 = 9.08

    // Noncompact limit
    let kc: f64 = 0.35; // typical for plate girders
    let fl: f64 = 0.7 * fy; // = 245 MPa
    let lambda_rf: f64 = 0.95 * (kc * e / fl).sqrt();

    // Classification
    let is_compact: bool = lambda_f <= lambda_pf;
    let is_noncompact: bool = lambda_f > lambda_pf && lambda_f <= lambda_rf;
    let _is_slender: bool = lambda_f > lambda_rf;

    assert!(
        is_compact || is_noncompact,
        "λf = {:.1}, λpf = {:.2}, λrf = {:.2}", lambda_f, lambda_pf, lambda_rf
    );

    // For compact flanges: Mn = Mp (full plastic moment)
    if is_compact {
        // Flange is compact — full plastic strength available
        assert!(
            lambda_f < lambda_pf,
            "Compact: {:.1} < {:.2}", lambda_f, lambda_pf
        );
    }
}

// ================================================================
// 5. Bearing Stiffener — Concentrated Load
// ================================================================
//
// Web crippling: Rn = 0.80*tw² * (1 + 3*(N/d)*(tw/tf)^1.5) * sqrt(E*Fy*tf/tw)
// Bearing stiffener: column analogy, effective cross-section includes
// 25*tw of web on each side of stiffener.

#[test]
fn girder_bearing_stiffener() {
    let tw: f64 = 12.0;        // mm
    let _tf: f64 = 25.0;       // mm
    let _d: f64 = 1550.0;      // mm, total depth
    let h: f64 = 1500.0;       // mm, web clear depth
    let e: f64 = 200_000.0;    // MPa
    let fy: f64 = 350.0;       // MPa

    // Bearing stiffener: 200mm × 25mm plates each side
    let bs: f64 = 200.0;       // mm, stiffener plate width
    let ts: f64 = 25.0;        // mm, stiffener plate thickness

    // Effective column section: stiffener + 25*tw web
    let web_effective: f64 = 25.0 * tw; // mm each side = 300mm
    let a_eff: f64 = 2.0 * bs * ts + 2.0 * web_effective * tw;
    // = 2*200*25 + 2*300*12 = 10000 + 7200 = 17200 mm²

    // Moment of inertia about web centerline
    let i_eff: f64 = 2.0 * ts * bs.powi(3) / 12.0
        + 2.0 * ts * bs * (bs / 2.0 + tw / 2.0).powi(2)
        + 2.0 * web_effective * tw.powi(3) / 12.0;

    let r: f64 = (i_eff / a_eff).sqrt(); // radius of gyration

    // Effective length = 0.75 * h (fixed-fixed column analogy)
    let kl: f64 = 0.75 * h;
    let slenderness: f64 = kl / r;

    // Euler stress
    let fe: f64 = std::f64::consts::PI.powi(2) * e / (slenderness * slenderness);

    // Column capacity (AISC Chapter E)
    let pn: f64 = if slenderness <= 4.71 * (e / fy).sqrt() {
        // Inelastic buckling
        let ratio_val: f64 = fy / fe;
        0.658_f64.powf(ratio_val) * fy * a_eff / 1000.0 // kN
    } else {
        0.877 * fe * a_eff / 1000.0 // kN
    };

    assert!(
        pn > 1000.0,
        "Bearing stiffener capacity: {:.0} kN", pn
    );

    // Stiffener should be non-slender: bs/ts ≤ 0.56*sqrt(E/Fy)
    let stiff_slenderness: f64 = bs / ts;
    let stiff_limit: f64 = 0.56 * (e / fy).sqrt();
    assert!(
        stiff_slenderness < stiff_limit,
        "bs/ts = {:.1} < {:.1} — compact stiffener", stiff_slenderness, stiff_limit
    );
}

// ================================================================
// 6. EN 1993-1-5 — Shear Resistance with Tension Field
// ================================================================
//
// V_bw,Rd = χ_w * f_yw * h_w * t_w / (√3 * γ_M1)
// χ_w depends on modified slenderness λ̄_w

#[test]
fn girder_ec3_shear_resistance() {
    let fyw: f64 = 355.0;      // MPa, web yield
    let hw: f64 = 1200.0;      // mm
    let tw: f64 = 10.0;        // mm
    let gamma_m1: f64 = 1.10;

    let a: f64 = 1800.0;       // mm
    let e: f64 = 210_000.0;    // MPa

    // Shear buckling coefficient
    let aspect_sq: f64 = (a / hw) * (a / hw);
    let k_tau: f64 = 5.34 + 4.0 / aspect_sq;

    // Euler shear stress
    let tau_cr: f64 = k_tau * std::f64::consts::PI.powi(2) * e / (12.0 * (1.0 - 0.3 * 0.3))
        * (tw / hw).powi(2);

    // Modified slenderness
    let lambda_w: f64 = 0.76 * (fyw / tau_cr).sqrt();

    // Reduction factor χ_w (EN 1993-1-5 Table 5.1)
    let chi_w: f64 = if lambda_w < 0.83 {
        1.0 // no reduction
    } else {
        0.83 / lambda_w // post-critical
    };

    // Shear resistance
    let vbw_rd: f64 = chi_w * fyw * hw * tw / (3.0_f64.sqrt() * gamma_m1) / 1000.0; // kN

    assert!(
        vbw_rd > 500.0,
        "V_bw,Rd = {:.0} kN", vbw_rd
    );

    // Verify chi_w ≤ 1.0
    assert!(
        chi_w <= 1.0 && chi_w > 0.0,
        "χ_w = {:.3}", chi_w
    );
}

// ================================================================
// 7. Proportioning Rules — Depth/Span and Aspect Ratios
// ================================================================
//
// Typical proportions for plate girders:
// L/d ≈ 10-15 for highway bridges
// a/h ≈ 1.0-3.0 for stiffener spacing
// h/tw ≤ 260 (AISC without stiffeners)

#[test]
fn girder_proportioning() {
    let l: f64 = 30.0;         // m, span
    let d: f64 = 2.0;          // m, total depth

    // L/d ratio
    let ld_ratio: f64 = l / d; // = 15
    assert!(
        ld_ratio >= 10.0 && ld_ratio <= 20.0,
        "L/d = {:.0} — typical for plate girder bridges", ld_ratio
    );

    // Web proportions
    let hw: f64 = 1900.0;      // mm, web depth
    let tw: f64 = 14.0;        // mm, web thickness
    let hw_tw: f64 = hw / tw;  // = 135.7

    // AISC limit without stiffeners: h/tw ≤ 260
    assert!(
        hw_tw < 260.0,
        "h/tw = {:.1} < 260 (AISC unstiffened limit)", hw_tw
    );

    // EC3 limit: h/tw ≤ 124*ε = 124*sqrt(235/fy)
    let fy: f64 = 355.0;
    let epsilon: f64 = (235.0 / fy).sqrt();
    let ec3_limit: f64 = 124.0 * epsilon;

    let needs_stiffeners: bool = hw_tw > ec3_limit;
    // EC3 limit ≈ 124*0.814 = 101 → stiffeners needed for h/tw=136
    assert!(
        needs_stiffeners,
        "h/tw = {:.1} > {:.1} — transverse stiffeners required (EC3)", hw_tw, ec3_limit
    );

    // Stiffener spacing
    let a: f64 = 2500.0;       // mm
    let aspect: f64 = a / hw;
    assert!(
        aspect >= 0.5 && aspect <= 3.0,
        "a/h = {:.2} — practical range", aspect
    );
}

// ================================================================
// 8. Flange Contribution to Shear (EN 1993-1-5)
// ================================================================
//
// In addition to web shear, flanges contribute via frame action:
// V_bf,Rd = bf*tf²*fyf / (c*γ_M1)
// where c = a*(0.25 + 1.6*bf*tf²*fyf/(tw*hw²*fyw))

#[test]
fn girder_flange_shear_contribution() {
    let bf: f64 = 400.0;       // mm
    let tf: f64 = 30.0;        // mm
    let fyf: f64 = 355.0;      // MPa (flange yield)
    let tw: f64 = 12.0;        // mm
    let hw: f64 = 1500.0;      // mm
    let fyw: f64 = 355.0;      // MPa (web yield)
    let a: f64 = 2000.0;       // mm
    let gamma_m1: f64 = 1.10;

    // c parameter
    let c: f64 = a * (0.25 + 1.6 * bf * tf * tf * fyf / (tw * hw * hw * fyw));

    // Flange contribution
    let vbf_rd: f64 = bf * tf * tf * fyf / (c * gamma_m1) / 1000.0; // kN

    // Web contribution (from previous test, approximate)
    let vbw_rd: f64 = 0.83 * fyw * hw * tw / (3.0_f64.sqrt() * gamma_m1) / 1000.0;

    // Flange contribution is typically 5-15% of total
    let flange_fraction: f64 = vbf_rd / (vbf_rd + vbw_rd);

    assert!(
        flange_fraction > 0.01 && flange_fraction < 0.30,
        "Flange shear contribution: {:.1}%", flange_fraction * 100.0
    );

    // Total shear resistance
    let v_total: f64 = vbw_rd + vbf_rd;
    assert!(
        v_total > vbw_rd,
        "Total {:.0} kN > web-only {:.0} kN", v_total, vbw_rd
    );
}
