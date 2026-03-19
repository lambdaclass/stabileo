/// Validation: Extended Truss Problems from Kassimali, "Structural Analysis" (6th Ed.)
///
/// References:
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 4 (Plane Trusses)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 6 (Deflections of Trusses)
///   - Kassimali, "Structural Analysis", 6th Ed., Ch. 17 (Matrix Stiffness Method)
///
/// All truss elements modeled as frame elements with hinge_start=true, hinge_end=true
/// and IZ = 1e-8 (tiny but non-zero to avoid singular stiffness).
///
/// Tests:
///   1. Triangular truss with inclined load: method of joints exact solution
///   2. Symmetric triangular truss: vertical load at apex
///   3. Cantilever truss (2-panel): tip-loaded, exact diagonal force
///   4. Parallel-chord truss (3-panel): uniform bottom-chord loading
///   5. Asymmetric triangular truss: horizontal load only
///   6. Diamond (lozenge) truss: single vertical load at apex
///   7. Right-triangle truss: three-member, exact force decomposition
///   8. Four-bar fan truss: symmetric apex load, equilibrium check
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

/// E in MPa (solver internally multiplies by 1000 -> E_eff in kN/m^2)
const E: f64 = 200_000.0;
/// Cross-section area (m^2)
const A: f64 = 0.01;
/// Small but non-zero moment of inertia for hinged truss elements
const IZ: f64 = 1e-8;

// ================================================================
// 1. Triangular Truss with Inclined Load (Kassimali style)
// ================================================================
//
// Geometry (3 nodes, 3 members — simple triangle):
//   Node 1: (0, 0) -- pinned support
//   Node 2: (6, 0) -- rollerX support
//   Node 3: (3, 4) -- loaded joint
//
// Members: 1-3 (left), 2-3 (right), 1-2 (bottom chord)
// Load at node 3: Fx = 12 kN, Fy = -24 kN
//
// Reactions by statics (cross-product z-component for moment about node 1):
//   r=(3,4), F=(12,-24): Mz = 3*(-24) - 4*12 = -72 - 48 = -120
//   R2y at (6,0): Mz = 6*R2y
//   ΣM = -120 + 6*R2y = 0 → R2y = 20 kN
//   ΣFy: R1y + 20 - 24 = 0 → R1y = 4 kN
//   ΣFx: R1x + 12 = 0 → R1x = -12 kN
//
// At joint 3 (3,4), method of joints:
//   Member 1-3: direction from 3 to 1 = (-3,-4)/5
//   Member 2-3: direction from 3 to 2 = (3,-4)/5
//   ΣFx at 3: F_13*(-3/5) + F_23*(3/5) + 12 = 0  ... (i)
//   ΣFy at 3: F_13*(-4/5) + F_23*(-4/5) - 24 = 0  ... (ii)
//   From (ii): F_13 + F_23 = -24*(5/4) = -30
//   From (i): -F_13 + F_23 = -12*(5/3) = -20
//   Adding: 2*F_23 = -50 → F_23 = -25 kN (compression)
//   Subtracting: 2*F_13 = -10 → F_13 = -5 kN (compression)
//
// At joint 1, bottom chord (R1x=-12, R1y=4):
//   ΣFy at 1: 4 + F_13*(4/5) = 0 → F_13 = -5 ✓
//   ΣFx at 1: -12 + F_13*(3/5) + F_12 = 0
//     -12 + (-5)*(3/5) + F_12 = 0 → F_12 = 12 + 3 = 15 kN (tension)

