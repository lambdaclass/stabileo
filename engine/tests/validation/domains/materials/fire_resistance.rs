/// Validation: Fire Resistance Design
///
/// References:
///   - EN 1991-1-2:2002: Actions on structures exposed to fire
///   - EN 1992-1-2:2004 (EC2 fire): Structural fire design — Concrete
///   - EN 1993-1-2:2005 (EC3 fire): Structural fire design — Steel
///   - ISO 834-1: Fire resistance tests — General requirements
///   - Buchanan & Abu: "Structural Design for Fire Safety" 2nd ed.
///   - Purkiss & Li: "Fire Safety Engineering Design of Structures" 3rd ed.
///
/// Tests verify standard fire curves, temperature-dependent properties,
/// and section capacity at elevated temperatures.

// ================================================================
// 1. ISO 834 Standard Fire Curve
// ================================================================
//
// The standard time-temperature curve from ISO 834-1:
//   T(t) = 20 + 345 * log10(8*t + 1)
//
// where t is in minutes and T is in degrees Celsius.
//
// Verification points:
//   t = 30 min:  T = 20 + 345*log10(241)  = 20 + 345*2.3820 = 842°C
//   t = 60 min:  T = 20 + 345*log10(481)  = 20 + 345*2.6821 = 945°C
//   t = 120 min: T = 20 + 345*log10(961)  = 20 + 345*2.9827 = 1049°C

#[test]
fn validation_iso834_standard_fire_curve() {
    // ISO 834 standard fire curve: T(t) = 20 + 345 * log10(8*t + 1)
    fn iso834_temperature(t_min: f64) -> f64 {
        20.0 + 345.0 * (8.0 * t_min + 1.0).log10()
    }

    // --- t = 30 min ---
    let t1: f64 = 30.0;
    let arg1: f64 = 8.0 * t1 + 1.0; // 241
    assert!((arg1 - 241.0).abs() < 1e-10, "8*30+1 should be 241, got {}", arg1);

    let log1: f64 = arg1.log10(); // log10(241) = 2.38202...
    let log1_expected: f64 = 2.3820;
    let log1_err: f64 = (log1 - log1_expected).abs();
    assert!(log1_err < 0.001, "log10(241): {:.6}, expected ~{}", log1, log1_expected);

    let t1_calc: f64 = iso834_temperature(t1);
    let t1_expected: f64 = 842.0;
    let t1_err: f64 = (t1_calc - t1_expected).abs() / t1_expected;
    assert!(
        t1_err < 0.01,
        "ISO 834 at 30 min: T={:.1}°C, expected={:.0}°C, err={:.2}%",
        t1_calc, t1_expected, t1_err * 100.0
    );

    // --- t = 60 min ---
    let t2: f64 = 60.0;
    let arg2: f64 = 8.0 * t2 + 1.0; // 481
    assert!((arg2 - 481.0).abs() < 1e-10, "8*60+1 should be 481, got {}", arg2);

    let log2: f64 = arg2.log10(); // log10(481) = 2.68215...
    let log2_expected: f64 = 2.6821;
    let log2_err: f64 = (log2 - log2_expected).abs();
    assert!(log2_err < 0.001, "log10(481): {:.6}, expected ~{}", log2, log2_expected);

    let t2_calc: f64 = iso834_temperature(t2);
    let t2_expected: f64 = 945.0;
    let t2_err: f64 = (t2_calc - t2_expected).abs() / t2_expected;
    assert!(
        t2_err < 0.01,
        "ISO 834 at 60 min: T={:.1}°C, expected={:.0}°C, err={:.2}%",
        t2_calc, t2_expected, t2_err * 100.0
    );

    // --- t = 120 min ---
    let t3: f64 = 120.0;
    let arg3: f64 = 8.0 * t3 + 1.0; // 961
    assert!((arg3 - 961.0).abs() < 1e-10, "8*120+1 should be 961, got {}", arg3);

    let log3: f64 = arg3.log10(); // log10(961) = 2.98272...
    let log3_expected: f64 = 2.9827;
    let log3_err: f64 = (log3 - log3_expected).abs();
    assert!(log3_err < 0.001, "log10(961): {:.6}, expected ~{}", log3, log3_expected);

    let t3_calc: f64 = iso834_temperature(t3);
    let t3_expected: f64 = 1049.0;
    let t3_err: f64 = (t3_calc - t3_expected).abs() / t3_expected;
    assert!(
        t3_err < 0.01,
        "ISO 834 at 120 min: T={:.1}°C, expected={:.0}°C, err={:.2}%",
        t3_calc, t3_expected, t3_err * 100.0
    );

    // Monotonicity: temperature must increase with time
    assert!(t2_calc > t1_calc, "T(60) > T(30): {:.1} > {:.1}", t2_calc, t1_calc);
    assert!(t3_calc > t2_calc, "T(120) > T(60): {:.1} > {:.1}", t3_calc, t2_calc);

    // Initial condition: T(0) = 20°C (ambient)
    let t0: f64 = iso834_temperature(0.0);
    assert!(
        (t0 - 20.0).abs() < 1e-10,
        "ISO 834 at t=0: T={:.4}°C, expected 20.0°C", t0
    );
}

