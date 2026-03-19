/// Validation: Chimney & Stack Design -- Extended Structural Analysis
///
/// References:
///   - ACI 307-08: Design and Construction of Reinforced Concrete Chimneys
///   - EN 13084-1: Free-Standing Chimneys -- General Requirements
///   - ASME STS-1: Steel Stacks (2016)
///   - Timoshenko, "Strength of Materials", cantilever formulas
///   - Gere & Goodno, "Mechanics of Materials", beam-column analysis
///
/// Tests model chimneys as vertical cantilevers (fixed at base, free at top)
/// and verify deflections, reactions, and element forces against analytical
/// formulas from structural mechanics.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// ================================================================
// 1. Chimney as Vertical Cantilever -- Tip Wind Load
// ================================================================
//
// A steel chimney of height H=40m modeled as a vertical cantilever
// with a concentrated horizontal wind resultant at the top.
//
// Analytical (cantilever with tip load P):
//   delta_tip = P * H^3 / (3 * EI)
//   M_base = P * H
//   V_base = P
//
// E = 200,000 MPa, A = 0.05 m^2, Iz = 0.02 m^4
// EI_eff = E * 1000 * Iz = 200,000 * 1000 * 0.02 = 4,000,000 kN*m^2

#[test]
fn chimney_ext_cantilever_tip_wind() {
    let h: f64 = 40.0;
    let p: f64 = 50.0; // kN, horizontal wind resultant at top
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let ei: f64 = e * 1000.0 * iz; // 4,000,000 kN*m^2
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    // Build vertical cantilever: nodes at (0,0), (0,dy), ..., (0,H)
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip horizontal displacement: delta = P*H^3 / (3*EI)
    let expected_delta: f64 = p * h.powi(3) / (3.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.ux, expected_delta, 0.01, "chimney tip wind ux");

    // Base reactions: Rx = -P (opposing), Mz = P*H
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -p, 0.01, "chimney base Rx");
    assert_close(r1.my.abs(), p * h, 0.01, "chimney base Mz");

    // Vertical reaction should be zero (no vertical loads)
    assert!(r1.rz.abs() < 1e-6, "chimney base Ry should be zero, got {:.6e}", r1.rz);
}

// ================================================================
// 2. Chimney Under Uniform Distributed Wind Load
// ================================================================
//
// Uniform horizontal wind pressure applied as distributed load along
// the full height. For a vertical element, distributed loads act
// perpendicular to the element axis (i.e., horizontally).
//
// Analytical (cantilever with UDL q):
//   delta_tip = q * H^4 / (8 * EI)
//   M_base = q * H^2 / 2
//   V_base = q * H

#[test]
fn chimney_ext_uniform_wind_pressure() {
    let h: f64 = 40.0;
    let q: f64 = 5.0; // kN/m, uniform wind load
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let ei: f64 = e * 1000.0 * iz;
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Distributed load on each element (perpendicular = horizontal for vertical elem)
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = q*H^4 / (8*EI)
    let expected_delta: f64 = q * h.powi(4) / (8.0 * ei);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.ux.abs(), expected_delta, 0.01, "chimney UDL tip ux");

    // Base moment: M = q*H^2/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.my.abs(), q * h * h / 2.0, 0.01, "chimney UDL base Mz");

    // Base shear: V = q*H
    assert_close(r1.rx.abs(), q * h, 0.01, "chimney UDL base Rx");
}

// ================================================================
// 3. Chimney Self-Weight -- Axial Compression
// ================================================================
//
// Self-weight applied as vertical point loads at each node,
// producing axial compression in all elements.
//
// Total weight W = gamma * A * H (distributed weight per unit length = gamma*A).
// Base axial reaction Ry = W (upward).
// Axial shortening: delta = W*H / (2*EA) for uniform self-weight.
//
// Using nodal loads to approximate self-weight:
// Each interior node gets w*dy, end nodes get w*dy/2.

