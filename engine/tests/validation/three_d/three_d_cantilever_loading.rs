/// Validation: 3D Cantilever Under Various Loading Conditions
///
/// References:
///   - Timoshenko & Gere, "Theory of Elastic Stability"
///   - Cook et al., "Concepts and Applications of FEA", Ch. 2
///   - Megson, "Aircraft Structures", Ch. 16
///
/// A 3D cantilever beam provides a clean benchmark because:
/// - All 6 DOFs are fixed at one end
/// - Analytical solutions are available for all load types
/// - The transformation from local to global is trivial (aligned with X)
///
/// Tests verify:
///   1. Tip force in Y: δ_y = PL³/(3EI_z)
///   2. Tip force in Z: δ_z = PL³/(3EI_y)
///   3. Tip torque: φ = TL/(GJ)
///   4. Tip moment about Y: rotation θ_y = ML/(EI_y)
///   5. Tip moment about Z: rotation θ_z = ML/(EI_z)
///   6. Combined biaxial force: superposition
///   7. Distributed load in Y: δ_y = qL⁴/(8EI_z)
///   8. Axial load: δ_x = PL/(EA)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A_VAL: f64 = 0.01;
const IY: f64 = 2e-4;
const IZ_VAL: f64 = 1e-4;
const J: f64 = 1.5e-4;

// ================================================================
// 1. Tip Force in Y
// ================================================================

#[test]
fn validation_3d_cantilever_fy() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_expected = p * l.powi(3) / (3.0 * e_eff * IZ_VAL);

    assert_close(d_tip.uy.abs(), delta_expected, 0.02,
        "3D cantilever Fy: δ_y = PL³/(3EI_z)");

    // Other displacements should be negligible
    assert!(d_tip.ux.abs() < 1e-8, "3D cantilever Fy: δ_x ≈ 0");
    assert!(d_tip.uz.abs() < 1e-8, "3D cantilever Fy: δ_z ≈ 0");
}

// ================================================================
// 2. Tip Force in Z
// ================================================================

#[test]
fn validation_3d_cantilever_fz() {
    let l = 8.0;
    let n = 16;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_expected = p * l.powi(3) / (3.0 * e_eff * IY);

    assert_close(d_tip.uz.abs(), delta_expected, 0.02,
        "3D cantilever Fz: δ_z = PL³/(3EI_y)");
}

// ================================================================
// 3. Tip Torque
// ================================================================
//
// φ = TL/(GJ), where G = E/(2(1+ν))

#[test]
fn validation_3d_cantilever_torque() {
    let l = 6.0;
    let n = 12;
    let t = 5.0;
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let phi_expected = t * l / (g * J);

    assert_close(d_tip.rx.abs(), phi_expected, 0.02,
        "3D cantilever torque: φ = TL/(GJ)");
}

// ================================================================
// 4. Tip Moment About Y
// ================================================================
//
// θ_y = ML/(EI_y) at tip (uniform curvature)

#[test]
fn validation_3d_cantilever_my() {
    let l = 8.0;
    let n = 16;
    let m = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: m, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_expected = m * l / (e_eff * IY);

    assert_close(d_tip.ry.abs(), theta_expected, 0.02,
        "3D cantilever My: θ_y = ML/(EI_y)");
}

// ================================================================
// 5. Tip Moment About Z
// ================================================================

#[test]
fn validation_3d_cantilever_mz() {
    let l = 8.0;
    let n = 16;
    let m = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: m, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let theta_expected = m * l / (e_eff * IZ_VAL);

    assert_close(d_tip.rz.abs(), theta_expected, 0.02,
        "3D cantilever Mz: θ_z = ML/(EI_z)");
}

// ================================================================
// 6. Combined Biaxial Force: Superposition
// ================================================================

#[test]
fn validation_3d_cantilever_biaxial() {
    let l = 8.0;
    let n = 16;
    let py = -10.0;
    let pz = -5.0;

    // Combined load
    let loads_combined = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: py, fz: pz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input_combined = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J,
        fixed.clone(), None, loads_combined);
    let res_combined = linear::solve_3d(&input_combined).unwrap();

    // Individual loads
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: py, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J,
        fixed.clone(), None, loads_y);
    let res_y = linear::solve_3d(&input_y).unwrap();

    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: pz,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J,
        fixed, None, loads_z);
    let res_z = linear::solve_3d(&input_z).unwrap();

    let d_combined = res_combined.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let d_y_only = res_y.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let d_z_only = res_z.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined = sum of individual
    assert_close(d_combined.uy, d_y_only.uy, 0.01,
        "3D biaxial superposition: uy matches");
    assert_close(d_combined.uz, d_z_only.uz, 0.01,
        "3D biaxial superposition: uz matches");
}

// ================================================================
// 7. Distributed Load in Y
// ================================================================
//
// δ_tip = qL⁴/(8EI_z)

#[test]
fn validation_3d_cantilever_udl_y() {
    let l = 6.0;
    let n = 12;
    let q: f64 = -8.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i,
            q_yi: q, q_yj: q, q_zi: 0.0, q_zj: 0.0,
            a: None, b: None,
        }))
        .collect();
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_expected = q.abs() * l.powi(4) / (8.0 * e_eff * IZ_VAL);

    assert_close(d_tip.uy.abs(), delta_expected, 0.02,
        "3D cantilever UDL_y: δ_y = qL⁴/(8EI_z)");
}

// ================================================================
// 8. Axial Load
// ================================================================
//
// δ_x = PL/(EA)

#[test]
fn validation_3d_cantilever_axial() {
    let l = 8.0;
    let n = 16;
    let p = 20.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: p, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let fixed = vec![true, true, true, true, true, true];
    let input = make_3d_beam(n, l, E, NU, A_VAL, IY, IZ_VAL, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let d_tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();
    let delta_expected = p * l / (e_eff * A_VAL);

    assert_close(d_tip.ux.abs(), delta_expected, 0.02,
        "3D cantilever axial: δ_x = PL/(EA)");

    // Transverse displacements should be negligible
    assert!(d_tip.uy.abs() < 1e-8, "3D axial: δ_y ≈ 0");
    assert!(d_tip.uz.abs() < 1e-8, "3D axial: δ_z ≈ 0");
}
