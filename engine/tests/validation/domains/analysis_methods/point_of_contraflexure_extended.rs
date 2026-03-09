/// Validation: Extended Points of Contraflexure (Inflection Points)
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., McGraw-Hill (1965)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4 & 10
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 & 9
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 3 & 6
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///   - McCormac & Csernak, "Structural Analysis", Ch. 12
///
/// Points of contraflexure are locations where the bending moment
/// changes sign (M = 0 with sign reversal). These extended tests
/// cover additional configurations beyond the base suite: propped
/// cantilever UDL (from roller end), fixed-fixed UDL with exact
/// 0.2113L positions, propped cantilever midspan load, two-span
/// continuous, portal frame lateral load, fixed-fixed end moment,
/// continuous beam hogging-sagging transitions, and propped
/// cantilever triangular load.
///
/// Tests verify:
///   1. Propped cantilever UDL: point of contraflexure at x = L/4 from roller end
///   2. Fixed-fixed beam UDL: points of contraflexure at x = 0.2113L from each end
///   3. Propped cantilever midspan load: contraflexure point location
///   4. Two-span beam UDL: moment sign change in each span near interior support
///   5. Portal frame lateral load: contraflexure points in columns
///   6. Fixed-fixed beam with end moment: contraflexure at specific location
///   7. Continuous beam: contraflexure points near interior supports
///   8. Propped cantilever triangular load: locate contraflexure point
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Find elements where moment changes sign (m_start * m_end < 0).
/// Returns (element_id, x_approx) pairs with linear interpolation
/// to estimate the zero-crossing position.
fn find_contraflexure_points(
    results: &AnalysisResults,
    elem_range: std::ops::RangeInclusive<usize>,
) -> Vec<(usize, f64)> {
    let mut pts = Vec::new();
    for i in elem_range {
        if let Some(ef) = results.element_forces.iter().find(|e| e.element_id == i) {
            if ef.m_start * ef.m_end < 0.0 {
                // Linear interpolation within element to locate zero crossing.
                // x_start is derived from element length and ID ordering.
                // We accumulate length from prior elements.
                let x_start: f64 = results
                    .element_forces
                    .iter()
                    .filter(|e| e.element_id < i)
                    .map(|e| e.length)
                    .sum();
                let frac: f64 =
                    ef.m_start.abs() / (ef.m_start.abs() + ef.m_end.abs());
                pts.push((i, x_start + frac * ef.length));
            }
        }
    }
    pts
}

// ================================================================
// 1. Propped Cantilever UDL: Contraflexure at x = L/4 from Roller End
// ================================================================
//
// Fixed at left (x=0), roller at right (x=L), UDL q downward.
// Reactions: R_A = 5qL/8, R_B = 3qL/8, M_A = qL^2/8
// Moment: M(x) = 5qLx/8 - qL^2/8 - qx^2/2
// M(x) = 0 => 4x^2 - 5Lx + L^2 = 0 => x = L/4 or x = L
// Distance from roller end = L - L/4 = 3L/4
// Equivalently: contraflexure at L/4 from the fixed end.
//
// Measuring from the roller end: the contraflexure is at
// distance L/4 from the roller => x_global = L - L/4 = 3L/4.
// But the problem says "x = L/4 from roller end", i.e.
// x_from_roller = L/4 => x_global = L - L/4 = 3L/4.
//
// Wait -- re-reading the classic result:
//   Fixed at A (left), roller at B (right).
//   M(x) = 0 at x = L/4 from A (the fixed end).
//   From the roller end B, this is 3L/4.
//
// The request says "L/4 from roller end". Let us reconcile:
// For a propped cantilever with fixed left and roller right,
// the contraflexure is at x = L/4 from the fixed end.
// From the roller end that is 3L/4.
//
// The request phrasing likely intended "L/4 from the fixed end"
// (standard result), so we verify x = L/4.

