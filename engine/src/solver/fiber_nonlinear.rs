/// Fiber beam-column nonlinear solver.
///
/// Incremental-iterative N-R solver that uses fiber section integration
/// to compute element tangent stiffness and internal forces. Captures
/// distributed plasticity along beam length and across cross-section.
///
/// Reference: Spacone, Filippou & Taucer (1996)
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use crate::element::fiber_beam::*;
use crate::element::{frame_transform_2d, compute_local_axes_3d, frame_transform_3d};
use super::dof::DofNumbering;
use super::assembly;
use super::constraints::FreeConstraintSystem;

/// Fiber nonlinear analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberNonlinearInput {
    pub solver: SolverInput,
    /// Fiber section definitions per section ID
    pub fiber_sections: HashMap<String, FiberSectionDef>,
    /// Number of integration points per element (3-7, default 5)
    #[serde(default = "default_n_ip")]
    pub n_integration_points: usize,
    /// Maximum N-R iterations per load increment
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    /// Number of load increments
    #[serde(default = "default_n_inc")]
    pub n_increments: usize,
}

fn default_n_ip() -> usize { 5 }
fn default_max_iter() -> usize { 30 }
fn default_tol() -> f64 { 1e-6 }
fn default_n_inc() -> usize { 10 }

/// Per-element fiber state.
struct ElementFiberState {
    _section_id: String,
    section_states: Vec<SectionState>, // One per integration point
}

/// Fiber nonlinear result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberNonlinearResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub n_increments: usize,
    pub fiber_status: Vec<FiberElementStatus>,
}

/// Per-element fiber status.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberElementStatus {
    pub element_id: usize,
    pub yielded: bool,
    pub max_strain: f64,
    pub max_stress: f64,
}

/// Solve a 2D fiber nonlinear problem.
pub fn solve_fiber_nonlinear_2d(input: &FiberNonlinearInput) -> Result<FiberNonlinearResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let n_ip = input.n_integration_points.max(2).min(7);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Reference load vector
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let f_total = asm.f.clone();

    // Initialize per-element fiber states
    let mut elem_states: HashMap<usize, ElementFiberState> = HashMap::new();
    for elem in input.solver.elements.values() {
        let sec_key = elem.section_id.to_string();
        if let Some(sec) = input.fiber_sections.get(&sec_key) {
            let n_fibers = sec.fibers.len();
            let states = (0..n_ip)
                .map(|_| SectionState::new(n_fibers))
                .collect();
            elem_states.insert(elem.id, ElementFiberState {
                _section_id: sec_key,
                section_states: states,
            });
        }
    }

    let mut u_full = vec![0.0; n];
    let mut total_iters = 0;
    let mut converged = true;

    // Incremental loading
    for inc in 1..=input.n_increments {
        let load_factor = inc as f64 / input.n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;

        for _iter in 0..input.max_iter {
            total_iters += 1;

            // Assemble tangent stiffness and internal forces from fiber elements
            let mut f_int = vec![0.0; n];
            let mut k_t = vec![0.0; n * n];

            assemble_fiber_elements(
                &input.solver, &input.fiber_sections, &dof_num,
                &u_full, &mut elem_states, n_ip,
                &mut f_int, &mut k_t,
            );

            // Add non-fiber elements (truss, elastic frame without fiber section)
            assemble_elastic_elements(
                &input.solver, &input.fiber_sections, &dof_num,
                &u_full, &mut f_int, &mut k_t,
            );

            // Add spring contributions
            add_springs(&input.solver, &dof_num, &u_full, &mut f_int, &mut k_t);

            // Residual
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Check convergence on independent (reduced) DOFs
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
            let rel_error = if f_norm > 1e-30 { r_norm / f_norm } else { r_norm };

            if rel_error < input.tolerance {
                nr_converged = true;
                break;
            }

            // Solve
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
            let (k_s, r_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&r_f))
            } else {
                (k_ff, r_f)
            };

            let delta_u_indep = {
                let mut k_work = k_s.clone();
                match cholesky_solve(&mut k_work, &r_s, ns) {
                    Some(u) => u,
                    None => {
                        let mut k_work = k_s;
                        let mut f_work = r_s;
                        lu_solve(&mut k_work, &mut f_work, ns)
                            .ok_or("Singular tangent stiffness in fiber N-R")?
                    }
                }
            };
            let delta_u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    // Build results
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    // Collect fiber status
    let mut fiber_status = Vec::new();
    for elem in input.solver.elements.values() {
        if let Some(es) = elem_states.get(&elem.id) {
            let mut max_strain = 0.0_f64;
            let mut max_stress = 0.0_f64;
            let mut yielded = false;

            for ss in &es.section_states {
                for fs in &ss.fiber_states {
                    max_strain = max_strain.max(fs.strain.abs());
                    max_stress = max_stress.max(fs.stress.abs());
                    if fs.plastic_strain.abs() > 1e-10 || fs.cracked {
                        yielded = true;
                    }
                }
            }

            fiber_status.push(FiberElementStatus {
                element_id: elem.id,
                yielded,
                max_strain,
                max_stress,
            });
        }
    }

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        // Rebuild final tangent stiffness for constraint force computation
        let mut f_int_final = vec![0.0; n];
        let mut k_t_final = vec![0.0; n * n];
        let mut elem_states_copy = elem_states;
        assemble_fiber_elements(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut elem_states_copy, n_ip,
            &mut f_int_final, &mut k_t_final,
        );
        assemble_elastic_elements(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut f_int_final, &mut k_t_final,
        );
        add_springs(&input.solver, &dof_num, &u_full, &mut f_int_final, &mut k_t_final);
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_t_final, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &f_total[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(FiberNonlinearResult {
        results: AnalysisResults {
            displacements,
            reactions: vec![],
            element_forces,
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
        },
        iterations: total_iters,
        converged,
        n_increments: input.n_increments,
        fiber_status,
    })
}

