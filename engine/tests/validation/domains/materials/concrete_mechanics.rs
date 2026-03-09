/// Validation: Reinforced Concrete Mechanics
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1:2004 (EC2): Design of concrete structures
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures", 15th Ed.
///   - Wight: "Reinforced Concrete: Mechanics and Design", 7th Ed.
///   - MacGregor & Wight: "Reinforced Concrete: Mechanics and Design", 6th Ed.
///
/// Tests verify Whitney stress block, moment capacity, balanced ratio,
/// development length, shear strength, doubly reinforced sections,
/// T-beam flanges, and crack width estimation.

#[allow(unused_imports)]
use dedaliano_engine::types::*;

// ═══════════════════════════════════════════════════════════════
// 1. Whitney Stress Block Depth
// ═══════════════════════════════════════════════════════════════
//
// ACI 318-19 §22.2.2.4: The equivalent rectangular stress block has:
//   depth a = β₁ × c
//   β₁ = 0.85 for f'c ≤ 28 MPa
//   β₁ = 0.85 − 0.05(f'c − 28)/7  for 28 < f'c ≤ 56 MPa
//   β₁ = 0.65 for f'c > 56 MPa
//
// For equilibrium of singly reinforced rectangular beam:
//   C = T  →  0.85·f'c·a·b = As·fy
//   a = As·fy / (0.85·f'c·b)
//
// Test cases:
//   f'c = 21 MPa: β₁ = 0.85
//   f'c = 35 MPa: β₁ = 0.85 − 0.05×(35−28)/7 = 0.80
//   f'c = 55 MPa: β₁ = 0.85 − 0.05×(55−28)/7 = 0.6571 → but min 0.65 check
//   f'c = 60 MPa: β₁ = 0.65

