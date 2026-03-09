/// Validation: Connection Mechanics (Pure Formula Verification)
///
/// References:
///   - AISC 360-22, Chapter J (Design of Connections)
///   - AISC Steel Construction Manual, 15th Ed., Part 7-10
///   - Salmon, Johnson & Malhas, "Steel Structures", Ch. 12-14
///   - Kulak, Fisher & Struik, "Guide to Design Criteria for Bolted
///     and Riveted Joints", 2nd Ed.
///   - EN 1993-1-8:2005 (Eurocode 3, Part 1-8)
///   - Thornton, "Prying Action — A General Treatment", AISC Eng. J.
///
/// Tests verify connection design formulas without calling the solver.
///
/// Tests:
///   1. Bolt shear and bearing capacity (AISC J3)
///   2. Weld effective area and strength (AISC J2)
///   3. Prying action in T-stub connections (Thornton method)
///   4. Moment connection: bolt group analysis
///   5. Base plate design: bearing stress and anchor bolt tension
///   6. Bolt group eccentricity: elastic method
///   7. Fillet weld directional strength enhancement
///   8. Block shear rupture (AISC J4)

use std::f64::consts::PI;

// ================================================================
// 1. Bolt Shear and Bearing Capacity (AISC J3)
// ================================================================
//
// Bolt shear strength (AISC 360-22, Eq. J3-1):
//   R_n = F_nv * A_b
//   phi*R_n = 0.75 * F_nv * A_b
//
// where F_nv = nominal shear stress (e.g., 457 MPa for A325-N)
//       A_b = bolt nominal area = pi*d^2/4
//
// Bolt bearing strength at bolt hole (AISC J3-6a):
//   R_n = 2.4 * d * t * F_u   (deformation at service load is a concern)
//
// Reference: AISC 360-22, Section J3.6, J3.10

#[test]
fn validation_bolt_shear_bearing() {
    let d: f64 = 22.0;       // mm, bolt diameter (M22)
    let f_nv: f64 = 457.0;   // MPa, A325-N shear stress (threads in shear plane)
    let phi_shear: f64 = 0.75;

    // Bolt nominal area
    let a_b: f64 = PI * d * d / 4.0;
    let a_b_expected: f64 = PI * 22.0 * 22.0 / 4.0; // ≈ 380.13 mm^2
    assert!(
        (a_b - a_b_expected).abs() / a_b_expected < 1e-10,
        "Bolt area: computed={:.2} mm^2, expected={:.2} mm^2",
        a_b, a_b_expected
    );

    // Nominal shear strength per bolt
    let rn_shear: f64 = f_nv * a_b / 1000.0; // kN
    let rn_shear_expected: f64 = 457.0 * a_b_expected / 1000.0;
    assert!(
        (rn_shear - rn_shear_expected).abs() / rn_shear_expected < 1e-10,
        "Nominal shear: computed={:.2} kN, expected={:.2} kN",
        rn_shear, rn_shear_expected
    );

    // Design shear strength
    let phi_rn_shear: f64 = phi_shear * rn_shear;
    assert!(
        phi_rn_shear > 0.0 && phi_rn_shear < rn_shear,
        "Design shear: phi*Rn={:.2} < Rn={:.2} kN",
        phi_rn_shear, rn_shear
    );

    // Bearing strength: R_n = 2.4 * d * t * F_u
    let t: f64 = 12.0;      // mm, plate thickness
    let f_u: f64 = 450.0;   // MPa, plate ultimate stress
    let phi_bearing: f64 = 0.75;

    let rn_bearing: f64 = 2.4 * d * t * f_u / 1000.0; // kN
    let rn_bearing_expected: f64 = 2.4 * 22.0 * 12.0 * 450.0 / 1000.0; // = 285.12 kN
    assert!(
        (rn_bearing - rn_bearing_expected).abs() / rn_bearing_expected < 1e-10,
        "Nominal bearing: computed={:.2} kN, expected={:.2} kN",
        rn_bearing, rn_bearing_expected
    );

    let phi_rn_bearing: f64 = phi_bearing * rn_bearing;

    // Controlling limit state: minimum of shear and bearing
    let controlling: f64 = phi_rn_shear.min(phi_rn_bearing);
    assert!(
        controlling > 0.0,
        "Controlling strength: {:.2} kN",
        controlling
    );
}

