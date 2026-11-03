/// Validation: Roark's Formulas for Stress and Strain
///
/// Reference: Young & Budynas, "Roark's Formulas for Stress and Strain", 7th Ed., Table 8.1.
/// Its cases are numbered by load (1 concentrated load, 2 distributed load, 3 concentrated
/// moment) and lettered by end conditions (a free–fixed, b guided–fixed, d fixed–fixed,
/// e simply supported at both ends); a cantilever's fixed end is Roark's right end.
///
/// Cubic Hermite (Euler–Bernoulli) elements are nodally exact for these loads, so every check
/// is at TOL = 1e-9 relative. E = 200 GPa, Iz = 1e-4 m⁴ (EI = 20 000 kN·m²):
///   1. Case 1e, a = l/2:   δ = PL³/(48EI)   P=20, L=6  → 4.5e-3 m
///   2. Case 2e, uniform:   δ = 5wL⁴/(384EI) w=10, L=8  → 2.6666667e-2 m
///   3. Case 1a, a = 0:     δ = PL³/(3EI)    P=15, L=5  → 3.125e-2 m, θ = PL²/(2EI) → 9.375e-3
///   4. Case 2a, uniform:   δ = wL⁴/(8EI)    w=10, L=6  → 8.1e-2 m
///   5. Case 1d, a = l/2:   δ = PL³/(192EI)  P=20, L=8  → 2.6666667e-3 m, M = PL/8 → 20 kN·m
///   6. Case 3a, a = 0:     δ = ML²/(2EI)    M=20, L=5  → 1.25e-2 m, θ = ML/(EI) → 5e-3
///   7. Case 3e, a = 0:     θ = ML/(3EI), ML/(6EI)  M=30, L=6 → 3e-3, 1.5e-3
///   8. Case 1b, a = 0:     δ = PL³/(12EI)   P=15, L=6  → 1.35e-2 m
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const TOL: f64 = 1e-9;

// ================================================================
// 1. SS Beam Center Load: δ = PL³/(48EI) — Roark Table 8.1 Case 1e (a = l/2)
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
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    let delta_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    let err = (d_mid.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 1e: δ={:.6e}, exact PL³/(48EI)={:.6e}", d_mid.uz.abs(), delta_exact);
}

// ================================================================
// 2. SS Beam UDL: δ = 5wL⁴/(384EI) — Roark Table 8.1 Case 2e (uniform)
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
    let err = (d_mid.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 2e: δ={:.6e}, exact 5wL⁴/(384EI)={:.6e}", d_mid.uz.abs(), delta_exact);
}

// ================================================================
// 3. Cantilever End Load: δ = PL³/(3EI) — Roark Table 8.1 Case 1a (a = 0)
// ================================================================

#[test]
fn validation_roark_cantilever_end_load() {
    let l = 5.0;
    let n = 8;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 1a: δ={:.6e}, exact PL³/(3EI)={:.6e}", tip.uz.abs(), delta_exact);

    // Also check tip rotation: θ = PL²/(2EI)
    let theta_exact = p * l.powi(2) / (2.0 * e_eff * IZ);
    let err_t = (tip.ry.abs() - theta_exact).abs() / theta_exact;
    assert!(err_t < TOL,
        "Roark 1a θ: {:.6e}, exact PL²/(2EI)={:.6e}", tip.ry.abs(), theta_exact);
}

// ================================================================
// 4. Cantilever UDL: δ = wL⁴/(8EI) — Roark Table 8.1 Case 2a (uniform)
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
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 2a: δ={:.6e}, exact wL⁴/(8EI)={:.6e}", tip.uz.abs(), delta_exact);
}

// ================================================================
// 5. Fixed-Fixed Center Load: δ = PL³/(192EI) — Roark Table 8.1 Case 1d (a = l/2)
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
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap();

    let delta_exact = p * l.powi(3) / (192.0 * e_eff * IZ);
    let err = (d_mid.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 1d: δ={:.6e}, exact PL³/(192EI)={:.6e}", d_mid.uz.abs(), delta_exact);

    // End moments = PL/8
    let m_exact = p * l / 8.0;
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let err_m = (r1.my.abs() - m_exact).abs() / m_exact;
    assert!(err_m < TOL,
        "Roark 1d M_end: {:.4}, expected PL/8={:.4}", r1.my.abs(), m_exact);
}

// ================================================================
// 6. Cantilever End Moment: δ = ML²/(2EI) — Roark Table 8.1 Case 3a (a = 0)
// ================================================================

#[test]
fn validation_roark_cantilever_end_moment() {
    let l = 5.0;
    let n = 8;
    let m = 20.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Tip deflection δ = ML²/(2EI)
    let delta_exact = m * l.powi(2) / (2.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 3a: δ={:.6e}, exact ML²/(2EI)={:.6e}", tip.uz.abs(), delta_exact);

    // Tip rotation θ = ML/(EI)
    let theta_exact = m * l / (e_eff * IZ);
    let err_t = (tip.ry.abs() - theta_exact).abs() / theta_exact;
    assert!(err_t < TOL,
        "Roark 3a θ: {:.6e}, exact ML/(EI)={:.6e}", tip.ry.abs(), theta_exact);
}

// ================================================================
// 7. SS Beam End Moment: θ_near = ML/(3EI) — Roark Table 8.1 Case 3e (a = 0)
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
            node_id: 1, fx: 0.0, fz: 0.0, my: m,
        })]);

    let results = linear::solve_2d(&input).unwrap();

    // Rotation at left (applied moment end)
    let d_left = results.displacements.iter()
        .find(|d| d.node_id == 1).unwrap();
    let theta_near = m * l / (3.0 * e_eff * IZ);
    let err = (d_left.ry.abs() - theta_near).abs() / theta_near;
    assert!(err < TOL,
        "Roark 3e θ_near: {:.6e}, exact ML/(3EI)={:.6e}", d_left.ry.abs(), theta_near);

    // Rotation at right (far end)
    let d_right = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_far = m * l / (6.0 * e_eff * IZ);
    let err_f = (d_right.ry.abs() - theta_far).abs() / theta_far;
    assert!(err_f < TOL,
        "Roark 3e θ_far: {:.6e}, exact ML/(6EI)={:.6e}", d_right.ry.abs(), theta_far);
}

// ================================================================
// 8. Fixed-Guided Beam: δ = PL³/(12EI) — Roark Table 8.1 Case 1b (a = 0)
// ================================================================
//
// Fixed at the left, guided at the right ("guidedY": ux and ry fixed, uz free).

#[test]
fn validation_roark_fixed_guided() {
    let l = 6.0;
    let n = 8;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * l / n as f64, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();

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
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })],
    );

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // δ = PL³/(12EI)
    let delta_exact = p * l.powi(3) / (12.0 * e_eff * IZ);
    let err = (tip.uz.abs() - delta_exact).abs() / delta_exact;
    assert!(err < TOL,
        "Roark 1b fixed-guided: δ={:.6e}, exact PL³/(12EI)={:.6e}", tip.uz.abs(), delta_exact);

    // Rotation at guided end should be ≈ 0
    assert!(tip.ry.abs() < 1e-8,
        "Guided end rotation should be 0: rz={:.6e}", tip.ry);
}
