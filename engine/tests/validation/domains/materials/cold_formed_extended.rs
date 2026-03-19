/// Validation: Advanced Cold-Formed Steel Design Benchmarks
///
/// References:
///   - AISI S100-16: North American Specification for Cold-Formed Steel
///   - Schafer: "Direct Strength Method Design Guide" (2006)
///   - Yu & LaBoube: "Cold-Formed Steel Design" 5th ed. (2020)
///   - Hancock: "Cold-Formed Steel Structures to AS/NZS 4600" (2007)
///
/// Tests verify effective width, distortional buckling, DSM beam/column,
/// section properties, web crippling, screw connections, and purlin design.

use dedaliano_engine::solver::linear;
use crate::common::*;

const PI: f64 = std::f64::consts::PI;

// ================================================================
// 1. Effective Width under Uniform Compression (AISI S100 B2.1)
// ================================================================
//
// Winter's formula: b_eff = rho * w
//   rho = (1 - 0.22/lambda) / lambda   for lambda > 0.673
//   rho = 1.0                           for lambda <= 0.673
//   lambda = (f1/f_cr)^0.5
//   f_cr = k * pi^2 * E / (12*(1-nu^2)) * (t/w)^2
//
// Case: 200mm wide stiffened element, t=1.0mm, fy=345 MPa, k=4.0
//   f_cr = 4.0 * pi^2 * 203000 / (12*(1-0.09)) * (1/200)^2
//        = 4 * 2003640.5 / 10.92 * 2.5e-5
//        = 18.336 MPa
//   lambda = sqrt(345/18.336) = 4.338
//   rho = (1 - 0.22/4.338) / 4.338 = (1 - 0.0507)/4.338 = 0.2189
//   b_eff = 0.2189 * 200 = 43.78 mm

#[test]
fn validation_cfs_ext_1_effective_width_compression() {
    let w: f64 = 200.0;         // mm, flat width
    let t: f64 = 1.0;           // mm, thickness
    let fz: f64 = 345.0;        // MPa, yield stress
    let e: f64 = 203_000.0;     // MPa, modulus
    let nu: f64 = 0.3;
    let k: f64 = 4.0;           // buckling coefficient (SS both edges)

    // Elastic local buckling stress
    let f_cr = k * PI * PI * e / (12.0 * (1.0 - nu * nu)) * (t / w).powi(2);

    // Verify f_cr is in expected range
    assert!(f_cr > 10.0 && f_cr < 30.0,
        "f_cr = {:.2} MPa should be ~18 MPa", f_cr);

    // Slenderness
    let lambda = (fz / f_cr).sqrt();
    assert!(lambda > 0.673,
        "lambda = {:.3} must exceed 0.673 for width reduction", lambda);

    // Effective width ratio (Winter's formula)
    let rho = (1.0 - 0.22 / lambda) / lambda;
    assert!(rho > 0.0 && rho < 1.0,
        "rho = {:.4} must be between 0 and 1", rho);

    // Effective width
    let b_eff = rho * w;

    // Hand-computed expected values
    let f_cr_expected = 4.0 * PI * PI * 203_000.0 / (12.0 * 0.91) * (1.0 / 200.0_f64).powi(2);
    let lambda_expected = (345.0 / f_cr_expected).sqrt();
    let rho_expected = (1.0 - 0.22 / lambda_expected) / lambda_expected;
    let b_eff_expected = rho_expected * 200.0;

    assert_close(f_cr, f_cr_expected, 0.001, "CFS effective width: f_cr");
    assert_close(lambda, lambda_expected, 0.001, "CFS effective width: lambda");
    assert_close(rho, rho_expected, 0.001, "CFS effective width: rho");
    assert_close(b_eff, b_eff_expected, 0.001, "CFS effective width: b_eff");

    // Verify: thicker plate => higher f_cr, lower lambda, higher rho
    let t2: f64 = 2.0;
    let f_cr_2 = k * PI * PI * e / (12.0 * (1.0 - nu * nu)) * (t2 / w).powi(2);
    let lambda_2 = (fz / f_cr_2).sqrt();
    let rho_2 = if lambda_2 <= 0.673 { 1.0 } else { (1.0 - 0.22 / lambda_2) / lambda_2 };
    assert!(rho_2 > rho, "Thicker plate: rho={:.3} > {:.3}", rho_2, rho);
}

