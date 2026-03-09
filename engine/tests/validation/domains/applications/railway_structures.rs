/// Validation: Railway Structures & Loading
///
/// References:
///   - EN 1991-2: Traffic Loads on Bridges (LM71, SW/0, SW/2)
///   - UIC 776-1: Loads to be Considered in Railway Bridge Design
///   - AREMA Manual for Railway Engineering (2020)
///   - Esveld: "Modern Railway Track" 3rd ed. (2014)
///   - Fryba: "Dynamics of Railway Bridges" (1996)
///   - EN 1990 Annex A2: Bridges -- Combination Rules
///
/// Tests verify rail loads, dynamic amplification, track-bridge interaction,
/// fatigue loading, derailment, ballast, and long welded rail stresses.

// ================================================================
// 1. LM71 Load Model -- EN 1991-2
// ================================================================
//
// LM71: 4 axles of 250 kN at 1.6m spacing + uniform 80 kN/m
// Classified factor α: 0.75 to 1.46 (α=1 standard)
// Characteristic load: α × LM71

#[test]
fn railway_lm71_loading() {
    let axle_load: f64 = 250.0;  // kN, per axle
    let n_axles: usize = 4;
    let axle_spacing: f64 = 1.6; // m
    let udl: f64 = 80.0;         // kN/m, uniform distributed load
    let alpha: f64 = 1.0;        // classification factor

    // Total concentrated load
    let p_total: f64 = alpha * axle_load * n_axles as f64;

    assert!(
        p_total > 800.0,
        "Total axle loads: {:.0} kN", p_total
    );

    // For simply supported beam of span L
    let l: f64 = 20.0;          // m, bridge span

    // Maximum moment (axle group at midspan + UDL)
    // Axle group effect: 4 axles over 4.8m
    let group_length: f64 = axle_spacing * (n_axles - 1) as f64;

    // UDL moment
    let m_udl: f64 = alpha * udl * l * l / 8.0;

    // Axle moment (approximate: 4 equal loads, centered)
    // More accurate: influence line placement
    let m_axle: f64 = alpha * axle_load * l; // simplified max for centered group

    let m_total: f64 = m_udl + m_axle;

    assert!(
        m_total > 5000.0,
        "Total moment: {:.0} kN·m", m_total
    );

    // Shear (support reaction)
    let v_max: f64 = alpha * udl * l / 2.0 + alpha * axle_load * n_axles as f64 / 2.0;

    assert!(
        v_max > 1000.0,
        "Maximum shear: {:.0} kN", v_max
    );

    let _group_length = group_length;
}

// ================================================================
// 2. Dynamic Amplification Factor
// ================================================================
//
// EN 1991-2 §6.4: Φ = max(Φ₂, Φ₃)
// Φ₂ = 1.44/(√L_Φ - 0.2) + 0.82 (carefully maintained track)
// Φ₃ = 2.16/(√L_Φ - 0.2) + 0.73 (standard maintenance)
// L_Φ = determinant length (≈ span for simple beams)

#[test]
fn railway_dynamic_amplification() {
    let spans: [f64; 4] = [5.0, 15.0, 30.0, 60.0];

    let mut prev_phi: f64 = f64::MAX;

    for l in &spans {
        let l_phi: f64 = *l; // determinant length ≈ span

        // Carefully maintained track
        let phi_2: f64 = 1.44 / (l_phi.sqrt() - 0.2) + 0.82;

        // Standard maintenance
        let phi_3: f64 = 2.16 / (l_phi.sqrt() - 0.2) + 0.73;

        assert!(
            phi_3 > phi_2,
            "L={:.0}m: Φ₃={:.3} > Φ₂={:.3}", l, phi_3, phi_2
        );

        // Φ decreases with span (longer bridges have lower DAF)
        if *l > 5.0 {
            assert!(
                phi_2 < prev_phi,
                "DAF decreases: {:.3} < {:.3} for L={:.0}m", phi_2, prev_phi, l
            );
        }
        prev_phi = phi_2;

        // Bounds check: 1.0 ≤ Φ ≤ 2.0 (approximately)
        assert!(
            phi_2 > 1.0 && phi_2 < 3.0,
            "Φ₂ = {:.3} in valid range at L={:.0}m", phi_2, l
        );
    }
}

