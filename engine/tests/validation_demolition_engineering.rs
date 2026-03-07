/// Validation: Demolition Engineering
///
/// References:
///   - BS 6187: Code of Practice for Full and Partial Demolition
///   - EDA: European Demolition Association Technical Guidelines
///   - NFPA 495: Explosive Materials Code (blasting)
///   - Levy & Salvadori: "Why Buildings Fall Down" (1992)
///   - ICE: "Demolition: Planning, Design and Safety" (2013)
///   - ASCE: "Guidelines for Demolition of Structures"
///
/// Tests verify structural stability during partial demolition,
/// collapse mechanism control, blasting calculations, debris
/// trajectory, temporary works, and exclusion zones.

mod helpers;

// ================================================================
// 1. Structural Stability During Partial Demolition
// ================================================================
//
// As elements are removed, remaining structure must be stable.
// Check load path integrity at each stage.
// Robustness: structure must not collapse beyond intended zone.

#[test]
fn demo_partial_stability() {
    // Multi-storey frame: removing one bay at a time
    let n_bays: usize = 4;
    let n_storeys: usize = 5;
    let p_floor: f64 = 5.0;         // kN/m², dead load on floors
    let span: f64 = 6.0;            // m, bay width
    let storey_h: f64 = 3.5;        // m

    // After removing one external bay, internal column becomes edge
    let p_column_before: f64 = p_floor * span * span * (n_storeys as f64); // kN (both sides)
    let p_column_after: f64 = p_floor * span * (span / 2.0) * (n_storeys as f64); // kN (one side only)

    // Load on adjacent column increases
    let load_increase: f64 = p_column_before - p_column_after;

    assert!(
        load_increase > 0.0,
        "Load redistribution: {:.0} kN", load_increase
    );

    // Remaining columns must have capacity
    let f_ck: f64 = 30.0;           // MPa
    let a_col: f64 = 400.0 * 400.0; // mm² (400×400mm column)
    let n_rd: f64 = 0.567 * f_ck * a_col / 1000.0; // kN (simplified)

    assert!(
        n_rd > p_column_before,
        "Column capacity {:.0} > max load {:.0} kN", n_rd, p_column_before
    );

    // Stability ratio (overturning during partial demolition)
    let w_remaining: f64 = p_floor * (n_bays as f64 - 1.0) * span
        * span * (n_storeys as f64); // kN, total dead load
    let h_total: f64 = (n_storeys as f64) * storey_h;
    let wind_force: f64 = 0.5 * (n_bays as f64) * span * h_total; // kN (reduced wind)
    let m_over: f64 = wind_force * h_total / 2.0;
    let m_stab: f64 = w_remaining * (n_bays as f64 - 1.0) * span / 2.0;

    let stability: f64 = m_stab / m_over;

    assert!(
        stability > 1.5,
        "Stability ratio: {:.1}", stability
    );
}

// ================================================================
// 2. Controlled Collapse -- Blasting Sequence
// ================================================================
//
// Progressive collapse by sequential removal of supports.
// Delay timing: milliseconds between charges.
// Direction controlled by sequence and pre-weakening.

#[test]
fn demo_blast_sequence() {
    // Building dimensions
    let l: f64 = 30.0;              // m, length
    let w: f64 = 15.0;              // m, width
    let h: f64 = 40.0;              // m, height (10 storeys)
    let n_columns_x: usize = 5;     // columns along length
    let n_columns_y: usize = 3;     // columns along width

    // Collapse direction: fall to the east (positive x)
    // Sequence: east columns first, then west
    let delay_between_rows: f64 = 250.0; // ms

    // Total collapse time (free fall from hinge height)
    let hinge_height: f64 = h / 3.0; // m, hinge at 1/3 height
    let t_fall: f64 = (2.0 * hinge_height / 9.81).sqrt(); // seconds

    assert!(
        t_fall > 1.0 && t_fall < 5.0,
        "Fall time: {:.1} s", t_fall
    );

    // Total blast sequence duration
    let n_rows: usize = n_columns_x;
    let t_sequence: f64 = (n_rows as f64 - 1.0) * delay_between_rows / 1000.0; // seconds

    assert!(
        t_sequence < t_fall,
        "Sequence {:.2}s < fall {:.1}s", t_sequence, t_fall
    );

    // Collapse footprint prediction
    let fall_radius: f64 = h * 0.7; // approximate collapse radius

    assert!(
        fall_radius < h,
        "Fall radius: {:.0} m", fall_radius
    );

    // Exclusion zone
    let exclusion: f64 = fall_radius * 1.5; // safety factor

    assert!(
        exclusion > h,
        "Exclusion zone: {:.0} m from building", exclusion
    );

    let _n_columns_y = n_columns_y;
    let _l = l;
    let _w = w;
}