// ================================================================
// 2. EC3 Steel Yield Strength Reduction Factor ky,theta
// ================================================================
//
// EN 1993-1-2 Table 3.1: Reduction factors for carbon steel.
// ky,theta = effective yield strength reduction factor.
//
// Tabulated values:
//   theta = 400°C: ky = 1.000
//   theta = 500°C: ky = 0.780
//   theta = 600°C: ky = 0.470
//
// Linear interpolation between tabulated points.

#[test]
fn validation_ec3_steel_reduction_factor_ky() {
    // EN 1993-1-2 Table 3.1 tabulated values for ky,theta
    // (temperature_°C, ky_theta)
    let table_ky: [(f64, f64); 12] = [
        (20.0,   1.000),
        (100.0,  1.000),
        (200.0,  1.000),
        (300.0,  1.000),
        (400.0,  1.000),
        (500.0,  0.780),
        (600.0,  0.470),
        (700.0,  0.230),
        (800.0,  0.110),
        (900.0,  0.060),
        (1000.0, 0.040),
        (1100.0, 0.020),
    ];

    // Helper: linear interpolation in the table
    fn interpolate_ky(table: &[(f64, f64)], theta: f64) -> f64 {
        for i in 0..table.len() - 1 {
            if theta >= table[i].0 && theta <= table[i + 1].0 {
                let t0: f64 = table[i].0;
                let t1: f64 = table[i + 1].0;
                let k0: f64 = table[i].1;
                let k1: f64 = table[i + 1].1;
                let frac: f64 = (theta - t0) / (t1 - t0);
                return k0 + frac * (k1 - k0);
            }
        }
        panic!("Temperature {:.0}°C out of table range", theta);
    }

    // Verify exact tabulated points
    let ky_400: f64 = interpolate_ky(&table_ky, 400.0);
    assert!(
        (ky_400 - 1.000).abs() < 1e-6,
        "ky(400°C) = {:.4}, expected 1.000", ky_400
    );

    let ky_500: f64 = interpolate_ky(&table_ky, 500.0);
    assert!(
        (ky_500 - 0.780).abs() < 1e-6,
        "ky(500°C) = {:.4}, expected 0.780", ky_500
    );

    let ky_600: f64 = interpolate_ky(&table_ky, 600.0);
    assert!(
        (ky_600 - 0.470).abs() < 1e-6,
        "ky(600°C) = {:.4}, expected 0.470", ky_600
    );

    // Verify interpolation at midpoints
    // At 450°C: midpoint between 400°C (1.0) and 500°C (0.78)
    //   ky = 1.0 + 0.5*(0.78 - 1.0) = 1.0 - 0.11 = 0.89
    let ky_450: f64 = interpolate_ky(&table_ky, 450.0);
    let ky_450_expected: f64 = 0.890;
    let ky_450_err: f64 = (ky_450 - ky_450_expected).abs();
    assert!(
        ky_450_err < 0.001,
        "ky(450°C) = {:.4}, expected {:.3} (interpolated)", ky_450, ky_450_expected
    );

    // At 550°C: midpoint between 500°C (0.78) and 600°C (0.47)
    //   ky = 0.78 + 0.5*(0.47 - 0.78) = 0.78 - 0.155 = 0.625
    let ky_550: f64 = interpolate_ky(&table_ky, 550.0);
    let ky_550_expected: f64 = 0.625;
    let ky_550_err: f64 = (ky_550 - ky_550_expected).abs();
    assert!(
        ky_550_err < 0.001,
        "ky(550°C) = {:.4}, expected {:.3} (interpolated)", ky_550, ky_550_expected
    );

    // Monotonicity: ky should decrease (or stay constant) with temperature
    for i in 0..table_ky.len() - 1 {
        let k_curr: f64 = table_ky[i].1;
        let k_next: f64 = table_ky[i + 1].1;
        assert!(
            k_next <= k_curr + 1e-10,
            "ky should decrease: ky({:.0}°C)={:.3} > ky({:.0}°C)={:.3}",
            table_ky[i + 1].0, k_next, table_ky[i].0, k_curr
        );
    }

    // At room temperature, full strength
    let ky_20: f64 = interpolate_ky(&table_ky, 20.0);
    assert!(
        (ky_20 - 1.0).abs() < 1e-10,
        "ky(20°C) should be 1.0, got {:.6}", ky_20
    );
}

// ================================================================
// 3. EC3 Steel Elastic Modulus Reduction Factor kE,theta
// ================================================================
//
// EN 1993-1-2 Table 3.1: Elastic modulus reduction.
// kE,theta = slope of linear elastic range reduction factor.
//
// Tabulated values:
//   theta = 400°C: kE = 0.700
//   theta = 500°C: kE = 0.600
//   theta = 600°C: kE = 0.310

