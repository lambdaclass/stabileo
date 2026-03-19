/// Validation: Extended Gerber Beam Tests
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5 (Gerber beams)
///   - Ghali/Neville, "Structural Analysis", 7th Ed., Ch. 4
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 5
///   - Leet, Uang, Gilbert, "Fundamentals of Structural Analysis", 5th Ed., Ch. 3
///
/// A Gerber beam uses internal hinges to create a statically determinate
/// structure from what would otherwise be indeterminate. Key properties:
///   - Bending moment at every internal hinge is zero
///   - Shear is continuous across the hinge
///   - Reactions can be found by statics alone (equilibrium + hinge conditions)
///
/// Tests:
///   1. Gerber cantilever-roller with hinge: analytical reactions & deflection
///   2. Asymmetric 2-span Gerber beam (unequal spans): exact reactions
///   3. Gerber beam with point load on suspended span: exact reaction & moment
///   4. Overhanging Gerber beam with hinge: reactions from statics
///   5. Gerber beam: midspan deflection compared to analytical formula
///   6. Two-hinge Gerber beam with point loads: verify superposition
///   7. Gerber beam rotation discontinuity at hinge
///   8. Gerber beam: moment diagram shape (zero at hinge, parabolic spans)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Gerber cantilever-roller with hinge: analytical reactions
// ================================================================
//
// Fixed end at A (x=0), roller at C (x=10), hinge at B (x=6).
// UDL q=10 kN/m over entire length.
//
// The hinge at B means M_B = 0. Taking the free body of the right
// segment (B to C, length b=4m):
//   Sum moments about B: R_C * 4 - 10 * 4 * 2 = 0  =>  R_C = 20 kN
// For the full beam (total load = 10 * 10 = 100 kN):
//   Sum Fy: R_A + R_C = 100  =>  R_A = 80 kN
// Fixed-end moment at A (sum moments about A):
//   M_A + R_C * 10 - 10 * 10 * 5 = 0  =>  M_A = 500 - 200 = 300 kN.m
//   (positive = counterclockwise, which is the reaction restraining clockwise load)
//
// In the solver, the fixed support provides (rx, ry, mz).
// The reaction moment sign may be positive (counterclockwise restoring).

#[test]
fn gerber_fixed_roller_hinge_reactions() {
    let q = 10.0;
    let a_len = 6.0; // A to B
    let b_len = 4.0; // B to C
    let l_total = a_len + b_len;

    // Nodes every 2m: 1(0), 2(2), 3(4), 4(6=hinge), 5(8), 6(10)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 6.0, 0.0),
        (5, 8.0, 0.0),
        (6, 10.0, 0.0),
    ];
    // Hinge at node 4: elem 3 hinge_end, elem 4 hinge_start
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, true),  // hinge_end at node 4
        (4, "frame", 4, 5, 1, 1, true, false),   // hinge_start at node 4
        (5, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, 6_usize, "rollerX"),
    ];
    let mut loads = Vec::new();
    for i in 1..=5 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: R_C = q * b^2 / (2 * b) = q * b / 2 ... wait, let's redo carefully.
    // Right segment B-C (length b=4): sum M about B:
    //   R_C * b - q * b * (b/2) = 0  =>  R_C = q*b/2 = 10*4/2 = 20
    let r_c_exact = q * b_len / 2.0; // 20 kN

    // Full beam: R_A + R_C = q * L => R_A = q*L - R_C = 100 - 20 = 80
    let r_a_exact = q * l_total - r_c_exact; // 80 kN

    // Fixed-end moment at A: M_A = q*L*L/2 - R_C*L = 10*10*5 - 20*10 = 300
    let m_a_exact: f64 = q * l_total * l_total / 2.0 - r_c_exact * l_total; // 300 kN.m

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 6).unwrap();

    assert_close(r_a.rz, r_a_exact, 0.02, "Gerber fixed-roller: R_A");
    assert_close(r_c.rz, r_c_exact, 0.02, "Gerber fixed-roller: R_C");
    assert_close(r_a.my, m_a_exact, 0.02, "Gerber fixed-roller: M_A");

    // Hinge moment must be zero
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(ef3.m_end.abs() < 0.5, "Hinge moment (elem 3 end) should be ~0, got {:.4}", ef3.m_end);
    assert!(ef4.m_start.abs() < 0.5, "Hinge moment (elem 4 start) should be ~0, got {:.4}", ef4.m_start);
}

