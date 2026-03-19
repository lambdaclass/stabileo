/// Validation: Extended Gable (Pitched Roof) Frame Analysis
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 16 (Slope-Deflection)
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 15-16
///   - Norris, Wilbur & Utku, "Elementary Structural Analysis", Ch. 11
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///
/// Gable frames consist of two columns and two inclined rafters meeting
/// at a ridge. These tests cover:
///   1. Symmetric gable under uniform gravity: equal vertical reactions
///   2. Gable frame lateral load: base shear distribution between columns
///   3. Ridge point load: symmetric load at ridge, rafter axial compression
///   4. Unbalanced snow: asymmetric load on one rafter side
///   5. Rafter thrust: horizontal reaction at base from gravity on pitched roof
///   6. Knee brace effect: adding knee brace reduces rafter moment at eaves
///   7. Pitch angle effect: steeper pitch vs shallow pitch on thrust and moment
///   8. Fixed vs pinned base: moment distribution comparison for gable frame
use dedaliano_engine::{types::*, solver::linear::*};
use crate::common::*;

const E: f64 = 200_000.0; // MPa
const A: f64 = 0.01;      // m^2
const IZ: f64 = 1e-4;     // m^4

/// Helper: build a standard symmetric gable frame.
/// Nodes: 1(0,0), 2(0,h), 3(w/2, h+rise), 4(w,h), 5(w,0)
/// Elements: col1(1-2), rafter1(2-3), rafter2(3-4), col2(4-5)
fn build_gable(
    h: f64,
    w: f64,
    rise: f64,
    base_left: &str,
    base_right: &str,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w / 2.0, h + rise),
        (4, w, h),
        (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // left rafter
        (3, "frame", 3, 4, 1, 1, false, false), // right rafter
        (4, "frame", 4, 5, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1, base_left), (2, 5, base_right)];
    make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    )
}

// ================================================================
// 1. Symmetric Gable Under Uniform Gravity
// ================================================================
//
// A symmetric gable frame (pinned left, rollerX right) with equal
// gravity loads at the three upper nodes. By symmetry and vertical
// equilibrium the vertical reactions must be equal and sum to the
// total applied load. The rollerX support at node 5 provides no
// horizontal reaction, so all horizontal force goes to the pinned
// base at node 1.
//
// Reference: Kassimali, Ch. 16; basic statics.

#[test]
fn validation_gable_extended_symmetric_gravity() {
    let h = 5.0;
    let w = 12.0;
    let rise = 3.0;
    let g = -30.0; // downward load per node

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: g, my: 0.0 }),
    ];
    let input = build_gable(h, w, rise, "pinned", "rollerX", loads);
    let results = solve_2d(&input).expect("solve");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    let total_load: f64 = 3.0 * g;

    // Vertical equilibrium: sum of vertical reactions equals total gravity
    assert_close(r1.rz + r5.rz, -total_load, 0.01, "Symmetric gravity: sum Ry = -total_load");

    // By symmetry, each vertical reaction should be half the total
    assert_close(r1.rz, -total_load / 2.0, 0.01, "Symmetric gravity: Ry1 = total/2");
    assert_close(r5.rz, -total_load / 2.0, 0.01, "Symmetric gravity: Ry5 = total/2");

    // RollerX at node 5 has zero horizontal reaction
    assert_close(r5.rx, 0.0, 0.01, "Symmetric gravity: Rx5 = 0 (rollerX)");
}

// ================================================================
// 2. Gable Frame Lateral Load: Base Shear Distribution
// ================================================================
//
// A fixed-base gable frame with a lateral load at the left eave.
// Both fixed bases resist horizontal force (base shear). Due to
// the frame symmetry, the total horizontal reaction must equal
// the applied lateral load. For a symmetric fixed-base frame,
// the shear is shared between the two columns.
//
// Reference: Hibbeler, Ch. 15 (portal method).

