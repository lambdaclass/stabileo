/// Validation: Roark's Formulas for Stress and Strain
///
/// References:
///   - Young, Budynas & Sadegh, "Roark's Formulas for Stress and Strain", 9th Ed.
///   - Table 8.1: Beams; Shear, Moment, and Deflection Formulas
///   - Table 9.1: Arches and Rings
///
/// Tests verify exact formulas from Roark's tables:
///   1. Table 8.1 Case 1a: SS beam center load δ = PL³/(48EI)
///   2. Table 8.1 Case 1e: SS beam UDL δ = 5wL⁴/(384EI)
///   3. Table 8.1 Case 2a: Cantilever end load δ = PL³/(3EI)
///   4. Table 8.1 Case 2e: Cantilever UDL δ = wL⁴/(8EI)
///   5. Table 8.1 Case 3a: Fixed-fixed center load δ = PL³/(192EI)
///   6. Table 8.1 Case 2c: Cantilever end moment δ = ML²/(2EI)
///   7. Table 8.1 Case 1c: SS beam end moment θ = ML/(3EI)
///   8. Roark's fixed-guided beam: δ = PL³/(12EI)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. SS Beam Center Load: δ = PL³/(48EI) — Roark Table 8.1 Case 1a
// ================================================================

#[test]
fn validation_roark_ss_center_load() {
    let l = 6.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    let delta_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 1a: δ={:.6e}, exact PL³/(48EI)={:.6e}", d_mid.uy.abs(), delta_exact);
}

// ================================================================
// 2. SS Beam UDL: δ = 5wL⁴/(384EI) — Roark Table 8.1 Case 1e
// ================================================================

#[test]
fn validation_roark_ss_udl() {
    let l = 8.0;
    let n = 8;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let input = make_ss_beam_udl(n, l, E, A, IZ, q);
    let results = linear::solve_2d(&input).unwrap();

    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    let delta_exact = 5.0 * q.abs() * l.powi(4) / (384.0 * e_eff * IZ);
    let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 1e: δ={:.6e}, exact 5wL⁴/(384EI)={:.6e}", d_mid.uy.abs(), delta_exact);
}

// ================================================================
// 3. Cantilever End Load: δ = PL³/(3EI) — Roark Table 8.1 Case 2a
// ================================================================

#[test]
fn validation_roark_cantilever_end_load() {
    let l = 5.0;
    let n = 8;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let err = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 2a: δ={:.6e}, exact PL³/(3EI)={:.6e}", tip.uy.abs(), delta_exact);

    // Also check tip rotation: θ = PL²/(2EI)
    let theta_exact = p * l.powi(2) / (2.0 * e_eff * IZ);
    let err_t = (tip.rz.abs() - theta_exact).abs() / theta_exact;
    assert!(err_t < 0.05,
        "Roark 2a θ: {:.6e}, exact PL²/(2EI)={:.6e}", tip.rz.abs(), theta_exact);
}

// ================================================================
// 4. Cantilever UDL: δ = wL⁴/(8EI) — Roark Table 8.1 Case 2e
// ================================================================

#[test]
fn validation_roark_cantilever_udl() {
    let l = 6.0;
    let n = 8;
    let q = -10.0;
    let e_eff = E * 1000.0;

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad::Distributed(SolverDistributedLoad {
            element_id: i + 1, q_i: q, q_j: q, a: None, b: None,
        }));
    }

    let input = make_beam(n, l, E, A, IZ, "fixed", None, loads);
    let results = linear::solve_2d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = q.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    let err = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 2e: δ={:.6e}, exact wL⁴/(8EI)={:.6e}", tip.uy.abs(), delta_exact);
}

// ================================================================
// 5. Fixed-Fixed Center Load: δ = PL³/(192EI) — Roark Table 8.1 Case 3a
// ================================================================

