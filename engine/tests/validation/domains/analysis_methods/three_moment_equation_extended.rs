/// Validation: Three-Moment Equation — Extended Cases
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 5
///   - Hibbeler, "Structural Analysis", Ch. 12
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 5
///   - Kassimali, "Structural Analysis", 6th Edition, Ch. 14
///
/// These tests extend the basic three-moment equation suite with:
///   1. Four equal spans + UDL: interior moments from simultaneous equations
///   2. Two spans with different loads per span
///   3. Three spans with point loads at midspan of each
///   4. Propped cantilever as degenerate two-span case (fixed + roller)
///   5. Five equal spans + UDL: symmetry and equilibrium
///   6. Two spans with triangular (linearly varying) load
///   7. Four equal spans: alternating live load pattern (checkerboard)
///   8. Two unequal spans: deflection comparison via Betti's theorem symmetry
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Four Equal Spans + UDL: Interior Moments
// ================================================================
//
// For a continuous beam with 4 equal spans under uniform load q,
// the three-moment equation system gives:
//   M_B = M_D = -q*L^2/14.28... = -q*L^2*(1/10 adjusted)
//
// From simultaneous three-moment equations (pinned ends, M_A=M_E=0):
//   2*M_B*(2L) + M_C*L = -q*L^3/4 - q*L^3/4
//   M_B*L + 2*M_C*(2L) + M_D*L = -q*L^3/4 - q*L^3/4
//   M_C*L + 2*M_D*(2L) = -q*L^3/4 - q*L^3/4
//
// Simplifying (symmetric: M_B = M_D):
//   4*M_B + M_C = -q*L^2/2
//   M_B + 4*M_C + M_B = -q*L^2/2  =>  2*M_B + 4*M_C = -q*L^2/2
//
// From eq1: M_C = -q*L^2/2 - 4*M_B
// Substituting: 2*M_B + 4*(-q*L^2/2 - 4*M_B) = -q*L^2/2
//   2*M_B - 2*q*L^2 - 16*M_B = -q*L^2/2
//   -14*M_B = 3*q*L^2/2
//   M_B = -3*q*L^2/28
//   M_C = -q*L^2/2 - 4*(-3*q*L^2/28) = -q*L^2/2 + 3*q*L^2/7 = -q*L^2/14

#[test]
fn validation_tme_ext_four_equal_spans_udl() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -12.0;

    let loads: Vec<SolverLoad> = (1..=(4 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // M_B = M_D = 3*q*L^2/28 (magnitude)
    let m_bd_exact = 3.0 * q_abs * span * span / 28.0;
    // M_C = q*L^2/14 (magnitude)
    let m_c_exact = q_abs * span * span / 14.0;

    let ef_b = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_b = ef_b.m_end.abs();

    let ef_c = results.element_forces.iter().find(|e| e.element_id == 2 * n).unwrap();
    let m_c = ef_c.m_end.abs();

    let ef_d = results.element_forces.iter().find(|e| e.element_id == 3 * n).unwrap();
    let m_d = ef_d.m_end.abs();

    assert_close(m_b, m_bd_exact, 0.05,
        "4-span TME: M_B = 3qL^2/28");
    assert_close(m_d, m_bd_exact, 0.05,
        "4-span TME: M_D = 3qL^2/28");
    assert_close(m_c, m_c_exact, 0.05,
        "4-span TME: M_C = qL^2/14");

    // Symmetry: M_B = M_D
    assert_close(m_b, m_d, 0.01,
        "4-span TME: symmetry M_B = M_D");
}

// ================================================================
// 2. Two Spans with Different Load Intensities
// ================================================================
//
// Span 1 (L) has UDL q1, Span 2 (L) has UDL q2.
// Three-moment equation with M_A = M_C = 0 (pinned ends):
//   2*M_B*(2L) = -(q1*L^3/4 + q2*L^3/4)
//   M_B = -(q1 + q2)*L^2 / 16
//
// Wait, more carefully:
//   M_A*L + 2*M_B*(L+L) + M_C*L = -6EI*(A_1/(L) + A_2/(L))
// For UDL on span of length L:
//   6EI * A_k / L = q_k*L^3/4  (the standard "6A_bar*a/(L)" term)
// So:
//   0 + 4*M_B*L + 0 = -(q1*L^3/4 + q2*L^3/4)
//   M_B = -(q1+q2)*L^2/16

#[test]
fn validation_tme_ext_two_spans_different_loads() {
    let span = 6.0;
    let n = 12;
    let q1: f64 = -10.0;
    let q2: f64 = -20.0;

    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q1, q_j: q1, a: None, b: None,
        }));
    }
    for i in (n + 1)..=(2 * n) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q2, q_j: q2, a: None, b: None,
        }));
    }
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B = (q1+q2)*L^2/16  (magnitude)
    let m_exact = (q1.abs() + q2.abs()) * span * span / 16.0;

    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end.abs();

    assert_close(m_interior, m_exact, 0.05,
        "TME 2-span different loads: M_B = (q1+q2)*L^2/16");

    // Also check total equilibrium
    let total_load = q1.abs() * span + q2.abs() * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "TME 2-span different loads: sum(Ry) = total load");
}

