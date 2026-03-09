/// Validation: AASHTO Bridge Load Formulas
///
/// References:
///   - AASHTO LRFD Bridge Design Specifications, 9th Edition (2020)
///   - AASHTO 3.6.1.2: Design Vehicular Live Load (HL-93)
///   - AASHTO 3.6.1.3: Application of Design Vehicular Live Loads
///   - AASHTO 3.6.2: Dynamic Load Allowance (Impact)
///   - AASHTO Table 4.6.2.2.2b-1: Distribution Factors for Moment
///   - Barker & Puckett: "Design of Highway Bridges" 3rd ed.
///
/// Tests verify AASHTO load formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

#[allow(unused_imports)]
use std::f64::consts::PI;

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6}, expected {:.6}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. AASHTO HL-93 Design Truck (AASHTO 3.6.1.2.2)
// ================================================================
//
// HL-93 truck: 3 axles:
//   Front: 8 kip (fixed)
//   Middle: 32 kip at 14 ft from front
//   Rear: 32 kip at 14-30 ft from middle (use 14 ft for max effects)
//
// Simple span L = 60 ft:
//   Position truck for max moment at midspan.
//   Resultant R = 8+32+32 = 72 kip, located at:
//     x_R = (8*0 + 32*14 + 32*28)/72 = (0+448+896)/72 = 18.667 ft from front
//
//   For max moment, place the closest heavy axle at midspan:
//   Place middle axle (32k) at x = 30 ft:
//     Front axle at 16 ft, rear at 44 ft
//     R_A = (8*(60-16) + 32*(60-30) + 32*(60-44))/60
//         = (352 + 960 + 512)/60 = 1824/60 = 30.4 kip
//     M_mid = R_A * 30 - 8*(30-16) = 912.0 - 112.0 = 800.0 kip-ft

#[test]
fn validation_aashto_hl93_truck() {
    let p1: f64 = 8.0;    // kip, front axle
    let p2: f64 = 32.0;   // kip, middle axle
    let p3: f64 = 32.0;   // kip, rear axle
    let s12: f64 = 14.0;  // ft, spacing front-to-middle
    let s23: f64 = 14.0;  // ft, spacing middle-to-rear (minimum)
    let l: f64 = 60.0;    // ft, span length

    // Total truck weight
    let w_total: f64 = p1 + p2 + p3;
    assert_close(w_total, 72.0, 0.001, "Total truck weight");

    // Resultant location from front axle
    let x_r: f64 = (p1 * 0.0 + p2 * s12 + p3 * (s12 + s23)) / w_total;
    assert_close(x_r, 18.667, 0.01, "Resultant location");

    // Position for max midspan moment: middle axle at L/2 = 30'
    // Front axle at 30 - 14 = 16', Rear at 30 + 14 = 44'
    let x_front: f64 = 30.0 - s12;    // 16.0
    let x_mid: f64 = 30.0;             // 30.0
    let x_rear: f64 = 30.0 + s23;      // 44.0

    // R_A by moments about B
    let ra: f64 = (p1 * (l - x_front) + p2 * (l - x_mid) + p3 * (l - x_rear)) / l;
    assert_close(ra, 30.4, 0.01, "R_A for midspan moment");

    // Midspan moment (cut at x=30')
    let m_mid: f64 = ra * 30.0 - p1 * (30.0 - x_front);
    assert_close(m_mid, 800.0, 0.01, "Midspan moment");

    // Max shear at support A: truck with rear axle at support
    // Front at 0', middle at 14', rear at 28'
    // R_A = 8 + 32*(60-14)/60 + 32*(60-28)/60
    //     = 8 + 32*46/60 + 32*32/60 = 8 + 24.533 + 17.067 = 49.6
    let ra_shear: f64 = p1 + p2 * (l - s12) / l + p3 * (l - s12 - s23) / l;
    assert_close(ra_shear, 49.6, 0.01, "Max shear at A");
}

