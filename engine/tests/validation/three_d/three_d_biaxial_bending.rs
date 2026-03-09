/// Validation: 3D Biaxial Bending in Beams and Frames
///
/// References:
///   - Gere & Goodno, "Mechanics of Materials", 9th Ed., §6.5 (unsymmetric bending)
///   - Pilkey, "Formulas for Stress, Strain and Structural Matrices", 2nd Ed.
///   - McGuire, Gallagher & Ziemian, "Matrix Structural Analysis", 2nd Ed., Ch. 5
///   - Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
///   - Timoshenko & Gere, "Theory of Elastic Stability", 2nd Ed., §5.2
///
/// Tests verify 3D biaxial bending behavior:
///   1. Cantilever with 45-degree load: equal Y and Z components
///   2. Rectangular section: weak vs strong axis deflection ratio = Iz/Iy
///   3. Equal moments about both axes: deflection components match (square section)
///   4. 3D beam deflection under skewed load: vector superposition
///   5. Biaxial bending: stress resultant magnitudes at fixed support
///   6. Load at angle alpha: Y and Z components scale with cos/sin
///   7. Square section: equal response in both directions
///   8. Combined biaxial bending + axial load: uncoupled superposition
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 1e-4;          // weak axis
const IZ: f64 = 4e-4;          // strong axis (4x stiffer than weak)
const J: f64 = 1.5e-4;
const E_EFF: f64 = E * 1000.0; // kN/m²

// ================================================================
// 1. Cantilever with 45-Degree Load: Equal Y and Z Components
// ================================================================
//
// A cantilever loaded at 45° in the YZ plane has equal Fy and Fz
// components. Since δy = Fy·L³/(3EIz) and δz = Fz·L³/(3EIy),
// with Fy = Fz the ratio δz/δy = Iz/Iy.
//
// Reference: McGuire et al. §5.3, Przemieniecki §4.2

#[test]
fn validation_biaxial_cantilever_45deg_load() {
    let l = 5.0;
    let n = 8;
    let fy = 10.0;
    let fz = 10.0; // equal components → 45-degree load

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    let delta_y = fy * l.powi(3) / (3.0 * E_EFF * IZ);
    let delta_z = fz * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.uy.abs(), delta_y, 0.02, "biaxial 45deg: δy = FyL³/(3EIz)");
    assert_close(tip.uz.abs(), delta_z, 0.02, "biaxial 45deg: δz = FzL³/(3EIy)");

    // Ratio of deflections should equal ratio of inertias: δz/δy = Iz/Iy = 4
    let ratio_fem = tip.uz.abs() / tip.uy.abs();
    let ratio_theory = IZ / IY;
    assert_close(ratio_fem, ratio_theory, 0.03, "biaxial 45deg: δz/δy = Iz/Iy");
}

// ================================================================
// 2. Rectangular Section: Weak vs Strong Axis Deflection Ratio
// ================================================================
//
// For equal transverse loads, the ratio of tip deflections from
// bending about the weak axis vs strong axis equals Iz/Iy.
// Tests that the solver correctly uses the right second moment
// of area for each bending direction.
//
// Reference: Gere & Goodno §6.5, Pilkey Table 2.1

#[test]
fn validation_biaxial_weak_vs_strong_axis_ratio() {
    let l = 4.0;
    let n = 8;
    let f = 10.0;

    // Load in Y-direction (bends about Z-axis → uses Iz = strong axis)
    let input_y = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: f, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_strong = tip_y.uy.abs();

    // Load in Z-direction (bends about Y-axis → uses Iy = weak axis)
    let input_z = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: f,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let delta_weak = tip_z.uz.abs();

    // Deflection ratio = inertia ratio: δ_weak / δ_strong = Iz / Iy = 4
    let ratio_fem = delta_weak / delta_strong;
    let ratio_theory = IZ / IY;
    assert_close(ratio_fem, ratio_theory, 0.03,
        "weak/strong axis deflection ratio = Iz/Iy");

    // Weak-axis deflection must exceed strong-axis deflection
    assert!(delta_weak > delta_strong,
        "Weak-axis δ={:.6e} must exceed strong-axis δ={:.6e}", delta_weak, delta_strong);
}

// ================================================================
// 3. Equal Moments About Both Axes: Square Section Deflection
// ================================================================
//
// For a square cross-section (Iy = Iz), equal transverse loads produce
// equal deflections in Y and Z. Tests isotropy of the 3D beam element
// stiffness for a symmetric section.
//
// Reference: Przemieniecki §4.2 (stiffness matrix for symmetric sections)

