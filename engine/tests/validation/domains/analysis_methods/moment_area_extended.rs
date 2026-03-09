/// Validation: Moment Area Method — Extended (Mohr's Theorems)
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 8 (Deflections using moment-area)
///   - Ghali & Neville, "Structural Analysis", Ch. 7
///   - Timoshenko, "Strength of Materials", Vol. 1
///   - Roark's "Formulas for Stress and Strain", 8th Ed.
///
/// Extended tests verify slopes and deflections via moment-area theorems:
///   1. SS beam + UDL: midspan deflection = 5qL^4/(384EI)
///   2. Cantilever + UDL: tip deflection = qL^4/(8EI)
///   3. Fixed-fixed beam + UDL: midspan deflection = qL^4/(384EI)
///   4. SS beam + third-point loads: midspan deflection = 23PL^3/(648EI)
///   5. Cantilever + tip load: deflection shape follows cubic y = P(3Lx^2 - x^3)/(6EI)
///   6. Cantilever + end moment: deflection/slope ratio = L/2
///   7. Two-span continuous beam + UDL: midspan deflection of each span
///   8. SS beam + quarter-point load: slopes at both ends
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + UDL: Midspan Deflection = 5qL^4/(384EI)
// ================================================================
//
// First moment-area theorem gives end slopes theta = qL^3/(24EI).
// Second theorem gives midspan deflection delta = 5qL^4/(384EI).
// Verify both values from solver output.

#[test]
fn validation_moment_area_ext_ss_udl_midspan_deflection() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // delta_mid = 5qL^4/(384EI)
    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02,
        "Moment area ext: SS UDL midspan delta = 5qL^4/(384EI)");

    // Also verify end slope theta = qL^3/(24EI)
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let theta_exact = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);
    assert_close(d1.rz.abs(), theta_exact, 0.02,
        "Moment area ext: SS UDL end slope = qL^3/(24EI)");
}

// ================================================================
// 2. Cantilever + UDL: Tip Deflection = qL^4/(8EI)
// ================================================================
//
// The M/EI diagram is parabolic. Second moment-area theorem:
// delta_tip = integral of (M/EI)*x_bar dx = qL^4/(8EI)
// Also verify tip slope theta = qL^3/(6EI)

#[test]
fn validation_moment_area_ext_cantilever_udl_deflection() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -12.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // delta_tip = qL^4/(8EI)
    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Moment area ext: cantilever UDL tip delta = qL^4/(8EI)");

    // theta_tip = qL^3/(6EI)
    let theta_exact = q.abs() * l.powi(3) / (6.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Moment area ext: cantilever UDL tip slope = qL^3/(6EI)");

    // delta/theta ratio = 3L/4 for parabolic M/EI diagram
    let ratio = tip.uy.abs() / tip.rz.abs();
    assert_close(ratio, 3.0 * l / 4.0, 0.02,
        "Moment area ext: cantilever UDL delta/theta = 3L/4");
}

// ================================================================
// 3. Fixed-Fixed Beam + UDL: Midspan Deflection = qL^4/(384EI)
// ================================================================
//
// For fixed-fixed beam under UDL, the midspan deflection is 1/5
// of the simply supported case. The end slopes are zero (fixed).

#[test]
fn validation_moment_area_ext_fixed_fixed_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // delta_mid = qL^4/(384EI) for fixed-fixed
    let delta_exact = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.03,
        "Moment area ext: fixed-fixed UDL midspan delta = qL^4/(384EI)");

    // End slopes must be zero (fixed supports)
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d1.rz.abs() < 1e-10,
        "Moment area ext: fixed-fixed left slope = 0: {:.6e}", d1.rz);
    assert!(d_end.rz.abs() < 1e-10,
        "Moment area ext: fixed-fixed right slope = 0: {:.6e}", d_end.rz);

    // Compare to SS case: fixed-fixed deflection is 1/5 of SS deflection
    let delta_ss = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_ss / 5.0, 0.03,
        "Moment area ext: fixed-fixed delta = (1/5) SS delta");
}

// ================================================================
// 4. SS Beam + Two Symmetric Third-Point Loads: delta = 23PL^3/(648EI)
// ================================================================
//
// Loads P at L/3 and 2L/3 create a constant moment region between them.
// The moment-area approach integrates the trapezoidal M/EI diagram.

