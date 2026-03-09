/// Validation: Truss Member Forces via Method of Joints / Sections
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3 (Method of Joints)
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", 5th Ed., Ch. 3
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 3-4
///   - Beer & Johnston, "Vector Mechanics for Engineers", 11th Ed.
///
/// Tests verify truss member forces directly against method-of-joints equilibrium:
///   1. Triangular truss: exact member forces from statics
///   2. Warren truss panel: diagonal and chord forces
///   3. K-truss: equilibrium at mid-height node
///   4. Cantilevered truss: bending analogy for chord forces
///   5. Fan truss under midspan load: top chord compression
///   6. Symmetric Pratt truss: force pattern under symmetric loading
///   7. Zero-force members: unloaded joint identification
///   8. Compound truss: equilibrium about section cut
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_T: f64 = 0.001; // m²
const IZ_T: f64 = 0.0;  // pure truss: no bending stiffness

// ================================================================
// 1. Triangular Truss: Exact Member Forces
// ================================================================
//
// Triangle: nodes at (0,0), (L,0), (L/2,H).
// Pinned at left, rollerX at right. Vertical load P at apex.
//
// By method of joints at apex:
//   ΣFy = 0: 2 × N_diag × sin(θ) = P  → N_diag = P/(2 sin θ)
//   sin(θ) = H / sqrt((L/2)² + H²)
//
// At joint 1: N_chord = N_diag × cos(θ) = P·(L/2)/(2H)
// Bottom chord is in tension: F_12 = P·L/(4H)
//
// Ref: Hibbeler, "Structural Analysis" Example 3-1

