/// Validation: Points of Contraflexure (Inflection Points)
///
/// The point of contraflexure is the location along a beam or column
/// where the bending moment is zero and changes sign. At these points
/// the curvature is zero (EI·y'' = M = 0), making them equivalent to
/// internal pins in simplified analyses.
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., McGraw-Hill (1965)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 9
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed., Ch. 6
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed.
///
/// Tests:
///   1. Fixed-fixed UDL: exact inflection positions at (1-1/√3)·L/2 from each end
///   2. Propped cantilever UDL: single inflection at 3L/8 from fixed end (approx)
///   3. Fixed-fixed mid-span point load: inflection at L/4 from each end
///   4. Portal frame lateral load: inflection at mid-height of columns
///   5. Adding fixity moves inflection point away from support
///   6. Symmetric loading produces symmetric inflection positions
///   7. Inflection point count: simply-supported beam has none; fixed-fixed has two
///   8. Continuous beam interior span: two inflection points bracket the sagging zone
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// Helper: find elements where moment changes sign
// ================================================================
//
// Returns (element_id, x_approx) pairs where m_start and m_end
// have opposite signs (sign change brackets an inflection point).

fn inflection_elements(
    results: &AnalysisResults,
    l: f64,
    n: usize,
    elem_range: std::ops::RangeInclusive<usize>,
) -> Vec<(usize, f64)> {
    let dx = l / n as f64;
    let m_max = results.element_forces.iter()
        .map(|ef| ef.m_start.abs().max(ef.m_end.abs()))
        .fold(0.0f64, f64::max);
    let noise = m_max * 1e-8;

    let range_start = *elem_range.start();
    let range_end = *elem_range.end();

    // Build nodal moment profile. Each node gets the moment from the
    // element end touching it. At interior nodes, m_end[i] ≈ m_start[i+1].
    let mut node_moments: Vec<(f64, f64)> = Vec::new(); // (x, moment)
    for i in range_start..=range_end {
        if let Some(ef) = results.element_forces.iter().find(|e| e.element_id == i) {
            if i == range_start {
                node_moments.push(((i - 1) as f64 * dx, ef.m_start));
            }
            node_moments.push((i as f64 * dx, ef.m_end));
        }
    }

    // Find sign changes, skipping nodes where moment is noise-level.
    // Track the last "significant" moment and check for sign changes.
    let mut pts = Vec::new();
    let mut last_significant: Option<(usize, f64, f64)> = None; // (index, x, moment)

    for (idx, &(x, m)) in node_moments.iter().enumerate() {
        if m.abs() <= noise { continue; } // skip noise-level values
        if let Some((_, last_x, last_m)) = last_significant {
            if last_m * m < 0.0 {
                // Sign change between last_significant and current node.
                // Interpolate to find zero crossing.
                let x_zero = last_x + (x - last_x) * last_m.abs() / (last_m.abs() + m.abs());
                // Find which element contains this crossing
                let elem_id = (x_zero / dx).floor() as usize + range_start;
                let elem_id = elem_id.min(range_end);
                pts.push((elem_id, x_zero));
            }
        }
        last_significant = Some((idx, x, m));
    }

    pts
}

// ================================================================
// 1. Fixed-Fixed Beam UDL: Exact Inflection Positions
// ================================================================
//
// Source: Timoshenko & Young, "Theory of Structures", §5-1
// For a fixed-fixed beam of length L under uniform load w:
//   M(x) = w/2·[-x² + Lx - L²/6]
// Setting M(x) = 0 and solving (using standard fixed-fixed FEF):
//   Fixed-end moments: M_A = M_B = wL²/12
//   Reactions: R_A = R_B = wL/2
//   M(x) = R_A·x - M_A - w·x²/2 = wLx/2 - wL²/12 - wx²/2
//   M(x) = 0 → x² - Lx + L²/6 = 0
//   x = L/2 ± L/2·√(1 - 2/3) = L/2 ± L/(2√3)
//   x₁ = L/2·(1 - 1/√3) ≈ 0.2113·L
//   x₂ = L/2·(1 + 1/√3) ≈ 0.7887·L