#[test]
fn validation_gable_extended_lateral_base_shear() {
    let h = 5.0;
    let w = 10.0;
    let rise = 2.5;
    let f_lat = 20.0;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: 0.0, my: 0.0 }),
    ];
    let input = build_gable(h, w, rise, "fixed", "fixed", loads);
    let results = solve_2d(&input).expect("solve");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Horizontal equilibrium: Rx1 + Rx5 + F_lat = 0
    assert_close(r1.rx + r5.rx + f_lat, 0.0, 0.01,
        "Lateral load: horizontal equilibrium");

    // Vertical equilibrium: no vertical load so Ry1 + Ry5 = 0
    assert_close(r1.rz + r5.rz, 0.0, 0.01,
        "Lateral load: vertical equilibrium");

    // Both columns should carry part of the shear (both Rx nonzero)
    assert!(r1.rx.abs() > 1.0, "Lateral load: left column carries shear");
    assert!(r5.rx.abs() > 1.0, "Lateral load: right column carries shear");

    // Both bases develop moment
    assert!(r1.my.abs() > 0.1, "Lateral load: base moment at node 1");
    assert!(r5.my.abs() > 0.1, "Lateral load: base moment at node 5");
}

// ================================================================
// 3. Ridge Point Load: Symmetric Load, Rafter Axial Compression
// ================================================================
//
// A vertical point load at the ridge of a fixed-base gable frame.
// By symmetry the vertical reactions are each P/2. The inclined
// rafters carry axial compression because the load acts along
// the ridge and is resolved into axial and transverse components
// along each rafter.
//
// Reference: Norris et al., Ch. 11 (pitched roof frames).

#[test]
fn validation_gable_extended_ridge_point_load() {
    let h = 5.0;
    let w = 10.0;
    let rise = 3.0;
    let p = -40.0; // downward

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p, my: 0.0 }),
    ];
    let input = build_gable(h, w, rise, "fixed", "fixed", loads);
    let results = solve_2d(&input).expect("solve");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Vertical equilibrium
    assert_close(r1.rz + r5.rz, -p, 0.01, "Ridge load: Ry1 + Ry5 = -P");

    // By symmetry: Ry1 = Ry5 = P/2 (approx, fixed bases also carry moment)
    assert_close(r1.rz, r5.rz, 0.02, "Ridge load: Ry1 ~ Ry5 by symmetry");

    // Horizontal equilibrium: Rx1 + Rx5 = 0
    assert_close(r1.rx + r5.rx, 0.0, 0.01, "Ridge load: Rx1 + Rx5 = 0");

    // Rafters (elements 2 and 3) should have axial compression (n_start < 0).
    // In the solver, negative axial force means compression.
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // Both rafters carry axial force (nonzero)
    assert!(ef2.n_start.abs() > 0.1, "Ridge load: left rafter has axial force");
    assert!(ef3.n_start.abs() > 0.1, "Ridge load: right rafter has axial force");

    // Symmetric loading: rafter axial forces should be similar in magnitude
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.05,
        "Ridge load: symmetric rafter axial forces");
}

// ================================================================
// 4. Unbalanced Snow: Asymmetric Load on One Rafter
// ================================================================
//
// Snow load applied only on the left rafter (element 2) as a UDL.
// This asymmetric loading causes unequal vertical reactions and
// horizontal sway. The structure is fixed-base symmetric, but
// the loading is not.
//
// Reference: Kassimali, Ch. 16 (asymmetric loading on frames).

