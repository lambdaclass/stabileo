/// Validation: Extended Floor Vibration and Footfall Analysis
///
/// References:
///   - AISC Design Guide 11: Vibrations of Steel-Framed Structural Systems (2016)
///   - SCI P354: Design of Floors for Vibration (2009)
///   - Murray, Allen & Ungar: Floor Vibrations Due to Human Activity (AISC DG11)
///   - ISO 10137: Bases for Design of Structures -- Serviceability (2007)
///   - Bachmann & Ammann: Vibrations in Structures (1987)
///   - Wyatt: Design Guide on the Vibration of Floors (SCI P076, 1989)
///
/// Tests verify AISC DG11 walking excitation, SCI P354 response factor,
/// Murray criterion, resonant/impulsive response, continuous beam floors,
/// composite floor Dunkerley method, and ISO 10137 human comfort criteria.
use crate::common::*;

// ================================================================
// 1. AISC DG11 Walking Excitation -- Combined Deflection Frequency
// ================================================================
//
// AISC DG11 walking criterion uses combined deflection:
//   f_n = 0.18 * sqrt(g / (delta_p + delta_g + delta_c))
// where:
//   delta_p = girder deflection (mm)
//   delta_g = beam deflection (mm)
//   delta_c = column shortening contribution (mm)
//   g = 9810 mm/s^2
// Then check: f_n > 4 Hz for office floors.

#[test]
fn validation_footfall_ext_aisc_dg11_walking_excitation() {
    let g_mm: f64 = 9810.0; // mm/s^2

    // Floor system deflections under dead + live load (mm)
    let delta_beam: f64 = 3.2;    // beam mid-span deflection
    let delta_girder: f64 = 2.1;  // girder mid-span deflection
    let delta_column: f64 = 0.4;  // column axial shortening

    // Total system deflection
    let delta_total: f64 = delta_beam + delta_girder + delta_column;

    // AISC DG11 frequency estimate (Eq. 3.3)
    let f_n: f64 = 0.18 * (g_mm / delta_total).sqrt();

    // Manual calculation:
    // delta_total = 3.2 + 2.1 + 0.4 = 5.7 mm
    // f_n = 0.18 * sqrt(9810 / 5.7) = 0.18 * sqrt(1721.05) = 0.18 * 41.485 = 7.467 Hz
    let delta_total_expected: f64 = 5.7;
    let f_n_expected: f64 = 0.18 * (g_mm / delta_total_expected).sqrt();

    assert_close(delta_total, delta_total_expected, 0.01, "Total deflection");
    assert_close(f_n, f_n_expected, 0.01, "DG11 floor frequency");

    // Verify frequency is above 4 Hz office minimum
    assert!(f_n > 4.0, "f_n = {:.2} Hz should exceed 4 Hz office limit", f_n);

    // Verify against hand calculation
    let sqrt_val: f64 = (g_mm / delta_total).sqrt();
    assert_close(sqrt_val, 41.485, 0.02, "sqrt(g/delta)");
    assert_close(f_n, 7.467, 0.02, "DG11 frequency hand check");

    // Sensitivity: larger deflection => lower frequency
    let delta_heavy: f64 = 10.0;
    let f_n_heavy: f64 = 0.18 * (g_mm / delta_heavy).sqrt();
    assert!(f_n_heavy < f_n, "Heavier floor: {:.2} < {:.2} Hz", f_n_heavy, f_n);
    let f_n_heavy_expected: f64 = 0.18 * (9810.0_f64 / 10.0).sqrt();
    assert_close(f_n_heavy, f_n_heavy_expected, 0.01, "Heavy floor frequency");
}

// ================================================================
// 2. SCI P354 Response Factor for Different Occupancies
// ================================================================
//
// Response factor R = a_peak / (sqrt(2) * a_base)
// a_base from ISO 10137 base curve:
//   f < 4 Hz: a_base = 0.005 * f/4
//   4 <= f <= 8 Hz: a_base = 0.005 m/s^2
//   f > 8 Hz: a_base = 0.005 * f/8
//
// Acceptance: Office R<=4, Residential R<=2, Hospital R<=1

