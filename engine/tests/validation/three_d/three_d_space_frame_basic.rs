/// Validation: Basic 3D Space Frame Behavior
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///   - Timoshenko, "Strength of Materials"
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///
/// Tests verify out-of-plane loading, multi-direction frames, and orientation
/// independence for basic 3D space frame configurations:
///   1. L-frame in 3D: column + beam
///   2. 3D portal frame: lateral load sharing
///   3. Cantilever beam in Y direction
///   4. Cantilever beam in Z direction
///   5. Two orthogonal beams (L-frame)
///   6. 3D equilibrium: multiplanar frame
///   7. Beam orientation doesn't affect axial stiffness
///   8. Symmetric 3D frame under symmetric load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;
const E_EFF: f64 = E * 1000.0;
#[allow(dead_code)]
const G_EFF: f64 = E_EFF / (2.0 * (1.0 + NU));

// ================================================================
// 1. L-Frame in 3D: Column + Beam
// ================================================================
//
// Column along Z (0,0,0) -> (0,0,4), beam along X (0,0,4) -> (6,0,4).
// Fixed at column base. Tip load fy at beam end.
// Verify deflection direction and global equilibrium.

#[test]
fn validation_3d_l_frame_column_beam() {
    let h = 4.0; // column height (along Z)
    let w = 6.0; // beam length (along X)
    let fy_load = -10.0; // downward (negative Y) at beam tip

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // column base (fixed)
        (2, 0.0, 0.0, h),   // column top / beam start
        (3, w, 0.0, h),     // beam tip (loaded)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column along Z
        (2, "frame", 2, 3, 1, 1), // beam along X
    ];
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed base
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3,
        fx: 0.0, fy: fy_load, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Tip should deflect in Y direction (direction of applied load)
    let tip = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(
        tip.uy.abs() > 1e-6,
        "Beam tip should deflect in Y, got uy={:.6e}", tip.uy
    );
    // Deflection should be in the same direction as load (negative Y)
    assert!(
        tip.uy < 0.0,
        "Beam tip should deflect downward (negative Y), got uy={:.6e}", tip.uy
    );

    // Global force equilibrium
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert_close(sum_fx, 0.0, 0.02, "L-frame sum_fx = 0");
    assert_close(sum_fy, -fy_load, 0.02, "L-frame sum_fy = -applied");
    assert_close(sum_fz, 0.0, 0.02, "L-frame sum_fz = 0");
}

// ================================================================
// 2. 3D Portal Frame: Lateral Load Sharing
// ================================================================
//
// 4 columns + 4 beams forming a rectangular portal in 3D.
// Fixed bases. Lateral load in X at one top corner.
// Verify all bases share the load and global equilibrium.

#[test]
fn validation_3d_portal_frame_lateral_sharing() {
    let h = 4.0;  // column height (along Z)
    let wx = 6.0; // bay width in X
    let wy = 4.0; // bay width in Y
    let fx_load = 20.0; // lateral load in X at one corner

    // 8 nodes: 4 base + 4 top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),   // base 1
        (2, wx,  0.0, 0.0),   // base 2
        (3, wx,  wy,  0.0),   // base 3
        (4, 0.0, wy,  0.0),   // base 4
        (5, 0.0, 0.0, h),     // top 1
        (6, wx,  0.0, h),     // top 2
        (7, wx,  wy,  h),     // top 3
        (8, 0.0, wy,  h),     // top 4
    ];
    // 4 columns + 4 beams
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), // column 1
        (2, "frame", 2, 6, 1, 1), // column 2
        (3, "frame", 3, 7, 1, 1), // column 3
        (4, "frame", 4, 8, 1, 1), // column 4
        (5, "frame", 5, 6, 1, 1), // beam X side 1
        (6, "frame", 7, 8, 1, 1), // beam X side 2
        (7, "frame", 5, 8, 1, 1), // beam Y side 1
        (8, "frame", 6, 7, 1, 1), // beam Y side 2
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (2, fixed.clone()),
        (3, fixed.clone()),
        (4, fixed.clone()),
    ];
    // Lateral load at one top corner
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5,
        fx: fx_load, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium: sum of reaction X must equal applied load
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_fx, -fx_load, 0.02, "Portal sum_fx + applied = 0");

    // All 4 bases should carry some X-reaction (frame action distributes load)
    let bases = [1_usize, 2, 3, 4];
    for &nid in &bases {
        let r = results.reactions.iter().find(|r| r.node_id == nid).unwrap();
        assert!(
            r.fx.abs() > 1e-6,
            "Base node {} should carry some X-reaction, got fx={:.6e}", nid, r.fx
        );
    }

    // Global Y equilibrium: no applied Y force
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fy.abs() < 0.5, "Portal sum_fy should be ~0, got {:.4}", sum_fy);

    // Global Z equilibrium: no applied Z force
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert!(sum_fz.abs() < 0.5, "Portal sum_fz should be ~0, got {:.4}", sum_fz);
}

