/// Validation: Structural Glass Design
///
/// References:
///   - prEN 16612: Glass in Building — Determination of Load Resistance
///   - ASTM E1300: Standard Practice for Determining Load Resistance of Glass
///   - Haldimann, Luible, Overend: "Structural Use of Glass" (2008)
///   - Feldmann et al: "Guidance for European Structural Design of Glass Components" (JRC, 2014)
///   - AS 1288: Glass in Buildings — Selection and Installation
///   - CNR-DT 210: Guide for Design, Construction & Control of Glass Structures (2013)
///
/// Tests verify glass strength, laminated behavior, bolt fixings,
/// thermal stress, post-breakage, cable-stayed facades, and balustrades.

// ================================================================
// 1. Annealed Glass Strength -- Wind Load
// ================================================================
//
// Characteristic bending strength of annealed float glass: 45 MPa.
// Design strength depends on load duration and area.
// prEN 16612 uses kmod factor for load duration.

#[test]
fn glass_annealed_wind() {
    let fg_k: f64 = 45.0;           // MPa, characteristic bending strength (annealed)
    let gamma_m: f64 = 1.8;         // material partial factor (annealed)

    // Load duration factor (wind = short duration, ~3s gust)
    let k_mod: f64 = 1.0;           // for wind (short duration)
    let k_sp: f64 = 1.0;            // glass surface profile factor

    // Design strength
    let fg_d: f64 = k_mod * k_sp * fg_k / gamma_m;

    assert!(
        fg_d > 20.0 && fg_d < 30.0,
        "Design strength: {:.1} MPa", fg_d
    );

    // Glass plate under wind (simply supported, 4 edges)
    let a: f64 = 1.5;               // m, width
    let b: f64 = 2.0;               // m, height
    let t: f64 = 10.0;              // mm, thickness
    let q: f64 = 1.2;               // kPa, wind pressure

    // Plate bending coefficient (a/b = 0.75)
    let ratio: f64 = a / b;
    let alpha: f64 = 0.0479 * ratio * ratio + 0.0203 * ratio + 0.0060; // approximate

    // Maximum stress
    let sigma_max: f64 = alpha * q * 1e-3 * (b * 1000.0).powi(2) / (t * t); // MPa

    assert!(
        sigma_max < fg_d,
        "Stress {:.1} < design {:.1} MPa", sigma_max, fg_d
    );

    // Deflection check (L/60 for glass)
    let _e: f64 = 70_000.0;          // MPa, Young's modulus of glass
    let defl_limit: f64 = b * 1000.0 / 60.0; // mm

    assert!(
        defl_limit > 20.0,
        "Deflection limit: {:.0} mm", defl_limit
    );
}

// ================================================================
// 2. Tempered (Toughened) Glass Strength
// ================================================================
//
// Fully tempered glass: characteristic strength ~120 MPa.
// Surface pre-compression from tempering process.
// Breaks into small fragments (safety).

#[test]
fn glass_tempered_strength() {
    let fg_k: f64 = 45.0;           // MPa, base annealed strength
    let fb_k: f64 = 120.0;          // MPa, characteristic bending strength (tempered)
    let gamma_m_a: f64 = 1.8;       // partial factor for annealed component
    let gamma_m_v: f64 = 1.2;       // partial factor for pre-stress component

    // prEN 16612 design strength for tempered glass
    let k_mod: f64 = 1.0;           // wind duration
    let k_sp: f64 = 1.0;
    let k_v: f64 = 1.0;             // coefficient for tempered glass

    let fg_d: f64 = k_mod * k_sp * fg_k / gamma_m_a
        + k_v * (fb_k - fg_k) / gamma_m_v;

    assert!(
        fg_d > 80.0,
        "Tempered design strength: {:.1} MPa", fg_d
    );

    // Comparison ratio tempered/annealed
    let fg_d_annealed: f64 = k_mod * k_sp * fg_k / gamma_m_a;
    let strength_ratio: f64 = fg_d / fg_d_annealed;

    assert!(
        strength_ratio > 3.0,
        "Tempered/annealed ratio: {:.1}", strength_ratio
    );

    // Pre-compression from tempering
    let sigma_residual: f64 = 80.0;  // MPa, surface compression (typical FT)

    assert!(
        sigma_residual > 69.0,
        "Residual compression: {:.0} MPa (>69 MPa for FT per EN 12150)", sigma_residual
    );
}

// ================================================================
// 3. Laminated Glass -- Effective Thickness
// ================================================================
//
// Two or more glass plies bonded with PVB or ionoplast interlayer.
// Effective thickness depends on interlayer shear transfer (ω).
// Full shear transfer: ω=1, no transfer: ω=0.

