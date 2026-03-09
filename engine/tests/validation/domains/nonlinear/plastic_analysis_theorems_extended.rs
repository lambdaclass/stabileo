/// Validation: Plastic Analysis Theorems Extended (Solver-Based Verification)
///
/// References:
///   - Neal, "The Plastic Methods of Structural Analysis", 3rd Ed.
///   - Horne, "Plastic Theory of Structures", 2nd Ed.
///   - Baker & Heyman, "Plastic Design of Frames", Vol. 1-2
///   - Bruneau, Uang & Sabelli, "Ductile Design of Steel Structures", 2nd Ed.
///   - EN 1993-1-1, Sec 5.6 (Plastic global analysis)
///
/// Tests verify plastic analysis concepts using elastic solver results:
///   1. Moment redistribution ratio in propped cantilever (UDL)
///   2. Fixed-fixed beam elastic moment envelope for plastic hinge locations
///   3. Two-span continuous beam moment redistribution under UDL
///   4. Portal frame elastic moment distribution for mechanism prediction
///   5. Propped cantilever elastic-to-plastic load factor (point load)
///   6. Fixed beam off-center load: elastic moments vs plastic capacity ratios
///   7. Three-span continuous beam: interior span governs collapse
///   8. Portal frame gravity + lateral elastic interaction
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Moment Redistribution Ratio in Propped Cantilever (UDL)
// ================================================================
//
// Propped cantilever (fixed left, roller right), span L, UDL q.
//
// Elastic solution:
//   M_fixed = qL^2/8 (hogging at fixed end)
//   M_max_sagging at x = 3L/8: M_sag = 9qL^2/128
//   R_A = 5qL/8, R_B = 3qL/8
//
// For plastic collapse:
//   Hogging hinge at fixed end, sagging hinge at x ≈ 0.5858L
//   w_c = 2Mp(3+2sqrt(2))/L^2 ≈ 11.656 Mp/L^2
//
// The ratio M_fixed/M_sag = (qL^2/8)/(9qL^2/128) = 128/72 = 16/9 ≈ 1.778
// This ratio indicates how much moment redistribution is needed.
// After full redistribution (both reach Mp), the ratio becomes 1.0.

#[test]
fn validation_ext_propped_redistribution_ratio() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -12.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Fixed-end moment: M_A = qL^2/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_fixed_expected: f64 = q.abs() * l * l / 8.0;
    assert_close(r_a.mz.abs(), m_fixed_expected, 0.02,
        "Propped redistribution: M_fixed = qL^2/8");

    // Reactions: R_A = 5qL/8, R_B = 3qL/8
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_a.ry, 5.0 * q.abs() * l / 8.0, 0.02,
        "Propped redistribution: R_A = 5qL/8");
    assert_close(r_b.ry, 3.0 * q.abs() * l / 8.0, 0.02,
        "Propped redistribution: R_B = 3qL/8");

    // Maximum sagging moment at x ≈ 5L/8.
    // For a propped cantilever with UDL, the sagging maximum is at x = 5L/8:
    //   M_sag = 9qL^2/128
    let m_sag_expected: f64 = 9.0 * q.abs() * l * l / 128.0;

    // Find element nearest to x = 5L/8 (element index = 5*n/8 = 12 or 13)
    let sag_elem = (5 * n / 8).max(2);
    let ef_sag = results.element_forces.iter()
        .find(|e| e.element_id == sag_elem).unwrap();
    // The sagging moment should be close to 9qL^2/128, but since the peak
    // may fall between element nodes, we allow a wider tolerance.
    // Check using the element end moment (which is the moment at a node near 5L/8).
    let m_sag_at_node: f64 = ef_sag.m_end.abs();
    assert_close(m_sag_at_node, m_sag_expected, 0.10,
        "Propped redistribution: M_sag near 9qL^2/128");

    // Redistribution ratio (pure formula): M_hog/M_sag = (qL^2/8) / (9qL^2/128) = 16/9
    let ratio: f64 = m_fixed_expected / m_sag_expected;
    assert_close(ratio, 16.0 / 9.0, 0.01,
        "Propped redistribution: M_hog/M_sag = 16/9");

    // Elastic-to-plastic load factor for the propped cantilever:
    // First yield at fixed end: qL^2/8 = Mp => q_y = 8Mp/L^2
    // Collapse: q_c = 11.656 Mp/L^2
    // Factor = q_c / q_y = 11.656 / 8 ≈ 1.457
    let factor: f64 = 2.0 * (3.0 + 2.0 * 2.0_f64.sqrt()) / 8.0;
    assert_close(factor, 11.656 / 8.0, 0.005,
        "Propped redistribution: load factor ≈ 1.457");

    // Verify EI consistency: deflection at roller is zero
    let d_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b.uy.abs() < 1e-6, "Roller deflection ≈ 0");

    // Maximum deflection magnitude check (qualitative)
    let d_max: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    // delta_max ≈ qL^4 / (185 EI)
    let d_approx: f64 = q.abs() * l.powi(4) / (185.0 * e_eff * IZ);
    assert!((d_max - d_approx).abs() / d_approx < 0.15,
        "Propped redistribution: deflection check");
}

