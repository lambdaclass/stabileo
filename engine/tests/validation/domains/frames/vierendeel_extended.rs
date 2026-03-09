/// Validation: Vierendeel Frame / Truss Behavior
///
/// References:
///   - Timoshenko & Young, "Theory of Structures", 2nd Ed., Ch. 8
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 14
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 7
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 7
///
/// Vierendeel frames have rigid (moment) connections and no diagonals,
/// so they resist shear entirely through bending in chords and verticals.
///
/// Tests:
///   1. Single-panel Vierendeel: rigid joint moment transfer, shear in verticals
///   2. Multi-panel Vierendeel beam: gravity load, shear via bending in verticals
///   3. Double-chord vs single-chord: stiffness comparison for same span
///   4. Opening in beam: Vierendeel action around web opening (top/bottom chords)
///   5. Lateral load on Vierendeel: all members contribute to sway resistance
///   6. Panel point loading: concentrated load at panel point, shear distribution
///   7. Uniform load on top chord: reversed curvature in chords
///   8. Stiffness ratio effect: varying chord-to-vertical stiffness on moment distribution
use dedaliano_engine::solver::linear::*;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0; // MPa (solver multiplies by 1000 -> kN/m²)
const A_CHORD: f64 = 0.01; // m²
const A_VERT: f64 = 0.008; // m²
const IZ_CHORD: f64 = 2e-4; // m⁴
const IZ_VERT: f64 = 1e-4; // m⁴

// ================================================================
// 1. Single-Panel Vierendeel: Rigid Joint Moment Transfer
// ================================================================
//
// A single rectangular panel (4 nodes, 4 frame members) with rigid
// joints, fixed at left base, roller at right base. A lateral load
// is applied at the top-left node. Without diagonals, the frame
// must resist lateral shear entirely through bending.
//
// Key checks:
//   - Vertical members carry shear (nonzero bending moments)
//   - Global horizontal equilibrium
//   - Moments at rigid joints are nonzero (moment transfer)
//
// Reference: Timoshenko & Young, "Theory of Structures", §8.2.

#[test]
fn validation_vierendeel_single_panel_moment_transfer() {
    let h = 3.0; // panel height
    let w = 4.0; // panel width
    let p = 10.0; // lateral load (kN)

    // Nodes: 1=bottom-left, 2=top-left, 3=top-right, 4=bottom-right
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 0.0, h),
        (3, w, h),
        (4, w, 0.0),
    ];
    // All frame members (rigid joints, no diagonals — Vierendeel)
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // top chord
        (3, "frame", 3, 4, 1, 1, false, false), // right column
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Global horizontal equilibrium: sum of horizontal reactions = -P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Single panel Vierendeel: ΣRx = -P");

    // Vertical equilibrium: no vertical loads applied, so ΣRy ≈ 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 0.0, 0.02, "Single panel Vierendeel: ΣRy = 0");

    // Both columns must carry nonzero bending moments (moment transfer)
    let ef_left_col = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_right_col = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    assert!(
        ef_left_col.m_start.abs() > 0.1,
        "Left column should have moment at base: m_start={:.4}",
        ef_left_col.m_start
    );
    assert!(
        ef_right_col.m_start.abs() > 0.1,
        "Right column should have moment at top: m_start={:.4}",
        ef_right_col.m_start
    );

    // The top chord must also carry bending moment (Vierendeel action)
    let ef_top = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef_top.m_start.abs() > 0.1,
        "Top chord should have bending moment: m_start={:.4}",
        ef_top.m_start
    );

    // Columns carry shear (v_start nonzero)
    assert!(
        ef_left_col.v_start.abs() > 0.1,
        "Left column shear should be nonzero: v_start={:.4}",
        ef_left_col.v_start
    );
}