// ================================================================
// 2. Asymmetric 2-span Gerber beam (unequal spans): exact reactions
// ================================================================
//
// Supports: pinned at A (x=0), rollerX at B (x=4), rollerX at C (x=10).
// Hinge at D (x=7, mid of span 2). UDL q=12 kN/m on entire beam.
//
// Free body D-C (length 3m):
//   R_C * 3 - 12 * 3 * 1.5 = 0  =>  R_C = 18 kN
// Free body A-D (length 7m):
//   Sum M about A: R_B * 4 - 12 * 7 * 3.5 + R_C_contribution_from_hinge = 0
//   Wait, D is on the right of B. We need to use the hinge condition properly.
//
//   Full beam equilibrium: R_A + R_B + R_C = q * 10 = 120
//   Sum moments about A for full beam:
//     R_B * 4 + R_C * 10 = 12 * 10 * 5 = 600
//   We know R_C = 18, so:
//     R_B * 4 + 18 * 10 = 600  =>  R_B * 4 = 420  =>  R_B = 105
//     R_A = 120 - 105 - 18 = -3 kN (upward is positive, so R_A = -3 means downward)
//
// Wait, that gives a negative R_A. Let me re-verify with the hinge condition.
// Free body right of hinge D (D to C, length = 3m):
//   V_D (shear at hinge going right) + R_C - q*3 = 0
//   Sum M about D: R_C * 3 - 12*3*1.5 = 0 => R_C = 18. Correct.
//
// Free body left of hinge D (A to D, length = 7m):
//   R_A + R_B - q*7 + V_D_left = 0  where V_D_left = -V_D_right
//   V_D_right = q*3 - R_C = 36 - 18 = 18, so V_D_left = -18... Hmm.
//   Actually at the hinge, M=0 but shear is transmitted. Let me just use
//   the M=0 condition at D for the left segment.
//   Sum M about D for left segment (A to D):
//     R_A * 7 + R_B * 3 - 12 * 7 * 3.5 = 0
//     R_A * 7 + R_B * 3 = 294  ... (i)
//   Global moment about A:
//     R_B * 4 + R_C * 10 = 600
//     R_B * 4 = 600 - 180 = 420  =>  R_B = 105  ... (ii)
//   From (i): R_A * 7 = 294 - 105*3 = 294 - 315 = -21 => R_A = -3
//
// R_A = -3 kN means the pinned support actually pushes downward.
// This is physically possible in a Gerber beam with the given geometry.

