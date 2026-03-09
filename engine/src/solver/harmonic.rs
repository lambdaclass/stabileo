use crate::types::*;
use crate::linalg::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::mass_matrix::*;
use super::damping::*;
use super::constraints::FreeConstraintSystem;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicInput {
    pub solver: SolverInput,
    pub densities: HashMap<String, f64>,
    /// Frequencies to evaluate (Hz)
    pub frequencies: Vec<f64>,
    /// Damping ratio (used for Rayleigh damping). Default: 0.05
    #[serde(default = "default_damping_ratio")]
    pub damping_ratio: f64,
    /// Target node for response
    pub response_node_id: usize,
    /// DOF to extract: "x", "y", "rz"
    #[serde(default = "default_response_dof")]
    pub response_dof: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicInput3D {
    pub solver: SolverInput3D,
    pub densities: HashMap<String, f64>,
    pub frequencies: Vec<f64>,
    #[serde(default = "default_damping_ratio")]
    pub damping_ratio: f64,
    pub response_node_id: usize,
    /// DOF: "x", "y", "z", "rx", "ry", "rz"
    #[serde(default = "default_response_dof_3d")]
    pub response_dof: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicResult {
    pub response_points: Vec<HarmonicResponsePoint>,
    pub peak_frequency: f64,
    pub peak_amplitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicResponsePoint {
    pub frequency: f64,
    pub omega: f64,
    pub amplitude: f64,
    pub phase: f64, // radians
    pub real: f64,
    pub imag: f64,
}

fn default_damping_ratio() -> f64 { 0.05 }
fn default_response_dof() -> String { "y".into() }
fn default_response_dof_3d() -> String { "z".into() }

// ==================== 2D Harmonic Analysis ====================

pub fn solve_harmonic_2d(input: &HarmonicInput) -> Result<HarmonicResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    // Get target DOF index
    let target_dof = get_target_dof_2d(&dof_num, input.response_node_id, &input.response_dof)?;
    if target_dof >= nf {
        return Err("Target DOF is restrained".into());
    }

    // Assemble K, M, F
    let asm = assemble_2d(&input.solver, &dof_num);
    let m_full = assemble_mass_matrix_2d(&input.solver, &dof_num, &input.densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let f_ff: Vec<f64> = asm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let (k_s, m_s, f_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.reduce_vector(&f_ff))
    } else {
        (k_ff, m_ff, f_ff)
    };

    // Map target_dof to reduced space
    let _target_s = if let Some(ref cs) = cs {
        cs.map_dof_to_reduced(target_dof)
            .ok_or("Target DOF is dependent (constrained)")?
    } else {
        target_dof
    };

    // Compute Rayleigh damping from first two natural frequencies (approximate)
    let (a0, a1) = compute_rayleigh_from_stiffness_mass(&k_s, &m_s, ns, input.damping_ratio);
    let c_s = rayleigh_damping_matrix(&m_s, &k_s, ns, a0, a1);

    // Sweep frequencies
    let mut response_points = Vec::new();
    let mut peak_freq: f64 = 0.0;
    let mut peak_amp: f64 = 0.0;

    for &freq in &input.frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let (u_real_s, u_imag_s) = solve_complex_system(&k_s, &m_s, &c_s, &f_s, ns, omega)?;

        // Expand to full free DOFs if constrained
        let (u_real, u_imag) = if let Some(ref cs) = cs {
            (cs.expand_solution(&u_real_s), cs.expand_solution(&u_imag_s))
        } else {
            (u_real_s, u_imag_s)
        };

        let re = u_real[target_dof];
        let im = u_imag[target_dof];
        let amplitude = (re * re + im * im).sqrt();
        let phase = im.atan2(re);

        if amplitude > peak_amp {
            peak_amp = amplitude;
            peak_freq = freq;
        }

        response_points.push(HarmonicResponsePoint {
            frequency: freq,
            omega,
            amplitude,
            phase,
            real: re,
            imag: im,
        });
    }

    Ok(HarmonicResult {
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
    })
}

// ==================== 3D Harmonic Analysis ====================

pub fn solve_harmonic_3d(input: &HarmonicInput3D) -> Result<HarmonicResult, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    let target_dof = get_target_dof_3d(&dof_num, input.response_node_id, &input.response_dof)?;
    if target_dof >= nf {
        return Err("Target DOF is restrained".into());
    }

    let asm = assemble_3d(&input.solver, &dof_num);
    let m_full = assemble_mass_matrix_3d(&input.solver, &dof_num, &input.densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let f_ff: Vec<f64> = asm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let (k_s, m_s, f_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.reduce_vector(&f_ff))
    } else {
        (k_ff, m_ff, f_ff)
    };

    // Map target_dof to reduced space
    let _target_s = if let Some(ref cs) = cs {
        cs.map_dof_to_reduced(target_dof)
            .ok_or("Target DOF is dependent (constrained)")?
    } else {
        target_dof
    };

    let (a0, a1) = compute_rayleigh_from_stiffness_mass(&k_s, &m_s, ns, input.damping_ratio);
    let c_s = rayleigh_damping_matrix(&m_s, &k_s, ns, a0, a1);

    let mut response_points = Vec::new();
    let mut peak_freq: f64 = 0.0;
    let mut peak_amp: f64 = 0.0;

    for &freq in &input.frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let (u_real_s, u_imag_s) = solve_complex_system(&k_s, &m_s, &c_s, &f_s, ns, omega)?;

        // Expand to full free DOFs if constrained
        let (u_real, u_imag) = if let Some(ref cs) = cs {
            (cs.expand_solution(&u_real_s), cs.expand_solution(&u_imag_s))
        } else {
            (u_real_s, u_imag_s)
        };

        let re = u_real[target_dof];
        let im = u_imag[target_dof];
        let amplitude = (re * re + im * im).sqrt();
        let phase = im.atan2(re);

        if amplitude > peak_amp {
            peak_amp = amplitude;
            peak_freq = freq;
        }

        response_points.push(HarmonicResponsePoint {
            frequency: freq,
            omega,
            amplitude,
            phase,
            real: re,
            imag: im,
        });
    }

    Ok(HarmonicResult {
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
    })
}

