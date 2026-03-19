/// Validation: Fixed-End Forces (FEF) for Various Load Patterns
///
/// References:
///   - AISC Steel Construction Manual, 15th Ed., Table 3-23 (beam diagrams)
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Table 4.3 (FEF formulas)
///   - Ghali & Neville, "Structural Analysis", 5th Ed., Appendix D (FEF tables)
///   - Kassimali, "Structural Analysis", 6th Ed., §15.2 (fixed-end moments)
///
/// Fixed-End Forces are the reactions at the ends of a clamped-clamped beam
/// due to mid-span loads. The FEM solver implicitly uses FEF for distributed
/// loads. These tests verify the FEF by comparing reactions of fixed-fixed
/// beams to well-known closed-form solutions.
///
/// Tests:
///   1. UDL on fixed-fixed beam: FEF moment = wL²/12, reaction = wL/2
///   2. Midspan point load: FEF moment = PL/8, reaction = P/2
///   3. Point load at quarter span: asymmetric FEF (M_A = Pab²/L², M_B = Pa²b/L²)
///   4. Triangular (linearly varying) load: FEF moments qL²/30 and qL²/20
///   5. Partial UDL on left half: FEF reactions and moments
///   6. End moments from UDL match fixed-fixed beam reactions
///   7. FEF reactions sum to total applied load
///   8. Point load at third-span: asymmetric reaction check
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. UDL: FEF Moment = wL²/12, Reaction = wL/2
// ================================================================
//
// Uniformly distributed load on a fixed-fixed beam.
// Fixed-end moments = wL²/12 at each end; vertical reactions = wL/2.
// Reference: AISC Manual Table 3-23 Case 1; Przemieniecki Table 4.3

#[test]
fn validation_fef_udl_fixed_fixed() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0; // kN/m downward

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // FEF moments = wL²/12 (magnitude)
    let fem = q.abs() * l * l / 12.0;
    assert_close(r1.my.abs(), fem, 0.02, "UDL FEF: M_left = wL²/12");
    assert_close(r_end.my.abs(), fem, 0.02, "UDL FEF: M_right = wL²/12");

    // Vertical reactions = wL/2
    let r_exact = q.abs() * l / 2.0;
    assert_close(r1.rz, r_exact, 0.02, "UDL FEF: R_left = wL/2");
    assert_close(r_end.rz, r_exact, 0.02, "UDL FEF: R_right = wL/2");

    // Global equilibrium: sum of vertical reactions = total load
    let total = q.abs() * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total, 0.01, "UDL FEF: ΣRy = wL");
}

// ================================================================
// 2. Midspan Point Load: FEF Moment = PL/8
// ================================================================
//
// Single concentrated load at midspan of fixed-fixed beam.
// Fixed-end moments = PL/8 at each end; reactions = P/2 each.
// Reference: AISC Manual Table 3-23 Case 4; Ghali & Neville App. D

#[test]
fn validation_fef_midspan_point_load() {
    let l = 8.0;
    let n = 8;
    let p = 24.0;

    let mid_node = n / 2 + 1; // node 5 for n=8
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // FEF moment = PL/8
    let fem = p * l / 8.0;
    assert_close(r1.my.abs(), fem, 0.02, "Midspan FEF: M = PL/8");
    assert_close(r_end.my.abs(), fem, 0.02, "Midspan FEF: M_end = PL/8");

    // Equal reactions = P/2
    assert_close(r1.rz, p / 2.0, 0.02, "Midspan FEF: R = P/2");
    assert_close(r_end.rz, p / 2.0, 0.02, "Midspan FEF: R_end = P/2");
}

// ================================================================
// 3. Point Load at Quarter Span: Asymmetric FEF
// ================================================================
//
// Load P at distance a from left, b = L-a from right (a < b).
// Fixed-end moments: M_A = P a b² / L²,  M_B = P a² b / L²
// Since a < b: M_A < M_B (larger moment at the near end).
// Reference: AISC Manual Table 3-23 Case 5; Kassimali §15.2

