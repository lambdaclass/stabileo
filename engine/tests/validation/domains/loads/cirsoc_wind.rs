/// Validation: Wind Loading -- CIRSOC 102 & Cross-Validation
///
/// References:
///   - CIRSOC 102-2005: Reglamento Argentino de Accion del Viento sobre las Construcciones
///   - CIRSOC 102-2018 (draft update aligned with ASCE 7-16)
///   - ASCE 7-22: Minimum Design Loads and Associated Criteria
///   - EC1-1-4: Actions on structures -- Wind actions
///   - Simiu & Yeo: "Wind Effects on Structures" 4th ed.
///
/// Tests verify wind pressure calculations, exposure factors, gust effects,
/// and wind load distribution on buildings.

// ================================================================
// Helper functions for wind loading calculations
// ================================================================

/// CIRSOC 102 velocity pressure: q = 0.613 * V^2 (Pa), or q = 0.0613 * V^2 (kgf/m^2).
/// Returns pressure in Pa when V is in m/s.
fn cirsoc_velocity_pressure_pa(v: f64) -> f64 {
    0.613 * v * v
}

/// Exposure coefficient per power-law profile:
///   Ce(z) = 2.01 * (z / z_g)^(2/alpha)   for z >= z_min
///   Ce(z) = Ce(z_min)                      for z < z_min
///
/// Used by both CIRSOC 102 and ASCE 7 with different parameter tables.
fn exposure_coefficient(z: f64, alpha: f64, z_g: f64, z_min: f64) -> f64 {
    let z_eff = z.max(z_min);
    2.01 * (z_eff / z_g).powf(2.0 / alpha)
}

// Terrain parameters used across tests:
//
// CIRSOC 102-2005 (Argentine code):
//   Category III (suburban): z_g=365 m, z_min=5 m
//   Category II  (open):     z_g=274 m, z_min=5 m
//   Both categories use the same alpha=9.5 in the power-law profile.
//
// ASCE 7-22 (US code):
//   Exposure B (urban/suburban): alpha=7.0, z_g=365.76 m (1200 ft), z_min=9.14 m (30 ft)
//   Exposure C (open):           alpha=9.5, z_g=274.32 m (900 ft),  z_min=4.57 m (15 ft)

const CIRSOC_ALPHA: f64 = 9.5;
const CIRSOC_CAT3_ZG: f64 = 365.0;  // suburban
const CIRSOC_CAT2_ZG: f64 = 274.0;  // open terrain
const CIRSOC_ZMIN: f64 = 5.0;

const ASCE7_EXPB_ALPHA: f64 = 7.0;
const ASCE7_EXPB_ZG: f64 = 365.76;
const ASCE7_EXPB_ZMIN: f64 = 9.14;

const ASCE7_EXPC_ALPHA: f64 = 9.5;
const ASCE7_EXPC_ZG: f64 = 274.32;
const ASCE7_EXPC_ZMIN: f64 = 4.57;

// ================================================================
// 1. CIRSOC 102: Basic Velocity Pressure
// ================================================================
//
// Zone V (Buenos Aires): V0 = 45 m/s
// q0 = 0.613 * 45^2 = 1241.325 Pa = 1.241 kN/m^2
//
// Reference: CIRSOC 102-2005, Table 2 (basic wind speeds by zone)

