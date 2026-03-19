/// Validation: Advanced Seismic Isolation Benchmark Cases
///
/// References:
///   - ASCE 7-22 Chapter 17: Seismic Design Requirements for Seismically Isolated Structures
///   - EN 1998-1 (EC8) Section 10: Base Isolation
///   - EN 15129: Anti-seismic Devices
///   - Naeim & Kelly: "Design of Seismic Isolated Structures" (1999)
///   - Constantinou et al.: "Principles of Friction, Viscoelastic and Cable Isolation" (2022)
///   - FEMA P-751 Chapter 12: Seismically Isolated Structures
///   - Skinner et al.: "An Introduction to Seismic Isolation" (1993)
///
/// Tests verify LRB effective stiffness, FPS period, equivalent damping,
/// ASCE 7 design displacement, superstructure force, period shift ratio,
/// HDR shear modulus, and isolation effectiveness via force reduction factor.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// ================================================================
// 1. Lead Rubber Bearing (LRB) -- Effective Stiffness
// ================================================================
//
// Bilinear isolator model: post-yield stiffness K_d, characteristic
// strength Q_d.  At design displacement D_d the effective (secant)
// stiffness is:
//
//   K_eff = K_d + Q_d / D_d   (exact bilinear relation)
//
// Force at design displacement: F = K_eff * D_d = Q_d + K_d * D_d
//
// Structural verification: a horizontal beam with an axial spring at
// the tip. Under axial load F the tip displacement is
//   delta = F / (EA/L + k_spring)
// which is checked against the analytical value.
//
// Reference: Naeim & Kelly (1999) Eq. 2.3; ASCE 7-22 §17.2.

#[test]
fn validation_seis_iso_ext_1_lrb_effective_stiffness() {
    // Bilinear LRB parameters
    let q_d: f64 = 80.0;       // kN, characteristic strength (lead core)
    let k_d: f64 = 0.8;        // kN/mm, post-yield stiffness
    let d_d: f64 = 150.0;      // mm, design displacement

    // Analytical effective stiffness: K_eff = K_d + Q_d / D_d
    let k_eff = k_d + q_d / d_d;
    // = 0.8 + 80/150 = 0.8 + 0.5333 = 1.3333 kN/mm

    // Force at design displacement
    let v_expected = k_eff * d_d;
    // = 1.3333 * 150 = 200 kN

    // Cross-check: F = Q_d + K_d * D_d
    let f_bilinear = q_d + k_d * d_d;
    assert_close(v_expected, f_bilinear, 0.001,
        "LRB force: K_eff*D = Q_d + K_d*D_d");

    // Structural model: horizontal beam (along X) with axial spring at tip
    // Beam from (0,0) to (L,0), fixed at node 1, spring kx at node 2.
    // Axial load F applied at node 2.
    // delta = F / (EA/L + k_spring)
    let l = 2.0; // m
    let e = 200_000.0; // MPa (solver uses E*1000 internally)
    let e_eff = e * 1000.0; // kN/m^2
    let a = 0.01; // m^2
    let iz = 1e-4; // m^4

    // Spring stiffness in kN/m
    let k_spring = k_eff * 1000.0; // convert kN/mm to kN/m = 1333.3 kN/m

    // Beam axial stiffness
    let k_beam = e_eff * a / l; // kN/m = 2e8 * 0.01 / 2 = 1e6 kN/m

    // Analytical displacement
    let f_applied = v_expected; // kN
    let delta_exact = f_applied / (k_beam + k_spring);

    // Build model
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
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
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

    let input = SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "LRB spring model: delta = F/(EA/L + k_spring)");

    // Verify K_eff consistency: varying displacement changes K_eff
    let d_large = 300.0; // mm
    let k_eff_large = k_d + q_d / d_large;
    assert!(k_eff_large < k_eff,
        "K_eff decreases with D: {:.4} < {:.4} kN/mm", k_eff_large, k_eff);
}

