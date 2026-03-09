/// Validation: Creep and Shrinkage of Concrete
///
/// References:
///   - EN 1992-1-1:2004 §3.1.4 and Annex B: Creep and shrinkage
///   - ACI 209R-92: Prediction of Creep, Shrinkage, and Temperature Effects
///   - fib Model Code 2010: Chapter 5.1 (Creep and shrinkage)
///   - Bazant & Baweja: B3 Model for creep and shrinkage
///   - Gilbert & Ranzi: "Time-Dependent Behaviour of Concrete Structures"
///
/// Tests verify creep coefficients, shrinkage strain, effective modulus,
/// and time-dependent deformation predictions.

// ================================================================
// 1. EC2 Annex B Creep Coefficient — Indoor Environment
// ================================================================
//
// EN 1992-1-1:2004 Annex B, Eq. B.1–B.9.
//
// Creep coefficient: φ(t,t0) = φ0 × βc(t,t0)
//
// φ0 = φ_RH × β(fcm) × β(t0)
//
// For fcm ≤ 35 MPa:
//   φ_RH = [1 + (1 − RH/100) / (0.1 × h0^(1/3))] × α1
//
// where α1 = (35/fcm)^0.7 for fcm > 35, else α1 = 1.0
//
// Parameters:
//   RH = 50% (indoor), h0 = 200 mm (notional size), fcm = 38 MPa (C30/37)
//   t0 = 28 days (loading age)
//
// β(fcm) = 16.8 / √fcm = 16.8 / √38 = 2.725
// β(t0)  = 1 / (0.1 + t0^0.20) = 1 / (0.1 + 28^0.20)
//         = 1 / (0.1 + 1.952) = 1 / 2.052 = 0.4873
//
// For fcm = 38 > 35: α1 = (35/38)^0.7 = 0.9407
//   φ_RH = [1 + (1 − 0.50) / (0.1 × 200^(1/3))] × 0.9407
//        = [1 + 0.50 / (0.1 × 5.848)] × 0.9407
//        = [1 + 0.50 / 0.5848] × 0.9407
//        = [1 + 0.8550] × 0.9407
//        = 1.8550 × 0.9407 = 1.7449
//
// φ0 = 1.7449 × 2.725 × 0.4873 = 2.317

#[test]
fn validation_ec2_creep_coefficient_indoor() {
    let rh: f64 = 50.0;           // percent
    let h0: f64 = 200.0;          // mm, notional size = 2*Ac/u
    let fcm: f64 = 38.0;          // MPa, mean compressive strength (C30/37)
    let t0: f64 = 28.0;           // days, loading age

    // α1: correction factor for fcm > 35 MPa
    let alpha1: f64 = if fcm > 35.0 {
        (35.0 / fcm).powf(0.7)
    } else {
        1.0
    };
    let alpha1_expected: f64 = 0.9407;
    let alpha1_err: f64 = (alpha1 - alpha1_expected).abs() / alpha1_expected;
    assert!(
        alpha1_err < 0.005,
        "α1: got {:.4}, expected {:.4}, err={:.4}%",
        alpha1, alpha1_expected, alpha1_err * 100.0
    );

    // φ_RH per EC2 Annex B Eq. B.3a (fcm > 35 uses α1 correction)
    let h0_cbrt: f64 = h0.cbrt(); // 200^(1/3) ≈ 5.848
    let phi_rh: f64 = (1.0 + (1.0 - rh / 100.0) / (0.1 * h0_cbrt)) * alpha1;

    let phi_rh_expected: f64 = 1.7449;
    let phi_rh_err: f64 = (phi_rh - phi_rh_expected).abs() / phi_rh_expected;
    assert!(
        phi_rh_err < 0.01,
        "φ_RH: got {:.4}, expected {:.4}, err={:.4}%",
        phi_rh, phi_rh_expected, phi_rh_err * 100.0
    );

    // β(fcm) = 16.8 / √fcm
    let beta_fcm: f64 = 16.8 / fcm.sqrt();
    let beta_fcm_expected: f64 = 2.725;
    let beta_fcm_err: f64 = (beta_fcm - beta_fcm_expected).abs() / beta_fcm_expected;
    assert!(
        beta_fcm_err < 0.005,
        "β(fcm): got {:.4}, expected {:.4}, err={:.4}%",
        beta_fcm, beta_fcm_expected, beta_fcm_err * 100.0
    );

    // β(t0) = 1 / (0.1 + t0^0.20)
    let beta_t0: f64 = 1.0 / (0.1 + t0.powf(0.20));
    let beta_t0_expected: f64 = 0.4873;
    let beta_t0_err: f64 = (beta_t0 - beta_t0_expected).abs() / beta_t0_expected;
    assert!(
        beta_t0_err < 0.01,
        "β(t0): got {:.4}, expected {:.4}, err={:.4}%",
        beta_t0, beta_t0_expected, beta_t0_err * 100.0
    );

    // φ0 = φ_RH × β(fcm) × β(t0)
    let phi_0: f64 = phi_rh * beta_fcm * beta_t0;
    let phi_0_expected: f64 = phi_rh_expected * beta_fcm_expected * beta_t0_expected;

    let phi_0_err: f64 = (phi_0 - phi_0_expected).abs() / phi_0_expected;
    assert!(
        phi_0_err < 0.02,
        "φ0: got {:.4}, expected {:.4}, err={:.4}%",
        phi_0, phi_0_expected, phi_0_err * 100.0
    );

    // Sanity: creep coefficient for indoor C30 at 28 days should be in [1.5, 3.5]
    assert!(
        phi_0 > 1.5 && phi_0 < 3.5,
        "φ0 = {:.3} outside plausible range [1.5, 3.5]", phi_0
    );
}

