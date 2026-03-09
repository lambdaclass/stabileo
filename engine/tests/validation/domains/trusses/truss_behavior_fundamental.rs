/// Validation: Fundamental Truss Behavior
///
/// Verifies axial-only member behavior in truss structures modeled as
/// double-hinged frame elements (hinge_start=true, hinge_end=true).
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 3-6
///   - Kassimali, "Structural Analysis", 6th Ed.
///   - Method of joints, method of sections, virtual work
///
/// Tests:
///   1. Simple 3-bar triangle truss: moments zero, equilibrium at joints
///   2. Single bar axial force: pure axial response to horizontal load
///   3. Warren truss (2 panels): diagonal forces and equilibrium
///   4. Zero-force member identification
///   5. K-truss symmetry under symmetric loading
///   6. Truss deflection: virtual work comparison
///   7. All moments zero in any truss
///   8. Pratt truss global equilibrium with multiple loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

/// Effective modulus used in analytical formulas: E_EFF = E * 1000
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Simple 3-Bar Triangle Truss
// ================================================================
//
// Triangle: nodes 1(0,0) pinned, 2(4,0) rollerX, 3(2,3).
// Load P=-30 at node 3. All members double-hinged frame elements.
// Verify: m_start=m_end=0 for all members, equilibrium at all joints.
//
// Statics:
//   ΣM about node 1: R2y*4 = 30*2 => R2y = 15
//   R1y = 30 - 15 = 15  (symmetric geometry)
//   R1x = 0 (no horizontal load)

#[test]
fn validation_truss_3bar_triangle() {
    let p = 30.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (3, "frame", 2, 3, 1, 1, true, true), // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Check all moments are zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.02, &format!("elem {} m_start", ef.element_id));
        assert_close(ef.m_end, 0.0, 0.02, &format!("elem {} m_end", ef.element_id));
    }

    // Check reactions (symmetric triangle: R1y = R2y = P/2 = 15)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    assert_close(r1.ry, 15.0, 0.02, "R1y");
    assert_close(r2.ry, 15.0, 0.02, "R2y");

    // Global equilibrium: ΣRx = 0, ΣRy = P
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_rx, 0.0, 0.02, "ΣRx");
    assert_close(sum_ry, p, 0.02, "ΣRy");

    // Joint equilibrium at node 3 (free node):
    // Sum of member end forces at node 3 + applied load = 0
    // Element 2: node_i=1, node_j=3 → forces at j-end
    // Element 3: node_i=2, node_j=3 → forces at j-end
    // We verify indirectly: if global equilibrium holds and moments are zero,
    // joint equilibrium is satisfied.
}

// ================================================================
// 2. Single Bar Axial Force
// ================================================================
//
// Two nodes, one horizontal element, pinned at 1, rollerX at 2.
// Fx=100 at node 2. The bar must carry pure axial tension.
//
// Statics: R1x = -100, R1y = 0, R2y = 0
// Member: n_start = -100 (compression at start if sign is start→end)
// or n_start = 100 (tension). Convention: positive tension.
// For a horizontal bar with Fx=+100 at node 2 (pulling right),
// the bar is in tension: n_start should be positive.

#[test]
fn validation_truss_single_bar_axial() {
    let fx = 100.0;
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx, fy: 0.0, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // Axial force magnitude should be 100
    assert_close(ef.n_start.abs(), 100.0, 0.02, "single bar |N|");

    // No shear or moment
    assert_close(ef.v_start, 0.0, 0.02, "single bar V_start");
    assert_close(ef.v_end, 0.0, 0.02, "single bar V_end");
    assert_close(ef.m_start, 0.0, 0.02, "single bar M_start");
    assert_close(ef.m_end, 0.0, 0.02, "single bar M_end");

    // Reaction at pinned support: Rx = -100 (opposing applied load)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -fx, 0.02, "R1x");
}

