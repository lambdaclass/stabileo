/// Validation: Geosynthetics in Structural & Geotechnical Engineering
///
/// References:
///   - EN 13251: Geotextiles — Characteristics for earthworks
///   - FHWA-NHI-10-024: Design and Construction of MSE Walls
///   - Koerner: "Designing with Geosynthetics" 6th ed. (2012)
///   - EN 1997-1 (EC7): Geotechnical Design
///   - GRI Standard Practice (Geosynthetic Research Institute)
///   - AASHTO LRFD Bridge Design §11: Earth Retaining Structures
///
/// Tests verify geogrid reinforcement, geomembrane stress,
/// drainage capacity, and reinforced slope design.

// ================================================================
// 1. Geogrid Reinforcement — Allowable Tensile Strength
// ================================================================
//
// T_allowable = T_ultimate / (RF_ID × RF_CR × RF_D × RF_CBD)
// RF_ID = installation damage factor (1.05-1.5)
// RF_CR = creep reduction factor (1.5-5.0)
// RF_D = durability factor (1.0-2.0)
// RF_CBD = chemical/biological degradation (1.0-1.5)

#[test]
fn geosynthetic_geogrid_strength() {
    let t_ult: f64 = 120.0;    // kN/m, ultimate tensile strength

    // Reduction factors (typical for HDPE geogrid, 75-year design life)
    let rf_id: f64 = 1.20;     // installation damage
    let rf_cr: f64 = 2.50;     // creep
    let rf_d: f64 = 1.15;      // durability
    let rf_cbd: f64 = 1.10;    // chemical/biological

    // Combined reduction factor
    let rf_total: f64 = rf_id * rf_cr * rf_d * rf_cbd;
    // = 1.20 * 2.50 * 1.15 * 1.10 = 3.795

    // Allowable long-term design strength
    let t_allow: f64 = t_ult / rf_total;

    assert!(
        t_allow > 20.0 && t_allow < 50.0,
        "Allowable strength: {:.1} kN/m", t_allow
    );

    // Utilization is typically 25-35% of ultimate
    let utilization: f64 = t_allow / t_ult;
    assert!(
        utilization > 0.20 && utilization < 0.40,
        "Utilization: {:.1}%", utilization * 100.0
    );

    // PET (polyester) has better creep resistance
    let rf_cr_pet: f64 = 1.50; // lower creep factor
    let rf_total_pet: f64 = rf_id * rf_cr_pet * rf_d * rf_cbd;
    let t_allow_pet: f64 = t_ult / rf_total_pet;

    assert!(
        t_allow_pet > t_allow,
        "PET {:.1} > HDPE {:.1} kN/m (better creep)", t_allow_pet, t_allow
    );
}

// ================================================================
// 2. MSE Wall — Internal Stability (Tie-Back Wedge)
// ================================================================
//
// FHWA: T_max = σ_h × S_v
// σ_h = K_r × σ_v + Δσ_h
// K_r varies with depth (K_r/K_a from 1.7 at top to 1.0 at 6m depth for geogrids)

#[test]
fn geosynthetic_mse_internal() {
    let gamma: f64 = 20.0;     // kN/m³
    let h: f64 = 6.0;          // m, wall height
    let phi: f64 = 34.0_f64.to_radians();
    let sv: f64 = 0.6;         // m, vertical spacing

    // Active earth pressure coefficient
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);

    // At depth z = 3m (mid-height)
    let z: f64 = 3.0;
    let sigma_v: f64 = gamma * z;

    // Kr/Ka ratio (for geogrids, linearly interpolated)
    let kr_ka: f64 = if z <= 6.0 {
        1.7 - 0.7 * z / 6.0 // varies from 1.7 to 1.0
    } else {
        1.0
    };
    let kr: f64 = kr_ka * ka;

    // Maximum tension in reinforcement layer
    let t_max: f64 = kr * sigma_v * sv;

    assert!(
        t_max > 5.0 && t_max < 30.0,
        "T_max at z={}m: {:.1} kN/m", z, t_max
    );

    // Total horizontal force on wall
    let pa: f64 = 0.5 * ka * gamma * h * h;
    assert!(
        pa > 30.0,
        "Total active force: {:.1} kN/m", pa
    );
}

// ================================================================
// 3. Reinforced Slope — Circular Failure
// ================================================================
//
// Tensile reinforcement increases factor of safety.
// ΔFS = Σ(T_i × cos(α_i) × tan(φ) + T_i × sin(α_i)) / (W × sin(α))
// Each reinforcement layer contributes to stability.

