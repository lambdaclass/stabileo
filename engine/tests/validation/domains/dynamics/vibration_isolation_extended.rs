/// Validation: Extended Vibration Isolation — Analytical Formulas & FEM Checks
///
/// References:
///   - Den Hartog, "Mechanical Vibrations", 4th ed. (1956)
///   - Harris & Piersol, "Harris' Shock and Vibration Handbook", 6th ed. (2010)
///   - Chopra, "Dynamics of Structures", 5th ed. (2017)
///   - Nashif, Jones & Henderson, "Vibration Damping" (1985)
///   - Barkan, "Dynamics of Bases and Foundations" (1962)
///   - Richart, Hall & Woods, "Vibrations of Soils and Foundations" (1970)
///   - Soong & Dargush, "Passive Energy Dissipation Systems" (1997)
///   - Preumont, "Vibration Control of Active Structures", 3rd ed. (2011)
///
/// Tests verify transmissibility, isolation efficiency, rubber bearings,
/// steel spring isolators, inertia block effects, viscoelastic dampers,
/// active vibration control, and machine foundation design criteria.

use crate::common::*;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

// ================================================================
// 1. Single-DOF Transmissibility
// ================================================================
//
// Transmissibility for a viscously damped SDOF system:
//   TR = sqrt((1 + (2*xi*r)^2) / ((1 - r^2)^2 + (2*xi*r)^2))
//
// where r = omega / omega_n  (frequency ratio)
//       xi = damping ratio
//
// Key properties:
//   - TR = 1 at r = 0 (static)
//   - TR peaks near r = 1 (resonance amplification)
//   - TR = 1 at r = sqrt(2), regardless of damping
//   - TR < 1 for r > sqrt(2) (isolation region)
//
// Ref: Den Hartog Ch. 2; Chopra Ch. 3

#[test]
fn validation_vib_iso_ext_single_dof_transmissibility() {
    // Transmissibility function
    let tr_func = |r: f64, xi: f64| -> f64 {
        let num: f64 = 1.0 + (2.0 * xi * r).powi(2);
        let den: f64 = (1.0 - r * r).powi(2) + (2.0 * xi * r).powi(2);
        (num / den).sqrt()
    };

    let xi: f64 = 0.05; // 5% damping

    // --- r = 0: static case, TR = 1 ---
    let tr_static: f64 = tr_func(0.0, xi);
    assert_close(tr_static, 1.0, 0.01, "TR at r=0 (static)");

    // --- r = 1 (resonance): TR = sqrt(1 + (2*xi)^2) / (2*xi) ---
    let r_res: f64 = 1.0;
    let tr_res: f64 = tr_func(r_res, xi);
    let tr_res_exact: f64 = (1.0 + (2.0 * xi).powi(2)).sqrt() / (2.0 * xi);
    assert_close(tr_res, tr_res_exact, 0.01, "TR at resonance r=1");
    // For 5% damping: ~10.05
    assert!(tr_res > 9.0, "TR at resonance should be large for low damping, got {:.2}", tr_res);

    // --- r = sqrt(2): TR = 1 regardless of damping ---
    let r_cross: f64 = 2.0_f64.sqrt();
    let tr_cross_low: f64 = tr_func(r_cross, 0.01);
    let tr_cross_high: f64 = tr_func(r_cross, 0.30);
    assert_close(tr_cross_low, 1.0, 0.01, "TR at r=sqrt(2) with xi=1%");
    assert_close(tr_cross_high, 1.0, 0.01, "TR at r=sqrt(2) with xi=30%");

    // --- r = 3 (isolation region): TR < 1 ---
    let r_iso: f64 = 3.0;
    let tr_iso: f64 = tr_func(r_iso, xi);
    assert!(tr_iso < 0.20, "TR at r=3 should be well below 1, got {:.4}", tr_iso);

    // Verify exact formula at r=3, xi=0.05
    let num_exact: f64 = 1.0 + (2.0 * 0.05 * 3.0_f64).powi(2);
    let den_exact: f64 = (1.0 - 9.0_f64).powi(2) + (2.0 * 0.05 * 3.0_f64).powi(2);
    let tr_exact: f64 = (num_exact / den_exact).sqrt();
    assert_close(tr_iso, tr_exact, 0.01, "TR at r=3 exact formula check");

    // In isolation region, lower damping gives BETTER isolation
    let tr_iso_lowdamp: f64 = tr_func(r_iso, 0.01);
    let tr_iso_highdamp: f64 = tr_func(r_iso, 0.30);
    assert!(tr_iso_lowdamp < tr_iso_highdamp,
        "Lower damping gives better isolation: TR(0.01)={:.4} < TR(0.30)={:.4}",
        tr_iso_lowdamp, tr_iso_highdamp);

    // Structural verification: beam on spring, check force transmitted
    // Model: fixed-free beam with a spring support at free end
    // Under lateral load F at free end, the spring force = k * delta
    // TR_structural ~ F_spring / F_applied approaches TR analytical
    let l: f64 = 4.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;

    // Beam lateral stiffness (cantilever): k_beam = 3*EI/L^3
    let k_beam: f64 = 3.0 * e_eff * iz / (l * l * l);
    // Spring stiffness chosen so that F_spring / F_applied is computable
    let k_spring: f64 = k_beam * 0.5; // kN/m

    let f_applied: f64 = 10.0; // kN

    // Analytical: delta = F / (k_beam + k_spring) -- simplified series
    // Actually for cantilever with spring at tip:
    // delta_tip = F / (3EI/L^3 + k_spring) for axial direction
    // We'll use axial model instead for clean verification
    let k_axial: f64 = e_eff * a / l;
    let delta_exact: f64 = f_applied / (k_axial + k_spring);
    let f_spring_exact: f64 = k_spring * delta_exact;
    let tr_structural: f64 = f_spring_exact / f_applied;

    // Build axial model
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: l, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "spring".to_string(),
        kx: Some(k_spring), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_applied, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "Transmissibility structural model: tip displacement");

    // Verify that TR_structural < 1 (spring absorbs only a fraction)
    assert!(tr_structural < 1.0,
        "TR_structural = {:.4} < 1.0: spring transmits fraction of force", tr_structural);
}

