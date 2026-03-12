use crate::types::*;
use crate::linalg::*;
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::mass_matrix::*;
use super::constraints::FreeConstraintSystem;

/// Modal analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalResult {
    pub modes: Vec<ModeShape>,
    pub n_dof: usize,
    pub total_mass: f64,
    pub cumulative_mass_ratio_x: f64,
    pub cumulative_mass_ratio_y: f64,
    pub rayleigh: Option<RayleighDamping>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeShape {
    pub frequency: f64,
    pub period: f64,
    pub omega: f64,
    pub displacements: Vec<Displacement>,
    pub participation_x: f64,
    pub participation_y: f64,
    pub effective_mass_x: f64,
    pub effective_mass_y: f64,
    pub mass_ratio_x: f64,
    pub mass_ratio_y: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RayleighDamping {
    pub a0: f64,
    pub a1: f64,
    pub omega1: f64,
    pub omega2: f64,
    pub damping_ratios: Vec<f64>,
}

/// Solve 2D modal analysis.
/// Solves K·φ = ω²·M·φ (generalized eigenvalue problem).
pub fn solve_modal_2d(
    input: &SolverInput,
    densities: &HashMap<String, f64>,
    num_modes: usize,
) -> Result<ModalResult, String> {
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    let total_mass = compute_total_mass(input, densities);
    if total_mass < 1e-20 {
        return Err("No mass assigned — set material densities".into());
    }

    // Assemble K and M
    let asm = assemble_2d(input, &dof_num);
    let m_full = assemble_mass_matrix_2d(input, &dof_num, densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let (k_solve, m_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.n_free_indep)
    } else {
        (k_ff.clone(), m_ff.clone(), nf)
    };

    // Solve K·φ = λ·M·φ where λ = ω²
    let result = lanczos_generalized_eigen(&k_solve, &m_solve, ns, num_modes, 0.0)
        .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;

    let num_modes = num_modes.min(ns);

    // Build influence vectors for X and Y directions
    let mut r_x_full = vec![0.0; nf];
    let mut r_y_full = vec![0.0; nf];
    for &node_id in &dof_num.node_order {
        if let Some(&d) = dof_num.map.get(&(node_id, 0)) {
            if d < nf { r_x_full[d] = 1.0; }
        }
        if let Some(&d) = dof_num.map.get(&(node_id, 1)) {
            if d < nf { r_y_full[d] = 1.0; }
        }
    }
    let (r_x_s, r_y_s) = if let Some(ref cs) = cs {
        (cs.reduce_vector(&r_x_full), cs.reduce_vector(&r_y_full))
    } else {
        (r_x_full, r_y_full)
    };

    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        if eigenvalue <= 1e-10 || modes.len() >= num_modes {
            continue;
        }

        let omega = eigenvalue.sqrt();
        let freq = omega / (2.0 * std::f64::consts::PI);
        let period = if freq > 1e-20 { 1.0 / freq } else { f64::INFINITY };

        // Extract eigenvector in solve space (ns-dimensional)
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();

        // Compute φᵀ·M·φ in solve space
        let m_phi = mat_vec_sub(&m_solve, &phi_s, ns);
        let phi_m_phi: f64 = phi_s.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();

        // Participation factors in solve space
        let phi_m_rx: f64 = r_x_s.iter().zip(m_phi.iter())
            .map(|(rx, mp)| rx * mp).sum();

        let phi_m_ry: f64 = r_y_s.iter().zip(m_phi.iter())
            .map(|(ry, mp)| ry * mp).sum();

        let gamma_x = if phi_m_phi.abs() > 1e-30 { phi_m_rx / phi_m_phi } else { 0.0 };
        let gamma_y = if phi_m_phi.abs() > 1e-30 { phi_m_ry / phi_m_phi } else { 0.0 };

        // Effective masses
        let meff_x = gamma_x * gamma_x * phi_m_phi;
        let meff_y = gamma_y * gamma_y * phi_m_phi;
        let mrx = if total_mass > 1e-20 { meff_x / total_mass } else { 0.0 };
        let mry = if total_mass > 1e-20 { meff_y / total_mass } else { 0.0 };
        cum_mrx += mrx;
        cum_mry += mry;

        // Expand eigenvector back to full free DOFs
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s)
        } else {
            phi_s
        };

        // Build mode shape (normalized to max = 1)
        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = phi_f[i];
            max_disp = max_disp.max(phi_f[i].abs());
        }
        if max_disp > 1e-20 {
            for val in u_mode.iter_mut().take(nf) {
                *val /= max_disp;
            }
        }

        let displacements = super::linear::build_displacements_2d(&dof_num, &u_mode);

        modes.push(ModeShape {
            frequency: freq,
            period,
            omega,
            displacements,
            participation_x: gamma_x,
            participation_y: gamma_y,
            effective_mass_x: meff_x,
            effective_mass_y: meff_y,
            mass_ratio_x: mrx,
            mass_ratio_y: mry,
        });
    }

    if modes.is_empty() {
        return Err("No valid modes found".into());
    }

    // Rayleigh damping (5% critical from modes 1 and last)
    let rayleigh = if modes.len() >= 2 {
        let w1 = modes[0].omega;
        let w2 = modes.last().unwrap().omega;
        let xi = 0.05; // 5% critical damping
        let a0 = 2.0 * xi * w1 * w2 / (w1 + w2);
        let a1 = 2.0 * xi / (w1 + w2);
        let damping_ratios: Vec<f64> = modes.iter()
            .map(|m| a0 / (2.0 * m.omega) + a1 * m.omega / 2.0)
            .collect();
        Some(RayleighDamping { a0, a1, omega1: w1, omega2: w2, damping_ratios })
    } else {
        None
    };

    Ok(ModalResult {
        modes,
        n_dof: nf,
        total_mass,
        cumulative_mass_ratio_x: cum_mrx,
        cumulative_mass_ratio_y: cum_mry,
        rayleigh,
    })
}

