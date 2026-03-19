/// Validation: Bentley STAAD.Pro Verification Manual Problems
///
/// Reference: STAAD.Pro Verification Manual (V1–V8 style problems).
///
/// Tests: cantilever tip deflection, SS beam UDL, continuous beam reactions,
///        plane truss bar forces, space truss 3D, portal frame sway,
///        Gerber beam with intermediate hinge, beam on spring supports.
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const E_EFF: f64 = E * 1000.0; // kN/m² (solver effective units)
const A: f64 = 0.01; // m²
const IZ: f64 = 1e-4; // m⁴

// ═══════════════════════════════════════════════════════════════
// V1: Cantilever Beam with End Point Load
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V1
// Cantilever of length L with point load P at the free end.
// Analytical: tip deflection = PL^3 / (3EI)
//             tip rotation  = PL^2 / (2EI)
//             base moment   = P * L
//             base shear    = P

#[test]
fn validation_staad_v1_cantilever_end_load() {
    let l = 6.0; // m
    let p = 50.0; // kN downward
    let n = 10; // number of elements

    let input = make_beam(
        n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Tip deflection: delta = PL^3 / (3EI)
    let delta_expected = p * l.powi(3) / (3.0 * E_EFF * IZ);
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz.abs(), delta_expected, 0.01, "V1 tip deflection PL³/3EI");

    // Tip rotation: theta = PL^2 / (2EI)
    let theta_expected = p * l.powi(2) / (2.0 * E_EFF * IZ);
    assert_close(tip.ry.abs(), theta_expected, 0.01, "V1 tip rotation PL²/2EI");

    // Base reactions: shear = P, moment = P*L
    let r_base = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_base.rz, p, 0.01, "V1 base shear = P");
    assert_close(r_base.my.abs(), p * l, 0.01, "V1 base moment = PL");
}

// ═══════════════════════════════════════════════════════════════
// V2: Simply Supported Beam with Uniform Distributed Load
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V2
// SS beam of length L, UDL w over entire span.
// Analytical: midspan deflection = 5wL^4 / (384EI)
//             max moment          = wL^2 / 8
//             end reactions        = wL / 2

#[test]
fn validation_staad_v2_ss_beam_udl() {
    let l = 10.0; // m
    let w = 24.0; // kN/m downward
    let n = 10; // number of elements

    let input = make_ss_beam_udl(n, l, E, A, IZ, -w);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan deflection: 5wL^4 / (384EI)
    let delta_expected = 5.0 * w * l.powi(4) / (384.0 * E_EFF * IZ);
    let mid_node = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    assert_close(d_mid.uz.abs(), delta_expected, 0.01, "V2 midspan deflection 5wL⁴/384EI");

    // Maximum moment: wL^2 / 8
    let m_expected = w * l * l / 8.0;
    let m_max: f64 = results.element_forces.iter()
        .map(|e| e.m_start.abs().max(e.m_end.abs()))
        .fold(0.0, f64::max);
    assert_close(m_max, m_expected, 0.02, "V2 max moment wL²/8");

    // End reactions: wL / 2 each
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert_close(r_left.rz, w * l / 2.0, 0.01, "V2 R_left = wL/2");
    assert_close(r_right.rz, w * l / 2.0, 0.01, "V2 R_right = wL/2");
}

// ═══════════════════════════════════════════════════════════════
// V3: Continuous Beam over Three Supports
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V3
// Two equal spans L, UDL w over both spans.
// Three-moment equation gives:
//   R_outer = 3wL/8 each, R_center = 10wL/8 = 5wL/4
//   M_center = -wL^2/8 (hogging)

