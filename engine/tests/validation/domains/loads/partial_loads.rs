/// Validation: Partial & Trapezoidal Distributed Loads
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 7 (Loads on beams)
///   - Ghali & Neville, "Structural Analysis", Ch. 12 (FEF for partial loads)
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///
/// Tests verify partial load (a/b parameters) and trapezoidal load behavior:
///   1. Full-span uniform vs explicit a=0, b=L: same result
///   2. Half-span load on SS beam: asymmetric reactions
///   3. Triangular load (q_i=0, q_j=q): known reactions
///   4. Trapezoidal load: between uniform and triangular
///   5. Partial load equilibrium: ΣR = total applied
///   6. Cantilever with partial tip load: moment check
///   7. Point-on-element vs narrow partial load: convergence
///   8. Symmetric partial load: symmetric response
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Full-Span UDL: Explicit a/b vs Default
// ================================================================
//
// SolverDistributedLoad with a=None, b=None should give the same
// result as a=Some(0.0), b=Some(L_element).

#[test]
fn validation_partial_full_span_equivalence() {
    let l = 6.0;
    let n = 6;
    let q = -10.0;
    let elem_len = l / n as f64;

    // Default (no a/b)
    let loads_default: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_default = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_default);
    let res_default = linear::solve_2d(&input_default).unwrap();

    // Explicit a=0, b=elem_len
    let loads_explicit: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: Some(0.0), b: Some(elem_len),
        }))
        .collect();
    let input_explicit = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_explicit);
    let res_explicit = linear::solve_2d(&input_explicit).unwrap();

    // Midspan deflection should be identical
    let mid = n / 2 + 1;
    let d_default = res_default.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;
    let d_explicit = res_explicit.displacements.iter().find(|d| d.node_id == mid).unwrap().uy;

    let err = (d_default - d_explicit).abs() / d_default.abs().max(1e-10);
    assert!(err < 0.01,
        "Full span: default={:.6e}, explicit={:.6e}", d_default, d_explicit);
}

// ================================================================
// 2. Half-Span Load: Asymmetric Reactions
// ================================================================
//
// UDL on left half of SS beam. R_left > R_right.
// R_left = q*L/2 * 3/4, R_right = q*L/2 * 1/4 (for load on first half)

#[test]
fn validation_partial_half_span_reactions() {
    let l = 8.0;
    let n = 8;
    let q: f64 = -10.0;

    // Load only on first 4 elements (left half)
    let loads: Vec<SolverLoad> = (1..=n/2)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Total load = q * L/2 = 10 * 4 = 40
    let total_load = q.abs() * l / 2.0;
    assert_close(r1 + r_end, total_load, 0.02, "Half-span: ΣR = total load");

    // Left reaction should be larger (load is on left half)
    assert!(r1 > r_end,
        "Half-span: R_left > R_right: {:.4} > {:.4}", r1, r_end);

    // Exact: R1 = 3/4 * total, R2 = 1/4 * total
    assert_close(r1, 0.75 * total_load, 0.02, "Half-span: R1 = 3qL/8");
    assert_close(r_end, 0.25 * total_load, 0.02, "Half-span: R2 = qL/8");
}

// ================================================================
// 3. Triangular Load: q_i=0, q_j=q
// ================================================================
//
// Linearly varying load from 0 at left to q at right on SS beam.
// R_left = qL/6, R_right = qL/3

#[test]
fn validation_partial_triangular_load() {
    let l = 6.0;
    let n = 12; // need enough elements for accuracy
    let q: f64 = -12.0;

    // Triangular load: varies from 0 at node 1 to q at node n+1
    let loads: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q * t_i,
                q_j: q * t_j,
                a: None, b: None,
            })
        })
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;

    // Total load = q*L/2 = 12*6/2 = 36
    let total = q.abs() * l / 2.0;
    assert_close(r1 + r_end, total, 0.02, "Triangular: ΣR = qL/2");

    // R_left = qL/6 = 12, R_right = qL/3 = 24
    assert_close(r1, q.abs() * l / 6.0, 0.05, "Triangular: R1 = qL/6");
    assert_close(r_end, q.abs() * l / 3.0, 0.05, "Triangular: R2 = qL/3");
}

// ================================================================
// 4. Trapezoidal Load: Between Uniform and Triangular
// ================================================================
//
// Load varies from q/2 at left to q at right.
// Deflection should be between uniform and triangular cases.

