/// Validation: Thermal Loading Effects on Structures
///
/// References:
///   - EN 1991-1-5:2003, "Eurocode 1: Actions on structures -- Part 1-5: Thermal actions"
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed., Section 3.12 (Temperature)
///   - ACI 224.3R, "Joints in Concrete Construction"
///   - Timoshenko, S.P., "Analysis of Bi-Metal Thermostats", J. Opt. Soc. Am. (1925)
///   - Roark & Young, "Formulas for Stress and Strain", 8th Ed., Ch. 15
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 7th Ed., Ch. 6
///   - Salmon, Johnson & Malhas, "Steel Structures: Design and Behavior", 5th Ed.
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.
///
/// Tests verify thermal load formulas using pure mathematics:
///   1. Uniform temperature change: free strain and restrained axial force
///   2. Thermal gradient (linear): curvature and restrained moment
///   3. Expansion joint spacing: required gap and maximum spacing
///   4. Bimetallic strip deflection: Timoshenko bi-metal formula
///   5. Thermal buckling: critical temperature rise for Euler column
///   6. Bridge bearing movement: total movement and pad capacity
///   7. Non-linear thermal gradient: decomposition into components
///   8. Solar radiation heating: surface temperature rise
// ====================================================================
// 1. Uniform Temperature Change -- Free Thermal Strain and
//    Restrained Axial Force
// ====================================================================
//
// Free thermal strain:    epsilon = alpha * DeltaT
// Restrained axial force: F = E * A * alpha * DeltaT
//
// Steel:    alpha_s = 12e-6 /degC, E_s = 200 GPa
// Concrete: alpha_c = 10e-6 /degC, E_c = 30 GPa
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 6

#[test]
fn validation_thermal_uniform_temperature_change() {
    // --- Steel member ---
    let _alpha_steel: f64 = 12.0e-6;    // /degC
    let _e_steel: f64 = 200.0e3;        // MPa
    let _a_steel: f64 = 0.006;          // m^2 (typical W310x60 area)
    let _delta_t: f64 = 40.0;           // degC uniform rise
    let _l_steel: f64 = 10.0;           // m member length

    // Free thermal strain: epsilon = alpha * DeltaT
    let _eps_steel: f64 = _alpha_steel * _delta_t;
    let _eps_steel_expected: f64 = 12.0e-6 * 40.0;  // = 4.80e-4
    let _err_eps_steel: f64 = (_eps_steel - _eps_steel_expected).abs();
    assert!(
        _err_eps_steel < 1.0e-12,
        "Steel free thermal strain: eps={:.6e}, expected={:.6e}, diff={:.2e}",
        _eps_steel, _eps_steel_expected, _err_eps_steel
    );

    // Free elongation: delta = alpha * DeltaT * L = epsilon * L
    let _delta_steel: f64 = _eps_steel * _l_steel;
    let _delta_steel_expected: f64 = 4.80e-4 * 10.0;  // = 4.80e-3 m = 4.8 mm
    let _err_delta_steel: f64 = (_delta_steel - _delta_steel_expected).abs();
    assert!(
        _err_delta_steel < 1.0e-10,
        "Steel free elongation: delta={:.6e} m, expected={:.6e} m",
        _delta_steel, _delta_steel_expected
    );

    // Restrained axial force: F = E * A * alpha * DeltaT
    // E in MPa = N/mm^2, convert to N: E * 1e6 Pa * A_m2 = N
    let _f_steel: f64 = _e_steel * 1.0e6 * _a_steel * _alpha_steel * _delta_t;  // in N
    let _f_steel_kn: f64 = _f_steel / 1000.0;
    // Expected: 200e3 * 1e6 * 0.006 * 12e-6 * 40 = 200e9 * 0.006 * 4.8e-4
    //         = 1.2e9 * 4.8e-4 = 576000 N = 576 kN
    let _f_steel_expected_kn: f64 = 576.0;
    let _err_f_steel: f64 = (_f_steel_kn - _f_steel_expected_kn).abs();
    assert!(
        _err_f_steel < 0.01,
        "Steel restrained force: F={:.2} kN, expected={:.2} kN",
        _f_steel_kn, _f_steel_expected_kn
    );

    // --- Concrete member ---
    let _alpha_conc: f64 = 10.0e-6;     // /degC
    let _e_conc: f64 = 30.0e3;          // MPa
    let _a_conc: f64 = 0.16;            // m^2 (400mm x 400mm column)
    let _delta_t_conc: f64 = 30.0;      // degC

    let _eps_conc: f64 = _alpha_conc * _delta_t_conc;
    let _eps_conc_expected: f64 = 10.0e-6 * 30.0;  // = 3.0e-4
    let _err_eps_conc: f64 = (_eps_conc - _eps_conc_expected).abs();
    assert!(
        _err_eps_conc < 1.0e-12,
        "Concrete free thermal strain: eps={:.6e}, expected={:.6e}",
        _eps_conc, _eps_conc_expected
    );

    // Restrained force in concrete: F = E * A * alpha * DeltaT
    let _f_conc: f64 = _e_conc * 1.0e6 * _a_conc * _alpha_conc * _delta_t_conc;
    let _f_conc_kn: f64 = _f_conc / 1000.0;
    // Expected: 30e3 * 1e6 * 0.16 * 10e-6 * 30 = 30e9 * 0.16 * 3e-4
    //         = 4.8e9 * 3e-4 = 1440000 N = 1440 kN
    let _f_conc_expected_kn: f64 = 1440.0;
    let _err_f_conc: f64 = (_f_conc_kn - _f_conc_expected_kn).abs();
    assert!(
        _err_f_conc < 0.01,
        "Concrete restrained force: F={:.2} kN, expected={:.2} kN",
        _f_conc_kn, _f_conc_expected_kn
    );

    // Verify concrete generates larger restrained force despite lower E
    // (larger area dominates)
    assert!(
        _f_conc_kn > _f_steel_kn,
        "Concrete force ({:.1} kN) > steel force ({:.1} kN) due to larger area",
        _f_conc_kn, _f_steel_kn
    );
}