// ================================================================
// 3. Track-Bridge Interaction -- Rail Stress
// ================================================================
//
// Longitudinal rail forces from:
// - Temperature (expansion/contraction of bridge)
// - Braking/traction
// - Creep & shrinkage (concrete bridges)
// EN 1991-2 §6.5: additional rail stress ≤ 72 MPa (compression)

#[test]
fn railway_track_bridge_interaction() {
    let l: f64 = 50.0;          // m, bridge expansion length
    let alpha_bridge: f64 = 12e-6; // 1/°C (concrete)
    let _alpha_rail: f64 = 12e-6;   // 1/°C (steel rail)
    let delta_t: f64 = 35.0;    // °C, temperature range

    // Relative displacement between rail and bridge
    let e_rail: f64 = 210_000.0; // MPa
    let a_rail: f64 = 7670.0;   // mm², UIC 60 rail section area

    // Bridge deck movement (free expansion)
    let delta_bridge: f64 = alpha_bridge * delta_t * l * 1000.0; // mm
    // = 12e-6 × 35 × 60000 = 25.2 mm

    assert!(
        delta_bridge > 10.0 && delta_bridge < 50.0,
        "Bridge expansion: {:.1} mm", delta_bridge
    );

    // Rail-deck resistance (ballasted track)
    let k_long: f64 = 20.0;     // kN/m per track, longitudinal resistance (unloaded)
    let k_loaded: f64 = 60.0;   // kN/m per track (loaded by train)

    // Length of mobilized track
    let l_mob: f64 = (e_rail * a_rail / 1000.0 * delta_bridge / 1000.0 / k_long).sqrt();

    assert!(
        l_mob > 0.0,
        "Mobilized length: {:.1} m", l_mob
    );

    // Additional rail stress from temperature
    // Simplified: σ_rail ≈ k × L / (2 × A_rail) for fixed track
    let sigma_add: f64 = k_long * l / 2.0 * 1000.0 / a_rail;

    // EN 1991-2 limit: 72 MPa compression
    assert!(
        sigma_add < 72.0,
        "Additional rail stress: {:.0} MPa < 72 MPa limit", sigma_add
    );

    let _k_loaded = k_loaded;
}

// ================================================================
// 4. Braking & Traction Forces
// ================================================================
//
// EN 1991-2 §6.5.3:
// Braking: q_lb = 20 kN/m, max 6000 kN
// Traction: q_la = 33 kN/m, max 1000 kN

#[test]
fn railway_braking_traction() {
    let l: f64 = 100.0;         // m, loaded length

    // Braking force
    let q_brake: f64 = 20.0;    // kN/m
    let f_brake_max: f64 = 6000.0; // kN, cap
    let f_brake: f64 = (q_brake * l).min(f_brake_max);

    assert!(
        f_brake > 1000.0 && f_brake <= 6000.0,
        "Braking force: {:.0} kN", f_brake
    );

    // Traction force
    let q_traction: f64 = 33.0; // kN/m
    let f_traction_max: f64 = 1000.0; // kN, cap
    let f_traction: f64 = (q_traction * l).min(f_traction_max);

    assert!(
        f_traction == 1000.0,
        "Traction force: {:.0} kN (capped)", f_traction
    );

    // Distribution through rail to bridge bearings
    // Fixed bearing takes 100% if one end fixed
    let f_fixed_bearing: f64 = f_brake; // full braking to fixed end

    // Longitudinal design of pier
    let h_pier: f64 = 8.0;      // m
    let m_pier_base: f64 = f_fixed_bearing * h_pier;

    assert!(
        m_pier_base > 5000.0,
        "Pier base moment: {:.0} kN·m", m_pier_base
    );
}

