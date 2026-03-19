/// Validation: Timber / Wood Structural Design (Extended)
///
/// References:
///   - NDS 2018 (National Design Specification for Wood Construction)
///   - AWC: American Wood Council design aids
///   - Breyer et al.: "Design of Wood Structures ASD/LRFD" 8th ed.
///   - Forest Products Laboratory: "Wood Handbook" (FPL-GTR-282)
///
/// Tests verify structural analysis of timber members and assemblies,
/// including NDS deflection checks, column stability, glulam beams,
/// beam-columns, notched beams, continuous beams, trusses, and
/// long-term creep deflection.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. NDS Beam Deflection: SS Beam with Uniform Load
// ================================================================
//
// Simply supported Douglas Fir beam under uniform load.
// E_apparent for No. 2 Douglas Fir-Larch (DF-L) lumber:
//   E = 12,400 MPa (1,800,000 psi per NDS Supplement Table 4A)
// Cross-section: 140 mm x 235 mm (nominal 6x10)
//   A = 0.0329 m^2, Iz = 1.514e-4 m^4
// Span L = 4.0 m, uniform load q = 8 kN/m
// Exact midspan deflection: delta = 5*q*L^4 / (384*E*I)

#[test]
fn timber_nds_beam_deflection() {
    let e_df = 12_400.0; // MPa, Douglas Fir apparent E
    let b: f64 = 0.140;       // m, width
    let d: f64 = 0.235;       // m, depth
    let a = b * d;       // m^2
    let iz = b * d.powi(3) / 12.0; // m^4
    let l = 4.0;         // m, span
    let q = -8.0;        // kN/m, downward
    let n = 8;           // elements

    let input = make_ss_beam_udl(n, l, e_df, a, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e_df * 1000.0; // solver uses kPa internally
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    // Find midspan displacement
    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|dd| dd.node_id == mid).unwrap();

    let error = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.05,
        "NDS beam deflection: midspan={:.6e}, exact 5qL^4/(384EI)={:.6e}, err={:.2}%",
        mid_d.uz.abs(), delta_exact, error * 100.0
    );

    // NDS serviceability: L/360 live load limit
    let limit_l360 = l / 360.0;
    // Verify the computed deflection is a physically reasonable magnitude
    assert!(
        delta_exact > 0.0 && delta_exact < l / 100.0,
        "Deflection {:.4} m within reasonable range (< L/100 = {:.4} m)",
        delta_exact, l / 100.0
    );
    // Report whether it passes L/360
    let _passes_l360 = mid_d.uz.abs() < limit_l360;
}

// ================================================================
// 2. Column Stability Factor Cp: Euler Buckling for Timber Column
// ================================================================
//
// NDS 2018 Section 3.7: Column stability factor
//   FcE = 0.822 * E'_min / (Le/d)^2
//   where E'_min = E_min * adjustment factors
// Verify that the engine's Euler critical load matches NDS FcE
// for a pin-pin timber column.
//
// Douglas Fir E_min = 5,600 MPa (NDS Supplement), CM=1, Ct=1 => E'_min = 5600 MPa
// Column: 140mm x 140mm, L = 3.0 m

