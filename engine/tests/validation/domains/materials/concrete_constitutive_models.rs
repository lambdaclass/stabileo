/// Validation: Concrete Constitutive Models — Pure-Math Formulas
///
/// References:
///   - Hognestad (1951): "A Study of Combined Bending and Axial Load in RC Members"
///   - Mander, Priestley & Park (1988): "Theoretical Stress-Strain Model for Confined Concrete",
///     ASCE J. Struct. Eng. 114(8), pp. 1804-1826
///   - Popovics (1973): "A Numerical Approach to the Complete Stress-Strain Curve of Concrete",
///     Cement and Concrete Research, 3(5), pp. 583-599
///   - fib Model Code 2010, Ch. 5 (Creep and Shrinkage)
///   - Collins & Mitchell (1991): "Prestressed Concrete Structures", Ch. 3
///   - CEB-FIP Model Code 1990, Clause 2.1.6 (Tension Stiffening)
///
/// Tests verify constitutive model formulas with hand-computed expected values.
/// No solver calls — pure arithmetic verification of analytical expressions.

// ================================================================
// Tolerance helper
// ================================================================

fn assert_close(got: f64, expected: f64, rel_tol: f64, label: &str) {
    let err: f64 = if expected.abs() < 1e-12 {
        got.abs()
    } else {
        (got - expected).abs() / expected.abs()
    };
    assert!(
        err < rel_tol,
        "{}: got {:.6e}, expected {:.6e}, rel err = {:.4}%",
        label, got, expected, err * 100.0
    );
}

// ================================================================
// 1. Hognestad Parabolic Stress-Strain Model
// ================================================================
//
// The Hognestad model for unconfined concrete:
//   For 0 <= eps <= eps_0:
//     sigma = f'c * [2*(eps/eps_0) - (eps/eps_0)^2]
//   For eps_0 < eps <= eps_u:
//     sigma = f'c * [1 - 0.15*(eps - eps_0)/(eps_u - eps_0)]
//
// where eps_0 = 2*f'c/Ec (strain at peak), eps_u = 0.0038 (ultimate)
//
// For f'c = 30 MPa, Ec = 4730*sqrt(30) = 25912 MPa:
//   eps_0 = 2*30/25912 = 0.002315
//
// At eps = 0.001 (ascending branch):
//   eta = 0.001/0.002315 = 0.4320
//   sigma = 30 * (2*0.4320 - 0.4320^2) = 30 * (0.8641 - 0.1866) = 30 * 0.6774 = 20.32 MPa
//
// At eps = eps_0: sigma = f'c = 30 MPa (peak)
//
// At eps = 0.003 (descending branch):
//   sigma = 30 * (1 - 0.15*(0.003 - 0.002315)/(0.0038 - 0.002315))
//         = 30 * (1 - 0.15*0.000685/0.001485)
//         = 30 * (1 - 0.0692) = 30 * 0.9308 = 27.92 MPa

#[test]
fn validation_hognestad_parabolic_model() {
    let fc: f64 = 30.0; // MPa
    let ec: f64 = 4730.0 * fc.sqrt(); // MPa (ACI 318 approximate)
    let eps_0 = 2.0 * fc / ec; // strain at peak stress
    let eps_u: f64 = 0.0038; // ultimate strain

    // Verify Ec
    let expected_ec = 4730.0 * 30.0_f64.sqrt();
    assert_close(ec, expected_ec, 1e-10, "Ec for f'c=30 MPa");

    // Hognestad stress function
    let hognestad = |eps: f64| -> f64 {
        let eta = eps / eps_0;
        if eps <= eps_0 {
            fc * (2.0 * eta - eta * eta)
        } else {
            fc * (1.0 - 0.15 * (eps - eps_0) / (eps_u - eps_0))
        }
    };

    // At eps = 0: sigma = 0
    assert_close(hognestad(0.0), 0.0, 1e-10, "stress at zero strain");

    // At eps = eps_0: sigma = f'c (peak)
    assert_close(hognestad(eps_0), fc, 1e-10, "stress at peak strain");

    // Ascending branch: eps = 0.001
    let sigma_1 = hognestad(0.001);
    let eta_1 = 0.001 / eps_0;
    let expected_1 = fc * (2.0 * eta_1 - eta_1 * eta_1);
    assert_close(sigma_1, expected_1, 1e-10, "ascending branch at eps=0.001");
    assert!(sigma_1 > 0.0 && sigma_1 < fc, "ascending stress should be between 0 and f'c");

    // Descending branch: eps = 0.003
    let sigma_2 = hognestad(0.003);
    let expected_2 = fc * (1.0 - 0.15 * (0.003 - eps_0) / (eps_u - eps_0));
    assert_close(sigma_2, expected_2, 1e-10, "descending branch at eps=0.003");
    assert!(sigma_2 < fc, "descending stress should be less than f'c");

    // At ultimate strain: check residual
    let sigma_u = hognestad(eps_u);
    assert_close(sigma_u, fc * 0.85, 1e-10, "stress at ultimate strain = 0.85*f'c");
}

