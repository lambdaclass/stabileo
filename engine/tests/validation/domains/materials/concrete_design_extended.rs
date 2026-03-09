/// Validation: Extended Reinforced Concrete Design Benchmarks
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1:2004 (EC2): Design of Concrete Structures
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///   - Gergely & Lutz: "Maximum Crack Width in RC Flexural Members",
///     ACI SP-20, 1968
///   - Branson: "Deformation of Concrete Structures", McGraw-Hill, 1977
///
/// Tests verify advanced RC design capacity formulas with hand-computed
/// expected values. No solver calls -- pure arithmetic verification.

use crate::common::*;

use std::f64::consts::PI;

// ================================================================
// 1. Doubly Reinforced Beam Moment Capacity (ACI 318-19)
// ================================================================
//
// Doubly reinforced beam with compression steel that DOES yield.
// Mn = (As - As')*fy*(d - a/2) + As'*fy*(d - d')
// where a = (As - As')*fy / (0.85*f'c*b)
//
// Given: f'c = 30 MPa, fy = 420 MPa, b = 350 mm, d = 550 mm, d' = 50 mm
//        As = 3600 mm^2 (tension), As' = 1000 mm^2 (compression)
//        Es = 200,000 MPa, eps_cu = 0.003
//
// Net tension steel: As - As' = 2600 mm^2
// a = 2600*420 / (0.85*30*350) = 1,092,000 / 8,925 = 122.35 mm
// c = a / beta1 = 122.35 / 0.836 = 146.35 mm  (beta1 = 0.85 - 0.05*(30-28)/7 = 0.836)
//   Actually for f'c = 30 MPa: beta1 = 0.85 - 0.05*(30-28)/7 = 0.85 - 0.0143 = 0.836
//   Wait, ACI formula: beta1 = 0.85 for f'c <= 28, then decreases by 0.05 per 7 MPa.
//   beta1 = max(0.65, 0.85 - 0.05*(f'c - 28)/7)
//   beta1 = 0.85 - 0.05*(30-28)/7 = 0.85 - 0.01429 = 0.8357
//   c = 122.35 / 0.8357 = 146.41 mm
//
// Check compression steel yields:
//   eps_s' = 0.003*(c - d')/c = 0.003*(146.41 - 50)/146.41 = 0.001975
//   eps_y = 420/200000 = 0.0021
//   eps_s' = 0.001975 < eps_y = 0.0021 => compression steel does NOT yield
//
// Since compression steel doesn't yield, we need quadratic solution.
// Let's pick parameters where it DOES yield to keep the test simpler:
//
// Use: f'c = 28 MPa (beta1 = 0.85), d' = 40 mm, d = 560 mm, b = 300 mm
//   As = 3500 mm^2, As' = 1000 mm^2
//   a = (3500-1000)*420 / (0.85*28*300) = 1,050,000 / 7,140 = 147.06 mm
//   c = 147.06 / 0.85 = 173.01 mm
//   eps_s' = 0.003*(173.01 - 40)/173.01 = 0.003*133.01/173.01 = 0.002307
//   eps_y = 0.0021
//   eps_s' > eps_y => compression steel yields!
//
// Mn = (As-As')*fy*(d - a/2) + As'*fy*(d - d')
//    = 2500*420*(560 - 73.53) + 1000*420*(560 - 40)
//    = 2500*420*486.47 + 1000*420*520
//    = 510,793,500 + 218,400,000
//    = 729,193,500 N*mm = 729.19 kN*m

#[test]
fn validation_rc_ext_1_doubly_reinforced_moment() {
    let fc: f64 = 28.0;        // MPa
    let fy: f64 = 420.0;       // MPa
    let es_mod: f64 = 200_000.0;
    let b: f64 = 300.0;        // mm
    let d: f64 = 560.0;        // mm
    let d_prime: f64 = 40.0;   // mm
    let as_tens: f64 = 3500.0; // mm^2
    let as_comp: f64 = 1000.0; // mm^2
    let beta1: f64 = 0.85;     // f'c <= 28 MPa
    let eps_cu: f64 = 0.003;

    // Stress block depth
    let a: f64 = (as_tens - as_comp) * fy / (0.85 * fc * b);
    let expected_a: f64 = 2500.0 * 420.0 / (0.85 * 28.0 * 300.0);
    assert_close(a, expected_a, 0.01, "Doubly reinforced stress block depth a");

    // Neutral axis depth
    let c: f64 = a / beta1;
    let expected_c: f64 = expected_a / 0.85;
    assert_close(c, expected_c, 0.01, "Neutral axis depth c");

    // Verify compression steel yields
    let eps_s_prime: f64 = eps_cu * (c - d_prime) / c;
    let eps_y: f64 = fy / es_mod;
    assert!(
        eps_s_prime >= eps_y,
        "Compression steel must yield: eps_s'={:.6} >= eps_y={:.6}",
        eps_s_prime, eps_y
    );

    // Nominal moment capacity using two-couple method
    let mn_couple1: f64 = (as_tens - as_comp) * fy * (d - a / 2.0); // N*mm
    let mn_couple2: f64 = as_comp * fy * (d - d_prime);               // N*mm
    let mn: f64 = mn_couple1 + mn_couple2;
    let mn_knm: f64 = mn / 1e6;

    let expected_mn_couple1: f64 = 2500.0 * 420.0 * (560.0 - expected_a / 2.0);
    let expected_mn_couple2: f64 = 1000.0 * 420.0 * 520.0;
    let expected_mn_knm: f64 = (expected_mn_couple1 + expected_mn_couple2) / 1e6;
    assert_close(mn_knm, expected_mn_knm, 0.01, "Doubly reinforced Mn");

    // Verify tension-controlled (eps_t >= 0.005)
    let eps_t: f64 = eps_cu * (d - c) / c;
    assert!(
        eps_t >= 0.005,
        "Section must be tension-controlled: eps_t={:.6}", eps_t
    );

    let _ = PI;
}

