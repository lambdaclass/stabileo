/// Model reduction / substructuring.
///
/// Implements:
/// - Guyan (static) condensation: eliminates interior DOFs using K partitioning
/// - Craig-Bampton: retains boundary DOFs + interior modal DOFs
///
/// References:
/// - Guyan, R.J. (1965). "Reduction of stiffness and mass matrices"
/// - Craig & Bampton (1968). "Coupling of substructures for dynamic analyses"
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::constraints::FreeConstraintSystem;

use serde::{Serialize, Deserialize};

/// Guyan reduction input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuyanInput {
    pub solver: SolverInput,
    /// Boundary (retained) node IDs
    pub boundary_nodes: Vec<usize>,
}

/// Guyan reduction input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuyanInput3D {
    pub solver: SolverInput3D,
    pub boundary_nodes: Vec<usize>,
}

/// Result of Guyan reduction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuyanResult {
    /// Condensed stiffness matrix (n_boundary × n_boundary, row-major)
    pub k_condensed: Vec<f64>,
    /// Condensed force vector (n_boundary)
    pub f_condensed: Vec<f64>,
    /// Condensed mass matrix (n_boundary × n_boundary, row-major), if mass available
    #[serde(default)]
    pub m_condensed: Vec<f64>,
    /// Boundary DOF count
    pub n_boundary: usize,
    /// Interior DOF count (eliminated)
    pub n_interior: usize,
    /// Boundary DOF indices in original numbering
    pub boundary_dofs: Vec<usize>,
    /// Full solution (all DOFs) recovered from condensed solve
    pub displacements: Vec<Displacement>,
    pub reactions: Vec<Reaction>,
    pub element_forces: Vec<ElementForces>,
}

/// Result of 3D Guyan reduction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuyanResult3D {
    pub k_condensed: Vec<f64>,
    pub f_condensed: Vec<f64>,
    #[serde(default)]
    pub m_condensed: Vec<f64>,
    pub n_boundary: usize,
    pub n_interior: usize,
    pub boundary_dofs: Vec<usize>,
    pub displacements: Vec<Displacement3D>,
    pub reactions: Vec<Reaction3D>,
    pub element_forces: Vec<ElementForces3D>,
}

/// Craig-Bampton input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraigBamptonInput {
    pub solver: SolverInput,
    pub boundary_nodes: Vec<usize>,
    /// Number of interior modes to retain
    #[serde(default = "default_n_modes")]
    pub n_modes: usize,
    /// Material densities per material_id for mass matrix
    pub densities: std::collections::HashMap<String, f64>,
}

/// Craig-Bampton input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraigBamptonInput3D {
    pub solver: SolverInput3D,
    pub boundary_nodes: Vec<usize>,
    #[serde(default = "default_n_modes")]
    pub n_modes: usize,
    pub densities: std::collections::HashMap<String, f64>,
}

fn default_n_modes() -> usize { 10 }

/// Craig-Bampton result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CraigBamptonResult {
    /// Reduced stiffness matrix (n_reduced × n_reduced)
    pub k_reduced: Vec<f64>,
    /// Reduced mass matrix (n_reduced × n_reduced)
    pub m_reduced: Vec<f64>,
    /// n_reduced = n_boundary + n_modes_kept
    pub n_reduced: usize,
    pub n_boundary: usize,
    pub n_modes_kept: usize,
    /// Interior mode frequencies (Hz)
    pub interior_frequencies: Vec<f64>,
    /// Boundary DOF indices
    pub boundary_dofs: Vec<usize>,
}

/// Factorize K_II via Cholesky (K_II is SPD for interior stiffness of constrained structures).
/// Returns the L factor in-place in the cloned array.
fn factorize_kii(k_ii: &[f64], ni: usize) -> Result<Vec<f64>, String> {
    let mut l = k_ii.to_vec();
    if !cholesky_decompose(&mut l, ni) {
        return Err("K_II is not positive definite".into());
    }
    Ok(l)
}

