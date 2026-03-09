/// Validation: Advanced Steel Connection Design Benchmarks
///
/// References:
///   - AISC 360-22: Specification for Structural Steel Buildings, Ch. J
///   - AISC Steel Construction Manual, 15th Edition, Parts 7-10
///   - AISC Design Guide 1: "Base Plate and Anchor Rod Design" (2006)
///   - AISC Design Guide 4: "Extended End-Plate Moment Connections" (2003)
///   - AISC Design Guide 29: "Vertical Bracing Connections" (2014)
///   - EN 1993-1-8:2005 (Eurocode 3, Part 1-8): Design of joints
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 12-14
///   - Thornton, "Prying Action — A General Treatment", AISC Eng. J. (1985)
///   - Kulak, Fisher & Struik, "Guide to Design Criteria for Bolted
///     and Riveted Joints", 2nd Ed.
///
/// Tests verify advanced connection design formulas with hand-computed values.
/// No solver calls -- pure arithmetic verification of analytical expressions.

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
// 1. Bolt Shear Capacity — AISC J3.6
// ================================================================
//
// Single bolt nominal shear strength:
//   R_n = F_nv * A_b
//
// For A490-X bolt (threads excluded from shear plane):
//   F_nv = 84 ksi = 579.2 MPa (AISC Table J3.2)
//
// Bolt diameter: 7/8" = 22.225 mm
//   A_b = pi/4 * d^2 = pi/4 * 22.225^2 = 387.93 mm^2
//
// Single bolt nominal shear:
//   R_n = 579.2 * 387.93 = 224,688 N = 224.69 kN
//
// Design shear (phi = 0.75):
//   phi*R_n = 0.75 * 224.69 = 168.52 kN
//
// For a group of 6 bolts (3 rows x 2 columns):
//   phi*R_n_group = 6 * 168.52 = 1011.10 kN

#[test]
fn validation_conn_ext_1_bolt_shear_capacity() {
    let fnv: f64 = 579.2;          // MPa, A490-X nominal shear stress
    let d_bolt: f64 = 22.225;      // mm, 7/8" bolt diameter
    let phi: f64 = 0.75;
    let n_bolts: usize = 6;

    // --- Bolt area ---
    let ab: f64 = PI / 4.0 * d_bolt * d_bolt;
    let ab_expected: f64 = PI / 4.0 * 22.225 * 22.225; // 387.93 mm^2
    assert_close(ab, ab_expected, 0.001, "Bolt area Ab");

    // --- Single bolt nominal shear ---
    let rn_single: f64 = fnv * ab / 1000.0; // kN
    let rn_single_expected: f64 = 579.2 * ab_expected / 1000.0;
    assert_close(rn_single, rn_single_expected, 0.001, "Rn single bolt");

    // --- Design shear (single bolt) ---
    let phi_rn_single: f64 = phi * rn_single;
    let phi_rn_single_expected: f64 = phi * rn_single_expected;
    assert_close(phi_rn_single, phi_rn_single_expected, 0.001, "phi*Rn single");

    // --- Group capacity ---
    let phi_rn_group: f64 = n_bolts as f64 * phi_rn_single;
    let phi_rn_group_expected: f64 = n_bolts as f64 * phi_rn_single_expected;
    assert_close(phi_rn_group, phi_rn_group_expected, 0.001, "phi*Rn group");

    // --- Verify A490-X is stronger than A325-N ---
    let fnv_a325n: f64 = 372.3; // MPa
    let rn_a325n: f64 = fnv_a325n * ab / 1000.0;
    assert!(
        rn_single > rn_a325n,
        "A490-X ({:.2} kN) > A325-N ({:.2} kN)",
        rn_single, rn_a325n
    );

    // --- Verify threads-excluded is stronger than threads-included ---
    let fnv_a490n: f64 = 457.0; // MPa, A490-N (threads in shear plane)
    let rn_a490n: f64 = fnv_a490n * ab / 1000.0;
    assert!(
        rn_single > rn_a490n,
        "A490-X ({:.2} kN) > A490-N ({:.2} kN)",
        rn_single, rn_a490n
    );

    // --- Confirm numerical values ---
    assert_close(ab, 387.93, 0.01, "Ab numerical check");
    assert_close(rn_single, 224.69, 0.01, "Rn numerical check");
    assert_close(phi_rn_single, 168.52, 0.01, "phi*Rn numerical check");
    assert_close(phi_rn_group, 1011.10, 0.01, "Group capacity numerical check");
}

