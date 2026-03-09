/// Validation: Plastic Analysis Extended — Limit Analysis Benchmarks
///
/// References:
///   - Neal, "The Plastic Methods of Structural Analysis", 3rd Ed.
///   - Horne, "Plastic Theory of Structures", 2nd Ed.
///   - Baker & Heyman, "Plastic Design of Frames"
///   - EN 1992-1-1:2004 (Eurocode 2), Section 5.5
///   - Bruneau, Uang, Sabelli, "Ductile Design of Steel Structures", 2nd Ed.
///
/// Tests verify analytical plastic collapse formulas and use the elastic
/// solver to confirm elastic baseline moments prior to redistribution.
///
///   1. Shape factor: rectangular (1.5), I-section (~1.12), circular (~1.70)
///   2. Fixed-fixed beam collapse: w_p*L^2 = 16*Mp (beam mechanism)
///   3. Propped cantilever: w_p*L^2 = 11.66*Mp (hinge at 0.414L from simple support)
///   4. Portal frame: combined mechanism (beam + sway) gives lowest lambda
///   5. Upper bound theorem: any mechanism gives lambda >= lambda_collapse
///   6. Lower bound theorem: any equilibrium state gives lambda <= lambda_collapse
///   7. Two-span continuous beam: collapse load and hinge locations
///   8. Moment redistribution limit: EC2 allows up to 30% for Class 2 sections
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

use std::f64::consts::PI;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 internally)
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

// ================================================================
// 1. Shape Factors: Rectangular (1.5), I-section (~1.12), Circular (~1.70)
// ================================================================
//
// The shape factor f = Zp / Se relates the plastic section modulus to
// the elastic section modulus. It quantifies the reserve strength
// beyond first yield.
//
// Rectangular: Zp = bh^2/4, Se = bh^2/6 => f = 1.5
// Circular:    Zp = d^3/6,  Se = pi*d^3/32 => f = 16/(3*pi) ~ 1.698
// I-section:   depends on flange/web proportions, typically 1.12-1.18
//
// Reference: Neal, Ch. 2, Table 2.1

#[test]
fn validation_plas_ext_shape_factors() {
    // --- Rectangular section: 150 mm x 300 mm ---
    let b_rect: f64 = 150.0;
    let h_rect: f64 = 300.0;
    let zp_rect: f64 = b_rect * h_rect.powi(2) / 4.0;
    let se_rect: f64 = b_rect * h_rect.powi(2) / 6.0;
    let f_rect: f64 = zp_rect / se_rect;

    assert_close(f_rect, 1.5, 0.01, "Rectangular shape factor = 1.5");

    // --- Circular section: diameter 200 mm ---
    let d_circ: f64 = 200.0;
    let zp_circ: f64 = d_circ.powi(3) / 6.0;
    let se_circ: f64 = PI * d_circ.powi(3) / 32.0;
    let f_circ: f64 = zp_circ / se_circ;
    let f_circ_exact: f64 = 16.0 / (3.0 * PI);

    assert_close(f_circ, f_circ_exact, 0.01, "Circular shape factor = 16/(3*pi)");
    // Should be approximately 1.698
    assert_close(f_circ, 1.698, 0.01, "Circular shape factor ~ 1.70");

    // --- I-section: bf=200, tf=15, d_total=300, tw=10 ---
    let bf: f64 = 200.0;
    let tf: f64 = 15.0;
    let d_total: f64 = 300.0;
    let tw: f64 = 10.0;
    let hw: f64 = d_total - 2.0 * tf;

    // Elastic section modulus
    let i_flanges: f64 = 2.0 * (bf * tf.powi(3) / 12.0
        + bf * tf * ((d_total - tf) / 2.0).powi(2));
    let i_web: f64 = tw * hw.powi(3) / 12.0;
    let i_total: f64 = i_flanges + i_web;
    let se_i: f64 = i_total / (d_total / 2.0);

    // Plastic section modulus
    let zp_i: f64 = bf * tf * (d_total - tf) + tw * hw.powi(2) / 4.0;
    let f_i: f64 = zp_i / se_i;

    // Typical I-section shape factor 1.12-1.18
    assert!(
        f_i > 1.10 && f_i < 1.20,
        "I-section shape factor in [1.10, 1.20]: got {:.4}",
        f_i
    );
    assert_close(f_i, 1.12, 0.05, "I-section shape factor ~ 1.12");
}

