/// Arc-length (Riks) and displacement control solvers for tracing
/// nonlinear equilibrium paths including limit points and snap-through.
///
/// Crisfield spherical arc-length:
///   ||Δu||² + Δλ² × ||f_ref||² = Δs²
///
/// Reference: Crisfield, "Non-linear Finite Element Analysis of Solids
///            and Structures" Vol. 1, Ch. 9
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::corotational::assemble_corotational_public;
use super::constraints::FreeConstraintSystem;

/// Arc-length analysis input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthInput {
    pub solver: SolverInput,
    /// Maximum number of arc-length steps
    #[serde(default = "default_max_steps")]
    pub max_steps: usize,
    /// Maximum N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
    /// Initial arc-length increment
    #[serde(default = "default_initial_ds")]
    pub initial_ds: f64,
    /// Minimum arc-length
    #[serde(default = "default_min_ds")]
    pub min_ds: f64,
    /// Maximum arc-length
    #[serde(default = "default_max_ds")]
    pub max_ds: f64,
    /// Target N-R iterations per step (for adaptive Δs)
    #[serde(default = "default_target_iter")]
    pub target_iter: usize,
}

fn default_max_steps() -> usize { 100 }
fn default_max_iter() -> usize { 30 }
fn default_tol() -> f64 { 1e-6 }
fn default_initial_ds() -> f64 { 0.1 }
fn default_min_ds() -> f64 { 1e-6 }
fn default_max_ds() -> f64 { 1.0 }
fn default_target_iter() -> usize { 5 }

/// Displacement control input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlInput {
    pub solver: SolverInput,
    /// Control node ID
    pub control_node: usize,
    /// Control DOF (0=ux, 1=uy, 2=rz)
    pub control_dof: usize,
    /// Target displacement at the control DOF
    pub target_displacement: f64,
    /// Number of displacement increments
    #[serde(default = "default_n_disp_steps")]
    pub n_steps: usize,
    /// Max N-R iterations per step
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    /// Convergence tolerance
    #[serde(default = "default_tol")]
    pub tolerance: f64,
}

fn default_n_disp_steps() -> usize { 20 }

/// Per-step snapshot on the equilibrium path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquilibriumStep {
    pub step: usize,
    pub load_factor: f64,
    pub control_displacement: f64,
    pub converged: bool,
    pub iterations: usize,
}

/// Arc-length analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArcLengthResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
}

/// Displacement control result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplacementControlResult {
    pub results: AnalysisResults,
    pub steps: Vec<EquilibriumStep>,
    pub final_load_factor: f64,
    pub converged: bool,
    pub total_iterations: usize,
}