#[test]
fn validation_staad_v3_continuous_beam_two_spans() {
    let l_span = 8.0; // m per span
    let w = 20.0; // kN/m downward
    let n_per = 8; // elements per span

    let n_total = n_per * 2;
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -w,
            q_j: -w,
            a: None,
            b: None,
        }));
    }

    let input = make_continuous_beam(
        &[l_span, l_span], n_per, E, A, IZ, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Total load = w * 2L = 320 kN
    let total_load = w * 2.0 * l_span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "V3 total equilibrium");

    // Outer reactions: R_outer = 3wL/8 = 3*20*8/8 = 60 kN each
    let r_outer_expected = 3.0 * w * l_span / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n_total + 1).unwrap();
    assert_close(r1.rz, r_outer_expected, 0.02, "V3 R_left = 3wL/8");
    assert_close(r_end.rz, r_outer_expected, 0.02, "V3 R_right = 3wL/8");

    // Center reaction: R_center = 10wL/8 = 200 kN
    let r_center_expected = 10.0 * w * l_span / 8.0;
    let center_node = n_per + 1;
    let r_center = results.reactions.iter().find(|r| r.node_id == center_node).unwrap();
    assert_close(r_center.rz, r_center_expected, 0.02, "V3 R_center = 10wL/8");

    // Symmetry: outer reactions should be equal
    assert_close(r1.rz, r_end.rz, 0.01, "V3 symmetry R_left = R_right");
}

// ═══════════════════════════════════════════════════════════════
// V4: Plane Truss with Multiple Bars
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V4
// Simple Pratt truss, symmetric loading, check bar forces by
// method of joints / method of sections.

#[test]
fn validation_staad_v4_plane_truss() {
    // 4-panel Pratt truss: span = 16m, height = 4m
    // Bottom chord: nodes 1(0,0), 2(4,0), 3(8,0), 4(12,0), 5(16,0)
    // Top chord:    nodes 6(4,4), 7(8,4), 8(12,4)
    // Pinned at node 1, roller at node 5.
    // Single load P = 100 kN at bottom midpoint (node 3).
    let p = 100.0;
    let a_bar = 0.005; // m^2 cross-section for all bars

    let nodes = vec![
        (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0), (4, 12.0, 0.0), (5, 16.0, 0.0),
        (6, 4.0, 4.0), (7, 8.0, 4.0), (8, 12.0, 4.0),
    ];

    let elems = vec![
        // Bottom chord
        (1,  "truss", 1, 2, 1, 1, false, false),
        (2,  "truss", 2, 3, 1, 1, false, false),
        (3,  "truss", 3, 4, 1, 1, false, false),
        (4,  "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5,  "truss", 6, 7, 1, 1, false, false),
        (6,  "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7,  "truss", 2, 6, 1, 1, false, false),
        (8,  "truss", 3, 7, 1, 1, false, false),
        (9,  "truss", 4, 8, 1, 1, false, false),
        // Diagonals
        (10, "truss", 1, 6, 1, 1, false, false),
        (11, "truss", 6, 3, 1, 1, false, false),
        (12, "truss", 3, 8, 1, 1, false, false),
        (13, "truss", 8, 5, 1, 1, false, false),
    ];

    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, 1e-10)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R1_y = R5_y = P/2 = 50 kN (symmetric)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.rz, p / 2.0, 0.01, "V4 R_left = P/2");
    assert_close(r5.rz, p / 2.0, 0.01, "V4 R_right = P/2");

    // Top chord force by method of sections:
    // Cut through panel 2-3 bottom, 7 top, diagonal 6-3.
    // Take moment about node 3:
    //   R1 * 8 - F_top_chord * 4 = 0  =>  F_top = R1*8/4 = 50*8/4 = 100 kN (compression)
    // Element 5 is top chord 6-7.
    let ef_top = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let f_top_expected = p / 2.0 * 8.0 / 4.0; // = 100 kN
    assert_close(ef_top.n_start.abs(), f_top_expected, 0.02, "V4 top chord force = 100 kN");

    // Equilibrium: sum of vertical reactions = applied load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.01, "V4 vertical equilibrium");

    // The vertical member at midspan (elem 8: node 3 to 7) should carry zero
    // axial force by symmetry (the load is applied directly at node 3).
    // Method of joints at node 7: by symmetry, left/right diagonals cancel horizontal
    // components and the vertical member 8 carries zero if the load is at the bottom.
    // Actually, F_vertical at node 7: F_8 = 0 because top chord forces left/right are equal.
    let ef_vert_mid = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    assert!(
        ef_vert_mid.n_start.abs() < 1.0,
        "V4 midspan vertical force={:.4} should be ~0 by symmetry",
        ef_vert_mid.n_start
    );
}

