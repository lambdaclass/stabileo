use crate::types::*;
use crate::linalg::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::mass_matrix::*;
use super::damping::*;
use super::constraints::FreeConstraintSystem;
use super::time_integration::MAX_DENSE_FALLBACK_DOFS;

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
    super::linear::validate_input_2d(&input.solver)?;
    let referenced_material_ids = super::dynamic_validation::referenced_material_ids_2d(&input.solver);
    super::dynamic_validation::validate_densities(&input.densities, &referenced_material_ids)?;
    if !input.damping_ratio.is_finite() {
        return Err("damping_ratio must be finite".to_string());
    }
    if input.frequencies.is_empty() {
        return Err("Harmonic analysis requires at least one frequency".to_string());
    }
    if input.frequencies.iter().any(|f| !f.is_finite() || *f < 0.0) {
        return Err("Harmonic frequencies must be finite and >= 0".to_string());
    }
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

    // Assemble K, M, F — sparse first for large models (dense K and M are
    // O(n²) memory and assembly time). Constraints reduce as sparse triple
    // products, so the constrained case stays sparse end to end too.
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    if nf >= super::linear::SPARSE_THRESHOLD {
        let sasm = super::sparse_assembly::assemble_stiffness_sparse_2d(&input.solver, &dof_num);
        let f_full = crate::solver::assembly::assemble_load_vector_2d(
            &input.solver, &input.solver.loads, &dof_num, &sasm.inclined_transforms_2d,
        );
        let f_ff: Vec<f64> = f_full[..nf].to_vec();
        let m_csc = assemble_mass_matrix_2d_sparse(&input.solver, &dof_num, &input.densities);
        // Reduced-space matrices owned here so both branches can borrow them.
        let k_red;
        let m_red;
        let (k_sp, m_sp, f_sp): (&CscMatrix, &CscMatrix, Vec<f64>) = if let Some(ref cs) = cs {
            k_red = cs.reduce_matrix_sparse(&sasm.k_ff);
            m_red = cs.reduce_matrix_sparse(&m_csc);
            (&k_red, &m_red, cs.reduce_vector(&f_ff))
        } else {
            (&sasm.k_ff, &m_csc, f_ff)
        };
        let target_s = if let Some(ref cs) = cs {
            cs.map_dof_to_reduced(target_dof)
                .ok_or("Target DOF is dependent (constrained)")?
        } else {
            target_dof
        };
        if let Some((response_points, peak_frequency, peak_amplitude)) =
            solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, target_s)
        {
            return Ok(HarmonicResult { response_points, peak_frequency, peak_amplitude });
        }
        // Sparse modal found no usable modes (or Lanczos failed). The dense
        // paths below are O(n²) memory — past the dense ceiling, fail loudly
        // instead of allocating (mirrors time_integration's dense cap).
        if ns > MAX_DENSE_FALLBACK_DOFS {
            return Err(format!(
                "Harmonic analysis: sparse modal solve failed and the dense fallback would need {ns}×{ns} dense matrices ({} MB each), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
                8 * ns * ns / 1_000_000
            ));
        }
    }

    let asm = assemble_2d(&input.solver, &dof_num);
    let m_full = assemble_mass_matrix_2d(&input.solver, &dof_num, &input.densities);

    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let f_ff: Vec<f64> = asm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let (k_s, m_s, f_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.reduce_vector(&f_ff))
    } else {
        (k_ff, m_ff, f_ff)
    };

    // Try modal superposition first (much faster for many frequency steps)
    let target_s = if let Some(ref cs) = cs {
        cs.map_dof_to_reduced(target_dof)
            .ok_or("Target DOF is dependent (constrained)")?
    } else {
        target_dof
    };

    if let Some((response_points, peak_frequency, peak_amplitude)) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, target_s)
    {
        return Ok(HarmonicResult { response_points, peak_frequency, peak_amplitude });
    }

    // Fallback: direct 2n×2n block LU per frequency
    let (a0, a1) = compute_rayleigh_from_stiffness_mass(&k_s, &m_s, ns, input.damping_ratio);
    let c_s = rayleigh_damping_matrix(&m_s, &k_s, ns, a0, a1);

    let mut response_points = Vec::new();
    let mut peak_freq: f64 = 0.0;
    let mut peak_amp: f64 = 0.0;

    for &freq in &input.frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let (u_real_s, u_imag_s) = solve_complex_system(&k_s, &m_s, &c_s, &f_s, ns, omega)?;

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
    super::linear::validate_input_3d(&input.solver)?;
    let referenced_material_ids = super::dynamic_validation::referenced_material_ids_3d(&input.solver);
    super::dynamic_validation::validate_densities(&input.densities, &referenced_material_ids)?;
    if !input.damping_ratio.is_finite() {
        return Err("damping_ratio must be finite".to_string());
    }
    if input.frequencies.is_empty() {
        return Err("Harmonic analysis requires at least one frequency".to_string());
    }
    if input.frequencies.iter().any(|f| !f.is_finite() || *f < 0.0) {
        return Err("Harmonic frequencies must be finite and >= 0".to_string());
    }
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

    let sasm = assemble_sparse_3d(&input.solver, &dof_num, false);
    let f_ff: Vec<f64> = sasm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Sparse modal path with sparse mass (avoids the dense n² mass matrix).
    // Constraints reduce as sparse triple products, so the constrained case
    // stays sparse end to end too.
    let m_csc = assemble_mass_matrix_3d_sparse(&input.solver, &dof_num, &input.densities);
    let k_red;
    let m_red;
    let (k_sp, m_sp, f_sp): (&CscMatrix, &CscMatrix, Vec<f64>) = if let Some(ref cs) = cs {
        k_red = cs.reduce_matrix_sparse(&sasm.k_ff);
        m_red = cs.reduce_matrix_sparse(&m_csc);
        (&k_red, &m_red, cs.reduce_vector(&f_ff))
    } else {
        (&sasm.k_ff, &m_csc, f_ff.clone())
    };
    let target_s = if let Some(ref cs) = cs {
        cs.map_dof_to_reduced(target_dof)
            .ok_or("Target DOF is dependent (constrained)")?
    } else {
        target_dof
    };
    if let Some((response_points, peak_frequency, peak_amplitude)) =
        solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, target_s)
    {
        return Ok(HarmonicResult { response_points, peak_frequency, peak_amplitude });
    }

    // Dense path: only below the dense ceiling — a sparse-modal failure on a
    // large model must not trigger an O(n²) allocation (WASM address space).
    if ns > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Harmonic analysis: sparse modal solve failed and the dense fallback would need {ns}×{ns} dense matrices ({} MB each), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * ns * ns / 1_000_000
        ));
    }
    let m_full = assemble_mass_matrix_3d(&input.solver, &dof_num, &input.densities);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let k_ff = sasm.k_ff.to_dense_symmetric();

    let (k_s, m_s, f_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.reduce_vector(&f_ff))
    } else {
        (k_ff, m_ff, f_ff)
    };

    // Map target_dof to reduced space
    let target_s = if let Some(ref cs) = cs {
        cs.map_dof_to_reduced(target_dof)
            .ok_or("Target DOF is dependent (constrained)")?
    } else {
        target_dof
    };

    // Try dense modal superposition
    if let Some((response_points, peak_frequency, peak_amplitude)) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, target_s)
    {
        return Ok(HarmonicResult { response_points, peak_frequency, peak_amplitude });
    }

    // Fallback: direct 2n×2n block LU per frequency
    let (a0, a1) = compute_rayleigh_from_stiffness_mass(&k_s, &m_s, ns, input.damping_ratio);
    let c_s = rayleigh_damping_matrix(&m_s, &k_s, ns, a0, a1);

    let mut response_points = Vec::new();
    let mut peak_freq: f64 = 0.0;
    let mut peak_amp: f64 = 0.0;

    for &freq in &input.frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let (u_real_s, u_imag_s) = solve_complex_system(&k_s, &m_s, &c_s, &f_s, ns, omega)?;

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