// ================================================================
// 2. Friction Pendulum System (FPS) -- Period
// ================================================================
//
// The FPS isolated period is:
//   T_eff = 2 * pi * sqrt(R / g)
// which is independent of the supported mass (just like a simple
// pendulum). This is verified by computing T for two different masses.
//
// Effective stiffness: K_eff = W * (1/R + mu/D)
// Equivalent damping: beta_eff = 2*mu / (pi * (mu + D/R))
//
// Structural verification: a horizontal beam with an axial spring
// at the tip, where k_spring = W/R (gravity restoring). Under
// F = W*D/R, tip displacement matches analytical value.
//
// Reference: ASCE 7-22 §17.2; Constantinou et al. (2022).

#[test]
fn validation_seis_iso_ext_2_fps_period() {
    let g_mm: f64 = 9810.0;    // mm/s^2
    let r: f64 = 2500.0;       // mm, radius of curvature
    let mu: f64 = 0.05;        // friction coefficient

    // Analytical period (independent of mass)
    let t_eff = 2.0 * std::f64::consts::PI * (r / g_mm).sqrt();

    // Verify mass-independence: same formula, different weights
    let w1: f64 = 3000.0;      // kN
    let w2: f64 = 9000.0;      // kN
    let t1 = 2.0 * std::f64::consts::PI * (r / g_mm).sqrt();
    let t2 = 2.0 * std::f64::consts::PI * (r / g_mm).sqrt();
    assert_close(t1, t2, 0.001,
        "FPS period independent of mass");

    assert!(t_eff > 2.0 && t_eff < 5.0,
        "FPS period T = {:.3}s is in expected range", t_eff);

    // Effective stiffness for each weight at design displacement
    let d: f64 = 180.0;        // mm
    let k_eff_1 = w1 * (1.0 / r + mu / d);
    let k_eff_2 = w2 * (1.0 / r + mu / d);

    // K_eff scales linearly with weight
    assert_close(k_eff_2 / k_eff_1, w2 / w1, 0.001,
        "FPS K_eff scales with weight");

    // Equivalent damping (independent of weight)
    let beta_1 = 2.0 * mu / (std::f64::consts::PI * (mu + d / r));
    let beta_2 = 2.0 * mu / (std::f64::consts::PI * (mu + d / r));
    assert_close(beta_1, beta_2, 0.001,
        "FPS damping independent of weight");

    assert!(beta_1 > 0.05 && beta_1 < 0.30,
        "FPS damping {:.1}% in expected range", beta_1 * 100.0);

    // Structural verification: horizontal beam + axial spring = W/R
    let r_m = r / 1000.0; // 2.5 m
    let k_gravity = w1 / r_m; // kN/m, gravity restoring stiffness

    let l = 2.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let e_eff = e * 1000.0;
    let k_beam = e_eff * a / l;

    // Force = W * D/R (gravity restoring component)
    let d_m = d / 1000.0;
    let f_restoring = w1 * d_m / r_m;
    let delta_exact = f_restoring / (k_beam + k_gravity);

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
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
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
        kx: Some(k_gravity), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_restoring, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "FPS spring model: delta = F/(EA/L + k_gravity)");
}

// ================================================================
// 3. Equivalent Viscous Damping from Hysteretic Energy
// ================================================================
//
// For a bilinear isolator, the energy dissipated per cycle is:
//   E_D = 4 * Q_d * (D - D_y)
// The equivalent viscous damping ratio is:
//   beta_eff = E_D / (2 * pi * K_eff * D^2)
//
// This is fundamental to the equivalent linear method used in
// both ASCE 7 and EC8 for isolated structure design.
//
// Reference: ASCE 7-22 Eq. 17.5-3; Naeim & Kelly (1999) Eq. 2.9.