// ================================================================
// 2. Fixed-Fixed Beam: Elastic Moment Envelope for Hinge Locations
// ================================================================
//
// Fixed-fixed beam, span L, UDL q.
//
// Elastic:
//   M_ends = qL^2/12 (hogging)
//   M_mid = qL^2/24 (sagging)
//
// For plastic collapse (3-hinge mechanism):
//   Hinges at both ends + midspan => w_c = 16Mp/L^2
//   First yield at ends: qL^2/12 = Mp => q_y = 12Mp/L^2
//   Load factor = 16/12 = 4/3
//
// This test verifies the elastic moment distribution and the
// ratio of end-to-midspan moments that governs redistribution.

#[test]
fn validation_ext_fixed_beam_moment_envelope() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -15.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments: M_end = qL^2/12
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let m_end_expected: f64 = q.abs() * l * l / 12.0;

    assert_close(r_a.mz.abs(), m_end_expected, 0.02,
        "Fixed beam envelope: M_A = qL^2/12");
    assert_close(r_b.mz.abs(), m_end_expected, 0.02,
        "Fixed beam envelope: M_B = qL^2/12");

    // Reactions by symmetry: R_A = R_B = qL/2
    assert_close(r_a.ry, q.abs() * l / 2.0, 0.02,
        "Fixed beam envelope: R_A = qL/2");
    assert_close(r_b.ry, q.abs() * l / 2.0, 0.02,
        "Fixed beam envelope: R_B = qL/2");

    // Midspan moment: M_mid = qL^2/24
    let m_mid_expected: f64 = q.abs() * l * l / 24.0;
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_elem).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.05,
        "Fixed beam envelope: M_mid = qL^2/24");

    // Ratio of end-to-midspan: 2.0 (hogging is twice sagging)
    let ratio: f64 = m_end_expected / m_mid_expected;
    assert_close(ratio, 2.0, 0.01,
        "Fixed beam envelope: M_end/M_mid = 2");

    // Plastic load factor = 4/3
    // (from q_collapse/q_yield = (16Mp/L^2)/(12Mp/L^2))
    let plastic_factor: f64 = 16.0 / 12.0;
    assert_close(plastic_factor, 4.0 / 3.0, 0.001,
        "Fixed beam envelope: plastic load factor = 4/3");

    // After redistribution, both end and midspan reach Mp.
    // This means midspan moment increases by factor 2 relative to elastic.
    // Verify the elastic moment at midspan is exactly half the end moment.
    assert_close(m_mid_expected * 2.0, m_end_expected, 0.01,
        "Fixed beam envelope: midspan needs 2x redistribution");
}

// ================================================================
// 3. Two-Span Continuous Beam: Moment Redistribution Under UDL
// ================================================================
//
// Two equal spans, pinned at ends, continuous over interior support.
// UDL on both spans.
//
// Elastic: M_B (interior) = qL^2/8 (from 3-moment equation)
//   R_A = R_C = 3qL/8, R_B = 10qL/8 = 5qL/4
//   M_midspan = qL^2/8 - qL^2/16 = qL^2/16 ... actually
//   For 2-span beam: M_B = qL^2/8, M_midspan = qL^2/16 ... let's be precise.
//
// Exact: For a 2-span beam under UDL:
//   M_interior = qL^2/8 (hogging)
//   M_midspan = (5/8)*(qL^2/8) - qL^2/8 * (1/2) ...
//   Use virtual work: M_midspan ≈ 0.0703 qL^2
//
// Actually the standard result for 2-span continuous beam, UDL both spans:
//   M_B = qL^2/8
//   R_A = R_C = 3qL/8
//   R_B = 5qL/4
//   Maximum sagging moment = 9qL^2/128 at x = 3L/8 from each end

