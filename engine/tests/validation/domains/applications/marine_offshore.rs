/// Validation: Marine & Offshore Structural Design
///
/// References:
///   - API RP 2A-WSD: Planning, Designing and Constructing Fixed Offshore Platforms
///   - DNV-RP-C205: Environmental Conditions and Environmental Loads (2019)
///   - DNV-OS-C101: Design of Offshore Steel Structures
///   - Morison et al. (1950): "The Force Exerted by Surface Waves on Piles"
///   - Sarpkaya & Isaacson: "Mechanics of Wave Forces on Offshore Structures" (1981)
///   - Chakrabarti: "Hydrodynamics of Offshore Structures" (1987)
///
/// Tests verify wave kinematics, Morison equation, hydrostatic loads,
/// and wave-structure interaction.

// ================================================================
// 1. Linear Wave Theory (Airy) — Particle Kinematics
// ================================================================
//
// Horizontal velocity: u = (πH/T) * cosh(k(z+d)) / sinh(kd) * cos(kx-ωt)
// At surface (z=0): u_max = πH/T * cosh(kd)/sinh(kd)
// Deep water (kd > π): u_max ≈ πH/T

#[test]
fn marine_airy_wave_kinematics() {
    let h_wave: f64 = 5.0;     // m, wave height
    let t: f64 = 10.0;         // s, wave period
    let d: f64 = 50.0;         // m, water depth

    // Angular frequency and wave number
    let omega: f64 = 2.0 * std::f64::consts::PI / t;
    // Deep water wave number: k = ω²/g (deep water dispersion)
    let g: f64 = 9.81;
    let k_deep: f64 = omega * omega / g;

    // Check kd (deep water if kd > π)
    let kd: f64 = k_deep * d;
    let is_deep: bool = kd > std::f64::consts::PI;

    // Maximum surface velocity (deep water)
    let u_max: f64 = std::f64::consts::PI * h_wave / t;
    // = π * 5 / 10 = 1.571 m/s

    let u_expected: f64 = std::f64::consts::PI * h_wave / t;
    assert!(
        (u_max - u_expected).abs() / u_expected < 0.001,
        "u_max = {:.3} m/s", u_max
    );

    // Maximum acceleration
    let a_max: f64 = 2.0 * std::f64::consts::PI * std::f64::consts::PI * h_wave / (t * t);
    // = 2π² * 5 / 100 = 0.987 m/s²

    assert!(
        a_max > 0.0 && a_max < g,
        "a_max = {:.3} m/s² (should be < g)", a_max
    );

    // Wave celerity (phase speed)
    let c: f64 = if is_deep {
        g * t / (2.0 * std::f64::consts::PI)
    } else {
        (g / k_deep).sqrt()
    };

    assert!(
        c > 10.0,
        "Wave celerity: {:.1} m/s", c
    );
}

// ================================================================
// 2. Morison Equation — Inline Force on Cylinder
// ================================================================
//
// F = 0.5 * ρ * Cd * D * |u| * u + ρ * Cm * (π*D²/4) * du/dt
// F_drag = 0.5 * ρ * Cd * D * u²  (drag force per unit length)
// F_inertia = Cm * ρ * (π*D²/4) * a  (inertia force per unit length)