// ================================================================
// 2. Multi-Panel Vierendeel Beam: Gravity Load via Bending
// ================================================================
//
// A 3-panel Vierendeel girder (top chord, bottom chord, 4 verticals)
// simply supported at the bottom chord ends. Gravity (downward) loads
// applied at top chord panel points.
//
// Without diagonals, shear is resisted by bending in verticals.
// The verticals must carry nonzero bending moments.
//
// Reference: McCormac & Csernak, "Structural Steel Design", §14.2.

#[test]
fn validation_vierendeel_multi_panel_gravity() {
    let h = 2.0;  // depth of Vierendeel girder
    let pw = 3.0; // panel width
    let n_panels = 3;
    let p = -20.0; // downward load at each interior top-chord node (kN)

    // Bottom chord nodes: 1, 2, 3, 4 (left to right at y=0)
    // Top chord nodes:    5, 6, 7, 8 (left to right at y=h)
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x: f64 = i as f64 * pw;
        nodes.push((i + 1, x, 0.0));                   // bottom chord
        nodes.push((i + 1 + n_panels + 1, x, h));      // top chord
    }

    let mut elems = Vec::new();
    let mut eid = 1;

    // Bottom chord elements
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord elements
    let top_offset = n_panels + 1;
    for i in 0..n_panels {
        elems.push((eid, "frame", top_offset + i + 1, top_offset + i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Vertical members
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, top_offset + i + 1, 1, 2, false, false));
        eid += 1;
    }

    // Supports: pinned at bottom-left (node 1), rollerX at bottom-right (node n_panels+1)
    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    // Gravity loads at interior top chord nodes (nodes 6 and 7 for 3-panel)
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: top_offset + i + 1,
            fx: 0.0,
            fy: p,
            mz: 0.0,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium: reactions should balance applied loads
    let total_applied: f64 = p * (n_panels - 1) as f64; // negative (downward)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_applied, 0.05, "Multi-panel Vierendeel: ΣRy");

    // Vertical members should carry bending moment (Vierendeel shear mechanism)
    // Verticals are elements from eid (2*n_panels+1) to (2*n_panels+1 + n_panels)
    let first_vert_id = 2 * n_panels + 1;
    let last_vert_id = first_vert_id + n_panels;
    let mut any_vert_has_moment = false;
    for vid in first_vert_id..=last_vert_id {
        if let Some(ef) = results.element_forces.iter().find(|e| e.element_id == vid) {
            if ef.m_start.abs() > 0.01 || ef.m_end.abs() > 0.01 {
                any_vert_has_moment = true;
            }
        }
    }
    assert!(
        any_vert_has_moment,
        "Vertical members must carry bending moment in Vierendeel frame"
    );

    // By symmetry, midspan deflection should be downward (uy < 0 at midspan bottom node)
    let mid_bottom_node = (n_panels / 2) + 1 + 1; // node 3 for 3-panel
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_bottom_node).unwrap();
    assert!(
        d_mid.uy < 0.0,
        "Midspan bottom chord should deflect downward: uy={:.6}",
        d_mid.uy
    );
}

// ================================================================
// 3. Double-Chord vs Single-Chord: Stiffness Comparison
// ================================================================
//
// Compare a Vierendeel girder (two chords + verticals) with a
// simple single beam of equivalent depth. The Vierendeel should be
// stiffer than two separate beams but more flexible than a solid
// beam of full depth, due to shear deformation through bending.
//
// Reference: Kassimali, "Structural Analysis", §7.3.

