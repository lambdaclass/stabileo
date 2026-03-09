/// Validation: Snow and Ice Loading on Structures (Formula Verification)
///
/// References:
///   - ASCE 7-22, Chapter 7 — Snow Loads
///   - ASCE 7-22, Chapter 10 — Ice Loads (Including Atmospheric Icing)
///   - EN 1991-1-3:2003 — Snow loads on structures (Eurocode 1, Part 1-3)
///   - ISO 12494:2017 — Atmospheric icing of structures
///   - IEC 60826:2017 — Design criteria of overhead transmission lines
///
/// Pure formula-verification tests (no solver calls). These tests verify
/// that standard snow and ice loading parameters, combination rules,
/// and derived quantities are computed correctly from first principles.
///
/// Tests:
///   1. Ground snow load to roof snow load (ASCE 7-22 Ch.7)
///   2. Flat roof snow load (EN 1991-1-3)
///   3. Sloped roof reduction (ASCE 7 Fig. 7.4-1)
///   4. Drift snow load on lower roof (ASCE 7 section 7.7)
///   5. Rain-on-snow surcharge (ASCE 7 section 7.10)
///   6. Atmospheric icing on structures (ISO 12494)
///   7. Unbalanced snow on gable roof (ASCE 7 section 7.6)
///   8. Ice load on transmission lines (ASCE 7 Ch.10 / IEC 60826)
// ================================================================
// 1. Ground Snow Load to Roof Snow Load
// ================================================================
//
// ASCE 7-22 Eq. 7.3-1:
//   pf = 0.7 * Ce * Ct * Is * pg
//
// where:
//   pg = ground snow load (kN/m^2)
//   Ce = exposure factor (Table 7.3-1): 0.7 to 1.3
//   Ct = thermal factor (Table 7.3-2): 1.0 for heated, 1.2 for unheated
//   Is = importance factor (Table 1.5-2): 1.0 for ordinary, 1.2 for essential
//
// The 0.7 factor accounts for wind effects, building heat loss, and
// roof geometry that reduce accumulation relative to ground.

#[test]
fn validation_ground_to_roof_snow_load() {
    // Ground snow load for a moderate snow region
    let pg: f64 = 1.44; // kN/m^2 (~30 psf)

    // Case 1: Standard heated building, partially exposed, Risk Category II
    let ce_1: f64 = 1.0;
    let ct_1: f64 = 1.0;
    let is_1: f64 = 1.0;

    let pf_1: f64 = 0.7 * ce_1 * ct_1 * is_1 * pg;
    let pf_1_expected: f64 = 0.7 * 1.44; // = 1.008 kN/m^2
    assert!(
        (pf_1 - pf_1_expected).abs() < 1e-10,
        "Case 1 pf = 0.7*Ce*Ct*Is*pg: got {:.6}, expected {:.6}",
        pf_1, pf_1_expected
    );

    // Case 2: Fully exposed site in windy terrain (Ce=0.8), heated, ordinary
    let ce_2: f64 = 0.8;
    let ct_2: f64 = 1.0;
    let is_2: f64 = 1.0;

    let pf_2: f64 = 0.7 * ce_2 * ct_2 * is_2 * pg;
    let pf_2_expected: f64 = 0.7 * 0.8 * 1.44; // = 0.8064
    assert!(
        (pf_2 - pf_2_expected).abs() < 1e-10,
        "Case 2 exposed site: got {:.6}, expected {:.6}", pf_2, pf_2_expected
    );
    assert!(
        pf_2 < pf_1,
        "Windier exposure ({:.4}) should reduce roof load vs normal ({:.4})",
        pf_2, pf_1
    );

    // Case 3: Sheltered site (Ce=1.2), unheated structure (Ct=1.2), essential (Is=1.2)
    let ce_3: f64 = 1.2;
    let ct_3: f64 = 1.2;
    let is_3: f64 = 1.2;

    let pf_3: f64 = 0.7 * ce_3 * ct_3 * is_3 * pg;
    let pf_3_expected: f64 = 0.7 * 1.2 * 1.2 * 1.2 * 1.44; // = 1.741824
    assert!(
        (pf_3 - pf_3_expected).abs() < 1e-10,
        "Case 3 sheltered/unheated/essential: got {:.6}, expected {:.6}",
        pf_3, pf_3_expected
    );
    assert!(
        pf_3 > pf_1,
        "Sheltered unheated essential ({:.4}) should exceed standard ({:.4})",
        pf_3, pf_1
    );

    // Verify proportionality: pf scales linearly with each factor
    let ratio_exposure: f64 = pf_2 / pf_1;
    let expected_ratio_exposure: f64 = ce_2 / ce_1;
    assert!(
        (ratio_exposure - expected_ratio_exposure).abs() < 1e-10,
        "Exposure ratio: got {:.6}, expected {:.6}",
        ratio_exposure, expected_ratio_exposure
    );

    // With extreme factors (Ce=1.3, Ct=1.2, Is=1.2), the combined multiplier
    // is 0.7*1.3*1.2*1.2 = 1.3104, so roof load CAN exceed ground load for
    // sheltered, unheated, essential facilities. Verify this multiplier.
    let combined_max: f64 = 0.7 * 1.3 * 1.2 * 1.2;
    let pf_max_possible: f64 = combined_max * pg;
    assert!(
        (combined_max - 1.3104).abs() < 1e-10,
        "Max combined multiplier: got {:.6}, expected 1.3104", combined_max
    );
    assert!(
        pf_max_possible > pg,
        "With extreme factors, roof load ({:.4}) can exceed ground load ({:.4})",
        pf_max_possible, pg
    );
}