// ================================================================
// 2. Isolation Efficiency
// ================================================================
//
// Isolation efficiency: IE = (1 - TR) * 100%
//
// For 90% isolation efficiency (IE = 90%, TR = 0.10):
//   Undamped case (xi = 0):
//     TR = 1 / |1 - r^2| < 0.10  (for r > sqrt(2))
//     => r^2 - 1 > 10 => r^2 > 11 => r > sqrt(11) = 3.317
//
//   With damping, slightly higher r is needed.
//
// Ref: Harris & Piersol, Ch. 30

#[test]
fn validation_vib_iso_ext_isolation_efficiency() {
    let tr_func = |r: f64, xi: f64| -> f64 {
        let num: f64 = 1.0 + (2.0 * xi * r).powi(2);
        let den: f64 = (1.0 - r * r).powi(2) + (2.0 * xi * r).powi(2);
        (num / den).sqrt()
    };

    // --- Undamped case: xi = 0 ---
    // TR = 1 / |r^2 - 1| for r > 1
    // For 90% isolation: TR = 0.10 => r^2 - 1 = 10 => r = sqrt(11)
    let r_90_undamped: f64 = 11.0_f64.sqrt();
    let tr_90_undamped: f64 = tr_func(r_90_undamped, 0.0);
    let ie_undamped: f64 = (1.0 - tr_90_undamped) * 100.0;
    assert_close(ie_undamped, 90.0, 0.02, "IE=90% at r=sqrt(11) undamped");

    // --- 5% damping ---
    let xi: f64 = 0.05;
    let tr_at_sqrt11: f64 = tr_func(r_90_undamped, xi);
    let ie_at_sqrt11: f64 = (1.0 - tr_at_sqrt11) * 100.0;
    // With damping, TR is slightly higher in isolation region => IE < 90%
    assert!(ie_at_sqrt11 < 90.0,
        "With damping, IE at r=sqrt(11) = {:.2}% < 90%", ie_at_sqrt11);

    // Check a range of frequency ratios and verify monotonic IE increase
    let ratios: [f64; 5] = [2.0, 3.0, 4.0, 5.0, 6.0];
    let mut prev_ie: f64 = 0.0;
    for &r in &ratios {
        let tr_val: f64 = tr_func(r, xi);
        let ie_val: f64 = (1.0 - tr_val) * 100.0;
        assert!(ie_val > prev_ie,
            "IE should increase with r: IE(r={})={:.2}% > prev {:.2}%", r, ie_val, prev_ie);
        prev_ie = ie_val;
    }

    // For r=5, xi=0.05: excellent isolation
    let tr_r5: f64 = tr_func(5.0, xi);
    let ie_r5: f64 = (1.0 - tr_r5) * 100.0;
    assert!(ie_r5 > 95.0, "IE at r=5 = {:.2}% > 95%", ie_r5);

    // Verify formula: for undamped case, IE = 1 - 1/(r^2-1) for r>sqrt(2)
    let r_test: f64 = 4.0;
    let ie_formula: f64 = (1.0 - 1.0 / (r_test * r_test - 1.0)) * 100.0;
    let ie_numerical: f64 = (1.0 - tr_func(r_test, 0.0)) * 100.0;
    assert_close(ie_formula, ie_numerical, 0.01,
        "Undamped IE formula matches numerical at r=4");

    // Structural check: two spring models with different stiffness ratios
    // Stiffer isolator (smaller r) transmits more force
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let _iz: f64 = 1e-4;
    let l: f64 = 2.0;
    let e_eff: f64 = e * 1000.0;
    let k_beam: f64 = e_eff * a / l;
    let f_applied: f64 = 50.0;

    // Stiff isolator spring
    let k_stiff: f64 = k_beam * 2.0;
    let delta_stiff: f64 = f_applied / (k_beam + k_stiff);
    let f_trans_stiff: f64 = k_stiff * delta_stiff;

    // Soft isolator spring
    let k_soft: f64 = k_beam * 0.1;
    let delta_soft: f64 = f_applied / (k_beam + k_soft);
    let f_trans_soft: f64 = k_soft * delta_soft;

    // Softer spring transmits less force (better isolation)
    assert!(f_trans_soft < f_trans_stiff,
        "Soft spring transmits less: {:.2} < {:.2} kN", f_trans_soft, f_trans_stiff);
}