// ================================================================
// 2. EC2 Drying Shrinkage — EN 1992-1-1 §3.1.4, Eq. 3.9
// ================================================================
//
// εcd(t) = βds(t,ts) × kh × εcd,0
//
// εcd,0: basic drying shrinkage strain from Table 3.2
//   For C30/37, RH = 50%: εcd,0 ≈ 0.51 × 10⁻³
//
// kh: coefficient depending on notional size h0 (Table 3.3)
//   h0 = 200 mm → kh = 0.85
//
// βds(t,ts) = (t − ts) / [(t − ts) + 0.04 × h0^1.5]
//   where ts = drying start age
//
// At (t − ts) = 365 days:
//   βds = 365 / (365 + 0.04 × 200^1.5)
//       = 365 / (365 + 0.04 × 2828.43)
//       = 365 / (365 + 113.14)
//       = 365 / 478.14
//       = 0.7635
//
// εcd(365) = 0.7635 × 0.85 × 0.51e-3 = 0.3310 × 10⁻³

#[test]
fn validation_ec2_drying_shrinkage() {
    let h0: f64 = 200.0;                  // mm, notional size
    let eps_cd0: f64 = 0.51e-3;           // basic drying shrinkage (C30, RH=50%)
    let kh: f64 = 0.85;                   // Table 3.3 for h0=200mm
    let t_minus_ts: f64 = 365.0;          // days since drying started

    // βds(t,ts) — time development function
    let h0_pow_1_5: f64 = h0.powf(1.5);  // 200^1.5 = 2828.43
    let h0_pow_expected: f64 = 2828.43;
    let h0_pow_err: f64 = (h0_pow_1_5 - h0_pow_expected).abs() / h0_pow_expected;
    assert!(
        h0_pow_err < 0.001,
        "h0^1.5: got {:.2}, expected {:.2}", h0_pow_1_5, h0_pow_expected
    );

    let beta_ds: f64 = t_minus_ts / (t_minus_ts + 0.04 * h0_pow_1_5);
    let beta_ds_expected: f64 = 0.7635;
    let beta_ds_err: f64 = (beta_ds - beta_ds_expected).abs() / beta_ds_expected;
    assert!(
        beta_ds_err < 0.005,
        "βds: got {:.4}, expected {:.4}, err={:.4}%",
        beta_ds, beta_ds_expected, beta_ds_err * 100.0
    );

    // Drying shrinkage strain
    let eps_cd: f64 = beta_ds * kh * eps_cd0;
    let eps_cd_expected: f64 = beta_ds_expected * kh * eps_cd0;

    let eps_err: f64 = (eps_cd - eps_cd_expected).abs() / eps_cd_expected;
    assert!(
        eps_err < 0.01,
        "εcd: got {:.6e}, expected {:.6e}, err={:.4}%",
        eps_cd, eps_cd_expected, eps_err * 100.0
    );

    // Sanity: drying shrinkage at 1 year should be in [0.1e-3, 0.6e-3]
    assert!(
        eps_cd > 0.1e-3 && eps_cd < 0.6e-3,
        "εcd = {:.4e} outside plausible range", eps_cd
    );
}