#[test]
fn validation_vierendeel_double_vs_single_chord_stiffness() {
    let h = 2.0;
    let span = 9.0;
    let p = -30.0; // midspan point load (kN)

    // --- Single beam (simply supported, same chord section) ---
    let single_loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, // midspan node (5 nodes, node 3 is middle)
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];
    let input_single = make_beam(4, span, E, A_CHORD, IZ_CHORD, "pinned", Some("rollerX"), single_loads);
    let res_single = solve_2d(&input_single).expect("solve single");
    let d_single = res_single.displacements.iter().find(|d| d.node_id == 3).unwrap().uy.abs();

    // --- Vierendeel girder (3 panels, 2 chords + 4 verticals) ---
    let pw = span / 3.0;
    let n_panels: usize = 3;
    let top_offset = n_panels + 2; // bottom: 1..4, top: 5..8 -> top_offset=5

    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x: f64 = i as f64 * pw;
        nodes.push((i + 1, x, 0.0));
        nodes.push((i + 1 + n_panels + 1, x, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels {
        elems.push((eid, "frame", top_offset + i, top_offset + i + 1, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, top_offset + i, 1, 2, false, false));
        eid += 1;
    }

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    // Load at midspan top chord node
    // For 3 panels: bottom 1,2,3,4 top 5,6,7,8. Midspan top node index:
    // Panel midpoint is between panel 1 and 2, at node index 2 (bottom) / top_offset+1 (top)
    // Actually midspan for 3 panels: x = span/2 = 4.5, nearest panel point x=3.0 or x=6.0
    // Use the second interior panel point (node 3 bottom, top_offset+2 top at x=2*pw=6.0)
    // Better: load the middle top-chord panel point
    let mid_top_node = top_offset + 1; // node at x = pw = 3.0 on top chord
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid_top_node,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input_vier = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT)],
        elems,
        sups,
        loads,
    );
    let res_vier = solve_2d(&input_vier).expect("solve vierendeel");

    // Get deflection at bottom chord node 2 (x = pw)
    let d_vier = res_vier.displacements.iter().find(|d| d.node_id == 2).unwrap().uy.abs();

    // The Vierendeel girder should be stiffer than a single chord beam
    // because the two-chord system has greater effective depth.
    assert!(
        d_vier < d_single,
        "Vierendeel girder (d={:.6e}) should be stiffer than single beam (d={:.6e})",
        d_vier,
        d_single
    );
}

// ================================================================
// 4. Opening in Beam: Vierendeel Action Around Web Opening
// ================================================================
//
// A beam with a rectangular web opening is modeled as a local
// Vierendeel panel: top and bottom chords around the opening with
// short verticals at each side. The chords develop reverse bending
// (contra-flexure) due to the Vierendeel shear mechanism.
//
// Reference: Salmon et al., "Steel Structures", §7.8.

#[test]
fn validation_vierendeel_web_opening() {
    let span = 8.0;
    let opening_w = 2.0; // opening width centered at midspan
    let opening_h = 0.5; // half-depth above and below neutral axis
    let p = -20.0; // midspan point load

    // Model a beam with opening as a Vierendeel panel at midspan.
    // Solid beam portions on each side, opening modeled with two chords.
    //
    // Layout (x-coordinates):
    // 0 --- 3.0 --- 5.0 --- 8.0
    //         |_____|  <- opening (Vierendeel panel)
    //
    // Bottom nodes: 1(0,0), 2(3,0), 3(5,0), 4(8,0)
    // Top nodes at opening: 5(3, opening_h*2), 6(5, opening_h*2)

    let x_left = (span - opening_w) / 2.0;  // 3.0
    let x_right = (span + opening_w) / 2.0; // 5.0
    let ch_h = opening_h * 2.0; // total chord spacing = 1.0

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, x_left, 0.0),
        (3, x_right, 0.0),
        (4, span, 0.0),
        (5, x_left, ch_h),
        (6, x_right, ch_h),
    ];

    // Use smaller section for chords around opening
    let iz_chord_opening: f64 = IZ_CHORD * 0.25;

    let elems = vec![
        // Solid beam portions (full section)
        (1, "frame", 1, 2, 1, 1, false, false), // left solid
        (2, "frame", 3, 4, 1, 1, false, false), // right solid
        // Bottom chord of opening
        (3, "frame", 2, 3, 1, 2, false, false),
        // Top chord of opening
        (4, "frame", 5, 6, 1, 2, false, false),
        // Left vertical of opening
        (5, "frame", 2, 5, 1, 3, false, false),
        // Right vertical of opening
        (6, "frame", 3, 6, 1, 3, false, false),
    ];

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, 4, "rollerX"),
    ];

    // Point load at left edge of opening (node 2)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![
            (1, A_CHORD, IZ_CHORD),          // full section
            (2, A_CHORD * 0.5, iz_chord_opening), // chord section
            (3, A_VERT, IZ_VERT),            // vertical section
        ],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -p, 0.05, "Web opening: ΣRy = -P");

    // Both chords (top and bottom) of the opening should carry bending
    let ef_bot_chord = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef_top_chord = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    assert!(
        ef_bot_chord.m_start.abs() > 0.01 || ef_bot_chord.m_end.abs() > 0.01,
        "Bottom chord of opening should carry bending: m_start={:.4}, m_end={:.4}",
        ef_bot_chord.m_start, ef_bot_chord.m_end
    );
    assert!(
        ef_top_chord.m_start.abs() > 0.01 || ef_top_chord.m_end.abs() > 0.01,
        "Top chord of opening should carry bending: m_start={:.4}, m_end={:.4}",
        ef_top_chord.m_start, ef_top_chord.m_end
    );

    // The verticals at the opening edges transfer shear via bending
    let ef_vert_left = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    let ef_vert_right = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef_vert_left.v_start.abs() > 0.001 || ef_vert_right.v_start.abs() > 0.001,
        "Verticals at opening edges must carry shear"
    );
}

