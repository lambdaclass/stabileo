/// Validation: 3D Support Conditions — Various DOF Restraint Combinations
///
/// References:
///   - Beam theory: cantilever delta = PL^3/(3EI), simply-supported delta = PL^3/(48EI)
///   - Structural analysis: DOF restraint principles
///
/// Tests:
///   1. Fixed support: all DOFs zero at fixed end
///   2. Pinned support: translations zero, rotations free
///   3. Roller in Z only: uz=0, ux/uy free
///   4. Fixed vs pinned deflection comparison (PL^3/3EI vs PL^3/48EI)
///   5. Rotation-restrained but translation-free
///   6. Single DOF restraint (uy only)
///   7. Symmetric supports give symmetric results
///   8. Over-constrained: all DOFs fixed at both ends
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;
const E_EFF: f64 = E * 1000.0;

// ================================================================
// 1. Fixed support: all DOFs zero
// ================================================================
//
// 3D cantilever with tip load. The fixed end (node 1) must have
// all six displacement DOFs equal to zero.

#[test]
fn validation_fixed_support_all_dofs_zero() {
    let n = 4;
    let l = 3.0;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Fixed end (node 1): all 6 DOFs must be zero
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ux.abs() < 1e-10, "Fixed end ux should be zero, got {:.6e}", d1.ux);
    assert!(d1.uy.abs() < 1e-10, "Fixed end uy should be zero, got {:.6e}", d1.uy);
    assert!(d1.uz.abs() < 1e-10, "Fixed end uz should be zero, got {:.6e}", d1.uz);
    assert!(d1.rx.abs() < 1e-10, "Fixed end rx should be zero, got {:.6e}", d1.rx);
    assert!(d1.ry.abs() < 1e-10, "Fixed end ry should be zero, got {:.6e}", d1.ry);
    assert!(d1.rz.abs() < 1e-10, "Fixed end rz should be zero, got {:.6e}", d1.rz);

    // Tip should have nonzero deflection from the load
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(tip.uy.abs() > 1e-8, "Tip should deflect under load, uy={:.6e}", tip.uy);
}

// ================================================================
// 2. Pinned support: translations zero, rotations free
// ================================================================
//
// Propped cantilever: pinned at start, fixed at end.
// Load at midspan induces bending; the pinned end develops rotation
// but has zero translations and zero moment reactions.

#[test]
fn validation_pinned_support_translations_zero_rotations_free() {
    let n = 8;
    let l = 4.0;
    let p = 10.0;

    let pinned = vec![true, true, true, false, false, false];
    let fixed = vec![true, true, true, true, true, true];
    let mid_node = n / 2 + 1;

    // Load at midspan (not at a support) to induce bending
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned, Some(fixed), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Pinned end (node 1): translations must be zero
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(d1.ux.abs() < 1e-10, "Pinned end ux should be zero, got {:.6e}", d1.ux);
    assert!(d1.uy.abs() < 1e-10, "Pinned end uy should be zero, got {:.6e}", d1.uy);
    assert!(d1.uz.abs() < 1e-10, "Pinned end uz should be zero, got {:.6e}", d1.uz);

    // Pinned end: rz should be nonzero from Fy bending about Z
    assert!(d1.rz.abs() > 1e-12, "Pinned end should have nonzero rz rotation, got {:.6e}", d1.rz);

    // No moment reactions at pinned support
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert!(r1.mx.abs() < 1e-6, "Pinned support should have no mx reaction, got {:.6e}", r1.mx);
    assert!(r1.my.abs() < 1e-6, "Pinned support should have no my reaction, got {:.6e}", r1.my);
    assert!(r1.mz.abs() < 1e-6, "Pinned support should have no mz reaction, got {:.6e}", r1.mz);
}

// ================================================================
// 3. Roller in Z only
// ================================================================
//
// Beam with fixed start and end support restraining only uz.
// Apply fz at the end. Verify uz=0 at roller but ux,uy are free.

#[test]
fn validation_roller_z_only() {
    let n = 4;
    let l = 3.0;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];
    let roller_z = vec![false, false, true, false, false, false];

    // Apply fz at the roller end + fy to get lateral motion
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: p, fy: -p, fz: -p,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, Some(roller_z), loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // uz should be zero (restrained)
    assert!(tip.uz.abs() < 1e-10, "Roller Z: uz should be zero, got {:.6e}", tip.uz);

    // ux and uy should be nonzero (free)
    assert!(tip.ux.abs() > 1e-8, "Roller Z: ux should be free/nonzero, got {:.6e}", tip.ux);
    assert!(tip.uy.abs() > 1e-8, "Roller Z: uy should be free/nonzero, got {:.6e}", tip.uy);

    // Reaction at roller should have fz component, no fx or fy
    let r_tip = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_tip.fz.abs() > 1e-6, "Roller Z should have fz reaction, got {:.6e}", r_tip.fz);
}

