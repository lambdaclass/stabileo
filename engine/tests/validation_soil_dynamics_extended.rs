/// Validation: Soil Dynamics and Site Response — Extended Benchmarks
///
/// References:
///   - Kramer, "Geotechnical Earthquake Engineering" (1996), Ch. 5-7
///   - Seed & Idriss (1970): "Soil Moduli and Damping Factors for Dynamic
///     Response Analyses", Report EERC 70-10
///   - Gazetas (1991): "Foundation Vibrations", Ch. 15, Foundation Eng. Handbook
///   - Richart, Hall & Woods, "Vibrations of Soils and Foundations" (1970)
///   - Achenbach, "Wave Propagation in Elastic Solids" (1973)
///   - Chopra, "Dynamics of Structures", 5th Ed., Appendix A (damping)
///   - Vesic (1973): "Analysis of Ultimate Loads of Shallow Foundations"
///   - Seed & Idriss (1971): "Simplified Procedure for Evaluating Soil
///     Liquefaction Potential", JSMFD ASCE 97(9)
///
/// Tests verify closed-form soil dynamics and site response formulas.
/// No solver calls — pure arithmetic verification of analytical expressions.
///
/// Topics:
///   1. Site period Ts = 4H/Vs for uniform soil layer
///   2. Impedance functions: Kv and Kh for circular footing on half-space
///   3. Site amplification factor at resonance: F(f) = 1/cos(2*pi*f*H/Vs)
///   4. Damping ratio from logarithmic decrement
///   5. Rayleigh wave velocity approximation
///   6. Shear modulus degradation G/Gmax vs shear strain (Seed & Idriss 1970)
///   7. Liquefaction CSR from simplified procedure
///   8. Dynamic bearing capacity enhancement with loading rate

mod helpers;
use helpers::*;

use std::f64::consts::PI;

// ================================================================
// 1. Site Period: Ts = 4H / Vs for Uniform Soil Layer
// ================================================================
//
// For a uniform soil layer of thickness H over rigid bedrock,
// the fundamental site period is:
//
//   Ts = 4 * H / Vs
//
// where Vs = shear wave velocity of the layer.
//
// This follows from the quarter-wavelength resonance condition:
// the layer thickness equals one-quarter of the fundamental
// shear wave wavelength.
//
// The fundamental frequency is:
//   f1 = 1 / Ts = Vs / (4*H)
//
// Higher mode frequencies:
//   fn = (2n - 1) * f1    (n = 1, 2, 3, ...)
//
// Example:
//   H = 30 m, Vs = 250 m/s
//   Ts = 4 * 30 / 250 = 0.48 s
//   f1 = 1 / 0.48 = 2.0833 Hz
//   f2 = 3 * f1 = 6.25 Hz
//   f3 = 5 * f1 = 10.4167 Hz

#[test]
fn validation_soil_dyn_ext_site_period() {
    let h: f64 = 30.0;     // m, layer thickness
    let vs: f64 = 250.0;   // m/s, shear wave velocity

    // Fundamental site period
    let ts: f64 = 4.0 * h / vs;
    let ts_expected: f64 = 0.48;
    assert_close(ts, ts_expected, 0.01, "Site period Ts = 4H/Vs");

    // Fundamental frequency
    let f1: f64 = 1.0 / ts;
    let f1_expected: f64 = vs / (4.0 * h);
    assert_close(f1, f1_expected, 0.01, "Fundamental frequency f1 = Vs/(4H)");
    assert_close(f1, 2.0833333, 0.01, "f1 numerical value");

    // Higher mode frequencies: fn = (2n-1) * f1
    let f2: f64 = 3.0 * f1;
    let f3: f64 = 5.0 * f1;
    assert_close(f2, 3.0 * f1_expected, 0.01, "Second mode f2 = 3*f1");
    assert_close(f3, 5.0 * f1_expected, 0.01, "Third mode f3 = 5*f1");

    // Verify mode spacing is 2*f1
    let mode_spacing: f64 = f2 - f1;
    assert_close(mode_spacing, 2.0 * f1, 0.01, "Mode spacing = 2*f1");

    // Softer soil (lower Vs) gives longer period
    let vs_soft: f64 = 150.0;
    let ts_soft: f64 = 4.0 * h / vs_soft;
    assert!(ts_soft > ts, "Softer soil has longer site period");

    // Thicker layer gives longer period
    let h_thick: f64 = 50.0;
    let ts_thick: f64 = 4.0 * h_thick / vs;
    assert!(ts_thick > ts, "Thicker layer has longer site period");

    // Multi-layer approximation: Ts = 4 * sum(Hi/Vsi)
    // Two layers: H1=15m, Vs1=200 m/s; H2=15m, Vs2=300 m/s
    let h1: f64 = 15.0;
    let vs1: f64 = 200.0;
    let h2: f64 = 15.0;
    let vs2: f64 = 300.0;
    let ts_multi: f64 = 4.0 * (h1 / vs1 + h2 / vs2);
    let ts_multi_expected: f64 = 4.0 * (15.0 / 200.0 + 15.0 / 300.0);
    assert_close(ts_multi, ts_multi_expected, 0.01, "Multi-layer site period");

    // Multi-layer period is between uniform soft and uniform stiff
    let ts_all_soft: f64 = 4.0 * (h1 + h2) / vs1;
    let ts_all_stiff: f64 = 4.0 * (h1 + h2) / vs2;
    assert!(
        ts_multi > ts_all_stiff && ts_multi < ts_all_soft,
        "Multi-layer period between uniform bounds"
    );
}