// ================================================================
// 2. AASHTO Lane Load (AASHTO 3.6.1.2.4)
// ================================================================
//
// Design lane load: w = 0.64 kip/ft, uniformly distributed
// Simple span L = 60 ft:
//   Max moment at midspan: M = wL²/8 = 0.64*3600/8 = 288.0 kip-ft
//   Max shear at support: V = wL/2 = 0.64*30 = 19.2 kip

#[test]
fn validation_aashto_lane_load() {
    let w: f64 = 0.64;    // kip/ft, lane load intensity
    let l: f64 = 60.0;    // ft, span length

    // Max midspan moment
    let m_max: f64 = w * l * l / 8.0;
    assert_close(m_max, 288.0, 0.001, "Lane load midspan moment");

    // Max shear at support
    let v_max: f64 = w * l / 2.0;
    assert_close(v_max, 19.2, 0.001, "Lane load max shear");

    // Total lane load on span
    let total_load: f64 = w * l;
    assert_close(total_load, 38.4, 0.001, "Total lane load");

    // Moment at quarter point (x = L/4):
    // M(x) = R*x - w*x²/2 = (wL/2)*x - w*x²/2
    let x_quarter: f64 = l / 4.0;
    let m_quarter: f64 = v_max * x_quarter - w * x_quarter * x_quarter / 2.0;
    let expected_quarter: f64 = w * l * l * 3.0 / 32.0;  // wL²*3/32
    assert_close(m_quarter, expected_quarter, 0.001, "Moment at L/4");
}

// ================================================================
// 3. AASHTO Design Tandem (AASHTO 3.6.1.2.3)
// ================================================================
//
// Design tandem: 2 × 25 kip axles spaced 4 ft apart
// Simple span L = 60 ft:
//   Max moment: place axles symmetrically about midspan
//     Axle 1 at 28 ft, Axle 2 at 32 ft
//     R_A = 25*(60-28)/60 + 25*(60-32)/60 = 25*32/60 + 25*28/60
//         = 800/60 + 700/60 = 25.0 kip
//     M_mid = R_A*30 - 25*(30-28) = 750 - 50 = 700 kip-ft
//
// Compare with truck: M_truck = 800 > M_tandem = 700
// Truck governs for this span length.

#[test]
fn validation_aashto_tandem() {
    let p: f64 = 25.0;     // kip per axle
    let s: f64 = 4.0;      // ft, axle spacing
    let l: f64 = 60.0;     // ft, span

    // Symmetric placement for max midspan moment
    let x1: f64 = l / 2.0 - s / 2.0;   // 28 ft
    let x2: f64 = l / 2.0 + s / 2.0;   // 32 ft

    // Reaction at A
    let ra: f64 = p * (l - x1) / l + p * (l - x2) / l;
    assert_close(ra, 25.0, 0.01, "Tandem R_A");

    // Midspan moment (cut at x = 30 ft, only left axle is to left of cut)
    let m_mid: f64 = ra * (l / 2.0) - p * (l / 2.0 - x1);
    assert_close(m_mid, 700.0, 0.01, "Tandem midspan moment");

    // Compare with truck moment from test 1
    let m_truck: f64 = 800.0;  // from previous calculation
    assert!(
        m_truck > m_mid,
        "Truck ({:.0}) governs over tandem ({:.0}) for L={:.0}ft",
        m_truck, m_mid, l
    );

    // Max shear: front axle at support
    // R_A = 25 + 25*(60-4)/60 = 25 + 23.333 = 48.333
    let v_tandem: f64 = p + p * (l - s) / l;
    assert_close(v_tandem, 48.333, 0.01, "Tandem max shear");
}

// ================================================================
// 4. Dynamic Load Allowance / Impact Factor (AASHTO 3.6.2)
// ================================================================
//
// AASHTO Table 3.6.2.1-1:
//   - Deck joints (all limit states): IM = 75%
//   - All other components:
//       Fatigue and fracture limit state: IM = 15%
//       All other limit states: IM = 33%
//   - Lane load: IM = 0% (no dynamic amplification)
//
// Applied as: (1 + IM/100) * truck/tandem effect
//
// Example: Truck moment = 800 kip-ft, Lane moment = 288 kip-ft
//   HL-93 = (1+0.33)*800 + 288 = 1064.0 + 288.0 = 1352.0 kip-ft

