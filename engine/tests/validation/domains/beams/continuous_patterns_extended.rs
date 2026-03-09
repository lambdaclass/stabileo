/// Validation: Continuous Beam Pattern Loading — Extended
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 11
///   - Timoshenko & Young, "Theory of Structures", Ch. 8
///   - ACI 318-19, Section 6.4 (Pattern loading for moment envelopes)
///
/// Tests verify additional continuous beam behaviors:
///   1. Four-span equal: UDL everywhere, end vs interior reactions
///   2. Three-span: single interior span loaded only
///   3. Two-span: triangular load on one span
///   4. Five-span: reaction symmetry under full UDL
///   5. Two-span: point load at interior support
///   6. Three-span unequal: equilibrium under full UDL
///   7. Two-span: stiffness ratio effect (different Iz per span)
///   8. Four-span: alternate span loading vs full load deflection
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Four-Span Equal: UDL Everywhere
// ================================================================
//
// Four equal spans with UDL on all spans.
// Exact coefficients (four-span equal, UDL):
//   R1 = R5 = 0.393*qL, R2 = R4 = 1.143*qL, R3 = 0.929*qL
// Total = 2*(0.393 + 1.143) + 0.929 = 4.001 ≈ 4qL (check: 4 spans)

#[test]
fn validation_continuous_four_span_full_udl() {
    let span = 5.0;
    let n = 5;
    let q: f64 = -10.0;

    let total_elems = 4 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = total_elems + 1;
    let ql = q.abs() * span;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let _r3 = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap().ry;
    let r4 = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    // Symmetry: R1 ≈ R5, R2 ≈ R4
    assert_close(r1, r5, 0.01, "4-span: R1 = R5 by symmetry");
    assert_close(r2, r4, 0.01, "4-span: R2 = R4 by symmetry");

    // Equilibrium: sum = 4*q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 4.0 * ql, 0.02, "4-span: ΣR = 4qL");

    // End reactions are smaller than interior ones
    assert!(r2 > r1, "4-span: interior > end reaction: {:.4} > {:.4}", r2, r1);
}

// ================================================================
// 2. Three-Span: Only Middle Span Loaded
// ================================================================
//
// Load span 2 only (skip spans 1 and 3).
// By symmetry the two interior supports carry equal reactions.
// End supports should have negative (downward) reactions due to uplift.

#[test]
fn validation_continuous_three_span_middle_loaded() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    // Load only span 2 (elements n+1 to 2*n)
    let loads: Vec<SolverLoad> = ((n + 1)..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = 3 * n + 1;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap().ry;
    let r_d = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    // By symmetry: R1 = R4, R_B = R_C
    assert_close(r1, r_d, 0.02, "Middle loaded: R1 = R4 by symmetry");
    assert_close(r_b, r_c, 0.02, "Middle loaded: R_B = R_C by symmetry");

    // Interior supports carry most of the load (positive, upward)
    assert!(r_b > 0.0, "Middle loaded: R_B positive: {:.4}", r_b);

    // Equilibrium
    let total_load = q.abs() * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Middle loaded: ΣR = qL");
}

// ================================================================
// 3. Two-Span: Triangular Load on Span 1
// ================================================================
//
// Linearly varying load on span 1 (0 at left, q at right).
// Span 2 unloaded. Total load = q*L/2.
// Equilibrium must hold and interior support takes more load than end.

#[test]
fn validation_continuous_two_span_triangular() {
    let span = 8.0;
    let n = 8;
    let q: f64 = -12.0;

    // Triangular load on span 1: linearly increasing from 0 to q
    let elem_len = span / n as f64;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_start = (i - 1) as f64 * elem_len;
            let x_end = i as f64 * elem_len;
            let q_i = q * x_start / span;
            let q_j = q * x_end / span;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i, q_j, a: None, b: None,
            })
        })
        .collect();

    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = 2 * n + 1;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_mid = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let _r_end = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    // Total load = q*L/2 = 12*8/2 = 48
    let total_load = q.abs() * span / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Triangular: ΣR = qL/2");

    // Load is concentrated toward the interior support,
    // so R_mid should be largest
    assert!(r_mid > r1, "Triangular: R_mid > R1: {:.4} > {:.4}", r_mid, r1);
}

// ================================================================
// 4. Five-Span Equal: Full UDL Symmetry
// ================================================================
//
// Five equal spans, full UDL. Odd number of spans → symmetric.
// R1 = R6, R2 = R5, R3 = R4 by structural symmetry.

#[test]
fn validation_continuous_five_span_symmetry() {
    let span = 4.0;
    let n = 4;
    let q: f64 = -10.0;

    let total_elems = 5 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[span, span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = total_elems + 1;
    let ql = q.abs() * span;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r3 = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap().ry;
    let r4 = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == 4 * n + 1).unwrap().ry;
    let r6 = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    // Symmetry checks
    assert_close(r1, r6, 0.01, "5-span: R1 = R6");
    assert_close(r2, r5, 0.01, "5-span: R2 = R5");
    assert_close(r3, r4, 0.01, "5-span: R3 = R4");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 5.0 * ql, 0.02, "5-span: ΣR = 5qL");
}

// ================================================================
// 5. Two-Span: Point Load at Interior Support
// ================================================================
//
// P applied directly at the interior support.
// Both spans unloaded. By symmetry (equal spans): R1 = R3, R2 carries most.
// Exact: R1 = R3 = 0, R2 = P (no bending for load directly at support).
// Actually for a load directly on the interior pin, the beam transfers
// some to the ends via continuity. But for a simply-supported-at-pin:
// it depends on whether the load is at the supported node.
// With pinned+roller+roller: load at roller node → roller takes it directly.

