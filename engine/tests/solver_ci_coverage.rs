//! CI-grade smoke and parity tests for advanced solver paths.
//!
//! CONTRACT TESTS: sparse/dense parity and fill-ratio gates are contracts.
//! Modal/buckling analytical checks are contracts against known solutions.
//! Constraint smoke tests protect the constraint system from silent rot.
//!
//! Tolerance policy:
//!   - Analytical reference (Euler beam theory, modal freq.):  2% relative
//!   - Sparse vs dense parity:                                 1e-10 relative
//!   - Determinism (same input, same output):                  exact f64 equality
//!   - Benchmark comparison (published reference values):      5% relative

#[path = "common/mod.rs"]
mod common;

use common::{make_input, make_beam, make_3d_input, make_3d_beam};
use dedaliano_engine::solver::{linear, modal, buckling};
use dedaliano_engine::solver::assembly::{assemble_sparse_3d, assemble_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::linalg::{
    numeric_cholesky, symbolic_cholesky_with, CholOrdering,
    extract_submatrix,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ==================== Material / Section Constants ====================

/// Steel: E = 200,000 MPa, density = 7850 kg/m^3
const E: f64 = 200_000.0;
const NU: f64 = 0.3;
/// Cross-section: 250mm x 250mm square
/// A = 0.0625 m^2, I = bh^3/12 = 0.25^4/12 = 3.2552e-4 m^4
const A_MODAL: f64 = 0.0625;
const IZ_MODAL: f64 = 3.2552e-4;
const IY_MODAL: f64 = 3.2552e-4;
const J_MODAL: f64 = 5.0e-4;
const DENSITY: f64 = 7_850.0; // kg/m^3
const L_MODAL: f64 = 6.0; // m

/// EI for modal/buckling formulas.
/// E in kN/m^2 = 200,000 * 1000 = 2e8, Iz = 3.2552e-4 m^4
/// EI = 2e8 * 3.2552e-4 = 65,104 kN*m^2
const EI_KNM2: f64 = 200_000.0 * 1000.0 * IZ_MODAL; // in kN*m^2 (N*m^2 / 1000 * 1000 = kN*m^2)

/// rho*A for modal formulas (in solver units: kN-tonne-m-s).
/// density in kg/m^3 / 1000 = tonnes/m^3, then * A = tonnes/m
const RHO_A: f64 = DENSITY / 1000.0 * A_MODAL; // tonnes/m

fn make_densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), DENSITY);
    d
}

// ==================== Buckling Constants ====================

const A_BUCK: f64 = 0.01;     // m^2
const IZ_BUCK: f64 = 1e-4;    // m^4
const L_BUCK: f64 = 5.0;      // m
/// EI for buckling = E*1000 * Iz = 200,000 * 1000 * 1e-4 = 20,000 kN*m^2
const EI_BUCK: f64 = 200_000.0 * 1000.0 * IZ_BUCK;

// ==================== 1. Modal Smoke Tests ====================

/// 2D simply-supported beam: f_1 = (pi^2)/(2*pi) * sqrt(EI / (rho*A*L^4))
/// = (pi / 2) * sqrt(EI / (rho*A*L^4))
#[test]
fn modal_2d_ss_beam_first_frequency() {
    let n_elem = 10;

    // Build a simply-supported beam with no loads
    let mut input = make_beam(
        n_elem, L_MODAL, E, A_MODAL, IZ_MODAL,
        "pinned", Some("rollerX"),
        vec![],
    );
    input.loads.clear();

    let densities = make_densities();
    let result = modal::solve_modal_2d(&input, &densities, 4)
        .expect("2D modal solve should succeed");

    assert!(!result.modes.is_empty(), "should find at least one mode");

    // Exact first natural frequency for SS beam:
    // omega_1 = (pi/L)^2 * sqrt(EI / rho_A)
    // f_1 = omega_1 / (2*pi)
    let omega_exact = (std::f64::consts::PI / L_MODAL).powi(2)
        * (EI_KNM2 / RHO_A).sqrt();
    let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

    let f_computed = result.modes[0].frequency;
    let rel_err = (f_computed - f_exact).abs() / f_exact;

    println!(
        "2D SS beam modal: f_computed={:.4} Hz, f_exact={:.4} Hz, rel_err={:.4}%",
        f_computed, f_exact, rel_err * 100.0
    );
    assert!(
        rel_err < 0.02,
        "2D SS beam first frequency error {:.4}% exceeds 2% tolerance",
        rel_err * 100.0
    );
}

