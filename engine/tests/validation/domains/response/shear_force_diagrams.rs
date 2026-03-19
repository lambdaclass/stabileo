/// Validation: Shear Force and Bending Moment Diagrams
///
/// References:
///   - Hibbeler, "Structural Analysis", Ch. 4-5
///   - Beer & Johnston, "Mechanics of Materials", Ch. 5
///   - Gere & Goodno, "Mechanics of Materials", Ch. 4
///
/// Tests verify internal force relationships:
///   1. dV/dx = -q (shear gradient = negative load intensity)
///   2. dM/dx = V (moment gradient = shear)
///   3. SS beam + center load: V discontinuity at load point
///   4. Cantilever + UDL: linear V, quadratic M
///   5. Fixed-fixed + UDL: V=0 at midspan, M inflection points
///   6. V jumps at concentrated loads
///   7. M jumps at concentrated moments
///   8. Internal hinge: M=0 at hinge location
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. dV/dx = -q: Shear Gradient Under UDL
// ================================================================

#[test]
fn validation_sfd_shear_gradient() {
    let l = 8.0;
    let n = 16;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Check shear at start and end of a middle element
    let mid_elem = n / 2;
    let ef = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();

    // dV/dx = -q → V changes by q × element_length across element
    let elem_len = l / n as f64;
    let dv = ef.v_end - ef.v_start;
    let expected_dv = q * elem_len;

    assert_close(dv, expected_dv, 0.05,
        "dV/dx = -q: ΔV = q×Δx");
}

// ================================================================
// 2. dM/dx = V: Moment Gradient Equals Shear
// ================================================================

#[test]
fn validation_sfd_moment_gradient() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;

    // SS beam with center load → constant V in each half
    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // In the left half: V = P/2, M increases linearly
    // Check within a single element: dM = M_end - M_start ≈ V × L_elem
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    let elem_len = l / n as f64;
    let dm = ef1.m_end - ef1.m_start;
    let v_avg = (ef1.v_start + ef1.v_end) / 2.0;

    // |dM/dx| ≈ |V| → |ΔM| ≈ |V| × Δx
    assert_close(dm.abs(), (v_avg * elem_len).abs(), 0.10,
        "dM/dx = V: |ΔM| ≈ |V×Δx|");
}

// ================================================================
// 3. SS Beam + Center Load: V Discontinuity
// ================================================================

#[test]
fn validation_sfd_v_discontinuity() {
    let l = 6.0;
    let n = 6;
    let p = 20.0;

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: mid, fx: 0.0, fz: -p, my: 0.0,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Left of load: V = P/2 (positive)
    let ef_left = results.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    // Right of load: V = -P/2
    let ef_right = results.element_forces.iter().find(|e| e.element_id == n / 2 + 1).unwrap();

    // V changes by P at the load point
    let v_jump = ef_left.v_end - ef_right.v_start;
    assert_close(v_jump.abs(), p, 0.02,
        "V discontinuity: ΔV = P at load point");

    // M is maximum at load point
    let m_max = ef_left.m_end;
    assert_close(m_max.abs(), p * l / 4.0, 0.02,
        "M_max = PL/4 at center");
}

// ================================================================
// 4. Cantilever + UDL: Linear V, Parabolic M
// ================================================================

#[test]
fn validation_sfd_cantilever_udl() {
    let l = 5.0;
    let n = 10;
    let q: f64 = -10.0;

    let loads: Vec<SolverLoad> = (1..=n)
        .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i, q_i: q, q_j: q, a: None, b: None,
        }))
        .collect();
    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // At free end: V=0, M=0
    let ef_tip = results.element_forces.iter().find(|e| e.element_id == n).unwrap();
    assert!(ef_tip.v_end.abs() < 0.5,
        "Cantilever tip: V ≈ 0: {:.4}", ef_tip.v_end);
    assert!(ef_tip.m_end.abs() < 0.5,
        "Cantilever tip: M ≈ 0: {:.4}", ef_tip.m_end);

    // At fixed end: V = qL, M = qL²/2
    let ef_base = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef_base.v_start.abs(), q.abs() * l, 0.02,
        "Cantilever base: V = qL");
    assert_close(ef_base.m_start.abs(), q.abs() * l * l / 2.0, 0.02,
        "Cantilever base: M = qL²/2");
}