// ================================================================
// 2. T-Beam Effective Flange Width (ACI 318-19 section 6.3.2)
// ================================================================
//
// Interior T-beam effective flange width:
//   b_eff = min(L/4, bw + 16*hf, center-to-center spacing s)
//
// Given: L = 9000 mm, bw = 350 mm, hf = 120 mm, s = 2800 mm
//   L/4 = 2250
//   bw + 16*hf = 350 + 1920 = 2270
//   s = 2800
//   b_eff = min(2250, 2270, 2800) = 2250 mm
//
// T-beam moment capacity (NA in flange, a <= hf):
//   As = 2400 mm^2, fy = 420 MPa, f'c = 25 MPa, d = 500 mm
//   a = As*fy / (0.85*f'c*b_eff) = 2400*420 / (0.85*25*2250)
//     = 1,008,000 / 47,812.5 = 21.08 mm  (< hf=120 => NA in flange)
//   Mn = As*fy*(d - a/2) = 2400*420*(500 - 10.54)
//      = 1,008,000 * 489.46 = 493,375,680 N*mm = 493.38 kN*m

#[test]
fn validation_rc_ext_2_t_beam_effective_width() {
    let span: f64 = 9000.0;    // mm
    let bw: f64 = 350.0;       // mm, web width
    let hf: f64 = 120.0;       // mm, flange thickness
    let spacing: f64 = 2800.0; // mm, center-to-center beam spacing
    let fc: f64 = 25.0;        // MPa
    let fy: f64 = 420.0;       // MPa
    let as_steel: f64 = 2400.0; // mm^2
    let d: f64 = 500.0;        // mm

    // Effective flange width per ACI 318 section 6.3.2.1
    let be1: f64 = span / 4.0;
    let be2: f64 = bw + 16.0 * hf;
    let be3: f64 = spacing;
    let b_eff: f64 = be1.min(be2).min(be3);

    assert_close(be1, 2250.0, 0.001, "L/4");
    assert_close(be2, 2270.0, 0.001, "bw + 16*hf");
    assert_close(b_eff, 2250.0, 0.001, "Effective flange width b_eff");

    // Verify L/4 governs
    assert!(be1 < be2, "L/4 governs over bw+16*hf");
    assert!(be1 < be3, "L/4 governs over spacing");

    // Stress block depth
    let a: f64 = as_steel * fy / (0.85 * fc * b_eff);
    let expected_a: f64 = 2400.0 * 420.0 / (0.85 * 25.0 * 2250.0);
    assert_close(a, expected_a, 0.01, "T-beam stress block depth a");

    // Verify NA is in flange
    assert!(a <= hf, "NA must be in flange: a={:.2} <= hf={:.2}", a, hf);

    // Nominal moment (rectangular behavior since a < hf)
    let mn: f64 = as_steel * fy * (d - a / 2.0);
    let mn_knm: f64 = mn / 1e6;
    let expected_mn_knm: f64 = 2400.0 * 420.0 * (500.0 - expected_a / 2.0) / 1e6;
    assert_close(mn_knm, expected_mn_knm, 0.01, "T-beam Mn");

    // Overreinforced flange width check: compare with web-only capacity
    let a_web: f64 = as_steel * fy / (0.85 * fc * bw);
    assert!(a_web > hf, "With web width only, NA goes below flange");

    let _ = PI;
}

// ================================================================
// 3. Shear Stirrup Spacing (ACI 318-19 section 22.5)
// ================================================================
//
// Required stirrup spacing for a given factored shear Vu.
//
// Given: bw = 300 mm, d = 500 mm, f'c = 28 MPa, fy_t = 420 MPa
//        Vu = 250 kN, phi = 0.75
//        Stirrup: 2-leg #10 bars, Av = 2*(PI/4)*10^2 = 157.08 mm^2
//
// Required nominal shear: Vn = Vu/phi = 250/0.75 = 333.33 kN
// Concrete contribution: Vc = 0.17*lambda*sqrt(f'c)*bw*d
//    = 0.17*1.0*5.2915*300*500 = 134,933 N = 134.93 kN
// Steel contribution needed: Vs = Vn - Vc = 333.33 - 134.93 = 198.40 kN
// Required spacing: s = Av*fyt*d / Vs = 157.08*420*500 / 198,400 = 166.2 mm
//
// Maximum spacing check: Vs < 0.33*sqrt(f'c)*bw*d?
//   0.33*5.2915*300*500 = 261,926 N = 261.93 kN
//   Vs = 198.40 kN < 261.93 kN => s_max = min(d/2, 600) = min(250, 600) = 250 mm
//   s_required = 166.2 mm < 250 mm => use s = 166.2 mm (governs)