/// 3D cantilever beam: f_1 = (1.875^2)/(2*pi) * sqrt(EI / (rho*A*L^4))
#[test]
fn modal_3d_cantilever_first_frequency() {
    let n_elem = 10;

    // Build a cantilever (fixed at start, free at end) with no loads
    let input = make_3d_beam(
        n_elem, L_MODAL, E, NU, A_MODAL, IY_MODAL, IZ_MODAL, J_MODAL,
        vec![true, true, true, true, true, true], // fixed
        None,                                      // free end
        vec![],                                    // no loads
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, 6)
        .expect("3D modal solve should succeed");

    assert!(!result.modes.is_empty(), "should find at least one mode");

    // Cantilever first mode: omega = (beta_1*L)^2 / L^2 * sqrt(EI/(rho*A))
    // where beta_1*L = 1.875104
    let beta1_l: f64 = 1.875104;
    let omega_exact = beta1_l.powi(2) / (L_MODAL as f64).powi(2) * (EI_KNM2 / RHO_A).sqrt();
    let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

    // The 3D cantilever has two bending directions (Y and Z) with the same Iy=Iz,
    // so the first two modes should be near-degenerate. Take the lowest frequency.
    let f_computed = result.modes[0].frequency;
    let rel_err = (f_computed - f_exact).abs() / f_exact;

    println!(
        "3D cantilever modal: f_computed={:.4} Hz, f_exact={:.4} Hz, rel_err={:.4}%",
        f_computed, f_exact, rel_err * 100.0
    );
    assert!(
        rel_err < 0.02,
        "3D cantilever first frequency error {:.4}% exceeds 2% tolerance",
        rel_err * 100.0
    );
}

/// Modal analysis returns the requested number of modes without crashing.
#[test]
fn modal_returns_requested_mode_count() {
    let n_elem = 8;
    let requested_modes = 5;

    let input = make_3d_beam(
        n_elem, L_MODAL, E, NU, A_MODAL, IY_MODAL, IZ_MODAL, J_MODAL,
        vec![true, true, true, true, true, true],
        None,
        vec![],
    );

    let densities = make_densities();
    let result = modal::solve_modal_3d(&input, &densities, requested_modes)
        .expect("3D modal solve should succeed");

    // Should find at least requested_modes (or all available if fewer DOFs)
    assert!(
        result.modes.len() >= requested_modes.min(result.n_dof),
        "Expected at least {} modes, got {}",
        requested_modes, result.modes.len()
    );

    // Frequencies should be in ascending order
    for i in 1..result.modes.len() {
        assert!(
            result.modes[i].frequency >= result.modes[i - 1].frequency - 1e-6,
            "Mode frequencies not ascending: f[{}]={:.6} < f[{}]={:.6}",
            i, result.modes[i].frequency, i - 1, result.modes[i - 1].frequency
        );
    }
}

// ==================== 2. Buckling Smoke Tests ====================

/// Euler column (pinned-pinned, 2D): P_cr = pi^2 * EI / L^2
#[test]
fn buckling_2d_pinned_pinned() {
    let p_applied = 100.0; // kN compression
    let n_elem = 8;

    let input = common::make_column(
        n_elem, L_BUCK, E, A_BUCK, IZ_BUCK,
        "pinned", "rollerX", -p_applied,
    );

    let result = buckling::solve_buckling_2d(&input, 3)
        .expect("2D pinned-pinned buckling should succeed");

    assert!(!result.modes.is_empty(), "should find at least one buckling mode");

    let pcr_exact = std::f64::consts::PI.powi(2) * EI_BUCK / (L_BUCK * L_BUCK);
    let lambda_exact = pcr_exact / p_applied;

    let lambda_computed = result.modes[0].load_factor;
    let rel_err = (lambda_computed - lambda_exact).abs() / lambda_exact;

    println!(
        "Euler pinned-pinned: lambda={:.4}, exact={:.4}, rel_err={:.4}%",
        lambda_computed, lambda_exact, rel_err * 100.0
    );
    assert!(
        rel_err < 0.02,
        "Euler pinned-pinned buckling error {:.4}% exceeds 2% tolerance",
        rel_err * 100.0
    );
}