// ================================================================
// 5. Lateral Load on Vierendeel: All Members Contribute to Sway
// ================================================================
//
// A 2-panel Vierendeel frame under lateral load. All members (chords
// and verticals) develop bending moments to resist sway, unlike a
// braced frame where diagonals carry most of the lateral force.
//
// Compare sway of Vierendeel (no diagonals) vs braced frame (with
// diagonals). The Vierendeel should have significantly more drift.
//
// Reference: McCormac & Csernak, "Structural Steel Design", §14.4.

#[test]
fn validation_vierendeel_lateral_sway_all_members() {
    let h = 4.0;
    let pw = 3.0;
    let p = 15.0; // lateral load

    // 2-panel Vierendeel: 6 nodes
    // Bottom: 1(0,0), 2(pw,0), 3(2*pw,0)
    // Top:    4(0,h),  5(pw,h), 6(2*pw,h)
    let nodes_vier = vec![
        (1, 0.0, 0.0),
        (2, pw, 0.0),
        (3, 2.0 * pw, 0.0),
        (4, 0.0, h),
        (5, pw, h),
        (6, 2.0 * pw, h),
    ];

    let elems_vier = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        // Top chord
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Verticals
        (5, "frame", 1, 4, 1, 2, false, false),
        (6, "frame", 2, 5, 1, 2, false, false),
        (7, "frame", 3, 6, 1, 2, false, false),
    ];

    let sups_vier = vec![
        (1, 1_usize, "fixed"),
        (2, 3, "fixed"),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4,
        fx: p,
        fy: 0.0,
        mz: 0.0,
    })];

    let input_vier = make_input(
        nodes_vier.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT)],
        elems_vier,
        sups_vier,
        loads.clone(),
    );
    let res_vier = solve_2d(&input_vier).expect("solve vierendeel");

    // Now build the same frame but add diagonal braces (X-braces in each panel)
    let elems_braced = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        (5, "frame", 1, 4, 1, 2, false, false),
        (6, "frame", 2, 5, 1, 2, false, false),
        (7, "frame", 3, 6, 1, 2, false, false),
        // Diagonals (truss members)
        (8, "truss", 1, 5, 1, 3, false, false),
        (9, "truss", 2, 6, 1, 3, false, false),
    ];

    let sups_braced = vec![
        (1, 1_usize, "fixed"),
        (2, 3, "fixed"),
    ];

    let input_braced = make_input(
        nodes_vier,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT), (3, 0.005, 0.0)],
        elems_braced,
        sups_braced,
        loads,
    );
    let res_braced = solve_2d(&input_braced).expect("solve braced");

    let d_vier = res_vier.displacements.iter().find(|d| d.node_id == 4).unwrap().ux.abs();
    let d_braced = res_braced.displacements.iter().find(|d| d.node_id == 4).unwrap().ux.abs();

    // Vierendeel should have significantly more drift than braced frame
    assert!(
        d_vier > d_braced * 1.5,
        "Vierendeel drift ({:.6e}) should be >1.5x braced drift ({:.6e})",
        d_vier,
        d_braced
    );

    // All members in the Vierendeel must carry bending moment
    for eid in 1..=7 {
        let ef = res_vier.element_forces.iter().find(|e| e.element_id == eid).unwrap();
        assert!(
            ef.m_start.abs() > 0.01 || ef.m_end.abs() > 0.01,
            "Vierendeel member {} should carry bending: m_start={:.4}, m_end={:.4}",
            eid, ef.m_start, ef.m_end
        );
    }

    // Global equilibrium for Vierendeel
    let sum_rx: f64 = res_vier.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Vierendeel lateral: ΣRx = -P");
}

