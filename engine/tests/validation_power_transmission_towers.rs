/// Validation: Power Transmission Tower Design
///
/// References:
///   - ASCE 10-15: Design of Latticed Steel Transmission Structures
///   - EN 50341-1: Overhead Electrical Lines -- General Requirements
///   - IEC 60826: Design Criteria of Overhead Transmission Lines
///   - IEEE 693: Recommended Practice for Seismic Design of Substations
///   - Kiessling et al.: "Overhead Power Lines" (2003)
///   - EPRI: Transmission Line Reference Book (2009)
///
/// Tests verify conductor loads, wind on conductors, tower member design,
/// foundation, insulator strings, galloping, and broken wire condition.

mod helpers;

// ================================================================
// 1. Conductor Sag-Tension -- Catenary
// ================================================================
//
// Conductor sags under self-weight + ice.
// Change of state equation: relates sag/tension at different temperatures.
// H² × (H - H₁) = w² × L² × EA / 24 × (T change effects)

#[test]
fn tower_conductor_sag_tension() {
    let w: f64 = 1.5;           // kg/m, conductor weight (ACSR Drake)
    let span: f64 = 400.0;      // m
    let h_tension: f64 = 40.0;  // kN, horizontal tension (everyday)
    let g: f64 = 9.81 / 1000.0; // kN/kg

    // Sag (parabolic approximation)
    let w_kn: f64 = w * g;      // kN/m
    let sag: f64 = w_kn * span * span / (8.0 * h_tension);
    // = 0.0147 × 160000 / 320 = 7.35 m

    assert!(
        sag > 5.0 && sag < 20.0,
        "Conductor sag: {:.1} m", sag
    );

    // Conductor length (parabolic)
    let l_cond: f64 = span * (1.0 + 8.0 / 3.0 * (sag / span).powi(2));

    assert!(
        l_cond > span,
        "Conductor length: {:.2} m > span {:.0} m", l_cond, span
    );

    // Clearance check (minimum ground clearance)
    let h_attachment: f64 = 25.0; // m above ground
    let clearance: f64 = h_attachment - sag;

    assert!(
        clearance > 8.0,
        "Ground clearance: {:.1} m (> 8m minimum)", clearance
    );

    // Ruling span concept (for multiple spans)
    let spans: [f64; 3] = [350.0, 400.0, 450.0];
    let sum_l3: f64 = spans.iter().map(|s| s.powi(3)).sum::<f64>();
    let sum_l: f64 = spans.iter().sum::<f64>();
    let ruling_span: f64 = (sum_l3 / sum_l).sqrt();

    assert!(
        ruling_span > 380.0 && ruling_span < 420.0,
        "Ruling span: {:.0} m", ruling_span
    );
}

// ================================================================
// 2. Wind Load on Conductors
// ================================================================
//
// F_wind = q × Cd × d × L × cos²(θ)
// q = ½ρv², Cd ≈ 1.0 for conductor, d = diameter
// Wind span = average of adjacent spans

#[test]
fn tower_wind_on_conductors() {
    let v_wind: f64 = 40.0;     // m/s, design wind speed
    let rho: f64 = 1.225;       // kg/m³
    let d_cond: f64 = 0.028;    // m, conductor diameter (ACSR Drake)
    let cd: f64 = 1.0;          // drag coefficient (circular conductor)

    // Wind pressure
    let q: f64 = 0.5 * rho * v_wind * v_wind; // Pa = N/m²

    assert!(
        q > 500.0 && q < 1500.0,
        "Wind pressure: {:.0} Pa", q
    );

    // Wind load per meter of conductor
    let f_wind_per_m: f64 = cd * q * d_cond / 1000.0; // kN/m

    assert!(
        f_wind_per_m > 0.01,
        "Wind on conductor: {:.3} kN/m", f_wind_per_m
    );

    // Wind span (for tower loading)
    let wind_span: f64 = 400.0; // m (average of adjacent spans)
    let n_conductors: usize = 3; // 3-phase line, single circuit
    let n_sub: usize = 2;       // bundled conductors

    // Total wind load on tower from conductors
    let f_wind_total: f64 = f_wind_per_m * wind_span * (n_conductors * n_sub) as f64;

    assert!(
        f_wind_total > 10.0,
        "Total conductor wind: {:.1} kN", f_wind_total
    );

    // Add ground wire
    let d_gw: f64 = 0.010;      // m, ground wire diameter
    let f_wind_gw: f64 = cd * q * d_gw / 1000.0 * wind_span;

    let f_wind_all: f64 = f_wind_total + f_wind_gw;

    assert!(
        f_wind_all > f_wind_total,
        "Total with GW: {:.1} kN", f_wind_all
    );
}