/// Solve L*L^T * x = rhs using pre-computed Cholesky factor L.
fn chol_solve(l: &[f64], rhs: &[f64], n: usize) -> Vec<f64> {
    let y = forward_solve(l, rhs, n);
    back_solve(l, &y, n)
}

/// Perform Guyan (static) condensation on a 2D model.
///
/// Partitions free DOFs into boundary (B) and interior (I):
///   K = [K_BB  K_BI]    F = [F_B]
///       [K_IB  K_II]        [F_I]
///
/// Condensed: K_c = K_BB - K_BI * K_II^{-1} * K_IB
///            F_c = F_B  - K_BI * K_II^{-1} * F_I
///
/// Recovery: u_I = K_II^{-1} * (F_I - K_IB * u_B)
pub fn guyan_reduce_2d(input: &GuyanInput) -> Result<GuyanResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let asm = assembly::assemble_2d(&input.solver, &dof_num);

    // Extract free-free matrices
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff_raw = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let f_f_raw: Vec<f64> = asm.f[..nf].to_vec();

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_ff, f_f) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff_raw), cs.reduce_vector(&f_f_raw))
    } else {
        (k_ff_raw, f_f_raw)
    };

    // Classify reduced DOFs into boundary and interior
    // Map boundary nodes to reduced DOF indices
    let rmap = cs.as_ref().map(|c| c.map_reduced_to_physical());
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();

    for i in 0..ns {
        // Map reduced DOF i back to physical free DOF
        let phys_dof = rmap.as_ref().map_or(i, |m| m[i]);
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == phys_dof && input.boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }

    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();

    if nb == 0 { return Err("No boundary DOFs found".into()); }
    if ni == 0 { return Err("No interior DOFs to condense".into()); }

    // Extract submatrices from reduced system
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);

    let f_b: Vec<f64> = boundary_dofs.iter().map(|&d| f_f[d]).collect();
    let f_i: Vec<f64> = interior_dofs.iter().map(|&d| f_f[d]).collect();

    // Factorize K_II once via Cholesky (K_II is SPD)
    let l_ii = factorize_kii(&k_ii, ni)?;

    // Solve K_II^{-1} * F_I
    let kii_inv_fi = chol_solve(&l_ii, &f_i, ni);

    // Solve K_II^{-1} * K_IB column by column (reuses factorization)
    let mut kii_inv_kib = vec![0.0; ni * nb]; // ni × nb
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let sol = chol_solve(&l_ii, &col, ni);
        for i in 0..ni {
            kii_inv_kib[i * nb + j] = sol[i];
        }
    }

    // K_condensed = K_BB - K_BI * (K_II^{-1} * K_IB)
    let mut k_condensed = k_bb.clone();
    for i in 0..nb {
        for j in 0..nb {
            let mut sum = 0.0;
            for p in 0..ni {
                sum += k_bi[i * ni + p] * kii_inv_kib[p * nb + j];
            }
            k_condensed[i * nb + j] -= sum;
        }
    }

    // F_condensed = F_B - K_BI * (K_II^{-1} * F_I)
    let mut f_condensed = f_b.clone();
    for i in 0..nb {
        let mut sum = 0.0;
        for p in 0..ni {
            sum += k_bi[i * ni + p] * kii_inv_fi[p];
        }
        f_condensed[i] -= sum;
    }

    // Solve condensed system: K_c * u_B = F_c
    let u_b = {
        let mut k_work = k_condensed.clone();
        let mut f_work = f_condensed.clone();
        lu_solve(&mut k_work, &mut f_work, nb)
            .ok_or("Condensed system is singular")?
    };

    // Recover interior DOFs: u_I = K_II^{-1} * (F_I - K_IB * u_B)
    let mut rhs_i = f_i;
    for i in 0..ni {
        let mut sum = 0.0;
        for j in 0..nb {
            sum += k_ib[i * nb + j] * u_b[j];
        }
        rhs_i[i] -= sum;
    }
    let u_i = chol_solve(&l_ii, &rhs_i, ni);

    // Reconstruct reduced DOF displacement vector
    let mut u_reduced = vec![0.0; ns];
    for (local, &rdof) in boundary_dofs.iter().enumerate() {
        u_reduced[rdof] = u_b[local];
    }
    for (local, &rdof) in interior_dofs.iter().enumerate() {
        u_reduced[rdof] = u_i[local];
    }

    // Expand through constraint system to full free DOFs
    let u_f = if let Some(ref cs) = cs {
        cs.expand_solution(&u_reduced)
    } else {
        u_reduced
    };

    // Build full displacement vector
    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }

    // Build results
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    // Compute reactions: R = K_rf * u_f + K_rr * u_r - F_r
    let nr = n - nf;
    let free_idx2: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let u_r = vec![0.0; nr]; // no prescribed displacements in reduction
    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx2);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i];
    }
    let reactions = super::linear::build_reactions_2d(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full,
    );

    Ok(GuyanResult {
        k_condensed,
        f_condensed,
        m_condensed: vec![],
        n_boundary: nb,
        n_interior: ni,
        boundary_dofs,
        displacements,
        reactions,
        element_forces,
    })
}

