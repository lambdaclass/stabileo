use crate::types::*;
use crate::linalg::*;
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::SPARSE_THRESHOLD;
use super::mass_matrix::*;
use super::constraints::{FreeConstraintSystem, MasterMotion};

/// Modal analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalResult {
    pub modes: Vec<ModeShape>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finite_spectrum_diagnostic: Option<String>,
    pub n_dof: usize,
    pub total_mass: f64,
    pub cumulative_mass_ratio_x: f64,
    pub cumulative_mass_ratio_y: f64,
    pub rayleigh: Option<RayleighDamping>,
    #[serde(default)]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub null_modes: Vec<NullMode>,
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

/// A zero-frequency mode left out of `modes`: the structure moves there without
/// deforming and without exciting any translational mass, so it is reported, not refused.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NullMode {
    pub omega_sq: f64,
    pub node_id: usize,
    pub dof: String,
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
    super::linear::validate_input_2d(input)?;
    super::dynamic_validation::validate_mass_2d(input, densities)?;
    if num_modes == 0 {
        return Err("num_modes must be >= 1".to_string());
    }
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err(crate::refusal::no_free_dofs());
    }

    // Mass ratios divide by the mass that can move in their direction: a
    // nodal mass may be directional (a floor's horizontal mass only).
    let [mass_x, mass_z] = total_mass_by_direction_2d(input, densities);
    let total_mass = mass_x.max(mass_z);
    let rotary = input.masses.nodal.iter().any(|m| m.rotary_inertia > 0.0);
    if total_mass < 1e-20 && !rotary {
        return Err("No mass assigned — set material densities or nodal masses".into());
    }

    // Constraint transform, if any: K and M reduce as sparse triple products
    // on the large-model branch, never densifying.
    let cs = FreeConstraintSystem::build_2d(&input, &dof_num)?;
    let free_idx: Vec<usize> = (0..nf).collect();

    // K is assembled in the inclined-roller frames (the same rotations by
    // either assembler); M, the influence vectors and the mode shapes follow.
    let sparse = nf >= SPARSE_THRESHOLD;
    let (k_sparse, k_dense, its) = if sparse {
        let s = super::sparse_assembly::assemble_stiffness_sparse_2d(input, &dof_num);
        (Some(s.k_ff), None, s.inclined_transforms_2d)
    } else {
        let s = assemble_stiffness_2d(input, &dof_num);
        (None, Some(extract_submatrix(&s.k, n, &free_idx, &free_idx)), s.inclined_transforms_2d)
    };

    // The ground-motion load of a unit rigid translation along X and along Y
    // is (M·r)_f with r = 1 on EVERY node's translation, supports included
    // (`ground_influence`, the load time history applies): with a consistent
    // mass the free DOFs carry the inertia coupled to the moving supports,
    // M_fr·r_r, besides M_ff·r_f. Γ used to take M_ff·r_f alone, which lost
    // that part (for a one-element cantilever the modal static limit was 0.78
    // of the exact tip deflection, and Σ M_eff could not pass 37% of the mass).
    let m_full_cell: std::cell::OnceCell<CscMatrix> = std::cell::OnceCell::new();
    let m_full_sparse = || {
        m_full_cell.get_or_init(|| super::mass_matrix::assemble_mass_matrix_2d_sparse_block(input, &dof_num, densities, n))
    };

    // Solve K·φ = λ·M·φ where λ = ω²
    // Large models (constrained or not): triplet sparse assembly + sparse
    // shift-invert Lanczos; the constraint transform reduces K and M as
    // sparse triple products (CᵀKC over triplets), never densifying.
    let mut k_check_sparse = None;
    let mut k_check_dense = Vec::new();
    let mut m_csc_opt: Option<crate::linalg::CscMatrix> = None;
    // M·r on the full free space, taken before the mass is reduced.
    let (m_r_x, m_r_y);
    let mut structured_diagnostics = crate::known_issues::for_2d(input, crate::known_issues::Analysis::Modal);
    let assembled_conditioning = match (&k_sparse, &k_dense) {
        (Some(k), _) => crate::known_issues::sparse_conditioning(k),
        (_, Some(k)) => crate::known_issues::dense_conditioning(k, nf),
        _ => None,
    };
    crate::known_issues::attach(&mut structured_diagnostics, assembled_conditioning.into_iter().collect());
    let (result, ns, m_solve) = if let Some(k_ff) = k_sparse {
        // Assembled once: the branch below differs in whether the matrices are
        // reduced, not in how they are built.
        let m_csc = super::mass_matrix::assemble_mass_matrix_2d_sparse_inclined(input, &dof_num, densities, &its);
        m_r_x = ground_influence(&dof_num, 0, &its, &m_csc, m_full_sparse);
        m_r_y = ground_influence(&dof_num, 1, &its, &m_csc, m_full_sparse);
        if let Some(ref cs) = cs {
            let k_solve = cs.reduce_matrix_sparse(&k_ff);
            let m_solve = cs.reduce_matrix_sparse(&m_csc);
            let (result, conditioning) = crate::known_issues::with_sparse_factor_conditioning(&k_solve, |observe| {
                crate::linalg::lanczos::lanczos_generalized_eigen_sparse_observed(&k_solve, &m_solve, num_modes, 0.0, observe)
            });
            crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
            let result = result.ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(k_solve.n))?;
            k_check_sparse = Some(k_solve);
            m_csc_opt = Some(m_solve);
            (result, cs.n_free_indep, Vec::new())
        } else {
            let (result, conditioning) = crate::known_issues::with_sparse_factor_conditioning(&k_ff, |observe| {
                crate::linalg::lanczos::lanczos_generalized_eigen_sparse_observed(&k_ff, &m_csc, num_modes, 0.0, observe)
            });
            crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
            let result = result.ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(k_ff.n))?;
            k_check_sparse = Some(k_ff);
            m_csc_opt = Some(m_csc);
            (result, nf, Vec::new())
        }
    } else {
        // Dense mass only for the small-model branch: a dense mass is O(n²)
        // memory and assembly time.
        let k_ff = k_dense.expect("dense K below the sparse threshold");
        let mut m_full = assemble_mass_matrix_2d(input, &dof_num, densities);
        rotate_inclined_dense(&mut m_full, n, &its);
        let m_ff = extract_submatrix(&m_full, n, &free_idx, &free_idx);
        // (M·r)_f from the full mass (rotated, T·M·Tᵀ) and the rotated rigid
        // translation T·r over all DOFs: (T·M·Tᵀ)(T·r) = T·(M·r).
        let full_mr = |local: usize| {
            let mut r = vec![0.0; n];
            for &node_id in &dof_num.node_order {
                if let Some(&d) = dof_num.map.get(&(node_id, local)) { r[d] = 1.0; }
            }
            for it in &its { it.rotate(&mut r); }
            let mut mr = mat_vec_sub(&m_full, &r, n);
            mr.truncate(nf);
            mr
        };
        m_r_x = full_mr(0);
        m_r_y = full_mr(1);
        let (k_solve, m_solve, ns) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_matrix(&m_ff), cs.n_free_indep)
        } else {
            (k_ff.clone(), m_ff.clone(), nf)
        };
        let result = crate::linalg::lanczos::lanczos_generalized_eigen(&k_solve, &m_solve, ns, num_modes, 0.0)
            .ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(ns))?;
        crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::dense_stiffness_conditioning(&k_solve, ns).into_iter().collect());
        k_check_dense = k_solve;
        (result, ns, m_solve)
    };

    let requested = num_modes;
    let num_modes = num_modes.min(ns);

    // The inertial load of a unit ground acceleration, M·r, reduced to the
    // solve space: L = Cᵀ(M·r). Γ = φᵀM r / φᵀM φ is then φ_s·L / φ_sᵀM_sφ_s.
    // Reducing r itself (Cᵀr) and multiplying by the reduced mass is not the
    // same thing: Cᵀ is the force transform, so for N nodes tied by EqualDOF
    // it sums their ones into N, and Γ came out N× too large, the effective
    // mass N²× — mass ratios far above 1. M·r is a force, and Cᵀ reduces
    // forces exactly, for every constraint type.
    let (l_x, l_y) = match &cs {
        Some(cs) => (cs.reduce_vector(&m_r_x), cs.reduce_vector(&m_r_y)),
        None => (m_r_x.clone(), m_r_y.clone()),
    };

    let (result, null_modes) = {
        let k_abs = |x: &[f64]| match &k_check_sparse {
            Some(k) => abs_mat_vec_sparse(k, x),
            None => abs_mat_vec_dense(&k_check_dense, x, ns),
        };
        let m_mul = |x: &[f64]| match &m_csc_opt {
            Some(m_csc) => m_csc.sym_mat_vec(x),
            None => mat_vec_sub(&m_solve, x, ns),
        };
        let free = |phi: &[f64]| cs.as_ref().map_or_else(|| phi.to_vec(), |cs| cs.expand_solution(phi, MasterMotion::Homogeneous))[..nf].to_vec();
        let shape = |phi: &[f64]| to_global(&free(phi), n, &its);
        let eigen = |k: usize| match (&k_check_sparse, &m_csc_opt) {
            (Some(kk), Some(mm)) => lanczos_generalized_eigen_sparse(kk, mm, k, 0.0),
            _ => lanczos_generalized_eigen(&k_check_dense, &m_solve, ns, k, 0.0),
        };
        let classify = |r: &EigenResult| null_modes_or_mechanism(r, ns, &m_mul, &[(&l_x, mass_x), (&l_y, mass_z)], &[&m_r_x, &m_r_y], &free, &shape, &dof_num, &["ux", "uz", "ry"], &k_abs);
        with_replacements(&result, num_modes, ns, &classify, &eigen)?
    };

    let mut checks = super::self_checks::ModalChecks::default();
    checks.scales = super::self_checks::energy_scale(&match &k_check_sparse {
        Some(k) => k.diagonal(),
        None => (0..ns).map(|i| k_check_dense[i*ns+i]).collect(),
    });
    checks.stiffness = match &k_check_sparse {
        Some(k) => super::self_checks::ProductBound::sparse(k, &checks.scales),
        None => super::self_checks::ProductBound::dense(&k_check_dense, ns, &checks.scales),
    };
    checks.mass = match &m_csc_opt {
        Some(m) => super::self_checks::ProductBound::sparse(m, &checks.scales),
        None => super::self_checks::ProductBound::dense(&m_solve, ns, &checks.scales),
    };
    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        // ∞: a massless direction (lumped-mass rotations), not a mode.
        if eigenvalue <= 0.0 || !eigenvalue.is_finite() || modes.len() >= num_modes {
            continue;
        }

        let omega = eigenvalue.sqrt();
        let freq = omega / (2.0 * std::f64::consts::PI);
        let period = if freq > 1e-20 { 1.0 / freq } else { f64::INFINITY };

        // Extract eigenvector in solve space (ns-dimensional)
        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();

        // Compute φᵀ·M·φ in solve space — sparse CSC matvec when the mass was
        // assembled sparse (large unconstrained models), dense otherwise.
        let m_phi = match &m_csc_opt {
            Some(m_csc) => m_csc.sym_mat_vec(&phi_s),
            None => mat_vec_sub(&m_solve, &phi_s, ns),
        };
        let k_phi = match &k_check_sparse {
            Some(k) => k.sym_mat_vec(&phi_s),
            None => mat_vec_sub(&k_check_dense, &phi_s, ns),
        };
        let abs_phi: Vec<_> = phi_s.iter().map(|p| p.abs()).collect();
        let abs_m_phi = match &m_csc_opt {
            Some(m) => abs_mat_vec_sparse(m, &abs_phi),
            None => abs_mat_vec_dense(&m_solve, &abs_phi, ns),
        };
        checks.check(&phi_s, eigenvalue, &k_phi, &m_phi, &abs_m_phi)?;
        let phi_m_phi: f64 = phi_s.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();

        // Participation factors in solve space: φ_s · Cᵀ(M·r).
        let phi_m_rx: f64 = phi_s.iter().zip(l_x.iter()).map(|(p, l)| p * l).sum();
        let phi_m_ry: f64 = phi_s.iter().zip(l_y.iter()).map(|(p, l)| p * l).sum();

        let gamma_x = if phi_m_phi.abs() > 1e-30 { phi_m_rx / phi_m_phi } else { 0.0 };
        let gamma_y = if phi_m_phi.abs() > 1e-30 { phi_m_ry / phi_m_phi } else { 0.0 };

        // Effective masses
        let meff_x = gamma_x * gamma_x * phi_m_phi;
        let meff_y = gamma_y * gamma_y * phi_m_phi;
        let mrx = if mass_x > 1e-20 { meff_x / mass_x } else { 0.0 };
        let mry = if mass_z > 1e-20 { meff_y / mass_z } else { 0.0 };
        cum_mrx += mrx;
        cum_mry += mry;

        // Expand eigenvector back to full free DOFs
        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s, MasterMotion::Homogeneous)
        } else {
            phi_s
        };

        // Build mode shape in global axes (inclined rollers rotated back
        // before normalizing, so the scale is an unrotated model's), max = 1
        let mut u_mode = to_global(&phi_f[..nf], n, &its);
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for val in u_mode.iter_mut() {
                *val /= max_disp;
            }
        }
        // Γ was computed on the eigenvector as the eigensolver returned it. The shape published
        // below is that vector divided by `max_disp`, and Γ scales inversely with its shape, so
        // it has to be rescaled with it: Γ·φ is what spectral analysis multiplies, and it is
        // normalization-independent only when both factors refer to the same φ. Effective mass
        // (Γ²·φᵀMφ) is invariant and needs no change.
        let shape_scale = if max_disp > 1e-20 { max_disp } else { 1.0 };
        let gamma_x = gamma_x * shape_scale;
        let gamma_y = gamma_y * shape_scale;

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

    // The eigensolver excludes certified massless directions from this count;
    // dropping a finite low-frequency mode must still refuse a partial result.
    if modes.len() < num_modes.min(n_converged) {
        return Err(format!("Eigenvalue decomposition failed: Modal completeness could not be established: only {} of {} computed modes passed the positive-frequency threshold (finite omega² > 0); no incomplete modes were returned. Check stiffness/mass conditioning and supports.", modes.len(), num_modes.min(n_converged)));
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

    structured_diagnostics.extend(checks.diagnostics);
    Ok(ModalResult {
        finite_spectrum_diagnostic: finite_spectrum_diagnostic(requested, modes.len()),
        modes,
        n_dof: nf,
        total_mass,
        cumulative_mass_ratio_x: cum_mrx,
        cumulative_mass_ratio_y: cum_mry,
        rayleigh,
        structured_diagnostics,
        null_modes,
    })
}

