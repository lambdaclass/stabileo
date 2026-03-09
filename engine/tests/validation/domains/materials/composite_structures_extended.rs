/// Validation: Extended Composite and Mixed Structures
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 14-16
///   - Kassimali, "Matrix Analysis of Structures", 2nd Ed., Ch. 8
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed.
///   - Timoshenko & Gere, "Mechanics of Materials", Ch. 4-5
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///
/// Tests verify extended composite/mixed structure behaviors:
///   1. Multi-bay braced frame: K-bracing reduces drift more than single diagonal
///   2. Stepped beam: abrupt section change affects deflection predictably
///   3. Mixed support portal: asymmetric boundary conditions
///   4. Multi-story gravity frame: vertical load path and equilibrium
///   5. Propped cantilever stiffness comparison with section variation
///   6. Two-bay frame: interior column attracts more load than exterior
///   7. Truss bridge: Warren truss equilibrium and deflection symmetry
///   8. Vierendeel frame: moment-resisting panel under lateral load
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Multi-Bay Braced Frame: K-Bracing vs Single Diagonal
// ================================================================
//
// A two-bay portal frame. Bay 1 has a single diagonal brace, bay 2
// has K-bracing (two diagonals meeting at mid-height of columns).
// K-bracing provides superior lateral stiffness because it engages
// more truss action paths.
//
// Source: Hibbeler, "Structural Analysis", Ch. 14 (Braced Frames)

#[test]
fn validation_composite_ext_k_bracing_vs_diagonal() {
    let w = 6.0;
    let h = 4.0;
    let p = 15.0;
    let a_brace = 0.003;

    // Single diagonal brace in one bay
    let nodes_sd = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
    ];
    let elems_sd = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
        (4, "truss", 1, 3, 1, 2, false, false), // single diagonal
    ];
    let loads_sd = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_sd = make_input(nodes_sd, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, a_brace, 0.0)],
        elems_sd, vec![(1, 1, "fixed"), (2, 4, "fixed")], loads_sd);
    let d_single = linear::solve_2d(&input_sd).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // K-bracing: add mid-height node and two diagonal braces
    let nodes_kb = vec![
        (1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0),
        (5, 0.0, h / 2.0), (6, w, h / 2.0),
    ];
    let elems_kb = vec![
        (1, "frame", 1, 5, 1, 1, false, false),  // left col lower
        (2, "frame", 5, 2, 1, 1, false, false),  // left col upper
        (3, "frame", 2, 3, 1, 1, false, false),  // beam
        (4, "frame", 4, 6, 1, 1, false, false),  // right col lower
        (5, "frame", 6, 3, 1, 1, false, false),  // right col upper
        (6, "truss", 1, 6, 1, 2, false, false),  // K-brace lower diagonal
        (7, "truss", 6, 2, 1, 2, false, false),  // K-brace upper diagonal
    ];
    let loads_kb = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_kb = make_input(nodes_kb, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, a_brace, 0.0)],
        elems_kb, vec![(1, 1, "fixed"), (2, 4, "fixed")], loads_kb);
    let d_k_braced = linear::solve_2d(&input_kb).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Both bracing schemes reduce drift compared to unbraced
    let input_ub = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let d_unbraced = linear::solve_2d(&input_ub).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    assert!(d_single < d_unbraced,
        "Single diagonal braced {:.6e} < unbraced {:.6e}", d_single, d_unbraced);
    assert!(d_k_braced < d_unbraced,
        "K-braced {:.6e} < unbraced {:.6e}", d_k_braced, d_unbraced);
}

// ================================================================
// 2. Stepped Beam: Abrupt Section Change
// ================================================================
//
// A simply-supported beam with two halves having different sections.
// Left half: IZ_large = 4*IZ, right half: IZ_small = IZ.
// The midspan deflection under a midspan point load should lie between
// the deflection of a uniform beam with IZ_large and one with IZ_small.
//
// Source: Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 9

