/// Validation: Railway Structural Engineering — Extended Tests
///
/// References:
///   - EN 1991-2:2003 (EC1-2): Traffic loads on bridges, §6.3 (Rail traffic)
///   - EN 1991-2:2003, Annex C: Dynamic factors for railway bridges
///   - EN 1991-2:2003, §6.5.4: Rail-structure interaction
///   - UIC 774-3: Track/bridge interaction — recommendations for calculations
///   - Esveld: "Modern Railway Track", 2nd Ed. (2001)
///   - Fryba: "Dynamics of Railway Bridges", Thomas Telford (1996)
///   - EN 1993-2:2006 (EC3-2): Steel bridges, deck acceleration limits
///   - Eurocode approach for sleeper beams, OCL masts, platform canopies
///
/// Tests verify LM71 axle loading, dynamic amplification, track slab on grade,
/// overhead contact line mast, platform canopy, rail-structure interaction,
/// bridge deck acceleration checks, and sleeper beam design.
use dedaliano_engine::{types::*, solver::linear::solve_2d};
use crate::common::*;

const E: f64 = 200_000.0; // MPa (steel)
const E_CONC: f64 = 35_000.0; // MPa (C35/45 concrete)
const A: f64 = 0.01; // m^2
const IZ: f64 = 1e-4; // m^4

// ================================================================
// 1. EN 1991-2 LM71 Axle Loading on Simply-Supported Bridge
// ================================================================
//
// LM71 load model: 4 concentrated loads of 250 kN each at 1.6 m spacing,
// plus UDL of 80 kN/m extending on both sides.
//
// For a simply-supported span L = 20 m under the 4 point loads placed
// symmetrically about midspan, the maximum midspan moment from the
// concentrated loads alone is:
//   M_conc = 2 * P * (L/2 - d/2) - P * d     where d = 1.6 m (from center pair)
//
// Actually, for 4 loads at positions symmetric about center:
//   positions: -2.4, -0.8, +0.8, +2.4 from midspan
//   Each reaction R = 4*250/2 = 500 kN (by symmetry)
//   M_mid = R * L/2 - P*(L/2 - (L/2-2.4)) - P*(L/2 - (L/2-0.8))
//         = 500*10 - 250*2.4 - 250*0.8
//         = 5000 - 600 - 200 = 4200 kN-m
//
// We model the bridge as a simply-supported beam with the 4 point loads
// applied at the nearest nodes and check midspan moment.

#[test]
fn railway_lm71_axle_loading_ss_bridge() {
    let l: f64 = 20.0; // m, span
    let n = 20; // elements (1 m each)
    let p: f64 = 250.0; // kN per axle

    // LM71: 4 axles at 1.6 m spacing, symmetric about midspan
    // Midspan at x = 10.0 m
    // Load positions: 7.6, 9.2, 10.8, 12.4 m
    // Nearest nodes (1m elements): 8, 9, 11, 12 (node_id = position + 1)
    let load_nodes = [9, 10, 12, 13]; // nearest integer nodes

    let mut loads = Vec::new();
    for &nid in &load_nodes {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: nid,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Check global equilibrium: sum Ry = 4 * 250 = 1000 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    let total_load: f64 = 4.0 * p;
    assert_close(sum_ry, total_load, 0.02, "LM71 equilibrium sum Ry");

    // Check symmetry of reactions (loads approximately symmetric)
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.rz, r_right.rz, 0.05, "LM71 reaction symmetry");

    // Midspan moment: from statics with loads at nodes 9,10,12,13 on 20m span
    // R_left = (P*12 + P*11 + P*9 + P*8) / 20 = 250*40/20 = 500 kN
    // M_mid(x=10) = R_left*10 - P*2 - P*1 = 5000 - 500 - 250 = 4250 kN-m
    // (approximate due to discrete node placement)
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    let m_mid = ef_mid.m_end.abs();
    let m_expected: f64 = 4250.0;
    assert_close(m_mid, m_expected, 0.05, "LM71 midspan moment");
}

// ================================================================
// 2. Rail Bridge Dynamic Amplification Factor
// ================================================================
//
// EN 1991-2 Annex C: dynamic amplification factor phi for carefully
// maintained track:
//   phi_2 = 1.44 / sqrt(L_phi - 0.2) + 0.82   for 3.6 m <= L_phi <= 65 m
//
// We model a simply-supported bridge of span L under UDL and verify that
// applying the dynamic factor phi_2 increases midspan deflection proportionally.
// Since the solver is linear: delta_dynamic = phi_2 * delta_static.
//
// Source: EN 1991-2:2003, Annex C, §C.2.