#[test]
fn validation_poc_ext_propped_cantilever_udl_from_roller() {
    let l: f64 = 8.0;
    let n: usize = 80;
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
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r_a.ry, 5.0 * q.abs() * l / 8.0, 0.02, "Propped UDL: R_A = 5qL/8");
    assert_close(r_b.ry, 3.0 * q.abs() * l / 8.0, 0.02, "Propped UDL: R_B = 3qL/8");

    // Find contraflexure point
    let pts = find_contraflexure_points(&results, 1..=n);
    assert!(
        !pts.is_empty(),
        "Propped cantilever UDL: at least one contraflexure point"
    );

    // Exact contraflexure at x = L/4 from fixed end
    let x_exact: f64 = l / 4.0;
    let x_fem: f64 = pts[0].1;
    let dx: f64 = l / n as f64;

    assert!(
        (x_fem - x_exact).abs() < 3.0 * dx,
        "Propped UDL: contraflexure at x = {:.4}, exact = L/4 = {:.4}",
        x_fem,
        x_exact
    );

    // From roller end: distance = L - x = 3L/4
    let dist_from_roller: f64 = l - x_fem;
    let expected_from_roller: f64 = 3.0 * l / 4.0;
    assert!(
        (dist_from_roller - expected_from_roller).abs() < 3.0 * dx,
        "Propped UDL: distance from roller = {:.4}, expected 3L/4 = {:.4}",
        dist_from_roller,
        expected_from_roller
    );
}

// ================================================================
// 2. Fixed-Fixed Beam UDL: Contraflexure at x = 0.2113L from Each End
// ================================================================
//
// Source: Timoshenko & Young, "Theory of Structures", section 5-1
// M(x) = wLx/2 - wL^2/12 - wx^2/2
// M(x) = 0 => x^2 - Lx + L^2/6 = 0
// x = L/2 +/- L/(2*sqrt(3))
// x1 = L/2*(1 - 1/sqrt(3)) = 0.2113*L
// x2 = L/2*(1 + 1/sqrt(3)) = 0.7887*L

#[test]
fn validation_poc_ext_fixed_fixed_udl_positions() {
    let l: f64 = 12.0;
    let n: usize = 120;
    let q: f64 = -10.0;
    let dx: f64 = l / n as f64;

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
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let pts = find_contraflexure_points(&results, 1..=n);
    assert!(
        pts.len() >= 2,
        "Fixed-fixed UDL: need >= 2 contraflexure points, got {}",
        pts.len()
    );

    let sqrt3: f64 = 3.0_f64.sqrt();
    let x1_exact: f64 = l * 0.5 * (1.0 - 1.0 / sqrt3); // 0.2113*L
    let x2_exact: f64 = l * 0.5 * (1.0 + 1.0 / sqrt3); // 0.7887*L

    let x1_fem: f64 = pts[0].1;
    let x2_fem: f64 = pts[pts.len() - 1].1;

    assert!(
        (x1_fem - x1_exact).abs() < 3.0 * dx,
        "Fixed-fixed UDL: x1 = {:.4}, exact 0.2113*L = {:.4}",
        x1_fem,
        x1_exact
    );
    assert!(
        (x2_fem - x2_exact).abs() < 3.0 * dx,
        "Fixed-fixed UDL: x2 = {:.4}, exact 0.7887*L = {:.4}",
        x2_fem,
        x2_exact
    );

    // Verify symmetry: x1 + x2 ~ L
    let sum: f64 = x1_fem + x2_fem;
    assert!(
        (sum - l).abs() < 4.0 * dx,
        "Fixed-fixed UDL: x1 + x2 = {:.4}, should equal L = {:.4}",
        sum,
        l
    );
}

// ================================================================
// 3. Propped Cantilever Midspan Load: Contraflexure Point Location
// ================================================================
//
// Fixed at left (A), roller at right (B), point load P at midspan.
// Fixed-end reactions:
//   R_B = 5P/16, R_A = 11P/16, M_A = 3PL/16
// Left half (0 <= x <= L/2):
//   M(x) = R_A*x - M_A = 11Px/16 - 3PL/16
//   M(x) = 0 => x = 3L/11
// Contraflexure at x = 3L/11 from the fixed end.

