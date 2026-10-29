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
use crate::element::{frame_transform_2d, compute_local_axes_3d, frame_transform_3d, Hinge3D};
use super::dof::DofNumbering;
use super::assembly::{self, InclinedFrame};
use super::constraints::FreeConstraintSystem;
use super::sparse_tangent::{SparseSymbolicCache, cached_symbolic, tangent_free_sparse_triplets, solve_tangent_sparse};

/// Fiber nonlinear analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiberNonlinearInput {
    pub solver: SolverInput,
    /// Fiber section definitions per section ID
    pub fiber_sections: HashMap<String, FiberSectionDef>,
    /// Number of Gauss-Lobatto integration points per element (3-7, default 5;
    /// other values are refused)
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
    /// Use Modified Newton-Raphson (reuse tangent from iteration 0)
    #[serde(default)]
    pub modified_nr: bool,
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
    let mut r = solve_fiber_nonlinear_2d_contained(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Fiber).into_iter().filter(|d| !r.converged || d.phase.as_deref() != Some("NL-17")).collect());
    Ok(r)
}

fn solve_fiber_nonlinear_2d_contained(input: &FiberNonlinearInput) -> Result<FiberNonlinearResult, String> {
    // Assembly resolves ids by direct map indexing: an element naming a
    // node that does not exist panicked there, which in WASM ends the
    // module rather than the call.
    super::linear::validate_input_2d(&input.solver)?;
    // Fiber members are Euler–Bernoulli and continuous at both ends, and the
    // tangent has no prescribed displacements. Connectors are supported
    // (fix/nonlinear-solvers) and inclined supports are solved in their frames
    // (fix/inclined-supports).
    super::feature_gates::refuse_2d(&input.solver, "Fiber-nonlinear analysis", &[
        super::feature_gates::Feature::PrescribedDisplacements,
        super::feature_gates::Feature::ShearDeformation, super::feature_gates::Feature::MomentReleases,
    ])?;

    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    // 3..=7 Gauss-Lobatto points: 2 (the end sections only) integrates the
    // quadratic κ² of the cubic element with the trapezoidal rule, so even an
    // elastic member would get the wrong stiffness; it used to be clamped
    // silently into [2, 7] (SP-5).
    let n_ip = input.n_integration_points;
    if !(3..=7).contains(&n_ip) {
        return Err(format!(
            "Fiber-nonlinear analysis: nIntegrationPoints = {n_ip}; use 3 to 7 integration points \
             (Gauss-Lobatto, end sections included)"
        ));
    }

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Reference load vector
    // The iteration keeps u, f_int and the loads in global axes, where the
    // element state lives; each Newton step is solved in the inclined-roller
    // frames the restraints are numbered in: the tangent and the residual are
    // rotated into them and the correction rotated back.
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let art = assembly::artificial_stiffness_entries(&asm);
    let its = asm.inclined_transforms_2d;
    let f_total = assembly::assemble_load_vector_2d(&input.solver, &input.solver.loads, &dof_num, &[]);

    // Initialize per-element fiber states
    let mut elem_states: HashMap<usize, ElementFiberState> = HashMap::new();
    for elem in crate::ordered::values(&input.solver.elements) {
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

    // Sparse symbolic Cholesky reused across increments/iterations (the
    // tangent pattern is constant; the fingerprinted cache rebuilds it if
    // it ever changes). Used only when ns >= SPARSE_THRESHOLD.
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    // Incremental loading
    for inc in 1..=input.n_increments {
        let load_factor = inc as f64 / input.n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;
        // Fiber history (plastic strain, back stress, cracking) at the start of
        // the increment. Every iteration evaluates the elements from it, so a
        // trial iterate that overshoots leaves nothing behind; the state of the
        // converged iterate is what stays (SP-6).
        let committed: HashMap<usize, Vec<SectionState>> = elem_states
            .iter()
            .map(|(&id, es)| (id, es.section_states.clone()))
            .collect();
        let mut cached_l: Option<(Vec<f64>, usize)> = None;
        // Modified-NR sparse cache: numeric factor of the increment's first
        // tangent (sparse analogue of cached_l).
        let mut cached_sparse_num: Option<NumericCholesky> = None;

        for _iter in 0..input.max_iter {
            total_iters += 1;
            for (id, es) in elem_states.iter_mut() {
                es.section_states.clone_from(&committed[id]);
            }

            // Assemble tangent stiffness and internal forces from fiber elements.
            // Below SPARSE_THRESHOLD the tangent is assembled dense (n×n); at
            // or above it, as lower-triangle COO triplets that feed the CSC
            // sparse solve directly — no O(n²) dense matrix is ever built.
            let mut f_int = vec![0.0; n];
            let sparse_tangent = ns >= super::linear::SPARSE_THRESHOLD;
            let mut k_t: Vec<f64> = Vec::new();
            let mut trip_rows: Vec<usize> = Vec::new();
            let mut trip_cols: Vec<usize> = Vec::new();
            let mut trip_vals: Vec<f64> = Vec::new();

            if sparse_tangent {
                let mut scatter = |gi: usize, gj: usize, v: f64| {
                    if gi >= gj {
                        trip_rows.push(gi);
                        trip_cols.push(gj);
                        trip_vals.push(v);
                    }
                };
                assemble_fiber_elements(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut elem_states, n_ip,
                    &mut f_int, &mut scatter,
                );

                // Add non-fiber elements (truss, elastic frame without fiber section)
                assemble_elastic_elements(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut f_int, &mut scatter,
                );

                // Add spring contributions
                add_springs(&input.solver, &dof_num, &u_full, &mut f_int, &art, &mut scatter);
            } else {
                k_t = vec![0.0; n * n];
                let mut scatter = |gi: usize, gj: usize, v: f64| k_t[gi * n + gj] += v;
                assemble_fiber_elements(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut elem_states, n_ip,
                    &mut f_int, &mut scatter,
                );

                // Add non-fiber elements (truss, elastic frame without fiber section)
                assemble_elastic_elements(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut f_int, &mut scatter,
                );

                // Add spring contributions
                add_springs(&input.solver, &dof_num, &u_full, &mut f_int, &art, &mut scatter);
            }

            // Into the inclined-support frames: tangent and residual.
            for it in &its {
                if sparse_tangent {
                    it.rotate_triplets(&mut trip_rows, &mut trip_cols, &mut trip_vals);
                } else {
                    it.rotate_dense(&mut k_t, n);
                }
            }

            // Residual
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }
            let residual = assembly::to_inclined_free(residual, &its, nf);

            // Check convergence on independent (reduced) DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let r_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f.clone()
            };
            let f_ext_f: Vec<f64> = assembly::to_inclined_free(f_ext.clone(), &its, nf);
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
            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if sparse_tangent {
                // Sparse path: CSC free block built directly from the
                // lower-triangle triplets (no dense n×n tangent), then
                // sparse Cholesky with cached symbolic.
                if input.modified_nr {
                    if let Some(ref num) = cached_sparse_num {
                        sparse_cholesky_solve(num, &r_s)
                    } else {
                        let k_csc = tangent_free_sparse_triplets(
                            &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                        );
                        let sym = cached_symbolic(&mut sparse_sym_cache, &k_csc);
                        match numeric_cholesky(sym, &k_csc) {
                            Some(num) => {
                                let result = sparse_cholesky_solve(&num, &r_s);
                                cached_sparse_num = Some(num);
                                result
                            }
                            None => {
                                // Sparse factorization failed — fall back to full NR
                                // for this increment (same semantics as dense path).
                                solve_tangent_sparse(&k_csc, &r_s, &mut sparse_sym_cache)?
                            }
                        }
                    }
                } else {
                    let k_csc = tangent_free_sparse_triplets(
                        &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                    );
                    solve_tangent_sparse(&k_csc, &r_s, &mut sparse_sym_cache)?
                }
            } else if input.modified_nr {
                if let Some((ref l, sz)) = cached_l {
                    let y = forward_solve(l, &r_s, sz);
                    back_solve(l, &y, sz)
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    let mut l = k_s.clone();
                    if cholesky_decompose(&mut l, ns) {
                        let y = forward_solve(&l, &r_s, ns);
                        let result = back_solve(&l, &y, ns);
                        cached_l = Some((l, ns));
                        result
                    } else {
                        // Cholesky failed — fall back to full NR
                        let mut k_work = k_s;
                        let mut f_work = r_s;
                        lu_solve(&mut k_work, &mut f_work, ns)
                            .ok_or("Singular tangent stiffness in fiber N-R")?
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

            let delta_u_g = assembly::to_global(&delta_u_f, n, &its);
            for i in 0..n {
                u_full[i] += delta_u_g[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    // Build results
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);
    let mut element_forces = super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);
    fiber_member_forces_2d(&input.solver, &input.fiber_sections, &dof_num, &u_full, &elem_states, n_ip, &mut element_forces);

    // Collect fiber status
    let mut fiber_status = Vec::new();
    for elem in crate::ordered::values(&input.solver.elements) {
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
        let mut scatter = |gi: usize, gj: usize, v: f64| k_t_final[gi * n + gj] += v;
        assemble_fiber_elements(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut elem_states_copy, n_ip,
            &mut f_int_final, &mut scatter,
        );
        assemble_elastic_elements(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut f_int_final, &mut scatter,
        );
        add_springs(&input.solver, &dof_num, &u_full, &mut f_int_final, &art, &mut scatter);
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_t_final, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &f_total[..nf]);
        fcs.constraint_forces(&raw, &dof_num)
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
            structured_diagnostics: vec![],
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        n_increments: input.n_increments,
        fiber_status,
    })
}

/// Member end forces of the fiber members from their fiber section resultants.
///
/// `compute_internal_forces_2d` gives K_elastic·u_local − FEF with the
/// SolverSection's A and Iz; once a section yields that is not the force the
/// member carries (SP-7). For each fiber member this replaces the K_elastic·u
/// part by the element's internal force vector f = Σ w·Bᵀ·s at the converged
/// state, keeping the fixed-end-force part and the sign mapping of the linear
/// recovery (n_start = −f₀, n_end = f₃, v_start = f₁, v_end = −f₄,
/// m_start = f₂, m_end = −f₅).
fn fiber_member_forces_2d(
    solver: &SolverInput,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &HashMap<usize, ElementFiberState>,
    n_ip: usize,
    forces: &mut [ElementForces],
) {
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = crate::ordered::values(&solver.sections).map(|s| (s.id, s)).collect();
    for ef in forces.iter_mut() {
        let Some(elem) = crate::ordered::values(&solver.elements).find(|e| e.id == ef.element_id) else { continue };
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }
        let (Some(section), Some(es)) = (fiber_sections.get(&elem.section_id.to_string()), elem_states.get(&elem.id)) else { continue };
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let (dx, dy) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dy * dy).sqrt();
        let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if dofs.len() < 6 { continue; }
        let t = frame_transform_2d(dx / l, dy / l);
        let mut u_local = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                u_local[i] += t[i * 6 + j] * u_full[dofs[j]];
            }
        }
        let mut states = es.section_states.clone();
        let (f_fiber, _) = fiber_element_response_2d(&u_local, l, section, &mut states, n_ip);
        let e = mat_by_id[&elem.material_id].e * 1000.0;
        let sec = sec_by_id[&elem.section_id];
        // The elastic end forces to remove are those the linear recovery added:
        // with the same Timoshenko φ when the section has a shear area.
        let phi = crate::element::timoshenko_phi_2d(sec, e, mat_by_id[&elem.material_id].nu, l);
        let k_el = crate::element::frame_local_stiffness_2d(e, sec.a, sec.iz, l, elem.hinge_start, elem.hinge_end, phi);
        let mut d = [0.0; 6];
        for i in 0..6 {
            d[i] = f_fiber[i] - (0..6).map(|j| k_el[i * 6 + j] * u_local[j]).sum::<f64>();
        }
        ef.n_start -= d[0];
        ef.n_end += d[3];
        ef.v_start += d[1];
        ef.v_end -= d[4];
        ef.m_start += d[2];
        ef.m_end -= d[5];
    }
}