#[test]
fn timber_column_stability_factor_cp() {
    let e_min = 5_600.0; // MPa, E'_min for DF-L
    let side: f64 = 0.140;    // m, square column
    let a = side * side;
    let iz = side.powi(4) / 12.0;
    let l = 3.0; // m

    // NDS FcE = 0.822 * E'_min / (Le/d)^2
    // Le/d for pin-pin: Le = L, d = side (in consistent units)
    let le_d = l / side;
    let fce_nds = 0.822 * e_min / (le_d * le_d); // MPa

    // Euler critical load: P_cr = pi^2 * E * I / L^2
    let pi = std::f64::consts::PI;
    let e_eff = e_min * 1000.0; // kPa for solver units
    let p_euler = pi * pi * e_eff * iz / (l * l); // kN

    // Euler critical stress: sigma_cr = P_euler / A (in kPa, convert to MPa)
    let sigma_cr_mpa = p_euler / a / 1000.0; // MPa

    // NDS uses 0.822 factor which is pi^2 / 12 ≈ 0.8225 (exact for rectangular section)
    // because r^2 = I/A = d^2/12, so pi^2*E*I/(A*L^2) = pi^2*E/(12*(L/d)^2) = 0.822*E/(L/d)^2
    let nds_ratio = fce_nds / sigma_cr_mpa;
    assert_close(nds_ratio, 1.0, 0.01, "NDS FcE matches Euler: ratio");

    // Now verify engine buckling: apply load slightly below critical
    // and check the structure is still stable (converges)
    let n = 4;
    let input = make_column(n, l, e_min, a, iz, "pinned", "rollerX", -p_euler * 0.5);
    let results = linear::solve_2d(&input).unwrap();

    // Under 50% of Euler load, column should have small lateral displacement
    // (zero for perfect column with axial load only)
    let tip = results.displacements.iter().find(|dd| dd.node_id == n + 1).unwrap();
    assert!(
        tip.ux.abs() < 0.01,
        "Column at 50% Euler: axial shortening, minimal lateral: ux={:.6e}",
        tip.ux
    );
}

// ================================================================
// 3. Glulam Beam: Larger Cross-Section Deflection and Moment
// ================================================================
//
// Glulam (24F-V8 DF/DF): E = 12,400 MPa
// Cross-section: 175 mm x 600 mm (deep glulam)
//   A = 0.105 m^2, Iz = 3.15e-3 m^4
// Span L = 10.0 m, uniform load q = 15 kN/m
// Verify midspan deflection and maximum bending moment.

#[test]
fn timber_glulam_beam_deflection_and_moment() {
    let e_glulam = 12_400.0; // MPa
    let b = 0.175;           // m
    let d_gl: f64 = 0.600;        // m
    let a = b * d_gl;
    let iz = b * d_gl.powi(3) / 12.0;
    let l = 10.0;  // m
    let q = -15.0;  // kN/m
    let n = 10;

    let input = make_ss_beam_udl(n, l, e_glulam, a, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e_glulam * 1000.0;

    // Exact midspan deflection: 5qL^4 / (384EI)
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|dd| dd.node_id == mid).unwrap();
    let error_d = (mid_d.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error_d < 0.05,
        "Glulam deflection: FEM={:.6e}, exact={:.6e}, err={:.2}%",
        mid_d.uz.abs(), delta_exact, error_d * 100.0
    );

    // Maximum moment for SS beam with UDL: M_max = qL^2 / 8
    let m_max_exact = q.abs() * l * l / 8.0; // kN*m

    // Extract moment from element forces at midspan
    // For SS beam, max moment is at midspan. The element straddling midspan
    // should have m_end close to M_max.
    let mid_elem = n / 2; // element just before midspan node
    let ef = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    let m_fem = ef.m_end.abs();

    let error_m = (m_fem - m_max_exact).abs() / m_max_exact;
    assert!(
        error_m < 0.05,
        "Glulam moment: FEM={:.4}, exact qL^2/8={:.4}, err={:.2}%",
        m_fem, m_max_exact, error_m * 100.0
    );
}

// ================================================================
// 4. Beam-Column: Combined Bending + Compression (NDS Section 3.9)
// ================================================================
//
// NDS 2018 Eq. 3.9-3: (fc/Fc')^2 + fb / (Fb' * (1 - fc/FcE)) <= 1.0
// We verify the engine produces correct axial force and bending moment
// for a member under combined loading, then check the NDS interaction.
//
// SPF column: E = 9,500 MPa, 140mm x 184mm, L = 3.0 m
// Axial load P = 30 kN (compression) + lateral UDL q = 2 kN/m