#[test]
fn validation_rc_ext_3_shear_stirrup_spacing() {
    let bw: f64 = 300.0;       // mm
    let d: f64 = 500.0;        // mm
    let fc: f64 = 28.0;        // MPa
    let fyt: f64 = 420.0;      // MPa
    let vu_kn: f64 = 250.0;    // kN
    let phi: f64 = 0.75;
    let lambda: f64 = 1.0;
    let db_stirrup: f64 = 10.0; // mm, #10 bar
    let n_legs: f64 = 2.0;

    // Stirrup area
    let av: f64 = n_legs * PI / 4.0 * db_stirrup * db_stirrup;
    let expected_av: f64 = 2.0 * PI / 4.0 * 100.0;
    assert_close(av, expected_av, 0.01, "Stirrup area Av");

    // Required nominal shear
    let vn_kn: f64 = vu_kn / phi;
    assert_close(vn_kn, 333.333, 0.01, "Required Vn");

    // Concrete shear contribution
    let vc: f64 = 0.17 * lambda * fc.sqrt() * bw * d; // N
    let vc_kn: f64 = vc / 1000.0;
    let expected_vc_kn: f64 = 0.17 * 1.0 * 28.0_f64.sqrt() * 300.0 * 500.0 / 1000.0;
    assert_close(vc_kn, expected_vc_kn, 0.01, "Concrete shear Vc");

    // Steel shear required
    let vs_kn: f64 = vn_kn - vc_kn;
    assert!(vs_kn > 0.0, "Steel shear contribution needed");

    // Required stirrup spacing: s = Av*fyt*d / Vs
    let vs_n: f64 = vs_kn * 1000.0; // N
    let s_required: f64 = av * fyt * d / vs_n;
    let expected_s: f64 = expected_av * 420.0 * 500.0 / (vs_kn * 1000.0);
    assert_close(s_required, expected_s, 0.01, "Required stirrup spacing");

    // Maximum spacing check (ACI 318-19 section 9.7.6.2.2)
    let vs_limit_kn: f64 = 0.33 * fc.sqrt() * bw * d / 1000.0;
    let s_max: f64 = if vs_kn <= vs_limit_kn {
        (d / 2.0).min(600.0)
    } else {
        (d / 4.0).min(300.0)
    };

    assert!(vs_kn < vs_limit_kn, "Vs < 0.33*sqrt(f'c)*bw*d");
    assert_close(s_max, 250.0, 0.01, "Maximum stirrup spacing d/2");

    // Governing spacing
    let s_design: f64 = s_required.min(s_max);
    assert_close(s_design, s_required, 0.01, "Strength-based spacing governs");
    assert!(s_design < s_max, "Required spacing < maximum spacing");

    // Verify: Vs provided at design spacing
    let vs_provided: f64 = av * fyt * d / s_design / 1000.0; // kN
    assert!(
        vs_provided >= vs_kn - 0.01,
        "Vs,provided={:.2} >= Vs,required={:.2}", vs_provided, vs_kn
    );

    let _ = PI;
}

// ================================================================
// 4. Development Length (ACI 318-19 section 25.4)
// ================================================================
//
// Detailed development length per ACI 318-19 Eq. 25.4.2.4a:
//   ld = (fy*psi_t*psi_e*psi_s*psi_g / (1.1*lambda*sqrt(f'c))) * db
//
// Case A: #20 bar, bottom, uncoated, normal weight concrete
//   db = 20 mm, fy = 420 MPa, f'c = 32 MPa, psi_t=1.0, psi_e=1.0, psi_s=0.8, psi_g=1.0
//   ld = (420*1.0*1.0*0.8*1.0 / (1.1*1.0*sqrt(32))) * 20
//      = (336 / (1.1*5.6569)) * 20
//      = (336 / 6.2225) * 20
//      = 54.00 * 20 = 1080.1 mm
//   ld >= 300 mm => ld = 1080.1 mm
//
// Case B: same bar, top bar (psi_t=1.3), epoxy-coated (psi_e=1.5)
//   psi_t*psi_e = 1.3*1.5 = 1.95, capped at 1.7
//   ld = (420*1.7*0.8*1.0 / (1.1*1.0*sqrt(32))) * 20
//      = (571.2 / 6.2225) * 20
//      = 91.80 * 20 = 1836.1 mm

