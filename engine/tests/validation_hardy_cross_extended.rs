/// Validation: Hardy Cross Moment Distribution — Extended Benchmarks
///
/// References:
///   - Cross, H. "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", 4th Ed.
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed.
///
/// Tests extend the original Hardy Cross validation with additional moment
/// distribution scenarios:
///   1. Five-span equal UDL: classical five-span continuous beam solution
///   2. Two-span with different span loads: asymmetric UDL loading
///   3. Propped cantilever with midspan point load: M_fixed = 3PL/16
///   4. Fixed-fixed beam with UDL: M_end = wL²/12
///   5. Three-span with center span point load: load on interior span only
///   6. Portal frame combined lateral + gravity loading
///   7. Two-span with overhang: cantilever extending beyond last support
///   8. Four-span with alternating heavy/light loading pattern
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Five-Span Equal, UDL: Classical Solution
// ================================================================
//
// Five equal spans, pinned ends, UDL on all spans.
// From solving the five-span three-moment equations simultaneously:
//   4M₁ + M₂ = -wL²/2               ...(i)
//   M₁ + 4M₂ + M₃ = -wL²/2          ...(ii)
//   M₂ + 4M₃ + M₄ = -wL²/2          ...(iii)   [by symmetry M₂=M₄, M₁=M₅ (nonexistent)]
//   ⇒ Actually for 5 spans with 4 interior supports:
//   By symmetry: M₁ = M₄, M₂ = M₃
//   From (i): 4M₁ + M₂ = -wL²/2
//   From (ii): M₁ + 4M₂ + M₂ = -wL²/2  (using M₃=M₂)  → M₁ + 5M₂ = -wL²/2
//   Subtract: 3M₁ - 4M₂ = 0 → M₁ = 4M₂/3
//   Substituting: 16M₂/3 + M₂ = -wL²/2 → 19M₂/3 = -wL²/2
//   M₂ = -3wL²/38, M₁ = -4wL²/38 = -2wL²/19
//
// Verify equilibrium and symmetry.

#[test]
fn validation_hardy_cross_ext_five_span_equal_udl() {
    let l = 5.0;
    let n_per_span = 4;
    let q: f64 = -10.0;
    let w: f64 = q.abs();

    let total_elems = n_per_span * 5;
    let mut loads = Vec::new();
    for i in 0..total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M₁ = 2wL²/19 (magnitude at first interior support)
    let m1_exact = 2.0 * w * l * l / 19.0;
    // M₂ = 3wL²/38 (magnitude at second interior support)
    let m2_exact = 3.0 * w * l * l / 38.0;

    // First interior support at node n_per_span+1
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef1.m_end.abs(), m1_exact, 0.05,
        "Five-span M₁ = 2wL²/19");

    // Second interior support at node 2*n_per_span+1
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    assert_close(ef2.m_end.abs(), m2_exact, 0.05,
        "Five-span M₂ = 3wL²/38");

    // By symmetry: M₁ = M₄ and M₂ = M₃
    let ef4 = results.element_forces.iter()
        .find(|f| f.element_id == 4 * n_per_span).unwrap();
    let ef3 = results.element_forces.iter()
        .find(|f| f.element_id == 3 * n_per_span).unwrap();
    assert_close(ef4.m_end.abs(), ef1.m_end.abs(), 0.03,
        "Five-span symmetry M₁=M₄");
    assert_close(ef3.m_end.abs(), ef2.m_end.abs(), 0.03,
        "Five-span symmetry M₂=M₃");

    // Equilibrium: total reactions = total load
    let total_load = w * 5.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Five-span equilibrium");
}

// ================================================================
// 2. Two-Span with Different Span Loads
// ================================================================
//
// Two equal spans L, span 1 with UDL w₁, span 2 with UDL w₂.
// From the three-moment equation for pinned-roller-roller:
//   2M_B(L+L) = -(w₁L³/4 + w₂L³/4)
//   4M_B·L = -L³(w₁+w₂)/4
//   M_B = -L²(w₁+w₂)/16
//
// With w₁=10, w₂=20, L=6:
//   M_B = 36×30/16 = 67.5

#[test]
fn validation_hardy_cross_ext_two_span_different_loads() {
    let l = 6.0;
    let n_per_span = 4;
    let q1: f64 = -10.0;
    let q2: f64 = -20.0;
    let w1: f64 = q1.abs();
    let w2: f64 = q2.abs();

    let mut loads = Vec::new();
    // Span 1: elements 1..n_per_span
    for i in 0..n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q1, q_j: q1, a: None, b: None,
        }));
    }
    // Span 2: elements n_per_span+1..2*n_per_span
    for i in n_per_span..(2 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q2, q_j: q2, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B = L²(w₁+w₂)/16
    let m_exact = l * l * (w1 + w2) / 16.0;

    let ef = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    assert_close(ef.m_end.abs(), m_exact, 0.05,
        "Two-span different loads M_B = L²(w₁+w₂)/16");

    // Equilibrium: total load = w₁L + w₂L
    let total_load = (w1 + w2) * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Two-span different loads equilibrium");
}