// ================================================================
// 2. Flat Roof Snow Load — EN 1991-1-3
// ================================================================
//
// EN 1991-1-3 Eq. 5.1:
//   s = mu_i * Ce * Ct * sk
//
// where:
//   sk = characteristic ground snow load (kN/m^2)
//   mu_i = snow load shape coefficient (0.8 for flat roofs, alpha <= 30 deg)
//   Ce = exposure coefficient (0.8 windswept, 1.0 normal, 1.2 sheltered)
//   Ct = thermal coefficient (typically 1.0)
//
// For flat roofs (slope <= 30 deg): mu_1 = 0.8
// For pitched roofs 30 < alpha < 60: mu_1 = 0.8*(60-alpha)/30
// For alpha >= 60 deg: mu_1 = 0.0

#[test]
fn validation_flat_roof_snow_load_eurocode() {
    // Characteristic ground snow load (Zone 3, altitude 500m)
    let sk: f64 = 1.50; // kN/m^2

    // Case 1: Flat roof, normal topography
    let mu_i: f64 = 0.8; // flat roof shape coefficient
    let ce: f64 = 1.0;   // normal topography
    let ct: f64 = 1.0;   // normal thermal conditions

    let s: f64 = mu_i * ce * ct * sk;
    let s_expected: f64 = 0.8 * 1.0 * 1.0 * 1.50; // = 1.20 kN/m^2
    assert!(
        (s - s_expected).abs() < 1e-10,
        "EN flat roof snow load: got {:.4} kN/m^2, expected {:.4} kN/m^2",
        s, s_expected
    );

    // Case 2: Windswept exposure (Ce=0.8)
    let ce_wind: f64 = 0.8;
    let s_wind: f64 = mu_i * ce_wind * ct * sk;
    let s_wind_expected: f64 = 0.8 * 0.8 * 1.50; // = 0.96
    assert!(
        (s_wind - s_wind_expected).abs() < 1e-10,
        "EN windswept roof: got {:.4}, expected {:.4}", s_wind, s_wind_expected
    );
    assert!(
        s_wind < s,
        "Windswept ({:.4}) should be less than normal ({:.4})", s_wind, s
    );

    // Case 3: Sheltered exposure (Ce=1.2)
    let ce_sheltered: f64 = 1.2;
    let s_sheltered: f64 = mu_i * ce_sheltered * ct * sk;
    let s_sheltered_expected: f64 = 0.8 * 1.2 * 1.50; // = 1.44
    assert!(
        (s_sheltered - s_sheltered_expected).abs() < 1e-10,
        "EN sheltered roof: got {:.4}, expected {:.4}", s_sheltered, s_sheltered_expected
    );
    assert!(
        s_sheltered > s,
        "Sheltered ({:.4}) should exceed normal ({:.4})", s_sheltered, s
    );

    // Pitched roof shape coefficient reduction
    // For 30 < alpha < 60: mu_1 = 0.8*(60-alpha)/30
    let alpha_45: f64 = 45.0;
    let mu_45: f64 = 0.8 * (60.0 - alpha_45) / 30.0; // = 0.8 * 15/30 = 0.4
    let s_45: f64 = mu_45 * ce * ct * sk;
    assert!(
        (mu_45 - 0.4).abs() < 1e-10,
        "mu_i at 45 deg: got {:.4}, expected 0.4", mu_45
    );
    assert!(
        s_45 < s,
        "Pitched roof at 45 deg ({:.4}) should carry less than flat ({:.4})",
        s_45, s
    );

    // At alpha=60 deg, mu_i = 0
    let alpha_60: f64 = 60.0;
    let mu_60: f64 = 0.8 * (60.0 - alpha_60) / 30.0;
    assert!(
        mu_60.abs() < 1e-10,
        "mu_i at 60 deg should be zero: got {:.6}", mu_60
    );

    // Compare EN 1991-1-3 with ASCE 7 for same ground load
    let pf_asce: f64 = 0.7 * 1.0 * 1.0 * 1.0 * sk; // ASCE base factor 0.7
    assert!(
        s > pf_asce,
        "EN (mu=0.8) gives higher roof load ({:.4}) than ASCE (0.7 factor, {:.4})",
        s, pf_asce
    );
    let code_ratio: f64 = pf_asce / s;
    let expected_code_ratio: f64 = 0.7 / 0.8;
    assert!(
        (code_ratio - expected_code_ratio).abs() < 1e-10,
        "ASCE/EN ratio: got {:.6}, expected {:.6}", code_ratio, expected_code_ratio
    );
}

// ================================================================
// 3. Sloped Roof Reduction — ASCE 7 Fig. 7.4-1
// ================================================================
//
// The roof slope factor Cs reduces snow load on steep roofs because
// snow slides off. ASCE 7-22 Section 7.4 / Fig. 7.4-1 provides
// Cs values depending on surface type and thermal condition.
//
// Warm roof (Ct <= 1.0), unobstructed slippery surface:
//   Cs = 1.0                        for alpha <= 5 deg
//   Cs = 1.0 - (alpha - 5) / 65    for 5 < alpha <= 70 deg
//   Cs = 0.0                        for alpha > 70 deg
//
// Cold roof (Ct > 1.0), unobstructed slippery surface:
//   Cs = 1.0                        for alpha <= 15 deg
//   Cs = 1.0 - (alpha - 15) / 55   for 15 < alpha <= 70 deg
//   Cs = 0.0                        for alpha > 70 deg
//
// Sloped roof snow load: ps = Cs * pf

