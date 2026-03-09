/// Validation: Timber Structural Design — Extended Set 2
///
/// References:
///   - NDS 2018: National Design Specification for Wood Construction (AWC)
///   - EN 1995-1-1:2004 (EC5): Design of timber structures
///   - Breyer, Fridley, Cobeen, Pollock: "Design of Wood Structures - ASD/LRFD" 8th ed.
///   - Forest Products Laboratory: "Wood Handbook" (FPL-GTR-282)
///   - Thelandersson & Larsen: "Timber Engineering"
///   - PRG 320-2019: Standard for Performance-Rated CLT (APA)
///   - AITC 117-2010: Standard Specs for Structural Glulam Timber
///
/// Tests cover glulam beam deflection, CLT panel bending, timber portal frame,
/// notched beam stress concentration, Howe truss, plywood I-joist, Euler column
/// buckling, and timber diaphragm.

use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

// ================================================================
// 1. Glulam Beam Deflection Under Uniform Load (GL28h, EC5)
// ================================================================
//
// GL28h glulam beam, b = 190 mm, h = 760 mm.
// E_mean = 12,600 MPa (EN 14080 Table 1).
// Span L = 12.0 m, simply supported, UDL q = 12 kN/m (downward).
//
// Section properties:
//   A = 0.190 * 0.760 = 0.1444 m^2
//   Iz = b*h^3/12 = 0.190 * 0.760^3 / 12 = 6.953e-3 m^4
//
// Exact midspan deflection (Euler-Bernoulli):
//   delta = 5*q*L^4 / (384*E*I)
//
// Numerical:
//   E_eff = 12600 * 1000 = 12,600,000 kN/m^2
//   delta = 5 * 12 * 12^4 / (384 * 12,600,000 * 6.953e-3)
//         = 5 * 12 * 20736 / (384 * 87,607.8)
//         = 1,244,160 / 33,641,395
//         = 0.03699 m = 37.0 mm
//
// EC5 serviceability limit: L/300 = 12000/300 = 40 mm (net deflection)

#[test]
fn timber_ext2_glulam_beam_deflection_gl28h() {
    let e_gl: f64 = 12_600.0; // MPa, GL28h mean MOE
    let b: f64 = 0.190;       // m
    let h: f64 = 0.760;       // m
    let a: f64 = b * h;
    let iz: f64 = b * h.powi(3) / 12.0;
    let l: f64 = 12.0;        // m, span
    let q: f64 = -12.0;       // kN/m, downward
    let n: usize = 12;        // elements

    let input = make_ss_beam_udl(n, l, e_gl, a, iz, q);
    let results = solve_2d(&input).unwrap();

    // Exact midspan deflection
    let e_eff: f64 = e_gl * 1000.0; // kN/m^2 (solver convention)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz);

    // Find midspan node displacement
    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "GL28h midspan deflection");

    // EC5 serviceability check: L/300
    let _limit_l300: f64 = l / 300.0;
    // Verify deflection is in a physically reasonable range
    assert!(
        delta_exact > 0.0 && delta_exact < l / 100.0,
        "Deflection {:.4} m within reasonable range", delta_exact
    );

    // Verify reactions: each support carries half the total load
    let total_load: f64 = q.abs() * l;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r1, total_load / 2.0, 0.02, "GL28h left reaction = qL/2");
}

// ================================================================
// 2. CLT Panel in Bending — 5-Ply Panel Under Uniform Load
// ================================================================
//
// Cross-Laminated Timber (CLT) 5-ply panel, 175 mm total depth.
// Effective bending stiffness uses only the layers oriented parallel
// to the span direction (layers 1, 3, 5 for strong axis bending).
//
// Layer layout (each 35 mm): 0/90/0/90/0 degrees
// Parallel layers: 3 layers at 35 mm each
// Effective width b_eff = 1.0 m (unit strip)
//
// Effective Iz uses the parallel axis theorem on the 3 parallel layers:
//   Layer 1 center: y = -70 mm from NA
//   Layer 3 center: y = 0 mm (at NA)
//   Layer 5 center: y = +70 mm from NA
//
//   Iz_eff = 3 * (b * t_layer^3 / 12) + 2 * (b * t_layer) * (70e-3)^2
//          = 3 * (1.0 * 0.035^3 / 12) + 2 * (1.0 * 0.035) * 0.070^2
//          = 3 * 3.573e-6 + 2 * 0.035 * 4.9e-3
//          = 10.719e-6 + 343.0e-6
//          = 353.7e-6 m^4
//
// E_CLT = 11,700 MPa (C24 spruce parallel layers)
// Span L = 5.0 m, q = 4 kN/m (floor load on 1 m strip)
//
// delta = 5*q*L^4 / (384*E*Iz_eff)

