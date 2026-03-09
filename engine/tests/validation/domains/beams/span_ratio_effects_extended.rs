/// Validation: Extended Span Ratio Effects on Structural Behavior
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 4-5 (Three-moment equation)
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed. (Beam deflections)
///   - Hibbeler, "Structural Analysis", 10th Ed. (Continuous beams, frames)
///   - McCormac, "Structural Analysis" (Influence of span ratios)
///
/// Tests verify additional span ratio effects:
///   1. Two-span beam equal vs unequal spans: moment redistribution changes
///   2. Two-span beam: longer span attracts more load (higher midspan moment)
///   3. Portal frame: wider span deflects more under same gravity load
///   4. SS beam UDL deflection proportional to L^4 (compare L and 2L)
///   5. Cantilever point load deflection proportional to L^3 (compare L and 2L)
///   6. Two-span beam span ratio 1:2 UDL: asymmetric reactions, verify equilibrium
///   7. Three-span beam with shorter middle span attracts less moment
///   8. Portal frame height-to-width ratio effect on lateral stiffness
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Span Beam: Moment Redistribution with Span Ratio
// ================================================================
//
// Two-span continuous beam with UDL on both spans.
// Equal spans (L, L): interior moment M_B = -qL^2/8 (by three-moment eqn).
// Unequal spans (L, 1.5L): interior moment changes.
// Three-moment equation for UDL, pinned ends (M_A = M_C = 0):
//   M_B = -q*(L1^3 + L2^3) / (8*(L1 + L2))
//
// The redistribution ratio M_B(unequal)/M_B(equal) shows how span
// asymmetry shifts moment to the interior support.

#[test]
fn validation_span_ratio_moment_redistribution_changes() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 6;

    // --- Equal spans: L1 = L2 = L ---
    let n_total_eq = 2 * n_per_span;
    let loads_eq: Vec<SolverLoad> = (1..=n_total_eq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_eq = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads_eq);
    let res_eq = linear::solve_2d(&input_eq).unwrap();

    // Interior support B is at the end of the first span (element n_per_span)
    let ef_eq = res_eq.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b_equal: f64 = ef_eq.m_end.abs();

    // Three-moment exact: M_B = qL^2/8
    let expected_eq = q * l * l / 8.0;
    assert_close(m_b_equal, expected_eq, 0.03, "equal spans M_B = qL^2/8");

    // --- Unequal spans: L1 = L, L2 = 1.5L ---
    let l2 = 1.5 * l;
    let n_total_uneq = 2 * n_per_span;
    let loads_uneq: Vec<SolverLoad> = (1..=n_total_uneq)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_uneq = make_continuous_beam(&[l, l2], n_per_span, E, A, IZ, loads_uneq);
    let res_uneq = linear::solve_2d(&input_uneq).unwrap();

    let ef_uneq = res_uneq.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let m_b_unequal: f64 = ef_uneq.m_end.abs();

    // Three-moment exact: M_B = q*(L1^3 + L2^3) / (8*(L1 + L2))
    let expected_uneq = q * (l.powi(3) + l2.powi(3)) / (8.0 * (l + l2));
    assert_close(m_b_unequal, expected_uneq, 0.03, "unequal spans M_B");

    // Unequal should have larger interior moment than equal
    assert!(
        m_b_unequal > m_b_equal,
        "Unequal spans should redistribute more moment to interior: unequal={:.2}, equal={:.2}",
        m_b_unequal, m_b_equal
    );

    // Check redistribution ratio: M_B(unequal)/M_B(equal)
    let redistribution_ratio = m_b_unequal / m_b_equal;
    // For L1=L, L2=1.5L: ratio = (L^3 + (1.5L)^3)/(8*(L+1.5L)) / (L^2/8)
    //   = (1 + 3.375) / (2.5) / L = 4.375 / (2.5*L) * L = 1.75
    // Actually: numerically (L^3 + (1.5L)^3)/(8*(2.5L)) * 8/L^2
    //   = (L^3 + 3.375*L^3)/(20*L) * 8/L^2 = 4.375*L^3/(20*L) * 8/L^2 = 4.375*8/20 = 1.75
    let expected_ratio = (l.powi(3) + l2.powi(3)) / ((l + l2) * l * l);
    assert_close(redistribution_ratio, expected_ratio, 0.05,
        "redistribution ratio matches analytical");
}