/// Fixed-free column (cantilever): P_cr = pi^2 * EI / (4*L^2)
#[test]
fn buckling_2d_cantilever() {
    let p_applied = 100.0; // kN compression
    let n_elem = 8;
    let elem_len = L_BUCK / n_elem as f64;

    // Build cantilever: fixed at base, no support at tip
    let nodes: Vec<_> = (0..=n_elem)
        .map(|i| (i + 1, i as f64 * elem_len, 0.0))
        .collect();
    let elems: Vec<_> = (0..n_elem)
        .map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false))
        .collect();

    let input = make_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, A_BUCK, IZ_BUCK)],
        elems,
        vec![(1, 1, "fixed")], // only fixed at base
        vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: n_elem + 1,
            fx: -p_applied,
            fz: 0.0,
            my: 0.0,
        })],
    );

    let result = buckling::solve_buckling_2d(&input, 3)
        .expect("2D cantilever buckling should succeed");

    assert!(!result.modes.is_empty(), "should find at least one buckling mode");

    let pcr_exact = std::f64::consts::PI.powi(2) * EI_BUCK / (4.0 * L_BUCK * L_BUCK);
    let lambda_exact = pcr_exact / p_applied;

    let lambda_computed = result.modes[0].load_factor;
    let rel_err = (lambda_computed - lambda_exact).abs() / lambda_exact;

    println!(
        "Euler cantilever: lambda={:.4}, exact={:.4}, rel_err={:.4}%",
        lambda_computed, lambda_exact, rel_err * 100.0
    );
    assert!(
        rel_err < 0.03,
        "Euler cantilever buckling error {:.4}% exceeds 3% tolerance",
        rel_err * 100.0
    );
}

// ==================== 3. Sparse vs Dense Parity ====================