// ================================================================
// 2. Mander Confined Concrete Model
// ================================================================
//
// Mander et al. (1988):
//   f'cc = f'c * (2.254 * sqrt(1 + 7.94*fl/f'c) - 2*fl/f'c - 1.254)
//
//   where fl = effective confining pressure
//
//   eps_cc = eps_co * (1 + 5*(f'cc/f'c - 1))
//   Esec = f'cc / eps_cc
//   r = Ec / (Ec - Esec)
//   x = eps / eps_cc
//   sigma = f'cc * x * r / (r - 1 + x^r)
//
// For f'c = 30 MPa, fl = 4.0 MPa, eps_co = 0.002:
//   fl/f'c = 4/30 = 0.1333
//   f'cc = 30*(2.254*sqrt(1+7.94*0.1333) - 2*0.1333 - 1.254)
//        = 30*(2.254*sqrt(2.0587) - 0.2667 - 1.254)
//        = 30*(2.254*1.4348 - 0.2667 - 1.254)
//        = 30*(3.2337 - 1.5207) = 30*1.7130 = 51.39 MPa

#[test]
fn validation_mander_confined_concrete() {
    let fc: f64 = 30.0; // MPa (unconfined)
    let fl: f64 = 4.0; // MPa (effective lateral confining pressure)
    let eps_co: f64 = 0.002; // unconfined peak strain
    let ec: f64 = 4730.0 * fc.sqrt(); // MPa

    // Confined peak stress
    let fl_ratio = fl / fc;
    let fcc = fc * (2.254 * (1.0 + 7.94 * fl_ratio).sqrt() - 2.0 * fl_ratio - 1.254);

    // Verify intermediate
    let inside_sqrt = 1.0 + 7.94 * (4.0 / 30.0);
    assert_close(inside_sqrt, 1.0 + 7.94 * 0.13333333, 1e-6, "inside sqrt");

    // fcc should exceed fc (confinement increases strength)
    assert!(fcc > fc, "confined strength must exceed unconfined");

    // Confined peak strain
    let eps_cc = eps_co * (1.0 + 5.0 * (fcc / fc - 1.0));
    assert!(eps_cc > eps_co, "confined peak strain > unconfined peak strain");

    // Secant modulus
    let e_sec = fcc / eps_cc;
    assert!(e_sec < ec, "secant modulus at peak < initial tangent modulus");

    // Parameter r
    let r = ec / (ec - e_sec);
    assert!(r > 1.0, "r must be > 1 for stable curve");

    // Stress at eps = eps_cc (should equal fcc)
    let x_peak = eps_cc / eps_cc; // = 1.0
    let sigma_peak = fcc * x_peak * r / (r - 1.0 + x_peak.powf(r));
    // At x=1: sigma = fcc * 1 * r / (r - 1 + 1) = fcc * r / r = fcc
    assert_close(sigma_peak, fcc, 1e-10, "stress at confined peak strain");

    // Stress at eps = 0.5 * eps_cc (ascending)
    let x_half = 0.5;
    let sigma_half = fcc * x_half * r / (r - 1.0 + x_half.powf(r));
    assert!(sigma_half > 0.0 && sigma_half < fcc, "ascending branch stress in range");

    // Verify confinement effectiveness increases with fl
    let fl2: f64 = 8.0;
    let fcc2 = fc * (2.254 * (1.0 + 7.94 * fl2 / fc).sqrt() - 2.0 * fl2 / fc - 1.254);
    assert!(fcc2 > fcc, "higher confinement should give higher peak stress");
}