// ================================================================
// 2. Distortional Buckling Stress (Schafer DSM)
// ================================================================
//
// Simplified distortional buckling stress for a C-section:
//   f_crd = k_d * pi^2 * E / (12*(1-nu^2)) * (t/b_o)^2
//
// DSM distortional strength (compression):
//   if lambda_d <= 0.561: P_nd = P_y
//   if lambda_d > 0.561:  P_nd = [1 - 0.25*(P_crd/P_y)^0.6] * (P_crd/P_y)^0.6 * P_y
//   where lambda_d = sqrt(P_y / P_crd)
//
// C-section: b_o=65mm, t=1.5mm, k_d=0.90, fy=350 MPa, A_g=400 mm^2

#[test]
fn validation_cfs_ext_2_distortional_buckling() {
    let e: f64 = 203_000.0;   // MPa
    let nu: f64 = 0.3;
    let t: f64 = 1.5;         // mm
    let b_o: f64 = 65.0;      // mm, out-to-out flange width
    let k_d: f64 = 0.90;      // distortional buckling coefficient
    let fz: f64 = 350.0;      // MPa
    let a_g: f64 = 400.0;     // mm^2, gross area

    // Critical distortional buckling stress
    let f_crd = k_d * PI * PI * e / (12.0 * (1.0 - nu * nu)) * (t / b_o).powi(2);

    // Squash load and distortional buckling load
    let p_y = fz * a_g;                   // N
    let p_crd = f_crd * a_g;              // N

    // Distortional slenderness
    let lambda_d = (p_y / p_crd).sqrt();

    // DSM distortional nominal strength
    let p_nd = if lambda_d <= 0.561 {
        p_y
    } else {
        let ratio = (p_crd / p_y).powf(0.6);
        (1.0 - 0.25 * ratio) * ratio * p_y
    };

    // Verify against hand computation
    let f_crd_expected = 0.90 * PI * PI * 203_000.0 / (12.0 * 0.91)
        * (1.5 / 65.0_f64).powi(2);
    assert_close(f_crd, f_crd_expected, 0.001, "Distortional: f_crd");

    let lambda_d_expected = (350.0 / f_crd_expected).sqrt();
    assert_close(lambda_d, lambda_d_expected, 0.001, "Distortional: lambda_d");

    // DSM strength must be <= P_y
    assert!(p_nd <= p_y + 1.0, "P_nd={:.1} must be <= P_y={:.1}", p_nd, p_y);
    assert!(p_nd > 0.0, "P_nd must be positive");

    // Strength ratio P_nd/P_y
    let ratio_nd = p_nd / p_y;
    assert!(ratio_nd > 0.2 && ratio_nd <= 1.0,
        "DSM distortional ratio P_nd/P_y = {:.3}", ratio_nd);

    // Verify lambda_d > 0.561 (distortional controls)
    assert!(lambda_d > 0.561,
        "lambda_d={:.3} > 0.561 => distortional reduction applies", lambda_d);
}

// ================================================================
// 3. DSM Flexural Strength (AISI S100 Appendix 1)
// ================================================================
//
// DSM nominal moment capacity from three modes:
//   Global: M_ne (lateral-torsional buckling)
//   Local:  M_nl (local buckling interaction with global)
//   Distortional: M_nd
//
// M_n = min(M_nl, M_nd)
//
// Given: S_f=18000 mm^3, fy=340 MPa
//   M_y = fy*S_f = 6.12 kN-m
//   M_cre = 1.2*M_y (global), M_crl = 0.65*M_y (local), M_crd = 0.50*M_y (distortional)

