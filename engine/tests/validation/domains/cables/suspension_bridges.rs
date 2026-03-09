/// Validation: Suspension Bridge Engineering
///
/// References:
///   - Gimsing & Georgakis: "Cable Supported Bridges" 3rd ed. (2012)
///   - Irvine: "Cable Structures" (1981)
///   - Pugsley: "The Theory of Suspension Bridges" 2nd ed. (1968)
///   - Steinman & Watson: "Bridges and Their Builders" (1957)
///   - AASHTO LRFD Bridge Design Specifications, 9th ed.
///   - EN 1993-1-11: Design of Structures with Tension Components
///
/// Tests verify catenary/parabolic cable, sag ratio, stiffening girder,
/// aerodynamic stability, hanger design, anchorage, and thermal effects.

// ================================================================
// 1. Parabolic Cable -- Horizontal Force & Tension
// ================================================================
//
// For uniform load w along span L with sag f:
// H = w*L²/(8*f) (horizontal component)
// T_max = H*√(1 + (4f/L)²) at support (approximate)

#[test]
fn suspension_cable_forces() {
    let l: f64 = 1000.0;        // m, main span
    let f: f64 = 100.0;         // m, sag
    let w: f64 = 150.0;         // kN/m, total dead load per cable

    // Sag ratio
    let sag_ratio: f64 = f / l;
    assert!(
        sag_ratio > 0.05 && sag_ratio < 0.15,
        "Sag ratio: {:.3} (typical 1/8 to 1/12)", sag_ratio
    );

    // Horizontal cable force
    let h: f64 = w * l * l / (8.0 * f);
    // = 150 * 1e6 / 800 = 187,500 kN

    assert!(
        h > 100_000.0 && h < 500_000.0,
        "H = {:.0} kN", h
    );

    // Maximum tension (at tower)
    let tan_alpha: f64 = 4.0 * f / l;
    let t_max: f64 = h * (1.0 + tan_alpha * tan_alpha).sqrt();

    assert!(
        t_max > h,
        "T_max = {:.0} > H = {:.0} kN", t_max, h
    );

    // Cable length (parabolic approximation)
    let cable_length: f64 = l * (1.0 + 8.0 / 3.0 * sag_ratio * sag_ratio);
    assert!(
        cable_length > l,
        "Cable length: {:.1} m > span {:.1} m", cable_length, l
    );
}

// ================================================================
// 2. Stiffening Girder -- Deflection Theory
// ================================================================
//
// Live load distribution through stiffening girder.
// Critical parameter: λ² = H/(EI/L²)
// Higher λ → more cable-like behavior.

#[test]
fn suspension_stiffening_girder() {
    let l: f64 = 1000.0;        // m, span
    let f: f64 = 100.0;         // m, sag
    let w_d: f64 = 150.0;       // kN/m, dead load
    let w_l: f64 = 30.0;        // kN/m, live load (full span)
    let ei: f64 = 5.0e9;        // kN·m², girder stiffness

    // Horizontal cable force (dead load)
    let h_d: f64 = w_d * l * l / (8.0 * f);

    // Dimensionless stiffness parameter
    let lambda_sq: f64 = h_d * l * l / ei;
    let lambda: f64 = lambda_sq.sqrt();

    // For typical suspension bridges: λ > 10 (cable-dominant)
    assert!(
        lambda > 5.0,
        "λ = {:.1} (cable-dominant behavior)", lambda
    );

    // Deflection under full live load (linearized)
    // δ ≈ 5*w_l*L⁴/(384*EI) * 1/(1 + λ²) ... simplified
    // More accurately: uniform live load gives additional sag
    let delta_h: f64 = w_l * l * l / (8.0 * f); // additional H from live load
    let delta_f: f64 = f * delta_h / (h_d + delta_h) * w_l / (w_d + w_l);

    assert!(
        delta_f > 0.0 && delta_f < f / 5.0,
        "Live load deflection: {:.2} m", delta_f
    );

    // Half-span loading is critical (antisymmetric)
    // Produces larger deflections than full-span
    let _w_half: f64 = w_l; // half-span loaded
}

