/// Validation: Overhanging Beams — Extended Tests
///
/// Additional overhanging beam scenarios with textbook analytical formulas.
///
/// Tests:
///   1. Overhang tip deflection formula — P*a^2*(a+L)/(3*E*I) at the tip
///   2. Shear force discontinuity at interior support
///   3. Triangular load on overhang — reactions via statics
///   4. Zero-moment (inflection) point location in main span
///   5. Double overhang with unequal tip loads — reaction asymmetry
///   6. Overhang with applied moment at tip — reactions and moment diagram
///   7. Overhang tip rotation under UDL
///   8. Maxwell reciprocal theorem: deflection symmetry
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective E in solver units (MPa -> kN/m^2).
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Overhang tip deflection formula
// ================================================================
//
// Geometry: simply-supported span L = 6m (nodes 1-4), overhang a = 3m (nodes 4-7).
// Supports: pinned at node 1 (x=0), rollerX at node 4 (x=6).
// Load: P = -12 kN at node 7 (x=9, the tip).
//
// Textbook formula (e.g., Gere & Goodno, Table D-1):
//   Tip deflection at overhang end:
//     delta_tip = P * a^2 * (a + L) / (3 * EI)
//   where a = overhang length, L = span length, P = load magnitude.
//   The solver internally multiplies E by 1000 (MPa -> kN/m^2), so
//   EI_actual = E_EFF * 1000 * IZ.
//
//   delta_tip = 12 * 9 * 9 / (3 * 2e11 * 1e-4)
//             = 972 / 60_000_000 = 1.62e-5 m (downward)
#[test]
fn validation_overhang_ext_tip_deflection_formula() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 6.0, 0.0),
        (5, 7.0, 0.0),
        (6, 8.0, 0.0),
        (7, 9.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];

    let p: f64 = 12.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 7,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d7 = results.displacements.iter().find(|d| d.node_id == 7).unwrap();

    let a: f64 = 3.0;
    let span_l: f64 = 6.0;
    // Solver multiplies E by 1000 internally, so actual EI = E_EFF * 1000 * IZ
    let ei: f64 = E_EFF * 1000.0 * IZ;
    let delta_expected = p * a.powi(2) * (a + span_l) / (3.0 * ei);

    // Tip should deflect downward
    assert!(d7.uy < 0.0, "Tip should deflect downward, got uy = {}", d7.uy);
    assert_close(d7.uy.abs(), delta_expected, 0.01, "Overhang tip deflection magnitude");
}

// ================================================================
// 2. Shear force discontinuity at interior support
// ================================================================
//
// Geometry: span L = 6m, overhang a = 4m. Total = 10m.
// Nodes: 1(0), 2(3), 3(6), 4(8), 5(10). 4 elements.
// Supports: pinned at node 1 (x=0), rollerX at node 3 (x=6).
// Load: P = -10 kN at node 5 (tip).
//
// Reactions (from statics):
//   R_3 = P * 10 / 6 = 100/6 = 16.667 kN (upward)
//   R_1 = P - R_3 = 10 - 16.667 = -6.667 kN (downward)
//
// Shear in main span (elem 1 or 2): V = R_1 = -6.667 kN
// Shear in overhang (elem 3 or 4): V = -P = -10 kN (from right FBD: V = -10)
//
// At node 3, v_end of elem 2 vs v_start of elem 3 differs by R_3.
// |v_end(elem2) - v_start(elem3)| = R_3 = 16.667
#[test]
fn validation_overhang_ext_shear_discontinuity() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 8.0, 0.0),
        (5, 10.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5,
        fx: 0.0,
        fy: -10.0,
        mz: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r3_expected = 100.0 / 6.0;
    assert_close(r3.ry, r3_expected, 1e-3, "R3 reaction");

    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Shear jump at the interior support equals the reaction there
    let shear_jump: f64 = (ef2.v_end - ef3.v_start).abs();
    assert_close(shear_jump, r3_expected, 0.02, "Shear discontinuity at interior support = R3");
}

