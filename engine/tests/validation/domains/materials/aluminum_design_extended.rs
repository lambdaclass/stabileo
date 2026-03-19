/// Validation: Extended Aluminum Structural Design
///
/// References:
///   - Aluminum Design Manual (ADM) 2020, The Aluminum Association
///   - EN 1999-1-1:2007 (EC9): Design of aluminium structures
///   - Sharp: "Behavior and Design of Aluminum Structures" (1993)
///   - Kissell & Ferry: "Aluminum Structures" 2nd ed. (2002)
///   - Mazzolani: "Aluminium Alloy Structures" 2nd ed. (1995)
///
/// Tests cover aluminum-specific topics NOT in the base file:
///   1. Thermal expansion in a restrained aluminum beam
///   2. Aluminum truss bridge panel — stiffness comparison with steel
///   3. Plate buckling — local buckling of flat aluminum plate elements
///   4. Welded aluminum beam with HAZ-reduced section under UDL
///   5. Aluminum alloy comparison (5083-H116 vs 6061-T6 vs 6082-T6)
///   6. Aluminum two-span continuous beam under UDL
///   7. Aluminum portal frame under lateral load
///   8. Effective width method for aluminum compressed plate elements

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// Aluminum material constants (6061-T6 unless noted)
// ================================================================
const E_AL: f64 = 69_600.0;         // MPa (solver multiplies by 1000 => kN/m^2)
const A_BEAM: f64 = 3.0e-3;         // m^2 (3000 mm^2)
const IZ_BEAM: f64 = 2.5e-5;        // m^4 (2.5e7 mm^4)
const NU_AL: f64 = 0.33;

// ================================================================
// 1. Thermal Expansion in a Restrained Aluminum Beam
// ================================================================
//
// Aluminum has a high CTE: alpha = 23.1e-6 /C (vs 12e-6 for steel).
// A fully restrained beam under temperature change develops:
//   F = alpha * dT * E * A
// Verify the thermal force is approximately 2x that of steel for same dT.
//
// Reference: ADM 2020, Chapter D; Kissell & Ferry Ch. 3.

#[test]
fn aluminum_thermal_restraint_force() {
    let alpha_al: f64 = 23.1e-6;    // /C, aluminum CTE
    let alpha_steel: f64 = 12.0e-6;  // /C, steel CTE
    let e_al: f64 = 69_600.0;        // MPa
    let e_steel: f64 = 200_000.0;    // MPa
    let area: f64 = 3000.0;          // mm^2, cross-section area
    let dt: f64 = 50.0;              // C, temperature rise

    // Thermal force: F = alpha * dT * E * A
    let f_al: f64 = alpha_al * dt * e_al * area / 1000.0;  // kN
    let f_steel: f64 = alpha_steel * dt * e_steel * area / 1000.0; // kN

    // Al: 23.1e-6 * 50 * 69600 * 3000 / 1000 = 241.16 kN
    let f_al_expected: f64 = 23.1e-6 * 50.0 * 69_600.0 * 3000.0 / 1000.0;
    crate::common::assert_close(f_al, f_al_expected, 0.001, "Aluminum thermal force");

    // Steel: 12e-6 * 50 * 200000 * 3000 / 1000 = 360.0 kN
    let f_steel_expected: f64 = 12.0e-6 * 50.0 * 200_000.0 * 3000.0 / 1000.0;
    crate::common::assert_close(f_steel, f_steel_expected, 0.001, "Steel thermal force");

    // Ratio: aluminum thermal force / steel thermal force
    let ratio: f64 = f_al / f_steel;
    // = (23.1*69600) / (12*200000) = 1607760 / 2400000 = 0.670
    let ratio_expected: f64 = (alpha_al * e_al) / (alpha_steel * e_steel);
    crate::common::assert_close(ratio, ratio_expected, 0.001, "Al/steel thermal force ratio");

    // Despite higher CTE, aluminum's lower E means lower restrained force
    assert!(
        f_al < f_steel,
        "Al thermal force {:.1} kN < steel {:.1} kN due to lower E",
        f_al, f_steel
    );
}

// ================================================================
// 2. Aluminum Truss Panel — Stiffness Comparison
// ================================================================
//
// Simple 2-bar truss (V-shape) loaded at apex.
// Compare deflection of aluminum vs steel truss with same geometry
// and cross-section. Deflection ratio should be E_steel/E_al.
//
// Reference: Timoshenko, "Theory of Structures"; Sharp Ch. 7.

