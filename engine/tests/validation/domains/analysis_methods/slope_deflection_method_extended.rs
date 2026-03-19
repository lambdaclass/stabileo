/// Validation: Extended Slope-Deflection Method Results
///
/// References:
///   - McCormac & Nelson, "Structural Analysis Using Classical and Matrix Methods",
///     4th Ed., Ch. 14 (Slope-Deflection Method)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 11
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed., Ch. 15
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", 4th Ed.
///
/// The slope-deflection equations:
///   M_ij = (2EI/L)(2*theta_i + theta_j - 3*psi) + FEM_ij
///   M_ji = (2EI/L)(2*theta_j + theta_i - 3*psi) + FEM_ji
///   where psi = Delta/L (chord rotation), FEM = fixed-end moments
///
/// Tests:
///   1. Three-span beam with UDL: interior moments from slope-deflection
///   2. Fixed-fixed beam under triangular load: end moments
///   3. Propped cantilever with UDL: deflection at midspan
///   4. Two-span beam with point loads: moment at interior support
///   5. Portal frame under gravity: column base moments from slope-deflection
///   6. Fixed-fixed beam under two symmetric point loads
///   7. Three-span beam: Maxwell reciprocal theorem via slope-deflection
///   8. Antisymmetric loading on symmetric two-span beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Three-Span Beam with UDL: Interior Moments from Slope-Deflection
// ================================================================
//
// Three equal spans L=5m, UDL q=12 kN/m on all spans.
// Pinned at A, rollerX at B, C, D.
//
// By slope-deflection for equal spans under uniform load:
//   At interior supports B and C (by symmetry of structure and loading):
//   M_B = M_C = -q*L^2/10 (standard result for 3 equal spans, UDL)
//
// Global equilibrium: sum of reactions = q * 3L = 180 kN
//
// Ref: McCormac & Nelson, Table 14.1; Kassimali, Table 11.2
#[test]
fn validation_sdm_ext_three_span_equal_udl() {
    let l: f64 = 5.0;
    let q = -12.0;
    let n = 8;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[l, l, l], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior moment at B (node n+1): M_B = -q*L^2/10 = 12*25/10 = 30 kN*m
    let m_b_exact: f64 = q.abs() * l * l / 10.0;

    // Check moment at first interior support (element n ends there)
    let ef_b_left = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_b_left.m_end.abs(), m_b_exact, 0.03,
        "SDM Ext1: M_B = qL^2/10 at first interior support");

    // By symmetry, M_C should equal M_B
    let ef_c_left = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n).unwrap();
    assert_close(ef_c_left.m_end.abs(), m_b_exact, 0.03,
        "SDM Ext1: M_C = M_B by symmetry");

    // Global equilibrium check
    let total_load = q.abs() * 3.0 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01,
        "SDM Ext1: sum(Ry) = q*3L (global equilibrium)");
}

// ================================================================
// 2. Fixed-Fixed Beam Under Triangular Load: End Moments
// ================================================================
//
// Fixed-fixed beam of length L=8m under linearly varying load
// from 0 at left (node 1) to q_max at right (node n+1).
//
// Triangular load FEM (increasing left to right):
//   FEM_left  = -q*L^2/30  (at the zero-intensity end)
//   FEM_right = +q*L^2/20  (at the max-intensity end)
//
// Since both ends are fixed, theta_A = theta_B = 0, so the
// slope-deflection equations give M = FEM directly.
//
// Ref: Hibbeler, "Structural Analysis", Table 11-1 (triangular load)
#[test]
fn validation_sdm_ext_fixed_fixed_triangular_load() {
    let l: f64 = 8.0;
    let n = 20; // fine mesh for accuracy with linearly varying load
    let q_max: f64 = 15.0; // kN/m at right end (downward)

    // Create linearly varying distributed load: q(x) = q_max * x / L
    // Each element i spans from x_i to x_{i+1}
    let elem_len = l / n as f64;
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let x_start = i as f64 * elem_len;
            let x_end = (i + 1) as f64 * elem_len;
            let q_i = -q_max * x_start / l;
            let q_j = -q_max * x_end / l;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1, q_i, q_j, a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical FEMs for triangular load (zero at left, q_max at right):
    //   M_left  = q_max * L^2 / 30  (hogging)
    //   M_right = q_max * L^2 / 20  (hogging)
    let m_left_exact: f64 = q_max * l * l / 30.0;
    let m_right_exact: f64 = q_max * l * l / 20.0;

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();

    assert_close(ef1.m_start.abs(), m_left_exact, 0.03,
        "SDM Ext2: M_left = qL^2/30 for triangular load");
    assert_close(ef_last.m_end.abs(), m_right_exact, 0.03,
        "SDM Ext2: M_right = qL^2/20 for triangular load");

    // Both ends fixed: rotations should be zero
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d1.ry.abs() < 1e-10, "SDM Ext2: theta_left = 0 (fixed)");
    assert!(d_end.ry.abs() < 1e-10, "SDM Ext2: theta_right = 0 (fixed)");
}

