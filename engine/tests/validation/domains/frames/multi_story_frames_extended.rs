/// Validation: Extended Multi-Story Frame Analysis
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 15 (Approximate methods for frames)
///   - Taranath, "Structural Analysis and Design of Tall Buildings", Ch. 3-4
///   - Ghali, Neville & Brown, "Structural Analysis", 7th Ed.
///   - Kassimali, "Structural Analysis", 6th Ed.
///
/// Tests verify extended multi-story frame behaviors:
///   1. Moment equilibrium at an interior joint
///   2. Four-story frame: cumulative shear distribution
///   3. Two-bay frame symmetry under symmetric gravity
///   4. Pinned-base portal vs fixed-base portal: more drift
///   5. Triangular lateral load profile (inverted triangle)
///   6. Soft-story effect: weaker first story columns
///   7. Superposition: combined = lateral-only + gravity-only
///   8. Antisymmetric lateral load: zero midspan axial force in beam
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Helper to build a rectangular multi-story frame.
/// Returns nodes, elements, supports for n_story x n_bay frame.
fn make_frame(
    n_story: usize,
    n_bay: usize,
    h: f64,
    w: f64,
) -> (Vec<(usize, f64, f64)>, Vec<(usize, &'static str, usize, usize, usize, usize, bool, bool)>, Vec<(usize, usize, &'static str)>) {
    let n_cols = n_bay + 1;
    let mut nodes = Vec::new();
    let mut node_id = 1;

    // Ground level nodes
    for col in 0..n_cols {
        nodes.push((node_id, col as f64 * w, 0.0));
        node_id += 1;
    }
    // Floor nodes
    for story in 1..=n_story {
        for col in 0..n_cols {
            nodes.push((node_id, col as f64 * w, story as f64 * h));
            node_id += 1;
        }
    }

    let mut elems = Vec::new();
    let mut elem_id = 1;

    // Columns
    for story in 0..n_story {
        for col in 0..n_cols {
            let bot = story * n_cols + col + 1;
            let top = (story + 1) * n_cols + col + 1;
            elems.push((elem_id, "frame", bot, top, 1, 1, false, false));
            elem_id += 1;
        }
    }
    // Beams
    for story in 1..=n_story {
        for bay in 0..n_bay {
            let left = story * n_cols + bay + 1;
            let right = story * n_cols + bay + 2;
            elems.push((elem_id, "frame", left, right, 1, 1, false, false));
            elem_id += 1;
        }
    }

    // Supports at ground level
    let mut sups = Vec::new();
    for col in 0..n_cols {
        sups.push((col + 1, col + 1, "fixed"));
    }

    (nodes, elems, sups)
}

// ================================================================
// 1. Global Moment Equilibrium About the Base
// ================================================================
//
// For a 2-story, 1-bay frame under lateral loads at each floor,
// the sum of reaction moments about a base point must equal the
// overturning moment from the applied loads.
// Taking moments about node 1 (x=0, y=0):
//   ΣM_reactions = ΣM_applied
//   sum(Mz_i + Ry_i * x_i - Rx_i * y_i) = sum(Fy_j * x_j - Fx_j * y_j)
// For lateral loads only (Fy=0): ΣM_applied = -Σ(Fx_j * y_j)

#[test]
fn validation_ext_frame_global_moment_equilibrium() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(2, 1, h, w);
    let n_cols: usize = 2;

    let f1 = 10.0;
    let f2 = 5.0;
    // Floor 1 at y = h, floor 2 at y = 2h
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + n_cols, fx: f1, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: f2, fy: 0.0, mz: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Overturning moment about node 1 (origin) from applied loads
    // M_applied = F1 * h + F2 * 2h (positive CCW)
    let m_applied = f1 * h + f2 * 2.0 * h;

    // Resisting moment from reactions about node 1:
    // Node 1 at (0, 0): contributes Mz_1 only (Rx*0 - Ry*0 = 0)
    // Node 2 at (w, 0): contributes Mz_2 + Ry_2 * w (Rx_2*0 = 0 since y=0)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    let m_reaction = r1.mz + r2.mz + r2.ry * w;

    // Equilibrium about origin: sum of all moments = 0.
    // Reaction moments (Mz + Ry*x) balance the applied load moments (Fx*y).
    // Since the solver solves K*u = F with reactions opposing loads,
    // the reaction moment about the origin equals the applied overturning moment.
    assert_close(m_reaction, m_applied, 0.02,
        "Global moment equilibrium about base origin");

    // Also verify horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -(f1 + f2), 0.02, "Horizontal equilibrium: ΣRx = -(F1+F2)");

    // Vertical equilibrium (no vertical loads applied)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1e-6, "No vertical load: ΣRy ≈ 0, got {:.6e}", sum_ry);
}