// ================================================================
// 2. Bolt Bearing Strength — AISC J3.10
// ================================================================
//
// Bearing strength at bolt holes:
//   R_n = 1.2 * l_c * t * F_u   (tearout)
//   R_n <= 2.4 * d * t * F_u     (bearing upper limit)
//
// Bolt: M20 (d = 20 mm), standard hole d_h = 22 mm
// Plate: t = 16 mm, F_u = 450 MPa (A572 Gr 50)
// Edge distance: L_e = 32 mm
// Bolt spacing: s = 65 mm
//
// Edge bolt:
//   l_c = L_e - d_h/2 = 32 - 11 = 21 mm
//   R_n_tearout = 1.2 * 21 * 16 * 450 = 181,440 N = 181.44 kN
//   R_n_bearing = 2.4 * 20 * 16 * 450 = 345,600 N = 345.60 kN
//   R_n_edge = min(181.44, 345.60) = 181.44 kN  (tearout governs)
//
// Interior bolt:
//   l_c = s - d_h = 65 - 22 = 43 mm
//   R_n_tearout = 1.2 * 43 * 16 * 450 = 371,520 N = 371.52 kN
//   R_n_bearing = 2.4 * 20 * 16 * 450 = 345.60 kN
//   R_n_interior = min(371.52, 345.60) = 345.60 kN  (bearing governs)
//
// 3-bolt connection (1 edge + 2 interior):
//   phi*R_n_total = 0.75 * (181.44 + 2*345.60) = 0.75 * 872.64 = 654.48 kN

#[test]
fn validation_conn_ext_2_bolt_bearing_strength() {
    let d_bolt: f64 = 20.0;        // mm
    let d_hole: f64 = 22.0;        // mm, standard hole
    let t_plate: f64 = 16.0;       // mm
    let fu: f64 = 450.0;           // MPa
    let le: f64 = 32.0;            // mm, edge distance
    let s: f64 = 65.0;             // mm, bolt spacing
    let phi: f64 = 0.75;

    // --- Edge bolt: clear distance ---
    let lc_edge: f64 = le - d_hole / 2.0;
    assert_close(lc_edge, 21.0, 0.001, "lc edge bolt");

    // --- Edge bolt: tearout ---
    let rn_tearout_edge: f64 = 1.2 * lc_edge * t_plate * fu / 1000.0;
    assert_close(rn_tearout_edge, 181.44, 0.01, "Rn tearout edge");

    // --- Edge bolt: bearing upper limit ---
    let rn_bearing: f64 = 2.4 * d_bolt * t_plate * fu / 1000.0;
    assert_close(rn_bearing, 345.60, 0.01, "Rn bearing upper limit");

    // --- Edge bolt governs: tearout ---
    let rn_edge: f64 = rn_tearout_edge.min(rn_bearing);
    assert_close(rn_edge, rn_tearout_edge, 0.001, "Tearout governs at edge");

    // --- Interior bolt: clear distance ---
    let lc_interior: f64 = s - d_hole;
    assert_close(lc_interior, 43.0, 0.001, "lc interior bolt");

    // --- Interior bolt: tearout ---
    let rn_tearout_interior: f64 = 1.2 * lc_interior * t_plate * fu / 1000.0;
    assert_close(rn_tearout_interior, 371.52, 0.01, "Rn tearout interior");

    // --- Interior bolt governs: bearing ---
    let rn_interior: f64 = rn_tearout_interior.min(rn_bearing);
    assert_close(rn_interior, rn_bearing, 0.001, "Bearing governs at interior");

    // --- 3-bolt connection total (1 edge + 2 interior) ---
    let rn_total: f64 = rn_edge + 2.0 * rn_interior;
    assert_close(rn_total, 872.64, 0.01, "Rn total 3-bolt");

    let phi_rn_total: f64 = phi * rn_total;
    assert_close(phi_rn_total, 654.48, 0.01, "phi*Rn total");
}

// ================================================================
// 3. Weld Strength — AISC J2.4 with Directional Enhancement
// ================================================================
//
// Fillet weld nominal strength per unit length:
//   R_n/L = 0.60 * F_EXX * t_e * (1 + 0.50 * sin^1.5(theta))
//
// Where:
//   F_EXX = 490 MPa (E70xx electrode)
//   t_e = 0.707 * w (effective throat)
//   w = 6 mm (weld leg size)
//
// Effective throat: t_e = 0.707 * 6 = 4.242 mm
//
// Longitudinal weld (theta = 0):
//   R_n/L = 0.60 * 490 * 4.242 * 1.0 = 1247.1 N/mm = 1.247 kN/mm
//
// Transverse weld (theta = 90 deg):
//   Factor = 1 + 0.50*sin^1.5(90) = 1.5
//   R_n/L = 0.60 * 490 * 4.242 * 1.5 = 1870.7 N/mm = 1.871 kN/mm
//
// L-shaped weld: L_long = 150 mm, L_trans = 100 mm
//   R_n = 1.247 * 150 + 1.871 * 100 = 187.1 + 187.1 = 374.1 kN
//   phi*R_n = 0.75 * 374.1 = 280.6 kN

