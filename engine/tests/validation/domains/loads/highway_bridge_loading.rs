/// Validation: Highway Bridge Loading Analysis (Formula Verification)
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed. (2020)
///   - EN 1991-2:2003 — Traffic loads on bridges (Eurocode 1, Part 2)
///   - BS 5400-2:2006 — Steel, concrete and composite bridges
///   - Austroads Bridge Design Code (AS 5100.2)
///   - Barker & Puckett, "Design of Highway Bridges", 3rd Ed.
///
/// Pure formula-verification tests (no solver calls). These tests verify
/// that the standard highway bridge loading parameters, combination rules,
/// and derived quantities are computed correctly from first principles.
///
/// Tests:
///   1. HL-93 design truck + lane load (AASHTO LRFD §3.6.1.2)
///   2. Load Model 1 (LM1) from EN 1991-2 (tandem + UDL)
///   3. Fatigue truck model (AASHTO LRFD §3.6.1.4)
///   4. Multi-lane reduction factors (AASHTO LRFD Table 3.6.1.1.2-1)
///   5. Dynamic load allowance / impact factor (AASHTO LRFD §3.6.2)
///   6. Permit/overweight vehicle analysis
///   7. Pedestrian loading on bridge (AASHTO LRFD §3.6.1.6)
///   8. Centrifugal force on curved bridge (AASHTO LRFD §3.6.3)
// ================================================================
// 1. HL-93 Design Truck + Lane Load (AASHTO LRFD §3.6.1.2)
// ================================================================
//
// The AASHTO HL-93 live load consists of a design truck OR tandem,
// combined with a design lane load.
//
// Design truck axle weights: 35 kN (8 kip) front, 145 kN (32 kip) middle,
// 145 kN (32 kip) rear. Spacings: 4.3 m (14 ft) between front and middle,
// 4.3 m to 9.0 m (14 ft to 30 ft) variable between middle and rear.
//
// Design lane load: 9.3 kN/m (0.64 klf) uniformly distributed.
//
// For a simply-supported beam of span L, the maximum midspan moment
// from the truck alone (with minimum 4.3 m rear spacing) positioned
// for maximum effect:
//   M_truck = P_total * L / 4  (approximate, for long spans)
//   More precisely, for L >> axle spacing, truck ≈ 325 kN point load.
//
// Lane load midspan moment: M_lane = q * L^2 / 8
// Total HL-93 moment: M_HL93 = M_truck + M_lane (superposition)

