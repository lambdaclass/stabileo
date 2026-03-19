/// Validation: Extended Moment Redistribution in Indeterminate Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 11-12
///   - Ghali, Neville & Brown, "Structural Analysis", 6th Ed., Ch. 10-11
///   - McCormac & Nelson, "Structural Analysis", 3rd Ed.
///   - Cross, H., "Analysis of Continuous Frames by Distributing Fixed-End Moments" (1930)
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", 4th Ed.
///
/// Tests verify extended moment redistribution scenarios:
///   1. Four-span continuous beam: interior moments by three-moment equation
///   2. Two-span beam with unequal loads: asymmetric redistribution
///   3. Fixed-fixed beam with point load: moment at fixed ends
///   4. Propped cantilever with point load at midspan
///   5. Three-span beam with center span loaded only (pattern loading)
///   6. Two-span beam with different span lengths and UDL
///   7. Portal frame under lateral load: antisymmetric moment pattern
///   8. Propped cantilever with triangular load: moment and reaction
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Four-Span Continuous Beam: Interior Moments
// ================================================================
//
// Four equal spans L, UDL w on all spans, pinned outer ends.
// By symmetry: M_B = M_D, M_C is the center support moment.
// From the three-moment equation for four equal spans with UDL:
//   M_B = M_D = wL^2 / 10 * (11/10) ... Using standard coefficients:
//
// For a 4-span continuous beam (all pinned supports), UDL w:
//   Three-moment equations (using symmetry M_B = M_D):
//     At B: 0*L + 2*M_B*(L+L) + M_C*L = -(wL^3/4 + wL^3/4)
//           4*M_B*L + M_C*L = -wL^3/2
//           4*M_B + M_C = -wL^2/2       ... (i)
//     At C: M_B*L + 2*M_C*(L+L) + M_D*L = -(wL^3/4 + wL^3/4)
//           M_B*L + 4*M_C*L + M_B*L = -wL^3/2   (since M_D = M_B)
//           2*M_B + 4*M_C = -wL^2/2     ... (ii)
//   From (i): M_C = -wL^2/2 - 4*M_B
//   Sub into (ii): 2*M_B + 4*(-wL^2/2 - 4*M_B) = -wL^2/2
//     2*M_B - 2*wL^2 - 16*M_B = -wL^2/2
//     -14*M_B = -wL^2/2 + 2*wL^2 = 3*wL^2/2
//     M_B = -3*wL^2/28
//   M_C = -wL^2/2 - 4*(-3*wL^2/28) = -wL^2/2 + 3*wL^2/7
//        = -7*wL^2/14 + 6*wL^2/14 = -wL^2/14
//
// So: |M_B| = |M_D| = 3*wL^2/28, |M_C| = wL^2/14
// Ref: Norris, Wilbur & Utku, Table for continuous beam coefficients

#[test]
fn validation_redistrib_ext_four_span_interior_moments() {
    let l = 6.0;
    let n_per_span = 6;
    let q: f64 = -10.0;
    let w = q.abs();

    let total_elems = n_per_span * 4;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l, l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // |M_B| = 3*wL^2/28
    let m_b_exact = 3.0 * w * l * l / 28.0;
    // |M_C| = wL^2/14
    let m_c_exact = w * l * l / 14.0;

    // Interior support B is at node (n_per_span + 1), element n_per_span ends there
    let ef_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.03,
        "Four-span M_B = 3wL^2/28");

    // Interior support C is at node (2*n_per_span + 1), element 2*n_per_span ends there
    let ef_c = results.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per_span).unwrap();
    assert_close(ef_c.m_end.abs(), m_c_exact, 0.03,
        "Four-span M_C = wL^2/14");

    // By symmetry: M_D = M_B
    let ef_d = results.element_forces.iter()
        .find(|ef| ef.element_id == 3 * n_per_span).unwrap();
    assert_close(ef_d.m_end.abs(), m_b_exact, 0.03,
        "Four-span M_D = M_B by symmetry");

    // Symmetry check: M_B ~ M_D
    assert_close(ef_b.m_end.abs(), ef_d.m_end.abs(), 0.005,
        "Four-span symmetry: M_B = M_D");
}