#[test]
fn validation_conn_ext_3_weld_strength() {
    let fexx: f64 = 490.0;         // MPa, E70xx electrode
    let w: f64 = 6.0;              // mm, weld leg size
    let phi: f64 = 0.75;
    let l_long: f64 = 150.0;       // mm, longitudinal weld length
    let l_trans: f64 = 100.0;      // mm, transverse weld length

    // --- Effective throat ---
    let te: f64 = 0.707 * w;
    assert_close(te, 4.242, 0.001, "Effective throat te");

    // --- Base weld stress ---
    let fnw_base: f64 = 0.60 * fexx; // MPa
    assert_close(fnw_base, 294.0, 0.001, "Fnw base (0.60*FEXX)");

    // --- Longitudinal weld (theta = 0) ---
    let theta_0: f64 = 0.0_f64;
    let factor_0: f64 = 1.0 + 0.50 * theta_0.to_radians().sin().powf(1.5);
    assert_close(factor_0, 1.0, 0.001, "Directional factor at 0 deg");

    let rn_per_mm_long: f64 = fnw_base * te * factor_0 / 1000.0; // kN/mm
    assert_close(rn_per_mm_long, 294.0 * 4.242 / 1000.0, 0.001, "Rn/L longitudinal");

    // --- Transverse weld (theta = 90 deg) ---
    let theta_90: f64 = 90.0_f64;
    let factor_90: f64 = 1.0 + 0.50 * theta_90.to_radians().sin().powf(1.5);
    assert_close(factor_90, 1.5, 0.001, "Directional factor at 90 deg");

    let rn_per_mm_trans: f64 = fnw_base * te * factor_90 / 1000.0; // kN/mm
    assert_close(rn_per_mm_trans / rn_per_mm_long, 1.5, 0.001, "Transverse/longitudinal ratio");

    // --- L-shaped weld total capacity ---
    let rn_total: f64 = rn_per_mm_long * l_long + rn_per_mm_trans * l_trans;
    let rn_long_contrib: f64 = rn_per_mm_long * l_long;
    let rn_trans_contrib: f64 = rn_per_mm_trans * l_trans;
    let rn_total_expected: f64 = rn_long_contrib + rn_trans_contrib;
    assert_close(rn_total, rn_total_expected, 0.001, "Rn total L-weld");

    // --- Design strength ---
    let phi_rn: f64 = phi * rn_total;
    assert!(phi_rn > 0.0, "Design weld strength is positive");

    // --- Verify transverse weld contributes more per unit length ---
    assert!(
        rn_per_mm_trans > rn_per_mm_long,
        "Transverse ({:.4} kN/mm) > Longitudinal ({:.4} kN/mm)",
        rn_per_mm_trans, rn_per_mm_long
    );

    // --- 45-degree weld factor check ---
    let theta_45: f64 = 45.0_f64;
    let sin_45: f64 = theta_45.to_radians().sin();
    let factor_45: f64 = 1.0 + 0.50 * sin_45.powf(1.5);
    // sin(45) = 0.7071, sin^1.5(45) = 0.5946
    assert_close(factor_45, 1.0 + 0.50 * 0.7071_f64.powf(1.5), 0.01, "Factor at 45 deg");
    assert!(
        factor_45 > 1.0 && factor_45 < 1.5,
        "45-deg factor ({:.4}) between 1.0 and 1.5",
        factor_45
    );
}

// ================================================================
// 4. Prying Action — Effective Bolt Tension
// ================================================================
//
// T-stub flange connection (EC3-1-8 / AISC DG 1 method):
//
// Applied bolt tension: T = 120 kN per bolt
// Geometry:
//   b' = 45 mm (bolt to web face)
//   a' = 35 mm (bolt to flange edge)
//   p = 90 mm (tributary width per bolt)
//   t_f = 18 mm (flange thickness)
//   F_y = 345 MPa
//   phi = 0.90
//
// Required flange thickness for no prying:
//   t_req = sqrt(4*T*b' / (phi*p*F_y))
//         = sqrt(4*120000*45 / (0.90*90*345))
//         = sqrt(21600000 / 27945) = sqrt(773.10) = 27.81 mm
//
// Since t_f = 18 mm < t_req = 27.81 mm, prying exists.
//
// Prying ratio (simplified Kulak):
//   Q/T = (a'/b') * [1 - (t_f/t_req)^2]
//       = (35/45) * [1 - (18/27.81)^2]
//       = 0.7778 * [1 - 0.4190]
//       = 0.7778 * 0.5810 = 0.4519
//
//   Q = 0.4519 * 120 = 54.23 kN
//   B = T + Q = 120 + 54.23 = 174.23 kN

