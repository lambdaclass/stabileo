/// Validation: Advanced Creep and Shrinkage Benchmarks
///
/// References:
///   - EN 1992-1-1:2004 (EC2) Annex B: Creep and shrinkage models
///   - ACI 209R-92: Prediction of Creep, Shrinkage, and Temperature Effects
///   - CEB-FIP Model Code 1990: Time-dependent behaviour of concrete
///   - ACI 318-19 §24.2.4.1: Long-term deflection multiplier
///   - Trost-Bazant: Age-adjusted effective modulus method (AEMM)
///   - PCI Design Handbook: Prestress strand relaxation
///   - Gilbert & Ranzi: "Time-Dependent Behaviour of Concrete Structures"
///
/// Tests verify creep coefficients, shrinkage strains, effective moduli,
/// strand relaxation, and long-term deflection predictions using
/// analytical formulas from standard codes and textbooks.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. EC2 Creep Coefficient phi(t,t0) — Outdoor Humid Environment
// ================================================================
//
// EN 1992-1-1:2004 Annex B, Eq. B.1-B.9.
//
// Creep coefficient: phi(t,t0) = phi_0 * beta_c(t,t0)
//
// phi_0 = phi_RH * beta(fcm) * beta(t0)
//
// For fcm > 35 MPa:
//   phi_RH = [1 + (1 - RH/100) / (0.1 * h0^(1/3)) * alpha1] * alpha2
//   alpha1 = (35/fcm)^0.7
//   alpha2 = (35/fcm)^0.2
//
// beta(fcm) = 16.8 / sqrt(fcm)
// beta(t0)  = 1 / (0.1 + t0^0.20)
//
// beta_c(t,t0) = [(t - t0) / (beta_H + t - t0)]^0.3
// beta_H = 1.5 * [1 + (0.012*RH)^18] * h0 + 250*alpha3 <= 1500*alpha3
// alpha3 = (35/fcm)^0.5
//
// Parameters:
//   RH = 80% (outdoor humid), h0 = 150 mm (thin slab), fcm = 48 MPa (C40/50)
//   t0 = 7 days (early loading), t = 10000 days (~27 years)
//
// alpha1 = (35/48)^0.7 = 0.7292^0.7 = 0.8033
// alpha2 = (35/48)^0.2 = 0.7292^0.2 = 0.9388
// alpha3 = (35/48)^0.5 = 0.8539
//
// phi_RH = [1 + (1-0.80) / (0.1 * 150^(1/3)) * 0.8033] * 0.9388
//        = [1 + 0.20 / (0.1 * 5.3133) * 0.8033] * 0.9388
//        = [1 + 0.20 / 0.5313 * 0.8033] * 0.9388
//        = [1 + 0.3024] * 0.9388
//        = 1.3024 * 0.9388
//        = 1.2228
//
// beta(fcm) = 16.8 / sqrt(48) = 16.8 / 6.9282 = 2.4249
// beta(t0) = 1 / (0.1 + 7^0.2) = 1 / (0.1 + 1.4758) = 1 / 1.5758 = 0.6346
//
// phi_0 = 1.2228 * 2.4249 * 0.6346 = 1.882
//
// beta_H = 1.5 * [1 + (0.012*80)^18] * 150 + 250 * 0.8539
//        = 1.5 * [1 + 0.96^18] * 150 + 213.5
//        = 1.5 * [1 + 0.4796] * 150 + 213.5
//        = 1.5 * 1.4796 * 150 + 213.5
//        = 332.9 + 213.5
//        = 546.4
//
// cap = 1500 * 0.8539 = 1280.8 -> uncapped
//
// beta_c = [(10000-7) / (546.4 + 10000 - 7)]^0.3
//        = [9993 / 10539.4]^0.3
//        = 0.9482^0.3
//        = 0.9840
//
// phi(t,t0) = 1.882 * 0.9840 = 1.852

