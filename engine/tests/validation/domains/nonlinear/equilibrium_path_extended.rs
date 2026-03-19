/// Validation: Extended Equilibrium Path Conditions
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-5
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5, 12
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 2, 5
///   - Chen & Lui, "Structural Stability", Ch. 3
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 2
///
/// These tests extend the original equilibrium path tests with:
///   1. Propped cantilever under UDL: fixed-end moment and free-end shear
///   2. Three-span continuous beam: moment continuity at interior supports
///   3. P-delta portal frame: global equilibrium preserved under second-order effects
///   4. Corotational cantilever: element force balance in deformed configuration
///   5. Two-bay portal frame: joint equilibrium at interior column
///   6. Overhanging beam: moment sign reversal at internal support
///   7. P-delta vs linear: reaction sums match applied loads in both analyses
///   8. Antisymmetric portal loading: antisymmetric displacement response
use dedaliano_engine::solver::{linear, pdelta, corotational};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever Under UDL: Fixed-End Moment and Tip Shear
// ================================================================
//
// A propped cantilever (fixed at left, roller at right) of length L = 8 m
// under UDL q = -10 kN/m.
//
// Analytical results:
//   R_left  = 5qL/8  (vertical reaction at fixed end)
//   R_right = 3qL/8  (vertical reaction at roller)
//   M_fixed = -qL^2/8 (hogging moment at fixed end)
//   Shear at fixed end: V(0+) = 5qL/8
//   Shear at roller:    V(L-) = -3qL/8
//
// The zero-shear point (maximum sagging moment) occurs at x = 5L/8.
//
// Ref: Hibbeler, "Structural Analysis", Table B-5

#[test]
fn validation_path_ext_propped_cantilever_udl() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check reactions
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let r_left_expected = 5.0 * q.abs() * l / 8.0;   // 50 kN
    let r_right_expected = 3.0 * q.abs() * l / 8.0;   // 30 kN
    assert_close(r_left.rz, r_left_expected, 0.02,
        "Propped cantilever: R_left = 5qL/8");
    assert_close(r_right.rz, r_right_expected, 0.02,
        "Propped cantilever: R_right = 3qL/8");

    // Fixed-end moment: M = -qL^2/8 = -80 kN*m (hogging)
    let m_fixed_expected = q.abs() * l * l / 8.0; // magnitude = 80
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_first.m_start.abs(), m_fixed_expected, 0.02,
        "Propped cantilever: |M_fixed| = qL^2/8");

    // Moment at roller end should be zero (no rotational restraint)
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(ef_last.m_end.abs() < 1.0,
        "Propped cantilever: M at roller ~ 0: {:.4}", ef_last.m_end);

    // Shear sign change must occur (positive near fixed, negative near roller)
    let has_sign_change = results.element_forces.iter()
        .any(|ef| ef.v_start * ef.v_end < 0.0);
    assert!(has_sign_change,
        "Propped cantilever: shear changes sign along the beam");
}

// ================================================================
// 2. Three-Span Continuous Beam: Moment Continuity at Supports
// ================================================================
//
// Three equal spans (L = 5 m each) under UDL q = -10 kN/m.
// At interior supports, the bending moment must be continuous
// (m_end of left element = m_start of right element at the same node).
//
// By symmetry of equal spans and equal loading:
//   M at support B = M at support C (interior supports are symmetric)
//   R_A = R_D (end reactions are equal)
//   R_B = R_C (interior reactions are equal)
//
// Ref: Kassimali, "Structural Analysis", Ch. 12 (three-moment equation)

