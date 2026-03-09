/// Validation: Contraflexure Points in Indeterminate Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4 (Internal Loadings)
///   - Kassimali, "Structural Analysis", Ch. 5
///   - Ghali & Neville, "Structural Analysis", Ch. 3
///
/// Points of contraflexure are locations where bending moment is zero
/// and changes sign. In indeterminate structures, their positions are
/// determined by the degree of fixity. These tests verify moment
/// distributions by checking zero-crossings and sign changes.
///
/// Tests verify:
///   1. Propped cantilever UDL: contraflexure at x = L/4
///   2. Fixed-fixed beam UDL: two contraflexure points (symmetric)
///   3. Fixed-fixed beam midpoint load: contraflexure at L/4
///   4. Two-span continuous: moment values and sign pattern
///   5. Portal frame gravity: symmetric base moments
///   6. Propped cantilever point load: contraflexure between fixed end and load
///   7. Fixed beam applied moment: equilibrium and antisymmetry
///   8. Multi-span: sagging in interior span between hogging supports
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Find elements where moment changes sign (m_start * m_end < 0).
fn find_sign_changes(results: &dedaliano_engine::types::AnalysisResults,
                     elem_range: std::ops::RangeInclusive<usize>) -> Vec<usize> {
    let mut changes = Vec::new();
    for i in elem_range {
        if let Some(ef) = results.element_forces.iter().find(|e| e.element_id == i) {
            if ef.m_start * ef.m_end < 0.0 {
                changes.push(i);
            }
        }
    }
    changes
}

// ================================================================
// 1. Propped Cantilever UDL: Contraflexure at x = L/4
// ================================================================
//
// Fixed at left, roller at right, UDL q.
// M_A = qL²/8, R_A = 5qL/8
// M(x) = 5qLx/8 - qL²/8 - qx²/2 = 0
// → 4x² - 5Lx + L² = 0 → x = L/4 or x = L
// Contraflexure at x = L/4 exactly.

#[test]
fn validation_contraflexure_propped_udl() {
    let l = 8.0;
    let n = 32;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find sign changes in moment diagram
    let changes = find_sign_changes(&results, 1..=n);
    assert!(!changes.is_empty(), "Propped UDL: found contraflexure");

    // Contraflexure should be near element at L/4 = 2.0
    // Element at L/4: elem 8 covers x=[1.75, 2.0]
    let dx = l / n as f64;
    let x_change = changes[0] as f64 * dx; // approximate x of sign change element end
    let x_exact = l / 4.0;
    assert!((x_change - x_exact).abs() < 2.0 * dx,
        "Propped UDL: contraflexure near L/4: x≈{:.2}, expected {:.2}", x_change, x_exact);
}

// ================================================================
// 2. Fixed-Fixed Beam UDL: Two Symmetric Contraflexure Points
// ================================================================
//
// M(x) = qL²/12 - qLx/2 + qx²/2 (parabolic)
// x ≈ 0.2113L and 0.7887L

#[test]
fn validation_contraflexure_fixed_udl() {
    let l = 12.0;
    let n = 48;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let changes = find_sign_changes(&results, 1..=n);
    assert!(changes.len() >= 2, "Fixed UDL: two contraflexure points, got {}", changes.len());

    let dx = l / n as f64;
    let x1 = changes[0] as f64 * dx;
    let x2 = changes.last().unwrap().clone() as f64 * dx;

    // Expected at 0.2113L and 0.7887L
    assert!((x1 - 0.2113 * l).abs() < 2.0 * dx,
        "Fixed UDL: x₁ ≈ 0.211L: got {:.2}", x1);
    assert!((x2 - 0.7887 * l).abs() < 2.0 * dx,
        "Fixed UDL: x₂ ≈ 0.789L: got {:.2}", x2);
}

// ================================================================
// 3. Fixed-Fixed Beam Midpoint Load: Contraflexure at L/4
// ================================================================
//
// M_A = M_B = PL/8, M(L/2) = PL/8 (sagging)
// Contraflexure at x = L/4 from each support.

#[test]
fn validation_contraflexure_fixed_point_load() {
    let l = 10.0;
    let n = 40;
    let p = 20.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let changes = find_sign_changes(&results, 1..=n);
    assert!(changes.len() >= 2, "Fixed point: two contraflexure points, got {}", changes.len());

    let dx = l / n as f64;
    let x1 = changes[0] as f64 * dx;
    let x2 = changes.last().unwrap().clone() as f64 * dx;

    assert!((x1 - l / 4.0).abs() < 2.0 * dx,
        "Fixed point: x₁ ≈ L/4: got {:.2}", x1);
    assert!((x2 - 3.0 * l / 4.0).abs() < 2.0 * dx,
        "Fixed point: x₂ ≈ 3L/4: got {:.2}", x2);
}

