/// Validation: Sway Frame Analysis
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///
/// Tests verify lateral stiffness, antisymmetric moment patterns,
/// portal method approximations, fixed-vs-pinned comparisons,
/// superposition, multi-story drift, leaning columns, and equilibrium.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Portal Frame Lateral Stiffness
// ================================================================
//
// Fixed-base portal frame, h=4m, w=6m, lateral H=10kN at top.
// For a fixed-base portal with equal columns: k ~ 24EI/h^3.
// Verify sway is reasonable and both columns share the lateral load.

#[test]
fn validation_sway_portal_lateral_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;
    let e_eff = E * 1000.0; // kN/m^2

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Approximate lateral stiffness for fixed-base portal: k ~ 24EI/h^3
    let k_approx = 24.0 * e_eff * IZ / h.powi(3);
    let delta_approx = lateral / k_approx;

    // Get sway at top nodes (nodes 2 and 3)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();

    // Both top nodes should sway in the same direction (rigid beam assumption)
    assert!(d2.ux > 0.0, "Node 2 should sway in direction of lateral load");
    assert!(d3.ux > 0.0, "Node 3 should sway in direction of lateral load");

    // Sway should be in the right ballpark (within factor of 2 of approximation)
    let avg_sway = (d2.ux + d3.ux) / 2.0;
    assert!(avg_sway > delta_approx * 0.3 && avg_sway < delta_approx * 3.0,
        "Sway {:.6e} should be in ballpark of approx {:.6e}", avg_sway, delta_approx);

    // Both columns should share the lateral load: check column shears sum to H
    // Element 1: column 1->2 (left), Element 3: column 3->4 (right, note node order)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Column shears (horizontal reaction) should sum to approximately H
    // For vertical columns, the shear force provides the horizontal resistance.
    let v_left = ef1.v_start;
    let v_right = ef3.v_end; // end is at base (node 4)
    // Both columns carry shear; their contributions should sum to H in magnitude
    let total_shear = v_left.abs() + v_right.abs();
    assert_close(total_shear, lateral, 0.05, "Total column shear vs lateral load");
}

// ================================================================
// 2. Anti-Symmetric Sway Pattern
// ================================================================
//
// Portal frame under pure lateral load: the base moments at the
// two fixed columns should be equal in magnitude (antisymmetry).

#[test]
fn validation_sway_antisymmetric_moments() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions at fixed bases (nodes 1 and 4)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // For a symmetric portal under lateral load, the base moments
    // should be equal in magnitude. Due to the geometry being symmetric
    // about the midline, both columns deform identically.
    let m_base_left = r1.mz.abs();
    let m_base_right = r4.mz.abs();

    let ratio = m_base_left / m_base_right;
    assert!(ratio > 0.5 && ratio < 2.0,
        "Base moments should be comparable: left={:.4}, right={:.4}, ratio={:.4}",
        m_base_left, m_base_right, ratio);

    // More precisely, for symmetric portal with equal columns and beam,
    // base moments should be quite close
    let rel_diff = (m_base_left - m_base_right).abs() / m_base_left.max(m_base_right);
    assert!(rel_diff < 0.3,
        "Base moments should be close: left={:.4}, right={:.4}, rel_diff={:.4}",
        m_base_left, m_base_right, rel_diff);
}

// ================================================================
// 3. Portal Method Check for Two-Bay Frame
// ================================================================
//
// Two-bay, one-story frame. H=30kN lateral at node 2.
// Portal method: interior column takes twice the shear of exterior.
// V_ext ~ H/4, V_int ~ H/2.

#[test]
fn validation_sway_two_bay_portal_method() {
    let h = 4.0;
    let lateral = 30.0;

    // Nodes: 1(0,0), 2(0,4), 3(5,4), 4(5,0), 5(10,4), 6(10,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, 5.0, h),   (4, 5.0, 0.0),
        (5, 10.0, h),  (6, 10.0, 0.0),
    ];

    // Columns: 1->2 (left ext), 4->3 (interior), 6->5 (right ext)
    // Beams: 2->3, 3->5
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 4, 3, 1, 1, false, false), // interior column
        (3, "frame", 6, 5, 1, 1, false, false), // right column
        (4, "frame", 2, 3, 1, 1, false, false), // left beam
        (5, "frame", 3, 5, 1, 1, false, false), // right beam
    ];

    let sups = vec![
        (1, 1, "fixed"),
        (2, 4, "fixed"),
        (3, 6, "fixed"),
    ];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Extract column shears (shear in vertical members = horizontal force)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_int  = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    let v_left  = ef_left.v_start.abs();
    let v_int   = ef_int.v_start.abs();
    let v_right = ef_right.v_start.abs();

    // Portal method predicts: V_int ~ 2 * V_ext
    // This is approximate; verify the interior column takes more shear
    assert!(v_int > v_left,
        "Interior column shear ({:.4}) should exceed exterior left ({:.4})", v_int, v_left);
    assert!(v_int > v_right,
        "Interior column shear ({:.4}) should exceed exterior right ({:.4})", v_int, v_right);

    // The total shear should equal the applied lateral load
    let total = v_left + v_int + v_right;
    assert_close(total, lateral, 0.05, "Total column shear vs applied lateral");

    // Interior-to-exterior ratio should be roughly 2 (portal method approximation)
    let avg_ext = (v_left + v_right) / 2.0;
    let ratio = v_int / avg_ext;
    assert!(ratio > 1.0 && ratio < 4.0,
        "Interior/exterior shear ratio {:.2} should be roughly 2", ratio);
}

