/// Validation: AISC/EC3 Structural Steel Design Formulas
///
/// References:
///   - AISC 360-22 (Specification for Structural Steel Buildings)
///   - EN 1993-1-1:2005 (Eurocode 3: Design of Steel Structures)
///   - Salmon, Johnson, Malhas: "Steel Structures: Design and Behavior" 5th ed.
///   - Segui: "Steel Design" 6th ed.
///
/// Tests verify steel design capacity formulas with hand-computed expected values.
/// No solver calls -- pure arithmetic verification of code-based equations.

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
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
// 1. Compact Section Flexural Capacity (Mp = Fy * Zx)
// ================================================================
//
// AISC F2.1: For compact I-sections, Mn = Mp = Fy * Zx
//
// W21x50: Zx = 2550 cm³ = 2550e3 mm³ (AISC Table 1-1 approx)
// Fy = 345 MPa (A992 steel)
// Mp = 345 * 2550e3 = 879.75e6 N·mm = 879.75 kN·m

#[test]
fn validation_compact_section_flexural_capacity() {
    let fy: f64 = 345.0; // MPa
    let zx: f64 = 2550e3; // mm³ (plastic section modulus, W21x50 approx)

    let mp: f64 = fy * zx; // N·mm
    let mp_knm: f64 = mp / 1e6; // kN·m

    let expected_mp: f64 = 879.75; // kN·m
    assert_close(mp_knm, expected_mp, 0.01, "Mp = Fy * Zx");
}

// ================================================================
// 2. Lateral-Torsional Buckling (AISC F2-2 Inelastic LTB)
// ================================================================
//
// For Lp < Lb <= Lr (inelastic LTB zone):
//   Mn = Cb * [Mp - (Mp - 0.7*Fy*Sx) * (Lb - Lp)/(Lr - Lp)] <= Mp
//
// Given (W21x50 approx):
//   Fy = 345 MPa, Sx = 2090e3 mm³, Zx = 2550e3 mm³
//   Lp = 2500 mm, Lr = 7000 mm, Lb = 4500 mm, Cb = 1.14
//   Mp = 345 * 2550e3 = 879.75e6 N·mm
//   0.7*Fy*Sx = 0.7*345*2090e3 = 503.715e6 N·mm
//   Mn = 1.14 * [879.75e6 - (879.75e6 - 503.715e6)*(4500-2500)/(7000-2500)]
//      = 1.14 * [879.75e6 - 376.035e6 * 2000/4500]
//      = 1.14 * [879.75e6 - 167.1267e6]
//      = 1.14 * 712.6233e6 = 812.39e6 N·mm
//   Check <= Mp: 812.39e6 < 879.75e6, OK

#[test]
fn validation_lateral_torsional_buckling() {
    let fy: f64 = 345.0;
    let sx: f64 = 2090e3;
    let zx: f64 = 2550e3;
    let lp: f64 = 2500.0;
    let lr: f64 = 7000.0;
    let lb: f64 = 4500.0;
    let cb: f64 = 1.14;

    let mp: f64 = fy * zx;
    let mr: f64 = 0.7 * fy * sx;
    let mn_raw: f64 = cb * (mp - (mp - mr) * (lb - lp) / (lr - lp));
    let mn: f64 = mn_raw.min(mp); // cap at Mp
    let mn_knm: f64 = mn / 1e6;

    let expected_mn: f64 = 812.39;
    assert_close(mn_knm, expected_mn, 0.01, "Inelastic LTB Mn");
}

// ================================================================
// 3. Shear Capacity (AISC G2: Vn = 0.6*Fy*Aw*Cv1)
// ================================================================
//
// W14x90: d = 356 mm, tw = 11.2 mm, Aw = 356*11.2 = 3987.2 mm²
//   h/tw = 356/11.2 = 31.8 < 2.24*sqrt(E/Fy) = 53.94 → Cv1 = 1.0
//   Vn = 0.6 * 345 * 3987.2 * 1.0 = 825,352.8 N = 825.35 kN

