/// Validation: Ground Improvement Techniques
///
/// References:
///   - Mitchell & Jardine: "A Guide to Ground Treatment" (2002)
///   - Kirsch & Bell: "Ground Improvement" 3rd ed. (2013)
///   - Priebe (1995): Stone Column Design Method
///   - FHWA-SA-98-086: Ground Improvement Technical Summaries
///   - EN 14731: Ground Treatment by Deep Vibration
///   - Barksdale & Bachus (1983): Design of Stone Columns
///
/// Tests verify stone columns, soil nailing, jet grouting,
/// dynamic compaction, preloading, deep mixing, and wick drains.

// ================================================================
// 1. Stone Column -- Priebe Method
// ================================================================
//
// Improvement factor: n = 1 + A_c/A_s × (K_ac/(K_a0) - 1)
// Area replacement ratio: a_s = A_c / A (column area / tributary area)
// K_ac = active earth pressure in column material

#[test]
fn ground_stone_column() {
    let d_col: f64 = 0.80;      // m, column diameter
    let spacing: f64 = 2.0;     // m, triangular grid spacing
    let phi_col: f64 = 40.0_f64.to_radians(); // friction angle of stone

    // Column area
    let a_col: f64 = std::f64::consts::PI * d_col * d_col / 4.0;

    // Tributary area (triangular grid)
    let a_trib: f64 = 0.866 * spacing * spacing; // √3/2 × s²

    // Area replacement ratio
    let a_s: f64 = a_col / a_trib;

    assert!(
        a_s > 0.10 && a_s < 0.40,
        "Area ratio: {:.3}", a_s
    );

    // Priebe basic improvement factor
    let ka_col: f64 = (std::f64::consts::FRAC_PI_4 - phi_col / 2.0).tan().powi(2);
    let n_0: f64 = 1.0 + a_s / (1.0 - a_s) * (1.0 / ka_col - 1.0);

    assert!(
        n_0 > 1.5 && n_0 < 5.0,
        "Improvement factor: {:.2}", n_0
    );

    // Settlement reduction
    let s_untreated: f64 = 100.0; // mm, untreated settlement
    let s_treated: f64 = s_untreated / n_0;

    assert!(
        s_treated < s_untreated,
        "Settlement: {:.0} → {:.0} mm", s_untreated, s_treated
    );

    // Bearing capacity improvement
    let q_untreated: f64 = 80.0; // kPa, untreated bearing capacity
    let q_treated: f64 = q_untreated * n_0;

    assert!(
        q_treated > q_untreated * 1.5,
        "Bearing: {:.0} → {:.0} kPa", q_untreated, q_treated
    );
}

// ================================================================
// 2. Soil Nailing -- Stability
// ================================================================
//
// Soil nails: passive reinforcement of soil slope/excavation.
// Tension in nails from soil movement.
// Design: limit equilibrium with nail forces.

#[test]
fn ground_soil_nailing() {
    let h: f64 = 8.0;           // m, excavation height
    let gamma: f64 = 18.0;      // kN/m³
    let phi: f64 = 30.0_f64.to_radians();
    let c: f64 = 5.0;           // kPa, soil cohesion

    // Nail parameters
    let d_nail: f64 = 0.025;    // m (25mm bar)
    let d_hole: f64 = 0.10;     // m, drill hole diameter
    let l_nail: f64 = 0.7 * h;  // m, nail length (typical 0.6-0.8H)
    let s_h: f64 = 1.5;         // m, horizontal spacing
    let s_v: f64 = 1.5;         // m, vertical spacing

    // Nail pullout resistance
    let tau_grout: f64 = 100.0;  // kPa, grout-soil interface shear
    let r_pullout: f64 = std::f64::consts::PI * d_hole * l_nail * tau_grout;
    // = π × 0.1 × 5.6 × 100 = 175.9 kN

    assert!(
        r_pullout > 100.0,
        "Pullout resistance: {:.0} kN", r_pullout
    );

    // Nail tensile capacity
    let fy: f64 = 500.0;        // MPa
    let a_nail: f64 = std::f64::consts::PI * d_nail * d_nail / 4.0 * 1e6; // mm²
    let t_nail: f64 = fy * a_nail / 1000.0; // kN

    // Nail capacity = min(pullout, tensile)
    let r_nail: f64 = r_pullout.min(t_nail);

    assert!(
        r_nail > 50.0,
        "Nail capacity: {:.0} kN", r_nail
    );

    // Total stabilizing force per unit width
    let n_rows: usize = (h / s_v).floor() as usize;
    let t_total: f64 = n_rows as f64 * r_nail / s_h;

    assert!(
        t_total > 100.0,
        "Total nail force: {:.0} kN/m", t_total
    );

    let _c = c;
    let _phi = phi;
    let _gamma = gamma;
}