#[test]
fn validation_sloped_roof_reduction() {
    // Cs function for warm roof, unobstructed slippery surface
    let cs_warm = |alpha: f64| -> f64 {
        if alpha <= 5.0 {
            1.0
        } else if alpha <= 70.0 {
            (1.0 - (alpha - 5.0) / 65.0).max(0.0)
        } else {
            0.0
        }
    };

    // Cs function for cold roof, unobstructed slippery surface
    let cs_cold = |alpha: f64| -> f64 {
        if alpha <= 15.0 {
            1.0
        } else if alpha <= 70.0 {
            (1.0 - (alpha - 15.0) / 55.0).max(0.0)
        } else {
            0.0
        }
    };

    // -- Warm roof tests --
    // Flat (0 deg): Cs = 1.0
    let cs_w_0: f64 = cs_warm(0.0);
    assert!(
        (cs_w_0 - 1.0).abs() < 1e-10,
        "Warm Cs(0 deg) = 1.0, got {:.6}", cs_w_0
    );

    // At threshold (5 deg): Cs = 1.0
    let cs_w_5: f64 = cs_warm(5.0);
    assert!(
        (cs_w_5 - 1.0).abs() < 1e-10,
        "Warm Cs(5 deg) = 1.0, got {:.6}", cs_w_5
    );

    // Moderate slope (30 deg): Cs = 1 - (30-5)/65 = 1 - 25/65 = 0.61538
    let cs_w_30: f64 = cs_warm(30.0);
    let cs_w_30_expected: f64 = 1.0 - 25.0 / 65.0;
    assert!(
        (cs_w_30 - cs_w_30_expected).abs() < 1e-10,
        "Warm Cs(30 deg): got {:.6}, expected {:.6}", cs_w_30, cs_w_30_expected
    );

    // Steep (50 deg): Cs = 1 - (50-5)/65 = 1 - 45/65 = 0.30769
    let cs_w_50: f64 = cs_warm(50.0);
    let cs_w_50_expected: f64 = 1.0 - 45.0 / 65.0;
    assert!(
        (cs_w_50 - cs_w_50_expected).abs() < 1e-10,
        "Warm Cs(50 deg): got {:.6}, expected {:.6}", cs_w_50, cs_w_50_expected
    );

    // At 70 deg: Cs = 1 - (70-5)/65 = 0.0
    let cs_w_70: f64 = cs_warm(70.0);
    assert!(
        cs_w_70.abs() < 1e-10,
        "Warm Cs(70 deg) should be ~0, got {:.6}", cs_w_70
    );

    // Beyond 70 deg: Cs = 0.0
    let cs_w_80: f64 = cs_warm(80.0);
    assert!(
        cs_w_80.abs() < 1e-10,
        "Warm Cs(80 deg) should be 0, got {:.6}", cs_w_80
    );

    // -- Cold roof tests --
    // At 10 deg (below cold threshold): Cs = 1.0
    let cs_c_10: f64 = cs_cold(10.0);
    assert!(
        (cs_c_10 - 1.0).abs() < 1e-10,
        "Cold Cs(10 deg) = 1.0, got {:.6}", cs_c_10
    );

    // At 30 deg: Cs = 1 - (30-15)/55 = 1 - 15/55 = 0.72727
    let cs_c_30: f64 = cs_cold(30.0);
    let cs_c_30_expected: f64 = 1.0 - 15.0 / 55.0;
    assert!(
        (cs_c_30 - cs_c_30_expected).abs() < 1e-10,
        "Cold Cs(30 deg): got {:.6}, expected {:.6}", cs_c_30, cs_c_30_expected
    );

    // Cold roof retains more snow than warm roof at the same slope
    for alpha in [20.0_f64, 30.0, 40.0, 50.0, 60.0] {
        let cs_w: f64 = cs_warm(alpha);
        let cs_c: f64 = cs_cold(alpha);
        assert!(
            cs_c >= cs_w,
            "At {:.0} deg, cold Cs ({:.4}) should be >= warm Cs ({:.4})",
            alpha, cs_c, cs_w
        );
    }

    // Apply reduction to actual snow load
    let pf: f64 = 1.2; // kN/m^2 flat roof snow load
    let slope: f64 = 30.0;
    let ps_warm: f64 = cs_warm(slope) * pf;
    let ps_cold: f64 = cs_cold(slope) * pf;

    assert!(
        ps_warm < pf,
        "Warm sloped load ({:.4}) must be less than flat ({:.4})", ps_warm, pf
    );
    assert!(
        ps_cold < pf,
        "Cold sloped load ({:.4}) must be less than flat ({:.4})", ps_cold, pf
    );
    assert!(
        ps_cold > ps_warm,
        "Cold sloped ({:.4}) retains more than warm sloped ({:.4})",
        ps_cold, ps_warm
    );
}

// ================================================================
// 4. Drift Snow Load on Lower Roof — ASCE 7 Section 7.7
// ================================================================
//
// When a higher roof is adjacent to a lower roof, wind deposits a
// triangular drift surcharge on the lower roof.
//
// ASCE 7-22 Eq. 7.7-1 (drift height):
//   hd = 0.43 * (lu)^(1/3) * (pg + 10)^(1/4) - 1.5
//
// where:
//   lu = upwind fetch distance (m) [use ft in original; here converted]
//   pg = ground snow load (kN/m^2) [use psf in original; here converted]
//   hd = drift height (m) [use ft in original]
//
// NOTE: The ASCE 7 formula is in imperial units:
//   hd(ft) = 0.43 * lu(ft)^(1/3) * (pg_psf + 10)^(1/4) - 1.5
//
// Snow density: gamma_s = 0.13*pg + 14 (pcf) or in SI:
//   gamma_s = min(0.426*pg_kPa + 2.2, 4.7) kN/m^3
//
// Drift width: wd = 4*hd (max 8*hc)
// Peak drift surcharge: pd = gamma_s * hd

