use crate::types::*;
use crate::linalg::*;
use std::collections::HashMap;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::SPARSE_THRESHOLD;
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
    super::linear::validate_input_2d(input)?;
    super::dynamic_validation::validate_mass_2d(input, densities)?;
    if num_modes == 0 {
        return Err("num_modes must be >= 1".to_string());
    }
    let dof_num = DofNumbering::build_2d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 {
        return Err("No free DOFs".into());
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
    let mut m_csc_opt: Option<crate::linalg::CscMatrix> = None;
    // M·r on the full free space, taken before the mass is reduced.
    let (m_r_x, m_r_y);
    let (result, ns, m_solve) = if let Some(k_ff) = k_sparse {
        // Assembled once: the branch below differs in whether the matrices are
        // reduced, not in how they are built.
        let m_csc = super::mass_matrix::assemble_mass_matrix_2d_sparse_inclined(input, &dof_num, densities, &its);
        m_r_x = ground_influence(&dof_num, 0, &its, &m_csc, m_full_sparse);
        m_r_y = ground_influence(&dof_num, 1, &its, &m_csc, m_full_sparse);
        if let Some(ref cs) = cs {
            let k_solve = cs.reduce_matrix_sparse(&k_ff);
            let m_solve = cs.reduce_matrix_sparse(&m_csc);
            let result = lanczos_generalized_eigen_sparse(&k_solve, &m_solve, num_modes, 0.0)
                .ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(k_solve.n))?;
            m_csc_opt = Some(m_solve);
            (result, cs.n_free_indep, Vec::new())
        } else {
            let result = lanczos_generalized_eigen_sparse(&k_ff, &m_csc, num_modes, 0.0)
                .ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(k_ff.n))?;
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
        let result = lanczos_generalized_eigen(&k_solve, &m_solve, ns, num_modes, 0.0)
            .ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(ns))?;
        (result, ns, m_solve)
    };

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
        None => (m_r_x, m_r_y),
    };

    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        // ∞: a massless direction (lumped-mass rotations), not a mode.
        if eigenvalue <= 1e-10 || !eigenvalue.is_finite() || modes.len() >= num_modes {
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
            cs.expand_solution(&phi_s)
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
    // Curved beams become segments first, as in `solve_3d`: assembled from the
    // unexpanded model they were silently left out.
    let input = &super::linear::expand_curved_beams_3d(input);
    super::linear::validate_input_3d(input)?;
    // Curved beams are expanded into straight members, as every static path
    // does; left in place they were not part of the model at all.
    let expanded = (!input.curved_beams.is_empty()).then(|| super::linear::expand_curved_beams_3d(input));
    let input = expanded.as_ref().unwrap_or(input);
    super::dynamic_validation::validate_mass_3d(input, densities)?;
    if num_modes == 0 {
        return Err("num_modes must be >= 1".to_string());
    }
    let dof_num = DofNumbering::build_3d(input);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

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
    let result = lanczos_generalized_eigen_sparse(k_solve, m_solve, num_modes, 0.0)
        .ok_or_else(|| crate::linalg::lanczos::eigen_failure_message(k_solve.n))?;

    let num_modes = num_modes.min(ns);

    // L = Cᵀ(M·r)_f, the reduced inertial load of a unit rigid translation
    // along X, Y, Z, with the support-coupled inertia M_fr·r_r included — see
    // the 2D solver. Cᵀr also put the eccentricities of a diaphragm's nodes on
    // the master's θz, a torsional participation no rigid translation has.
    // The full mass is assembled once, only if some support moves with the ground.
    let m_full_cell: std::cell::OnceCell<CscMatrix> = std::cell::OnceCell::new();
    let m_r = |local: usize| {
        let mr = ground_influence(&dof_num, local, its, &m_sparse_ff, || {
            m_full_cell.get_or_init(|| super::mass_matrix::assemble_mass_matrix_3d_sparse_block(input, &dof_num, densities, n))
        });
        match &cs { Some(cs) => cs.reduce_vector(&mr), None => mr }
    };
    let (l_x, l_y, l_z) = (m_r(0), m_r(1), m_r(2));

    let mut modes = Vec::new();
    let mut cum_mrx = 0.0;
    let mut cum_mry = 0.0;
    let mut cum_mrz = 0.0;

    let n_converged = result.values.len();
    for idx in 0..n_converged {
        let eigenvalue = result.values[idx];
        // ∞: a massless direction (lumped-mass rotations), not a mode.
        if eigenvalue <= 1e-10 || !eigenvalue.is_finite() || modes.len() >= num_modes { continue; }

        let omega = eigenvalue.sqrt();
        let freq = omega / (2.0 * std::f64::consts::PI);
        let period = if freq > 1e-20 { 1.0 / freq } else { f64::INFINITY };

        let phi_s: Vec<f64> = (0..ns).map(|i| result.vectors[i * n_converged + idx]).collect();

        let m_phi = m_solve.sym_mat_vec(&phi_s);
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
            cs.expand_solution(&phi_s)
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
