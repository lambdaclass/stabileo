/// Validation: Timoshenko Beam Solver Tests
///
/// References:
///   - Timoshenko & Goodier, "Theory of Elasticity", 3rd Ed.
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///   - Cowper, "The Shear Coefficient in Timoshenko's Beam Theory" (1966)
///   - Pilkey, "Formulas for Stress, Strain, and Structural Matrices", Ch. 7
///
/// When the shear area (asY) is set on a section, the solver uses the
/// Timoshenko beam stiffness matrix which accounts for shear deformation.
/// The Timoshenko parameter phi = 12*E*I / (G*As*L^2) modifies the stiffness.
///
/// For deep beams (L/d < 5), shear deformation adds significantly to deflections:
///   - Cantilever tip load:  delta = PL^3/(3EI) + PL/(G*As)
///   - SS beam UDL midpoint: delta = 5wL^4/(384EI) + wL^2/(8*G*As)
///   - Fixed-fixed center:   delta = PL^3/(192EI) + PL/(4*G*As)
///
/// Tests verify:
///   1. Deep cantilever (L/d=2): point load deflection matches Timoshenko formula
///   2. Simply supported deep beam: UDL midpoint deflection with shear correction
///   3. Slender beam (L/d=20): deflection nearly identical to Euler-Bernoulli
///   4. Fixed-fixed deep beam: center point load with large shear contribution
///   5. Propped cantilever deep beam: reactions differ from EB theory
///   6. 3D deep beam: bending about both axes with asY and asZ
///   7. Short column with lateral load (L/d=1): shear dominates deflection
///   8. Comparison: same beam with/without asY shows Timoshenko gives larger deflection
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// Concrete-like properties
// E in MPa (solver multiplies by 1000 internally to get kN/m^2)
const E_MPA: f64 = 30_000.0;
const NU: f64 = 0.2;
// G = E / (2*(1+nu)) = 30000 / 2.4 = 12500 MPa
// Internally: E_eff = 30e6 kN/m^2, G_eff = 12.5e6 kN/m^2

// Rectangular section: 0.3m wide x 0.5m deep
const B: f64 = 0.3;
const H: f64 = 0.5;
const AREA: f64 = 0.3 * 0.5;              // 0.15 m^2
const IZ_RECT: f64 = 0.3 * 0.125 / 12.0; // b*h^3/12 = 3.125e-3 m^4
const KAPPA: f64 = 5.0 / 6.0;             // shear coefficient for rectangle
const AS_Y: f64 = 0.3 * 0.5 * 5.0 / 6.0; // kappa * A = 0.125 m^2

/// Effective moduli in kN/m^2 (matching solver internal units).
fn e_eff() -> f64 { E_MPA * 1000.0 }
fn g_eff() -> f64 { E_MPA * 1000.0 / (2.0 * (1.0 + NU)) }

/// Build a 2D beam with optional Timoshenko shear area.
fn make_timoshenko_beam(
    n_elements: usize,
    length: f64,
    as_y: Option<f64>,
    start_support: &str,
    end_support: Option<&str>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_nodes = n_elements + 1;
    let elem_len = length / n_elements as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode {
            id,
            x: i as f64 * elem_len,
            y: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E_MPA, nu: NU });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: AREA, iz: IZ_RECT, as_y });

    let mut elems_map = HashMap::new();
    for i in 0..n_elements {
        let id = i + 1;
        elems_map.insert(id.to_string(), SolverElement {
            id,
            elem_type: "frame".to_string(),
            node_i: i + 1,
            node_j: i + 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });
    }

    let mut sups_map = HashMap::new();
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1,
        node_id: 1,
        support_type: start_support.to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dy: None, drz: None, angle: None,
    });
    if let Some(es) = end_support {
        sups_map.insert("2".to_string(), SolverSupport {
            id: 2,
            node_id: n_nodes,
            support_type: es.to_string(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
    }

    SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), }
}