// ================================================================
// 5. Fixed-Fixed + UDL: V=0 at Midspan
// ================================================================

#[test]
fn validation_sfd_fixed_udl() {
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

    // At midspan: V = 0 (by symmetry)
    let mid_elem = n / 2;
    let ef = results.element_forces.iter().find(|e| e.element_id == mid_elem).unwrap();
    assert!(ef.v_end.abs() < 0.5,
        "Fixed UDL: V ≈ 0 at midspan: {:.4}", ef.v_end);
}

// ================================================================
// 6. V Jumps at Concentrated Loads
// ================================================================

#[test]
fn validation_sfd_v_jumps() {
    let l = 12.0;
    let n = 12;

    let p1 = 10.0;
    let p2 = 15.0;

    // Two point loads at L/4 and 3L/4
    let loads = vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -p1, my: 0.0 }),
        SolverLoad::Nodal(SolverNodalLoad { node_id: 10, fx: 0.0, fz: -p2, my: 0.0 }),
    ];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // At node 4: V jumps by P1
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();
    let jump1 = (ef_left.v_end - ef_right.v_start).abs();
    assert_close(jump1, p1, 0.05,
        "V jump at P1: ΔV = P1");

    // At node 10: V jumps by P2
    let ef_left2 = results.element_forces.iter().find(|e| e.element_id == 9).unwrap();
    let ef_right2 = results.element_forces.iter().find(|e| e.element_id == 10).unwrap();
    let jump2 = (ef_left2.v_end - ef_right2.v_start).abs();
    assert_close(jump2, p2, 0.05,
        "V jump at P2: ΔV = P2");
}

// ================================================================
// 7. M Jump at Concentrated Moment
// ================================================================

#[test]
fn validation_sfd_m_jump() {
    let l = 6.0;
    let n = 6;
    let m_app = 10.0;

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: 4, fx: 0.0, fz: 0.0, my: m_app,
    })];
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Moment should jump by m_app at node 4
    let ef_left = results.element_forces.iter().find(|e| e.element_id == 3).unwrap();
    let ef_right = results.element_forces.iter().find(|e| e.element_id == 4).unwrap();

    let m_jump = (ef_left.m_end - ef_right.m_start).abs();
    assert_close(m_jump, m_app, 0.10,
        "M jump at concentrated moment: ΔM = M_applied");
}

// ================================================================
// 8. Internal Hinge: M = 0
// ================================================================

#[test]
fn validation_sfd_internal_hinge() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    // Build beam with hinge at midspan element junction
    // hinge_end on element n/2 means M=0 at the end of that element
    let mid = n / 2;

    let nodes_data: Vec<(usize, f64, f64)> = (0..=n).map(|i| {
        (i + 1, i as f64 * l / n as f64, 0.0)
    }).collect();

    let mut elems_data: Vec<(usize, &str, usize, usize, usize, usize, bool, bool)> = Vec::new();
    for i in 0..n {
        let hinge_end = i + 1 == mid; // hinge at end of mid element
        elems_data.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, hinge_end));
    }

    let loads = vec![SolverLoad::Nodal(SolverNodalLoad {
        node_id: n / 2 + 1, fx: 0.0, fz: -p, my: 0.0,
    })];

    let input = make_input(
        nodes_data,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems_data,
        vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        loads,
    );
    let results = linear::solve_2d(&input).unwrap();

    // At hinge location, moment should be zero
    let ef = results.element_forces.iter().find(|e| e.element_id == mid).unwrap();
    assert!(ef.m_end.abs() < 0.5,
        "Internal hinge: M ≈ 0: {:.4}", ef.m_end);
}