// ====================================================================
// 2. Thermal Gradient (Linear) -- Curvature and Restrained Moment
// ====================================================================
//
// Curvature from linear gradient:  kappa = alpha * DeltaT / h
// Restrained moment (fixed beam):  M = E * I * kappa = E * I * alpha * DeltaT / h
//
// EN 1991-1-5, Table 6.1: linear temperature difference components
// for bridges and buildings.
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 6

#[test]
fn validation_thermal_gradient_curvature_and_moment() {
    let _alpha: f64 = 12.0e-6;     // /degC (steel)
    let _delta_t_grad: f64 = 15.0;  // degC top-to-bottom difference
    let _h: f64 = 0.500;            // m section depth (IPE 500)
    let _e: f64 = 200.0e3;          // MPa (steel)
    let _i: f64 = 4.82e-4;          // m^4 (IPE 500 strong axis, Iy)
    let _l: f64 = 8.0;              // m span

    // Free curvature: kappa = alpha * DeltaT / h
    let _kappa: f64 = _alpha * _delta_t_grad / _h;
    let _kappa_expected: f64 = 12.0e-6 * 15.0 / 0.5;  // = 3.6e-4 1/m
    let _err_kappa: f64 = (_kappa - _kappa_expected).abs();
    assert!(
        _err_kappa < 1.0e-12,
        "Thermal curvature: kappa={:.6e} 1/m, expected={:.6e} 1/m",
        _kappa, _kappa_expected
    );

    // Restrained moment for fixed-fixed beam: M = E * I * kappa
    // E in MPa -> E * 1e6 Pa; I in m^4; kappa in 1/m -> M in N*m
    let _m_restrained: f64 = _e * 1.0e6 * _i * _kappa;  // N*m
    let _m_restrained_knm: f64 = _m_restrained / 1000.0; // kN*m
    // Expected: 200e9 * 4.82e-4 * 3.6e-4 = 200e9 * 1.7352e-7
    //         = 34704 N*m = 34.704 kN*m
    let _m_expected_knm: f64 = 200.0e9 * 4.82e-4 * 3.6e-4 / 1000.0;
    let _err_m: f64 = (_m_restrained_knm - _m_expected_knm).abs();
    assert!(
        _err_m < 0.01,
        "Restrained thermal moment: M={:.3} kN*m, expected={:.3} kN*m",
        _m_restrained_knm, _m_expected_knm
    );

    // Free midspan deflection of SS beam: delta = kappa * L^2 / 8
    let _delta_mid: f64 = _kappa * _l * _l / 8.0;
    let _delta_mid_expected: f64 = 3.6e-4 * 64.0 / 8.0;  // = 3.6e-4 * 8 = 2.88e-3 m
    let _err_delta: f64 = (_delta_mid - _delta_mid_expected).abs();
    assert!(
        _err_delta < 1.0e-10,
        "SS beam thermal midspan deflection: delta={:.6e} m, expected={:.6e} m",
        _delta_mid, _delta_mid_expected
    );

    // Cantilever tip deflection: delta_tip = kappa * L^2 / 2
    let _delta_tip: f64 = _kappa * _l * _l / 2.0;
    let _delta_tip_expected: f64 = 3.6e-4 * 64.0 / 2.0;  // = 0.01152 m
    let _err_tip: f64 = (_delta_tip - _delta_tip_expected).abs();
    assert!(
        _err_tip < 1.0e-10,
        "Cantilever thermal tip deflection: delta={:.6e} m, expected={:.6e} m",
        _delta_tip, _delta_tip_expected
    );

    // Cantilever deflection = 4x midspan SS deflection
    let _ratio: f64 = _delta_tip / _delta_mid;
    assert!(
        (_ratio - 4.0).abs() < 1.0e-10,
        "Cantilever/SS deflection ratio: {:.6}, expected 4.0", _ratio
    );
}

// ====================================================================
// 3. Expansion Joint Spacing -- Maximum Joint Gap and Required Spacing
// ====================================================================
//
// Maximum joint gap:  Delta = alpha * DeltaT * L
// Required spacing to limit gap to a maximum value:
//   L_max = gap_max / (alpha * DeltaT)
//
// AASHTO LRFD, Section 3.12.2: temperature ranges for steel bridges
// ACI 224.3R: recommended joint spacing for concrete structures
//
// Reference: AASHTO LRFD Bridge Design Specifications, 9th Ed.