#[test]
fn validation_kassimali_ext_1_triangular_truss_inclined_load() {
    let fx: f64 = 12.0;
    let fz: f64 = 24.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 3.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (2, "frame", 2, 3, 1, 1, true, true), // right diagonal
            (3, "frame", 1, 2, 1, 1, true, true), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx,
            fz: -fz,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // ΣM about 1 (CCW+): Fy at (3,4) → r×F = (3)(−24)−(4)(0) not applicable in 2D scalar form.
    // Scalar moments about node 1 (0,0):
    //   Fy=-24 at x=3: moment = (-24)*3 ... use cross product z-component:
    //   r=(3,4), F=(12,-24): Mz = 3*(-24) - 4*12 = -72 - 48 = -120
    //   R2y at (6,0): Mz = 6*R2y
    //   ΣM = -120 + 6*R2y = 0 → R2y = 20
    //   ΣFy: R1y + 20 - 24 = 0 → R1y = 4
    assert_close(r2.rz, 20.0, 0.03, "Triang inclined: R2y = 20 kN");
    assert_close(r1.rz, 4.0, 0.03, "Triang inclined: R1y = 4 kN");
    assert_close(r1.rx, -12.0, 0.03, "Triang inclined: R1x = -12 kN");

    // Member forces
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    assert_close(ef1.n_start, -5.0, 0.03, "Triang inclined: F_13 = -5 kN");
    assert_close(ef2.n_start, -25.0, 0.03, "Triang inclined: F_23 = -25 kN");
    assert_close(ef3.n_start, 15.0, 0.03, "Triang inclined: F_12 = 15 kN");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, fz, 0.02, "Triang inclined: ΣRy = Fy");
}

// ================================================================
// 2. Symmetric Triangular Truss (Vertical Load at Apex)
// ================================================================
//
// Geometry:
//   Node 1: (0, 0) -- pinned
//   Node 2: (8, 0) -- rollerX
//   Node 3: (4, 3) -- loaded apex
//
// Members: 1-3, 2-3, 1-2
// Load: Fy = -36 kN at node 3
//
// By symmetry: R1y = R2y = 18 kN, R1x = 0
//
// At node 3 (method of joints):
//   L_13 = L_23 = 5, sin = 3/5, cos = 4/5
//   By symmetry F_13 = F_23
//   ΣFy: 2*F*(-3/5) - 36 = 0 → F = -30 kN (compression)
//
// At node 1: ΣFx: R1x + F_13*(4/5) + F_12 = 0
//   0 + (-30)*(4/5) + F_12 = 0 → F_12 = 24 kN (tension)

#[test]
fn validation_kassimali_ext_2_symmetric_triangle_apex_load() {
    let p: f64 = 36.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 8.0, 0.0), (3, 4.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 1, 2, 1, 1, true, true), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "Symm triangle: R1y = P/2");
    assert_close(r2.rz, p / 2.0, 0.02, "Symm triangle: R2y = P/2");

    // Diagonals: F = -30 kN (compression)
    let f_exact: f64 = -p / (2.0 * 3.0 / 5.0); // -36/1.2 = -30
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start, f_exact, 0.03, "Symm triangle: F_13 = -30 kN");
    assert_close(ef2.n_start, f_exact, 0.03, "Symm triangle: F_23 = -30 kN");

    // Symmetry: equal forces
    assert_close(
        ef1.n_start.abs(),
        ef2.n_start.abs(),
        0.01,
        "Symm triangle: |F_13| = |F_23|",
    );

    // Bottom chord: F_12 = 24 kN (tension)
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(ef3.n_start, 24.0, 0.03, "Symm triangle: F_12 = 24 kN");
}

// ================================================================
// 3. Cantilever Truss (2-Panel, Tip Load)
// ================================================================
//
// A cantilever truss projecting from a wall.
//   Node 1: (0, 0) -- pinned (wall)
//   Node 2: (0, 3) -- rollerY (wall, vertical slide)
//   Node 3: (4, 0) -- free (tip, bottom chord)
//   Node 4: (4, 3) -- loaded (tip, top chord)
//
// Members:
//   1: 1-3 (bottom chord, horizontal)
//   2: 2-4 (top chord, horizontal)
//   3: 1-2 (left vertical, at wall)
//   4: 3-4 (right vertical, at tip)
//   5: 1-4 (diagonal)
//
// Load: Fy = -15 kN at node 4
//
// Joint 3 (4,0): no external load, connects to 1-3 (horiz) and 3-4 (vert)
//   ΣFy at 3: F_34 = 0 (zero-force member)
//   ΣFx at 3: F_13 = 0 (zero-force member)
//
// Joint 4 (4,3) with F_34=0:
//   Members: 2-4 (along -x), 3-4 (along -y, zero), 1-4 (along (-4,-3)/5)
//   ΣFy: F_14*(-3/5) - 15 = 0 → F_14 = -25 kN (compression)
//   ΣFx: F_24*(-1) + F_14*(-4/5) = 0 → F_24 = 20 kN (tension)