// ================================================================
// 2. Weld Effective Area and Strength (AISC J2)
// ================================================================
//
// Fillet weld effective area (AISC J2.2a):
//   A_w = a * L_w
//   where a = effective throat = w * sin(45) = w * 0.707
//         w = weld leg size
//         L_w = weld length
//
// Weld strength (AISC J2.4):
//   R_n = F_nw * A_w = 0.60 * F_EXX * A_w
//   phi*R_n = 0.75 * 0.60 * F_EXX * a * L_w
//
// where F_EXX = electrode classification strength
//       (E70: F_EXX = 482 MPa = 70 ksi)
//
// Reference: AISC 360-22, Section J2

#[test]
fn validation_weld_effective_area() {
    let w: f64 = 8.0;          // mm, weld leg size
    let l_w: f64 = 200.0;     // mm, weld length
    let f_exx: f64 = 482.0;   // MPa (E70 electrode)
    let phi_weld: f64 = 0.75;

    // Effective throat
    let a_throat: f64 = w * (2.0_f64.sqrt() / 2.0);
    let a_throat_expected: f64 = 8.0 * 0.7071067811865476;
    assert!(
        (a_throat - a_throat_expected).abs() / a_throat_expected < 1e-10,
        "Effective throat: computed={:.4} mm, expected={:.4} mm",
        a_throat, a_throat_expected
    );

    // Effective area
    let a_w: f64 = a_throat * l_w;
    let a_w_expected: f64 = a_throat_expected * 200.0;
    assert!(
        (a_w - a_w_expected).abs() / a_w_expected < 1e-10,
        "Weld area: computed={:.2} mm^2, expected={:.2} mm^2",
        a_w, a_w_expected
    );

    // Nominal weld strength
    let f_nw: f64 = 0.60 * f_exx; // = 289.2 MPa
    let rn_weld: f64 = f_nw * a_w / 1000.0; // kN
    assert!(
        rn_weld > 0.0,
        "Nominal weld strength: {:.2} kN",
        rn_weld
    );

    // Design weld strength
    let phi_rn: f64 = phi_weld * rn_weld;
    assert!(
        phi_rn > 0.0 && phi_rn < rn_weld,
        "Design strength: phi*Rn={:.2} < Rn={:.2} kN",
        phi_rn, rn_weld
    );

    // Weld strength per mm of weld length
    let strength_per_mm: f64 = phi_rn / l_w; // kN/mm
    let strength_per_mm_expected: f64 = phi_weld * f_nw * a_throat / 1000.0;
    assert!(
        (strength_per_mm - strength_per_mm_expected).abs() / strength_per_mm_expected < 1e-10,
        "Strength per mm: computed={:.4} kN/mm, expected={:.4} kN/mm",
        strength_per_mm, strength_per_mm_expected
    );

    // Verify linear scaling: doubling weld length doubles capacity
    let l_w2: f64 = 2.0 * l_w;
    let rn_double: f64 = f_nw * a_throat * l_w2 / 1000.0;
    assert!(
        (rn_double - 2.0 * rn_weld).abs() / (2.0 * rn_weld) < 1e-10,
        "Double length, double strength: {:.2} vs {:.2}",
        rn_double, 2.0 * rn_weld
    );
}

// ================================================================
// 3. Prying Action in T-Stub Connections (Thornton Method)
// ================================================================
//
// When a tension connection has flexible flanges, prying forces
// develop at the bolt line. The prying force Q is:
//
//   Q = B * (d'/p) * [(t_c/t)^2 - 1]  (simplified Thornton)
//
// where:
//   B = bolt pretension force
//   d' = bolt diameter + 1/16" (hole diameter factor)
//   p = tributary flange width per bolt
//   t_c = critical flange thickness = sqrt(4*T*b'/(p*F_y))
//   t = actual flange thickness
//   b' = distance from bolt centerline to face of T-stem minus d/2
//
// When t >= t_c: no prying (Q = 0, thick plate behavior)
// When t < t_c: prying develops (Q > 0)
//
// Reference: Thornton, AISC Engineering Journal, 1985

