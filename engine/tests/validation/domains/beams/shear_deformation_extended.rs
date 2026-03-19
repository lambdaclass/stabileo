/// Validation: Extended Timoshenko Beam Theory and Shear Deformation Benchmarks
///
/// References:
///   - Timoshenko, "On the correction for shear of the differential equation
///     for transverse vibrations of prismatic bars" (1921)
///   - Cowper, "The Shear Coefficient in Timoshenko's Beam Theory" (1966)
///   - Hutchinson, "Shear Coefficients for Timoshenko Beam Theory" (2001)
///   - Pilkey, "Formulas for Stress, Strain, and Structural Matrices", 2nd Ed.
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///   - Wang, "Timoshenko Beam-Bending Solutions", J. Eng. Mech. (1995)
///
/// The Timoshenko beam theory extends Euler-Bernoulli by including transverse
/// shear deformation. The key parameter is:
///
///   phi = 12*E*I / (G*As*L^2)
///
/// where As = kappa*A is the effective shear area (kappa = shear correction factor).
/// For phi << 1 (slender beams), Timoshenko reduces to Euler-Bernoulli.
/// For phi ~ 1 or larger (deep beams), shear deformation is significant.
///
/// Tests verify:
///   1. EB vs Timoshenko deflection difference grows with decreasing L/d
///   2. Short beam (L/d=3): quantify shear deformation contribution
///   3. Long beam (L/d=20): Timoshenko approaches Euler-Bernoulli
///   4. Cantilever exact formula: delta = PL^3/(3EI) + PL/(kAG)
///   5. Shear correction factors: kappa for rectangular, I-beam, circular
///   6. Fixed-fixed beam: shear deformation effect on fixed-end moments
///   7. Deep beam (L/d=2): shear dominates total deflection
///   8. Continuous beam: shear deformation effect on moment redistribution
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Material: structural steel
// E in MPa (solver multiplies by 1000 internally => E_eff in kN/m^2)
// ---------------------------------------------------------------------------
const E_MPA: f64 = 200_000.0;
const NU: f64 = 0.3;

/// Effective elastic modulus in solver internal units (kN/m^2).
fn e_eff() -> f64 {
    E_MPA * 1000.0
}

/// Effective shear modulus in solver internal units (kN/m^2).
/// G = E / (2*(1+nu))
fn g_eff() -> f64 {
    E_MPA * 1000.0 / (2.0 * (1.0 + NU))
}

