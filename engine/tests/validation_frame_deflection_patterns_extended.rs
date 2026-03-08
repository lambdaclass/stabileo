/// Validation: Extended Frame Deflection Patterns
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 7-8
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 5-6
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 9-12
///   - Timoshenko & Gere, "Mechanics of Materials", 4th Ed.
///   - Roark's "Formulas for Stress and Strain", 9th Ed., Ch. 8
///
/// Tests verify deflection patterns in various frame and beam configurations:
///   1. Portal frame symmetric gravity: zero lateral sway, equal vertical deflection at top nodes
///   2. Portal frame lateral load: both top nodes sway equally (rigid beam with stiff beam)
///   3. Two-story frame: upper story drifts more than lower with lateral load at top
///   4. Cantilever frame: tip deflection matches PL^3/(3EI) for horizontal cantilever
///   5. Propped cantilever: max deflection location shifted from midspan toward roller end
///   6. Fixed-fixed beam: zero slope at both ends, max deflection at midspan
///   7. SS beam UDL: symmetric deflection profile, max at midspan = 5qL^4/(384EI)
///   8. L-frame (column+beam): vertical load at tip causes both vertical and horizontal displacement
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Portal Frame Symmetric Gravity: Zero Lateral Sway, Equal Vertical Deflections
// ================================================================
//
// A fixed-base portal frame with symmetric geometry and equal gravity
// loads at both top nodes. By symmetry, there should be zero lateral
// sway (ux = 0 at both top nodes) and equal vertical deflection at
// both top nodes.
//
// Ref: Kassimali, "Structural Analysis", 6th Ed., Ch. 5 — symmetric frames.

#[test]
fn validation_portal_symmetric_gravity_zero_sway() {
    let h = 4.0;
    let w = 6.0;
    let g = -20.0; // kN downward at each top node

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, g);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 is top-left (0, h), node 3 is top-right (w, h)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Zero lateral sway at both top nodes (within numerical tolerance)
    let sway_tol = 1e-8;
    assert!(
        d2.ux.abs() < sway_tol,
        "Symmetric gravity: node 2 ux should be ~0, got {:.6e}", d2.ux
    );
    assert!(
        d3.ux.abs() < sway_tol,
        "Symmetric gravity: node 3 ux should be ~0, got {:.6e}", d3.ux
    );

    // Equal vertical deflection at both top nodes
    let diff: f64 = (d2.uy - d3.uy).abs();
    assert!(
        diff < 1e-10,
        "Symmetric gravity: node 2 uy={:.6e} should equal node 3 uy={:.6e}, diff={:.6e}",
        d2.uy, d3.uy, diff
    );

    // Both should deflect downward
    assert!(
        d2.uy < 0.0,
        "Symmetric gravity: top nodes should deflect downward, got uy={:.6e}", d2.uy
    );
}

// ================================================================
// 2. Portal Frame Lateral Load: Both Top Nodes Sway Equally
// ================================================================
//
// A fixed-base portal frame with a very stiff beam (large Iz for beam)
// subjected to a lateral load at one top node. If the beam is
// essentially rigid, both top nodes must have the same horizontal
// displacement (rigid beam assumption).
//
// Ref: Hibbeler, "Structural Analysis", Ch. 7 — portal frame lateral analysis.

#[test]
fn validation_portal_lateral_equal_sway() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0; // kN lateral at node 2

    // Use a very stiff beam (100x Iz) to enforce near-rigid beam behavior
    let iz_beam = IZ * 100.0;

    // Build manually: columns with normal IZ, beam with very large IZ
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column (section 1)
        (2, "frame", 2, 3, 1, 2, false, false), // beam (section 2, stiff)
        (3, "frame", 3, 4, 1, 1, false, false), // right column (section 1)
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, iz_beam)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should sway in the same direction
    assert!(
        d2.ux > 0.0 && d3.ux > 0.0,
        "Lateral load: both top nodes should sway positive, d2.ux={:.6e}, d3.ux={:.6e}",
        d2.ux, d3.ux
    );

    // With a very stiff beam, the horizontal displacements should be nearly equal
    let rel_diff: f64 = (d2.ux - d3.ux).abs() / d2.ux.abs();
    assert!(
        rel_diff < 0.02,
        "Rigid beam: d2.ux={:.6e} should ≈ d3.ux={:.6e}, rel_diff={:.4}%",
        d2.ux, d3.ux, rel_diff * 100.0
    );
}

