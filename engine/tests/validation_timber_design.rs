/// Validation: Timber Design
///
/// References:
///   - NDS-2024: National Design Specification for Wood Construction (AWC)
///   - EN 1995-1-1:2004 (EC5): Design of timber structures
///   - CIRSOC 601: Argentine timber design standard
///   - Breyer, Fridley, Cobeen, Pollock: "Design of Wood Structures - ASD/LRFD" 8th ed.
///   - Thelandersson & Larsen: "Timber Engineering"
///
/// Tests verify allowable stress design, adjustment factors, and member capacity.

mod helpers;

// ═══════════════════════════════════════════════════════════════
// 1. NDS Bending Capacity — 2x10 Douglas Fir-Larch No.1
// ═══════════════════════════════════════════════════════════════
//
// Reference design values for D.Fir-Larch No.1:
//   Fb = 1000 psi (reference bending stress)
//
// Adjustment factors:
//   CD = 1.0 (normal load duration)
//   CM = 1.0 (dry service)
//   Ct = 1.0 (normal temperature)
//   CL = 1.0 (full lateral support)
//   CF = 1.1 (size factor for 2x10)
//
// Adjusted bending stress:
//   F'b = Fb * CD * CM * Ct * CL * CF
//       = 1000 * 1.0 * 1.0 * 1.0 * 1.0 * 1.1 = 1100 psi
//
// Section properties (actual dimensions 1.5" x 9.25"):
//   S = b*d^2/6 = 1.5 * 9.25^2 / 6 = 21.390625 in^3
//
// Allowable moment:
//   M_allow = F'b * S = 1100 * 21.390625 = 23,529.69 lb-in
//           = 23,529.69 / 12 = 1,960.81 lb-ft

