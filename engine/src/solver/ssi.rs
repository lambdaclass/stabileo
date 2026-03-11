/// Soil-Structure Interaction (SSI) solver with nonlinear p-y/t-z/q-z curves.
///
/// Extends Winkler foundation analysis with iterative secant stiffness updates.
/// Springs along pile elements are updated based on displacement-dependent
/// soil reaction curves.
///
/// Iteration scheme:
/// 1. Assemble structure stiffness K
/// 2. Add secant soil spring stiffnesses along pile elements
/// 3. Solve K*u = F
/// 4. Evaluate soil curves at computed displacements
/// 5. Update secant stiffnesses
/// 6. Repeat until convergence
use serde::{Serialize, Deserialize};
use crate::types::*;
use crate::linalg::*;
use super::dof::DofNumbering;
use super::assembly;
use super::linear;
use super::soil_curves::{SoilCurve, evaluate_soil_curve};
use super::constraints::FreeConstraintSystem;

/// Soil spring attached to a node along a pile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoilSpring {
    /// Node ID where the spring is attached
    pub node_id: usize,
    /// Direction: 0=X, 1=Y (2D) or 0=X, 1=Y, 2=Z (3D)
    pub direction: usize,
    /// Soil curve type
    pub curve: SoilCurve,
    /// Tributary length for this spring (m)
    pub tributary_length: f64,
}

/// SSI analysis input (2D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput {
    pub solver: SolverInput,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

/// SSI analysis input (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIInput3D {
    pub solver: SolverInput3D,
    pub soil_springs: Vec<SoilSpring>,
    #[serde(default = "default_max_iter")]
    pub max_iter: usize,
    #[serde(default = "default_tolerance")]
    pub tolerance: f64,
}

fn default_max_iter() -> usize { 50 }
fn default_tolerance() -> f64 { 1e-4 }

/// SSI analysis result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult {
    pub results: AnalysisResults,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// SSI analysis result (3D).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSIResult3D {
    pub results: AnalysisResults3D,
    pub iterations: usize,
    pub converged: bool,
    pub spring_results: Vec<SpringResult>,
}

/// Per-spring result.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringResult {
    pub node_id: usize,
    pub direction: usize,
    pub displacement: f64,
    pub reaction: f64,
    pub secant_stiffness: f64,
}

/// Solve a 2D SSI problem with nonlinear soil springs.
pub fn solve_ssi_2d(input: &SSIInput) -> Result<SSIResult, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    // Base assembly (without soil springs)
    let base_asm = assembly::assemble_2d(&input.solver, &dof_num);

    // Initialize secant stiffnesses (use initial tangent from curves)
    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 1e-8);
            k0 * s.tributary_length
        })
        .collect();

    // Constraint system (built once before iteration)
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;

    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        // Assemble: base K + soil springs
        let mut k_global = base_asm.k.clone();
        let f_global = base_asm.f.clone();

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            if let Some(&d) = dof_num.map.get(&(spring.node_id, dir)) {
                k_global[d * n + d] += spring_k[si];
            }
        }

        // Solve
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = f_global[..nf].to_vec();

        let (k_s, f_s) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };

        let u_indep = {
            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s;
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or("Singular stiffness in SSI iteration")?
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf { u_full[i] = u_f[i]; }

        // Update soil spring stiffnesses
        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp);
            let new_k = k_secant * spring.tributary_length;

            let old_k = spring_k[si];
            let change = (new_k - old_k).abs();
            let ref_val = old_k.abs().max(new_k.abs()).max(1.0);
            max_change = max_change.max(change / ref_val);

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    // Build final results
    let displacements = linear::build_displacements_2d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_2d(&input.solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp);
            SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.tributary_length,
                secant_stiffness: spring_k[si],
            }
        })
        .collect();

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&base_asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &base_asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(SSIResult {
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
        spring_results,
    })
}

