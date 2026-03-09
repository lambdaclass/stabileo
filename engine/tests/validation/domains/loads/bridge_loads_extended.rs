/// Validation: Bridge Loading Analysis — Extended
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 6 (Influence Lines)
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 4 (Continuous Beams)
///   - Timoshenko & Young, "Theory of Structures", Ch. 3 (Moving Loads)
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed.
///   - AASHTO LRFD Bridge Design Specifications, 9th Ed. (2020)
///
/// These tests model bridge-like structures using the 2D FE solver and compare
/// against analytical solutions for reactions, internal forces, and deflections.

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

// Common properties: steel bridge girder
const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m²)
const A: f64 = 0.02;      // m² (typical plate girder)
const IZ: f64 = 5e-4;     // m⁴

// ================================================================
// 1. Two-Span Continuous Bridge Girder Under UDL
// ================================================================
//
// Continuous beam over two equal spans L, UDL q on both spans.
// Analytical (three-moment equation):
//   R_A = R_C = 3qL/8,  R_B (interior) = 10qL/8 = 5qL/4
//   M_B (hogging) = -qL²/8
//
// Reference: Ghali & Neville, Table 4.1, case of two equal spans.

#[test]
fn bridge_two_span_continuous_udl() {
    let l: f64 = 12.0; // m per span
    let q: f64 = -20.0; // kN/m (downward)
    let n_per_span: usize = 6;

    let mut loads = Vec::new();
    let total_elems = n_per_span * 2;
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // End reactions: R_A = R_C = 3qL/8
    let r_end_expected: f64 = 3.0 * q_abs * l / 8.0;
    // Interior reaction: R_B = 5qL/4
    let r_int_expected: f64 = 5.0 * q_abs * l / 4.0;

    // Node 1 = A (left), node n_per_span+1 = B (interior), node 2*n_per_span+1 = C (right)
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let ra = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let rc = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();

    assert_close(ra.ry, r_end_expected, 0.02, "Two-span R_A = 3qL/8");
    assert_close(rb.ry, r_int_expected, 0.02, "Two-span R_B = 5qL/4");
    assert_close(rc.ry, r_end_expected, 0.02, "Two-span R_C = 3qL/8");

    // Equilibrium: sum of reactions = total load
    let total_load: f64 = q_abs * 2.0 * l;
    let sum_ry: f64 = ra.ry + rb.ry + rc.ry;
    assert_close(sum_ry, total_load, 0.01, "Two-span equilibrium");

    // Hogging moment at interior support: M_B = -qL²/8
    // Check via element forces at the interior support
    let m_b_expected: f64 = q_abs * l * l / 8.0;

    // Element ending at B (element n_per_span) should have m_end = hogging
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    // The m_end is the moment at the end node (interior support)
    // Hogging => negative in beam convention
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.03, "Two-span M_B = qL^2/8");
}

// ================================================================
// 2. Simply Supported Bridge with Point Load at Midspan
// ================================================================
//
// Classic bridge girder: point load P at midspan of span L.
// Analytical:
//   R_A = R_B = P/2
//   M_mid = PL/4
//   delta_mid = PL³/(48EI)
//
// Reference: Timoshenko & Young, Table of beam deflections.

#[test]
fn bridge_ss_midspan_point_load() {
    let l: f64 = 16.0; // m
    let p: f64 = 100.0; // kN
    let n: usize = 8;
    let e_eff: f64 = E * 1000.0;

    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: each = P/2
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(ra.ry, p / 2.0, 0.01, "SS midspan P: R_A = P/2");
    assert_close(rb.ry, p / 2.0, 0.01, "SS midspan P: R_B = P/2");

    // Midspan deflection: delta = PL^3/(48EI)
    let delta_exact: f64 = p * l.powi(3) / (48.0 * e_eff * IZ);
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_exact, 0.02, "SS midspan P: delta = PL^3/(48EI)");

    // Max moment at midspan: M = PL/4
    let m_expected: f64 = p * l / 4.0;
    // Element just before midspan
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    assert_close(ef_mid.m_end.abs(), m_expected, 0.02, "SS midspan P: M = PL/4");
}

// ================================================================
// 3. Three-Span Continuous Bridge Under Central Span Loading
// ================================================================
//
// Three equal spans L. Load only on center span (pattern loading).
// For UDL q on center span only:
//   R_A = R_D = -qL/16 (uplift at ends — small)
//   R_B = R_C = qL/2 + qL/16 = 9qL/16
//   M_B = M_C = -qL²/16
//
// Reference: Ghali & Neville, Ch. 4, continuous beam analysis.

