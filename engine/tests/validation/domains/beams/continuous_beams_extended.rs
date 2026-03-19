/// Validation: Extended continuous beam scenarios.
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 4-5
///   - Hibbeler, "Structural Analysis", Ch. 12-15
///   - Timoshenko & Young, "Theory of Structures", Ch. 6
///
/// Tests cover four-span and five-span beams, alternating span loading,
/// deflection checks, stiffness variation effects, and equilibrium.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Four Equal Spans + UDL: Reactions
// ================================================================
//
// Four equal spans L with UDL q on all spans.
// By the three-moment equation for four equal spans:
//   R_A = R_E = 0.393*qL, R_B = R_D = 1.143*qL, R_C = 0.928*qL
// Symmetry: R_A = R_E, R_B = R_D.
// Total load = 4*q*L.

#[test]
fn validation_4span_equal_udl_equilibrium() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 4 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 4.0 * q * l, 0.01, "4span ΣRy = 4qL");

    // Symmetry: R_A = R_E
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == 4 * n_per_span + 1).unwrap();
    assert_close(r_a.rz, r_e.rz, 0.005, "4span symmetry R_A = R_E");

    // Symmetry: R_B = R_D
    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_b.rz, r_d.rz, 0.005, "4span symmetry R_B = R_D");
}

// ================================================================
// 2. Four Equal Spans + UDL: Interior Moments
// ================================================================
//
// For four equal spans, solving the three-moment equation system:
//   M_B = M_D = 3*qL^2/28 (outer interior supports)
//   M_C = qL^2/14 = 2*qL^2/28 (central support)
// By symmetry M_B = M_D.
// The outer interior moments exceed the central moment.

#[test]
fn validation_4span_equal_udl_interior_moments() {
    let l = 5.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 4 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B (at end of span 1)
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_b = ef_b.m_end.abs();

    // M_D (at end of span 3) - symmetric to M_B
    let ef_d = results.element_forces.iter()
        .find(|e| e.element_id == 3 * n_per_span).unwrap();
    let m_d = ef_d.m_end.abs();

    // M_C (at end of span 2)
    let ef_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span).unwrap();
    let m_c = ef_c.m_end.abs();

    // Symmetry: M_B = M_D
    assert_close(m_b, m_d, 0.02, "4span M_B = M_D (symmetry)");

    // M_B = 3*qL^2/28 = 3*250/28 = 26.786
    let m_b_exact = 3.0 * q * l * l / 28.0;
    assert_close(m_b, m_b_exact, 0.05, "4span M_B = 3qL^2/28");

    // M_C = qL^2/14 = 250/14 = 17.857
    let m_c_exact = q * l * l / 14.0;
    assert_close(m_c, m_c_exact, 0.05, "4span M_C = qL^2/14");

    // M_B > M_C for uniform loading on four equal spans
    assert!(m_b > m_c, "4span M_B > M_C: {:.4} > {:.4}", m_b, m_c);
}

// ================================================================
// 3. Five Equal Spans + UDL: Symmetry and Equilibrium
// ================================================================
//
// Five equal spans with UDL. By symmetry:
//   R_A = R_F, R_B = R_E, R_C = R_D
//   M_B = M_E, M_C = M_D
// Total load = 5*q*L.

#[test]
fn validation_5span_equal_udl_symmetry() {
    let l = 4.0;
    let q = 12.0;
    let n_per_span = 6;

    let n_total = 5 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 5.0 * q * l, 0.01, "5span ΣRy = 5qL");

    // Symmetric reactions
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_f = results.reactions.iter().find(|r| r.node_id == 5 * n_per_span + 1).unwrap();
    assert_close(r_a.rz, r_f.rz, 0.005, "5span R_A = R_F");

    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == 4 * n_per_span + 1).unwrap();
    assert_close(r_b.rz, r_e.rz, 0.005, "5span R_B = R_E");

    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_c.rz, r_d.rz, 0.005, "5span R_C = R_D");

    // Symmetric deflections at midspan of span 1 and span 5
    let mid1 = n_per_span / 2 + 1;
    let mid5 = 4 * n_per_span + n_per_span / 2 + 1;
    let d1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();
    let d5 = results.displacements.iter().find(|d| d.node_id == mid5).unwrap();
    assert_close(d1.uz, d5.uz, 0.005, "5span deflection symmetry span1 = span5");
}