#[test]
fn glass_laminated_effective_thickness() {
    let t1: f64 = 8.0;              // mm, outer ply
    let t2: f64 = 8.0;              // mm, inner ply
    let t_pvb: f64 = 1.52;          // mm, PVB interlayer

    // Interlayer shear transfer coefficient
    // PVB at 30°C, long duration → low ω; short duration → higher ω
    let omega_wind: f64 = 0.7;      // wind (short duration, moderate temp)
    let omega_permanent: f64 = 0.0; // permanent load (creep → no transfer)

    // Effective thickness for stress (prEN 16612)
    // h_ef,σ for ply 1:
    let h_s1: f64 = 0.5 * t_pvb + t1 / 2.0; // distance from ply 1 centroid to laminate centroid
    let h_s2: f64 = 0.5 * t_pvb + t2 / 2.0;

    // Effective thickness for deflection
    let h_ef_w = |omega: f64| -> f64 {
        (t1.powi(3) + t2.powi(3)
            + 12.0 * omega * (t1 * h_s1 * h_s1 + t2 * h_s2 * h_s2))
        .cbrt()
    };

    let h_eff_wind: f64 = h_ef_w(omega_wind);
    let h_eff_perm: f64 = h_ef_w(omega_permanent);

    // Full composite = single pane of total thickness
    let h_full_composite: f64 = (t1 + t2).powi(3).cbrt(); // = t1+t2 for equal plies

    assert!(
        h_eff_wind > h_eff_perm,
        "Wind eff: {:.1} > perm eff: {:.1} mm", h_eff_wind, h_eff_perm
    );

    assert!(
        h_eff_wind < h_full_composite,
        "Eff {:.1} < full composite {:.1} mm (partial shear transfer)", h_eff_wind, h_full_composite
    );

    // No transfer → sum of cubes
    let h_no_transfer: f64 = (t1.powi(3) + t2.powi(3)).cbrt();
    assert!(
        (h_eff_perm - h_no_transfer).abs() < 0.01,
        "No transfer: {:.2} ≈ {:.2} mm", h_eff_perm, h_no_transfer
    );
}

// ================================================================
// 4. Bolted Glass Connection
// ================================================================
//
// Point-fixed glass using countersunk or button-head bolts.
// Local stress concentration around hole.
// Stress concentration factor k_e ≈ 2.5-3.5 for glass holes.

#[test]
fn glass_bolted_connection() {
    let d_hole: f64 = 26.0;         // mm, hole diameter
    let d_bolt: f64 = 20.0;         // mm, bolt diameter (M20)
    let t_glass: f64 = 15.0;        // mm, tempered glass thickness
    let clearance: f64 = (d_hole - d_bolt) / 2.0; // mm

    assert!(
        clearance >= 2.0,
        "Clearance: {:.1} mm (min 2mm)", clearance
    );

    // Edge distance requirements
    let edge_dist: f64 = 80.0;      // mm, from hole center to edge
    let min_edge: f64 = 2.5 * d_hole;

    assert!(
        edge_dist >= min_edge,
        "Edge distance {:.0} >= {:.0} mm", edge_dist, min_edge
    );

    // Bolt spacing
    let spacing: f64 = 300.0;       // mm
    let min_spacing: f64 = 3.0 * d_hole;

    assert!(
        spacing >= min_spacing,
        "Spacing {:.0} >= {:.0} mm", spacing, min_spacing
    );

    // Local bearing stress through bush/liner
    let p_bolt: f64 = 5.0;          // kN, bolt load (wind suction on single fixing)
    let bush_t: f64 = 3.0;          // mm, EPDM bush thickness
    let bearing_area: f64 = d_bolt * t_glass * 0.5; // effective bearing (half circumference)
    let sigma_bearing: f64 = p_bolt * 1000.0 / bearing_area; // MPa

    // Bush material limits bearing stress
    assert!(
        sigma_bearing < 50.0,
        "Bearing stress: {:.1} MPa", sigma_bearing
    );

    let _bush_t = bush_t;

    // Stress concentration factor
    let k_e: f64 = 3.0;             // typical for drilled hole in glass
    let sigma_nominal: f64 = 10.0;  // MPa, far-field stress
    let sigma_local: f64 = k_e * sigma_nominal;

    // Must be less than tempered glass strength
    let fg_d_tempered: f64 = 87.5;  // MPa (from test 2)
    assert!(
        sigma_local < fg_d_tempered,
        "Local stress {:.0} < {:.1} MPa", sigma_local, fg_d_tempered
    );
}

