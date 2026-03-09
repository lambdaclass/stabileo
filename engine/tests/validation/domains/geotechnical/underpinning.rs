/// Validation: Underpinning & Foundation Strengthening
///
/// References:
///   - Tomlinson & Woodward: "Pile Design and Construction Practice" 6th ed. (2015)
///   - EN 1997-1 (EC7): Geotechnical Design
///   - CIRIA C653: Guide to the Design of Thrust Bores (relates to micropiling)
///   - FHWA-NHI-05-039: Micropile Design and Construction
///   - Pryke: "Underpinning: Methods and Applications" (1990)
///   - BS 8004: Code of Practice for Foundations
///
/// Tests verify traditional mass concrete, mini-pile, jet grout,
/// beam & pile, needle beam, load transfer, and monitoring.

// ================================================================
// 1. Traditional Mass Concrete Underpinning
// ================================================================
//
// Sequential excavation under existing foundation.
// Work in short legs (typically 1.0-1.5m wide).
// New concrete placed directly under old foundation.

#[test]
fn underpin_mass_concrete() {
    let b_existing: f64 = 0.60;  // m, existing strip footing width
    let d_existing: f64 = 0.80;  // m, existing foundation depth
    let q_bearing_old: f64 = 100.0; // kPa, old bearing capacity

    // Required new depth (below new excavation)
    let d_new: f64 = 3.0;       // m, new foundation depth
    let b_new: f64 = 1.20;      // m, new underpinning width

    // Wall load
    let p_wall: f64 = 120.0;    // kN/m, load from wall above

    // New bearing capacity (at greater depth → higher)
    let gamma: f64 = 18.0;      // kN/m³
    let _phi: f64 = 30.0_f64.to_radians();
    let nq: f64 = 18.4;         // bearing capacity factor for φ=30°
    let nc: f64 = 30.1;
    let c: f64 = 0.0;           // granular soil

    let q_bearing_new: f64 = c * nc + gamma * d_new * nq + 0.5 * gamma * b_new * 15.0;

    assert!(
        q_bearing_new > q_bearing_old,
        "New bearing {:.0} > old {:.0} kPa", q_bearing_new, q_bearing_old
    );

    // Bearing pressure from wall
    let q_applied: f64 = p_wall / b_new;

    assert!(
        q_applied < q_bearing_new / 3.0,
        "Applied {:.0} < allowable {:.0} kPa", q_applied, q_bearing_new / 3.0
    );

    // Leg width and sequence
    let leg_width: f64 = 1.2;   // m
    let total_length: f64 = 10.0; // m, wall length
    let n_legs: f64 = (total_length / leg_width / 2.0).ceil(); // alternate legs

    assert!(
        n_legs >= 4.0,
        "Number of legs: {:.0}", n_legs
    );

    let _d_existing = d_existing;
    let _b_existing = b_existing;
}

// ================================================================
// 2. Micropile Underpinning
// ================================================================
//
// Small-diameter drilled piles (150-300mm) through/beside foundation.
// High capacity in small cross-section.
// FHWA: design for compression and tension (lateral too).

#[test]
fn underpin_micropile() {
    let d: f64 = 0.20;          // m, micropile diameter
    let l: f64 = 12.0;          // m, pile length
    let fy: f64 = 550.0;        // MPa, casing yield strength
    let d_casing: f64 = 0.178;  // m, casing OD
    let t_casing: f64 = 0.010;  // m, casing thickness

    // Structural capacity (casing)
    let a_casing: f64 = std::f64::consts::PI * (d_casing - t_casing) * t_casing; // m²
    let p_structural: f64 = fy * 1000.0 * a_casing; // kN

    assert!(
        p_structural > 200.0,
        "Structural capacity: {:.0} kN", p_structural
    );

    // Geotechnical capacity (grout-ground bond)
    let alpha_bond: f64 = 150.0; // kPa, bond stress (medium dense sand)
    let d_bond: f64 = d;         // m, bond diameter
    let l_bond: f64 = l * 0.7;   // m, bonded length
    let p_geotech: f64 = std::f64::consts::PI * d_bond * l_bond * alpha_bond;

    assert!(
        p_geotech > 300.0,
        "Geotechnical capacity: {:.0} kN", p_geotech
    );

    // Design capacity (lesser of structural and geotechnical)
    let p_design: f64 = p_structural.min(p_geotech) / 2.0; // FS = 2.0

    assert!(
        p_design > 100.0,
        "Design capacity: {:.0} kN (FS=2.0)", p_design
    );

    // Number of piles per meter of wall
    let p_wall: f64 = 200.0;    // kN/m
    let n_piles: f64 = (p_wall / p_design).ceil();

    assert!(
        n_piles >= 1.0,
        "Piles per meter: {:.0}", n_piles
    );
}

// ================================================================
// 3. Jet Grout Underpinning -- Slab/Column
// ================================================================
//
// Jet grout columns beneath existing foundations.
// Advantage: can work through restricted access.
// Creates soilcrete block supporting foundation.