// ================================================================
// 4. Two-Span with Alternating (Checkerboard) Loading
// ================================================================
//
// UDL on span 1 only. Span 2 is unloaded.
// Three-moment equation with M_A = M_C = 0:
//   2*M_B*(L1+L2) = -qL1^3/4
//   M_B = -qL^3/(8*(L+L)) = -qL^2/16 for equal spans
// R_A = qL/2 - M_B/L = qL/2 + qL/16 = 9qL/16
// R_C (unloaded span end) = M_B/L = -qL/16 (uplift check)

#[test]
fn validation_2span_checkerboard_loading() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 8;

    // Load only span 1
    let loads: Vec<SolverLoad> = (1..=n_per_span)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: total load = q*L
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l, 0.01, "checkerboard ΣRy = qL");

    // Interior moment M_B = qL^2/16 = 22.5
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_b = ef_b.m_end.abs();
    let m_b_exact = q * l * l / 16.0;
    assert_close(m_b, m_b_exact, 0.05, "checkerboard M_B = qL^2/16");

    // End reaction at unloaded side: R_C = M_B / L (downward, i.e. negative)
    // R_C should be small and negative (uplift tendency)
    let r_c = results.reactions.iter()
        .find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    let r_c_exact = q * l / 16.0;
    // R_C should be negative (beam lifts off at far support of unloaded span)
    assert!(r_c.rz < 0.5, "checkerboard R_C is small or negative: {:.4}", r_c.rz);
    assert_close(r_c.rz.abs(), r_c_exact, 0.10,
        "checkerboard |R_C| = qL/16");
}

// ================================================================
// 5. Three-Span with UDL: Midspan Deflection Comparison
// ================================================================
//
// For three equal spans with UDL, the center span deflects less
// than the end spans because it is more restrained.
// Also verify deflection at supports is zero.

#[test]
fn validation_3span_deflection_pattern() {
    let l = 6.0;
    let q = 10.0;
    let n_per_span = 10;
    let e_eff = E * 1000.0;

    let n_total = 3 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Deflection at supports should be zero (or negligible)
    let d_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_b = results.displacements.iter().find(|d| d.node_id == n_per_span + 1).unwrap();
    let d_c = results.displacements.iter().find(|d| d.node_id == 2 * n_per_span + 1).unwrap();
    let d_d = results.displacements.iter().find(|d| d.node_id == 3 * n_per_span + 1).unwrap();
    assert!(d_a.uz.abs() < 1e-10, "support A deflection = 0");
    assert!(d_b.uz.abs() < 1e-10, "support B deflection = 0");
    assert!(d_c.uz.abs() < 1e-10, "support C deflection = 0");
    assert!(d_d.uz.abs() < 1e-10, "support D deflection = 0");

    // Midspan deflections
    let mid1 = n_per_span / 2 + 1;
    let mid2 = n_per_span + n_per_span / 2 + 1;
    let mid3 = 2 * n_per_span + n_per_span / 2 + 1;
    let d_mid1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap().uz.abs();
    let d_mid2 = results.displacements.iter().find(|d| d.node_id == mid2).unwrap().uz.abs();
    let d_mid3 = results.displacements.iter().find(|d| d.node_id == mid3).unwrap().uz.abs();

    // By symmetry: end span deflections are equal
    assert_close(d_mid1, d_mid3, 0.005, "3span deflection span1 = span3");

    // Center span deflects less than end spans (more restrained)
    assert!(d_mid2 < d_mid1,
        "3span center deflects less: {:.6e} < {:.6e}", d_mid2, d_mid1);

    // Simply-supported reference: delta_ss = 5qL^4/(384EI)
    let delta_ss: f64 = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    // Continuous beam deflections should be less than simply-supported
    assert!(d_mid1 < delta_ss,
        "3span end span < SS: {:.6e} < {:.6e}", d_mid1, delta_ss);
    assert!(d_mid2 < delta_ss,
        "3span center span < SS: {:.6e} < {:.6e}", d_mid2, delta_ss);
}

// ================================================================
// 6. Two Unequal Spans + Point Load at Longer Span Midpoint
// ================================================================
//
// L1 = 4m, L2 = 8m, point load P at midspan of span 2.
// Three-moment equation (no load on span 1, P at center of span 2):
//   2*M_B*(L1+L2) = 6*A2*a2_bar / L2
//   where A2 = P*L2^2/8 (area of SS moment diagram), a2_bar = L2/2
//   M_B = 3*P*L2^2 / (16*(L1+L2))

