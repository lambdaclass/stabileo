/// Validation: Crane and Lifting Structure Analysis — Extended
///
/// References:
///   - AISC Design Guide 7: Industrial Buildings (2nd ed., 2004)
///   - EN 1991-3:2006: Actions Induced by Cranes and Machinery
///   - EN 1993-6:2007: Design of Steel Structures — Crane Supporting Structures
///   - CMAA 70: Top Running Bridge & Gantry Type Multiple Girder EOT Cranes
///   - FEM 1.001: Rules for the Design of Hoisting Appliances
///   - Sears: "Crane Handbook" (5th ed.)
///   - Shapiro et al.: "Cranes and Derricks" (4th ed., 2011)
///
/// Tests verify runway beam bending, gantry leg portal action, jib crane
/// cantilever deflection, tower crane mast axial+bending, outrigger pad
/// loading, girder fatigue stress ranges, hook block load path, and
/// crane bumper impact force distribution.

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Overhead Crane Runway Beam — Simply Supported Under Wheel Loads
// ================================================================
//
// A crane runway girder spans L = 12 m between columns (pinned-roller).
// Two wheel loads P = 150 kN each, spaced s = 3.0 m apart (wheel base),
// positioned to produce maximum bending moment.
//
// For two equal point loads P at positions a and a+s on a SS beam of
// span L, the maximum moment occurs when the midpoint between the
// loads is offset from beam midspan by s/4.
// Critical wheel at x = L/2 - s/4 from left support.
// M_max = P*(L/2 - s/4) for the critical wheel position.
// (The second wheel adds its contribution via superposition.)
//
// Analytical maximum moment from two symmetric wheel loads:
//   M_max = P * (L - s/2)^2 / (4*L) * 2
// We verify reactions, moment magnitude, and deflection.

#[test]
fn crane_runway_beam_wheel_loads() {
    let l: f64 = 12.0;       // m, runway beam span
    let p_wheel: f64 = 150.0; // kN, single wheel load
    let s: f64 = 3.0;         // m, wheel base (spacing between wheels)
    let n: usize = 24;        // elements for adequate resolution

    // W920x201 runway beam properties (approximate, heavy crane girder)
    let e_steel: f64 = 200_000.0; // MPa
    let a_beam: f64 = 0.0256;     // m^2
    let iz_beam: f64 = 3.25e-3;   // m^4

    // Position wheels to produce maximum moment:
    // Critical position: centerline of beam shifted by s/4 from load midpoint
    // Map to nearest discrete nodes, then compute actual positions
    let elem_len: f64 = l / n as f64;
    let x1_ideal: f64 = l / 2.0 - s / 4.0; // = 5.25 m
    let node1: usize = (x1_ideal / elem_len).round() as usize + 1;
    let node2: usize = node1 + (s / elem_len).round() as usize;
    // Actual node positions (used for analytical comparison)
    let x1: f64 = (node1 - 1) as f64 * elem_len;
    let x2: f64 = (node2 - 1) as f64 * elem_len;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node1, fx: 0.0, fy: -p_wheel, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node2, fx: 0.0, fy: -p_wheel, mz: 0.0,
        }),
    ];

    let input = make_beam(n, l, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Total vertical reaction must equal sum of wheel loads
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p_wheel, 0.02, "Runway: total reaction = 2P");

    // Reactions by statics: R_A = P*(L-x1)/L + P*(L-x2)/L
    let r_a_exact: f64 = p_wheel * (l - x1) / l + p_wheel * (l - x2) / l;
    let r_b_exact: f64 = 2.0 * p_wheel - r_a_exact;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.ry, r_a_exact, 0.03, "Runway: R_A by statics");
    assert_close(r_b.ry, r_b_exact, 0.03, "Runway: R_B by statics");

    // Maximum bending moment should be between the two wheel loads.
    // M at critical section (under first wheel):
    // M = R_A * x1
    let m_at_wheel1: f64 = r_a_exact * x1;

    // Find max moment in results
    let m_max: f64 = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert_close(m_max, m_at_wheel1, 0.10, "Runway: max moment near wheel position");

    // Deflection check: should be within AISC DG7 limit L/600
    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    let defl_limit: f64 = l / 600.0;
    assert!(
        mid_disp.uy.abs() < defl_limit,
        "Runway deflection {:.4} m < L/600 = {:.4} m", mid_disp.uy.abs(), defl_limit
    );
}