// ================================================================
// 2. Impedance Functions: Kv and Kh for Circular Footing
// ================================================================
//
// Surface circular footing on elastic half-space (Gazetas 1991):
//
//   Kv = 4*G*R / (1 - nu)            (vertical stiffness)
//   Kh = 8*G*R / (2 - nu)            (horizontal/sliding stiffness)
//
// where:
//   G = shear modulus = rho * Vs^2
//   R = footing radius
//   nu = Poisson's ratio of the soil
//
// Example:
//   rho = 1900 kg/m^3, Vs = 250 m/s, nu = 0.35, R = 1.5 m
//   G = 1900 * 250^2 = 118,750,000 Pa = 118,750 kN/m^2
//   Kv = 4 * 118750 * 1.5 / (1 - 0.35) = 712500 / 0.65 = 1,096,154 kN/m
//   Kh = 8 * 118750 * 1.5 / (2 - 0.35) = 1425000 / 1.65 = 863,636 kN/m

#[test]
fn validation_soil_dyn_ext_impedance_functions() {
    let rho: f64 = 1900.0;    // kg/m^3
    let vs: f64 = 250.0;      // m/s
    let nu: f64 = 0.35;       // Poisson's ratio
    let r: f64 = 1.5;         // m, footing radius

    // Shear modulus: G = rho * Vs^2 (Pa), convert to kN/m^2
    let g_pa: f64 = rho * vs * vs;
    let g: f64 = g_pa / 1000.0;   // kN/m^2
    assert_close(g, 118750.0, 0.01, "Shear modulus G = rho*Vs^2");

    // Vertical stiffness: Kv = 4*G*R / (1 - nu)
    let kv: f64 = 4.0 * g * r / (1.0 - nu);
    let kv_expected: f64 = 4.0 * 118750.0 * 1.5 / (1.0 - 0.35);
    assert_close(kv, kv_expected, 0.01, "Vertical stiffness Kv = 4GR/(1-nu)");

    // Horizontal stiffness: Kh = 8*G*R / (2 - nu)
    let kh: f64 = 8.0 * g * r / (2.0 - nu);
    let kh_expected: f64 = 8.0 * 118750.0 * 1.5 / (2.0 - 0.35);
    assert_close(kh, kh_expected, 0.01, "Horizontal stiffness Kh = 8GR/(2-nu)");

    // Vertical stiffness should exceed horizontal stiffness
    assert!(kv > kh, "Kv > Kh for typical Poisson's ratio");

    // Verify ratio Kv/Kh = (4/(1-nu)) / (8/(2-nu)) = (2-nu) / (2*(1-nu))
    let ratio_computed: f64 = kv / kh;
    let ratio_expected: f64 = (2.0 - nu) / (2.0 * (1.0 - nu));
    assert_close(ratio_computed, ratio_expected, 0.01, "Kv/Kh ratio");

    // Stiffness proportional to R (linear)
    let r2: f64 = 3.0;
    let kv_r2: f64 = 4.0 * g * r2 / (1.0 - nu);
    assert_close(kv_r2 / kv, r2 / r, 0.01, "Kv proportional to R");

    // Stiffness proportional to G (linear)
    let g2: f64 = 2.0 * g;
    let kv_2g: f64 = 4.0 * g2 * r / (1.0 - nu);
    assert_close(kv_2g / kv, 2.0, 0.01, "Kv proportional to G");

    // As nu -> 0.5 (incompressible), Kv -> infinity, Kh -> finite
    // Check trend: higher nu gives higher Kv but Kh changes less
    let nu2: f64 = 0.45;
    let kv_nu2: f64 = 4.0 * g * r / (1.0 - nu2);
    let kh_nu2: f64 = 8.0 * g * r / (2.0 - nu2);
    assert!(kv_nu2 > kv, "Higher nu gives higher Kv");
    assert!(kh_nu2 > kh, "Higher nu gives higher Kh");

    // Rocking stiffness: Kr = 8*G*R^3 / (3*(1-nu))
    let kr: f64 = 8.0 * g * r.powi(3) / (3.0 * (1.0 - nu));
    assert!(kr > 0.0, "Rocking stiffness is positive");

    // Kr proportional to R^3
    let kr_r2: f64 = 8.0 * g * r2.powi(3) / (3.0 * (1.0 - nu));
    assert_close(kr_r2 / kr, (r2 / r).powi(3), 0.01, "Kr proportional to R^3");
}