#[test]
fn validation_shear_capacity() {
    let fy: f64 = 345.0;
    let d: f64 = 356.0;
    let tw: f64 = 11.2;
    let cv1: f64 = 1.0;
    let aw: f64 = d * tw;

    let vn: f64 = 0.6 * fy * aw * cv1;
    let vn_kn: f64 = vn / 1e3;

    let expected_vn: f64 = 825.3504;
    assert_close(vn_kn, expected_vn, 0.01, "Vn = 0.6*Fy*Aw*Cv1");
}

// ================================================================
// 4. Web Crippling (AISC J10.3: Rn at beam end)
// ================================================================
//
// AISC Eq. J10-4 (at beam end, N/d <= 0.2):
//   Rn = 0.40 * tw² * [1 + 3*(N/d)*(tw/tf)^1.5] * sqrt(E*Fy*tf/tw)
//
// Parameters (W18x35 approx):
//   tw = 7.62 mm, tf = 10.8 mm, d = 457 mm, N = 50 mm
//   E = 200000 MPa, Fy = 345 MPa
//   N/d = 50/457 = 0.1094 < 0.2 OK
//   (tw/tf)^1.5 = (7.62/10.8)^1.5 = 0.7056^1.5 = 0.5925
//   sqrt(E*Fy*tf/tw) = sqrt(200000*345*10.8/7.62) = sqrt(97795275.6) = 9889.15
//   Rn = 0.40 * 7.62² * [1 + 3*0.1094*0.5925] * 9889.15
//      = 0.40 * 58.064 * [1 + 0.1946] * 9889.15
//      = 0.40 * 58.064 * 1.1946 * 9889.15
//      = 274,207 N = 274.21 kN

#[test]
fn validation_web_crippling() {
    let tw: f64 = 7.62;
    let tf: f64 = 10.8;
    let d: f64 = 457.0;
    let n_bearing: f64 = 50.0;
    let e: f64 = 200_000.0;
    let fy: f64 = 345.0;

    let rn: f64 = 0.40 * tw * tw
        * (1.0 + 3.0 * (n_bearing / d) * (tw / tf).powf(1.5))
        * (e * fy * tf / tw).sqrt();
    let rn_kn: f64 = rn / 1e3;

    // Verify step by step
    let n_over_d: f64 = n_bearing / d;
    assert!(n_over_d <= 0.2, "N/d must be <= 0.2 for Eq. J10-4");

    let expected_rn: f64 = 0.40 * 58.06_f64
        * (1.0 + 3.0 * 0.10941 * 0.59254)
        * 9889.15;
    let expected_kn: f64 = expected_rn / 1e3;
    assert_close(rn_kn, expected_kn, 0.02, "Web crippling Rn");
}

// ================================================================
// 5. Block Shear Rupture (AISC J4.3)
// ================================================================
//
// Rn = 0.6*Fu*Anv + Ubs*Fu*Ant   (when 0.6*Fu*Anv >= 0.6*Fy*Agv)
// OR
// Rn = 0.6*Fy*Agv + Ubs*Fu*Ant   (when 0.6*Fu*Anv < 0.6*Fy*Agv)
//
// Coped beam (one vertical line of 3 bolts, 22mm holes):
//   Fu = 450 MPa, Fy = 345 MPa, tw = 9.5 mm, Ubs = 1.0
//   Bolt spacing s = 75 mm, edge distance Lev = 38 mm, Leh = 38 mm
//   Agv = tw * (Lev + 2*s) = 9.5 * (38 + 150) = 9.5*188 = 1786 mm²
//   Anv = Agv - 2.5*22*tw = 1786 - 2.5*22*9.5 = 1786 - 522.5 = 1263.5 mm²
//   Agt = tw * Leh = 9.5 * 38 = 361 mm²
//   Ant = Agt - 0.5*22*tw = 361 - 0.5*22*9.5 = 361 - 104.5 = 256.5 mm²
//
//   0.6*Fu*Anv = 0.6*450*1263.5 = 341,145 N
//   0.6*Fy*Agv = 0.6*345*1786 = 369,702 N
//   341,145 < 369,702 → use second equation
//   Rn = 0.6*Fy*Agv + Ubs*Fu*Ant = 369,702 + 1.0*450*256.5 = 369,702 + 115,425 = 485,127 N