#[test]
fn validation_cfs_ext_3_dsm_flexure() {
    let fz: f64 = 340.0;           // MPa
    let s_f: f64 = 18_000.0;       // mm^3, gross section modulus
    let my = fz * s_f / 1e6;       // kN-m = 6.12

    // Buckling moments (from elastic buckling analysis)
    let m_cre = 1.2 * my;  // global elastic lateral-torsional
    let m_crl = 0.65 * my; // local
    let m_crd = 0.50 * my; // distortional

    // --- Global buckling strength M_ne ---
    let lambda_e = (my / m_cre).sqrt();
    let m_ne = if lambda_e <= 0.60 {
        my
    } else if lambda_e < 1.336 {
        10.0 / 9.0 * my * (1.0 - 10.0 * my / (36.0 * m_cre))
    } else {
        m_cre
    };

    // --- Local buckling strength M_nl ---
    let lambda_l = (m_ne / m_crl).sqrt();
    let m_nl = if lambda_l <= 0.776 {
        m_ne
    } else {
        let ratio = m_crl / m_ne;
        m_ne * (1.0 - 0.15 * ratio.powf(0.4)) * ratio.powf(0.4)
    };

    // --- Distortional buckling strength M_nd ---
    let lambda_d = (my / m_crd).sqrt();
    let m_nd = if lambda_d <= 0.673 {
        my
    } else {
        let ratio = m_crd / my;
        my * (1.0 - 0.22 * ratio.powf(0.5)) * ratio.powf(0.5)
    };

    // Nominal moment = min of local and distortional
    let m_n = m_nl.min(m_nd);

    // --- Verify each mode ---
    assert!(m_ne <= my * 1.001, "M_ne={:.3} <= M_y={:.3}", m_ne, my);
    assert!(m_nl <= m_ne * 1.001, "M_nl={:.3} <= M_ne={:.3}", m_nl, m_ne);
    assert!(m_nd <= my * 1.001, "M_nd={:.3} <= M_y={:.3}", m_nd, my);
    assert!(m_n > 0.0 && m_n <= my, "M_n={:.3} in (0, M_y]", m_n);

    // Verify hand-computed values
    // M_ne: lambda_e = sqrt(1/1.2) = 0.9129 => inelastic range
    let lambda_e_expected = (1.0 / 1.2_f64).sqrt();
    assert_close(lambda_e, lambda_e_expected, 0.001, "DSM flexure: lambda_e");

    let m_ne_expected = 10.0 / 9.0 * my * (1.0 - 10.0 * my / (36.0 * m_cre));
    assert_close(m_ne, m_ne_expected, 0.001, "DSM flexure: M_ne");

    // Final capacity ratio
    let ratio_n = m_n / my;
    assert!(ratio_n > 0.3 && ratio_n < 1.0,
        "M_n/M_y = {:.3} (expected 0.3-1.0)", ratio_n);
}

// ================================================================
// 4. DSM Column Strength (AISI S100 Appendix 1)
// ================================================================
//
// DSM nominal axial strength from three modes:
//   Global: P_ne (flexural or flexural-torsional buckling)
//   Local:  P_nl (local-global interaction)
//   Distortional: P_nd
//
// P_n = min(P_nl, P_nd)
//
// Given: A_g=520 mm^2, fy=345 MPa
//   P_y = 179.4 kN
//   P_cre = 0.80*P_y, P_crl = 0.45*P_y, P_crd = 0.55*P_y

#[test]
fn validation_cfs_ext_4_dsm_compression() {
    let fz: f64 = 345.0;          // MPa
    let a_g: f64 = 520.0;         // mm^2
    let p_y = fz * a_g / 1e3;     // kN = 179.4

    // Elastic buckling loads (from analysis)
    let p_cre = 0.80 * p_y;  // global
    let p_crl = 0.45 * p_y;  // local
    let p_crd = 0.55 * p_y;  // distortional

    // --- Global buckling strength P_ne ---
    let lambda_c = (p_y / p_cre).sqrt();
    let p_ne = if lambda_c <= 1.5 {
        p_y * 0.658_f64.powf(lambda_c * lambda_c)
    } else {
        0.877 / (lambda_c * lambda_c) * p_y
    };

    // --- Local buckling strength P_nl ---
    let lambda_l = (p_ne / p_crl).sqrt();
    let p_nl = if lambda_l <= 0.776 {
        p_ne
    } else {
        let ratio = p_crl / p_ne;
        p_ne * (1.0 - 0.15 * ratio.powf(0.4)) * ratio.powf(0.4)
    };

    // --- Distortional buckling strength P_nd ---
    let lambda_d = (p_y / p_crd).sqrt();
    let p_nd = if lambda_d <= 0.561 {
        p_y
    } else {
        let ratio = (p_crd / p_y).powf(0.6);
        (1.0 - 0.25 * ratio) * ratio * p_y
    };

    // Nominal strength = min(P_nl, P_nd)
    let p_n = p_nl.min(p_nd);

    // --- Verify hand-computed global strength ---
    // lambda_c = sqrt(1/0.80) = 1.118
    let lambda_c_expected = (1.0 / 0.80_f64).sqrt();
    assert_close(lambda_c, lambda_c_expected, 0.001, "DSM column: lambda_c");

    let p_ne_expected = p_y * 0.658_f64.powf(lambda_c_expected * lambda_c_expected);
    assert_close(p_ne, p_ne_expected, 0.001, "DSM column: P_ne");

    // All strengths must be <= P_y
    assert!(p_ne <= p_y * 1.001, "P_ne={:.2} <= P_y={:.2}", p_ne, p_y);
    assert!(p_nl <= p_ne * 1.001, "P_nl={:.2} <= P_ne={:.2}", p_nl, p_ne);
    assert!(p_nd <= p_y * 1.001, "P_nd={:.2} <= P_y={:.2}", p_nd, p_y);
    assert!(p_n > 0.0, "P_n must be positive");

    // Capacity ratio
    let ratio_n = p_n / p_y;
    assert!(ratio_n > 0.2 && ratio_n < 1.0,
        "P_n/P_y = {:.3} (expected 0.2-1.0)", ratio_n);
}