// ================================================================
// 3. Site Amplification Factor at Resonance
// ================================================================
//
// For a uniform undamped soil layer over rigid bedrock,
// the transfer function (amplification) is:
//
//   F(f) = 1 / cos(2*pi*f*H / Vs)
//
// At the fundamental frequency f1 = Vs/(4H), the argument of
// cosine is pi/2, and cos(pi/2) = 0, giving infinite amplification
// (undamped resonance).
//
// At frequencies below f1, amplification is finite and > 1.
// At f = f1/2, the argument is pi/4, and F = 1/cos(pi/4) = sqrt(2).
//
// With damping ratio xi, the damped amplification at resonance is
// approximately:
//   F_res ~ 1 / (pi * xi / 2) = 2 / (pi * xi)
//
// Example:
//   H = 20 m, Vs = 200 m/s, xi = 0.05
//   f1 = 200/(4*20) = 2.5 Hz
//   F at f=1.25 Hz: arg = 2*pi*1.25*20/200 = pi/4 -> F = sqrt(2)
//   F_res (damped) = 2/(pi*0.05) = 12.732

#[test]
fn validation_soil_dyn_ext_site_amplification() {
    let h: f64 = 20.0;        // m, layer thickness
    let vs: f64 = 200.0;      // m/s, shear wave velocity
    let xi: f64 = 0.05;       // 5% damping ratio

    // Fundamental frequency
    let f1: f64 = vs / (4.0 * h);
    assert_close(f1, 2.5, 0.01, "Fundamental frequency f1 = Vs/(4H)");

    // Amplification at f = f1/2 = 1.25 Hz (undamped)
    let f_half: f64 = f1 / 2.0;
    let arg_half: f64 = 2.0 * PI * f_half * h / vs;
    assert_close(arg_half, PI / 4.0, 0.01, "Cosine argument at f1/2 = pi/4");

    let amp_half: f64 = 1.0 / arg_half.cos().abs();
    let amp_half_expected: f64 = 1.0 / (PI / 4.0_f64).cos();
    assert_close(amp_half, amp_half_expected, 0.01, "Amplification at f1/2 = 1/cos(pi/4)");
    assert_close(amp_half, 2.0_f64.sqrt(), 0.02, "Amplification at f1/2 = sqrt(2)");

    // Amplification at f = 0 (static): F(0) = 1/cos(0) = 1
    let amp_static: f64 = 1.0 / (2.0 * PI * 0.001 * h / vs).cos().abs();
    assert_close(amp_static, 1.0, 0.01, "Static amplification ~ 1");

    // Damped resonance amplification: F_res ~ 2 / (pi * xi)
    let amp_res_damped: f64 = 2.0 / (PI * xi);
    let amp_res_expected: f64 = 2.0 / (PI * 0.05);
    assert_close(amp_res_damped, amp_res_expected, 0.01, "Damped resonance amplification");
    assert_close(amp_res_damped, 12.7324, 0.01, "F_res numerical value");

    // Higher damping reduces resonant amplification
    let xi_high: f64 = 0.10;
    let amp_res_high_xi: f64 = 2.0 / (PI * xi_high);
    assert!(amp_res_high_xi < amp_res_damped, "Higher damping reduces amplification");
    assert_close(amp_res_high_xi, 2.0 / (PI * 0.10), 0.01, "F_res at 10% damping");

    // Amplification at second mode f2 = 3*f1 = 7.5 Hz
    // At f2, undamped amplification is also infinite (resonance)
    // Damped: same formula applies per mode
    let f2: f64 = 3.0 * f1;
    assert_close(f2, 7.5, 0.01, "Second mode frequency f2 = 3*f1");

    // Amplification between modes (at f = 2*f1 = 5 Hz)
    // arg = 2*pi*5*20/200 = pi -> cos(pi) = -1 -> F = 1
    let f_between: f64 = 2.0 * f1;
    let arg_between: f64 = 2.0 * PI * f_between * h / vs;
    assert_close(arg_between, PI, 0.01, "Argument at 2*f1 = pi");
    let amp_between: f64 = 1.0 / arg_between.cos().abs();
    assert_close(amp_between, 1.0, 0.02, "Amplification at anti-resonance = 1");
}