#[test]
fn validation_footfall_ext_sci_p354_response_factor() {
    let pi: f64 = std::f64::consts::PI;

    // Floor parameters
    let f_n: f64 = 6.5;          // Hz, natural frequency
    let m_modal: f64 = 8000.0;   // kg, modal mass
    let xi: f64 = 0.03;          // damping ratio (composite floor)
    let w_person: f64 = 0.75;    // kN (75 kg person weight)

    // 3rd harmonic of 2.17 Hz walking = 6.5 Hz (resonance)
    let _f_walk: f64 = f_n / 3.0;
    let dlf3: f64 = 0.05;        // DLF for 3rd harmonic

    // Harmonic force amplitude (N)
    let f_harmonic: f64 = dlf3 * w_person * 1000.0; // 37.5 N

    // Steady-state peak acceleration at resonance
    // a_peak = F / (2 * xi * M)
    let a_peak: f64 = f_harmonic / (2.0 * xi * m_modal);

    // Expected: 37.5 / (2 * 0.03 * 8000) = 37.5 / 480 = 0.078125 m/s^2
    assert_close(f_harmonic, 37.5, 0.01, "Harmonic force");
    assert_close(a_peak, 0.078125, 0.01, "Peak acceleration");

    // ISO 10137 base curve at 6.5 Hz (4-8 Hz range: a_base = 0.005)
    let a_base: f64 = 0.005;

    // RMS acceleration (sinusoidal: a_rms = a_peak / sqrt(2))
    let sqrt2: f64 = 2.0_f64.sqrt();
    let a_rms: f64 = a_peak / sqrt2;

    // Response factor R = a_rms / a_base
    let r: f64 = a_rms / a_base;

    // Expected: R = 0.078125 / (1.4142 * 0.005) = 0.078125 / 0.007071 = 11.05
    let r_expected: f64 = a_peak / (sqrt2 * a_base);
    assert_close(r, r_expected, 0.01, "Response factor");

    // Check occupancy acceptance
    let office_limit: f64 = 4.0;
    let residential_limit: f64 = 2.0;
    let hospital_limit: f64 = 1.0;

    // This floor fails office criteria (R > 4)
    assert!(r > office_limit, "R = {:.1} exceeds office limit {:.1}", r, office_limit);
    assert!(r > residential_limit, "R = {:.1} exceeds residential limit", r, );
    assert!(r > hospital_limit, "R = {:.1} exceeds hospital limit", r);

    // Verify: increasing modal mass reduces response factor
    let m_modal_heavy: f64 = 20000.0;
    let a_peak_heavy: f64 = f_harmonic / (2.0 * xi * m_modal_heavy);
    let r_heavy: f64 = a_peak_heavy / (sqrt2 * a_base);
    assert!(r_heavy < r, "Heavier floor R = {:.1} < {:.1}", r_heavy, r);

    // Verify base curve changes outside 4-8 Hz range
    let f_low: f64 = 3.0;
    let a_base_low: f64 = 0.005 * f_low / 4.0;
    assert_close(a_base_low, 0.00375, 0.01, "Base curve below 4 Hz");

    let f_high: f64 = 12.0;
    let a_base_high: f64 = 0.005 * f_high / 8.0;
    assert_close(a_base_high, 0.0075, 0.01, "Base curve above 8 Hz");

    let _pi = pi;
}

// ================================================================
// 3. Murray Criterion -- Peak Acceleration Check
// ================================================================
//
// AISC DG11 Eq. 4.1 (Murray/Allen/Ungar):
//   a_p/g = P_0 * exp(-0.35 * f_n) / (beta_m * W)
// where:
//   P_0 = constant force = 0.29 kN (walking)
//   f_n = natural frequency (Hz)
//   beta_m = modal damping ratio
//   W = effective panel weight (kN)
//   g = 9.81 m/s^2
//
// Acceptance: a_p/g <= 0.5% for office/residential

