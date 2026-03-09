/// Validation: Advanced Influence Line Benchmarks (Solver-Based)
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 6
///   - Kassimali, "Structural Analysis", 5th Ed., Ch. 8
///   - Ghali & Neville, "Structural Analysis", 7th Ed., Ch. 12
///   - Clapeyron's Three-Moment Equation (1857)
///   - Mueller-Breslau, "Die neueren Methoden der Festigkeitslehre" (1886)
///
/// These tests construct influence lines numerically by placing a unit
/// load at successive nodes and solving each case, then compare the
/// computed IL ordinates against analytical formulas.
///
/// Tests:
///   1. IL for midspan moment of SS beam (triangular, peak = L/4)
///   2. IL for interior reaction of 2-span continuous beam (Clapeyron)
///   3. IL for shear at L/4 of SS beam (step function)
///   4. Mueller-Breslau principle: IL shape = released deflection shape
///   5. Maximum moment under moving load train using IL integration
///   6. IL for cantilever tip deflection (linear shape)
///   7. IL for fixed-end moment of propped cantilever
///   8. IL for negative moment over interior support of 2-span beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. IL for Midspan Moment of SS Beam
// ================================================================
//
// For a simply supported beam of span L, the influence line for
// bending moment at midspan when a unit load P=1 traverses:
//   IL_M(x) = x/2          for 0 <= x <= L/2
//   IL_M(x) = (L - x)/2    for L/2 <= x <= L
//
// Peak ordinate = L/4 at x = L/2 (triangular shape).
//
// Reference: Hibbeler, Structural Analysis, Ch. 6, Example 6.3

#[test]
fn validation_il_ext_1_ss_midspan_moment() {
    let l = 10.0;
    let n = 10;
    let mid_elem = n / 2; // element whose end node is at midspan

    // Build IL by moving a unit downward load across the beam
    let mut il_m = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        // Moment at midspan = m_end of the element ending at the midspan node
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == mid_elem).unwrap();
        il_m.push(ef.m_end.abs());
    }

    // Verify triangular shape at selected points
    for (i, &m) in il_m.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = if x <= l / 2.0 + 1e-10 {
            x / 2.0
        } else {
            (l - x) / 2.0
        };
        assert_close(m, expected, 0.05,
            &format!("IL M_mid at x={:.1}", x));
    }

    // Peak at midspan: L/4
    let peak = il_m.iter().cloned().fold(0.0_f64, f64::max);
    assert_close(peak, l / 4.0, 0.02, "IL M_mid peak = L/4");

    // Boundaries: IL = 0 at supports
    assert!(il_m[0] < 0.01, "IL M at left support ~ 0: {:.6}", il_m[0]);
    assert!(il_m[n] < 0.01, "IL M at right support ~ 0: {:.6}", il_m[n]);
}

// ================================================================
// 2. IL for Interior Reaction of 2-Span Continuous Beam
// ================================================================
//
// Two equal spans L. Unit load traverses span 1 (left span).
// IL for the total interior reaction R_B (Clapeyron / three-moment eq.):
//   IL_R_B(xi) = xi*(3L^2 - xi^2) / (2L^3)   for 0 <= xi <= L
//
// At xi = L/2: IL = 11/16 = 0.6875
// At xi = L:   IL = 1.0 (load directly on support)
//
// Reference: Ghali & Neville, Table 12.4 (full reaction form)