#[test]
fn aluminum_truss_panel_deflection() {
    // V-truss: nodes at (0,0), (4,0), (2,2)
    // Two bars: 1-3 and 2-3, both pinned ends (truss elements)
    // Vertical load P at node 3
    let p: f64 = -50.0; // kN downward

    let a_truss: f64 = 2.0e-3;   // m^2 (2000 mm^2)
    let iz_truss: f64 = 1.0e-6;  // m^4 (small, truss behavior)

    // Aluminum truss
    let nodes_al = vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)];
    let mats_al = vec![(1, E_AL, NU_AL)];
    let secs_al = vec![(1, a_truss, iz_truss)];
    let elems_al = vec![
        (1, "frame", 1_usize, 3_usize, 1_usize, 1_usize, true, true),
        (2, "frame", 2_usize, 3_usize, 1_usize, 1_usize, true, true),
    ];
    let sups_al = vec![(1, 1_usize, "pinned"), (2, 2_usize, "pinned")];
    let loads_al = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: p, my: 0.0,
    })];
    let input_al = make_input(nodes_al, mats_al, secs_al, elems_al, sups_al, loads_al);
    let results_al = linear::solve_2d(&input_al).unwrap();

    // Steel truss (same geometry, E=200000 MPa)
    let e_steel: f64 = 200_000.0;
    let nodes_st = vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 2.0)];
    let mats_st = vec![(1, e_steel, 0.3)];
    let secs_st = vec![(1, a_truss, iz_truss)];
    let elems_st = vec![
        (1, "frame", 1_usize, 3_usize, 1_usize, 1_usize, true, true),
        (2, "frame", 2_usize, 3_usize, 1_usize, 1_usize, true, true),
    ];
    let sups_st = vec![(1, 1_usize, "pinned"), (2, 2_usize, "pinned")];
    let loads_st = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: p, my: 0.0,
    })];
    let input_st = make_input(nodes_st, mats_st, secs_st, elems_st, sups_st, loads_st);
    let results_st = linear::solve_2d(&input_st).unwrap();

    // Get apex deflections
    let d_al = results_al.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d_st = results_st.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Deflection ratio should equal E_steel/E_al since delta ~ 1/E
    let defl_ratio: f64 = d_al.uz / d_st.uz;
    let e_ratio: f64 = e_steel / E_AL;
    crate::common::assert_close(defl_ratio, e_ratio, 0.02, "Truss deflection ratio Al/Steel");

    // Verify reactions are identical (same load, same geometry)
    let r1_al = results_al.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r1_st = results_st.reactions.iter().find(|r| r.node_id == 1).unwrap();
    crate::common::assert_close(r1_al.rz, r1_st.rz, 0.01, "Reaction R1y same for Al and Steel");
}

// ================================================================
// 3. Plate Buckling — Local Buckling of Flat Aluminum Plate Elements
// ================================================================
//
// Critical buckling stress for a flat plate element:
//   sigma_cr = k * pi^2 * E / (12*(1-nu^2)) * (t/b)^2
// where k is the plate buckling coefficient.
//
// For simply-supported edges under uniform compression: k=4.0
// For one free edge (outstanding flange): k=0.425
//
// Reference: EC9 Annex E; Sharp Ch. 5; Mazzolani Ch. 4.

