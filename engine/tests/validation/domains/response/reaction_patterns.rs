/// Validation: Reaction Force Patterns
///
/// References:
///   - Kassimali, "Structural Analysis", Ch. 3 (Reactions)
///   - Hibbeler, "Structural Analysis", Ch. 2 (Support Reactions)
///   - Leet, Uang & Gilbert, "Fundamentals of Structural Analysis", Ch. 2
///
/// These tests verify that reaction forces follow expected patterns
/// for various structural configurations and loading conditions.
///
/// Tests verify:
///   1. Determinate beam: reactions from statics alone
///   2. Indeterminate beam: reaction depends on stiffness
///   3. Continuous beam: interior reaction > exterior
///   4. Fixed-fixed UDL: equal reactions by symmetry
///   5. Cantilever: reaction = applied load, moment = P*L
///   6. Overhanging beam: uplift reaction
///   7. Portal frame: horizontal and vertical reactions
///   8. Multi-span: reaction distribution pattern
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Determinate SS Beam: Reactions from Statics
// ================================================================
//
// SS beam with point load at a/L from left:
// R_A = P*(L-a)/L, R_B = P*a/L

#[test]
fn validation_reactions_determinate() {
    let l = 10.0;
    let n = 20;
    let p = 30.0;
    let a_frac = 0.3; // load at 0.3L from left
    let load_node = (a_frac * n as f64) as usize + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: load_node, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // R_A = P*(L-a)/L = P*(1-0.3) = 0.7P
    assert_close(r1.ry, p * (1.0 - a_frac), 0.01,
        "Determinate: R_A = P*(L-a)/L");
    // R_B = P*a/L = 0.3P
    assert_close(r_end.ry, p * a_frac, 0.01,
        "Determinate: R_B = P*a/L");
    // No horizontal reaction
    assert_close(r1.rx, 0.0, 0.01, "Determinate: Rx = 0");
}

// ================================================================
// 2. Indeterminate Beam: Stiffness-Dependent Reactions
// ================================================================
//
// Fixed-roller beam under UDL:
// R_A = 5qL/8, R_B = 3qL/8

#[test]
fn validation_reactions_indeterminate() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.ry, 5.0 * q.abs() * l / 8.0, 0.02,
        "Indeterminate: R_A = 5qL/8");
    assert_close(r_end.ry, 3.0 * q.abs() * l / 8.0, 0.02,
        "Indeterminate: R_B = 3qL/8");

    // Fixed-end moment: M_A = qL²/8
    assert_close(r1.mz.abs(), q.abs() * l.powi(2) / 8.0, 0.02,
        "Indeterminate: M_A = qL²/8");
}

// ================================================================
// 3. Continuous Beam: Interior > Exterior Reaction
// ================================================================

#[test]
fn validation_reactions_continuous() {
    let span = 8.0;
    let n = 10;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=(2 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    // For equal-span continuous beam with UDL:
    // R_ext = 3qL/8, R_int = 10qL/8 = 5qL/4
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_int = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();

    // Interior reaction is larger than exterior
    assert!(r_int.ry > r1.ry,
        "Continuous: interior ({:.2}) > exterior ({:.2})",
        r_int.ry, r1.ry);

    // Total reaction = total load
    let total = r1.ry + r_int.ry + r_end.ry;
    assert_close(total, q.abs() * 2.0 * span, 0.01,
        "Continuous: ΣR = qL_total");

    // Symmetry: R1 = R_end
    assert_close(r1.ry, r_end.ry, 0.01,
        "Continuous: exterior reactions equal");
}

// ================================================================
// 4. Fixed-Fixed UDL: Equal Reactions
// ================================================================

#[test]
fn validation_reactions_fixed_symmetric() {
    let l = 10.0;
    let n = 20;
    let q = -12.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // By symmetry: equal vertical reactions
    assert_close(r1.ry, r_end.ry, 0.01,
        "Fixed-fixed: R_A = R_B");

    // Each = qL/2
    assert_close(r1.ry, q.abs() * l / 2.0, 0.01,
        "Fixed-fixed: R = qL/2");

    // Equal moments: |M_A| = |M_B| = qL²/12
    assert_close(r1.mz.abs(), q.abs() * l.powi(2) / 12.0, 0.02,
        "Fixed-fixed: M = qL²/12");
    assert_close(r1.mz.abs(), r_end.mz.abs(), 0.01,
        "Fixed-fixed: |M_A| = |M_B|");
}

// ================================================================
// 5. Cantilever: Full Reaction at Fixed End
// ================================================================

#[test]
fn validation_reactions_cantilever() {
    let l = 6.0;
    let n = 12;
    let p = 25.0;
    let m_app = 10.0;

    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: m_app,
        }),
    ];
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Ry = P (upward)
    assert_close(r1.ry, p, 0.01, "Cantilever: Ry = P");

    // Mz = P*L - M_applied (resisting both)
    let m_expected = p * l - m_app;
    assert_close(r1.mz, m_expected, 0.02,
        "Cantilever: M = P*L - M_app");
}