// ================================================================
// 3. EC2 Autogenous Shrinkage — EN 1992-1-1 §3.1.4, Eq. 3.11/3.12
// ================================================================
//
// Autogenous shrinkage (chemical shrinkage, not dependent on RH):
//   εca(∞) = 2.5 × (fck − 10) × 10⁻⁶       [Eq. 3.12]
//   βas(t)  = 1 − exp(−0.2 × √t)             [Eq. 3.13]
//   εca(t)  = βas(t) × εca(∞)                 [Eq. 3.11]
//
// For C30 (fck = 30 MPa):
//   εca(∞) = 2.5 × (30 − 10) × 10⁻⁶ = 50 × 10⁻⁶
//
// At t = 28 days:
//   βas(28) = 1 − exp(−0.2 × √28)
//           = 1 − exp(−0.2 × 5.2915)
//           = 1 − exp(−1.0583)
//           = 1 − 0.3471
//           = 0.6529
//
//   εca(28) = 0.6529 × 50e-6 = 32.65 × 10⁻⁶

#[test]
fn validation_ec2_autogenous_shrinkage() {
    let fck: f64 = 30.0;   // MPa, characteristic compressive strength
    let t: f64 = 28.0;     // days

    // Ultimate autogenous shrinkage strain (Eq. 3.12)
    let eps_ca_inf: f64 = 2.5 * (fck - 10.0) * 1e-6;
    let eps_ca_inf_expected: f64 = 50.0e-6;
    let inf_err: f64 = (eps_ca_inf - eps_ca_inf_expected).abs() / eps_ca_inf_expected;
    assert!(
        inf_err < 1e-10,
        "εca(∞): got {:.4e}, expected {:.4e}", eps_ca_inf, eps_ca_inf_expected
    );

    // Time development function (Eq. 3.13)
    let sqrt_t: f64 = t.sqrt();               // √28 = 5.2915
    let beta_as: f64 = 1.0 - (-0.2 * sqrt_t).exp();

    let beta_as_expected: f64 = 0.6529;
    let beta_err: f64 = (beta_as - beta_as_expected).abs() / beta_as_expected;
    assert!(
        beta_err < 0.005,
        "βas(28): got {:.4}, expected {:.4}, err={:.4}%",
        beta_as, beta_as_expected, beta_err * 100.0
    );

    // Verify intermediate: exp(-1.0583)
    let exp_val: f64 = (-0.2 * sqrt_t).exp();
    let exp_expected: f64 = 0.3471;
    let exp_err: f64 = (exp_val - exp_expected).abs() / exp_expected;
    assert!(
        exp_err < 0.005,
        "exp(-0.2√28): got {:.4}, expected {:.4}", exp_val, exp_expected
    );

    // Autogenous shrinkage at t = 28 days
    let eps_ca: f64 = beta_as * eps_ca_inf;
    let eps_ca_expected: f64 = beta_as_expected * eps_ca_inf_expected;

    let eps_err: f64 = (eps_ca - eps_ca_expected).abs() / eps_ca_expected;
    assert!(
        eps_err < 0.01,
        "εca(28): got {:.4e}, expected {:.4e}, err={:.4}%",
        eps_ca, eps_ca_expected, eps_err * 100.0
    );

    // Sanity: autogenous shrinkage at 28 days should be small, < 100e-6
    assert!(
        eps_ca > 10.0e-6 && eps_ca < 100.0e-6,
        "εca(28) = {:.4e} outside plausible range", eps_ca
    );
}

// ================================================================
// 4. EC2 Effective Modulus — Age-Adjusted Effective Modulus Method
// ================================================================
//
// Simple effective modulus (EM):
//   Eeff = Ecm / (1 + φ(t,t0))
//
// Age-adjusted effective modulus method (AEMM, Trost-Bazant):
//   Eeff,adj = Ecm / (1 + χ × φ(t,t0))
//   where χ ≈ 0.8 is the aging coefficient
//
// Parameters:
//   Ecm = 33000 MPa (C30/37 per EC2 Table 3.1)
//   φ = 2.0 (typical long-term creep coefficient)
//
// Simple EM:     Eeff     = 33000 / (1 + 2.0) = 33000 / 3.0 = 11000 MPa
// AEMM (χ=0.8): Eeff,adj = 33000 / (1 + 0.8×2.0) = 33000 / 2.6 = 12692 MPa

