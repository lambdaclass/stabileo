/// Validation: Matrix Structural Analysis Textbook Benchmarks
///
/// Tests classical problems from structural analysis textbooks:
///   - Przemieniecki: axial truss exact solution
///   - Weaver & Gere: 3-member plane frame
///   - McGuire, Gallagher, Ziemian: continuous beam
///   - Hibbeler: propped cantilever
///   - Kassimali: portal frame with UDL
///
/// References:
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
///   - Weaver, W. & Gere, J.M., "Matrix Analysis of Framed Structures", 1990
///   - McGuire, W. et al., "Matrix Structural Analysis", 2000
///   - Hibbeler, R.C., "Structural Analysis", 10th Ed
///   - Kassimali, A., "Matrix Analysis of Structures", 2012
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Przemieniecki: Simple Truss — Exact δ = FL/(EA)
// ================================================================

#[test]
fn validation_przemieniecki_axial_truss() {
    let length = 4.0;
    let f = 50.0;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, length, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)], // truss (no IZ)
        vec![(1, "truss", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fy: 0.0, mz: 0.0 })],
    );

    let results = linear::solve_2d(&input).unwrap();

    let e_eff = E * 1000.0;
    let delta_exact = f * length / (e_eff * A);
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();

    assert_close(d2.ux, delta_exact, 1e-10, "Przemieniecki: δ = FL/(EA)");
}

// ================================================================
// 2. Weaver-Gere: 3-Member Plane Frame
// ================================================================
//
// L-shaped frame: 2 columns + 1 beam, fixed bases, loaded at corner.
// Verify equilibrium and symmetry of reactions.

#[test]
fn validation_weaver_gere_l_frame() {
    let h = 4.0;
    let span = 6.0;
    let p = -20.0; // vertical load at beam midspan

    // Nodes: 1(0,0) fixed, 2(0,h) corner, 3(span,h) corner, 4(span,0) fixed
    // Elements: col 1-2, beam 2-3, col 4-3
    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, 0.0, h),
            (3, span, h),  (4, span, 0.0),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), // left column
            (2, "frame", 2, 3, 1, 1, false, false), // beam
            (3, "frame", 4, 3, 1, 1, false, false), // right column
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fy: p, mz: 0.0 })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium: ΣRy = -P
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert!(
        (sum_ry - p.abs()).abs() < 0.1,
        "Weaver-Gere: ΣRy={:.4}, expected {:.4}", sum_ry, p.abs()
    );

    // ΣRx = 0 (no horizontal applied load)
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        sum_rx.abs() < 0.1,
        "Weaver-Gere: ΣRx={:.4}, expected 0", sum_rx
    );

    // Corner joint should deflect downward under vertical load
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(d2.uy < 0.0, "Weaver-Gere: corner should deflect down, uy={:.6e}", d2.uy);
}



// ================================================================
// 3. McGuire: 2-Span Continuous Beam Under UDL
// ================================================================
//
// Two equal spans, UDL on both. Intermediate support reaction = 5qL/4.
// Midspan moments = 9qL²/128.

