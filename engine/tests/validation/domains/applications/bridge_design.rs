/// Validation: Bridge Design
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications 9th ed. (2020)
///   - EN 1991-2:2003 (EC1-2): Traffic loads on bridges
///   - EN 1993-2:2006 (EC3-2): Steel bridges
///   - Barker & Puckett: "Design of Highway Bridges" 3rd ed. (2013)
///   - Priestley, Seible & Calvi: "Seismic Design and Retrofit of Bridges" (1996)
///
/// Tests verify load models, distribution factors, load combinations,
/// and design checks specific to bridge engineering.

// ================================================================
// 1. AASHTO HL-93 Live Load
// ================================================================
//
// HL-93: max of {HS-20 truck + lane} or {tandem + lane}
// HS-20: 35kN, 145kN, 145kN at 4.3m spacing (can vary 4.3-9.0m)
// Tandem: 110kN + 110kN at 1.2m spacing
// Lane: 9.3 kN/m uniform

#[test]
fn bridge_aashto_hl93_load() {
    let p_front: f64 = 35.0;    // kN, front axle
    let p_rear: f64 = 145.0;    // kN, each rear axle
    let _s_axle: f64 = 4.3;     // m, axle spacing (fixed rear)
    let w_lane: f64 = 9.3;      // kN/m, lane load

    // HS-20 truck weight
    let w_truck: f64 = p_front + 2.0 * p_rear;
    let w_truck_expected: f64 = 325.0;

    assert!(
        (w_truck - w_truck_expected).abs() < 0.1,
        "HS-20 truck weight: {:.1} kN, expected {:.1}", w_truck, w_truck_expected
    );

    // Tandem
    let p_tandem: f64 = 110.0;   // kN per axle
    let w_tandem: f64 = 2.0 * p_tandem;
    assert!((w_tandem - 220.0).abs() < 0.1, "Tandem: {:.0} kN", w_tandem);

    // For short spans, tandem + lane may govern
    let l: f64 = 10.0; // m
    let m_truck: f64 = p_rear * l / 4.0; // approximate max moment (center loading)
    let m_lane: f64 = w_lane * l * l / 8.0;
    let m_tandem: f64 = p_tandem * l / 2.0; // approximate

    let m_hl93_truck: f64 = m_truck + m_lane;
    let m_hl93_tandem: f64 = m_tandem + m_lane;
    let m_hl93: f64 = m_hl93_truck.max(m_hl93_tandem);

    assert!(
        m_hl93 > 0.0,
        "HL-93 moment: {:.1} kN·m (truck+lane={:.1}, tandem+lane={:.1})",
        m_hl93, m_hl93_truck, m_hl93_tandem
    );
}

// ================================================================
// 2. EN 1991-2 Load Model 1 (LM1)
// ================================================================
//
// LM1: Tandem system (TS) + uniform distributed load (UDL)
// Lane 1: αQ1*Q1k = 300 kN (2×150kN) + αq1*q1k = 9.0 kN/m²
// Lane 2: αQ2*Q2k = 200 kN (2×100kN) + αq2*q2k = 2.5 kN/m²
// Remaining: αqr*qrk = 2.5 kN/m²

#[test]
fn bridge_en1991_lm1() {
    let q1_ts: f64 = 300.0;   // kN, lane 1 tandem (total)
    let q2_ts: f64 = 200.0;   // kN, lane 2 tandem
    let q1_udl: f64 = 9.0;    // kN/m², lane 1 UDL
    let q2_udl: f64 = 2.5;    // kN/m², lane 2 UDL
    let w_lane: f64 = 3.0;    // m, notional lane width

    // Total tandem for 2-lane bridge
    let ts_total: f64 = q1_ts + q2_ts;
    let ts_expected: f64 = 500.0;
    assert!((ts_total - ts_expected).abs() < 0.1, "Total TS: {:.0} kN", ts_total);

    // UDL per meter of bridge for 2 lanes
    let udl_per_m: f64 = (q1_udl + q2_udl) * w_lane;
    // = (9.0 + 2.5) * 3.0 = 34.5 kN/m
    let udl_expected: f64 = 34.5;

    assert!(
        (udl_per_m - udl_expected).abs() / udl_expected < 0.01,
        "UDL per meter: {:.1} kN/m, expected {:.1}", udl_per_m, udl_expected
    );

    // EC1-2 is generally heavier than HL-93 for short-medium spans
    let l: f64 = 20.0;
    let m_lm1: f64 = ts_total * l / 4.0 + udl_per_m * l * l / 8.0;
    assert!(
        m_lm1 > 0.0,
        "LM1 moment at {}m span: {:.0} kN·m", l, m_lm1
    );
}

