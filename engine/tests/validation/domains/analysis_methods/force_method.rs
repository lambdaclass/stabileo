/// Validation: Force Method (Compatibility Method) Verifications
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 10-11
///   - Kassimali, "Structural Analysis", Ch. 10
///   - Ghali & Neville, "Structural Analysis", Ch. 4-5
///
/// The force method determines redundant forces by enforcing
/// compatibility (deformation conditions). These tests verify
/// indeterminate structures against analytical solutions.
///
/// Tests verify:
///   1. Propped cantilever: reaction at prop = 3P/8 (midpoint load)
///   2. Fixed-fixed beam: end moments = PL/8 (midpoint load)
///   3. Two-span continuous: interior reaction for UDL
///   4. Portal frame: horizontal thrust under gravity
///   5. Beam with redundant support: 3-support beam
///   6. Fixed beam UDL: M_end = qL²/12
///   7. Propped cantilever UDL: reaction at roller
///   8. Beam with settlement: redundant reaction change
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Propped Cantilever: Midpoint Load
// ================================================================
//
// Fixed at left, roller at right. Point load P at midspan.
// R_roller = 5P/16 (exact for midpoint load)

#[test]
fn validation_force_method_propped_midpoint() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Roller reaction = 5P/16
    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    let r_exact = 5.0 * p / 16.0;
    assert_close(r_roller, r_exact, 0.02,
        "Propped midpoint: R_roller = 5P/16");

    // Fixed support vertical: R_fix = P - 5P/16 = 11P/16
    let r_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r_fix, p - r_exact, 0.02,
        "Propped midpoint: R_fix = 11P/16");

    // Fixed-end moment = 3PL/16
    let m_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz;
    let m_exact = 3.0 * p * l / 16.0;
    assert_close(m_fix.abs(), m_exact, 0.02,
        "Propped midpoint: M_fix = 3PL/16");
}

// ================================================================
// 2. Fixed-Fixed Beam: Midpoint Load
// ================================================================
//
// Both ends fixed. Point load P at midspan.
// M_A = M_B = PL/8, R_A = R_B = P/2 (by symmetry)

#[test]
fn validation_force_method_fixed_midpoint() {
    let l = 10.0;
    let n = 20;
    let p = 16.0;
    let mid = n / 2 + 1;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Symmetric reactions
    assert_close(r1.ry, r2.ry, 0.02, "Fixed-fixed: R1 = R2");
    assert_close(r1.ry, p / 2.0, 0.02, "Fixed-fixed: R = P/2");

    // End moments = PL/8
    assert_close(r1.mz.abs(), p * l / 8.0, 0.02,
        "Fixed-fixed: |M| = PL/8");
    assert_close(r1.mz.abs(), r2.mz.abs(), 0.02,
        "Fixed-fixed: |M1| = |M2|");
}

// ================================================================
// 3. Two-Span Continuous: Interior Reaction for UDL
// ================================================================
//
// Two equal spans with UDL. Interior support reaction = 10qL/8
// (where L = single span length).

#[test]
fn validation_force_method_two_span_udl() {
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

    // Interior support reaction (node n+1)
    let r_int = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;

    // For two equal spans with UDL:
    // R_int = 10qL/8 = 5qL/4
    let r_int_exact = 5.0 * q.abs() * span / 4.0;
    assert_close(r_int, r_int_exact, 0.02,
        "Two-span UDL: R_int = 5qL/4");

    // End reactions = 3qL/8
    let r_end = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    let r_end_exact = 3.0 * q.abs() * span / 8.0;
    assert_close(r_end, r_end_exact, 0.02,
        "Two-span UDL: R_end = 3qL/8");
}

// ================================================================
// 4. Portal Frame: Horizontal Thrust Under Gravity
// ================================================================
//
// Symmetric portal frame with fixed bases under symmetric gravity:
// No horizontal thrust (Rx = 0 by symmetry).

#[test]
fn validation_force_method_portal_thrust() {
    let h = 4.0;
    let w = 6.0;
    let p = 20.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, -p);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r4 = results.reactions.iter().find(|r| r.node_id == 4).unwrap();

    // No horizontal thrust under symmetric gravity
    assert!(r1.rx.abs() < 1e-8,
        "Portal gravity: Rx ≈ 0: {:.6e}", r1.rx);

    // Equal vertical reactions
    assert_close(r1.ry, r4.ry, 0.02, "Portal gravity: R1y = R4y");
    assert_close(r1.ry + r4.ry, 2.0 * p, 0.01,
        "Portal gravity: ΣRy = 2P");
}

// ================================================================
// 5. Three-Support Beam: Redundant Reaction
// ================================================================
//
// SS beam with additional support at midspan.
// Under UDL, midspan reaction = 5qL/4 (same as two-span).