// ================================================================
// 1. Deep Cantilever (L/d = 2): Point Load at Tip
// ================================================================
//
// L = 1.0m, d = 0.5m, so L/d = 2.
// Timoshenko deflection at tip:
//   delta = PL^3/(3EI) + PL/(G*As)
// The shear term PL/(G*As) is significant for deep beams.

#[test]
fn validation_timoshenko_deep_cantilever() {
    let l = 1.0; // L/d = 2.0
    let n = 10;
    let p = 100.0; // kN

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_timoshenko_beam(n, l, Some(AS_Y), "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Analytical Timoshenko deflection
    let delta_bending = p * l.powi(3) / (3.0 * e_eff() * IZ_RECT);
    let delta_shear = p * l / (g_eff() * AS_Y);
    let delta_timo = delta_bending + delta_shear;

    // Shear contribution should be significant (L/d=2)
    let shear_fraction = delta_shear / delta_timo;
    assert!(shear_fraction > 0.05,
        "Shear contribution should be > 5% for L/d=2, got {:.2}%", shear_fraction * 100.0);

    // Compare with analytical (1% tolerance)
    let rel_err = (d_tip.uy.abs() - delta_timo).abs() / delta_timo;
    assert!(rel_err < 0.01,
        "Deep cantilever Timoshenko: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_tip.uy.abs(), delta_timo, rel_err * 100.0);
}

// ================================================================
// 2. Simply Supported Deep Beam: UDL
// ================================================================
//
// L = 1.0m, UDL w, L/d = 2.
// Midpoint deflection:
//   delta = 5wL^4/(384EI) + wL^2/(8*G*As)

#[test]
fn validation_timoshenko_ss_deep_udl() {
    let l = 1.0; // L/d = 2
    let n = 20;
    let w = -50.0; // kN/m (downward)

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w, q_j: w, a: None, b: None,
        }))
        .collect();
    let input = make_timoshenko_beam(n, l, Some(AS_Y), "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    // Analytical Timoshenko midpoint deflection for UDL
    let w_abs = w.abs();
    let delta_bending = 5.0 * w_abs * l.powi(4) / (384.0 * e_eff() * IZ_RECT);
    let delta_shear = w_abs * l * l / (8.0 * g_eff() * AS_Y);
    let delta_timo = delta_bending + delta_shear;

    let rel_err = (d_mid.uy.abs() - delta_timo).abs() / delta_timo;
    assert!(rel_err < 0.01,
        "SS deep beam UDL: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_mid.uy.abs(), delta_timo, rel_err * 100.0);
}

// ================================================================
// 3. Slender Beam (L/d = 20): Shear Negligible
// ================================================================
//
// L = 10.0m, d = 0.5m, so L/d = 20.
// phi = 12*E*I/(G*As*L^2) should be very small.
// Timoshenko deflection is approximately equal to Euler-Bernoulli.

#[test]
fn validation_timoshenko_slender_beam() {
    let l = 10.0; // L/d = 20
    let n = 20;
    let p = 100.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    // Solve with Timoshenko (asY set)
    let input_timo = make_timoshenko_beam(n, l, Some(AS_Y), "fixed", None, loads);
    let results_timo = linear::solve_2d(&input_timo).unwrap();

    // Euler-Bernoulli deflection
    let delta_eb = p * l.powi(3) / (3.0 * e_eff() * IZ_RECT);
    // Shear correction
    let delta_shear = p * l / (g_eff() * AS_Y);

    let d_tip_timo = results_timo.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // For L/d=20, shear should be < 1% of bending
    let shear_fraction = delta_shear / delta_eb;
    assert!(shear_fraction < 0.01,
        "Slender beam: shear fraction should be < 1%, got {:.4}%", shear_fraction * 100.0);

    // Timoshenko result should be very close to EB (within 1%)
    let rel_err_vs_eb = (d_tip_timo.uy.abs() - delta_eb).abs() / delta_eb;
    assert!(rel_err_vs_eb < 0.01,
        "Slender beam: Timoshenko close to EB, diff = {:.4}%", rel_err_vs_eb * 100.0);

    // And should match Timoshenko formula
    let delta_total = delta_eb + delta_shear;
    let rel_err = (d_tip_timo.uy.abs() - delta_total).abs() / delta_total;
    assert!(rel_err < 0.01,
        "Slender beam Timoshenko formula: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_tip_timo.uy.abs(), delta_total, rel_err * 100.0);
}

// ================================================================
// 4. Fixed-Fixed Deep Beam: Center Point Load
// ================================================================
//
// L = 1.0m, L/d = 2. Point load P at center.
// Timoshenko deflection at center:
//   delta = PL^3/(192EI) + PL/(4*G*As)
// Shear contribution is very significant for deep fixed-fixed beams.

#[test]
fn validation_timoshenko_fixed_fixed_deep() {
    let l = 1.0; // L/d = 2
    let n = 20;
    let p = 100.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_timoshenko_beam(n, l, Some(AS_Y), "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    // Analytical Timoshenko deflection for fixed-fixed beam, center point load
    let delta_bending = p * l.powi(3) / (192.0 * e_eff() * IZ_RECT);
    let delta_shear = p * l / (4.0 * g_eff() * AS_Y);
    let delta_timo = delta_bending + delta_shear;

    // For L/d=2 fixed-fixed, shear should be a large fraction
    let shear_fraction = delta_shear / delta_timo;
    assert!(shear_fraction > 0.10,
        "Fixed-fixed deep: shear should be > 10%, got {:.2}%", shear_fraction * 100.0);

    let rel_err = (d_mid.uy.abs() - delta_timo).abs() / delta_timo;
    assert!(rel_err < 0.01,
        "Fixed-fixed deep Timoshenko: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_mid.uy.abs(), delta_timo, rel_err * 100.0);
}

// ================================================================
// 5. Propped Cantilever Deep Beam: Reactions Change
// ================================================================
//
// The Timoshenko correction changes the stiffness distribution,
// which alters reactions for indeterminate beams.
// For a propped cantilever (fixed-roller) with UDL:
//   EB: R_roller = 3wL/8, R_fixed = 5wL/8, M_fixed = wL^2/8
// With Timoshenko theory, the reduced bending stiffness (softer beam)
// redistributes reactions. The roller reaction increases because
// the additional shear flexibility makes the beam deflect more
// uniformly, transferring more load to the roller.

#[test]
fn validation_timoshenko_propped_cantilever() {
    let l = 1.0; // L/d = 2
    let n = 20;
    let w = -50.0; // kN/m

    let loads_timo: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w, q_j: w, a: None, b: None,
        }))
        .collect();
    let loads_eb: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: w, q_j: w, a: None, b: None,
        }))
        .collect();

    // Timoshenko beam
    let input_timo = make_timoshenko_beam(
        n, l, Some(AS_Y), "fixed", Some("rollerX"), loads_timo,
    );
    let results_timo = linear::solve_2d(&input_timo).unwrap();

    // Euler-Bernoulli beam (same but without as_y)
    let input_eb = make_timoshenko_beam(
        n, l, None, "fixed", Some("rollerX"), loads_eb,
    );
    let results_eb = linear::solve_2d(&input_eb).unwrap();

    let r_roller_timo = results_timo.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    let r_roller_eb = results_eb.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;

    // EB roller reaction: 3wL/8
    let w_abs = w.abs();
    let r_roller_eb_exact = 3.0 * w_abs * l / 8.0;
    assert_close(r_roller_eb, r_roller_eb_exact, 0.02,
        "Propped EB: R_roller = 3wL/8");

    // Timoshenko reaction should differ from EB for deep beam
    // The roller reaction increases with shear deformation
    assert!(r_roller_timo > r_roller_eb,
        "Propped cantilever: Timoshenko roller reaction ({:.4}) should exceed EB ({:.4})",
        r_roller_timo, r_roller_eb);

    // The change should be measurable for L/d = 2 (at least 1%)
    let reaction_change_pct = (r_roller_timo - r_roller_eb) / r_roller_eb * 100.0;
    assert!(reaction_change_pct > 1.0,
        "Propped cantilever: reaction change ({:.2}%) should be > 1% for L/d=2",
        reaction_change_pct);

    // Total equilibrium must still hold for both
    let total_load = w_abs * l;
    let sum_ry_timo: f64 = results_timo.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_eb: f64 = results_eb.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_eb, total_load, 0.01,
        "Propped EB: sum R = wL");
    assert_close(sum_ry_timo, total_load, 0.01,
        "Propped Timoshenko: sum R = wL");

    // Fixed-end moment should also change
    let m_fixed_timo = results_timo.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_fixed_eb = results_eb.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_fixed_eb_exact = w_abs * l * l / 8.0;
    assert_close(m_fixed_eb, m_fixed_eb_exact, 0.02,
        "Propped EB: M_fixed = wL^2/8");

    // With Timoshenko, the fixed-end moment decreases as more load
    // goes to the roller
    assert!(m_fixed_timo < m_fixed_eb,
        "Propped cantilever: Timoshenko M_fixed ({:.4}) should be less than EB ({:.4})",
        m_fixed_timo, m_fixed_eb);
}