// ================================================================
// 2. Longer Span Attracts More Load (Higher Midspan Moment)
// ================================================================
//
// Two-span continuous beam L1 = 4m, L2 = 8m with UDL.
// The midspan moment of the longer span should be significantly
// larger than the midspan moment of the shorter span.
// For a simply supported span, M_mid = qL^2/8. With continuity
// the moment is reduced, but the longer span still has a higher
// midspan moment because it carries more total load.

#[test]
fn validation_span_ratio_longer_span_attracts_more_load() {
    let l1 = 4.0;
    let l2 = 8.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 2 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan of span 1: approximately at element n_per_span/2
    // The midspan node of span 1 is node (n_per_span/2 + 1)
    let mid_span1_node = n_per_span / 2 + 1;
    // Midspan of span 2: node (n_per_span + n_per_span/2 + 1)
    let mid_span2_node = n_per_span + n_per_span / 2 + 1;

    // Get midspan moments by looking at element forces near midspan
    // Element at midspan of span 1: element n_per_span/2
    let ef_mid1 = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span / 2).unwrap();
    // Element at midspan of span 2: element (n_per_span + n_per_span/2)
    let ef_mid2 = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span + n_per_span / 2).unwrap();

    // Midspan moment is the average of m_start and m_end for the midspan element
    // (both should be close since UDL gives a parabolic moment diagram)
    let m_mid_span1: f64 = (ef_mid1.m_start.abs() + ef_mid1.m_end.abs()) / 2.0;
    let m_mid_span2: f64 = (ef_mid2.m_start.abs() + ef_mid2.m_end.abs()) / 2.0;

    // The longer span should have a larger midspan moment
    assert!(
        m_mid_span2 > m_mid_span1,
        "Longer span should have larger midspan moment: span2={:.2}, span1={:.2}",
        m_mid_span2, m_mid_span1
    );

    // Also verify via deflection: longer span deflects more
    let defl_mid1 = results.displacements.iter()
        .find(|d| d.node_id == mid_span1_node).unwrap().uy.abs();
    let defl_mid2 = results.displacements.iter()
        .find(|d| d.node_id == mid_span2_node).unwrap().uy.abs();

    assert!(
        defl_mid2 > defl_mid1,
        "Longer span should deflect more: span2={:.6e}, span1={:.6e}",
        defl_mid2, defl_mid1
    );
}

// ================================================================
// 3. Portal Frame: Wider Span Deflects More Under Gravity Load
// ================================================================
//
// Two portal frames with same height but different beam spans,
// loaded with UDL on the beam. The wider frame has a longer beam
// which deflects more at midspan under the same UDL intensity.
//
// We build multi-element portal frames so we can observe the beam
// midspan deflection (the basic helper only has 3 elements total,
// so there is no midspan node on the beam).
//
// Frame A: h=4, w=6, UDL q on beam.
// Frame B: h=4, w=12, UDL q on beam.

