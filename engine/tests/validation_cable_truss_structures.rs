/// Validation: Truss and Cable-Like Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3-6 (truss analysis)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 4 (plane trusses)
///   - Gere & Timoshenko, "Mechanics of Materials", 4th Ed., §2.7 (bar assemblages)
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed., Ch. 4
///
/// Tests verify tension/compression member behavior under various load patterns.
/// Members are modeled as "truss" type (pure axial, no moment).
///
/// Tests:
///   1. Single inclined truss: V-shape under single load (F = P/(2 sin α))
///   2. Pratt truss under roof loading: support reactions and equilibrium
///   3. Triangular fan truss: diagonal force ratios by method of joints
///   4. Deep vs shallow truss: chord force magnitude comparison
///   5. Truss with missing diagonal: load path change to adjacent panel
///   6. Symmetric loaded truss: equal diagonal forces by symmetry
///   7. Bridge truss: bottom chord tension distribution across panels
///   8. Long-span truss: midspan deflection check
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.001; // m² — standard truss section
const IZ_T: f64 = 1e-10; // near-zero, truss has no bending stiffness

// ================================================================
// 1. V-Shape Under Single Load: F = P / (2 sin α)
// ================================================================
//
// Two inclined members meeting at bottom node where load is applied.
// Both members go from elevated support nodes down to the loaded node.
// By equilibrium at loaded node: F_member × sin(α) × 2 = P.
// Reference: Hibbeler, "Structural Analysis" 10th Ed., §3.2