// ================================================================
// 3. Triangular load on overhang — reactions via statics
// ================================================================
//
// Geometry: span L = 8m, overhang a = 4m. Total = 12m.
// 6 elements of 2m each. Nodes 1..7 at x = 0, 2, 4, 6, 8, 10, 12.
// Supports: pinned at node 1 (x=0), rollerX at node 5 (x=8).
// Triangular load on overhang only (elements 5 and 6, from x=8 to x=12):
//   Linear from 0 at x=8 to q_max = -12 kN/m at x=12.
//
// Element 5: x=8 to x=10, q_i=0, q_j=-6
// Element 6: x=10 to x=12, q_i=-6, q_j=-12
//
// Total load on overhang = integral of q(x) from 0 to 4 = 0.5 * 4 * 12 = 24 kN
// Centroid of triangular load at 2/3 * 4 = 2.667m from x=8, i.e. x = 10.667
//
// Moments about node 1:
//   R_5 * 8 = 24 * 10.667 = 256  =>  R_5 = 32 kN
//   R_1 = 24 - 32 = -8 kN (downward hold-down)
#[test]
fn validation_overhang_ext_triangular_load() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 6.0, 0.0),
        (5, 8.0, 0.0),
        (6, 10.0, 0.0),
        (7, 12.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    // Triangular load: linearly increasing from 0 at x=8 to -12 kN/m at x=12
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5,
            q_i: 0.0,
            q_j: -6.0,
            a: None,
            b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6,
            q_i: -6.0,
            q_j: -12.0,
            a: None,
            b: None,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Total load = 0.5 * 4 * 12 = 24 kN downward
    // Resultant at x = 8 + 2/3 * 4 = 32/3 from origin
    // R_5 * 8 = 24 * 32/3 = 256  =>  R_5 = 32
    // R_1 = 24 - 32 = -8
    let total_load: f64 = 24.0;
    assert_close(r5.ry, 32.0, 0.02, "R5 reaction (upward)");
    assert_close(r1.ry, -8.0, 0.02, "R1 reaction (hold-down)");

    // Equilibrium check
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Vertical equilibrium");
}

// ================================================================
// 4. Zero-moment (inflection) point in main span
// ================================================================
//
// Geometry: span L = 6m (x=0 to x=6), overhang a = 3m (x=6 to x=9).
// 9 elements of 1m each. Nodes 1..10 at x = 0, 1, ..., 9.
// Supports: pinned at node 1 (x=0), rollerX at node 7 (x=6).
// Load: P = -15 kN at node 10 (tip, x=9).
//
// Reactions:
//   R_7 = P * 9 / 6 = 22.5 kN, R_1 = 15 - 22.5 = -7.5 kN
//
// Moment in main span: M(x) = R_1 * x = -7.5 * x  (for 0 <= x <= 6)
// This is linear and zero only at x=0 (the pinned support, which
// is always zero for a pinned support).
//
// Moment at the interior support (x=6):
//   M(6) = -7.5 * 6 = -45 kN*m  (hogging)
//
// In the overhang, moment at distance d from support:
//   M(6+d) = -P * (a-d) = -15 * (3-d)
//   At d=3 (tip): M = 0 (free end).
//   At d=0 (support): M = -45.
//
// So the moment is negative (hogging) everywhere in the main span
// and the overhang. The inflection point is at x=0 itself, meaning
// there is no internal inflection. We verify M at the support = -45
// and the moment sign is consistently hogging in the span.
#[test]
fn validation_overhang_ext_moment_distribution() {
    let nodes: Vec<(usize, f64, f64)> = (0..=9).map(|i| (i + 1, i as f64, 0.0)).collect();
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..9)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 1, "pinned"), (2, 7, "rollerX")];

    let p: f64 = 15.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 10,
        fx: 0.0,
        fy: -p,
        mz: 0.0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Verify reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r7 = results.reactions.iter().find(|r| r.node_id == 7).unwrap();
    assert_close(r1.ry, -7.5, 1e-3, "R1 reaction");
    assert_close(r7.ry, 22.5, 1e-3, "R7 reaction");

    // Moment at the interior support (x=6): M = R_1 * 6 = -45 kN*m
    // Element 6 ends at node 7 (x=6)
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert_close(ef6.m_end.abs(), 45.0, 0.01, "|Moment| at interior support = 45");

    // Moment at free tip (x=9) should be zero: m_end of element 9
    let ef9 = results.element_forces.iter().find(|e| e.element_id == 9).unwrap();
    assert_close(ef9.m_end.abs(), 0.0, 0.01, "Moment at free tip = 0");
}