// ================================================================
// 3. Debris Trajectory
// ================================================================
//
// Flying debris from blasting must be contained.
// Trajectory: projectile motion with air resistance.
// Horizontal range = v² sin(2θ) / g (no air resistance).

#[test]
fn demo_debris_trajectory() {
    let v0: f64 = 15.0;             // m/s, initial velocity (from blast)
    let theta: f64 = 45.0_f64.to_radians(); // launch angle (worst case)
    let h0: f64 = 10.0;             // m, launch height

    // Horizontal range (no air resistance, from elevated position)
    let vx: f64 = v0 * theta.cos();
    let vy: f64 = v0 * theta.sin();
    let g: f64 = 9.81;

    // Time of flight: h0 + vy*t - 0.5*g*t² = 0
    // 0.5*g*t² - vy*t - h0 = 0
    let t_flight: f64 = (vy + (vy * vy + 2.0 * g * h0).sqrt()) / g;

    let range: f64 = vx * t_flight;

    assert!(
        range > 20.0 && range < 80.0,
        "Debris range: {:.0} m", range
    );

    // With air resistance (drag reduces range by ~30-50%)
    let drag_factor: f64 = 0.6;     // range reduction factor
    let range_with_drag: f64 = range * drag_factor;

    assert!(
        range_with_drag < range,
        "With drag: {:.0} m", range_with_drag
    );

    // Safety buffer
    let buffer: f64 = 1.5;          // safety factor
    let safe_distance: f64 = range * buffer; // use no-drag range for safety

    assert!(
        safe_distance > range,
        "Safe distance: {:.0} m", safe_distance
    );
}

// ================================================================
// 4. Pre-Weakening Calculations
// ================================================================
//
// Structural elements pre-weakened before blasting.
// Concrete columns: partial cutting to create hinge.
// Steel: torch cutting to reduce cross-section.

#[test]
fn demo_pre_weakening() {
    // Concrete column
    let b: f64 = 400.0;             // mm, column width
    let h: f64 = 400.0;             // mm, column depth
    let n_ed: f64 = 1500.0;         // kN, axial load
    let f_ck: f64 = 30.0;           // MPa

    // Original capacity
    let n_rd_full: f64 = 0.567 * f_ck * b * h / 1000.0; // kN

    assert!(
        n_rd_full > n_ed,
        "Original capacity: {:.0} > {:.0} kN", n_rd_full, n_ed
    );

    // Pre-weakened (cut 70% of section)
    let cut_ratio: f64 = 0.75;
    let a_remaining: f64 = b * h * (1.0 - cut_ratio);
    let n_rd_weak: f64 = 0.567 * f_ck * a_remaining / 1000.0; // kN

    // Weakened column cannot carry load → needs blast to trigger
    // But reduced charge needed
    assert!(
        n_rd_weak < n_ed,
        "Weakened capacity {:.0} < load {:.0} kN", n_rd_weak, n_ed
    );

    // Remaining capacity ratio (determines blast charge needed)
    let capacity_ratio: f64 = n_rd_weak / n_ed;

    assert!(
        capacity_ratio < 0.5,
        "Capacity ratio: {:.2} (< 0.5 for easy collapse)", capacity_ratio
    );

    // Steel section cutting
    let d_beam: f64 = 300.0;        // mm, beam depth
    let t_flange: f64 = 15.0;       // mm
    let _t_web: f64 = 10.0;         // mm
    let cut_depth: f64 = d_beam - 2.0 * t_flange; // cut through web

    assert!(
        cut_depth / d_beam > 0.80,
        "Web cut ratio: {:.0}%", cut_depth / d_beam * 100.0
    );
}

// ================================================================
// 5. Temporary Works for Demolition
// ================================================================
//
// Propping and bracing during sequential demolition.
// Dead shores, raking shores, flying shores.
// Must support loads from all stages above.