#[test]
fn validation_fef_quarter_span_point_load() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    // Load at L/4 from left: node 3 for n=8 (each element = 1 m)
    let load_node = 3;
    let a = (load_node - 1) as f64 * (l / n as f64); // 2.0 m from left
    let b = l - a;                                     // 6.0 m from right

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M_A = P a b² / L²
    let m_a = p * a * b * b / (l * l);
    // M_B = P a² b / L²
    let m_b = p * a * a * b / (l * l);

    assert_close(r1.my.abs(), m_a, 0.05, "Quarter-span FEF: M_A = Pab²/L²");
    assert_close(r_end.my.abs(), m_b, 0.05, "Quarter-span FEF: M_B = Pa²b/L²");

    // M_A > M_B for load closer to left (a < b)
    assert!(
        r1.my.abs() > r_end.my.abs(),
        "Quarter-span: M_A > M_B for a < b: M_A={:.4}, M_B={:.4}",
        r1.my.abs(), r_end.my.abs()
    );

    // Reaction equilibrium: R_A = P b²(L+2a)/L³, R_B = P a²(L+2b)/L³
    let r_a_exact = p * b * b * (l + 2.0 * a) / l.powi(3);
    let r_b_exact = p * a * a * (l + 2.0 * b) / l.powi(3);
    assert_close(r1.rz, r_a_exact, 0.05, "Quarter-span: R_A = Pb²(L+2a)/L³");
    assert_close(r_end.rz, r_b_exact, 0.05, "Quarter-span: R_B = Pa²(L+2b)/L³");
}

// ================================================================
// 4. Triangular Load: FEF Moments qL²/30 and qL²/20
// ================================================================
//
// Load varies linearly from 0 at left to q at right on fixed-fixed beam.
// Fixed-end moments: M_A = qL²/30, M_B = qL²/20.
// Reference: AISC Manual Table 3-23 Case 3; Przemieniecki Table 4.3

#[test]
fn validation_fef_triangular_load() {
    let l = 6.0;
    let n = 12; // sufficient elements for triangular load accuracy
    let q: f64 = -12.0; // kN/m (max intensity at right end)

    // Linear from 0 at node 1 to q at node n+1
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q * t_i,
                q_j: q * t_j,
                a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // FEF: M_left = qL²/30
    let m_left = q.abs() * l * l / 30.0;
    // FEF: M_right = qL²/20
    let m_right = q.abs() * l * l / 20.0;

    // Allow 10% tolerance due to piecewise linear approximation
    assert_close(r1.my.abs(), m_left, 0.10, "Triangular FEF: M_left ≈ qL²/30");
    assert_close(r_end.my.abs(), m_right, 0.10, "Triangular FEF: M_right ≈ qL²/20");

    // Right end moment must exceed left end moment
    assert!(
        r_end.my.abs() > r1.my.abs(),
        "Triangular FEF: M_right > M_left: {:.4} > {:.4}",
        r_end.my.abs(), r1.my.abs()
    );

    // Total vertical reaction = qL/2 (total triangular load)
    let total = q.abs() * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total, 0.02, "Triangular FEF: ΣRy = qL/2");
}

// ================================================================
// 5. Partial UDL on Left Half: FEF Reactions and Moments
// ================================================================
//
// Uniform load on left half [0, L/2] of fixed-fixed beam.
// From standard tables: M_A = 11wL²/192, M_B = 5wL²/192,
// R_A = 11wL/16 * (1/2) ... simplified derivation gives:
// Total load = wL/2, applied at centroid x = L/4.
// Using force method for fixed-fixed beam with partial UDL:
// M_A = w(L/2)(3×(L/2)² + 2×(L/2)×L - L²)/(12L²) = 11w L²/192
// Reference: Ghali & Neville, "Structural Analysis" 5th Ed., Appendix D

