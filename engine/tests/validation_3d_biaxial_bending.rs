/// Validation: 3D Biaxial Bending and Combined Loading
///
/// References:
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 5
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", Ch. 7
///   - Gere & Goodno, "Mechanics of Materials", Ch. 5 (Biaxial Bending)
///
/// 3D beams subjected to simultaneous bending about both principal axes.
/// For linear elastic analysis, biaxial bending = superposition of
/// uniaxial bending cases.
///
/// Tests verify:
///   1. Cantilever Y-load: tip deflection in Y only
///   2. Cantilever Z-load: tip deflection in Z only
///   3. Biaxial superposition: combined Y+Z = sum of individual
///   4. 3D beam torsion: twist under concentrated torque
///   5. Biaxial moment: fixed beam under My and Mz
///   6. 3D cantilever UDL in Y and Z: combined deflection
///   7. 3D frame: L-shaped frame under gravity
///   8. Stiffness ratio: Iy vs Iz deflection ratio
mod helpers;

use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use helpers::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 8e-5;
const IZ: f64 = 1e-4;
const J: f64 = 5e-5;

// ================================================================
// 1. Cantilever Y-Load: Tip Deflection in Y Only
// ================================================================
//
// 3D cantilever with tip load in Y direction.
// δ_y = PL³/(3EI_z), δ_z = 0

#[test]
fn validation_3d_biaxial_cantilever_y() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0; // kN/m² units

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], // fixed
        None, // free
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let dy_exact = p * l.powi(3) / (3.0 * e_eff * IZ);
    assert_close(tip.uy.abs(), dy_exact, 0.02, "3D cantilever Y: δ_y = PL³/(3EI_z)");
    assert!(tip.uz.abs() < 1e-10, "3D cantilever Y: δ_z ≈ 0: {:.6e}", tip.uz);
}

// ================================================================
// 2. Cantilever Z-Load: Tip Deflection in Z Only
// ================================================================
//
// δ_z = PL³/(3EI_y), δ_y = 0

#[test]
fn validation_3d_biaxial_cantilever_z() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let dz_exact = p * l.powi(3) / (3.0 * e_eff * IY);
    assert_close(tip.uz.abs(), dz_exact, 0.02, "3D cantilever Z: δ_z = PL³/(3EI_y)");
    assert!(tip.uy.abs() < 1e-10, "3D cantilever Z: δ_y ≈ 0: {:.6e}", tip.uy);
}

// ================================================================
// 3. Biaxial Superposition: Combined Y+Z = Sum of Individual
// ================================================================
//
// Biaxial loading should decompose into independent Y and Z responses.

#[test]
fn validation_3d_biaxial_superposition() {
    let l = 5.0;
    let n = 10;
    let py = 10.0;
    let pz = 8.0;

    // Y only
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_y,
    );
    let ry = linear::solve_3d(&input_y).unwrap();
    let tip_y = ry.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Z only
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_z,
    );
    let rz = linear::solve_3d(&input_z).unwrap();
    let tip_z = rz.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Combined
    let loads_both = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -py, fz: -pz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_both = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_both,
    );
    let rb = linear::solve_3d(&input_both).unwrap();
    let tip_b = rb.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined = Y + Z
    assert_close(tip_b.uy, tip_y.uy + tip_z.uy, 0.001, "Biaxial: uy superposition");
    assert_close(tip_b.uz, tip_y.uz + tip_z.uz, 0.001, "Biaxial: uz superposition");
}

// ================================================================
// 4. 3D Beam Torsion: Twist Under Concentrated Torque
// ================================================================
//
// Cantilever with tip torque T: φ = TL/(GJ)
// G = E/(2(1+ν))

#[test]
fn validation_3d_biaxial_torsion() {
    let l = 5.0;
    let n = 10;
    let t = 5.0;
    let e_eff = E * 1000.0;
    let g = e_eff / (2.0 * (1.0 + NU));

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: t, my: 0.0, mz: 0.0, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let phi_exact = t * l / (g * J);
    assert_close(tip.rx.abs(), phi_exact, 0.02, "Torsion: φ = TL/(GJ)");

    // No transverse deflection
    assert!(tip.uy.abs() < 1e-10, "Torsion: no δ_y: {:.6e}", tip.uy);
    assert!(tip.uz.abs() < 1e-10, "Torsion: no δ_z: {:.6e}", tip.uz);
}