/// 3D twin of [`fiber_member_forces_2d`] (12 DOFs, same start/end sign mapping
/// as `compute_internal_forces_3d`).
fn fiber_member_forces_3d(
    solver: &SolverInput3D,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &HashMap<usize, ElementFiberState>,
    n_ip: usize,
    forces: &mut [ElementForces3D],
) {
    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = crate::ordered::values(&solver.sections).map(|s| (s.id, s)).collect();
    for ef in forces.iter_mut() {
        let Some(elem) = crate::ordered::values(&solver.elements).find(|e| e.id == ef.element_id) else { continue };
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }
        let (Some(section), Some(es)) = (fiber_sections.get(&elem.section_id.to_string()), elem_states.get(&elem.id)) else { continue };
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let (dx, dy, dz) = (nj.x - ni.x, nj.y - ni.y, nj.z - ni.z);
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
        if dofs.len() < 12 { continue; }
        let (ex, ey, ez) = compute_local_axes_3d(
            ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
            elem.local_yx, elem.local_yy, elem.local_yz, elem.roll_angle, false,
        );
        let t = frame_transform_3d(&ex, &ey, &ez);
        let mut u_local = [0.0; 12];
        for i in 0..12 {
            for j in 0..12 {
                u_local[i] += t[i * 12 + j] * u_full[dofs[j]];
            }
        }
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));
        let mut states = es.section_states.clone();
        let (f_fiber, _) = fiber_element_response_3d(&u_local, l, section, &mut states, n_ip, g * sec.j);
        // Same Timoshenko (φy, φz) as the linear recovery whose elastic forces this removes.
        let (phi_y, phi_z) = crate::element::timoshenko_phi_3d(sec, e, g, l);
        let k_el = crate::element::frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, Hinge3D::from_elem(elem), phi_y, phi_z);
        let mut d = [0.0; 12];
        for i in 0..12 {
            d[i] = f_fiber[i] - (0..12).map(|j| k_el[i * 12 + j] * u_local[j]).sum::<f64>();
        }
        ef.n_start -= d[0];
        ef.n_end += d[6];
        ef.vy_start += d[1];
        ef.vy_end -= d[7];
        ef.vz_start += d[2];
        ef.vz_end -= d[8];
        ef.mx_start += d[3];
        ef.mx_end -= d[9];
        ef.my_start += d[4];
        ef.my_end -= d[10];
        ef.mz_start += d[5];
        ef.mz_end -= d[11];
    }
}

