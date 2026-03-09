/// Validation: Basic 3D Torsion Behavior of Beam Elements
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., Ch. 3
///   - Roark's Formulas for Stress and Strain, 9th Ed., Ch. 9
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 3
///
/// Tests:
///   1. Pure torsion: cantilever with tip torque, theta = TL/(GJ)
///   2. Twist proportional to length: L doubles -> theta doubles
///   3. Twist inversely proportional to J: J doubles -> theta halves
///   4. Twist proportional to torque: T doubles -> theta doubles
///   5. Pure torsion produces no bending: only rx nonzero at tip
///   6. Fixed-fixed beam under torque at midspan: symmetric reactions
///   7. Torsional reaction: cantilever tip torque, reaction mx = -T
///   8. Combined torsion and bending: superposition (no interaction)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 1e-5;

// ================================================================
// 1. Pure Torsion: Cantilever with Tip Torque
// ================================================================
//
// Beam along X, fixed at start (node 1), torque T applied about X
// at the free end. Angle of twist at the tip:
//   theta = T * L / (G_eff * J)
// where G_eff = E_eff / (2*(1+nu)), E_eff = E * 1000 (kN/m^2).
//
// Ref: Gere & Goodno, "Mechanics of Materials" Section 3.3

#[test]
fn validation_pure_torsion_cantilever_tip_torque() {
    let l: f64 = 5.0;
    let n = 8;
    let t = 10.0; // kN*m torque about X-axis

    let g_eff = E * 1000.0 / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // theta = T * L / (G_eff * J)
    let theta_exact = t * l / (g_eff * J);
    assert_close(tip.rx.abs(), theta_exact, 0.02, "Pure torsion: rx at tip");
}

// ================================================================
// 2. Twist Proportional to Length
// ================================================================
//
// theta = T*L/(G*J), so doubling L doubles theta.
// Compare L=4 vs L=8 with the same torque and section.
//
// Ref: Roark's Formulas, Table 9-1