#[test]
fn validation_ec3_steel_reduction_factor_ke() {
    // EN 1993-1-2 Table 3.1 tabulated values for kE,theta
    let table_ke: [(f64, f64); 12] = [
        (20.0,   1.000),
        (100.0,  1.000),
        (200.0,  0.900),
        (300.0,  0.800),
        (400.0,  0.700),
        (500.0,  0.600),
        (600.0,  0.310),
        (700.0,  0.130),
        (800.0,  0.090),
        (900.0,  0.0675),
        (1000.0, 0.0450),
        (1100.0, 0.0225),
    ];

    fn interpolate_ke(table: &[(f64, f64)], theta: f64) -> f64 {
        for i in 0..table.len() - 1 {
            if theta >= table[i].0 && theta <= table[i + 1].0 {
                let t0: f64 = table[i].0;
                let t1: f64 = table[i + 1].0;
                let k0: f64 = table[i].1;
                let k1: f64 = table[i + 1].1;
                let frac: f64 = (theta - t0) / (t1 - t0);
                return k0 + frac * (k1 - k0);
            }
        }
        panic!("Temperature {:.0}°C out of table range", theta);
    }

    // Verify exact tabulated points
    let ke_400: f64 = interpolate_ke(&table_ke, 400.0);
    assert!(
        (ke_400 - 0.700).abs() < 1e-6,
        "kE(400°C) = {:.4}, expected 0.700", ke_400
    );

    let ke_500: f64 = interpolate_ke(&table_ke, 500.0);
    assert!(
        (ke_500 - 0.600).abs() < 1e-6,
        "kE(500°C) = {:.4}, expected 0.600", ke_500
    );

    let ke_600: f64 = interpolate_ke(&table_ke, 600.0);
    assert!(
        (ke_600 - 0.310).abs() < 1e-6,
        "kE(600°C) = {:.4}, expected 0.310", ke_600
    );

    // Verify interpolation at midpoints
    // At 450°C: midpoint between 400°C (0.70) and 500°C (0.60)
    //   kE = 0.70 + 0.5*(0.60 - 0.70) = 0.70 - 0.05 = 0.65
    let ke_450: f64 = interpolate_ke(&table_ke, 450.0);
    let ke_450_expected: f64 = 0.650;
    let ke_450_err: f64 = (ke_450 - ke_450_expected).abs();
    assert!(
        ke_450_err < 0.001,
        "kE(450°C) = {:.4}, expected {:.3}", ke_450, ke_450_expected
    );

    // At 550°C: midpoint between 500°C (0.60) and 600°C (0.31)
    //   kE = 0.60 + 0.5*(0.31 - 0.60) = 0.60 - 0.145 = 0.455
    let ke_550: f64 = interpolate_ke(&table_ke, 550.0);
    let ke_550_expected: f64 = 0.455;
    let ke_550_err: f64 = (ke_550 - ke_550_expected).abs();
    assert!(
        ke_550_err < 0.001,
        "kE(550°C) = {:.4}, expected {:.3}", ke_550, ke_550_expected
    );

    // kE drops faster than ky in the 500-600°C range
    // At 600°C: kE=0.31 vs ky=0.47 → stiffness drops faster than strength
    let ky_600: f64 = 0.470;
    assert!(
        ke_600 < ky_600,
        "kE(600°C)={:.3} should be < ky(600°C)={:.3}: stiffness drops faster",
        ke_600, ky_600
    );

    // Monotonicity
    for i in 0..table_ke.len() - 1 {
        let k_curr: f64 = table_ke[i].1;
        let k_next: f64 = table_ke[i + 1].1;
        assert!(
            k_next <= k_curr + 1e-10,
            "kE should decrease: kE({:.0}°C)={:.4} > kE({:.0}°C)={:.4}",
            table_ke[i + 1].0, k_next, table_ke[i].0, k_curr
        );
    }
}

// ================================================================
// 4. EC3 Steel Beam Fire Capacity — Critical Temperature Method
// ================================================================
//
// EN 1993-1-2 §4.2.4: Critical temperature method for beams.
//
// For a uniformly loaded simply-supported beam:
//   mu_0 = M_Ed,fi / M_Rd = utilisation factor in fire
//
// The critical temperature theta_cr is the temperature at which
// ky(theta_cr) = mu_0 (assuming uniform temperature distribution).
//
// For mu_0 = 0.6:
//   From Table 3.1: ky(500)=0.78, ky(600)=0.47
//   Interpolate: theta_cr at ky=0.6
//   0.6 = 0.78 + (theta-500)/(600-500) * (0.47-0.78)
//   0.6 = 0.78 - 0.31*(theta-500)/100
//   (0.78-0.6)/0.31 = (theta-500)/100
//   theta-500 = 100*0.18/0.31 = 58.06
//   theta_cr = 558.06°C