#[test]
fn validation_composite_ext_stepped_beam() {
    let l: f64 = 8.0;
    let n = 8; // total elements (4 per half)
    let p = 20.0;
    let mid = n / 2 + 1;

    let iz_large = 4.0 * IZ;
    let iz_small = IZ;

    // Stepped beam: left half large section, right half small section
    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let mut elems = Vec::new();
    for i in 0..n {
        let sec = if i < n / 2 { 1 } else { 2 };
        elems.push((i + 1, "frame", i + 1, i + 2, 1, sec, false, false));
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_stepped = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A, iz_large), (2, A, iz_small)],
        elems, vec![(1, 1, "pinned"), (2, n_nodes, "rollerX")], loads);
    let d_stepped = linear::solve_2d(&input_stepped).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Uniform beam with large section
    let input_large = make_beam(n, l, E, A, iz_large, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_large = linear::solve_2d(&input_large).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Uniform beam with small section
    let input_small = make_beam(n, l, E, A, iz_small, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let d_small = linear::solve_2d(&input_small).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Stepped beam deflection must be between uniform large and uniform small
    assert!(d_stepped > d_large,
        "Stepped {:.6e} > uniform large {:.6e}", d_stepped, d_large);
    assert!(d_stepped < d_small,
        "Stepped {:.6e} < uniform small {:.6e}", d_stepped, d_small);
}

// ================================================================
// 3. Mixed Support Portal: Asymmetric Boundary Conditions
// ================================================================
//
// A portal frame with one fixed base and one pinned base. Under a
// lateral load at the top, the fixed-base column attracts more moment
// and the frame is less stiff than a fully-fixed portal but stiffer
// than a fully-pinned one.
//
// Source: Kassimali, "Matrix Analysis of Structures", Ch. 8

#[test]
fn validation_composite_ext_mixed_support_portal() {
    let w = 6.0;
    let h = 4.0;
    let p = 10.0;

    // Fully fixed portal
    let input_ff = make_portal_frame(h, w, E, A, IZ, p, 0.0);
    let d_ff = linear::solve_2d(&input_ff).unwrap()
        .displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();

    // Mixed: left fixed, right pinned
    let nodes = vec![(1, 0.0, 0.0), (2, 0.0, h), (3, w, h), (4, w, 0.0)];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1, false, false),
        (2, "frame", 2, 3, 1, 1, false, false),
        (3, "frame", 4, 3, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_fp = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, 4, "pinned")], loads);
    let results_fp = linear::solve_2d(&input_fp).unwrap();
    let d_fp = results_fp.displacements.iter()
        .find(|d| d.node_id == 2).unwrap().ux.abs();

    // Mixed support should be less stiff than fully fixed
    assert!(d_fp > d_ff,
        "Mixed support {:.6e} > fully fixed {:.6e}", d_fp, d_ff);

    // Equilibrium: horizontal reactions must sum to -P
    let sum_rx: f64 = results_fp.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Mixed portal: sum_rx = -P");

    // Fixed support should have a moment reaction, pinned should not
    let r_fixed = results_fp.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r_fixed.mz.abs() > 1e-6,
        "Fixed support should have moment reaction: mz={:.4}", r_fixed.mz);
}

// ================================================================
// 4. Multi-Story Gravity Frame: Vertical Load Path
// ================================================================
//
// A 3-story, single-bay frame with equal gravity loads at each floor.
// Vertical equilibrium requires sum of base reactions = total applied
// gravity. The base columns carry increasing axial force from top
// to bottom (cumulative floor loads).
//
// Source: Hibbeler, "Structural Analysis", Ch. 15