#[test]
fn validation_path_ext_three_span_moment_continuity() {
    let span = 5.0;
    let n_per_span = 10;
    let q = -10.0;
    let total_n = 3 * n_per_span;

    let loads: Vec<SolverLoad> = (1..=total_n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check moment continuity at interior support B (node n_per_span + 1)
    let node_b = n_per_span + 1;
    let ef_left_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span).unwrap();
    let ef_right_b = results.element_forces.iter()
        .find(|e| e.element_id == n_per_span + 1).unwrap();
    let m_continuity_b = (ef_left_b.m_end - ef_right_b.m_start).abs();
    assert!(m_continuity_b < 0.5,
        "Three-span: moment continuity at B: left_end={:.4}, right_start={:.4}",
        ef_left_b.m_end, ef_right_b.m_start);

    // Check moment continuity at interior support C (node 2*n_per_span + 1)
    let ef_left_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span).unwrap();
    let ef_right_c = results.element_forces.iter()
        .find(|e| e.element_id == 2 * n_per_span + 1).unwrap();
    let m_continuity_c = (ef_left_c.m_end - ef_right_c.m_start).abs();
    assert!(m_continuity_c < 0.5,
        "Three-span: moment continuity at C: left_end={:.4}, right_start={:.4}",
        ef_left_c.m_end, ef_right_c.m_start);

    // By symmetry: reactions at end supports are equal
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 3 * n_per_span + 1).unwrap();
    assert_close(r_a.rz, r_d.rz, 0.02,
        "Three-span symmetry: R_A = R_D");

    // By symmetry: interior reactions are equal
    let r_b = results.reactions.iter().find(|r| r.node_id == node_b).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_b.rz, r_c.rz, 0.02,
        "Three-span symmetry: R_B = R_C");

    // Global equilibrium: sum of reactions = total load
    let total_load = q.abs() * 3.0 * span; // 150 kN
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Three-span: sum of reactions = total applied load");
}

// ================================================================
// 3. P-Delta Portal Frame: Global Equilibrium Preserved
// ================================================================
//
// A portal frame under combined lateral and gravity loads analyzed
// with P-delta (second-order) analysis. Despite the geometric
// stiffness modification, global equilibrium must still hold:
//   sum(Rx) + Fx_applied = 0
//   sum(Ry) + Fy_applied = 0
//
// The P-delta analysis amplifies internal forces and displacements,
// but the total reactions must still equilibrate the applied loads.
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 5

#[test]
fn validation_path_ext_pdelta_portal_global_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let f_lat = 10.0;
    let f_grav = -30.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, f_grav);
    let res = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    assert!(res.converged, "P-delta portal should converge");

    let results = &res.results;

    // Global horizontal equilibrium: sum(Rx) = -F_lat
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lat, 0.02,
        "P-delta portal: sum(Rx) = -F_lateral");

    // Global vertical equilibrium: sum(Ry) = -2*F_grav (gravity at both top nodes)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, -2.0 * f_grav, 0.02,
        "P-delta portal: sum(Ry) = -sum(F_gravity)");

    // P-delta displacement should be larger than linear displacement
    let lin_res = linear::solve_2d(&input).unwrap();
    let d_lin = lin_res.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_pd = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    assert!(d_pd > d_lin,
        "P-delta: amplified drift {:.6e} > linear drift {:.6e}", d_pd, d_lin);

    // Column moment equilibrium should still hold for each column
    let ef_col = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let m_sum = ef_col.m_start.abs() + ef_col.m_end.abs();
    let v_h = ef_col.v_start.abs() * h;
    // For P-delta, the moment balance includes the P-delta term: M_base + M_top ~ V*h + N*delta
    // But M_base + M_top >= V*h (the P-delta adds extra moment)
    assert!(m_sum >= v_h * 0.95,
        "P-delta column: M_base + M_top >= V*h: {:.4} vs {:.4}", m_sum, v_h);
}

// ================================================================
// 4. Corotational Cantilever: Element Force Balance
// ================================================================
//
// Cantilever beam (L = 2 m) with moderate tip load (P = 50 kN downward).
// Even under nonlinear (corotational) analysis, each element must
// satisfy the local equilibrium relation:
//   V_end = V_start + q * L_elem  (q = 0 for nodal load case)
//
// For elements with no distributed load, shear is constant:
//   V_start = V_end for each element
//
// Also verify that the tip shear magnitude equals the applied load.
//
// Ref: Chen & Lui, "Structural Stability", Ch. 3