/// Assemble fiber element contributions to global K_t and f_int.
///
/// `scatter(gi, gj, v)` accumulates one tangent entry: dense `k_t[gi*n+gj]`
/// for the small-model path, lower-triangle triplets for the sparse path.
fn assemble_fiber_elements(
    solver: &SolverInput,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &mut HashMap<usize, ElementFiberState>,
    n_ip: usize,
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();

    for elem in crate::ordered::values(&solver.elements) {
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
        let dy = node_j.z - node_i.z;
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
                scatter(dofs[i], dofs[j], k_global[i * 6 + j]);
            }
        }
    }
}

/// Assemble elastic (non-fiber) frame elements.
/// `scatter` receives the tangent entries (see `assemble_fiber_elements`).
fn assemble_elastic_elements(
    solver: &SolverInput,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let node_by_id: HashMap<usize, &SolverNode> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection> = crate::ordered::values(&solver.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&solver.elements) {
        let sec_key = elem.section_id.to_string();

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            // Truss element
            let node_i = node_by_id[&elem.node_i];
            let node_j = node_by_id[&elem.node_j];
            let mat = mat_by_id[&elem.material_id];
            let sec = sec_by_id[&elem.section_id];
            let e = mat.e * 1000.0;
            let dx = node_j.x - node_i.x;
            let dy = node_j.z - node_i.z;
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
                    scatter(dofs[i], dofs[j], ea_l * val);
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
            let dy = node_j.z - node_i.z;
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
                    scatter(dofs[i], dofs[j], k_global[i * 6 + j]);
                    f_int[dofs[i]] += k_global[i * 6 + j] * u_full[dofs[j]];
                }
            }
        }
    }
}