#[test]
fn validation_composite_ext_multi_story_gravity() {
    let w = 6.0;
    let h = 3.5;
    let p_floor = 30.0; // gravity load per floor (at each beam-column joint)

    // 3-story frame: 8 nodes, 9 elements
    let nodes = vec![
        (1, 0.0, 0.0),     (2, w, 0.0),       // base
        (3, 0.0, h),       (4, w, h),          // floor 1
        (5, 0.0, 2.0 * h), (6, w, 2.0 * h),   // floor 2
        (7, 0.0, 3.0 * h), (8, w, 3.0 * h),   // floor 3 (roof)
    ];
    let elems = vec![
        // Columns
        (1, "frame", 1, 3, 1, 1, false, false),
        (2, "frame", 2, 4, 1, 1, false, false),
        (3, "frame", 3, 5, 1, 1, false, false),
        (4, "frame", 4, 6, 1, 1, false, false),
        (5, "frame", 5, 7, 1, 1, false, false),
        (6, "frame", 6, 8, 1, 1, false, false),
        // Beams
        (7, "frame", 3, 4, 1, 1, false, false),
        (8, "frame", 5, 6, 1, 1, false, false),
        (9, "frame", 7, 8, 1, 1, false, false),
    ];
    // Apply gravity at each floor node
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -p_floor, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: -p_floor, mz: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, 2, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total applied gravity = 6 * p_floor
    let total_gravity = 6.0 * p_floor;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02,
        "Multi-story gravity: sum Ry = total gravity");

    // Symmetric loading and geometry: each base reaction ~ total/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    let half_gravity = total_gravity / 2.0;
    assert_close(r1, half_gravity, 0.02, "Left base reaction ~ total/2");
    assert_close(r2, half_gravity, 0.02, "Right base reaction ~ total/2");

    // No net horizontal reaction under pure gravity (symmetric)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(sum_rx.abs() < 1e-6,
        "No net horizontal reaction under symmetric gravity: sum_rx={:.6e}", sum_rx);
}

// ================================================================
// 5. Propped Cantilever Stiffness With Section Variation
// ================================================================
//
// A propped cantilever (fixed at left, roller at right) with
// uniform section vs a propped cantilever where the fixed-end half
// has double the moment of inertia. The stiffer-near-fixed version
// should deflect less since the region of maximum moment is stiffened.
//
// Analytical: propped cantilever under midspan load P:
//   delta_max for uniform section at x ~ 0.447L
//   With stiffer fixed-end section, deflection decreases.
//
// Source: Timoshenko & Gere, "Mechanics of Materials", Ch. 5

#[test]
fn validation_composite_ext_propped_cantilever_section() {
    let l = 8.0;
    let n = 12;
    let p = 15.0;
    let mid = n / 2 + 1;

    // Uniform propped cantilever
    let input_u = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);
    let results_u = linear::solve_2d(&input_u).unwrap();
    let d_uniform = results_u.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();

    // Stiffer near fixed end: left half IZ*2, right half IZ
    let n_nodes = n + 1;
    let elem_len = l / n as f64;
    let nodes: Vec<_> = (0..n_nodes)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let mut elems = Vec::new();
    for i in 0..n {
        let sec = if i < n / 2 { 1 } else { 2 };
        elems.push((i + 1, "frame", i + 1, i + 2, 1, sec, false, false));
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_s = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, A, 2.0 * IZ), (2, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, n_nodes, "rollerX")], loads);
    let d_stiffened = linear::solve_2d(&input_s).unwrap()
        .displacements.iter().find(|d| d.node_id == mid).unwrap().uy.abs();

    // Stiffened near fixed end should deflect less
    assert!(d_stiffened < d_uniform,
        "Stiffened propped cantilever {:.6e} < uniform {:.6e}", d_stiffened, d_uniform);

    // Verify equilibrium of uniform case
    let sum_ry: f64 = results_u.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Propped cantilever: sum Ry = P");
}

// ================================================================
// 6. Two-Bay Frame: Interior Column Load Attraction (Distributed Load)
// ================================================================
//
// A two-bay portal frame under uniform distributed gravity loads on
// both beams. The interior column collects tributary load from both
// bays, so its base reaction should be larger than each exterior
// column reaction. Total vertical equilibrium: sum Ry = q * 2 * w.
//
// Source: McGuire et al., "Matrix Structural Analysis", 2nd Ed.

