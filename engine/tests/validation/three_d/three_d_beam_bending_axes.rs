/// Validation: 3D Beam Bending About Different Axes
///
/// References:
///   - Timoshenko, "Strength of Materials"
///   - Gere & Timoshenko, "Mechanics of Materials"
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///
/// Tests:
///   1. Strong axis bending (cantilever, tip Fz)
///   2. Weak axis bending (cantilever, tip Fy)
///   3. Strong vs weak deflection ratio (Iz/Iy)
///   4. Biaxial bending: Fy and Fz simultaneous (superposition)
///   5. Cantilever tip moment about Z (bending in XY plane)
///   6. Cantilever with vertical UDL in Z
///   7. Equal Iy = Iz gives equal deflections for Y and Z loads
///   8. 3D equilibrium: force and moment balance
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 5e-5;
const IZ: f64 = 1e-4;
const J: f64 = 1e-5;
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Strong Axis Bending
// ================================================================
//
// 3D cantilever along X, tip load in Z direction (fz).
// Bending about Y axis uses Iy.
// Deflection: uz_tip = P*L^3 / (3*E_eff*Iy)

#[test]
fn validation_3d_strong_axis_bending_tip_fz() {
    let l = 5.0;
    let p = 10.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // uz_tip = P*L^3 / (3*E_eff*Iy)
    let uz_expected = p * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.uz.abs(), uz_expected, 0.02, "strong axis uz_tip");
}

// ================================================================
// 2. Weak Axis Bending
// ================================================================
//
// Same cantilever, tip load in Y direction (fy).
// Bending about Z axis uses Iz.
// Deflection: uy_tip = P*L^3 / (3*E_eff*Iz)

#[test]
fn validation_3d_weak_axis_bending_tip_fy() {
    let l = 5.0;
    let p = 10.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // uy_tip = P*L^3 / (3*E_eff*Iz)
    let uy_expected = p * l.powi(3) / (3.0 * E_EFF * IZ);

    assert_close(tip.uy.abs(), uy_expected, 0.02, "weak axis uy_tip");
}

// ================================================================
// 3. Strong vs Weak Deflection Ratio
// ================================================================
//
// For equal load magnitude, deflection ratio = Iz/Iy.
// Since Iz > Iy, the Z-direction (strong axis) deflects more
// because Iy is smaller: uz/uy = Iz/Iy.

#[test]
fn validation_3d_strong_vs_weak_deflection_ratio() {
    let l = 5.0;
    let p = 10.0;
    let n = 4;

    // Load in Z (bending about Y, uses Iy)
    let input_z = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let uz_tip = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // Load in Y (bending about Z, uses Iz)
    let input_y = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let uy_tip = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Ratio: uz/uy = (P*L^3/(3*E*Iy)) / (P*L^3/(3*E*Iz)) = Iz/Iy
    let expected_ratio = IZ / IY; // 1e-4 / 5e-5 = 2.0
    let actual_ratio = uz_tip / uy_tip;

    assert_close(actual_ratio, expected_ratio, 0.02, "deflection ratio Iz/Iy");
}

// ================================================================
// 4. Biaxial Bending: Fy and Fz Simultaneous
// ================================================================
//
// Apply both fy and fz at the cantilever tip.
// By superposition, uy should match the pure Fy case
// and uz should match the pure Fz case.

#[test]
fn validation_3d_biaxial_bending_superposition() {
    let l = 5.0;
    let fy = 10.0;
    let fz = 8.0;
    let n = 4;

    let fixed = vec![true, true, true, true, true, true];

    // Pure Fy case
    let input_fy = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_fy = linear::solve_3d(&input_fy).unwrap();
    let uy_pure = res_fy.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // Pure Fz case
    let input_fz = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_fz = linear::solve_3d(&input_fz).unwrap();
    let uz_pure = res_fz.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Combined Fy + Fz case
    let input_both = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_both = linear::solve_3d(&input_both).unwrap();
    let tip_both = res_both.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_both.uy, uy_pure, 0.02, "biaxial superposition uy");
    assert_close(tip_both.uz, uz_pure, 0.02, "biaxial superposition uz");
}

// ================================================================
// 5. Cantilever Tip Moment About Z
// ================================================================
//
// Apply mz at the tip of a cantilever (bending in XY plane).
// Moment about Z causes bending that deflects in Y.
// Tip rotation: rz = M*L / (E_eff*Iz)
// Tip deflection: uy = M*L^2 / (2*E_eff*Iz)

#[test]
fn validation_3d_cantilever_tip_moment_about_z() {
    let l = 5.0;
    let m = 5.0; // kN*m moment about Z
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
            mx: 0.0, my: 0.0, mz: m, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Tip rotation about Z: rz = M*L / (E_eff*Iz)
    let rz_expected = m * l / (E_EFF * IZ);
    assert_close(tip.rz.abs(), rz_expected, 0.02, "tip moment rz");

    // Tip deflection in Y: uy = M*L^2 / (2*E_eff*Iz)
    let uy_expected = m * l.powi(2) / (2.0 * E_EFF * IZ);
    assert_close(tip.uy.abs(), uy_expected, 0.02, "tip moment uy");

    // No Z deflection from moment about Z
    assert!(tip.uz.abs() < 1e-8,
        "moment about Z should not cause uz, got {:.2e}", tip.uz);
}

