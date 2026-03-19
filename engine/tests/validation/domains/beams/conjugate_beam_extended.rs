/// Validation: Conjugate Beam Method — Extended
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 8 (Conjugate-beam method)
///   - Ghali & Neville, "Structural Analysis", Ch. 7
///   - Timoshenko, "Strength of Materials", Vol. 1
///   - Gere & Goodno, "Mechanics of Materials", Ch. 9
///
/// The conjugate beam transforms slope/deflection problems into
/// equilibrium (shear/moment) problems on a fictitious beam loaded
/// with the M/EI diagram of the real beam.
///
/// Extended tests:
///   1. SS beam + central point load: end slope = PL^2/(16EI)
///   2. Cantilever + UDL: tip slope and deflection
///   3. SS beam + triangular load: midspan deflection
///   4. Fixed-fixed beam + UDL: end moment and midspan deflection
///   5. Cantilever + two point loads: superposition of deflections
///   6. SS beam + end moments: slope at supports
///   7. Propped cantilever + central point load: max deflection
///   8. SS beam + UDL: end slope = qL^3/(24EI)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam + Central Point Load: End Slopes
// ================================================================
//
// For a simply supported beam of length L with a central point load P:
//   theta_end = PL^2 / (16EI)
//   delta_mid = PL^3 / (48EI)

#[test]
fn validation_conjugate_ext_ss_central_point_load() {
    let l = 10.0;
    let n = 20;
    let p = 30.0;
    let e_eff = E * 1000.0;

    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End slope at left support
    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let theta_exact = p * l * l / (16.0 * e_eff * IZ);
    assert_close(d_left.ry.abs(), theta_exact, 0.02,
        "SS central P: theta_end = PL^2/(16EI)");

    // Midspan deflection
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "SS central P: delta_mid = PL^3/(48EI)");

    // Symmetry: left and right end slopes are equal in magnitude
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(d_left.ry.abs(), d_right.ry.abs(), 0.01,
        "SS central P: symmetric end slopes");
}

// ================================================================
// 2. Cantilever + UDL: Tip Slope and Deflection
// ================================================================
//
// Cantilever of length L with uniform load q (downward):
//   theta_tip = qL^3 / (6EI)
//   delta_tip = qL^4 / (8EI)
//   Ratio: delta / theta = 3L/4

#[test]
fn validation_conjugate_ext_cantilever_udl() {
    let l = 6.0;
    let n = 24;
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

    // theta_tip = qL^3 / (6EI)
    let theta_exact = q.abs() * l * l * l / (6.0 * e_eff * IZ);
    assert_close(tip.ry.abs(), theta_exact, 0.02,
        "Cantilever UDL: theta_tip = qL^3/(6EI)");

    // delta_tip = qL^4 / (8EI)
    let delta_exact = q.abs() * l * l * l * l / (8.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02,
        "Cantilever UDL: delta_tip = qL^4/(8EI)");

    // Ratio delta/theta = 3L/4
    let ratio = tip.uz.abs() / tip.ry.abs();
    assert_close(ratio, 3.0 * l / 4.0, 0.02,
        "Cantilever UDL: delta/theta = 3L/4");
}

// ================================================================
// 3. SS Beam + Triangular Load: Midspan Deflection
// ================================================================
//
// Simply supported beam with linearly varying load from 0 at left
// to q_max at right. Peak deflection:
//   delta_max = q_max * L^4 / (120 * sqrt(3) * EI) at x ~ 0.5193L
// Midspan deflection:
//   delta_mid = 5 * q_max * L^4 / (768 * EI)

#[test]
fn validation_conjugate_ext_ss_triangular_load() {
    let l = 10.0;
    let n = 40; // fine mesh for triangular load accuracy
    let q_max: f64 = -15.0;
    let e_eff = E * 1000.0;
    let dx = l / n as f64;

    // Linearly varying load: q(x) = q_max * x / L
    // Each element gets q_i and q_j based on its start and end positions
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let x_i = (i - 1) as f64 * dx;
            let x_j = i as f64 * dx;
            let qi = q_max * x_i / l;
            let qj = q_max * x_j / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: qi, q_j: qj, a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: 5 * q_max * L^4 / (768 * EI)
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_mid_exact = 5.0 * q_max.abs() * l.powi(4) / (768.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_mid_exact, 0.03,
        "SS triangular load: delta_mid = 5qL^4/(768EI)");

    // Max deflection occurs at x ~ 0.5193L (slightly right of center for right-peak load)
    let max_node = results.displacements.iter()
        .max_by(|a, b| a.uz.abs().partial_cmp(&b.uz.abs()).unwrap())
        .unwrap();
    let x_max = (max_node.node_id - 1) as f64 * dx;
    let x_max_exact: f64 = 0.5193 * l;
    assert!((x_max - x_max_exact).abs() < 2.0 * dx,
        "SS triangular load: max defl at x ~ 0.5193L, got {:.3}", x_max);
}