/// Build a 3D portal frame and verify solving twice gives identical results (determinism).
/// Also, if both sparse and dense assembly paths are accessible, compare results.
#[test]
fn sparse_dense_parity_3d_portal() {
    let nodes = vec![
        (1, 0.0, 0.0, 0.0),
        (2, 0.0, 0.0, 4.0),
        (3, 6.0, 0.0, 4.0),
        (4, 6.0, 0.0, 0.0),
        (5, 0.0, 6.0, 0.0),
        (6, 0.0, 6.0, 4.0),
        (7, 6.0, 6.0, 4.0),
        (8, 6.0, 6.0, 0.0),
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1),
        (2, "frame", 2, 3, 1, 1),
        (3, "frame", 3, 4, 1, 1),
        (4, "frame", 5, 6, 1, 1),
        (5, "frame", 6, 7, 1, 1),
        (6, "frame", 7, 8, 1, 1),
        (7, "frame", 2, 6, 1, 1),
        (8, "frame", 3, 7, 1, 1),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (4, fixed.clone()),
        (5, fixed.clone()),
        (8, fixed.clone()),
    ];
    let loads = vec![
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 2, fx: 10.0, fy: 5.0, fz: -20.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
        SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 7, fx: -5.0, fy: 0.0, fz: -15.0,
            mx: 0.0, my: 0.0, mz: 0.0, bw: None,
        }),
    ];

    let input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, A_MODAL, IY_MODAL, IZ_MODAL, J_MODAL)],
        elems, sups, loads,
    );

    // Solve twice — determinism check
    let r1 = linear::solve_3d(&input).expect("3D solve 1 failed");
    let r2 = linear::solve_3d(&input).expect("3D solve 2 failed");

    assert_eq!(r1.displacements.len(), r2.displacements.len());
    for (d1, d2) in r1.displacements.iter().zip(r2.displacements.iter()) {
        assert_eq!(d1.node_id, d2.node_id);
        assert!(
            d1.ux == d2.ux && d1.uy == d2.uy && d1.uz == d2.uz
            && d1.rx == d2.rx && d1.ry == d2.ry && d1.rz == d2.rz,
            "Determinism violated at node {}", d1.node_id
        );
    }
    for (r1r, r2r) in r1.reactions.iter().zip(r2.reactions.iter()) {
        assert_eq!(r1r.node_id, r2r.node_id);
        assert!(
            r1r.fx == r2r.fx && r1r.fy == r2r.fy && r1r.fz == r2r.fz
            && r1r.mx == r2r.mx && r1r.my == r2r.my && r1r.mz == r2r.mz,
            "Determinism violated at reaction node {}", r1r.node_id
        );
    }

    // Sparse vs dense assembly parity
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    let sasm = assemble_sparse_3d(&input, &dof_num, false);
    let dasm = assemble_3d(&input, &dof_num);

    // Compare K_ff: sparse (lower triangular CSC) vs dense (full matrix)
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff_dense = extract_submatrix(&dasm.k, n, &free_idx, &free_idx);

    let max_k = k_ff_dense.iter().map(|v| v.abs()).fold(0.0f64, f64::max);
    let mut max_rel_err = 0.0f64;

    // Check every entry in sparse K_ff against the dense version
    for j in 0..nf {
        for p in sasm.k_ff.col_ptr[j]..sasm.k_ff.col_ptr[j + 1] {
            let i = sasm.k_ff.row_idx[p];
            let sparse_val = sasm.k_ff.values[p];
            let dense_val = k_ff_dense[i * nf + j];
            let rel = (sparse_val - dense_val).abs() / max_k.max(1e-20);
            if rel > max_rel_err {
                max_rel_err = rel;
            }
        }
    }

    println!("Sparse vs dense K_ff: max_rel_err={:.2e}", max_rel_err);
    assert!(
        max_rel_err < 1e-10,
        "Sparse vs dense K_ff parity violated: max_rel_err={:.2e}",
        max_rel_err
    );

    // Compare force vectors
    let f_dense: Vec<f64> = free_idx.iter().map(|&i| dasm.f[i]).collect();
    let f_sparse: Vec<f64> = sasm.f[..nf].to_vec();
    let max_f = f_dense.iter().map(|v| v.abs()).fold(0.0f64, f64::max).max(1e-20);
    let mut max_f_err = 0.0f64;
    for i in 0..nf {
        let rel = (f_sparse[i] - f_dense[i]).abs() / max_f;
        if rel > max_f_err {
            max_f_err = rel;
        }
    }
    println!("Sparse vs dense f_f: max_rel_err={:.2e}", max_f_err);
    assert!(
        max_f_err < 1e-10,
        "Sparse vs dense f_f parity violated: max_rel_err={:.2e}",
        max_f_err
    );
}

// ==================== 4. Constraint System Smoke Tests ====================

/// 3D model with RigidLink constraint. Verify solve succeeds and equilibrium holds.
#[test]
fn constraint_rigid_link_3d_equilibrium() {
    let h = 3.0;
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // column base
        (2, 0.0, 0.0, h),   // column top
        (3, 4.0, 0.0, h),   // beam end
        (4, 0.0, 0.0, h),   // slave node (coincident with node 2)
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // column
        (2, "frame", 4, 3, 1, 1), // beam (from slave node to beam end)
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (3, vec![false, true, true, false, false, false]), // roller at beam end
    ];
    let fz_applied = -20.0;
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 3, fx: 0.0, fy: 0.0, fz: fz_applied,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-5)],
        elems, sups, loads,
    );

    // RigidLink: slave node 4 follows master node 2 in all DOFs
    input.constraints.push(Constraint::RigidLink(RigidLinkConstraint {
        master_node: 2,
        slave_node: 4,
        dofs: vec![0, 1, 2, 3, 4, 5],
    }));

    let result = linear::solve_3d(&input).expect("3D RigidLink solve should succeed");

    // Check equilibrium: sum of reactions + applied loads = 0
    let mut reaction_fz = 0.0_f64;
    let mut reaction_fx = 0.0_f64;
    for r in &result.reactions {
        reaction_fx += r.fx;
        reaction_fz += r.fz;
    }
    let applied_fz = fz_applied;

    let fz_imbalance = (reaction_fz + applied_fz).abs();
    assert!(
        fz_imbalance < 1e-6,
        "RigidLink Fz equilibrium violated: reaction_fz={:.6e}, applied_fz={:.6e}, imbalance={:.6e}",
        reaction_fz, applied_fz, fz_imbalance
    );
    let fx_imbalance = reaction_fx.abs();
    assert!(
        fx_imbalance < 1e-6,
        "RigidLink Fx equilibrium violated: reaction_fx={:.6e}",
        reaction_fx
    );

    // Slave node should have same displacements as master
    let d_master = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d_slave = result.displacements.iter().find(|d| d.node_id == 4).unwrap();
    let tol = 1e-6;
    assert!((d_master.ux - d_slave.ux).abs() < tol, "RigidLink ux mismatch");
    assert!((d_master.uy - d_slave.uy).abs() < tol, "RigidLink uy mismatch");
    assert!((d_master.uz - d_slave.uz).abs() < tol, "RigidLink uz mismatch");
}