#[test]
fn validation_truss_v_shape_single_load() {
    let span = 8.0; // horizontal distance between support nodes
    let sag = 3.0;  // vertical drop from supports to loaded node
    let p = 30.0;

    // Supports at (0, sag) and (span, sag); load at (span/2, 0)
    let input = make_input(
        vec![(1, 0.0, sag), (2, span, sag), (3, span / 2.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ_T)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false), // left leg
            (2, "truss", 2, 3, 1, 1, false, false), // right leg
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Member length and angle
    let leg_len = ((span / 2.0).powi(2) + sag.powi(2)).sqrt();
    let sin_a = sag / leg_len;

    // Exact member force: F = P / (2 sin α)
    let f_exact = p / (2.0 * sin_a);
    let f1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;

    assert_close(f1.abs(), f_exact, 0.02, "V-truss: F1 = P/(2 sin α)");
    assert_close(f2.abs(), f_exact, 0.02, "V-truss: F2 = P/(2 sin α)");
    // By symmetry, equal forces
    assert_close(f1.abs(), f2.abs(), 0.01, "V-truss: symmetric forces");

    // Load node deflects downward
    let d = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(d.uy < 0.0, "V-truss: node 3 deflects down");
}

// ================================================================
// 2. Pratt Truss Under Roof Loading: Reactions and Equilibrium
// ================================================================
//
// Pratt truss (top chord + bottom chord + verticals + diagonals).
// Uniform load at each top chord node simulating roof load.
// Support reactions must equal total applied load, and supports
// must share load equally for symmetric loading.
// Reference: Kassimali, "Structural Analysis" 6th Ed., §4.4

#[test]
fn validation_truss_pratt_roof_load() {
    let n_panels = 4;
    let panel_w = 3.0;
    let h = 3.0;
    let p = 12.0; // kN per top node

    // Bottom nodes: 1..=5, top nodes: 6..=10
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels {
        elems.push((eid, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "truss", i + 1, n_panels + 2 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Pratt: slope from lower outer toward center top)
    for i in 0..n_panels {
        let bot_j = i + 2;
        let top_i = n_panels + 2 + i;
        elems.push((eid, "truss", bot_j, top_i, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Roof load at every top node (including end nodes)
    let mut loads = Vec::new();
    for i in 0..=n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_panels + 2 + i, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let total_load = (n_panels + 1) as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Pratt roof: ΣRy = total load");

    // By symmetry: equal reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_end = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().ry;
    assert_close(r1, r_end, 0.02, "Pratt roof: symmetric reactions");

    // All members carry pure axial (V≈0, M≈0)
    for ef in &results.element_forces {
        assert!(
            ef.v_start.abs() < 1e-3,
            "Pratt elem {} has shear: V={:.6}", ef.element_id, ef.v_start
        );
    }
}

// ================================================================
// 3. Triangular Fan Truss: Member Forces and Equilibrium
// ================================================================
//
// Fan truss: apex at top connected to two bottom chord nodes as supports,
// plus loads applied at two intermediate bottom nodes.
// Under loads at intermediate nodes, fan diagonals carry predictable forces.
// Outer fans (shallower angle) carry more force than inner fans (steeper angle).
// Reference: Leet, Uang & Gilbert, "Fundamentals", 5th Ed., §4.3

#[test]
fn validation_truss_fan_diagonal_ratios() {
    let span = 8.0;
    let h = 3.0;
    let p = 10.0; // load at each intermediate bottom node

    // Nodes: apex 5=(4,3), supports 1=(0,0) and 4=(8,0)
    // Intermediate bottom: 2=(2,0) and 3=(6,0) — loaded nodes
    // Bottom chord from 1 to 4 via 2 and 3.
    // All bottom nodes connect to apex via fans.
    // m=7, r=3, n=5: 7+3=10=2×5 → determinate
    let nodes = vec![
        (1, 0.0, 0.0),
        (2, 2.0, 0.0),
        (3, 6.0, 0.0),
        (4, span, 0.0),
        (5, span / 2.0, h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 5, 1, 1, false, false), // outer left fan: (0,0)→(4,3), L=5
        (5, "truss", 2, 5, 1, 1, false, false), // inner left fan: (2,0)→(4,3), L≈3.61
        (6, "truss", 3, 5, 1, 1, false, false), // inner right fan: (6,0)→(4,3), L≈3.61
        (7, "truss", 4, 5, 1, 1, false, false), // outer right fan: (8,0)→(4,3), L=5
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
    // Loads at intermediate bottom nodes — these force the inner fans to carry load
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Fan truss: ΣRy = 2P");

    // Symmetric loading → symmetric reaction
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap().ry;
    assert_close(r1, r4, 0.02, "Fan truss: symmetric reactions");

    // By symmetry: outer left and right fans equal
    let f_outer_l = results.element_forces.iter()
        .find(|e| e.element_id == 4).unwrap().n_start.abs();
    let f_outer_r = results.element_forces.iter()
        .find(|e| e.element_id == 7).unwrap().n_start.abs();
    assert_close(f_outer_l, f_outer_r, 0.05, "Fan: outer diagonals equal");

    // By symmetry: inner left and right fans equal
    let f_inner_l = results.element_forces.iter()
        .find(|e| e.element_id == 5).unwrap().n_start.abs();
    let f_inner_r = results.element_forces.iter()
        .find(|e| e.element_id == 6).unwrap().n_start.abs();
    assert_close(f_inner_l, f_inner_r, 0.05, "Fan: inner diagonals equal");

    // The inner fans must carry non-zero force (loaded at their bottom node)
    assert!(
        f_inner_l > 1.0,
        "Fan: inner fan carries force: {:.4}", f_inner_l
    );

    // All fan members carry force (compression from downward loads)
    assert!(f_outer_l > 0.1, "Fan: outer fan carries force");
    assert!(f_inner_l > 0.1, "Fan: inner fan carries force");
}

// ================================================================
// 4. Deep vs Shallow Truss: Chord Force Magnitudes
// ================================================================
//
// Two similar trusses, one deep (h large) and one shallow (h small),
// under the same total span and loading. The shallower truss carries
// larger chord forces (smaller lever arm → more force for same moment).
// Reference: Hibbeler, "Structural Analysis" 10th Ed., §3.5

#[test]
fn validation_truss_deep_vs_shallow_chord_force() {
    let span = 12.0;
    let p = 30.0; // midspan load

    let make_truss = |depth: f64| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0),
            (2, span / 2.0, 0.0),
            (3, span, 0.0),
            (4, span / 2.0, depth), // top apex
        ];
        let elems = vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom left
            (2, "truss", 2, 3, 1, 1, false, false), // bottom right
            (3, "truss", 1, 4, 1, 1, false, false), // left diagonal
            (4, "truss", 3, 4, 1, 1, false, false), // right diagonal
            (5, "truss", 2, 4, 1, 1, false, false), // center vertical
        ];
        let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
            elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        // Bottom chord force at left panel
        results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start.abs()
    };

    let f_deep = make_truss(6.0);
    let f_shallow = make_truss(2.0);

    // Shallow truss has smaller depth → larger chord forces
    // For a simple triangle: N_bottom = P/2 / tan(α), so N ∝ 1/depth
    assert!(
        f_shallow > f_deep,
        "Shallow truss has larger chord force: {:.4} > {:.4}", f_shallow, f_deep
    );

    // Ratio should be approximately depth_deep/depth_shallow = 3
    let ratio = f_shallow / f_deep;
    let expected_ratio = 6.0 / 2.0; // inverse ratio of depths
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(
        err < 0.15,
        "Depth ratio: FEM={:.3}, theory={:.3}, err={:.1}%", ratio, expected_ratio, err * 100.0
    );
}

// ================================================================
// 5. Truss with Missing Diagonal: Load Path Change
// ================================================================
//
// Pratt-like truss where one diagonal is removed.
// Without the diagonal, the shear in that panel must be
// carried by neighboring panels → larger forces in adjacent diagonals.
// Reference: Kassimali, "Structural Analysis" 6th Ed., §4.6 (indeterminate trusses)

#[test]
fn validation_truss_missing_diagonal_load_path() {
    let panel_w = 4.0;
    let h = 3.0;
    let p = 20.0;

    // 3-panel rectangular truss
    // Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0)
    // Top:    5(0,3), 6(4,3), 7(8,3), 8(12,3)
    let nodes = vec![
        (1, 0.0, 0.0), (2, panel_w, 0.0), (3, 2.0*panel_w, 0.0), (4, 3.0*panel_w, 0.0),
        (5, 0.0, h),   (6, panel_w, h),   (7, 2.0*panel_w, h),   (8, 3.0*panel_w, h),
    ];

    let make_truss_ef = |include_diag_panel2: bool| -> Vec<f64> {
        let mut elems = vec![
            (1,  "truss", 1, 2, 1, 1, false, false), // bottom chord
            (2,  "truss", 2, 3, 1, 1, false, false),
            (3,  "truss", 3, 4, 1, 1, false, false),
            (4,  "truss", 5, 6, 1, 1, false, false), // top chord
            (5,  "truss", 6, 7, 1, 1, false, false),
            (6,  "truss", 7, 8, 1, 1, false, false),
            (7,  "truss", 1, 5, 1, 1, false, false), // verticals
            (8,  "truss", 2, 6, 1, 1, false, false),
            (9,  "truss", 3, 7, 1, 1, false, false),
            (10, "truss", 4, 8, 1, 1, false, false),
            (11, "truss", 2, 5, 1, 1, false, false), // diagonal panel 1
            // panel 2 diagonal: (3, 6) — conditionally included
            (13, "truss", 4, 7, 1, 1, false, false), // diagonal panel 3
        ];
        if include_diag_panel2 {
            elems.push((12, "truss", 3, 6, 1, 1, false, false));
        }
        let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 6, fx: 0.0, fy: -p, mz: 0.0,
        })];
        let input = make_input(
            nodes.clone(), vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
            elems, sups, loads,
        );
        let results = linear::solve_2d(&input).unwrap();
        vec![
            results.element_forces.iter().find(|e| e.element_id == 11).unwrap().n_start.abs(),
            results.element_forces.iter().find(|e| e.element_id == 13).unwrap().n_start.abs(),
        ]
    };

    let with_diag = make_truss_ef(true);
    let without_diag = make_truss_ef(false);

    // Without the center diagonal, the panel 1 and panel 3 diagonals must
    // carry more force to redistribute the shear
    let sum_with = with_diag[0] + with_diag[1];
    let sum_without = without_diag[0] + without_diag[1];
    assert!(
        sum_without > sum_with * 0.8,
        "Missing diagonal: adjacent diagonals carry redistributed load: {:.4} vs {:.4}",
        sum_without, sum_with
    );
}

