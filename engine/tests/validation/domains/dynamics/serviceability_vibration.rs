/// Validation: Serviceability — Floor Vibration
///
/// References:
///   - AISC Design Guide 11: Vibrations of Steel-Framed Structural Systems (2016)
///   - SCI P354: Design of Floors for Vibration (2009)
///   - EN 1993-1-1:2005 §7.2: Serviceability — floor vibrations
///   - ISO 10137:2007: Bases for design — Serviceability of buildings
///   - Murray, Allen & Ungar: Floor Vibrations Due to Human Activity (1997)
///
/// Tests verify natural frequency estimation, acceleration limits, and
/// response factor calculations for occupied floors.

// ================================================================
// 1. AISC DG11 — Simply Supported Beam Natural Frequency
// ================================================================
//
// f₁ = π/(2L²) * √(EI/m̄)
// where m̄ = mass per unit length (kg/m).
// For W18x35 floor beam, L=9m, with concrete slab.

#[test]
fn vibration_aisc_dg11_beam_frequency() {
    let e: f64 = 200_000e6;   // Pa (200 GPa)
    let iz: f64 = 5.10e-4;    // m⁴ (W18x35 ≈ 510 cm⁴ equivalent)
    let l: f64 = 9.0;         // m span
    let m_bar: f64 = 450.0;   // kg/m (beam self-weight + tributary slab + SDL)

    // f1 = (π/2) * (1/L²) * sqrt(EI/m̄)
    let f1: f64 = (std::f64::consts::PI / 2.0) / (l * l) * (e * iz / m_bar).sqrt();

    // Expected: π/(2*81) * sqrt(200e9 * 5.1e-4 / 450) = 0.01939 * 471.4 = ~9.14 Hz
    let f1_expected: f64 = 9.14;

    assert!(
        (f1 - f1_expected).abs() / f1_expected < 0.02,
        "DG11 beam frequency: {:.2} Hz, expected ~{:.2} Hz", f1, f1_expected
    );

    // AISC DG11: f1 > 9 Hz generally acceptable for walking
    assert!(
        f1 > 6.0,
        "Floor frequency {:.2} Hz should exceed 6 Hz minimum", f1
    );
}

// ================================================================
// 2. AISC DG11 — Acceleration Criterion (Walking)
// ================================================================
//
// Peak acceleration: ap/g = P₀·e^(-0.35·f₁) / (β·W)
// P₀ = 65 lbs (0.29 kN) for walking excitation
// β = modal damping ratio (0.01-0.05)
// W = effective weight of floor panel

#[test]
fn vibration_aisc_dg11_walking_acceleration() {
    let p0: f64 = 0.29;        // kN, harmonic force amplitude
    let f1: f64 = 7.5;         // Hz, fundamental frequency
    let beta: f64 = 0.03;      // damping ratio (bare floor + furniture)
    let w_floor: f64 = 150.0;  // kN, effective weight

    // Peak acceleration ratio
    let ap_g: f64 = p0 * (-0.35 * f1).exp() / (beta * w_floor);

    // ap/g = 0.29 * e^(-2.625) / (0.03 * 150) = 0.29 * 0.0724 / 4.5 = 0.00466
    let ap_g_expected: f64 = 0.29 * (-0.35 * 7.5_f64).exp() / (0.03 * 150.0);

    assert!(
        (ap_g - ap_g_expected).abs() / ap_g_expected < 0.01,
        "Walking acceleration: {:.5}g, expected {:.5}g", ap_g, ap_g_expected
    );

    // AISC DG11 Table 4.1: Office limit = 0.5%g = 0.005g
    let office_limit: f64 = 0.005;
    assert!(
        ap_g < office_limit,
        "ap/g = {:.5} should be < office limit {:.4}", ap_g, office_limit
    );
}

// ================================================================
// 3. SCI P354 — Response Factor (Walking)
// ================================================================
//
// Response factor R = a_rms / a_base
// a_base = 0.005 m/s² (ISO 10137 base curve for vertical vibration)
// R ≤ 8 for offices, R ≤ 4 for residential