#[test]
fn validation_biaxial_equal_axes_equal_deflection() {
    let l = 5.0;
    let n = 8;
    let f = 10.0;
    let i_sq = 1e-4; // square section: Iy = Iz

    let input = make_3d_beam(
        n, l, E, NU, A, i_sq, i_sq, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: f, fz: f,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // δy = δz for square section with equal loads
    assert_close(tip.uy.abs(), tip.uz.abs(), 0.02, "square section: |δy| = |δz|");

    // Both match analytical cantilever formula: δ = F·L³/(3EI)
    let delta_exact = f * l.powi(3) / (3.0 * E_EFF * i_sq);
    assert_close(tip.uy.abs(), delta_exact, 0.02, "square section: δy = FL³/(3EI)");
    assert_close(tip.uz.abs(), delta_exact, 0.02, "square section: δz = FL³/(3EI)");
}

// ================================================================
// 4. 3D Beam Deflection Under Skewed Load: Vector Superposition
// ================================================================
//
// A load applied at an arbitrary angle α in the YZ plane can be
// decomposed into Fy = F·cos(α) and Fz = F·sin(α). The FEM result
// for the combined load must equal the vector sum of the individual
// Y-only and Z-only load cases (superposition principle).
//
// Reference: Gere & Goodno §6.5 (unsymmetric bending by superposition)

#[test]
fn validation_biaxial_skewed_load_superposition() {
    let l = 4.0;
    let n = 6;
    let f_mag = 15.0;
    let alpha: f64 = 30.0_f64.to_radians();
    let fy = f_mag * alpha.cos();
    let fz = f_mag * alpha.sin();

    let fixed = vec![true, true, true, true, true, true];

    // Y-only case
    let input_y = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Z-only case
    let input_z = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Combined case
    let input_c = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_c = linear::solve_3d(&input_c).unwrap();
    let tip_c = res_c.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined = Y-only + Z-only
    assert_close(tip_c.uy, tip_y.uy + tip_z.uy, 0.01, "biaxial superposition: uy");
    assert_close(tip_c.uz, tip_y.uz + tip_z.uz, 0.01, "biaxial superposition: uz");
}

// ================================================================
// 5. Biaxial Bending: Stress Resultant Magnitudes at Fixed Support
// ================================================================
//
// A cantilever with biaxial loading must develop fixed-end moments My
// and Mz consistent with statics:
//   Mz_fixed = Fy * L  (moment about Z due to Fy load)
//   My_fixed = Fz * L  (moment about Y due to Fz load)
//
// Reference: McGuire et al. §5.3, Pilkey §3.2

#[test]
fn validation_biaxial_stress_resultants() {
    let l = 4.0;
    let n = 4;
    let fy = 10.0;
    let fz = 8.0;

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();

    // Global reaction at fixed node 1 must balance applied loads
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.fy.abs(), fy, 0.02, "biaxial: reaction Fy at fixed end");
    assert_close(r1.fz.abs(), fz, 0.02, "biaxial: reaction Fz at fixed end");

    // Fixed-end moments: Mz = Fy·L, My = Fz·L
    assert_close(r1.mz.abs(), fy * l, 0.02, "biaxial: fixed-end Mz = Fy*L");
    assert_close(r1.my.abs(), fz * l, 0.02, "biaxial: fixed-end My = Fz*L");

    // Root element shear forces should match applied loads
    let ef = results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    assert_close(ef.vy_start.abs(), fy, 0.05, "biaxial: Vy at root ≈ Fy");
    assert_close(ef.vz_start.abs(), fz, 0.05, "biaxial: Vz at root ≈ Fz");
}

// ================================================================
// 6. Load at Angle Alpha: Y and Z Components Scale with Cos/Sin
// ================================================================
//
// As load angle α varies from 0 to 90°, the Y-component tip deflection
// scales with cos(α) and the Z-component with sin(α).
// Checking at α = 0 and α = 90° verifies correct decomposition.
//
// Reference: Gere & Goodno §6.5, Pilkey §3.3

