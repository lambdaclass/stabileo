use crate::types::*;
use crate::linalg::*;
use crate::element::*;
use super::dof::DofNumbering;
use super::assembly;
use super::constraints::FreeConstraintSystem;

/// Solve a 2D frame using co-rotational large displacement analysis.
///
/// This wraps the existing linear element formulations, rebuilding
/// transformations from deformed geometry at each Newton-Raphson iteration.
/// Uses incremental-iterative loading with Newton-Raphson inner loops.
pub fn solve_corotational_2d(
    input: &SolverInput,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    modified_nr: bool,
) -> Result<CorotationalResult, String> {
    let dof_num = DofNumbering::build_2d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Get the full external load vector from linear assembly (reference load)
    let asm = assembly::assemble_2d(input, &dof_num);
    let f_total = asm.f.clone();

    // Global displacement vector (starts at zero)
    let mut u_full = vec![0.0; n];

    let mut total_iterations = 0;
    let mut converged = true;

    // Incremental-iterative procedure
    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;

        // Scaled external forces for this increment
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        // Newton-Raphson inner loop
        let mut nr_converged = false;
        let mut cached_factor: Option<CachedCholeskyFactor> = None;
        for _iter in 0..max_iter {
            total_iterations += 1;

            // Compute internal forces and tangent stiffness from co-rotational formulation
            let mut f_int = vec![0.0; n];
            let mut k_t = vec![0.0; n * n];

            assemble_corotational(input, &dof_num, &u_full, &mut f_int, &mut k_t);

            // Add spring stiffness contributions to K_T and f_int
            add_spring_contributions(input, &dof_num, &u_full, &mut f_int, &mut k_t);

            // Residual R = F_ext - f_int
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Reduce residual and check convergence on independent DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let r_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f.clone()
            };
            let f_ext_f: Vec<f64> = f_ext[..nf].to_vec();
            let f_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&f_ext_f)
            } else {
                f_ext_f
            };

            let r_norm: f64 = r_check.iter().map(|v| v * v).sum::<f64>().sqrt();
            let f_norm: f64 = f_check.iter().map(|v| v * v).sum::<f64>().sqrt();

            let rel_error = if f_norm > 1e-30 {
                r_norm / f_norm
            } else {
                r_norm
            };

            if rel_error < tolerance {
                nr_converged = true;
                break;
            }

            // Solve K_T * delta_u = R for free DOFs
            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if modified_nr {
                if let Some(ref factor) = cached_factor {
                    solve_with_cholesky_factor(&factor.l, &r_s, factor.n)
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    match try_cholesky_factor(&k_s, ns) {
                        Some(factor) => {
                            let result = solve_with_cholesky_factor(&factor.l, &r_s, factor.n);
                            cached_factor = Some(factor);
                            result
                        }
                        None => {
                            // Cholesky failed — fall back to full NR for this increment
                            solve_free_dofs(&k_s, &r_s, ns)?
                        }
                    }
                }
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                solve_free_dofs(&k_s, &r_s, ns)?
            };

            let delta_u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            // Update displacements (free DOFs only)
            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    // Find max displacement magnitude
    let max_displacement = compute_max_displacement(&dof_num, &u_full);

    // Build final results using existing infrastructure
    let results = build_final_results(input, &dof_num, &u_full, &cs)?;

    Ok(CorotationalResult {
        results,
        iterations: total_iterations,
        converged,
        load_increments: n_increments,
        max_displacement,
    })
}

/// Public entry point for co-rotational assembly (used by arc-length solver).
pub fn assemble_corotational_public(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    assemble_corotational(input, dof_num, u_full, f_int, k_t);
}

/// Assemble co-rotational internal forces and tangent stiffness for all elements.
fn assemble_corotational(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0; // MPa -> kN/m^2

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            assemble_truss_corotational(
                dof_num, elem, node_i, node_j, e, sec.a,
                u_full, f_int, k_t, n,
            );
        } else {
            assemble_frame_corotational(
                dof_num, elem, node_i, node_j, e, sec.a, sec.iz,
                u_full, f_int, k_t, n,
            );
        }
    }
}

/// Co-rotational treatment for a 2D truss element.
fn assemble_truss_corotational(
    dof_num: &DofNumbering,
    elem: &SolverElement,
    node_i: &SolverNode,
    node_j: &SolverNode,
    e: f64,
    a: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    n: usize,
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

    let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| u_full[d]).unwrap_or(0.0);
    let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| u_full[d]).unwrap_or(0.0);
    let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| u_full[d]).unwrap_or(0.0);
    let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| u_full[d]).unwrap_or(0.0);

    let dx_n = (node_j.x + u_xj) - (node_i.x + u_xi);
    let dy_n = (node_j.y + u_yj) - (node_i.y + u_yi);
    let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();

    if l_n < 1e-15 {
        return;
    }

    let c = dx_n / l_n;
    let s = dy_n / l_n;

    let d_axial = l_n - l0;
    let axial_force = e * a / l0 * d_axial;

    // Internal force: f = N * r, where r = [-c, -s, c, s]
    let r = [-c, -s, c, s];

    let truss_dofs = [
        dof_num.global_dof(elem.node_i, 0).unwrap(),
        dof_num.global_dof(elem.node_i, 1).unwrap(),
        dof_num.global_dof(elem.node_j, 0).unwrap(),
        dof_num.global_dof(elem.node_j, 1).unwrap(),
    ];

    for i in 0..4 {
        f_int[truss_dofs[i]] += axial_force * r[i];
    }

    // Tangent: K = (EA/L0) * r*r^T + (N/L_n) * (z_mat - r*r^T)
    let ea_l0 = e * a / l0;
    let n_over_l = axial_force / l_n;

    for i in 0..4 {
        for j in 0..4 {
            let k_mat = ea_l0 * r[i] * r[j];
            // z_ij for the block-structured identity
            let sign_i = if i < 2 { -1.0 } else { 1.0 };
            let sign_j = if j < 2 { -1.0 } else { 1.0 };
            let delta = if i % 2 == j % 2 { 1.0 } else { 0.0 };
            let z_ij = sign_i * sign_j * delta;
            let k_geo = n_over_l * (z_ij - r[i] * r[j]);

            k_t[truss_dofs[i] * n + truss_dofs[j]] += k_mat + k_geo;
        }
    }
}