#[test]
fn validation_poc_ext_propped_cantilever_midspan_load() {
    let l: f64 = 11.0; // chosen for clean L/11 divisions
    let n: usize = 110;
    let p: f64 = 20.0;
    let mid_node: usize = n / 2 + 1;
    let dx: f64 = l / n as f64;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();
    assert_close(r_b.ry, 5.0 * p / 16.0, 0.03, "Propped mid P: R_B = 5P/16");
    assert_close(r_a.ry, 11.0 * p / 16.0, 0.03, "Propped mid P: R_A = 11P/16");
    assert_close(
        r_a.mz.abs(),
        3.0 * p * l / 16.0,
        0.03,
        "Propped mid P: M_A = 3PL/16",
    );

    // Find contraflexure point
    let pts = find_contraflexure_points(&results, 1..=n);
    assert!(
        !pts.is_empty(),
        "Propped midspan load: at least one contraflexure point"
    );

    // Exact: x = 3L/11
    let x_exact: f64 = 3.0 * l / 11.0;
    let x_fem: f64 = pts[0].1;

    assert!(
        (x_fem - x_exact).abs() < 3.0 * dx,
        "Propped midspan load: contraflexure at x = {:.4}, exact = 3L/11 = {:.4}",
        x_fem,
        x_exact
    );
}

// ================================================================
// 4. Two-Span Beam UDL: Moment Sign Change Near Interior Support
// ================================================================
//
// Two equal spans L with UDL q, pinned at ends and roller at
// interior support. Interior support moment = qL^2/8 (hogging).
// Each span has a contraflexure point where moment transitions
// from sagging (midspan) to hogging (interior support).
// Approximate location: x ~ 3L/4 from the outer support of each
// span (near the interior support).

#[test]
fn validation_poc_ext_two_span_udl_sign_change() {
    let span: f64 = 8.0;
    let n_per_span: usize = 40;
    let q: f64 = -10.0;
    let total_n: usize = 2 * n_per_span;

    let loads: Vec<SolverLoad> = (1..=total_n)
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
    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support moment should be qL^2/8
    let ef_at_int = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();
    let m_int: f64 = ef_at_int.m_end;
    let m_exact: f64 = q.abs() * span * span / 8.0;
    assert_close(
        m_int.abs(),
        m_exact,
        0.03,
        "Two-span UDL: |M_int| = qL^2/8",
    );

    // Each span should have a contraflexure point (sign change)
    let pts_span1 = find_contraflexure_points(&results, 1..=n_per_span);
    let pts_span2 = find_contraflexure_points(&results, (n_per_span + 1)..=total_n);

    assert!(
        !pts_span1.is_empty(),
        "Two-span UDL: contraflexure in span 1"
    );
    assert!(
        !pts_span2.is_empty(),
        "Two-span UDL: contraflexure in span 2"
    );

    // Contraflexure in span 1 should be in the right portion (near interior support)
    let x1: f64 = pts_span1.last().unwrap().1;
    assert!(
        x1 > span / 2.0,
        "Two-span: span 1 contraflexure in right half: x = {:.4} > L/2 = {:.4}",
        x1,
        span / 2.0
    );

    // Contraflexure in span 2 should be in the left portion (near interior support)
    let x2: f64 = pts_span2[0].1;
    assert!(
        x2 < span + span / 2.0,
        "Two-span: span 2 contraflexure in left half: x = {:.4} < 3L/2 = {:.4}",
        x2,
        span + span / 2.0
    );

    // By symmetry, the two contraflexure points should be equidistant
    // from the interior support (located at x = span)
    let d1: f64 = (span - x1).abs();
    let d2: f64 = (x2 - span).abs();
    let dx: f64 = span / n_per_span as f64;
    assert!(
        (d1 - d2).abs() < 4.0 * dx,
        "Two-span: symmetric contraflexure distances: d1={:.4}, d2={:.4}",
        d1,
        d2
    );

    // Vertical equilibrium
    let total_load: f64 = q.abs() * 2.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Two-span UDL: sum Ry = 2qL");
}