#[test]
fn validation_ec3_steel_beam_fire_capacity() {
    // Steel beam properties
    let fy: f64 = 355.0;        // MPa, S355 steel
    let gamma_m0: f64 = 1.0;    // partial factor for fire (EN 1993-1-2 §2.3)
    let gamma_m_fi: f64 = 1.0;  // partial factor in fire situation
    let w_pl: f64 = 1500.0e3;   // mm^3 = 1500 cm^3, plastic section modulus

    // Moment capacity at ambient
    let m_rd: f64 = fy * w_pl / gamma_m0 / 1.0e6; // kNm
    let m_rd_expected: f64 = 355.0 * 1500.0e3 / 1.0e6; // = 532.5 kNm
    assert!(
        (m_rd - m_rd_expected).abs() < 0.1,
        "M_Rd = {:.1} kNm, expected {:.1}", m_rd, m_rd_expected
    );

    // Fire design moment (from accidental combination)
    let mu_0: f64 = 0.60; // utilisation factor
    let m_ed_fi: f64 = mu_0 * m_rd; // = 0.6 * 532.5 = 319.5 kNm
    let m_ed_fi_expected: f64 = 319.5;
    assert!(
        (m_ed_fi - m_ed_fi_expected).abs() < 0.1,
        "M_Ed,fi = {:.1} kNm, expected {:.1}", m_ed_fi, m_ed_fi_expected
    );

    // Critical temperature: find theta where ky(theta) = mu_0
    // From EN 1993-1-2 Table 3.1:
    //   ky(500) = 0.78, ky(600) = 0.47
    //   mu_0 = 0.60 falls between these
    let ky_500: f64 = 0.780;
    let ky_600: f64 = 0.470;
    let theta_500: f64 = 500.0;
    let theta_600: f64 = 600.0;

    // Linear interpolation: theta_cr where ky = mu_0
    // ky = ky_500 + (theta - 500)/(600 - 500) * (ky_600 - ky_500)
    // mu_0 = ky_500 + (theta_cr - 500)/100 * (ky_600 - ky_500)
    // (mu_0 - ky_500) / (ky_600 - ky_500) = (theta_cr - 500) / 100
    let frac: f64 = (mu_0 - ky_500) / (ky_600 - ky_500);
    let theta_cr: f64 = theta_500 + frac * (theta_600 - theta_500);

    // Step-by-step verification
    let numerator: f64 = mu_0 - ky_500; // 0.60 - 0.78 = -0.18
    let denominator: f64 = ky_600 - ky_500; // 0.47 - 0.78 = -0.31
    let frac_check: f64 = numerator / denominator; // -0.18 / -0.31 = 0.5806
    assert!(
        (frac_check - 0.5806).abs() < 0.001,
        "interpolation fraction: {:.4}, expected ~0.5806", frac_check
    );

    let theta_cr_expected: f64 = 558.06;
    let theta_err: f64 = (theta_cr - theta_cr_expected).abs() / theta_cr_expected;
    assert!(
        theta_err < 0.01,
        "theta_cr = {:.1}°C, expected ~{:.1}°C, err={:.2}%",
        theta_cr, theta_cr_expected, theta_err * 100.0
    );

    // Verify: at theta_cr, the reduced capacity equals the fire design moment
    let ky_at_cr: f64 = ky_500 + (theta_cr - theta_500) / (theta_600 - theta_500)
        * (ky_600 - ky_500);
    let m_fi_theta: f64 = ky_at_cr * fy * w_pl / gamma_m_fi / 1.0e6;
    let capacity_err: f64 = (m_fi_theta - m_ed_fi).abs() / m_ed_fi;
    assert!(
        capacity_err < 0.01,
        "M_fi,theta,Rd = {:.1} kNm, M_Ed,fi = {:.1} kNm, err={:.2}%",
        m_fi_theta, m_ed_fi, capacity_err * 100.0
    );

    // theta_cr should be between 500 and 600°C for mu_0 = 0.6
    assert!(theta_cr > 500.0 && theta_cr < 600.0,
        "theta_cr={:.1}°C should be between 500 and 600", theta_cr);

    // Higher utilisation → lower critical temperature (less fire resistance)
    let mu_high: f64 = 0.80;
    let frac_high: f64 = (mu_high - ky_500) / (ky_600 - ky_500);
    let _theta_cr_high: f64 = theta_500 + frac_high * (theta_600 - theta_500);
    // mu=0.80 > mu=0.60 → theta_cr is lower (closer to 500°C, not above)
    // Actually mu=0.80 > ky_500=0.78, so ky(theta)=0.80 is between 400 and 500°C
    // But with linear interpolation in 500-600 range, frac_high = (0.80-0.78)/(-0.31) < 0
    // This means theta_cr_high < 500°C, i.e., we need to look in the 400-500 range
    // For the purpose of this test, verify the qualitative relationship
    // with a lower mu instead.
    let mu_low: f64 = 0.50;
    let frac_low: f64 = (mu_low - ky_500) / (ky_600 - ky_500);
    let theta_cr_low: f64 = theta_500 + frac_low * (theta_600 - theta_500);
    assert!(
        theta_cr_low > theta_cr,
        "Lower utilisation ({}) should give higher theta_cr: {:.1} > {:.1}",
        mu_low, theta_cr_low, theta_cr
    );
}

// ================================================================
// 5. EC2 Concrete Strength Reduction at Elevated Temperature
// ================================================================
//
// EN 1992-1-2 Table 3.1: Reduction factor kc(theta) for concrete
// compressive strength.
//
// Siliceous aggregate concrete:
//   400°C: kc = 0.75
//   500°C: kc = 0.60
//   600°C: kc = 0.45
//
// Calcareous aggregate concrete:
//   400°C: kc = 0.75
//   500°C: kc = 0.60
//   600°C: kc = 0.45
//
// Note: siliceous and calcareous values are the same up to ~500°C,
// then diverge at higher temperatures (calcareous retains more strength).