#[test]
fn validation_rc_ext_4_development_length() {
    let db: f64 = 20.0;        // mm, #20 bar
    let fy: f64 = 420.0;       // MPa
    let fc: f64 = 32.0;        // MPa
    let lambda: f64 = 1.0;     // normal weight

    // Case A: bottom bar, uncoated, small bar (db < 22 mm => psi_s = 0.8)
    let psi_t_a: f64 = 1.0;
    let psi_e_a: f64 = 1.0;
    let psi_s_a: f64 = 0.8;    // bar diameter < 22 mm
    let psi_g_a: f64 = 1.0;    // Grade 420

    let denom: f64 = 1.1 * lambda * fc.sqrt();
    let ld_a: f64 = (fy * psi_t_a * psi_e_a * psi_s_a * psi_g_a / denom) * db;
    let expected_ld_a: f64 = (420.0 * 1.0 * 1.0 * 0.8 * 1.0 / (1.1 * 32.0_f64.sqrt())) * 20.0;
    assert_close(ld_a, expected_ld_a, 0.01, "Development length Case A");

    // Check minimum
    let ld_a_final: f64 = ld_a.max(300.0);
    assert!(ld_a_final >= 300.0, "ld >= 300 mm minimum");
    assert!(
        (ld_a_final - ld_a).abs() < 0.01,
        "Computed ld governs over 300 mm minimum"
    );

    // Case B: top bar + epoxy coated
    let psi_t_b: f64 = 1.3;
    let psi_e_b: f64 = 1.5;
    let psi_product: f64 = (psi_t_b * psi_e_b).min(1.7);
    assert_close(psi_product, 1.7, 0.001, "psi_t*psi_e capped at 1.7");

    let ld_b: f64 = (fy * psi_product * psi_s_a * psi_g_a / denom) * db;
    let expected_ld_b: f64 = (420.0 * 1.7 * 0.8 * 1.0 / (1.1 * 32.0_f64.sqrt())) * 20.0;
    assert_close(ld_b, expected_ld_b, 0.01, "Development length Case B");

    // Top bar + epoxy always longer than plain bottom bar
    assert!(ld_b > ld_a, "Modified ld > basic ld");

    // Ratio should reflect the psi factor difference
    let ratio: f64 = ld_b / ld_a;
    let expected_ratio: f64 = 1.7 / 1.0;
    assert_close(ratio, expected_ratio, 0.01, "ld ratio = psi_product ratio");

    let _ = PI;
}

// ================================================================
// 5. Crack Width Calculation (EC2 section 7.3.4)
// ================================================================
//
// wk = sr,max * (epsilon_sm - epsilon_cm)
//
// sr,max = 3.4*c + 0.425*k1*k2*phi / rho_p_eff
// epsilon_sm - epsilon_cm = max(
//   [sigma_s - kt*fct_eff/rho_p_eff*(1 + alpha_e*rho_p_eff)] / Es,
//   0.6*sigma_s/Es
// )
//
// Given: b = 250 mm, h = 600 mm, d = 540 mm, As = 1200 mm^2
//   c_cover = 35 mm, phi_bar = 16 mm, k1 = 0.8 (high bond), k2 = 0.5 (bending)
//   fck = 30 MPa, sigma_s = 280 MPa, Es = 200,000 MPa, kt = 0.4 (long-term)
//
//   hc_eff = min(2.5*(h-d), h/3, h/2) = min(2.5*60, 200, 300) = min(150, 200, 300) = 150 mm
//   Ac_eff = 150 * 250 = 37,500 mm^2
//   rho_p_eff = 1200/37500 = 0.0320
//
//   sr,max = 3.4*35 + 0.425*0.8*0.5*16/0.032 = 119 + 85.0 = 204.0 mm
//
//   Ecm = 22000*(30/10)^0.3 = 22000*3^0.3 = 22000*1.3904 = 30589 MPa
//   alpha_e = 200000/30589 = 6.538
//   fct_eff = 0.3*30^(2/3) = 0.3*9.6549 = 2.8965 MPa
//
//   term1 = (280 - 0.4*2.8965/0.032*(1 + 6.538*0.032)) / 200000
//         = (280 - 36.206*(1 + 0.2092)) / 200000
//         = (280 - 43.781) / 200000
//         = 236.219 / 200000 = 0.001181
//   term2 = 0.6*280/200000 = 0.000840
//
//   eps_diff = max(0.001181, 0.000840) = 0.001181
//   wk = 204.0 * 0.001181 = 0.241 mm

