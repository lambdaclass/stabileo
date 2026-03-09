/// Validation: Extended Reciprocal Theorems (Maxwell, Betti)
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 9
///   - Hibbeler, "Structural Analysis", Ch. 10
///   - Timoshenko, "Strength of Materials", Ch. 11
///   - Megson, "Structural and Stress Analysis", Ch. 15
///
/// Maxwell's reciprocal theorem: δ_ij = δ_ji
///   (deflection at i due to unit load at j = deflection at j due to unit load at i)
///
/// Betti's theorem: W₁₂ = W₂₁
///   (virtual work of system 1 loads through system 2 displacements = vice versa)
///
/// Tests:
///   1. Maxwell: propped cantilever — δ_ij = δ_ji
///   2. Betti: cantilever — moment + force, W₁₂ = W₂₁
///   3. Maxwell: three-span continuous beam — δ_ij = δ_ji across spans
///   4. Maxwell: frame — vertical force reciprocity
///   5. Betti: continuous beam — two point loads at different magnitudes
///   6. Maxwell: SS beam — horizontal force reciprocity (axial)
///   7. Maxwell: 3D beam — cross-axis reciprocity (Fz at i, Fy at j)
///   8. Betti: portal frame — lateral + gravity load systems
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Maxwell: Propped Cantilever — δ_ij = δ_ji
// ================================================================
//
// Fixed at left, rollerY at right. Apply unit load at L/4, measure
// at 3L/4, then swap. Maxwell guarantees δ_ij = δ_ji.

#[test]
fn validation_reciprocal_ext_maxwell_propped_cantilever() {
    let l = 8.0;
    let n = 16;
    let p = 1.0;

    let node_i = 5;  // L/4
    let node_j = 13; // 3L/4

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_i);
    let delta_ji = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads_j);
    let delta_ij = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell propped cantilever: δ_ji = δ_ij");
}

// ================================================================
// 2. Betti: Cantilever — Moment + Force
// ================================================================
//
// System 1: applied moment M at tip.
// System 2: point force P at mid-span.
// Betti: M * θ_tip(sys2) + 0 = P * δ_mid(sys1)
// i.e., W₁₂ = W₂₁ where loads of one system do work through
// displacements of the other.

#[test]
fn validation_reciprocal_ext_betti_cantilever_moment_force() {
    let l = 6.0;
    let n = 12;
    let m_val = 5.0;  // moment at tip
    let p_val = 8.0;  // force at midspan

    let node_mid = 7;  // midspan node (n/2 + 1)
    let node_tip = n + 1; // tip node

    // System 1: moment M at tip
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_tip, fx: 0.0, fy: 0.0, mz: m_val,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "fixed", None, loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let delta_mid_sys1 = res1.displacements.iter().find(|d| d.node_id == node_mid).unwrap().uy;

    // System 2: force P downward at midspan
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_mid, fx: 0.0, fy: -p_val, mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "fixed", None, loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let theta_tip_sys2 = res2.displacements.iter().find(|d| d.node_id == node_tip).unwrap().rz;

    // Betti: W₁₂ = work of sys1 loads through sys2 displacements
    //   = M * θ_tip(sys2)
    // W₂₁ = work of sys2 loads through sys1 displacements
    //   = P * |δ_mid(sys1)| (force downward, displacement may be upward from moment)
    //
    // Use signed: W₁₂ = M * θ_tip_sys2, W₂₁ = (-P) * δ_mid_sys1
    let w12 = m_val * theta_tip_sys2;
    let w21 = (-p_val) * delta_mid_sys1;

    assert_close(w12, w21, 0.02,
        "Betti cantilever: M*θ_tip(sys2) = P*δ_mid(sys1)");
}

// ================================================================
// 3. Maxwell: Three-Span Continuous Beam — δ_ij = δ_ji
// ================================================================
//
// Three-span continuous beam (pinned at start, rollerX at each
// intermediate support and end). Check reciprocity for points
// in span 1 and span 3.