#[test]
fn validation_poc_fixed_fixed_udl_positions() {
    let l = 12.0;
    let n = 120;
    let q: f64 = -10.0;
    let dx = l / n as f64;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let pts = inflection_elements(&results, l, n, 1..=n);
    assert!(pts.len() >= 2,
        "Fixed-fixed UDL must have ≥ 2 inflection points, got {}", pts.len());

    let sqrt3 = 3.0_f64.sqrt();
    let x1_exact = l * 0.5 * (1.0 - 1.0 / sqrt3); // ≈ 0.2113·L
    let x2_exact = l * 0.5 * (1.0 + 1.0 / sqrt3); // ≈ 0.7887·L

    let x1_fem = pts[0].1;
    let x2_fem = pts[pts.len() - 1].1;

    assert!(
        (x1_fem - x1_exact).abs() < 3.0 * dx,
        "Fixed-fixed UDL: x₁ = {:.4} m, exact = {:.4} m (tol={:.4})",
        x1_fem, x1_exact, 3.0 * dx
    );
    assert!(
        (x2_fem - x2_exact).abs() < 3.0 * dx,
        "Fixed-fixed UDL: x₂ = {:.4} m, exact = {:.4} m (tol={:.4})",
        x2_fem, x2_exact, 3.0 * dx
    );
}

// ================================================================
// 2. Propped Cantilever UDL: Inflection Point Location
// ================================================================
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., Example 10-2
// Fixed at left (x=0), roller at right (x=L), UDL q downward.
// Fixed-end moment: M_A = qL²/8 (hogging)
// Reactions: R_A = 5qL/8, R_B = 3qL/8
// Moment: M(x) = R_A·x - M_A - qx²/2
//   = 5qLx/8 - qL²/8 - qx²/2
// M(x) = 0 → 4x² - 5Lx + L² = 0
// x = [5L ± √(25L² - 16L²)] / 8 = [5L ± 3L] / 8
// x = L (roller support) or x = L/4

#[test]
fn validation_poc_propped_cantilever_udl() {
    let l = 8.0;
    let n = 80;
    let q: f64 = -10.0;
    let dx = l / n as f64;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    // Fixed at left, roller at right
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let pts = inflection_elements(&results, l, n, 1..=n);
    assert!(!pts.is_empty(),
        "Propped cantilever UDL must have at least 1 inflection point");

    // There should be exactly one interior inflection point at x = L/4
    let x_exact = l / 4.0;
    let x_fem = pts[0].1;

    assert!(
        (x_fem - x_exact).abs() < 3.0 * dx,
        "Propped cantilever UDL: inflection at x = {:.4} m, exact = L/4 = {:.4} m",
        x_fem, x_exact
    );
}

// ================================================================
// 3. Fixed-Fixed Mid-Span Point Load: Inflections at L/4 and 3L/4
// ================================================================
//
// Source: Kassimali, "Structural Analysis", 6th Ed., Table 15-1
// Fixed-fixed beam, span L, point load P at midspan.
// Fixed-end moments: M_A = M_B = PL/8
// Reactions: R_A = R_B = P/2
// Left half (0 ≤ x ≤ L/2):
//   M(x) = P/2·x - PL/8
//   M(x) = 0 → x = L/4
// Inflection points at x = L/4 and x = 3L/4 (by symmetry).

#[test]
fn validation_poc_fixed_fixed_point_load() {
    let l = 10.0;
    let n = 100;
    let p = 20.0;
    let mid_node = n / 2 + 1;
    let dx = l / n as f64;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let pts = inflection_elements(&results, l, n, 1..=n);
    assert!(pts.len() >= 2,
        "Fixed-fixed point load: need ≥ 2 inflection points, got {}", pts.len());

    let x1_exact = l / 4.0;
    let x2_exact = 3.0 * l / 4.0;

    let x1_fem = pts[0].1;
    let x2_fem = pts[pts.len() - 1].1;

    assert!(
        (x1_fem - x1_exact).abs() < 3.0 * dx,
        "Fixed-fixed PL: x₁ = {:.4}, exact = L/4 = {:.4}", x1_fem, x1_exact
    );
    assert!(
        (x2_fem - x2_exact).abs() < 3.0 * dx,
        "Fixed-fixed PL: x₂ = {:.4}, exact = 3L/4 = {:.4}", x2_fem, x2_exact
    );
}