#[test]
fn validation_drift_snow_load_lower_roof() {
    // Use imperial units for the formula, then convert
    let pg_psf: f64 = 40.0;       // ground snow load (psf)
    let lu_ft: f64 = 100.0;       // upwind fetch (ft)

    // Drift height (ASCE 7 Eq. 7.7-1, in feet):
    // hd = 0.43 * lu^(1/3) * (pg + 10)^(1/4) - 1.5
    let hd_ft: f64 = 0.43 * lu_ft.powf(1.0 / 3.0) * (pg_psf + 10.0).powf(0.25) - 1.5;

    // Verify intermediate values
    let lu_cube_root: f64 = lu_ft.powf(1.0 / 3.0); // 100^(1/3) = 4.6416
    let pg_quarter: f64 = (pg_psf + 10.0).powf(0.25); // 50^(1/4) = 2.6591
    let hd_expected: f64 = 0.43 * lu_cube_root * pg_quarter - 1.5;

    assert!(
        (hd_ft - hd_expected).abs() < 1e-10,
        "Drift height: got {:.4} ft, expected {:.4} ft", hd_ft, hd_expected
    );
    assert!(
        hd_ft > 0.0,
        "Drift height should be positive: {:.4} ft", hd_ft
    );

    // Convert to SI
    let hd_m: f64 = hd_ft * 0.3048; // ft to m

    // Snow density in SI: gamma_s = min(0.426*pg_kPa + 2.2, 4.7) kN/m^3
    let pg_kpa: f64 = pg_psf * 0.04788; // psf to kPa
    let gamma_s: f64 = (0.426 * pg_kpa + 2.2_f64).min(4.7);

    assert!(
        gamma_s > 2.0 && gamma_s <= 4.7,
        "Snow density should be in range [2.2, 4.7]: got {:.4} kN/m^3", gamma_s
    );

    // Peak drift surcharge pressure
    let pd: f64 = gamma_s * hd_m;
    assert!(
        pd > 0.0,
        "Drift surcharge pressure should be positive: {:.4} kN/m^2", pd
    );

    // Drift width: wd = 4 * hd
    let wd_m: f64 = 4.0 * hd_m;
    assert!(
        wd_m > 0.0,
        "Drift width should be positive: {:.4} m", wd_m
    );

    // Total drift force per unit width (triangular load):
    // F_drift = 0.5 * pd * wd
    let f_drift: f64 = 0.5 * pd * wd_m;
    assert!(
        f_drift > 0.0,
        "Drift force per unit width should be positive: {:.4} kN/m", f_drift
    );

    // Leeward vs windward drift: leeward uses upper roof length,
    // windward uses lower roof length. The governing drift is the larger.
    let lu_lower_ft: f64 = 60.0; // lower roof fetch
    let hd_windward_ft: f64 = 0.43 * lu_lower_ft.powf(1.0 / 3.0)
        * (pg_psf + 10.0).powf(0.25) - 1.5;

    // For windward drift, use 3/4 of the computed height
    let hd_windward_design_ft: f64 = 0.75 * hd_windward_ft;

    // The leeward drift (from upper roof) should be larger when upper roof is longer
    assert!(
        hd_ft > hd_windward_design_ft,
        "Leeward drift ({:.4} ft) should exceed windward ({:.4} ft) when upper roof is longer",
        hd_ft, hd_windward_design_ft
    );

    // Verify drift increases with fetch length
    let lu_200_ft: f64 = 200.0;
    let hd_200: f64 = 0.43 * lu_200_ft.powf(1.0 / 3.0) * (pg_psf + 10.0).powf(0.25) - 1.5;
    assert!(
        hd_200 > hd_ft,
        "Longer fetch ({:.0} ft) produces taller drift ({:.4}) than shorter ({:.0} ft, {:.4})",
        lu_200_ft, hd_200, lu_ft, hd_ft
    );

    // Verify drift increases with ground snow load
    let pg_60: f64 = 60.0;
    let hd_pg60: f64 = 0.43 * lu_ft.powf(1.0 / 3.0) * (pg_60 + 10.0).powf(0.25) - 1.5;
    assert!(
        hd_pg60 > hd_ft,
        "Heavier snow load produces taller drift: pg=60 gives {:.4} vs pg=40 gives {:.4}",
        hd_pg60, hd_ft
    );
}

// ================================================================
// 5. Rain-on-Snow Surcharge — ASCE 7 Section 7.10
// ================================================================
//
// ASCE 7-22 Section 7.10: For locations where pg <= 0.96 kN/m^2
// (20 psf), a rain-on-snow surcharge of 0.24 kN/m^2 (5 psf) shall
// be added to the balanced snow load for the design of the roof.
//
// This accounts for rainfall on existing snowpack that becomes
// trapped before drainage. The surcharge applies ONLY to:
//   - Balanced load cases
//   - Roofs with slope < W/15.24 (where W = eave-to-eave in meters)
//
// It does NOT apply to drift, sliding, or unbalanced loads.