#[test]
fn validation_conn_ext_4_prying_action() {
    let t_applied: f64 = 120.0;    // kN, applied tension per bolt
    let b_prime: f64 = 45.0;       // mm
    let a_prime: f64 = 35.0;       // mm
    let p_trib: f64 = 90.0;        // mm
    let t_f: f64 = 18.0;           // mm, flange thickness
    let fy: f64 = 345.0;           // MPa
    let phi_bending: f64 = 0.90;

    // --- Required flange thickness for no prying ---
    let t_req: f64 = (4.0 * t_applied * 1000.0 * b_prime / (phi_bending * p_trib * fy)).sqrt();
    let t_req_expected: f64 = (4.0_f64 * 120_000.0 * 45.0 / (0.90 * 90.0 * 345.0)).sqrt();
    assert_close(t_req, t_req_expected, 0.001, "t_req for no prying");

    // Verify numerical value
    assert_close(t_req, 27.81, 0.01, "t_req numerical");

    // --- Prying exists ---
    assert!(
        t_f < t_req,
        "Prying exists: t_f={:.1} mm < t_req={:.2} mm",
        t_f, t_req
    );

    // --- Prying ratio Q/T ---
    let ratio_qt: f64 = (a_prime / b_prime) * (1.0 - (t_f / t_req).powi(2));
    let ratio_expected: f64 = (35.0_f64 / 45.0) * (1.0 - (18.0_f64 / t_req_expected).powi(2));
    assert_close(ratio_qt, ratio_expected, 0.001, "Q/T ratio");

    // --- Prying force ---
    let q: f64 = ratio_qt * t_applied;
    let q_expected: f64 = ratio_expected * 120.0;
    assert_close(q, q_expected, 0.001, "Prying force Q");
    assert!(q > 0.0, "Prying force is positive");

    // --- Total bolt force ---
    let b_total: f64 = t_applied + q;
    let b_expected: f64 = 120.0 + q_expected;
    assert_close(b_total, b_expected, 0.001, "Total bolt force B");

    // --- Verify prying increases bolt demand ---
    assert!(
        b_total > t_applied,
        "B ({:.2} kN) > T ({:.2} kN)",
        b_total, t_applied
    );

    // --- With a thicker flange, prying decreases ---
    let t_f_thick: f64 = 25.0;
    let ratio_thick: f64 = (a_prime / b_prime) * (1.0 - (t_f_thick / t_req).powi(2));
    // Even at 25 mm < 27.81 mm, ratio should be smaller
    assert!(
        ratio_thick < ratio_qt,
        "Thicker flange reduces prying: {:.4} < {:.4}",
        ratio_thick, ratio_qt
    );

    // --- With t_f >= t_req, no prying ---
    let t_f_none: f64 = 30.0; // > t_req
    let ratio_none: f64 = (a_prime / b_prime) * (1.0 - (t_f_none / t_req).powi(2));
    // ratio would be negative => no prying (Q = 0)
    assert!(
        ratio_none < 0.0,
        "No prying when t_f > t_req: ratio = {:.4}",
        ratio_none
    );
}

// ================================================================
// 5. Eccentric Bolt Group — Elastic Method
// ================================================================
//
// 6-bolt group (3 rows x 2 columns):
//   Gauge g = 100 mm, Pitch s = 75 mm
//   Eccentric vertical load: V = 200 kN at e = 250 mm from centroid
//
// Bolt positions relative to centroid:
//   x = +/-50 mm (g/2)
//   y = -75, 0, +75 mm
//
// Sum of r^2:
//   Ix = sum(y_i^2) = 6 * [2*75^2 + 2*0^2] ... wait, 6 bolts
//   For each x-position (2 columns): y = {-75, 0, +75}
//   Iy = sum(x_i^2) = 6 * 50^2 = 15000 mm^2
//   Ix = sum(y_i^2) = 2*(75^2 + 0 + 75^2) = 2*11250 = 22500 mm^2
//   Ip = Ix + Iy = 22500 + 15000 = 37500 mm^2
//
// Direct shear: Fv = 200/6 = 33.33 kN (vertical, per bolt)
// Moment: M = 200 * 250 = 50,000 kN-mm
//
// Critical bolt at (+50, +75):
//   r = sqrt(50^2 + 75^2) = sqrt(8125) = 90.14 mm
//   Fm_x = M * y / Ip = 50000 * 75 / 37500 = 100 kN (horizontal)
//   Fm_y = M * x / Ip = 50000 * 50 / 37500 = 66.67 kN (vertical)
//
// Resultant: R = sqrt((Fm_x)^2 + (Fv + Fm_y)^2)
//            R = sqrt(100^2 + (33.33+66.67)^2) = sqrt(10000+10000) = 141.42 kN