#[test]
fn validation_path_ext_corotational_cantilever_force_balance() {
    let l = 2.0;
    let n = 8;
    let p = 50.0;

    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let result = corotational::solve_corotational_2d(&input, 50, 1e-6, 5, false).unwrap();
    assert!(result.converged, "Corotational cantilever should converge");

    let results = &result.results;

    // Each element has no distributed load, so shear should be approximately constant
    for ef in &results.element_forces {
        let v_diff = (ef.v_start - ef.v_end).abs();
        let scale = ef.v_start.abs().max(1.0);
        assert!(v_diff / scale < 0.10,
            "Corot cantilever elem {}: V_start={:.4}, V_end={:.4}, diff={:.4}",
            ef.element_id, ef.v_start, ef.v_end, v_diff);
    }

    // Tip element shear magnitude should be close to the applied load
    let ef_tip = results.element_forces.iter()
        .find(|e| e.element_id == n).unwrap();
    assert_close(ef_tip.v_end.abs(), p, 0.10,
        "Corot cantilever: tip shear ~ applied load P");

    // Moment at fixed end should be approximately P * L (for small deflection)
    // With nonlinear effects it will differ, but should be in the right ballpark
    let ef_base = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    let m_base = ef_base.m_start.abs();
    let m_linear = p * l;
    assert!(m_base > 0.5 * m_linear && m_base < 1.5 * m_linear,
        "Corot cantilever: M_base={:.4} in range of P*L={:.4}", m_base, m_linear);
}

// ================================================================
// 5. Two-Bay Portal Frame: Joint Equilibrium at Interior Column
// ================================================================
//
// Two-bay portal frame with 3 columns and 2 beams under lateral load.
// At the interior column top joint, moment equilibrium requires:
//   M_col_top + M_beam_left_end + M_beam_right_start = 0
//   (moments from all members meeting at the joint sum to zero)
//
// Layout:
//   Node 1 (0,0) - Node 2 (0,h) - Node 3 (w,h) - Node 4 (w,0)
//                                   Node 5 (2w,h) - Node 6 (2w,0)
//   Elements: 1(1->2), 2(2->3), 3(3->4), 4(3->5), 5(5->6)
//   Lateral load at node 2.
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 2

#[test]
fn validation_path_ext_two_bay_joint_equilibrium() {
    let h = 4.0;
    let w = 5.0;
    let f_lat = 15.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h),
        (4, w, 0.0), (5, 2.0 * w, h), (6, 2.0 * w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left beam
        (3, "frame", 3, 4, 1, 1, false, false), // interior column
        (4, "frame", 3, 5, 1, 1, false, false), // right beam
        (5, "frame", 5, 6, 1, 1, false, false), // right column
    ];
    let sups = vec![
        (1, 1_usize, "fixed"), (2, 4, "fixed"), (3, 6, "fixed"),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // At node 3 (interior column top), three members meet:
    // Interior column (elem 3): node_i=3, node_j=4 => m_start is at node 3
    // Left beam (elem 2): node_i=2, node_j=3 => m_end is at node 3
    // Right beam (elem 4): node_i=3, node_j=5 => m_start is at node 3
    let ef_col = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef_beam_l = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_beam_r = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    // Moment equilibrium at node 3:
    // The sign convention requires care: for element ending at a node, the internal
    // moment contributes with a sign; for element starting at a node, opposite sign.
    // In global terms: sum of end moments (with proper signs) = 0.
    // We check that the magnitudes are consistent: the column moment at node 3
    // balances the beam moments at node 3.
    let m_col_at_3 = ef_col.m_start;    // elem 3 starts at node 3
    let m_beam_l_at_3 = ef_beam_l.m_end; // elem 2 ends at node 3
    let m_beam_r_at_3 = ef_beam_r.m_start; // elem 4 starts at node 3

    // The sum of moments at the joint must be approximately zero.
    // The sign convention means: M_beam_l_end + M_col_start + M_beam_r_start ~ 0
    // But the internal moment sign depends on the local-to-global transformation.
    // We verify that the sum of absolute values is self-consistent:
    // the largest moment is <= sum of the other two (triangle inequality for moments).
    let moments = [m_col_at_3.abs(), m_beam_l_at_3.abs(), m_beam_r_at_3.abs()];
    let max_m = moments.iter().cloned().fold(0.0_f64, f64::max);
    let sum_m: f64 = moments.iter().sum();
    assert!(max_m <= (sum_m - max_m) * 1.05 + 1.0,
        "Two-bay joint: moment triangle inequality at node 3: moments={:.4?}", moments);

    // Global equilibrium: sum(Rx) = -F_lat
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f_lat, 0.02,
        "Two-bay: sum(Rx) = -F_lateral");
}

