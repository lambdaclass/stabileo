use crate::types::*;
use crate::linalg::*;
use std::rc::Rc;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::{build_displacements_2d, compute_internal_forces_2d,
    build_displacements_3d, compute_internal_forces_3d,
    compute_plate_stresses, compute_quad_stresses};
use super::constraints::FreeConstraintSystem;

/// The linear pass's structured diagnostics that describe the model, not the
/// linear solution: pre-solve gates, constraints, conditioning of K.
///
/// Everything from the "solve" and "factorization" phases is about the
/// solution the linear pass produced — `ResidualOk`, the factorization path
/// taken, `ExcessiveDisplacement` — and none of it was checked against the
/// second-order state. Carried over, a P-Delta result with sway amplified by
/// 1.8 announced "equilibrium residual OK" and a dense LU it never ran.
fn model_structured_diagnostics(linear: &[StructuredDiagnostic]) -> Vec<StructuredDiagnostic> {
    linear
        .iter()
        .filter(|d| matches!(d.phase.as_deref(), Some("pre_solve" | "constraints" | "conditioning")))
        .cloned()
        .collect()
}

/// The legacy counterpart: only the conditioning entries describe the model;
/// "solver_path" and "fallback" name the linear pass's factorization.
fn model_solver_diagnostics(linear: &[SolverDiagnostic]) -> Vec<SolverDiagnostic> {
    linear.iter().filter(|d| d.category == "conditioning").cloned().collect()
}

/// Free DOFs threshold for sparse path in P-Delta iterations.
const SPARSE_THRESHOLD: usize = 64;

/// P-Delta analysis result.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PDeltaResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub is_stable: bool,
    pub b2_factor: f64,
    pub linear_results: AnalysisResults,
}