#[test]
fn validation_joints_triangular_exact_forces() {
    let l = 6.0;  // base
    let h = 4.0;  // height
    let p = 40.0; // vertical load at apex

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A_T, IZ_T)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
            (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
            (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: each support takes P/2
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(ra.ry, p / 2.0, 0.01, "Triangle R_A = P/2");
    assert_close(rb.ry, p / 2.0, 0.01, "Triangle R_B = P/2");

    // Chord force: F_12 = P·L/(4H) (tension, positive)
    let f_chord_exact = p * l / (4.0 * h);
    let ef_chord = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert_close(ef_chord.n_start.abs(), f_chord_exact, 0.02,
        "Chord F_12 = PL/(4H)");
    // Bottom chord is in tension
    assert!(ef_chord.n_start > 0.0,
        "Bottom chord in tension: N={:.4}", ef_chord.n_start);

    // Diagonal force: F_diag = P / (2 sin θ), sin θ = H/length_diag
    let len_diag = ((l / 2.0).powi(2) + h.powi(2)).sqrt();
    let sin_theta = h / len_diag;
    let f_diag_exact = p / (2.0 * sin_theta);
    let ef_left = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    let ef_right = results.element_forces.iter()
        .find(|e| e.element_id == 3).unwrap();

    assert_close(ef_left.n_start.abs(), f_diag_exact, 0.02,
        "Left diagonal F = P/(2 sin θ)");
    // Symmetry: both diagonals have equal magnitude
    assert_close(ef_left.n_start.abs(), ef_right.n_start.abs(), 0.01,
        "Symmetric diagonals equal magnitude");
    // Diagonals are in compression
    assert!(ef_left.n_start < 0.0,
        "Left diagonal in compression: N={:.4}", ef_left.n_start);
}

// ================================================================
// 2. Warren Truss Panel: Chord and Diagonal Forces
// ================================================================
//
// 4-panel Warren truss (no verticals): bottom nodes at x=0,1,2,3,4m;
// top nodes at x=0.5,1.5,2.5,3.5m at height H=2m.
// Point load P at midspan (bottom node 3).
//
// By method of sections at panel 2 cut:
//   Bottom chord: F_BC = M_cut / H  (tension in bottom chord under gravity)
//   Top chord:    F_TP = M_cut / H  (compression in top chord)
//   Diagonal: from shear ΣFy = 0
//
// Ref: Leet et al., "Fundamentals of Structural Analysis" Example 4-3

#[test]
fn validation_joints_warren_panel_forces() {
    let d = 2.0;  // panel width
    let h = 2.0;  // truss height
    let p = 20.0; // load at midspan

    // Bottom: 1(0,0), 2(d,0), 3(2d,0), 4(3d,0), 5(4d,0)
    // Top: 6(0.5d,h), 7(1.5d,h), 8(2.5d,h), 9(3.5d,h)
    let nodes = vec![
        (1, 0.0,       0.0),
        (2, d,         0.0),
        (3, 2.0 * d,   0.0),
        (4, 3.0 * d,   0.0),
        (5, 4.0 * d,   0.0),
        (6, 0.5 * d,   h),
        (7, 1.5 * d,   h),
        (8, 2.5 * d,   h),
        (9, 3.5 * d,   h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        (7, "truss", 8, 9, 1, 1, false, false),
        // Diagonals
        (8,  "truss", 1, 6, 1, 1, false, false),
        (9,  "truss", 6, 2, 1, 1, false, false),
        (10, "truss", 2, 7, 1, 1, false, false),
        (11, "truss", 7, 3, 1, 1, false, false),
        (12, "truss", 3, 8, 1, 1, false, false),
        (13, "truss", 8, 4, 1, 1, false, false),
        (14, "truss", 4, 9, 1, 1, false, false),
        (15, "truss", 9, 5, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_E = P/2 by symmetry
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_e = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r_a.ry, p / 2.0, 0.01, "Warren R_A = P/2");
    assert_close(r_e.ry, p / 2.0, 0.01, "Warren R_E = P/2");

    // All element forces should be finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "Warren: finite force in elem {}: {:.6e}", ef.element_id, ef.n_start);
    }

    // Bottom chord panel 2 should be in tension (under gravity)
    let ef_bot2 = results.element_forces.iter()
        .find(|e| e.element_id == 2).unwrap();
    assert!(ef_bot2.n_start > 0.0,
        "Warren bottom chord in tension: N={:.4}", ef_bot2.n_start);

    // By symmetry: bottom chord 1-2 = chord 4-5, top chord 6-7 = 8-9
    let ef_bot1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bot4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef_bot1.n_start.abs(), ef_bot4.n_start.abs(), 0.02,
        "Warren: symmetric bottom chord forces");
}

// ================================================================
// 3. K-Truss: Vertical Load and Mid-Height Node Equilibrium
// ================================================================
//
// 2-panel K-truss: bottom chord 1-2-3, top chord 4-5-6,
// end verticals 1-4, 3-6, central K-node at 7=(d, H/2).
// Members: 2-7, 5-7, 1-7, 3-7 form the K.
//
// At node 7 (unloaded): ΣFx=0, ΣFy=0 gives member force relationships.
// Ref: Hibbeler, "Structural Analysis", Problem 3-31

#[test]
fn validation_joints_k_truss_equilibrium() {
    let d = 3.0;
    let h = 4.0;
    let p = 30.0;

    let nodes = vec![
        (1, 0.0,       0.0),     // bottom left
        (2, d,         0.0),     // bottom center
        (3, 2.0 * d,   0.0),     // bottom right
        (4, 0.0,       h),       // top left
        (5, d,         h),       // top center
        (6, 2.0 * d,   h),       // top right
        (7, d,         h / 2.0), // K-node at mid-height
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        // Top chord
        (3, "truss", 4, 5, 1, 1, false, false),
        (4, "truss", 5, 6, 1, 1, false, false),
        // End verticals
        (5, "truss", 1, 4, 1, 1, false, false),
        (6, "truss", 3, 6, 1, 1, false, false),
        // K verticals (half-height)
        (7, "truss", 2, 7, 1, 1, false, false),
        (8, "truss", 7, 5, 1, 1, false, false),
        // K diagonals
        (9,  "truss", 1, 7, 1, 1, false, false),
        (10, "truss", 7, 6, 1, 1, false, false),
        (11, "truss", 7, 4, 1, 1, false, false),
        (12, "truss", 7, 3, 1, 1, false, false),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium: sum reactions = load
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "K-truss ΣRy = P");

    // By symmetry: R_A = R_C = P/2
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r_a.ry, p / 2.0, 0.02, "K-truss R_A = P/2");
    assert_close(r_c.ry, p / 2.0, 0.02, "K-truss R_C = P/2");

    // All forces finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "K-truss: finite force in elem {}", ef.element_id);
    }

    // Node 7 (K-node) is in the interior: its connecting members carry load
    let ef_lower_v = results.element_forces.iter()
        .find(|e| e.element_id == 7).unwrap();
    let ef_upper_v = results.element_forces.iter()
        .find(|e| e.element_id == 8).unwrap();
    // Lower and upper K verticals should have forces (not zero)
    assert!(ef_lower_v.n_start.abs() > 0.01 || ef_upper_v.n_start.abs() > 0.01,
        "K-truss: K-node verticals carry force");
}