// ==================== Modal Frequency Response ====================

/// Shared post-eigensolve logic: given eigen-decomposition, compute modal
/// frequency response via superposition.
///
/// `m_times` computes M·x (dense or sparse representation — the caller picks).
/// Returns None if no usable modes are found.
fn harmonic_modal_from_eigen(
    eigen: &EigenResult,
    m_times: &dyn Fn(&[f64]) -> Vec<f64>,
    f: &[f64],
    n: usize,
    frequencies: &[f64],
    damping_ratio: f64,
    target_dof: usize,
) -> Option<(Vec<HarmonicResponsePoint>, f64, f64)> {
    let f_max = frequencies.iter().cloned().fold(0.0f64, f64::max);
    let omega_max = 2.0 * std::f64::consts::PI * f_max;
    let omega_cutoff_sq = (2.0 * omega_max) * (2.0 * omega_max);

    // Filter to positive eigenvalues (physical modes)
    let nk = eigen.values.len();
    let mut mode_indices: Vec<usize> = Vec::new();
    for j in 0..nk {
        let lam = eigen.values[j];
        if lam > 1e-10 && lam < omega_cutoff_sq * 4.0 {
            mode_indices.push(j);
        }
    }

    if mode_indices.is_empty() {
        return None;
    }

    let p = mode_indices.len();

    // Compute modal quantities for each kept mode
    let mut omega_j = Vec::with_capacity(p);
    let mut modal_mass = Vec::with_capacity(p);
    let mut modal_force = Vec::with_capacity(p);
    let mut phi_target = Vec::with_capacity(p);

    for &j in &mode_indices {
        let lam = eigen.values[j];
        omega_j.push(lam.sqrt());

        let phi_j: Vec<f64> = (0..n).map(|i| eigen.vectors[i * nk + j]).collect();
        let m_phi = m_times(&phi_j);
        let mj: f64 = phi_j.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();
        let fj: f64 = phi_j.iter().zip(f.iter()).map(|(a, b)| a * b).sum();

        modal_mass.push(mj);
        modal_force.push(fj);
        phi_target.push(eigen.vectors[target_dof * nk + j]);
    }

    // Rayleigh damping
    let (a0, a1) = if omega_j.len() >= 2 {
        rayleigh_coefficients(omega_j[0], omega_j[1], damping_ratio)
    } else {
        rayleigh_coefficients(omega_j[0], 3.0 * omega_j[0], damping_ratio)
    };

    let mut participation = Vec::with_capacity(p);
    let mut xi_j = Vec::with_capacity(p);
    for i in 0..p {
        let mj = modal_mass[i];
        if mj.abs() < 1e-30 {
            participation.push(0.0);
        } else {
            participation.push(phi_target[i] * modal_force[i] / mj);
        }
        xi_j.push(a0 / (2.0 * omega_j[i]) + a1 * omega_j[i] / 2.0);
    }

    // Frequency sweep
    let mut response_points = Vec::with_capacity(frequencies.len());
    let mut peak_freq = 0.0f64;
    let mut peak_amp = 0.0f64;

    for &freq in frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let omega2 = omega * omega;

        let mut re_sum = 0.0;
        let mut im_sum = 0.0;
        for i in 0..p {
            let wj2 = omega_j[i] * omega_j[i];
            let real_denom = wj2 - omega2;
            let imag_denom = 2.0 * xi_j[i] * omega_j[i] * omega;
            let denom_sq = real_denom * real_denom + imag_denom * imag_denom;
            if denom_sq < 1e-60 { continue; }
            let pj = participation[i];
            re_sum += pj * real_denom / denom_sq;
            im_sum -= pj * imag_denom / denom_sq;
        }

        let amplitude = (re_sum * re_sum + im_sum * im_sum).sqrt();
        let phase = im_sum.atan2(re_sum);

        if amplitude > peak_amp {
            peak_amp = amplitude;
            peak_freq = freq;
        }

        response_points.push(HarmonicResponsePoint {
            frequency: freq, omega, amplitude, phase,
            real: re_sum, imag: im_sum,
        });
    }

    Some((response_points, peak_freq, peak_amp))
}

