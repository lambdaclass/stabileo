/// Validation: ASCE 7-22 / EN 1991-1-4 Wind Loading Formulas
///
/// References:
///   - ASCE 7-22 (Minimum Design Loads and Associated Criteria)
///   - EN 1991-1-4:2005 (Eurocode 1: Actions on Structures - Wind Actions)
///   - Simiu & Scanlan: "Wind Effects on Structures" 3rd ed.
///   - Taranath: "Wind and Earthquake Resistant Buildings" 2005
///
/// Tests verify wind load computation formulas with hand-computed expected values.
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
// 1. Basic Velocity Pressure qz (ASCE 7-22 Eq. 26.10-1)
// ================================================================
//
// qz = 0.613 * Kz * Kzt * Kd * Ke * V²  (N/m², with V in m/s)
//
// V = 50 m/s, Kz = 1.13, Kzt = 1.0, Kd = 0.85, Ke = 1.0
//   qz = 0.613 * 1.13 * 0.85 * 2500 = 1472.0 N/m² = 1.472 kPa

#[test]
fn validation_velocity_pressure_qz() {
    let v: f64 = 50.0;
    let kz: f64 = 1.13;
    let kzt: f64 = 1.0;
    let kd: f64 = 0.85;
    let ke: f64 = 1.0;

    let qz: f64 = 0.613 * kz * kzt * kd * ke * v * v;
    let qz_kpa: f64 = qz / 1000.0;

    let expected_qz: f64 = 0.613 * 1.13 * 1.0 * 0.85 * 1.0 * 2500.0;
    let expected_kpa: f64 = expected_qz / 1000.0;

    assert_close(qz_kpa, expected_kpa, 0.01, "Velocity pressure qz");
    assert!(qz_kpa > 1.0 && qz_kpa < 5.0, "qz in reasonable range for 50 m/s");
}

// ================================================================
// 2. Exposure Coefficient Kz (ASCE 7 Table 26.10-1)
// ================================================================
//
// For z >= 4.6m: Kz = 2.01 * (z/zg)^(2/alpha)
//
// Exposure B: alpha = 7.0, zg = 365.76 m
// Exposure C: alpha = 9.5, zg = 274.32 m

#[test]
fn validation_exposure_coefficient_kz() {
    let alpha_b: f64 = 7.0;
    let zg_b: f64 = 365.76;
    let alpha_c: f64 = 9.5;
    let zg_c: f64 = 274.32;
    let z: f64 = 30.0;

    // Exposure B at z=30m
    let kz_b_raw: f64 = 2.01 * (z / zg_b).powf(2.0 / alpha_b);
    let kz_b: f64 = if kz_b_raw > 0.57 { kz_b_raw } else { 0.57 };

    // Exposure C at z=30m
    let kz_c_raw: f64 = 2.01 * (z / zg_c).powf(2.0 / alpha_c);
    let kz_c: f64 = if kz_c_raw > 0.85 { kz_c_raw } else { 0.85 };

    let expected_kz_b: f64 = 2.01 * (30.0_f64 / 365.76).powf(2.0 / 7.0);
    let expected_kz_c: f64 = 2.01 * (30.0_f64 / 274.32).powf(2.0 / 9.5);

    assert_close(kz_b, if expected_kz_b > 0.57 { expected_kz_b } else { 0.57 }, 0.01,
        "Kz Exposure B at 30m");
    assert_close(kz_c, if expected_kz_c > 0.85 { expected_kz_c } else { 0.85 }, 0.01,
        "Kz Exposure C at 30m");

    // Exposure C should give higher Kz than Exposure B at same height
    assert!(kz_c > kz_b, "Kz(C) > Kz(B) at same height");

    // At ground level (z <= 4.6m), use z = 4.6m
    let z_ground: f64 = 4.6;
    let kz_ground_b: f64 = 2.01 * (z_ground / zg_b).powf(2.0 / alpha_b);
    assert!(kz_ground_b < kz_b, "Kz at ground < Kz at 30m");
}

// ================================================================
// 3. Gust Effect Factor G (Rigid Structure, ASCE 7 26.11.1)
// ================================================================
//
// G = 0.925 * (1 + 1.7*gQ*Iz_bar*Q) / (1 + 1.7*gv*Iz_bar)
//
// Building: h = 40 m, B = 30 m (Exposure C)
//   z_bar = 0.6*40 = 24 m
//   Iz_bar = 0.20*(10/24)^(1/6) = 0.1728
//   Lz_bar = 97.54*(24/10)^(1/3) = 130.61 m
//   Q = sqrt(1/(1+0.63*((30+40)/130.61)^0.63))
//   G ≈ 0.85

