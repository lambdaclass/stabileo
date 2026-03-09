/// Validation: Extended Plate Girder Design Benchmarks
///
/// References:
///   - AISC 360-22, Chapter F (Flexure) and Chapter G (Shear)
///   - EN 1993-1-5:2006 — Plated Structural Elements
///   - Basler (1961): "Strength of Plate Girders in Shear"
///   - Salmon, Johnson & Malhas: "Steel Structures" 5th ed.
///   - Galambos & Surovek: "Structural Stability of Steel" (2008)
///   - Blodgett: "Design of Welded Structures" (1966)
///   - AASHTO LRFD Bridge Design Specifications, 9th ed.
///
/// Tests verify web shear buckling, flange proportioning, tension field
/// action, bearing stiffener design, intermediate stiffener spacing,
/// Rpg bending reduction, hybrid girder factor, and deflection comparison.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Web Shear Buckling — Elastic Critical Stress
// ================================================================
//
// Elastic critical shear stress for a stiffened plate girder web:
//
//   tau_cr = k_v * pi^2 * E / (12*(1 - nu^2)) * (t_w / d)^2
//
// where the shear buckling coefficient for a/d >= 1 (long panels):
//
//   k_v = 5.34 + 4.0 / (a/d)^2
//
// For a/d < 1 (short panels):
//   k_v = 4.0 + 5.34 / (a/d)^2
//
// Given: E = 200,000 MPa, nu = 0.3, t_w = 10 mm, d = 1400 mm,
//        a = 2100 mm (stiffener spacing)
//
// a/d = 2100/1400 = 1.5 (long panel)
// k_v = 5.34 + 4.0/1.5^2 = 5.34 + 1.778 = 7.118
//
// D = pi^2 * E / (12*(1 - 0.09)) = pi^2*200000/10.92 = 180,920.5
//
// tau_cr = 7.118 * 180920.5 * (10/1400)^2
//        = 7.118 * 180920.5 * 5.102e-5
//        = 65.72 MPa
//
// Web slenderness lambda_w = sqrt(tau_y / tau_cr)
// where tau_y = F_y / sqrt(3) = 350 / 1.732 = 202.1 MPa (von Mises)
//
// lambda_w = sqrt(202.1 / 65.72) = sqrt(3.076) = 1.754
// Since lambda_w > 1.0, post-buckling strength (tension field) applies.
//
// Reference: Salmon & Johnson, Eq. 11.3.1

#[test]
fn validation_pg_ext_web_shear_buckling() {
    let e: f64 = 200_000.0;     // MPa, elastic modulus
    let nu: f64 = 0.3;          // Poisson's ratio
    let tw: f64 = 10.0;         // mm, web thickness
    let d: f64 = 1400.0;        // mm, web clear depth
    let a: f64 = 2100.0;        // mm, stiffener spacing
    let fy: f64 = 350.0;        // MPa, yield stress

    // Aspect ratio
    let aspect: f64 = a / d; // 1.5

    assert_close(aspect, 1.5, 0.01, "aspect ratio a/d");

    // Shear buckling coefficient for a/d >= 1 (long panels)
    let kv: f64 = 5.34 + 4.0 / (aspect * aspect);

    // Expected: 5.34 + 4.0/2.25 = 5.34 + 1.778 = 7.118
    assert_close(kv, 7.118, 0.01, "shear buckling coefficient k_v");

    // Plate buckling constant D = pi^2 * E / (12 * (1 - nu^2))
    let pi: f64 = std::f64::consts::PI;
    let plate_constant: f64 = pi.powi(2) * e / (12.0 * (1.0 - nu * nu));

    // Expected: 9.8696 * 200000 / 10.92 = 180,721 (approx)
    assert_close(plate_constant, 180_721.0, 0.02, "plate buckling constant");

    // Elastic critical shear stress
    let ratio: f64 = tw / d;
    let tau_cr: f64 = kv * plate_constant * ratio * ratio;

    // tau_cr = 7.118 * 180721 * (10/1400)^2 = 7.118 * 180721 * 5.102e-5
    //        ≈ 65.65 MPa
    assert_close(tau_cr, 65.65, 0.03, "elastic critical shear stress tau_cr (MPa)");

    // Von Mises shear yield stress
    let tau_y: f64 = fy / 3.0_f64.sqrt();
    assert_close(tau_y, 202.07, 0.01, "shear yield stress tau_y (MPa)");

    // Web slenderness parameter
    let lambda_w: f64 = (tau_y / tau_cr).sqrt();

    // lambda_w = sqrt(202.07 / 65.65) = sqrt(3.078) = 1.754
    assert_close(lambda_w, 1.754, 0.03, "web slenderness lambda_w");

    // For lambda_w > 1.0, web buckles before yielding in shear —
    // tension field action provides post-buckling reserve.
    assert!(
        lambda_w > 1.0,
        "lambda_w = {:.3} > 1.0 => slender web, tension field applicable",
        lambda_w
    );

    // Web slenderness ratio d/tw must exceed AISC threshold for stiffened web
    let d_tw: f64 = d / tw;
    assert_close(d_tw, 140.0, 0.01, "web slenderness d/tw");

    // AISC limit for unstiffened web: h/tw <= 260
    assert!(
        d_tw < 260.0,
        "d/tw = {:.0} < 260 (within absolute limit)", d_tw
    );
}

// ================================================================
// 2. Flange Proportioning — Economic Design
// ================================================================
//
// For plate girders, an approximate rule relates the required flange
// area to the applied moment, web area, and girder depth:
//
//   A_f_req = M / (F_y * h) - A_w / 6
//
// This comes from the flexure formula assuming the flange carries most
// of the bending moment and the web contributes about 1/6 of its area
// as effective flange.
//
// Given: M = 4500 kN*m, F_y = 345 MPa, h = 1600 mm (total depth),
//        t_w = 12 mm, d_w = 1550 mm (web depth)
//
// A_w = d_w * t_w = 1550 * 12 = 18,600 mm^2
//
// A_f_req = 4500e6 / (345 * 1600) - 18600/6
//         = 4500e6 / 552000 - 3100
//         = 8152.2 - 3100
//         = 5052.2 mm^2
//
// Check with bf=350mm, tf=20mm: A_f = 7000 mm^2 > 5052 OK
//
// Also check flange-to-web area ratio: A_f/(d_w*t_w) should be
// between 0.2 and 0.6 for economic design.
//
// Reference: Blodgett, "Design of Welded Structures", Section 4.7