// ================================================================
// 4. Fixed vs pinned deflection comparison
// ================================================================
//
// Cantilever (fixed-free) tip load: delta = PL^3 / (3EI)
// Simply-supported (pinned-pinned) midspan load: delta = PL^3 / (48EI)
// Ratio of midspan deflection to cantilever tip deflection = (3/48) = 1/16.

#[test]
fn validation_fixed_vs_pinned_deflection_ratio() {
    let n = 8;
    let l = 4.0;
    let p = 10.0;

    // Cantilever: fixed at start, free at end, tip load in Y
    let fixed = vec![true, true, true, true, true, true];
    let loads_tip = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_cantilever = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_tip);
    let res_cantilever = linear::solve_3d(&input_cantilever).unwrap();
    let delta_cantilever = res_cantilever.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Analytical cantilever deflection
    let delta_cantilever_analytical = p * l.powi(3) / (3.0 * E_EFF * IZ);
    assert_close(delta_cantilever, delta_cantilever_analytical, 0.02, "cantilever PL^3/(3EI)");

    // Simply-supported: pinned at both ends, midspan load
    let pinned = vec![true, true, true, false, false, false];
    let roller = vec![false, true, true, false, false, false];
    let mid_node = n / 2 + 1;
    let loads_mid = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_ss = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned, Some(roller), loads_mid);
    let res_ss = linear::solve_3d(&input_ss).unwrap();
    let delta_ss = res_ss.displacements.iter()
        .find(|d| d.node_id == mid_node).unwrap().uy.abs();

    // Analytical simply-supported midspan deflection
    let delta_ss_analytical = p * l.powi(3) / (48.0 * E_EFF * IZ);
    assert_close(delta_ss, delta_ss_analytical, 0.02, "SS PL^3/(48EI)");

    // Verify the ratio
    let ratio = delta_ss / delta_cantilever;
    let expected_ratio = 3.0 / 48.0; // 1/16 = 0.0625
    assert_close(ratio, expected_ratio, 0.05, "deflection ratio SS/cantilever");
}

// ================================================================
// 5. Rotation-restrained but translation-free
// ================================================================
//
// Support with [false,false,false,true,true,true] at end: translations free,
// all rotations restrained. Apply a force. Verify translations are nonzero
// but rotations are zero at that node.

#[test]
fn validation_rotation_restrained_translation_free() {
    let n = 4;
    let l = 3.0;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];
    let rot_only = vec![false, false, false, true, true, true];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1,
        fx: p, fy: -p, fz: p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, Some(rot_only), loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Rotations should be zero (restrained)
    assert!(tip.rx.abs() < 1e-10, "Rotation-restrained rx should be zero, got {:.6e}", tip.rx);
    assert!(tip.ry.abs() < 1e-10, "Rotation-restrained ry should be zero, got {:.6e}", tip.ry);
    assert!(tip.rz.abs() < 1e-10, "Rotation-restrained rz should be zero, got {:.6e}", tip.rz);

    // Translations should be nonzero (free, forces applied)
    let has_translation = tip.ux.abs() > 1e-10 || tip.uy.abs() > 1e-10 || tip.uz.abs() > 1e-10;
    assert!(has_translation, "Translation-free end should move, ux={:.6e} uy={:.6e} uz={:.6e}",
        tip.ux, tip.uy, tip.uz);

    // Reaction at the rotation-restrained end should have moment reactions
    let r_tip = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    let has_moment_reaction = r_tip.mx.abs() > 1e-6 || r_tip.my.abs() > 1e-6 || r_tip.mz.abs() > 1e-6;
    assert!(has_moment_reaction, "Rotation-restrained end should have moment reactions, mx={:.6e} my={:.6e} mz={:.6e}",
        r_tip.mx, r_tip.my, r_tip.mz);
}

// ================================================================
// 6. Single DOF restraint: uy only
// ================================================================
//
// Beam with fixed start and only uy restrained at end.
// Apply fy at an interior node so the beam bends between supports.
// Verify uy=0 at the uy-restrained end and fy reaction exists there.
// The free rotations at the end should be nonzero from bending.

#[test]
fn validation_single_dof_uy_restraint() {
    let n = 8;
    let l = 4.0;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];
    let uy_only = vec![false, true, false, false, false, false];
    let mid_node = n / 2 + 1;

    // Load at midspan to induce bending between the supports
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, Some(uy_only), loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // uy should be zero (restrained)
    assert!(tip.uy.abs() < 1e-10, "Single DOF: uy should be zero, got {:.6e}", tip.uy);

    // rz should be nonzero from Fy bending (free rotation at a propped end)
    assert!(tip.rz.abs() > 1e-12, "Single DOF: rz should be free/nonzero, got {:.6e}", tip.rz);

    // fy reaction should exist at the restrained end
    let r_tip = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();
    assert!(r_tip.fy.abs() > 1e-6, "Single DOF uy: fy reaction should exist, got {:.6e}", r_tip.fy);
}

// ================================================================
// 7. Symmetric supports give symmetric results
// ================================================================
//
// 3D beam with identical supports at both ends (pinned with torsional
// restraint to prevent mechanism). Symmetric midspan load gives
// symmetric reactions and displacements.