#[test]
fn validation_thermal_expansion_joint_spacing() {
    // --- Steel bridge scenario ---
    // AASHTO moderate climate: T_max_design = 50 degC, T_min_design = -20 degC
    // Total range: DeltaT = 70 degC
    let _alpha_steel: f64 = 12.0e-6;    // /degC
    let _delta_t_bridge: f64 = 70.0;     // degC total range
    let _l_bridge: f64 = 60.0;           // m span between joints

    // Total movement at joint
    let _gap_steel: f64 = _alpha_steel * _delta_t_bridge * _l_bridge;
    // Expected: 12e-6 * 70 * 60 = 12e-6 * 4200 = 0.0504 m = 50.4 mm
    let _gap_steel_mm: f64 = _gap_steel * 1000.0;
    let _gap_steel_expected_mm: f64 = 50.4;
    let _err_gap: f64 = (_gap_steel_mm - _gap_steel_expected_mm).abs();
    assert!(
        _err_gap < 0.01,
        "Steel bridge joint gap: {:.2} mm, expected {:.2} mm",
        _gap_steel_mm, _gap_steel_expected_mm
    );

    // Maximum spacing to limit gap to 40 mm
    let _gap_limit_mm: f64 = 40.0;
    let _l_max_steel: f64 = (_gap_limit_mm / 1000.0) / (_alpha_steel * _delta_t_bridge);
    // Expected: 0.040 / (12e-6 * 70) = 0.040 / 8.4e-4 = 47.619 m
    let _l_max_expected: f64 = 0.040 / (12.0e-6 * 70.0);
    let _err_l_max: f64 = (_l_max_steel - _l_max_expected).abs();
    assert!(
        _err_l_max < 1.0e-6,
        "Max steel bridge joint spacing: {:.3} m, expected {:.3} m",
        _l_max_steel, _l_max_expected
    );

    // --- Concrete structure scenario ---
    // ACI 224.3R: alpha_c = 10e-6, DeltaT = 30 degC (seasonal)
    let _alpha_conc: f64 = 10.0e-6;
    let _delta_t_conc: f64 = 30.0;
    let _l_conc: f64 = 45.0;  // m building length

    let _gap_conc: f64 = _alpha_conc * _delta_t_conc * _l_conc;
    let _gap_conc_mm: f64 = _gap_conc * 1000.0;
    // Expected: 10e-6 * 30 * 45 = 0.0135 m = 13.5 mm
    let _gap_conc_expected_mm: f64 = 13.5;
    let _err_gap_conc: f64 = (_gap_conc_mm - _gap_conc_expected_mm).abs();
    assert!(
        _err_gap_conc < 0.01,
        "Concrete joint gap: {:.2} mm, expected {:.2} mm",
        _gap_conc_mm, _gap_conc_expected_mm
    );

    // Verify steel expands more than concrete under same conditions
    let _gap_steel_same_dt: f64 = _alpha_steel * _delta_t_conc * _l_conc;
    let _gap_conc_same: f64 = _alpha_conc * _delta_t_conc * _l_conc;
    assert!(
        _gap_steel_same_dt > _gap_conc_same,
        "Steel expansion ({:.4} m) > concrete ({:.4} m) for same DeltaT and L",
        _gap_steel_same_dt, _gap_conc_same
    );

    // Ratio should be alpha_steel / alpha_concrete = 1.2
    let _ratio: f64 = _gap_steel_same_dt / _gap_conc_same;
    let _expected_ratio: f64 = _alpha_steel / _alpha_conc;
    assert!(
        (_ratio - _expected_ratio).abs() < 1.0e-10,
        "Expansion ratio steel/concrete: {:.4}, expected {:.4}",
        _ratio, _expected_ratio
    );
}

// ====================================================================
// 4. Bimetallic Strip Deflection -- Timoshenko Bimetal Formula
// ====================================================================
//
// Timoshenko (1925) derived the curvature of a bimetallic strip
// heated uniformly by DeltaT:
//
//   kappa = 6 * (alpha_2 - alpha_1) * DeltaT * (1 + m)^2
//           / (h * (3*(1+m)^2 + (1+m*n)*(m^2 + 1/(m*n))))
//
// where:
//   m = t_1 / t_2  (thickness ratio)
//   n = E_1 / E_2  (modulus ratio)
//   h = t_1 + t_2  (total thickness)
//   alpha_1, alpha_2 = CTE of each layer
//
// For equal thickness (m=1) and equal modulus (n=1):
//   kappa = 6 * (alpha_2 - alpha_1) * DeltaT * 4 / (h * (12 + 2*2))
//         = 24 * delta_alpha * DeltaT / (16 * h)
//         = 3 * delta_alpha * DeltaT / (2 * h)
//
// Reference: Timoshenko, S.P., "Analysis of Bi-Metal Thermostats" (1925)