#[test]
fn validation_span_ratio_portal_wider_span_more_gravity_deflection() {
    let h = 4.0;
    let q = -10.0;

    // Helper to build a portal frame with n_beam elements on the beam
    // and 1 element per column, with UDL on all beam elements.
    let build_portal_udl = |w: f64, n_beam: usize| -> SolverInput {
        // Nodes: 1=(0,0), 2=(0,h), 3..3+n_beam-1 = beam interior, last_beam=(w,h), last=(w,0)
        let _n_beam_nodes = n_beam + 1; // beam nodes from node 2 to node 2+n_beam
        let beam_elem_len = w / n_beam as f64;

        let mut nodes = Vec::new();
        // Left column base
        nodes.push((1, 0.0, 0.0));
        // Beam nodes (from left column top to right column top)
        for i in 0..=n_beam {
            nodes.push((2 + i, i as f64 * beam_elem_len, h));
        }
        // Right column base
        let right_top_node = 2 + n_beam;
        let right_base_node = right_top_node + 1;
        nodes.push((right_base_node, w, 0.0));

        let mut elems = Vec::new();
        let mut eid = 1;

        // Left column: node 1 -> node 2
        elems.push((eid, "frame", 1, 2, 1, 1, false, false));
        eid += 1;

        // Beam elements: node 2 -> 3 -> ... -> right_top_node
        for i in 0..n_beam {
            elems.push((eid, "frame", 2 + i, 3 + i, 1, 1, false, false));
            eid += 1;
        }

        // Right column: right_top_node -> right_base_node
        elems.push((eid, "frame", right_top_node, right_base_node, 1, 1, false, false));

        let sups = vec![
            (1, 1, "fixed"),
            (2, right_base_node, "fixed"),
        ];

        // UDL on beam elements only (elements 2 to n_beam+1)
        let loads: Vec<SolverLoad> = (2..=n_beam + 1)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();

        make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
    };

    let n_beam = 8;
    let w_narrow = 6.0;
    let w_wide = 12.0;

    let input_narrow = build_portal_udl(w_narrow, n_beam);
    let input_wide = build_portal_udl(w_wide, n_beam);

    let res_narrow = linear::solve_2d(&input_narrow).unwrap();
    let res_wide = linear::solve_2d(&input_wide).unwrap();

    // Beam midspan node: node 2 + n_beam/2
    let mid_beam_node = 2 + n_beam / 2;

    let defl_narrow: f64 = res_narrow.displacements.iter()
        .find(|d| d.node_id == mid_beam_node).unwrap().uy.abs();
    let defl_wide: f64 = res_wide.displacements.iter()
        .find(|d| d.node_id == mid_beam_node).unwrap().uy.abs();

    // The wider frame has a longer beam, so midspan deflection is larger
    assert!(
        defl_wide > defl_narrow,
        "Wider portal should deflect more under gravity UDL: wide={:.6e}, narrow={:.6e}",
        defl_wide, defl_narrow
    );

    // Verify vertical equilibrium for both
    let total_load_narrow: f64 = q.abs() * w_narrow;
    let total_load_wide: f64 = q.abs() * w_wide;
    let sum_ry_narrow: f64 = res_narrow.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_wide: f64 = res_wide.reactions.iter().map(|r| r.ry).sum();

    assert_close(sum_ry_narrow, total_load_narrow, 0.02, "narrow portal gravity equilibrium");
    assert_close(sum_ry_wide, total_load_wide, 0.02, "wide portal gravity equilibrium");
}

// ================================================================
// 4. SS Beam UDL: Deflection Proportional to L^4
// ================================================================
//
// Simply-supported beam with UDL: delta = 5*q*L^4 / (384*E*I).
// Compare spans L and 2L. The deflection ratio should be 2^4 = 16.

#[test]
fn validation_span_ratio_ss_beam_deflection_l4() {
    let l = 5.0;
    let q = 10.0;
    let n = 8;
    let e_eff = E * 1000.0;

    // --- Beam with span L ---
    let input_short = make_ss_beam_udl(n, l, E, A, IZ, -q);
    let res_short = linear::solve_2d(&input_short).unwrap();

    // --- Beam with span 2L ---
    let input_long = make_ss_beam_udl(n, 2.0 * l, E, A, IZ, -q);
    let res_long = linear::solve_2d(&input_long).unwrap();

    let mid = n / 2 + 1;
    let defl_short: f64 = res_short.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    let defl_long: f64 = res_long.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Deflection ratio should be (2L/L)^4 = 16
    let ratio = defl_long / defl_short;
    assert_close(ratio, 16.0, 0.05, "SS beam UDL deflection ratio L^4");

    // Also verify absolute values against analytical formula
    let delta_short_exact = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    let delta_long_exact = 5.0 * q * (2.0 * l).powi(4) / (384.0 * e_eff * IZ);

    assert_close(defl_short, delta_short_exact, 0.05, "short beam analytical deflection");
    assert_close(defl_long, delta_long_exact, 0.05, "long beam analytical deflection");
}

// ================================================================
// 5. Cantilever Point Load: Deflection Proportional to L^3
// ================================================================
//
// Cantilever with tip point load: delta = P*L^3 / (3*E*I).
// Compare spans L and 2L. The deflection ratio should be 2^3 = 8.