// ================================================================
// 2. Two-Span Beam with Unequal Loads: Asymmetric Redistribution
// ================================================================
//
// Two equal spans L, span 1 has UDL w1, span 2 has UDL w2.
// Pinned at all three supports (A, B, C).
// Three-moment equation for two spans (equal L), M_A = M_C = 0:
//   0 + 2*M_B*(L+L) + 0 = -(w1*L^3/4 + w2*L^3/4)
//   4*M_B*L = -(w1 + w2)*L^3/4
//   M_B = -(w1+w2)*L^2/16
//   |M_B| = (w1+w2)*L^2/16
//
// End reactions from statics (hogging M_B at interior support):
//   Span AB: R_A = w1*L/2 - |M_B|/L (hogging at B reduces R_A)
//   Span BC: R_C = w2*L/2 - |M_B|/L (hogging at B reduces R_C)
//   R_B = total_load - R_A - R_C
//
// Ref: Ghali & Neville, continuous beam analysis

#[test]
fn validation_redistrib_ext_two_span_unequal_loads() {
    let l = 8.0;
    let n_per_span = 8;
    let q1: f64 = -10.0; // span 1
    let q2: f64 = -20.0; // span 2
    let w1 = q1.abs();
    let w2 = q2.abs();

    let mut loads: Vec<SolverLoad> = Vec::new();
    // Span 1 loads
    for i in 1..=n_per_span {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q1, q_j: q1, a: None, b: None,
        }));
    }
    // Span 2 loads
    for i in (n_per_span + 1)..=(2 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q2, q_j: q2, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // |M_B| = (w1 + w2)*L^2/16
    let m_b_exact = (w1 + w2) * l * l / 16.0;

    let ef_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.03,
        "Two-span unequal loads: M_B = (w1+w2)*L^2/16");

    // End reactions:
    // Span AB: sum moments about B => R_A*L = w1*L^2/2 - |M_B|
    //   R_A = w1*L/2 - |M_B|/L
    let r_a_exact = w1 * l / 2.0 - m_b_exact / l;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz, r_a_exact, 0.03,
        "Two-span unequal loads: R_A");

    // Span BC: sum moments about B => R_C*L = w2*L^2/2 - |M_B|
    //   R_C = w2*L/2 - |M_B|/L
    let r_c = results.reactions.iter()
        .find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    let r_c_exact = w2 * l / 2.0 - m_b_exact / l;
    assert_close(r_c.rz, r_c_exact, 0.03,
        "Two-span unequal loads: R_C");

    // Global equilibrium: sum reactions = total load
    let total_load = w1 * l + w2 * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Two-span unequal loads: global equilibrium");
}

// ================================================================
// 3. Fixed-Fixed Beam with Concentrated Point Load at Midspan
// ================================================================
//
// Fixed-fixed beam, length L, point load P at midspan.
// Fixed-end moments: M_A = M_B = PL/8
// Midspan moment: PL/8 (sagging) = PL/4 - PL/8
// Reactions: R_A = R_B = P/2 (by symmetry)
// Ref: Hibbeler, Table 12-1

#[test]
fn validation_redistrib_ext_fixed_fixed_point_load() {
    let l = 8.0;
    let n = 8;
    let p: f64 = -40.0; // downward point load at midspan

    // Apply point load at the midspan node
    let mid_node = n / 2 + 1; // node at L/2
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: p, my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let p_abs: f64 = p.abs();

    // Fixed-end moments: M = PL/8
    let m_exact = p_abs * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.my.abs(), m_exact, 0.02,
        "Fixed-fixed point load: M_A = PL/8");
    assert_close(r_end.my.abs(), m_exact, 0.02,
        "Fixed-fixed point load: M_B = PL/8");

    // Reactions: R_A = R_B = P/2
    assert_close(r1.rz, p_abs / 2.0, 0.02,
        "Fixed-fixed point load: R_A = P/2");
    assert_close(r_end.rz, p_abs / 2.0, 0.02,
        "Fixed-fixed point load: R_B = P/2");

    // Symmetry of end moments
    assert_close(r1.my.abs(), r_end.my.abs(), 0.005,
        "Fixed-fixed point load: symmetry M_A = M_B");
}