// ================================================================
// 4. Fixed vs Pinned Base Sway Comparison
// ================================================================
//
// Pinned base portal is more flexible than fixed base.
// Stiffness ratio: fixed ~ 24EI/h^3 vs pinned ~ 6EI/h^3, so pinned
// sway should be roughly 4x the fixed sway.

#[test]
fn validation_sway_fixed_vs_pinned_base() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Case 1: Fixed base (from make_portal_frame)
    let input_fixed = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let results_fixed = linear::solve_2d(&input_fixed).unwrap();

    // Case 2: Pinned base (manual construction)
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];
    let input_pinned = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results_pinned = linear::solve_2d(&input_pinned).unwrap();

    // Get sway at node 2
    let d2_fixed = results_fixed.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d2_pinned = results_pinned.displacements.iter().find(|d| d.node_id == 2).unwrap();

    let sway_fixed = d2_fixed.ux.abs();
    let sway_pinned = d2_pinned.ux.abs();

    // Pinned base should be significantly more flexible
    assert!(sway_pinned > sway_fixed,
        "Pinned sway ({:.6e}) should exceed fixed sway ({:.6e})", sway_pinned, sway_fixed);

    // Ratio should be in the ballpark of 4 (exact depends on beam stiffness)
    let ratio = sway_pinned / sway_fixed;
    assert!(ratio > 1.5 && ratio < 10.0,
        "Sway ratio pinned/fixed = {:.2}, expected roughly 2-6", ratio);
}

// ================================================================
// 5. Sway with Gravity — Superposition
// ================================================================
//
// Portal frame with lateral H=10kN and gravity G=-20kN.
// By linearity: combined = lateral-only + gravity-only.

#[test]
fn validation_sway_superposition() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;
    let gravity = -20.0;

    // Lateral only
    let input_h = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_h = linear::solve_2d(&input_h).unwrap();

    // Gravity only
    let input_g = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let res_g = linear::solve_2d(&input_g).unwrap();

    // Combined
    let input_hg = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let res_hg = linear::solve_2d(&input_hg).unwrap();

    // Check superposition at each node
    for node_id in [1, 2, 3, 4] {
        let dh = res_h.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let dg = res_g.displacements.iter().find(|d| d.node_id == node_id).unwrap();
        let dhg = res_hg.displacements.iter().find(|d| d.node_id == node_id).unwrap();

        let ux_sum = dh.ux + dg.ux;
        let uy_sum = dh.uy + dg.uy;
        let rz_sum = dh.rz + dg.rz;

        assert_close(dhg.ux, ux_sum, 0.05,
            &format!("Superposition ux at node {}", node_id));
        assert_close(dhg.uy, uy_sum, 0.05,
            &format!("Superposition uy at node {}", node_id));
        assert_close(dhg.rz, rz_sum, 0.05,
            &format!("Superposition rz at node {}", node_id));
    }
}

// ================================================================
// 6. Multi-Story Frame Sway
// ================================================================
//
// 2-story frame with lateral loads at each level.
// Nodes: 1(0,0), 2(0,3.5), 3(6,3.5), 4(6,0), 5(0,7), 6(6,7)
// Verify inter-story drift and total top sway consistency.

#[test]
fn validation_sway_multi_story() {
    let h1 = 3.5;
    let h2 = 3.5;
    let w = 6.0;
    let h1_load = 20.0;
    let h2_load = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h1),
        (3, w, h1),
        (4, w, 0.0),
        (5, 0.0, h1 + h2),
        (6, w, h1 + h2),
    ];

    // Columns: 1->2, 4->3, 2->5, 3->6
    // Beams: 2->3, 5->6
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left col, story 1
        (2, "frame", 4, 3, 1, 1, false, false), // right col, story 1
        (3, "frame", 2, 5, 1, 1, false, false), // left col, story 2
        (4, "frame", 3, 6, 1, 1, false, false), // right col, story 2
        (5, "frame", 2, 3, 1, 1, false, false), // beam, story 1
        (6, "frame", 5, 6, 1, 1, false, false), // beam, story 2
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: h1_load, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h2_load, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let d5 = results.displacements.iter().find(|d| d.node_id == 5).unwrap();
    let d6 = results.displacements.iter().find(|d| d.node_id == 6).unwrap();

    // Story 1 drift: average lateral displacement at level 1
    let drift_1 = (d2.ux + d3.ux) / 2.0;

    // Story 2 drift: difference between level 2 and level 1 displacements
    let drift_2 = ((d5.ux - d2.ux) + (d6.ux - d3.ux)) / 2.0;

    // Total top sway should equal sum of story drifts
    let top_sway = (d5.ux + d6.ux) / 2.0;
    let sum_drifts = drift_1 + drift_2;

    assert_close(top_sway, sum_drifts, 0.05, "Top sway = sum of story drifts");

    // All sway should be positive (in direction of applied loads)
    assert!(drift_1 > 0.0, "Story 1 drift should be positive");
    assert!(drift_2 > 0.0, "Story 2 drift should be positive");
    assert!(top_sway > drift_1, "Top sway should exceed first story drift");

    // Story 1 should have larger drift than story 2 (more total shear)
    assert!(drift_1 > drift_2,
        "Story 1 drift ({:.6e}) should exceed story 2 drift ({:.6e}) due to higher total shear",
        drift_1, drift_2);
}