// ================================================================
// 5. Double overhang with unequal tip loads — reaction asymmetry
// ================================================================
//
// Geometry: left overhang 2m + span 6m + right overhang 2m = 10m total.
// Nodes: 1(0), 2(1), 3(2), 4(5), 5(8), 6(9), 7(10). 6 elements.
// Supports: pinned at node 3 (x=2), rollerX at node 5 (x=8).
// Loads: P_left = -5 kN at node 1 (x=0), P_right = -20 kN at node 7 (x=10).
// Total load = 25 kN.
//
// Moments about node 3 (x=2):
//   R_5 * 6 = P_left * (-2) + P_right * 8
//   Note: P_left is at x=0, which is 2m to the LEFT of node 3,
//   so its moment about node 3 is P_left * (-2) = -5 * (-2) = +10
//   Wait — let's be careful with signs.
//
//   Taking moments about x=2 (node 3), CCW positive:
//   -5 acts at x=0: moment_arm = 0-2 = -2, contribution = (-5)*(-2) = +10 (but downward force
//   at left means it wants to rotate CW about x=2) ... let's use the direct approach:
//
//   Sum M about node 3 = 0:
//     R_5 * 6 + R_3 * 0 - 5 * 2 - 20 * 8 = 0  (taking downward loads, distance from node 3)
//   Wait: node 1 is 2m to the LEFT of node 3. Let's use signed distances from node 3.
//
//   Let x' = x - 2. Forces:
//     -5 kN at x' = -2, -20 kN at x' = 8. R_5 at x' = 6.
//   Sum M about node 3:
//     R_5 * 6 + (-5)*(-2) + (-20)*(8) = 0
//     R_5 * 6 + 10 - 160 = 0
//     R_5 * 6 = 150
//     R_5 = 25
//   R_3 = 25 - 25 = 0?  No:
//   Sum Fy: R_3 + R_5 = 5 + 20 = 25
//   R_3 = 25 - 25 = 0.  That's a special case!
//
// Let's use different loads to get non-trivial reactions:
//   P_left = -8 kN at node 1, P_right = -20 kN at node 7.
//   Total = 28 kN.
//
//   Moments about node 5 (x=8), CCW positive:
//     R_3 * (2-8) + (-8)*(0-8) + (-20)*(10-8) = 0
//     -6*R_3 + 64 - 40 = 0  =>  R_3 = 24/6 = 4 kN
//     R_5 = 28 - 4 = 24 kN
#[test]
fn validation_overhang_ext_unequal_tip_loads() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 1.0, 0.0),
        (3, 2.0, 0.0),
        (4, 5.0, 0.0),
        (5, 8.0, 0.0),
        (6, 9.0, 0.0),
        (7, 10.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
    ];
    let sups = vec![(1, 3, "pinned"), (2, 5, "rollerX")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fy: -8.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7,
            fx: 0.0,
            fy: -20.0,
            mz: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // R_3 = 4, R_5 = 24
    let r3_expected = 4.0;
    let r5_expected = 24.0;

    assert_close(r5.ry, r5_expected, 1e-3, "R5 reaction (right support)");
    assert_close(r3.ry, r3_expected, 1e-3, "R3 reaction (left support)");

    // Both reactions should be positive (upward) — the right overhang load
    // dominates but does not cause uplift at the left support in this case.
    assert!(r3.ry > 0.0, "Left support reaction should be upward: got {}", r3.ry);

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 28.0, 1e-3, "Vertical equilibrium: sum Ry = 28 kN");
}