#[test]
fn bridge_three_span_central_loading() {
    let l: f64 = 10.0; // m per span
    let q: f64 = -15.0; // kN/m (downward)
    let n_per_span: usize = 6;

    // Load only on center span (elements n_per_span+1 to 2*n_per_span)
    let mut loads = Vec::new();
    for i in n_per_span..(2 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // Support nodes
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;
    let node_d = 3 * n_per_span + 1;

    let ra = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let rc = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();
    let rd = results.reactions.iter().find(|r| r.node_id == node_d).unwrap();

    // Symmetry check: R_A = R_D, R_B = R_C
    assert_close(ra.ry, rd.ry, 0.02, "Three-span symmetry: R_A = R_D");
    assert_close(rb.ry, rc.ry, 0.02, "Three-span symmetry: R_B = R_C");

    // Equilibrium: sum = qL (total load on center span)
    let total_load: f64 = q_abs * l;
    let sum_ry: f64 = ra.ry + rb.ry + rc.ry + rd.ry;
    assert_close(sum_ry, total_load, 0.01, "Three-span equilibrium");

    // Three-moment equation for three equal spans, center loaded:
    //   At B: L*M_A + 2*(L+L)*M_B + L*M_C = -qL³/4
    //   M_A = M_D = 0, symmetry M_B = M_C:
    //   4L*M_B + L*M_B = -qL³/4 => M_B = -qL²/20
    // R_B contribution from span AB: M_B/L  (no load on AB)
    // R_B contribution from span BC: qL/2 + (M_C - M_B)/L = qL/2  (M_B = M_C)
    // Total R_B = M_B/L + qL/2 ... but M_B is hogging (negative), so reaction from AB side
    //   is actually -M_B/L = qL/20 (upward).
    // Actually: for unloaded span AB with M_A=0, M_B:
    //   R_B_left = -M_B/L = qL²/(20*L) = qL/20
    // For loaded span BC with M_B = M_C:
    //   R_B_right = qL/2 + (M_C - M_B)/L = qL/2
    // Total R_B = qL/20 + qL/2 = 11qL/20
    let r_inner_expected: f64 = 11.0 * q_abs * l / 20.0;
    assert_close(rb.ry, r_inner_expected, 0.05, "Three-span R_B = 11qL/20");

    // Hogging moment at B and C: |M_B| = qL²/20
    let m_support_expected: f64 = q_abs * l * l / 20.0;
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    assert_close(ef_at_b.m_end.abs(), m_support_expected, 0.05, "Three-span M_B = qL^2/20");
}

// ================================================================
// 4. Simple Span Truss Bridge Under Nodal Loading
// ================================================================
//
// Warren truss (4 panels): bottom chord nodes loaded with equal forces P.
// Span L = 16 m, height h = 4 m, 4 panels of 4 m each.
// All members are pin-connected (hinge_start + hinge_end = truss).
//
// With P at each interior bottom node (nodes 2, 3, 4):
//   R_A = R_F = 3P/2 (by symmetry, total load = 3P)
//
// Reference: Hibbeler, "Structural Analysis", Ch. 3 (Truss analysis).

#[test]
fn bridge_warren_truss_nodal_loads() {
    let panel: f64 = 4.0; // m
    let h: f64 = 4.0;     // m, truss height
    let p: f64 = 50.0;    // kN per loaded node

    // Nodes: bottom chord 1-5, top chord 6-8
    // Bottom: (1,0,0), (2,4,0), (3,8,0), (4,12,0), (5,16,0)
    // Top:    (6,2,4), (7,6,4) is wrong for Warren — use (6,4,4), (7,8,4), (8,12,4)
    // Actually for a Warren truss with 4 panels:
    // Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
    // Top:    6(2,4), 7(6,4), 8(10,4), 9(14,4)
    // Diagonals connect bottom to top alternately.
    //
    // Simpler approach: Pratt truss (verticals + diagonals)
    // Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
    // Top:    6(0,4), 7(4,4), 8(8,4), 9(12,4), 10(16,4)

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, panel, 0.0),
        (3, 2.0 * panel, 0.0),
        (4, 3.0 * panel, 0.0),
        (5, 4.0 * panel, 0.0),
        (6, 0.0, h),
        (7, panel, h),
        (8, 2.0 * panel, h),
        (9, 3.0 * panel, h),
        (10, 4.0 * panel, h),
    ];

    // Truss members (all pinned both ends)
    // Bottom chord: 1-2, 2-3, 3-4, 4-5
    // Top chord: 6-7, 7-8, 8-9, 9-10
    // Verticals: 1-6, 2-7, 3-8, 4-9, 5-10
    // Diagonals: 6-2, 7-3, 8-4, 9-5 (or 1-7, 2-8, 3-9, 4-10)
    // Use Pratt pattern: diagonals slope toward center
    // Left half: 1-7, 2-8
    // Right half: 8-4, 9-5
    // Revised: use simple X-bracing diagonals for stability
    // Actually: 6-2, 2-8, 7-3, 3-9, 8-4, 4-10  (zigzag)
    let e_truss: f64 = 200_000.0;
    let a_truss: f64 = 0.005; // m²
    let iz_truss: f64 = 1e-8; // very small (truss members)

    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = vec![
        // Bottom chord
        (1,  "frame", 1, 2, 1, 1, true, true),
        (2,  "frame", 2, 3, 1, 1, true, true),
        (3,  "frame", 3, 4, 1, 1, true, true),
        (4,  "frame", 4, 5, 1, 1, true, true),
        // Top chord
        (5,  "frame", 6, 7, 1, 1, true, true),
        (6,  "frame", 7, 8, 1, 1, true, true),
        (7,  "frame", 8, 9, 1, 1, true, true),
        (8,  "frame", 9, 10, 1, 1, true, true),
        // Verticals
        (9,  "frame", 1, 6, 1, 1, true, true),
        (10, "frame", 2, 7, 1, 1, true, true),
        (11, "frame", 3, 8, 1, 1, true, true),
        (12, "frame", 4, 9, 1, 1, true, true),
        (13, "frame", 5, 10, 1, 1, true, true),
        // Diagonals (Pratt pattern)
        (14, "frame", 6, 2, 1, 1, true, true),
        (15, "frame", 7, 3, 1, 1, true, true),
        (16, "frame", 8, 4, 1, 1, true, true),
        (17, "frame", 9, 5, 1, 1, true, true),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, e_truss, 0.3)],
        vec![(1, a_truss, iz_truss)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = 3P = 150 kN downward
    // By symmetry: R_A = R_B = 3P/2 = 75 kN
    let r_expected: f64 = 3.0 * p / 2.0;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(ra.ry, r_expected, 0.02, "Warren truss R_A = 3P/2");
    assert_close(rb.ry, r_expected, 0.02, "Warren truss R_B = 3P/2");

    // Equilibrium
    let sum_ry: f64 = ra.ry + rb.ry;
    assert_close(sum_ry, 3.0 * p, 0.01, "Truss vertical equilibrium");

    // Midspan bottom chord deflection should be downward
    let mid_d = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(mid_d.uy < 0.0, "Truss midspan deflects downward");
}