#[test]
fn validation_cs_ext_1_ec2_creep_coefficient() {
    let rh: f64 = 80.0;
    let h0: f64 = 150.0;
    let fcm: f64 = 48.0;
    let t0: f64 = 7.0;
    let t: f64 = 10_000.0;

    // alpha factors for fcm > 35 MPa
    let alpha1: f64 = (35.0 / fcm).powf(0.7);
    let alpha2: f64 = (35.0 / fcm).powf(0.2);
    let alpha3: f64 = (35.0 / fcm).sqrt();

    assert_close(alpha1, 0.8033, 0.005, "alpha1 = (35/48)^0.7");
    assert_close(alpha2, 0.9388, 0.005, "alpha2 = (35/48)^0.2");
    assert_close(alpha3, 0.8539, 0.005, "alpha3 = (35/48)^0.5");

    // phi_RH per EC2 Annex B Eq. B.3b (fcm > 35)
    let h0_cbrt: f64 = h0.cbrt();
    let phi_rh: f64 = (1.0 + (1.0 - rh / 100.0) / (0.1 * h0_cbrt) * alpha1) * alpha2;

    assert_close(phi_rh, 1.2228, 0.01, "phi_RH for C40 outdoor humid");

    // beta(fcm) = 16.8 / sqrt(fcm)
    let beta_fcm: f64 = 16.8 / fcm.sqrt();
    assert_close(beta_fcm, 2.4249, 0.005, "beta(fcm) = 16.8/sqrt(48)");

    // beta(t0) = 1 / (0.1 + t0^0.20)
    let beta_t0: f64 = 1.0 / (0.1 + t0.powf(0.20));
    assert_close(beta_t0, 0.6346, 0.005, "beta(t0) = 1/(0.1 + 7^0.2)");

    // phi_0 = phi_RH * beta(fcm) * beta(t0)
    let phi_0: f64 = phi_rh * beta_fcm * beta_t0;
    assert_close(phi_0, 1.882, 0.02, "phi_0 for C40 outdoor humid");

    // beta_H
    let rh_factor: f64 = (0.012 * rh).powf(18.0);
    let beta_h_uncapped: f64 = 1.5 * (1.0 + rh_factor) * h0 + 250.0 * alpha3;
    let beta_h_cap: f64 = 1500.0 * alpha3;
    let beta_h: f64 = beta_h_uncapped.min(beta_h_cap);

    assert!(
        beta_h < beta_h_cap,
        "beta_H = {:.1} should be below cap {:.1}", beta_h, beta_h_cap
    );

    // beta_c(t,t0)
    let dt: f64 = t - t0;
    let beta_c: f64 = (dt / (beta_h + dt)).powf(0.3);

    assert_close(beta_c, 0.984, 0.01, "beta_c time development at 10000d");

    // Final creep coefficient
    let phi: f64 = phi_0 * beta_c;

    assert_close(phi, 1.852, 0.03, "phi(10000,7) EC2 C40 outdoor");

    // Sanity: creep coefficient for high-strength concrete with high RH should be moderate
    assert!(
        phi > 1.0 && phi < 3.0,
        "phi = {:.3} outside plausible range [1.0, 3.0] for C40 RH=80%", phi
    );
}

// ================================================================
// 2. ACI 209 Creep: phi(t,t0) = t^0.6 / (10 + t^0.6) * phi_u
// ================================================================
//
// ACI 209R-92 Eq. 2-7:
//   phi(t,t0) = (t - t0)^psi / (d + (t - t0)^psi) * phi_u
//
// Standard form: psi = 0.6, d = 10 (moist-cured)
//
// phi_u = 2.35 (standard conditions, no correction factors)
//
// At (t - t0) = 28 days:
//   phi(28) = 28^0.6 / (10 + 28^0.6) * 2.35
//           = 7.3841 / (10 + 7.3841) * 2.35
//           = 7.3841 / 17.3841 * 2.35
//           = 0.4248 * 2.35
//           = 0.9982
//
// At (t - t0) = 365 days:
//   phi(365) = 365^0.6 / (10 + 365^0.6) * 2.35
//            = 34.465 / (10 + 34.465) * 2.35
//            = 34.465 / 44.465 * 2.35
//            = 0.7751 * 2.35
//            = 1.8215
//
// At (t - t0) = 3650 days (~10 years):
//   phi(3650) = 3650^0.6 / (10 + 3650^0.6) * 2.35
//             = 137.21 / (10 + 137.21) * 2.35
//             = 137.21 / 147.21 * 2.35
//             = 0.9321 * 2.35
//             = 2.1904

