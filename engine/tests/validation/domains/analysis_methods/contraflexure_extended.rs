/// Validation: Extended Contraflexure Tests for Indeterminate Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4 (Internal Loadings)
///   - Kassimali, "Structural Analysis", Ch. 5
///   - McCormac & Csernak, "Structural Analysis", Ch. 12
///   - Ghali & Neville, "Structural Analysis", Ch. 3
///
/// These tests extend the base contraflexure suite with additional
/// structural configurations: triangular loads, asymmetric spans,
/// multi-span patterns, lateral-loaded portals, and stiffness-varied
/// beams. Each test verifies moment zero-crossings and sign changes.
///
/// Tests verify:
///   1. Propped cantilever triangular load: contraflexure near fixed end
///   2. Fixed-fixed beam asymmetric point load: two contraflexure points
///   3. Two-span continuous unequal spans: contraflexure in each span
///   4. Four-span continuous UDL: multiple inflection points
///   5. Fixed-pinned beam UDL: single contraflexure at 0.4215L from fixed end
///   6. Portal frame lateral load: column moment sign change
///   7. Fixed-fixed beam two symmetric point loads: contraflexure pairs
///   8. Three-span alternating loads: loaded spans have contraflexure
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Find elements where moment changes sign (m_start * m_end < 0).
fn find_sign_changes(
    results: &dedaliano_engine::types::AnalysisResults,
    elem_range: std::ops::RangeInclusive<usize>,
) -> Vec<usize> {
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
// 1. Propped Cantilever Triangular Load: Contraflexure Near Fixed End
// ================================================================
//
// Fixed at left, roller at right, triangular load increasing from 0
// at left to q_max at right. The fixed-end moment is smaller than
// the UDL case, and the contraflexure point shifts closer to the
// fixed end. Global equilibrium: R_A + R_B = q_max * L / 2.

#[test]
fn validation_contraflexure_ext_propped_triangular() {
    let l = 10.0;
    let n = 40;
    let q_max: f64 = -12.0;

    // Triangular load: linearly increasing from 0 to q_max across beam
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i = (i - 1) as f64 / n as f64;
            let x_j = i as f64 / n as f64;
            let qi = q_max * x_i;
            let qj = q_max * x_j;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: qi,
                q_j: qj,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: total load = q_max * L / 2
    let total_load = q_max.abs() * l / 2.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(
        r1.rz + r2.rz,
        total_load,
        0.02,
        "Propped tri: sum Ry = qL/2",
    );

    // Fixed end should have a moment reaction
    assert!(r1.my.abs() > 0.1, "Propped tri: fixed end moment exists");

    // Contraflexure should exist between fixed end and midspan
    let changes = find_sign_changes(&results, 1..=n);
    assert!(
        !changes.is_empty(),
        "Propped tri: contraflexure point exists"
    );

    // Contraflexure should be in the left portion of the beam (< L/2)
    let dx = l / n as f64;
    let x_change = changes[0] as f64 * dx;
    assert!(
        x_change < l / 2.0,
        "Propped tri: contraflexure in left half: x={:.2}",
        x_change
    );
}

// ================================================================
// 2. Fixed-Fixed Beam Asymmetric Point Load: Two Contraflexure Points
// ================================================================
//
// Fixed-fixed beam with point load P at L/3 from left.
// Fixed-end moments: M_A = Pab^2/L^2, M_B = Pa^2 b/L^2
// where a = L/3, b = 2L/3.
// Two contraflexure points exist, one near each support.

#[test]
fn validation_contraflexure_ext_fixed_asymmetric_load() {
    let l = 12.0;
    let n = 48;
    let p = 24.0;
    // Load at L/3 from left => node at position n/3
    let load_node = n / 3 + 1; // node 17

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed end moments from beam theory
    // M_A = P*a*b^2/L^2, M_B = P*a^2*b/L^2
    let a_dist = l / 3.0;
    let b_dist = 2.0 * l / 3.0;
    let m_a_exact = p * a_dist * b_dist * b_dist / (l * l);
    let m_b_exact = p * a_dist * a_dist * b_dist / (l * l);

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Check fixed end moments (sign convention may vary, compare magnitudes)
    assert_close(
        r1.my.abs(),
        m_a_exact,
        0.03,
        "Fixed asym: |M_A| = Pab^2/L^2",
    );
    assert_close(
        r2.my.abs(),
        m_b_exact,
        0.03,
        "Fixed asym: |M_B| = Pa^2 b/L^2",
    );

    // Two contraflexure points should exist
    let changes = find_sign_changes(&results, 1..=n);
    assert!(
        changes.len() >= 2,
        "Fixed asym: two contraflexure points, got {}",
        changes.len()
    );

    // First contraflexure near left support, second near right support
    let dx = l / n as f64;
    let x1 = changes[0] as f64 * dx;
    let x2 = changes.last().unwrap().clone() as f64 * dx;
    assert!(
        x1 < a_dist,
        "Fixed asym: first contraflexure before load: {:.2} < {:.2}",
        x1,
        a_dist
    );
    assert!(
        x2 > a_dist,
        "Fixed asym: second contraflexure after load: {:.2} > {:.2}",
        x2,
        a_dist
    );
}

// ================================================================
// 3. Two-Span Continuous Unequal Spans: Contraflexure in Each Span
// ================================================================
//
// Continuous beam with spans L1 = 6m and L2 = 10m under UDL.
// Unequal spans produce asymmetric interior support moment.
// Contraflexure points exist in each span.

#[test]
fn validation_contraflexure_ext_two_span_unequal() {
    let span1 = 6.0;
    let span2 = 10.0;
    let n = 12;
    let q: f64 = -10.0;

    let total_elems = 2 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_continuous_beam(&[span1, span2], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support has hogging moment
    let ef_at_int = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();
    let m_int = ef_at_int.m_end;
    assert!(
        m_int.abs() > 1.0,
        "Unequal spans: interior support moment is significant"
    );

    // Contraflexure in span 1
    let changes_span1 = find_sign_changes(&results, 1..=n);
    assert!(
        !changes_span1.is_empty(),
        "Unequal spans: contraflexure in span 1"
    );

    // Contraflexure in span 2
    let changes_span2 = find_sign_changes(&results, (n + 1)..=total_elems);
    assert!(
        !changes_span2.is_empty(),
        "Unequal spans: contraflexure in span 2"
    );

    // Vertical equilibrium: sum of reactions = total load
    let total_load = q.abs() * (span1 + span2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "Unequal spans: sum Ry = qL_total");
}

// ================================================================
// 4. Four-Span Continuous UDL: Multiple Inflection Points
// ================================================================
//
// Four equal spans under UDL. Each interior span has two
// inflection points (one near each support). Outer spans have
// one inflection point each. Total inflection points >= 6.

#[test]
fn validation_contraflexure_ext_four_span() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -8.0;

    let total_elems = 4 * n;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    let input = make_continuous_beam(&[span, span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Each span should have at least one sign change in moment
    for span_idx in 0..4_usize {
        let start = span_idx * n + 1;
        let end = (span_idx + 1) * n;
        let changes = find_sign_changes(&results, start..=end);
        assert!(
            !changes.is_empty(),
            "4-span: inflection point in span {} (elems {}..={})",
            span_idx + 1,
            start,
            end
        );
    }

    // Total inflection points across all spans should be >= 6
    let all_changes = find_sign_changes(&results, 1..=total_elems);
    assert!(
        all_changes.len() >= 6,
        "4-span: at least 6 inflection points, got {}",
        all_changes.len()
    );

    // Vertical equilibrium
    let total_load = q.abs() * 4.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02, "4-span: sum Ry = 4qL");
}

// ================================================================
// 5. Fixed-Pinned Beam UDL: Contraflexure at 0.4215L from Fixed End
// ================================================================
//
// Fixed at left, pinned at right (i.e. no moment at right support).
// M(x) = R_A*x - M_A - q*x^2/2
// R_A = 3qL/8, M_A = qL^2/8 (hogging)
// M(x) = 0 at x = (3 - sqrt(5))/4 * L = 0.1909L ...
// Actually for fixed-pinned with UDL:
// M_A = qL^2/8, R_A = 5qL/8
// (same as propped cantilever, just from fixed end perspective)
// Contraflexure at x = L/4 from fixed end.
// We test from the pinned end perspective:
// Fixed at right, pinned at left, UDL => contraflexure at 3L/4.

#[test]
fn validation_contraflexure_ext_fixed_pinned_udl() {
    let l = 8.0;
    let n = 32;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();
    // Pinned at left, fixed at right
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Right support (fixed) has moment reaction
    let r_right = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert!(
        r_right.my.abs() > 1.0,
        "Fixed-pinned: fixed end moment exists"
    );

    // Left support (pinned) has no moment reaction
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        r_left.my.abs() < 1e-6,
        "Fixed-pinned: pinned end has no moment"
    );

    // Contraflexure at 3L/4 from left (= L/4 from fixed right end)
    let changes = find_sign_changes(&results, 1..=n);
    assert!(
        !changes.is_empty(),
        "Fixed-pinned: contraflexure exists"
    );

    let dx = l / n as f64;
    let x_change = changes.last().unwrap().clone() as f64 * dx;
    let x_exact = 3.0 * l / 4.0;
    assert!(
        (x_change - x_exact).abs() < 2.0 * dx,
        "Fixed-pinned: contraflexure near 3L/4: x={:.2}, expected {:.2}",
        x_change,
        x_exact
    );

    // Reactions: R_pinned = 3qL/8, R_fixed = 5qL/8
    let r_pinned_exact = q.abs() * l * 3.0 / 8.0;
    let r_fixed_exact = q.abs() * l * 5.0 / 8.0;
    assert_close(
        r_left.rz,
        r_pinned_exact,
        0.02,
        "Fixed-pinned: R_pinned = 3qL/8",
    );
    assert_close(
        r_right.rz,
        r_fixed_exact,
        0.02,
        "Fixed-pinned: R_fixed = 5qL/8",
    );
}

// ================================================================
// 6. Portal Frame Lateral Load: Column Moment Sign Change
// ================================================================
//
// Symmetric portal frame with fixed bases under lateral load.
// Columns experience moment reversal (contraflexure) along
// their height.

#[test]
fn validation_contraflexure_ext_portal_lateral() {
    let h = 5.0;
    let w = 8.0;
    let f_lat = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum Rx + applied = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        (r1.rx + r4.rx + f_lat).abs() < 0.1,
        "Portal lat: horizontal equilibrium: {:.4}",
        r1.rx + r4.rx + f_lat
    );

    // No vertical load applied, so vertical reactions should be equal and opposite
    assert!(
        (r1.rz + r4.rz).abs() < 0.01,
        "Portal lat: sum Ry = 0: {:.6}",
        r1.rz + r4.rz
    );

    // Both base moments should exist (non-zero)
    assert!(r1.my.abs() > 0.1, "Portal lat: base moment at node 1");
    assert!(r4.my.abs() > 0.1, "Portal lat: base moment at node 4");

    // For a portal frame with lateral load, the windward column (elem 1)
    // has moment that changes sign along its height (contraflexure in column).
    // Element 1 goes from node 1 (base) to node 2 (top).
    let ef1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 1)
        .unwrap();
    let ef3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();

    // At least one column should have moment sign change
    let col_sign_change =
        (ef1.m_start * ef1.m_end < 0.0) || (ef3.m_start * ef3.m_end < 0.0);
    assert!(
        col_sign_change,
        "Portal lat: at least one column has moment sign change (contraflexure). \
         Col1: m_s={:.4}, m_e={:.4}; Col3: m_s={:.4}, m_e={:.4}",
        ef1.m_start, ef1.m_end, ef3.m_start, ef3.m_end
    );
}