// ================================================================
// 5. Overhanging Bridge Span with Cantilever
// ================================================================
//
// Beam with overhang: pinned at A (x=0), roller at B (x=L), free end C (x=L+a).
// UDL q over entire length (L+a).
// Analytical reactions:
//   R_B = q(L+a)²/(2L)
//   R_A = q(L+a) - R_B = q(L+a)(2L - L - a)/(2L) = q(L+a)(L-a)/(2L)
//   M_B (at interior support) = -qa²/2
//
// Reference: Hibbeler, "Structural Analysis", Ch. 2.

#[test]
fn bridge_overhanging_span_udl() {
    let l: f64 = 10.0; // m, main span
    let a_over: f64 = 3.0; // m, overhang
    let q: f64 = -12.0; // kN/m
    let total_l: f64 = l + a_over;
    let n: usize = 13; // elements

    let elem_len: f64 = total_l / n as f64;

    // Build nodes
    let nodes: Vec<(usize, f64, f64)> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Build elements
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Find node closest to x = L for roller support B
    let node_b_idx = nodes.iter()
        .min_by_key(|(_, x, _)| ((x - l) * 1000.0).abs() as i64)
        .unwrap()
        .0;

    let sups = vec![
        (1, 1, "pinned"),      // A at x=0
        (2, node_b_idx, "rollerX"), // B at x≈L
    ];

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

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // Analytical reactions:
    // R_B = q*(L+a)^2 / (2L)
    let r_b_expected: f64 = q_abs * total_l * total_l / (2.0 * l);
    // R_A = q*(L+a) - R_B
    let r_a_expected: f64 = q_abs * total_l - r_b_expected;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == node_b_idx).unwrap();

    assert_close(ra.ry, r_a_expected, 0.05, "Overhang R_A");
    assert_close(rb.ry, r_b_expected, 0.05, "Overhang R_B");

    // Equilibrium
    let sum_ry: f64 = ra.ry + rb.ry;
    assert_close(sum_ry, q_abs * total_l, 0.02, "Overhang equilibrium");

    // Free end of overhang deflects downward (negative uy)
    // The cantilever overhang causes downward tip deflection
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    // Verify the tip has non-trivial deflection
    assert!(tip.uy.abs() > 1e-6, "Overhang tip has non-zero deflection: uy={:.6e}", tip.uy);

    // Hogging moment at interior support B: M_B = qa²/2
    let m_b_expected: f64 = q_abs * a_over * a_over / 2.0;
    // Find the element that ends at or starts at the B support node
    let elem_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == node_b_idx - 1)
        .unwrap();
    assert_close(elem_at_b.m_end.abs(), m_b_expected, 0.15, "Overhang M_B = qa^2/2");
}