#[test]
fn demo_temporary_works() {
    // Dead shore under wall during opening formation
    let wall_load: f64 = 200.0;     // kN/m, wall self-weight above opening
    let opening_span: f64 = 3.0;    // m
    let total_load: f64 = wall_load * opening_span;

    // Number of props
    let prop_capacity: f64 = 150.0; // kN per prop (Acrow type)
    let n_props: f64 = (total_load / prop_capacity).ceil();

    assert!(
        n_props >= 4.0,
        "Props required: {:.0}", n_props
    );

    // Needles (steel beams through wall)
    let n_needles: usize = 2;       // at each side of opening
    let p_per_needle: f64 = total_load / n_needles as f64;

    assert!(
        p_per_needle > 200.0,
        "Load per needle: {:.0} kN", p_per_needle
    );

    // Needle beam design
    let span_needle: f64 = 1.5;     // m, bearing on each side
    let m_needle: f64 = p_per_needle * span_needle / 4.0;
    let f_y: f64 = 275.0;           // MPa
    let w_req: f64 = m_needle * 1e6 / f_y; // mm³

    assert!(
        w_req > 100_000.0,
        "Needle W_req: {:.0} mm³", w_req
    );

    // Raking shore (for wall stability)
    let wall_height: f64 = 8.0;     // m
    let shore_angle: f64 = 60.0_f64.to_radians(); // from horizontal
    let h_wind: f64 = 0.5;          // kN/m², wind on wall
    let f_shore: f64 = h_wind * wall_height * (opening_span / 2.0) / shore_angle.sin();

    assert!(
        f_shore > 2.0,
        "Shore force: {:.1} kN", f_shore
    );
}

// ================================================================
// 6. Vibration from Demolition -- Impact
// ================================================================
//
// Wrecking ball or floor drop generates ground vibrations.
// Peak particle velocity (PPV) must be within limits.
// BS 7385: PPV limits for buildings near demolition.

#[test]
fn demo_vibration() {
    // Impact energy from floor collapse
    let m_floor: f64 = 50_000.0;    // kg, mass of one floor
    let h_drop: f64 = 3.5;          // m, storey height
    let e_impact: f64 = m_floor * 9.81 * h_drop; // J (potential energy)

    assert!(
        e_impact > 1_000_000.0,
        "Impact energy: {:.0} kJ", e_impact / 1000.0
    );

    // PPV attenuation with distance
    // PPV = K × (W^0.5 / D)^n (scaled distance approach)
    let k: f64 = 1140.0;            // site constant
    let n: f64 = 1.6;               // attenuation exponent
    let w_equiv: f64 = e_impact / 1e6; // MJ, equivalent "charge weight"
    let d: f64 = 50.0;              // m, distance to nearest building

    let sd: f64 = d / w_equiv.sqrt(); // scaled distance
    let ppv: f64 = k * sd.powf(-n); // mm/s

    assert!(
        ppv > 0.0,
        "PPV at {:.0}m: {:.1} mm/s", d, ppv
    );

    // BS 7385-2 limits
    let ppv_limit_residential: f64 = 15.0; // mm/s at 4 Hz (residential)
    let ppv_limit_commercial: f64 = 25.0;  // mm/s (commercial)

    // Check at various distances
    let d_safe: f64 = 100.0;
    let sd_safe: f64 = d_safe / w_equiv.sqrt();
    let ppv_safe: f64 = k * sd_safe.powf(-n);

    assert!(
        ppv_safe < ppv_limit_commercial,
        "PPV at {:.0}m: {:.1} < {:.0} mm/s", d_safe, ppv_safe, ppv_limit_commercial
    );

    let _ppv_limit_residential = ppv_limit_residential;
}

// ================================================================
// 7. Dust and Noise Assessment
// ================================================================
//
// Environmental impact of demolition activities.
// Noise levels: dB(A) at receiver.
// Dust: PM10 concentrations.
// BS 5228: Noise and vibration control on construction sites.