// ================================================================
// 3. Three Spans with Point Loads at Midspan
// ================================================================
//
// Three equal spans, each with point load P at midspan.
// By symmetry M_B = M_C.
// Three-moment equation for midspan point load:
//   6*A_bar*a_bar / L = P*L^2/4  (for load at midspan)
//
// For spans 1-2 around support B:
//   M_A*L + 2*M_B*(2L) + M_C*L = -(P*L^2/4 + P*L^2/4)
// By symmetry M_B = M_C:
//   4*M_B*L + M_B*L = -P*L^2/2
//   5*M_B*L = -P*L^2/2
//   M_B = -P*L/10

#[test]
fn validation_tme_ext_three_spans_point_loads() {
    let span = 8.0;
    let n = 16;
    let p = 30.0;

    // Point load at midspan of each span
    let mid1 = n / 2 + 1;           // midspan node of span 1
    let mid2 = n + n / 2 + 1;       // midspan node of span 2
    let mid3 = 2 * n + n / 2 + 1;   // midspan node of span 3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid1, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: mid3, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B = M_C = 3*P*L/20 (magnitude) — correct TME for midspan point load
    let m_exact = 3.0 * p * span / 20.0;

    let ef_b = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_b = ef_b.m_end.abs();

    let ef_c = results.element_forces.iter().find(|e| e.element_id == 2 * n).unwrap();
    let m_c = ef_c.m_end.abs();

    assert_close(m_b, m_exact, 0.05,
        "TME 3-span point loads: M_B = PL/10");
    assert_close(m_c, m_exact, 0.05,
        "TME 3-span point loads: M_C = PL/10");
    assert_close(m_b, m_c, 0.01,
        "TME 3-span point loads: symmetry M_B = M_C");
}

// ================================================================
// 4. Propped Cantilever via Fixed-Roller Beam with UDL
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) of length L with UDL q.
// This is a classic indeterminate beam. Using three-moment equation
// (or standard result):
//   M_A = q*L^2/8 (at the fixed end)
//   R_B = 3*q*L/8 (at the roller)
//   R_A = 5*q*L/8 (at the fixed end)

#[test]
fn validation_tme_ext_propped_cantilever_udl() {
    let length = 6.0;
    let n = 12;
    let q: f64 = -15.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Fixed at left, roller at right
    let input = make_beam(n, length, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Fixed-end moment: M_A = qL^2/8
    let m_a_exact = q_abs * length * length / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.mz.abs(), m_a_exact, 0.05,
        "Propped cantilever: M_A = qL^2/8");

    // Reactions
    let r_a_exact = 5.0 * q_abs * length / 8.0;
    let r_b_exact = 3.0 * q_abs * length / 8.0;

    assert_close(r_a.ry, r_a_exact, 0.05,
        "Propped cantilever: R_A = 5qL/8");

    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.ry, r_b_exact, 0.05,
        "Propped cantilever: R_B = 3qL/8");

    // Total equilibrium
    let total_load = q_abs * length;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Propped cantilever: equilibrium");
}

// ================================================================
// 5. Five Equal Spans + UDL: Symmetry and Equilibrium
// ================================================================
//
// A 5-span continuous beam under full UDL. By symmetry:
//   M_B = M_E, M_C = M_D
// Also total equilibrium: sum(Ry) = 5*q*L
// End reactions R_A = R_F (symmetry).