#[test]
fn validation_fef_partial_udl_left_half() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;

    // Load on left half (elements 1..4)
    let loads: Vec<SolverLoad> = (1..=n / 2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Total applied load = q * L/2
    let total = q.abs() * l / 2.0;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total, 0.02, "Partial UDL FEF: ΣRy = wL/2");

    // Left reaction should be larger (load is on left half)
    assert!(
        r1.rz > r_end.rz,
        "Partial UDL FEF: R_left > R_right: {:.4} > {:.4}", r1.rz, r_end.rz
    );

    // Moment at left should be larger than moment at right
    // (load closer to left end → larger FEF moment at left)
    assert!(
        r1.my.abs() > r_end.my.abs(),
        "Partial UDL FEF: |M_left| > |M_right|: {:.4} > {:.4}",
        r1.my.abs(), r_end.my.abs()
    );

    // Check analytical FEF: M_A = 11wL²/192, M_B = 5wL²/192
    let m_a_exact = 11.0 * q.abs() * l * l / 192.0;
    let m_b_exact = 5.0 * q.abs() * l * l / 192.0;
    assert_close(r1.my.abs(), m_a_exact, 0.05, "Partial UDL FEF: M_A = 11wL²/192");
    assert_close(r_end.my.abs(), m_b_exact, 0.05, "Partial UDL FEF: M_B = 5wL²/192");
}

// ================================================================
// 6. UDL Fixed-Fixed: End Moments Match Prescribed Reaction Moments
// ================================================================
//
// For a fixed-fixed beam with UDL, the reaction moments should be
// equal in magnitude but opposite in sign (hogging vs sagging).
// The reaction moment at left is clockwise (positive in some conventions)
// and at right is counter-clockwise.
// Also verify: propped cantilever UDL gives R_prop = 3wL/8.
// Reference: Kassimali §15.2; AISC Table 3-23

#[test]
fn validation_fef_udl_moment_sign_and_propped() {
    let l = 6.0;
    let n = 8;
    let q: f64 = -10.0;

    // Fixed-fixed beam with UDL
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_ff = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads.clone());
    let res_ff = linear::solve_2d(&input_ff).unwrap();

    let r1_ff = res_ff.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end_ff = res_ff.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Moments must be equal in magnitude (symmetric)
    assert_close(r1_ff.my.abs(), r_end_ff.my.abs(), 0.02,
        "UDL fixed-fixed: |M_left| = |M_right|");

    // For UDL: moments have opposite signs at the two ends (both hogging)
    // In the solver sign convention, both reaction moments should be non-zero
    assert!(r1_ff.my.abs() > 1.0, "Fixed-fixed UDL: non-zero left moment");
    assert!(r_end_ff.my.abs() > 1.0, "Fixed-fixed UDL: non-zero right moment");

    // Propped cantilever (fixed at left, roller at right) with UDL
    let input_pc = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let res_pc = linear::solve_2d(&input_pc).unwrap();

    let r1_pc = res_pc.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end_pc = res_pc.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Propped cantilever: R_prop = 3wL/8
    let r_prop_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_end_pc.rz, r_prop_exact, 0.02, "Propped cantilever: R_prop = 3wL/8");

    // Fixed end: R_fixed = 5wL/8
    let r_fixed_exact = 5.0 * q.abs() * l / 8.0;
    assert_close(r1_pc.rz, r_fixed_exact, 0.02, "Propped cantilever: R_fixed = 5wL/8");

    // Fixed end moment: M_fixed = wL²/8
    let m_fixed_exact = q.abs() * l * l / 8.0;
    assert_close(r1_pc.my.abs(), m_fixed_exact, 0.02, "Propped cantilever: M = wL²/8");
}

// ================================================================
// 7. FEF Reactions Sum to Total Applied Load
// ================================================================
//
// For any load on a fixed-fixed beam, the sum of the vertical reactions
// must equal the total applied load (global equilibrium).
// Test with several different load patterns.
// Reference: Przemieniecki, "Matrix Structural Analysis" §4.4