#[test]
fn validation_prying_action_thornton() {
    // Connection geometry
    let b_prime: f64 = 40.0;  // mm, bolt to T-stem distance (net)
    let a_prime: f64 = 50.0;  // mm, bolt to flange edge distance (net)
    let p_trib: f64 = 80.0;   // mm, tributary width per bolt
    let fy: f64 = 345.0;      // MPa, flange yield stress
    let t_applied: f64 = 100.0; // kN, applied tension per bolt

    // Critical flange thickness (no prying)
    let t_c: f64 = (4.0 * t_applied * 1000.0 * b_prime / (p_trib * fy)).sqrt();
    // = sqrt(4 * 100000 * 40 / (80 * 345)) = sqrt(16000000/27600) = sqrt(579.71) = 24.08 mm
    let t_c_expected: f64 = (4.0_f64 * 100_000.0 * 40.0 / (80.0 * 345.0)).sqrt();
    assert!(
        (t_c - t_c_expected).abs() / t_c_expected < 1e-10,
        "Critical thickness: computed={:.2} mm, expected={:.2} mm",
        t_c, t_c_expected
    );

    // Case 1: Thick flange (t > t_c) — no prying
    let t_thick: f64 = 30.0; // mm (> t_c)
    assert!(
        t_thick > t_c,
        "Thick flange: t={:.1} > t_c={:.2}",
        t_thick, t_c
    );
    // Bolt force = applied tension (no prying)
    let b_bolt_thick: f64 = t_applied; // kN

    // Case 2: Thin flange (t < t_c) — prying develops
    let t_thin: f64 = 16.0; // mm (< t_c)
    assert!(
        t_thin < t_c,
        "Thin flange: t={:.1} < t_c={:.2}",
        t_thin, t_c
    );

    // Prying ratio: alpha parameter
    let alpha: f64 = 1.0 / (a_prime / b_prime) * ((t_c / t_thin).powi(2) - 1.0);
    // Cap alpha at 1.0
    let alpha_capped: f64 = alpha.min(1.0);
    assert!(
        alpha_capped >= 0.0 && alpha_capped <= 1.0,
        "Alpha capped: {:.4}",
        alpha_capped
    );

    // Prying force Q (simplified)
    let q_prying: f64 = t_applied * b_prime / (b_prime + a_prime) * ((t_c / t_thin).powi(2) - 1.0).min(1.0);
    assert!(
        q_prying > 0.0,
        "Prying force: {:.2} kN",
        q_prying
    );

    // Bolt must carry T + Q
    let b_bolt_thin: f64 = t_applied + q_prying;
    assert!(
        b_bolt_thin > b_bolt_thick,
        "Thin flange bolt force ({:.2}) > thick flange ({:.2})",
        b_bolt_thin, b_bolt_thick
    );
}

// ================================================================
// 4. Moment Connection: Bolt Group Analysis
// ================================================================
//
// For a bolted moment connection with bolts arranged in vertical
// lines, the maximum bolt force due to moment M is:
//
//   F_max = M * r_max / sum(r_i^2)
//
// where r_i = distance from bolt to centroid of bolt group
//       r_max = maximum such distance
//
// For n bolts in a single vertical line at spacing s:
//   sum(r_i^2) = n * (n^2 - 1) * s^2 / 12  (for symmetric arrangement)
//
// Reference: Salmon et al., "Steel Structures", Ch. 13