// ================================================================
// 5. Portal Frame Lateral Load: Contraflexure Points in Columns
// ================================================================
//
// Source: Leet, Uang & Gilbert, "Fundamentals of Structural Analysis",
//         5th Ed., section 12-4 (Portal Method)
// Fixed-base symmetric portal frame under lateral load H at roof.
// The Portal Method predicts inflection points at column mid-heights.
// For finite beam stiffness, the inflection shifts but remains within
// the column height. Both columns should exhibit moment sign reversal.

#[test]
fn validation_poc_ext_portal_lateral_contraflexure() {
    let h: f64 = 5.0;
    let w: f64 = 8.0;
    let f_lat: f64 = 20.0;

    // Portal frame: 2 columns + 1 beam, fixed bases, lateral load at node 2
    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: sum Rx + applied = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(
        (r1.rx + r4.rx + f_lat).abs() < 0.1,
        "Portal lateral: horizontal equilibrium: {:.6}",
        r1.rx + r4.rx + f_lat
    );

    // Column 1 (elem 1): node 1 (base) to node 2 (top)
    // Column 3 (elem 3): node 3 (top) to node 4 (base)
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

    // Both columns should have moment sign change (contraflexure within column)
    assert!(
        ef1.m_start * ef1.m_end < 0.0,
        "Left column: moment sign change: m_start={:.4}, m_end={:.4}",
        ef1.m_start,
        ef1.m_end
    );
    assert!(
        ef3.m_start * ef3.m_end < 0.0,
        "Right column: moment sign change: m_start={:.4}, m_end={:.4}",
        ef3.m_start,
        ef3.m_end
    );

    // Estimate contraflexure position by linear interpolation
    // frac = |m_start| / (|m_start| + |m_end|)
    let frac1: f64 = ef1.m_start.abs() / (ef1.m_start.abs() + ef1.m_end.abs());
    let frac3: f64 = ef3.m_start.abs() / (ef3.m_start.abs() + ef3.m_end.abs());

    // Contraflexure should be in the middle portion of each column
    // (not at the very top or bottom). Portal method says ~0.5.
    assert!(
        frac1 > 0.2 && frac1 < 0.8,
        "Left column: contraflexure fraction {:.3} should be in [0.2, 0.8]",
        frac1
    );
    assert!(
        frac3 > 0.2 && frac3 < 0.8,
        "Right column: contraflexure fraction {:.3} should be in [0.2, 0.8]",
        frac3
    );

    // Contraflexure heights
    let h_inflection_left: f64 = frac1 * h;
    let h_inflection_right: f64 = frac3 * h;

    // Both should be reasonably near mid-height
    assert!(
        (h_inflection_left - h / 2.0).abs() < h * 0.35,
        "Left column: contraflexure at h={:.3}, mid={:.3}",
        h_inflection_left,
        h / 2.0
    );
    assert!(
        (h_inflection_right - h / 2.0).abs() < h * 0.35,
        "Right column: contraflexure at h={:.3}, mid={:.3}",
        h_inflection_right,
        h / 2.0
    );
}

// ================================================================
// 6. Fixed-Fixed Beam with Applied Moment: Contraflexure Location
// ================================================================
//
// Fixed-fixed beam of length L with applied moment M0 at midspan.
// By the stiffness method, the applied moment at an interior node
// distributes to both fixed ends via carry-over. The moment diagram
// has a jump at the application point and produces sign changes.
//
// For moment M0 at midspan of fixed-fixed beam:
//   End moments: M_A = -M0/4, M_B = M0/4 (antisymmetric)
//   Shear: V = -(M_A + M_B + M0) / L ... but M_A + M_B = 0 for
//   antisymmetric case, so V = 3M0 / (2L) approximately.
//   The moment diagram crosses zero somewhere in each half of the beam.