// ================================================================
// 6. Cantilever with Vertical UDL (wz)
// ================================================================
//
// Cantilever with uniform distributed load in Z direction.
// Tip deflection: uz = w*L^4 / (8*E_eff*Iy)

#[test]
fn validation_3d_cantilever_udl_z() {
    let l = 5.0;
    let w = 5.0; // kN/m in Z direction
    let n = 4;
    let elem_len = l / n as f64;

    let nodes: Vec<_> = (0..=n).map(|i| (i + 1, i as f64 * elem_len, 0.0, 0.0)).collect();
    let elems: Vec<_> = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();

    let sups = vec![
        (1, vec![true, true, true, true, true, true]), // fixed
    ];

    let mut loads = Vec::new();
    for i in 0..n {
        loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i + 1,
            q_yi: 0.0, q_yj: 0.0,
            q_zi: w, q_zj: w,
            a: None, b: None,
        }));
    }

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // uz_tip = w*L^4 / (8*E_eff*Iy)
    let uz_expected = w * l.powi(4) / (8.0 * E_EFF * IY);

    assert_close(tip.uz.abs(), uz_expected, 0.05, "cantilever UDL wz tip deflection");
}

// ================================================================
// 7. Equal Iy = Iz Gives Equal Deflections
// ================================================================
//
// With Iy = Iz, applying the same magnitude load in Y vs Z
// should produce equal deflections.

#[test]
fn validation_3d_equal_moments_of_inertia() {
    let l = 5.0;
    let p = 10.0;
    let n = 4;
    let i_equal = 1e-4; // same Iy and Iz

    let fixed = vec![true, true, true, true, true, true];

    // Load in Y
    let input_y = make_3d_beam(
        n, l, E, NU, A, i_equal, i_equal, J,
        fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: p, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let uy_tip = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Load in Z
    let input_z = make_3d_beam(
        n, l, E, NU, A, i_equal, i_equal, J,
        fixed, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: 0.0, fz: p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let uz_tip = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    assert_close(uy_tip, uz_tip, 0.02, "equal Iy=Iz gives equal deflections");

    // Also verify against analytical formula
    let delta_expected = p * l.powi(3) / (3.0 * E_EFF * i_equal);
    assert_close(uy_tip, delta_expected, 0.02, "equal I analytical check uy");
    assert_close(uz_tip, delta_expected, 0.02, "equal I analytical check uz");
}

// ================================================================
// 8. 3D Equilibrium
// ================================================================
//
// 3D cantilever with tip loads in Y and Z.
// Verify all 3 force and 3 moment equilibrium equations.
// For a cantilever: reaction forces equal and opposite to applied loads,
// reaction moments balance the applied loads about the fixed end.

#[test]
fn validation_3d_equilibrium_biaxial() {
    let l = 5.0;
    let fy = 12.0;
    let fz = 8.0;
    let n = 4;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Sum of reaction forces
    let sum_fx: f64 = results.reactions.iter().map(|r| r.fx).sum();
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    // Force equilibrium: reaction + applied = 0
    assert_close(sum_fx, 0.0, 0.02, "equilibrium sum_fx = 0");
    assert!((sum_fy + fy).abs() < 0.5,
        "equilibrium sum_fy + applied_fy = 0: sum_fy={:.4}, fy={:.4}", sum_fy, fy);
    assert!((sum_fz + fz).abs() < 0.5,
        "equilibrium sum_fz + applied_fz = 0: sum_fz={:.4}, fz={:.4}", sum_fz, fz);

    // Moment equilibrium about the fixed end (node 1 at x=0):
    // Applied Fy at x=L causes moment about Z: Mz_reaction = -Fy * L
    // Applied Fz at x=L causes moment about Y: My_reaction = +Fz * L (sign convention)
    let sum_mx: f64 = results.reactions.iter().map(|r| r.mx).sum();
    let sum_my: f64 = results.reactions.iter().map(|r| r.my).sum();
    let sum_mz: f64 = results.reactions.iter().map(|r| r.mz).sum();

    // No torsion applied, so mx reaction should be zero
    assert!(sum_mx.abs() < 0.5,
        "equilibrium sum_mx ~ 0 (no torsion): got {:.4}", sum_mx);

    // My_reaction + Fz * L = 0 (moment about Y from Fz load at lever arm L)
    // The sign depends on convention; check magnitude
    assert_close(sum_my.abs(), (fz * l).abs(), 0.05,
        "equilibrium |My_reaction| = |Fz * L|");

    // Mz_reaction + Fy * L = 0 (moment about Z from Fy load at lever arm L)
    assert_close(sum_mz.abs(), (fy * l).abs(), 0.05,
        "equilibrium |Mz_reaction| = |Fy * L|");
}