/// Solve 2D P-Delta (second-order) analysis.
/// Iteratively solves (K + K_G) * u = F where K_G depends on axial forces.
pub fn solve_pdelta_2d(
    input: &SolverInput,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult, String> {
    let dof_num = DofNumbering::build_2d(input);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    // First: linear analysis
    let linear_results = super::linear::solve_2d(input)?;

    let asm = assemble_2d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let f_f = extract_subvec(&asm.f, &free_idx);

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let f_solve = if let Some(ref cs) = cs {
        cs.reduce_vector(&f_f)
    } else {
        f_f.clone()
    };

    let mut u_prev = vec![0.0; n];
    // Initialize with linear displacements
    for d in &linear_results.displacements {
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 0)) { u_prev[idx] = d.ux; }
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 1)) { u_prev[idx] = d.uz; }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 2)) { u_prev[idx] = d.ry; }
        }
    }

    let mut converged = false;
    let mut iterations = 0;
    let mut u_current = u_prev.clone();
    let use_sparse = ns >= SPARSE_THRESHOLD;
    let mut symbolic: Option<Rc<SymbolicCholesky>> = None;

    for iter in 0..max_iter {
        iterations = iter + 1;

        // Compute geometric stiffness from current axial forces
        let mut k_total = asm.k.clone();
        super::geometric_stiffness::add_geometric_stiffness_2d(input, &dof_num, &u_current, &mut k_total);

        // Extract Kff (with K_G) and optionally apply constraint transform
        let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);
        let k_solve = if let Some(ref cs) = cs {
            cs.reduce_matrix(&k_ff)
        } else {
            k_ff
        };

        let u_indep = if use_sparse {
            let k_csc = CscMatrix::from_dense_symmetric(&k_solve, ns);
            let sym = symbolic.get_or_insert_with(|| Rc::new(symbolic_cholesky(&k_csc)));
            match numeric_cholesky(sym, &k_csc) {
                Some(factor) => sparse_cholesky_solve(&factor, &f_solve),
                None => {
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        } else {
            let mut k_work = k_solve.clone();
            match cholesky_solve(&mut k_work, &f_solve, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    match lu_solve(&mut k_work, &mut f_work, ns) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult {
                                results: linear_results.clone(),
                                iterations,
                                converged: false,
                                is_stable: false,
                                b2_factor: f64::INFINITY,
                                linear_results,
                            });
                        }
                    }
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        let mut u_new = vec![0.0; n];
        for i in 0..nf {
            u_new[i] = u_f[i];
        }

        // Check convergence
        let mut diff_norm = 0.0;
        let mut u_norm = 0.0;
        for i in 0..nf {
            diff_norm += (u_new[i] - u_current[i]).powi(2);
            u_norm += u_new[i].powi(2);
        }
        diff_norm = diff_norm.sqrt();
        u_norm = u_norm.sqrt();

        u_current = u_new;

        if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
            converged = true;
            break;
        }
    }

    // Compute B2 factor
    let mut max_ratio = 0.0f64;
    let u_linear_f = extract_subvec(&u_prev, &free_idx);
    let u_pdelta_f = extract_subvec(&u_current, &free_idx);
    for i in 0..nf {
        if u_linear_f[i].abs() > 1e-12 {
            max_ratio = max_ratio.max((u_pdelta_f[i] / u_linear_f[i]).abs());
        }
    }

    // Build final results from converged displacements
    let displacements = build_displacements_2d(&dof_num, &u_current);
    let element_forces = compute_internal_forces_2d(input, &dof_num, &u_current);

    // Compute reactions from K * u - F for restrained DOFs
    let reactions = compute_reactions_from_u(input, &dof_num, &asm, &u_current);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_current[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(PDeltaResult {
        results: AnalysisResults {
            displacements,
            reactions,
            element_forces,
            constraint_forces,
            // The model's diagnostics belong to the model, not to the path that
            // analysed it: the linear pass above already ran the pre-solve gates
            // and the conditioning checks on this same structure. Left empty,
            // a P-Delta run was silent about problems the same model reports
            // when solved linearly — the store hands `results` straight to the
            // diagnostics panel, so the warnings simply vanished. Only the
            // model's, though: see `model_structured_diagnostics`.
            diagnostics: linear_results.diagnostics.clone(),
            solver_diagnostics: model_solver_diagnostics(&linear_results.solver_diagnostics),
            structured_diagnostics: model_structured_diagnostics(&linear_results.structured_diagnostics),
            // Still not computed for the second-order state: the residual would
            // have to be formed against (K + K_G) and the P-Delta reactions.
            equilibrium: None,
            result_summary: None, solver_run_meta: None,
        },
        iterations,
        converged,
        is_stable: converged && max_ratio < 100.0,
        b2_factor: max_ratio,
        linear_results,
    })
}

fn compute_reactions_from_u(
    input: &SolverInput,
    dof_num: &DofNumbering,
    asm: &AssemblyResult,
    u: &[f64],
) -> Vec<Reaction> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut reactions = Vec::new();

    for sup in input.supports.values() {
        let mut rx = 0.0;
        let mut rz = 0.0;
        let mut my = 0.0;

        if let Some(&d) = dof_num.map.get(&(sup.node_id, 0)) {
            if d >= nf {
                let mut r = -asm.f[d];
                for j in 0..n {
                    r += asm.k[d * n + j] * u[j];
                }
                rx = r;
            }
        }
        if let Some(&d) = dof_num.map.get(&(sup.node_id, 1)) {
            if d >= nf {
                let mut r = -asm.f[d];
                for j in 0..n {
                    r += asm.k[d * n + j] * u[j];
                }
                rz = r;
            }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                if d >= nf {
                    let mut r = -asm.f[d];
                    for j in 0..n {
                        r += asm.k[d * n + j] * u[j];
                    }
                    my = r;
                }
            }
        }

        reactions.push(Reaction { node_id: sup.node_id, rx, rz, my });
    }
    reactions
}

/// P-Delta analysis result for 3D structures.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PDeltaResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub is_stable: bool,
    pub b2_factor: f64,
    pub linear_results: AnalysisResults3D,
}