#[test]
fn validation_moment_connection_bolt_group() {
    // Bolt group: 2 columns, 4 rows (8 bolts total)
    let _n_rows: f64 = 4.0;   // bolts per column
    let s_v: f64 = 75.0;      // mm, vertical spacing
    let s_h: f64 = 120.0;     // mm, horizontal spacing (gauge)
    let m_applied: f64 = 50.0; // kN-m, applied moment

    // Bolt distances from centroid (symmetric group)
    // Vertical: ±1.5s, ±0.5s
    // Horizontal: ±s_h/2
    let r_v: [f64; 4] = [-1.5 * s_v, -0.5 * s_v, 0.5 * s_v, 1.5 * s_v]; // mm
    let r_h: f64 = s_h / 2.0; // mm, half the gauge

    // Sum of r^2 for all 8 bolts (moment about centroid)
    let mut sum_r2: f64 = 0.0;
    for &rv in &r_v {
        // Two bolts at each vertical level (one at +r_h, one at -r_h)
        let r1_sq: f64 = rv * rv + r_h * r_h;
        sum_r2 += 2.0 * r1_sq;
    }

    // r_max: corner bolt
    let r_max: f64 = (r_v[3] * r_v[3] + r_h * r_h).sqrt();

    // Maximum bolt force from moment
    let m_mm: f64 = m_applied * 1e6; // N-mm
    let f_max: f64 = m_mm * r_max / sum_r2 / 1000.0; // kN
    assert!(
        f_max > 0.0,
        "Maximum bolt force from moment: {:.2} kN",
        f_max
    );

    // Verify: sum_r2 using formula for two columns
    // For each column: sum(y_i^2) = 2*(0.5*s)^2 + 2*(1.5*s)^2 = 2*s^2*(0.25+2.25) = 5*s^2
    let sum_y2_col: f64 = 2.0 * (0.5 * s_v).powi(2) + 2.0 * (1.5 * s_v).powi(2);
    let sum_y2_expected: f64 = 5.0 * s_v * s_v;
    assert!(
        (sum_y2_col - sum_y2_expected).abs() / sum_y2_expected < 1e-10,
        "Sum y^2 per column: computed={:.2}, expected={:.2}",
        sum_y2_col, sum_y2_expected
    );

    // Total sum_r2 = 2*sum_y2_col + 8 * (s_h/2)^2
    let sum_r2_formula: f64 = 2.0 * sum_y2_col + 8.0 * r_h * r_h;
    assert!(
        (sum_r2 - sum_r2_formula).abs() / sum_r2_formula < 1e-10,
        "Sum r^2: computed={:.2}, formula={:.2}",
        sum_r2, sum_r2_formula
    );
}

// ================================================================
// 5. Base Plate Design: Bearing Stress and Anchor Bolt Tension
// ================================================================
//
// For a column base plate under axial load P and moment M:
//
// If e = M/P < N/6 (within kern):
//   f_max = P/(B*N) * (1 + 6*e/N)    (no uplift)
//   f_min = P/(B*N) * (1 - 6*e/N)
//
// If e > N/6 (outside kern, partial bearing):
//   Bearing length: Y = 3*(N/2 - e)
//   f_max = 2*P / (B*Y)
//
// For anchor bolt tension (large eccentricity):
//   T = M/d - P*(d-e)/d  (simplified, d = bolt spacing)
//
// Reference: AISC Steel Design Guide 1