#[test]
fn validation_ec2_effective_modulus() {
    let ecm: f64 = 33_000.0;    // MPa, mean elastic modulus (C30)
    let phi: f64 = 2.0;         // creep coefficient
    let chi: f64 = 0.8;         // aging coefficient

    // Simple effective modulus
    let e_eff_simple: f64 = ecm / (1.0 + phi);
    let e_eff_simple_expected: f64 = 11_000.0;

    let simple_err: f64 = (e_eff_simple - e_eff_simple_expected).abs() / e_eff_simple_expected;
    assert!(
        simple_err < 1e-10,
        "Simple Eeff: got {:.1}, expected {:.1}", e_eff_simple, e_eff_simple_expected
    );

    // Age-adjusted effective modulus (AEMM)
    let e_eff_aemm: f64 = ecm / (1.0 + chi * phi);
    let e_eff_aemm_expected: f64 = 33_000.0 / 2.6;  // = 12692.31

    let aemm_err: f64 = (e_eff_aemm - e_eff_aemm_expected).abs() / e_eff_aemm_expected;
    assert!(
        aemm_err < 1e-10,
        "AEMM Eeff: got {:.1}, expected {:.1}", e_eff_aemm, e_eff_aemm_expected
    );

    // Verify AEMM gives a stiffer response than simple EM (less creep reduction)
    assert!(
        e_eff_aemm > e_eff_simple,
        "AEMM Eeff ({:.0}) should be > simple Eeff ({:.0})",
        e_eff_aemm, e_eff_simple
    );

    // Verify ratio: AEMM/simple = (1+φ)/(1+χφ) = 3.0/2.6 = 1.1538
    let ratio: f64 = e_eff_aemm / e_eff_simple;
    let ratio_expected: f64 = (1.0 + phi) / (1.0 + chi * phi);
    let ratio_err: f64 = (ratio - ratio_expected).abs() / ratio_expected;
    assert!(
        ratio_err < 1e-10,
        "Eeff ratio: got {:.4}, expected {:.4}", ratio, ratio_expected
    );

    // Sanity: both effective moduli should be well below Ecm
    assert!(
        e_eff_simple < ecm && e_eff_aemm < ecm,
        "Effective moduli should be less than Ecm"
    );

    // Sanity: both should be positive and reasonable (> 5000 MPa for C30)
    assert!(
        e_eff_simple > 5_000.0 && e_eff_aemm > 5_000.0,
        "Effective moduli unreasonably low"
    );
}

// ================================================================
// 5. ACI 209R Ultimate Creep Coefficient
// ================================================================
//
// ACI 209R-92 Eq. 2-8:
//   νu = 2.35 × γ_la × γ_λ × γ_vs × γ_s × γ_ψ × γ_α
//
// Correction factors (for moist-cured concrete):
//
//   Loading age (moist cured): γ_la = 1.25 × t0^(-0.118)
//     t0 = 28 days: γ_la = 1.25 × 28^(-0.118) = 1.25 × 0.6749 = 0.8436
//
//   Ambient RH: γ_λ = 1.27 − 0.67×h   (h = RH/100, for h ≥ 0.40)
//     RH = 60%: γ_λ = 1.27 − 0.67×0.60 = 1.27 − 0.402 = 0.868
//
//   Volume/surface ratio: γ_vs = 2/3 × (1 + 1.13 × exp(−0.0213 × V/S))
//     V/S = 50 mm: γ_vs = 2/3 × (1 + 1.13 × exp(−0.0213 × 50))
//                       = 2/3 × (1 + 1.13 × exp(−1.065))
//                       = 2/3 × (1 + 1.13 × 0.3449)
//                       = 2/3 × (1 + 0.3897)
//                       = 2/3 × 1.3897
//                       = 0.9265
//
// Using only these three factors (γ_s = γ_ψ = γ_α = 1.0):
//   νu = 2.35 × 0.8436 × 0.868 × 0.9265
//      = 2.35 × 0.6789
//      = 1.595