/// K and the load vector of the 3D P-Delta, dense below `SPARSE_THRESHOLD` independent DOFs and
/// sparse at or above it.
///
/// The sparse side never builds an n×n matrix. It used to: `assemble_3d` and one dense K + Kg per
/// iteration, converted to CSC only for the factorization, which on a 6700-DOF building asked
/// for 360 MB per copy and ran the WASM heap out.
enum PDeltaSystem3D {
    Dense(AssemblyResult),
    Sparse(SparseAssemblyResult3D),
}

/// Solve 3D P-Delta (second-order) analysis.
pub fn solve_pdelta_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult3D, String> {
    // Expand curved beams BEFORE DOF numbering and assembly: solve_3d already
    // expands internally, but the P-Delta iterations assemble K and add
    // geometric stiffness on the same input, so both must see the expanded model.
    let input = &super::linear::expand_curved_beams_3d(input);
    let dof_num = DofNumbering::build_3d(input);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }
    let cs = FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
    let ns = cs.as_ref().map_or(dof_num.n_free, |c| c.n_free_indep);
    solve_pdelta_3d_on(input, &dof_num, cs, ns >= SPARSE_THRESHOLD, max_iter, tolerance)
}

fn solve_pdelta_3d_on(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    cs: Option<FreeConstraintSystem>,
    sparse: bool,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult3D, String> {
    let linear_results = super::linear::solve_3d(input)?;

    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);
    let system = if sparse {
        PDeltaSystem3D::Sparse(assemble_sparse_3d(input, dof_num, true))
    } else {
        PDeltaSystem3D::Dense(assemble_3d(input, dof_num))
    };
    let f_all: &[f64] = match &system {
        PDeltaSystem3D::Dense(a) => &a.f,
        PDeltaSystem3D::Sparse(a) => &a.f,
    };
    let free_idx: Vec<usize> = (0..nf).collect();
    let f_f = f_all[..nf].to_vec();
    let f_solve = if let Some(ref cs) = cs {
        cs.reduce_vector(&f_f)
    } else {
        f_f.clone()
    };

    let mut u_prev = vec![0.0; n];
    for d in &linear_results.displacements {
        let vals = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz];
        for (i, &val) in vals.iter().enumerate() {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, i)) { u_prev[idx] = val; }
        }
    }

    let mut converged = false;
    let mut iterations = 0;
    let mut u_current = u_prev.clone();
    let mut symbolic: Option<super::sparse_tangent::SparseSymbolicCache> = None;

    // Whether K alone factors: only then does a K + Kg that does not factor say that the
    // second-order equilibrium is past the critical load. A K that needs the linear solve's
    // regularisation (shell drilling) says nothing either way.
    let k_positive_definite = match &system {
        PDeltaSystem3D::Dense(asm) => {
            let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
            let mut k = if let Some(ref cs) = cs { cs.reduce_matrix(&k_ff) } else { k_ff };
            cholesky_decompose(&mut k, ns)
        }
        PDeltaSystem3D::Sparse(asm) => {
            let k = if let Some(ref cs) = cs { cs.reduce_matrix_sparse(&asm.k_ff) } else { asm.k_ff.clone() };
            numeric_cholesky(&std::rc::Rc::new(symbolic_cholesky(&k)), &k).is_some()
        }
    };
    // Whether the last K + Kg solved was positive definite.
    let mut last_positive_definite = true;

    for iter in 0..max_iter {
        iterations = iter + 1;

        let solved = match &system {
            PDeltaSystem3D::Dense(asm) => {
                let mut k_total = asm.k.clone();
                super::geometric_stiffness::add_geometric_stiffness_3d(input, dof_num, &u_current, &mut k_total);
                let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);
                let k_solve = if let Some(ref cs) = cs { cs.reduce_matrix(&k_ff) } else { k_ff };
                let mut k_work = k_solve.clone();
                let chol = cholesky_solve(&mut k_work, &f_solve, ns);
                last_positive_definite = chol.is_some();
                chol.or_else(|| {
                    let mut k_work = k_solve;
                    let mut f_work = f_solve.clone();
                    lu_solve(&mut k_work, &mut f_work, ns)
                })
            }
            PDeltaSystem3D::Sparse(asm) => {
                let mut kg = super::geometric_stiffness::geometric_stiffness_triplets_3d(input, dof_num, &u_current);
                kg.add_lower_csc(&asm.k_ff);
                let k_ff = kg.into_csc();
                let k_solve = if let Some(ref cs) = cs { cs.reduce_matrix_sparse(&k_ff) } else { k_ff };
                let sym = super::sparse_tangent::cached_symbolic(&mut symbolic, &k_solve);
                let factor = numeric_cholesky(sym, &k_solve);
                last_positive_definite = factor.is_some();
                match factor {
                    Some(factor) => Some(sparse_cholesky_solve(&factor, &f_solve)),
                    // Not positive definite: past the critical load, or a mechanism. LU can still
                    // find the equilibrium below the dense ceiling, and it is reported unstable;
                    // above the ceiling there is no answer but that one.
                    None if ns <= super::time_integration::MAX_DENSE_FALLBACK_DOFS => {
                        let mut k_work = k_solve.to_dense_symmetric();
                        let mut f_work = f_solve.clone();
                        lu_solve(&mut k_work, &mut f_work, ns)
                    }
                    None => None,
                }
            }
        };
        let Some(u_indep) = solved else {
            return Ok(PDeltaResult3D {
                results: linear_results.clone(),
                iterations,
                converged: false,
                is_stable: false,
                b2_factor: f64::INFINITY,
                linear_results,
            });
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        let mut u_new = vec![0.0; n];
        for i in 0..nf { u_new[i] = u_f[i]; }

        let mut diff_norm = 0.0;
        let mut u_norm = 0.0;
        for i in 0..nf {
            diff_norm += (u_new[i] - u_current[i]).powi(2);
            u_norm += u_new[i].powi(2);
        }
        diff_norm = diff_norm.sqrt();
        u_norm = u_norm.sqrt();

        u_current = u_new;

        if u_norm > 1e-20 && diff_norm / u_norm < tolerance {
            converged = true;
            break;
        }
    }

    let (b2, drift_reversed) = sway_amplification_3d(dof_num, &u_prev, &u_current);

    let displacements = build_displacements_3d(dof_num, &u_current);
    let element_forces = compute_internal_forces_3d(input, dof_num, &u_current);

    // Reactions and constraint forces from the first-order K, as they always were.
    let (reactions, raw_constraint_forces) = match &system {
        PDeltaSystem3D::Dense(asm) => (
            compute_reactions_from_u_3d(input, dof_num, |d| {
                let mut val = -asm.f[d];
                for j in 0..n { val += asm.k[d * n + j] * u_current[j]; }
                val
            }),
            cs.as_ref().map(|fcs| {
                let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
                fcs.compute_constraint_forces(&k_ff, &u_current[..nf], &asm.f[..nf])
            }),
        ),
        PDeltaSystem3D::Sparse(asm) => {
            let ku = asm.k_full.as_ref().expect("assembled with the full K").sym_mat_vec(&u_current);
            (
                compute_reactions_from_u_3d(input, dof_num, |d| ku[d] - asm.f[d]),
                cs.as_ref().map(|fcs| fcs.compute_constraint_forces_sparse(&asm.k_ff, &u_current[..nf], &asm.f[..nf])),
            )
        }
    };
    let constraint_forces = raw_constraint_forces
        .map(|raw| super::constraints::map_dof_forces_to_constraint_forces(&raw, dof_num))
        .unwrap_or_default();

    Ok(PDeltaResult3D {
        results: AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: compute_plate_stresses(input, dof_num, &u_current, None), quad_stresses: compute_quad_stresses(input, dof_num, &u_current, None), quad_nodal_stresses: vec![], constraint_forces,
            // Carried from the linear pass, as in the 2D entry point: they
            // describe the model, not the solution path.
            diagnostics: linear_results.diagnostics.clone(),
            solver_diagnostics: model_solver_diagnostics(&linear_results.solver_diagnostics),
            structured_diagnostics: model_structured_diagnostics(&linear_results.structured_diagnostics),
            equilibrium: None, timings: None, result_summary: None, solver_run_meta: None },
        iterations,
        converged,
        // Past the critical load LU still finds an equilibrium, and it is an unstable one: it
        // used to be reported converged and stable, with the sway's sign reversed.
        is_stable: converged && !drift_reversed && b2 < 100.0 && !(k_positive_definite && !last_positive_definite),
        b2_factor: b2,
        linear_results,
    })
}