/// Co-rotational treatment for a 2D frame element using the B-matrix formulation.
///
/// Natural deformations: d_n = [d_axial, theta_i_local, theta_j_local]
/// B matrix (3x6): maps 6 global element DOFs to 3 natural deformations.
/// Internal force: f_global = B^T * q, where q = K_nat * d_n.
/// Tangent: K_T = B^T * K_nat * B + K_geo (from Crisfield).
fn assemble_frame_corotational(
    dof_num: &DofNumbering,
    elem: &SolverElement,
    node_i: &SolverNode,
    node_j: &SolverNode,
    e: f64,
    a: f64,
    iz: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    n: usize,
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();
    let alpha_0 = dy0.atan2(dx0);

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

    // Deformed geometry
    let dx_n = (node_j.x + u_elem[3]) - (node_i.x + u_elem[0]);
    let dy_n = (node_j.y + u_elem[4]) - (node_i.y + u_elem[1]);
    let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();

    if l_n < 1e-15 {
        return;
    }

    let alpha_n = dy_n.atan2(dx_n);
    let c = dx_n / l_n;
    let s = dy_n / l_n;

    let beta = alpha_n - alpha_0;

    // Natural deformations
    let d_axial = l_n - l0;
    let theta_i = u_elem[2] - beta;
    let theta_j = u_elem[5] - beta;

    // B matrix (3x6): derivative of natural deformations w.r.t. global DOFs
    // Row 0: d(d_axial)/d(u) = [-c, -s, 0, c, s, 0]
    // Row 1: d(theta_i)/d(u) = -d(beta)/d(u) + [0,0,1,0,0,0]
    //   d(beta)/d(u) = d(alpha_n)/d(u) = [s/l_n, -c/l_n, 0, -s/l_n, c/l_n, 0]
    // Row 2: d(theta_j)/d(u) = -d(beta)/d(u) + [0,0,0,0,0,1]
    let b: [[f64; 6]; 3] = [
        [-c, -s, 0.0, c, s, 0.0],
        [-s / l_n, c / l_n, 1.0, s / l_n, -c / l_n, 0.0],
        [-s / l_n, c / l_n, 0.0, s / l_n, -c / l_n, 1.0],
    ];

    // Natural stiffness K_nat (3x3) = P^T * K_local * P
    // where P maps natural to full local: d_local = P * d_natural
    // P = [[1,0,0],[0,0,0],[0,1,0],[-1,0,0],[0,0,0],[0,0,1]]
    let k_local = frame_local_stiffness_2d(e, a, iz, l0, elem.hinge_start, elem.hinge_end, 0.0);

    let p_mat: [[f64; 3]; 6] = [
        [1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [-1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0],
    ];

    let mut k_nat = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let mut val = 0.0;
            for r in 0..6 {
                for cc in 0..6 {
                    val += p_mat[r][i] * k_local[r * 6 + cc] * p_mat[cc][j];
                }
            }
            k_nat[i][j] = val;
        }
    }

    // Natural internal forces: q = K_nat * d_natural
    let d_natural = [d_axial, theta_i, theta_j];
    let mut q = [0.0; 3]; // [N, Mi, Mj]
    for i in 0..3 {
        for j in 0..3 {
            q[i] += k_nat[i][j] * d_natural[j];
        }
    }

    // Global internal forces: f_int = B^T * q
    let ndof = 6;
    for i in 0..ndof {
        let mut fi = 0.0;
        for k in 0..3 {
            fi += b[k][i] * q[k];
        }
        f_int[elem_dofs[i]] += fi;
    }

    // --- Tangent stiffness ---

    // Part 1: B^T * K_nat * B (6x6)
    let mut knb = [[0.0; 6]; 3];
    for i in 0..3 {
        for j in 0..ndof {
            let mut val = 0.0;
            for k in 0..3 {
                val += k_nat[i][k] * b[k][j];
            }
            knb[i][j] = val;
        }
    }
    let mut k_mat = [[0.0; 6]; 6];
    for i in 0..ndof {
        for j in 0..ndof {
            let mut val = 0.0;
            for k in 0..3 {
                val += b[k][i] * knb[k][j];
            }
            k_mat[i][j] = val;
        }
    }

    // Part 2: Geometric stiffness from derivative of B
    // Reference: Crisfield Vol 1 (17.33), also de Souza Neto et al.
    //
    // r = [-c, -s, 0, c, s, 0] (unit vector along element axis)
    // z = [s, -c, 0, -s, c, 0] (perpendicular)
    //
    // K_geo = (N/l_n) * z*z^T + ((Mi+Mj)/l_n^2) * (z*r^T + r*z^T)
    let nn = q[0]; // axial force
    let mi = q[1]; // moment at i
    let mj = q[2]; // moment at j

    let r_vec = [-c, -s, 0.0, c, s, 0.0];
    let z_vec = [s, -c, 0.0, -s, c, 0.0];

    let n_over_ln = nn / l_n;
    let m_sum_over_ln2 = (mi + mj) / (l_n * l_n);

    let mut k_geo = [[0.0; 6]; 6];
    for i in 0..ndof {
        for j in 0..ndof {
            k_geo[i][j] = n_over_ln * z_vec[i] * z_vec[j]
                + m_sum_over_ln2 * (z_vec[i] * r_vec[j] + r_vec[i] * z_vec[j]);
        }
    }

    // Assemble: K_mat + K_geo
    for i in 0..ndof {
        for j in 0..ndof {
            k_t[elem_dofs[i] * n + elem_dofs[j]] += k_mat[i][j] + k_geo[i][j];
        }
    }
}

/// Subtract fixed-end forces (FEF) from element loads in local coordinates.
fn subtract_element_fef(
    input: &SolverInput,
    elem: &SolverElement,
    l: f64,
    e: f64,
    _a: f64,
    _iz: f64,
    f_local: &mut [f64; 6],
    sec: &SolverSection,
) {
    for load in &input.loads {
        match load {
            SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                let a_dist = dl.a.unwrap_or(0.0);
                let b_dist = dl.b.unwrap_or(l);
                let is_full = (a_dist.abs() < 1e-12) && ((b_dist - l).abs() < 1e-12);

                let mut fef = if is_full {
                    fef_distributed_2d(dl.q_i, dl.q_j, l)
                } else {
                    fef_partial_distributed_2d(dl.q_i, dl.q_j, a_dist, b_dist, l)
                };
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                let px = pl.px.unwrap_or(0.0);
                let mz = pl.mz.unwrap_or(0.0);
                let mut fef = fef_point_load_2d(pl.p, px, mz, pl.a, l);
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            SolverLoad::Thermal(tl) if tl.element_id == elem.id => {
                let alpha = 12e-6;
                let h = if sec.a > 1e-15 {
                    (12.0 * sec.iz / sec.a).sqrt()
                } else {
                    0.1
                };
                let mut fef = fef_thermal_2d(
                    e, sec.a, sec.iz, l,
                    tl.dt_uniform, tl.dt_gradient, alpha, h,
                );
                adjust_fef_for_hinges(&mut fef, l, elem.hinge_start, elem.hinge_end);

                for i in 0..6 {
                    f_local[i] -= fef[i];
                }
            }
            _ => {}
        }
    }
}