// ================================================================
// 3. Jet Grouting -- Column Capacity
// ================================================================
//
// High-pressure jet erodes and mixes soil with cement grout.
// Column diameter: 0.6-2.5m depending on system and soil.
// UCS of soilcrete: 1-15 MPa (depends on soil type and cement ratio).

#[test]
fn ground_jet_grouting() {
    let d_col: f64 = 1.2;       // m, effective column diameter
    let l_col: f64 = 8.0;       // m, column length

    // Soilcrete properties
    let ucs: f64 = 3.0;         // MPa, unconfined compressive strength
    let e_sc: f64 = 500.0 * ucs; // MPa (typical: 300-1000 × UCS)

    // Axial capacity
    let a_col: f64 = std::f64::consts::PI * d_col * d_col / 4.0; // m²
    let n_capacity: f64 = ucs * 1000.0 * a_col; // kN (using UCS, no safety factor)
    let fs: f64 = 3.0;          // typical safety factor for jet grout
    let n_design: f64 = n_capacity / fs;

    assert!(
        n_design > 500.0,
        "Design axial capacity: {:.0} kN", n_design
    );

    // Shaft friction (for pile-like behavior)
    let tau_s: f64 = 50.0;      // kPa, soil-soilcrete interface shear
    let perimeter: f64 = std::f64::consts::PI * d_col;
    let r_shaft: f64 = tau_s * perimeter * l_col;

    assert!(
        r_shaft > 1000.0,
        "Shaft resistance: {:.0} kN", r_shaft
    );

    // Quality control: UCS testing
    let ucs_min: f64 = ucs * 0.7; // 30% coefficient of variation
    let ucs_field_design: f64 = ucs * 0.50; // field design value
    assert!(
        ucs_min > ucs_field_design,
        "UCS_min {:.1} > design {:.1} MPa", ucs_min, ucs_field_design
    );

    let _e_sc = e_sc;
}

// ================================================================
// 4. Dynamic Compaction -- Energy & Depth
// ================================================================
//
// Drop heavy weight from great height to densify loose soils.
// Depth of influence: D = n × √(W×H) (Menard formula)
// W in tonnes, H in meters, n = 0.3-0.8 depending on soil.

#[test]
fn ground_dynamic_compaction() {
    let w: f64 = 15.0;          // tonnes, tamper weight
    let h: f64 = 20.0;          // m, drop height

    // Depth of influence (Menard)
    let n: f64 = 0.5;           // empirical factor (granular soil)
    let d_influence: f64 = n * (w * h).sqrt();
    // = 0.5 × √300 = 8.66 m

    assert!(
        d_influence > 5.0 && d_influence < 15.0,
        "Depth of influence: {:.1} m", d_influence
    );

    // Energy per blow
    let energy: f64 = w * 9.81 * h; // kN·m (kJ)

    assert!(
        energy > 2000.0,
        "Energy per blow: {:.0} kJ", energy
    );

    // Applied energy per unit area
    let grid_spacing: f64 = 5.0; // m
    let n_passes: usize = 3;
    let n_drops_per_point: usize = 10;

    let total_energy: f64 = energy * n_passes as f64 * n_drops_per_point as f64;
    let area_per_point: f64 = grid_spacing * grid_spacing;
    let energy_density: f64 = total_energy / area_per_point;

    // Typical: 150-400 kJ/m² for loose fill
    assert!(
        energy_density > 100.0,
        "Energy density: {:.0} kJ/m²", energy_density
    );

    // Crater depth per blow (initial)
    let crater: f64 = 0.3;      // m, typical initial crater
    let total_settlement: f64 = crater * n_drops_per_point as f64 * 0.5; // decreasing with passes

    assert!(
        total_settlement > 0.5,
        "Total surface settlement: {:.1} m", total_settlement
    );
}