#[test]
fn validation_2span_unequal_point_load() {
    let l1 = 4.0;
    let l2 = 8.0;
    let p = 50.0;
    let n_per_span = 8;

    // Point load at midspan of span 2
    let load_node = n_per_span + n_per_span / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "2span unequal point ΣRy = P");

    // Interior moment at B: M_B = 3*P*L2^2 / (16*(L1+L2))
    let m_b_exact = 3.0 * p * l2 * l2 / (16.0 * (l1 + l2));
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let m_b = ef_b.m_end.abs();
    assert_close(m_b, m_b_exact, 0.05,
        "2span unequal point M_B = 3PL2^2/(16(L1+L2))");

    // R_A = M_B / L1 (uplift direction, reaction from continuity moment)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_a_expected = m_b_exact / l1;
    assert_close(r_a.rz.abs(), r_a_expected, 0.05,
        "2span unequal point |R_A| = M_B / L1");
}

// ================================================================
// 7. Three-Span Unequal (L1=4, L2=6, L3=4) + UDL: Symmetry
// ================================================================
//
// Symmetric span layout with symmetric loading yields symmetric results.
// M_B = M_C, R_A = R_D, R_B = R_C.

#[test]
fn validation_3span_symmetric_unequal() {
    let l1 = 4.0;
    let l2 = 6.0;
    let l3 = 4.0;
    let q = 10.0;
    let n_per_span = 8;

    let n_total = 3 * n_per_span;
    let loads: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2, l3], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total equilibrium: q*(L1+L2+L3) = q*14 = 140
    let total_load = q * (l1 + l2 + l3);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "3span unequal ΣRy");

    // Symmetric: R_A = R_D, R_B = R_C
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_a.rz, r_d.rz, 0.005, "3span sym R_A = R_D");

    let r_b = results.reactions.iter().find(|r| r.node_id == n_per_span + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_b.rz, r_c.rz, 0.005, "3span sym R_B = R_C");

    // Symmetric interior moments: M_B = M_C
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let ef_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), ef_c.m_end.abs(), 0.02,
        "3span sym |M_B| = |M_C|");

    // Symmetric midspan deflections: span 1 = span 3
    let mid1 = n_per_span / 2 + 1;
    let mid3 = 2 * n_per_span + n_per_span / 2 + 1;
    let d1 = results.displacements.iter().find(|d| d.node_id == mid1).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == mid3).unwrap();
    assert_close(d1.uz, d3.uz, 0.005, "3span sym deflection span1 = span3");
}

// ================================================================
// 8. Two Equal Spans + UDL: Continuity Reduces Deflection
// ================================================================
//
// Compare midspan deflection of a two-span continuous beam
// against a simply-supported beam of the same span length.
// Continuity should reduce midspan deflection.
// SS: delta_ss = 5qL^4/(384EI)
// Continuous end span: delta_cont = qL^4/(185EI) approximately (close to propped cantilever)

#[test]
fn validation_2span_deflection_vs_simple() {
    let l = 8.0;
    let q = 10.0;
    let n_per_span = 10;
    let e_eff = E * 1000.0;

    // Two-span continuous beam
    let n_total = 2 * n_per_span;
    let loads_cont: Vec<SolverLoad> = (1..=n_total)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_cont = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads_cont);
    let results_cont = linear::solve_2d(&input_cont).unwrap();

    // Simply-supported beam of span L
    let input_ss = make_ss_beam_udl(n_per_span, l, E, A, IZ, -q);
    let results_ss = linear::solve_2d(&input_ss).unwrap();

    // Midspan deflection of first span of continuous beam
    let mid_cont = n_per_span / 2 + 1;
    let d_cont = results_cont.displacements.iter()
        .find(|d| d.node_id == mid_cont).unwrap().uz.abs();

    // Midspan deflection of simply-supported beam
    let mid_ss = n_per_span / 2 + 1;
    let d_ss = results_ss.displacements.iter()
        .find(|d| d.node_id == mid_ss).unwrap().uz.abs();

    // Continuous beam deflection should be less than SS
    assert!(d_cont < d_ss,
        "Continuity reduces deflection: {:.6e} < {:.6e}", d_cont, d_ss);

    // Theoretical SS deflection: 5qL^4/(384EI)
    let delta_ss_theory: f64 = 5.0 * q * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_ss, delta_ss_theory, 0.05,
        "SS deflection matches 5qL^4/(384EI)");

    // Continuous midspan deflection should be roughly 40-60% of SS
    let ratio = d_cont / d_ss;
    assert!(ratio > 0.30 && ratio < 0.70,
        "Continuity ratio: {:.4} should be 0.30-0.70", ratio);
}