/// Add spring stiffness and internal forces from springs.
fn add_spring_contributions(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;

    for sup in input.supports.values() {
        if sup.support_type != "spring" {
            continue;
        }

        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_t[d * n + d] += kx;
                    f_int[d] += kx * u_full[d];
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_t[d * n + d] += ky;
                    f_int[d] += ky * u_full[d];
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    k_t[d * n + d] += kz;
                    f_int[d] += kz * u_full[d];
                }
            }
        }
    }
}

/// Solve the free-DOF system K_ff * x = r using dense Cholesky with LU fallback.
/// Cached Cholesky factor (L stored in-place in row-major dense format).
struct CachedCholeskyFactor {
    l: Vec<f64>,
    n: usize,
}

/// Try to compute a Cholesky factorization and return the cached factor.
fn try_cholesky_factor(k: &[f64], n: usize) -> Option<CachedCholeskyFactor> {
    let mut l = k.to_vec();
    if cholesky_decompose(&mut l, n) {
        Some(CachedCholeskyFactor { l, n })
    } else {
        None
    }
}

/// Solve using a previously factored Cholesky L (stored in-place).
fn solve_with_cholesky_factor(l: &[f64], r: &[f64], n: usize) -> Vec<f64> {
    let y = forward_solve(l, r, n);
    back_solve(l, &y, n)
}

fn solve_free_dofs(k_ff: &[f64], r_f: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    let mut k_work = k_ff.to_vec();
    match cholesky_solve(&mut k_work, r_f, nf) {
        Some(u) => Ok(u),
        None => {
            let mut k_work = k_ff.to_vec();
            let mut r_work = r_f.to_vec();
            lu_solve(&mut k_work, &mut r_work, nf)
                .ok_or_else(|| {
                    "Singular tangent stiffness — structure may be a mechanism \
                     or load increment too large"
                        .to_string()
                })
        }
    }
}

/// Find the maximum displacement magnitude across all nodes.
fn compute_max_displacement(dof_num: &DofNumbering, u_full: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

/// Build final AnalysisResults from the converged displacement field.
fn build_final_results(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    cs: &Option<FreeConstraintSystem>,
) -> Result<AnalysisResults, String> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let displacements = super::linear::build_displacements_2d(dof_num, u_full);

    // Reactions: co-rotational internal forces at restrained DOFs minus external loads
    let asm = assembly::assemble_2d(input, dof_num);
    let nr = n - nf;
    let f_r: Vec<f64> = (nf..n).map(|i| asm.f[i]).collect();

    let mut f_int_corot = vec![0.0; n];
    let mut k_dummy = vec![0.0; n * n];
    assemble_corotational(input, dof_num, u_full, &mut f_int_corot, &mut k_dummy);
    add_spring_contributions(input, dof_num, u_full, &mut f_int_corot, &mut k_dummy);

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = f_int_corot[nf + i] - asm.f[nf + i];
    }

    let mut reactions = super::linear::build_reactions_2d(
        input, dof_num, &reactions_vec, &f_r, nf, u_full,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = compute_corotational_forces(input, dof_num, u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let mut k_ff = vec![0.0; nf * nf];
        for i in 0..nf {
            for j in 0..nf {
                k_ff[i * nf + j] = k_dummy[i * n + j];
            }
        }
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults {
        displacements,
        reactions,
        element_forces,
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
    })
}

/// Compute element internal forces using the co-rotational formulation.
fn compute_corotational_forces(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
) -> Vec<ElementForces> {
    let mut forces = Vec::new();

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.y - node_i.y;
            let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();

            let u_xi = dof_num.global_dof(elem.node_i, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yi = dof_num.global_dof(elem.node_i, 1).map(|d| u_full[d]).unwrap_or(0.0);
            let u_xj = dof_num.global_dof(elem.node_j, 0).map(|d| u_full[d]).unwrap_or(0.0);
            let u_yj = dof_num.global_dof(elem.node_j, 1).map(|d| u_full[d]).unwrap_or(0.0);

            let dx_n = (node_j.x + u_xj) - (node_i.x + u_xi);
            let dy_n = (node_j.y + u_yj) - (node_i.y + u_yi);
            let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();

            let d_axial = l_n - l0;
            let n_axial = e * sec.a / l0 * d_axial;

            forces.push(ElementForces {
                element_id: elem.id,
                n_start: n_axial,
                n_end: n_axial,
                v_start: 0.0,
                v_end: 0.0,
                m_start: 0.0,
                m_end: 0.0,
                length: l_n,
                q_i: 0.0,
                q_j: 0.0,
                point_loads: Vec::new(),
                distributed_loads: Vec::new(),
                hinge_start: false,
                hinge_end: false,
            });
        } else {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.y - node_i.y;
            let l0 = (dx0 * dx0 + dy0 * dy0).sqrt();
            let alpha_0 = dy0.atan2(dx0);

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

            let dx_n = (node_j.x + u_elem[3]) - (node_i.x + u_elem[0]);
            let dy_n = (node_j.y + u_elem[4]) - (node_i.y + u_elem[1]);
            let l_n = (dx_n * dx_n + dy_n * dy_n).sqrt();
            let alpha_n = dy_n.atan2(dx_n);

            let beta = alpha_n - alpha_0;
            let d_axial = l_n - l0;
            let theta_i_local = u_elem[2] - beta;
            let theta_j_local = u_elem[5] - beta;

            // Co-rotational local deformation: node i at origin, node j displaced axially
            let d_local = [0.0, 0.0, theta_i_local, d_axial, 0.0, theta_j_local];

            let k_local = frame_local_stiffness_2d(
                e, sec.a, sec.iz, l0, elem.hinge_start, elem.hinge_end, 0.0,
            );

            // f_local = K_local * d_local
            let mut f_local = [0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_local[i] += k_local[i * 6 + j] * d_local[j];
                }
            }

            // Subtract FEF for output (element forces = K*u - FEF)
            subtract_element_fef(input, elem, l0, e, sec.a, sec.iz, &mut f_local, sec);

            // Collect load metadata
            let (mut total_qi, mut total_qj) = (0.0, 0.0);
            let mut point_loads_info = Vec::new();
            let mut dist_loads_info = Vec::new();

            for load in &input.loads {
                match load {
                    SolverLoad::Distributed(dl) if dl.element_id == elem.id => {
                        let a_dist = dl.a.unwrap_or(0.0);
                        let b_dist = dl.b.unwrap_or(l0);
                        let is_full = (a_dist.abs() < 1e-12) && ((b_dist - l0).abs() < 1e-12);
                        if is_full {
                            total_qi += dl.q_i;
                            total_qj += dl.q_j;
                        }
                        dist_loads_info.push(DistributedLoadInfo {
                            q_i: dl.q_i,
                            q_j: dl.q_j,
                            a: a_dist,
                            b: b_dist,
                        });
                    }
                    SolverLoad::PointOnElement(pl) if pl.element_id == elem.id => {
                        point_loads_info.push(PointLoadInfo {
                            a: pl.a,
                            p: pl.p,
                            px: pl.px,
                            mz: pl.mz,
                        });
                    }
                    _ => {}
                }
            }

            // Sign convention: internal forces from member perspective
            forces.push(ElementForces {
                element_id: elem.id,
                n_start: -f_local[0],
                n_end: f_local[3],
                v_start: f_local[1],
                v_end: -f_local[4],
                m_start: f_local[2],
                m_end: -f_local[5],
                length: l_n,
                q_i: total_qi,
                q_j: total_qj,
                point_loads: point_loads_info,
                distributed_loads: dist_loads_info,
                hinge_start: elem.hinge_start,
                hinge_end: elem.hinge_end,
            });
        }
    }

    forces
}