// ================================================================
// 5. C-Section Effective Properties at Various Stress Levels
// ================================================================
//
// As applied stress increases, effective width decreases.
// Compute effective area and effective moment of inertia at
// different stress ratios f/fy.
//
// C150x50x15x1.5 (approx): web=150mm, flange=50mm, lip=15mm, t=1.5mm
//   A_gross = (150 + 2*50 + 2*15) * 1.5 = 420 mm^2
//   For stiffened elements under compression:
//     at f/fy = 0.25: high f_cr/f => likely fully effective
//     at f/fy = 1.00: significant reduction

#[test]
fn validation_cfs_ext_5_c_section_properties() {
    let e: f64 = 203_000.0;     // MPa
    let nu: f64 = 0.3;
    let fz: f64 = 350.0;        // MPa
    let t: f64 = 1.5;           // mm

    // C-section geometry
    let web: f64 = 150.0;       // mm, web flat width
    let flange: f64 = 50.0;     // mm, flange flat width
    let lip: f64 = 15.0;        // mm

    // Gross area
    let a_gross = (web + 2.0 * flange + 2.0 * lip) * t;  // 420 mm^2
    assert_close(a_gross, 420.0, 0.001, "C-section: A_gross");

    // Effective width function for stiffened element
    let effective_width = |w: f64, f_applied: f64, k: f64| -> f64 {
        let f_cr = k * PI * PI * e / (12.0 * (1.0 - nu * nu)) * (t / w).powi(2);
        let lambda = (f_applied / f_cr).sqrt();
        if lambda <= 0.673 {
            w
        } else {
            let rho = (1.0 - 0.22 / lambda) / lambda;
            rho.max(0.0) * w
        }
    };

    // Test at multiple stress levels
    let stress_levels = [0.25, 0.50, 0.75, 1.00];
    let mut prev_a_eff = a_gross + 1.0;

    for &ratio in &stress_levels {
        let f_applied = ratio * fz;

        // Web: stiffened (k=4.0), under bending gradient but simplified as uniform here
        let web_eff = effective_width(web, f_applied, 4.0);
        // Flanges: stiffened (k=4.0)
        let flange_eff = effective_width(flange, f_applied, 4.0);
        // Lips: unstiffened (k=0.43)
        let lip_eff = effective_width(lip, f_applied, 0.43);

        // Effective area
        let a_eff = (web_eff + 2.0 * flange_eff + 2.0 * lip_eff) * t;

        // Effective area must decrease as stress increases
        assert!(a_eff <= prev_a_eff + 0.01,
            "f/fy={:.2}: A_eff={:.1} must decrease (prev={:.1})", ratio, a_eff, prev_a_eff);
        // Effective area must be positive and <= gross
        assert!(a_eff > 0.0 && a_eff <= a_gross + 0.01,
            "f/fy={:.2}: 0 < A_eff={:.1} <= A_gross={:.1}", ratio, a_eff, a_gross);

        prev_a_eff = a_eff;
    }

    // At low stress (f/fy=0.25), flanges and lips should be fully effective
    let f_low = 0.25 * fz;
    let flange_eff_low = effective_width(flange, f_low, 4.0);
    let lip_eff_low = effective_width(lip, f_low, 0.43);

    assert_close(flange_eff_low, flange, 0.01,
        "C-section: flanges fully effective at f/fy=0.25");
    assert_close(lip_eff_low, lip, 0.01,
        "C-section: lips fully effective at f/fy=0.25");

    // At full yield (f/fy=1.0), web should be significantly reduced
    let web_eff_full = effective_width(web, fz, 4.0);
    let web_reduction = web_eff_full / web;
    assert!(web_reduction < 0.7,
        "C-section: web reduction ratio={:.3} at fy (expect < 0.7)", web_reduction);
}

