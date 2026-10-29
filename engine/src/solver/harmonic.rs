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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub response_points: Vec<HarmonicResponsePoint>,
    pub peak_frequency: f64,
    pub peak_amplitude: f64,
    /// How the steady state was computed: `"modal"` (superposition of the
    /// kept modes), `"modal+static"` (plus the static correction of the
    /// omitted modes, see `harmonic_modal_from_eigen`) or `"direct"`
    /// (the full complex system solved at every frequency; no truncation).
    #[serde(default)]
    pub method: String,
    /// Modes superposed (0 for `"direct"`).
    #[serde(default)]
    pub modes_used: usize,
    /// Free (independent) DOFs, i.e. the number of modes of the full system.
    #[serde(default)]
    pub n_dof: usize,
    /// Share of the static response at the target DOF carried by the omitted
    /// modes, `|(K⁻¹f)ₜ − Σ_kept φₜφᵀf/(mⱼλⱼ)| / |(K⁻¹f)ₜ|`: what plain modal
    /// superposition would miss at ω → 0 (the static correction restores it).
    /// `None` when not computed (direct solve, singular K, zero static response).
    #[serde(default)]
    pub truncation_ratio: Option<f64>,
    /// Structured notes on approximations (e.g. frequencies where the
    /// static correction could not be applied).
    #[serde(default)]
    pub warnings: Vec<String>,
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
    solve_harmonic_2d_with_damping(input).map(|(r, _)| r)
}

/// `solve_harmonic_2d` plus the Rayleigh coefficients `(a₀, a₁)` it used
/// (`C = a₀M + a₁K`): the damping model the certificate refers to.
pub fn solve_harmonic_2d_with_damping(input: &HarmonicInput) -> Result<(HarmonicResult, (f64, f64)), String> {
    let (mut result, damping) = solve_harmonic_2d_contained(input)?;
    crate::known_issues::attach(&mut result.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Harmonic));
    Ok((result, damping))
}