// ================================================================
// 3. Tower Leg Member -- Compression Design
// ================================================================
//
// Lattice tower legs: single angles or back-to-back angles.
// Slenderness: L/r, consider effective length and eccentricity.
// ASCE 10: modified buckling curves for angles.

#[test]
fn tower_leg_member() {
    // Single angle leg member
    let a: f64 = 3400.0;        // mm², L150×150×12 angle
    let r_min: f64 = 29.5;      // mm, minimum radius of gyration
    let fy: f64 = 350.0;        // MPa
    let e: f64 = 200_000.0;     // MPa

    let l_member: f64 = 3000.0; // mm, panel length
    let k: f64 = 0.9;           // effective length factor (bolted connections)

    // Slenderness
    let lambda: f64 = k * l_member / r_min;

    assert!(
        lambda > 50.0 && lambda < 150.0,
        "Slenderness: {:.0}", lambda
    );

    // ASCE 10 compression capacity
    let cc: f64 = (2.0 * std::f64::consts::PI * std::f64::consts::PI * e / fy).sqrt();
    // = √(2π²×200000/350) = 106.0

    let fa: f64 = if lambda < cc {
        fy * (1.0 - 0.5 * (lambda / cc).powi(2))
    } else {
        std::f64::consts::PI * std::f64::consts::PI * e / (lambda * lambda)
    };

    let p_capacity: f64 = fa * a / 1000.0; // kN

    assert!(
        p_capacity > 200.0,
        "Leg capacity: {:.0} kN", p_capacity
    );

    // Applied load
    let p_applied: f64 = 400.0; // kN (from tower analysis)
    let utilization: f64 = p_applied / p_capacity;

    assert!(
        utilization > 0.0 && utilization < 2.0,
        "Utilization: {:.2}", utilization
    );
}

// ================================================================
// 4. Foundation -- Stub Angle & Grillage
// ================================================================
//
// Lattice tower foundations resist uplift (critical) and compression.
// Uplift from wind overturning moment.
// Types: grillage, pad & chimney, drilled shaft.

#[test]
fn tower_foundation() {
    let h_tower: f64 = 40.0;    // m, tower height
    let f_wind: f64 = 100.0;    // kN, total horizontal wind
    let w_tower: f64 = 50.0;    // kN, tower weight
    let base_width: f64 = 8.0;  // m, base width (square)

    // Overturning moment at base
    let m_ot: f64 = f_wind * h_tower * 0.6; // resultant at ~0.6H

    // Leg reactions (4 legs)
    let r_vertical: f64 = m_ot / base_width; // per leg, from overturning
    let r_dead: f64 = w_tower / 4.0;         // per leg, from dead load

    // Uplift on windward leg
    let r_uplift: f64 = r_vertical - r_dead;

    assert!(
        r_uplift > 100.0,
        "Uplift per leg: {:.0} kN", r_uplift
    );

    // Compression on leeward leg
    let r_compression: f64 = r_vertical + r_dead;

    assert!(
        r_compression > r_uplift,
        "Compression {:.0} > uplift {:.0} kN", r_compression, r_uplift
    );

    // Foundation sizing (grillage: dead weight + soil weight)
    let gamma_soil: f64 = 18.0; // kN/m³
    let depth: f64 = 2.5;       // m
    let sf: f64 = 1.5;          // safety factor on uplift

    // Required weight of foundation block
    let w_required: f64 = r_uplift * sf;
    let vol_required: f64 = w_required / gamma_soil;
    let side: f64 = (vol_required / depth).sqrt();

    assert!(
        side > 1.0 && side < 5.0,
        "Foundation: {:.1}m × {:.1}m × {:.1}m deep", side, side, depth
    );
}