// ================================================================
// 3. Propped Cantilever with Midspan Point Load
// ================================================================
//
// Fixed at left, roller at right, point load P at midspan.
// Reference: Hibbeler, Structural Analysis, Table inside back cover
//   M_fixed = 3PL/16  (hogging at fixed end)
//   R_roller = 5P/16
//   R_fixed = 11P/16

#[test]
fn validation_hardy_cross_ext_propped_cantilever_point_load() {
    let l = 8.0;
    let n = 8;
    let p = 40.0;

    // Point load at midspan node
    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = 3PL/16
    let m_fixed_exact = 3.0 * p * l / 16.0;
    let r_fixed = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_fixed.mz.abs(), m_fixed_exact, 0.05,
        "Propped cantilever point load M_fixed = 3PL/16");

    // R_roller = 5P/16
    let r_roller_exact = 5.0 * p / 16.0;
    let r_roller = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_roller.ry, r_roller_exact, 0.05,
        "Propped cantilever point load R_roller = 5P/16");

    // R_fixed_y = 11P/16
    let r_fixed_y_exact = 11.0 * p / 16.0;
    assert_close(r_fixed.ry, r_fixed_y_exact, 0.05,
        "Propped cantilever point load R_fixed = 11P/16");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Propped cantilever point load equilibrium");
}

// ================================================================
// 4. Fixed-Fixed Beam with UDL
// ================================================================
//
// Both ends fixed, uniform load q.
// Reference: Any structural analysis textbook (e.g., Hibbeler Ch. 12)
//   M_end = wL²/12  (hogging at both ends)
//   R = wL/2  (each end, by symmetry)
//   Midspan moment = wL²/24  (sagging)

#[test]
fn validation_hardy_cross_ext_fixed_fixed_udl() {
    let l = 10.0;
    let n = 8;
    let q: f64 = -15.0;
    let w = q.abs();

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments = wL²/12
    let m_end_exact = w * l * l / 12.0;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_left.mz.abs(), m_end_exact, 0.03,
        "Fixed-fixed UDL M_left = wL²/12");
    assert_close(r_right.mz.abs(), m_end_exact, 0.03,
        "Fixed-fixed UDL M_right = wL²/12");

    // Reactions: R = wL/2 each
    let r_exact = w * l / 2.0;
    assert_close(r_left.ry, r_exact, 0.03,
        "Fixed-fixed UDL R_left = wL/2");
    assert_close(r_right.ry, r_exact, 0.03,
        "Fixed-fixed UDL R_right = wL/2");

    // Symmetry of moments
    let diff_m: f64 = (r_left.mz.abs() - r_right.mz.abs()).abs();
    assert!(diff_m < m_end_exact * 0.02,
        "Fixed-fixed moment symmetry: M_left={:.4}, M_right={:.4}",
        r_left.mz.abs(), r_right.mz.abs());
}

// ================================================================
// 5. Three-Span with Center Span Point Load Only
// ================================================================
//
// Three equal spans, point load P at midspan of span 2 only.
// By symmetry (load centered on center span): M₁ = M₂.
//
// From three-moment equation (Kassimali, "Structural Analysis", 6th Ed.):
//   At support 1: M₀·L + 2M₁(2L) + M₂·L = -6·A₂·ā₂/L
//   At support 2: M₁·L + 2M₂(2L) + M₃·L = -6·A₂·b̄₂/L
//   where M₀=M₃=0 (simple supports at ends).
//
//   For P at midspan of span 2: the simply-supported BMD is a triangle
//   with peak PL/4. Area A₂ = PL²/8.
//   By symmetry ā₂ = b̄₂ = L/2, so 6·A₂·ā₂/L = 6·(PL²/8)·(L/2)/L = 3PL/8.
//   However, span 1 is unloaded (contributes 0 to eq at support 1), and
//   span 2's contribution appears in eq at support 1 from the right side.
//
//   The full three-moment equation at support 1:
//     4L·M₁ + L·M₂ = -3PL/8   ...(i)
//   At support 2 (by symmetry, same as (i)):
//     L·M₁ + 4L·M₂ = -3PL/8   ...(ii)
//   By symmetry M₁=M₂: 5L·M₁ = -3PL/8 → |M₁| = 3P/(8·5) = 3P/40
//   So M₁ = M₂ = 3PL/40 (Note: this differs from the simpler PL/20 estimate
//   because the centroid-based calculation must be done carefully.)