// ================================================================
// 3. Cantilever Beam in Y Direction
// ================================================================
//
// Beam along Y-axis (not X). Fixed at start, tip load in Z.
// Bending deflection should match PL^3/(3EI).

#[test]
fn validation_3d_cantilever_along_y() {
    let l = 5.0;
    let n = 8;
    let fz_load = 10.0;
    let elem_len = l / n as f64;

    // Beam along Y-axis: nodes at (0, i*dl, 0)
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed base
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: 0.0, fy: 0.0, fz: fz_load,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // For a beam along Y loaded in Z, bending is about X-axis.
    // The relevant moment of inertia depends on local axis orientation.
    // For a beam along Y, the solver local x-axis is along Y (beam axis).
    // Load in Z corresponds to bending about the local y-axis.
    // delta = P*L^3 / (3*E*I) where I is the relevant bending inertia.
    // For beams along Y, Fz bending uses Iy or Iz depending on convention.
    // We use symmetric section (IY=IZ), so the formula is unambiguous.
    let delta_expected = fz_load * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.uz.abs(), delta_expected, 0.05, "Y-beam tip deflection uz");

    // Should not deflect significantly in X or Y
    assert!(
        tip.ux.abs() < delta_expected * 0.01,
        "Y-beam: should not deflect in X, got ux={:.6e}", tip.ux
    );
}

// ================================================================
// 4. Cantilever Beam in Z Direction
// ================================================================
//
// Beam along Z-axis. Fixed at base, tip load in X.
// Bending deflection should match PL^3/(3EI).

#[test]
fn validation_3d_cantilever_along_z() {
    let l = 5.0;
    let n = 8;
    let fx_load = 10.0;
    let elem_len = l / n as f64;

    // Beam along Z-axis: nodes at (0, 0, i*dl)
    let nodes: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, 0.0, i as f64 * elem_len))
        .collect();
    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed base
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: fx_load, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Beam along Z, loaded in X: bending about local y-axis.
    // With symmetric section IY=IZ, delta = P*L^3/(3*E*I)
    let delta_expected = fx_load * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.ux.abs(), delta_expected, 0.05, "Z-beam tip deflection ux");

    // Should not deflect significantly in Y
    assert!(
        tip.uy.abs() < delta_expected * 0.01,
        "Z-beam: should not deflect in Y, got uy={:.6e}", tip.uy
    );
}

// ================================================================
// 5. Two Orthogonal Beams (L-Frame)
// ================================================================
//
// L-frame: beam along X connected to beam along Y at a rigid joint.
// Fixed at both far ends, load at the corner joint.
// Verify deflection at corner.

#[test]
fn validation_3d_two_orthogonal_beams() {
    let lx = 4.0; // beam 1 length along X
    let ly = 4.0; // beam 2 length along Y
    let fz_load = -10.0; // downward (negative Z) at corner

    // Node 1: far end of X-beam (fixed)
    // Node 2: corner joint (loaded)
    // Node 3: far end of Y-beam (fixed)
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // X-beam far end (fixed)
        (2, lx,  0.0, 0.0),  // corner joint
        (3, lx,  ly,  0.0),  // Y-beam far end (fixed)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // beam along X
        (2, "frame", 2, 3, 1, 1), // beam along Y
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (3, fixed.clone()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2,
        fx: 0.0, fy: 0.0, fz: fz_load,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Corner should deflect in Z (direction of load)
    let corner = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(
        corner.uz < 0.0,
        "Corner should deflect downward, got uz={:.6e}", corner.uz
    );

    // The deflection of a single cantilever under this load would be
    // delta_single = P*L^3/(3*E*I). Two cantilevers sharing the load
    // at a rigid joint should give less deflection than a single cantilever.
    let delta_single_cant = fz_load.abs() * lx.powi(3) / (3.0 * E_EFF * IY);
    assert!(
        corner.uz.abs() < delta_single_cant,
        "Two-beam deflection ({:.6e}) should be less than single cantilever ({:.6e})",
        corner.uz.abs(), delta_single_cant
    );

    // Both supports should share the load (equilibrium)
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, -fz_load, 0.02, "Orthogonal beams equilibrium fz");

    // Both supports should carry some vertical reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert!(r1.fz.abs() > 1e-6, "Support 1 should carry Z-reaction");
    assert!(r3.fz.abs() > 1e-6, "Support 3 should carry Z-reaction");
}