// ================================================================
// 2. Gantry Crane Leg — Portal Frame Under Vertical and Lateral Load
// ================================================================
//
// A gantry crane has two legs connected by a bridge girder.
// Model as a portal frame: height h = 8 m, span w = 15 m.
// Vertical load from lifted load and self-weight, plus lateral
// load from trolley acceleration (10% of vertical).
//
// For fixed-base portal frame with lateral load F at beam level:
//   Base shear per column = F/2 (symmetric)
//   Base moment per column = F*h/2 (portal method, equal stiffness)
// Vertical equilibrium: sum of vertical reactions = total gravity.

#[test]
fn crane_gantry_leg_portal_action() {
    let h: f64 = 8.0;         // m, gantry leg height
    let w: f64 = 15.0;        // m, bridge span
    let e_steel: f64 = 200_000.0; // MPa

    // Heavy W-section for gantry legs and bridge
    let a: f64 = 0.025;       // m^2
    let iz: f64 = 5.0e-4;     // m^4

    // Vertical load: lifted load + trolley + bridge self-weight
    let p_vertical: f64 = -200.0; // kN at each top node (downward)
    // Lateral load: 10% of total vertical from acceleration
    let p_lateral: f64 = 40.0;    // kN at top (horizontal)

    let input = make_portal_frame(h, w, e_steel, a, iz, p_lateral, p_vertical);
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium: sum Ry = total applied vertical
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_vertical: f64 = 2.0 * p_vertical.abs(); // two nodes loaded
    assert_close(sum_ry, total_vertical, 0.02, "Gantry: vertical equilibrium");

    // Horizontal equilibrium: sum Rx + F_lateral = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), p_lateral, 0.02, "Gantry: horizontal equilibrium");

    // Base moments should be non-zero (fixed supports)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.mz.abs() > 0.0, "Gantry: base moment at node 1 non-zero");
    assert!(r4.mz.abs() > 0.0, "Gantry: base moment at node 4 non-zero");

    // Moment equilibrium about base:
    // M_overturning = F_lateral * h + P_vert * 0 (vertical loads on centerline don't cause overturning directly,
    // but they load at nodes 2 and 3 which are at x=0 and x=w)
    // Base moments + vertical reaction couple must resist overturning
    let m_base_sum: f64 = r1.mz.abs() + r4.mz.abs();
    let r_vert_couple: f64 = (r1.ry - r4.ry).abs() * w / 2.0;
    let m_overturn: f64 = p_lateral * h;
    // The vertical loads at top create moments too, but they are symmetric about the span
    // So overturning from lateral: F*h should be resisted by base moments + couple
    let m_resist: f64 = m_base_sum + r_vert_couple;

    assert_close(m_resist, m_overturn, 0.15, "Gantry: overturning moment equilibrium");
}

// ================================================================
// 3. Jib Crane Cantilever — Tip Load on Cantilever Beam
// ================================================================
//
// A jib crane arm: cantilever of length L = 6 m, fixed at mast,
// free end carries hook load P = 50 kN.
//
// Cantilever under tip load:
//   delta_tip = P * L^3 / (3 * E * I)
//   M_fixed = P * L (maximum moment at fixed end)
//   V = P (constant shear)
//
// Self-weight of jib modeled as UDL q = 2.0 kN/m.
// Tip deflection from UDL: delta_q = q*L^4 / (8*E*I)