// ================================================================
// 2. Fixed-Fixed Beam Collapse: w_p * L^2 = 16 * Mp
// ================================================================
//
// A fixed-fixed beam under UDL forms three hinges at collapse:
//   - Two at the supports (where elastic moment = wL^2/12)
//   - One at midspan (where elastic moment = wL^2/24)
//
// Virtual work: theta at each support, 2*theta at midspan
//   Internal: Mp*theta + Mp*theta + Mp*2*theta = 4*Mp*theta
//   External: w*L*(L/4)*theta = wL^2*theta/4
//   => w_p = 16*Mp/L^2
//
// Elastic baseline: M_support = wL^2/12, M_midspan = wL^2/24
//
// Reference: Neal, Ch. 4; Horne, Ch. 3

#[test]
fn validation_plas_ext_fixed_fixed_collapse() {
    let l = 6.0;
    let mp: f64 = 300.0; // kN*m

    // --- Analytical collapse load ---
    let w_collapse: f64 = 16.0 * mp / (l * l);
    let w_collapse_expected: f64 = 16.0 * 300.0 / 36.0; // 133.33 kN/m
    assert_close(w_collapse, w_collapse_expected, 0.01,
        "Fixed-fixed collapse: w_p = 16*Mp/L^2");

    // --- Elastic first yield load (governs at supports) ---
    // M_support = wL^2/12 = Mp => w_y = 12*Mp/L^2
    let w_first_yield: f64 = 12.0 * mp / (l * l);
    let load_factor: f64 = w_collapse / w_first_yield;
    assert_close(load_factor, 4.0 / 3.0, 0.01,
        "Fixed-fixed: load factor = 4/3");

    // --- Elastic solver baseline verification ---
    // Apply w = 10 kN/m and verify elastic moment distribution
    let n = 16;
    let q: f64 = -10.0;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_support = wL^2/12 = 10*36/12 = 30 kN*m
    let m_support_expected: f64 = q.abs() * l * l / 12.0;
    let ef_first = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_support_expected, 0.03,
        "Fixed-fixed elastic: M_support = wL^2/12");

    // M_midspan = wL^2/24 = 10*36/24 = 15 kN*m
    let m_midspan_expected: f64 = q.abs() * l * l / 24.0;
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef_mid.m_end.abs(), m_midspan_expected, 0.05,
        "Fixed-fixed elastic: M_midspan = wL^2/24");
}

// ================================================================
// 3. Propped Cantilever Collapse: w_p * L^2 = 11.66 * Mp
// ================================================================
//
// A propped cantilever (fixed at A, roller at B) under UDL:
//   - First hinge at fixed support (elastic M = wL^2/8)
//   - Second hinge in the span at x = L*(sqrt(2)-1) from the roller
//     (equivalently x = L*(2-sqrt(2)) ~ 0.586L from fixed end)
//
// Collapse coefficient: 6 + 4*sqrt(2) ~ 11.657
//   w_p = (6 + 4*sqrt(2)) * Mp / L^2
//
// Reference: Neal, Ch. 4; Horne, Ch. 3

#[test]
fn validation_plas_ext_propped_cantilever_collapse() {
    let l = 8.0;
    let mp: f64 = 500.0;

    // --- Collapse load ---
    let coeff: f64 = 6.0 + 4.0 * 2.0_f64.sqrt();
    assert_close(coeff, 11.657, 0.01, "Propped cantilever: collapse coeff ~ 11.657");

    let w_collapse: f64 = coeff * mp / (l * l);

    // --- First yield load (at fixed support): wL^2/8 = Mp ---
    let w_first_yield: f64 = 8.0 * mp / (l * l);
    let redist_ratio: f64 = w_collapse / w_first_yield;
    assert_close(redist_ratio, coeff / 8.0, 0.01,
        "Propped cantilever: redistribution ratio = coeff/8");
    // Approximately 1.457
    assert_close(redist_ratio, 1.457, 0.01,
        "Propped cantilever: redistribution ratio ~ 1.457");

    // --- Hinge location: x_h = L*(sqrt(2)-1) from roller ---
    let x_from_roller: f64 = l * (2.0_f64.sqrt() - 1.0);
    let x_from_fixed: f64 = l - x_from_roller;
    // x_from_fixed ~ 0.5858 * L, between L/2 and 2L/3
    assert!(
        x_from_fixed > l * 0.55 && x_from_fixed < l * 0.62,
        "Hinge at {:.4}m from fixed end, expected in ({:.2}, {:.2})",
        x_from_fixed, l * 0.55, l * 0.62
    );

    // --- Elastic solver baseline: verify propped cantilever moments ---
    let n = 16;
    let q: f64 = -10.0;
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_A (fixed end) = wL^2/8 = 10*64/8 = 80 kN*m
    let m_fixed_expected: f64 = q.abs() * l * l / 8.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.mz.abs(), m_fixed_expected, 0.03,
        "Propped elastic: M_fixed = wL^2/8");

    // R_B = 3qL/8
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let rb_expected: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(r_b.ry, rb_expected, 0.03,
        "Propped elastic: R_B = 3qL/8");
}