#[test]
fn validation_cs_ext_2_aci209_creep() {
    let phi_u: f64 = 2.35;
    let psi: f64 = 0.6;
    let d: f64 = 10.0;

    // Time development function: f(t) = t^psi / (d + t^psi)
    let time_fn = |dt: f64| -> f64 {
        let t_psi = dt.powf(psi);
        t_psi / (d + t_psi)
    };

    // At 28 days
    let f_28: f64 = time_fn(28.0);
    let phi_28: f64 = f_28 * phi_u;

    let t28_psi: f64 = 28.0_f64.powf(0.6);
    assert_close(t28_psi, 7.3841, 0.005, "28^0.6");
    assert_close(f_28, 0.4248, 0.005, "time function at 28d");
    assert_close(phi_28, 0.9982, 0.01, "phi(28) ACI 209");

    // At 365 days (1 year)
    let f_365: f64 = time_fn(365.0);
    let phi_365: f64 = f_365 * phi_u;

    let t365_psi: f64 = 365.0_f64.powf(0.6);
    assert_close(t365_psi, 34.465, 0.005, "365^0.6");
    assert_close(f_365, 0.7751, 0.005, "time function at 365d");
    assert_close(phi_365, 1.8215, 0.01, "phi(365) ACI 209");

    // At 3650 days (~10 years)
    let f_3650: f64 = time_fn(3650.0);
    let phi_3650: f64 = f_3650 * phi_u;

    assert_close(f_3650, 0.9321, 0.005, "time function at 3650d");
    assert_close(phi_3650, 2.1904, 0.01, "phi(3650) ACI 209");

    // Verify monotonic increase
    assert!(
        phi_28 < phi_365 && phi_365 < phi_3650,
        "Creep must increase: {:.3} < {:.3} < {:.3}", phi_28, phi_365, phi_3650
    );

    // Verify asymptotic approach to phi_u
    // Note: with psi=0.6 and d=10, convergence is slow; at t=1e6, f ~ 0.9975
    let f_large: f64 = time_fn(1.0e10);
    let phi_large: f64 = f_large * phi_u;
    assert!(
        (phi_large - phi_u).abs() / phi_u < 0.001,
        "phi should approach phi_u={:.2} for large t, got {:.4}", phi_u, phi_large
    );

    // Sanity: creep at 1 year should be 60-90% of ultimate
    let ratio_365: f64 = phi_365 / phi_u;
    assert!(
        ratio_365 > 0.60 && ratio_365 < 0.90,
        "1-year ratio = {:.3} outside [0.60, 0.90]", ratio_365
    );
}

// ================================================================
// 3. EC2 Drying Shrinkage — Different Concrete and Humidity
// ================================================================
//
// EN 1992-1-1:2004 §3.1.4, Eq. 3.9:
//   eps_cd(t) = beta_ds(t,ts) * kh * eps_cd,0
//
// eps_cd,0: basic drying shrinkage strain from Table 3.2
//   For C50/60, RH = 80%: eps_cd,0 ~ 0.25e-3 (interpolated)
//
// kh: coefficient depending on notional size h0 (Table 3.3)
//   h0 = 100 mm -> kh = 1.00
//   h0 = 200 mm -> kh = 0.85
//   h0 = 300 mm -> kh = 0.75
//   h0 = 500 mm -> kh = 0.70
//
// beta_ds(t,ts) = (t - ts) / [(t - ts) + 0.04 * h0^1.5]
//
// Test case: C50/60, RH = 80%, h0 = 100 mm
//   eps_cd,0 = 0.25e-3 (from EC2 Table 3.2, interpolated)
//   kh = 1.00
//
// At (t - ts) = 100 days:
//   beta_ds = 100 / (100 + 0.04 * 100^1.5)
//           = 100 / (100 + 0.04 * 1000)
//           = 100 / (100 + 40)
//           = 100 / 140
//           = 0.7143
//
//   eps_cd(100) = 0.7143 * 1.00 * 0.25e-3 = 0.1786e-3
//
// At (t - ts) = 730 days (2 years):
//   beta_ds = 730 / (730 + 40)
//           = 730 / 770
//           = 0.9481
//
//   eps_cd(730) = 0.9481 * 1.00 * 0.25e-3 = 0.2370e-3