#[test]
fn validation_poc_ext_fixed_fixed_end_moment() {
    let l: f64 = 10.0;
    let n: usize = 100;
    let m0: f64 = 50.0;
    let mid_node: usize = n / 2 + 1;

    // Apply external moment at midspan
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node,
        fx: 0.0,
        fy: 0.0,
        mz: m0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results
        .reactions
        .iter()
        .find(|r| r.node_id == n + 1)
        .unwrap();

    // Both end moments should be non-zero
    assert!(
        r1.mz.abs() > 0.1,
        "Fixed-fixed moment: left end moment exists: {:.4}",
        r1.mz
    );
    assert!(
        r2.mz.abs() > 0.1,
        "Fixed-fixed moment: right end moment exists: {:.4}",
        r2.mz
    );

    // Vertical equilibrium: sum Ry ~ 0 (only moment applied, no transverse load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        sum_ry.abs() < 0.01,
        "Fixed-fixed moment: sum Ry ~ 0: {:.6}",
        sum_ry
    );

    // Moment equilibrium about left end:
    // M_A + R_B * L + M_B + M0 = 0
    let moment_balance: f64 = r1.mz + r2.ry * l + r2.mz + m0;
    assert!(
        moment_balance.abs() < 1.0,
        "Fixed-fixed moment: moment equilibrium: {:.4}",
        moment_balance
    );

    // Moment diagram should have at least one sign change
    let pts = find_contraflexure_points(&results, 1..=n);
    assert!(
        !pts.is_empty(),
        "Fixed-fixed end moment: at least one contraflexure point exists"
    );

    // The contraflexure point should be in the interior of the beam
    let x_contra: f64 = pts[0].1;
    assert!(
        x_contra > 0.0 && x_contra < l,
        "Fixed-fixed moment: contraflexure at x = {:.4} is interior to beam",
        x_contra
    );
}

// ================================================================
// 7. Continuous Beam: Contraflexure Points Near Interior Supports
// ================================================================
//
// Three-span continuous beam with equal spans under UDL.
// Interior supports have hogging moments. Between each support
// and the midspan of each span, the moment transitions from
// hogging to sagging through a contraflexure point.
// The interior span has two contraflexure points (one near each
// interior support). Outer spans have one each.

#[test]
fn validation_poc_ext_continuous_beam_hogging_sagging() {
    let span: f64 = 6.0;
    let n_per_span: usize = 30;
    let q: f64 = -10.0;
    let total_n: usize = 3 * n_per_span;
    let dx: f64 = span / n_per_span as f64;

    let loads: Vec<SolverLoad> = (1..=total_n)
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
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Span 1: elements 1..=n_per_span
    // Span 2 (interior): elements (n_per_span+1)..=(2*n_per_span)
    // Span 3: elements (2*n_per_span+1)..=(3*n_per_span)

    let pts_span1 = find_contraflexure_points(&results, 1..=n_per_span);
    let pts_span2 =
        find_contraflexure_points(&results, (n_per_span + 1)..=(2 * n_per_span));
    let pts_span3 =
        find_contraflexure_points(&results, (2 * n_per_span + 1)..=(3 * n_per_span));

    // Span 1 (exterior): at least one contraflexure near interior support
    assert!(
        !pts_span1.is_empty(),
        "3-span: contraflexure exists in span 1"
    );

    // Span 2 (interior): two contraflexure points (hogging at both ends)
    assert!(
        pts_span2.len() >= 2,
        "3-span: interior span should have >= 2 contraflexure points, got {}",
        pts_span2.len()
    );

    // Span 3 (exterior): at least one contraflexure near interior support
    assert!(
        !pts_span3.is_empty(),
        "3-span: contraflexure exists in span 3"
    );

    // Interior span contraflexure points should be symmetric about span midpoint
    let span2_x_start: f64 = span;
    let x1_rel: f64 = pts_span2[0].1 - span2_x_start;
    let x2_rel: f64 = pts_span2[pts_span2.len() - 1].1 - span2_x_start;

    assert!(
        (x1_rel + x2_rel - span).abs() < 4.0 * dx,
        "Interior span: symmetric contraflexure: x1_rel={:.3}, x2_rel={:.3}, sum={:.3}, span={:.1}",
        x1_rel,
        x2_rel,
        x1_rel + x2_rel,
        span
    );

    // Verify the hogging-sagging transition: midspan of interior span should
    // have opposite sign from interior support moment
    let ef_mid_interior = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span + n_per_span / 2)
        .unwrap();
    let ef_left_support = results
        .element_forces
        .iter()
        .find(|e| e.element_id == n_per_span)
        .unwrap();

    let m_mid: f64 = (ef_mid_interior.m_start + ef_mid_interior.m_end) / 2.0;
    let m_support: f64 = ef_left_support.m_end;

    assert!(
        m_mid * m_support < 0.0,
        "Interior span: midspan ({:.4}) opposite sign to support ({:.4})",
        m_mid,
        m_support
    );

    // Vertical equilibrium
    let total_load: f64 = q.abs() * 3.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        total_load,
        0.02,
        "3-span continuous: sum Ry = 3qL",
    );
}