// ================================================================
// 4. Damping Ratio from Logarithmic Decrement
// ================================================================
//
// For a free vibration record of a damped SDOF system, the
// logarithmic decrement is:
//
//   delta = ln(u_n / u_(n+1))
//
// where u_n and u_(n+1) are successive peak amplitudes.
//
// The damping ratio is related to the log decrement by:
//
//   zeta = delta / sqrt((2*pi)^2 + delta^2)
//        = delta / (2*pi * sqrt(1 + (delta/(2*pi))^2))
//
// For small damping (delta << 2*pi):
//   zeta ~ delta / (2*pi)
//
// Example:
//   Successive peaks: u1 = 10.0 mm, u2 = 8.5 mm
//   delta = ln(10.0/8.5) = ln(1.17647) = 0.16252
//   zeta = 0.16252 / sqrt(4*pi^2 + 0.16252^2)
//        = 0.16252 / sqrt(39.4784 + 0.02641)
//        = 0.16252 / 6.28588
//        = 0.025862
//   Approximate: zeta ~ 0.16252 / (2*pi) = 0.025862

#[test]
fn validation_soil_dyn_ext_damping_log_decrement() {
    let u1: f64 = 10.0;       // mm, first peak amplitude
    let u2: f64 = 8.5;        // mm, second peak amplitude

    // Logarithmic decrement
    let delta: f64 = (u1 / u2).ln();
    let delta_expected: f64 = (10.0_f64 / 8.5).ln();
    assert_close(delta, delta_expected, 0.01, "Log decrement delta = ln(u1/u2)");

    // Exact damping ratio from log decrement
    let two_pi_sq: f64 = (2.0 * PI).powi(2);
    let zeta: f64 = delta / (two_pi_sq + delta.powi(2)).sqrt();
    let zeta_expected: f64 = delta_expected / (4.0 * PI * PI + delta_expected * delta_expected).sqrt();
    assert_close(zeta, zeta_expected, 0.01, "Exact damping ratio from log decrement");

    // Approximate damping ratio (for small damping): zeta ~ delta / (2*pi)
    let zeta_approx: f64 = delta / (2.0 * PI);
    assert_close(zeta_approx, zeta, 0.02, "Approximate zeta ~ delta/(2*pi)");

    // Verify the exact and approximate are close for small damping
    let rel_diff: f64 = (zeta - zeta_approx).abs() / zeta;
    assert!(rel_diff < 0.01, "Exact and approximate agree within 1% for small damping");

    // Multiple-cycle log decrement: delta = (1/n) * ln(u_1 / u_(n+1))
    // Using 5 cycles: u6 ~ u1 * exp(-5*delta)
    let n_cycles: f64 = 5.0;
    let u6: f64 = u1 * (-n_cycles * delta).exp();
    let delta_multi: f64 = (1.0 / n_cycles) * (u1 / u6).ln();
    assert_close(delta_multi, delta, 0.01, "Multi-cycle log decrement");

    // Higher damping example: u1 = 10.0, u2 = 6.0 (heavily damped)
    let u2_heavy: f64 = 6.0;
    let delta_heavy: f64 = (u1 / u2_heavy).ln();
    let zeta_heavy: f64 = delta_heavy / (two_pi_sq + delta_heavy.powi(2)).sqrt();
    let zeta_heavy_approx: f64 = delta_heavy / (2.0 * PI);

    assert!(zeta_heavy > zeta, "Heavier damping gives larger zeta");

    // For heavier damping, approximate formula is less accurate
    let rel_diff_heavy: f64 = (zeta_heavy - zeta_heavy_approx).abs() / zeta_heavy;
    assert!(
        rel_diff_heavy > rel_diff,
        "Approximation error increases with damping"
    );

    // Damping ratio must be in [0, 1) for physical systems
    assert!(zeta > 0.0 && zeta < 1.0, "Damping ratio in valid range");
    assert!(zeta_heavy > 0.0 && zeta_heavy < 1.0, "Heavy damping ratio in valid range");
}

// ================================================================
// 5. Rayleigh Wave Velocity Approximation
// ================================================================
//
// Rayleigh waves propagate along the surface of an elastic half-space.
// The Rayleigh wave velocity V_R is related to the shear wave velocity
// V_s by the approximate formula (valid for 0 <= nu <= 0.5):
//
//   V_R / V_s ~ (0.862 + 1.14 * nu) / (1 + nu)
//
// This is an engineering approximation accurate to within about 1%
// for the full range of Poisson's ratio.
//
// Other velocity relationships:
//   V_p = V_s * sqrt((2-2*nu)/(1-2*nu))    (P-wave velocity)
//   V_R < V_s < V_p
//
// Example:
//   V_s = 300 m/s, nu = 0.30
//   V_R = 300 * (0.862 + 1.14*0.30) / (1 + 0.30)
//       = 300 * (0.862 + 0.342) / 1.30
//       = 300 * 1.204 / 1.30
//       = 300 * 0.9262
//       = 277.85 m/s

