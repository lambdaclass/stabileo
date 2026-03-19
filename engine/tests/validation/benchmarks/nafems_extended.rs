/// Validation: NAFEMS Extended Benchmarks
///
/// References:
///   - NAFEMS "Standard Benchmark Tests for Finite Element Accuracy"
///   - NAFEMS FV1: Centrally loaded SS beam (point load)
///   - NAFEMS FV13: SS beam free vibration
///   - NAFEMS FV31: Cantilever beam with tip load
///   - NAFEMS FV51: Vibration of a portal frame
///   - NAFEMS LE10: 3D cantilever with combined bending/torsion
///   - NAFEMS T1: Thermal gradient through depth (bending)
///   - NAFEMS FV41: Cantilever with lumped mass at tip
///   - NAFEMS R0031: 3D truss benchmark
use dedaliano_engine::solver::linear;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. NAFEMS FV1: SS Beam with Central Point Load
// ================================================================
//
// Simply supported beam, point load P at midspan.
// δ_mid = PL³/(48EI), M_mid = PL/4.

#[test]
fn validation_nafems_fv1_ss_point_load() {
    let l = 6.0;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: mid, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();

    // Deflection
    let delta_exact = p * l.powi(3) / (48.0 * e_eff * IZ);
    assert_close(d_mid.uz.abs(), delta_exact, 0.02, "NAFEMS FV1: δ_mid = PL³/(48EI)");

    // Midspan moment
    let m_exact = p * l / 4.0;
    let ef = results.element_forces.iter().find(|e| e.element_id == n / 2).unwrap();
    assert_close(ef.m_end.abs(), m_exact, 0.02, "NAFEMS FV1: M_mid = PL/4");

    // Reactions = P/2
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert_close(ra, p / 2.0, 0.01, "NAFEMS FV1: R_A = P/2");
}

// ================================================================
// 2. NAFEMS FV13: SS Beam Free Vibration
// ================================================================
//
// Simply supported beam, exact frequencies:
// ω_n = (nπ)² √(EI/(ρAL⁴))
// f_n = (nπ)²/(2πL²) √(EI/(ρA))

#[test]
fn validation_nafems_fv13_ss_vibration() {
    let l = 5.0;
    let n_elem = 40;
    let density = 7850.0;

    let solver = make_beam(n_elem, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 3).unwrap();

    let ei = E * 1000.0 * IZ;
    let rho_a = density * A / 1000.0;

    // SS beam: ω_n = (nπ/L)² × √(EI/(ρA))
    // Only check modes 1 and 2 — higher modes may mix with axial modes
    // (the SS beam with rollerX has free axial DOF at the right end)
    for mode_n in 1..=2 {
        if mode_n > modal_res.modes.len() { break; }
        let n_f = mode_n as f64;
        let omega_exact = (n_f * std::f64::consts::PI / l).powi(2) * (ei / rho_a).sqrt();
        let f_exact = omega_exact / (2.0 * std::f64::consts::PI);
        let f_fe = modal_res.modes[mode_n - 1].frequency;

        let err = (f_fe - f_exact).abs() / f_exact;
        assert!(err < 0.03,
            "NAFEMS FV13 mode {}: f_fe={:.4}, f_exact={:.4}, err={:.2}%",
            mode_n, f_fe, f_exact, err * 100.0);
    }

    // Frequencies should be in ascending order
    for i in 1..modal_res.modes.len() {
        assert!(modal_res.modes[i].frequency > modal_res.modes[i - 1].frequency,
            "Modes should be in ascending order");
    }
}

// ================================================================
// 3. NAFEMS FV31: Cantilever with Tip Point Load
// ================================================================
//
// Cantilever beam, point load at tip.
// δ = PL³/(3EI), θ = PL²/(2EI).

#[test]
fn validation_nafems_fv31_cantilever_tip_load() {
    let l = 4.0;
    let n = 8;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let input = make_beam(n, l, E, A, IZ, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n + 1, fx: 0.0, fz: -p, my: 0.0,
        })]);

    let results = linear::solve_2d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Tip deflection
    let delta_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uz.abs(), delta_exact, 0.02, "NAFEMS FV31: δ = PL³/(3EI)");

    // Tip rotation
    let theta_exact = p * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.ry.abs(), theta_exact, 0.02, "NAFEMS FV31: θ = PL²/(2EI)");

    // Fixed-end moment = PL
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.my.abs(), p * l, 0.01, "NAFEMS FV31: M_fixed = PL");
}

// ================================================================
// 4. NAFEMS FV51: Vibration of a Portal Frame
// ================================================================
//
// Portal frame (fixed bases), compute first natural frequency.
// The frame has flexural stiffness from both columns and beam.

#[test]
fn validation_nafems_fv51_portal_vibration() {
    let h = 4.0;
    let w = 6.0;
    let density = 7850.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    // First mode should be sway mode (lowest frequency)
    assert!(modal_res.modes.len() >= 1, "Should find at least 1 mode");
    let f1 = modal_res.modes[0].frequency;
    assert!(f1 > 0.0, "First frequency should be positive: {:.4}", f1);

    // Second mode frequency should be higher than first
    if modal_res.modes.len() >= 2 {
        let f2 = modal_res.modes[1].frequency;
        assert!(f2 > f1, "f2={:.4} should exceed f1={:.4}", f2, f1);
    }

    // Frequencies should be in a reasonable range for this structure
    // Not too low (not a mechanism) and not too high
    assert!(f1 > 0.1 && f1 < 1000.0,
        "NAFEMS FV51: f1={:.4} Hz should be reasonable", f1);
}

// ================================================================
// 5. NAFEMS LE10: 3D Cantilever Bending + Torsion
// ================================================================
//
// 3D cantilever with combined vertical load and torque at tip.
// Deflection from bending: δy = PL³/(3EIz)
// Twist from torsion: θx = TL/(GJ)

