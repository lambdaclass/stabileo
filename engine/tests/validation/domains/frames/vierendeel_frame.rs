/// Validation: Vierendeel (open-web) Frame Behavior
///
/// References:
///   - Vierendeel, A., "Études de résistance des matériaux et des constructions" (1902)
///   - Norris, C.H. & Wilbur, J.B., "Elementary Structural Analysis", 4th Ed., Ch. 11
///   - Coates, R.C., Coutie, M.G. & Kong, F.K., "Structural Analysis", 3rd Ed., Ch. 5
///   - Leet, K., Uang, C.-M. & Gilbert, A., "Fundamentals of Structural Analysis",
///     5th Ed., §11.1 (rigid frames without diagonals)
///
/// Vierendeel frames are rigid-jointed rectangular frameworks without diagonal
/// bracing. They carry loads through bending of the chord and post members
/// (frame action) rather than axial truss action. Key characteristics:
///   - All connections are moment-rigid
///   - Chords and posts develop double curvature (contraflexure) under lateral load
///   - Much more flexible than equivalent braced (truss) frames under lateral load
///   - Under vertical gravity load they behave as an indeterminate frame
///
/// Tests verify:
///   1. Bending-dominated behavior: no diagonals means shear carried by frame action
///   2. Vierendeel panel shear distribution across the height
///   3. Vierendeel vs braced frame stiffness comparison under lateral load
///   4. Moment at chord-to-vertical-post junction
///   5. Multi-panel Vierendeel under uniform distributed load
///   6. Vierendeel deflection larger than equivalent truss under lateral load
///   7. Global equilibrium of Vierendeel frame
///   8. Vierendeel symmetry under symmetric vertical load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a Vierendeel frame with `n_panels` panels.
///
/// Node numbering:
///   Bottom chord: 1 .. n_panels+1  (left to right, y=0)
///   Top chord:    n_panels+2 .. 2*(n_panels+1)  (left to right, y=h)
///
/// Element numbering:
///   Bottom chord elements: 1 .. n_panels
///   Top chord elements:    n_panels+1 .. 2*n_panels
///   Vertical posts:        2*n_panels+1 .. 2*n_panels+n_panels+1
///
/// Supports: pinned at bottom-left (node 1), rollerX at bottom-right (node n_panels+1).
fn make_vierendeel(
    n_panels: usize,
    panel_width: f64,
    panel_height: f64,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let n_bottom = n_panels + 1;

    let mut nodes = Vec::new();
    for i in 0..n_bottom {
        nodes.push((i + 1, i as f64 * panel_width, 0.0));
    }
    for i in 0..n_bottom {
        nodes.push((n_bottom + i + 1, i as f64 * panel_width, panel_height));
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    for i in 0..n_panels {
        elems.push((eid, "frame", n_bottom + i + 1, n_bottom + i + 2, 1, 1, false, false));
        eid += 1;
    }
    for i in 0..n_bottom {
        elems.push((eid, "frame", i + 1, n_bottom + i + 1, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![
        (1, 1, "pinned"),
        (2, n_bottom, "rollerX"),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

// ================================================================
// 1. Bending-Dominated Behavior: Frame Action Carries Shear
// ================================================================
//
// A Vierendeel frame under lateral load carries horizontal shear
// through bending of vertical posts and chords (frame action).
// Each post develops end moments. The mid-height moment in each
// post ≈ 0 (contraflexure point). Both post end-moments should
// be non-zero and approximately equal in magnitude.
//
// Reference: Norris & Wilbur §11.2 — "Vierendeel truss: posts in
// double curvature, moments at top = moments at bottom".

#[test]
fn validation_vierendeel_frame_bending_dominated() {
    let w = 5.0;
    let h = 4.0;
    let f = 10.0;

    // 2-panel: Bottom 1,2,3; Top 4,5,6
    // Lateral load at top-left node (node 4)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input = make_vierendeel(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Elements: bottom chord 1(1-2), 2(2-3); top chord 3(4-5), 4(5-6);
    // posts 5(1-4), 6(2-5), 7(3-6)
    // Left post is element 5 (connects node 1 bottom to node 4 top).
    // Under lateral load, the left post carries the most shear.
    // Both end-moments must be non-zero (bending-dominated frame action).
    let left_post = results.element_forces.iter()
        .find(|ef| ef.element_id == 5).unwrap();

    assert!(
        left_post.m_start.abs() > 0.1,
        "Vierendeel bending: left post m_start={:.6e} must be non-zero",
        left_post.m_start
    );
    assert!(
        left_post.m_end.abs() > 0.1,
        "Vierendeel bending: left post m_end={:.6e} must be non-zero",
        left_post.m_end
    );

    // The shear in the post = (m_start + m_end) / h  (for double curvature)
    // Post shear force should be non-zero
    let post_shear = left_post.v_start.abs();
    assert!(
        post_shear > 0.01,
        "Vierendeel: post must carry transverse shear: {:.6e}", post_shear
    );
}

// ================================================================
// 2. Panel Shear Distribution Across Height
// ================================================================
//
// Under a horizontal force F applied at the top chord, the total
// shear across any vertical cross-section of the Vierendeel equals F.
// The shear is carried exclusively through the vertical posts (no diagonals).
// For a single-panel frame, the one post must carry all the shear.
//
// Reference: Leet §11.1 — "Without diagonals, verticals carry panel shear".

#[test]
fn validation_vierendeel_frame_panel_shear() {
    let w = 6.0;
    let h = 4.0;
    let f = 15.0;

    // Single-panel: Bottom 1,2; Top 3,4
    // Elements: bottom chord 1(1-2), top chord 2(3-4),
    //           left post 3(1-3), right post 4(2-4)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input = make_vierendeel(1, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both posts carry shear; total shear = F (global equilibrium of right half)
    // Left post (elem 3) and right post (elem 4) shear forces
    let post_left = results.element_forces.iter()
        .find(|ef| ef.element_id == 3).unwrap();
    let post_right = results.element_forces.iter()
        .find(|ef| ef.element_id == 4).unwrap();

    // The shear force in the posts (transverse to member axis = along X for vertical posts)
    // For vertical members, v_start is the shear (horizontal for vertical post)
    let shear_sum = post_left.v_start.abs() + post_right.v_start.abs();

    // Sum of post shear forces must equal applied lateral force
    assert!(
        (shear_sum - f).abs() < f * 0.05,
        "Panel shear: sum of post shears={:.4}, expected F={:.4}", shear_sum, f
    );

    // Global equilibrium: ΣRx = -F
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Panel shear: global ΣRx = -F");
}

// ================================================================
// 3. Vierendeel vs Braced Frame Stiffness Comparison
// ================================================================
//
// A Vierendeel frame is much more flexible than an equivalent frame
// braced with a diagonal. Adding a single diagonal converts the frame
// to truss action, dramatically increasing stiffness.
// The Vierendeel lateral deflection >> Braced frame lateral deflection.
//
// Reference: Coates, Coutie & Kong §5.4 — "The Vierendeel girder is
// significantly more flexible than a conventional truss."

#[test]
fn validation_vierendeel_frame_vs_braced() {
    let w = 5.0;
    let h = 4.0;
    let f = 10.0;

    // Vierendeel: no diagonal
    let loads_v = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input_v = make_vierendeel(1, w, h, loads_v);
    let d_vierendeel = linear::solve_2d(&input_v).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 3).unwrap()
        .ux.abs();

    // Braced frame: add diagonal (truss element) from node 1 to node 4
    // Nodes: 1(0,0), 2(w,0), 3(0,h), 4(w,h)
    let nodes = vec![(1, 0.0, 0.0), (2, w, 0.0), (3, 0.0, h), (4, w, h)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // bottom chord
        (2, "frame", 3, 4, 1, 1, false, false), // top chord
        (3, "frame", 1, 3, 1, 1, false, false), // left post
        (4, "frame", 2, 4, 1, 1, false, false), // right post
        (5, "truss",  1, 4, 1, 1, false, false), // diagonal brace
    ];
    let sups_b = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fy: 0.0, mz: 0.0,
    })];
    let input_b = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems, sups_b, loads_b,
    );
    let d_braced = linear::solve_2d(&input_b).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 3).unwrap()
        .ux.abs();

    // Vierendeel must be significantly more flexible
    assert!(
        d_vierendeel > d_braced * 2.0,
        "Vierendeel >> braced: {:.6e} vs {:.6e}", d_vierendeel, d_braced
    );
}