#[test]
fn validation_footfall_ext_murray_criterion() {
    let g: f64 = 9.81;
    let p0: f64 = 0.29;          // kN, excitation constant

    // Case 1: Office floor
    let f_n1: f64 = 5.0;
    let beta1: f64 = 0.03;       // modal damping (bare steel + ceiling)
    let w1: f64 = 400.0;         // kN, effective weight

    // a_p/g = 0.29 * exp(-0.35 * 5.0) / (0.03 * 400)
    //       = 0.29 * exp(-1.75) / 12.0
    //       = 0.29 * 0.17377 / 12.0
    //       = 0.004199
    let exp_val1: f64 = (-0.35 * f_n1).exp();
    let ap_g1: f64 = p0 * exp_val1 / (beta1 * w1);

    assert_close(exp_val1, 0.17377, 0.02, "exp(-1.75)");
    assert_close(ap_g1, 0.004199, 0.02, "Murray case 1 a_p/g");

    // Convert to actual acceleration
    let ap1: f64 = ap_g1 * g;
    assert_close(ap1, 0.04119, 0.02, "Murray case 1 a_p (m/s^2)");

    // Acceptance: 0.5% g = 0.005 g
    let limit_office: f64 = 0.005;
    assert!(ap_g1 < limit_office, "Office: a_p/g = {:.4} < {:.4}", ap_g1, limit_office);

    // Case 2: Light floor (lower weight, higher frequency)
    let f_n2: f64 = 7.0;
    let beta2: f64 = 0.025;      // less damping
    let w2: f64 = 200.0;         // kN, lighter floor

    let exp_val2: f64 = (-0.35 * f_n2).exp();
    let ap_g2: f64 = p0 * exp_val2 / (beta2 * w2);

    // exp(-2.45) = 0.08652
    // ap_g = 0.29 * 0.08652 / 5.0 = 0.005018
    assert_close(exp_val2, 0.08652, 0.02, "exp(-2.45)");
    assert_close(ap_g2, 0.005018, 0.02, "Murray case 2 a_p/g");

    // Case 2 barely fails the 0.5%g limit
    assert!(ap_g2 > limit_office, "Light floor: a_p/g = {:.4} > {:.4}", ap_g2, limit_office);

    // Case 3: Verify monotonic decrease with frequency
    let f_n3: f64 = 9.0;
    let ap_g3: f64 = p0 * (-0.35 * f_n3).exp() / (beta1 * w1);
    assert!(ap_g3 < ap_g1, "Higher freq => lower accel: {:.5} < {:.5}", ap_g3, ap_g1);
}

// ================================================================
// 4. Resonant Response -- Steady-State from Harmonic Walking
// ================================================================
//
// When walking harmonic frequency matches floor frequency,
// resonance builds up. Steady-state amplitude for SDOF:
//   a_ss = F0 / (2 * xi * m * omega_n)  [velocity resonance]
//   a_ss = F0 * omega_n / (2 * xi * m * omega_n) = F0 / (2*xi*m) [accel resonance]
//
// Time to reach 90% of steady state: t_90 ~ 2.3 / (xi * omega_n)
// Build-up: a(t) = a_ss * (1 - exp(-xi * omega_n * t))