// ================================================================
// 3. Rubber Bearing Stiffness
// ================================================================
//
// Elastomeric bearing horizontal stiffness:
//   K_h = G * A / h
//
// where G = shear modulus (0.4-1.0 MPa for natural rubber)
//       A = bonded rubber area (m^2)
//       h = total rubber thickness (m)
//
// Shape factor: S = D / (4*t) for circular bearings
// where D = diameter, t = individual layer thickness.
//
// Structural verification: horizontal beam with axial spring = K_h
// at the tip. Under axial load F, delta = F / (EA/L + K_h).
//
// Ref: Naeim & Kelly (1999) Ch. 3; EN 15129 Section 8

#[test]
fn validation_vib_iso_ext_rubber_bearing_stiffness() {
    // Bearing geometry
    let d_bearing: f64 = 0.600;      // m, diameter
    let t_layer: f64 = 0.010;        // m, individual layer thickness
    let n_layers: f64 = 15.0;
    let h: f64 = t_layer * n_layers;  // m, total rubber height = 0.15 m
    let a_bearing: f64 = PI * d_bearing * d_bearing / 4.0; // m^2

    // Shear modulus (natural rubber at 100% shear strain)
    let g_rubber: f64 = 0.60; // MPa = 0.60 N/mm^2 = 600 kN/m^2

    // Horizontal stiffness: K_h = G * A / h
    let g_kn_m2: f64 = g_rubber * 1000.0; // kN/m^2
    let k_h: f64 = g_kn_m2 * a_bearing / h;
    // = 600 * 0.2827 / 0.15 = 1130.97 kN/m

    // Shape factor: S = D / (4*t)
    let s_factor: f64 = d_bearing / (4.0 * t_layer);
    assert_close(s_factor, 15.0, 0.01, "Shape factor S = D/(4t)");
    assert!(s_factor > 10.0, "S={:.1} > 10 for good confinement", s_factor);

    // Verify stiffness scales linearly with G
    let g_high: f64 = 1.0 * 1000.0; // kN/m^2
    let k_h_high: f64 = g_high * a_bearing / h;
    let stiffness_ratio: f64 = k_h_high / k_h;
    let g_ratio: f64 = g_high / g_kn_m2;
    assert_close(stiffness_ratio, g_ratio, 0.01,
        "K_h scales linearly with G");

    // Structural verification: axial beam + spring = K_h
    let l: f64 = 2.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;
    let k_beam: f64 = e_eff * a / l;

    let f_applied: f64 = 100.0; // kN
    let delta_exact: f64 = f_applied / (k_beam + k_h);

    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: l, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "spring".to_string(),
        kx: Some(k_h), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_applied, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "Rubber bearing: model delta = F/(EA/L + K_h)");

    // Force transmitted through spring
    let f_spring: f64 = k_h * tip.ux;
    let f_spring_exact: f64 = k_h * delta_exact;
    assert_close(f_spring, f_spring_exact, 0.02,
        "Rubber bearing: spring force = K_h * delta");
}

// ================================================================
// 4. Steel Spring Isolator
// ================================================================
//
// Natural frequency: f_n = (1 / (2*pi)) * sqrt(k / m)
// Static deflection under gravity: delta_st = m*g / k = g / omega_n^2
//
// Relationship: f_n = (1 / (2*pi)) * sqrt(g / delta_st)
//   => delta_st = g / (2*pi*f_n)^2
//
// For f_n = 3 Hz: delta_st = 9.81 / (2*pi*3)^2 = 9.81 / 355.3 = 0.0276 m
//
// Ref: Harris & Piersol Ch. 30; Den Hartog Ch. 2

