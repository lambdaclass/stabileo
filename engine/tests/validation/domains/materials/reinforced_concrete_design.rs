/// Validation: ACI 318 / EC2 Reinforced Concrete Design Formulas
///
/// References:
///   - ACI 318-19 (Building Code Requirements for Structural Concrete)
///   - EN 1992-1-1:2004 (Eurocode 2: Design of Concrete Structures)
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///
/// Tests verify RC design capacity formulas with hand-computed expected values.
/// No solver calls -- pure arithmetic verification of code-based equations.

use std::f64::consts::PI;

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
// 1. Rectangular Beam Mn (Whitney Stress Block, ACI 318 22.2)
// ================================================================
//
// Whitney stress block: a = As*fy / (0.85*fc'*b)
// Mn = As*fy*(d - a/2)
//
// Given: fc' = 28 MPa, fy = 420 MPa, b = 300 mm, d = 540 mm
//        As = 3 * (PI/4)*25² = 3*490.87 = 1472.62 mm² (3 No.25 bars)
//
// a = 1472.62 * 420 / (0.85 * 28 * 300) = 618,500.4 / 7140 = 86.62 mm
// Mn = 1472.62 * 420 * (540 - 86.62/2) = 618,500.4 * 496.69 = 307.26e6 N·mm = 307.26 kN·m

#[test]
fn validation_rectangular_beam_mn() {
    let fc: f64 = 28.0;
    let fy: f64 = 420.0;
    let b: f64 = 300.0;
    let d: f64 = 540.0;
    let n_bars: f64 = 3.0;
    let bar_dia: f64 = 25.0;

    let as_steel: f64 = n_bars * PI / 4.0 * bar_dia * bar_dia;
    let a: f64 = as_steel * fy / (0.85 * fc * b);
    let mn: f64 = as_steel * fy * (d - a / 2.0);
    let mn_knm: f64 = mn / 1e6;

    // Hand computation
    let expected_as: f64 = 3.0 * PI / 4.0 * 625.0;
    let expected_a: f64 = expected_as * 420.0 / (0.85 * 28.0 * 300.0);
    let expected_mn: f64 = expected_as * 420.0 * (540.0 - expected_a / 2.0) / 1e6;

    assert_close(as_steel, expected_as, 0.001, "As");
    assert_close(a, expected_a, 0.001, "Whitney block depth a");
    assert_close(mn_knm, expected_mn, 0.01, "Rectangular beam Mn");
}

// ================================================================
// 2. Doubly Reinforced Beam Capacity (ACI 318)
// ================================================================
//
// When compression steel is needed:
//   Mn = (As - As')*fy*(d - a/2) + As'*fy*(d - d')
//
// where a = (As - As')*fy / (0.85*fc'*b)
//
// Given: fc' = 35 MPa, fy = 420 MPa, b = 350 mm, d = 600 mm, d' = 60 mm
//        As = 4000 mm², As' = 1200 mm²
//
// a = (4000-1200)*420 / (0.85*35*350) = 1,176,000 / 10,412.5 = 112.95 mm
// Mn = 2800*420*(600 - 112.95/2) + 1200*420*(600-60)
//    = 1,176,000 * 543.525 + 504,000 * 540
//    = 639,185,400 + 272,160,000 = 911,345,400 N·mm = 911.35 kN·m

#[test]
fn validation_doubly_reinforced_beam() {
    let fc: f64 = 35.0;
    let fy: f64 = 420.0;
    let b: f64 = 350.0;
    let d: f64 = 600.0;
    let d_prime: f64 = 60.0;
    let as_tens: f64 = 4000.0;
    let as_comp: f64 = 1200.0;

    let a: f64 = (as_tens - as_comp) * fy / (0.85 * fc * b);
    let mn: f64 = (as_tens - as_comp) * fy * (d - a / 2.0)
        + as_comp * fy * (d - d_prime);
    let mn_knm: f64 = mn / 1e6;

    let expected_a: f64 = 2800.0 * 420.0 / (0.85 * 35.0 * 350.0);
    let expected_mn: f64 = (2800.0 * 420.0 * (600.0 - expected_a / 2.0)
        + 1200.0 * 420.0 * 540.0) / 1e6;

    assert_close(a, expected_a, 0.01, "Doubly reinforced a");
    assert_close(mn_knm, expected_mn, 0.01, "Doubly reinforced Mn");
}

