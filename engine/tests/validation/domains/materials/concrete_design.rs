/// Validation: Reinforced Concrete Section Design
///
/// References:
///   - ACI 318-19: Building Code Requirements for Structural Concrete
///   - EN 1992-1-1:2004 (EC2): Design of concrete structures
///   - CIRSOC 201-2005: Argentine concrete design standard
///   - Nilson, Darwin, Dolan: "Design of Concrete Structures" 15th ed.
///   - Wight: "Reinforced Concrete: Mechanics and Design" 7th ed.
///
/// Tests verify flexural capacity, shear, interaction diagrams, crack control.

// ═══════════════════════════════════════════════════════════════
// 1. ACI 318-19 Flexural Capacity — Singly Reinforced Rectangular Beam
// ═══════════════════════════════════════════════════════════════
//
// Rectangular beam 300 × 500 mm, As = 1500 mm², f'c = 28 MPa, fy = 420 MPa.
// Cover to tension steel centroid = 60 mm → d = 500 − 60 = 440 mm.
//
// Depth of equivalent rectangular stress block (ACI 318-19 §22.2.2.4):
//   a = As·fy / (0.85·f'c·b)
//     = 1500 × 420 / (0.85 × 28 × 300)
//     = 630,000 / 7,140
//     = 88.24 mm
//
// Nominal moment:
//   Mn = As·fy·(d − a/2)
//      = 1500 × 420 × (440 − 44.12)
//      = 1500 × 420 × 395.88
//      = 249.4 × 10⁶ N·mm = 249.4 kN·m
//
// Verify tension-controlled (εt ≥ 0.005 → φ = 0.9):
//   β₁ = 0.85 (for f'c ≤ 28 MPa)
//   c = a/β₁ = 88.24/0.85 = 103.81 mm
//   εt = 0.003·(d − c)/c = 0.003·(440 − 103.81)/103.81 = 0.00971 ≥ 0.005 ✓
//
// Design moment capacity:
//   φMn = 0.9 × 249.4 = 224.5 kN·m