#[test]
fn validation_ec2_concrete_strength_reduction() {
    // EN 1992-1-2 Table 3.1 — Siliceous aggregate
    let table_sil: [(f64, f64); 10] = [
        (20.0,   1.00),
        (100.0,  1.00),
        (200.0,  0.95),
        (300.0,  0.85),
        (400.0,  0.75),
        (500.0,  0.60),
        (600.0,  0.45),
        (700.0,  0.30),
        (800.0,  0.15),
        (900.0,  0.08),
    ];

    // EN 1992-1-2 Table 3.1 — Calcareous aggregate
    let table_cal: [(f64, f64); 10] = [
        (20.0,   1.00),
        (100.0,  1.00),
        (200.0,  0.97),
        (300.0,  0.91),
        (400.0,  0.85),
        (500.0,  0.74),
        (600.0,  0.60),
        (700.0,  0.43),
        (800.0,  0.27),
        (900.0,  0.15),
    ];

    fn interpolate_kc(table: &[(f64, f64)], theta: f64) -> f64 {
        for i in 0..table.len() - 1 {
            if theta >= table[i].0 && theta <= table[i + 1].0 {
                let t0: f64 = table[i].0;
                let t1: f64 = table[i + 1].0;
                let k0: f64 = table[i].1;
                let k1: f64 = table[i + 1].1;
                let frac: f64 = (theta - t0) / (t1 - t0);
                return k0 + frac * (k1 - k0);
            }
        }
        panic!("Temperature {:.0}°C out of table range", theta);
    }

    // Verify siliceous aggregate values
    let kc_sil_400: f64 = interpolate_kc(&table_sil, 400.0);
    assert!(
        (kc_sil_400 - 0.75).abs() < 1e-6,
        "kc_sil(400°C) = {:.4}, expected 0.75", kc_sil_400
    );

    let kc_sil_500: f64 = interpolate_kc(&table_sil, 500.0);
    assert!(
        (kc_sil_500 - 0.60).abs() < 1e-6,
        "kc_sil(500°C) = {:.4}, expected 0.60", kc_sil_500
    );

    let kc_sil_600: f64 = interpolate_kc(&table_sil, 600.0);
    assert!(
        (kc_sil_600 - 0.45).abs() < 1e-6,
        "kc_sil(600°C) = {:.4}, expected 0.45", kc_sil_600
    );

    // Verify calcareous aggregate values
    let kc_cal_400: f64 = interpolate_kc(&table_cal, 400.0);
    assert!(
        (kc_cal_400 - 0.85).abs() < 1e-6,
        "kc_cal(400°C) = {:.4}, expected 0.85", kc_cal_400
    );

    let kc_cal_500: f64 = interpolate_kc(&table_cal, 500.0);
    assert!(
        (kc_cal_500 - 0.74).abs() < 1e-6,
        "kc_cal(500°C) = {:.4}, expected 0.74", kc_cal_500
    );

    let kc_cal_600: f64 = interpolate_kc(&table_cal, 600.0);
    assert!(
        (kc_cal_600 - 0.60).abs() < 1e-6,
        "kc_cal(600°C) = {:.4}, expected 0.60", kc_cal_600
    );

    // Calcareous retains more strength than siliceous at elevated temperatures
    for theta in [400.0, 500.0, 600.0, 700.0, 800.0] {
        let kc_s: f64 = interpolate_kc(&table_sil, theta);
        let kc_c: f64 = interpolate_kc(&table_cal, theta);
        assert!(
            kc_c >= kc_s - 1e-10,
            "Calcareous ({:.3}) >= Siliceous ({:.3}) at {:.0}°C",
            kc_c, kc_s, theta
        );
    }

    // Monotonicity: strength decreases with temperature
    for i in 0..table_sil.len() - 1 {
        assert!(
            table_sil[i + 1].1 <= table_sil[i].1 + 1e-10,
            "Siliceous kc should decrease: kc({:.0})={:.2} > kc({:.0})={:.2}",
            table_sil[i + 1].0, table_sil[i + 1].1,
            table_sil[i].0, table_sil[i].1
        );
    }

    // At room temperature, full strength for both
    let kc_sil_20: f64 = interpolate_kc(&table_sil, 20.0);
    let kc_cal_20: f64 = interpolate_kc(&table_cal, 20.0);
    assert!((kc_sil_20 - 1.0).abs() < 1e-10, "kc_sil(20°C) = 1.0");
    assert!((kc_cal_20 - 1.0).abs() < 1e-10, "kc_cal(20°C) = 1.0");
}

// ================================================================
// 6. EC2 500°C Isotherm Method for RC Columns in Fire
// ================================================================
//
// EN 1992-1-2 Annex B.2: 500°C isotherm method.
//
// Simplified method: concrete with T > 500°C is assumed to have
// zero strength. The section is reduced by removing the damaged zone.
//
// For a standard fire exposure on all sides at 90 min:
//   Damage depth a_fi ~ 35 mm (from temperature profiles, EC2 Annex A)
//
// Original section: b x h = 400 x 400 mm
//   b_eff = b - 2*a_fi = 400 - 2*35 = 330 mm
//   h_eff = h - 2*a_fi = 400 - 2*35 = 330 mm
//
// Effective area: A_eff = b_eff * h_eff = 330 * 330 = 108,900 mm^2
// Original area:  A_0   = 400 * 400     = 160,000 mm^2
// Area ratio:     A_eff/A_0 = 108,900/160,000 = 0.6806
//
// Reduced axial capacity:
//   N_Rd,fi = kc(500)*fck * A_eff / gamma_c,fi
//   where kc(500) = 1.0 (the 500°C isotherm method uses full
//   strength for the remaining section by definition)