#[test]
fn validation_base_plate_bearing() {
    let p: f64 = 800.0;   // kN, axial compression
    let m: f64 = 120.0;   // kN-m, moment
    let b_plate: f64 = 400.0; // mm, plate width
    let n_plate: f64 = 500.0; // mm, plate length (in bending direction)

    // Eccentricity
    let e: f64 = m * 1000.0 / p; // mm
    let e_expected: f64 = 150.0;  // mm
    assert!(
        (e - e_expected).abs() / e_expected < 1e-10,
        "Eccentricity: computed={:.2} mm, expected={:.2} mm",
        e, e_expected
    );

    // Kern distance
    let kern: f64 = n_plate / 6.0;
    let kern_expected: f64 = 500.0 / 6.0; // ≈ 83.33 mm
    assert!(
        (kern - kern_expected).abs() / kern_expected < 1e-10,
        "Kern: computed={:.2} mm, expected={:.2} mm",
        kern, kern_expected
    );

    // e > N/6: partial bearing (outside kern)
    assert!(
        e > kern,
        "Outside kern: e={:.2} > N/6={:.2}",
        e, kern
    );

    // Bearing length (partial bearing)
    let y_bearing: f64 = 3.0 * (n_plate / 2.0 - e);
    let y_expected: f64 = 3.0 * (250.0 - 150.0); // = 300 mm
    assert!(
        (y_bearing - y_expected).abs() / y_expected < 1e-10,
        "Bearing length: computed={:.2} mm, expected={:.2} mm",
        y_bearing, y_expected
    );

    // Maximum bearing stress
    let f_max: f64 = 2.0 * p * 1000.0 / (b_plate * y_bearing); // MPa (N/mm^2)
    let f_max_expected: f64 = 2.0 * 800_000.0 / (400.0 * 300.0); // ≈ 13.33 MPa
    assert!(
        (f_max - f_max_expected).abs() / f_max_expected < 1e-10,
        "Max bearing stress: computed={:.2} MPa, expected={:.2} MPa",
        f_max, f_max_expected
    );

    // When e < N/6 (within kern): full bearing
    let m_small: f64 = 30.0; // kN-m
    let e_small: f64 = m_small * 1000.0 / p; // = 37.5 mm
    assert!(
        e_small < kern,
        "Within kern: e={:.2} < N/6={:.2}",
        e_small, kern
    );

    let f_max_full: f64 = p * 1000.0 / (b_plate * n_plate) * (1.0 + 6.0 * e_small / n_plate);
    let f_min_full: f64 = p * 1000.0 / (b_plate * n_plate) * (1.0 - 6.0 * e_small / n_plate);
    assert!(
        f_min_full > 0.0,
        "Full bearing: f_min={:.2} MPa > 0",
        f_min_full
    );
    assert!(
        f_max_full > f_min_full,
        "f_max ({:.2}) > f_min ({:.2})",
        f_max_full, f_min_full
    );
}

// ================================================================
// 6. Bolt Group Eccentricity: Elastic Method
// ================================================================
//
// For a bolt group with eccentric shear load P at eccentricity e:
//
// Direct shear per bolt:   F_v = P / n
// Torsional shear per bolt: F_t = P * e * r_i / sum(r_i^2)
//
// The resultant force on the critical bolt (farthest from centroid):
//   F_r = sqrt((F_vx + F_tx)^2 + (F_vy + F_ty)^2)
//
// Reference: AISC Manual, Part 7

#[test]
fn validation_bolt_group_eccentricity_elastic() {
    // 3-bolt vertical line, spacing s = 75 mm
    let n_bolts: f64 = 3.0;
    let s: f64 = 75.0;        // mm
    let p: f64 = 150.0;       // kN, applied shear
    let e: f64 = 200.0;       // mm, eccentricity from centroid

    // Bolt positions from centroid (vertical line):
    let y: [f64; 3] = [-s, 0.0, s]; // mm

    // Sum of r^2 (all in one column, x = 0)
    let sum_r2: f64 = y.iter().map(|&yi| yi * yi).sum::<f64>();
    let sum_r2_expected: f64 = 2.0 * s * s; // = 11250 mm^2
    assert!(
        (sum_r2 - sum_r2_expected).abs() / sum_r2_expected < 1e-10,
        "Sum r^2: computed={:.0}, expected={:.0}",
        sum_r2, sum_r2_expected
    );

    // Direct shear (vertical, downward)
    let f_v: f64 = p / n_bolts; // kN per bolt
    let f_v_expected: f64 = 50.0;
    assert!(
        (f_v - f_v_expected).abs() / f_v_expected < 1e-10,
        "Direct shear: computed={:.2} kN, expected={:.2} kN",
        f_v, f_v_expected
    );

    // Torsional moment on bolt group
    let m_torsion: f64 = p * e; // kN-mm

    // Torsional shear on the top bolt (r_max = 75 mm)
    let r_max: f64 = 75.0;
    let f_t_max: f64 = m_torsion * r_max / sum_r2; // kN
    // = 150 * 200 * 75 / 11250 = 2250000/11250 = 200 kN
    let f_t_max_expected: f64 = 200.0;
    assert!(
        (f_t_max - f_t_max_expected).abs() / f_t_max_expected < 1e-10,
        "Torsional shear (max): computed={:.2} kN, expected={:.2} kN",
        f_t_max, f_t_max_expected
    );

    // Direction of torsional shear: perpendicular to radius vector
    // For top bolt (0, 75): torsional force is horizontal (right)
    // Resultant on top bolt: F_v (down) + F_t (right)
    let f_resultant: f64 = (f_v * f_v + f_t_max * f_t_max).sqrt();
    let f_resultant_expected: f64 = (50.0_f64 * 50.0 + 200.0 * 200.0).sqrt();
    assert!(
        (f_resultant - f_resultant_expected).abs() / f_resultant_expected < 1e-10,
        "Resultant on critical bolt: computed={:.2} kN, expected={:.2} kN",
        f_resultant, f_resultant_expected
    );

    // Center bolt has no torsional shear (r = 0)
    let f_center: f64 = f_v; // only direct shear
    assert!(
        f_resultant > f_center,
        "Critical bolt ({:.2}) > center bolt ({:.2})",
        f_resultant, f_center
    );
}

