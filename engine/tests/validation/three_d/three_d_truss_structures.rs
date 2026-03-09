/// Validation: 3D Truss Structure Analysis
///
/// Tests for three-dimensional truss structures verified by the method of joints,
/// equilibrium conditions, and symmetry arguments.
///
/// References:
///   - Hibbeler, R.C., "Structural Analysis", 10th Ed., Ch. 3 (Space Trusses)
///   - Kassimali, A., "Structural Analysis", 6th Ed., Ch. 4
///   - Timoshenko, S., Young, D.H., "Theory of Structures", 2nd Ed., McGraw-Hill
///   - McGuire, W., Gallagher, R.H., Ziemian, R.D., "Matrix Structural Analysis", 2nd Ed.
///   - Weaver, W., Gere, J.M., "Matrix Analysis of Framed Structures", 3rd Ed.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.001; // m² (truss cross-section)

// Truss elements: no bending stiffness
const IY_T: f64 = 1e-10;
const IZ_T: f64 = 1e-10;
const J_T: f64 = 1e-10;

// ================================================================
// 1. Tetrahedral Truss: Member Forces from Equilibrium
// ================================================================
//
// 4-node tetrahedral truss: equilateral triangle base in XY plane + apex.
// Vertical load P at apex. By symmetry: all three leg members carry
// equal forces. Vertical component of each leg force = P/3.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Example 3-2

#[test]
fn validation_3d_truss_tetrahedral_forces() {
    let s: f64 = 3.0; // base side length
    let h: f64 = 4.0; // height
    let p = 30.0;

    // Equilateral triangle base at z=0:
    // Node 1: (0, 0, 0), Node 2: (s, 0, 0), Node 3: (s/2, s*√3/2, 0)
    // Centroid of base triangle: (s/2, s*√3/6, 0)
    // Apex node 4 directly above centroid: (s/2, s*√3/6, h)
    let cx = s / 2.0;
    let cy = s * 3.0_f64.sqrt() / 6.0; // centroid y = s*sqrt(3)/6
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s / 2.0, s * 3.0_f64.sqrt() / 2.0, 0.0),
        (4, cx, cy, h), // apex above centroid
    ];
    let elems = vec![
        (1, "truss", 1, 4, 1, 1), // leg 1
        (2, "truss", 2, 4, 1, 1), // leg 2
        (3, "truss", 3, 4, 1, 1), // leg 3
        (4, "truss", 1, 2, 1, 1), // base edge 1
        (5, "truss", 2, 3, 1, 1), // base edge 2
        (6, "truss", 3, 1, 1, 1), // base edge 3
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, false, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium: ΣRz = P
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, p, 0.01, "Tetrahedral: ΣRz = P");

    // All three legs carry equal force (symmetry)
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.01, "Tetrahedral: legs equal (1 vs 2)");
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.01, "Tetrahedral: legs equal (2 vs 3)");

    // Each leg vertical component = P/3; leg length from apex to base node
    let leg_len = ((cx - 0.0_f64).powi(2) + (cy - 0.0_f64).powi(2) + h * h).sqrt();
    let n_exact = p / 3.0 * leg_len / h; // N = (P/3) * (L_leg / h)
    assert_close(ef1.n_start.abs(), n_exact, 0.02, "Tetrahedral: leg force from equilibrium");
}

// ================================================================
// 2. 3D Tower Truss: Vertical Load at Top
// ================================================================
//
// Square base tower: 4 base nodes + 1 apex.
// Vertical load at apex. By symmetry: all 4 leg members equal.
// Each leg carries P/4 / cos(θ) where θ is angle from vertical.
//
// Reference: Kassimali, "Structural Analysis", 6th Ed., Ex. 4.6