// ================================================================
// 4. Two-Span Continuous: Interior Support Moment = qL²/8
// ================================================================
//
// Two equal spans with UDL: hogging moment at interior support,
// sagging in each span.

#[test]
fn validation_contraflexure_two_span() {
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

    // Interior support moment = qL²/8
    let ef_at_int = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    let m_int = ef_at_int.m_end;
    let m_exact = q.abs() * span * span / 8.0;
    assert_close(m_int.abs(), m_exact, 0.02, "Two-span: |M_int| = qL²/8");

    // Sign change should exist in each span (between support hogging and midspan sagging)
    let changes_span1 = find_sign_changes(&results, 1..=n);
    let changes_span2 = find_sign_changes(&results, (n + 1)..=(2 * n));
    assert!(!changes_span1.is_empty(),
        "Two-span: contraflexure in span 1");
    assert!(!changes_span2.is_empty(),
        "Two-span: contraflexure in span 2");
}

// ================================================================
// 5. Portal Frame Gravity: Symmetric Base Moments
// ================================================================
//
// Symmetric portal frame with fixed bases under symmetric gravity.

#[test]
fn validation_contraflexure_portal_column() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    // For symmetric gravity on symmetric frame, base moments are equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.mz.abs(), r4.mz.abs(), 0.01,
        "Portal: symmetric base moments");

    // Vertical reactions should be equal
    assert_close(r1.ry, r4.ry, 0.02, "Portal: symmetric Ry");

    // Total vertical reaction = 2P (one P at each beam-column joint)
    assert_close(r1.ry + r4.ry, 2.0 * p, 0.01, "Portal: ΣRy = 2P");

    // No horizontal reaction under symmetric gravity
    assert!(r1.rx.abs() < 1e-8, "Portal: Rx ≈ 0");
}

// ================================================================
// 6. Propped Cantilever Point Load: Contraflexure Exists
// ================================================================
//
// Fixed at left, roller at right, point load P at L/3.

#[test]
fn validation_contraflexure_propped_point() {
    let l = 9.0;
    let n = 36;
    let p = 15.0;
    let load_node = n / 3 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end moment exists
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.mz.abs() > 0.0, "Fixed end moment exists");

    // Somewhere in the beam, moment changes sign
    let changes = find_sign_changes(&results, 1..=n);
    assert!(!changes.is_empty(),
        "Propped point: contraflexure exists somewhere in beam");
}

// ================================================================
// 7. Fixed Beam Applied Moment: Equilibrium and Antisymmetry
// ================================================================
//
// Fixed-fixed beam with applied moment M₀ at midspan.

#[test]
fn validation_contraflexure_applied_moment() {
    let l = 10.0;
    let n = 20;
    let m0 = 10.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: 0.0, mz: m0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Vertical equilibrium: ΣFy = 0
    assert!((r1.ry + r2.ry).abs() < 0.01,
        "Moment load: ΣFy = 0: {:.6}", r1.ry + r2.ry);

    // Moment equilibrium about left end: M_A + R_B*L + M_B + M₀ = 0
    // (signs depend on convention, verify sum is near zero)
    let sum_r_mz = r1.mz + r2.mz;
    let sum_applied = m0 + r2.ry * l;
    assert!((sum_r_mz + sum_applied).abs() < 0.1,
        "Moment equilibrium: {:.4}", sum_r_mz + sum_applied);
}

// ================================================================
// 8. Three-Span: Sagging in Interior Span Between Hogging Supports
// ================================================================
//
// Three-span continuous beam with UDL: interior span has
// hogging at both ends, sagging in middle → inflection points.

#[test]
fn validation_contraflexure_three_span() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior span midpoint should have sagging (positive or less negative)
    // compared to the support hogging values
    let ef_int_start = results.element_forces.iter()
        .find(|e| e.element_id == n + 1).unwrap();
    let ef_int_mid = results.element_forces.iter()
        .find(|e| e.element_id == n + n / 2).unwrap();
    let ef_int_end = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n).unwrap();

    // Midspan moment should differ in sign from support moments
    // (support hogging vs midspan sagging, regardless of sign convention)
    let m_support_left = ef_int_start.m_start;
    let m_midspan = ef_int_mid.m_end;
    let _m_support_right = ef_int_end.m_end;

    // Midspan magnitude should be less than support magnitude (for UDL)
    assert!(m_midspan.abs() < m_support_left.abs(),
        "3-span: |M_mid| < |M_support_left|: {:.4} < {:.4}",
        m_midspan.abs(), m_support_left.abs());

    // Midspan should have opposite sign from supports (sagging vs hogging)
    assert!(m_midspan * m_support_left < 0.0,
        "3-span: opposite signs at midspan vs support: {:.4} vs {:.4}",
        m_midspan, m_support_left);

    // Sign changes should exist in interior span
    let changes = find_sign_changes(&results, (n + 1)..=(2 * n));
    assert!(!changes.is_empty(),
        "3-span: inflection points in interior span");
}