/// Assemble fiber element contributions to global K_t and f_int.
fn assemble_fiber_elements(
    solver: &SolverInput,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &mut HashMap<usize, ElementFiberState>,
    n_ip: usize,
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    let node_by_id: HashMap<usize, &SolverNode> = solver.nodes.values().map(|n| (n.id, n)).collect();

    for elem in solver.elements.values() {
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }

        let sec_key = elem.section_id.to_string();
        let section = match fiber_sections.get(&sec_key) {
            Some(s) => s,
            None => continue, // Elastic element, handled separately
        };

        let es = match elem_states.get_mut(&elem.id) {
            Some(s) => s,
            None => continue,
        };

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();

        // Get element DOFs
        let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if dofs.len() < 6 { continue; }

        // Extract element displacements in global coords
        let u_global: [f64; 6] = [
            u_full[dofs[0]], u_full[dofs[1]], u_full[dofs[2]],
            u_full[dofs[3]], u_full[dofs[4]], u_full[dofs[5]],
        ];

        // Transform to local coordinates
        let c = dx / l;
            let s = dy / l;
            let t = frame_transform_2d(c, s);
        let mut u_local = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                u_local[i] += t[i * 6 + j] * u_global[j];
            }
        }

        // Compute fiber element response
        let (f_local, k_local) = fiber_element_response_2d(
            &u_local, l, section, &mut es.section_states, n_ip,
        );

        // Transform back to global: K_global = T^T * K_local * T
        let k_global = transform_stiffness(&k_local, &t, 6);
        let mut f_global = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                f_global[i] += t[j * 6 + i] * f_local[j]; // T^T * f_local
            }
        }

        // Scatter to global
        for i in 0..6 {
            f_int[dofs[i]] += f_global[i];
            for j in 0..6 {
                k_t[dofs[i] * n + dofs[j]] += k_global[i * 6 + j];
            }
        }
    }
}