#[test]
fn validation_soil_dyn_ext_rayleigh_wave_velocity() {
    let vs: f64 = 300.0;      // m/s, shear wave velocity
    let nu: f64 = 0.30;       // Poisson's ratio

    // Rayleigh wave velocity approximation
    let vr: f64 = vs * (0.862 + 1.14 * nu) / (1.0 + nu);
    let vr_expected: f64 = 300.0 * (0.862 + 1.14 * 0.30) / (1.0 + 0.30);
    assert_close(vr, vr_expected, 0.01, "Rayleigh wave velocity V_R");

    // V_R / V_s ratio
    let ratio: f64 = vr / vs;
    let ratio_expected: f64 = (0.862 + 1.14 * nu) / (1.0 + nu);
    assert_close(ratio, ratio_expected, 0.01, "V_R/V_s ratio");

    // V_R should be less than V_s
    assert!(vr < vs, "V_R < V_s");

    // P-wave velocity
    let vp: f64 = vs * ((2.0 - 2.0 * nu) / (1.0 - 2.0 * nu)).sqrt();
    let vp_inner: f64 = (2.0 - 2.0 * nu) / (1.0 - 2.0 * nu);
    let vp_expected: f64 = vs * vp_inner.sqrt();
    assert_close(vp, vp_expected, 0.01, "P-wave velocity V_p");

    // Ordering: V_R < V_s < V_p
    assert!(vr < vs, "V_R < V_s");
    assert!(vs < vp, "V_s < V_p");

    // V_p / V_s ratio
    let vp_vs_ratio: f64 = vp / vs;
    let vp_vs_expected: f64 = ((2.0 - 2.0 * nu) / (1.0 - 2.0 * nu)).sqrt();
    assert_close(vp_vs_ratio, vp_vs_expected, 0.01, "V_p/V_s ratio");

    // For nu = 0.25 (common for soil): V_p/V_s = sqrt(3) ~ 1.732
    let nu_025: f64 = 0.25;
    let vp_vs_025: f64 = ((2.0 - 2.0 * nu_025) / (1.0 - 2.0 * nu_025)).sqrt();
    assert_close(vp_vs_025, 3.0_f64.sqrt(), 0.01, "V_p/V_s = sqrt(3) for nu=0.25");

    // As nu -> 0.5 (incompressible), V_p -> infinity, V_R -> V_s
    let nu_high: f64 = 0.48;
    let vr_high: f64 = vs * (0.862 + 1.14 * nu_high) / (1.0 + nu_high);
    let ratio_high: f64 = vr_high / vs;
    assert!(ratio_high > ratio, "V_R/V_s increases as nu -> 0.5");

    // For nu = 0: V_R/V_s ~ 0.862
    let nu_zero: f64 = 0.0;
    let ratio_zero: f64 = (0.862 + 1.14 * nu_zero) / (1.0 + nu_zero);
    assert_close(ratio_zero, 0.862, 0.01, "V_R/V_s ~ 0.862 for nu=0");

    // V_R always in range [0.862*Vs, ~0.955*Vs]
    assert!(vr > 0.86 * vs, "V_R > 0.86*V_s");
    assert!(vr < 0.96 * vs, "V_R < 0.96*V_s");
}

// ================================================================
// 6. Shear Modulus Degradation: G/Gmax vs Shear Strain
// ================================================================
//
// Seed & Idriss (1970) showed that the shear modulus of soils
// degrades with increasing cyclic shear strain. A widely-used
// hyperbolic model is:
//
//   G / Gmax = 1 / (1 + gamma / gamma_ref)
//
// where gamma_ref is the reference shear strain (strain at which
// G/Gmax = 0.5). Typical gamma_ref for sand ~ 0.04% = 4e-4.
//
// Seed & Idriss (1970) average curve for sand:
//   At gamma = 1e-4 (0.01%):   G/Gmax ~ 0.80
//   At gamma = 1e-3 (0.1%):    G/Gmax ~ 0.50
//   At gamma = 1e-2 (1%):      G/Gmax ~ 0.10
//
// For the hyperbolic model with gamma_ref = 1.25e-4:
//   G/Gmax(1e-4) = 1/(1 + 1e-4/1.25e-4) = 1/1.8 = 0.5556
//
// Using gamma_ref = 5e-4 (closer to sand average):
//   G/Gmax(1e-4) = 1/(1 + 0.2) = 0.833
//   G/Gmax(5e-4) = 1/(1 + 1.0) = 0.500
//   G/Gmax(1e-2) = 1/(1 + 20) = 0.0476

