/// Validation: 3D Frame Stiffness Properties
///
/// References:
///   - Euler-Bernoulli beam theory: axial, bending, torsional stiffness
///   - Structural analysis fundamentals: superposition & linearity
///
/// Tests:
///   1. Axial stiffness k = EA/L
///   2. Bending stiffness in Y: 3EI_z/L^3
///   3. Bending stiffness in Z: 3EI_y/L^3
///   4. Torsional stiffness GJ/L
///   5. Stiffness proportional to E
///   6. Stiffness inversely proportional to L^3 for bending
///   7. 3D frame: lateral stiffness (L-frame)
///   8. Linearity verification (superposition)
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use crate::common::*;

const E: f64 = 200_000.0;
const NU: f64 = 0.3;
const A: f64 = 0.01;
const IY: f64 = 5e-5;
const IZ: f64 = 1e-4;
const J: f64 = 1e-5;

// ================================================================
// 1. Axial Stiffness k = EA/L
// ================================================================
//
// 3D cantilever (fixed at base, free at tip) with axial load fx at tip.
// Expected: ux_tip = F * L / (E_eff * A)

#[test]
fn validation_axial_stiffness_ea_over_l() {
    let n = 8;
    let l = 5.0;
    let f = 50.0; // kN

    let e_eff = E * 1000.0;
    let ux_expected = f * l / (e_eff * A);

    let fixed_dofs = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: f, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.ux, ux_expected, 0.02, "axial stiffness ux = F*L/(E*A)");

    // Transverse displacements should be negligible
    assert!(tip.uy.abs() < 1e-10, "uy should be zero for pure axial load, got {:.6e}", tip.uy);
    assert!(tip.uz.abs() < 1e-10, "uz should be zero for pure axial load, got {:.6e}", tip.uz);
}

// ================================================================
// 2. Bending Stiffness in Y: 3EI_z/L^3
// ================================================================
//
// Cantilever with tip fy. Deflects in Y, bending about Z.
// Expected: uy_tip = F * L^3 / (3 * E_eff * Iz)

#[test]
fn validation_bending_stiffness_y_3eiz_over_l3() {
    let n = 8;
    let l: f64 = 4.0;
    let f = 10.0; // kN

    let e_eff = E * 1000.0;
    let uy_expected = -f * l.powi(3) / (3.0 * e_eff * IZ);

    let fixed_dofs = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -f, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uy, uy_expected, 0.02, "bending stiffness uy = F*L^3/(3*E*Iz)");

    // Tip rotation about Z: theta_z = F*L^2/(2*E*Iz)
    let rz_expected = -f * l.powi(2) / (2.0 * e_eff * IZ);
    assert_close(tip.rz, rz_expected, 0.02, "tip rotation rz = F*L^2/(2*E*Iz)");
}

// ================================================================
// 3. Bending Stiffness in Z: 3EI_y/L^3
// ================================================================
//
// Cantilever with tip fz. Deflects in Z, bending about Y.
// Expected: uz_tip = F * L^3 / (3 * E_eff * Iy)

#[test]
fn validation_bending_stiffness_z_3eiy_over_l3() {
    let n = 8;
    let l: f64 = 4.0;
    let f = 10.0; // kN

    let e_eff = E * 1000.0;
    let uz_expected = -f * l.powi(3) / (3.0 * e_eff * IY);

    let fixed_dofs = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: -f,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.uz, uz_expected, 0.02, "bending stiffness uz = F*L^3/(3*E*Iy)");

    // Tip rotation about Y: theta_y = F*L^2/(2*E*Iy) (positive by right-hand rule)
    let ry_expected = f * l.powi(2) / (2.0 * e_eff * IY);
    assert_close(tip.ry, ry_expected, 0.02, "tip rotation ry = F*L^2/(2*E*Iy)");
}

// ================================================================
// 4. Torsional Stiffness GJ/L
// ================================================================
//
// Cantilever with tip torque mx. Twists about X axis.
// Expected: rx_tip = T * L / (G_eff * J)

#[test]
fn validation_torsional_stiffness_gj_over_l() {
    let n = 8;
    let l = 4.0;
    let t = 5.0; // kN-m torque

    let e_eff = E * 1000.0;
    let g_eff = e_eff / (2.0 * (1.0 + NU));
    let rx_expected = t * l / (g_eff * J);

    let fixed_dofs = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: 0.0, fz: 0.0,
        mx: t, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    assert_close(tip.rx, rx_expected, 0.02, "torsional stiffness rx = T*L/(G*J)");

    // Transverse displacements should be negligible for pure torsion
    assert!(tip.uy.abs() < 1e-10, "uy should be zero for pure torsion, got {:.6e}", tip.uy);
    assert!(tip.uz.abs() < 1e-10, "uz should be zero for pure torsion, got {:.6e}", tip.uz);
}