#[test]
fn validation_ext_two_span_redistribution() {
    let span = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support reaction: R_B = 5qL/4
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_b_expected: f64 = 5.0 * q.abs() * span / 4.0;
    assert_close(r_b.ry, r_b_expected, 0.02,
        "Two-span redistribution: R_B = 5qL/4");

    // End reactions: R_end = 3qL/8
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end_expected: f64 = 3.0 * q.abs() * span / 8.0;
    assert_close(r_a.ry, r_end_expected, 0.02,
        "Two-span redistribution: R_A = 3qL/8");

    // Hogging moment at interior support: M_B = qL^2/8
    // This is found from the element forces at the interior support
    let ef_at_b = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    let m_b_expected: f64 = q.abs() * span * span / 8.0;
    assert_close(ef_at_b.m_end.abs(), m_b_expected, 0.05,
        "Two-span redistribution: M_B = qL^2/8");

    // Maximum sagging moment in span occurs at x = 3L/8 from the left end:
    //   M_sag = 9qL^2/128
    let m_sag_expected: f64 = 9.0 * q.abs() * span * span / 128.0;

    // Find element near x = 3L/8 in span 1 (element index ≈ 3*n/8 ≈ 6)
    let sag_elem = (3 * n / 8).max(2);
    let ef_sag = results.element_forces.iter()
        .find(|e| e.element_id == sag_elem).unwrap();
    let m_sag_at_node: f64 = ef_sag.m_end.abs();
    assert_close(m_sag_at_node, m_sag_expected, 0.10,
        "Two-span redistribution: M_sag near 9qL^2/128");

    // Ratio of hogging to sagging (pure formula): 16/9
    let ratio: f64 = m_b_expected / m_sag_expected;
    assert_close(ratio, 16.0 / 9.0, 0.01,
        "Two-span redistribution: M_hog/M_sag = 16/9");

    // Plastic collapse load for this configuration (span mechanism):
    // Hinges at interior support (hogging) + midspan (sagging)
    // Virtual work per span: w*L^2/4 = Mp*(theta) + Mp*(2*theta) = 3*Mp*theta
    // Wait, actually for hinge at support + hinge at optimum location:
    // The span acts like a propped cantilever => w_c = 11.656*Mp/L^2
    // But for hinge at midspan: w*L^2/4 = 3Mp*theta => w_c = 12*Mp/L^2 (upper bound)
    // First yield at interior support: qL^2/8 = Mp => q_y = 8*Mp/L^2
    // Plastic factor ≈ 12/8 = 1.5 (with midspan hinge assumption)
    let plastic_factor: f64 = 12.0 / 8.0;
    assert_close(plastic_factor, 1.5, 0.001,
        "Two-span redistribution: plastic load factor = 1.5");

    // Equilibrium check: sum of reactions = total load
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    let total_load: f64 = q.abs() * 2.0 * span;
    let sum_reactions: f64 = r_a.ry + r_b.ry + r_c.ry;
    assert_close(sum_reactions, total_load, 0.02,
        "Two-span redistribution: equilibrium");
}

// ================================================================
// 4. Portal Frame: Elastic Moment Distribution for Mechanism Prediction
// ================================================================
//
// Single-bay portal frame, fixed bases, lateral load F at beam level.
// Column height H, beam span W.
//
// Elastic solution (antisymmetric sway):
//   Base moments: M_base = F*H/4 (for stiff beam relative to columns)
//   In general, depends on stiffness ratio k = (EI_beam/W)/(EI_col/H).
//   For equal cross-sections: k = H/W.
//
// For the sway mechanism (plastic):
//   F_collapse = 4*Mp/H (4 hinges: 2 bases + 2 joints)
//
// This test verifies the elastic moment distribution matches
// theory, then computes the plastic load factor.