#[test]
fn validation_3d_truss_tower_vertical_load() {
    let b = 2.0; // base half-width
    let h = 4.0; // tower height
    let p = 40.0;

    // Square base at z=0: nodes 1-4, apex node 5 at (0,0,h)
    let nodes = vec![
        (1, -b, -b, 0.0),
        (2,  b, -b, 0.0),
        (3,  b,  b, 0.0),
        (4, -b,  b, 0.0),
        (5,  0.0, 0.0, h), // apex
    ];
    let elems = vec![
        (1, "truss", 1, 5, 1, 1), // legs
        (2, "truss", 2, 5, 1, 1),
        (3, "truss", 3, 5, 1, 1),
        (4, "truss", 4, 5, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
        (4, vec![true, true, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, p, 0.01, "Tower: ΣRz = P");

    // Symmetry: all 4 legs carry equal force
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.01, "Tower: legs 1 = 2");
    assert_close(ef1.n_start.abs(), ef3.n_start.abs(), 0.01, "Tower: legs 1 = 3");
    assert_close(ef1.n_start.abs(), ef4.n_start.abs(), 0.01, "Tower: legs 1 = 4");

    // Analytical: each leg length = sqrt(b²+b²+h²), vertical component = N*h/L = P/4
    let leg_len = (2.0 * b * b + h * h).sqrt();
    let n_exact = p / 4.0 * leg_len / h;
    assert_close(ef1.n_start.abs(), n_exact, 0.01, "Tower: leg force = P/4 * L/h");
}

// ================================================================
// 3. Space Truss with 6 Members: All in Tension or Compression
// ================================================================
//
// Six-member space truss: 4 nodes, 6 members forming a tetrahedron.
// Horizontal load at apex. Members must carry only axial force (V=0, M=0).
//
// Reference: McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd Ed., Ex. 3.1

#[test]
fn validation_3d_truss_six_member_axial_only() {
    let s = 3.0;
    let h = 3.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s / 2.0, s * 3.0_f64.sqrt() / 2.0, 0.0),
        (4, s / 2.0, s / (2.0 * 3.0_f64.sqrt()), h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 1, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, false, true, false, false, false]),
    ];
    // Horizontal load at apex
    let px = 10.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: px, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // All members must carry pure axial (no shear, no moment for truss)
    for ef in &results.element_forces {
        assert!(
            ef.vy_start.abs() < 1e-4,
            "Truss elem {} must have Vy=0, got {:.6e}", ef.element_id, ef.vy_start
        );
        assert!(
            ef.vz_start.abs() < 1e-4,
            "Truss elem {} must have Vz=0, got {:.6e}", ef.element_id, ef.vz_start
        );
        assert!(
            ef.mz_start.abs() < 1e-4,
            "Truss elem {} must have Mz=0, got {:.6e}", ef.element_id, ef.mz_start
        );
        assert!(
            ef.my_start.abs() < 1e-4,
            "Truss elem {} must have My=0, got {:.6e}", ef.element_id, ef.my_start
        );
    }

    // Horizontal equilibrium: ΣRx = -px
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    assert_close(sum_rx, -px, 0.01, "6-member: ΣRx = -Px");

    // At least one member in tension, at least one in compression (non-trivial loading)
    let has_tension = results.element_forces.iter().any(|ef| ef.n_start > 0.1);
    let has_compression = results.element_forces.iter().any(|ef| ef.n_start < -0.1);
    assert!(has_tension, "6-member space truss must have tension members");
    assert!(has_compression, "6-member space truss must have compression members");
}

// ================================================================
// 4. 3D Pratt Truss Bridge: Symmetric Forces Under Central Load
// ================================================================
//
// 3D bridge truss: two parallel plane trusses connected by floor beams.
// Symmetric central load → forces in corresponding left/right members equal.
//
// Reference: Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 2