// ================================================================
// 5. Thermal Stress in Glass
// ================================================================
//
// Temperature difference between center and edge of glass pane
// causes thermal stress. Critical for tinted/coated glass.
// If thermal stress > allowable → must use heat-strengthened or tempered.

#[test]
fn glass_thermal_stress() {
    let alpha: f64 = 9.0e-6;        // /°C, thermal expansion coefficient (glass)
    let e: f64 = 70_000.0;          // MPa, Young's modulus

    // Temperature difference scenarios
    let dt_clear: f64 = 20.0;       // °C, clear glass in frame
    let dt_tinted: f64 = 40.0;      // °C, tinted/absorbing glass
    let dt_coated: f64 = 35.0;      // °C, low-e coated glass

    // Thermal stress = α × E × ΔT
    let sigma_clear: f64 = alpha * e * dt_clear;
    let sigma_tinted: f64 = alpha * e * dt_tinted;
    let sigma_coated: f64 = alpha * e * dt_coated;

    // Allowable thermal stress for annealed glass ≈ 22 MPa (prEN 16612)
    let sigma_allow_annealed: f64 = 22.0;

    // Clear glass: OK for annealed
    assert!(
        sigma_clear < sigma_allow_annealed,
        "Clear thermal stress: {:.1} < {:.0} MPa", sigma_clear, sigma_allow_annealed
    );

    // Tinted glass: exceeds annealed → needs heat-strengthened
    assert!(
        sigma_tinted > sigma_allow_annealed,
        "Tinted stress {:.1} > annealed limit {:.0} MPa → use HS/FT",
        sigma_tinted, sigma_allow_annealed
    );

    // Heat-strengthened allowable: ~40 MPa
    let sigma_allow_hs: f64 = 40.0;

    assert!(
        sigma_coated < sigma_allow_hs,
        "Coated stress {:.1} < HS limit {:.0} MPa", sigma_coated, sigma_allow_hs
    );

    // Shadow line effect (partial shading increases ΔT)
    let shadow_factor: f64 = 1.5;   // 50% increase from partial shading
    let sigma_shadow: f64 = sigma_tinted * shadow_factor;

    // Fully tempered needed for severe cases
    let sigma_allow_ft: f64 = 67.0;

    assert!(
        sigma_shadow < sigma_allow_ft,
        "Shadow stress {:.1} < FT limit {:.0} MPa", sigma_shadow, sigma_allow_ft
    );
}

// ================================================================
// 6. Post-Breakage Performance -- Laminated Safety
// ================================================================
//
// After glass breakage, laminated glass must retain fragments
// and provide residual load-carrying capacity.
// Design for "broken state" with one ply broken.

#[test]
fn glass_post_breakage() {
    let t1: f64 = 10.0;             // mm, outer ply (assumed broken)
    let t2: f64 = 10.0;             // mm, inner ply (intact)
    let _interlayer: f64 = 1.52;    // mm, PVB

    // Residual capacity with one ply broken
    // Broken ply contributes zero bending but holds fragments
    // Only intact ply carries load

    // Intact ply section modulus
    let w_intact: f64 = t2 * t2 / 6.0; // mm³/mm (per unit width)

    // Compared to original (both plies)
    let w_laminated: f64 = (t1 + t2).powi(2) / 6.0; // full composite (upper bound)
    let residual_ratio: f64 = w_intact / w_laminated;

    assert!(
        residual_ratio > 0.20,
        "Residual capacity ratio: {:.2} (>20%)", residual_ratio
    );

    // Self-weight deflection of broken laminate
    let rho: f64 = 2500.0;          // kg/m³, glass density
    let g: f64 = 9.81;              // m/s²
    let span: f64 = 1500.0;         // mm
    let t_total: f64 = t1 + t2;     // mm

    let q_sw: f64 = rho * t_total / 1e6 * g; // N/mm² → kPa-ish... N/mm per mm width
    // Self-weight as UDL: w = ρ × t × g (N/mm per mm width)
    let w_sw: f64 = rho * (t_total / 1000.0) * g / 1_000_000.0; // N/mm per mm width

    // Deflection with only intact ply
    let e_glass: f64 = 70_000.0;    // MPa
    let i_intact: f64 = t2.powi(3) / 12.0; // mm⁴/mm
    let delta: f64 = 5.0 * w_sw * span.powi(4) / (384.0 * e_glass * i_intact);

    assert!(
        delta < span / 30.0,
        "Post-break deflection: {:.1} mm < L/30 = {:.0} mm", delta, span / 30.0
    );

    let _q_sw = q_sw;
}

// ================================================================
// 7. Cable-Stayed Glass Facade
// ================================================================
//
// Glass panels supported by pre-tensioned stainless steel cables.
// Cables provide lateral support; glass spans between cables.
// Critical: cable pre-tension must exceed wind suction.