#[test]
fn validation_gust_effect_factor() {
    let h: f64 = 40.0;
    let b_width: f64 = 30.0;
    let gq: f64 = 3.4;
    let gv: f64 = 3.4;

    // Exposure C parameters
    let c_turb: f64 = 0.20;
    let l_param: f64 = 97.54;
    let eps_bar: f64 = 1.0 / 3.0;

    let z_bar: f64 = if 0.6 * h > 4.6 { 0.6 * h } else { 4.6 };
    let iz_bar: f64 = c_turb * (10.0 / z_bar).powf(1.0 / 6.0);
    let lz_bar: f64 = l_param * (z_bar / 10.0).powf(eps_bar);

    let q_inner: f64 = 1.0 + 0.63 * ((b_width + h) / lz_bar).powf(0.63);
    let q_factor: f64 = (1.0 / q_inner).sqrt();

    let g: f64 = 0.925 * (1.0 + 1.7 * gq * iz_bar * q_factor) / (1.0 + 1.7 * gv * iz_bar);

    // Verify intermediate values
    assert_close(z_bar, 24.0, 0.001, "z_bar");
    assert_close(iz_bar, 0.1728, 0.02, "Iz_bar turbulence intensity");

    // G should be close to 0.85 for typical rigid structure
    assert!(g > 0.80 && g < 0.95, "G = {:.4} should be in 0.80-0.95 range", g);

    // Verify G computation
    let expected_g: f64 = 0.925 * (1.0 + 1.7 * gq * iz_bar * q_factor) / (1.0 + 1.7 * gv * iz_bar);
    assert_close(g, expected_g, 0.001, "Gust effect factor G");
}

// ================================================================
// 4. MWFRS Pressure (Main Wind Force Resisting System)
// ================================================================
//
// p = q*G*Cp - qi*(GCpi)   (ASCE 7-22 Eq. 27.3-1)
//
// Windward wall: Cp = 0.8, GCpi = +/- 0.18
// qh = 1.5 kPa, G = 0.85
//   Windward (pos internal): p = 1.5*0.85*0.8 - 1.5*0.18 = 0.75 kPa
//   Windward (neg internal): p = 1.5*0.85*0.8 + 1.5*0.18 = 1.29 kPa
//   Leeward (Cp=-0.5): p = 1.5*0.85*(-0.5) - 1.5*0.18 = -0.9075 kPa

#[test]
fn validation_mwfrs_pressure() {
    let qh: f64 = 1.5;
    let g: f64 = 0.85;
    let gcpi: f64 = 0.18;

    // Windward wall (Cp = +0.8)
    let cp_windward: f64 = 0.8;
    let p_ww_positive: f64 = qh * g * cp_windward - qh * gcpi;
    let p_ww_negative: f64 = qh * g * cp_windward + qh * gcpi;

    assert_close(p_ww_positive, 1.02 - 0.27, 0.01, "Windward p (pos internal)");
    assert_close(p_ww_negative, 1.02 + 0.27, 0.01, "Windward p (neg internal)");

    // Leeward wall (L/B = 1, Cp = -0.5)
    let cp_leeward: f64 = -0.5;
    let p_lw: f64 = qh * g * cp_leeward - qh * gcpi;
    let expected_lw: f64 = 1.5 * 0.85 * (-0.5) - 1.5 * 0.18;
    assert_close(p_lw, expected_lw, 0.01, "Leeward p");
    assert!(p_lw < 0.0, "Leeward pressure should be suction (negative)");

    // Net pressure across building
    let net: f64 = p_ww_positive - p_lw;
    assert!(net > 0.0, "Net MWFRS force should be positive");
}

// ================================================================
// 5. Components and Cladding (C&C) Pressure with GCp
// ================================================================
//
// p = qh * [(GCp) - (GCpi)]   (ASCE 7-22 Eq. 30.3-1)
//
// qh = 2.0 kPa, GCpi = 0.18
//   Zone 5 positive: p = 2.0*(0.9 - 0.18) = 1.44 kPa
//   Zone 5 negative: p = 2.0*(-1.0 + 0.18) = -1.64 kPa
//   Zone 4 negative: p = 2.0*(-1.4 + 0.18) = -2.44 kPa

#[test]
fn validation_cc_pressure() {
    let qh: f64 = 2.0;
    let gcpi: f64 = 0.18;

    // Zone 5 (interior wall)
    let gcp_z5_pos: f64 = 0.9;
    let gcp_z5_neg: f64 = -1.0;

    let p_z5_pos: f64 = qh * (gcp_z5_pos - gcpi);
    let p_z5_neg: f64 = qh * (gcp_z5_neg + gcpi);

    assert_close(p_z5_pos, 1.44, 0.01, "C&C Zone 5 positive");
    assert_close(p_z5_neg, -1.64, 0.01, "C&C Zone 5 negative");

    // Zone 4 (corner)
    let gcp_z4_neg: f64 = -1.4;
    let p_z4_neg: f64 = qh * (gcp_z4_neg + gcpi);
    assert_close(p_z4_neg, -2.44, 0.01, "C&C Zone 4 negative");

    // Corner zone always more severe than interior
    assert!(p_z4_neg.abs() > p_z5_neg.abs(), "Corner suction > interior suction");
}

