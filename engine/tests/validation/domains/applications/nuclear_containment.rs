/// Validation: Nuclear Containment & Safety-Related Structures
///
/// References:
///   - ACI 349-13: Code Requirements for Nuclear Safety-Related Concrete Structures
///   - ASME BPVC Section III Division 2: Code for Concrete Containments
///   - ASCE 4-16: Seismic Analysis of Safety-Related Nuclear Structures
///   - NRC Regulatory Guides (10 CFR 50, Appendix A)
///   - Hessheimer & Dameron: "Containment Integrity Research" (NUREG/CR-6906)
///
/// Tests verify containment pressure design, liner plate,
/// seismic analysis requirements, and load combinations.

// ================================================================
// 1. Containment Internal Pressure — Design Basis Accident
// ================================================================
//
// DBA pressure: Pa = peak pressure from LOCA (Loss of Coolant Accident)
// Typical PWR: Pa = 0.30-0.45 MPa (44-65 psi) gauge
// Design pressure: Pd = 1.1 * Pa (with margin)

#[test]
fn nuclear_dba_pressure() {
    let pa: f64 = 0.40;        // MPa, peak DBA pressure
    let margin: f64 = 1.10;

    let pd: f64 = pa * margin;
    // = 0.44 MPa

    let pd_expected: f64 = 0.44;
    assert!(
        (pd - pd_expected).abs() / pd_expected < 0.01,
        "Design pressure: {:.3} MPa", pd
    );

    // Temperature at DBA: typically 149°C (300°F)
    let t_dba: f64 = 149.0;    // °C

    // Normal operating temperature: ~60°C
    let t_normal: f64 = 60.0;

    // Temperature differential
    let delta_t: f64 = t_dba - t_normal;
    assert!(
        delta_t > 80.0,
        "DBA ΔT: {:.0}°C", delta_t
    );

    // Integrated Leak Rate Test (ILRT) pressure: typically 0.9*Pd
    let p_ilrt: f64 = 0.90 * pd;
    assert!(
        p_ilrt < pd,
        "ILRT pressure: {:.3} MPa < design {:.3} MPa", p_ilrt, pd
    );
}

// ================================================================
// 2. Containment Wall — Hoop Tension
// ================================================================
//
// For cylindrical containment under internal pressure:
// σ_hoop = p * R / t (thin-wall)
// σ_meridional = p * R / (2t)
// R = inside radius, t = wall thickness

#[test]
fn nuclear_hoop_tension() {
    let p: f64 = 0.44;         // MPa, design pressure
    let r: f64 = 22.0;         // m, inside radius (typical PWR)
    let t: f64 = 1.2;          // m, wall thickness

    // Hoop stress
    let sigma_hoop: f64 = p * r / t;
    // = 0.44 * 22 / 1.2 = 8.07 MPa

    // Meridional stress
    let sigma_merid: f64 = p * r / (2.0 * t);
    // = 4.03 MPa

    // Hoop = 2× meridional (for cylinder)
    let ratio: f64 = sigma_hoop / sigma_merid;
    assert!(
        (ratio - 2.0).abs() / 2.0 < 0.01,
        "Hoop/meridional ratio: {:.3}", ratio
    );

    // Compare to concrete tensile strength (f't ≈ 3-4 MPa)
    // Hoop stress exceeds concrete tension → steel/tendons needed
    let fct: f64 = 3.5; // MPa
    assert!(
        sigma_hoop > fct,
        "Hoop stress {:.2} > f'ct {:.1} MPa — reinforcement required", sigma_hoop, fct
    );

    // Required prestress to keep concrete in compression under DBA:
    let sigma_prestress: f64 = sigma_hoop + 1.0; // 1 MPa residual compression
    assert!(
        sigma_prestress > sigma_hoop,
        "Prestress {:.2} > hoop {:.2} MPa", sigma_prestress, sigma_hoop
    );
}

// ================================================================
// 3. Containment Dome — Membrane Theory
// ================================================================
//
// Hemisphere dome under internal pressure:
// σ = p * R / (2t) (both directions, isotropic)
// At dome-cylinder junction: discontinuity stresses

#[test]
fn nuclear_dome_membrane() {
    let p: f64 = 0.44;
    let r: f64 = 22.0;
    let t_dome: f64 = 0.9;     // m (dome thinner than cylinder)

    // Dome membrane stress (both meridional and hoop)
    let sigma_dome: f64 = p * r / (2.0 * t_dome);
    // = 0.44 * 22 / 1.8 = 5.38 MPa

    // Cylinder hoop stress (at junction)
    let t_cyl: f64 = 1.2;
    let sigma_cyl_hoop: f64 = p * r / t_cyl;

    // Dome has lower stress than cylinder hoop → dome can be thinner
    assert!(
        sigma_dome < sigma_cyl_hoop,
        "Dome σ = {:.2} < cylinder σ = {:.2} MPa", sigma_dome, sigma_cyl_hoop
    );

    // Junction discontinuity: mismatch in radial displacement
    // Cylinder radial displacement: Δ_cyl = p*R²/(E*t_cyl) * (1 - ν/2)
    // Dome radial displacement: Δ_dome = p*R²/(2*E*t_dome) * (1 - ν)
    let nu: f64 = 0.20; // Poisson's ratio for concrete
    let delta_cyl_ratio: f64 = 1.0 / t_cyl * (1.0 - nu / 2.0);
    let delta_dome_ratio: f64 = 1.0 / (2.0 * t_dome) * (1.0 - nu);

    // Mismatch creates bending moments at junction
    let mismatch: f64 = (delta_cyl_ratio - delta_dome_ratio).abs();
    assert!(
        mismatch > 0.0,
        "Junction displacement mismatch — edge effects present"
    );
}

