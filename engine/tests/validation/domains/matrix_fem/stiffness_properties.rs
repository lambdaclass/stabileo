/// Validation: Stiffness Matrix Properties & Eigenvalue Convergence
///
/// Tests fundamental FE properties:
///   - Rigid body modes: unrestrained K has correct zero eigenvalue count
///   - Stiffness matrix symmetry for assembled global matrix
///   - Bathe eigenvalue convergence: frequencies converge with mesh refinement
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2006
///   - Przemieniecki, J.S., "Theory of Matrix Structural Analysis", 1968
use dedaliano_engine::solver::{DofNumbering, assemble_2d, assemble_3d};
use dedaliano_engine::linalg::solve_generalized_eigen;
use dedaliano_engine::solver::modal;
use dedaliano_engine::types::*;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;

// ================================================================
// 1. Rigid Body Modes: 2D Frame — 3 Zero Eigenvalues
// ================================================================
//
// An unrestrained 2D frame element has 6 DOFs. The stiffness matrix
// should have exactly 3 zero eigenvalues (translation X, Y, rotation Z).

#[test]
fn validation_rigid_body_2d_frame_3_zero_eigenvalues() {
    // Single frame element, NO supports (mechanism)
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![], // No supports!
        vec![],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);

    let n = dof_num.n_total;
    let k = &assembly.k;

    // Eigenvalue solve: K·x = λ·x via generalized with B = identity
    let eye: Vec<f64> = (0..n * n).map(|idx| if idx / n == idx % n { 1.0 } else { 0.0 }).collect();
    let result = solve_generalized_eigen(k, &eye, n, 200);
    assert!(result.is_some(), "Eigenvalue solve should succeed");

    let eigen = result.unwrap();

    // Count eigenvalues that are effectively zero (< 1e-6 × max eigenvalue)
    let max_eigen = eigen.values.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let threshold = max_eigen * 1e-8;
    let n_zero = eigen.values.iter().filter(|&&v| v.abs() < threshold).count();

    assert_eq!(n_zero, 3,
        "2D frame should have 3 rigid body modes, found {}. Eigenvalues: {:?}",
        n_zero, eigen.values);
}

// ================================================================
// 2. Rigid Body Modes: 2D Truss — 3 Zero Eigenvalues
// ================================================================

#[test]
fn validation_rigid_body_2d_truss_3_zero_eigenvalues() {
    // Triangle truss, NO supports
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 2.0, 3.0)],
        vec![(1, E, 0.3)],
        vec![(1, 0.001, 0.0)],
        vec![
            (1, "truss", 1, 2, 1, 1, false, false),
            (2, "truss", 2, 3, 1, 1, false, false),
            (3, "truss", 1, 3, 1, 1, false, false),
        ],
        vec![], // No supports!
        vec![],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);

    let n = dof_num.n_total;
    let k = &assembly.k;

    let eye: Vec<f64> = (0..n * n).map(|idx| if idx / n == idx % n { 1.0 } else { 0.0 }).collect();
    let result = solve_generalized_eigen(k, &eye, n, 200);
    assert!(result.is_some(), "Eigenvalue solve should succeed");

    let eigen = result.unwrap();
    let max_eigen = eigen.values.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let threshold = max_eigen * 1e-8;
    let n_zero = eigen.values.iter().filter(|&&v| v.abs() < threshold).count();

    assert_eq!(n_zero, 3,
        "2D truss should have 3 rigid body modes, found {}. Eigenvalues: {:?}",
        n_zero, eigen.values);
}

// ================================================================
// 3. Rigid Body Modes: 3D Frame — 6 Zero Eigenvalues
// ================================================================