#[test]
fn validation_pg_ext_flange_proportioning() {
    let m: f64 = 4500.0e6;      // N*mm = 4500 kN*m
    let fy: f64 = 345.0;        // MPa
    let h: f64 = 1600.0;        // mm, total girder depth
    let tw: f64 = 12.0;         // mm, web thickness
    let dw: f64 = 1550.0;       // mm, web clear depth (h - 2*tf approx)

    // Web area
    let aw: f64 = dw * tw;
    assert_close(aw, 18_600.0, 0.01, "web area A_w (mm^2)");

    // Required flange area from approximate formula
    let af_req: f64 = m / (fy * h) - aw / 6.0;

    // Expected: 4500e6 / (345*1600) - 18600/6 = 8152.2 - 3100 = 5052.2 mm^2
    let term1: f64 = m / (fy * h);
    assert_close(term1, 8152.2, 0.01, "M/(Fy*h) term");

    let term2: f64 = aw / 6.0;
    assert_close(term2, 3100.0, 0.01, "Aw/6 term");

    assert_close(af_req, 5052.2, 0.02, "required flange area A_f_req (mm^2)");

    // Proposed flange: 350 mm x 20 mm
    let bf: f64 = 350.0;
    let tf: f64 = 20.0;
    let af_provided: f64 = bf * tf;

    assert_close(af_provided, 7000.0, 0.01, "provided flange area A_f (mm^2)");

    // Check adequacy
    assert!(
        af_provided > af_req,
        "Provided A_f = {:.0} mm^2 > required A_f = {:.0} mm^2",
        af_provided, af_req
    );

    // Flange-to-web area ratio (economic range: 0.2 to 0.6)
    let af_aw_ratio: f64 = af_provided / aw;

    assert_close(af_aw_ratio, 0.376, 0.02, "A_f/A_w ratio");
    assert!(
        af_aw_ratio >= 0.2 && af_aw_ratio <= 0.6,
        "A_f/A_w = {:.3} should be in economic range [0.2, 0.6]",
        af_aw_ratio
    );

    // Verify flange compactness (bf/(2*tf) check per AISC Table B4.1b)
    let lambda_f: f64 = bf / (2.0 * tf);
    let e_steel: f64 = 200_000.0;
    let lambda_pf: f64 = 0.38 * (e_steel / fy).sqrt();

    assert_close(lambda_f, 8.75, 0.01, "flange slenderness b_f/(2*t_f)");
    assert_close(lambda_pf, 9.15, 0.02, "compact limit lambda_pf");

    assert!(
        lambda_f < lambda_pf,
        "lambda_f = {:.2} < lambda_pf = {:.2} => compact flange",
        lambda_f, lambda_pf
    );
}

// ================================================================
// 3. Tension Field Action — AISC G3 Post-Buckling Shear Strength
// ================================================================
//
// When a plate girder web buckles in shear (tau_cr < tau_y), the web
// develops diagonal tension bands that provide post-buckling strength.
// AISC 360-22 Equation G3-2:
//
//   V_n = 0.6 * F_yw * A_w * (C_v2 + (1 - C_v2) / (1.15 * sqrt(1 + (a/h)^2)))
//
// where C_v2 is the ratio of critical web stress to shear yield:
//   C_v2 = 1.10 * k_v * sqrt(E / F_yw) / (h/t_w)      when slenderness > limit
//
// Given: F_yw = 345 MPa, t_w = 10 mm, h = 1400 mm, a = 2100 mm
//        k_v = 7.118 (from test 1)
//
// h/t_w = 140
// 1.10*sqrt(k_v*E/F_yw) = 1.10*sqrt(7.118*200000/345)
//                        = 1.10*sqrt(4126.1) = 1.10*64.24 = 70.66
//
// Since h/tw = 140 > 1.37*sqrt(k_v*E/F_yw) = 1.37*64.24 = 88.0,
// we use the elastic buckling formula:
//   C_v2 = 1.51*E*k_v / ((h/tw)^2 * F_yw)
//        = 1.51*200000*7.118 / (19600 * 345)
//        = 2,149,636 / 6,762,000
//        = 0.3179
//
// A_w = 1400 * 10 = 14000 mm^2
//
// V_n = 0.6 * 345 * 14000 * (0.3179 + (1-0.3179)/(1.15*sqrt(1+2.25)))
//     = 2,898,000 * (0.3179 + 0.6821 / (1.15*1.803))
//     = 2,898,000 * (0.3179 + 0.6821/2.073)
//     = 2,898,000 * (0.3179 + 0.3291)
//     = 2,898,000 * 0.6470
//     = 1,875,006 N = 1875.0 kN
//
// Pre-buckling capacity (web buckling alone):
//   V_cr = 0.6 * F_yw * A_w * C_v2
//        = 2,898,000 * 0.3179 = 921,267 N = 921.3 kN
//
// Tension field contribution:
//   V_tf = V_n - V_cr = 1875.0 - 921.3 = 953.7 kN (50.9% of total)
//
// Reference: AISC 360-22 Section G3, Salmon & Johnson Ch. 11

