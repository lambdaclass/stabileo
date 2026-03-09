/// Validation: 3D Cantilever Beam Verification Against Closed-Form Solutions
///
/// References:
///   - Timoshenko, "Strength of Materials", Vol. 1
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///
/// Each test compares the FEM solution of a 3D cantilever beam (fixed at node 1,
/// free at the tip) against the exact closed-form analytical result.
///
/// Section properties are chosen so that Iy < Iz, giving different stiffnesses
/// in the two bending planes and making the tests more discriminating.
///
/// Tests:
///   1. Tip load Fz: deflection uz and rotation ry
///   2. Tip load Fy: deflection uy and rotation rz
///   3. Tip axial load Fx: extension ux, no transverse deflection
///   4. Tip moment My: uz and ry from uniform curvature in XZ plane
///   5. Tip moment Mz: uy and rz from uniform curvature in XY plane
///   6. UDL in Z: cantilever tip deflection and rotation
///   7. Combined Fy + Fz: superposition verified
///   8. Reaction verification: all 6 reaction components at fixed end
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 5e-5;
const IZ: f64 = 1e-4;
const J: f64 = 1e-5;

// Effective values (MPa -> kN/m^2 consistent units)
fn e_eff() -> f64 {
    E * 1000.0
}
#[allow(dead_code)]
fn g_eff() -> f64 {
    e_eff() / (2.0 * (1.0 + NU))
}

// ================================================================
// 1. Tip load Fz: deflection and rotation
// ================================================================
//
// Cantilever with tip force Fz = -20 (downward in Z).
// Bending occurs in the XZ plane about the Y axis.
//
//   uz_tip = F * L^3 / (3 * E * Iy)
//   ry_tip = F * L^2 / (2 * E * Iy)

#[test]
fn validation_tip_load_fz_deflection_and_rotation() {
    let l = 5.0;
    let n = 4;
    let fz = -20.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let f = fz.abs();
    let ei = e_eff() * IY;

    let uz_expected = f * l.powi(3) / (3.0 * ei);
    let ry_expected = f * l.powi(2) / (2.0 * ei);

    assert_close(tip.uz.abs(), uz_expected, 0.02,
        "Tip Fz: uz = FL^3/(3EIy)");
    assert_close(tip.ry.abs(), ry_expected, 0.02,
        "Tip Fz: ry = FL^2/(2EIy)");
}

// ================================================================
// 2. Tip load Fy: deflection and rotation
// ================================================================
//
// Cantilever with tip force Fy = -20 (downward in Y).
// Bending occurs in the XY plane about the Z axis.
//
//   uy_tip = F * L^3 / (3 * E * Iz)
//   rz_tip = F * L^2 / (2 * E * Iz)

#[test]
fn validation_tip_load_fy_deflection_and_rotation() {
    let l = 5.0;
    let n = 4;
    let fy = -20.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let f = fy.abs();
    let ei = e_eff() * IZ;

    let uy_expected = f * l.powi(3) / (3.0 * ei);
    let rz_expected = f * l.powi(2) / (2.0 * ei);

    assert_close(tip.uy.abs(), uy_expected, 0.02,
        "Tip Fy: uy = FL^3/(3EIz)");
    assert_close(tip.rz.abs(), rz_expected, 0.02,
        "Tip Fy: rz = FL^2/(2EIz)");
}

// ================================================================
// 3. Tip axial load Fx
// ================================================================
//
// Pure axial load at the free end.
//
//   ux_tip = F * L / (E * A)
//   No transverse deflection expected.

#[test]
fn validation_tip_axial_load_fx() {
    let l = 5.0;
    let n = 4;
    let fx = 100.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let ux_expected = fx * l / (e_eff() * A);

    assert_close(tip.ux, ux_expected, 0.02,
        "Tip Fx: ux = FL/(EA)");

    // No transverse deflection
    assert!(tip.uy.abs() < 1e-10,
        "Tip Fx: uy should be zero, got {:.6e}", tip.uy);
    assert!(tip.uz.abs() < 1e-10,
        "Tip Fx: uz should be zero, got {:.6e}", tip.uz);
}

// ================================================================
// 4. Tip moment My
// ================================================================
//
// Pure moment My at the free end causes uniform curvature in the XZ plane.
//
//   uz_tip = M * L^2 / (2 * E * Iy)
//   ry_tip = M * L / (E * Iy)

#[test]
fn validation_tip_moment_my() {
    let l = 5.0;
    let n = 4;
    let my = 15.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let ei = e_eff() * IY;
    let uz_expected = my * l.powi(2) / (2.0 * ei);
    let ry_expected = my * l / ei;

    assert_close(tip.uz.abs(), uz_expected, 0.02,
        "Tip My: uz = ML^2/(2EIy)");
    assert_close(tip.ry.abs(), ry_expected, 0.02,
        "Tip My: ry = ML/(EIy)");

    // No bending in XY plane
    assert!(tip.rz.abs() < 1e-10,
        "Tip My: rz should be zero, got {:.6e}", tip.rz);
}

// ================================================================
// 5. Tip moment Mz
// ================================================================
//
// Pure moment Mz at the free end causes uniform curvature in the XY plane.
//
//   uy_tip = M * L^2 / (2 * E * Iz)
//   rz_tip = M * L / (E * Iz)