#[test]
fn validation_rigid_body_3d_frame_6_zero_eigenvalues() {
    // Single 3D frame element, NO supports
    let mut nodes = HashMap::new();
    nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    nodes.insert("2".to_string(), SolverNode3D { id: 2, x: 5.0, y: 0.0, z: 0.0 });

    let mut mats = HashMap::new();
    mats.insert("1".to_string(), SolverMaterial { id: 1, e: E, nu: 0.3 });

    let mut secs = HashMap::new();
    secs.insert("1".to_string(), SolverSection3D {
        id: 1, name: None, a: A, iy: IZ, iz: IZ, j: 5e-5, cw: None,
        as_y: None, as_z: None,
    });

    let mut elems = HashMap::new();
    elems.insert("1".to_string(), SolverElement3D {
        id: 1, elem_type: "frame".to_string(), node_i: 1, node_j: 2,
        material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
        local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });

    let input = SolverInput3D {
        nodes, materials: mats, sections: secs, elements: elems,
        supports: HashMap::new(), // No supports!
        loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_beams: vec![],
            curved_shells: HashMap::new(),
        connectors: HashMap::new(),
    };

    let dof_num = DofNumbering::build_3d(&input);
    let assembly = assemble_3d(&input, &dof_num);

    let n = dof_num.n_total;
    let k = &assembly.k;

    let eye: Vec<f64> = (0..n * n).map(|idx| if idx / n == idx % n { 1.0 } else { 0.0 }).collect();
    let result = solve_generalized_eigen(k, &eye, n, 200);
    assert!(result.is_some(), "Eigenvalue solve should succeed");

    let eigen = result.unwrap();
    let max_eigen = eigen.values.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let threshold = max_eigen * 1e-8;
    let n_zero = eigen.values.iter().filter(|&&v| v.abs() < threshold).count();

    assert_eq!(n_zero, 6,
        "3D frame should have 6 rigid body modes, found {}. Eigenvalues: {:?}",
        n_zero, eigen.values);
}

// ================================================================
// 4. Partial Restraint Reduces Zero Eigenvalues
// ================================================================
//
// Pinning one node of a 2D frame removes translations (2 DOFs), not rotation.
// Should reduce zero eigenvalues from 3 to 1.

#[test]
fn validation_partial_restraint_reduces_modes() {
    // Pinned node 1 (ux, uy fixed) → structure can rotate about pin → 1 rigid body mode.
    // Must check K_ff (free-DOF submatrix), since supports are applied via DOF partitioning.
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, 5.0, 0.0)],
        vec![(1, E, 0.3)],
        vec![(1, A, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned")], // Pin node 1: removes ux, uy
        vec![],
    );

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let k_full = &assembly.k;

    // Extract K_ff submatrix (free DOFs only)
    let mut k_ff = vec![0.0; nf * nf];
    for i in 0..nf {
        for j in 0..nf {
            k_ff[i * nf + j] = k_full[i * n + j];
        }
    }

    let eye: Vec<f64> = (0..nf * nf).map(|idx| if idx / nf == idx % nf { 1.0 } else { 0.0 }).collect();
    let result = solve_generalized_eigen(&k_ff, &eye, nf, 200);
    assert!(result.is_some(), "Eigenvalue solve should succeed");

    let eigen = result.unwrap();
    let max_eigen = eigen.values.iter().cloned().fold(0.0_f64, |a, b| a.max(b.abs()));
    let threshold = max_eigen * 1e-8;
    let n_zero = eigen.values.iter().filter(|&&v| v.abs() < threshold).count();

    // With pinned support (ux, uy removed), K_ff has 1 zero eigenvalue (rotation about pin)
    assert_eq!(n_zero, 1,
        "Pinned single element should have 1 rigid body mode (rotation), found {}. Eigenvalues: {:?}",
        n_zero, eigen.values);
}

// ================================================================
// 5. Stiffness Matrix Symmetry
// ================================================================