/// Assemble elastic (non-fiber) frame elements.
fn assemble_elastic_elements(
    solver: &SolverInput,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    let node_by_id: HashMap<usize, &SolverNode> = solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let sec_key = elem.section_id.to_string();

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss element
            let node_i = node_by_id[&elem.node_i];
            let node_j = node_by_id[&elem.node_j];
            let mat = mat_by_id[&elem.material_id];
            let sec = sec_by_id[&elem.section_id];
            let e = mat.e * 1000.0;
            let dx = node_j.x - node_i.x;
            let dy = node_j.y - node_i.y;
            let l = (dx * dx + dy * dy).sqrt();

            let c = dx / l;
            let s = dy / l;
            let ea_l = e * sec.a / l;

            let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

            // Truss K and f_int
            let k_entries = [
                (0, 0, c * c), (0, 1, c * s), (0, 3, -c * c), (0, 4, -c * s),
                (1, 0, c * s), (1, 1, s * s), (1, 3, -c * s), (1, 4, -s * s),
                (3, 0, -c * c), (3, 1, -c * s), (3, 3, c * c), (3, 4, c * s),
                (4, 0, -c * s), (4, 1, -s * s), (4, 3, c * s), (4, 4, s * s),
            ];

            for &(i, j, val) in &k_entries {
                if i < dofs.len() && j < dofs.len() {
                    k_t[dofs[i] * n + dofs[j]] += ea_l * val;
                }
            }

            // f_int = K * u for this element
            for &(i, j, val) in &k_entries {
                if i < dofs.len() && j < dofs.len() {
                    f_int[dofs[i]] += ea_l * val * u_full[dofs[j]];
                }
            }
        } else if !fiber_sections.contains_key(&sec_key) {
            // Elastic frame element (no fiber section defined)
            let node_i = node_by_id[&elem.node_i];
            let node_j = node_by_id[&elem.node_j];
            let mat = mat_by_id[&elem.material_id];
            let sec = sec_by_id[&elem.section_id];

            let e = mat.e * 1000.0;
            let dx = node_j.x - node_i.x;
            let dy = node_j.y - node_i.y;
            let l = (dx * dx + dy * dy).sqrt();

            let k_local = crate::element::frame_local_stiffness_2d(
                e, sec.a, sec.iz, l,
                elem.hinge_start, elem.hinge_end, 0.0,
            );
            let c = dx / l;
            let s = dy / l;
            let t = frame_transform_2d(c, s);
            let k_global = transform_stiffness(&k_local, &t, 6);

            let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            if dofs.len() < 6 { continue; }

            for i in 0..6 {
                for j in 0..6 {
                    k_t[dofs[i] * n + dofs[j]] += k_global[i * 6 + j];
                    f_int[dofs[i]] += k_global[i * 6 + j] * u_full[dofs[j]];
                }
            }
        }
    }
}

/// Add spring stiffness and forces.
fn add_springs(
    solver: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    for sup in solver.supports.values() {
        if sup.support_type != "spring" { continue; }
        let springs = [(0, sup.kx), (1, sup.ky), (2, sup.kz)];
        for &(local_dof, k_opt) in &springs {
            if let Some(k) = k_opt {
                if k > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        k_t[d * n + d] += k;
                        f_int[d] += k * u_full[d];
                    }
                }
            }
        }
    }
}

// ==================== 3D Fiber Nonlinear Solver ====================

/// Fiber nonlinear analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberNonlinearInput3D {
    pub solver: SolverInput3D,
    pub fiber_sections: HashMap<String, FiberSectionDef>,
    #[serde(default = "default_n_ip")]
    pub n_integration_points: usize,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    #[serde(default = "default_n_inc")]
    pub n_increments: usize,
}

/// Fiber nonlinear result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberNonlinearResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub n_increments: usize,
    pub fiber_status: Vec<FiberElementStatus>,
}