// ================================================================
// 5. Insulator String -- Mechanical Design
// ================================================================
//
// Insulator strings carry conductor weight + wind.
// Swing angle: θ = atan(F_wind / F_vertical)
// Must maintain electrical clearances at maximum swing.

#[test]
fn tower_insulator_string() {
    let w_cond: f64 = 15.0;     // kN, conductor weight span
    let w_insulator: f64 = 1.5; // kN, insulator string weight
    let f_wind_cond: f64 = 8.0; // kN, wind on conductor

    // Total vertical
    let v: f64 = w_cond + w_insulator;

    // Swing angle under wind
    let theta: f64 = (f_wind_cond / v).atan();

    assert!(
        theta.to_degrees() > 10.0 && theta.to_degrees() < 60.0,
        "Swing angle: {:.1}°", theta.to_degrees()
    );

    // Resultant tension in string
    let t_string: f64 = (v * v + f_wind_cond * f_wind_cond).sqrt();

    assert!(
        t_string > v,
        "String tension: {:.1} kN", t_string
    );

    // Insulator mechanical strength (typical: 120 kN rating)
    let t_rated: f64 = 120.0;   // kN
    let sf: f64 = t_rated / t_string;

    assert!(
        sf > 2.0,
        "Insulator SF = {:.1}", sf
    );

    // Insulator string length (for voltage level)
    let voltage: f64 = 230.0;   // kV
    let creepage: f64 = 25.0;   // mm/kV (for moderate pollution)
    let l_string: f64 = voltage * creepage; // mm total creepage

    // Number of discs (standard disc: ~280mm creepage)
    let creepage_per_disc: f64 = 280.0;
    let n_discs: usize = (l_string / creepage_per_disc).ceil() as usize;

    assert!(
        n_discs > 15,
        "Number of discs: {}", n_discs
    );
}

// ================================================================
// 6. Galloping -- Conductor Oscillation
// ================================================================
//
// Galloping: low-frequency, large-amplitude oscillation.
// Caused by ice on conductor creating aerodynamic instability.
// Amplitude can reach several meters.

#[test]
fn tower_conductor_galloping() {
    let sag: f64 = 10.0;        // m, conductor sag
    let span: f64 = 400.0;      // m

    // Galloping amplitude (Den Hartog criterion)
    // Typical: 0.5 to 2.0 × sag
    let amp_factor: f64 = 0.3;  // mild galloping
    let y_max: f64 = amp_factor * sag;

    assert!(
        y_max > 2.0 && y_max < 20.0,
        "Galloping amplitude: {:.1} m", y_max
    );

    // Phase-to-phase clearance check
    let phase_spacing: f64 = 6.0; // m, vertical phase spacing
    let clearance_min: f64 = phase_spacing - 2.0 * y_max;

    assert!(
        clearance_min > -5.0,
        "Clearance during galloping: {:.1} m", clearance_min
    );

    // If clearance < 0: need anti-galloping devices or larger spacing
    if clearance_min < 0.0 {
        let spacing_required: f64 = 2.0 * y_max + 1.0; // 1m safety margin
        assert!(
            spacing_required > phase_spacing,
            "Need {:.1}m spacing (currently {:.1}m)", spacing_required, phase_spacing
        );
    }

    // Galloping loads on tower (dynamic)
    let w_cond: f64 = 1.5 * 9.81 / 1000.0 * span; // kN
    let f_gallop: f64 = 4.0 * std::f64::consts::PI * std::f64::consts::PI * w_cond * y_max / (span * span) * span;

    assert!(
        f_gallop > 0.0,
        "Galloping load: {:.1} kN", f_gallop
    );
}