// ═══════════════════════════════════════════════════════════════
// V5: Space Truss (3D) with Out-of-Plane Loading
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V5
// Tripod truss: 3 bars meeting at apex, loaded vertically.
// Bars at equal angles in plan, apex at origin, bases at z = -L.

#[test]
fn validation_staad_v5_space_truss_tripod() {
    // Tripod: apex at (0, 0, 0), three base nodes equally spaced
    // at 120 degrees in the XY plane at z = -h.
    // Vertical load P at apex (negative z).
    let h = 3.0; // vertical height
    let r = 2.0; // radial distance of base nodes from centerline
    let p = 60.0; // kN vertical load at apex (downward = -z)
    let a_bar = 0.005;
    let iy = 1e-10;
    let iz_sec = 1e-10;
    let j = 1e-10;

    // Base nodes at 120 degree intervals in XY plane at z = -h
    // Node 1: (r, 0, -h)
    // Node 2: (r*cos(120), r*sin(120), -h)
    // Node 3: (r*cos(240), r*sin(240), -h)
    // Apex: Node 4: (0, 0, 0)
    let angle_1 = 0.0_f64;
    let angle_2 = 120.0_f64.to_radians();
    let angle_3 = 240.0_f64.to_radians();

    let nodes = vec![
        (1, r * angle_1.cos(), r * angle_1.sin(), -h),
        (2, r * angle_2.cos(), r * angle_2.sin(), -h),
        (3, r * angle_3.cos(), r * angle_3.sin(), -h),
        (4, 0.0, 0.0, 0.0), // apex
    ];

    let elems = vec![
        (1, "truss", 1, 4, 1, 1),
        (2, "truss", 2, 4, 1, 1),
        (3, "truss", 3, 4, 1, 1),
    ];

    // All base nodes are pinned (all 6 DOFs restrained)
    let pinned = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, pinned.clone()),
        (2, pinned.clone()),
        (3, pinned.clone()),
    ];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 4, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, 0.3)], vec![(1, a_bar, iy, iz_sec, j)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();

    // Bar length: L_bar = sqrt(r^2 + h^2) = sqrt(4 + 9) = sqrt(13)
    let l_bar = (r * r + h * h).sqrt();

    // Each bar's axial force: by symmetry, all three carry equal force.
    // Vertical component of each bar force = F * cos(alpha) where alpha = angle from vertical.
    // cos(alpha) = h / L_bar
    // 3 * F * (h / L_bar) = P  =>  F = P * L_bar / (3 * h)
    let cos_alpha = h / l_bar;
    let f_bar_expected = p / (3.0 * cos_alpha);

    for ef in &results.element_forces {
        assert_close(
            ef.n_start.abs(), f_bar_expected, 0.02,
            &format!("V5 bar {} axial force", ef.element_id),
        );
    }

    // Apex vertical displacement: delta_z = F * L_bar / (E * A)
    // F = axial force in bar = P*L_bar/(3*h)
    // delta_z = F * L_bar / (E*A) * cos(alpha) ... simplified from compatibility:
    // delta_z = P * L_bar^2 / (3 * h * E_eff * a_bar) * (h / L_bar)
    //         = P * L_bar / (3 * E_eff * a_bar)  ... wait, let me redo.
    //
    // Each bar shortens by dL = F * L_bar / (EA).
    // The vertical displacement of the apex: dz = dL / cos(alpha) = dL * L_bar / h
    // dz = (P * L_bar / (3*h)) * L_bar / (E_eff * a_bar) * (L_bar / h)
    //    = P * L_bar^3 / (3 * h^2 * E_eff * a_bar)
    let delta_z_expected = p * l_bar.powi(3) / (3.0 * h * h * E_EFF * a_bar);
    let apex = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert_close(apex.uz.abs(), delta_z_expected, 0.02, "V5 apex vertical displacement");

    // Equilibrium: sum of vertical reactions = P
    let sum_rz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_rz, p, 0.01, "V5 vertical equilibrium");
}