#[test]
fn validation_kassimali_ext_3_cantilever_truss_2panel() {
    let p: f64 = 15.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 0.0, 3.0),
            (3, 4.0, 0.0),
            (4, 4.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // bottom chord
            (2, "frame", 2, 4, 1, 1, true, true), // top chord
            (3, "frame", 1, 2, 1, 1, true, true), // left vertical (at wall)
            (4, "frame", 3, 4, 1, 1, true, true), // right vertical (at tip)
            (5, "frame", 1, 4, 1, 1, true, true), // diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerY")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Cantilever truss: ΣRy = P");

    // Diagonal 1-4: F_14 = -25 kN (compression)
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert_close(ef5.n_start, -25.0, 0.03, "Cantilever truss: F_14 = -25 kN");

    // Top chord 2-4: F_24 = 20 kN (tension)
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef2.n_start, 20.0, 0.03, "Cantilever truss: F_24 = 20 kN");

    // Right vertical 3-4: zero-force member
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert!(
        ef4.n_start.abs() < 0.5,
        "Cantilever truss: F_34 zero-force member, got {:.4}",
        ef4.n_start
    );

    // Bottom chord 1-3: zero-force member
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(
        ef1.n_start.abs() < 0.5,
        "Cantilever truss: F_13 zero-force member, got {:.4}",
        ef1.n_start
    );
}

// ================================================================
// 4. Parallel-Chord Truss (3-Panel, Uniform Load)
// ================================================================
//
// Simply-supported parallel-chord truss with 3 panels.
// L = 12 m (3 panels x 4 m), H = 3 m
//
// Bottom: 1(0,0), 2(4,0), 3(8,0), 4(12,0)
// Top:    5(0,3), 6(4,3), 7(8,3), 8(12,3)
//
// Supports: Node 1 pinned, Node 4 rollerX
// Load: P = 20 kN downward at each internal bottom node (2, 3)
//
// Reactions: Symmetric → R1y = R4y = 20 kN (total = 40)
//
// Beam analogy for chord forces:
//   M at x=4: M = R1y*4 = 80 kN·m
//   Bottom chord: F = M/H = 80/3 ≈ 26.667 kN (tension)
//   Top chord: F = -M/H ≈ -26.667 kN (compression)

#[test]
fn validation_kassimali_ext_4_parallel_chord_3panel() {
    let w: f64 = 4.0;
    let h: f64 = 3.0;
    let p: f64 = 20.0;

    let nodes = vec![
        (1, 0.0, 0.0),
        (2, w, 0.0),
        (3, 2.0 * w, 0.0),
        (4, 3.0 * w, 0.0),
        (5, 0.0, h),
        (6, w, h),
        (7, 2.0 * w, h),
        (8, 3.0 * w, h),
    ];

    let elems = vec![
        // Bottom chord
        (1, "frame", 1, 2, 1, 1, true, true),
        (2, "frame", 2, 3, 1, 1, true, true),
        (3, "frame", 3, 4, 1, 1, true, true),
        // Top chord
        (4, "frame", 5, 6, 1, 1, true, true),
        (5, "frame", 6, 7, 1, 1, true, true),
        (6, "frame", 7, 8, 1, 1, true, true),
        // Verticals
        (7, "frame", 1, 5, 1, 1, true, true),
        (8, "frame", 2, 6, 1, 1, true, true),
        (9, "frame", 3, 7, 1, 1, true, true),
        (10, "frame", 4, 8, 1, 1, true, true),
        // Diagonals (Pratt-style: from top outer toward bottom center)
        (11, "frame", 5, 2, 1, 1, true, true), // left panel diagonal
        (12, "frame", 6, 3, 1, 1, true, true), // center-left diagonal
        (13, "frame", 8, 3, 1, 1, true, true), // right panel diagonal (mirror)
    ];

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 }),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions: R1y = R4y = P = 20 kN
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();
    assert_close(r1.rz, p, 0.02, "3-panel: R1y = P");
    assert_close(r4.rz, p, 0.02, "3-panel: R4y = P");

    // Total equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, 2.0 * p, 0.02, "3-panel: ΣRy = 2P");

    // Bottom chord at center (member 2: 2->3) should be in tension
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef2.n_start > 0.0,
        "3-panel: center bottom chord in tension: N={:.4}",
        ef2.n_start
    );

    // Top chord at center (member 5: 6->7) should be in compression
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert!(
        ef5.n_start < 0.0,
        "3-panel: center top chord in compression: N={:.4}",
        ef5.n_start
    );

    // Beam analogy: M at x=4 = R1y*4 = 80 kN·m
    let m_section: f64 = p * w; // 20 * 4 = 80
    let f_chord_expected: f64 = m_section / h; // 80/3 ≈ 26.667
    assert_close(
        ef2.n_start,
        f_chord_expected,
        0.05,
        "3-panel: F_bottom = M/H",
    );
    assert_close(
        ef5.n_start,
        -f_chord_expected,
        0.05,
        "3-panel: F_top = -M/H",
    );
}