// ================================================================
// 5. Fatigue Loading -- Train Type Spectrum
// ================================================================
//
// EN 1991-2 §6.9: Fatigue load model
// LM71 with damage equivalence factor λ
// λ = λ₁ × λ₂ × λ₃ × λ₄
// λ₁: span factor, λ₂: traffic volume, λ₃: design life, λ₄: load on more tracks

#[test]
fn railway_fatigue_loading() {
    let l: f64 = 20.0;          // m, span

    // Damage equivalence factors (EN 1991-2 Table 6.3ff)
    // λ₁: depends on span and influence line
    let lambda_1: f64 = 0.70;   // for L = 20m, midspan moment
    // λ₂: depends on traffic volume (25 × 10⁶ t/year = heavy)
    let lambda_2: f64 = 1.0;    // heavy traffic
    // λ₃: depends on design life
    let lambda_3: f64 = 1.0;    // 100 year design life
    // λ₄: multiple tracks
    let lambda_4: f64 = 1.0;    // single track

    let lambda: f64 = lambda_1 * lambda_2 * lambda_3 * lambda_4;

    assert!(
        lambda > 0.3 && lambda < 2.0,
        "Damage equivalence: λ = {:.2}", lambda
    );

    // Fatigue stress range
    let sigma_lm71: f64 = 120.0; // MPa, stress range from LM71
    let sigma_fat: f64 = lambda * sigma_lm71;

    // Must be below detail category (e.g., 71 MPa for welded detail)
    let delta_sigma_c: f64 = 125.0; // MPa, detail category (base material)
    let gamma_mf: f64 = 1.15;      // partial factor
    let sigma_limit: f64 = delta_sigma_c / gamma_mf;

    assert!(
        sigma_fat < sigma_limit || lambda < 0.5,
        "Fatigue: {:.0} MPa < {:.0} MPa (or λ covers it)", sigma_fat, sigma_limit
    );

    let _l = l;
}

// ================================================================
// 6. Derailment Loading -- EN 1991-2 §6.7
// ================================================================
//
// Design situation 1: derailed train on bridge
// 2 × 180 kN point loads, 1.4m apart, placed anywhere on track
// Design situation 2: derailed train against parapet
// Horizontal force on edge beam

#[test]
fn railway_derailment() {
    let q_a1: f64 = 180.0;      // kN, each axle (situation 1)
    let spacing: f64 = 1.4;     // m, between loads
    let track_gauge: f64 = 1.435; // m, standard gauge

    // Design situation 1: vertical loads anywhere within 1.5× track width
    let influence_width: f64 = 1.5 * track_gauge;

    // Maximum moment on deck slab (local)
    let effective_width: f64 = influence_width + 2.0; // m, load spread
    let m_local: f64 = q_a1 / effective_width; // kN/m (per unit width)

    assert!(
        m_local > 0.0,
        "Local derailment moment intensity: {:.1} kN/m", m_local
    );

    // Design situation 2: horizontal impact on edge beam
    let q_horizontal: f64 = 100.0; // kN/m over 5m length
    let l_impact: f64 = 5.0;       // m
    let f_horizontal: f64 = q_horizontal * l_impact;

    assert!(
        f_horizontal > 400.0,
        "Horizontal derailment force: {:.0} kN", f_horizontal
    );

    // Edge beam moment
    let h_parapet: f64 = 1.2;   // m, parapet height
    let m_edge: f64 = f_horizontal * h_parapet / 2.0; // simplified

    assert!(
        m_edge > 200.0,
        "Edge beam moment: {:.0} kN·m", m_edge
    );

    let _spacing = spacing;
}

// ================================================================
// 7. Ballast Load & Spreading
// ================================================================
//
// Rail load distributes through ballast (typically 300mm depth).
// Sleeper reaction: R = P/2 (for point load on rail)
// Stress at formation: spread at 1:1 through ballast.

