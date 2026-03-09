/// Validation: 3D Cantilever Beam Benchmarks
///
/// References:
///   - Timoshenko, "Strength of Materials", Vol. 1, Ch. 4
///   - Weaver & Gere, "Matrix Analysis of Framed Structures", Ch. 12
///   - Cook et al., "Concepts and Applications of FEA", 4th Ed., Ch. 2
///
/// Tests verify 3D cantilever beam behavior:
///   1. Tip load in Y: δy = PL³/(3EIz)
///   2. Tip load in Z: δz = PL³/(3EIy)
///   3. Biaxial bending: tip loads in Y and Z simultaneously
///   4. Torsion: T at tip, θx = TL/(GJ)
///   5. Combined bending + torsion
///   6. 3D cantilever equilibrium
///   7. Stiffness ranking: Iy > Iz → δy < δz
///   8. 3D cantilever with inclined load
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
// 1. Tip Load in Y: δy = PL³/(3EIz)
// ================================================================

#[test]
fn validation_3d_cantilever_tip_y() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0; // MPa → kN/m²

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δy = PL³/(3EIz) — bending about Z axis
    let delta_y = p * l * l * l / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_y, 0.02, "3D cantilever: δy = PL³/(3EIz)");

    // Should have negligible deflection in other directions
    assert!(tip.uz.abs() < delta_y * 0.01,
        "3D cantilever: δz ≈ 0: {:.6e}", tip.uz);
}

// ================================================================
// 2. Tip Load in Z: δz = PL³/(3EIy)
// ================================================================

#[test]
fn validation_3d_cantilever_tip_z() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δz = PL³/(3EIy) — bending about Y axis
    let delta_z = p * l * l * l / (3.0 * e_eff * IY);
    assert_close(tip.uz.abs(), delta_z, 0.02, "3D cantilever: δz = PL³/(3EIy)");
}

// ================================================================
// 3. Biaxial Bending
// ================================================================
//
// Simultaneous Y and Z loads: superposition holds.

#[test]
fn validation_3d_cantilever_biaxial() {
    let l = 5.0;
    let n = 8;
    let py = 10.0;
    let pz = 5.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y = py * l * l * l / (3.0 * e_eff * IZ);
    let delta_z = pz * l * l * l / (3.0 * e_eff * IY);

    assert_close(tip.uy.abs(), delta_y, 0.02, "Biaxial: δy = PyL³/(3EIz)");
    assert_close(tip.uz.abs(), delta_z, 0.02, "Biaxial: δz = PzL³/(3EIy)");
}

// ================================================================
// 4. Pure Torsion: θx = TL/(GJ)
// ================================================================

#[test]
fn validation_3d_cantilever_torsion() {
    let l = 5.0;
    let n = 8;
    let t = 5.0; // torque about X axis
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // θx = TL/(GJ)
    let theta_x = t * l / (g * J);
    assert_close(tip.rx.abs(), theta_x, 0.02, "Torsion: θx = TL/(GJ)");

    // No bending deflection
    assert!(tip.uy.abs() < 1e-8, "Pure torsion: δy ≈ 0: {:.6e}", tip.uy);
    assert!(tip.uz.abs() < 1e-8, "Pure torsion: δz ≈ 0: {:.6e}", tip.uz);
}

// ================================================================
// 5. Combined Bending + Torsion
// ================================================================
//
// Y-load + torque: bending and torsion are independent (decoupled).

#[test]
fn validation_3d_cantilever_combined() {
    let l = 5.0;
    let n = 8;
    let py = 10.0;
    let t = 5.0;
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y = py * l * l * l / (3.0 * e_eff * IZ);
    let theta_x = t * l / (g * J);

    assert_close(tip.uy.abs(), delta_y, 0.02, "Combined: δy independent of T");
    assert_close(tip.rx.abs(), theta_x, 0.02, "Combined: θx independent of Py");
}

// ================================================================
// 6. 3D Cantilever Equilibrium
// ================================================================

#[test]
fn validation_3d_cantilever_equilibrium() {
    let l = 5.0;
    let n = 8;
    let px = 3.0;
    let py = 10.0;
    let pz = 5.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: px, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // Force equilibrium
    assert_close(r.fx, -px, 0.02, "3D equilibrium: Rx = -Px");
    assert_close(r.fy, py, 0.02, "3D equilibrium: Ry = Py");
    assert_close(r.fz, pz, 0.02, "3D equilibrium: Rz = Pz");

    // Moment equilibrium about fixed end
    // Mz_reaction = Py × L (bending about Z from Y-force)
    assert_close(r.mz.abs(), py * l, 0.02, "3D equilibrium: Mz = Py×L");
    // My_reaction = Pz × L (bending about Y from Z-force)
    assert_close(r.my.abs(), pz * l, 0.02, "3D equilibrium: My = Pz×L");
}

// ================================================================
// 7. Stiffness Ranking: Iy > Iz → δz < δy (for same load)
// ================================================================

#[test]
fn validation_3d_cantilever_stiffness_ranking() {
    let l = 5.0;
    let n = 8;
    let p = 10.0;

    // Same magnitude force in Y and Z
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // IY > IZ → bending about Y is stiffer → δz < δy
    assert!(tip.uz.abs() < tip.uy.abs(),
        "Iy > Iz → δz < δy: {:.6e} < {:.6e}", tip.uz.abs(), tip.uy.abs());
}

// ================================================================
// 8. Inclined Load: Resultant Deflection
// ================================================================
//
// 45-degree load in Y-Z plane: resultant deflection check.

#[test]
fn validation_3d_cantilever_inclined() {
    let l = 5.0;
    let n = 8;
    let p_total = 10.0;
    let cos45 = std::f64::consts::FRAC_1_SQRT_2;
    let py = p_total * cos45;
    let pz = p_total * cos45;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Resultant deflection magnitude
    let d_total = (tip.uy * tip.uy + tip.uz * tip.uz).sqrt();
    assert!(d_total > 0.0, "Inclined load: non-zero deflection: {:.6e}", d_total);

    // Equilibrium
    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r.fy, py, 0.02, "Inclined: Ry = Py");
    assert_close(r.fz, pz, 0.02, "Inclined: Rz = Pz");
}