#[test]
fn validation_il_ext_2_continuous_reaction() {
    let span = 8.0;
    let n_per_span = 8;
    let interior_node = n_per_span + 1;

    // Move unit load across span 1 only (nodes 1..=n_per_span+1)
    let mut il_rb = Vec::new();
    for i in 1..=n_per_span + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();
        let rb = results.reactions.iter()
            .find(|r| r.node_id == interior_node).unwrap().ry;
        il_rb.push(rb);
    }

    // The correct IL for the interior reaction R_B of a 2-span continuous
    // beam (equal spans L) with unit load at xi in span 1:
    //   IL_R_B(xi) = xi*(3L^2 - xi^2) / (2L^3)
    //
    // This is twice the "span 1 contribution" formula from Ghali & Neville
    // Table 12.4 because the solver returns the total reaction at B.
    //
    // At xi = L/2: IL = (L/2)*(3L^2 - L^2/4)/(2L^3) = 11/16 = 0.6875
    // At xi = L:   IL = L*(3L^2 - L^2)/(2L^3) = 2L^3/(2L^3) = 1.0
    let l = span;
    for (i, &rb) in il_rb.iter().enumerate() {
        let xi = i as f64 * l / n_per_span as f64;
        let expected = xi * (3.0 * l * l - xi * xi) / (2.0 * l * l * l);
        assert_close(rb, expected, 0.05,
            &format!("IL R_B at xi={:.1}", xi));
    }

    // At midspan: 11/16
    let mid_idx = n_per_span / 2;
    assert_close(il_rb[mid_idx], 11.0 / 16.0, 0.05,
        "IL R_B at midspan = 11/16");

    // At interior support: 1.0 (load directly on the support)
    assert_close(il_rb[n_per_span], 1.0, 0.02,
        "IL R_B at support B = 1.0");
}

// ================================================================
// 3. IL for Shear at L/4 of SS Beam
// ================================================================
//
// For SS beam, shear IL at section a = L/4:
//   IL_V(x) = -x/L           for 0 <= x < a  (load left of section)
//   IL_V(x) = 1 - x/L        for a < x <= L  (load right of section)
//
// Just left of a:  IL = -a/L = -0.25
// Just right of a: IL = 1 - a/L = 0.75
// Jump = 1.0
//
// Reference: Hibbeler, Ch. 6, Example 6.4

#[test]
fn validation_il_ext_3_shear_at_quarter_point() {
    let l = 8.0;
    let n = 8;
    let section_elem = n / 4; // element ending at L/4

    // Build shear IL
    let mut il_v = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == section_elem).unwrap();
        il_v.push(ef.v_end);
    }

    // Check: load far right (at B): V = 1 - L/L = 0
    assert_close(il_v[n].abs(), 0.0, 0.05,
        "IL V at right support ~ 0");

    // Load at left support (x=0): IL = -0/L = 0
    assert_close(il_v[0].abs(), 0.0, 0.05,
        "IL V at left support ~ 0");

    // For load right of the section: shear should be positive and follow 1-x/L
    // Check at x = L/2 (node n/2): expected = 1 - 0.5 = 0.5
    let idx_half = n / 2;
    assert_close(il_v[idx_half], 0.5, 0.10,
        "IL V at L/2 = 0.5");

    // At x = 3L/4 (node 3n/4): expected = 1 - 0.75 = 0.25
    let idx_3q = 3 * n / 4;
    assert_close(il_v[idx_3q], 0.25, 0.10,
        "IL V at 3L/4 = 0.25");

    // All IL values should be bounded by [-1, 1]
    for (i, &v) in il_v.iter().enumerate() {
        assert!(v.abs() <= 1.01,
            "IL V at node {}: |V| <= 1: {:.4}", i + 1, v);
    }
}

// ================================================================
// 4. Mueller-Breslau Principle Verification
// ================================================================
//
// The Mueller-Breslau principle states that the IL for a force
// quantity is proportional to the deflected shape obtained by
// removing that constraint and applying a unit deformation.
//
// For SS beam, IL for R_A = deflection curve when support A
// is given a unit settlement = linear from 1 at A to 0 at B.
//
// Here we verify that IL from moving unit load matches the
// analytical linear shape (direct verification of the principle).