#[test]
fn validation_aci209_creep_coefficient() {
    let nu_base: f64 = 2.35;        // ACI 209R base ultimate creep coefficient
    let t0: f64 = 28.0;             // days, loading age
    let rh: f64 = 60.0;             // percent, ambient relative humidity
    let vs: f64 = 50.0;             // mm, volume-to-surface ratio

    // γ_la: loading age factor (moist-cured)
    // γ_la = 1.25 × t0^(-0.118) = 1.25 × 28^(-0.118) = 1.25 × 0.6749 = 0.8436
    let gamma_la: f64 = 1.25 * t0.powf(-0.118);
    let gamma_la_expected: f64 = 0.8436;
    let la_err: f64 = (gamma_la - gamma_la_expected).abs() / gamma_la_expected;
    assert!(
        la_err < 0.005,
        "γ_la: got {:.4}, expected {:.4}, err={:.4}%",
        gamma_la, gamma_la_expected, la_err * 100.0
    );

    // γ_λ: ambient relative humidity factor
    let h: f64 = rh / 100.0;
    let gamma_lambda: f64 = 1.27 - 0.67 * h;
    let gamma_lambda_expected: f64 = 0.868;
    let lambda_err: f64 = (gamma_lambda - gamma_lambda_expected).abs() / gamma_lambda_expected;
    assert!(
        lambda_err < 0.005,
        "γ_λ: got {:.4}, expected {:.4}, err={:.4}%",
        gamma_lambda, gamma_lambda_expected, lambda_err * 100.0
    );

    // γ_vs: volume/surface ratio factor
    let exp_term: f64 = (-0.0213 * vs).exp();
    let gamma_vs: f64 = (2.0 / 3.0) * (1.0 + 1.13 * exp_term);
    let gamma_vs_expected: f64 = 0.9265;
    let vs_err: f64 = (gamma_vs - gamma_vs_expected).abs() / gamma_vs_expected;
    assert!(
        vs_err < 0.005,
        "γ_vs: got {:.4}, expected {:.4}, err={:.4}%",
        gamma_vs, gamma_vs_expected, vs_err * 100.0
    );

    // Verify intermediate: exp(-0.0213 × 50) = exp(-1.065) ≈ 0.3449
    let exp_expected: f64 = 0.3449;
    let exp_err: f64 = (exp_term - exp_expected).abs() / exp_expected;
    assert!(
        exp_err < 0.005,
        "exp(-1.065): got {:.4}, expected {:.4}", exp_term, exp_expected
    );

    // Other correction factors assumed unity (standard conditions)
    let gamma_s: f64 = 1.0;   // slump factor
    let gamma_psi: f64 = 1.0; // fine aggregate factor
    let gamma_alpha: f64 = 1.0; // air content factor

    // Ultimate creep coefficient
    let nu_u: f64 = nu_base * gamma_la * gamma_lambda * gamma_vs
        * gamma_s * gamma_psi * gamma_alpha;
    let nu_u_expected: f64 = nu_base * gamma_la_expected * gamma_lambda_expected
        * gamma_vs_expected;

    let nu_err: f64 = (nu_u - nu_u_expected).abs() / nu_u_expected;
    assert!(
        nu_err < 0.02,
        "νu: got {:.4}, expected {:.4}, err={:.4}%",
        nu_u, nu_u_expected, nu_err * 100.0
    );

    // Sanity: ultimate creep coefficient should be in [1.0, 4.0] for typical concrete
    assert!(
        nu_u > 1.0 && nu_u < 4.0,
        "νu = {:.3} outside plausible range [1.0, 4.0]", nu_u
    );
}

// ================================================================
// 6. ACI 209R Shrinkage Strain
// ================================================================
//
// ACI 209R-92, Eq. 2-9 (moist-cured, 7 days):
//   (εsh)u = 780 × 10⁻⁶ × γ_factors  (ultimate shrinkage)
//
// Time development (Eq. 2-9):
//   εsh(t) = [t / (35 + t)] × (εsh)u
//   where t = time after end of curing (days)
//
// Using γ_sh = 1.0 (standard conditions) for simplicity:
//   (εsh)u = 780 × 10⁻⁶
//
// At t = 365 days:
//   εsh(365) = 365 / (35 + 365) × 780e-6
//            = 365 / 400 × 780e-6
//            = 0.9125 × 780e-6
//            = 711.75 × 10⁻⁶
//
// Also verify at t = 28 days:
//   εsh(28) = 28 / (35 + 28) × 780e-6
//           = 28 / 63 × 780e-6
//           = 0.4444 × 780e-6
//           = 346.67 × 10⁻⁶