#[test]
fn aluminum_plate_local_buckling() {
    let e: f64 = 69_600.0;     // MPa
    let nu: f64 = 0.33;
    let pi: f64 = std::f64::consts::PI;

    // Case 1: Internal element (both edges supported), k=4.0
    let k_int: f64 = 4.0;
    let t1: f64 = 6.0;         // mm, plate thickness
    let b1: f64 = 150.0;       // mm, plate width

    let d_factor: f64 = pi * pi * e / (12.0 * (1.0 - nu * nu));
    let sigma_cr_int: f64 = k_int * d_factor * (t1 / b1).powi(2);
    // = 4 * pi^2*69600/(12*(1-0.1089)) * (6/150)^2
    // = 4 * 63466.7 * 0.0016 = 406.1 MPa

    let sigma_cr_int_expected: f64 = k_int * pi * pi * e / (12.0 * (1.0 - nu * nu)) * (t1 / b1) * (t1 / b1);
    crate::common::assert_close(sigma_cr_int, sigma_cr_int_expected, 0.001, "Internal plate sigma_cr");

    // Case 2: Outstanding element (one free edge), k=0.425
    let k_out: f64 = 0.425;
    let t2: f64 = 8.0;         // mm
    let b2: f64 = 80.0;        // mm

    let sigma_cr_out: f64 = k_out * d_factor * (t2 / b2).powi(2);

    // Verify outstanding flange is more susceptible to buckling
    // Compare at same b/t ratio
    let bt_int: f64 = b1 / t1;  // 25
    let bt_out: f64 = b2 / t2;  // 10
    let sigma_at_same_bt_int: f64 = k_int * d_factor * (1.0 / bt_int).powi(2);
    let sigma_at_same_bt_out: f64 = k_out * d_factor * (1.0 / bt_int).powi(2);

    // k_out/k_int ratio check
    let k_ratio: f64 = k_out / k_int;
    crate::common::assert_close(k_ratio, 0.10625, 0.001, "k_out/k_int ratio");

    // Outstanding flange at same b/t has much lower buckling stress
    assert!(
        sigma_at_same_bt_out < sigma_at_same_bt_int,
        "Outstanding {:.1} < internal {:.1} MPa at b/t={:.0}",
        sigma_at_same_bt_out, sigma_at_same_bt_int, bt_int
    );

    // Check that thicker outstanding flange can still be adequate
    assert!(
        sigma_cr_out > 0.0,
        "Outstanding flange buckling stress: {:.1} MPa", sigma_cr_out
    );

    let _ = bt_out;
}

// ================================================================
// 4. Welded Aluminum Beam with HAZ-Reduced Section Under UDL
// ================================================================
//
// A simply-supported aluminum beam with UDL. Compare midspan deflection
// using parent material E. Then verify that the moment capacity at the
// welded joint (HAZ zone) is reduced compared to parent capacity.
//
// Reference: EC9 clause 6.2; ADM Chapter F.

