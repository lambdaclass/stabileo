/// Validation: Extended Loading Pattern Effects on Continuous Beams
///
/// References:
///   - ACI 318-19, Section 6.4.2 (Arrangement of live load)
///   - Eurocode 2, EN 1992-1-1, Section 5.1.3 (Load arrangements)
///   - Ghali & Neville, "Structural Analysis", Ch. 4 (Continuous beams)
///   - McCormac & Nelson, "Structural Analysis", Ch. 15 (Influence lines)
///
/// These 8 tests extend the basic pattern loading suite to cover
/// additional span counts, unequal spans, stiffness effects, and
/// interior span pattern loading on continuous beams.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper: create UDL loads for specific spans (1-indexed).
/// With n_per_span elements per span, span k uses elements
/// [(k-1)*n_per_span+1 .. k*n_per_span].
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
// 1. Five-Span Beam: Checkerboard Loading Symmetry
// ================================================================
//
// 5 equal spans L=4m, UDL q=-10 on odd spans (1,3,5).
// By the anti-symmetry of the unloaded even spans, the beam
// deflection pattern is symmetric about the center of span 3.
// Therefore: deflection at midspan 1 = deflection at midspan 5,
// and deflection at midspan 2 = deflection at midspan 4.
//
// Layout (2 elem/span, 10 elements, 11 nodes):
//   Supports at nodes 1, 3, 5, 7, 9, 11.
//   Midspan nodes: span1=2, span2=4, span3=6, span4=8, span5=10.

#[test]
fn validation_five_span_checkerboard_symmetry() {
    let q = -10.0;
    let spans = [4.0, 4.0, 4.0, 4.0, 4.0];

    let loads = span_loads(&[1, 3, 5], 2, q);
    let input = make_continuous_beam(&spans, 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflections
    let uy1 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    let uy2 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uz;
    let uy4 = results.displacements.iter().find(|d| d.node_id == 8).unwrap().uz;
    let uy5 = results.displacements.iter().find(|d| d.node_id == 10).unwrap().uz;

    // Symmetry: midspan 1 = midspan 5, midspan 2 = midspan 4
    assert_close(uy1, uy5, 0.01, "5-span checkerboard: uy(span1) = uy(span5)");
    assert_close(uy2, uy4, 0.01, "5-span checkerboard: uy(span2) = uy(span4)");

    // Loaded spans should deflect downward
    assert!(
        uy1 < 0.0,
        "Loaded span 1 deflects down: got {:.6e}",
        uy1
    );

    // Unloaded spans should deflect upward (or at least be greater than loaded spans)
    assert!(
        uy2 > uy1,
        "Unloaded span 2 deflection ({:.6e}) > loaded span 1 ({:.6e})",
        uy2,
        uy1
    );
}

// ================================================================
// 2. Four-Span: Alternate Loading Maximizes Interior Span Deflection
// ================================================================
//
// 4 equal spans L=5m, compare all-loaded vs alternate (spans 2,4).
// Loading only even spans maximizes the midspan deflection of span 2
// because the unloaded adjacent spans reduce restraint at the
// interior supports.
//
// Layout (2 elem/span, 8 elements, 9 nodes):
//   Supports at nodes 1, 3, 5, 7, 9.
//   Midspan nodes: span1=2, span2=4, span3=6, span4=8.

#[test]
fn validation_four_span_alternate_loading_interior_deflection() {
    let q = -10.0;
    let spans = [5.0, 5.0, 5.0, 5.0];

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3, 4], 2, q);
    let input_all = make_continuous_beam(&spans, 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Alternate: spans 2 and 4 only
    let loads_alt = span_loads(&[2, 4], 2, q);
    let input_alt = make_continuous_beam(&spans, 2, E, A, IZ, loads_alt);
    let res_alt = linear::solve_2d(&input_alt).unwrap();

    // Midspan deflection of span 2 at node 4
    let d_all = res_all.displacements.iter().find(|d| d.node_id == 4).unwrap().uz.abs();
    let d_alt = res_alt.displacements.iter().find(|d| d.node_id == 4).unwrap().uz.abs();

    // Alternate pattern gives larger deflection in loaded interior span
    assert!(
        d_alt > d_all,
        "Alternate loading gives larger deflection in span 2: {:.6e} > {:.6e}",
        d_alt,
        d_all
    );
}