#[test]
fn validation_impact_factor() {
    let im_strength: f64 = 33.0;       // % for strength limit state
    let im_fatigue: f64 = 15.0;        // % for fatigue
    let im_deck_joint: f64 = 75.0;     // % for deck joints
    let im_lane: f64 = 0.0;            // % for lane load

    let m_truck: f64 = 800.0;          // kip-ft, truck moment
    let m_lane: f64 = 288.0;           // kip-ft, lane moment

    // Amplified truck moment (strength)
    let m_truck_amp: f64 = (1.0 + im_strength / 100.0) * m_truck;
    assert_close(m_truck_amp, 1.33 * 800.0, 0.001, "Amplified truck moment");
    assert_close(m_truck_amp, 1064.0, 0.001, "Truck + IM");

    // Lane load gets no impact
    let m_lane_amp: f64 = (1.0 + im_lane / 100.0) * m_lane;
    assert_close(m_lane_amp, 288.0, 0.001, "Lane load (no IM)");

    // HL-93 combined live load moment
    let m_hl93: f64 = m_truck_amp + m_lane_amp;
    assert_close(m_hl93, 1352.0, 0.001, "HL-93 combined moment");

    // Fatigue: lower impact factor
    let m_fatigue: f64 = (1.0 + im_fatigue / 100.0) * m_truck;
    assert_close(m_fatigue, 1.15 * 800.0, 0.001, "Fatigue truck moment");

    // Deck joint: higher impact factor
    let m_deck: f64 = (1.0 + im_deck_joint / 100.0) * m_truck;
    assert_close(m_deck, 1.75 * 800.0, 0.001, "Deck joint truck moment");
}

// ================================================================
// 5. Distribution Factor: S-over Method (AASHTO 4.6.2.2.2b)
// ================================================================
//
// Simplified distribution factor for moment in interior beams:
//   g = S/D where S = beam spacing, D depends on bridge type
//
// For concrete deck on steel beams (one design lane):
//   g_moment = 0.06 + (S/14)^0.4 * (S/L)^0.3 * (Kg/(12*L*ts³))^0.1
//
// Simplified S/D method (older AASHTO Standard):
//   For two or more lanes: g = S/5.5 (for concrete deck on steel)
//
// Example: S = 8.0 ft, L = 60 ft
//   g_simple = 8.0/5.5 = 1.4545 wheels = 0.7273 lanes
//
// Lever rule (one lane): tributary width / S
//   If truck wheel lines at 6 ft: effective width = 6/2 + overhang
//   For interior beam: g_lever = 6.0 / (2*S) = 6.0/16.0 = 0.375 (one wheel line)

#[test]
fn validation_distribution_factor() {
    let s: f64 = 8.0;      // ft, beam spacing
    let _l: f64 = 60.0;    // ft, span length (for reference)

    // S/D method (Standard Specification, simplified)
    // Two or more lanes loaded, concrete deck on steel beams: D = 5.5
    let d_factor: f64 = 5.5;
    let g_sd: f64 = s / d_factor;
    assert_close(g_sd, 1.4545, 0.01, "S/D factor (wheels)");

    // Convert from wheel lines to lanes (divide by 2)
    let g_sd_lanes: f64 = g_sd / 2.0;
    assert_close(g_sd_lanes, 0.7273, 0.01, "S/D factor (lanes)");

    // Lever rule for interior beam, one lane
    // Truck wheel spacing = 6 ft
    // For interior beam: one wheel at S/2 from each side
    let wheel_spacing: f64 = 6.0;  // ft
    let g_lever: f64 = wheel_spacing / (2.0 * s);
    assert_close(g_lever, 0.375, 0.001, "Lever rule one lane");

    // Multiple presence factor: m = 1.2 for one lane, 1.0 for two lanes
    let m_one: f64 = 1.2;
    let g_lever_adjusted: f64 = m_one * g_lever;
    assert_close(g_lever_adjusted, 0.45, 0.001, "Lever rule with m");

    // Distribution factor should be > 0 and typically < 2.0
    assert!(g_sd_lanes > 0.0 && g_sd_lanes < 2.0, "Reasonable g range");
}