#[test]
fn validation_soil_dyn_ext_shear_modulus_degradation() {
    // Hyperbolic model parameters
    let gamma_ref: f64 = 5.0e-4;   // reference strain (0.05%)

    // G/Gmax at various strain levels
    let gamma1: f64 = 1.0e-6;  // very small strain (0.0001%)
    let gamma2: f64 = 1.0e-4;  // small strain (0.01%)
    let gamma3: f64 = 5.0e-4;  // medium strain (0.05%)
    let gamma4: f64 = 1.0e-3;  // moderate strain (0.1%)
    let gamma5: f64 = 1.0e-2;  // large strain (1%)

    let g_ratio1: f64 = 1.0 / (1.0 + gamma1 / gamma_ref);
    let g_ratio2: f64 = 1.0 / (1.0 + gamma2 / gamma_ref);
    let g_ratio3: f64 = 1.0 / (1.0 + gamma3 / gamma_ref);
    let g_ratio4: f64 = 1.0 / (1.0 + gamma4 / gamma_ref);
    let g_ratio5: f64 = 1.0 / (1.0 + gamma5 / gamma_ref);

    // At very small strain, G ~ Gmax
    assert_close(g_ratio1, 1.0, 0.01, "G/Gmax ~ 1.0 at very small strain");

    // At reference strain, G/Gmax = 0.5 (definition)
    assert_close(g_ratio3, 0.5, 0.01, "G/Gmax = 0.5 at reference strain");

    // Verify specific values
    assert_close(g_ratio2, 1.0 / 1.2, 0.01, "G/Gmax at 0.01% strain");
    assert_close(g_ratio4, 1.0 / 3.0, 0.02, "G/Gmax at 0.1% strain");
    assert_close(g_ratio5, 1.0 / 21.0, 0.02, "G/Gmax at 1% strain");

    // Monotonic degradation: G/Gmax decreases with increasing strain
    assert!(g_ratio1 > g_ratio2, "Degradation: small > medium strain");
    assert!(g_ratio2 > g_ratio3, "Degradation: medium > reference strain");
    assert!(g_ratio3 > g_ratio4, "Degradation: reference > moderate strain");
    assert!(g_ratio4 > g_ratio5, "Degradation: moderate > large strain");

    // Equivalent damping ratio (Hardin & Drnevich approximation):
    // D/Dmax = 1 - G/Gmax
    // where Dmax ~ 25% for sand
    let d_max: f64 = 0.25;
    let d_ratio3: f64 = (1.0 - g_ratio3) * d_max;
    let d_ratio5: f64 = (1.0 - g_ratio5) * d_max;
    assert!(d_ratio5 > d_ratio3, "Damping increases with strain");
    assert_close(d_ratio3, 0.5 * d_max, 0.02, "Damping at reference strain");

    // Secant shear modulus for nonlinear analysis
    let gmax: f64 = 100_000.0;  // kPa
    let g_secant: f64 = gmax * g_ratio4;
    let g_secant_expected: f64 = gmax / 3.0;
    assert_close(g_secant, g_secant_expected, 0.02, "Secant G at 0.1% strain");

    // Effective shear wave velocity at degraded modulus
    let rho: f64 = 1900.0;     // kg/m^3
    let vs_max: f64 = (gmax * 1000.0 / rho).sqrt();    // m/s (Gmax in Pa)
    let vs_degraded: f64 = vs_max * g_ratio4.sqrt();
    assert!(vs_degraded < vs_max, "Degraded Vs < Vs_max");
    assert_close(vs_degraded / vs_max, g_ratio4.sqrt(), 0.01, "Vs ratio = sqrt(G/Gmax)");
}

// ================================================================
// 7. Liquefaction CSR from Simplified Procedure
// ================================================================
//
// The Cyclic Stress Ratio (CSR) evaluates seismic shear demand
// on a soil element. Seed & Idriss (1971) simplified procedure:
//
//   CSR = 0.65 * (a_max/g) * (sigma_v / sigma_v') * r_d
//
// where:
//   a_max = peak ground acceleration (fraction of g)
//   sigma_v = total vertical stress at depth z
//   sigma_v' = effective vertical stress at depth z
//   r_d = stress reduction factor (accounts for soil deformability)
//
// Stress reduction factor (Liao & Whitman 1986):
//   r_d = 1.0 - 0.00765 * z    for z <= 9.15 m
//   r_d = 1.174 - 0.0267 * z   for 9.15 < z <= 23 m
//
// Example:
//   a_max = 0.30g, depth z = 10 m
//   gamma_total = 19 kN/m^3, GWT at 3 m depth
//   sigma_v = 19 * 10 = 190 kPa
//   u = 9.81 * (10 - 3) = 68.67 kPa
//   sigma_v' = 190 - 68.67 = 121.33 kPa
//   r_d = 1.174 - 0.0267 * 10 = 0.907
//   CSR = 0.65 * 0.30 * (190/121.33) * 0.907 = 0.277