#[test]
fn validation_footfall_ext_resonant_response() {
    let pi: f64 = std::f64::consts::PI;

    // Floor properties
    let f_n: f64 = 4.0;            // Hz, floor natural frequency
    let omega_n: f64 = 2.0 * pi * f_n;  // rad/s
    let m_modal: f64 = 10000.0;    // kg
    let xi: f64 = 0.04;            // damping ratio (fully fitted floor)

    // Walking 2nd harmonic at 2.0 Hz => 4.0 Hz = f_n (resonance)
    let dlf2: f64 = 0.10;
    let w_person: f64 = 0.75;      // kN
    let f0: f64 = dlf2 * w_person * 1000.0;  // 75 N

    // Steady-state peak acceleration at resonance
    // a_ss = F0 / (2 * xi * M)
    let a_ss: f64 = f0 / (2.0 * xi * m_modal);
    // = 75 / (2 * 0.04 * 10000) = 75 / 800 = 0.09375 m/s^2
    assert_close(a_ss, 0.09375, 0.01, "Steady-state acceleration");

    // Time to reach 90% of steady state
    // t_90 = -ln(0.10) / (xi * omega_n) = 2.3026 / (xi * omega_n)
    let ln_01: f64 = (0.10_f64).ln().abs();
    let t_90: f64 = ln_01 / (xi * omega_n);
    // omega_n = 2*pi*4 = 25.133
    // t_90 = 2.3026 / (0.04 * 25.133) = 2.3026 / 1.0053 = 2.290 s
    assert_close(omega_n, 25.1327, 0.01, "omega_n");
    assert_close(t_90, 2.290, 0.03, "Time to 90% steady state");

    // Build-up at t = 1 second
    let t1: f64 = 1.0;
    let exp_term: f64 = (-xi * omega_n * t1).exp();
    let a_t1: f64 = a_ss * (1.0 - exp_term);
    // exp(-0.04 * 25.133 * 1.0) = exp(-1.0053) = 0.3659
    // a_t1 = 0.09375 * (1 - 0.3659) = 0.09375 * 0.6341 = 0.05944
    assert_close(exp_term, 0.3659, 0.03, "Exponential decay at t=1s");
    assert_close(a_t1, 0.05944, 0.03, "Acceleration at t=1s");

    // At t=3s (well past t_90), should be near steady state
    let t3: f64 = 3.0;
    let a_t3: f64 = a_ss * (1.0 - (-xi * omega_n * t3).exp());
    let ratio_t3: f64 = a_t3 / a_ss;
    assert!(ratio_t3 > 0.95, "At t=3s: {:.1}% of steady state", ratio_t3 * 100.0);

    // Number of cycles for near-steady-state
    let n_cycles: f64 = t_90 * f_n;
    // t_90 * f_n = 2.29 * 4 = 9.16 cycles
    assert_close(n_cycles, 9.16, 0.05, "Cycles to 90% steady state");
}

// ================================================================
// 5. Impulsive Response -- Heel Drop Decay
// ================================================================
//
// Heel drop test: instantaneous impulse of ~70 N-s (person drops on heels).
// Response is free vibration: a(t) = (I * omega_n / M) * exp(-xi * omega_n * t) * sin(omega_d * t)
// Decay: successive peaks reduce by exp(-xi * omega_n * T_d) per cycle.
// Logarithmic decrement: delta_log = 2*pi*xi / sqrt(1 - xi^2) ~ 2*pi*xi for small xi.