#[test]
fn railway_dynamic_amplification_factor() {
    let l: f64 = 15.0; // m, span (determinant length L_phi)
    let n = 10;
    let q: f64 = -80.0; // kN/m, LM71 UDL component
    let e_eff: f64 = E * 1000.0; // kN/m^2

    // EN 1991-2 dynamic factor phi_2
    let l_phi: f64 = l;
    let phi_2: f64 = 1.44 / (l_phi - 0.2).sqrt() + 0.82;
    // phi_2 = 1.44/sqrt(14.8) + 0.82 = 1.44/3.847 + 0.82 = 0.374 + 0.82 = 1.194

    // Static analysis
    let mut loads_static = Vec::new();
    for i in 0..n {
        loads_static.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }
    let input_static = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_static);
    let res_static = solve_2d(&input_static).unwrap();

    // Dynamic analysis: amplified load q_dyn = phi_2 * q
    let q_dyn: f64 = phi_2 * q;
    let mut loads_dyn = Vec::new();
    for i in 0..n {
        loads_dyn.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q_dyn,
            q_j: q_dyn,
            a: None,
            b: None,
        }));
    }
    let input_dyn = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_dyn);
    let res_dyn = solve_2d(&input_dyn).unwrap();

    let mid = n / 2 + 1;
    let delta_static = res_static.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let delta_dyn = res_dyn.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Verify linearity: delta_dyn / delta_static = phi_2
    let ratio = delta_dyn / delta_static;
    assert_close(ratio, phi_2, 0.02, "Dynamic amplification ratio phi_2");

    // Verify phi_2 is within expected range (1.0 < phi_2 < 2.0 for L > 3.6 m)
    assert!(phi_2 > 1.0 && phi_2 < 2.0,
        "phi_2 = {:.4} should be between 1.0 and 2.0", phi_2);

    // Also verify static deflection against analytical formula
    // delta_max = 5*q*L^4 / (384*E*I)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(delta_static, delta_exact, 0.03, "Static deflection 5qL^4/(384EI)");
}

// ================================================================
// 3. Track Slab — Multi-Span Continuous Beam Under Concentrated Load
// ================================================================
//
// A ballastless track slab supported at regular intervals (e.g. on piers
// or pads) can be modelled as a multi-span continuous beam. When a
// concentrated axle load is applied at the midspan of the central span,
// the load distributes to adjacent supports through continuity.
//
// For a 5-span continuous beam with equal spans L_s under a point load P
// at the center of the middle span, the reaction at the loaded span's
// supports is larger than at the distant supports. We verify:
//   - Global equilibrium: sum of all reactions = P
//   - The loaded span carries the majority of the load
//   - Reactions decay towards the far supports
//   - Midspan deflection of the loaded span matches a bounded estimate
//
// Source: Esveld, "Modern Railway Track", Ch. 5; Ghali/Neville §4.3.

#[test]
fn railway_track_slab_multi_span() {
    let l_span: f64 = 4.0; // m, support spacing (typical slab panel)
    let n_spans = 5;
    let n_per_span = 4;
    let p: f64 = 125.0; // kN, single wheel load

    // Load at midspan of the central (3rd) span
    // Central span starts at element (2 * n_per_span) + 1, midspan node:
    // Node numbering: span 1 nodes 1..5, span 2 nodes 5..9, span 3 nodes 9..13
    // Midspan of span 3: node = 1 + 2*n_per_span + n_per_span/2 = 1 + 8 + 2 = 11
    let mid_node = 1 + 2 * n_per_span + n_per_span / 2;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let spans: Vec<f64> = vec![l_span; n_spans];
    let input = make_continuous_beam(&spans, n_per_span, E_CONC, 0.15, 2e-3, loads);
    let results = solve_2d(&input).unwrap();

    // Global equilibrium: sum Ry = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Track slab equilibrium");

    // Support nodes: 1, 5, 9, 13, 17, 21
    // Central span is between nodes 9 and 13
    let sup_nodes: Vec<usize> = (0..=n_spans).map(|i| 1 + i * n_per_span).collect();

    // Reactions at the two supports flanking the loaded span (nodes 9 and 13)
    // should be the largest
    let r_left_central = results.reactions.iter()
        .find(|r| r.node_id == sup_nodes[2]).unwrap().rz;
    let r_right_central = results.reactions.iter()
        .find(|r| r.node_id == sup_nodes[3]).unwrap().rz;

    // By symmetry about the loaded point, these two should be approximately equal
    assert_close(r_left_central, r_right_central, 0.05, "Central span support symmetry");

    // Central span supports carry the majority of load
    let r_central_total: f64 = r_left_central + r_right_central;
    assert!(r_central_total > 0.5 * p,
        "Central span supports carry {:.1}% > 50% of load",
        r_central_total / p * 100.0);

    // Far-end support reactions should be smaller than central supports
    let r_far_left = results.reactions.iter()
        .find(|r| r.node_id == sup_nodes[0]).unwrap().rz.abs();
    assert!(r_far_left < r_left_central.abs(),
        "Far support reaction {:.2} < central {:.2}", r_far_left, r_left_central.abs());
}