/// Solve a 3D SSI problem with nonlinear soil springs.
pub fn solve_ssi_3d(input: &SSIInput3D) -> Result<SSIResult3D, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    if dof_num.n_free == 0 {
        return Err("No free DOFs".into());
    }

    let n = dof_num.n_total;
    let nf = dof_num.n_free;

    let base_asm = assembly::assemble_3d(&input.solver, &dof_num);

    // Constraint system (built once before iteration)
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let ns = cs.as_ref().map_or(nf, |c| c.n_free_indep);

    let mut spring_k: Vec<f64> = input.soil_springs.iter()
        .map(|s| {
            let (_, k0) = evaluate_soil_curve(&s.curve, 1e-8);
            k0 * s.tributary_length
        })
        .collect();

    let mut u_full = vec![0.0; n];
    let mut converged = false;
    let mut total_iters = 0;

    for iter in 0..input.max_iter {
        total_iters = iter + 1;

        let mut k_global = base_asm.k.clone();
        let f_global = base_asm.f.clone();

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            if let Some(&d) = dof_num.map.get(&(spring.node_id, dir)) {
                k_global[d * n + d] += spring_k[si];
            }
        }

        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&k_global, n, &free_idx, &free_idx);
        let f_f: Vec<f64> = f_global[..nf].to_vec();

        let (k_s, f_s) = if let Some(ref cs) = cs {
            (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f))
        } else {
            (k_ff, f_f)
        };

        let u_indep = {
            let mut k_work = k_s.clone();
            match cholesky_solve(&mut k_work, &f_s, ns) {
                Some(u) => u,
                None => {
                    let mut k_work = k_s;
                    let mut f_work = f_s;
                    lu_solve(&mut k_work, &mut f_work, ns)
                        .ok_or("Singular stiffness in 3D SSI iteration")?
                }
            }
        };

        let u_f = if let Some(ref cs) = cs {
            cs.expand_solution(&u_indep)
        } else {
            u_indep
        };

        for i in 0..nf { u_full[i] = u_f[i]; }

        let mut max_change = 0.0_f64;

        for (si, spring) in input.soil_springs.iter().enumerate() {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);

            let (_reaction, k_secant) = evaluate_soil_curve(&spring.curve, disp);
            let new_k = k_secant * spring.tributary_length;

            let old_k = spring_k[si];
            let change = (new_k - old_k).abs();
            let ref_val = old_k.abs().max(new_k.abs()).max(1.0);
            max_change = max_change.max(change / ref_val);

            spring_k[si] = new_k;
        }

        if max_change < input.tolerance && iter > 0 {
            converged = true;
            break;
        }
    }

    let displacements = linear::build_displacements_3d(&dof_num, &u_full);
    let element_forces = linear::compute_internal_forces_3d(&input.solver, &dof_num, &u_full);

    let spring_results: Vec<SpringResult> = input.soil_springs.iter().enumerate()
        .map(|(si, spring)| {
            let dir = spring.direction.min(dof_num.dofs_per_node - 1);
            let disp = dof_num.map.get(&(spring.node_id, dir))
                .map(|&d| u_full[d])
                .unwrap_or(0.0);
            let (reaction, _) = evaluate_soil_curve(&spring.curve, disp);
            SpringResult {
                node_id: spring.node_id,
                direction: spring.direction,
                displacement: disp,
                reaction: reaction * spring.tributary_length,
                secant_stiffness: spring_k[si],
            }
        })
        .collect();

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let free_idx: Vec<usize> = (0..nf).collect();
        let k_ff = extract_submatrix(&base_asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &base_asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(SSIResult3D {
        results: AnalysisResults3D {
            displacements,
            reactions: vec![],
            element_forces,
            plate_stresses: linear::compute_plate_stresses(&input.solver, &dof_num, &u_full),
            quad_stresses: linear::compute_quad_stresses(&input.solver, &dof_num, &u_full),
            quad_nodal_stresses: vec![],
            constraint_forces,
            diagnostics: vec![],
            solver_diagnostics: vec![],
            timings: None,
        },
        iterations: total_iters,
        converged,
        spring_results,
    })
}