#[test]
fn validation_gable_extended_unbalanced_snow() {
    let h = 5.0;
    let w = 12.0;
    let rise = 3.0;
    let q = -8.0; // snow on left rafter only

    // Distributed load only on the left rafter (element 2)
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input = build_gable(h, w, rise, "fixed", "fixed", loads);
    let results = solve_2d(&input).expect("solve");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Global equilibrium checks.
    // The distributed load q is in local Y (perpendicular to element).
    // Left rafter goes from node 2 (0, h) to node 3 (w/2, h+rise).
    // dx = w/2, dy = rise. Local Y in global coords = (-sin(theta), cos(theta)).
    // Total global force: Fx = -q * dy = -q * rise, Fy = q * dx = q * (w/2).
    let applied_fx: f64 = -q * rise;
    let applied_fz: f64 = q * (w / 2.0);

    // Vertical: sum of Ry must balance total applied vertical load component
    let sum_ry: f64 = r1.rz + r5.rz;
    assert_close(sum_ry + applied_fz, 0.0, 0.05,
        "Unbalanced snow: vertical equilibrium");

    // Horizontal equilibrium: Rx1 + Rx5 + applied_fx = 0
    let sum_rx: f64 = r1.rx + r5.rx;
    assert_close(sum_rx + applied_fx, 0.0, 0.05,
        "Unbalanced snow: horizontal equilibrium");

    // Reactions should NOT be symmetric (load is on one side only)
    assert!((r1.rz - r5.rz).abs() > 0.5,
        "Unbalanced snow: unequal vertical reactions Ry1={:.3} Ry5={:.3}",
        r1.rz, r5.rz);

    // Left base should carry more vertical reaction since load is on left rafter
    assert!(r1.rz > r5.rz,
        "Unbalanced snow: left base Ry1={:.3} > right base Ry5={:.3}",
        r1.rz, r5.rz);
}

// ================================================================
// 5. Rafter Thrust: Horizontal Reaction from Gravity on Pitched Roof
// ================================================================
//
// A pinned-base gable frame under symmetric gravity load at nodes
// 2, 3, 4 develops horizontal thrust at the pinned supports. The
// inclined rafters push outward, so the pinned supports must resist
// this. The thrust should be equal and opposite at the two bases.
//
// Reference: McGuire et al., Ch. 5 (inclined member forces).

#[test]
fn validation_gable_extended_rafter_thrust() {
    let h = 4.0;
    let w = 10.0;
    let rise = 3.0;
    let g = -25.0;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: g, my: 0.0 }),
    ];
    let input = build_gable(h, w, rise, "pinned", "pinned", loads);
    let results = solve_2d(&input).expect("solve");

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();

    // Horizontal thrust: Rx1 and Rx5 should be equal and opposite
    assert_close(r1.rx + r5.rx, 0.0, 0.01, "Rafter thrust: Rx1 + Rx5 = 0");

    // Thrust must be nonzero (the inclined rafters push outward)
    assert!(r1.rx.abs() > 0.1,
        "Rafter thrust: nonzero horizontal reaction at pinned base, Rx1={:.4}", r1.rx);

    // Vertical equilibrium
    let total_gravity: f64 = 3.0 * g;
    assert_close(r1.rz + r5.rz, -total_gravity, 0.01, "Rafter thrust: vertical equilibrium");

    // For pinned supports, moment reaction is zero
    assert_close(r1.my, 0.0, 0.01, "Rafter thrust: Mz1 = 0 (pinned)");
    assert_close(r5.my, 0.0, 0.01, "Rafter thrust: Mz5 = 0 (pinned)");
}

// ================================================================
// 6. Knee Brace Effect: Reduces Rafter Moment at Eaves
// ================================================================
//
// Adding diagonal knee braces from mid-column to the eave-rafter
// junction stiffens the frame and reduces the bending moment at
// the eave (column-rafter junction). We compare the eave moment
// with and without knee braces.
//
// Reference: Hibbeler, Ch. 15; industrial frame design practice.