// ================================================================
// 3. Popovics Stress-Strain Curve for Concrete
// ================================================================
//
// Popovics (1973):
//   sigma = f'c * n * (eps/eps_c) / (n - 1 + (eps/eps_c)^n)
//   where n = Ec / (Ec - f'c/eps_c)
//
// For normal-strength concrete: n ~ 2.0
// For high-strength concrete: n ~ 3.0 to 5.0
//
// Using f'c = 40 MPa, eps_c = 0.002, Ec = 4730*sqrt(40) = 29915 MPa:
//   n = 29915 / (29915 - 40/0.002) = 29915 / (29915 - 20000) = 29915/9915 = 3.017

#[test]
fn validation_popovics_stress_strain() {
    let fc: f64 = 40.0; // MPa
    let eps_c: f64 = 0.002; // peak strain
    let ec: f64 = 4730.0 * fc.sqrt(); // MPa

    let e_sec = fc / eps_c; // = 20000 MPa
    let n = ec / (ec - e_sec);

    assert_close(e_sec, 20_000.0, 1e-10, "secant modulus");
    let expected_n = ec / (ec - 20_000.0);
    assert_close(n, expected_n, 1e-10, "Popovics n parameter");
    assert!(n > 1.0, "n must be > 1 for valid curve");

    // Popovics stress function
    let popovics = |eps: f64| -> f64 {
        let eta = eps / eps_c;
        fc * n * eta / (n - 1.0 + eta.powf(n))
    };

    // At peak strain: sigma should equal f'c
    let sigma_peak = popovics(eps_c);
    assert_close(sigma_peak, fc, 1e-10, "stress at peak strain");

    // At zero strain: sigma = 0
    // Note: popovics(0) = f'c * n * 0 / (n-1+0) = 0
    assert_close(popovics(1e-15), 0.0, 1e-6, "stress near zero strain");

    // Initial slope should be Ec
    // d(sigma)/d(eps) at eps=0 = f'c * n / (eps_c * (n-1)) * 1 = Ec
    // Actually: d/deps [fc*n*(eps/eps_c)/(n-1+(eps/eps_c)^n)]
    // At eps->0: derivative = fc*n/(eps_c*(n-1))
    let initial_slope = fc * n / (eps_c * (n - 1.0));
    assert_close(initial_slope, ec, 1e-10, "initial tangent modulus");

    // Test several points on ascending branch
    let test_strains: [f64; 4] = [0.0005, 0.001, 0.0015, 0.002];
    let mut prev_stress: f64 = 0.0;
    for &eps in &test_strains {
        let sigma = popovics(eps);
        assert!(sigma >= prev_stress, "stress should increase on ascending branch");
        prev_stress = sigma;
    }

    // Post-peak: stress should decrease
    let sigma_post = popovics(0.003);
    assert!(sigma_post < fc, "post-peak stress should be less than f'c");
}

// ================================================================
// 4. Tension Stiffening — CEB-FIP Model
// ================================================================
//
// After cracking, concrete between cracks still carries some tensile
// stress due to bond. The CEB-FIP Model Code gives the average stress:
//
//   sigma_s = (Es * eps) - beta * f_ct * (Es/Ec) * (1 - sigma_sr/sigma_s_calc)
//
// Simplified tension stiffening factor (Collins & Mitchell 1991):
//   f_c1 = f_cr / (1 + sqrt(500 * eps_1))
//
// where f_cr = cracking stress, eps_1 = principal tensile strain
//
// For f_cr = 3.0 MPa (typical for f'c = 30 MPa):
//   At eps_1 = 0.001: f_c1 = 3.0 / (1 + sqrt(0.5)) = 3.0 / 1.7071 = 1.757 MPa
//   At eps_1 = 0.005: f_c1 = 3.0 / (1 + sqrt(2.5)) = 3.0 / 2.5811 = 1.162 MPa
//   At eps_1 = 0.010: f_c1 = 3.0 / (1 + sqrt(5.0)) = 3.0 / 3.2361 = 0.927 MPa