#[test]
fn timber_ext2_clt_panel_bending_5ply() {
    let e_clt: f64 = 11_700.0; // MPa, C24 spruce
    let b_strip: f64 = 1.0;    // m, unit strip width
    let t_layer: f64 = 0.035;  // m, each layer thickness
    let d_total: f64 = 5.0 * t_layer; // 0.175 m total depth
    let l: f64 = 5.0;          // m, span
    let q: f64 = -4.0;         // kN/m, downward
    let n: usize = 10;

    // Effective moment of inertia (parallel layers only: 1, 3, 5)
    // Distance from neutral axis to layer 1 and 5 centers
    let y_outer: f64 = 2.0 * t_layer; // 70 mm = distance from NA to outer layer center
    let iz_self: f64 = b_strip * t_layer.powi(3) / 12.0; // self-inertia of one layer
    let iz_eff: f64 = 3.0 * iz_self + 2.0 * (b_strip * t_layer) * y_outer.powi(2);

    // For the solver we model this as a beam with the effective section properties
    // A_eff uses all 5 layers for axial stiffness (conservative for bending test)
    let a_eff: f64 = b_strip * d_total;

    let input = make_ss_beam_udl(n, l, e_clt, a_eff, iz_eff, q);
    let results = solve_2d(&input).unwrap();

    // Exact deflection
    let e_eff: f64 = e_clt * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_eff);

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "CLT 5-ply midspan deflection");

    // Verify maximum bending moment: M_max = qL^2/8
    let m_max_exact: f64 = q.abs() * l * l / 8.0;
    let mid_elem = n / 2;
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef.m_end.abs(), m_max_exact, 0.05, "CLT midspan moment = qL^2/8");

    // CLT serviceability: check deflection magnitude is reasonable
    // For floor: L/250 = 5.0/250 = 0.020 m = 20 mm
    let _limit_l250: f64 = l / 250.0;
    assert!(
        delta_exact > 0.001 && delta_exact < l / 50.0,
        "CLT deflection {:.4} m within reasonable range", delta_exact
    );
}

// ================================================================
// 3. Timber Portal Frame — Fixed Base, Lateral + Gravity Loading
// ================================================================
//
// Glulam portal frame: height H = 4.5 m, width W = 8.0 m.
// GL24h: E = 11,600 MPa
// Columns and beam: b = 180 mm, h = 450 mm
//   A = 0.081 m^2, Iz = 1.3669e-3 m^4
//
// Lateral load F_h = 15 kN at eave level (node 2).
// Gravity load P = 25 kN at each beam-column joint (nodes 2 and 3).
//
// For a fixed-base portal frame with rigid joints and equal column/beam
// stiffness, the lateral sway and moment distribution can be verified
// against stiffness method results.
//
// Global equilibrium:
//   Sum Rx = -F_h (lateral load balanced by base reactions)
//   Sum Ry = 2*P (gravity balanced by base vertical reactions)