// ============================================================
// 3D Co-rotational Large Displacement Solver
// ============================================================

/// Solve a 3D frame using co-rotational large displacement analysis.
///
/// Extends the 2D formulation to 3D with:
/// - Full co-rotational treatment for trusses/cables (exact for any rotation)
/// - Updated Lagrangian with geometric stiffness for frame elements
/// - Incremental-iterative loading with Newton-Raphson inner loops
///
/// References:
///   - Crisfield, "Non-linear Finite Element Analysis of Solids and Structures" Vol 1&2
///   - Battini, "Co-rotational beam elements in instability problems" (2002)
///   - Przemieniecki, "Theory of Matrix Structural Analysis" (1968)
pub fn solve_corotational_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
    n_increments: usize,
    modified_nr: bool,
) -> Result<CorotationalResult3D, String> {
    let dof_num = DofNumbering::build_3d(input);

    if dof_num.n_free == 0 {
        return Err("No free DOFs — all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let left_hand = input.left_hand.unwrap_or(false);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Reference load vector from linear assembly
    let asm = assembly::assemble_3d(input, &dof_num);
    let f_total = asm.f.clone();

    let mut u_full = vec![0.0; n];
    let mut total_iterations = 0;
    let mut converged = true;

    for increment in 1..=n_increments {
        let load_factor = increment as f64 / n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;
        let mut cached_factor: Option<CachedCholeskyFactor> = None;
        for _iter in 0..max_iter {
            total_iterations += 1;

            let mut f_int = vec![0.0; n];
            let mut k_t = vec![0.0; n * n];

            assemble_corotational_3d(input, &dof_num, &u_full, &mut f_int, &mut k_t, left_hand);
            add_spring_contributions_3d(input, &dof_num, &u_full, &mut f_int, &mut k_t);

            // Residual R = F_ext - f_int
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Reduce residual and check convergence on independent DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let r_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f.clone()
            };
            let f_ext_f: Vec<f64> = f_ext[..nf].to_vec();
            let f_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&f_ext_f)
            } else {
                f_ext_f
            };

            let r_norm: f64 = r_check.iter().map(|v| v * v).sum::<f64>().sqrt();
            let f_norm: f64 = f_check.iter().map(|v| v * v).sum::<f64>().sqrt();
            let ref_val = if f_norm > 1e-30 { f_norm } else { 1.0 };

            if r_norm / ref_val < tolerance {
                nr_converged = true;
                break;
            }

            // Solve K_T * delta_u = R (with constraint reduction if present)
            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if modified_nr {
                if let Some(ref factor) = cached_factor {
                    solve_with_cholesky_factor(&factor.l, &r_s, factor.n)
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    match try_cholesky_factor(&k_s, ns) {
                        Some(factor) => {
                            let result = solve_with_cholesky_factor(&factor.l, &r_s, factor.n);
                            cached_factor = Some(factor);
                            result
                        }
                        None => solve_free_dofs(&k_s, &r_s, ns)?,
                    }
                }
            } else {
                let free_idx: Vec<usize> = (0..nf).collect();
                let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                let k_s = if let Some(ref cs) = cs {
                    cs.reduce_matrix(&k_ff)
                } else {
                    k_ff
                };
                solve_free_dofs(&k_s, &r_s, ns)?
            };

            let delta_u = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            for i in 0..nf {
                u_full[i] += delta_u[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    let max_displacement = compute_max_displacement_3d(&dof_num, &u_full);
    let results = build_final_results_3d(input, &dof_num, &u_full, left_hand, &cs)?;

    Ok(CorotationalResult3D {
        results,
        iterations: total_iterations,
        converged,
        load_increments: n_increments,
        max_displacement,
    })
}

/// Assemble co-rotational internal forces and tangent stiffness for all 3D elements.
fn assemble_corotational_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    left_hand: bool,
) {
    let n = dof_num.n_total;

    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0; // MPa → kN/m²
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            assemble_truss_corotational_3d(
                dof_num, elem, node_i, node_j, e, sec.a,
                u_full, f_int, k_t, n,
            );
        } else {
            let l = {
                let dx = node_j.x - node_i.x;
                let dy = node_j.y - node_i.y;
                let dz = node_j.z - node_i.z;
                (dx * dx + dy * dy + dz * dz).sqrt()
            };
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| if ay > 0.0 { 12.0 * e * sec.iy / (g * ay * l2) } else { 0.0 }).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| if az > 0.0 { 12.0 * e * sec.iz / (g * az * l2) } else { 0.0 }).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            assemble_frame_corotational_3d(
                dof_num, elem, node_i, node_j,
                e, sec.a, sec.iy, sec.iz, sec.j, g, phi_y, phi_z,
                u_full, f_int, k_t, n, left_hand,
            );
        }
    }
}