#[test]
fn validation_hl93_design_truck_plus_lane_load() {
    // HL-93 truck axle weights (kN)
    let _p_front: f64 = 35.0;
    let _p_middle: f64 = 145.0;
    let _p_rear: f64 = 145.0;
    let p_total: f64 = 35.0 + 145.0 + 145.0; // 325 kN total truck weight

    // Axle spacings
    let _s1: f64 = 4.3; // front to middle (m)
    let _s2: f64 = 4.3; // middle to rear, minimum (m)

    // Design lane load
    let q_lane: f64 = 9.3; // kN/m

    // Simply-supported beam span
    let span: f64 = 30.0; // m

    // Verify total truck weight
    assert!(
        (p_total - 325.0).abs() < 1e-10,
        "HL-93 truck total weight should be 325 kN, got {:.1} kN", p_total
    );

    // Lane load moment at midspan: M_lane = q * L^2 / 8
    let m_lane: f64 = q_lane * span * span / 8.0;
    let m_lane_expected: f64 = 9.3 * 900.0 / 8.0; // = 1046.25 kN-m
    assert!(
        (m_lane - m_lane_expected).abs() < 0.01,
        "Lane load midspan moment: got {:.2} kN-m, expected {:.2} kN-m",
        m_lane, m_lane_expected
    );

    // For a long span (L >> axle spacing), the truck can be approximated
    // as a single resultant of 325 kN. The maximum moment from a point
    // load at midspan of SS beam: M = P*L/4 = 325*30/4 = 2437.5 kN-m.
    // The actual truck moment is less because axles are distributed.
    // For L=30m with standard spacing (total wheelbase 8.6m), the
    // maximum truck moment is computed by positioning the resultant.
    //
    // Exact maximum moment for HL-93 truck on 30m span:
    // Position middle axle at midspan. Front at 10.7m, rear at 19.3m.
    // R_A = (35*19.3 + 145*15.0 + 145*10.7) / 30.0
    // R_A = (675.5 + 2175.0 + 1551.5) / 30.0 = 4402.0/30.0 = 146.73 kN
    // M_mid = R_A * 15.0 - 35 * 4.3 = 146.73*15.0 - 150.5 = 2050.5 kN-m
    let r_a: f64 = (35.0 * 19.3 + 145.0 * 15.0 + 145.0 * 10.7) / 30.0;
    let m_truck: f64 = r_a * 15.0 - 35.0 * 4.3;

    assert!(
        m_truck > 2000.0 && m_truck < 2500.0,
        "HL-93 truck midspan moment should be ~2050 kN-m for 30m span, got {:.1} kN-m",
        m_truck
    );

    // Total HL-93 moment (truck + lane, superposition)
    let m_hl93: f64 = m_truck + m_lane;
    assert!(
        m_hl93 > 3000.0 && m_hl93 < 4000.0,
        "HL-93 total midspan moment (truck+lane) should be ~3100 kN-m, got {:.1} kN-m",
        m_hl93
    );

    // Design tandem alternative: two 110 kN axles spaced 1.2 m
    // M_tandem at midspan for SS beam: position symmetrically about center
    // R_A = 110 * (L/2 + 0.6)/L + 110 * (L/2 - 0.6)/L = 110 kN
    let _p_tandem_axle: f64 = 110.0;
    let _s_tandem: f64 = 1.2;
    let r_a_tandem: f64 = 110.0; // by symmetry
    let m_tandem: f64 = r_a_tandem * (span / 2.0) - 110.0 * 0.6;
    let m_hl93_tandem: f64 = m_tandem + m_lane;

    // For L=30m, truck governs over tandem
    assert!(
        m_hl93 > m_hl93_tandem,
        "For L=30m, truck ({:.1}) should govern over tandem ({:.1})",
        m_hl93, m_hl93_tandem
    );
}

// ================================================================
// 2. Load Model 1 (LM1) from EN 1991-2 (Tandem + UDL)
// ================================================================
//
// Eurocode Load Model 1 for highway bridges:
// Each notional lane gets a tandem system (TS) + uniformly distributed
// load (UDL). The characteristic values for Lane 1:
//   - Tandem: 2 axles of 300 kN each (total 600 kN), spacing 1.2 m
//   - UDL: 9.0 kN/m^2 over lane width of 3.0 m = 27.0 kN/m per lane
//
// For Lane 2:
//   - Tandem: 2 axles of 200 kN each
//   - UDL: 2.5 kN/m^2
//
// Adjustment factors alpha_Q and alpha_q may apply per national annex.