#[test]
fn validation_vib_iso_ext_steel_spring_isolator() {
    let g: f64 = 9.81; // m/s^2

    // Machine parameters
    let m: f64 = 500.0; // kg
    let w: f64 = m * g;  // N = 4905 N

    // Target natural frequency
    let fn_target: f64 = 3.0; // Hz
    let omega_n: f64 = 2.0 * PI * fn_target;

    // Required spring stiffness
    let k: f64 = m * omega_n * omega_n;
    // = 500 * (6*pi)^2 = 500 * 355.3 = 177653 N/m

    // Verify natural frequency
    let fn_check: f64 = (1.0 / (2.0 * PI)) * (k / m).sqrt();
    assert_close(fn_check, fn_target, 0.01, "Natural frequency f_n = (1/2pi)*sqrt(k/m)");

    // Static deflection
    let delta_st: f64 = w / k;
    // Also: delta_st = g / omega_n^2
    let delta_st_alt: f64 = g / (omega_n * omega_n);
    assert_close(delta_st, delta_st_alt, 0.01, "Static deflection: mg/k = g/omega_n^2");

    // Frequency from static deflection
    let fn_from_delta: f64 = (1.0 / (2.0 * PI)) * (g / delta_st).sqrt();
    assert_close(fn_from_delta, fn_target, 0.01,
        "f_n from delta_st: (1/2pi)*sqrt(g/delta_st)");

    // For different target frequencies, verify delta_st relationship
    let frequencies: [f64; 4] = [2.0, 3.0, 5.0, 10.0];
    let mut prev_delta: f64 = f64::MAX;
    for &f in &frequencies {
        let omega: f64 = 2.0 * PI * f;
        let delta: f64 = g / (omega * omega);
        // Higher frequency => smaller static deflection
        assert!(delta < prev_delta,
            "delta_st decreases with frequency: f={:.0}Hz, delta={:.4}m", f, delta);
        prev_delta = delta;
    }

    // Verify: doubling mass halves natural frequency
    let fn_2m: f64 = (1.0 / (2.0 * PI)) * (k / (2.0 * m)).sqrt();
    let expected_ratio: f64 = 1.0 / 2.0_f64.sqrt();
    assert_close(fn_2m / fn_target, expected_ratio, 0.01,
        "Doubling mass: f_n ratio = 1/sqrt(2)");

    // Structural model: beam on spring with gravity-like axial load
    // delta = F / (EA/L + k_spring)
    let l: f64 = 2.0;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;
    let k_beam: f64 = e_eff * a_sec / l;

    // Convert spring stiffness to kN/m
    let k_spring_kn: f64 = k / 1000.0;
    let f_applied_kn: f64 = w / 1000.0;
    let delta_exact: f64 = f_applied_kn / (k_beam + k_spring_kn);

    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: l, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: a_sec, iz, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "spring".to_string(),
        kx: Some(k_spring_kn), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_applied_kn, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "Steel spring isolator: FEM delta matches analytical");
}

// ================================================================
// 5. Inertia Block Foundation
// ================================================================
//
// Adding an inertia block (mass m_b) to a machine (mass m_m)
// reduces the natural frequency of the isolated system:
//
//   f_n_original = (1 / (2*pi)) * sqrt(k / m_m)
//   f_n_with_block = (1 / (2*pi)) * sqrt(k / (m_m + m_b))
//
// Frequency reduction ratio:
//   f_n_with_block / f_n_original = sqrt(m_m / (m_m + m_b))
//
// Typical mass ratios: m_b = 1.5 to 5 times m_m
//
// Ref: Barkan (1962) Ch. 6; Harris & Piersol Ch. 31