// ================================================================
// 7. Fixed-Fixed Beam Two Symmetric Point Loads: Contraflexure Pairs
// ================================================================
//
// Fixed-fixed beam with equal point loads P at L/3 and 2L/3.
// By symmetry, the moment diagram is symmetric. Two contraflexure
// points exist, placed symmetrically about midspan.

#[test]
fn validation_contraflexure_ext_fixed_two_symmetric_loads() {
    let l = 12.0;
    let n = 48;
    let p = 18.0;

    // Loads at L/3 and 2L/3
    let node_1 = n / 3 + 1;
    let node_2 = 2 * n / 3 + 1;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_1,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_2,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry, reactions at both ends should be equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r1.rz, r2.rz, 0.02, "Symm loads: equal Ry");
    assert_close(r1.my.abs(), r2.my.abs(), 0.02, "Symm loads: equal |Mz|");

    // Total vertical reaction = 2P
    assert_close(r1.rz + r2.rz, 2.0 * p, 0.01, "Symm loads: sum Ry = 2P");

    // Two contraflexure points should exist
    let changes = find_sign_changes(&results, 1..=n);
    assert!(
        changes.len() >= 2,
        "Symm loads: two contraflexure points, got {}",
        changes.len()
    );

    // Contraflexure points should be symmetric about midspan
    let dx = l / n as f64;
    let x1 = changes[0] as f64 * dx;
    let x2 = changes.last().unwrap().clone() as f64 * dx;
    let mid = l / 2.0;
    let d1 = (mid - x1).abs();
    let d2 = (x2 - mid).abs();
    assert!(
        (d1 - d2).abs() < 3.0 * dx,
        "Symm loads: symmetric contraflexure: d1={:.2}, d2={:.2}",
        d1,
        d2
    );
}