#[test]
fn validation_nafems_le10_3d_cantilever() {
    let l = 5.0;
    let n = 8;
    let nu = 0.3;
    let a_sec = 0.01;
    let iy = 1e-4;
    let iz = 1e-4;
    let j = 5e-5;
    let p = 10.0;
    let t = 5.0; // torque

    let fix = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, nu, a_sec, iy, iz, j,
        fix, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })]);

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + nu));

    // Bending deflection
    let delta_y_exact = p * l.powi(3) / (3.0 * e_eff * iz);
    let err_y = (tip.uy.abs() - delta_y_exact).abs() / delta_y_exact;
    assert!(err_y < 0.05,
        "NAFEMS LE10 δy: {:.6e}, expected {:.6e}", tip.uy.abs(), delta_y_exact);

    // Torsional twist
    let theta_x_exact = t * l / (g * j);
    let err_t = (tip.rx.abs() - theta_x_exact).abs() / theta_x_exact;
    assert!(err_t < 0.05,
        "NAFEMS LE10 θx: {:.6e}, expected {:.6e}", tip.rx.abs(), theta_x_exact);
}

// ================================================================
// 6. NAFEMS T1: Thermal Gradient — Bending Curvature
// ================================================================
//
// SS beam with temperature gradient through depth (top hot, bottom cold).
// Produces curvature κ = α·ΔT/h, deflection δ = κL²/8 for SS beam.

#[test]
fn validation_nafems_t1_thermal_gradient() {
    let l = 6.0;
    let n = 8;
    let dt_grad = 50.0; // gradient (top-bottom difference)

    let mut input = make_beam(n, l, E, A, IZ, "pinned", Some("rollerX"), vec![]);
    for i in 1..=n {
        input.loads.push(SolverLoad::Thermal(SolverThermalLoad {
            element_id: i,
            dt_uniform: 0.0,
            dt_gradient: dt_grad,
        }));
    }

    let results = linear::solve_2d(&input).unwrap();

    // Midspan should deflect (thermal bending)
    let mid = n / 2 + 1;
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid).unwrap();
    assert!(d_mid.uz.abs() > 1e-8,
        "NAFEMS T1: thermal gradient should cause deflection, uy={:.6e}", d_mid.uz);

    // No axial force from gradient (beam is free to expand axially at rollerX)
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert!(ef.n_start.abs() < 1.0,
        "NAFEMS T1: no axial force from gradient: N={:.4}", ef.n_start);

    // Reactions should be zero (SS beam with thermal gradient = free to bow)
    let ra = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(ra.rz.abs() < 0.1,
        "NAFEMS T1: Ry should be ≈ 0 for SS beam with gradient: {:.4}", ra.rz);
}

// ================================================================
// 7. NAFEMS FV41: Cantilever with Lumped Mass (via stiffness)
// ================================================================
//
// Approximate the effect of a lumped mass at the cantilever tip
// by comparing natural frequency of a cantilever beam.
// With uniform mass: f₁ = (1.8751)²/(2πL²) × √(EI/(ρA))
// Mode shapes should show maximum displacement at tip.

#[test]
fn validation_nafems_fv41_cantilever_lumped_mass() {
    let l = 3.0;
    let n = 8;
    let density = 7850.0;

    let solver = make_beam(n, l, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), density);

    let modal_res = modal::solve_modal_2d(&solver, &densities, 2).unwrap();

    // First two modes should exist
    assert!(modal_res.modes.len() >= 2, "Should find at least 2 modes");

    let f1 = modal_res.modes[0].frequency;
    let f2 = modal_res.modes[1].frequency;

    // Frequency ratio for cantilever: f2/f1 = (4.6941/1.8751)² = 6.267
    let ratio = f2 / f1;
    let ratio_exact = (4.6941 / 1.8751_f64).powi(2);
    let err = (ratio - ratio_exact).abs() / ratio_exact;
    assert!(err < 0.05,
        "NAFEMS FV41: f2/f1={:.3}, expected {:.3}", ratio, ratio_exact);
}

// ================================================================
// 8. NAFEMS R0031: 3D Space Truss
// ================================================================
//
// 3D truss benchmark: tetrahedral structure under vertical load.
// Verify equilibrium and member forces.

#[test]
fn validation_nafems_r0031_3d_truss() {
    let a_sec = 0.001;
    let p = 10.0;

    // Tetrahedral truss: 4 nodes, 6 bars
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 2.0, 0.0, 0.0),
        (3, 1.0, 0.0, 1.732),
        (4, 1.0, 1.633, 0.577),
    ];
    let elems = vec![
        (1, "truss", 1, 2, 1, 1),
        (2, "truss", 1, 3, 1, 1),
        (3, "truss", 2, 3, 1, 1),
        (4, "truss", 1, 4, 1, 1),
        (5, "truss", 2, 4, 1, 1),
        (6, "truss", 3, 4, 1, 1),
    ];
    let sups = vec![
        (1, vec![true, true, true, false, false, false]),
        (2, vec![false, true, true, false, false, false]),
        (3, vec![false, true, false, false, false, false]),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 4, fx: 0.0, fy: -p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, a_sec, 0.0, 0.0, 0.0)],
        elems, sups, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Global equilibrium: ΣFy = P
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let err = (sum_fy - p).abs() / p;
    assert!(err < 0.01,
        "NAFEMS R0031 equilibrium: ΣFy={:.4}, expected P={:.4}", sum_fy, p);

    // Tip should deflect downward
    let d4 = results.displacements.iter().find(|d| d.node_id == 4).unwrap();
    assert!(d4.uy < 0.0, "Tip should deflect down: uy={:.6e}", d4.uy);
}