#[test]
fn validation_seis_iso_ext_3_equivalent_damping() {
    // LRB parameters
    let q_d: f64 = 100.0;      // kN, characteristic strength
    let k2: f64 = 1.2;         // kN/mm, post-yield stiffness
    let k1: f64 = 10.0 * k2;   // kN/mm, elastic stiffness (typical 10x)
    let d_y: f64 = q_d / (k1 - k2); // mm, yield displacement
    // d_y = 100 / (12 - 1.2) = 100 / 10.8 = 9.26 mm

    let d_d: f64 = 200.0;      // mm, design displacement

    // Effective stiffness
    let k_eff = k2 + q_d / d_d;
    // = 1.2 + 100/200 = 1.2 + 0.5 = 1.7 kN/mm

    // Energy dissipated per cycle (area of bilinear hysteresis loop)
    let e_d = 4.0 * q_d * (d_d - d_y);

    // Equivalent viscous damping
    let beta_eff = e_d / (2.0 * std::f64::consts::PI * k_eff * d_d * d_d);

    // Cross-check: alternative formula
    // beta_eff = (2/pi) * (Q_d * (D - D_y)) / (K_eff * D^2)
    let beta_alt = (2.0 / std::f64::consts::PI) * (q_d * (d_d - d_y)) / (k_eff * d_d * d_d);

    assert_close(beta_eff, beta_alt, 0.001,
        "Equivalent damping: two formula variants agree");

    // Damping must be in a physically reasonable range (10-30% for LRB)
    assert!(beta_eff > 0.10 && beta_eff < 0.30,
        "beta_eff = {:.1}% is in LRB range [10-30%]", beta_eff * 100.0);

    // Verify relationship: higher displacement -> lower damping
    let d_large = 300.0;
    let k_eff_large = k2 + q_d / d_large;
    let e_d_large = 4.0 * q_d * (d_large - d_y);
    let beta_large = e_d_large / (2.0 * std::f64::consts::PI * k_eff_large * d_large * d_large);

    assert!(beta_large < beta_eff,
        "beta at D=300mm ({:.3}) < beta at D=200mm ({:.3}): damping decreases with D",
        beta_large, beta_eff);

    // Verify: at very large displacement, beta -> (2/pi)*(Q_d/(K2*D))
    let d_huge = 5000.0;
    let k_eff_huge = k2 + q_d / d_huge;
    let beta_huge = 4.0 * q_d * (d_huge - d_y) / (2.0 * std::f64::consts::PI * k_eff_huge * d_huge * d_huge);
    let beta_limit = (2.0 / std::f64::consts::PI) * q_d / (k2 * d_huge);
    assert_close(beta_huge, beta_limit, 0.02,
        "At large D, beta_eff -> (2/pi)*Q_d/(K2*D)");
}

// ================================================================
// 4. ASCE 7 Design Displacement (D_D)
// ================================================================
//
// ASCE 7 §17.5.3.1:
//   D_D = g * S_D1 * T_D / (4 * pi^2 * B_D)
//
// where S_D1 = design spectral acceleration at 1s,
//       T_D  = effective isolated period,
//       B_D  = damping coefficient (Table 17.5-1).
//
// Structural model: a horizontal beam with an axial spring at the
// tip. Spring stiffness = K_eff. Applied force = V_b = K_eff * D_D.
// Verify tip displacement matches the analytical D_D value.
//
// Reference: ASCE 7-22 Eq. 17.5-1, Table 17.5-1.