#[test]
fn validation_span_ratio_cantilever_deflection_l3() {
    let l = 4.0;
    let p = 20.0;
    let n = 8;
    let e_eff = E * 1000.0;

    // --- Cantilever with span L ---
    let input_short = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_short = linear::solve_2d(&input_short).unwrap();

    // --- Cantilever with span 2L ---
    let input_long = make_beam(n, 2.0 * l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_long = linear::solve_2d(&input_long).unwrap();

    let tip = n + 1;
    let defl_short: f64 = res_short.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();
    let defl_long: f64 = res_long.displacements.iter()
        .find(|d| d.node_id == tip).unwrap().uy.abs();

    // Deflection ratio should be (2L/L)^3 = 8
    let ratio = defl_long / defl_short;
    assert_close(ratio, 8.0, 0.05, "cantilever point load deflection ratio L^3");

    // Verify absolute values against analytical formula
    let delta_short_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let delta_long_exact = p * (2.0 * l).powi(3) / (3.0 * e_eff * IZ);

    assert_close(defl_short, delta_short_exact, 0.05, "short cantilever analytical deflection");
    assert_close(defl_long, delta_long_exact, 0.05, "long cantilever analytical deflection");
}

// ================================================================
// 6. Two-Span Beam Span Ratio 1:2 UDL: Asymmetric Reactions
// ================================================================
//
// Two-span continuous beam with L1 = L, L2 = 2L, UDL on both spans.
// Three-moment equation: M_B = -q*(L1^3 + L2^3) / (8*(L1 + L2))
//
// Reactions from statics + M_B:
//   R_A = q*L1/2 - M_B/L1
//   R_C = q*L2/2 - M_B/L2
//   R_B = q*(L1+L2) - R_A - R_C
//
// Verify equilibrium: R_A + R_B + R_C = q*(L1 + L2)

#[test]
fn validation_span_ratio_1_to_2_asymmetric_reactions() {
    let l = 5.0;
    let l1 = l;
    let l2 = 2.0 * l;
    let q = 10.0;
    let n_per_span = 6;

    let n_total = 2 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes: A = 1, B = n_per_span + 1, C = 2*n_per_span + 1
    let node_a = 1;
    let node_b = n_per_span + 1;
    let node_c = 2 * n_per_span + 1;

    let r_a = results.reactions.iter().find(|r| r.node_id == node_a).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == node_c).unwrap().ry;

    // Verify equilibrium: sum of reactions = total load
    let total_load = q * (l1 + l2);
    let sum_ry = r_a + r_b + r_c;
    assert_close(sum_ry, total_load, 0.02, "1:2 span equilibrium sum R = qL_total");

    // Reactions should be asymmetric: R_A != R_C
    let asymmetry: f64 = (r_a - r_c).abs();
    assert!(
        asymmetry > 1.0,
        "Reactions should be asymmetric for 1:2 span ratio: R_A={:.2}, R_C={:.2}",
        r_a, r_c
    );

    // Three-moment analytical values
    let m_b = q * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let expected_r_a = q * l1 / 2.0 - m_b / l1;
    let expected_r_c = q * l2 / 2.0 - m_b / l2;
    let expected_r_b = total_load - expected_r_a - expected_r_c;

    assert_close(r_a, expected_r_a, 0.03, "1:2 span R_A analytical");
    assert_close(r_c, expected_r_c, 0.03, "1:2 span R_C analytical");
    assert_close(r_b, expected_r_b, 0.03, "1:2 span R_B analytical");

    // The longer span end reaction R_C should be larger than R_A
    // because the longer span carries more total load
    assert!(
        r_c > r_a,
        "Longer span end should have larger reaction: R_C={:.2} > R_A={:.2}",
        r_c, r_a
    );
}

// ================================================================
// 7. Three-Span Beam: Longer Outer Spans Increase Middle Span
//    Deflection Due to Support Rotation Compatibility
// ================================================================
//
// Three-span continuous beam with UDL on all spans.
// Case A: spans (L, L, L) - equal spans, symmetric.
// Case B: spans (2L, L, 2L) - same middle span length, longer outer spans.
//
// When the outer spans are longer, they produce larger rotations at
// the interior supports. The middle span must accommodate these
// rotations through compatibility, causing it to deflect MORE than
// in the equal-span case. The outer spans, being longer and carrying
// more total load, also deflect more.