// ================================================================
// 6. Overhanging Beam: Uplift Reaction
// ================================================================
//
// Beam with overhang: load on overhang causes uplift at far support.

#[test]
fn validation_reactions_overhang_uplift() {
    let span = 8.0;
    let overhang = 4.0;
    let n_span = 10;
    let n_oh = 5;
    let n = n_span + n_oh;
    let p = 20.0;

    let dx_span = span / n_span as f64;
    let dx_oh = overhang / n_oh as f64;

    let mut nodes = Vec::new();
    for i in 0..=n_span {
        nodes.push((i + 1, i as f64 * dx_span, 0.0));
    }
    for i in 1..=n_oh {
        nodes.push((n_span + 1 + i, span + i as f64 * dx_oh, 0.0));
    }

    let elems: Vec<_> = (0..n)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let sups = vec![(1, 1, "pinned"), (2, n_span + 1, "rollerX")];

    // Load at overhang tip
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
    })];

    let input = make_input(
        nodes, vec![(1, E, 0.3)], vec![(1, A, IZ)], elems, sups, loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n_span + 1).unwrap();

    // Support at span end carries more than P (lever arm effect)
    assert!(r2.ry > p, "Overhang: R2 > P due to lever arm");

    // Pinned support reacts downward (uplift)
    assert!(r1.ry < 0.0, "Overhang: R1 < 0 (uplift/downward reaction)");

    // By statics: R1 = -P*overhang/span
    let r1_expected = -p * overhang / span;
    assert_close(r1.ry, r1_expected, 0.02,
        "Overhang: R1 = -P*a/L");
}

// ================================================================
// 7. Portal Frame: Mixed Reactions
// ================================================================

#[test]
fn validation_reactions_portal() {
    let h = 4.0;
    let w = 8.0;
    let f_lat = 10.0;
    let g = -20.0;

    let input = make_portal_frame(h, w, E, A, IZ, f_lat, g);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // ΣFy = 0
    assert_close(r1.ry + r4.ry, 2.0 * g.abs(), 0.01,
        "Portal: ΣRy = 2|g|");

    // ΣFx = 0
    assert_close(r1.rx + r4.rx, -f_lat, 0.01,
        "Portal: ΣRx = -F_lat");

    // With lateral load, horizontal reactions share it
    assert!(r1.rx.abs() > 0.1, "Portal: Rx1 non-zero");
    assert!(r4.rx.abs() > 0.1, "Portal: Rx4 non-zero");
}

// ================================================================
// 8. Multi-Span: Reaction Distribution
// ================================================================
//
// Three equal spans with UDL: exterior reactions < interior.

#[test]
fn validation_reactions_three_span() {
    let span = 6.0;
    let n = 6;
    let q = -10.0;

    let loads: Vec<SolverLoad> = (1..=(3 * n))
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_continuous_beam(&[span, span, span], n, E, A, IZ, loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == 2 * n + 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 3 * n + 1).unwrap();

    // Total reaction = total load = q * 3L
    let total = r1.ry + r2.ry + r3.ry + r4.ry;
    assert_close(total, q.abs() * 3.0 * span, 0.01,
        "3-span: ΣR = qL_total");

    // By symmetry: R1 = R4, R2 = R3
    assert_close(r1.ry, r4.ry, 0.01, "3-span: R1 = R4 (symmetry)");
    assert_close(r2.ry, r3.ry, 0.01, "3-span: R2 = R3 (symmetry)");

    // Interior reactions > exterior reactions
    assert!(r2.ry > r1.ry, "3-span: interior > exterior");
}