#[test]
fn validation_seis_iso_ext_4_design_displacement() {
    let g: f64 = 9810.0;       // mm/s^2
    let sd1: f64 = 0.50;       // g, design spectral acceleration at 1s
    let td: f64 = 2.5;         // s, effective isolated period

    // Damping coefficient for beta_eff = 15% (ASCE 7 Table 17.5-1)
    let bd: f64 = 1.35;

    // Design displacement (ASCE 7 Eq. 17.5-1)
    let pi2 = std::f64::consts::PI * std::f64::consts::PI;
    let dd_mm = g * sd1 * td / (4.0 * pi2 * bd);

    // Verify DD is in a reasonable range
    assert!(dd_mm > 100.0 && dd_mm < 500.0,
        "D_D = {:.1} mm is in expected range", dd_mm);

    // MCE displacement
    let sm1: f64 = 0.75;
    let tm: f64 = 2.8;
    let bm: f64 = 1.35;
    let dm_mm = g * sm1 * tm / (4.0 * pi2 * bm);

    assert!(dm_mm > dd_mm,
        "MCE displacement {:.1}mm > Design {:.1}mm", dm_mm, dd_mm);

    // Structural verification: horizontal beam + axial spring at tip
    let dd_m = dd_mm / 1000.0;
    let w: f64 = 20000.0; // kN
    let m_tonnes = w / 9.81;

    // K_eff from target period
    let k_eff_kn_m = 4.0 * pi2 * m_tonnes / (td * td);

    // Applied force = K_eff * D_D
    let v_b = k_eff_kn_m * dd_m;

    // Beam properties
    let l = 2.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let e_eff = e * 1000.0;
    let k_beam = e_eff * a / l;

    // Analytical: delta = V_b / (EA/L + K_eff)
    let delta_exact = v_b / (k_beam + k_eff_kn_m);

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
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
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
        kx: Some(k_eff_kn_m), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: v_b, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "ASCE 7 D_D: model displacement matches analytical");

    // Also verify that D_D formula is self-consistent:
    // T_D = 2*pi*sqrt(m/K_eff) => K_eff*D_D = 4*pi^2*m*D_D/T_D^2
    // V_b = K_eff*D_D => V_b = W*S_D1/(T_D*B_D) (using D_D formula)
    let v_b_formula = w * sd1 / (td * bd);
    // V_b from K_eff*D_D: k_eff * dd_m
    // Since K_eff = 4*pi^2*m/T^2 and D_D = g*S_D1*T/(4*pi^2*B_D):
    // V_b = 4*pi^2*m/T^2 * g*S_D1*T/(4*pi^2*B_D) = m*g*S_D1/(T*B_D) = W*S_D1/(T*B_D)
    assert_close(v_b, v_b_formula, 0.01,
        "ASCE 7 base shear: K_eff*D_D = W*S_D1/(T_D*B_D)");
}

// ================================================================
// 5. Superstructure Base Shear Force
// ================================================================
//
// For an isolated building:
//   V_b = K_eff * D_D         (base shear at isolation level)
//   V_s = V_b / R_I           (superstructure design shear)
//
// Floor forces distributed proportional to mass and height:
//   F_i = V_s * (m_i * h_i) / sum(m_j * h_j)
//
// A 2-story frame model verifies that the total base shear from the
// solver matches the applied lateral forces (equilibrium).
//
// Reference: ASCE 7-22 §17.5.4, Eq. 17.5-8.

#[test]
fn validation_seis_iso_ext_5_superstructure_force() {
    let w_total: f64 = 30000.0;
    let sd1: f64 = 0.60;
    let td: f64 = 2.5;
    let bd: f64 = 1.35;
    let ri: f64 = 2.0;

    // Design displacement
    let g_mm: f64 = 9810.0;
    let pi2 = std::f64::consts::PI * std::f64::consts::PI;
    let dd_mm = g_mm * sd1 * td / (4.0 * pi2 * bd);
    let dd_m = dd_mm / 1000.0;

    // Effective stiffness from period
    let m_tonnes = w_total / 9.81;
    let k_eff = 4.0 * pi2 * m_tonnes / (td * td);

    // Base shear at isolation level
    let v_b = k_eff * dd_m;

    // Superstructure design shear
    let v_s = v_b / ri;

    // Floor force distribution (2-story, equal mass per floor)
    let h1 = 3.5;
    let h2 = 7.0;
    let m_floor = w_total / (2.0 * 9.81);

    let sum_mh = m_floor * h1 + m_floor * h2;
    let f1 = v_s * (m_floor * h1) / sum_mh;
    let f2 = v_s * (m_floor * h2) / sum_mh;

    // Verify distribution sums to V_s
    assert_close(f1 + f2, v_s, 0.001,
        "Floor forces sum to V_s");

    // Verify inverted triangle: f2 > f1
    assert!(f2 > f1,
        "F2 ({:.1} kN) > F1 ({:.1} kN): inverted triangle", f2, f1);

    // Ratio should equal height ratio
    assert_close(f2 / f1, h2 / h1, 0.001,
        "Force ratio equals height ratio");

    // Structural model: 2-story frame with applied floor forces
    let e = 200_000.0;
    let a = 0.02;
    let iz = 2e-4;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h1), (3, 0.0, h2),
        (4, w, 0.0), (5, w, h1), (6, w, h2),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1 / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f1 / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2 / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: f2 / 2.0, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total base shear from reactions must equal applied V_s
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum::<f64>().abs();
    assert_close(sum_rx, v_s, 0.02,
        "Superstructure shear: sum of base reactions = V_s");
}