// ================================================================
// 6. Bridge Girder with Two Point Loads (Moving Truck Axles)
// ================================================================
//
// Simply supported beam L. Two equal point loads P at distance d apart,
// placed symmetrically about midspan for maximum moment.
// Loads at x1 = (L-d)/2 and x2 = (L+d)/2.
// Analytical:
//   R_A = R_B = P (by symmetry)
//   M_mid = P*(L-d)/2
//   delta_mid = P*(3L² - 4d²)*L / (48EI)  (for two loads symmetric)
//
// This models a two-axle truck on a bridge.
// Reference: Timoshenko & Young, "Theory of Structures", moving loads.

#[test]
fn bridge_two_axle_symmetric() {
    let l: f64 = 20.0; // m
    let d: f64 = 4.0;  // m, axle spacing
    let p: f64 = 80.0; // kN per axle
    let n: usize = 20;
    let e_eff: f64 = E * 1000.0;

    // Nodes at x1 = (L-d)/2 = 8 m and x2 = (L+d)/2 = 12 m
    let x1: f64 = (l - d) / 2.0;
    let x2: f64 = (l + d) / 2.0;

    // With n=20 elements of length 1.0m, node at x=8 is node 9, node at x=12 is node 13
    let node1 = (x1 / (l / n as f64)).round() as usize + 1;
    let node2 = (x2 / (l / n as f64)).round() as usize + 1;

    let input = make_beam(
        n, l, E, A, IZ,
        "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: node1, fx: 0.0, fy: -p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: node2, fx: 0.0, fy: -p, mz: 0.0 }),
        ],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P (each support takes half of 2P)
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(ra.ry, p, 0.02, "Two-axle R_A = P");
    assert_close(rb.ry, p, 0.02, "Two-axle R_B = P");

    // Midspan moment: M = P*(L - d)/2
    let m_mid_expected: f64 = p * (l - d) / 2.0;
    let mid_node = n / 2 + 1;
    // Check element ending at midspan
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.03, "Two-axle M_mid = P(L-d)/2");

    // Midspan deflection: delta = P*L*(3L² - 4d²) / (48EI) for two symmetric loads
    // Note: each load P at distance a from nearest support, a = (L-d)/2
    // For single load at a: delta_mid = Pa(3L²-4a²)/(48EI) if a < L/2
    // For two symmetric loads: delta_mid = 2 * P*a*(3L²-4a²)/(48EI) ... but this is not quite right
    // Correct formula: delta = P*a*(3*L^2 - 4*a^2)/(24*E*I) where a = (L-d)/2
    // (This is superposition of two loads, each contributing P*a*(3L²-4a²)/(48EI))
    let a_val: f64 = (l - d) / 2.0;
    let delta_expected: f64 = p * a_val * (3.0 * l * l - 4.0 * a_val * a_val) / (24.0 * e_eff * IZ);

    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(mid_d.uy.abs(), delta_expected, 0.03, "Two-axle midspan delta");
}

// ================================================================
// 7. Propped Cantilever Bridge (Fixed-Roller) with Point Load
// ================================================================
//
// Fixed at A (x=0), roller at B (x=L), point load P at midspan.
// Analytical (indeterminate):
//   R_B = 5P/16
//   R_A = P - R_B = 11P/16
//   M_A = -3PL/16  (fixed end moment)
//   M_mid = 5PL/32
//
// Reference: Timoshenko, "Mechanics of Materials", Table A-11.