#[test]
fn validation_vib_iso_ext_inertia_block_foundation() {
    let g: f64 = 9.81;

    // Machine mass
    let m_machine: f64 = 2000.0; // kg

    // Isolator stiffness (4 springs, total)
    let k_total: f64 = 500_000.0; // N/m

    // Original natural frequency (machine only)
    let fn_original: f64 = (1.0 / (2.0 * PI)) * (k_total / m_machine).sqrt();

    // Inertia block: 3 times machine mass (typical heavy-duty)
    let m_block: f64 = 3.0 * m_machine; // 6000 kg
    let m_total: f64 = m_machine + m_block;

    // New natural frequency with inertia block
    let fn_with_block: f64 = (1.0 / (2.0 * PI)) * (k_total / m_total).sqrt();

    // Frequency reduction ratio
    let freq_ratio: f64 = fn_with_block / fn_original;
    let expected_ratio: f64 = (m_machine / m_total).sqrt();
    assert_close(freq_ratio, expected_ratio, 0.01,
        "Frequency ratio = sqrt(m_m/(m_m+m_b))");

    // With m_b = 3*m_m: ratio = sqrt(1/4) = 0.5
    assert_close(freq_ratio, 0.5, 0.01,
        "3x inertia block halves the natural frequency");

    // Lower frequency means machine operates at higher frequency ratio r
    // which improves isolation
    let f_operating: f64 = 25.0; // Hz (machine operating frequency)
    let r_original: f64 = f_operating / fn_original;
    let r_with_block: f64 = f_operating / fn_with_block;

    assert!(r_with_block > r_original,
        "Inertia block increases r: {:.2} > {:.2}", r_with_block, r_original);

    // Compute transmissibility improvement
    let xi: f64 = 0.05;
    let tr_func = |r: f64, z: f64| -> f64 {
        let num: f64 = 1.0 + (2.0 * z * r).powi(2);
        let den: f64 = (1.0 - r * r).powi(2) + (2.0 * z * r).powi(2);
        (num / den).sqrt()
    };

    let tr_original: f64 = tr_func(r_original, xi);
    let tr_with_block: f64 = tr_func(r_with_block, xi);

    assert!(tr_with_block < tr_original,
        "Inertia block reduces TR: {:.4} < {:.4}", tr_with_block, tr_original);

    // Verify static deflection increases (softer system)
    let delta_st_original: f64 = m_machine * g / k_total;
    let delta_st_with_block: f64 = m_total * g / k_total;
    assert_close(delta_st_with_block / delta_st_original, m_total / m_machine, 0.01,
        "Static deflection ratio = mass ratio");

    // Structural verification: two axial spring models with different spring stiffness
    // simulating the effect of added mass (by reducing equivalent stiffness)
    let e: f64 = 200_000.0;
    let a: f64 = 0.01;
    let iz: f64 = 1e-4;
    let l: f64 = 2.0;
    let e_eff: f64 = e * 1000.0;
    let k_beam: f64 = e_eff * a / l;

    // Same force, two different spring stiffnesses representing the mass change
    // In isolation: F = m*a, so for same acceleration, F_new = (m_m+m_b)*a = 4*m_m*a
    // Under 4x force with same springs, displacement is 4x
    let f_original: f64 = 10.0; // kN
    let f_with_block: f64 = f_original * m_total / m_machine; // 40 kN (4x gravity)

    let k_spring_kn: f64 = k_total / 1000.0;
    let delta1_exact: f64 = f_original / (k_beam + k_spring_kn);
    let delta2_exact: f64 = f_with_block / (k_beam + k_spring_kn);

    assert_close(delta2_exact / delta1_exact, m_total / m_machine, 0.01,
        "Displacement ratio = mass ratio for same spring");

    // Build model for the original case
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: l, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a, iz, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "spring".to_string(),
        kx: Some(k_spring_kn), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_original, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta1_exact, 0.02,
        "Inertia block: FEM delta matches analytical");
}

// ================================================================
// 6. Viscoelastic Damper — Loss Factor and Equivalent Damping
// ================================================================
//
// Viscoelastic material is characterized by:
//   - Storage modulus G' (elastic component)
//   - Loss modulus G'' (dissipative component)
//   - Loss factor: eta = G'' / G'
//
// Equivalent viscous damping at resonance:
//   xi = eta / 2
//
// Energy dissipated per cycle (for strain amplitude gamma_0):
//   W_d = pi * G'' * gamma_0^2 * Volume
//       = pi * eta * G' * gamma_0^2 * Volume
//
// Maximum stored energy:
//   W_s = 0.5 * G' * gamma_0^2 * Volume
//
// Relationship: eta = W_d / (2 * pi * W_s)
//
// Ref: Nashif et al. (1985); Soong & Dargush (1997) Ch. 4