// ================================================================
// 4. Propped Cantilever with Point Load at Midspan
// ================================================================
//
// Fixed at A, rollerX at B, point load P at midspan (L/2).
// Using the force method (remove R_B, find compatibility):
//   Cantilever deflection at B due to P at L/2:
//     delta_P = P*(L/2)^2*(3L - L/2) / (6EI) = 5PL^3/(48EI)
//   Flexibility at B: f_BB = L^3/(3EI)
//   R_B = delta_P / f_BB = 5PL^3/(48EI) / (L^3/(3EI)) = 5P/16
//   R_A = P - R_B = P - 5P/16 = 11P/16
//   M_A: sum moments about A:
//     M_A + R_B*L - P*(L/2) = 0
//     M_A = PL/2 - 5PL/16 = 8PL/16 - 5PL/16 = 3PL/16
//
// Ref: McCormac & Nelson, propped cantilever with concentrated load

#[test]
fn validation_redistrib_ext_propped_cantilever_point_load() {
    let l = 10.0;
    let n = 10;
    let p: f64 = -32.0; // downward

    let mid_node = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_node, fx: 0.0, fz: p, my: 0.0,
    })];

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let p_abs: f64 = p.abs();

    // M_A = 3PL/16
    let m_a_exact = 3.0 * p_abs * l / 16.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.my.abs(), m_a_exact, 0.02,
        "Propped cantilever point load: M_A = 3PL/16");

    // R_A = 11P/16
    let r_a_exact = 11.0 * p_abs / 16.0;
    assert_close(r_a.rz, r_a_exact, 0.02,
        "Propped cantilever point load: R_A = 11P/16");

    // R_B = 5P/16
    let r_b_exact = 5.0 * p_abs / 16.0;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.rz, r_b_exact, 0.02,
        "Propped cantilever point load: R_B = 5P/16");

    // Equilibrium: R_A + R_B = P
    assert_close(r_a.rz + r_b.rz, p_abs, 0.01,
        "Propped cantilever point load: equilibrium");
}

// ================================================================
// 5. Three-Span Beam with Center Span Loaded Only (Pattern Loading)
// ================================================================
//
// Three equal spans L, UDL w on center span only, pinned at all supports.
// By three-moment equation (A and D are exterior pinned, M_A = M_D = 0):
//   At B: M_A*L + 2*M_B*(L+L) + M_C*L = -6*[0 + w*L^3/(24*L)] * ...
//
// For three-moment equation with load on span 2 only:
//   At B: 0 + 2*M_B*(2L) + M_C*L = -(0 + wL^3/4)
//         4*M_B*L + M_C*L = -wL^3/4
//         4*M_B + M_C = -wL^2/4         ... (i)
//   At C: M_B*L + 2*M_C*(2L) + 0 = -(wL^3/4 + 0)
//         M_B*L + 4*M_C*L = -wL^3/4
//         M_B + 4*M_C = -wL^2/4         ... (ii)
//   By symmetry (load is on center span): M_B = M_C
//   From (i): 4*M_B + M_B = -wL^2/4 => 5*M_B = -wL^2/4
//   M_B = M_C = -wL^2/20
//   |M_B| = |M_C| = wL^2/20
//
// Ref: Norris, Wilbur & Utku, pattern loading of continuous beams

#[test]
fn validation_redistrib_ext_pattern_loading_center_span() {
    let l = 6.0;
    let n_per_span = 6;
    let q: f64 = -15.0;
    let w = q.abs();

    // Only load the center span (elements n_per_span+1 to 2*n_per_span)
    let mut loads: Vec<SolverLoad> = Vec::new();
    for i in (n_per_span + 1)..=(2 * n_per_span) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[l, l, l], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // |M_B| = |M_C| = wL^2/20
    let m_exact = w * l * l / 20.0;

    let ef_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    let ef_c = results.element_forces.iter()
        .find(|ef| ef.element_id == 2 * n_per_span).unwrap();

    assert_close(ef_b.m_end.abs(), m_exact, 0.03,
        "Pattern loading center span: M_B = wL^2/20");
    assert_close(ef_c.m_end.abs(), m_exact, 0.03,
        "Pattern loading center span: M_C = wL^2/20");

    // Symmetry: M_B = M_C
    assert_close(ef_b.m_end.abs(), ef_c.m_end.abs(), 0.005,
        "Pattern loading: M_B = M_C by symmetry");

    // Exterior spans have no load, so end reactions at A and D
    // should be small (only due to redistribution from center span)
    // R_A = -M_B / L (upward from hogging at B)
    // Since M_B is hogging, the reaction at A must balance:
    // For span AB (no load): R_A*L + M_B = 0 => R_A = -M_B/L = wL/20 (upward)
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_a_exact = w * l / 20.0;
    assert_close(r_a.rz.abs(), r_a_exact, 0.05,
        "Pattern loading: R_A from redistribution");
}