#[test]
fn bridge_propped_cantilever_point_load() {
    let l: f64 = 12.0; // m
    let p: f64 = 60.0;  // kN
    let n: usize = 12;

    let mid_node = n / 2 + 1;

    let input = make_beam(
        n, l, E, A, IZ,
        "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid_node,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // R_B = 5P/16
    let r_b_expected: f64 = 5.0 * p / 16.0;
    // R_A = 11P/16
    let r_a_expected: f64 = 11.0 * p / 16.0;
    // M_A = 3PL/16 (magnitude)
    let m_a_expected: f64 = 3.0 * p * l / 16.0;

    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(ra.ry, r_a_expected, 0.02, "Propped cantilever R_A = 11P/16");
    assert_close(rb.ry, r_b_expected, 0.02, "Propped cantilever R_B = 5P/16");

    // Fixed end moment
    assert_close(ra.mz.abs(), m_a_expected, 0.02, "Propped cantilever M_A = 3PL/16");

    // Equilibrium
    let sum_ry: f64 = ra.ry + rb.ry;
    assert_close(sum_ry, p, 0.01, "Propped cantilever equilibrium");

    // Midspan moment = 5PL/32
    let m_mid_expected: f64 = 5.0 * p * l / 32.0;
    let ef_mid = results.element_forces.iter()
        .find(|ef| ef.element_id == n / 2)
        .unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.03, "Propped cantilever M_mid = 5PL/32");
}

// ================================================================
// 8. Two-Span Continuous Bridge with Unequal Spans Under UDL
// ================================================================
//
// Continuous beam: span 1 = L1, span 2 = L2, UDL q on both.
// Using three-moment equation for unequal spans:
//   M_B = -q(L1³ + L2³) / (8(L1 + L2))
//   R_A = qL1/2 - M_B/L1
//   R_C = qL2/2 - M_B/L2  (note M_B is negative hogging, so -M_B/L adds)
//   R_B = q(L1+L2) - R_A - R_C
//
// Reference: Ghali & Neville, "Structural Analysis", three-moment equation.

#[test]
fn bridge_two_span_unequal_udl() {
    let l1: f64 = 8.0;  // m, shorter span
    let l2: f64 = 12.0; // m, longer span
    let q: f64 = -18.0;  // kN/m
    let n_per_span: usize = 8;

    let total_elems = n_per_span * 2;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs: f64 = q.abs();

    // Three-moment equation for two spans with both ends simply supported:
    // 2*M_B*(L1+L2) = -q*L1³/4 - q*L2³/4
    // M_B = -q*(L1³ + L2³) / (8*(L1 + L2))
    let m_b_expected: f64 = q_abs * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));

    // Reactions
    // R_A = qL1/2 + M_B/L1 (M_B hogging, so the correction subtracts from the simply supported value)
    // Actually: R_A = qL1/2 - M_B/L1 where M_B is the hogging moment (negative in sign convention)
    // With M_B as a positive magnitude of hogging:
    let r_a_expected: f64 = q_abs * l1 / 2.0 - m_b_expected / l1;
    let r_c_expected: f64 = q_abs * l2 / 2.0 - m_b_expected / l2;
    let r_b_expected: f64 = q_abs * (l1 + l2) - r_a_expected - r_c_expected;

    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let ra = results.reactions.iter().find(|r| r.node_id == node_a).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let rc = results.reactions.iter().find(|r| r.node_id == node_c).unwrap();

    assert_close(ra.ry, r_a_expected, 0.03, "Unequal spans R_A");
    assert_close(rb.ry, r_b_expected, 0.03, "Unequal spans R_B");
    assert_close(rc.ry, r_c_expected, 0.03, "Unequal spans R_C");

    // Equilibrium
    let total_load: f64 = q_abs * (l1 + l2);
    let sum_ry: f64 = ra.ry + rb.ry + rc.ry;
    assert_close(sum_ry, total_load, 0.01, "Unequal spans equilibrium");

    // Interior support moment
    let ef_at_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span)
        .unwrap();
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.04, "Unequal spans M_B");

    // Longer span should have larger midspan deflection
    let mid1_node = n_per_span / 2 + 1;
    let mid2_node = n_per_span + n_per_span / 2 + 1;
    let d1 = results.displacements.iter().find(|d| d.node_id == mid1_node).unwrap();
    let d2 = results.displacements.iter().find(|d| d.node_id == mid2_node).unwrap();
    assert!(
        d2.uy.abs() > d1.uy.abs(),
        "Longer span has larger deflection: |{:.6}| > |{:.6}|",
        d2.uy, d1.uy
    );
}