#[test]
fn geosynthetic_reinforced_slope() {
    let gamma: f64 = 19.0;
    let h: f64 = 8.0;          // m, slope height
    let beta: f64 = 60.0_f64.to_radians(); // steep slope
    let phi: f64 = 28.0_f64.to_radians();
    let c: f64 = 5.0;          // kPa, cohesion

    // Unreinforced FS (simplified)
    let sigma_n: f64 = gamma * h * beta.cos() * beta.cos();
    let tau_resist: f64 = c + sigma_n * phi.tan();
    let tau_drive: f64 = gamma * h * beta.sin() * beta.cos();
    let fs_unreinforced: f64 = tau_resist / tau_drive;

    // Number of reinforcement layers
    let n_layers: usize = 5;
    let sv: f64 = h / n_layers as f64; // = 1.6m spacing
    let t_allow: f64 = 30.0;   // kN/m, allowable per layer

    // Total reinforcement contribution (simplified)
    let sum_t: f64 = n_layers as f64 * t_allow;
    let additional_resist: f64 = sum_t * phi.tan(); // friction component
    let fs_reinforced: f64 = (tau_resist + additional_resist / (gamma * h)) / tau_drive;

    assert!(
        fs_reinforced > fs_unreinforced,
        "Reinforced FS {:.2} > unreinforced {:.2}", fs_reinforced, fs_unreinforced
    );

    let _sv = sv;
}

// ================================================================
// 4. Geomembrane — Stress Under Settlement
// ================================================================
//
// Geomembrane spanning over void or differential settlement:
// σ = E × ε, where ε depends on geometry of deformation.
// For circular void of radius a, depth d:
// ε ≈ 2*d²/(3*a²) (small deflection approximation)

#[test]
fn geosynthetic_geomembrane_stress() {
    let e_gm: f64 = 400.0;     // MPa, HDPE geomembrane modulus (short-term)
    let t_gm: f64 = 1.5;       // mm, thickness
    let fy_gm: f64 = 15.0;     // MPa, yield stress (HDPE)

    // Spanning over subsidence (sinkhole)
    let a: f64 = 1.0;          // m, radius of void
    let d: f64 = 0.10;         // m, deflection

    // Membrane strain
    let d_sq: f64 = d * d;
    let a_sq: f64 = a * a;
    let eps: f64 = 2.0 * d_sq / (3.0 * a_sq);
    // = 2 * 0.01 / 3 = 0.00667 = 0.667%

    // Membrane stress
    let sigma: f64 = e_gm * eps;
    // = 400 * 0.00667 = 2.67 MPa

    assert!(
        sigma < fy_gm,
        "Membrane stress {:.2} < yield {:.0} MPa", sigma, fy_gm
    );

    // Tension per unit width
    let t_tension: f64 = sigma * t_gm / 1000.0; // kN/m
    assert!(
        t_tension > 0.0,
        "Membrane tension: {:.3} kN/m", t_tension
    );

    // Larger void = more strain for same deflection
    let a_large: f64 = 2.0;
    let eps_large: f64 = 2.0 * d_sq / (3.0 * a_large * a_large);
    assert!(
        eps_large < eps,
        "Larger void: ε = {:.4} < {:.4} (less strain for same d)", eps_large, eps
    );
}

// ================================================================
// 5. Geocomposite Drainage — Flow Capacity
// ================================================================
//
// Transmissivity: θ = k × t (hydraulic conductivity × thickness)
// Flow per unit width: q = θ × i (transmissivity × hydraulic gradient)
// Required: q_required = infiltration_rate × tributary_length

#[test]
fn geosynthetic_drainage() {
    // Geocomposite drain properties
    let theta: f64 = 1.0e-3;   // m²/s, transmissivity (typical)

    // Reduction factors for in-soil conditions
    let rf_intrusion: f64 = 1.5;  // soil intrusion into core
    let rf_creep_d: f64 = 1.2;    // long-term compression
    let rf_chem: f64 = 1.1;       // chemical clogging

    let theta_design: f64 = theta / (rf_intrusion * rf_creep_d * rf_chem);

    // Hydraulic gradient (1:1 slope → i = sin(45°) ≈ 0.707)
    let i: f64 = 0.707;

    // Flow capacity
    let q_capacity: f64 = theta_design * i;
    // m²/s → L/s per meter width: multiply by 1000
    let q_lps: f64 = q_capacity * 1000.0;

    assert!(
        q_lps > 0.1,
        "Drain capacity: {:.2} L/s per meter width", q_lps
    );

    // Required flow (example: 10mm/hr rainfall over 20m tributary)
    let rainfall: f64 = 10.0 / 1000.0 / 3600.0; // m/s
    let tributary: f64 = 20.0; // m
    let q_required: f64 = rainfall * tributary; // m²/s

    let factor_of_safety: f64 = theta_design * i / q_required;
    assert!(
        factor_of_safety > 2.0,
        "Drainage FS = {:.1} > 2.0 — adequate", factor_of_safety
    );
}

// ================================================================
// 6. Geotextile Filter — Retention and Permeability
// ================================================================
//
// Retention criterion: O_95 ≤ B × D_85 (of soil)
// Permeability criterion: k_geotextile ≥ k_soil (at minimum)
// B = coefficient depending on soil type and Cu

