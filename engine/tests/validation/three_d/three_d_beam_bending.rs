/// Validation: 3D Beam Bending About Both Principal Axes
///
/// References:
///   - Boresi & Schmidt, "Advanced Mechanics of Materials", Ch. 7
///   - Timoshenko & Goodier, "Theory of Elasticity", Ch. 12
///   - Gere & Goodno, "Mechanics of Materials", Ch. 6
///
/// Tests verify 3D beam bending in both principal planes:
///   1. Strong axis: δ = PL³/(3EIz) for cantilever Y-load
///   2. Weak axis: δ = PL³/(3EIy) for cantilever Z-load
///   3. Biaxial bending: resultant deflection
///   4. Deflection ratio: δy/δz = Iy/Iz
///   5. SS beam 3D: center load in Y
///   6. SS beam 3D: center load in Z
///   7. Fixed-fixed 3D beam: center load reactions
///   8. 3D cantilever rotation at tip
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
// 1. Strong Axis Cantilever: δ = PL³/(3EIz)
// ================================================================

#[test]
fn validation_3d_bending_strong_axis() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // δy = PL³/(3EIz) — bending about Z uses Iz
    let delta_exact = p * l * l * l / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), delta_exact, 0.02,
        "3D strong: δy = PL³/(3EIz)");
}

// ================================================================
// 2. Weak Axis Cantilever: δ = PL³/(3EIy)
// ================================================================

#[test]
fn validation_3d_bending_weak_axis() {
    let l = 5.0;
    let n = 10;
    let p = 15.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // δz = PL³/(3EIy) — bending about Y uses Iy
    let delta_exact = p * l * l * l / (3.0 * e_eff * IY);
    assert_close(tip.uz.abs(), delta_exact, 0.02,
        "3D weak: δz = PL³/(3EIy)");
}

// ================================================================
// 3. Biaxial Bending: Resultant Deflection
// ================================================================

#[test]
fn validation_3d_bending_biaxial_resultant() {
    let l = 5.0;
    let n = 10;
    let py = 10.0;
    let pz = 8.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let dy_exact = py * l * l * l / (3.0 * e_eff * IZ);
    let dz_exact = pz * l * l * l / (3.0 * e_eff * IY);

    assert_close(tip.uy.abs(), dy_exact, 0.02, "Biaxial: δy exact");
    assert_close(tip.uz.abs(), dz_exact, 0.02, "Biaxial: δz exact");

    // Resultant deflection
    let d_resultant = (tip.uy * tip.uy + tip.uz * tip.uz).sqrt();
    let d_exact = (dy_exact * dy_exact + dz_exact * dz_exact).sqrt();
    assert_close(d_resultant, d_exact, 0.02, "Biaxial: resultant δ");
}

// ================================================================
// 4. Deflection Ratio: δy/δz = Iy/Iz
// ================================================================

#[test]
fn validation_3d_bending_ratio() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;

    let fixed = vec![true, true, true, true, true, true];

    // Y-load → δy uses IZ
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None, loads_y);
    let dy = linear::solve_3d(&input_y).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Z-load → δz uses IY
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads_z);
    let dz = linear::solve_3d(&input_z).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // δy/δz = IY/IZ (larger deflection where I is smaller)
    assert_close(dy / dz, IY / IZ, 0.02,
        "Ratio: δy/δz = Iy/Iz");
}

// ================================================================
// 5. SS Beam 3D: Center Load in Y
// ================================================================

#[test]
fn validation_3d_bending_ss_y() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let fixed = vec![true, true, true, true, true, true];
    let roller = vec![false, true, true, false, false, false];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, Some(roller), loads);
    let results = linear::solve_3d(&input).unwrap();

    // δ_mid = PL³/(48EIz) for SS beam with center load
    let delta_exact = p * l * l * l / (48.0 * e_eff * IZ);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uy.abs();
    assert_close(d_mid, delta_exact, 0.05,
        "SS 3D Y: δ = PL³/(48EIz)");
}

// ================================================================
// 6. SS Beam 3D: Center Load in Z
// ================================================================

#[test]
fn validation_3d_bending_ss_z() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let mid = n / 2 + 1;
    let fixed = vec![true, true, true, true, true, true];
    let roller = vec![false, true, true, false, false, false];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, Some(roller), loads);
    let results = linear::solve_3d(&input).unwrap();

    // δ_mid = PL³/(48EIy) for SS beam with center load in Z
    let delta_exact = p * l * l * l / (48.0 * e_eff * IY);
    let d_mid = results.displacements.iter()
        .find(|d| d.node_id == mid).unwrap().uz.abs();
    assert_close(d_mid, delta_exact, 0.05,
        "SS 3D Z: δ = PL³/(48EIy)");
}

// ================================================================
// 7. Fixed-Fixed 3D: Center Load Reactions
// ================================================================

#[test]
fn validation_3d_bending_fixed_fixed() {
    let l = 6.0;
    let n = 12;
    let p = 20.0;

    let mid = n / 2 + 1;
    let fixed = vec![true, true, true, true, true, true];

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: mid, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), Some(fixed), loads);
    let results = linear::solve_3d(&input).unwrap();

    // Reactions: each end carries P/2
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r_end = results.reactions.iter().find(|r| r.node_id == n + 1).unwrap();

    assert_close(r1.fy, p / 2.0, 0.02, "FF 3D: Fy_left = P/2");
    assert_close(r_end.fy, p / 2.0, 0.02, "FF 3D: Fy_right = P/2");

    // Fixed-end moment: M = PL/8
    assert_close(r1.mz.abs(), p * l / 8.0, 0.02, "FF 3D: Mz = PL/8");
}

// ================================================================
// 8. 3D Cantilever Rotation at Tip
// ================================================================

#[test]
fn validation_3d_bending_rotation() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // θz = PL²/(2EIz) for cantilever with tip load in Y
    let theta_exact = p * l * l / (2.0 * e_eff * IZ);
    assert_close(tip.rz.abs(), theta_exact, 0.02,
        "3D rotation: θz = PL²/(2EIz)");

    // No rotation about Y (load in Y-plane only)
    assert!(tip.ry.abs() < 1e-6,
        "3D rotation: θy ≈ 0: {:.6e}", tip.ry);
}