#[test]
fn chimney_ext_self_weight_axial() {
    let h: f64 = 40.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let ea: f64 = e * 1000.0 * a; // 10,000,000 kN
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    let w_per_m: f64 = 3.0; // kN/m, self-weight per unit length
    let _w_total: f64 = w_per_m * h; // 120 kN total

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    // Apply nodal vertical loads (downward) to approximate self-weight
    // Nodes 2..n get full tributary weight; top node gets half
    let mut loads = Vec::new();
    for i in 1..=n {
        let fy = if i == 1 || i == n {
            -w_per_m * dz / 2.0 // half at first interior and top
        } else {
            -w_per_m * dz
        };
        // Skip node 1 (supported), apply loads to nodes 2..=n+1
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1,
            fx: 0.0,
            fz: fy,
            my: 0.0,
        }));
    }

    // Total applied load (compute before moving loads)
    let total_applied: f64 = loads.iter().map(|l| {
        if let SolverLoad::Nodal(nl) = l { nl.fz } else { 0.0 }
    }).sum::<f64>().abs();

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base vertical reaction should equal total applied load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, total_applied, 0.01, "chimney self-weight Ry");

    // No horizontal reaction (no horizontal loads)
    assert!(r1.rx.abs() < 1e-6, "chimney self-weight Rx should be zero");

    // No base moment (purely axial, symmetric)
    assert!(r1.my.abs() < 1e-4, "chimney self-weight Mz should be ~zero");

    // Top node should move downward (negative uy)
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(tip.uz < 0.0, "chimney top should deflect downward");

    // Approximate shortening: for linearly varying axial force,
    // delta = W*H / (2*EA) is the continuous solution.
    // With lumped nodal loads, we get a close approximation.
    let expected_shortening: f64 = total_applied * h / (2.0 * ea);
    assert_close(tip.uz.abs(), expected_shortening, 0.15, "chimney self-weight shortening");
}

// ================================================================
// 4. Chimney Combined Wind + Self-Weight
// ================================================================
//
// Combined loading: horizontal tip force (wind) + vertical nodal
// loads (self-weight). Verify superposition of effects.
//
// Horizontal deflection from wind alone:
//   delta_x = P * H^3 / (3 * EI)
//
// Vertical shortening from self-weight alone:
//   delta_y ~ W * H / (2 * EA)
//
// With combined loading, both effects should be present.

#[test]
fn chimney_ext_combined_wind_and_gravity() {
    let h: f64 = 40.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let ei: f64 = e * 1000.0 * iz;
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    let p_wind: f64 = 50.0; // kN, horizontal at top
    let w_total: f64 = 120.0; // kN, total vertical self-weight

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];

    let mut loads = Vec::new();
    // Wind load at top
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p_wind,
        fz: 0.0,
        my: 0.0,
    }));
    // Self-weight: uniform distribution to interior nodes
    let w_per_node: f64 = w_total / n as f64;
    for i in 1..=n {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1,
            fx: 0.0,
            fz: -w_per_node,
            my: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Horizontal deflection should match cantilever tip load formula
    let expected_ux: f64 = p_wind * h.powi(3) / (3.0 * ei);
    assert_close(tip.ux, expected_ux, 0.01, "combined: tip ux from wind");

    // Vertical deflection should be downward
    assert!(tip.uz < 0.0, "combined: tip should deflect downward");

    // Base reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -p_wind, 0.01, "combined: base Rx = -P_wind");
    assert_close(r1.rz, w_total, 0.01, "combined: base Ry = W_total");

    // Base moment from wind: M = P*H = 50*40 = 2000
    // Self-weight on a vertical cantilever produces no bending moment
    // (loads are along the element axis)
    assert_close(r1.my.abs(), p_wind * h, 0.02, "combined: base Mz from wind");
}

// ================================================================
// 5. Guyed Chimney -- Propped Cantilever Model
// ================================================================
//
// A guyed chimney is modeled as a cantilever (fixed base) with a
// lateral spring or roller support at the guy wire attachment point.
// Simplified model: fixed at base, rollerY at 3/4 height, tip load.
//
// This is a propped cantilever with load at the free end.
// For a propped cantilever (fixed at A, roller at B at distance a
// from fixed end) with tip load P at distance L from fixed end:
//   R_roller = P * L^2 * (3*a - L) / (2 * a^3)  when L > a
//   But simpler: use solver and check equilibrium.