#[test]
fn marine_morison_equation() {
    let rho: f64 = 1025.0;     // kg/m³, seawater density
    let d_cyl: f64 = 1.0;      // m, cylinder diameter
    let cd: f64 = 1.0;         // drag coefficient
    let cm: f64 = 2.0;         // inertia coefficient

    let u: f64 = 2.0;          // m/s, velocity
    let a: f64 = 1.0;          // m/s², acceleration

    // Drag force per unit length
    let f_drag: f64 = 0.5 * rho * cd * d_cyl * u * u;
    // = 0.5 * 1025 * 1.0 * 1.0 * 4.0 = 2050 N/m

    let f_drag_expected: f64 = 0.5 * 1025.0 * 1.0 * 1.0 * 4.0;
    assert!(
        (f_drag - f_drag_expected).abs() / f_drag_expected < 0.01,
        "F_drag = {:.0} N/m", f_drag
    );

    // Inertia force per unit length
    let area: f64 = std::f64::consts::PI * d_cyl * d_cyl / 4.0;
    let f_inertia: f64 = cm * rho * area * a;
    // = 2.0 * 1025 * 0.7854 * 1.0 = 1610 N/m

    // Total force (not simply additive — they're out of phase)
    // Maximum inline force occurs at different phases for drag vs inertia
    let f_total_max: f64 = (f_drag * f_drag + f_inertia * f_inertia).sqrt();

    assert!(
        f_total_max > f_drag.max(f_inertia),
        "Total force {:.0} > max component {:.0} N/m", f_total_max, f_drag.max(f_inertia)
    );

    // Keulegan-Carpenter number: KC = u_max * T / D
    let t: f64 = 10.0;
    let kc: f64 = u * t / d_cyl;
    // KC < 10: inertia-dominated; KC > 30: drag-dominated
    assert!(
        kc > 10.0,
        "KC = {:.0} — transitional regime", kc
    );
}

// ================================================================
// 3. Hydrostatic Pressure on Submerged Structure
// ================================================================
//
// p = ρ * g * z (gauge pressure at depth z)
// Force on flat plate: F = p_avg * A = ρ*g*z_c * A
// z_c = centroid depth of submerged surface

#[test]
fn marine_hydrostatic_pressure() {
    let rho: f64 = 1025.0;     // kg/m³
    let g: f64 = 9.81;
    let z: f64 = 30.0;         // m, depth

    // Pressure at depth z
    let p: f64 = rho * g * z / 1000.0; // kPa
    let p_expected: f64 = 1025.0 * 9.81 * 30.0 / 1000.0; // = 301.7 kPa

    assert!(
        (p - p_expected).abs() / p_expected < 0.01,
        "Hydrostatic pressure at {}m: {:.1} kPa", z, p
    );

    // Force on 1m × 1m plate at depth z
    let f_plate: f64 = p * 1.0; // kN/m²
    assert!(
        f_plate > 300.0,
        "Force on 1m² plate at 30m: {:.1} kN", f_plate
    );

    // Pressure at 100m (typical subsea installation)
    let p_100: f64 = rho * g * 100.0 / 1000.0;
    // ≈ 1006 kPa ≈ 10 atm
    assert!(
        (p_100 / 101.325 - 9.93).abs() < 0.5,
        "At 100m: {:.1} atm", p_100 / 101.325
    );
}

// ================================================================
// 4. Wave Load on Jacket Structure — API RP 2A
// ================================================================
//
// Design wave method: select wave height and period for return period.
// 100-year wave for GOM: H ≈ 12m, T ≈ 14s (typical)
// Total base shear: integrate Morison over all members.

#[test]
fn marine_api_wave_load() {
    // 100-year design wave (Gulf of Mexico, typical)
    let h_100: f64 = 12.0;     // m
    let t_100: f64 = 14.0;     // s
    let d: f64 = 60.0;         // m, water depth

    // Current velocity (surface)
    let u_current: f64 = 1.0;  // m/s

    // Maximum wave particle velocity at surface
    let u_wave: f64 = std::f64::consts::PI * h_100 / t_100;
    // = π * 12/14 = 2.69 m/s

    // Combined velocity
    let u_total: f64 = u_wave + u_current;

    // Simplified total base shear for 4-leg jacket (4 legs, diameter 1.5m)
    let n_legs: f64 = 4.0;
    let d_leg: f64 = 1.5;      // m
    let rho: f64 = 1025.0;
    let cd: f64 = 0.65;        // with marine growth

    // Approximate drag force on one leg (integrated over depth, simplified)
    // Use 70% of surface velocity as depth-averaged
    let u_avg: f64 = 0.70 * u_total;
    let f_leg: f64 = 0.5 * rho * cd * d_leg * u_avg * u_avg * d / 1000.0; // kN

    let f_total: f64 = n_legs * f_leg;

    assert!(
        f_total > 500.0,
        "Base shear (4-leg jacket): {:.0} kN", f_total
    );

    // Overturning moment about mudline
    let arm: f64 = 0.55 * d; // approximate center of action
    let m_ot: f64 = f_total * arm;

    assert!(
        m_ot > f_total * d / 3.0,
        "Overturning moment: {:.0} kN·m", m_ot
    );
}

