/// Validation: Loading Pattern Effects on Continuous Beams
///
/// References:
///   - ACI 318-19, Section 6.4.2 (Arrangement of live load)
///   - Eurocode 2, EN 1992-1-1, Section 5.1.3 (Load arrangements)
///   - Wight & MacGregor, "Reinforced Concrete", Ch. 10 (Pattern loading)
///
/// Tests verify that specific loading patterns produce the expected
/// comparative effects on 3-span and 4-span continuous beams with
/// 2 elements per span (coarse mesh).
///
/// Beam layout (3-span, L=6m each, 2 elem/span):
///   Nodes: 1(0m) - 2(3m) - 3(6m) - 4(9m) - 5(12m) - 6(15m) - 7(18m)
///   Elements: 1(1-2), 2(2-3), 3(3-4), 4(4-5), 5(5-6), 6(6-7)
///   Supports: pinned@1, rollerX@3, rollerX@5, rollerX@7
///   Span 1: elems 1-2, midspan node 2, support B = node 3
///   Span 2: elems 3-4, midspan node 4, support C = node 5
///   Span 3: elems 5-6, midspan node 6
///
/// Sign convention for element forces:
///   m_end at interior supports is positive for hogging (downward load).
///   m_end at midspan (j-end of first element in a span) is negative for sagging.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper: create UDL loads for specific spans (1-indexed).
/// With n_per_span=2, span k uses elements (2k-1) and (2k).
fn span_loads(spans_to_load: &[usize], n_per_span: usize, q: f64) -> Vec<SolverLoad> {
    let mut loads = Vec::new();
    for &span_idx in spans_to_load {
        let first_elem = (span_idx - 1) * n_per_span + 1;
        for e in first_elem..=(first_elem + n_per_span - 1) {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: e,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            }));
        }
    }
    loads
}

// ================================================================
// 1. All Spans Loaded: Symmetry Check
// ================================================================
//
// 3-span equal beam (L=6m), UDL q=-10 on all spans.
// By symmetry: M_B = M_C (interior support moments are equal).
// The structure is symmetric about the center of span 2.
// In the solver convention, hogging at interior supports gives
// positive m_end values.

#[test]
fn validation_all_spans_loaded_symmetry() {
    let q = -10.0;
    let loads = span_loads(&[1, 2, 3], 2, q);
    let input = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment at support B (node 3) = m_end of element 2
    let m_b = results
        .element_forces
        .iter()
        .find(|f| f.element_id == 2)
        .unwrap()
        .m_end;

    // Interior moment at support C (node 5) = m_end of element 4
    let m_c = results
        .element_forces
        .iter()
        .find(|f| f.element_id == 4)
        .unwrap()
        .m_end;

    // M_B and M_C should be equal by symmetry
    assert_close(m_b, m_c, 0.01, "Symmetry: M_B = M_C");

    // Both should be positive (hogging at interior supports in solver convention)
    assert!(
        m_b > 0.0,
        "M_B should be positive (hogging in solver convention): got {:.4}",
        m_b
    );
}

// ================================================================
// 2. Alternate Span Loading Maximizes Midspan Moment
// ================================================================
//
// 3 spans L=6m. Loading spans 1 and 3 only (skip span 2)
// produces a larger sagging midspan moment in span 1 than
// loading all three spans, because the unloaded middle span
// reduces the restraint at interior supports.
//
// In the solver convention, sagging at midspan corresponds to
// negative m_end at the j-end of the first element in the span.
// "Larger sagging" = more negative = larger absolute value.

#[test]
fn validation_alternate_loading_maximizes_midspan_moment() {
    let q = -10.0;

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3], 2, q);
    let input_all = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Alternate: spans 1 and 3 only
    let loads_alt = span_loads(&[1, 3], 2, q);
    let input_alt = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_alt);
    let res_alt = linear::solve_2d(&input_alt).unwrap();

    // Midspan moment of span 1 = m_end of element 1 (at node 2, x=3m)
    let m_mid_all = res_all
        .element_forces
        .iter()
        .find(|f| f.element_id == 1)
        .unwrap()
        .m_end;

    let m_mid_alt = res_alt
        .element_forces
        .iter()
        .find(|f| f.element_id == 1)
        .unwrap()
        .m_end;

    // Both should be negative (sagging in solver convention)
    assert!(
        m_mid_all < 0.0,
        "All-loaded midspan moment should be negative (sagging): {:.4}",
        m_mid_all
    );
    assert!(
        m_mid_alt < 0.0,
        "Alternate midspan moment should be negative (sagging): {:.4}",
        m_mid_alt
    );

    // Alternate loading should give LARGER sagging (more negative / larger magnitude)
    assert!(
        m_mid_alt.abs() > m_mid_all.abs(),
        "Alternate span loading gives larger midspan sagging in span 1: |{:.4}| > |{:.4}|",
        m_mid_alt,
        m_mid_all
    );
}

