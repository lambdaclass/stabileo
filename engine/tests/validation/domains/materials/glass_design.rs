/// Validation: Structural Glass Design
///
/// References:
///   - EN 16612:2019: Glass in building — Determination of load resistance
///   - ASTM E1300-16: Standard Practice for Determining Load Resistance of Glass
///   - prEN 13474: Glass in building — Determination of strength
///   - Haldimann, Luible & Overend: "Structural Use of Glass" (2008)
///   - Feldmann et al.: "Guidance for European Structural Design of Glass Components" (2014)
///
/// Tests verify glass strength, laminated glass effective thickness,
/// thermal stress, and load duration effects.

// ================================================================
// 1. Glass Strength — Characteristic Values (EN 16612)
// ================================================================
//
// Float glass: fg,k = 45 MPa
// Heat strengthened: fg,k = 70 MPa
// Tempered (toughened): fg,k = 120 MPa

#[test]
fn glass_characteristic_strength() {
    let fg_float: f64 = 45.0;         // MPa, annealed float
    let fg_hs: f64 = 70.0;            // MPa, heat strengthened
    let fg_tempered: f64 = 120.0;     // MPa, fully tempered

    // Strength ratios
    let hs_ratio: f64 = fg_hs / fg_float;
    let temp_ratio: f64 = fg_tempered / fg_float;

    assert!(
        (hs_ratio - 1.556).abs() / 1.556 < 0.01,
        "HS/float ratio: {:.3}", hs_ratio
    );
    assert!(
        (temp_ratio - 2.667).abs() / 2.667 < 0.01,
        "Tempered/float ratio: {:.3}", temp_ratio
    );

    // Design strength: fd = kmod * fg,k / γM
    let gamma_m: f64 = 1.8; // partial factor for glass
    let kmod: f64 = 0.72;   // load duration factor (medium-term, wind)

    let fd_float: f64 = kmod * fg_float / gamma_m;
    let fd_tempered: f64 = kmod * fg_tempered / gamma_m;

    assert!(
        fd_tempered > fd_float,
        "Tempered {:.1} > float {:.1} MPa", fd_tempered, fd_float
    );
}

// ================================================================
// 2. Glass Plate — Simply Supported Under Uniform Pressure
// ================================================================
//
// Maximum stress in rectangular plate: σ = β * p * a² / t²
// Maximum deflection: δ = α * p * a⁴ / (E * t³)
// β, α depend on aspect ratio b/a (Timoshenko plate theory)

#[test]
fn glass_plate_stress_deflection() {
    let a: f64 = 1.2;        // m, short side
    let b: f64 = 1.8;        // m, long side
    let t: f64 = 0.010;      // m (10mm glass)
    let p: f64 = 1.0;        // kPa (1 kN/m²), wind pressure
    let e: f64 = 70_000_000.0; // kPa (70 GPa)

    // Aspect ratio
    let _ratio: f64 = b / a; // = 1.5

    // For b/a = 1.5 (from Timoshenko tables):
    // β ≈ 0.5724, α ≈ 0.0772
    let beta: f64 = 0.5724;
    let alpha: f64 = 0.0772;

    // Maximum stress
    let _sigma: f64 = beta * p * a * a / (t * t) * 1000.0; // kPa → MPa conversion
    // σ = 0.5724 * 1.0 * 1.44 / 0.0001 * 0.001 = 0.5724 * 14400 * 0.001 = 8.24 MPa
    // Actually: p in kPa, a in m, t in m → σ in kPa, divide by 1000 for MPa
    let sigma_mpa: f64 = beta * p * a * a / (t * t) / 1000.0;

    assert!(
        sigma_mpa > 0.0 && sigma_mpa < 50.0,
        "Maximum stress: {:.2} MPa", sigma_mpa
    );

    // Maximum deflection
    let delta: f64 = alpha * p * a.powi(4) / (e * t.powi(3));
    // = 0.0772 * 1.0 * 2.0736 / (70e6 * 1e-6) = 0.0772 * 2.0736 / 70 = 0.00229 m

    let delta_mm: f64 = delta * 1000.0;
    assert!(
        delta_mm > 0.0 && delta_mm < 50.0,
        "Maximum deflection: {:.2} mm", delta_mm
    );

    // Check deflection limit: L/65 for glass (more restrictive than steel)
    let delta_limit: f64 = a * 1000.0 / 65.0; // mm
    assert!(
        delta_limit > 10.0,
        "Deflection limit: {:.1} mm", delta_limit
    );
}

// ================================================================
// 3. Laminated Glass — Effective Thickness (EN 16612)
// ================================================================
//
// Effective thickness for deflection:
// hef,w = (Σhi³ + 12*ω*Σ(hi*ai²))^(1/3)
// where ω = shear transfer coefficient (0 to 1)
// ω depends on interlayer properties and loading duration

