/// Validation: Extended Vierendeel Frame Behavior
///
/// References:
///   - Vierendeel, A., "Études de résistance des matériaux et des constructions" (1902)
///   - Norris, C.H. & Wilbur, J.B., "Elementary Structural Analysis", 4th Ed., Ch. 11
///   - Coates, R.C., Coutie, M.G. & Kong, F.K., "Structural Analysis", 3rd Ed., Ch. 5
///   - Leet, K., Uang, C.-M. & Gilbert, A., "Fundamentals of Structural Analysis",
///     5th Ed., §11.1 (rigid frames without diagonals)
///   - Ghali, A. & Neville, A.M., "Structural Analysis", 7th Ed., Ch. 8
///
/// Extended tests cover:
///   1. Antisymmetric load produces antisymmetric response
///   2. Double-height panel increases lateral flexibility
///   3. Moment equilibrium at interior joints
///   4. Post contraflexure (inflection point near mid-height)
///   5. Increasing panels reduces midspan deflection under gravity
///   6. Fixed-base Vierendeel is stiffer than pinned-base
///   7. Asymmetric single load produces unequal post shears
///   8. Chord axial force distribution under lateral load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Build a Vierendeel frame with `n_panels` panels (same layout as base file).
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

/// Build a Vierendeel frame with fixed supports at both base nodes.
fn make_vierendeel_fixed(
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
        (1, 1, "fixed"),
        (2, n_bottom, "fixed"),
    ];

    make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads)
}

// ================================================================
// 1. Antisymmetric Load Produces Antisymmetric Response
// ================================================================
//
// A symmetric 2-panel Vierendeel frame loaded with equal and opposite
// vertical forces at the two top corner nodes (antisymmetric load)
// must produce:
//   - Equal magnitude but opposite sign vertical reactions
//   - The midspan top node (node 5) has zero vertical deflection
//   - The midspan post carries zero axial force
//
// Reference: Ghali & Neville §8.3 — antisymmetric decomposition.

#[test]
fn validation_vierendeel_ext_antisymmetric_load() {
    let w = 5.0;
    let h = 4.0;
    let p = 10.0;

    // 2-panel: Bottom 1,2,3; Top 4,5,6
    // Antisymmetric: +P at node 4 (top-left), -P at node 6 (top-right)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fz: -p, my: 0.0,
        }),
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fz: p, my: 0.0,
        }),
    ];
    let input = make_vierendeel(2, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: net applied force = 0, so sum_ry = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 1e-4,
        "Antisymmetric: net vertical reaction should be ~0, got {:.6e}", sum_ry
    );

    // The left and right reactions should be equal in magnitude but opposite in sign
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap().rz;
    assert_close(r_left, -r_right, 0.02, "Antisymmetric: R_left = -R_right");

    // Midspan top node (node 5) should have ~zero vertical deflection by antisymmetry
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().uz;
    assert!(
        d_mid.abs() < 1e-6,
        "Antisymmetric: midspan uy should be ~0, got {:.6e}", d_mid
    );
}

// ================================================================
// 2. Double-Height Panel Increases Lateral Flexibility
// ================================================================
//
// Doubling the panel height of a single-panel Vierendeel frame
// dramatically increases lateral flexibility because the posts are
// longer and bend more. The lateral stiffness of a post in double
// curvature scales as 12EI/h^3, so doubling h reduces stiffness 8x.
//
// Reference: Norris & Wilbur §11.2 — post stiffness inversely
// proportional to cube of height.

#[test]
fn validation_vierendeel_ext_double_height_flexibility() {
    let w = 6.0;
    let h1 = 3.0;
    let h2 = 6.0; // double height
    let f = 10.0;

    // Single-panel frame at height h1
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input1 = make_vierendeel(1, w, h1, loads1);
    let d1: f64 = linear::solve_2d(&input1).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 3).unwrap()
        .ux.abs();

    // Single-panel frame at height h2
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input2 = make_vierendeel(1, w, h2, loads2);
    let d2: f64 = linear::solve_2d(&input2).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 3).unwrap()
        .ux.abs();

    // Taller frame must be significantly more flexible laterally
    // Post stiffness ~ 1/h^3 so ratio ~ (h2/h1)^3 = 8 for the post contribution
    // Due to chord bending contributions the total ratio is less than 8 but still > 2
    assert!(
        d2 > d1 * 2.0,
        "Double height: d2={:.6e} should be > 2*d1={:.6e}", d2, 2.0 * d1
    );
}

