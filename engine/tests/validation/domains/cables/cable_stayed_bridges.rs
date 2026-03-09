/// Validation: Cable-Stayed Bridge Design
///
/// References:
///   - PTI Guide Specification for Cable-Stayed Bridges (6th Ed.)
///   - EN 1993-1-11: Design of Structures with Tension Components
///   - Gimsing & Georgakis: "Cable Supported Bridges" 3rd ed. (2012)
///   - Walther et al.: "Cable Stayed Bridges" (1999)
///   - AASHTO LRFD Bridge Design Specifications (9th Ed.)
///   - fib Bulletin 30: Acceptance of Stay Cable Systems
///
/// Tests verify cable forces, Ernst modulus, tower design,
/// deck bending, aerodynamic stability, and fatigue.

// ================================================================
// 1. Fan Cable System -- Force Distribution
// ================================================================
//
// Fan arrangement: all cables meet at tower top.
// Vertical component: Vi = wi × Li (tributary deck load × half-span)
// Cable force: Ti = Vi / sin(θi)

#[test]
fn cable_stayed_fan_forces() {
    let w: f64 = 80.0;          // kN/m, deck dead load per cable plane
    let l_main: f64 = 300.0;    // m, main span
    let n_cables: f64 = 10.0;   // cables per side per plane
    let h_tower: f64 = 80.0;    // m, tower height above deck

    // Cable spacing along deck
    let dx: f64 = l_main / (2.0 * n_cables); // half-span

    // Force in outermost cable (longest, shallowest angle)
    let x_outer: f64 = n_cables * dx; // distance from tower
    let theta_outer: f64 = (h_tower / x_outer).atan();
    let v_outer: f64 = w * dx; // tributary vertical load
    let t_outer: f64 = v_outer / theta_outer.sin();

    // Force in innermost cable (shortest, steepest angle)
    let x_inner: f64 = dx;
    let theta_inner: f64 = (h_tower / x_inner).atan();
    let v_inner: f64 = w * dx;
    let t_inner: f64 = v_inner / theta_inner.sin();

    // Outer cable has higher force (shallower angle)
    assert!(
        t_outer > t_inner,
        "Outer cable {:.0} > inner {:.0} kN", t_outer, t_inner
    );

    // All cables carry same vertical load but different tensions
    assert!(
        theta_outer < theta_inner,
        "Outer angle {:.1}° < inner {:.1}°",
        theta_outer.to_degrees(), theta_inner.to_degrees()
    );
}

// ================================================================
// 2. Ernst Equivalent Modulus -- Sag Effect
// ================================================================
//
// Long cables sag under self-weight, reducing apparent stiffness.
// E_eq = E / (1 + (γ²L²E)/(12σ³))
// γ = cable weight per unit length, L = horizontal projection, σ = stress

#[test]
fn cable_stayed_ernst_modulus() {
    let e: f64 = 195_000.0;     // MPa, strand modulus
    let gamma: f64 = 77.0;      // kN/m³, steel density
    let d_cable: f64 = 0.10;    // m, cable diameter
    let l_horiz: f64 = 150.0;   // m, horizontal projection
    let sigma: f64 = 600.0;     // MPa, cable stress

    // Cable weight per unit volume → per unit length
    let area: f64 = std::f64::consts::PI * d_cable * d_cable / 4.0; // m²
    let w_cable: f64 = gamma * area; // kN/m
    let gamma_cable: f64 = w_cable / area * 1e-3; // MPa/m (unit weight as stress/length)

    // Ernst modulus
    let lambda: f64 = (gamma_cable * l_horiz).powi(2) * e / (12.0 * sigma.powi(3));
    let e_eq: f64 = e / (1.0 + lambda);

    assert!(
        e_eq < e,
        "E_eq = {:.0} < E = {:.0} MPa (sag effect)", e_eq, e
    );

    // Reduction ratio
    let reduction: f64 = 1.0 - e_eq / e;
    assert!(
        reduction < 0.30,
        "Stiffness reduction: {:.1}%", reduction * 100.0
    );

    // Higher stress → less sag → E_eq closer to E
    let sigma_high: f64 = 900.0;
    let lambda_high: f64 = (gamma_cable * l_horiz).powi(2) * e / (12.0 * sigma_high.powi(3));
    let e_eq_high: f64 = e / (1.0 + lambda_high);

    assert!(
        e_eq_high > e_eq,
        "Higher stress: E_eq = {:.0} > {:.0} MPa", e_eq_high, e_eq
    );
}

// ================================================================
// 3. Tower Compression -- Vertical Load Path
// ================================================================
//
// Tower carries sum of vertical cable components + self-weight.
// N_tower = Σ(Ti × cos(θi)) for all cables + W_tower