#[test]
fn glass_laminated_effective_thickness() {
    let h1: f64 = 6.0;      // mm, glass ply 1
    let h2: f64 = 6.0;      // mm, glass ply 2
    let h_pvb: f64 = 0.76;  // mm, PVB interlayer

    // No shear transfer (ω=0): minimum effective thickness
    let hef_min: f64 = (h1.powi(3) + h2.powi(3)).powf(1.0 / 3.0);
    // = (216 + 216)^(1/3) = 432^(1/3) = 7.56 mm

    // Full shear transfer (ω=1): maximum effective thickness
    let a1: f64 = (h2 + h_pvb) / 2.0; // distance from centroid of ply 1
    let a2: f64 = (h1 + h_pvb) / 2.0; // distance from centroid of ply 2

    let hef_max: f64 = (h1.powi(3) + h2.powi(3) + 12.0 * (h1 * a1 * a1 + h2 * a2 * a2)).powf(1.0 / 3.0);

    // Monolithic equivalent ≈ 12mm (both plies acting together)
    assert!(
        hef_max > hef_min,
        "Full coupling {:.2}mm > no coupling {:.2}mm", hef_max, hef_min
    );

    // Practical ω for short-term wind load on PVB at 20°C: ω ≈ 0.3
    let omega: f64 = 0.3;
    let hef_practical: f64 = (h1.powi(3) + h2.powi(3)
        + 12.0 * omega * (h1 * a1 * a1 + h2 * a2 * a2)).powf(1.0 / 3.0);

    assert!(
        hef_practical > hef_min && hef_practical < hef_max,
        "Practical hef = {:.2}mm (between {:.2} and {:.2})",
        hef_practical, hef_min, hef_max
    );
}

// ================================================================
// 4. Thermal Stress in Glass
// ================================================================
//
// Temperature difference between center and edge causes stress:
// σ_thermal = E * α * ΔT / (1-ν)
// For float glass: α = 9×10⁻⁶ /°C, E = 70 GPa, ν = 0.22

#[test]
fn glass_thermal_stress() {
    let e: f64 = 70_000.0;    // MPa
    let alpha: f64 = 9e-6;    // 1/°C
    let nu: f64 = 0.22;
    let delta_t: f64 = 40.0;  // °C, center-to-edge temperature difference

    let sigma_thermal: f64 = e * alpha * delta_t / (1.0 - nu);
    // = 70000 * 9e-6 * 40 / 0.78 = 70000 * 3.6e-4 / 0.78 = 25.2 / 0.78 = 32.3 MPa

    let sigma_expected: f64 = 70_000.0 * 9e-6 * 40.0 / 0.78;

    assert!(
        (sigma_thermal - sigma_expected).abs() / sigma_expected < 0.01,
        "Thermal stress: {:.1} MPa, expected {:.1}", sigma_thermal, sigma_expected
    );

    // Compare to float glass strength (45 MPa) — thermal breakage risk!
    let fg_float: f64 = 45.0;
    let utilization: f64 = sigma_thermal / fg_float;

    assert!(
        utilization > 0.5,
        "Thermal stress utilization: {:.2} — significant risk for float", utilization
    );

    // Tempered glass resists thermal stress much better
    let fg_tempered: f64 = 120.0;
    let util_tempered: f64 = sigma_thermal / fg_tempered;
    assert!(
        util_tempered < 0.5,
        "Tempered utilization: {:.2} — acceptable", util_tempered
    );
}

// ================================================================
// 5. Load Duration Factor (EN 16612)
// ================================================================
//
// Glass strength depends on load duration due to subcritical crack growth.
// kmod values: permanent = 0.29, medium-term (wind) = 0.72, short (impact) = 1.0

#[test]
fn glass_load_duration() {
    let fg_k: f64 = 45.0;     // MPa, float glass

    let kmod_permanent: f64 = 0.29;
    let kmod_wind: f64 = 0.72;
    let kmod_impact: f64 = 1.0;

    let fd_permanent: f64 = kmod_permanent * fg_k;
    let fd_wind: f64 = kmod_wind * fg_k;
    let fd_impact: f64 = kmod_impact * fg_k;

    assert!(
        fd_permanent < fd_wind && fd_wind < fd_impact,
        "Perm {:.1} < wind {:.1} < impact {:.1} MPa",
        fd_permanent, fd_wind, fd_impact
    );

    // Permanent/impact ratio
    let perm_impact_ratio: f64 = fd_permanent / fd_impact;
    assert!(
        (perm_impact_ratio - 0.29).abs() < 0.01,
        "Duration ratio: {:.2}", perm_impact_ratio
    );

    // Permanent loads are only 29% of instantaneous capacity
    // This is why dead load is critical in glass design
    assert!(
        perm_impact_ratio < 0.30,
        "Glass loses 71% capacity under permanent load"
    );
}

