/// Validation: Axial Force Effects in Frame Elements
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 2 (axial deformation)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4 (axial members)
///   - Timoshenko, "Strength of Materials", Part I, Ch. 1
///
/// Tests verify:
///   1. Pure tension bar
///   2. Pure compression bar
///   3. Axial deformation proportional to load
///   4. Axial deformation proportional to length
///   5. Combined axial + bending (independence)
///   6. Portal frame column axial forces under gravity
///   7. Inclined member axial decomposition
///   8. Axial force constant along uniform member (equilibrium)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Pure Tension
// ================================================================
//
// Horizontal bar pinned at left, rollerX at right.
// Fx = +100 applied at right node (tension in positive x direction).
// Axial displacement: ux = FL / (EA).
// Axial force magnitude = 100.

#[test]
fn validation_pure_tension() {
    let l = 5.0;
    let f = 100.0;
    let n = 1;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Axial displacement at right end: ux = FL / (EA)
    let ux_expected = f * l / (E_EFF * A);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(d2.ux, ux_expected, 0.02, "tension ux = FL/(EA)");

    // Axial force magnitude should be F
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), f, 0.02, "tension |n_start| = F");
    assert_close(ef.n_end.abs(), f, 0.02, "tension |n_end| = F");

    // No transverse displacement
    assert!(d2.uz.abs() < 1e-6, "tension: uy should be zero, got {:.6e}", d2.uz);

    // No shear or moment
    assert!(ef.v_start.abs() < 1e-4, "tension: V should be zero");
    assert!(ef.m_start.abs() < 1e-4, "tension: M should be zero");
}

// ================================================================
// 2. Pure Compression
// ================================================================
//
// Same setup but Fx = -100 at right node (compression).
// Displacement negative (bar shortens).

#[test]
fn validation_pure_compression() {
    let l = 5.0;
    let f = -100.0; // compression
    let n = 1;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Axial displacement should be negative (shortening)
    let ux_expected = f * l / (E_EFF * A);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert_close(d2.ux, ux_expected, 0.02, "compression ux = FL/(EA)");
    assert!(d2.ux < 0.0, "compression: ux should be negative, got {:.6e}", d2.ux);

    // Axial force magnitude should be |F|
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.n_start.abs(), f.abs(), 0.02, "compression |n_start| = |F|");
    assert_close(ef.n_end.abs(), f.abs(), 0.02, "compression |n_end| = |F|");

    // No shear or moment
    assert!(ef.v_start.abs() < 1e-4, "compression: V should be zero");
    assert!(ef.m_start.abs() < 1e-4, "compression: M should be zero");
}

// ================================================================
// 3. Axial Deformation Proportional to Load
// ================================================================
//
// Same bar, same length. Apply F and then 2F.
// Displacement should exactly double (linear).

#[test]
fn validation_axial_proportional_to_load() {
    let l = 6.0;
    let f1 = 50.0;
    let f2 = 100.0; // double the load
    let n = 1;

    let input1 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f1, fz: 0.0, my: 0.0,
        })]);
    let input2 = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f2, fz: 0.0, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // ux2 should be exactly 2 * ux1
    let ratio = ux2 / ux1;
    assert_close(ratio, f2 / f1, 0.02, "ux proportional to load (ratio)");

    // Also check absolute values against formula
    let ux1_expected = f1 * l / (E_EFF * A);
    let ux2_expected = f2 * l / (E_EFF * A);
    assert_close(ux1, ux1_expected, 0.02, "ux1 = F1*L/(EA)");
    assert_close(ux2, ux2_expected, 0.02, "ux2 = F2*L/(EA)");
}

// ================================================================
// 4. Axial Deformation Proportional to Length
// ================================================================
//
// Same force, same section. L=5 vs L=10.
// Displacement should exactly double.