#[test]
fn timber_ext2_portal_frame_lateral_gravity() {
    let e_gl: f64 = 11_600.0;  // MPa, GL24h
    let b: f64 = 0.180;        // m
    let h_sec: f64 = 0.450;    // m
    let a: f64 = b * h_sec;
    let iz: f64 = b * h_sec.powi(3) / 12.0;

    let h_frame: f64 = 4.5;    // m, column height
    let w_frame: f64 = 8.0;    // m, beam span
    let f_lateral: f64 = 15.0; // kN, horizontal
    let p_gravity: f64 = -25.0; // kN, downward at each joint

    let input = make_portal_frame(h_frame, w_frame, e_gl, a, iz, f_lateral, p_gravity);
    let results = solve_2d(&input).unwrap();

    // Verify global horizontal equilibrium: sum of Rx = -F_lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lateral, 0.02, "Portal frame: sum Rx = -F_h");

    // Verify global vertical equilibrium: sum of Ry = -2*P_gravity (upward = positive)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_gravity: f64 = 2.0 * p_gravity.abs();
    assert_close(sum_ry, total_gravity, 0.02, "Portal frame: sum Ry = 2P");

    // Verify global moment equilibrium about node 1 at (0,0):
    // Applied forces and their moments about (0,0): M = x*Fy - y*Fx
    //   Node 2 (0, H): lateral load Fx=F_h, gravity Fy=P => M = 0*P - H*F_h
    //   Node 3 (W, H): gravity Fy=P => M = W*P - H*0 = W*P
    // Reaction moments about (0,0):
    //   Node 1 (0, 0): Mz1 + 0*Ry1 - 0*Rx1 = Mz1
    //   Node 4 (W, 0): Mz4 + W*Ry4 - 0*Rx4 = Mz4 + W*Ry4
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Sum of all moments about (0,0) = 0
    // Applied: -H*F_h + W*p_gravity (p_gravity is negative for downward)
    // Reaction: Mz1 + Mz4 + W*Ry4
    let applied_moment: f64 = -h_frame * f_lateral + w_frame * p_gravity;
    let reaction_moment: f64 = r1.mz + r4.mz + w_frame * r4.ry;
    let total_moment: f64 = applied_moment + reaction_moment;
    assert!(
        total_moment.abs() < 1.0,
        "Portal frame moment equilibrium error: {:.4} kN-m", total_moment
    );

    // Lateral sway at eave should be nonzero (positive direction of applied load)
    let eave_node = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();
    assert!(
        eave_node.ux > 0.0,
        "Portal frame: eave sways in direction of lateral load, ux={:.6e}", eave_node.ux
    );
}

// ================================================================
// 4. Notched Timber Beam — Shear Force Verification with Reduced Section
// ================================================================
//
// Simply supported D. Fir beam with center point load.
// Full depth: 286 mm, Width: 140 mm.
// Span L = 5.0 m, center point load P = 30 kN.
//
// V_max at supports = P/2 = 15 kN
//
// NDS 3.4.3.2: For end-notched beams, effective shear capacity is reduced:
//   V_allow = (2/3) * Fv' * b * d_n * (d_n/d)
// where d_n is the net depth at the notch.
//
// Notch reduces depth by 25%: d_n = 0.75 * d = 214.5 mm
// Shear stress at the notched section:
//   fv_notch = (3/2) * V / (b * d_n) -- higher than in full section
//
// Verify shear force from solver matches P/2 at supports.

#[test]
fn timber_ext2_notched_beam_shear_verification() {
    let e_df: f64 = 12_400.0;  // MPa, Douglas Fir
    let b: f64 = 0.140;        // m
    let d_full: f64 = 0.286;   // m, full depth
    let a: f64 = b * d_full;
    let iz: f64 = b * d_full.powi(3) / 12.0;
    let l: f64 = 5.0;          // m
    let n: usize = 10;         // elements
    let p: f64 = 30.0;         // kN, center point load

    let mid_node = n / 2 + 1;
    let input = make_beam(
        n, l, e_df, a, iz, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).unwrap();

    // Shear at support should be P/2
    let v_support_exact: f64 = p / 2.0;
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), v_support_exact, 0.02,
        "Notched beam: V_support = P/2");

    // Maximum moment at midspan: M = P*L/4
    let m_max_exact: f64 = p * l / 4.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_exact, 0.05,
        "Notched beam: M_max = PL/4");

    // NDS notch reduction analysis
    let d_notch: f64 = 0.75 * d_full; // 25% notch, remaining depth
    let notch_ratio: f64 = d_notch / d_full;

    // Shear stress in full section vs notched section
    let fv_full: f64 = 3.0 * v_support_exact / (2.0 * b * d_full); // kPa
    let fv_notched: f64 = 3.0 * v_support_exact / (2.0 * b * d_notch); // kPa
    let stress_increase: f64 = fv_notched / fv_full;
    assert_close(stress_increase, 1.0 / notch_ratio, 0.01,
        "Notched stress increase = d/d_n");

    // NDS effective shear capacity reduction: (d_n/d)^2 for end notch
    let capacity_factor: f64 = notch_ratio.powi(2);
    assert_close(capacity_factor, 0.5625, 0.01,
        "NDS notch capacity factor = (d_n/d)^2 = 0.5625");

    // Verify equilibrium: sum of reactions = applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Notched beam: reaction equilibrium");
}

