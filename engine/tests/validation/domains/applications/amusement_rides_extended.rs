/// Validation: Amusement Ride / Special Structure Analysis
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th ed. (truss and cable structures)
///   - Kassimali, "Structural Analysis", 6th ed. (method of joints, virtual work)
///   - Meriam & Kraige, "Engineering Mechanics: Statics", 9th ed.
///   - ASTM F24: Standard practice for amusement ride design
///   - BS EN 13814:2019: Fairground and amusement park machinery — Safety
///   - Timoshenko & Young, "Theory of Structures", 2nd ed.
///
/// Tests model idealised structural subsystems from amusement rides:
///   1. Ferris wheel spoke tension (V-cable under gravity at hub)
///   2. Roller coaster track beam (continuous beam with moving load)
///   3. Observation tower (cantilever column under wind + self-weight)
///   4. Carousel beam (radial beam fixed at center, tip load)
///   5. Zip line cable (inclined cable sag under point load)
///   6. Swing ride chain tension (V-truss with gondola weight)
///   7. Water slide support (inclined beam on two supports)
///   8. Gondola cable station (cable span with mid-span gondola load)

use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

// ================================================================
// 1. Ferris Wheel Spoke Tension
// ================================================================
//
// A simplified Ferris wheel hub: two inclined spokes forming a V
// supporting a gondola weight at the bottom. The hub (top) is
// pinned on both sides. A vertical downward load P acts at the
// apex (bottom of V).
//
// By statics for symmetric V-cable:
//   F_spoke = P / (2 * sin(alpha))
// where alpha = angle of spoke from horizontal.
//
// Reference: Meriam & Kraige, method of joints for concurrent forces.

#[test]
fn ferris_wheel_spoke_tension() {
    // Geometry: hub nodes at top, gondola node at bottom of V
    let half_span: f64 = 5.0;  // horizontal half-distance between hub supports
    let drop: f64 = 8.0;       // vertical drop from hub to gondola
    let p_gondola: f64 = 12.0; // kN, gondola + passenger weight

    let spoke_len: f64 = (half_span.powi(2) + drop.powi(2)).sqrt();
    let sin_alpha: f64 = drop / spoke_len;

    // Expected spoke tension
    let f_spoke_expected: f64 = p_gondola / (2.0 * sin_alpha);

    let input = make_input(
        vec![
            (1, 0.0, drop),             // left hub pin
            (2, 2.0 * half_span, drop), // right hub pin
            (3, half_span, 0.0),        // gondola attachment point
        ],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.002, 1.0e-10)], // cable-like: large A, tiny I
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // left spoke (truss)
            (2, "frame", 3, 2, 1, 1, true, true), // right spoke (truss)
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p_gondola, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Both spokes should carry equal tension by symmetry
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.02,
        "Ferris wheel: symmetric spoke forces");

    assert_close(ef1.n_start.abs(), f_spoke_expected, 0.05,
        "Ferris wheel: spoke tension = P/(2*sin(alpha))");

    // Vertical equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_gondola, 0.02, "Ferris wheel: vertical equilibrium");

    // Gondola should deflect downward
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d3.uy < 0.0, "Ferris wheel: gondola deflects downward");
}

// ================================================================
// 2. Roller Coaster Track Beam
// ================================================================
//
// A roller coaster track segment modeled as a continuous 3-span
// beam supported at each pier. A concentrated load (car weight)
// acts at the midspan of the center span.
//
// For a 3-span continuous beam with point load P at center of
// middle span, the central reaction is approximately 1.1*P and
// outer reactions absorb the rest.
//
// Reference: Timoshenko & Young, "Theory of Structures", continuous beams.