// ==================== Helpers ====================

/// Solve (K - omega^2*M + i*omega*C) * u = F
/// Convert to real 2n×2n system:
/// [K_d, -omega*C] [u_r]   [F]
/// [omega*C, K_d ] [u_i] = [0]
fn solve_complex_system(
    k: &[f64], m: &[f64], c: &[f64], f: &[f64], n: usize, omega: f64,
) -> Result<(Vec<f64>, Vec<f64>), String> {
    let omega2 = omega * omega;
    let n2 = 2 * n;
    let mut a = vec![0.0; n2 * n2];
    let mut rhs = vec![0.0; n2];

    // K_d = K - omega^2 * M
    // Build block matrix
    for i in 0..n {
        for j in 0..n {
            let kd = k[i * n + j] - omega2 * m[i * n + j];
            let wc = omega * c[i * n + j];

            // Top-left: K_d
            a[i * n2 + j] = kd;
            // Top-right: -omega*C
            a[i * n2 + (n + j)] = -wc;
            // Bottom-left: omega*C
            a[(n + i) * n2 + j] = wc;
            // Bottom-right: K_d
            a[(n + i) * n2 + (n + j)] = kd;
        }
    }

    // RHS: [F, 0]
    for i in 0..n {
        rhs[i] = f[i];
    }

    let result = lu_solve(&mut a, &mut rhs, n2)
        .ok_or_else(|| "Complex system solve failed".to_string())?;

    let u_real = result[..n].to_vec();
    let u_imag = result[n..].to_vec();
    Ok((u_real, u_imag))
}

/// Estimate first two natural frequencies from K and M for Rayleigh damping.
/// Uses the Lanczos eigenvalue solver for accurate natural frequencies.
fn compute_rayleigh_from_stiffness_mass(
    k: &[f64], m: &[f64], n: usize, xi: f64,
) -> (f64, f64) {
    // Use Lanczos to find the first two eigenvalues (omega^2)
    if let Some(result) = lanczos_generalized_eigen(k, m, n, 2, 0.0) {
        // Filter out near-zero eigenvalues (rigid-body modes)
        let positive: Vec<f64> = result.values.iter()
            .copied()
            .filter(|&v| v > 1e-10)
            .collect();

        if positive.len() >= 2 {
            let omega1 = positive[0].sqrt();
            let omega2 = positive[1].sqrt();
            return rayleigh_coefficients(omega1, omega2, xi);
        } else if positive.len() == 1 {
            let omega1 = positive[0].sqrt();
            let omega2 = 3.0 * omega1; // fallback ratio for second mode
            return rayleigh_coefficients(omega1, omega2, xi);
        }
    }

    // Fallback: diagonal ratio estimate
    let mut omega1_sq: f64 = 0.0;
    let mut count: usize = 0;
    for i in 0..n {
        let kii = k[i * n + i];
        let mii = m[i * n + i];
        if mii > 1e-20 && kii > 1e-20 {
            let ratio = kii / mii;
            if count == 0 || ratio < omega1_sq {
                omega1_sq = ratio;
            }
            count += 1;
        }
    }

    if omega1_sq < 1e-20 {
        return (0.0, 0.0);
    }

    let omega1 = omega1_sq.sqrt();
    let omega2 = 3.0 * omega1;
    rayleigh_coefficients(omega1, omega2, xi)
}

fn get_target_dof_2d(dof_num: &DofNumbering, node_id: usize, dof: &str) -> Result<usize, String> {
    let offset = match dof {
        "x" => 0,
        "y" => 1,
        "rz" => 2,
        _ => return Err(format!("Unknown 2D DOF: {}", dof)),
    };
    dof_num.map.get(&(node_id, offset))
        .copied()
        .ok_or_else(|| format!("Node {} DOF {} not found in DOF map", node_id, dof))
}

fn get_target_dof_3d(dof_num: &DofNumbering, node_id: usize, dof: &str) -> Result<usize, String> {
    let offset = match dof {
        "x" => 0,
        "y" => 1,
        "z" => 2,
        "rx" => 3,
        "ry" => 4,
        "rz" => 5,
        "w" => 6,
        _ => return Err(format!("Unknown 3D DOF: {}", dof)),
    };
    dof_num.map.get(&(node_id, offset))
        .copied()
        .ok_or_else(|| format!("Node {} DOF {} not found in DOF map", node_id, dof))
}