/// Co-rotational treatment for a 3D truss/cable element.
///
/// Exact for arbitrary rotations. Uses deformed geometry to compute:
/// - Axial force: N = EA/L0 * (L_n - L_0)
/// - Internal force: f = N * r, where r = deformed direction
/// - Tangent: K = (EA/L0) * r⊗r + (N/L_n) * (I_block - r⊗r)
fn assemble_truss_corotational_3d(
    dof_num: &DofNumbering,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    e: f64,
    a: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    n: usize,
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let dz0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

    // Get translational DOFs only (trusses use DOFs 0,1,2 per node)
    let mut truss_dofs = [0usize; 6];
    for i in 0..3 {
        truss_dofs[i] = dof_num.global_dof(elem.node_i, i).unwrap();
        truss_dofs[i + 3] = dof_num.global_dof(elem.node_j, i).unwrap();
    }

    let u_xi = u_full[truss_dofs[0]];
    let u_yi = u_full[truss_dofs[1]];
    let u_zi = u_full[truss_dofs[2]];
    let u_xj = u_full[truss_dofs[3]];
    let u_yj = u_full[truss_dofs[4]];
    let u_zj = u_full[truss_dofs[5]];

    let dx_n = dx0 + u_xj - u_xi;
    let dy_n = dy0 + u_yj - u_yi;
    let dz_n = dz0 + u_zj - u_zi;
    let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();

    if l_n < 1e-15 {
        return;
    }

    let r = [dx_n / l_n, dy_n / l_n, dz_n / l_n];
    let axial_force = e * a / l0 * (l_n - l0);

    // Internal force: f = N * [-r, r]
    let signs: [f64; 6] = [-1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    for i in 0..6 {
        f_int[truss_dofs[i]] += axial_force * signs[i] * r[i % 3];
    }

    // Tangent: K = (EA/L0) * R⊗R + (N/L_n) * (Z - R⊗R)
    let ea_l0 = e * a / l0;
    let n_over_l = if l_n > 1e-15 { axial_force / l_n } else { 0.0 };

    for i in 0..6 {
        for j in 0..6 {
            let ri = signs[i] * r[i % 3];
            let rj = signs[j] * r[j % 3];

            // Block identity: z_ij = sign_i * sign_j * delta(i%3, j%3)
            let delta = if i % 3 == j % 3 { 1.0 } else { 0.0 };
            let z_ij = signs[i] * signs[j] * delta;

            k_t[truss_dofs[i] * n + truss_dofs[j]] += ea_l0 * ri * rj + n_over_l * (z_ij - ri * rj);
        }
    }
}

/// Co-rotational treatment for a 3D frame element.
///
/// Uses the direct natural deformation approach:
/// 1. Compute corotated axes from deformed node positions
/// 2. Extract natural deformations (rigid body removed)
/// 3. f_local = K_local * d_nat
/// 4. f_global = T_n^T * f_local
/// 5. K_T = T_n^T * K_local * T_n + K_geometric
fn assemble_frame_corotational_3d(
    dof_num: &DofNumbering,
    elem: &SolverElement3D,
    node_i: &SolverNode3D,
    node_j: &SolverNode3D,
    e: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    g: f64,
    phi_y: f64,
    phi_z: f64,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
    n: usize,
    left_hand: bool,
) {
    let dx0 = node_j.x - node_i.x;
    let dy0 = node_j.y - node_i.y;
    let dz0 = node_j.z - node_i.z;
    let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    if elem_dofs.len() < 12 {
        return; // Need at least 6 DOFs per node
    }
    let u_elem: Vec<f64> = elem_dofs.iter().map(|&d| u_full[d]).collect();

    // Deformed node positions
    let xi_def = node_i.x + u_elem[0];
    let yi_def = node_i.y + u_elem[1];
    let zi_def = node_i.z + u_elem[2];
    let xj_def = node_j.x + u_elem[6];
    let yj_def = node_j.y + u_elem[7];
    let zj_def = node_j.z + u_elem[8];

    let dx_n = xj_def - xi_def;
    let dy_n = yj_def - yi_def;
    let dz_n = zj_def - zi_def;
    let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();

    if l_n < 1e-15 {
        return;
    }

    // Original local axes
    let (ex_0, ey_0, ez_0) = compute_local_axes_3d(
        node_i.x, node_i.y, node_i.z,
        node_j.x, node_j.y, node_j.z,
        elem.local_yx, elem.local_yy, elem.local_yz,
        elem.roll_angle, left_hand,
    );

    // Corotated local axes (from deformed geometry)
    let (ex_n, ey_n, ez_n) = compute_local_axes_3d(
        xi_def, yi_def, zi_def,
        xj_def, yj_def, zj_def,
        elem.local_yx, elem.local_yy, elem.local_yz,
        elem.roll_angle, left_hand,
    );

    // Rigid body rotation: R_rigid = R_n * R_0^T
    // R_0 columns = [ex_0, ey_0, ez_0], R_n columns = [ex_n, ey_n, ez_n]
    let r_0 = [ex_0, ey_0, ez_0]; // r_0[axis][component]
    let r_n = [ex_n, ey_n, ez_n];

    // R_rigid[i][j] = sum_k R_n[i][k] * R_0[j][k] = sum_k r_n[k][i] * r_0[k][j]
    let mut r_rigid = [[0.0; 3]; 3];
    for i in 0..3 {
        for jj in 0..3 {
            for k in 0..3 {
                r_rigid[i][jj] += r_n[k][i] * r_0[k][jj];
            }
        }
    }

    // Extract rigid body rotation angles (small angle: β ≈ axial of skew(R_rigid - I))
    let beta_x = (r_rigid[2][1] - r_rigid[1][2]) / 2.0;
    let beta_y = (r_rigid[0][2] - r_rigid[2][0]) / 2.0;
    let beta_z = (r_rigid[1][0] - r_rigid[0][1]) / 2.0;

    // Project global rotations to corotated frame and subtract rigid body rotation
    let theta_i_global = [u_elem[3], u_elem[4], u_elem[5]];
    let theta_j_global = [u_elem[9], u_elem[10], u_elem[11]];

    // R_n^T * θ_global: project to corotated frame
    // Using r_n[axis][component]: (R_n^T * v)[m] = sum_k r_n[m][k] * v[k]
    let project = |v: &[f64; 3]| -> [f64; 3] {
        [
            ex_n[0] * v[0] + ex_n[1] * v[1] + ex_n[2] * v[2],
            ey_n[0] * v[0] + ey_n[1] * v[1] + ey_n[2] * v[2],
            ez_n[0] * v[0] + ez_n[1] * v[1] + ez_n[2] * v[2],
        ]
    };

    let theta_i_local = project(&theta_i_global);
    let theta_j_local = project(&theta_j_global);

    // Natural deformations (rigid body removed)
    let d_axial = l_n - l0;
    let d_nat = [
        0.0, 0.0, 0.0,                                                          // u_i, v_i, w_i
        theta_i_local[0] - beta_x, theta_i_local[1] - beta_y, theta_i_local[2] - beta_z, // θx_i, θy_i, θz_i
        d_axial, 0.0, 0.0,                                                      // u_j, v_j, w_j
        theta_j_local[0] - beta_x, theta_j_local[1] - beta_y, theta_j_local[2] - beta_z, // θx_j, θy_j, θz_j
    ];

    // Local stiffness (using original length)
    let k_local = frame_local_stiffness_3d(
        e, a, iy, iz, j, l0, g,
        elem.hinge_start, elem.hinge_end, phi_y, phi_z,
    );

    // f_local = K_local * d_nat
    let mut f_local = [0.0; 12];
    for i in 0..12 {
        for jj in 0..12 {
            f_local[i] += k_local[i * 12 + jj] * d_nat[jj];
        }
    }

    // Corotated transformation matrix
    let t_n = frame_transform_3d(&ex_n, &ey_n, &ez_n);

    // f_global = T_n^T * f_local
    let f_local_vec: Vec<f64> = f_local.to_vec();
    let f_global = transform_force(&f_local_vec, &t_n, 12);

    // Handle DOF mapping for warping models (7 DOF per node)
    let ndof_elem = elem_dofs.len();
    if ndof_elem == 12 {
        for i in 0..12 {
            f_int[elem_dofs[i]] += f_global[i];
        }
    } else if ndof_elem == 14 {
        // Map 12-DOF forces to 14-DOF element (skip warping DOFs 6, 13)
        let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
        for (i12, &i14) in map.iter().enumerate() {
            f_int[elem_dofs[i14]] += f_global[i12];
        }
    }

    // Tangent stiffness: T_n^T * K_local * T_n
    let k_glob = transform_stiffness(&k_local, &t_n, 12);

    // Geometric stiffness (Przemieniecki formula)
    let axial_p = -f_local[0]; // Tension positive
    let k_geo_local = frame_geo_stiffness_3d_local(axial_p, l_n);
    let k_geo_global = transform_stiffness(&k_geo_local, &t_n, 12);

    // Scatter to global
    if ndof_elem == 12 {
        for i in 0..12 {
            for jj in 0..12 {
                k_t[elem_dofs[i] * n + elem_dofs[jj]] += k_glob[i * 12 + jj] + k_geo_global[i * 12 + jj];
            }
        }
    } else if ndof_elem == 14 {
        let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
        for (i12, &i14) in map.iter().enumerate() {
            for (j12, &j14) in map.iter().enumerate() {
                k_t[elem_dofs[i14] * n + elem_dofs[j14]] += k_glob[i12 * 12 + j12] + k_geo_global[i12 * 12 + j12];
            }
        }
    }
}

/// Przemieniecki geometric stiffness for a 3D frame element in local coordinates.
///
/// Local DOF order: [u, v, w, θx, θy, θz] per node (12 total).
/// P > 0 = tension.
fn frame_geo_stiffness_3d_local(p: f64, l: f64) -> Vec<f64> {
    let mut kg = vec![0.0; 144];
    if l < 1e-15 || p.abs() < 1e-20 {
        return kg;
    }
    let coeff = p / (30.0 * l);

    // Y-bending plane: DOFs 1(v_i), 5(θz_i), 7(v_j), 11(θz_j)
    let y_dofs = [1, 5, 7, 11];
    let l2 = l * l;
    #[rustfmt::skip]
    let y_vals: [[f64; 4]; 4] = [
        [ 36.0,    3.0*l,  -36.0,    3.0*l ],
        [  3.0*l,  4.0*l2,  -3.0*l, -l2    ],
        [-36.0,   -3.0*l,   36.0,   -3.0*l ],
        [  3.0*l, -l2,      -3.0*l,  4.0*l2],
    ];

    // Z-bending plane: DOFs 2(w_i), 4(θy_i), 8(w_j), 10(θy_j)
    let z_dofs = [2, 4, 8, 10];
    #[rustfmt::skip]
    let z_vals: [[f64; 4]; 4] = [
        [ 36.0,   -3.0*l,  -36.0,   -3.0*l ],
        [ -3.0*l,  4.0*l2,   3.0*l, -l2     ],
        [-36.0,    3.0*l,   36.0,    3.0*l  ],
        [ -3.0*l, -l2,       3.0*l,  4.0*l2 ],
    ];

    for i in 0..4 {
        for jj in 0..4 {
            kg[y_dofs[i] * 12 + y_dofs[jj]] += coeff * y_vals[i][jj];
            kg[z_dofs[i] * 12 + z_dofs[jj]] += coeff * z_vals[i][jj];
        }
    }

    kg
}

/// Add spring stiffness and internal forces from springs (3D).
fn add_spring_contributions_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;

    for sup in input.supports.values() {
        let springs: [(usize, Option<f64>); 6] = [
            (0, sup.kx), (1, sup.ky), (2, sup.kz),
            (3, sup.krx), (4, sup.kry), (5, sup.krz),
        ];
        for &(local_dof, k_val) in &springs {
            if let Some(k) = k_val {
                if k > 0.0 && local_dof < dof_num.dofs_per_node {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        k_t[d * n + d] += k;
                        f_int[d] += k * u_full[d];
                    }
                }
            }
        }
    }
}