// ================================================================
// 3. Propped Cantilever with UDL: Deflection at Midspan
// ================================================================
//
// Fixed at A (node 1), rollerX at B (node n+1), UDL q downward.
// From slope-deflection, the reactions and deflection are:
//   R_A = 5qL/8, R_B = 3qL/8
//   M_A = -qL^2/8
//   delta_max at x = 0.4215L, but midspan deflection (x=L/2):
//   delta_mid = qL^4 / (192 * E * I)  (from integration)
//
// Ref: Kassimali, "Structural Analysis", Table 11.3
#[test]
fn validation_sdm_ext_propped_cantilever_udl_deflection() {
    let l: f64 = 6.0;
    let n = 12;
    let q = -10.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = 5qL/8, R_B = 3qL/8
    let r_a_exact: f64 = 5.0 * q.abs() * l / 8.0;
    let r_b_exact: f64 = 3.0 * q.abs() * l / 8.0;

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r1.rz, r_a_exact, 0.02,
        "SDM Ext3: R_A = 5qL/8");
    assert_close(r_end.rz, r_b_exact, 0.02,
        "SDM Ext3: R_B = 3qL/8");

    // Fixed-end moment: M_A = qL^2/8
    let m_a_exact: f64 = q.abs() * l * l / 8.0;
    assert_close(r1.my.abs(), m_a_exact, 0.02,
        "SDM Ext3: M_A = qL^2/8");

    // Midspan deflection: delta_mid = qL^4/(192*EI)
    // Negative because beam deflects downward
    let delta_mid_exact: f64 = q.abs() * l.powi(4) / (192.0 * e_eff * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz.abs(), delta_mid_exact, 0.05,
        "SDM Ext3: delta_mid = qL^4/(192EI)");
}

// ================================================================
// 4. Two-Span Beam with Point Loads: Moment at Interior Support
// ================================================================
//
// Two equal spans L=8m, point load P at midspan of each span.
// Pinned at A, rollerX at B, rollerX at C.
//
// By symmetry, theta_B = 0 at the interior support.
// The slope-deflection equations with modified stiffness (pinned far ends):
//   M_BA = (3EI/L)*theta_B + FEM_BA_mod
//   where FEM_BA_mod = FEM_BA - FEM_AB/2 = PL/8 - (-PL/8)/2 = PL/8 + PL/16 = 3PL/16
//   Since theta_B = 0 by symmetry: M_B = 3PL/16
//
// Ref: Leet, Uang & Gilbert, Table 15.1; McCormac, Table 14.2
#[test]
fn validation_sdm_ext_two_span_symmetric_point_loads() {
    let l: f64 = 8.0;
    let n = 8;
    let p: f64 = 20.0;

    // Point load at midspan of each span
    let mid1 = n / 2 + 1; // midspan of first span
    let mid2 = n + n / 2 + 1; // midspan of second span
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid1, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid2, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];
    let input = make_continuous_beam(&[l, l], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment at interior support B: M_B = 3PL/16
    let m_b_exact: f64 = 3.0 * p * l / 16.0;
    let ef_b = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.03,
        "SDM Ext4: M_B = 3PL/16 for symmetric point loads");

    // By symmetry, rotation at B should be zero
    let d_b = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b.ry.abs() < 1e-8,
        "SDM Ext4: theta_B = 0 by symmetry: {:.6e}", d_b.ry);

    // Global equilibrium: total vertical reaction = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.01,
        "SDM Ext4: sum(Ry) = 2P");
}