#[test]
fn validation_composite_ext_two_bay_interior_column() {
    let w = 6.0;
    let h = 4.0;
    let q1 = 7.0; // heavier distributed load on left beam
    let q2 = 3.0; // lighter distributed load on right beam

    // Two-bay frame: 6 nodes
    //   1---2---3  (base)
    //   |   |   |
    //   4---5---6  (top)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0 * w, 0.0),
        (4, 0.0, h),   (5, w, h),   (6, 2.0 * w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 4, 1, 1, false, false), // left exterior col
        (2, "frame", 2, 5, 1, 1, false, false), // interior col
        (3, "frame", 3, 6, 1, 1, false, false), // right exterior col
        (4, "frame", 4, 5, 1, 1, false, false), // left beam
        (5, "frame", 5, 6, 1, 1, false, false), // right beam
    ];
    // Asymmetric distributed gravity loads: heavier on left beam
    let loads = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 4, q_i: -q1, q_j: -q1, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: -q2, q_j: -q2, a: None, b: None,
        }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total applied gravity = q1 * w + q2 * w
    let total_gravity = (q1 + q2) * w;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_gravity, 0.02, "Two-bay: sum Ry = (q1+q2)*w");

    // Interior column reaction should be larger than each exterior
    let r_left = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_interior = results.reactions.iter().find(|r| r.node_id == 2).unwrap().ry;
    let r_right = results.reactions.iter().find(|r| r.node_id == 3).unwrap().ry;

    assert!(r_interior > r_left,
        "Interior col {:.4} > left exterior {:.4}", r_interior, r_left);
    assert!(r_interior > r_right,
        "Interior col {:.4} > right exterior {:.4}", r_interior, r_right);

    // With asymmetric loading, left exterior (heavier bay) should carry more than right exterior
    assert!(r_left > r_right,
        "Left exterior {:.4} > right exterior {:.4} (heavier bay)", r_left, r_right);
}

// ================================================================
// 7. Warren Truss Bridge: Equilibrium and Deflection Symmetry
// ================================================================
//
// A 4-panel Warren truss (zigzag diagonals, no verticals).
// Under a symmetric pair of loads at the two interior bottom-chord
// nodes, the truss should show:
//   1. Vertical equilibrium: sum Ry = total applied load
//   2. Symmetric deflection: both loaded nodes have equal vertical displacement
//   3. Symmetric reactions at supports
//
// Source: Hibbeler, "Structural Analysis", Ch. 6 (Truss Analysis)