/// Add spring stiffness and forces.
/// `scatter` receives the diagonal stiffness entries (see above).
fn add_springs(
    solver: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    art: &[(usize, f64)],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    // Shared with the linear assembler (angle, rotational springs on any support).
    for (i, j, k) in super::assembly::support_spring_entries_2d(solver, dof_num) {
        scatter(i, j, k);
        f_int[i] += k * u_full[j];
    }
    // Connectors, small displacements as in the linear assembler.
    for (i, j, k) in crate::element::connector::connector_entries_2d(solver, dof_num) {
        scatter(i, j, k);
        f_int[i] += k * u_full[j];
    }
    // The linear assembler's artificial stiffness on DOFs nothing else holds.
    for &(d, k) in art {
        scatter(d, d, k);
        f_int[d] += k * u_full[d];
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
    /// Use Modified Newton-Raphson (reuse tangent from iteration 0)
    #[serde(default)]
    pub modified_nr: bool,
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
    let mut r = solve_fiber_nonlinear_3d_contained(input)?;
    crate::known_issues::attach(&mut r.results.structured_diagnostics, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Fiber).into_iter().filter(|d| !r.converged || d.phase.as_deref() != Some("NL-17")).collect());
    Ok(r)
}

fn solve_fiber_nonlinear_3d_contained(input: &FiberNonlinearInput3D) -> Result<FiberNonlinearResult3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    // As in 2D, plus warping and shells, which the fiber tangent has no
    // element for.
    super::feature_gates::refuse_3d(&input.solver, "Fiber-nonlinear analysis", &[
        super::feature_gates::Feature::PrescribedDisplacements,
        super::feature_gates::Feature::ShearDeformation, super::feature_gates::Feature::MomentReleases, super::feature_gates::Feature::Warping, super::feature_gates::Feature::Shells,
    ])?;
    // Curved beams are expanded into straight members, as every static path
    // does; left in place they were not part of the model at all.
    let expanded = (!input.solver.curved_beams.is_empty()).then(|| {
        let mut e = input.clone();
        e.solver = super::linear::expand_curved_beams_3d(&input.solver);
        e
    });
    let input = expanded.as_ref().unwrap_or(input);
    let pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_3d(&input.solver);
    super::pre_solve_gates::refuse_broken_elements(&pre_solve_diags)?;

    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    // 3..=7 Gauss-Lobatto points: 2 (the end sections only) integrates the
    // quadratic κ² of the cubic element with the trapezoidal rule, so even an
    // elastic member would get the wrong stiffness; it used to be clamped
    // silently into [2, 7] (SP-5).
    let n_ip = input.n_integration_points;
    if !(3..=7).contains(&n_ip) {
        return Err(format!(
            "Fiber-nonlinear analysis: nIntegrationPoints = {n_ip}; use 3 to 7 integration points \
             (Gauss-Lobatto, end sections included)"
        ));
    }

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_3d(&input.solver, &dof_num)?;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Global-axes iteration, steps solved in the inclined-support frames (see 2D).
    let its = assembly::assemble_stiffness_3d(&input.solver, &dof_num).inclined_transforms;
    let f_total = assembly::assemble_load_vector_3d_dense(&input.solver, &input.solver.loads, &dof_num, &[]);

    // Initialize per-element fiber states
    let mut elem_states: HashMap<usize, ElementFiberState> = HashMap::new();
    for elem in crate::ordered::values(&input.solver.elements) {
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

    // Sparse symbolic Cholesky reused across increments/iterations (the
    // tangent pattern is constant; the fingerprinted cache rebuilds it if
    // it ever changes). Used only when ns >= SPARSE_THRESHOLD.
    let mut sparse_sym_cache: Option<SparseSymbolicCache> = None;

    for inc in 1..=input.n_increments {
        let load_factor = inc as f64 / input.n_increments as f64;
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();

        let mut nr_converged = false;
        // Fiber history (plastic strain, back stress, cracking) at the start of
        // the increment. Every iteration evaluates the elements from it, so a
        // trial iterate that overshoots leaves nothing behind; the state of the
        // converged iterate is what stays (SP-6).
        let committed: HashMap<usize, Vec<SectionState>> = elem_states
            .iter()
            .map(|(&id, es)| (id, es.section_states.clone()))
            .collect();
        let mut cached_l: Option<(Vec<f64>, usize)> = None;
        // Modified-NR sparse cache: numeric factor of the increment's first
        // tangent (sparse analogue of cached_l).
        let mut cached_sparse_num: Option<NumericCholesky> = None;

        for _iter in 0..input.max_iter {
            total_iters += 1;
            for (id, es) in elem_states.iter_mut() {
                es.section_states.clone_from(&committed[id]);
            }

            // Assemble tangent stiffness and internal forces from fiber elements.
            // Below SPARSE_THRESHOLD the tangent is assembled dense (n×n); at
            // or above it, as lower-triangle COO triplets that feed the CSC
            // sparse solve directly — no O(n²) dense matrix is ever built.
            let mut f_int = vec![0.0; n];
            let sparse_tangent = ns >= super::linear::SPARSE_THRESHOLD;
            let mut k_t: Vec<f64> = Vec::new();
            let mut trip_rows: Vec<usize> = Vec::new();
            let mut trip_cols: Vec<usize> = Vec::new();
            let mut trip_vals: Vec<f64> = Vec::new();

            if sparse_tangent {
                let mut scatter = |gi: usize, gj: usize, v: f64| {
                    if gi >= gj {
                        trip_rows.push(gi);
                        trip_cols.push(gj);
                        trip_vals.push(v);
                    }
                };
                assemble_fiber_elements_3d(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut elem_states, n_ip,
                    &mut f_int, &mut scatter,
                );

                assemble_elastic_elements_3d(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut f_int, &mut scatter,
                );
                add_springs_3d(&input.solver, &dof_num, &u_full, &mut f_int, &mut scatter);
            } else {
                k_t = vec![0.0; n * n];
                let mut scatter = |gi: usize, gj: usize, v: f64| k_t[gi * n + gj] += v;
                assemble_fiber_elements_3d(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut elem_states, n_ip,
                    &mut f_int, &mut scatter,
                );

                assemble_elastic_elements_3d(
                    &input.solver, &input.fiber_sections, &dof_num,
                    &u_full, &mut f_int, &mut scatter,
                );
                add_springs_3d(&input.solver, &dof_num, &u_full, &mut f_int, &mut scatter);
            }

            // Into the inclined-support frames: tangent and residual.
            for it in &its {
                if sparse_tangent {
                    it.rotate_triplets(&mut trip_rows, &mut trip_cols, &mut trip_vals);
                } else {
                    it.rotate_dense(&mut k_t, n);
                }
            }

            // Residual
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }
            let residual = assembly::to_inclined_free(residual, &its, nf);

            // Check convergence on independent (reduced) DOFs
            let r_f: Vec<f64> = residual[..nf].to_vec();
            let r_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f.clone()
            };
            let f_ext_f: Vec<f64> = assembly::to_inclined_free(f_ext.clone(), &its, nf);
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

            let r_s = if let Some(ref cs) = cs {
                cs.reduce_vector(&r_f)
            } else {
                r_f
            };

            let delta_u_indep = if sparse_tangent {
                // Sparse path: CSC free block built directly from the
                // lower-triangle triplets (no dense n×n tangent), then
                // sparse Cholesky with cached symbolic.
                if input.modified_nr {
                    if let Some(ref num) = cached_sparse_num {
                        sparse_cholesky_solve(num, &r_s)
                    } else {
                        let k_csc = tangent_free_sparse_triplets(
                            &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                        );
                        let sym = cached_symbolic(&mut sparse_sym_cache, &k_csc);
                        match numeric_cholesky(sym, &k_csc) {
                            Some(num) => {
                                let result = sparse_cholesky_solve(&num, &r_s);
                                cached_sparse_num = Some(num);
                                result
                            }
                            None => {
                                // Sparse factorization failed — fall back to full NR
                                // for this increment (same semantics as dense path).
                                solve_tangent_sparse(&k_csc, &r_s, &mut sparse_sym_cache)?
                            }
                        }
                    }
                } else {
                    let k_csc = tangent_free_sparse_triplets(
                        &trip_rows, &trip_cols, &trip_vals, nf, &cs,
                    );
                    solve_tangent_sparse(&k_csc, &r_s, &mut sparse_sym_cache)?
                }
            } else if input.modified_nr {
                if let Some((ref l, sz)) = cached_l {
                    let y = forward_solve(l, &r_s, sz);
                    back_solve(l, &y, sz)
                } else {
                    let free_idx: Vec<usize> = (0..nf).collect();
                    let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
                    let k_s = if let Some(ref cs) = cs {
                        cs.reduce_matrix(&k_ff)
                    } else {
                        k_ff
                    };
                    let mut l = k_s.clone();
                    if cholesky_decompose(&mut l, ns) {
                        let y = forward_solve(&l, &r_s, ns);
                        let result = back_solve(&l, &y, ns);
                        cached_l = Some((l, ns));
                        result
                    } else {
                        let mut k_work = k_s;
                        let mut f_work = r_s;
                        lu_solve(&mut k_work, &mut f_work, ns)
                            .ok_or("Singular tangent stiffness in 3D fiber N-R")?
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

            let delta_u_g = assembly::to_global(&delta_u_f, n, &its);
            for i in 0..n {
                u_full[i] += delta_u_g[i];
            }
        }

        if !nr_converged {
            converged = false;
            break;
        }
    }

    // Build results
    let displacements = super::linear::build_displacements_3d(&dof_num, &u_full);
    let mut element_forces = super::linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);
    fiber_member_forces_3d(&input.solver, &input.fiber_sections, &dof_num, &u_full, &elem_states, n_ip, &mut element_forces);

    let mut fiber_status = Vec::new();
    for elem in crate::ordered::values(&input.solver.elements) {
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
        let mut scatter = |gi: usize, gj: usize, v: f64| k_t_final[gi * n + gj] += v;
        assemble_fiber_elements_3d(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut elem_states_copy, n_ip,
            &mut f_int_final, &mut scatter,
        );
        assemble_elastic_elements_3d(
            &input.solver, &input.fiber_sections, &dof_num,
            &u_full, &mut f_int_final, &mut scatter,
        );
        add_springs_3d(&input.solver, &dof_num, &u_full, &mut f_int_final, &mut scatter);
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_t_final, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &f_total[..nf]);
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(FiberNonlinearResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions: vec![],
            element_forces,
            plate_stresses: super::linear::compute_plate_stresses(&input.solver, &dof_num, &u_full, None),
            quad_stresses: super::linear::compute_quad_stresses(&input.solver, &dof_num, &u_full, None),
            quad_nodal_stresses: vec![],
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            structured_diagnostics: pre_solve_diags,
            equilibrium: None,
            timings: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations: total_iters,
        converged,
        n_increments: input.n_increments,
        fiber_status,
    })
}