// ================================================================
// 5. Portal Frame Under Gravity: Column Base Moments
// ================================================================
//
// Portal frame: fixed bases, h=4m, w=6m, vertical loads P at both top nodes.
// No lateral load (symmetric gravity only).
//
// By symmetry (no sway): psi = 0 for both columns.
// Slope-deflection at joint 2 (top-left):
//   M_12 + M_23 = 0   (moment equilibrium at rigid joint)
//   M_12 = (2EI/h)(2*theta_2)       [column: far end fixed, theta_1=0]
//   M_23 = (2EI/w)(2*theta_2 + theta_3) [beam]
//
// By symmetry theta_2 = -theta_3, so M_23 = (2EI/w)(2*theta_2 - theta_2) = (2EI/w)*theta_2
// M_12 = 0 => column base moment = (2EI/h)*theta_2 (carry-over from joint).
//
// Key check: by symmetry, horizontal reactions at bases should be zero,
// and column base moments should be equal in magnitude.
//
// Ref: Hibbeler, "Structural Analysis", Example 11.5
#[test]
fn validation_sdm_ext_portal_frame_gravity() {
    let h: f64 = 4.0;
    let w: f64 = 6.0;
    let p: f64 = 50.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: horizontal reactions at bases should be zero
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert!(r1.rx.abs() < 0.5,
        "SDM Ext5: Rx_base1 ~ 0 by symmetry: {:.6}", r1.rx);
    assert!(r4.rx.abs() < 0.5,
        "SDM Ext5: Rx_base4 ~ 0 by symmetry: {:.6}", r4.rx);

    // Base moments should be equal in magnitude (symmetry)
    assert_close(r1.my.abs(), r4.my.abs(), 0.02,
        "SDM Ext5: |M_base1| = |M_base4| by symmetry");

    // Top joint rotations should be equal and opposite by symmetry
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert_close(d2.ry.abs(), d3.ry.abs(), 0.02,
        "SDM Ext5: |theta_2| = |theta_3| by symmetry");

    // Vertical equilibrium: sum(Ry) = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.01,
        "SDM Ext5: sum(Ry) = 2P");

    // No sway: lateral displacements at top should be zero (or very small)
    assert!(d2.ux.abs() < 1e-8,
        "SDM Ext5: ux_2 ~ 0 (no sway): {:.6e}", d2.ux);
}