/// Solve a 3D fiber nonlinear problem.
pub fn solve_fiber_nonlinear_3d(input: &FiberNonlinearInput3D) -> Result<FiberNonlinearResult3D, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let n_ip = input.n_integration_points.max(2).min(7);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let asm = assembly::assemble_3d(&input.solver, &dof_num);
    let f_total = asm.f.clone();

    // Initialize per-element fiber states
    let mut elem_states: HashMap<usize, ElementFiberState> = HashMap::new();
    for elem in input.solver.elements.values() {
        let sec_key = elem.section_id.to_string();
        if let Some(sec) = input.fiber_sections.get(&sec_key) {
            let n_fibers = sec.fibers.len();
            let states = (0..n_ip)
                .map(|_| SectionState::new(n_fibers))
                .collect();
            elem_states.insert(elem.id, ElementFiberState {
                _section_id: sec_key,
                section_states: states,
            });
        }
    }

    let mut u_full = vec![0.0; n];
    let mut total_iters = 0;
    let mut converged = true;

    for inc in 1..=input.n_increments {
        let load_factor = inc as f64 / input.n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;

        for _iter in 0..input.max_iter {
            total_iters += 1;

            let mut f_int = vec![0.0; n];
            let mut k_t = vec![0.0; n * n];

            assemble_fiber_elements_3d(
                &input.solver, &input.fiber_sections, &dof_num,
                &u_full, &mut elem_states, n_ip,
                &mut f_int, &mut k_t,
            );

            assemble_elastic_elements_3d(
                &input.solver, &input.fiber_sections, &dof_num,
                &u_full, &mut f_int, &mut k_t,
            );

            // Residual
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }

            // Check convergence on independent (reduced) DOFs
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
            let rel_error = if f_norm > 1e-30 { r_norm / f_norm } else { r_norm };

            if rel_error < input.tolerance {
                nr_converged = true;
                break;
            }

            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
            let (k_s, r_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&r_f))
            } else {
                (k_ff, r_f)
            };

            let delta_u_indep = {
                let mut k_work = k_s.clone();
                match cholesky_solve(&mut k_work, &r_s, ns) {
                    Some(u) => u,
                    None => {
                        let mut k_work = k_s;
                        let mut f_work = r_s;
                        lu_solve(&mut k_work, &mut f_work, ns)
                            .ok_or("Singular tangent stiffness in 3D fiber N-R")?
                    }
                }
            };
            let delta_u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    // Build results
    let displacements = super::linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = super::linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    let mut fiber_status = Vec::new();
    for elem in input.solver.elements.values() {
        if let Some(es) = elem_states.get(&elem.id) {
            let mut max_strain = 0.0_f64;
            let mut max_stress = 0.0_f64;
            let mut yielded = false;
            for ss in &es.section_states {
                for fs in &ss.fiber_states {
                    max_strain = max_strain.max(fs.strain.abs());
                    max_stress = max_stress.max(fs.stress.abs());
                    if fs.plastic_strain.abs() > 1e-10 || fs.cracked {
                        yielded = true;
                    }
                }
            }
            fiber_status.push(FiberElementStatus {
                element_id: elem.id,
                yielded,
                max_strain,
                max_stress,
            });
        }
    }

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let mut f_int_final = vec![0.0; n];
        let mut k_t_final = vec![0.0; n * n];
        let mut elem_states_copy = elem_states;
        assemble_fiber_elements_3d(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut elem_states_copy, n_ip,
            &mut f_int_final, &mut k_t_final,
        );
        assemble_elastic_elements_3d(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut f_int_final, &mut k_t_final,
        );
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_t_final, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &f_total[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(FiberNonlinearResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions: vec![],
            element_forces,
            plate_stresses: super::linear::compute_plate_stresses(&input.solver, &dof_num, &u_full),
            quad_stresses: super::linear::compute_quad_stresses(&input.solver, &dof_num, &u_full),
            quad_nodal_stresses: vec![],
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            timings: None,
        },
        iterations: total_iters,
        converged,
        n_increments: input.n_increments,
        fiber_status,
    })
}

/// Assemble 3D fiber element contributions.
fn assemble_fiber_elements_3d(
    solver: &SolverInput3D,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &mut HashMap<usize, ElementFiberState>,
    n_ip: usize,
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    let node_by_id: HashMap<usize, &SolverNode3D> = solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }

        let sec_key = elem.section_id.to_string();
        let section = match fiber_sections.get(&sec_key) {
            Some(s) => s,
            None => continue,
        };

        let es = match elem_states.get_mut(&elem.id) {
            Some(s) => s,
            None => continue,
        };

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();

        // Get GJ for torsion
        let mat = mat_by_id[&elem.material_id];
        let sec3d = sec_by_id[&elem.section_id];
        let e_val = mat.e * 1000.0;
        let g = e_val / (2.0 * (1.0 + mat.nu));
        let gj = g * sec3d.j;

        let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if dofs.len() < 12 { continue; }

        // Extract element displacements
        let mut u_global = [0.0; 12];
        for i in 0..12 {
            u_global[i] = u_full[dofs[i]];
        }

        // Transform to local
        let (ex, ey, ez) = compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, false,
        );
        let t = frame_transform_3d(&ex, &ey, &ez);
        let mut u_local = [0.0; 12];
        for i in 0..12 {
            for j in 0..12 {
                u_local[i] += t[i * 12 + j] * u_global[j];
            }
        }

        let (f_local, k_local) = fiber_element_response_3d(
            &u_local, l, section, &mut es.section_states, n_ip, gj,
        );

        let k_global = transform_stiffness(&k_local, &t, 12);
        let mut f_global = [0.0; 12];
        for i in 0..12 {
            for j in 0..12 {
                f_global[i] += t[j * 12 + i] * f_local[j];
            }
        }

        for i in 0..12 {
            f_int[dofs[i]] += f_global[i];
            for j in 0..12 {
                k_t[dofs[i] * n + dofs[j]] += k_global[i * 12 + j];
            }
        }
    }
}

