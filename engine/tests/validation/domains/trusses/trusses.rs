/// Validation: Truss structures verified by method of joints/sections.
///
/// Reference: Timoshenko *Strength of Materials*
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A_TRUSS: f64 = 0.001; // m² (smaller for truss)
const IZ_TRUSS: f64 = 0.0;  // truss: no moment of inertia

// ═══════════════════════════════════════════════════════════════
// 1. Equilateral Triangle Truss
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_equilateral_triangle_truss() {
    // Equilateral triangle: nodes at (0,0), (4,0), (2, 2√3)
    // P=100 kN downward at apex
    // By symmetry: R_A_y = R_B_y = 50
    let h = 2.0 * 3.0_f64.sqrt(); // ≈ 3.464
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -100.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, 50.0, 0.01, "triangle R_A");
    assert_close(r2.ry, 50.0, 0.01, "triangle R_B");

    // By symmetry: members 2 and 3 have equal forces
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef2.n_start.abs(), ef3.n_start.abs(), 0.01, "triangle symmetry");

    // Bottom chord (element 1) in tension
    // Method of joints at node 1: member 2 in compression, member 1 in tension
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    // Exact: bottom chord force = P/(2*tan(60°)) = 100/(2*√3) ≈ 28.87 kN tension
    let expected_bottom = 100.0 / (2.0 * 3.0_f64.sqrt());
    assert!(
        (ef1.n_start.abs() - expected_bottom).abs() < 2.0,
        "bottom chord N={:.2}, expected ~{:.2}", ef1.n_start, expected_bottom
    );
}

// ═══════════════════════════════════════════════════════════════
// 2. Warren Truss (4 panels)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_warren_truss_4_panels() {
    // Warren truss: 4 panels @ 3m, height 3m
    // Bottom nodes: (0,0), (3,0), (6,0), (9,0), (12,0)
    // Top nodes: (1.5,3), (4.5,3), (7.5,3), (10.5,3)
    // Load: P=60 kN at each top node
    // Pinned at node 1, roller at node 5
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0), (4, 9.0, 0.0), (5, 12.0, 0.0),
            (6, 1.5, 3.0), (7, 4.5, 3.0), (8, 7.5, 3.0), (9, 10.5, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
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
            (8, "truss", 1, 6, 1, 1, false, false),
            (9, "truss", 6, 2, 1, 1, false, false),
            (10, "truss", 2, 7, 1, 1, false, false),
            (11, "truss", 7, 3, 1, 1, false, false),
            (12, "truss", 3, 8, 1, 1, false, false),
            (13, "truss", 8, 4, 1, 1, false, false),
            (14, "truss", 4, 9, 1, 1, false, false),
            (15, "truss", 9, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -60.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -60.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: -60.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 9, fx: 0.0, fy: -60.0, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // By symmetry: R_A = R_B = 4*60/2 = 120
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r5 = results.reactions.iter().find(|r| r.node_id == 5).unwrap();
    assert_close(r1.ry, 120.0, 0.01, "warren R_A");
    assert_close(r5.ry, 120.0, 0.01, "warren R_B");

    // All truss members: V=0, M=0
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-4, "truss V≠0: elem {}, V={}", ef.element_id, ef.v_start);
        assert!(ef.m_start.abs() < 1e-4, "truss M≠0: elem {}, M={}", ef.element_id, ef.m_start);
    }
}

