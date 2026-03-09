use crate::types::*;
use crate::linalg::*;
use crate::element::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear::{compute_plate_stresses, compute_quad_stresses};
use super::constraints::FreeConstraintSystem;

/// Free DOFs threshold: use sparse solver when n_free >= this.
const SPARSE_THRESHOLD: usize = 64;

/// Default hardening ratio when not specified in the material model.
const DEFAULT_ALPHA: f64 = 0.01;

/// Per-element state tracking for the nonlinear material analysis.
#[derive(Clone)]
struct ElementState {
    yielded_start: bool,
    yielded_end: bool,
    /// Hardening ratio: EI_effective = alpha * EI when yielded.
    alpha: f64,
}

/// Solve a 2D nonlinear material analysis using incremental load-stepping
/// with Newton-Raphson equilibrium iterations at each increment.
///
/// The yield criterion is a resultant-based interaction:
///   (N / Np)^2 + |M| / Mp <= 1.0
///
/// When an element yields at an end, its flexural stiffness is reduced to
/// alpha * EI (bilinear hardening).
pub fn solve_nonlinear_material_2d(
    input: &NonlinearMaterialInput,
) -> Result<NonlinearMaterialResult, String> {
    let solver = &input.solver;
    let dof_num = DofNumbering::build_2d(solver);

    if dof_num.n_free == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let nr = n - nf;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&solver.constraints, &dof_num, &solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Full elastic assembly to obtain the total external load vector.
    let asm = assembly::assemble_2d(solver, &dof_num);
    let f_total = asm.f.clone();

    // Build prescribed displacement vector u_r for restrained DOFs.
    let mut u_r = vec![0.0; nr];
    for sup in solver.supports.values() {
        if sup.support_type == "spring" {
            continue;
        }
        let prescribed: [(usize, Option<f64>); 3] = [
            (0, sup.dx),
            (1, sup.dy),
            (2, sup.drz),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf {
                            u_r[d - nf] = v;
                        }
                    }
                }
            }
        }
    }

    // Pre-build lookup maps for O(1) access by ID.
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();

    // Initialize element states: all elastic.
    let mut states: Vec<(usize, ElementState)> = solver
        .elements
        .values()
        .map(|elem| {
            let alpha = lookup_alpha(input, &mat_by_id, elem);
            (
                elem.id,
                ElementState {
                    yielded_start: false,
                    yielded_end: false,
                    alpha,
                },
            )
        })
        .collect();
    states.sort_by_key(|&(id, _)| id);

    let n_increments = input.n_increments;
    let max_iter = input.max_iter;
    let tolerance = input.tolerance;

    // Global displacement vector (accumulated).
    let mut u_full = vec![0.0; n];
    let mut load_displacement: Vec<[f64; 2]> = Vec::with_capacity(n_increments);
    let mut total_nr_iterations: usize = 0;
    let mut converged_global = true;

    for inc in 1..=n_increments {
        let load_factor = inc as f64 / n_increments as f64;

        // Target external load for this increment.
        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();
        let f_ext_free = extract_subvec(&f_ext, &free_idx);

        // F_ext_free norm for convergence check.
        let f_ext_norm = vec_norm_l2(&f_ext_free);

        // Newton-Raphson inner loop.
        let mut converged_increment = false;

        for _nr_iter in 0..max_iter {
            total_nr_iterations += 1;

            // Assemble tangent stiffness with current element states (possibly reduced).
            let k_t = assemble_tangent_stiffness(solver, &dof_num, &states);

            // Compute internal forces from current displacements.
            let f_int = compute_global_internal_forces(solver, &dof_num, &u_full, &states);

            // Residual: R = F_ext - f_int
            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }
            let r_free = extract_subvec(&residual, &free_idx);

            // Check convergence: ||R_free|| < tolerance * ||F_ext_free||.
            let r_norm = vec_norm_l2(&r_free);
            let ref_norm = if f_ext_norm > 1e-20 { f_ext_norm } else { 1.0 };
            if r_norm < tolerance * ref_norm {
                converged_increment = true;
                break;
            }

            // Solve K_T * delta_u = R for free DOFs.
            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);

            // Modify residual for prescribed displacement coupling: R_f -= K_fr * u_r
            let k_fr = extract_submatrix(&k_t, n, &free_idx, &rest_idx);
            let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
            let mut rhs = r_free.clone();
            for i in 0..nf {
                rhs[i] -= k_fr_ur[i];
            }

            let (k_s, rhs_s) = if let Some(ref cs) = cs {
                (cs.reduce_matrix(&k_ff), cs.reduce_vector(&rhs))
            } else {
                (k_ff, rhs)
            };

            let delta_u_indep = solve_system(k_s, rhs_s, ns)?;
            let delta_u_f = if let Some(ref cs) = cs {
                cs.expand_solution(&delta_u_indep)
            } else {
                delta_u_indep
            };

            // Update displacements.
            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
            for i in 0..nr {
                u_full[nf + i] = load_factor * u_r[i];
            }

            // Update element yield states from current internal forces.
            update_element_states(solver, input, &dof_num, &u_full, &mut states);
        }

        if !converged_increment {
            converged_global = false;
        }

        // Record load-displacement point.
        let max_disp = compute_max_displacement(&dof_num, &u_full);
        load_displacement.push([load_factor, max_disp]);
    }

    // Build final results using the linear solver helpers.
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);

    // Compute reactions: R = K * u - F for restrained DOFs.
    // Use the tangent stiffness at final state for reaction computation.
    let k_final = assemble_tangent_stiffness(solver, &dof_num, &states);
    let f_final: Vec<f64> = f_total.iter().map(|&f| f).collect(); // load_factor = 1.0 at end
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        let row = nf + i;
        let mut ku = 0.0;
        for j in 0..n {
            ku += k_final[row * n + j] * u_full[j];
        }
        reactions_vec[i] = ku - f_final[row];
    }

    let f_r = extract_subvec(&f_final, &rest_idx);
    let mut reactions = super::linear::build_reactions_2d(
        solver, &dof_num, &reactions_vec, &f_r, nf, &u_full,
    );
    reactions.sort_by_key(|r| r.node_id);

    let mut element_forces = super::linear::compute_internal_forces_2d(solver, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Build element plastic status.
    let element_status = build_element_status(solver, input, &dof_num, &u_full, &states);

    let final_load_factor = if n_increments > 0 { 1.0 } else { 0.0 };

    Ok(NonlinearMaterialResult {
        results: AnalysisResults {
            displacements,
            reactions,
            element_forces,
        },
        converged: converged_global,
        iterations: total_nr_iterations,
        load_factor: final_load_factor,
        element_status,
        load_displacement,
    })
}

