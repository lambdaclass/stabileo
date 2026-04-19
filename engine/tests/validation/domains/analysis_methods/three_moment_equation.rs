/// Validation: Three-Moment Equation (Clapeyron's Theorem)
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 5
///   - Hibbeler, "Structural Analysis", Ch. 12
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 5
///
/// The three-moment equation relates moments at three consecutive supports:
///   M_{n-1}·L_{n-1} + 2·M_n·(L_{n-1}+L_n) + M_{n+1}·L_n = -6EI[A_n/(L_n) + A_{n-1}/(L_{n-1})]
///
/// For equal spans with UDL:
///   M_center = -qL²/8 (two equal spans)
///
/// Tests:
///   1. Two equal spans + UDL: M_center = -qL²/8
///   2. Two unequal spans + UDL
///   3. Three equal spans + UDL
///   4. Two spans + point load on first span
///   5. Moment distribution comparison
///   6. Reaction at interior support
///   7. Span ratio effect on interior moment
///   8. Symmetry of three-span beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Two Equal Spans + UDL: M_center = qL²/8
// ================================================================

#[test]
fn validation_three_moment_two_equal_udl() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment from reactions
    // For two equal spans with UDL: M_interior = qL²/8
    // This is the bending moment at the interior support.

    // Use element that ends at interior node (element n, right end)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef_left.m_end.abs();

    let m_exact = q.abs() * span * span / 8.0;
    assert_close(m_interior, m_exact, 0.05,
        "Three-moment: M_center = qL²/8 for two equal spans");
}

// ================================================================
// 2. Two Unequal Spans + UDL
// ================================================================
//
// L1 = 4m, L2 = 6m, UDL on both.
// Three-moment equation: M1·L1 + 2·M2·(L1+L2) + M3·L2 = -6A
// With M1 = M3 = 0 (pinned ends):
// 2·M2·(L1+L2) = -qL1³/4 - qL2³/4
// M2 = -q(L1³+L2³)/(8(L1+L2))

#[test]
fn validation_three_moment_unequal_spans() {
    let l1 = 4.0;
    let l2 = 6.0;
    let n = 10;
    let q: f64 = -10.0;

    let n_spans = 2;
    let total_elems = n * n_spans; // make_continuous_beam creates n_per_span * n_spans elements

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l1, l2], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M2 = -q(L1³+L2³)/(8(L1+L2))
    let m_exact = q.abs() * (l1 * l1 * l1 + l2 * l2 * l2) / (8.0 * (l1 + l2));

    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end.abs();

    assert_close(m_interior, m_exact, 0.05,
        "Three-moment: unequal spans M = q(L1³+L2³)/(8(L1+L2))");
}

// ================================================================
// 3. Three Equal Spans + UDL
// ================================================================
//
// For three equal spans with UDL, using the three-moment equation:
// M_B = M_C = qL²/10

#[test]
fn validation_three_moment_three_spans() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moments (at supports B and C)
    let m_exact = q.abs() * span * span / 10.0;

    let ef_b = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_b = ef_b.m_end.abs();
    let ef_c = results.element_forces.iter().find(|e| e.element_id == 2 * n).unwrap();
    let m_c = ef_c.m_end.abs();

    assert_close(m_b, m_exact, 0.05,
        "Three-moment 3-span: M_B = qL²/10");
    assert_close(m_c, m_exact, 0.05,
        "Three-moment 3-span: M_C = qL²/10");

    // By symmetry: M_B = M_C
    assert_close(m_b, m_c, 0.01,
        "Three-moment 3-span: M_B = M_C (symmetry)");
}

// ================================================================
// 4. Two Spans + Point Load on First Span
// ================================================================
//
// Point load P at midspan of first span (equal spans).
// Three-moment: M_center = 5PL/32