#[test]
fn validation_rc_ext_5_crack_width() {
    let b: f64 = 250.0;         // mm
    let h: f64 = 600.0;         // mm
    let d: f64 = 540.0;         // mm
    let as_steel: f64 = 1200.0; // mm^2
    let c_cover: f64 = 35.0;    // mm
    let phi_bar: f64 = 16.0;    // mm
    let k1: f64 = 0.8;          // high bond bars
    let k2: f64 = 0.5;          // bending
    let fck: f64 = 30.0;        // MPa
    let sigma_s: f64 = 280.0;   // MPa, service steel stress
    let es: f64 = 200_000.0;    // MPa
    let kt: f64 = 0.4;          // long-term loading

    // Effective tension area (EC2 section 7.3.2(3))
    let hc_eff: f64 = (2.5 * (h - d)).min(h / 3.0).min(h / 2.0);
    assert_close(hc_eff, 150.0, 0.01, "hc,eff");

    let ac_eff: f64 = hc_eff * b;
    let rho_p_eff: f64 = as_steel / ac_eff;
    assert_close(rho_p_eff, 0.0320, 0.01, "rho_p_eff");

    // Maximum crack spacing (EC2 Eq. 7.11)
    let sr_max: f64 = 3.4 * c_cover + 0.425 * k1 * k2 * phi_bar / rho_p_eff;
    let expected_sr: f64 = 3.4 * 35.0 + 0.425 * 0.8 * 0.5 * 16.0 / rho_p_eff;
    assert_close(sr_max, expected_sr, 0.01, "Maximum crack spacing sr,max");

    // Material properties
    let ecm: f64 = 22_000.0 * (fck / 10.0).powf(0.3);
    let alpha_e: f64 = es / ecm;
    let fct_eff: f64 = 0.3 * fck.powf(2.0 / 3.0);

    // Mean strain difference (EC2 Eq. 7.9)
    let term1: f64 = (sigma_s - kt * fct_eff / rho_p_eff * (1.0 + alpha_e * rho_p_eff)) / es;
    let term2: f64 = 0.6 * sigma_s / es;
    let eps_diff: f64 = term1.max(term2);

    assert!(term1 > term2, "Calculated strain governs over minimum");

    // Crack width
    let wk: f64 = sr_max * eps_diff;
    let expected_wk: f64 = expected_sr * eps_diff;
    assert_close(wk, expected_wk, 0.01, "Crack width wk");

    // Verify within EC2 limits for exposure XC2-XC4
    assert!(wk < 0.30, "wk={:.3} mm < 0.30 mm limit for XC2-XC4", wk);

    // Verify within EC2 limits for exposure XC1
    assert!(wk < 0.40, "wk={:.3} mm < 0.40 mm limit for XC1", wk);

    let _ = PI;
}

// ================================================================
// 6. Effective Moment of Inertia for Deflection (Branson, ACI 318)
// ================================================================
//
// Branson's equation (ACI 318-19 section 24.2.3.5):
//   I_eff = I_cr + (I_g - I_cr)*(M_cr/M_a)^3
//   but I_eff <= I_g
//
// Rectangular beam: b = 300 mm, h = 500 mm, d = 440 mm
//   f'c = 28 MPa, As = 1500 mm^2, Es = 200,000 MPa
//
//   I_g = b*h^3/12 = 300*500^3/12 = 3,125,000,000 mm^4 = 3.125e9 mm^4
//   y_t = h/2 = 250 mm
//
//   fr = 0.62*lambda*sqrt(f'c) = 0.62*1.0*5.2915 = 3.281 MPa (EC uses 0.62)
//   Actually ACI uses fr = 0.62*sqrt(f'c) for modulus of rupture
//   M_cr = fr*I_g/y_t = 3.281*3.125e9/250 = 41,012,500 N*mm = 41.01 kN*m
//
//   Cracked moment of inertia (transformed section):
//   n = Es/Ec = 200000/Ec, Ec = 4700*sqrt(f'c) = 4700*5.2915 = 24,870 MPa
//   n = 200000/24870 = 8.042
//
//   Cracked NA from compression face (k*d):
//   b*(kd)^2/2 = n*As*(d - kd)
//   150*(kd)^2 = 8.042*1500*(440 - kd)
//   150*(kd)^2 + 12063*kd - 5,307,720 = 0
//   kd = (-12063 + sqrt(12063^2 + 4*150*5307720)) / (2*150)
//      = (-12063 + sqrt(145,516,000 + 3,184,632,000)) / 300
//      = (-12063 + sqrt(3,330,148,000)) / 300
//      = (-12063 + 57,708) / 300 = 45,645 / 300 = 152.15 mm
//
//   I_cr = b*(kd)^3/3 + n*As*(d - kd)^2
//        = 300*152.15^3/3 + 8.042*1500*(440 - 152.15)^2
//        = 300*3,524,100,000/3/1000 ... let's compute carefully
//        = 100*152.15^3 + 12063*(287.85)^2
//   152.15^3 = 3,524,478 (approx)
//   100*3,524,478 = 352,447,800
//   287.85^2 = 82,857.6
//   12063*82857.6 = 999,622,000 (approx)
//   I_cr = 352,447,800 + 999,622,000 = 1,352,070,000 mm^4 = 1.352e9 mm^4
//
// For Ma = 80 kN*m:
//   (M_cr/M_a)^3 = (41.01/80)^3 = 0.5126^3 = 0.1347
//   I_eff = 1.352e9 + (3.125e9 - 1.352e9)*0.1347
//         = 1.352e9 + 1.773e9*0.1347 = 1.352e9 + 0.239e9 = 1.591e9 mm^4

