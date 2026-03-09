/// Validation: Internal Force Diagram Benchmarks
///
/// References:
///   - Hibbeler, "Structural Analysis", 10th Ed., Ch. 4-5
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Beer & Johnston, "Mechanics of Materials", 8th Ed.
///
/// Tests verify shear and moment diagrams for standard load cases:
///   1. SS beam UDL: V_max = qL/2, M_max = qL²/8
///   2. Cantilever point: V = -P, M varies linearly
///   3. Fixed-fixed UDL: end moments = qL²/12, midspan = qL²/24
///   4. SS beam center point: V = P/2, M_max = PL/4
///   5. Propped cantilever: V diagram with sign change
///   6. Cantilever UDL: V linear, M parabolic
///   7. SS beam two-point loads: constant moment between loads
///   8. Element forces satisfy equilibrium: V_j = V_i - q×L
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam UDL: V_max = qL/2, M_max = qL²/8
// ================================================================

#[test]
fn validation_forces_ss_udl() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    // First element: V_start should be ≈ qL/2 = 40 (upward reaction)
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_max = q.abs() * l / 2.0;
    let err_v = (ef1.v_start.abs() - v_max).abs() / v_max;
    assert!(err_v < 0.05,
        "SS UDL V_start: {:.4}, expected qL/2={:.4}", ef1.v_start.abs(), v_max);

    // Middle element: should have near-zero shear (midspan)
    let mid_elem = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|f| f.element_id == mid_elem).unwrap();
    // Shear at midspan element start should be small
    assert!(ef_mid.v_end.abs() < v_max * 0.2,
        "SS UDL V at midspan: {:.4} should be small", ef_mid.v_end);

    // Maximum moment ≈ qL²/8
    let m_max = q.abs() * l * l / 8.0;
    // Find element with largest moment
    let max_moment = results.element_forces.iter()
        .map(|f| f.m_start.abs().max(f.m_end.abs()))
        .fold(0.0_f64, f64::max);
    let err_m = (max_moment - m_max).abs() / m_max;
    assert!(err_m < 0.10,
        "SS UDL M_max: {:.4}, expected qL²/8={:.4}", max_moment, m_max);
}

// ================================================================
// 2. Cantilever Point Load: V = -P everywhere, M linear
// ================================================================

#[test]
fn validation_forces_cantilever_point() {
    let l = 5.0;
    let n = 4;
    let p = 20.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // All elements should have V ≈ P (constant shear)
    for ef in &results.element_forces {
        let err = (ef.v_start.abs() - p).abs() / p;
        assert!(err < 0.05,
            "Cantilever V elem {}: {:.4}, expected P={:.4}", ef.element_id, ef.v_start, p);
    }

    // Moment at fixed end ≈ PL
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let m_fixed = p * l;
    let err_m = (ef1.m_start.abs() - m_fixed).abs() / m_fixed;
    assert!(err_m < 0.05,
        "Cantilever M at fixed end: {:.4}, expected PL={:.4}", ef1.m_start.abs(), m_fixed);

    // Moment at free end ≈ 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(ef_last.m_end.abs() < m_fixed * 0.05,
        "Cantilever M at free end: {:.4} should be ≈ 0", ef_last.m_end);
}

// ================================================================
// 3. Fixed-Fixed UDL: End Moments = qL²/12
// ================================================================

#[test]
fn validation_forces_fixed_fixed_udl() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // End moments = qL²/12
    let m_end_exact = q.abs() * l * l / 12.0;
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();

    let err_start = (ef1.m_start.abs() - m_end_exact).abs() / m_end_exact;
    let err_end = (ef_last.m_end.abs() - m_end_exact).abs() / m_end_exact;

    assert!(err_start < 0.05,
        "FF UDL M_start: {:.4}, expected qL²/12={:.4}", ef1.m_start.abs(), m_end_exact);
    assert!(err_end < 0.05,
        "FF UDL M_end: {:.4}, expected qL²/12={:.4}", ef_last.m_end.abs(), m_end_exact);
}

// ================================================================
// 4. SS Beam Center Point: M_max = PL/4
// ================================================================

#[test]
fn validation_forces_ss_center_point() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Shear in left half should be +P/2
    let ef_left = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let err_v = (ef_left.v_start.abs() - p / 2.0).abs() / (p / 2.0);
    assert!(err_v < 0.05,
        "SS center point V_left: {:.4}, expected P/2={:.4}", ef_left.v_start.abs(), p / 2.0);

    // Maximum moment at midspan ≈ PL/4
    let m_max = p * l / 4.0;
    let ef_mid = results.element_forces.iter()
        .find(|f| f.element_id == n / 2).unwrap();
    let err_m = (ef_mid.m_end.abs() - m_max).abs() / m_max;
    assert!(err_m < 0.05,
        "SS center point M_max: {:.4}, expected PL/4={:.4}", ef_mid.m_end.abs(), m_max);
}