pub const MODAL_MECHANISM: &str = "MODAL-MECHANISM";
const NULL_MODE_MASS_RATIO: f64 = 1e-6;
const ZERO_CANCELLATION: f64 = 1e-14;
const TRANSLATION_ROUND_OFF: f64 = 1e-8;
const MASSLESS: f64 = 1e-12;

/// `uf`, `rigid` and `shape(phi)` are all indexed by `DofNumbering` numbers, which put the free DOFs first.
#[allow(clippy::type_complexity, clippy::too_many_arguments)]
fn null_modes_or_mechanism(
    result: &EigenResult,
    ns: usize,
    m_mul: &dyn Fn(&[f64]) -> Vec<f64>,
    loads: &[(&Vec<f64>, f64)],
    rigid: &[&Vec<f64>],
    free: &dyn Fn(&[f64]) -> Vec<f64>,
    shape: &dyn Fn(&[f64]) -> Vec<f64>,
    dof_num: &DofNumbering,
    dof_names: &[&str],
    k_abs: &dyn Fn(&[f64]) -> Vec<f64>,
) -> Result<(EigenResult, Vec<NullMode>), String> {
    let nk = result.values.len();
    let mut dofs: Vec<(usize, usize, usize)> = dof_num.map.iter().filter(|(_, &g)| g < dof_num.n_free).map(|(&(node, local), &g)| (node, local, g)).collect();
    dofs.sort_unstable();
    let mut out = Vec::new();
    let mut moving = None;
    let heaviest_mass = rigid.iter().flat_map(|m| m.iter()).fold(0.0f64, |w, m| w.max(m.abs()));
    let mut zero = vec![false; nk];
    for (idx, &lambda) in result.values.iter().enumerate() {
        if !lambda.is_finite() {
            continue;
        }
        let phi: Vec<f64> = (0..ns).map(|i| result.vectors[i * nk + idx]).collect();
        let pmp: f64 = phi.iter().zip(m_mul(&phi)).map(|(a, b)| a * b).sum();
        let magnitude: Vec<f64> = phi.iter().map(|x| x.abs()).collect();
        let bound: f64 = magnitude.iter().zip(k_abs(&magnitude)).map(|(a, b)| a * b).sum();
        let round_off = lambda.abs() * pmp.abs() <= ZERO_CANCELLATION * bound;
        if !(round_off || lambda < 0.0) {
            continue;
        }
        zero[idx] = true;
        let share = loads.iter().fold(0.0f64, |w, (l, mass)| {
            let pl: f64 = phi.iter().zip(l.iter()).map(|(a, b)| a * b).sum();
            if pmp.abs() > 1e-30 && *mass > 1e-20 { w.max(pl * pl / pmp / mass) } else { w }
        });
        let uf = free(&phi);
        let weight = |local: usize, g: usize| if local < rigid.len() { rigid.iter().map(|m| m.get(g).map_or(0.0, |x| x * x)).sum::<f64>().sqrt() } else { 0.0 };
        let kinetic = |&&(_, local, g): &&(usize, usize, usize)| uf.get(g).map_or(0.0, |u| weight(local, g) * u * u);
        let heaviest = dofs.iter().filter(|d| d.1 < rigid.len()).max_by(|a, b| kinetic(a).total_cmp(&kinetic(b)));
        let translational: f64 = dofs.iter().map(|d| kinetic(&d)).sum();
        let u = shape(&phi);
        let (node_id, dof) = dofs.iter().filter(|d| d.2 < u.len()).max_by(|a, b| u[a.2].abs().total_cmp(&u[b.2].abs()))
            .map_or((0, String::new()), |&(node, local, _)| (node, dof_names.get(local).copied().unwrap_or("").to_string()));
        let reach = uf.iter().fold(0.0f64, |m, x| m.max(x.abs()));
        let carries = |&&(_, local, g): &&(usize, usize, usize)| weight(local, g) > MASSLESS * heaviest_mass;
        let swings = dofs.iter().filter(carries).any(|&(_, _, g)| uf.get(g).is_some_and(|u| u.abs() > TRANSLATION_ROUND_OFF * reach));
        let translates = share > NULL_MODE_MASS_RATIO || translational > NULL_MODE_MASS_RATIO * pmp.abs() || swings;
        if moving.is_none() && (!round_off || translates) {
            let (node, dof) = match heaviest {
                Some(&(n, l, _)) if translates => (n, dof_names.get(l).copied().unwrap_or("").to_string()),
                _ => (node_id, dof.clone()),
            };
            moving = Some((node, dof, lambda));
        }
        out.push(NullMode { omega_sq: lambda, node_id, dof });
    }
    if let Some((node, dof, lambda)) = moving {
        return Err(format!(
            "{MODAL_MECHANISM}: Modal analysis: the structure is a mechanism: {} mode(s) with ω² zero to round-off or negative; one (ω² = {lambda:.3e}) moves node {node} along {dof} with no positive stiffness against it, so a release, hinge, missing support or negative stiffness lets part of the mass move freely. No modes are returned.",
            out.len()
        ));
    }
    let kept: Vec<usize> = (0..nk).filter(|&i| !zero[i]).collect();
    let values = kept.iter().map(|&i| result.values[i]).collect();
    let vectors = (0..ns).flat_map(|r| kept.iter().map(move |&i| result.vectors[r * nk + i])).collect();
    Ok((EigenResult { values, vectors }, out))
}