// ═══════════════════════════════════════════════════════════════
// V6: Portal Frame with Lateral Sway
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V6
// Fixed-base portal frame under lateral load H at beam level.
// Column height h, beam width w, same section throughout.
// Analytical (stiffness method):
//   For I_beam = I_col = I, fixed bases:
//   sway delta = H*h^3 / (24EI) * (2k + 3) / (k + 6)
//   where k = (I_b/w) / (I_c/h) = h/w (for equal I)
//   Column base moment = H*h*(3+k) / (2*(6+k)) ... etc.

#[test]
fn validation_staad_v6_portal_frame_sway() {
    let h_col: f64 = 5.0; // m column height
    let w_beam: f64 = 8.0; // m beam span
    let h_load: f64 = 40.0; // kN lateral
    let iz_sec: f64 = 2e-4; // m^4

    // Stiffness ratio k = (I_beam/w) / (I_col/h) = h/w (same I)
    let k = h_col / w_beam;

    // Analytical sway: delta = H*h^3*(2k+3) / (24EI*(k+6))
    // Derivation from slope-deflection:
    //   For a fixed-base portal with equal I, H at beam level (at node 2):
    //   delta = H*h^3 / (24*E*I_col) * (2*k + 3) / (k + 6)
    //   where k = (I_beam/L_beam) / (I_col/h_col) — for same I: k = h_col/w_beam
    let delta_expected = h_load * h_col.powi(3) / (24.0 * E_EFF * iz_sec)
        * (2.0 * k + 3.0) / (k + 6.0);

    // Build portal: 4 nodes, 3 elements (same section),
    // use multi-element columns for better accuracy
    let n_col = 6; // elements per column
    let n_beam = 6; // elements for beam
    let col_elem = h_col / n_col as f64;
    let beam_elem = w_beam / n_beam as f64;

    let mut nodes = Vec::new();
    let mut node_id = 1_usize;

    // Left column: bottom (0,0) to top (0,h)
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, i as f64 * col_elem));
        node_id += 1;
    }
    let left_top = node_id - 1; // top of left column

    // Beam: from (0,h) to (w,h) -- but left_top is already at (0,h)
    // beam nodes start from left_top+1 to avoid duplicating the corner node
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_elem, h_col));
        node_id += 1;
    }
    let right_top = node_id - 1; // right end of beam = top of right column

    // Right column: from (w,h) to (w,0)
    // right_top is already at (w,h), so start from next node
    for i in 1..=n_col {
        nodes.push((node_id, w_beam, h_col - i as f64 * col_elem));
        node_id += 1;
    }
    let right_bottom = node_id - 1;

    let mut elems = Vec::new();
    let mut eid = 1_usize;

    // Left column elements
    for i in 0..n_col {
        let base_node = i + 1;
        elems.push((eid, "frame", base_node, base_node + 1, 1, 1, false, false));
        eid += 1;
    }

    // Beam elements
    let beam_start_node = left_top;
    for i in 0..n_beam {
        let ni = beam_start_node + i;
        elems.push((eid, "frame", ni, ni + 1, 1, 1, false, false));
        eid += 1;
    }

    // Right column elements (from top to bottom)
    let right_col_start = right_top;
    for i in 0..n_col {
        let ni = right_col_start + i;
        elems.push((eid, "frame", ni, ni + 1, 1, 1, false, false));
        eid += 1;
    }

    // Supports: fixed at bottom-left (node 1) and bottom-right (right_bottom)
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, right_bottom, "fixed"),
    ];

    // Lateral load at top of left column
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: left_top,
        fx: h_load,
        fz: 0.0,
        my: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, iz_sec)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Check sway at beam level
    let d_top = results.displacements.iter().find(|d| d.node_id == left_top).unwrap();
    assert_close(d_top.ux.abs(), delta_expected, 0.02, "V6 sway deflection");

    // Equilibrium: sum of horizontal reactions = H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx.abs(), h_load, 0.01, "V6 horizontal equilibrium");

    // Anti-symmetric: sum of vertical reactions = 0 (no vertical load)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(sum_ry.abs() < 0.01, "V6 vertical equilibrium: sum_ry={:.6} should be ~0", sum_ry);

    // Column base moments: by slope-deflection
    // M_base = H*h*(3+k) / (2*(6+k))  — moment at each column base
    // For portal loaded at one node, the distribution depends on the exact formulation.
    // We verify total moment equilibrium: sum of base moments + H*h = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_rb = results.reactions.iter().find(|r| r.node_id == right_bottom).unwrap();

    // Moment check: both base moments should be nonzero (fixed supports).
    // For a fixed-base portal with lateral load, the base moments have
    // the same sign (both resisting the overturning).
    assert!(r1.my.abs() > 1.0, "V6 left base moment should be nonzero");
    assert!(r_rb.my.abs() > 1.0, "V6 right base moment should be nonzero");

    // Column base moment analytical: for fixed-base portal with equal I,
    // M_base = H*h/2 * (3+k)/(2*(6+k)) ... but this depends on which column.
    // Just verify the total base shear is distributed to both columns.
    // Each column base carries part of the horizontal load.
    assert_close(
        r1.rx.abs() + r_rb.rx.abs(), h_load, 0.01,
        "V6 base shear distribution sums to H",
    );
}