// ================================================================
// 5. Preloading with Surcharge
// ================================================================
//
// Place surcharge fill to consolidate soft clay.
// Settlement: Terzaghi 1D consolidation theory.
// Time: t = Tv × H²dr / cv

#[test]
fn ground_preloading() {
    let h_clay: f64 = 8.0;      // m, compressible clay layer
    let cc: f64 = 0.30;         // compression index
    let e0: f64 = 1.20;         // initial void ratio
    let sigma_0: f64 = 60.0;    // kPa, initial effective stress at mid-layer
    let cv: f64 = 2.0e-8;       // m²/s, coefficient of consolidation

    // Design load
    let delta_sigma: f64 = 50.0; // kPa, from structure

    // Required surcharge (typically 1.2-1.5 × design load)
    let surcharge_ratio: f64 = 1.3;
    let q_surcharge: f64 = delta_sigma * surcharge_ratio;

    // Primary consolidation settlement
    let s_final: f64 = cc / (1.0 + e0) * h_clay * 1000.0
        * ((sigma_0 + q_surcharge) / sigma_0).log10(); // mm

    assert!(
        s_final > 100.0,
        "Final settlement: {:.0} mm", s_final
    );

    // Time for 90% consolidation (one-way drainage)
    let h_dr: f64 = h_clay;     // m, drainage path (one-way)
    let tv_90: f64 = 0.848;     // time factor for U = 90%
    let t_90: f64 = tv_90 * h_dr * h_dr / cv; // seconds
    let t_90_months: f64 = t_90 / (30.0 * 24.0 * 3600.0);

    assert!(
        t_90_months > 6.0,
        "Time to 90%: {:.0} months", t_90_months
    );

    // With surcharge removal time
    // Remove when settlement under surcharge = final under design load
    let s_design: f64 = cc / (1.0 + e0) * h_clay * 1000.0
        * ((sigma_0 + delta_sigma) / sigma_0).log10();

    let u_required: f64 = s_design / s_final; // degree of consolidation needed

    assert!(
        u_required < 1.0,
        "Required consolidation: {:.1}%", u_required * 100.0
    );
}

// ================================================================
// 6. Deep Soil Mixing -- Column Grid
// ================================================================
//
// Mechanical mixing of soil with cementitious binder.
// Column or wall configuration.
// UCS: 0.5-5 MPa typically. Design at 50% of lab UCS.

#[test]
fn ground_deep_mixing() {
    let d_col: f64 = 0.70;      // m, column diameter
    let spacing: f64 = 1.2;     // m, center-to-center
    let ucs_lab: f64 = 2.0;     // MPa, laboratory UCS

    // Design UCS (50% of lab for field variability)
    let ucs_design: f64 = ucs_lab * 0.50;

    // Area replacement ratio
    let a_col: f64 = std::f64::consts::PI * d_col * d_col / 4.0;
    let a_trib: f64 = spacing * spacing; // square grid
    let arr: f64 = a_col / a_trib;

    assert!(
        arr > 0.20 && arr < 0.50,
        "Area replacement: {:.2}", arr
    );

    // Composite bearing capacity (area-weighted)
    let q_col: f64 = ucs_design * 1000.0; // kPa
    let q_soil: f64 = 30.0;     // kPa, untreated soil
    let q_composite: f64 = arr * q_col + (1.0 - arr) * q_soil;

    assert!(
        q_composite > 200.0,
        "Composite bearing: {:.0} kPa", q_composite
    );

    // Settlement modulus
    let e_col: f64 = 300.0 * ucs_design; // MPa
    let e_soil: f64 = 5.0;      // MPa
    let e_composite: f64 = arr * e_col + (1.0 - arr) * e_soil;

    assert!(
        e_composite > 50.0,
        "Composite modulus: {:.0} MPa", e_composite
    );

    // Stress concentration ratio
    let scr: f64 = e_col / e_soil;
    assert!(
        scr > 20.0,
        "Stress concentration ratio: {:.0}", scr
    );
}