/// Modal superposition harmonic solver (dense eigensolve).
fn solve_harmonic_modal(
    k: &[f64], m: &[f64], f: &[f64], n: usize,
    frequencies: &[f64], damping_ratio: f64,
    target_dof: usize,
) -> Option<(Vec<HarmonicResponsePoint>, f64, f64)> {
    if frequencies.is_empty() || n == 0 { return None; }

    let n_modes = 100.min(n / 2).max(2);
    let eigen = lanczos_generalized_eigen(k, m, n, n_modes, 0.0)?;
    let m_times = |x: &[f64]| {
        let mut y = vec![0.0; n];
        for i in 0..n {
            let mut s = 0.0;
            for q in 0..n {
                s += m[i * n + q] * x[q];
            }
            y[i] = s;
        }
        y
    };
    harmonic_modal_from_eigen(&eigen, &m_times, f, n, frequencies, damping_ratio, target_dof)
}

/// Modal superposition harmonic solver (sparse eigensolve on CSC K_ff and CSC M_ff).
fn solve_harmonic_modal_sparse(
    k_csc: &CscMatrix, m: &CscMatrix, f: &[f64],
    frequencies: &[f64], damping_ratio: f64,
    target_dof: usize,
) -> Option<(Vec<HarmonicResponsePoint>, f64, f64)> {
    let n = k_csc.n;
    if frequencies.is_empty() || n == 0 { return None; }

    let n_modes = 100.min(n / 2).max(2);
    let eigen = lanczos_generalized_eigen_sparse(k_csc, m, n_modes, 0.0)?;
    let m_times = |x: &[f64]| m.sym_mat_vec(x);
    harmonic_modal_from_eigen(&eigen, &m_times, f, n, frequencies, damping_ratio, target_dof)
}