#[test]
fn validation_rc_ext_6_deflection_cracked() {
    let b: f64 = 300.0;        // mm
    let h: f64 = 500.0;        // mm
    let d: f64 = 440.0;        // mm
    let fc: f64 = 28.0;        // MPa
    let as_steel: f64 = 1500.0; // mm^2
    let es_steel: f64 = 200_000.0; // MPa

    // Gross moment of inertia
    let ig: f64 = b * h.powi(3) / 12.0;
    assert_close(ig, 3.125e9, 0.01, "Gross moment of inertia I_g");

    // Concrete modulus and modular ratio
    let ec: f64 = 4700.0 * fc.sqrt();
    let n: f64 = es_steel / ec;
    let expected_ec: f64 = 4700.0 * 28.0_f64.sqrt();
    assert_close(ec, expected_ec, 0.01, "Concrete modulus Ec");

    // Modulus of rupture
    let fr: f64 = 0.62 * fc.sqrt();
    let yt: f64 = h / 2.0;
    let mcr: f64 = fr * ig / yt / 1e6; // kN*m
    let expected_mcr: f64 = 0.62 * 28.0_f64.sqrt() * 3.125e9 / 250.0 / 1e6;
    assert_close(mcr, expected_mcr, 0.01, "Cracking moment M_cr");

    // Cracked neutral axis depth by quadratic formula
    // b/2*(kd)^2 + n*As*(kd) - n*As*d = 0
    let qa: f64 = b / 2.0;
    let qb: f64 = n * as_steel;
    let qc: f64 = -n * as_steel * d;
    let discriminant: f64 = qb * qb - 4.0 * qa * qc;
    let kd: f64 = (-qb + discriminant.sqrt()) / (2.0 * qa);
    assert!(kd > 0.0 && kd < d, "Cracked NA depth must be between 0 and d");

    // Cracked moment of inertia
    let icr: f64 = b * kd.powi(3) / 3.0 + n * as_steel * (d - kd).powi(2);
    assert!(icr < ig, "I_cr < I_g");
    assert!(icr > 0.0, "I_cr > 0");

    // Effective moment of inertia for Ma = 80 kN*m
    let ma: f64 = 80.0; // kN*m
    assert!(ma > mcr, "Ma > Mcr for cracked section");

    let ratio_cubed: f64 = (mcr / ma).powi(3);
    let i_eff: f64 = icr + (ig - icr) * ratio_cubed;
    let i_eff_capped: f64 = i_eff.min(ig);

    // I_eff must be between I_cr and I_g
    assert!(i_eff_capped >= icr, "I_eff >= I_cr");
    assert!(i_eff_capped <= ig, "I_eff <= I_g");

    // Verify formula self-consistency
    let expected_ieff: f64 = icr + (ig - icr) * (mcr / ma).powi(3);
    assert_close(i_eff, expected_ieff, 0.001, "Branson I_eff formula");

    // When Ma = Mcr, I_eff should equal I_g
    let i_eff_at_mcr: f64 = icr + (ig - icr) * (mcr / mcr).powi(3);
    assert_close(i_eff_at_mcr, ig, 0.01, "I_eff at Ma=Mcr should equal I_g");

    // When Ma >> Mcr, I_eff should approach I_cr
    let ma_large: f64 = 500.0;
    let i_eff_large: f64 = icr + (ig - icr) * (mcr / ma_large).powi(3);
    let ratio_to_icr: f64 = (i_eff_large - icr) / icr;
    assert!(ratio_to_icr < 0.05, "I_eff approaches I_cr for large Ma");

    let _ = PI;
}

// ================================================================
// 7. Column P-M Interaction Diagram (ACI 318-19)
// ================================================================
//
// 350 x 350 mm tied column, 8-#20 bars (As_total = 8*PI/4*20^2 = 2513.3 mm^2),
// f'c = 30 MPa, fy = 420 MPa.
// d = 350 - 55 = 295 mm, d' = 55 mm.
// As_comp = As_tens = 4*PI/4*20^2 = 1256.6 mm^2
//
// beta1 = 0.85 - 0.05*(30-28)/7 = 0.8357
//
// --- Pure axial capacity (P0) ---
//   P0 = 0.85*f'c*(Ag - As_total) + As_total*fy
//      = 0.85*30*(122500 - 2513.3) + 2513.3*420
//      = 25.5*119986.7 + 1055586
//      = 3,059,660 + 1,055,586 = 4,115,246 N = 4115.2 kN
//
// --- Maximum axial per ACI (phi*P_n,max) ---
//   P_n,max = 0.80 * P0 (for tied columns)
//
// --- Balanced condition ---
//   eps_y = 420/200000 = 0.0021
//   cb = 0.003*d / (0.003 + eps_y) = 0.003*295 / 0.0051 = 173.53 mm
//   ab = beta1*cb = 0.8357*173.53 = 145.06 mm
//
//   Compression steel strain: eps_s' = 0.003*(cb-d')/cb = 0.003*(173.53-55)/173.53 = 0.002049
//   eps_s' = 0.002049 < eps_y = 0.0021 => compression steel does NOT quite yield
//   f_s' = Es*eps_s' = 200000*0.002049 = 409.8 MPa
//
//   Cc = 0.85*f'c*ab*b = 0.85*30*145.06*350 = 1,295,986 N
//   Cs = As'*(f_s' - 0.85*f'c) = 1256.6*(409.8 - 25.5) = 1256.6*384.3 = 482,865 N
//   Ts = As*fy = 1256.6*420 = 527,772 N
//   Pb = Cc + Cs - Ts = 1,295,986 + 482,865 - 527,772 = 1,251,079 N = 1251.1 kN
//
//   Mb about centroid (h/2 = 175 mm):
//   Mb = Cc*(175 - ab/2) + Cs*(175 - d') + Ts*(d - 175)
//      = 1,295,986*(175 - 72.53) + 482,865*(175 - 55) + 527,772*(295 - 175)
//      = 1,295,986*102.47 + 482,865*120 + 527,772*120
//      = 132,790,005 + 57,943,800 + 63,332,640
//      = 254,066,445 N*mm = 254.07 kN*m
//
// --- Pure moment (P=0) ---
//   For singly reinforced (ignoring compression steel for simplicity):
//   a0 = As*fy / (0.85*f'c*b) = 1256.6*420 / (0.85*30*350) = 527,772 / 8925 = 59.13 mm
//   M0 = As*fy*(d - a0/2) = 527,772*(295 - 29.57) = 527,772*265.43 = 140,073,000 N*mm = 140.07 kN*m