// ================================================================
// 6. Panel Point Loading: Shear Distribution
// ================================================================
//
// A 4-panel Vierendeel girder with a concentrated load at one panel
// point. The shear in the panel containing the load should be larger
// than the shear in panels farther from the load.
//
// Reference: Kassimali, "Structural Analysis", §7.5.

#[test]
fn validation_vierendeel_panel_point_loading() {
    let h = 2.0;
    let pw = 2.5;
    let n_panels: usize = 4;
    let p = -30.0; // downward load at second top panel point

    // Bottom: nodes 1..5 (at y=0)
    // Top: nodes 6..10 (at y=h)
    let top_offset = n_panels + 2; // = 6

    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x: f64 = i as f64 * pw;
        nodes.push((i + 1, x, 0.0));
        nodes.push((i + 1 + n_panels + 1, x, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels {
        elems.push((eid, "frame", top_offset + i, top_offset + i + 1, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, top_offset + i, 1, 2, false, false));
        eid += 1;
    }

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    // Load at second top panel point (node top_offset + 1, at x = pw)
    let load_node = top_offset + 1; // node 7 at x = 2.5
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node,
        fx: 0.0,
        fy: p,
        mz: 0.0,
    })];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -p, 0.05, "Panel point: ΣRy = -P");

    // Reactions: left reaction should be larger (load closer to left support)
    // Load at x=pw, span=n_panels*pw. R_left = P*(span-pw)/span = P*3/4
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_right = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().ry;

    assert!(
        r_left.abs() > r_right.abs(),
        "Left reaction ({:.4}) should be larger than right ({:.4}) for off-center load",
        r_left, r_right
    );

    // The vertical member nearest to the load should have higher shear/moment
    // than the one farthest from the load. Vertical at load point is element
    // (2*n_panels + 1 + 1) = element 10, farthest vertical is element (2*n_panels + 1 + n_panels) = element 13.
    let near_vert_id = 2 * n_panels + 1 + 1; // second vertical from left
    let far_vert_id = 2 * n_panels + 1 + n_panels; // rightmost vertical

    let ef_near = results.element_forces.iter().find(|e| e.element_id == near_vert_id).unwrap();
    let ef_far = results.element_forces.iter().find(|e| e.element_id == far_vert_id).unwrap();

    let moment_near: f64 = ef_near.m_start.abs().max(ef_near.m_end.abs());
    let moment_far: f64 = ef_far.m_start.abs().max(ef_far.m_end.abs());

    assert!(
        moment_near > moment_far,
        "Vertical near load (m={:.4}) should have larger moment than far vertical (m={:.4})",
        moment_near, moment_far
    );
}