#[test]
fn validation_torsion_twist_proportional_to_length() {
    let l_short: f64 = 4.0;
    let l_long: f64 = 8.0;
    let n = 4;
    let t = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    let input_short = make_3d_beam(
        n, l_short, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let input_long = make_3d_beam(
        n, l_long, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let res_short = linear::solve_3d(&input_short).unwrap();
    let res_long = linear::solve_3d(&input_long).unwrap();

    let theta_short = res_short.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let theta_long = res_long.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // theta_long / theta_short = L_long / L_short = 2.0
    let ratio = theta_long / theta_short;
    let expected_ratio = l_long / l_short;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Twist proportional to length: ratio={:.4}, expected={:.1}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 3. Twist Inversely Proportional to J
// ================================================================
//
// theta = T*L/(G*J), so doubling J halves theta.
// Compare J=1e-5 vs J=2e-5 with same torque and length.
//
// Ref: Roark's Formulas, Section 9.1

#[test]
fn validation_torsion_twist_inversely_proportional_to_j() {
    let l: f64 = 5.0;
    let n = 4;
    let t = 10.0;
    let j_small = 1e-5;
    let j_large = 2e-5;

    let fixed = vec![true, true, true, true, true, true];

    let input_small = make_3d_beam(
        n, l, E, NU, A, IY, IZ, j_small,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let input_large = make_3d_beam(
        n, l, E, NU, A, IY, IZ, j_large,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let res_small = linear::solve_3d(&input_small).unwrap();
    let res_large = linear::solve_3d(&input_large).unwrap();

    let theta_small = res_small.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let theta_large = res_large.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // theta_small / theta_large = j_large / j_small = 2.0
    let ratio = theta_small / theta_large;
    let expected_ratio = j_large / j_small;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Twist inversely proportional to J: ratio={:.4}, expected={:.1}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 4. Twist Proportional to Torque
// ================================================================
//
// theta = T*L/(G*J), so doubling T doubles theta.
// Compare T=10 vs T=20 with same geometry.
//
// Ref: Gere & Goodno, "Mechanics of Materials" Section 3.3

#[test]
fn validation_torsion_twist_proportional_to_torque() {
    let l: f64 = 5.0;
    let n = 4;
    let t_small = 10.0;
    let t_large = 20.0;

    let fixed = vec![true, true, true, true, true, true];

    let input_small = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t_small, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let input_large = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t_large, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let res_small = linear::solve_3d(&input_small).unwrap();
    let res_large = linear::solve_3d(&input_large).unwrap();

    let theta_small = res_small.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();
    let theta_large = res_large.displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx.abs();

    // theta_large / theta_small = t_large / t_small = 2.0
    let ratio = theta_large / theta_small;
    let expected_ratio = t_large / t_small;
    let err = (ratio - expected_ratio).abs() / expected_ratio;
    assert!(err < 0.02,
        "Twist proportional to torque: ratio={:.4}, expected={:.1}, err={:.2}%",
        ratio, expected_ratio, err * 100.0);
}

// ================================================================
// 5. Pure Torsion Produces No Bending
// ================================================================
//
// Cantilever with only mx at tip. The torsional DOF (rx) is
// uncoupled from translational (uy, uz) and bending rotational
// (ry, rz) DOFs. Verify that only rx is nonzero at the tip.
//
// Ref: Przemieniecki, "Theory of Matrix Structural Analysis" Ch. 3

#[test]
fn validation_torsion_produces_no_bending() {
    let l: f64 = 5.0;
    let n = 8;
    let t = 10.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // rx should be nonzero (torsion is present)
    assert!(tip.rx.abs() > 1e-8,
        "Torsion should produce nonzero rx: rx={:.6e}", tip.rx);

    // All other DOFs should be essentially zero
    let tol = 1e-10;
    assert!(tip.uy.abs() < tol,
        "Pure torsion: uy should be zero, got {:.6e}", tip.uy);
    assert!(tip.uz.abs() < tol,
        "Pure torsion: uz should be zero, got {:.6e}", tip.uz);
    assert!(tip.ry.abs() < tol,
        "Pure torsion: ry should be zero, got {:.6e}", tip.ry);
    assert!(tip.rz.abs() < tol,
        "Pure torsion: rz should be zero, got {:.6e}", tip.rz);
    assert!(tip.ux.abs() < tol,
        "Pure torsion: ux should be zero, got {:.6e}", tip.ux);
}

// ================================================================
// 6. Fixed-Fixed Beam Under Torque at Midspan
// ================================================================
//
// 2-element beam, fixed at both ends, torque T applied at the
// middle node. By symmetry, each half resists T/2.
// Twist at midspan: theta_mid = (T/2)*(L/2) / (G_eff*J)
//                              = T*L / (4*G_eff*J)
//
// Ref: Roark's Formulas, Section 9.1; Gere & Goodno Ch. 3

#[test]
fn validation_torsion_fixed_fixed_midspan_torque() {
    let l: f64 = 6.0;
    let n = 2; // 2 elements, 3 nodes: node 1 (fixed), node 2 (mid), node 3 (fixed)
    let t = 12.0;

    let g_eff = E * 1000.0 / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed at start
        Some(vec![true, true, true, true, true, true]), // fixed at end
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Check reactions: each end should carry T/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.mx.abs(), t / 2.0, 0.02,
        "Fixed-fixed midspan torsion: start reaction = T/2");
    assert_close(r3.mx.abs(), t / 2.0, 0.02,
        "Fixed-fixed midspan torsion: end reaction = T/2");

    // Global equilibrium: sum of reaction torques = -T
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let eq_err = (sum_mx + t).abs() / t;
    assert!(eq_err < 0.01,
        "Fixed-fixed torsion equilibrium: sum_mx={:.4}, applied T={:.4}", sum_mx, t);

    // Twist at midspan: theta = T*L / (4*G_eff*J)
    let mid = results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let theta_mid_exact = t * l / (4.0 * g_eff * J);
    assert_close(mid.rx.abs(), theta_mid_exact, 0.02,
        "Fixed-fixed midspan twist: theta_mid");
}

// ================================================================
// 7. Torsional Reaction
// ================================================================
//
// Cantilever with tip torque T. The fixed end must resist with
// reaction mx = -T (equal and opposite).
//
// Ref: Gere & Goodno, "Mechanics of Materials" Section 3.3

#[test]
fn validation_torsion_reaction_at_fixed_end() {
    let l: f64 = 5.0;
    let n = 4;
    let t = 15.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // The only reaction is at node 1 (fixed end)
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Reaction torque must equal -T (opposing applied torque)
    assert_close(r1.mx, -t, 0.02, "Torsional reaction: mx = -T");

    // No other force reactions from pure torsion
    assert!(r1.fx.abs() < 1e-6,
        "Pure torsion: no axial reaction, fx={:.6e}", r1.fx);
    assert!(r1.fy.abs() < 1e-6,
        "Pure torsion: no shear reaction fy, fy={:.6e}", r1.fy);
    assert!(r1.fz.abs() < 1e-6,
        "Pure torsion: no shear reaction fz, fz={:.6e}", r1.fz);
    assert!(r1.my.abs() < 1e-6,
        "Pure torsion: no bending reaction my, my={:.6e}", r1.my);
    assert!(r1.mz.abs() < 1e-6,
        "Pure torsion: no bending reaction mz, mz={:.6e}", r1.mz);
}

// ================================================================
// 8. Combined Torsion and Bending (Superposition)
// ================================================================
//
// Cantilever with tip fz = P (bending) and tip mx = T (torsion)
// applied simultaneously. Since these DOFs are uncoupled:
//   rx = T*L / (G_eff * J)       (pure torsion formula)
//   uz = P*L^3 / (3*E_eff * Iy)  (pure bending formula)
// They should not interact.
//
// Ref: Gere & Goodno, "Mechanics of Materials" Section 6.3

#[test]
fn validation_torsion_combined_with_bending_superposition() {
    let l: f64 = 4.0;
    let n = 8;
    let p = -10.0; // fz (downward in Z)
    let t = 8.0;   // mx (torsion about X)

    let e_eff = E * 1000.0;
    let g_eff = e_eff / (2.0 * (1.0 + NU));

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: p,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Torsion: rx = T*L / (G_eff * J)
    let rx_exact = t * l / (g_eff * J);
    assert_close(tip.rx.abs(), rx_exact, 0.02,
        "Combined: torsion rx = T*L/(G*J)");

    // Bending: uz = P*L^3 / (3*E_eff*Iy)
    let uz_exact = p.abs() * l.powi(3) / (3.0 * e_eff * IY);
    assert_close(tip.uz.abs(), uz_exact, 0.05,
        "Combined: bending uz = P*L^3/(3*E*Iy)");

    // Verify no cross-coupling: run torsion-only and bending-only cases
    // and confirm combined = sum (superposition)
    let fixed = vec![true, true, true, true, true, true];

    // Torsion only
    let input_t = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: t, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_t = linear::solve_3d(&input_t).unwrap();
    let tip_t = res_t.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Bending only
    let input_b = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_b = linear::solve_3d(&input_b).unwrap();
    let tip_b = res_b.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined rx = torsion_rx + bending_rx
    let rx_sum = tip_t.rx + tip_b.rx;
    let rx_err = (tip.rx - rx_sum).abs() / tip.rx.abs().max(1e-12);
    assert!(rx_err < 0.01,
        "Superposition rx: combined={:.6e}, sum={:.6e}, err={:.2}%",
        tip.rx, rx_sum, rx_err * 100.0);

    // Superposition: combined uz = torsion_uz + bending_uz
    let uz_sum = tip_t.uz + tip_b.uz;
    let uz_err = (tip.uz - uz_sum).abs() / tip.uz.abs().max(1e-12);
    assert!(uz_err < 0.01,
        "Superposition uz: combined={:.6e}, sum={:.6e}, err={:.2}%",
        tip.uz, uz_sum, uz_err * 100.0);
}