// ================================================================
// 3. Moment Equilibrium at Interior Joint
// ================================================================
//
// At an interior joint of a Vierendeel frame (where a chord member
// and a vertical post meet, but no external moment is applied),
// the sum of member-end moments meeting at that joint must be zero.
//
// For a 3-panel frame under a lateral load at the top-left, check
// moment equilibrium at an interior top-chord joint (node where
// top chord spans and a post meet).
//
// Reference: Leet §11.1 — joint equilibrium in rigid frames.

#[test]
fn validation_vierendeel_ext_interior_joint_moment_equilibrium() {
    let w = 5.0;
    let h = 4.0;
    let f = 12.0;

    // 3-panel: Bottom 1,2,3,4; Top 5,6,7,8
    // Elements: bottom chord 1(1-2), 2(2-3), 3(3-4);
    //           top chord 4(5-6), 5(6-7), 6(7-8);
    //           posts 7(1-5), 8(2-6), 9(3-7), 10(4-8)
    // Lateral load at top-left (node 5)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: f, fz: 0.0, my: 0.0,
    })];
    let input = make_vierendeel(3, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check moment equilibrium at interior top joint node 6
    // Members meeting at node 6:
    //   - Top chord elem 4 (5->6): contributes m_end at node 6
    //   - Top chord elem 5 (6->7): contributes m_start at node 6
    //   - Post elem 8 (2->6): contributes m_end at node 6
    let ef4 = results.element_forces.iter().find(|ef| ef.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|ef| ef.element_id == 5).unwrap();
    let ef8 = results.element_forces.iter().find(|ef| ef.element_id == 8).unwrap();

    // Sum of moments at node 6 must be zero (no external moment applied).
    // Sign convention for joint equilibrium: the internal element-end moment
    // is the moment the element exerts on itself. The moment the element
    // exerts on the joint (external action) has the opposite sign at the
    // j-end (m_end is negated) while at the i-end (m_start) it keeps its sign.
    //   - elem 4 (5->6): node 6 is j-end, contribution = -m_end
    //   - elem 5 (6->7): node 6 is i-end, contribution = +m_start
    //   - elem 8 (2->6): node 6 is j-end, contribution = -m_end
    let m_sum = -ef4.m_end + ef5.m_start - ef8.m_end;
    assert!(
        m_sum.abs() < 0.1,
        "Interior joint moment equilibrium at node 6: sum={:.6e}", m_sum
    );
}

// ================================================================
// 4. Post Contraflexure (Inflection Point Near Mid-Height)
// ================================================================
//
// Under lateral load, vertical posts of a Vierendeel frame develop
// double curvature — moments at top and bottom ends are of opposite
// sign. This means there is a point of contraflexure (zero moment)
// somewhere along the post height.
//
// For a symmetric single-panel frame under lateral load, the
// end moments of each post should be of opposite sign.
//
// Reference: Coates, Coutie & Kong §5.4 — "posts in double curvature".

#[test]
fn validation_vierendeel_ext_post_contraflexure() {
    let w = 6.0;
    let h = 4.0;
    let f = 20.0;

    // Single-panel: Bottom 1,2; Top 3,4
    // Elements: bottom chord 1(1-2), top chord 2(3-4),
    //           left post 3(1-3), right post 4(2-4)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input = make_vierendeel(1, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left post (elem 3, nodes 1->3)
    let left_post = results.element_forces.iter()
        .find(|ef| ef.element_id == 3).unwrap();

    // Right post (elem 4, nodes 2->4)
    let right_post = results.element_forces.iter()
        .find(|ef| ef.element_id == 4).unwrap();

    // For double curvature, m_start and m_end should have opposite signs
    // (sign convention: if both are positive or negative, it is single curvature)
    // The product m_start * m_end < 0 indicates double curvature (opposite signs)
    let left_product = left_post.m_start * left_post.m_end;
    assert!(
        left_product < 0.0,
        "Left post contraflexure: m_start={:.4} * m_end={:.4} = {:.4} should be < 0",
        left_post.m_start, left_post.m_end, left_product
    );

    let right_product = right_post.m_start * right_post.m_end;
    assert!(
        right_product < 0.0,
        "Right post contraflexure: m_start={:.4} * m_end={:.4} = {:.4} should be < 0",
        right_post.m_start, right_post.m_end, right_product
    );
}