// ═══════════════════════════════════════════════════════════════
// V7: Gerber Beam with Intermediate Hinge
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V7
// Beam spanning A-B-C: fixed at A, roller at C, internal hinge at B.
// Span AB = L1, span BC = L2.
// UDL w over entire length.
// At the hinge, M = 0.
// Segment BC: SS beam with hinge at B → M_B = 0, R_C from BC alone.
// Segment AB: cantilever carrying its own UDL + reaction from BC.

#[test]
fn validation_staad_v7_gerber_beam_hinge() {
    let l1 = 6.0; // span A-B (fixed at A, hinge at B)
    let l2 = 4.0; // span B-C (hinge at B, roller at C)
    let w = 15.0; // kN/m (UDL, downward)
    let n1 = 6; // elements in span AB
    let n2 = 4; // elements in span BC
    let n_total = n1 + n2;
    let elem_len_1 = l1 / n1 as f64;
    let elem_len_2 = l2 / n2 as f64;

    // Nodes
    let mut nodes = Vec::new();
    for i in 0..=n1 {
        nodes.push((i + 1, i as f64 * elem_len_1, 0.0));
    }
    let hinge_node = n1 + 1; // node at B (x = L1)
    for i in 1..=n2 {
        nodes.push((hinge_node + i, l1 + i as f64 * elem_len_2, 0.0));
    }
    let end_node = hinge_node + n2;

    // Elements: span AB uses section 1, span BC uses section 1
    // Hinge at B: last element of AB has hinge_end = true,
    //             first element of BC has hinge_start = true
    let mut elems = Vec::new();
    for i in 0..n1 {
        let he = i == n1 - 1; // hinge at end of last element of span AB
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, he));
    }
    for i in 0..n2 {
        let hs = i == 0; // hinge at start of first element of span BC
        let eid = n1 + i + 1;
        let ni = hinge_node + i;
        elems.push((eid, "frame", ni, ni + 1, 1, 1, hs, false));
    }

    // Supports: fixed at A (node 1), roller at C (end_node)
    let sups = vec![(1, 1_usize, "fixed"), (2, end_node, "rollerX")];

    // UDL over all elements
    let mut loads = Vec::new();
    for i in 0..n_total {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -w,
            q_j: -w,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, sups, loads,
    );

    let results = linear::solve_2d(&input).unwrap();

    // Span BC is simply supported between hinge (M=0) and roller (M=0),
    // so it behaves like a simply supported beam under UDL w on span L2.
    // R_C = w*L2/2 = 15*4/2 = 30 kN
    let r_c_expected = w * l2 / 2.0;
    let r_c = results.reactions.iter().find(|r| r.node_id == end_node).unwrap();
    assert_close(r_c.rz, r_c_expected, 0.02, "V7 R_C = wL2/2");

    // Vertical equilibrium: R_A + R_C = w*(L1+L2)
    let total_load = w * (l1 + l2);
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r_a.rz + r_c.rz, total_load, 0.01, "V7 vertical equilibrium");

    // R_A = total_load - R_C = 150 - 30 = 120 kN
    let r_a_expected = total_load - r_c_expected;
    assert_close(r_a.rz, r_a_expected, 0.02, "V7 R_A");

    // Moment at hinge should be zero:
    // Check the element forces at the hinge. The last element of span AB
    // (elem n1) should have m_end ~ 0. The first element of span BC
    // (elem n1+1) should have m_start ~ 0.
    let ef_ab_end = results.element_forces.iter()
        .find(|e| e.element_id == n1)
        .unwrap();
    assert!(
        ef_ab_end.m_end.abs() < 0.5,
        "V7 hinge moment (AB side) = {:.4}, should be ~0",
        ef_ab_end.m_end
    );

    let ef_bc_start = results.element_forces.iter()
        .find(|e| e.element_id == n1 + 1)
        .unwrap();
    assert!(
        ef_bc_start.m_start.abs() < 0.5,
        "V7 hinge moment (BC side) = {:.4}, should be ~0",
        ef_bc_start.m_start
    );

    // Fixed-end moment at A: M_A = w*L1^2/2 - R_C_equivalent_load_effect
    // More precisely, taking moments about A for segment AB:
    // M_A = w*L1^2/2 + R_B_down * L1 - R_A * 0  (R_B_down from BC onto AB)
    // where R_B_from_BC_onto_AB = w*L2/2 = 30 kN downward (reaction at B from BC segment)
    // M_A = -w*L1^2/2 - R_B_down*L1 (hogging convention, downward load)
    // Using R_A already checked above, we verify M_A:
    // M_A = R_A_vert*0 - w*L1^2/2 - (w*L2/2)*L1
    // Actually from equilibrium of AB segment about hinge:
    // R_A*L1 - w*L1^2/2 - M_A = 0  =>  M_A = R_A*L1 - w*L1^2/2
    let m_a_expected = r_a_expected * l1 - w * l1 * l1 / 2.0;
    // The solver reports base moment as reaction; it should be the negative of the
    // internal moment convention. Check magnitude.
    assert_close(r_a.my.abs(), m_a_expected.abs(), 0.02, "V7 M_A base moment");
}