#[test]
fn validation_three_moment_point_load() {
    let span = 8.0;
    let n = 16;
    let p = 20.0;

    let mid1 = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_interior = 3PL/32 (from three-moment equation for P at midspan of first span)
    let m_exact = 3.0 * p * span / 32.0;
    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end.abs();

    assert_close(m_interior, m_exact, 0.05,
        "Three-moment: M = 3PL/32 for point load on first span");
}

// ================================================================
// 5. Moment Distribution Comparison
// ================================================================
//
// Verify that the moment at the interior support from two-span UDL
// correctly distributes to both spans based on stiffness ratio.

#[test]
fn validation_three_moment_distribution() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // Only load on first span
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // For UDL on first span only:
    // FEM_left = qL²/8 (at interior end of loaded span)
    // Distribution factor for each span = 0.5 (equal spans, equal stiffness)
    // M_interior = FEM/2 = qL²/16
    let m_approx = q.abs() * span * span / 16.0;
    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end.abs();

    assert_close(m_interior, m_approx, 0.10,
        "Moment distribution: M ≈ qL²/16 for one span loaded");
}

// ================================================================
// 6. Reaction at Interior Support
// ================================================================
//
// Two equal spans with UDL: R_center = 10qL/8

#[test]
fn validation_three_moment_interior_reaction() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let interior_node = n + 1;
    let r_int = results.reactions.iter().find(|r| r.node_id == interior_node).unwrap();

    // R_center = 10qL/8 = 5qL/4
    let r_exact = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int.rz, r_exact, 0.02,
        "Three-moment: R_center = 5qL/4");

    // End reactions = 3qL/8 each
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    assert_close(r1.rz, r_end_exact, 0.02,
        "Three-moment: R_end = 3qL/8");
    assert_close(r_end.rz, r_end_exact, 0.02,
        "Three-moment: R_end2 = 3qL/8");

    // Total equilibrium
    let total_load = q.abs() * 2.0 * span;
    let total_reaction = r1.rz + r_int.rz + r_end.rz;
    assert_close(total_reaction, total_load, 0.02,
        "Three-moment: ΣR = qL_total");
}

// ================================================================
// 7. Span Ratio Effect on Interior Moment
// ================================================================
//
// As L2/L1 increases, the interior moment changes.
// For L2 → 0, M → 0. For L2 = L1, M = qL²/8.

#[test]
fn validation_three_moment_span_ratio() {
    let l1 = 6.0;
    let n = 10;
    let q: f64 = -10.0;

    let mut moments = Vec::new();
    let n_spans = 2;
    for l2_ratio in &[0.5, 1.0, 2.0] {
        let l2 = l1 * l2_ratio;
        let total_elems = n * n_spans; // make_continuous_beam creates n_per_span * n_spans elements

        let loads: Vec<SolverLoad> = (1..=total_elems)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect();
        let input = make_continuous_beam(&[l1, l2], n, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();

        let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
        moments.push(ef.m_end.abs());
    }

    // Equal spans (ratio 1.0) should have the known value
    let m_equal = q.abs() * l1 * l1 / 8.0;
    assert_close(moments[1], m_equal, 0.05,
        "Span ratio: equal spans → qL²/8");

    // Shorter second span → smaller interior moment
    assert!(moments[0] < moments[1],
        "Span ratio: shorter L2 → smaller M: {:.4} < {:.4}", moments[0], moments[1]);
}

// ================================================================
// 8. Symmetry of Three-Span Beam
// ================================================================

#[test]
fn validation_three_moment_symmetry() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions should be equal (symmetry)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();
    assert_close(r1.rz, r_end.rz, 0.01,
        "3-span symmetry: R_left = R_right");

    // Interior support reactions should be equal
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    assert_close(r_b.rz, r_c.rz, 0.01,
        "3-span symmetry: R_B = R_C");

    // Deflections in span 1 and span 3 should be symmetric
    let mid1 = n / 2 + 1;
    let mid3 = 2 * n + n / 2 + 1;
    let d1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == mid3).unwrap();
    assert_close(d1.uz, d3.uz, 0.01,
        "3-span symmetry: δ_span1 = δ_span3");
}