#[test]
fn validation_pg_ext_tension_field_action() {
    let fyw: f64 = 345.0;       // MPa, web yield stress
    let tw: f64 = 10.0;         // mm, web thickness
    let h: f64 = 1400.0;        // mm, web depth
    let a: f64 = 2100.0;        // mm, stiffener spacing
    let e: f64 = 200_000.0;     // MPa

    // Web area
    let aw: f64 = h * tw;
    assert_close(aw, 14_000.0, 0.01, "web area A_w (mm^2)");

    // Aspect ratio and buckling coefficient
    let aspect: f64 = a / h;
    let kv: f64 = 5.34 + 4.0 / (aspect * aspect);
    assert_close(kv, 7.118, 0.01, "k_v shear buckling coefficient");

    // Web slenderness ratio
    let h_tw: f64 = h / tw;
    assert_close(h_tw, 140.0, 0.01, "h/tw web slenderness");

    // Determine which C_v2 formula applies (AISC G2.2)
    let kv_e_fyw: f64 = kv * e / fyw;
    let sqrt_ratio: f64 = kv_e_fyw.sqrt();
    // sqrt(7.118*200000/345) = sqrt(4126.1) = 64.24
    assert_close(sqrt_ratio, 64.24, 0.02, "sqrt(k_v*E/F_yw)");

    let limit_elastic: f64 = 1.37 * sqrt_ratio;
    // 1.37 * 64.24 = 88.0
    assert_close(limit_elastic, 88.01, 0.02, "elastic buckling limit 1.37*sqrt(kv*E/Fy)");

    // h/tw = 140 > 88 => elastic buckling regime
    assert!(
        h_tw > limit_elastic,
        "h/tw = {:.0} > {:.1} => elastic buckling regime", h_tw, limit_elastic
    );

    // C_v2 for elastic buckling (AISC Eq. G2-11)
    let cv2: f64 = 1.51 * e * kv / (h_tw * h_tw * fyw);
    // = 1.51*200000*7.118 / (19600 * 345) = 2,149,636 / 6,762,000 = 0.3179
    assert_close(cv2, 0.3179, 0.02, "C_v2 shear buckling ratio");

    // AISC G3 tension field shear strength (Eq. G3-2)
    let a_h_sq: f64 = aspect * aspect;
    let denom: f64 = 1.15 * (1.0 + a_h_sq).sqrt();
    // 1.15 * sqrt(1 + 2.25) = 1.15 * 1.803 = 2.073
    assert_close(denom, 2.073, 0.02, "1.15*sqrt(1+(a/h)^2)");

    let vn: f64 = 0.6 * fyw * aw * (cv2 + (1.0 - cv2) / denom);
    let vn_kn: f64 = vn / 1000.0;
    // = 2,898,000 * (0.3179 + 0.6821/2.073) = 2,898,000 * 0.6470 = 1875.0 kN
    assert_close(vn_kn, 1875.0, 0.03, "AISC G3 tension field shear V_n (kN)");

    // Pre-buckling capacity
    let vcr: f64 = 0.6 * fyw * aw * cv2;
    let vcr_kn: f64 = vcr / 1000.0;
    assert_close(vcr_kn, 921.3, 0.03, "pre-buckling shear V_cr (kN)");

    // Tension field contribution
    let vtf_kn: f64 = vn_kn - vcr_kn;
    let tf_fraction: f64 = vtf_kn / vn_kn;
    assert_close(tf_fraction, 0.509, 0.03, "tension field fraction of total shear");

    // Tension field must add significant capacity
    assert!(
        vtf_kn > 0.3 * vn_kn,
        "Tension field adds {:.0} kN ({:.1}% of V_n)",
        vtf_kn, tf_fraction * 100.0
    );
}

// ================================================================
// 4. Bearing Stiffener Design — End Bearing and Web Crippling
// ================================================================
//
// At bearing locations, concentrated forces must be transferred through
// the web. When web crippling capacity is insufficient, bearing
// stiffeners are provided. The stiffener is designed as a column using
// an effective cross-section that includes 25*tw of web on each side.
//
// Web crippling capacity (AISC J10-4, end reaction with N/d <= 0.2):
//   R_n = 0.40 * t_w^2 * (1 + 3*(N/d)*(t_w/t_f)^1.5) * sqrt(E*F_yw*t_f/t_w)
//
// Given: t_w = 12 mm, t_f = 25 mm, d = 1550 mm, N = 200 mm (bearing length),
//        E = 200,000 MPa, F_yw = 350 MPa
//
// N/d = 200/1550 = 0.1290
// (t_w/t_f)^1.5 = (12/25)^1.5 = 0.48^1.5 = 0.3326
// 3*(N/d)*(t_w/t_f)^1.5 = 3*0.129*0.3326 = 0.1287
//
// sqrt(E*Fyw*tf/tw) = sqrt(200000*350*25/12) = sqrt(145,833,333) = 12,076.1
//
// R_n = 0.40 * 144 * (1 + 0.1287) * 12076.1
//     = 0.40 * 144 * 1.1287 * 12076.1
//     = 57.6 * 1.1287 * 12076.1
//     = 785,297 N = 785.3 kN
//
// If applied end reaction = 1200 kN > R_n = 785 kN, stiffener is needed.
//
// Bearing stiffener capacity (column analogy):
//   Effective section: 2 plates (180mm x 20mm each) + 25*tw web each side
//   A_eff = 2*180*20 + 2*(25*12)*12 = 7200 + 7200 = 14400 mm^2
//   I_eff about web: 2*(20*180^3/12 + 20*180*(90+6)^2) + 2*(300*12^3/12)
//        = 2*(9,720,000 + 33,177,600) + 2*(43,200)
//        = 85,795,200 + 86,400 = 85,881,600 mm^4
//   r = sqrt(I/A) = sqrt(85,881,600/14400) = sqrt(5964) = 77.2 mm
//
// Effective length = 0.75 * h = 0.75 * 1500 = 1125 mm
// KL/r = 1125/77.2 = 14.57
// F_e = pi^2*E/(KL/r)^2 = pi^2*200000/212.3 = 9295 MPa
// Since KL/r = 14.57 << 4.71*sqrt(E/Fy) = 4.71*23.9 = 112.6
//   => inelastic buckling: P_n = 0.658^(Fy/Fe) * Fy * A_eff
//   Fy/Fe = 350/9295 = 0.03766
//   0.658^0.03766 = 0.9843
//   P_n = 0.9843 * 350 * 14400 / 1000 = 4960.9 kN
//
// Reference: AISC 360-22 Section J10.3, J10.8