#[test]
fn validation_partial_trapezoidal() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    // Uniform load
    let loads_uniform: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input_uniform = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_uniform);
    let d_uniform = linear::solve_2d(&input_uniform).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Trapezoidal: q/2 at left, q at right
    let loads_trap: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q * (0.5 + 0.5 * t_i),
                q_j: q * (0.5 + 0.5 * t_j),
                a: None, b: None,
            })
        })
        .collect();
    let input_trap = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_trap);
    let d_trap = linear::solve_2d(&input_trap).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Triangular: 0 at left, q at right
    let loads_tri: Vec<SolverLoad> = (0..n)
        .map(|i| {
            let t_i = i as f64 / n as f64;
            let t_j = (i + 1) as f64 / n as f64;
            SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i + 1,
                q_i: q * t_i,
                q_j: q * t_j,
                a: None, b: None,
            })
        })
        .collect();
    let input_tri = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_tri);
    let d_tri = linear::solve_2d(&input_tri).unwrap()
        .displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap().uy.abs();

    // Trapezoidal deflection should be between triangular and uniform
    assert!(d_tri < d_trap && d_trap < d_uniform,
        "Trapezoidal between tri and uniform: {:.6e} < {:.6e} < {:.6e}",
        d_tri, d_trap, d_uniform);
}

// ================================================================
// 5. Partial Load Equilibrium
// ================================================================
//
// Any partial load on any structure: ΣR = total applied load.

#[test]
fn validation_partial_equilibrium() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -8.0;

    // Load on elements 3-7 (middle portion)
    let loads: Vec<SolverLoad> = (3..=7)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total load = q * 5 elements * elem_len = 8 * 5 * 1 = 40
    let elem_len = l / n as f64;
    let total_load = q.abs() * 5.0 * elem_len;

    let sum_ry: f64 = results.reactions.iter().map(|r| r.ry).sum();
    assert_close(sum_ry, total_load, 0.02,
        "Partial load: ΣR = total applied");
}

// ================================================================
// 6. Cantilever with Tip-Region Load
// ================================================================
//
// Cantilever with load only near the tip: larger moment at base
// than same total load applied at midspan.

#[test]
fn validation_partial_cantilever_tip() {
    let l = 6.0;
    let n = 6;
    let q: f64 = -10.0;

    // Load only on last 2 elements (tip region)
    let loads_tip: Vec<SolverLoad> = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 5, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 6, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_tip = make_beam(n, l, E, A, IZ, "fixed", None, loads_tip);
    let res_tip = linear::solve_2d(&input_tip).unwrap();
    let m_tip = res_tip.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Load on first 2 elements (root region)
    let loads_root: Vec<SolverLoad> = vec![
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 1, q_i: q, q_j: q, a: None, b: None,
        }),
        SolverLoad::Distributed(SolverDistributedLoad {
            element_id: 2, q_i: q, q_j: q, a: None, b: None,
        }),
    ];
    let input_root = make_beam(n, l, E, A, IZ, "fixed", None, loads_root);
    let res_root = linear::solve_2d(&input_root).unwrap();
    let m_root = res_root.reactions.iter().find(|r| r.node_id == 1).unwrap().mz.abs();

    // Tip load creates larger moment at the base
    assert!(m_tip > m_root,
        "Tip load → larger base moment: {:.4} > {:.4}", m_tip, m_root);
}

// ================================================================
// 7. Point Load Equivalence
// ================================================================
//
// A point-on-element load should match an equivalent nodal load
// when the point is at a node.

#[test]
fn validation_partial_point_on_element() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;

    // Point load at midspan using PointOnElement (at end of element 3)
    let loads_poe = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 3, a: 1.0, p: -p, px: None, mz: None,
    })];
    let input_poe = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_poe);
    let res_poe = linear::solve_2d(&input_poe).unwrap();

    // Equivalent nodal load at same location (node 4 = midspan)
    let loads_nodal = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input_nodal = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_nodal);
    let res_nodal = linear::solve_2d(&input_nodal).unwrap();

    // Deflection at midspan should be very close
    let d_poe = res_poe.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;
    let d_nodal = res_nodal.displacements.iter().find(|d| d.node_id == 4).unwrap().uy;

    assert_close(d_poe, d_nodal, 0.02,
        "PointOnElement at node ≈ nodal load");
}

// ================================================================
// 8. Symmetric Partial Load: Symmetric Response
// ================================================================
//
// Symmetric partial load on SS beam → symmetric deflection.

#[test]
fn validation_partial_symmetric_response() {
    let l = 10.0;
    let n = 10;
    let q: f64 = -10.0;

    // Load on elements 4-7 (symmetric about midspan)
    let loads: Vec<SolverLoad> = (4..=7)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions should be equal
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().ry;
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    assert_close(r1, r_end, 0.02, "Symmetric partial: R1 = R_end");

    // Deflection profile should be symmetric
    for i in 1..=4 {
        let d_left = results.displacements.iter().find(|d| d.node_id == i + 1).unwrap().uy;
        let d_right = results.displacements.iter().find(|d| d.node_id == n + 1 - i).unwrap().uy;
        let err = (d_left - d_right).abs() / d_left.abs().max(1e-10);
        assert!(err < 0.02,
            "Symmetric: node {}: {:.6e}, node {}: {:.6e}", i + 1, d_left, n + 1 - i, d_right);
    }
}