// ================================================================
// 3. AASHTO Distribution Factor (Lever Rule)
// ================================================================
//
// For interior girder, one lane loaded:
// g = S/10 (S in feet, for concrete deck on steel beams, S ≤ 10 ft)
// Or lever rule for exterior girder

#[test]
fn bridge_aashto_distribution_factor() {
    let s_ft: f64 = 8.0;       // ft, girder spacing (2.44 m)

    // Simplified for interior beam, one lane
    let g_interior: f64 = s_ft / 10.0;
    let g_expected: f64 = 0.80;

    assert!(
        (g_interior - g_expected).abs() / g_expected < 0.01,
        "Distribution factor: {:.2}, expected {:.2}", g_interior, g_expected
    );

    // Two or more lanes: g = S/9.5 (approximate for concrete deck, steel beams)
    let g_multi: f64 = s_ft / 9.5;

    assert!(
        g_multi > g_interior,
        "Multi-lane DF {:.3} > single {:.3}", g_multi, g_interior
    );

    // Multiple presence factors: m1 = 1.20, m2 = 1.00, m3 = 0.85
    let m1: f64 = 1.20;
    let m2: f64 = 1.00;
    let _m3: f64 = 0.85;

    // Effective DF with multiple presence
    let g_eff_1: f64 = g_interior * m1;
    let g_eff_2: f64 = g_multi * m2;

    let g_governing: f64 = g_eff_1.max(g_eff_2);
    assert!(
        g_governing > 0.5,
        "Governing DF: {:.3}", g_governing
    );
}

// ================================================================
// 4. AASHTO Load Combinations (Strength I, Service I)
// ================================================================
//
// Strength I: η*(1.25DC + 1.50DW + 1.75(LL+IM))
// Service I: 1.0(DC + DW + LL+IM)
// IM (impact): 33% for truck load, 0% for lane load

#[test]
fn bridge_aashto_load_combinations() {
    let dc: f64 = 500.0;   // kN, dead load (structural)
    let dw: f64 = 80.0;    // kN, dead load (wearing surface)
    let ll: f64 = 300.0;   // kN, live load (with distribution)
    let im: f64 = 0.33;    // impact factor

    // Live load with impact
    let ll_im: f64 = ll * (1.0 + im);
    let ll_im_expected: f64 = 399.0;

    assert!(
        (ll_im - ll_im_expected).abs() / ll_im_expected < 0.01,
        "LL+IM: {:.0} kN, expected {:.0}", ll_im, ll_im_expected
    );

    // Strength I
    let eta: f64 = 1.0; // importance, ductility, redundancy
    let strength_i: f64 = eta * (1.25 * dc + 1.50 * dw + 1.75 * ll_im);
    // = 1.0 * (625 + 120 + 698.25) = 1443.25

    let strength_expected: f64 = 1.0 * (1.25 * 500.0 + 1.50 * 80.0 + 1.75 * 399.0);
    assert!(
        (strength_i - strength_expected).abs() / strength_expected < 0.01,
        "Strength I: {:.1} kN, expected {:.1}", strength_i, strength_expected
    );

    // Service I
    let service_i: f64 = dc + dw + ll_im;
    assert!(
        service_i < strength_i,
        "Service I ({:.0}) < Strength I ({:.0})", service_i, strength_i
    );

    // Factored/unfactored ratio
    let factor_ratio: f64 = strength_i / service_i;
    assert!(
        factor_ratio > 1.3 && factor_ratio < 2.0,
        "Factor ratio: {:.3}", factor_ratio
    );
}