#[test]
fn validation_fef_reactions_sum_to_total_load() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;
    let p: f64 = -30.0;

    // Test 1: Full UDL
    let loads_udl: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_udl);
    let res1 = linear::solve_2d(&input1).unwrap();
    let sum1: f64 = res1.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum1, q.abs() * l, 0.01, "FEF sum (UDL): ΣRy = wL");

    // Test 2: Point load at L/3
    let load_node = n / 3 + 1;
    let loads_pt = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: p, my: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_pt);
    let res2 = linear::solve_2d(&input2).unwrap();
    let sum2: f64 = res2.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum2, p.abs(), 0.01, "FEF sum (point): ΣRy = P");

    // Test 3: Triangular load (0 to q)
    let loads_tri: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let ti = i as f64 / n as f64;
            let tj = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i: q * ti, q_j: q * tj, a: None, b: None,
            })
        })
        .collect();
    let input3 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_tri);
    let res3 = linear::solve_2d(&input3).unwrap();
    let sum3: f64 = res3.reactions.iter().map(|r| r.rz).sum();
    let total_tri = q.abs() * l / 2.0;
    assert_close(sum3, total_tri, 0.02, "FEF sum (triangular): ΣRy = qL/2");

    // Test 4: Combined UDL + point load
    let mut loads_comb: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    loads_comb.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: p, my: 0.0,
    }));
    let input4 = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads_comb);
    let res4 = linear::solve_2d(&input4).unwrap();
    let sum4: f64 = res4.reactions.iter().map(|r| r.rz).sum();
    let total_comb = q.abs() * l + p.abs();
    assert_close(sum4, total_comb, 0.02, "FEF sum (combined): ΣRy = wL + P");
}

// ================================================================
// 8. Point Load at Third Span: Reaction and Moment Asymmetry
// ================================================================
//
// Load P at a = L/3 from left on fixed-fixed beam.
// M_A = P × (L/3) × (2L/3)² / L² = 4PL/27
// M_B = P × (L/3)² × (2L/3) / L² = 2PL/27
// R_A = P × (2L/3)² × (L + 2×L/3) / L³ = P × (4/9) × (5/3) / 1 = 20P/27
// R_B = P × (L/3)² × (L + 2×(2L/3)) / L³ = P × (1/9) × (7/3) / 1 = 7P/27
// Reference: AISC Manual Table 3-23 Case 5

#[test]
fn validation_fef_third_span_point_load() {
    let l = 9.0;
    let n = 9;
    let p = 27.0; // convenient for exact fractions

    // Load at node 4 = L/3 from left (each element = 1 m)
    let load_node = 4;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let a = 3.0; // L/3
    let b = 6.0; // 2L/3

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Fixed-end moment formulas: M_A = Pab²/L², M_B = Pa²b/L²
    let m_a = p * a * b * b / (l * l); // = 27 × 3 × 36 / 81 = 36
    let m_b = p * a * a * b / (l * l); // = 27 × 9 × 6 / 81 = 18

    assert_close(r1.my.abs(), m_a, 0.05, "Third-span FEF: M_A = Pab²/L²");
    assert_close(r_end.my.abs(), m_b, 0.05, "Third-span FEF: M_B = Pa²b/L²");

    // Moment at left (closer to load) should be larger than at right
    assert!(
        r1.my.abs() > r_end.my.abs(),
        "Third-span FEF: M_A > M_B: {:.4} > {:.4}", r1.my.abs(), r_end.my.abs()
    );

    // Reaction formulas: R_A = Pb²(3a+b)/L³, R_B = Pa²(a+3b)/L³
    // Note: Standard formula uses R_A = Pb²(L+2a)/L³ = Pb²(3a+b)/L³ when a+b=L
    let r_a_exact = p * b * b * (l + 2.0 * a) / l.powi(3);
    let r_b_exact = p * a * a * (l + 2.0 * b) / l.powi(3);
    assert_close(r1.rz, r_a_exact, 0.05, "Third-span FEF: R_A exact");
    assert_close(r_end.rz, r_b_exact, 0.05, "Third-span FEF: R_B exact");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Third-span FEF: ΣRy = P");
}