#[test]
fn validation_il_ext_4_muller_breslau_verification() {
    let l = 10.0;
    let n = 10;

    // Compute IL for R_A by moving unit load
    let mut il_ra = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ra = results.reactions.iter()
            .find(|r| r.node_id == 1).unwrap().ry;
        il_ra.push(ra);
    }

    // Mueller-Breslau: IL_R_A(x) = 1 - x/L (linear shape)
    for (i, &ra) in il_ra.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = 1.0 - x / l;
        assert_close(ra, expected, 0.02,
            &format!("MB: IL R_A at x={:.1}", x));
    }

    // Also verify IL for R_B = x/L (complementary)
    let mut il_rb = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let rb = results.reactions.iter()
            .find(|r| r.node_id == n + 1).unwrap().ry;
        il_rb.push(rb);
    }

    for (i, &rb) in il_rb.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = x / l;
        assert_close(rb, expected, 0.02,
            &format!("MB: IL R_B at x={:.1}", x));
    }

    // Equilibrium: IL_R_A + IL_R_B = 1 at every position
    for i in 0..=n {
        let sum = il_ra[i] + il_rb[i];
        assert_close(sum, 1.0, 0.02,
            &format!("MB: R_A + R_B = 1 at node {}", i + 1));
    }
}

// ================================================================
// 5. Maximum Moment Under Moving Load Train Using IL
// ================================================================
//
// Two concentrated loads P1=100kN and P2=100kN, spacing d=4m,
// on SS beam L=12m.
//
// By IL integration for midspan moment:
//   - Place both loads and compute sum of IL ordinates * weights
//   - Critical position: resultant centered at midspan
//   - For equal loads: center the pair around midspan
//     Load 1 at L/2 - d/2, Load 2 at L/2 + d/2
//     M_mid = P1 * IL(L/2 - d/2) + P2 * IL(L/2 + d/2)
//           = P * (L/2 - d/2)/2 + P * (L/2 - d/2)/2   (by symmetry)
//           = P * (L - d) / 2
//
// Reference: Ghali & Neville, Ch. 12

#[test]
fn validation_il_ext_5_moving_load_maximum() {
    let l = 12.0;
    let n = 24; // fine mesh
    let p = 100.0;
    let d = 4.0;
    let mid_elem = n / 2;

    // Compute IL for midspan moment
    let mut il_m = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == mid_elem).unwrap();
        il_m.push(ef.m_end.abs());
    }

    // Find maximum M_mid by sweeping the load train across the beam
    let dx = l / n as f64;
    let mut m_max = 0.0_f64;

    for start_idx in 0..=n {
        let x1 = start_idx as f64 * dx;
        let x2 = x1 + d;
        if x2 > l + 1e-10 { break; }

        // Interpolate IL at load positions
        let il1 = interpolate_il(&il_m, x1, l, n);
        let il2 = interpolate_il(&il_m, x2, l, n);

        let m = p * il1 + p * il2;
        if m > m_max { m_max = m; }
    }

    // Analytical: optimal placement centers the pair about midspan
    // M_mid = P * IL(L/2 - d/2) + P * IL(L/2 + d/2)
    //       = P * (L/2 - d/2)/2 + P * (L - (L/2 + d/2))/2
    //       = P * (L - d) / 2 = 100 * 8 / 2 = 400 kN-m
    let m_analytical = p * (l - d) / 2.0;

    assert_close(m_max, m_analytical, 0.05,
        "Moving load train: max M_mid");
}

/// Linearly interpolate the IL ordinate at position x.
fn interpolate_il(il: &[f64], x: f64, l: f64, n: usize) -> f64 {
    let dx = l / n as f64;
    let idx = (x / dx).floor() as usize;
    if idx >= n { return il[n]; }
    let frac = (x - idx as f64 * dx) / dx;
    il[idx] * (1.0 - frac) + il[idx + 1] * frac
}

// ================================================================
// 6. IL for Cantilever Tip Deflection
// ================================================================
//
// For a cantilever of length L (fixed at left, free at right),
// the tip deflection when a unit downward load is at position x
// from the fixed end:
//   delta_tip(x) = x^2 * (3L - x) / (6EI)
//
// This is NOT linear; it is a cubic function. But we verify the
// solver captures the shape correctly, and also check that the
// IL for the fixed-end reaction R_A is always 1.0 (since the
// cantilever has only one vertical reaction).
//
// Reference: Gere & Goodno, Mechanics of Materials, Table D-1