// ================================================================
// 6. Overhang with applied moment at tip — reactions and moment diagram
// ================================================================
//
// Geometry: span L = 6m, overhang a = 3m. Total = 9m.
// 3 elements: (1,2) 0-3, (2,3) 3-6, (3,4) 6-9.
// Supports: pinned at node 1 (x=0), rollerX at node 3 (x=6).
// Load: applied moment M0 = +30 kN*m (CCW) at node 4 (tip, x=9).
//
// No vertical forces applied, so the reactions are a couple:
// Moments about node 1:
//   R_3 * 6 + M0 = 0  =>  R_3 = -M0/6 = -30/6 = -5 kN (downward!)
//   R_1 = -R_3 = +5 kN (upward)
//
// Check: Sum Fy = R_1 + R_3 = 5 - 5 = 0 (no net vertical load). Correct.
//
// Internal moment in the overhang at any section between support and tip:
//   Taking FBD to the right of a cut at distance d from support:
//   M(6+d) = M0 = 30 (constant, since no transverse loads on overhang).
//
// So moment at the interior support: m_start of elem 3 should be 30 kN*m.
// And m_end of elem 3 (at tip) should be -30 (applied moment taken out).
// Actually for a free end with applied moment: m_end at node 4 = 0 in element forces
// since the applied moment is balanced.
//
// Let's check: moment at node 3 from left FBD:
//   M(x=6) = R_1 * 6 = 5 * 6 = 30 kN*m
#[test]
fn validation_overhang_ext_applied_moment_at_tip() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 3.0, 0.0),
        (3, 6.0, 0.0),
        (4, 9.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];

    let m0: f64 = 30.0;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: 0.0,
        fy: 0.0,
        mz: m0,
    })];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: a pure couple
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.ry, 5.0, 1e-3, "R1 reaction (upward)");
    assert_close(r3.ry, -5.0, 1e-3, "R3 reaction (downward)");

    // No net vertical load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 1e-3, "Sum Ry = 0 (pure couple)");

    // Moment at interior support (x=6): M = R1 * 6 = 30
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef2.m_end.abs(), 30.0, 0.01, "|Moment| at interior support = 30");
}

// ================================================================
// 7. Overhang tip rotation under UDL
// ================================================================
//
// Geometry: simply-supported span L = 8m, overhang a = 4m. Total = 12m.
// 6 elements of 2m each. Nodes 1..7 at x = 0, 2, 4, 6, 8, 10, 12.
// Supports: pinned at node 1 (x=0), rollerX at node 5 (x=8).
// UDL q = -6 kN/m on the overhang only (elements 5, 6).
//
// Total overhang load W = q * a = 6 * 4 = 24 kN at centroid x = 8 + 2 = 10.
// Reactions:
//   R_5 * 8 = 24 * 10 = 240  =>  R_5 = 30 kN
//   R_1 = 24 - 30 = -6 kN
//
// Slope (rotation) at the tip of the overhang (textbook: from conjugate beam or
// direct integration). For a cantilever portion of length a with UDL q and
// additional rotation at the root:
//
//   theta_support = R_1 * L^2 / (6*EI) - (note: this is slope at right support
//   of the main span due to the equivalent loading)
//
// We'll verify reactions and that the tip rotation is non-zero and has the
// correct sign (clockwise rotation at the tip, i.e. rz < 0 for downward loading
// on right overhang).
#[test]
fn validation_overhang_ext_tip_rotation_udl() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 6.0, 0.0),
        (5, 8.0, 0.0),
        (6, 10.0, 0.0),
        (7, 12.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    let q: f64 = -6.0;
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    assert_close(r5.ry, 30.0, 1e-3, "R5 reaction");
    assert_close(r1.ry, -6.0, 1e-3, "R1 reaction (hold-down)");

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 24.0, 1e-3, "Sum Ry = 24 kN");

    // Tip rotation: should be negative (clockwise) since load pushes overhang down
    let d7 = results.displacements.iter().find(|d| d.node_id == 7).unwrap();
    assert!(d7.rz < 0.0, "Tip rotation should be clockwise (rz < 0): got {}", d7.rz);

    // Tip deflection should be downward
    assert!(d7.uy < 0.0, "Tip deflection should be downward: got {}", d7.uy);

    // Analytical tip rotation for this configuration:
    // theta_tip = -q*a^3/(6*EI) + theta_B (slope at support B from main span bending)
    // theta_B (slope at right support of simply-supported beam with moment M_B = q*a^2/2 = 48 at B):
    //   theta_B = M_B * L / (3*EI) = 48 * 8 / (3 * E_EFF * IZ) = 384 / 60000
    //   (from a beam with end moment: theta_near = M*L/(3*EI))
    // theta_cantilever = q*a^3/(6*EI) = 6*64/(6*E_EFF*IZ) = 384 / (6*20000) = 384/120000
    //   Hmm, let's just do a quantitative check on the rotation at the support (node 5).
    // Support slope at B: theta_B = M_B * L / (3 * EI)
    // where M_B = |q| * a^2 / 2 = 6 * 16 / 2 = 48 kN*m
    // Solver multiplies E by 1000 internally
    let ei: f64 = E_EFF * 1000.0 * IZ;
    let m_b: f64 = 6.0 * 16.0 / 2.0; // 48
    let l: f64 = 8.0;
    let a: f64 = 4.0;
    let theta_b_span = -m_b * l / (3.0 * ei); // slope at B from span bending (negative = CW)
    let theta_cantilever = -6.0 * a.powi(3) / (6.0 * ei); // additional CW rotation from cantilever UDL
    let theta_tip_expected = theta_b_span + theta_cantilever;
    // This is approximate since the combined deflection involves the full beam,
    // but the sign should match and order of magnitude should be correct.
    assert_close(d7.rz, theta_tip_expected, 0.05, "Tip rotation magnitude check");
}