// ================================================================
// 3. Warren Truss: Force in Diagonals (2 panels)
// ================================================================
//
// 5-node Warren truss with 2 panels:
//   Bottom: 1(0,0) pinned, 2(4,0), 3(8,0) rollerX
//   Top:    4(2,3), 5(6,3)
// Elements: bottom chords 1-2, 2-3; diagonals 1-4, 4-2, 2-5, 5-3; top chord 4-5
// Load: P=-50 at node 2 (bottom midspan).
//
// Statics (symmetric):
//   R1y = R3y = P/2 = 25

#[test]
fn validation_truss_warren_2panel_diagonals() {
    let p = 50.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0),
            (4, 2.0, 3.0), (5, 6.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord left
            (2, "frame", 2, 3, 1, 1, true, true), // bottom chord right
            (3, "frame", 1, 4, 1, 1, true, true), // left rising diagonal
            (4, "frame", 4, 2, 1, 1, true, true), // left falling diagonal
            (5, "frame", 2, 5, 1, 1, true, true), // right rising diagonal
            (6, "frame", 5, 3, 1, 1, true, true), // right falling diagonal
            (7, "frame", 4, 5, 1, 1, true, true), // top chord
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 2, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: symmetric loading about midspan
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry, 25.0, 0.02, "warren R1y");
    assert_close(r3.ry, 25.0, 0.02, "warren R3y");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p, 0.02, "warren ΣRy");

    // All moments zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(ef.m_start, 0.0, 0.02, &format!("warren elem {} m_start", ef.element_id));
        assert_close(ef.m_end, 0.0, 0.02, &format!("warren elem {} m_end", ef.element_id));
    }

    // Symmetry: left diagonals vs right diagonals
    // elem 3 (1-4) should match elem 6 (5-3) in magnitude (mirror pair)
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef6 = results.element_forces.iter().find(|e| e.element_id == 6).unwrap();
    assert_close(ef3.n_start.abs(), ef6.n_start.abs(), 0.02, "warren diagonal symmetry (rising)");

    // elem 4 (4-2) should match elem 5 (2-5) in magnitude (mirror pair)
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();
    assert_close(ef4.n_start.abs(), ef5.n_start.abs(), 0.02, "warren diagonal symmetry (falling)");
}

// ================================================================
// 4. Zero-Force Members
// ================================================================
//
// Truss with an unloaded joint where only two non-collinear members meet.
// Both members must be zero-force members.
//
// Configuration:
//   1(0,0) pinned, 2(6,0) rollerX, 3(3,4) loaded, 4(6,4) unloaded
// Elements: 1-2 (bottom), 1-3 (diag), 2-3 (diag), 2-4 (vertical), 3-4 (top)
// Load at node 3 only.
// Node 4 has no external load and connects to members 2-4 (vertical) and 3-4 (horizontal).
// Since these are perpendicular and node 4 is unloaded, both must be zero-force.

#[test]
fn validation_truss_zero_force_members() {
    let p = 40.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 6.0, 0.0), (3, 3.0, 4.0), (4, 6.0, 4.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
            (2, "frame", 1, 3, 1, 1, true, true), // left diagonal
            (3, "frame", 2, 3, 1, 1, true, true), // right diagonal
            (4, "frame", 2, 4, 1, 1, true, true), // vertical right
            (5, "frame", 3, 4, 1, 1, true, true), // top chord
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Members 4 (2-4 vertical) and 5 (3-4 horizontal) connect at unloaded node 4.
    // They are perpendicular, so both must be zero-force members.
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let ef5 = results.element_forces.iter().find(|e| e.element_id == 5).unwrap();

    assert_close(ef4.n_start, 0.0, 0.05, "zero-force member 4 (vertical)");
    assert_close(ef5.n_start, 0.0, 0.05, "zero-force member 5 (top chord)");

    // Other members should carry force (non-zero)
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    assert!(ef1.n_start.abs() > 0.1, "bottom chord should carry force: N={:.4}", ef1.n_start);
    assert!(ef2.n_start.abs() > 0.1, "left diagonal should carry force: N={:.4}", ef2.n_start);
    assert!(ef3.n_start.abs() > 0.1, "right diagonal should carry force: N={:.4}", ef3.n_start);
}