// ================================================================
// 3. T-Beam Effective Flange Width and Mn (ACI 318 6.3.2.1)
// ================================================================
//
// Effective flange width (interior beam, ACI 6.3.2.1):
//   be = min(L/4, bw + 16*hf, center-to-center spacing)
//
// Given: L = 8000 mm, bw = 300 mm, hf = 150 mm, spacing = 3000 mm
//   be = min(2000, 2700, 3000) = 2000 mm
//
// T-beam Mn (NA in flange if a <= hf):
//   a = As*fy / (0.85*fc'*be) = 3000*420 / (0.85*28*2000) = 26.47 mm
//   Mn = As*fy*(d - a/2) = 3000*420*(550 - 26.47/2) = 676.32e6 N·mm

#[test]
fn validation_t_beam_capacity() {
    let l: f64 = 8000.0;
    let bw: f64 = 300.0;
    let hf: f64 = 150.0;
    let spacing: f64 = 3000.0;
    let fc: f64 = 28.0;
    let fy: f64 = 420.0;
    let as_steel: f64 = 3000.0;
    let d: f64 = 550.0;

    // Effective flange width
    let be1: f64 = l / 4.0;
    let be2: f64 = bw + 16.0 * hf;
    let be: f64 = be1.min(be2).min(spacing);
    assert_close(be, 2000.0, 0.001, "T-beam effective flange width");

    // Check if NA is in flange
    let a: f64 = as_steel * fy / (0.85 * fc * be);
    assert!(a <= hf, "NA must be in flange for this test case");

    // Mn (rectangular behavior since a < hf)
    let mn: f64 = as_steel * fy * (d - a / 2.0);
    let mn_knm: f64 = mn / 1e6;

    let expected_a: f64 = 1_260_000.0 / 47_600.0;
    let expected_mn: f64 = 1_260_000.0 * (550.0 - expected_a / 2.0) / 1e6;
    assert_close(mn_knm, expected_mn, 0.01, "T-beam Mn");
}

// ================================================================
// 4. One-Way Slab Minimum Thickness (ACI Table 7.3.1.1)
// ================================================================
//
// For normal weight concrete and Grade 420 steel:
//   Simply supported: h_min = L/20
//   One end continuous: h_min = L/24
//   Both ends continuous: h_min = L/28
//   Cantilever: h_min = L/10
//
// For fy other than 420 MPa, multiply by (0.4 + fy/700)
//
// Example: L = 5000 mm, fy = 500 MPa
//   Factor = 0.4 + 500/700 = 1.1143
//   SS: h_min = 5000/20 * 1.1143 = 278.57 mm

#[test]
fn validation_one_way_slab_min_thickness() {
    let l: f64 = 5000.0;
    let fy: f64 = 500.0;

    let correction: f64 = 0.4 + fy / 700.0;
    assert_close(correction, 1.1143, 0.001, "fy correction factor");

    // Simply supported
    let h_ss: f64 = l / 20.0 * correction;
    assert_close(h_ss, 278.57, 0.01, "SS slab min thickness");

    // One end continuous
    let h_one: f64 = l / 24.0 * correction;
    assert_close(h_one, 232.14, 0.01, "One end continuous min thickness");

    // Both ends continuous
    let h_both: f64 = l / 28.0 * correction;
    let expected_both: f64 = 5000.0 / 28.0 * 1.1143;
    assert_close(h_both, expected_both, 0.001, "Both ends continuous min thickness");

    // Cantilever
    let h_cant: f64 = l / 10.0 * correction;
    assert_close(h_cant, 557.14, 0.01, "Cantilever min thickness");
}

// ================================================================
// 5. Development Length of Deformed Bars (ACI 25.4.2.3)
// ================================================================
//
// Simplified equation (ACI 25.4.2.3a):
//   ld = (fy * psi_t * psi_e / (25 * lambda * sqrt(fc'))) * db
//
// Given: db = 20 mm, fy = 420 MPa, fc' = 28 MPa
//   ld = (420 / (25 * sqrt(28))) * 20 = (420 / 132.288) * 20 = 63.50 mm
//   Minimum ld = max(300 mm, computed ld) → 300 mm governs