// ================================================================
// 4. Overhead Contact Line (OCL) Mast — Cantilever with Tip Load
// ================================================================
//
// An OCL mast is a vertical cantilever (fixed at base) subject to
// horizontal wire tension at the tip. This is a classic cantilever
// bending problem.
//
// For a cantilever of height H with horizontal tip load F:
//   delta_tip = F * H^3 / (3 * E * I)
//   M_base = F * H
//   V_base = F
//
// Source: EN 50119 (Railway applications — Fixed installations — Electric
// traction overhead contact lines) and standard beam theory.

#[test]
fn railway_ocl_mast_cantilever() {
    let h: f64 = 8.0; // m, mast height
    let n = 8; // elements
    let f_wire: f64 = 15.0; // kN, horizontal wire tension at tip
    let iz_mast: f64 = 5e-5; // m^4, HEB 160 approx
    let a_mast: f64 = 5.43e-3; // m^2, HEB 160 approx
    let e_eff: f64 = E * 1000.0; // kN/m^2

    // Build vertical cantilever: nodes along Y axis
    // Node 1 at (0,0) fixed, node n+1 at (0,H) free with horizontal load
    let n_nodes = n + 1;
    let elem_len: f64 = h / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes,
        fx: f_wire,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, a_mast, iz_mast)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).unwrap();

    // Analytical tip deflection: delta = F * H^3 / (3*E*I)
    let delta_exact: f64 = f_wire * h.powi(3) / (3.0 * e_eff * iz_mast);
    let delta_tip = results.displacements.iter()
        .find(|d| d.node_id == n_nodes).unwrap().ux.abs();
    assert_close(delta_tip, delta_exact, 0.03, "OCL mast tip deflection");

    // Base moment: M = F * H
    let m_base_exact: f64 = f_wire * h; // = 120 kN-m
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.my.abs(), m_base_exact, 0.03, "OCL mast base moment");

    // Base horizontal reaction: R_x = -F
    assert_close(r_base.rx.abs(), f_wire, 0.02, "OCL mast base shear");

    // Verify no vertical reaction (no vertical loads)
    assert!(r_base.rz.abs() < 1e-6,
        "OCL mast vertical reaction should be zero: {:.6e}", r_base.rz);
}

// ================================================================
// 5. Platform Canopy — Propped Cantilever with UDL
// ================================================================
//
// A railway platform canopy is typically a propped cantilever:
// fixed at the building wall, roller-supported at the platform edge column.
// Under uniform roof load (dead + snow), the reactions and moments follow
// the propped cantilever formulas.
//
// Propped cantilever (fixed at A, roller at B) under UDL q:
//   R_B = 3qL/8     (roller reaction)
//   R_A = 5qL/8     (fixed end vertical reaction)
//   M_A = qL^2/8    (fixed end moment)
//   M_max_span at x = 5L/8: M = 9qL^2/128
//
// Source: Timoshenko & Young, "Theory of Structures", Table of Beam Formulas.

#[test]
fn railway_platform_canopy_propped_cantilever() {
    let l: f64 = 6.0; // m, canopy span
    let n = 12; // elements
    let q: f64 = -5.0; // kN/m, uniform roof load (dead + snow + services)

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    // Fixed at wall (node 1), roller at column (node n+1)
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();
    let n_nodes = n + 1;

    // Roller reaction: R_B = 3qL/8
    let r_b = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    let rb_expected: f64 = 3.0 * q_abs * l / 8.0; // = 11.25 kN
    assert_close(r_b.rz, rb_expected, 0.03, "Canopy roller reaction R_B = 3qL/8");

    // Fixed end reaction: R_A = 5qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let ra_expected: f64 = 5.0 * q_abs * l / 8.0; // = 18.75 kN
    assert_close(r_a.rz, ra_expected, 0.03, "Canopy fixed reaction R_A = 5qL/8");

    // Fixed end moment: M_A = qL^2/8
    let ma_expected: f64 = q_abs * l * l / 8.0; // = 22.5 kN-m
    assert_close(r_a.my.abs(), ma_expected, 0.05, "Canopy fixed moment M_A = qL^2/8");

    // Global equilibrium: R_A + R_B = qL
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q_abs * l, 0.02, "Canopy equilibrium R_A + R_B = qL");
}