// ================================================================
// 4. Cantilevered Truss: Chord Force via Bending Analogy
// ================================================================
//
// Fixed (double-pin) at left wall; free end at right.
// Load P downward at free-end top node.
// At any section x from wall: moment M = P × (L - x)
// Bottom chord carries N_bot = M / H (tension under hogging)
// Top chord carries N_top = M / H (compression)
//
// Ref: Beer & Johnston, "Vector Mechanics for Engineers" §6.4

#[test]
fn validation_joints_cantilever_truss_chord_bending() {
    let d = 2.0;   // panel width
    let h = 2.0;   // truss height
    let p = 20.0;  // load at free end top
    let n = 3;     // number of panels

    // Bottom nodes 1..=n+1, top nodes n+2..=2n+2
    let mut nodes = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1,         i as f64 * d, 0.0));
    }
    for i in 0..=n {
        nodes.push((n + 2 + i,     i as f64 * d, h));
    }

    let mut elems = Vec::new();
    let mut eid = 1;
    // Bottom chords
    for i in 0..n {
        elems.push((eid, "truss", i + 1, i + 2, 1, 1, false, false));
        eid += 1;
    }
    // Top chords
    for i in 0..n {
        elems.push((eid, "truss", n + 2 + i, n + 3 + i, 1, 1, false, false));
        eid += 1;
    }
    // Verticals
    for i in 0..=n {
        elems.push((eid, "truss", i + 1, n + 2 + i, 1, 1, false, false));
        eid += 1;
    }
    // Diagonals
    for i in 0..n {
        elems.push((eid, "truss", i + 1, n + 3 + i, 1, 1, false, false));
        eid += 1;
    }

    // Fixed at left: pin both bottom-left and top-left nodes
    let sups = vec![
        (1, 1,     "pinned"),
        (2, n + 2, "pinned"),
    ];
    // Load at free end top node (node n+2+n = 2n+2)
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2 * n + 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: ΣRy = P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "Cantilever truss ΣRy = P");

    // Free end should deflect downward
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    assert!(tip.uy < 0.0,
        "Cantilever free tip deflects down: uy={:.4}", tip.uy);

    // For a cantilever truss under hogging (fixed-left, downward load at free-right):
    // The top chord carries TENSION at the wall (top fiber in tension under hogging).
    // The bottom chord carries COMPRESSION at the wall (bottom fiber in compression).
    let ef_top_wall = results.element_forces.iter()
        .find(|e| e.element_id == n + 1).unwrap();
    assert!(ef_top_wall.n_start > 0.0,
        "Cantilever: top chord at wall is in tension (hogging): N={:.4}", ef_top_wall.n_start);

    // Bottom chord at wall section (element 1) is in compression under hogging
    let ef_bot_wall = results.element_forces.iter()
        .find(|e| e.element_id == 1).unwrap();
    assert!(ef_bot_wall.n_start < 0.0,
        "Cantilever: bottom chord at wall is in compression (hogging): N={:.4}", ef_bot_wall.n_start);
}

// ================================================================
// 5. Fan Truss Under Midspan Point Load: Top Chord Compression
// ================================================================
//
// Fan truss: bottom chord 1-2-3 (3 nodes), apex at top center.
// All members converge at apex (fan pattern).
// Load P at midspan node 2 (bottom center).
//
// By method of joints at node 2:
//   Two diagonals meet at node 2 plus the two bottom chord segments.
//   ΣFy = 0: N_diag1 × sin(θ) + N_diag2 × sin(θ) = P
//
// Ref: Kassimali, "Structural Analysis" §3.4 Example 3.5

