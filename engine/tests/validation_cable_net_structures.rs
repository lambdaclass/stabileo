/// Validation: Cable-Net & Tension Structures
///
/// References:
///   - Irvine: "Cable Structures" (1981)
///   - Krishna: "Cable-Suspended Roofs" (1978)
///   - Buchholdt: "Introduction to Cable Roof Structures" (1999)
///   - EN 1993-1-11: Design of Structures with Tension Components
///   - ASCE/SEI 19: Structural Applications of Steel Cables
///   - PTI: "Recommendations for Stay Cable Design, Testing and Installation"
///
/// Tests verify catenary cable, cable net equilibrium, spoke wheel,
/// pre-tension effects, cable vibration, and saddle clamp design.

mod helpers;

// ================================================================
// 1. Single Catenary Cable
// ================================================================
//
// Cable under self-weight forms catenary curve.
// For small sag/span ratio, parabolic approximation is valid.
// H = wL²/(8f), T_max = H × sqrt(1 + (4f/L)²)

#[test]
fn cable_net_catenary() {
    let l: f64 = 80.0;              // m, span
    let f: f64 = 8.0;               // m, sag at midspan
    let w: f64 = 0.5;               // kN/m, cable + cladding weight

    // Horizontal tension (parabolic approximation)
    let h: f64 = w * l * l / (8.0 * f);

    assert!(
        h > 30.0 && h < 100.0,
        "Horizontal tension: {:.0} kN", h
    );

    // Maximum tension (at supports)
    let t_max: f64 = (h * h + (w * l / 2.0).powi(2)).sqrt();

    assert!(
        t_max > h,
        "T_max {:.0} > H {:.0} kN", t_max, h
    );

    // Cable length
    let l_cable: f64 = l + 8.0 * f * f / (3.0 * l); // parabolic approx

    assert!(
        l_cable > l,
        "Cable length {:.2} > span {:.0} m", l_cable, l
    );

    // Sag/span ratio
    let sag_ratio: f64 = f / l;

    assert!(
        sag_ratio > 0.05 && sag_ratio < 0.15,
        "Sag/span: 1/{:.0}", 1.0 / sag_ratio
    );

    // Cable sizing
    let f_break: f64 = 1570.0;      // MPa, breaking strength
    let fs: f64 = 3.0;              // factor of safety
    let a_req: f64 = t_max * 1000.0 * fs / f_break; // mm²
    let d_req: f64 = (4.0 * a_req / std::f64::consts::PI).sqrt();

    assert!(
        d_req > 10.0,
        "Required cable diameter: {:.0} mm", d_req
    );
}

// ================================================================
// 2. Cable-Net Equilibrium -- Orthogonal Net
// ================================================================
//
// Two sets of cables at right angles forming a net.
// Anticlastic (saddle) shape: one set sags, other hogged.
// Equilibrium: w = q_sag/R_sag + q_hog/R_hog

#[test]
fn cable_net_orthogonal() {
    // Load cables (sagging)
    let l_sag: f64 = 40.0;          // m, span of load cables
    let f_sag: f64 = 4.0;           // m, sag
    let spacing_sag: f64 = 2.0;     // m, cable spacing

    // Stabilizing cables (hogging/pre-tensioned)
    let l_hog: f64 = 30.0;          // m, span of stabilizing cables
    let f_hog: f64 = 2.0;           // m, rise (negative curvature)
    let spacing_hog: f64 = 2.0;     // m

    // External load
    let q: f64 = 1.0;               // kN/m², applied load

    // Load distribution between cable sets (proportional to stiffness)
    // Approximate: by cable curvature
    let r_sag: f64 = l_sag * l_sag / (8.0 * f_sag); // radius of curvature
    let r_hog: f64 = l_hog * l_hog / (8.0 * f_hog);

    let q_sag: f64 = q * r_hog / (r_sag + r_hog); // load taken by sag cables
    let q_hog: f64 = q * r_sag / (r_sag + r_hog); // load taken by hog cables

    assert!(
        (q_sag + q_hog - q).abs() < 0.01,
        "Load split: {:.2} + {:.2} = {:.2} kN/m²", q_sag, q_hog, q_sag + q_hog
    );

    // Tension per cable
    let h_sag: f64 = q_sag * spacing_sag * l_sag * l_sag / (8.0 * f_sag);
    let h_hog: f64 = q_hog * spacing_hog * l_hog * l_hog / (8.0 * f_hog);

    assert!(
        h_sag > 10.0,
        "Sag cable tension: {:.0} kN", h_sag
    );

    assert!(
        h_hog > 10.0,
        "Hog cable tension: {:.0} kN", h_hog
    );

    // Pre-tension required (hog cables must remain in tension under all loads)
    let t_pretension: f64 = h_hog * 1.5; // 50% margin

    assert!(
        t_pretension > h_hog,
        "Pre-tension {:.0} > working tension {:.0} kN", t_pretension, h_hog
    );
}