// ==================== Helpers ====================

/// Solve (K - omega^2*M + i*omega*C) * u = F
/// Convert to real 2n×2n system:
/// [K_d, -omega*C] [u_r]   [F]
/// [omega*C, K_d ] [u_i] = [0]
pub fn solve_complex_system(
    k: &[f64], m: &[f64], c: &[f64], f: &[f64], n: usize, omega: f64,
) -> Result<(Vec<f64>, Vec<f64>), String> {
    let omega2 = omega * omega;
    let n2 = 2 * n;
    // The 2n×2n dense block system is 4× the memory of a dense n×n — past the
    // dense ceiling this blows the WASM address space, so fail loudly.
    if n2 > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Harmonic direct solve: the dense 2n×2n system would be {n2}×{n2} ({} MB), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * n2 * n2 / 1_000_000
        ));
    }
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
    rhs[..n].copy_from_slice(&f[..n]);

    let result = lu_solve(&mut a, &mut rhs, n2)
        .ok_or_else(|| "Complex system solve failed".to_string())?;

    let u_real = result[..n].to_vec();
    let u_imag = result[n..].to_vec();
    Ok((u_real, u_imag))
}

/// Estimate the first two natural frequencies from K and M for Rayleigh damping.
///
/// Delegates: this logic used to live here in full while `time_integration` carried
/// its own, much cruder, copy. Two modules doing the same job with different
/// accuracy is how the seismic path ended up anchoring its damping 892× high.
fn compute_rayleigh_from_stiffness_mass(
    k: &[f64], m: &[f64], n: usize, xi: f64,
) -> (f64, f64) {
    rayleigh_from_modes(k, m, n, xi)
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