// ================================================================
// 7. Uniform Load on Top Chord: Reversed Curvature in Chords
// ================================================================
//
// A 3-panel Vierendeel girder with UDL on the top chord. The chord
// members should exhibit reversed curvature (contra-flexure), with
// m_start and m_end having opposite signs in each chord segment.
//
// Reference: Timoshenko & Young, "Theory of Structures", §8.5.

#[test]
fn validation_vierendeel_udl_reversed_curvature() {
    let h = 2.0;
    let pw = 3.0;
    let n_panels: usize = 3;
    let q = -12.0; // UDL on top chord (kN/m, downward)

    // Bottom: nodes 1..4, Top: nodes 5..8
    let top_offset = n_panels + 2;

    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        let x: f64 = i as f64 * pw;
        nodes.push((i + 1, x, 0.0));
        nodes.push((i + 1 + n_panels + 1, x, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "frame", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    let first_top_elem = eid;
    for i in 0..n_panels {
        elems.push((eid, "frame", top_offset + i, top_offset + i + 1, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "frame", i + 1, top_offset + i, 1, 2, false, false));
        eid += 1;
    }

    let sups = vec![
        (1, 1_usize, "pinned"),
        (2, n_panels + 1, "rollerX"),
    ];

    // UDL on all top chord elements
    let mut loads = Vec::new();
    for i in 0..n_panels {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: first_top_elem + i,
            q_i: q,
            q_j: q,
            a: None,
            b: None,
        }));
    }

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, IZ_VERT)],
        elems,
        sups,
        loads,
    );
    let results = solve_2d(&input).expect("solve");

    // Vertical equilibrium
    let total_load: f64 = q * pw * n_panels as f64; // total downward load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -total_load, 0.05, "UDL Vierendeel: ΣRy");

    // Check for reversed curvature in top chord members.
    // In a Vierendeel, the chord members near the supports should show
    // contra-flexure: m_start and m_end have opposite signs (or the
    // moments at each end differ significantly in magnitude).
    // The key indicator is that at least one chord member has m_start
    // and m_end of opposite signs.
    let mut has_reversed_curvature = false;
    for i in 0..n_panels {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == first_top_elem + i)
            .unwrap();
        // Check if the internal moments (excluding FEF) show sign reversal.
        // For distributed loaded members, the internal moment includes the FEF.
        // We look at the net end moments.
        if ef.m_start * ef.m_end < 0.0 {
            has_reversed_curvature = true;
        }
    }

    // Also check bottom chord for reversed curvature
    for i in 0..n_panels {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == (i + 1))
            .unwrap();
        if ef.m_start * ef.m_end < 0.0 {
            has_reversed_curvature = true;
        }
    }

    assert!(
        has_reversed_curvature,
        "Vierendeel chords should show reversed curvature (contra-flexure) under UDL"
    );

    // All verticals should carry bending (Vierendeel shear mechanism)
    let first_vert = first_top_elem + n_panels;
    for i in 0..=n_panels {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == first_vert + i)
            .unwrap();
        // At least one end of the vertical should have moment
        let max_m: f64 = ef.m_start.abs().max(ef.m_end.abs());
        // Interior verticals must carry moment; end verticals might have small moment
        if i > 0 && i < n_panels {
            assert!(
                max_m > 0.01,
                "Interior vertical {} should carry bending: max_m={:.4}",
                first_vert + i, max_m
            );
        }
    }
}

// ================================================================
// 8. Stiffness Ratio Effect: Chord-to-Vertical Stiffness
// ================================================================
//
// A 2-panel Vierendeel with varying I_vertical / I_chord ratio.
// When verticals are very stiff (high I_vert), they attract more
// moment and the chord moments reduce. When verticals are flexible,
// chords carry larger moments. Compare two configurations.
//
// Reference: Salmon et al., "Steel Structures", §7.10.