/// M*v product for a submatrix (nf×nf flat array)
fn mat_vec_sub(m: &[f64], v: &[f64], n: usize) -> Vec<f64> {
    let mut result = vec![0.0; n];
    for i in 0..n {
        for j in 0..n {
            result[i] += m[i * n + j] * v[j];
        }
    }
    result
}

/// 3D modal analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalResult3D {
    pub modes: Vec<ModeShape3D>,
    pub n_dof: usize,
    pub total_mass: f64,
    pub cumulative_mass_ratio_x: f64,
    pub cumulative_mass_ratio_y: f64,
    pub cumulative_mass_ratio_z: f64,
    pub rayleigh: Option<RayleighDamping>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeShape3D {
    pub frequency: f64,
    pub period: f64,
    pub omega: f64,
    pub displacements: Vec<Displacement3D>,
    pub participation_x: f64,
    pub participation_y: f64,
    pub participation_z: f64,
    pub effective_mass_x: f64,
    pub effective_mass_y: f64,
    pub effective_mass_z: f64,
    pub mass_ratio_x: f64,
    pub mass_ratio_y: f64,
    pub mass_ratio_z: f64,
}

/// Solve 3D modal analysis.
pub fn solve_modal_3d(
    input: &SolverInput3D,
    densities: &HashMap<String, f64>,
    num_modes: usize,
) -> Result<ModalResult3D, String> {
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let total_mass = compute_total_mass_3d(input, densities);
    if total_mass < 1e-20 {
        return Err("No mass assigned — set material densities".into());
    }

    let sasm = assemble_sparse_3d(input, &dof_num, false);
    let m_full = assemble_mass_matrix_3d(input, &dof_num, densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let result = if cs.is_none() {
        // Sparse path: skip to_dense_symmetric entirely
        lanczos_generalized_eigen_sparse(&sasm.k_ff, &m_ff, nf, num_modes, 0.0)
            .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?
    } else {
        // Constraint path: needs dense K for reduce_matrix
        let k_ff = sasm.k_ff.to_dense_symmetric();
        let cs = cs.as_ref().unwrap();
        let k_solve = cs.reduce_matrix(&k_ff);
        let m_solve = cs.reduce_matrix(&m_ff);
        let ns = cs.n_free_indep;
        lanczos_generalized_eigen(&k_solve, &m_solve, ns, num_modes, 0.0)
            .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?
    };
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let m_solve = if let Some(ref cs) = cs {
        cs.reduce_matrix(&m_ff)
    } else {
        m_ff
    };

    let num_modes = num_modes.min(ns);

    // Build influence vectors for X, Y, Z translational DOFs
    let mut r_x_full = vec![0.0; nf];
    let mut r_y_full = vec![0.0; nf];
    let mut r_z_full = vec![0.0; nf];
    for &node_id in &dof_num.node_order {
        if let Some(&d) = dof_num.map.get(&(node_id, 0)) { if d < nf { r_x_full[d] = 1.0; } }
        if let Some(&d) = dof_num.map.get(&(node_id, 1)) { if d < nf { r_y_full[d] = 1.0; } }
        if let Some(&d) = dof_num.map.get(&(node_id, 2)) { if d < nf { r_z_full[d] = 1.0; } }
    }
    let (r_x_s, r_y_s, r_z_s) = if let Some(ref cs) = cs {
        (cs.reduce_vector(&r_x_full), cs.reduce_vector(&r_y_full), cs.reduce_vector(&r_z_full))
    } else {
        (r_x_full, r_y_full, r_z_full)
    };

    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;
    let mut cum_mrz = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        if eigenvalue <= 1e-10 || modes.len() >= num_modes { continue; }

        let omega = eigenvalue.sqrt();
        let freq = omega / (2.0 * std::f64::consts::PI);
        let period = if freq > 1e-20 { 1.0 / freq } else { f64::INFINITY };

        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();

        let m_phi = mat_vec_sub(&m_solve, &phi_s, ns);
        let phi_m_phi: f64 = phi_s.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();

        let phi_m_rx: f64 = r_x_s.iter().zip(m_phi.iter()).map(|(r, mp)| r * mp).sum();
        let phi_m_ry: f64 = r_y_s.iter().zip(m_phi.iter()).map(|(r, mp)| r * mp).sum();
        let phi_m_rz: f64 = r_z_s.iter().zip(m_phi.iter()).map(|(r, mp)| r * mp).sum();

        let gamma_x = if phi_m_phi.abs() > 1e-30 { phi_m_rx / phi_m_phi } else { 0.0 };
        let gamma_y = if phi_m_phi.abs() > 1e-30 { phi_m_ry / phi_m_phi } else { 0.0 };
        let gamma_z = if phi_m_phi.abs() > 1e-30 { phi_m_rz / phi_m_phi } else { 0.0 };

        let meff_x = gamma_x * gamma_x * phi_m_phi;
        let meff_y = gamma_y * gamma_y * phi_m_phi;
        let meff_z = gamma_z * gamma_z * phi_m_phi;
        let mrx = if total_mass > 1e-20 { meff_x / total_mass } else { 0.0 };
        let mry = if total_mass > 1e-20 { meff_y / total_mass } else { 0.0 };
        let mrz = if total_mass > 1e-20 { meff_z / total_mass } else { 0.0 };
        cum_mrx += mrx;
        cum_mry += mry;
        cum_mrz += mrz;

        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s)
        } else {
            phi_s
        };

        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = phi_f[i];
            max_disp = max_disp.max(phi_f[i].abs());
        }
        if max_disp > 1e-20 {
            for val in u_mode.iter_mut().take(nf) { *val /= max_disp; }
        }

        let displacements = super::linear::build_displacements_3d(&dof_num, &u_mode);

        modes.push(ModeShape3D {
            frequency: freq, period, omega, displacements,
            participation_x: gamma_x, participation_y: gamma_y, participation_z: gamma_z,
            effective_mass_x: meff_x, effective_mass_y: meff_y, effective_mass_z: meff_z,
            mass_ratio_x: mrx, mass_ratio_y: mry, mass_ratio_z: mrz,
        });
    }

    if modes.is_empty() { return Err("No valid modes found".into()); }

    let rayleigh = if modes.len() >= 2 {
        let w1 = modes[0].omega;
        let w2 = modes.last().unwrap().omega;
        let xi = 0.05;
        let a0 = 2.0 * xi * w1 * w2 / (w1 + w2);
        let a1 = 2.0 * xi / (w1 + w2);
        let damping_ratios: Vec<f64> = modes.iter()
            .map(|m| a0 / (2.0 * m.omega) + a1 * m.omega / 2.0).collect();
        Some(RayleighDamping { a0, a1, omega1: w1, omega2: w2, damping_ratios })
    } else { None };

    Ok(ModalResult3D {
        modes, n_dof: nf, total_mass,
        cumulative_mass_ratio_x: cum_mrx,
        cumulative_mass_ratio_y: cum_mry,
        cumulative_mass_ratio_z: cum_mrz,
        rayleigh,
    })
}