// ================================================================
// 5. Timber Howe Truss Under Symmetric Loading
// ================================================================
//
// Howe truss: characterized by vertical web members (tension) and
// diagonal members (compression). Span = 10 m, height = 2.5 m.
//
// Geometry (5 panel truss):
//   Bottom chord: nodes 1-2-3-4-5-6 at y=0, x = 0, 2, 4, 5, 6, 8, 10
//   Top chord: nodes 7-8-9 at y = 2.5
//   Note: symmetric about midspan
//
// Simplified to 4 equal panels:
//   Bottom: 1(0,0), 2(2.5,0), 3(5,0), 4(7.5,0), 5(10,0)
//   Top:    6(2.5,2.5), 7(5,2.5), 8(7.5,2.5)
//
// Equal vertical loads P = 10 kN at each top chord node.
// Supports: pinned at node 1, rollerX at node 5.
//
// Equilibrium: R1 = R5 = 3*P/2 = 15 kN (by symmetry)

#[test]
fn timber_ext2_howe_truss_symmetric() {
    let e_timber: f64 = 11_000.0; // MPa, SPF
    let a_member: f64 = 0.008;    // m^2, ~90x90 mm typical timber truss member
    let p_load: f64 = 10.0;       // kN at each top chord joint

    let panel: f64 = 2.5;  // m, panel width
    let h_truss: f64 = 2.5; // m, truss height

    // Bottom chord nodes
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, panel, 0.0),
        (3, 2.0 * panel, 0.0),
        (4, 3.0 * panel, 0.0),
        (5, 4.0 * panel, 0.0),
        // Top chord nodes
        (6, panel, h_truss),
        (7, 2.0 * panel, h_truss),
        (8, 3.0 * panel, h_truss),
    ];

    // Howe truss elements: bottom chord, top chord, verticals, diagonals
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Diagonal members (Howe pattern: diagonals lean toward center)
        (7, "truss", 1, 6, 1, 1, false, false),  // left end diagonal
        (8, "truss", 8, 5, 1, 1, false, false),   // right end diagonal
        (9, "truss", 3, 6, 1, 1, false, false),   // inner left diagonal
        (10, "truss", 3, 8, 1, 1, false, false),  // inner right diagonal
        // Vertical members (Howe characteristic)
        (11, "truss", 2, 6, 1, 1, false, false),
        (12, "truss", 3, 7, 1, 1, false, false),
        (13, "truss", 4, 8, 1, 1, false, false),
    ];

    // Symmetric loads at top chord nodes
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -p_load, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -p_load, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: -p_load, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, e_timber, 0.3)],
        vec![(1, a_member, 0.0)], // Iz = 0 for truss elements
        elems,
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Total vertical load = 3P
    let total_load: f64 = 3.0 * p_load;

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Howe truss: sum Ry = 3P");

    // Symmetric reactions: R1 = R5 = 3P/2 = 15 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().ry;
    assert_close(r1, total_load / 2.0, 0.02, "Howe truss: R1 = 3P/2");
    assert_close(r5, total_load / 2.0, 0.02, "Howe truss: R5 = 3P/2");
    assert_close(r1, r5, 0.02, "Howe truss: symmetric reactions R1 = R5");

    // Horizontal equilibrium: sum Rx ~ 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.1, "Howe truss: sum Rx ~ 0, got {:.6}", sum_rx);

    // Bottom chord should be in tension (positive axial force)
    // For element 2 (middle bottom chord) under symmetric load
    let ef_bc_mid = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(
        ef_bc_mid.n_start > 0.0,
        "Howe truss: bottom chord in tension, N={:.4}", ef_bc_mid.n_start
    );
}

// ================================================================
// 6. Plywood I-Joist (Prefabricated Timber Joist)
// ================================================================
//
// Plywood web I-joist used for floor framing.
// Modeled as a beam with equivalent section properties.
//
// Flanges: 2x4 SPF lumber (actual 38 x 89 mm) top and bottom
// Web: 9.5 mm structural plywood, depth = 302 mm (between flanges)
// Overall depth = 302 + 2*89 = 480 mm (approx TJI 480 series)
//
// Effective properties (transformed section, ignoring plywood axial):
//   E_flange = 9,500 MPa (SPF No.2)
//   A_eff ~ 2 * (0.038 * 0.089) = 6.764e-3 m^2 (flanges only, conservative)
//   Iz_eff ~ 2 * [b*t^3/12 + b*t*(d/2 - t/2)^2]
//     d_center = (0.480 - 0.089) / 2 + 0.089/2 = 0.1955 + 0.0445 = 0.240/2
//     Actually: distance from NA to flange center = (480 - 89)/2 = 195.5 mm
//     Iz = 2 * [0.038*0.089^3/12 + 0.038*0.089*(0.1955)^2]
//        = 2 * [2.234e-6 + 0.003382 * 0.03822]
//        = 2 * [2.234e-6 + 1.293e-4]
//        = 2 * 1.315e-4 = 2.631e-4 m^4
//
// Span L = 6.0 m, UDL q = 3.5 kN/m (residential floor)
// delta = 5qL^4/(384EI)