/// B2 of a 3D P-Delta: the second- over the first-order horizontal drift (x, y) at the node that
/// drifts most in first order, and whether that drift reversed.
///
/// It used to be the largest ratio over every DOF with a first-order value above 1e-12, and on a
/// building a rotation of 5e-7 that grew to 5e-4 gave 979 while the largest drift grew 7 %: the
/// combination was reported unstable. The drift is what B2 amplifies.
fn sway_amplification_3d(dof_num: &DofNumbering, first: &[f64], second: &[f64]) -> (f64, bool) {
    let at = |u: &[f64], node: usize, i: usize| dof_num.map.get(&(node, i)).map_or(0.0, |&d| u[d]);
    let mut nodes: Vec<usize> = dof_num.map.keys().map(|&(node, _)| node).collect();
    nodes.sort_unstable();
    nodes.dedup();
    let mut worst: Option<(f64, [f64; 2], [f64; 2])> = None;
    for node in nodes {
        let a = [at(first, node, 0), at(first, node, 1)];
        let h = a[0].hypot(a[1]);
        if worst.map_or(true, |(m, _, _)| h > m) {
            worst = Some((h, a, [at(second, node, 0), at(second, node, 1)]));
        }
    }
    match worst {
        Some((h, a, b)) if h > 1e-12 => {
            if a[0] * b[0] + a[1] * b[1] <= 0.0 { (f64::INFINITY, true) } else { (b[0].hypot(b[1]) / h, false) }
        }
        _ => (1.0, false),
    }
}