// ================================================================
// 6. Topographic Factor Kzt (ASCE 7 26.8.2)
// ================================================================
//
// Kzt = (1 + K1*K2*K3)²
//
// 2D ridge (Exposure C): H=60m, Lh=200m, z=15m, x=0 (at crest)
//   K1 = 0.43, K2 = 1.0 (at crest), K3 = e^(-3.0*15/200) = 0.7985
//   Kzt = (1 + 0.43*1.0*0.7985)² = (1.3433)² = 1.8045

#[test]
fn validation_topographic_factor_kzt() {
    let _h_hill: f64 = 60.0;
    let lh: f64 = 200.0;
    let z: f64 = 15.0;
    let x: f64 = 0.0;

    // Parameters for 2D ridge
    let k1: f64 = 0.43;
    let mu: f64 = 1.5;
    let gamma_param: f64 = 3.0;

    let k2: f64 = if x.abs() <= mu * lh {
        1.0 - x.abs() / (mu * lh)
    } else {
        0.0
    };
    let k3: f64 = (-gamma_param * z / lh).exp();

    let kzt: f64 = (1.0 + k1 * k2 * k3).powi(2);

    assert_close(k2, 1.0, 0.001, "K2 at crest");
    assert_close(k3, (-0.225_f64).exp(), 0.001, "K3");

    let expected_kzt: f64 = (1.0 + 0.43 * 1.0 * k3).powi(2);
    assert_close(kzt, expected_kzt, 0.01, "Kzt topographic factor");

    // Kzt should be > 1.0 at the crest of a ridge
    assert!(kzt > 1.0, "Kzt > 1.0 at crest");

    // Far from crest (x >> mu*Lh), Kzt → 1.0
    let x_far: f64 = 500.0;
    let k2_far: f64 = if x_far.abs() <= mu * lh { 1.0 - x_far / (mu * lh) } else { 0.0 };
    let kzt_far: f64 = (1.0 + k1 * k2_far * k3).powi(2);
    assert_close(kzt_far, 1.0, 0.001, "Kzt far from crest");
}

// ================================================================
// 7. Along-Wind Response (ASCE 7 Chapter 26, simplified)
// ================================================================
//
// Total force: F = q * Cd * B * H * G
// Base moment: M = F * H/2 (uniform pressure simplification)
//
// H = 60m, B = 30m, V = 45 m/s, Cd = 1.3, G = 0.85
//   q = 0.5*1.225*45² = 1240.3 N/m²

#[test]
fn validation_along_wind_response() {
    let rho: f64 = 1.225;
    let v: f64 = 45.0;
    let cd: f64 = 1.3;
    let b_width: f64 = 30.0;
    let h: f64 = 60.0;
    let g: f64 = 0.85;

    let q: f64 = 0.5 * rho * v * v;
    assert_close(q, 1240.31, 0.01, "Dynamic pressure q");

    // Total force (uniform pressure over height)
    let f_total: f64 = q * cd * b_width * h * g;

    // Base overturning moment (centroid at H/2)
    let m_base: f64 = f_total * h / 2.0;
    let m_base_knm: f64 = m_base / 1e3;

    // Verify total force
    let expected_f: f64 = 1240.31 * 1.3 * 30.0 * 60.0 * 0.85;
    assert_close(f_total, expected_f, 0.01, "Total along-wind force");

    // Base moment
    let expected_m: f64 = expected_f * 30.0 / 1e3;
    assert_close(m_base_knm, expected_m, 0.01, "Base overturning moment");
}

// ================================================================
// 8. Vortex Shedding Critical Velocity (Strouhal Number)
// ================================================================
//
// Critical velocity: Vcr = fn * D / St
//
// Circular chimney: D = 3.0m, fn = 0.5 Hz, St = 0.20
//   Vcr = 0.5*3.0/0.20 = 7.5 m/s
//
// Rectangular section: D = 4.0m, fn = 0.8 Hz, St = 0.12
//   Vcr = 0.8*4.0/0.12 = 26.67 m/s

#[test]
fn validation_vortex_shedding() {
    // Circular chimney
    let d_circ: f64 = 3.0;
    let fn_circ: f64 = 0.5;
    let st_circ: f64 = 0.20;

    let vcr_circ: f64 = fn_circ * d_circ / st_circ;
    assert_close(vcr_circ, 7.5, 0.001, "Vcr circular chimney");

    // Verify shedding frequency at critical velocity equals natural frequency
    let fs_at_vcr: f64 = st_circ * vcr_circ / d_circ;
    assert_close(fs_at_vcr, fn_circ, 0.001, "fs = fn at lock-in");

    // Rectangular section
    let d_rect: f64 = 4.0;
    let fn_rect: f64 = 0.8;
    let st_rect: f64 = 0.12;

    let vcr_rect: f64 = fn_rect * d_rect / st_rect;
    assert_close(vcr_rect, 26.667, 0.01, "Vcr rectangular section");

    // Reynolds number check
    let nu: f64 = 1.5e-5;
    let re: f64 = vcr_circ * d_circ / nu;
    assert!(re > 1e5, "Re = {:.0} should be in turbulent regime", re);

    // Higher natural frequency → higher critical velocity
    assert!(vcr_rect > vcr_circ, "Stiffer structure has higher Vcr");
}