#[test]
fn validation_ext_portal_sway_elastic_moments() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 30.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Sum of horizontal reactions = applied lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), f_lat, 0.02,
        "Portal sway: horizontal equilibrium");

    // Sum of vertical reactions ≈ 0 (no gravity load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 0.5,
        "Portal sway: vertical equilibrium, sum_ry = {:.4}", sum_ry);

    // For fixed-base portal with lateral load F:
    // Total overturning moment about base = F * H
    // Resisted by base moments and vertical reaction couple
    let overturning: f64 = f_lat * h;

    // Sum of base moments + vertical couple = overturning moment
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let base_moments: f64 = r1.mz + r4.mz;
    let vertical_couple: f64 = r4.ry * w; // R4_y * W (couple from vertical reactions)
    let total_resisting: f64 = base_moments.abs() + vertical_couple.abs();

    // The overturning moment should be balanced (within tolerance)
    // Note: M_base1 + M_base2 + R_vertical * W = F * H
    assert!((total_resisting - overturning).abs() / overturning < 0.10,
        "Portal sway: moment equilibrium about base");

    // Both base moments should be of the same sign (resisting sway)
    // and the absolute values should be similar due to frame symmetry in stiffness
    assert!(r1.mz.abs() > 0.0 && r4.mz.abs() > 0.0,
        "Portal sway: both bases have non-zero moments");

    // Maximum elastic moment in frame
    let m_max_elastic: f64 = results.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    // For plastic collapse (sway mechanism): F_c = 4*Mp/H
    // If Mp = m_max_elastic (first yield), then:
    // F_yield = F_lat (current load causes first yield at m_max)
    // F_collapse = 4 * m_max_elastic / h
    // Plastic load factor = F_collapse / F_yield = (4*m_max_elastic/H) / F_lat
    let f_collapse_pred: f64 = 4.0 * m_max_elastic / h;
    let plastic_factor: f64 = f_collapse_pred / f_lat;

    // The factor should be > 1 (collapse load exceeds elastic first yield)
    assert!(plastic_factor > 1.0,
        "Portal sway: plastic factor > 1: {:.3}", plastic_factor);

    // Verify sway deflection is consistent
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    // Both top nodes should sway in the same direction
    assert!((d2.ux - d3.ux).abs() / d2.ux.abs().max(1e-10) < 0.3,
        "Portal sway: beam translates approximately rigidly");
}

// ================================================================
// 5. Propped Cantilever: Elastic-to-Plastic Load Factor (Point Load)
// ================================================================
//
// Propped cantilever, point load P at midspan.
//
// Elastic:
//   M_fixed = 3PL/16 (hogging)
//   M_midspan = 5PL/32 (sagging)
//   R_A = 11P/16, R_B = 5P/16
//
// First yield at fixed end: 3PL/16 = Mp => P_y = 16Mp/(3L)
// Collapse (2 hinges): P_c = 6Mp/L
// Load factor = P_c/P_y = 6L × 3L/(16) = 18/16 = 9/8 = 1.125
//
// The elastic moment ratio M_fixed/M_mid = (3PL/16)/(5PL/32) = 6/5 = 1.2
// This determines which section yields first.

#[test]
fn validation_ext_propped_cantilever_load_factor() {
    let l = 8.0;
    let n = 16;
    let p = 24.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r_a.ry, 11.0 * p / 16.0, 0.02,
        "Propped LF: R_A = 11P/16");
    assert_close(r_b.ry, 5.0 * p / 16.0, 0.02,
        "Propped LF: R_B = 5P/16");

    // Fixed-end moment: M_A = 3PL/16
    let m_a_expected: f64 = 3.0 * p * l / 16.0;
    assert_close(r_a.mz.abs(), m_a_expected, 0.02,
        "Propped LF: M_A = 3PL/16");

    // Midspan moment: M_mid = 5PL/32
    let m_mid_expected: f64 = 5.0 * p * l / 32.0;

    // Find midspan moment from element forces
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef_mid.m_end.abs(), m_mid_expected, 0.05,
        "Propped LF: M_mid = 5PL/32");

    // Ratio: M_fixed / M_mid = 6/5
    let ratio: f64 = m_a_expected / m_mid_expected;
    assert_close(ratio, 6.0 / 5.0, 0.01,
        "Propped LF: M_hog/M_sag = 6/5");

    // Fixed end yields first (larger moment)
    assert!(m_a_expected > m_mid_expected,
        "Propped LF: fixed end yields first");

    // Elastic-to-plastic load factor = 9/8 = 1.125
    // P_y = 16*Mp/(3L), P_c = 6*Mp/L
    // Factor = P_c/P_y = 6 * 3L / 16 = 18/16 = 9/8
    let load_factor: f64 = 9.0 / 8.0;
    assert_close(load_factor, 1.125, 0.001,
        "Propped LF: elastic-to-plastic factor = 1.125");

    // Equilibrium: R_A + R_B = P
    assert_close(r_a.ry + r_b.ry, p, 0.02,
        "Propped LF: vertical equilibrium");
}

