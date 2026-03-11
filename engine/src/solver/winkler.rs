use std::collections::HashMap;
use crate::types::*;
use crate::solver::dof::DofNumbering;
use crate::solver::assembly::*;
use crate::solver::linear::{build_displacements_2d, compute_internal_forces_2d,
                             build_reactions_2d, build_displacements_3d,
                             compute_internal_forces_3d, build_reactions_3d,
                             compute_plate_stresses, compute_quad_stresses};
use crate::linalg::*;
use serde::{Deserialize, Serialize};
use super::constraints::FreeConstraintSystem;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundationSpring {
    pub element_id: usize,
    /// Foundation modulus (force per length per displacement), e.g., kN/m/m
    pub kf: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinklerInput {
    pub solver: SolverInput,
    pub foundation_springs: Vec<FoundationSpring>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundationSpring3D {
    pub element_id: usize,
    #[serde(default)]
    pub ky: Option<f64>,
    #[serde(default)]
    pub kz: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WinklerInput3D {
    pub solver: SolverInput3D,
    pub foundation_springs: Vec<FoundationSpring3D>,
}

// ==================== 2D Winkler Solver ====================

pub fn solve_winkler_2d(input: &WinklerInput) -> Result<AnalysisResults, String> {
    let dof_num = DofNumbering::build_2d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    let mut asm = assemble_2d(&input.solver, &dof_num);

    // Build O(1) lookup maps
    let node_by_id: HashMap<usize, &SolverNode> =
        input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> =
        input.solver.elements.values().map(|e| (e.id, e)).collect();

    // Add Winkler foundation stiffness
    for spring in &input.foundation_springs {
        add_foundation_2d(&mut asm.k, n, spring, &node_by_id, &elem_by_id, &dof_num)?;
    }

    // Prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        if sup.support_type == "spring" { continue; }
        let prescribed: [(usize, Option<f64>); 3] = [
            (0, sup.dx), (1, sup.dy), (2, sup.drz),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf { u_r[d - nf] = v; }
                    }
                }
            }
        }
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf { f_f[i] -= k_fr_ur[i]; }

    // Constraint reduction
    let cs = FreeConstraintSystem::build_2d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let (k_solve, f_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f), cs.n_free_indep)
    } else {
        (k_ff, f_f.clone(), nf)
    };

    let u_indep = {
        let mut k_work = k_solve.clone();
        match cholesky_solve(&mut k_work, &f_solve, ns) {
            Some(u) => u,
            None => {
                let mut k_work = k_solve;
                let mut f_work = f_solve;
                lu_solve(&mut k_work, &mut f_work, ns)
                    .ok_or_else(|| "Singular stiffness matrix".to_string())?
            }
        }
    };

    let u_f = if let Some(ref cs) = cs {
        cs.expand_solution(&u_indep)
    } else {
        u_indep
    };

    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr { reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i]; }

    let displacements = build_displacements_2d(&dof_num, &u_full);
    let mut reactions = build_reactions_2d(&input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full);
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_2d(&input.solver, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults { displacements, reactions, element_forces, constraint_forces, diagnostics: vec![], solver_diagnostics: vec![] })
}

// ==================== 3D Winkler Solver ====================