#[test]
fn cirsoc_basic_velocity_pressure() {
    let v0 = 45.0; // m/s, Zone V (Buenos Aires)

    let q0_pa = cirsoc_velocity_pressure_pa(v0);
    let q0_kn_m2 = q0_pa / 1000.0;

    // Expected: 0.613 * 45^2 = 0.613 * 2025 = 1241.325 Pa
    let expected_pa = 0.613 * 45.0 * 45.0;
    let expected_kn_m2 = expected_pa / 1000.0;

    let err_pa = (q0_pa - expected_pa).abs() / expected_pa;
    assert!(
        err_pa < 0.001,
        "CIRSOC 102 velocity pressure: q0={:.3} Pa, expected={:.3} Pa, err={:.4}%",
        q0_pa, expected_pa, err_pa * 100.0
    );

    // Cross-check kN/m^2 conversion
    let err_kn = (q0_kn_m2 - expected_kn_m2).abs() / expected_kn_m2;
    assert!(
        err_kn < 0.001,
        "CIRSOC 102 velocity pressure: q0={:.4} kN/m^2, expected={:.4} kN/m^2",
        q0_kn_m2, expected_kn_m2
    );

    // Verify the value is approximately 1.241 kN/m^2
    assert!(
        (q0_kn_m2 - 1.241).abs() < 0.01,
        "CIRSOC 102: q0 should be ~1.241 kN/m^2, got {:.4}", q0_kn_m2
    );
}

// ================================================================
// 2. CIRSOC 102: Exposure Coefficient -- Suburban (Category III)
// ================================================================
//
// Category III (suburban): alpha=9.5, z_g=365 m, z_min=5 m
// At z=10 m: Ce = 2.01 * (10/365)^(2/9.5)
//
// Reference: CIRSOC 102-2005, Table 5

#[test]
fn cirsoc_exposure_coefficient_suburban() {
    let z = 10.0;

    let ce = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT3_ZG, CIRSOC_ZMIN);

    // Manual calculation: 2.01 * (10/365)^(2/9.5)
    // (10/365) = 0.027397
    // 2/9.5 = 0.210526
    // 0.027397^0.210526 = exp(0.210526 * ln(0.027397))
    //   ln(0.027397) = -3.5966
    //   0.210526 * (-3.5966) = -0.7572
    //   exp(-0.7572) = 0.4691
    // Ce = 2.01 * 0.4691 = 0.943
    let expected = 2.01 * (10.0_f64 / 365.0).powf(2.0 / 9.5);

    let err = (ce - expected).abs() / expected;
    assert!(
        err < 0.001,
        "CIRSOC 102 Category III Ce(10m): computed={:.4}, expected={:.4}, err={:.4}%",
        ce, expected, err * 100.0
    );

    // The value should be less than 1.0 for suburban terrain at 10m
    assert!(
        ce < 1.0,
        "CIRSOC 102 Category III at 10m: Ce={:.4} should be < 1.0 (sheltered)", ce
    );

    // Verify Ce increases with height
    let ce_20 = exposure_coefficient(20.0, CIRSOC_ALPHA, CIRSOC_CAT3_ZG, CIRSOC_ZMIN);
    assert!(
        ce_20 > ce,
        "CIRSOC 102: Ce(20m)={:.4} should exceed Ce(10m)={:.4}", ce_20, ce
    );
}

// ================================================================
// 3. CIRSOC 102: Exposure Coefficient -- Open Terrain (Category II)
// ================================================================
//
// Category II (open terrain): alpha=9.5, z_g=274 m, z_min=5 m
// At z=10 m: Ce = 2.01 * (10/274)^(2/9.5)
//
// Open terrain has a smaller gradient height (z_g) than suburban,
// leading to higher Ce at the same height.
//
// Reference: CIRSOC 102-2005, Table 5

#[test]
fn cirsoc_exposure_coefficient_open() {
    let z = 10.0;

    let ce = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);

    // Manual: 2.01 * (10/274)^(2/9.5)
    let expected = 2.01 * (10.0_f64 / 274.0).powf(2.0 / 9.5);

    let err = (ce - expected).abs() / expected;
    assert!(
        err < 0.001,
        "CIRSOC 102 Category II Ce(10m): computed={:.4}, expected={:.4}, err={:.4}%",
        ce, expected, err * 100.0
    );

    // Open terrain (smaller z_g) should give higher exposure than suburban at same height
    let ce_suburban = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT3_ZG, CIRSOC_ZMIN);
    assert!(
        ce > ce_suburban,
        "CIRSOC 102: open Ce={:.4} should exceed suburban Ce={:.4} at same height",
        ce, ce_suburban
    );

    // Verify it is approximately 1.04 (open terrain at 10m is near reference)
    assert!(
        (ce - 1.04).abs() < 0.05,
        "CIRSOC 102 Category II at 10m: Ce={:.4} should be ~1.04", ce
    );
}

