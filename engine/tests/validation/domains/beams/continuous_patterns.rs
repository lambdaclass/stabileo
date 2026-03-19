/// Validation: Continuous Beam Pattern Loading
///
/// References:
///   - ACI 318-19, Section 6.4 (Pattern loading for moment envelopes)
///   - Eurocode 2, Section 5.1.3 (Pattern loading arrangements)
///   - Ghali & Neville, "Structural Analysis", Ch. 11
///
/// Tests verify continuous beam behavior under pattern loads:
///   1. Two-span continuous beam: symmetric UDL, exact reactions
///   2. Three-span: checkerboard pattern loading
///   3. Alternate span loading: maximum positive moment
///   4. Adjacent span loading: maximum negative moment at interior support
///   5. Two-span: unequal spans
///   6. Continuous beam: influence of number of spans on moment
///   7. Fixed-end continuous beam
///   8. Pattern load equilibrium
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two-Span Equal: Symmetric UDL
// ================================================================
//
// Two equal spans with UDL everywhere.
// Exact: R1 = 3qL/8, R_center = 10qL/8, R3 = 3qL/8

#[test]
fn validation_continuous_two_span_symmetric() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    let total_elems = 2 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = total_elems + 1;
    let mid_node = n + 1; // interior support
    let ql = q.abs() * span;

    // Reactions: R1 = R3 = 3qL/8, R2 = 10qL/8
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap().rz;
    let r_end = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().rz;

    assert_close(r1, 3.0 * ql / 8.0, 0.02, "2-span: R1 = 3qL/8");
    assert_close(r_mid, 10.0 * ql / 8.0, 0.02, "2-span: R_center = 10qL/8");
    assert_close(r_end, 3.0 * ql / 8.0, 0.02, "2-span: R3 = 3qL/8");
}

// ================================================================
// 2. Three-Span: Checkerboard Loading
// ================================================================
//
// Load spans 1 and 3 only (skip span 2).
// This creates maximum positive moment in loaded spans.

#[test]
fn validation_continuous_three_span_checkerboard() {
    let span = 5.0;
    let n = 5;
    let q: f64 = -10.0;

    // Load spans 1 and 3 only
    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (2 * n + 1)..=(3 * n) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry of checkerboard pattern (spans 1 and 3 loaded, span 2 unloaded):
    // The structure is symmetric about the center of span 2.
    // Deflection at center of span 1 should equal deflection at center of span 3
    let mid_span1 = n / 2 + 1;
    let mid_span3 = 2 * n + n / 2 + 1;

    let d1 = results.displacements.iter().find(|d| d.node_id == mid_span1).unwrap().uz;
    let d3 = results.displacements.iter().find(|d| d.node_id == mid_span3).unwrap().uz;

    let err = (d1 - d3).abs() / d1.abs().max(1e-10);
    assert!(err < 0.05,
        "Checkerboard symmetry: span1={:.6e}, span3={:.6e}", d1, d3);
}

// ================================================================
// 3. Alternate Span Loading: Maximum Positive Moment
// ================================================================
//
// For maximum positive moment in span 1: load span 1, skip span 2.
// vs full load: alternate produces larger midspan moment in span 1.

#[test]
fn validation_continuous_alternate_positive_moment() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    // Full load (all spans)
    let loads_full: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_full = make_continuous_beam(&[span, span], n, E, A, IZ, loads_full);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Span 1 only loaded
    let loads_alt: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_alt = make_continuous_beam(&[span, span], n, E, A, IZ, loads_alt);
    let res_alt = linear::solve_2d(&input_alt).unwrap();

    // Midspan deflection in span 1 should be larger with alternate loading
    let mid1 = n / 2 + 1;
    let d_full = res_full.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs();
    let d_alt = res_alt.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs();

    assert!(d_alt > d_full,
        "Alternate loading: more span 1 deflection: {:.6e} > {:.6e}", d_alt, d_full);
}

// ================================================================
// 4. Adjacent Span Loading: Maximum Hogging at Interior Support
// ================================================================
//
// Load both spans: maximum negative moment at interior support.
// vs single span: both loaded gives more negative moment.