fn solve_harmonic_2d_contained(input: &HarmonicInput) -> Result<(HarmonicResult, (f64, f64)), String> {
    super::linear::validate_input_2d(&input.solver)?;
    // The forcing is the load vector; a support displacement is not in it.
    super::feature_gates::refuse_2d(&input.solver, "Harmonic analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;
    super::dynamic_validation::validate_mass_2d(&input.solver, &input.densities)?;
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

    let target_dof = get_target_dof_2d(&dof_num, input.response_node_id, &input.response_dof)?;

    // Assemble K, M, F — sparse first for large models (dense K and M are
    // O(n²) memory and assembly time). Constraints reduce as sparse triple
    // products, so the constrained case stays sparse end to end too. K and F
    // are in the inclined-roller frames (the same by either assembler), M
    // is rotated with them, and the response is read in global axes.
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    if nf >= super::linear::SPARSE_THRESHOLD {
        let sasm = super::sparse_assembly::assemble_stiffness_sparse_2d(&input.solver, &dof_num);
        let its = &sasm.inclined_transforms_2d;
        let target = target_functional(&dof_num, input.response_node_id, target_dof, its)?;
        let f_full = crate::solver::assembly::assemble_load_vector_2d(
            &input.solver, &input.solver.loads, &dof_num, its,
        );
        let f_ff: Vec<f64> = f_full[..nf].to_vec();
        let m_csc = assemble_mass_matrix_2d_sparse_inclined(&input.solver, &dof_num, &input.densities, its);
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
        let target_s = reduce_target(&target, cs.as_ref())?;
        if let Some((sweep, damping)) =
            solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, &target_s)
        {
            return Ok((sweep, damping));
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
    let its = &asm.inclined_transforms_2d;
    let target = target_functional(&dof_num, input.response_node_id, target_dof, its)?;
    let mut m_full = assemble_mass_matrix_2d(&input.solver, &dof_num, &input.densities);
    rotate_inclined_dense(&mut m_full, n, its);

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
    let target_s = reduce_target(&target, cs.as_ref())?;

    if let Some((sweep, damping)) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, &target_s)
    {
        return Ok((sweep, damping));
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

        let re = apply_target(&target, &u_real);
        let im = apply_target(&target, &u_imag);
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

    Ok((HarmonicResult {
        structured_diagnostics: vec![],
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: "direct".into(),
        modes_used: 0,
        n_dof: ns,
        truncation_ratio: None,
        warnings: Vec::new(),
    }, (a0, a1)))
}

// ==================== 3D Harmonic Analysis ====================

pub fn solve_harmonic_3d(input: &HarmonicInput3D) -> Result<HarmonicResult, String> {
    solve_harmonic_3d_with_damping(input).map(|(r, _)| r)
}

/// `solve_harmonic_3d` plus the Rayleigh coefficients `(a₀, a₁)` it used
/// (`C = a₀M + a₁K`): the damping model the certificate refers to.
pub fn solve_harmonic_3d_with_damping(input: &HarmonicInput3D) -> Result<(HarmonicResult, (f64, f64)), String> {
    let (mut result, damping) = solve_harmonic_3d_contained(input)?;
    crate::known_issues::attach(&mut result.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Harmonic));
    Ok((result, damping))
}

fn solve_harmonic_3d_contained(input: &HarmonicInput3D) -> Result<(HarmonicResult, (f64, f64)), String> {
    // Curved beams become segments first, as in `solve_3d`: assembled from the
    // unexpanded model they were silently left out.
    let expanded;
    let input = if input.solver.curved_beams.is_empty() {
        input
    } else {
        expanded = HarmonicInput3D { solver: super::linear::expand_curved_beams_3d(&input.solver), ..input.clone() };
        &expanded
    };
    super::linear::validate_input_3d(&input.solver)?;
    super::feature_gates::refuse_3d(&input.solver, "Harmonic analysis", &[super::feature_gates::Feature::PrescribedDisplacements])?;
    // Curved beams are expanded into straight members, as every static path
    // does; left in place they were not part of the model at all.
    let expanded = (!input.solver.curved_beams.is_empty()).then(|| {
        let mut e = input.clone();
        e.solver = super::linear::expand_curved_beams_3d(&input.solver);
        e
    });
    let input = expanded.as_ref().unwrap_or(input);
    super::dynamic_validation::validate_mass_3d(&input.solver, &input.densities)?;
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

    // K and F in the inclined-support frames; M rotated with them, the
    // response read in global axes (see the 2D solver).
    let sasm = assemble_sparse_3d(&input.solver, &dof_num, false);
    let its = &sasm.inclined_transforms;
    // A load on, or a response read from, a DOF only artificial stiffness
    // holds (the rotation of a node only solid shells reach) is meaningless.
    let orphan: std::collections::HashSet<usize> = sasm.artificial_dofs.iter().copied().collect();
    super::linear::refuse_loads_on_orphan_dofs_3d(&dof_num, &orphan, &input.solver.loads)?;
    if orphan.contains(&target_dof) {
        return Err(format!(
            "Harmonic response DOF '{}' of node {} has no stiffness of its own (a rotation only solid shells or trusses reach, or one every member releases); pick a translation",
            input.response_dof, input.response_node_id
        ));
    }
    let target = target_functional(&dof_num, input.response_node_id, target_dof, its)?;
    let f_ff: Vec<f64> = sasm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_3d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Sparse modal path with sparse mass (avoids the dense n² mass matrix).
    // Constraints reduce as sparse triple products, so the constrained case
    // stays sparse end to end too.
    let m_csc = assemble_mass_matrix_3d_sparse_inclined(&input.solver, &dof_num, &input.densities, its);
    let k_red;
    let m_red;
    let (k_sp, m_sp, f_sp): (&CscMatrix, &CscMatrix, Vec<f64>) = if let Some(ref cs) = cs {
        k_red = cs.reduce_matrix_sparse(&sasm.k_ff);
        m_red = cs.reduce_matrix_sparse(&m_csc);
        (&k_red, &m_red, cs.reduce_vector(&f_ff))
    } else {
        (&sasm.k_ff, &m_csc, f_ff.clone())
    };
    let target_s = reduce_target(&target, cs.as_ref())?;
    if let Some((sweep, damping)) =
        solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, &target_s)
    {
        return Ok((sweep, damping));
    }

    // Dense path: only below the dense ceiling — a sparse-modal failure on a
    // large model must not trigger an O(n²) allocation (WASM address space).
    if ns > MAX_DENSE_FALLBACK_DOFS {
        return Err(format!(
            "Harmonic analysis: sparse modal solve failed and the dense fallback would need {ns}×{ns} dense matrices ({} MB each), over the {MAX_DENSE_FALLBACK_DOFS}-DOF ceiling",
            8 * ns * ns / 1_000_000
        ));
    }
    let mut m_full = assemble_mass_matrix_3d(&input.solver, &dof_num, &input.densities);
    rotate_inclined_dense(&mut m_full, n, its);
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
    let k_ff = sasm.k_ff.to_dense_symmetric();

    let (k_s, m_s, f_s) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.reduce_vector(&f_ff))
    } else {
        (k_ff, m_ff, f_ff)
    };

    // Map target_dof to reduced space
    let target_s = reduce_target(&target, cs.as_ref())?;

    // Try dense modal superposition
    if let Some((sweep, damping)) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, &target_s)
    {
        return Ok((sweep, damping));
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

        let re = apply_target(&target, &u_real);
        let im = apply_target(&target, &u_imag);
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

    Ok((HarmonicResult {
        structured_diagnostics: vec![],
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: "direct".into(),
        modes_used: 0,
        n_dof: ns,
        truncation_ratio: None,
        warnings: Vec::new(),
    }, (a0, a1)))
}