#[test]
fn validation_aci209_shrinkage_strain() {
    let eps_sh_u: f64 = 780.0e-6;   // ultimate shrinkage strain (standard conditions)
    let f_param: f64 = 35.0;        // ACI 209R time constant for moist curing (7 days)

    // Time development function: t / (f + t)
    // At t = 365 days
    let t1: f64 = 365.0;
    let time_fn_365: f64 = t1 / (f_param + t1);
    let time_fn_365_expected: f64 = 0.9125;
    let tf365_err: f64 = (time_fn_365 - time_fn_365_expected).abs() / time_fn_365_expected;
    assert!(
        tf365_err < 0.001,
        "time_fn(365): got {:.4}, expected {:.4}", time_fn_365, time_fn_365_expected
    );

    let eps_sh_365: f64 = time_fn_365 * eps_sh_u;
    let eps_sh_365_expected: f64 = time_fn_365_expected * eps_sh_u;
    let eps365_err: f64 = (eps_sh_365 - eps_sh_365_expected).abs() / eps_sh_365_expected;
    assert!(
        eps365_err < 0.005,
        "εsh(365): got {:.4e}, expected {:.4e}, err={:.4}%",
        eps_sh_365, eps_sh_365_expected, eps365_err * 100.0
    );

    // At t = 28 days
    let t2: f64 = 28.0;
    let time_fn_28: f64 = t2 / (f_param + t2);
    let time_fn_28_expected: f64 = 28.0 / 63.0;  // 0.44444
    let tf28_err: f64 = (time_fn_28 - time_fn_28_expected).abs() / time_fn_28_expected;
    assert!(
        tf28_err < 1e-10,
        "time_fn(28): got {:.6}, expected {:.6}", time_fn_28, time_fn_28_expected
    );

    let eps_sh_28: f64 = time_fn_28 * eps_sh_u;
    let eps_sh_28_expected: f64 = time_fn_28_expected * eps_sh_u;
    let eps28_err: f64 = (eps_sh_28 - eps_sh_28_expected).abs() / eps_sh_28_expected;
    assert!(
        eps28_err < 1e-10,
        "εsh(28): got {:.4e}, expected {:.4e}", eps_sh_28, eps_sh_28_expected
    );

    // Verify monotonic increase with time
    assert!(
        eps_sh_365 > eps_sh_28,
        "Shrinkage must increase with time: ε(365)={:.4e} should be > ε(28)={:.4e}",
        eps_sh_365, eps_sh_28
    );

    // Verify asymptotic behavior: εsh(t) → εsh_u as t → ∞
    let t_large: f64 = 1.0e6;
    let eps_large: f64 = (t_large / (f_param + t_large)) * eps_sh_u;
    let asymptotic_err: f64 = (eps_large - eps_sh_u).abs() / eps_sh_u;
    assert!(
        asymptotic_err < 1e-4,
        "εsh should approach (εsh)u for large t: err={:.6e}", asymptotic_err
    );

    // Sanity: shrinkage at 1 year should be in [200e-6, 800e-6]
    assert!(
        eps_sh_365 > 200.0e-6 && eps_sh_365 < 800.0e-6,
        "εsh(365) = {:.4e} outside plausible range", eps_sh_365
    );
}

// ================================================================
// 7. fib Model Code 2010 Creep — Basic + Drying Creep
// ================================================================
//
// fib MC2010 §5.1.9.4.3:
//   φ(t,t0) = φ_bc(t,t0) + φ_dc(t,t0)
//
// Basic creep:
//   φ_bc(t,t0) = β_bc(fcm) × β_bc(t,t0)
//   β_bc(fcm) = 1.8 / (fcm)^0.7          [Eq. 5.1-64]
//   β_bc(t,t0) = ln[(30/t0_adj + 0.035)² × (t − t0) + 1]  [Eq. 5.1-65]
//     (simplified: t0_adj = t0 for CEM 42.5N)
//
// Drying creep:
//   φ_dc(t,t0) = β_dc(fcm) × β(RH) × β_dc(t0) × β_dc(t,t0)
//   β_dc(fcm) = 412 / (fcm)^1.4          [Eq. 5.1-66]
//   β(RH) = (1 − RH/100) / (0.1 × (h/100)^(1/3))  [Eq. 5.1-67, h in mm]
//   β_dc(t0) = 1 / (0.1 + t0_adj^0.2)   [Eq. 5.1-68]
//   β_dc(t,t0) = [(t − t0) / (β_h + (t − t0))]^γ(t0)  [Eq. 5.1-70]
//   β_h = 1.5 × h + 250 × (35/fcm)^0.5 ≤ 1500 × (35/fcm)^0.5  [h in mm]
//   γ(t0) = 1 / (2.3 + 3.5 / √t0_adj)
//
// Parameters: fcm = 38 MPa, RH = 65%, h0 = 300 mm, t0 = 14 days, t = 10000 days