#[test]
fn gerber_asymmetric_2span_exact_reactions() {
    let q = 12.0;

    // Nodes: 1(0), 2(2), 3(4=support B), 4(7=hinge D), 5(10=support C)
    // Use denser mesh: nodes every 1m for accuracy
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 1.0, 0.0),
        (3, 2.0, 0.0),
        (4, 3.0, 0.0),
        (5, 4.0, 0.0),  // support B
        (6, 5.0, 0.0),
        (7, 6.0, 0.0),
        (8, 7.0, 0.0),  // hinge D
        (9, 8.0, 0.0),
        (10, 9.0, 0.0),
        (11, 10.0, 0.0), // support C
    ];
    let elems = vec![
        (1,  "frame", 1,  2,  1, 1, false, false),
        (2,  "frame", 2,  3,  1, 1, false, false),
        (3,  "frame", 3,  4,  1, 1, false, false),
        (4,  "frame", 4,  5,  1, 1, false, false),
        (5,  "frame", 5,  6,  1, 1, false, false),
        (6,  "frame", 6,  7,  1, 1, false, false),
        (7,  "frame", 7,  8,  1, 1, false, true),  // hinge_end at node 8
        (8,  "frame", 8,  9,  1, 1, true,  false),  // hinge_start at node 8
        (9,  "frame", 9,  10, 1, 1, false, false),
        (10, "frame", 10, 11, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize,  "pinned"),
        (2, 5_usize,  "rollerX"),   // B at x=4
        (3, 11_usize, "rollerX"),   // C at x=10
    ];
    let mut loads = Vec::new();
    for i in 1..=10 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical results derived above
    let r_a_exact = -3.0;
    let r_b_exact = 105.0;
    let r_c_exact = 18.0;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 11).unwrap();

    assert_close(r_a.rz, r_a_exact, 0.05, "Asymmetric Gerber: R_A = -3");
    assert_close(r_b.rz, r_b_exact, 0.02, "Asymmetric Gerber: R_B = 105");
    assert_close(r_c.rz, r_c_exact, 0.02, "Asymmetric Gerber: R_C = 18");

    // Global equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * 10.0, 0.01, "Asymmetric Gerber: sum Ry = qL");

    // Hinge moment at node 8 must be zero
    let ef7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    let ef8 = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    assert!(ef7.m_end.abs() < 0.5, "Hinge at D: m_end elem 7 ~ 0, got {:.4}", ef7.m_end);
    assert!(ef8.m_start.abs() < 0.5, "Hinge at D: m_start elem 8 ~ 0, got {:.4}", ef8.m_start);
}

// ================================================================
// 3. Gerber beam with point load: exact reactions
// ================================================================
//
// 2-span Gerber beam with 3 supports and 1 hinge.
// Supports: pinned at A(x=0), rollerX at B(x=6), rollerX at C(x=12).
// Internal hinge at H(x=3). Point load P=24 kN at x=9 (midspan of span 2).
//
// Free body right of hinge H (x=3 to x=12), supports at B(x=6) and C(x=12):
// This is a beam from x=3 to x=12 with M=0 at x=3, P=24 at x=9.
//   Sum M about H: R_B * 3 + R_C * 9 - P * 6 = 0
//   Sum M about B: -V_H*3 + R_C * 6 - P * 3 = 0  (V_H is shear from left at hinge)
// But V_H is unknown. Better: sum M about H for the LEFT segment.
//
// Left segment (A to H, x=0 to x=3), no applied load, M_H = 0:
//   Sum M about H: R_A * 3 = 0  =>  R_A = 0  (no load, no moment transfer)
//   Sum Fy: R_A + V_H = 0  =>  V_H = 0
//
// Right segment (H to C, x=3 to x=12), M=0 at H, V=0 at H, supports at B(6) and C(12):
//   This is a 2-support beam from B(6) to C(12) with overhang from 3 to 6.
//   No load on overhang (V_H=0), point load P at x=9.
//   Sum M about B: R_C * 6 - P * 3 = 0  =>  R_C = 24*3/6 = 12
//   Sum Fy: R_B + R_C = P  =>  R_B = 24 - 12 = 12
//
// Actually R_A = 0 because the left segment has no load and the hinge
// prevents moment transfer. The point load is entirely carried by span 2.

#[test]
fn gerber_point_load_reactions() {
    let p = 24.0;

    // Nodes every 3m: 1(0), 2(3=hinge), 3(6=B), 4(9=P), 5(12=C)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),   // hinge
        (3, 6.0, 0.0),   // support B
        (4, 9.0, 0.0),   // point load
        (5, 12.0, 0.0),  // support C
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fz: -p,
        my: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical: R_A = 0, R_B = 12, R_C = 12
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert!(r_a.rz.abs() < 0.5, "Gerber point load: R_A ~ 0, got {:.4}", r_a.rz);
    assert_close(r_b.rz, 12.0, 0.02, "Gerber point load: R_B = 12");
    assert_close(r_c.rz, 12.0, 0.02, "Gerber point load: R_C = 12");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "Gerber point load: sum Ry = P");

    // Moment at hinge = 0
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef1.m_end.abs() < 0.5, "Hinge moment (elem 1 end) ~ 0, got {:.4}", ef1.m_end);
    assert!(ef2.m_start.abs() < 0.5, "Hinge moment (elem 2 start) ~ 0, got {:.4}", ef2.m_start);

    // Max moment at point load: M = R_C * 3 = 12 * 3 = 36 kN.m
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef4.m_start.abs(), 36.0, 0.02, "Gerber point load: M at load = 36");
}