#[test]
fn validation_rain_on_snow_surcharge() {
    // Rain-on-snow surcharge constant
    let p_ros: f64 = 0.24; // kN/m^2 (5 psf)

    // Case 1: Low ground snow — surcharge applies (pg <= 0.96 kN/m^2)
    let pg_low: f64 = 0.72; // kN/m^2 (~15 psf)
    let ce: f64 = 1.0;
    let ct: f64 = 1.0;
    let is_factor: f64 = 1.0;

    let pf_low: f64 = 0.7 * ce * ct * is_factor * pg_low; // = 0.504 kN/m^2
    // For pg <= 0.96: minimum load = Is * pg
    let p_min_low: f64 = is_factor * pg_low; // = 0.72 kN/m^2
    let p_balanced_low: f64 = pf_low.max(p_min_low); // = 0.72 (p_min governs)

    assert!(
        (p_balanced_low - 0.72).abs() < 1e-10,
        "Balanced load (p_min governs): got {:.4}, expected 0.72", p_balanced_low
    );

    // Add rain-on-snow surcharge
    let p_total_low: f64 = p_balanced_low + p_ros;
    let p_total_expected: f64 = 0.72 + 0.24; // = 0.96 kN/m^2
    assert!(
        (p_total_low - p_total_expected).abs() < 1e-10,
        "Total with rain-on-snow: got {:.4}, expected {:.4}",
        p_total_low, p_total_expected
    );

    // The surcharge is a substantial fraction of the balanced load
    let ros_fraction: f64 = p_ros / p_balanced_low;
    let ros_fraction_expected: f64 = 0.24 / 0.72; // = 1/3 = 33.3%
    assert!(
        (ros_fraction - ros_fraction_expected).abs() < 1e-10,
        "Rain-on-snow fraction: got {:.4}, expected {:.4}",
        ros_fraction, ros_fraction_expected
    );

    // Case 2: High ground snow — surcharge does NOT apply (pg > 0.96)
    let pg_high: f64 = 1.44; // kN/m^2 (~30 psf)
    let applicable: bool = pg_high <= 0.96;
    assert!(
        !applicable,
        "Rain-on-snow should NOT apply for pg={:.2} > 0.96 kN/m^2", pg_high
    );

    // Case 3: Exactly at threshold (pg = 0.96)
    let pg_threshold: f64 = 0.96;
    let applicable_threshold: bool = pg_threshold <= 0.96;
    assert!(
        applicable_threshold,
        "Rain-on-snow should apply at pg={:.2} kN/m^2 (boundary)", pg_threshold
    );

    // Roof slope check: surcharge only for slopes < W/15.24
    // slope_limit_deg = atan(1/15.24) ~ 3.757 deg
    let slope_limit_deg: f64 = (1.0_f64 / 15.24).atan() * 180.0 / std::f64::consts::PI;
    assert!(
        (slope_limit_deg - 3.757).abs() < 0.01,
        "Slope limit: got {:.3} deg, expected ~3.757 deg", slope_limit_deg
    );

    // Flat roof (1 deg slope) — surcharge applies
    let slope_flat: f64 = 1.0;
    assert!(
        slope_flat < slope_limit_deg,
        "1 deg slope ({:.1}) should be below limit ({:.3})", slope_flat, slope_limit_deg
    );

    // Moderate roof (6 deg slope) — surcharge does NOT apply
    let slope_moderate: f64 = 6.0;
    assert!(
        slope_moderate > slope_limit_deg,
        "6 deg slope ({:.1}) should exceed limit ({:.3})", slope_moderate, slope_limit_deg
    );

    // Beam moment comparison: with and without rain-on-snow
    let span: f64 = 10.0; // m
    let trib: f64 = 5.0;  // m tributary width
    let w_without: f64 = p_balanced_low * trib;
    let w_with: f64 = p_total_low * trib;
    let m_without: f64 = w_without * span * span / 8.0;
    let m_with: f64 = w_with * span * span / 8.0;

    let moment_increase_pct: f64 = (m_with - m_without) / m_without * 100.0;
    let expected_increase_pct: f64 = ros_fraction * 100.0; // 33.3%
    assert!(
        (moment_increase_pct - expected_increase_pct).abs() < 0.1,
        "Moment increase: got {:.1}%, expected {:.1}%",
        moment_increase_pct, expected_increase_pct
    );
}

// ================================================================
// 6. Atmospheric Icing on Structures — ISO 12494
// ================================================================
//
// ISO 12494:2017 defines ice accretion on structural members.
// Ice forms as radial ice on cables and cylindrical members.
//
// Ice weight per unit length on a circular member:
//   w_ice = pi * rho_ice * t_ice * (d + t_ice) * g
//
// where:
//   rho_ice = density of ice (typically 900 kg/m^3 for glaze ice)
//   t_ice = radial ice thickness (m)
//   d = bare member diameter (m)
//   g = 9.81 m/s^2
//
// ISO 12494 icing classes (IC) define reference ice mass per meter
// on a 30mm reference collector:
//   IC1: m = 0.5 kg/m    IC4: m = 2.8 kg/m
//   IC2: m = 0.9 kg/m    IC5: m = 5.0 kg/m
//   IC3: m = 1.6 kg/m
//
// Radial ice thickness from mass:
//   t = 0.5 * (sqrt(d^2 + 4*m/(pi*rho_ice)) - d)