#[test]
fn validation_cs_ext_3_drying_shrinkage_ec2() {
    let h0: f64 = 100.0;
    let eps_cd0: f64 = 0.25e-3;
    let kh: f64 = 1.00;

    // beta_ds time function
    let h0_pow_1_5: f64 = h0.powf(1.5);
    assert_close(h0_pow_1_5, 1000.0, 0.001, "h0^1.5 for h0=100");

    let coeff: f64 = 0.04 * h0_pow_1_5;
    assert_close(coeff, 40.0, 0.001, "0.04 * h0^1.5");

    // At 100 days
    let dt1: f64 = 100.0;
    let beta_ds_100: f64 = dt1 / (dt1 + coeff);
    assert_close(beta_ds_100, 0.7143, 0.005, "beta_ds at 100 days");

    let eps_cd_100: f64 = beta_ds_100 * kh * eps_cd0;
    assert_close(eps_cd_100, 0.1786e-3, 0.01, "eps_cd at 100 days");

    // At 730 days (2 years)
    let dt2: f64 = 730.0;
    let beta_ds_730: f64 = dt2 / (dt2 + coeff);
    assert_close(beta_ds_730, 0.9481, 0.005, "beta_ds at 730 days");

    let eps_cd_730: f64 = beta_ds_730 * kh * eps_cd0;
    assert_close(eps_cd_730, 0.2370e-3, 0.01, "eps_cd at 730 days");

    // Verify monotonic increase
    assert!(
        eps_cd_730 > eps_cd_100,
        "Shrinkage must increase: {:.4e} > {:.4e}", eps_cd_730, eps_cd_100
    );

    // Verify kh depends on notional size (thinner = more drying)
    let kh_100: f64 = 1.00;
    let kh_200: f64 = 0.85;
    let kh_300: f64 = 0.75;
    let kh_500: f64 = 0.70;

    assert!(
        kh_100 > kh_200 && kh_200 > kh_300 && kh_300 > kh_500,
        "kh must decrease with increasing h0"
    );

    // Verify asymptotic approach: beta_ds -> 1 as t -> infinity
    let dt_large: f64 = 1.0e8;
    let beta_large: f64 = dt_large / (dt_large + coeff);
    assert!(
        (beta_large - 1.0).abs() < 1e-5,
        "beta_ds should approach 1.0 for large t, got {:.8}", beta_large
    );

    // Final drying shrinkage = kh * eps_cd,0
    let eps_cd_inf: f64 = kh * eps_cd0;
    assert_close(eps_cd_inf, 0.25e-3, 0.001, "ultimate drying shrinkage");
}

// ================================================================
// 4. EC2 Autogenous Shrinkage — High-Strength Concrete
// ================================================================
//
// EN 1992-1-1:2004 §3.1.4, Eq. 3.11-3.13:
//   eps_ca(inf) = 2.5 * (fck - 10) * 1e-6
//   beta_as(t)  = 1 - exp(-0.2 * sqrt(t))
//   eps_ca(t)   = beta_as(t) * eps_ca(inf)
//
// For C60/75 (fck = 60 MPa):
//   eps_ca(inf) = 2.5 * (60 - 10) * 1e-6 = 125e-6
//
// For C80/95 (fck = 80 MPa):
//   eps_ca(inf) = 2.5 * (80 - 10) * 1e-6 = 175e-6
//
// At t = 7 days:
//   beta_as(7) = 1 - exp(-0.2 * sqrt(7))
//              = 1 - exp(-0.2 * 2.6458)
//              = 1 - exp(-0.5292)
//              = 1 - 0.5892
//              = 0.4108
//
// At t = 90 days:
//   beta_as(90) = 1 - exp(-0.2 * sqrt(90))
//               = 1 - exp(-0.2 * 9.4868)
//               = 1 - exp(-1.8974)
//               = 1 - 0.1499
//               = 0.8501
//
// For C60 at t = 7d:  eps_ca = 0.4108 * 125e-6 = 51.35e-6
// For C60 at t = 90d: eps_ca = 0.8501 * 125e-6 = 106.3e-6