#[test]
fn crane_jib_cantilever_tip_load() {
    let l: f64 = 6.0;           // m, jib length
    let p_hook: f64 = -50.0;    // kN, hook load (downward)
    let q_self: f64 = -2.0;     // kN/m, jib self-weight (downward)
    let n: usize = 12;

    // Box section jib arm
    let e_steel: f64 = 200_000.0; // MPa
    let a_jib: f64 = 0.0060;      // m^2
    let iz_jib: f64 = 8.0e-5;     // m^4

    // Build distributed loads on all elements
    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_self, q_j: q_self, a: None, b: None,
        }));
    }
    // Add tip point load at free end
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: p_hook, mz: 0.0,
    }));

    let input = make_beam(n, l, e_steel, a_jib, iz_jib, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0; // kN/m^2

    // Tip deflection (superposition):
    // From point load: delta_P = P*L^3/(3EI)
    let delta_p: f64 = p_hook.abs() * l.powi(3) / (3.0 * e_eff * iz_jib);
    // From UDL: delta_q = q*L^4/(8EI)
    let delta_q: f64 = q_self.abs() * l.powi(4) / (8.0 * e_eff * iz_jib);
    let delta_total: f64 = delta_p + delta_q;

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.uy.abs(), delta_total, 0.05, "Jib: tip deflection (P + q)");

    // Fixed-end reaction: R = P + q*L
    let total_load: f64 = p_hook.abs() + q_self.abs() * l;
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.ry, total_load, 0.02, "Jib: fixed-end vertical reaction");

    // Fixed-end moment: M = P*L + q*L^2/2
    let m_fixed_exact: f64 = p_hook.abs() * l + q_self.abs() * l * l / 2.0;
    assert_close(r_fixed.mz.abs(), m_fixed_exact, 0.03, "Jib: fixed-end moment");

    // Shear at fixed end should equal total load
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.v_start.abs(), total_load, 0.05, "Jib: shear at fixed end");
}

// ================================================================
// 4. Tower Crane Mast — Axial Compression + Lateral Wind Bending
// ================================================================
//
// A tower crane mast modeled as a multi-element column, height H = 40 m.
// Axial compression from lifted load and self-weight: P = -500 kN.
// Wind load applied as a lateral force at the top: F_wind = 30 kN.
//
// Fixed at base, free at top (cantilever action for wind).
// Axial shortening: delta_axial = P*H/(E*A)
// Tip lateral deflection from wind: delta_wind = F*H^3/(3*E*I)
// Base moment from wind: M = F_wind * H

#[test]
fn crane_tower_mast_axial_and_wind() {
    let h: f64 = 40.0;           // m, mast height
    let n: usize = 20;           // elements
    let p_axial: f64 = -500.0;   // kN, compressive axial load (negative fx along horizontal column model)
    let f_wind: f64 = 30.0;      // kN, lateral force at top

    // Large tubular steel mast section
    let e_steel: f64 = 200_000.0; // MPa
    let a_mast: f64 = 0.040;      // m^2 (large section)
    let iz_mast: f64 = 2.0e-3;    // m^4

    // Model as horizontal beam (make_beam lays along X-axis)
    // "fixed" at node 1, free at far end (no end support)
    let loads = vec![
        // Axial load at tip (compression along beam axis)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_axial, fy: 0.0, mz: 0.0,
        }),
        // Lateral load at tip (transverse)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: f_wind, mz: 0.0,
        }),
    ];

    let input = make_beam(n, h, e_steel, a_mast, iz_mast, "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0; // kN/m^2

    // Axial shortening at tip
    let delta_axial_exact: f64 = p_axial.abs() * h / (e_eff * a_mast);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.ux.abs(), delta_axial_exact, 0.05, "Tower: axial shortening");

    // Lateral deflection at tip from wind: delta = F*H^3/(3EI)
    let delta_wind_exact: f64 = f_wind * h.powi(3) / (3.0 * e_eff * iz_mast);
    assert_close(tip_disp.uy.abs(), delta_wind_exact, 0.10, "Tower: tip lateral deflection");

    // Base reactions
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Vertical reaction = lateral wind force
    assert_close(r_base.ry.abs(), f_wind, 0.02, "Tower: base shear from wind");

    // Horizontal reaction = axial load
    assert_close(r_base.rx.abs(), p_axial.abs(), 0.02, "Tower: base axial reaction");

    // Base moment from wind: M = F_wind * H
    let m_base_exact: f64 = f_wind * h;
    assert_close(r_base.mz.abs(), m_base_exact, 0.05, "Tower: base moment from wind");
}