#[test]
fn validation_eurocode_lm1_tandem_plus_udl() {
    // EN 1991-2 Table 4.2: Lane 1 characteristic values
    let q_tandem_lane1: f64 = 300.0; // kN per axle
    let _n_axles: usize = 2;
    let axle_spacing: f64 = 1.2; // m
    let q_udl_lane1: f64 = 9.0; // kN/m^2
    let lane_width: f64 = 3.0; // m
    let w_udl_lane1: f64 = q_udl_lane1 * lane_width; // 27.0 kN/m

    // Simply-supported span
    let span: f64 = 20.0; // m

    // Tandem positioned for maximum midspan moment:
    // Two 300 kN axles, 1.2 m apart, placed symmetrically about midspan.
    // Axle 1 at x = L/2 - 0.6, Axle 2 at x = L/2 + 0.6
    // R_A = 300 * (L/2 + 0.6)/L + 300 * (L/2 - 0.6)/L = 300 kN (by symmetry)
    let r_a_ts: f64 = q_tandem_lane1; // 300 kN by symmetry
    let m_ts: f64 = r_a_ts * (span / 2.0) - q_tandem_lane1 * (axle_spacing / 2.0);

    // UDL midspan moment: M_udl = w * L^2 / 8
    let m_udl: f64 = w_udl_lane1 * span * span / 8.0;

    // Total LM1 Lane 1 moment
    let m_lm1: f64 = m_ts + m_udl;

    // Verify tandem moment
    let m_ts_expected: f64 = 300.0 * 10.0 - 300.0 * 0.6; // = 2820 kN-m
    assert!(
        (m_ts - m_ts_expected).abs() < 0.01,
        "LM1 tandem moment: got {:.2}, expected {:.2}", m_ts, m_ts_expected
    );

    // Verify UDL moment
    let m_udl_expected: f64 = 27.0 * 400.0 / 8.0; // = 1350 kN-m
    assert!(
        (m_udl - m_udl_expected).abs() < 0.01,
        "LM1 UDL moment: got {:.2}, expected {:.2}", m_udl, m_udl_expected
    );

    // Total should be TS + UDL
    assert!(
        (m_lm1 - (m_ts_expected + m_udl_expected)).abs() < 0.01,
        "LM1 total moment: got {:.2}, expected {:.2}", m_lm1, m_ts_expected + m_udl_expected
    );

    // Lane 2 values for comparison
    let q_tandem_lane2: f64 = 200.0; // kN per axle
    let q_udl_lane2: f64 = 2.5; // kN/m^2
    let w_udl_lane2: f64 = q_udl_lane2 * lane_width;

    let m_ts_lane2: f64 = q_tandem_lane2 * (span / 2.0) - q_tandem_lane2 * (axle_spacing / 2.0);
    let m_udl_lane2: f64 = w_udl_lane2 * span * span / 8.0;
    let m_lm1_lane2: f64 = m_ts_lane2 + m_udl_lane2;

    // Lane 1 should produce larger effects than Lane 2
    assert!(
        m_lm1 > m_lm1_lane2,
        "Lane 1 ({:.1}) should exceed Lane 2 ({:.1})", m_lm1, m_lm1_lane2
    );
}

// ================================================================
// 3. Fatigue Truck Model (AASHTO LRFD §3.6.1.4)
// ================================================================
//
// The AASHTO fatigue truck is a single HL-93 design truck with a
// fixed rear axle spacing of 9.0 m (30 ft), and NO lane load.
// The dynamic load allowance for fatigue is 15% (vs. 33% for strength).
//
// Axle weights: 35 kN front, 145 kN middle, 145 kN rear
// Spacings: 4.3 m (front-middle), 9.0 m (middle-rear)
// Total wheelbase: 13.3 m
//
// The fatigue load is a fraction of the full HL-93:
// p_fatigue = 0.75 * (truck effect) per AASHTO LRFD §3.6.1.4.1

#[test]
fn validation_fatigue_truck_model() {
    // Fatigue truck axles
    let p_front: f64 = 35.0; // kN
    let p_middle: f64 = 145.0;
    let p_rear: f64 = 145.0;
    let s1: f64 = 4.3; // front to middle spacing (m)
    let s2: f64 = 9.0; // middle to rear spacing, FIXED for fatigue

    // Total wheelbase for fatigue truck
    let wheelbase: f64 = s1 + s2;
    assert!(
        (wheelbase - 13.3).abs() < 1e-10,
        "Fatigue truck wheelbase should be 13.3 m, got {:.1} m", wheelbase
    );

    // Fatigue load factor
    let fatigue_factor: f64 = 0.75;

    // Dynamic load allowance for fatigue
    let im_fatigue: f64 = 0.15; // 15%

    // Dynamic load allowance for strength limit state
    let im_strength: f64 = 0.33; // 33%

    // Verify fatigue IM is less than strength IM
    assert!(
        im_fatigue < im_strength,
        "Fatigue IM ({:.2}) should be less than strength IM ({:.2})",
        im_fatigue, im_strength
    );

    // For a 25 m span, compute the maximum midspan moment from fatigue truck.
    // Position for maximum moment at midspan:
    // Place middle axle near midspan. Let middle axle be at x=12.5m.
    // Front at 8.2m, rear at 21.5m (from left support).
    let span: f64 = 25.0;
    let _x_middle: f64 = span / 2.0;
    let x_front: f64 = span / 2.0 - s1;
    let x_rear: f64 = span / 2.0 + s2;

    let r_a: f64 = (p_front * (span - x_front)
        + p_middle * (span - span / 2.0)
        + p_rear * (span - x_rear)) / span;
    let m_mid_truck: f64 = r_a * (span / 2.0) - p_front * s1;

    // Apply fatigue factor
    let m_fatigue_raw: f64 = fatigue_factor * m_mid_truck;

    // Apply dynamic load allowance
    let m_fatigue: f64 = m_fatigue_raw * (1.0 + im_fatigue);

    // Verify the fatigue moment is positive and reasonable
    assert!(
        m_fatigue > 0.0,
        "Fatigue midspan moment should be positive, got {:.2}", m_fatigue
    );

    // Compare with strength truck (same position, with 33% IM, no 0.75 factor)
    let m_strength: f64 = m_mid_truck * (1.0 + im_strength);

    // Fatigue moment should be significantly less than strength moment
    let ratio: f64 = m_fatigue / m_strength;
    assert!(
        ratio < 1.0,
        "Fatigue moment ({:.1}) should be less than strength moment ({:.1})",
        m_fatigue, m_strength
    );

    // Ratio should be approximately 0.75 * 1.15 / 1.33 = 0.648
    let expected_ratio: f64 = fatigue_factor * (1.0 + im_fatigue) / (1.0 + im_strength);
    assert!(
        (ratio - expected_ratio).abs() < 0.001,
        "Fatigue/strength ratio: got {:.4}, expected {:.4}", ratio, expected_ratio
    );
}