#[test]
fn validation_vib_iso_ext_viscoelastic_damper() {
    // Material properties
    let g_storage: f64 = 2.5;    // MPa, storage modulus G'
    let eta: f64 = 0.40;         // loss factor (typical for VE damper)
    let g_loss: f64 = eta * g_storage; // MPa, loss modulus G''

    // Verify loss factor definition
    assert_close(g_loss / g_storage, eta, 0.01,
        "Loss factor eta = G''/G'");

    // Equivalent viscous damping ratio at resonance
    let xi_equiv: f64 = eta / 2.0;
    assert_close(xi_equiv, 0.20, 0.01,
        "Equivalent viscous damping xi = eta/2 at resonance");

    // Damper geometry
    let area: f64 = 0.04;       // m^2, shear area
    let thickness: f64 = 0.020;  // m, VE material thickness
    let volume: f64 = area * thickness;

    // At design shear strain gamma_0
    let gamma_0: f64 = 0.50;     // 50% shear strain
    let displacement: f64 = gamma_0 * thickness; // m

    // Energy per cycle
    let g_storage_kn: f64 = g_storage * 1000.0; // kN/m^2
    let g_loss_kn: f64 = g_loss * 1000.0;       // kN/m^2
    let w_d: f64 = PI * g_loss_kn * gamma_0 * gamma_0 * volume;

    // Maximum stored energy
    let w_s: f64 = 0.5 * g_storage_kn * gamma_0 * gamma_0 * volume;

    // Verify: eta = W_d / (2*pi*W_s)
    let eta_from_energy: f64 = w_d / (2.0 * PI * w_s);
    assert_close(eta_from_energy, eta, 0.01,
        "Loss factor from energy ratio: W_d/(2*pi*W_s)");

    // Damper stiffness: K_d = G' * A / t
    let k_d: f64 = g_storage_kn * area / thickness;
    // = 2500 * 0.04 / 0.02 = 5000 kN/m

    // Force at design displacement
    let f_design: f64 = k_d * displacement;
    // = 5000 * 0.01 = 50 kN

    // Complex stiffness magnitude: K* = K_d * sqrt(1 + eta^2)
    let k_star: f64 = k_d * (1.0 + eta * eta).sqrt();
    assert!(k_star > k_d,
        "Complex stiffness |K*| = {:.1} > K_d = {:.1}", k_star, k_d);

    // Temperature effect: G' typically decreases with temperature
    // At T=20C: G'=2.5 MPa; at T=40C: G' might be 1.5 MPa (40% reduction)
    let g_hot: f64 = 1.5;
    let k_hot: f64 = g_hot * 1000.0 * area / thickness;
    assert!(k_hot < k_d,
        "Higher temperature reduces stiffness: {:.0} < {:.0} kN/m", k_hot, k_d);

    // Structural model: beam with VE spring stiffness
    let l: f64 = 2.0;
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 1e-4;
    let e_eff: f64 = e * 1000.0;
    let k_beam: f64 = e_eff * a_sec / l;

    let f_applied: f64 = f_design;
    let delta_exact: f64 = f_applied / (k_beam + k_d);

    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode { id: 1, x: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode { id: 2, x: l, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: a_sec, iz, as_y: None });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement {
        id: 1, elem_type: "frame".to_string(),
        node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });

    let mut sups = HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "fixed".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: 2, support_type: "spring".to_string(),
        kx: Some(k_d), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_applied, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: sups, loads, constraints: vec![],
        connectors: HashMap::new(), };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "VE damper: FEM delta matches analytical");
}

// ================================================================
// 7. Active Vibration Control — Feedback Gain for Target Damping
// ================================================================
//
// For a SDOF system with velocity feedback control:
//   m*x_ddot + (c + g_v)*x_dot + k*x = F(t)
//
// where g_v = velocity feedback gain (added damping).
//
// Effective damping ratio:
//   xi_eff = (c + g_v) / (2 * sqrt(k * m))
//
// To increase damping from xi_0 to xi_target:
//   g_v = 2 * sqrt(k * m) * (xi_target - xi_0)
//      = c_cr * (xi_target - xi_0)
//
// Control force: F_control = g_v * v_max
// Control power: P = F_control * v_max = g_v * v_max^2
//
// Ref: Preumont (2011) Ch. 1-3; Soong & Dargush (1997) Ch. 8