#[test]
fn validation_pg_ext_bearing_stiffener() {
    let tw: f64 = 12.0;         // mm, web thickness
    let tf: f64 = 25.0;         // mm, flange thickness
    let d: f64 = 1550.0;        // mm, overall girder depth
    let h: f64 = 1500.0;        // mm, web clear depth
    let bearing_n: f64 = 200.0; // mm, bearing length
    let e: f64 = 200_000.0;     // MPa
    let fyw: f64 = 350.0;       // MPa, web yield stress

    // Web crippling capacity (AISC J10-4, end reaction)
    let n_d: f64 = bearing_n / d;
    assert_close(n_d, 0.1290, 0.02, "N/d bearing ratio");

    let tw_tf_ratio: f64 = tw / tf;
    let tw_tf_15: f64 = tw_tf_ratio.powf(1.5);
    // (12/25)^1.5 = 0.48^1.5 = 0.3326
    assert_close(tw_tf_15, 0.3326, 0.02, "(tw/tf)^1.5");

    let bracket: f64 = 1.0 + 3.0 * n_d * tw_tf_15;
    assert_close(bracket, 1.1287, 0.02, "web crippling bracket factor");

    let sqrt_term: f64 = (e * fyw * tf / tw).sqrt();
    // sqrt(200000*350*25/12) = sqrt(145,833,333) = 12076.1
    assert_close(sqrt_term, 12_076.1, 0.02, "sqrt(E*Fyw*tf/tw)");

    let rn_crippling: f64 = 0.40 * tw.powi(2) * bracket * sqrt_term;
    let rn_kn: f64 = rn_crippling / 1000.0;
    assert_close(rn_kn, 785.3, 0.03, "web crippling capacity R_n (kN)");

    // Applied end reaction exceeds web crippling => stiffener needed
    let v_applied: f64 = 1200.0; // kN
    assert!(
        v_applied > rn_kn,
        "V = {:.0} kN > R_n = {:.0} kN => bearing stiffener required",
        v_applied, rn_kn
    );

    // Bearing stiffener design (column analogy)
    // Two plates: 180 mm x 20 mm each side of web
    let bs: f64 = 180.0;        // mm, stiffener plate width
    let ts: f64 = 20.0;         // mm, stiffener plate thickness

    // Effective web width on each side of stiffener
    let web_eff: f64 = 25.0 * tw; // = 300 mm

    // Effective area
    let a_eff: f64 = 2.0 * bs * ts + 2.0 * web_eff * tw;
    // = 2*180*20 + 2*300*12 = 7200 + 7200 = 14400 mm^2
    assert_close(a_eff, 14_400.0, 0.01, "effective stiffener area (mm^2)");

    // Moment of inertia about web centerline
    // Stiffener plates: I = 2*(ts*bs^3/12 + ts*bs*(bs/2 + tw/2)^2)
    let arm: f64 = bs / 2.0 + tw / 2.0; // 90 + 6 = 96 mm
    let i_stiff: f64 = 2.0 * (ts * bs.powi(3) / 12.0 + ts * bs * arm.powi(2));
    // Web contribution
    let i_web: f64 = 2.0 * web_eff * tw.powi(3) / 12.0;
    let i_eff: f64 = i_stiff + i_web;

    // Radius of gyration
    let r: f64 = (i_eff / a_eff).sqrt();
    assert_close(r, 77.2, 0.03, "stiffener radius of gyration (mm)");

    // Effective length (bearing stiffener fixed-fixed analogy)
    let kl: f64 = 0.75 * h;
    let slenderness: f64 = kl / r;
    assert_close(slenderness, 14.57, 0.05, "stiffener slenderness KL/r");

    // Euler buckling stress
    let pi: f64 = std::f64::consts::PI;
    let fe: f64 = pi.powi(2) * e / (slenderness * slenderness);

    // AISC column strength (inelastic: KL/r << transition)
    let transition: f64 = 4.71 * (e / fyw).sqrt();
    assert!(
        slenderness < transition,
        "KL/r = {:.1} < {:.1} => inelastic buckling", slenderness, transition
    );

    let fy_fe_ratio: f64 = fyw / fe;
    let pn: f64 = 0.658_f64.powf(fy_fe_ratio) * fyw * a_eff / 1000.0; // kN

    // Stiffener capacity must exceed applied reaction
    assert!(
        pn > v_applied,
        "Bearing stiffener P_n = {:.0} kN > V_applied = {:.0} kN",
        pn, v_applied
    );

    // Stiffener plate must be compact: bs/ts <= 0.56*sqrt(E/Fy)
    let stiff_slender: f64 = bs / ts;
    let stiff_limit: f64 = 0.56 * (e / fyw).sqrt();
    assert_close(stiff_slender, 9.0, 0.01, "stiffener plate slenderness bs/ts");
    assert!(
        stiff_slender < stiff_limit,
        "bs/ts = {:.1} < {:.1} => compact stiffener", stiff_slender, stiff_limit
    );
}