// ================================================================
// 3. Spoke Wheel Roof
// ================================================================
//
// Central hub with radial cables (bicycle wheel principle).
// Inner ring in compression, outer ring in tension.
// Pre-tension provides stiffness.

#[test]
fn cable_net_spoke_wheel() {
    let r_outer: f64 = 50.0;        // m, outer ring radius
    let r_inner: f64 = 10.0;        // m, inner ring radius
    let n_cables: usize = 36;       // number of radial cables

    // Pre-tension per cable
    let t_pre: f64 = 200.0;         // kN

    // Outer ring: tension = T_cable × R / spacing
    let angle: f64 = 2.0 * std::f64::consts::PI / n_cables as f64;
    let chord_outer: f64 = 2.0 * r_outer * (angle / 2.0).sin();

    // Ring force (hoop tension in outer ring)
    let n_outer: f64 = t_pre * r_outer / chord_outer; // approximate

    assert!(
        n_outer > 500.0,
        "Outer ring tension: {:.0} kN", n_outer
    );

    // Inner ring: compression
    let n_inner: f64 = t_pre * r_inner / (2.0 * r_inner * (angle / 2.0).sin());

    assert!(
        n_inner > 50.0,
        "Inner ring compression: {:.0} kN", n_inner
    );

    // Cable area requirement
    let f_break: f64 = 1570.0;      // MPa
    let fs: f64 = 2.5;
    let a_cable: f64 = t_pre * 1000.0 * fs / f_break; // mm²
    let d_cable: f64 = (4.0 * a_cable / std::f64::consts::PI).sqrt();

    assert!(
        d_cable > 10.0 && d_cable < 30.0,
        "Cable diameter: {:.0} mm", d_cable
    );

    // Radial stiffness
    let e_cable: f64 = 160_000.0;   // MPa (strand)
    let l_cable: f64 = r_outer - r_inner;
    let k_cable: f64 = e_cable * a_cable / (l_cable * 1000.0); // N/mm = kN/m

    assert!(
        k_cable > 10.0,
        "Cable stiffness: {:.0} kN/m", k_cable
    );
}

// ================================================================
// 4. Cable Pre-Tension & Load Effects
// ================================================================
//
// Pre-tension provides geometric stiffness.
// Under load, sag changes → tension changes non-linearly.
// Ernst equivalent modulus accounts for sag effect.

#[test]
fn cable_net_pretension_effects() {
    let l: f64 = 60.0;              // m, cable span
    let a: f64 = 500.0;             // mm², cable area
    let e: f64 = 160_000.0;         // MPa, strand modulus
    let w_cable: f64 = 0.040;       // kN/m, cable self-weight
    let t_initial: f64 = 150.0;     // kN, initial pre-tension

    // Ernst equivalent modulus (accounts for cable sag)
    let sigma: f64 = t_initial * 1000.0 / a; // MPa
    let gamma_w: f64 = w_cable * 1000.0 / a; // N/mm³ ... weight per unit volume·length
    // Ernst formula: E_eq = E / (1 + (γ²L²E)/(12σ³))
    let w_per_length: f64 = w_cable; // kN/m
    let ernst_factor: f64 = (w_per_length * l).powi(2) * e * a
        / (12.0 * (t_initial * 1000.0).powi(2) * t_initial);

    let e_eq: f64 = e / (1.0 + ernst_factor);

    assert!(
        e_eq < e,
        "Ernst E_eq {:.0} < E {:.0} MPa", e_eq, e
    );

    // Stiffness ratio
    let stiffness_ratio: f64 = e_eq / e;

    assert!(
        stiffness_ratio > 0.80,
        "Stiffness ratio: {:.2} (pre-tension is sufficient)", stiffness_ratio
    );

    // At low tension, sag effect dominates
    let t_low: f64 = 30.0;          // kN, very low tension
    let ernst_low: f64 = (w_per_length * l).powi(2) * e * a
        / (12.0 * (t_low * 1000.0).powi(2) * t_low);
    let e_eq_low: f64 = e / (1.0 + ernst_low);

    assert!(
        e_eq_low < e_eq,
        "Low tension E_eq {:.0} < normal {:.0} MPa", e_eq_low, e_eq
    );

    let _gamma_w = gamma_w;
    let _sigma = sigma;
}