// ================================================================
// 4. Multi-Lane Reduction Factors (AASHTO LRFD Table 3.6.1.1.2-1)
// ================================================================
//
// When multiple lanes are loaded simultaneously, AASHTO applies a
// multiple presence factor (m):
//   1 loaded lane:  m = 1.20  (accounts for single lane having higher load)
//   2 loaded lanes: m = 1.00
//   3 loaded lanes: m = 0.85
//   4+ loaded lanes: m = 0.65
//
// The total live load effect = m * (sum of individual lane effects)
//
// For a bridge with N lanes, the design checks the envelope of all
// possible lane combinations with their respective m factors.

#[test]
fn validation_multi_lane_reduction_factors() {
    // AASHTO LRFD Table 3.6.1.1.2-1
    let m_1lane: f64 = 1.20;
    let m_2lane: f64 = 1.00;
    let m_3lane: f64 = 0.85;
    let m_4lane: f64 = 0.65;

    // Verify factor decreases with more lanes
    assert!(m_1lane > m_2lane, "m(1) > m(2)");
    assert!(m_2lane > m_3lane, "m(2) > m(3)");
    assert!(m_3lane > m_4lane, "m(3) > m(4)");

    // Example: 4-lane bridge, each lane produces 1000 kN-m at midspan.
    let m_per_lane: f64 = 1000.0; // kN-m per lane

    // Total effect for each number of loaded lanes
    let total_1: f64 = m_1lane * 1.0 * m_per_lane;
    let total_2: f64 = m_2lane * 2.0 * m_per_lane;
    let total_3: f64 = m_3lane * 3.0 * m_per_lane;
    let total_4: f64 = m_4lane * 4.0 * m_per_lane;

    // Verify computed totals
    assert!(
        (total_1 - 1200.0).abs() < 1e-10,
        "1-lane total: got {:.1}, expected 1200.0", total_1
    );
    assert!(
        (total_2 - 2000.0).abs() < 1e-10,
        "2-lane total: got {:.1}, expected 2000.0", total_2
    );
    assert!(
        (total_3 - 2550.0).abs() < 1e-10,
        "3-lane total: got {:.1}, expected 2550.0", total_3
    );
    assert!(
        (total_4 - 2600.0).abs() < 1e-10,
        "4-lane total: got {:.1}, expected 2600.0", total_4
    );

    // The governing case is the one that produces the maximum total effect.
    // Here 4 lanes (2600) governs over 3 lanes (2550).
    let governing: f64 = total_1.max(total_2).max(total_3).max(total_4);
    assert!(
        (governing - total_4).abs() < 1e-10,
        "4-lane case ({:.1}) should govern for equal lane effects", governing
    );

    // For an asymmetric case where outer lanes have lower effect:
    // Lane effects: [1200, 1000, 800, 600] kN-m
    let effects: [f64; 4] = [1200.0, 1000.0, 800.0, 600.0];
    let combo_1: f64 = m_1lane * effects[0];
    let combo_2: f64 = m_2lane * (effects[0] + effects[1]);
    let combo_3: f64 = m_3lane * (effects[0] + effects[1] + effects[2]);
    let combo_4: f64 = m_4lane * (effects[0] + effects[1] + effects[2] + effects[3]);

    // Verify: 3-lane case gives 0.85 * 3000 = 2550 kN-m
    assert!(
        (combo_3 - 2550.0).abs() < 1e-10,
        "3-lane asymmetric combo: got {:.1}, expected 2550.0", combo_3
    );

    let governing_asym: f64 = combo_1.max(combo_2).max(combo_3).max(combo_4);
    assert!(
        governing_asym > 0.0,
        "Governing asymmetric combo should be positive: {:.1}", governing_asym
    );

    // The 3-lane (2550) should govern over 4-lane (0.65*3600=2340)
    assert!(
        combo_3 > combo_4,
        "3-lane ({:.1}) should govern over 4-lane ({:.1}) with diminishing effects",
        combo_3, combo_4
    );
}