// ---------------------------------------------------------------------------
// Helper: look up the hardening ratio alpha for an element.
// ---------------------------------------------------------------------------

fn lookup_alpha(
    input: &NonlinearMaterialInput,
    mat_by_id: &std::collections::HashMap<usize, &SolverMaterial>,
    elem: &SolverElement,
) -> f64 {
    if let Some(mat) = mat_by_id.get(&elem.material_id) {
        let mat_key = mat.id.to_string();
        if let Some(model) = input.material_models.get(&mat_key) {
            return model.alpha.unwrap_or(DEFAULT_ALPHA);
        }
    }
    DEFAULT_ALPHA
}

// ---------------------------------------------------------------------------
// Helper: look up section capacities (Np, Mp) for an element.
// Returns (Np, Mp). Falls back to infinity if not found.
// ---------------------------------------------------------------------------

fn lookup_capacities(input: &NonlinearMaterialInput, elem: &SolverElement) -> (f64, f64) {
    let sec_key = elem.section_id.to_string();
    if let Some(cap) = input.section_capacities.get(&sec_key) {
        (cap.np, cap.mp)
    } else {
        (f64::INFINITY, f64::INFINITY)
    }
}

// ---------------------------------------------------------------------------
// Assemble global tangent stiffness with reduced EI for yielded elements.
// ---------------------------------------------------------------------------

fn assemble_tangent_stiffness(
    solver: &SolverInput,
    dof_num: &DofNumbering,
    states: &[(usize, ElementState)],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            for i in 0..4 {
                for j in 0..4 {
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += k_elem[i * 4 + j];
                }
            }
        } else {
            // Determine effective EI based on yield state.
            let state = states.iter().find(|&&(id, _)| id == elem.id);
            let iz_eff = match state {
                Some(&(_, ref st)) => {
                    if st.yielded_start || st.yielded_end {
                        st.alpha * sec.iz
                    } else {
                        sec.iz
                    }
                }
                None => sec.iz,
            };

            let k_local = frame_local_stiffness_2d(
                e, sec.a, iz_eff, l, elem.hinge_start, elem.hinge_end, 0.0,
            );
            let t = frame_transform_2d(cos, sin);
            let k_glob = transform_stiffness(&k_local, &t, 6);

            let ndof = elem_dofs.len();
            for i in 0..ndof {
                for j in 0..ndof {
                    k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                }
            }
        }
    }

    // Add spring stiffness contributions.
    for sup in solver.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    k_global[d * n + d] += kx;
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    k_global[d * n + d] += ky;
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    k_global[d * n + d] += kz;
                }
            }
        }
    }

    // Artificial rotational stiffness for all-hinged nodes.
    if dof_num.dofs_per_node >= 3 {
        let mut max_diag = 0.0f64;
        for i in 0..n {
            max_diag = max_diag.max(k_global[i * n + i].abs());
        }
        let artificial_k = if max_diag > 0.0 { max_diag * 1e-10 } else { 1e-6 };

        let mut node_hinge_count: std::collections::HashMap<usize, usize> =
            std::collections::HashMap::new();
        let mut node_frame_count: std::collections::HashMap<usize, usize> =
            std::collections::HashMap::new();
        for elem in solver.elements.values() {
            if elem.elem_type != "frame" {
                continue;
            }
            *node_frame_count.entry(elem.node_i).or_insert(0) += 1;
            *node_frame_count.entry(elem.node_j).or_insert(0) += 1;
            if elem.hinge_start {
                *node_hinge_count.entry(elem.node_i).or_insert(0) += 1;
            }
            if elem.hinge_end {
                *node_hinge_count.entry(elem.node_j).or_insert(0) += 1;
            }
        }
        let mut rot_restrained: std::collections::HashSet<usize> =
            std::collections::HashSet::new();
        for sup in solver.supports.values() {
            if sup.support_type == "fixed" || sup.support_type == "guidedX" || sup.support_type == "guidedY" {
                rot_restrained.insert(sup.node_id);
            }
            if sup.support_type == "spring" && sup.kz.unwrap_or(0.0) > 0.0 {
                rot_restrained.insert(sup.node_id);
            }
        }
        for (&node_id, &hinges) in &node_hinge_count {
            let frames = *node_frame_count.get(&node_id).unwrap_or(&0);
            if hinges >= frames && frames >= 1 && !rot_restrained.contains(&node_id) {
                if let Some(&idx) = dof_num.map.get(&(node_id, 2)) {
                    if idx < dof_num.n_free {
                        k_global[idx * n + idx] += artificial_k;
                    }
                }
            }
        }
    }

    k_global
}