#[test]
fn validation_soil_dyn_ext_liquefaction_csr() {
    let amax: f64 = 0.30;         // g, peak ground acceleration
    let z: f64 = 10.0;            // m, depth below ground surface
    let gamma_total: f64 = 19.0;  // kN/m^3
    let gwt: f64 = 3.0;           // m, groundwater table depth
    let gamma_w: f64 = 9.81;      // kN/m^3

    // Total vertical stress
    let sigma_v: f64 = gamma_total * z;
    assert_close(sigma_v, 190.0, 0.01, "Total vertical stress sigma_v");

    // Pore water pressure
    let u: f64 = gamma_w * (z - gwt);
    let u_expected: f64 = 9.81 * 7.0;
    assert_close(u, u_expected, 0.01, "Pore water pressure u");

    // Effective vertical stress
    let sigma_v_eff: f64 = sigma_v - u;
    let sigma_v_eff_expected: f64 = 190.0 - 9.81 * 7.0;
    assert_close(sigma_v_eff, sigma_v_eff_expected, 0.01, "Effective vertical stress sigma_v'");

    // Stress reduction factor (z > 9.15 m, use second equation)
    let rd: f64 = 1.174 - 0.0267 * z;
    let rd_expected: f64 = 1.174 - 0.267;
    assert_close(rd, rd_expected, 0.01, "Stress reduction factor r_d at 10m");
    assert!(rd > 0.0 && rd < 1.0, "r_d in valid range (0, 1)");

    // CSR
    let csr: f64 = 0.65 * amax * (sigma_v / sigma_v_eff) * rd;
    let csr_expected: f64 = 0.65 * 0.30 * (190.0 / sigma_v_eff_expected) * rd_expected;
    assert_close(csr, csr_expected, 0.01, "CSR = 0.65*(amax/g)*(sv/sv')*rd");

    // CSR should be in reasonable range
    assert!(csr > 0.1 && csr < 0.5, "CSR in typical range");

    // Verify r_d at shallow depth (z <= 9.15 m)
    let z_shallow: f64 = 5.0;
    let rd_shallow: f64 = 1.0 - 0.00765 * z_shallow;
    let rd_shallow_expected: f64 = 1.0 - 0.03825;
    assert_close(rd_shallow, rd_shallow_expected, 0.01, "r_d at 5m (shallow formula)");

    // Continuity check at z = 9.15 m: both formulas should give same value
    let z_boundary: f64 = 9.15;
    let rd_shallow_at_boundary: f64 = 1.0 - 0.00765 * z_boundary;
    let rd_deep_at_boundary: f64 = 1.174 - 0.0267 * z_boundary;
    assert_close(rd_shallow_at_boundary, rd_deep_at_boundary, 0.02, "r_d continuity at 9.15m");

    // Higher PGA increases CSR proportionally
    let amax_high: f64 = 0.50;
    let csr_high: f64 = 0.65 * amax_high * (sigma_v / sigma_v_eff) * rd;
    assert_close(csr_high / csr, amax_high / amax, 0.01, "CSR proportional to PGA");

    // Magnitude scaling factor (Idriss 1999): MSF = 10^2.24 / Mw^2.56
    let mw: f64 = 7.5;   // reference magnitude
    let msf_75: f64 = 10.0_f64.powf(2.24) / mw.powf(2.56);
    assert_close(msf_75, 1.0, 0.05, "MSF ~ 1.0 for M = 7.5 (reference)");

    let mw_small: f64 = 6.0;
    let msf_small: f64 = 10.0_f64.powf(2.24) / mw_small.powf(2.56);
    assert!(msf_small > 1.0, "MSF > 1 for M < 7.5 (fewer cycles)");
}

// ================================================================
// 8. Dynamic Bearing Capacity Enhancement
// ================================================================
//
// Under rapid (dynamic/impact) loading, the bearing capacity of soil
// is enhanced relative to static conditions due to strain-rate effects
// on soil shear strength and inertial effects.
//
// A simplified engineering approach (Vesic 1973, Hanna & Meyerhof 1981):
//
//   qu_dynamic = qu_static * (1 + alpha * V / V_ref)
//
// where:
//   V = loading velocity (m/s)
//   V_ref = reference velocity ~ 1.0 m/s
//   alpha = rate enhancement factor:
//     - Clays: alpha ~ 0.2 - 0.5 (significant strain-rate effect)
//     - Sands: alpha ~ 0.05 - 0.15 (smaller effect, primarily inertial)
//
// Static bearing capacity (Terzaghi, strip footing):
//   qu_static = c * Nc + q * Nq + 0.5 * gamma * B * Ngamma
//
// Example (clay):
//   c = 50 kPa, phi = 0 (undrained), gamma = 18 kN/m^3, B = 2 m, Df = 1.5 m
//   Nc = 5.14 (phi=0), Nq = 1.0, Ngamma = 0.0
//   q = gamma * Df = 18 * 1.5 = 27 kPa
//   qu_static = 50*5.14 + 27*1.0 + 0 = 284 kPa
//   V = 0.5 m/s, alpha = 0.3
//   qu_dynamic = 284 * (1 + 0.3 * 0.5/1.0) = 284 * 1.15 = 326.6 kPa