// ================================================================
// 4. Overhanging Gerber beam with UDL: reactions from statics
// ================================================================
//
// 2-span beam with overhang:
// Supports: pinned at A(x=0), rollerX at B(x=6), rollerX at C(x=12).
// Overhang from C to D(x=15). Hinge at H(x=9, midspan of span 2).
// UDL q=10 kN/m on entire beam (0 to 15).
//
// Free body right of hinge H (x=9 to x=15):
//   Support C at x=12, free end D at x=15.
//   UDL from 9 to 15 (6m), total = 60 kN at centroid x=12.
//   Sum M about H (x=9): R_C * 3 - 60 * 3 = 0  =>  R_C = 60 kN
//   Shear at H from right: V_H = 60 - R_C = 60 - 60 = 0 kN
//
// Free body left of hinge (x=0 to x=9):
//   UDL from 0 to 9 (9m), total = 90 kN at centroid x=4.5.
//   Supports at A(0) and B(6). M_H = 0. Shear from right = 0.
//   Sum M about H: R_A * 9 + R_B * 3 - 90 * 4.5 = 0
//     9*R_A + 3*R_B = 405  ...(i)
//   Sum Fy: R_A + R_B = 90  ...(ii) (V_H = 0)
//   From (ii): R_B = 90 - R_A. Sub into (i):
//     9*R_A + 3*(90 - R_A) = 405 => 6*R_A + 270 = 405 => R_A = 22.5
//     R_B = 90 - 22.5 = 67.5
//
// Check global: R_A + R_B + R_C = 22.5 + 67.5 + 60 = 150 = q * 15. Correct.

#[test]
fn gerber_overhanging_hinge_reactions() {
    let q = 10.0;

    // Nodes every 3m: 1(0), 2(3), 3(6=B), 4(9=hinge), 5(12=C), 6(15=D)
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),   // support B
        (4, 9.0, 0.0),   // hinge H
        (5, 12.0, 0.0),  // support C
        (6, 15.0, 0.0),  // free end D
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, true),  // hinge_end at node 4
        (4, "frame", 4, 5, 1, 1, true, false),   // hinge_start at node 4
        (5, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),   // A at x=0
        (2, 3_usize, "rollerX"),  // B at x=6
        (3, 5_usize, "rollerX"),  // C at x=12
    ];
    let mut loads = Vec::new();
    for i in 1..=5 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions
    let r_a_exact = 22.5;
    let r_b_exact = 67.5;
    let r_c_exact = 60.0;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(r_a.rz, r_a_exact, 0.02, "Overhanging Gerber: R_A = 22.5");
    assert_close(r_b.rz, r_b_exact, 0.02, "Overhanging Gerber: R_B = 67.5");
    assert_close(r_c.rz, r_c_exact, 0.02, "Overhanging Gerber: R_C = 60");

    // Global equilibrium: R_A + R_B + R_C = q * 15 = 150
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * 15.0, 0.01, "Overhanging Gerber: sum Ry = 150");

    // Hinge moment at node 4 (x=9) = 0
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(ef3.m_end.abs() < 0.5, "Overhang hinge: m_end elem 3 ~ 0, got {:.4}", ef3.m_end);
    assert!(ef4.m_start.abs() < 0.5, "Overhang hinge: m_start elem 4 ~ 0, got {:.4}", ef4.m_start);
}