// ================================================================
// 6. 3D Equilibrium: Multiplanar Frame
// ================================================================
//
// 3 beams meeting at a central node from X, Y, Z directions.
// Fixed at far ends. Load at center.
// Verify all 6 equilibrium equations (3 forces + 3 moments).

#[test]
fn validation_3d_multiplanar_frame_equilibrium() {
    let l = 3.0;
    let fx = 5.0;
    let fy = -3.0;
    let fz = 8.0;
    let mx = 1.0;
    let my = -2.0;
    let mz = 1.5;

    // Central node at origin, 3 beams radiating along +X, +Y, +Z
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),  // center (loaded)
        (2, l,   0.0, 0.0),  // X-beam end (fixed)
        (3, 0.0, l,   0.0),  // Y-beam end (fixed)
        (4, 0.0, 0.0, l),    // Z-beam end (fixed)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // along X
        (2, "frame", 1, 3, 1, 1), // along Y
        (3, "frame", 1, 4, 1, 1), // along Z
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (2, fixed.clone()),
        (3, fixed.clone()),
        (4, fixed.clone()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1,
        fx, fy, fz, mx, my, mz, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Force equilibrium: sum of reactions = -applied
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert_close(sum_fx, -fx, 0.02, "Multiplanar force eq X");
    assert_close(sum_fy, -fy, 0.02, "Multiplanar force eq Y");
    assert_close(sum_fz, -fz, 0.02, "Multiplanar force eq Z");

    // Moment equilibrium about the central node (where load is applied):
    // sum of reaction moments + sum of (reaction force x position) = -applied moments
    // Since the load is at the origin and supports are at distance l along each axis,
    // we compute total moment about origin.
    let mut total_mx = mx; // applied
    let mut total_my = my;
    let mut total_mz = mz;

    for r in &results.reactions {
        // Position of reaction node
        let (px, py, pz) = match r.node_id {
            2 => (l, 0.0, 0.0),
            3 => (0.0, l, 0.0),
            4 => (0.0, 0.0, l),
            _ => (0.0, 0.0, 0.0),
        };
        // Moment from reaction forces: M = r x F
        total_mx += py * r.fz - pz * r.fy + r.mx;
        total_my += pz * r.fx - px * r.fz + r.my;
        total_mz += px * r.fy - py * r.fx + r.mz;
    }

    let ref_moment = (fx.abs() + fy.abs() + fz.abs()) * l + mx.abs() + my.abs() + mz.abs();
    assert!(
        total_mx.abs() / ref_moment < 0.02,
        "Moment eq Mx: residual={:.6}, ref={:.4}", total_mx, ref_moment
    );
    assert!(
        total_my.abs() / ref_moment < 0.02,
        "Moment eq My: residual={:.6}, ref={:.4}", total_my, ref_moment
    );
    assert!(
        total_mz.abs() / ref_moment < 0.02,
        "Moment eq Mz: residual={:.6}, ref={:.4}", total_mz, ref_moment
    );
}

// ================================================================
// 7. Beam Orientation Doesn't Affect Axial Stiffness
// ================================================================
//
// Same axial load F on beams along X, Y, and Z.
// Axial displacement should be the same: FL/(EA).

#[test]
fn validation_3d_axial_stiffness_orientation_independent() {
    let l = 5.0;
    let n = 4;
    let f_axial = 100.0;
    let elem_len = l / n as f64;

    let delta_expected = f_axial * l / (E_EFF * A);

    // --- Beam along X ---
    let nodes_x: Vec<_> = (0..=n)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0))
        .collect();
    let elems_x: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let input_x = make_3d_input(
        nodes_x, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems_x,
        vec![(1, vec![true, true, true, true, true, true])], // fixed at start
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: f_axial, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_x = linear::solve_3d(&input_x).unwrap();
    let tip_x = res_x.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let ux_axial = tip_x.ux.abs();

    // --- Beam along Y (axial load in Y) ---
    let nodes_y: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, i as f64 * elem_len, 0.0))
        .collect();
    let elems_y: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let input_y = make_3d_input(
        nodes_y, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems_y,
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: f_axial, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let uy_axial = tip_y.uy.abs();

    // --- Beam along Z (axial load in Z) ---
    let nodes_z: Vec<_> = (0..=n)
        .map(|i| (i + 1, 0.0, 0.0, i as f64 * elem_len))
        .collect();
    let elems_z: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1))
        .collect();
    let input_z = make_3d_input(
        nodes_z, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems_z,
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: f_axial,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let uz_axial = tip_z.uz.abs();

    // All three should match FL/(EA)
    assert_close(ux_axial, delta_expected, 0.02, "Axial X-beam delta=FL/EA");
    assert_close(uy_axial, delta_expected, 0.02, "Axial Y-beam delta=FL/EA");
    assert_close(uz_axial, delta_expected, 0.02, "Axial Z-beam delta=FL/EA");

    // All three should be consistent with each other
    assert_close(ux_axial, uy_axial, 0.02, "Axial X vs Y parity");
    assert_close(uy_axial, uz_axial, 0.02, "Axial Y vs Z parity");
}