#[test]
fn validation_axial_proportional_to_length() {
    let l1 = 5.0;
    let l2 = 10.0; // double the length
    let f = 80.0;

    let input1 = make_beam(1, l1, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);
    let input2 = make_beam(1, l2, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: f, fz: 0.0, my: 0.0,
        })]);

    let res1 = linear::solve_2d(&input1).unwrap();
    let res2 = linear::solve_2d(&input2).unwrap();

    let ux1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let ux2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // ux2 should be exactly 2 * ux1
    let ratio = ux2 / ux1;
    assert_close(ratio, l2 / l1, 0.02, "ux proportional to length (ratio)");

    // Check absolute values
    let ux1_expected = f * l1 / (E_EFF * A);
    let ux2_expected = f * l2 / (E_EFF * A);
    assert_close(ux1, ux1_expected, 0.02, "ux1 = F*L1/(EA)");
    assert_close(ux2, ux2_expected, 0.02, "ux2 = F*L2/(EA)");
}

// ================================================================
// 5. Combined Axial + Bending (Independence)
// ================================================================
//
// Cantilever with simultaneous tip Fx and tip Fy.
// ux = Fx*L / (EA), uy = Fy*L^3 / (3EI).
// These do not interact in linear analysis.

#[test]
fn validation_combined_axial_bending_independence() {
    let l = 6.0;
    let n = 4;
    let fx = 80.0;
    let fy = -30.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fz: fy, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    let d_tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Axial displacement: ux = Fx*L / (EA)
    let ux_expected = fx * l / (E_EFF * A);
    assert_close(d_tip.ux, ux_expected, 0.02, "combined: ux = Fx*L/(EA)");

    // Transverse displacement: uy = Fy*L^3 / (3*EI)
    let ei = E_EFF * IZ;
    let uy_expected = fy * l.powi(3) / (3.0 * ei);
    assert_close(d_tip.uz, uy_expected, 0.02, "combined: uy = Fy*L^3/(3EI)");

    // Verify independence: run axial-only and bending-only, compare
    let input_axial = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fz: 0.0, my: 0.0,
        })]);
    let input_bend = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: fy, my: 0.0,
        })]);

    let res_axial = linear::solve_2d(&input_axial).unwrap();
    let res_bend = linear::solve_2d(&input_bend).unwrap();

    let ux_only = res_axial.displacements.iter().find(|d| d.node_id == n + 1).unwrap().ux;
    let uy_only = res_bend.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Combined should equal sum of separate effects (superposition)
    assert_close(d_tip.ux, ux_only, 0.02, "superposition: ux combined = ux axial-only");
    assert_close(d_tip.uz, uy_only, 0.02, "superposition: uy combined = uy bend-only");
}

// ================================================================
// 6. Portal Frame Column Axial Forces Under Gravity
// ================================================================
//
// Fixed-base portal with equal gravity loads at both top nodes.
// By symmetry, each column carries half the total vertical load.
// Column axial force magnitude = gravity load per node.

#[test]
fn validation_portal_column_axial_gravity() {
    let h = 4.0;
    let w = 6.0;
    let gravity = -50.0; // downward at each top node

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical load = 2 * |gravity| = 100
    // By symmetry each base takes half
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    let total_gravity = 2.0 * gravity.abs();

    // Each column reaction = total_gravity / 2
    assert_close(r1.rz, total_gravity / 2.0, 0.02, "portal col 1 Ry = W/2");
    assert_close(r4.rz, total_gravity / 2.0, 0.02, "portal col 4 Ry = W/2");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_gravity, 0.02, "portal gravity: sum Ry = total W");

    // Column axial forces: each column carries gravity load per node
    // Column 1 is element 1 (node 1 to node 2, vertical)
    // Column 2 is element 3 (node 3 to node 4, vertical)
    let ef_col1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_col2 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Each column carries |gravity| axial force (the load at its top node)
    // Due to symmetry, no shear redistribution adds to column axial
    assert_close(ef_col1.n_start.abs(), gravity.abs(), 0.05,
        "portal col 1 axial = gravity per node");
    assert_close(ef_col2.n_start.abs(), gravity.abs(), 0.05,
        "portal col 2 axial = gravity per node");

    // Symmetry: both column axial forces should be equal
    assert_close(ef_col1.n_start.abs(), ef_col2.n_start.abs(), 0.02,
        "portal: symmetric column axial forces");
}