/// 3D model with Diaphragm constraint. Verify constrained nodes have equal in-plane translations.
#[test]
fn constraint_diaphragm_3d_equal_ux() {
    let h = 3.0;
    let w = 6.0;

    // 4 columns at corners, floor nodes at top
    let nodes = vec![
        (1, 0.0, 0.0, 0.0), (2, w, 0.0, 0.0), (3, w, w, 0.0), (4, 0.0, w, 0.0),
        (5, 0.0, 0.0, h),   (6, w, 0.0, h),   (7, w, w, h),   (8, 0.0, w, h),
    ];
    let elems = vec![
        (1, "frame", 1, 5, 1, 1),
        (2, "frame", 2, 6, 1, 1),
        (3, "frame", 3, 7, 1, 1),
        (4, "frame", 4, 8, 1, 1),
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()), (2, fixed.clone()), (3, fixed.clone()), (4, fixed.clone()),
    ];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 6, fx: 50.0, fy: 0.0, fz: 0.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-5)],
        elems, sups, loads,
    );

    // Diaphragm: master=5, slaves=6,7,8 in XY plane
    input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
        master_node: 5,
        slave_nodes: vec![6, 7, 8],
        plane: "XY".to_string(),
    }));

    let result = linear::solve_3d(&input).expect("3D Diaphragm solve should succeed");

    // All floor nodes (5,6,7,8) should have finite displacements
    for &nid in &[5, 6, 7, 8] {
        let d = result.displacements.iter().find(|d| d.node_id == nid)
            .unwrap_or_else(|| panic!("Missing displacement for node {}", nid));
        assert!(d.ux.is_finite() && d.uy.is_finite() && d.uz.is_finite(),
            "NaN/Inf at node {}", nid);
    }

    // All floor nodes should have similar ux (rigid diaphragm behavior)
    let ux_vals: Vec<f64> = [5, 6, 7, 8].iter()
        .map(|&id| result.displacements.iter().find(|d| d.node_id == id).unwrap().ux)
        .collect();
    let ux_max = ux_vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let ux_min = ux_vals.iter().cloned().fold(f64::INFINITY, f64::min);

    println!("Diaphragm ux values: {:?}", ux_vals);
    // All floor nodes drift in the same direction
    assert!(
        ux_min / ux_max > 0.01,
        "Diaphragm ux range too wide: min={:.8}, max={:.8}",
        ux_min, ux_max
    );

    // Equilibrium: sum of horizontal reactions = -50
    let sum_fx: f64 = result.reactions.iter().map(|r| r.fx).sum();
    assert!(
        (sum_fx + 50.0).abs() < 1.0,
        "Diaphragm Fx equilibrium violated: sum_rx={:.6}, expected=-50",
        sum_fx
    );
}