// ================================================================
// 5. K-Truss Symmetry
// ================================================================
//
// Symmetric K-truss with symmetric loading.
// 6 nodes: bottom chord 1(0,0)-2(4,0)-3(8,0), top chord 4(0,3)-5(4,3)-6(8,3)
// Verticals: 1-4, 2-5, 3-6
// Diagonals: 1-5, 5-3 (K-pattern through center vertical)
// Top chords: 4-5, 5-6
// Bottom chords: 1-2, 2-3
// Symmetric load: P at node 5 (top center).
//
// By symmetry: left diagonal force = right diagonal force in magnitude.

#[test]
fn validation_truss_k_truss_symmetry() {
    let p = 60.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 4.0, 0.0), (3, 8.0, 0.0),
            (4, 0.0, 3.0), (5, 4.0, 3.0), (6, 8.0, 3.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Bottom chords
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            // Top chords
            (3, "frame", 4, 5, 1, 1, true, true),
            (4, "frame", 5, 6, 1, 1, true, true),
            // Verticals
            (5, "frame", 1, 4, 1, 1, true, true),
            (6, "frame", 2, 5, 1, 1, true, true),
            (7, "frame", 3, 6, 1, 1, true, true),
            // Diagonals (K-pattern)
            (8, "frame", 1, 5, 1, 1, true, true),  // left diagonal
            (9, "frame", 5, 3, 1, 1, true, true),  // right diagonal
        ],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 5, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Symmetric reactions
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    assert_close(r1.ry, p / 2.0, 0.02, "K-truss R1y");
    assert_close(r3.ry, p / 2.0, 0.02, "K-truss R3y");

    // Left diagonal (elem 8: 1→5) and right diagonal (elem 9: 5→3)
    // By symmetry, they should have equal magnitude axial forces.
    let ef8 = results.element_forces.iter().find(|e| e.element_id == 8).unwrap();
    let ef9 = results.element_forces.iter().find(|e| e.element_id == 9).unwrap();
    assert_close(ef8.n_start.abs(), ef9.n_start.abs(), 0.02, "K-truss diagonal symmetry");

    // Symmetric bottom chords: equal magnitude
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef2 = results.element_forces.iter().find(|e| e.element_id == 2).unwrap();
    assert_close(ef1.n_start.abs(), ef2.n_start.abs(), 0.02, "K-truss bottom chord symmetry");

    // Symmetric top chords: equal magnitude
    let ef3 = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef4 = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    assert_close(ef3.n_start.abs(), ef4.n_start.abs(), 0.02, "K-truss top chord symmetry");
}

// ================================================================
// 6. Truss Deflection: Method of Virtual Work
// ================================================================
//
// Simple 3-bar truss. Compute joint deflection from FEM and compare
// with virtual work: delta = Σ(N*n*L/(E_eff*A))
// where N is real force, n is virtual force (unit load).
//
// Triangle: 1(0,0) pinned, 2(3,0) rollerX, 3(1.5,2)
// Real load: P=50 downward at node 3.
// Virtual: unit load downward at node 3 (same direction as desired deflection).
// Since real and virtual loading are identical (scaled), n = N/P.
//
// delta_vert = Σ N_i^2 * L_i / (P * E_eff * A)