#[test]
fn validation_moment_area_ext_four_point_bending() {
    let l = 9.0;
    let n = 18;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let node_a = n / 3 + 1;     // L/3
    let node_b = 2 * n / 3 + 1; // 2L/3

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // delta_mid = 23PL^3/(648EI)
    let delta_exact = 23.0 * p * l.powi(3) / (648.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_exact, 0.03,
        "Moment area ext: 4-point bending midspan delta = 23PL^3/(648EI)");

    // Midspan slope = 0 by symmetry
    assert!(d_mid.rz.abs() < 1e-10,
        "Moment area ext: 4-point bending midspan slope = 0: {:.6e}", d_mid.rz);

    // End slopes are equal magnitude, opposite sign
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d1.rz.abs(), d_end.rz.abs(), 0.01,
        "Moment area ext: 4-point bending symmetric end slopes");
}

// ================================================================
// 5. Cantilever + Tip Load: Cubic Deflection Shape
// ================================================================
//
// By moment-area: y(x) = P/(6EI) * (3Lx^2 - x^3)
// Check deflections at L/4, L/2, 3L/4, and tip against the cubic.

#[test]
fn validation_moment_area_ext_cantilever_cubic_shape() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check at multiple fractions
    for &frac in &[0.25, 0.5, 0.75, 1.0] {
        let node_id = (frac * n as f64).round() as usize + 1;
        let d = results.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let x = (node_id - 1) as f64 * l / n as f64;

        // y(x) = P/(6EI) * (3Lx^2 - x^3)
        let delta_exact = p / (6.0 * e_eff * IZ) * (3.0 * l * x * x - x * x * x);
        assert_close(d.uy.abs(), delta_exact, 0.02,
            &format!("Moment area ext: cantilever cubic at x/L={:.2}", frac));
    }

    // Verify tip value matches PL^3/(3EI)
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_tip_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_tip_exact, 0.02,
        "Moment area ext: cantilever tip delta = PL^3/(3EI)");
}

// ================================================================
// 6. Cantilever + End Moment: Parabolic Shape and Ratio
// ================================================================
//
// Applied moment M at free end produces constant M/EI diagram.
// First theorem: theta_tip = ML/(EI)
// Second theorem: delta_tip = ML^2/(2EI)
// Ratio delta/theta = L/2 (centroid of rectangular diagram)
// Intermediate: y(x) = Mx^2/(2EI)

#[test]
fn validation_moment_area_ext_cantilever_end_moment() {
    let l = 7.0;
    let n = 14;
    let m = 25.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: 0.0, mz: m,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // theta = ML/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "Moment area ext: cantilever moment theta = ML/(EI)");

    // delta = ML^2/(2EI)
    let delta_exact = m * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "Moment area ext: cantilever moment delta = ML^2/(2EI)");

    // Ratio check: delta/theta = L/2
    let ratio = tip.uy.abs() / tip.rz.abs();
    assert_close(ratio, l / 2.0, 0.02,
        "Moment area ext: cantilever moment ratio delta/theta = L/2");

    // Check parabolic shape at midpoint: y(L/2) = M(L/2)^2/(2EI) = ML^2/(8EI)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_mid_exact = m * (l / 2.0) * (l / 2.0) / (2.0 * e_eff * IZ);
    assert_close(d_mid.uy.abs(), delta_mid_exact, 0.02,
        "Moment area ext: cantilever moment parabolic at L/2");
}

// ================================================================
// 7. Two-Span Continuous Beam + UDL: Midspan Deflection
// ================================================================
//
// Equal spans L, uniform load q on both spans.
// By three-moment equation, interior moment M_B = -qL^2/8.
// Midspan deflection of each span (by symmetry):
//   delta_mid = qL^4/(192EI) * (5 - 24*(M_B/(qL^2)))
// With M_B = -qL^2/8: delta_mid = qL^4/(192EI) * (5 - 24*(-1/8)) = qL^4/(192EI) * 8
//   = qL^4/(24EI)
// Exact: delta_mid = qL^4 * (5/384 - 1/16 * 1/8 * ... )
// Actually using standard result: delta_mid = qL^4/(185*EI) is for propped cantilever.
// For two-span equal continuous beam with UDL on both:
//   M_B = -qL^2/8, R_A = 3qL/8
//   delta at midspan = (5qL^4/384 - M_B*L^2/16)/(EI) ... complex derivation.
// Simpler: compare FEM deflection at midspan against deflection at quarter-span
// to verify the shape is correct, plus check absolute value numerically.