// ---------------------------------------------------------------------------
// Compute global internal force vector: f_int = sum of T^T * k_local * u_local
// for each element, plus FEF contributions.
// This mirrors the assembly but uses current displacements instead of forces.
// ---------------------------------------------------------------------------

fn compute_global_internal_forces(
    solver: &SolverInput,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &[(usize, ElementState)],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut f_int = vec![0.0; n];

    let node_by_id: std::collections::HashMap<usize, &SolverNode> =
        solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection> =
        solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let l = (dx * dx + dy * dy).sqrt();
        let cos = dx / l;
        let sin = dy / l;
        let e = mat.e * 1000.0;

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let k_elem = truss_global_stiffness_2d(e, sec.a, l, cos, sin);
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
            ];
            let u_elem: Vec<f64> = truss_dofs.iter().map(|&d| u[d]).collect();
            for i in 0..4 {
                let mut val = 0.0;
                for j in 0..4 {
                    val += k_elem[i * 4 + j] * u_elem[j];
                }
                f_int[truss_dofs[i]] += val;
            }
        } else {
            let state = states.iter().find(|&&(id, _)| id == elem.id);
            let iz_eff = match state {
                Some(&(_, ref st)) => {
                    if st.yielded_start || st.yielded_end {
                        st.alpha * sec.iz
                    } else {
                        sec.iz
                    }
                }
                None => sec.iz,
            };

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();

            let t = frame_transform_2d(cos, sin);
            let u_local = transform_displacement(&u_global, &t, 6);

            let k_local = frame_local_stiffness_2d(
                e, sec.a, iz_eff, l, elem.hinge_start, elem.hinge_end, 0.0,
            );

            // f_local = k_local * u_local
            let mut f_local = vec![0.0; 6];
            for i in 0..6 {
                for j in 0..6 {
                    f_local[i] += k_local[i * 6 + j] * u_local[j];
                }
            }

            // Transform back to global: f_global_elem = T^T * f_local
            let f_global_elem = transform_force(&f_local, &t, 6);

            let ndof = elem_dofs.len();
            for i in 0..ndof {
                f_int[elem_dofs[i]] += f_global_elem[i];
            }
        }
    }

    // Add spring force contributions: f_spring = k_spring * u
    for sup in solver.supports.values() {
        if let Some(kx) = sup.kx {
            if kx > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
                    f_int[d] += kx * u[d];
                }
            }
        }
        if let Some(ky) = sup.ky {
            if ky > 0.0 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
                    f_int[d] += ky * u[d];
                }
            }
        }
        if let Some(kz) = sup.kz {
            if kz > 0.0 && dof_num.dofs_per_node >= 3 {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                    f_int[d] += kz * u[d];
                }
            }
        }
    }

    f_int
}

// ---------------------------------------------------------------------------
// Update element yield states based on the current displacement field.
// Yield criterion: (N / Np)^2 + |M| / Mp <= 1.0
// ---------------------------------------------------------------------------

fn update_element_states(
    solver: &SolverInput,
    input: &NonlinearMaterialInput,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &mut Vec<(usize, ElementState)>,
) {
    // Compute internal forces using the full elastic stiffness for yield check.
    // This gives us the "demand" forces on each element.
    let element_forces = super::linear::compute_internal_forces_2d(solver, dof_num, u);

    let elem_by_id: std::collections::HashMap<usize, &SolverElement> =
        solver.elements.values().map(|e| (e.id, e)).collect();

    for ef in &element_forces {
        let elem = match elem_by_id.get(&ef.element_id) {
            Some(e) => *e,
            None => continue,
        };

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            continue;
        }

        let (np, mp) = lookup_capacities(input, elem);
        if np >= f64::INFINITY && mp >= f64::INFINITY {
            continue;
        }

        // Yield criterion at start end.
        let n_start = ef.n_start;
        let m_start = ef.m_start;
        let util_start = yield_utilization(n_start, m_start, np, mp);
        let yielded_start = util_start > 1.0;

        // Yield criterion at end end.
        let n_end = ef.n_end;
        let m_end = ef.m_end;
        let util_end = yield_utilization(n_end, m_end, np, mp);
        let yielded_end = util_end > 1.0;

        if let Some(state_entry) = states.iter_mut().find(|s| s.0 == ef.element_id) {
            state_entry.1.yielded_start = yielded_start;
            state_entry.1.yielded_end = yielded_end;
        }
    }
}

// ---------------------------------------------------------------------------
// Yield interaction criterion: (N/Np)^2 + |M|/Mp
// ---------------------------------------------------------------------------

