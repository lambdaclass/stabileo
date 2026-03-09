/// Validation: Second-Order (P-Delta) Effects — Extended Tests
///
/// References:
///   - AISC 360-22, Appendix 8 (Approximate Second-Order Analysis)
///   - Timoshenko & Gere, "Theory of Elastic Stability", Ch. 1-2
///   - Chen & Lui, "Structural Stability", Ch. 4 (Beam-Column Theory)
///   - Galambos & Surovek, "Structural Stability of Steel", Ch. 3-4
///
/// These extended tests cover additional P-delta scenarios:
///   1. Convergence metadata: iterations, converged flag, is_stable
///   2. B2 factor from solver matches displacement ratio
///   3. Symmetric frame: equal amplification at both top nodes
///   4. Lean-on column: gravity on one column, lateral on another
///   5. Soft-story effect: weaker story attracts more drift
///   6. P-delta with distributed lateral load on column
///   7. Monotonic amplification: increasing gravity -> increasing B2
///   8. P-delta reaction equilibrium: sum of reactions balances loads
use dedaliano_engine::solver::{linear, pdelta};
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Convergence Metadata
// ================================================================
//
// For a moderate gravity load the P-delta solver should converge
// within a reasonable number of iterations and report stable.

#[test]
fn validation_pdelta_ext_convergence_metadata() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p = 100.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, -p);
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Should converge in well under 20 iterations
    assert!(pd.converged, "P-delta should converge");
    assert!(pd.is_stable, "Structure should be stable");
    assert!(pd.iterations > 0, "At least one iteration");
    assert!(pd.iterations <= 20, "Converges within limit: {} iter", pd.iterations);

    // B2 factor should be > 1 (compression amplifies)
    assert!(pd.b2_factor > 1.0, "B2 > 1: {:.4}", pd.b2_factor);
}

// ================================================================
// 2. B2 Factor Matches Displacement Ratio
// ================================================================
//
// The solver reports b2_factor = max(|u_pdelta| / |u_linear|).
// Verify that the reported B2 is consistent with the actual
// displacement amplification at the sway DOF.

#[test]
fn validation_pdelta_ext_b2_vs_displacement_ratio() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p = 150.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, -p);

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Compute displacement ratio at the sway node
    let d_lin = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_pd = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ratio_node2: f64 = (d_pd / d_lin).abs();

    // The solver's b2_factor is the maximum ratio across all DOFs,
    // so it must be >= the ratio at any single node.
    assert!(pd.b2_factor >= ratio_node2 * 0.95,
        "Solver B2 ({:.4}) >= node ratio ({:.4})", pd.b2_factor, ratio_node2);

    // Both should be > 1 for compression case
    assert!(ratio_node2 > 1.0, "Displacement amplified: ratio = {:.4}", ratio_node2);
    assert!(pd.b2_factor > 1.0, "B2 > 1: {:.4}", pd.b2_factor);
}

// ================================================================
// 3. Symmetric Frame: Equal Amplification at Both Top Nodes
// ================================================================
//
// A symmetric portal frame with symmetric gravity and NO lateral
// load should show zero (or negligible) lateral drift in both
// linear and P-delta analyses. With a small lateral perturbation
// and symmetric gravity, the amplification at both top corners
// should be comparable.

#[test]
fn validation_pdelta_ext_symmetric_frame() {
    let h = 4.0;
    let w = 6.0;
    let p = 120.0;
    let f_small = 5.0; // small lateral push at node 2

    let input = make_portal_frame(h, w, E, A, IZ, f_small, -p);

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Both top nodes (2 and 3) should sway in the same direction
    let d2_lin = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3_lin = lin.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d2_pd = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3_pd = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    // Rigid beam: nodes 2 and 3 should have similar lateral displacement
    // (beam is stiff so they move together)
    assert_close(d2_lin, d3_lin, 0.10, "Linear: top nodes sway together");
    assert_close(d2_pd, d3_pd, 0.10, "P-delta: top nodes sway together");

    // Amplification should be similar for both top nodes
    let amp2: f64 = (d2_pd / d2_lin).abs();
    let amp3: f64 = (d3_pd / d3_lin).abs();
    let amp_diff: f64 = (amp2 - amp3).abs();
    assert!(amp_diff < 0.05,
        "Symmetric amplification: amp2={:.4}, amp3={:.4}, diff={:.4}", amp2, amp3, amp_diff);
}

// ================================================================
// 4. Lean-On Column Effect
// ================================================================
//
// A frame where gravity acts on one column but lateral resistance
// comes from another. The "leaning" column destabilizes the frame
// even though the lateral force is applied elsewhere.
// Compare: frame with gravity on both columns vs gravity on one only.