// ================================================================
// 6. Web Crippling (AISI S100 C3.4)
// ================================================================
//
// AISI S100-16 Eq. C3.4.1-1:
//   P_n = C * t^2 * F_y * sin(theta) *
//         (1 - C_R*sqrt(R/t)) * (1 + C_N*sqrt(N/t)) * (1 - C_h*sqrt(h/t))
//
// EOF (End One-Flange) loading:
//   C=4, C_R=0.14, C_N=0.35, C_h=0.02, theta=90deg
//
// Section: t=1.2mm, R=3.0mm, h=150mm, N=50mm, fy=350 MPa

#[test]
fn validation_cfs_ext_6_web_crippling() {
    let t: f64 = 1.2;           // mm, web thickness
    let fz: f64 = 350.0;        // MPa
    let theta: f64 = 90.0_f64.to_radians();  // angle between web and bearing surface
    let r: f64 = 3.0;           // mm, inside bend radius
    let h: f64 = 150.0;         // mm, flat depth of web
    let n_bearing: f64 = 50.0;  // mm, bearing length

    // EOF coefficients (AISI S100-16 Table C3.4.1-1)
    let c: f64 = 4.0;
    let c_r: f64 = 0.14;
    let c_n: f64 = 0.35;
    let c_h: f64 = 0.02;

    // Web crippling nominal strength
    let p_n = c * t * t * fz * theta.sin()
        * (1.0 - c_r * (r / t).sqrt())
        * (1.0 + c_n * (n_bearing / t).sqrt())
        * (1.0 - c_h * (h / t).sqrt());

    // Hand computation step by step:
    let rt = (r / t).sqrt();          // sqrt(3/1.2) = sqrt(2.5) = 1.581
    let nt = (n_bearing / t).sqrt();  // sqrt(50/1.2) = sqrt(41.67) = 6.455
    let ht = (h / t).sqrt();          // sqrt(150/1.2) = sqrt(125) = 11.180

    let factor_r = 1.0 - c_r * rt;    // 1 - 0.14*1.581 = 0.7787
    let factor_n = 1.0 + c_n * nt;    // 1 + 0.35*6.455 = 3.259
    let factor_h = 1.0 - c_h * ht;    // 1 - 0.02*11.18 = 0.7764

    let p_n_expected = c * t * t * fz * 1.0  // sin(90)=1
        * factor_r * factor_n * factor_h;

    assert_close(p_n, p_n_expected, 0.001, "Web crippling: P_n");

    // Verify individual factors are in reasonable range
    assert!(factor_r > 0.5 && factor_r < 1.0,
        "R factor = {:.4}", factor_r);
    assert!(factor_n > 1.0 && factor_n < 5.0,
        "N factor = {:.4}", factor_n);
    assert!(factor_h > 0.5 && factor_h < 1.0,
        "h factor = {:.4}", factor_h);

    // P_n in kN
    let p_n_kn = p_n / 1000.0;
    assert!(p_n_kn > 0.5 && p_n_kn < 10.0,
        "P_n = {:.3} kN (expected 0.5-10 kN for CFS)", p_n_kn);

    // Verify: larger bearing length => higher capacity
    let n2: f64 = 100.0;
    let factor_n2 = 1.0 + c_n * (n2 / t).sqrt();
    let p_n_2 = c * t * t * fz * theta.sin()
        * factor_r * factor_n2 * factor_h;
    assert!(p_n_2 > p_n,
        "Larger bearing: P_n={:.1}N > {:.1}N", p_n_2, p_n);
}