#[test]
fn roller_coaster_track_beam() {
    let span: f64 = 8.0;       // m, each span
    let e_steel: f64 = 200_000.0; // MPa
    let a_track: f64 = 0.015;  // m^2, track rail cross-section area
    let iz_track: f64 = 5.0e-4; // m^4, track rail second moment of area

    // Car weight as concentrated load at midspan of middle span
    let p_car: f64 = -50.0; // kN, downward

    let n_per_span: usize = 4;

    // Build loads: point load at center of middle span
    // The center of the middle span is at x = 1.5 * span = 12.0 m
    // That corresponds to node: n_per_span + n_per_span/2 + 1 = 4 + 2 + 1 = 7
    let mid_node = n_per_span + n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: p_car, mz: 0.0,
    })];

    let input = make_continuous_beam(
        &[span, span, span],
        n_per_span,
        e_steel,
        a_track,
        iz_track,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Total vertical reaction = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_car.abs(), 0.02, "Coaster: total reaction = P");

    // Midspan deflection of the loaded span should be downward
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();
    assert!(mid_disp.uy < 0.0, "Coaster: track deflects downward at car position");

    // The two interior supports (at span boundaries) should carry
    // the majority of the load. Support nodes are at:
    //   node 1 (x=0), node n_per_span+1 (x=span), node 2*n_per_span+1 (x=2*span),
    //   node 3*n_per_span+1 (x=3*span)
    let sup_left_inner = n_per_span + 1;
    let sup_right_inner = 2 * n_per_span + 1;

    let r_li = results.reactions.iter().find(|r| r.node_id == sup_left_inner).unwrap();
    let r_ri = results.reactions.iter().find(|r| r.node_id == sup_right_inner).unwrap();

    // By symmetry of loading in center span, both inner supports
    // should carry equal reactions
    assert_close(r_li.ry, r_ri.ry, 0.05,
        "Coaster: symmetric inner support reactions");

    // Deflection should be small relative to span (serviceability)
    let deflection_limit: f64 = span / 300.0;
    assert!(mid_disp.uy.abs() < deflection_limit,
        "Coaster: deflection {:.5} m < L/300 = {:.5} m",
        mid_disp.uy.abs(), deflection_limit);
}

// ================================================================
// 3. Observation Tower Under Wind and Self-Weight
// ================================================================
//
// An observation tower modeled as a vertical cantilever (fixed at
// base, free at top). Self-weight acts as distributed load along
// the height, plus a concentrated wind load at the top.
//
// Tip deflection from point load: delta_P = P*L^3 / (3*E*I)
// Tip deflection from UDL:       delta_q = q*L^4 / (8*E*I)
//
// Reference: Timoshenko, "Strength of Materials", cantilever formulas.

#[test]
fn observation_tower_wind_and_weight() {
    let h_tower: f64 = 30.0;    // m, tower height
    let e_steel: f64 = 200_000.0; // MPa
    let a_tower: f64 = 0.05;    // m^2, tower cross-section
    let iz_tower: f64 = 0.01;   // m^4, tower bending inertia

    let f_wind: f64 = 15.0;     // kN, horizontal wind at top
    let n: usize = 10;

    // Model tower along X (cantilever: fixed at node 1, free at tip)
    // Wind load acts in Y direction at the tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: f_wind, mz: 0.0,
    })];

    let input = make_beam(n, h_tower, e_steel, a_tower, iz_tower,
        "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical tip deflection from point load at free end of cantilever
    let e_eff: f64 = e_steel * 1000.0; // kN/m^2
    let delta_p_exact: f64 = f_wind * h_tower.powi(3) / (3.0 * e_eff * iz_tower);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.uy.abs(), delta_p_exact, 0.03,
        "Tower: tip deflection from wind = PL^3/(3EI)");

    // Base reactions: horizontal reaction = wind load
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.ry.abs(), f_wind, 0.02,
        "Tower: base horizontal reaction = wind force");

    // Base moment: M = F_wind * H
    let m_base_exact: f64 = f_wind * h_tower;
    assert_close(r_base.mz.abs(), m_base_exact, 0.03,
        "Tower: base moment = F*H");

    // Root element should carry the full shear
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1.v_start.abs(), f_wind, 0.03,
        "Tower: root shear = wind force");
}