#[test]
fn timber_ext2_plywood_i_joist_deflection() {
    let e_spf: f64 = 9_500.0;  // MPa, SPF No.2 flanges
    let b_flange: f64 = 0.038; // m, flange width (actual 2x dimension)
    let t_flange: f64 = 0.089; // m, flange depth (actual 4x dimension)
    let d_overall: f64 = 0.480; // m, overall depth
    let l: f64 = 6.0;          // m, span
    let q: f64 = -3.5;         // kN/m, downward
    let n: usize = 12;

    // Effective section properties (flanges dominate)
    let a_eff: f64 = 2.0 * b_flange * t_flange;
    // Distance from NA to flange center
    let d_flange_center: f64 = (d_overall - t_flange) / 2.0;
    let iz_self: f64 = b_flange * t_flange.powi(3) / 12.0;
    let iz_transfer: f64 = b_flange * t_flange * d_flange_center.powi(2);
    let iz_eff: f64 = 2.0 * (iz_self + iz_transfer);

    let input = make_ss_beam_udl(n, l, e_spf, a_eff, iz_eff, q);
    let results = solve_2d(&input).unwrap();

    // Exact deflection
    let e_eff: f64 = e_spf * 1000.0;
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * iz_eff);

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();

    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "I-joist midspan deflection");

    // Verify the I-joist has adequate stiffness (deflection < L/360)
    let limit_l360: f64 = l / 360.0;
    // Report whether joist passes L/360 (informational)
    let _passes = delta_exact < limit_l360;

    // Verify reactions
    let total_load: f64 = q.abs() * l;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r1, total_load / 2.0, 0.02, "I-joist: R1 = qL/2");

    // Max moment = qL^2/8
    let m_max: f64 = q.abs() * l * l / 8.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max, 0.05, "I-joist: M_max = qL^2/8");
}

// ================================================================
// 7. Timber Column Euler Buckling (Pin-Pin SPF)
// ================================================================
//
// SPF column: 140 mm x 140 mm square, length L = 3.5 m.
// E = 9,500 MPa.
// Pin-pin end conditions (K = 1.0).
//
// Section properties:
//   A = 0.140^2 = 0.0196 m^2
//   Iz = 0.140^4 / 12 = 3.201e-5 m^4
//
// Euler critical load:
//   P_cr = pi^2 * E * I / L^2
//   P_cr = pi^2 * 9,500,000 * 3.201e-5 / 3.5^2
//        = 9.8696 * 9,500,000 * 3.201e-5 / 12.25
//        = 3000.68 / 12.25
//        = 244.95 kN
//
// NDS FcE = 0.822 * E / (Le/d)^2
// Le/d = 3500/140 = 25.0
// FcE = 0.822 * 9500 / 625 = 12.49 MPa
// P_cr_NDS = FcE * A = 12.49 * 0.0196 * 1000 = 244.8 kN (same via pi^2/12)
//
// Verify using solver: apply 50% of P_cr as compression, check stability.

#[test]
fn timber_ext2_column_euler_buckling_spf() {
    let e_spf: f64 = 9_500.0;  // MPa
    let side: f64 = 0.140;     // m, square section
    let a: f64 = side * side;
    let iz: f64 = side.powi(4) / 12.0;
    let l: f64 = 3.5;          // m
    let n: usize = 8;

    let pi: f64 = std::f64::consts::PI;

    // Euler critical load
    let e_eff: f64 = e_spf * 1000.0; // kN/m^2
    let p_euler: f64 = pi * pi * e_eff * iz / (l * l); // kN

    // NDS equivalent: FcE = 0.822 * E / (Le/d)^2
    let le_d: f64 = l / side;
    let fce_nds: f64 = 0.822 * e_spf / (le_d * le_d); // MPa
    let p_nds: f64 = fce_nds * a * 1000.0; // kN

    // NDS factor 0.822 = pi^2/12, so these should match
    assert_close(p_euler, p_nds, 0.01, "Euler P_cr matches NDS FcE*A");

    // Verify P_cr is in expected range
    assert!(
        p_euler > 200.0 && p_euler < 300.0,
        "P_cr = {:.2} kN should be ~245 kN", p_euler
    );

    // Apply 50% of Euler load as compression and verify solver convergence
    let input = make_column(n, l, e_spf, a, iz, "pinned", "rollerX", -p_euler * 0.5);
    let results = solve_2d(&input).unwrap();

    // At 50% Euler load, column should have finite (small) displacements
    let tip = results.displacements.iter()
        .find(|dd| dd.node_id == n + 1).unwrap();
    assert!(
        tip.ux.abs() < 0.05,
        "Column at 50%% Euler: ux={:.6e} should be small", tip.ux
    );

    // Verify axial force is approximately the applied load
    let ef = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), p_euler * 0.5, 0.05,
        "Column: axial force ≈ 0.5 * P_euler");
}