// ================================================================
// 5. Intermediate Stiffener Spacing — AISC G2.2 a/h Limits
// ================================================================
//
// AISC G2.2 requires that intermediate transverse stiffeners, when
// tension field action is used, satisfy:
//
//   a/h <= 3.0  (maximum aspect ratio)
//   a/h <= [260/(h/tw)]^2 when h/tw > 260 (absolute limit)
//
// Stiffener moment of inertia requirement (AISC G2.3):
//   I_st >= I_st1 + (I_st2 - I_st1) * (V_r/V_c - 1)
//
// For simplified check (without tension field):
//   I_st1 = h^4 * rho_st^3 / 40
//   where rho_st = max(F_yw/F_ys, 1.0), F_ys = stiffener yield
//
// For practical design with single-sided stiffener:
//   j = 2.5/(a/h)^2 - 2.0  (AISC old formulation, commonly used)
//   I_st_min = j * a * t_w^3  (minimum I)
//
// Given: h = 1500 mm, tw = 12 mm, a_min = 1000 mm, a_max = 4500 mm
//
// Panel 1: a = 1000, a/h = 0.667
//   j = 2.5/(0.667)^2 - 2 = 2.5/0.4444 - 2 = 5.625 - 2 = 3.625
//   I_min = 3.625 * 1000 * 12^3 = 3.625 * 1,728,000 = 6,264,000 mm^4
//
// Panel 2: a = 2000, a/h = 1.333
//   j = 2.5/(1.333)^2 - 2 = 2.5/1.778 - 2 = 1.406 - 2 = -0.594
//   j_min = 0.5 (minimum)
//   I_min = 0.5 * 2000 * 12^3 = 0.5 * 3,456,000 = 1,728,000 mm^4
//
// Reference: AISC 360-22 Section G2, Salmon & Johnson Ch. 11

#[test]
fn validation_pg_ext_intermediate_stiffener_spacing() {
    let h: f64 = 1500.0;        // mm, web depth
    let tw: f64 = 12.0;         // mm, web thickness
    let fyw: f64 = 350.0;       // MPa, web yield

    let h_tw: f64 = h / tw;
    assert_close(h_tw, 125.0, 0.01, "web slenderness h/tw");

    // AISC maximum a/h limits
    let a_h_max_general: f64 = 3.0;

    // For h/tw <= 260, the [260/(h/tw)]^2 limit does not further restrict
    let a_h_max_slender: f64 = (260.0 / h_tw).powi(2);
    // (260/125)^2 = 2.08^2 = 4.326
    assert_close(a_h_max_slender, 4.326, 0.02, "[260/(h/tw)]^2 limit");

    // Governing limit: min of 3.0 and 4.326 => 3.0
    let a_h_limit: f64 = a_h_max_general.min(a_h_max_slender);
    assert_close(a_h_limit, 3.0, 0.01, "governing a/h limit");

    // Maximum stiffener spacing
    let a_max: f64 = a_h_limit * h;
    assert_close(a_max, 4500.0, 0.01, "maximum stiffener spacing (mm)");

    // Panel 1: Close spacing (high shear region near support)
    let a1: f64 = 1000.0;
    let a_h_1: f64 = a1 / h;
    assert_close(a_h_1, 0.667, 0.02, "panel 1 aspect ratio a/h");

    let j1_raw: f64 = 2.5 / (a_h_1 * a_h_1) - 2.0;
    let j1: f64 = j1_raw.max(0.5);
    assert_close(j1, 3.625, 0.03, "panel 1 j factor");

    let ist_min_1: f64 = j1 * a1 * tw.powi(3);
    // = 3.625 * 1000 * 1728 = 6,264,000 mm^4
    assert_close(ist_min_1, 6_264_000.0, 0.03, "panel 1 I_st_min (mm^4)");

    // Panel 2: Wider spacing (lower shear region at midspan)
    let a2: f64 = 2000.0;
    let a_h_2: f64 = a2 / h;
    assert_close(a_h_2, 1.333, 0.02, "panel 2 aspect ratio a/h");

    let j2_raw: f64 = 2.5 / (a_h_2 * a_h_2) - 2.0;
    let j2: f64 = j2_raw.max(0.5); // j_min = 0.5 governs
    assert_close(j2, 0.5, 0.01, "panel 2 j factor (minimum governs)");

    let ist_min_2: f64 = j2 * a2 * tw.powi(3);
    // = 0.5 * 2000 * 1728 = 1,728,000 mm^4
    assert_close(ist_min_2, 1_728_000.0, 0.01, "panel 2 I_st_min (mm^4)");

    // Panel 1 (closer spacing) requires a stiffer stiffener
    assert!(
        ist_min_1 > ist_min_2,
        "Close-spaced panel needs stiffer stiffener: {:.0} > {:.0} mm^4",
        ist_min_1, ist_min_2
    );

    // Typical stiffener check: single plate 120mm x 12mm
    let bs_st: f64 = 120.0;
    let ts_st: f64 = 12.0;
    let ist_provided: f64 = ts_st * bs_st.powi(3) / 3.0; // about face of web
    // = 12 * 120^3 / 3 = 12 * 1,728,000 / 3 = 6,912,000 mm^4
    assert_close(ist_provided, 6_912_000.0, 0.01, "provided stiffener I (mm^4)");

    // Must satisfy panel 1 requirement
    assert!(
        ist_provided > ist_min_1,
        "I_provided = {:.0} > I_req = {:.0} for panel 1",
        ist_provided, ist_min_1
    );

    // Stiffener width-to-thickness: bs/ts for outstand element
    let stiff_lambda: f64 = bs_st / ts_st;
    let stiff_compact: f64 = 0.56 * (200_000.0 / fyw).sqrt();
    assert!(
        stiff_lambda < stiff_compact,
        "Stiffener bs/ts = {:.1} < {:.1} (compact limit)",
        stiff_lambda, stiff_compact
    );
}