#[test]
fn validation_footfall_ext_impulsive_response() {
    let pi: f64 = std::f64::consts::PI;

    // Floor properties
    let f_n: f64 = 8.0;           // Hz
    let omega_n: f64 = 2.0 * pi * f_n;  // rad/s = 50.265
    let m_modal: f64 = 12000.0;   // kg
    let xi: f64 = 0.05;           // 5% damping (furnished floor)

    // Heel drop impulse
    let impulse: f64 = 70.0;      // N-s (typical heel drop)

    // Damped frequency
    let xi_sq: f64 = xi * xi;
    let omega_d: f64 = omega_n * (1.0 - xi_sq).sqrt();
    // omega_d = 50.265 * sqrt(1 - 0.0025) = 50.265 * 0.99875 = 50.202
    assert_close(omega_d, 50.202, 0.01, "Damped frequency");

    // Initial peak acceleration (first half-cycle)
    // a_0 = I * omega_n / M (approximation for small damping)
    let a0: f64 = impulse * omega_n / m_modal;
    // = 70 * 50.265 / 12000 = 3518.6 / 12000 = 0.29321 m/s^2
    assert_close(a0, 0.29321, 0.02, "Initial peak acceleration");

    // Logarithmic decrement
    // delta = 2*pi*xi / sqrt(1 - xi^2)
    let log_dec: f64 = 2.0 * pi * xi / (1.0 - xi_sq).sqrt();
    // = 6.2832 * 0.05 / 0.99875 = 0.31455
    assert_close(log_dec, 0.31455, 0.02, "Logarithmic decrement");

    // Ratio of successive peaks
    let peak_ratio: f64 = (-log_dec).exp();
    // exp(-0.31455) = 0.7301
    assert_close(peak_ratio, 0.7301, 0.02, "Peak ratio per cycle");

    // Acceleration after 5 cycles
    let n_cycles: f64 = 5.0;
    let a_5: f64 = a0 * (-n_cycles * log_dec).exp();
    // a_5 = 0.29321 * exp(-5 * 0.31455) = 0.29321 * exp(-1.5728) = 0.29321 * 0.2076 = 0.06087
    let exp_5: f64 = (-n_cycles * log_dec).exp();
    assert_close(exp_5, 0.2076, 0.03, "Decay factor after 5 cycles");
    assert_close(a_5, 0.06087, 0.03, "Acceleration after 5 cycles");

    // Time for acceleration to drop below 0.005 m/s^2 (perception threshold)
    // a0 * exp(-xi * omega_n * t) = 0.005
    // t = -ln(0.005 / a0) / (xi * omega_n)
    let a_threshold: f64 = 0.005;
    let t_decay: f64 = -(a_threshold / a0).ln() / (xi * omega_n);
    // ln(0.005 / 0.29321) = ln(0.01705) = -4.071
    // t = 4.071 / (0.05 * 50.265) = 4.071 / 2.5133 = 1.620 s
    assert_close(t_decay, 1.620, 0.05, "Time to drop below threshold");

    // Number of perceptible cycles
    let perceptible_cycles: f64 = t_decay * f_n;
    // 1.620 * 8 = 12.96 cycles
    assert_close(perceptible_cycles, 12.96, 0.05, "Perceptible cycles");
}

// ================================================================
// 6. Continuous Beam Floor -- Effective Panel Weight & Frequency
// ================================================================
//
// Multi-span continuous beam has different effective mass and stiffness
// than simply supported. For a 2-span continuous beam:
//   f_1 = (pi/L^2) * sqrt(EI / (rho*A))  (same as SS for equal spans)
// But the effective panel weight accounts for vibrating mass in
// adjacent spans. Per SCI P354:
//   W_eff = w * L_eff * B_eff
// where L_eff and B_eff depend on mode shape extent.
//
// For a 2-span continuous beam, the first mode vibrates one span
// while the other is nearly stationary => W_eff ~ 1.0 * w * L * B