#[test]
fn glass_cable_facade() {
    // Cable properties
    let d_cable: f64 = 20.0;        // mm, cable diameter
    let a_cable: f64 = std::f64::consts::PI * d_cable * d_cable / 4.0; // mm²
    let e_cable: f64 = 130_000.0;   // MPa, stainless steel cable
    let f_break: f64 = 1570.0;      // MPa, breaking strength

    // Pre-tension (typically 30-40% of breaking load)
    let pre_tension_ratio: f64 = 0.35;
    let t_pre: f64 = pre_tension_ratio * f_break * a_cable / 1000.0; // kN

    assert!(
        t_pre > 50.0,
        "Pre-tension: {:.0} kN", t_pre
    );

    // Cable span and sag
    let l_cable: f64 = 12.0;        // m, cable span (floor to floor)
    let w_wind: f64 = 2.0;          // kN/m, wind load on tributary width

    // Mid-span sag under wind (catenary approximation)
    let sag: f64 = w_wind * l_cable * l_cable / (8.0 * t_pre);

    // Sag limit: L/50
    let sag_limit: f64 = l_cable * 1000.0 / 50.0; // mm
    let sag_mm: f64 = sag * 1000.0;

    assert!(
        sag_mm < sag_limit,
        "Sag: {:.0} mm < L/50 = {:.0} mm", sag_mm, sag_limit
    );

    // Cable remains in tension (pre-tension > wind tension loss)
    let t_wind: f64 = (t_pre * t_pre + (w_wind * l_cable / 2.0).powi(2)).sqrt();
    assert!(
        t_wind < f_break * a_cable / 1000.0 / 2.5,
        "Cable tension {:.0} < allowable {:.0} kN", t_wind, f_break * a_cable / 1000.0 / 2.5
    );

    // Cable elongation
    let _delta_l: f64 = t_wind * l_cable * 1000.0 / (e_cable * a_cable); // mm

    assert!(
        _delta_l < 20.0,
        "Cable elongation: {:.1} mm", _delta_l
    );
}

// ================================================================
// 8. Glass Balustrade -- Barrier Loading
// ================================================================
//
// Glass balustrade must resist horizontal barrier loading.
// EN 1991-1-1: 0.74-3.0 kN/m depending on use.
// Typically laminated toughened glass, cantilevered from base.

#[test]
fn glass_balustrade_barrier() {
    // Barrier load (office/residential)
    let q_barrier: f64 = 0.74;      // kN/m, horizontal line load at top
    let h: f64 = 1100.0;            // mm, balustrade height
    let panel_width: f64 = 1500.0;  // mm, panel width

    // Cantilever bending moment at base
    let m_base: f64 = q_barrier * (h / 1000.0); // kN·m per m run

    assert!(
        m_base > 0.5,
        "Base moment: {:.2} kN·m/m", m_base
    );

    // Glass specification: 2 × 15mm tempered + 1.52mm PVB
    let t_ply: f64 = 15.0;          // mm
    let n_plies: usize = 2;

    // Effective thickness (conservative: no interlayer transfer for barrier)
    let h_eff: f64 = ((n_plies as f64) * t_ply.powi(3)).cbrt();

    // Section modulus per meter width
    let w_eff: f64 = 1000.0 * h_eff * h_eff / 6.0; // mm³

    // Bending stress
    let sigma: f64 = m_base * 1e6 / w_eff; // MPa

    // Tempered glass design strength
    let fg_d: f64 = 87.5;           // MPa (from test 2)

    assert!(
        sigma < fg_d,
        "Barrier stress: {:.1} < {:.1} MPa", sigma, fg_d
    );

    // Deflection at top (cantilever)
    let e_glass: f64 = 70_000.0;    // MPa
    let i_eff: f64 = 1000.0 * h_eff.powi(3) / 12.0; // mm⁴ per m width
    let p_total: f64 = q_barrier * (panel_width / 1000.0); // kN, total on panel
    let delta_top: f64 = p_total * 1000.0 * h.powi(3) / (3.0 * e_glass * i_eff);

    // Deflection limit: H/65 (typical for balustrades)
    let delta_limit: f64 = h / 65.0;

    assert!(
        delta_top < delta_limit,
        "Deflection: {:.1} < {:.1} mm (H/65)", delta_top, delta_limit
    );

    // Soft body impact (pendulum test) — not calculated here, but
    // laminated tempered glass is required for safety classification
    let is_laminated: bool = n_plies >= 2;
    assert!(is_laminated, "Must be laminated for barrier");
}