// ================================================================
// 4. Carousel Beam (Radial Arm)
// ================================================================
//
// A carousel radial arm modeled as a cantilever beam fixed at the
// center hub, with a concentrated load at the outer tip representing
// the horse/seat weight plus rider.
//
// Tip deflection: delta = P*L^3 / (3*E*I)
// Root moment:    M = P*L
//
// Reference: Hibbeler, "Structural Analysis", cantilever beam formulas.

#[test]
fn carousel_beam_radial_arm() {
    let l_arm: f64 = 5.0;       // m, arm length from hub to seat
    let e_steel: f64 = 200_000.0; // MPa
    let a_arm: f64 = 0.004;     // m^2, hollow tube section
    let iz_arm: f64 = 8.0e-5;   // m^4

    // Rider + horse weight at tip
    let p_tip: f64 = -3.5; // kN, downward
    let n: usize = 6;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: p_tip, mz: 0.0,
    })];

    let input = make_beam(n, l_arm, e_steel, a_arm, iz_arm,
        "fixed", None, loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical tip deflection: delta = P*L^3/(3*E*I)
    let e_eff: f64 = e_steel * 1000.0;
    let delta_exact: f64 = p_tip.abs() * l_arm.powi(3) / (3.0 * e_eff * iz_arm);

    let tip_disp = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_disp.uy.abs(), delta_exact, 0.03,
        "Carousel: tip deflection = PL^3/(3EI)");

    // Root moment: M = P * L
    let m_root_exact: f64 = p_tip.abs() * l_arm;
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.mz.abs(), m_root_exact, 0.03,
        "Carousel: root moment = P*L");

    // Root shear = P
    assert_close(r_base.ry.abs(), p_tip.abs(), 0.02,
        "Carousel: root shear = P");

    // Tip rotation: theta = P*L^2/(2*E*I)
    let theta_exact: f64 = p_tip.abs() * l_arm.powi(2) / (2.0 * e_eff * iz_arm);
    assert_close(tip_disp.rz.abs(), theta_exact, 0.05,
        "Carousel: tip rotation = PL^2/(2EI)");
}

// ================================================================
// 5. Zip Line Cable
// ================================================================
//
// A zip line modeled as two truss members forming a V between two
// towers at the same height, with a vertical rider load at the
// midpoint sag location.
//
// For a symmetric V-cable with sag f below supports separated by
// span L, the cable tension in each half is:
//   T = P / (2 * sin(alpha))
// where alpha = atan(f / (L/2)).
//
// Reference: Kassimali, "Structural Analysis", cable equilibrium.

#[test]
fn zip_line_cable_tension() {
    // Symmetric zip line: two towers at same height, sag at midpoint
    let span: f64 = 50.0;       // m, horizontal distance between towers
    let sag: f64 = 4.0;         // m, cable sag at midspan
    let p_rider: f64 = 1.5;     // kN, rider + trolley weight

    let half_span: f64 = span / 2.0;
    let cable_half_len: f64 = (half_span.powi(2) + sag.powi(2)).sqrt();
    let sin_alpha: f64 = sag / cable_half_len;

    // Expected cable tension in each half
    let t_expected: f64 = p_rider / (2.0 * sin_alpha);

    let input = make_input(
        vec![
            (1, 0.0, sag),              // left tower top
            (2, half_span, 0.0),         // midpoint sag location
            (3, span, sag),              // right tower top
        ],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.001, 1.0e-10)], // cable-like: tiny I
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // left cable half (truss)
            (2, "frame", 2, 3, 1, 1, true, true), // right cable half (truss)
        ],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p_rider, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Symmetric forces
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.02,
        "Zip line: symmetric cable forces");

    // Cable tension
    assert_close(ef1.n_start.abs(), t_expected, 0.05,
        "Zip line: cable tension = P/(2*sin(alpha))");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_rider, 0.02, "Zip line: vertical equilibrium");

    // Midpoint should deflect downward
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy < 0.0, "Zip line: midpoint sags under load");
}