// ================================================================
// 6. ASTM E1300 — Non-Factored Load (NFL) Chart
// ================================================================
//
// ASTM E1300 provides NFL charts based on plate dimensions and thickness.
// For 6mm tempered glass, 1000×2000mm, 4-edge supported:
// NFL ≈ 3.0 kPa (approximate from charts)

#[test]
fn glass_astm_e1300_nfl() {
    let a: f64 = 1.0;        // m, short dimension
    let b: f64 = 2.0;        // m, long dimension
    let t: f64 = 6.0;        // mm, nominal thickness
    let nfl: f64 = 3.0;      // kPa, from ASTM E1300 charts (tempered)

    // Glass type factor (GTF) for tempered = 4.0 (vs annealed = 1.0)
    let gtf_tempered: f64 = 4.0;
    let gtf_annealed: f64 = 1.0;

    // Annealed NFL would be
    let nfl_annealed: f64 = nfl / gtf_tempered * gtf_annealed;
    assert!(
        nfl_annealed < nfl,
        "Annealed NFL {:.2} < tempered {:.2} kPa", nfl_annealed, nfl
    );

    // Load resistance: LR = NFL * GTF * LS (load sharing)
    let ls: f64 = 1.0; // no load sharing
    let lr: f64 = nfl * ls;

    assert!(
        lr > 1.0,
        "Load resistance: {:.1} kPa for {}mm tempered at {}x{}m", lr, t, a, b
    );

    // Aspect ratio effect: square glass has higher NFL
    let _nfl_square: f64 = nfl * 1.3; // approximate 30% higher for square
    assert!(
        _nfl_square > nfl,
        "Square has higher NFL than rectangular"
    );
}

// ================================================================
// 7. Insulating Glass Unit (IGU) — Load Sharing
// ================================================================
//
// Double-glazed IGU: load is shared between inner and outer panes
// based on stiffness ratio. Each pane takes load proportional to t³.
// Cavity pressure also transfers load between panes.

#[test]
fn glass_igu_load_sharing() {
    let t_outer: f64 = 8.0;   // mm, outer pane
    let t_inner: f64 = 6.0;   // mm, inner pane

    // Stiffness proportion (proportional to t³)
    let stiff_outer: f64 = t_outer.powi(3);
    let stiff_inner: f64 = t_inner.powi(3);
    let stiff_total: f64 = stiff_outer + stiff_inner;

    // Load share
    let share_outer: f64 = stiff_outer / stiff_total;
    let share_inner: f64 = stiff_inner / stiff_total;

    // outer = 512/(512+216) = 512/728 = 0.703
    let share_outer_expected: f64 = 512.0 / 728.0;

    assert!(
        (share_outer - share_outer_expected).abs() / share_outer_expected < 0.01,
        "Outer share: {:.3}, expected {:.3}", share_outer, share_outer_expected
    );

    // Sum = 1.0
    assert!(
        (share_outer + share_inner - 1.0).abs() < 0.001,
        "Sum of shares: {:.3}", share_outer + share_inner
    );

    // Thicker outer pane takes more load
    assert!(
        share_outer > share_inner,
        "Outer {:.3} > inner {:.3}", share_outer, share_inner
    );
}

// ================================================================
// 8. Glass Balustrade — Post-Breakage Safety
// ================================================================
//
// Laminated glass balustrades must maintain load capacity after breakage
// of one ply. Residual capacity depends on interlayer and remaining plies.

#[test]
fn glass_balustrade_post_breakage() {
    let h1: f64 = 10.0;     // mm, ply 1 (tempered)
    let h2: f64 = 10.0;     // mm, ply 2 (tempered)
    let h3: f64 = 10.0;     // mm, ply 3 (heat strengthened)

    // Intact: 3 plies
    let i_intact: f64 = h1.powi(3) + h2.powi(3) + h3.powi(3); // stiffness sum
    // = 3000 mm³ (proportional to stiffness)

    // Post-breakage: lose 1 ply
    let i_damaged: f64 = h2.powi(3) + h3.powi(3);
    // = 2000 mm³

    // Residual capacity ratio
    let residual_ratio: f64 = i_damaged / i_intact;
    let residual_expected: f64 = 2.0 / 3.0;

    assert!(
        (residual_ratio - residual_expected).abs() / residual_expected < 0.01,
        "Residual stiffness: {:.3}, expected {:.3}", residual_ratio, residual_expected
    );

    // Post-breakage requirement: typically 50% of design load
    let requirement: f64 = 0.50;
    assert!(
        residual_ratio >= requirement,
        "Residual {:.3} ≥ requirement {:.2} — OK", residual_ratio, requirement
    );
}
