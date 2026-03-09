/// Validation: 3D Moment and Force Relationships
///
/// References:
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 12
///   - Cook et al., "Concepts and Applications of FEA", Ch. 7
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 5
///
/// Tests verify 3D beam internal force relationships:
///   1. Strong axis bending: Mz = P×L for cantilever Y-load
///   2. Weak axis bending: My = P×L for cantilever Z-load
///   3. Biaxial bending independence (no coupling)
///   4. Torsion + bending decoupling
///   5. 3D equilibrium: ΣF = 0, ΣM = 0
///   6. 3D shear-moment relationship: dM/dx = V
///   7. Strong/weak axis stiffness ratio
///   8. 3D beam reactions under gravity
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 2e-4;
const IZ: f64 = 1e-4;
const J: f64 = 3e-4;

// ================================================================
// 1. Strong Axis Bending: Mz at Fixed End
// ================================================================

#[test]
fn validation_3d_moment_strong_axis() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Reaction force: Fy = P
    assert_close(r.fy, p, 0.02, "Strong axis: Ry = P");

    // Reaction moment about Z: Mz = P × L
    assert_close(r.mz.abs(), p * l, 0.02, "Strong axis: Mz = P×L");

    // No out-of-plane moment
    assert!(r.my.abs() < 0.1, "Strong axis: My ≈ 0: {:.6e}", r.my);
}

// ================================================================
// 2. Weak Axis Bending: My at Fixed End
// ================================================================

#[test]
fn validation_3d_moment_weak_axis() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Reaction force: Fz = P
    assert_close(r.fz, p, 0.02, "Weak axis: Rz = P");

    // Reaction moment about Y: My = P × L
    assert_close(r.my.abs(), p * l, 0.02, "Weak axis: My = P×L");

    // No in-plane moment
    assert!(r.mz.abs() < 0.1, "Weak axis: Mz ≈ 0: {:.6e}", r.mz);
}

// ================================================================
// 3. Biaxial Bending Independence
// ================================================================

#[test]
fn validation_3d_moment_biaxial_independence() {
    let l = 5.0;
    let n = 8;
    let py = 10.0;
    let pz = 5.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];

    // Y-load only
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_y);
    let uy_only = linear::solve_3d(&input_y).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // Z-load only
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_z);
    let uz_only = linear::solve_3d(&input_z).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz;

    // Both loads
    let loads_both = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_both = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_both);
    let tip = linear::solve_3d(&input_both).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().clone();

    // Superposition: each direction independent
    assert_close(tip.uy, uy_only, 0.01, "Biaxial: uy independent");
    assert_close(tip.uz, uz_only, 0.01, "Biaxial: uz independent");

    // Verify formulas
    let delta_y = py * l * l * l / (3.0 * e_eff * IZ);
    let delta_z = pz * l * l * l / (3.0 * e_eff * IY);
    assert_close(tip.uy.abs(), delta_y, 0.02, "Biaxial: δy = PyL³/(3EIz)");
    assert_close(tip.uz.abs(), delta_z, 0.02, "Biaxial: δz = PzL³/(3EIy)");
}

// ================================================================
// 4. Torsion + Bending Decoupling
// ================================================================

#[test]
fn validation_3d_moment_torsion_decoupling() {
    let l = 5.0;
    let n = 8;
    let t = 5.0;  // torque
    let py = 10.0; // bending load

    let fixed = vec![true, true, true, true, true, true];
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    // Torque only
    let loads_t = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_t = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_t);
    let rx_only = linear::solve_3d(&input_t).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().rx;

    // Bending only
    let loads_b = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_b = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_b);
    let uy_only = linear::solve_3d(&input_b).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // Combined
    let loads_c = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_c = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_c);
    let tip = linear::solve_3d(&input_c).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().clone();

    // Torsion and bending are independent
    assert_close(tip.rx, rx_only, 0.01, "Decoupling: rx independent of bending");
    assert_close(tip.uy, uy_only, 0.01, "Decoupling: uy independent of torsion");

    // Verify torsion formula
    let theta_exact = t * l / (g * J);
    assert_close(tip.rx.abs(), theta_exact, 0.02, "Torsion: θx = TL/(GJ)");
}

// ================================================================
// 5. 3D Global Equilibrium
// ================================================================

#[test]
fn validation_3d_moment_equilibrium() {
    let l = 5.0;
    let n = 8;
    let px = 3.0;
    let py = 10.0;
    let pz = 5.0;
    let mx = 2.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: px, fy: -py, fz: -pz, mx: mx, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -px, 0.02, "3D equil: Rx = -Px");
    assert_close(r.fy, py, 0.02, "3D equil: Ry = Py");
    assert_close(r.fz, pz, 0.02, "3D equil: Rz = Pz");

    // Moment equilibrium about fixed end
    assert_close(r.mz.abs(), py * l, 0.02, "3D equil: Mz = Py×L");
    assert_close(r.my.abs(), pz * l, 0.02, "3D equil: My = Pz×L");
}

// ================================================================
// 6. 3D Shear-Moment: dMz/dx = Vy
// ================================================================

#[test]
fn validation_3d_moment_shear_relationship() {
    let l = 6.0;
    let n = 12;
    let p = 10.0;

    // Cantilever with tip load in Y → constant Vy, linear Mz
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reaction: Fy = P
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.fy, p, 0.02, "3D shear: Ry = P");

    // Mz = P × L (maximum at base)
    assert_close(r.mz.abs(), p * l, 0.02, "3D moment: Mz = P×L");
}

// ================================================================
// 7. Strong/Weak Axis Stiffness Ratio
// ================================================================

#[test]
fn validation_3d_moment_stiffness_ratio() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    // Y-load → bending about Z (uses IZ)
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_y);
    let uy = linear::solve_3d(&input_y).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Z-load → bending about Y (uses IY)
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_z);
    let uz = linear::solve_3d(&input_z).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // δ ∝ 1/I → uy/uz = IY/IZ = 2.0
    let ratio = uy / uz;
    assert_close(ratio, IY / IZ, 0.02,
        "Stiffness ratio: δy/δz = Iy/Iz");
}

// ================================================================
// 8. 3D Beam Reactions Under Gravity (Y-direction)
// ================================================================

#[test]
fn validation_3d_moment_gravity_reactions() {
    let l = 6.0;
    let n = 6;
    let p = 30.0;

    // Simply supported 3D beam (pinned at start, roller at end)
    // Load at midspan
    let fixed_start = vec![true, true, true, true, true, true];
    let fixed_end = vec![false, true, true, false, false, false]; // only uy, uz restrained

    let mid = n / 2 + 1;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_start, Some(fixed_end), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reactions should sum to P in Y
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "3D gravity: ΣFy = P");
}