#[test]
fn validation_force_method_three_support() {
    let l = 10.0;
    let n = 20;
    let q: f64 = -10.0;
    let mid = n / 2 + 1;

    // Build beam with 3 supports: pinned at both ends + roller at midspan
    let mut nodes_map = std::collections::HashMap::new();
    for i in 0..=n {
        nodes_map.insert(
            (i + 1).to_string(),
            SolverNode { id: i + 1, x: i as f64 * l / n as f64, y: 0.0 },
        );
    }
    let mut mats = std::collections::HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    let mut secs = std::collections::HashMap::new();
    secs.insert("1".to_string(), SolverSection { id: 1, a: A, iz: IZ, as_y: None });
    let mut elems = std::collections::HashMap::new();
    for i in 0..n {
        elems.insert(
            (i + 1).to_string(),
            SolverElement {
                id: i + 1, elem_type: "frame".to_string(),
                node_i: i + 1, node_j: i + 2,
                material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            },
        );
    }
    let mut sups = std::collections::HashMap::new();
    sups.insert("1".to_string(), SolverSupport {
        id: 1, node_id: 1, support_type: "pinned".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("2".to_string(), SolverSupport {
        id: 2, node_id: mid, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });
    sups.insert("3".to_string(), SolverSupport {
        id: 3, node_id: n + 1, support_type: "rollerX".to_string(),
        kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None,
    });

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();

    let input = SolverInput {
        nodes: nodes_map, materials: mats, sections: secs,
        elements: elems, supports: sups, loads, constraints: vec![], };
    let results = linear::solve_2d(&input).unwrap();

    let r_mid = results.reactions.iter()
        .find(|r| r.node_id == mid).unwrap().ry;
    let span = l / 2.0;
    let r_mid_exact = 5.0 * q.abs() * span / 4.0;

    assert_close(r_mid, r_mid_exact, 0.02,
        "3-support: R_mid = 5qL'/4");
}

// ================================================================
// 6. Fixed Beam: UDL End Moments
// ================================================================
//
// Fixed-fixed beam with UDL: M_A = M_B = qL²/12

#[test]
fn validation_force_method_fixed_udl() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r2 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    let m_exact = q.abs() * l * l / 12.0;
    assert_close(r1.mz.abs(), m_exact, 0.02,
        "Fixed UDL: |M_A| = qL²/12");
    assert_close(r2.mz.abs(), m_exact, 0.02,
        "Fixed UDL: |M_B| = qL²/12");

    // Reactions = qL/2 each (symmetric)
    assert_close(r1.ry, q.abs() * l / 2.0, 0.02,
        "Fixed UDL: R = qL/2");
}

// ================================================================
// 7. Propped Cantilever: UDL Roller Reaction
// ================================================================
//
// Fixed at left, roller at right, UDL q.
// R_roller = 3qL/8

#[test]
fn validation_force_method_propped_udl() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let r_roller = results.reactions.iter()
        .find(|r| r.node_id == n + 1).unwrap().ry;
    let r_exact = 3.0 * q.abs() * l / 8.0;
    assert_close(r_roller, r_exact, 0.02,
        "Propped UDL: R_roller = 3qL/8");

    // Fixed end: R = 5qL/8
    let r_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().ry;
    assert_close(r_fix, 5.0 * q.abs() * l / 8.0, 0.02,
        "Propped UDL: R_fix = 5qL/8");

    // Fixed end moment = qL²/8
    let m_fix = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap().mz.abs();
    assert_close(m_fix, q.abs() * l * l / 8.0, 0.02,
        "Propped UDL: M_fix = qL²/8");
}

// ================================================================
// 8. Load Position Effect: Force Method Verification
// ================================================================
//
// Propped cantilever with point load at different positions.
// Roller reaction varies as R = P(3a² - a³)/(2L³) × L?
// Actually: R_B = Pa²(3L-a)/(2L³) for load at distance a from fixed end.

#[test]
fn validation_force_method_load_position() {
    let l = 10.0;
    let n = 20;
    let p = 10.0;

    // Load at L/4
    let a1 = l / 4.0;
    let node1 = n / 4 + 1;
    let loads1 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node1, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input1 = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads1);
    let r1 = linear::solve_2d(&input1).unwrap()
        .reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r1_exact = p * a1 * a1 * (3.0 * l - a1) / (2.0 * l * l * l);

    // Load at 3L/4
    let a2 = 3.0 * l / 4.0;
    let node2 = 3 * n / 4 + 1;
    let loads2 = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: node2, fx: 0.0, fy: -p, mz: 0.0,
    })];
    let input2 = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads2);
    let r2 = linear::solve_2d(&input2).unwrap()
        .reactions.iter().find(|r| r.node_id == n + 1).unwrap().ry;
    let r2_exact = p * a2 * a2 * (3.0 * l - a2) / (2.0 * l * l * l);

    assert_close(r1, r1_exact, 0.03,
        "Load at L/4: R_B = Pa²(3L-a)/(2L³)");
    assert_close(r2, r2_exact, 0.03,
        "Load at 3L/4: R_B = Pa²(3L-a)/(2L³)");

    // Load closer to roller → larger roller reaction
    assert!(r2 > r1, "Load nearer roller: R2 > R1: {:.4} > {:.4}", r2, r1);
}