/// Maximum translational displacement magnitude for 3D.
fn compute_max_displacement_3d(dof_num: &DofNumbering, u_full: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u_full[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u_full[d]).unwrap_or(0.0);
        let uz = dof_num.global_dof(node_id, 2).map(|d| u_full[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy + uz * uz).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

/// Build final 3D results from converged displacement field.
fn build_final_results_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    left_hand: bool,
    cs: &Option<FreeConstraintSystem>,
) -> Result<AnalysisResults3D, String> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let nr = n - nf;

    let displacements = super::linear::build_displacements_3d(dof_num, u_full);

    // Reactions from co-rotational internal forces at restrained DOFs
    let asm = assembly::assemble_3d(input, dof_num);

    let mut f_int_corot = vec![0.0; n];
    let mut k_dummy = vec![0.0; n * n];
    assemble_corotational_3d(input, dof_num, u_full, &mut f_int_corot, &mut k_dummy, left_hand);
    add_spring_contributions_3d(input, dof_num, u_full, &mut f_int_corot, &mut k_dummy);

    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        reactions_vec[i] = f_int_corot[nf + i] - asm.f[nf + i];
    }

    let f_r: Vec<f64> = (nf..n).map(|i| asm.f[i]).collect();
    let mut reactions = super::linear::build_reactions_3d(
        input, dof_num, &reactions_vec, &f_r, nf, u_full,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = compute_corotational_forces_3d(input, dof_num, u_full, left_hand);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let mut k_ff = vec![0.0; nf * nf];
        for i in 0..nf {
            for j in 0..nf {
                k_ff[i * nf + j] = k_dummy[i * n + j];
            }
        }
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults3D {
        displacements,
        reactions,
        element_forces,
        plate_stresses: super::linear::compute_plate_stresses(input, dof_num, u_full),
        quad_stresses: super::linear::compute_quad_stresses(input, dof_num, u_full),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: vec![],
        equilibrium: None,
        timings: None,
    })
}