#[test]
fn validation_fib_mc2010_creep() {
    let fcm: f64 = 38.0;         // MPa
    let rh: f64 = 65.0;          // percent
    let h: f64 = 300.0;          // mm, notional size
    let t0: f64 = 14.0;          // days, loading age (adjusted = t0 for CEM 42.5N)
    let t: f64 = 10_000.0;       // days, age at evaluation
    let dt: f64 = t - t0;        // 9986 days

    // --- Basic creep ---
    // β_bc(fcm) = 1.8 / fcm^0.7
    let beta_bc_fcm: f64 = 1.8 / fcm.powf(0.7);
    let beta_bc_fcm_expected: f64 = 1.8 / 38.0_f64.powf(0.7);
    let bc_fcm_err: f64 = (beta_bc_fcm - beta_bc_fcm_expected).abs();
    assert!(
        bc_fcm_err < 1e-10,
        "β_bc(fcm): got {:.6}, expected {:.6}", beta_bc_fcm, beta_bc_fcm_expected
    );

    // β_bc(t,t0) = ln[(30/t0 + 0.035)² × dt + 1]
    let inner: f64 = 30.0 / t0 + 0.035;
    let beta_bc_t: f64 = (inner * inner * dt + 1.0).ln();

    // φ_bc = β_bc(fcm) × β_bc(t,t0)
    let phi_bc: f64 = beta_bc_fcm * beta_bc_t;

    // --- Drying creep ---
    // β_dc(fcm) = 412 / fcm^1.4
    let beta_dc_fcm: f64 = 412.0 / fcm.powf(1.4);

    // β(RH) = (1 − RH/100) / (0.1 × (h/100)^(1/3))
    // Note: h in mm, so h/100 converts to a dimensionless scale
    let beta_rh: f64 = (1.0 - rh / 100.0) / (0.1 * (h / 100.0).cbrt());

    // β_dc(t0) = 1 / (0.1 + t0^0.2)
    let beta_dc_t0: f64 = 1.0 / (0.1 + t0.powf(0.2));

    // β_h = 1.5×h + 250×(35/fcm)^0.5,  capped at 1500×(35/fcm)^0.5
    let fcm_factor: f64 = (35.0 / fcm).sqrt();
    let beta_h_uncapped: f64 = 1.5 * h + 250.0 * fcm_factor;
    let beta_h_cap: f64 = 1500.0 * fcm_factor;
    let beta_h: f64 = beta_h_uncapped.min(beta_h_cap);

    // γ(t0) = 1 / (2.3 + 3.5 / √t0)
    let gamma_t0: f64 = 1.0 / (2.3 + 3.5 / t0.sqrt());

    // β_dc(t,t0) = [dt / (β_h + dt)]^γ(t0)
    let beta_dc_t: f64 = (dt / (beta_h + dt)).powf(gamma_t0);

    // φ_dc = β_dc(fcm) × β(RH) × β_dc(t0) × β_dc(t,t0)
    let phi_dc: f64 = beta_dc_fcm * beta_rh * beta_dc_t0 * beta_dc_t;

    // Total creep coefficient
    let phi_total: f64 = phi_bc + phi_dc;

    // Verify basic creep contribution is positive and reasonable
    assert!(
        phi_bc > 0.0 && phi_bc < 5.0,
        "φ_bc = {:.4} outside plausible range [0, 5]", phi_bc
    );

    // Verify drying creep contribution is positive and reasonable
    assert!(
        phi_dc > 0.0 && phi_dc < 5.0,
        "φ_dc = {:.4} outside plausible range [0, 5]", phi_dc
    );

    // Total creep at ~27 years with early loading (t0=14) and h=300mm
    // can be high due to significant basic creep (ln term grows large) and
    // drying creep. Range [2.0, 6.0] is appropriate for these parameters.
    assert!(
        phi_total > 2.0 && phi_total < 6.0,
        "φ(10000,14) = {:.4} outside plausible range [2.0, 6.0] for fcm=38, RH=65%, t0=14",
        phi_total
    );

    // Verify β_h capping: for h=300, 1.5×300 + 250×0.9595 = 450+239.9 = 689.9
    // Cap = 1500×0.9595 = 1439.3 → uncapped value is used
    assert!(
        (beta_h - beta_h_uncapped).abs() < 1e-10,
        "β_h should not be capped for h=300: uncapped={:.1}, cap={:.1}",
        beta_h_uncapped, beta_h_cap
    );

    // Cross-check: drying creep should dominate for moderate RH (65%)
    // At very high RH, drying creep → 0, so basic creep dominates.
    // At RH=65%, both should contribute meaningfully.
    assert!(
        phi_dc > 0.3 * phi_total,
        "Drying creep ({:.3}) should be a significant fraction of total ({:.3}) at RH=65%",
        phi_dc, phi_total
    );

    // Verify γ(t0) is in a reasonable range [0.1, 0.5]
    assert!(
        gamma_t0 > 0.1 && gamma_t0 < 0.5,
        "γ(t0) = {:.4} outside expected range", gamma_t0
    );
}

// ================================================================
// 8. ACI 318-19 §24.2.4.1 — Long-Term Deflection Multiplier
// ================================================================
//
// ACI 318-19 Eq. (24.2.4.1.1):
//   λΔ = ξ / (1 + 50 × ρ')
//
// where:
//   ξ = time-dependent factor:
//       1.0 (3 months), 1.2 (6 months), 1.4 (12 months), 2.0 (5 years+)
//   ρ' = compression reinforcement ratio (As'/bd)
//
// Long-term additional deflection = λΔ × (immediate deflection from sustained load)
//
// Example:
//   ρ' = 0.005, ξ = 2.0 (5+ years):
//   λΔ = 2.0 / (1 + 50 × 0.005) = 2.0 / 1.25 = 1.60
//
// Additional checks:
//   ρ' = 0 (no compression steel): λΔ = ξ (worst case)
//   ρ' = 0.005, ξ = 1.0 (3 months): λΔ = 1.0/1.25 = 0.80