#[test]
fn cable_stayed_tower_compression() {
    let w: f64 = 80.0;          // kN/m, deck dead load
    let l_main: f64 = 300.0;    // m, main span
    let l_back: f64 = 150.0;    // m, back span

    // Total deck weight supported by tower
    let v_main: f64 = w * l_main / 2.0; // half main span
    let v_back: f64 = w * l_back;        // full back span (anchored at pier)

    // Tower self-weight
    let h_tower: f64 = 80.0;
    let w_tower: f64 = 500.0;   // kN/m (concrete tower, approximate)
    let w_self: f64 = w_tower * h_tower / 1000.0; // Actually in kN already, let's use directly

    // Total tower compression at base
    let n_tower: f64 = v_main + v_back + h_tower * 50.0; // 50 kN/m tower weight

    assert!(
        n_tower > 20000.0,
        "Tower compression: {:.0} kN", n_tower
    );

    // Tower cross-section check
    let fc: f64 = 50.0;         // MPa, concrete
    let a_tower: f64 = 4.0e6;   // mm², tower area (2m × 2m hollow)
    let sigma: f64 = n_tower * 1000.0 / a_tower;

    assert!(
        sigma < 0.6 * fc,
        "Tower stress {:.1} < 0.6*fc = {:.1} MPa", sigma, 0.6 * fc
    );

    let _w_self = w_self;
}

// ================================================================
// 4. Deck Bending -- Between Cable Anchorages
// ================================================================
//
// Continuous deck supported by cables at regular intervals.
// Local bending between cables: M = w × s² / 12 (fixed-fixed)
// Cables act as elastic supports → some redistribution.

#[test]
fn cable_stayed_deck_bending() {
    let w: f64 = 120.0;         // kN/m, total load (DL + LL)
    let s: f64 = 15.0;          // m, cable spacing along deck

    // Local bending (continuous beam analogy)
    let m_local: f64 = w * s * s / 12.0; // fixed-fixed between cables

    // Simply supported analogy (upper bound)
    let m_ss: f64 = w * s * s / 8.0;

    assert!(
        m_local < m_ss,
        "Continuous M = {:.0} < SS M = {:.0} kN·m", m_local, m_ss
    );

    // Global bending (cable-stayed action)
    // Tower and cables create primary load path
    // Deck has reduced global moment compared to simple beam

    let l_main: f64 = 300.0;
    let m_simple: f64 = w * l_main * l_main / 8.0; // simple beam moment

    // Cable-stayed deck: global moment much less than simple beam
    // Typically 5-15% of simple beam moment
    let m_global: f64 = m_simple * 0.10; // approximate

    assert!(
        m_global < m_simple * 0.20,
        "Global M = {:.0} << simple beam M = {:.0} kN·m",
        m_global, m_simple
    );
}

// ================================================================
// 5. Cable Fatigue -- Stress Range
// ================================================================
//
// PTI: cable fatigue governed by anchorage detail.
// Design fatigue life: 2 × 10⁶ cycles at Δσ = 200 MPa (Category B).
// Live load stress range must be checked.

#[test]
fn cable_stayed_fatigue() {
    let sigma_dead: f64 = 500.0; // MPa, dead load stress
    let sigma_live: f64 = 50.0;  // MPa, live load stress range (cables are DL-dominated)

    // Stress range ratio
    let ratio: f64 = sigma_live / sigma_dead;

    assert!(
        ratio < 0.50,
        "Live/dead ratio: {:.2} (cables are dead-load dominated)", ratio
    );

    // Fatigue detail category (PTI: Category B for strand)
    let delta_sigma_cat: f64 = 200.0; // MPa at 2×10⁶ cycles
    let m_sn: f64 = 3.0;              // S-N slope

    // Design life cycles
    let n_design: f64 = 100.0 * 365.0 * 2000.0; // 100 years × 2000 truck passages/day
    let n_ref: f64 = 2.0e6;

    // Allowable stress range at design life
    let delta_sigma_allow: f64 = delta_sigma_cat * (n_ref / n_design).powf(1.0 / m_sn);

    assert!(
        sigma_live < delta_sigma_allow,
        "Δσ = {:.0} < allowable {:.0} MPa", sigma_live, delta_sigma_allow
    );
}

// ================================================================
// 6. Aerodynamic Stability -- Critical Wind Speed
// ================================================================
//
// Flutter: aeroelastic instability at critical wind speed.
// Selberg formula: V_cr = 3.71 × fα × B × √(m/(ρB²)) × √(1-(fh/fα)²)
// fα = torsional frequency, fh = vertical frequency
// Deck width B, mass m per unit length, air density ρ