#[test]
fn validation_block_shear_rupture() {
    let fu: f64 = 450.0;
    let fy: f64 = 345.0;
    let tw: f64 = 9.5;
    let ubs: f64 = 1.0;
    let hole_dia: f64 = 22.0;
    let lev: f64 = 38.0;
    let leh: f64 = 38.0;
    let s: f64 = 75.0;
    let n_bolts: f64 = 3.0;

    let agv: f64 = tw * (lev + (n_bolts - 1.0) * s);
    let anv: f64 = agv - (n_bolts - 0.5) * hole_dia * tw;
    let agt: f64 = tw * leh;
    let ant: f64 = agt - 0.5 * hole_dia * tw;

    let shear_rupture: f64 = 0.6 * fu * anv;
    let shear_yield: f64 = 0.6 * fy * agv;

    let rn: f64 = if shear_rupture >= shear_yield {
        0.6 * fu * anv + ubs * fu * ant
    } else {
        0.6 * fy * agv + ubs * fu * ant
    };

    let expected_rn: f64 = 485_127.0;
    assert_close(rn, expected_rn, 0.01, "Block shear Rn");
}

// ================================================================
// 6. Moment Gradient Factor Cb (AISC F1-1)
// ================================================================
//
// Cb = 12.5*Mmax / (2.5*Mmax + 3*MA + 4*MB + 3*MC)
//
// Uniform moment: MA = MB = MC = Mmax → Cb = 12.5/(2.5+3+4+3) = 1.0
// Midspan point load on SS beam: M_quarter = M/2, M_mid = M
//   Cb = 12.5*M / (2.5*M + 3*M/2 + 4*M + 3*M/2) = 12.5/(2.5+1.5+4+1.5) = 12.5/9.5 = 1.3158
// Triangular moment (cantilever): MA = 0.75*M, MB = 0.5*M, MC = 0.25*M
//   Cb = 12.5*M / (2.5*M + 3*0.75*M + 4*0.5*M + 3*0.25*M)
//      = 12.5 / (2.5 + 2.25 + 2.0 + 0.75) = 12.5/7.5 = 1.6667

#[test]
fn validation_moment_gradient_factor_cb() {
    let cb = |mmax: f64, ma: f64, mb: f64, mc: f64| -> f64 {
        12.5 * mmax / (2.5 * mmax + 3.0 * ma + 4.0 * mb + 3.0 * mc)
    };

    // Case 1: Uniform moment
    let m: f64 = 100.0;
    let cb_uniform: f64 = cb(m, m, m, m);
    assert_close(cb_uniform, 1.0, 0.001, "Cb uniform moment");

    // Case 2: SS beam with midspan point load
    let mmax: f64 = 200.0;
    let cb_point: f64 = cb(mmax, mmax / 2.0, mmax, mmax / 2.0);
    let expected_cb_point: f64 = 12.5 / 9.5;
    assert_close(cb_point, expected_cb_point, 0.001, "Cb midspan point load");

    // Case 3: Linear moment diagram (cantilever-like)
    let cb_linear: f64 = cb(m, 0.75 * m, 0.50 * m, 0.25 * m);
    let expected_cb_linear: f64 = 12.5 / 7.5;
    assert_close(cb_linear, expected_cb_linear, 0.001, "Cb linear moment");
}