// ================================================================
// 5. Stiffness Proportional to E
// ================================================================
//
// Double E, same load: displacement halves.
// Tested for bending (tip fy on cantilever).

#[test]
fn validation_stiffness_proportional_to_e() {
    let n = 8;
    let l = 4.0;
    let f = 10.0;

    let fixed_dofs = vec![true, true, true, true, true, true];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -f, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    // Run with E
    let input_1 = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs.clone(), None, loads.clone());
    let res_1 = linear::solve_3d(&input_1).unwrap();
    let uy_1 = res_1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // Run with 2*E
    let e_double = 2.0 * E;
    let input_2 = make_3d_beam(n, l, e_double, NU, A, IY, IZ, J, fixed_dofs, None, loads);
    let res_2 = linear::solve_3d(&input_2).unwrap();
    let uy_2 = res_2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy;

    // uy_2 should be half of uy_1
    let ratio = uy_1 / uy_2;
    assert_close(ratio, 2.0, 0.02, "doubling E halves bending displacement");
}

// ================================================================
// 6. Stiffness Inversely Proportional to L^3 for Bending
// ================================================================
//
// Cantilever L=3 vs L=6, same tip fy.
// delta = F*L^3/(3EI), so delta_2/delta_1 = (L2/L1)^3 = 8.

#[test]
fn validation_stiffness_inversely_proportional_to_l_cubed() {
    let n = 8;
    let l1 = 3.0;
    let l2 = 6.0;
    let f = 10.0;

    let fixed_dofs = vec![true, true, true, true, true, true];

    // L = 3
    let loads_1 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -f, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_1 = make_3d_beam(n, l1, E, NU, A, IY, IZ, J, fixed_dofs.clone(), None, loads_1);
    let res_1 = linear::solve_3d(&input_1).unwrap();
    let uy_1 = res_1.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // L = 6
    let loads_2 = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: n + 1, fx: 0.0, fy: -f, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];
    let input_2 = make_3d_beam(n, l2, E, NU, A, IY, IZ, J, fixed_dofs, None, loads_2);
    let res_2 = linear::solve_3d(&input_2).unwrap();
    let uy_2 = res_2.displacements.iter().find(|d| d.node_id == n + 1).unwrap().uy.abs();

    // Ratio should be (6/3)^3 = 8
    let ratio = uy_2 / uy_1;
    assert_close(ratio, 8.0, 0.02, "deflection ratio L^3: (6/3)^3 = 8");
}

// ================================================================
// 7. 3D Frame: Lateral Stiffness (L-frame)
// ================================================================
//
// L-frame: column along Z (height H) + beam along X (span B).
// Fixed at column base. Lateral load fx at free end of beam.
//
// Analytical (approximate, ignoring axial deformation):
//   Column acts as cantilever under end moment and shear.
//   Beam acts as cantilever under tip load.
//   Total deflection at tip = beam_bending + column_bending + column_twist
//
// We verify that the deflection lies within a physically reasonable
// range by bounding between beam-only and beam+column contributions.