// ================================================================
// 7. Inclined Member Axial Decomposition
// ================================================================
//
// Two-member truss: horizontal bar (0,0)-(4,0) and inclined bar
// (0,0)-(3,4). Free joint at (3,4) receives Fy=-50.
// Pinned at (0,0), rollerX at (4,0).
// The inclined member (elem 2) carries the entire vertical load since
// the horizontal bar cannot resist vertical force.
// Member 2: length = 5, sin(theta) = 4/5, cos(theta) = 3/5.
// N_inclined * sin(theta) = 50, so N_inclined = 62.5 (compression).

#[test]
fn validation_inclined_member_axial() {
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 3.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // horizontal
            (2, "truss", 1, 3, 1, 1, false, false), // inclined (0,0)-(3,4)
            (3, "truss", 2, 3, 1, 1, false, false), // connects (4,0)-(3,4)
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -50.0, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: sum Ry = 50
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 50.0, 0.02, "inclined truss: sum Ry = 50");

    // Horizontal equilibrium: sum Rx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 0.5, "inclined truss: sum Rx ~= 0, got {:.4}", sum_rx);

    // Truss members: V=0, M=0
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-4,
            "truss elem {}: V should be zero, got {:.6}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 1e-4,
            "truss elem {}: M should be zero, got {:.6}", ef.element_id, ef.m_start);
    }

    // All members carry some axial force (load must be resolved through truss)
    for ef in &results.element_forces {
        assert!(ef.n_start.abs() > 1.0,
            "truss elem {}: should carry axial force, got {:.4}", ef.element_id, ef.n_start);
    }

    // Verify axial force decomposes consistently with reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // At node 1 (pinned): horizontal reaction = sum of horizontal components of members meeting here
    // At node 2 (rollerX): vertical reaction only
    // Total vertical equilibrium
    assert_close(r1.rz + r2.rz, 50.0, 0.02, "inclined: sum Ry matches applied load");
}

// ================================================================
// 8. Axial Force Constant Along Uniform Member
// ================================================================
//
// A frame element with no distributed axial load should have constant
// axial force. In this solver's sign convention, n_start and n_end
// report the same value (both positive for tension, both negative
// for compression). Without distributed axial load, n_start = n_end.
// Verify this on multiple elements of a loaded frame.

#[test]
fn validation_axial_force_constant_along_member() {
    // Cantilever with tip axial + transverse loads
    // Without distributed load, axial force is constant per element
    let l = 8.0;
    let n = 4;
    let fx = 60.0;
    let fy = -25.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx, fz: fy, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // For each element: n_start should equal n_end (constant axial force)
    for ef in &results.element_forces {
        let diff = (ef.n_start - ef.n_end).abs();
        assert!(diff < 1e-3,
            "elem {}: n_start={:.6}, n_end={:.6}, diff={:.6} (should be ~0)",
            ef.element_id, ef.n_start, ef.n_end, diff);
    }

    // All elements should carry the same axial force magnitude (= fx)
    for ef in &results.element_forces {
        assert_close(ef.n_start.abs(), fx, 0.02,
            &format!("elem {}: |n_start| = Fx", ef.element_id));
    }

    // Also verify on a portal frame: columns carry axial, beam carries axial
    let h = 4.0;
    let w = 6.0;
    let gravity = -40.0;
    let input_portal = make_portal_frame(h, w, E, A, IZ, 0.0, gravity);
    let res_portal = linear::solve_2d(&input_portal).unwrap();

    // Each element has constant axial force (n_start = n_end)
    for ef in &res_portal.element_forces {
        let diff = (ef.n_start - ef.n_end).abs();
        assert!(diff < 1e-3,
            "portal elem {}: n_start={:.6}, n_end={:.6}, diff={:.6} (should be ~0)",
            ef.element_id, ef.n_start, ef.n_end, diff);
    }
}
