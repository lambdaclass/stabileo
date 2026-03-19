/// Validation: Modal Analysis Mathematical Properties
///
/// Tests fundamental mathematical properties of eigensolutions:
///   - Modal orthogonality: φᵢᵀ·M·φⱼ = 0 for i≠j
///   - Mass conservation: total mass = Σ(ρ·A·L) / 1000 (engine units)
///   - Rayleigh quotient: FE frequencies ≥ exact (upper bound property)
///   - Effective mass sum: Σ(m_eff) ≤ total mass
///   - Stiffness orthogonality: φᵢᵀ·K·φⱼ = 0 for i≠j
///
/// References:
///   - Bathe, K.J., "Finite Element Procedures", 2014, Ch. 10
///   - Clough & Penzien, "Dynamics of Structures", 3rd Ed, Ch. 12
///   - Hughes, T.J.R., "The Finite Element Method", 2000, Ch. 10
use dedaliano_engine::solver::{assembly, dof, mass_matrix, modal};
use dedaliano_engine::solver::modal::ModeShape;
use crate::common::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const A: f64 = 0.01;
const IZ: f64 = 1e-4;
const DENSITY: f64 = 7850.0;

/// Reconstruct eigenvector in global DOF ordering from ModeShape displacements.
fn mode_to_dof_vec(mode: &ModeShape, dof_num: &dof::DofNumbering) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut phi = vec![0.0; n];
    for d in &mode.displacements {
        if dof_num.dofs_per_node >= 1 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 0) { phi[idx] = d.ux; }
        }
        if dof_num.dofs_per_node >= 2 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 1) { phi[idx] = d.uz; }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(idx) = dof_num.global_dof(d.node_id, 2) { phi[idx] = d.ry; }
        }
    }
    phi
}

/// Matrix-vector product for dense square matrix: y = M * x
fn mat_vec(m: &[f64], x: &[f64], n: usize) -> Vec<f64> {
    let mut y = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            y[i] += m[i * n + j] * x[j];
        }
    }
    y
}

/// Dot product
fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(ai, bi)| ai * bi).sum()
}

// ================================================================
// 1. Modal Orthogonality: φᵢᵀ·M·φⱼ = 0 for i≠j
// ================================================================
//
// Eigenvectors of a generalized eigenvalue problem (K·φ = ω²·M·φ)
// are M-orthogonal. This is a fundamental mathematical property.

#[test]
fn validation_modal_orthogonality_mass_matrix() {
    let length = 5.0;
    let n = 8;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let dof_num = dof::DofNumbering::build_2d(&input);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let m_full = mass_matrix::assemble_mass_matrix_2d(&input, &dof_num, &densities);
    let modal_res = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    let n_total = dof_num.n_total;

    for i in 0..modal_res.modes.len() {
        let phi_i = mode_to_dof_vec(&modal_res.modes[i], &dof_num);
        let m_phi_i = mat_vec(&m_full, &phi_i, n_total);

        for j in (i + 1)..modal_res.modes.len() {
            let phi_j = mode_to_dof_vec(&modal_res.modes[j], &dof_num);

            let m_phi_j = mat_vec(&m_full, &phi_j, n_total);
            let cross_val = dot(&phi_i, &m_phi_j);

            // Normalize by diagonal terms for relative check
            let diag_i = dot(&phi_i, &m_phi_i);
            let diag_j = dot(&phi_j, &m_phi_j);
            let scale = (diag_i.abs() * diag_j.abs()).sqrt().max(1e-20);

            assert!(
                cross_val.abs() / scale < 0.05,
                "Modes {} and {}: φᵢᵀ·M·φⱼ / √(mᵢᵢ·mⱼⱼ) = {:.6e}, should be ≈ 0",
                i + 1, j + 1, cross_val.abs() / scale
            );
        }
    }
}

// ================================================================
// 2. Modal Orthogonality: φᵢᵀ·K·φⱼ = 0 for i≠j
// ================================================================
//
// Eigenvectors are also K-orthogonal.