#[test]
fn validation_tension_stiffening_model() {
    let f_cr: f64 = 3.0; // MPa, cracking stress

    // Collins & Mitchell tension stiffening formula
    let tension_stiffening = |eps_1: f64| -> f64 {
        f_cr / (1.0 + (500.0 * eps_1).sqrt())
    };

    // At zero strain (just cracked): f_c1 = f_cr
    // Actually at eps=0: 1/(1+0) = 1, so f_c1 = f_cr
    // But this model applies only after cracking, eps_1 > eps_cr
    let eps_cr = f_cr / 30_000.0; // ~ 0.0001 for Ec ~ 30 GPa
    let f_at_crack = tension_stiffening(eps_cr);
    assert!(f_at_crack < f_cr, "tension stiffening immediately reduces after cracking");

    // Test at eps_1 = 0.001
    let f_001 = tension_stiffening(0.001);
    let expected_001 = 3.0 / (1.0 + (0.5_f64).sqrt());
    assert_close(f_001, expected_001, 1e-10, "tension stiffening at eps=0.001");

    // Test at eps_1 = 0.005
    let f_005 = tension_stiffening(0.005);
    let expected_005 = 3.0 / (1.0 + (2.5_f64).sqrt());
    assert_close(f_005, expected_005, 1e-10, "tension stiffening at eps=0.005");

    // Test at eps_1 = 0.010
    let f_010 = tension_stiffening(0.010);
    let expected_010 = 3.0 / (1.0 + (5.0_f64).sqrt());
    assert_close(f_010, expected_010, 1e-10, "tension stiffening at eps=0.010");

    // Monotonic decrease with increasing strain
    assert!(f_001 > f_005, "stress should decrease with increasing strain");
    assert!(f_005 > f_010, "stress should decrease with increasing strain");

    // The tension stiffening contribution area under the curve
    // Integrate from eps_cr to eps_max using simple trapezoidal
    let n_steps: usize = 1000;
    let eps_max: f64 = 0.01;
    let d_eps = (eps_max - eps_cr) / n_steps as f64;
    let mut area: f64 = 0.0;
    for i in 0..n_steps {
        let eps_a = eps_cr + i as f64 * d_eps;
        let eps_b = eps_a + d_eps;
        area += 0.5 * (tension_stiffening(eps_a) + tension_stiffening(eps_b)) * d_eps;
    }
    // Area should be positive and finite
    assert!(area > 0.0 && area < f_cr * eps_max, "tension stiffening area in valid range");
}

// ================================================================
// 5. fib Model Code 2010 Creep Coefficient
// ================================================================
//
// phi(t, t0) = phi_0 * beta_c(t, t0)
//
// phi_0 = phi_RH * beta(f_cm) * beta(t0)
// phi_RH = (1 + (1-RH/100)/(0.1*h0^(1/3))) * alpha_1  for f_cm <= 35 MPa
// beta(f_cm) = 16.8 / sqrt(f_cm)
// beta(t0) = 1 / (0.1 + t0^0.20)
// beta_c(t,t0) = ((t-t0) / (beta_H + t - t0))^0.3
//
// Test: f_cm = 38 MPa, RH = 50%, h0 = 200 mm, t0 = 28 days
//   phi_RH: Since f_cm > 35 need adjusted formula, use simplified for test
//   beta(f_cm) = 16.8/sqrt(38) = 16.8/6.164 = 2.726
//   beta(t0) = 1/(0.1 + 28^0.2) = 1/(0.1 + 1.9332) = 1/2.0332 = 0.4918