/// Compute element internal forces using co-rotational natural deformations (3D).
fn compute_corotational_forces_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    left_hand: bool,
) -> Vec<ElementForces3D> {
    let mut forces = Vec::new();

    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        input.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        input.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        input.sections.values().map(|s| (s.id, s)).collect();

    for elem in input.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dx0 = node_j.x - node_i.x;
            let dy0 = node_j.y - node_i.y;
            let dz0 = node_j.z - node_i.z;
            let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

            let ui: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_i, i).map(|d| u_full[d]).unwrap_or(0.0)
            }).collect();
            let uj: Vec<f64> = (0..3).map(|i| {
                dof_num.global_dof(elem.node_j, i).map(|d| u_full[d]).unwrap_or(0.0)
            }).collect();

            let dx_n = dx0 + uj[0] - ui[0];
            let dy_n = dy0 + uj[1] - ui[1];
            let dz_n = dz0 + uj[2] - ui[2];
            let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();
            let n_axial = e * sec.a / l0 * (l_n - l0);

            forces.push(ElementForces3D {
                element_id: elem.id, length: l_n,
                n_start: n_axial, n_end: n_axial,
                vy_start: 0.0, vy_end: 0.0,
                vz_start: 0.0, vz_end: 0.0,
                mx_start: 0.0, mx_end: 0.0,
                my_start: 0.0, my_end: 0.0,
                mz_start: 0.0, mz_end: 0.0,
                hinge_start: false, hinge_end: false,
                q_yi: 0.0, q_yj: 0.0,
                distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
                q_zi: 0.0, q_zj: 0.0,
                distributed_loads_z: Vec::new(), point_loads_z: Vec::new(),
                bimoment_start: None, bimoment_end: None,
            });
            continue;
        }

        // Frame element: compute forces from natural deformations
        let dx0 = node_j.x - node_i.x;
        let dy0 = node_j.y - node_i.y;
        let dz0 = node_j.z - node_i.z;
        let l0 = (dx0 * dx0 + dy0 * dy0 + dz0 * dz0).sqrt();

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if elem_dofs.len() < 12 {
            continue;
        }

        // Map to 12-DOF for extraction
        let u_elem_12: Vec<f64> = if elem_dofs.len() == 14 {
            let map = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
            map.iter().map(|&idx| u_full[elem_dofs[idx]]).collect()
        } else {
            elem_dofs.iter().take(12).map(|&d| u_full[d]).collect()
        };

        let xi_def = node_i.x + u_elem_12[0];
        let yi_def = node_i.y + u_elem_12[1];
        let zi_def = node_i.z + u_elem_12[2];
        let xj_def = node_j.x + u_elem_12[6];
        let yj_def = node_j.y + u_elem_12[7];
        let zj_def = node_j.z + u_elem_12[8];

        let dx_n = xj_def - xi_def;
        let dy_n = yj_def - yi_def;
        let dz_n = zj_def - zi_def;
        let l_n = (dx_n * dx_n + dy_n * dy_n + dz_n * dz_n).sqrt();

        if l_n < 1e-15 {
            continue;
        }

        let (ex_0, ey_0, ez_0) = compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, left_hand,
        );
        let (ex_n, ey_n, ez_n) = compute_local_axes_3d(
            xi_def, yi_def, zi_def,
            xj_def, yj_def, zj_def,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, left_hand,
        );

        // Rigid body rotation
        let r_0 = [ex_0, ey_0, ez_0];
        let r_n = [ex_n, ey_n, ez_n];
        let mut r_rigid = [[0.0; 3]; 3];
        for i in 0..3 {
            for jj in 0..3 {
                for k in 0..3 {
                    r_rigid[i][jj] += r_n[k][i] * r_0[k][jj];
                }
            }
        }
        let beta_x = (r_rigid[2][1] - r_rigid[1][2]) / 2.0;
        let beta_y = (r_rigid[0][2] - r_rigid[2][0]) / 2.0;
        let beta_z = (r_rigid[1][0] - r_rigid[0][1]) / 2.0;

        let project = |v: &[f64; 3]| -> [f64; 3] {
            [
                ex_n[0] * v[0] + ex_n[1] * v[1] + ex_n[2] * v[2],
                ey_n[0] * v[0] + ey_n[1] * v[1] + ey_n[2] * v[2],
                ez_n[0] * v[0] + ez_n[1] * v[1] + ez_n[2] * v[2],
            ]
        };

        let theta_i = [u_elem_12[3], u_elem_12[4], u_elem_12[5]];
        let theta_j = [u_elem_12[9], u_elem_12[10], u_elem_12[11]];
        let ti = project(&theta_i);
        let tj = project(&theta_j);

        let d_axial = l_n - l0;
        let d_nat = [
            0.0, 0.0, 0.0,
            ti[0] - beta_x, ti[1] - beta_y, ti[2] - beta_z,
            d_axial, 0.0, 0.0,
            tj[0] - beta_x, tj[1] - beta_y, tj[2] - beta_z,
        ];

        let l_calc = l0;
        let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
            let l2 = l_calc * l_calc;
            let py = sec.as_y.map(|ay| if ay > 0.0 { 12.0 * e * sec.iy / (g * ay * l2) } else { 0.0 }).unwrap_or(0.0);
            let pz = sec.as_z.map(|az| if az > 0.0 { 12.0 * e * sec.iz / (g * az * l2) } else { 0.0 }).unwrap_or(0.0);
            (py, pz)
        } else {
            (0.0, 0.0)
        };

        let k_local = frame_local_stiffness_3d(
            e, sec.a, sec.iy, sec.iz, sec.j, l0, g,
            elem.hinge_start, elem.hinge_end, phi_y, phi_z,
        );

        let mut f_local = [0.0; 12];
        for i in 0..12 {
            for jj in 0..12 {
                f_local[i] += k_local[i * 12 + jj] * d_nat[jj];
            }
        }

        // Sign convention: match linear solver output
        forces.push(ElementForces3D {
            element_id: elem.id,
            length: l_n,
            n_start: -f_local[0],
            n_end: f_local[6],
            vy_start: f_local[1],
            vy_end: -f_local[7],
            vz_start: f_local[2],
            vz_end: -f_local[8],
            mx_start: f_local[3],
            mx_end: -f_local[9],
            my_start: f_local[4],
            my_end: -f_local[10],
            mz_start: f_local[5],
            mz_end: -f_local[11],
            hinge_start: elem.hinge_start,
            hinge_end: elem.hinge_end,
            q_yi: 0.0, q_yj: 0.0,
            distributed_loads_y: Vec::new(), point_loads_y: Vec::new(),
            q_zi: 0.0, q_zj: 0.0,
            distributed_loads_z: Vec::new(), point_loads_z: Vec::new(),
            bimoment_start: None, bimoment_end: None,
        });
    }

    forces
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn cantilever_input(length: f64, load_fy: f64) -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: length, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "frame".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None,
            angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 0.0,
                fy: load_fy,
                mz: 0.0,
            }),
        ];

        SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() }
    }

    #[test]
    fn test_corotational_small_load_matches_linear() {
        // With a very small load, co-rotational should closely match linear
        // E=200 MPa -> E_actual=200000 kN/m^2, A=0.01 m^2, Iz=1e-4 m^4, L=3m
        // Use a very small load so geometric effects are negligible
        let input = cantilever_input(3.0, -0.001);

        let linear = super::super::linear::solve_2d(&input).unwrap();
        let corot = solve_corotational_2d(&input, 50, 1e-6, 1, false).unwrap();

        assert!(corot.converged, "Should converge");

        let lin_d = linear.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let cor_d = corot.results.displacements.iter().find(|d| d.node_id == 2).unwrap();

        // For very small loads, uy should match closely
        let rel_tol_uy = (lin_d.uy - cor_d.uy).abs() / lin_d.uy.abs().max(1e-15);
        assert!(
            rel_tol_uy < 1e-3,
            "uy relative mismatch too large: linear={}, corot={}, rel={}",
            lin_d.uy, cor_d.uy, rel_tol_uy
        );

        // ux: linear gives 0, co-rotational gives a small shortening
        // For small loads this should be negligible
        assert!(
            cor_d.ux.abs() < 1e-6,
            "ux should be negligible for small load, got {}",
            cor_d.ux
        );
    }

    #[test]
    fn test_corotational_converges_with_increments() {
        let input = cantilever_input(3.0, -50.0);

        let corot = solve_corotational_2d(&input, 100, 1e-6, 10, false).unwrap();
        assert!(corot.converged, "Should converge with 10 increments");
        assert!(corot.max_displacement > 0.0, "Should have nonzero displacement");
        assert!(corot.iterations > 0, "Should take some iterations");
    }

    #[test]
    fn test_corotational_axial_truss() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 5.0, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 0.0, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "truss".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1,
            node_id: 1,
            support_type: "pinned".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None,
            angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2,
            node_id: 2,
            support_type: "rollerX".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None,
            angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2,
                fx: 100.0,
                fy: 0.0,
                mz: 0.0,
            }),
        ];

        let input = SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() };
        let corot = solve_corotational_2d(&input, 50, 1e-8, 1, false).unwrap();

        assert!(corot.converged);
        let ef = &corot.results.element_forces[0];
        assert!(
            (ef.n_start - 100.0).abs() < 0.1,
            "Axial force should be ~100 kN, got {}",
            ef.n_start
        );
    }

    #[test]
    fn test_no_free_dofs_error() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 3.0, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1,
            elem_type: "frame".into(),
            node_i: 1,
            node_j: 2,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2, node_id: 2, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });

        let input = SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        let result = solve_corotational_2d(&input, 50, 1e-8, 1, false);
        assert!(result.is_err());
    }

    #[test]
    fn test_corotational_two_element_frame() {
        let mut nodes = HashMap::new();
        nodes.insert("1".into(), SolverNode { id: 1, x: 0.0, y: 0.0 });
        nodes.insert("2".into(), SolverNode { id: 2, x: 3.0, y: 0.0 });
        nodes.insert("3".into(), SolverNode { id: 3, x: 3.0, y: 3.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });
        elements.insert("2".into(), SolverElement {
            id: 2, elem_type: "frame".into(),
            node_i: 2, node_j: 3, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("1".into(), SolverSupport {
            id: 1, node_id: 1, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });
        supports.insert("2".into(), SolverSupport {
            id: 2, node_id: 3, support_type: "pinned".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });

        let loads = vec![
            SolverLoad::Nodal(SolverNodalLoad {
                node_id: 2, fx: -5.0, fy: -5.0, mz: 0.0,
            }),
        ];

        let input = SolverInput { nodes, materials, sections, elements, supports, loads, constraints: vec![] , connectors: HashMap::new() };
        let corot = solve_corotational_2d(&input, 100, 1e-6, 5, false).unwrap();
        assert!(corot.converged, "Two-element frame should converge");
        assert_eq!(corot.results.element_forces.len(), 2);
    }
}