// ================================================================
// 8. Maxwell reciprocal theorem: deflection symmetry
// ================================================================
//
// The Maxwell-Betti reciprocal theorem states that for a linear elastic structure,
// the deflection at point A due to a unit load at point B equals the deflection
// at point B due to a unit load at point A (delta_AB = delta_BA).
//
// Geometry: span L = 8m, overhang a = 4m. Total = 12m.
// 6 elements of 2m each. Nodes 1..7 at x = 0, 2, 4, 6, 8, 10, 12.
// Supports: pinned at node 1 (x=0), rollerX at node 5 (x=8).
//
// Case A: P = -1 kN at node 3 (x=4), measure uy at node 6 (x=10).
// Case B: P = -1 kN at node 6 (x=10), measure uy at node 3 (x=4).
//
// Maxwell's theorem: uy_6(case A) = uy_3(case B).
#[test]
fn validation_overhang_ext_maxwell_reciprocal() {
    let build_model = |load_node: usize| -> SolverInput {
        let nodes: Vec<(usize, f64, f64)> = (0..=6).map(|i| (i + 1, i as f64 * 2.0, 0.0)).collect();
        let mats = vec![(1, E_EFF, 0.3)];
        let secs = vec![(1, A, IZ)];
        let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..6)
            .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
            .collect();
        let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node,
            fx: 0.0,
            fy: -1.0,
            mz: 0.0,
        })];
        make_input(nodes, mats, secs, elems, sups, loads)
    };

    // Case A: load at node 3, measure at node 6
    let input_a = build_model(3);
    let results_a = linear::solve_2d(&input_a).unwrap();
    let d6_case_a = results_a.displacements.iter().find(|d| d.node_id == 6).unwrap().uy;

    // Case B: load at node 6, measure at node 3
    let input_b = build_model(6);
    let results_b = linear::solve_2d(&input_b).unwrap();
    let d3_case_b = results_b.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    // Maxwell's reciprocal theorem: delta_AB = delta_BA
    assert_close(d6_case_a, d3_case_b, 1e-3, "Maxwell reciprocal: delta_AB = delta_BA");

    // Both deflections should be non-zero
    assert!(d6_case_a.abs() > 1e-10, "Deflection should be non-zero: got {}", d6_case_a);
    assert!(d3_case_b.abs() > 1e-10, "Deflection should be non-zero: got {}", d3_case_b);
}