pub fn solve_winkler_3d(input: &WinklerInput3D) -> Result<AnalysisResults3D, String> {
    let dof_num = DofNumbering::build_3d(&input.solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    let mut asm = assemble_3d(&input.solver, &dof_num);

    // Build O(1) lookup maps
    let node_by_id: HashMap<usize, &SolverNode3D> =
        input.solver.nodes.values().map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        input.solver.elements.values().map(|e| (e.id, e)).collect();

    for spring in &input.foundation_springs {
        add_foundation_3d(&mut asm.k, n, spring, &input.solver, &node_by_id, &elem_by_id, &dof_num)?;
    }

    // Prescribed displacements
    let mut u_r = vec![0.0; nr];
    for sup in input.solver.supports.values() {
        let prescribed: [(usize, Option<f64>); 6] = [
            (0, sup.dx), (1, sup.dy), (2, sup.dz),
            (3, sup.drx), (4, sup.dry), (5, sup.drz),
        ];
        for &(local_dof, val) in &prescribed {
            if let Some(v) = val {
                if v.abs() > 1e-15 {
                    if let Some(&d) = dof_num.map.get(&(sup.node_id, local_dof)) {
                        if d >= nf { u_r[d - nf] = v; }
                    }
                }
            }
        }
    }

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf { f_f[i] -= k_fr_ur[i]; }

    // Constraint reduction
    let cs = FreeConstraintSystem::build_3d(&input.solver.constraints, &dof_num, &input.solver.nodes);
    let (k_solve, f_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f), cs.n_free_indep)
    } else {
        (k_ff, f_f.clone(), nf)
    };

    let u_indep = {
        let mut k_work = k_solve.clone();
        match cholesky_solve(&mut k_work, &f_solve, ns) {
            Some(u) => u,
            None => {
                let mut k_work = k_solve;
                let mut f_work = f_solve;
                lu_solve(&mut k_work, &mut f_work, ns)
                    .ok_or_else(|| "Singular stiffness matrix".to_string())?
            }
        }
    };

    let u_f = if let Some(ref cs) = cs {
        cs.expand_solution(&u_indep)
    } else {
        u_indep
    };

    let mut u_full = vec![0.0; n];
    for i in 0..nf { u_full[i] = u_f[i]; }
    for i in 0..nr { u_full[nf + i] = u_r[i]; }

    let k_rf = extract_submatrix(&asm.k, n, &rest_idx, &free_idx);
    let k_rr = extract_submatrix(&asm.k, n, &rest_idx, &rest_idx);
    let f_r = extract_subvec(&asm.f, &rest_idx);
    let k_rf_uf = mat_vec_rect(&k_rf, &u_f, nr, nf);
    let k_rr_ur = mat_vec_rect(&k_rr, &u_r, nr, nr);
    let mut reactions_vec = vec![0.0; nr];
    for i in 0..nr { reactions_vec[i] = k_rf_uf[i] + k_rr_ur[i] - f_r[i]; }

    let displacements = build_displacements_3d(&dof_num, &u_full);
    let mut reactions = build_reactions_3d(&input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full);
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_3d(&input.solver, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    // Compute constraint forces if constraints are active
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        super::constraints::map_dof_forces_to_constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    Ok(AnalysisResults3D {
        displacements, reactions, element_forces,
        plate_stresses: compute_plate_stresses(&input.solver, &dof_num, &u_full),
        quad_stresses: compute_quad_stresses(&input.solver, &dof_num, &u_full),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        timings: None,
    })
}

// ==================== Foundation Matrix Helpers ====================

fn add_foundation_2d(
    k_global: &mut [f64], n: usize,
    spring: &FoundationSpring,
    node_by_id: &HashMap<usize, &SolverNode>,
    elem_by_id: &HashMap<usize, &SolverElement>,
    dof_num: &DofNumbering,
) -> Result<(), String> {
    let elem = elem_by_id.get(&spring.element_id)
        .ok_or_else(|| format!("Element {} not found", spring.element_id))?;

    if elem.elem_type == "truss" || elem.elem_type == "cable" { return Ok(()); }

    let node_i = node_by_id[&elem.node_i];
    let node_j = node_by_id[&elem.node_j];
    let dx = node_j.x - node_i.x;
    let dy = node_j.y - node_i.y;
    let l = (dx * dx + dy * dy).sqrt();
    let cos = dx / l;
    let sin = dy / l;

    // Build 4x4 Winkler matrix for transverse DOFs
    let kf_4x4 = winkler_foundation_matrix(spring.kf, l);

    // Embed into 6x6 local frame matrix (DOFs: u1,v1,θ1,u2,v2,θ2)
    let local_map = [1usize, 2, 4, 5]; // v1, θ1, v2, θ2
    let mut k_found_6x6 = vec![0.0; 36];
    for (i, &li) in local_map.iter().enumerate() {
        for (j, &lj) in local_map.iter().enumerate() {
            k_found_6x6[li * 6 + lj] += kf_4x4[i * 4 + j];
        }
    }

    // Transform to global
    let t = crate::element::frame_transform_2d(cos, sin);
    let k_found_global = transform_stiffness(&k_found_6x6, &t, 6);

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    let ndof = elem_dofs.len();
    for i in 0..ndof {
        for j in 0..ndof {
            k_global[elem_dofs[i] * n + elem_dofs[j]] += k_found_global[i * ndof + j];
        }
    }
    Ok(())
}