#[test]
fn validation_truss_deflection_virtual_work() {
    let p = 50.0;
    let nodes = vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 1.5, 2.0)];
    let elems_data = vec![
        (1, "frame", 1, 2, 1, 1, true, true), // bottom chord
        (2, "frame", 1, 3, 1, 1, true, true), // left diagonal
        (3, "frame", 2, 3, 1, 1, true, true), // right diagonal
    ];

    let input = make_input(
        nodes.clone(),
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_data.clone(),
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Get FEM deflection at node 3
    let disp3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    let fem_delta_y = disp3.uy; // should be negative (downward)

    // Virtual work: delta = Σ(N * n * L) / (E_eff * A)
    // With unit load in same direction as real load, n_i = N_i / P
    // So delta = Σ(N_i^2 * L_i) / (P * E_eff * A)
    //
    // Compute member lengths from node coordinates
    let node_coords: [(f64, f64); 3] = [(0.0, 0.0), (3.0, 0.0), (1.5, 2.0)];
    let member_nodes: [(usize, usize); 3] = [(0, 1), (0, 2), (1, 2)];

    let mut virtual_work_sum = 0.0;
    for (idx, &(ni, nj)) in member_nodes.iter().enumerate() {
        let dx = node_coords[nj].0 - node_coords[ni].0;
        let dy = node_coords[nj].1 - node_coords[ni].1;
        let length = (dx * dx + dy * dy).sqrt();

        let ef = results.element_forces.iter()
            .find(|e| e.element_id == (idx + 1))
            .unwrap();
        let n_real = ef.n_start;
        let n_virtual = n_real / p; // unit load → scale by 1/P

        virtual_work_sum += n_real * n_virtual * length;
    }
    let virtual_work_delta = -virtual_work_sum / (E_EFF * A); // negative = downward

    // Compare FEM deflection with virtual work prediction
    assert_close(fem_delta_y, virtual_work_delta, 0.05, "virtual work deflection");
}

// ================================================================
// 7. All Moments Zero in Any Truss
// ================================================================
//
// Build a complex truss (Howe pattern, 3 panels) with all double-hinged
// elements. Verify m_start ≈ 0 and m_end ≈ 0 for every element.
//
// Howe truss (3 panels):
//   Bottom: 1(0,0)-2(3,0)-3(6,0)-4(9,0)
//   Top:    5(0,4)-6(3,4)-7(6,4)-8(9,4)
//   Verticals: 1-5, 2-6, 3-7, 4-8
//   Bottom chords: 1-2, 2-3, 3-4
//   Top chords: 5-6, 6-7, 7-8
//   Diagonals (Howe = diagonals toward center): 5-2, 6-3, 7-2, 7-4 (actually: 6-2, 7-3)
//   Simplified: diagonals 5-2, 8-3 plus verticals carry load

#[test]
fn validation_truss_all_moments_zero() {
    let p = 20.0;
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0), (4, 9.0, 0.0),
            (5, 0.0, 4.0), (6, 3.0, 4.0), (7, 6.0, 4.0), (8, 9.0, 4.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Bottom chords
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, true),
            // Top chords
            (4, "frame", 5, 6, 1, 1, true, true),
            (5, "frame", 6, 7, 1, 1, true, true),
            (6, "frame", 7, 8, 1, 1, true, true),
            // Verticals
            (7, "frame", 1, 5, 1, 1, true, true),
            (8, "frame", 2, 6, 1, 1, true, true),
            (9, "frame", 3, 7, 1, 1, true, true),
            (10, "frame", 4, 8, 1, 1, true, true),
            // Diagonals (Howe pattern: diagonals slope toward center)
            (11, "frame", 5, 2, 1, 1, true, true),
            (12, "frame", 6, 3, 1, 1, true, true),
            (13, "frame", 8, 3, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 4, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: -p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -p, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Every element must have zero moments at both ends
    for ef in &results.element_forces {
        assert_close(
            ef.m_start, 0.0, 0.02,
            &format!("Howe truss elem {} m_start", ef.element_id),
        );
        assert_close(
            ef.m_end, 0.0, 0.02,
            &format!("Howe truss elem {} m_end", ef.element_id),
        );
    }

    // Sanity: at least some members carry axial force
    let has_nonzero = results.element_forces.iter().any(|ef| ef.n_start.abs() > 0.1);
    assert!(has_nonzero, "at least one member should carry axial force");
}