#[test]
fn validation_cs_ext_4_autogenous_shrinkage() {
    // C60/75 concrete
    let fck_60: f64 = 60.0;
    let eps_ca_inf_60: f64 = 2.5 * (fck_60 - 10.0) * 1e-6;
    assert_close(eps_ca_inf_60, 125.0e-6, 0.001, "eps_ca(inf) for C60");

    // C80/95 concrete
    let fck_80: f64 = 80.0;
    let eps_ca_inf_80: f64 = 2.5 * (fck_80 - 10.0) * 1e-6;
    assert_close(eps_ca_inf_80, 175.0e-6, 0.001, "eps_ca(inf) for C80");

    // Higher strength -> more autogenous shrinkage
    assert!(
        eps_ca_inf_80 > eps_ca_inf_60,
        "C80 autogenous shrinkage {:.4e} should exceed C60 {:.4e}",
        eps_ca_inf_80, eps_ca_inf_60
    );

    // Time development at t = 7 days
    let t7: f64 = 7.0;
    let beta_as_7: f64 = 1.0 - (-0.2 * t7.sqrt()).exp();
    assert_close(beta_as_7, 0.4108, 0.005, "beta_as at 7 days");

    // Time development at t = 90 days
    let t90: f64 = 90.0;
    let beta_as_90: f64 = 1.0 - (-0.2 * t90.sqrt()).exp();
    assert_close(beta_as_90, 0.8501, 0.005, "beta_as at 90 days");

    // Autogenous shrinkage for C60 at 7 days
    let eps_ca_7: f64 = beta_as_7 * eps_ca_inf_60;
    assert_close(eps_ca_7, 51.35e-6, 0.01, "eps_ca(7d) for C60");

    // Autogenous shrinkage for C60 at 90 days
    let eps_ca_90: f64 = beta_as_90 * eps_ca_inf_60;
    assert_close(eps_ca_90, 106.3e-6, 0.01, "eps_ca(90d) for C60");

    // Monotonic increase with time
    assert!(
        eps_ca_90 > eps_ca_7,
        "Autogenous shrinkage must increase: {:.4e} > {:.4e}", eps_ca_90, eps_ca_7
    );

    // Verify beta_as approaches 1.0 at large t
    let t_large: f64 = 10_000.0;
    let beta_large: f64 = 1.0 - (-0.2 * t_large.sqrt()).exp();
    assert!(
        (beta_large - 1.0).abs() < 1e-6,
        "beta_as should approach 1.0 at large t, got {:.8}", beta_large
    );

    // Verify autogenous shrinkage is relatively small at early age
    // At 7 days, should be < 50% of ultimate
    assert!(
        beta_as_7 < 0.50,
        "beta_as(7) = {:.4} should be < 0.50", beta_as_7
    );

    // At 90 days, should be > 80% of ultimate
    assert!(
        beta_as_90 > 0.80,
        "beta_as(90) = {:.4} should be > 0.80", beta_as_90
    );
}

// ================================================================
// 5. Effective Modulus Method (EMM) — Solver Verification
// ================================================================
//
// For long-term analysis under sustained load, concrete stiffness is
// reduced by creep. The Effective Modulus Method (EMM) replaces E_cm
// with E_eff = E_cm / (1 + phi).
//
// Simply-supported beam with UDL:
//   delta_immediate = 5*q*L^4 / (384*E_cm*I)
//   delta_long_term = 5*q*L^4 / (384*E_eff*I) = delta_immediate * (1 + phi)
//
// Parameters:
//   L = 8 m, q = -10 kN/m, E_cm = 33000 MPa (C30/37)
//   A = 0.12 m^2 (300 x 400 mm), I = 1.6e-3 m^4
//   phi = 2.5 (long-term creep coefficient)
//
// E_eff = 33000 / (1 + 2.5) = 33000 / 3.5 = 9428.6 MPa
//
// Deflection ratio: delta_long / delta_short = (1 + phi) = 3.5
//
// The solver uses E in MPa and internally multiplies by 1000 -> kN/m^2.
// delta = 5*q*L^4 / (384 * E_eff * 1000 * I)

#[test]
fn validation_cs_ext_5_effective_modulus() {
    let l: f64 = 8.0;
    let n: usize = 8;
    let q: f64 = -10.0;

    let e_cm: f64 = 33_000.0;   // MPa, C30/37
    let a: f64 = 0.12;           // m^2
    let iz: f64 = 1.6e-3;        // m^4
    let phi: f64 = 2.5;

    let e_eff: f64 = e_cm / (1.0 + phi);
    assert_close(e_eff, 9428.6, 0.001, "E_eff = E_cm/(1+phi)");

    // --- Run solver with short-term E ---
    let loads_short: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_short = make_beam(n, l, e_cm, a, iz, "pinned", Some("rollerX"), loads_short);
    let res_short = linear::solve_2d(&input_short).unwrap();

    // --- Run solver with long-term E_eff ---
    let loads_long: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_long = make_beam(n, l, e_eff, a, iz, "pinned", Some("rollerX"), loads_long);
    let res_long = linear::solve_2d(&input_long).unwrap();

    // Get midspan deflections
    let mid = n / 2 + 1;
    let d_short = res_short.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_long = res_long.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Long-term deflection should be (1 + phi) times the short-term
    let ratio = d_long / d_short;
    assert_close(ratio, 1.0 + phi, 0.02, "deflection ratio = 1+phi");

    // Verify against analytical formula
    let e_eff_kn = e_cm * 1000.0; // kN/m^2
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff_kn * iz);
    assert_close(d_short, delta_exact, 0.02, "short-term deflection vs formula");

    // Verify long-term deflection > short-term
    assert!(
        d_long > d_short,
        "Long-term deflection {:.6} must exceed short-term {:.6}",
        d_long, d_short
    );
}

