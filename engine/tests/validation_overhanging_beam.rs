/// Validation: Overhanging (Cantilevered) Beams
///
/// An overhanging beam has supports that do NOT span the full length --
/// part of the beam extends beyond a support, creating a cantilever portion.
///
/// Tests:
///   1. Simple overhang with tip load — verify reactions via statics
///   2. Overhang with UDL — verify reactions and global equilibrium
///   3. Moment at interior support — verify internal moment magnitude
///   4. Uplift at far support — overhang longer than main span causes hold-down
///   5. Double overhang symmetric — equal tip loads give equal reactions
///   6. Overhang tip deflection direction — tip down, midspan up
///   7. Overhanging beam equilibrium — UDL on double overhang
///   8. Comparison: overhang reduces midspan moment vs simple beam
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective E in solver units (MPa -> kN/m^2).
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Simple overhang with tip load
// ================================================================
//
// Geometry: 5 nodes at x = 0, 3, 6, 8, 10.  4 elements.
// Supports: pinned at node 1 (x=0), rollerX at node 3 (x=6).
// Load: P = -10 kN at node 5 (x=10).
//
// Statics:
//   Sum moments about node 1: R_3 * 6 + (-10) * 10 = 0  =>  R_3 = 100/6 = 16.667
//   Sum Fy: R_1 + R_3 - 10 = 0  =>  R_1 = 10 - 16.667 = -6.667 (downward!)
#[test]
fn validation_overhang_tip_load_reactions() {
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

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    let r1_expected = 10.0 - 100.0 / 6.0; // -6.667
    let r3_expected = 100.0 / 6.0;          // 16.667

    assert_close(r1.ry, r1_expected, 1e-3, "R1 ry (should be negative / downward)");
    assert_close(r3.ry, r3_expected, 1e-3, "R3 ry (upward)");

    // Verify the support at node 1 pushes downward (negative reaction)
    assert!(r1.ry < 0.0, "R1 should be negative (hold-down): got {}", r1.ry);
}

// ================================================================
// 2. Overhang with UDL
// ================================================================
//
// Same geometry as test 1. UDL q = -5 kN/m on all 4 elements.
// Total load = 5 * 10 = 50 kN (downward).
//
// Moments about node 1:
//   R_3 * 6 = 5 * 10 * 5 = 250  =>  R_3 = 41.667
//   R_1 = 50 - 41.667 = 8.333
#[test]
fn validation_overhang_udl_reactions() {
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
    let loads: Vec<SolverLoad> = (1..=4)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -5.0,
                q_j: -5.0,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.ry, 8.333333, 1e-3, "R1 ry");
    assert_close(r3.ry, 41.666667, 1e-3, "R3 ry");

    // Global vertical equilibrium: sum of reactions = total applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 50.0, 1e-3, "Sum Ry = total UDL load");
}

// ================================================================
// 3. Moment at interior support
// ================================================================
//
// Same as test 1 (tip load P=-10 at x=10, supports at x=0 and x=6).
// The bending moment at node 3 (x=6, the interior support) from the
// overhang: taking a free body to the right of node 3, the only load
// is P=-10 at distance 4m, giving |M| = 10 * 4 = 40 kN*m.
//
// Verify the magnitude of the internal moment at node 3 is 40.
#[test]
fn validation_overhang_moment_at_interior_support() {
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

    // Element 2 ends at node 3; element 3 starts at node 3.
    // The moment at that junction should have magnitude 40.
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // m_end of element 2 and m_start of element 3 should both have |M| = 40
    assert_close(ef2.m_end.abs(), 40.0, 1e-3, "|m_end of elem 2| at interior support");
    assert_close(ef3.m_start.abs(), 40.0, 1e-3, "|m_start of elem 3| at interior support");
}

// ================================================================
// 4. Uplift at far support (overhang longer than main span)
// ================================================================
//
// Geometry: span = 4m (x=0 to x=4), overhang = 6m (x=4 to x=10).
// Nodes: 1(0,0), 2(2,0), 3(4,0), 4(7,0), 5(10,0).  4 elements.
// Supports: pinned at node 1, rollerX at node 3.
// Load: P = -10 kN at node 5 (tip).
//
// Statics:
//   Moments about node 1: R_3 * 4 + (-10) * 10 = 0  =>  R_3 = 25
//   R_1 = 10 - 25 = -15  (downward — uplift / hold-down at far support)
#[test]
fn validation_overhang_uplift_at_support() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 7.0, 0.0),
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

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();

    assert_close(r1.ry, -15.0, 1e-3, "R1 ry (hold-down / uplift)");
    assert_close(r3.ry, 25.0, 1e-3, "R3 ry (upward)");

    // Confirm the reaction at node 1 is genuinely downward (negative)
    assert!(
        r1.ry < 0.0,
        "Support at node 1 must provide hold-down (ry < 0): got {}",
        r1.ry
    );
}

// ================================================================
// 5. Double overhang: symmetric tip loads
// ================================================================
//
// Nodes: 1(0,0), 2(2,0), 3(4,0), 4(6,0), 5(8,0).  4 elements.
// Supports: pinned at node 2 (x=2), rollerX at node 4 (x=6).
// Main span = 4m.  Overhangs = 2m each side.
// Equal tip loads P = -10 kN at node 1 and node 5.
//
// By symmetry: R_2 = R_4 = 10 kN each.
#[test]
fn validation_double_overhang_symmetric() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 4.0, 0.0),
        (4, 6.0, 0.0),
        (5, 8.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 2, "pinned"), (2, 4, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1,
            fx: 0.0,
            fy: -10.0,
            mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5,
            fx: 0.0,
            fy: -10.0,
            mz: 0.0,
        }),
    ];

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    assert_close(r2.ry, 10.0, 1e-3, "R2 ry (symmetric, should equal 10)");
    assert_close(r4.ry, 10.0, 1e-3, "R4 ry (symmetric, should equal 10)");

    // Reactions should be equal by symmetry
    assert_close(r2.ry, r4.ry, 1e-6, "R2 = R4 by symmetry");
}