// ================================================================
// 4. Portal Frame Lateral Load: Inflection at Column Mid-Height
// ================================================================
//
// Source: Leet, Uang & Gilbert, "Fundamentals of Structural Analysis",
//         5th Ed., §12-4 (Portal Method)
// Fixed-base symmetric portal frame under lateral load H at roof level.
// The Portal Method approximates inflection points at column mid-heights.
// For equal fixed-base columns with rigid beam, this is exact.
// For finite beam stiffness, the inflection point shifts slightly.
//
// In this test: columns are elements 1 (left) and 3 (right).
// Inflection should be in the column height range.

#[test]
fn validation_poc_portal_column_midheight() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;

    // Portal frame: nodes 1,2 (left column), 2,3 (beam), 3,4 (right column)
    // Supports fixed at 1 and 4
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: f_lat, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Column 1 (elem 1): left column bottom→top (nodes 1→2)
    // Column 3 (elem 3): right column top→bottom (nodes 3→4, reversed)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Both columns should have moments of opposite sign at top vs bottom
    // (inflection exists within the column height)
    assert!(ef1.m_start * ef1.m_end < 0.0,
        "Left column: m_start={:.4}, m_end={:.4} should have opposite signs",
        ef1.m_start, ef1.m_end);
    assert!(ef3.m_start * ef3.m_end < 0.0,
        "Right column: m_start={:.4}, m_end={:.4} should have opposite signs",
        ef3.m_start, ef3.m_end);

    // Inflection is at mid-height for the symmetric case;
    // verify by checking the fractional position:
    // frac = |m_bottom| / (|m_bottom| + |m_top|) ≈ 0.5
    let frac1 = ef1.m_start.abs() / (ef1.m_start.abs() + ef1.m_end.abs());
    let frac3 = ef3.m_start.abs() / (ef3.m_start.abs() + ef3.m_end.abs());

    // Should be reasonably close to 0.5 (pure portal method says 0.5)
    assert!(frac1 > 0.2 && frac1 < 0.8,
        "Left column inflection fraction {:.3} should be near 0.5", frac1);
    assert!(frac3 > 0.2 && frac3 < 0.8,
        "Right column inflection fraction {:.3} should be near 0.5", frac3);
}

// ================================================================
// 5. Adding Fixity Moves Inflection Point Further from Support
// ================================================================
//
// Source: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., §6.2
// Compare propped cantilever (fixed-pinned) with fixed-fixed beam:
//   - Propped cantilever: one inflection at x = L/4
//   - Fixed-fixed: two inflections at x ≈ 0.211L and 0.789L
// Adding the end fixity (changing roller to fixed) pushes the first
// inflection point from x=L/4 (=0.25L) outward to x≈0.211L
// (slightly closer to the fixed end).
//
// The key observation is that the inflection point on the left side
// shifts when end conditions change.