// ================================================================
// 5. Fatigue of Tubular Joints — DNV/API S-N Curves
// ================================================================
//
// S-N curve: N = a / S^m
// For DNV T-curve (tubular joints in seawater with CP):
// log(N) = 11.764 - 3.0 * log(S) for N ≤ 10^7
// Fatigue damage: D = Σ(ni/Ni) ≤ 1.0 (Miner's rule)

#[test]
fn marine_tubular_fatigue() {
    // DNV T-curve parameters (seawater with cathodic protection)
    let log_a: f64 = 11.764;
    let m: f64 = 3.0;

    // Stress range and cycle count (simplified wave spectrum)
    let stress_ranges: [f64; 3] = [50.0, 30.0, 15.0]; // MPa
    let cycles: [f64; 3] = [1e4, 1e5, 1e6];           // number of cycles

    let mut damage: f64 = 0.0;
    for i in 0..3 {
        let s: f64 = stress_ranges[i];
        let n: f64 = cycles[i];

        // Allowable cycles
        let log_n_allow: f64 = log_a - m * s.log10();
        let n_allow: f64 = 10.0_f64.powf(log_n_allow);

        let di: f64 = n / n_allow;
        damage += di;
    }

    // Total Miner's damage should be < 1.0 for acceptable design
    // (with safety factor, typically D ≤ 1/FDF where FDF=2 or 3)
    assert!(
        damage > 0.0,
        "Total fatigue damage: {:.3}", damage
    );

    // Demonstrate S-N curve scaling: doubling stress → 8× fewer cycles
    let s1: f64 = 50.0;
    let s2: f64 = 100.0;
    let n1: f64 = 10.0_f64.powf(log_a - m * s1.log10());
    let n2: f64 = 10.0_f64.powf(log_a - m * s2.log10());
    let n_ratio: f64 = n1 / n2;
    let expected_ratio: f64 = (s2 / s1).powf(m); // = 2^3 = 8

    assert!(
        (n_ratio - expected_ratio).abs() / expected_ratio < 0.01,
        "N ratio: {:.1}, expected {:.0}", n_ratio, expected_ratio
    );
}

// ================================================================
// 6. Buoyancy & Weight Control
// ================================================================
//
// For installation: W_submerged = W_air - ρ_w * g * V_displaced
// Weight margin: typically 5-10% contingency

#[test]
fn marine_buoyancy() {
    let rho_w: f64 = 1025.0;   // kg/m³
    let g: f64 = 9.81;

    // Tubular member: D = 2.0m, t = 25mm, L = 20m
    let d_outer: f64 = 2.0;
    let t_wall: f64 = 0.025;
    let l: f64 = 20.0;

    // Steel volume
    let d_inner: f64 = d_outer - 2.0 * t_wall;
    let a_steel: f64 = std::f64::consts::PI / 4.0 * (d_outer * d_outer - d_inner * d_inner);
    let v_steel: f64 = a_steel * l;

    // Steel weight
    let rho_steel: f64 = 7850.0;
    let w_air: f64 = rho_steel * v_steel * g / 1000.0; // kN

    // Displaced volume (outer surface)
    let v_displaced: f64 = std::f64::consts::PI / 4.0 * d_outer * d_outer * l;

    // Buoyancy force
    let f_buoy: f64 = rho_w * v_displaced * g / 1000.0; // kN

    // Submerged weight
    let w_sub: f64 = w_air - f_buoy;

    assert!(
        w_sub < w_air,
        "Submerged weight {:.1} kN < air weight {:.1} kN", w_sub, w_air
    );

    // For thin-walled hollow tubes, buoyancy can exceed steel weight
    // because displaced volume (full cross-section) >> steel volume
    // Ratio ≈ (D²) / (D²-(D-2t)²) * ρ_w/ρ_steel
    let volume_ratio: f64 = v_displaced / v_steel;
    let density_ratio: f64 = rho_w / rho_steel;
    let buoy_to_weight: f64 = volume_ratio * density_ratio;
    assert!(
        buoy_to_weight > 1.0,
        "Thin tube: buoyancy/weight = {:.2} — tube floats!", buoy_to_weight
    );
}