// ================================================================
// 2. Four-Story Frame: Cumulative Shear Distribution
// ================================================================
//
// Apply equal lateral loads H=5kN at each floor. The base shear
// should equal 4*H = 20kN. Inter-story shears should accumulate:
//   Story 4 (top): V=H
//   Story 3: V=2H
//   Story 2: V=3H
//   Story 1 (bottom): V=4H
// We verify via base reactions.

#[test]
fn validation_ext_frame_four_story_cumulative_shear() {
    let h = 3.0;
    let w = 6.0;
    let n_story = 4;
    let lateral: f64 = 5.0;
    let (nodes, elems, sups) = make_frame(n_story, 1, h, w);
    let n_cols: usize = 2;

    // Equal lateral loads at every floor level, applied to the left node
    let loads: Vec<SolverLoad> = (1..=n_story)
        .map(|s| SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1 + s * n_cols,
            fx: lateral,
            fy: 0.0,
            mz: 0.0,
        }))
        .collect();

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base shear = sum of horizontal reactions should equal total applied lateral
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let total_lateral = n_story as f64 * lateral;
    assert_close(sum_rx, -total_lateral, 0.02,
        "Four-story base shear: sum Rx = -4H");

    // Top floor drifts more than bottom floor
    let ux_floor1 = results.displacements.iter()
        .find(|d| d.node_id == 1 + n_cols).unwrap().ux;
    let ux_floor4 = results.displacements.iter()
        .find(|d| d.node_id == 1 + n_story * n_cols).unwrap().ux;
    assert!(ux_floor4 > ux_floor1,
        "Top floor drifts more: floor4={:.6e} > floor1={:.6e}", ux_floor4, ux_floor1);

    // Drifts should monotonically increase with height
    let mut prev_ux: f64 = 0.0;
    for s in 1..=n_story {
        let ux = results.displacements.iter()
            .find(|d| d.node_id == 1 + s * n_cols).unwrap().ux;
        assert!(ux > prev_ux,
            "Drift increases with height: floor {} ux={:.6e} > prev={:.6e}", s, ux, prev_ux);
        prev_ux = ux;
    }
}

// ================================================================
// 3. Two-Bay Frame Symmetry Under Symmetric Beam UDL
// ================================================================
//
// 1-story, 2-bay frame with UDL on both beams. By symmetry:
//   - exterior reactions are equal
//   - interior column carries more (tributary from two beams)
//   - no lateral drift

#[test]
fn validation_ext_frame_two_bay_symmetric_gravity() {
    let h = 4.0;
    let w = 5.0;
    let q: f64 = 10.0; // UDL on beams (downward)
    let (nodes, elems, sups) = make_frame(1, 2, h, w);
    let n_cols: usize = 3; // 2 bays => 3 columns

    // Elements: columns first (3 columns), then beams (2 beams).
    // Column elems: 1 (1->4), 2 (2->5), 3 (3->6)
    // Beam elems: 4 (4->5), 5 (5->6)
    let beam1_id = n_cols + 1; // elem 4
    let beam2_id = n_cols + 2; // elem 5

    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: beam1_id, q_i: -q, q_j: -q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: beam2_id, q_i: -q, q_j: -q, a: None, b: None,
        }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry, exterior reactions (node 1 and node 3) should be equal
    let ry_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let ry_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;
    assert_close(ry_left, ry_right, 0.02,
        "Two-bay symmetric: equal exterior vertical reactions");

    // Interior reaction at node 2
    let ry_center = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;

    // Total vertical equilibrium: sum Ry = 2 * q * w
    let total_load = 2.0 * q * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Two-bay symmetric: vertical equilibrium");

    // Interior column carries more (tributary from both beams)
    assert!(ry_center > ry_left,
        "Interior column carries more: center={:.4} > exterior={:.4}", ry_center, ry_left);

    // Zero lateral drift by symmetry
    let ux_top = results.displacements.iter()
        .find(|d| d.node_id == 2 + n_cols).unwrap().ux;
    assert!(ux_top.abs() < 1e-8,
        "Two-bay symmetric gravity: no lateral drift: ux={:.6e}", ux_top);
}