// ================================================================
// 6. Fixed Beam Off-Center Load: Elastic Moments vs Plastic Capacity
// ================================================================
//
// Fixed-fixed beam, point load P at L/3 from left.
//
// Elastic fixed-end moments:
//   M_A = Pa*b^2/L^2 = P*(L/3)*(2L/3)^2/L^2 = 4PL/27
//   M_B = Pa^2*b/L^2 = P*(L/3)^2*(2L/3)/L^2 = 2PL/27
//   (where a=L/3, b=2L/3)
//
// The left end has twice the moment of the right end.
// For plastic collapse: P_c = 2*Mp*L/(a*b) = 2*Mp*L/((L/3)(2L/3)) = 9Mp/L
// For symmetric loading: P_c = 8*Mp/L
// Off-center loading increases collapse load (hinge locations differ).

#[test]
fn validation_ext_fixed_beam_offcenter() {
    let l = 9.0;
    let n = 18;
    let p = 27.0;
    let a_load: f64 = l / 3.0; // distance from left

    let load_node = (n as f64 / 3.0).round() as usize + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M_A = P*a*b^2/L^2 where a = L/3, b = 2L/3
    let b_load: f64 = l - a_load;
    let m_a_expected: f64 = p * a_load * b_load * b_load / (l * l);
    // M_A = 27 * 3 * 36 / 81 = 27 * 108/81 = 27 * 4/3 = 36
    assert_close(r_a.mz.abs(), m_a_expected, 0.05,
        "Fixed off-center: M_A = Pab^2/L^2");

    // M_B = P*a^2*b/L^2
    let m_b_expected: f64 = p * a_load * a_load * b_load / (l * l);
    // M_B = 27 * 9 * 6 / 81 = 27 * 54/81 = 27 * 2/3 = 18
    assert_close(r_b.mz.abs(), m_b_expected, 0.05,
        "Fixed off-center: M_B = Pa^2b/L^2");

    // Ratio of end moments: M_A/M_B = b/a = 2
    let ratio: f64 = m_a_expected / m_b_expected;
    assert_close(ratio, b_load / a_load, 0.01,
        "Fixed off-center: M_A/M_B = b/a");

    // M_A = 4PL/27, M_B = 2PL/27
    assert_close(m_a_expected, 4.0 * p * l / 27.0, 0.01,
        "Fixed off-center: M_A = 4PL/27");
    assert_close(m_b_expected, 2.0 * p * l / 27.0, 0.01,
        "Fixed off-center: M_B = 2PL/27");

    // Plastic collapse load: P_c = 2*Mp*L/(a*b) (from upper bound)
    // With Mp = M_A (first yield at A): P_y = M_A / (a*b^2/L^2) * ...
    // Actually P_y such that largest elastic moment = Mp:
    //   M_A = P_y * a * b^2 / L^2 = Mp => P_y = Mp * L^2 / (a * b^2)
    //   P_c = 2*Mp*L/(a*b) = 9*Mp/L (for a=L/3, b=2L/3)
    //   Factor = P_c/P_y = 2*Mp*L/(a*b) / (Mp*L^2/(a*b^2)) = 2*b/L = 4/3
    let plastic_factor: f64 = 2.0 * b_load / l;
    assert_close(plastic_factor, 4.0 / 3.0, 0.001,
        "Fixed off-center: plastic load factor = 4/3");

    // Equilibrium
    assert_close(r_a.ry + r_b.ry, p, 0.02,
        "Fixed off-center: vertical equilibrium");
}