#[test]
fn validation_ec2_500_isotherm_method() {
    // Original section dimensions (mm)
    let b: f64 = 400.0;
    let h: f64 = 400.0;

    // Damage depth at 90 min standard fire (EC2 Annex A, Table A.2)
    let a_fi: f64 = 35.0; // mm, each side

    // Effective section (concrete with T < 500°C)
    let b_eff: f64 = b - 2.0 * a_fi;
    let h_eff: f64 = h - 2.0 * a_fi;

    let b_eff_expected: f64 = 330.0;
    assert!(
        (b_eff - b_eff_expected).abs() < 1e-6,
        "b_eff = {:.0} mm, expected {:.0}", b_eff, b_eff_expected
    );

    let h_eff_expected: f64 = 330.0;
    assert!(
        (h_eff - h_eff_expected).abs() < 1e-6,
        "h_eff = {:.0} mm, expected {:.0}", h_eff, h_eff_expected
    );

    // Areas
    let a_0: f64 = b * h; // 160,000 mm^2
    let a_eff: f64 = b_eff * h_eff; // 108,900 mm^2

    let a_0_expected: f64 = 160_000.0;
    assert!((a_0 - a_0_expected).abs() < 1e-6, "A_0 = {:.0}", a_0);

    let a_eff_expected: f64 = 108_900.0;
    assert!((a_eff - a_eff_expected).abs() < 1e-6, "A_eff = {:.0}", a_eff);

    let area_ratio: f64 = a_eff / a_0;
    let area_ratio_expected: f64 = 0.6806;
    let ratio_err: f64 = (area_ratio - area_ratio_expected).abs() / area_ratio_expected;
    assert!(
        ratio_err < 0.001,
        "Area ratio = {:.4}, expected {:.4}, err={:.2}%",
        area_ratio, area_ratio_expected, ratio_err * 100.0
    );

    // Concrete properties
    let fck: f64 = 30.0;       // MPa, characteristic compressive strength
    let gamma_c_fi: f64 = 1.0; // partial factor in fire (EN 1992-1-2 §2.3: gamma_c,fi = 1.0)

    // Ambient capacity (full section, with ambient partial factor)
    let gamma_c: f64 = 1.5;    // ambient partial factor
    let n_rd_ambient: f64 = fck * a_0 / gamma_c / 1000.0; // kN
    let n_rd_ambient_expected: f64 = 30.0 * 160_000.0 / 1.5 / 1000.0; // = 3200 kN
    assert!(
        (n_rd_ambient - n_rd_ambient_expected).abs() < 0.1,
        "N_Rd,ambient = {:.1} kN, expected {:.1}", n_rd_ambient, n_rd_ambient_expected
    );

    // Fire capacity using 500°C isotherm method
    // In this method, the remaining concrete (T < 500°C) retains full strength
    let n_rd_fi: f64 = fck * a_eff / gamma_c_fi / 1000.0; // kN
    let n_rd_fi_expected: f64 = 30.0 * 108_900.0 / 1.0 / 1000.0; // = 3267 kN
    assert!(
        (n_rd_fi - n_rd_fi_expected).abs() < 0.1,
        "N_Rd,fi = {:.1} kN, expected {:.1}", n_rd_fi, n_rd_fi_expected
    );

    // Effective section modulus for bending
    let i_0: f64 = b * h.powi(3) / 12.0; // mm^4, original
    let i_eff: f64 = b_eff * h_eff.powi(3) / 12.0; // mm^4, reduced
    let i_ratio: f64 = i_eff / i_0;

    // I_0 = 400 * 400^3 / 12 = 2.1333e9 mm^4
    let i_0_expected: f64 = 400.0 * 400.0_f64.powi(3) / 12.0;
    assert!((i_0 - i_0_expected).abs() < 1.0, "I_0 mismatch");

    // I_eff = 330 * 330^3 / 12 = 9.886e8 mm^4
    let i_eff_expected: f64 = 330.0 * 330.0_f64.powi(3) / 12.0;
    assert!((i_eff - i_eff_expected).abs() < 1.0, "I_eff mismatch");

    // Stiffness ratio should be less than area ratio (I scales with h^4 effectively)
    // i_ratio = (330/400)^4 * (assuming square) = 0.825^4 = 0.463
    let i_ratio_expected: f64 = (330.0 / 400.0_f64).powi(4);
    let i_ratio_err: f64 = (i_ratio - i_ratio_expected).abs() / i_ratio_expected;
    assert!(
        i_ratio_err < 0.01,
        "I_eff/I_0 = {:.4}, expected {:.4}, err={:.2}%",
        i_ratio, i_ratio_expected, i_ratio_err * 100.0
    );

    // Stiffness drops faster than area
    assert!(
        i_ratio < area_ratio,
        "I ratio ({:.4}) < area ratio ({:.4}): stiffness drops faster than area",
        i_ratio, area_ratio
    );
}

// ================================================================
// 7. Steel Section Factor Am/V
// ================================================================
//
// The section factor Am/V controls the rate of heating.
// Am = exposed perimeter surface area per unit length (mm^2/mm = mm)
// V  = volume per unit length = cross-section area A (mm^2)
// Am/V has units of 1/mm = 1000/m (typically reported as m^-1).
//
// HEB 200 profile:
//   bf = 200 mm (flange width)
//   h  = 200 mm (total depth)
//   tw = 9 mm   (web thickness)
//   A  = 7808 mm^2 (cross-section area)
//
// 3-sided exposure (bottom flange not exposed, e.g., slab on top):
//   Am = 2*bf + (h - tw)  [approx: two flanges + web height - saved area]
//      Actually for unprotected I-beam, 3-sided:
//      Am = 2*bf + 2*h - tw   ... No, more precisely:
//
// For a standard 3-sided calculation of an unprotected I-beam
// (beam supporting a concrete slab):
//   Exposed perimeter = 2*bf + h (bottom flange face + two sides + top is shielded)
//   But the standard formula for 3-sided box exposure is:
//   Am = 2*h + bf  (two web/side surfaces + bottom flange)
//
// Using the simplified EC3 approach for Section 4.2.5.1:
//   Am (3-sided, contour) = 2*bf + 2*h - tw
//   For HEB200: Am = 2(200) + 2(200) - 9 = 791 mm per unit length
//   Am/V = 791/7808 = 0.1013 mm^-1 = 101.3 m^-1
//
// However, the problem statement specifies:
//   Am/V = (2*bf + h - tw) / A * 1000
//        = (400 + 200 - 9) / 7808 * 1000
//        = 591/7808 * 1000 = 75.7 m^-1
// This is the shadow (box) Am/V for 3-sided exposure.