#[test]
fn validation_aci318_flexural_capacity_singly_reinforced() {
    // --- Input ---
    let as_steel: f64 = 1500.0;   // mm², tension reinforcement area
    let fy: f64 = 420.0;          // MPa, yield strength of steel
    let fc_prime: f64 = 28.0;     // MPa, concrete compressive strength
    let b: f64 = 300.0;           // mm, beam width
    let h: f64 = 500.0;           // mm, total depth
    let cover: f64 = 60.0;        // mm, cover to steel centroid
    let d: f64 = h - cover;       // mm, effective depth = 440
    let beta1: f64 = 0.85;        // for f'c ≤ 28 MPa
    let phi: f64 = 0.9;           // strength reduction factor (tension-controlled)

    // --- Stress block depth ---
    let a: f64 = as_steel * fy / (0.85 * fc_prime * b);
    let a_expected: f64 = 88.2353;

    let rel_err_a: f64 = (a - a_expected).abs() / a_expected;
    assert!(
        rel_err_a < 0.01,
        "a: computed={:.4} mm, expected={:.4} mm, err={:.4}%",
        a, a_expected, rel_err_a * 100.0
    );

    // --- Verify tension-controlled section ---
    let c: f64 = a / beta1;
    let eps_t: f64 = 0.003 * (d - c) / c;
    assert!(
        eps_t >= 0.005,
        "Section must be tension-controlled: εt={:.6} < 0.005", eps_t
    );

    // --- Nominal moment ---
    let mn: f64 = as_steel * fy * (d - a / 2.0) / 1.0e6; // kN·m
    let mn_expected: f64 = 249.41;

    let rel_err_mn: f64 = (mn - mn_expected).abs() / mn_expected;
    assert!(
        rel_err_mn < 0.01,
        "Mn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn, mn_expected, rel_err_mn * 100.0
    );

    // --- Design moment capacity ---
    let phi_mn: f64 = phi * mn;
    let phi_mn_expected: f64 = 224.47;

    let rel_err_phi: f64 = (phi_mn - phi_mn_expected).abs() / phi_mn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φMn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        phi_mn, phi_mn_expected, rel_err_phi * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. ACI 318-19 Doubly Reinforced Beam
// ═══════════════════════════════════════════════════════════════
//
// Same beam as test 1, but with compression steel As' = 600 mm².
// d' = 60 mm (compression steel centroid from compression face).
//
// Assume compression steel yields, try:
//   a = (As − As')·fy / (0.85·f'c·b) = (1500 − 600)·420 / (0.85·28·300) = 52.94 mm
//   c = a/β₁ = 52.94/0.85 = 62.28 mm
//   ε's = 0.003·(c − d')/c = 0.003·(62.28 − 60)/62.28 = 0.000110
//   fy/Es = 420/200000 = 0.0021
//   ε's < fy/Es → compression steel does NOT yield.
//
// Exact solution (quadratic equilibrium):
//   0.85·f'c·β₁·c·b + As'·Es·0.003·(c − d')/c = As·fy
//   6069·c² − 270000·c − 21,600,000 = 0
//   c = 85.91 mm,  a = β₁·c = 73.03 mm
//   f's = Es·0.003·(85.91 − 60)/85.91 = 180.98 MPa
//
// εt = 0.003·(440 − 85.91)/85.91 = 0.01236 ≥ 0.005 → φ = 0.9
//
// Mn = 0.85·f'c·a·b·(d − a/2) + As'·f's·(d − d')
//    = 0.85·28·73.03·300·(440 − 36.51) + 600·180.98·(440 − 60)
//    = 210.38 × 10⁶ + 41.26 × 10⁶
//    = 251.65 kN·m
//
// φMn = 0.9 × 251.65 = 226.48 kN·m

#[test]
fn validation_aci318_doubly_reinforced_beam() {
    // --- Input ---
    let as_tens: f64 = 1500.0;    // mm², tension steel
    let as_comp: f64 = 600.0;     // mm², compression steel
    let fy: f64 = 420.0;          // MPa
    let fc_prime: f64 = 28.0;     // MPa
    let es_steel: f64 = 200_000.0; // MPa, steel elastic modulus
    let b: f64 = 300.0;           // mm
    let d: f64 = 440.0;           // mm, effective depth (tension side)
    let d_prime: f64 = 60.0;      // mm, cover to compression steel centroid
    let beta1: f64 = 0.85;        // for f'c ≤ 28 MPa
    let eps_cu: f64 = 0.003;      // ultimate concrete strain
    let phi: f64 = 0.9;

    // --- Solve quadratic for neutral axis depth c ---
    // 0.85·f'c·β₁·b·c + As'·Es·εcu·(c − d')/c = As·fy
    // → (0.85·f'c·β₁·b)·c² + As'·Es·εcu·c − As'·Es·εcu·d' = As·fy·c
    // → (0.85·f'c·β₁·b)·c² − As·fy·c + As'·Es·εcu·c − As'·Es·εcu·d' = 0
    // → (0.85·f'c·β₁·b)·c² − (As·fy − As'·Es·εcu)·c − As'·Es·εcu·d' = 0
    let coeff_a: f64 = 0.85 * fc_prime * beta1 * b;
    let coeff_b: f64 = -(as_tens * fy - as_comp * es_steel * eps_cu);
    let coeff_c: f64 = -as_comp * es_steel * eps_cu * d_prime;

    let discriminant: f64 = coeff_b * coeff_b - 4.0 * coeff_a * coeff_c;
    assert!(discriminant > 0.0, "Discriminant must be positive");

    let c: f64 = (-coeff_b + discriminant.sqrt()) / (2.0 * coeff_a);
    let c_expected: f64 = 85.91;

    let rel_err_c: f64 = (c - c_expected).abs() / c_expected;
    assert!(
        rel_err_c < 0.01,
        "c: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        c, c_expected, rel_err_c * 100.0
    );

    // --- Compression steel stress ---
    let a: f64 = beta1 * c;
    let fs_prime: f64 = (es_steel * eps_cu * (c - d_prime) / c).min(fy);
    let fs_prime_expected: f64 = 180.98;

    let rel_err_fs: f64 = (fs_prime - fs_prime_expected).abs() / fs_prime_expected;
    assert!(
        rel_err_fs < 0.01,
        "f's: computed={:.2} MPa, expected={:.2} MPa, err={:.4}%",
        fs_prime, fs_prime_expected, rel_err_fs * 100.0
    );

    // Verify compression steel does NOT yield
    assert!(
        fs_prime < fy,
        "Compression steel should not yield: f's={:.2} < fy={:.2}", fs_prime, fy
    );

    // --- Verify tension-controlled ---
    let eps_t: f64 = eps_cu * (d - c) / c;
    assert!(
        eps_t >= 0.005,
        "Section must be tension-controlled: εt={:.6} < 0.005", eps_t
    );

    // --- Nominal moment (about tension steel) ---
    let mn_concrete: f64 = 0.85 * fc_prime * a * b * (d - a / 2.0); // N·mm
    let mn_comp_steel: f64 = as_comp * fs_prime * (d - d_prime);      // N·mm
    let mn: f64 = (mn_concrete + mn_comp_steel) / 1.0e6;              // kN·m
    let mn_expected: f64 = 251.65;

    let rel_err_mn: f64 = (mn - mn_expected).abs() / mn_expected;
    assert!(
        rel_err_mn < 0.01,
        "Mn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mn, mn_expected, rel_err_mn * 100.0
    );

    // --- Design moment ---
    let phi_mn: f64 = phi * mn;
    let phi_mn_expected: f64 = 226.48;

    let rel_err_phi: f64 = (phi_mn - phi_mn_expected).abs() / phi_mn_expected;
    assert!(
        rel_err_phi < 0.01,
        "φMn: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        phi_mn, phi_mn_expected, rel_err_phi * 100.0
    );

    // --- Capacity increase over singly reinforced (test 1) ---
    let phi_mn_single: f64 = 224.47; // from test 1
    let increase_pct: f64 = (phi_mn - phi_mn_single) / phi_mn_single * 100.0;
    assert!(
        increase_pct > 0.0,
        "Doubly reinforced must have higher capacity than singly: increase={:.2}%",
        increase_pct
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. EC2 Flexural Capacity — Rectangular Stress Block
// ═══════════════════════════════════════════════════════════════
//
// EN 1992-1-1 §3.1.7: For fck ≤ 50 MPa, η = 1.0, λ = 0.8.
//
// Design strengths:
//   fcd = αcc·fck/γc = 1.0 × 28 / 1.5 = 18.667 MPa
//   fyd = fyk/γs = 420 / 1.15 = 365.22 MPa
//
// Same section geometry: b = 300 mm, d = 440 mm, As = 1500 mm².
//
// Neutral axis depth:
//   x = As·fyd / (λ·η·fcd·b)
//     = 1500 × 365.22 / (0.8 × 1.0 × 18.667 × 300)
//     = 547,826 / 4,480
//     = 122.28 mm
//
// Check ductility: x/d = 122.28/440 = 0.278 < 0.45 ✓
//
// Design moment resistance:
//   MRd = As·fyd·(d − λ·x/2)
//       = 1500 × 365.22 × (440 − 0.8 × 122.28/2)
//       = 1500 × 365.22 × (440 − 48.91)
//       = 1500 × 365.22 × 391.09
//       = 214.25 × 10⁶ N·mm = 214.25 kN·m

#[test]
fn validation_ec2_flexural_capacity_rectangular() {
    // --- Input ---
    let fck: f64 = 28.0;          // MPa, characteristic compressive strength
    let gamma_c: f64 = 1.5;       // partial safety factor for concrete
    let alpha_cc: f64 = 1.0;      // coefficient (EC2 §3.1.6)
    let fyk: f64 = 420.0;         // MPa, characteristic yield strength
    let gamma_s: f64 = 1.15;      // partial safety factor for steel
    let b: f64 = 300.0;           // mm
    let d: f64 = 440.0;           // mm
    let as_steel: f64 = 1500.0;   // mm²
    let eta: f64 = 1.0;           // for fck ≤ 50 MPa
    let lambda: f64 = 0.8;        // for fck ≤ 50 MPa

    // --- Design strengths ---
    let fcd: f64 = alpha_cc * fck / gamma_c;
    let fcd_expected: f64 = 18.667;

    let rel_err_fcd: f64 = (fcd - fcd_expected).abs() / fcd_expected;
    assert!(
        rel_err_fcd < 0.01,
        "fcd: computed={:.4} MPa, expected={:.4} MPa, err={:.4}%",
        fcd, fcd_expected, rel_err_fcd * 100.0
    );

    let fyd: f64 = fyk / gamma_s;
    let fyd_expected: f64 = 365.22;

    let rel_err_fyd: f64 = (fyd - fyd_expected).abs() / fyd_expected;
    assert!(
        rel_err_fyd < 0.01,
        "fyd: computed={:.4} MPa, expected={:.4} MPa, err={:.4}%",
        fyd, fyd_expected, rel_err_fyd * 100.0
    );

    // --- Neutral axis depth ---
    let x: f64 = as_steel * fyd / (lambda * eta * fcd * b);
    let x_expected: f64 = 122.28;

    let rel_err_x: f64 = (x - x_expected).abs() / x_expected;
    assert!(
        rel_err_x < 0.01,
        "x: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        x, x_expected, rel_err_x * 100.0
    );

    // --- Ductility check ---
    let x_over_d: f64 = x / d;
    assert!(
        x_over_d < 0.45,
        "x/d = {:.4} must be < 0.45 for adequate ductility", x_over_d
    );

    // --- Design moment resistance ---
    let m_rd: f64 = as_steel * fyd * (d - lambda * x / 2.0) / 1.0e6; // kN·m
    let m_rd_expected: f64 = 214.25;

    let rel_err_m: f64 = (m_rd - m_rd_expected).abs() / m_rd_expected;
    assert!(
        rel_err_m < 0.01,
        "MRd: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        m_rd, m_rd_expected, rel_err_m * 100.0
    );

    // --- Compare with ACI result (test 1) ---
    // ACI φMn = 224.47 kN·m vs EC2 MRd = 214.25 kN·m
    // EC2 is more conservative due to higher material partial factors
    let aci_phi_mn: f64 = 224.47;
    assert!(
        m_rd < aci_phi_mn,
        "EC2 MRd={:.2} should be less than ACI φMn={:.2} (more conservative)",
        m_rd, aci_phi_mn
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. ACI 318-19 Shear Capacity — §22.5
// ═══════════════════════════════════════════════════════════════
//
// Simplified shear capacity (ACI 318-19 §22.5.5.1):
//   Vc = 0.17·λ·√f'c·bw·d
//
// λ = 1.0 (normal weight concrete), f'c = 28 MPa.
// bw = 300 mm, d = 440 mm.
//
//   Vc = 0.17 × 1.0 × √28 × 300 × 440
//      = 0.17 × 5.2915 × 132,000
//      = 118,741 N = 118.74 kN
//
// Stirrup contribution (ACI 318-19 §22.5.10.5):
//   #10 stirrups at 200 mm spacing (two legs, Av = 2 × 78.5 = 157 mm²).
//   fyt = 420 MPa.
//   Vs = Av·fyt·d / s = 157 × 420 × 440 / 200 = 145,068 N = 145.07 kN
//
// Design shear strength:
//   φVn = φ·(Vc + Vs) = 0.75 × (118.74 + 145.07) = 0.75 × 263.81 = 197.86 kN

#[test]
fn validation_aci318_shear_capacity() {
    // --- Input ---
    let lambda: f64 = 1.0;        // normal weight concrete
    let fc_prime: f64 = 28.0;     // MPa
    let bw: f64 = 300.0;          // mm, web width
    let d: f64 = 440.0;           // mm, effective depth
    let av: f64 = 157.0;          // mm², stirrup area (2 legs of #10)
    let fyt: f64 = 420.0;         // MPa, stirrup yield strength
    let s: f64 = 200.0;           // mm, stirrup spacing
    let phi_shear: f64 = 0.75;    // shear strength reduction factor

    // --- Concrete shear contribution ---
    let vc: f64 = 0.17 * lambda * fc_prime.sqrt() * bw * d; // N
    let vc_kn: f64 = vc / 1000.0;
    let vc_expected: f64 = 118.74;

    let rel_err_vc: f64 = (vc_kn - vc_expected).abs() / vc_expected;
    assert!(
        rel_err_vc < 0.01,
        "Vc: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vc_kn, vc_expected, rel_err_vc * 100.0
    );

    // --- Steel shear contribution ---
    let vs: f64 = av * fyt * d / s; // N
    let vs_kn: f64 = vs / 1000.0;
    let vs_expected: f64 = 145.07;

    let rel_err_vs: f64 = (vs_kn - vs_expected).abs() / vs_expected;
    assert!(
        rel_err_vs < 0.01,
        "Vs: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vs_kn, vs_expected, rel_err_vs * 100.0
    );

    // --- Design shear strength ---
    let phi_vn: f64 = phi_shear * (vc_kn + vs_kn);
    let phi_vn_expected: f64 = 197.86;

    let rel_err_vn: f64 = (phi_vn - phi_vn_expected).abs() / phi_vn_expected;
    assert!(
        rel_err_vn < 0.01,
        "φVn: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        phi_vn, phi_vn_expected, rel_err_vn * 100.0
    );

    // --- ACI maximum stirrup spacing check (§9.7.6.2.2) ---
    // If Vs ≤ 0.33·√f'c·bw·d → s_max = min(d/2, 600 mm)
    // If Vs > 0.33·√f'c·bw·d → s_max = min(d/4, 300 mm)
    let vs_limit: f64 = 0.33 * fc_prime.sqrt() * bw * d / 1000.0; // kN
    if vs_kn <= vs_limit {
        let s_max: f64 = (d / 2.0).min(600.0);
        assert!(
            s <= s_max,
            "Stirrup spacing s={:.0} must be ≤ s_max={:.0} mm", s, s_max
        );
    } else {
        let s_max: f64 = (d / 4.0).min(300.0);
        assert!(
            s <= s_max,
            "Stirrup spacing s={:.0} must be ≤ s_max={:.0} mm (Vs > limit)", s, s_max
        );
    }

    // --- Minimum shear reinforcement check (§9.6.3.3) ---
    let av_min_1: f64 = 0.062 * fc_prime.sqrt() * bw * s / fyt;
    let av_min_2: f64 = 0.35 * bw * s / fyt;
    let av_min: f64 = av_min_1.max(av_min_2);
    assert!(
        av >= av_min,
        "Av={:.1} mm² must be ≥ Av,min={:.1} mm²", av, av_min
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. EC2 Shear Design — §6.2
// ═══════════════════════════════════════════════════════════════
//
// Concrete shear resistance without stirrups (EC2 §6.2.2):
//   VRd,c = [CRd,c · k · (100·ρl·fck)^(1/3)] · bw · d
//
//   CRd,c = 0.18/γc = 0.18/1.5 = 0.12
//   k = 1 + √(200/d) = 1 + √(200/440) = 1.674 ≤ 2.0  ✓
//   ρl = As/(bw·d) = 1500/(300×440) = 0.01136 ≤ 0.02  ✓
//
//   VRd,c = 0.12 × 1.674 × (100 × 0.01136 × 28)^(1/3) × 300 × 440
//         = 0.12 × 1.674 × (31.818)^(1/3) × 132,000
//         = 0.12 × 1.674 × 3.170 × 132,000
//         = 84,034 N = 84.03 kN
//
// With stirrups (EC2 §6.2.3), using θ = 21.8° (cot θ = 2.5):
//   VRd,s = (Asw/s) · z · fywd · cot θ
//   z = 0.9·d = 396 mm
//   fywd = fywk/γs = 420/1.15 = 365.22 MPa
//
//   VRd,s = (157/200) × 396 × 365.22 × 2.5
//         = 0.785 × 396 × 365.22 × 2.5
//         = 283,849 N = 283.85 kN

#[test]
fn validation_ec2_shear_design() {
    // --- Input ---
    let fck: f64 = 28.0;          // MPa
    let gamma_c: f64 = 1.5;
    let gamma_s: f64 = 1.15;
    let bw: f64 = 300.0;          // mm
    let d: f64 = 440.0;           // mm
    let as_long: f64 = 1500.0;    // mm², longitudinal steel
    let asw: f64 = 157.0;         // mm², stirrup area (two legs #10)
    let s: f64 = 200.0;           // mm, stirrup spacing
    let fywk: f64 = 420.0;        // MPa, stirrup yield strength

    // --- Concrete shear resistance (VRd,c) ---
    let c_rd_c: f64 = 0.18 / gamma_c;
    let c_rd_c_expected: f64 = 0.12;

    let rel_err_crd: f64 = (c_rd_c - c_rd_c_expected).abs() / c_rd_c_expected;
    assert!(
        rel_err_crd < 0.01,
        "CRd,c: computed={:.4}, expected={:.4}", c_rd_c, c_rd_c_expected
    );

    let k: f64 = (1.0 + (200.0 / d).sqrt()).min(2.0);
    let k_expected: f64 = 1.674;

    let rel_err_k: f64 = (k - k_expected).abs() / k_expected;
    assert!(
        rel_err_k < 0.01,
        "k: computed={:.4}, expected={:.4}, err={:.4}%",
        k, k_expected, rel_err_k * 100.0
    );

    let rho_l: f64 = (as_long / (bw * d)).min(0.02);
    let rho_l_expected: f64 = 0.01136;

    let rel_err_rho: f64 = (rho_l - rho_l_expected).abs() / rho_l_expected;
    assert!(
        rel_err_rho < 0.01,
        "ρl: computed={:.6}, expected={:.6}, err={:.4}%",
        rho_l, rho_l_expected, rel_err_rho * 100.0
    );

    let vrd_c: f64 = c_rd_c * k * (100.0 * rho_l * fck).powf(1.0 / 3.0) * bw * d; // N
    let vrd_c_kn: f64 = vrd_c / 1000.0;
    let vrd_c_expected: f64 = 84.03;

    let rel_err_vrd: f64 = (vrd_c_kn - vrd_c_expected).abs() / vrd_c_expected;
    assert!(
        rel_err_vrd < 0.01,
        "VRd,c: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vrd_c_kn, vrd_c_expected, rel_err_vrd * 100.0
    );

    // --- Minimum shear resistance (EC2 §6.2.2(1)) ---
    let v_min: f64 = 0.035 * k.powf(1.5) * fck.sqrt();
    let vrd_c_min: f64 = v_min * bw * d / 1000.0; // kN
    assert!(
        vrd_c_kn >= vrd_c_min,
        "VRd,c={:.2} kN must be ≥ VRd,c,min={:.2} kN", vrd_c_kn, vrd_c_min
    );

    // --- Stirrup shear resistance (VRd,s) ---
    let z: f64 = 0.9 * d;
    let fywd: f64 = fywk / gamma_s;
    let cot_theta: f64 = 2.5; // θ = 21.8° (EC2 recommended minimum angle)

    let vrd_s: f64 = asw / s * z * fywd * cot_theta; // N
    let vrd_s_kn: f64 = vrd_s / 1000.0;
    let vrd_s_expected: f64 = 283.85;

    let rel_err_vs: f64 = (vrd_s_kn - vrd_s_expected).abs() / vrd_s_expected;
    assert!(
        rel_err_vs < 0.01,
        "VRd,s: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        vrd_s_kn, vrd_s_expected, rel_err_vs * 100.0
    );

    // --- Maximum strut capacity (VRd,max) ---
    let alpha_cw: f64 = 1.0; // non-prestressed
    let nu1: f64 = 0.6 * (1.0 - fck / 250.0);
    let fcd: f64 = fck / gamma_c;
    let tan_theta: f64 = 1.0 / cot_theta;
    let vrd_max: f64 = alpha_cw * bw * z * nu1 * fcd / (cot_theta + tan_theta); // N
    let vrd_max_kn: f64 = vrd_max / 1000.0;

    // VRd,s must not exceed VRd,max
    assert!(
        vrd_s_kn <= vrd_max_kn,
        "VRd,s={:.2} kN must be ≤ VRd,max={:.2} kN", vrd_s_kn, vrd_max_kn
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. ACI 318-19 Column Interaction — Balanced Condition
// ═══════════════════════════════════════════════════════════════
//
// 400 × 400 mm tied column, 8-#25 bars (As_total = 4000 mm²),
// f'c = 35 MPa, fy = 420 MPa.
// d = 340 mm (cover + tie + bar/2 ≈ 60 mm), d' = 60 mm.
// Steel: 4 bars at d' (compression face), 4 bars at d (tension face).
//
// β₁ = 0.85 − 0.05·(f'c − 28)/7 = 0.85 − 0.05·(35 − 28)/7 = 0.80
//
// Balanced condition: εt = εy = fy/Es = 0.0021
//   cb = εcu·d / (εcu + εy) = 0.003 × 340 / (0.003 + 0.0021)
//      = 1020/5.1 × 1e-3 = 200.0 mm
//   ab = β₁·cb = 0.80 × 200 = 160.0 mm
//
// Compression steel strain:
//   ε's = 0.003·(cb − d')/cb = 0.003·(200 − 60)/200 = 0.0021 → yields (fy)
//
// Forces (taking compression positive):
//   Cc = 0.85·f'c·ab·b = 0.85 × 35 × 160 × 400 = 1,904,000 N
//   Cs = As'·(fy − 0.85·f'c) = 2000·(420 − 29.75) = 780,500 N
//   Ts = As·fy = 2000 × 420 = 840,000 N
//
//   Pb = Cc + Cs − Ts = 1,904,000 + 780,500 − 840,000 = 1,844,500 N = 1844.5 kN
//
// Moment about centroid (h/2 = 200 mm):
//   Mb = Cc·(h/2 − ab/2) + Cs·(h/2 − d') + Ts·(d − h/2)
//      = 1,904,000·(200 − 80) + 780,500·(200 − 60) + 840,000·(340 − 200)
//      = 1,904,000·120 + 780,500·140 + 840,000·140
//      = 228,480,000 + 109,270,000 + 117,600,000
//      = 455,350,000 N·mm = 455.35 kN·m

#[test]
fn validation_aci318_column_interaction_point() {
    // --- Input ---
    let fc_prime: f64 = 35.0;     // MPa
    let fy: f64 = 420.0;          // MPa
    let es_steel: f64 = 200_000.0; // MPa
    let b_col: f64 = 400.0;       // mm
    let h_col: f64 = 400.0;       // mm
    let as_total: f64 = 4000.0;   // mm²
    let as_comp: f64 = as_total / 2.0; // mm², compression face (4 bars)
    let as_tens: f64 = as_total / 2.0; // mm², tension face (4 bars)
    let d: f64 = 340.0;           // mm
    let d_prime: f64 = 60.0;      // mm
    let eps_cu: f64 = 0.003;

    // --- β₁ for f'c = 35 MPa ---
    let beta1: f64 = 0.85 - 0.05 * (fc_prime - 28.0) / 7.0;
    let beta1_expected: f64 = 0.80;

    let rel_err_b1: f64 = (beta1 - beta1_expected).abs() / beta1_expected;
    assert!(
        rel_err_b1 < 0.01,
        "β₁: computed={:.4}, expected={:.4}", beta1, beta1_expected
    );

    // --- Balanced neutral axis depth ---
    let eps_y: f64 = fy / es_steel; // 0.0021
    let cb: f64 = eps_cu * d / (eps_cu + eps_y);
    let cb_expected: f64 = 200.0;

    let rel_err_cb: f64 = (cb - cb_expected).abs() / cb_expected;
    assert!(
        rel_err_cb < 0.01,
        "cb: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        cb, cb_expected, rel_err_cb * 100.0
    );

    let ab: f64 = beta1 * cb;
    let ab_expected: f64 = 160.0;

    let rel_err_ab: f64 = (ab - ab_expected).abs() / ab_expected;
    assert!(
        rel_err_ab < 0.01,
        "ab: computed={:.2} mm, expected={:.2} mm", ab, ab_expected
    );

    // --- Compression steel strain check ---
    let eps_s_comp: f64 = eps_cu * (cb - d_prime) / cb;
    assert!(
        eps_s_comp >= eps_y,
        "Compression steel must yield at balanced: ε's={:.6} ≥ εy={:.6}",
        eps_s_comp, eps_y
    );

    let fs_comp: f64 = fy; // compression steel yields

    // --- Forces ---
    let cc: f64 = 0.85 * fc_prime * ab * b_col;                  // N
    let cs: f64 = as_comp * (fs_comp - 0.85 * fc_prime);         // N (net of displaced concrete)
    let ts: f64 = as_tens * fy;                                    // N

    let cc_expected: f64 = 1_904_000.0;
    let cs_expected: f64 = 780_500.0;
    let ts_expected: f64 = 840_000.0;

    let rel_err_cc: f64 = (cc - cc_expected).abs() / cc_expected;
    assert!(
        rel_err_cc < 0.01,
        "Cc: computed={:.0} N, expected={:.0} N", cc, cc_expected
    );

    let rel_err_cs: f64 = (cs - cs_expected).abs() / cs_expected;
    assert!(
        rel_err_cs < 0.01,
        "Cs: computed={:.0} N, expected={:.0} N", cs, cs_expected
    );

    let rel_err_ts: f64 = (ts - ts_expected).abs() / ts_expected;
    assert!(
        rel_err_ts < 0.01,
        "Ts: computed={:.0} N, expected={:.0} N", ts, ts_expected
    );

    // --- Balanced axial load ---
    let pb: f64 = (cc + cs - ts) / 1000.0; // kN
    let pb_expected: f64 = 1844.5;

    let rel_err_pb: f64 = (pb - pb_expected).abs() / pb_expected;
    assert!(
        rel_err_pb < 0.01,
        "Pb: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        pb, pb_expected, rel_err_pb * 100.0
    );

    // --- Balanced moment (about section centroid) ---
    let centroid: f64 = h_col / 2.0; // 200 mm
    let mb: f64 = (cc * (centroid - ab / 2.0)
        + cs * (centroid - d_prime)
        + ts * (d - centroid))
        / 1.0e6; // kN·m
    let mb_expected: f64 = 455.35;

    let rel_err_mb: f64 = (mb - mb_expected).abs() / mb_expected;
    assert!(
        rel_err_mb < 0.01,
        "Mb: computed={:.2} kN·m, expected={:.2} kN·m, err={:.4}%",
        mb, mb_expected, rel_err_mb * 100.0
    );

    // --- Sanity: Pb must be between 0 and Po ---
    let po: f64 = (0.85 * fc_prime * (b_col * h_col - as_total) + as_total * fy) / 1000.0; // kN
    assert!(
        pb > 0.0 && pb < po,
        "Pb={:.2} kN must be between 0 and Po={:.2} kN", pb, po
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. CIRSOC 201 / EC2 §7.3 Crack Width Calculation
// ═══════════════════════════════════════════════════════════════
//
// wk = sr,max × (εsm − εcm)
//
// Section: b = 300 mm, h = 500 mm, d = 440 mm, As = 1500 mm².
// Cover c = 40 mm, bar diameter φ = 16 mm.
// k1 = 0.8 (high bond bars), k2 = 0.5 (bending).
//
// Effective tension area (EC2 §7.3.2(3)):
//   hc,eff = min(2.5·(h−d), h/3, h/2) = min(150, 166.7, 250) = 150 mm
//   Ac,eff = hc,eff × b = 150 × 300 = 45,000 mm²
//   ρp,eff = As / Ac,eff = 1500 / 45000 = 0.03333
//
// Maximum crack spacing (EC2 Eq. 7.11):
//   sr,max = 3.4·c + 0.425·k1·k2·φ/ρp,eff
//          = 3.4 × 40 + 0.425 × 0.8 × 0.5 × 16 / 0.03333
//          = 136 + 81.6 = 217.6 mm
//
// Mean strain difference (EC2 Eq. 7.9):
//   σs = 250 MPa (service steel stress)
//   Ecm = 22,000·(fck/10)^0.3 = 22,000·2.8^0.3 = 29,962 MPa
//   αe = Es/Ecm = 200,000/29,962 = 6.675
//   kt = 0.4 (long-term loading)
//   fct,eff = 0.3·fck^(2/3) = 0.3 × 28^(2/3) = 2.766 MPa
//
//   εsm − εcm = max(
//     [σs − kt·fct,eff/ρp,eff·(1 + αe·ρp,eff)] / Es,
//     0.6·σs/Es
//   )
//   term1 = [250 − 0.4 × 2.766/0.03333 × (1 + 6.675 × 0.03333)] / 200,000
//         = [250 − 33.19 × 1.2225] / 200,000
//         = [250 − 40.58] / 200,000 = 0.001047
//   term2 = 0.6 × 250 / 200,000 = 0.000750
//
//   εsm − εcm = 0.001047
//
// Crack width:
//   wk = 217.6 × 0.001047 = 0.228 mm
//
// Limit (EC2 Table 7.1N, exposure XC1): wk,max = 0.40 mm → OK.
// Limit (EC2 Table 7.1N, exposure XC2-XC4): wk,max = 0.30 mm → OK.

#[test]
fn validation_cirsoc201_crack_width() {
    // --- Input ---
    let b: f64 = 300.0;           // mm
    let h: f64 = 500.0;           // mm
    let d: f64 = 440.0;           // mm
    let as_steel: f64 = 1500.0;   // mm²
    let c_cover: f64 = 40.0;      // mm, concrete cover
    let phi_bar: f64 = 16.0;      // mm, bar diameter
    let k1: f64 = 0.8;            // high bond bars
    let k2: f64 = 0.5;            // pure bending
    let fck: f64 = 28.0;          // MPa
    let sigma_s: f64 = 250.0;     // MPa, service steel stress
    let es_steel: f64 = 200_000.0; // MPa
    let kt: f64 = 0.4;            // long-term loading

    // --- Effective tension area ---
    let hc_eff: f64 = (2.5 * (h - d)).min(h / 3.0).min(h / 2.0);
    let hc_eff_expected: f64 = 150.0;

    let rel_err_hc: f64 = (hc_eff - hc_eff_expected).abs() / hc_eff_expected;
    assert!(
        rel_err_hc < 0.01,
        "hc,eff: computed={:.2} mm, expected={:.2} mm", hc_eff, hc_eff_expected
    );

    let ac_eff: f64 = hc_eff * b;
    let rho_p_eff: f64 = as_steel / ac_eff;
    let rho_p_eff_expected: f64 = 0.03333;

    let rel_err_rho: f64 = (rho_p_eff - rho_p_eff_expected).abs() / rho_p_eff_expected;
    assert!(
        rel_err_rho < 0.01,
        "ρp,eff: computed={:.6}, expected={:.6}", rho_p_eff, rho_p_eff_expected
    );

    // --- Maximum crack spacing (EC2 Eq. 7.11) ---
    let sr_max: f64 = 3.4 * c_cover + 0.425 * k1 * k2 * phi_bar / rho_p_eff;
    let sr_max_expected: f64 = 217.6;

    let rel_err_sr: f64 = (sr_max - sr_max_expected).abs() / sr_max_expected;
    assert!(
        rel_err_sr < 0.01,
        "sr,max: computed={:.2} mm, expected={:.2} mm, err={:.4}%",
        sr_max, sr_max_expected, rel_err_sr * 100.0
    );

    // --- Material properties ---
    let ecm: f64 = 22_000.0 * (fck / 10.0).powf(0.3); // MPa
    let alpha_e: f64 = es_steel / ecm;
    let fct_eff: f64 = 0.3 * fck.powf(2.0 / 3.0); // MPa, mean tensile strength

    let fct_expected: f64 = 2.766;
    let rel_err_fct: f64 = (fct_eff - fct_expected).abs() / fct_expected;
    assert!(
        rel_err_fct < 0.01,
        "fct,eff: computed={:.4} MPa, expected={:.4} MPa", fct_eff, fct_expected
    );

    // --- Mean strain difference (EC2 Eq. 7.9) ---
    let term1: f64 = (sigma_s - kt * fct_eff / rho_p_eff * (1.0 + alpha_e * rho_p_eff))
        / es_steel;
    let term2: f64 = 0.6 * sigma_s / es_steel;
    let eps_diff: f64 = term1.max(term2);

    let eps_diff_expected: f64 = 0.001047;
    let rel_err_eps: f64 = (eps_diff - eps_diff_expected).abs() / eps_diff_expected;
    assert!(
        rel_err_eps < 0.01,
        "εsm−εcm: computed={:.6}, expected={:.6}, err={:.4}%",
        eps_diff, eps_diff_expected, rel_err_eps * 100.0
    );

    // Verify term1 governs over the 0.6·σs/Es minimum
    assert!(
        term1 > term2,
        "Term1={:.6} should govern over 0.6·σs/Es={:.6}", term1, term2
    );

    // --- Crack width ---
    let wk: f64 = sr_max * eps_diff;
    let wk_expected: f64 = 0.228;

    let rel_err_wk: f64 = (wk - wk_expected).abs() / wk_expected;
    assert!(
        rel_err_wk < 0.01,
        "wk: computed={:.4} mm, expected={:.4} mm, err={:.4}%",
        wk, wk_expected, rel_err_wk * 100.0
    );

    // --- Check against EC2 limits ---
    let wk_limit_xc1: f64 = 0.40;  // Exposure class XC1
    let wk_limit_xc2: f64 = 0.30;  // Exposure class XC2-XC4
    assert!(
        wk <= wk_limit_xc1,
        "wk={:.4} mm must be ≤ {:.2} mm for XC1 exposure", wk, wk_limit_xc1
    );
    assert!(
        wk <= wk_limit_xc2,
        "wk={:.4} mm must be ≤ {:.2} mm for XC2-XC4 exposure", wk, wk_limit_xc2
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. ACI 318-19 §25.4 Development Length — Tension Bars
// ═══════════════════════════════════════════════════════════════
//
// #25 bar (db = 25.4 mm), fy = 420 MPa, f'c = 28 MPa.
//
// Modification factors (ACI 318-19 §25.4.2.4):
//   ψt = 1.0 (bottom bars, not top-bar effect)
//   ψe = 1.0 (uncoated reinforcement)
//   ψs = 1.0 (bar size ≥ #22, i.e. db ≥ 19 mm)
//   ψg = 1.0 (Grade 420 steel)
//   λ  = 1.0 (normal weight concrete)
//
// Simplified development length (ACI 318-19 §25.4.2.3):
//   ld/db = (fy · ψt · ψe · ψs · ψg) / (1.1 · λ · √f'c)
//
//   ld/db = (420 × 1.0 × 1.0 × 1.0 × 1.0) / (1.1 × 1.0 × √28)
//         = 420 / (1.1 × 5.2915)
//         = 420 / 5.8207
//         = 72.16
//
//   ld = 72.16 × 25.4 = 1832.8 mm
//
// ACI minimum: ld ≥ 300 mm → 1832.8 ≥ 300 ✓

#[test]
fn validation_aci318_development_length() {
    // --- Input ---
    let db: f64 = 25.4;           // mm, #25 bar diameter
    let fy: f64 = 420.0;          // MPa
    let fc_prime: f64 = 28.0;     // MPa
    let psi_t: f64 = 1.0;         // casting position (bottom bars)
    let psi_e: f64 = 1.0;         // coating (uncoated)
    let psi_s: f64 = 1.0;         // bar size (≥ #22)
    let psi_g: f64 = 1.0;         // grade factor (Grade 420)
    let lambda: f64 = 1.0;        // lightweight factor (normal weight)

    // --- Development length ratio ---
    let ld_over_db: f64 =
        (fy * psi_t * psi_e * psi_s * psi_g) / (1.1 * lambda * fc_prime.sqrt());
    let ld_over_db_expected: f64 = 72.16;

    let rel_err_ratio: f64 = (ld_over_db - ld_over_db_expected).abs() / ld_over_db_expected;
    assert!(
        rel_err_ratio < 0.01,
        "ld/db: computed={:.2}, expected={:.2}, err={:.4}%",
        ld_over_db, ld_over_db_expected, rel_err_ratio * 100.0
    );

    // --- Development length ---
    let ld: f64 = ld_over_db * db;
    let ld_expected: f64 = 1832.8;

    let rel_err_ld: f64 = (ld - ld_expected).abs() / ld_expected;
    assert!(
        rel_err_ld < 0.01,
        "ld: computed={:.1} mm, expected={:.1} mm, err={:.4}%",
        ld, ld_expected, rel_err_ld * 100.0
    );

    // --- ACI minimum check ---
    let ld_min: f64 = 300.0; // mm
    let ld_final: f64 = ld.max(ld_min);
    assert!(
        ld_final >= ld_min,
        "ld={:.1} mm must be ≥ {:.0} mm (ACI minimum)", ld_final, ld_min
    );
    assert!(
        (ld_final - ld).abs() < 0.01,
        "ld governs over minimum: ld={:.1} > ld_min={:.0}", ld, ld_min
    );

    // --- Top-bar effect comparison ---
    // If bar is cast with > 300 mm of concrete below it, ψt = 1.3
    let psi_t_top: f64 = 1.3;
    let ld_top_over_db: f64 =
        (fy * psi_t_top * psi_e * psi_s * psi_g) / (1.1 * lambda * fc_prime.sqrt());
    let ld_top: f64 = ld_top_over_db * db;

    // Top bar length should be 30% longer
    let top_bar_increase: f64 = ld_top / ld;
    let increase_expected: f64 = 1.3;

    let rel_err_inc: f64 = (top_bar_increase - increase_expected).abs() / increase_expected;
    assert!(
        rel_err_inc < 0.01,
        "Top bar increase: computed={:.4}, expected={:.4}", top_bar_increase, increase_expected
    );

    // --- Epoxy-coated bar comparison ---
    // ψe = 1.5 for epoxy-coated bars with cover < 3db or spacing < 6db
    // ψe = 1.2 otherwise
    // But ψt × ψe need not exceed 1.7
    let psi_e_epoxy: f64 = 1.5;
    let psi_t_psi_e: f64 = (psi_t * psi_e_epoxy).min(1.7);
    let ld_epoxy_over_db: f64 =
        (fy * psi_t_psi_e * psi_s * psi_g) / (1.1 * lambda * fc_prime.sqrt());
    let ld_epoxy: f64 = ld_epoxy_over_db * db;

    assert!(
        ld_epoxy > ld,
        "Epoxy-coated ld={:.1} mm must exceed uncoated ld={:.1} mm",
        ld_epoxy, ld
    );
}
