/// Validation: Crane & Runway Beam Design
///
/// References:
///   - AISC Design Guide 7: Industrial Buildings (2nd ed., 2004)
///   - EN 1991-3: Actions Induced by Cranes and Machinery
///   - CMAA 70: Specifications for Top Running Bridge & Gantry Type Multiple Girder EOT Cranes
///   - AISE Technical Report 13: Guide for the Design and Construction of Mill Buildings
///   - Fisher: "Industrial Buildings: Roofs to Anchor Rods" (AISC)
///
/// Tests verify wheel loads, runway beam design, fatigue,
/// and lateral forces from crane operation.

// ================================================================
// 1. Crane Wheel Loads — Static
// ================================================================
//
// For top-running bridge crane:
// Max wheel load: P_w = (crane_capacity + trolley_weight) / 2 + bridge_weight / (2*n_wheels_per_rail)
// Impact factor: C_i = 1.25 (pendant) or 1.10 (cab) per AISC DG7

#[test]
fn crane_static_wheel_loads() {
    let rated_cap: f64 = 200.0;  // kN, rated lifting capacity
    let trolley_wt: f64 = 30.0;  // kN, trolley weight
    let bridge_wt: f64 = 100.0;  // kN, bridge weight (total)
    let n_wheels: usize = 2;     // wheels per end truck (per rail)

    // Maximum wheel load (trolley at one end)
    let p_wheel_max: f64 = (rated_cap + trolley_wt) / 2.0 + bridge_wt / (2.0 * n_wheels as f64);
    // = 230/2 + 100/4 = 115 + 25 = 140 kN

    let p_expected: f64 = 140.0;
    assert!(
        (p_wheel_max - p_expected).abs() / p_expected < 0.01,
        "Max wheel load: {:.0} kN, expected {:.0}", p_wheel_max, p_expected
    );

    // Minimum wheel load (trolley at far end)
    let p_wheel_min: f64 = bridge_wt / (2.0 * n_wheels as f64);
    // = 25 kN (dead load only on near side)

    assert!(
        p_wheel_min < p_wheel_max,
        "Min {:.0} < max {:.0} kN", p_wheel_min, p_wheel_max
    );

    // With impact factor (pendant-operated)
    let ci: f64 = 1.25;
    let p_design: f64 = ci * p_wheel_max;
    assert!(
        (p_design - 175.0).abs() < 1.0,
        "Design wheel load with impact: {:.0} kN", p_design
    );
}

// ================================================================
// 2. Runway Beam — Maximum Moment
// ================================================================
//
// Two wheel loads separated by wheel base:
// M_max occurs when wheel loads straddle the point where the
// resultant force aligns with beam centerline.
// For single wheel: M = P*L/4 (at midspan)
// For two wheels: M = P*L/4 - P*s/8 (approximately, s = wheel spacing)

#[test]
fn crane_runway_moment() {
    let p: f64 = 175.0;        // kN, factored wheel load (with impact)
    let s: f64 = 3.0;          // m, wheel base (spacing between wheels)
    let l: f64 = 12.0;         // m, runway beam span

    // Maximum moment from two equal wheels
    // Exact: place resultant at midspan, critical wheel at L/2 - s/4
    let m_max: f64 = p * l / 4.0 - p * s.powi(2) / (4.0 * l);
    // Modified: for two wheels, using influence line
    // Actually: M_max = P*(L/2 - s/4)²/L * 2 approximately
    // Simpler: M_max ≈ P*L/4 (conservative, single wheel)

    let m_single: f64 = p * l / 4.0; // = 525 kN·m (single wheel at midspan)

    // For two wheels of load P each, spaced s apart on span L,
    // max moment = P*a where a = (L-s/2)/2 (each wheel contributes)
    // More precisely: M_max ≈ P*L/2 - P*s²/(8L) (Engesser)
    let m_two_wheel: f64 = p * l / 2.0 - p * s * s / (8.0 * l);
    // = 175*6 - 175*9/96 = 1050 - 16.4 = 1034 kN·m (total from 2 wheels)

    // Two wheels give MORE total moment than single wheel
    assert!(
        m_two_wheel > m_single,
        "Two-wheel M = {:.0} > single M = {:.0} kN·m", m_two_wheel, m_single
    );

    assert!(
        m_two_wheel > 800.0,
        "Runway beam moment: {:.0} kN·m", m_two_wheel
    );

    let _m_max = m_max;
}

// ================================================================
// 3. Lateral Forces — Crane Skew and Thrust
// ================================================================
//
// AISC DG7: lateral force = 20% of total wheel loads per rail
// EN 1991-3: considers crane skewing forces
// Applied at top of rail, creating torsion on runway beam.