#[test]
fn validation_rc_ext_7_column_interaction() {
    let fc: f64 = 30.0;        // MPa
    let fy: f64 = 420.0;       // MPa
    let es_mod: f64 = 200_000.0;
    let b_col: f64 = 350.0;    // mm
    let h_col: f64 = 350.0;    // mm
    let d: f64 = 295.0;        // mm
    let d_prime: f64 = 55.0;   // mm
    let eps_cu: f64 = 0.003;
    let n_bars_face: f64 = 4.0;
    let db: f64 = 20.0;

    let as_face: f64 = n_bars_face * PI / 4.0 * db * db;
    let as_total: f64 = 2.0 * as_face;
    let ag: f64 = b_col * h_col;

    // beta1 for f'c = 30 MPa
    let beta1: f64 = (0.85 - 0.05 * (fc - 28.0) / 7.0).max(0.65);

    // --- Pure axial capacity P0 ---
    let p0: f64 = 0.85 * fc * (ag - as_total) + as_total * fy;
    let p0_kn: f64 = p0 / 1000.0;
    let expected_p0: f64 = 0.85 * 30.0 * (122500.0 - as_total) + as_total * 420.0;
    assert_close(p0, expected_p0, 0.01, "Pure axial capacity P0");
    assert!(p0_kn > 0.0, "P0 must be positive");

    // ACI maximum for tied columns
    let pn_max: f64 = 0.80 * p0;
    assert!(pn_max < p0, "Pn,max < P0 for tied column");

    // --- Balanced condition ---
    let eps_y: f64 = fy / es_mod;
    let cb: f64 = eps_cu * d / (eps_cu + eps_y);
    let ab: f64 = beta1 * cb;

    // Compression steel
    let eps_s_comp: f64 = eps_cu * (cb - d_prime) / cb;
    let fs_comp: f64 = (es_mod * eps_s_comp).min(fy);

    // Forces
    let cc: f64 = 0.85 * fc * ab * b_col;
    let cs: f64 = as_face * (fs_comp - 0.85 * fc);
    let ts: f64 = as_face * fy;
    let pb: f64 = cc + cs - ts;
    let pb_kn: f64 = pb / 1000.0;

    // Moment about centroid
    let centroid: f64 = h_col / 2.0;
    let mb: f64 = cc * (centroid - ab / 2.0) + cs * (centroid - d_prime) + ts * (d - centroid);
    let mb_knm: f64 = mb / 1e6;

    // Pb must be between 0 and P0
    assert!(pb_kn > 0.0, "Pb must be positive");
    assert!(pb_kn < p0_kn, "Pb must be less than P0");

    // Mb must be positive and reasonable
    assert!(mb_knm > 0.0, "Mb must be positive");
    assert!(mb_knm < 500.0, "Mb must be reasonable for this column size");

    // --- Pure moment (P = 0), singly reinforced approximation ---
    let a0: f64 = as_face * fy / (0.85 * fc * b_col);
    let m0: f64 = as_face * fy * (d - a0 / 2.0);
    let m0_knm: f64 = m0 / 1e6;
    let expected_m0: f64 = as_face * 420.0 * (295.0 - a0 / 2.0) / 1e6;
    assert_close(m0_knm, expected_m0, 0.01, "Pure moment capacity M0");

    // Verify interaction diagram ordering: Mb > M0 (balanced point has higher moment)
    // This is a well-known feature: the P-M curve bulges outward
    assert!(mb_knm > m0_knm, "Balanced Mb > pure moment M0");

    // Verify force equilibrium at balanced point
    let equilibrium_check: f64 = cc + cs - ts - pb;
    assert!(equilibrium_check.abs() < 1.0, "Force equilibrium at balanced point");

    let _ = PI;
}