// ================================================================
// 5. Asymmetric Triangular Truss with Horizontal Load Only
// ================================================================
//
// Geometry (3 nodes, 3 members):
//   Node 1: (0, 0) -- pinned
//   Node 2: (6, 0) -- rollerX
//   Node 3: (2, 4) -- loaded (off-center apex)
//
// Members: 1-3 (left), 2-3 (right), 1-2 (bottom chord)
// Load: Fx = 30 kN at node 3
//
// Reactions (cross-product z-component for moment about node 1):
//   r=(2,4), F=(30,0): Mz = 2*0 - 4*30 = -120
//   R2y at (6,0): Mz = 6*R2y
//   ΣM = -120 + 6*R2y = 0 → R2y = 20
//   ΣFy: R1y + 20 = 0 → R1y = -20
//   ΣFx: R1x + 30 = 0 → R1x = -30
//
// At joint 3 (2,4):
//   Member 1-3: dir 3→1 = (-2,-4)/sqrt(20) = (-1,-2)/sqrt(5)
//     L_13 = sqrt(4+16) = sqrt(20) = 2*sqrt(5)
//   Member 2-3: dir 3→2 = (4,-4)/sqrt(32) = (1,-1)/sqrt(2)
//     L_23 = sqrt(16+16) = 4*sqrt(2)
//
//   ΣFy at 3: F_13*(-2/sqrt(5)) + F_23*(-1/sqrt(2)) = 0
//     → F_13 = -F_23 * sqrt(5)/(sqrt(2)*2) = -F_23*sqrt(5)/(2*sqrt(2))  ... (a)
//
//   ΣFx at 3: F_13*(-1/sqrt(5)) + F_23*(1/sqrt(2)) + 30 = 0  ... (b)
//
//   Sub (a) into (b):
//     [-F_23*sqrt(5)/(2*sqrt(2))]*(-1/sqrt(5)) + F_23/sqrt(2) + 30 = 0
//     F_23/(2*sqrt(2)) + F_23/sqrt(2) + 30 = 0
//     F_23 * [1/(2*sqrt(2)) + 1/sqrt(2)] + 30 = 0
//     F_23 * [1 + 2]/(2*sqrt(2)) + 30 = 0
//     F_23 * 3/(2*sqrt(2)) = -30
//     F_23 = -20*sqrt(2) ≈ -28.284 (compression)
//
//   F_13 = -(-20*sqrt(2))*sqrt(5)/(2*sqrt(2)) = 20*sqrt(5)/2 = 10*sqrt(5) ≈ 22.361 (tension)
//
// At joint 1: ΣFx: R1x + F_13*(1/sqrt(5)) + F_12 = 0
//   -30 + 10*sqrt(5)*(1/sqrt(5)) + F_12 = 0
//   -30 + 10 + F_12 = 0 → F_12 = 20 kN (tension)