#[test]
fn validation_global_stiffness_symmetry_2d() {
    let input = make_portal_frame(3.0, 5.0, E, A, IZ, 0.0, 0.0);

    let dof_num = DofNumbering::build_2d(&input);
    let assembly = assemble_2d(&input, &dof_num);

    let n = dof_num.n_total;
    let k = &assembly.k;

    let mut max_asym = 0.0_f64;
    for i in 0..n {
        for j in (i + 1)..n {
            let diff = (k[i * n + j] - k[j * n + i]).abs();
            let scale = k[i * n + j].abs().max(k[j * n + i].abs()).max(1e-20);
            let rel = diff / scale;
            if rel > max_asym {
                max_asym = rel;
            }
        }
    }

    assert!(max_asym < 1e-10,
        "Global stiffness should be symmetric, max asymmetry={:.6e}", max_asym);
}

// ================================================================
// 6. Bathe Eigenvalue Convergence: Cantilever
// ================================================================
//
// Source: Bathe, "Finite Element Procedures", Ch.10
// As mesh is refined, FE frequencies converge from above to exact values.
// Verify: error with n=20 < error with n=4.

#[test]
fn validation_bathe_cantilever_frequency_convergence() {
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 1e-4;
    let length: f64 = 5.0;
    let density: f64 = 7850.0;

    let beta_1_l: f64 = 1.87510407;
    let ei: f64 = e * 1000.0 * iz; // Engine internal EI convention
    let rho_a: f64 = density * a_sec / 1000.0; // Engine internal mass convention
    let omega_exact = beta_1_l * beta_1_l / (length * length) * (ei / rho_a).sqrt();
    let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

    let mut errors = Vec::new();
    for &n_elem in &[2, 4, 8, 16] {
        let solver = make_beam(n_elem, length, e, a_sec, iz, "fixed", None, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), density);
        let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
        let f_fe = modal_res.modes[0].frequency;
        let error = (f_fe - f_exact).abs() / f_exact;
        errors.push((n_elem, error, f_fe));
    }

    // Verify monotonic convergence: each refinement reduces error
    for i in 1..errors.len() {
        assert!(
            errors[i].1 < errors[i - 1].1 + 1e-10,
            "Bathe convergence: {}elem error={:.4}% should be less than {}elem error={:.4}%",
            errors[i].0, errors[i].1 * 100.0, errors[i - 1].0, errors[i - 1].1 * 100.0
        );
    }

    // Final mesh (16 elements) should be within 0.5% of exact
    let (_, final_error, _) = errors.last().unwrap();
    assert!(
        *final_error < 0.005,
        "16-element cantilever should be within 0.5% of exact, got {:.3}%",
        final_error * 100.0
    );
}

/// Bathe convergence for simply-supported beam.
#[test]
fn validation_bathe_ss_beam_frequency_convergence() {
    let e: f64 = 200_000.0;
    let a_sec: f64 = 0.01;
    let iz: f64 = 1e-4;
    let length: f64 = 5.0;
    let density: f64 = 7850.0;

    // Exact: ω_n = (nπ/L)² √(EI/(ρA))
    let ei: f64 = e * 1000.0 * iz; // Engine internal EI convention
    let rho_a: f64 = density * a_sec / 1000.0; // Engine internal mass convention
    let omega_exact = (std::f64::consts::PI / length).powi(2) * (ei / rho_a).sqrt();
    let f_exact = omega_exact / (2.0 * std::f64::consts::PI);

    let mut last_error = f64::MAX;
    for &n_elem in &[4, 8, 16] {
        let solver = make_beam(n_elem, length, e, a_sec, iz, "pinned", Some("rollerX"), vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), density);
        let modal_res = modal::solve_modal_2d(&solver, &densities, 1).unwrap();
        let f_fe = modal_res.modes[0].frequency;
        let error = (f_fe - f_exact).abs() / f_exact;

        assert!(error < last_error + 1e-10,
            "SS beam convergence: {}elem error={:.4}% not improving", n_elem, error * 100.0);
        last_error = error;
    }

    assert!(last_error < 0.005,
        "16-element SS beam should be within 0.5%, got {:.3}%", last_error * 100.0);
}