#[test]
fn validation_conn_ext_5_eccentric_bolt_group() {
    let v: f64 = 200.0;            // kN, applied vertical load
    let e: f64 = 250.0;            // mm, eccentricity
    let _g: f64 = 100.0;           // mm, gauge
    let _s: f64 = 75.0;            // mm, pitch
    let n_bolts: f64 = 6.0;        // 3 rows x 2 columns

    // Bolt positions relative to centroid
    let bolts: [(f64, f64); 6] = [
        (-50.0, -75.0), (50.0, -75.0),
        (-50.0,   0.0), (50.0,   0.0),
        (-50.0,  75.0), (50.0,  75.0),
    ];

    // --- Verify centroid at origin ---
    let sum_x: f64 = bolts.iter().map(|b| b.0).sum();
    let sum_y: f64 = bolts.iter().map(|b| b.1).sum();
    assert_close(sum_x, 0.0, 0.01, "Centroid x");
    assert_close(sum_y, 0.0, 0.01, "Centroid y");

    // --- Polar moment of inertia ---
    let ix: f64 = bolts.iter().map(|b| b.1 * b.1).sum::<f64>();
    let iy: f64 = bolts.iter().map(|b| b.0 * b.0).sum::<f64>();
    let ip: f64 = ix + iy;

    assert_close(ix, 22500.0, 0.001, "Ix = sum(yi^2)");
    assert_close(iy, 15000.0, 0.001, "Iy = sum(xi^2)");
    assert_close(ip, 37500.0, 0.001, "Ip = Ix + Iy");

    // --- Direct shear ---
    let fv: f64 = v / n_bolts;
    assert_close(fv, 33.333, 0.01, "Direct shear per bolt");

    // --- Moment ---
    let m: f64 = v * e;
    assert_close(m, 50000.0, 0.001, "Moment M = V*e");

    // --- Critical bolt at (+50, +75) ---
    let x_crit: f64 = 50.0;
    let y_crit: f64 = 75.0;

    let r_crit: f64 = (x_crit * x_crit + y_crit * y_crit).sqrt();
    assert_close(r_crit, 90.14, 0.01, "Critical bolt distance");

    // Moment-induced forces (perpendicular to radius):
    // Horizontal component: Fm_x = M * y / Ip
    // Vertical component: Fm_y = M * x / Ip
    let fm_x: f64 = m * y_crit / ip;
    let fm_y: f64 = m * x_crit / ip;

    assert_close(fm_x, 100.0, 0.001, "Fm_x at critical bolt");
    assert_close(fm_y, 66.667, 0.01, "Fm_y at critical bolt");

    // --- Resultant on critical bolt ---
    // Direct shear is vertical (downward), moment shear adds
    let rx: f64 = fm_x;
    let ry: f64 = fv + fm_y;
    let r_bolt: f64 = (rx * rx + ry * ry).sqrt();

    assert_close(ry, 100.0, 0.01, "Ry at critical bolt");
    assert_close(r_bolt, (10000.0_f64 + 10000.0).sqrt(), 0.001, "Resultant force");
    assert_close(r_bolt, 141.42, 0.01, "R = 141.42 kN");

    // --- Center bolt has smaller resultant ---
    let fm_x_center: f64 = m * 0.0 / ip; // y = 0
    let fm_y_center: f64 = m * 50.0 / ip;
    let r_center: f64 = ((fm_x_center).powi(2) + (fv + fm_y_center).powi(2)).sqrt();
    assert!(
        r_center < r_bolt,
        "Center bolt ({:.2}) < corner bolt ({:.2})",
        r_center, r_bolt
    );
}

// ================================================================
// 6. Base Plate Bearing — AISC Design Guide 1
// ================================================================
//
// Column W250x73 on base plate:
//   Axial load: P_u = 1200 kN
//   Moment: M_u = 80 kN-m
//   Base plate: B = 350 mm, N = 450 mm
//   f'c = 30 MPa, phi_c = 0.65
//
// Eccentricity: e = M/P = 80*1000/1200 = 66.67 mm
// Kern: N/6 = 450/6 = 75 mm
// e < N/6 => full bearing (within kern)
//
// Bearing pressures (linear distribution):
//   f_avg = P / (B*N) = 1200*1000 / (350*450) = 7.619 MPa
//   f_max = f_avg * (1 + 6*e/N) = 7.619 * (1 + 6*66.67/450) = 7.619 * 1.889 = 14.39 MPa
//   f_min = f_avg * (1 - 6*e/N) = 7.619 * (1 - 0.889) = 7.619 * 0.111 = 0.847 MPa
//
// Allowable bearing: phi*0.85*f'c = 0.65*0.85*30 = 16.575 MPa
//   f_max = 14.39 < 16.575 => OK
//
// Required plate thickness (cantilever model):
//   m = (N - 0.95*d)/2 = (450 - 0.95*254)/2 = (450 - 241.3)/2 = 104.35 mm
//   n = (B - 0.80*b_f)/2 = (350 - 0.80*254)/2 = (350 - 203.2)/2 = 73.40 mm
//   critical = max(m, n) = 104.35 mm
//   t_req = critical * sqrt(2*f_max / (0.90*F_y))
//         = 104.35 * sqrt(2*14.39 / (0.90*250))
//         = 104.35 * sqrt(0.1279) = 104.35 * 0.3577 = 37.32 mm