// ================================================================
// 5. Increasing Panels Reduces Midspan Deflection Under Gravity
// ================================================================
//
// For a Vierendeel frame under uniform gravity load on the top chord,
// increasing the number of panels (while keeping the same total span)
// reduces the midspan deflection because the individual panel spans
// decrease and the structure becomes more redundant.
//
// Reference: Leet §11.2 — multi-panel Vierendeel behavior.

#[test]
fn validation_vierendeel_ext_more_panels_stiffer() {
    let total_span = 20.0;
    let h = 3.0;
    let p = 10.0; // load per top-chord node

    // 2-panel Vierendeel (panel_width = 10.0)
    let n2 = 2;
    let w2 = total_span / n2 as f64;
    let n_bottom_2 = n2 + 1;
    let mut loads_2 = Vec::new();
    for i in 0..(n2 + 1) {
        loads_2.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_bottom_2 + i + 1,
            fx: 0.0, fz: -p, my: 0.0,
        }));
    }
    let input_2 = make_vierendeel(n2, w2, h, loads_2);
    // Midspan top node for 2-panel: node n_bottom_2 + 2 (second top node = middle)
    let mid_node_2 = n_bottom_2 + 2;
    let d2: f64 = linear::solve_2d(&input_2).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == mid_node_2).unwrap()
        .uz.abs();

    // 4-panel Vierendeel (panel_width = 5.0)
    let n4 = 4;
    let w4 = total_span / n4 as f64;
    let n_bottom_4 = n4 + 1;
    let mut loads_4 = Vec::new();
    for i in 0..(n4 + 1) {
        loads_4.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_bottom_4 + i + 1,
            fx: 0.0, fz: -p, my: 0.0,
        }));
    }
    let input_4 = make_vierendeel(n4, w4, h, loads_4);
    // Midspan top node for 4-panel: node n_bottom_4 + 3 (third top node = middle)
    let mid_node_4 = n_bottom_4 + 3;
    let d4: f64 = linear::solve_2d(&input_4).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == mid_node_4).unwrap()
        .uz.abs();

    // 4-panel frame should be stiffer (less deflection) than 2-panel
    assert!(
        d4 < d2,
        "More panels stiffer: d4={:.6e} should be < d2={:.6e}", d4, d2
    );
}

// ================================================================
// 6. Fixed-Base Vierendeel Is Stiffer Than Pinned-Base
// ================================================================
//
// A Vierendeel frame with fixed supports at both base nodes is
// stiffer under lateral load than the same frame with pinned
// supports. Fixed supports prevent rotation, adding restraint
// that reduces lateral drift.
//
// Reference: Norris & Wilbur §11.5 — effect of support conditions.

#[test]
fn validation_vierendeel_ext_fixed_vs_pinned_base() {
    let w = 5.0;
    let h = 4.0;
    let f = 15.0;

    // Pinned-base: standard make_vierendeel (pinned + rollerX)
    // 2-panel: Bottom 1,2,3; Top 4,5,6
    let loads_p = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: f, fz: 0.0, my: 0.0,
    })];
    let input_pinned = make_vierendeel(2, w, h, loads_p);
    let d_pinned: f64 = linear::solve_2d(&input_pinned).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 4).unwrap()
        .ux.abs();

    // Fixed-base: both base supports are fixed
    let loads_f = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: f, fz: 0.0, my: 0.0,
    })];
    let input_fixed = make_vierendeel_fixed(2, w, h, loads_f);
    let d_fixed: f64 = linear::solve_2d(&input_fixed).unwrap()
        .displacements.iter()
        .find(|d| d.node_id == 4).unwrap()
        .ux.abs();

    // Fixed base should produce less lateral drift
    assert!(
        d_fixed < d_pinned,
        "Fixed stiffer: d_fixed={:.6e} should be < d_pinned={:.6e}", d_fixed, d_pinned
    );

    // Verify global equilibrium for fixed-base case
    let results_fixed = linear::solve_2d(&input_fixed).unwrap();
    let sum_rx: f64 = results_fixed.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Fixed base: global horizontal equilibrium");
}