#[test]
fn validation_moment_area_ext_two_span_continuous() {
    let span = 6.0;
    let n = 12; // per span
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support node
    let interior = n + 1;
    let d_int = results.displacements.iter().find(|d| d.node_id == interior).unwrap();

    // Deflection at interior support = 0 (supported)
    assert!(d_int.uy.abs() < 1e-10,
        "Moment area ext: two-span interior support delta = 0: {:.6e}", d_int.uy);

    // Slope at interior = 0 by symmetry (equal spans, equal loads)
    assert!(d_int.rz.abs() < 1e-10,
        "Moment area ext: two-span interior slope = 0 by symmetry: {:.6e}", d_int.rz);

    // Midspan of span 1 (node n/2 + 1)
    let mid1 = n / 2 + 1;
    let d_mid1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();

    // For two-span continuous beam with UDL on both spans:
    // M_interior = -qL^2/8
    // R_A = 3qL/8
    // Midspan deflection = (R_A * (L/2)^3/6 - q*(L/2)^4/24 ) / (EI)
    //   = ( 3qL/8 * L^3/48  -  q*L^4/384 ) / EI
    //   = ( 3qL^4/384 - qL^4/384 ) / EI = 2qL^4/(384EI) = qL^4/(192EI)
    let delta_mid_exact = q.abs() * span.powi(4) / (192.0 * e_eff * IZ);
    assert_close(d_mid1.uy.abs(), delta_mid_exact, 0.03,
        "Moment area ext: two-span midspan delta = qL^4/(192EI)");

    // Midspan of span 2 (node n + n/2 + 1) should be same by symmetry
    let mid2 = n + n / 2 + 1;
    let d_mid2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap();
    assert_close(d_mid1.uy.abs(), d_mid2.uy.abs(), 0.01,
        "Moment area ext: two-span symmetric midspan deflections");
}

// ================================================================
// 8. SS Beam + Quarter-Point Load: End Slopes
// ================================================================
//
// SS beam with point load P at a = L/4 from left support.
// Left slope:  theta_A = Pb(L^2 - b^2) / (6EIL)  where b = 3L/4
// Right slope: theta_B = Pa(L^2 - a^2) / (6EIL)  where a = L/4
// Deflection under load: delta = Pa^2*b^2 / (3EIL)

#[test]
fn validation_moment_area_ext_ss_quarter_load_slopes() {
    let l = 12.0;
    let n = 24;
    let p = 18.0;
    let e_eff = E * 1000.0;
    let a: f64 = l / 4.0;
    let b: f64 = 3.0 * l / 4.0;

    let load_node = n / 4 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left end slope: theta_A = Pb(L^2 - b^2) / (6EIL)
    let theta_a_exact = p * b * (l * l - b * b) / (6.0 * e_eff * IZ * l);
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert_close(d1.rz.abs(), theta_a_exact, 0.02,
        "Moment area ext: SS quarter load left slope = Pb(L^2-b^2)/(6EIL)");

    // Right end slope: theta_B = Pa(L^2 - a^2) / (6EIL)
    let theta_b_exact = p * a * (l * l - a * a) / (6.0 * e_eff * IZ * l);
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_end.rz.abs(), theta_b_exact, 0.02,
        "Moment area ext: SS quarter load right slope = Pa(L^2-a^2)/(6EIL)");

    // theta_A > theta_B since load is closer to left support
    // Actually: theta_A uses b=3L/4 and theta_B uses a=L/4
    // theta_A = P*(3L/4)*(L^2 - 9L^2/16)/(6EIL) = P*(3L/4)*(7L^2/16)/(6EIL)
    // theta_B = P*(L/4)*(L^2 - L^2/16)/(6EIL) = P*(L/4)*(15L^2/16)/(6EIL)
    // theta_A/theta_B = (3/4 * 7/16) / (1/4 * 15/16) = (21/64)/(15/64) = 21/15 = 7/5
    let ratio = d1.rz.abs() / d_end.rz.abs();
    assert_close(ratio, 7.0 / 5.0, 0.02,
        "Moment area ext: SS quarter load slope ratio = 7/5");

    // Deflection under load: delta = Pa^2*b^2 / (3EIL)
    let delta_exact = p * a * a * b * b / (3.0 * e_eff * IZ * l);
    let d_load = results.displacements.iter().find(|d| d.node_id == load_node).unwrap();
    assert_close(d_load.uy.abs(), delta_exact, 0.02,
        "Moment area ext: SS quarter load delta under load = Pa^2b^2/(3EIL)");
}