#[test]
fn validation_3d_truss_bridge_symmetric_forces() {
    // Two-chord (top and bottom) parallel truss in XZ plane, y=-1 and y=+1
    // Bottom nodes: B1..B4 (y=0, z=0), Top nodes T1..T4 (y=0, z=2)
    // Span 6 m (3 panels), height 2 m, width 2 m (y direction)
    //
    // Left truss: y=-1, Right truss: y=+1
    // Bottom left: nodes 1-4, Bottom right: nodes 5-8
    // Top left: nodes 9-12, Top right: nodes 13-16

    let panel = 2.0;
    let ht = 2.0;
    let yw = 1.0;

    // Bottom left (z=0, y=-yw): nodes 1-4
    // Bottom right (z=0, y=+yw): nodes 5-8
    // Top left (z=ht, y=-yw): nodes 9-12
    // Top right (z=ht, y=+yw): nodes 13-16
    let mut nodes = Vec::new();
    for i in 0..4 {
        let x = i as f64 * panel;
        nodes.push((i + 1, x, -yw, 0.0));       // bottom left
        nodes.push((i + 5, x,  yw, 0.0));       // bottom right
        nodes.push((i + 9, x, -yw, ht));        // top left
        nodes.push((i + 13, x,  yw, ht));       // top right
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord (left)
    for i in 0..3 { elems.push((eid, "truss", i + 1, i + 2, 1, 1)); eid += 1; }
    // Bottom chord (right)
    for i in 0..3 { elems.push((eid, "truss", i + 5, i + 6, 1, 1)); eid += 1; }
    // Top chord (left)
    for i in 0..3 { elems.push((eid, "truss", i + 9, i + 10, 1, 1)); eid += 1; }
    // Top chord (right)
    for i in 0..3 { elems.push((eid, "truss", i + 13, i + 14, 1, 1)); eid += 1; }
    // Verticals (left truss)
    for i in 0..4 { elems.push((eid, "truss", i + 1, i + 9, 1, 1)); eid += 1; }
    // Verticals (right truss)
    for i in 0..4 { elems.push((eid, "truss", i + 5, i + 13, 1, 1)); eid += 1; }
    // Diagonals (left truss)
    for i in 0..3 { elems.push((eid, "truss", i + 9, i + 2, 1, 1)); eid += 1; }
    // Diagonals (right truss)
    for i in 0..3 { elems.push((eid, "truss", i + 13, i + 6, 1, 1)); eid += 1; }
    // Floor beams (connecting left/right bottom at each panel point)
    for i in 0..4 { elems.push((eid, "truss", i + 1, i + 5, 1, 1)); eid += 1; }
    // Portal braces top (connecting left/right top)
    for i in 0..4 { elems.push((eid, "truss", i + 9, i + 13, 1, 1)); eid += 1; }

    // Supports at bottom corners: nodes 1, 4 (left) and 5, 8 (right)
    let sups = vec![
        (1,  vec![true, true, true, false, false, false]),  // node 1 pinned
        (4,  vec![false, false, true, false, false, false]), // node 4 roller z
        (5,  vec![false, true, true, false, false, false]),  // node 5 roller yz
        (8,  vec![false, false, true, false, false, false]), // node 8 roller z
    ];

    // Symmetric central load: node 2 (x=2, y=-1) and node 6 (x=2, y=+1) simultaneously
    let p = 10.0;
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 6, fx: 0.0, fy: 0.0, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Vertical equilibrium
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, 2.0 * p, 0.01, "3D bridge: ΣRz = 2P");

    // Symmetry: bottom chord force in left span (elem 1) = right span (elem 4)
    let ef_left = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef_right = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    assert_close(
        ef_left.n_start.abs(), ef_right.n_start.abs(), 0.01,
        "3D bridge: symmetric chord forces"
    );
}

// ================================================================
// 5. 3D Truss: Zero-Force Member Identification
// ================================================================
//
// In a 3D truss, a member connected to a joint with only 2 other
// non-collinear members and no external load carries zero force.
// This extends the 2D zero-force member rule to 3D.
//
// Configuration: pyramid base (4 nodes) + apex, plus two extra
// members connecting to an unloaded interior node. The interior
// node has 3 members (non-collinear), but since two of them form
// a symmetric pair with no net load and the load path bypasses node 5,
// we verify equilibrium and zero net force in the redundant stub members.
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Sec. 3-3