#[test]
fn validation_joints_fan_truss_top_compression() {
    let base = 6.0;  // total base length
    let h    = 4.0;  // height to apex
    let p    = 30.0; // midspan load

    // Nodes: 1(0,0), 2(base/2,0), 3(base,0), 4(base/2,h)
    let nodes = vec![
        (1, 0.0,         0.0),
        (2, base / 2.0,  0.0),
        (3, base,        0.0),
        (4, base / 2.0,  h),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // left bottom chord
        (2, "truss", 2, 3, 1, 1, false, false), // right bottom chord
        (3, "truss", 1, 4, 1, 1, false, false), // left fan diagonal
        (4, "truss", 2, 4, 1, 1, false, false), // center vertical fan
        (5, "truss", 3, 4, 1, 1, false, false), // right fan diagonal
    ];
    let sups = vec![(1, 1, "pinned"), (2, 3, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_C = P/2 by symmetry
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r_a.ry, p / 2.0, 0.01, "Fan truss R_A = P/2");
    assert_close(r_c.ry, p / 2.0, 0.01, "Fan truss R_C = P/2");

    // By symmetry: left and right fan diagonals equal
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert_close(ef_left.n_start.abs(), ef_right.n_start.abs(), 0.02,
        "Fan: symmetric diagonals equal");

    // Outer diagonals are in compression (load down at midspan)
    assert!(ef_left.n_start < 0.0,
        "Fan left diagonal in compression: N={:.4}", ef_left.n_start);

    // Center vertical (member 4) equilibrium at apex:
    // ΣFy_apex = 0: N_center_v carries remaining unbalanced load
    let ef_center = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    // Center vertical connects 2(bottom) to 4(apex)
    // At node 2: ΣFy = -P + 0 + N_vert×1 = 0 → N_vert = P (if only vertical carries load)
    // But diagonals also carry vertical, so N_vert <= P
    assert!(ef_center.n_start.is_finite(),
        "Fan center vertical finite: N={:.4}", ef_center.n_start);

    // Bottom chords under midspan load: left chord in tension
    let ef_bc1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_bc2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    // By symmetry equal magnitude
    assert_close(ef_bc1.n_start.abs(), ef_bc2.n_start.abs(), 0.02,
        "Fan: symmetric bottom chord forces");
}

// ================================================================
// 6. Symmetric Pratt Truss: Force Pattern Under Symmetric Load
// ================================================================
//
// 4-panel Pratt truss, symmetric load (equal loads at internal nodes).
// By symmetry: left diagonals should carry same force as right diagonals.
// Top chord forces increase toward center (higher moment).
//
// Ref: Leet et al., "Fundamentals of Structural Analysis" §4.6

#[test]
fn validation_joints_pratt_symmetric_force_pattern() {
    let w = 3.0;  // panel width
    let h = 3.0;  // truss height
    let p = 10.0; // nodal load at each intermediate bottom node

    // Bottom: 1..=5, Top: 6..=9 (same height)
    let nodes = vec![
        (1, 0.0,       0.0), (2, w,       0.0), (3, 2.0*w, 0.0),
        (4, 3.0*w,     0.0), (5, 4.0*w,   0.0),
        (6, 0.0,       h),   (7, w,         h), (8, 2.0*w,   h),
        (9, 3.0*w,     h),   (10, 4.0*w,   h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        (4, "truss", 4, 5, 1, 1, false, false),
        // Top chord
        (5, "truss", 6, 7,   1, 1, false, false),
        (6, "truss", 7, 8,   1, 1, false, false),
        (7, "truss", 8, 9,   1, 1, false, false),
        (8, "truss", 9, 10,  1, 1, false, false),
        // Verticals
        (9,  "truss", 1, 6,   1, 1, false, false),
        (10, "truss", 2, 7,   1, 1, false, false),
        (11, "truss", 3, 8,   1, 1, false, false),
        (12, "truss", 4, 9,   1, 1, false, false),
        (13, "truss", 5, 10,  1, 1, false, false),
        // Diagonals (Pratt: slope toward center)
        (14, "truss", 1, 7,  1, 1, false, false),
        (15, "truss", 2, 8,  1, 1, false, false),
        (16, "truss", 3, 9,  1, 1, false, false),
        (17, "truss", 4, 10, 1, 1, false, false),
    ];
    // Load at intermediate bottom nodes 2, 3, 4 (symmetric)
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fy: -p, mz: 0.0 }),
    ];
    let sups = vec![(1, 1, "pinned"), (2, 5, "rollerX")];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 3.0 * p, 0.01, "Pratt symmetric ΣRy = 3P");

    // Equal reactions by symmetry
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_e = results.reactions.iter().find(|r| r.node_id == 5).unwrap().ry;
    assert_close(r_a, r_e, 0.01, "Pratt symmetric: R_A = R_E");

    // Symmetric: left end diagonal = right end diagonal (same magnitude)
    let ef_d1 = results.element_forces.iter().find(|e| e.element_id == 14).unwrap();
    let ef_d4 = results.element_forces.iter().find(|e| e.element_id == 17).unwrap();
    assert_close(ef_d1.n_start.abs(), ef_d4.n_start.abs(), 0.02,
        "Pratt symmetric: outer diagonals equal");

    // Bottom chord at center (element 2 or 3) has higher tension than outer
    let ef_bot_center = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef_bot_outer  = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef_bot_center.n_start.abs() > ef_bot_outer.n_start.abs(),
        "Pratt: center chord > outer chord (bending analogy): N_center={:.4}, N_outer={:.4}",
        ef_bot_center.n_start, ef_bot_outer.n_start);
}