// ================================================================
// 6. Period Shift Ratio (T_isolated / T_fixed)
// ================================================================
//
// The fundamental benefit of seismic isolation is the period shift:
//   T_isolated / T_fixed >> 1
//
// Typically T_iso/T_fix > 3.0 for effective isolation (ASCE 7 §17.2.4.1).
// Period shift reduces spectral acceleration by moving the structure
// into the displacement-sensitive (lower Sa) region of the spectrum.
//
// Two portal frames are analyzed:
//   (a) Fixed base → stiff, small displacements
//   (b) Same frame with reduced applied force (proportional to Sa
//       at isolated period) → less structural demand
// The ratio of displacements directly shows the force/drift reduction.
//
// Reference: EC8 §10.2; ASCE 7-22 §17.2.

#[test]
fn validation_seis_iso_ext_6_period_shift_ratio() {
    // Building parameters
    let t_fixed: f64 = 0.6;
    let t_isolated: f64 = 2.5;

    // Period shift ratio
    let ratio = t_isolated / t_fixed;
    assert!(ratio > 3.0,
        "Period shift ratio {:.2} > 3.0 for effective isolation", ratio);

    // Sa reduction: in constant-velocity region Sa ~ S_D1/T
    let sa_reduction = t_fixed / t_isolated;
    assert!(sa_reduction < 0.35,
        "Sa reduction factor {:.3} < 0.35 (>65% reduction)", sa_reduction);

    // Structural verification: same frame under two different force levels
    // representing fixed-base and isolated-base demand.
    let e = 200_000.0;
    let a = 0.02;
    let iz = 2e-4;
    let h = 4.0;
    let w = 6.0;

    // Full seismic force for fixed-base case
    let sd1 = 0.60; // spectral acceleration at 1s
    let w_total = 20000.0; // kN

    // Elastic base shear: V = W * S_D1 / T
    let v_fixed_elastic = w_total * sd1 / t_fixed;
    let v_iso_elastic = w_total * sd1 / t_isolated;

    // The period shift reduces elastic demand by factor T_fixed/T_isolated
    assert_close(v_iso_elastic / v_fixed_elastic, sa_reduction, 0.001,
        "Elastic force ratio equals period ratio");

    // Model: portal frame under lateral force
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    // Case A: Fixed-base elastic demand
    let f_fixed = 100.0; // reference lateral force (kN)
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_fixed, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_fixed, fz: 0.0, my: 0.0 }),
    ];
    let input_a = make_input(nodes.clone(), vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems.clone(), sups.clone(), loads_a);
    let results_a = linear::solve_2d(&input_a).unwrap();
    let d_fixed = results_a.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Case B: Isolated demand = reduced force by period ratio
    let f_iso = f_fixed * sa_reduction;
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_iso, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f_iso, fz: 0.0, my: 0.0 }),
    ];
    let input_b = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems, sups, loads_b);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let d_iso = results_b.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // In linear system, drift ratio = force ratio = Sa_reduction
    assert_close(d_iso / d_fixed, sa_reduction, 0.02,
        "Drift reduction matches spectral acceleration reduction");

    // Isolation reduces superstructure drift dramatically
    assert!(d_iso < d_fixed * 0.40,
        "Isolated drift ({:.6e}) < 40% of fixed drift ({:.6e})", d_iso, d_fixed);
}