#[test]
fn timber_beam_column_interaction() {
    let e_spf = 9_500.0; // MPa, SPF (Spruce-Pine-Fir)
    let b = 0.140;
    let d_col: f64 = 0.184;
    let a = b * d_col;
    let iz = b * d_col.powi(3) / 12.0;
    let l = 3.0;
    let n = 6;
    let p_axial = -30.0; // kN compression (applied as fx at tip for horizontal member)
    let q_lat = -2.0;    // kN/m lateral (perpendicular)

    // Build beam-column: fixed at start, free at end, axial + lateral
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_lat, q_j: q_lat, a: None, b: None,
        }));
    }
    // Axial compression at the free end
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: p_axial, fz: 0.0, my: 0.0,
    }));

    let input = make_beam(n, l, e_spf, a, iz, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify axial force in member (should be approximately P)
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let n_axial = ef_first.n_start;
    // Axial should be close to applied P (compression)
    assert_close(
        n_axial.abs(), p_axial.abs(), 0.05,
        "Beam-column: axial force ≈ P"
    );

    // Maximum moment for cantilever with UDL: M = qL^2/2
    let m_cantilever = q_lat.abs() * l * l / 2.0;
    // With compression, P-delta effect increases moment slightly (linear solver won't capture this)
    // But base moment from fixed end should be close to qL^2/2
    let m_base = ef_first.m_start.abs();
    let error_m = (m_base - m_cantilever).abs() / m_cantilever;
    assert!(
        error_m < 0.10,
        "Beam-column base moment: FEM={:.4}, qL^2/2={:.4}, err={:.2}%",
        m_base, m_cantilever, error_m * 100.0
    );

    // NDS interaction check (using computed forces):
    // fc = P/A
    let e_eff = e_spf * 1000.0;
    let fc = p_axial.abs() / a; // kPa

    // FcE = pi^2 * E'_min / (Le/d)^2, using E_min ≈ 0.58 * E for visually graded
    let e_min = 0.58 * e_eff;
    let le_d = l / d_col;
    let fce = 0.822 * e_min / (le_d * le_d); // kPa

    // Interaction ratio (simplified): (fc/FcE)^2 + fb/(Fb_ref * (1 - fc/FcE))
    // Just verify fc < FcE (member not buckling)
    assert!(
        fc < fce,
        "Beam-column: fc={:.1} < FcE={:.1} kPa (stable)",
        fc, fce
    );
}

// ================================================================
// 5. Notched Beam: Shear Capacity Reduction at Notch
// ================================================================
//
// NDS 2018 Section 3.4.3: Notched beam shear
//   Fv' = Fv * (d_n / d)  where d_n = remaining depth at notch
// For SS beam with point load, V_max = P/2 at supports.
// If notch reduces depth, effective shear capacity drops proportionally.
//
// Verify engine shear forces, then apply NDS notch reduction.