#[test]
fn validation_atmospheric_icing_iso12494() {
    let pi: f64 = std::f64::consts::PI;
    let g: f64 = 9.81; // m/s^2

    // Ice density for glaze ice
    let rho_ice: f64 = 900.0; // kg/m^3

    // Test member: circular tube, 60mm diameter
    let d: f64 = 0.060; // m

    // Moderate radial ice thickness (20mm)
    let t_ice: f64 = 0.020; // m

    // Ice weight per unit length:
    // w_ice = pi * rho_ice * t_ice * (d + t_ice) * g  (in N/m, then convert to kN/m)
    let w_ice_n: f64 = pi * rho_ice * t_ice * (d + t_ice) * g;
    let w_ice_kn: f64 = w_ice_n / 1000.0;

    // Manual calculation:
    // pi * 900 * 0.020 * (0.060 + 0.020) * 9.81
    // = pi * 900 * 0.020 * 0.080 * 9.81
    // = pi * 900 * 0.001568
    // = pi * 1.4112 = 4.4325 N/m = 0.004433 kN/m
    //
    // More precisely: 900 * 0.020 * 0.080 = 1.440
    // 1.440 * 9.81 = 14.1264
    // 14.1264 * pi = 44.372 N/m = 0.04437 kN/m
    let w_expected_n: f64 = pi * 900.0 * 0.020 * 0.080 * 9.81;
    let w_expected_kn: f64 = w_expected_n / 1000.0;
    assert!(
        (w_ice_kn - w_expected_kn).abs() < 1e-10,
        "Ice weight: got {:.6} kN/m, expected {:.6} kN/m", w_ice_kn, w_expected_kn
    );
    assert!(
        w_ice_kn > 0.0,
        "Ice weight should be positive: {:.6} kN/m", w_ice_kn
    );

    // Iced member effective diameter
    let d_iced: f64 = d + 2.0 * t_ice; // 0.060 + 0.040 = 0.100 m
    assert!(
        (d_iced - 0.100).abs() < 1e-10,
        "Iced diameter: got {:.4} m, expected 0.100 m", d_iced
    );

    // ISO 12494 icing classes: mass per meter on 30mm reference collector
    let _ic_classes: [(u8, f64); 5] = [(1, 0.5), (2, 0.9), (3, 1.6), (4, 2.8), (5, 5.0)];

    // For IC3 (1.6 kg/m), compute radial ice thickness on 30mm collector:
    // m = pi * rho_ice * t * (d_ref + t) => solve quadratic for t
    // t = 0.5 * (sqrt(d^2 + 4*m/(pi*rho_ice)) - d)
    let d_ref: f64 = 0.030; // 30mm reference collector
    let m_ic3: f64 = 1.6; // kg/m

    let discriminant: f64 = d_ref * d_ref + 4.0 * m_ic3 / (pi * rho_ice);
    let t_ic3: f64 = 0.5 * (discriminant.sqrt() - d_ref);

    assert!(
        t_ic3 > 0.0,
        "IC3 ice thickness should be positive: {:.6} m", t_ic3
    );

    // Verify by back-computing the mass from t_ic3
    let m_check: f64 = pi * rho_ice * t_ic3 * (d_ref + t_ic3);
    assert!(
        (m_check - m_ic3).abs() < 1e-6,
        "Back-computed IC3 mass: got {:.6} kg/m, expected {:.6} kg/m", m_check, m_ic3
    );

    // IC classes should produce monotonically increasing ice thicknesses
    let mut prev_t: f64 = 0.0;
    for &(_ic, mass) in &_ic_classes {
        let disc: f64 = d_ref * d_ref + 4.0 * mass / (pi * rho_ice);
        let t: f64 = 0.5 * (disc.sqrt() - d_ref);
        assert!(
            t > prev_t,
            "IC{} thickness ({:.4} m) should exceed previous ({:.4} m)",
            _ic, t, prev_t
        );
        prev_t = t;
    }

    // Weight increase ratio for larger members
    // For the same ice thickness, larger members accumulate more ice mass
    let d_small: f64 = 0.030; // 30mm cable
    let d_large: f64 = 0.100; // 100mm pipe
    let t_same: f64 = 0.015;  // 15mm ice on both

    let w_small: f64 = pi * rho_ice * t_same * (d_small + t_same) * g;
    let w_large: f64 = pi * rho_ice * t_same * (d_large + t_same) * g;

    assert!(
        w_large > w_small,
        "Larger member ({:.4} N/m) accumulates more ice than smaller ({:.4} N/m)",
        w_large, w_small
    );

    let weight_ratio: f64 = w_large / w_small;
    let expected_ratio: f64 = (d_large + t_same) / (d_small + t_same);
    assert!(
        (weight_ratio - expected_ratio).abs() < 1e-10,
        "Weight ratio: got {:.6}, expected {:.6}", weight_ratio, expected_ratio
    );
}

// ================================================================
// 7. Unbalanced Snow on Gable Roof — ASCE 7 Section 7.6
// ================================================================
//
// Wind redistributes snow on gable roofs, creating an unbalanced
// condition with reduced load windward and drift-enhanced load leeward.
//
// ASCE 7-22 Section 7.6.1 (for 2.38 < alpha <= 30.09 deg):
//   Windward side:  0.3 * pf
//   Leeward side:   balanced ps + drift surcharge pd
//
// The leeward drift is computed using the eave-to-ridge distance
// as the fetch length in the drift formula.
//
// pd = gamma_s * hd  (peak of triangular surcharge at ridge)
// gamma_s = min(0.426*pg + 2.2, 4.7) kN/m^3