#[test]
fn validation_soil_dyn_ext_dynamic_bearing_capacity() {
    // Undrained clay parameters
    let c: f64 = 50.0;            // kPa, undrained shear strength
    let gamma: f64 = 18.0;       // kN/m^3, unit weight
    let b: f64 = 2.0;            // m, footing width (strip)
    let df: f64 = 1.5;           // m, embedment depth
    let q: f64 = gamma * df;     // overburden pressure

    // Bearing capacity factors for phi = 0 (undrained)
    let nc: f64 = 5.14;          // Prandtl solution for phi = 0
    let nq: f64 = 1.0;           // phi = 0 -> Nq = 1
    let n_gamma: f64 = 0.0;      // phi = 0 -> Ngamma = 0

    // Static bearing capacity
    let qu_static: f64 = c * nc + q * nq + 0.5 * gamma * b * n_gamma;
    let qu_static_expected: f64 = 50.0 * 5.14 + 27.0 * 1.0 + 0.0;
    assert_close(qu_static, qu_static_expected, 0.01, "Static bearing capacity qu_static");
    assert_close(qu_static, 284.0, 0.01, "qu_static numerical value");

    // Dynamic enhancement
    let alpha: f64 = 0.30;       // rate enhancement factor for clay
    let v: f64 = 0.5;            // m/s, loading velocity
    let v_ref: f64 = 1.0;        // m/s, reference velocity

    let enhancement: f64 = 1.0 + alpha * v / v_ref;
    let qu_dynamic: f64 = qu_static * enhancement;
    let qu_dynamic_expected: f64 = 284.0 * (1.0 + 0.3 * 0.5 / 1.0);
    assert_close(qu_dynamic, qu_dynamic_expected, 0.01, "Dynamic bearing capacity qu_dynamic");
    assert_close(enhancement, 1.15, 0.01, "Enhancement factor = 1.15");

    // Dynamic capacity exceeds static
    assert!(qu_dynamic > qu_static, "Dynamic > static bearing capacity");

    // Higher velocity gives higher enhancement
    let v_high: f64 = 2.0;
    let enhancement_high: f64 = 1.0 + alpha * v_high / v_ref;
    let qu_dynamic_high: f64 = qu_static * enhancement_high;
    assert!(qu_dynamic_high > qu_dynamic, "Higher velocity -> higher capacity");

    // Zero velocity recovers static case
    let enhancement_zero: f64 = 1.0 + alpha * 0.0 / v_ref;
    assert_close(enhancement_zero, 1.0, 0.01, "Zero velocity -> static case");

    // Sand has smaller enhancement factor
    let alpha_sand: f64 = 0.10;
    let enhancement_sand: f64 = 1.0 + alpha_sand * v / v_ref;
    assert!(enhancement_sand < enhancement, "Sand enhancement < clay enhancement");

    // Factor of safety comparison
    let q_applied: f64 = 150.0;  // kPa, applied pressure
    let fs_static: f64 = qu_static / q_applied;
    let fs_dynamic: f64 = qu_dynamic / q_applied;
    assert_close(fs_static, 284.0 / 150.0, 0.01, "Static factor of safety");
    assert!(fs_dynamic > fs_static, "Dynamic FS > static FS");

    // Verify bearing capacity factors for a frictional soil (phi = 30 deg)
    // to demonstrate the general formula works for drained conditions too
    let phi_deg: f64 = 30.0;
    let phi: f64 = phi_deg * PI / 180.0;
    let nq_phi: f64 = (PI * phi.tan()).exp() * (PI / 4.0 + phi / 2.0).tan().powi(2);
    let nc_phi: f64 = (nq_phi - 1.0) / phi.tan();
    let n_gamma_phi: f64 = 2.0 * (nq_phi + 1.0) * phi.tan();

    // Standard values for phi = 30: Nq ~ 18.4, Nc ~ 30.1, Ngamma ~ 22.4
    assert_close(nq_phi, 18.401, 0.02, "Nq for phi=30");
    assert_close(nc_phi, 30.14, 0.02, "Nc for phi=30");
    assert!(n_gamma_phi > 15.0 && n_gamma_phi < 30.0, "Ngamma for phi=30 in expected range");

    // Drained dynamic bearing capacity
    let c_drained: f64 = 10.0;   // kPa, effective cohesion
    let qu_static_drained: f64 = c_drained * nc_phi + q * nq_phi + 0.5 * gamma * b * n_gamma_phi;
    let qu_dyn_drained: f64 = qu_static_drained * (1.0 + alpha_sand * v / v_ref);
    assert!(qu_dyn_drained > qu_static_drained, "Dynamic enhancement for drained case");
}