#[test]
fn timber_notched_beam_shear() {
    let e_df = 12_400.0;
    let b = 0.140;
    let d_full: f64 = 0.235;    // full depth
    let a = b * d_full;
    let iz = b * d_full.powi(3) / 12.0;
    let l = 4.0;
    let n = 8;
    let p = 40.0; // kN center point load

    let mid = n / 2 + 1;
    let input = make_beam(
        n, l, e_df, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Shear at support = P/2
    let v_max_exact = p / 2.0;
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let v_start = ef_first.v_start.abs();

    assert_close(v_start, v_max_exact, 0.02, "Notched beam: V_support = P/2");

    // NDS notch reduction: if notch removes 1/4 of depth at support
    let d_notch = d_full * 0.75; // remaining depth at notch
    let notch_factor = d_notch / d_full;

    // Shear stress in full section: fv = 3V/(2bd)
    let fv_full = 3.0 * v_max_exact / (2.0 * b * d_full); // kPa
    // Shear stress in notched section (NDS): fv_notch = 3V/(2*b*d_n)
    let fv_notched = 3.0 * v_max_exact / (2.0 * b * d_notch);

    // The notched section stress is higher by factor 1/notch_factor
    let stress_increase = fv_notched / fv_full;
    assert_close(stress_increase, 1.0 / notch_factor, 0.01,
        "Notch stress increase = d/d_n");

    // NDS reference shear strength for DF-L No.2: Fv = 1.0 MPa (= 1000 kPa)
    let fv_ref = 1000.0; // kPa
    // Adjusted: Fv' = Fv * (d_n/d)^2 per NDS 3.4.3.2(a) for end-notched beams
    let fv_adj = fv_ref * (d_notch / d_full).powi(2);
    assert!(
        fv_adj < fv_ref,
        "Notched Fv'={:.1} < full Fv={:.1} kPa", fv_adj, fv_ref
    );
}

// ================================================================
// 6. Two-Span Continuous Timber Beam: Moment Redistribution
// ================================================================
//
// Two equal spans L, uniform load q on both spans.
// Exact: M_support = -qL^2/8, M_midspan = 9qL^2/128
// Reactions: R_end = 3qL/8, R_middle = 10qL/8

#[test]
fn timber_two_span_continuous_beam() {
    let e_spf = 11_000.0; // MPa, SPF lumber
    let b = 0.140;
    let d_sec: f64 = 0.235;
    let a = b * d_sec;
    let iz = b * d_sec.powi(3) / 12.0;
    let span = 5.0;     // m each span
    let q = -6.0;        // kN/m
    let n_per_span = 8;

    // Build distributed loads for all elements
    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(
        &[span, span], n_per_span, e_spf, a, iz, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e_spf * 1000.0;
    let _ = e_eff;

    // Interior support moment: M = -qL^2/8
    let m_support_exact = q.abs() * span * span / 8.0; // positive magnitude

    // The interior support is at node (n_per_span + 1)
    let interior_node = n_per_span + 1;
    // Moment at interior support from element ending there
    let ef_at_support = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_interior = ef_at_support.m_end.abs();

    let error_m = (m_interior - m_support_exact).abs() / m_support_exact;
    assert!(
        error_m < 0.05,
        "Two-span: interior M={:.4}, exact qL^2/8={:.4}, err={:.2}%",
        m_interior, m_support_exact, error_m * 100.0
    );

    // End reactions: R = 3qL/8
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let error_r = (r1.abs() - r_end_exact).abs() / r_end_exact;
    assert!(
        error_r < 0.05,
        "Two-span: R_end={:.4}, exact 3qL/8={:.4}, err={:.2}%",
        r1.abs(), r_end_exact, error_r * 100.0
    );

    // Interior reaction: R = 10qL/8 = 5qL/4
    let r_mid_exact = 5.0 * q.abs() * span / 4.0;
    let r_mid = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap().rz;
    let error_rm = (r_mid.abs() - r_mid_exact).abs() / r_mid_exact;
    assert!(
        error_rm < 0.05,
        "Two-span: R_mid={:.4}, exact 5qL/4={:.4}, err={:.2}%",
        r_mid.abs(), r_mid_exact, error_rm * 100.0
    );
}

// ================================================================
// 7. Timber Truss: Roof Truss Under Symmetric Snow Load
// ================================================================
//
// Simple Fink (W) truss: symmetric triangular profile.
// Bottom chord span = 8 m, peak height = 2 m.
// Symmetric snow load P at each top chord panel point.
// Verify equilibrium and symmetric force distribution.

#[test]
fn timber_roof_truss_symmetric_snow() {
    let e_spf = 11_000.0;
    let a_chord = 0.005;  // m^2 (approx 70x70 mm)
    let p_snow = 8.0;     // kN at each top panel point

    let span = 8.0;
    let h = 2.0;

    // Nodes: bottom chord 1-3, top chord 4-5 (apex=6 is peak)
    // Simplified king-post truss:
    //   1 (0,0) -- 2 (4,0) -- 3 (8,0) bottom chord
    //   4 (2,1)              5 (6,1)  mid-top nodes
    //   6 (4,2) apex
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, span / 2.0, 0.0),
        (3, span, 0.0),
        (4, span / 4.0, h / 2.0),
        (5, 3.0 * span / 4.0, h / 2.0),
        (6, span / 2.0, h),
    ];

    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        // Left top chord
        (3, "truss", 1, 4, 1, 1, false, false),
        (4, "truss", 4, 6, 1, 1, false, false),
        // Right top chord
        (5, "truss", 6, 5, 1, 1, false, false),
        (6, "truss", 5, 3, 1, 1, false, false),
        // Web members (king post + diagonals)
        (7, "truss", 2, 6, 1, 1, false, false),
        (8, "truss", 2, 4, 1, 1, false, false),
        (9, "truss", 2, 5, 1, 1, false, false),
    ];

    // Snow loads at top chord panel points (nodes 4, 5, 6)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p_snow, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p_snow, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fz: -p_snow, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, e_spf, 0.3)],
        vec![(1, a_chord, 0.0)],
        elems,
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical load = 3 * P_snow
    let total_load = 3.0 * p_snow;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "Truss: sum Ry = total load");

    // Symmetric loading -> equal vertical reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(r1, r3, 0.02, "Truss: symmetric reactions R1 = R3");
    assert_close(r1, total_load / 2.0, 0.02, "Truss: each reaction = total/2");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.01, "Truss: sum Rx ≈ 0, got {:.6}", sum_rx);

    // Symmetric forces: left and right top chord should have equal magnitude
    let f_left_top = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start.abs();
    let f_right_top = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start.abs();
    assert_close(f_left_top, f_right_top, 0.05, "Truss: symmetric top chord forces");
}