// ================================================================
// 6. Age-Adjusted Effective Modulus Method (AEMM)
// ================================================================
//
// Trost-Bazant method:
//   E_eff,adj = E_cm / (1 + chi * phi)
//
// The aging coefficient chi accounts for the fact that loads applied
// gradually have less creep than loads applied all at once.
//
// Typical range: chi = 0.65 to 0.85 (often 0.8 used as default).
//
// For chi = 0.65:
//   E_eff,adj = 33000 / (1 + 0.65 * 2.5) = 33000 / 2.625 = 12571.4
//
// For chi = 0.80:
//   E_eff,adj = 33000 / (1 + 0.80 * 2.5) = 33000 / 3.0 = 11000.0
//
// For chi = 0.85:
//   E_eff,adj = 33000 / (1 + 0.85 * 2.5) = 33000 / 3.125 = 10560.0
//
// Comparison with simple EMM (chi = 1.0 effectively):
//   E_eff_simple = 33000 / (1 + 2.5) = 9428.6
//
// AEMM always gives a higher effective modulus than simple EMM:
//   E_eff,adj / E_eff = (1 + phi) / (1 + chi*phi)
//
// For chi=0.8: ratio = 3.5 / 3.0 = 1.1667
//
// Relaxation function:
//   R(t,t0) = E_cm * [1 - phi / (1 + chi*phi)]
//   For phi=2.5, chi=0.8: R = 33000 * [1 - 2.5/3.0] = 33000 * 0.1667 = 5500

#[test]
fn validation_cs_ext_6_age_adjusted_emm() {
    let e_cm: f64 = 33_000.0;
    let phi: f64 = 2.5;

    // AEMM for different chi values
    let chi_low: f64 = 0.65;
    let chi_mid: f64 = 0.80;
    let chi_high: f64 = 0.85;

    let e_aemm_low: f64 = e_cm / (1.0 + chi_low * phi);
    let e_aemm_mid: f64 = e_cm / (1.0 + chi_mid * phi);
    let e_aemm_high: f64 = e_cm / (1.0 + chi_high * phi);

    assert_close(e_aemm_low, 12571.4, 0.001, "AEMM with chi=0.65");
    assert_close(e_aemm_mid, 11000.0, 0.001, "AEMM with chi=0.80");
    assert_close(e_aemm_high, 10560.0, 0.001, "AEMM with chi=0.85");

    // Simple EMM (equivalent to chi = 1.0)
    let e_emm: f64 = e_cm / (1.0 + phi);
    assert_close(e_emm, 9428.6, 0.001, "Simple EMM");

    // AEMM always stiffer than simple EMM
    assert!(
        e_aemm_low > e_aemm_mid && e_aemm_mid > e_aemm_high && e_aemm_high > e_emm,
        "AEMM stiffness must decrease with increasing chi: {:.0} > {:.0} > {:.0} > {:.0}",
        e_aemm_low, e_aemm_mid, e_aemm_high, e_emm
    );

    // Stiffness ratio AEMM/EMM
    let ratio_mid: f64 = e_aemm_mid / e_emm;
    let ratio_expected: f64 = (1.0 + phi) / (1.0 + chi_mid * phi);
    assert_close(ratio_mid, ratio_expected, 0.001, "AEMM/EMM ratio");
    assert_close(ratio_mid, 1.1667, 0.005, "AEMM/EMM ratio numerical");

    // Relaxation function: R(t,t0) = E_cm * [1 - phi/(1 + chi*phi)]
    let r_relax: f64 = e_cm * (1.0 - phi / (1.0 + chi_mid * phi));
    assert_close(r_relax, 5500.0, 0.001, "Relaxation function R(t,t0)");

    // Verify chi bounds give reasonable modulus values
    // All effective moduli should be positive and less than E_cm
    assert!(
        e_aemm_low < e_cm && e_aemm_mid < e_cm && e_aemm_high < e_cm,
        "AEMM moduli must be less than E_cm"
    );
    assert!(
        e_aemm_low > 0.0 && e_aemm_mid > 0.0 && e_aemm_high > 0.0,
        "AEMM moduli must be positive"
    );

    // Verify relaxation function is between 0 and E_cm
    assert!(
        r_relax > 0.0 && r_relax < e_cm,
        "Relaxation function R={:.0} should be in (0, {:.0})", r_relax, e_cm
    );
}