#[test]
fn validation_hardy_cross_ext_three_span_center_point_load() {
    let l = 6.0;
    let n_per_span = 4;
    let p = 30.0;

    // Point load at midspan of span 2: node at n_per_span + n_per_span/2 + 1
    let mid_node = n_per_span + n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry, interior moments must be equal
    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();

    assert_close(ef1.m_end.abs(), ef2.m_end.abs(), 0.05,
        "Three-span center load symmetry M₁=M₂");

    // M₁ = 3PL/40 from the three-moment equation (see derivation above)
    let m_exact = 3.0 * p * l / 40.0;
    assert_close(ef1.m_end.abs(), m_exact, 0.05,
        "Three-span center point load M = 3PL/40");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Three-span center load equilibrium");
}

// ================================================================
// 6. Portal Frame: Combined Lateral + Gravity Loading
// ================================================================
//
// Portal frame with fixed bases, lateral load H at top-left and
// gravity load W at each beam-column joint.
// Verify global equilibrium in all three equations:
//   ΣFx = 0, ΣFy = 0, ΣM = 0

#[test]
fn validation_hardy_cross_ext_portal_combined_loading() {
    let h = 4.0;
    let w_span = 6.0;
    let p_lat = 15.0;
    let p_grav = -25.0; // downward

    let input = make_portal_frame(h, w_span, E, A, IZ, p_lat, p_grav);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: ΣRx + H = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p_lat, 0.02,
        "Portal combined: horizontal equilibrium ΣRx = -H");

    // Vertical equilibrium: ΣRy + 2W = 0  (two gravity loads applied)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_grav = 2.0 * p_grav; // negative (downward)
    assert_close(sum_ry, -total_grav, 0.02,
        "Portal combined: vertical equilibrium ΣRy = -2W");

    // Moment equilibrium about left base (node 1 at origin (0,0)):
    // Using cross product convention: M = x*fy - y*fx for each force.
    //
    // Applied loads:
    //   Node 2 at (0, h): fx=H, fy=W  -> M = 0*W - h*H
    //   Node 3 at (w, h): fx=0, fy=W  -> M = w*W - h*0
    //
    // Reactions at node 1 (0,0) and node 4 (w,0):
    //   Node 1: M = 0*ry1 - 0*rx1 + mz1 = mz1
    //   Node 4: M = w*ry4 - 0*rx4 + mz4 = w*ry4 + mz4
    //
    // Equilibrium: m_applied + m_reaction = 0
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    let m_applied = 0.0 * p_grav - h * p_lat + w_span * p_grav - h * 0.0;

    // Reactions: node 1 (0,0): mz only; node 4 (w,0): mz + x*ry
    let m_reaction = r_left.mz + r_right.mz + w_span * r_right.ry;

    let residual: f64 = (m_applied + m_reaction).abs();
    let scale: f64 = (p_lat * h).abs().max((p_grav * w_span).abs());
    assert!(residual < scale * 0.02,
        "Portal combined: moment equilibrium residual = {:.6}, scale = {:.2}",
        residual, scale);
}

// ================================================================
// 7. Two-Span with Overhang (Cantilever Extension)
// ================================================================
//
// Beam: pinned at A, roller at B (span L₁), then cantilever BC of length a.
// Point load P at tip C.
//
// Reference: Hibbeler, "Structural Analysis", cantilever overhang problems
//   The cantilever moment at B = P × a  (known from statics)
//   Reaction at A: R_A = -P × a / L₁  (upward if P downward, sign depends)
//   Reaction at B: R_B = P + P×a/L₁ = P(1 + a/L₁) = P(L₁+a)/L₁
//
// We model this with make_beam: pinned at node 1, rollerX at interior node,
// no support at the end (free tip).