/// Assemble elastic (non-fiber) 3D frame elements.
fn assemble_elastic_elements_3d(
    solver: &SolverInput3D,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    let node_by_id: HashMap<usize, &SolverNode3D> = solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let sec_key = elem.section_id.to_string();

        // Skip fiber elements (handled separately)
        if fiber_sections.contains_key(&sec_key) && elem.elem_type != "truss" && elem.elem_type != "cable" {
            continue;
        }

        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let e_val = mat.e * 1000.0;
        let g = e_val / (2.0 * (1.0 + mat.nu));
        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();

        let k_local = crate::element::frame_local_stiffness_3d(
            e_val, sec.a, sec.iy, sec.iz, sec.j, l, g,
            elem.hinge_start, elem.hinge_end, 0.0, 0.0,
        );

        let (ex, ey, ez) = compute_local_axes_3d(
            node_i.x, node_i.y, node_i.z,
            node_j.x, node_j.y, node_j.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, false,
        );
        let t = frame_transform_3d(&ex, &ey, &ez);

        let k_global = transform_stiffness(&k_local, &t, 12);

        let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if dofs.len() < 12 { continue; }

        for i in 0..12 {
            for j in 0..12 {
                k_t[dofs[i] * n + dofs[j]] += k_global[i * 12 + j];
                f_int[dofs[i]] += k_global[i * 12 + j] * u_full[dofs[j]];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_cantilever_fiber() -> FiberNonlinearInput {
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, y: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.08, iz: 0.001067, as_y: None });

        let mut elements = HashMap::new();
        elements.insert("1".into(), SolverElement {
            id: 1, elem_type: "frame".into(),
            node_i: 0, node_j: 1, material_id: 1, section_id: 1,
            hinge_start: false, hinge_end: false,
        });

        let mut supports = HashMap::new();
        supports.insert("0".into(), SolverSupport {
            id: 0, node_id: 0, support_type: "fixed".into(),
            kx: None, ky: None, kz: None,
            dx: None, dy: None, drz: None, angle: None,
        });

        let solver = SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fy: -50.0, mz: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        };

        // 0.2m × 0.4m rectangular section
        let mut fiber_sections = HashMap::new();
        fiber_sections.insert("1".into(), rectangular_fiber_section(
            0.2, 0.4, 10,
            FiberMaterial::Elastic { e: 200_000.0 },
        ));

        FiberNonlinearInput {
            solver,
            fiber_sections,
            n_integration_points: 3,
            max_iter: 30,
            tolerance: 1e-6,
            n_increments: 1,
        }
    }

    #[test]
    fn test_fiber_elastic_cantilever() {
        let input = make_cantilever_fiber();
        let result = solve_fiber_nonlinear_2d(&input).unwrap();
        assert!(result.converged, "Should converge for elastic problem");

        // Compare tip deflection with analytical: δ = PL³/(3EI)
        let p = 50.0;
        let l = 5.0;
        let e = 200_000.0 * 1000.0; // kN/m²
        let iz = 0.2 * 0.4_f64.powi(3) / 12.0; // m⁴
        let expected = p * l * l * l / (3.0 * e * iz);

        let d1 = result.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
        let got = d1.uy.abs();
        assert!(
            (got - expected).abs() / expected < 0.1,
            "Tip deflection: got {} expected {} (error {}%)",
            got, expected, (got - expected).abs() / expected * 100.0
        );
    }

    #[test]
    fn test_fiber_steel_yielding() {
        let mut input = make_cantilever_fiber();
        // Use steel with yielding
        input.fiber_sections.insert("1".into(), rectangular_fiber_section(
            0.2, 0.4, 10,
            FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.01 },
        ));
        input.n_increments = 10;
        // Increase load to cause yielding
        input.solver.loads = vec![SolverLoad::Nodal(SolverNodalLoad {
            node_id: 1, fx: 0.0, fy: -500.0, mz: 0.0,
        })];

        let result = solve_fiber_nonlinear_2d(&input).unwrap();
        assert!(result.converged, "Should converge with incremental loading");

        // Check that some fibers have yielded
        let any_yielded = result.fiber_status.iter().any(|s| s.yielded);
        assert!(any_yielded, "Under large load, fibers should yield");
    }
}