#[test]
fn validation_conn_ext_6_base_plate_bearing() {
    let p_u: f64 = 1200.0;         // kN, factored axial load
    let m_u: f64 = 80.0;           // kN-m, factored moment
    let b_plate: f64 = 350.0;      // mm
    let n_plate: f64 = 450.0;      // mm
    let fc: f64 = 30.0;            // MPa
    let fy_plate: f64 = 250.0;     // MPa, plate yield stress
    let phi_c: f64 = 0.65;
    let phi_b: f64 = 0.90;
    let d_col: f64 = 254.0;        // mm, column depth (W250)
    let bf_col: f64 = 254.0;       // mm, column flange width

    // --- Eccentricity ---
    let e: f64 = m_u * 1000.0 / p_u;
    assert_close(e, 66.667, 0.01, "Eccentricity e = M/P");

    // --- Kern distance ---
    let kern: f64 = n_plate / 6.0;
    assert_close(kern, 75.0, 0.001, "Kern N/6");

    // --- Within kern check ---
    assert!(
        e < kern,
        "Within kern: e={:.2} mm < N/6={:.2} mm",
        e, kern
    );

    // --- Average bearing pressure ---
    let f_avg: f64 = p_u * 1000.0 / (b_plate * n_plate);
    assert_close(f_avg, 7.619, 0.01, "f_avg = P/(B*N)");

    // --- Maximum and minimum bearing ---
    let f_max: f64 = f_avg * (1.0 + 6.0 * e / n_plate);
    let f_min: f64 = f_avg * (1.0 - 6.0 * e / n_plate);

    assert!(f_min > 0.0, "Full bearing: f_min > 0");

    // --- Allowable bearing ---
    let f_allow: f64 = phi_c * 0.85 * fc;
    assert_close(f_allow, 16.575, 0.001, "Allowable bearing");
    assert!(
        f_max < f_allow,
        "Bearing OK: f_max={:.2} < f_allow={:.2} MPa",
        f_max, f_allow
    );

    // --- Cantilever projections ---
    let m_proj: f64 = (n_plate - 0.95 * d_col) / 2.0;
    let n_proj: f64 = (b_plate - 0.80 * bf_col) / 2.0;
    assert_close(m_proj, 104.35, 0.01, "Cantilever m");
    assert_close(n_proj, 73.40, 0.01, "Cantilever n");

    let critical: f64 = m_proj.max(n_proj);
    assert_close(critical, m_proj, 0.001, "m governs");

    // --- Required plate thickness ---
    let t_req: f64 = critical * (2.0 * f_max / (phi_b * fy_plate)).sqrt();
    // Compute expected from formula
    let t_req_expected: f64 = m_proj * (2.0 * f_max / (0.90 * 250.0)).sqrt();
    assert_close(t_req, t_req_expected, 0.001, "Required plate thickness");
    assert!(t_req > 0.0, "Plate thickness is positive");
    assert!(t_req < 100.0, "Plate thickness is reasonable (< 100 mm)");

    // --- Higher load requires thicker plate ---
    let p_high: f64 = 2000.0;
    let f_avg_high: f64 = p_high * 1000.0 / (b_plate * n_plate);
    let f_max_high: f64 = f_avg_high * (1.0 + 6.0 * e / n_plate);
    let t_req_high: f64 = critical * (2.0 * f_max_high / (phi_b * fy_plate)).sqrt();
    assert!(
        t_req_high > t_req,
        "Higher load -> thicker plate: {:.2} > {:.2}",
        t_req_high, t_req
    );
}

// ================================================================
// 7. Moment End Plate — Bolt Forces from Moment Couple
// ================================================================
//
// Extended end plate connection (AISC DG 4):
//   Beam: W460x74 (d = 457 mm, t_f = 14.5 mm, b_f = 190 mm)
//   Applied moment: M_u = 350 kN-m
//
// Bolt rows in tension zone:
//   Row 1: outside flange, d_1 = 457 + 50 = 507 mm from compression flange
//   Row 2: inside flange, d_2 = 457 - 14.5 - 50 = 392.5 mm from comp. flange
//   (Measured from center of compression flange)
//
// Bolt tension from moment (linear distribution, neutral axis at comp. flange):
//   sum(d_i^2) = 507^2 + 392.5^2 = 257049 + 154056 = 411105 mm^2
//
//   T_1 = M * d_1 / sum(d_i^2) = 350e6 * 507 / 411105 = 431,527 N = 431.53 kN (per row)
//   T_2 = M * d_2 / sum(d_i^2) = 350e6 * 392.5 / 411105 = 334,077 N = 334.08 kN (per row)
//
// Per bolt (2 bolts per row):
//   B_1 = 431.53 / 2 = 215.76 kN
//   B_2 = 334.08 / 2 = 167.04 kN
//
// Equilibrium check: sum(T_i * d_i) = M
//   431527 * 507 + 334077 * 392.5 = 218,784,189 + 131,125,225 = 349,909,414 ≈ 350e6 N-mm