// ================================================================
// 6. Two-Span Beam with Different Span Lengths (L1=6, L2=9)
// ================================================================
//
// Two spans of different length, UDL w on both.
// Three-moment equation:
//   0*L1 + 2*M_B*(L1+L2) + 0*L2 = -(w*L1^3/4 + w*L2^3/4)
//   2*M_B*(L1+L2) = -w*(L1^3 + L2^3)/4
//   M_B = -w*(L1^3 + L2^3) / (8*(L1+L2))
//
// Ref: Ghali & Neville, three-moment equation

#[test]
fn validation_redistrib_ext_two_span_different_lengths() {
    let l1 = 6.0;
    let l2 = 9.0;
    let n_per_span = 6;
    let q: f64 = -10.0;
    let w = q.abs();

    let total_elems = n_per_span * 2;
    let loads: Vec<SolverLoad> = (1..=total_elems)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = make_continuous_beam(&[l1, l2], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // M_B = w*(L1^3 + L2^3) / (8*(L1+L2))
    let l1_cubed: f64 = l1.powi(3);
    let l2_cubed: f64 = l2.powi(3);
    let m_b_exact = w * (l1_cubed + l2_cubed) / (8.0 * (l1 + l2));

    let ef_b = results.element_forces.iter()
        .find(|ef| ef.element_id == n_per_span).unwrap();
    assert_close(ef_b.m_end.abs(), m_b_exact, 0.03,
        "Two-span different lengths: M_B = w(L1^3+L2^3)/(8(L1+L2))");

    // End reactions from statics:
    // For span AB: R_A*L1 = w*L1^2/2 - M_B => R_A = wL1/2 - M_B/L1
    let r_a_exact = w * l1 / 2.0 - m_b_exact / l1;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz, r_a_exact, 0.03,
        "Two-span different lengths: R_A");

    // For span BC: sum moments about B => R_C*L2 = w*L2^2/2 - |M_B|
    //   R_C = wL2/2 - |M_B|/L2
    let r_c_exact = w * l2 / 2.0 - m_b_exact / l2;
    let r_c = results.reactions.iter()
        .find(|r| r.node_id == 2 * n_per_span + 1).unwrap();
    assert_close(r_c.rz, r_c_exact, 0.03,
        "Two-span different lengths: R_C");

    // Global equilibrium
    let total_load = w * (l1 + l2);
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01,
        "Two-span different lengths: global equilibrium");
}

// ================================================================
// 7. Portal Frame Under Lateral Load: Antisymmetric Bending
// ================================================================
//
// Fixed-base portal frame, height h, width w, lateral load H at top-left.
// By portal method (exact for single-story single-bay):
//   Both columns have inflection points at mid-height.
//   Shear per column: H/2 each.
//   Column base moments: M_base = H*h/(2*2) ... No, for fixed base:
//
// For a single-bay fixed-base portal frame under lateral load H:
//   Using antisymmetry and compatibility:
//   Assuming equal stiffness columns and beam, the base moments are:
//   M_base1 = M_base4 = H*h/4 (for infinitely stiff beam)
//   But for finite beam stiffness, a more precise formula depends on
//   the relative stiffness ratio k = (I_beam/w) / (I_col/h).
//
// For equal cross sections (same I) with beam span w and column height h:
//   k = (I/w) / (I/h) = h/w
//   Using slope-deflection:
//   The beam end moments equal column top moments (equilibrium at joint).
//   By antisymmetry: lateral sway theta, joint rotations equal and opposite.
//
// For the special case h = w (k = 1):
//   M_base = H*h/6, M_top_column = H*h/12 ... wait, this needs careful derivation.
//
// Simpler: just verify equilibrium and the base moment sum.
// Sum of base moments + H*h = sum of base moments at top = 0
// Actually for overall equilibrium of the frame:
//   Overturning moment about base = H*h
//   Resisted by: M_base1 + M_base4 + (R_4y - R_1y)*w
//   where R_4y - R_1y is the vertical couple from columns.
//
// For a fixed-base portal under H at the left joint:
//   Column base moment total: M_1 + M_4 ... these depend on stiffness.
//   Simple check: Sum moments about left base:
//     H*h = M_base1 + M_base4 + R_4y * w
//     (with sign conventions)
//
// We just verify: sum of all base reaction moments + vertical reaction couple
// equals the overturning moment H*h. And verify column shears sum to H.
//
// Ref: Hibbeler Ch.12, Portal method; Ghali & Neville, rigid frames