// ================================================================
// 7. Prestress Strand Relaxation
// ================================================================
//
// Low-relaxation strand relaxation per PCI Design Handbook and
// AASHTO LRFD §5.9.3.4.2:
//
// For low-relaxation strand (Grade 270, f_pu = 1860 MPa):
//   If f_pi / f_pu >= 0.55:
//     Delta_sigma / sigma_pi = (log(t) / K) * (f_pi / f_pu - 0.55)
//
//   K = 45 for low-relaxation strand
//   K = 10 for stress-relieved strand
//
// EC2 approach (EN 1992-1-1 §3.3.2, Eq. 3.28-3.30):
//   For Class 2 (low relaxation):
//     rho_1000 = 2.5% (relaxation at 1000 hours)
//     Delta_sigma_pr / sigma_pi = 0.66 * rho_1000 * exp(9.1*mu)
//                                 * (t/1000)^(0.75*(1-mu))
//   where mu = sigma_pi / f_pk
//
// Test case (PCI approach):
//   f_pu = 1860 MPa, f_pi = 0.75 * f_pu = 1395 MPa
//   stress ratio = 0.75
//
//   At t = 1000 hours (41.7 days):
//     log10(1000) = 3.0
//     Delta_sigma / sigma_pi = (3.0 / 45) * (0.75 - 0.55)
//                             = 0.06667 * 0.20
//                             = 0.01333 = 1.333%
//
//   At t = 500000 hours (~57 years):
//     log10(500000) = 5.699
//     Delta_sigma / sigma_pi = (5.699 / 45) * (0.75 - 0.55)
//                             = 0.12664 * 0.20
//                             = 0.02533 = 2.533%

#[test]
fn validation_cs_ext_7_relaxation_prestress() {
    let f_pu: f64 = 1860.0;       // MPa, ultimate strand strength
    let f_pi: f64 = 0.75 * f_pu;  // MPa, initial prestress = 1395 MPa
    let stress_ratio: f64 = f_pi / f_pu;

    assert_close(f_pi, 1395.0, 0.001, "initial prestress");
    assert_close(stress_ratio, 0.75, 0.001, "stress ratio");

    // PCI/AASHTO low-relaxation strand relaxation
    let k_low_relax: f64 = 45.0;
    let k_stress_reliev: f64 = 10.0;

    // Relaxation at 1000 hours
    let t1: f64 = 1000.0; // hours
    let log_t1: f64 = t1.log10();
    assert_close(log_t1, 3.0, 0.001, "log10(1000)");

    let relax_1000_lr: f64 = (log_t1 / k_low_relax) * (stress_ratio - 0.55);
    assert_close(relax_1000_lr, 0.01333, 0.005, "LR relaxation at 1000h");

    // Absolute stress loss at 1000h
    let delta_sigma_1000: f64 = relax_1000_lr * f_pi;
    assert_close(delta_sigma_1000, 18.6, 0.02, "stress loss at 1000h (MPa)");

    // Relaxation at 500000 hours (~57 years)
    let t2: f64 = 500_000.0;
    let log_t2: f64 = t2.log10();
    assert_close(log_t2, 5.699, 0.005, "log10(500000)");

    let relax_500k_lr: f64 = (log_t2 / k_low_relax) * (stress_ratio - 0.55);
    assert_close(relax_500k_lr, 0.02533, 0.01, "LR relaxation at 500000h");

    // Compare low-relaxation vs stress-relieved at 1000h
    let relax_1000_sr: f64 = (log_t1 / k_stress_reliev) * (stress_ratio - 0.55);
    assert!(
        relax_1000_sr > relax_1000_lr,
        "Stress-relieved {:.4} > low-relax {:.4}", relax_1000_sr, relax_1000_lr
    );

    // Ratio should be K_LR / K_SR = 45/10 = 4.5
    let ratio: f64 = relax_1000_sr / relax_1000_lr;
    assert_close(ratio, k_low_relax / k_stress_reliev, 0.001, "SR/LR relaxation ratio");

    // Verify relaxation is small for low-relaxation strands
    assert!(
        relax_500k_lr < 0.05,
        "Low-relax strand: lifetime relaxation {:.4} should be < 5%", relax_500k_lr
    );

    // Verify no relaxation if stress ratio < 0.55
    let f_pi_low: f64 = 0.50 * f_pu;
    let ratio_low: f64 = f_pi_low / f_pu;
    let relax_low: f64 = if ratio_low >= 0.55 {
        (log_t1 / k_low_relax) * (ratio_low - 0.55)
    } else {
        0.0
    };
    assert!(
        relax_low < 1e-10,
        "No relaxation below 0.55 threshold: got {:.6}", relax_low
    );
}