#[test]
fn validation_kassimali_ext_5_asymmetric_horizontal_load() {
    let fx: f64 = 30.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 2.0, 4.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (2, "frame", 2, 3, 1, 1, true, true), // right diagonal
            (3, "frame", 1, 2, 1, 1, true, true), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx,
            fz: 0.0,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    // ΣM about 1: r=(2,4), F=(30,0): Mz = 2*0 - 4*30 = -120
    //   R2y at (6,0): Mz = 6*R2y
    //   -120 + 6*R2y = 0 → R2y = 20
    //   ΣFy: R1y + 20 = 0 → R1y = -20
    assert_close(r1.rx, -30.0, 0.02, "Asymm horiz: R1x = -30");
    assert_close(r2.rz, 20.0, 0.03, "Asymm horiz: R2y = 20");
    assert_close(r1.rz, -20.0, 0.03, "Asymm horiz: R1y = -20");

    // Member forces
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // F_13 = 10*sqrt(5) ≈ 22.361 (tension)
    let f13_expected: f64 = 10.0 * 5.0_f64.sqrt();
    assert_close(ef1.n_start, f13_expected, 0.03, "Asymm horiz: F_13 = 10*sqrt(5)");

    // F_23 = -20*sqrt(2) ≈ -28.284 (compression)
    let f23_expected: f64 = -20.0 * 2.0_f64.sqrt();
    assert_close(ef2.n_start, f23_expected, 0.03, "Asymm horiz: F_23 = -20*sqrt(2)");

    // F_12 = 20 kN (tension)
    assert_close(ef3.n_start, 20.0, 0.03, "Asymm horiz: F_12 = 20 kN");

    // Horizontal equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -fx, 0.02, "Asymm horiz: ΣRx = -Fx");
}

// ================================================================
// 6. Diamond (Lozenge) Truss with Vertical Apex Load
// ================================================================
//
// Geometry (diamond shape, 4 nodes, 6 members — 1x indeterminate):
//   Node 1: (0, 0) -- left vertex (pinned)
//   Node 2: (3, 2) -- top vertex (loaded)
//   Node 3: (6, 0) -- right vertex (rollerX)
//   Node 4: (3, -2) -- bottom vertex (free)
//
// Members: 1-2, 2-3, 3-4, 4-1 (four sides) + 1-3, 2-4 (diagonals)
// Load: Fy = -10 kN at node 2
//
// By symmetry about x=3: R1y = R3y = 5, R1x = 0
// m + r = 6 + 3 = 9, 2j = 8 → 1x indeterminate (forces depend on EA)
//
// Check reactions and symmetry only.

#[test]
fn validation_kassimali_ext_6_diamond_truss() {
    let p: f64 = 10.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 3.0, 2.0),
            (3, 6.0, 0.0),
            (4, 3.0, -2.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // upper-left
            (2, "frame", 2, 3, 1, 1, true, true), // upper-right
            (3, "frame", 3, 4, 1, 1, true, true), // lower-right
            (4, "frame", 4, 1, 1, 1, true, true), // lower-left
            (5, "frame", 1, 3, 1, 1, true, true), // horizontal diagonal
            (6, "frame", 2, 4, 1, 1, true, true), // vertical diagonal
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, p / 2.0, 0.02, "Diamond: R1y = P/2");
    assert_close(r3.rz, p / 2.0, 0.02, "Diamond: R3y = P/2");
    assert_close(r1.rx, 0.0, 0.02, "Diamond: R1x = 0");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Diamond: ΣRy = P");

    // Symmetry: |F_12| = |F_23| and |F_34| = |F_41|
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    assert_close(
        ef1.n_start.abs(),
        ef2.n_start.abs(),
        0.02,
        "Diamond: |F_12| = |F_23|",
    );
    assert_close(
        ef3.n_start.abs(),
        ef4.n_start.abs(),
        0.02,
        "Diamond: |F_34| = |F_41|",
    );

    // Vertical diagonal (member 6: 2-4) should carry compression
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert!(
        ef6.n_start < 0.0,
        "Diamond: vertical diagonal in compression: N={:.4}",
        ef6.n_start
    );

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "Diamond: finite force elem {}: {:.6e}",
            ef.element_id,
            ef.n_start
        );
    }
}