fn yield_utilization(n: f64, m: f64, np: f64, mp: f64) -> f64 {
    let axial_ratio = if np > 1e-20 { n / np } else { 0.0 };
    let moment_ratio = if mp > 1e-20 { m.abs() / mp } else { 0.0 };
    axial_ratio * axial_ratio + moment_ratio
}

// ---------------------------------------------------------------------------
// Solve a linear system, choosing between sparse and dense solvers.
// ---------------------------------------------------------------------------

fn solve_system(k_ff: Vec<f64>, rhs: Vec<f64>, nf: usize) -> Result<Vec<f64>, String> {
    if nf >= SPARSE_THRESHOLD {
        let k_ff_sparse = CscMatrix::from_dense_symmetric(&k_ff, nf);
        match sparse_cholesky_solve_full(&k_ff_sparse, &rhs) {
            Some(u) => Ok(u),
            None => {
                let mut k_work = k_ff;
                let mut f_work = rhs;
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular tangent stiffness matrix".to_string())
            }
        }
    } else {
        let mut k_work = k_ff.clone();
        match cholesky_solve(&mut k_work, &rhs, nf) {
            Some(u) => Ok(u),
            None => {
                let mut k_work = k_ff;
                let mut f_work = rhs;
                lu_solve(&mut k_work, &mut f_work, nf)
                    .ok_or_else(|| "Singular tangent stiffness matrix".to_string())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// L2 norm of a vector.
// ---------------------------------------------------------------------------

fn vec_norm_l2(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

// ---------------------------------------------------------------------------
// Compute the maximum absolute translational displacement.
// ---------------------------------------------------------------------------

fn compute_max_displacement(dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

// ---------------------------------------------------------------------------
// Build element plastic status for each element at the final state.
// ---------------------------------------------------------------------------

fn build_element_status(
    solver: &SolverInput,
    input: &NonlinearMaterialInput,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &[(usize, ElementState)],
) -> Vec<ElementPlasticStatus> {
    let element_forces = super::linear::compute_internal_forces_2d(solver, dof_num, u);
    let mut statuses = Vec::new();

    let elem_by_id: std::collections::HashMap<usize, &SolverElement> =
        solver.elements.values().map(|e| (e.id, e)).collect();

    for ef in &element_forces {
        let elem = match elem_by_id.get(&ef.element_id) {
            Some(e) => *e,
            None => continue,
        };

        let (np, mp) = lookup_capacities(input, elem);
        let util_start = yield_utilization(ef.n_start, ef.m_start, np, mp);
        let util_end = yield_utilization(ef.n_end, ef.m_end, np, mp);
        let utilization = util_start.max(util_end);

        let state = states.iter().find(|&&(id, _)| id == ef.element_id);
        let (yielded_start, yielded_end) = match state {
            Some(&(_, ref st)) => (st.yielded_start, st.yielded_end),
            None => (false, false),
        };

        let state_str = if yielded_start && yielded_end {
            "fully_yielded"
        } else if yielded_start || yielded_end {
            "partially_yielded"
        } else {
            "elastic"
        };

        // Compute plastic rotations as the difference between total rotation
        // and what would be expected from pure elastic behavior.
        // For a simple estimate: theta_p ~ (1 - alpha) * theta_total when yielded.
        let alpha = match state {
            Some(&(_, ref st)) => st.alpha,
            None => DEFAULT_ALPHA,
        };
        let plastic_rotation_start = if yielded_start {
            let rz = dof_num
                .global_dof(elem.node_i, 2)
                .map(|d| u[d])
                .unwrap_or(0.0);
            (1.0 - alpha) * rz.abs()
        } else {
            0.0
        };
        let plastic_rotation_end = if yielded_end {
            let rz = dof_num
                .global_dof(elem.node_j, 2)
                .map(|d| u[d])
                .unwrap_or(0.0);
            (1.0 - alpha) * rz.abs()
        } else {
            0.0
        };

        statuses.push(ElementPlasticStatus {
            element_id: ef.element_id,
            state: state_str.to_string(),
            utilization,
            plastic_rotation_start,
            plastic_rotation_end,
        });
    }

    statuses.sort_by_key(|s| s.element_id);
    statuses
}

// ===========================================================================
// 3D Nonlinear Material Analysis
// ===========================================================================

/// Per-element state tracking for 3D nonlinear material analysis.
#[derive(Clone)]
struct ElementState3D {
    yielded_start: bool,
    yielded_end: bool,
    alpha: f64,
}

/// Solve a 3D nonlinear material analysis using incremental load-stepping
/// with Newton-Raphson equilibrium iterations at each increment.
///
/// The yield criterion is a resultant-based biaxial interaction:
///   (N/Np)^2 + (My/Mpy)^2 + (Mz/Mpz)^2 <= 1.0
///
/// When an element yields at an end, its flexural stiffness is reduced to
/// alpha * EI (bilinear hardening).
pub fn solve_nonlinear_material_3d(
    input: &NonlinearMaterialInput3D,
) -> Result<NonlinearMaterialResult3D, String> {
    let solver = &input.solver;
    let dof_num = DofNumbering::build_3d(solver);

    if dof_num.n_free == 0 {
        return Err("No free DOFs -- all nodes are fully restrained".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let nr = n - nf;

    // Full elastic assembly for total external load vector.
    let asm = super::assembly::assemble_3d(solver, &dof_num);
    let f_total = asm.f.clone();

    // Prescribed displacements (from settlement supports).
    let mut u_r = vec![0.0; nr];
    for sup in solver.supports.values() {
        let prescribed: [(usize, Option<f64>); 6] = [
            (0, sup.dx), (1, sup.dy), (2, sup.dz),
            (3, sup.drx), (4, sup.dry), (5, sup.drz),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf {
                            u_r[d - nf] = v;
                        }
                    }
                }
            }
        }
    }

    // Pre-build lookup map for O(1) access by ID.
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();

    // Initialize element states: all elastic.
    let mut states: Vec<(usize, ElementState3D)> = solver
        .elements
        .values()
        .map(|elem| {
            let alpha = lookup_alpha_3d(input, &mat_by_id, elem);
            (
                elem.id,
                ElementState3D {
                    yielded_start: false,
                    yielded_end: false,
                    alpha,
                },
            )
        })
        .collect();
    states.sort_by_key(|&(id, _)| id);

    let n_increments = input.n_increments;
    let max_iter = input.max_iter;
    let tolerance = input.tolerance;

    let mut u_full = vec![0.0; n];
    let mut load_displacement: Vec<[f64; 2]> = Vec::with_capacity(n_increments);
    let mut total_nr_iterations: usize = 0;
    let mut converged_global = true;

    for inc in 1..=n_increments {
        let load_factor = inc as f64 / n_increments as f64;

        let f_ext: Vec<f64> = f_total.iter().map(|&f| load_factor * f).collect();
        let f_ext_free = extract_subvec(&f_ext, &free_idx);
        let f_ext_norm = vec_norm_l2(&f_ext_free);

        let mut converged_increment = false;

        for _nr_iter in 0..max_iter {
            total_nr_iterations += 1;

            let k_t = assemble_tangent_stiffness_3d(solver, &dof_num, &states);
            let f_int = compute_global_internal_forces_3d(solver, &dof_num, &u_full, &states);

            let mut residual = vec![0.0; n];
            for i in 0..n {
                residual[i] = f_ext[i] - f_int[i];
            }
            let r_free = extract_subvec(&residual, &free_idx);

            let r_norm = vec_norm_l2(&r_free);
            let ref_norm = if f_ext_norm > 1e-20 { f_ext_norm } else { 1.0 };
            if r_norm < tolerance * ref_norm {
                converged_increment = true;
                break;
            }

            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
            let k_fr = extract_submatrix(&k_t, n, &free_idx, &rest_idx);
            let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
            let mut rhs = r_free.clone();
            for i in 0..nf {
                rhs[i] -= k_fr_ur[i];
            }

            let delta_u_f = solve_system(k_ff, rhs, nf)?;

            for i in 0..nf {
                u_full[i] += delta_u_f[i];
            }
            for i in 0..nr {
                u_full[nf + i] = load_factor * u_r[i];
            }

            update_element_states_3d(solver, input, &dof_num, &u_full, &mut states);
        }

        if !converged_increment {
            converged_global = false;
        }

        let max_disp = compute_max_displacement_3d_nl(&dof_num, &u_full);
        load_displacement.push([load_factor, max_disp]);
    }

    // Build final results.
    let displacements = super::linear::build_displacements_3d(&dof_num, &u_full);

    let k_final = assemble_tangent_stiffness_3d(solver, &dof_num, &states);
    let f_final = f_total.clone();
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr {
        let row = nf + i;
        let mut ku = 0.0;
        for j in 0..n {
            ku += k_final[row * n + j] * u_full[j];
        }
        reactions_vec[i] = ku - f_final[row];
    }

    let reactions = build_reactions_3d_nl(solver, &dof_num, &reactions_vec, nf);

    let mut element_forces = super::linear::compute_internal_forces_3d(solver, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    let element_status = build_element_status_3d(solver, input, &dof_num, &u_full, &states);

    Ok(NonlinearMaterialResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions,
            element_forces,
            plate_stresses: compute_plate_stresses(solver, &dof_num, &u_full),
            quad_stresses: compute_quad_stresses(solver, &dof_num, &u_full),
        },
        converged: converged_global,
        iterations: total_nr_iterations,
        load_factor: if n_increments > 0 { 1.0 } else { 0.0 },
        element_status,
        load_displacement,
    })
}

// ---------------------------------------------------------------------------
// 3D helper: look up hardening ratio alpha for a 3D element.
// ---------------------------------------------------------------------------

fn lookup_alpha_3d(
    input: &NonlinearMaterialInput3D,
    mat_by_id: &std::collections::HashMap<usize, &SolverMaterial>,
    elem: &SolverElement3D,
) -> f64 {
    if let Some(mat) = mat_by_id.get(&elem.material_id) {
        let mat_key = mat.id.to_string();
        if let Some(model) = input.material_models.get(&mat_key) {
            return model.alpha.unwrap_or(DEFAULT_ALPHA);
        }
    }
    DEFAULT_ALPHA
}

// ---------------------------------------------------------------------------
// 3D helper: look up section capacities (Np, Mpy, Mpz).
// ---------------------------------------------------------------------------

fn lookup_capacities_3d(input: &NonlinearMaterialInput3D, elem: &SolverElement3D) -> (f64, f64, f64) {
    let sec_key = elem.section_id.to_string();
    if let Some(cap) = input.section_capacities.get(&sec_key) {
        (cap.np, cap.mpy, cap.mpz)
    } else {
        (f64::INFINITY, f64::INFINITY, f64::INFINITY)
    }
}

// ---------------------------------------------------------------------------
// 3D tangent stiffness assembly with reduced EI for yielded elements.
// ---------------------------------------------------------------------------

fn assemble_tangent_stiffness_3d(
    solver: &SolverInput3D,
    dof_num: &DofNumbering,
    states: &[(usize, ElementState3D)],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut k_global = vec![0.0; n * n];
    let left_hand = solver.left_hand.unwrap_or(false);

    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ea_l = e * sec.a / l;
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_i, 2).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 2).unwrap(),
            ];
            for i in 0..3 {
                for j in 0..3 {
                    let kij = ea_l * dir[i] * dir[j];
                    k_global[truss_dofs[i] * n + truss_dofs[j]] += kij;
                    k_global[truss_dofs[i + 3] * n + truss_dofs[j + 3]] += kij;
                    k_global[truss_dofs[i] * n + truss_dofs[j + 3]] -= kij;
                    k_global[truss_dofs[i + 3] * n + truss_dofs[j]] -= kij;
                }
            }
        } else {
            // Determine effective IY, IZ based on yield state.
            let state = states.iter().find(|&&(id, _)| id == elem.id);
            let (iy_eff, iz_eff) = match state {
                Some(&(_, ref st)) => {
                    if st.yielded_start || st.yielded_end {
                        (st.alpha * sec.iy, st.alpha * sec.iz)
                    } else {
                        (sec.iy, sec.iz)
                    }
                }
                None => (sec.iy, sec.iz),
            };

            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );

            let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * iy_eff / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * iz_eff / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            if has_cw && dof_num.dofs_per_node >= 7 {
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, iy_eff, iz_eff, sec.j, sec.cw.unwrap(), l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let k_glob = transform_stiffness(&k_local, &t, 14);
                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }
            } else {
                let t = frame_transform_3d(&ex, &ey, &ez);
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, iy_eff, iz_eff, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let k_glob = transform_stiffness(&k_local, &t, 12);
                let ndof = elem_dofs.len();
                for i in 0..ndof {
                    for j in 0..ndof {
                        k_global[elem_dofs[i] * n + elem_dofs[j]] += k_glob[i * ndof + j];
                    }
                }
            }
        }
    }

    // Add spring stiffness contributions.
    for sup in solver.supports.values() {
        let spring_dofs: [(usize, Option<f64>); 6] = [
            (0, sup.kx), (1, sup.ky), (2, sup.kz),
            (3, sup.krx), (4, sup.kry), (5, sup.krz),
        ];
        for &(local_dof, k_val) in &spring_dofs {
            if let Some(k) = k_val {
                if k > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        k_global[d * n + d] += k;
                    }
                }
            }
        }
    }

    k_global
}