#[test]
fn validation_long_term_deflection_multiplier() {
    // ξ factors per ACI 318 Table 24.2.4.1.3
    let xi_3mo: f64 = 1.0;
    let xi_6mo: f64 = 1.2;
    let xi_12mo: f64 = 1.4;
    let xi_5yr: f64 = 2.0;

    let rho_prime: f64 = 0.005;  // compression reinforcement ratio

    // λΔ = ξ / (1 + 50ρ')
    let denom: f64 = 1.0 + 50.0 * rho_prime;
    let denom_expected: f64 = 1.25;
    let denom_err: f64 = (denom - denom_expected).abs() / denom_expected;
    assert!(
        denom_err < 1e-10,
        "denominator: got {:.4}, expected {:.4}", denom, denom_expected
    );

    // 5-year+ case
    let lambda_5yr: f64 = xi_5yr / denom;
    let lambda_5yr_expected: f64 = 1.60;
    let l5_err: f64 = (lambda_5yr - lambda_5yr_expected).abs() / lambda_5yr_expected;
    assert!(
        l5_err < 1e-10,
        "λΔ(5yr): got {:.4}, expected {:.4}", lambda_5yr, lambda_5yr_expected
    );

    // 3-month case
    let lambda_3mo: f64 = xi_3mo / denom;
    let lambda_3mo_expected: f64 = 0.80;
    let l3_err: f64 = (lambda_3mo - lambda_3mo_expected).abs() / lambda_3mo_expected;
    assert!(
        l3_err < 1e-10,
        "λΔ(3mo): got {:.4}, expected {:.4}", lambda_3mo, lambda_3mo_expected
    );

    // 6-month case
    let lambda_6mo: f64 = xi_6mo / denom;
    let lambda_6mo_expected: f64 = 1.2 / 1.25;  // = 0.96
    let l6_err: f64 = (lambda_6mo - lambda_6mo_expected).abs() / lambda_6mo_expected;
    assert!(
        l6_err < 1e-10,
        "λΔ(6mo): got {:.4}, expected {:.4}", lambda_6mo, lambda_6mo_expected
    );

    // 12-month case
    let lambda_12mo: f64 = xi_12mo / denom;
    let lambda_12mo_expected: f64 = 1.4 / 1.25;  // = 1.12
    let l12_err: f64 = (lambda_12mo - lambda_12mo_expected).abs() / lambda_12mo_expected;
    assert!(
        l12_err < 1e-10,
        "λΔ(12mo): got {:.4}, expected {:.4}", lambda_12mo, lambda_12mo_expected
    );

    // Verify monotonic increase with ξ
    assert!(
        lambda_3mo < lambda_6mo && lambda_6mo < lambda_12mo && lambda_12mo < lambda_5yr,
        "λΔ should increase monotonically with time: {:.3} < {:.3} < {:.3} < {:.3}",
        lambda_3mo, lambda_6mo, lambda_12mo, lambda_5yr
    );

    // Worst case: ρ' = 0 (no compression reinforcement)
    let rho_zero: f64 = 0.0;
    let denom_zero: f64 = 1.0 + 50.0 * rho_zero;
    let lambda_worst: f64 = xi_5yr / denom_zero;
    assert!(
        (lambda_worst - xi_5yr).abs() < 1e-10,
        "λΔ with ρ'=0 should equal ξ: got {:.4}, expected {:.4}",
        lambda_worst, xi_5yr
    );

    // Verify compression steel reduces λΔ
    assert!(
        lambda_5yr < lambda_worst,
        "Compression steel should reduce λΔ: with ρ'={:.3} → {:.3}, without → {:.3}",
        rho_prime, lambda_5yr, lambda_worst
    );

    // Application: long-term deflection
    let delta_immediate: f64 = 10.0;  // mm, immediate deflection from sustained load
    let delta_long_term: f64 = lambda_5yr * delta_immediate;
    let delta_total: f64 = delta_immediate + delta_long_term;

    // Total deflection = immediate + long-term = 10 + 16 = 26 mm
    let delta_total_expected: f64 = 26.0;
    let delta_err: f64 = (delta_total - delta_total_expected).abs() / delta_total_expected;
    assert!(
        delta_err < 1e-10,
        "Total deflection: got {:.2}, expected {:.2} mm",
        delta_total, delta_total_expected
    );
}