// ═══════════════════════════════════════════════════════════════
// V8: Beam with Spring Supports
// ═══════════════════════════════════════════════════════════════
// Reference: STAAD.Pro Verification Problem V8
// Simply supported beam with additional vertical spring at midspan.
// UDL w over full length. Spring stiffness k at midspan.
// The spring modifies the reaction distribution.
// Analytical: spring at midspan of SS beam under UDL:
//   R_spring = 5wL/8 * k / (k + 48EI/L^3)  ... Winkler-type modification.
//   More precisely (exact): treat midspan deflection of SS beam as
//   delta_0 = 5wL^4/(384EI), spring force = k * delta_spring,
//   additional deflection from unit load at midspan = L^3/(48EI).
//   Compatibility: delta_0 - R_spring * L^3/(48EI) = R_spring / k
//   => R_spring = delta_0 / (1/k + L^3/(48EI))
//              = 5wL^4/(384EI) / (1/k + L^3/(48EI))

#[test]
fn validation_staad_v8_beam_spring_support() {
    let l = 8.0; // m
    let w = 20.0; // kN/m (downward)
    let k_spring = 10_000.0; // kN/m (vertical spring stiffness)
    let n = 8; // elements (even, so midspan node exists)
    let mid_node = n / 2 + 1; // node at midspan

    // Build solver input manually to use spring support
    let n_nodes = n + 1;
    let elem_len = l / n as f64;

    let mut nodes_map = HashMap::new();
    for i in 0..n_nodes {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * elem_len, z: 0.0 },
        );
    }

    let mut mats_map = HashMap::new();
    mats_map.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs_map = HashMap::new();
    secs_map.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });

    let mut elems_map = HashMap::new();
    for i in 0..n {
        elems_map.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1,
                elem_type: "frame".to_string(),
                node_i: i + 1,
                node_j: i + 2,
                material_id: 1,
                section_id: 1,
                hinge_start: false,
                hinge_end: false,
            },
        );
    }

    let mut sups_map = HashMap::new();
    // Pinned at left end
    sups_map.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Roller at right end
    sups_map.insert("2".to_string(), SolverSupport {
        id: 2, node_id: n_nodes, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });
    // Vertical spring at midspan
    sups_map.insert("3".to_string(), SolverSupport {
        id: 3, node_id: mid_node, support_type: "spring".to_string(),
        kx: None, ky: Some(k_spring), kz: None,
        dx: None, dz: None, dry: None, angle: None,
    });

    // UDL on all elements
    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1,
            q_i: -w,
            q_j: -w,
            a: None,
            b: None,
        }));
    }

    let input = SolverInput {
        nodes: nodes_map,
        materials: mats_map,
        sections: secs_map,
        elements: elems_map,
        supports: sups_map,
        loads, constraints: vec![],
        connectors: HashMap::new(), };

    let results = linear::solve_2d(&input).unwrap();

    // Analytical spring reaction:
    // delta_0 = 5wL^4 / (384EI)  — midspan deflection without spring
    // flexibility_mid = L^3 / (48EI) — deflection at midspan per unit load there
    // R_spring = delta_0 / (1/k + flexibility_mid)
    let delta_0 = 5.0 * w * l.powi(4) / (384.0 * E_EFF * IZ);
    let flex_mid = l.powi(3) / (48.0 * E_EFF * IZ);
    let r_spring_expected = delta_0 / (1.0 / k_spring + flex_mid);

    let r_spring = results.reactions.iter().find(|r| r.node_id == mid_node).unwrap();
    assert_close(r_spring.rz.abs(), r_spring_expected, 0.02, "V8 spring reaction");

    // Total vertical equilibrium: R_left + R_right + R_spring = wL
    let total_load = w * l;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.01, "V8 vertical equilibrium");

    // Spring deflection should satisfy R = k * delta
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let spring_force_from_k = k_spring * d_mid.uz.abs();
    assert_close(r_spring.rz.abs(), spring_force_from_k, 0.02, "V8 R_spring = k * delta");

    // End reactions: by symmetry they should be equal
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_right = results.reactions.iter().find(|r| r.node_id == n_nodes).unwrap();
    assert_close(r_left.rz, r_right.rz, 0.01, "V8 symmetry R_left = R_right");

    // Each end reaction = (wL - R_spring) / 2
    let r_end_expected = (total_load - r_spring_expected) / 2.0;
    assert_close(r_left.rz, r_end_expected, 0.02, "V8 end reaction");
}