#[test]
fn validation_symmetric_supports_symmetric_results() {
    let n = 8;
    let l = 6.0;
    let p = 20.0;

    // Pinned 3D with torsion restrained to prevent torsional mechanism
    // [ux, uy, uz, rrx, rry, rrz] = [true,true,true,true,false,false]
    let pinned_start = vec![true, true, true, true, false, false];
    let pinned_end = vec![false, true, true, true, false, false]; // roller in x
    let mid_node = n / 2 + 1;

    // Symmetric midspan load in Y (gravity direction)
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, pinned_start, Some(pinned_end), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reactions at both ends should be symmetric for vertical load
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Vertical reactions should be equal (fy = P/2 each)
    assert_close(r1.fy.abs(), p / 2.0, 0.02, "symmetric fy reaction at node 1");
    assert_close(r_end.fy.abs(), p / 2.0, 0.02, "symmetric fy reaction at end node");
    assert_close(r1.fy, r_end.fy, 0.02, "symmetric fy reactions equal");

    // Displacements at symmetric positions should match
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Rotations at symmetric ends should be equal in magnitude, opposite in sign
    assert_close(d1.rz.abs(), d_end.rz.abs(), 0.02, "symmetric rotations at ends");

    // Midspan should have zero rotation by symmetry
    assert!(d_mid.rz.abs() < 1e-8, "Midspan rotation should be zero by symmetry, got {:.6e}", d_mid.rz);

    // Equilibrium check: sum of fy reactions = applied load
    let sum_fy = r1.fy + r_end.fy;
    assert_close(sum_fy, p, 0.02, "sum of fy reactions equals applied load");
}

// ================================================================
// 8. Over-constrained: all DOFs fixed at both ends
// ================================================================
//
// Fixed-fixed 3D beam with midspan load. Both ends have nonzero
// reactions in relevant components. This is an over-constrained system.

#[test]
fn validation_overconstrained_fixed_fixed() {
    let n = 8;
    let l = 6.0;
    let p = 20.0;

    let fixed = vec![true, true, true, true, true, true];
    let mid_node = n / 2 + 1;

    // Midspan load in Y
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid_node,
        fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), Some(fixed), loads);
    let results = linear::solve_3d(&input).unwrap();

    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    // Both ends should have nonzero fy reactions (vertical)
    assert!(r1.fy.abs() > 1e-6, "Fixed-fixed: node 1 should have fy reaction, got {:.6e}", r1.fy);
    assert!(r_end.fy.abs() > 1e-6, "Fixed-fixed: end node should have fy reaction, got {:.6e}", r_end.fy);

    // Both ends should have nonzero mz reactions (moment about Z from Fy bending)
    assert!(r1.mz.abs() > 1e-6, "Fixed-fixed: node 1 should have mz reaction, got {:.6e}", r1.mz);
    assert!(r_end.mz.abs() > 1e-6, "Fixed-fixed: end node should have mz reaction, got {:.6e}", r_end.mz);

    // Equilibrium: sum of vertical reactions = applied load
    let sum_fy = r1.fy + r_end.fy;
    assert_close(sum_fy, p, 0.02, "fixed-fixed sum of fy reactions");

    // For symmetric fixed-fixed beam with midspan load:
    // Each end reaction = P/2, end moments = PL/8
    assert_close(r1.fy, p / 2.0, 0.02, "fixed-fixed fy at node 1 = P/2");
    assert_close(r_end.fy, p / 2.0, 0.02, "fixed-fixed fy at end node = P/2");

    let m_expected = p * l / 8.0;
    assert_close(r1.mz.abs(), m_expected, 0.05, "fixed-fixed mz at node 1 = PL/8");
    assert_close(r_end.mz.abs(), m_expected, 0.05, "fixed-fixed mz at end node = PL/8");

    // Both fixed ends should have zero displacements
    let d1 = results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    let d_end = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert!(d1.uy.abs() < 1e-10, "Fixed end 1 uy should be zero, got {:.6e}", d1.uy);
    assert!(d_end.uy.abs() < 1e-10, "Fixed end 2 uy should be zero, got {:.6e}", d_end.uy);
    assert!(d1.rz.abs() < 1e-10, "Fixed end 1 rz should be zero, got {:.6e}", d1.rz);
    assert!(d_end.rz.abs() < 1e-10, "Fixed end 2 rz should be zero, got {:.6e}", d_end.rz);

    // Midspan deflection should be less than simply-supported (stiffer system)
    let d_mid = results.displacements.iter().find(|d| d.node_id == mid_node).unwrap();
    // Fixed-fixed midspan deflection = PL^3/(192EI), SS = PL^3/(48EI), ratio = 1/4
    let delta_ff_analytical = p * l.powi(3) / (192.0 * E_EFF * IZ);
    assert_close(d_mid.uy.abs(), delta_ff_analytical, 0.05, "fixed-fixed midspan deflection PL^3/(192EI)");
}