#[test]
fn validation_nds_bending_capacity_2x10() {
    // --- Input ---
    let fb = 1000.0_f64;  // psi, reference bending design value
    let cd = 1.0;         // load duration factor (normal)
    let cm = 1.0;         // wet service factor (dry)
    let ct = 1.0;         // temperature factor
    let cl = 1.0;         // beam stability factor (full lateral support)
    let cf = 1.1;         // size factor for 2x10

    let b = 1.5_f64;      // in, actual width
    let d = 9.25_f64;     // in, actual depth

    // --- Adjusted bending stress ---
    let fb_prime = fb * cd * cm * ct * cl * cf;
    let fb_prime_expected = 1100.0; // psi

    let rel_err_fb = (fb_prime - fb_prime_expected).abs() / fb_prime_expected;
    assert!(
        rel_err_fb < 0.01,
        "F'b: computed={:.2} psi, expected={:.2} psi, err={:.4}%",
        fb_prime, fb_prime_expected, rel_err_fb * 100.0
    );

    // --- Section modulus ---
    let s = b * d * d / 6.0;
    let s_expected = 21.390625; // in^3

    let rel_err_s = (s - s_expected).abs() / s_expected;
    assert!(
        rel_err_s < 0.01,
        "S: computed={:.4} in^3, expected={:.4} in^3, err={:.4}%",
        s, s_expected, rel_err_s * 100.0
    );

    // --- Allowable moment ---
    let m_allow_lb_in = fb_prime * s;
    let m_allow_lb_ft = m_allow_lb_in / 12.0;
    let m_expected_lb_ft = 1960.81;

    let rel_err_m = (m_allow_lb_ft - m_expected_lb_ft).abs() / m_expected_lb_ft;
    assert!(
        rel_err_m < 0.01,
        "M_allow: computed={:.2} lb-ft, expected={:.2} lb-ft, err={:.4}%",
        m_allow_lb_ft, m_expected_lb_ft, rel_err_m * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. NDS Column Stability Factor — 6x6 Post, D.Fir No.1
// ═══════════════════════════════════════════════════════════════
//
// 6x6 post (actual 5.5" x 5.5"), height = 10 ft = 120 in.
// Fc = 1000 psi (reference compression), E'min = 580,000 psi.
//
// Slenderness:
//   Le/d = 120 / 5.5 = 21.818
//
// Euler buckling stress (NDS):
//   FcE = 0.822 * E'min / (Le/d)^2
//       = 0.822 * 580000 / 21.818^2 = 1001.5 psi
//
// Fc* = Fc * CD * CM * Ct * CF = 1000 * 1.0 * 1.0 * 1.0 * 1.0 = 1000 psi
// (all adjustment factors except Cp are 1.0)
//
// Ratio: FcE / Fc* = 1001.5 / 1000 = 1.0015
// c = 0.8 (sawn lumber)
//
// Column stability factor (NDS Eq. 3.7-1):
//   Cp = (1 + FcE/Fc*) / (2c) - sqrt[ ((1 + FcE/Fc*) / (2c))^2 - (FcE/Fc*) / c ]
//
//   numerator1 = (1 + 1.0015) / (2 * 0.8) = 2.0015 / 1.6 = 1.25094
//   term_under_sqrt = 1.25094^2 - 1.0015 / 0.8 = 1.56485 - 1.25188 = 0.31297
//   Cp = 1.25094 - sqrt(0.31297) = 1.25094 - 0.55944 = 0.6915
//
// F'c = Fc * Cp = 1000 * 0.6915 = 691.5 psi

#[test]
fn validation_nds_column_stability_factor() {
    // --- Input ---
    let fc = 1000.0_f64;       // psi, reference compression design value
    let e_min_prime = 580_000.0; // psi, adjusted modulus for stability
    let le = 120.0_f64;        // in, effective column length (10 ft)
    let d = 5.5_f64;           // in, actual dimension (least)
    let c = 0.8_f64;           // sawn lumber coefficient

    // All other adjustment factors = 1.0
    let cd = 1.0;
    let cm = 1.0;
    let ct = 1.0;
    let cf = 1.0;

    // --- Slenderness ---
    let slenderness = le / d;
    let slenderness_expected = 21.818;

    let rel_err_sl = (slenderness - slenderness_expected).abs() / slenderness_expected;
    assert!(
        rel_err_sl < 0.01,
        "Le/d: computed={:.3}, expected={:.3}, err={:.4}%",
        slenderness, slenderness_expected, rel_err_sl * 100.0
    );

    // --- Euler buckling stress ---
    let fce = 0.822 * e_min_prime / (slenderness * slenderness);
    // Expected: 0.822 * 580000 / (21.818^2) = 476760 / 475.825 = 1001.96
    assert!(
        fce > 900.0 && fce < 1100.0,
        "FcE={:.2} should be near 1002 psi", fce
    );

    // --- Fc* (adjusted Fc without Cp) ---
    let fc_star = fc * cd * cm * ct * cf;
    assert!(
        (fc_star - 1000.0).abs() < 0.01,
        "Fc*={:.2} should be 1000 psi", fc_star
    );

    // --- Column stability factor (NDS Eq. 3.7-1) ---
    let ratio = fce / fc_star;
    let term1 = (1.0 + ratio) / (2.0 * c);
    let under_sqrt = term1 * term1 - ratio / c;
    let cp = term1 - under_sqrt.sqrt();

    // Cp should be between 0 and 1 (stability reduction)
    assert!(cp > 0.0 && cp < 1.0, "Cp={:.4} should be in (0, 1)", cp);

    // Expected Cp around 0.69 based on hand calculation
    let cp_expected = 0.691;
    let rel_err_cp = (cp - cp_expected).abs() / cp_expected;
    assert!(
        rel_err_cp < 0.01,
        "Cp: computed={:.4}, expected={:.4}, err={:.4}%",
        cp, cp_expected, rel_err_cp * 100.0
    );

    // --- Adjusted compression stress ---
    let fc_prime = fc_star * cp;
    let fc_prime_expected = 691.0; // psi

    let rel_err_fc = (fc_prime - fc_prime_expected).abs() / fc_prime_expected;
    assert!(
        rel_err_fc < 0.01,
        "F'c: computed={:.2} psi, expected={:.2} psi, err={:.4}%",
        fc_prime, fc_prime_expected, rel_err_fc * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 3. NDS Load Duration — Wind Loading (CD = 1.6)
// ═══════════════════════════════════════════════════════════════
//
// Same 2x10 beam as test 1 but with wind load duration factor.
// CD = 1.6 (wind/seismic loading), CF = 1.1.
//
// F'b = Fb * CD * CM * Ct * CL * CF
//     = 1000 * 1.6 * 1.0 * 1.0 * 1.0 * 1.1 = 1760 psi
//
// Capacity increase vs normal duration: 1760/1100 = 1.6 (60% increase).
//
// S = 21.390625 in^3 (same section)
// M_allow = 1760 * 21.390625 = 37,647.5 lb-in = 3,137.3 lb-ft

#[test]
fn validation_nds_load_duration_wind() {
    // --- Input ---
    let fb = 1000.0_f64;
    let cd_normal = 1.0;
    let cd_wind = 1.6;
    let cm = 1.0;
    let ct = 1.0;
    let cl = 1.0;
    let cf = 1.1;

    let b = 1.5_f64;
    let d = 9.25_f64;
    let s = b * d * d / 6.0;

    // --- Normal duration ---
    let fb_prime_normal = fb * cd_normal * cm * ct * cl * cf;

    // --- Wind duration ---
    let fb_prime_wind = fb * cd_wind * cm * ct * cl * cf;
    let fb_prime_wind_expected = 1760.0; // psi

    let rel_err = (fb_prime_wind - fb_prime_wind_expected).abs() / fb_prime_wind_expected;
    assert!(
        rel_err < 0.01,
        "F'b(wind): computed={:.2} psi, expected={:.2} psi, err={:.4}%",
        fb_prime_wind, fb_prime_wind_expected, rel_err * 100.0
    );

    // --- Capacity ratio ---
    let capacity_ratio = fb_prime_wind / fb_prime_normal;
    let ratio_expected = 1.6;

    let rel_err_ratio = (capacity_ratio - ratio_expected).abs() / ratio_expected;
    assert!(
        rel_err_ratio < 0.01,
        "Capacity ratio: computed={:.4}, expected={:.4}, err={:.4}%",
        capacity_ratio, ratio_expected, rel_err_ratio * 100.0
    );

    // --- Allowable moment with wind duration ---
    let m_allow_lb_in = fb_prime_wind * s;
    let m_allow_lb_ft = m_allow_lb_in / 12.0;
    let m_expected_lb_ft = 3137.3;

    let rel_err_m = (m_allow_lb_ft - m_expected_lb_ft).abs() / m_expected_lb_ft;
    assert!(
        rel_err_m < 0.01,
        "M_allow(wind): computed={:.2} lb-ft, expected={:.2} lb-ft, err={:.4}%",
        m_allow_lb_ft, m_expected_lb_ft, rel_err_m * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 4. NDS Beam Stability — Unbraced Beam (CL < 1.0)
// ═══════════════════════════════════════════════════════════════
//
// Unbraced beam: 2x12 D.Fir-Larch No.1, Lu = 8 ft = 96 in.
// Actual dimensions: 1.5" x 11.25".
// Fb = 1000 psi, E'min = 580,000 psi.
//
// Effective length for uniform load: Le = 1.63*Lu + 3d
//   Le = 1.63*96 + 3*11.25 = 156.48 + 33.75 = 190.23 in
//
// Slenderness ratio for beams:
//   Rb = sqrt(Le * d / b^2) = sqrt(190.23 * 11.25 / 1.5^2)
//      = sqrt(190.23 * 11.25 / 2.25) = sqrt(950.0) = 30.82
//
// Critical bending stress:
//   FbE = 1.20 * E'min / Rb^2 = 1.20 * 580000 / 30.82^2
//       = 696000 / 949.87 = 732.7 psi
//
// Fb* = Fb * CD * CM * Ct * CF = 1000 * 1.0 * 1.0 * 1.0 * 1.0 = 1000 psi
// (CF=1.0 for 2x12 bending)
//
// Beam stability factor (NDS Eq. 3.3-6):
//   CL = (1 + FbE/Fb*) / 1.9 - sqrt[ ((1 + FbE/Fb*) / 1.9)^2 - (FbE/Fb*) / 0.95 ]
//
//   ratio = FbE/Fb* = 732.7 / 1000 = 0.7327
//   term1 = (1 + 0.7327) / 1.9 = 1.7327 / 1.9 = 0.91195
//   under_sqrt = 0.91195^2 - 0.7327/0.95 = 0.83165 - 0.77126 = 0.06039
//   CL = 0.91195 - sqrt(0.06039) = 0.91195 - 0.24576 = 0.6662

#[test]
fn validation_nds_beam_stability_unbraced() {
    // --- Input ---
    let fb = 1000.0_f64;      // psi
    let e_min_prime = 580_000.0; // psi
    let lu = 96.0_f64;        // in (8 ft unbraced length)
    let b = 1.5_f64;          // in (actual width of 2x12)
    let d = 11.25_f64;        // in (actual depth of 2x12)

    // Fb* (all adjustment factors except CL = 1.0)
    let fb_star = fb; // CD=CM=Ct=CF=1.0

    // --- Effective length (uniform load on simple span) ---
    let le = 1.63 * lu + 3.0 * d;
    let le_expected = 190.23;

    let rel_err_le = (le - le_expected).abs() / le_expected;
    assert!(
        rel_err_le < 0.01,
        "Le: computed={:.2} in, expected={:.2} in, err={:.4}%",
        le, le_expected, rel_err_le * 100.0
    );

    // --- Beam slenderness ratio ---
    let rb = (le * d / (b * b)).sqrt();
    // Expected: sqrt(190.23 * 11.25 / 2.25) = sqrt(950.15) = 30.82
    assert!(
        rb > 25.0 && rb < 40.0,
        "Rb={:.2} should be near 30.8", rb
    );

    // --- Critical bending stress ---
    let fbe = 1.20 * e_min_prime / (rb * rb);
    // Expected: 1.20 * 580000 / Rb^2
    assert!(
        fbe > 500.0 && fbe < 1000.0,
        "FbE={:.2} should be between 500 and 1000 psi", fbe
    );

    // --- Beam stability factor (NDS Eq. 3.3-6) ---
    let ratio = fbe / fb_star;
    let term1 = (1.0 + ratio) / 1.9;
    let under_sqrt = term1 * term1 - ratio / 0.95;
    assert!(
        under_sqrt >= 0.0,
        "Discriminant should be non-negative, got {:.6}", under_sqrt
    );

    let cl = term1 - under_sqrt.sqrt();

    // CL must be less than 1.0 for an unbraced beam
    assert!(
        cl < 1.0,
        "CL={:.4} should be < 1.0 for unbraced beam", cl
    );
    assert!(
        cl > 0.0,
        "CL={:.4} should be positive", cl
    );

    // Expected CL around 0.666
    let cl_expected = 0.666;
    let rel_err_cl = (cl - cl_expected).abs() / cl_expected;
    assert!(
        rel_err_cl < 0.01,
        "CL: computed={:.4}, expected={:.4}, err={:.4}%",
        cl, cl_expected, rel_err_cl * 100.0
    );

    // --- Adjusted bending stress with stability reduction ---
    let fb_prime = fb_star * cl;
    assert!(
        fb_prime < fb,
        "F'b={:.2} should be less than Fb={:.2} for unbraced beam",
        fb_prime, fb
    );
}

// ═══════════════════════════════════════════════════════════════
// 5. EC5 Bending Strength — GL24h Glulam
// ═══════════════════════════════════════════════════════════════
//
// GL24h glulam beam, 200mm x 600mm cross-section, span L=8m.
// Characteristic bending strength: fm,k = 24 MPa.
// Modification factor: kmod = 0.8 (medium-term loading, service class 1).
// Partial safety factor: gamma_M = 1.25.
//
// Design bending strength:
//   fm,d = kmod * fm,k / gamma_M = 0.8 * 24 / 1.25 = 15.36 MPa
//
// Section modulus:
//   W = b * h^2 / 6 = 0.2 * 0.6^2 / 6 = 0.2 * 0.36 / 6 = 0.012 m^3
//
// Design moment resistance:
//   M_Rd = fm,d * W = 15.36e6 * 0.012 = 184,320 N-m = 184.32 kN-m

#[test]
fn validation_ec5_bending_strength_glulam() {
    // --- Input ---
    let fm_k = 24.0_f64;    // MPa, characteristic bending strength
    let kmod = 0.8_f64;     // modification factor (medium-term, SC1)
    let gamma_m = 1.25_f64; // partial safety factor for timber

    let b = 0.200_f64;      // m, beam width
    let h = 0.600_f64;      // m, beam depth

    // --- Design bending strength ---
    let fm_d = kmod * fm_k / gamma_m; // MPa
    let fm_d_expected = 15.36;        // MPa

    let rel_err_fd = (fm_d - fm_d_expected).abs() / fm_d_expected;
    assert!(
        rel_err_fd < 0.01,
        "fm,d: computed={:.4} MPa, expected={:.4} MPa, err={:.4}%",
        fm_d, fm_d_expected, rel_err_fd * 100.0
    );

    // --- Section modulus ---
    let w = b * h * h / 6.0; // m^3
    let w_expected = 0.012;   // m^3

    let rel_err_w = (w - w_expected).abs() / w_expected;
    assert!(
        rel_err_w < 0.01,
        "W: computed={:.6} m^3, expected={:.6} m^3, err={:.4}%",
        w, w_expected, rel_err_w * 100.0
    );

    // --- Design moment resistance ---
    // fm_d is in MPa = N/mm^2 = 1e6 N/m^2
    let m_rd = fm_d * 1.0e6 * w; // N-m
    let m_rd_kn_m = m_rd / 1000.0; // kN-m
    let m_rd_expected = 184.32; // kN-m

    let rel_err_m = (m_rd_kn_m - m_rd_expected).abs() / m_rd_expected;
    assert!(
        rel_err_m < 0.01,
        "M_Rd: computed={:.2} kN-m, expected={:.2} kN-m, err={:.4}%",
        m_rd_kn_m, m_rd_expected, rel_err_m * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 6. EC5 Compression Buckling — GL24h Column
// ═══════════════════════════════════════════════════════════════
//
// GL24h column, 200mm x 200mm, L=4m. Pin-ended.
// fc,0,k = 24 MPa, E0,05 = 9400 MPa.
// kmod = 0.8, gamma_M = 1.25.
//
// fc,0,d = kmod * fc,0,k / gamma_M = 0.8 * 24 / 1.25 = 15.36 MPa
//
// Radius of gyration:
//   i = h / sqrt(12) = 200 / sqrt(12) = 57.735 mm
//
// Slenderness:
//   lambda = L / i = 4000 / 57.735 = 69.28
//
// Relative slenderness (EC5 Eq. 6.21):
//   lambda_rel = (lambda / pi) * sqrt(fc,0,k / E0,05)
//              = (69.28 / pi) * sqrt(24 / 9400)
//              = 22.048 * 0.05053 = 1.114
//
// Instability factor (EC5 Eq. 6.25, 6.26):
//   k = 0.5 * (1 + beta_c * (lambda_rel - 0.3) + lambda_rel^2)
//   beta_c = 0.1 (for glulam)
//   k = 0.5 * (1 + 0.1 * (1.114 - 0.3) + 1.114^2)
//     = 0.5 * (1 + 0.0814 + 1.241) = 0.5 * 2.3224 = 1.1612
//
//   kc = 1 / (k + sqrt(k^2 - lambda_rel^2))
//      = 1 / (1.1612 + sqrt(1.1612^2 - 1.114^2))
//      = 1 / (1.1612 + sqrt(1.3484 - 1.241))
//      = 1 / (1.1612 + sqrt(0.1074))
//      = 1 / (1.1612 + 0.3277) = 1 / 1.4889 = 0.6716
//
// Design compression capacity:
//   sigma_c,Rd = kc * fc,0,d = 0.6716 * 15.36 = 10.31 MPa
//   N_Rd = sigma_c,Rd * A = 10.31 * (0.2 * 0.2) * 1e6 = 412,500 N = 412.5 kN

#[test]
fn validation_ec5_compression_buckling() {
    // --- Input ---
    let fc_0_k = 24.0_f64;   // MPa, characteristic compression strength
    let e_0_05 = 9400.0_f64; // MPa, 5th percentile modulus
    let kmod = 0.8_f64;
    let gamma_m = 1.25_f64;
    let beta_c = 0.1_f64;    // glulam

    let b_col = 0.200_f64;   // m
    let h_col = 0.200_f64;   // m
    let l_col = 4.0_f64;     // m
    let a_col = b_col * h_col; // m^2

    // --- Design compression strength ---
    let fc_0_d = kmod * fc_0_k / gamma_m;
    let fc_0_d_expected = 15.36; // MPa

    let rel_err_fc = (fc_0_d - fc_0_d_expected).abs() / fc_0_d_expected;
    assert!(
        rel_err_fc < 0.01,
        "fc,0,d: computed={:.4} MPa, expected={:.4} MPa, err={:.4}%",
        fc_0_d, fc_0_d_expected, rel_err_fc * 100.0
    );

    // --- Slenderness ---
    let i_rad = (h_col * 1000.0) / 12.0_f64.sqrt(); // mm (radius of gyration)
    let lambda = (l_col * 1000.0) / i_rad; // dimensionless
    let lambda_expected = 69.28;

    let rel_err_lam = (lambda - lambda_expected).abs() / lambda_expected;
    assert!(
        rel_err_lam < 0.01,
        "lambda: computed={:.2}, expected={:.2}, err={:.4}%",
        lambda, lambda_expected, rel_err_lam * 100.0
    );

    // --- Relative slenderness (EC5 Eq. 6.21) ---
    let lambda_rel = (lambda / std::f64::consts::PI) * (fc_0_k / e_0_05).sqrt();
    let lambda_rel_expected = 1.114;

    let rel_err_lr = (lambda_rel - lambda_rel_expected).abs() / lambda_rel_expected;
    assert!(
        rel_err_lr < 0.01,
        "lambda_rel: computed={:.4}, expected={:.4}, err={:.4}%",
        lambda_rel, lambda_rel_expected, rel_err_lr * 100.0
    );

    // --- Instability factor (EC5 Eq. 6.25, 6.26) ---
    let k = 0.5 * (1.0 + beta_c * (lambda_rel - 0.3) + lambda_rel * lambda_rel);
    let kc = 1.0 / (k + (k * k - lambda_rel * lambda_rel).sqrt());

    // kc should be between 0 and 1
    assert!(kc > 0.0 && kc < 1.0, "kc={:.4} should be in (0, 1)", kc);

    let kc_expected = 0.672;
    let rel_err_kc = (kc - kc_expected).abs() / kc_expected;
    assert!(
        rel_err_kc < 0.01,
        "kc: computed={:.4}, expected={:.4}, err={:.4}%",
        kc, kc_expected, rel_err_kc * 100.0
    );

    // --- Design compression capacity ---
    let sigma_c_rd = kc * fc_0_d; // MPa
    let n_rd = sigma_c_rd * a_col * 1.0e6 / 1000.0; // kN
    let n_rd_expected = 412.5; // kN

    let rel_err_n = (n_rd - n_rd_expected).abs() / n_rd_expected;
    assert!(
        rel_err_n < 0.01,
        "N_Rd: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        n_rd, n_rd_expected, rel_err_n * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 7. NDS Combined Bending + Compression — Interaction Equation
// ═══════════════════════════════════════════════════════════════
//
// NDS Eq. 3.9-3 (uniaxial bending + compression, simplified):
//   (fc/F'c)^2 + fb1 / (F'b1 * (1 - fc/FcE1)) <= 1.0
//
// Member: 6x6 post (5.5" x 5.5"), 10 ft tall.
// Applied: Axial = 15,000 lb on A = 5.5*5.5 = 30.25 in^2
//          fc = 15000/30.25 = 495.9 psi
//
// Bending from eccentric load or wind:
//          M = 5000 lb-in, S = 5.5^3/6 = 27.73 in^3
//          fb = 5000/27.73 = 180.3 psi
//
// Design values (from test 2):
//   F'c = 691 psi (with Cp from test 2)
//   F'b1 = Fb * CD * CM * CL = 1000 * 1.0 * 1.0 * 1.0 = 1000 psi
//   (assume full lateral support for bending, CL=1.0)
//
// FcE1 = 0.822 * E'min / (Le/d)^2 = 0.822 * 580000 / 21.818^2 = 1002 psi
//
// Interaction check:
//   (fc/F'c)^2 + fb1 / (F'b1 * (1 - fc/FcE1))
//   = (495.9/691)^2 + 180.3 / (1000 * (1 - 495.9/1002))
//   = (0.7177)^2 + 180.3 / (1000 * 0.5051)
//   = 0.5151 + 180.3 / 505.1
//   = 0.5151 + 0.3570
//   = 0.872 <= 1.0  (OK, member adequate)

#[test]
fn validation_nds_combined_bending_compression() {
    // --- Input ---
    let axial_load = 15_000.0_f64;   // lb
    let moment = 5_000.0_f64;        // lb-in
    let d = 5.5_f64;                 // in (6x6 actual)
    let b = 5.5_f64;                 // in

    let a_section = b * d;            // 30.25 in^2
    let s_section = b * d * d / 6.0;  // 27.729 in^3

    // Actual stresses
    let fc_actual = axial_load / a_section; // psi
    let fb_actual = moment / s_section;      // psi

    // Design values
    let fc_prime = 691.0_f64;   // psi (from test 2, includes Cp)
    let fb_prime = 1000.0_f64;  // psi (CL=1.0, full lateral support)

    // Euler buckling stress for interaction
    let e_min_prime = 580_000.0;
    let le = 120.0; // in (10 ft)
    let slenderness = le / d;
    let fce1 = 0.822 * e_min_prime / (slenderness * slenderness);

    // --- Interaction equation: (fc/F'c)^2 + fb/(F'b*(1-fc/FcE1)) ---
    let term1 = (fc_actual / fc_prime).powi(2);
    let amplification = 1.0 / (1.0 - fc_actual / fce1);
    let term2 = fb_actual / (fb_prime) * amplification;
    let interaction = term1 + term2;

    // Verify individual terms
    let term1_expected = 0.515;
    let rel_err_t1 = (term1 - term1_expected).abs() / term1_expected;
    assert!(
        rel_err_t1 < 0.01,
        "Compression term: computed={:.4}, expected={:.4}, err={:.4}%",
        term1, term1_expected, rel_err_t1 * 100.0
    );

    let term2_expected = 0.357;
    let rel_err_t2 = (term2 - term2_expected).abs() / term2_expected;
    assert!(
        rel_err_t2 < 0.01,
        "Bending term: computed={:.4}, expected={:.4}, err={:.4}%",
        term2, term2_expected, rel_err_t2 * 100.0
    );

    // Interaction ratio must be <= 1.0 (member is adequate)
    assert!(
        interaction <= 1.0,
        "Interaction ratio={:.4} should be <= 1.0 (member adequate)",
        interaction
    );

    // Expected total around 0.872
    let interaction_expected = 0.872;
    let rel_err_int = (interaction - interaction_expected).abs() / interaction_expected;
    assert!(
        rel_err_int < 0.01,
        "Interaction ratio: computed={:.4}, expected={:.4}, err={:.4}%",
        interaction, interaction_expected, rel_err_int * 100.0
    );
}

// ═══════════════════════════════════════════════════════════════
// 8. EC5 Shear Capacity — Rectangular Timber Beam
// ═══════════════════════════════════════════════════════════════
//
// Rectangular sawn timber beam, 200mm x 600mm.
// Characteristic shear strength: fv,k = 3.5 MPa.
// kmod = 0.8 (medium-term), gamma_M = 1.25.
//
// Design shear strength:
//   fv,d = kmod * fv,k / gamma_M = 0.8 * 3.5 / 1.25 = 2.24 MPa
//
// EC5 shear capacity for rectangular section (Eq. 6.13):
//   V_Rd = (2/3) * fv,d * b * h * kcr
//
// kcr = 0.67 (crack reduction factor for solid sawn timber per EC5 §6.1.7)
//
//   V_Rd = (2/3) * 2.24 * 0.2 * 0.6 * 0.67
//        = 0.6667 * 2.24 * 0.2 * 0.6 * 0.67
//        = 0.6667 * 0.17971
//        = 0.11981 MN = 119.8 kN

#[test]
fn validation_ec5_shear_capacity_rectangular() {
    // --- Input ---
    let fv_k = 3.5_f64;     // MPa, characteristic shear strength
    let kmod = 0.8_f64;
    let gamma_m = 1.25_f64;
    let kcr = 0.67_f64;     // crack reduction factor (solid sawn timber)

    let b = 0.200_f64;      // m
    let h = 0.600_f64;      // m

    // --- Design shear strength ---
    let fv_d = kmod * fv_k / gamma_m; // MPa
    let fv_d_expected = 2.24;

    let rel_err_fv = (fv_d - fv_d_expected).abs() / fv_d_expected;
    assert!(
        rel_err_fv < 0.01,
        "fv,d: computed={:.4} MPa, expected={:.4} MPa, err={:.4}%",
        fv_d, fv_d_expected, rel_err_fv * 100.0
    );

    // --- Shear capacity (EC5 Eq. 6.13) ---
    // V_Rd = (2/3) * fv,d * b * h * kcr
    // fv_d is in MPa = N/mm^2 = 1e6 N/m^2
    let v_rd = (2.0 / 3.0) * fv_d * 1.0e6 * b * h * kcr; // N
    let v_rd_kn = v_rd / 1000.0; // kN
    let v_rd_expected = 119.8; // kN

    let rel_err_v = (v_rd_kn - v_rd_expected).abs() / v_rd_expected;
    assert!(
        rel_err_v < 0.01,
        "V_Rd: computed={:.2} kN, expected={:.2} kN, err={:.4}%",
        v_rd_kn, v_rd_expected, rel_err_v * 100.0
    );

    // --- Sanity checks ---
    // Maximum shear stress at neutral axis for rectangular section: tau_max = 3V/(2A)
    // At capacity: tau_max should equal fv,d * kcr (with crack reduction)
    let tau_max = 3.0 * v_rd / (2.0 * b * h * 1.0e6); // MPa
    let tau_expected = fv_d * kcr;

    let rel_err_tau = (tau_max - tau_expected).abs() / tau_expected;
    assert!(
        rel_err_tau < 0.01,
        "tau_max: computed={:.4} MPa, expected fv,d*kcr={:.4} MPa, err={:.4}%",
        tau_max, tau_expected, rel_err_tau * 100.0
    );
}