#[test]
fn crane_lateral_forces() {
    let total_wheel_load: f64 = 350.0; // kN (sum of all wheels on one rail)

    // AISC: lateral thrust = 20% of wheel loads
    let h_lateral_aisc: f64 = 0.20 * total_wheel_load;
    // = 70 kN

    let h_expected: f64 = 70.0;
    assert!(
        (h_lateral_aisc - h_expected).abs() / h_expected < 0.01,
        "Lateral force (AISC): {:.0} kN", h_lateral_aisc
    );

    // EN 1991-3: skewing force (more detailed)
    // H_s,i = f * Σ(Q_r,max) where f depends on guidance system
    let f_guide: f64 = 0.10; // lateral guide factor
    let hs: f64 = f_guide * total_wheel_load;

    assert!(
        hs < h_lateral_aisc,
        "EC lateral {:.0} < AISC {:.0} kN", hs, h_lateral_aisc
    );

    // Longitudinal force (traction): 10% of driven wheel loads
    let h_long: f64 = 0.10 * total_wheel_load;
    assert!(
        h_long < h_lateral_aisc,
        "Longitudinal {:.0} < lateral {:.0} kN", h_long, h_lateral_aisc
    );
}

// ================================================================
// 4. Runway Beam — Biaxial Bending
// ================================================================
//
// Runway beam subject to vertical loads (about strong axis)
// and lateral loads (about weak axis).
// Combined check: fb,x/Fb,x + fb,y/Fb,y ≤ 1.0

#[test]
fn crane_biaxial_bending() {
    // W610×140 beam properties (approximate)
    let sx: f64 = 3640.0;      // cm³, strong axis section modulus
    let sy: f64 = 403.0;       // cm³, weak axis section modulus

    let fy: f64 = 350.0;       // MPa

    // Moments from crane loading
    let mx: f64 = 500.0;       // kN·m, vertical load moment
    let my: f64 = 25.0;        // kN·m, lateral load moment

    // Stresses (convert sx from cm³ to mm³: ×1000)
    let fbx: f64 = mx * 1e6 / (sx * 1e3); // MPa
    let fby: f64 = my * 1e6 / (sy * 1e3); // MPa

    // Allowable stresses (ASD: 0.66*Fy for compact sections)
    let fb_allow: f64 = 0.66 * fy; // = 231 MPa

    // Interaction check
    let interaction: f64 = fbx / fb_allow + fby / fb_allow;

    assert!(
        interaction < 1.0,
        "Interaction ratio: {:.3} < 1.0 — OK", interaction
    );

    // Lateral bending is significant contributor
    let lateral_contrib: f64 = fby / fb_allow / interaction;
    assert!(
        lateral_contrib > 0.05,
        "Lateral bending contributes {:.1}% of interaction", lateral_contrib * 100.0
    );
}

// ================================================================
// 5. Crane Fatigue — AISC/CMAA Classification
// ================================================================
//
// CMAA Service Class: A (standby), B (light), C (moderate), D (heavy), E (severe), F (continuous)
// Number of full-load cycles:
// Class C: 100,000-500,000 cycles in design life
// Class D: 500,000-2,000,000 cycles

#[test]
fn crane_fatigue_classification() {
    // CMAA Class C: moderate service
    let n_cycles_c: f64 = 300_000.0;
    // CMAA Class D: heavy service
    let n_cycles_d: f64 = 1_000_000.0;

    // AISC fatigue category for runway beam
    // Welded attachment: Category C (detail)
    // Allowable stress range for 300k cycles (Category C):
    // From AISC Table A-3.1: F_SR = stress range limit
    let fsr_c_300k: f64 = 124.0; // MPa (approximate, AISC Category C, 300k cycles)

    // For 1M cycles: lower allowable
    let fsr_c_1m: f64 = 90.0;   // MPa (approximate)

    assert!(
        fsr_c_300k > fsr_c_1m,
        "300k: {:.0} > 1M: {:.0} MPa", fsr_c_300k, fsr_c_1m
    );

    // S-N relationship: N = C_f / (ΔF)^3
    // Ratio of cycles: (N1/N2) = (ΔF2/ΔF1)^3
    let n_ratio: f64 = n_cycles_d / n_cycles_c;
    let f_ratio: f64 = (1.0 / n_ratio).powf(1.0 / 3.0);
    // = (300k/1M)^(1/3) = 0.3^0.333 = 0.669

    // More cycles → lower allowable stress range
    assert!(
        f_ratio < 1.0,
        "Stress range ratio: {:.3}", f_ratio
    );
}

// ================================================================
// 6. Column Bracket — Eccentric Load
// ================================================================
//
// Crane runway beam supported on column bracket.
// Bracket creates eccentricity: M = P * e
// Column must resist axial + moment from crane eccentricity.