// ================================================================
// 3. Unequal Spans: Longer Span Attracts More Moment at Support
// ================================================================
//
// 2-span continuous beam, spans L1=4m and L2=8m, UDL q=-10 on both.
// The longer span produces a larger support moment at the interior
// support (support B at node 3) because M ~ qL^2.
//
// For comparison, also analyze a symmetric 2-span (L1=L2=6m) to
// verify that the asymmetric case has an unequal midspan moment
// distribution.
//
// Layout (2 elem/span, 4 elements, 5 nodes):
//   Supports at nodes 1, 3, 5.

#[test]
fn validation_unequal_spans_moment_distribution() {
    let q = -10.0;

    // Asymmetric: 4m + 8m
    let loads_asym = span_loads(&[1, 2], 2, q);
    let input_asym = make_continuous_beam(&[4.0, 8.0], 2, E, A, IZ, loads_asym);
    let res_asym = linear::solve_2d(&input_asym).unwrap();

    // Symmetric: 6m + 6m
    let loads_sym = span_loads(&[1, 2], 2, q);
    let input_sym = make_continuous_beam(&[6.0, 6.0], 2, E, A, IZ, loads_sym);
    let res_sym = linear::solve_2d(&input_sym).unwrap();

    // Support B moment = m_end of element 2 (end of span 1)
    let m_b_asym = res_asym.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    let m_b_sym = res_sym.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;

    // Both should be positive (hogging at interior support)
    assert!(
        m_b_asym > 0.0,
        "Asymmetric M_B should be positive (hogging): {:.4}",
        m_b_asym
    );
    assert!(
        m_b_sym > 0.0,
        "Symmetric M_B should be positive (hogging): {:.4}",
        m_b_sym
    );

    // For the asymmetric case, the midspan moment in the longer span (span 2)
    // should be larger in magnitude than in the shorter span (span 1).
    // Midspan of span 1 = m_end of elem 1, midspan of span 2 = m_end of elem 3.
    let m_mid_short = res_asym.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_mid_long = res_asym.element_forces.iter().find(|f| f.element_id == 3).unwrap().m_end;

    // Both sagging (negative in solver convention)
    assert!(
        m_mid_long.abs() > m_mid_short.abs(),
        "Longer span has larger midspan moment: |{:.4}| > |{:.4}|",
        m_mid_long,
        m_mid_short
    );
}

// ================================================================
// 4. Three-Span: Center Span Only Loaded Produces Sagging at
//    Interior Supports
// ================================================================
//
// 3 equal spans L=6m, UDL q=-10 on span 2 only.
// With only the center span loaded, the interior supports B and C
// still develop hogging moments (positive m_end), but the magnitude
// is less than when all spans are loaded.
//
// Also: by symmetry, the moments at B and C should be equal.
//
// Layout (2 elem/span, 6 elements, 7 nodes):
//   Supports at nodes 1, 3, 5, 7.

#[test]
fn validation_center_span_only_loading_symmetry() {
    let q = -10.0;

    // Only span 2 loaded
    let loads = span_loads(&[2], 2, q);
    let input = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // All spans loaded for comparison
    let loads_all = span_loads(&[1, 2, 3], 2, q);
    let input_all = make_continuous_beam(&[6.0, 6.0, 6.0], 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Support B moment = m_end of element 2
    let m_b = results.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    // Support C moment = m_end of element 4
    let m_c = results.element_forces.iter().find(|f| f.element_id == 4).unwrap().m_end;

    // By symmetry (symmetric loading on symmetric structure): M_B = M_C
    assert_close(m_b, m_c, 0.01, "Center span only: M_B = M_C by symmetry");

    // Hogging at the interior supports (positive in solver convention)
    assert!(
        m_b > 0.0,
        "M_B should be positive (hogging): got {:.4}",
        m_b
    );

    // The center-only loading should produce smaller support moment
    // than all-loaded case
    let m_b_all = res_all.element_forces.iter().find(|f| f.element_id == 2).unwrap().m_end;
    assert!(
        m_b.abs() < m_b_all.abs(),
        "Center-only M_B ({:.4}) < all-loaded M_B ({:.4}) in magnitude",
        m_b.abs(),
        m_b_all.abs()
    );
}

// ================================================================
// 5. Four-Span: Adjacent Pair vs Full Load at Central Support
// ================================================================
//
// 4 equal spans L=5m. Loading spans 2 and 3 (adjacent to central
// support C at node 5) should produce a larger hogging moment at
// support C than loading all 4 spans.
//
// Layout (2 elem/span, 8 elements, 9 nodes):
//   Supports at nodes 1, 3, 5, 7, 9.
//   Support C = node 5 = end of span 2 = m_end of element 4.

#[test]
fn validation_four_span_adjacent_pair_central_support() {
    let q = -10.0;
    let spans = [5.0, 5.0, 5.0, 5.0];

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3, 4], 2, q);
    let input_all = make_continuous_beam(&spans, 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Adjacent pair at central support: spans 2 and 3
    let loads_adj = span_loads(&[2, 3], 2, q);
    let input_adj = make_continuous_beam(&spans, 2, E, A, IZ, loads_adj);
    let res_adj = linear::solve_2d(&input_adj).unwrap();

    // Central support C moment = m_end of element 4 (end of span 2)
    let m_c_all = res_all.element_forces.iter().find(|f| f.element_id == 4).unwrap().m_end;
    let m_c_adj = res_adj.element_forces.iter().find(|f| f.element_id == 4).unwrap().m_end;

    // Both should be positive (hogging)
    assert!(m_c_all > 0.0, "M_C(all) should be positive: {:.4}", m_c_all);
    assert!(m_c_adj > 0.0, "M_C(adj) should be positive: {:.4}", m_c_adj);

    // Adjacent loading at spans 2+3 should give larger moment at C
    assert!(
        m_c_adj.abs() > m_c_all.abs(),
        "|M_C(spans 2+3)| > |M_C(all)|: {:.4} > {:.4}",
        m_c_adj.abs(),
        m_c_all.abs()
    );
}