#[test]
fn validation_steel_section_factor_am_v() {
    // HEB 200 section properties
    let bf: f64 = 200.0;   // mm, flange width
    let h: f64 = 200.0;    // mm, total depth
    let tw: f64 = 9.0;     // mm, web thickness
    let a_section: f64 = 7808.0; // mm^2, cross-section area

    // 3-sided exposure: Am = 2*bf + h - tw (box/shadow method)
    let am_3side: f64 = 2.0 * bf + h - tw;
    let am_3side_expected: f64 = 591.0;
    assert!(
        (am_3side - am_3side_expected).abs() < 1e-6,
        "Am (3-sided) = {:.0} mm, expected {:.0}", am_3side, am_3side_expected
    );

    // Section factor Am/V in m^-1
    let am_v: f64 = am_3side / a_section * 1000.0;
    let am_v_expected: f64 = 75.7;
    let am_v_err: f64 = (am_v - am_v_expected).abs() / am_v_expected;
    assert!(
        am_v_err < 0.01,
        "Am/V = {:.1} m^-1, expected {:.1} m^-1, err={:.2}%",
        am_v, am_v_expected, am_v_err * 100.0
    );

    // 4-sided exposure: Am = 2*bf + 2*h - tw (full contour, no slab)
    // This gives a higher Am/V → faster heating → less fire resistance
    let am_4side: f64 = 2.0 * bf + 2.0 * h - tw;
    let am_v_4side: f64 = am_4side / a_section * 1000.0;
    assert!(
        am_v_4side > am_v,
        "4-sided Am/V ({:.1}) > 3-sided Am/V ({:.1}): more exposure = faster heating",
        am_v_4side, am_v
    );

    // Compare with a heavier section: HEB 300
    // bf=300, h=300, tw=11, A=14910 mm^2
    let bf_300: f64 = 300.0;
    let h_300: f64 = 300.0;
    let tw_300: f64 = 11.0;
    let a_300: f64 = 14_910.0;

    let am_3side_300: f64 = 2.0 * bf_300 + h_300 - tw_300;
    let am_v_300: f64 = am_3side_300 / a_300 * 1000.0;

    // Heavier section should have LOWER Am/V (more thermal mass)
    assert!(
        am_v_300 < am_v,
        "HEB300 Am/V ({:.1}) < HEB200 Am/V ({:.1}): heavier sections heat slower",
        am_v_300, am_v
    );

    // Heating rate estimate: simplified lumped capacitance model
    // dT/dt ~ (Am/V) * h_net / (rho * c_p)
    // For comparative purposes: relative heating rate ∝ Am/V
    let heating_ratio: f64 = am_v / am_v_300;
    assert!(
        heating_ratio > 1.0,
        "HEB200 heats {:.2}x faster than HEB300", heating_ratio
    );

    // Fire resistance classification:
    // EN 1993-1-2 §4.2.5.1: unprotected steel members
    // Am/V < 50 m^-1  → likely achieves R30 without protection
    // Am/V > 200 m^-1 → very thin section, may not achieve R15
    assert!(
        am_v > 50.0 && am_v < 200.0,
        "Am/V = {:.1} m^-1 is in the typical range for I-sections", am_v
    );
}

// ================================================================
// 8. Fire Load Combination — EN 1991-1-2 §4.3.1
// ================================================================
//
// Accidental fire design situation:
//   Ed,fi = sum(Gk,j) + psi_1,1 * Qk,1 + sum(psi_2,i * Qk,i)
//
// Combination factors (EN 1990 Table A1.1, office building):
//   psi_1 = 0.5 (frequent value for imposed loads — offices)
//   psi_2 = 0.3 (quasi-permanent value for imposed loads — offices)
//
// Applied loads:
//   Dead load:   Gk = 500 kN
//   Live load:   Qk,1 = 200 kN (leading variable action)
//   Wind load:   Qk,2 = 50 kN  (accompanying variable action)
//
// Fire combination:
//   Ed,fi = 500 + 0.5*200 + 0.3*50 = 500 + 100 + 15 = 615 kN
//
// ULS combination (for comparison):
//   Ed,uls = 1.35*Gk + 1.5*Qk,1 + 1.5*psi_0*Qk,2
//          = 1.35*500 + 1.5*200 + 1.5*0.6*50
//          = 675 + 300 + 45 = 1020 kN
//
// Reduction factor:
//   eta_fi = Ed,fi / Ed,uls = 615 / 1020 = 0.6029