#[test]
fn validation_thermal_bimetallic_strip_deflection() {
    // --- Case 1: Equal thickness, equal modulus ---
    let _alpha_1: f64 = 12.0e-6;    // /degC (steel)
    let _alpha_2: f64 = 23.0e-6;    // /degC (aluminum)
    let _t_1: f64 = 1.0e-3;          // m (1 mm steel layer)
    let _t_2: f64 = 1.0e-3;          // m (1 mm aluminum layer)
    let _e_1: f64 = 200.0e3;         // MPa (steel)
    let _e_2: f64 = 70.0e3;          // MPa (aluminum)
    let _delta_t: f64 = 100.0;       // degC temperature rise
    let _l_strip: f64 = 0.100;       // m (100 mm strip length)

    let _h: f64 = _t_1 + _t_2;       // total thickness
    let _m: f64 = _t_1 / _t_2;       // thickness ratio
    let _n: f64 = _e_1 / _e_2;       // modulus ratio
    let _delta_alpha: f64 = _alpha_2 - _alpha_1;

    // Full Timoshenko formula for curvature
    let _numerator: f64 = 6.0 * _delta_alpha * _delta_t * (1.0 + _m).powi(2);
    let _denom: f64 = _h * (3.0 * (1.0 + _m).powi(2) + (1.0 + _m * _n) * (_m * _m + 1.0 / (_m * _n)));
    let _kappa: f64 = _numerator / _denom;

    // For m = 1, n = 200/70 = 2.857:
    // numerator = 6 * 11e-6 * 100 * 4 = 6 * 11e-4 * 4 = 0.0264
    // denom = 0.002 * (3*4 + (1 + 2.857)*(1 + 1/2.857))
    //       = 0.002 * (12 + 3.857 * 1.350)
    //       = 0.002 * (12 + 5.207)
    //       = 0.002 * 17.207
    //       = 0.034414
    let _kappa_check_num: f64 = 6.0 * 11.0e-6 * 100.0 * 4.0;
    let _kappa_check_denom: f64 = 0.002 * (12.0 + (1.0 + 200.0 / 70.0) * (1.0 + 70.0 / 200.0));
    let _kappa_check: f64 = _kappa_check_num / _kappa_check_denom;

    let _err_kappa: f64 = (_kappa - _kappa_check).abs() / _kappa.abs();
    assert!(
        _err_kappa < 1.0e-10,
        "Bimetallic curvature: kappa={:.6e}, check={:.6e}, rel_err={:.2e}",
        _kappa, _kappa_check, _err_kappa
    );

    // Tip deflection for cantilever strip: delta = kappa * L^2 / 2
    let _delta_tip: f64 = _kappa * _l_strip * _l_strip / 2.0;
    let _delta_tip_mm: f64 = _delta_tip * 1000.0;

    // Verify deflection is positive (aluminum side expands more, strip curves)
    assert!(
        _delta_tip > 0.0,
        "Bimetallic strip must deflect due to differential expansion"
    );

    // --- Case 2: Simplified equal-thickness, equal-modulus ---
    // For m=1, n=1: kappa_simple = 3 * delta_alpha * DeltaT / (2 * h)
    let _kappa_simple: f64 = 3.0 * _delta_alpha * _delta_t / (2.0 * _h);
    // Expected: 3 * 11e-6 * 100 / (2 * 0.002) = 3.3e-3 / 0.004 = 0.825 1/m
    let _kappa_simple_expected: f64 = 3.0 * 11.0e-6 * 100.0 / (2.0 * 0.002);
    let _err_simple: f64 = (_kappa_simple - _kappa_simple_expected).abs();
    assert!(
        _err_simple < 1.0e-10,
        "Simplified bimetallic curvature (n=1): kappa={:.6}, expected={:.6}",
        _kappa_simple, _kappa_simple_expected
    );

    // With different moduli (n != 1), curvature is less than simplified case
    // because the stiffer material resists the bending
    assert!(
        _kappa < _kappa_simple,
        "With n>1, curvature ({:.6}) < simplified n=1 ({:.6}) due to stiffness mismatch",
        _kappa, _kappa_simple
    );
}

// ====================================================================
// 5. Thermal Buckling -- Critical Temperature Rise for Euler Column
// ====================================================================
//
// For a pin-ended column restrained against expansion:
//   DeltaT_cr = pi^2 / (alpha * (L/r)^2)
//
// where r = sqrt(I/A) is the radius of gyration.
//
// Derivation: Pcr = pi^2 * E * I / L^2 = E * A * alpha * DeltaT_cr
//   => DeltaT_cr = pi^2 * I / (A * alpha * L^2)
//                = pi^2 / (alpha * L^2 / (I/A))
//                = pi^2 / (alpha * (L/r)^2)
//
// Reference: Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed.