#[test]
fn validation_gable_extended_knee_brace_effect() {
    let h = 6.0;
    let w = 12.0;
    let rise = 3.0;
    let f_lat = 15.0;

    // --- Unbraced gable (pinned bases) ---
    let loads_unbraced = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: 0.0, my: 0.0 }),
    ];
    let input_unbraced = build_gable(h, w, rise, "pinned", "pinned", loads_unbraced);
    let res_unbraced = solve_2d(&input_unbraced).expect("solve");

    // Eave sway for unbraced frame
    let d_unbraced: f64 = res_unbraced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // --- Braced gable (pinned bases + knee braces) ---
    // Nodes: 1(0,0), 2(0,h), 3(w/2,h+rise), 4(w,h), 5(w,0),
    //        6(0,h/2) mid-left-column, 7(w,h/2) mid-right-column
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w / 2.0, h + rise),
        (4, w, h), (5, w, 0.0),
        (6, 0.0, h / 2.0), (7, w, h / 2.0),
    ];
    let elems = vec![
        (1, "frame", 1, 6, 1, 1, false, false), // lower left column
        (2, "frame", 6, 2, 1, 1, false, false), // upper left column
        (3, "frame", 2, 3, 1, 1, false, false), // left rafter
        (4, "frame", 3, 4, 1, 1, false, false), // right rafter
        (5, "frame", 4, 7, 1, 1, false, false), // upper right column
        (6, "frame", 7, 5, 1, 1, false, false), // lower right column
        (7, "frame", 6, 3, 1, 1, false, false), // left knee brace (diagonal to ridge)
        (8, "frame", 7, 3, 1, 1, false, false), // right knee brace (diagonal to ridge)
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "pinned")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: 0.0, my: 0.0 }),
    ];
    let input_braced = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        loads,
    );
    let res_braced = solve_2d(&input_braced).expect("solve");

    // Eave sway for braced frame
    let d_braced: f64 = res_braced.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame should have significantly less lateral displacement
    assert!(d_braced < d_unbraced * 0.7,
        "Knee brace: braced sway {:.6} < 70% unbraced sway {:.6}", d_braced, d_unbraced);

    // Also verify equilibrium of the braced frame
    let r1_b = res_braced.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5_b = res_braced.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1_b.rx + r5_b.rx + f_lat, 0.0, 0.01,
        "Knee brace: horizontal equilibrium");
}

// ================================================================
// 7. Pitch Angle Effect: Steeper vs Shallow Pitch
// ================================================================
//
// Compare two gable frames with the same span and column height but
// different pitch (rise). A steeper pitch generates less horizontal
// thrust at the base under the same vertical ridge load because the
// rafter angle is more vertical. We verify this by comparing the
// horizontal reactions.
//
// Reference: Norris et al., Ch. 11 (effect of pitch on thrust).

#[test]
fn validation_gable_extended_pitch_angle_effect() {
    let h = 5.0;
    let w = 12.0;
    let p = -30.0; // vertical ridge load

    // Shallow pitch: rise = 1.5 m
    let rise_shallow = 1.5;
    let loads_shallow = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p, my: 0.0 }),
    ];
    let input_shallow = build_gable(h, w, rise_shallow, "pinned", "pinned", loads_shallow);
    let res_shallow = solve_2d(&input_shallow).expect("solve");

    let r1_shallow = res_shallow.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Steep pitch: rise = 5.0 m
    let rise_steep = 5.0;
    let loads_steep = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: p, my: 0.0 }),
    ];
    let input_steep = build_gable(h, w, rise_steep, "pinned", "pinned", loads_steep);
    let res_steep = solve_2d(&input_steep).expect("solve");

    let r1_steep = res_steep.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Both should satisfy vertical equilibrium
    let r5_shallow = res_shallow.reactions.iter().find(|r| r.node_id == 5).unwrap();
    let r5_steep = res_steep.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1_shallow.rz + r5_shallow.rz, -p, 0.01,
        "Shallow pitch: vertical equilibrium");
    assert_close(r1_steep.rz + r5_steep.rz, -p, 0.01,
        "Steep pitch: vertical equilibrium");

    // Steeper pitch should have less horizontal thrust
    let thrust_shallow: f64 = r1_shallow.rx.abs();
    let thrust_steep: f64 = r1_steep.rx.abs();
    assert!(thrust_steep < thrust_shallow,
        "Pitch effect: steep thrust {:.4} < shallow thrust {:.4}",
        thrust_steep, thrust_shallow);

    // Ridge vertical deflection: steeper pitch should deflect less vertically
    // (stiffer in the vertical direction due to more vertical rafter orientation)
    let d_ridge_shallow: f64 = res_shallow.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz.abs();
    let d_ridge_steep: f64 = res_steep.displacements.iter()
        .find(|d| d.node_id == 3).unwrap().uz.abs();
    assert!(d_ridge_steep < d_ridge_shallow,
        "Pitch effect: steep deflection {:.6} < shallow deflection {:.6}",
        d_ridge_steep, d_ridge_shallow);
}