/// Perform Craig-Bampton reduction on a 2D model.
///
/// The reduced system has DOFs: [u_B, q_m] where
///   u_B = boundary DOF displacements
///   q_m = interior modal coordinates (first n_modes)
///
/// Transformation: u = [I       0   ] [u_B]
///                     [Ψ_s    Φ_m  ] [q_m]
/// where Ψ_s = -K_II^{-1} K_IB (constraint modes)
///       Φ_m = first n_modes eigenvectors of K_II with respect to M_II
pub fn craig_bampton_2d(input: &CraigBamptonInput) -> Result<CraigBamptonResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let asm = assembly::assemble_2d(&input.solver, &dof_num);

    // Build mass matrix
    let m_full = super::mass_matrix::assemble_mass_matrix_2d(&input.solver, &dof_num, &input.densities);

    // Extract free-free matrices
    let free_idx: Vec<usize> = (0..nf).collect();
    let k_ff_raw = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let m_ff_raw = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    // Apply constraint reduction if constraints present
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_ff, m_ff) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff_raw), cs.reduce_matrix(&m_ff_raw))
    } else {
        (k_ff_raw, m_ff_raw)
    };

    // Classify reduced DOFs into boundary and interior
    let rmap = cs.as_ref().map(|c| c.map_reduced_to_physical());
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();

    for i in 0..ns {
        let phys_dof = rmap.as_ref().map_or(i, |m| m[i]);
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == phys_dof && input.boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }

    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();

    if nb == 0 { return Err("No boundary DOFs".into()); }
    if ni == 0 { return Err("No interior DOFs".into()); }

    let n_modes = input.n_modes.min(ni);

    // Extract submatrices from reduced system
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);

    let m_bb = extract_submatrix(&m_ff, ns, &boundary_dofs, &boundary_dofs);
    let m_bi = extract_submatrix(&m_ff, ns, &boundary_dofs, &interior_dofs);
    let m_ib = extract_submatrix(&m_ff, ns, &interior_dofs, &boundary_dofs);
    let m_ii = extract_submatrix(&m_ff, ns, &interior_dofs, &interior_dofs);

    // Factorize K_II once via Cholesky (K_II is SPD)
    let l_ii = factorize_kii(&k_ii, ni)?;

    // Compute constraint modes: Ψ_s = -K_II^{-1} * K_IB (ni × nb)
    let mut psi_s = vec![0.0; ni * nb];
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let sol = chol_solve(&l_ii, &col, ni);
        for i in 0..ni {
            psi_s[i * nb + j] = -sol[i];
        }
    }

    // Interior eigenproblem: K_II * φ = ω² * M_II * φ
    // Use Lanczos shift-invert (factorizes K_II, not M_II) — works even if M_II is singular
    let eigen = lanczos_generalized_eigen(&k_ii, &m_ii, ni, n_modes, 0.0)
        .ok_or("Interior eigenvalue decomposition failed")?;

    // Lanczos returns eigenvalues sorted ascending, already filtered to n_modes
    let n_modes = n_modes.min(eigen.values.len());
    let nk = eigen.values.len();

    // Φ_m: ni × n_modes
    let mut phi_m = vec![0.0; ni * n_modes];
    let mut frequencies = Vec::new();

    for m in 0..n_modes {
        let eigenval = eigen.values[m];
        let freq = if eigenval > 1e-12 {
            eigenval.sqrt() / (2.0 * std::f64::consts::PI)
        } else {
            0.0
        };
        frequencies.push(freq);

        // Normalize eigenvector
        let mut max_val = 0.0f64;
        for i in 0..ni {
            let v = eigen.vectors[i * nk + m].abs();
            if v > max_val { max_val = v; }
        }
        for i in 0..ni {
            phi_m[i * n_modes + m] = if max_val > 1e-20 {
                eigen.vectors[i * nk + m] / max_val
            } else {
                0.0
            };
        }
    }

    // Build reduced matrices
    // T = [I       0   ]  (nb+ni) × (nb+n_modes)
    //     [Ψ_s    Φ_m  ]
    //
    // K_reduced = T^T * K * T
    // M_reduced = T^T * M * T

    let nr = nb + n_modes;

    // K_II * Φ_m (ni × n_modes)
    let mut k_ii_phi = vec![0.0; ni * n_modes];
    for i in 0..ni {
        for m in 0..n_modes {
            let mut s = 0.0;
            for p in 0..ni {
                s += k_ii[i * ni + p] * phi_m[p * n_modes + m];
            }
            k_ii_phi[i * n_modes + m] = s;
        }
    }

    // K_II * Ψ_s (ni × nb)
    let mut k_ii_psi = vec![0.0; ni * nb];
    for i in 0..ni {
        for j in 0..nb {
            let mut s = 0.0;
            for p in 0..ni {
                s += k_ii[i * ni + p] * psi_s[p * nb + j];
            }
            k_ii_psi[i * nb + j] = s;
        }
    }

    let mut k_reduced = vec![0.0; nr * nr];

    // BB block: K_BB + K_BI*Ψ_s + Ψ_s^T*K_IB + Ψ_s^T*K_II*Ψ_s
    for i in 0..nb {
        for j in 0..nb {
            let mut val = k_bb[i * nb + j];
            for p in 0..ni {
                val += k_bi[i * ni + p] * psi_s[p * nb + j];
                val += psi_s[p * nb + i] * k_ib[p * nb + j];
            }
            for p in 0..ni {
                val += psi_s[p * nb + i] * k_ii_psi[p * nb + j];
            }
            k_reduced[i * nr + j] = val;
        }
    }

    // BM block: K_BI*Φ_m + Ψ_s^T*K_II*Φ_m
    for i in 0..nb {
        for m in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += k_bi[i * ni + p] * phi_m[p * n_modes + m];
                val += psi_s[p * nb + i] * k_ii_phi[p * n_modes + m];
            }
            k_reduced[i * nr + (nb + m)] = val;
            k_reduced[(nb + m) * nr + i] = val; // symmetric
        }
    }

    // MM block: Φ_m^T * K_II * Φ_m (should be diagonal = eigenvalues)
    for m1 in 0..n_modes {
        for m2 in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += phi_m[p * n_modes + m1] * k_ii_phi[p * n_modes + m2];
            }
            k_reduced[(nb + m1) * nr + (nb + m2)] = val;
        }
    }

    // Same for mass matrix
    let mut m_ii_phi = vec![0.0; ni * n_modes];
    for i in 0..ni {
        for m in 0..n_modes {
            let mut s = 0.0;
            for p in 0..ni {
                s += m_ii[i * ni + p] * phi_m[p * n_modes + m];
            }
            m_ii_phi[i * n_modes + m] = s;
        }
    }

    let mut m_ii_psi = vec![0.0; ni * nb];
    for i in 0..ni {
        for j in 0..nb {
            let mut s = 0.0;
            for p in 0..ni {
                s += m_ii[i * ni + p] * psi_s[p * nb + j];
            }
            m_ii_psi[i * nb + j] = s;
        }
    }

    let mut m_reduced = vec![0.0; nr * nr];

    // BB block
    for i in 0..nb {
        for j in 0..nb {
            let mut val = m_bb[i * nb + j];
            for p in 0..ni {
                val += m_bi[i * ni + p] * psi_s[p * nb + j];
                val += psi_s[p * nb + i] * m_ib[p * nb + j];
            }
            for p in 0..ni {
                val += psi_s[p * nb + i] * m_ii_psi[p * nb + j];
            }
            m_reduced[i * nr + j] = val;
        }
    }

    // BM block
    for i in 0..nb {
        for m in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += m_bi[i * ni + p] * phi_m[p * n_modes + m];
                val += psi_s[p * nb + i] * m_ii_phi[p * n_modes + m];
            }
            m_reduced[i * nr + (nb + m)] = val;
            m_reduced[(nb + m) * nr + i] = val;
        }
    }

    // MM block (should be identity if modes are M-orthonormalized)
    for m1 in 0..n_modes {
        for m2 in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += phi_m[p * n_modes + m1] * m_ii_phi[p * n_modes + m2];
            }
            m_reduced[(nb + m1) * nr + (nb + m2)] = val;
        }
    }

    Ok(CraigBamptonResult {
        k_reduced,
        m_reduced,
        n_reduced: nr,
        n_boundary: nb,
        n_modes_kept: n_modes,
        interior_frequencies: frequencies,
        boundary_dofs,
    })
}

