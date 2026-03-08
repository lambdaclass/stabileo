use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly::*;
use super::linear::{build_displacements_2d, compute_internal_forces_2d,
    build_displacements_3d, compute_internal_forces_3d};

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

    let mut u_prev = vec![0.0; n];
    // Initialize with linear displacements
    for d in &linear_results.displacements {
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 0)) { u_prev[idx] = d.ux; }
        if let Some(&idx) = dof_num.map.get(&(d.node_id, 1)) { u_prev[idx] = d.uy; }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&idx) = dof_num.map.get(&(d.node_id, 2)) { u_prev[idx] = d.rz; }
        }
    }

    let mut converged = false;
    let mut iterations = 0;
    let mut u_current = u_prev.clone();
    let use_sparse = nf >= SPARSE_THRESHOLD;
    let mut symbolic: Option<SymbolicCholesky> = None;

    for iter in 0..max_iter {
        iterations = iter + 1;

        // Compute geometric stiffness from current axial forces
        let mut k_total = asm.k.clone();
        super::geometric_stiffness::add_geometric_stiffness_2d(input, &dof_num, &u_current, &mut k_total);

        // Extract Kff (with K_G) and solve
        let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);

        let u_f = if use_sparse {
            let k_ff_csc = CscMatrix::from_dense_symmetric(&k_ff, nf);
            let sym = symbolic.get_or_insert_with(|| symbolic_cholesky(&k_ff_csc));
            match numeric_cholesky(sym, &k_ff_csc) {
                Some(factor) => sparse_cholesky_solve(&factor, &f_f),
                None => {
                    // Fallback to dense LU
                    let mut k_work = k_ff;
                    let mut f_work = f_f.clone();
                    match lu_solve(&mut k_work, &mut f_work, nf) {
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
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f.clone();
                    match lu_solve(&mut k_work, &mut f_work, nf) {
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

    Ok(PDeltaResult {
        results: AnalysisResults {
            displacements,
            reactions,
            element_forces,
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
        let mut ry = 0.0;
        let mut mz = 0.0;

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
                ry = r;
            }
        }
        if dof_num.dofs_per_node >= 3 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, 2)) {
                if d >= nf {
                    let mut r = -asm.f[d];
                    for j in 0..n {
                        r += asm.k[d * n + j] * u[j];
                    }
                    mz = r;
                }
            }
        }

        reactions.push(Reaction { node_id: sup.node_id, rx, ry, mz });
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

/// Solve 3D P-Delta (second-order) analysis.
pub fn solve_pdelta_3d(
    input: &SolverInput3D,
    max_iter: usize,
    tolerance: f64,
) -> Result<PDeltaResult3D, String> {
    let dof_num = DofNumbering::build_3d(input);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let linear_results = super::linear::solve_3d(input)?;

    let asm = assemble_3d(input, &dof_num);
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let free_idx: Vec<usize> = (0..nf).collect();
    let f_f = extract_subvec(&asm.f, &free_idx);

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
    let use_sparse = nf >= SPARSE_THRESHOLD;
    let mut symbolic: Option<SymbolicCholesky> = None;

    for iter in 0..max_iter {
        iterations = iter + 1;

        let mut k_total = asm.k.clone();
        super::geometric_stiffness::add_geometric_stiffness_3d(input, &dof_num, &u_current, &mut k_total);

        let k_ff = extract_submatrix(&k_total, n, &free_idx, &free_idx);

        let u_f = if use_sparse {
            let k_ff_csc = CscMatrix::from_dense_symmetric(&k_ff, nf);
            let sym = symbolic.get_or_insert_with(|| symbolic_cholesky(&k_ff_csc));
            match numeric_cholesky(sym, &k_ff_csc) {
                Some(factor) => sparse_cholesky_solve(&factor, &f_f),
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f.clone();
                    match lu_solve(&mut k_work, &mut f_work, nf) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult3D {
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
            let mut k_work = k_ff.clone();
            match cholesky_solve(&mut k_work, &f_f, nf) {
                Some(u) => u,
                None => {
                    let mut k_work = k_ff;
                    let mut f_work = f_f.clone();
                    match lu_solve(&mut k_work, &mut f_work, nf) {
                        Some(u) => u,
                        None => {
                            return Ok(PDeltaResult3D {
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

    let mut max_ratio = 0.0f64;
    let u_linear_f = extract_subvec(&u_prev, &free_idx);
    let u_pdelta_f = extract_subvec(&u_current, &free_idx);
    for i in 0..nf {
        if u_linear_f[i].abs() > 1e-12 {
            max_ratio = max_ratio.max((u_pdelta_f[i] / u_linear_f[i]).abs());
        }
    }

    let displacements = build_displacements_3d(&dof_num, &u_current);
    let element_forces = compute_internal_forces_3d(input, &dof_num, &u_current);
    let reactions = compute_reactions_from_u_3d(input, &dof_num, &asm, &u_current);

    Ok(PDeltaResult3D {
        results: AnalysisResults3D { displacements, reactions, element_forces, plate_stresses: vec![], quad_stresses: vec![] },
        iterations,
        converged,
        is_stable: converged && max_ratio < 100.0,
        b2_factor: max_ratio,
        linear_results,
    })
}

fn compute_reactions_from_u_3d(
    input: &SolverInput3D,
    dof_num: &DofNumbering,
    asm: &AssemblyResult,
    u: &[f64],
) -> Vec<Reaction3D> {
    let n = dof_num.n_total;
    let nf = dof_num.n_free;
    let mut reactions = Vec::new();

    for sup in input.supports.values() {
        let mut r = [0.0f64; 6];
        for i in 0..6 {
            if let Some(&d) = dof_num.map.get(&(sup.node_id, i)) {
                if d >= nf {
                    let mut val = -asm.f[d];
                    for j in 0..n { val += asm.k[d * n + j] * u[j]; }
                    r[i] = val;
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