// ================================================================
// 5. Dynamic Load Allowance / Impact Factor (AASHTO LRFD §3.6.2)
// ================================================================
//
// The dynamic load allowance (IM) accounts for the increase in live
// load effects due to vehicle dynamics (road roughness, suspension).
//
// AASHTO LRFD §3.6.2.1:
//   - Deck joints:     IM = 75% (0.75)
//   - All other (strength): IM = 33% (0.33)
//   - Fatigue/fracture:     IM = 15% (0.15)
//
// The factored live load = LL * (1 + IM/100)
//
// EN 1991-2 uses a different approach: dynamic amplification is already
// included in the LM1 characteristic values (alpha factors account for
// dynamic effects).
//
// BS 5400 uses: impact factor = 1 + K where K depends on span.

#[test]
fn validation_dynamic_load_allowance_impact_factor() {
    // AASHTO LRFD IM values
    let im_deck_joints: f64 = 0.75;
    let im_strength: f64 = 0.33;
    let im_fatigue: f64 = 0.15;

    // Static live load effect
    let ll_static: f64 = 1000.0; // kN-m (example)

    // Factored live load effects
    let ll_deck: f64 = ll_static * (1.0 + im_deck_joints);
    let ll_str: f64 = ll_static * (1.0 + im_strength);
    let ll_fat: f64 = ll_static * (1.0 + im_fatigue);

    // Verify amplified values
    assert!(
        (ll_deck - 1750.0).abs() < 1e-10,
        "Deck joint amplified LL: got {:.1}, expected 1750.0", ll_deck
    );
    assert!(
        (ll_str - 1330.0).abs() < 1e-10,
        "Strength amplified LL: got {:.1}, expected 1330.0", ll_str
    );
    assert!(
        (ll_fat - 1150.0).abs() < 1e-10,
        "Fatigue amplified LL: got {:.1}, expected 1150.0", ll_fat
    );

    // Ordering: deck > strength > fatigue
    assert!(ll_deck > ll_str, "Deck joints > strength");
    assert!(ll_str > ll_fat, "Strength > fatigue");

    // BS 5400 approximate impact factor formula (simplified):
    // K = 0.25 for span < 3.8m, else K = 0.25 * (3.8/L)^0.5
    // For L = 15m: K = 0.25 * (3.8/15)^0.5 = 0.25 * 0.503 = 0.126
    let span_bs: f64 = 15.0;
    let k_bs: f64 = 0.25 * (3.8_f64 / span_bs).sqrt();
    let ll_bs: f64 = ll_static * (1.0 + k_bs);

    assert!(
        k_bs > 0.0 && k_bs < 0.25,
        "BS 5400 K for L=15m should be between 0 and 0.25, got {:.4}", k_bs
    );
    assert!(
        ll_bs > ll_static,
        "BS 5400 amplified load ({:.1}) should exceed static ({:.1})", ll_bs, ll_static
    );

    // Austroads dynamic load allowance: alpha = 0.4 for span <= 5m,
    // linearly decreasing to 0.1 at span = 50m.
    // alpha(L) = 0.4 - 0.3 * (L - 5) / 45 for 5 < L < 50
    let span_aus: f64 = 20.0;
    let alpha_aus: f64 = 0.4 - 0.3 * (span_aus - 5.0) / 45.0;
    let ll_aus: f64 = ll_static * (1.0 + alpha_aus);

    assert!(
        alpha_aus > 0.1 && alpha_aus < 0.4,
        "Austroads alpha for L=20m should be 0.1-0.4, got {:.4}", alpha_aus
    );
    assert!(
        ll_aus > ll_static && ll_aus < ll_deck,
        "Austroads amplified load ({:.1}) should be between static and deck joint ({:.1})",
        ll_aus, ll_deck
    );
}