// ================================================================
// 5. Gerber beam: midspan deflection vs SS beam deflection
// ================================================================
//
// Compare deflection of span 2 in a Gerber beam to a simple beam.
//
// Gerber beam: A(x=0, pinned), B(x=6, rollerX), C(x=12, rollerX).
// Hinge at B (x=6), at support. When hinges are at both sides of an
// interior support, each span behaves independently as a SS beam.
// We use hinge_end on elem going into B and hinge_start on elem leaving B.
//
// For a SS beam with UDL, midspan deflection:
//   delta = 5 * q * L^4 / (384 * E * I)
//
// With E_eff = E * 1000 (since E is in MPa and solver multiplies by 1000):
//   delta = 5 * q * L^4 / (384 * E_eff * I)

#[test]
fn gerber_hinges_at_support_deflection_matches_ss() {
    let q = 10.0;
    let l_span: f64 = 6.0;
    let e_eff: f64 = E * 1000.0;

    // 2-span beam, each span 6m, 4 elements per span
    let n_per_span = 4;
    let elem_len = l_span / n_per_span as f64; // 1.5m

    let mut nodes = Vec::new();
    for i in 0..=(2 * n_per_span) {
        nodes.push((i + 1, i as f64 * elem_len, 0.0));
    }
    // Total 9 nodes: 1(0), 2(1.5), 3(3), 4(4.5), 5(6=B), 6(7.5), 7(9=mid span2), 8(10.5), 9(12)
    let n_total = 2 * n_per_span;
    let mut elems = Vec::new();
    for i in 0..n_total {
        let hinge_end = i == (n_per_span - 1);   // elem 4: hinge_end at node 5 (x=6, support B)
        let hinge_start = i == n_per_span;         // elem 5: hinge_start at node 5
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, hinge_start, hinge_end));
    }
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, (n_per_span + 1) as usize, "rollerX"),  // node 5, x=6
        (3, (2 * n_per_span + 1) as usize, "rollerX"),  // node 9, x=12
    ];
    let mut loads = Vec::new();
    for i in 1..=(n_total as usize) {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan of span 2: node 7 (x=9)
    let mid_node = n_per_span + 1 + n_per_span / 2; // 5 + 2 = 7
    let mid_d = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();

    // SS beam deflection formula
    let delta_ss = 5.0 * q * l_span.powi(4) / (384.0 * e_eff * IZ);

    assert_close(
        mid_d.uz.abs(), delta_ss, 0.05,
        "Gerber independent span deflection matches SS formula"
    );
}

// ================================================================
// 6. Two-hinge Gerber beam with point loads: verify superposition
// ================================================================
//
// 3-span symmetric beam: A(x=0), B(x=6), C(x=12), D(x=18).
// Hinges at x=3 and x=15. Point loads P=30 kN at midspan of each outer span
// (x=3 = hinge location, and x=15 = hinge location).
//
// Actually, load at the hinge is tricky. Let me put loads elsewhere.
//
// Geometry: A(x=0, pinned), B(x=6, rollerX), C(x=12, rollerX), D(x=18, rollerX).
// Hinges at x=3 and x=15. Point load P1=20 kN at x=3, P2=20 kN at x=15.
//
// By symmetry, the structure and loading are symmetric about x=9.
// So: R_A = R_D and R_B = R_C.
// Global equilibrium: 2*R_A + 2*R_B = 40
//
// Let me use UDL for simplicity and test superposition differently.
//
// Better approach: Apply load case 1 (P=20 at x=4.5, midspan of span 1) alone,
// apply load case 2 (P=20 at x=13.5, midspan of span 3) alone,
// apply combined, verify that combined reactions = sum of individual.
// This tests linearity + superposition through Gerber hinges.