#[test]
fn underpin_jet_grout() {
    let d_col: f64 = 1.0;       // m, jet grout column diameter
    let l_col: f64 = 6.0;       // m, column length
    let ucs: f64 = 2.5;         // MPa, soilcrete UCS

    // Column capacity (compression)
    let a_col: f64 = std::f64::consts::PI * d_col * d_col / 4.0;
    let p_ult: f64 = ucs * 1000.0 * a_col; // kN
    let fs: f64 = 3.0;
    let p_design: f64 = p_ult / fs;

    assert!(
        p_design > 400.0,
        "Column design capacity: {:.0} kN", p_design
    );

    // Overlapping columns for continuous support
    let overlap: f64 = 0.20;    // m
    let spacing: f64 = d_col - overlap;

    // Load per column
    let p_column_load: f64 = 2000.0; // kN, existing column load
    let n_grout_cols: usize = (p_column_load / p_design).ceil() as usize;

    assert!(
        n_grout_cols >= 3,
        "Grout columns needed: {}", n_grout_cols
    );

    // Check overlap provides continuity
    assert!(
        overlap > 0.0,
        "Overlap: {:.2} m (ensures continuity)", overlap
    );

    let _spacing = spacing;
    let _l_col = l_col;
}

// ================================================================
// 4. Needle Beam Transfer
// ================================================================
//
// Steel beam threaded through wall to transfer load to new supports.
// Beam spans between underpinning piles/pads.
// Must be inserted with minimal disturbance.

#[test]
fn underpin_needle_beam() {
    let p_wall: f64 = 150.0;    // kN/m, wall load
    let span: f64 = 3.0;        // m, beam span (between support points)
    let needle_spacing: f64 = 1.5; // m along wall

    // Load on each needle beam
    let p_needle: f64 = p_wall * needle_spacing;

    assert!(
        p_needle > 150.0,
        "Needle load: {:.0} kN", p_needle
    );

    // Beam design (simply supported)
    let m_max: f64 = p_needle * span / 4.0; // point load at midspan

    assert!(
        m_max > 50.0,
        "Needle moment: {:.0} kN·m", m_max
    );

    // Required section modulus
    let fy: f64 = 275.0;        // MPa (mild steel)
    let w_req: f64 = m_max * 1e6 / fy; // mm³

    assert!(
        w_req > 100_000.0,
        "Required W: {:.0} mm³", w_req
    );

    // Typical UC section: 254×254×89 (Wx = 1,096,000 mm³)
    let w_provided: f64 = 1_096_000.0;

    assert!(
        w_provided > w_req,
        "Provided {:.0} > required {:.0} mm³", w_provided, w_req
    );

    // Deflection check
    let ei: f64 = 210_000.0 * 1.43e8 / 1e6; // kN·m² (E × I for UC 254×254×89)
    let delta: f64 = p_needle * 1000.0 * (span * 1000.0).powi(3) / (48.0 * ei * 1e6);

    assert!(
        delta < 5.0,
        "Deflection: {:.2} mm (critical for existing structure)", delta
    );
}

// ================================================================
// 5. Load Transfer During Underpinning
// ================================================================
//
// Sequence of load transfer from old to new foundation.
// Monitor settlements at each stage.
// Maximum settlement: typically < 5mm for brick structures.

#[test]
fn underpin_load_transfer() {
    let p_total: f64 = 300.0;   // kN/m, total wall load
    let n_stages: usize = 5;    // number of underpinning stages

    // Each stage transfers proportional load
    let p_per_stage: f64 = p_total / n_stages as f64;

    assert!(
        p_per_stage > 30.0,
        "Load per stage: {:.0} kN/m", p_per_stage
    );

    // Settlement limit
    let delta_max: f64 = 5.0;   // mm, maximum total settlement
    let delta_per_stage: f64 = delta_max / n_stages as f64;

    assert!(
        delta_per_stage > 0.5,
        "Allowable per stage: {:.1} mm", delta_per_stage
    );

    // Trigger levels for monitoring
    let trigger_green: f64 = delta_max * 0.5;  // 50% — normal
    let trigger_amber: f64 = delta_max * 0.75; // 75% — investigate
    let trigger_red: f64 = delta_max * 1.0;    // 100% — stop work

    assert!(
        trigger_green < trigger_amber && trigger_amber < trigger_red,
        "Triggers: {:.1} / {:.1} / {:.1} mm", trigger_green, trigger_amber, trigger_red
    );

    // Angular distortion check
    let l_between_points: f64 = 6.0 * 1000.0; // mm, distance between monitoring points
    let diff_settlement: f64 = 3.0; // mm, differential between adjacent points
    let angular_distortion: f64 = diff_settlement / l_between_points;

    // Burland & Wroth: 1/500 for brick walls
    assert!(
        angular_distortion < 1.0 / 500.0,
        "Angular distortion: 1/{:.0} < 1/500", 1.0 / angular_distortion
    );
}

// ================================================================
// 6. Resin Injection -- Structural Filling
// ================================================================
//
// Expanding polyurethane resin injection to fill voids and
// re-level structures. Controlled expansion pressure.