#[test]
fn validation_footfall_ext_continuous_beam_floor() {
    let pi: f64 = std::f64::consts::PI;

    // Floor system parameters
    let l_span: f64 = 7.5;        // m, each span length
    let n_spans: usize = 2;
    let b_eff: f64 = 6.0;         // m, effective floor width
    let w_floor: f64 = 5.0;       // kN/m^2, total floor load (dead + 10% live)

    // Beam properties (composite steel-concrete)
    let ei: f64 = 80_000.0;       // kN*m^2
    let mass_per_m: f64 = w_floor * b_eff / 9.81 * 1000.0;
    // = 5.0 * 6.0 / 9.81 * 1000 = 30000/9.81 = 3058.1 kg/m

    // Simply supported frequency (single span)
    let f_ss: f64 = pi / (2.0 * l_span * l_span)
        * (ei * 1000.0 / mass_per_m).sqrt();
    // ei*1000 / mass_per_m = 80e6 / 3058.1 = 26160
    // sqrt(26160) = 161.74
    // pi / (2 * 56.25) = 0.02793
    // f_ss = 0.02793 * 161.74 = 4.516 Hz
    let ratio_ei_m: f64 = ei * 1000.0 / mass_per_m;
    let sqrt_ratio: f64 = ratio_ei_m.sqrt();
    assert_close(mass_per_m, 3058.1, 0.02, "Mass per meter");
    assert_close(sqrt_ratio, 161.74, 0.02, "sqrt(EI/m)");
    assert_close(f_ss, 4.516, 0.03, "SS beam frequency");

    // Continuous beam first mode (2-span): approximately equal to SS
    // The first mode of an equal 2-span continuous beam has a node at
    // the interior support, so each span vibrates like SS
    let f_continuous: f64 = f_ss; // same for equal spans, 1st mode

    // Effective weight for single-span vibration
    let w_eff_ss: f64 = w_floor * l_span * b_eff;
    // = 5.0 * 7.5 * 6.0 = 225.0 kN
    assert_close(w_eff_ss, 225.0, 0.01, "Effective weight (SS)");

    // For continuous beam: effective weight accounts for adjacent span
    // SCI P354 Section 4.3: L_eff = 1.0 * L for first mode of multi-span
    let l_eff: f64 = 1.0 * l_span;
    let w_eff_cont: f64 = w_floor * l_eff * b_eff;
    assert_close(w_eff_cont, 225.0, 0.01, "Effective weight (continuous)");

    // Total panel weight (both spans)
    let w_total: f64 = w_floor * (n_spans as f64) * l_span * b_eff;
    assert_close(w_total, 450.0, 0.01, "Total weight both spans");

    // Effective weight is half the total (one span vibrates)
    let ratio_w: f64 = w_eff_cont / w_total;
    assert_close(ratio_w, 0.5, 0.01, "Effective/total weight ratio");

    // Murray criterion with continuous beam parameters
    let p0: f64 = 0.29;
    let beta: f64 = 0.03;
    let ap_g: f64 = p0 * (-0.35 * f_continuous).exp() / (beta * w_eff_cont);
    let exp_term: f64 = (-0.35 * f_continuous).exp();
    // exp(-0.35 * 4.516) = exp(-1.581) = 0.2056
    // ap_g = 0.29 * 0.2056 / (0.03 * 225) = 0.05962 / 6.75 = 0.008833
    assert_close(exp_term, 0.2056, 0.05, "Exp term for Murray");
    assert_close(ap_g, 0.008833, 0.05, "Murray ap/g for continuous beam");
}

// ================================================================
// 7. Composite Floor System -- Dunkerley's Method
// ================================================================
//
// Dunkerley's method combines beam and slab frequencies:
//   1/f_combined^2 = 1/f_beam^2 + 1/f_slab^2
// This gives a lower bound on the combined frequency.
//
// For a steel beam supporting a concrete slab:
//   f_beam = pi^2 / (2*pi*L_b^2) * sqrt(EI_b / m_b)   (SS beam)
//   f_slab = pi^2 / (2*pi*L_s^2) * sqrt(EI_s / m_s)   (slab strip)