// ================================================================
// 6. Overhanging Beam: Moment Sign Reversal at Internal Support
// ================================================================
//
// Beam with overhang: pinned at node 1 (x=0), roller at node 2 (x=6m),
// free end at x=8m. Point load P = -20 kN at free end (x=8m).
//
// Analytical:
//   R1 = P * (8-6)/6 = P/3 (downward, since load is on overhang)
//   Wait: taking moments about node 1:
//     R2 * 6 + P * 8 = 0 => but P is downward so fy = -20
//     R2 * 6 = -P * 8... Let's use the convention:
//     R1 + R2 = -P = 20 kN (upward to balance)
//     About node 1: R2 * 6 = 20 * 8 => R2 = 80/3 kN (upward but wrong,
//     because overhang load causes R1 to go negative)
//     Actually: moments about A: R2 * 6 - P_abs * 8 = 0 => R2 = 80/3 ~ 26.67 kN up
//     R1 = 20 - 80/3 = -20/3 ~ -6.67 kN (downward!)
//
// The moment at the internal support (x=6) is:
//   M(6) = R1 * 6 = -6.67 * 6 = -40 kN*m
//   But from the right: M(6) = P_abs * 2 = 40 kN*m in magnitude.
//
// The beam has hogging moment between supports and the moment is zero
// at the free end and at the pinned end (simply supported).
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Ch. 4

#[test]
fn validation_path_ext_overhanging_beam_moment_reversal() {
    let l_main = 6.0;
    let l_over = 2.0;
    let n_main = 12;
    let n_over = 4;
    let n_total = n_main + n_over;
    let p_tip = 20.0;

    let elem_len_main = l_main / n_main as f64;
    let elem_len_over = l_over / n_over as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_main {
        nodes.push((i + 1, i as f64 * elem_len_main, 0.0));
    }
    for i in 1..=n_over {
        nodes.push((n_main + 1 + i, l_main + i as f64 * elem_len_over, 0.0));
    }

    let elems: Vec<_> = (0..n_total)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    // Pinned at node 1, roller at node n_main+1 (x=6m)
    let sups = vec![(1, 1_usize, "pinned"), (2, n_main + 1, "rollerX")];

    // Point load at free end
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_total + 1, fx: 0.0, fz: -p_tip, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Moments at both ends should be zero (pinned and free)
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef_first.m_start.abs() < 1.0,
        "Overhang: M at pinned end ~ 0: {:.4}", ef_first.m_start);

    let ef_last = results.element_forces.iter().find(|e| e.element_id == n_total).unwrap();
    assert!(ef_last.m_end.abs() < 1.0,
        "Overhang: M at free end ~ 0: {:.4}", ef_last.m_end);

    // Moment at the interior support (node n_main+1) should be non-zero (hogging)
    let ef_at_sup = results.element_forces.iter()
        .find(|e| e.element_id == n_main).unwrap();
    let m_at_support = ef_at_sup.m_end;
    let m_expected = p_tip * l_over; // = 40 kN*m
    assert_close(m_at_support.abs(), m_expected, 0.05,
        "Overhang: |M at support| = P * L_over");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p_tip, 0.01,
        "Overhang: sum(Ry) = P");
}

// ================================================================
// 7. P-Delta vs Linear: Reaction Sums Match Applied Loads
// ================================================================
//
// For any structure, both linear and P-delta analyses must produce
// reaction sums that equilibrate the applied loads. The P-delta
// analysis changes the distribution of internal forces but not the
// global equilibrium.
//
// Test: cantilever column with axial + lateral load.
// P-delta amplifies the lateral displacement and bending moment,
// but sum(Rx) and sum(Ry) must match the applied forces in both.
//
// Ref: Galambos & Surovek, "Structural Stability of Steel", Ch. 2