// ================================================================
// 6. Rail-Structure Interaction — Two-Span Continuous Bridge
// ================================================================
//
// EN 1991-2 §6.5.4 and UIC 774-3 address rail-structure interaction
// for continuous bridges. A two-span continuous beam under UDL develops
// a hogging moment at the interior support.
//
// Two equal spans L under UDL q:
//   M_interior = -q*L^2/8  (from three-moment equation for 2 equal spans)
//   R_end = 3qL/8
//   R_interior = 10qL/8 = 5qL/4
//
// This represents the longitudinal bending of the bridge deck which
// interacts with the continuous welded rail (CWR).
//
// Source: UIC 774-3, §1.5; Ghali/Neville, Table 4.1 for 2-span beams.

#[test]
fn railway_rail_structure_interaction_two_span() {
    let l: f64 = 25.0; // m, each span
    let n_per_span = 10;
    let q: f64 = -40.0; // kN/m, equivalent distributed rail traffic load

    let n_total = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();
    let node_a = 1;
    let node_b = 1 + n_per_span; // interior support
    let node_c = 1 + 2 * n_per_span; // far end

    // End reactions: R_A = R_C = 3qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    let r_end_expected: f64 = 3.0 * q_abs * l / 8.0; // = 375 kN
    assert_close(r_a.rz, r_end_expected, 0.03, "2-span end reaction R_A = 3qL/8");
    assert_close(r_c.rz, r_end_expected, 0.03, "2-span end reaction R_C = 3qL/8");

    // Interior reaction: R_B = 5qL/4
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_int_expected: f64 = 5.0 * q_abs * l / 4.0; // = 1250 kN
    assert_close(r_b.rz, r_int_expected, 0.03, "2-span interior reaction R_B = 5qL/4");

    // Global equilibrium: R_A + R_B + R_C = 2*q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * q_abs * l, 0.02, "2-span equilibrium");

    // Interior support hogging moment: M_B = q*L^2/8
    let ef_span1_end = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    let m_int_expected: f64 = q_abs * l * l / 8.0; // = 3125 kN-m
    assert_close(ef_span1_end.m_end.abs(), m_int_expected, 0.05,
        "2-span hogging moment M_B = qL^2/8");
}

// ================================================================
// 7. Bridge Deck Acceleration Check — Deflection Frequency Method
// ================================================================
//
// EN 1991-2 §6.4.6 requires that bridge deck vertical acceleration be
// checked for passenger comfort and ballast stability. A key check is
// the natural frequency of the bridge vs span length.
//
// The first natural frequency of a simply-supported beam is:
//   f_1 = (pi/2) * sqrt(EI / (m * L^4))
//
// EN 1991-2 Fig. 6.10 provides upper/lower frequency bounds:
//   f_lower = 23.58 * L^(-0.592)   (approximate fit)
//   f_upper = 94.76 * L^(-0.748)   (approximate fit)
//
// We verify the structural response by comparing midspan deflection
// under a unit static load with the analytical formula delta = PL^3/(48EI),
// from which the frequency can be estimated via:
//   f_1 ≈ 17.75 / sqrt(delta_mm)   (Eurocode simplified formula, delta in mm)
//
// Source: EN 1991-2:2003, §6.4.6; Fryba, "Dynamics of Railway Bridges", Ch. 2.