#[test]
fn railway_ballast_spreading() {
    let p_wheel: f64 = 125.0;   // kN, wheel load (250/2)
    let sleeper_spacing: f64 = 0.60; // m
    let sleeper_length: f64 = 2.60;  // m (standard concrete sleeper)
    let sleeper_width: f64 = 0.30;   // m, bearing width
    let ballast_depth: f64 = 0.30;   // m

    // Rail seat load (Zimmermann method, simplified)
    // About 40% of wheel load on rail seat directly below
    let rail_seat_factor: f64 = 0.40;
    let q_rail_seat: f64 = p_wheel * rail_seat_factor;

    assert!(
        q_rail_seat > 40.0,
        "Rail seat load: {:.0} kN", q_rail_seat
    );

    // Contact pressure under sleeper (uniform over half sleeper)
    let a_bearing: f64 = sleeper_length / 3.0 * sleeper_width; // effective area per rail
    let p_sleeper: f64 = q_rail_seat / a_bearing;

    assert!(
        p_sleeper > 100.0,
        "Sleeper contact pressure: {:.0} kPa", p_sleeper
    );

    // Stress at formation level (1:1 spread through ballast)
    let spread_length: f64 = sleeper_length / 3.0 + 2.0 * ballast_depth;
    let spread_width: f64 = sleeper_width + 2.0 * ballast_depth;
    let a_formation: f64 = spread_length * spread_width;
    let sigma_formation: f64 = q_rail_seat / a_formation;

    assert!(
        sigma_formation < p_sleeper,
        "Formation stress {:.0} < sleeper pressure {:.0} kPa",
        sigma_formation, p_sleeper
    );

    let _sleeper_spacing = sleeper_spacing;
}

// ================================================================
// 8. Long Welded Rail -- Thermal Stress
// ================================================================
//
// Continuously welded rail (CWR): no expansion joints.
// Thermal stress: σ = E × α × ΔT
// Neutral temperature: temperature at which rail is stress-free.
// Buckling risk if rail temperature >> neutral temperature.

#[test]
fn railway_long_welded_rail() {
    let e: f64 = 210_000.0;     // MPa, rail steel modulus
    let alpha: f64 = 12e-6;     // 1/°C, thermal expansion
    let a_rail: f64 = 7670.0;   // mm², UIC 60 cross-section

    // Temperature range
    let t_neutral: f64 = 25.0;  // °C, stress-free temperature
    let t_max: f64 = 60.0;      // °C, maximum rail temperature
    let t_min: f64 = -20.0;     // °C, minimum rail temperature

    // Maximum compressive stress (hot)
    let delta_t_hot: f64 = t_max - t_neutral;
    let sigma_comp: f64 = e * alpha * delta_t_hot;
    // = 210000 × 12e-6 × 35 = 88.2 MPa

    assert!(
        sigma_comp > 50.0 && sigma_comp < 150.0,
        "Compressive stress: {:.1} MPa at {:.0}°C", sigma_comp, t_max
    );

    // Maximum tensile stress (cold)
    let delta_t_cold: f64 = t_neutral - t_min;
    let sigma_tens: f64 = e * alpha * delta_t_cold;

    assert!(
        sigma_tens > 50.0,
        "Tensile stress: {:.1} MPa at {:.0}°C", sigma_tens, t_min
    );

    // Compressive force (buckling check)
    let p_comp: f64 = sigma_comp * a_rail / 1000.0; // kN
    // = 88.2 × 7670 / 1000 = 676 kN

    assert!(
        p_comp > 500.0,
        "Compressive force: {:.0} kN", p_comp
    );

    // Lateral resistance needed (to prevent buckling)
    // Typical: > 7-10 kN/sleeper for ballasted track
    let sleeper_spacing: f64 = 0.60; // m
    let f_lateral_per_m: f64 = 15.0; // kN/m (ballast resistance)

    // Euler buckling length (simplified)
    let l_buckle: f64 = std::f64::consts::PI * (e * 1e-3 * a_rail * 1e-6 / f_lateral_per_m).sqrt() * 1000.0;

    assert!(
        l_buckle > 1.0,
        "Buckling half-wave: {:.1} m", l_buckle
    );

    let _sleeper_spacing = sleeper_spacing;
}