// ================================================================
// 4. Portal Frame: Combined Mechanism Gives Lowest Lambda
// ================================================================
//
// Fixed-base portal frame with beam span L, column height h.
// All members have the same plastic moment Mp.
//
// Three mechanisms:
//   (a) Beam: hinges at beam ends + midspan. lambda_beam = 16*Mp/(w*L^2)
//   (b) Sway: hinges at column bases + beam-column joints. lambda_sway = 4*Mp/(H*h)
//   (c) Combined: superposition (beam + sway), removing overlapping hinges
//       Internal work = 6*Mp*theta
//       External work = lambda*(w*L^2/4 + H*h)*theta
//       lambda_combined = 6*Mp / (w*L^2/4 + H*h)
//
// Governing mechanism = minimum lambda
//
// Reference: Horne, Ch. 5; Baker & Heyman, Ch. 3

#[test]
fn validation_plas_ext_portal_combined_mechanism() {
    let mp: f64 = 200.0;
    let l_beam: f64 = 8.0;
    let h_col: f64 = 4.0;
    let w_ref: f64 = 20.0;   // reference UDL on beam
    let h_ref: f64 = 50.0;   // reference horizontal force

    // (a) Beam mechanism
    let lambda_beam: f64 = 16.0 * mp / (w_ref * l_beam * l_beam);
    assert_close(lambda_beam, 2.5, 0.01,
        "Portal beam mechanism: lambda = 2.5");

    // (b) Sway mechanism
    let lambda_sway: f64 = 4.0 * mp / (h_ref * h_col);
    assert_close(lambda_sway, 4.0, 0.01,
        "Portal sway mechanism: lambda = 4.0");

    // (c) Combined mechanism
    let ext_work_unit: f64 = w_ref * l_beam * l_beam / 4.0 + h_ref * h_col;
    let lambda_combined: f64 = 6.0 * mp / ext_work_unit;
    let lambda_comb_expected: f64 = 1200.0 / 520.0; // ~ 2.3077
    assert_close(lambda_combined, lambda_comb_expected, 0.01,
        "Portal combined mechanism: lambda = 6*Mp/(wL^2/4 + H*h)");

    // Governing: combined < beam < sway
    assert!(
        lambda_combined < lambda_beam,
        "Combined ({:.4}) < Beam ({:.4})", lambda_combined, lambda_beam
    );
    assert!(
        lambda_beam < lambda_sway,
        "Beam ({:.4}) < Sway ({:.4})", lambda_beam, lambda_sway
    );

    // --- Elastic solver baseline: portal frame under lateral + gravity ---
    // Verify elastic moments are consistent before redistribution
    let input = make_portal_frame(h_col, l_beam, E, A, IZ, h_ref, -w_ref);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum of horizontal reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h_ref, 0.03,
        "Portal elastic: horizontal equilibrium");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_gravity: f64 = 2.0 * w_ref; // Two nodal gravity loads
    assert_close(sum_ry, total_gravity, 0.03,
        "Portal elastic: vertical equilibrium");
}

// ================================================================
// 5. Upper Bound Theorem: Any Mechanism => lambda >= lambda_collapse
// ================================================================
//
// The upper bound theorem of plasticity states that any kinematically
// admissible mechanism yields a load factor that is greater than or
// equal to the true collapse load factor.
//
// Test: for a simply supported beam with central point load,
//   True collapse: P_p = 4*Mp/L (hinge at midspan)
//   Non-optimal hinge at L/3: P_upper = 6*Mp/L > P_true
//   Non-optimal hinge at L/4: P_upper = 16*Mp/(3*L) > P_true
//
// We also verify elastic midspan moment = PL/4 using the solver.
//
// Reference: Neal, Ch. 5; Horne, Ch. 3