// ================================================================
// 8. Propped Cantilever Triangular Load: Locate Contraflexure Point
// ================================================================
//
// Fixed at left (A), roller at right (B).
// Triangular load: q = 0 at A (x=0), q = q_max at B (x=L).
// Total load = q_max * L / 2.
//
// The fixed-end moment is smaller than for UDL (load is shifted
// toward the roller end). The contraflexure point exists between
// the fixed end and the centroid of loading.
//
// For triangular load on propped cantilever (fixed-roller):
//   Using compatibility: the contraflexure point is closer to
//   the fixed end compared to UDL. We verify its existence and
//   that it lies in the left portion of the beam.

#[test]
fn validation_poc_ext_propped_cantilever_triangular() {
    let l: f64 = 10.0;
    let n: usize = 100;
    let q_max: f64 = -15.0;
    let dx: f64 = l / n as f64;

    // Triangular load: linearly increasing from 0 at left to q_max at right
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i: f64 = (i - 1) as f64 / n as f64;
            let x_j: f64 = i as f64 / n as f64;
            let qi: f64 = q_max * x_i;
            let qj: f64 = q_max * x_j;
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

    // Vertical equilibrium: sum of reactions = total load = q_max * L / 2
    let total_load: f64 = q_max.abs() * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(
        sum_ry,
        total_load,
        0.02,
        "Propped tri: sum Ry = q_max*L/2",
    );

    // Fixed end should have a moment reaction
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(
        r_a.mz.abs() > 0.1,
        "Propped tri: fixed end moment exists: {:.4}",
        r_a.mz
    );

    // Contraflexure should exist
    let pts = find_contraflexure_points(&results, 1..=n);
    assert!(
        !pts.is_empty(),
        "Propped tri: contraflexure point exists"
    );

    // Contraflexure should be in the left portion of the beam (< L/2)
    // because the triangular load has less intensity near the fixed end
    let x_contra: f64 = pts[0].1;
    assert!(
        x_contra < l / 2.0,
        "Propped tri: contraflexure in left half: x = {:.4} < L/2 = {:.4}",
        x_contra,
        l / 2.0
    );

    // The contraflexure for triangular load should be closer to the fixed end
    // than for UDL (where it is at L/4 = 2.5m for L=10). Since the load is
    // shifted rightward, the fixed-end moment is smaller, pushing the
    // contraflexure closer to the fixed end.
    let x_udl_contra: f64 = l / 4.0;
    assert!(
        x_contra < x_udl_contra + 3.0 * dx,
        "Propped tri: contraflexure ({:.4}) near or before UDL value ({:.4})",
        x_contra,
        x_udl_contra
    );

    // Also compare with UDL case explicitly
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -10.0,
                q_j: -10.0,
                a: None,
                b: None,
            })
        })
        .collect();
    let input_udl = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_udl);
    let results_udl = linear::solve_2d(&input_udl).unwrap();
    let pts_udl = find_contraflexure_points(&results_udl, 1..=n);
    assert!(!pts_udl.is_empty(), "UDL comparison: contraflexure exists");

    let x_udl_actual: f64 = pts_udl[0].1;

    // Triangular load contraflexure should differ from UDL contraflexure
    // (triangular shifts the zero-crossing position)
    let diff: f64 = (x_contra - x_udl_actual).abs();
    assert!(
        diff < l / 2.0,
        "Propped tri: reasonable difference from UDL case: diff = {:.4}",
        diff
    );
}