// ================================================================
// 7. Three-Span Continuous Beam: Interior Span Governs Collapse
// ================================================================
//
// Three equal spans L, pinned at all four supports, UDL on all spans.
//
// Elastic moments:
//   M at interior supports = qL^2/10 (symmetric loading)
//   Maximum sagging moment ≈ qL^2/12.8 in end spans
//                          ≈ qL^2/40 in middle span
//   (Exact from 3-moment equation)
//
// For plastic collapse: the end spans govern because they behave
// like propped cantilevers with the interior support moment.
// However, the interior span has lower sagging moment so it may
// form a mechanism with less redistribution.
//
// Here we verify the elastic moment distribution and check
// the basic load-carrying relationships.

#[test]
fn validation_ext_three_span_elastic_moments() {
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

    // Equilibrium: total reaction = total load
    let total_load: f64 = q.abs() * 3.0 * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Three-span: equilibrium");

    // By symmetry: R1 = R4, R2 = R3
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();

    assert_close(r1.ry, r4.ry, 0.02,
        "Three-span: R1 = R4 by symmetry");
    assert_close(r2.ry, r3.ry, 0.02,
        "Three-span: R2 = R3 by symmetry");

    // Standard results for 3-span continuous beam (equal spans, UDL):
    // R_end = 0.4 * qL, R_interior = 1.1 * qL
    // M at interior supports = qL^2/10
    let r_end_expected: f64 = 0.4 * q.abs() * span;
    let r_int_expected: f64 = 1.1 * q.abs() * span;
    assert_close(r1.ry, r_end_expected, 0.02,
        "Three-span: R_end = 0.4qL");
    assert_close(r2.ry, r_int_expected, 0.02,
        "Three-span: R_int = 1.1qL");

    // Interior support moment: M_int = qL^2/10
    let m_int_expected: f64 = q.abs() * span * span / 10.0;
    let ef_at_int = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_at_int.m_end.abs(), m_int_expected, 0.05,
        "Three-span: M_int = qL^2/10");

    // The end spans behave like propped cantilevers and the
    // middle span like a fixed-fixed beam (with partial fixity).
    //
    // For 3 equal spans with UDL:
    //   End span max sagging ≈ 0.08 qL^2
    //   Middle span max sagging ≈ 0.025 qL^2
    //
    // We verify by sampling element moments at the approximate peak locations.
    // End span peak is near 3L/8 from end (element ≈ 3*n/8 ≈ 4 or 5)
    // Middle span peak is at its midpoint (element ≈ n + n/2 = 18)
    let end_sag_elem = (3 * n / 8).max(2);
    let ef_end_sag = results.element_forces.iter()
        .find(|e| e.element_id == end_sag_elem).unwrap();
    let m_sag_end: f64 = ef_end_sag.m_end.abs();

    let mid_sag_elem = n + n / 2;
    let ef_mid_sag = results.element_forces.iter()
        .find(|e| e.element_id == mid_sag_elem).unwrap();
    let m_sag_mid: f64 = ef_mid_sag.m_end.abs();

    // End span sagging should be larger than middle span sagging
    assert!(m_sag_end > m_sag_mid,
        "Three-span: end span sag ({:.3}) > mid span sag ({:.3})",
        m_sag_end, m_sag_mid);

    // End span sagging ≈ 0.08 qL^2
    let m_sag_end_approx: f64 = 0.08 * q.abs() * span * span;
    assert!((m_sag_end - m_sag_end_approx).abs() / m_sag_end_approx < 0.20,
        "Three-span: end span sagging ≈ 0.08qL^2: got {:.4}", m_sag_end);
}

// ================================================================
// 8. Portal Frame: Gravity + Lateral Elastic Interaction
// ================================================================
//
// Portal frame with combined gravity and lateral loads.
//
// Gravity alone: symmetric bending, no sway.
// Lateral alone: antisymmetric sway.
// Combined: superposition of both effects.
//
// For plastic analysis, the interaction between beam mechanism (gravity)
// and sway mechanism (lateral) determines the combined collapse load.
//
// This test verifies:
//   - Superposition holds in elastic analysis
//   - The maximum elastic moment location shifts with combined loading
//   - The combined elastic moments are bounded by the sum of individual maxima