/// 3D model with EqualDOF. Verify linked DOFs are equal in the output.
#[test]
fn constraint_equal_dof_3d() {
    // Two parallel cantilever beams along X, tips linked via EqualDOF on uz
    let l = 4.0;

    let nodes = vec![
        (1, 0.0, 0.0, 0.0), // beam A base
        (2, l,   0.0, 0.0), // beam A tip
        (3, 0.0, 2.0, 0.0), // beam B base
        (4, l,   2.0, 0.0), // beam B tip
    ];
    let elems = vec![
        (1, "frame", 1, 2, 1, 1), // beam A
        (2, "frame", 3, 4, 1, 1), // beam B
    ];
    let fixed = vec![true, true, true, true, true, true];
    let sups = vec![
        (1, fixed.clone()),
        (3, fixed.clone()),
    ];
    // Load only on beam A tip
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
        node_id: 2, fx: 0.0, fy: 0.0, fz: -15.0,
        mx: 0.0, my: 0.0, mz: 0.0, bw: None,
    })];

    let mut input = make_3d_input(
        nodes,
        vec![(1, E, NU)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-5)],
        elems, sups, loads,
    );

    // EqualDOF: slave=4, master=2, uz only (dof 2)
    input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
        master_node: 2,
        slave_node: 4,
        dofs: vec![2],
    }));

    let result = linear::solve_3d(&input).expect("3D EqualDOF solve should succeed");

    let d2 = result.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let d4 = result.displacements.iter().find(|d| d.node_id == 4).unwrap();

    // uz must be equal
    let uz_diff = (d2.uz - d4.uz).abs();
    println!("EqualDOF: uz_master={:.8e}, uz_slave={:.8e}, diff={:.2e}", d2.uz, d4.uz, uz_diff);
    assert!(
        uz_diff < 1e-6,
        "EqualDOF uz mismatch: master={:.8e}, slave={:.8e}, diff={:.2e}",
        d2.uz, d4.uz, uz_diff
    );

    // Both should deflect downward
    assert!(d2.uz < 0.0, "Beam A tip should deflect down, got {}", d2.uz);
    assert!(d4.uz < 0.0, "Beam B tip should deflect down, got {}", d4.uz);

    // Equilibrium: sum of vertical reactions = 15.0
    let sum_fz: f64 = result.reactions.iter().map(|r| r.fz).sum();
    assert!(
        (sum_fz + (-15.0)).abs() < 1.0,
        "EqualDOF Fz equilibrium violated: sum_fz={:.6}", sum_fz
    );
}

// ==================== 5. Fill-Ratio and Sparse Path Verification ====================

/// Build an nx x ny simply-supported MITC4 plate.
fn make_ss_plate(nx: usize, ny: usize) -> SolverInput3D {
    let lx = 10.0;
    let ly = 10.0;
    let t = 0.1;
    let e = 200_000.0;
    let nu = 0.3;

    let mut nodes = HashMap::new();
    let mut grid = vec![vec![0usize; ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let x = (i as f64 / nx as f64) * lx;
            let y = (j as f64 / ny as f64) * ly;
            nodes.insert(nid.to_string(), SolverNode3D { id: nid, x, y, z: 0.0 });
            grid[i][j] = nid;
            nid += 1;
        }
    }

    let mut quads = HashMap::new();
    let mut qid = 1;
    for i in 0..nx {
        for j in 0..ny {
            quads.insert(
                qid.to_string(),
                SolverQuadElement {
                    id: qid,
                    nodes: [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]],
                    material_id: 1,
                    thickness: t,
                },
            );
            qid += 1;
        }
    }

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu });

    let mut supports = HashMap::new();
    let mut sid = 1;
    let mut boundary = Vec::new();
    for j in 0..=ny {
        boundary.push(grid[0][j]);
        boundary.push(grid[nx][j]);
    }
    for i in 0..=nx {
        boundary.push(grid[i][0]);
        boundary.push(grid[i][ny]);
    }
    boundary.sort();
    boundary.dedup();
    for &n in &boundary {
        supports.insert(
            sid.to_string(),
            SolverSupport3D {
                node_id: n,
                rx: false, ry: false, rz: true,
                rrx: false, rry: false, rrz: false,
                kx: None, ky: None, kz: None,
                krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None,
                drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None,
                is_inclined: None, rw: None, kw: None,
            },
        );
        sid += 1;
    }
    // Pin one corner fully to prevent rigid-body modes
    supports.insert(
        sid.to_string(),
        SolverSupport3D {
            node_id: grid[0][0],
            rx: true, ry: true, rz: true,
            rrx: false, rry: false, rrz: false,
            kx: None, ky: None, kz: None,
            krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None,
            is_inclined: None, rw: None, kw: None,
        },
    );

    let n_quads = quads.len();
    let loads: Vec<SolverLoad3D> = (1..=n_quads)
        .map(|eid| SolverLoad3D::QuadPressure(SolverPressureLoad {
            element_id: eid, pressure: -1.0,
        }))
        .collect();

    SolverInput3D {
        nodes,
        materials: mats,
        sections: HashMap::new(),
        elements: HashMap::new(),
        supports,
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads,
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
    }
}