#[test]
fn validation_modal_orthogonality_stiffness_matrix() {
    let length = 5.0;
    let n = 8;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let dof_num = dof::DofNumbering::build_2d(&input);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let asm = assembly::assemble_2d(&input, &dof_num);
    let modal_res = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    let n_total = dof_num.n_total;

    for i in 0..modal_res.modes.len() {
        let phi_i = mode_to_dof_vec(&modal_res.modes[i], &dof_num);

        for j in (i + 1)..modal_res.modes.len() {
            let phi_j = mode_to_dof_vec(&modal_res.modes[j], &dof_num);

            let k_phi_j = mat_vec(&asm.k, &phi_j, n_total);
            let cross_val = dot(&phi_i, &k_phi_j);

            // Normalize by diagonal terms
            let k_phi_i = mat_vec(&asm.k, &phi_i, n_total);
            let diag_i = dot(&phi_i, &k_phi_i);
            let diag_j = dot(&phi_j, &k_phi_j);
            let scale = (diag_i.abs() * diag_j.abs()).sqrt().max(1e-20);

            assert!(
                cross_val.abs() / scale < 0.05,
                "Modes {} and {}: φᵢᵀ·K·φⱼ / √(kᵢᵢ·kⱼⱼ) = {:.6e}, should be ≈ 0",
                i + 1, j + 1, cross_val.abs() / scale
            );
        }
    }
}

// ================================================================
// 3. Mass Conservation: total_mass = Σ(ρ·A·L) / 1000
// ================================================================
//
// The total mass from the mass matrix should equal the physical mass
// computed from material density, cross-section area, and element lengths.
// Engine convention: ρA = density * A / 1000.

#[test]
fn validation_mass_conservation() {
    let length = 6.0;
    let n = 10;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 2).unwrap();

    // Physical mass: ρ·A·L / 1000 (engine unit convention)
    let physical_mass = DENSITY * A * length / 1000.0;

    assert_close(
        modal_res.total_mass, physical_mass, 0.01,
        "Mass conservation: modal total_mass vs ρAL/1000",
    );
}

// ================================================================
// 4. Mass Conservation: Portal Frame
// ================================================================

#[test]
fn validation_mass_conservation_portal_frame() {
    let h = 4.0;
    let w = 6.0;

    let input = make_portal_frame(h, w, E, A, IZ, 0.0, 0.0);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 3).unwrap();

    // 3 elements: 2 columns (length h) + 1 beam (length w)
    let total_length = 2.0 * h + w;
    let physical_mass = DENSITY * A * total_length / 1000.0;

    assert_close(
        modal_res.total_mass, physical_mass, 0.01,
        "Portal frame: mass conservation",
    );
}

// ================================================================
// 5. Rayleigh Quotient Upper Bound: FE ω ≥ exact ω
// ================================================================
//
// The Ritz method (FEM) provides upper bounds on eigenvalues.
// For a cantilever beam: ω₁_exact = (1.875)² × √(EI/(ρAL⁴))
// FE frequency should be ≥ this exact value.

#[test]
fn validation_rayleigh_upper_bound_cantilever() {
    let length: f64 = 5.0;
    let e_eff = E * 1000.0;
    let ei = e_eff * IZ;
    let rho_a = DENSITY * A / 1000.0; // engine convention

    // Exact first frequency for cantilever beam
    let beta_1 = 1.8751; // first root of cos(βL)·cosh(βL) + 1 = 0
    let omega_exact = beta_1 * beta_1 * (ei / (rho_a * length.powi(4))).sqrt();

    // Test with increasing mesh refinement — all should be upper bounds
    for &n in &[4, 8, 16] {
        let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), DENSITY);

        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        let omega_fe = modal_res.modes[0].omega;

        // Upper bound: ω_FE ≥ ω_exact (with small tolerance for numerics)
        assert!(
            omega_fe >= omega_exact * 0.99,
            "n={}: ω_FE={:.4} should be ≥ ω_exact={:.4} (Rayleigh upper bound)",
            n, omega_fe, omega_exact
        );
    }
}