#[test]
fn underpin_resin_injection() {
    let void_volume: f64 = 0.50; // m³, estimated void under foundation
    let expansion_ratio: f64 = 15.0; // resin expansion factor

    // Resin volume required
    let v_resin: f64 = void_volume / expansion_ratio;

    assert!(
        v_resin > 0.01 && v_resin < 0.10,
        "Resin volume: {:.3} m³ ({:.0} liters)", v_resin, v_resin * 1000.0
    );

    // Expansion pressure
    let p_expansion: f64 = 800.0; // kPa, controlled expansion

    // Must not exceed overburden to avoid heave
    let depth: f64 = 1.5;       // m, depth of injection
    let gamma: f64 = 18.0;      // kN/m³
    let overburden: f64 = gamma * depth;

    assert!(
        p_expansion > overburden,
        "Expansion {:.0} > overburden {:.0} kPa (can lift)", p_expansion, overburden
    );

    // Lift capacity (rough estimate)
    let a_injection: f64 = 2.0;  // m², contact area
    let lift_force: f64 = p_expansion * a_injection; // kN
    let w_structure: f64 = 500.0; // kN, weight above injection zone

    let can_lift: bool = lift_force > w_structure;
    assert!(
        can_lift,
        "Lift force {:.0} > structure weight {:.0} kN", lift_force, w_structure
    );
}

// ================================================================
// 7. Monitoring -- Settlement & Tilt
// ================================================================
//
// Precision monitoring during underpinning is critical.
// Instruments: precise leveling, tiltmeters, crack gauges.
// Frequency: daily during active work, weekly otherwise.

#[test]
fn underpin_monitoring() {
    // Monitoring point readings (simulated)
    let readings: [(f64, f64); 5] = [
        // (day, settlement_mm)
        (0.0, 0.0),
        (7.0, -1.2),
        (14.0, -2.1),
        (21.0, -2.8),
        (28.0, -3.0),
    ];

    // Rate of settlement
    for i in 1..readings.len() {
        let dt: f64 = readings[i].0 - readings[i - 1].0;
        let ds: f64 = (readings[i].1 - readings[i - 1].1).abs();
        let rate: f64 = ds / dt;

        // Rate should decrease over time (stabilizing)
        if i > 1 {
            let prev_ds: f64 = (readings[i - 1].1 - readings[i - 2].1).abs();
            let prev_dt: f64 = readings[i - 1].0 - readings[i - 2].0;
            let prev_rate: f64 = prev_ds / prev_dt;

            assert!(
                rate <= prev_rate + 0.01,
                "Rate decreasing: {:.3} ≤ {:.3} mm/day", rate, prev_rate
            );
        }
    }

    // Total settlement within limit
    let total: f64 = readings.last().unwrap().1.abs();
    assert!(
        total < 5.0,
        "Total settlement: {:.1} mm < 5mm limit", total
    );

    // Tilt measurement
    let tilt: f64 = 0.001;      // rad (1mm/m)
    let h_wall: f64 = 10.0;     // m
    let lateral_at_top: f64 = tilt * h_wall * 1000.0; // mm

    assert!(
        lateral_at_top < 15.0,
        "Lateral movement at top: {:.0} mm", lateral_at_top
    );
}

// ================================================================
// 8. Basement Deepening -- Lowering Existing Floor
// ================================================================
//
// Lowering existing basement floor level.
// Requires underpinning of all surrounding walls.
// Critical: temporary support during excavation.

#[test]
fn underpin_basement_deepening() {
    let h_existing: f64 = 2.2;  // m, existing basement height
    let h_new: f64 = 3.5;       // m, new basement height
    let delta_h: f64 = h_new - h_existing;

    assert!(
        delta_h > 1.0,
        "Deepening by: {:.1} m", delta_h
    );

    // Additional earth pressure on walls
    let gamma: f64 = 18.0;      // kN/m³
    let ka: f64 = 0.33;         // active pressure coefficient
    let delta_pa: f64 = gamma * delta_h * ka; // additional pressure at new base

    assert!(
        delta_pa > 5.0,
        "Additional active pressure: {:.1} kPa", delta_pa
    );

    // Additional moment on wall
    let m_additional: f64 = 0.5 * gamma * (h_new * h_new - h_existing * h_existing) * ka
        * (h_new / 3.0); // approximate

    assert!(
        m_additional > 10.0,
        "Additional wall moment: {:.0} kN·m/m", m_additional
    );

    // New slab design (acts as prop at base)
    let t_slab: f64 = 0.25;     // m, new base slab thickness
    let l_slab: f64 = 6.0;      // m, slab span

    // Earth pressure reaction on slab
    let q_slab: f64 = gamma * h_new * ka; // kPa at base
    let m_slab: f64 = q_slab * l_slab * l_slab / 8.0;

    assert!(
        m_slab > 10.0,
        "Slab moment: {:.0} kN·m/m", m_slab
    );

    let _t_slab = t_slab;
}