#[test]
fn demo_dust_noise() {
    // Noise from demolition equipment
    let l_w_breaker: f64 = 110.0;   // dB(A), sound power level (hydraulic breaker)
    let l_w_crusher: f64 = 105.0;   // dB(A), crusher
    let l_w_excavator: f64 = 100.0; // dB(A), excavator

    // Sound pressure level at distance r (free field)
    // Lp = Lw - 20×log10(r) - 11
    let r: f64 = 50.0;              // m, distance to receptor
    let lp_breaker: f64 = l_w_breaker - 20.0 * r.log10() - 11.0;
    let lp_crusher: f64 = l_w_crusher - 20.0 * r.log10() - 11.0;
    let _lp_excavator: f64 = l_w_excavator - 20.0 * r.log10() - 11.0;

    // Combined level (energy addition)
    let lp_combined: f64 = 10.0 * (10.0_f64.powf(lp_breaker / 10.0)
        + 10.0_f64.powf(lp_crusher / 10.0)
        + 10.0_f64.powf(_lp_excavator / 10.0))
        .log10();

    // BS 5228 limit: 75 dB(A) at residential boundary (daytime)
    let limit_day: f64 = 75.0;

    assert!(
        lp_combined < limit_day,
        "Noise at {:.0}m: {:.0} < {:.0} dB(A)", r, lp_combined, limit_day
    );

    // Barrier attenuation (site hoarding)
    let barrier_reduction: f64 = 10.0; // dB, 3m high hoarding
    let lp_with_barrier: f64 = lp_combined - barrier_reduction;

    assert!(
        lp_with_barrier < lp_combined,
        "With barrier: {:.0} dB(A)", lp_with_barrier
    );

    // Dust: inverse square law for concentration
    let pm10_source: f64 = 500.0;   // µg/m³, at 10m from source
    let r_source: f64 = 10.0;       // m
    let r_receptor: f64 = 50.0;     // m
    let pm10_receptor: f64 = pm10_source * (r_source / r_receptor).powi(2);

    // Limit: 50 µg/m³ (24-hour average, EU directive)
    let pm10_limit: f64 = 50.0;

    assert!(
        pm10_receptor < pm10_limit,
        "PM10 at {:.0}m: {:.0} < {:.0} µg/m³", r_receptor, pm10_receptor, pm10_limit
    );
}

// ================================================================
// 8. Structural Assessment Before Demolition
// ================================================================
//
// Survey existing structure to plan demolition.
// Identify load paths, hazardous materials, buried services.
// Assess residual capacity for safe working.

#[test]
fn demo_structural_assessment() {
    // Concrete strength estimation (core testing)
    let core_results: [f64; 5] = [28.0, 32.0, 25.0, 30.0, 27.0]; // MPa
    let n: f64 = core_results.len() as f64;

    let mean: f64 = core_results.iter().sum::<f64>() / n;
    let variance: f64 = core_results.iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>() / (n - 1.0);
    let std_dev: f64 = variance.sqrt();

    // Characteristic strength (mean - 1.64σ)
    let f_ck_est: f64 = mean - 1.64 * std_dev;

    assert!(
        f_ck_est > 20.0,
        "Estimated f_ck: {:.1} MPa", f_ck_est
    );

    // Coefficient of variation
    let cov: f64 = std_dev / mean;

    assert!(
        cov < 0.20,
        "CoV: {:.2} (<0.20 typical for in-situ concrete)", cov
    );

    // Residual capacity of corroded column
    let d_bar: f64 = 20.0;          // mm, original bar diameter
    let corrosion_loss: f64 = 2.0;  // mm, diameter reduction
    let d_corroded: f64 = d_bar - corrosion_loss;
    let area_ratio: f64 = (d_corroded / d_bar).powi(2);

    assert!(
        area_ratio > 0.80,
        "Steel area remaining: {:.0}%", area_ratio * 100.0
    );

    // Safe working load for demolition plant
    let original_capacity: f64 = 3000.0; // kN (column)
    let condition_factor: f64 = 0.70;     // 30% reduction for deterioration
    let safe_load: f64 = original_capacity * condition_factor * area_ratio;

    assert!(
        safe_load > 1500.0,
        "Safe load: {:.0} kN", safe_load
    );

    // Floor safe working load for equipment
    let floor_capacity: f64 = 5.0;  // kN/m², original design
    let floor_safe: f64 = floor_capacity * condition_factor;
    let excavator_pressure: f64 = 2.5; // kN/m² (spread by mats)

    assert!(
        floor_safe > excavator_pressure,
        "Floor safe {:.1} > equipment {:.1} kN/m²", floor_safe, excavator_pressure
    );
}