// ================================================================
// 7. Asymmetric Single Load Produces Unequal Post Shears
// ================================================================
//
// A 3-panel Vierendeel frame with a single vertical load at one
// top-chord node (not at the center) produces different shear forces
// in each vertical post. The posts closer to the load carry more shear.
//
// Additionally, the sum of all post axial forces (which carry the
// vertical shear across the frame) should equal the applied load.
//
// Reference: Coates, Coutie & Kong §5.5.

#[test]
fn validation_vierendeel_ext_asymmetric_load_unequal_shears() {
    let w = 5.0;
    let h = 4.0;
    let p = 20.0;

    // 3-panel: Bottom 1,2,3,4; Top 5,6,7,8
    // Elements: bottom chord 1(1-2), 2(2-3), 3(3-4);
    //           top chord 4(5-6), 5(6-7), 6(7-8);
    //           posts 7(1-5), 8(2-6), 9(3-7), 10(4-8)
    // Asymmetric load: vertical load only at top-left node (node 5)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_vierendeel(3, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Collect post axial forces (n_start for vertical members = axial along post)
    let post_ids = [7, 8, 9, 10];
    let mut post_axials = Vec::new();
    for &pid in &post_ids {
        let ef = results.element_forces.iter()
            .find(|ef| ef.element_id == pid).unwrap();
        post_axials.push(ef.n_start);
    }

    // The leftmost post (closest to load) should carry more axial force
    // than the rightmost post. Since the load is at the left end,
    // post 7 (leftmost) should have a larger absolute axial force than post 10 (rightmost).
    assert!(
        post_axials[0].abs() > post_axials[3].abs(),
        "Asymmetric: left post |N|={:.4} should > right post |N|={:.4}",
        post_axials[0].abs(), post_axials[3].abs()
    );

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Asymmetric load: vertical equilibrium sum_ry = P");
}

// ================================================================
// 8. Chord Axial Force Distribution Under Lateral Load
// ================================================================
//
// Under a lateral (horizontal) load at the top chord, the Vierendeel
// frame develops axial forces in the chords as part of the global
// overturning resistance. The top chord goes into tension or
// compression while the bottom chord takes the opposite. The chord
// axial forces create a couple that resists the overturning moment.
//
// For a single-panel frame with lateral load F at height h:
//   Overturning moment = F * h
//   Chord couple = N_chord * w
//   So N_chord ~ F*h/w (approximate, since posts also carry moment)
//
// Reference: Leet §11.1 — chord forces in Vierendeel frames.

#[test]
fn validation_vierendeel_ext_chord_axial_under_lateral() {
    let w = 6.0;
    let h = 4.0;
    let f = 10.0;

    // Single-panel: Bottom 1,2; Top 3,4
    // Elements: bottom chord 1(1-2), top chord 2(3-4),
    //           left post 3(1-3), right post 4(2-4)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: f, fz: 0.0, my: 0.0,
    })];
    let input = make_vierendeel(1, w, h, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Bottom chord (elem 1, horizontal member connecting nodes 1-2)
    let ef_bot = results.element_forces.iter()
        .find(|ef| ef.element_id == 1).unwrap();
    // Top chord (elem 2, horizontal member connecting nodes 3-4)
    let ef_top = results.element_forces.iter()
        .find(|ef| ef.element_id == 2).unwrap();

    // The chords should have non-zero axial forces
    assert!(
        ef_bot.n_start.abs() > 0.01,
        "Bottom chord must carry axial force: {:.6e}", ef_bot.n_start
    );
    assert!(
        ef_top.n_start.abs() > 0.01,
        "Top chord must carry axial force: {:.6e}", ef_top.n_start
    );

    // Top and bottom chords should have opposite axial force signs
    // (one in tension, one in compression) to form the resisting couple
    let product = ef_bot.n_start * ef_top.n_start;
    assert!(
        product < 0.0,
        "Chords should have opposite axial: bot={:.4}, top={:.4}",
        ef_bot.n_start, ef_top.n_start
    );

    // Global equilibrium check
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -f, 0.02, "Chord axial: global horizontal equilibrium");

    // Rough magnitude check: chord axial ~ F*h/w (approximate due to frame action)
    let approx_n: f64 = f * h / w;
    // The actual chord axial should be on the same order of magnitude
    assert!(
        ef_bot.n_start.abs() < approx_n * 3.0,
        "Bottom chord axial {:.4} should be within order of F*h/w={:.4}",
        ef_bot.n_start.abs(), approx_n
    );
}