// ==================== Modal Frequency Response ====================

/// The sweep's result (with method and truncation diagnostics) and the
/// Rayleigh coefficients `(a₀, a₁)` it used.
type ModalSweep = (HarmonicResult, (f64, f64));

/// Shared post-eigensolve logic: given eigen-decomposition, compute modal
/// frequency response via superposition, plus the static correction of the
/// omitted modes.
///
/// With Rayleigh damping `C = a₀M + a₁K` the exact steady state at the target
/// DOF `t` is `uₜ = Σⱼ pⱼ / (λⱼ d − z)` over all modes, `pⱼ = φⱼₜ φⱼᵀf / mⱼ`,
/// `d = 1 + i a₁ω`, `z = ω² − i a₀ω`. The kept modes are summed exactly. For
/// an omitted mode `|z| < λⱼ|d|`, and `1/(λⱼd − z) = 1/(λⱼd) + z/(λⱼd)² + …`,
/// so the omitted modes add
///
/// `r₁/d + z r₂/d² + O(q²)` (relative to the first term), with `r₁ = (K⁻¹f)ₜ − Σ_kept pⱼ/λⱼ` (the classical static correction /
/// mode-acceleration term, damped by `1/d`) and `r₂ = (K⁻¹MK⁻¹f)ₜ − Σ_kept pⱼ/λⱼ²`
/// (its first dynamic correction), `q = |z|/(λ_omit|d|)`. Both come from two
/// solves with K. The correction is applied at a frequency only when `q < ½`
/// for a lower bound `λ_omit` on the omitted eigenvalues (the series converges
/// geometrically); otherwise that frequency gets plain superposition and a
/// warning. `k_solve` returns `None` for a singular K (rigid-body modes): then
/// no correction is applied.
///
/// `m_times` computes M·x (dense or sparse representation — the caller picks).
/// Returns None if no usable modes are found.
#[allow(clippy::too_many_arguments)]
fn harmonic_modal_from_eigen(
    eigen: &EigenResult,
    m_times: &dyn Fn(&[f64]) -> Vec<f64>,
    k_solve: &dyn Fn(&[f64]) -> Option<Vec<f64>>,
    f: &[f64],
    n: usize,
    frequencies: &[f64],
    damping_ratio: f64,
    target: &[(usize, f64)],
) -> Option<ModalSweep> {
    let f_max = frequencies.iter().cloned().fold(0.0f64, f64::max);
    let omega_max = 2.0 * std::f64::consts::PI * f_max;
    let omega_cutoff_sq = (2.0 * omega_max) * (2.0 * omega_max);

    // Filter to positive eigenvalues (physical modes)
    let nk = eigen.values.len();
    let mut mode_indices: Vec<usize> = Vec::new();
    // Lower bound on the omitted eigenvalues: the smallest filtered-out
    // positive one, and — when the eigensolve returned fewer than all n
    // modes (the lowest ones) — the largest it returned.
    let mut lambda_omit = f64::INFINITY;
    for (j, &lam) in eigen.values.iter().enumerate() {
        if lam > 1e-10 && lam < omega_cutoff_sq * 4.0 {
            mode_indices.push(j);
        } else if lam > 1e-10 {
            lambda_omit = lambda_omit.min(lam);
        }
    }
    if nk < n {
        let top = eigen.values.iter().cloned().fold(0.0f64, f64::max);
        lambda_omit = lambda_omit.min(top);
        // The eigensolve stopped somewhere inside the spectrum, possibly in
        // the middle of a repeated eigenvalue: then which members of that
        // eigenspace were kept exactly and which only through the static
        // correction depended on the arbitrary basis the solver returned, and
        // the response changed when the model was merely rotated or
        // renumbered (found by the metamorphic rotation check). The top
        // cluster of the computed set is therefore left to the correction
        // in full; the correction stays valid because its bound λ_omit is
        // that cluster's eigenvalue.
        let cut = top * (1.0 - 1e-6);
        let before = mode_indices.len();
        mode_indices.retain(|&j| eigen.values[j] < cut);
        if mode_indices.len() < before {
            lambda_omit = lambda_omit.min(cut);
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
        phi_target.push(target.iter().map(|&(i, w)| w * eigen.vectors[i * nk + j]).sum::<f64>());
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

    // Static correction of the omitted modes: r₁, r₂ (see above).
    let residuals = k_solve(f).and_then(|s1| {
        let s2 = k_solve(&m_times(&s1))?;
        let (t1, t2) = (apply_target(target, &s1), apply_target(target, &s2));
        let (mut r1, mut r2) = (t1, t2);
        for i in 0..p {
            let lam = omega_j[i] * omega_j[i];
            r1 -= participation[i] / lam;
            r2 -= participation[i] / (lam * lam);
        }
        let ratio = (t1 != 0.0).then(|| r1.abs() / t1.abs());
        (r1.is_finite() && r2.is_finite()).then_some((r1, r2, ratio))
    });

    // Frequency sweep
    let mut response_points = Vec::with_capacity(frequencies.len());
    let mut peak_freq = 0.0f64;
    let mut peak_amp = 0.0f64;
    let mut uncorrected: Vec<f64> = Vec::new();

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

        if let Some((r1, r2, _)) = residuals {
            // d = 1 + i a₁ω, z = ω² − i a₀ω; add r₁/d + z r₂/d².
            let (dr, di) = (1.0, a1 * omega);
            let (zr, zi) = (omega2, -a0 * omega);
            let d_abs2 = dr * dr + di * di;
            let q = (zr * zr + zi * zi).sqrt() / (lambda_omit * d_abs2.sqrt());
            if q < 0.5 {
                // 1/d
                let (inv_r, inv_i) = (dr / d_abs2, -di / d_abs2);
                // 1/d²
                let (inv2_r, inv2_i) = (inv_r * inv_r - inv_i * inv_i, 2.0 * inv_r * inv_i);
                // z/d²
                let (zd_r, zd_i) = (zr * inv2_r - zi * inv2_i, zr * inv2_i + zi * inv2_r);
                re_sum += r1 * inv_r + r2 * zd_r;
                im_sum += r1 * inv_i + r2 * zd_i;
            } else {
                uncorrected.push(freq);
            }
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

    let mut warnings = Vec::new();
    match residuals {
        None => warnings.push(format!(
            "modal superposition of {p} of {n} modes without static correction (K singular or not positive definite): the omitted modes are not represented"
        )),
        Some(_) if !uncorrected.is_empty() => warnings.push(format!(
            "static correction not applied at {} frequenc{} (up to {:.4} Hz) near or above the omitted modes (lowest omitted ω² ≥ {:.4e}): modal truncation error there is not bounded",
            uncorrected.len(),
            if uncorrected.len() == 1 { "y" } else { "ies" },
            uncorrected.iter().cloned().fold(0.0f64, f64::max),
            lambda_omit
        )),
        Some(_) => {}
    }

    let result = HarmonicResult {
        structured_diagnostics: vec![],
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: if residuals.is_some() { "modal+static" } else { "modal" }.into(),
        modes_used: p,
        n_dof: n,
        truncation_ratio: residuals.and_then(|(_, _, ratio)| ratio),
        warnings,
    };
    Some((result, (a0, a1)))
}

/// Modal superposition harmonic solver (dense eigensolve).
fn solve_harmonic_modal(
    k: &[f64], m: &[f64], f: &[f64], n: usize,
    frequencies: &[f64], damping_ratio: f64,
    target: &[(usize, f64)],
) -> Option<ModalSweep> {
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
    let mut l = k.to_vec();
    let k_spd = cholesky_decompose(&mut l, n);
    let k_solve = |b: &[f64]| -> Option<Vec<f64>> {
        k_spd.then(|| back_solve(&l, &forward_solve(&l, b, n), n))
    };
    harmonic_modal_from_eigen(&eigen, &m_times, &k_solve, f, n, frequencies, damping_ratio, target)
}

/// Modal superposition harmonic solver (sparse eigensolve on CSC K_ff and CSC M_ff).
fn solve_harmonic_modal_sparse(
    k_csc: &CscMatrix, m: &CscMatrix, f: &[f64],
    frequencies: &[f64], damping_ratio: f64,
    target: &[(usize, f64)],
) -> Option<ModalSweep> {
    let n = k_csc.n;
    if frequencies.is_empty() || n == 0 { return None; }

    let n_modes = 100.min(n / 2).max(2);
    let eigen = lanczos_generalized_eigen_sparse(k_csc, m, n_modes, 0.0)?;
    let m_times = |x: &[f64]| m.sym_mat_vec(x);
    let sym = std::rc::Rc::new(symbolic_cholesky(k_csc));
    let factor = numeric_cholesky(&sym, k_csc);
    let k_solve = |b: &[f64]| -> Option<Vec<f64>> {
        factor.as_ref().map(|fac| sparse_cholesky_solve(fac, b))
    };
    harmonic_modal_from_eigen(&eigen, &m_times, &k_solve, f, n, frequencies, damping_ratio, target)
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

/// The response DOF as a linear functional on the free DOFs of K's frames,
/// `Σ w·u[i]`: the global component `target_dof` of the node's displacement.
/// A plain free DOF is one term of weight 1; at an inclined support the
/// global translation is Rᵀ of the support-frame one, a combination of the
/// free tangential DOFs (the normal one is zero). Restrained throughout is an
/// error.
fn target_functional<T: InclinedFrame>(
    dof_num: &DofNumbering, node_id: usize, target_dof: usize, its: &[T],
) -> Result<Vec<(usize, f64)>, String> {
    let (n, nf) = (dof_num.n_total, dof_num.n_free);
    let mut target = Vec::new();
    for local in 0..dof_num.dofs_per_node {
        let Some(&i) = dof_num.map.get(&(node_id, local)) else { continue };
        if i >= nf { continue; }
        let mut e = vec![0.0; nf];
        e[i] = 1.0;
        let w = to_global(&e, n, its)[target_dof];
        if w.abs() > 1e-14 {
            target.push((i, w));
        }
    }
    if target.is_empty() {
        return Err("Target DOF is restrained".into());
    }
    Ok(target)
}

/// `target_functional` in the constraint-reduced space.
fn reduce_target(target: &[(usize, f64)], cs: Option<&FreeConstraintSystem>) -> Result<Vec<(usize, f64)>, String> {
    let Some(cs) = cs else { return Ok(target.to_vec()) };
    target.iter()
        .map(|&(i, w)| cs.map_dof_to_reduced(i).map(|r| (r, w)).ok_or_else(|| "Target DOF is dependent (constrained)".to_string()))
        .collect()
}

fn apply_target(target: &[(usize, f64)], u: &[f64]) -> f64 {
    target.iter().map(|&(i, w)| w * u[i]).sum()
}

fn get_target_dof_2d(dof_num: &DofNumbering, node_id: usize, dof: &str) -> Result<usize, String> {
    let offset = match dof {
        "x" => 0,
        "y" => 1,
        "rz" => 2,
        _ => return Err(format!("Unknown 2D response DOF '{dof}'; expected one of \"x\", \"y\", \"rz\"")),
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
        _ => {
            return Err(format!(
                "Unknown 3D response DOF '{dof}'; expected one of \"x\", \"y\", \"z\", \"rx\", \"ry\", \"rz\", \"w\""
            ))
        }
    };
    dof_num.map.get(&(node_id, offset))
        .copied()
        .ok_or_else(|| format!("Node {} DOF {} not found in DOF map", node_id, dof))
}