#[test]
fn validation_thermal_buckling_critical_temperature() {
    let _pi: f64 = std::f64::consts::PI;

    // --- Steel column ---
    let _alpha_steel: f64 = 12.0e-6;  // /degC
    let _e_steel: f64 = 200.0e9;      // Pa
    let _l_steel: f64 = 5.0;          // m
    let _a_steel: f64 = 7.64e-3;      // m^2 (HEB 200)
    let _i_steel: f64 = 5.696e-5;     // m^4 (HEB 200, strong axis)

    let _r_steel: f64 = (_i_steel / _a_steel).sqrt();  // radius of gyration
    let _slenderness_steel: f64 = _l_steel / _r_steel;

    // Critical temperature rise
    let _dt_cr_steel: f64 = _pi * _pi / (_alpha_steel * _slenderness_steel * _slenderness_steel);

    // Verify via Euler load equivalence: Pcr = E*A*alpha*DeltaTcr
    let _pcr_euler: f64 = _pi * _pi * _e_steel * _i_steel / (_l_steel * _l_steel);
    let _pcr_thermal: f64 = _e_steel * _a_steel * _alpha_steel * _dt_cr_steel;
    let _err_pcr: f64 = (_pcr_euler - _pcr_thermal).abs() / _pcr_euler;
    assert!(
        _err_pcr < 1.0e-10,
        "Steel: Pcr_Euler={:.2e} N, Pcr_thermal={:.2e} N, rel_err={:.2e}",
        _pcr_euler, _pcr_thermal, _err_pcr
    );

    // r = sqrt(5.696e-5 / 7.64e-3) = sqrt(7.457e-3) = 0.08635 m
    let _r_expected: f64 = (5.696e-5_f64 / 7.64e-3).sqrt();
    let _err_r: f64 = (_r_steel - _r_expected).abs();
    assert!(
        _err_r < 1.0e-10,
        "Steel radius of gyration: r={:.6} m, expected={:.6} m",
        _r_steel, _r_expected
    );

    // Slenderness = 5.0 / 0.08635 = 57.9
    // DeltaT_cr = pi^2 / (12e-6 * 57.9^2) = 9.8696 / (12e-6 * 3352.4) = 9.8696 / 0.04023
    //           = 245.3 degC
    // Verify DeltaT_cr is positive and physically reasonable (> 100 degC for stocky column)
    assert!(
        _dt_cr_steel > 100.0,
        "Steel DeltaT_cr={:.1} degC should be > 100 for stocky column (lambda={:.1})",
        _dt_cr_steel, _slenderness_steel
    );

    // --- Aluminum column (same geometry) ---
    let _alpha_alum: f64 = 23.0e-6;   // /degC
    let _e_alum: f64 = 70.0e9;        // Pa

    let _dt_cr_alum: f64 = _pi * _pi / (_alpha_alum * _slenderness_steel * _slenderness_steel);

    // Verify Euler equivalence for aluminum
    let _pcr_euler_alum: f64 = _pi * _pi * _e_alum * _i_steel / (_l_steel * _l_steel);
    let _pcr_thermal_alum: f64 = _e_alum * _a_steel * _alpha_alum * _dt_cr_alum;
    let _err_alum: f64 = (_pcr_euler_alum - _pcr_thermal_alum).abs() / _pcr_euler_alum;
    assert!(
        _err_alum < 1.0e-10,
        "Aluminum: Pcr_Euler={:.2e} N, Pcr_thermal={:.2e} N, rel_err={:.2e}",
        _pcr_euler_alum, _pcr_thermal_alum, _err_alum
    );

    // Aluminum buckles at lower temperature than steel (higher alpha)
    assert!(
        _dt_cr_alum < _dt_cr_steel,
        "Aluminum DeltaT_cr ({:.1}) < steel DeltaT_cr ({:.1}) due to higher CTE",
        _dt_cr_alum, _dt_cr_steel
    );

    // Ratio of critical temperatures = alpha_steel / alpha_alum
    let _ratio: f64 = _dt_cr_steel / _dt_cr_alum;
    let _ratio_expected: f64 = _alpha_alum / _alpha_steel;
    let _err_ratio: f64 = (_ratio - _ratio_expected).abs() / _ratio_expected;
    assert!(
        _err_ratio < 1.0e-10,
        "DeltaT_cr ratio: {:.4}, expected alpha_Al/alpha_St={:.4}",
        _ratio, _ratio_expected
    );
}

// ====================================================================
// 6. Bridge Bearing Movement -- AASHTO Total Movement and Pad Check
// ====================================================================
//
// AASHTO LRFD 3.12.2: total movement at bearing
//   Delta_total = alpha * L * (T_max_design - T_min_design)
//
// Elastomeric bearing pad capacity check (AASHTO 14.7.6):
//   Required pad length >= Delta_total / gamma_s_max
//   where gamma_s_max = allowable shear strain (typically 0.5 for service)
//
// Reference: AASHTO LRFD Bridge Design Specifications, 9th Ed.

#[test]
fn validation_thermal_bridge_bearing_movement() {
    let _alpha: f64 = 12.0e-6;          // /degC (steel bridge)
    let _l_bridge: f64 = 80.0;           // m bridge length (measured to fixed bearing)
    let _t_max_design: f64 = 50.0;       // degC (AASHTO Zone 2 hot)
    let _t_min_design: f64 = -20.0;      // degC (AASHTO Zone 2 cold)
    let _t_install: f64 = 15.0;          // degC installation temperature

    // Total movement from full range
    let _delta_t_range: f64 = _t_max_design - _t_min_design;  // 70 degC
    let _delta_total: f64 = _alpha * _l_bridge * _delta_t_range;
    // Expected: 12e-6 * 80 * 70 = 0.0672 m = 67.2 mm
    let _delta_total_mm: f64 = _delta_total * 1000.0;
    let _delta_total_expected_mm: f64 = 67.2;
    let _err_total: f64 = (_delta_total_mm - _delta_total_expected_mm).abs();
    assert!(
        _err_total < 0.01,
        "Total bearing movement: {:.2} mm, expected {:.2} mm",
        _delta_total_mm, _delta_total_expected_mm
    );

    // Movement from installation temperature
    let _delta_expand: f64 = _alpha * _l_bridge * (_t_max_design - _t_install);
    let _delta_contract: f64 = _alpha * _l_bridge * (_t_install - _t_min_design);
    let _delta_expand_mm: f64 = _delta_expand * 1000.0;
    let _delta_contract_mm: f64 = _delta_contract * 1000.0;

    // expand = 12e-6 * 80 * 35 = 0.0336 m = 33.6 mm
    // contract = 12e-6 * 80 * 35 = 0.0336 m = 33.6 mm
    let _expand_expected_mm: f64 = 33.6;
    let _contract_expected_mm: f64 = 33.6;
    assert!(
        (_delta_expand_mm - _expand_expected_mm).abs() < 0.01,
        "Expansion from install: {:.2} mm, expected {:.2} mm",
        _delta_expand_mm, _expand_expected_mm
    );
    assert!(
        (_delta_contract_mm - _contract_expected_mm).abs() < 0.01,
        "Contraction from install: {:.2} mm, expected {:.2} mm",
        _delta_contract_mm, _contract_expected_mm
    );

    // Sum of expand + contract = total range movement
    let _sum: f64 = _delta_expand_mm + _delta_contract_mm;
    assert!(
        (_sum - _delta_total_mm).abs() < 0.01,
        "Expand + contract ({:.2} mm) should equal total ({:.2} mm)",
        _sum, _delta_total_mm
    );

    // Elastomeric bearing pad design
    // Pad thickness T_pad, allowable shear strain gamma_s = 0.5
    let _gamma_s_max: f64 = 0.5;
    let _t_pad_required: f64 = _delta_total / _gamma_s_max;
    let _t_pad_mm: f64 = _t_pad_required * 1000.0;
    // Expected: 0.0672 / 0.5 = 0.1344 m = 134.4 mm
    let _t_pad_expected_mm: f64 = 134.4;
    let _err_pad: f64 = (_t_pad_mm - _t_pad_expected_mm).abs();
    assert!(
        _err_pad < 0.01,
        "Pad thickness required: {:.2} mm, expected {:.2} mm",
        _t_pad_mm, _t_pad_expected_mm
    );

    // Shear force in pad: F = G * A_pad * gamma_s
    // G = 0.9 MPa (typical elastomeric modulus), A_pad = 0.3 * 0.4 = 0.12 m^2
    let _g_pad: f64 = 0.9;              // MPa
    let _a_pad: f64 = 0.3 * 0.4;        // m^2
    let _gamma_actual: f64 = _delta_total / _t_pad_required;  // should = gamma_s_max
    let _f_shear: f64 = _g_pad * 1000.0 * _a_pad * _gamma_actual;  // kN (G in kPa * A * strain)
    // F = 0.9 * 1000 * 0.12 * 0.5 = 54 kN
    let _f_shear_expected: f64 = 0.9 * 1000.0 * 0.12 * 0.5;
    let _err_f: f64 = (_f_shear - _f_shear_expected).abs();
    assert!(
        _err_f < 0.01,
        "Bearing shear force: {:.2} kN, expected {:.2} kN",
        _f_shear, _f_shear_expected
    );
}