#[test]
fn aluminum_welded_beam_haz_capacity() {
    // SS beam, L=5m, UDL q=8 kN/m
    let l: f64 = 5.0;           // m
    let q: f64 = -8.0;          // kN/m (downward)
    let n: usize = 8;

    // Section properties (I-beam, 6061-T6)
    let a: f64 = 3.0e-3;         // m^2
    let iz: f64 = 2.5e-5;        // m^4
    let s_elastic: f64 = 250_000.0; // mm^3, elastic section modulus

    let input = make_ss_beam_udl(n, l, E_AL, a, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: delta = 5*q*L^4 / (384*EI)
    let e_eff: f64 = E_AL * 1000.0;  // kN/m^2
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    crate::common::assert_close(mid_d.uz.abs(), delta_exact, 0.02, "Al beam midspan deflection");

    // Maximum moment: M = q*L^2/8
    let m_max: f64 = q.abs() * l * l / 8.0; // kN.m = 25.0

    // Parent material moment capacity: M_parent = S * Fy
    let fy_parent: f64 = 241.0;   // MPa (6061-T6)
    let m_parent: f64 = s_elastic * fy_parent / 1e6; // kN.m

    // HAZ moment capacity: M_haz = S * Fy_haz
    let fy_haz: f64 = 110.0;      // MPa (6061-T6 HAZ)
    let m_haz: f64 = s_elastic * fy_haz / 1e6;   // kN.m

    // Verify utilization ratios
    let util_parent: f64 = m_max / m_parent;
    let util_haz: f64 = m_max / m_haz;

    // HAZ utilization is higher (more critical)
    assert!(
        util_haz > util_parent,
        "HAZ utilization {:.3} > parent {:.3}", util_haz, util_parent
    );

    // HAZ reduction factor
    let rho_haz: f64 = fy_haz / fy_parent;
    crate::common::assert_close(rho_haz, 0.456, 0.01, "HAZ strength reduction factor");

    // Verify capacity ratio equals inverse of HAZ factor
    let capacity_ratio: f64 = m_haz / m_parent;
    crate::common::assert_close(capacity_ratio, rho_haz, 0.001, "Moment capacity ratio = rho_haz");
}

// ================================================================
// 5. Aluminum Alloy Comparison (5083-H116, 6061-T6, 6082-T6)
// ================================================================
//
// Different aluminum alloys have different properties.
// 5083-H116: marine grade, non-heat-treatable, lower strength
// 6061-T6: general structural, heat-treatable
// 6082-T6: European standard structural alloy
//
// Reference: ADM Table 3.1; EC9 Table 3.2b; Mazzolani Ch. 2.

#[test]
fn aluminum_alloy_property_comparison() {
    // 5083-H116 (marine grade, non-heat-treatable)
    let fy_5083: f64 = 215.0;    // MPa
    let fu_5083: f64 = 305.0;    // MPa
    let e_5083: f64 = 70_300.0;  // MPa

    // 6061-T6 (standard structural)
    let fy_6061: f64 = 241.0;
    let fu_6061: f64 = 290.0;
    let e_6061: f64 = 69_600.0;

    // 6082-T6 (European structural)
    let fy_6082: f64 = 255.0;    // MPa
    let fu_6082: f64 = 290.0;    // MPa
    let e_6082: f64 = 70_000.0;  // MPa

    // All E values within ~1% of each other
    let e_avg: f64 = (e_5083 + e_6061 + e_6082) / 3.0;
    let e_spread: f64 = ((e_5083 - e_avg).abs())
        .max((e_6061 - e_avg).abs())
        .max((e_6082 - e_avg).abs());
    let e_variation: f64 = e_spread / e_avg;
    assert!(
        e_variation < 0.02,
        "E variation among alloys: {:.1}% (all similar)", e_variation * 100.0
    );

    // 6082-T6 has highest yield strength
    assert!(fy_6082 > fy_6061 && fy_6061 > fy_5083,
        "Fy ranking: 6082({:.0}) > 6061({:.0}) > 5083({:.0})",
        fy_6082, fy_6061, fy_5083);

    // 5083 has highest ultimate (non-heat-treatable alloys have higher fu/fy ratio)
    let ratio_5083: f64 = fu_5083 / fy_5083;
    let ratio_6061: f64 = fu_6061 / fy_6061;
    let ratio_6082: f64 = fu_6082 / fy_6082;

    // 5083 has larger fu/fy ratio (more ductile in hardening sense)
    assert!(
        ratio_5083 > ratio_6061,
        "5083 fu/fy={:.3} > 6061 fu/fy={:.3}", ratio_5083, ratio_6061
    );

    crate::common::assert_close(ratio_5083, 1.419, 0.01, "5083-H116 fu/fy ratio");
    crate::common::assert_close(ratio_6061, 1.203, 0.01, "6061-T6 fu/fy ratio");
    crate::common::assert_close(ratio_6082, 1.137, 0.01, "6082-T6 fu/fy ratio");

    // HAZ reduction is worse for heat-treatable alloys
    // 5083-H116 HAZ: Fy_haz ~ 125 MPa (retains ~58%)
    // 6061-T6 HAZ:   Fy_haz ~ 110 MPa (retains ~46%)
    let haz_retention_5083: f64 = 125.0 / fy_5083;
    let haz_retention_6061: f64 = 110.0 / fy_6061;

    assert!(
        haz_retention_5083 > haz_retention_6061,
        "5083 HAZ retention {:.1}% > 6061 {:.1}%",
        haz_retention_5083 * 100.0, haz_retention_6061 * 100.0
    );
}

// ================================================================
// 6. Aluminum Two-Span Continuous Beam Under UDL
// ================================================================
//
// Two equal spans, L each, under uniform load q.
// Central support reaction: R_B = 1.25*qL (by three-moment theorem)
// End reactions: R_A = R_C = 0.375*qL
// Moment at central support: M_B = -q*L^2/8
//
// Reference: Ghali & Neville, "Structural Analysis" Table 12.1;
//            Timoshenko, "Strength of Materials" Part I.

#[test]
fn aluminum_continuous_beam_two_span() {
    let l: f64 = 4.0;          // m per span
    let q: f64 = -12.0;        // kN/m downward
    let n_per_span: usize = 4;

    // Build continuous beam: pinned-roller-roller, 2 spans
    let total_elements = 2 * n_per_span;
    let elem_len: f64 = l / n_per_span as f64;

    let mut nodes = Vec::new();
    for i in 0..=(total_elements) {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    let mut elems = Vec::new();
    for i in 0..total_elements {
        elems.push((i + 1, "frame", i + 1, i + 2, 1_usize, 1_usize, false, false));
    }
    // Supports: pinned at node 1, roller at node (n_per_span+1), roller at node (2*n_per_span+1)
    let mid_node = n_per_span + 1;
    let end_node = 2 * n_per_span + 1;
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, mid_node, "rollerX"),
        (3, end_node, "rollerX"),
    ];

    // Distributed loads on all elements
    let mut loads = Vec::new();
    for i in 0..total_elements {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E_AL, NU_AL)],
        vec![(1, A_BEAM, IZ_BEAM)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // Analytical reactions for two-span continuous beam under UDL:
    // R_A = R_C = 3*q*L/8 = 0.375*q*L
    // R_B = 10*q*L/8 = 1.25*q*L
    let r_end_expected: f64 = 3.0 * q_abs * l / 8.0;
    let r_mid_expected: f64 = 10.0 * q_abs * l / 8.0;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == end_node).unwrap();

    crate::common::assert_close(r_a.rz, r_end_expected, 0.02, "R_A = 3qL/8");
    crate::common::assert_close(r_b.rz, r_mid_expected, 0.02, "R_B = 10qL/8");
    crate::common::assert_close(r_c.rz, r_end_expected, 0.02, "R_C = 3qL/8");

    // Equilibrium check: sum of reactions = total load
    let total_load: f64 = q_abs * 2.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    crate::common::assert_close(sum_ry, total_load, 0.01, "Equilibrium: sum Ry = q*2L");

    // Moment at central support: M_B = -q*L^2/8 (hogging)
    let m_b_expected: f64 = q_abs * l * l / 8.0; // magnitude
    // The element ending at mid_node should have m_end close to this
    let ef_at_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    // m_end of element ending at the central support (hogging moment)
    crate::common::assert_close(ef_at_mid.m_end.abs(), m_b_expected, 0.02, "M_B = qL^2/8");
}