#[test]
fn validation_3d_l_frame_lateral_stiffness() {
    let h = 4.0;   // column height (along Z)
    let b = 5.0;   // beam span (along X)
    let p = 10.0;  // lateral load fy at free end

    let e_eff = E * 1000.0;
    let g_eff = e_eff / (2.0 * (1.0 + NU));

    // Build an L-frame: column from (0,0,0) to (0,0,H), beam from (0,0,H) to (B,0,H)
    // Nodes
    let n_col = 4; // elements in column
    let n_beam = 4; // elements in beam
    let col_elem_len = h / n_col as f64;
    let beam_elem_len = b / n_beam as f64;

    let mut nodes = Vec::new();
    let mut node_id = 1_usize;

    // Column nodes along Z
    for i in 0..=n_col {
        nodes.push((node_id, 0.0, 0.0, i as f64 * col_elem_len));
        node_id += 1;
    }
    let corner_node = node_id - 1; // top of column

    // Beam nodes along X (starting from corner, excluding the corner itself)
    for i in 1..=n_beam {
        nodes.push((node_id, i as f64 * beam_elem_len, 0.0, h));
        node_id += 1;
    }
    let tip_node = node_id - 1;

    // Elements
    let mut elems = Vec::new();
    let mut elem_id = 1_usize;
    // Column elements
    for i in 0..n_col {
        let ni = i + 1;
        let nj = i + 2;
        elems.push((elem_id, "frame", ni, nj, 1, 1));
        elem_id += 1;
    }
    // Beam elements
    for i in 0..n_beam {
        let ni = if i == 0 { corner_node } else { corner_node + i };
        let nj = corner_node + i + 1;
        elems.push((elem_id, "frame", ni, nj, 1, 1));
        elem_id += 1;
    }

    // Supports: fixed at column base (node 1)
    let sups = vec![(1_usize, vec![true, true, true, true, true, true])];

    // Load: lateral fy at beam tip
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: tip_node, fx: 0.0, fy: -p, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let input = make_3d_input(
        nodes, vec![(1, E, NU)], vec![(1, A, IY, IZ, J)],
        elems, sups, loads,
    );
    let results = linear::solve_3d(&input).unwrap();

    let tip = results.displacements.iter().find(|d| d.node_id == tip_node).unwrap();
    let uy_tip = tip.uy.abs();

    // Analytical estimates:
    // Beam bending alone (cantilever in Y, bending about Z): P*B^3/(3*E*Iz)
    let delta_beam = p * b.powi(3) / (3.0 * e_eff * IZ);

    // Column contribution: the lateral load at the beam tip creates a torque
    // on the column (T = P*B) and a transverse shear. The column bends about
    // its local axis and twists, adding displacement at the beam tip.
    //
    // Column torsion contribution to tip displacement:
    //   twist = T*H/(G*J) = P*B*H/(G*J)
    //   uy_from_twist = twist * B (lever arm)
    // But also column bending: P*H^3/(3*E*Iz_col) adds uy at corner.
    //
    // Lower bound: beam bending alone
    // Upper bound: beam bending + column bending + column torsion effect
    let delta_col_bend = p * h.powi(3) / (3.0 * e_eff * IZ);
    let twist_angle = p * b * h / (g_eff * J);
    let delta_col_twist = twist_angle * b;

    let lower = delta_beam * 0.8; // Allow some margin
    let upper = (delta_beam + delta_col_bend + delta_col_twist) * 1.5;

    assert!(
        uy_tip > lower && uy_tip < upper,
        "L-frame tip uy={:.6e} should be between lower={:.6e} and upper={:.6e}",
        uy_tip, lower, upper
    );

    // Equilibrium check: sum of reactions should balance applied load
    let sum_fy: f64 = results.reactions.iter().map(|r| r.fy).sum();
    assert_close(sum_fy, p, 0.02, "equilibrium: sum(fy_reactions) = P");
}

// ================================================================
// 8. Linearity Verification
// ================================================================
//
// Apply F, 2F, 3F to same 3D cantilever.
// Displacements should scale linearly (1:2:3 ratio).

#[test]
fn validation_linearity_superposition() {
    let n = 8;
    let l = 4.0;
    let f = 10.0;
    let fixed_dofs = vec![true, true, true, true, true, true];

    let mut displacements = Vec::new();

    for multiplier in [1.0, 2.0, 3.0] {
        let load_val = f * multiplier;
        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -load_val, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })];

        let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs.clone(), None, loads);
        let results = linear::solve_3d(&input).unwrap();
        let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
        displacements.push(tip.uy);
    }

    let uy_1f = displacements[0];
    let uy_2f = displacements[1];
    let uy_3f = displacements[2];

    // Ratios should be exactly 2.0 and 3.0 for a linear solver
    let ratio_2 = uy_2f / uy_1f;
    let ratio_3 = uy_3f / uy_1f;

    assert_close(ratio_2, 2.0, 0.02, "linearity: 2F/F displacement ratio = 2");
    assert_close(ratio_3, 3.0, 0.02, "linearity: 3F/F displacement ratio = 3");

    // Also verify rotations scale linearly
    let mut rotations = Vec::new();
    for multiplier in [1.0, 2.0, 3.0] {
        let load_val = f * multiplier;
        let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n + 1, fx: 0.0, fy: -load_val, fz: 0.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        })];

        let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed_dofs.clone(), None, loads);
        let results = linear::solve_3d(&input).unwrap();
        let tip = results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
        rotations.push(tip.rz);
    }

    let rz_ratio_2 = rotations[1] / rotations[0];
    let rz_ratio_3 = rotations[2] / rotations[0];

    assert_close(rz_ratio_2, 2.0, 0.02, "linearity: 2F/F rotation ratio = 2");
    assert_close(rz_ratio_3, 3.0, 0.02, "linearity: 3F/F rotation ratio = 3");
}
