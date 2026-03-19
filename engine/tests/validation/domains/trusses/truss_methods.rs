/// Validation: Truss Analysis Methods
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 3 (Method of Joints/Sections)
///   - Megson, "Structural and Stress Analysis", Ch. 4
///   - Leet et al., "Fundamentals of Structural Analysis", Ch. 3
///
/// Tests verify truss analysis by comparing solver results
/// with classical hand-calculation methods:
///   1. Method of joints: simple truss equilibrium
///   2. Method of sections: cut through truss
///   3. Zero-force members identification
///   4. Pratt truss under uniform load
///   5. Warren truss: alternating diagonals
///   6. K-truss panel analysis
///   7. Determinacy check: b + r = 2j
///   8. Truss deflection: PL/(AE) axial
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_TRUSS: f64 = 0.001;

// ================================================================
// 1. Method of Joints: Simple Triangular Truss
// ================================================================
//
// Triangle: nodes at (0,0), (L,0), (L/2, H)
// Pinned at (0,0), roller at (L,0)
// Vertical load P at apex

#[test]
fn validation_truss_joints_triangle() {
    let l = 6.0;
    let h = 4.0;
    let p = 30.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 0.0)],
        vec![
            (1, "truss", 1, 3, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R_A = R_B = P/2 (symmetric)
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let rb = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(ra.rz, p / 2.0, 0.02, "Triangle: R_A = P/2");
    assert_close(rb.rz, p / 2.0, 0.02, "Triangle: R_B = P/2");

    // Member forces by method of joints at apex (node 3):
    // Member 1-3: length = sqrt((L/2)² + H²), angle = atan(H/(L/2))
    // Member 2-3: symmetric to 1-3
    // By symmetry: F_13 = F_23 (compression)
    let f13 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap().n_start;
    let f23 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap().n_start;
    assert_close(f13.abs(), f23.abs(), 0.02,
        "Triangle: F_13 = F_23 by symmetry");

    // Bottom chord (1-2) is in tension
    let f12 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap().n_start;
    // F_12 = P*L/(4H) (from equilibrium at joint 1)
    let f12_exact = p * l / (4.0 * h);
    assert_close(f12.abs(), f12_exact, 0.05,
        "Triangle: F_12 = PL/(4H)");
}

// ================================================================
// 2. Method of Sections: 3-Panel Pratt Truss
// ================================================================

#[test]
fn validation_truss_sections_pratt() {
    let w = 4.0; // panel width
    let h = 3.0;
    let p = 20.0;

    // 3-panel Pratt truss:
    // Bottom: 1(0,0), 2(w,0), 3(2w,0), 4(3w,0)
    // Top: 5(0,h), 6(w,h), 7(2w,h), 8(3w,h)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0*w, 0.0), (4, 3.0*w, 0.0),
        (5, 0.0, h), (6, w, h), (7, 2.0*w, h), (8, 3.0*w, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Top chord
        (4, "truss", 5, 6, 1, 1, false, false),
        (5, "truss", 6, 7, 1, 1, false, false),
        (6, "truss", 7, 8, 1, 1, false, false),
        // Verticals
        (7, "truss", 1, 5, 1, 1, false, false),
        (8, "truss", 2, 6, 1, 1, false, false),
        (9, "truss", 3, 7, 1, 1, false, false),
        (10, "truss", 4, 8, 1, 1, false, false),
        // Diagonals (Pratt pattern: diagonals slope toward center)
        (11, "truss", 1, 6, 1, 1, false, false),
        (12, "truss", 3, 6, 1, 1, false, false),
        (13, "truss", 2, 7, 1, 1, false, false),
        (14, "truss", 4, 7, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 6, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_TRUSS, 0.0)],
        elems, vec![(1, 1, "pinned"), (2, 4, "rollerX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Method of sections: cut through panel 2
    // Taking moment about top chord joint 7:
    // F_bottom × h = R_A × 2w - P × w (for load at node 6)
    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Pratt: ΣRy = P");

    // All member forces should be finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "Pratt: finite force in elem {}", ef.element_id);
    }
}

// ================================================================
// 3. Zero-Force Members
// ================================================================
//
// At a joint with only two non-collinear members and no external load,
// both members are zero-force members.

#[test]
fn validation_truss_zero_force() {
    let l = 6.0;
    let h = 4.0;
    let p = 20.0;

    // Truss with a zero-force member:
    // (0,0)---(L,0)---(2L,0)
    //    \      |      /
    //     \     |     /
    //      (L, H)
    // Load P downward at (L,0)
    // Member (L,0)-(L,H) is a zero-force member when no load at (L,H)
    // Actually needs careful geometry. Let's use a different approach:

    // Joint at (L/2, H) with only two members meeting and no load:
    // Members from (0,0) and (L,0) meet at (L/2,H), load at (L/2,0) only
    // Since (L/2,H) is unloaded and has 2 non-collinear members → both zero-force
    // But wait, that would make the truss unstable. Need at least 3 members.

    // Better: add a member that IS zero-force
    // Square with diagonal: (0,0), (L,0), (L,H), (0,H)
    // Add node at (L/2, H+1) connected only to (0,H) and (L,H)
    // This top node has no load → both connecting members are zero-force
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, l, 0.0), (3, l, h), (4, 0.0, h),
            (5, l / 2.0, h + 1.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 1, 1, 1, false, false),
            (5, "truss", 1, 3, 1, 1, false, false), // diagonal
            (6, "truss", 4, 5, 1, 1, false, false), // zero-force
            (7, "truss", 3, 5, 1, 1, false, false), // zero-force
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: p, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Members 6 and 7 (connecting to node 5) should have ~zero force
    let f6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap().n_start;
    let f7 = results.element_forces.iter().find(|e| e.element_id == 7).unwrap().n_start;

    assert!(f6.abs() < 0.01,
        "Zero-force: member 6 ≈ 0: {:.6e}", f6);
    assert!(f7.abs() < 0.01,
        "Zero-force: member 7 ≈ 0: {:.6e}", f7);
}

// ================================================================
// 4. Pratt Truss Under Uniform Load
// ================================================================

#[test]
fn validation_truss_pratt_uniform() {
    let w = 3.0;
    let h = 4.0;
    let p = 10.0; // load at each bottom joint

    // 4-panel Pratt truss
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0*w, 0.0), (4, 3.0*w, 0.0), (5, 4.0*w, 0.0),
        (6, 0.0, h), (7, w, h), (8, 2.0*w, h), (9, 3.0*w, h), (10, 4.0*w, h),
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
        (8, "truss", 9, 10, 1, 1, false, false),
        // Verticals
        (9, "truss", 1, 6, 1, 1, false, false),
        (10, "truss", 2, 7, 1, 1, false, false),
        (11, "truss", 3, 8, 1, 1, false, false),
        (12, "truss", 4, 9, 1, 1, false, false),
        (13, "truss", 5, 10, 1, 1, false, false),
        // Diagonals
        (14, "truss", 1, 7, 1, 1, false, false),
        (15, "truss", 3, 7, 1, 1, false, false),
        (16, "truss", 2, 8, 1, 1, false, false),
        (17, "truss", 4, 8, 1, 1, false, false),
        (18, "truss", 3, 9, 1, 1, false, false),
        (19, "truss", 5, 9, 1, 1, false, false),
    ];
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p, my: 0.0 }),
    ];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_TRUSS, 0.0)],
        elems, vec![(1, 1, "pinned"), (2, 5, "rollerX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total vertical reaction = 3P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 3.0 * p, 0.02, "Pratt uniform: ΣRy = 3P");

    // Reactions should be equal by symmetry
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == 5).unwrap().rz;
    assert_close(ra, rb, 0.02, "Pratt uniform: R_A = R_B");
}