// ================================================================
// 8. Long-Term Deflection Multiplier — ACI 318 with Solver Check
// ================================================================
//
// ACI 318-19 §24.2.4.1, Eq. (24.2.4.1.1):
//   lambda_delta = xi / (1 + 50 * rho')
//
// xi factors:
//   3 months  -> 1.0
//   6 months  -> 1.2
//   12 months -> 1.4
//   5+ years  -> 2.0
//
// Additional long-term deflection = lambda * immediate_sustained
// Total deflection = immediate_total + lambda * immediate_sustained
//
// Test case:
//   rho' = 0.01 (1% compression steel)
//   xi = 2.0 (5+ years)
//   lambda = 2.0 / (1 + 50*0.01) = 2.0 / 1.5 = 1.333
//
// Verify with solver: run SS beam with E and E/(1+lambda) and
// check deflection ratio.
//
// Beam: L = 6 m, q = -15 kN/m
//   E = 30000 MPa (C25/30), A = 0.075 m^2, I = 1.4063e-3 m^4
//   lambda = 1.333
//   E_long = E / (1 + lambda) = 30000 / 2.333 = 12857.1 MPa

#[test]
fn validation_cs_ext_8_long_term_deflection() {
    let rho_prime: f64 = 0.01;
    let xi_5yr: f64 = 2.0;

    // ACI multiplier
    let denom: f64 = 1.0 + 50.0 * rho_prime;
    assert_close(denom, 1.5, 0.001, "1 + 50*rho'");

    let lambda: f64 = xi_5yr / denom;
    assert_close(lambda, 1.333, 0.005, "lambda for rho'=0.01, 5yr+");

    // Different rho' values
    let rho_0: f64 = 0.0;
    let rho_005: f64 = 0.005;
    let rho_02: f64 = 0.02;

    let lambda_0: f64 = xi_5yr / (1.0 + 50.0 * rho_0);
    let lambda_005: f64 = xi_5yr / (1.0 + 50.0 * rho_005);
    let lambda_02: f64 = xi_5yr / (1.0 + 50.0 * rho_02);

    assert_close(lambda_0, 2.0, 0.001, "lambda with no compression steel");
    assert_close(lambda_005, 1.6, 0.001, "lambda with rho'=0.005");
    assert_close(lambda_02, 1.0, 0.001, "lambda with rho'=0.02");

    // Verify compression steel reduces long-term deflection
    assert!(
        lambda_0 > lambda_005 && lambda_005 > lambda && lambda > lambda_02,
        "lambda must decrease with increasing rho': {:.3} > {:.3} > {:.3} > {:.3}",
        lambda_0, lambda_005, lambda, lambda_02
    );

    // --- Solver verification ---
    // Run beam with immediate E and long-term effective E
    let l: f64 = 6.0;
    let n: usize = 8;
    let q: f64 = -15.0;
    let e_cm: f64 = 30_000.0;
    let a: f64 = 0.075;
    let iz: f64 = 1.4063e-3;

    // Effective long-term modulus using lambda as multiplier
    // delta_long = delta_short * (1 + lambda) -> E_long = E / (1 + lambda)
    let e_long: f64 = e_cm / (1.0 + lambda);
    assert_close(e_long, 12857.1, 0.005, "E_long for ACI long-term");

    // Short-term analysis
    let loads_s: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_s = make_beam(n, l, e_cm, a, iz, "pinned", Some("rollerX"), loads_s);
    let res_s = linear::solve_2d(&input_s).unwrap();

    // Long-term analysis
    let loads_l: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_l = make_beam(n, l, e_long, a, iz, "pinned", Some("rollerX"), loads_l);
    let res_l = linear::solve_2d(&input_l).unwrap();

    // Get midspan deflections
    let mid = n / 2 + 1;
    let d_short = res_s.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let d_long = res_l.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Verify deflection ratio matches (1 + lambda)
    let ratio = d_long / d_short;
    assert_close(ratio, 1.0 + lambda, 0.02, "deflection ratio = 1 + lambda");

    // Verify against hand calculation
    let e_eff_kn: f64 = e_cm * 1000.0;
    let delta_hand: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff_kn * iz);
    assert_close(d_short, delta_hand, 0.02, "short-term vs hand formula");

    // Total deflection = immediate + long-term additional
    let d_total: f64 = d_short + lambda * d_short;
    assert_close(d_total, d_long, 0.02, "total vs solver long-term deflection");
}