// ================================================================
// 3. Adjacent Spans Loaded Maximizes Support Moment
// ================================================================
//
// 3 spans L=6m. Loading spans 1 and 2 (adjacent) produces a
// larger hogging moment at support B than loading all spans.
// In the solver convention, hogging at support B corresponds to
// positive m_end at element 2. "Larger hogging" = more positive.

#[test]
fn validation_adjacent_loading_maximizes_support_moment() {
    let q = -10.0;

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3], 2, q);
    let input_all = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Adjacent: spans 1 and 2 only
    let loads_adj = span_loads(&[1, 2], 2, q);
    let input_adj = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_adj);
    let res_adj = linear::solve_2d(&input_adj).unwrap();

    // Interior moment at support B (node 3) = m_end of element 2
    let m_b_all = res_all
        .element_forces
        .iter()
        .find(|f| f.element_id == 2)
        .unwrap()
        .m_end;

    let m_b_adj = res_adj
        .element_forces
        .iter()
        .find(|f| f.element_id == 2)
        .unwrap()
        .m_end;

    // Both should be positive (hogging in solver convention)
    assert!(m_b_all > 0.0, "M_B(all) should be positive (hogging): {:.4}", m_b_all);
    assert!(m_b_adj > 0.0, "M_B(adj) should be positive (hogging): {:.4}", m_b_adj);

    // Adjacent loading should give larger hogging moment at B
    assert!(
        m_b_adj.abs() > m_b_all.abs(),
        "|M_B(adjacent)| > |M_B(all)|: {:.4} > {:.4}",
        m_b_adj.abs(),
        m_b_all.abs()
    );
}

// ================================================================
// 4. Single Span Loaded: Least Support Moment
// ================================================================
//
// 3 spans L=6m. Loading span 1 only produces a smaller
// hogging moment at support B than loading all spans.
// Only one span contributes to the hogging at B.

#[test]
fn validation_single_span_least_support_moment() {
    let q = -10.0;

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3], 2, q);
    let input_all = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Span 1 only
    let loads_one = span_loads(&[1], 2, q);
    let input_one = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_one);
    let res_one = linear::solve_2d(&input_one).unwrap();

    // Interior moment at support B (node 3) = m_end of element 2
    let m_b_all = res_all
        .element_forces
        .iter()
        .find(|f| f.element_id == 2)
        .unwrap()
        .m_end;

    let m_b_one = res_one
        .element_forces
        .iter()
        .find(|f| f.element_id == 2)
        .unwrap()
        .m_end;

    // Single span produces less hogging at B
    assert!(
        m_b_one.abs() < m_b_all.abs(),
        "|M_B(span1_only)| < |M_B(all)|: {:.4} < {:.4}",
        m_b_one.abs(),
        m_b_all.abs()
    );
}

// ================================================================
// 5. Unloaded Span May Hump Upward
// ================================================================
//
// 3 spans L=6m. Load spans 1 and 3 only (q=-10).
// The middle span (unloaded) is subjected to hogging from
// the moments at supports B and C. Its midspan deflection
// should be upward (positive uy) or at least greater (less
// negative / more positive) than the midspan deflections of
// the loaded end spans.

#[test]
fn validation_unloaded_span_hump_upward() {
    let q = -10.0;

    let loads = span_loads(&[1, 3], 2, q);
    let input = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflections: span 1 node 2, span 2 node 4, span 3 node 6
    let uy_span1 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy;
    let uy_span2 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 4)
        .unwrap()
        .uy;
    let uy_span3 = results
        .displacements
        .iter()
        .find(|d| d.node_id == 6)
        .unwrap()
        .uy;

    // Loaded spans deflect downward (negative uy)
    assert!(
        uy_span1 < 0.0,
        "Loaded span 1 should deflect down: {:.6e}",
        uy_span1
    );
    assert!(
        uy_span3 < 0.0,
        "Loaded span 3 should deflect down: {:.6e}",
        uy_span3
    );

    // Unloaded middle span should deflect upward (positive) or at least
    // be greater than the loaded span deflections
    assert!(
        uy_span2 > uy_span1 && uy_span2 > uy_span3,
        "Unloaded span 2 midspan deflection ({:.6e}) should be greater than loaded spans ({:.6e}, {:.6e})",
        uy_span2,
        uy_span1,
        uy_span3
    );
}

// ================================================================
// 6. Four-Span Beam Reaction Symmetry
// ================================================================
//
// 4 equal spans L=5m, UDL q=-10 on all, 2 elem/span.
// By symmetry: R_1 = R_5 (end supports), R_2 = R_4 (first interior).
// R_3 is the central interior support.
// Total load = q * 4 * L = 10 * 4 * 5 = 200 kN. Sum of reactions = 200 kN.
//
// Layout: 8 elements, 9 nodes.
//   Supports at nodes 1, 3, 5, 7, 9.