// ================================================================
// 3. Main Cable Design -- Wire Bundle
// ================================================================
//
// Main cables: parallel wire or helical strand.
// Parallel wire: higher strength, better fatigue.
// Typical wire: 1770 MPa (Grade 270).
// Safety factor on cable: ≥ 2.5 (AASHTO) to 2.2 (EC).

#[test]
fn suspension_cable_design() {
    let t_max: f64 = 200_000.0;  // kN, maximum cable tension
    let f_u: f64 = 1770.0;       // MPa, wire ultimate strength
    let sf: f64 = 2.5;           // safety factor (AASHTO)

    // Required cable area
    let a_required: f64 = t_max * 1000.0 / (f_u / sf); // mm²

    assert!(
        a_required > 200_000.0,
        "Required area: {:.0} mm²", a_required
    );

    // Wire diameter and count
    let d_wire: f64 = 5.0;      // mm, typical parallel wire
    let a_wire: f64 = std::f64::consts::PI * d_wire * d_wire / 4.0;
    let n_wires: f64 = (a_required / a_wire).ceil();

    assert!(
        n_wires > 10_000.0,
        "Number of wires: {:.0}", n_wires
    );

    // Cable diameter (hexagonal packing, void ratio ~20%)
    let void_ratio: f64 = 0.20;
    let a_cable_gross: f64 = a_required / (1.0 - void_ratio);
    let d_cable: f64 = (4.0 * a_cable_gross / std::f64::consts::PI).sqrt();

    assert!(
        d_cable > 500.0 && d_cable < 1500.0,
        "Cable diameter: {:.0} mm", d_cable
    );

    // Cable weight
    let rho_steel: f64 = 78.5;  // kN/m³
    let w_cable: f64 = a_required * 1e-6 * rho_steel; // kN/m

    assert!(
        w_cable > 10.0,
        "Cable self-weight: {:.1} kN/m", w_cable
    );
}

// ================================================================
// 4. Hanger Design -- Vertical Suspenders
// ================================================================
//
// Hangers carry deck load to main cable.
// Force = tributary length × (dead + live load).
// Must resist fatigue from traffic-induced oscillation.

#[test]
fn suspension_hanger_design() {
    let spacing: f64 = 10.0;    // m, hanger spacing
    let w_total: f64 = 200.0;   // kN/m, total load (per cable plane)

    // Hanger force
    let f_hanger: f64 = w_total * spacing;
    // = 2000 kN

    assert!(
        f_hanger > 1000.0 && f_hanger < 5000.0,
        "Hanger force: {:.0} kN", f_hanger
    );

    // Hanger design (strand rope)
    let f_u_rope: f64 = 1570.0; // MPa
    let sf: f64 = 3.0;          // safety factor for hangers (fatigue)
    let a_hanger: f64 = f_hanger * 1000.0 / (f_u_rope / sf); // mm²

    assert!(
        a_hanger > 1000.0,
        "Hanger area: {:.0} mm²", a_hanger
    );

    // Hanger diameter
    let d_hanger: f64 = (4.0 * a_hanger / std::f64::consts::PI).sqrt();
    assert!(
        d_hanger > 30.0 && d_hanger < 150.0,
        "Hanger diameter: {:.0} mm", d_hanger
    );

    // Live load variation (fatigue)
    let w_live: f64 = 30.0;     // kN/m
    let delta_f: f64 = w_live * spacing; // force range
    let stress_range: f64 = delta_f * 1000.0 / a_hanger;

    // Must be below fatigue limit (~200 MPa for strand at 2M cycles)
    assert!(
        stress_range < 200.0,
        "Stress range: {:.0} MPa < 200 MPa fatigue limit", stress_range
    );
}