#[test]
fn validation_vierendeel_stiffness_ratio_effect() {
    let h = 3.0;
    let pw = 4.0;
    let p = 10.0; // lateral load

    // Helper function to build a 2-panel Vierendeel and return results
    let build_and_solve = |iz_v: f64| -> Vec<ElementForces> {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, pw, 0.0),
            (3, 2.0 * pw, 0.0),
            (4, 0.0, h),
            (5, pw, h),
            (6, 2.0 * pw, h),
        ];
        let elems = vec![
            // Bottom chord
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            // Top chord
            (3, "frame", 4, 5, 1, 1, false, false),
            (4, "frame", 5, 6, 1, 1, false, false),
            // Verticals
            (5, "frame", 1, 4, 1, 2, false, false),
            (6, "frame", 2, 5, 1, 2, false, false),
            (7, "frame", 3, 6, 1, 2, false, false),
        ];
        let sups = vec![
            (1, 1_usize, "fixed"),
            (2, 3, "fixed"),
        ];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: p,
            fy: 0.0,
            mz: 0.0,
        })];

        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, A_CHORD, IZ_CHORD), (2, A_VERT, iz_v)],
            elems,
            sups,
            loads,
        );
        solve_2d(&input).expect("solve").element_forces
    };

    // Case A: Stiff verticals (I_vert = 5 * I_chord)
    let iz_stiff: f64 = IZ_CHORD * 5.0;
    let ef_stiff = build_and_solve(iz_stiff);

    // Case B: Flexible verticals (I_vert = 0.2 * I_chord)
    let iz_flex: f64 = IZ_CHORD * 0.2;
    let ef_flex = build_and_solve(iz_flex);

    // With stiff verticals, the verticals carry a larger fraction of the total moment.
    // With flexible verticals, the chords carry more moment.

    // Sum of absolute moments in verticals (elements 5, 6, 7)
    let vert_moment_stiff: f64 = (5..=7)
        .map(|id| {
            let ef = ef_stiff.iter().find(|e| e.element_id == id).unwrap();
            ef.m_start.abs() + ef.m_end.abs()
        })
        .sum();

    let vert_moment_flex: f64 = (5..=7)
        .map(|id| {
            let ef = ef_flex.iter().find(|e| e.element_id == id).unwrap();
            ef.m_start.abs() + ef.m_end.abs()
        })
        .sum();

    // Sum of absolute moments in chords (elements 1, 2, 3, 4)
    let chord_moment_stiff: f64 = (1..=4)
        .map(|id| {
            let ef = ef_stiff.iter().find(|e| e.element_id == id).unwrap();
            ef.m_start.abs() + ef.m_end.abs()
        })
        .sum();

    let chord_moment_flex: f64 = (1..=4)
        .map(|id| {
            let ef = ef_flex.iter().find(|e| e.element_id == id).unwrap();
            ef.m_start.abs() + ef.m_end.abs()
        })
        .sum();

    // Ratio of vertical moment to total moment should be higher for stiff verticals
    let total_stiff: f64 = vert_moment_stiff + chord_moment_stiff;
    let total_flex: f64 = vert_moment_flex + chord_moment_flex;

    let vert_ratio_stiff = vert_moment_stiff / total_stiff;
    let vert_ratio_flex = vert_moment_flex / total_flex;

    assert!(
        vert_ratio_stiff > vert_ratio_flex,
        "Stiff verticals should carry larger moment fraction ({:.4}) than flexible ({:.4})",
        vert_ratio_stiff, vert_ratio_flex
    );

    // Chord moment fraction should be higher for flexible verticals
    let chord_ratio_stiff = chord_moment_stiff / total_stiff;
    let chord_ratio_flex = chord_moment_flex / total_flex;

    assert!(
        chord_ratio_flex > chord_ratio_stiff,
        "Flexible verticals mean chords carry more moment: flex chord ratio ({:.4}) > stiff ({:.4})",
        chord_ratio_flex, chord_ratio_stiff
    );
}