#[test]
fn validation_redistrib_ext_portal_frame_lateral_load() {
    let h = 4.0;
    let w_span = 6.0;
    let h_load = 30.0; // lateral load at top-left node

    let input = make_portal_frame(h, w_span, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Node 1 is base-left (fixed), node 4 is base-right (fixed)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Horizontal equilibrium: R1_x + R4_x + H = 0 (applied H is positive)
    // => R1_x + R4_x = -H (reactions oppose the load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx + h_load, 0.0, 0.01,
        "Portal lateral: horizontal equilibrium");

    // Global moment equilibrium about node 1 base (0,0):
    //   Applied moment about base-left: H * h (lateral load at height h)
    //   Reaction moments: M1 + M4 + R4_y * w_span
    //   These must be equal: M1 + M4 + R4_y * w = H * h
    let overturning = h_load * h;
    let resisting = r1.my + r4.my + r4.rz * w_span;
    assert_close(resisting, overturning, 0.02,
        "Portal lateral: moment equilibrium about base-left");

    // Vertical equilibrium: sum of vertical reactions = 0 (no vertical applied load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01,
        "Portal lateral: vertical equilibrium, sum_ry={:.6}", sum_ry);

    // By antisymmetry, the two base moments should be approximately equal
    assert_close(r1.my, r4.my, 0.02,
        "Portal lateral: approximate symmetry of base moments");
}

// ================================================================
// 8. Propped Cantilever with Triangular Load
// ================================================================
//
// Fixed at A, rollerX at B, triangular load from 0 at A to w at B.
// The load intensity at distance x from A is q(x) = w*x/L.
// Total load W = wL/2, centroid at 2L/3 from A.
//
// By the force method (remove R_B as redundant, solve compatibility):
//   Cantilever tip deflection under triangular load q(x) = w*x/L:
//     delta_B = 11*w*L^4 / (120*EI)
//   Flexibility at B due to unit upward force:
//     f_BB = L^3 / (3*EI)
//   R_B = delta_B / f_BB = 11*w*L / 40
//   R_A = wL/2 - 11wL/40 = 20wL/40 - 11wL/40 = 9wL/40
//
//   M_A from moment equilibrium about A:
//     M_A + R_B*L - wL/2*(2L/3) = 0
//     M_A = wL^2/3 - 11wL^2/40 = (40wL^2 - 33wL^2)/120 = 7wL^2/120
//
// Verification: R_A + R_B = 9wL/40 + 11wL/40 = 20wL/40 = wL/2 (checks out)
//
// Ref: Gere & Timoshenko, "Mechanics of Materials", propped cantilever tables

#[test]
fn validation_redistrib_ext_propped_cantilever_triangular_load() {
    let l = 10.0;
    let n = 20; // more elements for better triangular load approximation
    let w_max: f64 = 12.0; // max intensity at B

    // Triangular load: zero at A (node 1), w_max at B (node n+1)
    // Element i goes from (i-1)*L/n to i*L/n
    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| {
            let q_start = -w_max * (i - 1) as f64 / n as f64; // negative = downward
            let q_end = -w_max * i as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i, q_i: q_start, q_j: q_end, a: None, b: None,
            })
        })
        .collect();

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let w = w_max;

    // R_B = 11wL/40
    let r_b_exact = 11.0 * w * l / 40.0;
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_b.rz, r_b_exact, 0.03,
        "Propped cantilever triangular: R_B = 11wL/40");

    // R_A = 9wL/40
    let r_a_exact = 9.0 * w * l / 40.0;
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz, r_a_exact, 0.03,
        "Propped cantilever triangular: R_A = 9wL/40");

    // M_A = 7wL^2/120 (hogging)
    let m_a_exact = 7.0 * w * l * l / 120.0;
    assert_close(r_a.my.abs(), m_a_exact, 0.03,
        "Propped cantilever triangular: M_A = 7wL^2/120");

    // Equilibrium: R_A + R_B = total load = wL/2
    let total_load = w * l / 2.0;
    assert_close(r_a.rz + r_b.rz, total_load, 0.01,
        "Propped cantilever triangular: vertical equilibrium");
}