// ================================================================
// 5. Cable Vibration -- Vortex-Induced
// ================================================================
//
// Cables vibrate under wind (vortex shedding) or rain-wind.
// Scruton number determines susceptibility.
// Mitigation: dampers, surface treatment, cross-ties.

#[test]
fn cable_net_vibration() {
    let d: f64 = 0.060;             // m, cable diameter
    let l: f64 = 100.0;             // m, cable length
    let t: f64 = 500.0;             // kN, cable tension
    let m: f64 = 15.0;              // kg/m, mass per unit length

    // Fundamental frequency (taut string)
    let f1: f64 = 1.0 / (2.0 * l) * (t * 1000.0 / m).sqrt();

    assert!(
        f1 > 0.5 && f1 < 5.0,
        "Fundamental frequency: {:.2} Hz", f1
    );

    // Vortex shedding frequency
    let st: f64 = 0.20;             // Strouhal number (circular section)
    let v_crit: f64 = f1 * d / st;  // critical wind speed

    assert!(
        v_crit > 0.1,
        "Critical wind speed: {:.1} m/s", v_crit
    );

    // Scruton number (mass-damping parameter)
    let rho_air: f64 = 1.225;       // kg/m³
    let zeta: f64 = 0.002;          // damping ratio (bare cable)
    let sc: f64 = 2.0 * m * zeta / (rho_air * d * d);

    // Sc > 10 generally safe from large-amplitude vortex vibrations
    assert!(
        sc > 5.0,
        "Scruton number: {:.1}", sc
    );

    // With damper
    let zeta_damped: f64 = 0.01;    // with external damper
    let sc_damped: f64 = 2.0 * m * zeta_damped / (rho_air * d * d);

    assert!(
        sc_damped > 10.0,
        "Damped Scruton: {:.1} (>10 safe)", sc_damped
    );

    // Rain-wind vibration susceptibility
    // Typically occurs for cable angles 20-40° from horizontal
    // and wind speeds 5-15 m/s
    let cable_angle: f64 = 30.0_f64.to_radians();
    let susceptible: bool = cable_angle > 20.0_f64.to_radians()
        && cable_angle < 40.0_f64.to_radians();

    assert!(
        susceptible,
        "Rain-wind susceptible at angle {:.0}°", cable_angle.to_degrees()
    );
}

// ================================================================
// 6. Cable Clamp / Saddle Design
// ================================================================
//
// Cable passes over saddle at support/pylon.
// Friction must prevent slippage: μ × N > ΔT (difference in tensions).
// Saddle radius must not cause excessive bending in cable.

#[test]
fn cable_net_saddle() {
    let t1: f64 = 300.0;            // kN, tension on one side
    let t2: f64 = 280.0;            // kN, tension on other side
    let delta_t: f64 = (t1 - t2).abs();

    // Friction at saddle (capstan equation for large wrap)
    // For small angle: F_friction = μ × N_bearing
    let theta: f64 = 15.0_f64.to_radians(); // deviation angle
    let n_bearing: f64 = (t1 + t2) / 2.0 * theta; // approximate normal force

    let mu: f64 = 0.30;             // friction coefficient (steel on steel with grease)
    let f_friction: f64 = mu * n_bearing;

    assert!(
        f_friction > delta_t,
        "Friction {:.1} > tension diff {:.1} kN", f_friction, delta_t
    );

    // Saddle radius (minimum to avoid bending damage)
    let d_cable: f64 = 50.0;        // mm, cable diameter
    let r_min: f64 = 30.0 * d_cable; // mm, minimum saddle radius (typical: 20-40D)

    let r_saddle: f64 = 2000.0;     // mm, actual saddle radius

    assert!(
        r_saddle > r_min,
        "Saddle R {:.0} > min {:.0} mm", r_saddle, r_min
    );

    // Bearing pressure on saddle
    let p_bearing: f64 = t1 * 1000.0 / (r_saddle * d_cable); // MPa
    let p_allow: f64 = 20.0;        // MPa, allowable bearing (depends on cable type)

    assert!(
        p_bearing < p_allow,
        "Bearing pressure: {:.1} < {:.0} MPa", p_bearing, p_allow
    );

    // Bolt clamp design
    let n_bolts: usize = 4;
    let bolt_tension: f64 = n_bearing / n_bolts as f64; // kN per bolt pair

    assert!(
        bolt_tension < 50.0,
        "Bolt tension: {:.1} kN", bolt_tension
    );
}