// ================================================================
// 4. Fixed-Fixed Beam + UDL: End Moment and Midspan Deflection
// ================================================================
//
// Fixed-fixed beam with UDL q:
//   M_end = qL^2 / 12 (fixed-end moment)
//   delta_mid = qL^4 / (384EI)
//   End slopes = 0 (both ends fixed)

#[test]
fn validation_conjugate_ext_fixed_fixed_udl() {
    let l = 8.0;
    let n = 20;
    let q: f64 = -10.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: qL^4 / (384EI)
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_exact = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_exact, 0.02,
        "Fixed-fixed UDL: delta_mid = qL^4/(384EI)");

    // End slopes are zero (both ends fixed)
    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_left.ry.abs() < 1e-10,
        "Fixed-fixed UDL: theta_left = 0: {:.6e}", d_left.ry);
    assert!(d_right.ry.abs() < 1e-10,
        "Fixed-fixed UDL: theta_right = 0: {:.6e}", d_right.ry);

    // Fixed-end moment: qL^2/12
    let m_end_exact = q.abs() * l * l / 12.0;
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_left.my.abs(), m_end_exact, 0.02,
        "Fixed-fixed UDL: M_end = qL^2/12");

    // Fixed-fixed deflection is 5x less than simply-supported
    // SS: 5qL^4/(384EI), FF: qL^4/(384EI), ratio = 5
    let delta_ss = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(delta_ss / d_mid.uz.abs(), 5.0, 0.02,
        "Fixed-fixed UDL: 5x stiffer than SS");
}

// ================================================================
// 5. Cantilever + Two Point Loads: Superposition
// ================================================================
//
// Superposition: deflection under combined loads equals sum of
// individual deflections. Test with two point loads at L/3 and 2L/3.

#[test]
fn validation_conjugate_ext_cantilever_superposition() {
    let l = 9.0;
    let n = 18;
    let p1 = 10.0;
    let p2 = 20.0;
    let e_eff = E * 1000.0;

    let node_a = n / 3 + 1;     // L/3
    let node_b = 2 * n / 3 + 1; // 2L/3
    let a_val: f64 = l / 3.0;
    let b_val: f64 = 2.0 * l / 3.0;

    // Combined load
    let loads_both = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input_both = make_beam(n, l, E, A, IZ, "fixed", None, loads_both);
    let res_both = linear::solve_2d(&input_both).unwrap();

    // Load 1 only
    let loads_1 = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_a, fx: 0.0, fz: -p1, my: 0.0 }),
    ];
    let input_1 = make_beam(n, l, E, A, IZ, "fixed", None, loads_1);
    let res_1 = linear::solve_2d(&input_1).unwrap();

    // Load 2 only
    let loads_2 = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: node_b, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input_2 = make_beam(n, l, E, A, IZ, "fixed", None, loads_2);
    let res_2 = linear::solve_2d(&input_2).unwrap();

    // Check superposition at tip
    let tip_both = res_both.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_1 = res_1.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let tip_2 = res_2.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_both.uz, tip_1.uz + tip_2.uz, 0.01,
        "Superposition: tip deflection");
    assert_close(tip_both.ry, tip_1.ry + tip_2.ry, 0.01,
        "Superposition: tip slope");

    // Check superposition at intermediate point (node_b)
    let mid_both = res_both.displacements.iter().find(|d| d.node_id == node_b).unwrap();
    let mid_1 = res_1.displacements.iter().find(|d| d.node_id == node_b).unwrap();
    let mid_2 = res_2.displacements.iter().find(|d| d.node_id == node_b).unwrap();

    assert_close(mid_both.uz, mid_1.uz + mid_2.uz, 0.01,
        "Superposition: intermediate deflection");

    // Verify individual cantilever formulas: delta = Pa^2(3L-a)/(6EI) at tip
    let delta_tip_1_exact = p1 * a_val * a_val * (3.0 * l - a_val) / (6.0 * e_eff * IZ);
    assert_close(tip_1.uz.abs(), delta_tip_1_exact, 0.02,
        "Cantilever P at a: delta_tip = Pa^2(3L-a)/(6EI)");

    let delta_tip_2_exact = p2 * b_val * b_val * (3.0 * l - b_val) / (6.0 * e_eff * IZ);
    assert_close(tip_2.uz.abs(), delta_tip_2_exact, 0.02,
        "Cantilever P at b: delta_tip = Pb^2(3L-b)/(6EI)");
}

// ================================================================
// 6. SS Beam + End Moments: Slopes at Supports
// ================================================================
//
// Simply supported beam with moments M_A at left and M_B at right.
// Using conjugate beam method:
//   theta_A = L/(6EI) * (2*M_A + M_B)
//   theta_B = L/(6EI) * (M_A + 2*M_B)
// With M_A only (M_B = 0):
//   theta_A = M_A * L / (3EI)
//   theta_B = M_A * L / (6EI)