// ================================================================
// 6. Bending Strength Reduction — AISC F5 Rpg Factor
// ================================================================
//
// For plate girders with slender webs, the bending moment capacity is
// reduced by the plate girder reduction factor Rpg (AISC F5-6):
//
//   R_pg = 1 - a_w / (1200 + 300*a_w) * (h_c/t_w - 5.70*sqrt(E/F_yf))
//
// where:
//   a_w = h_c * t_w / (b_fc * t_fc)  (web-to-compression-flange ratio)
//   h_c = web depth in compression (= h/2 for doubly symmetric)
//   b_fc, t_fc = compression flange width and thickness
//   F_yf = flange yield stress
//
// R_pg <= 1.0 (cannot enhance capacity)
//
// Given: h = 1800 mm, tw = 10 mm, bf = 400 mm, tf = 25 mm,
//        E = 200,000 MPa, Fyf = 345 MPa
//
// hc = h/2 = 900 mm (doubly symmetric section)
// a_w = 900*10 / (400*25) = 9000/10000 = 0.90
//
// 5.70*sqrt(E/Fyf) = 5.70*sqrt(200000/345) = 5.70*24.08 = 137.3
//
// h_c/t_w = 900/10 = 90
//
// Since hc/tw = 90 < 137.3, the term (hc/tw - 5.70*sqrt(E/Fyf)) < 0
// so Rpg = 1 - negative = > 1.0, capped at 1.0 => no reduction
//
// Now consider a more slender web: h = 2400 mm, tw = 10 mm
// hc = 1200, hc/tw = 120
// a_w = 1200*10/(400*25) = 1.20
// Rpg = 1 - 1.20/(1200+300*1.20)*(120 - 137.3)
//     = 1 - 1.20/1560*(-17.3) = 1 - (-0.01331) = 1.013 => capped at 1.0
//
// Even more slender: h = 3000 mm, tw = 10 mm
// hc = 1475 (d_w/2 where dw = h - 2*tf = 2950), hc/tw = 147.5
// a_w = 1475*10/(400*25) = 1.475
// Rpg = 1 - 1.475/(1200+300*1.475)*(147.5 - 137.3)
//     = 1 - 1.475/1642.5*(10.2)
//     = 1 - 0.000898*10.2 = 1 - 0.00916 = 0.9908
//
// Reference: AISC 360-22 Section F5.2

#[test]
fn validation_pg_ext_rpg_bending_reduction() {
    let e: f64 = 200_000.0;     // MPa
    let fyf: f64 = 345.0;       // MPa, flange yield
    let bf: f64 = 400.0;        // mm, flange width
    let tf: f64 = 25.0;         // mm, flange thickness

    // Compact web case: h = 1800 mm, tw = 10 mm
    let tw: f64 = 10.0;
    let h1: f64 = 1800.0;
    let hc1: f64 = (h1 - 2.0 * tf) / 2.0; // = 875 mm
    let aw1: f64 = hc1 * tw / (bf * tf);

    let limit_term: f64 = 5.70 * (e / fyf).sqrt();
    // 5.70 * sqrt(200000/345) = 5.70 * 24.08 = 137.3
    assert_close(limit_term, 137.3, 0.02, "5.70*sqrt(E/Fyf)");

    let hc_tw_1: f64 = hc1 / tw;
    // hc/tw = 875/10 = 87.5 < 137.3 => Rpg term is negative => capped at 1.0
    assert!(
        hc_tw_1 < limit_term,
        "Case 1: hc/tw = {:.1} < {:.1} => no Rpg reduction", hc_tw_1, limit_term
    );

    let rpg_raw_1: f64 = 1.0 - aw1 / (1200.0 + 300.0 * aw1) * (hc_tw_1 - limit_term);
    let rpg_1: f64 = rpg_raw_1.min(1.0);
    assert_close(rpg_1, 1.0, 0.01, "R_pg for compact web (capped at 1.0)");

    // Slender web case: h = 3000 mm, tw = 10 mm
    let h2: f64 = 3000.0;
    let hc2: f64 = (h2 - 2.0 * tf) / 2.0; // = 1475 mm
    let aw2: f64 = hc2 * tw / (bf * tf);
    let hc_tw_2: f64 = hc2 / tw;

    assert_close(hc2, 1475.0, 0.01, "hc for slender web case (mm)");
    assert_close(aw2, 1.475, 0.01, "aw for slender web case");
    assert_close(hc_tw_2, 147.5, 0.01, "hc/tw for slender web case");

    // hc/tw = 147.5 > 137.3 => Rpg < 1.0
    assert!(
        hc_tw_2 > limit_term,
        "Case 2: hc/tw = {:.1} > {:.1} => Rpg reduction applies", hc_tw_2, limit_term
    );

    let rpg_raw_2: f64 = 1.0 - aw2 / (1200.0 + 300.0 * aw2) * (hc_tw_2 - limit_term);
    let rpg_2: f64 = rpg_raw_2.min(1.0);

    // Rpg = 1 - 1.475/1642.5*(147.5-137.3) = 1 - 0.000898*10.2 = 0.9908
    assert_close(rpg_2, 0.9908, 0.02, "R_pg for slender web");

    // Rpg must be in range (0, 1.0]
    assert!(
        rpg_2 > 0.0 && rpg_2 <= 1.0,
        "R_pg = {:.4} must be in (0, 1.0]", rpg_2
    );

    // The reduction is small (< 1%) for this case, which is typical
    let reduction_pct: f64 = (1.0 - rpg_2) * 100.0;
    assert_close(reduction_pct, 0.92, 0.05, "Rpg reduction percentage");

    // a_w must not exceed 10.0 (AISC limit)
    assert!(
        aw2 <= 10.0,
        "a_w = {:.3} must be <= 10.0 (AISC limit)", aw2
    );

    // Moment capacity comparison: M_n = R_pg * F_cr * S_xc
    // Using yield stress as F_cr for simplicity
    // S_xc (section modulus to compression flange) for doubly symmetric:
    let ix2: f64 = bf * h2.powi(3) / 12.0 // flanges (approx, using full bf)
        - (bf - tw) * (h2 - 2.0 * tf).powi(3) / 12.0; // subtract hollow core
    let sxc2: f64 = ix2 / (h2 / 2.0);

    let mn_unreduced: f64 = fyf * sxc2 / 1.0e6; // kN*m
    let mn_reduced: f64 = rpg_2 * fyf * sxc2 / 1.0e6; // kN*m

    assert!(
        mn_reduced < mn_unreduced,
        "Reduced M_n = {:.0} < unreduced M_n = {:.0} kN*m",
        mn_reduced, mn_unreduced
    );
}