// ================================================================
// 4. CIRSOC 102: Design Pressure on Building
// ================================================================
//
// 10 m tall building in Buenos Aires (Zone V), Category II (open).
// Windward pressure at height 10 m:
//   p = q0 * Ce(10) * Cp
//   q0 = 1.241 kN/m^2 (from test 1)
//   Ce(10) from Category II (from test 3)
//   Cp = +0.8 (windward wall)
//
// Reference: CIRSOC 102-2005, Section 5

#[test]
fn cirsoc_design_pressure_building() {
    let v0 = 45.0; // m/s
    let z = 10.0;  // m, building height
    let cp_windward = 0.8;

    // Velocity pressure
    let q0_pa = cirsoc_velocity_pressure_pa(v0);
    let q0_kn = q0_pa / 1000.0;

    // Exposure coefficient -- Category II (open)
    let ce = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);

    // Design pressure on windward wall
    let p_windward = q0_kn * ce * cp_windward;

    // Step-by-step expected:
    //   q0 = 0.613 * 2025 / 1000 = 1.24133 kN/m^2
    //   Ce = 2.01 * (10/274)^(2/9.5) ~ 1.036
    //   p = 1.241 * 1.036 * 0.8 ~ 1.029 kN/m^2
    let expected_q0 = 0.613 * v0 * v0 / 1000.0;
    let expected_ce = 2.01 * (z / CIRSOC_CAT2_ZG).powf(2.0 / CIRSOC_ALPHA);
    let expected_p = expected_q0 * expected_ce * cp_windward;

    let err = (p_windward - expected_p).abs() / expected_p;
    assert!(
        err < 0.02,
        "CIRSOC 102 windward pressure: p={:.4} kN/m^2, expected={:.4} kN/m^2, err={:.4}%",
        p_windward, expected_p, err * 100.0
    );

    // Sanity check: windward pressure should be positive and reasonable
    assert!(
        p_windward > 0.5 && p_windward < 2.0,
        "CIRSOC 102: windward pressure {:.4} kN/m^2 out of reasonable range [0.5, 2.0]",
        p_windward
    );

    // Verify the approximate value ~1.03 kN/m^2
    assert!(
        (p_windward - 1.03).abs() < 0.10,
        "CIRSOC 102: windward pressure should be ~1.03 kN/m^2, got {:.4}", p_windward
    );
}

// ================================================================
// 5. CIRSOC 102: Net Pressure on Enclosed Building
// ================================================================
//
// Net pressure = external - internal pressures (most unfavorable combination).
// External: Cpe = +0.8 (windward)
// Internal: Cpi = +/-0.18 (enclosed building)
//
// Controlling case (maximum net outward on windward):
//   Net = Cpe - (-Cpi) = 0.8 - (-0.18) = 0.98
//
// Reference: CIRSOC 102-2005, Section 5.4