#[test]
fn validation_continuous_two_span_point_at_support() {
    let span = 6.0;
    let n = 6;
    let p: f64 = -100.0;

    let mid_node = n + 1; // interior support node

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: p, mz: 0.0,
    })];

    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = 2 * n + 1;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap().ry;
    let r_end = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    // Equilibrium: sum of reactions = P (magnitude)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p.abs(), 0.02, "Point at support: ΣR = P");

    // Load is applied at the support node directly, so the interior
    // support reaction should carry the bulk of the load.
    assert!(r_mid > r1.abs() && r_mid > r_end.abs(),
        "Point at support: R_mid dominates: {:.4} vs {:.4}, {:.4}", r_mid, r1, r_end);

    // By symmetry of equal spans: R1 ≈ R_end
    assert_close(r1, r_end, 0.02, "Point at support: R1 = R_end by symmetry");
}

// ================================================================
// 6. Three-Span Unequal: Equilibrium Under Full UDL
// ================================================================
//
// Three spans of different lengths, full UDL.
// Verifies equilibrium and that the longest span attracts the most load
// to its adjacent supports.

#[test]
fn validation_continuous_three_span_unequal_equilibrium() {
    let l1 = 4.0;
    let l2 = 7.0;
    let l3 = 5.0;
    let n = 4;
    let q: f64 = -10.0;

    let total_elems = 3 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2, l3], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_nodes = total_elems + 1;

    // Equilibrium: total = q*(L1+L2+L3)
    let total_load = q.abs() * (l1 + l2 + l3);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "3-span unequal: ΣR = q*ΣL");

    // All reactions must be positive (upward)
    for r in &results.reactions {
        assert!(r.ry > 0.0,
            "3-span unequal: all reactions positive, node {} has ry={:.4}", r.node_id, r.ry);
    }

    // The two supports bounding the longest span (L2) should carry
    // more than the end supports
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap().ry;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_d = results.reactions.iter().find(|r| r.node_id == total_nodes).unwrap().ry;

    assert!(r_b > r_a, "3-span unequal: R_B > R_A: {:.4} > {:.4}", r_b, r_a);
    assert!(r_c > r_d, "3-span unequal: R_C > R_D: {:.4} > {:.4}", r_c, r_d);
}

// ================================================================
// 7. Two-Span: Stiffness Ratio Effect (Different Iz)
// ================================================================
//
// Two-span beam where span 2 has a stiffer section (larger Iz).
// The stiffer span attracts more moment at the interior support.
// Compare deflections: stiffer span deflects less.

#[test]
fn validation_continuous_two_span_stiffness_ratio() {
    let span = 6.0;
    let n = 6;
    let q: f64 = -10.0;
    let iz_stiff = IZ * 4.0; // span 2 is 4x stiffer

    let total_elems = 2 * n;
    let total_nodes = total_elems + 1;
    let elem_len = span / n as f64;

    // Build nodes
    let nodes: Vec<_> = (0..total_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();

    // Span 1 elements use section 1 (IZ), span 2 uses section 2 (iz_stiff)
    let elems: Vec<_> = (0..total_elems)
        .map(|i| {
            let sec_id = if i < n { 1 } else { 2 };
            (i + 1, "frame", i + 1, i + 2, 1, sec_id, false, false)
        })
        .collect();

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n + 1, "rollerX"),
        (3, total_nodes, "rollerX"),
    ];

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_stiff)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflections
    let mid_span1 = n / 2 + 1;
    let mid_span2 = n + n / 2 + 1;

    let d1 = results.displacements.iter().find(|d| d.node_id == mid_span1).unwrap().uy.abs();
    let d2 = results.displacements.iter().find(|d| d.node_id == mid_span2).unwrap().uy.abs();

    // Stiffer span (span 2) deflects less
    assert!(d2 < d1,
        "Stiffness ratio: stiffer span less deflection: {:.6e} < {:.6e}", d2, d1);

    // Equilibrium
    let total_load = q.abs() * 2.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Stiffness ratio: ΣR = 2qL");
}

// ================================================================
// 8. Four-Span: Alternate Span Loading vs Full Load Deflection
// ================================================================
//
// Alternate loading (spans 1, 3) produces larger midspan deflection
// in loaded spans than full load (all 4 spans), because unloaded
// adjacent spans provide less restraint.

#[test]
fn validation_continuous_four_span_alternate_vs_full() {
    let span = 5.0;
    let n = 5;
    let q: f64 = -10.0;

    let total_elems = 4 * n;

    // Full load: all 4 spans
    let loads_full: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_full = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads_full);
    let res_full = linear::solve_2d(&input_full).unwrap();

    // Alternate load: spans 1 and 3 only
    let mut loads_alt: Vec<SolverLoad> = Vec::new();
    for i in 1..=n {
        loads_alt.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    for i in (2 * n + 1)..=(3 * n) {
        loads_alt.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }
    let input_alt = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads_alt);
    let res_alt = linear::solve_2d(&input_alt).unwrap();

    // Midspan of span 1 deflection
    let mid1 = n / 2 + 1;
    let d_full = res_full.displacements.iter().find(|d| d.node_id == mid1).unwrap().uy.abs();
    let d_alt = res_alt.displacements.iter().find(|d| d.node_id == mid1).unwrap().uy.abs();

    // Alternate loading: span 1 deflection exceeds full-load deflection
    assert!(d_alt > d_full,
        "4-span alternate: more span 1 deflection: {:.6e} > {:.6e}", d_alt, d_full);

    // Equilibrium for alternate loading: 2 spans loaded
    let total_alt = q.abs() * 2.0 * span;
    let sum_alt: f64 = res_alt.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_alt, total_alt, 0.02, "4-span alternate: ΣR = 2qL");
}