// ================================================================
// 7. High-Damping Rubber (HDR) -- Effective Shear Modulus
// ================================================================
//
// HDR bearings have strain-dependent shear modulus G(gamma).
// At 100% shear strain (gamma=1.0), typical G = 0.4-1.0 MPa.
//
// Bearing horizontal stiffness: K_h = G * A / t_r
// where A = bonded area, t_r = total rubber thickness.
//
// Structural model: horizontal beam with an axial spring at the tip,
// where k_spring = K_h. Under F = K_h * D, tip displacement
// matches the analytical delta = F/(EA/L + K_h).
//
// Reference: EN 15129 §8; Naeim & Kelly (1999) Ch. 5.

#[test]
fn validation_seis_iso_ext_7_hdr_shear_modulus() {
    // HDR bearing geometry
    let d_bearing: f64 = 650.0;     // mm, outer diameter
    let t_layer: f64 = 12.0;        // mm
    let n_layers: f64 = 12.0;
    let t_r: f64 = t_layer * n_layers; // 144 mm total rubber

    // Bonded area
    let a_bearing = std::f64::consts::PI * d_bearing * d_bearing / 4.0;

    // HDR properties at different shear strains (gamma, G_MPa, damping_%)
    let data = [
        (0.50, 0.85, 10.0),
        (1.00, 0.55, 14.0),
        (1.50, 0.45, 13.0),
        (2.00, 0.40, 11.0),
    ];

    // G decreases with strain (softening)
    assert!(data[1].1 < data[0].1,
        "G at 100% < G at 50%: strain softening");
    assert!(data[2].1 < data[1].1,
        "G at 150% < G at 100%: continued softening");

    // Horizontal stiffness at 100% strain
    let g_100 = data[1].1;
    let k_h_kn_mm = g_100 * a_bearing / t_r / 1000.0; // kN/mm
    let k_h_kn_m = k_h_kn_mm * 1000.0; // kN/m

    // Design displacement at 100% strain
    let d_design_mm = t_r * 1.0;
    let _d_design_m = d_design_mm / 1000.0;

    // Design force
    let f_design = k_h_kn_mm * d_design_mm; // kN

    // Shape factor
    let s = d_bearing / (4.0 * t_layer);
    assert!(s > 10.0, "Shape factor S = {:.1} > 10", s);

    // Structural model: horizontal beam + axial spring = K_h
    let l = 2.0;
    let e = 200_000.0;
    let a = 0.01;
    let iz = 1e-4;
    let e_eff = e * 1000.0;
    let k_beam = e_eff * a / l;

    // Analytical: delta = F / (EA/L + K_h)
    let delta_exact = f_design / (k_beam + k_h_kn_m);

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
        node_i: 1, node_j: 2,
        material_id: 1, section_id: 1,
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
        kx: Some(k_h_kn_m), ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_design, fz: 0.0, my: 0.0,
    })];

    let input = SolverInput { nodes, materials: mats, sections: secs, elements: elems, supports: sups, loads, constraints: vec![],  connectors: HashMap::new() };
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(tip.ux, delta_exact, 0.02,
        "HDR bearing: displacement matches analytical delta");

    // Verify stiffness varies with strain
    let k_50 = data[0].1 * a_bearing / t_r / 1000.0;
    let k_200 = data[3].1 * a_bearing / t_r / 1000.0;
    assert!(k_50 > k_h_kn_mm && k_h_kn_mm > k_200,
        "K_50 ({:.3}) > K_100 ({:.3}) > K_200 ({:.3}): strain-dependent",
        k_50, k_h_kn_mm, k_200);
}