// ================================================================
// 4. Moment at Chord-to-Post Junction
// ================================================================
//
// At each rigid junction of a Vierendeel frame, moment equilibrium
// must be satisfied: the sum of moments from all members meeting at
// the joint equals any applied external moment (zero for internal joints).
//
// For a single-panel Vierendeel under vertical midpoint load, the
// moments at the top corners must be equal and opposite by symmetry.
//
// Reference: Norris & Wilbur §11.3.

#[test]
fn validation_vierendeel_frame_junction_moment() {
    let w = 6.0;
    let h = 4.0;
    let p = 20.0;

    // Single-panel Vierendeel with central vertical load
    // Nodes: 1(0,0), 2(w,0), 3(0,h), 4(w,h)
    // Load at node 3 (top-left)? No — put it at midspan of top chord.
    // Since single panel, add a mid-node on the top chord.
    // Use 2-panel instead: Bottom 1,2,3; Top 4,5,6
    // Load at node 5 (top mid-node)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_vierendeel(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry, moments at left and right top corners (nodes 4 and 6)
    // should be equal in magnitude.
    // Element forces at top-chord elements (elem 3: node 4→5, elem 4: node 5→6)
    let ef3 = results.element_forces.iter().find(|ef| ef.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();

    // m_start of elem 3 (at node 4) and m_end of elem 4 (at node 6) must be equal in magnitude
    assert!(
        (ef3.m_start.abs() - ef4.m_end.abs()).abs() < ef3.m_start.abs() * 0.05 + 1e-6,
        "Junction moment symmetry: M_left={:.6e}, M_right={:.6e}",
        ef3.m_start.abs(), ef4.m_end.abs()
    );

    // Both junction moments must be non-zero
    assert!(
        ef3.m_start.abs() > 0.01,
        "Junction moment non-zero: {:.6e}", ef3.m_start
    );
}

// ================================================================
// 5. Multi-Panel Vierendeel Under UDL
// ================================================================
//
// A Vierendeel frame with multiple panels under uniform vertical load
// (simulated as nodal loads at top chord nodes) must satisfy:
//   - ΣRy = total applied vertical load
//   - End reactions equal by symmetry for symmetric frame + load
//
// Reference: Leet §11.2.

#[test]
fn validation_vierendeel_frame_multi_panel_udl() {
    let w = 4.0;
    let h = 3.0;
    let p_node = 5.0; // kN per top-chord node

    // 4-panel Vierendeel: Bottom 1..5, Top 6..10
    // Apply equal vertical loads at all top-chord nodes
    let n_panels = 4;
    let n_bottom = n_panels + 1;
    let n_top = n_panels + 1;

    let mut loads = Vec::new();
    for i in 0..n_top {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_bottom + i + 1,
            fx: 0.0,
            fy: -p_node,
            mz: 0.0,
        }));
    }

    let input = make_vierendeel(n_panels, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = p_node * n_top as f64;

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02, "Multi-panel UDL: ΣRy = total load");

    // By symmetry, left and right reactions equal
    let r_left = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let r_right = results.reactions.iter()
        .find(|r| r.node_id == n_bottom).unwrap().ry;
    assert_close(r_left, r_right, 0.02, "Multi-panel UDL: symmetry R_left = R_right");

    // Each end reaction = total/2
    assert_close(r_left, total_load / 2.0, 0.02, "Multi-panel UDL: R_end = P_total/2");
}