// ================================================================
// 8. Two-Way Slab Moments: Direct Design Method (ACI 318-19 Ch. 8)
// ================================================================
//
// Total static moment: M_0 = w_u * l2 * ln^2 / 8
// Distribution to negative (65%) and positive (35%) for interior spans
// Column strip takes 75% of negative, 60% of positive
//
// Given: w_u = 10 kN/m^2, l1 = 7 m, l2 = 6 m, column = 500x500 mm
//
//   ln = l1 - column = 7.0 - 0.5 = 6.5 m
//   M_0 = 10 * 6 * 6.5^2 / 8 = 10 * 6 * 42.25 / 8 = 2535 / 8 = 316.875 kN*m
//
//   M_neg = 0.65 * 316.875 = 205.97 kN*m
//   M_pos = 0.35 * 316.875 = 110.91 kN*m
//
//   Column strip: M_neg_cs = 0.75 * 205.97 = 154.48 kN*m
//                 M_neg_ms = 0.25 * 205.97 = 51.49 kN*m
//                 M_pos_cs = 0.60 * 110.91 = 66.54 kN*m
//                 M_pos_ms = 0.40 * 110.91 = 44.36 kN*m

#[test]
fn validation_rc_ext_8_two_way_slab_moments() {
    let wu: f64 = 10.0;        // kN/m^2, factored load
    let l1: f64 = 7.0;         // m, span in direction of analysis
    let l2: f64 = 6.0;         // m, span perpendicular to analysis
    let col_dim: f64 = 0.5;    // m, column dimension (square)

    // Clear span
    let ln: f64 = l1 - col_dim;
    assert_close(ln, 6.5, 0.001, "Clear span ln");

    // Total static moment (ACI 318-19 Eq. 8.10.3.2)
    let m0: f64 = wu * l2 * ln * ln / 8.0;
    let expected_m0: f64 = 10.0 * 6.0 * 6.5 * 6.5 / 8.0;
    assert_close(m0, expected_m0, 0.01, "Total static moment M_0");

    // Interior span distribution (ACI 318-19 Table 8.10.4.2)
    let f_neg: f64 = 0.65;
    let f_pos: f64 = 0.35;

    let m_neg: f64 = f_neg * m0;
    let m_pos: f64 = f_pos * m0;

    let expected_m_neg: f64 = 0.65 * expected_m0;
    let expected_m_pos: f64 = 0.35 * expected_m0;
    assert_close(m_neg, expected_m_neg, 0.01, "Negative moment M_neg");
    assert_close(m_pos, expected_m_pos, 0.01, "Positive moment M_pos");

    // Verify sum = M_0
    assert_close(m_neg + m_pos, m0, 0.001, "M_neg + M_pos = M_0");

    // Column strip / middle strip distribution
    let cs_neg_frac: f64 = 0.75;
    let cs_pos_frac: f64 = 0.60;

    let m_neg_cs: f64 = cs_neg_frac * m_neg;
    let m_neg_ms: f64 = (1.0 - cs_neg_frac) * m_neg;
    let m_pos_cs: f64 = cs_pos_frac * m_pos;
    let m_pos_ms: f64 = (1.0 - cs_pos_frac) * m_pos;

    // Check individual values
    let expected_m_neg_cs: f64 = 0.75 * expected_m_neg;
    let expected_m_pos_cs: f64 = 0.60 * expected_m_pos;
    assert_close(m_neg_cs, expected_m_neg_cs, 0.01, "Column strip negative moment");
    assert_close(m_pos_cs, expected_m_pos_cs, 0.01, "Column strip positive moment");

    // Verify strip totals
    assert_close(m_neg_cs + m_neg_ms, m_neg, 0.001, "CS + MS = total negative");
    assert_close(m_pos_cs + m_pos_ms, m_pos, 0.001, "CS + MS = total positive");

    // Verify total = M_0
    let total: f64 = m_neg_cs + m_neg_ms + m_pos_cs + m_pos_ms;
    assert_close(total, m0, 0.001, "Total distributed = M_0");

    // Column strip width (ACI 318-19 section 8.4.1.5)
    // Column strip extends min(0.25*l1, 0.25*l2) each side of column centerline
    let half_cs_width: f64 = (0.25 * l1).min(0.25 * l2);
    let cs_width: f64 = 2.0 * half_cs_width;
    assert_close(half_cs_width, 1.5, 0.01, "Half column strip width");
    assert_close(cs_width, 3.0, 0.01, "Column strip width");

    // Middle strip width = l2 - column strip width
    let ms_width: f64 = l2 - cs_width;
    assert_close(ms_width, 3.0, 0.01, "Middle strip width");

    // Moment per unit width in each strip
    let m_neg_cs_per_m: f64 = m_neg_cs / cs_width;
    let m_neg_ms_per_m: f64 = m_neg_ms / ms_width;

    // Column strip has higher intensity than middle strip (for negative moment)
    assert!(
        m_neg_cs_per_m > m_neg_ms_per_m,
        "CS neg intensity > MS neg intensity"
    );

    let _ = PI;
}