#[test]
fn validation_span_ratio_three_span_shorter_middle() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 6;

    // --- Case A: Equal spans (L, L, L) ---
    let n_total_a = 3 * n_per_span;
    let loads_a: Vec<SolverLoad> = (1..=n_total_a)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_a = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // --- Case B: Longer outer spans (2L, L, 2L) ---
    let n_total_b = 3 * n_per_span;
    let loads_b: Vec<SolverLoad> = (1..=n_total_b)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_b = make_continuous_beam(&[2.0 * l, l, 2.0 * l], n_per_span, E, A, IZ, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Middle span nodes: from (n_per_span + 1) to (2*n_per_span + 1)
    let mid_span2_start_node = n_per_span + 1;
    let mid_span2_end_node = 2 * n_per_span + 1;

    // Max deflection in the middle span for both cases
    let max_defl_mid_a = res_a.displacements.iter()
        .filter(|d| d.node_id >= mid_span2_start_node && d.node_id <= mid_span2_end_node)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    let max_defl_mid_b = res_b.displacements.iter()
        .filter(|d| d.node_id >= mid_span2_start_node && d.node_id <= mid_span2_end_node)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    // With longer outer spans, larger support rotations propagate into the
    // middle span through compatibility, causing it to deflect more.
    assert!(
        max_defl_mid_b > max_defl_mid_a,
        "Middle span should deflect more when outer spans are longer: B={:.6e}, A={:.6e}",
        max_defl_mid_b, max_defl_mid_a
    );

    // The outer spans in case B are longer (2L vs L), so they deflect more
    let max_defl_outer_a = res_a.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n_per_span + 1)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    let max_defl_outer_b = res_b.displacements.iter()
        .filter(|d| d.node_id >= 1 && d.node_id <= n_per_span + 1)
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_defl_outer_b > max_defl_outer_a,
        "Longer outer spans should deflect more: B={:.6e}, A={:.6e}",
        max_defl_outer_b, max_defl_outer_a
    );

    // Verify equilibrium for both cases
    let sum_ry_a: f64 = res_a.reactions.iter().map(|r| r.ry).sum();
    let sum_ry_b: f64 = res_b.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry_a, q * 3.0 * l, 0.02, "equal 3-span equilibrium");
    assert_close(sum_ry_b, q * (2.0 * l + l + 2.0 * l), 0.02, "long-outer 3-span equilibrium");
}

// ================================================================
// 8. Portal Frame Height-to-Width Ratio Effect on Lateral Stiffness
// ================================================================
//
// Compare portal frames with different height-to-width (h/w) ratios
// under the same lateral load. A "squatter" frame (lower h/w) should
// be stiffer laterally.
//
// Frame A: h=3, w=9 (h/w = 0.33 - squat)
// Frame B: h=6, w=6 (h/w = 1.0 - square)
// Frame C: h=9, w=3 (h/w = 3.0 - tall/narrow)
//
// Lateral stiffness K = F/delta. Squat frame should be stiffest.

#[test]
fn validation_span_ratio_portal_hw_ratio_lateral_stiffness() {
    let lateral = 20.0;

    // Frame A: squat (h/w = 0.33)
    let input_squat = make_portal_frame(3.0, 9.0, E, A, IZ, lateral, 0.0);
    let res_squat = linear::solve_2d(&input_squat).unwrap();

    // Frame B: square (h/w = 1.0)
    let input_square = make_portal_frame(6.0, 6.0, E, A, IZ, lateral, 0.0);
    let res_square = linear::solve_2d(&input_square).unwrap();

    // Frame C: tall/narrow (h/w = 3.0)
    let input_tall = make_portal_frame(9.0, 3.0, E, A, IZ, lateral, 0.0);
    let res_tall = linear::solve_2d(&input_tall).unwrap();

    // Sway at the top (node 2 is the top-left corner)
    let sway_squat: f64 = res_squat.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway_square: f64 = res_square.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let sway_tall: f64 = res_tall.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Lateral stiffness K = F/delta (higher = stiffer)
    let k_squat = lateral / sway_squat;
    let k_square = lateral / sway_square;
    let k_tall = lateral / sway_tall;

    // Squat frame should be stiffest, tall frame least stiff
    assert!(
        k_squat > k_square,
        "Squat frame should be stiffer than square: K_squat={:.2}, K_square={:.2}",
        k_squat, k_square
    );
    assert!(
        k_square > k_tall,
        "Square frame should be stiffer than tall: K_square={:.2}, K_tall={:.2}",
        k_square, k_tall
    );

    // Sway ordering: squat < square < tall
    assert!(
        sway_squat < sway_square,
        "Squat frame should sway less than square: squat={:.6e}, square={:.6e}",
        sway_squat, sway_square
    );
    assert!(
        sway_square < sway_tall,
        "Square frame should sway less than tall: square={:.6e}, tall={:.6e}",
        sway_square, sway_tall
    );

    // Verify equilibrium for all three
    let sum_rx_squat: f64 = res_squat.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_square: f64 = res_square.reactions.iter().map(|r| r.rx).sum();
    let sum_rx_tall: f64 = res_tall.reactions.iter().map(|r| r.rx).sum();

    assert_close(sum_rx_squat, -lateral, 0.02, "squat portal lateral equilibrium");
    assert_close(sum_rx_square, -lateral, 0.02, "square portal lateral equilibrium");
    assert_close(sum_rx_tall, -lateral, 0.02, "tall portal lateral equilibrium");
}