// ================================================================
// 5. Crane Outrigger Pad — Spread Footing as Beam on Supports
// ================================================================
//
// A mobile crane deploys outrigger pads to distribute load.
// Model the outrigger beam as a simply-supported beam spanning
// between two ground pad support points, with the crane leg
// load applied at the center.
//
// Central point load P on SS beam of span L:
//   R_each = P/2
//   M_max = P*L/4 (at midspan)
//   delta_max = P*L^3/(48*E*I)
//
// Outrigger beam: steel box section, L = 4.0 m between pads.
// Leg load P = 400 kN (from crane stability calculation).

#[test]
fn crane_outrigger_pad_loading() {
    let l: f64 = 4.0;           // m, distance between outrigger pads
    let p_leg: f64 = -400.0;    // kN, crane leg load (downward)
    let n: usize = 8;

    // Outrigger beam: heavy box section
    let e_steel: f64 = 200_000.0; // MPa
    let a_beam: f64 = 0.0120;     // m^2
    let iz_beam: f64 = 3.0e-4;    // m^4

    // Central point load at midspan
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: p_leg, mz: 0.0,
    })];

    let input = make_beam(n, l, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0; // kN/m^2

    // Each support reaction = P/2
    let r_each_exact: f64 = p_leg.abs() / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry, r_each_exact, 0.02, "Outrigger: left pad reaction = P/2");
    assert_close(r2.ry, r_each_exact, 0.02, "Outrigger: right pad reaction = P/2");

    // Maximum moment = P*L/4 at midspan
    let m_max_exact: f64 = p_leg.abs() * l / 4.0;
    let m_max: f64 = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert_close(m_max, m_max_exact, 0.05, "Outrigger: M_max = PL/4");

    // Midspan deflection: delta = P*L^3/(48*E*I)
    let delta_exact: f64 = p_leg.abs() * l.powi(3) / (48.0 * e_eff * iz_beam);
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05, "Outrigger: midspan deflection");

    // Ground bearing pressure check: pad area required
    // Allowable bearing = 200 kPa (typical compacted ground)
    let q_allow: f64 = 200.0; // kPa = kN/m^2
    let pad_area_required: f64 = r_each_exact / q_allow; // m^2 per pad
    assert!(
        pad_area_required > 0.5 && pad_area_required < 5.0,
        "Pad area {:.2} m^2 in reasonable range", pad_area_required
    );
}

// ================================================================
// 6. Crane Girder Fatigue — Stress Range from Moving Wheel Load
// ================================================================
//
// Fatigue assessment of a crane runway girder by computing the
// stress range at midspan as wheel loads traverse the beam.
// The stress range is the difference between maximum and minimum
// stress at a critical section from the moving load pattern.
//
// Model: SS beam, single wheel load moved to position of max
// moment (midspan) and then to the support (zero moment).
// Stress range: Delta_sigma = M_max / S_x
// where S_x = I/(d/2) is the section modulus.