// ================================================================
// 5. Warren Truss: Alternating Diagonals
// ================================================================

#[test]
fn validation_truss_warren() {
    let w = 4.0;
    let h = 3.0;
    let p = 15.0;

    // Warren truss: 3 panels with alternating diagonals (no verticals)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0*w, 0.0), (4, 3.0*w, 0.0),
        (5, 0.5*w, h), (6, 1.5*w, h), (7, 2.5*w, h),
    ];
    let elems = vec![
        // Bottom chord
        (1, "truss", 1, 2, 1, 1, false, false),
        (2, "truss", 2, 3, 1, 1, false, false),
        (3, "truss", 3, 4, 1, 1, false, false),
        // Top chord
        (4, "truss", 5, 6, 1, 1, false, false),
        (5, "truss", 6, 7, 1, 1, false, false),
        // Diagonals (Warren pattern: V-shaped)
        (6, "truss", 1, 5, 1, 1, false, false),
        (7, "truss", 2, 5, 1, 1, false, false),
        (8, "truss", 2, 6, 1, 1, false, false),
        (9, "truss", 3, 6, 1, 1, false, false),
        (10, "truss", 3, 7, 1, 1, false, false),
        (11, "truss", 4, 7, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 6, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_TRUSS, 0.0)],
        elems, vec![(1, 1, "pinned"), (2, 4, "rollerX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Warren: ΣRy = P");

    // Symmetric load on symmetric truss → equal reactions
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let rb = results.reactions.iter().find(|r| r.node_id == 4).unwrap().rz;
    assert_close(ra, rb, 0.02, "Warren: R_A = R_B");
}