// ================================================================
// 7. Right-Triangle Truss (Three Members, Exact Decomposition)
// ================================================================
//
// Geometry:
//   Node 1: (0, 0) -- pinned
//   Node 2: (4, 0) -- rollerX
//   Node 3: (0, 3) -- loaded
//
// Members: 1-3 (vertical), 2-3 (hypotenuse), 1-2 (bottom chord)
// Load: Fx = 20 kN at node 3
//
// Reactions:
//   ΣM about 1 (CCW positive):
//     Fx = 20 at (0,3): moment = 20 * 3 = 60 (rightward at height 3, CCW about origin)
//     R2y at (4,0): moment = R2y * 4
//     60 + R2y * 4 = 0 → R2y = -15 (downward)
//   ΣFy: R1y - 15 = 0 → R1y = 15
//   ΣFx: R1x + 20 = 0 → R1x = -20
//
// At joint 3 (0,3):
//   Members: 1-3 (dir 3→1 = (0,-1)), 2-3 (dir 3→2 = (4,-3)/5)
//   ΣFx: F_23*(4/5) + 20 = 0 → F_23 = -25 kN (compression)
//   ΣFy: F_13*(-1) + F_23*(-3/5) = 0
//         F_13 = -(-25)*(3/5) = 15 kN (tension)
//
// At joint 1 (0,0):
//   Members: 1-3 (dir 1→3 = (0,1)), 1-2 (dir 1→2 = (1,0))
//   ΣFx: R1x + F_12 = 0 → F_12 = -R1x = 20 kN (tension)
//   ΣFy: R1y + F_13_component ...
//   Actually the force on node 1 from member 1-3: if F_13 = 15 (tension),
//   it pulls node 1 toward node 3, i.e., upward component = 15.
//   ΣFy at 1: R1y + F_13*(0→3 y-component) = R1y - F_13? No.
//   The convention: n_start = axial force at start node. Positive = tension.
//   At node 1 (start of member 1-3), tension means the member pulls inward
//   (toward node 3), so the force on node 1 is toward 3 = (0,1)*15.
//   ΣFy at 1: 15 + 15 = 30? That's wrong.
//
//   Actually R1y = 15 (upward reaction) and the member pulls node 1 upward
//   by 15, which gives +30 net. That means the member must push down.
//   Let me reconsider: F_13 from the joint analysis at node 3 was 15 meaning
//   the member is in tension. But let me verify at node 1:
//   ΣFy at 1: R1y + F_13_on_1 + F_12_on_1 = 0
//   F_12 is horizontal, contributes 0 to y.
//   F_13 tension: pulls 1 toward 3, i.e., force = (0,3)/3 * 15 = (0,15)
//   ΣFy at 1: 15 + 15 ≠ 0, contradiction!
//
//   The issue is that the member force at node 1 from a tension member
//   1-3 is INWARD, i.e., it pulls node 1 toward the member interior.
//   So F on node 1 from member 1-3 = F_13 * (unit vector from 1 to 3)
//                                   = 15 * (0, 1) = (0, 15)
//   Then ΣFy at 1: R1y + 15 = 0 → R1y = -15? But we computed R1y = 15.
//
//   Let me recheck the moment equation.
//   ΣM about 1: Fx acts at (0,3). The moment of a horizontal force about
//   origin = Fx * y = 20 * 3 = 60. Direction: Fx is rightward at y=3.
//   Using r × F: r = (0,3), F = (20,0): moment = 0*0 - 3*20 = -60 (CW).
//   R2y acts at (4,0): r = (4,0), F = (0,R2y): moment = 4*R2y - 0 = 4*R2y.
//   ΣM = -60 + 4*R2y = 0 → R2y = 15.
//   ΣFy: R1y + 15 = 0 → R1y = -15 (downward!)
//   Wait no. R2y is the reaction, which is upward when positive.
//   So R2y = 15 (upward), and ΣFy: R1y + R2y = 0 → R1y = -15 (downward).
//
//   Hmm, but there's no vertical applied load! ΣFy of external loads = 0.
//   So R1y + R2y = 0, which gives R1y = -R2y.
//   R2y = 15 → R1y = -15.
//
//   At joint 3: ΣFy: F_13*(-1) + F_23*(-3/5) = 0
//   F_23 = -25 (from ΣFx), so F_13*(-1) + (-25)*(-3/5) = 0
//   -F_13 + 15 = 0 → F_13 = 15 (tension)
//
//   At joint 1: F_13 = 15 tension pulls node 1 toward node 3 (upward)
//     ΣFy at 1: R1y + F_13*sin(up) = -15 + 15 = 0 ✓
//   Good! R1y = -15.
//
//   ΣFx at 1: R1x + F_12 = 0 → F_12 = 20 (tension)
//   R1x = -20, so F_12 = 20 ✓

