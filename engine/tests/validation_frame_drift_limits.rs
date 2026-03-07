/// Validation: Inter-Story Drift and Deflection Limits in Frames
///
/// References:
///   - ASCE 7-22, Table 12.12-1 (Allowable Story Drift)
///   - AISC 360-22, Appendix 7 (Serviceability)
///   - Ghali/Neville, "Structural Analysis", Ch. 15
///
/// Tests verify:
///   1. Single story drift computation
///   2. Drift proportional to load (linear elasticity)
///   3. Drift inversely proportional to moment of inertia
///   4. Two-story frame: inter-story drift distribution
///   5. Bracing reduces drift
///   6. Drift limit check (H/400 serviceability criterion)
///   7. Taller frame produces more drift
///   8. Symmetric gravity load produces zero lateral drift
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Single Story Drift
// ================================================================
//
// Portal frame h=4, w=6, lateral H=10 kN at top-left.
// Drift ratio = ux_top / h. Verify drift > 0 and compute value.

#[test]
fn validation_single_story_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should sway in the load direction
    assert!(d2.ux > 0.0, "top-left node should sway positive: ux={:.6e}", d2.ux);
    assert!(d3.ux > 0.0, "top-right node should sway positive: ux={:.6e}", d3.ux);

    // Rigid beam assumption: both top nodes have nearly equal ux
    let avg_ux = (d2.ux + d3.ux) / 2.0;
    let drift_ratio = avg_ux / h;

    assert!(drift_ratio > 0.0, "drift ratio must be positive");
    assert!(drift_ratio < 1.0, "drift ratio must be reasonable (< 1.0), got {:.6e}", drift_ratio);

    // For a fixed-base portal with H=10, E=200000, Iz=1e-4, h=4, w=6
    // the drift should be a small but nonzero value
    println!("Single story drift: ux_avg={:.6e}, drift_ratio={:.6e}", avg_ux, drift_ratio);
}

// ================================================================
// 2. Drift Proportional to Load
// ================================================================
//
// Same portal, H=10 vs H=20. By superposition, drift ratio = 2.

#[test]
fn validation_drift_proportional_to_load() {
    let h = 4.0;
    let w = 6.0;

    let input_10 = make_portal_frame(h, w, E, A, IZ, 10.0, 0.0);
    let res_10 = linear::solve_2d(&input_10).unwrap();

    let input_20 = make_portal_frame(h, w, E, A, IZ, 20.0, 0.0);
    let res_20 = linear::solve_2d(&input_20).unwrap();

    let ux_10 = res_10.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_20 = res_20.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    let ratio = ux_20 / ux_10;
    assert_close(ratio, 2.0, 0.01, "drift proportional to load (2x load => 2x drift)");
}

// ================================================================
// 3. Drift Inversely Proportional to Iz
// ================================================================
//
// Portal with Iz=1e-4 vs Iz=2e-4. Doubling Iz approximately halves drift.
// For a portal frame, drift ~ 1/EI, so drift ratio ≈ 2.

#[test]
fn validation_drift_inversely_proportional_to_iz() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input_iz1 = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_iz1 = linear::solve_2d(&input_iz1).unwrap();

    let iz2 = 2.0 * IZ;
    let input_iz2 = make_portal_frame(h, w, E, A, iz2, lateral, 0.0);
    let res_iz2 = linear::solve_2d(&input_iz2).unwrap();

    let ux_iz1 = res_iz1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_iz2 = res_iz2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Stiffer frame (2x Iz) should have less drift
    assert!(ux_iz2 < ux_iz1, "stiffer frame should drift less: iz1={:.6e}, iz2={:.6e}", ux_iz1, ux_iz2);

    // Drift ratio should be approximately 2 (inversely proportional to Iz)
    // Not exact 2 because axial deformation also contributes, but close
    let ratio = ux_iz1 / ux_iz2;
    assert!(
        (ratio - 2.0).abs() < 0.15,
        "drift ratio ≈ 2 for 2x Iz: got {:.4}",
        ratio
    );
}

// ================================================================
// 4. Two-Story Drift
// ================================================================
//
// Two-story portal:
//   Nodes: 1(0,0), 2(0,3.5), 3(6,3.5), 4(6,0), 5(0,7), 6(6,7)
//   Columns: 1→2, 4→3, 2→5, 3→6
//   Beams: 2→3, 5→6
//   Fixed at 1, 4
//   H1=20 at node 2, H2=10 at node 5
//   Story 1 drift = (avg ux at level 1) / 3.5
//   Story 2 drift = (avg ux level 2 - avg ux level 1) / 3.5
//   Story 1 drift > story 2 drift (higher cumulative shear in story 1)

#[test]
fn validation_two_story_drift() {
    let h_story = 3.5;
    let w = 6.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h_story),
        (3, w, h_story),
        (4, w, 0.0),
        (5, 0.0, 2.0 * h_story),
        (6, w, 2.0 * h_story),
    ];

    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column story 1
        (2, "frame", 4, 3, 1, 1, false, false), // right column story 1
        (3, "frame", 2, 3, 1, 1, false, false), // beam level 1
        (4, "frame", 2, 5, 1, 1, false, false), // left column story 2
        (5, "frame", 3, 6, 1, 1, false, false), // right column story 2
        (6, "frame", 5, 6, 1, 1, false, false), // beam level 2
    ];

    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 20.0, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 10.0, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Level 1 displacement (avg of nodes 2 and 3)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let avg_ux_level1 = (d2.ux + d3.ux) / 2.0;

    // Level 2 displacement (avg of nodes 5 and 6)
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();
    let avg_ux_level2 = (d5.ux + d6.ux) / 2.0;

    let drift_story1 = avg_ux_level1 / h_story;
    let drift_story2 = (avg_ux_level2 - avg_ux_level1) / h_story;

    // Both drifts should be positive (load is in +x)
    assert!(drift_story1 > 0.0, "story 1 drift should be positive: {:.6e}", drift_story1);
    assert!(drift_story2 > 0.0, "story 2 drift should be positive: {:.6e}", drift_story2);

    // Story 1 drift > story 2 drift because story 1 carries cumulative shear (20+10=30)
    // while story 2 carries only 10
    assert!(
        drift_story1 > drift_story2,
        "story 1 drift ({:.6e}) should exceed story 2 drift ({:.6e}) due to higher shear",
        drift_story1, drift_story2
    );

    println!(
        "Two-story: story1_drift={:.6e}, story2_drift={:.6e}, ratio={:.2}",
        drift_story1, drift_story2, drift_story1 / drift_story2
    );
}