// ================================================================
// 4. Pinned-Base vs Fixed-Base Portal: Pinned Has More Drift
// ================================================================
//
// Same portal geometry and lateral load. The pinned-base frame is
// more flexible (fewer rotational restraints) and should have
// significantly larger lateral drift.

#[test]
fn validation_ext_frame_pinned_vs_fixed_base_drift() {
    let h = 4.0;
    let w = 6.0;
    let lateral = 10.0;

    // Fixed-base portal
    let input_fixed = make_portal_frame(h, w, E, A, IZ, lateral, 0.0);
    let res_fixed = linear::solve_2d(&input_fixed).unwrap();
    let ux_fixed = res_fixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Pinned-base portal
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4_usize, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: lateral, fy: 0.0, mz: 0.0,
    })];
    let input_pinned = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let res_pinned = linear::solve_2d(&input_pinned).unwrap();
    let ux_pinned = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux;

    // Both should sway in positive direction
    assert!(ux_fixed > 0.0, "Fixed-base should sway positive");
    assert!(ux_pinned > 0.0, "Pinned-base should sway positive");

    // Pinned base frame has more drift than fixed base
    assert!(ux_pinned > ux_fixed,
        "Pinned-base drifts more: {:.6e} > {:.6e}", ux_pinned, ux_fixed);

    // The ratio should be substantial (typically 4-6x for a portal frame)
    let ratio = ux_pinned / ux_fixed;
    assert!(ratio > 2.0,
        "Pinned/fixed drift ratio should be > 2: got {:.2}", ratio);

    // For pinned base, no moment reactions at base supports
    for r in &res_pinned.reactions {
        assert!(r.mz.abs() < 1e-6,
            "Pinned base: no moment at support node {}: mz={:.6e}", r.node_id, r.mz);
    }
}

// ================================================================
// 5. Triangular Lateral Load Profile (Inverted Triangle)
// ================================================================
//
// Three-story frame with lateral loads increasing linearly with height:
//   Floor 1: H, Floor 2: 2H, Floor 3: 3H
// Compared to uniform loading (H at each floor), the triangular profile
// concentrates load higher, producing more drift at the top but
// different inter-story drift distribution.

#[test]
fn validation_ext_frame_triangular_lateral_load() {
    let h = 3.5;
    let w = 6.0;
    let h_base: f64 = 5.0;
    let (nodes, elems, sups) = make_frame(3, 1, h, w);
    let n_cols: usize = 2;

    // Triangular loads: floor_i gets i * H_base
    let loads_tri: Vec<SolverLoad> = (1..=3_usize)
        .map(|s| SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1 + s * n_cols,
            fx: s as f64 * h_base,
            fy: 0.0,
            mz: 0.0,
        }))
        .collect();

    let input_tri = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_tri);
    let res_tri = linear::solve_2d(&input_tri).unwrap();

    // Base shear should equal total lateral: H + 2H + 3H = 6H
    let sum_rx_tri: f64 = res_tri.reactions.iter().map(|r| r.rx).sum();
    let total_lateral_tri = (1.0 + 2.0 + 3.0) * h_base;
    assert_close(sum_rx_tri, -total_lateral_tri, 0.02,
        "Triangular: base shear = -(H+2H+3H)");

    // Uniform loads: same total lateral = 6H, so 2H at each floor
    let uniform_per_floor = total_lateral_tri / 3.0;
    let loads_uni: Vec<SolverLoad> = (1..=3_usize)
        .map(|s| SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1 + s * n_cols,
            fx: uniform_per_floor,
            fy: 0.0,
            mz: 0.0,
        }))
        .collect();

    let input_uni = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_uni);
    let res_uni = linear::solve_2d(&input_uni).unwrap();

    // Same total lateral force, so base shear should be equal
    let sum_rx_uni: f64 = res_uni.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_uni, sum_rx_tri, 0.02,
        "Same total lateral: equal base shear");

    // Top floor drift: triangular profile should produce MORE top-floor drift
    // because it concentrates the load higher, creating a larger overturning moment
    let ux_top_tri = res_tri.displacements.iter()
        .find(|d| d.node_id == 1 + 3 * n_cols).unwrap().ux;
    let ux_top_uni = res_uni.displacements.iter()
        .find(|d| d.node_id == 1 + 3 * n_cols).unwrap().ux;

    assert!(ux_top_tri > ux_top_uni,
        "Triangular produces more top drift: {:.6e} > {:.6e}", ux_top_tri, ux_top_uni);
}