#[test]
fn validation_footfall_ext_composite_dunkerley() {
    let pi: f64 = std::f64::consts::PI;

    // Steel beam parameters
    let l_beam: f64 = 9.0;        // m, beam span
    let ei_beam: f64 = 60_000.0;  // kN*m^2 (composite beam stiffness)
    let m_beam: f64 = 450.0;      // kg/m (beam + tributary slab mass)

    // Concrete slab parameters
    let l_slab: f64 = 3.0;        // m, slab span between beams
    let ei_slab: f64 = 2_500.0;   // kN*m^2 per m width
    let m_slab: f64 = 350.0;      // kg/m per m width

    // Beam frequency (simply supported)
    let f_beam: f64 = pi / (2.0 * l_beam * l_beam)
        * (ei_beam * 1000.0 / m_beam).sqrt();
    // ei_beam*1000/m_beam = 60e6 / 450 = 133333
    // sqrt(133333) = 365.15
    // pi / (2 * 81) = 0.01939
    // f_beam = 0.01939 * 365.15 = 7.082 Hz
    let f_beam_calc: f64 = pi / (2.0 * l_beam.powi(2)) * (ei_beam * 1000.0 / m_beam).sqrt();
    assert_close(f_beam, f_beam_calc, 0.01, "Beam frequency consistency");
    assert_close(f_beam, 7.082, 0.03, "Beam frequency");

    // Slab frequency (simply supported strip)
    let f_slab: f64 = pi / (2.0 * l_slab * l_slab)
        * (ei_slab * 1000.0 / m_slab).sqrt();
    // ei_slab*1000/m_slab = 2.5e6 / 350 = 7142.9
    // sqrt(7142.9) = 84.515
    // pi / (2 * 9) = 0.17453
    // f_slab = 0.17453 * 84.515 = 14.750 Hz
    assert_close(f_slab, 14.750, 0.03, "Slab frequency");

    // Dunkerley's combined frequency
    let f_combined: f64 = 1.0 / (1.0 / (f_beam * f_beam) + 1.0 / (f_slab * f_slab)).sqrt();
    // 1/f_b^2 = 1/50.155 = 0.01994
    // 1/f_s^2 = 1/217.56 = 0.004596
    // sum = 0.02454
    // f_combined = 1/sqrt(0.02454) = 1/0.15666 = 6.383 Hz
    let inv_fb_sq: f64 = 1.0 / f_beam.powi(2);
    let inv_fs_sq: f64 = 1.0 / f_slab.powi(2);
    let sum_inv: f64 = inv_fb_sq + inv_fs_sq;
    assert_close(f_combined, 1.0 / sum_inv.sqrt(), 0.01, "Dunkerley consistency");
    assert_close(f_combined, 6.383, 0.03, "Dunkerley combined frequency");

    // Combined frequency must be less than both individual frequencies
    assert!(f_combined < f_beam,
        "Combined {:.2} < beam {:.2} Hz", f_combined, f_beam);
    assert!(f_combined < f_slab,
        "Combined {:.2} < slab {:.2} Hz", f_combined, f_slab);

    // Frequency reduction from beam alone
    let reduction_pct: f64 = (1.0 - f_combined / f_beam) * 100.0;
    // (1 - 6.383/7.082) * 100 = (1 - 0.9013) * 100 = 9.87%
    assert_close(reduction_pct, 9.87, 0.05, "Frequency reduction %");

    // When slab is much stiffer, combined approaches beam frequency
    let f_slab_stiff: f64 = 50.0;
    let f_combined_stiff: f64 = 1.0
        / (1.0 / f_beam.powi(2) + 1.0 / f_slab_stiff.powi(2)).sqrt();
    let ratio_stiff: f64 = f_combined_stiff / f_beam;
    assert!(ratio_stiff > 0.99,
        "Stiff slab: combined/beam = {:.4}", ratio_stiff);
}

// ================================================================
// 8. Human Comfort -- ISO 10137 Base Curve & RMS Acceleration
// ================================================================
//
// ISO 10137 defines perception thresholds (base curves) for
// vertical vibration in buildings:
//   f < 4 Hz:   a_base(f) = 0.005 * f / 4.0
//   4-8 Hz:     a_base = 0.005 m/s^2
//   f > 8 Hz:   a_base(f) = 0.005 * f / 8.0
//
// Multiplying factors for acceptance:
//   Office (day): x16, Residential (day): x4, Residential (night): x1.4
//
// RMS acceleration from sinusoidal vibration at frequency f:
//   a_rms = a_peak / sqrt(2)