#[test]
fn validation_development_length() {
    let fy: f64 = 420.0;
    let fc: f64 = 28.0;
    let db: f64 = 20.0;
    let psi_t: f64 = 1.0;
    let psi_e: f64 = 1.0;
    let lambda: f64 = 1.0;

    let ld_calc: f64 = (fy * psi_t * psi_e / (25.0 * lambda * fc.sqrt())) * db;
    let ld: f64 = ld_calc.max(300.0);

    assert_close(ld_calc, 63.50, 0.02, "ld calculated");
    assert_close(ld, 300.0, 0.001, "ld with minimum");

    // With top bars (psi_t = 1.3) and epoxy-coated (psi_e = 1.5, cap at 1.7)
    let psi_t2: f64 = 1.3;
    let psi_e2: f64 = 1.5;
    let psi_product: f64 = (psi_t2 * psi_e2).min(1.7);
    assert_close(psi_product, 1.7, 0.001, "psi product capped at 1.7");

    let ld_calc2: f64 = (fy * psi_product / (25.0 * lambda * fc.sqrt())) * db;
    let expected_ld2: f64 = (420.0 * 1.7 / (25.0 * fc.sqrt())) * 20.0;
    assert_close(ld_calc2, expected_ld2, 0.001, "ld with modification factors");
}

// ================================================================
// 6. Punching Shear Capacity (ACI 318 22.6.5.2, Two-Way Slab)
// ================================================================
//
// Vc is the least of:
//   (a) Vc = 0.33 * lambda * sqrt(fc') * bo * d
//   (b) Vc = (0.17 + 0.33/beta) * lambda * sqrt(fc') * bo * d
//   (c) Vc = (0.17 + 0.083*alpha_s*d/bo) * lambda * sqrt(fc') * bo * d
//
// Interior column: 400x400 mm, d = 200 mm, fc' = 30 MPa
//   bo = 4*(400+200) = 2400 mm, beta = 1.0
//   (a) Vc = 0.33*sqrt(30)*2400*200 = 867,715 N

#[test]
fn validation_punching_shear_capacity() {
    let fc: f64 = 30.0;
    let d: f64 = 200.0;
    let c1: f64 = 400.0;
    let c2: f64 = 400.0;
    let lambda: f64 = 1.0;
    let alpha_s: f64 = 40.0;

    let bo: f64 = 2.0 * (c1 + d) + 2.0 * (c2 + d);
    assert_close(bo, 2400.0, 0.001, "bo perimeter");

    let beta: f64 = if c1 > c2 { c1 / c2 } else { c2 / c1 };
    let sqrt_fc: f64 = fc.sqrt();

    let vc_a: f64 = 0.33 * lambda * sqrt_fc * bo * d;
    let vc_b: f64 = (0.17 + 0.33 / beta) * lambda * sqrt_fc * bo * d;
    let vc_c: f64 = (0.17 + 0.083 * alpha_s * d / bo) * lambda * sqrt_fc * bo * d;

    let vc: f64 = vc_a.min(vc_b).min(vc_c);
    let vc_kn: f64 = vc / 1e3;

    // For square interior column, (a) governs
    assert_close(vc, vc_a, 0.001, "Governing case is (a)");
    let expected_vc_kn: f64 = 0.33 * 1.0 * sqrt_fc * 2400.0 * 200.0 / 1e3;
    assert_close(vc_kn, expected_vc_kn, 0.01, "Punching shear Vc");
}

// ================================================================
// 7. Column Interaction Diagram Point (Balanced Condition, ACI 318)
// ================================================================
//
// At balanced condition, concrete strain = 0.003, steel strain = fy/Es
//   cb = d * 0.003 / (0.003 + epsilon_y)
//   ab = beta1 * cb
//
// fc' = 28 MPa, beta1 = 0.85, fy = 420 MPa, Es = 200000 MPa
//   epsilon_y = 0.0021
//   cb = 340 * 0.003 / 0.0051 = 200.0 mm
//   ab = 0.85 * 200.0 = 170.0 mm