#[test]
fn validation_pdelta_ext_lean_on_column() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p_total = 200.0;

    // Case A: gravity split equally on both columns
    let input_a = make_portal_frame(h, w, E, A, IZ, f, -p_total / 2.0);

    // Case B: all gravity on one column (node 3), lateral on node 2
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p_total, mz: 0.0 }),
    ];
    let input_b = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads_b);

    let pd_a = pdelta::solve_pdelta_2d(&input_a, 20, 1e-6).unwrap();
    let pd_b = pdelta::solve_pdelta_2d(&input_b, 20, 1e-6).unwrap();

    let d_a = pd_a.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d_b = pd_b.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // Both should converge and produce drift in the same direction
    assert!(pd_a.converged, "Case A converges");
    assert!(pd_b.converged, "Case B converges");
    assert!(d_a * d_b > 0.0, "Both drift in same direction");

    // Concentrating all gravity on one column (lean-on) produces
    // more total P-delta effect than splitting it evenly, because
    // the total gravity is the same but one column is heavily loaded.
    assert!(d_b.abs() > d_a.abs(),
        "Lean-on drift > balanced: {:.6e} > {:.6e}", d_b.abs(), d_a.abs());
}

// ================================================================
// 5. Soft-Story Effect
// ================================================================
//
// In a two-story frame where the bottom story has weaker columns,
// P-delta effects concentrate in the softer story, producing
// larger inter-story drift amplification there.

#[test]
fn validation_pdelta_ext_soft_story() {
    let w = 6.0;
    let h = 3.5;
    let f = 8.0;
    let p = 80.0;

    // IZ_weak for bottom story, IZ for top story
    let iz_weak: f64 = IZ * 0.3; // 30% of normal stiffness

    // Build 2-story frame with different section properties
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0),           // ground
        (3, 0.0, h), (4, w, h),                 // floor 1
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),    // floor 2
    ];
    // Section 1: weak (bottom columns), Section 2: normal (top columns + beams)
    let elems = vec![
        (1, "frame", 1, 3, 1, 1, false, false), // left col, bottom (weak)
        (2, "frame", 2, 4, 1, 1, false, false), // right col, bottom (weak)
        (3, "frame", 3, 4, 1, 2, false, false), // beam floor 1 (normal)
        (4, "frame", 3, 5, 1, 2, false, false), // left col, top (normal)
        (5, "frame", 4, 6, 1, 2, false, false), // right col, top (normal)
        (6, "frame", 5, 6, 1, 2, false, false), // beam floor 2 (normal)
    ];
    let sups = vec![(1, 1, "fixed"), (2, 2, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: f, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: f, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, iz_weak), (2, A, IZ)],
        elems,
        sups,
        loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    // Inter-story drifts
    let d1_lin = lin.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d2_lin = lin.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;
    let d1_pd = pd.results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let d2_pd = pd.results.displacements.iter().find(|d| d.node_id == 5).unwrap().ux;

    // Story drifts (inter-story)
    let drift1_lin: f64 = d1_lin.abs();          // story 1: ground to floor 1
    let drift2_lin: f64 = (d2_lin - d1_lin).abs(); // story 2: floor 1 to floor 2
    let drift1_pd: f64 = d1_pd.abs();
    let drift2_pd: f64 = (d2_pd - d1_pd).abs();

    // Amplification per story
    let amp1: f64 = drift1_pd / drift1_lin;
    let amp2: f64 = drift2_pd / drift2_lin;

    // The soft (weak) bottom story should have larger amplification
    assert!(amp1 > 1.0, "Bottom story amplified: {:.4}", amp1);
    assert!(amp1 > amp2,
        "Soft story has more amplification: amp1={:.4} > amp2={:.4}", amp1, amp2);
}

// ================================================================
// 6. P-Delta with Distributed Lateral Load
// ================================================================
//
// A cantilever column with distributed lateral load (wind-like)
// plus axial compression. P-delta should amplify the tip deflection
// beyond the linear result.

#[test]
fn validation_pdelta_ext_distributed_lateral() {
    let h = 5.0;
    let n = 10;
    let q_lat = 5.0;    // distributed lateral load (kN/m)
    let p_grav = 150.0;  // axial compression at tip

    let mut nodes = Vec::new();
    let mut elems = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, i as f64 * h / n as f64));
        if i > 0 {
            elems.push((i, "frame", i, i + 1, 1, 1, false, false));
        }
    }

    // Distributed lateral load on each element + gravity at tip
    let mut loads = Vec::new();
    for i in 1..=n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q_lat,
            q_j: q_lat,
            a: None,
            b: None,
        }));
    }
    loads.push(SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p_grav, mz: 0.0,
    }));

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed")], loads,
    );

    let lin = linear::solve_2d(&input).unwrap();
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

    let tip_lin = lin.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let tip_pd = pd.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;

    // P-delta amplifies tip deflection
    assert!(tip_pd.abs() > tip_lin.abs(),
        "P-delta amplifies distributed load: {:.6e} > {:.6e}", tip_pd.abs(), tip_lin.abs());

    // Amplification should be moderate (not diverged)
    let amp: f64 = tip_pd.abs() / tip_lin.abs();
    assert!(amp > 1.0 && amp < 5.0,
        "Reasonable amplification: {:.4}", amp);

    // P-delta base moment should also be larger
    let m_base_lin = lin.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();
    let m_base_pd = pd.results.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();
    assert!(m_base_pd > m_base_lin,
        "Base moment amplified: {:.4} > {:.4}", m_base_pd, m_base_lin);
}