// ================================================================
// 7. Hybrid Girder Reduction Factor Rh
// ================================================================
//
// A hybrid girder uses higher-strength steel for flanges than for the
// web, which is economical for deep girders. The web yields before the
// flange reaches full capacity, requiring a reduction factor Rh.
//
// AISC 360-22, Appendix 1.5 / F5:
//
//   R_h = (12 + a_w*(3*psi - psi^3)) / (12 + 2*a_w)
//
// where:
//   psi = F_yw / F_yf  (ratio of web yield to flange yield, <= 1.0)
//   a_w = h_c * t_w / (b_fc * t_fc)
//
// For a homogeneous girder (Fyw = Fyf => psi = 1.0):
//   Rh = (12 + aw*(3 - 1)) / (12 + 2*aw) = (12 + 2*aw) / (12 + 2*aw) = 1.0
//
// For hybrid with Fyf = 460 MPa, Fyw = 345 MPa:
//   psi = 345/460 = 0.75
//   3*psi - psi^3 = 3*0.75 - 0.4219 = 2.25 - 0.4219 = 1.828
//
// With h = 2000, tw = 12, bf = 400, tf = 30:
//   a_w = (2000-60)/2 * 12 / (400*30) = 970*12/12000 = 0.97
//
//   Rh = (12 + 0.97*1.828) / (12 + 2*0.97)
//      = (12 + 1.773) / (12 + 1.94)
//      = 13.773 / 13.94
//      = 0.9880
//
// Reference: AISC 360-22 Section F5, AASHTO LRFD 6.10.1.10

#[test]
fn validation_pg_ext_hybrid_girder_factor() {
    let fyf: f64 = 460.0;       // MPa, flange yield (HPS 485W or equivalent)
    let fyw: f64 = 345.0;       // MPa, web yield (Grade 350)
    let h: f64 = 2000.0;        // mm, total depth
    let tw: f64 = 12.0;         // mm, web thickness
    let bf: f64 = 400.0;        // mm, flange width
    let tf: f64 = 30.0;         // mm, flange thickness

    // Web-to-compression-flange area ratio
    let hc: f64 = (h - 2.0 * tf) / 2.0; // = 970 mm (doubly symmetric)
    assert_close(hc, 970.0, 0.01, "hc half web depth (mm)");

    let aw: f64 = hc * tw / (bf * tf);
    assert_close(aw, 0.97, 0.02, "a_w web-to-flange area ratio");

    // Yield stress ratio
    let psi: f64 = fyw / fyf;
    assert_close(psi, 0.75, 0.01, "psi = Fyw/Fyf");

    // Hybrid factor numerator term
    let psi_term: f64 = 3.0 * psi - psi.powi(3);
    // 3*0.75 - 0.75^3 = 2.25 - 0.4219 = 1.828
    assert_close(psi_term, 1.828, 0.02, "3*psi - psi^3");

    // Rh calculation
    let rh_num: f64 = 12.0 + aw * psi_term;
    let rh_den: f64 = 12.0 + 2.0 * aw;
    let rh: f64 = rh_num / rh_den;

    // Rh = 13.773 / 13.94 = 0.9880
    assert_close(rh, 0.988, 0.02, "hybrid girder factor R_h");

    // Rh must be in range (0, 1.0]
    assert!(
        rh > 0.0 && rh <= 1.0,
        "R_h = {:.4} must be in (0, 1.0]", rh
    );

    // Verify homogeneous case: psi = 1.0 => Rh = 1.0
    let psi_homo: f64 = 1.0;
    let psi_term_homo: f64 = 3.0 * psi_homo - psi_homo.powi(3); // = 2.0
    let rh_homo: f64 = (12.0 + aw * psi_term_homo) / (12.0 + 2.0 * aw);
    assert_close(rh_homo, 1.0, 0.001, "R_h for homogeneous girder (must be 1.0)");

    // Verify more extreme hybrid: Fyf = 690, Fyw = 345 (psi = 0.5)
    let psi_ext: f64 = 0.5;
    let psi_term_ext: f64 = 3.0 * psi_ext - psi_ext.powi(3);
    // = 1.5 - 0.125 = 1.375
    assert_close(psi_term_ext, 1.375, 0.01, "psi_term for extreme hybrid");

    let rh_ext: f64 = (12.0 + aw * psi_term_ext) / (12.0 + 2.0 * aw);
    // = (12 + 0.97*1.375) / (12 + 1.94) = 13.334 / 13.94 = 0.9565
    assert_close(rh_ext, 0.9565, 0.02, "R_h for extreme hybrid (Fyf=690, Fyw=345)");

    // Larger hybrid reduction for extreme mismatch
    assert!(
        rh_ext < rh,
        "R_h_extreme = {:.4} < R_h_moderate = {:.4}", rh_ext, rh
    );

    // Moment capacity comparison:
    // For the hybrid girder, effective flange stress = Rh * Fyf
    let effective_stress: f64 = rh * fyf;
    assert!(
        effective_stress > fyw,
        "R_h*F_yf = {:.1} > F_yw = {:.1} => hybrid girder still advantageous",
        effective_stress, fyw
    );
}

// ================================================================
// 8. Deflection with Web Flexibility — Deep PG vs Compact Section
// ================================================================
//
// Deep plate girders have high I but also high h/tw ratios. This test
// compares a deep plate girder (h=1500mm, h/tw=150) with a compact
// W-section equivalent, both under the same loading on a simply
// supported span.
//
// Uses the solver to compute midspan deflection for each, then verifies:
//   (a) PG deflection matches theoretical delta = 5*q*L^4 / (384*E*I)
//   (b) PG deflects less than the compact section (higher I)
//
// Plate Girder: h=1500, tw=10, bf=350, tf=25
//   A = 2*350*25 + 1450*10 = 17500 + 14500 = 32000 mm^2
//   I_x = bf*h^3/12 - (bf-tw)*(h-2tf)^3/12
//       = 350*1500^3/12 - 340*1450^3/12
//       = 98,437,500,000 - 86,426,041,667 = 12,011,458,333 mm^4
//       = 1.201e10 mm^4
//
// Compact W-shape: Use W610x155 approximate (d=611, A=19800, Ix=1290e6)
//   Ix = 1.29e9 mm^4  (much less than PG)
//
// For L = 15 m, q = 50 kN/m:
//   delta_PG  = 5*50*15000^4 / (384*200e3*1.201e10) = ... (solver computes)
//   delta_W   = 5*50*15000^4 / (384*200e3*1.29e9)  = ... (solver computes)
//
// The PG should deflect about I_W/I_PG ≈ 1.29e9/1.201e10 ≈ 0.107 times
// as much => PG is about 9.3x stiffer in bending.
//
// Reference: Euler-Bernoulli beam theory, AISC Design Guide 3