#[test]
fn geosynthetic_filter_design() {
    // Soil properties
    let d85: f64 = 0.50;       // mm, 85% passing size
    let d15: f64 = 0.08;       // mm, 15% passing size
    let cu: f64 = d85 / d15;   // uniformity (approximate)
    let k_soil: f64 = 1e-5;    // m/s, soil hydraulic conductivity

    // Retention criterion
    let b: f64 = if cu <= 2.0 { 1.0 } else if cu <= 4.0 { 0.5 * cu } else { 8.0 / cu };
    let o95_max: f64 = b * d85; // mm, maximum apparent opening size

    assert!(
        o95_max > 0.0,
        "Maximum O95: {:.3} mm", o95_max
    );

    // Geotextile selection
    let o95_gt: f64 = 0.15;    // mm, actual O95 of selected geotextile
    assert!(
        o95_gt <= o95_max,
        "O95 = {:.3}mm ≤ max {:.3}mm — retention OK", o95_gt, o95_max
    );

    // Permeability criterion
    let k_gt: f64 = 1e-3;      // m/s, geotextile permeability
    let perm_ratio: f64 = k_gt / k_soil;
    assert!(
        perm_ratio > 10.0,
        "k_gt/k_soil = {:.0} >> 1 — no clogging risk", perm_ratio
    );

    let _cu = cu;
}

// ================================================================
// 7. Landfill Liner System — Multi-Layer
// ================================================================
//
// Typical composite liner: geomembrane + compacted clay (GCL)
// Leakage through composite: Q = a*n*q0^0.1 * h^0.9 * k_s^0.74
// (Giroud equation for defects in geomembrane over clay)

#[test]
fn geosynthetic_landfill_liner() {
    // Double liner system components
    let t_gm_primary: f64 = 1.5;   // mm, primary geomembrane
    let t_gcl: f64 = 10.0;         // mm, GCL (bentonite)
    let t_ccl: f64 = 600.0;        // mm, compacted clay liner
    let k_gcl: f64 = 1e-11;        // m/s, GCL permeability
    let k_ccl: f64 = 1e-9;         // m/s, CCL permeability

    // GCL is much less permeable than CCL
    assert!(
        k_gcl < k_ccl,
        "GCL k = {:.0e} < CCL k = {:.0e} m/s", k_gcl, k_ccl
    );

    // Equivalent thickness of composite liner
    // Steady-state flow: q = k × (h/t)
    // For layers in series: 1/k_eq = Σ(t_i/k_i)
    let t_gcl_m: f64 = t_gcl / 1000.0;
    let t_ccl_m: f64 = t_ccl / 1000.0;
    let total_t: f64 = t_gcl_m + t_ccl_m;
    let k_eq: f64 = total_t / (t_gcl_m / k_gcl + t_ccl_m / k_ccl);

    // Composite permeability dominated by least permeable layer
    assert!(
        k_eq < k_ccl,
        "Composite k = {:.2e} < CCL k = {:.0e}", k_eq, k_ccl
    );

    // Leachate head on liner (typically limited to 300mm by drainage layer)
    let h_leachate: f64 = 0.300; // m
    let flow_rate: f64 = k_eq * h_leachate / total_t; // m/s per m²

    assert!(
        flow_rate < 1e-9,
        "Leakage rate: {:.2e} m/s — very low", flow_rate
    );

    let _t_gm_primary = t_gm_primary;
}

// ================================================================
// 8. Geosynthetic Reinforced Soil (GRS) Abutment
// ================================================================
//
// FHWA GRS-IBS: closely-spaced reinforcement (200mm)
// allows higher bearing pressures than traditional MSE.
// Bearing capacity: q_ult = 0.7*Ka*sv*Tf/sv + c'

#[test]
fn geosynthetic_grs_abutment() {
    let gamma: f64 = 21.0;     // kN/m³, compacted fill
    let phi: f64 = 38.0_f64.to_radians();
    let sv: f64 = 0.200;       // m, reinforcement spacing (closely-spaced)
    let tf: f64 = 70.0;        // kN/m, geotextile strength per layer

    // Lateral earth pressure coefficient
    let ka: f64 = (std::f64::consts::FRAC_PI_4 - phi / 2.0).tan().powi(2);

    // GRS bearing capacity (simplified FHWA method)
    // σ_h,cap = Tf/Sv (maximum confining stress from reinforcement)
    let sigma_h_cap: f64 = tf / sv; // = 350 kPa

    // Equivalent bearing capacity
    // q = σ_h/Ka (Rankine passive-like)
    let q_grs: f64 = sigma_h_cap / ka;

    assert!(
        q_grs > 500.0,
        "GRS bearing capacity: {:.0} kPa", q_grs
    );

    // Compare to traditional MSE (Sv = 600mm)
    let sv_mse: f64 = 0.600;
    let sigma_h_mse: f64 = tf / sv_mse;
    let q_mse: f64 = sigma_h_mse / ka;

    assert!(
        q_grs > q_mse * 2.0,
        "GRS capacity {:.0} > 2× MSE capacity {:.0} kPa", q_grs, q_mse
    );

    let _gamma = gamma;
}