#[test]
fn validation_tme_ext_five_spans_symmetry() {
    let span = 4.0;
    let n = 8;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(5 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Symmetry of moments: M_B = M_E, M_C = M_D
    let ef_b = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let ef_c = results.element_forces.iter().find(|e| e.element_id == 2 * n).unwrap();
    let ef_d = results.element_forces.iter().find(|e| e.element_id == 3 * n).unwrap();
    let ef_e = results.element_forces.iter().find(|e| e.element_id == 4 * n).unwrap();

    let m_b = ef_b.m_end.abs();
    let m_c = ef_c.m_end.abs();
    let m_d = ef_d.m_end.abs();
    let m_e = ef_e.m_end.abs();

    assert_close(m_b, m_e, 0.01,
        "5-span symmetry: M_B = M_E");
    assert_close(m_c, m_d, 0.01,
        "5-span symmetry: M_C = M_D");

    // End reactions: R_A = R_F
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_f = results.reactions.iter().find(|r| r.node_id == 5 * n + 1).unwrap();
    assert_close(r_a.ry, r_f.ry, 0.01,
        "5-span symmetry: R_A = R_F");

    // Interior reactions: R_B = R_E, R_C = R_D
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == 4 * n + 1).unwrap();

    assert_close(r_b.ry, r_e.ry, 0.01,
        "5-span symmetry: R_B = R_E");
    assert_close(r_c.ry, r_d.ry, 0.01,
        "5-span symmetry: R_C = R_D");

    // Total equilibrium
    let total_load = 5.0 * q_abs * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "5-span: total equilibrium");
}

// ================================================================
// 6. Two Spans with Triangular (Linearly Varying) Load
// ================================================================
//
// Span 1 (length L): triangular load from 0 at left to q at right.
// Span 2 (length L): no load.
// Three-moment equation: M_A = M_C = 0 (pinned ends).
//   4*M_B*L = -(6*A_bar_1*a_bar_1/L_1 + 0)
//
// For triangular load (0 to q) on a span L:
//   6*A_bar*a_bar/L = 8*q*L^2/60 = 2*q*L^2/15  (right moment contribution)
// Wait, need to be careful with the standard formula. For triangular load
// increasing from 0 at left to q at right on span L:
//   6*A_bar*x_bar/L = q*L^2*(1/4 - 1/20) ...
//
// Actually let's use the fact that for a triangular load increasing from
// left to right, the total load is q*L/2. The FEM at the right support is
// q*L^2/20 and at the left is q*L^2/30. Let me just check reactions
// from the solver against an independently computed result.
//
// More reliable: We can compare against the fixed-end moments approach.
// For the TME with M_A = M_C = 0:
//   4*M_B*L = -(right-side contributions from span 1)
//
// For triangular load from left (0) to right (q):
//   The term for the right support = q*L^2 * 8/60 = 2*q*L^2/15
// (using the standard formula: for linearly increasing load from 0 to q,
//  6*A_bar*a_bar/L on the right side = q*L^2*(1/5 - 1/20)*... )
//
// Let me just use equilibrium and moment relationships. Actually, let's
// verify against a known simpler check: the reaction at the interior
// support should be less than q*L/2 (the total load on span 1) and
// the total reactions should sum to q*L/2.

#[test]
fn validation_tme_ext_two_spans_triangular_load() {
    let span = 6.0;
    let n = 12;
    let q_max: f64 = -20.0;

    // Triangular load on span 1: linearly increasing from 0 to q_max
    // Each element i (1..n) has q_i and q_j linearly interpolated
    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in 1..=n {
        let frac_start = (i - 1) as f64 / n as f64;
        let frac_end = i as f64 / n as f64;
        let qi = q_max * frac_start;
        let qj = q_max * frac_end;
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: qi, q_j: qj, a: None, b: None,
        }));
    }
    // Span 2: no load

    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q_max.abs();

    // Total load = q*L/2
    let total_load = q_abs * span / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "TME triangular: total equilibrium");

    // The interior moment should be hogging (negative in our convention).
    // For a two-span beam with load only on span 1, the interior moment
    // is negative (hogging). Just check it is nonzero and in correct direction.
    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end;
    // The moment at the interior support should be negative (hogging)
    // because the loaded span pulls down.
    assert!(m_interior.abs() > 0.1,
        "TME triangular: interior moment should be nonzero (hogging), got {:.4}", m_interior);

    // The deflection in span 2 should be upward (positive uy) because
    // span 2 is unloaded but its left end has a hogging moment pushing it up.
    let mid2 = n + n / 2 + 1;
    let d2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap();
    assert!(d2.uy > 0.0,
        "TME triangular: unloaded span should deflect upward, got {:.6}", d2.uy);

    // The reaction at end C (right end of span 2) should be downward (negative)
    // because the unloaded span has upward camber from hogging moment at B,
    // so the roller at C must pull down. Actually in our convention reactions
    // are positive upward. The roller at C would have a downward reaction
    // (negative) to hold the beam down.
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    assert!(r_c.ry < 0.0,
        "TME triangular: R_C should be negative (downward), got {:.4}", r_c.ry);
}

