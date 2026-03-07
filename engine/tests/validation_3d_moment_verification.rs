/// Validation: 3D Beam Bending Moment Verification
///
/// References:
///   - Timoshenko, "Strength of Materials", Vol. 1
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed.
///   - Weaver & Gere, "Matrix Analysis of Framed Structures"
///
/// Tests verify 3D beam bending moments against closed-form analytical solutions:
///   1. Cantilever tip load in Z: verify my_start = -P*L at fixed end
///   2. Cantilever tip load in Y: verify mz_start = P*L at fixed end
///   3. Biaxial bending: superposition of my and mz
///   4. Fixed-fixed beam UDL in Z: my_start = my_end = wz*L^2/12
///   5. SS beam midspan moment from point load in Z: my = P*L/4
///   6. Cantilever with applied end moment My: uniform my, tip rotation
///   7. Moment equilibrium at 3D fixed support with loads in Y and Z
///   8. Zero moment axis: load in Z gives mz = 0 on SS beam
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 8.333e-5;
const IZ: f64 = 1e-4;
const J: f64 = 1e-4;

const E_EFF: f64 = E * 1000.0; // MPa -> kN/m^2
#[allow(dead_code)]
const G_EFF: f64 = E_EFF / (2.0 * (1.0 + NU));

// ================================================================
// 1. Cantilever 3D beam — tip load in Z, verify my
// ================================================================
//
// Fixed-free beam along X, Fz = -10 kN at the free tip.
// Bending occurs in the XZ plane about the Y axis.
//
// At the fixed end (element 1, start):
//   Shear Vz = P (upward reaction)
//   Moment my at fixed end: magnitude = P * L
//
// No twist expected (mx = 0).

#[test]
fn validation_cantilever_tip_fz_verify_my() {
    let l = 5.0;
    let n = 4;
    let p = 10.0; // magnitude
    let fz = -p;  // downward in Z
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

    // Check reaction moment about Y at the fixed end
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.my.abs(), p * l, 0.02, "Cantilever Fz: |My_reaction| = P*L");

    // Check element forces at the root element
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // my_start magnitude at fixed end should be P*L
    assert_close(ef1.my_start.abs(), p * l, 0.05,
        "Cantilever Fz: |my_start| of elem 1 = P*L");

    // No twist anywhere
    assert!(ef1.mx_start.abs() < 1e-6,
        "Cantilever Fz: no twist, mx_start = {:.6e}", ef1.mx_start);
    assert!(ef1.mx_end.abs() < 1e-6,
        "Cantilever Fz: no twist, mx_end = {:.6e}", ef1.mx_end);
}

// ================================================================
// 2. Cantilever 3D beam — tip load in Y, verify mz
// ================================================================
//
// Fixed-free beam along X, Fy = -10 kN at the free tip.
// Bending occurs in the XY plane about the Z axis.
//
// At the fixed end:
//   Moment mz at fixed end: magnitude = P * L
//
// No twist expected.

#[test]
fn validation_cantilever_tip_fy_verify_mz() {
    let l = 5.0;
    let n = 4;
    let p = 10.0;
    let fy = -p;
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

    // Check reaction moment about Z at the fixed end
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.mz.abs(), p * l, 0.02, "Cantilever Fy: |Mz_reaction| = P*L");

    // Check element forces at the root element
    let ef1 = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();

    // mz_start magnitude at fixed end should be P*L
    assert_close(ef1.mz_start.abs(), p * l, 0.05,
        "Cantilever Fy: |mz_start| of elem 1 = P*L");

    // No twist
    assert!(ef1.mx_start.abs() < 1e-6,
        "Cantilever Fy: no twist, mx_start = {:.6e}", ef1.mx_start);
}

// ================================================================
// 3. 3D beam biaxial bending
// ================================================================
//
// Cantilever with both Fy = -10 and Fz = -10 at the tip.
// By superposition, my and mz at the fixed end should independently
// match the single-load cases:
//   |my| = Fz_mag * L   (from Z-load)
//   |mz| = Fy_mag * L   (from Y-load)

#[test]
fn validation_biaxial_bending_moments() {
    let l = 5.0;
    let n = 4;
    let fy = -10.0;
    let fz = -10.0;
    let tip_node = n + 1;
    let fixed = vec![true, true, true, true, true, true];

    // Combined case
    let loads_both = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_both = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_both);
    let res_both = linear::solve_3d(&input_both).unwrap();

    // Fy-only case
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_y);
    let res_y = linear::solve_3d(&input_y).unwrap();

    // Fz-only case
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_z);
    let res_z = linear::solve_3d(&input_z).unwrap();

    let r_both = res_both.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_y = res_y.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_z = res_z.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // my from combined should match my from Fz-only (Y-load does not produce my)
    assert_close(r_both.my, r_z.my, 0.02,
        "Biaxial: my(combined) = my(Fz only)");

    // mz from combined should match mz from Fy-only (Z-load does not produce mz)
    assert_close(r_both.mz, r_y.mz, 0.02,
        "Biaxial: mz(combined) = mz(Fy only)");

    // Also verify magnitudes against analytical
    assert_close(r_both.my.abs(), fz.abs() * l, 0.02,
        "Biaxial: |My| = |Fz|*L");
    assert_close(r_both.mz.abs(), fy.abs() * l, 0.02,
        "Biaxial: |Mz| = |Fy|*L");

    // Element forces at root should also show both moments simultaneously
    let ef1_both = res_both.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef1_both.my_start.abs(), fz.abs() * l, 0.05,
        "Biaxial elem: |my_start| = |Fz|*L");
    assert_close(ef1_both.mz_start.abs(), fy.abs() * l, 0.05,
        "Biaxial elem: |mz_start| = |Fy|*L");
}