#[test]
fn validation_whitney_stress_block_depth() {
    // Helper to compute β₁ per ACI 318-19
    let beta1 = |fc: f64| -> f64 {
        if fc <= 28.0 {
            0.85
        } else if fc <= 56.0 {
            (0.85 - 0.05 * (fc - 28.0) / 7.0).max(0.65)
        } else {
            0.65
        }
    };

    // --- Test β₁ values ---
    assert!(
        (beta1(21.0) - 0.85).abs() < 1e-6,
        "β₁(21 MPa) = {:.4}, expected 0.85", beta1(21.0)
    );
    assert!(
        (beta1(35.0) - 0.80).abs() < 0.01,
        "β₁(35 MPa) = {:.4}, expected 0.80", beta1(35.0)
    );
    assert!(
        (beta1(55.0) - 0.6571).abs() < 0.01,
        "β₁(55 MPa) = {:.4}, expected ~0.657", beta1(55.0)
    );
    assert!(
        (beta1(60.0) - 0.65).abs() < 1e-6,
        "β₁(60 MPa) = {:.4}, expected 0.65", beta1(60.0)
    );

    // --- Compute stress block depth for a specific beam ---
    let as_steel: f64 = 2000.0;    // mm²
    let fy: f64 = 420.0;           // MPa
    let fc_prime: f64 = 35.0;      // MPa
    let b: f64 = 350.0;            // mm

    let a: f64 = as_steel * fy / (0.85 * fc_prime * b);
    // a = 840000 / 10412.5 = 80.67 mm
    let a_expected: f64 = 80.67;

    let rel_err = (a - a_expected).abs() / a_expected;
    assert!(
        rel_err < 0.01,
        "a: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        a, a_expected, rel_err * 100.0
    );

    // --- Neutral axis depth ---
    let c: f64 = a / beta1(fc_prime);
    let c_expected: f64 = 80.67 / 0.80;  // = 100.84 mm

    let rel_err_c = (c - c_expected).abs() / c_expected;
    assert!(
        rel_err_c < 0.01,
        "c: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        c, c_expected, rel_err_c * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Nominal Moment Capacity — Singly Reinforced Rectangular Section
// ═══════════════════════════════════════════════════════════════
//
// Section: b = 400 mm, h = 600 mm, d = 540 mm
// As = 2500 mm², fy = 420 MPa, f'c = 30 MPa
//
// a = As·fy / (0.85·f'c·b) = 2500×420 / (0.85×30×400)
//   = 1,050,000 / 10,200 = 102.94 mm
//
// β₁ = 0.85 − 0.05(30−28)/7 = 0.8357
// c = a/β₁ = 102.94/0.8357 = 123.16 mm
//
// Check tension-controlled:
//   εt = 0.003(d−c)/c = 0.003(540−123.16)/123.16 = 0.01015 ≥ 0.005 ✓
//
// Mn = As·fy·(d − a/2) = 2500 × 420 × (540 − 51.47)
//    = 2500 × 420 × 488.53
//    = 512,957,000 N·mm = 512.96 kN·m

#[test]
fn validation_nominal_moment_singly_reinforced() {
    let as_steel: f64 = 2500.0;    // mm²
    let fy: f64 = 420.0;           // MPa
    let fc_prime: f64 = 30.0;      // MPa
    let b: f64 = 400.0;            // mm
    let d: f64 = 540.0;            // mm

    // β₁ for 30 MPa
    let beta1: f64 = 0.85 - 0.05 * (fc_prime - 28.0) / 7.0;
    let beta1_expected: f64 = 0.8357;

    let rel_err_b = (beta1 - beta1_expected).abs() / beta1_expected;
    assert!(
        rel_err_b < 0.01,
        "β₁: computed={:.4}, expected={:.4}", beta1, beta1_expected
    );

    // --- Stress block depth ---
    let a: f64 = as_steel * fy / (0.85 * fc_prime * b);
    let a_expected: f64 = 102.94;

    let rel_err_a = (a - a_expected).abs() / a_expected;
    assert!(
        rel_err_a < 0.01,
        "a: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        a, a_expected, rel_err_a * 100.0
    );

    // --- Neutral axis ---
    let c: f64 = a / beta1;
    let c_expected: f64 = 123.16;

    let rel_err_c = (c - c_expected).abs() / c_expected;
    assert!(
        rel_err_c < 0.01,
        "c: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        c, c_expected, rel_err_c * 100.0
    );

    // --- Tension-controlled check ---
    let eps_t: f64 = 0.003 * (d - c) / c;
    assert!(
        eps_t >= 0.005,
        "Section must be tension-controlled: εt={:.6} ≥ 0.005", eps_t
    );

    // --- Nominal moment ---
    let mn: f64 = as_steel * fy * (d - a / 2.0) / 1.0e6; // kN·m
    let mn_expected: f64 = 512.96;

    let rel_err_mn = (mn - mn_expected).abs() / mn_expected;
    assert!(
        rel_err_mn < 0.01,
        "Mn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn, mn_expected, rel_err_mn * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. Balanced Reinforcement Ratio
// ═══════════════════════════════════════════════════════════════
//
// ACI 318-19: At balanced condition, concrete reaches εcu = 0.003
// and steel reaches εy = fy/Es simultaneously.
//
//   cb = εcu·d / (εcu + εy)
//   ab = β₁·cb
//   ρb = 0.85·f'c·β₁ / fy × εcu / (εcu + εy)
//
// For f'c = 28 MPa, fy = 420 MPa, Es = 200,000 MPa:
//   εy = 420/200000 = 0.0021
//   β₁ = 0.85
//   ρb = 0.85 × 28 × 0.85 / 420 × 0.003 / (0.003 + 0.0021)
//      = 20.23 / 420 × 0.5882
//      = 0.04817 × 0.5882
//      = 0.02833
//
// Maximum reinforcement ratio (ACI for tension-controlled, εt ≥ 0.005):
//   ρmax occurs at εt = 0.005:
//   c_max = 0.003·d / (0.003 + 0.005) = 0.375·d
//   a_max = β₁·c_max = 0.85 × 0.375·d = 0.31875·d
//   ρmax = 0.85·f'c·a_max / (fy·d) = 0.85×28×0.31875/420 = 0.01806

#[test]
fn validation_balanced_reinforcement_ratio() {
    let fc_prime: f64 = 28.0;      // MPa
    let fy: f64 = 420.0;           // MPa
    let es: f64 = 200_000.0;       // MPa
    let eps_cu: f64 = 0.003;
    let beta1: f64 = 0.85;

    // --- Yield strain ---
    let eps_y: f64 = fy / es;
    let eps_y_expected: f64 = 0.0021;

    let err_ey = (eps_y - eps_y_expected).abs();
    assert!(
        err_ey < 1e-6,
        "εy: computed={:.6}, expected={:.6}", eps_y, eps_y_expected
    );

    // --- Balanced reinforcement ratio ---
    let rho_b: f64 = 0.85 * fc_prime * beta1 / fy * eps_cu / (eps_cu + eps_y);
    let rho_b_expected: f64 = 0.02833;

    let rel_err = (rho_b - rho_b_expected).abs() / rho_b_expected;
    assert!(
        rel_err < 0.01,
        "ρb: computed={:.5}, expected={:.5}, err={:.4}%",
        rho_b, rho_b_expected, rel_err * 100.0
    );

    // --- Maximum reinforcement ratio (tension-controlled, εt = 0.005) ---
    let eps_t_min: f64 = 0.005;    // tension-controlled limit
    let c_over_d: f64 = eps_cu / (eps_cu + eps_t_min);
    let a_over_d: f64 = beta1 * c_over_d;
    let rho_max: f64 = 0.85 * fc_prime * a_over_d / fy;
    let rho_max_expected: f64 = 0.01806;

    let rel_err_max = (rho_max - rho_max_expected).abs() / rho_max_expected;
    assert!(
        rel_err_max < 0.01,
        "ρmax: computed={:.5}, expected={:.5}, err={:.4}%",
        rho_max, rho_max_expected, rel_err_max * 100.0
    );

    // --- ρmax < ρb ---
    assert!(
        rho_max < rho_b,
        "ρmax={:.5} < ρb={:.5} (tension-controlled is below balanced)",
        rho_max, rho_b
    );

    // --- Balanced NA depth for d = 500 mm ---
    let d: f64 = 500.0;
    let cb: f64 = eps_cu * d / (eps_cu + eps_y);
    let cb_expected: f64 = 294.12;

    let rel_err_cb = (cb - cb_expected).abs() / cb_expected;
    assert!(
        rel_err_cb < 0.01,
        "cb: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        cb, cb_expected, rel_err_cb * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. Development Length — Tension Bars (ACI 318-19 §25.4)
// ═══════════════════════════════════════════════════════════════
//
// Detailed formula (ACI 318-19 §25.4.2.3):
//   ld = [fy·ψt·ψe·ψs·ψg / (1.1·λ·√f'c)] × db
//
// #20 bar: db = 19.1 mm
// f'c = 35 MPa, fy = 420 MPa
// ψt = 1.3 (top bars, >300 mm concrete below)
// ψe = 1.0 (uncoated)
// ψs = 0.8 (db < 22 mm)
// ψg = 1.0 (Grade 420)
// λ = 1.0 (normal weight)
//
// ld/db = (420 × 1.3 × 1.0 × 0.8 × 1.0) / (1.1 × 1.0 × √35)
//       = 436.8 / (1.1 × 5.9161)
//       = 436.8 / 6.5077
//       = 67.12
//
// ld = 67.12 × 19.1 = 1282.0 mm
// Minimum: ld ≥ 300 mm → ld = 1282.0 mm

#[test]
fn validation_development_length_tension() {
    let db: f64 = 19.1;            // mm, #20 bar
    let fy: f64 = 420.0;           // MPa
    let fc_prime: f64 = 35.0;      // MPa
    let psi_t: f64 = 1.3;          // top bar
    let psi_e: f64 = 1.0;          // uncoated
    let psi_s: f64 = 0.8;          // small bar (db < 22 mm)
    let psi_g: f64 = 1.0;          // Grade 420
    let lambda: f64 = 1.0;         // normal weight concrete

    // --- Development length ratio ---
    let ld_over_db: f64 = (fy * psi_t * psi_e * psi_s * psi_g)
        / (1.1 * lambda * fc_prime.sqrt());
    let ld_over_db_expected: f64 = 67.12;

    let rel_err = (ld_over_db - ld_over_db_expected).abs() / ld_over_db_expected;
    assert!(
        rel_err < 0.01,
        "ld/db: computed={:.2}, expected={:.2}, err={:.4}%",
        ld_over_db, ld_over_db_expected, rel_err * 100.0
    );

    // --- Development length ---
    let ld: f64 = ld_over_db * db;
    let ld_expected: f64 = 1282.0;

    let rel_err_ld = (ld - ld_expected).abs() / ld_expected;
    assert!(
        rel_err_ld < 0.01,
        "ld: computed={:.1} mm, expected={:.1} mm, err={:.4}%",
        ld, ld_expected, rel_err_ld * 100.0
    );

    // --- Check minimum ---
    let ld_min: f64 = 300.0;
    let ld_final: f64 = ld.max(ld_min);
    assert!(
        ld_final >= ld_min,
        "ld={:.1} mm ≥ {:.0} mm (ACI minimum)", ld_final, ld_min
    );

    // --- Compare top bar vs bottom bar ---
    let psi_t_bottom: f64 = 1.0;
    let ld_bottom: f64 = (fy * psi_t_bottom * psi_e * psi_s * psi_g)
        / (1.1 * lambda * fc_prime.sqrt()) * db;
    assert!(
        ld > ld_bottom,
        "Top bar ld={:.1} mm > bottom bar ld={:.1} mm", ld, ld_bottom
    );

    let top_factor: f64 = ld / ld_bottom;
    assert!(
        (top_factor - 1.3).abs() < 0.01,
        "Top bar factor = {:.4}, expected 1.3", top_factor
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. Concrete Shear Strength Vc (ACI 318-19 §22.5)
// ═══════════════════════════════════════════════════════════════
//
// Simplified formula:
//   Vc = 0.17·λ·√f'c·bw·d
//
// Detailed formula (ACI 318-19 §22.5.5.1, Table 22.5.5.1):
//   Vc = [0.66·λ·(ρw)^(1/3)·√f'c + Nu/(6·Ag)] · bw·d
//   where ρw = As/(bw·d), Nu = axial load (positive for compression)
//
// Using simplified formula:
// Section: bw = 350 mm, d = 540 mm, f'c = 30 MPa, λ = 1.0
//
//   Vc = 0.17 × 1.0 × √30 × 350 × 540
//      = 0.17 × 5.4772 × 189,000
//      = 175,937 N = 175.94 kN
//
// φVc = 0.75 × 175.94 = 131.95 kN
//
// Maximum stirrup contribution (Vs ≤ 0.66·√f'c·bw·d):
//   Vs,max = 0.66 × √30 × 350 × 540 = 683,176 N = 683.18 kN

#[test]
fn validation_concrete_shear_strength_vc() {
    let lambda: f64 = 1.0;         // normal weight
    let fc_prime: f64 = 30.0;      // MPa
    let bw: f64 = 350.0;           // mm
    let d: f64 = 540.0;            // mm
    let phi: f64 = 0.75;

    // --- Simplified Vc ---
    let vc: f64 = 0.17 * lambda * fc_prime.sqrt() * bw * d / 1000.0; // kN
    let vc_expected: f64 = 175.94;

    let rel_err = (vc - vc_expected).abs() / vc_expected;
    assert!(
        rel_err < 0.01,
        "Vc: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vc, vc_expected, rel_err * 100.0
    );

    // --- Design shear ---
    let phi_vc: f64 = phi * vc;
    let phi_vc_expected: f64 = 131.95;

    let rel_err_phi = (phi_vc - phi_vc_expected).abs() / phi_vc_expected;
    assert!(
        rel_err_phi < 0.01,
        "φVc: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_vc, phi_vc_expected, rel_err_phi * 100.0
    );

    // --- Maximum stirrup contribution ---
    let vs_max: f64 = 0.66 * fc_prime.sqrt() * bw * d / 1000.0; // kN
    let vs_max_expected: f64 = 683.18;

    let rel_err_vs = (vs_max - vs_max_expected).abs() / vs_max_expected;
    assert!(
        rel_err_vs < 0.01,
        "Vs,max: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vs_max, vs_max_expected, rel_err_vs * 100.0
    );

    // --- Maximum total shear capacity ---
    let vn_max: f64 = vc + vs_max;
    let phi_vn_max: f64 = phi * vn_max;

    // Vc + Vs,max should give total capacity
    assert!(
        phi_vn_max > phi_vc,
        "Total φVn={:.2} kN > φVc alone={:.2} kN", phi_vn_max, phi_vc
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. Doubly Reinforced Section Capacity
// ═══════════════════════════════════════════════════════════════
//
// Section: b = 300 mm, d = 500 mm, d' = 60 mm
// As = 3000 mm², As' = 1000 mm²
// f'c = 25 MPa, fy = 500 MPa, Es = 200,000 MPa
//
// Assume compression steel yields, check:
//   a = (As − As')·fy / (0.85·f'c·b)
//     = (3000 − 1000) × 500 / (0.85 × 25 × 300)
//     = 1,000,000 / 6375 = 156.86 mm
//
//   β₁ = 0.85 (f'c ≤ 28 MPa)
//   c = a/β₁ = 156.86/0.85 = 184.54 mm
//
//   ε's = 0.003·(c − d')/c = 0.003·(184.54 − 60)/184.54 = 0.002025
//   εy = 500/200000 = 0.0025
//   ε's < εy → compression steel does NOT yield!
//
// Solve quadratic (exact):
//   0.85·f'c·β₁·b·c² + As'·Es·εcu·c − As'·Es·εcu·d' − As·fy·c = 0
//   Let A = 0.85×25×0.85×300 = 5418.75
//       B = −(As·fy − As'·Es·εcu) = −(1500000 − 600000) = −900000
//       C = −As'·Es·εcu·d' = −1000×200000×0.003×60 = −36000000
//
//   c = [−B + √(B²−4AC)] / 2A
//     = [900000 + √(8.1e11 + 7.8077e11)] / 10837.5
//     = [900000 + √(1.58077e12)] / 10837.5
//     = [900000 + 1257290] / 10837.5
//     = 199.06 mm
//
// f's = Es·εcu·(c−d')/c = 200000 × 0.003 × (199.06−60)/199.06 = 418.95 MPa
// a = β₁·c = 0.85 × 199.06 = 169.20 mm
//
// Mn = 0.85·f'c·a·b·(d−a/2) + As'·f's·(d−d')
//    = 0.85×25×169.20×300×(500−84.60) + 1000×418.95×(500−60)
//    = 0.85×25×169.20×300×415.40 + 1000×418.95×440
//    = 449.78×10⁶ + 184.34×10⁶
//    = 634.12 kN·m

#[test]
fn validation_doubly_reinforced_section() {
    let b: f64 = 300.0;
    let d: f64 = 500.0;
    let d_prime: f64 = 60.0;
    let as_tens: f64 = 3000.0;     // mm²
    let as_comp: f64 = 1000.0;     // mm²
    let fc_prime: f64 = 25.0;      // MPa
    let fy: f64 = 500.0;           // MPa
    let es: f64 = 200_000.0;       // MPa
    let eps_cu: f64 = 0.003;
    let beta1: f64 = 0.85;

    // --- Solve quadratic for c ---
    let coeff_a: f64 = 0.85 * fc_prime * beta1 * b;
    let coeff_b: f64 = -(as_tens * fy - as_comp * es * eps_cu);
    let coeff_c: f64 = -as_comp * es * eps_cu * d_prime;

    let disc: f64 = coeff_b * coeff_b - 4.0 * coeff_a * coeff_c;
    assert!(disc > 0.0, "Discriminant must be positive");

    let c: f64 = (-coeff_b + disc.sqrt()) / (2.0 * coeff_a);
    let c_expected: f64 = 199.06;

    let rel_err_c = (c - c_expected).abs() / c_expected;
    assert!(
        rel_err_c < 0.01,
        "c: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        c, c_expected, rel_err_c * 100.0
    );

    // --- Compression steel stress ---
    let fs_prime: f64 = (es * eps_cu * (c - d_prime) / c).min(fy);
    let fs_expected: f64 = 418.95;

    let rel_err_fs = (fs_prime - fs_expected).abs() / fs_expected;
    assert!(
        rel_err_fs < 0.01,
        "f's: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        fs_prime, fs_expected, rel_err_fs * 100.0
    );

    // Compression steel does NOT yield
    assert!(
        fs_prime < fy,
        "Compression steel does not yield: f's={:.2} < fy={:.1}", fs_prime, fy
    );

    // --- Stress block depth ---
    let a: f64 = beta1 * c;
    let a_expected: f64 = 169.20;

    let rel_err_a = (a - a_expected).abs() / a_expected;
    assert!(
        rel_err_a < 0.01,
        "a: computed={:.2} mm, expected={:.2} mm", a, a_expected
    );

    // --- Nominal moment ---
    let mn_conc: f64 = 0.85 * fc_prime * a * b * (d - a / 2.0);
    let mn_steel: f64 = as_comp * fs_prime * (d - d_prime);
    let mn: f64 = (mn_conc + mn_steel) / 1.0e6;
    let mn_expected: f64 = 634.12;

    let rel_err_mn = (mn - mn_expected).abs() / mn_expected;
    assert!(
        rel_err_mn < 0.01,
        "Mn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn, mn_expected, rel_err_mn * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. T-Beam Effective Flange Width Contribution
// ═══════════════════════════════════════════════════════════════
//
// When the neutral axis falls within the flange (a ≤ hf), the T-beam
// is analyzed as a rectangular beam of width be.
// When a > hf, the compression zone spans both flange and web.
//
// Section:
//   bw = 300 mm (web width), be = 1200 mm (effective flange width)
//   hf = 120 mm (flange thickness)
//   d = 550 mm, As = 4000 mm²
//   f'c = 28 MPa, fy = 420 MPa
//
// Check if NA is in flange:
//   a_rect = As·fy / (0.85·f'c·be) = 4000×420 / (0.85×28×1200)
//          = 1,680,000 / 28,560 = 58.82 mm
//   58.82 < 120 mm → NA in flange → rectangular behavior with b = be
//
// Mn = As·fy·(d − a/2) = 4000 × 420 × (550 − 29.41)
//    = 4000 × 420 × 520.59
//    = 874.59 × 10⁶ N·mm = 874.59 kN·m
//
// Compare with web-only capacity (if no flange):
//   a_web = 4000×420 / (0.85×28×300) = 1,680,000/7,140 = 235.29 mm
//   Mn_web = 4000 × 420 × (550 − 117.65) = 726.35 kN·m
//   Flange contribution increases capacity by ~20%

#[test]
fn validation_t_beam_flange_contribution() {
    let bw: f64 = 300.0;           // mm, web width
    let be: f64 = 1200.0;          // mm, effective flange width
    let hf: f64 = 120.0;           // mm, flange thickness
    let d: f64 = 550.0;            // mm
    let as_steel: f64 = 4000.0;    // mm²
    let fc_prime: f64 = 28.0;      // MPa
    let fy: f64 = 420.0;           // MPa

    // --- Check if NA in flange ---
    let a_rect: f64 = as_steel * fy / (0.85 * fc_prime * be);
    let a_rect_expected: f64 = 58.82;

    let rel_err_a = (a_rect - a_rect_expected).abs() / a_rect_expected;
    assert!(
        rel_err_a < 0.01,
        "a(rect): computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        a_rect, a_rect_expected, rel_err_a * 100.0
    );

    assert!(
        a_rect <= hf,
        "NA is in flange: a={:.2} mm ≤ hf={:.1} mm", a_rect, hf
    );

    // --- T-beam moment (rectangular behavior) ---
    let mn_t: f64 = as_steel * fy * (d - a_rect / 2.0) / 1.0e6;
    let mn_t_expected: f64 = 874.59;

    let rel_err_mn = (mn_t - mn_t_expected).abs() / mn_t_expected;
    assert!(
        rel_err_mn < 0.01,
        "Mn(T-beam): computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn_t, mn_t_expected, rel_err_mn * 100.0
    );

    // --- Web-only capacity for comparison ---
    let a_web: f64 = as_steel * fy / (0.85 * fc_prime * bw);
    let a_web_expected: f64 = 235.29;

    let rel_err_aw = (a_web - a_web_expected).abs() / a_web_expected;
    assert!(
        rel_err_aw < 0.01,
        "a(web): computed={:.2} mm, expected={:.2} mm", a_web, a_web_expected
    );

    let mn_web: f64 = as_steel * fy * (d - a_web / 2.0) / 1.0e6;
    let mn_web_expected: f64 = 726.35;

    let rel_err_mw = (mn_web - mn_web_expected).abs() / mn_web_expected;
    assert!(
        rel_err_mw < 0.01,
        "Mn(web): computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn_web, mn_web_expected, rel_err_mw * 100.0
    );

    // --- Flange contribution ---
    let increase_pct: f64 = (mn_t - mn_web) / mn_web * 100.0;
    assert!(
        increase_pct > 15.0 && increase_pct < 25.0,
        "Flange increases capacity by {:.1}%, expected ~20%", increase_pct
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. Crack Width Estimation — Gergely-Lutz Formula
// ═══════════════════════════════════════════════════════════════
//
// Gergely-Lutz equation (historical ACI 318 approach):
//   w = 0.076·β·fs·(dc·A)^(1/3)
//
// where:
//   β = h₂/h₁ = ratio of distances from NA to extreme tension face
//     and from NA to tension steel centroid (typically ~1.2)
//   fs = service steel stress (MPa → need conversion for w in mm)
//   dc = cover to center of nearest bar (mm)
//   A = effective tension area per bar = 2·dc·s / n_bars (mm²)
//     where s = bar spacing
//
// Alternatively in SI units (w in mm, fs in MPa):
//   w = 11 × 10⁻⁶ × β × fs × (dc × A)^(1/3)    [w in mm]
//
// Section: b = 300 mm, h = 500 mm, d = 440 mm
// 4-#20 bars (db = 19.1 mm), clear cover = 40 mm
// dc = 40 + 19.1/2 = 49.55 mm
// fs = 250 MPa (service stress)
// β = (h − kd) / (d − kd) ≈ 1.20 (approximate for typical sections)
//
// Effective tension area per bar:
//   s = (300 − 2×40 − 19.1) / 3 ≈ 67 mm spacing
//   Actual: A = 2·dc·b / n_bars = 2 × 49.55 × 300 / 4 = 7432.5 mm²
//
// w = 11 × 10⁻⁶ × 1.20 × 250 × (49.55 × 7432.5)^(1/3)
//   = 11e-6 × 1.20 × 250 × (368,411)^(1/3)
//   = 3.3e-3 × 71.64
//   = 0.236 mm

#[test]
fn validation_crack_width_gergely_lutz() {
    let b: f64 = 300.0;            // mm, beam width
    let _h: f64 = 500.0;           // mm, total depth
    let _d: f64 = 440.0;           // mm, effective depth
    let n_bars: f64 = 4.0;         // number of tension bars
    let db: f64 = 19.1;            // mm, bar diameter
    let clear_cover: f64 = 40.0;   // mm
    let fs: f64 = 250.0;           // MPa, service steel stress
    let beta: f64 = 1.20;          // ratio (h-kd)/(d-kd)

    // --- Distance from tension face to bar center ---
    let dc: f64 = clear_cover + db / 2.0;
    let dc_expected: f64 = 49.55;

    let err_dc = (dc - dc_expected).abs();
    assert!(
        err_dc < 0.01,
        "dc: computed={:.2} mm, expected={:.2} mm", dc, dc_expected
    );

    // --- Effective tension area per bar ---
    let a_eff: f64 = 2.0 * dc * b / n_bars;
    let a_eff_expected: f64 = 7432.5;

    let rel_err_a = (a_eff - a_eff_expected).abs() / a_eff_expected;
    assert!(
        rel_err_a < 0.01,
        "A: computed={:.2} mm², expected={:.2} mm²", a_eff, a_eff_expected
    );

    // --- Gergely-Lutz crack width (SI version) ---
    let w: f64 = 11.0e-6 * beta * fs * (dc * a_eff).powf(1.0 / 3.0);
    let w_expected: f64 = 0.236;

    let rel_err_w = (w - w_expected).abs() / w_expected;
    assert!(
        rel_err_w < 0.02,
        "w: computed={:.4} mm, expected={:.4} mm, err={:.4}%",
        w, w_expected, rel_err_w * 100.0
    );

    // --- Crack width within typical limits ---
    assert!(
        w < 0.40,
        "Crack width w={:.3} mm should be < 0.40 mm for interior exposure", w
    );
    assert!(
        w < 0.30,
        "Crack width w={:.3} mm should be < 0.30 mm for exterior exposure", w
    );

    // --- Effect of more bars (better crack control) ---
    let n_bars_more: f64 = 6.0;
    let a_eff_more: f64 = 2.0 * dc * b / n_bars_more;
    let w_more: f64 = 11.0e-6 * beta * fs * (dc * a_eff_more).powf(1.0 / 3.0);

    assert!(
        w_more < w,
        "More bars reduce crack width: w(6 bars)={:.3} mm < w(4 bars)={:.3} mm",
        w_more, w
    );
}