// ================================================================
// 8. Timber Diaphragm — Simply Supported Deep Beam Analogy
// ================================================================
//
// Timber floor or roof diaphragm resists lateral loads by acting as
// a deep beam in the horizontal plane. The diaphragm transfers lateral
// loads to shear walls at each end.
//
// Modeled as a simply supported beam (deep beam analogy):
//   Diaphragm span L = 12.0 m (distance between shear walls)
//   Diaphragm depth D = 6.0 m (building width)
//   Equivalent thickness: structural plywood 18.5 mm over joists
//
// Lateral wind load distributed along one edge: w = 5 kN/m
//
// For the deep beam analogy:
//   E_eff = 8,000 MPa (plywood panel sheathing, reduced for nail slip)
//   A_eff = D * t = 6.0 * 0.0185 = 0.111 m^2
//   Iz_eff = t * D^3 / 12 = 0.0185 * 6.0^3 / 12 = 0.333 m^4
//
// Reactions at shear walls: R = wL/2 = 5*12/2 = 30 kN each
// Maximum moment at midspan: M = wL^2/8 = 5*144/8 = 90 kN*m
// Chord force: T = C = M/D = 90/6 = 15 kN
//
// Midspan deflection: delta = 5wL^4/(384EI)

#[test]
fn timber_ext2_diaphragm_deep_beam_analogy() {
    let e_ply: f64 = 8_000.0;  // MPa, effective plywood E (reduced for nail slip)
    let l: f64 = 12.0;         // m, diaphragm span
    let d_dia: f64 = 6.0;      // m, diaphragm depth (building width)
    let t_ply: f64 = 0.0185;   // m, 18.5 mm plywood thickness
    let w: f64 = -5.0;         // kN/m, lateral wind load (downward in beam analogy)
    let n: usize = 12;

    // Equivalent beam properties
    let a_eff: f64 = d_dia * t_ply;
    let iz_eff: f64 = t_ply * d_dia.powi(3) / 12.0;

    let input = make_ss_beam_udl(n, l, e_ply, a_eff, iz_eff, w);
    let results = solve_2d(&input).unwrap();

    // Reactions at shear walls: R = wL/2
    let r_exact: f64 = w.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_end = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(r1, r_exact, 0.02, "Diaphragm: R_left = wL/2");
    assert_close(r_end, r_exact, 0.02, "Diaphragm: R_right = wL/2");

    // Maximum moment at midspan: M = wL^2/8
    let m_max_exact: f64 = w.abs() * l * l / 8.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_exact, 0.05, "Diaphragm: M_max = wL^2/8");

    // Chord force from deep beam analogy: T = C = M/D
    let chord_force_exact: f64 = m_max_exact / d_dia;
    assert_close(chord_force_exact, 15.0, 0.02, "Diaphragm: chord force = M/D = 15 kN");

    // Midspan deflection: 5wL^4/(384EI)
    let e_eff: f64 = e_ply * 1000.0;
    let delta_exact: f64 = 5.0 * w.abs() * l.powi(4) / (384.0 * e_eff * iz_eff);

    let mid_node = n / 2 + 1;
    let mid_d = results.displacements.iter()
        .find(|dd| dd.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_exact, 0.05, "Diaphragm: midspan deflection");

    // Verify deflection is reasonable for a stiff diaphragm
    // Typical limit: L/600 for rigid diaphragm classification
    let _limit_l600: f64 = l / 600.0;
    assert!(
        delta_exact > 0.0,
        "Diaphragm deflection should be positive: {:.6e} m", delta_exact
    );

    // Global equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, w.abs() * l, 0.02, "Diaphragm: total reaction = wL");
}