// ================================================================
// 6. Fixed-Fixed Beam Under Two Symmetric Point Loads
// ================================================================
//
// Fixed-fixed beam of length L=9m with two equal point loads P
// at the third points (x = L/3 and x = 2L/3).
//
// FEM for single point load P at distance a from left (b = L - a):
//   FEM_left  = -P*a*b^2 / L^2
//   FEM_right = +P*a^2*b / L^2
//
// For P at L/3: a=L/3, b=2L/3
//   FEM_L1 = -P*(L/3)*(2L/3)^2/L^2 = -4PL/27
//   FEM_R1 = +P*(L/3)^2*(2L/3)/L^2 = +2PL/27
//
// For P at 2L/3: a=2L/3, b=L/3
//   FEM_L2 = -P*(2L/3)*(L/3)^2/L^2 = -2PL/27
//   FEM_R2 = +P*(2L/3)^2*(L/3)/L^2 = +4PL/27
//
// Total FEM (both ends fixed, theta=0, so M = FEM):
//   M_left  = FEM_L1 + FEM_L2 = -4PL/27 - 2PL/27 = -6PL/27 = -2PL/9
//   M_right = FEM_R1 + FEM_R2 = +2PL/27 + 4PL/27 = +6PL/27 = +2PL/9
//
// By symmetry, |M_left| = |M_right| = 2PL/9.
//
// Ref: Hibbeler, Table 11-1 (superposition of point load FEMs)
#[test]
fn validation_sdm_ext_fixed_fixed_two_point_loads() {
    let l: f64 = 9.0;
    let n = 9; // 9 elements so third-point nodes land exactly
    let p: f64 = 30.0;

    // Nodes at third points: node 4 (x = L/3 = 3m), node 7 (x = 2L/3 = 6m)
    let node_left_load = n / 3 + 1; // node 4
    let node_right_load = 2 * n / 3 + 1; // node 7
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_left_load, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: node_right_load, fx: 0.0, fz: -p, my: 0.0,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments: |M| = 2PL/9
    let m_end_exact: f64 = 2.0 * p * l / 9.0;

    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();

    assert_close(ef1.m_start.abs(), m_end_exact, 0.02,
        "SDM Ext6: M_left = 2PL/9");
    assert_close(ef_last.m_end.abs(), m_end_exact, 0.02,
        "SDM Ext6: M_right = 2PL/9");

    // By symmetry: both end moments should be equal in magnitude
    assert_close(ef1.m_start.abs(), ef_last.m_end.abs(), 0.01,
        "SDM Ext6: |M_left| = |M_right| by symmetry");

    // Midspan moment by superposition:
    // For fixed-fixed beam with two symmetric third-point loads:
    // M_center = P*L/3 - 2PL/9 = PL/9 (per load, from equilibrium)
    // Actually: M_mid = R_A * L/2 - M_A - P * (L/2 - L/3)
    //   R_A = P (by symmetry, each support carries P)
    //   M_mid = P * L/2 - 2PL/9 - P * L/6 = PL/2 - PL/6 - 2PL/9
    //         = 9PL/18 - 3PL/18 - 4PL/18 = 2PL/18 = PL/9
    let m_mid_exact: f64 = p * l / 9.0;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == n / 2).unwrap();
    // The moment at the end of the middle-ish element (close to midspan)
    assert_close(ef_mid.m_end.abs(), m_mid_exact, 0.05,
        "SDM Ext6: M_midspan ~ PL/9");
}