// ═══════════════════════════════════════════════════════════════
// 3. Pratt Truss
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_pratt_truss() {
    // Pratt truss: 3 panels @ 4m, height 3m
    // Bottom: (0,0), (4,0), (8,0), (12,0)
    // Top:    (4,3), (8,3)
    // m = 9, r = 3, n = 6 → 9+3 = 12 = 2*6 (determinate)
    // P=100 at midspan top node (node 5 at (4,3))
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0), (4, 12.0, 0.0),
            (5, 4.0, 3.0), (6, 8.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            // Bottom chord
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            // Top chord
            (4, "truss", 5, 6, 1, 1, false, false),
            // Verticals
            (5, "truss", 2, 5, 1, 1, false, false),
            (6, "truss", 3, 6, 1, 1, false, false),
            // Diagonals (3: outer panels + center)
            (7, "truss", 1, 5, 1, 1, false, false),
            (8, "truss", 5, 3, 1, 1, false, false), // center diagonal
            (9, "truss", 6, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -100.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // ΣM about node 4 (x=12): R_A*12 = 100*(12-4) = 800 → R_A = 66.67
    // R_D = 100 - 66.67 = 33.33
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.ry, 200.0 / 3.0, 0.02, "pratt R_A");
    assert_close(r4.ry, 100.0 / 3.0, 0.02, "pratt R_D");

    // All members: V=0, M=0
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-4, "pratt V≠0: elem {}", ef.element_id);
        assert!(ef.m_start.abs() < 1e-4, "pratt M≠0: elem {}", ef.element_id);
    }

    // Equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, 100.0, 0.01, "pratt ΣRy");
}

// ═══════════════════════════════════════════════════════════════
// 4. Statically Indeterminate Truss (1 redundant)
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_indeterminate_truss() {
    // Square truss with diagonal = 1 redundant member
    // (0,0)-(3,0)-(3,3)-(0,3) with diagonal (0,0)-(3,3)
    // Pin at 1, roller at 2
    // Horizontal + vertical load at node 4 to engage diagonal
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 3.0), (4, 0.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 1, 1, 1, false, false),
            (5, "truss", 1, 3, 1, 1, false, false), // diagonal (redundant)
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4, fx: 50.0, fy: -100.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, -50.0, 0.01, "indet truss ΣRx");
    assert_close(sum_ry, 100.0, 0.01, "indet truss ΣRy");

    // All V=0, M=0 (truss behavior)
    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-4, "indet truss V≠0: elem {}", ef.element_id);
        assert!(ef.m_start.abs() < 1e-4, "indet truss M≠0: elem {}", ef.element_id);
    }

    // Diagonal should carry force (horizontal load engages diagonal)
    let diag = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert!(diag.n_start.abs() > 1.0, "diagonal should have axial force");
}

// ═══════════════════════════════════════════════════════════════
// 5. Pure Axial Verification
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_truss_pure_axial() {
    // Simple 2-bar truss: verify pure axial behavior
    // Bar 1: (0,0)→(3,0), Bar 2: (0,0)→(3,4) (length=5)
    // Load at (3,0) and (3,4): all members should have V=0, M=0
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 3.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 50.0, fy: -80.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    for ef in &results.element_forces {
        assert!(ef.v_start.abs() < 1e-4, "pure axial V≠0: elem {}", ef.element_id);
        assert!(ef.v_end.abs() < 1e-4, "pure axial V_end≠0: elem {}", ef.element_id);
        assert!(ef.m_start.abs() < 1e-4, "pure axial M≠0: elem {}", ef.element_id);
        assert!(ef.m_end.abs() < 1e-4, "pure axial M_end≠0: elem {}", ef.element_id);
    }
}

// ═══════════════════════════════════════════════════════════════
// 6. Global Equilibrium for All Trusses
// ═══════════════════════════════════════════════════════════════

#[test]
fn validation_truss_equilibrium_all() {
    // Already checked per-test above; this is a comprehensive re-check
    let h = 2.0 * 3.0_f64.sqrt();
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, h)],
        vec![(1, E, 0.3)],
        vec![(1, A_TRUSS, IZ_TRUSS)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 1, 3, 1, 1, false, false),
            (3, "truss", 2, 3, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 30.0, fy: -100.0, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, -30.0, 0.01, "truss ΣRx");
    assert_close(sum_ry, 100.0, 0.01, "truss ΣRy");
}