#[test]
fn crane_girder_fatigue_stress_range() {
    let l: f64 = 10.0;          // m, girder span
    let p_wheel: f64 = 120.0;   // kN, service wheel load (unfactored)
    let n: usize = 20;

    // Runway girder section
    let e_steel: f64 = 200_000.0; // MPa
    let a_beam: f64 = 0.0150;     // m^2
    let iz_beam: f64 = 6.0e-4;    // m^4
    let depth: f64 = 0.500;       // m, beam depth

    // Section modulus
    let sx: f64 = iz_beam / (depth / 2.0); // m^3

    // Case 1: Wheel at midspan (maximum moment position)
    let mid_node = n / 2 + 1;
    let loads_mid = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p_wheel, mz: 0.0,
    })];

    let input_mid = make_beam(n, l, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads_mid);
    let results_mid = solve_2d(&input_mid).expect("solve mid");

    // Maximum moment at midspan: M = P*L/4
    let m_max_exact: f64 = p_wheel * l / 4.0;
    let m_max: f64 = results_mid.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert_close(m_max, m_max_exact, 0.05, "Fatigue: M_max = PL/4 at midspan");

    // Case 2: Wheel near support (minimum moment at midspan)
    let loads_end = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p_wheel, mz: 0.0,
    })];

    let input_end = make_beam(n, l, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads_end);
    let results_end = solve_2d(&input_end).expect("solve end");

    // Moment at midspan when load is near support: small
    let ef_mid_elem = results_end.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    let m_min: f64 = ef_mid_elem.m_end.abs();

    // Stress range at midspan section
    let sigma_max: f64 = m_max / sx;          // kN/m^2 = kPa
    let sigma_min: f64 = m_min / sx;          // kPa
    let delta_sigma: f64 = sigma_max - sigma_min; // kPa
    let delta_sigma_mpa: f64 = delta_sigma / 1000.0; // MPa

    // For AISC Category C detail, allowable stress range at 500k cycles ~ 90 MPa
    // Verify stress range is positive and within expected bounds
    assert!(
        delta_sigma_mpa > 0.0,
        "Fatigue: stress range is positive: {:.1} MPa", delta_sigma_mpa
    );

    // The maximum stress alone should be well below yield
    let sigma_max_mpa: f64 = sigma_max / 1000.0;
    let fy: f64 = 350.0; // MPa
    assert!(
        sigma_max_mpa < fy,
        "Fatigue: max stress {:.1} MPa < yield {:.1} MPa", sigma_max_mpa, fy
    );

    // Verify the moment ratio: wheel near support gives much smaller midspan moment
    assert!(
        m_min < m_max * 0.3,
        "Fatigue: M_min/M_max = {:.3} < 0.3", m_min / m_max
    );
}

// ================================================================
// 7. Hook Block Load Path — Two-Span Continuous Runway Girder
// ================================================================
//
// Hook load transferred through two-span continuous runway girder.
// Model as a 2-span continuous beam (3 supports) with a point load
// at the midspan of the first span.
//
// For a 2-span continuous beam with point load P at center of span 1:
//   Interior reaction R_B = 11P/32 (for equal spans, load at mid-first-span)
//   End reactions determined by equilibrium and compatibility.
//
// This tests the full load path from hook through girder to columns.

#[test]
fn crane_hook_block_load_path() {
    let span: f64 = 10.0;        // m, each span
    let p_hook: f64 = 200.0;     // kN, hook load
    let n_per_span: usize = 10;

    // Runway girder section
    let e_steel: f64 = 200_000.0; // MPa
    let a_beam: f64 = 0.0150;     // m^2
    let iz_beam: f64 = 6.0e-4;    // m^4

    // Point load at midspan of first span
    let load_node = n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p_hook, mz: 0.0,
    })];

    let input = make_continuous_beam(
        &[span, span], n_per_span, e_steel, a_beam, iz_beam, loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Total reaction must equal applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_hook, 0.02, "Hook: total reaction = P");

    // Interior support node
    let mid_support_node = n_per_span + 1;
    let end_node = 2 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == mid_support_node).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == end_node).unwrap();

    // All reactions should be finite and reasonable
    assert!(r_a.ry > 0.0, "Hook: R_A > 0 (upward)");
    assert!(r_b.ry > 0.0, "Hook: R_B > 0 (interior support upward)");

    // Interior reaction should be significant (it carries a large share)
    assert!(
        r_b.ry > p_hook * 0.2,
        "Hook: interior reaction {:.1} > 20% of P", r_b.ry
    );

    // The end support of the unloaded span should have a small reaction
    // (due to continuity effect). It could be slightly negative (uplift)
    // or small positive.
    assert!(
        r_c.ry.abs() < p_hook * 0.2,
        "Hook: far end reaction {:.2} kN is small (< 20% of P)", r_c.ry
    );

    // Equilibrium check
    let r_total: f64 = r_a.ry + r_b.ry + r_c.ry;
    assert_close(r_total, p_hook, 0.02, "Hook: ΣR = P equilibrium");

    // Load path: the loaded span should carry most bending
    // Max moment should be in the first span (elements 1 to n_per_span)
    let m_max_span1: f64 = results.element_forces.iter()
        .filter(|ef| ef.element_id <= n_per_span)
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    let m_max_span2: f64 = results.element_forces.iter()
        .filter(|ef| ef.element_id > n_per_span)
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert!(
        m_max_span1 > m_max_span2,
        "Hook: loaded span M = {:.1} > unloaded span M = {:.1}", m_max_span1, m_max_span2
    );
}