// ================================================================
// 5. Aerodynamic Stability -- Flutter Check
// ================================================================
//
// Critical flutter speed: V_cr must exceed design wind speed.
// Selberg formula (approximate): V_cr = k × f_t × B × √(m/(ρ*B²))
// where f_t = torsional frequency, B = deck width.

#[test]
fn suspension_flutter_stability() {
    let b: f64 = 30.0;          // m, deck width
    let m: f64 = 25_000.0;      // kg/m, mass per unit length
    let i_m: f64 = 2_500_000.0; // kg·m²/m, mass moment of inertia
    let f_v: f64 = 0.10;        // Hz, vertical bending frequency
    let f_t: f64 = 0.25;        // Hz, torsional frequency
    let rho: f64 = 1.225;       // kg/m³, air density

    // Frequency ratio (must be > 1 for flutter resistance)
    let freq_ratio: f64 = f_t / f_v;
    assert!(
        freq_ratio > 1.5,
        "f_t/f_v = {:.2} > 1.5 (flutter safety)", freq_ratio
    );

    // Selberg's approximate flutter speed
    let mu: f64 = m / (rho * b * b); // reduced mass
    let r: f64 = (i_m / (m * b * b)).sqrt(); // radius of gyration ratio

    let v_cr: f64 = 5.0 * f_t * b * (mu * r * (1.0 - (f_v / f_t).powi(2))).sqrt();

    // Must exceed design wind speed (e.g., 60 m/s)
    let v_design: f64 = 60.0;
    assert!(
        v_cr > v_design,
        "V_cr = {:.0} m/s > V_design = {:.0} m/s", v_cr, v_design
    );

    // Reduced velocity check
    let v_red: f64 = v_design / (f_t * b);
    assert!(
        v_red < 10.0,
        "Reduced velocity: {:.1} < 10", v_red
    );
}

// ================================================================
// 6. Anchorage Design -- Cable Force Transfer
// ================================================================
//
// Anchorage must resist total cable pull.
// Gravity anchorage: weight × friction ≥ cable H.
// Rock anchorage: anchor capacity ≥ cable T.

#[test]
fn suspension_anchorage() {
    let h: f64 = 200_000.0;     // kN, horizontal cable force
    let v: f64 = 80_000.0;      // kN, vertical cable force at anchorage
    let t: f64 = (h * h + v * v).sqrt(); // total tension

    assert!(
        t > h,
        "T = {:.0} > H = {:.0} kN", t, h
    );

    // Gravity anchorage design
    let gamma_concrete: f64 = 24.0; // kN/m³
    let mu_soil: f64 = 0.50;        // friction coefficient (concrete on rock)
    let sf: f64 = 1.5;              // safety factor

    // Required weight for sliding resistance
    let w_required: f64 = h * sf / mu_soil;

    // Required volume
    let vol_required: f64 = w_required / gamma_concrete;

    assert!(
        vol_required > 10_000.0,
        "Anchorage volume: {:.0} m³", vol_required
    );

    // Overturning check (simplified)
    // Cable enters anchorage at angle α
    let alpha: f64 = (v / h).atan();
    assert!(
        alpha.to_degrees() > 10.0,
        "Cable angle: {:.1}° from horizontal", alpha.to_degrees()
    );

    // Bearing pressure on rock
    let a_bearing: f64 = 400.0; // m², base area
    let q_bearing: f64 = w_required / a_bearing; // kPa

    assert!(
        q_bearing < 2000.0,
        "Bearing pressure: {:.0} kPa", q_bearing
    );
}

// ================================================================
// 7. Thermal Effects -- Cable Sag Change
// ================================================================
//
// Temperature change modifies cable length → sag changes.
// ΔL = α × ΔT × L_cable
// For parabolic cable: Δf/f ≈ 3/(16*(f/L)²) × ΔL/L