#[allow(clippy::type_complexity)]
fn with_replacements(
    result: &EigenResult,
    num_modes: usize,
    ns: usize,
    classify: &dyn Fn(&EigenResult) -> Result<(EigenResult, Vec<NullMode>), String>,
    eigen: &dyn Fn(usize) -> Option<EigenResult>,
) -> Result<(EigenResult, Vec<NullMode>), String> {
    let mut found = classify(result)?;
    let mut asked = result.values.len();
    while !found.1.is_empty() && found.0.values.len() < num_modes && asked < ns {
        asked = (num_modes + found.1.len()).max(2 * asked).min(ns);
        let more = eigen(asked).ok_or_else(|| "Eigenvalue decomposition failed".to_string())?;
        found = classify(&more)?;
    }
    Ok(found)
}

fn abs_mat_vec_sparse(a: &crate::linalg::CscMatrix, x: &[f64]) -> Vec<f64> {
    let mut y = vec![0.0; a.n];
    for j in 0..a.n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let (i, v) = (a.row_idx[p], a.values[p].abs());
            y[i] += v * x[j];
            if i != j {
                y[j] += v * x[i];
            }
        }
    }
    y
}

fn abs_mat_vec_dense(a: &[f64], x: &[f64], n: usize) -> Vec<f64> {
    (0..n).map(|i| a[i * n..(i + 1) * n].iter().zip(x).map(|(v, x)| v.abs() * x).sum()).collect()
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finite_spectrum_diagnostic: Option<String>,
    pub n_dof: usize,
    pub total_mass: f64,
    pub cumulative_mass_ratio_x: f64,
    pub cumulative_mass_ratio_y: f64,
    pub cumulative_mass_ratio_z: f64,
    pub rayleigh: Option<RayleighDamping>,
    #[serde(default)]
    pub structured_diagnostics: Vec<StructuredDiagnostic>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub null_modes: Vec<NullMode>,
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
    let known_model = crate::known_issues::for_3d(input, crate::known_issues::Analysis::Modal);
    crate::known_issues::refuse(&known_model)?;
    let input = &super::linear::expand_curved_beams_3d(input);
    super::linear::validate_input_3d_for_analysis(input, crate::known_issues::Analysis::Modal)?;
    super::dynamic_validation::validate_mass_3d(input, densities)?;
    if num_modes == 0 {
        return Err("num_modes must be >= 1".to_string());
    }
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err(crate::refusal::no_free_dofs()); }

    // Mass ratios per direction: see the 2D solver.
    let [mass_x, mass_y, mass_z] = total_mass_by_direction_3d(input, densities);
    let total_mass = mass_x.max(mass_y).max(mass_z);
    let rotary = input.masses.nodal.iter().any(|m| m.ixx > 0.0 || m.iyy > 0.0 || m.izz > 0.0);
    if total_mass < 1e-20 && !rotary {
        return Err("No mass assigned — set material densities or nodal masses".into());
    }

    let sasm = assemble_sparse_3d(input, &dof_num, false);

    // Apply constraint transform if present
    let cs = FreeConstraintSystem::build_3d(&input, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Mass matrix: sparse CSC (free block). With the sparse constraint
    // transform, the constraint path also stays sparse end to end — K and M
    // reduce as sparse triple products, no dense n² allocation anywhere.
    // In the inclined-support frames K was assembled in.
    let its = &sasm.inclined_transforms;
    let m_sparse_ff = assemble_mass_matrix_3d_sparse_inclined(input, &dof_num, densities, its);

    // Reduced-space matrices owned here so both branches can borrow them.
    let k_red;
    let m_red;
    let (k_solve, m_solve): (&CscMatrix, &CscMatrix) = if let Some(ref cs) = cs {
        k_red = cs.reduce_matrix_sparse(&sasm.k_ff);
        m_red = cs.reduce_matrix_sparse(&m_sparse_ff);
        (&k_red, &m_red)
    } else {
        (&sasm.k_ff, &m_sparse_ff)
    };
    let mut structured_diagnostics = known_model;
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::for_3d(input, crate::known_issues::Analysis::Modal));
    crate::known_issues::attach(&mut structured_diagnostics, crate::known_issues::sparse_conditioning(&sasm.k_ff).into_iter().collect());
    let (result, conditioning) = crate::known_issues::with_sparse_factor_conditioning(k_solve, |observe| {
        crate::linalg::lanczos::lanczos_generalized_eigen_sparse_observed(k_solve, m_solve, num_modes, 0.0, observe)
    });
    crate::known_issues::attach(&mut structured_diagnostics, conditioning.into_iter().collect());
    let result = result.ok_or_else(|| crate::refusal::eigen_decomposition_failed(&crate::linalg::lanczos::eigen_failure_message(k_solve.n)))?;

    let requested = num_modes;
    let num_modes = num_modes.min(ns);

    // L = Cᵀ(M·r)_f, the reduced inertial load of a unit rigid translation
    // along X, Y, Z, with the support-coupled inertia M_fr·r_r included — see
    // the 2D solver. Cᵀr also put the eccentricities of a diaphragm's nodes on
    // the master's θz, a torsional participation no rigid translation has.
    // The full mass is assembled once, only if some support moves with the ground.
    let m_full_cell: std::cell::OnceCell<CscMatrix> = std::cell::OnceCell::new();
    let m_r = |local: usize| {
        ground_influence(&dof_num, local, its, &m_sparse_ff, || {
            m_full_cell.get_or_init(|| super::mass_matrix::assemble_mass_matrix_3d_sparse_block(input, &dof_num, densities, n))
        })
    };
    let rigid = [m_r(0), m_r(1), m_r(2)];
    let reduce = |mr: &Vec<f64>| match &cs { Some(cs) => cs.reduce_vector(mr), None => mr.clone() };
    let (l_x, l_y, l_z) = (reduce(&rigid[0]), reduce(&rigid[1]), reduce(&rigid[2]));

    let (result, null_modes) = {
        let k_abs = |x: &[f64]| abs_mat_vec_sparse(k_solve, x);
        let m_mul = |x: &[f64]| m_solve.sym_mat_vec(x);
        let free = |phi: &[f64]| cs.as_ref().map_or_else(|| phi.to_vec(), |cs| cs.expand_solution(phi, MasterMotion::Homogeneous))[..nf].to_vec();
        let shape = |phi: &[f64]| to_global(&free(phi), n, its);
        let eigen = |k: usize| lanczos_generalized_eigen_sparse(k_solve, m_solve, k, 0.0);
        let classify = |r: &EigenResult| null_modes_or_mechanism(r, ns, &m_mul, &[(&l_x, mass_x), (&l_y, mass_y), (&l_z, mass_z)], &[&rigid[0], &rigid[1], &rigid[2]], &free, &shape, &dof_num, &["ux", "uy", "uz", "rx", "ry", "rz", "warping"], &k_abs);
        with_replacements(&result, num_modes, ns, &classify, &eigen)?
    };

    let mut checks = super::self_checks::ModalChecks::default();
    checks.scales = super::self_checks::energy_scale(&k_solve.diagonal());
    checks.stiffness = super::self_checks::ProductBound::sparse(k_solve, &checks.scales);
    checks.mass = super::self_checks::ProductBound::sparse(m_solve, &checks.scales);
    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;
    let mut cum_mrz = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        // ∞: a massless direction (lumped-mass rotations), not a mode.
        if eigenvalue <= 0.0 || !eigenvalue.is_finite() || modes.len() >= num_modes { continue; }

        let omega = eigenvalue.sqrt();
        let freq = omega / (2.0 * std::f64::consts::PI);
        let period = if freq > 1e-20 { 1.0 / freq } else { f64::INFINITY };

        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();

        let m_phi = m_solve.sym_mat_vec(&phi_s);
        let abs_phi: Vec<_> = phi_s.iter().map(|p| p.abs()).collect();
        let abs_m_phi = abs_mat_vec_sparse(m_solve, &abs_phi);
        checks.check(&phi_s, eigenvalue, &k_solve.sym_mat_vec(&phi_s), &m_phi, &abs_m_phi)?;
        let phi_m_phi: f64 = phi_s.iter().zip(m_phi.iter()).map(|(a, b)| a * b).sum();

        let phi_m_rx: f64 = phi_s.iter().zip(l_x.iter()).map(|(p, l)| p * l).sum();
        let phi_m_ry: f64 = phi_s.iter().zip(l_y.iter()).map(|(p, l)| p * l).sum();
        let phi_m_rz: f64 = phi_s.iter().zip(l_z.iter()).map(|(p, l)| p * l).sum();

        let gamma_x = if phi_m_phi.abs() > 1e-30 { phi_m_rx / phi_m_phi } else { 0.0 };
        let gamma_y = if phi_m_phi.abs() > 1e-30 { phi_m_ry / phi_m_phi } else { 0.0 };
        let gamma_z = if phi_m_phi.abs() > 1e-30 { phi_m_rz / phi_m_phi } else { 0.0 };

        let meff_x = gamma_x * gamma_x * phi_m_phi;
        let meff_y = gamma_y * gamma_y * phi_m_phi;
        let meff_z = gamma_z * gamma_z * phi_m_phi;
        let mrx = if mass_x > 1e-20 { meff_x / mass_x } else { 0.0 };
        let mry = if mass_y > 1e-20 { meff_y / mass_y } else { 0.0 };
        let mrz = if mass_z > 1e-20 { meff_z / mass_z } else { 0.0 };
        cum_mrx += mrx;
        cum_mry += mry;
        cum_mrz += mrz;

        let phi_f = if let Some(ref cs) = cs {
            cs.expand_solution(&phi_s, MasterMotion::Homogeneous)
        } else {
            phi_s
        };

        // Global axes at inclined supports before normalizing (see 2D).
        let mut u_mode = to_global(&phi_f[..nf], n, its);
        let max_disp = u_mode.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        if max_disp > 1e-20 {
            for val in u_mode.iter_mut() { *val /= max_disp; }
        }
        // Same rescaling as the 2D path: Γ must refer to the shape that is published.
        let shape_scale = if max_disp > 1e-20 { max_disp } else { 1.0 };
        let gamma_x = gamma_x * shape_scale;
        let gamma_y = gamma_y * shape_scale;
        let gamma_z = gamma_z * shape_scale;

        let displacements = super::linear::build_displacements_3d(&dof_num, &u_mode);

        modes.push(ModeShape3D {
            frequency: freq, period, omega, displacements,
            participation_x: gamma_x, participation_y: gamma_y, participation_z: gamma_z,
            effective_mass_x: meff_x, effective_mass_y: meff_y, effective_mass_z: meff_z,
            mass_ratio_x: mrx, mass_ratio_y: mry, mass_ratio_z: mrz,
        });
    }

    if modes.is_empty() { return Err("No valid modes found".into()); }
    let guard = crate::known_issues::MembraneBendingGuard::for_analysis(input, crate::known_issues::Analysis::Modal);
    if !guard.is_empty() {
        for mode in &modes {
            let by_node: HashMap<usize, &Displacement3D> = mode.displacements.iter().map(|d| (d.node_id, d)).collect();
            guard.check_field(&[], |id| by_node.get(&id).map(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]))?;
        }
    }

    // The eigensolver excludes certified massless directions from this count;
    // dropping a finite low-frequency mode must still refuse a partial result.
    if modes.len() < num_modes.min(n_converged) {
        return Err(crate::refusal::eigen_decomposition_failed(&format!("Eigenvalue decomposition failed: Modal completeness could not be established: only {} of {} computed modes passed the positive-frequency threshold (finite omega² > 0); no incomplete modes were returned. Check stiffness/mass conditioning and supports.", modes.len(), num_modes.min(n_converged))));
    }


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

    structured_diagnostics.extend(checks.diagnostics);
    Ok(ModalResult3D {
        finite_spectrum_diagnostic: finite_spectrum_diagnostic(requested, modes.len()),
        modes, n_dof: nf, total_mass,
        cumulative_mass_ratio_x: cum_mrx,
        cumulative_mass_ratio_y: cum_mry,
        cumulative_mass_ratio_z: cum_mrz,
        rayleigh,
        structured_diagnostics,
        null_modes,
    })
}

fn finite_spectrum_diagnostic(requested: usize, returned: usize) -> Option<String> {
    if returned < requested {
        Some(format!("Requested {requested} modes; returned all {returned} finite modes certified by the Sturm count. Massless directions have no finite frequency."))
    } else { None }
}