#[test]
fn validation_roark_fixed_fixed_center_load() {
    let l = 8.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "fixed", Some("fixed"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fy: -p, mz: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    let err = (d_mid.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 3a: δ={:.6e}, exact PL³/(192EI)={:.6e}", d_mid.uy.abs(), delta_exact);

    // End moments = PL/8
    let m_exact = p * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_m = (r1.mz.abs() - m_exact).abs() / m_exact;
    assert!(err_m < 0.05,
        "Roark 3a M_end: {:.4}, expected PL/8={:.4}", r1.mz.abs(), m_exact);
}

// ================================================================
// 6. Cantilever End Moment: δ = ML²/(2EI) — Roark Table 8.1 Case 2c
// ================================================================

#[test]
fn validation_roark_cantilever_end_moment() {
    let l = 5.0;
    let n = 8;
    let m = 20.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: 0.0, mz: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Tip deflection δ = ML²/(2EI)
    let delta_exact = m * l.powi(2) / (2.0 * e_eff * IZ);
    let err = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark 2c: δ={:.6e}, exact ML²/(2EI)={:.6e}", tip.uy.abs(), delta_exact);

    // Tip rotation θ = ML/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    let err_t = (tip.rz.abs() - theta_exact).abs() / theta_exact;
    assert!(err_t < 0.05,
        "Roark 2c θ: {:.6e}, exact ML/(EI)={:.6e}", tip.rz.abs(), theta_exact);
}

// ================================================================
// 7. SS Beam End Moment: θ_near = ML/(3EI) — Roark Table 8.1 Case 1c
// ================================================================
//
// Applied moment M at left end of SS beam.
// θ_left = ML/(3EI), θ_right = ML/(6EI).

#[test]
fn validation_roark_ss_end_moment() {
    let l = 6.0;
    let n = 8;
    let m = 30.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fy: 0.0, mz: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Rotation at left (applied moment end)
    let d_left = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let theta_near = m * l / (3.0 * e_eff * IZ);
    let err = (d_left.rz.abs() - theta_near).abs() / theta_near;
    assert!(err < 0.05,
        "Roark 1c θ_near: {:.6e}, exact ML/(3EI)={:.6e}", d_left.rz.abs(), theta_near);

    // Rotation at right (far end)
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_far = m * l / (6.0 * e_eff * IZ);
    let err_f = (d_right.rz.abs() - theta_far).abs() / theta_far;
    assert!(err_f < 0.05,
        "Roark 1c θ_far: {:.6e}, exact ML/(6EI)={:.6e}", d_right.rz.abs(), theta_far);
}

// ================================================================
// 8. Fixed-Guided Beam: δ = PL³/(12EI) — Roark Table 8.1 Case 4a
// ================================================================
//
// One end fixed, other end guided (translation free, rotation fixed).
// Equivalent to guidedX support at free end.
// δ = PL³/(12EI), M_fixed = PL/2, M_guided = PL/2.

#[test]
fn validation_roark_fixed_guided() {
    let l = 6.0;
    let n = 8;
    let p = 15.0;
    let e_eff = E * 1000.0;

    // guidedX: uy fixed, rz fixed, ux free → actually that's not what we want.
    // We want: uy free (vertical translation), rz fixed (no rotation).
    // This is guidedY: ux+rz fixed, uy free.
    // Actually for a vertical load on horizontal beam:
    // "guided" means the end can translate vertically but cannot rotate.
    // We can simulate this with a roller that also restrains rotation.
    // Use make_input with custom supports.

    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

    // Fixed at left, "guided" at right: uy free, ux restrained, rz restrained
    // This is guidedY support type
    let sups = vec![
        (1, 1_usize, "fixed"),
        (2, n + 1, "guidedY"),
    ];

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        elems,
        sups,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fy: -p, mz: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // δ = PL³/(12EI)
    let delta_exact = p * l.powi(3) / (12.0 * e_eff * IZ);
    let err = (tip.uy.abs() - delta_exact).abs() / delta_exact;
    assert!(err < 0.05,
        "Roark fixed-guided: δ={:.6e}, exact PL³/(12EI)={:.6e}", tip.uy.abs(), delta_exact);

    // Rotation at guided end should be ≈ 0
    assert!(tip.rz.abs() < 1e-8,
        "Guided end rotation should be 0: rz={:.6e}", tip.rz);
}