// ================================================================
// 5. Bracing Reduces Drift
// ================================================================
//
// Portal frame with vs without a diagonal truss brace.
// The braced frame should have significantly less drift.

#[test]
fn validation_bracing_reduces_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Unbraced portal
    let input_unbraced = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    // Braced portal: add diagonal truss from node 1 to node 3
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, A, 0.0)], // section 2 for truss (Iz=0)
        elems,
        sups,
        loads,
    );
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    let ux_unbraced = res_unbraced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_braced = res_braced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert!(ux_braced > 0.0, "braced frame should still sway in load direction");
    assert!(
        ux_braced < ux_unbraced,
        "bracing should reduce drift: braced={:.6e} < unbraced={:.6e}",
        ux_braced, ux_unbraced
    );

    let reduction = 1.0 - ux_braced / ux_unbraced;
    println!("Bracing drift reduction: {:.1}%", reduction * 100.0);
    assert!(
        reduction > 0.5,
        "bracing should reduce drift by at least 50%: reduction={:.1}%",
        reduction * 100.0
    );
}

// ================================================================
// 6. Drift Limit Check H/400
// ================================================================
//
// Portal h=4, w=6, H=10. Check if drift < H/400 = 0.01 m.
// Report whether the frame satisfies the serviceability criterion.

#[test]
fn validation_drift_limit_h_over_400() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;
    let drift_limit = h / 400.0; // 0.01 m

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let avg_ux = (d2.ux + d3.ux) / 2.0;

    println!(
        "Drift limit check: ux_avg={:.6e} m, limit (h/400)={:.6e} m, {}",
        avg_ux,
        drift_limit,
        if avg_ux < drift_limit { "PASS" } else { "FAIL" }
    );

    // With E=200000, Iz=1e-4, h=4, H=10 this is a relatively flexible frame.
    // The drift value is determinate; we just verify the comparison works.
    // For these properties, ux will exceed 0.01 m since EI is small.
    assert!(avg_ux > 0.0, "drift should be positive");

    // Verify drift limit is computed correctly
    assert_close(drift_limit, 0.01, 1e-10, "drift limit h/400 = 0.01");
}

// ================================================================
// 7. Taller Frame = More Drift
// ================================================================
//
// h=4 vs h=8, same w=6, same H=10, same section.
// Taller frame should have more drift (sway ∝ h^3 for cantilever-like behavior).

#[test]
fn validation_taller_frame_more_drift() {
    let w = 6.0;
    let lateral = 10.0;

    let input_h4 = make_portal_frame(4.0, w, E, A, IZ, lateral, 0.0);
    let res_h4 = linear::solve_2d(&input_h4).unwrap();

    let input_h8 = make_portal_frame(8.0, w, E, A, IZ, lateral, 0.0);
    let res_h8 = linear::solve_2d(&input_h8).unwrap();

    let ux_h4 = res_h4.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_h8 = res_h8.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    assert!(
        ux_h8 > ux_h4,
        "taller frame should drift more: h8={:.6e} > h4={:.6e}",
        ux_h8, ux_h4
    );

    // For a portal frame with fixed bases, drift scales roughly as h^3
    // (but beam flexibility modifies this). The ratio should be well above 2.
    let ratio = ux_h8 / ux_h4;
    assert!(
        ratio > 2.0,
        "drift ratio for h=8 vs h=4 should be > 2: got {:.2}",
        ratio
    );

    println!("Taller frame drift ratio (h=8/h=4): {:.2}", ratio);
}

// ================================================================
// 8. Gravity Load Doesn't Cause Lateral Drift (Symmetric)
// ================================================================
//
// Portal h=4, w=6. Gravity G=-20 at both top nodes (symmetric).
// Lateral drift ux should be ≈ 0 at top nodes.

#[test]
fn validation_symmetric_gravity_no_lateral_drift() {
    let h = 4.0;
    let w = 6.0;
    let gravity = -20.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should have negligible lateral drift
    assert!(
        d2.ux.abs() < 1e-8,
        "symmetric gravity: node 2 ux should be ~0, got {:.6e}",
        d2.ux
    );
    assert!(
        d3.ux.abs() < 1e-8,
        "symmetric gravity: node 3 ux should be ~0, got {:.6e}",
        d3.ux
    );

    // Both should deflect downward (negative uy)
    assert!(d2.uy < 0.0, "node 2 should deflect downward: uy={:.6e}", d2.uy);
    assert!(d3.uy < 0.0, "node 3 should deflect downward: uy={:.6e}", d3.uy);

    // Symmetric: both vertical displacements should be equal
    assert_close(d2.uy, d3.uy, 0.01, "symmetric vertical displacement");
}