// ====================================================================
// 7. Non-Linear Thermal Gradient -- Decomposition into Components
// ====================================================================
//
// EN 1991-1-5, Section 6.1.4: A non-linear temperature profile T(y)
// over a section of depth h is decomposed into three components:
//
//   T(y) = T_uniform + T_linear(y) + T_self_eq(y)
//
// where:
//   T_uniform   = (1/A) * integral T(y) * b(y) dy   (average temperature)
//   T_linear(y) = (y - y_c) * (1/I) * integral T(y) * b(y) * (y - y_c) dy
//   T_self_eq(y) = T(y) - T_uniform - T_linear(y)   (residual, self-equilibrating)
//
// For a rectangular section b=const, with a simple parabolic profile:
//   T(y) = T_top + (T_bot - T_top)*(y/h) + T_nl*(4*y/h*(1-y/h))
//
// The self-equilibrating component produces no net force or moment but
// causes self-equilibrating stresses sigma = E * alpha * T_self_eq.
//
// Reference: EN 1991-1-5:2003, Section 6.1.4 and Annex B

#[test]
fn validation_thermal_nonlinear_gradient_decomposition() {
    // Rectangular section, depth h, width b
    let _h: f64 = 1.0;        // m (concrete box girder depth)
    let _b: f64 = 0.3;        // m (web width for integration)
    let _n_steps: usize = 1000;   // numerical integration steps

    // Parabolic temperature profile: T(y) = T_top + (T_bot-T_top)*(y/h) + T_nl*(4*y/h*(1-y/h))
    // y measured from top (y=0) to bottom (y=h)
    let _t_top: f64 = 20.0;     // degC at top
    let _t_bot: f64 = 5.0;      // degC at bottom
    let _t_nl: f64 = 10.0;      // degC nonlinear component (peak at mid-depth)

    // Centroid at y_c = h/2 for rectangular section
    let _y_c: f64 = _h / 2.0;
    let _a_sec: f64 = _b * _h;   // cross-sectional area
    let _i_sec: f64 = _b * _h.powi(3) / 12.0;  // second moment of area

    // Numerical integration using trapezoidal rule
    let _dy: f64 = _h / _n_steps as f64;

    // Compute integrals: integral[T(y)*b*dy] and integral[T(y)*b*(y-y_c)*dy]
    let mut _int_t: f64 = 0.0;
    let mut _int_t_y: f64 = 0.0;

    for _i in 0..=_n_steps {
        let _y: f64 = _i as f64 * _dy;
        let _eta: f64 = _y / _h;  // normalized depth [0, 1]
        let _t_y: f64 = _t_top + (_t_bot - _t_top) * _eta + _t_nl * 4.0 * _eta * (1.0 - _eta);

        let _w: f64 = if _i == 0 || _i == _n_steps { 0.5 } else { 1.0 };
        _int_t += _w * _t_y * _b * _dy;
        _int_t_y += _w * _t_y * _b * (_y - _y_c) * _dy;
    }

    // Uniform component: T_uniform = integral[T*b*dy] / A
    let _t_uniform: f64 = _int_t / _a_sec;

    // Linear gradient coefficient: kappa_T = integral[T*b*(y-y_c)*dy] / I
    let _kappa_t: f64 = _int_t_y / _i_sec;

    // For the given profile, analytical results:
    // T_uniform = (1/h) * integral_0^h [T_top + (T_bot-T_top)*y/h + T_nl*4*(y/h)*(1-y/h)] dy
    //           = T_top + (T_bot-T_top)/2 + T_nl * 4 * (1/2 - 1/3)
    //           = 20 + (-15)/2 + 10 * 4 * (1/6)
    //           = 20 - 7.5 + 6.667 = 19.167 degC
    let _t_uniform_analytical: f64 = _t_top + (_t_bot - _t_top) / 2.0 + _t_nl * 4.0 / 6.0;

    let _err_uniform: f64 = (_t_uniform - _t_uniform_analytical).abs();
    assert!(
        _err_uniform < 0.01,
        "Uniform component: T_u={:.4} degC, analytical={:.4} degC",
        _t_uniform, _t_uniform_analytical
    );

    // Linear gradient: integral[T(y)*b*(y-yc)*dy] / I
    // For rectangular section, analytical integral of T(y)*(y-h/2) from 0 to h:
    // = integral_0^h [T_top*(y-h/2) + (T_bot-T_top)*(y/h)*(y-h/2) + T_nl*4*(y/h)*(1-y/h)*(y-h/2)] dy
    // Term 1: T_top * integral[(y-h/2)dy] from 0 to h = T_top * 0 = 0
    // Term 2: (T_bot-T_top)/h * integral[y*(y-h/2)dy] = (T_bot-T_top)/h * h^3/12
    //       = (T_bot-T_top)*h^2/12
    // Term 3: 4*T_nl/h * integral[y*(1-y/h)*(y-h/2)dy] = 0 (by symmetry about h/2)
    //
    // So: integral[T(y)*(y-h/2)*dy] = (T_bot-T_top)*h^2/12
    // Multiply by b: b*(T_bot-T_top)*h^2/12
    // Divide by I = b*h^3/12: (T_bot-T_top)/h
    let _kappa_t_analytical: f64 = (_t_bot - _t_top) / _h;

    let _err_kappa: f64 = (_kappa_t - _kappa_t_analytical).abs();
    assert!(
        _err_kappa < 0.05,
        "Linear gradient: kappa_T={:.4} degC/m, analytical={:.4} degC/m",
        _kappa_t, _kappa_t_analytical
    );

    // Verify self-equilibrating component integrates to zero force and zero moment
    let mut _int_self_eq: f64 = 0.0;
    let mut _int_self_eq_y: f64 = 0.0;

    for _i in 0..=_n_steps {
        let _y: f64 = _i as f64 * _dy;
        let _eta: f64 = _y / _h;
        let _t_y: f64 = _t_top + (_t_bot - _t_top) * _eta + _t_nl * 4.0 * _eta * (1.0 - _eta);
        let _t_linear_at_y: f64 = _t_uniform + _kappa_t * (_y - _y_c);
        let _t_self_eq_y: f64 = _t_y - _t_linear_at_y;

        let _w: f64 = if _i == 0 || _i == _n_steps { 0.5 } else { 1.0 };
        _int_self_eq += _w * _t_self_eq_y * _b * _dy;
        _int_self_eq_y += _w * _t_self_eq_y * _b * (_y - _y_c) * _dy;
    }

    // Self-equilibrating: zero net force (integral of T_se * b * dy = 0)
    assert!(
        _int_self_eq.abs() < 0.01,
        "Self-equilibrating net force integral: {:.6e}, should be ~0",
        _int_self_eq
    );

    // Self-equilibrating: zero net moment (integral of T_se * b * (y-yc) * dy = 0)
    assert!(
        _int_self_eq_y.abs() < 0.01,
        "Self-equilibrating net moment integral: {:.6e}, should be ~0",
        _int_self_eq_y
    );

    // Self-equilibrating stresses: sigma_se = E * alpha * T_self_eq
    // At mid-depth, the parabolic component is maximized:
    // T_nl_mid = T_nl * 4 * 0.5 * 0.5 = T_nl = 10 degC
    // T_uniform at mid = T_uniform (constant)
    // T_linear at mid = T_uniform + 0 = T_uniform
    // T_self_eq at mid = T(h/2) - T_uniform - 0
    let _t_at_mid: f64 = _t_top + (_t_bot - _t_top) * 0.5 + _t_nl * 4.0 * 0.5 * 0.5;
    let _t_self_eq_mid: f64 = _t_at_mid - _t_uniform;

    let _alpha_conc: f64 = 10.0e-6;  // /degC
    let _e_conc: f64 = 30.0e3;       // MPa
    let _sigma_se_mid: f64 = _e_conc * _alpha_conc * _t_self_eq_mid;
    // Stress should be modest (< 10 MPa) for typical values
    assert!(
        _sigma_se_mid.abs() < 10.0,
        "Self-equilibrating stress at mid-depth: {:.3} MPa, should be < 10 MPa",
        _sigma_se_mid
    );
}