// ================================================================
// 6. Permit / Overweight Vehicle Analysis
// ================================================================
//
// Permit vehicles are heavier than standard design trucks. AASHTO
// defines permit loads that can be evaluated against bridge capacity.
//
// A typical permit vehicle might be a multi-axle configuration:
//   Axle group: 5 axles at 1.5 m spacing, 100 kN each = 500 kN total
//
// The permit load is compared against the bridge rating factor:
//   RF = (C - gamma_DC * DC - gamma_DW * DW) / (gamma_LL * LL * (1+IM))
//
// where C = capacity, DC = dead load effect, DW = wearing surface,
// gamma = load factors, LL = permit live load effect.

#[test]
fn validation_permit_overweight_vehicle() {
    // Permit vehicle: 5 axles at 100 kN each, 1.5 m spacing
    let n_axles: usize = 5;
    let p_axle: f64 = 100.0; // kN per axle
    let axle_spacing: f64 = 1.5; // m
    let total_weight: f64 = n_axles as f64 * p_axle;
    let total_wheelbase: f64 = (n_axles - 1) as f64 * axle_spacing;

    assert!(
        (total_weight - 500.0).abs() < 1e-10,
        "Permit vehicle total weight: got {:.1}, expected 500.0 kN", total_weight
    );
    assert!(
        (total_wheelbase - 6.0).abs() < 1e-10,
        "Permit vehicle wheelbase: got {:.1}, expected 6.0 m", total_wheelbase
    );

    // Maximum midspan moment for permit vehicle on SS beam (span = 20m)
    // Position vehicle for max moment: resultant at midspan.
    // Resultant is at center of axle group = 3.0 m from first axle.
    // Place resultant at midspan: first axle at x = 10.0 - 3.0 = 7.0 m
    let span: f64 = 20.0;
    let x_first: f64 = span / 2.0 - total_wheelbase / 2.0; // 7.0 m

    // R_A by taking moments about B
    let mut r_a: f64 = 0.0;
    for i in 0..n_axles {
        let x_i: f64 = x_first + i as f64 * axle_spacing;
        r_a += p_axle * (span - x_i) / span;
    }

    // Midspan moment: M = R_A * L/2 - sum of moments of axles left of midspan
    let mut m_mid: f64 = r_a * (span / 2.0);
    for i in 0..n_axles {
        let x_i: f64 = x_first + i as f64 * axle_spacing;
        if x_i < span / 2.0 {
            m_mid -= p_axle * (span / 2.0 - x_i);
        }
    }

    // Verify moment is positive and reasonable
    assert!(
        m_mid > 0.0,
        "Permit vehicle midspan moment should be positive: {:.2}", m_mid
    );

    // Rating factor calculation
    let capacity: f64 = 5000.0; // kN-m (bridge capacity)
    let m_dc: f64 = 1500.0; // dead load moment
    let m_dw: f64 = 200.0; // wearing surface moment
    let gamma_dc: f64 = 1.25;
    let gamma_dw: f64 = 1.50;
    let gamma_ll: f64 = 1.35; // permit load factor (lower than inventory 1.75)
    let im_permit: f64 = 0.33;

    let rf: f64 = (capacity - gamma_dc * m_dc - gamma_dw * m_dw)
        / (gamma_ll * m_mid * (1.0 + im_permit));

    // Rating factor > 1.0 means the bridge can carry the permit load
    assert!(
        rf > 0.0,
        "Rating factor should be positive: {:.4}", rf
    );

    // Compare with HL-93 standard truck (325 kN total)
    // Permit vehicle (500 kN) is heavier, so it should produce larger effects
    // when concentrated in similar wheelbase
    assert!(
        total_weight > 325.0,
        "Permit vehicle ({:.0} kN) should be heavier than HL-93 ({:.0} kN)",
        total_weight, 325.0
    );
}

