use std::collections::HashMap;
use crate::types::*;
use crate::solver::dof::DofNumbering;
use crate::solver::assembly::*;
use crate::solver::linear::{build_displacements_2d, compute_internal_forces_2d,
                             build_reactions_2d_inclined, build_displacements_3d,
                             compute_internal_forces_3d, build_reactions_3d_inclined,
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
    // Assembly resolves ids by direct map indexing: an element naming a
    // node that does not exist panicked there, which in WASM ends the
    // module rather than the call.
    super::linear::validate_input_2d(&input.solver)?;

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
        crate::ordered::values(&input.solver.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement> =
        crate::ordered::values(&input.solver.elements).map(|e| (e.id, e)).collect();

    reject_released_bedded_members_2d(input)?;

    // Add Winkler foundation stiffness
    for spring in &input.foundation_springs {
        add_foundation_2d(&mut asm.k, n, spring, &node_by_id, &elem_by_id, &dof_num)?;
    }

    // Prescribed displacements, in the inclined-support frames the restrained
    // DOFs are numbered in (one definition with the linear solver: this
    // hand-rolled copy assigned a rotated roller's raw global dz to its
    // normal DOF — found by the metamorphic rotation check).
    let u_r = super::linear::prescribed_displacements_2d(&input.solver, &dof_num);

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf { f_f[i] -= k_fr_ur[i]; }

    // Constraint reduction
    let cs = FreeConstraintSystem::build_2d(&input.solver, &dof_num)?;
    let (k_solve, f_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f), cs.n_free_indep)
    } else {
        (k_ff, f_f.clone(), nf)
    };

    let conditioning = crate::known_issues::dense_stiffness_conditioning(&k_solve, ns);
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

    // Compute constraint forces if constraints are active. Uses the
    // pre-reversal u_full/asm.f (rotated-frame convention) — u_full is
    // reversed below, before building the reported displacements/reactions.
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_2d so Winkler-foundation analysis reports
    // reactions and displacements in GLOBAL axes.
    for it in &asm.inclined_transforms_2d {
        reverse_inclined_transform_2d(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = build_displacements_2d(&dof_num, &u_full);
    let mut reactions = build_reactions_2d_inclined(
        &input.solver, &dof_num, &reactions_vec, &f_r, nf, &u_full, &asm.inclined_transforms_2d,
    );
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_2d(&input.solver, &dof_num, &u_full);
    add_foundation_forces_2d(&mut element_forces, input, &node_by_id, &elem_by_id, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    Ok(AnalysisResults { displacements, reactions, element_forces, constraint_forces, diagnostics: vec![], solver_diagnostics: vec![], structured_diagnostics: { let mut d = crate::known_issues::for_2d(&input.solver, crate::known_issues::Analysis::Linear); crate::known_issues::attach(&mut d, conditioning.into_iter().collect()); d }, equilibrium: None, result_summary: None, solver_run_meta: None })
}

// ==================== 3D Winkler Solver ====================

pub fn solve_winkler_3d(input: &WinklerInput3D) -> Result<AnalysisResults3D, String> {
    super::linear::validate_input_3d(&input.solver)?;
    let mut pre_solve_diags = super::pre_solve_gates::run_pre_solve_gates_3d(&input.solver);
    super::pre_solve_gates::refuse_broken_elements(&pre_solve_diags)?;

    // Expand curved beams before DOF numbering and assembly.
    let input_solver = &super::linear::expand_curved_beams_3d(&input.solver);
    let dof_num = DofNumbering::build_3d(input_solver);
    let nf = dof_num.n_free;
    let n = dof_num.n_total;
    let nr = n - nf;

    if nf == 0 {
        return Err("No free DOFs".into());
    }

    let mut asm = assemble_3d(input_solver, &dof_num);

    // Build O(1) lookup maps
    let node_by_id: HashMap<usize, &SolverNode3D> =
        crate::ordered::values(&input_solver.nodes).map(|n| (n.id, n)).collect();
    let elem_by_id: HashMap<usize, &SolverElement3D> =
        crate::ordered::values(&input_solver.elements).map(|e| (e.id, e)).collect();

    reject_released_bedded_members_3d(input)?;
    for spring in &input.foundation_springs {
        add_foundation_3d(&mut asm.k, n, spring, input_solver, &node_by_id, &elem_by_id, &dof_num)?;
    }

    // Prescribed displacements, in the inclined-support frames the restrained
    // DOFs are numbered in (one definition with the linear solver: this
    // hand-rolled copy assigned a rotated roller's raw global dz to its
    // normal DOF — found by the metamorphic rotation check).
    let u_r = super::linear::prescribed_displacements_3d(input_solver, &dof_num);

    let free_idx: Vec<usize> = (0..nf).collect();
    let rest_idx: Vec<usize> = (nf..n).collect();
    let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
    let mut f_f = extract_subvec(&asm.f, &free_idx);

    let k_fr = extract_submatrix(&asm.k, n, &free_idx, &rest_idx);
    let k_fr_ur = mat_vec_rect(&k_fr, &u_r, nf, nr);
    for i in 0..nf { f_f[i] -= k_fr_ur[i]; }

    // Constraint reduction
    let cs = FreeConstraintSystem::build_3d(&input_solver, &dof_num)?;
    let (k_solve, f_solve, ns) = if let Some(ref cs) = cs {
        (cs.reduce_matrix(&k_ff), cs.reduce_vector(&f_f), cs.n_free_indep)
    } else {
        (k_ff, f_f.clone(), nf)
    };

    let conditioning = crate::known_issues::dense_stiffness_conditioning(&k_solve, ns);
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

    // Compute constraint forces if constraints are active. Uses the
    // pre-reversal u_full/asm.f — see the 2D solver for why.
    let constraint_forces = if let Some(ref fcs) = cs {
        let k_ff = extract_submatrix(&asm.k, n, &free_idx, &free_idx);
        let raw = fcs.compute_constraint_forces(&k_ff, &u_full[..nf], &asm.f[..nf]);
        fcs.constraint_forces(&raw, &dof_num)
    } else {
        vec![]
    };

    // Reverse inclined transforms on displacements before building results —
    // mirrors linear::solve_3d.
    for it in &asm.inclined_transforms {
        reverse_inclined_transform(&mut u_full, &it.dofs, &it.r);
    }

    let displacements = build_displacements_3d(&dof_num, &u_full);
    let mut reactions = build_reactions_3d_inclined(
        input_solver, &dof_num, &reactions_vec, &f_r, nf, &u_full, &asm.inclined_transforms,
    );
    reactions.sort_by_key(|r| r.node_id);
    let mut element_forces = compute_internal_forces_3d(input_solver, &dof_num, &u_full);
    add_foundation_forces_3d(&mut element_forces, input, input_solver, &node_by_id, &elem_by_id, &dof_num, &u_full);
    element_forces.sort_by_key(|ef| ef.element_id);

    let r = AnalysisResults3D {
        displacements, reactions, element_forces,
        plate_stresses: compute_plate_stresses(input_solver, &dof_num, &u_full, None),
        quad_stresses: compute_quad_stresses(input_solver, &dof_num, &u_full, None),
        quad_nodal_stresses: vec![],
        constraint_forces,
        diagnostics: vec![],
        solver_diagnostics: vec![],
        structured_diagnostics: { crate::known_issues::attach(&mut pre_solve_diags, conditioning.into_iter().collect()); crate::known_issues::attach(&mut pre_solve_diags, crate::known_issues::for_3d(&input.solver, crate::known_issues::Analysis::Linear)); pre_solve_diags },
        equilibrium: None,
        timings: None,
        result_summary: None, solver_run_meta: None,
    };
    crate::known_issues::membrane_bending_3d(input_solver, &input_solver.loads, &r)?;
    Ok(r)
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
    let dy = node_j.z - node_i.z;
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

    // Z-direction springs: affects vz and θy. Bending about local y has
    // θy = −dw/dx (the frame's sign −1 block), so the matrix of
    // `winkler_foundation_matrix` (written for θ = +dv/dx) is taken as
    // D·K·D with D = diag(1, −1, 1, −1): the translation–rotation couplings
    // change sign. Using it unchanged made the z foundation a different (and
    // wrong) interpolation of w than the beam's own.
    if let Some(kz) = spring.kz {
        let mut kf_4x4 = winkler_foundation_matrix(kz, l);
        let d = [1.0, -1.0, 1.0, -1.0];
        for i in 0..4 {
            for j in 0..4 {
                kf_4x4[i * 4 + j] *= d[i] * d[j];
            }
        }
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

// ==================== Member forces with the bed ====================
//
// The bed is part of the member: the member's end forces are (K_e + K_f)·u − FEF, and its
// span carries the bed reaction p(x) = −k_f·v(x), with v the member's own cubic (Hermite)
// transverse displacement. The end forces were K_e·u − FEF alone, so a free end of a beam on a
// bed reported a shear and a moment of −K_f·u (docs/solver/assembly-constraints.md, AC-7).
// The bed reaction is reported with the member loads, as piecewise-linear pieces of p(x), so a
// diagram drawn from the end forces and the loads closes at the far end.

/// Number of linear pieces the cubic bed reaction is reported in.
const BED_PIECES: usize = 16;

/// Hermite transverse displacement at ξ = x/L from (v1, θ1, v2, θ2), θ = dv/dx.
fn hermite(v: [f64; 4], l: f64, xi: f64) -> f64 {
    let (x2, x3) = (xi * xi, xi * xi * xi);
    (1.0 - 3.0 * x2 + 2.0 * x3) * v[0] + l * (xi - 2.0 * x2 + x3) * v[1] + (3.0 * x2 - 2.0 * x3) * v[2] + l * (x3 - x2) * v[3]
}

/// The bed reaction −k_f·v(x) as linear pieces over [0, L].
fn bed_reaction_pieces(kf: f64, v: [f64; 4], l: f64) -> Vec<DistributedLoadInfo> {
    (0..BED_PIECES)
        .map(|k| {
            let (xa, xb) = (k as f64 / BED_PIECES as f64, (k + 1) as f64 / BED_PIECES as f64);
            DistributedLoadInfo { q_i: -kf * hermite(v, l, xa), q_j: -kf * hermite(v, l, xb), a: xa * l, b: xb * l }
        })
        .collect()
}

/// K_f·(v1, θ1, v2, θ2) for θ = dv/dx.
fn bed_end_forces(kf: f64, l: f64, v: [f64; 4]) -> [f64; 4] {
    let m = winkler_foundation_matrix(kf, l);
    let mut f = [0.0; 4];
    for i in 0..4 {
        for j in 0..4 {
            f[i] += m[i * 4 + j] * v[j];
        }
    }
    f
}

/// A released end is not condensed for the bed: the bed would follow the node's rotation, not
/// the member end's, and the end would report a moment. Refused rather than reported wrong.
fn reject_released_bedded_members_2d(input: &WinklerInput) -> Result<(), String> {
    for spring in &input.foundation_springs {
        if spring.kf == 0.0 { continue; }
        if let Some(e) = crate::ordered::values(&input.solver.elements).find(|e| e.id == spring.element_id) {
            if e.elem_type == "frame" && (e.hinge_start || e.hinge_end) {
                return Err(format!(
                    "Element {}: a Winkler foundation on a member with a hinged end is not supported \
                     (the bed would follow the node's rotation, not the member end's). \
                     Put the hinge on a member without foundation.",
                    e.id
                ));
            }
        }
    }
    Ok(())
}

fn reject_released_bedded_members_3d(input: &WinklerInput3D) -> Result<(), String> {
    for spring in &input.foundation_springs {
        if let Some(e) = crate::ordered::values(&input.solver.elements).find(|e| e.id == spring.element_id) {
            if e.elem_type != "frame" { continue; }
            // ky beds (v, θz), released by Mz; kz beds (w, θy), released by My.
            let y = spring.ky.unwrap_or(0.0) != 0.0 && (e.release_mz_start || e.release_mz_end);
            let z = spring.kz.unwrap_or(0.0) != 0.0 && (e.release_my_start || e.release_my_end);
            if y || z {
                return Err(format!(
                    "Element {}: a Winkler foundation on a member whose end releases the bending it acts on \
                     is not supported (the bed would follow the node's rotation, not the member end's). \
                     Put the release on a member without foundation.",
                    e.id
                ));
            }
        }
    }
    Ok(())
}

fn add_foundation_forces_2d(
    forces: &mut [ElementForces],
    input: &WinklerInput,
    node_by_id: &HashMap<usize, &SolverNode>,
    elem_by_id: &HashMap<usize, &SolverElement>,
    dof_num: &DofNumbering,
    u: &[f64],
) {
    for spring in &input.foundation_springs {
        let Some(elem) = elem_by_id.get(&spring.element_id) else { continue };
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }
        let Some(ef) = forces.iter_mut().find(|f| f.element_id == elem.id) else { continue };
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
        let l = (dx * dx + dz * dz).sqrt();
        let t = crate::element::frame_transform_2d(dx / l, dz / l);
        let ug: Vec<f64> = dof_num.element_dofs(elem.node_i, elem.node_j).iter().map(|&d| u[d]).collect();
        let ul = transform_displacement(&ug, &t, 6);
        let v = [ul[1], ul[2], ul[4], ul[5]];
        let f = bed_end_forces(spring.kf, l, v);
        // As compute_internal_forces_2d: v_start = f1, m_start = f2, v_end = −f4, m_end = −f5.
        ef.v_start += f[0];
        ef.m_start += f[1];
        ef.v_end -= f[2];
        ef.m_end -= f[3];
        ef.distributed_loads.extend(bed_reaction_pieces(spring.kf, v, l));
    }
}

fn add_foundation_forces_3d(
    forces: &mut [ElementForces3D],
    input: &WinklerInput3D,
    solver: &SolverInput3D,
    node_by_id: &HashMap<usize, &SolverNode3D>,
    elem_by_id: &HashMap<usize, &SolverElement3D>,
    dof_num: &DofNumbering,
    u: &[f64],
) {
    let dpn = dof_num.dofs_per_node;
    for spring in &input.foundation_springs {
        let Some(elem) = elem_by_id.get(&spring.element_id) else { continue };
        if elem.elem_type == "truss" || elem.elem_type == "cable" { continue; }
        let Some(ef) = forces.iter_mut().find(|f| f.element_id == elem.id) else { continue };
        let (ni, nj) = (node_by_id[&elem.node_i], node_by_id[&elem.node_j]);
        let l = ((nj.x - ni.x).powi(2) + (nj.y - ni.y).powi(2) + (nj.z - ni.z).powi(2)).sqrt();
        let (ex, ey, ez) = crate::element::compute_local_axes_3d(
            ni.x, ni.y, ni.z, nj.x, nj.y, nj.z,
            elem.local_yx, elem.local_yy, elem.local_yz,
            elem.roll_angle, solver.left_hand.unwrap_or(false),
        );
        let n = 2 * dpn;
        let t = if dpn >= 7 {
            crate::element::frame_transform_3d_warping(&ex, &ey, &ez)
        } else {
            crate::element::frame_transform_3d(&ex, &ey, &ez)
        };
        let ug: Vec<f64> = dof_num.element_dofs(elem.node_i, elem.node_j).iter().map(|&d| u[d]).collect();
        let ul = transform_displacement(&ug, &t, n);
        if let Some(ky) = spring.ky.filter(|k| *k != 0.0) {
            // (v, θz), θz = dv/dx. compute_internal_forces_3d: vy_start = f1, mz_start = f5,
            // vy_end = −f(dpn+1), mz_end = −f(dpn+5).
            let v = [ul[1], ul[5], ul[dpn + 1], ul[dpn + 5]];
            let f = bed_end_forces(ky, l, v);
            ef.vy_start += f[0];
            ef.mz_start += f[1];
            ef.vy_end -= f[2];
            ef.mz_end -= f[3];
            ef.distributed_loads_y.extend(bed_reaction_pieces(ky, v, l));
        }
        if let Some(kz) = spring.kz.filter(|k| *k != 0.0) {
            // (w, θy), θy = −dw/dx: the Hermite form takes −θy. compute_internal_forces_3d:
            // vz_start = f2, my_start = f4, vz_end = −f(dpn+2), my_end = −f(dpn+4).
            let w = [ul[2], -ul[4], ul[dpn + 2], -ul[dpn + 4]];
            let f = bed_end_forces(kz, l, w);
            ef.vz_start += f[0];
            ef.my_start -= f[1];
            ef.vz_end -= f[2];
            ef.my_end += f[3];
            ef.distributed_loads_z.extend(bed_reaction_pieces(kz, w, l));
        }
    }
}