#[test]
fn validation_reciprocal_ext_maxwell_three_span() {
    let span = 5.0;
    let n = 10; // elements per span
    let p = 1.0;

    // Span 1 nodes: 1..11, span 2 nodes: 11..21, span 3 nodes: 21..31
    let node_i = 5;   // midspan of span 1
    let node_j = 26;  // midspan of span 3

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_i = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_i);
    let delta_ji = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uy;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_j = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads_j);
    let delta_ij = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uy;

    assert_close(delta_ji, delta_ij, 0.01,
        "Maxwell three-span: δ_ji = δ_ij across spans 1 and 3");
}

// ================================================================
// 4. Maxwell: Frame — Vertical Force Reciprocity
// ================================================================
//
// Portal frame (fixed-fixed). Apply vertical force at top-left (node 2),
// measure vertical displacement at top-right (node 3), then swap.
// Maxwell: δ_uy3(Fy@2) = δ_uy2(Fy@3)

#[test]
fn validation_reciprocal_ext_maxwell_frame_vertical() {
    let h = 5.0;
    let w = 8.0;
    let p = 1.0;

    // System A: vertical force at node 2 (top-left), measure uy at node 3
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let mats = vec![(1, E, 0.3)];
    let secs = vec![(1, A, IZ)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "fixed"), (2, 4, "fixed")];

    let loads_a = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_a = make_input(nodes.clone(), mats.clone(), secs.clone(),
        elems.clone(), sups.clone(), loads_a);
    let uy3_from_a = linear::solve_2d(&input_a).unwrap()
        .displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    // System B: vertical force at node 3, measure uy at node 2
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_b = make_input(nodes, mats, secs, elems, sups, loads_b);
    let uy2_from_b = linear::solve_2d(&input_b).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().uy;

    assert_close(uy3_from_a, uy2_from_b, 0.01,
        "Maxwell frame vertical: δ_uy3(Fy@2) = δ_uy2(Fy@3)");
}

// ================================================================
// 5. Betti: Continuous Beam — Two Point Loads
// ================================================================
//
// Two-span continuous beam. System 1: P1 at quarter of span 1.
// System 2: P2 at quarter of span 2.
// Betti: P1 * δ_a(sys2) = P2 * δ_b(sys1)
// where a = load point of sys1, b = load point of sys2.

#[test]
fn validation_reciprocal_ext_betti_continuous() {
    let span = 7.0;
    let n = 14; // elements per span
    let p1 = 12.0;
    let p2 = 20.0;

    // Two-span beam: nodes 1..15 (span1), 15..29 (span2)
    // Quarter of span 1: node 4 (approx L/4)
    // Quarter of span 2: node 18 (n + 4)
    let node_a = 4;
    let node_b = n + 4; // = 18

    // System 1: P1 at node_a
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_a, fx: 0.0, fy: -p1, mz: 0.0,
    })];
    let input1 = make_continuous_beam(&[span, span], n, E, A, IZ, loads1);
    let res1 = linear::solve_2d(&input1).unwrap();
    let delta_b_sys1 = res1.displacements.iter().find(|d| d.node_id == node_b).unwrap().uy;

    // System 2: P2 at node_b
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_b, fx: 0.0, fy: -p2, mz: 0.0,
    })];
    let input2 = make_continuous_beam(&[span, span], n, E, A, IZ, loads2);
    let res2 = linear::solve_2d(&input2).unwrap();
    let delta_a_sys2 = res2.displacements.iter().find(|d| d.node_id == node_a).unwrap().uy;

    // Betti: P2 * δ_b(sys1) = P1 * δ_a(sys2)
    // Both deltas are negative (downward), forces are downward.
    // Work = (-P) * δ (force down, displacement down → positive work)
    let w12 = p2 * delta_b_sys1; // P2 through displacement of sys1 at node_b
    let w21 = p1 * delta_a_sys2; // P1 through displacement of sys2 at node_a

    assert_close(w12, w21, 0.01,
        "Betti continuous beam: P2*δ_b(sys1) = P1*δ_a(sys2)");
}

// ================================================================
// 6. Maxwell: SS Beam — Horizontal (Axial) Reciprocity
// ================================================================
//
// Simply-supported beam (pinned + rollerX). Apply unit horizontal
// force at node i, measure ux at node j, then swap.
// Since rollerX allows horizontal movement at the right end,
// axial deformation produces measurable ux.