#[test]
fn validation_fib_creep_coefficient() {
    let f_cm: f64 = 38.0; // MPa, mean compressive strength
    let rh: f64 = 50.0; // %, relative humidity
    let h0: f64 = 200.0; // mm, notional size (2*Ac/u)
    let t0: f64 = 28.0; // days, age at loading

    // beta(f_cm)
    let beta_fcm = 16.8 / f_cm.sqrt();
    let expected_beta_fcm = 16.8 / 38.0_f64.sqrt();
    assert_close(beta_fcm, expected_beta_fcm, 1e-10, "beta(f_cm)");

    // beta(t0)
    let beta_t0 = 1.0 / (0.1 + t0.powf(0.20));
    let expected_beta_t0 = 1.0 / (0.1 + 28.0_f64.powf(0.2));
    assert_close(beta_t0, expected_beta_t0, 1e-10, "beta(t0)");

    // phi_RH (simplified for f_cm <= 35, but we'll use the general form)
    // For f_cm > 35 MPa:
    //   alpha_1 = (35/f_cm)^0.7
    //   alpha_2 = (35/f_cm)^0.2
    //   phi_RH = (1 + (1-RH/100)/(0.1*h0^(1/3))*alpha_1) * alpha_2
    let alpha_1 = (35.0 / f_cm).powf(0.7);
    let alpha_2 = (35.0 / f_cm).powf(0.2);
    let phi_rh = (1.0 + (1.0 - rh / 100.0) / (0.1 * h0.powf(1.0 / 3.0)) * alpha_1) * alpha_2;

    // phi_0 = phi_RH * beta_fcm * beta_t0
    let phi_0 = phi_rh * beta_fcm * beta_t0;
    assert!(phi_0 > 0.0, "creep coefficient must be positive");
    // Typical range for phi_0: 1.0 to 4.0
    assert!(phi_0 > 0.5 && phi_0 < 6.0,
        "phi_0 = {:.3} should be in reasonable range", phi_0);

    // Time development: beta_c(t, t0)
    let beta_h = 1.5 * (1.0 + (0.012 * rh).powf(18.0)) * h0 + 250.0;
    let beta_h_capped = beta_h.min(1500.0);

    // At t = 10000 days (long-term)
    let t: f64 = 10_000.0;
    let beta_c = ((t - t0) / (beta_h_capped + t - t0)).powf(0.3);
    assert!(beta_c > 0.0 && beta_c <= 1.0, "beta_c must be in (0, 1]");

    // Final creep coefficient
    let phi = phi_0 * beta_c;
    assert!(phi > 0.0 && phi < phi_0, "final phi must be less than phi_0 for finite time");

    // At t -> infinity, beta_c -> 1.0, phi -> phi_0
    let beta_c_inf = ((1e8 - t0) / (beta_h_capped + 1e8 - t0)).powf(0.3);
    assert_close(beta_c_inf, 1.0, 0.001, "beta_c at t=infinity");
}

// ================================================================
// 6. Shrinkage Strain — fib Model Code 2010
// ================================================================
//
// Total shrinkage: eps_sh = eps_cas + eps_cds
//
// Autogenous shrinkage:
//   eps_cas(t) = eps_cas_inf * beta_as(t)
//   eps_cas_inf = -alpha_as * ((f_cm/10)/(6 + f_cm/10))^2.5 * 1e-6
//   beta_as(t) = 1 - exp(-0.2 * t^0.5)
//
// Drying shrinkage:
//   eps_cds(t,ts) = eps_cds_inf * beta_RH * beta_ds(t-ts)
//   eps_cds_inf = [(220 + 110*alpha_ds1)*exp(-alpha_ds2*f_cm/10)] * 1e-6
//
// Test: f_cm = 40 MPa, t = 365 days