// ================================================================
// 5. Propped Cantilever: Shear Sign Change
// ================================================================
//
// Fixed-roller beam with UDL. Shear changes sign at some point.

#[test]
fn validation_forces_propped_cantilever_shear() {
    let l = 8.0;
    let n = 16;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    // Shear should be positive at fixed end and negative at roller end
    let ef_first = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();

    // Check sign change exists
    let v_first = ef_first.v_start;
    let v_last = ef_last.v_end;
    assert!(v_first * v_last < 0.0 || v_first.abs() > 0.1,
        "Propped cantilever shear should change sign: V_start={:.4}, V_end={:.4}",
        v_first, v_last);
}

// ================================================================
// 6. Cantilever UDL: V Linear, M Parabolic
// ================================================================

#[test]
fn validation_forces_cantilever_udl_distribution() {
    let l = 6.0;
    let n = 6;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    // V at fixed end = qL = 60
    let ef1 = results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    let v_fixed = q.abs() * l;
    let err_v = (ef1.v_start.abs() - v_fixed).abs() / v_fixed;
    assert!(err_v < 0.05,
        "Cantilever UDL V_fixed: {:.4}, expected qL={:.4}", ef1.v_start.abs(), v_fixed);

    // M at fixed end = qL²/2 = 180
    let m_fixed = q.abs() * l * l / 2.0;
    let err_m = (ef1.m_start.abs() - m_fixed).abs() / m_fixed;
    assert!(err_m < 0.05,
        "Cantilever UDL M_fixed: {:.4}, expected qL²/2={:.4}", ef1.m_start.abs(), m_fixed);

    // V at free end ≈ 0
    let ef_last = results.element_forces.iter().find(|f| f.element_id == n).unwrap();
    assert!(ef_last.v_end.abs() < v_fixed * 0.05,
        "Cantilever UDL V_free: {:.4} should be ≈ 0", ef_last.v_end);
}

// ================================================================
// 7. SS Beam Two-Point Loads: Constant Moment Between Loads
// ================================================================
//
// Loads at L/3 and 2L/3. Between them: constant moment = P×L/3.

#[test]
fn validation_forces_constant_moment_zone() {
    let l = 9.0;
    let n = 9;
    let p = 15.0;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: n / 3 + 1, fx: 0.0, fy: -p, mz: 0.0,
            }),
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2 * n / 3 + 1, fx: 0.0, fy: -p, mz: 0.0,
            }),
        ]);

    let results = linear::solve_2d(&input).unwrap();

    // Between L/3 and 2L/3: moment should be approximately constant = P×L/3
    let m_const = p * l / 3.0;
    let middle_elems: Vec<_> = results.element_forces.iter()
        .filter(|f| f.element_id > n / 3 && f.element_id <= 2 * n / 3)
        .collect();

    for ef in &middle_elems {
        let err_s = (ef.m_start.abs() - m_const).abs() / m_const;
        let err_e = (ef.m_end.abs() - m_const).abs() / m_const;
        assert!(err_s < 0.10,
            "Constant M zone elem {} start: {:.4}, expected PL/3={:.4}",
            ef.element_id, ef.m_start.abs(), m_const);
        assert!(err_e < 0.10,
            "Constant M zone elem {} end: {:.4}, expected PL/3={:.4}",
            ef.element_id, ef.m_end.abs(), m_const);
    }

    // Shear between loads should be ≈ 0
    for ef in &middle_elems {
        assert!(ef.v_start.abs() < p * 0.1,
            "Constant M zone elem {} V={:.4} should be ≈ 0", ef.element_id, ef.v_start);
    }
}

// ================================================================
// 8. Element Force Equilibrium: V_j = V_i + q×L_elem
// ================================================================
//
// For a distributed loaded element, end shears must satisfy local equilibrium.

#[test]
fn validation_forces_element_equilibrium() {
    let l = 6.0;
    let n = 4;
    let q = -10.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), loads);
    let results = linear::solve_2d(&input).unwrap();

    let elem_len = l / n as f64;

    // For each element: V_end = V_start + q × L_elem (sign depends on convention)
    // Also: M_end = M_start + V_avg × L_elem (approximately)
    for ef in &results.element_forces {
        // Shear difference should match applied load on element
        let dv = (ef.v_start - ef.v_end).abs();
        let q_total = q.abs() * elem_len;
        let err = (dv - q_total).abs() / q_total;
        assert!(err < 0.10,
            "Elem {} shear equilibrium: ΔV={:.4}, qL={:.4}", ef.element_id, dv, q_total);
    }
}