#[test]
fn validation_poc_fixity_shifts_inflection() {
    let l = 10.0;
    let n = 100;
    let q: f64 = -10.0;
    let dx = l / n as f64;

    let loads_fp: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let loads_ff: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    // Case A: fixed-pinned (propped cantilever) — inflection at L/4
    let input_fp = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_fp);
    let results_fp = linear::solve_2d(&input_fp).unwrap();
    let pts_fp = inflection_elements(&results_fp, l, n, 1..=n);
    assert!(!pts_fp.is_empty(), "Propped cantilever must have inflection");
    let x_fp = pts_fp[0].1;

    // Case B: fixed-fixed — first inflection at ~0.211L
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_ff);
    let results_ff = linear::solve_2d(&input_ff).unwrap();
    let pts_ff = inflection_elements(&results_ff, l, n, 1..=n);
    assert!(pts_ff.len() >= 2, "Fixed-fixed must have ≥ 2 inflection points");
    let x_ff_first = pts_ff[0].1;

    // Propped cantilever has inflection at L/4 ≈ 2.5 m
    assert!(
        (x_fp - l / 4.0).abs() < 3.0 * dx,
        "Propped cantilever inflection at L/4={:.3}: got {:.3}", l / 4.0, x_fp
    );

    // Fixed-fixed first inflection at ~0.211L ≈ 2.11 m
    let sqrt3 = 3.0_f64.sqrt();
    let x_ff_exact = l * 0.5 * (1.0 - 1.0 / sqrt3);
    assert!(
        (x_ff_first - x_ff_exact).abs() < 3.0 * dx,
        "Fixed-fixed first inflection at {:.3}: got {:.3}", x_ff_exact, x_ff_first
    );

    // Adding end fixity moves inflection from L/4 to ~0.211L (closer to fixed end)
    assert!(x_ff_first < x_fp,
        "Adding end fixity: inflection moves from {:.3} to {:.3}", x_fp, x_ff_first);
}

// ================================================================
// 6. Symmetric Loading Produces Symmetric Inflection Points
// ================================================================
//
// Source: Timoshenko & Young, "Theory of Structures", §5-1
// For any symmetric structure under symmetric loading, the moment
// diagram is symmetric. Therefore, inflection points are symmetric
// about the midspan: if there is an inflection at x₁, there is
// one at L - x₁.

#[test]
fn validation_poc_symmetric_inflection_positions() {
    let l = 12.0;
    let n = 120;
    let q: f64 = -10.0;

    // Fixed-fixed beam with UDL (symmetric structure + symmetric load)
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let pts = inflection_elements(&results, l, n, 1..=n);
    assert!(pts.len() >= 2,
        "Fixed-fixed UDL: need ≥ 2 inflection points, got {}", pts.len());

    // Check symmetry: x₁ + x₂ ≈ L
    let x1 = pts[0].1;
    let x2 = pts[pts.len() - 1].1;
    let sum = x1 + x2;

    let dx = l / n as f64;
    assert!(
        (sum - l).abs() < 4.0 * dx,
        "Symmetric inflection: x₁ + x₂ = {:.4} should equal L = {:.4}", sum, l
    );

    // Both should be at equal distances from their respective ends
    let d1 = x1;            // distance from left end
    let d2 = l - x2;        // distance from right end
    assert!(
        (d1 - d2).abs() < 3.0 * dx,
        "Symmetric: d_from_left={:.4}, d_from_right={:.4}", d1, d2
    );
}

// ================================================================
// 7. Inflection Point Count Depends on Support Conditions
// ================================================================
//
// Source: Hibbeler, "Structural Analysis", 10th Ed., §4-4
// Different end conditions produce different numbers of inflection
// points under the same uniform load:
//   - Simply supported (pin-roller): 0 interior inflection points
//     (moment is everywhere sagging, positive)
//   - Fixed-pinned: 1 interior inflection point
//   - Fixed-fixed: 2 interior inflection points