#[test]
fn gerber_3span_two_hinges_superposition() {
    // Build the 3-span Gerber beam geometry
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),   // hinge 1
        (3, 6.0, 0.0),   // support B
        (4, 9.0, 0.0),
        (5, 12.0, 0.0),  // support C
        (6, 15.0, 0.0),  // hinge 2
        (7, 18.0, 0.0),  // support D
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, true),  // hinge_end at node 6
        (6, "frame", 6, 7, 1, 1, true, false),   // hinge_start at node 6
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
        (4, 7_usize, "rollerX"),
    ];

    // Load case 1: P=20 at x=4.5 => We don't have a node there.
    // Let's load at node 4 (x=9) for case 1 and use UDL on span 1 for case 2.
    // Or just use nodal loads at existing nodes.

    // Case 1: P=20 at node 4 (x=9, midspan of span 2)
    let loads_1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fz: -20.0, my: 0.0,
    })];
    // Case 2: P=15 at node 1 (x=0)... no, that's at a support.
    // Case 2: P=15 at node 4 (x=9) + P=10 at node 2 (x=3)
    // Actually the simplest superposition test: case A + case B = case AB
    let loads_2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fz: -15.0, my: 0.0,
    })];
    // Combined
    let loads_combined = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -20.0, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fz: -15.0, my: 0.0,
        }),
    ];

    let input_1 = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)], elems.clone(), sups.clone(), loads_1);
    let input_2 = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)], elems.clone(), sups.clone(), loads_2);
    let input_c = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads_combined);

    let res_1 = linear::solve_2d(&input_1).unwrap();
    let res_2 = linear::solve_2d(&input_2).unwrap();
    let res_c = linear::solve_2d(&input_c).unwrap();

    // For each support node, check R_combined = R_1 + R_2
    for &nid in &[1_usize, 3, 5, 7] {
        let ry_1 = res_1.reactions.iter().find(|r| r.node_id == nid).unwrap().rz;
        let ry_2 = res_2.reactions.iter().find(|r| r.node_id == nid).unwrap().rz;
        let ry_c = res_c.reactions.iter().find(|r| r.node_id == nid).unwrap().rz;
        assert_close(ry_c, ry_1 + ry_2, 0.02,
            &format!("Superposition: Ry at node {} combined = sum", nid));
    }

    // Also check displacements superpose
    for &nid in &[2_usize, 4, 6] {
        let uy_1 = res_1.displacements.iter().find(|d| d.node_id == nid).unwrap().uz;
        let uy_2 = res_2.displacements.iter().find(|d| d.node_id == nid).unwrap().uz;
        let uy_c = res_c.displacements.iter().find(|d| d.node_id == nid).unwrap().uz;
        assert_close(uy_c, uy_1 + uy_2, 0.02,
            &format!("Superposition: uy at node {} combined = sum", nid));
    }
}

// ================================================================
// 7. Gerber beam rotation discontinuity at hinge
// ================================================================
//
// At an internal hinge, rotations of adjacent elements are NOT equal.
// The hinge allows a rotation discontinuity (relative rotation).
// A continuous beam has equal rotations at interior nodes; a Gerber
// beam does not at the hinge location.
//
// 2-span beam: A(x=0, pinned), B(x=5, rollerX), C(x=10, rollerX).
// Case 1: continuous (no hinge). Case 2: hinge at x=2.5 (node 2).
// UDL q=10.
//
// In Case 2, the rotation at the hinge node should differ depending
// on which element's end we look at (the solver reports node rotations
// but the hinge releases one element's end, so we compare the
// rotation at the hinge to the rotation at a nearby node).
// More precisely: with a hinge, the beam is more flexible, so the
// absolute rotation at the hinge node will be larger in Case 2.
//
// Better check: look at element end rotations by computing them from
// displacements. The hinge allows a relative rotation, so the
// rotation of the hinge node will generally be different from what
// continuity would give. The key observable is that the solver's
// reported rotation at the hinge node differs from the continuous case.