#[test]
fn validation_unbalanced_snow_gable_roof() {
    // Gable roof parameters
    let alpha_deg: f64 = 20.0; // roof slope (degrees)
    let _alpha_rad: f64 = alpha_deg * std::f64::consts::PI / 180.0;

    // Snow loads
    let pg: f64 = 1.44; // kN/m^2 (~30 psf)
    let ce: f64 = 1.0;
    let ct: f64 = 1.0;
    let is_factor: f64 = 1.0;

    let pf: f64 = 0.7 * ce * ct * is_factor * pg; // = 1.008 kN/m^2

    // For alpha=20 deg (non-slippery warm roof, alpha<=30): Cs = 1.0
    let cs: f64 = 1.0;
    let ps: f64 = cs * pf; // balanced sloped load = 1.008 kN/m^2

    // Verify the slope is in ASCE 7 Section 7.6 applicable range
    assert!(
        alpha_deg > 2.38 && alpha_deg <= 30.09,
        "Slope {:.1} deg must be in (2.38, 30.09] for ASCE 7 Section 7.6.1",
        alpha_deg
    );

    // --- Windward side: 0.3 * pf ---
    let p_windward: f64 = 0.3 * pf;
    let p_windward_expected: f64 = 0.3 * 1.008; // = 0.3024 kN/m^2
    assert!(
        (p_windward - p_windward_expected).abs() < 1e-10,
        "Windward load: got {:.6}, expected {:.6} kN/m^2",
        p_windward, p_windward_expected
    );
    assert!(
        p_windward < ps,
        "Windward ({:.4}) must be less than balanced ({:.4})", p_windward, ps
    );

    // --- Leeward side: ps + drift surcharge (pd) ---
    // Snow density
    let gamma_s: f64 = (0.426 * pg + 2.2_f64).min(4.7);
    let gamma_s_expected: f64 = 0.426 * 1.44 + 2.2; // = 2.81344
    assert!(
        (gamma_s - gamma_s_expected).abs() < 1e-10,
        "Snow density: got {:.6}, expected {:.6} kN/m^3", gamma_s, gamma_s_expected
    );

    // Eave-to-ridge horizontal distance (fetch for drift)
    let half_span: f64 = 8.0; // m

    // Drift height using eave-to-ridge as fetch
    // Convert to imperial for ASCE 7 formula
    let lu_ft: f64 = half_span / 0.3048;
    let pg_psf: f64 = pg / 0.04788;
    let hd_ft: f64 = (0.43 * lu_ft.powf(1.0 / 3.0) * (pg_psf + 10.0).powf(0.25) - 1.5).max(0.0);
    let hd_m: f64 = hd_ft * 0.3048;

    // Peak drift surcharge at ridge
    let pd: f64 = gamma_s * hd_m;

    // Total leeward peak load
    let p_leeward_peak: f64 = ps + pd;

    assert!(
        p_leeward_peak > ps,
        "Leeward peak ({:.4}) should exceed balanced ({:.4})", p_leeward_peak, ps
    );

    // The leeward-to-windward ratio should be substantial
    let lw_ratio: f64 = p_leeward_peak / p_windward;
    assert!(
        lw_ratio > 2.0,
        "Leeward/windward ratio should be > 2: got {:.2}", lw_ratio
    );

    // Verify force balance: windward + leeward integrated loads
    // Windward: uniform 0.3*pf over half_span
    let f_windward: f64 = p_windward * half_span;
    // Leeward: balanced ps over half_span + triangular drift 0.5*pd*half_span
    let f_leeward: f64 = ps * half_span + 0.5 * pd * half_span;
    let f_total: f64 = f_windward + f_leeward;

    // Total unbalanced load should be non-trivial
    assert!(
        f_total > 0.0,
        "Total unbalanced force should be positive: {:.4} kN/m", f_total
    );

    // The unbalanced total exceeds the balanced total because of the drift
    let f_balanced: f64 = ps * 2.0 * half_span;
    assert!(
        f_total > f_balanced * 0.5,
        "Unbalanced total ({:.4}) should be substantial vs balanced ({:.4})",
        f_total, f_balanced
    );
}

// ================================================================
// 8. Ice Load on Transmission Lines — ASCE 7 Ch.10 / IEC 60826
// ================================================================
//
// Transmission lines experience combined ice + wind loading.
//
// ASCE 7-22 Chapter 10: Uniform radial ice on wires/cables.
//   Design ice thickness: td = ti * Kzt * (Ki)^0.35
//
// IEC 60826:2017: Combined ice and wind loading on conductors.
//   The combined load per unit length acts at an angle:
//     Fc = sqrt((w_bare + w_ice)^2 + (q_wind * d_iced)^2)
//
//   where:
//     w_bare = conductor self-weight per unit length (N/m)
//     w_ice  = ice weight per unit length (N/m)
//     q_wind = wind pressure on iced conductor (N/m) = 0.5*rho_air*V^2*Cd*d_iced
//     d_iced = d + 2*t_ice (iced conductor diameter)
//
// The resultant angle from vertical:
//   theta = atan(q_wind * d_iced / (w_bare + w_ice))