// ================================================================
// 6. Fatigue Load (AASHTO 3.6.1.4, 6.6.1.2)
// ================================================================
//
// Fatigue load: single HL-93 truck (no lane load) at 75% of weight
//   P_front = 0.75 * 8 = 6 kip
//   P_mid = 0.75 * 32 = 24 kip
//   P_rear = 0.75 * 32 = 24 kip
//   Fixed spacing: 30 ft between rear and middle axle
//
// Number of stress cycles from ADTT:
//   ADTTSL = p * ADTT, where p = fraction of trucks in single lane
//   N = 365 * n_years * ADTTSL
//
// Example: ADTT = 2000, p = 0.85 (single lane), 75-year life
//   ADTTSL = 0.85 * 2000 = 1700 trucks/day
//   N = 365 * 75 * 1700 = 46,537,500 cycles

#[test]
fn validation_fatigue_load() {
    let factor: f64 = 0.75;    // fatigue truck is 75%
    let p1: f64 = 8.0;
    let p2: f64 = 32.0;
    let p3: f64 = 32.0;

    // Fatigue truck axle loads
    let p1_fat: f64 = factor * p1;
    let p2_fat: f64 = factor * p2;
    let p3_fat: f64 = factor * p3;
    assert_close(p1_fat, 6.0, 0.001, "Fatigue front axle");
    assert_close(p2_fat, 24.0, 0.001, "Fatigue middle axle");
    assert_close(p3_fat, 24.0, 0.001, "Fatigue rear axle");

    // Total fatigue truck weight
    let w_fat: f64 = p1_fat + p2_fat + p3_fat;
    assert_close(w_fat, 54.0, 0.001, "Total fatigue truck");

    // Number of cycles calculation
    let adtt: f64 = 2000.0;    // trucks/day
    let p_single: f64 = 0.85;  // single-lane fraction
    let n_years: f64 = 75.0;   // design life

    let adttsl: f64 = p_single * adtt;
    assert_close(adttsl, 1700.0, 0.001, "ADTTSL");

    let n_cycles: f64 = 365.0 * n_years * adttsl;
    assert_close(n_cycles, 46_537_500.0, 0.001, "Total cycles");

    // Impact for fatigue: IM = 15%
    let im_fatigue: f64 = 15.0;
    let amplification: f64 = 1.0 + im_fatigue / 100.0;
    assert_close(amplification, 1.15, 0.001, "Fatigue IM");
}

// ================================================================
// 7. Pedestrian Load (AASHTO 3.6.1.6)
// ================================================================
//
// Pedestrian live load:
//   - Sidewalk on vehicular bridge: 75 psf (0.075 ksf)
//   - Exclusively pedestrian bridge: 90 psf (0.090 ksf)
//
// For a 6 ft wide sidewalk on a 60 ft span:
//   w = 0.075 * 6 = 0.45 kip/ft
//   M_max = w*L²/8 = 0.45*3600/8 = 202.5 kip-ft
//   V_max = w*L/2 = 0.45*30 = 13.5 kip
//
// Pedestrian bridge (10 ft wide):
//   w_ped = 0.090 * 10 = 0.90 kip/ft
//   M_max = 0.90*3600/8 = 405.0 kip-ft