// ================================================================
// 6. Vierendeel Deflection Larger Than Equivalent Truss
// ================================================================
//
// Under a vertical midspan load, a Vierendeel frame deflects more
// than a truss (with diagonals) of the same overall depth and chord
// properties. The Vierendeel relies on bending stiffness alone,
// whereas the truss exploits direct axial action in diagonals.
//
// Reference: Coates, Coutie & Kong §5.5.

#[test]
fn validation_vierendeel_frame_deflection_vs_truss() {
    let w = 4.0;
    let h = 3.0;
    let p = 20.0;
    let n_panels = 3;
    let n_bottom = n_panels + 1;

    // Midspan node on top chord (for n_panels=3 even: no exact mid, use node 7 = top node 2)
    // Top nodes are n_bottom+1 .. n_bottom+n_panels+1 = 5..8
    // Apply load at top-mid node (node 6 = second top node)
    let top_mid = n_bottom + 2; // node 6
    let loads_v = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: top_mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_v = make_vierendeel(n_panels, w, h, loads_v);
    let d_vierendeel = linear::solve_2d(&input_v).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == top_mid).unwrap()
        .uy.abs();

    // Truss: same geometry with diagonal in each panel
    // Nodes: bottom 1..4 (y=0), top 5..8 (y=h)
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * w, 0.0));
    }
    for i in 0..=n_panels {
        nodes.push((n_bottom + i + 1, i as f64 * w, h));
    }
    let mut elems = Vec::new();
    let mut eid = 1;
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    for i in 0..n_panels {
        elems.push((eid, "frame", n_bottom + i + 1, n_bottom + i + 2, 1, 1, false, false));
        eid += 1;
    }
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, n_bottom + i + 1, 1, 1, false, false));
        eid += 1;
    }
    // Add diagonals (truss elements)
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, n_bottom + i + 2, 1, 1, false, false));
        eid += 1;
    }
    let sups_t = vec![(1, 1, "pinned"), (2, n_bottom, "rollerX")];
    let loads_t = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: top_mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_t = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups_t, loads_t);
    let d_truss = linear::solve_2d(&input_t).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == top_mid).unwrap()
        .uy.abs();

    assert!(
        d_vierendeel > d_truss,
        "Vierendeel > truss deflection: {:.6e} vs {:.6e}", d_vierendeel, d_truss
    );
}