// ================================================================
// 4. Steel Liner Plate — Strain Limit
// ================================================================
//
// Containment steel liner: typically 6-12mm carbon steel.
// ASME III Div 2: liner strain limit under DBA + seismic.
// General membrane strain: εm ≤ 0.003 (0.3%)
// Local membrane + bending: εm+b ≤ 0.005 (0.5%)

#[test]
fn nuclear_liner_strain() {
    let e_steel: f64 = 200_000.0; // MPa
    let fy: f64 = 350.0;          // MPa, liner yield stress
    let t_liner: f64 = 10.0;      // mm

    // Yield strain
    let eps_y: f64 = fy / e_steel;
    // = 0.00175

    // ASME limits
    let eps_membrane_limit: f64 = 0.003;
    let eps_local_limit: f64 = 0.005;

    // Yield strain is less than membrane limit → some plastic strain allowed
    assert!(
        eps_y < eps_membrane_limit,
        "εy = {:.5} < membrane limit {:.3}", eps_y, eps_membrane_limit
    );

    // Ductility ratio at membrane limit
    let mu_membrane: f64 = eps_membrane_limit / eps_y;
    assert!(
        mu_membrane > 1.0,
        "Ductility at membrane limit: {:.2}", mu_membrane
    );

    // Liner anchors: typically Nelson studs at 300-450mm spacing
    let anchor_spacing: f64 = 300.0; // mm
    let _buckling_check: f64 = anchor_spacing / t_liner; // slenderness
    assert!(
        anchor_spacing / t_liner < 50.0,
        "Liner slenderness: {:.0} — buckling prevented", anchor_spacing / t_liner
    );

    let _eps_local_limit = eps_local_limit;
}

// ================================================================
// 5. Seismic Design — SSI Effects (ASCE 4)
// ================================================================
//
// Nuclear structures: site-specific response spectra.
// SSI (Soil-Structure Interaction) can reduce or amplify response.
// Foundation input motion ≠ free-field motion.
// Kinematic interaction: base-slab averaging, embedment effects.

#[test]
fn nuclear_seismic_ssi() {
    // Free-field PGA: 0.30g (SSE = Safe Shutdown Earthquake)
    let pga_ff: f64 = 0.30;

    // Foundation input response spectrum at short periods
    // Base-slab averaging reduces high-frequency input
    // Tau factor: τ = sqrt(1/(1 + (2*a/λ)²))
    // a = foundation half-dimension, λ = wavelength
    let a: f64 = 25.0;         // m, foundation half-width
    let vs: f64 = 300.0;       // m/s, soil shear wave velocity
    let f: f64 = 5.0;          // Hz, frequency of interest
    let lambda: f64 = vs / f;  // = 60 m

    let tau_ratio: f64 = 2.0 * a / lambda;
    let tau: f64 = 1.0 / (1.0 + tau_ratio * tau_ratio).sqrt();

    // Reduction at f = 5 Hz
    let pga_foundation: f64 = pga_ff * tau;

    assert!(
        pga_foundation < pga_ff,
        "Foundation PGA {:.3}g < free-field {:.3}g (kinematic interaction)",
        pga_foundation, pga_ff
    );

    // Embedment effect: further reduces foundation input
    let d_embed: f64 = 10.0;   // m, embedment depth
    let cos_factor: f64 = (std::f64::consts::PI * f * d_embed / vs).cos();
    let embed_reduction: f64 = cos_factor.abs();

    assert!(
        embed_reduction <= 1.0,
        "Embedment factor: {:.3}", embed_reduction
    );
}

// ================================================================
// 6. ACI 349 Load Combinations
// ================================================================
//
// ACI 349-13 §9.2: Nuclear safety-related load combinations
// Include thermal (T), pipe reaction (Ro), accident pressure (Pa)
// U = 1.0D + 1.0L + 1.0Ess + 1.0Pa + 1.0(Yr+Yj+Ym) + 1.0Ro + 1.0Ta