#[test]
fn validation_vib_iso_ext_active_vibration_control() {
    // Structural SDOF parameters
    let m: f64 = 5000.0;          // kg, modal mass
    let k: f64 = 2_000_000.0;    // N/m, modal stiffness
    let xi_0: f64 = 0.02;         // 2% inherent damping

    // Derived quantities
    let omega_n: f64 = (k / m).sqrt();
    let c_cr: f64 = 2.0 * (k * m).sqrt(); // critical damping
    let c_0: f64 = xi_0 * c_cr;            // inherent damping coefficient

    // Verify inherent damping
    let xi_check: f64 = c_0 / c_cr;
    assert_close(xi_check, xi_0, 0.01, "Inherent damping xi = c/c_cr");

    // Target: increase damping to 10%
    let xi_target: f64 = 0.10;

    // Required feedback gain
    let g_v: f64 = c_cr * (xi_target - xi_0);
    // = c_cr * 0.08

    // Verify effective damping
    let xi_eff: f64 = (c_0 + g_v) / c_cr;
    assert_close(xi_eff, xi_target, 0.01,
        "Effective damping with active control = xi_target");

    // Response reduction at resonance
    // Uncontrolled peak: H_0 = 1/(2*xi_0) = 25
    // Controlled peak:   H_c = 1/(2*xi_target) = 5
    let h_uncontrolled: f64 = 1.0 / (2.0 * xi_0);
    let h_controlled: f64 = 1.0 / (2.0 * xi_target);
    let reduction_factor: f64 = h_controlled / h_uncontrolled;
    assert_close(reduction_factor, xi_0 / xi_target, 0.01,
        "Peak response reduction = xi_0/xi_target");
    assert_close(reduction_factor, 0.2, 0.01,
        "80% reduction in peak resonant response");

    // Control force at max velocity
    let x_max: f64 = 0.005;       // m, displacement amplitude
    let v_max: f64 = omega_n * x_max;
    let f_control: f64 = g_v * v_max;
    assert!(f_control > 0.0,
        "Control force = {:.1} N at max velocity", f_control);

    // Power requirement
    let power_max_w: f64 = f_control * v_max;
    let power_max_kw: f64 = power_max_w / 1000.0;
    assert!(power_max_kw > 0.0,
        "Max control power = {:.3} kW", power_max_kw);

    // Gain margin check: if gain is doubled, damping is still stable
    let xi_double_gain: f64 = (c_0 + 2.0 * g_v) / c_cr;
    assert!(xi_double_gain < 1.0,
        "Doubled gain still gives xi < 1 (stable): xi = {:.3}", xi_double_gain);

    // Structural verification using portal frame under lateral load
    // Compare displacement with two different force levels
    // representing uncontrolled vs controlled response
    let e: f64 = 200_000.0;
    let a: f64 = 0.02;
    let iz: f64 = 2e-4;
    let h: f64 = 4.0;
    let w: f64 = 6.0;

    // Full force (uncontrolled resonant response)
    let f_full: f64 = 100.0; // kN reference
    // Reduced force (controlled — response is xi_0/xi_target of uncontrolled)
    let f_reduced: f64 = f_full * reduction_factor;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    // Uncontrolled
    let loads_full = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_full, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_full, fz: 0.0, my: 0.0 }),
    ];
    let input_full = make_input(nodes.clone(), vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems.clone(), sups.clone(), loads_full);
    let results_full = linear::solve_2d(&input_full).unwrap();
    let d_full: f64 = results_full.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Controlled (reduced force represents reduced resonant amplitude)
    let loads_reduced = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_reduced, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_reduced, fz: 0.0, my: 0.0 }),
    ];
    let input_reduced = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems, sups, loads_reduced);
    let results_reduced = linear::solve_2d(&input_reduced).unwrap();
    let d_reduced: f64 = results_reduced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Linear: displacement ratio = force ratio = reduction_factor
    assert_close(d_reduced / d_full, reduction_factor, 0.02,
        "Active control: drift ratio matches reduction factor");
}

// ================================================================
// 8. Machine Foundation Design — Barkan/Richart Criteria
// ================================================================
//
// Machine foundation design criteria (Barkan 1962, Richart et al. 1970):
//
// 1. Natural frequency criterion: f_n < f_operating / sqrt(2)
//    (ensures r > sqrt(2) and isolation region)
//
// 2. Allowable vibration amplitude depends on frequency:
//    (Richart chart for "barely perceptible to persons"):
//      A_allow = 0.25 mm at 1 Hz, decreasing at higher frequencies
//      Velocity criterion: v = 2*pi*f*A < v_allow
//      Typical v_allow = 2.5 mm/s for sensitive equipment
//
// 3. Foundation mass ratio: m_foundation / m_machine >= 3
//
// 4. Static safety factor: bearing capacity check
//
// Structural model: portal frame representing a machine table on
// columns. Applied lateral force = machine unbalance force.
// Verify reactions and equilibrium.
//
// Ref: Barkan (1962); Richart, Hall & Woods (1970) Ch. 10;
//      ACI 351.3R-18: Foundations for Dynamic Equipment