#[test]
fn validation_il_ext_6_cantilever_il() {
    let l = 6.0;
    let n = 12;

    // IL for fixed-end reaction R_A: always = 1 (all load carried)
    let mut il_ra = Vec::new();
    // IL for fixed-end moment M_A: linear = x (moment arm)
    let mut il_ma = Vec::new();

    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        let results = linear::solve_2d(&input).unwrap();

        let ra = results.reactions.iter()
            .find(|r| r.node_id == 1).unwrap().ry;
        let ma = results.reactions.iter()
            .find(|r| r.node_id == 1).unwrap().mz;
        il_ra.push(ra);
        il_ma.push(ma);
    }

    // R_A should always be 1.0 (all vertical load goes to the support)
    for (i, &ra) in il_ra.iter().enumerate() {
        assert_close(ra, 1.0, 0.02,
            &format!("Cantilever IL R_A at node {}: should be 1.0", i + 1));
    }

    // M_A = x (moment arm from fixed support to load)
    // Convention: downward load at distance x produces hogging at support.
    // The magnitude should equal x.
    for (i, &ma) in il_ma.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        if x < 1e-10 { continue; } // skip the support node itself
        assert_close(ma.abs(), x, 0.05,
            &format!("Cantilever IL M_A at x={:.1}: should be {:.1}", x, x));
    }

    // Tip deflection IL shape: cubic x^2*(3L-x)/(6EI)
    // We verify the shape is monotonically increasing
    let mut tip_defl = Vec::new();
    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
        let results = linear::solve_2d(&input).unwrap();
        let tip_node = n + 1;
        let uy = results.displacements.iter()
            .find(|d| d.node_id == tip_node).unwrap().uy;
        tip_defl.push(uy);
    }

    // Verify monotonically increasing deflection (in magnitude)
    for i in 1..tip_defl.len() {
        assert!(tip_defl[i].abs() >= tip_defl[i - 1].abs() - 1e-10,
            "Tip deflection IL: monotonic at node {}: {:.6} vs {:.6}",
            i + 1, tip_defl[i].abs(), tip_defl[i - 1].abs());
    }
}

// ================================================================
// 7. IL for Fixed-End Moment of Propped Cantilever
// ================================================================
//
// Propped cantilever: fixed at left (A), roller at right (B).
// When a unit load is at distance x from A:
//   M_A(x) = -x * (L - x)^2 / (2L^2) * 2
//          = -x/2 * (1 - x/L)^2   (simplified for unit L)
//
// More precisely from force method:
//   M_A(x) = -x * (2L^2 - 3Lx + x^2) / (2L^2)
//          = -x * (2L - x)*(L - x) / (2L^2)  -- but check derivation
//
// Actually, the standard result for propped cantilever (fixed-roller):
//   R_B(x) = x^2*(3L - x) / (2L^3)   (roller reaction)
//   M_A(x) = -x*(L^2 - x^2) / (2L^2) + x
//          ... the sign depends on convention.
//
// We directly verify by comparing solver M_A to: moment equilibrium.
//   sum M about A: M_A + R_B*L - 1*x = 0
//   => M_A = x - R_B*L
//
// where R_B = x^2*(3L - x)/(2L^3)
//
// Reference: Gere & Goodno, Table D-2

#[test]
fn validation_il_ext_7_propped_cantilever_moment() {
    let l = 8.0;
    let n = 16;

    let mut il_ma = Vec::new();
    let mut il_rb = Vec::new();

    for i in 1..=n + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();

        let ma = results.reactions.iter()
            .find(|r| r.node_id == 1).unwrap().mz;
        let rb = results.reactions.iter()
            .find(|r| r.node_id == n + 1).unwrap().ry;
        il_ma.push(ma);
        il_rb.push(rb);
    }

    // Verify R_B = x^2*(3L - x) / (2L^3) from flexibility method
    for (i, &rb) in il_rb.iter().enumerate() {
        let x = i as f64 * l / n as f64;
        let expected = x * x * (3.0 * l - x) / (2.0 * l * l * l);
        assert_close(rb, expected, 0.05,
            &format!("Propped IL R_B at x={:.1}", x));
    }

    // Verify M_A from equilibrium: M_A = x - R_B*L
    // (Taking moments about A: M_A + R_B*L = 1*x for downward unit load)
    // So M_A = x - R_B*L. The sign convention of the solver gives M_A
    // as the reaction moment. We check the magnitude relationship.
    for i in 1..n {
        let x = i as f64 * l / n as f64;
        let rb_analytical = x * x * (3.0 * l - x) / (2.0 * l * l * l);
        let ma_from_equil = x - rb_analytical * l;
        // ma_from_equil should match the solver's M_A (may differ in sign)
        assert_close(il_ma[i].abs(), ma_from_equil.abs(), 0.05,
            &format!("Propped IL M_A at x={:.1}: equil check", x));
    }

    // Boundary: M_A(0) = 0 (no load) and M_A(L) = 0 (load at roller)
    assert!(il_ma[0].abs() < 0.01,
        "Propped IL M_A at x=0 ~ 0: {:.6}", il_ma[0]);
    // At x=L, R_B = L^2*(3L-L)/(2L^3) = 1, so M_A = L - 1*L = 0
    assert!(il_ma[n].abs() < 0.01,
        "Propped IL M_A at x=L ~ 0: {:.6}", il_ma[n]);
}