// ====================================================================
// 8. Solar Radiation Heating -- Surface Temperature Rise
// ====================================================================
//
// EN 1991-1-5, Annex A: Surface temperature from solar radiation:
//
//   DeltaT_surface = q_solar * R_se
//
// where:
//   q_solar = absorbed solar radiation (W/m^2) = alpha_abs * I_solar
//   R_se = external surface resistance (m^2*K/W) = 1 / (h_c + h_r)
//   h_c = convective heat transfer coefficient (W/m^2/K)
//   h_r = radiative heat transfer coefficient (W/m^2/K)
//   alpha_abs = solar absorptivity of the surface
//   I_solar = incident solar radiation (W/m^2)
//
// For a dark surface (alpha_abs=0.9), peak summer I_solar=1000 W/m^2:
//   q_solar = 0.9 * 1000 = 900 W/m^2
//
// With h_c = 25 W/m^2/K (moderate wind), h_r = 5.5 W/m^2/K:
//   R_se = 1/(25+5.5) = 1/30.5 = 0.03279 m^2*K/W
//   DeltaT = 900 * 0.03279 = 29.5 degC
//
// Reference: EN 1991-1-5:2003, Annex A and Section 5.3

#[test]
fn validation_thermal_solar_radiation_heating() {
    // --- Dark concrete surface in summer ---
    let _alpha_abs_dark: f64 = 0.9;      // solar absorptivity (dark surface)
    let _i_solar: f64 = 1000.0;           // W/m^2 (peak summer, horizontal)
    let _h_c: f64 = 25.0;                 // W/m^2/K convective coefficient (moderate wind)
    let _h_r: f64 = 5.5;                  // W/m^2/K radiative coefficient

    let _q_solar_dark: f64 = _alpha_abs_dark * _i_solar;
    let _r_se: f64 = 1.0 / (_h_c + _h_r);
    let _delta_t_dark: f64 = _q_solar_dark * _r_se;

    // Expected: q_solar = 0.9 * 1000 = 900 W/m^2
    let _q_expected: f64 = 900.0;
    let _err_q: f64 = (_q_solar_dark - _q_expected).abs();
    assert!(
        _err_q < 0.01,
        "Absorbed solar radiation (dark): {:.2} W/m^2, expected {:.2} W/m^2",
        _q_solar_dark, _q_expected
    );

    // R_se = 1/30.5 = 0.032787 m^2*K/W
    let _r_se_expected: f64 = 1.0 / 30.5;
    let _err_rse: f64 = (_r_se - _r_se_expected).abs();
    assert!(
        _err_rse < 1.0e-10,
        "Surface resistance: {:.6} m^2*K/W, expected {:.6} m^2*K/W",
        _r_se, _r_se_expected
    );

    // DeltaT = 900 * (1/30.5) = 29.508 degC
    let _delta_t_expected: f64 = 900.0 / 30.5;
    let _err_dt: f64 = (_delta_t_dark - _delta_t_expected).abs();
    assert!(
        _err_dt < 1.0e-6,
        "Surface temp rise (dark): {:.3} degC, expected {:.3} degC",
        _delta_t_dark, _delta_t_expected
    );

    // --- Light surface (e.g., white paint) ---
    let _alpha_abs_light: f64 = 0.3;
    let _q_solar_light: f64 = _alpha_abs_light * _i_solar;
    let _delta_t_light: f64 = _q_solar_light * _r_se;

    // Expected: 0.3 * 1000 / 30.5 = 300 / 30.5 = 9.836 degC
    let _delta_t_light_expected: f64 = 300.0 / 30.5;
    let _err_light: f64 = (_delta_t_light - _delta_t_light_expected).abs();
    assert!(
        _err_light < 1.0e-6,
        "Surface temp rise (light): {:.3} degC, expected {:.3} degC",
        _delta_t_light, _delta_t_light_expected
    );

    // Dark surface heats up more than light surface
    assert!(
        _delta_t_dark > _delta_t_light,
        "Dark surface DeltaT ({:.2}) > light surface DeltaT ({:.2})",
        _delta_t_dark, _delta_t_light
    );

    // Ratio of temperature rises = ratio of absorptivities
    let _ratio_dt: f64 = _delta_t_dark / _delta_t_light;
    let _ratio_alpha: f64 = _alpha_abs_dark / _alpha_abs_light;
    let _err_ratio: f64 = (_ratio_dt - _ratio_alpha).abs() / _ratio_alpha;
    assert!(
        _err_ratio < 1.0e-10,
        "Temperature rise ratio: {:.4}, expected absorptivity ratio {:.4}",
        _ratio_dt, _ratio_alpha
    );

    // --- Effect of wind speed on convective coefficient ---
    // High wind: h_c = 50 W/m^2/K -> smaller DeltaT
    let _h_c_high_wind: f64 = 50.0;
    let _r_se_windy: f64 = 1.0 / (_h_c_high_wind + _h_r);
    let _delta_t_windy: f64 = _q_solar_dark * _r_se_windy;
    // Expected: 900 / (50+5.5) = 900/55.5 = 16.216 degC
    let _delta_t_windy_expected: f64 = 900.0 / 55.5;
    let _err_windy: f64 = (_delta_t_windy - _delta_t_windy_expected).abs();
    assert!(
        _err_windy < 1.0e-6,
        "Surface temp rise (windy): {:.3} degC, expected {:.3} degC",
        _delta_t_windy, _delta_t_windy_expected
    );

    // Higher wind -> lower surface temperature
    assert!(
        _delta_t_windy < _delta_t_dark,
        "Windy DeltaT ({:.2}) < calm DeltaT ({:.2})",
        _delta_t_windy, _delta_t_dark
    );

    // Thermal stress from solar heating on restrained surface layer
    // sigma = E * alpha * DeltaT_surface
    let _e_conc: f64 = 30.0e3;          // MPa (concrete)
    let _alpha_conc: f64 = 10.0e-6;     // /degC
    let _sigma_solar: f64 = _e_conc * _alpha_conc * _delta_t_dark;
    // Expected: 30e3 * 10e-6 * 29.508 = 0.3 * 29.508 = 8.852 MPa
    let _sigma_expected: f64 = 30.0e3 * 10.0e-6 * (900.0 / 30.5);
    let _err_sigma: f64 = (_sigma_solar - _sigma_expected).abs();
    assert!(
        _err_sigma < 1.0e-6,
        "Solar thermal stress: {:.3} MPa, expected {:.3} MPa",
        _sigma_solar, _sigma_expected
    );

    // Stress should be significant but below concrete tensile strength (~3 MPa for grade C30?)
    // Actually 8.85 MPa > tensile strength, which is why solar cracking is a real concern
    assert!(
        _sigma_solar > 5.0,
        "Solar thermal stress ({:.2} MPa) should be significant (> 5 MPa), highlighting cracking risk",
        _sigma_solar
    );
}