// ================================================================
// 6. Stiffness Effect: Stiffer Beam Reduces Pattern Loading Sensitivity
// ================================================================
//
// 3 equal spans L=6m. Compare "pattern effect ratio" for two beams
// with different EI values. The ratio is defined as:
//   ratio = |M_midspan(pattern)| / |M_midspan(all_loaded)|
//
// With pattern = spans 1,3 (alternate), both beams should yield the
// SAME ratio because the pattern effect in a prismatic beam depends
// only on geometry (span ratios), not on absolute stiffness.
//
// We verify this equality holds within tolerance.

#[test]
fn validation_stiffness_independence_of_pattern_ratio() {
    let q = -10.0;
    let spans = [6.0, 6.0, 6.0];

    // Beam 1: baseline stiffness
    let iz1: f64 = 1e-4;
    let loads_all_1 = span_loads(&[1, 2, 3], 2, q);
    let input_all_1 = make_continuous_beam(&spans, 2, E, A, iz1, loads_all_1);
    let res_all_1 = linear::solve_2d(&input_all_1).unwrap();

    let loads_pat_1 = span_loads(&[1, 3], 2, q);
    let input_pat_1 = make_continuous_beam(&spans, 2, E, A, iz1, loads_pat_1);
    let res_pat_1 = linear::solve_2d(&input_pat_1).unwrap();

    // Beam 2: 10x stiffer
    let iz2: f64 = 1e-3;
    let loads_all_2 = span_loads(&[1, 2, 3], 2, q);
    let input_all_2 = make_continuous_beam(&spans, 2, E, A, iz2, loads_all_2);
    let res_all_2 = linear::solve_2d(&input_all_2).unwrap();

    let loads_pat_2 = span_loads(&[1, 3], 2, q);
    let input_pat_2 = make_continuous_beam(&spans, 2, E, A, iz2, loads_pat_2);
    let res_pat_2 = linear::solve_2d(&input_pat_2).unwrap();

    // Midspan moment of span 1 = m_end of element 1
    let m_all_1 = res_all_1.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_pat_1 = res_pat_1.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let ratio_1 = m_pat_1.abs() / m_all_1.abs();

    let m_all_2 = res_all_2.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let m_pat_2 = res_pat_2.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_end;
    let ratio_2 = m_pat_2.abs() / m_all_2.abs();

    // Ratios should be equal (pattern effect is geometry-dependent, not stiffness-dependent)
    assert_close(
        ratio_1,
        ratio_2,
        0.01,
        "Pattern ratio independent of EI",
    );

    // Both ratios should be > 1.0 (pattern loading amplifies midspan moment)
    assert!(
        ratio_1 > 1.0,
        "Pattern ratio should exceed 1.0: got {:.4}",
        ratio_1
    );
}

// ================================================================
// 7. Five-Span: Global Equilibrium Under Skip-One Pattern
// ================================================================
//
// 5 equal spans L=4m, UDL q=-10 on spans 1,3,5 (skip 2,4).
// Total applied load = |q| * 3 * L = 10 * 3 * 4 = 120 kN.
// Sum of vertical reactions must equal this total.
//
// Layout (2 elem/span, 10 elements, 11 nodes):
//   Supports at nodes 1, 3, 5, 7, 9, 11.