// ================================================================
// 7. Broken Wire Condition -- Longitudinal Load
// ================================================================
//
// One conductor breaks: unbalanced tension on tower.
// Most critical for angle and dead-end towers.
// Residual static load: 70-100% of design tension.

#[test]
fn tower_broken_wire() {
    let t_conductor: f64 = 50.0; // kN, conductor tension
    let n_conductors: usize = 6; // 3-phase double circuit
    let h_crossarm: f64 = 35.0; // m, height of broken wire attachment

    // One wire breaks: unbalanced longitudinal load
    let rsf: f64 = 0.70;        // residual static factor
    let f_broken: f64 = rsf * t_conductor;

    assert!(
        f_broken > 30.0,
        "Broken wire load: {:.0} kN", f_broken
    );

    // Torsional moment on tower (if conductor on one side)
    let arm: f64 = 3.0;         // m, crossarm half-length
    let m_torsion: f64 = f_broken * arm;

    assert!(
        m_torsion > 50.0,
        "Torsion on tower: {:.0} kN·m", m_torsion
    );

    // Longitudinal moment at base
    let m_base_long: f64 = f_broken * h_crossarm;

    assert!(
        m_base_long > 1000.0,
        "Longitudinal base moment: {:.0} kN·m", m_base_long
    );

    // Cascade failure prevention
    // Adjacent towers must resist unbalanced load from broken span
    let l_cascade: usize = 3;   // containment within 3 towers
    let intact_wires: usize = n_conductors - 1;

    assert!(
        intact_wires >= 5,
        "Intact conductors: {} (redundancy)", intact_wires
    );

    let _l_cascade = l_cascade;
}

// ================================================================
// 8. Aeolian Vibration -- High-Frequency
// ================================================================
//
// Aeolian vibration: vortex-induced, low amplitude, high frequency.
// Frequency: f = St × V / d (St ≈ 0.185 for circular conductor)
// Causes fatigue at clamp locations.

#[test]
fn tower_aeolian_vibration() {
    let d: f64 = 28.0;          // mm, conductor diameter
    let st: f64 = 0.185;        // Strouhal number for circular conductor

    // Wind speed range for aeolian vibration
    let v_min: f64 = 1.0;       // m/s (onset)
    let v_max: f64 = 7.0;       // m/s (above this: turbulence suppresses)

    // Frequency range
    let f_min: f64 = st * v_min / (d / 1000.0);
    let f_max: f64 = st * v_max / (d / 1000.0);

    assert!(
        f_min > 3.0 && f_max < 100.0,
        "Frequency range: {:.0} to {:.0} Hz", f_min, f_max
    );

    // Amplitude (limited by self-damping)
    // Typical: y/d < 1 (peak-to-peak / diameter)
    let y_max: f64 = d * 0.5 / 1000.0; // m, one-sided amplitude

    assert!(
        y_max < 0.020,
        "Vibration amplitude: {:.1} mm", y_max * 1000.0
    );

    // Bending stress at clamp (fatigue critical)
    let ei: f64 = 500.0;        // N·m², conductor bending stiffness
    let h_tension: f64 = 40_000.0; // N, conductor tension
    let lambda: f64 = (h_tension / ei).sqrt(); // 1/m

    // Bending strain at clamp
    let sigma_a: f64 = y_max * lambda * lambda * ei * d / 2000.0 / 1e-3; // approximate

    // Stockbridge damper effectiveness
    let damper_reduction: f64 = 0.50; // 50% reduction in amplitude with damper
    let y_damped: f64 = y_max * (1.0 - damper_reduction);

    assert!(
        y_damped < y_max,
        "Damped amplitude: {:.1} mm (vs {:.1} mm)", y_damped * 1000.0, y_max * 1000.0
    );

    let _sigma_a = sigma_a;
}