#[test]
fn chimney_ext_guyed_propped_cantilever() {
    let h: f64 = 40.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    let p: f64 = 80.0; // kN, horizontal wind at top

    // Guy wire at 3/4 height = node 7 (at y=30m, index 6, node_id=7)
    let guy_node: usize = (3 * n / 4) + 1; // node 7

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    // Fixed at base, rollerY at guy wire point (restrains horizontal movement)
    let sups = vec![(1, 1, "fixed"), (2, guy_node, "rollerY")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum of horizontal reactions = applied horizontal load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.01, "guyed chimney: sum Rx = -P");

    // The guy wire reaction (at guy_node) should resist part of the wind load
    let r_guy = results.reactions.iter().find(|r| r.node_id == guy_node).unwrap();
    assert!(r_guy.rx.abs() > 0.0, "guyed chimney: guy wire carries load");

    // Base reaction
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // The base moment should be less than for a pure cantilever (P*H = 3200)
    // because the guy wire provides intermediate support.
    let m_cantilever: f64 = p * h; // 3200 kN*m, moment if no guy wire
    assert!(
        r_base.my.abs() < m_cantilever,
        "guyed chimney: base moment {:.1} < cantilever moment {:.1}",
        r_base.my.abs(), m_cantilever
    );

    // Tip deflection should be smaller than pure cantilever
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let ei: f64 = e * 1000.0 * iz;
    let delta_cantilever: f64 = p * h.powi(3) / (3.0 * ei);
    assert!(
        tip.ux.abs() < delta_cantilever,
        "guyed chimney: tip deflection {:.6} < cantilever {:.6}",
        tip.ux.abs(), delta_cantilever
    );

    // Guy wire node should have zero horizontal displacement (rollerY constraint)
    let d_guy = results.displacements.iter().find(|d| d.node_id == guy_node).unwrap();
    assert!(d_guy.ux.abs() < 1e-8, "guyed chimney: guy node ux = 0");
}

// ================================================================
// 6. Twin Chimney Connected by Walkway Beam
// ================================================================
//
// Two vertical cantilevers (chimneys) connected at the top by a
// horizontal beam (walkway/platform). Wind load on left chimney.
// The connecting beam transfers load to the unloaded chimney.
//
// Model: 4 nodes, 3 elements
//   Node 1 (0,0) -- fixed, base of left chimney
//   Node 2 (0,H) -- top of left chimney
//   Node 3 (W,H) -- top of right chimney
//   Node 4 (W,0) -- fixed, base of right chimney
// Elements: 1(1-2 column), 2(2-3 beam), 3(3-4 column)
// This is a portal frame.

#[test]
fn chimney_ext_twin_connected_walkway() {
    let h: f64 = 30.0;
    let w: f64 = 10.0;
    let e: f64 = 200_000.0;
    let a: f64 = 0.05;
    let iz: f64 = 0.02;
    let p: f64 = 60.0; // kN, horizontal load at top of left chimney

    let input = make_portal_frame(h, w, e, a, iz, p, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum of horizontal reactions = -P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.01, "twin chimney: horizontal equilibrium");

    // Vertical equilibrium: no vertical loads applied, sum Ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 0.0, 0.01, "twin chimney: vertical equilibrium");

    // Due to antisymmetric loading, base moments should be related.
    // For a portal frame with lateral load: M_base_left + M_base_right + P*H = 0
    // is not correct. Actually, for a portal frame with equal columns and beam,
    // moment equilibrium about any point holds.
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Sum of moments about base of left chimney (0,0) = 0:
    // M1 + M4 + Ry4*W - P*H = 0
    // (P at (0,H) in +x direction: moment about origin = -H*P)
    let m_check: f64 = r1.my + r4.my + r4.rz * w - p * h;
    assert_close(m_check, 0.0, 0.02, "twin chimney: moment equilibrium about base-left");

    // Both bases should have non-zero moments
    assert!(r1.my.abs() > 1.0, "twin chimney: left base has moment");
    assert!(r4.my.abs() > 1.0, "twin chimney: right base has moment");

    // The connecting beam transfers load: both columns participate
    // so each base moment is less than P*H (pure cantilever moment)
    let m_cantilever: f64 = p * h;
    assert!(
        r1.my.abs() < m_cantilever,
        "twin chimney: left moment {:.1} < cantilever {:.1}",
        r1.my.abs(), m_cantilever
    );
}

// ================================================================
// 7. Tapered Chimney Approximation -- Stepped Cross-Section
// ================================================================
//
// A chimney with larger cross-section at the base and smaller at
// the top, approximated by two segments with different section
// properties. Base segment has 2x the moment of inertia.
//
// Compared to a uniform chimney, the tapered one should have:
//   - Smaller tip deflection
//   - Same base shear and moment (equilibrium)
//
// Analytical: For a cantilever with tip load P,
// the deflection depends on the stiffness distribution.