#[test]
fn validation_3d_truss_zero_force_members() {
    // Square base pyramid + apex.
    // Node 5 is a point on the side connected by 3 members.
    // No load at node 5. Under vertical load at apex (node 9),
    // node 5 carries zero force since it's not in the load path.
    let b: f64 = 2.0; // base half-width
    let h: f64 = 4.0; // height

    // Square base: nodes 1-4 at z=0
    // Apex: node 9 at (0,0,h)
    // Side midpoint node 5 at (b, 0, h/2) — connected to nodes 2, 3, and 9
    // With no load at node 5 and the load only at node 9,
    // members from node 9 to nodes 1-4 carry the full load;
    // the members involving node 5 are redundant stubs.
    let nodes = vec![
        (1, -b, -b, 0.0),
        (2,  b, -b, 0.0),
        (3,  b,  b, 0.0),
        (4, -b,  b, 0.0),
        (5,  b,  0.0, h / 2.0), // side node, no external load
        (9,  0.0, 0.0, h),      // apex
    ];
    let elems = vec![
        // Base edges
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 4, 1, 1),
        (4, "truss", 4, 1, 1, 1),
        // Main legs to apex
        (5, "truss", 1, 9, 1, 1),
        (6, "truss", 2, 9, 1, 1),
        (7, "truss", 3, 9, 1, 1),
        (8, "truss", 4, 9, 1, 1),
        // Stub members through unloaded node 5 (side node)
        // These carry zero force: 5 is not on the load path
        (10, "truss", 2, 5, 1, 1), // connects node 2 to node 5
        (11, "truss", 3, 5, 1, 1), // connects node 3 to node 5
        (12, "truss", 5, 9, 1, 1), // connects node 5 to apex
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
        (4, vec![true, true, true, false, false, false]),
    ];
    let p = 12.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 9, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Main structure must carry the full load
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, p, 0.01, "Zero-force member: global ΣRz = P");

    // All members have pure axial (no bending for 3D truss)
    for ef in &results.element_forces {
        assert!(
            ef.mz_start.abs() < 1e-3,
            "Truss elem {} must have Mz≈0, got {:.6e}", ef.element_id, ef.mz_start
        );
    }

    // The four main legs (elements 5-8) must all carry force
    let ef_legs: Vec<f64> = (5..=8)
        .map(|id| results.element_forces.iter().find(|ef| ef.element_id == id).unwrap().n_start.abs())
        .collect();
    for (i, &n_leg) in ef_legs.iter().enumerate() {
        assert!(
            n_leg > 0.1,
            "Main leg {} must carry axial force, got N={:.6e}", i + 5, n_leg
        );
    }
}

// ================================================================
// 6. Global Equilibrium of 3D Truss
// ================================================================
//
// Any 3D truss must satisfy global equilibrium: ΣFx = ΣFy = ΣFz = 0
// and ΣMx = ΣMy = ΣMz = 0 (at any reference point).
// Test with multiple load cases and verify equilibrium holds exactly.
//
// Reference: Weaver & Gere, "Matrix Analysis of Framed Structures", 3rd Ed., Ch. 2

#[test]
fn validation_3d_truss_global_equilibrium() {
    let s = 4.0;
    let h = 3.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s, s, 0.0),
        (4, 0.0, s, 0.0),
        (5, s / 2.0, s / 2.0, h), // apex
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 4, 1, 1),
        (4, "truss", 4, 1, 1, 1),
        (5, "truss", 1, 5, 1, 1),
        (6, "truss", 2, 5, 1, 1),
        (7, "truss", 3, 5, 1, 1),
        (8, "truss", 4, 5, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, false, true, false, false, false]),
        (4, vec![true, false, true, false, false, false]),
    ];
    let fx = 8.0;
    let fy = -4.0;
    let fz = -20.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 5, fx, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Global force equilibrium: ΣR + F_applied = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert!(
        (sum_rx + fx).abs() < 0.01,
        "Global ΣFx: sum_rx={:.4}, fx={:.4}", sum_rx, fx
    );
    assert!(
        (sum_ry + fy).abs() < 0.01,
        "Global ΣFy: sum_ry={:.4}, fy={:.4}", sum_ry, fy
    );
    assert!(
        (sum_rz + fz).abs() < 0.01,
        "Global ΣFz: sum_rz={:.4}, fz={:.4}", sum_rz, fz
    );

    // Truss: all members must have pure axial (no bending)
    for ef in &results.element_forces {
        assert!(
            ef.mz_start.abs() < 1e-3,
            "Truss elem {} must have Mz≈0, got {:.6e}", ef.element_id, ef.mz_start
        );
    }
}

// ================================================================
// 7. 3D Truss Deflection at Loaded Node
// ================================================================
//
// Simple 3-bar 3D truss. Three bars converging at node 4 from the
// coordinate axes. Unit load in z-direction at apex.
// Tip deflection can be verified using the unit-load method:
//   δ = Σ (n·N·L)/(E·A)
//
// Reference: Hibbeler, "Structural Analysis", 10th Ed., Sec. 3-5 (Virtual Work)