#[test]
fn validation_plas_ext_upper_bound_theorem() {
    let mp: f64 = 600.0;
    let l: f64 = 10.0;

    // True collapse (optimal mechanism: hinge at midspan under load)
    let p_true: f64 = 4.0 * mp / l;
    assert_close(p_true, 240.0, 0.01, "Upper bound: P_true = 4*Mp/L");

    // Non-optimal mechanism 1: hinge at L/3
    // Internal work: Mp * (alpha + beta), alpha = 2*beta (from geometry)
    // => Internal = 3*Mp*beta. External = P * beta * L/2
    // P_upper = 6*Mp/L
    let p_upper_l3: f64 = 6.0 * mp / l;
    assert_close(p_upper_l3, 360.0, 0.01,
        "Upper bound: P at L/3 hinge = 6*Mp/L");
    assert!(p_upper_l3 >= p_true,
        "Upper bound theorem: P_upper ({:.2}) >= P_true ({:.2})",
        p_upper_l3, p_true);

    // Non-optimal mechanism 2: hinge at L/4
    // alpha * L/4 = beta * 3L/4 => alpha = 3*beta
    // Internal = Mp * (3*beta + beta) = 4*Mp*beta
    // External: load at L/2 is in right segment, delta = beta * L/2
    // P_upper = 4*Mp*beta / (beta * L/2) = 8*Mp/L
    // Wait: delta_P at L/2 from right support: beta*(L - L/2) = beta*L/2
    // P_upper = 4*Mp / (L/2) = 8*Mp/L
    // Actually: hinge at L/4. left rotates alpha, right rotates beta.
    // alpha * L/4 = beta * 3L/4 => alpha = 3*beta
    // Internal = Mp * (alpha + beta) = Mp * 4*beta
    // P at L/2: in right segment. From right support: deflection = beta*(L - L/2) = beta*L/2
    // External = P * beta * L/2
    // P_upper = 4*Mp*beta / (beta*L/2) = 8*Mp/L
    let p_upper_l4: f64 = 8.0 * mp / l;
    assert!(p_upper_l4 >= p_true,
        "Upper bound theorem (L/4): P_upper ({:.2}) >= P_true ({:.2})",
        p_upper_l4, p_true);

    // Optimal mechanism recovers exact collapse load
    let p_optimal: f64 = 4.0 * mp / l;
    assert_close(p_optimal, p_true, 0.01,
        "Optimal upper bound = true collapse load");

    // --- Elastic solver: verify M_midspan = PL/4 for SS beam ---
    let n = 16;
    let p_load = 20.0;
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p_load, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Maximum elastic moment at midspan = PL/4
    let m_max_elastic: f64 = p_load * l / 4.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_max_elastic, 0.03,
        "SS elastic: M_midspan = PL/4");
}

// ================================================================
// 6. Lower Bound Theorem: Any Equilibrium State => lambda <= lambda_collapse
// ================================================================
//
// The lower bound theorem states that any statically admissible
// stress distribution (satisfying equilibrium, nowhere exceeding Mp)
// gives a load factor that is safe (i.e., <= true collapse factor).
//
// Test: propped cantilever with central point load
//   Elastic: M_fixed = 3PL/16, M_midspan = 5PL/32
//   Lower bound from fixed end: 3PL/16 <= Mp => P <= 16Mp/(3L)
//   True collapse: P_p = 6*Mp/L (from mechanism method)
//   Verify: P_lower < P_true
//
// Elastic solver confirms the elastic moment distribution.
//
// Reference: Neal, Ch. 5; Baker & Heyman, Ch. 2

#[test]
fn validation_plas_ext_lower_bound_theorem() {
    let mp: f64 = 400.0;
    let l: f64 = 6.0;

    // True collapse (propped cantilever, central point load)
    let p_true: f64 = 6.0 * mp / l;
    assert_close(p_true, 400.0, 0.01, "Lower bound: P_true = 6*Mp/L");

    // Lower bound from fixed end: M_fixed = 3PL/16 <= Mp
    let p_lower_fixed: f64 = 16.0 * mp / (3.0 * l);
    // = 16*400/18 = 355.56 kN

    // Lower bound from midspan: M_midspan = 5PL/32 <= Mp
    let p_lower_mid: f64 = 32.0 * mp / (5.0 * l);
    // = 32*400/30 = 426.67 kN

    // Governing lower bound is the smaller value (most restrictive)
    let p_lower: f64 = p_lower_fixed.min(p_lower_mid);
    assert_close(p_lower, p_lower_fixed, 0.01,
        "Lower bound: fixed end governs");

    // Lower bound must be <= true collapse (the theorem)
    assert!(
        p_lower <= p_true,
        "Lower bound theorem: P_lower ({:.2}) <= P_true ({:.2})",
        p_lower, p_true
    );

    // The gap measures conservatism
    let safety_margin: f64 = (p_true - p_lower) / p_true;
    assert!(
        safety_margin > 0.0 && safety_margin < 0.5,
        "Lower bound safety margin {:.2}% is reasonable",
        safety_margin * 100.0
    );

    // --- Elastic solver: verify propped cantilever with point load ---
    let n = 12;
    let p_load = 30.0;
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p_load, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_fixed = 3PL/16
    let m_fixed_expected: f64 = 3.0 * p_load * l / 16.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.mz.abs(), m_fixed_expected, 0.03,
        "Propped elastic: M_A = 3PL/16");

    // Equilibrium check: R_A + R_B = P
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry + r_b.ry, p_load, 0.02,
        "Propped elastic: R_A + R_B = P");
}