#[test]
fn chimney_ext_tapered_stepped_section() {
    let h: f64 = 40.0;
    let e: f64 = 200_000.0;
    let a_base: f64 = 0.08;
    let iz_base: f64 = 0.04;  // Base section (stiffer)
    let a_top: f64 = 0.05;
    let iz_top: f64 = 0.02;   // Top section
    let p: f64 = 50.0;        // kN, horizontal at top
    let n: usize = 8;
    let dz: f64 = h / n as f64;

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    // Lower half uses section 1 (stiffer), upper half uses section 2
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| {
            let sec_id = if i < n / 2 { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
        })
        .collect();
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a_base, iz_base), (2, a_top, iz_top)],
        elems,
        sups,
        loads,
    );
    let results_tapered = linear::solve_2d(&input).unwrap();

    // Also solve uniform chimney with top section only (for comparison)
    let nodes_u: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems_u: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups_u = vec![(1, 1, "fixed")];
    let loads_u = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];
    let input_u = make_input(
        nodes_u,
        vec![(1, e, 0.3)],
        vec![(1, a_top, iz_top)],
        elems_u,
        sups_u,
        loads_u,
    );
    let results_uniform = linear::solve_2d(&input_u).unwrap();

    // Base reactions should be the same (equilibrium, independent of stiffness)
    let r_tapered = results_tapered.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_uniform = results_uniform.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_tapered.rx, r_uniform.rx, 0.01, "tapered vs uniform: base Rx");
    assert_close(r_tapered.my, r_uniform.my, 0.01, "tapered vs uniform: base Mz");

    // Tapered chimney should have smaller tip deflection
    let tip_tapered = results_tapered.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_uniform = results_uniform.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(
        tip_tapered.ux.abs() < tip_uniform.ux.abs(),
        "tapered tip {:.6} < uniform tip {:.6}",
        tip_tapered.ux.abs(), tip_uniform.ux.abs()
    );

    // Verify equilibrium: Rx = -P, Mz = P*H
    assert_close(r_tapered.rx, -p, 0.01, "tapered: base Rx = -P");
    assert_close(r_tapered.my.abs(), p * h, 0.01, "tapered: base Mz = P*H");
}

// ================================================================
// 8. Chimney Stiffness Check -- Deflection Limit H/200
// ================================================================
//
// Serviceability check: chimney tip deflection under design wind
// should not exceed H/200 (typical limit from EN 13084-1).
//
// Given: H=60m, wind load P=100 kN at tip.
// Required: delta <= H/200 = 0.30 m
// Determine minimum Iz for the limit, then verify solver agrees.
//
// From delta = P*H^3 / (3*EI) <= H/200:
//   EI >= 200 * P * H^2 / 3
//   Iz >= 200 * P * H^2 / (3 * E_eff)
// With E_eff = 200,000 * 1000 = 200,000,000 kPa:
//   Iz >= 200 * 100 * 3600 / (3 * 200,000,000) = 0.12 m^4

#[test]
fn chimney_ext_deflection_serviceability_limit() {
    let h: f64 = 60.0;
    let p: f64 = 100.0;
    let e: f64 = 200_000.0;
    let e_eff: f64 = e * 1000.0;
    let a: f64 = 0.10;
    let n: usize = 10;
    let dz: f64 = h / n as f64;

    // Calculate minimum Iz for H/200 limit
    let delta_limit: f64 = h / 200.0; // 0.30 m
    let iz_min: f64 = 200.0 * p * h * h / (3.0 * e_eff);

    // Use Iz slightly larger than minimum (1.1 * iz_min) to ensure compliance
    let iz: f64 = 1.1 * iz_min;
    let ei: f64 = e_eff * iz;

    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, e, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check tip deflection
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let expected_delta: f64 = p * h.powi(3) / (3.0 * ei);

    // Verify solver matches analytical formula
    assert_close(tip.ux.abs(), expected_delta, 0.01, "serviceability: solver vs analytical");

    // Verify deflection is within limit
    assert!(
        tip.ux.abs() < delta_limit,
        "serviceability: tip deflection {:.4} m exceeds H/200 = {:.4} m",
        tip.ux.abs(), delta_limit
    );

    // Verify base reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -p, 0.01, "serviceability: base Rx");
    assert_close(r1.my.abs(), p * h, 0.01, "serviceability: base Mz");

    // Now verify with Iz exactly at minimum: deflection should be ~= H/200
    let nodes2: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * dz))
        .collect();
    let elems2: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups2 = vec![(1, 1, "fixed")];
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1,
        fx: p,
        fz: 0.0,
        my: 0.0,
    })];
    let input2 = make_input(
        nodes2,
        vec![(1, e, 0.3)],
        vec![(1, a, iz_min)],
        elems2,
        sups2,
        loads2,
    );
    let results2 = linear::solve_2d(&input2).unwrap();
    let tip2 = results2.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip2.ux.abs(), delta_limit, 0.01, "serviceability: at-limit Iz gives H/200");
}