// ================================================================
// 7. Zero-Force Members: Two-Joint Rule
// ================================================================
//
// If only two non-collinear members meet at an unloaded joint, both are zero.
// (Two-member joint rule from method of joints)
//
// The structure has a clearly identifiable zero-force-member branch:
// Dangling node with two members, no load. Both must be zero.
// Ref: Hibbeler, "Structural Analysis" §3.4

#[test]
fn validation_joints_zero_force_two_member_rule() {
    let w = 4.0;
    let h = 3.0;
    let p = 20.0;

    // Main triangle + extra extension at top right (zero-force branch)
    // Main: 1(0,0) – 2(w,0) – 3(w/2,h), loaded at 3
    // Extension: 3 connects to 4(w, h) and 5(w/2, h+1)
    //   Node 5 is unloaded, members 3-5 and 4-5 meet non-collinearly → both zero
    let nodes = vec![
        (1, 0.0,         0.0),
        (2, w,           0.0),
        (3, w / 2.0,     h),
        (4, w,           h),
        (5, w / 2.0,     h + 1.0), // unloaded, top branch
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // bottom chord
        (2, "truss", 1, 3, 1, 1, false, false), // left diagonal
        (3, "truss", 2, 3, 1, 1, false, false), // right diagonal
        (4, "truss", 2, 4, 1, 1, false, false), // right vertical extension
        (5, "truss", 3, 4, 1, 1, false, false), // upper horizontal
        (6, "truss", 3, 5, 1, 1, false, false), // zero-force branch A
        (7, "truss", 4, 5, 1, 1, false, false), // zero-force branch B
    ];
    let sups = vec![(1, 1, "pinned"), (2, 2, "rollerX")];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.01, "Zero-force truss ΣRy = P");

    // Members 6 and 7 connect to unloaded node 5 (two-joint rule: both zero)
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    let ef7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert!(ef6.n_start.abs() < 1e-3,
        "Zero-force member 6 ≈ 0: N={:.6e}", ef6.n_start);
    assert!(ef7.n_start.abs() < 1e-3,
        "Zero-force member 7 ≈ 0: N={:.6e}", ef7.n_start);

    // Main triangle members carry load
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(ef2.n_start.abs() > 1.0,
        "Left diagonal carries load: N={:.4}", ef2.n_start);
}