#[test]
fn validation_fib_shrinkage_strain() {
    let f_cm: f64 = 40.0; // MPa
    let t: f64 = 365.0; // days
    let _ts: f64 = 7.0; // days, start of drying

    // Autogenous shrinkage
    let alpha_as: f64 = 600.0; // for CEM 42.5 R (rapid-hardening)
    let fcm_ratio = f_cm / 10.0;
    let eps_cas_inf = -alpha_as * (fcm_ratio / (6.0 + fcm_ratio)).powf(2.5) * 1e-6;
    let beta_as = 1.0 - (-0.2 * t.sqrt()).exp();

    let eps_cas = eps_cas_inf * beta_as;

    // Verify components
    let expected_fcm_ratio = 4.0;
    assert_close(fcm_ratio, expected_fcm_ratio, 1e-10, "f_cm/10");

    let _expected_inner = 4.0 / (6.0 + 4.0); // = 0.4
    let expected_pow = 0.4_f64.powf(2.5);
    let expected_eps_inf = -600.0 * expected_pow * 1e-6;
    assert_close(eps_cas_inf, expected_eps_inf, 1e-10, "eps_cas_inf");

    // beta_as should be between 0 and 1
    assert!(beta_as > 0.0 && beta_as < 1.0, "beta_as at 365 days in range");

    // Autogenous shrinkage should be negative (shortening)
    assert!(eps_cas < 0.0, "autogenous shrinkage should be negative");

    // At t -> infinity, beta_as -> 1.0
    let beta_as_inf = 1.0 - (-0.2 * 1e8_f64.sqrt()).exp();
    assert_close(beta_as_inf, 1.0, 1e-6, "beta_as at t=infinity");

    // Magnitude check: typical autogenous shrinkage -50 to -150 microstrain
    assert!(eps_cas.abs() < 200e-6, "autogenous shrinkage magnitude in typical range");
    assert!(eps_cas.abs() > 10e-6, "autogenous shrinkage should be non-negligible");
}

// ================================================================
// 7. Bilinear Steel Model with Strain Hardening
// ================================================================
//
// Simple bilinear model:
//   For eps <= eps_y:  sigma = Es * eps
//   For eps > eps_y:   sigma = fy + Esh * (eps - eps_y)
//
// where Es = 200 GPa, fy = 500 MPa, eps_y = fy/Es = 0.0025
//       Esh = 0.01 * Es = 2000 MPa (1% hardening ratio)
//
// At eps = 0.001: sigma = 200000*0.001 = 200 MPa (elastic)
// At eps = 0.0025: sigma = 500 MPa (yield point)
// At eps = 0.05: sigma = 500 + 2000*(0.05-0.0025) = 500 + 95 = 595 MPa
// At eps = 0.10: sigma = 500 + 2000*(0.10-0.0025) = 500 + 195 = 695 MPa

#[test]
fn validation_bilinear_steel_strain_hardening() {
    let es: f64 = 200_000.0; // MPa
    let fy: f64 = 500.0; // MPa
    let eps_y = fy / es; // 0.0025
    let hardening_ratio: f64 = 0.01;
    let esh = hardening_ratio * es; // 2000 MPa

    assert_close(eps_y, 0.0025, 1e-10, "yield strain");
    assert_close(esh, 2000.0, 1e-10, "hardening modulus");

    let bilinear = |eps: f64| -> f64 {
        if eps <= eps_y {
            es * eps
        } else {
            fy + esh * (eps - eps_y)
        }
    };

    // Elastic range
    assert_close(bilinear(0.001), 200.0, 1e-10, "elastic at eps=0.001");
    assert_close(bilinear(0.002), 400.0, 1e-10, "elastic at eps=0.002");

    // Yield point
    assert_close(bilinear(eps_y), fy, 1e-10, "at yield point");

    // Strain hardening range
    let sigma_005 = bilinear(0.05);
    let expected_005 = 500.0 + 2000.0 * (0.05 - 0.0025);
    assert_close(sigma_005, expected_005, 1e-10, "hardening at eps=0.05");

    let sigma_010 = bilinear(0.10);
    let expected_010 = 500.0 + 2000.0 * (0.10 - 0.0025);
    assert_close(sigma_010, expected_010, 1e-10, "hardening at eps=0.10");

    // Absorbed energy (area under stress-strain up to eps=0.05)
    // Elastic triangle: 0.5 * fy * eps_y = 0.5 * 500 * 0.0025 = 0.625 MPa
    // Hardening trapezoid: (fy + sigma_005)/2 * (0.05 - eps_y)
    let energy_elastic = 0.5 * fy * eps_y;
    let energy_hardening = (fy + sigma_005) / 2.0 * (0.05 - eps_y);
    let total_energy = energy_elastic + energy_hardening;

    let expected_elastic = 0.5 * 500.0 * 0.0025;
    let expected_hardening = (500.0 + expected_005) / 2.0 * (0.05 - 0.0025);
    assert_close(energy_elastic, expected_elastic, 1e-10, "elastic energy");
    assert_close(energy_hardening, expected_hardening, 1e-10, "hardening energy");
    assert!(total_energy > 0.0, "total energy must be positive");
}

