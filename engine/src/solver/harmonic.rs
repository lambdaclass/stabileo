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

/// How the steady state was computed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HarmonicMethod {
    /// The full complex system solved at every frequency; no truncation.
    #[serde(rename = "direct")]
    Direct,
    /// Superposition of the kept modes.
    #[serde(rename = "modal")]
    Modal,
    /// Superposition plus the static correction of the omitted modes, see `harmonic_modal_from_eigen`.
    #[serde(rename = "modal+static")]
    ModalStatic,
}

impl HarmonicMethod {
    pub fn superposes_modes(self) -> bool {
        match self {
            HarmonicMethod::Direct => false,
            HarmonicMethod::Modal | HarmonicMethod::ModalStatic => true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicResult {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    pub response_points: Vec<HarmonicResponsePoint>,
    pub peak_frequency: f64,
    pub peak_amplitude: f64,
    pub method: HarmonicMethod,
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
    /// Largest relative residual `‖(K + iωC − ω²M)u − f‖ / ‖f‖` (K⁻¹ norm) of
    /// the modal response over the sweep, before any frequency was re-solved
    /// directly; `f64::MAX` when one was not finite. `None` for a direct solve.
    #[serde(default)]
    pub max_modal_residual: Option<f64>,
    /// Frequencies (Hz) whose modal residual exceeded `MODAL_RESIDUAL_TOL`
    /// and were solved directly instead.
    #[serde(default)]
    pub direct_frequencies: Vec<f64>,
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
        let assembled_conditioning = crate::known_issues::sparse_conditioning(&sasm.k_ff);
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
        if let Some(mut sweep) =
            solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, &target_s)
        {
            crate::known_issues::attach(&mut sweep.result.structured_diagnostics, assembled_conditioning.into_iter().collect());
            return resolve_unbounded_frequencies(sweep, || (k_sp.to_dense_symmetric(), m_sp.to_dense_symmetric()), &f_sp, ns, &target_s);
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
    let assembled_conditioning = crate::known_issues::dense_conditioning(&k_ff, nf);
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

    if let Some(mut sweep) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, &target_s)
    {
        crate::known_issues::attach(&mut sweep.result.structured_diagnostics, assembled_conditioning.into_iter().collect());
        return resolve_unbounded_frequencies(sweep, || (k_s.clone(), m_s.clone()), &f_s, ns, &target_s);
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
        structured_diagnostics: crate::known_issues::dense_stiffness_conditioning(&k_s, ns).or(assembled_conditioning).into_iter().collect(),
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: HarmonicMethod::Direct,
        modes_used: 0,
        n_dof: ns,
        truncation_ratio: None,
        max_modal_residual: None,
        direct_frequencies: Vec::new(),
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
    let known_model = crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Harmonic);
    crate::known_issues::refuse(&known_model)?;
    crate::known_issues::refuse_distorted(&known_model)?;
    let (mut result, damping) = solve_harmonic_3d_contained(input)?;
    crate::known_issues::attach(&mut result.structured_diagnostics, known_model);
    if result.method.superposes_modes() {
        crate::known_issues::attach(&mut result.structured_diagnostics, vec![crate::known_issues::diagnostic("MD-ORTHOGONALITY")]);
    }
    crate::known_issues::refuse(&result.structured_diagnostics)?;
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
    super::linear::validate_input_3d_for_analysis(&input.solver, crate::known_issues::Analysis::Harmonic)?;
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
    let assembled_conditioning = crate::known_issues::sparse_conditioning(&sasm.k_ff);
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
    if let Some(mut sweep) =
        solve_harmonic_modal_sparse(k_sp, m_sp, &f_sp, &input.frequencies, input.damping_ratio, &target_s)
    {
        crate::known_issues::attach(&mut sweep.result.structured_diagnostics, assembled_conditioning.into_iter().collect());
        return resolve_unbounded_frequencies(sweep, || (k_sp.to_dense_symmetric(), m_sp.to_dense_symmetric()), &f_sp, ns, &target_s);
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
    if let Some(mut sweep) =
        solve_harmonic_modal(&k_s, &m_s, &f_s, ns, &input.frequencies, input.damping_ratio, &target_s)
    {
        crate::known_issues::attach(&mut sweep.result.structured_diagnostics, assembled_conditioning.into_iter().collect());
        return resolve_unbounded_frequencies(sweep, || (k_s.clone(), m_s.clone()), &f_s, ns, &target_s);
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
        structured_diagnostics: crate::known_issues::dense_stiffness_conditioning(&k_s, ns).or(assembled_conditioning).into_iter().collect(),
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: HarmonicMethod::Direct,
        modes_used: 0,
        n_dof: ns,
        truncation_ratio: None,
        max_modal_residual: None,
        direct_frequencies: Vec::new(),
        warnings: Vec::new(),
    }, (a0, a1)))
}

// ==================== Modal Frequency Response ====================

/// The sweep's result (with method and truncation diagnostics), the
/// Rayleigh coefficients `(a₀, a₁)` it used, and at every frequency the
/// relative residual `‖(K + iωC − ω²M)u − f‖ / ‖f‖` of the full response
/// vector the reported value was read from, in the K⁻¹ (energy) norm, or the
/// Euclidean norm when K cannot be factored.
struct ModalSweep {
    result: HarmonicResult,
    damping: (f64, f64),
    residuals: Vec<f64>,
    uncorrected: Vec<f64>,
    truncation: Vec<f64>,
}

/// Above this relative residual a modal response is refused, never reported.
pub const MODAL_RESIDUAL_TOL: f64 = 1e-2;

/// Largest `q = |z|/(λ_omit|d|)` at which the modal response is kept. Decided per model and
/// frequency, never per load: a per-load choice breaks superposition and reciprocity.
pub const MODAL_TRUNCATION_Q: f64 = 1.0 / 16.0;

pub const DIRECT_HARMONIC_DOFS: usize = 64;

const UNCORRECTED_WARNING: &str = "static correction not applied at";

/// Shared post-eigensolve logic: given eigen-decomposition, compute modal
/// frequency response via superposition, plus the static correction of the
/// omitted modes.
///
/// With Rayleigh damping `C = a₀M + a₁K` the exact steady state is
/// `u = Σⱼ φⱼ cⱼ / (λⱼ d − z)` over all modes, `cⱼ = φⱼᵀf / mⱼ`,
/// `d = 1 + i a₁ω`, `z = ω² − i a₀ω`. The kept modes are summed exactly. For
/// an omitted mode `|z| < λⱼ|d|`, and `1/(λⱼd − z) = 1/(λⱼd) + z/(λⱼd)² + …`,
/// so the omitted modes add `s₁/d + z s₂/d² + O(q²)` (relative to the first
/// term), `s₁ = P K⁻¹ Pᵀf`, `s₂ = P K⁻¹ Pᵀ M s₁`, `P = I − Σ_kept φⱼφⱼᵀM/mⱼ`
/// the projection onto the omitted modes, `q = |z|/(λ_omit|d|)`. The
/// correction is applied at a frequency only when `q < ½` for a lower bound
/// `λ_omit` on the omitted eigenvalues (the series converges geometrically);
/// otherwise that frequency gets plain superposition and a warning. `k_solve`
/// returns `None` for a singular K (rigid-body modes): then no correction is
/// applied.
///
/// `m_times` / `k_times` compute M·x / K·x (dense or sparse representation —
/// the caller picks). Returns None if no usable modes are found.
#[allow(clippy::too_many_arguments)]
fn harmonic_modal_from_eigen(
    eigen: &EigenResult,
    m_times: &dyn Fn(&[f64]) -> Vec<f64>,
    k_times: &dyn Fn(&[f64]) -> Vec<f64>,
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

    let mut lambdas = Vec::with_capacity(p);
    let mut phis = Vec::with_capacity(p);
    let mut m_phis = Vec::with_capacity(p);
    let mut modal_mass = Vec::with_capacity(p);
    let mut coef = Vec::with_capacity(p);

    for &j in &mode_indices {
        let phi_j: Vec<f64> = (0..n).map(|i| eigen.vectors[i * nk + j]).collect();
        let m_phi = m_times(&phi_j);
        let mj: f64 = dot(&phi_j, &m_phi);
        let fj: f64 = dot(&phi_j, f);
        lambdas.push(eigen.values[j]);
        coef.push(if mj.abs() < 1e-30 { 0.0 } else { fj / mj });
        modal_mass.push(mj);
        phis.push(phi_j);
        m_phis.push(m_phi);
    }

    // Anchor damping on the physical spectrum, before frequency filtering or
    // removal of the possibly incomplete boundary cluster. Otherwise a sweep
    // retaining one mode anchors at (ω₁, 3ω₁), while the direct fallback uses
    // (ω₁, ω₂): changing solver paths (even just by rotating a shell with
    // massless drilling DOFs) would change the physical damping matrix.
    let anchors: Vec<f64> = eigen.values.iter().copied()
        .filter(|&lam| lam > 1e-10).take(2).map(f64::sqrt).collect();
    let (a0, a1) = if anchors.len() >= 2 {
        rayleigh_coefficients(anchors[0], anchors[1], damping_ratio)
    } else {
        rayleigh_coefficients(anchors[0], 3.0 * anchors[0], damping_ratio)
    };

    let kept = |i: usize| modal_mass[i].abs() >= 1e-30;
    let deflate_load = |v: &[f64]| -> Vec<f64> {
        let mut w = v.to_vec();
        for i in (0..p).filter(|&i| kept(i)) {
            let c = dot(&phis[i], &w) / modal_mass[i];
            for (wk, mk) in w.iter_mut().zip(&m_phis[i]) { *wk -= c * mk; }
        }
        w
    };
    let deflate = |w: &mut [f64]| {
        for i in (0..p).filter(|&i| kept(i)) {
            let c = dot(&m_phis[i], w) / modal_mass[i];
            for (wk, pk) in w.iter_mut().zip(&phis[i]) { *wk -= c * pk; }
        }
    };
    // Subtracting the kept modes' share from K⁻¹f instead loses every digit
    // of the omitted part when a kept mode is much softer than the rest.
    let statics = k_solve(&deflate_load(f)).and_then(|mut s1| {
        deflate(&mut s1);
        let mut s2 = k_solve(&deflate_load(&m_times(&s1)))?;
        deflate(&mut s2);
        (s1.iter().chain(&s2).all(|x| x.is_finite())).then_some((s1, s2))
    });
    let ratio = statics.as_ref().and_then(|(s1, _)| {
        let r1 = apply_target(target, s1);
        let kept_static: f64 = (0..p).map(|i| apply_target(target, &phis[i]) * coef[i] / lambdas[i]).sum();
        let t1 = r1 + kept_static;
        (t1 != 0.0).then(|| r1.abs() / t1.abs())
    });

    let f_scale = max_abs(f);
    let f_unit: Vec<f64> = if f_scale > 0.0 { f.iter().map(|x| x / f_scale).collect() } else { f.to_vec() };
    let f_norm = dot(&f_unit, &f_unit).sqrt();
    let f_energy = k_solve(&f_unit).map(|x| dot(&x, &f_unit).max(0.0).sqrt());
    let mut response_points = Vec::with_capacity(frequencies.len());
    let mut residuals = Vec::with_capacity(frequencies.len());
    let mut peak_freq = 0.0f64;
    let mut peak_amp = 0.0f64;
    let mut uncorrected: Vec<f64> = Vec::new();
    let mut truncation = Vec::with_capacity(frequencies.len());

    for &freq in frequencies {
        let omega = 2.0 * std::f64::consts::PI * freq;
        let omega2 = omega * omega;

        let mut u_re = vec![0.0; n];
        let mut u_im = vec![0.0; n];
        for i in 0..p {
            let real_denom = lambdas[i] - omega2;
            let imag_denom = omega * (a0 + a1 * lambdas[i]);
            let denom_sq = real_denom * real_denom + imag_denom * imag_denom;
            if denom_sq < 1e-60 { continue; }
            let (cr, ci) = (coef[i] * real_denom / denom_sq, -coef[i] * imag_denom / denom_sq);
            for (k, &x) in phis[i].iter().enumerate() {
                u_re[k] += cr * x;
                u_im[k] += ci * x;
            }
        }

        let (dr, di) = (1.0, a1 * omega);
        let (zr, zi) = (omega2, -a0 * omega);
        let d_abs2 = dr * dr + di * di;
        let q = (zr * zr + zi * zi).sqrt() / (lambda_omit * d_abs2.sqrt());
        truncation.push(if statics.is_some() || p == n { q } else { f64::INFINITY });
        if let Some((s1, s2)) = &statics {
            if q < 0.5 {
                let (inv_r, inv_i) = (dr / d_abs2, -di / d_abs2);
                let (inv2_r, inv2_i) = (inv_r * inv_r - inv_i * inv_i, 2.0 * inv_r * inv_i);
                let (zd_r, zd_i) = (zr * inv2_r - zi * inv2_i, zr * inv2_i + zi * inv2_r);
                for k in 0..n {
                    u_re[k] += s1[k] * inv_r + s2[k] * zd_r;
                    u_im[k] += s1[k] * inv_i + s2[k] * zd_i;
                }
            } else {
                uncorrected.push(freq);
            }
        }

        let (kr, ki, mr, mi) = (k_times(&u_re), k_times(&u_im), m_times(&u_re), m_times(&u_im));
        let res_re: Vec<f64> = (0..n).map(|k| kr[k] - a1 * omega * ki[k] - omega2 * mr[k] - a0 * omega * mi[k] - f[k]).collect();
        let res_im: Vec<f64> = (0..n).map(|k| ki[k] + a1 * omega * kr[k] - omega2 * mi[k] + a0 * omega * mr[k]).collect();
        residuals.push(relative_residual(&res_re, &res_im, f_scale, f_norm, f_energy, k_solve));

        let re_sum = apply_target(target, &u_re);
        let im_sum = apply_target(target, &u_im);
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
    match statics {
        None => warnings.push(format!(
            "modal superposition of {p} of {n} modes without static correction (K singular or not positive definite): the omitted modes are not represented"
        )),
        Some(_) if !uncorrected.is_empty() => warnings.push(format!(
            "{UNCORRECTED_WARNING} {} frequenc{} (up to {:.4} Hz) near or above the omitted modes (lowest omitted ω² ≥ {:.4e}): modal truncation error there is not bounded",
            uncorrected.len(),
            if uncorrected.len() == 1 { "y" } else { "ies" },
            uncorrected.iter().cloned().fold(0.0f64, f64::max),
            lambda_omit
        )),
        Some(_) => {}
    }

    let unbounded = p < n && (statics.is_none() || !uncorrected.is_empty());
    let result = HarmonicResult {
        structured_diagnostics: if unbounded { vec![crate::known_issues::diagnostic("HARM-TRUNCATION")] } else { vec![] },
        response_points,
        peak_frequency: peak_freq,
        peak_amplitude: peak_amp,
        method: if statics.is_some() { HarmonicMethod::ModalStatic } else { HarmonicMethod::Modal },
        modes_used: p,
        n_dof: n,
        truncation_ratio: ratio,
        max_modal_residual: max_residual(&residuals),
        direct_frequencies: Vec::new(),
        warnings,
    };
    Some(ModalSweep { result, damping: (a0, a1), residuals, uncorrected, truncation })
}

/// Refuses, never re-solves, a kept modal frequency whose residual exceeds
/// `MODAL_RESIDUAL_TOL`: the residual depends on the load.
fn resolve_unbounded_frequencies(
    sweep: ModalSweep,
    dense_k_m: impl FnOnce() -> (Vec<f64>, Vec<f64>),
    f: &[f64],
    n: usize,
    target: &[(usize, f64)],
) -> Result<(HarmonicResult, (f64, f64)), String> {
    let ModalSweep { mut result, damping: (a0, a1), residuals, uncorrected, truncation } = sweep;
    let affordable = 2 * n <= MAX_DENSE_FALLBACK_DOFS;
    let direct: Vec<usize> = if !affordable {
        Vec::new()
    } else if n < DIRECT_HARMONIC_DOFS {
        (0..truncation.len()).collect()
    } else {
        (0..truncation.len()).filter(|&i| !(truncation[i] <= MODAL_TRUNCATION_Q)).collect()
    };
    let bad: Vec<usize> = (0..residuals.len()).filter(|i| !direct.contains(i) && !(residuals[*i] <= MODAL_RESIDUAL_TOL)).collect();
    if !bad.is_empty() {
        let worst = bad.iter().map(|&i| residuals[i]).fold(0.0f64, |m, r| if r.is_nan() { f64::INFINITY } else { m.max(r) });
        return Err(format!(
            "Harmonic analysis: the modal response leaves a relative residual of {worst:.3e} (over {MODAL_RESIDUAL_TOL:.0e}) at {} frequenc{}{}",
            bad.len(),
            if bad.len() == 1 { "y" } else { "ies" },
            if affordable { String::new() } else { format!(", and the direct solve that would replace it is over the {MAX_DENSE_FALLBACK_DOFS}-DOF dense ceiling ({n} DOFs)") },
        ));
    }
    if direct.is_empty() {
        return Ok((result, (a0, a1)));
    }
    let (k, m) = dense_k_m();
    let c = rayleigh_damping_matrix(&m, &k, n, a0, a1);
    for &i in &direct {
        let pt = &mut result.response_points[i];
        let (u_re, u_im) = solve_complex_system(&k, &m, &c, f, n, pt.omega)?;
        let (re, im) = (apply_target(target, &u_re), apply_target(target, &u_im));
        pt.real = re;
        pt.imag = im;
        pt.amplitude = (re * re + im * im).sqrt();
        pt.phase = im.atan2(re);
    }
    let (mut peak_freq, mut peak_amp) = (0.0f64, 0.0f64);
    for pt in &result.response_points {
        if pt.amplitude > peak_amp {
            peak_amp = pt.amplitude;
            peak_freq = pt.frequency;
        }
    }
    result.peak_frequency = peak_freq;
    result.peak_amplitude = peak_amp;
    if direct.len() == result.response_points.len() {
        result.structured_diagnostics.retain(|d| d.phase.as_deref() != Some("HARM-TRUNCATION"));
        return Ok((HarmonicResult {
            method: HarmonicMethod::Direct,
            modes_used: 0,
            truncation_ratio: None,
            max_modal_residual: None,
            direct_frequencies: Vec::new(),
            warnings: Vec::new(),
            ..result
        }, (a0, a1)));
    }
    result.direct_frequencies = direct.iter().map(|&i| result.response_points[i].frequency).collect();
    if uncorrected.iter().all(|f| result.direct_frequencies.contains(f)) {
        result.warnings.retain(|w| !w.starts_with(UNCORRECTED_WARNING));
        if !uncorrected.is_empty() {
            result.structured_diagnostics.retain(|d| d.phase.as_deref() != Some("HARM-TRUNCATION"));
        }
    }
    result.warnings.push(format!(
        "{} frequenc{} where the modes do not bound the truncation error (q over {MODAL_TRUNCATION_Q}) {} solved directly",
        direct.len(),
        if direct.len() == 1 { "y" } else { "ies" },
        if direct.len() == 1 { "was" } else { "were" },
    ));
    Ok((result, (a0, a1)))
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
    let dense_times = |a: &[f64], x: &[f64]| -> Vec<f64> {
        (0..n).map(|i| dot(&a[i * n..(i + 1) * n], x)).collect()
    };
    let m_times = |x: &[f64]| dense_times(m, x);
    let k_times = |x: &[f64]| dense_times(k, x);
    let mut l = k.to_vec();
    let k_spd = cholesky_decompose(&mut l, n);
    let k_solve = |b: &[f64]| -> Option<Vec<f64>> {
        k_spd.then(|| back_solve(&l, &forward_solve(&l, b, n), n))
    };
    let mut sweep = harmonic_modal_from_eigen(&eigen, &m_times, &k_times, &k_solve, f, n, frequencies, damping_ratio, target)?;
    crate::known_issues::attach(&mut sweep.result.structured_diagnostics, crate::known_issues::dense_factor_conditioning(k, n, k_spd.then_some(l.as_slice())).into_iter().collect());
    Some(sweep)
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
    let k_times = |x: &[f64]| k_csc.sym_mat_vec(x);
    let sym = std::rc::Rc::new(symbolic_cholesky(k_csc));
    let factor = numeric_cholesky(&sym, k_csc);
    let k_solve = |b: &[f64]| -> Option<Vec<f64>> {
        factor.as_ref().map(|fac| sparse_cholesky_solve(fac, b))
    };
    let mut sweep = harmonic_modal_from_eigen(&eigen, &m_times, &k_times, &k_solve, f, n, frequencies, damping_ratio, target)?;
    crate::known_issues::attach(&mut sweep.result.structured_diagnostics, crate::known_issues::sparse_factor_conditioning(k_csc, factor.as_ref()).into_iter().collect());
    Some(sweep)
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

fn max_residual(residuals: &[f64]) -> Option<f64> {
    residuals.iter().map(|&r| if r.is_finite() { r } else { f64::MAX }).reduce(f64::max)
}

fn relative_residual(res_re: &[f64], res_im: &[f64], f_scale: f64, f_norm: f64, f_energy: Option<f64>, k_solve: &dyn Fn(&[f64]) -> Option<Vec<f64>>) -> f64 {
    if res_re.iter().chain(res_im).any(|x| !x.is_finite()) {
        return f64::NAN;
    }
    let r_scale = max_abs(res_re).max(max_abs(res_im));
    if r_scale == 0.0 {
        return 0.0;
    }
    let res_re: Vec<f64> = res_re.iter().map(|x| x / r_scale).collect();
    let res_im: Vec<f64> = res_im.iter().map(|x| x / r_scale).collect();
    let ratio = if f_scale > 0.0 { r_scale / f_scale } else { f64::INFINITY };
    let energy = match (k_solve(&res_re), k_solve(&res_im), f_energy) {
        (Some(xr), Some(xi), Some(fe)) if fe.is_finite() && fe > 0.0 => {
            let q = dot(&xr, &res_re) + dot(&xi, &res_im);
            Some(if q.is_finite() { q.max(0.0).sqrt() / fe * ratio } else { f64::NAN })
        }
        _ => None,
    };
    energy.unwrap_or_else(|| (dot(&res_re, &res_re) + dot(&res_im, &res_im)).sqrt() / f_norm * ratio)
}

fn max_abs(v: &[f64]) -> f64 {
    v.iter().fold(0.0f64, |m, x| m.max(x.abs()))
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damping_anchors_precede_harmonic_mode_filtering() {
        let n = 6;
        let mut k = vec![0.0; n*n];
        let mut m = vec![0.0; n*n];
        for (i, lam) in [1.0, 4.0, 9.0, 16.0, 25.0, 36.0].into_iter().enumerate() {
            k[i*n+i] = lam;
            m[i*n+i] = 1.0;
        }
        let f = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        // 16ω_max² is between λ₁ and λ₂: only the first mode is retained.
        let frequencies = [0.0, 0.05];
        let ModalSweep { result: r, damping, .. } = solve_harmonic_modal(&k, &m, &f, n, &frequencies, 0.05, &[(0, 1.0)]).unwrap();
        assert_eq!(r.modes_used, 1);
        let expected = rayleigh_coefficients(1.0, 2.0, 0.05);
        assert!((damping.0 - expected.0).abs() < 1e-14);
        assert!((damping.1 - expected.1).abs() < 1e-14);
        let c = rayleigh_damping_matrix(&m, &k, n, expected.0, expected.1);
        for p in &r.response_points {
            let (re, im) = solve_complex_system(&k, &m, &c, &f, n, p.omega).unwrap();
            assert!((p.real - re[0]).abs() < 1e-12);
            assert!((p.imag - im[0]).abs() < 1e-12);
        }
    }

    fn diagonal(n: usize) -> (Vec<f64>, Vec<f64>) {
        let mut k = vec![0.0; n * n];
        let mut m = vec![0.0; n * n];
        for i in 0..n {
            k[i * n + i] = ((i + 1) * (i + 1)) as f64;
            m[i * n + i] = 1.0;
        }
        (k, m)
    }

    fn sweep_at(k: &[f64], m: &[f64], f: &[f64], n: usize, frequencies: &[f64], target: &[(usize, f64)]) -> (HarmonicResult, (f64, f64)) {
        let sweep = solve_harmonic_modal(k, m, f, n, frequencies, 0.05, target).unwrap();
        resolve_unbounded_frequencies(sweep, || (k.to_vec(), m.to_vec()), f, n, target).unwrap()
    }

    #[test]
    fn small_models_are_solved_directly_at_every_frequency() {
        let n = 6;
        let (k, m) = diagonal(n);
        let f = [1.0; 6];
        let target = [(2, 1.0)];
        let (r, (a0, a1)) = sweep_at(&k, &m, &f, n, &[0.0, 0.05, 0.4], &target);
        assert_eq!(r.method, HarmonicMethod::Direct);
        assert!(r.direct_frequencies.is_empty() && r.warnings.is_empty(), "{r:?}");
        let c = rayleigh_damping_matrix(&m, &k, n, a0, a1);
        for p in &r.response_points {
            let (re, im) = solve_complex_system(&k, &m, &c, &f, n, p.omega).unwrap();
            assert!((p.real - re[2]).abs() <= 1e-12 * re[2].hypot(im[2]) && (p.imag - im[2]).abs() <= 1e-12 * re[2].hypot(im[2]), "{} Hz", p.frequency);
        }
    }

    #[test]
    fn frequency_beyond_the_bounded_range_is_solved_directly() {
        let n = 80;
        let (k, m) = diagonal(n);
        let f = vec![1.0; n];
        let target = [(60, 1.0)];
        let sweep = solve_harmonic_modal(&k, &m, &f, n, &[0.0, 0.5, 3.0], 0.05, &target).unwrap();
        assert!(sweep.truncation[1] <= MODAL_TRUNCATION_Q && sweep.truncation[2] > MODAL_TRUNCATION_Q, "{:?}", sweep.truncation);
        assert!(sweep.result.modes_used < 60, "{}", sweep.result.modes_used);
        let q = sweep.truncation[1];
        let (r, (a0, a1)) = resolve_unbounded_frequencies(sweep, || (k.clone(), m.clone()), &f, n, &target).unwrap();
        assert_eq!(r.method, HarmonicMethod::ModalStatic);
        assert_eq!(r.direct_frequencies, vec![3.0]);
        assert!(r.warnings.iter().any(|w| w.contains("solved directly")), "{:?}", r.warnings);
        let c = rayleigh_damping_matrix(&m, &k, n, a0, a1);
        for p in &r.response_points {
            let (re, im) = solve_complex_system(&k, &m, &c, &f, n, p.omega).unwrap();
            let exact = re[60].hypot(im[60]);
            let tol = if p.frequency == 3.0 { 1e-12 } else { (q * q).max(1e-12) } * exact;
            assert!((p.real - re[60]).hypot(p.imag - im[60]) <= tol, "{} Hz: {} {} vs {} {}", p.frequency, p.real, p.imag, re[60], im[60]);
        }
    }

    #[test]
    fn the_response_is_linear_in_the_load() {
        let n = 80;
        let (k, m) = diagonal(n);
        let frequencies = [0.0, 0.5, 1.2, 3.0];
        let fa: Vec<f64> = (0..n).map(|i| if i % 3 == 0 { 1.0 } else { 0.0 }).collect();
        let fb: Vec<f64> = (0..n).map(|i| if i == 1 { 1e3 } else if i % 7 == 2 { -0.4 } else { 0.0 }).collect();
        let fab: Vec<f64> = fa.iter().zip(&fb).map(|(a, b)| a + b).collect();
        for target in [[(1usize, 1.0)], [(2, 1.0)], [(6, 1.0)]] {
            let (ra, _) = sweep_at(&k, &m, &fa, n, &frequencies, &target);
            let (rb, _) = sweep_at(&k, &m, &fb, n, &frequencies, &target);
            let (rab, _) = sweep_at(&k, &m, &fab, n, &frequencies, &target);
            assert_eq!(ra.direct_frequencies, vec![3.0]);
            assert_eq!(rb.direct_frequencies, ra.direct_frequencies);
            assert_eq!(rab.direct_frequencies, ra.direct_frequencies);
            for i in 0..frequencies.len() {
                let (a, b, ab) = (&ra.response_points[i], &rb.response_points[i], &rab.response_points[i]);
                let scale = a.amplitude + b.amplitude;
                assert!((ab.real - a.real - b.real).abs() <= 1e-12 * scale && (ab.imag - a.imag - b.imag).abs() <= 1e-12 * scale, "{target:?} at {} Hz", a.frequency);
            }
            for scale in [1e-300, 1e150] {
                let fs: Vec<f64> = fb.iter().map(|x| x * scale).collect();
                let (rs, _) = sweep_at(&k, &m, &fs, n, &frequencies, &target);
                assert_eq!(rs.direct_frequencies, rb.direct_frequencies, "load scale {scale:e}");
            }
        }
    }

    #[test]
    fn a_kept_modal_frequency_with_a_large_residual_is_refused() {
        let n = 80;
        let (k, m) = diagonal(n);
        let f = vec![1.0; n];
        let mut sweep = solve_harmonic_modal(&k, &m, &f, n, &[0.5, 3.0], 0.05, &[(2, 1.0)]).unwrap();
        sweep.residuals = vec![2.0 * MODAL_RESIDUAL_TOL, 0.5];
        let e = resolve_unbounded_frequencies(sweep, || (k.clone(), m.clone()), &f, n, &[(2, 1.0)]).unwrap_err();
        assert!(e.contains("relative residual of 2.000e-2") && e.contains("at 1 frequency"), "{e}");
        let mut sweep = solve_harmonic_modal(&k, &m, &f, n, &[0.5, 3.0], 0.05, &[(2, 1.0)]).unwrap();
        sweep.residuals = vec![f64::NAN, 0.5];
        assert!(resolve_unbounded_frequencies(sweep, || (k.clone(), m.clone()), &f, n, &[(2, 1.0)]).is_err());
    }

    #[test]
    fn a_non_finite_residual_is_never_zero() {
        let identity = |b: &[f64]| Some(b.to_vec());
        for (re, im) in [
            (vec![f64::NAN, f64::NAN], vec![f64::NAN, f64::NAN]),
            (vec![f64::NAN, 0.0], vec![0.0, 0.0]),
            (vec![0.0, 0.0], vec![0.0, f64::NAN]),
            (vec![f64::INFINITY, 0.0], vec![0.0, 0.0]),
            (vec![1e-3, f64::NAN], vec![0.0, 0.0]),
        ] {
            let r = relative_residual(&re, &im, 1.0, 1.0, Some(1.0), &identity);
            assert!(r.is_nan(), "{re:?} {im:?}: {r}");
            assert!(max_residual(&[r]).unwrap() > MODAL_RESIDUAL_TOL);
        }
        assert_eq!(relative_residual(&[0.0, 0.0], &[0.0, 0.0], 1.0, 1.0, Some(1.0), &identity), 0.0);
    }

    #[test]
    fn an_unusable_energy_denominator_falls_back_to_the_euclidean_norm() {
        let k = [1e-308, 1e-308, 1.0];
        let k_solve = |b: &[f64]| Some(b.iter().zip(&k).map(|(x, d)| x / d).collect::<Vec<f64>>());
        let f_unit = [1.0; 3];
        let f_energy = k_solve(&f_unit).map(|x| dot(&x, &f_unit).sqrt());
        assert_eq!(f_energy, Some(f64::INFINITY));
        let (re, im) = ([0.0, 0.0, 1e-100], [0.0; 3]);
        let euclid = 1e-100 / 1e-300 / 3f64.sqrt();
        for fe in [f_energy, Some(0.0), Some(-1.0), Some(f64::NAN)] {
            let r = relative_residual(&re, &im, 1e-300, 3f64.sqrt(), fe, &k_solve);
            assert!((r - euclid).abs() <= 1e-12 * euclid, "f_energy {fe:?}: {r}");
            assert!(r > MODAL_RESIDUAL_TOL);
        }
    }

    #[test]
    fn a_non_finite_residual_is_the_largest() {
        assert_eq!(max_residual(&[1e-3, f64::NAN, 2e-3]), Some(f64::MAX));
        assert_eq!(max_residual(&[1e-3, f64::INFINITY]), Some(f64::MAX));
        assert_eq!(max_residual(&[1e-3, 2e-3]), Some(2e-3));
        assert_eq!(max_residual(&[]), None);
    }

    #[test]
    fn zero_load_gives_zero_response() {
        let n = 80;
        let (k, m) = diagonal(n);
        let sweep = solve_harmonic_modal(&k, &m, &vec![0.0; n], n, &[0.0, 0.5, 3.0], 0.05, &[(2, 1.0)]).unwrap();
        assert_eq!(sweep.residuals, vec![0.0, 0.0, 0.0]);
        let (r, _) = resolve_unbounded_frequencies(sweep, || (k.clone(), m.clone()), &vec![0.0; n], n, &[(2, 1.0)]).unwrap();
        assert_eq!(r.direct_frequencies, vec![3.0]);
        assert!(r.response_points.iter().all(|p| p.amplitude == 0.0));
    }

    #[test]
    fn harmonic_rotation_with_cut_inside_degenerate_cluster() {
        // Three equal point masses linked by isotropic springs, with both
        // ends spring-supported: K = tridiag(-1, 2, -1) ⊗ I₃, M = I₉.
        // Each eigenvalue has multiplicity three. The harmonic request of
        // n/2 = 4 modes cuts through the second cluster (λ = 2).
        let n = 9;
        let mut k = vec![0.0; n*n];
        let mut m = vec![0.0; n*n];
        for i in 0..n {
            k[i*n+i] = 2.0;
            m[i*n+i] = 1.0;
            if i+3 < n { k[i*n+i+3] = -1.0; k[(i+3)*n+i] = -1.0; }
        }
        let eigen = lanczos_generalized_eigen(&k, &m, n, n, 0.0).unwrap();
        for &lam in &eigen.values[3..6] { assert!((lam - 2.0).abs() < 1e-12); }
        let iso = crate::metamorphic::transform::Iso3::about_z(0.713);
        let f = [1.0, -0.7, 0.3, -0.4, 1.2, 0.9, 0.5, -0.2, 1.1];
        let rotated: Vec<_> = f.chunks_exact(3)
            .flat_map(|v| iso.apply_vec([v[0], v[1], v[2]])).collect();
        let ks = CscMatrix::from_dense_symmetric(&k, n);
        let ms = CscMatrix::from_dense_symmetric(&m, n);
        for sparse in [false, true] {
            let solve = |load: &[f64], target| {
                let ModalSweep { result: r, .. } = if sparse {
                    solve_harmonic_modal_sparse(&ks, &ms, load, &[0.05, 0.1], 0.05, &[(target, 1.0)])
                } else {
                    solve_harmonic_modal(&k, &m, load, n, &[0.05, 0.1], 0.05, &[(target, 1.0)])
                }.unwrap();
                assert_eq!(r.modes_used, 3, "the boundary cluster must be omitted in full");
                r
            };
            for node in 0..3 {
                let base: Vec<_> = (0..3).map(|d| solve(&f, 3*node+d)).collect();
                let rot: Vec<_> = (0..3).map(|d| solve(&rotated, 3*node+d)).collect();
                for p in 0..2 {
                    let re = iso.apply_vec(std::array::from_fn(|d| base[d].response_points[p].real));
                    let im = iso.apply_vec(std::array::from_fn(|d| base[d].response_points[p].imag));
                    for d in 0..3 {
                        assert!((rot[d].response_points[p].real - re[d]).abs() < 1e-11);
                        assert!((rot[d].response_points[p].imag - im[d]).abs() < 1e-11);
                    }
                }
            }
        }
    }
}