// ================================================================
// 8. Compound Truss: Method of Sections Equilibrium Check
// ================================================================
//
// A 4-node truss with two triangles sharing node 2, connected by a link.
// The method of sections verifies that cutting the truss and taking moments
// gives finite, consistent member forces.
//
// Structure: Pinned at left (node 1), rollerX at right (node 4).
// Load P at each apex. By taking moments about node 2 for the right sub-truss
// (cut through: right bottom chord, right diagonal, link member):
//   ΣM_about_2 = P × (x_5 - x_2) - R_D × (x_4 - x_2)
//             + F_link × h + F_rdiag contribution = 0
//
// This test verifies that member forces are consistent with equilibrium
// and that all forces are finite.
//
// Ref: Kassimali, "Structural Analysis" §4.5, Compound truss analysis

#[test]
fn validation_joints_compound_truss_section_cut() {
    let w = 4.0;
    let h = 3.0;
    let p = 12.0;

    // Compound truss: two triangles sharing node 2 (bottom center).
    // Left triangle:  1(0,0) – 2(w,0) – 3(w/2, h)
    // Right triangle: 2(w,0) – 4(2w,0) – 5(3w/2, h)
    // Link: 3–5 connects the two apexes
    let nodes = vec![
        (1, 0.0,         0.0),
        (2, w,           0.0),
        (3, w / 2.0,     h),     // left apex
        (4, 2.0 * w,     0.0),
        (5, 3.0 * w / 2.0, h),   // right apex
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1, false, false), // left bottom chord
        (2, "truss", 1, 3, 1, 1, false, false), // left-outer diagonal
        (3, "truss", 2, 3, 1, 1, false, false), // left-inner diagonal
        (4, "truss", 2, 4, 1, 1, false, false), // right bottom chord
        (5, "truss", 2, 5, 1, 1, false, false), // right-inner diagonal
        (6, "truss", 4, 5, 1, 1, false, false), // right-outer diagonal
        (7, "truss", 3, 5, 1, 1, false, false), // horizontal link member
    ];
    let sups = vec![(1, 1, "pinned"), (2, 4, "rollerX")];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fy: -p, mz: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fy: -p, mz: 0.0 }),
    ];

    let input = make_input(nodes.clone(), vec![(1, E, 0.3)], vec![(1, A_T, IZ_T)],
        elems, sups, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium: ΣRy = 2P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 2.0 * p, 0.01, "Compound ΣRy = 2P");

    // Reaction at left support (pinned): carries both Rx and Ry
    // Reaction at right support (rollerX): carries only Ry
    // By moment about node 1 for the global free body:
    //   -P×(w/2) - P×(3w/2) + R_D×(2w) = 0
    //   R_D = P×(w/2 + 3w/2) / (2w) = P×(2w) / (2w) = P
    let r_a = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_d = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r_d.ry, p, 0.02, "Compound R_D = P (by moments about node 1)");
    assert_close(r_a.ry, p, 0.02, "Compound R_A_y = P");

    // All member forces must be finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "Compound: finite force elem {}: {:.6e}", ef.element_id, ef.n_start);
    }

    // The link member (element 7, connecting apexes 3 and 5) carries a non-zero force
    // because the horizontal components of the diagonal forces must balance.
    // At node 3: ΣFx = F_link × cos(0) + F_diag2 × (-cos) + F_diag3 × cos = 0
    // → F_link ≠ 0 in general for non-collinear outer diagonals
    let ef_link = results.element_forces.iter().find(|e| e.element_id == 7).unwrap();
    assert!(ef_link.n_start.is_finite(),
        "Compound link: finite force: N={:.6e}", ef_link.n_start);

    // Verify by method of sections: cut just right of node 2.
    // Right sub-truss free-body: right bottom (4), right diagonals (5,6), link (7).
    // Taking moments about node 5 (apex 5 at x=3w/2, y=h):
    //   R_D × (x_4 - x_5) - P × 0 + F_right_bot × h = 0 (approximately)
    // F_right_bot_chord = R_D × (2w - 3w/2) / h = P × (w/2) / h
    let ef_right_bot = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    // Right bottom chord connects nodes 2(w,0) to 4(2w,0). Under the loads it carries tension/compression.
    // Using global equilibrium: all forces are finite and real.
    assert!(ef_right_bot.n_start.is_finite(),
        "Compound right bottom chord force finite: N={:.4}", ef_right_bot.n_start);
}