// ================================================================
// 7. Leaning Column Effect
// ================================================================
//
// Portal frame with one column pinned top and bottom (leaning column).
// The leaning column contributes zero lateral stiffness; all lateral
// resistance comes from the fixed column.

#[test]
fn validation_sway_leaning_column() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Nodes: 1(0,0), 2(0,4), 3(6,4), 4(6,0)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w, h),     (4, w, 0.0),
    ];

    // Column 1->2: standard frame (provides all lateral stiffness)
    // Column 4->3: leaning column (hinged at both ends)
    // Beam 2->3: connects the two columns
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // rigid column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 4, 3, 1, 1, true, true),   // leaning column (hinged both ends)
    ];

    let sups = vec![(1, 1, "fixed"), (2, 4, "pinned")];

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // The leaning column (element 3) should carry essentially zero shear
    let ef_lean = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Shear in leaning column should be near zero
    assert!(ef_lean.v_start.abs() < 0.5,
        "Leaning column shear at start ({:.4}) should be near zero", ef_lean.v_start);
    assert!(ef_lean.v_end.abs() < 0.5,
        "Leaning column shear at end ({:.4}) should be near zero", ef_lean.v_end);

    // Moments at both ends of leaning column should be zero (hinged)
    assert!(ef_lean.m_start.abs() < 0.5,
        "Leaning column moment at start ({:.4}) should be near zero", ef_lean.m_start);
    assert!(ef_lean.m_end.abs() < 0.5,
        "Leaning column moment at end ({:.4}) should be near zero", ef_lean.m_end);

    // The fixed column (element 1) should resist the entire lateral load
    let ef_fixed = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_fixed.v_start.abs(), lateral, 0.05,
        "Fixed column shear should equal full lateral load");
}

// ================================================================
// 8. Sway Frame Equilibrium
// ================================================================
//
// Portal frame with H=15kN lateral and G=-25kN per node gravity.
// Verify: sum(rx) + H = 0 and sum(ry) + total_gravity = 0.

#[test]
fn validation_sway_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 15.0;
    let gravity = -25.0;

    let input = make_portal_frame(h, w, E, A, IZ, lateral, gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Sum of horizontal reactions should balance lateral load
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -lateral, 0.05, "Horizontal equilibrium: sum_rx + H = 0");

    // Sum of vertical reactions should balance total gravity
    // Gravity applied at nodes 2 and 3, so total = 2 * gravity
    let total_gravity = 2.0 * gravity;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_gravity, 0.05, "Vertical equilibrium: sum_ry + G = 0");

    // Moment equilibrium about node 1:
    // H*h + gravity*0 (at node 2, x=0) + gravity*w (at node 3, x=w) + sum(mz) + R4y*w = 0
    // This is a more complex check; verify that all reaction components are non-zero
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // Both supports should have non-trivial reactions
    assert!(r1.rx.abs() > 0.1, "Left base should have horizontal reaction");
    assert!(r4.rx.abs() > 0.1, "Right base should have horizontal reaction");
    assert!(r1.ry.abs() > 0.1, "Left base should have vertical reaction");
    assert!(r4.ry.abs() > 0.1, "Right base should have vertical reaction");

    // Moment equilibrium about node 1 (origin):
    // Using M = x*Fy - y*Fx for each load point:
    //   Node 2 (0,h): lateral fx=H at y=h => M = 0*0 - h*H = -h*H
    //                 gravity fy=G at x=0 => M = 0*G = 0
    //   Node 3 (w,h): gravity fy=G at x=w => M = w*G - h*0 = w*G
    // Total applied moment = -H*h + G*w
    let applied_moment = -lateral * h + gravity * w;
    // Reaction moment about node 1:
    //   Node 1 (0,0): just mz
    //   Node 4 (w,0): r4.ry * w + r4.mz (rx has zero arm since y=0)
    let reaction_moment = r4.ry * w + r1.mz + r4.mz;
    assert_close(reaction_moment, -applied_moment, 0.05,
        "Moment equilibrium about node 1");
}