// ================================================================
// 8. Symmetric 3D Frame Under Symmetric Load
// ================================================================
//
// Square portal: 4 columns at corners, 4 beams connecting them at the top.
// Symmetric vertical loads at all top nodes.
// By symmetry, each column carries equal load.

#[test]
fn validation_3d_symmetric_frame_equal_sharing() {
    let h = 4.0;  // column height (along Z)
    let s = 5.0;  // bay size (square plan)
    let p = 30.0; // vertical load at each top node (downward)

    // 8 nodes: 4 base + 4 top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // base 1
        (2, s,   0.0, 0.0), // base 2
        (3, s,   s,   0.0), // base 3
        (4, 0.0, s,   0.0), // base 4
        (5, 0.0, 0.0, h),   // top 1
        (6, s,   0.0, h),   // top 2
        (7, s,   s,   h),   // top 3
        (8, 0.0, s,   h),   // top 4
    ];
    // 4 columns + 4 beams at the top
    let elems = vec![
        (1, "frame", 1, 5, 1, 1), // column 1
        (2, "frame", 2, 6, 1, 1), // column 2
        (3, "frame", 3, 7, 1, 1), // column 3
        (4, "frame", 4, 8, 1, 1), // column 4
        (5, "frame", 5, 6, 1, 1), // top beam X side 1
        (6, "frame", 7, 8, 1, 1), // top beam X side 2
        (7, "frame", 5, 8, 1, 1), // top beam Y side 1
        (8, "frame", 6, 7, 1, 1), // top beam Y side 2
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (2, fixed.clone()),
        (3, fixed.clone()),
        (4, fixed.clone()),
    ];
    // Equal downward loads at all 4 top nodes
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 6, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 7, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 8, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Total vertical reaction = 4*P
    let total_applied = 4.0 * p;
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, total_applied, 0.02, "Symmetric frame total Rz = 4P");

    // Each column should carry equal vertical load: P per column
    let base_nodes = [1_usize, 2, 3, 4];
    let rz_values: Vec<f64> = base_nodes.iter()
        .map(|&nid| results.reactions.iter().find(|r| r.node_id == nid).unwrap().fz)
        .collect();

    let avg_rz = rz_values.iter().sum::<f64>() / 4.0;
    for (i, &rz) in rz_values.iter().enumerate() {
        assert_close(rz, avg_rz, 0.05,
            &format!("Symmetric column {} Rz vs average", base_nodes[i]));
    }

    // By symmetry, each column carries P
    assert_close(avg_rz, p, 0.05, "Average column Rz = P");

    // By symmetry, no net lateral reactions
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert!(sum_fx.abs() < 0.5, "Symmetric frame: sum_fx ~ 0, got {:.4}", sum_fx);
    assert!(sum_fy.abs() < 0.5, "Symmetric frame: sum_fy ~ 0, got {:.4}", sum_fy);

    // All top nodes should have the same vertical deflection
    let top_nodes = [5_usize, 6, 7, 8];
    let uz_values: Vec<f64> = top_nodes.iter()
        .map(|&nid| results.displacements.iter().find(|d| d.node_id == nid).unwrap().uz)
        .collect();

    let avg_uz = uz_values.iter().sum::<f64>() / 4.0;
    for (i, &uz) in uz_values.iter().enumerate() {
        assert_close(uz, avg_uz, 0.05,
            &format!("Symmetric top node {} uz vs average", top_nodes[i]));
    }

    // Top nodes should deflect downward
    assert!(avg_uz < 0.0, "Top nodes should deflect downward, got avg_uz={:.6e}", avg_uz);
}