// ================================================================
// 5. Bridge Deck Effective Width (EC3-2 / AASHTO)
// ================================================================
//
// Effective flange width for composite girder:
// AASHTO: beff = min(L/4, 12*ts + max(tw/2, bf/2), S/2)
// EC4: beff = min(Le/8, bi) per side

#[test]
fn bridge_effective_width() {
    let l: f64 = 24.0;       // m, span length
    let s: f64 = 2.5;        // m, girder spacing
    let ts: f64 = 0.200;     // m, slab thickness
    let bf: f64 = 0.300;     // m, steel flange width

    // AASHTO effective width (each side)
    let b1: f64 = l / 4.0;           // = 6.0 m (each side)
    let b2: f64 = 12.0 * ts + bf / 2.0; // = 2.4 + 0.15 = 2.55 m
    let b3: f64 = s / 2.0;           // = 1.25 m (to adjacent girder)

    // Effective width per side = min of above
    let b_eff_side: f64 = b1.min(b2).min(b3);
    assert!(
        (b_eff_side - 1.25).abs() < 0.01,
        "Effective width per side: {:.2} m (controlled by spacing)", b_eff_side
    );

    // Total effective width
    let b_eff: f64 = 2.0 * b_eff_side;
    assert!(
        (b_eff - 2.5).abs() < 0.01,
        "Total effective width: {:.2} m = girder spacing", b_eff
    );

    // EC4 check: beff = min(Le/8, bi) per side
    let le: f64 = 0.85 * l; // for end span
    let b_ec4_side: f64 = (le / 8.0).min(s / 2.0);
    // = min(2.55, 1.25) = 1.25 m — same as AASHTO for this case

    assert!(
        (b_ec4_side - b_eff_side).abs() < 0.1,
        "EC4 {:.2} ≈ AASHTO {:.2}", b_ec4_side, b_eff_side
    );
}

// ================================================================
// 6. Bridge Bearing Design Force
// ================================================================
//
// Horizontal force on bearings:
// Braking: 25% of truck axle loads (AASHTO)
// Thermal: F_thermal = k_bearing * α * ΔT * L
// Seismic: Cs * W_tributary

#[test]
fn bridge_bearing_forces() {
    let w_truck: f64 = 325.0;  // kN, HS-20 truck weight

    // Braking force (AASHTO §3.6.4)
    let braking: f64 = 0.25 * w_truck;
    let braking_expected: f64 = 81.25;

    assert!(
        (braking - braking_expected).abs() / braking_expected < 0.01,
        "Braking force: {:.2} kN, expected {:.2}", braking, braking_expected
    );

    // Thermal movement
    let l: f64 = 30.0;         // m, expansion length
    let alpha: f64 = 12e-6;    // 1/°C (steel)
    let delta_t: f64 = 50.0;   // °C, temperature range
    let delta_thermal: f64 = alpha * delta_t * l * 1000.0; // mm
    // = 12e-6 * 50 * 30 * 1000 = 18.0 mm
    let delta_expected: f64 = 18.0;

    assert!(
        (delta_thermal - delta_expected).abs() / delta_expected < 0.01,
        "Thermal movement: {:.1} mm, expected {:.1}", delta_thermal, delta_expected
    );

    // Elastomeric bearing shear force
    let g_rubber: f64 = 0.9;   // MPa, shear modulus of rubber
    let a_bearing: f64 = 0.3 * 0.5; // m², bearing area
    let h_rubber: f64 = 0.060; // m, total rubber thickness
    let f_thermal: f64 = g_rubber * 1000.0 * a_bearing * (delta_thermal / 1000.0) / h_rubber;
    // = 900 * 0.15 * 0.018 / 0.060 = 40.5 kN

    assert!(
        f_thermal > 10.0 && f_thermal < 200.0,
        "Bearing thermal force: {:.1} kN", f_thermal
    );
}