// ================================================================
// 3. Two-Story Frame: Upper Story Drifts More Than Lower
// ================================================================
//
// A two-story single-bay frame with fixed bases. A lateral load is
// applied only at the top floor. The upper story inter-story drift
// (difference between floor 2 and floor 1 displacements) should
// exceed the lower story drift (floor 1 displacement itself), since
// the columns above accumulate bending.
//
// Ref: Taranath, "Structural Analysis of Tall Buildings", Ch. 3.

#[test]
fn validation_two_story_upper_drift_exceeds_lower() {
    let h = 3.5;
    let w = 6.0;
    let p = 15.0; // kN lateral at top floor

    // Build a 2-story, 1-bay frame manually
    // Nodes: 1(0,0), 2(w,0) [ground]; 3(0,h), 4(w,h) [floor 1]; 5(0,2h), 6(w,2h) [floor 2]
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 0.0, h),
        (4, w, h),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
    ];
    let elems = vec![
        // Columns story 1
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // Beam floor 1
        (3, "frame", 3, 4, 1, 1, false, false),
        // Columns story 2
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        // Beam floor 2
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 2, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Floor 1 average sway (nodes 3, 4)
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let sway_floor1: f64 = (d3.ux + d4.ux) / 2.0;

    // Floor 2 average sway (nodes 5, 6)
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();
    let sway_floor2: f64 = (d5.ux + d6.ux) / 2.0;

    // Inter-story drifts
    let drift_lower: f64 = sway_floor1.abs(); // floor 1 minus ground (= 0)
    let drift_upper: f64 = (sway_floor2 - sway_floor1).abs();

    // Upper story drift should be larger (load applied at top only)
    assert!(
        drift_upper > drift_lower,
        "Two-story: upper drift={:.6e} should exceed lower drift={:.6e}",
        drift_upper, drift_lower
    );

    // Floor 2 total sway should be positive and larger than floor 1
    assert!(
        sway_floor2 > sway_floor1,
        "Two-story: floor 2 sway={:.6e} should exceed floor 1 sway={:.6e}",
        sway_floor2, sway_floor1
    );
}

// ================================================================
// 4. Cantilever Frame: Tip Deflection Matches PL^3/(3EI)
// ================================================================
//
// A horizontal cantilever beam (fixed at left, free at right) with a
// point load at the tip. The analytical deflection is PL^3/(3EI).
// Using multiple elements for accuracy.
//
// Ref: Timoshenko & Gere, "Mechanics of Materials", §9.2.

#[test]
fn validation_cantilever_tip_deflection_pl3_3ei() {
    let l = 5.0;
    let n = 8;
    let p = 15.0; // kN downward
    let e_eff: f64 = E * 1000.0;

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Analytical: delta = PL^3 / (3EI)
    let delta_exact: f64 = p * l.powi(3) / (3.0 * e_eff * IZ);

    let error: f64 = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.02,
        "Cantilever PL^3/(3EI): tip uy={:.6e}, exact={:.6e}, err={:.2}%",
        tip.uy.abs(), delta_exact, error * 100.0
    );

    // Tip should deflect downward
    assert!(
        tip.uy < 0.0,
        "Cantilever: tip should deflect downward, got uy={:.6e}", tip.uy
    );
}

// ================================================================
// 5. Propped Cantilever: Max Deflection Shifted from Midspan Toward Roller End
// ================================================================
//
// Fixed at left end, roller at right end, with UDL. The maximum
// deflection occurs at x ≈ 0.5785L from the fixed end (equivalently
// 0.4215L from the roller end). This is shifted from midspan (0.5L)
// toward the roller end. The midspan deflection is not the maximum.
//
// Ref: Gere & Goodno, "Mechanics of Materials", 9th Ed., §9.5.