#[test]
fn validation_ice_load_transmission_lines() {
    let pi: f64 = std::f64::consts::PI;
    let g: f64 = 9.81; // m/s^2

    // Conductor properties (ACSR Drake 795 kcmil, typical)
    let d_conductor: f64 = 0.02814; // m (28.14 mm diameter)
    let w_bare: f64 = 15.97;        // N/m (self-weight, 1.628 kg/m)

    // Ice parameters
    let rho_ice: f64 = 900.0; // kg/m^3 (glaze ice)
    let t_ice_nominal: f64 = 0.0127; // m (12.7 mm = 0.5 inch, moderate icing)

    // ASCE 7 ice thickness adjustment
    let k_zt: f64 = 1.0;  // flat terrain
    let k_i: f64 = 1.0;   // standard importance
    let t_d: f64 = t_ice_nominal * k_zt * k_i.powf(0.35);
    assert!(
        (t_d - t_ice_nominal).abs() < 1e-10,
        "For Kzt=1, Ki=1: td should equal nominal: {:.6} m", t_d
    );

    // Iced conductor diameter
    let d_iced: f64 = d_conductor + 2.0 * t_d;
    let d_iced_expected: f64 = 0.02814 + 2.0 * 0.0127; // = 0.05354 m
    assert!(
        (d_iced - d_iced_expected).abs() < 1e-10,
        "Iced diameter: got {:.6} m, expected {:.6} m", d_iced, d_iced_expected
    );

    // Ice weight per unit length: w_ice = pi * rho_ice * t_d * (d + t_d) * g
    let w_ice: f64 = pi * rho_ice * t_d * (d_conductor + t_d) * g;
    // = pi * 900 * 0.0127 * (0.02814 + 0.0127) * 9.81
    // = pi * 900 * 0.0127 * 0.04084 * 9.81
    // = pi * 900 * 0.0127 * 0.400640
    // = pi * 4.5793
    // = 14.384 N/m
    assert!(
        w_ice > 0.0,
        "Ice weight should be positive: {:.4} N/m", w_ice
    );

    // Verify ice weight with explicit calculation
    let w_ice_check: f64 = pi * 900.0 * 0.0127 * 0.04084 * 9.81;
    assert!(
        (w_ice - w_ice_check).abs() < 0.01,
        "Ice weight verification: got {:.4} N/m, check {:.4} N/m", w_ice, w_ice_check
    );

    // Total vertical load per unit length
    let w_total_vertical: f64 = w_bare + w_ice;
    assert!(
        w_total_vertical > w_bare,
        "Total vertical ({:.4} N/m) should exceed bare weight ({:.4} N/m)",
        w_total_vertical, w_bare
    );

    // Wind-on-ice loading (IEC 60826 approach)
    let rho_air: f64 = 1.225;   // kg/m^3 (air density at sea level)
    let v_wind: f64 = 25.0;     // m/s (design wind speed during icing)
    let cd: f64 = 1.0;          // drag coefficient for iced cylinder

    // Wind force per unit length on iced conductor
    let q_wind: f64 = 0.5 * rho_air * v_wind * v_wind * cd * d_iced;
    // = 0.5 * 1.225 * 625 * 1.0 * 0.05354
    // = 0.5 * 1.225 * 625 * 0.05354
    // = 0.5 * 40.976 = 20.488 N/m
    assert!(
        q_wind > 0.0,
        "Wind-on-ice force should be positive: {:.4} N/m", q_wind
    );

    // Combined resultant load per unit length
    // Fc = sqrt((w_bare + w_ice)^2 + q_wind^2)
    let f_combined: f64 = (w_total_vertical * w_total_vertical + q_wind * q_wind).sqrt();
    assert!(
        f_combined > w_total_vertical,
        "Combined load ({:.4} N/m) should exceed vertical-only ({:.4} N/m)",
        f_combined, w_total_vertical
    );
    assert!(
        f_combined > q_wind,
        "Combined load ({:.4} N/m) should exceed wind-only ({:.4} N/m)",
        f_combined, q_wind
    );

    // Verify Pythagorean relationship
    let f_check: f64 = (w_total_vertical.powi(2) + q_wind.powi(2)).sqrt();
    assert!(
        (f_combined - f_check).abs() < 1e-10,
        "Combined load Pythagorean check: {:.6} vs {:.6}", f_combined, f_check
    );

    // Resultant angle from vertical
    let theta_rad: f64 = (q_wind / w_total_vertical).atan();
    let theta_deg: f64 = theta_rad * 180.0 / std::f64::consts::PI;

    assert!(
        theta_deg > 0.0 && theta_deg < 90.0,
        "Resultant angle should be 0-90 deg: got {:.2} deg", theta_deg
    );

    // Ice-to-bare weight ratio (indicates ice severity)
    let ice_weight_ratio: f64 = w_ice / w_bare;
    assert!(
        ice_weight_ratio > 0.0 && ice_weight_ratio < 5.0,
        "Ice/bare weight ratio should be reasonable: {:.4}", ice_weight_ratio
    );

    // Test with essential facility importance factor (Ki=1.25)
    let k_i_essential: f64 = 1.25;
    let t_d_ess: f64 = t_ice_nominal * k_zt * k_i_essential.powf(0.35);
    let d_iced_ess: f64 = d_conductor + 2.0 * t_d_ess;
    let w_ice_ess: f64 = pi * rho_ice * t_d_ess * (d_conductor + t_d_ess) * g;

    assert!(
        t_d_ess > t_d,
        "Essential ice thickness ({:.6} m) should exceed standard ({:.6} m)",
        t_d_ess, t_d
    );
    assert!(
        w_ice_ess > w_ice,
        "Essential ice weight ({:.4} N/m) should exceed standard ({:.4} N/m)",
        w_ice_ess, w_ice
    );

    // Wind on iced conductor increases drag area proportionally
    let q_wind_ess: f64 = 0.5 * rho_air * v_wind * v_wind * cd * d_iced_ess;
    let drag_ratio: f64 = q_wind_ess / q_wind;
    let diameter_ratio: f64 = d_iced_ess / d_iced;
    assert!(
        (drag_ratio - diameter_ratio).abs() < 1e-10,
        "Wind force scales with iced diameter: drag ratio {:.6} vs diameter ratio {:.6}",
        drag_ratio, diameter_ratio
    );

    // Span sag calculation: for a span L with tension T,
    // midspan sag under combined load:
    // sag = Fc * L^2 / (8 * T)
    let span: f64 = 300.0;    // m (typical transmission span)
    let tension: f64 = 35000.0; // N (conductor tension)
    let sag: f64 = f_combined * span * span / (8.0 * tension);

    assert!(
        sag > 0.0,
        "Conductor sag should be positive: {:.4} m", sag
    );
    assert!(
        sag < span / 5.0,
        "Sag ({:.2} m) should be reasonable fraction of span ({:.0} m)",
        sag, span
    );

    let _ = g;
}