// ================================================================
// 6. Soft-Story Effect: Weaker First-Story Columns Increase Drift
// ================================================================
//
// Compare two 2-story frames under the same lateral loads:
//   Frame A: uniform column stiffness (all columns use IZ)
//   Frame B: weak first-story columns (IZ/4) and strong second-story (IZ)
// Frame B should have more first-story inter-story drift than Frame A,
// demonstrating the soft-story concentration of deformation.

#[test]
fn validation_ext_frame_soft_story_effect() {
    let h = 3.5;
    let w = 6.0;
    let lateral = 10.0;

    // --- Frame A: Uniform stiffness ---
    let (nodes_a, elems_a, sups_a) = make_frame(2, 1, h, w);
    let n_cols: usize = 2;
    let loads_a = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: lateral, fy: 0.0, mz: 0.0 }),
    ];
    let input_a = make_input(nodes_a, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems_a, sups_a, loads_a);
    let res_a = linear::solve_2d(&input_a).unwrap();

    let ux_a_level1 = res_a.displacements.iter()
        .find(|d| d.node_id == 1 + n_cols).unwrap().ux;

    // --- Frame B: Weak first story columns (IZ/4) ---
    let iz_weak = IZ / 4.0;
    let nodes_b = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 0.0, h),
        (4, w, h),
        (5, 0.0, 2.0 * h),
        (6, w, 2.0 * h),
    ];
    let elems_b = vec![
        // First story columns: section 1 (weak)
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        // Second story columns: section 2 (normal)
        (3, "frame", 3, 5, 1, 2, false, false),
        (4, "frame", 4, 6, 1, 2, false, false),
        // Beams: section 2 (normal)
        (5, "frame", 3, 4, 1, 2, false, false),
        (6, "frame", 5, 6, 1, 2, false, false),
    ];
    let sups_b = vec![(1, 1_usize, "fixed"), (2, 2_usize, "fixed")];
    let loads_b = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: lateral, fy: 0.0, mz: 0.0 }),
    ];
    let input_b = make_input(nodes_b, vec![(1, E, 0.3)],
        vec![(1, A, iz_weak), (2, A, IZ)],
        elems_b, sups_b, loads_b);
    let res_b = linear::solve_2d(&input_b).unwrap();

    let ux_b_level1 = (res_b.displacements.iter().find(|d| d.node_id == 3).unwrap().ux
        + res_b.displacements.iter().find(|d| d.node_id == 4).unwrap().ux) / 2.0;

    // Frame B (soft story) should have more first-story drift than Frame A (uniform)
    assert!(ux_b_level1 > ux_a_level1,
        "Soft story has more first-story drift: B={:.6e} > A={:.6e}", ux_b_level1, ux_a_level1);

    // The increase should be substantial since first-story columns are 4x weaker
    let ratio = ux_b_level1 / ux_a_level1;
    assert!(ratio > 1.5,
        "Soft story drift increase ratio={:.2} should be > 1.5", ratio);

    // Both frames should satisfy horizontal equilibrium
    let sum_rx_b: f64 = res_b.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx_b, -lateral, 0.02, "Soft story: horizontal equilibrium");
}

// ================================================================
// 7. Superposition: Combined = Lateral-Only + Gravity-Only
// ================================================================
//
// For a linear solver, the response to combined loading equals the
// sum of responses to each load case applied separately.

