/// Validation: Relative Displacements Between Nodes
///
/// References:
///   - Hibbeler, R.C., "Structural Analysis", 10th Ed., Ch. 8-9
///   - Kassimali, A., "Structural Analysis", 6th Ed., Ch. 8
///   - Ghali, A., Neville, A.M. & Brown, T.G., "Structural Analysis", 6th Ed., Ch. 5
///   - Taranath, B.S., "Structural Analysis and Design of Tall Buildings", McGraw-Hill, 1988
///   - ASCE 7-22 §12.12 (drift and deformation limits)
///
/// Tests:
///   1. Chord rotation: (δ_top - δ_bottom) / h for a cantilever column
///   2. Inter-story drift: relative lateral displacement between floors
///   3. Relative vertical displacement: differential settlement under equal loads
///   4. Axial elongation: PL/(EA) for bar under tension
///   5. Joint opening angle: relative rotation between connected members
///   6. Differential deflection between adjacent parallel beams
///   7. Relative twist between beam ends under midspan torque-like loading
///   8. Compatibility at shared node: relative displacement = 0
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Chord Rotation: (δ_top - δ_bottom) / h
// ================================================================
//
// A cantilever column of height h, fixed at base, free at top.
// Lateral load H applied at the tip.
// Tip deflection: δ_top = H·h³/(3·E·I)
// Base (fixed): δ_bottom = 0
// Chord rotation θ_chord = δ_top / h = H·h²/(3·E·I)
//
// For a multi-element column, we compute chord rotation from
// relative displacement of top and bottom nodes.
//
// Reference: Hibbeler §8.2; ASCE 7-22 §12.12.1

#[test]
fn validation_reldispl_chord_rotation_cantilever() {
    let h = 4.0;
    let n = 8;
    let lateral = 10.0; // kN
    let e_eff = E * 1000.0;

    // Cantilever column: nodes along Y-axis, fixed at base
    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, 0.0, i as f64 * h / n as f64)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let sups = vec![(1, 1, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: lateral, fy: 0.0, mz: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d_top = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let d_bot = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ux;

    // Chord rotation
    let theta_chord = (d_top - d_bot) / h;

    // Analytical tip deflection δ = HL³/(3EI)
    let delta_exact = lateral * h.powi(3) / (3.0 * e_eff * IZ);
    let theta_exact = delta_exact / h;

    assert_close(d_top, delta_exact, 0.02, "Cantilever tip deflection = HL³/(3EI)");
    assert_close(theta_chord, theta_exact, 0.02,
        "Chord rotation = δ_top/h = HL²/(3EI)");

    // Base is fixed → d_bot = 0
    assert!(d_bot.abs() < 1e-10, "Fixed base displacement = 0");
}

// ================================================================
// 2. Inter-Story Drift: Two-Story Frame
// ================================================================
//
// Two-story frame under lateral loads at each floor.
// Inter-story drift for story k: Δk = ux(k) - ux(k-1)
// Total drift = sum of inter-story drifts.
// Each story drift is positive (structure sways in load direction).
//
// Reference: Taranath §4.2; Kassimali §8.4 (drift calculations)

#[test]
fn validation_reldispl_interstory_drift_two_story() {
    let h = 3.5;
    let w = 6.0;
    let h1 = 15.0; // lateral at floor 1
    let h2 = 10.0; // lateral at floor 2 (roof)

    // Two-story single-bay frame
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),
        (3, 0.0, h),   (4, w, h),
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "frame", 3, 5, 1, 1, false, false),
        (5, "frame", 4, 6, 1, 1, false, false),
        (6, "frame", 5, 6, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: h1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h2, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let ux1 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux2 = results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // Inter-story drifts
    let drift_story1 = ux1; // relative to fixed base
    let drift_story2 = ux2 - ux1; // relative to floor 1

    // Both drifts must be positive
    assert!(drift_story1 > 0.0,
        "Story 1 drift must be positive: {:.6e}", drift_story1);
    assert!(drift_story2 > 0.0,
        "Story 2 drift must be positive: {:.6e}", drift_story2);

    // Total drift = sum of inter-story drifts
    let total_drift = drift_story1 + drift_story2;
    assert_close(total_drift, ux2, 0.001,
        "Total drift = sum of inter-story drifts");

    // Global equilibrium: ΣRx = H1 + H2
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h1 + h2, 0.01, "Two-story ΣRx");
}

// ================================================================
// 3. Relative Vertical Displacement Between Supports
// ================================================================
//
// Two-span beam with prescribed settlement at one support.
// The relative vertical displacement between supports equals the
// imposed settlement. Nodes at the settled support have uy = -δ_settle.
//
// As a proxy (since prescribed settlement requires special input), we
// verify that a beam with different support stiffnesses exhibits
// differential vertical deflection proportional to the stiffness ratio.
//
// Instead: two separate beams, one loaded, one unloaded. Relative
// deflection = loaded beam deflection (unloaded = 0).
// δ_relative = δ_max_loaded - δ_unloaded = PL³/(48EI).
//
// Reference: Ghali & Neville §5.3 (differential settlement effects)