#[test]
fn validation_vib_iso_ext_machine_foundation_design() {
    // Machine parameters
    let m_machine: f64 = 3000.0;        // kg
    let f_operating: f64 = 30.0;        // Hz, operating frequency
    let f_unbalance: f64 = 5000.0;      // N, unbalance force amplitude
    let omega_op: f64 = 2.0 * PI * f_operating;

    // --- Criterion 1: Natural frequency check ---
    // f_n must be less than f_operating / sqrt(2) for isolation
    let fn_max_allowed: f64 = f_operating / 2.0_f64.sqrt();
    // = 30 / 1.414 = 21.21 Hz

    // Design foundation + isolator system with f_n = 10 Hz (well below limit)
    let fn_design: f64 = 10.0;
    assert!(fn_design < fn_max_allowed,
        "f_n={:.1}Hz < f_op/sqrt(2)={:.1}Hz: isolation criterion satisfied",
        fn_design, fn_max_allowed);

    // Frequency ratio
    let r: f64 = f_operating / fn_design;
    assert!(r > 2.0_f64.sqrt(),
        "r={:.2} > sqrt(2): operating in isolation region", r);

    // Transmissibility
    let xi: f64 = 0.05;
    let num: f64 = 1.0 + (2.0 * xi * r).powi(2);
    let den: f64 = (1.0 - r * r).powi(2) + (2.0 * xi * r).powi(2);
    let tr: f64 = (num / den).sqrt();
    assert!(tr < 0.20,
        "TR = {:.4} < 0.20: good isolation at r={:.1}", tr, r);

    // --- Criterion 2: Allowable vibration amplitude ---
    // Transmitted force
    let _f_transmitted: f64 = f_unbalance as f64 * tr; // N

    // Foundation mass (3x machine mass per Barkan)
    let m_foundation: f64 = 3.0 * m_machine;
    let m_total: f64 = m_machine + m_foundation;

    // Required stiffness for target f_n
    let omega_n: f64 = 2.0 * PI * fn_design;
    let k_required: f64 = m_total * omega_n * omega_n;

    // Vibration amplitude at operating frequency
    // X = F0 / (k * sqrt((1-r^2)^2 + (2*xi*r)^2))
    let dmf_den: f64 = ((1.0 - r * r).powi(2) + (2.0 * xi * r).powi(2)).sqrt();
    let x_amplitude: f64 = (f_unbalance / k_required) / dmf_den;
    let _x_amplitude_mm: f64 = x_amplitude * 1000.0;

    // Velocity amplitude
    let v_amplitude: f64 = omega_op * x_amplitude;
    let v_amplitude_mm_s: f64 = v_amplitude * 1000.0;

    // Richart velocity criterion: v < 2.5 mm/s for sensitive equipment
    let v_allow: f64 = 2.5; // mm/s
    assert!(v_amplitude_mm_s < v_allow,
        "Velocity {:.3} mm/s < {:.1} mm/s: acceptable vibration", v_amplitude_mm_s, v_allow);

    // --- Criterion 3: Mass ratio check ---
    let mass_ratio: f64 = m_foundation / m_machine;
    assert!(mass_ratio >= 3.0,
        "Mass ratio {:.1} >= 3.0: Barkan criterion", mass_ratio);

    // --- Criterion 4: Frequency separation ---
    // Higher harmonics: 2nd harmonic at 2*f_operating should also be checked
    let r_2nd: f64 = 2.0 * f_operating / fn_design;
    let num_2nd: f64 = 1.0 + (2.0 * xi * r_2nd).powi(2);
    let den_2nd: f64 = (1.0 - r_2nd * r_2nd).powi(2) + (2.0 * xi * r_2nd).powi(2);
    let tr_2nd: f64 = (num_2nd / den_2nd).sqrt();
    assert!(tr_2nd < tr,
        "TR at 2nd harmonic ({:.5}) < TR at fundamental ({:.4}): better isolation",
        tr_2nd, tr);

    // Structural verification: portal frame as machine table
    // Columns support the machine table (beam), lateral load = unbalance force
    let e: f64 = 200_000.0;
    let a: f64 = 0.02;
    let iz: f64 = 2e-4;
    let h: f64 = 1.5;          // m, table height (short, stiff columns)
    let w_frame: f64 = 3.0;    // m, table width

    // Convert unbalance force to kN
    let f_unbalance_kn: f64 = f_unbalance / 1000.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w_frame, h), (4, w_frame, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f_unbalance_kn / 2.0, fz: 0.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: f_unbalance_kn / 2.0, fz: 0.0, my: 0.0,
        }),
    ];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of horizontal reactions = applied force
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, f_unbalance_kn, 0.02,
        "Machine foundation: horizontal equilibrium");

    // Vertical equilibrium: no vertical load => ry should be near zero sum
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum::<f64>().abs();
    assert!(sum_ry < 0.01,
        "Machine foundation: vertical reactions sum near zero = {:.6}", sum_ry);

    // Verify lateral displacement is consistent (both nodes should move similarly)
    let d2: f64 = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;
    let d3: f64 = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux;

    // Both beam-level nodes should displace in the same direction
    assert!(d2 > 0.0 && d3 > 0.0,
        "Both top nodes displace in load direction: d2={:.6e}, d3={:.6e}", d2, d3);
}