#[test]
fn validation_five_span_skip_one_equilibrium() {
    let q = -10.0;
    let span: f64 = 4.0;
    let spans = [span, span, span, span, span];

    let loads = span_loads(&[1, 3, 5], 2, q);
    let input = make_continuous_beam(&spans, 2, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Support nodes: 1, 3, 5, 7, 9, 11
    let support_nodes = [1, 3, 5, 7, 9, 11];
    let sum_ry: f64 = support_nodes
        .iter()
        .map(|&nid| {
            results
                .reactions
                .iter()
                .find(|r| r.node_id == nid)
                .unwrap()
                .rz
        })
        .sum();

    // Total load = 3 loaded spans * 4m * 10 kN/m = 120 kN
    let total_load = q.abs() * 3.0 * span;
    assert_close(sum_ry, total_load, 0.01, "5-span skip-one: sum Ry = 120 kN");

    // All vertical reactions should be positive (upward) or zero
    // (the unloaded spans may have small negative reactions, but
    // the overall sum must balance).
    // Actually check that end support reactions are positive
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r11 = results.reactions.iter().find(|r| r.node_id == 11).unwrap().rz;
    assert!(r1 > 0.0, "R1 should be positive (upward): {:.4}", r1);
    assert!(r11 > 0.0, "R11 should be positive (upward): {:.4}", r11);

    // By symmetry, R1 = R11 and R3 = R9 and R5 = R7
    assert_close(r1, r11, 0.01, "5-span skip-one symmetry: R1 = R11");
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    let r9 = results.reactions.iter().find(|r| r.node_id == 9).unwrap().rz;
    assert_close(r3, r9, 0.01, "5-span skip-one symmetry: R3 = R9");
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rz;
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap().rz;
    assert_close(r5, r7, 0.01, "5-span skip-one symmetry: R5 = R7");
}

// ================================================================
// 8. Four-Span: Pattern for Maximum Midspan Moment in Interior Span
// ================================================================
//
// 4 equal spans L=5m. To maximize the sagging midspan moment in
// span 2 (an interior span), load spans 1,3 (the spans NOT adjacent
// on the far side) plus span 2 itself. By ACI/EC2 pattern loading
// rules, loading span 2 plus alternating remote spans (1 and 3)
// should give larger midspan moment in span 2 than all-loaded.
//
// Actually, for maximum midspan in span 2: load span 2 and skip
// its neighbors where possible. In a 4-span beam, loading spans
// 2 and 4 (skip 1 and 3) gives the alternate pattern that maximizes
// span 2 midspan moment.
//
// Layout (2 elem/span, 8 elements, 9 nodes):
//   Supports at nodes 1, 3, 5, 7, 9.
//   Midspan of span 2 = node 4 = m_end of element 3.

#[test]
fn validation_four_span_max_interior_midspan_moment() {
    let q = -10.0;
    let spans = [5.0, 5.0, 5.0, 5.0];

    // All spans loaded
    let loads_all = span_loads(&[1, 2, 3, 4], 2, q);
    let input_all = make_continuous_beam(&spans, 2, E, A, IZ, loads_all);
    let res_all = linear::solve_2d(&input_all).unwrap();

    // Pattern: load spans 2 and 4 (alternate even spans)
    let loads_pat = span_loads(&[2, 4], 2, q);
    let input_pat = make_continuous_beam(&spans, 2, E, A, IZ, loads_pat);
    let res_pat = linear::solve_2d(&input_pat).unwrap();

    // Midspan moment of span 2 = m_end of element 3 (first elem of span 2, j-end at midspan)
    let m_mid_all = res_all.element_forces.iter().find(|f| f.element_id == 3).unwrap().m_end;
    let m_mid_pat = res_pat.element_forces.iter().find(|f| f.element_id == 3).unwrap().m_end;

    // Both should be negative (sagging in solver convention)
    assert!(
        m_mid_all < 0.0,
        "All-loaded midspan span 2 should be negative (sagging): {:.4}",
        m_mid_all
    );
    assert!(
        m_mid_pat < 0.0,
        "Pattern midspan span 2 should be negative (sagging): {:.4}",
        m_mid_pat
    );

    // Pattern loading should give larger sagging magnitude
    assert!(
        m_mid_pat.abs() > m_mid_all.abs(),
        "Pattern gives larger midspan sagging in span 2: |{:.4}| > |{:.4}|",
        m_mid_pat,
        m_mid_all
    );
}