#[test]
fn validation_conn_ext_7_moment_end_plate() {
    let d_beam: f64 = 457.0;       // mm, beam depth
    let tf: f64 = 14.5;            // mm, flange thickness
    let m_u: f64 = 350.0;          // kN-m, factored moment

    // Bolt row distances from compression flange center
    let d_1: f64 = d_beam + 50.0;          // 507 mm, outside tension flange
    let d_2: f64 = d_beam - tf - 50.0;     // 392.5 mm, inside tension flange
    assert_close(d_1, 507.0, 0.001, "d_1 outside flange bolt row");
    assert_close(d_2, 392.5, 0.001, "d_2 inside flange bolt row");

    // --- Sum of d_i^2 ---
    let sum_d2: f64 = d_1 * d_1 + d_2 * d_2;
    let sum_d2_expected: f64 = 507.0 * 507.0 + 392.5 * 392.5;
    assert_close(sum_d2, sum_d2_expected, 0.001, "sum(d_i^2)");

    // --- Bolt row tensions ---
    let m_nmm: f64 = m_u * 1e6; // N-mm
    let t_1: f64 = m_nmm * d_1 / sum_d2 / 1000.0; // kN per row
    let t_2: f64 = m_nmm * d_2 / sum_d2 / 1000.0; // kN per row

    let t_1_expected: f64 = 350.0e6 * 507.0 / sum_d2_expected / 1000.0;
    let t_2_expected: f64 = 350.0e6 * 392.5 / sum_d2_expected / 1000.0;
    assert_close(t_1, t_1_expected, 0.001, "T_1 outer bolt row");
    assert_close(t_2, t_2_expected, 0.001, "T_2 inner bolt row");

    // --- Per bolt (2 bolts per row) ---
    let b_1: f64 = t_1 / 2.0;
    let b_2: f64 = t_2 / 2.0;

    assert!(
        b_1 > b_2,
        "Outer bolts more stressed: {:.2} > {:.2} kN",
        b_1, b_2
    );

    // --- Equilibrium check: sum(T_i * d_i) ≈ M ---
    let m_check: f64 = (t_1 * 1000.0 * d_1 + t_2 * 1000.0 * d_2) / 1e6; // kN-m
    assert_close(m_check, m_u, 0.001, "Moment equilibrium");

    // --- Total tension force ---
    let t_total: f64 = t_1 + t_2;

    // Simple estimate: T ≈ M / d_avg
    let d_avg: f64 = (d_1 + d_2) / 2.0;
    let t_simple: f64 = m_u * 1000.0 / d_avg; // kN
    // Not exact (weighted vs. simple average) but in the same ballpark
    assert!(
        (t_total - t_simple).abs() / t_total < 0.10,
        "Total tension ({:.2} kN) close to simple estimate ({:.2} kN)",
        t_total, t_simple
    );

    // --- Adding a third bolt row increases capacity for same moment ---
    let d_3: f64 = d_beam - tf - 125.0; // additional inner row, 317.5 mm
    let sum_d2_3: f64 = d_1 * d_1 + d_2 * d_2 + d_3 * d_3;
    let t_1_3row: f64 = m_nmm * d_1 / sum_d2_3 / 1000.0;
    assert!(
        t_1_3row < t_1,
        "Third row reduces bolt force: {:.2} < {:.2} kN",
        t_1_3row, t_1
    );
}

// ================================================================
// 8. Bracing Gusset — Whitmore Section, Block Shear, Buckling
// ================================================================
//
// Gusset plate for diagonal brace:
//   Brace force: P = 500 kN (compression or tension)
//   Gusset plate: t = 12 mm, F_y = 345 MPa, F_u = 450 MPa
//   Bolt pattern: 2 rows, 4 bolts per row
//   Gauge g = 80 mm, Pitch s = 70 mm
//   Bolt diameter d = 20 mm, hole d_h = 22 mm
//   Edge distance: L_ev = 40 mm (vertical), L_eh = 35 mm (horizontal)
//
// Whitmore width (30-degree spread):
//   L_conn = (n_per_row - 1) * s = 3 * 70 = 210 mm
//   L_w = 2 * L_conn * tan(30) + g = 2*210*0.5774 + 80 = 242.5 + 80 = 322.5 mm
//
// Whitmore section yielding:
//   R_n_whitmore = F_y * L_w * t = 345 * 322.5 * 12 = 1,334,550 N = 1334.6 kN
//   phi*R_n = 0.90 * 1334.6 = 1201.1 kN
//
// Block shear (2 shear planes + 1 tension plane):
//   Shear length: L_v = L_ev + L_conn = 40 + 210 = 250 mm
//   A_gv = 2 * t * L_v = 2 * 12 * 250 = 6000 mm^2
//   A_nv = A_gv - 2*t*(3.5*d_h) = 6000 - 2*12*77 = 6000 - 1848 = 4152 mm^2
//   A_nt = t * (g - d_h) = 12 * (80 - 22) = 696 mm^2
//
//   R_n_yield = 0.60*F_y*A_gv + 1.0*F_u*A_nt = 0.60*345*6000 + 450*696
//             = 1,242,000 + 313,200 = 1,555,200 N = 1555.2 kN
//   R_n_rupture = 0.60*F_u*A_nv + 1.0*F_u*A_nt = 0.60*450*4152 + 450*696
//               = 1,121,040 + 313,200 = 1,434,240 N = 1434.2 kN
//   R_n_bs = min(1555.2, 1434.2) = 1434.2 kN
//   phi*R_n_bs = 0.75 * 1434.2 = 1075.7 kN
//
// Gusset buckling (average Whitmore width method):
//   Unbraced length (Thornton): L_b = average of L1, L2, L3
//   Simplified: L_b ≈ 300 mm
//   KL/r = 0.65 * L_b / (t/sqrt(12)) = 0.65*300/(12/3.464) = 195/3.464 = 56.3
//   F_cr ≈ F_y for KL/r < 60 (approximate from AISC column curves)