#[test]
fn cirsoc_net_pressure_enclosed_building() {
    let cpe_windward: f64 = 0.8;
    let cpi_enclosed: f64 = 0.18; // magnitude

    // Case 1: internal suction (worst for windward wall = max net outward)
    // Net = Cpe - (-Cpi) = Cpe + Cpi
    let net_case1 = cpe_windward + cpi_enclosed;

    // Case 2: internal pressure (reduces net on windward)
    // Net = Cpe - (+Cpi) = Cpe - Cpi
    let net_case2 = cpe_windward - cpi_enclosed;

    // Controlling case
    let net_controlling = net_case1.max(net_case2);

    assert!(
        (net_case1 - 0.98).abs() < 0.001,
        "CIRSOC 102 net pressure case 1: {:.3}, expected 0.980", net_case1
    );

    assert!(
        (net_case2 - 0.62).abs() < 0.001,
        "CIRSOC 102 net pressure case 2: {:.3}, expected 0.620", net_case2
    );

    assert!(
        (net_controlling - 0.98).abs() < 0.001,
        "CIRSOC 102 controlling net Cp: {:.3}, expected 0.980", net_controlling
    );

    // Verify controlling is case 1 (internal suction)
    assert!(
        net_case1 > net_case2,
        "CIRSOC 102: internal suction case ({:.3}) should govern over internal pressure ({:.3})",
        net_case1, net_case2
    );

    // Verify the net coefficient for leeward wall too
    let cpe_leeward: f64 = -0.5;

    // Leeward controlling case (max net suction): Cpe_leeward - (+Cpi) = -0.5 - 0.18 = -0.68
    let net_leeward = cpe_leeward - cpi_enclosed;
    assert!(
        (net_leeward - (-0.68)).abs() < 0.001,
        "CIRSOC 102 leeward net pressure: {:.3}, expected -0.680", net_leeward
    );
}

// ================================================================
// 6. ASCE 7 Cross-Validation: Exposure B
// ================================================================
//
// ASCE 7 Exposure B (urban/suburban):
//   alpha=7.0, z_g=365.76 m (1200 ft), z_min=9.14 m (30 ft)
//   Kz = 2.01 * (z/z_g)^(2/alpha)
//   At z=10 m (32.8 ft): Kz = 2.01 * (10/365.76)^(2/7.0)
//
// Velocity pressure: qz = 0.613 * Kz * Kzt * Kd * Ke * V^2 (SI, Pa)
//   Kzt = 1.0 (flat terrain), Kd = 0.85 (buildings), Ke = 1.0 (sea level)
//
// Reference: ASCE 7-22, Section 26.10

#[test]
fn asce7_cross_validation_exposure_b() {
    let z = 10.0;

    let kz = exposure_coefficient(z, ASCE7_EXPB_ALPHA, ASCE7_EXPB_ZG, ASCE7_EXPB_ZMIN);

    // Expected: 2.01 * (10/365.76)^(2/7)
    let expected_kz = 2.01 * (10.0_f64 / ASCE7_EXPB_ZG).powf(2.0 / ASCE7_EXPB_ALPHA);

    let err = (kz - expected_kz).abs() / expected_kz;
    assert!(
        err < 0.001,
        "ASCE 7 Exposure B Kz(10m): computed={:.4}, expected={:.4}, err={:.4}%",
        kz, expected_kz, err * 100.0
    );

    // Kz at 10m for Exposure B should be approximately 0.70
    assert!(
        (kz - 0.70).abs() < 0.05,
        "ASCE 7 Exposure B: Kz(10m)={:.4}, expected ~0.70", kz
    );

    // Full velocity pressure with standard factors
    let v = 45.0;    // m/s (for comparison with CIRSOC)
    let kzt = 1.0;   // flat terrain
    let kd = 0.85;   // directionality factor for buildings
    let ke = 1.0;    // ground elevation factor at sea level

    let qz = 0.613 * kz * kzt * kd * ke * v * v;

    // Expected qz step by step
    let expected_qz = 0.613 * expected_kz * kzt * kd * ke * v * v;

    let err_q = (qz - expected_qz).abs() / expected_qz;
    assert!(
        err_q < 0.02,
        "ASCE 7 qz: computed={:.2} Pa, expected={:.2} Pa, err={:.4}%",
        qz, expected_qz, err_q * 100.0
    );

    // qz should be positive and less than the basic velocity pressure
    let q0 = 0.613 * v * v;
    assert!(
        qz > 0.0 && qz < q0,
        "ASCE 7: qz={:.2} Pa should be in (0, q0={:.2} Pa) for Exposure B at 10m",
        qz, q0
    );
}