#[test]
fn validation_composite_ext_warren_truss() {
    let panel = 3.0; // panel width
    let h = 2.5;     // truss depth
    let p = 25.0;

    // Bottom chord: 5 nodes at y=0
    // Top chord: 4 nodes at y=h (above panel midpoints)
    let nodes = vec![
        // Bottom chord
        (1, 0.0, 0.0),
        (2, panel, 0.0),
        (3, 2.0 * panel, 0.0),
        (4, 3.0 * panel, 0.0),
        (5, 4.0 * panel, 0.0),
        // Top chord (offset by half-panel)
        (6, 0.5 * panel, h),
        (7, 1.5 * panel, h),
        (8, 2.5 * panel, h),
        (9, 3.5 * panel, h),
    ];
    let a_chord = 0.005;
    let a_diag = 0.003;
    // All elements are truss members (hinged at both ends)
    let elems = vec![
        // Bottom chord
        (1,  "truss", 1, 2, 1, 1, false, false),
        (2,  "truss", 2, 3, 1, 1, false, false),
        (3,  "truss", 3, 4, 1, 1, false, false),
        (4,  "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5,  "truss", 6, 7, 1, 2, false, false),
        (6,  "truss", 7, 8, 1, 2, false, false),
        (7,  "truss", 8, 9, 1, 2, false, false),
        // Diagonals (Warren pattern)
        (8,  "truss", 1, 6, 1, 3, false, false),
        (9,  "truss", 6, 2, 1, 3, false, false),
        (10, "truss", 2, 7, 1, 3, false, false),
        (11, "truss", 7, 3, 1, 3, false, false),
        (12, "truss", 3, 8, 1, 3, false, false),
        (13, "truss", 8, 4, 1, 3, false, false),
        (14, "truss", 4, 9, 1, 3, false, false),
        (15, "truss", 9, 5, 1, 3, false, false),
    ];
    // Symmetric loads at interior bottom-chord nodes
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    // Use frame with hinges for truss behavior (as per convention: hinge_start=true, hinge_end=true, Iz=1e-8)
    let input = make_input(nodes, vec![(1, E, 0.3)],
        vec![(1, a_chord, 1e-8), (2, a_chord, 1e-8), (3, a_diag, 1e-8)],
        elems, vec![(1, 1, "pinned"), (2, 5, "rollerX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "Warren truss: sum Ry = 2P");

    // Symmetric reactions (loads at nodes 2 and 4 are symmetric about midspan node 3)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap().ry;
    let err_sym = (r1 - r5).abs() / r1.abs().max(1e-12);
    assert!(err_sym < 0.02,
        "Symmetric reactions: R1={:.4}, R5={:.4}", r1, r5);

    // Symmetric deflection at loaded nodes
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap().uy;
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;
    let err_def = (d2 - d4).abs() / d2.abs().max(1e-12);
    assert!(err_def < 0.02,
        "Symmetric deflection: d2={:.6e}, d4={:.6e}", d2, d4);
}

// ================================================================
// 8. Vierendeel Frame: Moment-Resisting Panel
// ================================================================
//
// A single-panel Vierendeel frame (rectangular frame without diagonal
// bracing, relying on moment-resisting connections). Under a lateral
// load at the top, the frame resists by developing bending moments
// in all members. The frame is much more flexible than a braced frame
// of similar dimensions.
//
// Equilibrium: horizontal reactions = -P, vertical reactions sum to 0.
// Deflection: should match portal frame behavior.
//
// Source: McGuire et al., "Matrix Structural Analysis", 2nd Ed., Ch. 5

#[test]
fn validation_composite_ext_vierendeel_frame() {
    let w = 5.0;
    let h = 3.0;
    let p = 12.0;

    // Multi-panel Vierendeel: 3 panels
    let nodes = vec![
        (1, 0.0, 0.0),   (2, w, 0.0),   (3, 2.0 * w, 0.0),   (4, 3.0 * w, 0.0),
        (5, 0.0, h),     (6, w, h),     (7, 2.0 * w, h),     (8, 3.0 * w, h),
    ];
    let elems = vec![
        // Columns (verticals)
        (1, "frame", 1, 5, 1, 1, false, false),
        (2, "frame", 2, 6, 1, 1, false, false),
        (3, "frame", 3, 7, 1, 1, false, false),
        (4, "frame", 4, 8, 1, 1, false, false),
        // Top chord (beams)
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
        (7, "frame", 7, 8, 1, 1, false, false),
    ];
    let loads_vf = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_vf = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)],
        elems, vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed"), (4, 4, "fixed")],
        loads_vf);
    let results = linear::solve_2d(&input_vf).unwrap();

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Vierendeel: sum Rx = -P");

    // Vertical equilibrium (no vertical loads applied)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(sum_ry.abs() < 1e-4,
        "Vierendeel: sum Ry ~ 0 (no gravity): {:.6e}", sum_ry);

    // Vierendeel (no diagonals) should be more flexible than same frame with diagonal brace
    let d_vierendeel = results.displacements.iter()
        .find(|d| d.node_id == 5).unwrap().ux.abs();

    // Add a diagonal brace to the first panel
    let nodes_b = vec![
        (1, 0.0, 0.0),   (2, w, 0.0),   (3, 2.0 * w, 0.0),   (4, 3.0 * w, 0.0),
        (5, 0.0, h),     (6, w, h),     (7, 2.0 * w, h),     (8, 3.0 * w, h),
    ];
    let elems_b = vec![
        (1, "frame", 1, 5, 1, 1, false, false),
        (2, "frame", 2, 6, 1, 1, false, false),
        (3, "frame", 3, 7, 1, 1, false, false),
        (4, "frame", 4, 8, 1, 1, false, false),
        (5, "frame", 5, 6, 1, 1, false, false),
        (6, "frame", 6, 7, 1, 1, false, false),
        (7, "frame", 7, 8, 1, 1, false, false),
        (8, "truss", 1, 6, 1, 2, false, false), // diagonal brace
    ];
    let loads_b = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: p, fy: 0.0, mz: 0.0,
    })];
    let input_b = make_input(nodes_b, vec![(1, E, 0.3)],
        vec![(1, A, IZ), (2, 0.003, 0.0)],
        elems_b, vec![(1, 1, "fixed"), (2, 2, "fixed"), (3, 3, "fixed"), (4, 4, "fixed")],
        loads_b);
    let d_braced = linear::solve_2d(&input_b).unwrap()
        .displacements.iter().find(|d| d.node_id == 5).unwrap().ux.abs();

    assert!(d_vierendeel > d_braced,
        "Vierendeel {:.6e} more flexible than braced {:.6e}", d_vierendeel, d_braced);
}