#[test]
fn validation_biaxial_angle_decomposition() {
    let l: f64 = 5.0;
    let n = 8;
    let f_mag = 12.0;
    let i_sq: f64 = 1e-4; // square section for clarity

    let delta_pure = f_mag * l.powi(3) / (3.0 * E_EFF * i_sq);

    // alpha = 0 deg: load entirely in Y → deflects in Y only
    let input_0 = make_3d_beam(n, l, E, NU, A, i_sq, i_sq, J,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: f_mag, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_0 = linear::solve_3d(&input_0).unwrap();
    let tip_0 = res_0.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_0.uy.abs(), delta_pure, 0.02, "alpha=0: δy = FL³/(3EI)");
    assert!(tip_0.uz.abs() < 1e-8,
        "alpha=0: δz should be ~0, got {:.2e}", tip_0.uz.abs());

    // alpha = 90 deg: load entirely in Z → deflects in Z only
    let input_90 = make_3d_beam(n, l, E, NU, A, i_sq, i_sq, J,
        vec![true, true, true, true, true, true], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: f_mag,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_90 = linear::solve_3d(&input_90).unwrap();
    let tip_90 = res_90.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    assert_close(tip_90.uz.abs(), delta_pure, 0.02, "alpha=90: δz = FL³/(3EI)");
    assert!(tip_90.uy.abs() < 1e-8,
        "alpha=90: δy should be ~0, got {:.2e}", tip_90.uy.abs());
}

// ================================================================
// 7. Square Section: Equal Response in Both Directions
// ================================================================
//
// A cantilever with a square cross-section (Iy = Iz) under the same load
// magnitude in Y and Z must produce identical tip deflections by symmetry.
// Tests the 3D element's rotational symmetry about the beam axis.
//
// Reference: Przemieniecki §4.2 (equal principal stiffnesses)

#[test]
fn validation_biaxial_square_section_symmetry() {
    let l = 6.0;
    let n = 8;
    let f = 15.0;
    let i_sq = 2e-4;

    let fixed = vec![true, true, true, true, true, true];

    // Load in Y only
    let input_y = make_3d_beam(n, l, E, NU, A, i_sq, i_sq, J, fixed.clone(), None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: f, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_y = linear::solve_3d(&input_y).unwrap();
    let delta_y = res_y.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Load in Z only
    let input_z = make_3d_beam(n, l, E, NU, A, i_sq, i_sq, J, fixed, None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx: 0.0, fy: 0.0, fz: f,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })]);
    let res_z = linear::solve_3d(&input_z).unwrap();
    let delta_z = res_z.displacements.iter()
        .find(|d| d.node_id == n + 1).unwrap().uz.abs();

    // Square section: |δy| = |δz| for same load magnitude
    assert_close(delta_y, delta_z, 0.02, "square section symmetry: |δy| = |δz|");

    // Both match the analytical cantilever formula
    let delta_exact = f * l.powi(3) / (3.0 * E_EFF * i_sq);
    assert_close(delta_y, delta_exact, 0.02, "square section: δy = FL³/(3EI)");
    assert_close(delta_z, delta_exact, 0.02, "square section: δz = FL³/(3EI)");
}

// ================================================================
// 8. Combined Biaxial Bending + Axial Load
// ================================================================
//
// A cantilever subjected to axial force Fx, transverse force Fy (strong
// axis bending) and Fz (weak axis bending) simultaneously.
// For linear analysis, the displacements are uncoupled:
//   ux = Fx*L/(EA),  uy = Fy*L³/(3EIz),  uz = Fz*L³/(3EIy)
//
// Reference: McGuire et al. §5.3, Przemieniecki §4.3

#[test]
fn validation_biaxial_combined_axial_biaxial() {
    let l = 5.0;
    let n = 8;
    let fx = 50.0; // axial tension
    let fy = 10.0; // strong-axis transverse
    let fz =  8.0; // weak-axis transverse

    let input = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        vec![true, true, true, true, true, true],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1,
            fx, fy, fz,
            mx: 0.0, my: 0.0, mz: 0.0,
            bw: None,
        })],
    );

    let results = linear::solve_3d(&input).unwrap();
    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Analytical uncoupled solutions
    let ux_exact = fx * l / (E_EFF * A);
    let uy_exact = fy * l.powi(3) / (3.0 * E_EFF * IZ);
    let uz_exact = fz * l.powi(3) / (3.0 * E_EFF * IY);

    assert_close(tip.ux.abs(), ux_exact, 0.03, "combined biaxial+axial: ux = FxL/(EA)");
    assert_close(tip.uy.abs(), uy_exact, 0.03, "combined biaxial+axial: uy = FyL³/(3EIz)");
    assert_close(tip.uz.abs(), uz_exact, 0.03, "combined biaxial+axial: uz = FzL³/(3EIy)");

    // Global equilibrium: reactions must balance all applied forces
    let r1 = results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(r1.fx.abs(), fx, 0.02, "combined: reaction Fx");
    assert_close(r1.fy.abs(), fy, 0.02, "combined: reaction Fy");
    assert_close(r1.fz.abs(), fz, 0.02, "combined: reaction Fz");
}