// ================================================================
// 7. CIRSOC 102: Base Shear on Rectangular Building
// ================================================================
//
// Building dimensions: 20 m wide (perpendicular to wind) x 10 m deep x 15 m tall.
// Wind zone V (Buenos Aires), V0=45 m/s, Category II (open terrain).
//
// Windward wall: Cp = +0.8, pressure varies with height.
// Leeward wall:  Cp = -0.5, constant over height (evaluated at roof height).
//
// Simplified approach: divide into height zones and sum forces.
//   Zone 1: 0-5 m,  Ce evaluated at z=5 m
//   Zone 2: 5-10 m, Ce evaluated at z=7.5 m
//   Zone 3: 10-15 m, Ce evaluated at z=12.5 m
//
// Total base shear V = sum of (windward + |leeward|) pressures x tributary area.
//
// Reference: CIRSOC 102-2005, Section 5.3

#[test]
fn cirsoc_base_shear_rectangular() {
    let v0 = 45.0;
    let building_width = 20.0;  // m, perpendicular to wind
    let _building_depth = 10.0; // m, parallel to wind
    let building_height = 15.0; // m

    // Velocity pressure
    let q0_pa = cirsoc_velocity_pressure_pa(v0);
    let q0_kn = q0_pa / 1000.0;

    // Pressure coefficients
    let cp_windward = 0.8;
    let cp_leeward_abs: f64 = 0.5; // magnitude of leeward suction

    // Height zones: (z_bottom, z_top, z_eval for Ce)
    let zones: [(f64, f64, f64); 3] = [
        (0.0, 5.0, 5.0),     // zone 1: 0-5m, Ce at z_min=5m
        (5.0, 10.0, 7.5),    // zone 2: 5-10m
        (10.0, 15.0, 12.5),  // zone 3: 10-15m
    ];

    // Leeward Ce evaluated at roof height
    let ce_roof = exposure_coefficient(building_height, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
    let p_leeward = q0_kn * ce_roof * cp_leeward_abs;

    let mut total_shear = 0.0;

    for &(z_bot, z_top, z_eval) in &zones {
        let zone_height = z_top - z_bot;
        let tributary_area = zone_height * building_width;

        let ce_ww = exposure_coefficient(z_eval, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        let p_windward_zone = q0_kn * ce_ww * cp_windward;

        // Net force on this zone = (windward + leeward magnitude) * area
        let f_windward = p_windward_zone * tributary_area;
        let f_leeward = p_leeward * tributary_area;

        total_shear += f_windward + f_leeward;
    }

    // Verify total shear is positive and in a reasonable range
    // Building face area = 20m * 15m = 300 m^2
    // Average net pressure ~ q0 * Ce_avg * (Cp_ww + |Cp_lw|)
    //   ~ 1.241 * 1.0 * (0.8 + 0.5) = 1.61 kN/m^2
    // Rough estimate: 1.61 * 300 = 483 kN
    assert!(
        total_shear > 200.0 && total_shear < 800.0,
        "CIRSOC 102 base shear: V={:.1} kN, expected in range [200, 800] kN",
        total_shear
    );

    // Verify monotonicity: higher zones contribute more per unit height
    // (because Ce increases with height)
    let ce_z1 = exposure_coefficient(5.0, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
    let ce_z3 = exposure_coefficient(12.5, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
    assert!(
        ce_z3 > ce_z1,
        "CIRSOC 102: Ce at 12.5m ({:.4}) should exceed Ce at 5m ({:.4})",
        ce_z3, ce_z1
    );

    // Re-compute expected total step by step for 2% tolerance check
    let mut expected_total = 0.0;
    for &(_z_bot, _z_top, z_eval) in &zones {
        let ce = exposure_coefficient(z_eval, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        let zone_h = 5.0; // all zones are 5m high
        let f_ww = q0_kn * ce * cp_windward * zone_h * building_width;
        let f_lw = q0_kn * ce_roof * cp_leeward_abs * zone_h * building_width;
        expected_total += f_ww + f_lw;
    }

    let err = (total_shear - expected_total).abs() / expected_total;
    assert!(
        err < 0.02,
        "CIRSOC 102 base shear verification: V={:.2} kN, expected={:.2} kN, err={:.4}%",
        total_shear, expected_total, err * 100.0
    );
}

// ================================================================
// 8. CIRSOC 102 vs ASCE 7: Exposure Coefficient Comparison
// ================================================================
//
// Compare CIRSOC 102 and ASCE 7 exposure coefficients for equivalent
// terrain categories at the same height.
//
// Open terrain:
//   CIRSOC Category II: alpha=9.5, z_g=274 m
//   ASCE 7 Exposure C:  alpha=9.5, z_g=274.32 m
//   (Nearly identical parameters -- results should match closely)
//
// Suburban terrain:
//   CIRSOC Category III: alpha=9.5, z_g=365 m
//   ASCE 7 Exposure B:   alpha=7.0, z_g=365.76 m
//   (Different alpha -- results will differ but remain in same ballpark)
//
// Reference: Simiu & Yeo, "Wind Effects on Structures", Ch. 3

#[test]
fn cirsoc_vs_asce7_ratio() {
    let heights = [5.0, 10.0, 15.0, 20.0, 30.0, 50.0];

    // Suburban terrain comparison:
    // CIRSOC Cat III: alpha=9.5, z_g=365 m, z_min=5 m
    // ASCE 7 Exp B:   alpha=7.0, z_g=365.76 m, z_min=9.14 m
    for &z in &heights {
        let ce_cirsoc = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT3_ZG, CIRSOC_ZMIN);
        let kz_asce7 = exposure_coefficient(z, ASCE7_EXPB_ALPHA, ASCE7_EXPB_ZG, ASCE7_EXPB_ZMIN);

        // Both should be in the same ballpark since z_g values are nearly equal
        // but alpha differs (9.5 vs 7.0), so we allow a wide tolerance
        let ratio = ce_cirsoc / kz_asce7;
        assert!(
            ratio > 0.50 && ratio < 2.0,
            "Suburban at z={}m: CIRSOC Ce={:.4}, ASCE7 Kz={:.4}, ratio={:.3} out of [0.50, 2.0]",
            z, ce_cirsoc, kz_asce7, ratio
        );
    }

    // Open terrain comparison (same alpha, nearly same z_g):
    // CIRSOC Cat II: alpha=9.5, z_g=274 m
    // ASCE 7 Exp C:  alpha=9.5, z_g=274.32 m
    // Should give essentially the same result.
    for &z in &heights {
        let ce = exposure_coefficient(z, CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN);
        let kz = exposure_coefficient(z, ASCE7_EXPC_ALPHA, ASCE7_EXPC_ZG, ASCE7_EXPC_ZMIN);

        // With nearly identical parameters, results should be very close
        let err = (ce - kz).abs() / ce;
        assert!(
            err < 0.01,
            "Open terrain at z={}m: CIRSOC Ce={:.4}, ASCE7 Kz={:.4}, err={:.4}%",
            z, ce, kz, err * 100.0
        );
    }

    // Verify all parameter sets agree that exposure increases with height
    let param_sets: [(f64, f64, f64, &str); 4] = [
        (CIRSOC_ALPHA, CIRSOC_CAT3_ZG, CIRSOC_ZMIN, "CIRSOC III"),
        (ASCE7_EXPB_ALPHA, ASCE7_EXPB_ZG, ASCE7_EXPB_ZMIN, "ASCE7 B"),
        (CIRSOC_ALPHA, CIRSOC_CAT2_ZG, CIRSOC_ZMIN, "CIRSOC II"),
        (ASCE7_EXPC_ALPHA, ASCE7_EXPC_ZG, ASCE7_EXPC_ZMIN, "ASCE7 C"),
    ];
    for &(alpha, z_g, z_min, name) in &param_sets {
        let ce_10 = exposure_coefficient(10.0, alpha, z_g, z_min);
        let ce_50 = exposure_coefficient(50.0, alpha, z_g, z_min);
        assert!(
            ce_50 > ce_10,
            "{}: Ce(50m)={:.4} should exceed Ce(10m)={:.4}", name, ce_50, ce_10
        );
    }
}