/// Support springs, 3D. The 3D fiber solver had none: a spring support was a
/// free node, and a beam propped by a spring was solved as a cantilever.
fn add_springs_3d(
    solver: &SolverInput3D,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    for (i, j, k) in super::assembly::support_spring_entries_3d(solver, dof_num) {
        scatter(i, j, k);
        f_int[i] += k * u_full[j];
    }
    for (i, j, k) in crate::element::connector::connector_entries_3d(solver, dof_num) {
        scatter(i, j, k);
        f_int[i] += k * u_full[j];
    }
}

/// Assemble 3D fiber element contributions.
///
/// `scatter(gi, gj, v)` accumulates one tangent entry: dense `k_t[gi*n+gj]`
/// for the small-model path, lower-triangle triplets for the sparse path.
fn assemble_fiber_elements_3d(
    solver: &SolverInput3D,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    elem_states: &mut HashMap<usize, ElementFiberState>,
    n_ip: usize,
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = crate::ordered::values(&solver.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&solver.elements) {
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
                scatter(dofs[i], dofs[j], k_global[i * 12 + j]);
            }
        }
    }
}

/// Assemble elastic (non-fiber) 3D frame elements.
/// `scatter` receives the tangent entries (see `assemble_fiber_elements_3d`).
fn assemble_elastic_elements_3d(
    solver: &SolverInput3D,
    fiber_sections: &HashMap<String, FiberSectionDef>,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    scatter: &mut impl FnMut(usize, usize, f64),
) {
    let node_by_id: HashMap<usize, &SolverNode3D> = crate::ordered::values(&solver.nodes).map(|n| (n.id, n)).collect();
    let mat_by_id: HashMap<usize, &SolverMaterial> = crate::ordered::values(&solver.materials).map(|m| (m.id, m)).collect();
    let sec_by_id: HashMap<usize, &SolverSection3D> = crate::ordered::values(&solver.sections).map(|s| (s.id, s)).collect();

    for elem in crate::ordered::values(&solver.elements) {
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

        // A truss or cable member is axial only. It was assembled here as a
        // full frame member, so a pin-ended brace carried end moments.
        let k_local = if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k = e_val * sec.a / l;
            let mut kl = vec![0.0; 144];
            kl[0] = k;
            kl[6] = -k;
            kl[6 * 12] = -k;
            kl[6 * 12 + 6] = k;
            kl
        } else {
            crate::element::frame_local_stiffness_3d(
                e_val, sec.a, sec.iy, sec.iz, sec.j, l, g,
                Hinge3D::from_elem(elem),
                0.0, 0.0,
            )
        };

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
                scatter(dofs[i], dofs[j], k_global[i * 12 + j]);
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
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, z: 0.0 });

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
            dx: None, dz: None, dry: None, angle: None,
        });

        let solver = SolverInput {
            solver_options: None, masses: Default::default(),
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fz: -50.0, my: 0.0,
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
            modified_nr: false,
        }
    }

    /// Review of #330. `fiber_member_forces_2d/3d` replace the elastic end forces K·u that the
    /// linear recovery reported with the fiber resultants. They subtracted the Euler–Bernoulli K
    /// while the recovery used the Timoshenko K of a section with shear areas, so a spurious
    /// (K_T − K_EB)·u stayed in the result. Now both use `timoshenko_phi_2d/3d`, and the
    /// reported end forces are exactly the fiber resultants minus the FEF.
    ///
    /// The fiber solvers refuse shear areas today (feature gate), so this is checked here on
    /// the helper directly, at an arbitrary displacement, instead of through a solve.
    #[test]
    fn fiber_member_forces_with_shear_areas_are_resultants_minus_fef_2d() {
        let mut input = make_cantilever_fiber();
        input.solver.sections.get_mut("1").unwrap().as_y = Some(0.0667);
        let q = -12.0;
        input.solver.loads = vec![SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: q, q_j: q, a: None, b: None })];
        let dof_num = DofNumbering::build_2d(&input.solver);
        let mut u_full = vec![0.0; dof_num.n_total];
        for (k, v) in [(0usize, 1.0e-4), (1, -3.0e-3), (2, 8.0e-4)] {
            u_full[dof_num.global_dof(1, k).unwrap()] = v;
        }
        let n_ip = 3;
        let section = &input.fiber_sections["1"];
        let mut elem_states = HashMap::new();
        elem_states.insert(1, ElementFiberState {
            _section_id: "1".into(),
            section_states: (0..n_ip).map(|_| SectionState::new(section.fibers.len())).collect(),
        });
        let mut forces = super::super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);
        fiber_member_forces_2d(&input.solver, &input.fiber_sections, &dof_num, &u_full, &elem_states, n_ip, &mut forces);

        let l = 5.0;
        let u_local = [0.0, 0.0, 0.0, u_full[dof_num.global_dof(1, 0).unwrap()], u_full[dof_num.global_dof(1, 1).unwrap()], u_full[dof_num.global_dof(1, 2).unwrap()]];
        let mut st: Vec<SectionState> = (0..n_ip).map(|_| SectionState::new(section.fibers.len())).collect();
        let (f, _) = fiber_element_response_2d(&u_local, l, section, &mut st, n_ip);
        let fef = crate::element::fef_distributed_2d(q, q, l, 0.0); // uniform: independent of φ
        let d: Vec<f64> = (0..6).map(|i| f[i] - fef[i]).collect();
        let ef = &forces[0];
        let got = [ef.n_start, ef.v_start, ef.m_start, ef.n_end, ef.v_end, ef.m_end];
        let want = [-d[0], d[1], d[2], d[3], -d[4], -d[5]];
        let scale = want.iter().fold(0.0f64, |a, v| a.max(v.abs()));
        for k in 0..6 {
            assert!((got[k] - want[k]).abs() < 1e-9 * scale, "component {k}: {} vs {}", got[k], want[k]);
        }
    }

    #[test]
    fn fiber_member_forces_with_shear_areas_are_resultants_minus_fef_3d() {
        use std::collections::HashMap as Map;
        let l = 4.0;
        let mut nodes = Map::new();
        nodes.insert("1".to_string(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
        nodes.insert("2".to_string(), SolverNode3D { id: 2, x: l, y: 0.0, z: 0.0 });
        let mut materials = Map::new();
        materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
        let mut sections = Map::new();
        sections.insert("1".to_string(), SolverSection3D {
            id: 1, name: None, a: 0.08, iy: 0.2 * 0.4f64.powi(3) / 12.0, iz: 0.4 * 0.2f64.powi(3) / 12.0, j: 1e-4,
            cw: None, as_y: Some(0.0667), as_z: Some(0.0667), shear_center_y: None, shear_center_z: None,
        });
        let mut elements = Map::new();
        elements.insert("1".to_string(), SolverElement3D {
            id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2, material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        let mut supports = Map::new();
        supports.insert("1".to_string(), SolverSupport3D {
            node_id: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None, dx: None, dy: None, dz: None,
            drx: None, dry: None, drz: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
        });
        let (qy, qz) = (-7.0, 11.0);
        let solver = SolverInput3D {
            solver_options: None, nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad3D::Distributed(SolverDistributedLoad3D {
                q_xi: 0.0, q_xj: 0.0, element_id: 1, q_yi: qy, q_yj: qy, q_zi: qz, q_zj: qz, a: None, b: None })],
            constraints: vec![], left_hand: None, plates: Map::new(), quads: Map::new(), quad9s: Map::new(),
            solid_shells: Map::new(), curved_shells: Map::new(), curved_beams: vec![], connectors: Map::new(),
            masses: Default::default(),
        };
        let mut fiber_sections = Map::new();
        fiber_sections.insert("1".to_string(), rectangular_fiber_section(0.2, 0.4, 10, FiberMaterial::Elastic { e: 200_000.0 }));
        let section = &fiber_sections["1"];
        let dof_num = DofNumbering::build_3d(&solver);
        let mut u_full = vec![0.0; dof_num.n_total];
        for (k, v) in [(0usize, 1e-4), (1, -2e-3), (2, 3e-3), (3, 1e-4), (4, -6e-4), (5, 5e-4)] {
            u_full[dof_num.global_dof(2, k).unwrap()] = v;
        }
        let n_ip = 3;
        let mut elem_states = HashMap::new();
        elem_states.insert(1, ElementFiberState {
            _section_id: "1".into(),
            section_states: (0..n_ip).map(|_| SectionState::new(section.fibers.len())).collect(),
        });
        let mut forces = super::super::linear::compute_internal_forces_3d(&solver, &dof_num, &u_full);
        fiber_member_forces_3d(&solver, &fiber_sections, &dof_num, &u_full, &elem_states, n_ip, &mut forces);

        let mut u_local = [0.0; 12];
        for k in 0..6 {
            u_local[6 + k] = u_full[dof_num.global_dof(2, k).unwrap()];
        }
        let e = 200_000.0 * 1000.0;
        let g = e / 2.6;
        let mut st: Vec<SectionState> = (0..n_ip).map(|_| SectionState::new(section.fibers.len())).collect();
        let (f, _) = fiber_element_response_3d(&u_local, l, section, &mut st, n_ip, g * 1e-4);
        let fef = crate::element::fef_distributed_3d(qy, qy, qz, qz, l, 0.0, 0.0); // uniform: independent of φ
        let d: Vec<f64> = (0..12).map(|i| f[i] - fef[i]).collect();
        let ef = &forces[0];
        let got = [ef.n_start, ef.vy_start, ef.vz_start, ef.mx_start, ef.my_start, ef.mz_start,
                   ef.n_end, ef.vy_end, ef.vz_end, ef.mx_end, ef.my_end, ef.mz_end];
        let want = [-d[0], d[1], d[2], d[3], d[4], d[5], d[6], -d[7], -d[8], -d[9], -d[10], -d[11]];
        let scale = want.iter().fold(0.0f64, |a, v| a.max(v.abs()));
        for k in 0..12 {
            assert!((got[k] - want[k]).abs() < 1e-9 * scale, "component {k}: {} vs {}", got[k], want[k]);
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
        let got = d1.uz.abs();
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
            node_id: 1, fx: 0.0, fz: -500.0, my: 0.0,
        })];

        let result = solve_fiber_nonlinear_2d(&input).unwrap();
        assert!(result.converged, "Should converge with incremental loading");

        // Check that some fibers have yielded
        let any_yielded = result.fiber_status.iter().any(|s| s.yielded);
        assert!(any_yielded, "Under large load, fibers should yield");
    }
}