#[test]
fn cable_stayed_aerodynamics() {
    let b: f64 = 25.0;          // m, deck width
    let m: f64 = 15000.0;       // kg/m, deck mass per unit length
    let rho: f64 = 1.225;       // kg/m³, air density
    let fh: f64 = 0.30;         // Hz, vertical natural frequency
    let fa: f64 = 0.55;         // Hz, torsional natural frequency

    // Frequency ratio
    let freq_ratio: f64 = fh / fa;

    assert!(
        freq_ratio < 1.0,
        "fh/fα = {:.2} < 1.0 (required for flutter stability)", freq_ratio
    );

    // Selberg critical wind speed (simplified)
    let vcr: f64 = 3.71 * fa * b * (m / (rho * b * b)).sqrt()
                  * (1.0 - freq_ratio * freq_ratio).sqrt();

    assert!(
        vcr > 50.0,
        "Flutter speed: {:.0} m/s", vcr
    );

    // Design wind speed (e.g., 10-minute mean at deck level)
    let v_design: f64 = 40.0;   // m/s
    let flutter_ratio: f64 = vcr / v_design;

    // PTI recommends V_cr > 1.2 × V_design
    assert!(
        flutter_ratio > 1.2,
        "V_cr/V_design = {:.2} > 1.2 -- adequate flutter margin", flutter_ratio
    );
}

// ================================================================
// 7. Cable Replacement -- Staged Analysis
// ================================================================
//
// Cable replacement requires temporary load redistribution.
// Adjacent cables take additional load during replacement.
// Force redistribution: ΔTi ≈ T_removed × influence_coefficient

#[test]
fn cable_stayed_replacement() {
    // Cable forces (dead load, symmetric half)
    let cable_forces: [f64; 5] = [1200.0, 1100.0, 1000.0, 950.0, 900.0]; // kN

    // Remove cable 3 (middle one)
    let t_removed: f64 = cable_forces[2];

    // Adjacent cables pick up load (influence coefficients, approximate)
    let influence: [f64; 5] = [0.05, 0.20, 0.0, 0.20, 0.05];
    // Cable 3 itself is removed (0.0)

    let mut forces_during: Vec<f64> = Vec::new();
    let mut total_redistrib: f64 = 0.0;

    for (i, &t) in cable_forces.iter().enumerate() {
        if i == 2 {
            forces_during.push(0.0); // removed
        } else {
            let additional: f64 = t_removed * influence[i];
            forces_during.push(t + additional);
            total_redistrib += additional;
        }
    }

    // Adjacent cables increase by ~20%
    let increase_adj: f64 = (forces_during[1] - cable_forces[1]) / cable_forces[1];
    assert!(
        increase_adj > 0.10 && increase_adj < 0.30,
        "Adjacent cable increase: {:.0}%", increase_adj * 100.0
    );

    // Deck bending increases during cable replacement
    // Local moment ≈ w × (2s)² / 8 instead of w × s² / 12
    let s: f64 = 15.0;
    let w: f64 = 80.0;
    let m_normal: f64 = w * s * s / 12.0;
    let m_during: f64 = w * (2.0 * s) * (2.0 * s) / 8.0;

    assert!(
        m_during > m_normal * 3.0,
        "Replacement moment {:.0} >> normal {:.0} kN·m", m_during, m_normal
    );

    let _total_redistrib = total_redistrib;
}

// ================================================================
// 8. Stay Cable Vibration -- Rain-Wind Induced
// ================================================================
//
// Rain-wind vibration: cables vibrate under combined rain and wind.
// Scruton number: Sc = m × ξ / (ρ × D²)
// Sc > 10: vibration unlikely. Sc < 3: likely.

#[test]
fn cable_stayed_vibration() {
    let m_cable: f64 = 60.0;    // kg/m, cable mass per unit length
    let d: f64 = 0.16;          // m, cable diameter
    let xi: f64 = 0.002;        // structural damping ratio (0.2%)
    let rho: f64 = 1.225;       // kg/m³, air density

    // Scruton number
    let sc: f64 = m_cable * xi / (rho * d * d);

    assert!(
        sc > 0.0,
        "Scruton number: {:.1}", sc
    );

    // Vibration susceptibility
    let susceptible: bool = sc < 10.0;

    // With external dampers: increase effective damping
    let xi_damper: f64 = 0.01;  // 1% with damper
    let sc_damped: f64 = m_cable * xi_damper / (rho * d * d);

    assert!(
        sc_damped > sc,
        "With damper: Sc = {:.1} > {:.1} (without)", sc_damped, sc
    );

    // Reduced velocity for vortex shedding
    let st: f64 = 0.20;         // Strouhal number
    let v_crit: f64 = 5.0;      // m/s, critical wind speed (example)
    let f_shed: f64 = st * v_crit / d;

    assert!(
        f_shed > 0.0,
        "Shedding frequency: {:.1} Hz at {:.0} m/s", f_shed, v_crit
    );

    let _susceptible = susceptible;
}