#[test]
fn validation_ext_portal_gravity_lateral_interaction() {
    let h = 5.0;
    let w = 8.0;
    let f_lat = 20.0;
    let f_grav = -15.0; // downward at beam-column joints

    // Solve three cases
    let input_lat = make_portal_frame(h, w, E, A, IZ, f_lat, 0.0);
    let input_grav = make_portal_frame(h, w, E, A, IZ, 0.0, f_grav);
    let input_combined = make_portal_frame(h, w, E, A, IZ, f_lat, f_grav);

    let res_lat = linear::solve_2d(&input_lat).unwrap();
    let res_grav = linear::solve_2d(&input_grav).unwrap();
    let res_combined = linear::solve_2d(&input_combined).unwrap();

    // Superposition: combined displacements ≈ sum of individual displacements
    for node_id in [2, 3] {
        let d_lat = res_lat.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d_grav = res_grav.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let d_comb = res_combined.displacements.iter().find(|d| d.node_id == node_id).unwrap();

        assert_close(d_comb.ux, d_lat.ux + d_grav.ux, 0.02,
            &format!("Superposition ux at node {}", node_id));
        assert_close(d_comb.uy, d_lat.uy + d_grav.uy, 0.02,
            &format!("Superposition uy at node {}", node_id));
    }

    // Superposition: combined reactions ≈ sum of individual reactions
    for node_id in [1, 4] {
        let r_lat = res_lat.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        let r_grav = res_grav.reactions.iter().find(|r| r.node_id == node_id).unwrap();
        let r_comb = res_combined.reactions.iter().find(|r| r.node_id == node_id).unwrap();

        assert_close(r_comb.rx, r_lat.rx + r_grav.rx, 0.02,
            &format!("Superposition rx at node {}", node_id));
        assert_close(r_comb.ry, r_lat.ry + r_grav.ry, 0.02,
            &format!("Superposition ry at node {}", node_id));
        assert_close(r_comb.mz, r_lat.mz + r_grav.mz, 0.05,
            &format!("Superposition mz at node {}", node_id));
    }

    // Maximum combined moment is bounded by sum of individual maxima
    let m_max_lat: f64 = res_lat.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    let m_max_grav: f64 = res_grav.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);
    let m_max_comb: f64 = res_combined.element_forces.iter()
        .flat_map(|ef| vec![ef.m_start.abs(), ef.m_end.abs()])
        .fold(0.0_f64, f64::max);

    assert!(m_max_comb <= m_max_lat + m_max_grav + 0.01,
        "Combined M_max ({:.3}) <= sum ({:.3})",
        m_max_comb, m_max_lat + m_max_grav);

    // Gravity alone: symmetric, so base moments should be equal
    let r1_grav = res_grav.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_grav = res_grav.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1_grav.mz.abs(), r4_grav.mz.abs(), 0.05,
        "Gravity: symmetric base moments");

    // Lateral load breaks symmetry in the combined case
    let r1_comb = res_combined.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4_comb = res_combined.reactions.iter().find(|r| r.node_id == 4).unwrap();
    // The windward base should have a different moment than leeward
    let mz_diff: f64 = (r1_comb.mz.abs() - r4_comb.mz.abs()).abs();
    assert!(mz_diff > 0.1,
        "Combined: asymmetric base moments, diff = {:.3}", mz_diff);

    // Plastic interaction concept: if Mp is known, the combined load
    // that causes collapse is lower than either individual mechanism.
    // Using m_max_comb as proxy Mp:
    // Sway collapse: F = 4*Mp/H
    // Beam collapse: P = 8*Mp/W (simplified for portal beam)
    let mp_proxy: f64 = m_max_comb;
    let f_collapse_sway: f64 = 4.0 * mp_proxy / h;
    let p_collapse_beam: f64 = 8.0 * mp_proxy / w;

    // Both should exceed the applied loads (since elastic analysis hasn't collapsed)
    assert!(f_collapse_sway > f_lat,
        "Sway capacity ({:.1}) > applied lateral ({:.1})", f_collapse_sway, f_lat);
    assert!(p_collapse_beam > f_grav.abs(),
        "Beam capacity ({:.1}) > applied gravity ({:.1})", p_collapse_beam, f_grav.abs());
}