// ================================================================
// 7. Fillet Weld Directional Strength Enhancement
// ================================================================
//
// AISC 360-22, Eq. J2-5:
// Fillet weld strength increases with load angle theta:
//   F_nw = 0.60 * F_EXX * (1.0 + 0.50 * sin^1.5(theta))
//
// At theta = 0 (longitudinal): F_nw = 0.60 * F_EXX
// At theta = 90 (transverse):  F_nw = 0.60 * F_EXX * 1.5
//
// This means transverse welds are 50% stronger than longitudinal.
//
// Reference: AISC 360-22, Section J2.4

#[test]
fn validation_weld_directional_strength() {
    let f_exx: f64 = 482.0; // MPa (E70 electrode)

    // Base strength (longitudinal, theta = 0)
    let theta_0: f64 = 0.0_f64;
    let fnw_0: f64 = 0.60 * f_exx * (1.0 + 0.50 * theta_0.to_radians().sin().powf(1.5));
    let fnw_0_expected: f64 = 0.60 * 482.0; // = 289.2 MPa
    assert!(
        (fnw_0 - fnw_0_expected).abs() / fnw_0_expected < 1e-10,
        "Longitudinal F_nw: computed={:.2}, expected={:.2} MPa",
        fnw_0, fnw_0_expected
    );

    // Transverse strength (theta = 90 degrees)
    let theta_90: f64 = 90.0_f64;
    let fnw_90: f64 = 0.60 * f_exx * (1.0 + 0.50 * theta_90.to_radians().sin().powf(1.5));
    let fnw_90_expected: f64 = 0.60 * 482.0 * 1.5; // = 433.8 MPa
    assert!(
        (fnw_90 - fnw_90_expected).abs() / fnw_90_expected < 1e-10,
        "Transverse F_nw: computed={:.2}, expected={:.2} MPa",
        fnw_90, fnw_90_expected
    );

    // Enhancement ratio
    let ratio: f64 = fnw_90 / fnw_0;
    assert!(
        (ratio - 1.5).abs() < 1e-10,
        "Transverse/Longitudinal ratio: {:.4} (should be 1.5)",
        ratio
    );

    // 45-degree angle
    let theta_45: f64 = 45.0_f64;
    let sin_45: f64 = theta_45.to_radians().sin();
    let fnw_45: f64 = 0.60 * f_exx * (1.0 + 0.50 * sin_45.powf(1.5));
    // sin(45) = 0.7071, sin^1.5 = 0.5946
    assert!(
        fnw_45 > fnw_0 && fnw_45 < fnw_90,
        "45-degree strength ({:.2}) between longitudinal ({:.2}) and transverse ({:.2})",
        fnw_45, fnw_0, fnw_90
    );

    // Verify monotonically increasing with angle
    let mut prev_fnw: f64 = fnw_0;
    for deg in (15..=90).step_by(15) {
        let theta: f64 = deg as f64;
        let fnw: f64 = 0.60 * f_exx * (1.0 + 0.50 * theta.to_radians().sin().powf(1.5));
        assert!(
            fnw >= prev_fnw,
            "F_nw should increase: {:.2} at {}deg vs {:.2} at prev",
            fnw, deg, prev_fnw
        );
        prev_fnw = fnw;
    }
}