// ================================================================
// 6. Overhang tip deflection direction
// ================================================================
//
// Same as test 1 geometry (span=6 + overhang=4, tip load P=-10 at node 5).
// The tip (node 5) deflects downward: uy < 0.
// The main span midpoint (node 2, x=3) deflects upward due to the
// hogging moment from the overhang lifting the main span: uy > 0.
#[test]
fn validation_overhang_deflection_directions() {
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

    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    // Tip deflects downward
    assert!(
        d5.uy < 0.0,
        "Tip node 5 should deflect downward: uy = {}",
        d5.uy
    );

    // Midspan of main beam deflects upward (overhang effect)
    assert!(
        d2.uy > 0.0,
        "Midspan node 2 should deflect upward due to overhang: uy = {}",
        d2.uy
    );
}

// ================================================================
// 7. Overhanging beam equilibrium (double overhang with UDL)
// ================================================================
//
// Geometry: 2m overhang + 6m span + 3m overhang = 11m total.
// Nodes: 1(0,0), 2(2,0), 3(5,0), 4(8,0), 5(11,0).  4 elements.
// Supports: pinned at node 2 (x=2), rollerX at node 4 (x=8).
// UDL q = -8 kN/m on all elements.
// Total load = 8 * 11 = 88 kN.
//
// Verify: sum of reactions = 88.
// Moment equilibrium about node 2:
//   R_4 * 6 = sum of all distributed load moments about node 2
//   For UDL over full 11m, moment about x=2:
//     integral from 0 to 11 of 8*(x-2) dx = 8 * [x^2/2 - 2x] from 0 to 11
//     = 8 * (60.5 - 22) = 8 * 38.5 = 308
//   R_4 = 308 / 6 = 51.333
//   R_2 = 88 - 51.333 = 36.667
#[test]
fn validation_double_overhang_udl_equilibrium() {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 5.0, 0.0),
        (4, 8.0, 0.0),
        (5, 11.0, 0.0),
    ];
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 4, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 2, "pinned"), (2, 4, "rollerX")];
    let loads: Vec<SolverLoad> = (1..=4)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: -8.0,
                q_j: -8.0,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_input(nodes, mats, secs, elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 88.0, 1e-3, "Sum Ry = total UDL (88 kN)");

    // Individual reactions
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // R_4 * 6 = 308  =>  R_4 = 51.333
    assert_close(r4.ry, 308.0 / 6.0, 1e-3, "R4 ry from moment equilibrium");
    assert_close(r2.ry, 88.0 - 308.0 / 6.0, 1e-3, "R2 ry from force equilibrium");
}

// ================================================================
// 8. Overhang reduces midspan moment vs simple beam
// ================================================================
//
// Simple beam: L = 6m, supports at x=0 and x=6, UDL q = -10 kN/m.
//   M_midspan = qL^2/8 = 10*36/8 = 45 kN*m.
//
// Overhanging beam: total 10m, supports at x=2 and x=8, same UDL.
//   The 2m overhangs create hogging moments at the supports, reducing
//   the sagging moment at midspan.
//
// Verify: midspan moment with overhangs < midspan moment without.
#[test]
fn validation_overhang_reduces_midspan_moment() {
    let q = -10.0;

    // --- Simple beam: 6m, 6 elements, supports at ends ---
    let simple_input = make_ss_beam_udl(6, 6.0, E_EFF, A, IZ, q);
    let simple_results = linear::solve_2d(&simple_input).unwrap();

    // Midspan node is node 4 (x=3). Element 3 ends there, element 4 starts there.
    let simple_ef3 = simple_results
        .element_forces
        .iter()
        .find(|e| e.element_id == 3)
        .unwrap();
    let simple_midspan_moment = simple_ef3.m_end.abs();

    // Analytical: qL^2/8 = 10*36/8 = 45
    assert_close(simple_midspan_moment, 45.0, 0.02, "Simple beam midspan moment");

    // --- Overhanging beam: 10m total, supports at x=2 and x=8 ---
    // 10 elements of 1m each. Nodes 1..11 at x = 0,1,...,10.
    // Supports at node 3 (x=2) and node 9 (x=8).
    let nodes: Vec<(usize, f64, f64)> = (0..=10).map(|i| (i + 1, i as f64, 0.0)).collect();
    let mats = vec![(1, E_EFF, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = (0..10)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();
    let sups = vec![(1, 3, "pinned"), (2, 9, "rollerX")];
    let loads: Vec<SolverLoad> = (1..=10)
        .map(|i| {
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i,
                q_i: q,
                q_j: q,
                a: None,
                b: None,
            })
        })
        .collect();

    let overhang_input = make_input(nodes, mats, secs, elems, sups, loads);
    let overhang_results = linear::solve_2d(&overhang_input).unwrap();

    // Midspan of the main span is at x=5, which is node 6.
    // Element 5 ends at node 6.
    let overhang_ef5 = overhang_results
        .element_forces
        .iter()
        .find(|e| e.element_id == 5)
        .unwrap();
    let overhang_midspan_moment = overhang_ef5.m_end.abs();

    // The overhangs reduce the midspan sagging moment
    assert!(
        overhang_midspan_moment < simple_midspan_moment,
        "Overhang midspan moment ({:.3}) should be less than simple beam ({:.3})",
        overhang_midspan_moment,
        simple_midspan_moment
    );
}