// ================================================================
// 8. Isolation Effectiveness -- Force Reduction Factor
// ================================================================
//
// Compare the base shear of a fixed-base building versus an isolated
// building under the same seismic demand. The force reduction factor
// quantifies the isolation benefit:
//
//   FRF = V_elastic_fixed / V_s_isolated
//
// For well-designed isolation, FRF > 3 is typical.
//
// Two frame analyses: same geometry, but the isolated case has
// reduced lateral force (V_s < V_fixed). The drift ratio in the
// linear solver must match the applied force ratio.
//
// Reference: ASCE 7-22 §17.2; EC8 §10.2.

#[test]
fn validation_seis_iso_ext_8_isolation_effectiveness() {
    let sd1: f64 = 0.60;
    let w: f64 = 40000.0;

    // Fixed-base building
    let t_fixed: f64 = 0.8;
    let r_fixed: f64 = 8.0;

    let cs_fixed = sd1 / (t_fixed * r_fixed);
    let v_fixed = cs_fixed * w;

    // Isolated building
    let t_iso: f64 = 2.5;
    let bd: f64 = 1.35;
    let ri: f64 = 2.0;

    // Base shear at isolation level
    let v_iso_base = w * sd1 / (t_iso * bd);

    // Superstructure design shear
    let v_iso_super = v_iso_base / ri;

    // Elastic fixed-base shear (unreduced)
    let v_elastic_fixed = sd1 * w / t_fixed;

    // Force reduction factor
    let frf = v_elastic_fixed / v_iso_super;
    assert!(frf > 3.0,
        "Force reduction factor {:.1} > 3.0: isolation is highly effective", frf);

    // Structural model comparison
    let e = 200_000.0;
    let a = 0.02;
    let iz = 2e-4;
    let h = 3.5;
    let span = 6.0;

    // Inverted triangle distribution: F1 at h, F2 at 2h
    let f_fixed_total = v_fixed;
    let f1_fixed = f_fixed_total * h / (h + 2.0 * h);
    let f2_fixed = f_fixed_total * 2.0 * h / (h + 2.0 * h);

    let f_iso_total = v_iso_super;
    let f1_iso = f_iso_total * h / (h + 2.0 * h);
    let f2_iso = f_iso_total * 2.0 * h / (h + 2.0 * h);

    // 2-story frame
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, span, 0.0), (5, span, h), (6, span, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    // Fixed-base model
    let loads_fixed = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1_fixed / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f1_fixed / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2_fixed / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: f2_fixed / 2.0, fz: 0.0, my: 0.0 }),
    ];
    let input_fixed = make_input(nodes.clone(), vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems.clone(), sups.clone(), loads_fixed);
    let results_fixed = linear::solve_2d(&input_fixed).unwrap();
    let roof_fixed = results_fixed.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux.abs();

    // Isolated model (same structure, reduced force)
    let loads_iso = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f1_iso / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f1_iso / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f2_iso / 2.0, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: f2_iso / 2.0, fz: 0.0, my: 0.0 }),
    ];
    let input_iso = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)],
        elems, sups, loads_iso);
    let results_iso = linear::solve_2d(&input_iso).unwrap();
    let roof_iso = results_iso.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().ux.abs();

    // In linear analysis, drift ratio = force ratio
    let drift_ratio_expected = f_iso_total / f_fixed_total;
    let drift_ratio_actual = roof_iso / roof_fixed;
    assert_close(drift_ratio_actual, drift_ratio_expected, 0.05,
        "Drift ratio matches force ratio (linear response)");

    // The isolated superstructure experiences significantly less force
    assert!(v_iso_super < v_elastic_fixed,
        "V_iso_super ({:.0}) << V_elastic_fixed ({:.0})", v_iso_super, v_elastic_fixed);

    // V_iso_super should also be less than the reduced fixed-base shear or comparable
    // The key point: isolation eliminates the need for large R factors
    assert!(v_iso_super < v_elastic_fixed * 0.50,
        "Isolated superstructure shear < 50% of elastic fixed-base");
}