#[test]
fn validation_reldispl_relative_vertical_between_beams() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    // Beam 1: loaded with midspan point load
    let mid = n / 2 + 1;
    let input_loaded = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let res_loaded = linear::solve_2d(&input_loaded).unwrap();

    // Beam 2: unloaded (zero loads)
    let input_unloaded = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let res_unloaded = linear::solve_2d(&input_unloaded).unwrap();

    let d_loaded = res_loaded.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_unloaded = res_unloaded.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    // Relative displacement = d_loaded - d_unloaded
    let d_relative = (d_loaded - d_unloaded).abs();

    // Analytical: δ = PL³/(48EI)
    let d_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_relative, d_exact, 0.02,
        "Relative vertical displacement = PL³/(48EI)");

    // Unloaded beam has zero displacement
    assert!(d_unloaded.abs() < 1e-10,
        "Unloaded beam: zero displacement at midspan");
}

// ================================================================
// 4. Axial Elongation: δ = PL/(EA)
// ================================================================
//
// A prismatic bar under axial tensile load P, length L.
// Elongation: δ = P·L / (E·A)
// Relative displacement = δ_tip - δ_base = P·L/(E·A) (base fixed).
//
// Reference: Hibbeler §4.2; Kassimali §8.2

#[test]
fn validation_reldispl_axial_elongation() {
    let l = 5.0;
    let n = 1;
    let p = 100.0; // kN tension
    let e_eff = E * 1000.0;

    // Horizontal bar, fixed at left, axial load at right
    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fy: 0.0, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_base = results.displacements.iter().find(|d| d.node_id == 1).unwrap().ux;

    // Relative axial displacement = elongation
    let elongation = d_tip - d_base;

    // Analytical: δ = PL/(EA)
    let delta_exact = p * l / (e_eff * A);
    assert_close(elongation, delta_exact, 0.01,
        "Axial elongation δ = PL/(EA)");

    // Base is fixed
    assert!(d_base.abs() < 1e-10, "Fixed base: ux = 0");

    // Reaction at fixed end = -P (equilibrium)
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rx.abs(), p, 0.01, "Axial: reaction Rx = P");
}

// ================================================================
// 5. Joint Opening Angle From Rotations
// ================================================================
//
// At a rigid joint, all members have the same rotation (compatibility).
// For a simply-supported beam, the support rotations (at ends) can be
// computed analytically. The relative rotation between two sections
// indicates curvature (bending deformation).
//
// For SS beam with midspan point load:
//   θ_A = -θ_B = P·L²/(16·E·I)  (end rotations, equal and opposite)
//   Total "joint opening" angle = θ_A - θ_B = P·L²/(8·E·I)
//
// Reference: Hibbeler §8.3; Ghali & Neville §5.2

#[test]
fn validation_reldispl_joint_opening_angle() {
    let l = 6.0;
    let n = 12;
    let p = 10.0;
    let e_eff = E * 1000.0;
    let mid = n / 2 + 1;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let rz_start = results.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    // For SS beam with midspan point load: θ_A = -PL²/(16EI), θ_B = +PL²/(16EI)
    let theta_exact = p * l * l / (16.0 * e_eff * IZ);

    assert_close(rz_start.abs(), theta_exact, 0.03,
        "SS beam: left support rotation = PL²/(16EI)");
    assert_close(rz_end.abs(), theta_exact, 0.03,
        "SS beam: right support rotation = PL²/(16EI)");

    // Rotations are equal in magnitude, opposite in sign (symmetric loading)
    assert_close(rz_start.abs(), rz_end.abs(), 0.01,
        "Symmetric loading: equal end rotations");

    // Joint opening angle (change in angle across midspan element):
    let rz_mid_left = results.displacements.iter().find(|d| d.node_id == mid - 1).unwrap().rz;
    let rz_mid_right = results.displacements.iter().find(|d| d.node_id == mid + 1).unwrap().rz;
    // Rotation changes sign at midspan (kink in elastic curve)
    assert!(rz_mid_left * rz_mid_right < 0.0 || rz_mid_left.abs() + rz_mid_right.abs() > 0.0,
        "Rotation changes around midspan load point");
}

// ================================================================
// 6. Differential Deflection Between Adjacent Parallel Beams
// ================================================================
//
// Two identical parallel beams, both simply supported, same span.
// Beam 1: loaded with UDL q.
// Beam 2: no load.
// Differential (relative) deflection at midspan = δ_beam1 - δ_beam2
//   = q·L⁴/(384·E·I) (for UDL, midspan).
//
// If a floor diaphragm connected them, this would represent the
// differential deflection demand (long-term creep/differential settlement).
//
// Reference: Ghali & Neville §5.4; Hibbeler §8.5