#[test]
fn validation_pedestrian_load() {
    let l: f64 = 60.0;     // ft, span length

    // Sidewalk on vehicular bridge
    let q_sidewalk: f64 = 0.075;    // ksf (75 psf)
    let w_sidewalk: f64 = 6.0;      // ft, sidewalk width
    let w_line_sw: f64 = q_sidewalk * w_sidewalk;
    assert_close(w_line_sw, 0.45, 0.001, "Sidewalk line load");

    let m_sw: f64 = w_line_sw * l * l / 8.0;
    assert_close(m_sw, 202.5, 0.01, "Sidewalk midspan moment");

    let v_sw: f64 = w_line_sw * l / 2.0;
    assert_close(v_sw, 13.5, 0.001, "Sidewalk max shear");

    // Exclusively pedestrian bridge
    let q_ped: f64 = 0.090;         // ksf (90 psf)
    let w_ped_bridge: f64 = 10.0;   // ft, bridge width
    let w_line_ped: f64 = q_ped * w_ped_bridge;
    assert_close(w_line_ped, 0.90, 0.001, "Ped bridge line load");

    let m_ped: f64 = w_line_ped * l * l / 8.0;
    assert_close(m_ped, 405.0, 0.01, "Ped bridge midspan moment");

    // Ped bridge has higher moment than sidewalk
    assert!(m_ped > m_sw, "Ped bridge moment > sidewalk moment");

    // Pedestrian load does not get dynamic load allowance
    let im_ped: f64 = 0.0;
    let m_ped_amp: f64 = (1.0 + im_ped / 100.0) * m_ped;
    assert_close(m_ped_amp, m_ped, 0.001, "No IM for pedestrian");
}

// ================================================================
// 8. Permit Vehicle Envelope (AASHTO 4.6.2.2.5)
// ================================================================
//
// Single-unit overweight truck (permit vehicle):
//   Axle configuration: front 12k, middle 24k, rear 24k
//   Spacings: 15 ft and 4 ft (short tandem rear)
//   Total weight: 60 kip
//
// Simple span L = 40 ft:
//   Position for max moment:
//   Place middle axle near midspan (x=20 ft)
//     Front at 5 ft, rear at 24 ft
//     R_A = (12*(40-5) + 24*(40-20) + 24*(40-24))/40
//         = (420 + 480 + 384)/40 = 1284/40 = 32.1 kip
//     M_mid = R_A*20 - 12*(20-5) = 642.0 - 180.0 = 462.0 kip-ft
//
// Compare to HL-93 truck on same span to determine if permit governs.

#[test]
fn validation_permit_vehicle() {
    let p1: f64 = 12.0;    // kip, front axle
    let p2: f64 = 24.0;    // kip, middle axle
    let p3: f64 = 24.0;    // kip, rear axle
    let s12: f64 = 15.0;   // ft, front-to-middle spacing
    let s23: f64 = 4.0;    // ft, middle-to-rear spacing
    let l: f64 = 40.0;     // ft, span

    // Total weight
    let w_total: f64 = p1 + p2 + p3;
    assert_close(w_total, 60.0, 0.001, "Permit vehicle weight");

    // Position middle axle at midspan (x = 20 ft)
    let x_front: f64 = 20.0 - s12;    // 5.0 ft
    let x_mid: f64 = 20.0;             // 20.0 ft
    let x_rear: f64 = 20.0 + s23;      // 24.0 ft

    // Reaction at A
    let ra: f64 = (p1 * (l - x_front) + p2 * (l - x_mid) + p3 * (l - x_rear)) / l;
    let expected_ra: f64 = (12.0 * 35.0 + 24.0 * 20.0 + 24.0 * 16.0) / 40.0;
    assert_close(ra, expected_ra, 0.001, "Permit R_A");
    assert_close(ra, 32.1, 0.01, "Permit R_A numerical");

    // Midspan moment
    let m_mid: f64 = ra * 20.0 - p1 * (20.0 - x_front);
    let expected_m: f64 = 32.1 * 20.0 - 12.0 * 15.0;
    assert_close(m_mid, expected_m, 0.01, "Permit midspan moment");

    // Check reaction at B for equilibrium
    let rb: f64 = w_total - ra;
    assert_close(ra + rb, w_total, 0.001, "Equilibrium check");

    // Verify the moment is positive (sagging)
    assert!(m_mid > 0.0, "Midspan moment should be positive (sagging)");
}