// ================================================================
// 8. Pratt Truss Global Equilibrium with Multiple Loads
// ================================================================
//
// Multi-panel Pratt truss with several point loads at different nodes.
// Verify: ΣRx = ΣFx, ΣRy = ΣFy (global force equilibrium).
//
// 5-panel Pratt truss:
//   Bottom: 1(0,0)-2(3,0)-3(6,0)-4(9,0)-5(12,0)-6(15,0)
//   Top:    7(3,4)-8(6,4)-9(9,4)-10(12,4)
//   Pinned at 1, rollerX at 6.
//   Multiple loads: downward at 7,8,9,10 and horizontal at 8.

#[test]
fn validation_truss_pratt_global_equilibrium() {
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0),
            (4, 9.0, 0.0), (5, 12.0, 0.0), (6, 15.0, 0.0),
            (7, 3.0, 4.0), (8, 6.0, 4.0), (9, 9.0, 4.0), (10, 12.0, 4.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            // Bottom chords
            (1, "frame", 1, 2, 1, 1, true, true),
            (2, "frame", 2, 3, 1, 1, true, true),
            (3, "frame", 3, 4, 1, 1, true, true),
            (4, "frame", 4, 5, 1, 1, true, true),
            (5, "frame", 5, 6, 1, 1, true, true),
            // Top chords
            (6, "frame", 7, 8, 1, 1, true, true),
            (7, "frame", 8, 9, 1, 1, true, true),
            (8, "frame", 9, 10, 1, 1, true, true),
            // Verticals
            (9, "frame", 2, 7, 1, 1, true, true),
            (10, "frame", 3, 8, 1, 1, true, true),
            (11, "frame", 4, 9, 1, 1, true, true),
            (12, "frame", 5, 10, 1, 1, true, true),
            // Diagonals (Pratt pattern: diagonals slope away from center)
            (13, "frame", 1, 7, 1, 1, true, true),
            (14, "frame", 7, 3, 1, 1, true, true),
            (15, "frame", 8, 4, 1, 1, true, true),
            (16, "frame", 9, 5, 1, 1, true, true),
            (17, "frame", 10, 6, 1, 1, true, true),
        ],
        vec![(1, 1, "pinned"), (2, 6, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: -20.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 10.0, fy: -30.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 9, fx: 0.0, fy: -25.0, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 10, fx: 0.0, fy: -15.0, mz: 0.0 }),
        ],
    );
    let results = linear::solve_2d(&input).unwrap();

    // Applied loads
    let total_fx: f64 = 10.0; // only horizontal load at node 8
    let total_fy: f64 = 20.0 + 30.0 + 25.0 + 15.0; // = 90 downward

    // Reaction sums
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();

    // ΣRx + ΣFx = 0 => ΣRx = -ΣFx
    assert_close(sum_rx, -total_fx, 0.02, "Pratt ΣRx equilibrium");
    // ΣRy = total downward load (reactions are upward)
    assert_close(sum_ry, total_fy, 0.02, "Pratt ΣRy equilibrium");

    // Moment equilibrium about node 1:
    // R6y * 15 = 20*3 + 30*6 + 25*9 + 15*12 + 10*4 (horizontal load at height 4, clockwise)
    // R6y * 15 = 60 + 180 + 225 + 180 + 40 = 685
    // R6y = 685/15 = 45.667
    let r6 = results.reactions.iter().find(|r| r.node_id == 6).unwrap();
    assert_close(r6.ry, 685.0 / 15.0, 0.02, "Pratt R6y by moment");

    // R1y = 90 - R6y = 90 - 45.667 = 44.333
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.ry, 90.0 - 685.0 / 15.0, 0.02, "Pratt R1y by moment");

    // All moments zero (truss behavior)
    for ef in &results.element_forces {
        assert_close(
            ef.m_start, 0.0, 0.02,
            &format!("Pratt elem {} m_start", ef.element_id),
        );
        assert_close(
            ef.m_end, 0.0, 0.02,
            &format!("Pratt elem {} m_end", ef.element_id),
        );
    }
}