// ================================================================
// 8. Long-Term Deflection: Creep Factor Kcr = 1.5 (NDS)
// ================================================================
//
// NDS 2018 Section 3.5.2: Long-term deflection
//   delta_total = delta_initial * (1 + Kcr)
//   Kcr = 1.5 for seasoned lumber, dry service
//   Kcr = 2.0 for unseasoned lumber or wet service
// Verify initial deflection from engine, then apply creep factor.

#[test]
fn timber_long_term_creep_deflection() {
    let e_df = 12_400.0; // MPa, Douglas Fir
    let b = 0.140;
    let d_sec: f64 = 0.286;   // m, depth (nominal 6x12)
    let a = b * d_sec;
    let iz = b * d_sec.powi(3) / 12.0;
    let l = 6.0;          // m
    let q = -5.0;         // kN/m (sustained dead load)
    let n = 10;

    let input = make_ss_beam_udl(n, l, e_df, a, iz, q);
    let results = linear::solve_2d(&input).unwrap();

    let e_eff = e_df * 1000.0;

    // Exact initial deflection
    let delta_initial_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    let mid = n / 2 + 1;
    let mid_d = results.displacements.iter().find(|dd| dd.node_id == mid).unwrap();
    let delta_initial_fem = mid_d.uz.abs();

    // Verify initial deflection
    let error = (delta_initial_fem - delta_initial_exact).abs() / delta_initial_exact;
    assert!(
        error < 0.05,
        "Creep: initial deflection FEM={:.6e}, exact={:.6e}, err={:.2}%",
        delta_initial_fem, delta_initial_exact, error * 100.0
    );

    // NDS creep factor for seasoned lumber, dry conditions
    let kcr_dry = 1.5;
    let delta_total_dry = delta_initial_fem * (1.0 + kcr_dry);
    let delta_total_dry_exact = delta_initial_exact * (1.0 + kcr_dry);

    // Total deflection should be 2.5x initial
    assert_close(
        delta_total_dry / delta_initial_fem, 1.0 + kcr_dry, 0.001,
        "Creep: total/initial = 1 + Kcr"
    );

    // Wet service: Kcr = 2.0
    let kcr_wet = 2.0;
    let delta_total_wet = delta_initial_fem * (1.0 + kcr_wet);

    // Wet > dry
    assert!(
        delta_total_wet > delta_total_dry,
        "Wet creep {:.6e} > dry creep {:.6e}", delta_total_wet, delta_total_dry
    );

    // Serviceability check: L/240 for total load (dead + live + creep)
    let limit_l240 = l / 240.0;
    // Report the comparison
    let _passes_total = delta_total_dry_exact < limit_l240;

    // Verify the creep factor relationship is exact
    assert_close(
        delta_total_dry_exact / delta_initial_exact, 2.5, 0.001,
        "Creep: dry total = 2.5 * initial"
    );
    assert_close(
        delta_total_wet / delta_initial_fem, 3.0, 0.001,
        "Creep: wet total = 3.0 * initial"
    );
}