#[test]
fn gerber_rotation_discontinuity_at_hinge() {
    // Both cases: 2-span beam, 4 elements of 2.5m each
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.5, 0.0),  // hinge in case 2
        (3, 5.0, 0.0),  // support B
        (4, 7.5, 0.0),
        (5, 10.0, 0.0), // support C
    ];
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 3_usize, "rollerX"),
        (3, 5_usize, "rollerX"),
    ];

    let mut loads = Vec::new();
    for i in 1..=4 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -10.0,
            q_j: -10.0,
            a: None,
            b: None,
        }));
    }

    // Case 1: continuous
    let elems_cont = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let input_cont = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_cont, sups.clone(), loads.clone());
    let res_cont = linear::solve_2d(&input_cont).unwrap();

    // Case 2: hinge at node 2
    let elems_hinge = vec![
        (1, "frame", 1, 2, 1, 1, false, true),  // hinge_end at node 2
        (2, "frame", 2, 3, 1, 1, true, false),   // hinge_start at node 2
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let input_hinge = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_hinge, sups, loads);
    let res_hinge = linear::solve_2d(&input_hinge).unwrap();

    // The max deflection should be larger with the hinge (more flexible)
    let max_uy_cont = res_cont.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);
    let max_uy_hinge = res_hinge.displacements.iter()
        .map(|d| d.uz.abs())
        .fold(0.0_f64, f64::max);

    assert!(
        max_uy_hinge > max_uy_cont,
        "Hinge should increase flexibility: max|uy| hinge={:.6e} > cont={:.6e}",
        max_uy_hinge, max_uy_cont
    );

    // The rotation at node 2 should differ between cases
    let rz_cont = res_cont.displacements.iter().find(|d| d.node_id == 2).unwrap().ry;
    let rz_hinge = res_hinge.displacements.iter().find(|d| d.node_id == 2).unwrap().ry;

    // Rotations should be different (hinge allows rotation release)
    let rz_diff: f64 = (rz_hinge - rz_cont).abs();
    assert!(
        rz_diff > 1e-6,
        "Rotation at hinge node should differ from continuous: rz_hinge={:.6e}, rz_cont={:.6e}",
        rz_hinge, rz_cont
    );

    // Moment at hinge should be zero in Case 2, non-zero in Case 1
    let ef1_hinge = res_hinge.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef1_cont = res_cont.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    assert!(ef1_hinge.m_end.abs() < 0.5,
        "Hinge case: moment at hinge = 0, got {:.4}", ef1_hinge.m_end);
    assert!(ef1_cont.m_end.abs() > 1.0,
        "Continuous case: moment at node 2 should be non-zero, got {:.4}", ef1_cont.m_end);
}

// ================================================================
// 8. Gerber beam: moment diagram shape verification
// ================================================================
//
// 2-span Gerber beam with UDL: verify moment values at key points.
//
// A(x=0, pinned), B(x=8, rollerX), C(x=16, rollerX).
// Hinge at H(x=4, midspan of span 1). UDL q=10 kN/m.
//
// Span 1 (A to B, L1=8m) with hinge at H(x=4):
// Left sub-segment A-H (0 to 4m): behaves as a cantilever from H (since M_H=0).
//   => It's actually part of the span; with M=0 at H and R_A at x=0:
//      M(x) = R_A * x - q*x^2/2  for 0 <= x <= 4
//      M(4) = 0  =>  R_A * 4 - q*16/2 = 0  =>  R_A * 4 = 80  ... not yet, need R_A.
//
// Right segment H-C (4 to 16m) with support at B(x=8) and C(x=16):
//   This is a simply-supported beam from H to C with UDL (since M_H=0 and M_C=0).
//   Wait, H is not a support. H is a hinge in the beam. The right segment from H
//   to C has support at B(x=8) and C(x=16), with hinge at H being the left end.
//   Length = 12m. Left end is free (hinge, no support) with M=0.
//   Actually the right segment is a beam from x=4 to x=16 with:
//     - Left end x=4: free end (M=0, no support => it's actually connected to the left)
//     - Support B at x=8
//     - Support C at x=16
//   This is a propped cantilever... no, both B and C are simple supports and the
//   left end at x=4 is free (cantilevering out from B).
//   It's an overhanging beam: support B(x=8), support C(x=16), with overhang
//   from x=4 to x=8 on the left.
//
// Let me use the hinge condition to solve reactions.
// Full beam: R_A + R_B + R_C = q * 16 = 160  ...(1)
// Sum M about A: R_B*8 + R_C*16 = q*16*8 = 1280  ...(2)
// Hinge condition M(x=4) = 0:
//   M(4) from left: R_A * 4 - q * 4^2 / 2 = 4*R_A - 80 = 0  =>  R_A = 20  ...(3)
//
// From (1): R_B + R_C = 140
// From (2): R_B*8 + R_C*16 = 1280
//   => R_B = (140*16 - 1280)/8 = (2240 - 1280)/8 = 960/8 = 120
//   => R_C = 140 - 120 = 20