fn compute_reactions_from_u_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    k_row_times_u_minus_f: impl Fn(usize) -> f64,
) -> Vec<Reaction3D> {
    let nf = dof_num.n_free;
    let mut reactions = Vec::new();

    for sup in input.supports.values() {
        let mut r = [0.0f64; 6];
        for i in 0..6 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                if d >= nf {
                    r[i] = k_row_times_u_minus_f(d);
                }
            }
        }
        reactions.push(Reaction3D {
            node_id: sup.node_id,
            fx: r[0], fy: r[1], fz: r[2], mx: r[3], my: r[4], mz: r[5],
            bimoment: None,
        });
    }
    reactions
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// A building of `bays`×`bays` bays and `storeys` storeys, fixed at the base, with gravity on
    /// every floor node and a push along x. With `diaphragms`, each floor is one.
    fn building(bays: usize, storeys: usize, diaphragms: bool) -> SolverInput3D {
        let (span, h) = (6.0, 3.5);
        let id = |i: usize, j: usize, k: usize| 1 + k * (bays + 1) * (bays + 1) + j * (bays + 1) + i;
        let mut nodes = HashMap::new();
        for k in 0..=storeys { for j in 0..=bays { for i in 0..=bays {
            let n = id(i, j, k);
            nodes.insert(n.to_string(), SolverNode3D { id: n, x: span * i as f64, y: span * j as f64, z: h * k as f64 });
        }}}
        let mut elements = HashMap::new();
        let mut member = |a: usize, b: usize, section_id: usize| {
            let e = elements.len() + 1;
            elements.insert(e.to_string(), SolverElement3D {
                id: e, elem_type: "frame".into(), node_i: a, node_j: b, material_id: 1, section_id,
                release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            });
        };
        for k in 0..storeys { for j in 0..=bays { for i in 0..=bays { member(id(i, j, k), id(i, j, k + 1), 1); }}}
        for k in 1..=storeys { for j in 0..=bays { for i in 0..=bays {
            if i < bays { member(id(i, j, k), id(i + 1, j, k), 2); }
            if j < bays { member(id(i, j, k), id(i, j + 1, k), 2); }
        }}}
        let mut supports = HashMap::new();
        for j in 0..=bays { for i in 0..=bays {
            let n = id(i, j, 0);
            supports.insert(n.to_string(), SolverSupport3D {
                node_id: n, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true,
                kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            });
        }}
        let mut loads = Vec::new();
        for k in 1..=storeys { for j in 0..=bays { for i in 0..=bays {
            let fx = if i == 0 { 15.0 } else { 0.0 };
            loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: id(i, j, k), fx, fy: 0.0, fz: -400.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
        }}}
        let constraints = if diaphragms {
            (1..=storeys).map(|k| Constraint::Diaphragm(DiaphragmConstraint {
                master_node: id(0, 0, k),
                slave_nodes: (0..=bays).flat_map(|j| (0..=bays).map(move |i| (i, j))).filter(|&(i, j)| (i, j) != (0, 0)).map(|(i, j)| id(i, j, k)).collect(),
                plane: "XY".into(),
            })).collect()
        } else { vec![] };
        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.012, iy: 1.5e-4, iz: 1.5e-4, j: 2.0e-6, cw: None, as_y: None, as_z: None });
        sections.insert("2".into(), SolverSection3D { id: 2, name: None, a: 0.008, iy: 2.5e-4, iz: 1.0e-5, j: 1.0e-6, cw: None, as_y: None, as_z: None });
        SolverInput3D {
            nodes, materials, sections, elements, supports, loads, constraints, left_hand: None,
            plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
            solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
        }
    }

    fn both(input: &SolverInput3D) -> (PDeltaResult3D, PDeltaResult3D) {
        let dof_num = DofNumbering::build_3d(input);
        let cs = || FreeConstraintSystem::build_3d(&input.constraints, &dof_num, &input.nodes);
        (
            solve_pdelta_3d_on(input, &dof_num, cs(), false, 30, 1e-8).unwrap(),
            solve_pdelta_3d_on(input, &dof_num, cs(), true, 30, 1e-8).unwrap(),
        )
    }

    fn assert_same(d: &PDeltaResult3D, s: &PDeltaResult3D) {
        assert!(d.converged && s.converged);
        assert_eq!(d.iterations, s.iterations);
        assert!((d.b2_factor - s.b2_factor).abs() < 1e-9 * d.b2_factor, "B2 {} and {}", d.b2_factor, s.b2_factor);
        let scale = d.results.displacements.iter().map(|x| x.ux.abs().max(x.uz.abs())).fold(0.0, f64::max);
        for (a, b) in d.results.displacements.iter().zip(&s.results.displacements) {
            assert_eq!(a.node_id, b.node_id);
            for (p, q) in [(a.ux, b.ux), (a.uy, b.uy), (a.uz, b.uz), (a.rx, b.rx), (a.ry, b.ry), (a.rz, b.rz)] {
                assert!((p - q).abs() < 1e-9 * scale, "node {}: {p} and {q}", a.node_id);
            }
        }
        let by = |r: &PDeltaResult3D| r.results.reactions.iter().map(|x| (x.node_id, [x.fx, x.fy, x.fz, x.mx, x.my, x.mz])).collect::<HashMap<_, _>>();
        let (rd, rs) = (by(d), by(s));
        let rmax = rd.values().flat_map(|v| v.iter()).fold(0.0f64, |m, v| m.max(v.abs()));
        for (n, a) in &rd {
            for (p, q) in a.iter().zip(&rs[n]) {
                assert!((p - q).abs() < 1e-8 * rmax, "reaction at {n}: {p} and {q}");
            }
        }
    }

    #[test]
    fn sparse_pdelta_matches_the_dense_one() {
        let input = building(2, 3, false);
        let (d, s) = both(&input);
        assert!(d.b2_factor > 1.02, "the push must be amplified, B2 = {}", d.b2_factor);
        assert_same(&d, &s);
    }

    #[test]
    fn sparse_pdelta_matches_the_dense_one_with_diaphragms() {
        let input = building(2, 3, true);
        let (d, s) = both(&input);
        assert_same(&d, &s);
        // Both drop residuals under 1e-15 in absolute terms, so a force that is zero in exact
        // arithmetic may appear on one side only: compared by node and DOF, a missing one is zero.
        let by = |r: &PDeltaResult3D| r.results.constraint_forces.iter().map(|c| ((c.node_id, c.dof.clone()), c.force)).collect::<HashMap<_, _>>();
        let (cd, cs) = (by(&d), by(&s));
        let fmax = cd.values().fold(0.0f64, |m, v| m.max(v.abs()));
        assert!(fmax > 1.0, "the diaphragms must carry force, largest {fmax}");
        for key in cd.keys().chain(cs.keys()) {
            let (p, q) = (cd.get(key).copied().unwrap_or(0.0), cs.get(key).copied().unwrap_or(0.0));
            assert!((p - q).abs() < 1e-8 * fmax, "constraint force at {key:?}: {p} and {q}");
        }
    }

    /// 7×7 bays and 18 storeys: 1152 free nodes and 6912 DOFs, the size of the building that ran
    /// the WASM heap out. Its dense K is 380 MB per copy, and `solve_pdelta_3d` used to hold three
    /// of them per iteration.
    #[test]
    fn a_large_building_solves_without_a_dense_matrix() {
        let input = building(7, 18, false);
        let r = solve_pdelta_3d(&input, 20, 1e-6).expect("solves");
        assert!(r.converged && r.is_stable, "iterations {}, B2 {}", r.iterations, r.b2_factor);
        // Gravity: every column line carries its share of the floors above.
        let fz: f64 = r.results.reactions.iter().map(|x| x.fz).sum();
        let applied = 400.0 * 64.0 * 18.0;
        assert!((fz - applied).abs() < 1e-6 * applied, "vertical reactions {fz}, applied {applied}");
    }

    /// A 4 m cantilever of 4 elements under `p` down and a small push, fixed at its foot.
    fn cantilever(p: f64) -> SolverInput3D {
        let mut input = building(1, 1, false);
        input.nodes = (0..=4).map(|k| ((k + 1).to_string(), SolverNode3D { id: k + 1, x: 0.0, y: 0.0, z: k as f64 })).collect();
        input.elements = (1..=4).map(|k| {
            let mut e = input.elements.values().next().unwrap().clone();
            e.id = k; e.node_i = k; e.node_j = k + 1; e.section_id = 1;
            (k.to_string(), e)
        }).collect();
        let fixed = input.supports.values().next().unwrap().clone();
        input.supports = HashMap::from([("1".into(), SolverSupport3D { node_id: 1, ..fixed })]);
        input.loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 0.5, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
        input
    }

    #[test]
    fn past_the_critical_load_the_answer_is_not_stable() {
        // π²·EI/(4·L²) with EI = 200 000 × 1000 × 1.5e-4: 1850 kN.
        let critical = std::f64::consts::PI.powi(2) * 200_000.0 * 1000.0 * 1.5e-4 / (4.0 * 16.0);
        for (p, stable) in [(0.5 * critical, true), (1.5 * critical, false)] {
            let input = cantilever(p);
            let dof_num = DofNumbering::build_3d(&input);
            for sparse in [false, true] {
                let r = solve_pdelta_3d_on(&input, &dof_num, None, sparse, 30, 1e-8).unwrap();
                assert_eq!(r.is_stable, stable, "P = {p:.0} kN (critical {critical:.0}), sparse {sparse}: B2 {}", r.b2_factor);
                // The exact head drift at half the critical load is 1.98 times the linear one.
                if stable { assert!(r.converged && (r.b2_factor - 1.98).abs() < 0.06, "B2 {}", r.b2_factor); }
            }
        }
    }

}