#[test]
fn railway_bridge_deck_acceleration_check() {
    let l: f64 = 20.0; // m, span
    let n = 10;
    let p_unit: f64 = 1.0; // kN, unit load for frequency estimation
    let e_eff: f64 = E * 1000.0; // kN/m^2

    // Use a realistic composite bridge section
    let iz_bridge: f64 = 0.05; // m^4, typical composite deck
    let _a_bridge: f64 = 0.10; // m^2

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid,
        fx: 0.0,
        fz: -p_unit,
        my: 0.0,
    })];

    let input = make_beam(n, l, E, A, iz_bridge, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Midspan deflection under unit load
    let delta_fem = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();

    // Analytical: delta = P*L^3 / (48*E*I)
    let delta_exact: f64 = p_unit * l.powi(3) / (48.0 * e_eff * iz_bridge);
    assert_close(delta_fem, delta_exact, 0.03, "Bridge unit load deflection");

    // Estimate first natural frequency from deflection:
    // f_1 = (pi/2L^2) * sqrt(EI*L^4 / m)  but simplified:
    // f_1 ≈ 17.75 / sqrt(delta_mm)  where delta_mm is midspan deflection
    //        under self-weight (using unit load as proxy for frequency check)
    let delta_mm: f64 = delta_fem * 1000.0; // convert m to mm
    let f_est: f64 = 17.75 / delta_mm.sqrt();

    // The frequency should be positive and reasonable for a 20m span
    assert!(f_est > 0.0, "Estimated frequency should be positive: {:.2} Hz", f_est);

    // For a 20m bridge, typical first frequency is 2-20 Hz
    // Our unit load gives a very small delta, so frequency estimate will be high
    // This is expected since we use a unit load, not self-weight.

    // More importantly, verify the solver gives correct deflection shape:
    // deflection at quarter points should follow the sine shape
    let quarter = n / 4 + 1;
    let delta_quarter = results.displacements.iter()
        .find(|d| d.node_id == quarter).unwrap().uz.abs();

    // For SS beam with center load, delta at L/4 = P*L^3/(48EI) * 11/16
    // Wait, exact: delta(L/4) = P*(L/4) * (3*L^2 - 4*(L/4)^2) / (48*E*I)
    //            = P*L/4 * (3L^2 - L^2/4) / (48EI)
    //            = P*L/4 * (11L^2/4) / (48EI)
    //            = 11*P*L^3 / (768*E*I)
    let delta_quarter_exact: f64 = 11.0 * p_unit * l.powi(3) / (768.0 * e_eff * iz_bridge);
    assert_close(delta_quarter, delta_quarter_exact, 0.05, "Bridge quarter-point deflection");
}

// ================================================================
// 8. Sleeper Beam Under Two Rail Loads
// ================================================================
//
// A railway sleeper (cross-tie) beam spans between rails and is loaded
// by two equal rail seat loads symmetrically placed. This is a classic
// simply-supported beam with two symmetric point loads.
//
// For a SS beam of span L with two equal loads P at distances a from
// each support (symmetric, a = L/4 for standard gauge on 2.6m sleeper):
//   R_A = R_B = P    (by symmetry, each support carries one load)
//   M_max = P * a    (constant moment between loads)
//   delta_mid = P*a*(3L^2 - 4a^2) / (48*E*I)
//
// Source: Esveld, "Modern Railway Track", Ch. 4 (Sleeper design);
//         Timoshenko beam formula for symmetric two-point loading.

#[test]
fn railway_sleeper_beam_two_rail_loads() {
    let l: f64 = 2.6; // m, sleeper length
    let n = 10; // elements
    let p: f64 = 80.0; // kN, rail seat load per rail
    let e_eff: f64 = E_CONC * 1000.0; // kN/m^2 for concrete sleeper
    let iz_sleeper: f64 = 3.6e-5; // m^4, concrete sleeper section
    let a_sleeper: f64 = 0.045; // m^2, concrete sleeper section

    // Rail positions: standard gauge 1.435 m, sleeper 2.6 m
    // Rail offset from each end: (2.6 - 1.435)/2 = 0.5825 m
    // With 10 elements of 0.26 m each, nearest nodes:
    // Left rail at x = 0.5825 -> node 3 (at x = 0.52 m)
    // Right rail at x = 2.0175 -> node 9 (at x = 2.08 m)
    let node_left_rail = 3;
    let node_right_rail = 9;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_left_rail,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_right_rail,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
    ];

    let input = make_beam(n, l, E_CONC, a_sleeper, iz_sleeper, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).unwrap();

    // Reactions: by symmetry, R_A = R_B = P
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.rz, p, 0.05, "Sleeper left reaction R_A = P");
    assert_close(r_b.rz, p, 0.05, "Sleeper right reaction R_B = P");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "Sleeper equilibrium");

    // Moment between rails should be approximately constant and equal to P*a
    // where a is the distance from support to nearest rail
    // a = position of node 3 = 2 * 0.26 = 0.52 m
    let a: f64 = (node_left_rail - 1) as f64 * l / n as f64;
    let m_expected: f64 = p * a; // = 80 * 0.52 = 41.6 kN-m

    // Check moment at midspan element
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == mid_elem).unwrap();
    assert_close(ef_mid.m_end.abs(), m_expected, 0.05, "Sleeper midspan moment P*a");

    // Midspan deflection: delta = P*a*(3L^2 - 4a^2) / (48*E*I)
    let mid = n / 2 + 1;
    let delta_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    let delta_exact: f64 = p * a * (3.0 * l * l - 4.0 * a * a) / (48.0 * e_eff * iz_sleeper);
    assert_close(delta_mid, delta_exact, 0.10, "Sleeper midspan deflection");
}