#[test]
fn nuclear_load_combinations() {
    let d: f64 = 5000.0;       // kN, dead load
    let l: f64 = 1000.0;       // kN, live load
    let pa: f64 = 3000.0;      // kN, DBA pressure
    let ta: f64 = 500.0;       // kN, DBA thermal
    let ess: f64 = 2000.0;     // kN, SSE seismic
    let ro: f64 = 300.0;       // kN, pipe reaction (normal)

    // Normal operating: 1.4D + 1.7L
    let u_normal: f64 = 1.4 * d + 1.7 * l;
    // = 7000 + 1700 = 8700 kN

    // Abnormal (DBA): 1.0D + 1.0L + 1.0Pa + 1.0Ta + 1.0Ro
    let u_abnormal: f64 = 1.0 * d + 1.0 * l + 1.0 * pa + 1.0 * ta + 1.0 * ro;
    // = 5000 + 1000 + 3000 + 500 + 300 = 9800 kN

    // Abnormal + seismic: 1.0D + 1.0L + 1.0Pa + 1.0Ta + 1.0Ess + 1.0Ro
    let u_abn_seis: f64 = u_abnormal + 1.0 * ess;
    // = 11800 kN

    assert!(
        u_abn_seis > u_normal,
        "Abnormal+seismic {:.0} > normal {:.0} kN", u_abn_seis, u_normal
    );

    // Nuclear is unique: load factors near 1.0 for extreme events
    // (unlike conventional: 1.2D + 1.6L)
    assert!(
        u_abnormal > u_normal,
        "DBA governs over normal operating"
    );
}

// ================================================================
// 7. Containment Prestress Tendon Force
// ================================================================
//
// Post-tensioned containment: 3 families of tendons
// - Hoop tendons (horizontal)
// - Vertical tendons (in cylinder wall)
// - Dome tendons (in dome)
// Initial jacking force: 0.80 * fpu * Aps (per tendon)

#[test]
fn nuclear_tendon_force() {
    let fpu: f64 = 1860.0;     // MPa, ultimate tendon strength
    let aps: f64 = 3800.0;     // mm², tendon area (typical 55-strand tendon)

    // Jacking stress: 0.80 * fpu
    let fpi: f64 = 0.80 * fpu;
    // = 1488 MPa

    // Jacking force per tendon
    let pi: f64 = fpi * aps / 1000.0; // kN
    // = 1488 * 3800 / 1000 = 5654 kN

    assert!(
        pi > 5000.0 && pi < 7000.0,
        "Jacking force: {:.0} kN per tendon", pi
    );

    // Losses: elastic shortening, friction, anchorage, creep, shrinkage, relaxation
    // Total long-term losses: typically 15-25%
    let loss_pct: f64 = 0.20; // 20% total losses
    let pe: f64 = pi * (1.0 - loss_pct);
    // = 5654 * 0.80 = 4523 kN

    // Effective prestress on wall:
    let tendon_spacing: f64 = 0.6; // m, hoop tendon spacing (vertical)
    let sigma_prestress: f64 = pe / (tendon_spacing * 1.2 * 1e6) * 1000.0; // MPa (t=1.2m)
    // Approximately: N/A*1000 = force / (spacing*thickness) in MPa

    assert!(
        sigma_prestress > 0.0,
        "Wall prestress: {:.2} MPa", sigma_prestress
    );

    // Effective/initial ratio
    let pe_pi_ratio: f64 = pe / pi;
    assert!(
        (pe_pi_ratio - 0.80).abs() < 0.01,
        "Pe/Pi: {:.3}", pe_pi_ratio
    );
}

// ================================================================
// 8. Radiation Shielding — Concrete Thickness
// ================================================================
//
// Concrete is an effective radiation shield.
// Tenth-value layer (TVL): thickness that reduces radiation by factor of 10.
// For gamma radiation in normal concrete:
// TVL ≈ 30-40 cm (depending on energy)
// Biological shield: typically 1.5-2.0 m of concrete

#[test]
fn nuclear_radiation_shielding() {
    let tvl: f64 = 0.35;       // m, tenth-value layer (typical for gamma)

    // Attenuation: I/I0 = 10^(-t/TVL)
    let t_wall: f64 = 1.5;     // m, biological shield thickness

    let n_tvl: f64 = t_wall / tvl;
    let attenuation: f64 = 10.0_f64.powf(-n_tvl);
    // = 10^(-4.29) = 5.16e-5 → 99.995% reduction

    assert!(
        attenuation < 1e-3,
        "Attenuation: {:.2e} (>99.9% reduction)", attenuation
    );

    // For required dose rate reduction of 10^6:
    let reduction_required: f64 = 1e-6;
    let t_required: f64 = -tvl * reduction_required.log10();
    // = 0.35 * 6 = 2.10 m

    let t_expected: f64 = tvl * 6.0;
    assert!(
        (t_required - t_expected).abs() / t_expected < 0.01,
        "Required thickness for 10^6 reduction: {:.2} m", t_required
    );

    // Heavy concrete (ρ ≈ 3500 kg/m³) has lower TVL
    let tvl_heavy: f64 = 0.25; // m
    let t_heavy: f64 = -tvl_heavy * reduction_required.log10();
    assert!(
        t_heavy < t_required,
        "Heavy concrete: {:.2}m < normal: {:.2}m for same shielding",
        t_heavy, t_required
    );
}