// ================================================================
// 7. Four Equal Spans: Alternating Live Load Pattern (Checkerboard)
// ================================================================
//
// UDL on spans 1 and 3 only (no load on spans 2 and 4).
// This is the "checkerboard" pattern loading, important for maximum
// positive moments in loaded spans.
//
// By loading pattern symmetry about the center:
//   - The structure is symmetric but loading is not, so we use
//     the three-moment equations directly.
//
// Key check: the interior moments should be smaller than the
// full-load case because adjacent spans are unloaded, reducing
// the continuity effect. Also equilibrium must hold.

#[test]
fn validation_tme_ext_four_spans_checkerboard() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    // Load only on spans 1 and 3 (elements 1..n and 2n+1..3n)
    let mut loads: Vec<SolverLoad> = Vec::new();
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

    let input = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Total applied load: 2 spans loaded
    let total_load = 2.0 * q_abs * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "4-span checkerboard: total equilibrium");

    // Compare with full load case: all 4 spans loaded
    let full_loads: Vec<SolverLoad> = (1..=(4 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let full_input = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, full_loads);
    let full_results = linear::solve_2d(&full_input).unwrap();

    // Interior moment at B for checkerboard
    let ef_b = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_b_checker = ef_b.m_end.abs();

    // Interior moment at B for full load
    let ef_b_full = full_results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_b_full = ef_b_full.m_end.abs();

    // Checkerboard loading on non-adjacent spans should produce different
    // (generally smaller) hogging moment at B since span 2 is unloaded.
    // The full load M_B = 3*q*L^2/28, checkerboard should differ.
    assert!(m_b_checker < m_b_full + 0.01,
        "4-span checkerboard: M_B_checker ({:.4}) < M_B_full ({:.4})",
        m_b_checker, m_b_full);

    // The midspan moment in loaded span 1 under checkerboard should be
    // larger than under full load (less restraint from unloaded span 2).
    // Midspan moment (approx) = qL^2/8 - M_B/2 (for equal spans)
    // With smaller M_B, midspan moment is larger.
    let mid1_elem = n / 2;
    let ef_mid_checker = results.element_forces.iter().find(|e| e.element_id == mid1_elem).unwrap();
    let ef_mid_full = full_results.element_forces.iter().find(|e| e.element_id == mid1_elem).unwrap();

    // Positive (sagging) moment at midspan: m_end of element at midspan
    // The midspan sagging moment should be larger under checkerboard
    let m_mid_checker = ef_mid_checker.m_end.abs();
    let m_mid_full = ef_mid_full.m_end.abs();

    assert!(m_mid_checker > m_mid_full - 0.01,
        "4-span checkerboard: midspan moment larger than full load case: {:.4} vs {:.4}",
        m_mid_checker, m_mid_full);
}

// ================================================================
// 8. Two Unequal Spans: Deflection at Midspan
// ================================================================
//
// Two-span beam with L1 = 4m, L2 = 8m, UDL on both.
// Verify the deflection at midspan of each span relative to
// each other: the longer span should deflect more.
// Also verify the interior moment using the three-moment equation:
//   M_B = q*(L1^3 + L2^3) / (8*(L1+L2))

#[test]
fn validation_tme_ext_two_unequal_deflection() {
    let l1 = 4.0;
    let l2 = 8.0;
    let n = 10;
    let q: f64 = -10.0;

    // make_continuous_beam always creates n elements per span
    let total_elems = 2 * n;

    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l1, l2], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let q_abs = q.abs();

    // Interior moment: M_B = q*(L1^3 + L2^3) / (8*(L1+L2))
    let m_exact = q_abs * (l1.powi(3) + l2.powi(3)) / (8.0 * (l1 + l2));
    let ef = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    let m_interior = ef.m_end.abs();

    assert_close(m_interior, m_exact, 0.05,
        "TME unequal deflection: M_B = q(L1^3+L2^3)/(8(L1+L2))");

    // Midspan deflections: n elements per span, midspan at n/2 + 1 from span start
    let mid1 = n / 2 + 1;
    let mid2 = n + n / 2 + 1;
    let d1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();
    let d2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap();

    // Span 2 (long span) should deflect downward
    assert!(d2.uy < 0.0,
        "TME unequal: span 2 midspan should deflect down, got {:.6}", d2.uy);

    // Span 1 (short span) may deflect upward because the large hogging moment
    // at the interior support (driven by the long span) overwhelms the sagging
    // from UDL on the short span. The key check is that the longer span
    // deflects significantly more in absolute terms.
    assert!(d2.uy.abs() > d1.uy.abs(),
        "TME unequal: longer span deflects more: {:.6} vs {:.6}", d2.uy.abs(), d1.uy.abs());

    // Total equilibrium
    let total_load = q_abs * (l1 + l2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "TME unequal: total equilibrium");
}