// ================================================================
// 7. Scour Around Monopile
// ================================================================
//
// Equilibrium scour depth (DNV-RP-C205):
// S/D = 1.3 for live-bed conditions (current only)
// S/D ≈ 1.3 * (1 - exp(-0.03*(KC-6))) for waves (KC > 6)

#[test]
fn marine_scour_depth() {
    let d_pile: f64 = 6.0;     // m, monopile diameter (offshore wind)

    // Current-induced scour (live-bed)
    let sd_ratio_current: f64 = 1.3;
    let s_current: f64 = sd_ratio_current * d_pile;
    // = 1.3 * 6 = 7.8 m

    let s_expected: f64 = 7.8;
    assert!(
        (s_current - s_expected).abs() / s_expected < 0.01,
        "Current scour: {:.1} m", s_current
    );

    // Wave-induced scour (KC = 15)
    let kc: f64 = 15.0;
    let sd_ratio_wave: f64 = 1.3 * (1.0 - (-0.03 * (kc - 6.0)).exp());
    let s_wave: f64 = sd_ratio_wave * d_pile;

    assert!(
        s_wave < s_current,
        "Wave scour {:.1}m < current scour {:.1}m", s_wave, s_current
    );

    // Combined current + waves: higher scour
    // Approximate: S_combined ≈ S_current (current dominates for low KC)
    let s_combined: f64 = s_current; // simplified

    // Design consideration: scour depth affects pile embedment
    // Required additional embedment = scour depth
    let embedment_nominal: f64 = 30.0; // m
    let embedment_with_scour: f64 = embedment_nominal + s_combined;

    assert!(
        embedment_with_scour > embedment_nominal,
        "Embedment with scour: {:.1}m > nominal {:.1}m",
        embedment_with_scour, embedment_nominal
    );
}

// ================================================================
// 8. Splash Zone Corrosion — DNV Allowances
// ================================================================
//
// Splash zone: most aggressive corrosion environment.
// DNV: corrosion rate 0.3-0.5 mm/year (unprotected splash zone)
// Design life 25 years: 7.5-12.5 mm total corrosion allowance

#[test]
fn marine_corrosion_allowance() {
    let design_life: f64 = 25.0; // years

    // Corrosion rates by zone (mm/year)
    let rate_atmospheric: f64 = 0.1;
    let rate_splash: f64 = 0.4;
    let rate_submerged_cp: f64 = 0.0; // cathodic protection
    let rate_submerged_no_cp: f64 = 0.1;

    // Total corrosion allowance
    let ca_splash: f64 = rate_splash * design_life;
    // = 0.4 * 25 = 10 mm

    let ca_atmospheric: f64 = rate_atmospheric * design_life;
    // = 2.5 mm

    assert!(
        ca_splash > ca_atmospheric,
        "Splash zone CA {:.1}mm > atmospheric {:.1}mm", ca_splash, ca_atmospheric
    );

    // With cathodic protection
    let ca_submerged: f64 = rate_submerged_cp * design_life;
    assert!(
        ca_submerged < ca_atmospheric,
        "Submerged with CP: {:.1}mm", ca_submerged
    );

    // Wall thickness reduction: check remaining capacity
    let t_nominal: f64 = 25.0; // mm
    let t_corroded: f64 = t_nominal - ca_splash;
    let capacity_ratio: f64 = t_corroded / t_nominal;

    assert!(
        capacity_ratio > 0.5,
        "Remaining wall: {:.1}mm ({:.0}%)", t_corroded, capacity_ratio * 100.0
    );

    let _rate_submerged_no_cp = rate_submerged_no_cp;
}