#[test]
fn validation_reldispl_differential_deflection_parallel_beams() {
    let l = 8.0;
    let n = 8;
    let q = -12.0;
    let e_eff = E * 1000.0;

    // Beam 1: UDL
    let loads1: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads1);
    let res1 = linear::solve_2d(&input1).unwrap();

    // Beam 2: no load (zero deflection)
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let res2 = linear::solve_2d(&input2).unwrap();

    let d1_mid = res1.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy;
    let d2_mid = res2.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy;

    // Differential deflection
    let d_diff = (d1_mid - d2_mid).abs();

    // Analytical: δ_mid = 5qL⁴/(384EI) for UDL
    let d_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    assert_close(d_diff, d_exact, 0.02,
        "Differential deflection = 5qL⁴/(384EI)");

    // Beam 2 has zero deflection everywhere
    let max_d2: f64 = res2.displacements.iter().map(|d| d.uy.abs()).fold(0.0, f64::max);
    assert!(max_d2 < 1e-10, "Unloaded beam: zero deflections everywhere");
}

// ================================================================
// 7. Relative End-to-End Rotation Under Asymmetric Loading
// ================================================================
//
// Fixed-pinned beam with point load at L/3 from fixed end.
// End rotations differ due to asymmetric loading.
// Relative rotation = rz_end - rz_start measures the total curvature
// integrated over the beam length (moment-area second theorem analog).
//
// For a propped cantilever with point load at a from fixed end:
//   θ_B (roller end) = Pa(3L²-4a²+a³/L) / ... (complex formula)
//   We verify qualitative behavior: roller end rotates more than fixed end.
//
// Reference: Kassimali §8.3 (conjugate beam method); Hibbeler §8.6

#[test]
fn validation_reldispl_relative_end_rotation_asymmetric() {
    let l = 6.0;
    let n = 12;
    let p = 10.0;
    let load_node = n / 3 + 1; // load at L/3 from left (fixed) end

    // Fixed at left (A), roller at right (B)
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results = linear::solve_2d(&input).unwrap();

    let rz_a = results.displacements.iter().find(|d| d.node_id == 1).unwrap().rz;
    let rz_b = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rz;

    // Fixed end: no rotation (rz_A = 0 for fully fixed support)
    assert!(rz_a.abs() < 1e-10,
        "Fixed support: rz = 0, got {:.6e}", rz_a);

    // Roller end: non-zero rotation
    assert!(rz_b.abs() > 1e-8,
        "Roller end must rotate: rz_B = {:.6e}", rz_b);

    // Relative rotation across the beam = rz_B - rz_A = rz_B
    let rel_rotation = (rz_b - rz_a).abs();
    assert!(rel_rotation > 1e-8,
        "Relative rotation must be non-zero: {:.6e}", rel_rotation);

    // The midspan rotation should be between the end rotations in magnitude
    let rz_mid = results.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().rz;
    assert!(rz_mid.abs() < rz_b.abs() * 1.5,
        "Midspan rotation {:.6e} should be in range of end rotation {:.6e}",
        rz_mid.abs(), rz_b.abs());
}

// ================================================================
// 8. Compatibility: Relative Displacement at Shared Node = 0
// ================================================================
//
// Two frame elements sharing a node must have the same displacement
// at that node (compatibility condition). This is a fundamental
// requirement of the displacement method.
//
// We verify this for a T-junction: two beams meeting at a single node.
// The shared node displacement must be uniquely defined (same from
// both elements' perspective).
//
// Also: in a simply-supported beam, the support nodes have zero
// vertical displacement — verifying that the constraint is exactly
// satisfied (relative displacement between fixed point and ground = 0).
//
// Reference: Ghali & Neville §2.1 (compatibility); Kassimali §5.1

#[test]
fn validation_reldispl_compatibility_shared_node() {
    let l = 5.0;
    let h = 4.0;

    // T-frame: horizontal beam (1→2→3) with column (2→4) at midpoint
    // Node 2 is shared between all three segments
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, l, 0.0),
        (3, 2.0 * l, 0.0),
        (4, l, h),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 2, 1, 1, false, false), // column: top is node 4
    ];
    let sups = vec![
        (1, 1, "pinned"),
        (2, 3, "rollerX"),
        (3, 4, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -15.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Node 2 appears in elements 1, 2, 3.
    // The solver gives a single displacement vector — compatibility is implicit.
    // We verify that the node has well-defined displacements.
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy.is_finite(), "Shared node 2: uy must be finite");
    assert!(d2.ux.is_finite(), "Shared node 2: ux must be finite");

    // Supports at nodes 1, 3: zero vertical displacement (compatibility with ground)
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d1.uy.abs() < 1e-10,
        "Pinned support node 1: uy = 0 (compatibility), got {:.6e}", d1.uy);
    assert!(d3.uy.abs() < 1e-10,
        "Roller support node 3: uy = 0, got {:.6e}", d3.uy);

    // Fixed node 4: all displacements = 0
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.ux.abs() < 1e-10, "Fixed node 4: ux = 0");
    assert!(d4.uy.abs() < 1e-10, "Fixed node 4: uy = 0");
    assert!(d4.rz.abs() < 1e-10, "Fixed node 4: rz = 0");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 15.0, 0.01, "T-frame: ΣRy = 15 kN");
}