// ================================================================
// 4. Fixed-fixed 3D beam — end moments from UDL in Z
// ================================================================
//
// Fixed-fixed beam along X with UDL wz = -10 kN/m.
// Bending in the XZ plane about the Y axis.
//
// Fixed-end moments about Y:
//   my_start = my_end = wz * L^2 / 12  (magnitude)
//
// Both ends fixed, so reactions are symmetric.

#[test]
fn validation_fixed_fixed_udl_z_end_moments() {
    let l = 6.0;
    let n = 6;
    let wz: f64 = -10.0;

    let fixed = vec![true, true, true, true, true, true];

    let loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: 0.0, q_yj: 0.0,
            q_zi: wz, q_zj: wz,
            a: None, b: None,
        }))
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), Some(fixed), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Analytical fixed-end moment magnitude: |w| * L^2 / 12
    let m_fixed = wz.abs() * l * l / 12.0;

    // Check reaction moments at both ends
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.my.abs(), m_fixed, 0.02,
        "FF UDL wz: |My| at start = wL^2/12");
    assert_close(r_end.my.abs(), m_fixed, 0.02,
        "FF UDL wz: |My| at end = wL^2/12");

    // Check element forces: first element start and last element end
    let ef_first = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    let ef_last = results.element_forces.iter().find(|e| e.element_id == n).unwrap();

    assert_close(ef_first.my_start.abs(), m_fixed, 0.05,
        "FF UDL wz: |my_start| elem 1 = wL^2/12");
    assert_close(ef_last.my_end.abs(), m_fixed, 0.05,
        "FF UDL wz: |my_end| last elem = wL^2/12");

    // Total vertical reaction should be wz * L
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, wz.abs() * l, 0.02,
        "FF UDL wz: total Fz reaction = |wz|*L");
}

// ================================================================
// 5. SS 3D beam — midspan moment from point load in Z
// ================================================================
//
// Simply supported beam (pinned-roller or fixed translations, free rotations
// at both ends). Point load Fz at midspan.
//
// Maximum bending moment about Y at midspan: My = P * L / 4

#[test]
fn validation_ss_beam_midspan_moment_fz() {
    let l = 6.0;
    let n = 6;
    let p = 20.0;
    let fz = -p;
    let mid_node = n / 2 + 1;

    // Pinned at start (all translations fixed, rotations free)
    let pinned = vec![true, true, true, false, false, false];
    // Roller at end: only uy and uz fixed (free to slide in x, free rotations)
    let roller = vec![false, true, true, false, false, false];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned, Some(roller), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Analytical midspan moment: M = P * L / 4
    let m_mid = p * l / 4.0;

    // The element just before midspan (element n/2): my_end should be the midspan moment
    // and the element just after midspan (element n/2 + 1): my_start should match
    let elem_before_mid = n / 2;
    let elem_after_mid = n / 2 + 1;

    let ef_before = results.element_forces.iter()
        .find(|e| e.element_id == elem_before_mid).unwrap();
    let ef_after = results.element_forces.iter()
        .find(|e| e.element_id == elem_after_mid).unwrap();

    assert_close(ef_before.my_end.abs(), m_mid, 0.05,
        "SS Fz midspan: |my_end| before mid = PL/4");
    assert_close(ef_after.my_start.abs(), m_mid, 0.05,
        "SS Fz midspan: |my_start| after mid = PL/4");

    // Reactions: each support carries P/2 in Z
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();
    assert_close(sum_fz, p, 0.02, "SS Fz: total Fz reaction = P");
}

// ================================================================
// 6. 3D cantilever — applied end moment My
// ================================================================
//
// Cantilever with applied moment My = 50 kN.m at the free tip.
// This produces uniform curvature in the XZ plane:
//   - my is constant along the beam (= -My at start in element convention)
//   - Tip rotation about Y: ry = My * L / (E * Iy)
//   - No shear forces (Vz = 0)