// ================================================================
// 7. Effective Length Factor K (Sway Frame Alignment Chart)
// ================================================================
//
// Approximate formula (AISC Commentary, Eq. C-A-7-2):
//   K = sqrt[ (1.6*GA*GB + 4*(GA+GB) + 7.5) / (GA+GB + 7.5) ]
//
// Case: GA = 2.0, GB = 3.0
//   K = sqrt[ (1.6*6 + 4*5 + 7.5) / (5 + 7.5) ]
//     = sqrt[ (9.6 + 20 + 7.5) / 12.5 ]
//     = sqrt[ 37.1 / 12.5 ]
//     = sqrt(2.968) = 1.7229

#[test]
fn validation_effective_length_factor_k_sway() {
    let ga: f64 = 2.0;
    let gb: f64 = 3.0;

    let numer: f64 = 1.6 * ga * gb + 4.0 * (ga + gb) + 7.5;
    let denom: f64 = ga + gb + 7.5;
    let k: f64 = (numer / denom).sqrt();

    let expected_k: f64 = (37.1_f64 / 12.5).sqrt();
    assert_close(k, expected_k, 0.01, "K factor sway frame");

    // Verify K > 1.0 for sway frame
    assert!(k > 1.0, "Sway frame K must be > 1.0");

    // Special case: both ends fixed (GA=GB=0) → K = 1.0 (sway)
    let k_fixed_inner: f64 = (1.6 * 0.0 * 0.0 + 4.0 * 0.0 + 7.5) / (0.0 + 7.5);
    let k_fixed: f64 = k_fixed_inner.sqrt();
    assert_close(k_fixed, 1.0, 0.001, "K factor both ends fixed sway");
}

// ================================================================
// 8. Plate Girder Bend-Buckling (AISC F5-4: Rpg and Fcr)
// ================================================================
//
// For plate girders with slender webs, the web bend-buckling stress:
//   Fcr = 0.9 * E * kc / (h/tw)²
//
// where kc = 4 / sqrt(h/tw), bounded by 0.35 <= kc <= 0.76
//
// Rpg = 1 - aw/(1200 + 300*aw) * (hc/tw - 5.70*sqrt(E/Fy)) <= 1.0
//
// Example: h/tw = 180, E = 200000 MPa, Fy = 345 MPa
//   kc = 4/sqrt(180) = 0.2981 → clamp to 0.35
//   Fcr = 0.9*200000*0.35/32400 = 1.9444 MPa
//   Rpg (aw=1.5): 1 - 1.5/1650 * (180-137.24) = 0.9611

#[test]
fn validation_plate_girder_bend_buckling() {
    let e: f64 = 200_000.0;
    let fy: f64 = 345.0;
    let h_tw: f64 = 180.0;

    // kc factor
    let kc_raw: f64 = 4.0 / h_tw.sqrt();
    let kc: f64 = kc_raw.max(0.35).min(0.76);
    assert_close(kc, 0.35, 0.01, "kc clamped to 0.35");

    // Web bend-buckling stress
    let fcr: f64 = 0.9 * e * kc / (h_tw * h_tw);
    let expected_fcr: f64 = 0.9 * 200_000.0 * 0.35 / 32_400.0;
    assert_close(fcr, expected_fcr, 0.001, "Fcr plate girder");

    // Rpg reduction factor
    let aw: f64 = 1.5;
    let lambda_limit: f64 = 5.70 * (e / fy).sqrt();
    let rpg: f64 = (1.0 - aw / (1200.0 + 300.0 * aw) * (h_tw - lambda_limit)).min(1.0);

    let expected_rpg: f64 = 1.0 - 1.5 / 1650.0 * (180.0 - 137.24);
    assert_close(rpg, expected_rpg, 0.01, "Rpg plate girder");

    // Rpg must be <= 1.0
    assert!(rpg <= 1.0, "Rpg must be <= 1.0");
}