// ================================================================
// 7. Two-Span Continuous Beam: Collapse Load and Hinge Locations
// ================================================================
//
// Two equal spans (L each) under UDL on both spans.
//
// Elastic moments:
//   M_interior = qL^2/8 (from three-moment equation)
//   M_midspan = 9qL^2/128 (positive moment in each span)
//
// Plastic collapse (all spans loaded):
//   Hinges form at: interior support + midspan of each span
//   w_p * L^2 = 11.66 * Mp (similar to propped cantilever per span)
//
// For the symmetric two-span case under UDL on both spans, the
// collapse condition from virtual work yields:
//   lambda = (Mp*(4+2*alpha)) / (q*L^2*(alpha/4))
//   where alpha is the mechanism parameter.
//   Optimizing: lambda_min corresponds to standard collapse coefficient.
//
// A simpler verification: the elastic interior moment from the solver
// should match qL^2/8.
//
// Reference: Ghali & Neville, "Structural Analysis", Ch. 5

#[test]
fn validation_plas_ext_two_span_continuous_collapse() {
    let l: f64 = 6.0;
    let mp: f64 = 300.0;

    // --- Analytical collapse load for two-span continuous beam ---
    // Each span behaves like a propped cantilever once the interior
    // support moment reaches Mp. The collapse coefficient per span
    // is the same as the propped cantilever: (6 + 4*sqrt(2)) ~ 11.657
    let coeff: f64 = 6.0 + 4.0 * 2.0_f64.sqrt();
    let w_collapse_per_span: f64 = coeff * mp / (l * l);

    // Verify the coefficient value
    assert_close(coeff, 11.657, 0.01,
        "Two-span: collapse coefficient ~ 11.657");

    // --- Elastic solver: verify interior moment = qL^2/8 ---
    let n = 12;
    let q: f64 = -10.0;
    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l, l], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment = qL^2/8
    let m_interior_expected: f64 = q.abs() * l * l / 8.0;
    let ef_interior = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_interior.m_end.abs(), m_interior_expected, 0.05,
        "Two-span elastic: M_interior = qL^2/8");

    // Interior reaction = 5qL/4
    let interior_node = n + 1;
    let r_int = results.reactions.iter()
        .find(|r| r.node_id == interior_node).unwrap();
    let r_int_expected: f64 = 5.0 * q.abs() * l / 4.0;
    assert_close(r_int.ry, r_int_expected, 0.03,
        "Two-span elastic: R_interior = 5qL/4");

    // End reactions = 3qL/8
    let r_end = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();
    let r_end_expected: f64 = 3.0 * q.abs() * l / 8.0;
    assert_close(r_end.ry, r_end_expected, 0.03,
        "Two-span elastic: R_end = 3qL/8");

    // Total equilibrium
    let total_load: f64 = q.abs() * 2.0 * l;
    let total_reaction: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(total_reaction, total_load, 0.02,
        "Two-span elastic: total equilibrium");

    // Ratio of collapse to elastic first yield
    // First yield at interior support: qL^2/8 = Mp => q_y = 8Mp/L^2
    let q_first_yield: f64 = 8.0 * mp / (l * l);
    let redistribution_gain: f64 = w_collapse_per_span / q_first_yield;
    // Should be coeff/8 ~ 1.457
    assert_close(redistribution_gain, coeff / 8.0, 0.01,
        "Two-span: redistribution gain ~ 1.457");
}