#[test]
fn validation_cantilever_applied_end_moment_my() {
    let l = 5.0;
    let n = 4;
    let my_applied = 50.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: my_applied, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Tip rotation about Y: ry = My * L / (E_eff * Iy)
    let ry_expected = my_applied * l / (E_EFF * IY);
    let tip = results.displacements.iter()
        .find(|d| d.node_id == tip_node).unwrap();
    assert_close(tip.ry.abs(), ry_expected, 0.02,
        "Applied My: tip ry = My*L/(EIy)");

    // my should be uniform along the beam:
    // For a pure end-moment cantilever, every element carries the same moment.
    // Check all elements have the same |my| magnitude.
    for i in 1..=n {
        let ef = results.element_forces.iter()
            .find(|e| e.element_id == i).unwrap();
        assert_close(ef.my_start.abs(), my_applied, 0.05,
            &format!("Applied My: |my_start| elem {} = My", i));
        assert_close(ef.my_end.abs(), my_applied, 0.05,
            &format!("Applied My: |my_end| elem {} = My", i));

        // No shear forces (pure moment, no transverse load)
        assert!(ef.vz_start.abs() < 1e-4,
            "Applied My: Vz_start elem {} should be ~0, got {:.6e}", i, ef.vz_start);
    }
}

// ================================================================
// 7. Moment equilibrium at 3D fixed support
// ================================================================
//
// Cantilever with tip loads in both Y and Z directions.
// At the fixed end, reaction moments must satisfy:
//   My_reaction = -Fz * L  (from Z-force acting at distance L)
//   Mz_reaction = -Fy * L  (from Y-force acting at distance L)
//
// Using specific signs: Fz = -8 (downward in Z), Fy = -12 (downward in Y)

#[test]
fn validation_moment_equilibrium_fixed_support() {
    let l = 5.0;
    let n = 4;
    let fy = -12.0;
    let fz = -8.0;
    let tip_node = n + 1;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node,
        fx: 0.0, fy, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fy, -fy, 0.02, "Equilibrium: Ry = -Fy");
    assert_close(r.fz, -fz, 0.02, "Equilibrium: Rz = -Fz");

    // Moment magnitudes at support
    // |My_reaction| = |Fz| * L
    assert_close(r.my.abs(), fz.abs() * l, 0.02,
        "Equilibrium: |My_reaction| = |Fz|*L");
    // |Mz_reaction| = |Fy| * L
    assert_close(r.mz.abs(), fy.abs() * l, 0.02,
        "Equilibrium: |Mz_reaction| = |Fy|*L");

    // Verify moment signs via global equilibrium:
    // Taking moments about support at x=0:
    //   Fy acts at x=L, creating moment about Z: Mz_react + Fy * L = 0 => Mz_react = -Fy*L
    //   Fz acts at x=L, creating moment about Y: My_react + Fz * L = 0 (with sign)
    // The key check is that the reaction moment opposes the applied force moment.
    assert_close(r.mz, -fy * l, 0.02,
        "Equilibrium: Mz_react = -Fy*L (signed)");

    // No torque (no load about x-axis)
    assert!(r.mx.abs() < 1e-6,
        "Equilibrium: no torque, Mx = {:.6e}", r.mx);
}

// ================================================================
// 8. 3D beam — zero moment axes
// ================================================================
//
// Simply supported beam with load only in Z direction.
// Bending should occur only about the Y axis (my != 0).
// There should be no bending about the Z axis (mz = 0 everywhere)
// because the load is in the XZ plane.

#[test]
fn validation_zero_moment_axis() {
    let l = 6.0;
    let n = 6;
    let fz = -15.0;
    let mid_node = n / 2 + 1;

    // Pinned at start, roller at end
    let pinned = vec![true, true, true, false, false, false];
    let roller = vec![false, true, true, false, false, false];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: 0.0, fz,
        mx: 0.0, my: 0.0, mz: 0.0,
        bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned, Some(roller), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Verify mz is zero for all elements (no bending about Z)
    for ef in &results.element_forces {
        assert!(ef.mz_start.abs() < 1e-4,
            "Zero mz: elem {} mz_start should be ~0, got {:.6e}",
            ef.element_id, ef.mz_start);
        assert!(ef.mz_end.abs() < 1e-4,
            "Zero mz: elem {} mz_end should be ~0, got {:.6e}",
            ef.element_id, ef.mz_end);
    }

    // But my should be non-zero (bending in XZ plane)
    let elem_before_mid = n / 2;
    let ef_mid = results.element_forces.iter()
        .find(|e| e.element_id == elem_before_mid).unwrap();
    let m_mid_expected = fz.abs() * l / 4.0;
    assert_close(ef_mid.my_end.abs(), m_mid_expected, 0.05,
        "Zero mz axis: my at midspan = PL/4");

    // Also check vy is zero everywhere (no shear in Y direction)
    for ef in &results.element_forces {
        assert!(ef.vy_start.abs() < 1e-4,
            "Zero vy: elem {} vy_start should be ~0, got {:.6e}",
            ef.element_id, ef.vy_start);
    }
}