#[test]
fn validation_propped_cantilever_max_deflection_shifted() {
    let l = 8.0;
    let n = 32; // fine mesh for accurate location
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Find the node with maximum absolute vertical deflection
    let max_node = results.displacements.iter()
        .max_by(|a, b| a.uy.abs().partial_cmp(&b.uy.abs()).unwrap())
        .unwrap();

    // The x-coordinate of the max deflection node
    // Nodes are numbered 1..=n+1, spaced at L/n intervals along X
    let elem_len: f64 = l / n as f64;
    let x_max: f64 = (max_node.node_id as f64 - 1.0) * elem_len;

    // For a propped cantilever (fixed at x=0, roller at x=L) under UDL,
    // the maximum deflection occurs at x ≈ 0.5785L from the fixed end
    // (equivalently, 0.4215L from the roller end). This is shifted from
    // midspan (0.5L) toward the roller (free) end.
    //
    // Ref: Gere & Goodno, Table D-2.
    let x_theory: f64 = 0.5785 * l;
    let shift: f64 = (x_max - x_theory).abs();
    assert!(
        shift < 2.0 * elem_len,
        "Propped cantilever: max deflection at x={:.3}, expected near {:.3} (0.5785L), diff={:.3}",
        x_max, x_theory, shift
    );

    // Confirm max deflection is not at midspan — it is shifted toward the roller end
    let midspan_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == midspan_node).unwrap();
    let d_max: f64 = max_node.uy.abs();
    let d_midspan: f64 = d_mid.uy.abs();
    assert!(
        d_max > d_midspan,
        "Propped cantilever: max deflection {:.6e} should exceed midspan {:.6e}",
        d_max, d_midspan
    );

    // The max deflection location should be to the right of midspan (toward roller)
    assert!(
        x_max > l / 2.0,
        "Propped cantilever: max at x={:.3} should be right of midspan {:.3}",
        x_max, l / 2.0
    );
}

// ================================================================
// 6. Fixed-Fixed Beam: Zero Slope at Both Ends, Max Deflection at Midspan
// ================================================================
//
// A fixed-fixed beam with UDL has zero rotation at both fixed ends
// and maximum deflection at midspan = qL^4/(384EI).
//
// Ref: Timoshenko, Table of Beam Deflections; Roark's, Table 8.

#[test]
fn validation_fixed_fixed_zero_slope_max_at_midspan() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Zero slope at both ends (fixed boundary condition)
    let d_start = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(
        d_start.rz.abs() < 1e-10,
        "Fixed-fixed: start rotation should be 0, got {:.6e}", d_start.rz
    );
    assert!(
        d_end.rz.abs() < 1e-10,
        "Fixed-fixed: end rotation should be 0, got {:.6e}", d_end.rz
    );

    // Zero displacement at both ends
    assert!(
        d_start.uy.abs() < 1e-10,
        "Fixed-fixed: start uy should be 0, got {:.6e}", d_start.uy
    );
    assert!(
        d_end.uy.abs() < 1e-10,
        "Fixed-fixed: end uy should be 0, got {:.6e}", d_end.uy
    );

    // Max deflection at midspan
    let midspan_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == midspan_node).unwrap();

    // Check that midspan has the maximum deflection
    let max_defl: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let ratio: f64 = d_mid.uy.abs() / max_defl;
    assert!(
        ratio > 0.98,
        "Fixed-fixed: midspan deflection {:.6e} should be the max {:.6e}, ratio={:.4}",
        d_mid.uy.abs(), max_defl, ratio
    );

    // Verify against exact formula: delta = qL^4/(384EI)
    let delta_exact: f64 = q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let error: f64 = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.05,
        "Fixed-fixed UDL: midspan={:.6e}, exact qL^4/(384EI)={:.6e}, err={:.2}%",
        d_mid.uy.abs(), delta_exact, error * 100.0
    );
}

// ================================================================
// 7. SS Beam UDL: Symmetric Profile, Max at Midspan = 5qL^4/(384EI)
// ================================================================
//
// Simply-supported beam with uniform distributed load. The deflection
// profile should be symmetric about midspan, and the maximum deflection
// at midspan matches the classic formula 5qL^4/(384EI).
//
// Ref: Gere & Goodno, "Mechanics of Materials", 9th Ed., §9.3.

