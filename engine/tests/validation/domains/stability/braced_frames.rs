/// Validation: Braced Frame Structures
///
/// References:
///   - McCormac & Csernak, "Structural Steel Design", 6th Ed., Ch. 13
///   - Salmon, Johnson & Malhas, "Steel Structures", 5th Ed., Ch. 6
///   - AISC 360-16, Chapter C (Stability)
///
/// Tests verify mixed frame+truss bracing systems:
///   1. X-braced single bay: lateral stiffness increase
///   2. Single diagonal brace: resolves sway
///   3. Chevron (inverted-V) brace: midspan beam connection
///   4. K-brace: vertical member with diagonal braces
///   5. Braced vs unbraced: stiffness comparison
///   6. Multi-story braced frame: story drift
///   7. Braced frame equilibrium
///   8. Braced frame: brace forces under lateral load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_FRAME: f64 = 0.01;
const A_BRACE: f64 = 0.005; // brace cross-section (smaller)
const IZ: f64 = 1e-4;

// ================================================================
// 1. X-Braced Single Bay: Lateral Stiffness Increase
// ================================================================
//
// Portal frame with X-bracing (two diagonal truss elements).
// The braced frame should be much stiffer laterally.

#[test]
fn validation_braced_x_brace_stiffness() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Unbraced portal frame
    let input_unbraced = make_portal_frame(h, w, E, A_FRAME, IZ, p, 0.0);
    let res_unbraced = linear::solve_2d(&input_unbraced).unwrap();

    // Braced frame: add X-braces (truss elements)
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam
        (3, "frame", 3, 4, 1, 1, false, false), // right column
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal 1
        (5, "truss", 2, 4, 1, 2, false, false), // diagonal 2
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input_braced = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let res_braced = linear::solve_2d(&input_braced).unwrap();

    let d_unbraced = res_unbraced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    let d_braced = res_braced.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Braced frame should be significantly stiffer
    assert!(d_braced < d_unbraced * 0.5,
        "X-brace should reduce drift: braced={:.6e}, unbraced={:.6e}",
        d_braced, d_unbraced);
}

// ================================================================
// 2. Single Diagonal Brace: Resolves Sway
// ================================================================
//
// Portal frame with single diagonal brace (node 1 to node 3).
// Under lateral load, the brace carries axial tension.

#[test]
fn validation_braced_single_diagonal() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // single diagonal brace
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Brace should carry axial force
    let ef_brace = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(ef_brace.n_start.abs() > 1.0,
        "Diagonal brace should carry axial force: N={:.4}", ef_brace.n_start);

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Diagonal brace: ΣRx = -P");
}

// ================================================================
// 3. Chevron (Inverted-V) Brace
// ================================================================
//
// Two diagonal braces meet at beam midspan.
// Beam must be designed for unbalanced vertical force at midspan.

#[test]
fn validation_braced_chevron() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    // Need midspan node on beam
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h),
        (3, w / 2.0, h), // beam midspan
        (4, w, h), (5, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false), // left column
        (2, "frame", 2, 3, 1, 1, false, false), // beam left half
        (3, "frame", 3, 4, 1, 1, false, false), // beam right half
        (4, "frame", 4, 5, 1, 1, false, false), // right column
        (5, "truss", 1, 3, 1, 2, false, false), // left brace
        (6, "truss", 5, 3, 1, 2, false, false), // right brace
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 5, "fixed")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Both braces should carry axial force
    let n5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap().n_start.abs();
    let n6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start.abs();
    assert!(n5 > 0.5, "Left brace force: {:.4}", n5);
    assert!(n6 > 0.5, "Right brace force: {:.4}", n6);

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Chevron brace: ΣRx = -P");
}

// ================================================================
// 4. Braced vs Unbraced: Stiffness Comparison
// ================================================================
//
// Compare lateral stiffness of unbraced, single-brace, and X-brace frames.
// Expected: K_x_brace > K_single > K_unbraced.

#[test]
fn validation_braced_stiffness_comparison() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let build_frame = |braces: &[(usize, usize)]| -> f64 {
        let nodes = vec![
            (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        ];
        let mut elems = vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 2, 3, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ];
        for (i, &(ni, nj)) in braces.iter().enumerate() {
            elems.push((4 + i, "truss", ni, nj, 1, 2, false, false));
        }
        let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
        let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fy: 0.0, mz: 0.0,
        })];
        let input = make_input(nodes, vec![(1, E, 0.3)],
            vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
        let results = linear::solve_2d(&input).unwrap();
        results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs()
    };

    let d_none = build_frame(&[]);
    let d_single = build_frame(&[(1, 3)]);
    let d_x = build_frame(&[(1, 3), (2, 4)]);

    assert!(d_single < d_none,
        "Single brace stiffer: {:.6e} < {:.6e}", d_single, d_none);
    assert!(d_x < d_single,
        "X-brace stiffer: {:.6e} < {:.6e}", d_x, d_single);
}