// ================================================================
// 7. Pedestrian Loading on Bridge (AASHTO LRFD §3.6.1.6)
// ================================================================
//
// AASHTO LRFD §3.6.1.6: Pedestrian live load = 3.6 kN/m^2 (75 psf)
// applied to sidewalks wider than 0.6 m (2 ft).
//
// EN 1991-2 §5.3.2.1: Pedestrian load = 5.0 kN/m^2 (characteristic)
// with a recommended minimum of 2.5 kN/m^2 for remaining area.
//
// For a footbridge, the distributed load per unit length:
//   w = q * width
//
// Midspan moment for SS beam: M = w * L^2 / 8

#[test]
fn validation_pedestrian_loading_on_bridge() {
    // AASHTO pedestrian load
    let q_ped_aashto: f64 = 3.6; // kN/m^2

    // EN 1991-2 pedestrian load
    let q_ped_ec: f64 = 5.0; // kN/m^2

    // Sidewalk dimensions
    let sidewalk_width: f64 = 2.0; // m
    let span: f64 = 15.0; // m

    // Distributed load per unit length
    let w_aashto: f64 = q_ped_aashto * sidewalk_width;
    let w_ec: f64 = q_ped_ec * sidewalk_width;

    // Verify distributed loads
    assert!(
        (w_aashto - 7.2).abs() < 1e-10,
        "AASHTO pedestrian line load: got {:.1}, expected 7.2 kN/m", w_aashto
    );
    assert!(
        (w_ec - 10.0).abs() < 1e-10,
        "EC pedestrian line load: got {:.1}, expected 10.0 kN/m", w_ec
    );

    // Midspan moments for SS beam
    let m_aashto: f64 = w_aashto * span * span / 8.0;
    let m_ec: f64 = w_ec * span * span / 8.0;

    // Verify moments
    let m_aashto_expected: f64 = 7.2 * 225.0 / 8.0; // = 202.5 kN-m
    let m_ec_expected: f64 = 10.0 * 225.0 / 8.0; // = 281.25 kN-m

    assert!(
        (m_aashto - m_aashto_expected).abs() < 0.01,
        "AASHTO pedestrian moment: got {:.2}, expected {:.2}", m_aashto, m_aashto_expected
    );
    assert!(
        (m_ec - m_ec_expected).abs() < 0.01,
        "EC pedestrian moment: got {:.2}, expected {:.2}", m_ec, m_ec_expected
    );

    // EC load is higher than AASHTO
    assert!(
        m_ec > m_aashto,
        "EC pedestrian moment ({:.1}) should exceed AASHTO ({:.1})",
        m_ec, m_aashto
    );

    // Total reaction for SS beam: R = w * L / 2
    let r_aashto: f64 = w_aashto * span / 2.0;
    let r_ec: f64 = w_ec * span / 2.0;

    assert!(
        (r_aashto - 54.0).abs() < 1e-10,
        "AASHTO pedestrian reaction: got {:.1}, expected 54.0 kN", r_aashto
    );
    assert!(
        (r_ec - 75.0).abs() < 1e-10,
        "EC pedestrian reaction: got {:.1}, expected 75.0 kN", r_ec
    );

    // Combined vehicular + pedestrian (AASHTO §3.6.1.6):
    // When vehicular and pedestrian loads act simultaneously,
    // both are applied with full intensity on bridges with sidewalks.
    let m_vehicular: f64 = 500.0; // example vehicular moment
    let m_combined: f64 = m_vehicular + m_aashto;
    assert!(
        m_combined > m_vehicular,
        "Combined moment ({:.1}) should exceed vehicular alone ({:.1})",
        m_combined, m_vehicular
    );
}