#[test]
fn validation_poc_count_by_support_conditions() {
    let l = 8.0;
    let n = 80;
    let q: f64 = -10.0;

    let make_udl_loads = |count: usize| -> Vec<SolverLoad> {
        (1..=count)
            .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q, q_j: q, a: None, b: None,
            }))
            .collect()
    };

    // Simply supported: no interior inflection (all moments are hogging relative to x-axis)
    let input_ss = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), make_udl_loads(n));
    let results_ss = linear::solve_2d(&input_ss).unwrap();
    let pts_ss = inflection_elements(&results_ss, l, n, 1..=n);
    assert!(pts_ss.is_empty(),
        "Simply supported UDL: 0 inflection points, got {}", pts_ss.len());

    // Fixed-pinned: 1 interior inflection point
    let input_fp = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), make_udl_loads(n));
    let results_fp = linear::solve_2d(&input_fp).unwrap();
    let pts_fp = inflection_elements(&results_fp, l, n, 1..=n);
    assert!(pts_fp.len() == 1,
        "Fixed-pinned UDL: 1 inflection point, got {}", pts_fp.len());

    // Fixed-fixed: 2 interior inflection points
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), make_udl_loads(n));
    let results_ff = linear::solve_2d(&input_ff).unwrap();
    let pts_ff = inflection_elements(&results_ff, l, n, 1..=n);
    assert!(pts_ff.len() == 2,
        "Fixed-fixed UDL: 2 inflection points, got {}", pts_ff.len());
}

// ================================================================
// 8. Continuous Beam Interior Span: Two Inflection Points
// ================================================================
//
// Source: Ghali, Neville & Brown, "Structural Analysis", 7th Ed., §6.5
// A three-span continuous beam with equal spans and UDL has:
//   - Hogging moment at interior supports (over each pier)
//   - Sagging moment in each span interior
// In the interior span, the moment is hogging at both ends (at the
// two interior supports) and sagging in the middle. This produces
// two inflection points within that span, one near each support.

#[test]
fn validation_poc_continuous_interior_span() {
    let span = 6.0;
    let n_per_span = 30;
    let q: f64 = -10.0;
    let total_n = 3 * n_per_span;
    let dx = span / n_per_span as f64;

    let loads: Vec<SolverLoad> = (1..=total_n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior span: elements n_per_span+1 .. 2*n_per_span
    let span2_start = n_per_span + 1;
    let span2_end = 2 * n_per_span;
    let pts = inflection_elements(&results, span, n_per_span, span2_start..=span2_end);

    // Should have exactly 2 inflection points in the interior span
    assert!(pts.len() == 2,
        "Interior span of 3-span beam: expected 2 inflection points, got {}", pts.len());

    // The second element of each tuple is the *absolute* x position
    // (inflection_elements uses (i-1)*dx as origin, so it is global).
    let span2_x_start = span; // absolute x at start of span 2
    let span2_x_end = 2.0 * span;

    for (_elem_id, x_abs) in &pts {
        assert!(*x_abs > span2_x_start && *x_abs < span2_x_end,
            "Inflection at x={:.3} should be interior to span [{:.1}, {:.1}]",
            x_abs, span2_x_start, span2_x_end);
    }

    // The two inflection points should be symmetric about the span midpoint
    // x1_rel and x2_rel are positions relative to the start of span 2
    let x1_abs = pts[0].1;
    let x2_abs = pts[1].1;
    let x1_rel = x1_abs - span2_x_start;
    let x2_rel = x2_abs - span2_x_start;

    // Due to symmetry of 3-span beam with full UDL, inflection points
    // in the middle span should satisfy: x1_rel + x2_rel ≈ span
    assert!(
        (x1_rel + x2_rel - span).abs() < 4.0 * dx,
        "Interior span inflection symmetry: x₁_rel={:.3}, x₂_rel={:.3}, span={:.1}, x₁+x₂={:.3}",
        x1_rel, x2_rel, span, x1_rel + x2_rel
    );

    // Sanity: midspan is in sagging zone (all moments have same sign between inflections)
    let mid_elem = n_per_span / 2; // midspan of interior span (relative element index)
    let mid_elem_abs = span2_start + mid_elem;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem_abs).unwrap();
    let m_mid = (ef_mid.m_start + ef_mid.m_end) / 2.0;

    // Midspan should be sagging (opposite sign to support hogging)
    // Support moments are hogging (negative in most conventions)
    let ef_left_support = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_left_support = ef_left_support.m_end;

    assert!(m_mid * m_left_support < 0.0,
        "Interior span: midspan sagging ({:.4}) opposite to support hogging ({:.4})",
        m_mid, m_left_support);
}