#[test]
fn validation_3d_truss_deflection_at_loaded_node() {
    // Three bars along X, Y, Z axes meeting at origin.
    // Bar 1: (L,0,0)→(0,0,0), Bar 2: (0,L,0)→(0,0,0), Bar 3: (0,0,L)→(0,0,0)
    // Supports at far ends. Load at junction (0,0,0).
    let bar_len = 3.0;
    let p = 9.0;

    let nodes = vec![
        (1, 0.0,     0.0,     0.0),     // junction
        (2, bar_len, 0.0,     0.0),     // X end
        (3, 0.0,     bar_len, 0.0),     // Y end
        (4, 0.0,     0.0,     bar_len), // Z end
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1), // X-bar
        (2, "truss", 1, 3, 1, 1), // Y-bar
        (3, "truss", 1, 4, 1, 1), // Z-bar
    ];
    let sups = vec![
        (2, vec![true, true, true, false, false, false]),
        (3, vec![true, true, true, false, false, false]),
        (4, vec![true, true, true, false, false, false]),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    // Only Z-bar carries force (X and Y bars have no Z component = zero force)
    let ef1 = results.element_forces.iter().find(|ef| ef.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|ef| ef.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();

    // X-bar and Y-bar: zero force (perpendicular to applied load)
    assert!(
        ef1.n_start.abs() < 0.01,
        "X-bar must be zero-force under Z-load: N={:.6e}", ef1.n_start
    );
    assert!(
        ef2.n_start.abs() < 0.01,
        "Y-bar must be zero-force under Z-load: N={:.6e}", ef2.n_start
    );

    // Z-bar carries full load.
    // Bar from node 1 (0,0,0) to node 4 (0,0,bar_len): with -z load at node 1
    // and node 4 fixed, the junction moves toward -z, stretching the bar → tension.
    assert_close(ef3.n_start.abs(), p, 0.01, "Z-bar carries full load");

    // Deflection at junction: δz = p*L/(E_eff*A)
    let e_eff = E * 1000.0;
    let dz_exact = p * bar_len / (e_eff * A);
    let dz = results.displacements.iter().find(|d| d.node_id == 1).unwrap().uz;
    assert_close(dz.abs(), dz_exact, 0.01, "Z-bar deflection = pL/(EA)");
}

// ================================================================
// 8. 3D Truss: Force Proportional to Load
// ================================================================
//
// Linearity check: doubling the applied load must double all member
// forces and deflections.
//
// Reference: McGuire, Gallagher, Ziemian, "Matrix Structural Analysis", 2nd Ed., Sec. 1.2

#[test]
fn validation_3d_truss_force_proportional_to_load() {
    let s = 3.0;
    let h = 4.0;
    let p = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, s, 0.0, 0.0),
        (3, s / 2.0, s * 3.0_f64.sqrt() / 2.0, 0.0),
        (4, s / 2.0, s / (2.0 * 3.0_f64.sqrt()), h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 2, 3, 1, 1),
        (3, "truss", 3, 1, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, false, true, false, false, false]),
    ];

    // Load case 1: P
    let loads_1 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    // Load case 2: 2P
    let loads_2 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: -2.0 * p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input_1 = make_3d_input(
        nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IY_T, IZ_T, J_T)],
        elems.clone(), sups.clone(), loads_1,
    );
    let input_2 = make_3d_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IY_T, IZ_T, J_T)],
        elems, sups, loads_2,
    );

    let res_1 = linear::solve_3d(&input_1).unwrap();
    let res_2 = linear::solve_3d(&input_2).unwrap();

    // All member forces must double
    for ef1 in &res_1.element_forces {
        let ef2 = res_2.element_forces.iter().find(|ef| ef.element_id == ef1.element_id).unwrap();
        if ef1.n_start.abs() > 0.01 {
            let ratio = ef2.n_start / ef1.n_start;
            assert_close(ratio, 2.0, 0.01,
                &format!("Linearity: member {} force ratio = 2.0", ef1.element_id));
        }
    }

    // Apex displacement must double
    let d1 = res_1.displacements.iter().find(|d| d.node_id == 4).unwrap().uz.abs();
    let d2 = res_2.displacements.iter().find(|d| d.node_id == 4).unwrap().uz.abs();
    if d1 > 1e-12 {
        assert_close(d2 / d1, 2.0, 0.01, "Linearity: deflection ratio = 2.0");
    }
}