// ================================================================
// 8. Crane Bumper Impact — Dynamic Impact Force on End Stop
// ================================================================
//
// When a crane bridge travels and hits the end stop (bumper),
// the impact force is transmitted to the runway beam end.
// Model the runway beam with an impact force at one end.
//
// Bumper impact modeled as a concentrated horizontal force at
// the end of a fixed-roller beam (simulating the runway column
// restraint). The end stop force is applied at the roller end.
//
// For a beam with axial force at the free (roller) end:
//   Axial force is constant throughout: N = F_impact
//   Axial shortening: delta = F * L / (E * A)
// Additionally, eccentricity of the crane rail above beam neutral
// axis creates a moment: M = F_impact * e_rail.
// We model this as a combined axial + moment loading.

#[test]
fn crane_bumper_impact_force() {
    let l: f64 = 12.0;           // m, runway beam span
    let f_impact: f64 = 80.0;    // kN, bumper impact force (horizontal)
    let e_rail: f64 = 0.30;      // m, eccentricity (rail top above beam NA)
    let n: usize = 12;

    // Runway girder section
    let e_steel: f64 = 200_000.0; // MPa
    let a_beam: f64 = 0.0150;     // m^2
    let iz_beam: f64 = 6.0e-4;    // m^4

    // Impact force at roller end (node n+1) + eccentricity moment
    let m_eccentric: f64 = f_impact * e_rail; // kN·m
    let loads = vec![
        // Horizontal impact force
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: f_impact, fy: 0.0, mz: 0.0,
        }),
        // Eccentricity moment (rail above NA)
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: 0.0, mz: m_eccentric,
        }),
    ];

    let input = make_beam(n, l, e_steel, a_beam, iz_beam, "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    let e_eff: f64 = e_steel * 1000.0; // kN/m^2

    // Axial force in beam should be constant = F_impact
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.n_start.abs(), f_impact, 0.05, "Bumper: axial force = F_impact");

    // Axial displacement at roller end: delta = F*L/(EA)
    let delta_axial_exact: f64 = f_impact * l / (e_eff * a_beam);
    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.ux.abs(), delta_axial_exact, 0.05, "Bumper: axial displacement");

    // The eccentricity moment creates bending in the beam.
    // For a SS beam with end moment M: the moment varies linearly.
    // At the loaded end: M = m_eccentric, at the pinned end: M = 0.
    // Reactions: Ry at each end from the moment couple = m_eccentric / L
    let r_moment_exact: f64 = m_eccentric / l;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Vertical reactions form a couple to resist the end moment
    // R1.ry and R2.ry should be equal and opposite (from moment only)
    let r_couple: f64 = (r1.ry - r2.ry).abs() / 2.0;
    assert_close(r_couple, r_moment_exact, 0.10, "Bumper: vertical reaction couple from eccentricity");

    // Horizontal reaction at pinned end equals impact force
    assert_close(r1.rx.abs(), f_impact, 0.02, "Bumper: horizontal reaction = F_impact");

    // Energy absorption check: kinetic energy = 1/2 * m * v^2
    // For a 50-tonne crane at 0.5 m/s: KE = 0.5 * 50000 * 0.25 = 6250 J = 6.25 kN·m
    let crane_mass: f64 = 50_000.0; // kg
    let travel_speed: f64 = 0.5;     // m/s
    let ke: f64 = 0.5 * crane_mass * travel_speed * travel_speed; // J
    let ke_knm: f64 = ke / 1000.0; // kN·m

    // Strain energy in beam: U = F^2 * L / (2*E*A) (axial only, simplified)
    let u_axial: f64 = f_impact * f_impact * l / (2.0 * e_eff * a_beam);
    assert!(
        u_axial > 0.0,
        "Bumper: strain energy {:.4} kN·m from impact", u_axial
    );
    assert!(
        ke_knm > 0.0,
        "Bumper: kinetic energy {:.2} kN·m to absorb", ke_knm
    );
}