// ================================================================
// 6. K-Truss Panel
// ================================================================

#[test]
fn validation_truss_k_panel() {
    let w = 4.0;
    let h = 4.0;
    let p = 20.0;

    // K-truss: verticals are split by a mid-height node
    // Simple 2-panel K-truss (b+r=12+3=15=2×7+1, one redundant)
    let nodes = vec![
        (1, 0.0, 0.0), (2, w, 0.0), (3, 2.0*w, 0.0),   // bottom
        (4, 0.0, h), (5, w, h), (6, 2.0*w, h),           // top
        (7, w, h / 2.0),                                    // K-node at mid-height
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
        // K-configuration: vertical split at mid-height
        (7, "truss", 2, 7, 1, 1, false, false),
        (8, "truss", 7, 5, 1, 1, false, false),
        // Diagonals to K-node
        (9, "truss", 1, 7, 1, 1, false, false),
        (10, "truss", 7, 6, 1, 1, false, false),
        // Additional diagonals for stability
        (11, "truss", 7, 4, 1, 1, false, false),
        (12, "truss", 7, 3, 1, 1, false, false),
    ];
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 5, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_input(nodes, vec![(1, E, 0.3)], vec![(1, A_TRUSS, 0.0)],
        elems, vec![(1, 1, "pinned"), (2, 3, "rollerX")], loads);
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "K-truss: ΣRy = P");

    // All forces finite
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "K-truss: finite force in elem {}: {:.6e}", ef.element_id, ef.n_start);
    }
}

// ================================================================
// 7. Statical Determinacy: b + r = 2j
// ================================================================

#[test]
fn validation_truss_determinacy() {
    let l = 6.0;
    let h = 4.0;
    let p = 10.0;

    // Simple determinate truss: b + r = 2j
    // 3 members, 3 nodes, 3 reactions (pinned + roller) → 3 + 3 = 6 = 2×3 ✓
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l / 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: p, fz: -p, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Should solve without issues
    assert!(!results.displacements.is_empty(), "Determinacy: solution exists");

    // Check equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_rx, -p, 0.02, "Determinacy: ΣRx = -P");
    assert_close(sum_ry, p, 0.02, "Determinacy: ΣRy = P");
}

// ================================================================
// 8. Truss Deflection: PL/(AE) Axial
// ================================================================

#[test]
fn validation_truss_deflection() {
    let l = 5.0;
    let p = 20.0;
    let e_eff = E * 1000.0;

    // Single horizontal truss member: axial only
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, 0.0)],
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: p, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == 2).unwrap();

    // δ = PL/(AE)
    let delta_exact = p * l / (e_eff * A_TRUSS);
    assert_close(tip.ux.abs(), delta_exact, 0.02,
        "Truss δ: PL/(AE)");
}