#[test]
fn validation_column_balanced_condition() {
    let fc: f64 = 28.0;
    let fy: f64 = 420.0;
    let es_mod: f64 = 200_000.0;
    let b: f64 = 400.0;
    let h: f64 = 400.0;
    let d: f64 = 340.0;
    let d_prime: f64 = 60.0;
    let beta1: f64 = 0.85;
    let as_each: f64 = 2.0 * PI / 4.0 * 32.0 * 32.0; // 2 No.32 bars per face

    let epsilon_y: f64 = fy / es_mod;
    assert_close(epsilon_y, 0.0021, 0.001, "epsilon_y");

    let cb: f64 = d * 0.003 / (0.003 + epsilon_y);
    let ab: f64 = beta1 * cb;

    // Check compression steel has yielded
    let es_prime: f64 = 0.003 * (cb - d_prime) / cb;
    assert!(es_prime >= epsilon_y, "Compression steel must yield at balanced");

    // Forces
    let cc: f64 = 0.85 * fc * ab * b;
    let cs: f64 = as_each * fy;
    let ts: f64 = as_each * fy;

    let pb: f64 = cc + cs - ts; // symmetric reinforcement
    let pb_kn: f64 = pb / 1e3;

    // Moment about centroid
    let mb: f64 = cc * (h / 2.0 - ab / 2.0)
        + cs * (h / 2.0 - d_prime)
        + ts * (d - h / 2.0);
    let mb_knm: f64 = mb / 1e6;

    let expected_pb_kn: f64 = 0.85 * 28.0 * ab * 400.0 / 1e3;
    assert_close(pb_kn, expected_pb_kn, 0.01, "Balanced Pb");

    // Mb should be positive and reasonable
    assert!(mb_knm > 0.0, "Mb must be positive");
    assert!(mb_knm < 1000.0, "Mb must be reasonable for this column size");
}

// ================================================================
// 8. Crack Width Calculation (EC2 7.3.4)
// ================================================================
//
// wk = sr_max * (epsilon_sm - epsilon_cm)
//
// sr_max = 3.4*c + 0.425*k1*k2*phi/rho_p_eff
//
// epsilon_sm - epsilon_cm = [sigma_s - kt*fct_eff/rho_p_eff*(1+alpha_e*rho_p_eff)] / Es
//                            >= 0.6*sigma_s/Es

#[test]
fn validation_crack_width_ec2() {
    let c: f64 = 40.0;
    let phi: f64 = 20.0;
    let k1: f64 = 0.8;
    let k2: f64 = 0.5;
    let sigma_s: f64 = 250.0;
    let fct_eff: f64 = 2.6;
    let kt: f64 = 0.4;
    let es: f64 = 200_000.0;
    let alpha_e: f64 = 6.35;
    let rho_p_eff: f64 = 0.03333;

    // Maximum crack spacing
    let sr_max: f64 = 3.4 * c + 0.425 * k1 * k2 * phi / rho_p_eff;

    // Mean strain difference
    let eps_diff_calc: f64 = (sigma_s
        - kt * fct_eff / rho_p_eff * (1.0 + alpha_e * rho_p_eff))
        / es;
    let eps_diff_min: f64 = 0.6 * sigma_s / es;
    let eps_diff: f64 = if eps_diff_calc > eps_diff_min {
        eps_diff_calc
    } else {
        eps_diff_min
    };

    // Crack width
    let wk: f64 = sr_max * eps_diff;

    let expected_sr_max: f64 = 3.4 * 40.0 + 0.425 * 0.8 * 0.5 * 20.0 / 0.03333;
    assert_close(sr_max, expected_sr_max, 0.01, "sr_max");

    assert!(eps_diff_calc > eps_diff_min, "Calculated strain should govern");
    assert_close(wk, expected_sr_max * eps_diff, 0.01, "Crack width wk");

    // Typical limit for XC1 exposure: wk <= 0.4 mm
    assert!(wk < 0.4, "wk = {:.3} mm should be < 0.4 mm for XC1", wk);
}