// ---------------------------------------------------------------------------
// 3D global internal force vector.
// ---------------------------------------------------------------------------

fn compute_global_internal_forces_3d(
    solver: &SolverInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &[(usize, ElementState3D)],
) -> Vec<f64> {
    let n = dof_num.n_total;
    let mut f_int = vec![0.0; n];
    let left_hand = solver.left_hand.unwrap_or(false);

    let node_by_id: std::collections::HashMap<usize, &SolverNode3D> =
        solver.nodes.values().map(|n| (n.id, n)).collect();
    let mat_by_id: std::collections::HashMap<usize, &SolverMaterial> =
        solver.materials.values().map(|m| (m.id, m)).collect();
    let sec_by_id: std::collections::HashMap<usize, &SolverSection3D> =
        solver.sections.values().map(|s| (s.id, s)).collect();

    for elem in solver.elements.values() {
        let node_i = node_by_id[&elem.node_i];
        let node_j = node_by_id[&elem.node_j];
        let mat = mat_by_id[&elem.material_id];
        let sec = sec_by_id[&elem.section_id];

        let dx = node_j.x - node_i.x;
        let dy = node_j.y - node_i.y;
        let dz = node_j.z - node_i.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let e = mat.e * 1000.0;
        let g = e / (2.0 * (1.0 + mat.nu));

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            let dir = [dx / l, dy / l, dz / l];
            let ea_l = e * sec.a / l;
            let truss_dofs = [
                dof_num.global_dof(elem.node_i, 0).unwrap(),
                dof_num.global_dof(elem.node_i, 1).unwrap(),
                dof_num.global_dof(elem.node_i, 2).unwrap(),
                dof_num.global_dof(elem.node_j, 0).unwrap(),
                dof_num.global_dof(elem.node_j, 1).unwrap(),
                dof_num.global_dof(elem.node_j, 2).unwrap(),
            ];
            let u_elem: Vec<f64> = truss_dofs.iter().map(|&d| u[d]).collect();
            // Axial displacement in local direction
            let delta: f64 = (0..3).map(|i| (u_elem[i + 3] - u_elem[i]) * dir[i]).sum();
            let n_axial = ea_l * delta;
            // Distribute to global DOFs
            for i in 0..3 {
                f_int[truss_dofs[i]] -= n_axial * dir[i];
                f_int[truss_dofs[i + 3]] += n_axial * dir[i];
            }
        } else {
            let state = states.iter().find(|&&(id, _)| id == elem.id);
            let (iy_eff, iz_eff) = match state {
                Some(&(_, ref st)) => {
                    if st.yielded_start || st.yielded_end {
                        (st.alpha * sec.iy, st.alpha * sec.iz)
                    } else {
                        (sec.iy, sec.iz)
                    }
                }
                None => (sec.iy, sec.iz),
            };

            let (ex, ey, ez) = compute_local_axes_3d(
                node_i.x, node_i.y, node_i.z,
                node_j.x, node_j.y, node_j.z,
                elem.local_yx, elem.local_yy, elem.local_yz,
                elem.roll_angle, left_hand,
            );

            let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
            let u_global: Vec<f64> = elem_dofs.iter().map(|&d| u[d]).collect();

            let has_cw = sec.cw.map_or(false, |cw| cw > 0.0);
            let (phi_y, phi_z) = if sec.as_y.is_some() || sec.as_z.is_some() {
                let l2 = l * l;
                let py = sec.as_y.map(|ay| 12.0 * e * iy_eff / (g * ay * l2)).unwrap_or(0.0);
                let pz = sec.as_z.map(|az| 12.0 * e * iz_eff / (g * az * l2)).unwrap_or(0.0);
                (py, pz)
            } else {
                (0.0, 0.0)
            };

            let (f_local, ndof_elem) = if has_cw && dof_num.dofs_per_node >= 7 {
                let t = frame_transform_3d_warping(&ex, &ey, &ez);
                let u_local = transform_displacement(&u_global, &t, 14);
                let k_local = frame_local_stiffness_3d_warping(
                    e, sec.a, iy_eff, iz_eff, sec.j, sec.cw.unwrap(), l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let mut fl = vec![0.0; 14];
                for i in 0..14 {
                    for j in 0..14 {
                        fl[i] += k_local[i * 14 + j] * u_local[j];
                    }
                }
                let f_global_elem = transform_force(&fl, &t, 14);
                (f_global_elem, 14)
            } else {
                let t = frame_transform_3d(&ex, &ey, &ez);
                let u_local = transform_displacement(&u_global, &t, 12);
                let k_local = frame_local_stiffness_3d(
                    e, sec.a, iy_eff, iz_eff, sec.j, l, g,
                    elem.hinge_start, elem.hinge_end, phi_y, phi_z,
                );
                let mut fl = vec![0.0; 12];
                for i in 0..12 {
                    for j in 0..12 {
                        fl[i] += k_local[i * 12 + j] * u_local[j];
                    }
                }
                let f_global_elem = transform_force(&fl, &t, 12);
                (f_global_elem, 12)
            };

            let ndof = elem_dofs.len().min(ndof_elem);
            for i in 0..ndof {
                f_int[elem_dofs[i]] += f_local[i];
            }
        }
    }

    // Add spring force contributions.
    for sup in solver.supports.values() {
        let spring_dofs: [(usize, Option<f64>); 6] = [
            (0, sup.kx), (1, sup.ky), (2, sup.kz),
            (3, sup.krx), (4, sup.kry), (5, sup.krz),
        ];
        for &(local_dof, k_val) in &spring_dofs {
            if let Some(k) = k_val {
                if k > 0.0 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        f_int[d] += k * u[d];
                    }
                }
            }
        }
    }

    f_int
}