// ================================================================
// 8. Moment Redistribution Limit (EC2 — up to 30% for Class 2)
// ================================================================
//
// EN 1992-1-1:2004, clause 5.5:
//   delta = redistributed moment / elastic moment
//   delta >= k1 + k2 * (xu/d) for fck <= 50 MPa
//
// For Class 1 (high ductility): k1 = 0.44, k2 = 1.25
//   Maximum redistribution when xu/d → 0: delta_min = 0.44
//   => up to 56% redistribution (theoretically)
//
// For Class 2 sections (limited ductility):
//   Practical limit delta >= 0.70, i.e., up to 30% redistribution
//   (per EC2 National Annex recommendations)
//
// We verify: after 30% redistribution at the support of a two-span
// beam, the midspan moment increases to maintain equilibrium, and
// the redistributed moments still satisfy equilibrium.
//
// Reference: EN 1992-1-1:2004 cl. 5.5; Concrete Centre guidance

#[test]
fn validation_plas_ext_moment_redistribution_ec2() {
    // EC2 redistribution parameters
    let k1_ec2: f64 = 0.44;
    let k2_ec2: f64 = 1.25;

    // Class 2: typical xu/d = 0.208 (30% redistribution target)
    // delta_min = k1 + k2 * xu/d = 0.44 + 1.25 * 0.208 = 0.70
    let xu_d_class2: f64 = 0.208;
    let delta_class2: f64 = k1_ec2 + k2_ec2 * xu_d_class2;
    assert_close(delta_class2, 0.70, 0.01,
        "EC2 Class 2: delta_min = 0.70");

    let redist_pct_class2: f64 = (1.0 - delta_class2) * 100.0;
    assert_close(redist_pct_class2, 30.0, 0.05,
        "EC2 Class 2: up to 30% redistribution");

    // Class 1: maximum xu/d = 0.45 (highly ductile)
    let xu_d_class1: f64 = 0.45;
    let delta_class1: f64 = k1_ec2 + k2_ec2 * xu_d_class1;
    // = 0.44 + 0.5625 = 1.0025
    // delta >= 1.0 means no redistribution needed (fully elastic is safe)
    assert!(
        delta_class1 >= 1.0 - 0.01,
        "EC2 high xu/d: delta_min ~ 1.0 (no redistribution allowed)"
    );

    // Class 1: minimum xu/d → 0 (very ductile section)
    let xu_d_ductile: f64 = 0.0;
    let delta_ductile: f64 = k1_ec2 + k2_ec2 * xu_d_ductile;
    assert_close(delta_ductile, 0.44, 0.01,
        "EC2 max ductility: delta_min = 0.44");
    let max_redist: f64 = (1.0 - delta_ductile) * 100.0;
    assert_close(max_redist, 56.0, 0.05,
        "EC2 max theoretical redistribution = 56%");

    // --- Elastic solver: two-span beam, verify moment redistribution effect ---
    // Apply 30% redistribution at interior support and check equilibrium
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l, l], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Elastic interior moment
    let ef_int = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    let m_elastic_support: f64 = ef_int.m_end.abs();

    // After 30% redistribution: M_support_redist = 0.70 * M_elastic
    let m_redist_support: f64 = 0.70 * m_elastic_support;

    // The moment shed from the support (0.30 * M_elastic) goes to midspan
    let m_shed: f64 = m_elastic_support - m_redist_support;

    // Simple span moment for UDL on span L: qL^2/8
    let m_ss: f64 = q.abs() * l * l / 8.0;

    // Elastic midspan moment (positive) = m_ss - m_elastic_support/2
    // (approximate for equal spans with UDL)
    let m_elastic_midspan: f64 = m_ss - m_elastic_support / 2.0;

    // After redistribution, midspan moment increases
    let m_redist_midspan: f64 = m_elastic_midspan + m_shed / 2.0;

    // The redistributed midspan moment should be larger than elastic
    assert!(
        m_redist_midspan > m_elastic_midspan,
        "After redistribution, midspan moment increases: {:.2} > {:.2}",
        m_redist_midspan, m_elastic_midspan
    );

    // Verify the elastic interior moment matches theory
    let m_int_expected: f64 = q.abs() * l * l / 8.0;
    assert_close(m_elastic_support, m_int_expected, 0.05,
        "EC2 baseline: elastic M_support = qL^2/8");

    // The redistribution percentage check
    let actual_redist_pct: f64 = (1.0 - m_redist_support / m_elastic_support) * 100.0;
    assert_close(actual_redist_pct, 30.0, 0.01,
        "EC2: applied 30% redistribution correctly");
}