/// Solve using Crisfield spherical arc-length method.
pub fn solve_arc_length(input: &ArcLengthInput) -> Result<ArcLengthResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    // Reference load vector
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let f_ref: Vec<f64> = asm.f[..nf].to_vec();
    let f_ref_s = if let Some(ref cs) = cs {
        cs.reduce_vector(&f_ref)
    } else {
        f_ref.clone()
    };
    let f_ref_norm = vec_norm(&f_ref);
    if f_ref_norm < 1e-15 {
        return Err("Zero reference load".into());
    }

    let mut u_full = vec![0.0; n];
    let mut lambda = 0.0_f64;
    let mut ds = input.initial_ds;
    let mut steps = Vec::new();
    let mut total_iters = 0;
    let mut overall_converged = true;

    // Previous increment direction (for sign determination)
    let mut prev_delta_u = vec![0.0; nf];
    let mut prev_delta_lambda = 1.0_f64;

    for step in 0..input.max_steps {
        // Predictor: solve K_T * δu_hat = f_ref
        let mut f_int = vec![0.0; n];
        let mut k_t = vec![0.0; n * n];
        assemble_corotational_public(&input.solver, &dof_num, &u_full, &mut f_int, &mut k_t);
        add_spring_stiffness(&input.solver, &dof_num, &u_full, &mut f_int, &mut k_t);

        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
        let k_s = if let Some(ref cs) = cs { cs.reduce_matrix(&k_ff) } else { k_ff };

        let du_hat_s = solve_system(&k_s, &f_ref_s, ns)?;
        let du_hat = if let Some(ref cs) = cs { cs.expand_solution(&du_hat_s) } else { du_hat_s };

        // Determine Δλ from arc-length constraint
        // ||Δu||² + Δλ² × ||f_ref||² = Δs²
        let du_hat_norm = vec_norm(&du_hat);
        let denom = du_hat_norm * du_hat_norm + f_ref_norm * f_ref_norm;
        let mut delta_lambda = ds / denom.sqrt();

        // Sign: follow previous direction
        let dot = dot_product(&prev_delta_u, &du_hat) + prev_delta_lambda * delta_lambda * f_ref_norm * f_ref_norm;
        if dot < 0.0 {
            delta_lambda = -delta_lambda;
        }

        // Predictor step
        let mut delta_u: Vec<f64> = du_hat.iter().map(|&v| delta_lambda * v).collect();

        // Apply predictor
        for i in 0..nf {
            u_full[i] += delta_u[i];
        }
        lambda += delta_lambda;

        // Corrector: N-R iterations with arc-length constraint
        let mut step_converged = false;
        let mut step_iters = 0;

        for _iter in 0..input.max_iter {
            step_iters += 1;
            total_iters += 1;

            // Compute residual
            let mut f_int_new = vec![0.0; n];
            let mut k_t_new = vec![0.0; n * n];
            assemble_corotational_public(&input.solver, &dof_num, &u_full, &mut f_int_new, &mut k_t_new);
            add_spring_stiffness(&input.solver, &dof_num, &u_full, &mut f_int_new, &mut k_t_new);

            let mut residual = vec![0.0; nf];
            for i in 0..nf {
                residual[i] = lambda * f_ref[i] - f_int_new[i];
            }

            // Check convergence on independent (reduced) DOFs
            let r_check = if let Some(ref cs) = cs {
                cs.reduce_vector(&residual)
            } else {
                residual.clone()
            };
            let r_norm = vec_norm(&r_check);
            let f_ext_norm = (lambda.abs() * f_ref_norm).max(1e-15);
            if r_norm / f_ext_norm < input.tolerance {
                step_converged = true;
                break;
            }

            // Two-system solve:
            // K_T * δu_r = R   (residual correction)
            // K_T * δu_t = f_ref (tangent correction)
            let k_ff_new = extract_submatrix(&k_t_new, n, &free_idx, &free_idx);
            let k_s_new = if let Some(ref cs) = cs { cs.reduce_matrix(&k_ff_new) } else { k_ff_new };
            let residual_s = if let Some(ref cs) = cs { cs.reduce_vector(&residual) } else { residual.clone() };
            let du_r_s = solve_system(&k_s_new, &residual_s, ns)?;
            let du_t_s = solve_system(&k_s_new, &f_ref_s, ns)?;
            let du_r = if let Some(ref cs) = cs { cs.expand_solution(&du_r_s) } else { du_r_s };
            let du_t = if let Some(ref cs) = cs { cs.expand_solution(&du_t_s) } else { du_t_s };

            // Arc-length constraint: quadratic equation for δλ
            // a*δλ² + b*δλ + c = 0
            let a_coeff = dot_product(&du_t, &du_t) + f_ref_norm * f_ref_norm;
            let b_coeff = 2.0 * (dot_product(&delta_u, &du_t) + dot_product(&du_r, &du_t)
                + delta_lambda * f_ref_norm * f_ref_norm);
            let c_coeff = dot_product(&delta_u, &delta_u) + 2.0 * dot_product(&delta_u, &du_r)
                + dot_product(&du_r, &du_r)
                + delta_lambda * delta_lambda * f_ref_norm * f_ref_norm
                - ds * ds;

            let discriminant = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
            let d_lambda = if discriminant >= 0.0 {
                let sqrt_d = discriminant.sqrt();
                let root1 = (-b_coeff + sqrt_d) / (2.0 * a_coeff);
                let root2 = (-b_coeff - sqrt_d) / (2.0 * a_coeff);

                // Choose root that gives positive work (follows the path)
                let du1: Vec<f64> = (0..nf).map(|i| du_r[i] + root1 * du_t[i]).collect();
                let du2: Vec<f64> = (0..nf).map(|i| du_r[i] + root2 * du_t[i]).collect();
                let work1 = dot_product(&delta_u, &du1);
                let work2 = dot_product(&delta_u, &du2);

                if work1 >= work2 { root1 } else { root2 }
            } else {
                // Negative discriminant: use minimum residual approach
                -b_coeff / (2.0 * a_coeff)
            };

            // Update
            for i in 0..nf {
                let du_i = du_r[i] + d_lambda * du_t[i];
                u_full[i] += du_i;
                delta_u[i] += du_i;
            }
            lambda += d_lambda;
            delta_lambda += d_lambda;
        }

        // Record step
        steps.push(EquilibriumStep {
            step: step + 1,
            load_factor: lambda,
            control_displacement: u_full.get(0).copied().unwrap_or(0.0),
            converged: step_converged,
            iterations: step_iters,
        });

        if !step_converged {
            // Halve arc-length and retry
            ds *= 0.5;
            if ds < input.min_ds {
                overall_converged = false;
                break;
            }
            // Restore state
            for i in 0..nf {
                u_full[i] -= delta_u[i];
            }
            lambda -= delta_lambda;
            continue;
        }

        // Save direction for next step
        prev_delta_u = delta_u;
        prev_delta_lambda = delta_lambda;

        // Adaptive arc-length
        if step_iters <= input.target_iter / 2 {
            ds = (ds * 2.0).min(input.max_ds);
        } else if step_iters > input.target_iter * 2 {
            ds = (ds * 0.5).max(input.min_ds);
        }
    }

    // Build final results
    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(ArcLengthResult {
        results: AnalysisResults {
            displacements,
            reactions: vec![],
            element_forces,
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
        },
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

/// Solve using displacement control method.
pub fn solve_displacement_control(input: &DisplacementControlInput) -> Result<DisplacementControlResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Build constraint system (if constraints present)
    let cs_dc = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns_dc = cs_dc.as_ref().map_or(nf, |c| c.n_free_indep);

    // Find global DOF index for control point
    let control_global = dof_num.map.get(&(input.control_node, input.control_dof))
        .ok_or("Control node/DOF not found in free DOFs")?;
    if *control_global >= nf {
        return Err("Control DOF is restrained".into());
    }
    let ctrl = *control_global;

    // Reference load
    let asm = assembly::assemble_2d(&input.solver, &dof_num);
    let f_ref: Vec<f64> = asm.f[..nf].to_vec();
    let f_ref_s_dc = if let Some(ref cs) = cs_dc {
        cs.reduce_vector(&f_ref)
    } else {
        f_ref.clone()
    };

    let mut u_full = vec![0.0; n];
    let mut lambda = 0.0_f64;
    let mut steps = Vec::new();
    let mut total_iters = 0;
    let mut overall_converged = true;

    let delta_d = input.target_displacement / input.n_steps as f64;

    for step in 0..input.n_steps {
        let target_disp = (step + 1) as f64 * delta_d;

        // N-R iterations
        let mut step_converged = false;
        let mut step_iters = 0;

        for _iter in 0..input.max_iter {
            step_iters += 1;
            total_iters += 1;

            // Compute tangent stiffness and internal forces
            let mut f_int = vec![0.0; n];
            let mut k_t = vec![0.0; n * n];
            assemble_corotational_public(&input.solver, &dof_num, &u_full, &mut f_int, &mut k_t);
            add_spring_stiffness(&input.solver, &dof_num, &u_full, &mut f_int, &mut k_t);

            // Residual
            let mut residual = vec![0.0; nf];
            for i in 0..nf {
                residual[i] = lambda * f_ref[i] - f_int[i];
            }

            // Displacement constraint: u[ctrl] = target_disp
            let disp_error = target_disp - u_full[ctrl];

            // Check convergence
            let r_norm = vec_norm(&residual);
            let f_ext_norm = (lambda.abs() * vec_norm(&f_ref)).max(1.0);
            if r_norm / f_ext_norm < input.tolerance && disp_error.abs() < input.tolerance * 10.0 {
                step_converged = true;
                break;
            }

            // Solve augmented system:
            // K_T * δu_r = R
            // K_T * δu_t = f_ref
            let free_idx: Vec<usize> = (0..nf).collect();
            let k_ff = extract_submatrix(&k_t, n, &free_idx, &free_idx);
            let k_s_dc = if let Some(ref cs) = cs_dc { cs.reduce_matrix(&k_ff) } else { k_ff };
            let residual_s = if let Some(ref cs) = cs_dc { cs.reduce_vector(&residual) } else { residual.clone() };
            let du_r_s = solve_system(&k_s_dc, &residual_s, ns_dc)?;
            let du_t_s = solve_system(&k_s_dc, &f_ref_s_dc, ns_dc)?;
            let du_r = if let Some(ref cs) = cs_dc { cs.expand_solution(&du_r_s) } else { du_r_s };
            let du_t = if let Some(ref cs) = cs_dc { cs.expand_solution(&du_t_s) } else { du_t_s };

            // Determine δλ from displacement constraint:
            // (u[ctrl] + δu_r[ctrl] + δλ * δu_t[ctrl]) = target_disp
            // δλ = (target_disp - u[ctrl] - δu_r[ctrl]) / δu_t[ctrl]
            let d_lambda = if du_t[ctrl].abs() > 1e-15 {
                (disp_error - du_r[ctrl]) / du_t[ctrl]
            } else {
                0.0
            };

            // Update
            for i in 0..nf {
                u_full[i] += du_r[i] + d_lambda * du_t[i];
            }
            lambda += d_lambda;
        }

        steps.push(EquilibriumStep {
            step: step + 1,
            load_factor: lambda,
            control_displacement: u_full[ctrl],
            converged: step_converged,
            iterations: step_iters,
        });

        if !step_converged {
            overall_converged = false;
            break;
        }
    }

    let displacements = super::linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = super::linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs_dc {
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(DisplacementControlResult {
        results: AnalysisResults {
            displacements,
            reactions: vec![],
            element_forces,
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
        },
        steps,
        final_load_factor: lambda,
        converged: overall_converged,
        total_iterations: total_iters,
    })
}

// ==================== Helpers ====================

fn vec_norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

fn dot_product(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn solve_system(k_ff: &[f64], rhs: &[f64], nf: usize) -> Result<Vec<f64>, String> {
    let mut k_work = k_ff.to_vec();
    match cholesky_solve(&mut k_work, rhs, nf) {
        Some(u) => Ok(u),
        None => {
            let mut k_work = k_ff.to_vec();
            let mut f_work = rhs.to_vec();
            lu_solve(&mut k_work, &mut f_work, nf)
                .ok_or_else(|| "Singular tangent stiffness".to_string())
        }
    }
}

/// Add spring stiffness from supports to tangent stiffness and internal forces.
fn add_spring_stiffness(
    input: &SolverInput,
    dof_num: &DofNumbering,
    u_full: &[f64],
    f_int: &mut [f64],
    k_t: &mut [f64],
) {
    let n = dof_num.n_total;
    for sup in input.supports.values() {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_cantilever() -> SolverInput {
        let mut nodes = HashMap::new();
        nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, y: 0.0 });
        nodes.insert("1".into(), SolverNode { id: 1, x: 5.0, y: 0.0 });

        let mut materials = HashMap::new();
        materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });

        let mut sections = HashMap::new();
        sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });

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

        SolverInput {
            nodes, materials, sections, elements, supports,
            loads: vec![SolverLoad::Nodal(SolverNodalLoad {
                node_id: 1, fx: 0.0, fy: -10.0, mz: 0.0,
            })],
            constraints: vec![],
            connectors: HashMap::new(),
        }
    }

    #[test]
    fn test_displacement_control_basic() {
        let solver = make_cantilever();
        let input = DisplacementControlInput {
            solver,
            control_node: 1,
            control_dof: 1, // uy
            target_displacement: -0.01,
            n_steps: 5,
            max_iter: 30,
            tolerance: 1e-6,
        };
        let result = solve_displacement_control(&input).unwrap();
        assert!(result.converged, "Should converge");
        assert!(result.steps.len() > 0);

        // Control DOF should reach target
        let d1 = result.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
        assert!(
            (d1.uy - (-0.01)).abs() < 1e-4,
            "Control DOF: got {} expected -0.01", d1.uy
        );
    }

    #[test]
    fn test_arc_length_basic() {
        let solver = make_cantilever();
        let input = ArcLengthInput {
            solver,
            max_steps: 20,
            max_iter: 30,
            tolerance: 1e-6,
            initial_ds: 0.5,
            min_ds: 1e-6,
            max_ds: 2.0,
            target_iter: 5,
        };
        let result = solve_arc_length(&input).unwrap();
        assert!(result.steps.len() > 0, "Should have at least one step");

        // For a linear cantilever, arc-length should trace the path
        // Load factor should be positive after the first step
        if let Some(last) = result.steps.last() {
            assert!(last.load_factor > 0.0, "Load factor should be positive");
        }
    }
}