// ================================================================
// 8. IL for Negative Moment Over Interior Support of 2-Span Beam
// ================================================================
//
// For a 2-span continuous beam (equal spans L), the influence line
// for bending moment at the interior support B when a unit load
// is at position xi in span 1:
//   IL_M_B(xi) = -xi*(L^2 - xi^2) / (4L^2)
//
// The IL is always non-positive (hogging) for load in span 1.
// Maximum negative ordinate at xi = L/sqrt(3).
// At xi = L/2: IL = -3L/32
//
// Reference: Kassimali, Structural Analysis, Ch. 8

#[test]
fn validation_il_ext_8_two_span_negative_moment() {
    let span = 10.0;
    let n_per_span = 10;

    // We read the moment from the element ending at the interior support.
    // Element n_per_span ends at the interior node.
    let support_elem = n_per_span;

    let mut il_mb = Vec::new();
    for i in 1..=n_per_span + 1 {
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: i, fx: 0.0, fy: -1.0, mz: 0.0,
        })];
        let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
        let results = linear::solve_2d(&input).unwrap();

        let ef = results.element_forces.iter()
            .find(|e| e.element_id == support_elem).unwrap();
        il_mb.push(ef.m_end);
    }

    // Analytical: IL_M_B(xi) = -xi*(L^2 - xi^2)/(4L^2)
    let l = span;
    for (i, &mb) in il_mb.iter().enumerate() {
        let xi = i as f64 * l / n_per_span as f64;
        let expected = -xi * (l * l - xi * xi) / (4.0 * l * l);
        // The solver moment sign depends on convention; compare magnitudes
        // and verify they have the same sign direction
        if expected.abs() > 1e-6 {
            assert_close(mb.abs(), expected.abs(), 0.10,
                &format!("IL M_B at xi={:.1}: magnitude", xi));
        }
    }

    // At xi = L/2: IL = -3L/32
    let mid_idx = n_per_span / 2;
    let expected_mid = 3.0 * l / 32.0;
    assert_close(il_mb[mid_idx].abs(), expected_mid, 0.10,
        "IL M_B at midspan = 3L/32");

    // Boundary: IL = 0 at xi = 0 and xi = L
    assert!(il_mb[0].abs() < 0.01,
        "IL M_B at xi=0 ~ 0: {:.6}", il_mb[0]);
    assert!(il_mb[n_per_span].abs() < 0.01,
        "IL M_B at xi=L ~ 0: {:.6}", il_mb[n_per_span]);

    // All IL ordinates should have same sign (non-positive, hogging at support)
    // The moment at the interior support from a load in span 1 should be
    // consistently hogging (one sign). We just check consistency of sign
    // for interior points (skip boundaries which are ~0).
    let signs: Vec<f64> = il_mb[1..n_per_span].iter()
        .map(|&m| m.signum())
        .collect();
    let first_sign = signs[0];
    for (i, &s) in signs.iter().enumerate() {
        assert!((s - first_sign).abs() < 1e-10,
            "IL M_B: consistent sign at index {}: {:.1} vs {:.1}", i + 1, s, first_sign);
    }
}