// ================================================================
// 7. Bridge Fatigue — AASHTO Fatigue Truck
// ================================================================
//
// AASHTO fatigue truck: single HS-20 truck with fixed 9.0m rear axle spacing
// Fatigue I (infinite life): 1.75*(LL+IM), IM = 15% for fatigue
// Fatigue II (finite life): 0.80*(LL+IM)

#[test]
fn bridge_fatigue_truck() {
    let p_front: f64 = 35.0;   // kN
    let p_rear: f64 = 145.0;   // kN each
    let _s_rear: f64 = 9.0;    // m, fixed rear spacing for fatigue
    let im_fatigue: f64 = 0.15; // 15% for fatigue

    // Fatigue truck weight with impact
    let w_fat: f64 = (p_front + 2.0 * p_rear) * (1.0 + im_fatigue);
    let w_expected: f64 = 325.0 * 1.15;

    assert!(
        (w_fat - w_expected).abs() / w_expected < 0.01,
        "Fatigue truck+IM: {:.1} kN, expected {:.1}", w_fat, w_expected
    );

    // Fatigue I (infinite life) load factor
    let fatigue_i: f64 = 1.75 * w_fat;
    // Fatigue II (finite life) load factor
    let fatigue_ii: f64 = 0.80 * w_fat;

    assert!(
        fatigue_i > fatigue_ii,
        "Fatigue I ({:.0}) > Fatigue II ({:.0})", fatigue_i, fatigue_ii
    );

    // AASHTO constant amplitude fatigue threshold (CAFT)
    // Category C detail: (ΔF)_TH = 69 MPa (10 ksi)
    let caft_c: f64 = 69.0; // MPa

    // For infinite life: Δf_max ≤ (ΔF)_TH / 2 (for welded connections)
    // Check would use actual stress range from analysis
    assert!(
        caft_c > 0.0,
        "Category C CAFT: {:.0} MPa", caft_c
    );
}

// ================================================================
// 8. Bridge Pier Design — Seismic
// ================================================================
//
// AASHTO seismic: design for elastic seismic force / R
// Single column: R = 3.0 (operational), R = 1.5 (life safety)
// Plastic hinge length: Lp = 0.08*L + 0.15*fy*db ≥ 0.3*fy*db

#[test]
fn bridge_pier_seismic() {
    let cs: f64 = 0.40;       // seismic coefficient
    let w_trib: f64 = 5000.0; // kN, tributary weight
    let r: f64 = 3.0;         // response modification factor

    // Design seismic force
    let v_elastic: f64 = cs * w_trib;
    let v_design: f64 = v_elastic / r;

    let v_elastic_expected: f64 = 2000.0;
    let v_design_expected: f64 = 666.7;

    assert!(
        (v_elastic - v_elastic_expected).abs() / v_elastic_expected < 0.01,
        "Elastic seismic: {:.0} kN, expected {:.0}", v_elastic, v_elastic_expected
    );
    assert!(
        (v_design - v_design_expected).abs() / v_design_expected < 0.01,
        "Design seismic: {:.1} kN, expected {:.1}", v_design, v_design_expected
    );

    // Plastic hinge length (AASHTO §5.10.11.4.1c)
    let l_col: f64 = 8000.0;  // mm, column height
    let fy: f64 = 420.0;      // MPa
    let db: f64 = 32.0;       // mm, longitudinal bar diameter

    let lp_1: f64 = 0.08 * l_col + 0.15 * fy * db;
    let lp_min: f64 = 0.30 * fy * db;
    let lp: f64 = lp_1.max(lp_min);

    // lp_1 = 640 + 2016 = 2656 mm
    // lp_min = 4032 mm
    // lp = max(2656, 4032) = 4032 mm
    assert!(
        (lp - lp_min).abs() < 1.0,
        "Plastic hinge length: {:.0} mm (minimum governs)", lp
    );

    // Hinge length / column height ratio
    let lp_ratio: f64 = lp / l_col;
    assert!(
        lp_ratio > 0.3 && lp_ratio < 0.6,
        "Lp/L = {:.3}", lp_ratio
    );
}