// ================================================================
// 7. Prefabricated Vertical Drains (Wick Drains)
// ================================================================
//
// Accelerate consolidation by reducing drainage path.
// Radial consolidation: Ur = 1 - exp(-8Th/F(n))
// F(n) = ln(n) - 0.75, where n = de/dw (influence/drain diameter).

#[test]
fn ground_wick_drains() {
    let spacing: f64 = 1.5;     // m, drain spacing
    let d_w: f64 = 0.05;        // m, equivalent drain diameter

    // Influence diameter (triangular pattern)
    let d_e: f64 = 1.05 * spacing; // = 1.575 m

    // Drain ratio
    let n_ratio: f64 = d_e / d_w;

    assert!(
        n_ratio > 10.0,
        "n = de/dw = {:.0}", n_ratio
    );

    // F(n) function
    let f_n: f64 = n_ratio.ln() - 0.75;

    assert!(
        f_n > 2.0,
        "F(n) = {:.2}", f_n
    );

    // Time for 90% consolidation with drains
    let ch: f64 = 3.0e-8;       // m²/s, horizontal cv
    let th_90: f64 = -f_n / 8.0 * (1.0 - 0.9_f64).ln();

    let t_drain: f64 = th_90 * d_e * d_e / ch;
    let t_drain_months: f64 = t_drain / (30.0 * 24.0 * 3600.0);

    assert!(
        t_drain_months > 1.0 && t_drain_months < 30.0,
        "Time with drains: {:.1} months", t_drain_months
    );

    // Compare without drains (vertical consolidation only)
    let cv: f64 = 2.0e-8;       // m²/s
    let h_drain_path: f64 = 8.0; // m (one-way)
    let tv_90: f64 = 0.848;
    let t_no_drains: f64 = tv_90 * h_drain_path * h_drain_path / cv;
    let t_no_drains_months: f64 = t_no_drains / (30.0 * 24.0 * 3600.0);

    // Drains dramatically reduce consolidation time
    assert!(
        t_drain_months < t_no_drains_months,
        "With drains: {:.0} months vs without: {:.0} months",
        t_drain_months, t_no_drains_months
    );
}

// ================================================================
// 8. Grouting -- Permeation & Compensation
// ================================================================
//
// Permeation grouting: fill soil voids with grout.
// Grout volume: V = n × V_soil (porosity × treatment volume)
// Injection pressure: limited to avoid heave.

#[test]
fn ground_grouting() {
    let d_treatment: f64 = 10.0; // m, treatment zone diameter
    let h_treatment: f64 = 5.0;  // m, treatment zone height
    let porosity: f64 = 0.35;    // soil porosity (sand)
    let fill_ratio: f64 = 0.80;  // grout fill efficiency

    // Treatment volume
    let v_soil: f64 = std::f64::consts::PI * (d_treatment / 2.0).powi(2) * h_treatment;

    // Grout volume required
    let v_grout: f64 = v_soil * porosity * fill_ratio;

    assert!(
        v_grout > 50.0,
        "Grout volume: {:.0} m³", v_grout
    );

    // Injection pressure limit (to avoid heave)
    let depth: f64 = 8.0;       // m, depth of treatment
    let gamma: f64 = 18.0;      // kN/m³
    let sigma_v: f64 = gamma * depth; // kPa

    // Max injection pressure: typically 2-3 × overburden
    let p_max: f64 = 2.5 * sigma_v;

    assert!(
        p_max > 200.0,
        "Max injection pressure: {:.0} kPa", p_max
    );

    // Permeability reduction
    let k_before: f64 = 1e-4;   // m/s (sand)
    let k_after: f64 = 1e-7;    // m/s (grouted sand)
    let reduction: f64 = k_before / k_after;

    assert!(
        reduction > 100.0,
        "Permeability reduction: {:.0}×", reduction
    );

    // Compensation grouting (underpinning during tunneling)
    let settlement_target: f64 = 5.0; // mm, maximum allowable
    let grout_efficiency: f64 = 0.50; // 50% of grout volume causes heave
    let v_comp: f64 = settlement_target / 1000.0 * d_treatment * d_treatment / grout_efficiency;

    assert!(
        v_comp > 0.0,
        "Compensation grout volume: {:.2} m³", v_comp
    );
}