// ==================== 3D Guyan Reduction ====================

/// Perform Guyan (static) condensation on a 3D model.
pub fn guyan_reduce_3d(input: &GuyanInput3D) -> Result<GuyanResult3D, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let sasm = assembly::assemble_sparse_3d(&input.solver, &dof_num, false);
    let k_ff_raw = sasm.k_ff.to_dense_symmetric();
    let f_f_raw: Vec<f64> = sasm.f[..nf].to_vec();

    // Apply constraint reduction
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_ff, f_f) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff_raw), cs.reduce_vector(&f_f_raw))
    } else {
        (k_ff_raw, f_f_raw)
    };

    // Classify reduced DOFs into boundary and interior
    let rmap = cs.as_ref().map(|c| c.map_reduced_to_physical());
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();

    for i in 0..ns {
        let phys_dof = rmap.as_ref().map_or(i, |m| m[i]);
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == phys_dof && input.boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }

    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();

    if nb == 0 { return Err("No boundary DOFs found".into()); }
    if ni == 0 { return Err("No interior DOFs to condense".into()); }

    // Extract submatrices from reduced system
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);

    let f_b: Vec<f64> = boundary_dofs.iter().map(|&d| f_f[d]).collect();
    let f_i: Vec<f64> = interior_dofs.iter().map(|&d| f_f[d]).collect();

    // Factorize K_II once via Cholesky (K_II is SPD)
    let l_ii = factorize_kii(&k_ii, ni)?;

    // Solve K_II^{-1} * F_I
    let kii_inv_fi = chol_solve(&l_ii, &f_i, ni);

    // Solve K_II^{-1} * K_IB column by column (reuses factorization)
    let mut kii_inv_kib = vec![0.0; ni * nb];
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let sol = chol_solve(&l_ii, &col, ni);
        for i in 0..ni {
            kii_inv_kib[i * nb + j] = sol[i];
        }
    }

    // K_condensed = K_BB - K_BI * (K_II^{-1} * K_IB)
    let mut k_condensed = k_bb.clone();
    for i in 0..nb {
        for j in 0..nb {
            let mut sum = 0.0;
            for p in 0..ni {
                sum += k_bi[i * ni + p] * kii_inv_kib[p * nb + j];
            }
            k_condensed[i * nb + j] -= sum;
        }
    }

    // F_condensed = F_B - K_BI * (K_II^{-1} * F_I)
    let mut f_condensed = f_b.clone();
    for i in 0..nb {
        let mut sum = 0.0;
        for p in 0..ni {
            sum += k_bi[i * ni + p] * kii_inv_fi[p];
        }
        f_condensed[i] -= sum;
    }

    // Solve condensed system
    let u_b = {
        let mut k_work = k_condensed.clone();
        let mut f_work = f_condensed.clone();
        lu_solve(&mut k_work, &mut f_work, nb)
            .ok_or("Condensed system is singular")?
    };

    // Recover interior DOFs
    let mut rhs_i = f_i;
    for i in 0..ni {
        let mut sum = 0.0;
        for j in 0..nb {
            sum += k_ib[i * nb + j] * u_b[j];
        }
        rhs_i[i] -= sum;
    }
    let u_i = chol_solve(&l_ii, &rhs_i, ni);

    // Reconstruct reduced DOF vector
    let mut u_reduced = vec![0.0; ns];
    for (local, &rdof) in boundary_dofs.iter().enumerate() {
        u_reduced[rdof] = u_b[local];
    }
    for (local, &rdof) in interior_dofs.iter().enumerate() {
        u_reduced[rdof] = u_i[local];
    }

    // Expand through constraint system
    let u_f = if let Some(ref cs) = cs {
        cs.expand_solution(&u_reduced)
    } else {
        u_reduced
    };

    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }

    // Build 3D results
    let displacements = super::linear::build_displacements_3d(&dof_num, &u_full);

    // Compute reactions: R = K_rf * u_f - F_r
    let sasm_full = assembly::assemble_sparse_3d(&input.solver, &dof_num, true);
    let nr = n - nf;
    let reactions = if nr > 0 {
        if let Some(ref k_full) = sasm_full.k_full {
            let k_full_dense = k_full.to_dense_symmetric();
            let free_idx2: Vec<usize> = (0..nf).collect();
            let rest_idx: Vec<usize> = (nf..n).collect();
            let k_rf = extract_submatrix(&k_full_dense, n, &rest_idx, &free_idx2);
            let f_r = extract_subvec(&sasm_full.f, &rest_idx);
            let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
            let mut reactions_vec = vec![0.0; nr];
            for i in 0..nr {
                reactions_vec[i] = k_rf_uf[i] - f_r[i];
            }
            super::linear::build_reactions_3d(
                &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full,
            )
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    Ok(GuyanResult3D {
        k_condensed,
        f_condensed,
        m_condensed: vec![],
        n_boundary: nb,
        n_interior: ni,
        boundary_dofs,
        displacements,
        reactions,
        element_forces: vec![],
    })
}

// ==================== 3D Craig-Bampton ====================

/// Perform Craig-Bampton reduction on a 3D model.
pub fn craig_bampton_3d(input: &CraigBamptonInput3D) -> Result<CraigBamptonResult, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;

    if nf == 0 { return Err("No free DOFs".into()); }

    let sasm = assembly::assemble_sparse_3d(&input.solver, &dof_num, false);
    let k_ff_raw = sasm.k_ff.to_dense_symmetric();
    let m_full = super::mass_matrix::assemble_mass_matrix_3d(&input.solver, &dof_num, &input.densities);

    // Extract free-free matrices
    let free_idx: Vec<usize> = (0..nf).collect();
    let m_ff_raw = extract_submatrix(&m_full, n, &free_idx, &free_idx);

    // Apply constraint reduction
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let (k_ff, m_ff) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff_raw), cs.reduce_matrix(&m_ff_raw))
    } else {
        (k_ff_raw, m_ff_raw)
    };

    // Classify reduced DOFs
    let rmap = cs.as_ref().map(|c| c.map_reduced_to_physical());
    let mut boundary_dofs = Vec::new();
    let mut interior_dofs = Vec::new();

    for i in 0..ns {
        let phys_dof = rmap.as_ref().map_or(i, |m| m[i]);
        let is_boundary = dof_num.map.iter().any(|(&(nid, _), &gdof)| {
            gdof == phys_dof && input.boundary_nodes.contains(&nid)
        });
        if is_boundary {
            boundary_dofs.push(i);
        } else {
            interior_dofs.push(i);
        }
    }

    let nb = boundary_dofs.len();
    let ni = interior_dofs.len();

    if nb == 0 { return Err("No boundary DOFs".into()); }
    if ni == 0 { return Err("No interior DOFs".into()); }

    let n_modes = input.n_modes.min(ni);

    // Extract submatrices from reduced system
    let k_bb = extract_submatrix(&k_ff, ns, &boundary_dofs, &boundary_dofs);
    let k_bi = extract_submatrix(&k_ff, ns, &boundary_dofs, &interior_dofs);
    let k_ib = extract_submatrix(&k_ff, ns, &interior_dofs, &boundary_dofs);
    let k_ii = extract_submatrix(&k_ff, ns, &interior_dofs, &interior_dofs);

    let m_bb = extract_submatrix(&m_ff, ns, &boundary_dofs, &boundary_dofs);
    let m_bi = extract_submatrix(&m_ff, ns, &boundary_dofs, &interior_dofs);
    let m_ib = extract_submatrix(&m_ff, ns, &interior_dofs, &boundary_dofs);
    let m_ii = extract_submatrix(&m_ff, ns, &interior_dofs, &interior_dofs);

    // Factorize K_II once via Cholesky (K_II is SPD)
    let l_ii = factorize_kii(&k_ii, ni)?;

    // Constraint modes: Ψ_s = -K_II^{-1} * K_IB (reuses factorization)
    let mut psi_s = vec![0.0; ni * nb];
    for j in 0..nb {
        let col: Vec<f64> = (0..ni).map(|i| k_ib[i * nb + j]).collect();
        let sol = chol_solve(&l_ii, &col, ni);
        for i in 0..ni {
            psi_s[i * nb + j] = -sol[i];
        }
    }

    // Interior eigenproblem: K_II * φ = ω² * M_II * φ
    // Use Lanczos shift-invert (factorizes K_II, not M_II) — works even if M_II is singular
    let eigen = lanczos_generalized_eigen(&k_ii, &m_ii, ni, n_modes, 0.0)
        .ok_or("Interior eigenvalue decomposition failed")?;

    let n_modes = n_modes.min(eigen.values.len());
    let nk = eigen.values.len();

    // Φ_m: ni × n_modes
    let mut phi_m = vec![0.0; ni * n_modes];
    let mut frequencies = Vec::new();

    for m in 0..n_modes {
        let eigenval = eigen.values[m];
        let freq = if eigenval > 1e-12 {
            eigenval.sqrt() / (2.0 * std::f64::consts::PI)
        } else {
            0.0
        };
        frequencies.push(freq);

        let mut max_val = 0.0f64;
        for i in 0..ni {
            let v = eigen.vectors[i * nk + m].abs();
            if v > max_val { max_val = v; }
        }
        for i in 0..ni {
            phi_m[i * n_modes + m] = if max_val > 1e-20 {
                eigen.vectors[i * nk + m] / max_val
            } else {
                0.0
            };
        }
    }

    // Build reduced matrices (same algebra as 2D)
    let nr = nb + n_modes;

    let mut k_ii_phi = vec![0.0; ni * n_modes];
    for i in 0..ni {
        for m in 0..n_modes {
            let mut s = 0.0;
            for p in 0..ni { s += k_ii[i * ni + p] * phi_m[p * n_modes + m]; }
            k_ii_phi[i * n_modes + m] = s;
        }
    }

    let mut k_ii_psi = vec![0.0; ni * nb];
    for i in 0..ni {
        for j in 0..nb {
            let mut s = 0.0;
            for p in 0..ni { s += k_ii[i * ni + p] * psi_s[p * nb + j]; }
            k_ii_psi[i * nb + j] = s;
        }
    }

    let mut k_reduced = vec![0.0; nr * nr];

    // BB block
    for i in 0..nb {
        for j in 0..nb {
            let mut val = k_bb[i * nb + j];
            for p in 0..ni {
                val += k_bi[i * ni + p] * psi_s[p * nb + j];
                val += psi_s[p * nb + i] * k_ib[p * nb + j];
            }
            for p in 0..ni { val += psi_s[p * nb + i] * k_ii_psi[p * nb + j]; }
            k_reduced[i * nr + j] = val;
        }
    }

    // BM block
    for i in 0..nb {
        for m in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += k_bi[i * ni + p] * phi_m[p * n_modes + m];
                val += psi_s[p * nb + i] * k_ii_phi[p * n_modes + m];
            }
            k_reduced[i * nr + (nb + m)] = val;
            k_reduced[(nb + m) * nr + i] = val;
        }
    }

    // MM block
    for m1 in 0..n_modes {
        for m2 in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni { val += phi_m[p * n_modes + m1] * k_ii_phi[p * n_modes + m2]; }
            k_reduced[(nb + m1) * nr + (nb + m2)] = val;
        }
    }

    // Mass reduced matrices
    let mut m_ii_phi = vec![0.0; ni * n_modes];
    for i in 0..ni {
        for m in 0..n_modes {
            let mut s = 0.0;
            for p in 0..ni { s += m_ii[i * ni + p] * phi_m[p * n_modes + m]; }
            m_ii_phi[i * n_modes + m] = s;
        }
    }

    let mut m_ii_psi = vec![0.0; ni * nb];
    for i in 0..ni {
        for j in 0..nb {
            let mut s = 0.0;
            for p in 0..ni { s += m_ii[i * ni + p] * psi_s[p * nb + j]; }
            m_ii_psi[i * nb + j] = s;
        }
    }

    let mut m_reduced = vec![0.0; nr * nr];

    for i in 0..nb {
        for j in 0..nb {
            let mut val = m_bb[i * nb + j];
            for p in 0..ni {
                val += m_bi[i * ni + p] * psi_s[p * nb + j];
                val += psi_s[p * nb + i] * m_ib[p * nb + j];
            }
            for p in 0..ni { val += psi_s[p * nb + i] * m_ii_psi[p * nb + j]; }
            m_reduced[i * nr + j] = val;
        }
    }

    for i in 0..nb {
        for m in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni {
                val += m_bi[i * ni + p] * phi_m[p * n_modes + m];
                val += psi_s[p * nb + i] * m_ii_phi[p * n_modes + m];
            }
            m_reduced[i * nr + (nb + m)] = val;
            m_reduced[(nb + m) * nr + i] = val;
        }
    }

    for m1 in 0..n_modes {
        for m2 in 0..n_modes {
            let mut val = 0.0;
            for p in 0..ni { val += phi_m[p * n_modes + m1] * m_ii_phi[p * n_modes + m2]; }
            m_reduced[(nb + m1) * nr + (nb + m2)] = val;
        }
    }

    Ok(CraigBamptonResult {
        k_reduced,
        m_reduced,
        n_reduced: nr,
        n_boundary: nb,
        n_modes_kept: n_modes,
        interior_frequencies: frequencies,
        boundary_dofs,
    })
}