#[test]
fn validation_pg_ext_deflection_web_flexibility() {
    let l: f64 = 15.0;          // m, span length
    let q: f64 = -50.0;         // kN/m, uniform distributed load (downward)
    let n: usize = 10;          // number of elements per beam
    let e_input: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
    let e_eff: f64 = e_input * 1000.0; // effective modulus in solver unit system

    // --- Plate Girder section properties (mm units for design context) ---
    // h=1500mm, tw=10mm, bf=350mm, tf=25mm
    let h_pg: f64 = 1500.0;     // mm
    let tw_pg: f64 = 10.0;      // mm
    let bf_pg: f64 = 350.0;     // mm
    let tf_pg: f64 = 25.0;      // mm

    let a_pg_mm2: f64 = 2.0 * bf_pg * tf_pg + (h_pg - 2.0 * tf_pg) * tw_pg;
    // = 2*350*25 + 1450*10 = 17500 + 14500 = 32000 mm^2
    assert_close(a_pg_mm2, 32_000.0, 0.01, "PG cross-sectional area (mm^2)");

    let ix_pg_mm4: f64 = bf_pg * h_pg.powi(3) / 12.0
        - (bf_pg - tw_pg) * (h_pg - 2.0 * tf_pg).powi(3) / 12.0;
    // = 350*1500^3/12 - 340*1450^3/12
    // = 98,437,500,000 - 86,426,041,667 = 12,011,458,333 mm^4

    // Verify I is in the expected range (about 1.2e10 mm^4)
    assert_close(ix_pg_mm4, 1.201e10, 0.02, "PG moment of inertia I_x (mm^4)");

    // --- Compact W-shape section properties (W610x155 equivalent) ---
    let a_w_mm2: f64 = 19_800.0;    // mm^2
    let ix_w_mm4: f64 = 1.29e9;     // mm^4

    // Convert to solver units: m^2 and m^4
    let a_pg_m2: f64 = a_pg_mm2 / 1.0e6;
    let ix_pg_m4: f64 = ix_pg_mm4 / 1.0e12;
    let a_w_m2: f64 = a_w_mm2 / 1.0e6;
    let ix_w_m4: f64 = ix_w_mm4 / 1.0e12;

    // PG should be much stiffer
    let stiffness_ratio: f64 = ix_pg_mm4 / ix_w_mm4;
    assert_close(stiffness_ratio, 9.31, 0.05, "I_PG / I_W stiffness ratio");

    // --- Analytical deflection in solver unit system ---
    // Solver uses: L (m), q (kN/m), E_eff (kPa = MPa*1000), I (m^4)
    // delta = 5*q*L^4 / (384*E_eff*I)  result in meters
    let delta_pg_theory: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * ix_pg_m4);
    let delta_w_theory: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * ix_w_m4);

    let deflection_ratio_theory: f64 = delta_w_theory / delta_pg_theory;
    assert_close(deflection_ratio_theory, stiffness_ratio, 0.02, "deflection ratio = stiffness ratio");

    // --- Solver verification for the plate girder ---
    let mut loads_pg = Vec::new();
    for i in 0..n {
        loads_pg.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input_pg = make_beam(
        n, l, e_input, a_pg_m2, ix_pg_m4,
        "pinned", Some("rollerX"), loads_pg,
    );
    let results_pg = linear::solve_2d(&input_pg).unwrap();

    // Midspan deflection from solver (in meters)
    let mid_node: usize = n / 2 + 1;
    let mid_d_pg = results_pg.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    // Compare solver result with analytical (both in meters)
    assert_close(
        mid_d_pg.uy.abs(), delta_pg_theory, 0.05,
        "PG midspan deflection: solver vs 5qL^4/(384EI)"
    );

    // --- Solver verification for the W-shape ---
    let mut loads_w = Vec::new();
    for i in 0..n {
        loads_w.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input_w = make_beam(
        n, l, e_input, a_w_m2, ix_w_m4,
        "pinned", Some("rollerX"), loads_w,
    );
    let results_w = linear::solve_2d(&input_w).unwrap();

    let mid_d_w = results_w.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap();

    // Compare solver result with analytical (both in meters)
    assert_close(
        mid_d_w.uy.abs(), delta_w_theory, 0.05,
        "W-shape midspan deflection: solver vs 5qL^4/(384EI)"
    );

    // PG deflects less than W-shape (deeper section, much higher I)
    assert!(
        mid_d_pg.uy.abs() < mid_d_w.uy.abs(),
        "PG deflection ({:.6e} m) < W-shape deflection ({:.6e} m)",
        mid_d_pg.uy.abs(), mid_d_w.uy.abs()
    );

    // Verify the deflection ratio matches the stiffness ratio
    let solver_ratio: f64 = mid_d_w.uy.abs() / mid_d_pg.uy.abs();
    assert_close(
        solver_ratio, stiffness_ratio, 0.05,
        "solver deflection ratio vs theoretical stiffness ratio"
    );

    // Serviceability check: L/360 for live load (convert to meters)
    let l_360_m: f64 = l / 360.0;
    assert!(
        mid_d_pg.uy.abs() < l_360_m,
        "PG deflection {:.4e} m < L/360 = {:.4e} m (serviceable)",
        mid_d_pg.uy.abs(), l_360_m
    );
}