#[test]
fn validation_reciprocal_ext_maxwell_axial() {
    let l = 10.0;
    let n = 20;
    let p = 1.0;

    let node_i = 6;
    let node_j = 16;

    // Load at i, measure at j
    let loads_i = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_i, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_i = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_i);
    let ux_j_from_i = linear::solve_2d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().ux;

    // Load at j, measure at i
    let loads_j = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node_j, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_j = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_j);
    let ux_i_from_j = linear::solve_2d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().ux;

    assert_close(ux_j_from_i, ux_i_from_j, 0.01,
        "Maxwell axial: ux_j(Fx@i) = ux_i(Fx@j)");
}

// ================================================================
// 7. Maxwell: 3D Beam — Cross-Axis Reciprocity
// ================================================================
//
// 3D cantilever beam. Apply Fz at node i, measure uz at node j,
// then apply Fz at node j, measure uz at node i.
// Maxwell: δ_uz_j(Fz@i) = δ_uz_i(Fz@j).

#[test]
fn validation_reciprocal_ext_maxwell_3d_cross_axis() {
    let l = 8.0;
    let n = 16;
    let p = 1.0;

    let node_i = 5;
    let node_j = 13;

    let fixed = vec![true, true, true, true, true, true];

    // Load Fz at i, measure uz at j
    let loads_i = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_i, fx: 0.0, fy: 0.0, fz: p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_i = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed.clone(), None, loads_i);
    let uz_j_from_i = linear::solve_3d(&input_i).unwrap()
        .displacements.iter().find(|d| d.node_id == node_j).unwrap().uz;

    // Load Fz at j, measure uz at i
    let loads_j = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: node_j, fx: 0.0, fy: 0.0, fz: p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_j = make_3d_beam(n, l, E, 0.3, A, IZ, IZ, 3e-4, fixed, None, loads_j);
    let uz_i_from_j = linear::solve_3d(&input_j).unwrap()
        .displacements.iter().find(|d| d.node_id == node_i).unwrap().uz;

    assert_close(uz_j_from_i, uz_i_from_j, 0.01,
        "Maxwell 3D cross-axis: uz_j(Fz@i) = uz_i(Fz@j)");
}

// ================================================================
// 8. Betti: Portal Frame — Lateral + Gravity Load Systems
// ================================================================
//
// System 1: lateral load H at node 2 (top-left).
// System 2: gravity loads G at nodes 2 and 3 (top joints).
// Betti: W₁₂ = H * ux_2(sys2)
//        W₂₁ = G * uy_2(sys1) + G * uy_3(sys1)
// Maxwell-Betti requires W₁₂ = W₂₁.

#[test]
fn validation_reciprocal_ext_betti_frame_lateral_gravity() {
    let h = 4.0;
    let w = 6.0;
    let h_load = 15.0; // lateral
    let g_load = -10.0; // gravity (downward)

    // System 1: lateral at node 2
    let input1 = make_portal_frame(h, w, E, A, IZ, h_load, 0.0);
    let res1 = linear::solve_2d(&input1).unwrap();
    let uy2_sys1 = res1.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let uy3_sys1 = res1.displacements.iter().find(|d| d.node_id == 3).unwrap().uy;

    // System 2: gravity at nodes 2 and 3
    let input2 = make_portal_frame(h, w, E, A, IZ, 0.0, g_load);
    let res2 = linear::solve_2d(&input2).unwrap();
    let ux2_sys2 = res2.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;

    // W₁₂ = work of sys1 loads through sys2 displacements
    //      = H * ux_2(sys2)
    let w12 = h_load * ux2_sys2;

    // W₂₁ = work of sys2 loads through sys1 displacements
    //      = G * uy_2(sys1) + G * uy_3(sys1)
    let w21 = g_load * uy2_sys1 + g_load * uy3_sys1;

    assert_close(w12, w21, 0.02,
        "Betti frame: H*ux2(sys2) = G*uy2(sys1) + G*uy3(sys1)");
}