// ================================================================
// 8. Centrifugal Force on Curved Bridge (AASHTO LRFD §3.6.3)
// ================================================================
//
// Vehicles on curved bridges generate centrifugal forces:
//   CE = (4/3) * v^2 / (g * R) * W
//
// where:
//   v = design speed (m/s)
//   g = gravitational acceleration = 9.81 m/s^2
//   R = radius of curvature (m)
//   W = axle weight (kN)
//   4/3 accounts for the ratio of truck weight to truck floor load
//
// The centrifugal force acts horizontally at 1.8 m (6 ft) above
// the roadway surface.
//
// This generates an overturning moment about the bridge deck.

#[test]
fn validation_centrifugal_force_curved_bridge() {
    let g: f64 = 9.81; // m/s^2

    // Design speed: 80 km/h = 22.22 m/s
    let v_kmh: f64 = 80.0;
    let v: f64 = v_kmh / 3.6; // convert to m/s

    // Verify speed conversion
    assert!(
        (v - 22.222).abs() < 0.01,
        "Speed conversion: got {:.3} m/s, expected ~22.222 m/s", v
    );

    // Radius of curvature
    let radius: f64 = 200.0; // m

    // AASHTO centrifugal force coefficient: C = (4/3) * v^2 / (g * R)
    let c_factor: f64 = (4.0 / 3.0) * v * v / (g * radius);

    // Verify coefficient
    let c_expected: f64 = (4.0 / 3.0) * (v_kmh / 3.6).powi(2) / (9.81 * 200.0);
    assert!(
        (c_factor - c_expected).abs() < 1e-10,
        "Centrifugal coefficient: got {:.6}, expected {:.6}", c_factor, c_expected
    );

    // Centrifugal force should be a fraction of vehicle weight
    assert!(
        c_factor > 0.0 && c_factor < 1.0,
        "Centrifugal coefficient should be 0 < C < 1, got {:.4}", c_factor
    );

    // HL-93 truck weight
    let w_truck: f64 = 325.0; // kN total

    // Total centrifugal force from truck
    let ce_truck: f64 = c_factor * w_truck;

    // Centrifugal force acts at height h = 1.8 m above deck
    let h_ce: f64 = 1.8; // m

    // Overturning moment about deck level from centrifugal force
    let m_overturn: f64 = ce_truck * h_ce;

    assert!(
        ce_truck > 0.0,
        "Centrifugal force should be positive: {:.2} kN", ce_truck
    );
    assert!(
        m_overturn > 0.0,
        "Overturning moment should be positive: {:.2} kN-m", m_overturn
    );

    // Test with different speeds: centrifugal force scales with v^2
    let v2: f64 = v * 2.0; // double the speed
    let c_factor_2: f64 = (4.0 / 3.0) * v2 * v2 / (g * radius);
    let ratio_c: f64 = c_factor_2 / c_factor;

    assert!(
        (ratio_c - 4.0).abs() < 1e-10,
        "Doubling speed should quadruple C: ratio = {:.4}, expected 4.0", ratio_c
    );

    // Test with different radii: C inversely proportional to R
    let radius_half: f64 = radius / 2.0;
    let c_factor_half_r: f64 = (4.0 / 3.0) * v * v / (g * radius_half);
    let ratio_r: f64 = c_factor_half_r / c_factor;

    assert!(
        (ratio_r - 2.0).abs() < 1e-10,
        "Halving radius should double C: ratio = {:.4}, expected 2.0", ratio_r
    );

    // For a bridge with deck width W_deck, the eccentricity of the
    // centrifugal reaction on bearings:
    let w_deck: f64 = 10.0; // m
    let bearing_spacing: f64 = 8.0; // m (between bearing lines)

    // Additional vertical reaction at outer bearing from overturning:
    // delta_R = CE * h_ce / bearing_spacing
    let delta_r: f64 = ce_truck * h_ce / bearing_spacing;

    assert!(
        delta_r > 0.0,
        "Additional vertical reaction at outer bearing: {:.2} kN", delta_r
    );

    // The additional reaction should be a fraction of the truck weight
    let _fraction: f64 = delta_r / w_truck;
    assert!(
        delta_r < w_truck,
        "Additional bearing reaction ({:.1} kN) should be less than truck weight ({:.1} kN)",
        delta_r, w_truck
    );

    // Suppress unused variable warning for deck width
    let _ = w_deck;
}