// ================================================================
// 7. Global Equilibrium of Vierendeel Frame
// ================================================================
//
// For any loading condition, the sum of reactions must balance
// the applied loads: ΣRx = -ΣFx, ΣRy = -ΣFy.
//
// Reference: Any structural analysis text — static equilibrium.

#[test]
fn validation_vierendeel_frame_global_equilibrium() {
    let w = 5.0;
    let h = 3.5;
    let fx = 8.0;
    let fy = -12.0;

    // 3-panel Vierendeel: Bottom 1..4; Top 5..8
    // Combined horizontal + vertical loading
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx, fy: 0.0, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fy, mz: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 7, fx: 0.0, fy, mz: 0.0,
        }),
    ];
    let input = make_vierendeel(3, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    assert_close(sum_rx, -fx, 0.02, "Global equilibrium: ΣRx = -ΣFx");
    assert_close(sum_ry, -2.0 * fy, 0.02, "Global equilibrium: ΣRy = -ΣFy");
}

// ================================================================
// 8. Vierendeel Symmetry Under Symmetric Vertical Load
// ================================================================
//
// A symmetric Vierendeel frame (equal panel widths, equal member
// properties) under a symmetric vertical load must produce:
//   - Equal end reactions at left and right supports
//   - Symmetric deflection pattern (δ_left_top = δ_right_top)
//   - Zero horizontal reactions (no lateral force applied)
//
// Reference: Norris & Wilbur §11.1 — symmetry conditions.

#[test]
fn validation_vierendeel_frame_symmetry() {
    let w = 5.0;
    let h = 3.0;
    let p = 10.0;

    // 4-panel Vierendeel: Bottom 1..5; Top 6..10
    // Symmetric load: equal point loads at all top-chord nodes
    let n_panels = 4;
    let n_bottom = n_panels + 1;
    let n_top = n_panels + 1;

    let mut loads = Vec::new();
    for i in 0..n_top {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_bottom + i + 1,
            fx: 0.0,
            fy: -p,
            mz: 0.0,
        }));
    }

    let input = make_vierendeel(n_panels, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // End reactions must be equal
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == n_bottom).unwrap();
    assert_close(r_a.ry, r_e.ry, 0.02, "Symmetry: R_A = R_E");

    // No net horizontal reaction (no horizontal load applied)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 1e-4,
        "Symmetry: ΣRx ≈ 0 for pure vertical load: {:.6e}", sum_rx
    );

    // Vertical deflections of symmetric top-chord nodes equal
    let d_top_left = results.displacements.iter()
        .find(|d| d.node_id == n_bottom + 1).unwrap().uy;
    let d_top_right = results.displacements.iter()
        .find(|d| d.node_id == n_bottom + n_top).unwrap().uy;
    assert_close(d_top_left, d_top_right, 0.02, "Symmetry: δ_top_left = δ_top_right");
}