// ================================================================
// 7. Aluminum Portal Frame Under Lateral Load
// ================================================================
//
// Portal frame with fixed bases, aluminum columns and beam.
// Lateral load H at beam level. By symmetry + stiffness method:
//   Column moment at base = H*h/4 (for equal EI columns and beam)
// when beam is rigid relative to columns.
//
// Reference: Ghali & Neville Ch. 7; Mazzolani Ch. 8.

#[test]
fn aluminum_portal_frame_lateral() {
    let h: f64 = 3.5;          // m, column height
    let w: f64 = 6.0;          // m, beam span
    let lateral_h: f64 = 20.0; // kN, lateral load at beam level

    // Use larger beam I to approximate rigid beam behavior
    let a_col: f64 = 3.0e-3;
    let iz_col: f64 = 2.5e-5;

    let input = make_portal_frame(h, w, E_AL, a_col, iz_col, lateral_h, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Total horizontal reactions must balance applied load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    crate::common::assert_close(sum_rx, -lateral_h, 0.02, "Sum Rx = -H");

    // Total vertical reactions must be zero (no vertical load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    crate::common::assert_close(sum_ry, 0.0, 0.05, "Sum Ry = 0");

    // For a symmetric portal with equal columns (fixed-fixed), each column
    // carries half the shear: V_col = H/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Both columns carry shear (horizontal reactions)
    // With equal stiffness, they share roughly equally
    let v_col_expected: f64 = lateral_h / 2.0;
    crate::common::assert_close(r1.rx.abs(), v_col_expected, 0.15, "Left column shear ~ H/2");
    crate::common::assert_close(r4.rx.abs(), v_col_expected, 0.15, "Right column shear ~ H/2");

    // Base moment: for portal with equal I columns and beam:
    // M_base is related to the stiffness distribution. With same EI for both
    // columns and beam, each fixed base moment is nonzero.
    assert!(
        r1.my.abs() > 0.0 && r4.my.abs() > 0.0,
        "Base moments are nonzero: M1={:.2}, M4={:.2}", r1.my, r4.my
    );

    // Global moment equilibrium about base of left column:
    // H*h + R4_x * 0 - R4_y * w - M1 - M4 = 0 (approximately)
    // Check: H*h = sum of base moments + R4_y * w
    let overturning: f64 = lateral_h * h;
    let resisting: f64 = r1.my.abs() + r4.my.abs() + r4.rz.abs() * w;
    crate::common::assert_close(overturning, resisting, 0.05, "Moment equilibrium about base");
}

// ================================================================
// 8. Effective Width Method for Aluminum Compressed Plate Elements
// ================================================================
//
// For slender plate elements that buckle locally, the effective width
// approach reduces the width for capacity calculation:
//   b_eff / b = rho = (1/lambda_p) - (0.22/lambda_p^2)  for lambda_p > 0.673
//   b_eff / b = 1.0                                       for lambda_p <= 0.673
// where lambda_p = sqrt(fy / sigma_cr)
//
// Reference: EC9-1-1 clause 6.1.5; Sharp Ch. 5;
//            Winter's formula (adapted for aluminum).

#[test]
fn aluminum_effective_width_method() {
    let e: f64 = 69_600.0;     // MPa
    let nu: f64 = 0.33;
    let fz: f64 = 241.0;       // MPa (6061-T6)
    let pi: f64 = std::f64::consts::PI;

    // Plate buckling coefficient for internal element under uniform compression
    let k: f64 = 4.0;

    // Case 1: Compact plate (b/t = 12), expect full effective width
    let bt_compact: f64 = 12.0;
    let sigma_cr_1: f64 = k * pi * pi * e / (12.0 * (1.0 - nu * nu)) * (1.0 / bt_compact).powi(2);
    let lambda_p_1: f64 = (fz / sigma_cr_1).sqrt();

    // For b/t=12: sigma_cr is high, lambda_p should be < 0.673
    let rho_1: f64 = if lambda_p_1 <= 0.673 {
        1.0
    } else {
        (1.0 / lambda_p_1) - (0.22 / (lambda_p_1 * lambda_p_1))
    };
    crate::common::assert_close(rho_1, 1.0, 0.001, "Compact plate: full effective width");

    // Case 2: Slender plate (b/t = 40), expect reduced effective width
    let bt_slender: f64 = 40.0;
    let sigma_cr_2: f64 = k * pi * pi * e / (12.0 * (1.0 - nu * nu)) * (1.0 / bt_slender).powi(2);
    let lambda_p_2: f64 = (fz / sigma_cr_2).sqrt();

    // lambda_p_2 should be > 0.673 for b/t=40
    assert!(
        lambda_p_2 > 0.673,
        "Slender plate lambda_p = {:.3} > 0.673", lambda_p_2
    );

    let rho_2: f64 = if lambda_p_2 <= 0.673 {
        1.0
    } else {
        (1.0 / lambda_p_2) - (0.22 / (lambda_p_2 * lambda_p_2))
    };

    // Effective width ratio should be between 0 and 1
    assert!(
        rho_2 > 0.0 && rho_2 < 1.0,
        "Slender plate rho = {:.3}, between 0 and 1", rho_2
    );

    // Case 3: Very slender plate (b/t = 60)
    let bt_very_slender: f64 = 60.0;
    let sigma_cr_3: f64 = k * pi * pi * e / (12.0 * (1.0 - nu * nu)) * (1.0 / bt_very_slender).powi(2);
    let lambda_p_3: f64 = (fz / sigma_cr_3).sqrt();
    let rho_3: f64 = if lambda_p_3 <= 0.673 {
        1.0
    } else {
        (1.0 / lambda_p_3) - (0.22 / (lambda_p_3 * lambda_p_3))
    };

    // More slender => lower effective width
    assert!(
        rho_3 < rho_2,
        "Very slender rho={:.3} < slender rho={:.3}", rho_3, rho_2
    );

    // Verify numerical values
    // b/t=40: sigma_cr = 4*pi^2*69600/(12*0.8911)*(1/1600) = 253889.5*0.000625 = 158.68
    // lambda_p = sqrt(241/158.68) = sqrt(1.519) = 1.232
    // rho = 1/1.232 - 0.22/1.519 = 0.812 - 0.145 = 0.667
    crate::common::assert_close(rho_2, 0.667, 0.05, "Slender plate effective width ratio");

    // Effective area reduction for capacity check
    let b_plate: f64 = 200.0;  // mm
    let t_plate: f64 = 5.0;    // mm (b/t = 40)
    let a_gross: f64 = b_plate * t_plate;
    let a_eff: f64 = rho_2 * b_plate * t_plate;
    let capacity_reduction: f64 = a_eff / a_gross;
    crate::common::assert_close(capacity_reduction, rho_2, 0.001, "Area reduction = rho");
}