#[test]
fn suspension_thermal_effects() {
    let l: f64 = 1000.0;        // m, span
    let f: f64 = 100.0;         // m, sag
    let alpha: f64 = 12e-6;     // 1/°C, thermal expansion (steel)
    let delta_t: f64 = 40.0;    // °C, temperature range

    // Cable length
    let sag_ratio: f64 = f / l;
    let l_cable: f64 = l * (1.0 + 8.0 / 3.0 * sag_ratio * sag_ratio);

    // Thermal length change
    let delta_l: f64 = alpha * delta_t * l_cable;

    assert!(
        delta_l > 0.0 && delta_l < 1.0,
        "Thermal ΔL: {:.3} m", delta_l
    );

    // Sag change (approximate: cable inextensible, length change → sag change)
    // ΔL_cable = (16f/(3L)) × Δf for parabolic cable
    let delta_f: f64 = delta_l * 3.0 * l / (16.0 * f);

    assert!(
        delta_f > 0.0 && delta_f < 5.0,
        "Sag change: {:.2} m for ΔT = {:.0}°C", delta_f, delta_t
    );

    // Deck level change at midspan ≈ Δf
    // This affects road profile → needs expansion joints
    let deck_movement: f64 = delta_f;
    assert!(
        deck_movement < f / 20.0,
        "Deck movement: {:.2} m (< f/20 = {:.2} m)", deck_movement, f / 20.0
    );

    // Horizontal force change
    let w: f64 = 150.0;         // kN/m
    let h_initial: f64 = w * l * l / (8.0 * f);
    let h_hot: f64 = w * l * l / (8.0 * (f + delta_f));
    let delta_h: f64 = (h_initial - h_hot).abs();

    assert!(
        delta_h / h_initial < 0.05,
        "H change: {:.0} kN ({:.1}%)", delta_h, delta_h / h_initial * 100.0
    );
}

// ================================================================
// 8. Tower Design -- Compression & Buckling
// ================================================================
//
// Towers carry cable vertical component + self-weight.
// Must resist buckling under combined axial + lateral loads.
// Tower height ≈ sag + clearance.

#[test]
fn suspension_tower_design() {
    let h_tower: f64 = 150.0;   // m, tower height
    let v_cable: f64 = 80_000.0; // kN, vertical cable force (per side)
    let n_cables: usize = 2;    // two cable planes

    // Total vertical load on tower
    let p_total: f64 = v_cable * n_cables as f64;

    // Tower weight (approximate: concrete, tapered)
    let a_base: f64 = 80.0;     // m², base cross-section
    let a_top: f64 = 30.0;      // m², top cross-section
    let a_avg: f64 = (a_base + a_top) / 2.0;
    let gamma: f64 = 25.0;      // kN/m³ (reinforced concrete)
    let w_tower: f64 = a_avg * h_tower * gamma;

    let n_total: f64 = p_total + w_tower;

    assert!(
        n_total > 200_000.0,
        "Total tower axial: {:.0} kN", n_total
    );

    // Average stress at base
    let sigma_base: f64 = n_total / (a_base * 1e6) * 1000.0; // MPa
    assert!(
        sigma_base < 40.0,
        "Base stress: {:.1} MPa < f'c", sigma_base
    );

    // Slenderness check
    let i_tower: f64 = a_base * a_base / 12.0; // approximate I (m⁴)
    let r: f64 = (i_tower / a_base).sqrt();
    let slenderness: f64 = h_tower / r;

    assert!(
        slenderness < 100.0,
        "Tower slenderness: {:.1}", slenderness
    );

    // Wind load on tower
    let cd: f64 = 1.5;          // drag coefficient
    let q_wind: f64 = 2.0;      // kN/m², wind pressure at height
    let b_tower_avg: f64 = 8.0; // m, average width
    let f_wind: f64 = cd * q_wind * b_tower_avg * h_tower;

    // Base moment from wind
    let m_wind: f64 = f_wind * h_tower / 2.0;

    assert!(
        m_wind > 0.0,
        "Wind base moment: {:.0} kN·m", m_wind
    );
}