#[test]
fn validation_ss_udl_symmetric_max_midspan() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;
    let e_eff: f64 = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // Check symmetry: node i and node (n+2-i) should have equal deflection
    for i in 1..=n / 2 {
        let mirror = n + 2 - i;
        let di = results.displacements.iter().find(|d| d.node_id == i).unwrap();
        let dm = results.displacements.iter().find(|d| d.node_id == mirror).unwrap();
        let diff: f64 = (di.uy - dm.uy).abs();
        assert!(
            diff < 1e-10,
            "SS UDL symmetry: node {} uy={:.6e} vs mirror node {} uy={:.6e}, diff={:.6e}",
            i, di.uy, mirror, dm.uy, diff
        );
    }

    // Max deflection at midspan
    let midspan_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == midspan_node).unwrap();

    // Midspan should have the maximum deflection
    let max_defl: f64 = results.displacements.iter()
        .map(|d| d.uy.abs())
        .fold(0.0_f64, f64::max);
    let ratio: f64 = d_mid.uy.abs() / max_defl;
    assert!(
        ratio > 0.99,
        "SS UDL: midspan deflection {:.6e} should be the max {:.6e}, ratio={:.4}",
        d_mid.uy.abs(), max_defl, ratio
    );

    // Verify against exact formula: delta = 5qL^4/(384EI)
    let delta_exact: f64 = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let error: f64 = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(
        error < 0.02,
        "SS UDL: midspan={:.6e}, exact 5qL^4/(384EI)={:.6e}, err={:.2}%",
        d_mid.uy.abs(), delta_exact, error * 100.0
    );

    // Deflection should be downward (negative uy)
    assert!(
        d_mid.uy < 0.0,
        "SS UDL: midspan should deflect downward, got uy={:.6e}", d_mid.uy
    );
}

// ================================================================
// 8. L-Frame (Column+Beam): Vertical Load at Tip Causes Both Displacements
// ================================================================
//
// An L-shaped frame: vertical column (nodes 1-2) fixed at the base,
// horizontal beam (nodes 2-3) extending from the top of the column.
// A downward vertical load at the beam tip (node 3) should produce
// both vertical deflection (uy) and horizontal deflection (ux) at
// the tip, because the beam bending induces column sway.
//
// Ref: Hibbeler, "Structural Analysis", 10th Ed., Ch. 7 — frame analysis.

#[test]
fn validation_l_frame_tip_load_both_displacements() {
    let h = 4.0; // column height
    let w = 5.0; // beam span
    let p = 10.0; // kN downward at tip

    // L-frame: node 1 (0,0) fixed base, node 2 (0,h) corner, node 3 (w,h) beam tip
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // column
            (2, "frame", 2, 3, 1, 1, false, false), // beam
        ],
        vec![(1, 1_usize, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Tip should deflect downward (negative uy)
    assert!(
        d3.uy < 0.0,
        "L-frame: tip should deflect downward, got uy={:.6e}", d3.uy
    );

    // Tip should also have horizontal displacement (column bending causes sway)
    assert!(
        d3.ux.abs() > 1e-8,
        "L-frame: tip should have non-zero horizontal displacement, got ux={:.6e}", d3.ux
    );

    // Vertical deflection should be larger than horizontal (beam bending dominates)
    assert!(
        d3.uy.abs() > d3.ux.abs(),
        "L-frame: vertical deflection {:.6e} should exceed horizontal {:.6e}",
        d3.uy.abs(), d3.ux.abs()
    );

    // The corner node (2) should also displace
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        d2.ux.abs() > 1e-8,
        "L-frame: corner should have non-zero ux, got {:.6e}", d2.ux
    );

    // Global equilibrium: sum of vertical reactions = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "L-frame: sum_Ry = P");

    // The corner and tip should sway in the same direction (rigid connection)
    let same_sign: bool = d2.ux * d3.ux > 0.0;
    assert!(
        same_sign,
        "L-frame: corner ux={:.6e} and tip ux={:.6e} should sway same direction",
        d2.ux, d3.ux
    );
}