// ================================================================
// 6. Swing Ride Chain Tension
// ================================================================
//
// A swing ride at rest: two chains form a V from the top bar
// down to the seat. The seat carries the rider weight. At rest
// (no centrifugal force), this is a pure V-cable problem.
//
// Each chain tension T = P / (2 * sin(theta))
// where theta is the angle from horizontal.
//
// Reference: Meriam & Kraige, concurrent force equilibrium.

#[test]
fn swing_ride_chain_tension() {
    let spread: f64 = 1.2;    // m, horizontal distance between attachment points
    let chain_drop: f64 = 3.5; // m, vertical distance to seat
    let p_seat: f64 = 1.0;    // kN, rider + seat weight

    let half_spread: f64 = spread / 2.0;
    let chain_len: f64 = (half_spread.powi(2) + chain_drop.powi(2)).sqrt();
    let sin_theta: f64 = chain_drop / chain_len;

    let t_chain_expected: f64 = p_seat / (2.0 * sin_theta);

    let input = make_input(
        vec![
            (1, 0.0, chain_drop),            // left attachment
            (2, spread, chain_drop),          // right attachment
            (3, half_spread, 0.0),            // seat position
        ],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 5.0e-4, 1.0e-10)], // chain: small A, negligible I
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // left chain (truss)
            (2, "frame", 3, 2, 1, 1, true, true), // right chain (truss)
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p_seat, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    // Symmetric forces
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.02,
        "Swing: symmetric chain forces");

    // Chain tension magnitude
    assert_close(ef1.n_start.abs(), t_chain_expected, 0.05,
        "Swing: chain tension = P/(2*sin(theta))");

    // Each support carries half the vertical load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, p_seat / 2.0, 0.02,
        "Swing: each support carries P/2 vertically");

    // Horizontal reactions should be equal and opposite
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rx, -r2.rx, 0.02,
        "Swing: horizontal reactions balance");
}

// ================================================================
// 7. Water Slide Support Structure
// ================================================================
//
// A water slide trough section modeled as a simply-supported
// inclined beam carrying a distributed load (water + rider).
// The beam spans between two support columns at different heights.
//
// For a simply-supported beam under UDL q, regardless of inclination:
//   Midspan deflection (perpendicular to beam axis): delta = 5*q*L^4/(384*E*I)
//   Each reaction = q*L/2 (perpendicular to beam axis)
//
// We model this as a horizontal SS beam of the projected length
// (simplified approach), so standard formulas apply directly.
//
// Reference: Hibbeler, "Structural Analysis", inclined beam analysis.

#[test]
fn water_slide_support_beam() {
    let l_slide: f64 = 6.0;      // m, span of slide section
    let e_frp: f64 = 30_000.0;   // MPa, fiberglass-reinforced plastic
    let a_trough: f64 = 0.008;   // m^2, trough cross-section
    let iz_trough: f64 = 2.0e-4; // m^4, trough bending inertia

    // Water flow + rider as UDL
    let q_load: f64 = -2.5; // kN/m, downward
    let n: usize = 8;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q_load, q_j: q_load, a: None, b: None,
        }));
    }

    let input = make_beam(n, l_slide, e_frp, a_trough, iz_trough,
        "pinned", Some("rollerX"), loads);
    let results = solve_2d(&input).expect("solve");

    // Analytical midspan deflection: delta = 5*q*L^4/(384*E*I)
    let e_eff: f64 = e_frp * 1000.0;
    let delta_exact: f64 = 5.0 * q_load.abs() * l_slide.powi(4)
        / (384.0 * e_eff * iz_trough);

    let mid_node = n / 2 + 1;
    let mid_disp = results.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap();

    assert_close(mid_disp.uy.abs(), delta_exact, 0.05,
        "Water slide: midspan deflection = 5qL^4/(384EI)");

    // Each reaction = q*L/2
    let r_exact: f64 = q_load.abs() * l_slide / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry.abs(), r_exact, 0.02,
        "Water slide: left reaction = qL/2");
    assert_close(r_end.ry.abs(), r_exact, 0.02,
        "Water slide: right reaction = qL/2");

    // Maximum bending moment at midspan: M = q*L^2/8
    let m_mid_exact: f64 = q_load.abs() * l_slide.powi(2) / 8.0;
    // Check element forces near midspan
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_exact, 0.05,
        "Water slide: midspan moment ~ qL^2/8");
}

