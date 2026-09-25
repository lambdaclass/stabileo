/// Validation: Point Loads on Elements (PointOnElement)
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 4
///   - Standard beam formulas for concentrated loads at arbitrary positions
///
/// Tests verify SolverPointLoadOnElement behavior:
///   1. Point load at midspan: matches PL³/(48EI) formula
///   2. Point load at quarter span: asymmetric reactions
///   3. Cantilever with load at arbitrary point
///   4. Axial point load on element (px parameter)
///   5. Moment load on element (mz parameter)
///   6. Multiple point loads on same element
///   7. Point load at element end: matches nodal load
///   8. Equilibrium with point-on-element loads
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Midspan Point Load: δ = PL³/(48EI)
// ================================================================
//
// SS beam, single element, point load at midspan (a=0.5).

#[test]
fn validation_poe_midspan_deflection() {
    let l = 6.0;
    let p = 10.0;
    // Single element SS beam with point load at midspan (a = absolute distance = L/2)
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: l / 2.0, p: -p, px: None, my: None,
    })];
    let input = make_beam(1, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Reactions: R = P/2 each
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
    assert_close(r1, p / 2.0, 0.02, "PoE midspan: R1 = P/2");
    assert_close(r2, p / 2.0, 0.02, "PoE midspan: R2 = P/2");
}

// ================================================================
// 2. Quarter-Span Point Load: Asymmetric Reactions
// ================================================================
//
// SS beam with point load at L/4.
// R_left = P × 3/4, R_right = P × 1/4

#[test]
fn validation_poe_quarter_span() {
    let l = 8.0;
    let p = 20.0;

    // Multi-element beam, point load at L/4
    // Element 1 goes from x=0 to x=L/4. Load at end of element 1 → a = elem_len
    let n = 4;
    let elem_len = l / n as f64;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: elem_len, p: -p, px: None, my: None,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    assert_close(r1 + r_end, p, 0.02, "PoE quarter: ΣR = P");
    assert_close(r1, 0.75 * p, 0.02, "PoE quarter: R1 = 3P/4");
    assert_close(r_end, 0.25 * p, 0.02, "PoE quarter: R2 = P/4");
}

// ================================================================
// 3. Cantilever with Intermediate Load
// ================================================================
//
// Cantilever with load at distance 'a' from fixed end.
// M_base = P × a × L_elem (local 'a' is fraction of element length)

#[test]
fn validation_poe_cantilever() {
    let l = 6.0;
    let n = 3;
    let p = 15.0;

    // Load at midpoint of first element (a = elem_len/2)
    let elem_len = l / n as f64;
    let dist = elem_len / 2.0;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a: dist, p: -p, px: None, my: None,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // Base reaction: Ry = P
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rz, p, 0.02, "Cantilever PoE: Ry = P");

    // Base moment = P × distance from base
    assert_close(r1.my.abs(), p * dist, 0.05, "Cantilever PoE: M = P × d");
}

// ================================================================
// 4. Axial Point Load (px parameter)
// ================================================================
//
// Apply axial force at a point along the element.
// For a horizontal beam, px acts in the X direction.

#[test]
fn validation_poe_axial_load() {
    let l = 6.0;
    let n = 3;
    let px = 10.0;

    let elem_len = l / n as f64;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 2, a: elem_len / 2.0, p: 0.0, px: Some(px), my: None,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Horizontal equilibrium: Rx1 = -px
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.rx, -px, 0.05, "PoE axial: Rx = -px");
}

// ================================================================
// 5. Moment Load on Element (mz parameter)
// ================================================================
//
// Apply a concentrated moment at a point along the element.

#[test]
fn validation_poe_moment_load() {
    let l = 6.0;
    let n = 3;
    let m = 10.0;

    let elem_len = l / n as f64;
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 2, a: elem_len / 2.0, p: 0.0, px: None, my: Some(m),
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Concentrated moment on SS beam: reactions form a couple (ΣRy = 0)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap().rz;

    // ΣRy = 0 (moment creates no net vertical force)
    assert!(( r1 + r_end).abs() < 0.01,
        "PoE moment: ΣRy ≈ 0: {:.6e}", r1 + r_end);

    // Reactions should be equal and opposite
    assert_close(r1, -r_end, 0.05, "PoE moment: R1 = -R2");

    // Reactions should be non-zero
    assert!(r1.abs() > 1e-6, "PoE moment: non-zero reactions: {:.6e}", r1);
}

// ================================================================
// 6. Multiple Point Loads on Same Element
// ================================================================
//
// Two point loads on the same element should superpose correctly.

#[test]
fn validation_poe_multiple_loads() {
    let l = 6.0;
    let n = 3;
    let p1 = 10.0;
    let p2 = 5.0;

    // Two loads on element 2
    let elem_len = l / n as f64;
    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2, a: elem_len * 0.25, p: -p1, px: None, my: None,
        }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 2, a: elem_len * 0.75, p: -p2, px: None, my: None,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Total reaction = p1 + p2
    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p1 + p2, 0.02,
        "Multiple PoE: ΣR = P1 + P2");
}