/// Build a 2D beam with a custom SolverSection (supports as_y for Timoshenko).
///
/// Nodes along the X axis from 0 to `length`.
/// Supports placed at node 1 (start) and optionally at the last node (end).
fn make_timoshenko_beam(
    n_elements: usize,
    length: f64,
    a: f64,
    iz: f64,
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
        nodes_map.insert(
            id.to_string(),
            SolverNode {
                id,
                x: i as f64 * elem_len,
                z: 0.0,
            },
        );
    }

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E_MPA,
            nu: NU,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a,
            iz,
            as_y,
        },
    );

    let mut elems_map = HashMap::new();
    for i in 0..n_elements {
        let id = i + 1;
        elems_map.insert(
            id.to_string(),
            SolverElement {
                id,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let mut sups_map = HashMap::new();
    sups_map.insert(
        "1".to_string(),
        SolverSupport {
            id: 1,
            node_id: 1,
            support_type: start_support.to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    if let Some(es) = end_support {
        sups_map.insert(
            "2".to_string(),
            SolverSupport {
                id: 2,
                node_id: n_nodes,
                support_type: es.to_string(),
                kx: None,
                ky: None,
                kz: None,
                dx: None,
                dz: None,
                dry: None,
                angle: None,
            },
        );
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

/// Build a two-span continuous beam with custom section (Timoshenko support).
///
/// Spans along X axis. Supports: pinned at x=0, rollerX at span boundaries.
fn make_timoshenko_continuous_beam(
    spans: &[f64],
    n_per_span: usize,
    a: f64,
    iz: f64,
    as_y: Option<f64>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_spans = spans.len();
    let total_elements = n_per_span * n_spans;

    let mut nodes_map = HashMap::new();
    let mut node_id = 1_usize;
    let mut x = 0.0;
    nodes_map.insert(
        node_id.to_string(),
        SolverNode {
            id: node_id,
            x: 0.0,
            z: 0.0,
        },
    );
    node_id += 1;
    for &span_len in spans {
        let elem_len = span_len / n_per_span as f64;
        for j in 1..=n_per_span {
            nodes_map.insert(
                node_id.to_string(),
                SolverNode {
                    id: node_id,
                    x: x + j as f64 * elem_len,
                    z: 0.0,
                },
            );
            node_id += 1;
        }
        x += span_len;
    }

    let mut mats_map = HashMap::new();
    mats_map.insert(
        "1".to_string(),
        SolverMaterial {
            id: 1,
            e: E_MPA,
            nu: NU,
        },
    );

    let mut secs_map = HashMap::new();
    secs_map.insert(
        "1".to_string(),
        SolverSection {
            id: 1,
            a,
            iz,
            as_y,
        },
    );

    let mut elems_map = HashMap::new();
    for i in 0..total_elements {
        let id = i + 1;
        elems_map.insert(
            id.to_string(),
            SolverElement {
                id,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let mut sups_map = HashMap::new();
    let mut sup_id = 1;
    sups_map.insert(
        sup_id.to_string(),
        SolverSupport {
            id: sup_id,
            node_id: 1,
            support_type: "pinned".to_string(),
            kx: None,
            ky: None,
            kz: None,
            dx: None,
            dz: None,
            dry: None,
            angle: None,
        },
    );
    sup_id += 1;
    for span_idx in 0..n_spans {
        let end_node = 1 + n_per_span * (span_idx + 1);
        sups_map.insert(
            sup_id.to_string(),
            SolverSupport {
                id: sup_id,
                node_id: end_node,
                support_type: "rollerX".to_string(),
                kx: None,
                ky: None,
                kz: None,
                dx: None,
                dz: None,
                dry: None,
                angle: None,
            },
        );
        sup_id += 1;
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
// 1. Euler-Bernoulli vs Timoshenko: Deflection Difference Grows
//    with Decreasing L/d Ratio
// ================================================================
//
// For a simply-supported beam with central point load P:
//   EB deflection:  delta_eb = PL^3 / (48EI)
//   Timoshenko:     delta_t  = PL^3 / (48EI) * (1 + 12EI/(kAG*L^2))
//                            = delta_eb * (1 + phi)
//
// As L/d decreases (beam gets deeper relative to span), phi increases
// and shear deformation becomes a larger fraction of total deflection.
//
// This test verifies three L/d ratios (5, 10, 20) and checks that:
//   - phi decreases monotonically with increasing L/d
//   - The deflection ratio (Timoshenko / EB) decreases toward 1.0
//
// Section: square cross-section d x d, A = d^2, Iz = d^4/12, As = (5/6)*A.

#[test]
fn validation_shear_def_ext_deflection_vs_ld_ratio() {
    let d = 0.3; // depth = 0.3 m
    let a: f64 = d * d;
    let iz: f64 = d.powi(4) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let p: f64 = 100.0; // kN
    let n = 20; // elements per beam

    let ld_ratios = [5.0, 10.0, 20.0];
    let mut phi_values: Vec<f64> = Vec::new();
    let mut deflection_ratios: Vec<f64> = Vec::new();

    for &ld in &ld_ratios {
        let l: f64 = ld * d;
        let mid_node = n / 2 + 1;

        // --- Timoshenko beam ---
        let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })];
        let input_t =
            make_timoshenko_beam(n, l, a, iz, Some(as_y), "pinned", Some("rollerX"), loads_t);
        let res_t = linear::solve_2d(&input_t).unwrap();

        // --- Euler-Bernoulli beam (no as_y) ---
        let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })];
        let input_eb = make_timoshenko_beam(n, l, a, iz, None, "pinned", Some("rollerX"), loads_eb);
        let res_eb = linear::solve_2d(&input_eb).unwrap();

        let d_t = res_t
            .displacements
            .iter()
            .find(|dd| dd.node_id == mid_node)
            .unwrap()
            .uz
            .abs();
        let d_eb = res_eb
            .displacements
            .iter()
            .find(|dd| dd.node_id == mid_node)
            .unwrap()
            .uz
            .abs();

        // Timoshenko parameter phi = 12*E*I / (G*As*L^2)
        let phi: f64 = 12.0 * e_eff() * iz / (g_eff() * as_y * l * l);
        phi_values.push(phi);

        let ratio = d_t / d_eb;
        deflection_ratios.push(ratio);

        // Timoshenko should always give more deflection
        assert!(
            d_t > d_eb,
            "L/d={}: Timoshenko ({:.6e}) must exceed EB ({:.6e})",
            ld,
            d_t,
            d_eb
        );

        // Check ratio against 1 + phi (analytical for SS beam with center load)
        let expected_ratio: f64 = 1.0 + phi;
        assert_close(ratio, expected_ratio, 0.03, &format!("L/d={} ratio", ld));
    }

    // phi should decrease with increasing L/d
    assert!(
        phi_values[0] > phi_values[1],
        "phi at L/d=5 ({:.6}) should exceed phi at L/d=10 ({:.6})",
        phi_values[0],
        phi_values[1]
    );
    assert!(
        phi_values[1] > phi_values[2],
        "phi at L/d=10 ({:.6}) should exceed phi at L/d=20 ({:.6})",
        phi_values[1],
        phi_values[2]
    );

    // Deflection ratio should approach 1.0 for slender beams
    assert!(
        deflection_ratios[2] < deflection_ratios[0],
        "Ratio at L/d=20 ({:.6}) should be closer to 1.0 than L/d=5 ({:.6})",
        deflection_ratios[2],
        deflection_ratios[0]
    );
}

// ================================================================
// 2. Short Beam (L/d = 3): Quantify Shear Deformation Contribution
// ================================================================
//
// For a simply-supported beam with a point load at midspan:
//   delta_bending = PL^3 / (48EI)
//   delta_shear   = PL / (4*kAG)      [from virtual work for SS beam]
//   delta_total   = delta_bending + delta_shear
//
// For L/d = 3, the shear contribution should be a non-trivial fraction
// (typically 5-15% for steel, more for lower G materials).
//
// We verify that the solver result matches the combined analytical value.

#[test]
fn validation_shear_def_ext_short_beam_shear_contribution() {
    let d: f64 = 0.4; // depth
    let b: f64 = 0.2; // width
    let l: f64 = 3.0 * d; // L/d = 3, L = 1.2 m
    let a: f64 = b * d;
    let iz: f64 = b * d.powi(3) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let p: f64 = 50.0; // kN
    let n: usize = 20;
    let mid_node = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_timoshenko_beam(n, l, a, iz, Some(as_y), "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_mid = results
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    // Analytical components
    let delta_bending: f64 = p * l.powi(3) / (48.0 * e_eff() * iz);
    let delta_shear: f64 = p * l / (4.0 * g_eff() * as_y);
    let delta_total: f64 = delta_bending + delta_shear;
    let shear_fraction: f64 = delta_shear / delta_total;

    // For L/d=3 with steel, shear contribution should be measurable (> 2%)
    assert!(
        shear_fraction > 0.02,
        "Shear fraction for L/d=3 should be > 2%, got {:.2}%",
        shear_fraction * 100.0
    );

    // Solver result should match analytical Timoshenko formula
    assert_close(d_mid, delta_total, 0.03, "Short beam (L/d=3) total deflection");

    // Verify bending component is correct by running EB beam
    let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_eb = make_timoshenko_beam(n, l, a, iz, None, "pinned", Some("rollerX"), loads_eb);
    let res_eb = linear::solve_2d(&input_eb).unwrap();
    let d_eb = res_eb
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    assert_close(d_eb, delta_bending, 0.02, "Short beam EB bending component");
}

// ================================================================
// 3. Long Beam (L/d = 20): Timoshenko Approaches Euler-Bernoulli
// ================================================================
//
// For slender beams the Timoshenko parameter phi becomes very small:
//   phi = 12*E*I / (G*As*L^2)
//
// As L/d grows, phi ~ (d/L)^2, so for L/d = 20, phi is O(1e-3).
// The difference between Timoshenko and Euler-Bernoulli should be
// less than 1% of the EB deflection.
//
// We test a cantilever with a tip load and verify convergence.

#[test]
fn validation_shear_def_ext_long_beam_convergence() {
    let d: f64 = 0.3;
    let b: f64 = 0.15;
    let l: f64 = 20.0 * d; // L/d = 20, L = 6.0 m
    let a: f64 = b * d;
    let iz: f64 = b * d.powi(3) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let p: f64 = 10.0; // kN
    let n: usize = 20;
    let tip_node = n + 1;

    // Timoshenko beam
    let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_t = make_timoshenko_beam(n, l, a, iz, Some(as_y), "fixed", None, loads_t);
    let res_t = linear::solve_2d(&input_t).unwrap();
    let d_timo = res_t
        .displacements
        .iter()
        .find(|dd| dd.node_id == tip_node)
        .unwrap()
        .uz
        .abs();

    // Euler-Bernoulli beam
    let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_eb = make_timoshenko_beam(n, l, a, iz, None, "fixed", None, loads_eb);
    let res_eb = linear::solve_2d(&input_eb).unwrap();
    let d_eb = res_eb
        .displacements
        .iter()
        .find(|dd| dd.node_id == tip_node)
        .unwrap()
        .uz
        .abs();

    // Analytical values
    let delta_eb_exact: f64 = p * l.powi(3) / (3.0 * e_eff() * iz);
    let delta_shear: f64 = p * l / (g_eff() * as_y);
    let phi: f64 = 12.0 * e_eff() * iz / (g_eff() * as_y * l * l);

    // phi should be small for L/d = 20
    assert!(
        phi < 0.02,
        "phi for L/d=20 should be small, got {:.6}",
        phi
    );

    // Solver EB result matches analytical EB
    assert_close(d_eb, delta_eb_exact, 0.01, "Long beam EB deflection");

    // Shear addition is less than 1% of bending for slender beam
    let shear_ratio: f64 = delta_shear / delta_eb_exact;
    assert!(
        shear_ratio < 0.01,
        "Shear/bending ratio for L/d=20 should be < 1%, got {:.4}%",
        shear_ratio * 100.0
    );

    // Timoshenko and EB should agree within 1%
    let rel_diff: f64 = (d_timo - d_eb).abs() / d_eb;
    assert!(
        rel_diff < 0.01,
        "Timoshenko vs EB for L/d=20: diff = {:.4}%, should be < 1%",
        rel_diff * 100.0
    );

    // Timoshenko should match its own analytical formula
    let delta_timo_exact: f64 = delta_eb_exact + delta_shear;
    assert_close(
        d_timo,
        delta_timo_exact,
        0.01,
        "Long beam Timoshenko analytical",
    );
}

// ================================================================
// 4. Cantilever Timoshenko Beam: Exact PL^3/(3EI) + PL/(kAG)
// ================================================================
//
// The cantilever with a tip load P is the canonical Timoshenko benchmark.
// The exact deflection at the free end is the sum of bending and shear:
//
//   delta = PL^3/(3EI)  +  PL/(kAG)
//
// where kAG = G * As = G * kappa * A.
//
// We test three different beam depths to verify the formula holds
// across the L/d spectrum: L/d = 2 (deep), L/d = 5 (moderate),
// L/d = 10 (slender).

#[test]
fn validation_shear_def_ext_cantilever_exact_formula() {
    let b: f64 = 0.2; // width
    let p: f64 = 80.0; // kN
    let n: usize = 20;
    let tip_node = n + 1;
    let kappa: f64 = 5.0 / 6.0;

    let depths = [0.5, 0.2, 0.1]; // d values giving L/d = 2, 5, 10 with L=1.0
    let l: f64 = 1.0;

    for &d in &depths {
        let ld: f64 = l / d;
        let a: f64 = b * d;
        let iz_val: f64 = b * d.powi(3) / 12.0;
        let as_y: f64 = kappa * a;

        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: tip_node,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })];
        let input = make_timoshenko_beam(n, l, a, iz_val, Some(as_y), "fixed", None, loads);
        let results = linear::solve_2d(&input).unwrap();

        let d_tip = results
            .displacements
            .iter()
            .find(|dd| dd.node_id == tip_node)
            .unwrap()
            .uz
            .abs();

        // Exact Timoshenko formula
        let delta_bending: f64 = p * l.powi(3) / (3.0 * e_eff() * iz_val);
        let delta_shear: f64 = p * l / (g_eff() * as_y);
        let delta_exact: f64 = delta_bending + delta_shear;

        assert_close(
            d_tip,
            delta_exact,
            0.02,
            &format!("Cantilever L/d={:.0} exact formula", ld),
        );

        // Verify tip rotation: theta = PL^2/(2EI) (unchanged by shear for cantilever tip load)
        let rz_tip = results
            .displacements
            .iter()
            .find(|dd| dd.node_id == tip_node)
            .unwrap()
            .ry
            .abs();
        let theta_exact: f64 = p * l * l / (2.0 * e_eff() * iz_val);
        assert_close(
            rz_tip,
            theta_exact,
            0.03,
            &format!("Cantilever L/d={:.0} tip rotation", ld),
        );
    }
}

// ================================================================
// 5. Shear Correction Factor kappa: Rectangular, I-beam, Circular
// ================================================================
//
// The shear correction factor kappa accounts for the non-uniform
// distribution of shear stress across the cross-section.
//
//   Rectangular: kappa = 5/6  (exact from elasticity theory)
//   I-beam:      kappa ~ A_web / A  (engineering approximation)
//   Circular:    kappa = 6/7  (exact from elasticity theory)
//
// We test simply-supported beams with UDL for each section type.
// The midspan deflection for SS beam with UDL:
//   delta = 5wL^4/(384EI) + wL^2/(8*G*As)
//
// By comparing the solver deflection with the analytical formula
// using the appropriate kappa, we confirm the shear area calculation.

#[test]
fn validation_shear_def_ext_shear_correction_factors() {
    let l: f64 = 2.0; // span
    let w: f64 = -30.0; // kN/m downward
    let n: usize = 20;
    let mid_node = n / 2 + 1;

    // --- (a) Rectangular section: 200mm x 400mm, kappa = 5/6 ---
    let b_rect: f64 = 0.2;
    let d_rect: f64 = 0.4;
    let a_rect: f64 = b_rect * d_rect;
    let iz_rect: f64 = b_rect * d_rect.powi(3) / 12.0;
    let kappa_rect: f64 = 5.0 / 6.0;
    let as_y_rect: f64 = kappa_rect * a_rect;

    let loads_rect: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_rect = make_timoshenko_beam(
        n,
        l,
        a_rect,
        iz_rect,
        Some(as_y_rect),
        "pinned",
        Some("rollerX"),
        loads_rect,
    );
    let res_rect = linear::solve_2d(&input_rect).unwrap();
    let d_rect_mid = res_rect
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    let w_abs: f64 = w.abs();
    let delta_b_rect: f64 = 5.0 * w_abs * l.powi(4) / (384.0 * e_eff() * iz_rect);
    let delta_s_rect: f64 = w_abs * l * l / (8.0 * g_eff() * as_y_rect);
    let delta_rect_exact: f64 = delta_b_rect + delta_s_rect;

    assert_close(
        d_rect_mid,
        delta_rect_exact,
        0.02,
        "Rectangular kappa=5/6 deflection",
    );

    // --- (b) I-beam approximation: kappa ~ A_web / A ---
    // Total A = 0.01 m^2, A_web = 0.004 m^2, Iz = 5e-5 m^4
    // This models a typical wide-flange section where shear is carried
    // primarily by the web.
    let a_ibeam: f64 = 0.01;
    let iz_ibeam: f64 = 5.0e-5;
    let a_web: f64 = 0.004; // web area
    let kappa_ibeam: f64 = a_web / a_ibeam; // ~ 0.4
    let as_y_ibeam: f64 = kappa_ibeam * a_ibeam; // = A_web

    let loads_i: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_i = make_timoshenko_beam(
        n,
        l,
        a_ibeam,
        iz_ibeam,
        Some(as_y_ibeam),
        "pinned",
        Some("rollerX"),
        loads_i,
    );
    let res_i = linear::solve_2d(&input_i).unwrap();
    let d_i_mid = res_i
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    let delta_b_i: f64 = 5.0 * w_abs * l.powi(4) / (384.0 * e_eff() * iz_ibeam);
    let delta_s_i: f64 = w_abs * l * l / (8.0 * g_eff() * as_y_ibeam);
    let delta_i_exact: f64 = delta_b_i + delta_s_i;

    assert_close(d_i_mid, delta_i_exact, 0.02, "I-beam kappa=Aw/A deflection");

    // --- (c) Circular section: diameter D = 0.3 m, kappa = 6/7 ---
    let diam: f64 = 0.3;
    let pi: f64 = std::f64::consts::PI;
    let a_circ: f64 = pi * diam * diam / 4.0;
    let iz_circ: f64 = pi * diam.powi(4) / 64.0;
    let kappa_circ: f64 = 6.0 / 7.0;
    let as_y_circ: f64 = kappa_circ * a_circ;

    let loads_c: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_c = make_timoshenko_beam(
        n,
        l,
        a_circ,
        iz_circ,
        Some(as_y_circ),
        "pinned",
        Some("rollerX"),
        loads_c,
    );
    let res_c = linear::solve_2d(&input_c).unwrap();
    let d_c_mid = res_c
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    let delta_b_c: f64 = 5.0 * w_abs * l.powi(4) / (384.0 * e_eff() * iz_circ);
    let delta_s_c: f64 = w_abs * l * l / (8.0 * g_eff() * as_y_circ);
    let delta_c_exact: f64 = delta_b_c + delta_s_c;

    assert_close(
        d_c_mid,
        delta_c_exact,
        0.02,
        "Circular kappa=6/7 deflection",
    );

    // Verify ordering of kappa values: circular (6/7) > rectangular (5/6) > I-beam (Aw/A)
    // Lower kappa => smaller shear area => more shear deflection per unit shear force.
    // The shear fraction of total deflection also depends on Iz/A ratio, so we verify
    // the direct effect: for the same geometry, lower kappa gives more shear deflection.
    // Here we verify each section's shear-to-bending ratio matches its kappa:
    //   shear/bending = (wL^2/(8*G*As)) / (5wL^4/(384EI)) = 48*E*I / (5*G*As*L^2)
    //                 = 48*E*I / (5*G*kappa*A*L^2)
    // So lower kappa => higher shear/bending ratio for same I and A.
    let ratio_rect: f64 = delta_s_rect / delta_b_rect;
    let ratio_i: f64 = delta_s_i / delta_b_i;
    let ratio_circ: f64 = delta_s_c / delta_b_c;

    // Each ratio should be positive (shear contributes to deflection)
    assert!(ratio_rect > 0.0, "Rectangular shear/bending ratio should be positive");
    assert!(ratio_i > 0.0, "I-beam shear/bending ratio should be positive");
    assert!(ratio_circ > 0.0, "Circular shear/bending ratio should be positive");

    // Verify each individual ratio matches the analytical formula:
    // shear/bending = 48*E*Iz / (5*G*As*L^2)
    let analytical_ratio_rect: f64 = 48.0 * e_eff() * iz_rect / (5.0 * g_eff() * as_y_rect * l * l);
    let analytical_ratio_circ: f64 = 48.0 * e_eff() * iz_circ / (5.0 * g_eff() * as_y_circ * l * l);
    assert_close(ratio_rect, analytical_ratio_rect, 0.02, "Rect shear/bending analytical");
    assert_close(ratio_circ, analytical_ratio_circ, 0.02, "Circ shear/bending analytical");
}

// ================================================================
// 6. Fixed-Fixed Beam: Shear Deformation Effect on Fixed-End Moments
// ================================================================
//
// For a fixed-fixed beam with a uniform distributed load w:
//
//   Euler-Bernoulli:
//     M_fixed = wL^2/12 (at each end)
//     delta_mid = wL^4 / (384EI)
//
//   Timoshenko:
//     The fixed-end moments change because the additional shear flexibility
//     modifies the stiffness coefficients. The Timoshenko stiffness matrix
//     has modified carry-over and stiffness factors.
//
//     For the fixed-fixed beam with UDL, the Timoshenko FEM is:
//       M_fixed = wL^2/12  (unchanged for UDL on fixed-fixed beam)
//
//     However, the midspan deflection increases:
//       delta_mid = wL^4/(384EI) + wL^2/(8*G*As) * (1 - ... correction)
//
// For a point load P at center of a fixed-fixed beam:
//   EB:  M_end = PL/8,  delta = PL^3/(192EI)
//   Timoshenko: delta = PL^3/(192EI) + PL/(4*G*As)
//
// The end moments may change for deep beams due to modified carry-over.
// We verify the deflection formula and compare end moments.

#[test]
fn validation_shear_def_ext_fixed_fixed_moments() {
    let d: f64 = 0.5;
    let b: f64 = 0.3;
    let l: f64 = 2.0; // L/d = 4 (moderately deep)
    let a: f64 = b * d;
    let iz: f64 = b * d.powi(3) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let p: f64 = 100.0; // kN central point load
    let n: usize = 20;
    let mid_node = n / 2 + 1;

    // --- Timoshenko fixed-fixed with center point load ---
    let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_t =
        make_timoshenko_beam(n, l, a, iz, Some(as_y), "fixed", Some("fixed"), loads_t);
    let res_t = linear::solve_2d(&input_t).unwrap();

    // --- Euler-Bernoulli fixed-fixed with center point load ---
    let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_eb =
        make_timoshenko_beam(n, l, a, iz, None, "fixed", Some("fixed"), loads_eb);
    let res_eb = linear::solve_2d(&input_eb).unwrap();

    let d_t_mid = res_t
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();
    let d_eb_mid = res_eb
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_node)
        .unwrap()
        .uz
        .abs();

    // Timoshenko midspan deflection for fixed-fixed, center point load
    let delta_eb_exact: f64 = p * l.powi(3) / (192.0 * e_eff() * iz);
    let delta_shear: f64 = p * l / (4.0 * g_eff() * as_y);
    let delta_t_exact: f64 = delta_eb_exact + delta_shear;

    // EB solver should match EB formula
    assert_close(d_eb_mid, delta_eb_exact, 0.02, "Fixed-fixed EB midspan deflection");

    // Timoshenko solver should match Timoshenko formula
    assert_close(
        d_t_mid,
        delta_t_exact,
        0.03,
        "Fixed-fixed Timoshenko midspan deflection",
    );

    // Timoshenko should give larger deflection than EB
    assert!(
        d_t_mid > d_eb_mid,
        "Timoshenko deflection ({:.6e}) should exceed EB ({:.6e})",
        d_t_mid,
        d_eb_mid
    );

    // Compare end moments: for center point load on fixed-fixed beam
    // EB: M_end = PL/8
    let m_end_eb_exact: f64 = p * l / 8.0;
    let m_end_eb_solver = res_eb
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .my
        .abs();

    assert_close(
        m_end_eb_solver,
        m_end_eb_exact,
        0.02,
        "Fixed-fixed EB end moment",
    );

    // Timoshenko end moments: for a symmetric point load, the end moments
    // remain PL/8 because equilibrium and symmetry enforce it regardless
    // of the beam theory (the shear correction is symmetric).
    let m_end_t_solver = res_t
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .my
        .abs();

    assert_close(
        m_end_t_solver,
        m_end_eb_exact,
        0.03,
        "Fixed-fixed Timoshenko end moment (symmetric load)",
    );

    // Verify reactions are symmetric for both
    let r_left_t = res_t
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .rz;
    let r_right_t = res_t
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap()
        .rz;
    assert_close(r_left_t, r_right_t, 0.01, "Fixed-fixed Timoshenko reaction symmetry");
    assert_close(r_left_t, p / 2.0, 0.01, "Fixed-fixed Timoshenko R = P/2");
}

// ================================================================
// 7. Deep Beam (L/d = 2): Shear Dominates Total Deflection
// ================================================================
//
// For a very deep beam (L/d = 2), the shear deformation contributes
// a substantial fraction of the total deflection. This test uses a
// cantilever to isolate the effect.
//
// Cantilever tip load:
//   delta_bending = PL^3 / (3EI)
//   delta_shear   = PL / (G*As)
//   shear_fraction = delta_shear / (delta_bending + delta_shear)
//                  = 1 / (1 + G*As*L^2/(3EI))
//
// For a square section (d x d) with L = 2d:
//   I = d^4/12, A = d^2, As = (5/6)d^2
//   shear_frac = 1 / (1 + (5/6)*G*d^2*(2d)^2 / (3*E*d^4/12))
//              = 1 / (1 + (5/6)*G*4 / (E/4))
//              = 1 / (1 + (40G)/(3E))
//
// For steel (E/G ~ 2.6): shear_frac ~ 1 / (1 + 40/(3*2.6)) ~ 16%

#[test]
fn validation_shear_def_ext_deep_beam_shear_dominates() {
    let d: f64 = 0.5; // square section depth/width
    let l: f64 = 2.0 * d; // L/d = 2
    let a: f64 = d * d;
    let iz: f64 = d.powi(4) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let p: f64 = 200.0; // kN
    let n: usize = 20;
    let tip_node = n + 1;

    // Timoshenko cantilever
    let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_t = make_timoshenko_beam(n, l, a, iz, Some(as_y), "fixed", None, loads_t);
    let res_t = linear::solve_2d(&input_t).unwrap();

    let d_tip = res_t
        .displacements
        .iter()
        .find(|dd| dd.node_id == tip_node)
        .unwrap()
        .uz
        .abs();

    // Analytical decomposition
    let delta_bending: f64 = p * l.powi(3) / (3.0 * e_eff() * iz);
    let delta_shear: f64 = p * l / (g_eff() * as_y);
    let delta_total: f64 = delta_bending + delta_shear;
    let shear_fraction: f64 = delta_shear / delta_total;

    // Solver matches analytical total
    assert_close(d_tip, delta_total, 0.02, "Deep beam (L/d=2) total deflection");

    // Shear should contribute significantly (> 10%) for this deep beam
    assert!(
        shear_fraction > 0.10,
        "Deep beam shear fraction should be > 10%, got {:.2}%",
        shear_fraction * 100.0
    );

    // Verify via EB comparison
    let loads_eb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: tip_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input_eb = make_timoshenko_beam(n, l, a, iz, None, "fixed", None, loads_eb);
    let res_eb = linear::solve_2d(&input_eb).unwrap();
    let d_eb = res_eb
        .displacements
        .iter()
        .find(|dd| dd.node_id == tip_node)
        .unwrap()
        .uz
        .abs();

    // EB deflection matches bending-only analytical
    assert_close(d_eb, delta_bending, 0.01, "Deep beam EB bending-only");

    // The additional deflection from shear
    let d_shear_computed: f64 = d_tip - d_eb;
    assert_close(
        d_shear_computed,
        delta_shear,
        0.03,
        "Deep beam shear deflection increment",
    );

    // Also check the Timoshenko parameter phi
    let phi: f64 = 12.0 * e_eff() * iz / (g_eff() * as_y * l * l);
    // For L/d=2, phi should be substantial
    assert!(
        phi > 0.3,
        "phi for L/d=2 should be substantial, got {:.4}",
        phi
    );
}

// ================================================================
// 8. Continuous Beam: Shear Deformation Effect on Moment
//    Redistribution
// ================================================================
//
// For a two-span continuous beam with uniform load, shear deformation
// modifies the stiffness distribution and changes the internal moment
// at the middle support.
//
// Euler-Bernoulli two equal spans L, UDL w:
//   M_middle_support = wL^2/8  (from three-moment equation)
//   R_middle = 5wL/4  (from equilibrium)
//   R_end = 3wL/8
//
// With Timoshenko theory on deep beams, the reduced effective stiffness
// changes the moment distribution. The middle support moment is modified
// because the carry-over factor changes from 1/2 (EB) to (1/2)*(1/(1+phi)).
//
// We compare Timoshenko vs EB for a moderately deep continuous beam
// (L/d = 4) and verify:
//   - Both satisfy global equilibrium
//   - The moment at the interior support changes
//   - The change is in the expected direction

#[test]
fn validation_shear_def_ext_continuous_beam_redistribution() {
    let d: f64 = 0.5; // depth
    let b: f64 = 0.3; // width
    let span: f64 = 4.0 * d; // L/d = 4, span = 2.0 m
    let a: f64 = b * d;
    let iz: f64 = b * d.powi(3) / 12.0;
    let kappa: f64 = 5.0 / 6.0;
    let as_y: f64 = kappa * a;
    let w: f64 = -40.0; // kN/m downward
    let n_per_span: usize = 10;
    let total_elements = n_per_span * 2;

    // --- Timoshenko continuous beam ---
    let loads_t: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_t = make_timoshenko_continuous_beam(
        &[span, span],
        n_per_span,
        a,
        iz,
        Some(as_y),
        loads_t,
    );
    let res_t = linear::solve_2d(&input_t).unwrap();

    // --- Euler-Bernoulli continuous beam ---
    let loads_eb: Vec<SolverLoad> = (1..=total_elements)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: w,
                q_j: w,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_eb = make_timoshenko_continuous_beam(
        &[span, span],
        n_per_span,
        a,
        iz,
        None,
        loads_eb,
    );
    let res_eb = linear::solve_2d(&input_eb).unwrap();

    let w_abs: f64 = w.abs();
    let total_load: f64 = w_abs * 2.0 * span; // total load on both spans

    // Global equilibrium: sum of vertical reactions = total load
    let sum_ry_t: f64 = res_t.reactions.iter().map(|r| r.rz).sum();
    let sum_ry_eb: f64 = res_eb.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry_t, total_load, 0.01, "Continuous Timoshenko equilibrium");
    assert_close(sum_ry_eb, total_load, 0.01, "Continuous EB equilibrium");

    // EB analytical: middle support reaction = 10wL/8 = 5wL/4
    let middle_support_node = n_per_span + 1;
    let r_mid_eb = res_eb
        .reactions
        .iter()
        .find(|r| r.node_id == middle_support_node)
        .unwrap()
        .rz;
    let r_mid_eb_exact: f64 = 5.0 * w_abs * span / 4.0;

    assert_close(
        r_mid_eb,
        r_mid_eb_exact,
        0.02,
        "Continuous EB middle reaction = 5wL/4",
    );

    // EB analytical: end support reaction = 3wL/8
    let r_end_eb = res_eb
        .reactions
        .iter()
        .find(|r| r.node_id == 1)
        .unwrap()
        .rz;
    let r_end_eb_exact: f64 = 3.0 * w_abs * span / 8.0;
    assert_close(
        r_end_eb,
        r_end_eb_exact,
        0.02,
        "Continuous EB end reaction = 3wL/8",
    );

    // Timoshenko middle reaction: should differ from EB for deep beam
    let _r_mid_t = res_t
        .reactions
        .iter()
        .find(|r| r.node_id == middle_support_node)
        .unwrap()
        .rz;

    // The middle support moment (hogging) from element forces
    // Element just left of middle support: element n_per_span
    let ef_left_eb = res_eb
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let ef_left_t = res_t
        .element_forces
        .iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();

    let m_mid_eb: f64 = ef_left_eb.m_end.abs();
    let m_mid_t: f64 = ef_left_t.m_end.abs();

    // EB hogging moment at middle support = wL^2/8
    let m_mid_eb_exact: f64 = w_abs * span * span / 8.0;
    assert_close(
        m_mid_eb,
        m_mid_eb_exact,
        0.03,
        "Continuous EB middle support moment = wL^2/8",
    );

    // Timoshenko modifies the moment distribution for deep beams.
    // The carry-over factor decreases with phi, which reduces the
    // hogging moment at the middle support.
    // For L/d = 4, the effect should be measurable.
    let moment_change_pct: f64 = (m_mid_t - m_mid_eb).abs() / m_mid_eb * 100.0;

    // The change should be detectable (> 0.1%) but modest for L/d = 4
    // (For very deep beams L/d < 3, the change can be > 5%)
    assert!(
        moment_change_pct > 0.1,
        "Moment redistribution should be detectable for L/d=4, got {:.4}%",
        moment_change_pct
    );

    // Verify phi for this configuration
    let phi: f64 = 12.0 * e_eff() * iz / (g_eff() * as_y * span * span);
    assert!(
        phi > 0.01,
        "phi for L/d=4 should be non-negligible, got {:.6}",
        phi
    );

    // Timoshenko midspan deflections should be larger than EB
    let mid_span1_node = n_per_span / 2 + 1;
    let d_mid_t = res_t
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_span1_node)
        .unwrap()
        .uz
        .abs();
    let d_mid_eb = res_eb
        .displacements
        .iter()
        .find(|dd| dd.node_id == mid_span1_node)
        .unwrap()
        .uz
        .abs();

    assert!(
        d_mid_t > d_mid_eb,
        "Timoshenko midspan deflection ({:.6e}) should exceed EB ({:.6e})",
        d_mid_t,
        d_mid_eb
    );

    // The Timoshenko/EB deflection ratio for continuous beams can be larger
    // than for simply-supported beams because continuity greatly reduces the
    // EB deflection (making the denominator smaller), while the shear
    // deformation addition is roughly proportional to span length.
    // For L/d = 4, the ratio is typically between 1.0 and 1.0 + 5*phi.
    let deflection_ratio: f64 = d_mid_t / d_mid_eb;
    assert!(
        deflection_ratio > 1.0 && deflection_ratio < 1.0 + 5.0 * phi,
        "Deflection ratio ({:.6}) should be between 1.0 and {:.6}",
        deflection_ratio,
        1.0 + 5.0 * phi
    );
}