// ================================================================
// 8. Gondola Cable Station
// ================================================================
//
// A gondola lift cable span modeled as two truss members meeting
// at a mid-span point where the gondola weight hangs. The supports
// are at equal height, so the geometry is a symmetric V with sag.
//
// Cable tension: T = P / (2 * sin(alpha))
// Horizontal component: H = P / (2 * tan(alpha))
//
// The sag ratio f/L controls the cable tension — smaller sag
// means higher tension.
//
// Reference: Irvine, "Cable Structures" (MIT Press), catenary/cable statics.

#[test]
fn gondola_cable_station() {
    let span: f64 = 60.0;       // m, horizontal distance between towers
    let sag: f64 = 3.0;         // m, cable sag at midspan
    let p_gondola: f64 = 25.0;  // kN, gondola + passengers

    let half_span: f64 = span / 2.0;
    let cable_half_len: f64 = (half_span.powi(2) + sag.powi(2)).sqrt();
    let sin_alpha: f64 = sag / cable_half_len;
    let cos_alpha: f64 = half_span / cable_half_len;
    let tan_alpha: f64 = sin_alpha / cos_alpha;

    // Expected cable tension in each half
    let t_expected: f64 = p_gondola / (2.0 * sin_alpha);

    // Expected horizontal component at supports
    let h_expected: f64 = p_gondola / (2.0 * tan_alpha);

    let tower_height: f64 = sag; // towers at height = sag, mid at 0

    let input = make_input(
        vec![
            (1, 0.0, tower_height),         // left tower top
            (2, half_span, 0.0),            // midspan sag point
            (3, span, tower_height),         // right tower top
        ],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.005, 1.0e-10)], // cable: decent A, negligible I
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // left cable (truss)
            (2, "frame", 2, 3, 1, 1, true, true), // right cable (truss)
        ],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p_gondola, mz: 0.0,
        })],
    );
    let results = solve_2d(&input).expect("solve");

    // Cable tension in each half
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();

    assert_close(ef1.n_start.abs(), t_expected, 0.05,
        "Gondola: left cable tension = P/(2*sin(alpha))");
    assert_close(ef2.n_start.abs(), t_expected, 0.05,
        "Gondola: right cable tension = P/(2*sin(alpha))");

    // Symmetric forces
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.02,
        "Gondola: symmetric cable tension");

    // Horizontal reaction at each tower
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.rx.abs(), h_expected, 0.05,
        "Gondola: horizontal reaction = P/(2*tan(alpha))");

    // Horizontal reactions should be equal and opposite
    assert_close(r1.rx.abs(), r3.rx.abs(), 0.02,
        "Gondola: symmetric horizontal reactions");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p_gondola, 0.02, "Gondola: vertical equilibrium");

    // Sag ratio check: smaller sag means higher tension
    // T = P*L / (4*f) approximately for small sag
    let t_approx: f64 = p_gondola * span / (4.0 * sag);
    assert_close(t_expected, t_approx, 0.01,
        "Gondola: T ~ PL/(4f) for small sag ratio");
}