#[test]
fn validation_four_span_reaction_symmetry() {
    let q = -10.0;
    let span = 5.0;

    let loads = span_loads(&[1, 2, 3, 4], 2, q);
    let input = make_continuous_beam(&[span, span, span, span], 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes: 1, 3, 5, 7, 9
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;
    let r3 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().ry;
    let r4 = results.reactions.iter().find(|r| r.node_id == 7).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == 9).unwrap().ry;

    // Symmetry: R1 = R5, R2 = R4
    assert_close(r1, r5, 0.01, "4-span symmetry: R1 = R5");
    assert_close(r2, r4, 0.01, "4-span symmetry: R2 = R4");

    // Sum of reactions = total load = 200 kN
    let total_load = q.abs() * 4.0 * span;
    let sum_r = r1 + r2 + r3 + r4 + r5;
    assert_close(sum_r, total_load, 0.01, "4-span: sum of reactions = 200 kN");
}

// ================================================================
// 7. Pattern Loading: Max Deflection in End Span
// ================================================================
//
// 3 spans L=6m. For maximum deflection in span 1: load
// spans 1 and 3 (skip 2). The checkerboard pattern reduces
// support restraint, giving more deflection in span 1 than
// the all-loaded case.

#[test]
fn validation_pattern_max_deflection_end_span() {
    let q = -10.0;

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3], 2, q);
    let input_all = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Pattern: spans 1 and 3 (skip 2)
    let loads_pat = span_loads(&[1, 3], 2, q);
    let input_pat = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_pat);
    let res_pat = linear::solve_2d(&input_pat).unwrap();

    // Midspan deflection of span 1 at node 2
    let d_all = res_all
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy
        .abs();

    let d_pat = res_pat
        .displacements
        .iter()
        .find(|d| d.node_id == 2)
        .unwrap()
        .uy
        .abs();

    // Pattern loading should give larger deflection in span 1
    assert!(
        d_pat > d_all,
        "|delta_pattern| > |delta_all| for span 1: {:.6e} > {:.6e}",
        d_pat,
        d_all
    );
}

// ================================================================
// 8. Moment Envelope: Worst Case at Each Section
// ================================================================
//
// 3 spans L=6m. Run 4 loading patterns:
//   a) All loaded (spans 1,2,3)
//   b) Span 1 only
//   c) Spans 1 and 3 (alternate/checkerboard)
//   d) Spans 1 and 2 (adjacent)
//
// At support B: max |M_B| comes from pattern d (adjacent loading).
//   In solver convention, hogging is positive m_end at element 2.
// At midspan of span 1: max sagging comes from pattern c (alternate).
//   In solver convention, sagging is negative m_end at element 1,
//   so the "worst case" is the most negative value (largest magnitude).

#[test]
fn validation_moment_envelope_worst_case() {
    let q = -10.0;

    // Pattern a: all loaded
    let loads_a = span_loads(&[1, 2, 3], 2, q);
    let input_a = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Pattern b: span 1 only
    let loads_b = span_loads(&[1], 2, q);
    let input_b = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Pattern c: spans 1 and 3 (alternate)
    let loads_c = span_loads(&[1, 3], 2, q);
    let input_c = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_c);
    let res_c = linear::solve_2d(&input_c).unwrap();

    // Pattern d: spans 1 and 2 (adjacent)
    let loads_d = span_loads(&[1, 2], 2, q);
    let input_d = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_d);
    let res_d = linear::solve_2d(&input_d).unwrap();

    // Support B moment (m_end of element 2) for each pattern
    let m_b_a = res_a.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    let m_b_b = res_b.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    let m_b_c = res_c.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    let m_b_d = res_d.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;

    // Pattern d (adjacent) should give the largest |M_B|
    let abs_m_b = [m_b_a.abs(), m_b_b.abs(), m_b_c.abs(), m_b_d.abs()];
    let max_m_b = abs_m_b.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        (m_b_d.abs() - max_m_b).abs() < 1e-6,
        "Pattern d (adjacent) controls at support B: |M_B| = {:.4}, max = {:.4} (a={:.4}, b={:.4}, c={:.4}, d={:.4})",
        m_b_d.abs(),
        max_m_b,
        m_b_a.abs(),
        m_b_b.abs(),
        m_b_c.abs(),
        m_b_d.abs()
    );

    // Midspan moment of span 1 (m_end of element 1) for each pattern.
    // Sagging is negative in solver convention, so the controlling
    // pattern gives the largest absolute value (most negative).
    let m_mid_a = res_a.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_mid_b = res_b.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_mid_c = res_c.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_mid_d = res_d.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;

    // Pattern c (alternate) should give the largest sagging magnitude
    let abs_m_mid = [m_mid_a.abs(), m_mid_b.abs(), m_mid_c.abs(), m_mid_d.abs()];
    let max_m_mid = abs_m_mid.iter().cloned().fold(0.0_f64, f64::max);
    assert!(
        (m_mid_c.abs() - max_m_mid).abs() < 1e-6,
        "Pattern c (alternate) controls at midspan 1: |M| = {:.4}, max = {:.4} (a={:.4}, b={:.4}, c={:.4}, d={:.4})",
        m_mid_c.abs(),
        max_m_mid,
        m_mid_a.abs(),
        m_mid_b.abs(),
        m_mid_c.abs(),
        m_mid_d.abs()
    );
}