#[test]
fn validation_kassimali_ext_7_right_triangle_truss() {
    let fx: f64 = 20.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 0.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 3, 1, 1, true, true), // vertical bar
            (2, "frame", 2, 3, 1, 1, true, true), // hypotenuse
            (3, "frame", 1, 2, 1, 1, true, true), // bottom chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3,
            fx,
            fz: 0.0,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();

    assert_close(r1.rx, -20.0, 0.02, "Right-tri: R1x = -20");
    assert_close(r1.rz, -15.0, 0.03, "Right-tri: R1y = -15");
    assert_close(r2.rz, 15.0, 0.03, "Right-tri: R2y = 15");

    // Member forces
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();

    // F_13 = 15 kN (tension), F_23 = -25 kN (compression), F_12 = 20 kN (tension)
    assert_close(ef1.n_start, 15.0, 0.03, "Right-tri: F_13 = 15 kN (tension)");
    assert_close(ef2.n_start, -25.0, 0.03, "Right-tri: F_23 = -25 kN (compression)");
    assert_close(ef3.n_start, 20.0, 0.03, "Right-tri: F_12 = 20 kN (tension)");

    // Equilibrium check: no vertical applied load, so ΣRy = 0
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert!(
        sum_ry.abs() < 0.1,
        "Right-tri: ΣRy = 0 (no vertical load), got {:.4}",
        sum_ry
    );
}

// ================================================================
// 8. Four-Bar Fan Truss (Symmetric Apex Load)
// ================================================================
//
// A fan-style truss with bars radiating from a loaded apex to base.
//   Node 1: (0, 0) -- pinned
//   Node 2: (4, 0) -- rollerX
//   Node 3: (8, 0) -- rollerX
//   Node 4: (4, 3) -- loaded apex
//
// Members: 1-4, 2-4, 3-4 (radiating), 1-2, 2-3 (bottom chord)
// Load: Fy = -30 kN at node 4
//
// Structure is 1x indeterminate (m+r = 5+4 = 9, 2j = 8).
// By symmetry: R1y = R3y, R1x = 0.
// Check equilibrium and symmetry.

#[test]
fn validation_kassimali_ext_8_fan_truss_symmetric() {
    let p: f64 = 30.0;

    let input = make_input(
        vec![
            (1, 0.0, 0.0),
            (2, 4.0, 0.0),
            (3, 8.0, 0.0),
            (4, 4.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 4, 1, 1, true, true), // left diagonal
            (2, "frame", 2, 4, 1, 1, true, true), // center vertical
            (3, "frame", 3, 4, 1, 1, true, true), // right diagonal
            (4, "frame", 1, 2, 1, 1, true, true), // bottom chord left
            (5, "frame", 2, 3, 1, 1, true, true), // bottom chord right
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX"), (3, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 4,
            fx: 0.0,
            fz: -p,
            my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Global vertical equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p, 0.02, "Fan truss: ΣRy = P");

    // Symmetric reactions: R1y = R3y
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.rz, r3.rz, 0.02, "Fan truss: R1y = R3y (symmetry)");

    // No horizontal reaction at pinned support (symmetric)
    assert_close(r1.rx, 0.0, 0.02, "Fan truss: R1x = 0 (symmetric)");

    // Symmetric member forces: |F_14| = |F_34|
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert_close(
        ef1.n_start.abs(),
        ef3.n_start.abs(),
        0.02,
        "Fan truss: |F_14| = |F_34|",
    );

    // Diagonals in compression
    assert!(
        ef1.n_start < 0.0,
        "Fan truss: left diagonal in compression: N={:.4}",
        ef1.n_start
    );
    assert!(
        ef3.n_start < 0.0,
        "Fan truss: right diagonal in compression: N={:.4}",
        ef3.n_start
    );

    // Center vertical in compression
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert!(
        ef2.n_start < 0.0,
        "Fan truss: center vertical in compression: N={:.4}",
        ef2.n_start
    );

    // Bottom chords: symmetric |F_12| = |F_23|
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert_close(
        ef4.n_start.abs(),
        ef5.n_start.abs(),
        0.02,
        "Fan truss: |F_12| = |F_23| (symmetric bottom chord)",
    );

    // All forces finite
    for ef in &results.element_forces {
        assert!(
            ef.n_start.is_finite(),
            "Fan truss: finite force elem {}: {:.6e}",
            ef.element_id,
            ef.n_start
        );
    }
}