// ================================================================
// 7. Monotonic Amplification with Increasing Gravity
// ================================================================
//
// As gravity load increases toward the critical load, the
// amplification factor should increase monotonically.
// Test with 5 load levels and verify strict ordering.

#[test]
fn validation_pdelta_ext_monotonic_amplification() {
    let h = 4.0;
    let w = 6.0;
    let f = 5.0;

    let gravity_levels = [20.0, 60.0, 100.0, 140.0, 180.0];
    let mut b2_values = Vec::new();

    for &p in &gravity_levels {
        let input = make_portal_frame(h, w, E, A, IZ, f, -p);
        let lin = linear::solve_2d(&input).unwrap();
        let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();

        let d_lin = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        let d_pd = pd.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
        let b2: f64 = (d_pd / d_lin).abs();
        b2_values.push(b2);
    }

    // All B2 values should be > 1
    for (i, &b2) in b2_values.iter().enumerate() {
        assert!(b2 > 1.0,
            "B2[{}] > 1.0: {:.4} (P={:.0})", i, b2, gravity_levels[i]);
    }

    // Strict monotonic increase
    for i in 1..b2_values.len() {
        assert!(b2_values[i] > b2_values[i - 1],
            "B2 monotonic: B2[{}]={:.4} > B2[{}]={:.4}",
            i, b2_values[i], i - 1, b2_values[i - 1]);
    }

    // The range should be reasonable (not diverged)
    assert!(b2_values[0] < 1.5, "Lowest load: B2 < 1.5: {:.4}", b2_values[0]);
    assert!(*b2_values.last().unwrap() < 5.0,
        "Highest load: B2 < 5: {:.4}", b2_values.last().unwrap());
}

// ================================================================
// 8. P-Delta Reaction Equilibrium
// ================================================================
//
// After P-delta analysis, global equilibrium must still hold:
// the sum of all reactions should balance the sum of applied loads.

#[test]
fn validation_pdelta_ext_reaction_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let f = 10.0;
    let p = 120.0;

    let input = make_portal_frame(h, w, E, A, IZ, f, -p);
    let pd = pdelta::solve_pdelta_2d(&input, 20, 1e-6).unwrap();
    let results = &pd.results;

    // Applied loads: fx=10 at node 2, fy=-120 at nodes 2 and 3
    let applied_fx: f64 = f;
    let applied_fy: f64 = -p * 2.0; // gravity on both nodes

    // Sum of reactions
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    // Horizontal equilibrium: sum_rx + applied_fx ~ 0
    // In P-delta, geometric stiffness introduces small additional
    // equivalent forces, so we use a relative tolerance on the total load.
    let fx_residual: f64 = (sum_rx + applied_fx).abs();
    let fx_rel: f64 = fx_residual / applied_fx.abs();
    assert!(fx_rel < 0.05,
        "Horizontal equilibrium: residual/load = {:.4} (sum_rx={:.4}, applied_fx={:.4})",
        fx_rel, sum_rx, applied_fx);

    // Vertical equilibrium: sum_ry + applied_fy ~ 0
    let fy_residual: f64 = (sum_ry + applied_fy).abs();
    let fy_rel: f64 = fy_residual / applied_fy.abs();
    assert!(fy_rel < 0.01,
        "Vertical equilibrium: residual/load = {:.4} (sum_ry={:.4}, applied_fy={:.4})",
        fy_rel, sum_ry, applied_fy);

    // Linear results should satisfy equilibrium more tightly
    let lin_sum_rx: f64 = pd.linear_results.reactions.iter().map(|r| r.rx).sum();
    let lin_sum_ry: f64 = pd.linear_results.reactions.iter().map(|r| r.ry).sum();
    assert!((lin_sum_rx + applied_fx).abs() < 0.1,
        "Linear horizontal equilibrium: {:.6e}", (lin_sum_rx + applied_fx).abs());
    assert!((lin_sum_ry + applied_fy).abs() < 0.1,
        "Linear vertical equilibrium: {:.6e}", (lin_sum_ry + applied_fy).abs());
}