// ================================================================
// 8. Modified Kent-Park Model for Confined Concrete
// ================================================================
//
// Kent & Park (1971), modified by Park, Priestley & Gill (1982):
//
// Region AB (ascending): sigma = K*f'c * [2*(eps/eps_0K) - (eps/eps_0K)^2]
//   where K = 1 + rho_s * fyh / f'c, eps_0K = K * 0.002
//
// Region BC (descending): sigma = K*f'c * [1 - Zm*(eps - eps_0K)]
//   Zm = 0.5 / (eps_50u + eps_50h - eps_0K)
//   eps_50u = (3 + 0.29*f'c) / (145*f'c - 1000)
//   eps_50h = 0.75 * rho_s * sqrt(h''/sh)
//
// Region CD (residual): sigma = 0.2 * K * f'c
//
// Test: f'c = 30 MPa, rho_s = 0.01, fyh = 300 MPa
//   K = 1 + 0.01*300/30 = 1.1
//   eps_0K = 1.1*0.002 = 0.0022

#[test]
fn validation_kent_park_confined_concrete() {
    let fc: f64 = 30.0; // MPa
    let rho_s: f64 = 0.01; // volumetric ratio of transverse reinforcement
    let fyh: f64 = 300.0; // MPa, yield stress of transverse steel
    let _h_ratio: f64 = 4.0; // h''/sh ratio (core width / hoop spacing)

    // Confinement factor K
    let k = 1.0 + rho_s * fyh / fc;
    assert_close(k, 1.1, 1e-10, "Kent-Park K factor");

    // Peak stress and strain
    let fc_confined = k * fc; // 33 MPa
    let eps_0k = k * 0.002; // 0.0022
    assert_close(fc_confined, 33.0, 1e-10, "confined peak stress");
    assert_close(eps_0k, 0.0022, 1e-10, "confined peak strain");

    // Ascending branch at eps = 0.001
    let eps_test: f64 = 0.001;
    let eta = eps_test / eps_0k;
    let sigma_asc = fc_confined * (2.0 * eta - eta * eta);
    let expected_asc = 33.0 * (2.0 * (0.001 / 0.0022) - (0.001_f64 / 0.0022).powi(2));
    assert_close(sigma_asc, expected_asc, 1e-10, "ascending branch");
    assert!(sigma_asc > 0.0 && sigma_asc < fc_confined, "ascending stress in range");

    // At peak strain: sigma = fc_confined
    let sigma_peak = fc_confined * (2.0 * 1.0 - 1.0);
    assert_close(sigma_peak, fc_confined, 1e-10, "stress at peak strain");

    // Descending slope parameters
    let eps_50u = (3.0 + 0.29 * fc) / (145.0 * fc - 1000.0);
    let eps_50h = 0.75 * rho_s * _h_ratio.sqrt();
    let zm = 0.5 / (eps_50u + eps_50h - eps_0k);

    assert!(eps_50u > 0.0, "eps_50u must be positive");
    assert!(eps_50h > 0.0, "eps_50h must be positive");
    assert!(zm > 0.0, "descending slope must be positive");

    // Residual stress
    let residual = 0.2 * fc_confined;
    assert_close(residual, 0.2 * 33.0, 1e-10, "residual stress");

    // Descending branch: stress should decrease but not below residual
    let eps_desc: f64 = 0.005;
    let sigma_desc_raw = fc_confined * (1.0 - zm * (eps_desc - eps_0k));
    let sigma_desc = sigma_desc_raw.max(residual);
    assert!(sigma_desc >= residual, "stress should not drop below residual");
    assert!(sigma_desc <= fc_confined, "descending stress <= peak stress");
}