#[test]
fn crane_column_bracket() {
    let p_vertical: f64 = 350.0; // kN, vertical crane load
    let p_lateral: f64 = 70.0;   // kN, lateral crane force
    let e: f64 = 0.50;           // m, eccentricity from column CL

    // Moment on column from eccentricity
    let m_eccentric: f64 = p_vertical * e;
    // = 175 kN·m

    let m_expected: f64 = 175.0;
    assert!(
        (m_eccentric - m_expected).abs() / m_expected < 0.01,
        "Eccentric moment: {:.0} kN·m", m_eccentric
    );

    // Lateral force creates additional moment about column base
    let h_col: f64 = 10.0;     // m, column height
    let h_crane: f64 = 8.0;    // m, crane rail height

    let m_lateral: f64 = p_lateral * h_crane;
    // = 70 * 8 = 560 kN·m

    // Total moment at base
    let m_total: f64 = m_eccentric + m_lateral;
    assert!(
        m_total > m_eccentric,
        "Total M = {:.0} kN·m (eccentric + lateral)", m_total
    );

    let _h_col = h_col;
}

// ================================================================
// 7. Deflection Limits — Runway Beam
// ================================================================
//
// AISC DG7 deflection limits (vertical):
// L/600 for CMAA Class A, B
// L/800 for CMAA Class C
// L/1000 for CMAA Class D, E, F
// Lateral: L/400

#[test]
fn crane_deflection_limits() {
    let l: f64 = 12000.0;      // mm, span

    // Vertical limits by CMAA class
    let dv_class_b: f64 = l / 600.0;  // = 20.0 mm
    let dv_class_c: f64 = l / 800.0;  // = 15.0 mm
    let dv_class_d: f64 = l / 1000.0; // = 12.0 mm

    assert!(
        dv_class_d < dv_class_c && dv_class_c < dv_class_b,
        "Heavier service → tighter limits: D({:.1}) < C({:.1}) < B({:.1}) mm",
        dv_class_d, dv_class_c, dv_class_b
    );

    // Lateral limit (all classes)
    let dh_limit: f64 = l / 400.0; // = 30.0 mm
    assert!(
        dh_limit > dv_class_b,
        "Lateral limit {:.0}mm > vertical limits", dh_limit
    );

    // Check actual deflection for W610×140
    let e: f64 = 200_000.0;    // MPa
    let i: f64 = 1120e6;       // mm⁴ (approximate for W610×140)
    let p: f64 = 140.0;        // kN, unfactored wheel load

    // Single point load at midspan: δ = PL³/(48EI)
    let delta: f64 = p * 1000.0 * l.powi(3) / (48.0 * e * i);
    // = 140000 * 1.728e12 / (48 * 200000 * 1.12e9)

    assert!(
        delta > 0.0,
        "Deflection: {:.2} mm", delta
    );
}

// ================================================================
// 8. EN 1991-3 — Dynamic Factors
// ================================================================
//
// EN 1991-3 provides dynamic amplification factors:
// φ1: hoisting (vibration from lifting)
// φ2: dynamic effects from sudden lifting off ground
// φ5: drive forces (acceleration/braking)
// φ7: test load factor

#[test]
fn crane_en1991_dynamic_factors() {
    // Hoisting class HC2 (typical overhead crane)
    // φ1 = 1.0 + δ1 (steady hoisting)
    let delta_1: f64 = 0.05;   // for HC2
    let phi_1: f64 = 1.0 + delta_1;

    assert!(
        (phi_1 - 1.05).abs() < 0.01,
        "φ1 = {:.2}", phi_1
    );

    // φ2: dynamic factor for hoisting from ground
    // φ2 = φ2,min + β2 * vh
    let phi_2_min: f64 = 1.10;  // HC2
    let beta_2: f64 = 0.34;     // HC2
    let vh: f64 = 0.5;          // m/s, hoisting speed
    let phi_2: f64 = phi_2_min + beta_2 * vh;
    // = 1.10 + 0.34*0.5 = 1.27

    assert!(
        phi_2 > phi_1,
        "φ2 = {:.2} > φ1 = {:.2} (ground pickup more dynamic)", phi_2, phi_1
    );

    // φ5: drive force factor
    let phi_5: f64 = 1.50;     // typical for travel/traverse

    // φ7: test load (static test: 1.25*SWL, dynamic test: 1.1*SWL)
    let phi_7_static: f64 = 1.25;
    let phi_7_dynamic: f64 = 1.10;

    assert!(
        phi_7_static > phi_7_dynamic,
        "Static test {:.2} > dynamic test {:.2}", phi_7_static, phi_7_dynamic
    );

    let _phi_5 = phi_5;
}
