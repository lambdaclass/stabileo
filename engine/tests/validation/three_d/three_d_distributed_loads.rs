/// Validation: 3D Distributed Load Analysis
///
/// References:
///   - Timoshenko, "Strength of Materials", Parts I & II
///   - Roark's Formulas for Stress and Strain, 9th Ed.
///   - Przemieniecki, "Theory of Matrix Structural Analysis"
///
/// Tests:
///   1. Cantilever UDL in Z: tip deflection = wL^4/(8EIy)
///   2. Cantilever UDL in Y: tip deflection = wL^4/(8EIz)
///   3. Axial distributed load via equivalent nodal forces: tip ux = wL^2/(2EA)
///   4. Simultaneous wy + wz: superposition check
///   5. Triangular load in Z: tip deflection = w_max*L^4/(30EIy)
///   6. Reaction verification: cantilever UDL wz, fz = wL, my = wL^2/2
///   7. SS beam UDL wz: total reaction fz = wL
///   8. Double load intensity = double deflection
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
// 1. UDL in Z on cantilever
// ================================================================
//
// Cantilever beam (fixed at start, free at tip), 4 elements, L=5.
// Uniform load wz = -10 kN/m applied on all elements.
// Tip deflection: delta = w*L^4 / (8*E_eff*Iy)

#[test]
fn validation_cantilever_udl_z_tip_deflection() {
    let l: f64 = 5.0;
    let n = 4;
    let w: f64 = -10.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];

    let loads: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: 0.0,
                q_yj: 0.0,
                q_zi: w,
                q_zj: w,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = |w| * L^4 / (8 * E_eff * Iy)
    let delta_exact = w.abs() * l.powi(4) / (8.0 * e_eff * IY);

    assert_close(tip.uz.abs(), delta_exact, 0.03, "cantilever UDL wz tip uz");
}

// ================================================================
// 2. UDL in Y on cantilever
// ================================================================
//
// Cantilever beam, 4 elements, L=5.
// Uniform load wy = -10 kN/m.
// Tip deflection: delta = w*L^4 / (8*E_eff*Iz)

#[test]
fn validation_cantilever_udl_y_tip_deflection() {
    let l: f64 = 5.0;
    let n = 4;
    let w: f64 = -10.0;
    let e_eff = E * 1000.0;

    let fixed = vec![true, true, true, true, true, true];

    let loads: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: w,
                q_yj: w,
                q_zi: 0.0,
                q_zj: 0.0,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = |w| * L^4 / (8 * E_eff * Iz)
    let delta_exact = w.abs() * l.powi(4) / (8.0 * e_eff * IZ);

    assert_close(tip.uy.abs(), delta_exact, 0.03, "cantilever UDL wy tip uy");
}

// ================================================================
// 3. Axial distributed load
// ================================================================
//
// Fixed-free beam, L=5. Equivalent axial distributed load wx=5 kN/m
// applied as nodal forces at interior and tip nodes.
// Tip ux = w*L^2 / (2*E_eff*A)

#[test]
fn validation_axial_distributed_load_tip_displacement() {
    let l: f64 = 5.0;
    let n: usize = 4;
    let w: f64 = 5.0; // kN/m axial
    let e_eff = E * 1000.0;
    let elem_len = l / n as f64;

    let fixed = vec![true, true, true, true, true, true];

    // Simulate uniform axial distributed load via equivalent nodal forces.
    // Each element contributes w*elem_len/2 to each of its two nodes.
    // Node 1 is fixed (its contribution is absorbed by the support).
    // Interior free nodes get contributions from two adjacent elements.
    // The tip node gets contribution from one element only.
    let mut loads: Vec<SolverLoad3D> = Vec::new();
    for node_id in 2..=n + 1 {
        let fx = if node_id == 2 || node_id == n + 1 {
            // boundary free nodes: only one adjacent element contributes
            w * elem_len / 2.0
        } else {
            // interior free nodes: two adjacent elements each contribute half
            w * elem_len
        };
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id,
            fx,
            fy: 0.0,
            fz: 0.0,
            mx: 0.0,
            my: 0.0,
            mz: 0.0,
            bw: None,
        }));
    }

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // Exact: ux_tip = w*L^2 / (2*E*A)
    let ux_exact = w * l * l / (2.0 * e_eff * A);

    assert_close(tip.ux.abs(), ux_exact, 0.05, "axial distributed load tip ux");
}

// ================================================================
// 4. Simultaneous wy + wz (superposition)
// ================================================================
//
// Both wy and wz applied on cantilever. Verify uy matches pure wy
// case and uz matches pure wz case.

#[test]
fn validation_simultaneous_wy_wz_superposition() {
    let l: f64 = 5.0;
    let n = 4;
    let wy: f64 = -10.0;
    let wz: f64 = -10.0;

    let fixed = vec![true, true, true, true, true, true];

    let make_loads = |qy: f64, qz: f64| -> Vec<SolverLoad3D> {
        (0..n)
            .map(|i| {
                SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: i + 1,
                    q_yi: qy,
                    q_yj: qy,
                    q_zi: qz,
                    q_zj: qz,
                    a: None,
                    b: None,
                })
            })
            .collect()
    };

    // Combined
    let input_both = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, make_loads(wy, wz),
    );
    let res_both = linear::solve_3d(&input_both).unwrap();
    let tip_both = res_both.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Y only
    let input_y = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, make_loads(wy, 0.0),
    );
    let res_y = linear::solve_3d(&input_y).unwrap();
    let tip_y = res_y.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Z only
    let input_z = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, make_loads(0.0, wz),
    );
    let res_z = linear::solve_3d(&input_z).unwrap();
    let tip_z = res_z.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Superposition: combined uy should match pure wy case
    assert_close(tip_both.uy, tip_y.uy, 0.02, "superposition uy vs pure wy");
    // Combined uz should match pure wz case
    assert_close(tip_both.uz, tip_z.uz, 0.02, "superposition uz vs pure wz");
}