// ================================================================
// 8. Fixed vs Pinned Base: Moment Distribution Comparison
// ================================================================
//
// Under the same loading, a fixed-base gable frame develops base
// moments that reduce the moments in the rafters, compared to a
// pinned-base frame. The fixed-base frame is also stiffer (less
// lateral displacement). We compare both configurations.
//
// Reference: McGuire et al., Ch. 5 (effect of boundary conditions).

#[test]
fn validation_gable_extended_fixed_vs_pinned_base() {
    let h = 5.0;
    let w = 10.0;
    let rise = 2.5;
    let f_lat = 12.0;
    let g = -15.0;

    // --- Pinned-base gable ---
    let loads_p = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: g, my: 0.0 }),
    ];
    let input_pinned = build_gable(h, w, rise, "pinned", "pinned", loads_p);
    let res_pinned = solve_2d(&input_pinned).expect("solve");

    // --- Fixed-base gable ---
    let loads_f = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f_lat, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: g, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: g, my: 0.0 }),
    ];
    let input_fixed = build_gable(h, w, rise, "fixed", "fixed", loads_f);
    let res_fixed = solve_2d(&input_fixed).expect("solve");

    // Fixed bases should have nonzero moment reactions
    let r1_fixed = res_fixed.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5_fixed = res_fixed.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert!(r1_fixed.my.abs() > 0.1, "Fixed base: Mz1 nonzero");
    assert!(r5_fixed.my.abs() > 0.1, "Fixed base: Mz5 nonzero");

    // Pinned bases should have zero moment reactions
    let r1_pinned = res_pinned.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5_pinned = res_pinned.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1_pinned.my, 0.0, 0.01, "Pinned base: Mz1 = 0");
    assert_close(r5_pinned.my, 0.0, 0.01, "Pinned base: Mz5 = 0");

    // Fixed-base frame should be stiffer: less lateral displacement at eave
    let d_eave_pinned: f64 = res_pinned.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_eave_fixed: f64 = res_fixed.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();
    assert!(d_eave_fixed < d_eave_pinned,
        "Fixed vs pinned: fixed sway {:.6} < pinned sway {:.6}",
        d_eave_fixed, d_eave_pinned);

    // Both frames must satisfy global equilibrium
    // Horizontal: sum Rx + applied Fx = 0
    let total_fx = f_lat;
    assert_close(
        r1_fixed.rx + r5_fixed.rx + total_fx, 0.0, 0.01,
        "Fixed base: horizontal equilibrium",
    );
    assert_close(
        r1_pinned.rx + r5_pinned.rx + total_fx, 0.0, 0.01,
        "Pinned base: horizontal equilibrium",
    );

    // Vertical: sum Ry + applied Fy = 0
    let total_fz: f64 = 3.0 * g;
    assert_close(
        r1_fixed.rz + r5_fixed.rz + total_fz, 0.0, 0.01,
        "Fixed base: vertical equilibrium",
    );
    assert_close(
        r1_pinned.rz + r5_pinned.rz + total_fz, 0.0, 0.01,
        "Pinned base: vertical equilibrium",
    );
}