// ---------------------------------------------------------------------------
// 3D yield interaction criterion: (N/Np)^2 + (My/Mpy)^2 + (Mz/Mpz)^2
// ---------------------------------------------------------------------------

fn yield_utilization_3d(n: f64, my: f64, mz: f64, np: f64, mpy: f64, mpz: f64) -> f64 {
    let axial_ratio = if np > 1e-20 { n / np } else { 0.0 };
    let my_ratio = if mpy > 1e-20 { my / mpy } else { 0.0 };
    let mz_ratio = if mpz > 1e-20 { mz / mpz } else { 0.0 };
    axial_ratio * axial_ratio + my_ratio * my_ratio + mz_ratio * mz_ratio
}

// ---------------------------------------------------------------------------
// 3D: update element yield states from current displacement field.
// ---------------------------------------------------------------------------

fn update_element_states_3d(
    solver: &SolverInput3D,
    input: &NonlinearMaterialInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &mut Vec<(usize, ElementState3D)>,
) {
    let element_forces = super::linear::compute_internal_forces_3d(solver, dof_num, u);

    let elem_by_id: std::collections::HashMap<usize, &SolverElement3D> =
        solver.elements.values().map(|e| (e.id, e)).collect();

    for ef in &element_forces {
        let elem = match elem_by_id.get(&ef.element_id) {
            Some(e) => *e,
            None => continue,
        };

        if elem.elem_type == "truss" || elem.elem_type == "cable" {
            continue;
        }

        let (np, mpy, mpz) = lookup_capacities_3d(input, elem);
        if np >= f64::INFINITY && mpy >= f64::INFINITY && mpz >= f64::INFINITY {
            continue;
        }

        let util_start = yield_utilization_3d(
            ef.n_start, ef.my_start, ef.mz_start, np, mpy, mpz,
        );
        let util_end = yield_utilization_3d(
            ef.n_end, ef.my_end, ef.mz_end, np, mpy, mpz,
        );

        if let Some(state_entry) = states.iter_mut().find(|s| s.0 == ef.element_id) {
            state_entry.1.yielded_start = util_start > 1.0;
            state_entry.1.yielded_end = util_end > 1.0;
        }
    }
}