#[test]
fn validation_continuous_adjacent_negative_moment() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    // Both spans loaded
    let loads_both: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_both = make_continuous_beam(&[span, span], n, E, A, IZ, loads_both);
    let res_both = linear::solve_2d(&input_both).unwrap();

    // Single span loaded
    let loads_one: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_one = make_continuous_beam(&[span, span], n, E, A, IZ, loads_one);
    let res_one = linear::solve_2d(&input_one).unwrap();

    // Interior support reaction (node n+1) should be larger with both loaded
    let mid_node = n + 1;
    let r_both = res_both.reactions.iter().find(|r| r.node_id == mid_node).unwrap().rz;
    let r_one = res_one.reactions.iter().find(|r| r.node_id == mid_node).unwrap().rz;

    assert!(r_both > r_one,
        "Both spans → larger interior reaction: {:.4} > {:.4}", r_both, r_one);
}

// ================================================================
// 5. Unequal Spans
// ================================================================
//
// Two-span beam with different span lengths.
// Longer span gets more reaction at the interior support.

#[test]
fn validation_continuous_unequal_spans() {
    let span1 = 4.0;
    let span2 = 8.0;
    let n = 4;
    let q: f64 = -10.0;

    let total_elems = 2 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span1, span2], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = total_elems + 1;
    let mid_node = n + 1;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap().rz;
    let r_end = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().rz;

    // Total load = q * (span1 + span2)
    let total_load = q.abs() * (span1 + span2);
    assert_close(r1 + r_mid + r_end, total_load, 0.02,
        "Unequal spans: ΣR = q(L1+L2)");

    // Interior support takes the most reaction
    assert!(r_mid > r1 && r_mid > r_end,
        "Interior support has max reaction: {:.4} > {:.4}, {:.4}",
        r_mid, r1, r_end);
}

// ================================================================
// 6. Number of Spans Effect on Interior Moment
// ================================================================
//
// More spans → different moment distribution.
// Interior support moment converges as spans increase.

#[test]
fn validation_continuous_span_count_effect() {
    let span = 5.0;
    let n = 4;
    let q: f64 = -10.0;

    let get_interior_reaction = |n_spans: usize| -> f64 {
        let total_elems = n_spans * n;
        let loads: Vec<SolverLoad> = (1..=total_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let spans: Vec<f64> = vec![span; n_spans];
        let input = make_continuous_beam(&spans, n, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();

        // First interior support (node n+1)
        results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz
    };

    let r_2span = get_interior_reaction(2);
    let r_3span = get_interior_reaction(3);
    let r_4span = get_interior_reaction(4);

    // All should have positive (upward) interior reaction
    assert!(r_2span > 0.0 && r_3span > 0.0 && r_4span > 0.0,
        "Interior reactions positive: {:.4}, {:.4}, {:.4}", r_2span, r_3span, r_4span);

    // 2-span interior reaction is different from multi-span (convergence)
    assert!((r_3span - r_4span).abs() < (r_2span - r_3span).abs(),
        "Interior reaction converges: Δ(3-4) < Δ(2-3)");
}

// ================================================================
// 7. Fixed-End Continuous Beam
// ================================================================
//
// Continuous beam with fixed ends: less deflection than pinned.

#[test]
fn validation_continuous_fixed_ends() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    let total_elems = 2 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Pinned continuous
    let input_pinned = make_continuous_beam(&[span, span], n, E, A, IZ, loads.clone());
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();

    // Fixed-end continuous (manual construction)
    let total_nodes = total_elems + 1;
    let elem_len = span / n as f64;
    let nodes: Vec<_> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..total_elems)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, n + 1, "rollerX"),
        (3, total_nodes, "fixed"),
    ];
    let input_fixed = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();

    // Midspan deflection should be less with fixed ends
    let mid1 = n / 2 + 1;
    let d_pinned = res_pinned.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs();
    let d_fixed = res_fixed.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs();

    assert!(d_fixed < d_pinned,
        "Fixed ends: less deflection: {:.6e} < {:.6e}", d_fixed, d_pinned);
}

// ================================================================
// 8. Pattern Load Equilibrium
// ================================================================
//
// For any pattern of loading, global equilibrium must hold.

#[test]
fn validation_continuous_pattern_equilibrium() {
    let span = 5.0;
    let n = 5;
    let q: f64 = -8.0;

    // Three-span: load spans 1 and 3 only
    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (2 * n + 1)..=(3 * n) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 2 * span (two spans loaded)
    let total_load = q.abs() * 2.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Pattern equilibrium: ΣR = total load");
}