// ================================================================
// 6. 3D Deep Beam: Bending About Both Axes
// ================================================================
//
// A cantilever beam in 3D with loads in both Y and Z directions.
// asY controls shear deformation for bending about Z (loads in Y).
// asZ controls shear deformation for bending about Y (loads in Z).
//
// For a rectangular section b x h:
//   Iy = h*b^3/12  (bending about Y, loads in Z direction)
//   Iz = b*h^3/12  (bending about Z, loads in Y direction)
//   asY = kappa*A   (shear area for Y-direction shear)
//   asZ = kappa*A   (shear area for Z-direction shear)

#[test]
fn validation_timoshenko_3d_deep_beam() {
    let l = 1.0;
    let n = 10;
    let py = -100.0; // kN in Y
    let pz = -50.0;  // kN in Z

    let iy = H * B.powi(3) / 12.0;  // bending about Y-axis = 0.5 * 0.027 / 12
    let iz = B * H.powi(3) / 12.0;  // bending about Z-axis = IZ_RECT
    // Approximate torsion constant for rectangle: J = a*b^3/3*(1 - 0.63*a/b)
    let a_dim = B.min(H);
    let b_dim = B.max(H);
    let j = a_dim * b_dim.powi(3) / 3.0 * (1.0 - 0.63 * a_dim / b_dim);
    let as_y = KAPPA * AREA;
    let as_z = KAPPA * AREA;

    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..=n {
        let id = i + 1;
        nodes_map.insert(id.to_string(), SolverNode3D {
            id, x: i as f64 * elem_len, y: 0.0, z: 0.0,
        });
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E_MPA, nu: NU });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: AREA, iy, iz, j, cw: None,
        as_y: Some(as_y), as_z: Some(as_z),
    });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        let id = i + 1;
        elems_map.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".to_string(),
            node_i: i + 1, node_j: i + 2,
            material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }

    let mut sups_map = HashMap::new();
    // Fixed support: all 6 DOFs restrained
    sups_map.insert("1".to_string(), SolverSupport3D {
        node_id: 1,
        rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
        rw: None, kw: None,
    });

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n_nodes, fx: 0.0, fy: py, fz: pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = SolverInput3D {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    };

    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap();

    // Timoshenko deflection in Y (from Py load, bending about Z, using Iz and asY)
    let delta_y_bending = py.abs() * l.powi(3) / (3.0 * e_eff() * iz);
    let delta_y_shear = py.abs() * l / (g_eff() * as_y);
    let delta_y_timo = delta_y_bending + delta_y_shear;

    // Timoshenko deflection in Z (from Pz load, bending about Y, using Iy and asZ)
    let delta_z_bending = pz.abs() * l.powi(3) / (3.0 * e_eff() * iy);
    let delta_z_shear = pz.abs() * l / (g_eff() * as_z);
    let delta_z_timo = delta_z_bending + delta_z_shear;

    let rel_err_y = (d_tip.uy.abs() - delta_y_timo).abs() / delta_y_timo;
    assert!(rel_err_y < 0.01,
        "3D deep beam Y: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_tip.uy.abs(), delta_y_timo, rel_err_y * 100.0);

    let rel_err_z = (d_tip.uz.abs() - delta_z_timo).abs() / delta_z_timo;
    assert!(rel_err_z < 0.01,
        "3D deep beam Z: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_tip.uz.abs(), delta_z_timo, rel_err_z * 100.0);
}

// ================================================================
// 7. Short Column with Lateral Load (L/d = 1)
// ================================================================
//
// Very short element where shear deformation dominates bending.
// L = 0.5m, d = 0.5m, so L/d = 1.
// For a cantilever: delta_shear/delta_bending = 3EI/(G*As*L^2)
// With phi = 12EI/(G*As*L^2), the ratio is phi/4.

#[test]
fn validation_timoshenko_short_column() {
    let l = 0.5; // L/d = 1.0
    let n = 10;
    let p = 100.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_timoshenko_beam(n, l, Some(AS_Y), "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_bending = p * l.powi(3) / (3.0 * e_eff() * IZ_RECT);
    let delta_shear = p * l / (g_eff() * AS_Y);
    let delta_timo = delta_bending + delta_shear;

    // For L/d=1, shear should be a very large fraction
    let shear_fraction = delta_shear / delta_timo;
    assert!(shear_fraction > 0.15,
        "Short column: shear fraction should be large, got {:.2}%", shear_fraction * 100.0);

    // Verify the large shear correction is captured
    let rel_err = (d_tip.uy.abs() - delta_timo).abs() / delta_timo;
    assert!(rel_err < 0.01,
        "Short column Timoshenko: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_tip.uy.abs(), delta_timo, rel_err * 100.0);
}

// ================================================================
// 8. Comparison: With vs Without asY
// ================================================================
//
// The same deep beam solved with and without Timoshenko correction.
// Timoshenko should always give larger deflection than EB because
// shear deformation adds to bending deformation. The difference
// should equal PL/(G*As) for a cantilever with tip load.

#[test]
fn validation_timoshenko_vs_euler_bernoulli() {
    let l = 1.0; // L/d = 2
    let n = 20;
    let p = 100.0;

    // Timoshenko (with shear area)
    let loads_timo = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_timo = make_timoshenko_beam(n, l, Some(AS_Y), "fixed", None, loads_timo);
    let results_timo = linear::solve_2d(&input_timo).unwrap();

    // Euler-Bernoulli (without shear area)
    let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_eb = make_timoshenko_beam(n, l, None, "fixed", None, loads_eb);
    let results_eb = linear::solve_2d(&input_eb).unwrap();

    let d_timo = results_timo.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();
    let d_eb = results_eb.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Timoshenko deflection must be larger than Euler-Bernoulli
    assert!(d_timo > d_eb,
        "Timoshenko deflection ({:.6e}) should exceed EB ({:.6e})", d_timo, d_eb);

    // The difference should match the shear correction PL/(G*As)
    let delta_shear_expected = p * l / (g_eff() * AS_Y);
    let delta_diff = d_timo - d_eb;

    let rel_err = (delta_diff - delta_shear_expected).abs() / delta_shear_expected;
    assert!(rel_err < 0.01,
        "Deflection difference = shear correction: diff={:.6e}, expected={:.6e}, err={:.4}%",
        delta_diff, delta_shear_expected, rel_err * 100.0);

    // EB result should match PL^3/(3EI) exactly
    let delta_eb_exact = p * l.powi(3) / (3.0 * e_eff() * IZ_RECT);
    let rel_err_eb = (d_eb - delta_eb_exact).abs() / delta_eb_exact;
    assert!(rel_err_eb < 0.01,
        "EB deflection: actual={:.6e}, expected={:.6e}, err={:.4}%",
        d_eb, delta_eb_exact, rel_err_eb * 100.0);
}