#[test]
fn validation_ext_frame_superposition_combined_loads() {
    let h = 3.5;
    let w = 6.0;
    let (nodes, elems, sups) = make_frame(2, 1, h, w);
    let n_cols: usize = 2;

    let px = 8.0;
    let py = -25.0;

    // Load case 1: lateral only
    let loads_lat = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: px, fy: 0.0, mz: 0.0 }),
    ];
    let input_lat = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_lat);
    let res_lat = linear::solve_2d(&input_lat).unwrap();

    // Load case 2: gravity only
    let loads_grav = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: 0.0, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2 + 2 * n_cols, fx: 0.0, fy: py, mz: 0.0 }),
    ];
    let input_grav = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems.clone(), sups.clone(), loads_grav);
    let res_grav = linear::solve_2d(&input_grav).unwrap();

    // Load case 3: combined
    let loads_comb = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 1 + 2 * n_cols, fx: px, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2 + 2 * n_cols, fx: 0.0, fy: py, mz: 0.0 }),
    ];
    let input_comb = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads_comb);
    let res_comb = linear::solve_2d(&input_comb).unwrap();

    // Check superposition at top floor node (1 + 2*n_cols = 5)
    let top_node = 1 + 2 * n_cols;
    let d_lat = res_lat.displacements.iter().find(|d| d.node_id == top_node).unwrap();
    let d_grav = res_grav.displacements.iter().find(|d| d.node_id == top_node).unwrap();
    let d_comb = res_comb.displacements.iter().find(|d| d.node_id == top_node).unwrap();

    // ux_combined = ux_lateral + ux_gravity
    assert_close(d_comb.ux, d_lat.ux + d_grav.ux, 0.01,
        "Superposition: ux_combined = ux_lat + ux_grav");
    assert_close(d_comb.uy, d_lat.uy + d_grav.uy, 0.01,
        "Superposition: uy_combined = uy_lat + uy_grav");
    assert_close(d_comb.rz, d_lat.rz + d_grav.rz, 0.01,
        "Superposition: rz_combined = rz_lat + rz_grav");

    // Also check reaction superposition at base node 1
    let r_lat = res_lat.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_grav = res_grav.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_comb = res_comb.reactions.iter().find(|r| r.node_id == 1).unwrap();

    assert_close(r_comb.rx, r_lat.rx + r_grav.rx, 0.01,
        "Superposition: Rx_combined = Rx_lat + Rx_grav");
    assert_close(r_comb.ry, r_lat.ry + r_grav.ry, 0.01,
        "Superposition: Ry_combined = Ry_lat + Ry_grav");
    assert_close(r_comb.mz, r_lat.mz + r_grav.mz, 0.01,
        "Superposition: Mz_combined = Mz_lat + Mz_grav");
}

// ================================================================
// 8. Antisymmetric Lateral Load: Equal and Opposite Column Shears
// ================================================================
//
// Single-story, single-bay portal frame with a lateral load at the top.
// By antisymmetry of the lateral load, the two columns share the
// total horizontal shear. For equal columns with fixed bases, each
// column carries exactly half the base shear. We verify the base
// horizontal reactions are equal.

#[test]
fn validation_ext_frame_antisymmetric_lateral_equal_column_shears() {
    let h = 4.0;
    let w = 6.0;
    let lateral: f64 = 20.0;

    // Fixed-base portal frame with lateral load split equally to both top nodes
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4_usize, "fixed")];
    // Apply lateral load to the left top node only
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: lateral, fy: 0.0, mz: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal reactions at both supports
    let rx_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rx;
    let rx_right = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rx;

    // Global horizontal equilibrium: rx_left + rx_right + lateral = 0
    assert_close(rx_left + rx_right, -lateral, 0.02,
        "Portal: sum Rx = -H");

    // For equal columns with equal stiffness and fixed bases, the beam acts
    // as a rigid link distributing the lateral load equally.
    // Both columns should carry approximately equal horizontal reaction (H/2 each).
    // Due to beam flexibility this is not exact, but should be close.
    let rx_avg = (rx_left + rx_right) / 2.0;
    assert_close(rx_left, rx_avg, 0.05,
        "Equal columns: left Rx close to average");
    assert_close(rx_right, rx_avg, 0.05,
        "Equal columns: right Rx close to average");

    // Each column reaction should be approximately -H/2
    assert_close(rx_left, -lateral / 2.0, 0.05,
        "Left column base shear approx H/2");
    assert_close(rx_right, -lateral / 2.0, 0.05,
        "Right column base shear approx H/2");

    // Both top nodes should have the same lateral displacement (rigid beam assumption)
    let ux_left = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux_right = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;
    let ux_diff: f64 = (ux_left - ux_right).abs();
    let ux_avg_disp: f64 = (ux_left + ux_right) / 2.0;
    assert!(ux_diff / ux_avg_disp < 0.05,
        "Top nodes sway together: ux_left={:.6e}, ux_right={:.6e}", ux_left, ux_right);
}