// ---------------------------------------------------------------------------
// 3D: compute maximum displacement.
// ---------------------------------------------------------------------------

fn compute_max_displacement_3d_nl(dof_num: &DofNumbering, u: &[f64]) -> f64 {
    let mut max_disp = 0.0f64;
    for &node_id in &dof_num.node_order {
        let ux = dof_num.global_dof(node_id, 0).map(|d| u[d]).unwrap_or(0.0);
        let uy = dof_num.global_dof(node_id, 1).map(|d| u[d]).unwrap_or(0.0);
        let uz = dof_num.global_dof(node_id, 2).map(|d| u[d]).unwrap_or(0.0);
        let disp = (ux * ux + uy * uy + uz * uz).sqrt();
        if disp > max_disp {
            max_disp = disp;
        }
    }
    max_disp
}

// ---------------------------------------------------------------------------
// 3D: build reactions from reaction forces.
// ---------------------------------------------------------------------------

fn build_reactions_3d_nl(
    solver: &SolverInput3D,
    dof_num: &DofNumbering,
    r_vec: &[f64],
    nf: usize,
) -> Vec<Reaction3D> {
    let mut reactions = Vec::new();
    for sup in solver.supports.values() {
        let mut rx = 0.0;
        let mut ry = 0.0;
        let mut rz = 0.0;
        let mut mrx = 0.0;
        let mut mry = 0.0;
        let mut mrz = 0.0;

        let fields: [(usize, bool, &mut f64); 6] = [
            (0, sup.rx, &mut rx),
            (1, sup.ry, &mut ry),
            (2, sup.rz, &mut rz),
            (3, sup.rrx, &mut mrx),
            (4, sup.rry, &mut mry),
            (5, sup.rrz, &mut mrz),
        ];
        for (local_dof, restrained, target) in fields {
            if restrained {
                if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                    if d >= nf {
                        *target = r_vec[d - nf];
                    }
                }
            }
        }

        reactions.push(Reaction3D {
            node_id: sup.node_id,
            fx: rx, fy: ry, fz: rz, mx: mrx, my: mry, mz: mrz,
            bimoment: None,
        });
    }
    reactions.sort_by_key(|r| r.node_id);
    reactions
}