#[test]
fn validation_conn_ext_8_bracing_gusset() {
    let t_gusset: f64 = 12.0;      // mm
    let fy: f64 = 345.0;           // MPa
    let fu: f64 = 450.0;           // MPa
    let g: f64 = 80.0;             // mm, gauge
    let s: f64 = 70.0;             // mm, pitch
    let n_per_row: f64 = 4.0;
    let d_hole: f64 = 22.0;        // mm
    let l_ev: f64 = 40.0;          // mm, vertical edge distance
    let ubs: f64 = 1.0;

    // --- Connection length ---
    let l_conn: f64 = (n_per_row - 1.0) * s;
    assert_close(l_conn, 210.0, 0.001, "Connection length");

    // --- Whitmore width ---
    let l_w: f64 = 2.0 * l_conn * (30.0_f64 * PI / 180.0).tan() + g;
    let tan_30: f64 = (PI / 6.0).tan();
    let l_w_expected: f64 = 2.0 * 210.0 * tan_30 + 80.0;
    assert_close(l_w, l_w_expected, 0.001, "Whitmore width");

    // --- Whitmore section tensile yielding ---
    let rn_whitmore: f64 = fy * l_w * t_gusset / 1000.0; // kN
    let phi_rn_whitmore: f64 = 0.90 * rn_whitmore;
    assert!(phi_rn_whitmore > 0.0, "Whitmore yielding capacity positive");

    // --- Block shear ---
    let l_v: f64 = l_ev + l_conn; // shear length per plane
    assert_close(l_v, 250.0, 0.001, "Shear length");

    let a_gv: f64 = 2.0 * t_gusset * l_v;
    assert_close(a_gv, 6000.0, 0.001, "A_gv");

    // Net shear: 3.5 holes per shear plane (for 4 bolts: 3 spaces + 0.5 end)
    let a_nv: f64 = a_gv - 2.0 * t_gusset * 3.5 * d_hole;
    assert_close(a_nv, 6000.0 - 2.0 * 12.0 * 77.0, 0.01, "A_nv");

    // Net tension area: 1 hole deducted
    let a_nt: f64 = t_gusset * (g - d_hole);
    assert_close(a_nt, 696.0, 0.001, "A_nt");

    // Block shear: yield path
    let rn_yield: f64 = (0.60 * fy * a_gv + ubs * fu * a_nt) / 1000.0;
    // Block shear: rupture path
    let rn_rupture: f64 = (0.60 * fu * a_nv + ubs * fu * a_nt) / 1000.0;
    let rn_bs: f64 = rn_rupture.min(rn_yield);

    assert!(
        rn_rupture < rn_yield,
        "Rupture path ({:.1}) governs over yield path ({:.1})",
        rn_rupture, rn_yield
    );

    let phi_rn_bs: f64 = 0.75 * rn_bs;
    assert!(phi_rn_bs > 0.0, "Block shear capacity positive");

    // --- Gusset buckling check ---
    let lb: f64 = 300.0;           // mm, approximate unbraced length
    let k: f64 = 0.65;             // effective length factor (compact gusset)
    let r_gyration: f64 = t_gusset / (12.0_f64).sqrt(); // radius of gyration of plate
    let kl_r: f64 = k * lb / r_gyration;
    assert_close(r_gyration, 12.0 / 3.4641, 0.01, "Radius of gyration");

    // For KL/r ≈ 56, gusset buckling capacity is significant but less than yield
    assert!(
        kl_r > 0.0 && kl_r < 200.0,
        "KL/r = {:.1} is reasonable",
        kl_r
    );

    // Euler buckling stress (upper bound comparison)
    let fe: f64 = PI * PI * 200_000.0 / (kl_r * kl_r); // MPa, using E = 200 GPa
    assert!(
        fe > fy,
        "Fe={:.1} > Fy={:.1}: inelastic buckling region",
        fe, fy
    );

    // AISC column curve (inelastic region: KL/r < 4.71*sqrt(E/Fy)):
    let transition: f64 = 4.71 * (200_000.0 / fy).sqrt();
    assert!(
        kl_r < transition,
        "KL/r={:.1} < transition={:.1}: use inelastic formula",
        kl_r, transition
    );

    // Fcr = 0.658^(Fy/Fe) * Fy
    let fcr: f64 = 0.658_f64.powf(fy / fe) * fy;
    assert!(fcr > 0.0 && fcr < fy, "Fcr={:.1} < Fy={:.1}", fcr, fy);

    // Buckling capacity of Whitmore section
    let pn_buckling: f64 = fcr * l_w * t_gusset / 1000.0; // kN
    let phi_pn_buckling: f64 = 0.90 * pn_buckling;

    // --- Controlling capacity ---
    let controlling: f64 = phi_rn_whitmore.min(phi_rn_bs).min(phi_pn_buckling);
    assert!(
        controlling > 0.0,
        "Controlling gusset capacity: {:.1} kN",
        controlling
    );
}
