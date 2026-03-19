/// Validation: Advanced Structural Steel Design Benchmarks
///
/// References:
///   - AISC 360-22 (Specification for Structural Steel Buildings)
///   - EN 1993-1-1:2005 (Eurocode 3: Design of Steel Structures)
///   - Segui: "Steel Design" 6th ed.
///   - Salmon, Johnson, Malhas: "Steel Structures: Design and Behavior" 5th ed.
///
/// Tests verify AISC/EC3 steel design formulas against hand-computed expected
/// values. Test 8 uses the solver for deflection serviceability verification.

use dedaliano_engine::solver::linear;
use crate::common::*;

// ================================================================
// Tolerance helper (local, matches existing steel design test pattern)
// ================================================================

fn assert_close_local(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err = if expected.abs() < 1e-12 {
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
// 1. Compact Beam Moment Capacity: M_n = M_p = Z_x * F_y
// ================================================================
//
// AISC F2.1: For a compact I-section bent about the strong axis with
// adequate lateral bracing (L_b <= L_p), the nominal flexural strength
// is the full plastic moment M_p = F_y * Z_x.
//
// Section: W24x68 (A992 steel)
//   Z_x = 4010 cm^3 = 4010e3 mm^3 (AISC Table 1-1 approx)
//   F_y = 345 MPa
//
// M_p = 345 * 4010e3 = 1,383.45e6 N*mm = 1383.45 kN*m
//
// Verify that M_n = M_p for a compact section with L_b <= L_p.

#[test]
fn validation_steel_ext_1_compact_beam_moment() {
    let fz: f64 = 345.0; // MPa, A992 steel
    let zx: f64 = 4010e3; // mm^3, W24x68 plastic section modulus

    // Compact section: M_n = M_p = F_y * Z_x
    let mp: f64 = fz * zx; // N*mm
    let mp_knm: f64 = mp / 1e6; // kN*m

    let expected_mp: f64 = 1383.45; // kN*m
    assert_close_local(mp_knm, expected_mp, 0.01, "M_p = F_y * Z_x (W24x68)");

    // Also verify shape factor (Z_x / S_x > 1.0 for I-shapes)
    let sx: f64 = 3540e3; // mm^3, elastic section modulus W24x68 approx
    let shape_factor: f64 = zx / sx;
    assert!(
        shape_factor > 1.0 && shape_factor < 1.3,
        "Shape factor Z/S = {:.3} should be between 1.0 and 1.3 for I-shapes",
        shape_factor
    );

    // Verify elastic moment
    let my: f64 = fz * sx / 1e6; // kN*m
    assert!(
        mp_knm > my,
        "M_p = {:.1} > M_y = {:.1} (plastic > elastic)",
        mp_knm, my
    );
}

// ================================================================
// 2. LTB Unbraced Length: M_n Reduction (Inelastic + Elastic Zones)
// ================================================================
//
// AISC F2: As L_b increases beyond L_p, M_n is reduced.
//
// W18x50: Z_x = 1702 cm^3, S_x = 1506 cm^3 (approx in mm^3)
//   F_y = 345 MPa, E = 200000 MPa
//   L_p = 2200 mm, L_r = 6300 mm
//
// Case A: L_b = 2200 mm (= L_p) -> M_n = M_p (full plastic)
// Case B: L_b = 4000 mm (inelastic LTB, L_p < L_b < L_r)
//   M_n = C_b * [M_p - (M_p - 0.7*F_y*S_x) * (L_b - L_p)/(L_r - L_p)] <= M_p
//   With C_b = 1.0 (uniform moment):
//     M_p = 345 * 1702e3 = 587.19e6 N*mm
//     0.7*F_y*S_x = 0.7*345*1506e3 = 363.198e6 N*mm
//     M_n = 587.19e6 - (587.19e6 - 363.198e6)*(4000-2200)/(6300-2200)
//         = 587.19e6 - 223.992e6 * 1800/4100
//         = 587.19e6 - 98.289e6
//         = 488.901e6 N*mm = 488.90 kN*m
// Case C: L_b = 9000 mm (elastic LTB, L_b > L_r)
//   M_n = F_cr * S_x with F_cr = C_b*pi^2*E/(L_b/r_ts)^2 * sqrt(1+0.078*J*c/(S_x*h_o)*(L_b/r_ts)^2)
//   Simplified for this test: use the elastic buckling formula
//   F_cr = pi^2 * E / (L_b/r_ts)^2 (conservative, ignoring warping enhancement)
//   With r_ts = 52 mm (approx for W18x50):
//     (L_b/r_ts)^2 = (9000/52)^2 = 29952.66
//     F_cr = pi^2 * 200000 / 29952.66 = 65.88 MPa
//     M_n = 65.88 * 1506e3 = 99.22e6 N*mm = 99.22 kN*m

#[test]
fn validation_steel_ext_2_ltb_unbraced_length() {
    let fz: f64 = 345.0;
    let zx: f64 = 1702e3; // mm^3
    let sx: f64 = 1506e3; // mm^3
    let lp: f64 = 2200.0; // mm
    let lr: f64 = 6300.0; // mm
    let e: f64 = 200_000.0; // MPa
    let r_ts: f64 = 52.0; // mm, radius of gyration for LTB

    let mp: f64 = fz * zx; // N*mm

    // Case A: L_b = L_p -> M_n = M_p
    let mn_a: f64 = mp;
    let expected_a: f64 = 587.19; // kN*m
    assert_close_local(mn_a / 1e6, expected_a, 0.01, "M_n at L_b = L_p (full plastic)");

    // Case B: Inelastic LTB, L_b = 4000 mm, C_b = 1.0
    let lb_b: f64 = 4000.0;
    let cb: f64 = 1.0;
    let mr: f64 = 0.7 * fz * sx;
    let mn_b_raw: f64 = cb * (mp - (mp - mr) * (lb_b - lp) / (lr - lp));
    let mn_b: f64 = mn_b_raw.min(mp);

    let expected_b: f64 = mp / 1e6 - (mp - mr) / 1e6 * (lb_b - lp) / (lr - lp);
    assert_close_local(mn_b / 1e6, expected_b, 0.01, "Inelastic LTB M_n");

    // M_n should be between M_r and M_p
    assert!(
        mn_b > mr && mn_b < mp,
        "Inelastic zone: M_r < M_n < M_p: {:.0} < {:.0} < {:.0}",
        mr, mn_b, mp
    );

    // Case C: Elastic LTB, L_b = 9000 mm
    let lb_c: f64 = 9000.0;
    let lb_rts_sq: f64 = (lb_c / r_ts).powi(2);
    let fcr: f64 = std::f64::consts::PI.powi(2) * e / lb_rts_sq;
    let mn_c: f64 = (fcr * sx).min(mp);

    // M_n should be less than inelastic zone value
    assert!(
        mn_c < mn_b,
        "Elastic LTB M_n ({:.0}) < Inelastic LTB M_n ({:.0})",
        mn_c, mn_b
    );

    // F_cr should be less than 0.7*F_y (elastic range)
    assert!(
        fcr < 0.7 * fz,
        "F_cr = {:.1} < 0.7*F_y = {:.1} (elastic LTB)",
        fcr, 0.7 * fz
    );
}

// ================================================================
// 3. AISC Column Curve: Phi_c * P_n vs Slenderness KL/r
// ================================================================
//
// AISC E3: Flexural buckling of columns
//   F_e = pi^2 * E / (KL/r)^2
//
//   If KL/r <= 4.71*sqrt(E/F_y):
//     F_cr = 0.658^(F_y/F_e) * F_y   (inelastic buckling)
//   Else:
//     F_cr = 0.877 * F_e              (elastic buckling)
//
//   P_n = F_cr * A_g
//   phi_c = 0.90
//
// Example: W14x82, A_g = 15550 mm^2, r_min = 63.0 mm
//   KL = 5000 mm (K=1.0, L=5000 mm)
//   KL/r = 5000/63 = 79.37
//   Transition: 4.71*sqrt(200000/345) = 113.43
//   79.37 < 113.43 -> inelastic
//   F_e = pi^2*200000/79.37^2 = 313.27 MPa
//   F_cr = 0.658^(345/313.27) * 345 = 0.658^1.1014 * 345
//        = 0.6165 * 345 = 212.70 MPa
//   P_n = 212.70 * 15550 = 3,307,485 N
//   phi*P_n = 0.90 * 3307.5 = 2976.7 kN

#[test]
fn validation_steel_ext_3_column_curve() {
    let e: f64 = 200_000.0; // MPa
    let fz: f64 = 345.0; // MPa
    let ag: f64 = 15_550.0; // mm^2, W14x82
    let r_min: f64 = 63.0; // mm
    let kl: f64 = 5000.0; // mm
    let phi_c: f64 = 0.90;

    let slenderness: f64 = kl / r_min;
    let transition: f64 = 4.71 * (e / fz).sqrt();

    // Verify slenderness classification
    assert!(
        slenderness < transition,
        "KL/r = {:.1} < {:.1} -> inelastic buckling",
        slenderness, transition
    );

    // Euler stress
    let fe: f64 = std::f64::consts::PI.powi(2) * e / (slenderness * slenderness);

    // Critical stress (inelastic)
    let fcr: f64 = 0.658_f64.powf(fz / fe) * fz;

    // Nominal capacity
    let pn: f64 = fcr * ag / 1e3; // kN
    let phi_pn: f64 = phi_c * pn;

    // Hand calculation verification
    let expected_fe: f64 = std::f64::consts::PI.powi(2) * 200_000.0 / (79.365 * 79.365);
    assert_close_local(fe, expected_fe, 0.01, "Euler stress F_e");

    assert!(
        fcr < fz,
        "F_cr = {:.1} < F_y = {:.1} (buckling reduces capacity)",
        fcr, fz
    );

    assert!(
        phi_pn > 2000.0 && phi_pn < 4000.0,
        "phi*P_n = {:.1} kN should be reasonable for W14x82",
        phi_pn
    );

    // Also verify elastic buckling regime (high slenderness)
    let kl_long: f64 = 12000.0; // mm
    let slenderness_long: f64 = kl_long / r_min;
    assert!(
        slenderness_long > transition,
        "KL/r = {:.1} > {:.1} -> elastic buckling",
        slenderness_long, transition
    );

    let fe_long: f64 = std::f64::consts::PI.powi(2) * e / (slenderness_long * slenderness_long);
    let fcr_long: f64 = 0.877 * fe_long;
    let pn_long: f64 = fcr_long * ag / 1e3;

    // Elastic regime should give lower capacity
    assert!(
        pn_long < pn,
        "Elastic P_n = {:.1} < Inelastic P_n = {:.1}",
        pn_long, pn
    );
}

// ================================================================
// 4. Web Shear Buckling: V_n = 0.6*F_y*A_w*C_v (Slender Web)
// ================================================================
//
// AISC G2: For webs with h/tw > 1.10*sqrt(k_v*E/F_y):
//   C_v2 = 1.10*sqrt(k_v*E/F_y) / (h/tw)  (inelastic buckling)
// For h/tw > 1.37*sqrt(k_v*E/F_y):
//   C_v2 = 1.51*k_v*E / ((h/tw)^2 * F_y)  (elastic buckling)
//
// Built-up girder: d = 1200 mm, tw = 8 mm, h/tw = 150
//   k_v = 5.34 (unstiffened web), F_y = 345 MPa, E = 200000 MPa
//   A_w = d * tw = 9600 mm^2
//
//   1.10*sqrt(k_v*E/F_y) = 1.10*sqrt(5.34*200000/345) = 1.10*55.62 = 61.18
//   1.37*sqrt(k_v*E/F_y) = 1.37*55.62 = 76.20
//   h/tw = 150 > 76.20 -> elastic buckling
//   C_v2 = 1.51 * 5.34 * 200000 / (150^2 * 345) = 1,613,880 / 7,762,500 = 0.2079
//   V_n = 0.6 * 345 * 9600 * 0.2079 = 413,288 N = 413.29 kN

#[test]
fn validation_steel_ext_4_web_shear_buckling() {
    let fz: f64 = 345.0; // MPa
    let e: f64 = 200_000.0; // MPa
    let d: f64 = 1200.0; // mm, depth
    let tw: f64 = 8.0; // mm, web thickness
    let kv: f64 = 5.34; // unstiffened web

    let h_tw: f64 = d / tw; // = 150
    let aw: f64 = d * tw; // mm^2

    // Slenderness limits
    let limit_inelastic: f64 = 1.10 * (kv * e / fz).sqrt();
    let limit_elastic: f64 = 1.37 * (kv * e / fz).sqrt();

    // Classify web
    assert!(
        h_tw > limit_elastic,
        "h/tw = {:.0} > {:.1} -> elastic shear buckling",
        h_tw, limit_elastic
    );

    // Shear coefficient for elastic buckling
    let cv2: f64 = 1.51 * kv * e / (h_tw * h_tw * fz);

    assert!(
        cv2 < 1.0,
        "C_v2 = {:.4} < 1.0 (reduced shear capacity)",
        cv2
    );

    // Nominal shear strength
    let vn: f64 = 0.6 * fz * aw * cv2;
    let vn_kn: f64 = vn / 1e3;

    // Expected from hand calculation
    let expected_cv2: f64 = 1.51 * 5.34 * 200_000.0 / (150.0 * 150.0 * 345.0);
    let expected_vn: f64 = 0.6 * 345.0 * 9600.0 * expected_cv2 / 1e3;
    assert_close_local(vn_kn, expected_vn, 0.01, "V_n elastic shear buckling");

    // Also check: non-slender web (C_v = 1.0)
    let tw_thick: f64 = 20.0;
    let h_tw_thick: f64 = d / tw_thick; // = 60
    assert!(
        h_tw_thick < limit_inelastic,
        "h/tw = {:.0} < {:.1} -> C_v = 1.0 (no buckling)",
        h_tw_thick, limit_inelastic
    );

    let vn_thick: f64 = 0.6 * fz * d * tw_thick * 1.0 / 1e3;
    assert!(
        vn_thick > vn_kn,
        "Thick web V_n = {:.0} > Slender web V_n = {:.0}",
        vn_thick, vn_kn
    );
}

// ================================================================
// 5. AISC H1-1 Interaction: Combined Axial + Bending
// ================================================================
//
// AISC H1-1a: When P_r/P_c >= 0.2:
//   P_r/P_c + (8/9)*(M_rx/M_cx + M_ry/M_cy) <= 1.0
//
// AISC H1-1b: When P_r/P_c < 0.2:
//   P_r/(2*P_c) + (M_rx/M_cx + M_ry/M_cy) <= 1.0
//
// Case A (H1-1b applies, P_r/P_c < 0.2):
//   P_r = 200 kN, P_c = 2000 kN (P_r/P_c = 0.10 < 0.2)
//   M_rx = 300 kN*m, M_cx = 600 kN*m
//   M_ry = 50 kN*m, M_cy = 200 kN*m
//   Interaction = 200/(2*2000) + (300/600 + 50/200)
//               = 0.05 + (0.50 + 0.25) = 0.05 + 0.75 = 0.80 <= 1.0 OK
//
// Case B (H1-1a applies, P_r/P_c >= 0.2):
//   P_r = 800 kN, P_c = 2000 kN (P_r/P_c = 0.40 >= 0.2)
//   M_rx = 200 kN*m, M_cx = 600 kN*m
//   M_ry = 40 kN*m, M_cy = 200 kN*m
//   Interaction = 0.40 + (8/9)*(200/600 + 40/200)
//               = 0.40 + 0.889*(0.333 + 0.20)
//               = 0.40 + 0.889*0.533 = 0.40 + 0.474 = 0.874 <= 1.0 OK

#[test]
fn validation_steel_ext_5_interaction_h1_1() {
    // Helper: AISC H1-1 interaction check
    let h1_interaction = |pr: f64, pc: f64, mrx: f64, mcx: f64, mry: f64, mcy: f64| -> f64 {
        let ratio = pr / pc;
        if ratio >= 0.2 {
            // H1-1a
            ratio + (8.0 / 9.0) * (mrx / mcx + mry / mcy)
        } else {
            // H1-1b
            pr / (2.0 * pc) + (mrx / mcx + mry / mcy)
        }
    };

    // Case A: P_r/P_c < 0.2 (H1-1b governs)
    let ia = h1_interaction(200.0, 2000.0, 300.0, 600.0, 50.0, 200.0);
    let expected_ia: f64 = 0.05 + 0.50 + 0.25;
    assert_close_local(ia, expected_ia, 0.01, "H1-1b interaction (low axial)");
    assert!(ia <= 1.0, "Case A passes: interaction = {:.3} <= 1.0", ia);

    // Verify correct equation selected
    assert!(
        200.0 / 2000.0 < 0.2,
        "P_r/P_c = {:.2} < 0.2 -> H1-1b",
        200.0 / 2000.0
    );

    // Case B: P_r/P_c >= 0.2 (H1-1a governs)
    let ib = h1_interaction(800.0, 2000.0, 200.0, 600.0, 40.0, 200.0);
    let expected_ib: f64 = 0.40 + (8.0 / 9.0) * (200.0 / 600.0 + 40.0 / 200.0);
    assert_close_local(ib, expected_ib, 0.01, "H1-1a interaction (high axial)");
    assert!(ib <= 1.0, "Case B passes: interaction = {:.3} <= 1.0", ib);

    // Case C: Failing check (over-stressed)
    let ic = h1_interaction(1500.0, 2000.0, 400.0, 600.0, 100.0, 200.0);
    assert!(
        ic > 1.0,
        "Case C fails: interaction = {:.3} > 1.0 (over-stressed)",
        ic
    );
}

// ================================================================
// 6. Base Plate Design: Required Thickness from Bearing Pressure
// ================================================================
//
// AISC Design Guide 1: Column base plates
//
// The required base plate thickness for a concentrically loaded column:
//   t_p = l * sqrt(2*f_p / (0.9*F_y))
//
// where:
//   f_p = P_u / (B*N) = bearing pressure (factored)
//   l = max(m, n, lambda*n') = critical cantilever dimension
//   m = (N - 0.95*d) / 2
//   n = (B - 0.80*b_f) / 2
//
// Column: W14x82, d = 363 mm, b_f = 257 mm
// Base plate: N = 500 mm, B = 450 mm
// F_y(plate) = 250 MPa, P_u = 2000 kN
//
//   f_p = 2000e3 / (450*500) = 8.889 MPa
//   m = (500 - 0.95*363) / 2 = (500 - 344.85)/2 = 77.575 mm
//   n = (450 - 0.80*257) / 2 = (450 - 205.6)/2 = 122.2 mm
//   l = max(m, n) = 122.2 mm (ignoring lambda*n' for simplicity)
//   t_p = 122.2 * sqrt(2*8.889 / (0.9*250))
//        = 122.2 * sqrt(17.778 / 225)
//        = 122.2 * sqrt(0.07901)
//        = 122.2 * 0.2811 = 34.35 mm

#[test]
fn validation_steel_ext_6_base_plate_design() {
    let d_col: f64 = 363.0; // mm, column depth W14x82
    let bf_col: f64 = 257.0; // mm, column flange width
    let n_plate: f64 = 500.0; // mm, plate length (along column depth)
    let b_plate: f64 = 450.0; // mm, plate width (along column flange)
    let fy_plate: f64 = 250.0; // MPa, plate steel
    let pu: f64 = 2000e3; // N, factored axial load

    // Bearing pressure
    let fp: f64 = pu / (b_plate * n_plate);
    let expected_fp: f64 = 2_000_000.0 / (450.0 * 500.0);
    assert_close_local(fp, expected_fp, 0.001, "Bearing pressure f_p");

    // Critical cantilever dimensions
    let m: f64 = (n_plate - 0.95 * d_col) / 2.0;
    let n: f64 = (b_plate - 0.80 * bf_col) / 2.0;
    let l: f64 = m.max(n);

    assert_close_local(m, 77.575, 0.01, "Cantilever m");
    assert_close_local(n, 122.2, 0.01, "Cantilever n");
    assert!(
        l == n,
        "n = {:.1} governs over m = {:.1}",
        n, m
    );

    // Required plate thickness
    let tp: f64 = l * (2.0 * fp / (0.9 * fy_plate)).sqrt();

    // Verify step by step
    let inner: f64 = 2.0 * fp / (0.9 * fy_plate);
    let expected_tp: f64 = l * inner.sqrt();
    assert_close_local(tp, expected_tp, 0.001, "Base plate thickness t_p");

    // Thickness should be practical (25-50 mm range)
    assert!(
        tp > 20.0 && tp < 60.0,
        "t_p = {:.1} mm should be practical range",
        tp
    );

    // Verify bearing stress is below concrete bearing capacity
    // f_p should be reasonable (< 0.85*f'c for typical concrete)
    let fc_prime: f64 = 30.0; // MPa, concrete strength
    let phi_bearing: f64 = 0.65;
    let bearing_capacity: f64 = phi_bearing * 0.85 * fc_prime;
    assert!(
        fp < bearing_capacity,
        "f_p = {:.2} < phi*0.85*f'c = {:.2} MPa",
        fp, bearing_capacity
    );
}

// ================================================================
// 7. Bolted Moment Connection: Bolt Group Capacity
// ================================================================
//
// Moment connection with bolt group subject to moment + shear.
//
// Configuration: 4 rows of 2 bolts each (8 bolts total)
//   Bolt: M20, A325/8.8, diameter = 20 mm
//   Bolt center spacing (gage): g = 140 mm
//   Row positions from centroid: y1 = 225 mm, y2 = 75 mm
//                                 y3 = -75 mm, y4 = -225 mm
//   Applied moment M = 200 kN*m, Shear V = 100 kN
//
// Bolt forces from moment:
//   sum(y_i^2) = 2*(225^2 + 75^2 + 75^2 + 225^2) = 2*(50625+5625+5625+50625) = 225000 mm^2
//   F_max = M * y_max / sum(y_i^2)
//         = 200e6 * 225 / 225000 = 200000 N = 200 kN (per bolt pair -> 100 kN per bolt)
//
// Wait - for n_bolts_per_row = 2:
//   sum(y_i^2) for all bolts = 2*(225^2 + 75^2 + 75^2 + 225^2) = 225000 mm^2
//   F_i = M * y_i / sum(y_i^2) (force per bolt)
//   F_max = 200e6 * 225 / 225000 = 200000 N = 200 kN per bolt (max bolt tension from moment)
//
// Direct shear per bolt:
//   V_bolt = V / n_bolts = 100e3 / 8 = 12500 N = 12.5 kN per bolt
//
// Resultant on critical bolt (top row):
//   F_resultant = sqrt(F_max^2 + V_bolt^2) (if tension + shear interaction)
//
// Actually for moment connections, the tension bolts resist moment
// and shear bolts resist shear separately. The critical check is:
//   Tension per bolt: T = M * y_max / sum(y^2) = 200 kN
//   Shear per bolt: V = 100/8 = 12.5 kN
//   Bolt tensile capacity: phi*R_n = 0.75 * F_nt * A_b
//     A_b = pi/4 * 20^2 = 314.16 mm^2
//     F_nt = 620 MPa (A325, nominal tensile stress)
//     phi*R_n = 0.75 * 620 * 314.16 / 1000 = 146.09 kN
//
// The bolt is overstressed (200 > 146.09), so let's use a more
// realistic scenario with closer bolt spacing.
//
// Revised: y1 = 150 mm, y2 = 50 mm, y3 = -50 mm, y4 = -150 mm
//   sum(y^2) = 2*(150^2 + 50^2 + 50^2 + 150^2) = 2*(22500+2500+2500+22500) = 100000 mm^2
//   F_max = 200e6 * 150 / 100000 = 300000 N = 300 kN -> still too high
//
// Use M = 50 kN*m:
//   F_max = 50e6 * 150 / 100000 = 75000 N = 75 kN per bolt
//   This is below bolt capacity of 146.09 kN -- OK

#[test]
fn validation_steel_ext_7_moment_connection() {
    let moment: f64 = 50e6; // N*mm = 50 kN*m
    let shear: f64 = 80e3; // N = 80 kN
    let n_bolts: f64 = 8.0;
    let d_bolt: f64 = 20.0; // mm, M20 bolt
    let fnt: f64 = 620.0; // MPa, nominal tensile strength (A325)
    let fnv: f64 = 372.0; // MPa, nominal shear strength (A325, threads in shear plane)
    let phi: f64 = 0.75;

    // Bolt row positions from centroid (mm)
    let y_rows: [f64; 4] = [150.0, 50.0, -50.0, -150.0];
    let n_bolts_per_row: f64 = 2.0;

    // Sum of y^2 for all bolts
    let sum_y2: f64 = n_bolts_per_row * y_rows.iter().map(|y| y * y).sum::<f64>();
    let expected_sum_y2: f64 = 2.0 * (150.0 * 150.0 + 50.0 * 50.0 + 50.0 * 50.0 + 150.0 * 150.0);
    assert_close_local(sum_y2, expected_sum_y2, 0.001, "Sum of y^2");

    // Maximum bolt tension (from moment)
    let y_max: f64 = 150.0;
    let t_max: f64 = moment * y_max / sum_y2; // N per bolt
    let t_max_kn: f64 = t_max / 1e3;

    let expected_t: f64 = 50e6 * 150.0 / 100_000.0 / 1e3;
    assert_close_local(t_max_kn, expected_t, 0.01, "Max bolt tension from moment");

    // Direct shear per bolt
    let v_per_bolt: f64 = shear / n_bolts;
    let v_per_bolt_kn: f64 = v_per_bolt / 1e3;
    assert_close_local(v_per_bolt_kn, 10.0, 0.01, "Shear per bolt");

    // Bolt capacities
    let ab: f64 = std::f64::consts::PI / 4.0 * d_bolt * d_bolt; // mm^2
    let phi_rn_tension: f64 = phi * fnt * ab / 1e3; // kN
    let phi_rn_shear: f64 = phi * fnv * ab / 1e3; // kN

    assert_close_local(ab, 314.159, 0.01, "Bolt area A_b");

    // Demand/capacity checks
    let dcr_tension: f64 = t_max_kn / phi_rn_tension;
    let dcr_shear: f64 = v_per_bolt_kn / phi_rn_shear;

    assert!(
        dcr_tension < 1.0,
        "Tension D/C = {:.3} < 1.0 (OK)",
        dcr_tension
    );
    assert!(
        dcr_shear < 1.0,
        "Shear D/C = {:.3} < 1.0 (OK)",
        dcr_shear
    );

    // Combined tension-shear interaction (AISC J3.7)
    // F'nt = 1.3*Fnt - Fnt/(phi*Fnv) * f_rv <= Fnt
    let frv: f64 = v_per_bolt / ab; // actual shear stress on bolt
    let fnt_prime: f64 = (1.3 * fnt - fnt / (phi * fnv) * frv).min(fnt);

    assert!(
        fnt_prime > 0.0,
        "Modified tensile strength F'nt = {:.1} > 0",
        fnt_prime
    );

    // Check tension under combined loading
    let phi_rn_combined: f64 = phi * fnt_prime * ab / 1e3; // kN
    assert!(
        t_max_kn < phi_rn_combined,
        "Combined check: T = {:.1} < phi*F'nt*A_b = {:.1} kN",
        t_max_kn, phi_rn_combined
    );
}

// ================================================================
// 8. Deflection Serviceability: L/360 Check
// ================================================================
//
// Simply supported beam under uniform load:
//   delta_max = 5*w*L^4 / (384*E*I) (at midspan)
//   Limit: L/360 (for live load)
//
// Design a W-shape beam to satisfy L/360:
//   L = 8.0 m, w = 15 kN/m (live load)
//   E = 200 GPa = 200,000 MPa
//   E_eff = E * 1000 = 2e8 kN/m^2 (solver convention)
//
// Beam properties chosen to be near the limit:
//   A = 0.01 m^2
//   I_z = 3.0e-4 m^4 (about 300 cm^4... actually 3e-4 m^4 = 30000 cm^4 ~ W21x62)
//
// Analytical deflection:
//   delta = 5 * 15 * 8^4 / (384 * 2e8 * 3e-4)
//         = 5 * 15 * 4096 / (384 * 60000)
//         = 307200 / 23040000
//         = 0.01333 m = 13.33 mm
//
// Limit: L/360 = 8000/360 = 22.22 mm
// delta = 13.33 mm < 22.22 mm -> OK (ratio = 0.60)

#[test]
fn validation_steel_ext_8_deflection_serviceability() {
    let l: f64 = 8.0; // m, span
    let n: usize = 8; // elements
    let q: f64 = -15.0; // kN/m (downward)
    let e_val: f64 = 200_000.0; // MPa (solver input)
    let e_eff: f64 = e_val * 1000.0; // kN/m^2
    let a: f64 = 0.01; // m^2
    let iz: f64 = 3.0e-4; // m^4

    // Build SS beam with UDL using solver
    let input = make_ss_beam_udl(n, l, e_val, a, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    // Find midspan displacement
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // Analytical deflection: delta = 5*w*L^4 / (384*E*I)
    let w_abs: f64 = q.abs();
    let delta_exact: f64 = 5.0 * w_abs * l.powi(4) / (384.0 * e_eff * iz);

    // Compare solver result to analytical
    let solver_delta: f64 = mid_d.uz.abs();
    let error = (solver_delta - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.05,
        "Deflection: solver={:.6e} m, exact={:.6e} m, err={:.1}%",
        solver_delta, delta_exact, error * 100.0
    );

    // Serviceability check: L/360
    let l_mm: f64 = l * 1000.0;
    let limit: f64 = l_mm / 360.0; // mm
    let delta_mm: f64 = delta_exact * 1000.0; // convert m to mm

    assert_close(delta_mm, 13.33, 0.05, "Midspan deflection (mm)");
    assert_close(limit, 22.22, 0.01, "L/360 limit (mm)");

    assert!(
        delta_mm < limit,
        "Serviceability OK: delta = {:.2} mm < L/360 = {:.2} mm",
        delta_mm, limit
    );

    // Utilization ratio
    let utilization: f64 = delta_mm / limit;
    assert!(
        utilization < 1.0,
        "Utilization = {:.2} < 1.0",
        utilization
    );
    assert!(
        utilization > 0.3,
        "Utilization = {:.2} should be meaningful (not trivially small)",
        utilization
    );
}