#[test]
fn validation_conjugate_ext_ss_end_moments() {
    let l = 10.0;
    let n = 20;
    let m_a = 50.0;
    let e_eff = E * 1000.0;

    // Apply moment at left support only
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 1, fx: 0.0, fz: 0.0, my: m_a,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // theta_A = M_A * L / (3EI)
    let theta_a_exact = m_a * l / (3.0 * e_eff * IZ);
    assert_close(d_left.ry.abs(), theta_a_exact, 0.02,
        "SS end moment: theta_A = ML/(3EI)");

    // theta_B = M_A * L / (6EI)
    let theta_b_exact = m_a * l / (6.0 * e_eff * IZ);
    assert_close(d_right.ry.abs(), theta_b_exact, 0.02,
        "SS end moment: theta_B = ML/(6EI)");

    // theta_A / theta_B = 2 (from the conjugate beam load distribution)
    assert_close(d_left.ry.abs() / d_right.ry.abs(), 2.0, 0.02,
        "SS end moment: theta_A / theta_B = 2");

    // Maximum deflection: M_A * L^2 / (9*sqrt(3)*EI) at x = L/sqrt(3)
    let delta_max_exact = m_a * l * l / (9.0 * (3.0_f64).sqrt() * e_eff * IZ);
    let max_node = results.displacements.iter()
        .max_by(|a, b| a.uz.abs().partial_cmp(&b.uz.abs()).unwrap())
        .unwrap();
    assert_close(max_node.uz.abs(), delta_max_exact, 0.03,
        "SS end moment: delta_max = ML^2/(9*sqrt(3)*EI)");
}

// ================================================================
// 7. Propped Cantilever + Central Point Load: Max Deflection
// ================================================================
//
// Fixed at left, roller at right, point load P at midspan.
// Redundant reaction at roller: R_B = 5P/16
// Max deflection occurs at x = L * sqrt(5)/5 from the fixed end:
//   delta_max = PL^3 * sqrt(5) / (48*5*EI) = PL^3/(48*sqrt(5)*EI) ...
// A simpler check: deflection under the load (at midspan):
//   delta(L/2) = 7PL^3 / (768EI)

#[test]
fn validation_conjugate_ext_propped_cantilever_point() {
    let l = 10.0;
    let n = 20;
    let p = 25.0;
    let e_eff = E * 1000.0;

    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Deflection at midspan: 7PL^3 / (768EI)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let delta_mid_exact = 7.0 * p * l.powi(3) / (768.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_mid_exact, 0.02,
        "Propped cantilever P: delta(L/2) = 7PL^3/(768EI)");

    // Roller reaction: R_B = 5P/16
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let rb_exact = 5.0 * p / 16.0;
    assert_close(r_right.rz.abs(), rb_exact, 0.02,
        "Propped cantilever P: R_B = 5P/16");

    // Fixed-end slope = 0
    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d_left.ry.abs() < 1e-10,
        "Propped cantilever: theta at fixed end = 0: {:.6e}", d_left.ry);

    // Roller end: deflection = 0, but slope is non-zero
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_right.uz.abs() < 1e-10,
        "Propped cantilever: delta at roller = 0: {:.6e}", d_right.uz);
    assert!(d_right.ry.abs() > 1e-8,
        "Propped cantilever: theta at roller != 0");
}

// ================================================================
// 8. SS Beam + UDL: End Slope = qL^3 / (24EI)
// ================================================================
//
// Classic conjugate beam result for simply supported beam with UDL q:
//   theta_end = qL^3 / (24EI) at both supports
// The conjugate beam is also SS, loaded with the parabolic M/EI diagram.
// The "reaction" of the conjugate beam at each end gives the real slope.

#[test]
fn validation_conjugate_ext_ss_udl_end_slope() {
    let l = 12.0;
    let n = 24;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End slopes: theta = qL^3 / (24EI)
    let theta_exact = q.abs() * l.powi(3) / (24.0 * e_eff * IZ);

    let d_left = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_right = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(d_left.ry.abs(), theta_exact, 0.02,
        "SS UDL: theta_left = qL^3/(24EI)");
    assert_close(d_right.ry.abs(), theta_exact, 0.02,
        "SS UDL: theta_right = qL^3/(24EI)");

    // Symmetry: both end slopes are equal in magnitude but opposite in sign
    assert_close(d_left.ry.abs(), d_right.ry.abs(), 0.01,
        "SS UDL: symmetric end slopes");
    // Left slope is positive (beam rotates CW at left) and right is negative
    assert!(d_left.ry * d_right.ry < 0.0,
        "SS UDL: end slopes have opposite signs: left={:.6e}, right={:.6e}",
        d_left.ry, d_right.ry);

    // Conjugate beam consistency: theta_end * L relates to delta_mid
    // delta_mid = 5qL^4/(384EI), theta_end = qL^3/(24EI)
    // delta_mid / theta_end = 5L/16
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let ratio = d_mid.uz.abs() / d_left.ry.abs();
    assert_close(ratio, 5.0 * l / 16.0, 0.02,
        "SS UDL: delta_mid / theta_end = 5L/16");
}