// ================================================================
// 5. Triangular load in Z
// ================================================================
//
// Cantilever with triangular load: wz = w_max at fixed end,
// decreasing linearly to 0 at tip.
// Tip deflection: delta = w_max * L^4 / (30 * E_eff * Iy)

#[test]
fn validation_triangular_load_z_tip_deflection() {
    let l: f64 = 5.0;
    let n = 4;
    let w_max: f64 = -10.0;
    let e_eff = E * 1000.0;
    let elem_len = l / n as f64;

    let fixed = vec![true, true, true, true, true, true];

    // Linearly varying load: w_max at x=0 (fixed end), 0 at x=L (tip)
    let loads: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            let xi = i as f64 * elem_len;
            let xj = (i + 1) as f64 * elem_len;
            let wz_i = w_max * (1.0 - xi / l);
            let wz_j = w_max * (1.0 - xj / l);
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: 0.0,
                q_yj: 0.0,
                q_zi: wz_i,
                q_zj: wz_j,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let tip = results
        .displacements
        .iter()
        .find(|d| d.node_id == n + 1)
        .unwrap();

    // delta_tip = |w_max| * L^4 / (30 * E_eff * Iy)
    let delta_exact = w_max.abs() * l.powi(4) / (30.0 * e_eff * IY);

    assert_close(tip.uz.abs(), delta_exact, 0.05, "triangular load wz tip uz");
}

// ================================================================
// 6. Reaction verification: cantilever UDL wz
// ================================================================
//
// wz = -8 kN/m on L=6 cantilever.
// Reactions at fixed end: fz = |w|*L = 48, my = |w|*L^2/2 = 144.

#[test]
fn validation_cantilever_udl_wz_reactions() {
    let l: f64 = 6.0;
    let n = 4;
    let w: f64 = -8.0;

    let fixed = vec![true, true, true, true, true, true];

    let loads: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: 0.0,
                q_yj: 0.0,
                q_zi: w,
                q_zj: w,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, fixed, None, loads);
    let results = linear::solve_3d(&input).unwrap();

    let r = results.reactions.iter().find(|r| r.node_id == 1).unwrap();

    // fz = |w| * L
    let fz_exact = w.abs() * l;
    assert_close(r.fz, fz_exact, 0.02, "cantilever UDL wz reaction fz");

    // my = |w| * L^2 / 2  (magnitude)
    let my_exact = w.abs() * l * l / 2.0;
    assert_close(r.my.abs(), my_exact, 0.03, "cantilever UDL wz reaction my");
}

// ================================================================
// 7. Simply-supported beam UDL wz: total reaction fz = w*L
// ================================================================
//
// Propped cantilever: fixed at start (translations + rotations restrained),
// pinned at end (translations restrained, rotations free).
// wz = -10 kN/m. Total vertical reaction = |w| * L.

#[test]
fn validation_ss_beam_udl_wz_total_reaction() {
    let l: f64 = 5.0;
    let n = 4;
    let w: f64 = -10.0;

    // Fixed at start
    let start_dofs = vec![true, true, true, true, true, true];
    // Pinned at end: translations restrained, rotations free
    let end_dofs = Some(vec![true, true, true, false, false, false]);

    let loads: Vec<SolverLoad3D> = (0..n)
        .map(|i| {
            SolverLoad3D::Distributed(SolverDistributedLoad3D {
                element_id: i + 1,
                q_yi: 0.0,
                q_yj: 0.0,
                q_zi: w,
                q_zj: w,
                a: None,
                b: None,
            })
        })
        .collect();

    let input = make_3d_beam(n, l, E, NU, A, IY, IZ, J, start_dofs, end_dofs, loads);
    let results = linear::solve_3d(&input).unwrap();

    // Total vertical reaction must equal total applied load
    let total_applied = w.abs() * l;
    let sum_fz: f64 = results.reactions.iter().map(|r| r.fz).sum();

    assert_close(sum_fz, total_applied, 0.02, "SS beam UDL wz total fz reaction");
}

// ================================================================
// 8. Double load intensity = double deflection
// ================================================================
//
// Same cantilever geometry, wz=-5 vs wz=-10.
// Deflection ratio at tip should be exactly 2 (linear analysis).

#[test]
fn validation_double_load_double_deflection() {
    let l: f64 = 5.0;
    let n = 4;

    let fixed = vec![true, true, true, true, true, true];

    let make_loads = |w: f64| -> Vec<SolverLoad3D> {
        (0..n)
            .map(|i| {
                SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: i + 1,
                    q_yi: 0.0,
                    q_yj: 0.0,
                    q_zi: w,
                    q_zj: w,
                    a: None,
                    b: None,
                })
            })
            .collect()
    };

    // Single intensity
    let input_single = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, make_loads(-5.0),
    );
    let res_single = linear::solve_3d(&input_single).unwrap();
    let tip_single = res_single.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Double intensity
    let input_double = make_3d_beam(
        n, l, E, NU, A, IY, IZ, J,
        fixed.clone(), None, make_loads(-10.0),
    );
    let res_double = linear::solve_3d(&input_double).unwrap();
    let tip_double = res_double.displacements.iter().find(|d| d.node_id == n + 1).unwrap();

    // Ratio should be 2.0
    let ratio = tip_double.uz.abs() / tip_single.uz.abs();
    assert_close(ratio, 2.0, 0.02, "double load intensity deflection ratio");
}