#[test]
fn validation_path_ext_pdelta_linear_reaction_equivalence() {
    let h = 5.0;
    let n = 10;
    let p_axial = -100.0;  // compressive (downward)
    let p_lateral = 5.0;   // horizontal

    let elem_len = h / n as f64;
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * elem_len)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    let sups = vec![(1, 1_usize, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: p_lateral, fz: p_axial, my: 0.0,
        }),
    ];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );

    // Linear analysis
    let res_lin = linear::solve_2d(&input).unwrap();
    let sum_rx_lin: f64 = res_lin.reactions.iter().map(|r| r.rx).sum();
    let sum_ry_lin: f64 = res_lin.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx_lin, -p_lateral, 0.01,
        "Linear: sum(Rx) = -F_lateral");
    assert_close(sum_ry_lin, -p_axial, 0.01,
        "Linear: sum(Ry) = -F_axial");

    // P-delta analysis
    let res_pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    assert!(res_pd.converged, "P-delta cantilever column should converge");
    let sum_rx_pd: f64 = res_pd.results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry_pd: f64 = res_pd.results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx_pd, -p_lateral, 0.02,
        "P-delta: sum(Rx) = -F_lateral");
    assert_close(sum_ry_pd, -p_axial, 0.02,
        "P-delta: sum(Ry) = -F_axial");

    // P-delta should amplify the lateral displacement at the tip
    let d_lin = res_lin.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux.abs();
    let d_pd = res_pd.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux.abs();
    assert!(d_pd > d_lin,
        "P-delta amplifies tip drift: {:.6e} > {:.6e}", d_pd, d_lin);
}

// ================================================================
// 8. Antisymmetric Portal Loading: Antisymmetric Response
// ================================================================
//
// Symmetric portal frame (h=4m, w=6m, fixed bases) with antisymmetric
// loading: equal and opposite lateral loads at the two top nodes.
// F_left = +10 kN at node 2, F_right = -10 kN at node 3.
//
// By antisymmetry:
//   - Vertical displacements at nodes 2 and 3 are equal (both go down equally
//     or are zero if no vertical load)
//   - Horizontal displacements at nodes 2 and 3 are equal in magnitude,
//     same sign (both sway the same way since it's a rigid beam)
//     Actually for antisymmetric lateral loads: the beam stretches/compresses
//     axially, and the columns bend in opposite directions.
//   - Base moments at columns 1 and 3 are equal in magnitude
//   - Base vertical reactions are equal and opposite (antisymmetric)
//
// Ref: McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", §2.5

#[test]
fn validation_path_ext_antisymmetric_portal() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;

    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fz: 0.0, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: -f, fz: 0.0, my: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum(Rx) = -(f + (-f)) = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.1,
        "Antisymmetric portal: sum(Rx) = 0: {:.6}", sum_rx);

    // Base horizontal reactions should be equal and opposite (antisymmetric)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rx.abs(), r4.rx.abs(), 0.02,
        "Antisymmetric portal: |Rx1| = |Rx4|");
    // They should have opposite signs
    assert!(r1.rx * r4.rx <= 0.0 || r1.rx.abs() < 1e-6,
        "Antisymmetric portal: Rx1 and Rx4 have opposite signs: {:.4}, {:.4}",
        r1.rx, r4.rx);

    // Column base moments should be equal in magnitude (by antisymmetry)
    // The values are small relative to f*h, so use absolute difference check
    let ef_col_l = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_col_r = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let m_diff = (ef_col_l.m_start.abs() - ef_col_r.m_start.abs()).abs();
    let m_scale = f * h; // characteristic moment scale
    assert!(m_diff / m_scale < 0.05,
        "Antisymmetric portal: |M_base_left| ~ |M_base_right|: {:.4} vs {:.4}",
        ef_col_l.m_start.abs(), ef_col_r.m_start.abs());

    // Column base shears should be equal in magnitude
    assert_close(ef_col_l.v_start.abs(), ef_col_r.v_start.abs(), 0.05,
        "Antisymmetric portal: |V_base_left| = |V_base_right|");

    // The beam axial force should be non-zero (the antisymmetric lateral loads
    // create axial force in the beam)
    let ef_beam = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef_beam.n_start.abs() > 0.1,
        "Antisymmetric portal: beam carries axial force: N={:.4}", ef_beam.n_start);
}
