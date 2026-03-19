/// Validation: Flexibility (Force) Method
///
/// References:
///   - Ghali & Neville, "Structural Analysis", Ch. 4
///   - Hibbeler, "Structural Analysis", Ch. 10
///   - Kassimali, "Structural Analysis", Ch. 13
///
/// The flexibility method uses compatibility equations to determine redundants.
/// Tests verify that the stiffness-method solver produces results consistent
/// with the flexibility method solutions.
///
///   1. Propped cantilever: redundant reaction via compatibility
///   2. Fixed-fixed beam: two redundant moments
///   3. Two-span continuous: one redundant (interior reaction)
///   4. Truss with redundant member
///   5. Flexibility coefficient: δ_11 = L³/(3EI) for cantilever
///   6. Compatibility: zero deflection at support
///   7. Propped cantilever with point load at arbitrary position
///   8. Three-span beam: two redundants
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever: Redundant Reaction
// ================================================================
//
// Fixed-roller beam with UDL:
// Primary structure = cantilever (remove roller).
// Compatibility: δ_10 + R_B × δ_11 = 0
// δ_10 = qL⁴/(8EI), δ_11 = L³/(3EI) → R_B = 3qL/8

#[test]
fn validation_flexibility_propped_redundant() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = 3qL/8 (from flexibility method)
    let r_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_end.rz, r_exact, 0.02,
        "Flexibility: R_B = 3qL/8");
}

// ================================================================
// 2. Fixed-Fixed Beam: Two Redundant Moments
// ================================================================

#[test]
fn validation_flexibility_fixed_fixed() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // M = qL²/12
    let m_exact = q.abs() * l * l / 12.0;
    assert_close(r1.my.abs(), m_exact, 0.02, "Fixed-fixed: M_left = qL²/12");
    assert_close(r_end.my.abs(), m_exact, 0.02, "Fixed-fixed: M_right = qL²/12");

    // R = qL/2
    assert_close(r1.rz, q.abs() * l / 2.0, 0.02, "Fixed-fixed: R = qL/2");
}

// ================================================================
// 3. Two-Span Continuous: Interior Reaction
// ================================================================

#[test]
fn validation_flexibility_two_span() {
    let span = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_int = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Interior reaction = 5qL/4 (from flexibility: redundant = interior reaction)
    let r_exact = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int.rz, r_exact, 0.02,
        "Flexibility: R_interior = 5qL/4");
}

// ================================================================
// 4. Truss with Redundant Member
// ================================================================
//
// Square truss with diagonal: 1 redundant member.
// Remove diagonal → determinate truss. Add back with compatibility.

#[test]
fn validation_flexibility_redundant_truss() {
    let w: f64 = 4.0;
    let p = 30.0;

    // Square truss: nodes (0,0), (w,0), (w,w), (0,w)
    // Members: 1-2 (bottom), 2-3 (right), 3-4 (top), 4-1 (left), 1-3 (diagonal)
    let a_truss = 0.001;

    let input = make_input(
        vec![(1, 0.0, 0.0), (2, w, 0.0), (3, w, w), (4, 0.0, w)],
        vec![(1, E, 0.3)],
        vec![(1, a_truss, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 3, 4, 1, 1, false, false),
            (4, "truss", 4, 1, 1, 1, false, false),
            (5, "truss", 1, 3, 1, 1, false, false), // diagonal (redundant)
        ],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 3, fx: p, fz: 0.0, my: 0.0,
        })],
    );
    let results = linear::solve_2d(&input).unwrap();

    // With the diagonal, the truss is stiffer.
    // All members should have finite forces.
    for ef in &results.element_forces {
        assert!(ef.n_start.is_finite(),
            "Redundant truss: finite force in elem {}: {:.6e}", ef.element_id, ef.n_start);
    }

    // Equilibrium
    let sum_rx: f64 = results.reactions.iter().map(|r| r.rx).sum();
    assert_close(sum_rx, -p, 0.02, "Redundant truss: ΣRx = -P");
}

// ================================================================
// 5. Flexibility Coefficient: δ_11 = L³/(3EI)
// ================================================================

#[test]
fn validation_flexibility_coefficient() {
    let l = 5.0;
    let n = 10;
    let e_eff = E * 1000.0;

    // Apply unit load at tip of cantilever
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fz: -1.0, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δ_11 = L³/(3EI) — flexibility coefficient at tip of cantilever
    let f11 = l * l * l / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), f11, 0.02,
        "Flexibility coefficient: δ_11 = L³/(3EI)");
}

// ================================================================
// 6. Compatibility: Zero Deflection at Support
// ================================================================

#[test]
fn validation_flexibility_compatibility() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // At roller support: uy = 0 (compatibility condition)
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d_end.uz.abs() < 1e-10,
        "Compatibility: δ_B = 0 at roller: {:.6e}", d_end.uz);

    // At fixed support: uy = 0, rz = 0
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.uz.abs() < 1e-10, "Compatibility: δ_A = 0 at fixed");
    assert!(d1.ry.abs() < 1e-10, "Compatibility: θ_A = 0 at fixed");
}

// ================================================================
// 7. Propped Cantilever: Point Load at L/3
// ================================================================
//
// R_B = Pa²(3L-a)/(2L³) where a = distance from fixed end

#[test]
fn validation_flexibility_propped_point() {
    let l = 9.0;
    let n = 18;
    let p = 15.0;
    let a = l / 3.0; // distance from fixed end

    let load_node = (a / l * n as f64).round() as usize + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_B = Pa²(3L-a)/(2L³)
    let r_exact = p * a * a * (3.0 * l - a) / (2.0 * l * l * l);
    assert_close(r_end.rz, r_exact, 0.05,
        "Flexibility: R_B = Pa²(3L-a)/(2L³)");
}

// ================================================================
// 8. Three-Span Beam: Two Redundants
// ================================================================

#[test]
fn validation_flexibility_three_span() {
    let span = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load = 3qL
    let total_load = 3.0 * q.abs() * span;
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Three-span: ΣR = 3qL");

    // By symmetry: end reactions are equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();
    assert_close(r1.rz, r_end.rz, 0.01,
        "Three-span: R_left = R_right");

    // Interior reactions are equal
    let r_b = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_c = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    assert_close(r_b.rz, r_c.rz, 0.01,
        "Three-span: R_B = R_C");
}