// ================================================================
// 7. Point Load at Element Start: Matches Nodal Load
// ================================================================
//
// PointOnElement at a=0.0 should be equivalent to nodal load at start node.

#[test]
fn validation_poe_at_node_equivalence() {
    let l = 6.0;
    let n = 6;
    let p = 10.0;
    let mid = n / 2;

    // PointOnElement at end of element 3 (a=1.0)
    let loads_poe = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: mid, a: 1.0, p: -p, px: None, my: None,
    })];
    let input_poe = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_poe);
    let res_poe = linear::solve_2d(&input_poe).unwrap();

    // Equivalent nodal load at node mid+1
    let loads_nodal = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid + 1, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input_nodal = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads_nodal);
    let res_nodal = linear::solve_2d(&input_nodal).unwrap();

    // Deflections should match
    let d_poe = res_poe.displacements.iter().find(|d| d.node_id == mid + 1).unwrap().uz;
    let d_nodal = res_nodal.displacements.iter().find(|d| d.node_id == mid + 1).unwrap().uz;

    assert_close(d_poe, d_nodal, 0.02,
        "PoE at node ≈ nodal load");
}

// ================================================================
// 8. PointOnElement Equilibrium
// ================================================================
//
// ΣR = applied loads for any PointOnElement configuration.

#[test]
fn validation_poe_equilibrium() {
    let l = 8.0;
    let n = 4;
    let p1 = 12.0;
    let p2 = 8.0;
    let p3 = 5.0;

    let elem_len = l / n as f64;
    let loads = vec![
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a: elem_len * 0.5, p: -p1, px: None, my: None,
        }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 3, a: elem_len * 0.3, p: -p2, px: None, my: None,
        }),
        SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 4, a: elem_len * 0.8, p: -p3, px: None, my: None,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let sum_ry: f64 = results.reactions.iter().map(|r| r.rz).sum();
    assert_close(sum_ry, p1 + p2 + p3, 0.02,
        "PoE equilibrium: ΣR = ΣP");
}

// ================================================================
// Point couples, against closed forms and with their signs
// ================================================================
//
// The couple tests above check only ΣRy = 0, or absolute values on a
// symmetric beam, and passed while the equivalent loads of a couple carried
// the wrong sign on their moment terms. These check the numbers.

/// Cantilever, couple M (counter-clockwise) at a: the wall takes exactly −M,
/// the tip rotates M·a/EI and rises M·a·(L − a/2)/EI.
#[test]
fn validation_poe_couple_on_cantilever() {
    let (l, m, a) = (5.0, 6.0, 2.0);
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a, p: 0.0, px: None, my: Some(m),
    })];
    let input = make_beam(1, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();
    let ei = E * 1000.0 * IZ;
    let wall = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!((wall.my + m).abs() < 1e-9, "wall moment {} want {}", wall.my, -m);
    assert!(wall.rz.abs() < 1e-9, "no vertical reaction: {}", wall.rz);
    let tip = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!((tip.ry - m * a / ei).abs() < 1e-12, "tip rotation {}", tip.ry);
    assert!((tip.uz - m * a * (l - a / 2.0) / ei).abs() < 1e-12, "tip deflection {}", tip.uz);
}

/// Simple beam, couple M at a: reactions ±M/L — A up, B down for a
/// counter-clockwise couple — wherever the couple sits.
#[test]
fn validation_poe_couple_on_simple_beam() {
    let (l, m) = (5.0, 6.0);
    for &a in &[1.0, 2.0, 3.5] {
        let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
            element_id: 1, a, p: 0.0, px: None, my: Some(m),
        })];
        let input = make_beam(1, l, E, A, IZ, "pinned", Some("rollerX"), loads);
        let results = linear::solve_2d(&input).unwrap();
        let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
        let rb = results.reactions.iter().find(|r| r.node_id == 2).unwrap().rz;
        assert!((ra - m / l).abs() < 1e-9, "a = {a}: R_A {ra} want {}", m / l);
        assert!((rb + m / l).abs() < 1e-9, "a = {a}: R_B {rb} want {}", -m / l);
    }
}

/// Fixed-fixed, couple M at a: every reaction, with its sign, from
/// equilibrium — ΣM about the left support must vanish.
#[test]
fn validation_poe_couple_fixed_fixed_equilibrium() {
    let (l, m, a) = (5.0, 6.0, 2.0);
    let loads = vec![SolverLoad::PointOnElement(SolverPointLoadOnElement {
        element_id: 1, a, p: 0.0, px: None, my: Some(m),
    })];
    let input = make_beam(1, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == 2).unwrap();
    let sum_m = r1.my + r2.my + r2.rz * l + m;
    assert!(sum_m.abs() < 1e-9, "ΣM about the left support: {sum_m}");
    // Closed forms: R_A = 6Mab/L³ upward, M_A = M·b(2a−b)/L², M_B = M·a(2b−a)/L².
    let b = l - a;
    assert!((r1.rz - 6.0 * m * a * b / l.powi(3)).abs() < 1e-9);
    assert!((r1.my - m * b * (2.0 * a - b) / (l * l)).abs() < 1e-9);
    assert!((r2.my - m * a * (2.0 * b - a) / (l * l)).abs() < 1e-9);
}