#[test]
fn validation_hardy_cross_ext_two_span_overhang() {
    let l1 = 6.0;  // main span
    let a = 2.0;   // overhang length
    let total_l = l1 + a;
    let n = 8; // total elements
    let p = 20.0;

    // We need a custom setup: pinned at node 1, rollerX at the node
    // corresponding to x = l1, free at end.
    let n_nodes = n + 1;
    let elem_len = total_l / n as f64;

    let nodes: Vec<(usize, f64, f64)> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Find the node closest to x = l1
    let support_b_node = (l1 / elem_len).round() as usize + 1;

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, support_b_node, "rollerX"),
    ];

    // Point load at tip (last node)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n_nodes, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // The actual distance from node 1 to support B
    let x_b: f64 = (support_b_node as f64 - 1.0) * elem_len;
    let overhang_actual = total_l - x_b;

    // R_A = -P × overhang / x_b  (negative = downward reaction at A)
    let r_a_exact = -p * overhang_actual / x_b;
    // R_B = P + P × overhang / x_b = P × (x_b + overhang) / x_b
    let r_b_exact = p * (x_b + overhang_actual) / x_b;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == support_b_node).unwrap();

    assert_close(r_a.ry, r_a_exact, 0.05,
        "Overhang R_A = -Pa/L₁");
    assert_close(r_b.ry, r_b_exact, 0.05,
        "Overhang R_B = P(L₁+a)/L₁");

    // Equilibrium: ΣRy = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Overhang equilibrium");

    // Moment at B = P × overhang (hogging)
    // Check element ending at B
    let elem_at_b = support_b_node - 1; // element ending at support B
    let ef_b = results.element_forces.iter()
        .find(|f| f.element_id == elem_at_b).unwrap();
    let m_b_exact = p * overhang_actual;
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.05,
        "Overhang moment at B = Pa");
}

// ================================================================
// 8. Four-Span with Alternating Heavy/Light Loading
// ================================================================
//
// Four equal spans, alternating UDL pattern: heavy-light-heavy-light.
// This pattern produces maximum positive moments in loaded spans.
// Verify equilibrium and that loaded spans have larger support moments
// than unloaded spans' contributions.

#[test]
fn validation_hardy_cross_ext_four_span_alternating_load() {
    let l = 5.0;
    let n_per_span = 4;
    let q_heavy = -20.0;
    let q_light = -5.0;

    let mut loads = Vec::new();
    for span_idx in 0..4_usize {
        let q = if span_idx % 2 == 0 { q_heavy } else { q_light };
        for j in 0..n_per_span {
            let elem_id = span_idx * n_per_span + j + 1;
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: elem_id, q_i: q, q_j: q, a: None, b: None,
            }));
        }
    }

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total applied load
    let w_heavy = q_heavy.abs();
    let w_light = q_light.abs();
    let total_load = (w_heavy + w_light) * 2.0 * l; // two heavy + two light spans

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Four-span alternating: equilibrium");

    // The pattern is symmetric about the center (heavy-light-heavy-light is NOT
    // symmetric, but heavy-light | light-heavy would be). Let's verify that
    // M₁ and M₃ are related by the antisymmetric loading pattern.
    // Actually, the load pattern [H, L, H, L] has a specific asymmetry.
    // We just verify all interior moments are non-trivial and check equilibrium.

    let ef1 = results.element_forces.iter()
        .find(|f| f.element_id == n_per_span).unwrap();
    let ef2 = results.element_forces.iter()
        .find(|f| f.element_id == 2 * n_per_span).unwrap();
    let ef3 = results.element_forces.iter()
        .find(|f| f.element_id == 3 * n_per_span).unwrap();

    // All interior moments should be non-zero (hogging)
    assert!(ef1.m_end.abs() > 1.0,
        "Four-span alternating M₁ should be non-trivial: {:.4}", ef1.m_end);
    assert!(ef2.m_end.abs() > 1.0,
        "Four-span alternating M₂ should be non-trivial: {:.4}", ef2.m_end);
    assert!(ef3.m_end.abs() > 1.0,
        "Four-span alternating M₃ should be non-trivial: {:.4}", ef3.m_end);

    // For a uniform loading of intensity w_avg = (w_heavy+w_light)/2 on all spans,
    // the four-span solution gives M₁=M₃=3wL²/28, M₂=wL²/14.
    // Our alternating pattern should produce moments in the same ballpark.
    let w_avg = (w_heavy + w_light) / 2.0;
    let m1_uniform = 3.0 * w_avg * l * l / 28.0;
    let m2_uniform = w_avg * l * l / 14.0;

    // Verify moments are within a factor of 2 of the uniform case
    // (alternating loading redistributes, but shouldn't be wildly different)
    assert!(ef1.m_end.abs() < 2.0 * m1_uniform && ef1.m_end.abs() > 0.3 * m1_uniform,
        "Four-span alternating M₁={:.4} near uniform 3wL²/28={:.4}",
        ef1.m_end.abs(), m1_uniform);
    assert!(ef2.m_end.abs() < 2.0 * m2_uniform && ef2.m_end.abs() > 0.3 * m2_uniform,
        "Four-span alternating M₂={:.4} near uniform wL²/14={:.4}",
        ef2.m_end.abs(), m2_uniform);
    assert!(ef3.m_end.abs() < 2.0 * m1_uniform && ef3.m_end.abs() > 0.3 * m1_uniform,
        "Four-span alternating M₃={:.4} near uniform 3wL²/28={:.4}",
        ef3.m_end.abs(), m1_uniform);
}