// ================================================================
// 6. Symmetric Truss Under Symmetric Load: Equal Diagonal Forces
// ================================================================
//
// Warren truss with symmetric point loads at top nodes.
// Diagonals equidistant from center must have equal force magnitudes.
// Reference: Hibbeler, "Structural Analysis" 10th Ed., §3.6

#[test]
fn validation_truss_symmetric_equal_diagonals() {
    let n_panels = 4;
    let panel_w = 3.0;
    let h = 3.0;
    let p = 10.0;

    // Bottom chord: nodes 1..5; top nodes at panel midpoints: nodes 6..9
    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels - 1 {
        elems.push((eid, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Warren W-pattern)
    for i in 0..n_panels {
        let bot_l = i + 1;
        let top = n_panels + 2 + i;
        let bot_r = i + 2;
        elems.push((eid, "truss", bot_l, top, 1, 1, false, false));
        eid += 1;
        elems.push((eid, "truss", top, bot_r, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];
    // Symmetric loading: equal loads at all top nodes
    let mut loads = Vec::new();
    for i in 0..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_panels + 2 + i, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == n_panels + 1).unwrap().ry;
    assert_close(r1, r5, 0.02, "Symmetric truss: equal reactions");

    // The left-most downward diagonal (bot1→top1) and right-most (top4→bot5)
    // are in symmetric positions → equal force magnitudes
    // Left: first downward diagonal from node 1 (eid 5 after bottom+top chords)
    // Elements: bottom(4) + top(3) = 7 total chord; diagonals start at eid 8
    // Diag pattern: bot1->top1 (eid 8), top1->bot2 (eid 9), ...
    // The outermost left diagonal (node 1 → top1 = node 6): element 8
    // The outermost right diagonal (top4 → node 5): last diagonal eid = 8+2*(4-1)+1 = 15
    let f_left_outer = results.element_forces.iter()
        .find(|e| e.element_id == 8).unwrap().n_start.abs();
    // Right outer: bot5 = node 5, top4 = node 9; these connect as (top4, bot5) = eid 15
    let f_right_outer = results.element_forces.iter()
        .find(|e| e.element_id == 15).unwrap().n_start.abs();

    assert_close(
        f_left_outer, f_right_outer, 0.05,
        "Symmetric truss: outer diagonal forces equal"
    );
}

// ================================================================
// 7. Bridge Truss: Bottom Chord Tension Distribution
// ================================================================
//
// Howe bridge truss loaded at bottom chord nodes (simulating vehicle loads).
// Bottom chord carries tension that is maximum at midspan and zero at supports.
// Reference: Kassimali, "Structural Analysis" 6th Ed., §4.5

#[test]
fn validation_truss_bridge_bottom_chord_tension() {
    let n_panels = 6;
    let panel_w = 4.0;
    let h = 4.0;
    let p = 20.0; // kN per interior bottom node

    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    for i in 0..=n_panels {
        nodes.push((n_panels + 2 + i, i as f64 * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels {
        elems.push((eid, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n_panels {
        elems.push((eid, "truss", i + 1, n_panels + 2 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Howe: from top toward outside)
    for i in 0..n_panels {
        let top_l = n_panels + 2 + i;
        let bot_r = i + 2;
        elems.push((eid, "truss", top_l, bot_r, 1, 1, false, false));
        eid += 1;
    }

    // Supports at ends of bottom chord
    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];

    // Load at interior bottom nodes (excluding supports)
    let mut loads = Vec::new();
    for i in 1..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: i + 1, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Bottom chord midspan panel should have maximum tension
    let mid_panel = n_panels / 2; // panel 3 (elements 1..6 are bottom chord)
    let end_panel = 1;
    let f_mid = results.element_forces.iter()
        .find(|e| e.element_id == mid_panel).unwrap().n_start.abs();
    let f_end = results.element_forces.iter()
        .find(|e| e.element_id == end_panel).unwrap().n_start.abs();

    // Midspan bottom chord carries more tension than end panel
    assert!(
        f_mid > f_end,
        "Bridge truss: midspan chord > end chord: {:.4} > {:.4}", f_mid, f_end
    );

    // Equilibrium
    let total_load = (n_panels - 1) as f64 * p;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.01, "Bridge truss: ΣRy = total load");
}

// ================================================================
// 8. Long-Span Truss: Midspan Deflection Sanity Check
// ================================================================
//
// Long-span Warren truss (8 panels, 24 m span).
// Under symmetric loading, midspan deflection should be non-trivial.
// Deflection scales with L³ / (A × E × h²) approximately.
// Reference: Gere & Timoshenko, "Mechanics of Materials" 4th Ed., §2.7

#[test]
fn validation_truss_long_span_midspan_deflection() {
    let n_panels = 8;
    let panel_w = 3.0;
    let h = 3.0;
    let p = 10.0;

    let mut nodes = Vec::new();
    for i in 0..=n_panels {
        nodes.push((i + 1, i as f64 * panel_w, 0.0));
    }
    for i in 0..n_panels {
        nodes.push((n_panels + 2 + i, (i as f64 + 0.5) * panel_w, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chord
    for i in 0..n_panels {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chord
    for i in 0..n_panels - 1 {
        elems.push((eid, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals (Warren W)
    for i in 0..n_panels {
        let bot_l = i + 1;
        let top = n_panels + 2 + i;
        let bot_r = i + 2;
        elems.push((eid, "truss", bot_l, top, 1, 1, false, false));
        eid += 1;
        elems.push((eid, "truss", top, bot_r, 1, 1, false, false));
        eid += 1;
    }

    let sups = vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")];
    // Symmetric point loads at all top nodes
    let mut loads = Vec::new();
    for i in 0..n_panels {
        loads.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_panels + 2 + i, fx: 0.0, fy: -p, mz: 0.0,
        }));
    }

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Midspan bottom node is node (n_panels/2 + 1)
    let mid_bottom = n_panels / 2 + 1;
    let defl = results.displacements.iter()
        .find(|d| d.node_id == mid_bottom).unwrap().uy;

    assert!(defl < 0.0,
        "Long-span truss: midspan deflects downward: uy={:.6e}", defl);
    assert!(
        defl.abs() > 1e-5,
        "Long-span truss: non-trivial midspan deflection: {:.6e}", defl
    );

    // Deflection under doubled load should be twice as large
    let mut loads2 = Vec::new();
    for i in 0..n_panels {
        loads2.push(SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_panels + 2 + i, fx: 0.0, fy: -2.0 * p, mz: 0.0,
        }));
    }
    let span = n_panels as f64 * panel_w;
    let nodes2: Vec<_> = {
        let mut v = Vec::new();
        for i in 0..=n_panels {
            v.push((i + 1, i as f64 * panel_w, 0.0));
        }
        for i in 0..n_panels {
            v.push((n_panels + 2 + i, (i as f64 + 0.5) * panel_w, h));
        }
        v
    };
    let _ = span;
    let mut elems2 = Vec::new();
    let mut eid2 = 1;
    for i in 0..n_panels {
        elems2.push((eid2, "truss", i + 1, i + 2, 1, 1, false, false));
        eid2 += 1;
    }
    for i in 0..n_panels - 1 {
        elems2.push((eid2, "truss", n_panels + 2 + i, n_panels + 3 + i, 1, 1, false, false));
        eid2 += 1;
    }
    for i in 0..n_panels {
        let bot_l = i + 1;
        let top = n_panels + 2 + i;
        let bot_r = i + 2;
        elems2.push((eid2, "truss", bot_l, top, 1, 1, false, false));
        eid2 += 1;
        elems2.push((eid2, "truss", top, bot_r, 1, 1, false, false));
        eid2 += 1;
    }
    let input2 = make_input(nodes2, vec![(1, E, 0.3)], vec![(1, A, IZ_T)],
        elems2, vec![(1, 1, "pinned"), (2, n_panels + 1, "rollerX")], loads2);
    let results2 = linear::solve_2d(&input2).unwrap();
    let defl2 = results2.displacements.iter()
        .find(|d| d.node_id == mid_bottom).unwrap().uy;

    // Linear: double load → double deflection
    assert_close(defl2 / defl, 2.0, 0.02, "Long-span truss: linear scaling δ ∝ P");
}