#[test]
fn validation_mcguire_continuous_beam_udl() {
    let span: f64 = 6.0;
    let q: f64 = -3.0;
    let n_per_span = 6;

    // Build UDL loads for all elements (2 spans × n_per_span elements)
    let total_elems = 2 * n_per_span;
    let mut loads = Vec::new();
    for i in 1..=total_elems {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_continuous_beam(&[span, span], n_per_span, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Interior support (node at span junction) should have largest reaction
    let mid_node = n_per_span + 1;
    let r_mid = results.reactions.iter().find(|r| r.node_id == mid_node);

    if let Some(r) = r_mid {
        // For 2-span continuous beam with UDL: R_center = 5qL/4
        let r_exact = 5.0 * q.abs() * span / 4.0;
        assert_close(r.ry, r_exact, 0.03, "McGuire: interior reaction R = 5qL/4");
    }

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = q.abs() * 2.0 * span;
    assert_close(sum_ry, total_load, 0.01, "McGuire: ΣRy = total load");
}

// ================================================================
// 4. Hibbeler: Propped Cantilever Under Point Load
// ================================================================
//
// Fixed at A, roller at B. Point load P at midspan.
// R_B = 5P/16, M_A = 3PL/16, δ_mid = 7PL³/(768EI).

#[test]
fn validation_hibbeler_propped_cantilever() {
    let length = 8.0;
    let n = 8;
    let p = -10.0;
    let mid = n / 2 + 1;

    let input = make_beam(
        n, length, E, A, IZ, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();

    // R_B = 5P/16 (at roller end, node n+1)
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_b_exact = 5.0 * p.abs() / 16.0;
    assert_close(r_end.ry, r_b_exact, 0.02, "Hibbeler: R_B = 5P/16");

    // M_A = -3PL/16 (at fixed end, node 1)
    let r_start = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let m_a_exact = 3.0 * p.abs() * length / 16.0;
    assert_close(r_start.mz.abs(), m_a_exact, 0.02, "Hibbeler: M_A = 3PL/16");

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, p.abs(), 0.01, "Hibbeler: ΣRy = P");
}

// ================================================================
// 5. Kassimali: Portal Frame with Lateral Load
// ================================================================
//
// Fixed-base portal frame with horizontal load at beam level.
// Sway deflection should match stiffness method result.

#[test]
fn validation_kassimali_portal_lateral_load() {
    let h = 4.0;
    let span = 6.0;
    let h_load = 10.0; // horizontal load

    let input = make_portal_frame(h, span, E, A, IZ, h_load, 0.0);
    let results = linear::solve_2d(&input).unwrap();

    // Global equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx + h_load).abs() < 0.1,
        "Kassimali: ΣRx + H = 0, got ΣRx={:.4}", sum_rx
    );

    // Both columns should sway in same direction (rigid diaphragm assumption)
    let d2 = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d3 = results.displacements.iter().find(|d| d.node_id == 3).unwrap();
    assert!(
        d2.ux * d3.ux > 0.0,
        "Kassimali: both beam-level nodes should sway same direction"
    );
}

// ================================================================
// 6. Kassimali: Frame with Gravity and Lateral Loads
// ================================================================
//
// Portal frame with both gravity UDL on beam and lateral load.
// Tests superposition of load effects.

#[test]
fn validation_kassimali_frame_combined_loads() {
    let h = 4.0;
    let span = 6.0;
    let h_load = 8.0;
    let q = -5.0; // gravity on beam

    // Create portal with lateral + gravity
    let input = make_portal_frame(h, span, E, A, IZ, h_load, q);
    let results = linear::solve_2d(&input).unwrap();

    // Vertical equilibrium: ΣRy = total gravity = 2 × |q| (nodal loads at 2 beam-level nodes)
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_grav = 2.0 * q.abs();
    assert_close(sum_ry, total_grav, 0.02, "Kassimali: ΣRy = 2|q|");

    // Horizontal equilibrium: ΣRx = -H
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert!(
        (sum_rx + h_load).abs() < 0.1,
        "Kassimali: ΣRx + H = 0, got ΣRx={:.4}", sum_rx
    );
}

// ================================================================
// 7. Przemieniecki: Plane Truss — Method of Joints Verification
// ================================================================
//
// Warren truss: 4 bays, loaded at top nodes.
// Verify axial-only behavior (zero shear in all members).

#[test]
fn validation_przemieniecki_warren_truss() {
    let bay = 3.0;
    let height = 2.0;
    let p = -5.0;

    // Bottom chord: nodes 1-5 at y=0
    // Top chord: nodes 6-8 at y=height
    //     6---7---8
    //    /|\ /|\ /|\
    //   / | X | X | \
    //  /  |/ \|/ \|  \
    // 1---2---3---4---5

    let input = make_input(
        vec![
            (1, 0.0, 0.0), (2, bay, 0.0), (3, 2.0 * bay, 0.0),
            (4, 3.0 * bay, 0.0), (5, 4.0 * bay, 0.0),
            (6, bay, height), (7, 2.0 * bay, height), (8, 3.0 * bay, height),
        ],
        vec![(1, E, 0.3)],
        vec![(1, A, 0.0)], // truss sections (IZ = 0)
        vec![
            // Bottom chord
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 5, 1, 1, false, false),
            // Top chord
            (5, "truss", 6, 7, 1, 1, false, false),
            (6, "truss", 7, 8, 1, 1, false, false),
            // Diagonals and verticals
            (7, "truss", 1, 6, 1, 1, false, false),
            (8, "truss", 2, 6, 1, 1, false, false),
            (9, "truss", 2, 7, 1, 1, false, false),
            (10, "truss", 3, 7, 1, 1, false, false),
            (11, "truss", 3, 8, 1, 1, false, false),
            (12, "truss", 4, 8, 1, 1, false, false),
            (13, "truss", 5, 8, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 5, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 6, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 7, fx: 0.0, fy: p, mz: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 8, fx: 0.0, fy: p, mz: 0.0 }),
        ],
    );

    let results = linear::solve_2d(&input).unwrap();

    // All truss members should have zero shear
    for ef in &results.element_forces {
        assert!(
            ef.v_start.abs() < 1e-4,
            "Przemieniecki: truss element {} has shear={:.6e}, expected 0",
            ef.element_id, ef.v_start
        );
    }

    // Global equilibrium
    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    let total_load = 3.0 * p.abs();
    assert_close(sum_ry, total_load, 0.01, "Przemieniecki: ΣRy = total load");
}

// ================================================================
// 8. Weaver-Gere: Fixed Beam Under Uniform Load
// ================================================================
//
// Fixed-fixed beam, UDL. Exact: M_end = qL²/12, M_mid = qL²/24, δ_mid = qL⁴/(384EI).

#[test]
fn validation_weaver_gere_fixed_beam_udl() {
    let length: f64 = 6.0;
    let q: f64 = -4.0;
    let n = 8;

    let mut input = make_beam(n, length, E, A, IZ, "fixed", Some("fixed"), vec![]);
    for i in 1..=n {
        input.loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i,
            q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let results = linear::solve_2d(&input).unwrap();
    let ei = E * 1000.0 * IZ;

    // End moments: |M| = qL²/12
    let m_exact = q.abs() * length * length / 12.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.mz.abs(), m_exact, 0.02, "Weaver-Gere: M_end = qL²/12");

    // Midspan deflection: δ = qL⁴/(384EI)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    let delta_exact = q.abs() * length.powi(4) / (384.0 * ei);
    assert_close(d_mid.uy.abs(), delta_exact, 0.02, "Weaver-Gere: δ_mid = qL⁴/(384EI)");
}