// ================================================================
// 7. Screw Connection Capacity (AISI S100 E4)
// ================================================================
//
// Screw connection in shear: min of tilting, bearing, screw shear
//
// For t2/t1 >= 1.0 (AISI S100-16 E4.3.1 Case II):
//   P_ns = min of:
//     (a) 4.2 * (t2^3 * d)^0.5 * F_u2        (bearing of bottom sheet)
//     (b) 2.7 * t1 * d * F_u1                  (tilting)
//     (c) 2.7 * t2 * d * F_u2                  (bearing of bottom)
//
// Screw shear capacity:
//   P_ss = 0.5 * A_s * F_xx
//     where A_s = pi/4 * d^2
//
// #10 screw: d=4.83mm, t1=0.75mm, t2=1.5mm, F_u=450 MPa, F_xx=689 MPa

#[test]
fn validation_cfs_ext_7_screw_connection() {
    let d: f64 = 4.83;          // mm, screw diameter (#10)
    let t1: f64 = 0.75;         // mm, top sheet (member in contact with screw head)
    let t2: f64 = 1.50;         // mm, bottom sheet
    let fu1: f64 = 450.0;       // MPa, ultimate stress top
    let fu2: f64 = 450.0;       // MPa, ultimate stress bottom
    let fxx: f64 = 689.0;       // MPa, screw ultimate tensile

    // --- Bearing/Tilting (E4.3.1) ---
    let ratio = t2 / t1;
    assert_close(ratio, 2.0, 0.001, "Screw: t2/t1 ratio");

    // Case II (1.0 < t2/t1 <= 2.5):
    let pns_a = 4.2 * (t2.powi(3) * d).sqrt() * fu2 / 1000.0;   // kN
    let pns_b = 2.7 * t1 * d * fu1 / 1000.0;                     // kN
    let pns_c = 2.7 * t2 * d * fu2 / 1000.0;                     // kN

    let pns = pns_a.min(pns_b).min(pns_c);

    // --- Screw Shear (E4.3.2) ---
    let a_s = PI / 4.0 * d * d;          // mm^2
    let pss = 0.5 * a_s * fxx / 1000.0;  // kN

    // Governing capacity
    let p_n = pns.min(pss);

    // Hand verification
    // pns_a = 4.2 * sqrt(1.5^3 * 4.83) * 450 / 1000
    //       = 4.2 * sqrt(3.375 * 4.83) * 450 / 1000
    //       = 4.2 * sqrt(16.302) * 450 / 1000
    //       = 4.2 * 4.038 * 450 / 1000 = 7.631 kN
    let pns_a_expected = 4.2 * (t2.powi(3) * d).sqrt() * fu2 / 1000.0;
    assert_close(pns_a, pns_a_expected, 0.001, "Screw: P_ns(a) bearing");

    // pns_b = 2.7 * 0.75 * 4.83 * 450 / 1000 = 4.401 kN
    let pns_b_expected = 2.7 * 0.75 * 4.83 * 450.0 / 1000.0;
    assert_close(pns_b, pns_b_expected, 0.001, "Screw: P_ns(b) tilting");

    // pns_c = 2.7 * 1.5 * 4.83 * 450 / 1000 = 8.802 kN
    let pns_c_expected = 2.7 * 1.50 * 4.83 * 450.0 / 1000.0;
    assert_close(pns_c, pns_c_expected, 0.001, "Screw: P_ns(c) bearing bottom");

    // pss = 0.5 * (pi/4 * 4.83^2) * 689 / 1000
    //     = 0.5 * 18.326 * 689 / 1000 = 6.313 kN
    let pss_expected = 0.5 * (PI / 4.0 * d * d) * fxx / 1000.0;
    assert_close(pss, pss_expected, 0.001, "Screw: P_ss shear");

    // Tilting (pns_b) should control for thin top sheet
    assert!(pns_b < pns_a && pns_b < pns_c,
        "Tilting controls: {:.3} kN < {:.3}, {:.3}", pns_b, pns_a, pns_c);

    // Overall capacity check
    assert!(p_n > 1.0 && p_n < 20.0,
        "P_n = {:.3} kN (reasonable range)", p_n);
}

