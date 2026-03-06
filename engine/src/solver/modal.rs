use crate::types::*;
use crate::linalg::*;
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::mass_matrix::*;

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

    // Solve K·φ = λ·M·φ where λ = ω²
    let result = lanczos_generalized_eigen(&k_ff, &m_ff, nf, num_modes, 0.0)
        .ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;

    let num_modes = num_modes.min(nf);

    // Build influence vectors for X and Y directions
    // r_x[i] = 1 for X translational DOFs, 0 otherwise
    // r_y[i] = 1 for Y translational DOFs, 0 otherwise
    let mut r_x = vec![0.0; nf];
    let mut r_y = vec![0.0; nf];
    for &node_id in &dof_num.node_order {
        if let Some(&d) = dof_num.map.get(&(node_id, 0)) {
            if d < nf { r_x[d] = 1.0; }
        }
        if let Some(&d) = dof_num.map.get(&(node_id, 1)) {
            if d < nf { r_y[d] = 1.0; }
        }
    }

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

        // Extract eigenvector (column idx from n×k matrix)
        let phi: Vec<f64> = (0..nf).map(|i| result.vectors[i * n_converged + idx]).collect();

        // Compute φᵀ·M·φ
        let m_phi = mat_vec_sub(&m_ff, &phi, nf);
        let phi_m_phi: f64 = phi.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();

        // Participation factors: Γ = φᵀ·M·r / (φᵀ·M·φ)
        let phi_m_rx: f64 = phi.iter().zip(r_x.iter()).zip(m_phi.iter())
            .map(|((_, rx), mp)| {
                // Actually need φᵀ·M·r, but we have M·φ, so use r·(M·φ) ≠ φ·(M·r)
                // Since M is symmetric: φᵀ·M·r = rᵀ·M·φ = Σ r_i * (M·φ)_i
                rx * mp
            }).sum::<f64>();

        let phi_m_ry: f64 = r_y.iter().zip(m_phi.iter())
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

        // Build mode shape (normalized to max = 1)
        let mut u_mode = vec![0.0; n];
        let mut max_disp = 0.0f64;
        for i in 0..nf {
            u_mode[i] = phi[i];
            max_disp = max_disp.max(phi[i].abs());
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