#[test]
fn vibration_sci_p354_response_factor() {
    let a_peak: f64 = 0.025;    // m/s², peak acceleration from analysis
    let a_rms: f64 = a_peak / 2.0_f64.sqrt(); // RMS = peak/√2 for sinusoidal

    let a_base: f64 = 0.005;    // m/s², ISO 10137 base curve

    let r: f64 = a_rms / a_base;

    // R = 0.025/√2 / 0.005 = 0.01768/0.005 = 3.54
    let r_expected: f64 = 3.54;

    assert!(
        (r - r_expected).abs() / r_expected < 0.02,
        "Response factor: {:.2}, expected {:.2}", r, r_expected
    );

    // Office acceptance: R ≤ 8
    let r_office: f64 = 8.0;
    assert!(r < r_office, "R={:.2} should be < office limit {:.0}", r, r_office);

    // Residential acceptance: R ≤ 4
    let r_residential: f64 = 4.0;
    assert!(r < r_residential, "R={:.2} should be < residential limit {:.0}", r, r_residential);
}

// ================================================================
// 4. AISC DG11 — Combined Mode (Bay) Frequency
// ================================================================
//
// Dunkerley's equation for combined beam+girder system:
// 1/f_n² = 1/f_beam² + 1/f_girder²

#[test]
fn vibration_dunkerley_combined() {
    let f_beam: f64 = 9.0;    // Hz, beam alone
    let f_girder: f64 = 6.5;  // Hz, girder alone

    // Combined frequency
    let f_combined: f64 = 1.0 / (1.0 / (f_beam * f_beam) + 1.0 / (f_girder * f_girder)).sqrt();

    // f = 1/sqrt(1/81 + 1/42.25) = 1/sqrt(0.01235 + 0.02367) = 1/sqrt(0.03602) = 1/0.1898 = 5.27
    let f_expected: f64 = 5.27;

    assert!(
        (f_combined - f_expected).abs() / f_expected < 0.02,
        "Combined frequency: {:.2} Hz, expected {:.2} Hz", f_combined, f_expected
    );

    // Combined is always less than the lower individual
    assert!(
        f_combined < f_beam && f_combined < f_girder,
        "Combined {:.2} < min({:.2}, {:.2})", f_combined, f_beam, f_girder
    );
}

// ================================================================
// 5. ISO 10137 — Vibration Dose Value (VDV)
// ================================================================
//
// VDV = (∫₀ᵀ a⁴(t) dt)^(1/4) [m/s^1.75]
// For sinusoidal: VDV = 0.68 * a_peak * T^(1/4)
// Limits: 0.4-0.8 m/s^1.75 (offices, 16hr day)

#[test]
fn vibration_iso10137_vdv() {
    let a_peak: f64 = 0.05;    // m/s², peak acceleration
    let t: f64 = 16.0 * 3600.0; // s, 16-hour exposure (57600 s)

    // Sinusoidal VDV approximation
    let vdv: f64 = 0.68 * a_peak * t.powf(0.25);

    // VDV = 0.68 * 0.05 * 57600^0.25 = 0.034 * 15.49 = 0.527
    let vdv_expected: f64 = 0.68 * 0.05 * (57600.0_f64).powf(0.25);

    assert!(
        (vdv - vdv_expected).abs() / vdv_expected < 0.01,
        "VDV: {:.3} m/s^1.75, expected {:.3}", vdv, vdv_expected
    );

    // Office limit: VDV < 0.8 m/s^1.75 (day)
    let vdv_limit: f64 = 0.8;
    assert!(
        vdv < vdv_limit,
        "VDV {:.3} should be < limit {:.1}", vdv, vdv_limit
    );
}

// ================================================================
// 6. AISC DG11 — Rhythmic Excitation (Aerobics)
// ================================================================
//
// For rhythmic activity, the acceleration criterion is:
// ap/g = (1.3 * αᵢ * wₚ) / (wₜ) * 1/(f₁²/fᵢ² - 1)
// αᵢ = dynamic coefficient, fᵢ = forcing frequency