// ================================================================
// 5. Biaxial Moment: Fixed Beam Under My and Mz
// ================================================================
//
// Cantilever with tip moments My and Mz.
// Tip rotations: θ_y = M_y*L/(EI_y), θ_z = M_z*L/(EI_z)

#[test]
fn validation_3d_biaxial_moment() {
    let l = 5.0;
    let n = 10;
    let my = 8.0;
    let mz = 5.0;
    let e_eff = E * 1000.0;

    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: my, mz: mz, bw: None,
    })];
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let theta_y_exact = my * l / (e_eff * IY);
    let theta_z_exact = mz * l / (e_eff * IZ);

    assert_close(tip.ry.abs(), theta_y_exact, 0.02, "Biaxial moment: θ_y = M_y*L/(EI_y)");
    assert_close(tip.rz.abs(), theta_z_exact, 0.02, "Biaxial moment: θ_z = M_z*L/(EI_z)");
}

// ================================================================
// 6. 3D Cantilever UDL in Y and Z: Combined Deflection
// ================================================================
//
// δ_y = qy*L⁴/(8EI_z), δ_z = qz*L⁴/(8EI_y) for cantilever UDL

#[test]
fn validation_3d_biaxial_udl() {
    let l = 5.0;
    let n = 10;
    let qy = -8.0;
    let qz = -6.0;
    let e_eff = E * 1000.0;

    let loads: Vec<SolverLoad3D> = (1..=n)
        .map(|i| SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: i, q_yi: qy, q_yj: qy, q_zi: qz, q_zj: qz, a: None, b: None,
        }))
        .collect();
    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap();

    let dy_exact = qy.abs() * l.powi(4) / (8.0 * e_eff * IZ);
    let dz_exact = qz.abs() * l.powi(4) / (8.0 * e_eff * IY);

    assert_close(tip.uy.abs(), dy_exact, 0.02, "3D UDL: δ_y = qy*L⁴/(8EI_z)");
    assert_close(tip.uz.abs(), dz_exact, 0.02, "3D UDL: δ_z = qz*L⁴/(8EI_y)");
}

// ================================================================
// 7. 3D L-Shaped Frame: Gravity Load
// ================================================================
//
// L-shaped frame: vertical column + horizontal beam at 90°.
// Gravity on beam tip should produce bending in column and beam.

#[test]
fn validation_3d_biaxial_l_frame() {
    let h = 4.0;
    let w = 3.0;
    let p = 10.0;

    // Column: (0,0,0) → (0,h,0), Beam: (0,h,0) → (w,h,0)
    let input = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, h, 0.0), (3, w, h, 0.0)],
        vec![(1, E, NU)],
        vec![(1, A, IY, IZ, J)],
        vec![
            (1, "frame", 1, 2, 1, 1),
            (2, "frame", 2, 3, 1, 1),
        ],
        vec![(1, vec![true, true, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 3, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    let results = linear::solve_3d(&input).unwrap();

    // Tip should deflect downward
    let tip = results.displacements.iter()
        .find(|d| d.node_id == 3).unwrap();
    assert!(tip.uy < 0.0, "L-frame: tip deflects down: {:.6e}", tip.uy);

    // Global equilibrium: ΣFy = 0
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.fy, p, 0.01, "L-frame: Ry = P");

    // Base moment should resist cantilever moment M = P*w
    assert!(r1.mz.abs() > 0.0, "L-frame: base moment exists");
}

// ================================================================
// 8. Stiffness Ratio: Iy vs Iz Deflection Ratio
// ================================================================
//
// For same load, δ_z/δ_y = Iz/Iy (inverse of I ratio)

#[test]
fn validation_3d_biaxial_stiffness_ratio() {
    let l = 5.0;
    let n = 10;
    let p = 10.0;

    // Y load → uses IZ for bending
    let loads_y = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -p, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_y = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_y,
    );
    let dy = linear::solve_3d(&input_y).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Z load → uses IY for bending
    let loads_z = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_z = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true], None, loads_z,
    );
    let dz = linear::solve_3d(&input_z).unwrap()
        .displacements.iter().find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // δ ∝ 1/I → δ_z/δ_y = IZ/IY
    let ratio = dz / dy;
    let expected = IZ / IY;
    assert_close(ratio, expected, 0.02, "Stiffness ratio: δ_z/δ_y = Iz/Iy");
}