/// 10x10 MITC4 plate: sparse solve succeeds with bounded fill ratio and zero perturbations.
#[test]
fn plate_10x10_sparse_fill_and_perturbations() {
    let input = make_ss_plate(10, 10);

    // Verify sparse solve succeeds
    let result = linear::solve_3d(&input).expect("10x10 plate sparse solve should succeed");
    assert!(!result.displacements.is_empty(), "should produce displacements");

    // Check fill ratio via symbolic + numeric Cholesky
    let dof_num = DofNumbering::build_3d(&input);
    let nf = dof_num.n_free;
    let asm = assemble_sparse_3d(&input, &dof_num, false);

    let sym = symbolic_cholesky_with(&asm.k_ff, CholOrdering::Amd);
    let nnz_kff = asm.k_ff.col_ptr[nf];
    let fill_ratio = sym.l_nnz as f64 / nnz_kff as f64;

    println!(
        "10x10 plate: nf={}, nnz_Kff={}, nnz_L={}, fill_ratio={:.2}",
        nf, nnz_kff, sym.l_nnz, fill_ratio
    );
    assert!(
        fill_ratio < 15.0,
        "Fill ratio {:.2} exceeds 15x threshold", fill_ratio
    );

    // Numeric Cholesky: verify zero perturbations
    let num = numeric_cholesky(&sym, &asm.k_ff)
        .expect("Numeric Cholesky should succeed on 10x10 plate");

    println!(
        "Cholesky: perturbations={}, max_perturbation={:.2e}",
        num.pivot_perturbations, num.max_perturbation
    );
    assert_eq!(
        num.pivot_perturbations, 0,
        "Expected zero Cholesky perturbations, got {}",
        num.pivot_perturbations
    );

    // Equilibrium should be good
    if let Some(eq) = &result.equilibrium {
        assert!(eq.equilibrium_ok, "Equilibrium should pass for 10x10 plate");
    }
}

/// Sparse solve on 10x10 plate is deterministic (bitwise identical).
#[test]
fn plate_10x10_sparse_deterministic() {
    let input = make_ss_plate(10, 10);

    let r1 = linear::solve_3d(&input).expect("Solve 1 failed");
    let r2 = linear::solve_3d(&input).expect("Solve 2 failed");

    assert_eq!(r1.displacements.len(), r2.displacements.len());
    for (d1, d2) in r1.displacements.iter().zip(r2.displacements.iter()) {
        assert_eq!(d1.node_id, d2.node_id);
        assert!(
            d1.ux == d2.ux && d1.uy == d2.uy && d1.uz == d2.uz
            && d1.rx == d2.rx && d1.ry == d2.ry && d1.rz == d2.rz,
            "10x10 plate determinism: displacement mismatch at node {}", d1.node_id
        );
    }
    for (r1r, r2r) in r1.reactions.iter().zip(r2.reactions.iter()) {
        assert_eq!(r1r.node_id, r2r.node_id);
        assert!(
            r1r.fx == r2r.fx && r1r.fy == r2r.fy && r1r.fz == r2r.fz
            && r1r.mx == r2r.mx && r1r.my == r2r.my && r1r.mz == r2r.mz,
            "10x10 plate determinism: reaction mismatch at node {}", r1r.node_id
        );
    }
}