#[test]
fn validation_tip_moment_mz() {
    let l = 5.0;
    let n = 4;
    let mz = 15.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let ei = e_eff() * IZ;
    let uy_expected = mz * l.powi(2) / (2.0 * ei);
    let rz_expected = mz * l / ei;

    assert_close(tip.uy.abs(), uy_expected, 0.02,
        "Tip Mz: uy = ML^2/(2EIz)");
    assert_close(tip.rz.abs(), rz_expected, 0.02,
        "Tip Mz: rz = ML/(EIz)");

    // No bending in XZ plane
    assert!(tip.ry.abs() < 1e-10,
        "Tip Mz: ry should be zero, got {:.6e}", tip.ry);
}

// ================================================================
// 6. UDL in Z direction
// ================================================================
//
// Uniform distributed load wz = -8 on all elements.
// Bending in the XZ plane about the Y axis.
//
//   uz_tip = w * L^4 / (8 * E * Iy)
//   ry_tip = w * L^3 / (6 * E * Iy)

#[test]
fn validation_udl_z_direction() {
    let l = 5.0;
    let n = 4;
    let wz: f64 = -8.0;
    let tip_node = n + 1;

    let loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: 0.0, q_yj: 0.0,
            q_zi: wz, q_zj: wz,
            a: None, b: None,
        }))
        .collect();
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    let w = wz.abs();
    let ei = e_eff() * IY;

    let uz_expected = w * l.powi(4) / (8.0 * ei);
    let ry_expected = w * l.powi(3) / (6.0 * ei);

    assert_close(tip.uz.abs(), uz_expected, 0.02,
        "UDL wz: uz = wL^4/(8EIy)");
    assert_close(tip.ry.abs(), ry_expected, 0.02,
        "UDL wz: ry = wL^3/(6EIy)");
}

// ================================================================
// 7. Combined loading: Fy + Fz (superposition)
// ================================================================
//
// Apply Fy = -10 and Fz = -15 simultaneously. By superposition the
// deflections must match the individual load cases.

#[test]
fn validation_combined_fy_fz_superposition() {
    let l = 5.0;
    let n = 4;
    let fy = -10.0;
    let fz = -15.0;
    let tip_node = n + 1;
    let fixed = vec![true, true, true, true, true, true];

    // Combined case
    let loads_both = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_both = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, loads_both);
    let res_both = linear::solve_3d(&input_both).unwrap();

    // Fy-only case
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, loads_y);
    let res_y = linear::solve_3d(&input_y).unwrap();

    // Fz-only case
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed, None, loads_z);
    let res_z = linear::solve_3d(&input_z).unwrap();

    let d_both = res_both.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    let d_y = res_y.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    let d_z = res_z.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();

    // uy should match Fy-only case (bending in XY plane is independent of XZ)
    assert_close(d_both.uy, d_y.uy, 0.02,
        "Superposition: uy(combined) = uy(Fy only)");

    // uz should match Fz-only case
    assert_close(d_both.uz, d_z.uz, 0.02,
        "Superposition: uz(combined) = uz(Fz only)");

    // Also verify against closed-form
    let uy_expected = fy.abs() * l.powi(3) / (3.0 * e_eff() * IZ);
    let uz_expected = fz.abs() * l.powi(3) / (3.0 * e_eff() * IY);

    assert_close(d_both.uy.abs(), uy_expected, 0.02,
        "Combined Fy+Fz: uy matches closed-form");
    assert_close(d_both.uz.abs(), uz_expected, 0.02,
        "Combined Fy+Fz: uz matches closed-form");
}

// ================================================================
// 8. Reaction verification
// ================================================================
//
// Cantilever with combined tip loads: Fx=50, Fy=-10, Fz=-15, Mx=3.
// At the fixed end the reactions must satisfy equilibrium:
//
//   Rx = -Fx,  Ry = -Fy,  Rz = -Fz
//   Mx_reaction = -Mx
//   My_reaction = Fz * L   (moment about Y from Z-force)
//   Mz_reaction = -Fy * L  (moment about Z from Y-force)

#[test]
fn validation_reaction_verification() {
    let l = 5.0;
    let n = 4;
    let fx_tip = 50.0;
    let fy_tip = -10.0;
    let fz_tip = -15.0;
    let mx_tip = 3.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: fx_tip, fy: fy_tip, fz: fz_tip,
        mx: mx_tip, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter()
        .find(|r| r.node_id == 1).unwrap();

    // Force equilibrium: reaction = -applied
    assert_close(r.fx, -fx_tip, 0.02,
        "Reaction: fx = -Fx_tip");
    assert_close(r.fy, -fy_tip, 0.02,
        "Reaction: fy = -Fy_tip");
    assert_close(r.fz, -fz_tip, 0.02,
        "Reaction: fz = -Fz_tip");

    // Moment equilibrium
    assert_close(r.mx, -mx_tip, 0.02,
        "Reaction: mx = -Mx_tip");

    // My at fixed end: Fz acts at distance L from the support.
    // Taking moments about Y at the fixed end: My + Fz * L = 0 => My = -Fz * L = Fz_tip * L
    // Fz_tip = -15, so My_reaction = -(-15)*5 = +75... but sign depends on convention.
    // The magnitude must be |Fz| * L.
    assert_close(r.my.abs(), fz_tip.abs() * l, 0.05,
        "Reaction: |my| = |Fz|*L");

    // Mz at fixed end: Fy acts at distance L.
    // |Mz_reaction| = |Fy| * L
    assert_close(r.mz.abs(), fy_tip.abs() * l, 0.05,
        "Reaction: |mz| = |Fy|*L");
}