#[test]
fn vibration_aisc_dg11_rhythmic() {
    let w_p: f64 = 0.7;        // kPa, weight of participants
    let w_t: f64 = 5.0;        // kPa, total weight (floor + participants)
    let alpha_i: f64 = 0.5;    // dynamic coefficient, 2nd harmonic aerobics
    let f_i: f64 = 5.0;        // Hz, forcing frequency (2nd harmonic of 2.5 Hz)
    let f_1: f64 = 9.0;        // Hz, floor natural frequency

    // Acceleration ratio
    let freq_ratio_sq: f64 = (f_1 / f_i).powi(2);
    let ap_g: f64 = 1.3 * alpha_i * w_p / w_t / (freq_ratio_sq - 1.0);

    // = 1.3 * 0.5 * 0.7/5.0 / (3.24 - 1) = 0.091 / 2.24 = 0.0406
    let ap_g_expected: f64 = 1.3 * 0.5 * 0.7 / 5.0 / ((9.0_f64 / 5.0).powi(2) - 1.0);

    assert!(
        (ap_g - ap_g_expected).abs() / ap_g_expected < 0.01,
        "Rhythmic ap/g: {:.4}, expected {:.4}", ap_g, ap_g_expected
    );

    // For gymnasiums: limit is typically 1.5%g-2%g
    let gym_limit: f64 = 0.02;
    // This exceeds the gym limit — floor is too flexible for aerobics
    assert!(
        ap_g > gym_limit,
        "ap/g = {:.4} exceeds gym limit {:.4} — floor undersized for aerobics", ap_g, gym_limit
    );
}

// ================================================================
// 7. SCI P354 — Effective Floor Mass
// ================================================================
//
// Effective modal mass for fundamental mode:
// For SS beam: M_eff = 0.5 * m * L * n_eff
// n_eff = effective number of beams participating

#[test]
fn vibration_effective_mass() {
    let m_per_m: f64 = 450.0;  // kg/m, mass per meter of beam
    let l: f64 = 9.0;          // m, span
    let n_eff: f64 = 2.5;      // effective number of beams (SCI P354 §4)

    // Effective mass for single beam (SS first mode: 0.5*mL)
    let m_beam: f64 = 0.5 * m_per_m * l;
    let m_beam_expected: f64 = 2025.0; // kg

    assert!(
        (m_beam - m_beam_expected).abs() < 1.0,
        "Single beam modal mass: {:.0} kg, expected {:.0}", m_beam, m_beam_expected
    );

    // Effective floor mass = m_beam * n_eff
    let m_floor: f64 = m_beam * n_eff;
    let m_floor_expected: f64 = 5062.5; // kg

    assert!(
        (m_floor - m_floor_expected).abs() < 1.0,
        "Floor modal mass: {:.0} kg, expected {:.0}", m_floor, m_floor_expected
    );

    // Convert to effective weight (kN)
    let w_eff: f64 = m_floor * 9.81 / 1000.0;
    let w_eff_expected: f64 = 49.66; // kN

    assert!(
        (w_eff - w_eff_expected).abs() / w_eff_expected < 0.01,
        "Effective weight: {:.2} kN, expected {:.2}", w_eff, w_eff_expected
    );
}

// ================================================================
// 8. ISO 10137 — Frequency Weighting (Wg)
// ================================================================
//
// Frequency weighting for vertical vibration (z-axis):
// Wg = 1.0 for 4-8 Hz
// Wg = 8/f for f > 8 Hz (decreasing sensitivity at higher frequencies)
// This means floors with f > 8 Hz need less strict acceleration limits.

#[test]
fn vibration_frequency_weighting() {
    // At 5 Hz (in flat region): Wg = 1.0
    let f1: f64 = 5.0;
    let wg_5: f64 = if f1 >= 4.0 && f1 <= 8.0 { 1.0 } else { 8.0 / f1 };
    assert!((wg_5 - 1.0).abs() < 0.01, "Wg at 5 Hz = {:.2}", wg_5);

    // At 12 Hz: Wg = 8/12 = 0.667
    let f2: f64 = 12.0;
    let wg_12: f64 = if f2 >= 4.0 && f2 <= 8.0 { 1.0 } else { 8.0 / f2 };
    let wg_12_expected: f64 = 0.667;
    assert!(
        (wg_12 - wg_12_expected).abs() / wg_12_expected < 0.01,
        "Wg at 12 Hz = {:.3}, expected {:.3}", wg_12, wg_12_expected
    );

    // Weighted acceleration comparison
    let a_raw: f64 = 0.04;  // m/s²
    let a_weighted_5: f64 = a_raw * wg_5;
    let a_weighted_12: f64 = a_raw * wg_12;

    // Higher frequency floor has lower weighted acceleration — more acceptable
    assert!(
        a_weighted_12 < a_weighted_5,
        "Weighted: {:.4} (12Hz) < {:.4} (5Hz)", a_weighted_12, a_weighted_5
    );

    // Ratio should match weighting ratio
    let ratio: f64 = a_weighted_12 / a_weighted_5;
    assert!(
        (ratio - wg_12).abs() < 0.01,
        "Ratio {:.3} should equal Wg {:.3}", ratio, wg_12
    );
}