// ================================================================
// 8. Three-Span Alternating Load: Loaded Spans Have Contraflexure
// ================================================================
//
// Three-span continuous beam, UDL on spans 1 and 3 only (no load
// on span 2). Pattern loading produces maximum hogging at interior
// supports. Loaded spans have contraflexure; unloaded span may or
// may not depending on moment carry-over.

#[test]
fn validation_contraflexure_ext_three_span_alternating() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // Load spans 1 and 3 only
    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }
    for i in (2 * n + 1)..=(3 * n) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Loaded spans (1 and 3) should have contraflexure points
    let changes_span1 = find_sign_changes(&results, 1..=n);
    let changes_span3 = find_sign_changes(&results, (2 * n + 1)..=(3 * n));
    assert!(
        !changes_span1.is_empty(),
        "Alt load: contraflexure in loaded span 1"
    );
    assert!(
        !changes_span3.is_empty(),
        "Alt load: contraflexure in loaded span 3"
    );

    // By symmetry of loading pattern (spans 1 and 3 loaded equally),
    // moments should be symmetric about midspan of span 2.
    // Check that support moments at interior supports are similar
    let ef_end_span1 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n)
        .unwrap();
    let ef_start_span3 = results
        .element_forces
        .iter()
        .find(|e| e.element_id == 2 * n + 1)
        .unwrap();
    assert_close(
        ef_end_span1.m_end.abs(),
        ef_start_span3.m_start.abs(),
        0.05,
        "Alt load: symmetric interior support moments",
    );

    // Vertical equilibrium: total load = 2 * q * span (spans 1 and 3)
    let total_load = q.abs() * 2.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(
        sum_ry,
        total_load,
        0.02,
        "Alt load: sum Ry = 2qL",
    );
}