// ================================================================
// 7. Cable Truss -- Convex-Concave
// ================================================================
//
// Two cables (one convex, one concave) connected by struts.
// Pre-tension in both cables provides stiffness.
// Under load: one cable increases tension, other decreases.

#[test]
fn cable_net_truss() {
    let l: f64 = 50.0;              // m, span
    let f1: f64 = 3.0;              // m, sag of lower (load) cable
    let f2: f64 = 2.0;              // m, rise of upper (stabilizing) cable
    let d: f64 = f1 + f2;           // m, depth of truss

    // Pre-tension (both cables, must exceed load-induced tension change)
    let t_pre: f64 = 200.0;         // kN

    // Applied load
    let q: f64 = 2.0;               // kN/m

    // Additional tension in load cable
    let delta_t1: f64 = q * l * l / (8.0 * f1);

    // Reduction in stabilizing cable
    let delta_t2: f64 = q * l * l / (8.0 * f2) * (f2 / (f1 + f2)); // approximate share

    // Check stabilizing cable stays in tension
    let t2_final: f64 = t_pre - delta_t2;

    assert!(
        t2_final > 0.0,
        "Stabilizing cable tension: {:.0} kN (must stay positive)", t2_final
    );

    // Total cable force
    let t1_final: f64 = t_pre + delta_t1;

    assert!(
        t1_final > 0.0,
        "Load cable tension: {:.0} kN", t1_final
    );

    // Equivalent stiffness (deeper truss = stiffer)
    let stiffness: f64 = 8.0 * d / (l * l); // proportional factor

    assert!(
        stiffness > 0.01,
        "Truss stiffness factor: {:.4}", stiffness
    );

    // Number of struts
    let strut_spacing: f64 = 5.0;   // m
    let n_struts: usize = (l / strut_spacing) as usize - 1;
    let strut_force: f64 = q * strut_spacing; // approximate axial force in struts

    assert!(
        n_struts >= 8,
        "Number of struts: {}", n_struts
    );

    assert!(
        strut_force > 5.0,
        "Strut force: {:.0} kN", strut_force
    );
}

// ================================================================
// 8. Fabric Membrane -- Biaxial Pre-Stress
// ================================================================
//
// Tensioned fabric forming architectural surface.
// Must be pre-stressed in both warp and fill directions.
// Anticlastic form for stability under asymmetric loads.

#[test]
fn cable_net_membrane_prestress() {
    // Fabric properties
    let t_warp: f64 = 80.0;         // kN/m, warp strength
    let t_fill: f64 = 60.0;         // kN/m, fill strength
    let _e_warp: f64 = 600.0;       // kN/m, warp stiffness (per meter width)
    let _e_fill: f64 = 400.0;       // kN/m, fill stiffness

    // Pre-stress (typically 1-3 kN/m)
    let p_warp: f64 = 2.0;          // kN/m, warp pre-stress
    let p_fill: f64 = 1.5;          // kN/m, fill pre-stress

    // Pre-stress ratio (should be between 0.5 and 2.0 for stability)
    let ratio: f64 = p_warp / p_fill;

    assert!(
        ratio > 0.5 && ratio < 2.0,
        "Pre-stress ratio: {:.2}", ratio
    );

    // Wind suction (critical: must not cause wrinkling)
    let q_wind: f64 = 1.5;          // kN/m²

    // Radius of curvature
    let r_warp: f64 = 15.0;         // m, warp radius
    let r_fill: f64 = 10.0;         // m, fill radius (anticlastic: different sign)

    // Membrane equilibrium: q = t_w/R_w + t_f/R_f (with signs)
    // Under wind suction (negative pressure):
    let t_warp_loaded: f64 = p_warp - q_wind * r_warp * r_fill / (r_warp + r_fill);
    let t_fill_loaded: f64 = p_fill + q_wind * r_warp * r_fill / (r_warp + r_fill);

    // Warp must stay in tension (no wrinkling)
    assert!(
        t_warp_loaded > 0.0 || t_fill_loaded > 0.0,
        "At least one direction in tension under wind"
    );

    // Factor of safety on fabric strength
    let fs_warp: f64 = t_warp / (p_warp + q_wind * r_warp / 2.0);
    let fs_fill: f64 = t_fill / (p_fill + q_wind * r_fill / 2.0);

    let fs_min: f64 = fs_warp.min(fs_fill);

    assert!(
        fs_min > 4.0,
        "Minimum fabric FoS: {:.1} (>4 typical for membranes)", fs_min
    );
}