// ================================================================
// 6. Rayleigh Upper Bound: Monotonic Convergence from Above
// ================================================================
//
// As mesh is refined, FE eigenvalues decrease monotonically toward
// the exact value (convergence from above).

#[test]
fn validation_rayleigh_monotonic_convergence() {
    let length = 5.0;

    let mesh_sizes = [4, 8, 16];
    let mut omegas = Vec::new();

    for &n in &mesh_sizes {
        let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), DENSITY);

        let modal_res = modal::solve_modal_2d(&input, &densities, 1).unwrap();
        omegas.push(modal_res.modes[0].omega);
    }

    // Each refinement should give a lower (or equal) frequency
    for i in 1..omegas.len() {
        assert!(
            omegas[i] <= omegas[i - 1] * 1.01, // small tolerance for numerics
            "Monotonic convergence: ω(n={})={:.6} should be ≤ ω(n={})={:.6}",
            mesh_sizes[i], omegas[i], mesh_sizes[i - 1], omegas[i - 1]
        );
    }
}

// ================================================================
// 7. Effective Mass Sum ≤ Total Mass
// ================================================================
//
// The sum of effective modal masses across all modes cannot exceed
// the total structural mass.

#[test]
fn validation_effective_mass_sum_bounded() {
    let length = 5.0;
    let n = 8;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let modal_res = modal::solve_modal_2d(&input, &densities, 6).unwrap();

    let sum_eff_x: f64 = modal_res.modes.iter().map(|m| m.effective_mass_x).sum();
    let sum_eff_y: f64 = modal_res.modes.iter().map(|m| m.effective_mass_y).sum();

    assert!(
        sum_eff_x <= modal_res.total_mass * 1.01,
        "Σ(m_eff_x)={:.6} should be ≤ total_mass={:.6}",
        sum_eff_x, modal_res.total_mass
    );
    assert!(
        sum_eff_y <= modal_res.total_mass * 1.01,
        "Σ(m_eff_y)={:.6} should be ≤ total_mass={:.6}",
        sum_eff_y, modal_res.total_mass
    );
}

// ================================================================
// 8. Rayleigh Quotient: ω² = φᵀKφ / φᵀMφ
// ================================================================
//
// For each mode, the Rayleigh quotient should equal the eigenvalue.

#[test]
fn validation_rayleigh_quotient_consistency() {
    let length = 5.0;
    let n = 8;

    let input = make_beam(n, length, E, A, IZ, "fixed", None, vec![]);
    let dof_num = dof::DofNumbering::build_2d(&input);
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), DENSITY);

    let asm = assembly::assemble_2d(&input, &dof_num);
    let m_full = mass_matrix::assemble_mass_matrix_2d(&input, &dof_num, &densities);
    let modal_res = modal::solve_modal_2d(&input, &densities, 4).unwrap();

    let n_total = dof_num.n_total;

    for (i, mode) in modal_res.modes.iter().enumerate() {
        let phi = mode_to_dof_vec(mode, &dof_num);

        let k_phi = mat_vec(&asm.k, &phi, n_total);
        let m_phi = mat_vec(&m_full, &phi, n_total);

        let phi_k_phi = dot(&phi, &k_phi);
        let phi_m_phi = dot(&phi, &m_phi);

        if phi_m_phi.abs() > 1e-20 {
            let omega_sq_rayleigh = phi_k_phi / phi_m_phi;
            let omega_sq_modal = mode.omega * mode.omega;

            let rel_err = (omega_sq_rayleigh - omega_sq_modal).abs()
                / omega_sq_modal.abs().max(1e-20);

            assert!(
                rel_err < 0.10,
                "Mode {}: ω² from Rayleigh={:.4}, from modal={:.4}, rel_err={:.2}%",
                i + 1, omega_sq_rayleigh, omega_sq_modal, rel_err * 100.0
            );
        }
    }
}