#[test]
fn gerber_moment_diagram_shape() {
    let q = 10.0;
    let l_total: f64 = 16.0;

    // Nodes every 2m: 1(0), 2(2), 3(4=hinge), 4(6), 5(8=B), 6(10), 7(12), 8(14), 9(16=C)
    let nodes: Vec<(usize, f64, f64)> = (0..=8)
        .map(|i| (i + 1, i as f64 * 2.0, 0.0))
        .collect();
    // Hinge at node 3 (x=4): elem 2 hinge_end, elem 3 hinge_start
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..8)
        .map(|i| {
            let he = i == 1; // elem 2: hinge_end at node 3
            let hs = i == 2; // elem 3: hinge_start at node 3
            (i + 1, "frame", i + 1, i + 2, 1, 1, hs, he)
        })
        .collect();
    let sups = vec![
        (1, 1_usize, "pinned"),   // A at x=0
        (2, 5_usize, "rollerX"),  // B at x=8
        (3, 9_usize, "rollerX"),  // C at x=16
    ];
    let mut loads = Vec::new();
    for i in 1..=8 {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: -q,
            q_j: -q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Analytical reactions
    let r_a_exact = 20.0;
    let r_b_exact = 120.0;
    let r_c_exact = 20.0;

    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_b = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 9).unwrap();

    assert_close(r_a.rz, r_a_exact, 0.02, "Gerber moment shape: R_A = 20");
    assert_close(r_b.rz, r_b_exact, 0.02, "Gerber moment shape: R_B = 120");
    assert_close(r_c.rz, r_c_exact, 0.02, "Gerber moment shape: R_C = 20");

    // Moment at hinge (node 3, x=4) = 0
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef2.m_end.abs() < 0.5, "Hinge moment (elem 2 end) ~ 0, got {:.4}", ef2.m_end);
    assert!(ef3.m_start.abs() < 0.5, "Hinge moment (elem 3 start) ~ 0, got {:.4}", ef3.m_start);

    // Moment at midspan of left sub-segment (x=2, node 2):
    //   M(2) = R_A * 2 - q * 2^2 / 2 = 20*2 - 10*4/2 = 40 - 20 = 20 kN.m
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // m_end of element 1 (node 2, x=2) is the moment at x=2.
    // For UDL: M(x=2) = R_A*2 - q*2^2/2 = 40 - 20 = 20
    // The sign convention in the solver: positive moment = sagging.
    assert_close(ef1.m_end.abs(), 20.0, 0.03, "Gerber moment at x=2: M = 20");

    // Moment at support B (x=8):
    //   M(8) = R_A*8 - q*8^2/2 = 20*8 - 10*32 = 160 - 320 = -160 kN.m
    //   |M(8)| = 160 (hogging moment at interior support)
    // Element 4 goes from node 4(x=6) to node 5(x=8). m_end is moment at x=8.
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef4.m_end.abs(), 160.0, 0.03, "Gerber moment at support B: |M| = 160");

    // Moment at midspan of span 2 (x=12, node 7):
    //   M(12) = R_A*12 + R_B*4 - q*12^2/2 = 20*12 + 120*4 - 10*72 = 240 + 480 - 720 = 0
    //   Interesting: M(12) = 0. This makes sense by symmetry of the right segment.
    //   Actually, from the right: M(12) = R_C*(16-12) - q*4^2/2 = 20*4 - 80 = 80 - 80 = 0
    //   Hmm: M(12) from right = R_C*4 - q*16/2 = 80 - 80 = 0. Correct.
    // Element 6 (node 6, x=10 -> node 7, x=12), m_end at x=12.
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(ef6.m_end.abs() < 1.0,
        "Gerber moment at x=12 should be ~0, got {:.4}", ef6.m_end);

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, q * l_total, 0.01, "Gerber moment shape: sum Ry = qL");
}