// ================================================================
// 7. Three-Span Beam: Maxwell Reciprocal Check via Slope-Deflection
// ================================================================
//
// Maxwell's reciprocal theorem states that for a linear elastic structure:
//   delta_ij = delta_ji
// i.e. the displacement at point i due to a unit load at j equals the
// displacement at point j due to a unit load at i.
//
// Test with a three-span beam (5m, 6m, 5m):
//   Case A: P = 1 kN at midspan of span 1, measure deflection at midspan of span 3
//   Case B: P = 1 kN at midspan of span 3, measure deflection at midspan of span 1
//   delta_A_at_span3 should equal delta_B_at_span1
//
// Ref: Norris, Wilbur & Utku, Ch. 10 (Maxwell's theorem)
#[test]
fn validation_sdm_ext_maxwell_reciprocal_three_span() {
    let n = 8;
    let p: f64 = 1.0;

    let spans = [5.0_f64, 6.0, 5.0];

    // Case A: load at midspan of span 1 (node n/2 + 1)
    let mid_span1 = n / 2 + 1;
    let mid_span3 = 2 * n + n / 2 + 1;

    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_a = make_continuous_beam(&spans, n, E, A, IZ, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    // Deflection at midspan of span 3 due to load at midspan of span 1
    let delta_a_at_3 = res_a.displacements.iter()
        .find(|d| d.node_id == mid_span3).unwrap().uz;

    // Case B: load at midspan of span 3
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_span3, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_b = make_continuous_beam(&spans, n, E, A, IZ, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    // Deflection at midspan of span 1 due to load at midspan of span 3
    let delta_b_at_1 = res_b.displacements.iter()
        .find(|d| d.node_id == mid_span1).unwrap().uz;

    // Maxwell's reciprocal theorem: delta_ij = delta_ji
    assert_close(delta_a_at_3, delta_b_at_1, 0.02,
        "SDM Ext7: Maxwell reciprocal: delta_13 = delta_31");

    // Verify the deflections are non-zero (the test is meaningful)
    assert!(delta_a_at_3.abs() > 1e-10,
        "SDM Ext7: deflection is non-trivial: {:.6e}", delta_a_at_3);

    // Additionally, since spans 1 and 3 are equal length, by structural symmetry
    // loading span 1 gives the same magnitude deflection at span 3 midpoint
    // as loading span 3 gives at span 1 midpoint, which is consistent with
    // Maxwell. This provides a strong validation of the solver's flexibility matrix.
}

// ================================================================
// 8. Antisymmetric Loading on Symmetric Two-Span Beam
// ================================================================
//
// Two equal spans L=6m, pinned at A, rollerX at B, rollerX at C.
// Antisymmetric loading: UDL q (down) on span 1 only, no load on span 2.
//
// Compare with symmetric loading (UDL on both spans) to verify that
// the antisymmetric component produces the correct interior rotation.
//
// For UDL on span 1 only of a two-span beam (equal spans):
//   M_B = qL^2/16  (standard result from slope-deflection)
//   R_A = (5/8)*qL - M_B/L, R_B contributions from both spans
//
// The interior rotation theta_B is non-zero (unlike symmetric loading),
// and R_C is non-zero due to load redistribution through span 2.
//
// Ref: Kassimali, "Structural Analysis", Sec. 11.4
#[test]
fn validation_sdm_ext_antisymmetric_two_span() {
    let l: f64 = 6.0;
    let n = 10;
    let q: f64 = 10.0;

    // Case A: UDL on span 1 only (asymmetric loading)
    let loads_asym: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_asym = make_continuous_beam(&[l, l], n, E, A, IZ, loads_asym);
    let res_asym = linear::solve_2d(&input_asym).unwrap();

    // Case B: UDL on both spans (symmetric loading)
    let loads_sym: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: -q, q_j: -q, a: None, b: None,
        }))
        .collect();
    let input_sym = make_continuous_beam(&[l, l], n, E, A, IZ, loads_sym);
    let res_sym = linear::solve_2d(&input_sym).unwrap();

    // Symmetric loading: theta_B = 0
    let d_b_sym = res_sym.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b_sym.ry.abs() < 1e-10,
        "SDM Ext8: theta_B = 0 for symmetric loading: {:.6e}", d_b_sym.ry);

    // Asymmetric loading: theta_B != 0
    let d_b_asym = res_asym.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(d_b_asym.ry.abs() > 1e-8,
        "SDM Ext8: theta_B != 0 for asymmetric loading: {:.6e}", d_b_asym.ry);

    // Interior support moment for single-span loaded two-span beam:
    // From slope-deflection: M_B = qL^2/16
    // (Modified FEM at B from span 1 with pinned far end at A:
    //  FEM_BA_mod = qL^2/12 + (-qL^2/12)/2 = qL^2/12 - qL^2/24 = qL^2/24
    //  Then distributing at B: DF_BA = DF_BC = 0.5
    //  But with modified stiffness for both pinned ends:
    //  M_B = FEM_BA_mod * k_BC / (k_BA + k_BC) ... this simplifies.)
    // The exact result for continuous two-span with UDL on one span:
    // M_B = qL^2/16 (per three-moment equation)
    let m_b_exact: f64 = q * l * l / 16.0;
    let ef_b = res_asym.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.05,
        "SDM Ext8: M_B = qL^2/16 for single-span loaded two-span beam");

    // Global equilibrium: total reaction = qL (only span 1 loaded)
    let total_load: f64 = q * l;
    let sum_ry: f64 = res_asym.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01,
        "SDM Ext8: sum(Ry) = qL");

    // End support C has small but non-zero reaction (load redistribution)
    let r_c = res_asym.reactions.iter()
        .find(|r| r.node_id == 2 * n + 1).unwrap();
    assert!(r_c.rz.abs() > 0.1,
        "SDM Ext8: R_C != 0 (load redistribution to unloaded span): {:.4}", r_c.rz);
    // R_C should be negative (downward) because the unloaded span pulls down
    // at its far end due to continuity
    assert!(r_c.rz < 0.0,
        "SDM Ext8: R_C < 0 (uplift at far end of unloaded span): {:.4}", r_c.rz);
}