#[test]
fn validation_footfall_ext_human_comfort_iso10137() {
    let pi: f64 = std::f64::consts::PI;

    // ISO 10137 base curve values at specific frequencies
    // f = 2 Hz: a_base = 0.005 * 2/4 = 0.0025 m/s^2
    let f1: f64 = 2.0;
    let a_base_2hz: f64 = 0.005 * f1 / 4.0;
    assert_close(a_base_2hz, 0.0025, 0.01, "Base curve at 2 Hz");

    // f = 4 Hz: a_base = 0.005 m/s^2 (transition point)
    let f2: f64 = 4.0;
    let a_base_4hz: f64 = 0.005 * f2 / 4.0; // equals 0.005
    assert_close(a_base_4hz, 0.005, 0.01, "Base curve at 4 Hz");

    // f = 6 Hz: a_base = 0.005 m/s^2 (flat region)
    let a_base_6hz: f64 = 0.005;
    assert_close(a_base_6hz, 0.005, 0.01, "Base curve at 6 Hz");

    // f = 8 Hz: a_base = 0.005 m/s^2 (transition point)
    let a_base_8hz: f64 = 0.005;
    assert_close(a_base_8hz, 0.005, 0.01, "Base curve at 8 Hz");

    // f = 16 Hz: a_base = 0.005 * 16/8 = 0.01 m/s^2
    let f5: f64 = 16.0;
    let a_base_16hz: f64 = 0.005 * f5 / 8.0;
    assert_close(a_base_16hz, 0.01, 0.01, "Base curve at 16 Hz");

    // Multiplying factors for acceptable vibration levels
    let mf_office_day: f64 = 16.0;
    let mf_residential_day: f64 = 4.0;
    let mf_residential_night: f64 = 1.4;
    let mf_hospital_or: f64 = 1.0;  // operating room

    // Acceptable acceleration limits at 6 Hz (flat region)
    let a_limit_office: f64 = a_base_6hz * mf_office_day;
    let a_limit_res_day: f64 = a_base_6hz * mf_residential_day;
    let a_limit_res_night: f64 = a_base_6hz * mf_residential_night;
    let a_limit_hospital: f64 = a_base_6hz * mf_hospital_or;

    assert_close(a_limit_office, 0.08, 0.01, "Office limit at 6 Hz");
    assert_close(a_limit_res_day, 0.02, 0.01, "Residential day limit at 6 Hz");
    assert_close(a_limit_res_night, 0.007, 0.01, "Residential night limit at 6 Hz");
    assert_close(a_limit_hospital, 0.005, 0.01, "Hospital limit at 6 Hz");

    // Example floor: compute RMS acceleration and check compliance
    let _f_floor: f64 = 6.0;      // Hz
    let m_modal: f64 = 6000.0;    // kg
    let xi: f64 = 0.03;           // damping
    let dlf: f64 = 0.05;          // 3rd harmonic DLF
    let w_person: f64 = 750.0;    // N (75 kg)

    // Peak acceleration at resonance
    let f0: f64 = dlf * w_person;  // 37.5 N
    let a_peak: f64 = f0 / (2.0 * xi * m_modal);
    // = 37.5 / (2 * 0.03 * 6000) = 37.5 / 360 = 0.10417 m/s^2
    assert_close(a_peak, 0.10417, 0.02, "Peak acceleration");

    // RMS acceleration
    let sqrt2: f64 = 2.0_f64.sqrt();
    let a_rms: f64 = a_peak / sqrt2;
    // = 0.10417 / 1.4142 = 0.07366 m/s^2
    assert_close(a_rms, 0.07366, 0.02, "RMS acceleration");

    // Compliance check (compare RMS with limits)
    // Office: 0.07366 < 0.08 => PASS (barely)
    assert!(a_rms < a_limit_office,
        "Office: a_rms={:.4} < limit={:.4}", a_rms, a_limit_office);

    // Residential day: 0.07366 > 0.02 => FAIL
    assert!(a_rms > a_limit_res_day,
        "Residential: a_rms={:.4} > limit={:.4}", a_rms, a_limit_res_day);

    // Response factor (R = a_rms / a_base)
    let r: f64 = a_rms / a_base_6hz;
    // = 0.07366 / 0.005 = 14.73
    assert_close(r, 14.73, 0.03, "Response factor");

    // Verify R matches multiplying factor comparison
    // R < 16 => acceptable for office (mf=16)
    assert!(r < mf_office_day, "R={:.1} < MF_office={:.0}", r, mf_office_day);
    assert!(r > mf_residential_day, "R={:.1} > MF_residential={:.0}", r, mf_residential_day);

    let _pi = pi;
}