#[test]
fn validation_fire_load_combination() {
    // --- Characteristic loads ---
    let gk: f64 = 500.0;   // kN, dead load (permanent)
    let qk_1: f64 = 200.0; // kN, live load (leading variable)
    let qk_2: f64 = 50.0;  // kN, wind load (accompanying variable)

    // --- Combination factors (EN 1990, Table A1.1, office building) ---
    let psi_1: f64 = 0.5;  // frequent value for office imposed load
    let psi_2: f64 = 0.3;  // quasi-permanent value for office imposed load
    let psi_0: f64 = 0.6;  // combination factor for wind

    // --- Fire design combination: EN 1991-1-2 §4.3.1 ---
    // Ed,fi = Gk + psi_1,1 * Qk,1 + psi_2,i * Qk,i (for other variable actions)
    let ed_fi: f64 = gk + psi_1 * qk_1 + psi_2 * qk_2;

    // Step-by-step
    let dead_component: f64 = gk;       // 500 kN
    let live_component: f64 = psi_1 * qk_1;  // 0.5 * 200 = 100 kN
    let wind_component: f64 = psi_2 * qk_2;  // 0.3 * 50 = 15 kN

    assert!((dead_component - 500.0).abs() < 1e-10, "Dead: {}", dead_component);
    assert!((live_component - 100.0).abs() < 1e-10, "Live: {}", live_component);
    assert!((wind_component - 15.0).abs() < 1e-10, "Wind: {}", wind_component);

    let ed_fi_expected: f64 = 615.0;
    assert!(
        (ed_fi - ed_fi_expected).abs() < 1e-10,
        "Ed,fi = {:.1} kN, expected {:.1} kN", ed_fi, ed_fi_expected
    );

    // --- ULS combination: EN 1990 §6.4.3.2 ---
    // Ed,uls = 1.35*Gk + 1.5*Qk,1 + 1.5*psi_0*Qk,2
    let gamma_g: f64 = 1.35;  // partial factor for permanent actions
    let gamma_q: f64 = 1.50;  // partial factor for variable actions
    let ed_uls: f64 = gamma_g * gk + gamma_q * qk_1 + gamma_q * psi_0 * qk_2;

    let uls_dead: f64 = gamma_g * gk;               // 1.35 * 500 = 675 kN
    let uls_live: f64 = gamma_q * qk_1;             // 1.5 * 200 = 300 kN
    let uls_wind: f64 = gamma_q * psi_0 * qk_2;     // 1.5 * 0.6 * 50 = 45 kN

    assert!((uls_dead - 675.0).abs() < 1e-10, "ULS dead: {}", uls_dead);
    assert!((uls_live - 300.0).abs() < 1e-10, "ULS live: {}", uls_live);
    assert!((uls_wind - 45.0).abs() < 1e-10, "ULS wind: {}", uls_wind);

    let ed_uls_expected: f64 = 1020.0;
    assert!(
        (ed_uls - ed_uls_expected).abs() < 1e-10,
        "Ed,uls = {:.1} kN, expected {:.1} kN", ed_uls, ed_uls_expected
    );

    // --- Reduction factor ---
    let eta_fi: f64 = ed_fi / ed_uls;
    let eta_fi_expected: f64 = 615.0 / 1020.0; // = 0.6029...
    let eta_err: f64 = (eta_fi - eta_fi_expected).abs();
    assert!(
        eta_err < 1e-10,
        "eta_fi = {:.6}, expected {:.6}", eta_fi, eta_fi_expected
    );

    // Verify eta_fi ~ 0.60
    let eta_approx: f64 = 0.6029;
    let eta_rel_err: f64 = (eta_fi - eta_approx).abs() / eta_approx;
    assert!(
        eta_rel_err < 0.001,
        "eta_fi = {:.4}, expected ~{:.4}, err={:.4}%",
        eta_fi, eta_approx, eta_rel_err * 100.0
    );

    // Fire load is always less than ULS load
    assert!(
        ed_fi < ed_uls,
        "Ed,fi ({:.0}) < Ed,uls ({:.0}): fire is accidental, lower load",
        ed_fi, ed_uls
    );

    // eta_fi must be between 0 and 1
    assert!(eta_fi > 0.0 && eta_fi < 1.0,
        "eta_fi = {:.4} must be in (0, 1)", eta_fi);

    // Simplified formula: EN 1993-1-2 §2.4.2
    // eta_fi,approx = (Gk + psi_1*Qk) / (gamma_G*Gk + gamma_Q*Qk)
    // (simplified single-variable-action version)
    let eta_fi_simplified: f64 = (gk + psi_1 * qk_1) / (gamma_g * gk + gamma_q * qk_1);
    let eta_simplified_expected: f64 = 600.0 / 975.0; // = 0.6154
    let eta_simpl_err: f64 = (eta_fi_simplified - eta_simplified_expected).abs()
        / eta_simplified_expected;
    assert!(
        eta_simpl_err < 0.001,
        "eta_fi,simplified = {:.4}, expected {:.4}",
        eta_fi_simplified, eta_simplified_expected
    );

    // Sensitivity: higher live-to-dead ratio → lower eta_fi
    // (fire combination benefits more from reduced variable actions)
    let gk_alt: f64 = 300.0;
    let qk_alt: f64 = 400.0; // higher L/D ratio
    let eta_alt: f64 = (gk_alt + psi_1 * qk_alt) / (gamma_g * gk_alt + gamma_q * qk_alt);
    let eta_base: f64 = (gk + psi_1 * qk_1) / (gamma_g * gk + gamma_q * qk_1);
    assert!(
        eta_alt < eta_base,
        "Higher L/D ratio: eta={:.4} < eta={:.4} (more reduction in fire)",
        eta_alt, eta_base
    );
}