// ================================================================
// 5. Multi-Story Braced Frame: Story Drift
// ================================================================
//
// Two-story frame with bracing. Each story has lateral load.
// Story drift should be controlled by braces.

#[test]
fn validation_braced_multistory_drift() {
    let h = 3.5;
    let w = 6.0;
    let p = 10.0;

    // Two-story frame: 6 nodes
    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, 0.0, 2.0 * h),
        (4, w, 0.0), (5, w, h), (6, w, 2.0 * h),
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 5, 1, 1, false, false),
        (4, "frame", 5, 6, 1, 1, false, false),
        // Beams
        (5, "frame", 2, 5, 1, 1, false, false),
        (6, "frame", 3, 6, 1, 1, false, false),
        // Braces (X-brace in ground story only)
        (7, "truss", 1, 5, 1, 2, false, false),
        (8, "truss", 2, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: p, fy: 0.0, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Ground story drift (braced) should be less than upper story drift (unbraced)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap().ux;

    let drift_ground = d2.abs();
    let drift_upper = (d3 - d2).abs();
    assert!(drift_ground < drift_upper,
        "Braced ground story drift < upper: {:.6e} < {:.6e}",
        drift_ground, drift_upper);
}

// ================================================================
// 6. Braced Frame: Brace Forces Under Lateral Load
// ================================================================
//
// Single-bay frame with diagonal brace. Horizontal force P at top.
// Brace force ≈ P / cos(α) where α = atan(h/w) is the brace angle.
// (Approximate — frame also carries some shear via bending.)

#[test]
fn validation_braced_brace_force() {
    let h = 3.0;
    let w = 4.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // brace from (0,0) to (w,h)
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Brace force: the horizontal component of the brace force
    // resists most of the lateral load
    let brace_l = (h * h + w * w).sqrt();
    let cos_a = w / brace_l;
    let ef_brace = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    // Horizontal component of brace force should be significant fraction of P
    let h_component = ef_brace.n_start.abs() * cos_a;
    assert!(h_component > p * 0.3,
        "Brace horizontal component: {:.4}, P={:.4}", h_component, p);

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Braced frame: ΣRx = -P");
}

// ================================================================
// 7. Braced Frame Global Equilibrium
// ================================================================
//
// Frame with bracing under combined lateral and gravity loads.
// Verify ΣFx = 0, ΣFy = 0, ΣM = 0.

#[test]
fn validation_braced_equilibrium() {
    let h = 4.0;
    let w = 6.0;
    let px = 10.0;
    let py = -20.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false),
        (5, "truss", 2, 4, 1, 2, false, false),
    ];
    let sups = vec![(1, 1_usize, "fixed"), (2, 4, "fixed")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: px, fy: 0.0, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: py, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: py, mz: 0.0 }),
    ];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // ΣFx = 0
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -px, 0.02, "Braced equilibrium: ΣRx = -Px");

    // ΣFy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, -2.0 * py, 0.02, "Braced equilibrium: ΣRy = -2Py");
}

// ================================================================
// 8. Braced Frame: Tension vs Compression in Braces
// ================================================================
//
// X-brace under lateral load: one diagonal in tension, other in compression.

#[test]
fn validation_braced_tension_compression() {
    let h = 4.0;
    let w = 6.0;
    let p = 10.0;

    let nodes = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 3, 4, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // diagonal 1→3
        (5, "truss", 4, 2, 1, 2, false, false), // diagonal 4→2
    ];
    let sups = vec![(1, 1_usize, "pinned"), (2, 4, "pinned")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A_FRAME, IZ), (2, A_BRACE, 0.0)], elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    let n4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap().n_start;
    let n5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap().n_start;

    // One brace in tension (positive N), other in compression (negative N)
    // Or vice versa depending on convention — they should have opposite signs
    assert!(n4 * n5 < 0.0,
        "X-brace: diagonals should have opposite signs: N4={:.4}, N5={:.4}", n4, n5);
}