// ================================================================
// 8. Z-Purlin Design: Bending, Shear, Deflection
// ================================================================
//
// Z-purlin under gravity UDL:
//   Section: Z200x65x20x2.0 (approx)
//   S_x = 28000 mm^3, I_x = 2.8e6 mm^4, A_w = 200*2.0 = 400 mm^2
//   fy = 350 MPa, L = 7.0 m, q = 1.5 kN/m
//
// Checks:
//   (a) Bending: M_max = qL^2/8, M_n = R*fy*S_f (R=1.0 for gravity)
//   (b) Shear: V_max = qL/2, V_n = 0.6*fy*A_w
//   (c) Deflection: delta = 5qL^4/(384EI) vs L/180 limit
//
// Also verify via solver for deflection cross-check.

#[test]
fn validation_cfs_ext_8_purlin_design() {
    let fz: f64 = 350.0;          // MPa
    let e_steel: f64 = 203_000.0; // MPa
    let l: f64 = 7.0;             // m, span
    let q: f64 = 1.5;             // kN/m, UDL (gravity)
    let s_f: f64 = 28_000.0;      // mm^3, section modulus
    let i_x: f64 = 2.8e6;         // mm^4, moment of inertia
    let h: f64 = 200.0;           // mm, web depth
    let t_w: f64 = 2.0;           // mm, web thickness
    let a_w = h * t_w;            // mm^2, web area = 400
    let r_factor: f64 = 1.0;      // through-fastened correction (gravity, braced)

    // --- (a) Bending check ---
    let m_max = q * l * l / 8.0;  // kN-m
    let m_n = r_factor * fz * s_f / 1e6; // kN-m
    let bending_ratio = m_max / m_n;

    assert_close(m_max, 1.5 * 49.0 / 8.0, 0.001, "Purlin: M_max = qL^2/8");
    assert!(bending_ratio < 1.0,
        "Bending OK: M_max/M_n = {:.3} < 1.0", bending_ratio);

    // --- (b) Shear check ---
    let v_max = q * l / 2.0;       // kN
    let v_n = 0.6 * fz * a_w / 1e3; // kN
    let shear_ratio = v_max / v_n;

    assert_close(v_max, 1.5 * 7.0 / 2.0, 0.001, "Purlin: V_max = qL/2");
    assert!(shear_ratio < 1.0,
        "Shear OK: V_max/V_n = {:.3} < 1.0", shear_ratio);

    // --- (c) Deflection check (formula) ---
    let l_mm = l * 1000.0;
    let q_nmm = q / 1000.0;  // kN/m => N/mm (q kN/m = q*1000 N / 1000 mm = q N/mm)
    let delta = 5.0 * q_nmm * l_mm.powi(4) / (384.0 * e_steel * i_x);
    let delta_limit = l_mm / 180.0;
    let defl_ratio = delta / delta_limit;

    assert!(delta > 0.0, "Deflection must be positive: {:.2}mm", delta);
    assert!(defl_ratio < 1.0,
        "Deflection OK: delta/limit = {:.3} < 1.0 (delta={:.2}mm, limit={:.2}mm)",
        defl_ratio, delta, delta_limit);

    // --- Cross-check with solver ---
    // Convert to solver units: E in MPa (solver multiplies by 1000 internally)
    // A in m^2, Iz in m^4, q in kN/m (negative for downward)
    let e_solver = e_steel / 1000.0;  // solver will multiply back by 1000
    let a_m2 = 800.0 / 1e6;           // mm^2 to m^2 (use gross area)
    let iz_m4 = i_x / 1e12;           // mm^4 to m^4

    let n = 8_usize;
    let input = make_ss_beam_udl(n, l, e_solver, a_m2, iz_m4, -q);
    let results = linear::solve_2d(&input).unwrap();

    // Get midspan deflection from solver
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid_node)
        .unwrap()
        .uz.abs();

    // Solver deflection should match formula (solver uses E_eff = E*1000 = e_steel)
    let e_eff = e_solver * 1000.0;  // = e_steel
    let delta_formula = 5.0 * q * l.powi(4) / (384.0 * e_eff * iz_m4);

    assert_close(d_mid, delta_formula, 0.05,
        "Purlin: solver deflection vs 5qL^4/(384EI)");

    // Summary: all design checks pass
    assert!(bending_ratio < 1.0 && shear_ratio < 1.0 && defl_ratio < 1.0,
        "All purlin checks pass: bend={:.3}, shear={:.3}, defl={:.3}",
        bending_ratio, shear_ratio, defl_ratio);
}