// ---------------------------------------------------------------------------
// 3D: build element plastic status.
// ---------------------------------------------------------------------------

fn build_element_status_3d(
    solver: &SolverInput3D,
    input: &NonlinearMaterialInput3D,
    dof_num: &DofNumbering,
    u: &[f64],
    states: &[(usize, ElementState3D)],
) -> Vec<ElementPlasticStatus3D> {
    let element_forces = super::linear::compute_internal_forces_3d(solver, dof_num, u);
    let mut statuses = Vec::new();

    let elem_by_id: std::collections::HashMap<usize, &SolverElement3D> =
        solver.elements.values().map(|e| (e.id, e)).collect();

    for ef in &element_forces {
        let elem = match elem_by_id.get(&ef.element_id) {
            Some(e) => *e,
            None => continue,
        };

        let (np, mpy, mpz) = lookup_capacities_3d(input, elem);
        let util_start = yield_utilization_3d(
            ef.n_start, ef.my_start, ef.mz_start, np, mpy, mpz,
        );
        let util_end = yield_utilization_3d(
            ef.n_end, ef.my_end, ef.mz_end, np, mpy, mpz,
        );
        let utilization = util_start.max(util_end);

        let state = states.iter().find(|&&(id, _)| id == ef.element_id);
        let (yielded_start, yielded_end) = match state {
            Some(&(_, ref st)) => (st.yielded_start, st.yielded_end),
            None => (false, false),
        };

        let state_str = if yielded_start && yielded_end {
            "fully_yielded"
        } else if yielded_start || yielded_end {
            "partially_yielded"
        } else {
            "elastic"
        };

        let alpha = match state {
            Some(&(_, ref st)) => st.alpha,
            None => DEFAULT_ALPHA,
        };

        // Estimate plastic rotations.
        let (pr_start_y, pr_start_z) = if yielded_start {
            let ry = dof_num.global_dof(elem.node_i, 4).map(|d| u[d]).unwrap_or(0.0);
            let rz = dof_num.global_dof(elem.node_i, 5).map(|d| u[d]).unwrap_or(0.0);
            ((1.0 - alpha) * ry.abs(), (1.0 - alpha) * rz.abs())
        } else {
            (0.0, 0.0)
        };
        let (pr_end_y, pr_end_z) = if yielded_end {
            let ry = dof_num.global_dof(elem.node_j, 4).map(|d| u[d]).unwrap_or(0.0);
            let rz = dof_num.global_dof(elem.node_j, 5).map(|d| u[d]).unwrap_or(0.0);
            ((1.0 - alpha) * ry.abs(), (1.0 - alpha) * rz.abs())
        } else {
            (0.0, 0.0)
        };

        statuses.push(ElementPlasticStatus3D {
            element_id: ef.element_id,
            state: state_str.to_string(),
            utilization,
            plastic_rotation_start_y: pr_start_y,
            plastic_rotation_start_z: pr_start_z,
            plastic_rotation_end_y: pr_end_y,
            plastic_rotation_end_z: pr_end_z,
        });
    }

    statuses.sort_by_key(|s| s.element_id);
    statuses
}