// ================================================================
// 8. Block Shear Rupture (AISC J4)
// ================================================================
//
// AISC 360-22, Eq. J4-5:
//   R_n = 0.60*F_u*A_nv + U_bs*F_u*A_nt
//         <= 0.60*F_y*A_gv + U_bs*F_u*A_nt
//
// where:
//   A_nv = net area in shear
//   A_nt = net area in tension
//   A_gv = gross area in shear
//   U_bs = 1.0 (uniform tension) or 0.5 (non-uniform tension)
//   F_u = ultimate tensile strength
//   F_y = yield strength
//
// Reference: AISC 360-22, Section J4.3

#[test]
fn validation_block_shear_rupture() {
    // Plate connection: 3 bolts in a line
    let t: f64 = 10.0;        // mm, plate thickness
    let f_y: f64 = 250.0;     // MPa
    let f_u: f64 = 400.0;     // MPa
    let d_hole: f64 = 24.0;   // mm, bolt hole diameter (22mm bolt + 2mm)
    let s: f64 = 75.0;        // mm, bolt spacing
    let l_e: f64 = 40.0;      // mm, edge distance
    let u_bs: f64 = 1.0;      // uniform tension

    // Gross shear area: (edge distance + 2 spaces) * t
    let l_shear: f64 = l_e + 2.0 * s; // = 40 + 150 = 190 mm
    let a_gv: f64 = l_shear * t;
    let a_gv_expected: f64 = 190.0 * 10.0; // = 1900 mm^2
    assert!(
        (a_gv - a_gv_expected).abs() / a_gv_expected < 1e-10,
        "A_gv: computed={:.0} mm^2, expected={:.0} mm^2",
        a_gv, a_gv_expected
    );

    // Net shear area: gross - bolt holes (2.5 holes in shear path)
    let n_holes_shear: f64 = 2.5; // 2 full holes + half hole at end
    let a_nv: f64 = a_gv - n_holes_shear * d_hole * t;
    let a_nv_expected: f64 = 1900.0 - 2.5 * 24.0 * 10.0; // = 1900 - 600 = 1300 mm^2
    assert!(
        (a_nv - a_nv_expected).abs() / a_nv_expected < 1e-10,
        "A_nv: computed={:.0} mm^2, expected={:.0} mm^2",
        a_nv, a_nv_expected
    );

    // Net tension area (perpendicular to load, one bolt hole)
    let l_tension: f64 = 50.0; // mm, gauge distance (perpendicular)
    let a_nt: f64 = (l_tension - d_hole) * t;
    let a_nt_expected: f64 = (50.0 - 24.0) * 10.0; // = 260 mm^2
    assert!(
        (a_nt - a_nt_expected).abs() / a_nt_expected < 1e-10,
        "A_nt: computed={:.0} mm^2, expected={:.0} mm^2",
        a_nt, a_nt_expected
    );

    // Block shear strength (controlling equation)
    let rn_rupture: f64 = (0.60 * f_u * a_nv + u_bs * f_u * a_nt) / 1000.0; // kN
    let rn_yield: f64 = (0.60 * f_y * a_gv + u_bs * f_u * a_nt) / 1000.0;   // kN
    let rn: f64 = rn_rupture.min(rn_yield);

    // phi = 0.75
    let phi_bs: f64 = 0.75;
    let phi_rn: f64 = phi_bs * rn;

    assert!(
        phi_rn > 0.0,
        "Block shear design strength: {:.2} kN",
        phi_rn
    );

    // The yield path should control if F_u/F_y is large
    // and net area is much smaller than gross
    assert!(
        rn == rn_rupture.min(rn_yield),
        "Controlling: min({:.2}, {:.2}) = {:.2} kN",
        rn_rupture, rn_yield, rn
    );
}