fn add_foundation_3d(
    k_global: &mut [f64], n: usize,
    spring: &FoundationSpring3D, input: &SolverInput3D,
    node_by_id: &HashMap<usize, &SolverNode3D>,
    elem_by_id: &HashMap<usize, &SolverElement3D>,
    dof_num: &DofNumbering,
) -> Result<(), String> {
    let elem = elem_by_id.get(&spring.element_id)
        .ok_or_else(|| format!("Element {} not found", spring.element_id))?;

    if elem.elem_type == "truss" || elem.elem_type == "cable" { return Ok(()); }

    let node_i = node_by_id[&elem.node_i];
    let node_j = node_by_id[&elem.node_j];
    let dx = node_j.x - node_i.x;
    let dy = node_j.y - node_i.y;
    let dz = node_j.z - node_i.z;
    let l = (dx * dx + dy * dy + dz * dz).sqrt();

    let dpn = dof_num.dofs_per_node;
    let ndof_elem = dpn * 2;
    let mut k_found_local = vec![0.0; ndof_elem * ndof_elem];

    // Y-direction springs: affects vy and θz
    if let Some(ky) = spring.ky {
        let kf_4x4 = winkler_foundation_matrix(ky, l);
        // vy1=1, θz1=5, vy2=dpn+1, θz2=dpn+5
        let local_map = [1usize, 5, dpn + 1, dpn + 5];
        for (i, &li) in local_map.iter().enumerate() {
            for (j, &lj) in local_map.iter().enumerate() {
                if li < ndof_elem && lj < ndof_elem {
                    k_found_local[li * ndof_elem + lj] += kf_4x4[i * 4 + j];
                }
            }
        }
    }

    // Z-direction springs: affects vz and θy
    if let Some(kz) = spring.kz {
        let kf_4x4 = winkler_foundation_matrix(kz, l);
        // vz1=2, θy1=4, vz2=dpn+2, θy2=dpn+4
        let local_map = [2usize, 4, dpn + 2, dpn + 4];
        for (i, &li) in local_map.iter().enumerate() {
            for (j, &lj) in local_map.iter().enumerate() {
                if li < ndof_elem && lj < ndof_elem {
                    k_found_local[li * ndof_elem + lj] += kf_4x4[i * 4 + j];
                }
            }
        }
    }

    // Transform to global
    let left_hand = input.left_hand.unwrap_or(false);
    let (ex, ey, ez) = crate::element::compute_local_axes_3d(
        node_i.x, node_i.y, node_i.z,
        node_j.x, node_j.y, node_j.z,
        elem.local_yx, elem.local_yy, elem.local_yz,
        elem.roll_angle, left_hand,
    );
    let t = if dpn >= 7 {
        crate::element::frame_transform_3d_warping(&ex, &ey, &ez)
    } else {
        crate::element::frame_transform_3d(&ex, &ey, &ez)
    };
    let k_found_global = transform_stiffness(&k_found_local, &t, ndof_elem);

    let elem_dofs = dof_num.element_dofs(elem.node_i, elem.node_j);
    let ndof = elem_dofs.len();
    for i in 0..ndof {
        for j in 0..ndof {
            k_global[elem_dofs[i] * n + elem_dofs[j]] += k_found_global[i * ndof + j];
        }
    }
    Ok(())
}

/// Consistent Winkler foundation stiffness matrix (4x4).
/// kf: foundation modulus (force/length/displacement)
/// l: element length
/// DOFs: [v1, θ1, v2, θ2]
fn winkler_foundation_matrix(kf: f64, l: f64) -> Vec<f64> {
    let c = kf * l / 420.0;
    let l2 = l * l;
    vec![
        156.0 * c,     22.0 * l * c,   54.0 * c,      -13.0 * l * c,
        22.0 * l * c,  4.0 * l2 * c,   13.0 * l * c,  -3.0 * l2 * c,
        54.0 * c,      13.0 * l * c,   156.0 * c,     -22.0 * l * c,
        -13.0 * l * c, -3.0 * l2 * c,  -22.0 * l * c,  4.0 * l2 * c,
    ]
}
